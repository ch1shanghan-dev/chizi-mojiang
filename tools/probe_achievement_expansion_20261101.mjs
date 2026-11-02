// Actual event adapter, isolated wallet/migration. Synthetic traces are not natural matches.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import{webcrypto}from'node:crypto';import{fileURLToPath,pathToFileURL}from'node:url';
const opt=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1]},root=opt('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const {parse,walk}=await import(pathToFileURL(path.join(root,'tools/lib/skill_audit.mjs')));
const pool=fs.readFileSync(opt('--pool-source',path.join(root,'core/csh_pool_achv.js')),'utf8');
let prefix=fs.readFileSync(path.join(root,'tools/probe_pool_achv_rebuild.mjs'),'utf8').split('let rows=[];')[0].replace(/^import .*;\r?\n/gm,'');
prefix=prefix.replace("const before=opt('--before-dir'),poolSource=opt('--pool-source'),src=f=>fs.readFileSync(f==='core/csh_pool_achv.js'&&poolSource?poolSource:before?path.join(before,f.replaceAll('/','_')+'.before'):path.join(root,f),'utf8');","const src=f=>f==='core/csh_pool_achv.js'?pool:fs.readFileSync(path.join(root,f),'utf8');");
const ctx=vm.createContext({fs,path,vm,webcrypto,root,parse,walk,pool,process,console,TextEncoder,TextDecoder,btoa,atob});vm.runInContext(prefix+'\nthis.make=harness;this.storage=storage;',ctx);
const make=mode=>ctx.make(ctx.storage(),{wallet:true,migrate:true,config:{mode:mode||'identity'}});
const base=make(),PA=base.PA,rules=PA.RULES.filter(r=>r.collection==='tactics-20261101'),checks=[];
async function check(name,fn){try{const value=await fn();checks.push({name,passed:value===true,...(value===true?{}:{detail:value})});}catch(e){checks.push({name,passed:false,error:e.stack});}}
await check('26 new concrete tactics, four collection routes and unchanged 100 hero profiles',()=>rules.length===26&&PA.RULES.filter(r=>r.collection==='journeys-20261101').length===4&&new Set(rules.map(r=>r.id)).size===26&&PA.PROFILES.length===100&&PA.selfTest().ok);
const before=opt('--before');if(before)await check('all original 1408 definitions functions rewards and ordering preserved',()=>{const context=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(before,'utf8'),context);const old=context.window.CSH_POOL_ACHV;const serialize=r=>JSON.stringify(r,(_,v)=>typeof v==='function'?v.toString():v);return old.RULES.length===1408&&old.RULES.every((r,i)=>serialize(r)===serialize(PA.RULES[i])&&JSON.stringify(old.reward(r))===JSON.stringify(PA.reward(PA.RULES[i])));});
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
   if(kind==='c')for(let i=0;i<n;i++){const type=key.startsWith('type.')?key.slice(5):['sha','shan','tao','jiu','respond'].includes(key)?'basic':'trick',name=key.startsWith('type.')?({basic:'sha',trick:'wuzhong',equip:'zhuge'})[type]:key==='respond'?'shan':key;await h.fire(key==='respond'?'respondAfter':'useCardAfter',{player:h.me,card:{name,type},cards:[{}]});}
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
await check('new achievement claims once across save reload',async()=>{const h=make();h.PA.unlock('nx_draw_discard','identity');const before=h.W.pc(),first=h.claim('nx_draw_discard'),balance=h.W.pc(),second=h.claim('nx_draw_discard');const re=ctx.make(h.store,{wallet:true});const replay=re.claim('nx_draw_discard');return first?.ok&&balance===before+PA.reward(PA.RULES.find(r=>r.id==='nx_draw_discard')).pc&&second?.ok&&second.data.already&&replay?.ok&&replay.data.already&&re.W.pc()===balance});

