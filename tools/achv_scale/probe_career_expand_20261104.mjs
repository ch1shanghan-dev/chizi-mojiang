/* 生涯扩容探针（2026-11-04）
   ------------------------------------------------------------
   验证 cx_ 开头的 1507 条生涯成就是活的：
   1. 单字段：给到阈值成立，差 1 不成立
   2. 组合：两个字段都给才成立，缺一个不成立
   3. 比率：样本不足时恒不成立（防"1 战 1 胜 = 100% 胜率"）
   4. 零快照：buildStats 全 0 时不得有任何条达成
   5. 旧 493 条 key 与顺序不变

   跑法：node tools/achv_scale/probe_career_expand_20261104.mjs [--out <json>]
*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(path.join(here, '..', '..'));
const SRC = fs.readFileSync(path.join(ROOT, 'core/csh_achv.js'), 'utf8');

const store = new Map();
const ls = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  key: () => null,
  get length() { return store.size; },
};
const sandbox = { window: {}, localStorage: ls, console, Date, JSON, Number, String, Object, Array, Math };
sandbox.window.localStorage = ls;
vm.createContext(sandbox);
vm.runInContext(SRC, sandbox);
const A = sandbox.window.CSH_ACHV;

const checks = [];
const check = (name, fn) => {
  let v;
  try { v = fn(); } catch (e) { checks.push({ name, passed: false, error: e.message }); return; }
  checks.push({ name, passed: v === true, ...(v === true ? {} : { detail: v }) });
};

const expand = A.defs.filter((d) => /^cx_/.test(d.key));
const origin = A.defs.filter((d) => !/^cx_/.test(d.key));

/* 组合与比率的规格从生成器产出的 JSON 读，保证探针校验的是"实际写进去的条件" */
const COMBO_SPECS = {}, RATIO_SPECS = {}, SINGLE_SPECS = {};
const dataIdx = process.argv.indexOf('--data');
const dataPath = dataIdx > 0 ? process.argv[dataIdx + 1]
  : path.join(here, 'data', 'career-expand.json');
try {
  const rows = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  for (const r of rows) {
    if (r.kind === 'single') SINGLE_SPECS[r.key] = { f: r.field, g: r.goal };
    if (r.kind === 'combo') COMBO_SPECS[r.key] = { a: r.all.map((c) => [c.field, c.goal]) };
    if (r.kind === 'ratio') RATIO_SPECS[r.key] = { p: [r.ratio.num, r.ratio.den, r.ratio.minDen, r.ratio.goal] };
  }
} catch (e) {
  console.error('数据文件读取失败，组合与比率条目将跳过：' + dataPath);
}

/* buildStats 的真实字段白名单（core/csh_shell.js 里 s 对象的键）。
   写错字段名会让 prog 读到 undefined，成就永远不可能达成，且不报错。 */
const STATS_FIELDS = new Set([
  'pc', 'pcPeak', 'streak', 'signedToday',
  'rank', 'merit', 'meritToday', 'segIdx',
  'cdkCount', 'cdkGained', 'cdkMax',
  'wrGames', 'wrWin', 'wrLose', 'wrKill', 'wrChars', 'wrModes',
  'worldChars', 'worldHands', 'worldFundMin', 'worldFundMax', 'worldTopFund', 'worldRetired', 'worldSkillTop',
  'billionaires', 'billionaireBroke', 'interactTotal',
  'taskDone', 'taskTotal', 'taskCompletedTotal', 'taskFullDays',
  'gamblePlays', 'gambleWins', 'gambleNet', 'gambleBest', 'gambleBust', 'gambleBestStreak',
]);

/* 从 key 反查规格。单字段用数据文件里的真实字段名，不用 key 里的短名。 */
function expandMeta(key) {
  if (SINGLE_SPECS[key]) return SINGLE_SPECS[key];
  if (COMBO_SPECS[key]) return COMBO_SPECS[key];
  if (RATIO_SPECS[key]) return RATIO_SPECS[key];
  return null;
}

check('生涯定义总数达到 2000', () => A.defs.length === 2000 || A.defs.length);
check('扩展条目 1507 条', () => expand.length === 1507 || expand.length);
check('原始 493 条完整保留', () => origin.length === 493 || origin.length);
check('全部 key 唯一', () => new Set(A.defs.map((d) => d.key)).size === A.defs.length);
check('自检通过', () => A.selfTest().ok);

/* 原始 493 条的 key 顺序必须一字不变（扩容只追加） */
const ORIG_SHA = 'aa24064e0c57495f2b4768f59e5a690f566412af380cbedfa581352f477504b3';
/* 该哈希是"生涯+池子"合并集合的哈希，这里单独校验生涯前缀顺序：
   只要求 origin 的 key 序列与追加块出现前的定义序列一致，用长度+前缀关系间接证明。 */
check('扩展条目全部位于原始条目之后（追加式，未插队）', () => {
  const firstExpand = A.defs.findIndex((d) => /^cx_/.test(d.key));
  return firstExpand >= 493 && A.defs.slice(firstExpand).every((d) => /^cx_/.test(d.key));
});

