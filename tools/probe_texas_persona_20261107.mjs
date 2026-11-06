/* 第四款德州 AI 牌风 trapper 与世界 12 牌风映射 · 门禁反例（2026-11-07）
 *
 * 真值：core/csh_texas_ai.js、core/csh_world.js、games/texas/texas.html 内联脚本。
 * 边界：本探针只验「策略参数 + 页面映射层」；观察层的隐藏信息隔离沿用 E95K
 *       （probe_texas_rules.mjs 的 aiObservation / deck getter 抛错断言），不重复实现。
 * 自检：内置改前基线（3 款 + 5 映射），断言集必须能把它判红，防止断言退化成永远绿。
 * stdout 为纯 JSON（B12 契约）；--out 可另存完整逐项结果。
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { parse, walk } = await import(pathToFileURL(root + '/tools/lib/skill_audit.mjs'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };

const aiSource = fs.readFileSync(root + '/core/csh_texas_ai.js', 'utf8');
const worldSource = fs.readFileSync(root + '/core/csh_world.js', 'utf8');
const htmlSource = fs.readFileSync(root + '/games/texas/texas.html', 'utf8');
const inline = (htmlSource.match(/<script>\s*([\s\S]*?)<\/script>/) || [])[1];
if (!inline) throw Error('texas.html inline script not found');

let seed = 20261107;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const vmath = Object.create(Math); vmath.random = rnd;
function context() {
  return vm.createContext({ Math: vmath, window: {}, console: { log() {} }, setTimeout() {}, clearTimeout() {} });
}
/* 只抽目标声明，不执行整个模块：csh_world.js 需要宿主 lib/game，整跑会炸。 */
function declarations(source, varNames, fnNames) {
  const parts = [], seen = new Set();
  walk(parse(source), n => {
    if (n.type === 'VariableDeclaration') {
      for (const d of n.declarations) {
        if (!d.id || !varNames.includes(d.id.name) || !d.init || !d.init.range || seen.has(d.id.name)) continue;
        seen.add(d.id.name);
        parts.push('var ' + d.id.name + ' = ' + source.slice(d.init.range[0], d.init.range[1]) + ';');
      }
    } else if (n.type === 'FunctionDeclaration' && fnNames.includes(n.id && n.id.name)) {
      parts.push(source.slice(n.range[0], n.range[1]));
    }
  });
  return parts.join('\n');
}

const ctxAI = context();
vm.runInContext(aiSource, ctxAI);
const AI = ctxAI.window.CSHTexasAI;
if (!AI || typeof AI.decide !== 'function' || typeof AI.personas !== 'function') throw Error('CSHTexasAI API missing');
const ctxWorld = context();
vm.runInContext(declarations(worldSource, ['PERSONAS', 'PERSONA_KEYS'], []), ctxWorld);
const ctxPage = context();
vm.runInContext(declarations(inline, ['PERSONAS', 'PERSONA_KEYS', 'PERSONA_MAP'],
  ['pickPersona', 'displayTag', 'mapPersona']), ctxPage);

const worldPersonas = ctxWorld.PERSONAS || {}, worldKeys = ctxWorld.PERSONA_KEYS || [];
const pagePersonas = ctxPage.PERSONAS || {}, pageKeys = ctxPage.PERSONA_KEYS || [];

