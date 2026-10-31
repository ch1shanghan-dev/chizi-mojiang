// Actual interaction module in an isolated VM; no game import or real save access.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = process.argv.indexOf('--source');
const file = at >= 0 ? process.argv[at + 1] : path.join(root, 'core/csh_interact.js');
const raw = fs.readFileSync(file, 'utf8');
const worldSource = fs.readFileSync(path.join(root, 'core/csh_world.js'), 'utf8');
function extract(source, name) {
  const start=new RegExp('function\\s+'+name+'\\s*\\(').exec(source);
  if(!start)throw Error('Missing '+name);
  for(let end=source.indexOf('\n',start.index);end>=0;end=source.indexOf('\n',end+1)) {
    const candidate=source.slice(start.index,end);try{new vm.Script('('+candidate+'\n)');return candidate;}catch(error){if(!(error instanceof SyntaxError))throw error;}
  }throw Error('Cannot extract '+name);
}
const results = [];
function check(name, ok, detail) { results.push({ name, passed: !!ok, detail }); }
function harness() {
  let next = 0, randoms = [], now = 100000;
  const tasks = new Map(), cancelled = [], chats = [], throws = [], stickers = [], storage = new Map();
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
    localStorage: { getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    Date: class extends Date { static now() { return now; } }, console,
    get: { attitude: () => 2, translation: p => p?.name || String(p) },
    setTimeout(fn, delay) { const id = ++next; tasks.set(id, { fn, delay }); return id; },
    clearTimeout(id) { if (tasks.has(id)) cancelled.push(tasks.get(id).fn); tasks.delete(id); } });
  vm.runInContext('game.players=Array.from(game.players);Array.prototype.randomGet = function(){ return this[0]; };', ctx);
  const injection = '\n globalThis.probe = {riposte, chorus, queueBurst, queueEmoTriple, pairKey, pairTimes, recordEvent, lastEvent, saveCfg, addGrudge, grudgeOf, pickTarget, fire, ' +
    'pending: function(){return typeof sceneTimers === "undefined" ? null : sceneTimers.size;}};\n';
  const code = raw.replace(/^import .*?;\r?\n/gm, '').replace('var recency = ', 'var recency = globalThis.observedRecency = ')
    .replace(/\}\)\(\);\s*$/, injection + '})();');
  vm.runInContext(code, ctx, { timeout: 1500 });
  // Execute the real world API, including its default-to-player behavior.
  vm.runInContext('var world={ai:["speaker","other","friend","me"].map(id=>({id,name:id,grudges:{}}))};'+
    'var PLAYER_GRUDGE_KEY="player";function byId(id){return world.ai.find(a=>a.id===id);}' +
    'function idInRoster(id){return !!byId(id);}function clampNum(n,a,b){return Math.max(a,Math.min(b,Number(n)||0));}' +
    'function saveWorld(){}function pushHistory(){}'+
    ['saveBlocked','idOfPlayer','grudgeValue','addGrudge','grudge'].map(n=>extract(worldSource,n)).join('\n')+
    ';lib.cshWorld={idOfPlayer,addGrudge,grudge,PLAYER_GRUDGE_KEY};globalThis.grudgeWorld=world;',ctx);
  return { api: ctx.probe, interaction: lib.cshInteract, world: ctx.grudgeWorld, get: ctx.get, lib, game, status, speaker, other, friend, me, tasks, cancelled, chats, throws, stickers, storage,
    random(values) { randoms = [...values]; }, advance() { now += 10000; }, recency() { return ctx.observedRecency; },
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
{
  const h=harness();h.random([0,0.99,0.99,0.99]);h.api.fire(h.speaker,h.other,'enemy',1);
  check('actual throw records victim -> attacker',h.lib.cshWorld.grudge('other','speaker')===1);
  check('actual throw does not add victim -> player debt',h.lib.cshWorld.grudge('other')===0);
}
{
  const h=harness(),W=h.lib.cshWorld;
  W.addGrudge('speaker',7); // Legacy default-to-player account must survive.
  h.api.addGrudge(h.speaker,1,h.other);
  check('AI pair writes owner -> opponent',W.grudge('speaker','other')===1);
  check('AI pair leaves reverse and unrelated pairs alone',W.grudge('other','speaker')===0&&W.grudge('friend','other')===0);
  check('AI pair preserves legacy player account',W.grudge('speaker')===7);
  check('AI pair reads explicit direction',h.api.grudgeOf(h.speaker,h.other)===1&&h.api.grudgeOf(h.other,h.speaker)===0);
  h.api.addGrudge(h.speaker,2,h.me);
  check('human opponent uses legacy player key',W.grudge('speaker')===9&&W.grudge('speaker','me')===0);
  h.other.controlled=true;h.api.addGrudge(h.speaker,1,h.other);
  check('controlled opponent maps to human account',W.grudge('speaker')===10&&W.grudge('speaker','other')===1);
  h.api.addGrudge(h.me,2,h.speaker);
  check('human victim does not mutate NPC copy of chosen character',W.grudge('me','speaker')===0&&W.grudge('me')===0);
  const unknown={...h.friend,name:'unknown',playerid:'unknown'};h.api.addGrudge(h.speaker,2,unknown);
  check('unknown opponent is skipped rather than defaulting to player',W.grudge('speaker')===10);
  h.api.addGrudge(h.speaker,2,h.speaker);
  check('same roster identity does not create self grudge',W.grudge('speaker','speaker')===0);
}
{
  const h=harness();h.lib.cshWorld.addGrudge('speaker',5,'other');
  h.game.players.splice(0,h.game.players.length,h.speaker,h.other,h.friend);
  // Reading direction is also checked at the weighted target-selection call site.
  const reads=[],old=h.lib.cshWorld.grudge;h.lib.cshWorld.grudge=(owner,target)=>{reads.push([owner,target]);return old(owner,target);};
  h.api.pickTarget(h.speaker,'ally');
  check('target weighting reads actor resentment toward each candidate',reads.length===2&&reads.every(r=>r[0]==='speaker')&&reads.some(r=>r[1]==='other'));
}
{
  const h=harness();h.speaker.side=1;h.other.side=2;h.friend.side=1;
  h.get.attitude=(from,to)=>from.side===to.side?2:-2;
  h.lib.cshWorld.addGrudge('other',6);h.interaction.onAllyDie(h.friend,h.other);
  check('ally death records avenger -> killer',h.lib.cshWorld.grudge('speaker','other')===2);
  check('ally death preserves killer -> player old account',h.lib.cshWorld.grudge('other')===6);
}
// Observe the actual recency expression used by fire, for old and new source.
function retrieve(h) { h.random([0,0.99,0.99,0.99,0.99]); h.api.fire(h.speaker,h.other,'enemy',1); return h.recency(); }
{
  const h=harness();h.api.pairTimes.set('other|speaker',60);h.api.recordEvent(h.other,h.speaker,'hit');
  check('fresh memory remains fresh after frequent past interactions',retrieve(h)===1);
}
{
  const h=harness();h.api.recordEvent(h.other,h.speaker,'hit');
  for(let i=0;i<20;i++)h.api.recordEvent(h.friend,h.me,'saved');
  check('memory ages when subsequent world interaction events occur',Math.abs(retrieve(h)-Math.pow(0.99,20))<1e-12);
}
{
  const h=harness();h.api.recordEvent(h.other,h.speaker,'hit');
  for(let i=0;i<20;i++)h.api.recordEvent(h.friend,h.me,'saved');
  h.api.recordEvent(h.other,h.speaker,'hit');check('new event refreshes the same directed pair',retrieve(h)===1);
}
{
  const h=harness();h.api.recordEvent(h.other,h.speaker,'hit');h.api.recordEvent(h.speaker,h.other,'hitBack');
  check('opposite-direction event does not refresh original memory',Math.abs(retrieve(h)-0.99)<1e-12);
}
{
  const h=harness();h.api.recordEvent(h.other,h.speaker,'hit');
  for(let i=0;i<100;i++)h.api.recordEvent(h.friend,h.me,'saved');
  check('recency retains existing bounded decay floor',Math.abs(retrieve(h)-Math.pow(0.99,50))<1e-12);
}
{
  const h=harness();h.api.recordEvent(h.other,h.speaker,'hit');for(let i=0;i<100;i++)h.advance();
  check('pause without interaction events does not age memory',retrieve(h)===1);
}
for(const reset of ['reset','claimGameStart']){
  const h=harness();h.api.recordEvent(h.other,h.speaker,'hit');for(let i=0;i<60;i++)h.api.recordEvent(h.friend,h.me,'saved');
  h.interaction[reset]();h.api.recordEvent(h.other,h.speaker,'hit');
  check('memory event age restarts after '+reset,retrieve(h)===1);
}
{
 const h=harness();h.interaction.onGameOver(true,1);const n=h.chats.length;h.interaction.onGameOver(true,1);check('duplicate terminal callback speaks once per player',n===3&&h.chats.length===n);h.interaction.onGameStart();const afterOpening=h.chats.length;h.interaction.onGameOver(true,1);check('new game start renews terminal speech permission',h.chats.length===afterOpening+3);
}
const failed = results.filter(r => !r.passed);
console.log(JSON.stringify({ scope: 'actual module in VM; isolated timers/config/players, no real saves or game rendering', passed: results.length - failed.length, failed: failed.length, failures: failed }, null, 2));
process.exitCode = failed.length ? 1 : 0;
