/* 万条扩容 · 把武将路线写进 csh_pool_achv.js（追加式，不改旧序）
   ------------------------------------------------------------
   为什么是"追加在 RULES 末尾"而不是塞进 profiles.paths：
   tools/probe_achievement_expansion_batch2_20261101.mjs 断言的是
   「前 1438 条定义内容与顺序一字不变」，把新 path 插进 profiles 会让
   每个武将的规则位置整体后移，等于把这条保护断言直接撞碎。
   追加在末尾 + 给新 metric 单独开累加路径，两边都保住。

   可重复执行：用统一 APPEND 标记整块替换。
   用法：node tools/achv_scale/apply_hero_expand.mjs --root . --data <json>
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argOf = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const root = path.resolve(argOf('--root') || path.join(here, '..', '..'));
const dataPath = argOf('--data');
if (!dataPath) { console.error('缺 --data'); process.exit(2); }

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const target = path.join(root, 'core/csh_pool_achv.js');
let src = fs.readFileSync(target, 'utf8');

/* 稀有度映射：按"越高档越值钱"给梯度，但总量仍受预算约束。
   实测基线：原池子 1453 条共 367 万 pc。
   若 5 档全按 1..3 线性映射 → 3205 万（8.7 倍，会冲垮经济，已否决）。
   本方案 [1,1,1,2,3]：前 3 档普通，第 4 档稀有，第 5 档史诗。
   新增约 1326 万 = 原池子的 3.6 倍；配合生涯扩容后全服奖励总量约 1.31 亿，
   与"顶级资产成就 1 亿"同一量级，集齐成就刚好能摸到资产塔尖，不算印钞。 */
const TIER_RARE = [1, 1, 1, 2, 3];
const FEAT_RARE = 2;
/* 档位名最多 6 个，与新档位曲线对齐；超出时退回序号，绝不输出 undefined */
const TIER_NAMES = ['初成', '精修', '化境', '臻至', '无双', '绝尘'];

const BEGIN = '/* ===== BEGIN APPEND:hero-expand ===== */';
const END = '/* ===== END APPEND:hero-expand ===== */';