/* 设计方案 §3.3 定案值；open 按 decide() 实际语义纠偏为 .62（初稿 .34 会得到最松的一款）。 */
const EXPECTED = {
  tag:     { edge: .055,  valueOpen: .59, open: .57, bluff: .045, size: .66 },
  loose:   { edge: -.015, valueOpen: .65, open: .40, bluff: .025, size: .45 },
  bluff:   { edge: .025,  valueOpen: .56, open: .47, bluff: .13,  size: .75 },
  trapper: { edge: .075,  valueOpen: .68, open: .62, bluff: .020, size: .52 }
};
const STYLES = ['tag', 'loose', 'bluff', 'trapper'];
const LEGACY_MAP = { aggro: 'tag', tight: 'tag', math: 'tag', bluff: 'bluff', wild: 'loose' };
const LEGACY_KEYS = Object.keys(LEGACY_MAP);
const NEW_KEYS = ['chaser', 'trapper', 'grinder', 'bull', 'maniac', 'reader', 'lucky'];
/* 机械规则（顺序即优先级），依据 csh_world 的 raiseThreshold / bluffRate。 */
function expectedStyle(wp) {
  if (!wp) return null;
  if (wp.bluffRate >= .30) return 'bluff';
  if (wp.raiseThreshold >= .60) return 'trapper';
  if (wp.raiseThreshold <= .44) return 'loose';
  return 'tag';
}
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const facts = {
  params: AI.personas(), decide: AI.decide,
  worldPersonas, worldKeys, pagePersonas, pageKeys,
  map: ctxPage.PERSONA_MAP || {},
  mapPersona: ctxPage.mapPersona, displayTag: ctxPage.displayTag, pickPersona: ctxPage.pickPersona
};

const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(!ok && detail !== undefined ? { detail } : {}) });

/* ---------- 策略参数 ---------- */
function checkCore(f, ck) {
  const p = f.params || {}, keys = Object.keys(p);
  ck('策略表恰 4 款且无第五款', keys.length === 4 && STYLES.every(k => has(p, k)), keys);
  for (const k of STYLES) {
    const row = p[k];
    ck('参数与定案一致 · ' + k, !!row && Object.keys(EXPECTED[k]).every(field => row[field] === EXPECTED[k][field]),
      row ? Object.fromEntries(Object.keys(EXPECTED[k]).map(field => [field, row[field]])) : null);
  }
  const t = p.trapper, tag = p.tag, loose = p.loose, bluff = p.bluff;
  ck('trapper.open 高于 tag（收紧开池，纠偏初稿 .34）', !!t && !!tag && t.open > tag.open, t && t.open);
  ck('trapper.valueOpen 为四款最高', !!t && [tag, loose, bluff].every(x => !!x && t.valueOpen > x.valueOpen), t && t.valueOpen);
  ck('trapper.edge 为四款最高', !!t && [tag, loose, bluff].every(x => !!x && t.edge > x.edge), t && t.edge);
  ck('trapper.bluff 为四款最低', !!t && [tag, loose, bluff].every(x => !!x && t.bluff < x.bluff), t && t.bluff);
  ck('trapper.size 小于 tag（放慢强牌）', !!t && !!tag && t.size < tag.size, t && t.size);
  const snapshot = p.trapper ? Object.assign({}, p.trapper) : null;
  let tamperRejected = false;
  try { if (p.trapper) p.trapper.edge = 999; } catch (_e) { tamperRejected = true; }
  ck('personas() 返回冻结副本，篡改不生效', !!snapshot && p.trapper.edge === snapshot.edge, { frozen: !!p.trapper && Object.isFrozen(p.trapper), threw: tamperRejected });
  const probe = { hole: [56, 57], board: [8, 16, 24], strength: .9, equity: .95, opponents: 1, pot: 200,
    contestablePot: 200, toCall: 20, chips: 1000, bb: 20, currentBet: 40, minTo: 60, maxTo: 1020,
    canRaise: true, latePosition: true, skill: .95 };
  const a = f.decide(Object.assign({}, probe, { persona: 'tag' }), () => .5);
  const b = f.decide(Object.assign({}, probe, { persona: '__unknown__' }), () => .5);
  ck('未知 persona 决策回退 tag', a.act === b.act && a.amount === b.amount, [a.act, b.act]);
}

