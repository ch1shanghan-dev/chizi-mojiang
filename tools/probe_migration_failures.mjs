// Real migration/wallet/shell/page functions; isolated raw LS and transaction-level IDB faults.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {root,parse,walk} from './lib/skill_audit.mjs';
const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const migration=fs.readFileSync(arg('--source',path.join(root,'core/csh_migrate.js')),'utf8');
const clean=s=>s.replace(/^import .*?;\r?\n/gm,'');
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const configKey='extension_池子魔将_bossAsBoss';
const recoveryKey='csh_migrate_recovery';
const rows=[];
async function check(name,fn){try{const result=await fn();rows.push({name,passed:result===true,detail:result===true?undefined:result});}catch(error){rows.push({name,passed:false,detail:error.message});}}
function storage(data=new Map()){
  return {data,fault:null, get length(){if(this.fault?.('length',''))throw Error('injected enumerate');return data.size;},key(i){if(this.fault?.('key',String(i)))throw Error('injected key read');return [...data.keys()][i]??null;},getItem(k){if(this.fault?.('read',k))throw Error('injected read '+k);return data.get(k)??null;},
    setItem(k,v){if(this.fault?.('write',k,String(v)))throw Error('injected quota '+k);data.set(k,String(v));},
    removeItem(k){if(this.fault?.('delete',k))throw Error('injected delete '+k);data.delete(k);}};
}
function harness({store=storage(),database=new Map(),idb=false,config={},dbMode='complete',nativePrefix='probe_'}={}){
  let mode=dbMode,serial=0,saveConfigCalls=0;
  const timers=new Map(),transactions=[],listeners={window:new Map(),document:new Map()};
  const listen=scope=>(name,fn)=>{if(!listeners[scope].has(name))listeners[scope].set(name,[]);listeners[scope].get(name).push(fn);};
  const lib={config:clone(config),configprefix:nativePrefix,skill:{},translate:{}};
  if(idb)lib.db={transaction(names,access){
    const writes=[],requests=[];
    const tx={access,done:false,error:null,
      objectStore(){return {get(key){const req={};requests.push({req,key});queueMicrotask(()=>{req.result=clone(database.get(key));req.onsuccess?.({target:req});});return req;},
        put(value,key){const req={};writes.push({key,value:clone(value),req});return req;},
        delete(key){const req={};writes.push({key,absent:true,req});return req;}};},
      complete(){if(tx.done)return;tx.done=true;for(const e of writes){if(e.absent)database.delete(e.key);else database.set(e.key,clone(e.value));}tx.oncomplete?.();},
      abort(){if(tx.done)throw Error('transaction already finished');if(mode==='late')throw Error('abort could not confirm');tx.done=true;queueMicrotask(()=>tx.onabort?.());},
      requestSuccess(){for(const e of writes)e.req.onsuccess?.();},
    };
    transactions.push(tx);
    if(access==='readonly'||mode==='complete')queueMicrotask(()=>queueMicrotask(()=>tx.complete()));
    else if(mode==='abort')queueMicrotask(()=>tx.abort());
    return tx;
  }};
  const context=vm.createContext({lib,game:{saveConfig(k,v){saveConfigCalls++;if(v===undefined)delete lib.config[k];else lib.config[k]=v;},addGlobalSkill(){}},
    localStorage:store,window:{CSH:{},addEventListener:listen('window')},document:{addEventListener:listen('document')},console:{log(){},warn(){},error(){}},
    crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,ui:{},get:{},ai:{},_status:{},
    setTimeout(fn,ms){const n=++serial;timers.set(n,{fn,ms});return n;},clearTimeout(n){timers.delete(n);}});
  vm.runInContext(clean(fs.readFileSync(path.join(root,'core/csh_wallet.js'),'utf8')),context);
  vm.runInContext(clean(migration),context);
  const h={store,database,lib,context,transactions,timers,M:lib.cshMigrate,W:lib.cshWallet.wallet,
    mode(value){mode=value;},calls(){return saveConfigCalls;},
    async tick(n=16){for(let i=0;i<n;i++){await Promise.resolve();await new Promise(resolve=>setImmediate(resolve));}},
    timeout(){for(const [id,t]of [...timers])if(t.ms===5000){timers.delete(id);t.fn();}},
    unload(){for(const name of ['beforeunload','pagehide'])for(const fn of listeners.window.get(name)||[])fn();},
    disk(key='csh_wallet'){return JSON.parse(store.getItem(key)||'null');},
  };
  lib.cshWallet.flushSave();
  return h;
}
async function portable(){const h=harness({config:{[configKey]:{win:7,lose:2,last:1}}});h.W.add(800,'fixture');h.store.setItem('csh_ddz_name','新名字');h.store.setItem('csh_player_interact','{"v":1,"total":9}');return h.M.export();}
const code=await portable();
function before(h){return {wallet:h.store.getItem('csh_wallet'),rank:h.store.getItem('csh_rank'),player:h.store.getItem('csh_player_interact'),name:h.store.getItem('csh_ddz_name'),config:clone(h.lib.config[configKey])};}
function same(h,b){return h.W.pc()===2000&&h.store.getItem('csh_wallet')===b.wallet&&h.store.getItem('csh_player_interact')===b.player&&h.store.getItem('csh_ddz_name')===b.name&&JSON.stringify(h.lib.config[configKey])===JSON.stringify(b.config);}

