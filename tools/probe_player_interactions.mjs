// Actual native throw method, interaction module, achievement predicates and migration.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {root, host, parse, walk, keyOf} from './lib/skill_audit.mjs';
const option = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const interact = fs.readFileSync(option('--source') || path.join(root, 'core/csh_interact.js'), 'utf8');
const nativeSource = fs.readFileSync(path.join(host, 'noname/library/element/player.js'), 'utf8');
let nativeThrow;
walk(parse(nativeSource), n => { if (n.type === 'MethodDefinition' && keyOf(n) === 'throwEmotion') nativeThrow = nativeSource.slice(...n.range); });
if (!nativeThrow) throw Error('Native Player.throwEmotion missing');
function storage() {
  const data = new Map();
  return {data, fail: false, get length() { return data.size; }, key(i) { return [...data.keys()][i] ?? null; },
    getItem(k) { return data.get(k) ?? null; }, setItem(k,v) { if (this.fail) throw Error('write failure'); data.set(k,String(v)); }, removeItem(k) { data.delete(k); },
  };
}
function harness(store = storage()) {
  const ctx = vm.createContext({localStorage: store, console:{log(){},warn(){},error(){}}, crypto: webcrypto, TextEncoder, TextDecoder,
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s,'base64').toString('binary'),
    setTimeout() { return 1; }, clearTimeout() {}, EXTRA_LINES: {}, GEN_LINES: {},
  });
  vm.runInContext(`
    var visuals=0, nativeFails=false;
    class Player {
      constructor(id) { this.playerid=this.name=id; this.alive=true; this.node={avatar:{}}; }
      isIn(){return this.alive;} isUnderControl(){return !!this.controlled;}
      $throwEmotion(){visuals++;} chat(){} emotion(){}
      ${nativeThrow}
    }
    var me=new Player('me'), npc=new Player('npc'), other=new Player('other');
    var lib={config:{},configprefix:'probe_',skill:{},element:{Player},translate:{}};
    var game={me,players:[me,npc,other],roundNumber:1,saveConfig(k,v){lib.config[k]=v;},addGlobalSkill(){},over(){},
      broadcastAll(fn,...args){if(nativeFails)throw Error('native failure');fn(...args);}};
    var _status={gameStarted:true},ui={},get={attitude(){return -2;},translation(v){return v.name||String(v);}};
    Array.prototype.randomGet=function(){return this[0];};
  `,ctx);
  vm.runInContext(interact.replace(/^import .*?;\r?\n/gm,''),ctx);
  ctx.lib.cshInteract.install();
  vm.runInContext(fs.readFileSync(path.join(root,'core/csh_achv.js'),'utf8'),ctx);
  return {ctx, store, api: ctx.lib.cshInteract,
    count() { return ctx.lib.cshInteract.stats().playerThrows ?? 0; },
    send(name='egg') { return vm.runInContext(`me.throwEmotion(npc,${JSON.stringify(name)})`,ctx); },
  };
}
const results=[];
async function check(name,fn){try{const passed=await fn();results.push({name,passed:passed===true,detail:passed===true?undefined:passed});}catch(e){results.push({name,passed:false,error:e.message});}}
await check('real human native throw persists once',()=>{const h=harness();h.send();return h.count()===1&&h.ctx.visuals===1;});
await check('all four native achievement prop types count',()=>{const h=harness();for(const n of ['flower','wine','egg','shoe'])h.send(n);return h.count()===4;});
await check('unsupported emotion retains visual but is not a prop achievement',()=>{const h=harness();h.send('unknown');return h.count()===0&&h.ctx.visuals===1;});
await check('automatic NPC throws do not count as player actions',()=>{const h=harness();vm.runInContext("npc.throwEmotion(other,'egg')",h.ctx);return h.count()===0&&h.ctx.visuals===1;});
await check('plain NPC chat does not progress player achievements',()=>{const h=harness();h.ctx.npc.chat('hi');return h.count()===0;});
await check('native collection works with automatic interaction disabled',()=>{const h=harness();h.ctx.lib.config['extension_池子魔将_csh_interact']=false;h.send();return h.count()===1;});
await check('extension demonstration helper is excluded',()=>{const h=harness();h.api.throw(h.ctx.me,h.ctx.npc,'egg');return h.count()===0&&h.ctx.visuals===1;});
await check('repeated installation does not double wrap native method',()=>{const h=harness();h.api.install();h.api.install();h.send();return h.count()===1;});
await check('session reset and new-game claim preserve lifetime actions',()=>{const h=harness();h.send();h.api.reset();h.api.claimGameStart();h.send();return h.count()===2;});
await check('module restart reads lifetime total from storage',()=>{const h=harness();h.send();return harness(h.store).count()===1;});
for(const invalid of ['video','connectMode','over','not-started','observe','online','dead-source','dead-target','controlled-target','foreign-target']){
  await check('excludes '+invalid,()=>{const h=harness();
    if(invalid==='not-started')h.ctx._status.gameStarted=false;
    else if(invalid==='observe'||invalid==='online')h.ctx.game[invalid]=true;
    else if(invalid==='dead-source')h.ctx.me.alive=false;
    else if(invalid==='dead-target')h.ctx.npc.alive=false;
    else if(invalid==='controlled-target')h.ctx.npc.controlled=true;
    else if(invalid==='foreign-target')h.ctx.game.players=[h.ctx.me];
    else h.ctx._status[invalid]=true;
    h.send();return h.count()===0;});
}
await check('failed native throw is not recorded and error is preserved',()=>{const h=harness();h.ctx.nativeFails=true;let threw=false;try{h.send();}catch{threw=true;}return threw&&h.count()===0;});
await check('failed storage cannot create phantom achievement progress',()=>{const h=harness();h.store.fail=true;h.send();return h.count()===0&&h.ctx.visuals===1;});
await check('import or reset of storage is visible without module reload',()=>{const h=harness();h.send();h.store.data.clear();return h.count()===0;});
await check('real achievement thresholds consume player total',()=>{const h=harness();for(let i=0;i<5;i++)h.send();const entries=h.ctx.CSH_ACHV.evalAll({interactTotal:h.count()});return entries.find(x=>x.key==='interact_5').done&&!entries.find(x=>x.key==='interact_15').done;});
await check('real shell snapshot consumes player count instead of AI scene total',()=>{const h=harness();h.send();const source=fs.readFileSync(path.join(root,'core/csh_shell.js'),'utf8');let node;walk(parse(source),n=>{if(n.type==='FunctionDeclaration'&&n.id?.name==='buildStats')node=n;});if(!node)throw Error('buildStats missing');const stats=vm.runInContext('('+source.slice(...node.range)+')()',h.ctx);return stats.interactTotal===1;});

