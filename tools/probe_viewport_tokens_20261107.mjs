/* 横屏视口令牌（方案 §4.1 纠偏）· 门禁反例（2026-11-07）
 *
 * 真值：core/csh_viewport.js（四档分类）、core/csh_layout.css（:root 令牌）、
 *       全仓 core/ + games/ 的 @media 断点静态扫描、docs/art-direction.md §4.3 定则。
 * 边界：只统一口径与唯一真值，**不改任何现有 @media 数值**（零布局风险）。
 * stdout 纯 JSON（B12 契约）；--out 可另存逐项结果。
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const src = fs.readFileSync(root + '/core/csh_viewport.js', 'utf8');
const css = fs.readFileSync(root + '/core/csh_layout.css', 'utf8');
const design = fs.readFileSync(root + '/docs/WORKBUDDY_DESIGN_GAMEPLAY_NUMERIC_ART_20261107.md', 'utf8');
const art = fs.readFileSync(root + '/docs/art-direction.md', 'utf8');

const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(!ok && detail !== undefined ? { detail } : {}) });
function load(source) {
  const ctx = vm.createContext({ window: {}, Object, Array, JSON, Math, Number, String, Error,
    console: { log() {}, warn() {}, error() {} } });
  vm.runInContext(source, ctx);
  return ctx.window.CSHViewport;
}
const V = load(src);
if (!V) throw Error('CSHViewport not mounted');

/* ---------- 模块与四档分类 ---------- */
/* v2 增加断点迁移真值（G1），分类与 TOKENS 数值未变；随模块版本同步此断言。 */
check('视口模块挂载、版本、导出冻结', V.VERSION === 2 && Object.isFrozen(V) &&
  Object.isFrozen(V.TOKENS) && Object.isFrozen(V.PROFILES));
check('令牌数值按实测三档 + 桌面下限',
  V.TOKENS.tinyMaxHeight === 330 && V.TOKENS.shortMaxHeight === 500 && V.TOKENS.narrowMaxWidth === 760 &&
  V.TOKENS.desktopMinWidth === 1365 && V.TOKENS.desktopMinHeight === 768);
check('四档视口档案齐备且冻结',
  V.PROFILES.length === 4 && V.PROFILES.every(p => Object.isFrozen(p)) &&
  V.PROFILES.map(p => p.key).join() === 'vp-desktop,vp-wide,vp-tiny,vp-portrait');
for (const [w, h, want] of [[1365, 768, 'vp-desktop'], [1920, 1080, 'vp-desktop'],
  [915, 412, 'vp-wide'], [844, 390, 'vp-wide'], [1200, 600, 'vp-wide'],
  [640, 286, 'vp-tiny'], [800, 320, 'vp-tiny'],
  [390, 844, 'vp-portrait'], [768, 1024, 'vp-portrait']]) {
  check('分类 ' + w + '×' + h + ' → ' + want, V.classify(w, h) === want, V.classify(w, h));
}
for (const bad of [null, undefined, NaN, -1, 0, '', 'abc', {}, Infinity, [915, 412]]) {
  check('非法输入 ' + String(bad) + ' 返回 null 不默认放行', V.classify(bad, 412) === null && V.classify(915, bad) === null);
}
check('纯数字字符串按 Number 语义正常分类', V.classify('915', '412') === 'vp-wide');
check('art-direction §4.3：手机横屏宽度 >760 也不套桌面布局',
  !V.isDesktopLayout(915, 412) && !V.isDesktopLayout(1200, 500) && !V.isDesktopLayout(1365, 600) &&
  V.isDesktopLayout(1365, 768));
check('边界 1364×768 / 1365×767 都不是桌面档',
  V.classify(1364, 768) !== 'vp-desktop' && V.classify(1365, 767) !== 'vp-desktop');
check('profile 查询与 isLandscapePhone 正确',
  V.profile('vp-tiny').w === 640 && V.profile('nope') === null &&
  V.isLandscapePhone(915, 412) && V.isLandscapePhone(640, 286) &&
  !V.isLandscapePhone(390, 844) && !V.isLandscapePhone(1365, 768));

/* ---------- 静态：CSS 令牌与断点口径 ---------- */
check('csh_layout.css :root 定义三档令牌且数值与 JS 一致',
  /--csh-vp-tiny-h:\s*330px/.test(css) && /--csh-vp-short-h:\s*500px/.test(css) &&
  /--csh-vp-narrow-w:\s*760px/.test(css));
check('公共样式写明 330/500 不可合并的理由',
  /330 \/ 500 不是「混用」/.test(css) && /合并成 420 会挤爆极矮屏牌桌/.test(css));
check('art-direction §4.3 定则仍在文档里', /4\.3/.test(art) && /横屏/.test(art));
check('方案 §4.1 列出四档视口', /vp-desktop/.test(design) && /vp-wide/.test(design) && /vp-tiny/.test(design) && /vp-portrait/.test(design));

/* 方案 §4.1 说「330/500/760 混用」，实测全仓原有 **24 种** max-height/max-width 断点值。
   一次性收敛会同时改动十几页布局、必须逐页比对截图，风险远大于单轮收益。
   按项目 B11 的基线策略：把现状固化成白名单，先锁住「不扩散」，逐值收敛按批推进。
   height:430 与 width:899 已收敛。白名单同步收缩，新增基线外数值会判红。 */