await check('import commits true host fallback config and preserves unrelated settings',async()=>{const h=harness();h.store.setItem('probe_config','{"unrelated":17}');const r=await h.M.import(code);return r.ok&&h.W.pc()===2800&&h.disk('probe_config')[configKey].win===7&&h.disk('probe_config').unrelated===17&&h.lib.config[configKey].win===7&&h.calls()===0;});
await check('backup quota aborts before any imported data is written',async()=>{const h=harness(),b=before(h);h.store.fault=(op,k)=>op==='write'&&k.startsWith('csh_mig_backup_');const r=await h.M.import(code);return !r.ok&&same(h,b)&&!h.store.getItem(recoveryKey);});
await check('recovery credential quota aborts before any imported data is written',async()=>{const h=harness(),b=before(h);h.store.fault=(op,k)=>op==='write'&&k===recoveryKey;const r=await h.M.import(code);return !r.ok&&same(h,b);});
await check('one mid-plan quota restores exact original values and absent keys',async()=>{const h=harness(),b=before(h);let hit=false;h.store.fault=(op,k)=>op==='write'&&k==='csh_player_interact'&&!hit&&(hit=true);const r=await h.M.import(code);return !r.ok&&r.err.includes('已恢复')&&same(h,b)&&!h.store.getItem(recoveryKey);});
await check('host fallback quota restores wallet and all preceding local writes',async()=>{const h=harness();h.store.setItem('probe_config','{"unrelated":17}');const b=before(h);h.store.fault=(op,k)=>op==='write'&&k==='probe_config';const r=await h.M.import(code);return !r.ok&&same(h,b)&&h.disk('probe_config').unrelated===17;});
await check('deleting an absent key is still strictly confirmed',async()=>{const h=harness(),b=before(h);h.store.fault=(op,k)=>op==='delete'&&k===configKey;const r=await h.M.import(code);return !r.ok&&same(h,b);});
await check('malformed host fallback config refuses overwrite instead of resetting unrelated config',async()=>{const h=harness(),b=before(h);h.store.setItem('probe_config','broken');const r=await h.M.import(code);return !r.ok&&same(h,b)&&h.store.getItem('probe_config')==='broken';});
await check('unsaved wallet quota refuses stale backup/import success',async()=>{const h=harness();h.W.add(10,'fixture');h.store.fault=(op,k)=>op==='write'&&k==='csh_wallet';const r=await h.M.import(code);return !r.ok&&h.W.pc()===2010&&h.disk().pc===2000&&!h.M.backups().length;});