const journeys=PA.RULES.filter(r=>r.collection==='journeys-20261101');
const sources=Object.fromEntries(PA.RULES.filter(r=>r.tactic).map(r=>[r.id,r]));
function pureFor(r){const spec=r.tactic||{},a=PA.newRun({mode:r.modes[0]||'identity',meSeat:1,meIdentity:spec.identity||'zhu'});a.isLandlord=spec.landlord??null;for(const [metric,n]of spec.needs||[])(metric.startsWith('p:')?a.masteryPeaks:a.masteryCounts)[metric]=n;return a;}
async function feedNeeds(h,spec,actor=h.me){
 for(const [metric,n]of spec.needs){const [kind,key]=metric.split(':');
  if(kind==='c')for(let i=0;i<n;i++){const type=key.startsWith('type.')?key.slice(5):['sha','shan','tao','jiu','respond'].includes(key)?'basic':'trick',name=key.startsWith('type.')?({basic:'sha',trick:'wuzhong',equip:'zhuge'})[type]:key==='respond'?'shan':key;await h.fire(key==='respond'?'respondAfter':'useCardAfter',{player:actor,card:{name,type},cards:[{}]});}
  else if(kind==='d')await h.fire('damageEnd',{player:actor===h.me?h.foe:h.me,source:actor,num:n,card:key==='sha'?{name:'sha'}:null,nature:['fire','thunder','ice'].includes(key)?key:''});
  else if(kind==='g')await h.fire('gainAfter',{player:actor,cards:Array.from({length:n},()=>({}))});
  else if(kind==='l')await h.fire('loseAfter',{player:actor,type:'discard',cards2:Array.from({length:n},()=>({}))});
  else if(kind==='r')await h.fire('recoverEnd',{player:actor,num:n});
  else if(kind==='e'){const equips=[];actor.getVCards=()=>equips;for(let i=0;i<n;i++){const card={name:'zhuge',cards:[]},ev={player:actor,card,vcards:[card]};await h.fire('equipBefore',ev);equips.push(card);await h.fire('equipAfter',ev);}}
  else if(kind==='q')for(let i=0;i<n;i++)await h.fire(key==='compare'?'chooseToCompareAfter':'judgeEnd',{player:actor,target:actor===h.me?h.foe:actor,card1:{number:5},result:{bool:true,card:{name:'sha',number:5}}});
  else throw Error('unsupported actual metric '+metric);
 }
}
await check('new and old tactical structured conditions are all distinct',()=>{const ids=PA.RULES.filter(r=>r.tactic).map(r=>JSON.stringify({needs:[...r.tactic.needs].sort((a,b)=>a[0].localeCompare(b[0])),modes:[...r.modes].sort(),win:!!r.tactic.win,identity:r.tactic.identity||'',landlord:r.tactic.landlord??null}));return new Set(ids).size===ids.length});
await check('thirty added stable IDs and names do not collide with any existing entry',()=>PA.RULES.length>=1438&&new Set(PA.RULES.map(r=>r.id)).size===PA.RULES.length&&new Set(rules.concat(journeys).map(r=>r.name)).size===30);
for(const r of journeys){
 await check(r.id+' all route references are actual tactical rules',()=>r.journey.groups.every(g=>g.length&&g.every(id=>sources[id])));
 await check(r.id+' empty save cannot invent a collection',()=>!r.test({t:'over',win:true},pureFor(r)));
 for(let missing=0;missing<r.journey.groups.length;missing++)await check(r.id+' missing route group '+missing,()=>{const a=pureFor(r);a.masteryState={got:Object.fromEntries(r.journey.groups.filter((g,i)=>i!==missing).map(g=>[g[0],{t:1}]))};return !r.test({t:'over',win:true},a)});
 await check(r.id+' stored alternatives count once per route group',()=>{const got=Object.fromEntries(r.journey.groups.flat().map(id=>[id,{t:1}])),a=pureFor(r);a.masteryState={got};return r.test({t:'over',win:false},a)&&PA.progress(r,{got}).value===r.journey.groups.length&&PA.progress(r,{got}).target===r.journey.groups.length});
 await check(r.id+' latest qualified tactic completes its route in the same end event',()=>{const last=sources[r.journey.groups.at(-1)[0]],a=pureFor(last);a.masteryState={got:Object.fromEntries(r.journey.groups.slice(0,-1).map(g=>[g[0],{t:1}]))};return r.test({t:'over',win:true},a)});
 await check(r.id+' earlier card events never complete collection routes',()=>{const a=pureFor(r);a.masteryState={got:Object.fromEntries(r.journey.groups.flat().map(id=>[id,{t:1}]))};return !r.test({t:'useCard',win:true},a)});
 await check(r.id+' actual last tactic and route persist together then reload',async()=>{const last=sources[r.journey.groups.at(-1)[0]],h=make(last.modes[0]||'identity');for(const g of r.journey.groups.slice(0,-1))h.PA.unlock(g[0],'identity');h.me.identity=last.tactic.identity||'zhu';if(last.tactic.landlord===false){h.ctx.game.zhu=h.foe;h.me.identity='fan';}await h.start();await feedNeeds(h,last.tactic);if(h.PA.load().got[r.id])return 'unlocked before over';h.ctx.game.over(true);const st=h.PA.load(),re=ctx.make(h.store,{wallet:true,migrate:true});return !!st.got[last.id]&&!!st.got[r.id]&&st.got[last.id].t===st.got[r.id].t&&!!re.PA.load().got[r.id]});
}
await check('route progress supports omitted state and reads only saved source completions',()=>{const r=journeys[0];PA.unlock(r.journey.groups[0][0],'identity');const p=PA.progress(r);return p.value===1&&p.target===r.journey.groups.length&&!p.done});
await check('cross-mode route cannot complete a versus tactic in identity mode',()=>{const r=journeys.find(r=>r.id==='jr_three_realms'),last=sources.nx_versus_counter,a=pureFor(last);a.mode='identity';a.masteryState={got:Object.fromEntries(r.journey.groups.slice(0,-1).map(g=>[g[0],{t:1}]))};return !r.test({t:'over',win:true},a)});
await check('opponent card and recovery facts cannot earn own new tactics',async()=>{const h=make();await h.start();await feedNeeds(h,sources.nx_wine_stand.tactic,h.foe);h.ctx.game.over(true);return !h.PA.load().got.nx_wine_stand});
await check('failed pool write adopts neither uncommitted last tactic nor collection',async()=>{const h=make(),r=journeys.find(r=>r.id==='jr_arms_and_plans'),last=sources.nx_duel_answers;for(const g of r.journey.groups.slice(0,-1))h.PA.unlock(g[0],'identity');await h.start();await feedNeeds(h,last.tactic);h.store.failKey=h.PA.KEY;h.ctx.game.over(true);if(h.PA.load().got[r.id]||h.PA.load().got[last.id])return 'uncommitted record adopted';return true;});

