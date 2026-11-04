// Source transaction coverage for the 22 expanded ratio achievements. VM stores only.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {webcrypto} from 'node:crypto';import * as roster from '../core/csh_bossdata.js';import {root,parse,walk} from './lib/skill_audit.mjs';
const at=process.argv.indexOf('--out');if(at<0)throw Error('--out required');const out=path.resolve(process.argv[at+1]);fs.mkdirSync(out,{recursive:true});
function fixture(file){let src=fs.readFileSync(root+'/tools/'+file,'utf8').split('const checks=')[0].replace(/^import .*?;\r?\n/gm,'');src=src.replace(/const out='[^']*';fs.mkdirSync\(out,\{recursive:true\}\);/,'const out="unused";');const ctx=vm.createContext({fs,path,vm,webcrypto,root,parse,walk,console,...roster,roster,TextEncoder,TextDecoder,btoa,atob,process});vm.runInContext(src+'\nthis.makeFixture=make;',ctx);return ctx.makeFixture;}

const make=fixture('probe_career_gamble_unlocks.mjs'),checks=[],check=(name,x)=>checks.push({name,passed:!!x}),tick=async()=>{for(let i=0;i<16;i++)await Promise.resolve()},entry=(h,k)=>h.W.careerUnlocks()?.entries[k],stamp=1700000300000;
const defs=make().ctx.window.CSH_ACHV.defs.filter(d=>/^poorai_\d+$/.test(d.key));check('eight existing player-fund milestones found',defs.length===8);
function seed(fund=11,history=null){const h=make(),raw=h.G.raw();raw.ai.forEach(a=>a.withPlayer={hands:0,wins:0,losses:0,draws:0,skillTop:0,revenge:false,lowestFund:null});raw.ai[0].fund=fund;if(history)raw.ai[0].withPlayer=history;delete raw.careerUnlocks;h.data.set('csh_world',JSON.stringify(raw));return make({data:h.data});}
function result(h,n=1,kind='lose',amount=1){const op={id:h.G.raw().ai[0].id,kind};if(kind==='lose'||kind==='win')op.amount=amount;if(kind==='result')op.won=false;return {id:'world-fund-result-'+String(n).padStart(5,'0'),t:stamp+n,ops:[op]};}
for(const d of defs){const goal=Number(d.key.split('_')[1]),h=seed(goal+1),t=result(h);h.G.commitTableResult(t);await tick();const disk=JSON.parse(h.data.get('csh_world'));check('actual loss checkpoints '+d.key,disk.careerUnlocks?.entries[d.key]?.observedAt===t.t&&entry(h,d.key)?.observedAt===t.t);}
{
 const h=seed(0);check('poor AI without player encounter is never a fund witness',!entry(h,'poorai_10'));h.G.commitTableResult(result(h,1,'result'));await tick();check('noncash player win alone is not a fund-reduction witness',!entry(h,'poorai_10')&&h.lib.cshShell.stats({readOnly:true}).playerFundWitness===0);h.G.commitTableResult(result(h,2,'lose',0));await tick();check('zero loss creates no reduction witness',!entry(h,'poorai_10'));
}
{
 const h=seed(),t=result(h),pc=h.W.pc();h.G.commitTableResult(t);await tick();check('real threshold saves qualification without automatic achievement reward',entry(h,'poorai_10')?.observedAt===t.t&&h.W.pc()===pc);h.G.commitTableResult(result(h,2,'win',100000));await tick();check('fund rebound and retirement preserve minimum witness and original date',entry(h,'poorai_10')?.observedAt===t.t&&h.G.worldCareerSaved?.().playerFundMin===10);const reboot=make({data:h.data});await tick();check('restart retains fund observation date quietly',entry(reboot,'poorai_10')?.observedAt===t.t&&reboot.feedback.length===0);
 const k='poorai_10',reward=h.ctx.window.CSH_ACHV.byId(k).reward,a=h.W.claimCareer(k,reward,'fund observation'),b=h.W.claimCareer(k,reward,'repeat fund observation');check('retained fund qualification can be claimed once',entry(h,k)?.observedAt===t.t&&a.ok&&b.already);const code=await h.M.export(),other=make(),r=await other.M.import(code);await tick();check('import retains fund witness and paid receipt',r.ok&&entry(other,k)?.observedAt===t.t&&other.W.claimCareer(k,reward,'after import').already);
}
{
 const h=seed(),t=result(h),before=h.data.get('csh_world');h.fault.key='csh_world';h.bank.queueTableResult(t);await tick();check('world refusal creates no fund qualification',h.data.get('csh_world')===before&&!entry(h,'poorai_10'));h.fault.key=null;h.bank.flushTableResults();await tick();check('outbox recovery retains source time',entry(h,'poorai_10')?.observedAt===t.t);h.bank.queueTableResult(t);await tick();check('duplicate receipt does not repeat feedback',h.feedback.flatMap(x=>x.rows).filter(r=>r.id==='poorai_10').length===1);
}
{
 const h=seed(),t=result(h);h.fault.key='csh_wallet';h.G.commitTableResult(t);await tick();const reboot=make({data:h.data});await tick();check('source-only restart preserves exact date',entry(reboot,'poorai_10')?.observedAt===t.t&&reboot.feedback.length===0);
}
{
 const h=seed();h.fault.key='csh_world';h.G.settleLose(h.G.raw().ai[0].id,1);h.O.adopted();h.O.start();await tick();const s=h.lib.cshShell.stats({readOnly:true});check('failed soft save cannot expose fund witness',s.playerFundWitness===0&&!entry(h,'poorai_10'));
}
{
 const h=seed(0,{hands:1,wins:1,losses:0,draws:0,skillTop:0,revenge:false,lowestFund:0});await tick();check('real zero minimum is valid legacy evidence with unknown first date',defs.every(d=>entry(h,d.key)?.observedAt===0)&&h.feedback.length===0);
}

{
 const h=seed(),raw=h.G.raw();check('invalid minimum funds and unsupported witnesses are refused',[-1,0.5,'0',h.G.const.AI_FUND_CAP+1].every(value=>{const x=JSON.parse(JSON.stringify(raw));x.ai[0].withPlayer={hands:1,wins:1,losses:0,skillTop:0,lowestFund:value};try{h.G.worldCareerSnapshot(x);return false}catch{return true}}));const x=JSON.parse(JSON.stringify(raw));x.ai[0].withPlayer={hands:1,wins:0,losses:1,skillTop:0,lowestFund:0};let refused=false;try{h.G.worldCareerSnapshot(x)}catch{refused=true}check('zero minimum without player win evidence is refused',refused);
}
for(const mode of ['connectMode','video']){const h=seed();h.ctx._status[mode]=true;h.G.commitTableResult(result(h));await tick();check('restricted mode does not qualify fund observation '+mode,!entry(h,'poorai_10'));}

{
 const h=seed(0);h.G.commitTableResult(result(h,1,'lose',1));await tick();check('positive nominal loss from already-zero funds is not an actual reduction witness',h.lib.cshShell.stats({readOnly:true}).playerFundWitness===0&&!entry(h,'poorai_10'));
}
const failures=checks.filter(x=>!x.passed),r={passed:checks.length-failures.length,failed:failures.length,checks};fs.writeFileSync(out+'/results.json',JSON.stringify(r,null,2));console.log(JSON.stringify({...r,checks:failures}));process.exitCode=failures.length?1:0;
