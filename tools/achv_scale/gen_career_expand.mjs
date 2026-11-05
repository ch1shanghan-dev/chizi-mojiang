/* 生涯成就扩容生成器（493 → 2000）
   ------------------------------------------------------------
   生涯的判定形态与池子不同：prog(stats) => [cur, goal]，
   stats 是 csh_shell.buildStats 的真实快照（35 个可核字段）。
   所以扩容只做三件事，全部基于已有真实字段，不新增采集：

   A 单字段延伸：在现有最高档之上按几何级数接续，档位受字段物理上限约束
   B 组合成就：两个字段同时达标（"富且贵"这类），条件组合本身构成新目标
   C 比率类：胜率/局均击杀/赌桌回报率，带最小样本量门槛
      —— 没有门槛的话"1 战 1 胜 = 100% 胜率"会瞬间伪达成

   输出 JSON，由 apply_career_expand.mjs 转成代码块追加。
   用法：node tools/achv_scale/gen_career_expand.mjs [--out <json>] [--target 2000]
*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(path.join(here, '..', '..'));
const argOf = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const outPath = argOf('--out', null);
const TARGET = Number(argOf('--target', '2000'));

const ctx = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(root, 'core/csh_achv.js'), 'utf8'), ctx, { timeout: 30000 });
const A = ctx.window.CSH_ACHV;
const existing = A.defs;
const existingKeys = new Set(existing.map((d) => d.key));

/* 每个族的现有最高档，用来接续（不重复造同一目标） */
const famTop = {};
for (const d of existing) {
  const m = String(d.key).match(/^(.+)_(\d+(?:\.\d+)?)$/);
  if (m) famTop[m[1]] = Math.max(famTop[m[1]] || 0, Number(m[2]));
}

/* ---------- 字段表：名称、单位、类别、图标、物理上限、递增曲线 ---------- */
/* cap 取自真实实现：PC_CAP=1e11、merit 上限 999999999、场次存储 16000、
   世界当前名册 150 人、豪赌桌数有上限。超过 cap 的档位一律不生成。 */
