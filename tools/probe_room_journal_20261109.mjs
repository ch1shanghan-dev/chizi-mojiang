/* 进行中房间的凭据与快照 · 门禁反例（2026-11-09 · 工作包 B）
 *
 * 真值：core/csh_room.js 在 vm 内真实执行；core/csh_migrate.js 的静态登记断言。
 * 核心不变量：
 *   ① prepare 写不进存储就必须拒绝入场（否则「没凭据也扣款」＝必吞钱）；
 *   ② 只有 pc === balanceBefore 才能判「扣款未落盘」并安全丢弃，其余一律不许当没扣过；
 *   ③ 同一时刻只允许一桌；saveSeq 单调，旧页面实例不能覆盖新档；
 *   ④ 快照里的牌值有域和去重，原型污染与超限一律拒绝。
 * stdout 纯 JSON（B12 契约）；--out 另存逐项结果。
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const src = fs.readFileSync(root + '/core/csh_room.js', 'utf8');
const migrate = fs.readFileSync(root + '/core/csh_migrate.js', 'utf8');

function load(source) {
  const ctx = vm.createContext({
    window: {}, Object, Array, JSON, Math, Number, String, Date, Error, isFinite,
    console: { log() {}, warn() {}, error() {} },
  });
  vm.runInContext(source, ctx);
  return ctx.window.CSHRoom;
}
const R = load(src);
if (!R) throw Error('CSHRoom not mounted');

const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(!ok && detail !== undefined ? { detail } : {}) });
const throws = fn => { try { fn(); return false; } catch (e) { return true; } };

/* 可控存储：写失败 / 写回不一致 / 清除失败 / 读失败。 */
function makeStorage() {
  const data = new Map();
  const flags = { failSet: false, mismatch: false, failRemove: false, failGet: false };
  return {
    flags,
    getItem(k) { if (flags.failGet) throw Error('io'); return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { if (flags.failSet) throw Error('quota'); data.set(k, flags.mismatch ? String(v) + 'x' : String(v)); },
    removeItem(k) { if (flags.failRemove) return; data.delete(k); },
    putRaw(v) { if (v == null) data.delete(R.KEY); else data.set(R.KEY, String(v)); },
    raw() { return data.get(R.KEY); },
    keys() { return [...data.keys()]; },
  };
}
const makeWallet = (pc, settledId) => ({ pc: () => pc, settledId: () => settledId || '' });
const ID = 'room-test-000001';
const opts = (extra) => Object.assign({ id: ID, table: 'texas', amount: 50000, balanceBefore: 200000, t: 1762646400000 }, extra);
const shot = () => ({ buyIn: 50000, deck: [1, 5, 9, 13], community: [17, 21], holes: [[33, 34], [35, 36]], pot: 1200 });

/* ---------- 模块边界 ---------- */
check('模块挂载、KEY、版本、导出冻结', R.KEY === 'csh_room_v1' && R.VERSION === 1 && Object.isFrozen(R) &&
  ['read', 'prepare', 'activate', 'save', 'beginSettle', 'markSettled', 'clear', 'decide', 'validateShot'].every(k => typeof R[k] === 'function'));
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
check('模块不写钱、不碰账本、不碰 DOM', !/\baddPC\b|\bspendPC\b|\bwallet\.add\b|\bappendChain\b|\bdocument\b|\bwindow\.document\b/.test(code), code.match(/\b(addPC|spendPC|appendChain|document)\b/));
check('不引入结算与发牌逻辑', !/\bsettle\s*\(|\bshuffle\b|\bnewDeck\b/.test(code));

/* ---------- prepare ---------- */
{
  const s = makeStorage();
  const r = R.prepare(s, opts({ shot: shot() }));
  check('prepare 同步落盘并读回确认', r.ok === true && !r.already && !!s.raw());
  const d = R.read(s);
  check('凭据字段完整（phase/id/amount/balanceBefore/saveSeq）',
    d.phase === 'preparing' && d.id === ID && d.table === 'texas' && d.amount === 50000 &&
    d.balanceBefore === 200000 && d.saveSeq === 0 && d.t === 1762646400000, d && { phase: d.phase, id: d.id });
  check('同 id 幂等，不覆盖', R.prepare(s, opts({ shot: shot() })).already === true);
  check('已有别的未决房间时拒绝（同一时刻只允许一桌）',
    R.prepare(s, opts({ id: 'room-other-000002' })).ok === false);
}
{
  const s = makeStorage(); s.flags.failSet = true;
  const r = R.prepare(s, opts({ shot: shot() }));
  check('★ 存储写不进时必须拒绝入场（不许没凭据就扣款）', r.ok === false && !s.raw(), r);
}
{
  const s = makeStorage(); s.flags.mismatch = true;
  check('写回不一致视为失败', R.prepare(s, opts({ shot: shot() })).ok === false);
}
{
  const s = makeStorage();
  check('非法编号拒绝', R.prepare(s, opts({ id: 'x' })).ok === false);
  check('非法牌桌名拒绝', R.prepare(s, opts({ table: 'TEXAS' })).ok === false);
  check('金额为 0 拒绝', R.prepare(s, opts({ amount: 0 })).ok === false);
  check('余额小于金额拒绝', R.prepare(s, opts({ balanceBefore: 100 })).ok === false);
  check('非安全整数金额拒绝', R.prepare(s, opts({ amount: 1.5 })).ok === false);
}
{
  const s = makeStorage();
  s.putRaw('{broken');
  const r = R.prepare(s, opts({ shot: shot() }));
  check('损坏旧条目不让玩家卡死（清掉后重建）', r.ok === true && r.already === false);
}

/* ---------- activate ---------- */
{
  const s = makeStorage();
  R.prepare(s, opts());
  check('activate 编号不符拒绝', R.activate(s, 'room-wrong-000009', shot()).ok === false);
  const r = R.activate(s, ID, shot());
  check('prepare → active 并写入首份快照', r.ok === true && R.read(s).phase === 'active' && R.read(s).saveSeq === 1);
  check('重复 activate 幂等', R.activate(s, ID, shot()).already === true);
}
{
  const s = makeStorage();
  check('无凭据时 activate 拒绝', R.activate(s, ID, shot()).ok === false);
}

/* ---------- save ---------- */
{
  const s = makeStorage();
  R.prepare(s, opts()); R.activate(s, ID, shot());
  const seq = R.read(s).saveSeq;
  const r = R.save(s, ID, Object.assign(shot(), { pot: 999 }), seq);
  check('save 递增 saveSeq 并替换快照', r.ok === true && r.saveSeq === seq + 1 && R.read(s).shot.pot === 999);
  check('★ 旧实例用过期 expectSeq 覆盖必须失败',
    R.save(s, ID, Object.assign(shot(), { pot: 1 }), seq).ok === false && R.read(s).shot.pot === 999);
  check('不带 expectSeq 时仍可写（页面内单一写者）', R.save(s, ID, Object.assign(shot(), { pot: 7 })).ok === true);
  check('编号不符拒绝', R.save(s, 'room-wrong-000009', shot()).ok === false);
  check('非安全整数 expectSeq 拒绝', R.save(s, ID, shot(), 1.5).ok === false);
}
{
  const s = makeStorage();
  R.prepare(s, opts());
  check('preparing 阶段不许 save（未开桌）', R.save(s, ID, shot()).ok === false);
}

/* ---------- beginSettle / markSettled ---------- */
{
  const s = makeStorage();
  R.prepare(s, opts()); R.activate(s, ID, shot());
  check('beginSettle 进入 settling', R.beginSettle(s, ID).ok === true && R.read(s).phase === 'settling');
  check('settling 阶段 save 被跳过而不是报错', (() => { const r = R.save(s, ID, shot()); return r.ok === true && r.skipped === 'settling'; })());
  check('settling 幂等', R.beginSettle(s, ID).already === true);
  const before = R.read(s).saveSeq;
  check('markSettled 写入 settled 与实得金额', R.markSettled(s, ID, 61000).ok === true &&
    R.read(s).phase === 'settled' && R.read(s).credit === 61000 && R.read(s).saveSeq === before);
  check('markSettled 幂等', R.markSettled(s, ID, 1).already === true && R.read(s).credit === 61000);
  check('settled 之后不再接受快照', R.save(s, ID, shot()).ok === false);
  check('clear 后读为空', R.clear(s).ok !== false && R.read(s) === null);
}
{
  const s = makeStorage();
  R.prepare(s, opts()); R.activate(s, ID, shot());
  check('markSettled 负金额拒绝', R.markSettled(s, ID, -1).ok === false);
  check('编号不符的 markSettled 拒绝', R.markSettled(s, 'room-wrong-000009', 1).ok === false);
}

/* ---------- decide：恢复判定 ---------- */
const putActive = () => { const s = makeStorage(); R.prepare(s, opts()); R.activate(s, ID, shot()); return s; };
check('无凭据 → none', R.decide(makeStorage(), makeWallet(200000)).action === 'none');
{
  const s = putActive();
  check('★ 余额与扣款前完全一致 → discard（扣款未落盘）',
    R.decide(s, makeWallet(200000)).action === 'discard');
  check('★ 余额已扣 → resume', (() => { const r = R.decide(s, makeWallet(150000)); return r.action === 'resume' && r.charged === true; })());
  check('★ 余额因补码再变动也判 resume（不许当没扣过）', (() => {
    const r = R.decide(s, makeWallet(130000)); return r.action === 'resume' && r.charged === false;
  })());
  check('★ 余额变多也判 resume，绝不自行退款', R.decide(s, makeWallet(300000)).action === 'resume');
  check('钱包已记同号结算 → settled', R.decide(s, makeWallet(150000, ID)).action === 'settled');
  check('钱包记录的是别的房间 → 仍按当前房间判定', R.decide(s, makeWallet(150000, 'room-other-111111')).action === 'resume');
  check('余额不可读 → unknown，不猜不退款', R.decide(s, { pc: () => NaN, settledId: () => '' }).action === 'unknown');
  check('钱包缺失 → unknown', R.decide(s, null).action === 'unknown');
}
{
  const s = makeStorage();
  s.putRaw(JSON.stringify({ v: 1, phase: 'settled', id: ID, table: 'texas', amount: 50000, balanceBefore: 200000, saveSeq: 3, t: 1, credit: 61000, shot: null }));
  check('凭据本身已 settled → settled 并给实得', (() => { const r = R.decide(s, makeWallet(211000)); return r.action === 'settled' && r.credit === 61000; })());
}
{
  const s = makeStorage(); s.putRaw('{broken');
  check('损坏凭据 → corrupt（不退款不给钱）', R.decide(s, makeWallet(150000)).action === 'corrupt');
  const s2 = makeStorage();
  s2.putRaw(JSON.stringify({ v: 9, phase: 'active', id: ID, table: 'texas', amount: 1, balanceBefore: 2, saveSeq: 0, t: 0, shot: null }));
  check('未来版本 → corrupt', R.decide(s2, makeWallet(1)).action === 'corrupt');
  const s3 = makeStorage();
  s3.putRaw(JSON.stringify({ v: 1, phase: 'weird', id: ID, table: 'texas', amount: 1, balanceBefore: 2, saveSeq: 0, t: 0, shot: null }));
  check('非法阶段 → corrupt', R.decide(s3, makeWallet(1)).action === 'corrupt');
  const s4 = makeStorage();
  s4.putRaw(JSON.stringify({ v: 1, phase: 'active', id: ID, table: 'texas', amount: 1, balanceBefore: 2, saveSeq: 0, t: 0, shot: { deck: [1, 1] } }));
  check('快照出现重复牌 → corrupt（不许带重牌续局）', R.decide(s4, makeWallet(1)).action === 'corrupt');
}

/* ---------- 快照校验 ---------- */
check('牌值越界拒绝', R.validateShot({ deck: [52] }) !== '');
check('牌堆重复拒绝', R.validateShot({ deck: [3, 3] }) !== '');
check('牌堆超长拒绝', R.validateShot({ deck: new Array(53).fill(1) }) !== '');
check('公共牌超过 5 张拒绝', R.validateShot({ community: [1, 2, 3, 4, 5, 6] }) !== '');
check('手牌超过 2 张拒绝', R.validateShot({ holes: [[1, 2, 3]] }) !== '');
check('原型污染键拒绝', R.validateShot(JSON.parse('{"__proto__":{"x":1}}')) !== '');
check('函数值拒绝', R.validateShot({ f: () => 1 }) !== '');
check('超限体积拒绝', (() => {
  const big = { pad: [] };
  for (let i = 0; i < 60; i++) big.pad.push('x'.repeat(1000));
  return R.validateShot(big) !== '';
})());
check('合法快照通过', R.validateShot(shot()) === '');
check('空快照通过（prepare 阶段允许无快照）', R.validateShot(null) === '');

/* ---------- 静态接线：迁移排除 ---------- */
check('新本机键已登记进 csh_migrate EXCLUDED', /\["csh_room_v1",/.test(migrate));

/* ---------- 静态接线：模块真的进了加载图 ----------
   这一组是补 2026-11-09 挖出来的坑：csh_topup_journal / csh_seat_cooldown / csh_viewport
   三份模块当年都写了、都有反例、都过门禁，但**从未被任何文件加载**——
   功能上线即死，而探针只测模块本身，测不到「有没有人引它」。
   断言口径刻意用「被 import / 被 script 引用」，不用「文本里提到文件名」。 */
const boot = fs.readFileSync(root + '/main/bootstrap.js', 'utf8');
const shellSrc = fs.readFileSync(root + '/core/csh_shell.js', 'utf8');
const texasSrc = fs.readFileSync(root + '/games/texas/texas.html', 'utf8');
const bjSrc = fs.readFileSync(root + '/games/blackjack/blackjack.html', 'utf8');
const bootImports = (name) => new RegExp('import\\s+"[^"]*' + name.replace('.', '\\.') + '"').test(boot);
check('csh_room.js 已进入主宿主加载图', bootImports('csh_room.js'));
check('csh_topup_journal.js 已进入主宿主加载图（此前从未加载，补码恒「事务未就绪」）',
  bootImports('csh_topup_journal.js'));
check('csh_seat_cooldown.js 已进入主宿主加载图（此前从未加载，跨桌冷却恒 null）',
  bootImports('csh_seat_cooldown.js'));
check('csh_viewport.js 已进入主宿主加载图（此前从未加载，零调用点）',
  bootImports('csh_viewport.js'));
check('csh_room 与 csh_topup_journal 排在 csh_shell 之前（shell 取用时必须已挂载）',
  boot.indexOf('csh_room.js') < boot.indexOf('csh_shell.js') &&
  boot.indexOf('csh_topup_journal.js') < boot.indexOf('csh_shell.js'));
check('德州页已引 csh_topup.js（否则补码报价恒失败）',
  /<script src="[^"]*csh_topup\.js"/.test(texasSrc));

/* ---------- 静态接线：宿主侧的房间流程真的接上了 ---------- */
check('入场扣款前会写房间凭据', /RJ\.prepare\(RS/.test(shellSrc) && shellSrc.indexOf('RJ.prepare(RS') < shellSrc.indexOf('wallet.spend(total'));
check('入场扣款后会 activate', /RJ\.activate\(RS,\s*roomKey/.test(shellSrc));
check('结算把房间编号作为 settleId 交给钱包', /settleId:\s*currentRoomId/.test(shellSrc));
check('结算成功后清房间凭据', /finishRoom\(credited\)/.test(shellSrc));
check('关壳不清凭据（关掉不等于退钱）', !/closeShell[\s\S]{0,400}?RJ\.clear/.test(shellSrc));
check('桥命令 shell-room-save / shell-room-state 已注册',
  /"shell-room-save"/.test(shellSrc) && /"shell-room-state"/.test(shellSrc));
check('房间流程按 META.room 开关，未接线的桌不建凭据', /META\[key\][^\n]*\.room/.test(shellSrc));
check('shell-room-save 计入 mutatesSave（存档阻塞时不许写快照）',
  /"shell-room-save",/.test(shellSrc));
check('离开确认文案按是否有房间凭据分叉（不再一律说损失带入）',
  /currentRoomId\s*\n?\s*\?/.test(shellSrc) && /保留牌桌/.test(shellSrc));

/* ---------- 静态接线：廿一点页面真的上报与恢复 ---------- */
const reg = fs.readFileSync(root + '/core/csh_registry.js', 'utf8');
const bjKeys = (bjSrc.match(/var ROOM_KEYS = \[([\s\S]*?)\];/) || [, ''])[1];
check('廿一点已声明 room:true（否则宿主根本不建凭据）',
  /key: "blackjack"[\s\S]{0,400}?room: true/.test(reg));
check('廿一点暴露 roomState / roomSave 两个桥方法',
  /roomState: function/.test(bjSrc) && /roomSave: function/.test(bjSrc));
check('渲染出口调用 saveRoom（动作后自动快照）', /function renderAll\(\)[\s\S]{0,300}?saveRoom\(\)/.test(bjSrc));
check('启动流程会先问宿主是否续局', /Bridge\.roomState\(function/.test(bjSrc) && /applyRoomShot\(/.test(bjSrc));
check('恢复走白名单赋值，不整包 merge 存档',
  !/Object\.assign\([^)]*shot\.s/.test(bjSrc) && /ROOM_KEYS/.test(bjSrc));
check('快照字段含牌靴/手牌/庄家/筹码/阶段（缺一项就不是同一局）',
  ['shoe', 'hands', 'dealer', 'chips', 'phase', 'activeHand'].every(k => new RegExp('[\'"]' + k + '[\'"]').test(bjKeys)));
check('牌靴整副保存（不许截断：截断等于允许重抽）',
  !/shot\.s\.shoe\s*=.*slice|shoe:\s*state\.shoe\.slice\(-/.test(bjSrc));
check('同状态不重复写（渲染频繁，避免刷盘）', /text === lastRoomJson/.test(bjSrc));

/* ---------- 自检：去掉「只有余额不变才丢弃」必须判红 ---------- */
const anchor = "    if (pc === d.balanceBefore) return { action: 'discard', entry: d, reason: '扣款未持久化' };";
if (!src.includes(anchor)) throw Error('negative-baseline anchor changed');
const bad = load(src.replace(anchor, "    return { action: 'discard', entry: d, reason: 'always' };"));
const bRows = [];
const bc = (name, ok) => bRows.push({ name, passed: !!ok });
{
  const s = putActive();
  /* 断言写「不变量」，对坏实现跑应当变红。 */
  bc('已扣款的房间不得判 discard', bad.decide(s, makeWallet(150000)).action !== 'discard');
  bc('补码后的房间不得判 discard', bad.decide(s, makeWallet(130000)).action !== 'discard');
  bc('真值仍判 resume', R.decide(putActive(), makeWallet(150000)).action === 'resume');
}
const beforeFailed = bRows.filter(r => !r.passed).length;
check('改前实现（无条件丢弃）能被断言集检出 >= 1 条红', beforeFailed >= 1, { beforeFailed });

const result = {
  scope: 'real CSHRoom in vm with controllable storage/wallet; prepare/activate/save/beginSettle/markSettled/decide + shot validation + migrate registration; not natural games',
  passed: rows.filter(r => r.passed).length,
  failed: rows.filter(r => !r.passed).length,
  failures: rows.filter(r => !r.passed),
  beforeBaselineFailed: beforeFailed,
  beforeBaselineRed: bRows.filter(r => !r.passed).map(r => r.name),
};
const out = arg('--out', null);
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ ...result, rows }, null, 2));
}
console.log(JSON.stringify(result));
if (result.failed) process.exitCode = 1;
