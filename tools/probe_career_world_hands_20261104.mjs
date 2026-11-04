// Source transaction coverage for the 22 expanded ratio achievements. VM stores only.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {webcrypto} from 'node:crypto';import * as roster from '../core/csh_bossdata.js';import {root,parse,walk} from './lib/skill_audit.mjs';
const at=process.argv.indexOf('--out');if(at<0)throw Error('--out required');const out=path.resolve(process.argv[at+1]);fs.mkdirSync(out,{recursive:true});
function fixture(file){let src=fs.readFileSync(root+'/tools/'+file,'utf8').split('const checks=')[0].replace(/^import .*?;\r?\n/gm,'');src=src.replace(/const out='[^']*';fs.mkdirSync\(out,\{recursive:true\}\);/,'const out="unused";');const ctx=vm.createContext({fs,path,vm,webcrypto,root,parse,walk,console,...roster,roster,TextEncoder,TextDecoder,btoa,atob,process});vm.runInContext(src+'\nthis.makeFixture=make;',ctx);return ctx.makeFixture;}

const make=fixture('probe_career_gamble_unlocks.mjs'),checks=[],check=(name,x)=>checks.push({name,passed:!!x}),tick=async()=>{for(let i=0;i<16;i++)await Promise.resolve()},entry=(h,k)=>h.W.careerUnlocks()?.entries[k],stamp=1700000000123,key='hands_1';
const defs=h=>h.ctx.window.CSH_ACHV.defs.filter(d=>/^(hands|cx_hands)_\d+$/.test(d.key));const table=(h,n=1,extra={})=>({id:'world-hands-result-'+String(n).padStart(5,'0'),t:stamp+n,ops:[{id:h.G.list()[0].id,kind:'play'}],...extra});
function seed(n=0){const h=make(),raw=h.G.raw();raw.ai[0].withPlayer={hands:n,wins:0,losses:0,draws:n,skillTop:0};raw.ai.forEach(a=>{a.hands=100000;a.wins=100000});delete raw.careerUnlocks;h.data.set('csh_world',JSON.stringify(raw));return make({data:h.data});}
{
 const h=seed(),pc=h.W.pc(),t=table(h),offset=h.writes.length;check('world AI-only history does not qualify player hands',!entry(h,key));const r=h.G.commitTableResult(t);await tick();const saved=h.writes.slice(offset).filter(x=>x.k==='csh_world').map(x=>JSON.parse(x.v)).find(x=>x.tableReceipts?.some(r=>r.id===t.id));check('first personal world hand and qualification share strict source write',r.ok&&saved?.careerUnlocks?.entries[key]?.observedAt===t.t&&entry(h,key)?.observedAt===t.t);check('one qualification feedback after save with no automatic money',h.W.pc()===pc&&h.feedback.flatMap(x=>x.rows).filter(x=>x.id===key).length===1);
 h.G.commitTableResult(t);await tick();check('duplicate table result counts and notifies only once',h.G.stats().playerHands===1&&h.feedback.flatMap(x=>x.rows).filter(x=>x.id===key).length===1);
 const reboot=make({data:h.data});await tick();check('cold restart retains original source date quietly',entry(reboot,key)?.observedAt===t.t&&reboot.feedback.length===0);
 const reward=h.ctx.window.CSH_ACHV.byId(key).reward,a=h.W.claimCareer(key,reward,'world hands'),b=h.W.claimCareer(key,reward,'duplicate world hands');check('manual world achievement claim pays once',entry(h,key)?.observedAt===t.t&&a.ok&&b.already&&h.W.pc()===pc+reward);
 const code=await h.M.export(),ex=await h.M.inspect(code);check('export preserves source and permanent exact dates',ex.ok&&ex.data.world.careerUnlocks?.entries[key]?.observedAt===t.t&&ex.data.wallet.careerUnlocks?.entries[key]?.observedAt===t.t);const imported=make(),im=await imported.M.import(code);await tick();check('import preserves world qualification and paid receipt',im.ok&&entry(imported,key)?.observedAt===t.t&&imported.W.claimCareer(key,reward,'after import').already);
}
{
 const h=seed(),before=h.data.get('csh_world'),t=table(h);h.fault.key='csh_world';const r=h.G.commitTableResult(t);await tick();check('source refusal rolls back world count and creates no eligibility',!r.ok&&h.data.get('csh_world')===before&&h.G.stats().playerHands===0&&!entry(h,key)&&!h.feedback.flatMap(x=>x.rows).some(r=>r.id===key));h.fault.key=null;const retry=h.G.commitTableResult(t);await tick();check('same table result retry preserves original source time',retry.ok&&entry(h,key)?.observedAt===t.t);
}
{
 const h=seed(),t=table(h);h.fault.key='csh_wallet';h.G.commitTableResult(t);await tick();const source=JSON.parse(h.data.get('csh_world'));check('source accepted but aggregate refused retains exact qualification without feedback',source.careerUnlocks?.entries[key]?.observedAt===t.t&&!entry(h,key)&&!h.feedback.flatMap(x=>x.rows).some(r=>r.id===key));const reboot=make({data:h.data});await tick();check('source-only reboot recovers original world date silently',entry(reboot,key)?.observedAt===t.t&&reboot.feedback.length===0);
}
{
 const h=seed(),t=table(h,1,{gambleProfit:100000});h.G.commitTableResult(t);await tick();const saved=JSON.parse(h.data.get('csh_world'));check('combined table/gamble transaction keeps both source qualification families',saved.careerUnlocks?.entries[key]?.observedAt===t.t&&saved.careerUnlocks?.entries.gmplay_1?.observedAt===t.t&&entry(h,key)?.observedAt===t.t&&entry(h,'gmplay_1')?.observedAt===t.t);
}
{
 const h=seed(),id=h.G.list()[0].id,a=h.G.byId(id),t=table(h,1,{ops:[{id,kind:'lose',amount:a.fund}]});h.G.commitTableResult(t);await tick();check('retired opponent keeps its true personal history and original qualification',h.G.byId(id).retired&&h.G.stats().playerHands===1&&entry(h,key)?.observedAt===t.t);
}
{
 const h=seed();h.fault.key='csh_world';h.G.settlePlay(h.G.list()[0].id,false);await tick();h.O.adopted();h.O.start();await tick();check('failed soft save cannot seed historical qualification from live memory',h.G.stats().playerHands===1&&h.lib.cshShell.stats({readOnly:true}).worldHands===0&&!entry(h,key));h.fault.key=null;
}
{
 const h=seed();check('durable world reader is available',typeof h.G.worldCareerSaved==='function');if(h.G.worldCareerSaved){const old=h.ctx.localStorage.getItem;h.ctx.localStorage.getItem=k=>{if(k==='csh_world')throw Error('world read failed');return old(k)};let refused=false;try{h.G.worldCareerSaved()}catch{refused=true}check('durable world read failure remains explicit',refused);h.ctx.localStorage.getItem=old;}
}
const sample=make();check('33 actual old and expanded hand milestones discovered',defs(sample).length===33);
for(const d of defs(sample)){const goal=d.prog({})[1],h=seed(goal-1),t=table(h);h.G.commitTableResult(t);await tick();check('actual strict table crossing persists '+d.key,entry(h,d.key)?.observedAt===t.t);}
{
 const h=seed(2000000);await tick();check('old saved personal history qualifies all milestones quietly with unknown dates',defs(h).every(d=>entry(h,d.key)?.observedAt===0)&&h.feedback.length===0);
}
for(const mode of ['connectMode','video']){const h=seed();h.ctx._status[mode]=true;h.G.commitTableResult(table(h));await tick();check('restricted mode creates no new hands qualification '+mode,!entry(h,key));}

{
 const h=seed(),raw=h.G.raw(),bad=[];const negative=JSON.parse(JSON.stringify(raw));negative.ai[0].withPlayer.hands=-1;bad.push(negative);const fractional=JSON.parse(JSON.stringify(raw));fractional.ai[0].withPlayer.hands=1.5;bad.push(fractional);const duplicate=JSON.parse(JSON.stringify(raw));duplicate.ai.push(duplicate.ai[0]);bad.push(duplicate);const foreign=JSON.parse(JSON.stringify(raw));foreign.ai[0].id='not-a-real-world-character';bad.push(foreign);
 check('malformed, duplicate and unknown actor histories are refused',typeof h.G.worldCareerSnapshot==='function'&&bad.every(x=>{try{h.G.worldCareerSnapshot(x);return false}catch{return true}}));
 for(const rawValue of ['','{broken']){h.data.set('csh_world',rawValue);let refused=false;try{h.G.worldCareerSaved()}catch{refused=true}const r=h.G.commitTableResult(table(h));const stats=h.lib.cshShell.stats({readOnly:true});check('corrupt durable source blocks table commit without overwrite '+JSON.stringify(rawValue),refused&&!r.ok&&h.data.get('csh_world')===rawValue&&stats.careerStatsReliable===false&&!entry(h,key));}
}

{
 const h=seed(),t=table(h);h.fault.key='csh_world';const q=h.bank.queueTableResult(t);await tick();check('wallet-owned outbox keeps refused world intent without qualification',q.ok&&q.worldPending&&h.bank.tableResultStatus().count===1&&!entry(h,key));h.fault.key=null;h.bank.flushTableResults();await tick();check('actual wallet outbox retry accepts source once with original time',h.bank.tableResultStatus().count===0&&h.G.stats().playerHands===1&&entry(h,key)?.observedAt===t.t&&h.feedback.flatMap(x=>x.rows).filter(r=>r.id===key).length===1);h.bank.queueTableResult(t);h.bank.flushTableResults();await tick();check('wallet intent replay cannot duplicate hand qualification',h.G.stats().playerHands===1&&h.feedback.flatMap(x=>x.rows).filter(r=>r.id===key).length===1);
}
const failures=checks.filter(x=>!x.passed),result={scope:'Actual world/table/wallet/migration with isolated accepted table inputs, faults and controlled milestone histories; not natural long-term play.',passed:checks.length-failures.length,failed:failures.length,checks};fs.writeFileSync(out+'/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,checks:failures}));process.exitCode=failures.length?1:0;
