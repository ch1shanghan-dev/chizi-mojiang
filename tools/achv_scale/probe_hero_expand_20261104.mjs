/* 武将路线扩容 · 探针（2026-11-04）
   ------------------------------------------------------------
   验证 cx_* 这 600 条是活的，不是死条件：
   1. 每条都有可达正例（把 metric 置到 goal 即判定成立）
   2. 每条都有反例（goal-1 不成立）
   3. 归属隔离（换成别的武将出战不成立）
   4. 模式白名单（国战不成立）
   5. 真实事件链路（feed → prepareMastery → judge）能推进 s:/c:/d: 三类
   6. 旧存档加载后记录不丢

   直接调 r.test 而不是 judge：test 是判定真源，judge 只是加了索引与去向过滤，
   索引与白名单在 4 里单独断言，避免两件事混在一条断言里互相掩盖。

   跑法：node tools/achv_scale/probe_hero_expand_20261104.mjs [--out <json>]
*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(path.join(here, '..', '..'));
const SRC = fs.readFileSync(path.join(ROOT, 'core', 'csh_pool_achv.js'), 'utf8');

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
const PA = sandbox.window.CSH_POOL_ACHV;

const checks = [];
const check = (name, fn) => {
  let value;
  try { value = fn(); } catch (e) { checks.push({ name, passed: false, error: e.message }); return; }
  checks.push({ name, passed: value === true, ...(value === true ? {} : { detail: value }) });
};

const expandRules = PA.RULES.filter((r) => /^cx_/.test(r.id));
const byHero = {};
for (const r of expandRules) (byHero[r.hero] = byHero[r.hero] || []).push(r);

check('扩展规则已注册且 ID 唯一', () =>
  expandRules.length > 0 && new Set(PA.RULES.map((r) => r.id)).size === PA.RULES.length);

check('每名武将都有扩展路线', () => Object.keys(byHero).length === PA.PROFILES.length);

/* 构造一局，meChars 指定出战武将，直接把 metric 置位（不经过事件），用于纯判定。
   feat 类规则没有单一 metric，传入完整的 requires 条件组。 */
function runWithMetrics(hero, pairs) {
  const a = PA.newRun({ mode: 'identity', meSeat: 0, meIdentity: 'zhu', seatCount: 3 });
  a.meChars = [hero];
  a.masteryCounts = a.masteryCounts || {};
  a.masteryPeaks = a.masteryPeaks || {};
  for (const [metric, value] of pairs) {
    if (metric.startsWith('p:')) a.masteryPeaks[metric] = value;
    else a.masteryCounts[metric] = value;
  }
  const st = { got: {}, seen: {}, chars: {}, mastery: {} };
  PA.prepareMastery(st, a);
  return a;
}
/* 一条规则的正例条件组 / 反例条件组 */
function pairsOf(r) {
  if (r.scope === 'feat') return r.requires.map((q) => [q[0], q[1]]);
  return [[r.metric, r.goal]];
}
function weakPairsOf(r) {
  const pairs = pairsOf(r).map((p) => [p[0], p[1]]);
  pairs[0][1] = Math.max(0, pairs[0][1] - 1);
  return pairs;
}

let posFail = [], negFail = [], ownerFail = [];
for (const r of expandRules) {
  const pos = r.test({ t: 'over', win: true }, runWithMetrics(r.hero, pairsOf(r)));
  if (pos !== true) posFail.push(r.id);
  const neg = r.test({ t: 'over', win: true }, runWithMetrics(r.hero, weakPairsOf(r)));
  if (neg !== false) negFail.push(r.id);
  const other = PA.PROFILES.find((p) => p.id !== r.hero).id;
  const own = r.test({ t: 'over', win: true }, runWithMetrics(other, pairsOf(r)));
  if (own !== false) ownerFail.push(r.id);
}