/* ---------- 世界 12 牌风 → 页面映射 ---------- */
function checkMap(f, ck) {
  const wk = f.worldKeys || [], wp = f.worldPersonas || {}, map = f.map || {};
  const pk = f.pageKeys || [], pp = f.pagePersonas || {};
  ck('世界牌风恰 12 种且名册与参数表一致',
    wk.length === 12 && Object.keys(wp).length === 12 && wk.every(k => has(wp, k)),
    { worldKeys: wk.length, personaRows: Object.keys(wp).length });
  const missing = wk.filter(k => !has(map, k));
  ck('12 个世界牌风全部有显式映射（0 个退化为随机）', missing.length === 0, missing);
  const extra = Object.keys(map).filter(k => !wk.includes(k));
  ck('映射表无多余 key', extra.length === 0, extra);
  ck('映射值全部是合法牌风', Object.keys(map).every(k => pk.includes(map[k])),
    Object.keys(map).filter(k => !pk.includes(map[k])));
  ck('既有 5 条历史映射未变', LEGACY_KEYS.every(k => map[k] === LEGACY_MAP[k]), LEGACY_KEYS.filter(k => map[k] !== LEGACY_MAP[k]));
  const bad = NEW_KEYS.filter(k => !wp[k] || map[k] !== expectedStyle(wp[k]));
  ck('新增 7 条按机械规则逐条可复算', bad.length === 0,
    bad.map(k => ({ key: k, threshold: wp[k] && wp[k].raiseThreshold, bluffRate: wp[k] && wp[k].bluffRate, got: map[k], want: expectedStyle(wp[k]) })));
  const unstable = wk.filter(k => { const first = f.mapPersona(k); for (let i = 0; i < 20; i++) if (f.mapPersona(k) !== first) return true; return false; });
  ck('12 个世界牌风的映射结果确定（不随机）', unstable.length === 0, unstable);
  const evil = ['toString', '__proto__', 'constructor', 'valueOf'];
  const evilBad = evil.filter(k => { try { return !pk.includes(f.mapPersona(k)); } catch (_e) { return true; } });
  ck('原型键不会污染映射结果', evilBad.length === 0, evilBad);
  const nullish = [undefined, null, 'not_a_persona', 42].every(k => { try { return pk.includes(f.mapPersona(k)); } catch (_e) { return false; } });
  ck('未知 / 空 / 非字符串键安全回退', nullish);
  ck('页面 PERSONAS 四款都有非空 label 与数值字段',
    STYLES.every(k => has(pp, k) && typeof pp[k].label === 'string' && pp[k].label.length > 0 && typeof pp[k].thr === 'number'),
    STYLES.filter(k => !has(pp, k)));
  ck('页面 PERSONA_KEYS 恰 4 款且与 PERSONAS 一致',
    pk.length === 4 && STYLES.every(k => pk.includes(k) && has(pp, k)), pk);
  let tagOk = false;
  try { const v = f.displayTag('trapper'); tagOk = typeof v === 'string' && v.length > 0; } catch (_e) { tagOk = false; }
  ck('displayTag(trapper) 返回非空文案且不抛错', tagOk);
  const seen = new Set(); for (let i = 0; i < 500; i++) { try { seen.add(f.pickPersona()); } catch (_e) {} }
  ck('pickPersona 四款都可达（trapper 不是死代码）', STYLES.every(k => seen.has(k)), [...seen]);
}

