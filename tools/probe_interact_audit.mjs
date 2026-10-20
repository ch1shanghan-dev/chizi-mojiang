// Actual interaction module in an isolated VM; no game import or real save access.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = process.argv.indexOf('--source');
const file = at >= 0 ? process.argv[at + 1] : path.join(root, 'core/csh_interact.js');
const raw = fs.readFileSync(file, 'utf8');
const results = [];
function check(name, ok, detail) { results.push({ name, passed: !!ok, detail }); }
function harness() {
  let next = 0, randoms = [], now = 100000;
  const tasks = new Map(), cancelled = [], chats = [], throws = [], stickers = [];
  const person = (id, human = false) => ({ playerid: id, name: id, alive: true, controlled: false, node: { avatar: {} }, side: human ? 1 : 2,
    isIn() { return this.alive; }, isUnderControl() { return this.controlled; },
    chat(text) { chats.push({ id, text }); }, throwEmotion(to, name) { throws.push({ id, to: to.playerid, name }); },
    emotion(pack, id) { stickers.push({ from: this.playerid, pack, id }); } });
  const me = person('me', true), speaker = person('speaker'), other = person('other'), friend = person('friend');
  const game = { me, players: [me, speaker, other, friend], roundNumber: 1, online: false, over() { status.over = true; return 'original'; }, saveConfig(k,v) { lib.config[k]=v; }, addGlobalSkill() {} };
  const status = {};
  const lib = { config: {}, skill: {}, translate: {} };
  const math = Object.create(Math); math.random = () => randoms.length ? randoms.shift() : 0.1;
  const ctx = vm.createContext({ lib, game, _status: status, ui: {}, EXTRA_LINES: {}, GEN_LINES: {}, Math: math,
    Date: class extends Date { static now() { return now; } }, console,
    get: { attitude: () => 2, translation: p => p?.name || String(p) },
    setTimeout(fn, delay) { const id = ++next; tasks.set(id, { fn, delay }); return id; },
    clearTimeout(id) { if (tasks.has(id)) cancelled.push(tasks.get(id).fn); tasks.delete(id); } });
  vm.runInContext('Array.prototype.randomGet = function(){ return this[0]; };', ctx);
  const injection = '\n globalThis.probe = {riposte, chorus, queueBurst, queueEmoTriple, pairKey, recordEvent, lastEvent, saveCfg, ' +
    'pending: function(){return typeof sceneTimers === "undefined" ? null : sceneTimers.size;}};\n';
  const code = raw.replace(/^import .*?;\r?\n/gm, '').replace(/\}\)\(\);\s*$/, injection + '})();');
  vm.runInContext(code, ctx, { timeout: 1500 });
  return { api: ctx.probe, interaction: lib.cshInteract, lib, game, status, speaker, other, friend, me, tasks, cancelled, chats, throws, stickers,
    random(values) { randoms = [...values]; }, advance() { now += 10000; },
    flush() { const todo = [...tasks.values()]; tasks.clear(); for (const task of todo) task.fn(); } };
}
const chatKey = 'extension_池子魔将_csh_interact_chat';
const enabledKey = 'extension_池子魔将_csh_interact';
const scenarios = {
  riposte(h) { h.api.riposte(h.speaker, 'egg', h.other); },
  chorus(h) { h.api.chorus(h.friend, h.other, 'assistHit'); },
  burst(h) { h.random([0.1, 0.3]); h.api.queueBurst(h.speaker, h.other, 'egg'); },
  sticker(h) { h.random([0.01]); h.api.queueEmoTriple(h.speaker, { pack: 'sample', id: 8, max: 8 }); },
  crowd(h) { h.interaction.onDying(h.other); h.chats.length = 0; },
};
const count = h => h.chats.length + h.throws.length + h.stickers.length;
for (const [name, schedule] of Object.entries(scenarios)) {
  const normal = harness(); schedule(normal);
  check(name + ': scheduled', normal.tasks.size > 0, normal.tasks.size);
  normal.flush(); check(name + ': normal executes', count(normal) > 0, count(normal));
  if (name === 'sticker') check('sticker IDs wrap within existing pack', normal.stickers.map(s => s.id).join(',') === '3.gif,6.gif', normal.stickers);
  for (const invalidation of ['disabled', 'disable-then-enable', 'replay', 'online', 'connect', 'over', 'dead', 'controlled', 'missing-avatar', 'removed', 'new-players', 'reset', 'new-game', ...(name === 'sticker' ? [] : ['target-dead']), ...(['riposte','chorus','crowd'].includes(name) ? ['chat-disabled','chat-off-on'] : [])]) {
    const h = harness(); schedule(h);
    // Find the actual delayed speaker (chorus/crowd pick the first eligible AI).
    switch (invalidation) {
      case 'disabled': h.lib.config[enabledKey] = false; break;
      case 'disable-then-enable': h.api.saveCfg(enabledKey,false); h.api.saveCfg(enabledKey,true); break;
      case 'replay': h.status.video = true; break;
      case 'online': h.game.online = true; break;
      case 'connect': h.status.connectMode = true; break;
      case 'over': h.status.over = true; break;
      case 'dead': h.speaker.alive = false; break;
      case 'controlled': h.speaker.controlled = true; break;
      case 'missing-avatar': h.speaker.node.avatar = null; break;
      case 'removed': h.game.players.splice(h.game.players.indexOf(h.speaker), 1); break;
      case 'new-players': h.game.players = [...h.game.players]; break;
      case 'reset': h.interaction.reset(); break;
      case 'new-game': h.interaction.claimGameStart(); break;
      case 'target-dead': h.other.alive = false; break;
      case 'chat-disabled': h.lib.config[chatKey] = false; break;
      case 'chat-off-on': h.api.saveCfg(chatKey,false); h.api.saveCfg(chatKey,true); break;
    }
    h.flush(); for (const stale of h.cancelled) stale();
    check(name + ': stops after ' + invalidation, count(h) === 0, { effects: count(h), cancelled: h.cancelled.length });
  }
}
for (const [prior, category] of [[null, 'hitBack'], ['hit','memHitBack'], ['hitBack','memHitBack'], ['saved','hitBack']]) {
  const h = harness(); if (prior) h.api.lastEvent.set('speaker|other', prior);
  h.api.riposte(h.speaker, 'egg', h.other);
  const wanted = prior === 'hit' || prior === 'hitBack';
  // Compare actual picked text against the cold category's source pool, including translation substitution.
  const cold = harness(); cold.api.riposte(cold.speaker, 'egg', cold.other); cold.flush();
  h.flush(); check('memory ' + (prior || 'cold') + ' -> ' + category, wanted ? h.chats[0]?.text !== cold.chats[0]?.text : h.chats[0]?.text === cold.chats[0]?.text, h.chats[0]);
  check('memory writes current event ' + (prior || 'cold'), h.api.lastEvent.get('speaker|other') === 'hitBack');
}
{
  const h = harness(); scenarios.riposte(h); h.interaction.onGameOver(true, 1);
  check('game over cancels pending scene timers', h.tasks.size === 0, h.tasks.size);
  check('game over keeps synchronous closing lines', h.chats.length === 3, h.chats.length);
}
{
  const h = harness(); h.interaction.claimGameStart(); scenarios.sticker(h);
  check('duplicate game-start claim keeps current tasks', !h.interaction.claimGameStart() && h.tasks.size === 2, h.tasks.size);
  h.interaction.reset(); scenarios.sticker(h);
  h.api.saveCfg(chatKey, false); h.flush(); check('chat toggle retains non-chat sticker effects', h.stickers.length === 2);
  check('completed tasks leave no pending timer handles', h.api.pending() === 0, h.api.pending());
}
const failed = results.filter(r => !r.passed);
console.log(JSON.stringify({ scope: 'actual module in VM; isolated timers/config/players, no real saves or game rendering', passed: results.length - failed.length, failed: failed.length, failures: failed }, null, 2));
process.exitCode = failed.length ? 1 : 0;
