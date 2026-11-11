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
import { fileURLToPath, pathToFileURL } from 'node:url';

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
check('牌值越界拒绝', R.validateShot({ deck: [64] }) !== '');
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
/* ★ 真实宿主抓到的两个致命误判：牌值域写成 0..51（真值 8..59）、
   以及对多副牌的牌靴做去重。这两条都会让真实牌局快照整批被拒。 */
check('★ 真实牌值域 8..59 全部接受',
  R.validateShot({ s: { shoe: [8, 59, 20], hands: [{ cards: [59, 8] }], dealer: [12] } }) === '');
check('★ 多副牌牌靴允许重复牌值',
  R.validateShot({ s: { shoe: [8, 8, 8, 59, 59], hands: [], dealer: [] } }) === '');
check('牌值越界（>59）仍拒绝',
  R.validateShot({ s: { shoe: [64], hands: [], dealer: [] } }) !== '' &&
  R.validateShot({ deck: [64] }) !== '');
check('德州单副牌堆仍不许重复',
  R.validateShot({ s: { deck: [12, 12], players: [], community: [] } }) !== '');

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
const ddzSrc = fs.readFileSync(root + '/games/doudizhu/doudizhu.html', 'utf8');
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
check('三桌共用宿主确认队列', [bjSrc, texasSrc, ddzSrc].every(s => /CSHPage\.roomWriter\(Bridge\.roomSave\)/.test(s)));
check('德州已暴露 __TX 取证面（roomShot/startGame/getRoomDiag）',
  /window\.__TX\s*=/.test(texasSrc) && /roomShot: roomShot/.test(texasSrc) && /startGame: startGame/.test(texasSrc));
check('两桌都有 bootDone 闸门（探针必须等启动回调跑完再开一手）',
  /bootDone = true/.test(bjSrc) && /bootDone = true/.test(texasSrc) &&
  /bootDone: bootDone/.test(bjSrc) && /bootDone: bootDone/.test(texasSrc));
check('德州已声明 room:true', /key: "texas"[\s\S]{0,400}?room: true/.test(reg));
check('斗地主已声明 room:true', /key: "doudizhu"[\s\S]{0,800}?room: true/.test(reg));
check('斗地主已暴露 __DDZ 取证面与 bootDone',
  /window\.__DDZ\s*=/.test(ddzSrc) && /bootDone: bootDone/.test(ddzSrc));
check('斗地主渲染出口调用 saveRoom', /function renderAll\(dealAnim\)[\s\S]{0,400}?saveRoom\(\)/.test(ddzSrc));
check('斗地主快照保存同桌席位（结算阵营校验要对照原桌）', /s\.seats = Bridge\.opponents\(\)/.test(ddzSrc));
check('宿主续局时按快照席位重建 TABLE_WORLD，不重新抽人',
  /roomResumeSeats/.test(shellSrc) && /roomResumeSeats\.map\(/.test(shellSrc));
/* 斗地主的牌是对象 {id,rank,suit}，不是整数；快照校验必须放行这种形态。 */
check('★ 斗地主形态（牌对象 + 同桌席位）通过快照校验',
  R.validateShot({ s: { hands: [[{ id: 1, rank: 3, suit: 0 }], [], []], bottom: [{ id: 53, rank: 16, suit: -1 }],
    seats: [{ id: 'csh_ddz_a', stake: 600, persona: 'rock' }], selIds: [1, 2] } }) === '');

const pageBridge = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(root, 'core/csh_page.js'), 'utf8'), pageBridge);
const makeWriter = send => pageBridge.window.CSHPage.roomWriter(send);
{
  const calls = [], writer = makeWriter((shot, seq, ack) => calls.push({ shot, seq, ack }));
  writer.seed({ saveSeq: 4, shot: { phase: 'deal' } });
  writer.push({ phase: 'play' });
  writer.push({ phase: 'dealer', holeHidden: false });
  check('快照待确认时不发送下一笔', calls.length === 1 && calls[0].seq === 4);
  calls[0].ack(true, { saveSeq: 5 });
  check('确认后使用新序号保存庄家阶段', calls.length === 2 && calls[1].seq === 5 && calls[1].shot.holeHidden === false);
  calls[1].ack(false, null);
  check('超时仅重发同一快照和序号', calls.length === 3 && calls[2].seq === 5 && calls[2].shot.phase === 'dealer');
  calls[2].ack(true, { saveSeq: 6 });
  writer.push({ phase: 'dealer', holeHidden: false });
  check('已确认快照重复渲染不会刷盘', calls.length === 3);
  writer.push({ phase: 'over', chips: 100 });
  calls[3].ack(false, { reason: 'write denied' });
  writer.push({ phase: 'over', chips: 100 });
  check('显式拒写后可再次保存相同状态', calls.length === 5 && calls[4].seq === 6);
}
{
  const s = putActive(), seq = R.read(s).saveSeq;
  const payload = Object.assign(shot(), { pot: 91 });
  const first = R.save(s, ID, payload, seq), repeated = R.save(s, ID, payload, seq);
  check('确认丢失时重发不递增已保存序号', first.ok && repeated.ok && first.saveSeq === repeated.saveSeq && R.read(s).saveSeq === seq + 1);
  check('相同旧序号的不同内容仍拒绝', !R.save(s, ID, Object.assign(shot(), { pot: 99 }), seq).ok && R.read(s).shot.pot === 91);
}