if(process.argv.includes('--baseline-only')){
  const failures=rows.filter(x=>!x.passed);console.log(JSON.stringify({scope:'same existing-operation failures against selected migration source',passed:rows.length-failures.length,failed:failures.length,failures},null,2));process.exit(failures.length?1:0);
}

await check('IDB transaction complete is required before positive import result',async()=>{const h=harness({idb:true,dbMode:'hold'});let done=false;const p=h.M.import(code).then(r=>{done=true;return r;});await h.tick(40);const tx=h.transactions.find(t=>t.access==='readwrite');tx.requestSuccess();await h.tick();const waiting=!done&&h.lib.config[configKey]===undefined&&!!h.store.getItem(recoveryKey);tx.complete();const r=await p;return waiting&&r.ok&&h.database.get(configKey).win===7&&h.lib.config[configKey].win===7&&!h.store.getItem(recoveryKey);});
await check('request success followed by abort never returns success',async()=>{const h=harness({idb:true,dbMode:'hold'}),b=before(h);const p=h.M.import(code);await h.tick(40);const tx=h.transactions.find(t=>t.access==='readwrite');tx.requestSuccess();tx.abort();h.mode('complete');const r=await p;return !r.ok&&same(h,b)&&!h.database.has(configKey)&&!h.store.getItem(recoveryKey);});
await check('failed IDB config commit and failed restore retain a recoverable credential',async()=>{const h=harness({idb:true,dbMode:'abort'}),b=before(h);const r=await h.M.import(code);return !r.ok&&r.recovery===true&&same(h,b)&&!!h.store.getItem(recoveryKey);});
await check('retry restores durable config/memory before accepting any new operation',async()=>{const h=harness({idb:true,dbMode:'abort'});await h.M.import(code);h.mode('complete');const r=await h.M.recover();return r.ok&&!h.database.has(configKey)&&h.lib.config[configKey]===undefined&&h.W.pc()===2000&&!h.store.getItem(recoveryKey);});
await check('recovery quota retains original journal and can be retried after restart',async()=>{const h=harness();let failed=false;h.store.fault=(op,k,v)=>{if(op==='write'&&k==='csh_player_interact'){failed=true;return true;}return failed&&op==='write'&&k==='csh_wallet'&&JSON.parse(v).pc===2000;};const r=await h.M.import(code),journal=h.store.getItem(recoveryKey);h.store.fault=null;const reboot=harness({store:h.store});const recovered=await reboot.M.recover();return !r.ok&&r.recovery&&!!journal&&recovered.ok&&reboot.W.pc()===2000&&!reboot.store.getItem('csh_player_interact')&&!reboot.store.getItem(recoveryKey);});
await check('a second import cannot overwrite an unrecovered failed operation',async()=>{const h=harness({idb:true,dbMode:'abort'});await h.M.import(code);const original=h.store.getItem(recoveryKey);const r=await h.M.import(code);return !r.ok&&r.recovery&&h.store.getItem(recoveryKey)===original&&h.W.pc()===2000;});
await check('export refuses partially recovered state',async()=>{const h=harness({idb:true,dbMode:'abort'});await h.M.import(code);try{await h.M.export();return false;}catch(error){return error.message.includes('恢复');}});
await check('journal cleanup failure does not acknowledge committed import',async()=>{const h=harness(),b=before(h);h.store.fault=(op,k)=>op==='delete'&&k===recoveryKey;const r=await h.M.import(code);h.store.fault=null;const recovered=await h.M.recover();return !r.ok&&r.recovery&&same(h,b)&&recovered.ok&&!h.store.getItem(recoveryKey);});

