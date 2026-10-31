// Development-only inventory. Never loads the host or a player's storage.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function loadModel(root) {
  const sources = ['core/csh_achv.js', 'core/csh_pool_achv.js'];
  const context = vm.createContext({ window: {} });
  const hashes = {};
  for (const file of sources) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    hashes[file] = crypto.createHash('sha256').update(source).digest('hex');
    vm.runInContext(source, context, { timeout: 5000, filename: file });
  }
  const career = context.window.CSH_ACHV, pool = context.window.CSH_POOL_ACHV;
  const { parse, skillsOf, property, keyOf } = await import(pathToFileURL(path.join(root, 'tools/lib/skill_audit.mjs')));
  const rosterSource = fs.readFileSync(path.join(root, 'character/index.js'), 'utf8');
  const skillsSource = fs.readFileSync(path.join(root, 'skills/index.js'), 'utf8');
  const exported = parse(rosterSource).body.find(n => n.type === 'ExportDefaultDeclaration');
  const roster = property(exported?.declaration, 'character');
  if (!roster) throw Error('未找到真实普通武将名册');
  const heroIds = roster.properties.map(keyOf), skillIds = [];
  function collect(object, prefix = '') {
    for (const prop of object?.properties || []) {
      const id = prefix + keyOf(prop); skillIds.push(id);
      collect(property(prop.value, 'subSkill'), id + '_');
    }
  }
  collect(skillsOf(parse(skillsSource)));
  for (const [file, source] of [['character/index.js', rosterSource], ['skills/index.js', skillsSource]]) hashes[file] = crypto.createHash('sha256').update(source).digest('hex');
  return { career: career.defs, retired: career.RETIRED, rules: pool.RULES,
    profiles: pool.PROFILES, events: pool.EVENTS, modes: pool.MODES,
    index: pool.INDEX, heroIndex: pool.HERO_INDEX, hashes, heroIds, skillIds };
}

const groups = (rows, key) => {
  const map = new Map();
  for (const row of rows) {
    const value = key(row);
    if (value == null) continue;
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(row);
  }
  return map;
};
const nonempty = v => typeof v === 'string' && v.trim().length > 0;
const positive = v => Number.isFinite(v) && v > 0;
const normalize = v => String(v || '').replace(/\s+/g, '').normalize('NFKC');


