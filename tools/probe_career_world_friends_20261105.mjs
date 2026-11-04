// Source transaction coverage for the 22 expanded ratio achievements. VM stores only.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {webcrypto} from 'node:crypto';import * as roster from '../core/csh_bossdata.js';import {root,parse,walk} from './lib/skill_audit.mjs';
const at=process.argv.indexOf('--out');if(at<0)throw Error('--out required');const out=path.resolve(process.argv[at+1]);fs.mkdirSync(out,{recursive:true});
function fixture(file){let src=fs.readFileSync(root+'/tools/'+file,'utf8').split('const checks=')[0].replace(/^import .*?;\r?\n/gm,'');src=src.replace(/const out='[^']*';fs.mkdirSync\(out,\{recursive:true\}\);/,'const out="unused";');const ctx=vm.createContext({fs,path,vm,webcrypto,root,parse,walk,console,...roster,roster,TextEncoder,TextDecoder,btoa,atob,process});vm.runInContext(src+'\nthis.makeFixture=make;',ctx);return ctx.makeFixture;}

const make=fixture('probe_career_gamble_unlocks.mjs'),checks=[],check=(name,x)=>checks.push({name,passed:!!x}),tick=async()=>{for(let i=0;i<16;i++)await Promise.resolve()},entry=(h,k)=>h.W.careerUnlocks()?.entries[k],base=1700000100000;
const defs=h=>h.ctx.window.CSH_ACHV.defs.filter(d=>/^(tablefriends|oldfriend|revengefriend|balancedfriend)_\d+$/.test(d.key));
const history=(hands=0,wins=0,losses=0,revenge=false)=>({hands,wins,losses,draws:hands-wins-losses,revenge,skillTop:0});
function seed(edit=()=>{}){const h=make(),raw=h.G.raw();raw.ai.forEach(a=>{a.hands=100000;a.wins=100000;a.withPlayer=history()});edit(raw);delete raw.careerUnlocks;h.data.set('csh_world',JSON.stringify(raw));return make({data:h.data});}
function result(h,i=0,n=1,kind='play',won){const op={id:h.G.raw().ai[i].id,kind};if(kind==='result')op.won=won;return {id:'world-friend-result-'+String(n).padStart(5,'0'),t:base+n,ops:[op]};}
{
 const h=seed(),k='tablefriends_1',t=result(h);check('AI-only match history never counts as player acquaintance',defs(h).every(d=>!entry(h,d.key)));const before=h.writes.length;h.G.commitTableResult(t);await tick();const saved=h.writes.slice(before).filter(x=>x.k==='csh_world').map(x=>JSON.parse(x.v)).find(x=>x.tableReceipts?.some(r=>r.id===t.id));check('new acquaintance and source hand share accepted world checkpoint',saved?.careerUnlocks?.entries[k]?.observedAt===t.t&&saved.careerUnlocks.entries.hands_1?.observedAt===t.t&&entry(h,k)?.observedAt===t.t);h.G.commitTableResult(t);await tick();check('duplicate table receipt notifies and counts acquaintance once',h.G.stats().playerOpponents===1&&h.feedback.flatMap(x=>x.rows).filter(r=>r.id===k).length===1);
 const reboot=make({data:h.data});await tick();check('restart preserves acquaintance date quietly',entry(reboot,k)?.observedAt===t.t&&reboot.feedback.length===0);const pc=h.W.pc(),reward=h.ctx.window.CSH_ACHV.byId(k).reward,a=h.W.claimCareer(k,reward,'friend achievement'),b=h.W.claimCareer(k,reward,'friend duplicate');check('manual reward remains once-only',entry(h,k)?.observedAt===t.t&&a.ok&&b.already&&h.W.pc()===pc+reward);
 const code=await h.M.export(),ex=await h.M.inspect(code);check('export retains source and permanent friend date',ex.ok&&ex.data.world.careerUnlocks?.entries[k]?.observedAt===t.t&&ex.data.wallet.careerUnlocks.entries[k]?.observedAt===t.t);const imported=make(),r=await imported.M.import(code);await tick();check('import retains friend date and paid receipt',r.ok&&entry(imported,k)?.observedAt===t.t&&imported.W.claimCareer(k,reward,'after import').already);
}
{
 const h=seed();h.G.commitTableResult(result(h,0,1,'result',false));h.G.commitTableResult(result(h,0,2,'result',true));await tick();check('win then loss qualifies balanced record without inventing revenge',entry(h,'balancedfriend_1')?.observedAt===base+2&&!entry(h,'revengefriend_1'));h.G.commitTableResult(result(h,0,3,'result',false));await tick();check('later actual win after loss records reversal at third result',entry(h,'revengefriend_1')?.observedAt===base+3&&h.G.stats().playerRevenge===1);
}
{
 const h=seed(),t=result(h),old=h.data.get('csh_world');h.fault.key='csh_world';const q=h.bank.queueTableResult(t);await tick();check('source refusal retains queued intent without friend qualification',q.ok&&q.worldPending&&h.data.get('csh_world')===old&&!entry(h,'tablefriends_1'));h.fault.key=null;h.bank.flushTableResults();await tick();check('outbox retry records original friend date once',entry(h,'tablefriends_1')?.observedAt===t.t&&h.bank.tableResultStatus().count===0&&h.feedback.flatMap(x=>x.rows).filter(r=>r.id==='tablefriends_1').length===1);
}
{
 const h=seed(),t=result(h);h.fault.key='csh_wallet';h.G.commitTableResult(t);await tick();const saved=JSON.parse(h.data.get('csh_world'));check('source-only acceptance retains friend proof without early feedback',saved.careerUnlocks?.entries.tablefriends_1?.observedAt===t.t&&!entry(h,'tablefriends_1'));const reboot=make({data:h.data});await tick();check('source-only restart recovers exact friend date silently',entry(reboot,'tablefriends_1')?.observedAt===t.t&&reboot.feedback.length===0);
}
{
 const h=seed();h.fault.key='csh_world';h.G.settlePlay(h.G.raw().ai[0].id,false);h.O.adopted();h.O.start();await tick();const s=h.lib.cshShell.stats({readOnly:true});check('failed soft save exposes no friend progress or qualification',s.playerOpponents===0&&s.playerFamiliar===0&&!entry(h,'tablefriends_1'));h.fault.key=null;
}
const sample=make();check('28 actual acquaintance, familiar, reversal and balanced milestones found',defs(sample).length===28);
for(const d of defs(sample)){
 const goal=d.prog({})[1],family=d.key.split('_')[0];let index=0;
 const h=seed(raw=>{if(family==='tablefriends'){for(let i=0;i<goal-1;i++)raw.ai[i].withPlayer=history(1);index=goal-1}else if(family==='oldfriend')raw.ai[0].withPlayer=history(goal-1);else if(family==='revengefriend'){for(let i=0;i<goal-1;i++)raw.ai[i].withPlayer=history(2,1,1,true);index=goal-1;raw.ai[index].withPlayer=history(1,0,1)}else raw.ai[0].withPlayer=history(goal*2-1,goal-1,goal)});
 const t=result(h,index,1,family==='revengefriend'||family==='balancedfriend'?'result':'play',false);h.G.commitTableResult(t);await tick();check('actual strict table crossing persists '+d.key,entry(h,d.key)?.observedAt===t.t);
}
{
 const h=seed(raw=>raw.ai.forEach(a=>a.withPlayer=history(300,150,150,true)));await tick();check('legacy saved friends qualify quietly with unknown first dates',defs(h).every(d=>entry(h,d.key)?.observedAt===0)&&h.feedback.length===0);
 const id=h.G.raw().ai[0].id,hands=h.G.stats().playerHands,t={id:'world-friend-retire-0001',t:base+1,ops:[{id,kind:'lose',amount:h.G.byId(id).fund}]};h.G.commitTableResult(t);await tick();check('retired friend remains in saved acquaintance and familiar history',h.G.byId(id).retired&&h.G.worldCareerSaved?.().playerOpponents===150&&h.G.stats().playerHands===hands+1&&entry(h,'oldfriend_300')?.observedAt===0);
}
for(const mode of ['connectMode','video']){const h=seed();h.ctx._status[mode]=true;h.G.commitTableResult(result(h));await tick();check('restricted mode creates no friend qualification '+mode,!entry(h,'tablefriends_1'));}

{
 const h=seed(raw=>raw.ai[0].withPlayer=history(2,1,1,false));await tick();check('old mixed win-loss totals never fabricate a loss-before-win flag',h.G.worldCareerSaved().playerRevenge===0&&!entry(h,'revengefriend_1')&&entry(h,'balancedfriend_1')?.observedAt===0);
}
{
 const h=seed(raw=>{raw.ai[0].withPlayer=history(2,2,0);raw.ai[1].withPlayer=history(2,0,2)});await tick();const saved=h.G.worldCareerSaved();check('different opponents cannot be merged into one familiar or balanced rival',saved.playerOpponents===2&&saved.playerFamiliar===2&&saved.playerBalanced===0&&!entry(h,'oldfriend_3')&&!entry(h,'balancedfriend_1'));
}
{
 const h=seed(),raw=h.G.raw(),cases=[];for(const p of [history(1,1,1),{...history(2,1,1),wins:0.5},{...history(2,1,1),revenge:'true'},history(1,1,0,true)]){const x=JSON.parse(JSON.stringify(raw));x.ai[0].withPlayer=p;cases.push(x)}check('invalid outcome counts and unproven reversal flags are refused',cases.every(x=>{try{h.G.worldCareerSnapshot(x);return false}catch{return true}}));
}
const failures=checks.filter(x=>!x.passed),r={scope:'Real world/wallet/observer/migration and controlled saved histories, not natural long-term play.',passed:checks.length-failures.length,failed:failures.length,checks};fs.writeFileSync(out+'/results.json',JSON.stringify(r,null,2));console.log(JSON.stringify({...r,checks:failures}));process.exitCode=failures.length?1:0;
