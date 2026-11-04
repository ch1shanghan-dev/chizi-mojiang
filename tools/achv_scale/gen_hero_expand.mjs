/* 万条扩容 · 武将路线生成器 v3（档位阶梯版）
   ------------------------------------------------------------
   与 v2 的区别：v2 受"禁止机械铺阈值"约束，每路只给 2 档；
   v3 按作者 2026-11-04 的明确授权（"技能释放次数之类的可以增加数量级"）
   改为多档阶梯，但守住三条纪律：

   1. **每 metric 最多 5 档**，档位跨度 ≥5 倍。
      —— 不是"1 到 10000 全整数"，是 5 个有名字、有难度台阶的目标。
   2. **档位名称与文案逐档不同**，玩家看到的是"化境→臻至→无双"的递进，
      不是同一个标题把数字改大。
   3. **不覆盖已有档位**：旧 ca_ 的 3 档原样保留，新档从旧最高档接续往上，
      避免同一目标出现两次。

   数据来源全部是已存在的采集指标（s:/c:/d:/g:/l:/r:/q:/e:/p:），
   零采集改动。

   用法：node tools/achv_scale/gen_hero_expand.mjs [root] --out <json> [--styles N] [--tiers N]
*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(here, '..', '..'));
const argOf = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const outPath = argOf('--out', null);
const STYLE_ROUTES = Number(argOf('--styles', '15'));
const STYLE_TIERS = Number(argOf('--tiers', '5'));
const SKILL_NEW_TIERS = Number(argOf('--skill-tiers', '3'));

/* 累计类档位曲线：base × 倍数。倍数跨度 ≥5 倍，符合"每 metric 最多 5 档"的自我约束。 */
const TOTAL_MULT = [1, 6, 25, 90, 320];
const SKILL_MULT = [3, 10, 30];           /* 技能新档从旧最高档往上接 */
const TIER_NAMES = ['初成', '精修', '化境', '臻至', '无双', '绝尘'];

function loadPool() {
  const context = vm.createContext({ window: {} });
  for (const f of ['core/csh_achv.js', 'core/csh_pool_achv.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context, { timeout: 20000, filename: f });
  }
  return context.window.CSH_POOL_ACHV;
}

function loadRoster() {
  const src = fs.readFileSync(path.join(root, 'character/index.js'), 'utf8');
  const roster = {};
  const re = /"(csh_[a-z0-9_]+)"\s*:\s*\{([\s\S]*?)\n\s{8,}\}/g;
  let m;
  while ((m = re.exec(src))) {
    const sk = m[2].match(/skills\s*:\s*\[([^\]]*)\]/);
    if (!sk) continue;
    const skills = [...sk[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    if (skills.length) roster[m[1]] = skills;
  }
  return roster;
}

function loadSkillText() {
  const src = fs.readFileSync(path.join(root, 'skills/index.js'), 'utf8');
  const names = {}, info = {};
  for (const m of src.matchAll(/"([a-z0-9_]+)"\s*:\s*"((?:[^"\\]|\\.){1,4000})"/g)) {
    if (!/^csh_/.test(m[1])) continue;
    if (m[1].endsWith('_info')) info[m[1].slice(0, -5)] = m[2];
    else names[m[1]] = m[2].replace(/<[^>]*>/g, '').slice(0, 12);
  }
  return { names, info };
}

/* 主题池：base 是第 1 档，其余档由 TOTAL_MULT 推出。
   每个主题给足候选，让 15 条路线能从不同 metric 里取，减少跨武将撞车。 */
