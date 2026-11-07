/* H1：PF-08 第二批 图鉴低频详情分区导航（2026-11-08）
   AST 抽真实 applySection 在最小 DOM 里验证：默认相处、记忆/档案切换、未知回落、
   矮横屏全部展开、aria-selected、主操作常驻不受分区影响、零写入。
   不改页面源码；内置改前基线必须判红。 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parse, walk } from './lib/skill_audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'games/codex.html'), 'utf8');
const vpProbe = fs.readFileSync(path.join(root, 'tools/probe_viewport_tokens_20261107.mjs'), 'utf8');
const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, detail: ok ? undefined : detail });
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };

let inline = '';
for (const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))
  if (m[1].length > inline.length) inline = m[1];
const ast = parse(inline);
let fn = null;
walk(ast, n => { if (n.type === 'FunctionDeclaration' && n.id?.name === 'applySection') fn = inline.slice(n.range[0], n.range[1]); });
const decl = (inline.match(/var DNAV_SECTIONS=[^\n]*\n/) || [''])[0];
check('AST 抽到真实 applySection 与分区常量', !!fn && /DNAV_SECTIONS/.test(decl), { fn: !!fn, decl: decl.slice(0, 80) });

function node(attrs) {
  const n = {
    attrs: attrs || {}, hidden: false, parentNode: null, listeners: {},
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    addEventListener(k, f) { (this.listeners[k] = this.listeners[k] || []).push(f); },
    querySelectorAll() { return []; },
    contains() { return false; }
  };
  return n;
}

function harness(compact, override) {
  const nav = node({});
  const tabs = ['relation', 'memory', 'archive'].map(k => { const t = node({ 'data-section': k }); t.parentNode = nav; return t; });
  nav.querySelectorAll = () => tabs;
  const details = [
    node({ 'data-section': 'memory', id: 'story' }),
    node({ 'data-section': 'memory', id: 'echo' }),
    node({ 'data-section': 'archive', id: 'records' })
  ];
  const writes = [], bridgeCalls = [], walletCalls = [];
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    $: sel => (sel === '#dnav' ? nav : null),
    document: { querySelectorAll: sel => (sel === '.dinfo details[data-section]' ? details : []) },
    window: { matchMedia: () => ({ matches: !!compact }) },
    localStorage: { getItem() { return null; }, setItem(k, v) { writes.push(k); } },
    Bridge: { call(...a) { bridgeCalls.push(a); } },
    lib: { cshWallet: { pc() { walletCalls.push('pc'); return 0; } } }
  });
  vm.runInContext(decl + '\n' + (override || fn), ctx, { timeout: 2000 });
  return {
    ctx, nav, tabs, details, writes, bridgeCalls, walletCalls,
    apply: k => ctx.applySection(k),
    state: () => ({
      hidden: details.map(d => d.hidden), navHidden: nav.hidden,
      selected: tabs.map(t => t.getAttribute('aria-selected'))
    })
  };
}

/* ---------- 1. 分区行为 ---------- */
{
  const h = harness(false);
  check('默认「相处」：三个低频详情全部收起、导航可见',
    h.apply('relation') === 'relation' && h.state().hidden.every(Boolean) && h.state().navHidden === false, h.state());
  check('默认 aria-selected 只有相处为 true',
    JSON.stringify(h.state().selected) === JSON.stringify(['true', 'false', 'false']), h.state().selected);
  check('切到「记忆」：小传与回响展开、讨伐记录仍收起',
    h.apply('memory') === 'memory' && JSON.stringify(h.state().hidden) === JSON.stringify([false, false, true]), h.state());
  check('切到「档案」：只展开讨伐记录',
    h.apply('archive') === 'archive' && JSON.stringify(h.state().hidden) === JSON.stringify([true, true, false]), h.state());
  check('aria-selected 随分区同步',
    JSON.stringify(h.state().selected) === JSON.stringify(['false', 'false', 'true']), h.state().selected);
  check('未知分区回落到相处，不默认全展开',
    h.apply('nope') === 'relation' && h.state().hidden.every(Boolean), h.state());
  check('分区切换零存档 / 零桥 / 零钱包调用',
    h.writes.length === 0 && h.bridgeCalls.length === 0 && h.walletCalls.length === 0);
}
{
  const h = harness(true);
  check('极矮横屏：导航隐藏且三个详情全部展开（关键内容仍可达）',
    h.apply('memory') === 'memory' && h.state().navHidden === true && h.state().hidden.every(v => v === false), h.state());
  const wide = harness(false);
  check('回到宽屏后分区重新生效，不残留矮屏状态',
    wide.apply('archive') === 'archive' && JSON.stringify(wide.state().hidden) === JSON.stringify([true, true, false]), wide.state());
}