await check('IDB timeout abort restores original state without a positive ACK',async()=>{const h=harness({idb:true,dbMode:'hold'}),b=before(h);const p=h.M.import(code);await h.tick(40);h.mode('complete');h.timeout();const r=await p;return !r.ok&&same(h,b)&&!h.store.getItem(recoveryKey);});
await check('unconfirmed timeout keeps recovery pending and blocks new writes',async()=>{const h=harness({idb:true,dbMode:'late'});const p=h.M.import(code);await h.tick(40);h.timeout();const r=await p;const retry=await h.M.recover();return !r.ok&&r.recovery&&!retry.ok&&!!h.store.getItem(recoveryKey)&&!h.database.has(configKey);});
await check('late transaction completion is restored before later recovery succeeds',async()=>{const h=harness({idb:true,dbMode:'late'});const p=h.M.import(code);await h.tick(40);h.timeout();await p;const tx=h.transactions.find(t=>t.access==='readwrite');tx.complete();h.mode('complete');const r=await h.M.recover();return r.ok&&!h.database.has(configKey)&&h.W.pc()===2000&&!h.store.getItem(recoveryKey);});
await check('parallel destructive operation is rejected while one config write is pending',async()=>{const h=harness({idb:true,dbMode:'hold'});const p=h.M.import(code);await h.tick(40);const r=await h.M.reset();h.transactions.find(t=>t.access==='readwrite').complete();await p;return !r.ok&&r.err.includes('正在进行');});

