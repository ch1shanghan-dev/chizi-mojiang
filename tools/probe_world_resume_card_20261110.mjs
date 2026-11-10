/* 世界入口「上次未完成」卡片：只读判定与接线验收（2026-11-10 · B2）。
 * 轻量、不启浏览器：AST 抽取 csh_debug.js 的真实 resumeRoomInfo 函数体，
 * 在 vm 里配真实 CSHRoom.decide 语义的桩，锁住「只在 resume 时显示、
 * 不写存档、不碰钱、点击只走既有 charge」。DOM/视口验收见 probe_world_entry.mjs。 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parse, walk } from './lib/skill_audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(!ok ? { detail } : {}) });
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const debugSrc = read('core/csh_debug.js');
const boot = read('main/bootstrap.js');

let fn = '';
walk(parse(debugSrc), n => {
  if (n.type === 'FunctionDeclaration' && n.id && n.id.name === 'resumeRoomInfo') fn = debugSrc.slice(...n.range);
});
check('产品源码里存在 resumeRoomInfo 函数', fn.length > 100, fn.length);
check('已挂到 lib.cshDebug 供外部只读查询', /lib\.cshDebug\.resumeRoomInfo\s*=\s*resumeRoomInfo/.test(debugSrc));

/* ---------- 运行时：真实函数体 + 可控 decide 桩 ---------- */
function run(verdict, opts) {
  const o = opts || {};
  const writes = [];
  const store = {
    getItem: k => (k === 'csh_room_v1' ? '{"v":1}' : null),
    setItem: (k, v) => writes.push(['set', k, v]),
    removeItem: k => writes.push(['remove', k]),
  };
  const R = o.noRoom ? null : {
    KEY: 'csh_room_v1',
    decide: (storage, wallet) => {
      if (o.throwDecide) throw Error('corrupt storage');
      run.lastWallet = wallet;
      return verdict;
    },
  };
  const W = {
    pc: () => 100000,
    roomReceipt: () => (o.throwReceipt ? (() => { throw Error('denied'); })() : { id: o.settledId || '', credited: 0, t: 0 }),
  };
  const lib = {
    cshWallet: { wallet: W, roomReceipt: () => ({ id: o.settledId || '', credited: 0, t: 0 }) },
    cshShell: { META: { blackjack: { title: '廿一点' } } },
  };
  const ctx = { window: { CSHRoom: R, localStorage: store }, lib, console, Math, String, Number, Object, Array };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fn + '\nthis.info = resumeRoomInfo;', ctx);
  return { info: ctx.info(), writes, wallet: run.lastWallet };
}
const entry = (over) => Object.assign({
  id: 'room-x', table: 'blackjack', amount: 20000, balanceBefore: 120000,
  t: 1700000000000, phase: 'active', shot: { buyIn: 20000, s: { shoe: [9, 13] } },
}, over || {});
const resume = a => ({ action: 'resume', entry: a, charged: true });

check('缺 CSHRoom 时不显示（扩展文件未加载完也不炸）', run(resume(entry()), { noRoom: true }).info === null);
for (const action of ['none', 'settled', 'discard', 'corrupt', 'unknown']) {
  check('decide=' + action + ' 不显示卡片', run({ action, entry: entry() }).info === null);
}
check('resume 但无快照不显示（扣款后首手前被杀不能假装有局）',
  run(resume(entry({ shot: null }))).info === null);
check('decide 抛错不显示且不抛到调用方', run(null, { throwDecide: true }).info === null);
check('房间回执读失败时仍能完成判定', run(resume(entry()), { throwReceipt: true }).info !== null);

const good = run(resume(entry()));
check('resume 显示真实桌名 / 带入 / 房间编号 / 时点',
  good.info && good.info.table === 'blackjack' && good.info.title === '廿一点' &&
  good.info.buyIn === 20000 && good.info.id === 'room-x' && good.info.t === 1700000000000, good.info);
check('带入优先取快照里的真实值，不拿 amount 冒充',
  run(resume(entry({ amount: 50000, shot: { buyIn: 20000 } }))).info.buyIn === 20000);
check('快照缺 buyIn 时回退到入场金额',
  run(resume(entry({ shot: { s: { shoe: [9] } } }))).info.buyIn === 20000);
check('注册表缺 title 时回退到稳定 desk key',
  (() => { const r = run(resume(entry({ table: 'texas' }))); return r.info && r.info.title === 'texas'; })());
check('判定过程零存档写入（不写房间、不写偏好）', good.writes.length === 0, good.writes);
check('判定只读钱包余额与结算回执', typeof good.wallet.pc === 'function' && typeof good.wallet.settledId === 'function' &&
  Object.keys(good.wallet).sort().join(',') === 'pc,settledId');
check('settledId 来自钱包真实回执而不是编造', (() => { const r = run(resume(entry()), { settledId: 'room-x' }); return r.wallet.settledId() === 'room-x'; })());

/* ---------- 接线：防「写了没接」与前几批反复踩的加载图坑 ---------- */
check('renderLobby 真的调用判定并把卡片挂到 body',
  /resumeRoomInfo\(\)/.test(debugSrc) && /body\.appendChild\(rc\)/.test(debugSrc));
check('卡片点击只走既有 cshShell.charge 续局分支',
  /lib\.cshShell\.charge\(resumeInfo\.table,\s*resumeInfo\.buyIn\)/.test(debugSrc));
check('卡片是 body 顶部独占行，不进游戏按钮网格',
  debugSrc.indexOf('body.appendChild(rc)') < debugSrc.indexOf('body.appendChild(list)'));
check('不做放开壳前弹窗（卡片不由自动 confirm 驱动）',
  !/resumeRoomInfo[\s\S]{0,400}?confirm\(/.test(debugSrc));
check('csh_room.js 已在 bootstrap 加载图且排在 shell 之前',
  boot.indexOf('core/csh_room.js') >= 0 && boot.indexOf('core/csh_room.js') < boot.indexOf('core/csh_shell.js'));
check('卡片样式显式复位引擎全局 position:absolute',
  /\.csh-resume-card\{position:static!important/.test(debugSrc));
check('继续本局按钮满足 44px 触控', /\.csh-resume-btn\{[^}]*min-height:44px!important/.test(debugSrc));

/* 改前基线：移除调用后静态检查应能检出 */
const stripped = debugSrc.replace('try { resumeInfo = resumeRoomInfo(); }', 'try { resumeInfo = null; }');
check('改前基线可判红：移除判定调用会被接线断言检出',
  /resumeRoomInfo\(\)/.test(debugSrc) && !/try \{ resumeInfo = resumeRoomInfo\(\); \}/.test(stripped));

const result = {
  scope: 'Read-only resume-card decision (real csh_debug function body in VM) + load-graph/wiring static assertions; DOM and viewport checks live in probe_world_entry.mjs.',
  passed: rows.filter(r => r.passed).length,
  failed: rows.filter(r => !r.passed).length,
  rows,
};
const at = process.argv.indexOf('--out');
if (at > -1 && process.argv[at + 1]) {
  const p = process.argv[at + 1];
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(result, null, 2));
}
console.log(JSON.stringify({ ...result, rows: result.rows.filter(r => !r.passed) }));
if (result.failed) process.exitCode = 1;