// Mirror the existing generic tactical factory contract, not function source text:
// every generated closure has the same text while capturing a different spec.
function auditTactics(rules, modes, errors, review) {
  const rows = [], conditions = new Map();
  const has = (o, k) => Object.hasOwn(o, k);
  const object = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const allowed = new Set(['id', 'name', 'cat', 'rare', 'needs', 'desc', 'win', 'modes', 'identity', 'landlord']);
  const sources = {
    'g:cards': ['gainAfter', '本人实际获得牌的张数'],
    'l:discard': ['loseAfter(type=discard)', '本人弃置事件中的cards2/cards张数'],
    'r:recover': ['recoverEnd/changeHp(recover)', '本人实际回复量；适配器按事件去重'],
    'e:equip': ['equipBefore/equipAfter（前后装备引用事实）', '本人新装备确实进入装备区的次数'],
    'q:judge': ['judgeEnd(result.card存在)', '本人完成有效判定的次数，不要求命中'],
    'q:compare': ['chooseToCompare*After', '本人实际参与且未取消的拼点次数'],
    'd:all': ['damageEnd', '本人作为来源造成的实际伤害量'],
    'd:sha': ['damageEnd(card.name=sha)', '本人以杀造成的实际伤害量'],
    'c:all': ['useCardAfter/respondAfter', '本人使用或响应的全部牌次数'],
    'c:respond': ['respondAfter', '本人在响应事件中打出的牌次数'],
    'p:hand': ['publicMastery', '本人手牌峰值'],
    'p:armor': ['publicMastery', '本人护甲峰值'],
    'p:maxhp': ['publicMastery', '本人体力上限峰值'],
    'p:equip': ['publicMastery', '本人装备区牌数峰值']
  };
  const sourceOf = metric => {
    if (sources[metric]) return { event: sources[metric][0], observation: sources[metric][1] };
    if (/^c:type\.(basic|trick|equip)$/.test(metric)) return { event: 'useCardAfter/respondAfter(type2)', observation: '本人使用或响应对应类别牌的次数' };
    if (/^c:[a-z][a-z0-9_]*$/.test(metric)) return { event: 'useCardAfter/respondAfter(card.name)', observation: '本人使用或响应对应牌名的次数；牌名实际可用性需语义复核' };
    if (/^d:[a-z][a-z0-9_]*$/.test(metric)) return { event: 'damageEnd(nature)', observation: '本人造成对应属性的伤害量；属性实际注册及可用性需语义复核' };
    return null;
  };
  const modeList = value => Array.isArray(value) && value.every(m => typeof m === 'string' && Object.hasOwn(modes, m) && !!modes[m]) && new Set(value).size === value.length;
  const effective = value => (value.length ? [...value] : Object.keys(modes)).sort();
  for (const r of rules.filter(r => has(r, 'tactic'))) {
    const id = 'pool:' + r.id, spec = r.tactic, errorStart = errors.length;
    const add = (code, detail) => errors.push({ code, ids: [id], detail });
    if (!object(spec)) { add('TACTIC_SCHEMA', 'tactic必须为非数组对象'); rows.push({ id, valid: false, conditions: [] }); continue; }
    const extra = Object.keys(spec).filter(k => !allowed.has(k));
    if (extra.length) add('TACTIC_UNAUDITED_FIELD', extra);
    for (const [field, outer] of [['id', 'id'], ['name', 'name'], ['cat', 'cat'], ['rare', 'rare'], ['desc', 'desc']]) {
      if (spec[field] !== r[outer]) add('TACTIC_METADATA_MISMATCH', field);
    }
    if (has(r, 'collection') && !nonempty(r.collection)) add('TACTIC_SCHEMA', 'collection必须为非空字符串');
    if (has(spec, 'win') && typeof spec.win !== 'boolean') add('TACTIC_WIN', 'win必须为布尔值');
    if (has(spec, 'identity') && !['zhu', 'zhong', 'fan', 'nei'].includes(spec.identity)) add('TACTIC_IDENTITY', spec.identity);
    if (has(spec, 'landlord') && typeof spec.landlord !== 'boolean') add('TACTIC_LANDLORD', 'landlord必须为布尔值');
    const declared = has(spec, 'modes') ? spec.modes : [], validModes = modeList(declared) && modeList(r.modes);
    if (!validModes) add('TACTIC_MODES', '内外模式须为无重复的已知模式数组');
    else {
      if (JSON.stringify(effective(declared)) !== JSON.stringify(effective(r.modes))) add('TACTIC_MODE_MISMATCH', 'spec.modes与规则实际模式不一致');
      if (has(spec, 'identity') && (declared.length !== 1 || declared[0] !== 'identity')) add('TACTIC_IDENTITY_MODE', '身份前置须明确限定身份模式');
      if (has(spec, 'landlord') && (declared.length !== 1 || declared[0] !== 'doudizhu')) add('TACTIC_LANDLORD_MODE', '地主/农民前置须明确限定斗地主模式');
    }
    if (has(spec, 'identity') && has(spec, 'landlord')) add('TACTIC_ROLE_CONFLICT', '身份模式角色与斗地主角色不可同时要求');
    if (!Array.isArray(r.on) || r.on.length !== 1 || r.on[0] !== 'over') add('TACTIC_EVENT_SCOPE', '当前同局工厂只在over结算时判断');
    const needs = spec.needs, observed = [], seen = new Set();
    if (!Array.isArray(needs) || !needs.length) add('TACTIC_NEEDS', 'needs须为非空条件数组');
    else for (const pair of needs) {
      if (!Array.isArray(pair) || pair.length !== 2 || !nonempty(pair[0]) || !positive(pair[1]) || (!pair[0].startsWith('p:') && pair[1] > 1000000000)) { add('TACTIC_NEEDS', '条件须为[指标,正有限门槛]，累计量门槛不超过计数上限1e9'); continue; }
      if (seen.has(pair[0])) add('TACTIC_DUPLICATE_METRIC', pair[0]);
      seen.add(pair[0]);
      const source = sourceOf(pair[0]);
      if (!source) add('TACTIC_METRIC_UNOBSERVABLE', pair[0]);
      observed.push({ metric: pair[0], target: pair[1], source });
    }
    const valid = errors.length === errorStart;
    const row = { id, valid, collection: r.collection || null, modes: validModes ? effective(r.modes) : [], identity: spec.identity || null,
      landlord: typeof spec.landlord === 'boolean' ? spec.landlord : null, requiresWin: spec.win === true, conditions: observed,
      naturalPlayEvidence: '仅有结构与静态采集来源；自然实战、合法局面及资源可达性待验证' };
    rows.push(row);
    if (!valid) continue;
    // Sort copies, preserve hero/identity/modes/win and distinguish no landlord restriction from false.
    const canonical = JSON.stringify([r.hero || null, row.modes, row.identity, row.landlord, row.requiresWin,
      observed.map(c => [c.metric, c.target]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)]);
    if (!conditions.has(canonical)) conditions.set(canonical, []);
    conditions.get(canonical).push(id);
  }
  const duplicateGroups = [...conditions.values()].filter(ids => ids.length > 1);
  for (const ids of duplicateGroups) errors.push({ code: 'DUPLICATE_TACTICAL_CONDITION', ids, detail: '规范化后的指标门槛、模式、身份、地主与胜负前置完全相同' });
  return { definitions: rows.length, structurallyValid: rows.filter(r => r.valid).length, duplicateGroups, rows,
    qualifiedNaturalCount: null, pendingVerification: ['结构通过不证明合法对局中可自然达成。', '动态牌名/属性可用性、同一张牌或伤害对多条件的重叠计数需逐条语义复核。', '事件去重、归属、重载与领奖事务由独立执行探针验证，本工具不读取玩家存档。'] };
}