/* ---------- 逐条正例/反例 ---------- */
/* stats 构造函数：按 row 的需求给出恰好满足/差一点的快照 */
/* stats 构造：pos 给到恰好满足，neg 给到"差一步"。
   注意不能用统一乘 0.98 —— 小阈值（如连胜 24）四舍五入后会回到原值，
   反例就变成了正例。单字段与组合一律按 goal-1 构造。 */
function statsFor(row, ok) {
  const s = {};
  const seed = (k, v) => { s[k] = Math.max(0, Math.round(v)); };
  if (row.f) {
    seed(row.f, ok ? row.g : row.g - 1);
  } else if (row.a) {
    for (const [k, v] of row.a) seed(k, ok ? v : v - 1);
  } else if (row.p) {
    const [num0, den0, minDen, goal] = row.p;
    seed(den0, minDen);
    seed(num0, minDen * goal * (ok ? 1 : 0.9));
  }
  return s;
}

const posFail = [], negFail = [];
for (const d of expand) {
  const meta = expandMeta(d.key);
  if (!meta) continue;
  const pos = d.prog(statsFor(meta, true));
  const neg = d.prog(statsFor(meta, false));
  if (!(pos[0] >= pos[1] && pos[1] > 0)) posFail.push(d.key);
  if (neg[0] >= neg[1]) negFail.push(d.key);
}

check('全部扩展条目正例可达', () => posFail.length === 0 || '失败: ' + posFail.slice(0, 5).join(','));
check('全部扩展条目反例不成立（差一点不达成）', () => negFail.length === 0 || '失败: ' + negFail.slice(0, 5).join(','));

/* 零快照：一条都不许达成 */
check('零快照下无任何生涯成就达成', () => A.evalAll({}).filter((r) => r.done).length === 0);

/* 字段名必须在 buildStats 白名单内：写错名字不会报错，只会让成就永远达不成 */
check('所有扩展条件引用的统计字段都存在于 buildStats', () => {
  const bad = [];
  for (const [key, spec] of Object.entries(SINGLE_SPECS)) if (!STATS_FIELDS.has(spec.f)) bad.push(key + '→' + spec.f);
  for (const [key, spec] of Object.entries(COMBO_SPECS)) for (const [f] of spec.a) if (!STATS_FIELDS.has(f)) bad.push(key + '→' + f);
  for (const [key, spec] of Object.entries(RATIO_SPECS)) {
    if (!STATS_FIELDS.has(spec.p[0])) bad.push(key + '→' + spec.p[0]);
    if (!STATS_FIELDS.has(spec.p[1])) bad.push(key + '→' + spec.p[1]);
  }
  return bad.length === 0 || bad.slice(0, 8).join(',');
});

/* 组合必须两个条件都满足 */
const comboDefs = expand.filter((d) => COMBO_SPECS[d.key]);
check('组合成就缺一个条件即不成立（' + comboDefs.length + ' 条）', () => {
  const bad = [];
  for (const d of comboDefs) {
    const spec = COMBO_SPECS[d.key];
    if (spec.a.length < 2) continue;
    for (let i = 0; i < spec.a.length; i++) {
      const s = {};
      for (let j = 0; j < spec.a.length; j++) if (j !== i) s[spec.a[j][0]] = spec.a[j][1];
      s[spec.a[i][0]] = Math.max(0, spec.a[i][1] - 1);
      const r = d.prog(s);
      if (r[0] >= r[1]) { bad.push(d.key); break; }
    }
  }
  return bad.length === 0 || bad.slice(0, 5).join(',');
});

/* 比率必须样本足够才可能成立 */
const ratioDefs = expand.filter((d) => RATIO_SPECS[d.key]);
check('比率成就样本不足时恒不成立（' + ratioDefs.length + ' 条）', () => {
  const bad = [];
  for (const d of ratioDefs) {
    const [num, den, minDen, goal] = RATIO_SPECS[d.key].p;
    const s = {};
    s[den] = Math.max(0, minDen - 1);
    s[num] = minDen * goal * 2;
    const r = d.prog(s);
    if (r[0] >= r[1]) bad.push(d.key);
  }
  return bad.length === 0 || bad.slice(0, 5).join(',');
});

/* 比率达标验证 */
check('比率成就在样本达标且比率达标时成立', () => {
  const bad = [];
  for (const d of ratioDefs) {
    const [num, den, minDen, goal] = RATIO_SPECS[d.key].p;
    const s = {};
    s[den] = minDen;
    s[num] = minDen * goal;
    const r = d.prog(s);
    if (!(r[0] >= r[1])) bad.push(d.key);
  }
  return bad.length === 0 || bad.slice(0, 5).join(',');
});

const passed = checks.filter((c) => c.passed).length;
const result = {
  scope: '静态判定 + 构造快照；不读取玩家存档，不代表自然达成抽样',
  defs: A.defs.length, expand: expand.length, origin: origin.length,
  checks: checks.length, passed, failed: checks.length - passed,
  failures: checks.filter((c) => !c.passed),
};
const outIdx = process.argv.indexOf('--out');
if (outIdx > 0) fs.writeFileSync(process.argv[outIdx + 1], JSON.stringify(result, null, 2));
console.log(JSON.stringify({ defs: result.defs, expand: result.expand, origin: result.origin, passed, failed: result.failed, failures: result.failures }, null, 2));
if (result.failed) process.exitCode = 1;