const lines = [];
let pathCount = 0, featCount = 0, tierCount = 0;
for (const heroId of Object.keys(data).sort()) {
  const paths = data[heroId];
  if (!Array.isArray(paths) || !paths.length) continue;
  const rows = paths.map((f) => {
    const desc = String(f.description).replace(/"/g, '\\"');
    if (f.kind === 'feat') {
      featCount++;
      const req = f.requires.map((q) => '["' + q[0] + '",' + q[1] + ']').join(',');
      return '{"kind":"feat","title":"' + f.title + '","requires":[' + req +
        '],"description":"' + desc + '","rare":' + FEAT_RARE + '}';
    }
    pathCount++;
    tierCount += f.goals.length;
    return '{"metric":"' + f.metric + '","title":"' + f.title + '","goals":[' + f.goals.join(',') +
      '],"scope":"' + f.scope + '","description":"' + desc + '"}';
  });
  lines.push('\t\t"' + heroId + '":[' + rows.join(',') + ']');
}

const block = [
  BEGIN,
  '\t/* 新路线表：只声明 metric 与文案，判定复用 masteryProgress，采集层零改动。',
  '\t   生成器 tools/achv_scale/gen_hero_expand.mjs；本块由 apply_hero_expand.mjs 整块替换。 */',
  '\tvar EXPAND_TIER_RARE = ' + JSON.stringify(TIER_RARE) + '; var EXPAND_FEAT_RARE = ' + FEAT_RARE + ';',
  '\tvar EXPAND_TIER_NAMES = ["初成", "精修", "化境", "臻至", "无双", "绝尘"];',
  '\tvar HERO_EXPAND = {',  lines.join(',\n'),
  '\t};',
  '\t/* 扩展 metric 的累加靠 p.paths：appendMasteryRules() 已在前面执行完，',
  '\t   此时再 concat 不会改变任何既有规则的生成顺序与位置，',
  '\t   但 prepareMastery 遍历 p.paths 时会把新 metric 计入历史累计/峰值。 */',
  '\tfunction heroExpandTest(p, r){',
  '\t\treturn function (ev, a) {',
  '\t\t\tif ((a.meChars || []).indexOf(p.id) < 0) return false;',
  '\t\t\t/* 同局组合挑战：全部条件必须在本局同时满足，不跨局拼接。 */',
  '\t\t\tif (r.scope === "feat") return (r.requires || []).every(function (q) { return masteryMetric(a, q[0]) >= q[1]; });',
  '\t\t\tvar state = a.masteryState || { got: {}, chars: {}, mastery: {} };',
  '\t\t\treturn masteryProgress(r, state).value >= r.goal;',
  '\t\t};',
  '\t}',
  '\t(function appendHeroExpandRules(){',
  '\t\tObject.keys(HERO_EXPAND).forEach(function (hid) {',
  '\t\t\tvar p = PROFILE_BY_ID[hid];',
  '\t\t\tif (!p) return;',
  '\t\t\tvar ex = HERO_EXPAND[hid];',
  '\t\t\t/* 先按扩展声明生成规则（追加在 RULES 末尾），再把声明并入 paths，',
  '\t\t\t   顺序不能反：反了会让 appendMasteryRules 之外多出一批位置错乱的规则。 */',
  '\t\t\tex.forEach(function (f, fi) {',
  '\t\t\t\tif (f.kind === "feat") {',
  '\t\t\t\t\tvar rf = {',
  '\t\t\t\t\t\tid: "cx_" + hid.slice(4) + "_feat_" + fi,',
  '\t\t\t\t\t\tname: p.name + " · " + f.title,',
  '\t\t\t\t\t\trare: EXPAND_FEAT_RARE, scope: "feat", requires: f.requires, goal: 1,',
  '\t\t\t\t\t\tdesc: "使用" + p.name + "，在同一局内" + f.description,',
  '\t\t\t\t\t\thint: "全部条件必须在同一局完成；不同对局的操作不能拼成这项挑战。",',
  '\t\t\t\t\t};',
  '\t\t\t\t\trf.hero = p.id; rf.heroName = p.name; rf.cat = "专属"; rf.modes = [];',
  '\t\t\t\t\trf.on = ["turn", "useCard", "useSkill", "damage", "judge", "hp", "over", "mastery"];',
  '\t\t\t\t\trf.test = heroExpandTest(p, rf);',
  '\t\t\t\t\tRULES.push(rf);',
  '\t\t\t\t\treturn;',
  '\t\t\t\t}',
  '\t\t\t\tf.goals.forEach(function (goal, ti) {',
  '\t\t\t\t\tvar r = {',
  '\t\t\t\t\t\tid: "cx_" + hid.slice(4) + "_" + fi + "_" + ti,',
  '\t\t\t\t\t\tname: p.name + " · " + f.title + " · " + (EXPAND_TIER_NAMES[ti] || ("第" + (ti + 1) + "阶")),',
  '\t\t\t\t\t\trare: EXPAND_TIER_RARE[Math.min(EXPAND_TIER_RARE.length - 1, ti)], metric: f.metric, scope: f.scope, goal: goal,',
  '\t\t\t\t\t\tdesc: "使用" + p.name + "，" + String(f.description).replace("{n}", goal),',
  '\t\t\t\t\t\thint: "单机身份、斗地主、对决中，以该武将本人出战时记录；不追溯没有保存的旧操作。",',
  '\t\t\t\t\t};',
  '\t\t\t\t\tr.hero = p.id; r.heroName = p.name; r.cat = "专属"; r.modes = [];',
  '\t\t\t\t\tr.on = ["turn", "useCard", "useSkill", "damage", "judge", "hp", "over", "mastery"];',
  '\t\t\t\t\tr.test = heroExpandTest(p, r);',
  '\t\t\t\t\tRULES.push(r);',
  '\t\t\t\t});',
  '\t\t\t});',
  '\t\t\t/* 只有"该武将 paths 里还没有的 metric"才需要并入：',
  '\t\t\t   prepareMastery 按 paths 逐项累加，同一 metric 出现两次会在单次遍历里',
  '\t\t\t   重复计入（实测把 2999 记成 5998），等于白送一半进度。',
  '\t\t\t   技能路线的 s: 早已在原 paths 中，不能重复声明；feat 没有 metric，也不进。 */',
  '\t\t\tvar seenMetric = {};',
  '\t\t\tp.paths.forEach(function (f) { if (f.metric) seenMetric[f.metric] = 1; });',
  '\t\t\tp.paths = p.paths.concat(ex.filter(function (f) {',
  '\t\t\t\tif (f.kind === "feat" || !f.metric || seenMetric[f.metric]) return false;',
  '\t\t\t\tseenMetric[f.metric] = 1;',
  '\t\t\t\treturn true;',
  '\t\t\t}));',
  '\t\t});',
  '\t})();',
  END,
].join('\n');

/* 1) 替换或插入数据+生成块：锚点在 INDEX 构建之前，保证旧规则顺序不动 */
if (src.includes(BEGIN) && src.includes(END)) {
  const start = src.indexOf(BEGIN);
  const stop = src.indexOf(END) + END.length;
  src = src.slice(0, start) + block + src.slice(stop);
} else {
  const anchor = '\tvar INDEX = {};';
  const at = src.indexOf(anchor);
  if (at < 0) { console.error('未找到插入锚点 var INDEX = {};'); process.exit(2); }
  const lineStart = src.lastIndexOf('\n', at) + 1;
  src = src.slice(0, lineStart) + block + '\n' + src.slice(lineStart);
}

/* 2) 不碰 prepareMastery 等既有函数体：源码必须能剥离成原始字节，
      否则 probe_achievement_expansion_batch2_20261101 的"基线源码哈希"保护就失效。 */

fs.writeFileSync(target, src);
console.log(JSON.stringify({ target, heroes: Object.keys(data).length, routes: pathCount, feats: featCount, routeAchievements: tierCount, totalAchievements: tierCount + featCount }, null, 2));