check('全部 ' + expandRules.length + ' 条正例可达', () => posFail.length === 0 || '失败: ' + posFail.slice(0, 5).join(','));
check('全部 ' + expandRules.length + ' 条反例（缺一个条件即不成立）', () => negFail.length === 0 || '失败: ' + negFail.slice(0, 5).join(','));
check('全部 ' + expandRules.length + ' 条武将归属隔离', () => ownerFail.length === 0 || '失败: ' + ownerFail.slice(0, 5).join(','));

/* 同局组合必须"同局"：拆成两局分别满足一半条件时不得成立 */
const featRules = expandRules.filter((r) => r.scope === 'feat');
check('同局组合不能被拆成多局拼凑（' + featRules.length + ' 条）', () => {
  const bad = [];
  for (const r of featRules) {
    const req = r.requires.map((q) => [q[0], q[1]]);
    if (req.length < 2) continue;
    /* 第一局只给前半条件 */
    const a = runWithMetrics(r.hero, req.slice(0, 1));
    if (r.test({ t: 'over', win: true }, a) === true) { bad.push(r.id); continue; }
    /* 第二局只给后半条件：新的一局，之前的累计必须不继承 */
    const b = runWithMetrics(r.hero, req.slice(1));
    if (r.test({ t: 'over', win: true }, b) === true) bad.push(r.id);
  }
  return bad.length === 0 || bad.slice(0, 5).join(',');
});

/* 同局阈值必须单局可及：任何条件组里不得出现超出本局物理上限的要求 */
check('同局阈值均不高于单局常见上限', () => {
  const CAP = { 'c:sha': 8, 'c:shan': 6, 'c:tao': 5, 'c:jiu': 5, 'd:all': 15, 'd:sha': 12, 'g:cards': 25, 'l:discard': 20, 'r:recover': 8, 'q:judge': 8, 'p:hand': 20, 'p:armor': 12 };
  const bad = [];
  for (const r of featRules) for (const [m, n] of r.requires) {
    if (/^s:/.test(m)) { if (n > 6) bad.push(r.id + ' ' + m + '=' + n); continue; }
    const cap = CAP[m];
    if (cap != null && n > cap) bad.push(r.id + ' ' + m + '=' + n);
  }
  return bad.length === 0 || bad.slice(0, 5).join(',');
});

/* 模式白名单：国战不在 MODES 里，judge 必须整体拒绝 */
check('国战模式下 judge 不产出任何扩展成就', () => {
  const r0 = expandRules.find((r) => r.scope !== 'feat') || expandRules[0];
  const a = runWithMetrics(r0.hero, pairsOf(r0));
  a.mode = 'guozhan';
  return PA.judge(a, { t: 'over', seat: 0, win: true }).length === 0;
});

/* 真实事件链路：s: 技能次数、c: 牌、d: 伤害 走 feed 聚合再判定 */
function chainedCase(hero, events, ruleId) {
  const a = PA.newRun({ mode: 'identity', meSeat: 0, meIdentity: 'zhu', seatCount: 3 });
  a.meChars = [hero];
  const st = { got: {}, seen: {}, chars: {}, mastery: {} };
  for (const ev of events) {
    PA.feed(a, ev);
    PA.prepareMastery(st, a);
    PA.acceptMastery(a);
  }
  const r = PA.RULES.find((x) => x.id === ruleId);
  return r ? r.test({ t: 'over', win: true }, a) : 'rule missing';
}

/* 找一条 s: 规则做链路验证：把该技能发动到 goal 次 */
const skillRule = expandRules.find((r) => /^s:/.test(r.metric));
check('技能类目标能被 useSkill 事件推进', () => {
  if (!skillRule) return 'no skill rule';
  const skill = skillRule.metric.slice(2);
  const events = Array.from({ length: skillRule.goal }, () => ({ t: 'useSkill', seat: 0, skill, masteryObserved: false }));
  return chainedCase(skillRule.hero, events, skillRule.id) === true;
});

