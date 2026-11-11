/* 金鳞市股价波动放大 · 客观验收（2026-11-11）
 *
 * 作者要求：涨跌幅度更大一点，极少数情况可以极端一些。
 * 本夹具锁两件事：
 *   ① 常量与护栏没漂移（常规噪声、极端概率、单日截断、价格上下限、趋势线封顶）；
 *   ② 按真实公式跑 20000 个交易日的分布，确认「确实更刺激」且「不会失控」。
 * 实际日结的隔离测试和分布模拟，不访问玩家存档。
 *
 * 用法：node tools/probe_market_volatility_20261111.mjs [--out <dir>]
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditTempRoot } from './lib/audit_scratch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', path.join(auditTempRoot(), 'market-volatility')));
fs.mkdirSync(out, { recursive: true });
const src = fs.readFileSync(path.join(root, 'core', 'csh_market.js'), 'utf8');
const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(ok ? {} : { detail }) });
const save = (o) => { try { fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(o, null, 2)); } catch (e) {} };

const num = (name) => {
  const m = src.match(new RegExp('export const ' + name + '\\s*=\\s*([0-9.]+)'));
  return m ? Number(m[1]) : NaN;
};
const pair = (name, key) => {
  const m = src.match(new RegExp('export const ' + name + '\\s*=\\s*([0-9.]+)\\s*,\\s*' + key + '\\s*=\\s*([0-9.]+)'));
  return m ? [Number(m[1]), Number(m[2])] : [NaN, NaN];
};

const [NOISE_MIN, NOISE_MAX] = pair('NOISE_MIN', 'NOISE_MAX');
const [SHOCK_MIN, SHOCK_MAX] = pair('SHOCK_MIN', 'SHOCK_MAX');
const [DRIFT_MIN, DRIFT_MAX] = pair('DRIFT_MIN', 'DRIFT_MAX');
const SHOCK_CHANCE = num('SHOCK_CHANCE');
const DAILY_CAP = num('DAILY_CAP');
const BASE_PRICE = num('BASE_PRICE');
const TREND_DAYS_CAP = num('TREND_DAYS_CAP');
const PULL_BACK = num('PULL_BACK');
/* PRICE_CAP 写成表达式 BASE_PRICE * 20，不能按纯数字解析 */
const capExpr = /export const PRICE_CAP\s*=\s*([^;]+);/.exec(src);
const capText = capExpr ? capExpr[1].trim() : '';
const PRICE_CAP = capText === 'BASE_PRICE * 20' ? BASE_PRICE * 20 : Number(capText);

/* ---------- 静态 ---------- */
check('常规噪声放大到 ±3.5%~16%（原 ±2%~9%）', NOISE_MIN === 0.035 && NOISE_MAX === 0.16, [NOISE_MIN, NOISE_MAX]);
check('极端行情概率 1.5%/只/日', SHOCK_CHANCE === 0.015, SHOCK_CHANCE);
check('极端倍率 2.2~3.6 且单日截断 ±45%', SHOCK_MIN === 2.2 && SHOCK_MAX === 3.6 && DAILY_CAP === 0.45,
  [SHOCK_MIN, SHOCK_MAX, DAILY_CAP]);
check('价格上限 20× 基准价、下限 50', capText === 'BASE_PRICE * 20' && PRICE_CAP === BASE_PRICE * 20 &&
  /const PRICE_FLOOR = 50;/.test(src), { capText, PRICE_CAP, BASE_PRICE });
check('长期慢牛与回归力度未改', DRIFT_MIN === 0.002 && DRIFT_MAX === 0.005 && PULL_BACK === 0.25,
  [DRIFT_MIN, DRIFT_MAX, PULL_BACK]);
