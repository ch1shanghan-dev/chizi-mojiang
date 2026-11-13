/* 成就反馈错误边界（2026-11-08）：真实 csh_achievement_feedback.js 在隔离 VM 里，
   注入损坏存档 / 存储异常 / DOM 异常 / 宿主回调异常，验证「不抛出、不弹原生 Alert、
   公开方法仍返回同类型安全值」。目标是不让宿主把出错模块源码弹成原生 Alert。
   不改产品源码；内置改前基线（去掉 bootArchive 与 guarded 包装）必须被检出。 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'core/csh_achievement_feedback.js'), 'utf8').replace(/^export /gm, '');
const uikit = fs.readFileSync(path.join(root, 'core/csh_uikit.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'main/config.js'), 'utf8');
const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, detail: ok ? undefined : detail });
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };

function node(tag) {
  const n = {
    tagName: tag, id: '', className: '', textContent: '', type: '', title: '', value: '', checked: false,
    hidden: false, disabled: false, dataset: {}, style: {}, children: [], attrs: {}, listeners: {},
    isConnected: true, parentNode: null, scrollTop: 0, relatedTarget: null,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    append(...cs) { cs.forEach(c => this.appendChild(c)); },
    replaceChildren(...cs) { this.children = []; cs.forEach(c => this.appendChild(c)); },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k]; },
    removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(k, fn) { (this.listeners[k] = this.listeners[k] || []).push(fn); },
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getClientRects() { return [{}]; },
    contains() { return false; },
    focus() {}, remove() { this.isConnected = false; },
    click() { (this.listeners.click || []).slice().forEach(fn => fn({ target: this })); }
  };
  return n;
}

function harness(opts) {
  opts = opts || {};
  const warnings = [], alerts = [], reports = [], errors = [], timers = new Map();
  /* owner 必须是稳定引用：真实宿主返回 lib.cshWallet 本身；每次新建对象会让 scope()
      反复判定「换档」并递归 tell()->render()，那是夹具错误不是产品行为。 */
  const scopeOwner = {};
  let stamp = 100000, serial = 0;
  const store = new Map(opts.store || []);
  const storage = {
    getItem(k) { if (opts.getItemThrows) throw Error('storage blocked'); return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { if (opts.setItemThrows) throw Error('quota'); store.set(k, String(v)); },
    removeItem(k) { if (opts.removeItemThrows) throw Error('remove blocked'); store.delete(k); }
  };
  const doc = {
    createElement(tag) { if (opts.createElementThrows) throw Error('createElement blocked'); return node(tag); },
    createElementNS(ns, tag) { if (opts.createElementNSThrows) throw Error('createElementNS blocked'); return node(tag); },
    createTextNode(text) { const n = node('#text'); n.textContent = text; return n; },
    getElementById(id) { if (opts.getElementByIdThrows) throw Error('getElementById blocked'); return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener(k, fn, cap) { if (opts.docAddThrows) throw Error('doc addEventListener blocked'); (this._l = this._l || {})[k] = fn; },
    removeEventListener() { if (opts.docRemoveThrows) throw Error('doc removeEventListener blocked'); },
    activeElement: null, body: node('body'), documentElement: node('html'), hidden: false
  };
  if (opts.documentElementThrows) doc.documentElement.appendChild = () => { throw Error('appendChild blocked'); };
  if (opts.hiddenThrows) Object.defineProperty(doc, 'hidden', { get() { throw Error('hidden blocked'); } });
  const win = {
    matchMedia() { if (opts.matchMediaThrows) throw Error('matchMedia blocked'); return { matches: false }; },
    setTimeout(fn, ms) { if (opts.winTimeoutThrows) throw Error('setTimeout blocked'); const id = ++serial; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(k, fn) { if (opts.winAddThrows) throw Error('win addEventListener blocked'); (this._l = this._l || {})[k] = fn; },
    removeEventListener() {},
    alert(msg) { alerts.push(String(msg)); }
  };
  const env = {
    document: doc, window: win, storage, z: 9997, modal: 9999,
    scope() { if (opts.scopeThrows) throw Error('scope blocked'); return { owner: scopeOwner, epoch: 1, blocked: false }; },
    now() { return stamp; },
    setTimeout(fn, ms) { const id = ++serial; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    sound() { if (opts.soundThrows) throw Error('sound blocked'); },
    onError(where, e) { reports.push(String(where)); errors.push(String(where) + ': ' + (e && e.message)); }
  };
  const ctx = vm.createContext({
    console: { log() {}, warn(...a) { warnings.push(String(a[0] || '')); }, error() {} },
    setTimeout(fn) { const id = ++serial; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    Date, Math, JSON, Set, Map, Object, Array, Number, String, Boolean, Error, Promise
  });
  const code = (opts.source || source) + '\nglobalThis.__factory = createAchievementFeedback;';
  vm.runInContext(code, ctx, { timeout: 3000 });
  return {
    ctx, env, doc, win, store, warnings, alerts, reports, errors, timers,
    factory: () => ctx.__factory(env),
    fire(k, e) { const fn = (doc._l || {})[k] || (win._l || {})[k]; if (fn) fn(e || { key: 'Escape', preventDefault() {}, stopImmediatePropagation() {} }); },
    flushTimers() { const todo = [...timers.values()]; timers.clear(); for (const fn of todo) fn(); }
  };
}

const PUBLIC = ['show', 'hold', 'review', 'archive', 'archiveStatus', 'markRead', 'skip', 'preferences', 'setPreferences', 'status', 'destroy'];
function exercise(h, label) {
  let caught = null, api = null;
  try { api = h.factory(); } catch (e) { caught = e; }
  check(label + '：构造不抛异常', caught === null, caught && caught.message);
  if (!api) return;
  check(label + '：公开方法齐全', PUBLIC.every(k => typeof api[k] === 'function'), Object.keys(api));
  let bad = null;
  try {
    api.show([{ id: 'x1', title: '成就一', description: '展示记录', rare: 1, pc: 0, merit: 0 }]);
    api.hold('probe', true); api.hold('probe', false);
    api.review(); api.archive();
    api.markRead('pool:unlock:x1', false);
    api.preferences(); api.setPreferences({ reduced: true });
    api.status(); api.skip();
    const st = api.archiveStatus();
    if (!st || typeof st.rows !== 'number' || typeof st.error !== 'string') bad = 'archiveStatus 形状异常';
    const pf = api.preferences();
    if (!pf || typeof pf.enabled !== 'boolean') bad = bad || 'preferences 形状异常';
    const sp = api.setPreferences({ sound: false });
    if (!sp || typeof sp.ok !== 'boolean') bad = bad || 'setPreferences 形状异常';
    const ss = api.status();
    if (!ss || !Array.isArray(ss.history)) bad = bad || 'status 形状异常';
    h.fire('keydown'); h.fire('visibilitychange', {}); h.fire('pagehide', { persisted: true }); h.fire('pageshow', { persisted: true });
    h.flushTimers();
    api.destroy();
  } catch (e) { bad = e && e.message; }
  check(label + '：全部公开方法与事件回调均不抛、返回值形状正确', bad === null, bad);
  check(label + '：不调用原生 alert', h.alerts.length === 0, h.alerts);
}

/* ---------- 1. 正常路径 ---------- */
{
  const h = harness();
  exercise(h, '正常环境');
  check('正常环境零降级报告', h.reports.length === 0, h.errors);
}

/* ---------- 2. 存储与 DOM 故障注入 ---------- */
const faults = [
  ['storage.getItem 抛错', { getItemThrows: true }],
  ['storage.setItem 抛错', { setItemThrows: true }],
  ['storage.removeItem 抛错', { removeItemThrows: true }],
  ['doc.createElement 抛错', { createElementThrows: true }],
  ['doc.createElementNS 抛错', { createElementNSThrows: true }],
  ['doc.getElementById 抛错', { getElementByIdThrows: true }],
  ['documentElement.appendChild 抛错', { documentElementThrows: true }],
  ['doc.addEventListener 抛错', { docAddThrows: true }],
  ['doc.removeEventListener 抛错', { docRemoveThrows: true }],
  ['win.addEventListener 抛错', { winAddThrows: true }],
  ['win.setTimeout 抛错', { winTimeoutThrows: true }],
  ['win.matchMedia 抛错', { matchMediaThrows: true }],
  ['env.scope 抛错', { scopeThrows: true }],
  ['env.sound 抛错', { soundThrows: true }],
  ['doc.hidden 读取抛错（事件与定时器回调）', { hiddenThrows: true }]
];
for (const [name, opts] of faults) exercise(harness(opts), name);

/* ---------- 3. 损坏存档形态 ---------- */
const KEY = 'csh_achievement_archive_v1';
const badArchives = [
  ['非法 JSON', '{not json', true],
  ['版本不符', JSON.stringify({ v: 2, rows: [] }), true],
  ['rows 非数组', JSON.stringify({ v: 1, rows: 'x' }), true],
  ['null 顶层', 'null', true],
  ['数组顶层', '[]', true],
  /* 下面两条结构本身合法，模块按设计静默过滤脏行 / 忽略未知键，不该报「损坏」 */
  ['原型键污染', '{"v":1,"rows":[],"__proto__":{"polluted":true}}', false],
  ['超长行与畸形条目', JSON.stringify({ v: 1, rows: Array.from({ length: 300 }, (_, i) => i % 2 ? null : { id: 'r' + i, title: 'T'.repeat(500), time: 'bad' }) }), false]
];
for (const [name, raw, damaged] of badArchives) {
  const h = harness({ store: [[KEY, raw]] });
  exercise(h, '损坏存档/' + name);
  /* exercise 里的 show() 会重写归档，检查初始降级必须用全新夹具，否则读到的是刚写入的合法档 */
  const fresh = harness({ store: [[KEY, raw]] });
  let api = null, err = null;
  try { api = fresh.factory(); } catch (e) { err = e; }
  const st = api ? api.archiveStatus() : null;
  check('损坏存档/' + name + '：降级为空归档', !err && st && st.rows === 0, err && err.message);
  if (damaged) check('损坏存档/' + name + '：提示可读', !!st && /异常|不可用/.test(st.error), st && st.error);
  else check('损坏存档/' + name + '：结构合法不误报损坏', !!st && st.error === '', st && st.error);
  check('损坏存档/' + name + '：原型未被污染', ({}).polluted === undefined);
}

/* ---------- 4. 静态接线：双层防御与短文本兜底 ---------- */
{
  check('反馈模块用 bootArchive 包裹初始化', source.includes('function bootArchive()') && source.includes('\n    bootArchive();'));
  check('反馈模块事件与定时器都走 safeHandler/safely',
    (source.match(/safeHandler\(/g) || []).length >= 5 && source.includes("safely('listeners'") && source.includes("safely('visibility'"));
  check('反馈模块公开方法统一 guarded 返回', source.includes('return guarded;') && source.includes("report('api.'+k,e)"));
  check('反馈模块不弹原生 alert、不写奖励', !/\balert\s*\(/.test(source.replace(/\/\*[\s\S]*?\*\//g, '')));
  check('UIKit 有 inertAchievementUI 且构造被 try/catch 包裹',
    uikit.includes('function inertAchievementUI()') && /try\s*\{\s*_achievementUI\s*=\s*createAchievementFeedback/.test(uikit));
  check('UIKit 的 achievementState/Hold/Skip 都有兜底',
    /achievementState: function\(\)\{try\{/.test(uikit) && /achievementHold: function\([^)]*\)\{try\{/.test(uikit) && /achievementSkip: function\(\)\{try\{/.test(uikit));
  check('原生 alert 兜底只传短文本，不拼源码', /function notice\(msg\)[\s\S]{0,240}window\.alert\(msg\)/.test(config) && !/notice\([^)]*stack|sourceURL|lineNumber/.test(config));
}

/* ---------- 5. 改前基线：断言必须能抓到「没有错误边界」 ---------- */
{
  const before = source.replace('\n    bootArchive();', '\n    archive=readArchive();renderInbox();').replace('return guarded;', 'return api;');
  check('改前基线源码确实换了实现', before !== source && before.includes('archive=readArchive();renderInbox();') && before.includes('return api;'));
  const raw = JSON.stringify({ v: 1, rows: [{ id: 'r1', title: '成就', time: 1, kind: 'unlock', source: 'pool', rare: 1, pc: 0, merit: 0, read: false }] });
  const h = harness({ source: before, store: [[KEY, raw]], documentElementThrows: true });
  let threw = null;
  try { h.factory(); } catch (e) { threw = e; }
  check('改前基线：DOM 异常会冒到调用方（宿主弹源码的成因）', threw !== null, threw && threw.message);
  const now = harness({ store: [[KEY, raw]], documentElementThrows: true });
  let nowThrew = null, api = null, opened = null;
  try { api = now.factory(); opened = api.archive(); } catch (e) { nowThrew = e; }
  check('当前实现：启动保留记录，主动打开失败后释放暂停', nowThrew === null && api && opened === false &&
    api.archiveStatus().rows === 1 && !api.status().paused, nowThrew && nowThrew.message);
  check('当前实现：打开失败被记录且未弹原生 alert', now.reports.includes('review.open') && now.alerts.length === 0, now.reports);
}

const result = {
  scope: 'real csh_achievement_feedback.js in isolated VM with injected storage/DOM/host faults; no browser, no wallet',
  passed: rows.filter(r => r.passed).length,
  failed: rows.filter(r => !r.passed).length,
  failures: rows.filter(r => !r.passed)
};
const out = arg('--out', null);
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ ...result, rows }, null, 2));
}
console.log(JSON.stringify(result));
if (result.failed) process.exitCode = 1;
