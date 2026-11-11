// 功勋上报失败提示（手册 §10-2「数据未保存的漏报」）。
// 真实 core/csh_page.js 在隔离 VM 里加载，真实 transport/call/ack/超时路径；
// 无任何玩家存档、无宿主进程、无产品代码改动。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const pageSrc = read('core/csh_page.js');
const shellSrc = read('core/csh_shell.js');
const walletSrc = read('core/csh_wallet.js');
const pages = {
  'games/blackjack/blackjack.html': read('games/blackjack/blackjack.html'),
  'games/doudizhu/doudizhu.html': read('games/doudizhu/doudizhu.html'),
  'games/uno/uno.html': read('games/uno/uno.html'),
};
const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(ok ? {} : { detail }) });

/* 每个 harness 都是全新的：notice 节点表 / 消息 / 定时器 / 可控时钟各自独立。 */
function harness(src, { recovery = false } = {}) {
  const nodes = new Map(), notices = [], sent = [], events = {}, timers = [];
  let now = 1700000000000;
  const store = {
    getItem: k => (k === 'csh_migrate_recovery' && recovery) ? '{}' : null,
    setItem() {}, removeItem() {},
  };
  const wallet = { saveEpoch: () => 1, saveGuard: { blocked: () => false } };
  const parent = { CSH: { wallet }, localStorage: store, postMessage: m => sent.push(m) };
  const doc = {
    createElement: () => ({ id: '', setAttribute(k, v) { this[k] = v; }, style: {}, parentNode: null, textContent: '' }),
    getElementById: id => nodes.get(id) || null,
    body: { appendChild(n) { n.parentNode = doc.body; nodes.set(n.id, n); notices.push(n); }, removeChild(n) { n.parentNode = null; nodes.delete(n.id); } },
    documentElement: { appendChild() {} },
  };
  const win = {
    document: doc, localStorage: store, innerHeight: 800,
    addEventListener: (n, f) => { events[n] = f; },
    setTimeout: (f, t) => { const timer = { f, t, at: now + t, cancelled: false }; timers.push(timer); return timer; },
    clearTimeout(timer) { if (timer) timer.cancelled = true; },
  };
  win.parent = parent; win.window = win;
  const Clock = function () {};
  Clock.now = () => now;
  const ctx = vm.createContext({
    window: win, document: doc, localStorage: store, console,
    setTimeout: win.setTimeout, clearTimeout: win.clearTimeout,
    Date: Clock, Math, JSON,
  });
  vm.runInContext(src, ctx, { filename: 'csh_page.js' });
  return {
    win, ctx, parent, events, sent, notices, nodes, timers,
    T: win.CSHPage.transport({}),
    advance(ms) { now += ms; },
    blockSaving() { recovery = true; },
    runDueTimers() { for (const t of timers.filter(t => !t.cancelled && t.at <= now)) { t.cancelled = true; t.f(); } },
    ack(ok, data) {
      const m = sent[sent.length - 1];
      events.message({ source: parent, data: { __csh: m.__csh + '-ack', req: m.req, ok: !!ok, data: data == null ? null : data } });
    },
    fireTimers() { const list = timers.splice(0); list.forEach(x => { try { x.f(); } catch (e) {} }); },
  };
}
const texts = h => h.notices.map(n => n.textContent);
const meritTexts = h => texts(h).filter(t => t.indexOf('本局功勋未入账') >= 0);

/* ---------- 1. 真实失败路径 ---------- */
{
  const h = harness(pageSrc);
  let cb = null;
  h.T.callMerit(2, 'win', (ok, data) => { cb = { ok, data }; });
  check('callMerit 发出 shell-merit 且载荷是 n + reason',
    h.sent.length === 1 && h.sent[0].__csh === 'shell-merit' && h.sent[0].n === 2 && h.sent[0].reason === 'win', h.sent[0]);
  h.ack(false, { ok: false, gained: 0, reason: '功勋未保存，请恢复存储后重试' });
  check('宿主写盘失败 → 如实提示「本局功勋未入账」并带上真实 reason',
    meritTexts(h).length === 1 && meritTexts(h)[0].indexOf('功勋未保存，请恢复存储后重试') >= 0, texts(h));
  check('提示条带 role=status（读屏可达）',
    h.notices.length === 1 && h.notices[0].role === 'status', h.notices[0]);
  check('提示条 5 秒后自动移除', h.timers.some(t => t.t === 5000), h.timers.map(t => t.t));
  check('失败时 cb 原样透传 ok/data', cb && cb.ok === false && cb.data.gained === 0, cb);
}
{
  const h = harness(pageSrc);
  h.T.callMerit(1, 'play');
  h.ack(false, null);
  check('无回执原因时只提示尚未确认', meritTexts(h).length === 0 && texts(h)[0].includes('尚未确认'), texts(h));
}
{
  const h = harness(pageSrc);
  h.T.callMerit(2, 'win');
  h.ack(true, { ok: true, gained: 2 });
  check('成功入账不打扰玩家（零提示）', texts(h).length === 0, texts(h));
}
{
  const h = harness(pageSrc);
  h.T.callMerit(1, 'play');
  h.fireTimers();                       // 触发 call 自带的超时回调
  h.ack(true, { ok: true, gained: 1 });
  check('超时后迟到成功不会留下未入账的误报', meritTexts(h).length === 0 && texts(h)[0].includes('尚未确认'), texts(h));
}

