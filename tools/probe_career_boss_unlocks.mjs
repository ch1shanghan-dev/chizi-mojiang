// Real BOSS transactions + real career/wallet/migration modules; disposable VM stores only.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {webcrypto} from 'node:crypto';import * as roster from '../core/csh_bossdata.js';import {root,parse,walk} from './lib/skill_audit.mjs';
const at=process.argv.indexOf('--out');if(at<0)throw Error('External --out required');const out=path.resolve(process.argv[at+1]);
const prefix=fs.readFileSync(root+'/tools/probe_boss_transactions.mjs','utf8').split('const rows=[];')[0].replace(/^import .*?;\r?\n/gm,'');const outer=vm.createContext({fs,path,vm,webcrypto,root,console,...roster,roster,TextEncoder,TextDecoder,btoa,atob});vm.runInContext(prefix+'\nthis.makeBoss=harness;',outer);
const clean=s=>s.replace(/^import [\s\S]*?;\r?\n/gm,'').replace(/\bexport /g,'');const read=p=>fs.readFileSync(root+'/core/csh_'+p+'.js','utf8');let build;walk(parse(read('shell')),n=>{if(n.type==='FunctionDeclaration'&&n.id.name==='buildStats')build=read('shell').slice(...n.range).replace('function buildStats','function realBossBuildStats')});
function make(options={}){const h=outer.makeBoss(options);vm.runInContext(clean(read('achv')),h.ctx);h.ctx.wallet=()=>h.lib.cshWallet;h.ctx.projectBossCareer=h.ctx.careerSnapshot;vm.runInContext(build,h.ctx);
 h.lib.cshWorld={list:()=>[],stats:()=>({}),gambleStats:()=>({}),reloadSave:()=>true};h.lib.cshInteract={stats:()=>({playerThrows:0})};h.lib.cshShell={stats:o=>h.ctx.realBossBuildStats(o)};h.feedback=[];h.lib.cshUI={achievement:(rows,options)=>h.feedback.push({rows,options})};
 vm.runInContext(clean(read('career_observer')),h.ctx);h.O=h.lib.cshCareerObserver;h.bank=h.lib.cshWallet;if(options.start!==false)h.O.start();return h;}