/* ---------- 廿一点快照往返：抽取真实页面函数在 vm 里跑 ----------
   这是整套恢复里最容易出静默错的一环：白名单少一个字段，续局就少一张牌/少一段筹码，
   而且不会报错。所以必须做「存一份 → 重建 → 逐字段比对」。 */
{
  const { parse, walk } = await import(pathToFileURL(root + '/tools/lib/skill_audit.mjs').href);
  const bjInline = (bjSrc.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/) || [])[1];
  check('廿一点内联脚本可抽取', !!bjInline && bjInline.length > 1000);
  const keysArr = (bjSrc.match(/var ROOM_KEYS = \[([\s\S]*?)\];/) || [])[1];
  check('ROOM_KEYS 可抽取', !!keysArr);

  function bjHarness() {
    const ctx = vm.createContext({
      window: {}, Object, Array, JSON, Math, Number, String, Error, Date, isFinite,
      console: { log() {}, warn() {}, error() {} },
    });
    vm.runInContext('var ROOM_KEYS = [' + keysArr + '];', ctx);
    const names = ['roomShot', 'applyRoomShot', 'saveRoom'];
    walk(parse(bjInline), n => {
      if (n.type === 'FunctionDeclaration' && names.indexOf(n.id.name) >= 0)
        vm.runInContext(bjInline.slice(n.range[0], n.range[1]), ctx);
    });
    ctx.Bridge = { active: true, buyIn: () => 200000, roomSave: () => {}, roomState: () => {} };
    ctx.dealerSeat = { id: 'csh_testdealer', name: '测试庄', stake: 400000, mult: 2 };
    ctx.newState = () => ({ hands: [], dealer: [], shoe: [], chips: 200000, phase: 'deal', activeHand: 0 });
    ctx.state = null;
    ctx.bootDone = true;
    ctx.roomWriter = makeWriter((...args) => ctx.Bridge.roomSave(...args));
    return ctx;
  }

  /* 造一副「已打到一半」的真实形态：8 副牌剩 300 张、两手、庄家两张、暗牌未开。 */
  function sampleState() {
    const shoe = [];
    for (let i = 0; i < 300; i++) shoe.push(8 + (i % 52)); /* 真实牌值域 8..59，多副牌必有重复 */
    /* 牌靴允许重复（真牌靴就是重复的），但不允许越界 */
    return {
      shoe: shoe.reverse(), shoeSize: 416,
      tier: { name: '豪赌庄', min: 2000, decks: 4, h17: false, bjPay: 1.5, note: 'x' },
      hand: 7, chips: 183500, dealerBank: 390000, dealerBankInit: 400000,
      dealerBust: false, tableTotal: 583500, streak: 2, bet: 10000,
      hands: [
        { cards: [8, 21, 33], wager: 10000, fromSplit: false, done: false },
        { cards: [11, 44], wager: 10000, fromSplit: true, doubled: true },
      ],
      dealer: [17, 30], phase: 'play', activeHand: 1, insuranceBet: 0,
      holeHidden: true, roundDelta: -2500, insDelta: 0,
      publicShoe: { total: 300, tens: 96, pendingHole: true },
    };
  }

  const ctx = bjHarness();
  ctx.state = sampleState();
  const shot = ctx.roomShot();
  check('快照能生成且带牌桌标记 v', !!shot && shot.v === 1 && shot.s && shot.buyIn === 200000);
  check('快照记录了庄家席身份（结算要按原庄家记账）',
    !!shot.dealer && shot.dealer.id === 'csh_testdealer' && shot.dealer.stake === 400000);
  check('快照不含白名单外的字段（往台面塞私货的入口已封）',
    Object.keys(shot.s).every(k => ctx.ROOM_KEYS.indexOf(k) >= 0), Object.keys(shot.s));

  /* 关键：过一遍 JSON（模拟真正落盘再读回），再做逐字段比对 */
  const wire = JSON.parse(JSON.stringify(shot));
  const ctx2 = bjHarness();
  const applied = ctx2.applyRoomShot(wire);
  check('重建成功', applied === true);
  const before = ctx.state, after = ctx2.state;
  const diff = ctx.ROOM_KEYS.filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  check('★ 往返后 20 个字段逐一相等（少一个字段就是续局少一张牌）', diff.length === 0, diff);
  check('牌靴整副往返（长度与内容都不许变）',
    after.shoe.length === 300 && JSON.stringify(after.shoe) === JSON.stringify(before.shoe));
  check('手牌按路往返，含分牌与加倍标记',
    after.hands.length === 2 && after.hands[1].doubled === true && after.hands[1].cards.length === 2);
  check('庄家席身份一并恢复', ctx2.dealerSeat && ctx2.dealerSeat.id === 'csh_testdealer');
  check('阶段与当前手往返（不然续局会从头要牌）',
    after.phase === 'play' && after.activeHand === 1 && after.holeHidden === true);

  /* 反例：不接受脏快照 */
  const c3 = bjHarness();
  check('无 s 的快照拒绝恢复', c3.applyRoomShot({ v: 1 }) === false);
  check('shoe 为空的快照拒绝恢复', c3.applyRoomShot({ v: 1, s: { shoe: [], hands: [], dealer: [] } }) === false);
  check('hands 不是数组拒绝恢复', c3.applyRoomShot({ v: 1, s: { shoe: [1], hands: 'x', dealer: [] } }) === false);
  const c4 = bjHarness();
  c4.applyRoomShot({ v: 1, s: { shoe: [1, 2], hands: [], dealer: [], 注入: 'x', __proto__: { evil: 1 } } });
  check('白名单外的键不会落到 state 上（注入无效）',
    c4.state && c4.state['注入'] === undefined && c4.state.evil === undefined);

  /* 去重：同状态第二次 saveRoom 不再上报 */
  const c5 = bjHarness();
  let saves = 0;
  c5.Bridge.roomSave = (_shot, _seq, ack) => { saves++; ack(true, { saveSeq: saves }); };
  c5.state = sampleState();
  c5.saveRoom(); c5.saveRoom(); c5.saveRoom();
  check('同状态只上报一次（渲染频繁也不刷盘）', saves === 1, saves);
  c5.state.chips = 1;
  c5.saveRoom();
  check('状态真变了才再上报', saves === 2, saves);
}