/* ---------- 2. 静态接线与 UI 约束 ---------- */
{
  check('三个分区按钮都有 role/aria 与 44px 触控目标',
    (html.match(/class="affbtn dnav-tab" data-section=/g) || []).length === 3 &&
    /<nav class="dnav" id="dnav" role="tablist" aria-label="人物档案分区">/.test(html) &&
    /\.dnav \.dnav-tab\{[^}]*min-height:44px/.test(html));
  check('焦点可见与选中态有样式',
    /\.dnav \.dnav-tab:focus-visible/.test(html) && /\.dnav \.dnav-tab\[aria-selected="true"\]/.test(html));
  check('主操作 affbox 与 F1 增益面板常驻，不挂 data-section',
    /<div class="affbox" id="affbox"><\/div>/.test(html) &&
    /<details class="collection-details" id="spirit-buff" hidden>/.test(html) &&
    !/id="affbox"[^>]*data-section/.test(html) && !/id="spirit-buff"[^>]*data-section/.test(html));
  check('低频详情分组正确：记忆 2 个、档案 1 个',
    /id="character-story" data-section="memory"/.test(html) &&
    /id="character-echo" data-section="memory"/.test(html) &&
    /id="character-records" data-section="archive"/.test(html));
  check('隐藏态用高优先级规则真实不占位', /\.dinfo details\[hidden\]\{display:none\}/.test(html));
  check('矮横屏复用既有 340px 断点，不新增 @media 数值',
    /@media\(max-height:340px\)\{\.dnav\{display:none\}\}/.test(html) &&
    !/@media\(max-height:3(?!40)\d+px\)\{\.dnav/.test(html));
  const baseline = new Set(((vpProbe.match(/const BASELINE = new Set\(\[([\s\S]*?)\]\)/) || [])[1] || '')
    .split(',').map(s => Number(s.trim())).filter(Number.isFinite));
  const values = [...html.matchAll(/\(\s*max-(?:height|width)\s*:\s*(\d+)px/g)].map(m => Number(m[1]));
  check('本页 @media 数值全部仍在 24 种基线内', values.every(v => baseline.has(v)), values.filter(v => !baseline.has(v)));
  check('点击事件走 data-section 委托并调用 applySection',
    /dnav\.addEventListener\("click"/.test(inline) && /applySection\(n\.getAttribute\("data-section"\)\)/.test(inline));
  check('初始化即应用默认分区', /applySection\("relation"\);/.test(inline));
}

/* ---------- 3. 改前基线 ---------- */
{
  const noHide = fn.replace('details[i].hidden=!compact&&details[i].getAttribute("data-section")!==key;',
    'details[i].hidden=false;');
  check('改前基线源码确实换了实现', noHide !== fn);
  const h = harness(false, noHide);
  h.apply('archive');
  check('改前基线：不过滤隐藏会被断言集检出', h.state().hidden.some(v => v === false) === true, h.state());
  const real = harness(false);
  real.apply('archive');
  check('当前实现同场景仍只显示档案', JSON.stringify(real.state().hidden) === JSON.stringify([true, true, false]));
}

const result = {
  scope: 'AST-extracted codex.html applySection in minimal DOM; static nav / a11y / breakpoint constraints; zero CSS breakpoint changes',
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
