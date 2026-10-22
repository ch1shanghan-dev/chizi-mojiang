// Actual BOSS AI callbacks and installed host get.effect; no game or saved data.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {root, host, parse, walk, keyOf, property} from './lib/skill_audit.mjs';

const option = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const source = fs.readFileSync(option('--source') || path.join(root, 'skills/boss.js'), 'utf8');
const ast = parse(source);
let pack;
walk(ast, node => { if (node.type === 'VariableDeclarator' && node.id.name === 'skill') pack = node.init; });
if (!pack) throw Error('BOSS skill pack not found');
const engineSource = fs.readFileSync(path.join(host, 'noname/get/index.js'), 'utf8');
let effectSource;
walk(parse(engineSource), node => {
  if (node.type === 'MethodDefinition' && keyOf(node) === 'effect') effectSource = engineSource.slice(...node.range);
});
if (!effectSource) throw Error('Installed host get.effect not found');

function fixture() {
  const calls = [];
  function person(id, side = false) {
    return {id, side, hp: 3, maxHp: 4, alive: true, attackScale: 1, sourcePenalty: 0, range: null,
      isIn() { return this.alive; },
      inRange(other) { return this !== other && (!this.range || this.range.includes(other.id)); },
      countCards() { return 2; },
      getCards() { throw Error('Opponent raw hand must not be read'); },
      getSkills() { return ['fixture_attack']; },
      hasSkillTag() { return false; },
      isLinked() { return false; },
    };
  }
  const player = person('actor', true), a = person('a'), b = person('b'), ally = person('ally', true);
  const game = {players: [player, a, b, ally], expandSkills() {},
    filterPlayer(fn) { return this.players.filter(fn); },
    hasPlayer(fn) { return this.players.some(fn); },
  };
  const lib = {skill: {global: [], fixture_attack: {ai: {effect: {
    target(card, from, to) { return to.attackScale === 0 ? 'zerotarget' : to.attackScale; },
    player(card, from) { return [1, from.sourcePenalty]; },
  }}}}};
  const get = {autoViewAs: x => x, tag: () => false,
    attitude(from, to) { return from.side === to.side ? 4 : -4; },
    info(item) { return typeof item === 'string' ? lib.skill[item] : {ai: {}}; },
    result(card) { return typeof card === 'string' ? lib.skill[card].ai.result : {player: 0, target: -1.5}; },
  };
  const context = vm.createContext({game, lib, get, _status: {event: {player}},
    CacheContext: {requireCacheContext: () => ({get, delegate: x => x})},
  });
  const engine = vm.runInContext('({' + effectSource + '})', context);
  get.effect = function (...args) { calls.push(args); return engine.effect(...args); };
  for (const id of ['csh_boss_bailie', 'csh_boss_zhipei']) {
    const node = property(property(pack, id), 'ai');
    lib.skill[id] = {ai: vm.runInContext('(' + source.slice(...node.range) + ')', context)};
  }
  function score(id, final = false) {
    if (final) return get.effect(undefined, id, player, player);
    const value = lib.skill[id].ai.result.player;
    return typeof value === 'function' ? value(player) : value;
  }
  return {game, get, player, a, b, ally, calls, score};
}