const checks=[],check=(name,passed,detail)=>checks.push({name,passed:!!passed,...(!passed?{detail}:{})}),tick=async()=>{await Promise.resolve();await Promise.resolve()},entry=(h,k)=>h.W.careerUnlocks()?.entries[k];
const elite=roster.allBossIds().find(id=>roster.tierOf('csh_'+id.slice(9))==='elite');
{
 const h=make(),before=h.W.pc(),w=h.writes.length,event={};const r=h.A.record(elite,{round:4,event});await tick();
 const saved=h.writes.slice(w).filter(x=>x.k==='csh_wallet').map(x=>JSON.parse(x.v)).find(x=>x.bossSaved?.bossKill?.map?.[elite]?.n===1);
 check('real accepted kill and speed qualification share the first BOSS record/reward wallet write',r&&saved?.careerUnlocks.entries.bosskill_1?.observedAt>0&&saved.careerUnlocks.entries.boss_speed_elite?.observedAt>0&&saved.pc===before+r.cby);
 check('new kill uses original reward only, never auto-pays career rewards',r&&h.W.pc()===before+r.cby&&!h.disk().careerClaims?.bosskill_1);
 const stamp=entry(h,'bosskill_1').observedAt,pc=h.W.pc();h.A.record(elite,{round:4,event});await tick();check('same boss death callback neither repays nor repeats unlock feedback',h.W.pc()===pc&&entry(h,'bosskill_1').observedAt===stamp&&h.feedback.flatMap(x=>x.rows).filter(x=>x.id==='bosskill_1').length===1);
 const again=make({data:h.data});check('whole module reload preserves exact BOSS qualification with no replay',entry(again,'bosskill_1')?.observedAt===stamp&&again.feedback.length===0&&again.W.pc()===pc);
 const exported=await h.M.inspect(await h.M.export());check('actual portable export preserves BOSS eligibility and exact date',exported.ok&&exported.data.wallet.careerUnlocks.entries.bosskill_1.observedAt===stamp);
}
{
 const h=make(),pc=h.W.pc();h.fault.key='csh_wallet';const result=h.A.record(elite,{round:4,event:{}});await tick();check('failed real record writes neither BOSS progress nor qualification nor money',!result&&!entry(h,'bosskill_1')&&!h.A.read().map[elite]&&h.W.pc()===pc&&h.feedback.length===0);
 h.fault.key=null;h.A.retryRewards();await tick();const after=h.W.pc(),stamp=entry(h,'bosskill_1')?.observedAt;h.A.retryRewards();check('real reward queue retry commits accepted qualification and money once',stamp>0&&after>pc&&h.W.pc()===after&&h.A.read().map[elite].n===1);
}
{
 const h=make();h.game.saveConfig=()=>{throw Error('fixture host mirror rejected')};const r=h.A.record(elite,{round:4,event:{}});await tick();check('host config mirror failure cannot replace the accepted candidate snapshot',r&&entry(h,'bosskill_1')?.observedAt>0&&h.disk().bossSaved.bossKill.map[elite].n===1);
}
{
 const h=make(),pc=h.W.pc(),offset=h.writes.length;h.A.recordAsBoss(true);await tick();const saved=h.writes.slice(offset).filter(x=>x.k==='csh_wallet').map(x=>JSON.parse(x.v)).find(x=>x.bossSaved?.bossAsBoss?.win===1);
 check('no-money as-BOSS win records qualification in its actual record write',saved?.careerUnlocks.entries.boss_asboss_1?.observedAt>0&&h.W.pc()===pc);
}
{
 const h=make({start:false}),pc=h.W.pc();h.A.recordAsBoss(true);await tick();check('accepted no-money win before readiness receives a live date, not silent historical zero',entry(h,'boss_asboss_1')?.observedAt>0&&h.W.pc()===pc&&h.feedback.flatMap(x=>x.rows).some(x=>x.id==='boss_asboss_1'));
}
{
 const h=make({start:false});h.lib.cshWorld.stats=()=>{throw Error('fixture missing world')};h.A.recordAsBoss(true);await tick();let rejected=false;try{await h.M.export()}catch{rejected=true}check('unready full snapshot refuses export instead of losing accepted no-money qualification',rejected&&!entry(h,'boss_asboss_1'));
 h.lib.cshWorld.stats=()=>({});h.O.start();await tick();check('source recovery retains the accepted no-money event as newly observed',entry(h,'boss_asboss_1')?.observedAt>0);
}
{
 const config={'extension_池子魔将_bossKill':{map:{[elite]:{n:2,best:4}}},'extension_池子魔将_bossAsBoss':{win:1,lose:0}},h=make({config});await tick();check('legacy BOSS and as-BOSS records initialize silently with unknown dates',entry(h,'bosskill_1')?.observedAt===0&&entry(h,'boss_speed_elite')?.observedAt===0&&entry(h,'boss_asboss_1')?.observedAt===0&&h.feedback.length===0&&h.W.pc()===2000);
}
{
 const h=make(),before=JSON.stringify(h.disk()),copy=h.A.careerSnapshot({bossKill:{map:{[elite]:{n:1,best:4}}},bossAsBoss:{win:2,lose:1}});check('pure candidate projection uses supplied records without reading or writing current money/history',copy.bossKill===1&&copy.bossSpeed.elite===4&&copy.bossAsBossWin===2&&JSON.stringify(h.disk())===before);
 const bad=h.A.careerSnapshot({bossKill:{map:{[elite]:{n:0,best:1}}}});check('speed data without a valid accepted kill does not qualify',bad.bossKill===0&&bad.bossSpeed.elite===null);
 let threw=false;try{h.A.careerSnapshot({bossKill:{map:[]}})}catch{threw=true}check('malformed record source fails closed instead of becoming empty successful data',threw);
}
{
 const h=make();for(const id of roster.allBossIds())h.A.record(id,{round:1,event:{}});for(let i=0;i<20;i++)h.A.recordAsBoss(true);await tick();const defs=h.ctx.window.CSH_ACHV.defs.filter(d=>d.cat==='挑战'),missing=defs.filter(d=>!entry(h,d.key));check('all twenty-two challenge rules have actual accepted record API coverage',defs.length===22&&missing.length===0,missing.map(d=>d.key));
 const A=h.ctx.window.CSH_ACHV,before=h.W.pc(),r=h.W.claimCareer('bosskill_1',A.byId('bosskill_1').reward,'fixture manual BOSS career claim');h.W.claimCareer('bosskill_1',A.byId('bosskill_1').reward,'fixture manual BOSS career claim');check('manual BOSS career reward remains one-time after passive collection',r.ok&&h.W.pc()===before+A.byId('bosskill_1').reward);
}
{
 const h=make();h.A.record(elite,{round:4,event:{}});const stamp=entry(h,'bosskill_1').observedAt,source=make({rank:0});source.W.preserveBoss({bossKill:{map:{},lastDaily:""},bossAsBoss:{win:0,lose:0}});const code=await source.M.export();const imported=await h.M.import(code);await tick();h.O.start();check('actual new-save import cannot carry a prior BOSS qualification or callback',imported.ok&&!entry(h,'bosskill_1'),{imported,record:h.W.careerUnlocks()});
 const rolled=await h.M.rollback(imported.backup);await tick();h.O.start();check('actual backup rollback restores exact BOSS qualification time',rolled.ok&&entry(h,'bosskill_1')?.observedAt===stamp,{rolled,stamp,record:h.W.careerUnlocks()});
}
{
 const data=new Map();data.set('csh_wallet',JSON.stringify({pc:2000,pcPeak:2000,careerUnlocks:{v:1,baseline:true,entries:{}},bossSaved:{bossKill:{map:{[elite]:{n:1,best:4}}},bossAsBoss:{win:1,lose:0}}}));const h=make({data});await tick();
 check('rolling out a new source into an already-baselined save preserves unknown historical dates silently',entry(h,'bosskill_1')?.observedAt===0&&entry(h,'boss_speed_elite')?.observedAt===0&&entry(h,'boss_asboss_1')?.observedAt===0&&h.feedback.length===0);
}
for(const key of ['connectMode','video']){const h=make();h.ctx._status[key]=true;h.A.recordAsBoss(true);await tick();check('restricted mode does not collect BOSS qualification: '+key,!entry(h,'boss_asboss_1'));}
{
 const h=make();h.data.set('csh_migrate_recovery','broken');const r=h.A.record(elite,{round:4,event:{}});check('persistent recovery lock refuses BOSS record and qualification',!r&&!entry(h,'bosskill_1'));
}
const failures=checks.filter(c=>!c.passed),result={scope:'Actual record/wallet/migration/achievement modules and shell stats, isolated stores; API-created records, not natural BOSS battles.',passed:checks.length-failures.length,failed:failures.length,checks};fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,failed:result.failed,failures},null,2));process.exitCode=failures.length?1:0;
