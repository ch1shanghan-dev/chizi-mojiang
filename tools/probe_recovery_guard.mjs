import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {root,parse,walk} from './lib/skill_audit.mjs';
const option=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const sourceDir=option('--source-dir',path.join(root,'core'));
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const core=f=>fs.readFileSync(path.join(sourceDir,f),'utf8');
const clean=s=>s.replace(/^import .*?;.*\r?\n/gm,'').replace(/^export (const|function|async function) /gm,'$1 ').replace(/^export default null;.*$/gm,'');
const rows=[];
async function check(name,fn){try{const out=await fn();rows.push({name,passed:out===true,detail:out===true?undefined:out});}catch(error){rows.push({name,passed:false,detail:error.message});}}
const key='csh_migrate_recovery',marketKey='extension_池子魔将_goldfish';
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
function harness({data=new Map(),pending=false,loadMigrate=true,idb=false,mode='complete',holdReads=false}={}){
  let serial=0,behavior=mode;const timers=new Map(),listeners=[],writes=[],transactions=[],database=new Map(),fault={read:false,write:''};
  if(pending)data.set(key,'{"v":1,"local":{},"config":[],"memory":[]}');
  const store={get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem(k){if(fault.read&&k===key)throw Error('recovery read failure');return data.get(k)??null;},
    setItem(k,v){if(fault.write===k)throw Error('quota '+k);writes.push({k,v:String(v)});data.set(k,String(v));},removeItem(k){writes.push({k,deleted:true});data.delete(k);}};
  const lib={config:{[marketKey]:{v:1,day:'2026-10-21',dayNo:0,prices:{sample:1000},hold:{sample:2},cost:{sample:2000},gift:true,earned:0,pendingDiv:0,tips:[]}},configprefix:'guard_',skill:{},translate:{}};
  if(idb)lib.db={transaction(names,access){const requests=[],entries=[];const tx={access,done:false,
    objectStore(){return {get(k){const req={};requests.push(req);queueMicrotask(()=>{req.result=clone(database.get(k));req.onsuccess?.();});return req;},put(v,k){entries.push({k,v:clone(v)});return {};},delete(k){entries.push({k,deleted:true});return {};}};},
    complete(){if(tx.done)return;tx.done=true;entries.forEach(e=>e.deleted?database.delete(e.k):database.set(e.k,clone(e.v)));tx.oncomplete?.();},
    abort(){if(tx.done)return;tx.done=true;queueMicrotask(()=>tx.onabort?.());}};transactions.push(tx);if(access==='readonly' ? !holdReads : behavior==='complete')queueMicrotask(()=>queueMicrotask(()=>tx.complete()));else if(access!=='readonly'&&behavior==='abort')queueMicrotask(()=>tx.abort());return tx;}};
  const context=vm.createContext({lib,game:{saveConfig(){throw Error('no unconfirmed config writer');},addGlobalSkill(){}},ui:{},get:{poptip:()=>''},ai:{},_status:{},cshVoices:{},
    localStorage:store,window:{CSH:{},addEventListener:(n,fn)=>listeners.push(fn)},document:{addEventListener:(n,fn)=>listeners.push(fn)},
    console:{log(){},warn(){},error(){}},crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,
    setTimeout(fn,ms){const n=++serial;timers.set(n,{fn,ms});return n;},clearTimeout:n=>timers.delete(n)});
  vm.runInContext(clean(read('character/index.js')).replace('export default','var cshCharacter ='),context);
  vm.runInContext(clean(read('core/csh_bossdata.js')),context);
  for(const f of ['csh_wallet.js','csh_world.js','csh_market.js'])vm.runInContext(clean(core(f)),context,{filename:f});
  vm.runInContext('installMarket();globalThis.marketAPI={trade,ensureDay,snapshot,syncPending};',context);
  if(loadMigrate)vm.runInContext(clean(core('csh_migrate.js')),context);
  const h={context,lib,data,writes,timers,listeners,fault,store,database,transactions,W:lib.cshWallet.wallet,R:lib.cshWallet.rank,T:lib.cshWallet.task,C:lib.cshWallet.cdk,
    world:lib.cshWorld,market:context.marketAPI,M:lib.cshMigrate,mode(v){behavior=v;},
    async tick(n=16){for(let i=0;i<n;i++){await Promise.resolve();await new Promise(r=>setImmediate(r));}},
    async waitTransaction(access){const until=Date.now()+3000;for(;;){const tx=transactions.find(t=>t.access===access);if(tx)return tx;if(Date.now()>until)throw Error('expected '+access+' transaction was not created');await new Promise(r=>setTimeout(r,5));}},
    unload(){listeners.forEach(fn=>fn());},runTimers(){for(const [n,t]of [...timers]){timers.delete(n);t.fn();}},
    raw(){return JSON.stringify([...data].filter(([k])=>k!==key).sort(([a],[b])=>a.localeCompare(b)));},
    memory(){return JSON.stringify({wallet:lib.cshWallet.wallet.get(),rank:lib.cshWallet.rank.get(),tasks:lib.cshWallet.task.state(),world:lib.cshWorld.raw()});},
  };return h;
}
const lock=h=>h.data.set(key,'{"v":1,"local":{},"config":[],"memory":[]}');
const unlock=h=>h.data.delete(key);
const mutators=[
 ['wallet credit',h=>h.W.add(500,'guard test'),r=>r===0],
 ['wallet debit',h=>h.W.spend(10,'guard test'),r=>r===false],
 ['zero debit',h=>h.W.spend(0,'guard test'),r=>r===false],
 ['ticket payment',h=>h.W.payTicket('uno'),r=>r.ok===false],
 ['free ticket admission',h=>h.W.payTicket('texas'),r=>r.ok===false],
 ['sign',h=>h.W.sign(),r=>r.ok===false],
 ['relief',h=>h.W.relief(),r=>r.ok===false],
 ['rank merit',h=>h.R.addMerit(100,'guard test'),r=>r.ok===false],
 ['daily task',h=>h.T.add('hands',100),r=>Array.isArray(r)&&r.length===0],
 ['task date rollover',h=>h.T.ensureDay('2099-01-01'),r=>r===false],
 ['career claim',h=>h.W.claimCareer('guard_test',50,'test'),r=>r.ok===false],
 ['market atomic checkpoint',h=>h.W.commitMarket({hold:{}},-10,'market guard'),r=>r.ok===false],
 ['market checkpoint cleanup',h=>h.W.completeMarket('x'),r=>r===false],
 ['settlement even at zero payout',h=>h.W.settleRun('texas',{buyIn:0,netWin:-1}),r=>r.ok===false],
 ['integrity check',h=>h.lib.cshWallet.integrity.check(),r=>r.ok===false],
 ['cross integrity check',h=>h.lib.cshWallet.integrity.crossCheck(),r=>r.ok===false],
 ['legacy migration',h=>h.lib.cshWallet.migrate.legacy(),r=>r.ok===false],
 ['normal wallet reload',h=>h.lib.cshWallet.reloadSave(),r=>r.ok===false],
 ['CDK claim',h=>h.C.claimSeq(17),r=>r===false],
 ['CDK redeem',h=>h.C.redeem('bad'),r=>r.ok===false&&r.recovery===true],
 ['ledger clear',h=>h.W.ledgerClear(),r=>r===false],
 ['flush',h=>h.lib.cshWallet.flushSave(),r=>r===false],
 ['migration flush cannot bypass journal',h=>h.lib.cshWallet.flushSave({migration:true}),r=>r===false],
 ['world winner',h=>h.world.settleWin(h.world.list()[0].id,10),r=>r===null],
 ['world loser',h=>h.world.settleLose(h.world.list()[0].id,10),r=>r===null],
 ['world result',h=>h.world.settleResult(h.world.list()[0].id,false),r=>r===null],
 ['world participation',h=>h.world.settlePlay(h.world.list()[0].id,true),r=>r===null],
 ['world grudge',h=>h.world.addGrudge(h.world.list()[0].id,4),r=>r===null],
 ['world gamble',h=>h.world.noteGamble(10),r=>r===null],
 ['world import',h=>h.world.importRaw(h.world.raw()),r=>r===false],
 ['world heartbeat',h=>h.world.heartbeat(),r=>r.blocked&&r.changed===false],
 ['world simulation',h=>h.world.playRounds(3),r=>r.blocked&&r.rounds===0],
 ['market trade',h=>h.market.trade('sample',1,'buy'),r=>r.ok===false],
 ['market day',h=>h.market.ensureDay(),r=>r.ok===false],
 ['market retry',h=>h.market.syncPending(),r=>r===false],
];
for(const [name,call,accept]of mutators)await check(name+' refuses before memory or durable mutation',async()=>{const h=harness();h.lib.cshWallet.flushSave();lock(h);const before=h.memory(),raw=h.raw(),n=h.writes.length;const result=await call(h);return accept(result)&&h.memory()===before&&h.raw()===raw&&h.writes.length===n;});
await check('persisted journal freezes startup without migrate module loaded',()=>{const data=new Map([[key,'broken journal'],['csh_wallet','{"pc":5000,"streak":4}'],['csh_daily_task','{"day":"2000-01-01","hands":7,"claimed":[]}']]);const raw=JSON.stringify([...data]);const h=harness({data,loadMigrate:false});return JSON.stringify([...data])===raw&&h.writes.length===0&&h.W.add(10,'blocked')===0&&!h.W.sign().ok;});
await check('journal read failure freezes all guarded writers',()=>{const h=harness();h.fault.read=true;const before=h.memory(),raw=h.raw(),n=h.writes.length;const a=h.W.add(10,'blocked'),b=h.W.sign(),c=h.world.settleResult(h.world.list()[0].id,false),d=h.market.trade('sample',1,'buy');return a===0&&!b.ok&&c===null&&!d.ok&&h.memory()===before&&h.raw()===raw&&h.writes.length===n;});
await check('scheduled wallet save and unload do not write while recovery is pending',()=>{const h=harness();h.W.add(10,'queued');lock(h);const raw=h.raw(),before=h.memory(),n=h.writes.length;h.runTimers();h.unload();return h.raw()===raw&&h.memory()===before&&h.writes.length===n;});
await check('already queued market microtask sees newly present recovery journal',async()=>{const h=harness();h.market.trade('sample',1,'buy');lock(h);const raw=h.raw(),n=h.writes.length;await h.tick();return h.raw()===raw&&h.writes.length===n&&!h.timers.size;});
await check('readonly snapshots remain available without new writes',()=>{const h=harness();lock(h);const before=h.memory(),raw=h.raw(),n=h.writes.length;h.W.get();h.W.ledger();h.R.get();h.T.state();h.world.stats();h.world.news();h.world.worldStory();h.market.snapshot();return h.memory()===before&&h.raw()===raw&&h.writes.length===n;});
await check('migration can still flush and commit while it owns the in-memory busy flag',async()=>{const donor=harness();donor.W.add(99,'portable');const code=await donor.M.export(),h=harness();const r=await h.M.import(code);return r.ok&&h.W.pc()===2099&&!h.data.has(key);});
await check('unfinished real recovery survives restart without ordinary progress being accepted',async()=>{const donor=harness();donor.W.add(900,'portable');const code=await donor.M.export(),h=harness({idb:true,mode:'abort'});const r=await h.M.import(code);const journal=h.data.get(key),before=h.raw();const reboot=harness({data:h.data,idb:true});const n=reboot.writes.length;const refused=reboot.W.add(11,'must refuse');const noWrite=reboot.raw()===before&&reboot.writes.length===n;const result=await reboot.M.recover();const accepted=reboot.W.add(11,'after recovery');return !r.ok&&r.recovery&&!!journal&&refused===0&&noWrite&&result.ok&&!reboot.data.has(key)&&reboot.W.pc()===2011&&accepted===11;});
await check('restoration adopts original wallet/rank/tasks/world before permitting progress',async()=>{const h=harness();h.W.add(200,'original');h.R.addMerit(17,'original');h.T.add('hands',2);h.world.settlePlay(h.world.list()[0].id);h.lib.cshWallet.flushSave();const original={wallet:h.data.get('csh_wallet'),rank:h.data.get('csh_rank'),task:h.data.get('csh_daily_task'),world:h.data.get('csh_world')};h.data.set(key,JSON.stringify({v:1,local:{csh_wallet:original.wallet,csh_rank:original.rank,csh_daily_task:original.task,csh_world:original.world},config:[],memory:[]}));h.data.set('csh_wallet','{"pc":9999}');const r=await h.M.recover();return r.ok&&h.W.pc()===2200&&h.R.get().merit===17&&h.T.progressOf('hands')===2&&h.world.stats().playerHands===1&&h.W.add(3,'after')===3;});
await check('pending migration config commit freezes ordinary writers',async()=>{const donor=harness();const code=await donor.M.export(),h=harness({idb:true,mode:'hold'});const p=h.M.import(code),tx=await h.waitTransaction('readwrite');const before=h.memory(),raw=h.raw(),n=h.writes.length;const a=h.W.add(10,'blocked'),b=h.R.addMerit(1,'blocked'),c=h.world.heartbeat(),d=h.market.trade('sample',1,'buy');const stopped=a===0&&!b.ok&&c.blocked&&!d.ok&&h.memory()===before&&h.raw()===raw&&h.writes.length===n;tx.complete();return stopped&&(await p).ok;});
await check('busy state freezes writers before any recovery journal has been saved',async()=>{const donor=harness(),code=await donor.M.export(),h=harness({idb:true,holdReads:true});const p=h.M.import(code),tx=await h.waitTransaction('readonly');const before=h.memory(),raw=h.raw(),n=h.writes.length;const waiting=!h.data.has(key)&&h.M.recoveryState().busy;const a=h.W.add(10,'blocked'),b=h.world.heartbeat(),c=h.market.ensureDay();const stopped=a===0&&b.blocked&&!c.ok&&h.memory()===before&&h.raw()===raw&&h.writes.length===n;tx.complete();return waiting&&stopped&&(await p).ok;});
function delayedCode(h){
  let finish;const waiting=new Promise(resolve=>finish=resolve);
  h.context.crypto={subtle:{importKey:()=>waiting,verify:()=>Promise.resolve(true)}};
  const bytes=Buffer.alloc(14);bytes[0]=0x10;bytes.writeUInt32BE(10,1);bytes.writeUInt32BE(123,7);
  return {code:'CSH1.'+bytes.toString('base64url')+'.AQ',finish:()=>finish({})};
}
await check('actual pending CDK verifier prevents migration snapshot boundary',async()=>{const h=harness(),delayed=delayedCode(h),p=h.C.redeem(delayed.code);await h.tick();await h.C.verify('bad');const busy=h.C.busy(),r=await h.M.reset();delayed.finish();const redeemed=await p;return busy&&!r.ok&&r.err.includes('兑换码')&&!h.data.has(key)&&redeemed.ok&&h.W.pc()===2010&&!h.C.busy()||{busy,result:r,redeemed,pc:h.W.pc()};});
await check('CDK async completion rechecks recovery state before any final write',async()=>{const h=harness(),delayed=delayedCode(h),p=h.C.redeem(delayed.code);await h.tick();lock(h);const before=h.memory(),raw=h.raw(),n=h.writes.length;delayed.finish();const r=await p;return !r.ok&&r.recovery&&h.memory()===before&&h.raw()===raw&&h.writes.length===n&&!h.C.busy()||{result:r,sameMemory:h.memory()===before,sameRaw:h.raw()===raw,writes:h.writes.length-n,busy:h.C.busy()};});
await check('export cannot capture an unpaid CDK claim while verification is pending',async()=>{const h=harness(),delayed=delayedCode(h),p=h.C.redeem(delayed.code);await h.tick();let refused=false;try{await h.M.export();}catch(error){refused=error.message.includes('兑换码');}delayed.finish();return refused&&(await p).ok;});
// Real shell dispatcher: rejection is observable to the actual iframe request and cannot populate settlement caches.
const shell=core('csh_shell.js'),functions=new Map();walk(parse(shell),n=>{if(n.type==='FunctionDeclaration')functions.set(n.id.name,shell.slice(...n.range));});
function shellHarness(){const h=harness(),acks=[];Object.assign(h.context,{ackToGame:(cmd,ok,data)=>acks.push({cmd,ok,data}),fromCurrentFrame:()=>true,logError(){},logInfo(){},paintPc(){},wallet:()=>h.lib.cshWallet,buildStats:()=>({}),captureMigReply:()=>()=>{},toast(){}});vm.runInContext('var CUR_REQ=null,current="texas",META={save:{lobby:true},career:{lobby:true},texas:{}},LEGACY_CLOSE={},GUARD={};',h.context);for(const name of ['persistenceBlocked','persistenceRefused','onMessage'])vm.runInContext(functions.get(name),h.context);lock(h);return {...h,acks,send(cmd,d={}){h.context.onMessage({data:{__csh:cmd,req:'guard-request',...d}});return acks.at(-1);}};}
for(const cmd of ['shell-settle','shell-settle-session','shell-task-add','shell-merit','shell-sign','shell-relief','shell-ach-claim','shell-trade','shell-goldfish','shell-aff-do','shell-cheer','shell-bounty','shell-seat','shell-world-round','shell-world-result','shell-open'])await check(cmd+' returns failure ACK without setting settlement guard',()=>{const h=shellHarness(),raw=h.raw(),before=h.memory(),r=h.send(cmd,{key:'texas'});return r?.cmd===cmd&&r.ok===false&&r.data.recovery===true&&h.raw()===raw&&h.memory()===before&&Object.keys(h.context.GUARD).length===0;});
await check('shell wallet query still returns a successful snapshot',()=>{const h=shellHarness();h.context.walletSnapshot=()=>({pc:h.W.pc()});return h.send('shell-wallet').ok;});
await check('failure ACK keeps complete Chinese recovery guidance',()=>{const h=shellHarness(),r=h.send('shell-task-add');return r.data.reason==='存档操作尚未完成，请先在行囊恢复后再继续'&&!r.data.reason.includes('?');});
await check('recovery page and lobby remain openable while wallet writes are frozen',()=>{const h=shellHarness(),opened=[];h.context.openShell=(k)=>opened.push(k);vm.runInContext(functions.get('openFee'),h.context);h.context.openFee('save');h.context.openFee('career');return opened.join(',')==='save,career';});
const failed=rows.filter(x=>!x.passed);console.log(JSON.stringify({scope:'actual guarded APIs, startup/timers/restart/migration and shell ACKs; disposable VM stores only',passed:rows.length-failed.length,failed:failed.length,failures:failed},null,2));process.exitCode=failed.length?1:0;