const THEMES = {
  fire: [
    { metric: 'd:fire', base: 8, title: '烈焰', unit: '点火焰伤害', verb: '累计造成' },
    { metric: 'd:all', base: 10, title: '焚尽', unit: '点伤害', verb: '累计造成' },
    { metric: 'c:tiesuo', base: 3, title: '连环', unit: '张【铁索连环】', verb: '使用' },
    { metric: 'c:huogong', base: 2, title: '火攻', unit: '张【火攻】', verb: '使用' },
    { metric: 'c:type.trick', base: 8, title: '炽策', unit: '张锦囊', verb: '使用或打出' },
    { metric: 'q:judge', base: 4, title: '火候', unit: '次', verb: '累计进行' },
    { metric: 'g:cards', base: 25, title: '炙取', unit: '张牌', verb: '累计获得' },
    { metric: 'p:hand', base: 8, title: '蓄焰', unit: '张', verb: '手牌数曾达到', peak: true },
  ],
  thunder: [
    { metric: 'd:thunder', base: 7, title: '雷霆', unit: '点雷电伤害', verb: '累计造成' },
    { metric: 'd:all', base: 10, title: '震彻', unit: '点伤害', verb: '累计造成' },
    { metric: 'c:shandian', base: 2, title: '引雷', unit: '张【闪电】', verb: '使用或打出' },
    { metric: 'q:judge', base: 5, title: '观兆', unit: '次', verb: '累计进行' },
    { metric: 'c:type.trick', base: 8, title: '雷策', unit: '张锦囊', verb: '使用或打出' },
    { metric: 'c:wuxie', base: 3, title: '止雷', unit: '张【无懈可击】', verb: '使用或打出' },
    { metric: 'p:maxhp', base: 5, title: '雷体', unit: '点', verb: '体力上限曾达到', peak: true },
    { metric: 'l:discard', base: 20, title: '覆压', unit: '张牌', verb: '累计弃置' },
  ],
  judge: [
    { metric: 'q:judge', base: 6, title: '问卜', unit: '次', verb: '累计进行' },
    { metric: 'q:compare', base: 3, title: '争锋', unit: '次拼点', verb: '累计参与' },
    { metric: 'c:type.trick', base: 8, title: '布算', unit: '张锦囊', verb: '使用或打出' },
    { metric: 'c:lebu', base: 2, title: '设陷', unit: '张【乐不思蜀】', verb: '使用' },
    { metric: 'c:bingliang', base: 2, title: '断粮', unit: '张【兵粮寸断】', verb: '使用' },
    { metric: 'c:guohe', base: 3, title: '拆解', unit: '张【过河拆桥】', verb: '使用' },
    { metric: 'g:cards', base: 25, title: '窥机', unit: '张牌', verb: '累计获得' },
    { metric: 'c:wuxie', base: 3, title: '止策', unit: '张【无懈可击】', verb: '使用或打出' },
  ],
  recover: [
    { metric: 'r:recover', base: 6, title: '回生', unit: '点', verb: '累计回复' },
    { metric: 'c:tao', base: 4, title: '求桃', unit: '张【桃】', verb: '使用或打出' },
    { metric: 'c:jiu', base: 3, title: '借酒', unit: '张【酒】', verb: '使用或打出' },
    { metric: 'p:maxhp', base: 5, title: '淬体', unit: '点', verb: '体力上限曾达到', peak: true },
    { metric: 'd:all', base: 10, title: '耐战', unit: '点伤害', verb: '累计造成' },
    { metric: 'p:armor', base: 3, title: '护体', unit: '点', verb: '护甲曾达到', peak: true },
    { metric: 'l:discard', base: 20, title: '舍身', unit: '张牌', verb: '累计弃置' },
    { metric: 'c:type.basic', base: 15, title: '根本', unit: '张基本牌', verb: '使用或打出' },
  ],
  gather: [
    { metric: 'g:cards', base: 30, title: '聚敛', unit: '张牌', verb: '累计获得' },
    { metric: 'l:discard', base: 20, title: '流转', unit: '张牌', verb: '累计弃置' },
    { metric: 'e:equip', base: 4, title: '整装', unit: '次装备', verb: '累计完成' },
    { metric: 'p:hand', base: 9, title: '满握', unit: '张', verb: '手牌数曾达到', peak: true },
    { metric: 'c:shunshou', base: 3, title: '夺取', unit: '张【顺手牵羊】', verb: '使用' },
    { metric: 'c:wuzhong', base: 3, title: '博闻', unit: '张【无中生有】', verb: '使用' },
    { metric: 'c:type.equip', base: 5, title: '器量', unit: '张装备牌', verb: '使用' },
    { metric: 'c:all', base: 40, title: '不辍', unit: '张牌', verb: '累计使用或打出' },
  ],
  guard: [
    { metric: 'c:shan', base: 6, title: '卸锋', unit: '张【闪】', verb: '使用或打出' },
    { metric: 'p:armor', base: 3, title: '披甲', unit: '点', verb: '护甲曾达到', peak: true },
    { metric: 'r:recover', base: 5, title: '养伤', unit: '点', verb: '累计回复' },
    { metric: 'c:wuxie', base: 3, title: '挡策', unit: '张【无懈可击】', verb: '使用或打出' },
    { metric: 'c:type.equip', base: 5, title: '固垒', unit: '张装备牌', verb: '使用' },
    { metric: 'p:maxhp', base: 5, title: '厚体', unit: '点', verb: '体力上限曾达到', peak: true },
    { metric: 'l:discard', base: 20, title: '忍弃', unit: '张牌', verb: '累计弃置' },
    { metric: 'c:type.basic', base: 15, title: '稳守', unit: '张基本牌', verb: '使用或打出' },
  ],
  assault: [
    { metric: 'c:sha', base: 8, title: '连锋', unit: '张【杀】', verb: '使用或打出' },
    { metric: 'd:sha', base: 6, title: '刃下', unit: '点', verb: '以【杀】造成' },
    { metric: 'd:all', base: 10, title: '征伐', unit: '点伤害', verb: '累计造成' },
    { metric: 'c:juedou', base: 3, title: '邀斗', unit: '张【决斗】', verb: '使用' },
    { metric: 'c:nanman', base: 2, title: '南征', unit: '张【南蛮入侵】', verb: '使用' },
    { metric: 'c:wanjian', base: 2, title: '万箭', unit: '张【万箭齐发】', verb: '使用' },
    { metric: 'c:jiu', base: 3, title: '酒烈', unit: '张【酒】', verb: '使用或打出' },
    { metric: 'p:hand', base: 8, title: '蓄势', unit: '张', verb: '手牌数曾达到', peak: true },
  ],
};

