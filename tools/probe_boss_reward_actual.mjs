// Real wallet/rank formulas and boss record source; isolated VM/storage, no player saves.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import * as roster from '../core/csh_bossdata.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const opt=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const clean=s=>s.replace(/^import [\s\S]*?;\r?\n/gm,'').replace(/\bexport /g,'');
const record=clean(fs.readFileSync(opt('--source',path.join(root,'core/csh_bossrecord.js')),'utf8'));
const wallet=clean(fs.readFileSync(path.join(root,'core/csh_wallet.js'),'utf8'));
const KEY='extension_池子魔将_bossKill',mid=roster.allMinionIds()[0],bid=roster.allBossIds()[0];
const day=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
function harness({pc=2000,merit=0,rank=0,today=0,n=0}={}){
  const data=new Map([['csh_wallet',JSON.stringify({pc,pcPeak:pc})],['csh_rank',JSON.stringify({rank,merit,meritToday:today,meritDate:day()})]]),logs=[];
  const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),key:i=>[...data.keys()][i]??null,get length(){return data.size;}};
  const lib={config:{mode:'boss',[KEY]:{map:{},ext:{},extPool:{},minions:n?{[mid]:{n,first:1,last:2}}:{}}},skill:{},translate:{}},game={log:s=>logs.push(String(s)),saveConfig:(k,v)=>lib.config[k]=v};
  let timer=0;const timers=new Map();
  const ctx=vm.createContext({...roster,lib,game,_status:{},localStorage:storage,console:{log(){},warn(){},error(){}},window:{CSH:{},addEventListener(){}},document:{addEventListener(){}},setTimeout(fn){const id=++timer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(wallet,ctx);vm.runInContext(record+'\ninstallBossRecord();',ctx);
  return {lib,game,logs,api:lib.cshBossRecord,W:lib.cshWallet.wallet,rank:lib.cshWallet.rank,storage,timers};
}
const rows=[];function check(name,fn){try{const value=fn();rows.push({name,passed:value===true,...(value===true?{}:{detail:value})});}catch(e){rows.push({name,passed:false,detail:e.message});}}
check('ordinary minion retains full amount and actual rank return contract',()=>{const h=harness(),r=h.api.recordMinion(mid);return r.cby===800&&r.merit===25&&h.W.pc()===2800&&h.rank.get().merit===25;});
check('same minion repeated and as-boss deaths remain individually rewarded',()=>{const h=harness();h.api.recordMinion(mid);const r=h.api.recordMinion(mid,{asBoss:true});return r.n===2&&r.cby===800&&r.merit===25&&h.W.pc()===3600&&h.rank.get().merit===50;});
check('partial balance cap reports actual 100 instead of nominal 800',()=>{const h=harness({pc:99999999900}),r=h.api.recordMinion(mid);return r.cby===100&&h.W.pc()===100000000000;});
check('partial balance cap log matches actual gain',()=>{const h=harness({pc:99999999900});h.api.recordMinion(mid);return h.logs.some(s=>s.includes('CBY +100 · 功勋 +25'));});
check('full balance cap records kill but reports zero CBY',()=>{const h=harness({pc:100000000000}),r=h.api.recordMinion(mid);return r.n===1&&r.cby===0&&h.W.pc()===100000000000;});
check('fully exhausted daily merit allowance reports real 12',()=>{const h=harness({today:300}),r=h.api.recordMinion(mid);return r.merit===12&&h.rank.get().merit===12&&h.logs.some(s=>s.includes('功勋 +12'));});
check('partial daily allowance reports real 22',()=>{const h=harness({today:280}),r=h.api.recordMinion(mid);return r.merit===22&&h.rank.get().merit===22&&h.logs.some(s=>s.includes('功勋 +22'));});
check('high rank decay reports effective amount from actual formula',()=>{const h=harness({rank:40,merit:500000}),r=h.api.recordMinion(mid),gain=h.rank.get().merit-500000;return gain<25&&r.merit===gain&&h.logs.some(s=>s.includes('功勋 +'+gain));});
check('wallet exception cannot be reported as granted money',()=>{const h=harness();const write=h.storage.setItem;h.storage.setItem=(k,v)=>{if(k==='csh_wallet')throw Error('fixture unavailable');return write(k,v);};const r=h.api.recordMinion(mid);return r===null&&h.W.pc()===2000&&!h.api.read().minions[mid];});
check('missing wallet reward method is not reported as granted money',()=>{const h=harness();delete h.W.commitBossEvent;const r=h.api.recordMinion(mid);return r===null&&h.W.pc()===2000;});
check('rank refusal cannot be reported as granted merit',()=>{const h=harness();const write=h.storage.setItem;h.storage.setItem=(k,v)=>{if(k==='csh_rank')throw Error('quota');return write(k,v);};const r=h.api.recordMinion(mid);return r.merit===0&&h.rank.get().merit===0&&h.logs.some(s=>s.includes('功勋 +0'));});
check('rank exception cannot be reported as granted merit',()=>{const h=harness();const write=h.storage.setItem;h.storage.setItem=(k,v)=>{if(k==='csh_rank')throw Error('unavailable');return write(k,v);};const r=h.api.recordMinion(mid);return r.merit===0&&h.rank.get().merit===0;});
check('first and repeat heat values retain normal policy',()=>{const h=harness(),first=h.api.recordMinion(mid),second=h.api.recordMinion(mid);return first.heat===1.5&&second.heat===0.3&&h.api.minionHeat(mid)===1.8;});
check('heat approaching cap reports actual remaining 0.2',()=>{const h=harness({n:162}),r=h.api.recordMinion(mid);return r.n===163&&r.heat===0.2&&h.api.minionHeat(mid)===50&&h.logs.some(s=>s.includes('热度 +0.2%'));});
check('heat already capped reports zero rather than endless +0.3',()=>{const h=harness({n:163}),r=h.api.recordMinion(mid);return r.n===164&&r.heat===0&&h.api.minionHeat(mid)===50&&h.logs.some(s=>s.includes('热度 +0%'));});
check('boss first-kill log uses actual capped amount',()=>{const h=harness({pc:99999999900}),r=h.api.record(bid);return !!r&&h.logs.includes('首杀奖励 +100 CBY')&&h.logs.includes('每日首战奖励 +0 CBY');});
check('boss first/day reward zero is not logged as full nominal amount',()=>{const h=harness({pc:100000000000});h.api.record(bid);return h.logs.includes('首杀奖励 +0 CBY')&&h.logs.includes('每日首战奖励 +0 CBY');});
check('ordinary boss first/day and repeat amounts remain unchanged',()=>{const h=harness(),tier=roster.tierOf('csh_'+bid.slice(9));h.api.record(bid);h.api.record(bid);return h.W.pc()===2000+h.api.REWARD_FIRST[tier]+h.api.REWARD_DAILY[tier]&&h.logs.includes('首杀奖励 +'+h.api.REWARD_FIRST[tier]+' CBY');});
const failures=rows.filter(r=>!r.passed),result={scope:'actual wallet/rank formulas and record module in isolated VM; not cross-backend disk confirmation or real BOSS match',passed:rows.length-failures.length,failed:failures.length,failures,checks:rows};
if(opt('--out'))fs.writeFileSync(opt('--out'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,checks:undefined},null,2));process.exitCode=failures.length?1:0;
