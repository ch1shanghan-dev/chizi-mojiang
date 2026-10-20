#!/usr/bin/env node
// Isolated behavioral probes. Reads source; never imports the game or touches saves.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const argv = process.argv.slice(2);
const at = argv.indexOf('--root');
const root = path.resolve(at >= 0 && argv[at + 1] ? argv[at + 1] : process.cwd());
const results = [];

// Let the JS parser locate the end, rather than guessing braces inside strings/comments.
function extract(source, name) {
  const match = new RegExp('function\\s+' + name + '\\s*\\(').exec(source);
  if (!match) throw new Error('Function missing: ' + name);
  let end = source.indexOf('\n', match.index);
  while (end !== -1) {
    const candidate = source.slice(match.index, end);
    try {
      new vm.Script('(' + candidate + '\n)');
      return candidate;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
    end = source.indexOf('\n', end + 1);
  }
  throw new Error('Cannot extract function after source refactor: ' + name);
}
function context(bindings, source, names) {
  const ctx = vm.createContext(bindings);
  vm.runInContext(names.map(name => extract(source, name)).join('\n'), ctx, { timeout: 1000 });
  return ctx;
}
function check(id, passed, observed) { results.push({ id, passed: !!passed, observed }); }
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

try {
  if (!fs.existsSync(path.join(root, 'extension.js'))) throw new Error('Use --root with the extension directory');
  const uiSource = read('core/csh_uikit.js');
  const wrSource = read('core/csh_winrate.js');
  const aiSource = read('core/csh_interact.js');

  // A hidden, superseded confirmation must never accept the next dialog's Enter.
  const listeners = new Set();
  function element(tagName) {
    return {
      tagName, children: [], parentNode: null, style: {},
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
      removeChild(child) { this.children = this.children.filter(x => x !== child); child.parentNode = null; },
      addEventListener() {}, focus() {},
    };
  }
  const html = element('html');
  function find(node, id) {
    if (node.id === id) return node;
    for (const child of node.children) { const found = find(child, id); if (found) return found; }
    return null;
  }
  const doc = {
    documentElement: html, body: html, createElement: element,
    getElementById(id) { return find(html, id); },
    addEventListener(type, handler) { if (type === 'keydown') listeners.add(handler); },
    removeEventListener(type, handler) { if (type === 'keydown') listeners.delete(handler); },
  };
  const callbacks = [];
  const ui = context({ document: doc, CF_ID: 'probe-confirm', ensureStyle() {}, setTimeout() {} }, uiSource, ['confirmBox']);
  ui.confirmBox({ message: 'A' }, value => callbacks.push(['A', value]));
  ui.confirmBox({ message: 'B' }, value => callbacks.push(['B', value]));
  const before = listeners.size;
  const event = { key: 'Enter', preventDefault() {}, stopPropagation() {} };
  for (const handler of [...listeners]) handler(event);
  check('UI-CONFIRM-REPLACE', !callbacks.some(x => x[0] === 'A' && x[1]) && callbacks.filter(x => x[0] === 'B' && x[1]).length === 1,
    { keyListenersBeforeEnter: before, callbacks, keyListenersAfterEnter: listeners.size });

  // The implementation's collector/character resolution execute; record functions are observers.
  for (const mode of ['identity', 'versus', 'guozhan', 'doudizhu']) {
    const me = { playerid: 'me', name: 'probe_me', name1: 'probe_me', side: true, identity: mode === 'guozhan' ? 'wei' : mode === 'versus' ? undefined : 'zhu' };
    const enemy = { playerid: 'enemy', name: 'probe_enemy', name1: 'probe_enemy', side: false, identity: mode === 'guozhan' ? 'shu' : mode === 'versus' ? undefined : 'fan' };
    const writes = [];
    const wr = context({
      game: { me, players: [me, enemy], dead: [] }, _status: {}, modeKey: () => mode,
      dbgError() {}, record(...args) { writes.push(['all', ...args]); },
      recordCamp(...args) { writes.push(['camp', ...args]); }, recordMe(...args) { writes.push(['me', ...args]); },
    }, wrSource, ['collect', 'charNames', 'capture']);
    wr.capture(true);
    const mine = writes.filter(x => x[0] === 'me' && x[1] === 'chars' && x[2] === 'probe_me');
    check('STATS-ME-' + mode.toUpperCase(), mine.length === 1,
      { allCharacterWrites: writes.filter(x => x[0] === 'all').length, myCharacterWrites: mine.length });
  }

  function makeAI(prior) {
    const lastEvent = new Map();
    const victim = { playerid: 'victim', chat(line) { chats.push(line); } };
    const attacker = { playerid: 'attacker' };
    if (prior) lastEvent.set('victim|attacker', prior);
    const categories = [], tasks = [], chats = [];
    const math = Object.create(Math); math.random = () => 0.1;
    const ai = context({
      lastEvent, pairStats: new Map(), pairImp: new Map(), Math: math,
      isAI: () => true, usable: () => true, isEnabled: () => true, cfg: () => true, KEY: { chat: 'probe-chat' },
      sceneEpoch: 0, sceneChatEpoch: 0, sceneTimers: new Set(), _status: {},
      chorus() {}, mergedLines(cat) { categories.push(cat); return ['probe-line']; },
      pickLine: lines => lines[0], game: { me: attacker, players: [victim, attacker] }, tr: () => 'attacker', logError() {},
      setTimeout(fn) { tasks.push(fn); },
    }, aiSource, ['pairKey', 'recordEvent', ...(aiSource.includes('function queueScene(') ? ['queueScene'] : []), 'riposte']);
    return { ai, victim, attacker, categories, tasks, chats };
  }
  const cold = makeAI();
  cold.ai.riposte(cold.victim, 'egg', cold.attacker);
  check('AI-MEMORY-COLD', cold.categories[0] === 'hitBack', { selectedCategory: cold.categories[0] });
  const warm = makeAI('hit');
  warm.ai.riposte(warm.victim, 'egg', warm.attacker);
  check('AI-MEMORY-WARM', warm.categories[0] === 'memHitBack', { selectedCategory: warm.categories[0] });

  // Simulate a participant becoming invalid between scheduling and rendering a response.
  cold.ai.isAI = () => false;
  for (const task of cold.tasks) task();
  check('AI-DELAYED-PARTICIPANT', cold.chats.length === 0, { chatCallsAfterInvalidation: cold.chats.length });

  const failed = results.filter(x => !x.passed).length;
  console.log(JSON.stringify({ root, scope: 'isolated-function-behavior; not browser or real game verification', passed: results.length - failed, failed, results }, null, 2));
  process.exitCode = failed ? 1 : 0;
} catch (error) {
  console.error('HARNESS_ERROR: ' + error.stack);
  process.exitCode = 2;
}