export function auditModel(model) {
  const { career, retired = {}, rules, profiles, events, modes, index, heroIndex } = model;
  const errors = [], review = [];
  const issue = (list, code, ids, detail) => list.push({ code, ids, detail });
  const all = [...career.map(d => ({ id: 'career:' + d.key, name: d.label, desc: d.desc })),
    ...rules.map(r => ({ id: 'pool:' + r.id, name: r.name, desc: r.desc }))];
  for (const [id, rows] of groups(all, r => r.id)) {
    if (rows.length > 1) issue(errors, 'DUPLICATE_ID', [id], rows.length);
  }
  for (const row of all) {
    if (!nonempty(row.name) || !nonempty(row.desc)) issue(errors, 'MISSING_TEXT', [row.id], '名称或条件为空');
  }
  for (const [text, rows] of groups(all, r => normalize(r.name))) {
    if (text && rows.length > 1) issue(review, 'SAME_NAME', rows.map(r => r.id), '同名不自动判为重复条件');
  }
  for (const [text, rows] of groups(all, r => normalize(r.desc))) {
    if (text && rows.length > 1) issue(review, 'SAME_DESCRIPTION', rows.map(r => r.id), '需人工核对条件、模式和归属');
  }
  const fields = new Set();
  const careerRows = [];
  for (const d of career) {
    const id = 'career:' + d.key, reads = new Set();
    if (!nonempty(d.key) || !nonempty(d.cat) || !positive(d.reward)) issue(errors, 'CAREER_SCHEMA', [id], 'ID/分类/奖励非法');
    try {
      if (typeof d.prog !== 'function') throw Error('缺少进度函数');
      const snapshot = new Proxy({}, { get: (_, k) => { if (typeof k === 'string') reads.add(k); return undefined; } });
      const progress = d.prog(snapshot);
      if (!Array.isArray(progress) || progress.length < 2 || !Number.isFinite(progress[0]) || progress[0] < 0 || !positive(progress[1])) {
        issue(errors, 'CAREER_PROGRESS', [id], '空快照返回无效进度');
      } else if (progress[0] >= progress[1] && !retired[d.key]) issue(errors, 'EMPTY_SNAPSHOT_UNLOCK', [id], '缺少数据时达成');
    } catch (e) { issue(errors, 'CAREER_PROGRESS_THROW', [id], String(e.message)); }
    reads.forEach(f => fields.add(f));
    careerRows.push({ id, category: d.cat, retired: !!retired[d.key], observedEmptySnapshotFields: [...reads].sort() });
  }
  for (const key of Object.keys(retired)) if (!career.some(d => d.key === key)) issue(errors, 'RETIRED_UNKNOWN', ['career:' + key], '退休映射悬空');
  const profileIds = new Set(profiles.map(p => p.id));
  const registeredHeroes = new Set(model.heroIds || []), registeredSkills = new Set(model.skillIds || []);
  if (!registeredHeroes.size || !registeredSkills.size) issue(errors, 'REFERENCE_DATA_MISSING', [], '名册/技能AST引用表缺失');
  if (profileIds.size !== profiles.length) issue(errors, 'DUPLICATE_PROFILE', [], '武将档案ID重复');
  const expected = new Map();
  for (const r of rules) {
    const id = 'pool:' + r.id;
    if (!nonempty(r.id) || !nonempty(r.cat) || ![1, 2, 3].includes(r.rare) || typeof r.test !== 'function') issue(errors, 'POOL_SCHEMA', [id], 'ID/分类/稀有度/判定函数非法');
    if (!Array.isArray(r.modes) || r.modes.some(m => !modes[m])) issue(errors, 'UNKNOWN_MODE', [id], r.modes);
    if (!Array.isArray(r.on) || !r.on.length || new Set(r.on).size !== r.on.length || r.on.some(e => !events[e])) issue(errors, 'UNKNOWN_EVENT', [id], r.on);
    if (r.hero && !profileIds.has(r.hero)) issue(errors, 'UNKNOWN_HERO', [id], r.hero);
    if (r.hero && (!positive(r.goal) || !['total', 'peak', 'wins', 'feat'].includes(r.scope))) issue(errors, 'MASTERY_SCHEMA', [id], '目标或作用域非法');
    for (const event of r.on || []) {
      const key = (r.hero || '*') + ':' + event;
      if (!expected.has(key)) expected.set(key, []);
      expected.get(key).push(r);
    }
  }
  const actual = new Map();
  const addIndex = (hero, table) => Object.entries(table || {}).forEach(([event, rows]) => actual.set(hero + ':' + event, rows));
  addIndex('*', index);
  Object.entries(heroIndex || {}).forEach(([hero, table]) => addIndex(hero, table));
  for (const key of new Set([...expected.keys(), ...actual.keys()])) {
    const want = expected.get(key) || [], got = actual.get(key) || [];
    if (!Array.isArray(got) || want.length !== got.length || new Set(got).size !== got.length || want.some(r => !got.includes(r))) issue(errors, 'INDEX_MISMATCH', [key], '索引缺失/重复/串人物/多余规则');
  }
  const heroRows = profiles.map(p => {
    if (!registeredHeroes.has(p.id)) issue(errors, 'HERO_NOT_REGISTERED', [p.id], '人物不在实际普通武将名册');
    const owned = rules.filter(r => r.hero === p.id);
    if (owned.length < 10) issue(errors, 'HERO_MINIMUM', [p.id], owned.length);
    for (const f of p.paths) {
      if (!nonempty(f.metric) || !['total', 'peak'].includes(f.scope) || !Array.isArray(f.goals) || !f.goals.length || f.goals.some((v, i) => !positive(v) || i > 0 && v <= f.goals[i - 1])) issue(errors, 'PATH_SCHEMA', [p.id], f.metric);
    }
    for (const q of p.signature?.requires || []) if (!nonempty(q[0]) || !positive(q[1])) issue(errors, 'SIGNATURE_SCHEMA', [p.id], q);
    if (!p.signature?.requires?.length) issue(errors, 'SIGNATURE_EMPTY', [p.id], '专属同局挑战无条件');
    const metrics = new Set([...p.paths.map(f => f.metric), ...(p.signature?.requires || []).map(q => q[0])]);
    for (const metric of metrics) if (metric.startsWith('s:') && !registeredSkills.has(metric.slice(2))) issue(errors, 'SKILL_NOT_REGISTERED', [p.id], metric);
    return { hero: p.id, name: p.name, definitions: owned.length,
      wins: owned.filter(r => r.scope === 'wins').length,
      milestones: owned.filter(r => ['total', 'peak'].includes(r.scope)).length,
      feats: owned.filter(r => r.scope === 'feat').length,
      metrics: p.paths.map(f => f.metric), naturalPlayEvidence: '尚需逐人自然实战复核' };
  });
  // Exact structured predicates only. Similar ladders remain review information, never auto-retired.
  for (const [fingerprint, rows] of groups(rules.filter(r => r.hero), r => JSON.stringify([r.hero, r.scope, r.metric || null, r.goal, [...r.modes].sort(), r.requires || null]))) {
    if (rows.length > 1) issue(errors, 'DUPLICATE_MASTERY_CONDITION', rows.map(r => 'pool:' + r.id), fingerprint);
  }
  const sharedMetrics = [...groups(profiles.flatMap(p => p.paths.map(f => ({ hero: p.id, metric: f.metric }))), r => r.metric)]
    .map(([metric, rows]) => ({ metric, heroes: [...new Set(rows.map(r => r.hero))] })).filter(g => g.heroes.length > 1).sort((a, b) => b.heroes.length - a.heroes.length);
  const tactical = auditTactics(rules, modes, errors, review);
  const inactive = career.filter(d => !!retired[d.key]).length;
  return {
    schemaVersion: 1, scope: '隔离加载真实定义与索引；静态契约检查，不等同自然可达性、性能或美术验收',
    counts: { career: career.length, pool: rules.length, definitions: all.length,
      uniqueIds: new Set(all.map(r => r.id)).size, retiredCareer: inactive,
      activeDefinitions: all.length - inactive, qualifiedNaturalCount: null,
      nominalGapTo10000: Math.max(0, 10000 - all.length) },
    errors, review, sharedMetrics, heroRows, careerRows, tactical,
    observedEmptySnapshotFields: [...fields].sort(),
    indexBuckets: [...expected].map(([bucket, rows]) => ({ bucket, candidates: rows.length })),
    missingMetadata: { careerRarity: career.filter(d => !d.rare).length,
      careerHiddenContract: career.filter(d => !Object.hasOwn(d, 'hidden')).length,
      poolHiddenContract: rules.filter(r => !Object.hasOwn(r, 'hidden')).length },
    sourceHashes: model.hashes,
    limitations: ['空快照字段访问只记录已执行分支，不能证明统计字段完整性。',
      '同指标与同名仅列人工审查，不自动删除长期阶梯或修改旧ID。',
      '武将和技能仅检查实际注册ID，未证明技能归属、全部事件适配或资源阈值可达。',
      '未测试10000规模、真实存档迁移或自然触发；这些仍是独立待办。']
  };
}