await check('rollback deletes new config/string/group/wildcard keys that were absent in backup',async()=>{const h=harness();const imported=await h.M.import(code);h.store.setItem('csh_bgm_on_uno','1');h.store.setItem('csh_ddz_name','new');h.lib.config[configKey]={win:99};const r=await h.M.rollback(imported.backup);return r.ok&&h.W.pc()===2000&&h.store.getItem('csh_ddz_name')===null&&h.store.getItem('csh_bgm_on_uno')===null&&h.lib.config[configKey]===undefined&&!Object.hasOwn(h.disk('probe_config'),configKey);});
await check('rollback failure preserves current state and remains retryable',async()=>{const h=harness(),a=await h.M.import(code);h.store.fault=(op,k)=>op==='delete'&&k==='csh_ddz_name';const r=await h.M.rollback(a.backup);h.store.fault=null;const retry=await h.M.rollback(a.backup);return !r.ok&&retry.ok&&h.W.pc()===2000&&h.store.getItem('csh_ddz_name')===null;});
await check('reset deletes bounty config and its old LS mirror instead of storing null',async()=>{const key='extension_池子魔将_csh_bounty';const h=harness({config:{[key]:'csh_boss_minion_test'}});h.store.setItem(key,'"csh_boss_minion_test"');h.store.setItem('probe_config',JSON.stringify({[key]:'csh_boss_minion_test',unrelated:17}));const r=await h.M.reset();return r.ok&&!Object.hasOwn(h.lib.config,key)&&!Object.hasOwn(h.disk('probe_config'),key)&&h.disk('probe_config').unrelated===17&&h.store.getItem(key)===null;});
await check('reset covers registered setting and wildcard families as well as portable progress',async()=>{const h=harness();for(const k of ['csh_bgm_on','csh_bgm_on_uno','csh_bgm_volume','csh_sfx_volume','csh_ddz_name','csh_bossbook_seen'])h.store.setItem(k,'1');const r=await h.M.reset();return r.ok&&['csh_bgm_on','csh_bgm_on_uno','csh_bgm_volume','csh_sfx_volume','csh_ddz_name','csh_bossbook_seen','csh_wallet'].every(k=>h.store.getItem(k)===null);});
await check('reset cancels wallet debounce so a late timer cannot recreate the deleted wallet',async()=>{const h=harness();h.W.add(10,'fixture');const scheduled=[...h.timers.values()].some(t=>t.ms===250);const r=await h.M.reset();for(const [id,t]of [...h.timers])if(t.ms===250){h.timers.delete(id);t.fn();}return scheduled&&r.ok&&h.store.getItem('csh_wallet')===null;});
await check('real wallet unload hooks after reset save only defaults, never old balance/chain/claims',async()=>{const h=harness();h.W.add(800,'fixture');h.W.claimCareer('rank_1',115,'fixture');h.lib.cshWallet.rank.addMerit(100,'fixture');h.lib.cshWallet.task.add('hands',3);const r=await h.M.reset(),absent=h.store.getItem('csh_wallet')===null;h.unload();const raw=h.disk();return r.ok&&absent&&raw.pc===2000&&raw.chainSeq===0&&!raw.careerClaims&&h.W.pc()===2000&&h.lib.cshWallet.rank.get().merit===0&&h.lib.cshWallet.task.state().defs.find(t=>t.key==='hands').cur===0;});
await check('reset config abort restores previously deleted wallet/progress/backups',async()=>{const h=harness({idb:true,config:{[configKey]:{win:2}},database:new Map([[configKey,{win:2}]])});const imported=await h.M.import(code);h.mode('abort');const r=await h.M.reset();h.mode('complete');await h.M.recover();return !r.ok&&h.W.pc()===2800&&h.M.backups().some(b=>b.stamp===imported.backup)&&h.database.get(configKey).win===7;});
await check('CDK union contract is preserved on import and rollback',async()=>{const h=harness();h.store.setItem('csh_cdk_used','["old"]');const a=await h.M.import(code);h.store.setItem('csh_cdk_used','["old","new"]');const r=await h.M.rollback(a.backup);return r.ok&&h.disk('csh_cdk_used').includes('new');});
await check('backup timestamps are distinct even within one millisecond',async()=>{const h=harness();const a=await h.M.import(code),b=await h.M.import(code);return a.ok&&b.ok&&a.backup!==b.backup&&h.M.backups().length===2;});
await check('recovery credential is explicitly excluded from portable data',async()=>{const h=harness();return h.M.EXCLUDED.some(x=>x[0]===recoveryKey)&&!h.M.WHITELIST.includes(recoveryKey)&&!(await h.M.inspect(await h.M.export())).data[recoveryKey];});
await check('raw string storage is exported and imported without accidental JSON parsing',async()=>{const h=harness();h.store.setItem('csh_panel_skin','ink');const exported=await h.M.export(),fresh=harness(),r=await fresh.M.import(exported);return r.ok&&fresh.store.getItem('csh_panel_skin')==='ink';});
await check('built-in migration schema selftest remains complete without durable temp writes',async()=>{const h=harness(),beforeCalls=h.calls();const r=await h.M.selftest();return r.pass===48&&r.fail===0&&h.calls()===beforeCalls&&!h.store.getItem('csh_mig_selftest_tmp');});
await check('backup storage read fault cannot create a successful incomplete backup',async()=>{const h=harness();h.store.setItem('csh_player_interact','{"v":1,"total":99}');let reads=0;h.store.fault=(op,k)=>op==='read'&&k==='csh_player_interact'&&++reads===2;const r=await h.M.import(code);h.store.fault=null;return !r.ok&&h.disk('csh_player_interact').total===99&&h.W.pc()===2000&&h.M.backups().length===0;});
await check('export storage read fault rejects instead of omitting player progress',async()=>{const h=harness();h.store.setItem('csh_player_interact','{"v":1,"total":99}');h.store.fault=(op,k)=>op==='read'&&k==='csh_player_interact';try{await h.M.export();return false;}catch{return true;}});
await check('strict backup/export reject JSON parse corruption before overwriting progress',async()=>{const h=harness();h.store.setItem('csh_player_interact','broken');let refused=false;try{await h.M.export();}catch{refused=true;}const r=await h.M.import(code);return refused&&!r.ok&&h.W.pc()===2000&&h.store.getItem('csh_player_interact')==='broken';});
await check('BGM enumeration read failure aborts export and import backup',async()=>{const h=harness();h.store.fault=op=>op==='key';let refused=false;try{await h.M.export();}catch{refused=true;}const r=await h.M.import(code);return refused&&!r.ok&&h.W.pc()===2000;});
await check('group string read fault aborts backup rather than losing names on rollback',async()=>{const h=harness();h.store.setItem('csh_ddz_name','原名');let reads=0;h.store.fault=(op,k)=>op==='read'&&k==='csh_ddz_name'&&++reads===2;const r=await h.M.import(code);h.store.fault=null;return !r.ok&&h.store.getItem('csh_ddz_name')==='原名'&&h.M.backups().length===0;});
await check('wallet adoption read fault cannot report success or replace imported balance with defaults',async()=>{const h=harness();let reads=0;h.store.fault=(op,k)=>op==='read'&&k==='csh_wallet'&&JSON.parse(h.store.data.get(k)||'null')?.pc===2800&&++reads===2;const r=await h.M.import(code);h.store.fault=null;return !r.ok&&h.W.pc()===2000&&h.disk().pc===2000&&!h.store.getItem(recoveryKey);});
await check('world adoption failure remains inside transaction and restores prior wallet/config',async()=>{const h=harness();let attempts=0;h.lib.cshWorld={reloadSave(){return ++attempts>1;}};const r=await h.M.import(code);return !r.ok&&attempts===2&&h.W.pc()===2000&&h.lib.config[configKey]===undefined&&!h.store.getItem(recoveryKey);});
await check('failed world adoption during recovery preserves journal until all modules adopt',async()=>{const h=harness();h.lib.cshWorld={reloadSave(){return false;}};const r=await h.M.import(code);const waiting=!!h.store.getItem(recoveryKey);h.lib.cshWorld.reloadSave=()=>true;const recovered=await h.M.recover();return !r.ok&&r.recovery&&waiting&&recovered.ok&&h.W.pc()===2000&&!h.store.getItem(recoveryKey);});