const FIELDS = {
  merit:      { stats: 'merit', cat: '功勋', ico: '🏅', name: '功勋', unit: '点功勋', cap: 999999999, tiers: [400000, 550000, 750000, 1000000, 1400000, 1900000, 2600000, 3500000, 4700000, 6300000, 8500000, 11500000, 15500000, 21000000, 28000000, 38000000, 52000000, 70000000, 95000000, 130000000, 180000000, 250000000, 350000000, 480000000, 660000000, 900000000] },
  meritday:   { stats: 'meritToday', cat: '功勋', ico: '🏅', name: '单日功勋', unit: '点', cap: 999999999, tiers: [8000, 10000, 13000, 17000, 22000, 28000, 36000, 46000, 58000, 73000, 92000, 115000] },
  rich:       { stats: 'pc', cat: '资产', ico: '💰', name: '身家', unit: '池子币', cap: 100000000000, tiers: [130000000, 170000000, 220000000, 290000000, 380000000, 500000000, 650000000, 850000000, 1100000000, 1450000000, 1900000000, 2500000000, 3300000000, 4300000000, 5600000000, 7300000000, 9500000000, 12000000000, 16000000000, 21000000000] },
  peak:       { stats: 'pcPeak', cat: '资产', ico: '💰', name: '身家峰值', unit: '池子币', cap: 100000000000, tiers: [130000000, 170000000, 220000000, 290000000, 380000000, 500000000, 650000000, 850000000, 1100000000, 1450000000, 1900000000, 2500000000, 3300000000, 4300000000, 5600000000, 7300000000, 9500000000, 12000000000, 16000000000, 21000000000] },
  hands:      { stats: 'worldHands', cat: 'AI世界', ico: '🀄', name: '同桌人次', unit: '人次', cap: 40000000, tiers: [50000, 62000, 78000, 96000, 120000, 150000, 185000, 230000, 285000, 350000, 430000, 530000, 650000, 800000, 980000, 1200000, 1480000] },
  interact:   { stats: 'interactTotal', cat: '互动', ico: '💬', name: '互动次数', unit: '次', cap: 40000000, tiers: [34000, 40000, 48000, 57000, 68000, 81000, 96000, 115000, 137000, 163000, 195000, 232000, 276000, 328000, 390000, 465000, 555000, 660000, 780000, 920000] },
  kills:      { stats: 'wrKill', cat: '胜负', ico: '⚔️', name: '击杀', unit: '人', cap: 40000000, tiers: [11000, 12500, 14500, 16500, 19000, 22000, 25500, 29500, 34000, 39000] },
  chars:      { stats: 'wrChars', cat: '胜负', ico: '⚔️', name: '使用武将数', unit: '名', cap: 120, tiers: [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120] },
  games:      { stats: 'wrGames', cat: '胜负', ico: '⚔️', name: '对局数', unit: '局', cap: 16000, tiers: [11000, 12000, 13000, 14000, 15000] },
  wins:       { stats: 'wrWin', cat: '胜负', ico: '⚔️', name: '胜场', unit: '胜', cap: 16000, tiers: [11000, 12000, 13000, 14000, 15000] },
  loses:      { stats: 'wrLose', cat: '胜负', ico: '⚔️', name: '负场', unit: '负', cap: 16000, tiers: [7000, 8000, 9000, 10000, 11000] },
  gmplay:     { stats: 'gamblePlays', cat: '豪赌桌', ico: '🎲', name: '出战次数', unit: '场', cap: 200000, tiers: [1500, 1700, 1900, 2200, 2500, 2900, 3300, 3800, 4400, 5100, 5900, 6800, 7900, 9200] },
  gmwin:      { stats: 'gambleWins', cat: '豪赌桌', ico: '🎲', name: '胜局', unit: '胜', cap: 100000, tiers: [140, 160, 185, 215, 250, 290, 340, 395, 460, 1000, 1500, 2000, 3000, 4000, 4500, 5000, 5500, 6000] },
  gmnet:      { stats: 'gambleNet', cat: '豪赌桌', ico: '🎲', name: '净赢', unit: '池子币', cap: 100000000000, tiers: [] },
  gmbest:     { stats: 'gambleBest', cat: '豪赌桌', ico: '🎲', name: '单场最高', unit: '池子币', cap: 100000000000, tiers: [6000000, 7500000, 9500000, 12000000, 15000000, 19000000, 24000000, 30000000, 32000000, 35000000, 38000000, 39000000] },
  gmstreak:   { stats: 'gambleBestStreak', cat: '豪赌桌', ico: '🎲', name: '连胜', unit: '连胜', cap: 500, tiers: [24, 26, 29, 32, 36, 40, 45, 51, 58, 66, 70, 76, 78] },
  gmbust:     { stats: 'gambleBust', cat: '豪赌桌', ico: '🎲', name: '爆仓次数', unit: '次', cap: 5000, tiers: [185, 205, 228, 253, 281, 312, 347, 386, 430, 478, 531, 560, 590, 620, 660, 700, 750, 800, 830, 860, 890] },
  sign:       { stats: 'streak', cat: '签到', ico: '📅', name: '连续签到', unit: '天', cap: 3650, tiers: [380, 400, 420, 445, 470, 500, 530, 565, 600, 640, 680, 730, 785, 845] },
  task:       { stats: 'taskCompletedTotal', cat: '任务', ico: '📋', name: '日课完成', unit: '项', cap: 100000, tiers: [17, 19, 21, 23, 26, 29, 32, 36, 40, 45, 51, 58, 66, 75] },
  retired:    { stats: 'worldRetired', cat: 'AI世界', ico: '🌍', name: '当前退隐人数', unit: '名', cap: 150, tiers: [84, 88, 92, 96, 100, 105, 110, 116, 122, 130, 140, 150] },
};

/* 高难度档位的奖励可以更多（作者 2026-11-04 明确允许）。
   参数会被 push() 归一化为 ceil(x*5/50)*50，所以这里给的是归一化前的量级。 */
function rewardFor(i, total, base) {
  const k = total <= 1 ? 1 : i / (total - 1);
  return Math.round((base || 900) * (1 + k * k * 9));
}

/* ---------- A. 单字段延伸 ---------- */
const out = [];
const seen = new Set(existingKeys);
function addRow(row) {
  if (seen.has(row.key)) return false;
  seen.add(row.key);
  out.push(row);
  return true;
}

let counter = { single: 0, combo: 0, ratio: 0 };
for (const field of Object.keys(FIELDS)) {
  const f = FIELDS[field];
  const top = famTop[field] || 0;
  const tiers = f.tiers.filter((v) => v > top && v <= f.cap);
  tiers.forEach((v, i) => {
    const ok = addRow({
      kind: 'single',
      /* Preserve the shipped ID while correcting its unreachable 152-person goal. */
      key: 'cx_' + field + '_' + (field === 'retired' && v === 150 ? 152 : v),
      cat: f.cat, ico: f.ico,
      label: f.name + ' · ' + fmtNum(v),
      desc: f.name + '达到 ' + fmtNum(v) + ' ' + f.unit,
      /* 写真实快照字段名（f.stats），不是本表的短名：
         buildStats 里身家叫 pc、胜场叫 wrWin，用短名会读到 undefined 变成死条件。 */
      field: f.stats, fam: field, goal: v,
      reward: rewardFor(i, tiers.length, 1000),
    });
    if (ok) counter.single++;
  });
}

