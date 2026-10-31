import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditModel, loadModel, markdown } from './audit_achievement_quality.mjs';
const option = key => { const i = process.argv.indexOf(key); return i < 0 ? null : process.argv[i + 1]; };
const root = option('--root') || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rows = [];
const check = (name, fn) => { try { rows.push({ name, passed: fn() === true }); } catch (e) { rows.push({ name, passed: false, error: e.stack }); } };
const original = await loadModel(root);
const baseline = auditModel(original);
// Reload isolates mutable arrays and function identities, including the real event indexes.
async function mutation(name, mutate, expectedCode) {
  const model = await loadModel(root); mutate(model);
  check(name, () => auditModel(model).errors.some(e => e.code === expectedCode));
}
check('actual two systems have no structural errors', () => baseline.errors.length === 0);
check('qualified natural count is explicitly unknown', () => baseline.counts.qualifiedNaturalCount === null);
check('raw count includes both systems with namespaces', () => baseline.counts.definitions === original.career.length + original.rules.length && baseline.counts.uniqueIds === baseline.counts.definitions);
check('every registered profile is inventoried', () => baseline.heroRows.length === original.profiles.length && baseline.heroRows.every(h => h.definitions >= 10));
check('repeated descriptions remain review items', () => baseline.review.some(r => r.code === 'SAME_DESCRIPTION') && !baseline.errors.some(r => r.code === 'SAME_DESCRIPTION'));
check('shared metrics retain hero identities', () => baseline.sharedMetrics.every(g => new Set(g.heroes).size === g.heroes.length));
check('human report distinguishes definitions and qualification', () => markdown(baseline).includes('自然实战合格数尚未认定'));
check('four reference sources have sha256 evidence', () => Object.keys(baseline.sourceHashes).length === 4 && Object.values(baseline.sourceHashes).every(s => /^[a-f0-9]{64}$/.test(s)));
await mutation('duplicate stable ID is rejected', m => m.career.push(m.career[0]), 'DUPLICATE_ID');
await mutation('empty description is rejected', m => m.career[0].desc = '', 'MISSING_TEXT');
await mutation('NaN progress is rejected', m => m.career[0].prog = () => [NaN, 1], 'CAREER_PROGRESS');
await mutation('zero goal is rejected', m => m.career[0].prog = () => [0, 0], 'CAREER_PROGRESS');
await mutation('empty snapshot false unlock is rejected', m => m.career[0].prog = () => [1, 1], 'EMPTY_SNAPSHOT_UNLOCK');
await mutation('throwing progress is reported', m => m.career[0].prog = () => { throw Error('fixture'); }, 'CAREER_PROGRESS_THROW');
await mutation('nonpositive reward is rejected', m => m.career[0].reward = -1, 'CAREER_SCHEMA');
await mutation('retired missing ID is rejected', m => m.retired.unknown_id = 'fixture', 'RETIRED_UNKNOWN');
await mutation('unknown mode is rejected', m => m.rules[0].modes = ['unknown'], 'UNKNOWN_MODE');
await mutation('unknown event is rejected', m => m.rules[0].on = ['unknown'], 'UNKNOWN_EVENT');
await mutation('empty event subscription is rejected', m => m.rules[0].on = [], 'UNKNOWN_EVENT');
await mutation('duplicate event is rejected', m => m.rules[0].on.push(m.rules[0].on[0]), 'UNKNOWN_EVENT');
await mutation('missing global index entry is rejected', m => m.index.damage.pop(), 'INDEX_MISMATCH');
await mutation('duplicated index entry is rejected', m => m.index.damage.push(m.index.damage[0]), 'INDEX_MISMATCH');
await mutation('unknown index bucket is rejected', m => m.index.unknown = [m.rules[0]], 'INDEX_MISMATCH');
await mutation('missing hero index is rejected', m => delete m.heroIndex[m.profiles[0].id], 'INDEX_MISMATCH');
await mutation('wrong hero registered in index is rejected', m => m.heroIndex[m.profiles[0].id].over.push(m.heroIndex[m.profiles[1].id].over[0]), 'INDEX_MISMATCH');
await mutation('unregistered character is rejected', m => m.heroIds = m.heroIds.slice(1), 'HERO_NOT_REGISTERED');
await mutation('unregistered mastery skill is rejected', m => m.profiles[0].paths[0].metric = 's:missing_skill', 'SKILL_NOT_REGISTERED');
await mutation('descending milestone thresholds are rejected', m => m.profiles[0].paths[0].goals = [10, 5], 'PATH_SCHEMA');
await mutation('empty signature is rejected', m => m.profiles[0].signature.requires = [], 'SIGNATURE_EMPTY');
await mutation('missing source reference tables cannot silently pass', m => m.skillIds = [], 'REFERENCE_DATA_MISSING');
await mutation('same hero same structured condition is rejected', m => {
  const r = m.rules.find(r => r.hero && r.scope === 'total');
  m.rules.push({ ...r, id: 'fixture_duplicate_condition' });
}, 'DUPLICATE_MASTERY_CONDITION');
const snapshot = JSON.stringify(original, (k, v) => typeof v === 'function' ? v.toString() : v);
auditModel(original);
check('audit does not mutate rules indexes or retired state', () => snapshot === JSON.stringify(original, (k, v) => typeof v === 'function' ? v.toString() : v));
check('repeat reports are deterministic', () => JSON.stringify(auditModel(original)) === JSON.stringify(baseline));

