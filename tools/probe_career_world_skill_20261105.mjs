// Source transaction coverage for the 22 expanded ratio achievements. VM stores only.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {webcrypto} from 'node:crypto';import * as roster from '../core/csh_bossdata.js';import {root,parse,walk} from './lib/skill_audit.mjs';
const at=process.argv.indexOf('--out');if(at<0)throw Error('--out required');const out=path.resolve(process.argv[at+1]);fs.mkdirSync(out,{recursive:true});
function fixture(file){let src=fs.readFileSync(root+'/tools/'+file,'utf8').split('const checks=')[0].replace(/^import .*?;\r?\n/gm,'');src=src.replace(/const out='[^']*';fs.mkdirSync\(out,\{recursive:true\}\);/,'const out="unused";');const ctx=vm.createContext({fs,path,vm,webcrypto,root,parse,walk,console,...roster,roster,TextEncoder,TextDecoder,btoa,atob,process});vm.runInContext(src+'\nthis.makeFixture=make;',ctx);return ctx.makeFixture;}

const make=fixture('probe_career_gamble_unlocks.mjs'),checks=[],check=(name,x)=>checks.push({name,passed:!!x}),tick=async()=>{for(let i=0;i<16;i++)await Promise.resolve()},entry=(h,k)=>h.W.careerUnlocks()?.entries[k],stamp=1700000200000;
const defs=make().ctx.window.CSH_ACHV.defs.filter(d=>d.key.startsWith('skilltop_'));check('eight existing skill milestones discovered',defs.length===8);
function seed(){const h=make(),raw=h.G.raw();raw.ai.forEach(a=>a.withPlayer={hands:0,wins:0,losses:0,draws:0,skillTop:0,revenge:false});delete raw.careerUnlocks;h.data.set('csh_world',JSON.stringify(raw));return make({data:h.data});}
function setup(h,skill){const raw=h.G.raw(),a=raw.ai.find(a=>h.G.skillOf(h.G.const.AI_FUND_CAP,'reader',a.id)>=skill);if(!a)throw Error('No native skill witness for '+skill);a.fund=h.G.const.AI_FUND_CAP;a.persona='reader';if(!h.G.reloadSave(raw))throw Error('Invalid native witness');return {id:'world-skill-result-00001',t:stamp,ops:[{id:a.id,kind:'play'}]};}
for(const d of defs){const h=seed(),pc=h.W.pc(),goal=d.prog({})[1],t=setup(h,goal);h.G.commitTableResult(t);await tick();const saved=JSON.parse(h.data.get('csh_world'));check('accepted table persists '+d.key,saved.careerUnlocks?.entries[d.key]?.observedAt===stamp&&entry(h,d.key)?.observedAt===stamp&&h.W.pc()===pc);}
{
 const h=seed(),t=setup(h,1);h.fault.key='csh_world';h.bank.queueTableResult(t);await tick();check('source refusal does not qualify skill',!entry(h,'skilltop_1'));h.fault.key=null;h.bank.flushTableResults();await tick();check('outbox retry records original skill date',entry(h,'skilltop_1')?.observedAt===stamp);h.bank.queueTableResult(t);await tick();check('repeat result notifies once',h.feedback.flatMap(x=>x.rows).filter(r=>r.id==='skilltop_1').length===1);
 const reboot=make({data:h.data});await tick();check('restart keeps all dates quietly',defs.every(d=>entry(reboot,d.key)?.observedAt===stamp)&&reboot.feedback.length===0);
 const key='skilltop_0.7',reward=h.ctx.window.CSH_ACHV.byId(key).reward,pc=h.W.pc(),a=h.W.claimCareer(key,reward,'skill reward'),b=h.W.claimCareer(key,reward,'repeat skill');check('decimal ID reward remains manual and once-only',entry(h,key)?.observedAt===stamp&&a.ok&&b.already&&h.W.pc()===pc+reward);const code=await h.M.export(),other=make(),r=await other.M.import(code);await tick();check('import retains skill history and paid decimal receipt',r.ok&&entry(other,key)?.observedAt===stamp&&other.W.claimCareer(key,reward,'after import').already);
}
{
 const h=seed(),t=setup(h,1);h.fault.key='csh_wallet';h.G.commitTableResult(t);await tick();const reboot=make({data:h.data});await tick();check('source-only restart restores exact skill date',entry(reboot,'skilltop_1')?.observedAt===stamp&&reboot.feedback.length===0);
}
{
 const h=seed();setup(h,1);h.fault.key='csh_world';h.G.settlePlay(h.G.raw().ai[0].id,false);h.O.adopted();h.O.start();await tick();check('failed soft save cannot expose skill progress',h.lib.cshShell.stats({readOnly:true}).worldSkillTop===0&&!entry(h,'skilltop_1'));
}
{
 const h=seed(),raw=h.G.raw();raw.ai[0].withPlayer={hands:0,wins:0,losses:0,skillTop:1};h.data.set('csh_world',JSON.stringify(raw));const reboot=make({data:h.data});await tick();check('no actual hands means no skill witness',!entry(reboot,'skilltop_1'));raw.ai[0].withPlayer.hands=1;raw.ai[0].retired=true;h.data.set('csh_world',JSON.stringify(raw));const old=make({data:h.data});await tick();check('retired legacy witness qualifies with unknown dates',defs.every(d=>entry(old,d.key)?.observedAt===0)&&old.feedback.length===0);
}

{
 const h=seed();setup(h,1);check('high native AI skill without shared game is not a personal witness',h.lib.cshShell.stats({readOnly:true}).worldSkillTop===0&&defs.every(d=>!entry(h,d.key)));const raw=h.G.raw();check('invalid saved witnessed skill is refused',[-1,1.1,'1',NaN].every(value=>{const x=JSON.parse(JSON.stringify(raw));x.ai[0].withPlayer.skillTop=value;try{h.G.worldCareerSnapshot(x);return false}catch{return true}}));
}
for(const mode of ['connectMode','video']){const h=seed(),t=setup(h,1);h.ctx._status[mode]=true;h.G.commitTableResult(t);await tick();check('restricted mode does not collect skill '+mode,!entry(h,'skilltop_1'));}
const failures=checks.filter(x=>!x.passed),r={passed:checks.length-failures.length,failed:failures.length,checks};fs.writeFileSync(out+'/results.json',JSON.stringify(r,null,2));console.log(JSON.stringify({...r,checks:failures}));process.exitCode=failures.length?1:0;