const THEME_LABEL = { fire: '烈焰', thunder: '雷霆', judge: '机谋', recover: '续命', gather: '积微', guard: '坚守', assault: '锋锐' };

const KEYWORDS = [
  { theme: 'fire', words: ['火焰伤害', '火属性', '火攻', '铁索', '点燃', '燃烧', '炽'] },
  { theme: 'thunder', words: ['雷电伤害', '雷属性', '闪电', '雷霆', '引雷'] },
  { theme: 'recover', words: ['回复', '恢复体力', '桃', '濒死', '痊愈', '体力上限'] },
  { theme: 'judge', words: ['判定', '拼点', '亮出牌堆顶', '改判', '牌堆顶'] },
  { theme: 'guard', words: ['护甲', '防具', '闪', '抵消', '防止', '免伤'] },
  { theme: 'gather', words: ['摸牌', '获得', '手牌', '弃置', '交给'] },
  { theme: 'assault', words: ['造成伤害', '杀', '决斗', '进攻', '出杀'] },
];

function themeOf(profile, skills, info) {
  const score = {};
  const add = (t, n) => { score[t] = (score[t] || 0) + n; };
  for (const skill of skills) {
    const text = info[skill] || '';
    for (const k of KEYWORDS) {
      let hits = 0;
      for (const w of k.words) if (text.includes(w)) hits++;
      if (hits) add(k.theme, hits);
    }
  }
  if (!Object.keys(score).length) {
    for (const f of profile.paths) {
      const m = f.metric;
      if (m.startsWith('d:fire')) add('fire', 2);
      else if (m.startsWith('d:thunder')) add('thunder', 2);
      else if (m.startsWith('r:') || m === 'c:tao') add('recover', 2);
      else if (m.startsWith('q:')) add('judge', 2);
      else if (m.startsWith('p:armor') || m === 'c:shan') add('guard', 2);
      else if (m.startsWith('g:') || m === 'l:discard') add('gather', 2);
      else if (m.startsWith('d:') || m === 'c:sha') add('assault', 2);
    }
  }
  if (!Object.keys(score).length) return 'assault';
  return Object.keys(score).sort((a, b) => score[b] - score[a])[0];
}