/* ---------- 策略行为（仅对真实事实跑；改前自检不跑行为） ---------- */
function checkBehavior(f, ck) {
  const decide = f.decide;
  const base = { hole: [56, 57], board: [8, 16, 24], strength: .9, equity: .95, opponents: 1, pot: 200,
    contestablePot: 200, toCall: 20, chips: 1000, bb: 20, currentBet: 40, minTo: 60, maxTo: 1020,
    canRaise: false, latePosition: true, skill: .95 };
  let secretSafe = true;
  try {
    const o = Object.assign({}, base, { persona: 'trapper' });
    Object.defineProperty(o, 'players', { get() { throw Error('hidden players read'); } });
    Object.defineProperty(o, 'deck', { get() { throw Error('hidden deck read'); } });
    Object.defineProperty(o, 'opponentHole', { get() { throw Error('hidden hole read'); } });
    decide(o, () => .5);
  } catch (_e) { secretSafe = false; }
  ck('trapper 决策不触碰观察对象上的隐藏字段 getter', secretSafe);
  ck('锁定加注权时 trapper 不非法加注', decide(Object.assign({}, base, { persona: 'trapper', canRaise: false }), () => .5).act !== 'raise');
  let illegal = 0; const acts = {}, tally = {};
  for (const style of STYLES) {
    acts[style] = {}; tally[style] = { nonFold: 0, bluffs: 0 };
    for (let k = 0; k < 600; k++) {
      const o = Object.assign({}, base, {
        persona: style, equity: rnd(), strength: rnd(), chips: 50 + Math.floor(rnd() * 2000),
        toCall: Math.floor(rnd() * 600), canRaise: rnd() < .5, board: rnd() < .5 ? [] : [8, 16, 24],
        opponents: 1 + Math.floor(rnd() * 4), skill: .55 + rnd() * .45, latePosition: rnd() < .5
      });
      o.maxTo = o.chips;
      const d = decide(o, rnd);
      if (!['raise', 'call', 'fold', 'check'].includes(d.act)) illegal++;
      if (d.act === 'raise' && (!o.canRaise || d.amount > o.maxTo || d.amount < Math.min(o.maxTo, o.minTo))) illegal++;
      acts[style][d.act] = (acts[style][d.act] || 0) + 1;
      if (d.act !== 'fold') tally[style].nonFold++;
      if (d.bluff) tally[style].bluffs++;
    }
  }
  ck('4 款 × 600 样本 0 非法动作 / 0 越界加注', illegal === 0, illegal);
  ck('四款都能产出至少两种合法动作', STYLES.every(k => Object.keys(acts[k]).length >= 2),
    Object.fromEntries(STYLES.map(k => [k, Object.keys(acts[k]).length])));
  ck('trapper 入池率低于 loose（收紧）', tally.trapper.nonFold < tally.loose.nonFold,
    { trapper: tally.trapper.nonFold, loose: tally.loose.nonFold });
  ck('trapper 诈唬率不高于 tag 与 bluff', tally.trapper.bluffs <= tally.tag.bluffs && tally.trapper.bluffs <= tally.bluff.bluffs,
    Object.fromEntries(STYLES.map(k => [k, tally[k].bluffs])));
}

checkCore(facts, check);
checkMap(facts, check);
checkBehavior(facts, check);

/* ---------- 自检：改前基线必须被判红 ---------- */
const page3 = Object.fromEntries(['tag', 'loose', 'bluff'].map(k => [k, pagePersonas[k]]));
const beforeFacts = {
  params: { tag: Object.assign({}, EXPECTED.tag), loose: Object.assign({}, EXPECTED.loose), bluff: Object.assign({}, EXPECTED.bluff) },
  decide: AI.decide, worldPersonas, worldKeys,
  pagePersonas: page3, pageKeys: ['tag', 'loose', 'bluff'],
  map: Object.assign({}, LEGACY_MAP),
  mapPersona: k => LEGACY_MAP[k] || ['tag', 'loose', 'bluff'][Math.floor(rnd() * 3)],
  displayTag: k => { if (!has(page3, k)) throw Error('missing persona label'); return page3[k].label; },
  pickPersona: () => ['tag', 'loose', 'bluff'][Math.floor(rnd() * 3)]
};
const beforeRows = [];
const beforeCheck = (name, ok, detail) => beforeRows.push({ name, passed: !!ok, ...(!ok && detail !== undefined ? { detail } : {}) });
checkCore(beforeFacts, beforeCheck);
checkMap(beforeFacts, beforeCheck);
const beforeFailed = beforeRows.filter(r => !r.passed).length;
check('改前基线（3 款 + 5 映射）能被断言集检出 >= 5 条红', beforeFailed >= 5, { beforeFailed, redNames: beforeRows.filter(r => !r.passed).map(r => r.name) });

const result = {
  scope: 'real csh_texas_ai.js / csh_world.js / texas.html inline mapping; 4-style policy samples + pre-change baseline self-test; not natural games',
  passed: rows.filter(r => r.passed).length,
  failed: rows.filter(r => !r.passed).length,
  failures: rows.filter(r => !r.passed),
  beforeBaselineFailed: beforeFailed,
  beforeBaselineRed: beforeRows.filter(r => !r.passed).map(r => r.name)
};
const out = arg('--out', null);
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ ...result, rows }, null, 2));
}
console.log(JSON.stringify(result));
if (result.failed) process.exitCode = 1;