async function migrate(h){vm.runInContext(fs.readFileSync(path.join(root,'core/csh_migrate.js'),'utf8').replace(/^import .*?;\r?\n/gm,''),h.ctx);return h.ctx.lib.cshMigrate;}
await check('migration exports and inspects lifetime total',async()=>{const h=harness();h.send();const m=await migrate(h),r=await m.inspect(await m.export());return r.ok&&r.data.playerInteract?.total===1;});
await check('migration registry has one-to-one whitelist and inventory domains',async()=>{const h=harness(),m=await migrate(h);const rows=m.inventory();return rows.length===m.WHITELIST.length-1&&rows.some(r=>r.key==='playerInteract');});
await check('previously promised rank high record really enters exported data',async()=>{const h=harness();h.store.setItem('csh_rank_high',JSON.stringify({cby:1234,merit:20,seg:'x',t:1}));const m=await migrate(h),r=await m.inspect(await m.export());return r.ok&&r.data.rankHigh?.cby===1234;});
await check('export to a fresh instance imports real player progress',async()=>{const h=harness();h.send();h.send();const m=await migrate(h),code=await m.export(),fresh=harness(),dest=await migrate(fresh);const r=await dest.import(code);return r.ok&&r.applied&&fresh.count()===2;});
await check('full reset removes player progress and rank high',async()=>{const h=harness();h.send();h.store.setItem('csh_rank_high','{"cby":123}');const m=await migrate(h),r=await m.reset();return r.ok&&h.count()===0&&h.store.getItem('csh_rank_high')===null;});
await check('malformed counter cannot give negative or fractional progress',()=>{const h=harness();h.store.setItem('csh_player_interact','{"total":-3.5}');return h.count()===0;});
await check('counter ceiling remains finite',()=>{const h=harness();h.store.setItem('csh_player_interact','{"total":1000000000}');h.send();return h.count()===1000000000;});
await check('new inventory shows actual pool achievement count',async()=>{const h=harness();const m=await migrate(h);const rows=m.inventory({poolAchv:{v:1,got:{example:{t:1,m:'identity',n:1}}}});return rows.find(r=>r.key==='poolAchv').n===1;});
await check('migration built-in selftest has no schema drift failures',async()=>{const h=harness(),m=await migrate(h),r=await m.selftest();return r.fail===0&&r.cases.every(c=>c.p);});
const failures=results.filter(r=>!r.passed);console.log(JSON.stringify({scope:'isolated real native/interaction/achievement/migration paths, no user data',passed:results.length-failures.length,failed:failures.length,failures},null,2));process.exitCode=failures.length?1:0;