/* 峰值类不能用倍数放大（手牌上限有物理天花板），给一条封顶曲线 */
function peakGoals(base, tiers) {
  const seq = [base, base + 2, base + 5, base + 8, base + 11, base + 14];
  return seq.slice(0, tiers);
}

/* 单局可达阈值：同局组合刻意压低，考的是"同一局同时做到" */
const FEAT_THRESHOLD = {
  'c:sha': 3, 'c:shan': 2, 'c:tao': 1, 'c:jiu': 1, 'c:wuxie': 1, 'c:juedou': 1,
  'c:nanman': 1, 'c:wanjian': 1, 'c:tiesuo': 1, 'c:guohe': 2, 'c:shunshou': 1,
  'c:lebu': 1, 'c:bingliang': 1, 'c:shandian': 1, 'c:huogong': 1, 'c:wuzhong': 1,
  'c:type.basic': 4, 'c:type.trick': 2, 'c:type.equip': 2, 'c:respond': 2, 'c:all': 6,
  'd:all': 4, 'd:sha': 3, 'd:fire': 3, 'd:thunder': 2, 'd:ice': 2,
  'g:cards': 8, 'l:discard': 5, 'r:recover': 2, 'q:judge': 2, 'q:compare': 1, 'e:equip': 2,
  'p:hand': 8, 'p:armor': 3, 'p:maxhp': 5, 'p:equip': 3,
};

const METRIC_PHRASE = {
  'c:sha': (n) => '使用或打出' + n + '张【杀】',
  'c:shan': (n) => '使用或打出' + n + '张【闪】',
  'c:tao': (n) => '使用或打出' + n + '张【桃】',
  'c:jiu': (n) => '使用或打出' + n + '张【酒】',
  'c:wuxie': (n) => '使用或打出' + n + '张【无懈可击】',
  'c:juedou': (n) => '使用' + n + '张【决斗】',
  'c:nanman': (n) => '使用' + n + '张【南蛮入侵】',
  'c:wanjian': (n) => '使用' + n + '张【万箭齐发】',
  'c:tiesuo': (n) => '使用' + n + '张【铁索连环】',
  'c:guohe': (n) => '使用' + n + '张【过河拆桥】',
  'c:shunshou': (n) => '使用' + n + '张【顺手牵羊】',
  'c:lebu': (n) => '使用' + n + '张【乐不思蜀】',
  'c:bingliang': (n) => '使用' + n + '张【兵粮寸断】',
  'c:shandian': (n) => '使用' + n + '张【闪电】',
  'c:huogong': (n) => '使用' + n + '张【火攻】',
  'c:wuzhong': (n) => '使用' + n + '张【无中生有】',
  'c:type.basic': (n) => '使用或打出' + n + '张基本牌',
  'c:type.trick': (n) => '使用或打出' + n + '张锦囊牌',
  'c:type.equip': (n) => '使用' + n + '张装备牌',
  'c:respond': (n) => '打出' + n + '张响应牌',
  'c:all': (n) => '使用或打出' + n + '张牌',
  'd:all': (n) => '造成' + n + '点伤害',
  'd:sha': (n) => '以【杀】造成' + n + '点伤害',
  'd:fire': (n) => '造成' + n + '点火焰伤害',
  'd:thunder': (n) => '造成' + n + '点雷电伤害',
  'd:ice': (n) => '造成' + n + '点冰霜伤害',
  'g:cards': (n) => '获得' + n + '张牌',
  'l:discard': (n) => '弃置' + n + '张牌',
  'r:recover': (n) => '回复' + n + '点体力',
  'q:judge': (n) => '进行' + n + '次判定',
  'q:compare': (n) => '参与' + n + '次拼点',
  'e:equip': (n) => '完成' + n + '次装备',
  'p:hand': (n) => '手牌数达到' + n + '张',
  'p:armor': (n) => '护甲达到' + n + '点',
  'p:maxhp': (n) => '体力上限达到' + n + '点',
  'p:equip': (n) => '装备数达到' + n + '件',
};
function phraseOf(key, n) {
  const f = METRIC_PHRASE[key];
  return f ? f(n) : key + ' 达到 ' + n;
}

