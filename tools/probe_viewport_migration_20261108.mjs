/* G1：断点逐值收敛的迁移真值（2026-11-08）
   真实 core/csh_viewport.js 在 VM 里加载；按 E95X 同款口径扫描全仓 core/games 的 css/html，
   验证历史断点（按 max-height / max-width 分轴）都有可映射目标、方向/风险自洽、
   目标集合闭合、单调不逆序，并输出逐页迁移清单。
   I1（2026-11-08）已按本表把 height:430 整批收敛到 500，故实测值集合随每批收敛动态变小；
   迁移表本身保留 430 作为历史依据，已收敛的值不再出现在扫描里。
   内置改前基线：缺映射 / 目标越界 / 破坏单调 都必须被检出。 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'core/csh_viewport.js'), 'utf8');
const vpProbe = fs.readFileSync(path.join(root, 'tools/probe_viewport_tokens_20261107.mjs'), 'utf8');
const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, detail: ok ? undefined : detail });
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };

function load(source) {
  const ctx = { window: {} };
  vm.runInNewContext(source, ctx, { timeout: 2000 });
  return ctx.window.CSHViewport;
}
const V = load(src);

/* ---------- 1. 模块与真值形状 ---------- */
check('视口模块 v2 且导出冻结', V && V.VERSION === 2 && Object.isFrozen(V));
check('迁移表 / 目标集合 / 三档主令牌都冻结',
  Object.isFrozen(V.MIGRATIONS) && Object.isFrozen(V.MIGRATIONS.height) && Object.isFrozen(V.MIGRATIONS.width) &&
  Object.isFrozen(V.TARGETS) && Object.isFrozen(V.TARGETS.height) &&
  Object.keys(V.MIGRATIONS.height).every(k => Object.isFrozen(V.MIGRATIONS.height[k])) &&
  Object.keys(V.MIGRATIONS.width).every(k => Object.isFrozen(V.MIGRATIONS.width[k])));
check('分类 TOKENS 未被迁移真值改动',
  V.TOKENS.tinyMaxHeight === 330 && V.TOKENS.shortMaxHeight === 500 && V.TOKENS.narrowMaxWidth === 760 &&
  V.TOKENS.desktopMinWidth === 1365 && V.TOKENS.desktopMinHeight === 768 && V.PROFILES.length === 4);
check('目标集合为 6 档（3 个 E2 主值 + 3 个新增中间档）',
  JSON.stringify(V.TARGETS.height) === '[330,500,640]' && JSON.stringify(V.TARGETS.width) === '[760,1000,1200]',
  V.TARGETS);