async function failedFinal(key){const h=make(),r=journeys.find(r=>r.id==='jr_arms_and_plans'),last=sources.nx_duel_answers;for(const g of r.journey.groups.slice(0,-1))h.PA.unlock(g[0],'identity');await h.start();await feedNeeds(h,last.tactic);h.store.failKey=key==='pool'?h.PA.KEY:h.ctx.lib.cshWallet.pending.KEY;h.ctx.game.over(true);return {h,r,last};}
function committedOnce(h,r,last){const st=h.PA.load();return !!st.got[r.id]&&!!st.got[last.id]&&st.got[last.id].n===1&&st.got[r.id].n===1&&st.chars.test_hero===1&&h.ctx.lib.cshWallet.pending.status().count===0;}
await check('failed final pool write recovers through real pending.retry exactly once',async()=>{const {h,r,last}=await failedFinal('pool');if(h.PA.load().got[r.id]||h.ctx.lib.cshWallet.pending.status().count!==1)return 'missing pending intent or phantom completion';h.store.failKey='';h.ctx.lib.cshWallet.pending.retry();const snapshot=JSON.stringify(h.PA.load());h.ctx.lib.cshWallet.pending.retry();h.ctx.game.over(true);return committedOnce(h,r,last)&&JSON.stringify(h.PA.load())===snapshot});
await check('failed result journal remains volatile then retries exactly once',async()=>{const {h,r,last}=await failedFinal('journal');if(h.ctx.lib.cshWallet.pending.status().volatile!==1||h.PA.load().got[r.id])return 'volatile result not retained';h.store.failKey='';h.ctx.lib.cshWallet.pending.retry();const snapshot=JSON.stringify(h.PA.load());h.ctx.lib.cshWallet.pending.retry();return committedOnce(h,r,last)&&JSON.stringify(h.PA.load())===snapshot});
await check('durable failed final result survives reload and retries without another match',async()=>{const {h,r,last}=await failedFinal('pool');h.store.failKey='';const re=ctx.make(h.store,{wallet:true,migrate:true});re.ctx.lib.cshWallet.pending.retry();const snapshot=JSON.stringify(re.PA.load());re.ctx.lib.cshWallet.pending.retry();return committedOnce(re,r,last)&&JSON.stringify(re.PA.load())===snapshot});
await check('older pending result after a new start never injects metrics into the new match',async()=>{const {h,r,last}=await failedFinal('pool');await h.start();h.store.failKey='';h.ctx.lib.cshWallet.pending.retry();if(!committedOnce(h,r,last))return 'old result not independently recovered';await feedNeeds(h,sources.nx_steal_dismantle.tactic);h.ctx.game.over(false);const st=h.PA.load();return st.chars.test_hero===1&&st.got[last.id].n===1&&!!st.got.nx_steal_dismantle&&!st.got.nx_trick_answers&&h.ctx.lib.cshWallet.pending.status().count===0});
await check('all original unlock and claimed records plus long progress survive expansion reload',()=>{const h=make(),st=h.PA.load();for(const r of PA.RULES.slice(0,1408)){st.got[r.id]={t:31,m:'identity',n:2};st.seen[r.id]=47;}st.chars={csh_taizong:17};st.progress={op_cards_total:456,op_damage_total:789};st.mastery={csh_taizong:{totals:{'c:sha':67},peaks:{'p:hand':12}}};if(!h.PA.save(st))return 'old-shaped save rejected';const re=ctx.make(h.store,{wallet:true,migrate:true}),loaded=re.PA.load();return JSON.stringify(loaded)===JSON.stringify(st)&&PA.RULES.slice(0,1408).every(r=>loaded.got[r.id].n===2&&loaded.seen[r.id]===47)});
await check('new route claim uses the original reward and durable once-only receipt',()=>{const h=make(),id='jr_arms_and_plans',r=journeys.find(r=>r.id===id);h.PA.unlock(id,'identity');const before=h.W.pc(),ack=h.claim(id),paid=h.W.pc();h.claim(id);const re=ctx.make(h.store,{wallet:true,migrate:true});re.claim(id);return ack.ok&&paid===before+PA.reward(r).pc&&re.W.pc()===paid});
const result={scope:'Actual sources, synthetic events and isolated persistence; not 30 natural human matches',passed:checks.filter(r=>r.passed).length,failed:checks.filter(r=>!r.passed).length,failures:checks.filter(r=>!r.passed),checks};if(opt('--out'))fs.writeFileSync(opt('--out'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,checks:undefined},null,2));if(result.failed)process.exitCode=1;