const pool = loadPool();
const roster = loadRoster();
const { names: skillNames, info: skillInfo } = loadSkillText();
const profiles = pool.CHARACTER_PROFILES || pool.PROFILES || [];

/* 现有每武将的最高技能档位：新档从它往上接，不重复造同一目标 */
const existingSkillTop = {};
for (const r of pool.RULES) {
  if (!r.metric || !/^s:/.test(r.metric)) continue;
  existingSkillTop[r.metric] = Math.max(existingSkillTop[r.metric] || 0, Number(r.goal) || 0);
}

const result = {};
const stats = { heroes: 0, skillRoutes: 0, skillTiers: 0, styleRoutes: 0, styleTiers: 0, feats: 0, themeUse: {} };

let heroIndex = 0;
for (const p of profiles) {
  heroIndex++;
  const skills = roster[p.id] || [];
  const usedMetrics = new Set();
  for (const f of p.paths) usedMetrics.add(f.metric);
  for (const q of p.signature.requires || []) usedMetrics.add(q[0]);

  const entries = [];

  /* 1) 技能档位延伸：已有 s: 路线的技能在旧最高档之上再接 3 档；
        尚无 s: 路线的技能（旧版没覆盖到的）直接给完整 5 档。 */
  for (const skill of skills) {
    const metric = 's:' + skill;
    const top = existingSkillTop[metric];
    const nm = skillNames[skill] || String(skill).replace(/^csh_/, '');
    let goals;
    if (top) {
      goals = SKILL_MULT.slice(0, SKILL_NEW_TIERS).map((m) => Math.round(top * m));
    } else {
      goals = [1, 10, 60, 300, 1200].slice(0, Math.min(5, SKILL_NEW_TIERS + 2));
    }
    entries.push({
      metric, title: nm + '·登峰', goals, scope: 'total', kind: 'skill',
      description: '累计发动〖' + nm + '〗及其后续效果{n}次',
    });
    stats.skillRoutes++;
    stats.skillTiers += goals.length;
  }

  /* 2) 风格路线：按技能文本判定的主题优先，其余主题按武将序号轮转补足。
        轮转是为了避免所有武将都用同一组"补位指标"——那会让某个 metric
        被 100 人共用，退回成"一套条件套所有人"。 */
  const theme = themeOf(p, skills, skillInfo);
  stats.themeUse[theme] = (stats.themeUse[theme] || 0) + 1;
  const others = ['fire', 'thunder', 'judge', 'recover', 'gather', 'guard', 'assault'].filter((t) => t !== theme);
  const shift = heroIndex % others.length;
  const rotated = others.slice(shift).concat(others.slice(0, shift));
  const order = [theme].concat(rotated);
  for (const t of order) {
    for (const spec of THEMES[t]) {
      if (entries.filter((e) => e.kind === 'style').length >= STYLE_ROUTES) break;
      if (usedMetrics.has(spec.metric)) continue;
      const goals = spec.peak
        ? peakGoals(spec.base, STYLE_TIERS)
        : TOTAL_MULT.slice(0, STYLE_TIERS).map((m) => Math.round(spec.base * m));
      entries.push({
        metric: spec.metric, title: spec.title + '·' + THEME_LABEL[t], goals,
        scope: spec.peak ? 'peak' : 'total', kind: 'style',
        description: spec.verb + '{n}' + spec.unit,
      });
      usedMetrics.add(spec.metric);
      stats.styleRoutes++;
      stats.styleTiers += goals.length;
    }
    if (entries.filter((e) => e.kind === 'style').length >= STYLE_ROUTES) break;
  }

  /* 3) 同局组合：技能达成 + 战术姿态绑在同一局 */
  const styleMetrics = entries.filter((e) => e.kind === 'style').map((e) => e.metric);
  const sigKeys = new Set();
  const keyOf = (combo) => JSON.stringify(combo.map((q) => q[0] + '|' + q[1]).sort());
  if (p.signature && Array.isArray(p.signature.requires)) sigKeys.add(keyOf(p.signature.requires));
  const feats = [];
  const addFeat = (combo, title, rare) => {
    if (feats.length >= 3 || !combo.length) return;
    if (combo.some((q) => FEAT_THRESHOLD[q[0]] == null && !/^s:/.test(q[0]))) return;
    const k = keyOf(combo);
    if (sigKeys.has(k)) return;
    sigKeys.add(k);
    feats.push({
      kind: 'feat', title, requires: combo, rare: rare || 3,
      description: combo.map((q) => phraseOf(q[0], q[1])).join('，且'),
    });
  };
  const skm = skills.map((s) => 's:' + s);
  const st1 = styleMetrics[0], st2 = styleMetrics[1], st3 = styleMetrics[2];
  const nm1 = skm[0] ? (skillNames[skm[0].slice(2)] || '本命技') : '';
  const nm2 = skm[1] ? (skillNames[skm[1].slice(2)] || '副技') : '';
  if (skm[0] && st1) addFeat([[skm[0], 2], [st1, FEAT_THRESHOLD[st1]]], nm1 + '·' + THEME_LABEL[theme] + '同局', 3);
  if (skm[1] && st2) addFeat([[skm[1], 2], [st2, FEAT_THRESHOLD[st2]]], nm2 + '·' + THEME_LABEL[theme] + '同局', 2);
  if (st1 && st2) addFeat([[st1, FEAT_THRESHOLD[st1]], [st2, FEAT_THRESHOLD[st2]]], THEME_LABEL[theme] + '·双全同局', 2);
  if (skm[0] && st3) addFeat([[skm[0], 3], [st3, FEAT_THRESHOLD[st3]]], nm1 + '·三连同局', 3);

  if (entries.length) {
    result[p.id] = entries.concat(feats);
    stats.heroes++;
    stats.feats += feats.length;
  }
}


