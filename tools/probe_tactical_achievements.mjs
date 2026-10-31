// Actual event adapter, isolated wallet/migration. Synthetic traces are not natural matches.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import{webcrypto}from'node:crypto';import{fileURLToPath,pathToFileURL}from'node:url';
const opt=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1]},root=opt('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const {parse,walk}=await import(pathToFileURL(path.join(root,'tools/lib/skill_audit.mjs')));
const pool=fs.readFileSync(opt('--pool-source',path.join(root,'core/csh_pool_achv.js')),'utf8');
let prefix=fs.readFileSync(path.join(root,'tools/probe_pool_achv_rebuild.mjs'),'utf8').split('let rows=[];')[0].replace(/^import .*;\r?\n/gm,'');
prefix=prefix.replace("const before=opt('--before-dir'),poolSource=opt('--pool-source'),src=f=>fs.readFileSync(f==='core/csh_pool_achv.js'&&poolSource?poolSource:before?path.join(before,f.replaceAll('/','_')+'.before'):path.join(root,f),'utf8');","const src=f=>f==='core/csh_pool_achv.js'?pool:fs.readFileSync(path.join(root,f),'utf8');");
const ctx=vm.createContext({fs,path,vm,webcrypto,root,parse,walk,pool,process,console,TextEncoder,TextDecoder,btoa,atob});vm.runInContext(prefix+'\nthis.make=harness;this.storage=storage;',ctx);
const make=mode=>ctx.make(ctx.storage(),{wallet:true,migrate:true,config:{mode:mode||'identity'}});
const base=make(),PA=base.PA,rules=PA.RULES.filter(r=>r.collection==='tactics-20261030'),checks=[];
async function check(name,fn){try{const value=await fn();checks.push({name,passed:value===true,...(value===true?{}:{detail:value})});}catch(e){checks.push({name,passed:false,error:e.stack});}}
await check('28 unique new definitions and unchanged 100 hero profiles',()=>rules.length===28&&new Set(rules.map(r=>r.id)).size===28&&PA.PROFILES.length===100&&PA.selfTest().ok);
const before=opt('--before');if(before)await check('all original 1380 definitions functions rewards and ordering preserved',()=>{const context=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(before,'utf8'),context);const old=context.window.CSH_POOL_ACHV;const serialize=r=>JSON.stringify(r,(_,v)=>typeof v==='function'?v.toString():v);return old.RULES.length===1380&&old.RULES.every((r,i)=>serialize(r)===serialize(PA.RULES[i])&&JSON.stringify(old.reward(r))===JSON.stringify(PA.reward(PA.RULES[i])));});
for(const r of rules){
 const s=r.tactic;
 function run(){const a=PA.newRun({mode:r.modes[0]||'identity',meSeat:1,meIdentity:s.identity||'zhu'});a.isLandlord=s.landlord??null;for(const [k,v]of s.needs)a.masteryCounts[k]=v;return a;}
 await check(r.id+' exact inclusive threshold',()=>r.test({t:'over',win:true},run()));
 for(const [key,target]of s.needs)await check(r.id+' below '+key,()=>{const a=run();a.masteryCounts[key]=target-1;return !r.test({t:'over',win:true},a)});
 await check(r.id+' fresh match cannot inherit counters',()=>!r.test({t:'over',win:true},PA.newRun({mode:r.modes[0]||'identity',meSeat:1,meIdentity:s.identity||'zhu'})));
 if(s.win)await check(r.id+' loss does not satisfy victory',()=>!r.test({t:'over',win:false},run()));
 if(s.identity)await check(r.id+' wrong identity',()=>{const a=run();a.meIdentity='wrong';return !r.test({t:'over',win:true},a)});
 if(typeof s.landlord==='boolean')await check(r.id+' wrong landlord role',()=>{const a=run();a.isLandlord=!s.landlord;return !r.test({t:'over',win:true},a)});
 if(r.modes.length)await check(r.id+' mode isolation through judge',()=>{const a=run();a.mode='identity'===r.modes[0]?'versus':'identity';return !PA.judge(a,{t:'over',win:true}).some(x=>x.id===r.id)});
 await check(r.id+' actual adapters unlock and persist at match end',async()=>{
  const h=make(r.modes[0]||'identity');h.me.identity=s.identity||'zhu';if(s.landlord===false){h.ctx.game.zhu=h.foe;h.me.identity='fan';}if(!await h.start())return 'start rejected';
  for(const [metric,n]of s.needs){const [kind,key]=metric.split(':');
   if(kind==='c')for(let i=0;i<n;i++){const type=key.startsWith('type.')?key.slice(5):key==='wuxie'?'trick':'basic',name=key.startsWith('type.')?({basic:'sha',trick:'wuzhong',equip:'zhuge'})[type]:key==='respond'?'shan':key;await h.fire(key==='respond'?'respondAfter':'useCardAfter',{player:h.me,card:{name,type},cards:[{}]});}
   else if(kind==='d')await h.fire('damageEnd',{player:h.foe,source:h.me,num:n,card:key==='sha'?{name:'sha'}:null,nature:['fire','thunder','ice'].includes(key)?key:''});
   else if(kind==='g')await h.fire('gainAfter',{player:h.me,cards:Array.from({length:n},()=>({}))});
   else if(kind==='l')await h.fire('loseAfter',{player:h.me,type:'discard',cards2:Array.from({length:n},()=>({}))});
   else if(kind==='r')await h.fire('recoverEnd',{player:h.me,num:n});
   else if(kind==='e'){const equips=[];h.me.getVCards=()=>equips;for(let i=0;i<n;i++){const card={name:'zhuge',cards:[]},ev={player:h.me,card,vcards:[card]};await h.fire('equipBefore',ev);equips.push(card);await h.fire('equipAfter',ev);}}
   else if(kind==='q')for(let i=0;i<n;i++)await h.fire(key==='compare'?'chooseToCompareAfter':'judgeEnd',{player:h.me,target:h.foe,card1:{number:5},result:{bool:true,card:{name:'sha',number:5}}});
   else throw Error('Fixture metric not supported: '+metric);
  }
  if(h.PA.load().got[r.id])return 'unlocked before over';
  h.ctx.game.over(true);if(!h.PA.load().got[r.id])return 'not saved';
  const h2=ctx.make(h.store,{wallet:true,migrate:true,config:{mode:r.modes[0]||'identity'}});return !!h2.PA.load().got[r.id];
 });
}
await check('new achievement claims once across save reload',async()=>{const h=make();h.PA.unlock('tc_three_basics','identity');const before=h.W.pc(),first=h.claim('tc_three_basics'),balance=h.W.pc(),second=h.claim('tc_three_basics');const re=ctx.make(h.store,{wallet:true});const replay=re.claim('tc_three_basics');return first?.ok&&balance===before+500&&second?.ok&&second.data.already&&replay?.ok&&replay.data.already&&re.W.pc()===balance});
const result={scope:'Actual sources, synthetic events and isolated persistence; not 28 natural human matches',passed:checks.filter(r=>r.passed).length,failed:checks.filter(r=>!r.passed).length,failures:checks.filter(r=>!r.passed),checks};if(opt('--out'))fs.writeFileSync(opt('--out'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,checks:undefined},null,2));if(result.failed)process.exitCode=1;
