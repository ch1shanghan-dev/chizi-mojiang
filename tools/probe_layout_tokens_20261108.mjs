/* H1：CSS 侧视口令牌与 JS 迁移真值双向对账（2026-11-08）
   csh_layout.css :root 补齐 6 档变量，逐项对齐 CSHViewport.TARGETS；
   H1 本批零 @media 改动；I1 起按批收敛，基线随 E95X 同步收缩（不写死种数）。内置改前基线。 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'core/csh_layout.css'), 'utf8');
const vpSrc = fs.readFileSync(path.join(root, 'core/csh_viewport.js'), 'utf8');
const vpProbe = fs.readFileSync(path.join(root, 'tools/probe_viewport_tokens_20261107.mjs'), 'utf8');
const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, detail: ok ? undefined : detail });
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };

function loadVp(source) {
  const ctx = { window: {} };
  vm.runInNewContext(source, ctx, { timeout: 2000 });
  return ctx.window.CSHViewport;
}
const V = loadVp(vpSrc);

/* 只取 :root 块，避免误抓其它选择器里的同名字符串 */
const rootBlock = (css.match(/:root\s*\{([\s\S]*?)\n\}/) || [])[1] || '';
function varsIn(block) {
  const out = new Map(), re = /--csh-vp-([a-z-]+)\s*:\s*(\d+)px\s*;/g;
  let m;
  while ((m = re.exec(block))) out.set(m[1], Number(m[2]));
  return out;
}
const vars = varsIn(rootBlock);
const expected = new Map([
  ['tiny-h', 330], ['short-h', 500], ['mid-h', 640],
  ['narrow-w', 760], ['mid-w', 1000], ['wide-w', 1200]
]);

check('CSS :root 六档变量齐全且无多余', vars.size === expected.size && [...expected.keys()].every(k => vars.has(k)),
  { found: [...vars.keys()], expected: [...expected.keys()] });
check('每个变量值与 CSHViewport.TARGETS 对应档一致',
  vars.get('tiny-h') === V.TARGETS.height[0] && vars.get('short-h') === V.TARGETS.height[1] &&
  vars.get('mid-h') === V.TARGETS.height[2] && vars.get('narrow-w') === V.TARGETS.width[0] &&
  vars.get('mid-w') === V.TARGETS.width[1] && vars.get('wide-w') === V.TARGETS.width[2],
  { css: Object.fromEntries(vars), js: V.TARGETS });
check('E2 三档原变量值未被改动',
  vars.get('tiny-h') === 330 && vars.get('short-h') === 500 && vars.get('narrow-w') === 760);
check('注释写明 27 处 same 的令牌归属与 68 处高风险不在本批改',
  /same（映射到自身、零风险）的 27 处归属/.test(css) && /59 处 expand \/ 9 处 shrink/.test(css));
check('注释保留 330/500 不可合并与桌面下限定则',
  /330 \/ 500 不是「混用」/.test(css) && /1365×768/.test(css));

/* 全仓 @media 数值集合仍与 E95X 基线一致（本批只加变量、不改任何断点） */
function walk(dir, out) {
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f), st = fs.statSync(fp);
    if (st.isDirectory()) { walk(fp, out); continue; }
    if (!/\.(css|html)$/.test(f)) continue;
    out.push(fs.readFileSync(fp, 'utf8'));
  }
  return out;
}
const texts = walk(path.join(root, 'core'), []).concat(walk(path.join(root, 'games'), []));
const found = new Set();
for (const t of texts) {
  const re = /\(\s*max-(?:height|width)\s*:\s*(\d+)px/g;
  let m;
  while ((m = re.exec(t))) found.add(Number(m[1]));
}
const baseline = new Set(((vpProbe.match(/const BASELINE = new Set\(\[([\s\S]*?)\]\)/) || [])[1] || '')
  .split(',').map(s => Number(s.trim())).filter(Number.isFinite));
/* H1 本批零 @media 改动；I1 起按批收敛，基线随 E95X 同步收缩，此处不写死种数。 */
check('全仓断点不越过 E95X 基线（逐值收敛后同步收缩，430 已消失）',
  baseline.size > 0 && found.size === baseline.size && [...found].every(v => baseline.has(v)) && !found.has(430),
  { baseline: baseline.size, found: [...found].sort((a, b) => a - b), extra: [...found].filter(v => !baseline.has(v)) });
/* media query 不能用 var()：只查真正的 max-* 条件里有没有误用变量，
   不去匹配说明文字（注释里同时出现 @media 与 --csh-vp- 是正常的） */
check('媒体查询没有误用 var() 视口令牌',
  [...texts].every(t => !/\(\s*max-(?:height|width)\s*:\s*var\(/.test(t)));

/* 改前基线 */
{
  const badCss = css.replace('--csh-vp-mid-h: 640px;', '--csh-vp-mid-h: 620px;');
  const bad = varsIn((badCss.match(/:root\s*\{([\s\S]*?)\n\}/) || [])[1] || '');
  check('改前基线：变量值漂移会被对账检出', bad.get('mid-h') !== V.TARGETS.height[2]);
  const missing = css.replace('--csh-vp-wide-w: 1200px;', '');
  const missingBlock = (missing.match(/:root\s*\{([\s\S]*?)\n\}/) || [])[1] || '';
  check('改前基线：缺一档变量会被检出', varsIn(missingBlock).size === 5, varsIn(missingBlock).size);
}

const result = {
  scope: 'csh_layout.css :root viewport tokens vs CSHViewport.TARGETS + whole-repo breakpoint baseline; per-batch convergence',
  passed: rows.filter(r => r.passed).length,
  failed: rows.filter(r => !r.passed).length,
  failures: rows.filter(r => !r.passed)
};
const out = arg('--out', null);
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ ...result, vars: Object.fromEntries(vars), rows }, null, 2));
}
console.log(JSON.stringify(result));
if (result.failed) process.exitCode = 1;