const BASELINE = new Set([330, 340, 350, 400, 420, 440, 450, 480, 500, 520, 540, 559, 560,
  600, 620, 640, 720, 750, 760, 1000, 1199, 599]);
function scanBreaks(text) {
  const out = [];
  const re = /\(\s*max-(?:height|width)\s*:\s*(\d+)px/g;
  let m;
  while ((m = re.exec(text))) out.push(Number(m[1]));
  return out;
}
/* I1 盲区：max-height 断点常有配对的 min-height 反向规则（L-NORMAL）。
   只改 max 不改 min，会让 431–499 高度同时命中「放大牌」与「压缩间距」两套样式。
   E2/G1 的扫描口径只看 max-*，漏掉了这类配对，这里单独扫并做同值校验。 */
function scanMinBreaks(text) {
  const out = [];
  const re = /\(\s*min-height\s*:\s*(\d+)px/g;
  let m;
  while ((m = re.exec(text))) out.push(Number(m[1]));
  return out;
}
function walk(dir, out) {
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f), st = fs.statSync(fp);
    if (st.isDirectory()) { walk(fp, out); continue; }
    if (!/\.(css|html)$/.test(f)) continue;
    out.push({ rel: path.relative(root, fp).replace(/\\/g, '/'), text: fs.readFileSync(fp, 'utf8') });
  }
  return out;
}
const files = walk(path.join(root, 'core'), []).concat(walk(path.join(root, 'games'), []));
const found = new Map();
for (const f of files) for (const v of scanBreaks(f.text)) found.set(v, (found.get(v) || 0) + 1);
check('全仓 @media 断点不越过基线（禁止新增随意数值）',
  [...found.keys()].every(v => BASELINE.has(v)), [...found.keys()].filter(v => !BASELINE.has(v)));
check('基线恰为实测的 22 种历史断点，三档主值都在其中',
  BASELINE.size === 22 && found.get(330) > 0 && found.get(500) > 0 && found.get(760) > 0,
  { size: BASELINE.size, found: [...found.keys()].length });
const minFound = new Map();
for (const f of files) for (const v of scanMinBreaks(f.text)) minFound.set(v, (minFound.get(v) || 0) + 1);
check('width:899 与反向 width:900 均已收敛', !found.has(899) && !files.some(f => /\(\s*min-width\s*:\s*900px/.test(f.text)));
/* 反向规则有两种合法写法：同值重叠（min:500 / max:500）与互补不重叠
   （min:641 / max:640、min:441 / max:440）。两者都必须落到 max 侧已有值上。 */
check('min-height 反向规则必须与 max-height 同值或互补(v-1)配对',
  minFound.size > 0 && [...minFound.keys()].every(v => found.has(v) || found.has(v - 1)),
  { min: [...minFound.keys()], max: [...found.keys()] });
check('I1：height:430 已整批收敛，max / min 两侧都零残留',
  !found.has(430) && !minFound.has(430) && !files.some(f => /\(\s*(?:max|min)-height\s*:\s*430px/.test(f.text)));
check('改前基线：只改 max 不改 min（残留 min:430）会被配对断言检出',
  (() => { const stale = [430]; return !stale.every(v => found.has(v) || found.has(v - 1)); })());
check('扫描器能抓出新增的随意断点',
  (() => { const bad = scanBreaks('@media(max-height:777px){.x{color:red}}'); return bad.length === 1 && bad[0] === 777; })());
check('视口模块源码无 DOM / 存档 / 钱包依赖',
  !/\bdocument\b|\blocalStorage\b|\bcshWallet\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));

/* ---------- 自检：违反 §4.3 的实现必须判红 ---------- */
const anchor = 'if (w >= TOKENS.desktopMinWidth && h >= TOKENS.desktopMinHeight) return \'vp-desktop\';';
if (!src.includes(anchor)) throw Error('negative-baseline anchor changed');
const badV = load(src.replace(anchor, "if (w >= TOKENS.narrowMaxWidth) return 'vp-desktop';"));
const beforeRows = [];
const bcheck = (name, ok) => beforeRows.push({ name, passed: !!ok });
bcheck('915×412 不得套桌面布局', !badV.isDesktopLayout(915, 412));
bcheck('四档分类仍完整', badV.classify(640, 286) === 'vp-tiny' && badV.classify(390, 844) === 'vp-portrait');
const beforeFailed = beforeRows.filter(r => !r.passed).length;
check('改前实现（width>760 就套桌面）能被断言集检出 >= 1 条红', beforeFailed >= 1,
  { beforeFailed, red: beforeRows.filter(r => !r.passed).map(r => r.name) });

const result = {
  scope: 'real CSHViewport in vm + static scan of all core/games css/html media breakpoints + art-direction/design docs; no rendering',
  passed: rows.filter(r => r.passed).length,
  failed: rows.filter(r => !r.passed).length,
  failures: rows.filter(r => !r.passed),
  breakpoints: [...found.entries()],
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