const results = [];
function check(name, fn) {
  try { const passed = fn(); results.push({name, passed: passed === true, detail: passed === true ? undefined : passed}); }
  catch (error) { results.push({name, passed: false, error: error.message}); }
}
const near = (a, b) => Math.abs(a - b) < 1e-9;
const bailie = 'csh_boss_bailie', zhipei = 'csh_boss_zhipei';
for (const final of [false, true]) {
  const mode = final ? 'host final utility' : 'raw activation';
  check('bailie ordinary hostile attack is beneficial: ' + mode, () => fixture().score(bailie, final) > 0);
  check('bailie all attacks ineffective are neutral: ' + mode, () => {
    const f = fixture(); f.a.attackScale = f.b.attackScale = 0; return f.score(bailie, final) === 0;
  });
  check('bailie enemy benefits from attack: ' + mode, () => {
    const f = fixture(); f.a.attackScale = f.b.attackScale = -1; return f.score(bailie, final) < 0;
  });
  check('zhipei ineffective forced attacks are neutral: ' + mode, () => {
    const f = fixture(); f.a.attackScale = f.b.attackScale = 0; return f.score(zhipei, final) === 0;
  });
  check('zhipei enemy benefits from forced attack: ' + mode, () => {
    const f = fixture(); f.a.attackScale = f.b.attackScale = -1; return f.score(zhipei, final) < 0;
  });
}
check('bailie averages random outcomes instead of selecting best target', () => {
  const f = fixture(); f.b.attackScale = -3;
  const expected = (f.get.effect(f.a, {name: 'sha', isCard: true}, f.player, f.player)
    + f.get.effect(f.b, {name: 'sha', isCard: true}, f.player, f.player)) / 2;
  return expected < 0 && near(f.score(bailie), expected);
});
check('bailie ignores allies, dead and out-of-range challengers', () => {
  const f = fixture(); f.a.alive = false; f.player.range = []; return f.score(bailie) === 0;
});
check('bailie no candidates are neutral', () => {
  const f = fixture(); f.game.players = [f.player, f.ally]; return f.score(bailie) === 0;
});
check('bailie includes attacker cost in effect estimate', () => {
  const f = fixture(); f.player.sourcePenalty = -10; return f.score(bailie) < 0;
});
check('bailie passes actual attacker, viewer and virtual-card semantics', () => {
  const f = fixture(); f.score(bailie);
  return f.calls.length === 2 && f.calls.every(([to, card, from, viewer]) =>
    [f.a, f.b].includes(to) && from === f.player && viewer === f.player && card.name === 'sha' && card.isCard === true);
});
check('zhipei averages only legal ordered pairs with actual attacker', () => {
  const f = fixture(); f.a.range = ['b']; f.b.range = []; f.b.attackScale = -2;
  const expected = f.get.effect(f.b, {name: 'sha', isCard: true}, f.a, f.player);
  f.calls.length = 0;
  return expected < 0 && near(f.score(zhipei), expected) && f.calls.length === 1
    && f.calls[0][0] === f.b && f.calls[0][2] === f.a && f.calls[0][3] === f.player;
});
check('zhipei no legal pair is neutral', () => {
  const f = fixture(); f.a.range = f.b.range = []; return f.score(zhipei) === 0;
});
check('zhipei no challenger is neutral', () => {
  const f = fixture(); f.game.players = [f.player, f.ally]; return f.score(zhipei) === 0;
});
check('zhipei one-challenger suppression retains existing positive estimate', () => {
  const f = fixture(); f.b.alive = false; return f.score(zhipei) > 0;
});
check('zhipei observes public attacker-side effects', () => {
  const f = fixture(); f.a.sourcePenalty = f.b.sourcePenalty = -2;
  return f.score(zhipei) > 0;
});
check('both activation paths avoid raw hands', () => {
  const f = fixture(); return Number.isFinite(f.score(bailie)) && Number.isFinite(f.score(zhipei));
});

function ruleSignature(text) {
  function normalize(node) {
    if (Array.isArray(node)) return node.map(normalize);
    if (!node || typeof node !== 'object') return node;
    if (node.type === 'Property' && keyOf(node) === 'ai') return {type: 'Property', key: 'ai', value: '__AI__'};
    return Object.fromEntries(Object.entries(node)
      .filter(([key]) => !['parent', 'tokens', 'comments', 'loc', 'range', 'start', 'end', 'raw'].includes(key))
      .map(([key, value]) => [key, normalize(value)]));
  }
  return JSON.stringify(normalize(parse(text)));
}
const baseline = option('--baseline');
if (baseline) check('all rule AST outside AI stays unchanged', () => ruleSignature(source) === ruleSignature(fs.readFileSync(baseline, 'utf8')));
check('rule guard detects changed activation entry', () => ruleSignature(source) !== ruleSignature(source.replace('enable: "phaseUse"', 'enable: "chooseToUse"')));

const failures = results.filter(row => !row.passed);
console.log(JSON.stringify({scope: 'two BOSS skills; actual callbacks and installed host get.effect, mocked players/cards; no game saves',
  passed: results.length - failures.length, failed: failures.length, failures}, null, 2));
process.exitCode = failures.length ? 1 : 0;