/* ---------- B. 组合成就 ---------- */
/* 只组合语义相容的字段对：同组内互配，以及少数跨组（富×贵、勤×强）。
   不做全笛卡尔积——那会产出 cdkMax × taskFullDays 这种没有意义的对子。 */
const GROUPS = {
  wealth: ['rich', 'peak'],
  rank: ['merit', 'meritday'],
  battle: ['wins', 'games', 'kills', 'chars'],
  gamble: ['gmplay', 'gmwin', 'gmnet', 'gmstreak'],
  world: ['hands', 'retired'],
  duty: ['sign', 'task'],
  interact: ['interact'],
};
const CROSS = [
  ['wealth', 'rank'], ['wealth', 'gamble'], ['rank', 'battle'],
  ['battle', 'duty'], ['gamble', 'duty'], ['world', 'duty'],
];

/* 组合的主题名，决定文案措辞 */
const COMBO_LABEL = {
  'rich|merit': '富且贵', 'peak|merit': '富贵双全',
  'rich|gmplay': '富贵博局', 'peak|gamble': '身家赌运',
  'rich|gamble': '富贵博局',
  'merit|wins': '功名战绩', 'merit|kills': '功勋赫赫',
  'wins|sign': '长胜不辍', 'wins|task': '勤战兼备',
  'kills|sign': '杀伐不歇', 'kills|task': '悍勇勤勉',
  'gmplay|sign': '博局常客', 'gmnet|sign': '赌运恒长',
  'gmwin|task': '博胜日课', 'gmplay|task': '赌勤并举',
  'hands|sign': '坐遍天下', 'hands|task': '游历日课',
  'retired|sign': '看尽浮沉', 'gamble|sign': '赌途久长',
  'rich|peak': '双峰并立', 'wins|games': '百战不殆', 'wins|kills': '斩将搴旗',
  'games|chars': '博采众将', 'gmplay|gmnet': '久赌必赢', 'gmwin|gmnet': '胜而后富',
  'sign|task': '勤勉不辍', 'hands|retired': '阅尽众生',
};

function pairName(a, b) {
  const k1 = a + '|' + b, k2 = b + '|' + a;
  return COMBO_LABEL[k1] || COMBO_LABEL[k2] || (FIELDS[a].name + '与' + FIELDS[b].name);
}

function comboPairs() {
  const pairs = [];
  const pushPair = (a, b) => {
    if (a === b) return;
    const key = [a, b].sort().join('|');
    if (!pairs.some((p) => [p[0], p[1]].sort().join('|') === key)) pairs.push([a, b]);
  };
  const groups = Object.keys(GROUPS);
  /* 组内两两 */
  for (const g of groups) {
    const fs_ = GROUPS[g];
    for (let i = 0; i < fs_.length; i++) for (let j = i + 1; j < fs_.length; j++) pushPair(fs_[i], fs_[j]);
  }
  /* 组间全配：互动的单独成组后会与所有组各配一次，构成"长期陪伴"类目标 */
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      for (const a of GROUPS[groups[i]]) for (const b of GROUPS[groups[j]]) pushPair(a, b);
    }
  }
  return pairs;
}

/* 组合的阈值：取两字段现有中段档位的组合，跨度固定 4 档。
   每对只给 3 档（低/中/高），避免退化成"两个数字一起往上抬"的密集阶梯。 */
const COMBO_TIERS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
for (const [fa, fb] of comboPairs()) {
  const A1 = FIELDS[fa], B1 = FIELDS[fb];
  const listA = (A1.tiers || []).concat([famTop[fa] || 0]).filter((v) => v > 0).sort((x, y) => x - y);
  const listB = (B1.tiers || []).concat([famTop[fb] || 0]).filter((v) => v > 0).sort((x, y) => x - y);
  if (!listA.length || !listB.length) continue;
  const pick = (list, ratio) => list[Math.min(list.length - 1, Math.max(0, Math.round((list.length - 1) * ratio)))];
  const title = pairName(fa, fb);
  const usedCombo = new Set();
  COMBO_TIERS.forEach((ratio, i) => {
    const ga = pick(listA, ratio), gb = pick(listB, ratio);
    const sig = ga + '|' + gb;
    if (usedCombo.has(sig)) return;   /* 阈值组合重复 → 跳过，避免同名同描述 */
    usedCombo.add(sig);
    const ok = addRow({
      kind: 'combo',
      key: 'cx_combo_' + fa + '_' + fb + '_' + i,
      cat: '组合',
      ico: '🧩',
      label: title + ' · ' + fmtNum(ga) + '·' + fmtNum(gb),
      desc: (fa === 'retired' ? '' : '累计') + A1.name + '达到 ' + fmtNum(ga) + ' ' + A1.unit + '，且' + B1.name + '达到 ' + fmtNum(gb) + ' ' + B1.unit,
      all: [{ field: A1.stats, goal: ga }, { field: B1.stats, goal: gb }],
      reward: rewardFor(i, COMBO_TIERS.length, 1500),
    });
    if (ok) counter.combo++;
  });
}