/* ---------- 2. 合并与不重复 ---------- */
{
  const h = harness(pageSrc);
  const node = () => h.nodes.get('csh-page-save-notice');
  h.T.callMerit(1, 'play'); h.ack(false, { ok: false, reason: '保存失败' });
  h.T.callMerit(2, 'win'); h.ack(false, { ok: false, reason: '保存失败' });
  h.T.callMerit(5, 'bigwin'); h.ack(false, { ok: false, reason: '保存失败' });
  check('一局连报 3 次全失败只写一条文案（6 秒合并，不刷屏）',
    h.notices.length === 1 && meritTexts(h).length === 1 && node().textContent.indexOf('保存失败') >= 0, texts(h));
  h.T.callMerit(1, 'play'); h.ack(false, { ok: false, reason: '同一窗口内不该改文案' });
  check('同一节流窗口内文案不被后续失败覆盖', node().textContent.indexOf('保存失败') >= 0, node().textContent);
  h.advance(7000);
  h.T.callMerit(1, 'play'); h.ack(false, { ok: false, reason: '仍未保存' });
  check('超过 6 秒后的下一局失败重新提示（复用同一节点、更新文案）',
    node().textContent.indexOf('仍未保存') >= 0 && h.notices.length === 1, node().textContent);
}
{
  const h = harness(pageSrc, { recovery: true });
  h.T.callMerit(1, 'play');
  check('恢复期桥层本地短路：不重复发消息', h.sent.length === 0, h.sent.length);
  check('恢复期只显示通用存档提示，不额外弹「功勋未入账」',
    texts(h).length === 1 && meritTexts(h).length === 0, texts(h));
}

{
  const h = harness(pageSrc);
  h.T.callMerit(2, 'win'); h.ack(false, { reason: '写入被拒绝' });
  h.advance(4700); h.blockSaving(); h.T.call('shell-sign', {}, () => {});
  h.advance(300); h.runDueTimers();
  check('旧提示到期不移除新的存档提示', h.nodes.get('csh-page-save-notice')?.textContent.includes('存档操作'));
  h.advance(4700); h.runDueTimers();
  check('新提示有完整五秒展示期', !h.nodes.has('csh-page-save-notice'));
}

/* ---------- 3. 静态接线（防「写了没接上」） ---------- */
check('共享桥导出 callMerit', /callMerit: callMerit/.test(pageSrc) && /function callMerit\(n, reason, cb\)/.test(pageSrc));
check('callMerit 失败才提示且跳过 recovery',
  /if \(!ok && !\(data && data\.recovery\)\) meritNotice\(data\)/.test(pageSrc));
check('功勋提示与存档提示共用同一节点 id',
  (pageSrc.match(/csh-page-save-notice/g) || []).length >= 2);
for (const [file, src] of Object.entries(pages)) {
  check(file + ' 的 Bridge.merit 走 T.callMerit',
    /merit: function \(n, reason, cb\) \{ return T\.callMerit\(n, reason, cb\); \}/.test(src));
}
check('宿主 shell-merit 确实会 ack 失败（mr.ok !== false）',
  /ackToGame\("shell-merit",[^;]*mr\.ok !== false/.test(shellSrc));
check('钱包 addMerit 失败带可展示的中文 reason',
  /功勋未保存，请恢复存储后重试/.test(walletSrc) && /功勋记录超出保存范围/.test(walletSrc));

/* ---------- 4. 改前基线：旧实现能被检出 ---------- */
{
  const oldBridge = pageSrc.replace('if (!ok && !(data && data.recovery)) meritNotice(data);', '/* removed */');
  check('改前基线：去掉失败提示后，宿主 ack false 应零提示（当前实现必须判红）',
    oldBridge !== pageSrc && (() => {
      const h = harness(oldBridge);
      h.T.callMerit(2, 'win'); h.ack(false, { ok: false, reason: '功勋未保存' });
      return meritTexts(h).length === 0;
    })());
  const oldPages = Object.fromEntries(Object.entries(pages).map(([f, s]) => [f, s.replace(/T\.callMerit\(n, reason, cb\)/g, 'call(\'shell-merit\', { n: n, reason: reason }, cb)')]));
  check('改前基线：三页换回裸 call 后静态接线断言会失败',
    Object.values(oldPages).every(s => !/return T\.callMerit\(n, reason, cb\)/.test(s)));
}

const failed = rows.filter(r => !r.passed);
const result = {
  scope: 'real csh_page.js in isolated VM (transport/call/ack/timeout/notice) + static wiring of three game pages; no player profile, no host process',
  passed: rows.length - failed.length, failed: failed.length, rows,
};
const outArg = process.argv.indexOf('--out');
if (outArg >= 0) {
  const out = process.argv[outArg + 1];
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
}
console.log(JSON.stringify(result, null, 2));
if (failed.length) process.exitCode = 1;