const cardRule = expandRules.find((r) => /^c:[a-z]+$/.test(r.metric) && !r.metric.startsWith('c:type'));
check('牌类目标能被 useCard 事件推进', () => {
  if (!cardRule) return 'no card rule';
  const name = cardRule.metric.slice(2);
  const events = Array.from({ length: cardRule.goal }, () => ({ t: 'useCard', seat: 0, name, cardType: 'basic', targets: 1, handAfter: 3, before: 1, respond: false }));
  return chainedCase(cardRule.hero, events, cardRule.id) === true;
});

const dmgRule = expandRules.find((r) => /^d:/.test(r.metric));
check('伤害类目标能被 damage 事件推进', () => {
  if (!dmgRule) return 'no damage rule';
  const key = dmgRule.metric.slice(2);
  const events = [];
  let left = dmgRule.goal;
  while (left > 0) {
    const step = Math.min(3, left);
    events.push({ t: 'damage', seat: 0, victimSeat: 1, num: step, cardName: key === 'sha' ? 'sha' : undefined, natures: ['fire', 'thunder', 'ice'].includes(key) ? [key] : [] });
    left -= step;
  }
  return chainedCase(dmgRule.hero, events, dmgRule.id) === true;
});

/* 旧档兼容：旧记录加载后原样保留，扩展成就不凭空变成已完成 */
check('旧存档加载后旧记录保留且扩展成就未自动完成', () => {
  const seeded = {
    v: 2,
    got: { op_one_slash: { t: 1700000000000, m: 'identity', n: 1 } },
    seen: { op_one_slash: 1 },
    results: [],
    chars: { csh_dz: 12 },
    progress: { op_cards_total: 99 },
    mastery: { csh_dz: { totals: { 's:csh_yiwu': 7 }, peaks: { 'p:hand': 5 } } },
  };
  ls.setItem(PA.KEY, JSON.stringify(seeded));
  const loaded = PA.load();
  const kept = loaded.got && loaded.got.op_one_slash && loaded.got.op_one_slash.t === 1700000000000;
  const notAuto = !expandRules.some((r) => loaded.got[r.id]);
  const masteryKept = loaded.mastery && loaded.mastery.csh_dz && loaded.mastery.csh_dz.totals['s:csh_yiwu'] === 7;
  ls.removeItem(PA.KEY);
  return (kept && notAuto && masteryKept) || { kept, notAuto, masteryKept };
});

/* 数值约束：档位必须是递增且不重复，防止两档写成同一个目标 */
check('每条路线的档位严格递增', () => {
  const bad = [];
  for (const hero of Object.keys(byHero)) {
    const group = {};
    for (const r of byHero[hero]) {
      if (r.scope === 'feat' || !r.metric) continue;
      const key = r.metric + '|' + r.scope;
      (group[key] = group[key] || []).push(r.goal);
    }
    for (const key of Object.keys(group)) {
      const arr = group[key];
      for (let i = 1; i < arr.length; i++) if (arr[i] <= arr[i - 1]) bad.push(hero + ' ' + key);
    }
  }
  return bad.length === 0 || bad.slice(0, 5).join(',');
});

const passed = checks.filter((c) => c.passed).length;
const result = {
  scope: '静态判定 + 合成事件链路 + 隔离存储；不是自然对局抽样',
  expandRules: expandRules.length,
  heroes: Object.keys(byHero).length,
  passed,
  failed: checks.length - passed,
  failures: checks.filter((c) => !c.passed),
  checks,
};
const outIdx = process.argv.indexOf('--out');
if (outIdx > 0) fs.writeFileSync(process.argv[outIdx + 1], JSON.stringify(result, null, 2));
console.log(JSON.stringify({ expandRules: result.expandRules, heroes: result.heroes, passed, failed: result.failed, failures: result.failures }, null, 2));
if (result.failed) process.exitCode = 1;