/* 剥掉注释再扫代码体：注释里说明「不改 @media」是正常文字，不是写入路径 */
const codeBody = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
check('迁移表是纯数据，不写 DOM / 存储 / 媒体查询',
  !/document|localStorage|@media|querySelector|fetch\s*\(/.test(codeBody), codeBody.slice(0, 120));

/* ---------- 2. 全仓扫描（与 E95X 同口径，按轴） ---------- */
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
const found = { height: new Map(), width: new Map() };
const plan = [];
for (const f of files) {
  const re = /\(\s*max-(height|width)\s*:\s*(\d+)px/g;
  let m;
  while ((m = re.exec(f.text))) {
    const axis = m[1], v = Number(m[2]);
    if (!found[axis].has(v)) found[axis].set(v, []);
    found[axis].get(v).push(f.rel);
    const r = V.migrationOf(v, axis);
    plan.push({ file: f.rel, axis, from: v, to: r ? r.to : null,
      direction: r ? r.direction : null, risk: r ? r.risk : null, token: r ? r.token : null });
  }
}
const allValues = new Set([...found.height.keys(), ...found.width.keys()]);
check('按轴实测：height 14 种 / width 12 种 / 合并 22 种（430 已整批收敛）',
  found.height.size === 14 && found.width.size === 12 && allValues.size === 22,
  { height: found.height.size, width: found.width.size, union: allValues.size });
const baseline = new Set(((vpProbe.match(/const BASELINE = new Set\(\[([\s\S]*?)\]\)/) || [])[1] || '')
  .split(',').map(s => Number(s.trim())).filter(Number.isFinite));
check('与 E95X 基线 22 种逐项一致（两处口径同步收缩）',
  baseline.size === 22 && allValues.size === baseline.size && [...allValues].every(v => baseline.has(v)),
  { missingInBaseline: [...allValues].filter(v => !baseline.has(v)), missingInScan: [...baseline].filter(v => !allValues.has(v)) });
check('全仓断点仍是 22 种，主值 330 / 500 / 760 仍在用',
  (found.height.get(330) || []).length > 0 && (found.height.get(500) || []).length > 0 &&
  (found.width.get(760) || []).length > 0);
check('已收敛的 430 不再出现在全仓扫描里，但仍在迁移表中留作历史依据',
  !allValues.has(430) && V.migrationOf(430, 'height').to === 500);
check('width:899 已收敛到 1000', !found.width.has(899) && V.migrationOf(899, 'width').to === 1000);

/* ---------- 3. 映射完备性与自洽 ---------- */
{
  const gaps = [];
  for (const axis of ['height', 'width'])
    for (const v of found[axis].keys())
      if (!V.migrationOf(v, axis)) gaps.push(axis + ':' + v);
  check('全仓每个 (轴,值) 组合都有迁移目标', gaps.length === 0, gaps);
}
for (const axis of ['height', 'width']) {
  const target = V.TARGETS[axis];
  const keys = Object.keys(V.MIGRATIONS[axis]).map(Number).sort((a, b) => a - b);
  const rs = keys.map(k => V.migrationOf(k, axis));
  check(axis + '：每个目标都在目标集合内', rs.every(r => target.includes(r.to)), rs.filter(r => !target.includes(r.to)));
  check(axis + '：direction / risk 由 from→to 机械推导，不手写第二份',
    rs.every(r => r.direction === (r.to > r.from ? 'expand' : r.to < r.from ? 'shrink' : 'same') &&
      r.risk === (r.direction === 'same' ? 'low' : 'high')));
  check(axis + '：按 from 升序，to 单调不逆序',
    rs.every((r, i) => i === 0 || r.to >= rs[i - 1].to), rs.map(r => r.from + '→' + r.to));
  check(axis + '：newTier 只标记新增中间档',
    rs.every(r => r.newTier === (axis === 'height' ? r.to === 640 : (r.to === 1000 || r.to === 1200))));
}
check('三档主值映射到自身且为低风险（无需截图的唯一三类）',
  [[330, 'height'], [500, 'height'], [760, 'width']].every(([v, a]) => {
    const r = V.migrationOf(v, a); return r.to === v && r.direction === 'same' && r.risk === 'low';
  }));
check('max-height / max-width 两种 axis 写法等价',
  JSON.stringify(V.migrationOf(430, 'height')) === JSON.stringify(V.migrationOf(430, 'max-height')) &&
  JSON.stringify(V.migrationOf(1000, 'width')) === JSON.stringify(V.migrationOf(1000, 'max-width')));
check('数字字符串按 Number 语义可转换', V.migrationOf('430', 'height').to === 500);
for (const bad of [null, undefined, NaN, -1, 0, 'abc', {}, Infinity, 777, 330.5]) {
  check('非法输入 ' + String(bad) + ' 返回 null 不默认放行',
    V.migrationOf(bad, 'height') === null && V.migrationOf(bad, 'width') === null);
}
check('未知 axis 返回 null', V.migrationOf(430, 'min-height') === null && V.migrationOf(430, '') === null);

/* ---------- 4. 逐页清单统计（供报告与下轮施工） ---------- */
{
  const high = plan.filter(p => p.risk === 'high').length;
  const expand = plan.filter(p => p.direction === 'expand').length;
  const shrink = plan.filter(p => p.direction === 'shrink').length;
  const same = plan.filter(p => p.direction === 'same').length;
  const byFile = {};
  for (const p of plan) byFile[p.file] = (byFile[p.file] || 0) + 1;
  check('清单覆盖全部扫描到的断点出现次数', plan.length === [...found.height.values(), ...found.width.values()].reduce((n, a) => n + a.length, 0));
  check('高风险项全部标出（expand/shrink 必须逐页比截图）', high === expand + shrink && same > 0,
    { high, expand, shrink, same });
  const rels = new Set(files.map(f => f.rel));
  check('清单里的每个文件都来自实际扫描的 core/games 样式页',
    Object.keys(byFile).length >= 10 && Object.keys(byFile).every(f => rels.has(f)), Object.keys(byFile).length);
}

/* ---------- 5. 改前基线 ---------- */
{
  /* 连同行尾逗号一起删，保持对象字面量语法合法，只是少了 430 这一条 */
  const noMap = src.replace('430: [500, \'vp-wide\'], ', '');
  const badV = load(noMap);
  check('改前基线：缺一条映射会被完备性断言检出', badV.migrationOf(430, 'height') === null);

  const badTarget = src.replace('1199: [1200, \'vp-wide-w\']', '1199: [1300, \'vp-wide-w\']');
  const badT = load(badTarget);
  check('改前基线：目标越出 TARGETS 会被检出',
    badT.migrationOf(1199, 'width').to === 1300 && !badT.TARGETS.width.includes(1300));

  const badMono = src.replace('350: [330, \'vp-tiny\']', '350: [640, \'vp-mid-h\']');
  const badM = load(badMono);
  const seq = [330, 340, 350, 400].map(v => badM.migrationOf(v, 'height').to);
  check('改前基线：破坏单调会被检出', seq[2] > seq[3], seq);
}

const result = {
  scope: 'real CSHViewport v2 migration table + whole-repo css/html breakpoint scan by axis; 430 batch converged to 500',
  passed: rows.filter(r => r.passed).length,
  failed: rows.filter(r => !r.passed).length,
  failures: rows.filter(r => !r.passed),
  summary: {
    heightValues: [...found.height.keys()].sort((a, b) => a - b),
    widthValues: [...found.width.keys()].sort((a, b) => a - b),
    targets: V.TARGETS, files: files.length, occurrences: plan.length,
    highRisk: plan.filter(p => p.risk === 'high').length,
    expand: plan.filter(p => p.direction === 'expand').length,
    shrink: plan.filter(p => p.direction === 'shrink').length,
    same: plan.filter(p => p.direction === 'same').length
  }
};
const out = arg('--out', null);
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ ...result, plan, rows }, null, 2));
}
console.log(JSON.stringify(result));
if (result.failed) process.exitCode = 1;