/* ---------- 德州快照往返 ----------
   德州比廿一点多一层风险：底牌分属各家，牌堆必须无重复，且**恢复后绝不能变成免费重开**
   （entryUsed 必须置位，否则同一次带入可以无限续命）。 */
{
  const { parse, walk } = await import(pathToFileURL(root + '/tools/lib/skill_audit.mjs').href);
  const txInline = (texasSrc.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/) || [])[1];
  check('德州内联脚本可抽取', !!txInline && txInline.length > 1000);
  const txKeys = (texasSrc.match(/var ROOM_KEYS = \[([\s\S]*?)\];/) || [])[1];
  check('德州 ROOM_KEYS 可抽取', !!txKeys);

  function txHarness() {
    const ctx = vm.createContext({
      window: {}, Object, Array, JSON, Math, Number, String, Error, Date, isFinite,
      console: { log() {}, warn() {}, error() {} },
    });
    vm.runInContext('var ROOM_KEYS = [' + txKeys + '];', ctx);
    const names = ['roomShotPlayer', 'roomShot', 'saveRoom', 'applyRoomShot'];
    walk(parse(txInline), n => {
      if (n.type === 'FunctionDeclaration' && names.indexOf(n.id.name) >= 0)
        vm.runInContext(txInline.slice(n.range[0], n.range[1]), ctx);
    });
    ctx.Bridge = { active: true, roomSave: () => {}, roomState: () => {} };
    ctx.entryUsed = false;
    ctx.bootDone = true;
    ctx.roomWriter = makeWriter((...args) => ctx.Bridge.roomSave(...args));
    ctx.G = null;
    /* makeSession 会去抽世界席位，恢复路径里它的产物会被白名单整体覆盖 —— 桩掉即可。 */
    ctx.makeSession = () => ({ players: [], deck: [], community: [], buyIn: 0 });
    return ctx;
  }

  function sampleG() {
    return {
      n: 4, aiCount: 3, buyIn: 50000, sessionId: 'texas-sim-1', rake: 0.005,
      seats: [{ id: 'csh_a', stake: 60000 }, { id: 'csh_b', stake: 75000 }, { id: 'csh_c', stake: 40000 }],
      gamble: false, handNo: 9, dealer: 2, sb: 200, bb: 400, level: 1,
      community: [12, 25, 38], pot: 8400, currentBet: 1600, minRaise: 1600, toAct: 0,
      street: 'turn', deck: [12, 17, 23, 31, 39, 47, 52, 58], revealAll: false, winners: [],
      over: false, sessionOver: false, winStreak: 2, minChips: 22000, noFoldStreak: 3,
      handCount: 9, topUps: 0, topUpTotal: 0, aiStakeTotal: 175000,
      ledger: { roundId: 'texas-sim-1:9', layers: [] }, conservationFailed: false,
      players: [
        { id: 0, isHuman: true, name: '池子', surname: '池', chips: 43600, bet: 0, contrib: 800,
          hole: [14, 31], folded: false, allin: false, acted: false, out: false, persona: null,
          tag: '', reveal: true, skill: 1 },
        { id: 1, isHuman: false, name: '甲', surname: '甲', chips: 58000, bet: 0, contrib: 1600,
          hole: [10, 22], folded: false, allin: false, acted: true, out: false, persona: 'rock',
          tag: '稳', reveal: false, skill: 0.8, worldState: { mood: 1, fatigue: 0, form: 2 },
          worldId: 'csh_a', mult: 1, seed: 'csh_a' },
        { id: 2, isHuman: false, name: '乙', surname: '乙', chips: 71000, bet: 0, contrib: 0,
          hole: [9, 45], folded: true, allin: false, acted: true, out: false, persona: 'trapper',
          tag: '诈', reveal: false, skill: 0.7, worldState: null, worldId: 'csh_b', mult: 1, seed: 'csh_b' },
        { id: 3, isHuman: false, name: '丙', surname: '丙', chips: 38000, bet: 0, contrib: 0,
          hole: [], folded: true, allin: false, acted: true, out: false, persona: 'maniac',
          tag: '莽', reveal: false, skill: 0.6, worldState: null, worldId: 'csh_c', mult: 1, seed: 'csh_c' },
      ],
    };
  }

  const t1 = txHarness();
  t1.G = sampleG();
  const shot = t1.roomShot();
  check('德州快照生成且带牌桌标记', !!shot && shot.v === 1 && shot.s && shot.buyIn === 50000);
  check('快照只含白名单字段（players 单独映射）',
    Object.keys(shot.s).every(k => t1.ROOM_KEYS.indexOf(k) >= 0 || k === 'players'), Object.keys(shot.s));

  const wire = JSON.parse(JSON.stringify(shot));
  const t2 = txHarness();
  check('德州重建成功', t2.applyRoomShot(wire) === true);
  check('★ 恢复后 entryUsed 置位（否则同一次带入可以无限续命）', t2.entryUsed === true);
  const diff = t2.ROOM_KEYS.filter(k => JSON.stringify(t1.G[k]) !== JSON.stringify(t2.G[k]));
  check('★ 往返后全部字段相等（含牌堆/公共牌/行动权/盲注档）', diff.length === 0, diff);
  check('牌堆整副往返、无重复',
    t2.G.deck.length === 8 && new Set(t2.G.deck).size === 8 &&
    JSON.stringify(t2.G.deck) === JSON.stringify(t1.G.deck));
  check('各家底牌往返，弃牌者的空底牌保留为空',
    t2.G.players[0].hole.length === 2 && t2.G.players[3].hole.length === 0);
  check('世界身份随座位往返（结算要按原 AI 记账）',
    t2.G.players[1].worldId === 'csh_a' && t2.G.players[1].skill === 0.8);
  check('玩家筹码与底池往返（差一分就是吞钱/造钱）',
    t2.G.players[0].chips === 43600 && t2.G.pot === 8400 && t2.G.currentBet === 1600);

  const t3 = txHarness();
  check('无 s 拒绝', t3.applyRoomShot({ v: 1 }) === false);
  check('底牌不是数组拒绝', t3.applyRoomShot({ v: 1, s: { players: 'x', deck: [], community: [] } }) === false);
  check('座位少于 2 拒绝', t3.applyRoomShot({ v: 1, s: { players: [], deck: [], community: [] } }) === false);
  check('牌堆不是数组拒绝', t3.applyRoomShot({ v: 1, s: { players: [{}, {}], deck: null, community: [] } }) === false);

  const t4 = txHarness();
  let saves = 0;
  t4.Bridge.roomSave = () => { saves++; };
  t4.G = sampleG();
  t4.saveRoom(); t4.saveRoom();
  check('德州同状态只上报一次', saves === 1, saves);
  t4.G.sessionOver = true;
  t4.saveRoom();
  check('收工后不再上报（等结算清凭据）', saves === 1, saves);
}

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