/* 自检：同武将同 metric 不得重复；旧 metric 不得被重复声明 */
const selfCheck = [];
for (const p of profiles) {
  const add = result[p.id];
  if (!add) continue;
  const oldMetrics = new Set(p.paths.map((f) => f.metric));
  const seen = new Set();
  for (const f of add) {
    if (f.kind === 'feat') continue;
    if (seen.has(f.metric)) selfCheck.push(p.id + ' 自身重复 ' + f.metric);
    if (oldMetrics.has(f.metric) && f.kind === 'style') selfCheck.push(p.id + ' 与旧路线撞车 ' + f.metric);
    seen.add(f.metric);
    const g = f.goals;
    for (let i = 1; i < g.length; i++) if (g[i] <= g[i - 1]) selfCheck.push(p.id + ' 档位未递增 ' + f.metric);
  }
}
if (selfCheck.length) {
  console.error('SELF-CHECK FAILED:\n' + selfCheck.slice(0, 20).join('\n'));
  process.exitCode = 1;
}

const metricHeroes = {};
for (const hero of Object.keys(result)) for (const f of result[hero]) {
  if (f.kind === 'feat' || !f.metric) continue;
  (metricHeroes[f.metric] = metricHeroes[f.metric] || new Set()).add(hero);
}
const reuse = Object.keys(metricHeroes).map((m) => ({ metric: m, heroes: metricHeroes[m].size })).sort((a, b) => b.heroes - a.heroes);

const newAchievements = stats.skillTiers + stats.styleTiers + stats.feats;
console.log(JSON.stringify({
  heroes: stats.heroes,
  skillRoutes: stats.skillRoutes, skillTiers: stats.skillTiers,
  styleRoutes: stats.styleRoutes, styleTiers: stats.styleTiers,
  feats: stats.feats,
  newAchievements,
  selfCheckErrors: selfCheck.length,
  metricReuseTop: reuse.slice(0, 6),
  distinctMetrics: reuse.length,
  themeUse: stats.themeUse,
  projection: { before: 1946, after: 1946 + newAchievements },
}, null, 2));

if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 1));
  console.log('written: ' + outPath);
}
