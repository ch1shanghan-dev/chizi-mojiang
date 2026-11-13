/* 台词真源 + 全员互动（2026-11-13）
 *
 * 守住四件事：
 *   ① 新互动不再用动作表里写死的通用 reply —— 台词一律来自 csh_aff_lines.js
 *      （50 位每人 2 句 tender，全库两两不同）；
 *   ② 5 项新增陪伴互动对 50 位全员可用，亲密项仍只在明确成年设定角色；
 *   ③ 纲手沿用 csh_boss_minion_oniko，语料是纲手人格、无旧称呼回退；
 *   ④ 解约矩阵、每日一次、回礼白名单、收集册形状同步。
 *
 * 用法：node tools/probe_aff_lines_truth_20261113.mjs [--out <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditTempRoot } from './lib/audit_scratch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', path.join(auditTempRoot(), 'aff-lines-truth')));
fs.mkdirSync(out, { recursive: true });
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(ok ? {} : { detail }) });
const save = o => { try { fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(o, null, 2)); } catch (e) {} };

const linesSrc = read('core/csh_aff_lines.js');
const affSrc = read('core/csh_affection.js');
const catalogSrc = read('core/csh_bossdata.js');

/* ---------- 静态：台词库结构 ---------- */
const rawBlock = linesSrc.slice(linesSrc.indexOf('const RAW = {'), linesSrc.indexOf('/* 只读访问器'));
const ids = [...rawBlock.matchAll(/^\tcsh_boss_minion_([a-z0-9_]+): \{/gm)].map(m => m[1]);
check('台词库覆盖 50 位妖灵', ids.length === 50, ids.length);
const tenderBlocks = [...rawBlock.matchAll(/^\t\ttender: \["([^"]+)", "([^"]+)"\],/gm)];
check('50 位各有 2 句专属 tender 台词', tenderBlocks.length === 50, tenderBlocks.length);
const allTender = tenderBlocks.flatMap(m => [m[1], m[2]]);
check('100 句 tender 两两不同', new Set(allTender).size === 100, new Set(allTender).size);
/* 全库去重（与 E26 同口径：RAW 段所有字面量） */
const allQuoted = [...rawBlock.matchAll(/"([^"\\]*)"/g)].map(m => m[1]).filter(t => t && !t.startsWith('csh_boss_minion_'));
check('全库台词无重复（含新增 100 句）', new Set(allQuoted).size === allQuoted.length,
  { total: allQuoted.length, unique: new Set(allQuoted).size });
check('台词总量 ≥1700 句（原 1600 + 100）', allQuoted.length >= 1700, allQuoted.length);
check('AFF_SHAPE / AFF_ORDER 收录 tender',
  /AFF_SHAPE\s*=\s*\{[^}]*tender:\s*2/.test(linesSrc) && /AFF_ORDER\s*=\s*\[[^\]]*"tender"/.test(linesSrc));

/* ---------- 静态：纲手真源，无旧称呼回退 ---------- */
const onikoSeg = rawBlock.slice(rawBlock.indexOf('\tcsh_boss_minion_oniko: {'), rawBlock.indexOf('\n\t},', rawBlock.indexOf('\tcsh_boss_minion_oniko: {')));
check('纲手语料含医术/木叶/静音/蛞蝓等人格锚点',
  ['医术', '木叶', '静音', '蛞蝓'].every(w => onikoSeg.includes(w)));
check('纲手语料无旧「鬼の子 / 般若 / 萌え散れ」回退',
  !['鬼の子', '般若', '萌え散れ', '生成り', '红叶'].some(w => onikoSeg.includes(w)));
check('名册仍用稳定 ID 且显示名为纲手',
  /csh_boss_minion_oniko:\s*\{[\s\S]{0,120}name:\s*"纲手"/.test(catalogSrc));
check('oniko 也有自己的 2 句 tender', /tender:\s*\[/.test(onikoSeg));

/* ---------- 静态：动作表与取词链路 ---------- */
const NEW5 = ['lantern', 'bookmark', 'memo', 'quiet', 'seeoff'];
for (const k of NEW5) check(`新互动 ${k} 已在 AFF_ACTS`, affSrc.includes(`key: "${k}"`));
check('新互动各自映射到 tender 台词类别',
  /lantern:\s*"tender"[\s\S]*bookmark:\s*"tender"[\s\S]*memo:\s*"tender"[\s\S]*quiet:\s*"tender"[\s\S]*seeoff:\s*"tender"/.test(affSrc));
check('ACT_LINE_KIND 存在且 LINE_KINDS 收录 tender',
  /var ACT_LINE_KIND\s*=\s*\{/.test(affSrc) && /LINE_KINDS\s*=\s*\[[^\]]*"tender"/.test(affSrc));
check('interact 用 actLine 取词，不再优先 action.reply',
  /var spoken\s*=\s*actLine\(/.test(affSrc) && !/line:\s*action\.reply \|\|/.test(affSrc));
check('动作表 reply 仅作缺语料兜底', /return action\.reply \|\| line\(id, "talk"\)/.test(affSrc));
check('5 项新互动全部进入回礼白名单', NEW5.every(k => new RegExp('acts:\\s*\\[[^\\]]*"' + k + '"').test(affSrc)));
check('AFF_GAIN 收录 5 项新互动', NEW5.every(k => new RegExp('\\b' + k + ':\\s*\\d+').test(affSrc)));
check('亲密项仍带 adultsOnly 显式限定',
  /key: "waist"[\s\S]{0,160}adultsOnly: true/.test(affSrc) && /key: "knee"[\s\S]{0,160}adultsOnly: true/.test(affSrc));
check('新增陪伴项不带 adultsOnly（全员可用）',
  NEW5.every(k => { const m = affSrc.match(new RegExp('key: "' + k + '"[\\s\\S]{0,200}?\\},')); return m && !m[0].includes('adultsOnly'); }));
check('收集册 heardOf / heardLines 收录 tender',
  /sec\("tender",\s*"轻亲近",\s*2/.test(affSrc) && /\["greet", "talk", "head", "close", "give", "tender"\]/.test(affSrc));
check('互动按档位解锁（C/B/A/S 四档各有新项）',
  /key: "lantern"[\s\S]{0,120}need: "C"/.test(affSrc) && /key: "memo"[\s\S]{0,120}need: "B"/.test(affSrc) &&
  /key: "quiet"[\s\S]{0,120}need: "A"/.test(affSrc) && /key: "seeoff"[\s\S]{0,120}need: "S"/.test(affSrc));

/* ---------- 技能译名跟随角色（只改显示名，ID/规则不动） ---------- */
const bossSkillSrc = read('skills/boss.js');
check('oniko 技能显示名已随纲手更名（不再是旧「哀鸣」）',
  bossSkillSrc.includes('csh_boss_guiku: "牵挂"') && !bossSkillSrc.includes('csh_boss_guiku: "哀鸣"'));
check('更名只动显示名与日志，稳定 ID 与规则描述保持不变',
  bossSkillSrc.includes('csh_boss_guiku: {') &&
  bossSkillSrc.includes('csh_boss_guiku_info: "锁定技：你死亡后，每名判定区为空的挑战者获得一张【乐不思蜀】。"') &&
  bossSkillSrc.includes('game.log(player, "的【牵挂】留在了每个人心里")'));
check('静态索引与增益草稿同步新译名',
  read('docs/audit/inventory.json').includes('"name": "牵挂"') &&
  read('docs/audit/技能清单.md').includes('csh_boss_guiku / 牵挂') &&
  read('docs/spirit-buff-draft.json').includes('牵挂（原鬼哭）'));

/* ---------- 运行时：VM 加载真实模块，逐位取词 ---------- */
let bus = null, loadErr = '';
try {
  const vm = await import('node:vm');
  const clean = s => s.replace(/^import .*?;\r?\n/gm, '')
    .replace(/^export default .*\r?\n/gm, '')
    .replace(/^export (const|function) /gm, '$1 ');
  const box = {
    console, Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error,
    parseInt, isNaN, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} }
  };
  box.window = box; box.globalThis = box;
  vm.createContext(box);
  vm.runInContext(clean(linesSrc) + '\nthis.__L = AFF_LINES;', box, { filename: 'csh_aff_lines.js' });
  const L = box.__L;
  const missing = ids.filter(id => { const L2 = L['csh_boss_minion_' + id]; return !L2 || !Array.isArray(L2.tender) || L2.tender.length !== 2 || L2.tender.some(t => !t); });
  check('运行时 50 位都能取到 2 句非空 tender', missing.length === 0, missing);
  const oniko = L.csh_boss_minion_oniko;
  check('运行时纲手 tender 是她自己的话（含医馆/诊室）',
    oniko && oniko.tender.some(t => /诊室|医馆/.test(t)), oniko && oniko.tender);
  const distinct = new Set(ids.map(id => String(L['csh_boss_minion_' + id].tender[0])));
  check('50 位首句互不相同（不是通用句）', distinct.size === 50, distinct.size);
} catch (e) { loadErr = String(e && e.message); check('台词模块可加载', false, loadErr); }

const failures = rows.filter(r => !r.passed);
save({ rows, tenderCount: allTender.length, quoteTotal: allQuoted.length });
console.log(JSON.stringify({ passed: rows.length - failures.length, failed: failures.length, failures, output: out }, null, 2));
process.exitCode = failures.length ? 1 : 0;
