// Actual record module and roster data; isolated storage/config, no game/profile imports.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import * as roster from '../core/csh_bossdata.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const opt=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const sourceFile=opt('--source',path.join(root,'core/csh_bossrecord.js'));
const source=fs.readFileSync(sourceFile,'utf8').replace(/^import [\s\S]*?;\r?\n/gm,'').replace(/\bexport /g,'');
const KEY='extension_池子魔将_bossKill',AS='extension_池子魔将_bossAsBoss',BOUNTY='extension_池子魔将_csh_bounty';
const bid=roster.allBossIds()[0],mid=roster.allMinionIds()[0];
function harness(lock=''){
  const data=new Map(),writes=[],payments=[],merits=[],affection=[],logs=[];
  const raw={map:{legacy:{n:2,last:5,best:-1}},ext:{},minions:{},extPool:{}};
  const lib={config:{mode:'boss',[KEY]:raw,[AS]:{win:2,lose:1},[BOUNTY]:mid},translate:{},character:{foreign:{isBoss:true,hp:8,skills:['one'],img:'foreign.jpg'}},cshMigrate:{recoveryState:()=>({pending:lock==='pending',busy:lock==='busy'})},cshWallet:{wallet:{add(n){payments.push(n);return n;}},rank:{addMerit(n){merits.push(n);return {ok:true,gained:n};}}},cshAffection:{noteHunt(id){affection.push(id);}}};
  const status={reloading:lock==='reloading'};
  const storage={getItem(key){if(lock==='read-error')throw Error('storage unavailable');return data.get(key)??null;},setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
  if(lock==='journal')data.set('csh_migrate_recovery','{"v":1}');
  if(lock==='invalid-journal')data.set('csh_migrate_recovery','broken');
  if(lock==='guard')lib.cshWallet.saveGuard={blocked:()=>true};
  if(lock==='guard-error')lib.cshWallet.saveGuard={blocked(){throw Error('guard unavailable');}};
  const game={me:{name:'challenger'},players:[],dead:[],roundNumber:3,bossinfo:{},boss:{name:bid,isAlive:()=>false},online:false,
    saveFail:false,saveFailAfterAdopt:false,saveConfig(k,v){if(this.saveFail)throw Error('config unavailable');lib.config[k]=v;if(this.saveFailAfterAdopt)throw Error('config rejected after adopt');writes.push({key:k,value:JSON.parse(JSON.stringify(v))});},
    log(...args){logs.push(args.join(' '));},hasPlayer(){return true;},over(){this.overCalls=(this.overCalls||0)+1;return 'native-over';}};
  const ctx=vm.createContext({...roster,lib,game,_status:status,localStorage:storage,console:{warn(){},log(){}},window:{}});
  delete lib.cshWallet;ctx.document={addEventListener(){}};ctx.window.CSH={};ctx.window.addEventListener=()=>{};ctx.setTimeout=()=>1;ctx.clearTimeout=()=>{};
  vm.runInContext(fs.readFileSync(path.join(root,'core/csh_wallet.js'),'utf8').replace(/^import .*?;\r?\n/gm,''),ctx);
  if(lock==='guard')lib.cshWallet.saveGuard={blocked:()=>true};if(lock==='guard-error')lib.cshWallet.saveGuard={blocked(){throw Error('guard unavailable');}};
  const commit=lib.cshWallet.wallet.commitBossEvent;lib.cshWallet.wallet.commitBossEvent=function(spec,token){const r=commit(spec,token);if(r.ok&&!r.already){if(r.gained)payments.push(r.gained);if(r.meritGained)merits.push(r.meritGained);}return r;};
  vm.runInContext(source+'\ninstallBossRecord();',ctx);
  const rawRecord=lib.cshBossRecord.record;lib.cshBossRecord.record=(id,opts={})=>rawRecord(id,{event:{},...opts});
  return {lib,game,status,storage,data,raw,failDurable(){const set=storage.setItem;storage.setItem=(k,v)=>{if(k==="csh_wallet")throw Error("wallet quota");return set(k,v);};},api:lib.cshBossRecord,writes,payments,merits,affection,logs,
    fingerprint:()=>JSON.stringify(lib.config)};
}
const rows=[];
function check(name,fn){try{const value=fn();rows.push({name,passed:value===true,...(value===true?{}:{detail:value})});}catch(e){rows.push({name,passed:false,detail:e.message});}}
const calls={boss:h=>h.api.record(bid,{round:3}),minion:h=>h.api.recordMinion(mid),asBoss:h=>h.api.recordAsBoss(true),foreign:h=>h.api.recordExt('foreign',{round:3}),snapshot:h=>h.api.snapshotExt(),bountySet:h=>h.api.bountySet(mid),bountyClear:h=>h.api.bountyClear()};
for(const lock of ['journal','invalid-journal','read-error','pending','busy','guard','guard-error','reloading']){
  check(lock+': summary and returned records cannot mutate original configuration',()=>{const h=harness(lock),before=h.fingerprint();h.api.summary();const view=h.api.read();view.map.legacy.n=99;return h.fingerprint()===before&&h.writes.length===0;});
  for(const [name,call] of Object.entries(calls))check(lock+': '+name+' refuses before data/payment side effects',()=>{const h=harness(lock),before=h.fingerprint();const result=call(h);const refused=name==='bountySet'?result?.ok===false:name==='snapshot'?result===0:name==='bountyClear'?result===false:result===null;return refused&&h.fingerprint()===before&&!h.writes.length&&!h.payments.length&&!h.merits.length&&!h.affection.length;});
  check(lock+': over wrapper preserves original termination without consuming record marker',()=>{const h=harness(lock),before=h.fingerprint();return h.game.over()==='native-over'&&h.game.overCalls===1&&!h.game.boss._cshBossRecorded&&h.fingerprint()===before&&!h.payments.length;});
}
check('ordinary reads return independent clean snapshots',()=>{const h=harness(),before=h.fingerprint(),view=h.api.read();view.map.legacy.n=9;return h.fingerprint()===before&&view.map.legacy.first===5&&!('best'in view.map.legacy);});
check('ordinary boss first and daily rewards retain original amounts and repeat policy',()=>{const h=harness(),first=h.api.record(bid,{round:5}),second=h.api.record(bid,{round:3});const tier=roster.tierOf('csh_'+bid.slice(9));return first.entry.n===1&&second.entry.n===2&&second.entry.best===3&&h.payments.reduce((sum,n)=>sum+n,0)===h.api.REWARD_FIRST[tier]+h.api.REWARD_DAILY[tier];});
check('ordinary repeated minion kills still each pay and increase heat',()=>{const h=harness();h.api.recordMinion(mid);h.api.recordMinion(mid,{asBoss:true});return h.lib.config[KEY].minions[mid].n===2&&h.payments.join(',')==='800,800'&&h.merits.join(',')==='25,25'&&h.affection.length===2&&h.api.minionHeat(mid)===1.8;});
check('ordinary bounty set and fulfilled clear retain semantics',()=>{const h=harness();const ok=h.api.bountySet(mid);h.api.recordMinion(mid);return ok.ok&&h.lib.config[BOUNTY]===''&&h.api.bountyGet()==='';});
check('ordinary foreign snapshot record and as-boss counters persist',()=>{const h=harness();return h.api.snapshotExt()>0&&h.api.recordExt('foreign').n===1&&h.api.recordAsBoss(true).win===3&&h.api.recordAsBoss(false).lose===2;});
check('summary return value cannot mutate already saved records',()=>{const h=harness();h.api.record(bid);const before=h.fingerprint(),summary=h.api.summary();summary.map[bid].n=999;return h.fingerprint()===before;});
check('synchronous record failure does not adopt memory or pay',()=>{const h=harness(),before=h.fingerprint();h.failDurable();return h.api.record(bid)===null&&h.fingerprint()===before&&!h.payments.length;});
check('synchronous minion failure does not consume bounty or reward',()=>{const h=harness(),before=h.fingerprint();h.failDurable();return h.api.recordMinion(mid)===null&&h.fingerprint()===before&&!h.payments.length&&!h.merits.length&&!h.affection.length;});
check('synchronous as-boss failure leaves original counters',()=>{const h=harness(),before=h.fingerprint();h.failDurable();return h.api.recordAsBoss(true)===null&&h.fingerprint()===before;});
check('recovery unlock permits only new normal calls',()=>{const h=harness('journal');h.api.recordMinion(mid);h.data.clear();return h.api.recordMinion(mid)?.n===1&&h.payments.join(',')==='800';});
check('malformed original record is preserved and bounty eligibility fails closed',()=>{const h=harness();h.lib.config[KEY]='unreadable legacy payload';h.lib.cshWallet.reloadSave({wallet:{pc:2000},rank:null,dailyTask:null},{memoryOnly:true});const before=h.fingerprint();return h.api.record(bid)===null&&h.api.bountyCheck(mid).ok===false&&h.api.bountySet(mid).ok===false&&h.fingerprint()===before&&!h.payments.length&&!h.writes.length;});
check('invalid nested store shape is preserved rather than silently replaced',()=>{const h=harness();h.lib.config[KEY].minions=[];h.lib.cshWallet.reloadSave({wallet:{pc:2000},rank:null,dailyTask:null},{memoryOnly:true});const before=h.fingerprint();return h.api.recordMinion(mid)===null&&h.fingerprint()===before&&!h.payments.length;});
check('host mirror rejection cannot cancel a durable accepted economic record',()=>{const h=harness();h.game.saveFailAfterAdopt=true;const r=h.api.record(bid);return !!r&&h.api.read().map[bid].n===1&&h.lib.cshWallet.wallet.pc()===2000+r.cby;});
check('guard change between eligibility read and save refuses bounty mutation',()=>{const h=harness(),before=h.fingerprint();let reads=0;h.lib.cshMigrate.recoveryState=()=>({busy:++reads>=2,pending:false});return h.api.bountySet(mid).ok===false&&h.fingerprint()===before&&!h.writes.length;});
check('failed over capture preserves marker and original native over',()=>{const h=harness(),before=h.fingerprint();h.failDurable();return h.game.over()==='native-over'&&!h.game.boss._cshBossRecorded&&h.fingerprint()===before&&!h.payments.length;});
check('serialized config reload preserves counts and first/daily reward policy',()=>{const first=harness();first.api.record(bid);first.api.recordMinion(mid);const second=harness();second.lib.config=JSON.parse(JSON.stringify(first.lib.config));second.lib.cshWallet.wallet.preserveBoss({bossKill:second.lib.config[KEY]});return second.api.record(bid).entry.n===2&&second.api.recordMinion(mid).n===2&&second.payments.join(',')==='800'&&second.merits.join(',')==='25';});
check('restored configuration replaces old snapshots before next record',()=>{const h=harness();h.api.recordMinion(mid);const old=h.api.read();h.lib.config[KEY]=JSON.parse(JSON.stringify(h.lib.config[KEY]));h.lib.config[KEY].minions[mid].n=8;h.lib.cshWallet.wallet.preserveBoss({bossKill:h.lib.config[KEY]});return h.api.recordMinion(mid).n===9&&old.minions[mid].n===1&&h.lib.config[KEY].minions[mid].n===9;});
check('accepted over capture consumes marker only once and preserves native over calls',()=>{const h=harness();h.game.over();h.game.over();return h.game.overCalls===2&&h.game.boss._cshBossRecorded===true&&h.lib.config[KEY].map[bid].n===1&&h.payments.length===1&&h.payments[0]>0;});
const failures=rows.filter(row=>!row.passed),result={scope:'actual bossrecord and roster in isolated VM; actual wallet and synthetic config, no real profile or BOSS match',source:sourceFile,passed:rows.length-failures.length,failed:failures.length,failures,checks:rows};
if(opt('--out'))fs.writeFileSync(opt('--out'),JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,checks:undefined},null,2));process.exitCode=failures.length?1:0;
