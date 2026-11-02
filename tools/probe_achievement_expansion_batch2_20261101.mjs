// Actual event adapter, isolated wallet/migration. Synthetic traces are not natural matches.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import{webcrypto,createHash}from'node:crypto';import{fileURLToPath,pathToFileURL}from'node:url';
const opt=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1]},root=opt('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const {parse,walk}=await import(pathToFileURL(path.join(root,'tools/lib/skill_audit.mjs')));
const pool=fs.readFileSync(opt('--pool-source',path.join(root,'core/csh_pool_achv.js')),'utf8');
let prefix=fs.readFileSync(path.join(root,'tools/probe_pool_achv_rebuild.mjs'),'utf8').split('let rows=[];')[0].replace(/^import .*;\r?\n/gm,'');
prefix=prefix.replace("const before=opt('--before-dir'),poolSource=opt('--pool-source'),src=f=>fs.readFileSync(f==='core/csh_pool_achv.js'&&poolSource?poolSource:before?path.join(before,f.replaceAll('/','_')+'.before'):path.join(root,f),'utf8');","const src=f=>f==='core/csh_pool_achv.js'?pool:fs.readFileSync(path.join(root,f),'utf8');");
const ctx=vm.createContext({fs,path,vm,webcrypto,root,parse,walk,pool,process,console,TextEncoder,TextDecoder,btoa,atob});vm.runInContext(prefix+'\nthis.make=harness;this.storage=storage;',ctx);
const make=mode=>ctx.make(ctx.storage(),{wallet:true,migrate:true,config:{mode:mode||'identity'}});

const configure=h=>{for(const a of [h.me,h.foe]){a.equips=[];a.hujia=0;a.countCards=function(k){return k==='e'?this.equips.length:this.hand;};a.getVCards=function(){return this.equips;};}return h;};
const build=mode=>configure(make(mode)),base=build(),PA=base.PA,rules=PA.RULES.filter(r=>r.collection==='tactics-20261101b'),journeys=PA.RULES.filter(r=>r.collection==='journeys-20261101b'),byId=Object.fromEntries(PA.RULES.map(r=>[r.id,r])),checks=[];
async function check(name,fn){try{const value=await fn();checks.push({name,passed:value===true,...(value===true?{}:{detail:value})});}catch(e){checks.push({name,passed:false,error:e.stack});}}
function pure(r,mode='identity'){const a=PA.newRun({mode,meSeat:1,meIdentity:'zhu'});for(const [k,n]of r.tactic?.needs||[])(k.startsWith('p:')?a.masteryPeaks:a.masteryCounts)[k]=n;return a;}
async function feed(h,spec,actor=h.me){for(const [metric,n]of spec.needs){const [kind,key]=metric.split(':');
 if(kind==='c')for(let i=0;i<n;i++){const type=['sha','shan','tao','jiu','respond'].includes(key)?'basic':['lebu','bingliang','shandian'].includes(key)?'delay':'trick',name=key==='respond'?'shan':key;await h.fire(key==='respond'?'respondAfter':'useCardAfter',{player:actor,card:{name,type},cards:[{}]});}
 else if(kind==='d')await h.fire('damageEnd',{player:actor===h.me?h.foe:h.me,source:actor,num:n,card:key==='sha'?{name:'sha'}:null,nature:['fire','thunder','ice'].includes(key)?key:''});
 else if(kind==='l')await h.fire('loseAfter',{player:actor,type:'discard',cards2:Array.from({length:n},()=>({}))});
 else if(kind==='r')await h.fire('recoverEnd',{player:actor,num:n});
 else if(kind==='e')for(let i=0;i<n;i++){const card={name:'zhuge',cards:[]},ev={player:actor,card,vcards:[card]};await h.fire('equipBefore',ev);actor.equips.push(card);await h.fire('equipAfter',ev);}
 else if(kind==='q')for(let i=0;i<n;i++)await h.fire(key==='compare'?'chooseToCompareAfter':'judgeEnd',{player:actor,target:actor===h.me?h.foe:actor,card1:{number:5},result:{bool:true,card:{name:'sha',number:5}}});
 else if(kind==='p'){if(key==='hand')actor.hand=n;else if(key==='armor')actor.hujia=n;else if(key==='maxhp')actor.maxHp=n;else if(key==='equip')actor.equips=Array.from({length:n},()=>({}));else throw Error('unknown peak '+key);await h.fire('phaseAfter',{player:actor});}
 else throw Error('unsupported metric '+metric);
}}
await check('13 concrete tactics and two routes appended to unchanged 1438 definitions',()=>rules.length===13&&journeys.length===2&&PA.RULES.length===1453&&PA.PROFILES.length===100&&PA.selfTest().ok);
// Frozen SHA256 of the original 1931-definition source backup, before this batch.
// Removal is convenient for standalone gates; the external hash prevents self-certification.
const BASELINE_SHA256='92e31d88a18f8eafb31fab6c40f097e3e2a2407b5a74ac3ae8c356a90e9d5c64';
// LF digest verified from the same external pre-batch backup with the raw hash above.
const BASELINE_LF_SHA256='e1af4fb8d46421ed78c616eca38fbf8ed73fb088a6d08a9b3733593f877454fa';
const lf=s=>s.replace(/\r\n/g,'\n');
const blockStart=pool.indexOf('    /* 第二批战术'),blockEnd=pool.indexOf('\tvar INDEX = {};',blockStart);
if(blockStart<0||blockEnd<=blockStart)throw Error('Second batch definition block is missing');
const derivedBaseline=pool.slice(0,blockStart)+pool.slice(blockEnd),before=opt('--before'),baselineSource=before?fs.readFileSync(before,'utf8'):derivedBaseline;
await check('1931 baseline source hash matches frozen original with only CRLF/LF normalized',()=>createHash('sha256').update(baselineSource,'utf8').digest('hex')===BASELINE_SHA256||createHash('sha256').update(lf(baselineSource),'utf8').digest('hex')===BASELINE_LF_SHA256);
const oldContext=vm.createContext({window:{}});vm.runInContext(baselineSource,oldContext);const old=oldContext.window.CSH_POOL_ACHV;
await check('source differs from baseline only by the appended pure definition block',()=>{const start=pool.indexOf('    /* 第二批战术'),end=pool.indexOf('\tvar INDEX = {};',start);return start>=0&&end>start&&lf(pool.slice(0,start)+pool.slice(end))===lf(baselineSource)});
await check('all 1438 old definitions tests ordering rewards and 100 character profiles preserved',()=>{const ser=r=>JSON.stringify(r,(_,v)=>typeof v==='function'?v.toString():v);return old.RULES.length===1438&&old.RULES.every((r,i)=>ser(r)===ser(PA.RULES[i])&&JSON.stringify(old.reward(r))===JSON.stringify(PA.reward(PA.RULES[i])))&&JSON.stringify(old.PROFILES)===JSON.stringify(PA.PROFILES)});
await check('all new stable IDs and names unique across the complete pool catalog',()=>new Set(PA.RULES.map(r=>r.id)).size===1453&&new Set(PA.RULES.map(r=>r.name)).size===1453);
await check('new tactics never reuse an old set of metrics merely with new thresholds',()=>{const sets=PA.RULES.filter(r=>r.tactic).map(r=>r.tactic.needs.map(x=>x[0]).sort().join('|'));return rules.every(r=>sets.filter(s=>s===r.tactic.needs.map(x=>x[0]).sort().join('|')).length===1)});
for(const r of rules){
 await check(r.id+' exact thresholds',()=>r.test({t:'over',win:true},pure(r)));
 for(const [k,n]of r.tactic.needs)await check(r.id+' missing one condition '+k,()=>{const a=pure(r);(k.startsWith('p:')?a.masteryPeaks:a.masteryCounts)[k]=n-1;return !r.test({t:'over',win:true},a)});
 if(r.tactic.win)await check(r.id+' victory cannot be replaced by loss',()=>!r.test({t:'over',win:false},pure(r)));
 await check(r.id+' three normal modes accepted and unsupported mode rejected',()=>['identity','doudizhu','versus'].every(m=>PA.judge(pure(r,m),{t:'over',win:true}).some(x=>x.id===r.id))&&!PA.judge(pure(r,'guozhan'),{t:'over',win:true}).some(x=>x.id===r.id));
 await check(r.id+' actual successful adapters save only at over and reload',async()=>{const h=build();await h.start();await feed(h,r.tactic);if(h.PA.load().got[r.id])return 'premature';h.ctx.game.over(true);const re=configure(ctx.make(h.store,{wallet:true,migrate:true}));return !!h.PA.load().got[r.id]&&!!re.PA.load().got[r.id]});
 await check(r.id+' opponent events and public peaks never credited to self',async()=>{const h=build();await h.start();await feed(h,r.tactic,h.foe);h.ctx.game.over(true);return !h.PA.load().got[r.id]});
 await check(r.id+' reload claim uses original reward only once',()=>{const h=build();h.PA.unlock(r.id,'identity');const before=h.W.pc(),ack=h.claim(r.id),paid=h.W.pc();h.claim(r.id);const re=configure(ctx.make(h.store,{wallet:true,migrate:true}));const second=re.claim(r.id);return ack.ok&&paid===before+PA.reward(r).pc&&second.ok&&second.data.already&&re.W.pc()===paid});
}
for(const r of journeys){
 await check(r.id+' route sources are existing concrete tactics',()=>r.journey.groups.every(g=>g.length&&g.every(id=>byId[id]?.tactic)));
 for(let i=0;i<r.journey.groups.length;i++)await check(r.id+' lacks route group '+i,()=>{const a=pure(r);a.masteryState={got:Object.fromEntries(r.journey.groups.filter((_,j)=>i!==j).map(g=>[g[0],{t:1}]))};return !r.test({t:'over',win:true},a)});
 await check(r.id+' saved groups show bounded progress without inventing completion',()=>{const got=Object.fromEntries(r.journey.groups.slice(0,-1).map(g=>[g[0],{t:1}])),p=PA.progress(r,{got});return p.value===r.journey.groups.length-1&&p.target===r.journey.groups.length&&!p.done});
 await check(r.id+' last actual tactic and collection persist in the same end event',async()=>{const h=build(),last=byId[r.journey.groups.at(-1)[0]];for(const g of r.journey.groups.slice(0,-1))h.PA.unlock(g[0],'identity');await h.start();await feed(h,last.tactic);if(h.PA.load().got[r.id])return 'premature';h.ctx.game.over(true);const st=h.PA.load(),re=configure(ctx.make(h.store,{wallet:true,migrate:true}));return !!st.got[r.id]&&!!st.got[last.id]&&st.got[r.id].t===st.got[last.id].t&&!!re.PA.load().got[r.id]});
 await check(r.id+' saved collection claim is durable and paid once',()=>{const h=build();h.PA.unlock(r.id,'identity');const before=h.W.pc(),ack=h.claim(r.id),paid=h.W.pc();h.claim(r.id);const re=configure(ctx.make(h.store,{wallet:true,migrate:true}));const second=re.claim(r.id);return ack.ok&&paid===before+PA.reward(r).pc&&second.ok&&second.data.already&&re.W.pc()===paid});
}
await check('all 1438 old unlock and claimed records and progress retain exact payload on reload',()=>{const h=build(),st=h.PA.load();for(const r of old.RULES){st.got[r.id]={t:31,m:'identity',n:2};st.seen[r.id]=47;}st.chars={csh_taizong:17};st.progress={op_cards_total:456,op_damage_total:789};st.mastery={csh_taizong:{totals:{'c:sha':67},peaks:{'p:hand':12}}};if(!h.PA.save(st))return 'save rejected';const re=configure(ctx.make(h.store,{wallet:true,migrate:true}));return JSON.stringify(re.PA.load())===JSON.stringify(st)});
const result={scope:'Actual engine and source-defined adapters with synthetic events and isolated persistence; not natural matches',oldPool:1438,newTactics:13,newRoutes:2,pool:PA.RULES.length,passed:checks.filter(r=>r.passed).length,failed:checks.filter(r=>!r.passed).length,failures:checks.filter(r=>!r.passed),checks};if(opt('--out'))fs.writeFileSync(opt('--out'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,checks:undefined},null,2));if(result.failed)process.exitCode=1;