check('两处趋势线都封顶且天数封顶（防长局 dev 假数据 / 分布偏斜）',
  TREND_DAYS_CAP === 400 && (src.match(/Math\.min\(PRICE_CAP, BASE_PRICE \* Math\.pow/g) || []).length === 2 &&
  (src.match(/Math\.min\(s\.dayNo, TREND_DAYS_CAP\)/g) || []).length === 2);
check('极端日减弱回归但不取消', /shock > 1 \? PULL_BACK \* 0\.35 : PULL_BACK/.test(src));
check('买卖与分红公式未动（资金守恒）',
  /price \* n \* \(1 \+ feeRate\)/.test(src) && /price \* n \* \(1 - feeRate\)/.test(src) &&
  /dividend \+= n \* p \* divRateOf\(id\)/.test(src));
check('固定随机 0.5 的既有持久化探针不会触发 shock', 0.5 >= SHOCK_CHANCE);

/* ---------- 分布仿真（复现日结公式，单只、20000 天） ---------- */
function simulate(days, seed) {
  let rng = seed >>> 0;
  const rand = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
  const drift = (DRIFT_MIN + DRIFT_MAX) / 2;
  const noiseAmp = (NOISE_MIN + NOISE_MAX) / 2;
  let price = BASE_PRICE, dayNo = 0, shocks = 0, ups = 0, maxAbs = 0, outOfRange = 0;
  const moves = [];
  for (let d = 0; d < days; d++) {
    dayNo++;
    let shock = 1;
    if (rand() < SHOCK_CHANCE) { shock = SHOCK_MIN + rand() * (SHOCK_MAX - SHOCK_MIN); shocks++; }
    let noise = (rand() * 2 - 1) * noiseAmp * shock;
    noise = Math.max(-DAILY_CAP, Math.min(DAILY_CAP, noise));
    const trend = Math.min(PRICE_CAP, BASE_PRICE * Math.pow(1 + drift, Math.min(dayNo, TREND_DAYS_CAP)));
    const before = price;
    let p = price * (1 + drift + noise);
    p = p + (trend - p) * (shock > 1 ? PULL_BACK * 0.35 : PULL_BACK);
    price = Math.max(50, before * (1 - DAILY_CAP), Math.min(PRICE_CAP, before * (1 + DAILY_CAP), Math.round(p * 100) / 100));
    const chg = price / before - 1;
    if (chg > 0) ups++;
    if (Math.abs(chg) > maxAbs) maxAbs = Math.abs(chg);
    if (price < 50 || price > PRICE_CAP) outOfRange++;
    moves.push(chg);
  }
  const abs = moves.map(Math.abs).sort((a, b) => a - b);
  return {
    shocks, days, shockRate: shocks / days, ups, upRate: ups / days,
    maxAbs, outOfRange, median: abs[Math.floor(days / 2)], p99: abs[Math.floor(days * 0.99)],
    p999: abs[Math.floor(days * 0.999)], max: abs[days - 1], finalPrice: price
  };
}

const r1 = simulate(20000, 20261111);
const r2 = simulate(20000, 777);
check('常规波动确实放大（中位 ≥3% 且 P99 ≥9%，旧版约 2.1%/5%）', r1.median >= 0.03 && r1.p99 >= 0.09,
  { median: r1.median, p99: r1.p99 });
check('极端行情确实稀少（占比 1%~2.5%）', r1.shockRate >= 0.01 && r1.shockRate <= 0.025, r1.shockRate);
/* 极端只占 1.5%，P99 按定义仍落在常规区；要看大跳必须看 P99.9 / 最大值 */
check('确实存在单日大跳（P99.9 ≥20% 且最大 ≥25%）', r1.p999 >= 0.20 && r1.max >= 0.25,
  { p999: r1.p999, max: r1.max });
check('单日涨跌被 ±45% 截断', r1.max <= DAILY_CAP + 1e-9 && r2.max <= DAILY_CAP + 1e-9, [r1.max, r2.max]);
check('20000 天价格始终在 [50, 20×基准] 内', r1.outOfRange === 0 && r2.outOfRange === 0, [r1.outOfRange, r2.outOfRange]);
check('涨跌方向不偏斜（上涨占比 45%~55%）', r1.upRate >= 0.45 && r1.upRate <= 0.55, r1.upRate);
check('第二个随机种子结论一致（非偶然）', r2.shockRate >= 0.01 && r2.shockRate <= 0.025 &&
  r2.median >= 0.03 && r2.p999 >= 0.20 && r2.max >= 0.25 && r2.upRate >= 0.45 && r2.upRate <= 0.55,
  { shockRate: r2.shockRate, median: r2.median, p999: r2.p999, max: r2.max, upRate: r2.upRate });
check('长局趋势线封顶后 dev 不会再变 -99%', Math.min(PRICE_CAP, BASE_PRICE * Math.pow(1.005, 3000)) === PRICE_CAP);

const daySource = src.slice(src.indexOf('export function ensureDay()'), src.indexOf('/* ---------- 快照（页面渲染用')).replace('export function', 'function');
const limits = src.slice(src.indexOf('export const BASE_PRICE'), src.indexOf('export const GIRLS')).replace(/^export /gm, '');
function productionDay(previous, dayNo, days) {
  const state = { day: 'old', dayNo, prices: { tested: previous }, hold: { tested: 10 }, gift: true, pendingDiv: 0, earned: 0, tips: [] };
  const math = Object.create(Math); math.random = () => 0.5;
  let receipt;
  const box = vm.createContext({
    Math: math, LISTED: ['tested'], loadError: '', saveBlocked: () => false, read: () => state,
    dayKey: () => 'today', dayDiff: () => days, driftOf: () => 0.005, noiseOf: () => 0.16,
    heatOf: () => 0, divRateOf: () => 0.015, affTip: () => '',
    write(s, credit) { receipt = credit; return { ok: true }; },
  });
  const result = vm.runInContext(limits + daySource + "\nensureDay()", box);
  return { result, price: state.prices.tested, receipt };
}
const low = productionDay(100, 0, 1), long = productionDay(100, 400, 1);
const high = productionDay(30000, 0, 1), multi = productionDay(100, 400, 3);
const chained = [400, 401, 402].reduce((p, d) => productionDay(p, d, 1).price, 100);
check('实际日结限制旧档低价并按最终价分红', low.result.ok && low.price === 145 && low.receipt === Math.round(145 * 10 * 0.015), low);
check('实际日结的长局趋势回归同样限幅', long.result.ok && long.price === 145, long);
check('实际日结将超界旧价归入新区间', high.result.ok && high.price >= 11000 && high.price <= 20000, high);
check('实际离线三天按日限幅，等于逐日结算', multi.result.ok && multi.price === chained && multi.price <= 100 * Math.pow(1.45, 3), multi);

const failures = rows.filter(r => !r.passed);
save({ rows, sim: { seed1: r1, seed2: r2 } });
console.log(JSON.stringify({ passed: rows.length - failures.length, failed: failures.length, failures, output: out, sim: r1 }, null, 2));
process.exitCode = failures.length ? 1 : 0;