/* ---------- C. 比率类 ---------- */
/* 全部带最小样本量门槛：否则 1 战 1 胜就是 100% 胜率，等于永真条件。 */
const RATIOS = [
  { id: 'winrate', num: 'wrWin', den: 'wrGames', minDen: 50, cat: '比率', ico: '📈', name: '胜率', unit: '%', goals: [0.35, 0.40, 0.45, 0.50, 0.55, 0.60] },
  { id: 'killper', num: 'wrKill', den: 'wrGames', minDen: 50, cat: '比率', ico: '📈', name: '局均击杀', unit: '人/局', goals: [0.5, 0.7, 0.9, 1.2, 1.5, 2.0] },
  { id: 'gmret', num: 'gambleNet', den: 'gamblePlays', minDen: 100, cat: '比率', ico: '📈', name: '单局净赢', unit: '池子币/局', goals: [5000, 10000, 20000, 40000, 80000] },
  { id: 'gmwinrate', num: 'gambleWins', den: 'gamblePlays', minDen: 100, cat: '比率', ico: '📈', name: '赌桌胜率', unit: '%', goals: [0.30, 0.35, 0.40, 0.45, 0.50] },
];
for (const r of RATIOS) {
  r.goals.forEach((g, i) => {
    const pct = g < 1 ? Math.round(g * 100) : null;
    const keyVal = g < 1 ? pct : g;
    const shown = r.unit === '%' ? String(Math.round(g * 100)) : String(Number(g.toFixed(2)));
    const ok = addRow({
      kind: 'ratio',
      key: 'cx_ratio_' + r.id + '_' + keyVal,
      cat: r.cat, ico: r.ico,
      label: r.name + ' · ' + shown + (r.unit === '%' ? '%' : r.id === 'killper' ? r.unit : ''),
      desc: '累计对局不少于 ' + r.minDen + ' 局后，' + r.name + '达到 ' + shown + r.unit,
      ratio: { num: r.num, den: r.den, minDen: r.minDen, goal: g },
      reward: rewardFor(i, r.goals.length, 1800),
    });
    if (ok) counter.ratio++;
  });
}

/* ---------- 自检 ---------- */
const errs = [];
const keys = new Set();
for (const row of out) {
  if (keys.has(row.key)) errs.push('重复 key ' + row.key);
  keys.add(row.key);
  if (existingKeys.has(row.key)) errs.push('与旧 key 冲突 ' + row.key);
  if (row.kind === 'single') {
    const f = FIELDS[row.fam];
    if (!f) errs.push('未知字段 ' + row.fam);
    else if (row.goal > f.cap) errs.push('超出上限 ' + row.key + ' ' + row.goal + '>' + f.cap);
  }
  if (row.kind === 'combo') {
    const known = Object.values(FIELDS).map((f) => f.stats);
    for (const c of row.all) {
      if (known.indexOf(c.field) < 0) errs.push('组合未知字段 ' + c.field);
      else if (!(c.goal > 0)) errs.push('组合阈值非正 ' + row.key);
    }
  }
  if (!row.label || !row.desc) errs.push('缺文案 ' + row.key);
}

function fmtNum(n) {
  return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const byKind = { single: 0, combo: 0, ratio: 0 };
for (const r of out) byKind[r.kind]++;
const byCat = {};
for (const r of out) byCat[r.cat] = (byCat[r.cat] || 0) + 1;

console.log(JSON.stringify({
  existing: existing.length,
  newRows: out.length,
  byKind, byCat,
  total: existing.length + out.length,
  target: TARGET,
  reached: existing.length + out.length >= TARGET,
  selfCheckErrors: errs.length,
  errors: errs.slice(0, 10),
}, null, 2));

if (errs.length) process.exitCode = 1;
if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log('written: ' + outPath);
}