export function markdown(report) {
  const c = report.counts;
  const tactical = report.tactical || { definitions: 0, structurallyValid: 0, duplicateGroups: [], rows: [], pendingVerification: ["旧报告尚无战术审计结果，请重新生成。"] };
  return `# 成就扩容质量基线\n\n${report.scope}\n\n` +
    `定义 ${c.definitions}（生涯 ${c.career} / 池子 ${c.pool}），唯一ID ${c.uniqueIds}；退休生涯 ${c.retiredCareer}，当前可用定义 ${c.activeDefinitions}。自然实战合格数尚未认定，距10000条原始定义名义差额 ${c.nominalGapTo10000}。\n\n` +
    `结构错误 ${report.errors.length}；人工复核组 ${report.review.length}；跨人物共用指标 ${report.sharedMetrics.length} 组。共用指标不等于重复成就。\n\n` +
    `## 结构错误\n\n${report.errors.map(e => '- ' + e.code + '：' + e.ids.join('、') + ' — ' + JSON.stringify(e.detail)).join('\n') || '无。'}\n\n` +
    `## 人工复核\n\n${report.review.map(e => '- ' + e.code + '：' + e.ids.join('、')).join('\n') || '无同名/同描述组。'}\n\n` +
    `## 专属路线组成\n\n| 武将 | 定义 | 里程碑 | 胜场 | 同局挑战 |\n| --- | ---: | ---: | ---: | ---: |\n` +
    report.heroRows.map(h => `| ${h.name} | ${h.definitions} | ${h.milestones} | ${h.wins} | ${h.feats} |`).join('\n') +
    '\n\n## 通用同局挑战结构\n\n' + `定义 ${tactical.definitions}，结构有效 ${tactical.structurallyValid}，完全同条件组 ${tactical.duplicateGroups.length}；自然合格数仍未知。\n\n` +
    tactical.rows.map(r => '- `' + r.id + '`：' + r.conditions.map(c => c.metric + ' ≥ ' + c.target + '（' + (c.source?.event || '来源未确认') + '）').join('；')).join('\n') +
    '\n\n' + tactical.pendingVerification.map(s => '- ' + s).join('\n') +
    '\n\n## 跨人物共用指标（需语义审查）\n\n' + report.sharedMetrics.map(g => '- `' + g.metric + '`：' + g.heroes.length + ' 人').join('\n') +
    '\n\n## 验收限制\n\n' + report.limitations.map(s => '- ' + s).join('\n') + '\n';
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const arg = name => { const i = process.argv.indexOf(name); if (i < 0) return null; if (!process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw Error(name + ' 缺少参数'); return process.argv[i + 1]; };
    const root = arg('--root') || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const out = arg('--out');
    const report = auditModel(await loadModel(root));
    if (out) {
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, 'achievement-quality.json'), JSON.stringify(report, null, 2));
      fs.writeFileSync(path.join(out, 'achievement-quality.md'), markdown(report));
    }
    console.log(JSON.stringify({ counts: report.counts, errors: report.errors, reviewGroups: report.review.length, sharedMetrics: report.sharedMetrics.length }, null, 2));
    if (report.errors.length) process.exitCode = 1;
  } catch (error) { console.error(error.stack); process.exitCode = 2; }
}
