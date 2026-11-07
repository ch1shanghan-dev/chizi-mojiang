/* 世界同桌 AI 跨桌冷却（方案 §3.2 纠偏实施）· 门禁反例（2026-11-07）
 *
 * 真值：core/csh_seat_cooldown.js（纯函数模块）、core/csh_world.js（seat 接线静态断言）。
 * 边界：只过滤候选池，不改 stake/skill/persona/发牌；候选不足降级回完整池，绝不空桌。
 *       世界模块的动态行为由 E95F/E95H 与慢速通道既有探针守住，本探针另做接线静态断言。
 * stdout 纯 JSON（B12 契约）；--out 可另存逐项结果。
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const modSource = fs.readFileSync(root + '/core/csh_seat_cooldown.js', 'utf8');
const worldSource = fs.readFileSync(root + '/core/csh_world.js', 'utf8');
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const modCode = stripComments(modSource);

function load(source) {
  const ctx = vm.createContext({ window: {}, Object, Array, JSON, Math, String, Number, Error,
    console: { log() {}, warn() {}, error() {} } });
  vm.runInContext(source, ctx);
  return ctx.window.CSHSeatCooldown;
}
const C = load(modSource);
if (!C) throw Error('CSHSeatCooldown not mounted');

const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(!ok && detail !== undefined ? { detail } : {}) });
const P = (...ids) => ids.map(id => ({ id: id, stake: 1000, skill: .75, persona: 'tag' }));

/* ---------- 模块边界 ---------- */
check('模块挂载、版本 1、导出冻结', C.VERSION === 1 && Object.isFrozen(C) &&
  ['cooldownTables', 'filter', 'push'].every(k => typeof C[k] === 'function'));
