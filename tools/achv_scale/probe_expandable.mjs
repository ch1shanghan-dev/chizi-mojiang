/* M0 · 实测可扩展空间
   ------------------------------------------------------------
   回答一个必须用数据说话的问题：现有玩法到底能支撑多少条
   「条件真实不同」的成就？

   方法：把每位武将的真实技能清单与其档案（PROFILES）已用掉的 metric
   做差集，统计每个技能还剩多少可观测维度没有用。

   只读。
*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || path.join(here, '..', '..'));
const outDir = process.argv[3] || null;

function loadPool() {
  const context = vm.createContext({ window: {} });
  for (const f of ['core/csh_achv.js', 'core/csh_pool_achv.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context, { timeout: 8000, filename: f });
  }
  return { career: context.window.CSH_ACHV, pool: context.window.CSH_POOL_ACHV };
}

/* 从 character/index.js 提取 真实武将 -> 技能清单 */
function loadRoster() {
  const src = fs.readFileSync(path.join(root, 'character/index.js'), 'utf8');
  const roster = {};
  const re = /"(csh_[a-z0-9_]+)"\s*:\s*\{([\s\S]*?)\n\s{8,}\}/g;
  let m;
  while ((m = re.exec(src))) {
    const id = m[1];
    const body = m[2];
    const sk = body.match(/skills\s*:\s*\[([^\]]*)\]/);
    if (!sk) continue;
    const skills = [...sk[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    if (skills.length) roster[id] = skills;
  }
  return roster;
}

/* 一个技能在成就系统里还能被测到哪些维度（不新增观察代码即可用的） */
const GENERIC_DIMENSIONS = [
  's:<skill>',            // 发动次数（已有 useSkill 采集）
  'c:sha', 'c:shan', 'c:tao', 'c:jiu', 'c:wuxie', 'c:juedou', 'c:nanman', 'c:wanjian', 'c:tiesuo', 'c:guohe', 'c:shunshou', 'c:lebu', 'c:bingliang', 'c:shandian',
  'c:type.basic', 'c:type.trick', 'c:type.equip',
  'd:all', 'd:sha', 'd:fire', 'd:thunder', 'd:ice',
  'g:cards', 'l:discard', 'r:recover', 'q:judge', 'q:compare', 'e:equip',
  'p:hand', 'p:armor', 'p:maxhp', 'p:equip',
];

const { career, pool } = loadPool();
const roster = loadRoster();
const profiles = pool.CHARACTER_PROFILES || pool.PROFILES || [];
const profileById = {};
for (const p of profiles) profileById[p.id] = p;

const rows = [];
for (const p of profiles) {
  const skills = roster[p.id] || [];
  const usedMetrics = new Set();
  for (const f of p.paths) usedMetrics.add(f.metric);
  for (const q of (p.signature.requires || [])) usedMetrics.add(q[0]);
  const ownSkillMetrics = [...usedMetrics].filter((m) => m.startsWith('s:'));
  const unusedSkills = skills.filter((s) => !usedMetrics.has('s:' + s));
  rows.push({
    hero: p.id,
    heroName: p.name,
    skills,
    skillCount: skills.length,
    usedMetricCount: usedMetrics.size,
    usedOwnSkillMetrics: ownSkillMetrics.length,
    unusedSkills,
    unusedSkillCount: unusedSkills.length,
  });
}

const totalSkills = rows.reduce((a, r) => a + r.skillCount, 0);
const totalUnusedSkills = rows.reduce((a, r) => a + r.unusedSkillCount, 0);
const heroesWithUnused = rows.filter((r) => r.unusedSkillCount > 0).length;
const multiSkillHeroes = rows.filter((r) => r.skillCount > 1).length;

/* 全仓技能总数（含未绑定武将的技能） */
const skillsSrc = fs.readFileSync(path.join(root, 'skills/index.js'), 'utf8');
const allSkillKeys = new Set([...skillsSrc.matchAll(/"(csh_[a-z0-9_]+)"\s*:\s*\{/g)].map((m) => m[1]));
const rosterSkillSet = new Set(rows.flatMap((r) => r.skills));
const orphanSkills = [...allSkillKeys].filter((s) => !rosterSkillSet.has(s) && !s.endsWith('_info'));

console.log(JSON.stringify({
  heroes: rows.length,
  totalBoundSkills: totalSkills,
  multiSkillHeroes,
  heroesWithUnusedSkill: heroesWithUnused,
  totalUnusedBoundSkills: totalUnusedSkills,
  allSkillKeys: allSkillKeys.size,
  orphanSkills: orphanSkills.length,
  sampleOrphan: orphanSkills.slice(0, 12),
  avgSkillsPerHero: +(totalSkills / rows.length).toFixed(2),
  worstHeroes: rows.slice().sort((a, b) => b.unusedSkillCount - a.unusedSkillCount).slice(0, 6),
  minSkillHeroes: rows.slice().sort((a, b) => a.skillCount - b.skillCount).slice(0, 6).map((r) => ({ hero: r.hero, n: r.skillCount })),
}, null, 2));

if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'expandable-space.json'), JSON.stringify({ rows, orphanSkills, allSkillKeys: [...allSkillKeys] }, null, 2));
}