// Tactical schema fixtures mutate metadata in an isolated model, not live rules or saves.
const tacticalRule = m => m.rules.find(r => r.tactic);
check('tactical statistics are additive and not a natural qualification claim', () => baseline.tactical.definitions === original.rules.filter(r => Object.hasOwn(r, 'tactic')).length && baseline.tactical.structurallyValid === baseline.tactical.definitions && baseline.tactical.qualifiedNaturalCount === null);
check('every tactical requirement has an explicit observation source', () => baseline.tactical.rows.every(r => r.conditions.length && r.conditions.every(c => c.source?.event && c.source?.observation)));
check('tactical human report preserves natural-play limitations', () => markdown(baseline).includes('自然合格数仍未知') && markdown(baseline).includes('同一张牌或伤害对多条件'));
const tacticalMutations = [
  ['null tactic', r => r.tactic = null, 'TACTIC_SCHEMA'],
  ['array tactic', r => r.tactic = [], 'TACTIC_SCHEMA'],
  ['empty needs', r => r.tactic.needs = [], 'TACTIC_NEEDS'],
  ['object needs', r => r.tactic.needs = {}, 'TACTIC_NEEDS'],
  ['null requirement', r => r.tactic.needs = [null], 'TACTIC_NEEDS'],
  ['extra tuple member', r => r.tactic.needs[0].push(1), 'TACTIC_NEEDS'],
  ['empty metric', r => r.tactic.needs[0][0] = '', 'TACTIC_NEEDS'],
  ['zero threshold', r => r.tactic.needs[0][1] = 0, 'TACTIC_NEEDS'],
  ['negative threshold', r => r.tactic.needs[0][1] = -1, 'TACTIC_NEEDS'],
  ['NaN threshold', r => r.tactic.needs[0][1] = NaN, 'TACTIC_NEEDS'],
  ['infinite threshold', r => r.tactic.needs[0][1] = Infinity, 'TACTIC_NEEDS'],
  ['string threshold', r => r.tactic.needs[0][1] = '1', 'TACTIC_NEEDS'],
  ['above collector cap', r => r.tactic.needs[0][1] = 1000000001, 'TACTIC_NEEDS'],
  ['repeated metric', r => r.tactic.needs.push([...r.tactic.needs[0]]), 'TACTIC_DUPLICATE_METRIC'],
  ['unknown observation shape', r => r.tactic.needs[0][0] = 'g:unobserved', 'TACTIC_METRIC_UNOBSERVABLE'],
  ['string win flag', r => r.tactic.win = 'true', 'TACTIC_WIN'],
  ['unknown identity', r => r.tactic.identity = 'unknown', 'TACTIC_IDENTITY'],
  ['identity outside identity mode', r => r.tactic.identity = 'zhu', 'TACTIC_IDENTITY_MODE'],
  ['string landlord flag', r => r.tactic.landlord = 'false', 'TACTIC_LANDLORD'],
  ['landlord outside doudizhu mode', r => r.tactic.landlord = false, 'TACTIC_LANDLORD_MODE'],
  ['simultaneous incompatible roles', r => { r.tactic.identity = 'zhu'; r.tactic.landlord = true; }, 'TACTIC_ROLE_CONFLICT'],
  ['non-array modes', r => r.tactic.modes = 'identity', 'TACTIC_MODES'],
  ['unknown mode', r => r.tactic.modes = ['missing'], 'TACTIC_MODES'],
  ['prototype name is not a mode', r => r.tactic.modes = ['toString'], 'TACTIC_MODES'],
  ['duplicate declared modes', r => r.tactic.modes = ['identity', 'identity'], 'TACTIC_MODES'],
  ['inner and outer modes differ', r => r.tactic.modes = ['identity'], 'TACTIC_MODE_MISMATCH'],
  ['metadata mismatches actual rule', r => r.tactic.id = 'different_id', 'TACTIC_METADATA_MISMATCH'],
  ['unreviewed predicate extension', r => r.tactic.extraPredicate = true, 'TACTIC_UNAUDITED_FIELD'],
  ['early judging event', r => r.on = ['useCard'], 'TACTIC_EVENT_SCOPE']
];
for (const [name, mutate, code] of tacticalMutations) await mutation('tactical ' + name + ' rejected', m => mutate(tacticalRule(m)), code);
function cloneTactic(model, suffix, edit = () => {}) {
  const original = tacticalRule(model), r = { ...original, id: 'fixture_tactic_' + suffix, modes: [...original.modes], on: [...original.on], tactic: JSON.parse(JSON.stringify(original.tactic)) };
  r.tactic.id = r.id; edit(r);
  model.rules.push(r);
  for (const event of r.on) (model.index[event] || (model.index[event] = [])).push(r);
  return r;
}
async function tacticalCase(name, mutate, expect) {
  const model = await loadModel(root); mutate(model); const report = auditModel(model);
  check(name, () => expect(report));
}
await tacticalCase('unordered identical requirements detect the same condition', m => cloneTactic(m, 'reordered', r => r.tactic.needs.reverse()), r => r.errors.some(e => e.code === 'DUPLICATE_TACTICAL_CONDITION'));
await tacticalCase('empty modes and full explicit unordered modes are equivalent', m => cloneTactic(m, 'full_modes', r => { r.modes = Object.keys(m.modes).reverse(); r.tactic.modes = [...r.modes]; }), r => r.errors.some(e => e.code === 'DUPLICATE_TACTICAL_CONDITION'));
await tacticalCase('false victory flag and absent flag are equivalent', m => cloneTactic(m, 'false_win', r => r.tactic.win = false), r => r.errors.some(e => e.code === 'DUPLICATE_TACTICAL_CONDITION'));
await tacticalCase('same closure text with different threshold is not a duplicate', m => cloneTactic(m, 'threshold', r => r.tactic.needs[0][1] += 1), r => r.errors.length === 0);
await tacticalCase('different mode preconditions are not duplicates', m => cloneTactic(m, 'mode', r => { r.modes = ['versus']; r.tactic.modes = ['versus']; }), r => r.errors.length === 0);
await tacticalCase('different win preconditions are not duplicates', m => cloneTactic(m, 'win', r => r.tactic.win = true), r => r.errors.length === 0);
await tacticalCase('different identity roles remain different conditions', m => { for (const role of ['zhu', 'zhong']) cloneTactic(m, role, r => { r.modes = ['identity']; r.tactic.modes = ['identity']; r.tactic.identity = role; }); }, r => r.errors.length === 0);
await tacticalCase('landlord false differs from unrestricted landlord', m => { cloneTactic(m, 'ddz_any', r => { r.modes = ['doudizhu']; r.tactic.modes = ['doudizhu']; }); cloneTactic(m, 'ddz_farmer', r => { r.modes = ['doudizhu']; r.tactic.modes = ['doudizhu']; r.tactic.landlord = false; }); }, r => r.errors.length === 0);
await tacticalCase('models predating tactic metadata remain supported', m => { m.rules = m.rules.filter(r => !Object.hasOwn(r, 'tactic')); for (const table of [m.index, ...Object.values(m.heroIndex)]) for (const key of Object.keys(table)) table[key] = table[key].filter(r => !Object.hasOwn(r, 'tactic')); }, r => r.errors.length === 0 && r.tactical.definitions === 0 && r.tactical.qualifiedNaturalCount === null);
await tacticalCase('all-card counter is reported as an aggregate not a card name', m => cloneTactic(m, 'all_cards', r => r.tactic.needs = [['c:all', 2], ['c:wuxie', 1]]), r => r.errors.length === 0 && r.tactical.rows.find(r => r.id === 'pool:fixture_tactic_all_cards').conditions[0].source.observation.includes('全部牌'));
await tacticalCase('uncapped public peaks are not falsely restricted to cumulative cap', m => cloneTactic(m, 'peak', r => r.tactic.needs = [['p:armor', 1000000001]]), r => r.errors.length === 0 && r.tactical.qualifiedNaturalCount === null);
const legacyReport = { ...baseline };delete legacyReport.tactical;
check('human formatter still accepts old report objects', () => markdown(legacyReport).includes('旧报告尚无战术审计结果'));
const afterTactical = JSON.stringify(original, (k, v) => typeof v === 'function' ? v.toString() : v);
auditModel(original);
check('normalization never sorts or edits tactical metadata in place', () => afterTactical === JSON.stringify(original, (k, v) => typeof v === 'function' ? v.toString() : v));

const result = { passed: rows.filter(r => r.passed).length, failed: rows.filter(r => !r.passed).length, failures: rows.filter(r => !r.passed), checks: rows };
const out = option('--out');
if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, checks: undefined }, null, 2));
if (result.failed) process.exitCode = 1;