// Extract the real bridges and page functions, not a duplicate approximation.
const shell=fs.readFileSync(path.join(root,'core/csh_shell.js'),'utf8');
const commands=['shell-mig-export','shell-mig-import','shell-mig-rollback','shell-mig-reset','shell-mig-recover'],bridge={},replyFunctions={};
walk(parse(shell),n=>{if(n.type==='IfStatement'&&n.test.type==='BinaryExpression'&&n.test.left?.name==='cmd'&&commands.includes(n.test.right?.value))bridge[n.test.right.value]=shell.slice(...n.range);if(n.type==='FunctionDeclaration'&&['captureMigReply','ackToGame','postToGame'].includes(n.id?.name))replyFunctions[n.id.name]=shell.slice(...n.range);});
function bridgeHarness(cmd){let resolve;const acks=[],promise=new Promise(r=>resolve=r);const source={postMessage(msg){acks.push(msg);}},frame={contentWindow:source,contentDocument:{}},state={frame};const ctx=vm.createContext({Promise,document:{getElementById(){return state.frame;}},migMod(){return {export(){return promise;},import(){return promise;},rollback(){return promise;},reset(){return promise;},recover(){return promise;}};}});ctx.source=source;vm.runInContext(`var SHELL_GENERATION=1,CUR_REQ='other-request';${Object.values(replyFunctions).join('\n')}function run(){var cmd=${JSON.stringify(cmd)},d={stamp:'x'},req0='request-A',migReply=captureMigReply({source},req0);${bridge[cmd]}};run();`,ctx);return {ctx,frame,state,acks,resolve};}
for(const cmd of commands){
  await check(cmd+' waits for result and preserves original request ID',async()=>{const h=bridgeHarness(cmd),waiting=h.acks.length===0;h.resolve(cmd==='shell-mig-export'?'code':{ok:false,err:'disk failure'});await Promise.resolve();return waiting&&h.acks.length===1&&h.acks[0].req==='request-A'&&(cmd==='shell-mig-export'?h.acks[0].data.code==='code':h.acks[0].ok===false&&h.acks[0].data.err==='disk failure');});
  await check(cmd+' late completion never acknowledges a newly opened frame',async()=>{const h=bridgeHarness(cmd);h.state.frame={contentWindow:{postMessage(msg){h.acks.push(msg);}},contentDocument:{}};vm.runInContext('SHELL_GENERATION++',h.ctx);h.resolve({ok:true});await Promise.resolve();return h.acks.length===0;});
  await check(cmd+' same iframe document reload invalidates old pending reply',async()=>{const h=bridgeHarness(cmd);h.frame.contentDocument={};h.resolve({ok:true});await Promise.resolve();return h.acks.length===0;});
}
const html=fs.readFileSync(path.join(root,'games/save.html'),'utf8'),inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(s=>s.trim()).join('\n');
await check('save page has a usable recovery action and surfaces host failure reason',()=>{const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',className:'',setAttribute(){},querySelector(){return null;},innerHTML:''});return nodes.get(id);};const calls=[];const ctx=vm.createContext({window:{},document:{getElementById:node,createElement(){return node('span');}},CSHPage:{transport(){return {active:true,call(name,payload,cb){calls.push(name);cb(false,{err:'磁盘写入失败'});}};}},console,setTimeout(){},navigator:{}});vm.runInContext(inline,ctx);ctx.doRecover();return html.includes('id="b-recover"')&&calls.includes('shell-mig-recover')&&node('msg').textContent.includes('磁盘写入失败');});

const failed=rows.filter(x=>!x.passed);
console.log(JSON.stringify({scope:'isolated real migration/wallet/bridge/page functions; no player saves',passed:rows.length-failed.length,failed:failed.length,failures:failed},null,2));process.exitCode=failed.length?1:0;

if(process.argv.includes('--browser')){
  const {openProbe}=await import('./lib/browser_probe.mjs');
  const sources={wallet:clean(fs.readFileSync(path.join(root,'core/csh_wallet.js'),'utf8')),migrate:clean(migration)};
  const fixture='<!doctype html><meta charset="utf-8"><title>Isolated migration persistence</title><script>globalThis.sources='+JSON.stringify(sources).replace(/<\/script/gi,'<\\/script')+';globalThis.portable='+JSON.stringify(code)+';<\/script>';
  const page=await openProbe(fixture,arg('--browser-path',undefined));
  try{
    const browser=await page.evaluate(`(async function(){
      const rows=[],key=${JSON.stringify(configKey)},recovery=${JSON.stringify(recoveryKey)};
      const check=(name,passed)=>rows.push({name,passed:!!passed});
      const opening=indexedDB.open('csh-isolated-migration',1);opening.onupgradeneeded=()=>opening.result.createObjectStore('config');
      const db=await new Promise((resolve,reject)=>{opening.onsuccess=()=>resolve(opening.result);opening.onerror=()=>reject(opening.error);});
      const read=k=>new Promise((resolve,reject)=>{const tx=db.transaction(['config']),request=tx.objectStore('config').get(k);let value;request.onsuccess=()=>value=request.result;tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(tx.error);});
      let mode='abort-after-request',aborted=false,quota=false;
      const storage={getItem:k=>localStorage.getItem(k),setItem(k,v){if(quota&&k==='csh_player_interact'){quota=false;throw new DOMException('quota','QuotaExceededError');}localStorage.setItem(k,v);},removeItem:k=>localStorage.removeItem(k),key:n=>localStorage.key(n),get length(){return localStorage.length;}};
      window.CSH={};const lib={config:{},configprefix:'isolated_',skill:{},translate:{},db:{transaction(stores,access){
        const tx=db.transaction(stores,access);
        if(access==='readwrite'&&mode==='abort-after-request'){
          const objectStore=tx.objectStore.bind(tx);tx.objectStore=function(name){const store=objectStore(name);for(const method of ['put','delete']){const native=store[method].bind(store);store[method]=function(...args){const request=native(...args);request.addEventListener('success',()=>{aborted=true;tx.abort();});return request;};}return store;};
        }return tx;
      }}};
      const args=['lib','game','ui','get','ai','_status','localStorage'],values=[lib,{saveConfig(){throw Error('unconfirmed saveConfig must not be called');},addGlobalSkill(){}},{},{},{},{},storage];
      new Function(...args,sources.wallet)(...values);new Function(...args,sources.migrate)(...values);
      const M=lib.cshMigrate,W=lib.cshWallet.wallet;lib.cshWallet.flushSave();
      const a=await M.import(portable);
      check('native request success followed by abort was exercised',aborted);
      check('aborted config import never acknowledges success',!a.ok&&a.recovery===true);
      check('native abort keeps previous config durable',!(await read(key)));
      check('native abort restores wallet instead of retaining partial import',W.pc()===2000&&JSON.parse(localStorage.getItem('csh_wallet')).pc===2000);
      check('failed restore retains durable recovery credential',!!localStorage.getItem(recovery));
      mode='complete';const b=await M.recover();
      check('recovery completes native config and clears credential',b.ok&&!localStorage.getItem(recovery)&&!(await read(key)));
      const c=await M.import(portable);
      check('native complete persists config and wallet before success',c.ok&&(await read(key)).win===7&&W.pc()===2800&&lib.config[key].win===7);
      quota=true;const d=await M.import(portable);
      check('native LS quota rejects import and restores all original values',!d.ok&&W.pc()===2800&&(await read(key)).win===7&&!localStorage.getItem(recovery));
      const e=await M.reset();
      check('native reset deletes config record and wallet after confirmed completion',e.ok&&(await read(key))===undefined&&localStorage.getItem('csh_wallet')===null&&!Object.hasOwn(lib.config,key));
      db.close();const failures=rows.filter(x=>!x.passed);return {scope:'real Chromium LS/IDB, disposable profile',passed:rows.length-failures.length,failed:failures.length,failures};
    })()`);
    console.log(JSON.stringify(browser,null,2));if(browser.failed)process.exitCode=1;
  }finally{await page.close();}

  const bootMock=`<script>window.testCalls=[];window.CSHPage={transport(){return {active:true,call(name,payload,cb){window.testCalls.push(name);if(name==='shell-mig-recover')cb(false,{err:'磁盘写入失败，请腾出空间后重试',recovery:true});else if(name==='shell-mig-inventory')cb(true,{list:[],excluded:[],version:3,recovery:{pending:true}});else if(name==='shell-mig-backups')cb(true,[]);else cb(true,{});}};}};<\/script>`;
  const ui=await openProbe(html.replace(/<script\s[^>]*src=[^>]*><\/script>/g,'').replace('<head>','<head>'+bootMock),arg('--browser-path',undefined));
  try{
    const uiRows=[];
    await ui.send('Emulation.setDeviceMetricsOverride',{width:1240,height:900,deviceScaleFactor:1,mobile:false});
    const initial=await ui.evaluate(`({pending:document.getElementById('msg').textContent,button:document.getElementById('b-recover').textContent})`);
    uiRows.push({name:'real page boot exposes pending recovery and labeled action',passed:initial.pending.includes('尚未恢复')&&initial.button==='恢复未完成操作'});
    await ui.evaluate(`document.getElementById('b-recover').scrollIntoView({block:'center'})`);
    const rect=await ui.evaluate(`(()=>{const r=document.getElementById('b-recover').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,h:r.height};})()`);
    await ui.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:rect.x,y:rect.y});
    await ui.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:rect.x,y:rect.y});
    const clicked=await ui.evaluate(`({calls:window.testCalls,message:document.getElementById('msg').textContent,overflow:document.body.scrollWidth>innerWidth})`);
    uiRows.push({name:'native pointer click reaches recovery bridge and shows failure/restore-first guidance',passed:clicked.calls.includes('shell-mig-recover')&&clicked.message.includes('磁盘写入失败')&&clicked.message.includes('恢复后再继续使用其他功能')});
    uiRows.push({name:'recovery action meets 44px target without horizontal body overflow',passed:rect.h>=44&&!clicked.overflow});
    const out=path.join(root,'docs/audit/ui/migration-recovery');fs.mkdirSync(out,{recursive:true});
    const capture=await ui.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'save-recovery-1240x900.png'),Buffer.from(capture.data,'base64'));
    const failures=uiRows.filter(x=>!x.passed);console.log(JSON.stringify({scope:'real Chromium save page boot and native pointer input; mock host failure only',passed:uiRows.length-failures.length,failed:failures.length,failures},null,2));if(failures.length)process.exitCode=1;
  }finally{await ui.close();}
}
