/* 德州真实补码（方案 §3.1 / §3.5）· 门禁反例（2026-11-07）
 *
 * 真值：core/csh_topup.js（额度/守卫/状态转移纯函数）、games/texas/texas.html 内联的
 *       topUpQuote/requestTopUp（AST 抽取后在 vm 里端到端跑）、core/csh_shell.js 的
 *       shell-topup 命令（静态接线断言）。
 * 头号红线：桌面筹码 +N 时 G.buyIn 必须同时 +N，否则 endSession 把补码当盈利发回钱包。
 * 边界：宿主钱包的真实扣款由既有 E18 等经济探针覆盖，本探针不重复实现钱包夹具。
 * stdout 纯 JSON（B12 契约）；--out 可另存逐项结果。
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { parse, walk } = await import(pathToFileURL(root + '/tools/lib/skill_audit.mjs'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const modSource = fs.readFileSync(root + '/core/csh_topup.js', 'utf8');
const htmlSource = fs.readFileSync(root + '/games/texas/texas.html', 'utf8');
const shellSource = fs.readFileSync(root + '/core/csh_shell.js', 'utf8');
const inline = (htmlSource.match(/<script>\s*([\s\S]*?)<\/script>/) || [])[1];
if (!inline) throw Error('texas.html inline script not found');
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const modCode = stripComments(modSource);

const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(!ok && detail !== undefined ? { detail } : {}) });

/* ---------- 1. 纯函数：额度与守卫 ---------- */
function loadPure(source) {
  const ctx = vm.createContext({ window: {}, Object, Array, Math, Number, String, JSON, Error,
    console: { log() {}, warn() {}, error() {} } });
  vm.runInContext(source, ctx);
  return ctx.window.CSHTexasTopUp;
}
const T = loadPure(modSource);
if (!T) throw Error('CSHTexasTopUp not mounted');
check('纯函数模块挂载、版本、冻结', T.VERSION === 1 && T.MAX_PER_TABLE === 2 && Object.isFrozen(T));
const writePattern = /\blocalStorage\s*\.|\bsessionStorage\s*\.|\bindexedDB\b|\bcshWallet\b|\bspendPC\s*\(|\bsettle\s*\(|\bsaveConfig\s*\(|\bCBY\b/;
check('纯函数源码无落盘 / 钱包 / 结算写入路径', !writePattern.test(modCode), (modCode.match(writePattern) || [])[0]);
for (const [n, want] of [[200, 20], [2000, 200], [20000, 2000], [200000, 20000], [0, 1], [-5, 1], [NaN, 1]]) {
  check('带入 ' + n + ' 的 10% 取整单位 = ' + want, T.unitOf(n) === want, T.unitOf(n));
}
const base = { minBuyIn: 200, tableChips: 175, walletBalance: 1000, used: 0,
  handOver: true, sessionOver: false, settled: true, conservationFailed: false, pending: false };
check('正常补码：缺口 25 向上取整到 20 的倍数 → 40', T.quote(base).amount === 40, T.quote(base));
check('额度被钱包余额截断且仍是单位整数倍', T.quote({ ...base, walletBalance: 55 }).amount === 40, T.quote({ ...base, walletBalance: 55 }));
check('余额不足一个单位不提供', T.quote({ ...base, walletBalance: 19 }).ok === false);
check('当前筹码高于补码线不提供', T.quote({ ...base, tableChips: 190 }).ok === false);
check('手牌进行中拒绝', T.quote({ ...base, handOver: false }).reason === '本手进行中');
check('结算未落盘拒绝', T.quote({ ...base, settled: false }).reason === '结算未落盘');
check('本场已结束拒绝', T.quote({ ...base, sessionOver: true }).reason === '本场已结束');
check('守恒校验失败拒绝', T.quote({ ...base, conservationFailed: true }).reason === '结算校验未通过');
check('上一次补码未完成拒绝', T.quote({ ...base, pending: true }).reason === '正在处理上一次补码');
check('本桌第 3 次补码拒绝', T.quote({ ...base, used: 2 }).reason === '本桌补码已达上限');
check('非法输入不崩溃且不放大额度', T.quote(null).ok === false && T.quote({ ...base, minBuyIn: NaN }).ok === false);

/* ---------- 2. 状态转移与账本守恒（头号红线） ---------- */
{
  const state = { chips: 175, buyIn: 200, topUpTotal: 0, topUps: 0 };
  const before = JSON.stringify(state);
  const next = T.apply(state, 40, 200);
  check('补码 +40：桌面筹码与本金基数同步累加',
    !!next && next.chips === 215 && next.buyIn === 240 && next.topUpTotal === 40 && next.topUps === 1, next);
  check('净赢在补码前后恒定（补码不产生也不销毁 CBY）',
    T.netOf(state.chips, state.buyIn) === T.netOf(next.chips, next.buyIn),
    { before: T.netOf(state.chips, state.buyIn), after: T.netOf(next.chips, next.buyIn) });
  check('apply 不修改入参且返回冻结对象', JSON.stringify(state) === before && Object.isFrozen(next));
  const twice = T.apply(next, 20, 200);
  check('本桌第 2 次补码成功', !!twice && twice.topUps === 2 && twice.buyIn === 260);
  check('第 3 次被拒绝', T.apply(twice, 20, 200) === null);
  check('金额非单位整数倍 / 0 / 负数 / 非数值一律拒绝',
    T.apply(state, 21, 200) === null && T.apply(state, 0, 200) === null &&
    T.apply(state, -20, 200) === null && T.apply(state, NaN, 200) === null);
  check('额度基准不随补码累加漂移（unit 仍按原始带入）', T.unitOf(200) === 20 && T.unitOf(240) === 24);
}

/* ---------- 3. 页面端到端（AST 抽取真实函数 + 可控桥） ---------- */
function pageHarness(pureSource, opts) {
  opts = opts || {};
  const ctx = vm.createContext({ window: {}, Object, Array, Math, Number, String, JSON, Error, Date,
    setTimeout(fn) { return 0; }, console: { log() {}, warn() {}, error() {} } });
  vm.runInContext(pureSource, ctx);
  const names = ['topUpApi', 'topUpQuote', 'requestTopUp'];
  walk(parse(inline), n => {
    if (n.type === 'FunctionDeclaration' && names.indexOf(n.id.name) >= 0)
      vm.runInContext(inline.slice(n.range[0], n.range[1]), ctx);
  });
  const toasts = []; let bannerRedraws = 0;
  ctx.toast = (msg) => toasts.push(String(msg));
  ctx.fmt = n => String(n);
  ctx.renderHud = () => {};
  ctx.showHandBanner = () => { bannerRedraws++; };
  ctx.syncBankFromWallet = () => {};
  ctx.career = { bank: { bank: 0 } };
  ctx.G = {
    sessionId: 'sim', handNo: 3, buyIn: 200, topUpTotal: 0, topUps: 0, topUpPending: false,
    over: true, sessionOver: false, conservationFailed: false,
    players: [{ chips: 175 }],
    ledger: { roundId: 'sim:3' },
  };
  ctx.Bridge = {
    active: true,
    snapshot: () => ({ pc: 1000 }),
    topUp: (amount, cb) => opts.topUp ? opts.topUp(amount, cb, ctx) : cb(true, { ok: true, amount: amount }),
  };
  return { ctx, toasts, redraws: () => bannerRedraws };
}
{
  const h = pageHarness(modSource);
  const q = h.ctx.topUpQuote();
  check('页面 topUpQuote 走真实纯函数（额度 40）', q.ok === true && q.amount === 40, q);
  const btn = { disabled: false };
  h.ctx.requestTopUp(btn);
  const G = h.ctx.G;
  check('扣款成功后桌面筹码 +40 且 G.buyIn 同步 +40',
    G.players[0].chips === 215 && G.buyIn === 240 && G.topUps === 1 && G.topUpTotal === 40,
    { chips: G.players[0].chips, buyIn: G.buyIn });
  check('端到端净赢守恒', T.netOf(175, 200) === T.netOf(G.players[0].chips, G.buyIn));
  check('成功后重绘横幅且 pending 已释放', h.redraws() === 1 && G.topUpPending === false);
}
{
  const h = pageHarness(modSource, { topUp: (amount, cb) => cb(false, { ok: false, reason: '余额不足' }) });
  const btn = { disabled: false };
  h.ctx.requestTopUp(btn);
  const G = h.ctx.G;
  check('扣款失败：桌面筹码与本金基数都不变、可重试',
    G.players[0].chips === 175 && G.buyIn === 200 && G.topUps === 0 && G.topUpPending === false && btn.disabled === false);
  check('失败如实提示而不是谎报成功', h.toasts.some(t => /未成功/.test(t)));
}
{
  const h = pageHarness(modSource, { topUp: (amount, cb) => cb(true, { ok: true, amount: amount + 20 }) });
  h.ctx.requestTopUp({ disabled: false });
  check('宿主回包金额不一致时拒绝上桌', h.ctx.G.players[0].chips === 175 && h.ctx.G.buyIn === 200);
}
{
  let stale = null;
  const h = pageHarness(modSource, { topUp: (amount, cb) => { stale = cb; } });
  h.ctx.requestTopUp({ disabled: false });
  h.ctx.G.handNo = 4;   /* 下一手已发，旧回包迟到 */
  stale(true, { ok: true, amount: 40 });
  check('迟到回调不改新一手的筹码与本金', h.ctx.G.players[0].chips === 175 && h.ctx.G.buyIn === 200);
}
{
  const h = pageHarness(modSource);
  h.ctx.G.sessionOver = true;
  check('本场结束后页面不再提供补码', h.ctx.topUpQuote().ok === false);
}
{
  const h = pageHarness(modSource);
  h.ctx.G.ledger.roundId = 'sim:2';
  check('结算未落盘时页面不再提供补码', h.ctx.topUpQuote().ok === false);
}
{
  const h = pageHarness(modSource);
  h.ctx.G.over = false;
  check('手牌进行中页面不再提供补码', h.ctx.topUpQuote().ok === false);
}
{
  const h = pageHarness(modSource);
  h.ctx.G.topUps = 2;
  check('本桌 2 次用尽后页面不再提供补码', h.ctx.topUpQuote().ok === false);
}
{
  const h = pageHarness(modSource);
  h.ctx.Bridge.active = false;
  check('离线调试（无宿主钱包）不提供补码', h.ctx.topUpQuote().ok === false);
}

/* ---------- 4. 静态接线断言 ---------- */
check('Bridge 暴露 shell-topup 通道', /topUp: function \(amount, cb\) \{ call\('shell-topup'/.test(htmlSource));
check('页面把本金基数与筹码一起写回 G', /me\.chips=next\.chips;G\.buyIn=next\.buyIn;G\.topUpTotal=next\.topUpTotal;G\.topUps=next\.topUps;/.test(htmlSource));
check('迟到回调按会话 / 手数 / 结算状态隔离', /G!==session\|\|G\.sessionOver\|\|G\.handNo!==hand\|\|!G\.over/.test(htmlSource));
check('endSession 仍用 G.buyIn 作本金基数', /var buyIn = G\.buyIn \|\| 0;/.test(htmlSource) && /Bridge\.settleSession\(\{\s*key: 'texas', buyIn: buyIn, chips: chips/.test(htmlSource));
check('补码按钮由玩家点击触发，不自动补码', /function \(\) \{ requestTopUp\(topBtn\); \}/.test(htmlSource) && !/requestTopUp\(\);/.test(htmlSource));
check('收工按钮保留（随时可拒绝并离桌）', /mkBtn\('收工'/.test(htmlSource));
check('shell 注册 shell-topup 且列入 mutatesSave 写保护', /"shell-topup"/.test(shellSource) && /"shell-settle-session", "shell-topup"/.test(shellSource));
check('宿主走与开局带入同一条 spend 出账路径', /WT\.wallet\.spend\(amt, "德州补码"\)/.test(shellSource));
check('宿主读回确认，不一致时回补且不 ACK 成功', /WT\.wallet\.pc\(\) !== pcBefore - amt/.test(shellSource) && /WT\.wallet\.add\(amt, "补码读回回补"\)/.test(shellSource));
check('宿主独立校验次数 / 额度 / 单位，不信任页面金额',
  /topUpCount >= 2/.test(shellSource) && /amt % topUnit !== 0 \|\| amt > topUpBaseBuyIn/.test(shellSource));
check('入场重置补码状态（次数是每桌不是每账号）',
  /topUpBaseBuyIn = currentBuyIn; topUpCount = 0; topUpTotal = 0;/.test(shellSource) &&
  /topUpBaseBuyIn = 0; topUpCount = 0; topUpTotal = 0;/.test(shellSource));
check('补码接线片段不改 stake / skill / 发牌', (() => {
  const i = shellSource.indexOf('if (cmd === "shell-topup")');
  const part = i >= 0 ? shellSource.slice(i, i + 1800) : '';
  return part.length > 0 && !/\b(stake|skill)\s*=/.test(part) && !/shuffle|deck/.test(part);
})());

/* ---------- 5. 自检：去掉本金同步累加必须被判红 ---------- */
const anchor = 'buyIn: Math.max(0, Math.floor(Number(s.buyIn) || 0)) + n,';
if (!modSource.includes(anchor)) throw Error('negative-baseline anchor changed');
const badPure = modSource.replace(anchor, 'buyIn: Math.max(0, Math.floor(Number(s.buyIn) || 0)),');
const BT = loadPure(badPure);
const badNext = BT.apply({ chips: 175, buyIn: 200, topUpTotal: 0, topUps: 0 }, 40, 200);
const beforeRows = [];
const bcheck = (name, ok) => beforeRows.push({ name, passed: !!ok });
bcheck('本金基数必须同步累加', badNext.buyIn === 240);
bcheck('净赢守恒（缺了累加就会把补码算成盈利）', BT.netOf(175, 200) === BT.netOf(badNext.chips, badNext.buyIn));
bcheck('额度计算仍正常', BT.quote(base).amount === 40);
const beforeFailed = beforeRows.filter(r => !r.passed).length;
check('改前实现（本金不同步）能被断言集检出 >= 2 条红', beforeFailed >= 2,
  { beforeFailed, red: beforeRows.filter(r => !r.passed).map(r => r.name) });

const result = {
  scope: 'real csh_topup.js pure functions + AST-extracted texas.html topUpQuote/requestTopUp in vm with controllable bridge; static shell wiring; not natural games',
  passed: rows.filter(r => r.passed).length,
  failed: rows.filter(r => !r.passed).length,
  failures: rows.filter(r => !r.passed),
  beforeBaselineFailed: beforeFailed,
  beforeBaselineRed: beforeRows.filter(r => !r.passed).map(r => r.name),
};
const out = arg('--out', null);
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ ...result, rows }, null, 2));
}
console.log(JSON.stringify(result));
if (result.failed) process.exitCode = 1;