const writePattern = /\blocalStorage\s*\.|\bsessionStorage\s*\.|\bindexedDB\b|\bcshWallet\b|\bsettle\s*\(|\bspendPC\s*\(|\bsaveConfig\s*\(|\bCBY\b/;
check('纯函数源码无落盘 / 经济写入路径', !writePattern.test(modCode), (modCode.match(writePattern) || [])[0]);

/* ---------- 分档（按当前退隐人数，只影响冷却桌数） ---------- */
for (const [n, want] of [[0, 0], [49, 0], [50, 0], [99, 0], [100, 1], [149, 1], [150, 2], [999, 2]]) {
  check('退隐 ' + n + ' 人 → 冷却 ' + want + ' 桌', C.cooldownTables(n) === want, C.cooldownTables(n));
}
for (const bad of [-1, NaN, undefined, null, '150', 1.9, {}, Infinity]) {
  let ok = false;
  try { ok = C.cooldownTables(bad) === 0 || (bad === '150' && C.cooldownTables(bad) === 2); } catch (_e) { ok = false; }
  check('非法退隐数 ' + String(bad) + ' 不崩溃且不给冷却', ok, C.cooldownTables(bad));
}

/* ---------- 候选过滤 ---------- */
{
  const pool = P('a', 'b', 'c', 'd');
  const r0 = C.filter(pool, [['a']], 0);
  check('冷却 0 桌：候选池完全不变（默认行为零回归）',
    r0.pool.length === 4 && r0.pool.map(x => x.id).join() === 'a,b,c,d' && r0.blocked.length === 0 && !r0.degraded);
  const r1 = C.filter(pool, [['z'], ['a', 'b']], 1);
  check('冷却 1 桌：排除上一桌出现过的角色',
    r1.pool.map(x => x.id).join() === 'c,d' && r1.blocked.join() === 'a,b' && !r1.degraded, r1.pool.map(x => x.id));
  const r2 = C.filter(P('a', 'b', 'c', 'd', 'e'), [['a'], ['b', 'c']], 2);
  check('冷却 2 桌：排除最近两桌出现过的角色',
    r2.pool.map(x => x.id).join() === 'd,e' && r2.blocked.join() === 'a,b,c', r2.pool.map(x => x.id));
  const rOld = C.filter(pool, [['a'], ['b'], ['c']], 1);
  check('只取末尾 N 桌，更早的历史不参与冷却', rOld.pool.map(x => x.id).join() === 'a,b,d', rOld.pool.map(x => x.id));
}
{
  const pool = P('a', 'b', 'c'), hist = [['a', 'b', 'c']];
  const before = JSON.stringify(pool), beforeH = JSON.stringify(hist);
  const r = C.filter(pool, hist, 1);
  check('候选全被挡时降级回完整池，绝不空桌',
    r.degraded === true && r.pool.length === 3 && r.pool.map(x => x.id).join() === 'a,b,c', r);
  check('filter 不修改入参（池与历史都是原样）', JSON.stringify(pool) === before && JSON.stringify(hist) === beforeH);
  check('filter 返回的不是原池引用', r.pool !== pool);
}
{
  const r = C.filter(P('a', 'b'), null, 1);
  check('空 / 非数组历史不崩溃且保持候选', r.pool.length === 2 && !r.degraded);
  let safe = true;
  try { C.filter(P('__proto__', 'toString', 'a'), [['__proto__']], 1); } catch (_e) { safe = false; }
  check('原型键 id 不误伤、不崩溃', safe);
  const empty = C.filter([], [['a']], 1);
  check('空候选池返回空且不降级为满池', empty.pool.length === 0 && !empty.degraded);
}

/* ---------- 有界历史 ---------- */
{
  const h0 = [['a'], ['b']];
  const before = JSON.stringify(h0);
  const h1 = C.push(h0, ['c', 'd'], 2);
  check('push 只保留最近 2 桌且返回新数组', h1.length === 2 && h1[0].join() === 'b' && h1[1].join() === 'c,d' && h1 !== h0);
  check('push 不修改入参', JSON.stringify(h0) === before);
  check('push 把 id 统一成字符串', C.push([], [1, 2], 2)[0].join() === '1,2');
  check('push 非数组 ids 记为空桌且不崩', C.push([], null, 2)[0].length === 0);
  check('push cap 下限为 1', C.push([['a'], ['b'], ['c']], ['d'], 0).length === 1);
}
{
  /* 连续三桌：冷却 2 时第三桌应排除前两桌全部角色 */
  let hist = [], pool = P('a', 'b', 'c', 'd', 'e', 'f');
  const first = C.filter(pool, hist, 2).pool.slice(0, 2);
  hist = C.push(hist, first.map(x => x.id), 2);
  const second = C.filter(pool, hist, 2).pool.slice(0, 2);
  hist = C.push(hist, second.map(x => x.id), 2);
  const third = C.filter(pool, hist, 2);
  check('连续三桌不重复角色（冷却 2 组合流程）',
    first.map(x => x.id).join() === 'a,b' && second.map(x => x.id).join() === 'c,d' &&
    third.pool.map(x => x.id).join() === 'e,f', { first: first.map(x => x.id), second: second.map(x => x.id), third: third.pool.map(x => x.id) });
}

/* ---------- 世界模块接线（静态断言；动态回归由 E95F/E95H 与慢速通道覆盖） ---------- */
check('seat 定义了可选冷却模块取用器', /function seatCooldownApi\(\)/.test(worldSource));
check('seat 用当前退隐人数算冷却并过滤候选池',
  /SC\.filter\(pool, recentSeats, SC\.cooldownTables\(retiredNow\(\)\)\)/.test(worldSource));
check('seat 退隐人数来自 world.ai 的 retired 标记', /function retiredNow\(\)/.test(worldSource) && /world\.ai\[i\]\.retired/.test(worldSource));
check('seat 每次组桌后记录有界历史', /SC\.push\(recentSeats, chosen\.map/.test(worldSource) && /\), 2\);/.test(worldSource));
check('模块缺失时降级为原有行为（if (SC) 守卫）',
  (worldSource.match(/if \(SC\)/g) || []).length === 2 && /seatCooldownApi\(\).*catch\(e\)\{return null;\}/s.test(worldSource));
{
  const start = worldSource.indexOf('var SC = seatCooldownApi();');
  const end = worldSource.indexOf('if (!pool.length) return [];', start);
  const wiring = start >= 0 && end > start ? worldSource.slice(start, end) : '';
  check('接线片段不含任何 stake / skill / persona 赋值（不改公平性）',
    wiring.length > 0 && !/\b(stake|skill|persona)\s*=/.test(wiring) && !/shuffle|deck|发牌/.test(wiring), wiring.slice(0, 160));
}
check('activeList 仍无条件排除退隐（方案 50–99 档实为既有行为）',
  /if \(!a\.retired && a\.fund >= AI_MIN_STAKE\) out\.push\(a\)/.test(worldSource));

/* ---------- 自检：改前实现必须被判红 ---------- */
const anchor = 'if (n >= 150) return 2;\n    if (n >= 100) return 1;';
if (!modSource.includes(anchor)) throw Error('negative-baseline anchor changed');
const before = load(modSource.replace(anchor, 'if (n >= 150) return 0;\n    if (n >= 100) return 0;'));
const beforeRows = [];
const bcheck = (name, ok) => beforeRows.push({ name, passed: !!ok });
bcheck('退隐 100 人应有 1 桌冷却', before.cooldownTables(100) === 1);
bcheck('退隐 150 人应有 2 桌冷却', before.cooldownTables(150) === 2);
bcheck('冷却 1 桌应排除上一桌', before.filter(P('a', 'b'), [['a']], 1).pool.length === 1);
const beforeFailed = beforeRows.filter(r => !r.passed).length;
check('改前实现（无冷却分档）能被断言集检出 >= 2 条红', beforeFailed >= 2,
  { beforeFailed, red: beforeRows.filter(r => !r.passed).map(r => r.name) });

const result = {
  scope: 'real CSHSeatCooldown pure functions in vm; tier tables, candidate filtering, bounded history, static world seat wiring; not natural games',
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
