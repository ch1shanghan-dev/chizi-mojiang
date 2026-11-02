// Real BOSS transactions + real career/wallet/migration modules; disposable VM stores only.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {webcrypto} from 'node:crypto';import * as roster from '../core/csh_bossdata.js';import {root,parse,walk} from './lib/skill_audit.mjs';
const at=process.argv.indexOf('--out');if(at<0)throw Error('External --out required');const out=path.resolve(process.argv[at+1]);
const prefix=fs.readFileSync(root+'/tools/probe_boss_transactions.mjs','utf8').split('const rows=[];')[0].replace(/^import .*?;\r?\n/gm,'');const outer=vm.createContext({fs,path,vm,webcrypto,root,console,...roster,roster,TextEncoder,TextDecoder,btoa,atob});vm.runInContext(prefix+'\nthis.makeBoss=harness;',outer);
const clean=s=>s.replace(/^import [\s\S]*?;\r?\n/gm,'').replace(/\bexport /g,'');const read=p=>fs.readFileSync(root+'/core/csh_'+p+'.js','utf8');let build;walk(parse(read('shell')),n=>{if(n.type==='FunctionDeclaration'&&n.id.name==='buildStats')build=read('shell').slice(...n.range).replace('function buildStats','function realBossBuildStats')});
function make(options={}){const h=outer.makeBoss(options);vm.runInContext(clean(read('achv')),h.ctx);h.ctx.wallet=()=>h.lib.cshWallet;h.ctx.projectBossCareer=h.ctx.careerSnapshot;vm.runInContext(build,h.ctx);
 h.lib.cshWorld={list:()=>[],stats:()=>({}),gambleStats:()=>({}),reloadSave:()=>true};h.lib.cshInteract={stats:()=>({playerThrows:0})};h.lib.cshShell={stats:o=>h.ctx.realBossBuildStats(o)};h.feedback=[];h.lib.cshUI={achievement:(rows,options)=>h.feedback.push({rows,options})};
 vm.runInContext(clean(read('career_observer')),h.ctx);h.O=h.lib.cshCareerObserver;h.bank=h.lib.cshWallet;if(options.start!==false)h.O.start();return h;}

const checks=[],check=(name,passed,detail)=>checks.push({name,passed:!!passed,...(!passed?{detail}:{})}),tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve()},entry=(h,k)=>h.W.careerUnlocks()?.entries[k],rankDisk=h=>JSON.parse(h.data.get('csh_rank')||'{}');
{
 const h=make(),pc=h.W.pc(),offset=h.writes.length,r=h.R.addMerit(100,'fixture first durable merit');
 const first=h.writes.slice(offset).find(x=>x.k==='csh_rank'),saved=JSON.parse(first.v),stamp=saved.careerUnlocks.entries.rank_1?.observedAt;
 check('rank, total merit and daily merit observations share the first actual rank write',r.ok&&saved.rank===1&&saved.merit===100&&stamp>0&&saved.careerUnlocks.entries.merit_100?.observedAt>0&&saved.careerUnlocks.entries.meritday_100?.observedAt>0);
 await tick();check('passive wallet aggregation preserves exact source dates without career payment',entry(h,'rank_1')?.observedAt===stamp&&entry(h,'merit_100')?.observedAt===saved.careerUnlocks.entries.merit_100.observedAt&&h.W.pc()===pc&&!h.disk().careerClaims?.rank_1);
 check('new rank observation notifies once after accepted wallet aggregation',h.feedback.flatMap(x=>x.rows).filter(x=>x.id==='rank_1').length===1);
 h.lib.cshWallet.flushSave();await tick();check('repeated wallet save does not repeat feedback or source time',h.feedback.flatMap(x=>x.rows).filter(x=>x.id==='rank_1').length===1&&entry(h,'rank_1').observedAt===stamp);
 const restarted=make({data:h.data});await tick();check('whole module restart keeps exact rank observation and no replay',entry(restarted,'rank_1')?.observedAt===stamp&&rankDisk(restarted).careerUnlocks.entries.rank_1.observedAt===stamp&&restarted.feedback.length===0);
 const exported=await h.M.inspect(await h.M.export());check('actual export preserves both source and aggregated observation',exported.ok&&exported.data.rank.careerUnlocks.entries.rank_1.observedAt===stamp&&exported.data.wallet.careerUnlocks.entries.rank_1.observedAt===stamp);
 const reward=h.ctx.window.CSH_ACHV.byId('rank_1').reward,a=h.W.claimCareer('rank_1',reward,'fixture manual rank claim');h.W.claimCareer('rank_1',reward,'fixture manual rank claim');check('manual rank reward remains original and one-time',a.ok&&h.W.pc()===pc+reward);
}
{
 const h=make(),before=h.R.get(),raw=h.data.get('csh_rank');h.fault.key='csh_rank';const r=h.R.addMerit(100,'fixture rejected rank');await tick();
 check('failed ordinary rank write returns false and changes no memory or source observation',!r.ok&&r.gained===0&&JSON.stringify(h.R.get())===JSON.stringify(before)&&h.data.get('csh_rank')===raw&&!entry(h,'rank_1')&&h.feedback.length===0,r);
 h.fault.key=null;const retry=h.R.addMerit(100,'fixture explicit retry');await tick();check('explicit retry after rejected rank credits merit once',retry.ok&&h.R.get().merit===100&&entry(h,'rank_1')?.observedAt>0);
}
{
 const h=make();h.fault.key='csh_wallet';const r=h.R.addMerit(100,'fixture accepted rank wallet aggregation fails'),stamp=rankDisk(h).careerUnlocks.entries.rank_1.observedAt;await tick();
 check('wallet failure keeps the accepted rank source but adopts no wallet qualification or feedback',r.ok&&h.R.get().merit===100&&stamp>0&&!entry(h,'rank_1')&&h.feedback.length===0);
 let refused=false;try{await h.M.export()}catch{refused=true}check('export barrier refuses while accepted rank qualification cannot aggregate',refused);
 h.fault.key=null;h.lib.cshWallet.flushSave();await tick();check('wallet retry aggregates the exact earlier source time without extra merit',entry(h,'rank_1')?.observedAt===stamp&&h.R.get().merit===100&&h.feedback.flatMap(x=>x.rows).filter(x=>x.id==='rank_1').length===1);
}
{
 const h=make();h.fault.key='csh_wallet';h.R.addMerit(100,'fixture crash after source checkpoint');await tick();const stamp=rankDisk(h).careerUnlocks.entries.rank_1.observedAt;
 const reboot=make({data:h.data});await tick();check('restart after only source commit retains the real positive date without replay',entry(reboot,'rank_1')?.observedAt===stamp&&reboot.R.get().merit===100&&reboot.feedback.length===0);
}
{
 const h=make({start:false});h.lib.cshWorld.stats=()=>{throw Error('fixture unavailable full stats')};h.R.addMerit(100,'fixture rank before readiness');await tick();const stamp=rankDisk(h).careerUnlocks.entries.rank_1.observedAt;check('pre-ready accepted rank saves its date in the source while aggregation waits',stamp>0&&!entry(h,'rank_1'));
 h.lib.cshWorld.stats=()=>({});h.O.start();await tick();check('readiness recovery keeps pre-ready rank as new observed with exactly one notification',entry(h,'rank_1')?.observedAt===stamp&&h.feedback.flatMap(x=>x.rows).filter(x=>x.id==='rank_1').length===1);
}
{
 const data=new Map([['csh_rank',JSON.stringify({rank:10,merit:5500,meritToday:500,meritDate:'2020-01-01'})],['csh_wallet',JSON.stringify({pc:2000,pcPeak:2000,careerUnlocks:{v:1,baseline:true,entries:{}}})]]),h=make({data});await tick();
 check('already-baselined legacy rank and known prior-day merit initialize silently as unknown dates',entry(h,'rank_10')?.observedAt===0&&entry(h,'merit_3000')?.observedAt===0&&entry(h,'meritday_400')?.observedAt===0&&h.feedback.length===0);
 h.R.addMerit(100,'fixture new day');await tick();check('daily rollover never erases known old daily merit qualification or invents its time',entry(h,'meritday_400')?.observedAt===0&&h.R.get().meritToday===100&&rankDisk(h).careerUnlocks.entries.meritday_400.observedAt===0);
}
{
 const h=make(),clock=vm.runInContext('Date',h.ctx),original=clock.now;clock.now=()=>1700000000000;h.R.addMerit(100,'fixture date');await tick();const stamp=entry(h,'rank_1').observedAt;
 const source=make({rank:0}),imported=await h.M.import(await source.M.export());await tick();h.O.start();check('actual adopting import cannot carry old source or queued rank observations',imported.ok&&!entry(h,'rank_1')&&!rankDisk(h).careerUnlocks?.entries.rank_1,imported);
 const rolled=await h.M.rollback(imported.backup);await tick();h.O.start();check('actual rollback restores exact source and aggregated rank date',rolled.ok&&entry(h,'rank_1')?.observedAt===stamp&&rankDisk(h).careerUnlocks.entries.rank_1.observedAt===stamp);
 clock.now=original;
}
{
 const h=make();h.R.addMerit(1000000,'fixture all rank tiers');await tick();const defs=h.ctx.window.CSH_ACHV.defs.filter(d=>d.cat==='官阶'||d.cat==='功勋'||['egg_seg_rise','egg_rank_master'].includes(d.key)),missing=defs.filter(d=>!entry(h,d.key));check('all ninety-four rank and merit rules have actual accepted rank API coverage',defs.length===94&&missing.length===0,missing.map(d=>d.key));
}
{
 const h=make(),pc=h.W.pc();h.A.recordMinion(roster.allMinionIds()[0],{event:{}});await tick();check('original BOSS compensation rank path contributes real daily merit without extra coins',h.R.get().merit===25&&rankDisk(h).careerUnlocks?.baseline&&h.W.pc()===pc+800);
 h.W.claimPool('fixture_rank_pool',500,100,'fixture original pool merit');await tick();const before=h.R.get().merit;h.W.claimPool('fixture_rank_pool',500,100,'fixture original pool merit');await tick();check('original pool-claim rank path observes and retains its receipt on duplicate retry',entry(h,'rank_1')?.observedAt>0&&h.R.get().merit===before&&rankDisk(h).poolClaims.fixture_rank_pool===100);
}
{
 const h=make(),before=h.R.get(),epoch=h.lib.cshWallet.saveEpoch();h.data.set(h.lib.cshWallet.pending.KEY,JSON.stringify({v:1,entries:[]}));let threw=false;try{h.lib.cshWallet.reloadSave({wallet:{pc:2000},rank:{careerUnlocks:{v:2,baseline:true,entries:{}}},dailyTask:{}},{memoryOnly:true})}catch{threw=true}check('malformed incoming rank qualification rejects before changing epoch or current rank',threw&&h.lib.cshWallet.saveEpoch()===epoch&&JSON.stringify(h.R.get())===JSON.stringify(before));
 const bad=await h.M.inspect('CSHMIG1.'+Buffer.from(JSON.stringify({meta:{v:1},rank:{rank:0,careerUnlocks:{v:2,baseline:true,entries:{}}}})).toString('base64url'));check('portable migration cleaning refuses malformed rank qualification',!bad.ok);
}
for(const mode of ['connectMode','video']){const h=make();h.ctx._status[mode]=true;h.R.addMerit(100,'fixture disabled mode');await tick();check('restricted mode collects no rank eligibility: '+mode,!entry(h,'rank_1')&&!rankDisk(h).careerUnlocks?.entries.rank_1);}
{
 const h=make(),before=JSON.stringify(h.R.get());check('nonfinite and overflow input cannot corrupt persisted merit',!h.R.addMerit(Infinity,'fixture invalid').ok&&!h.R.addMerit(1e20,'fixture overflow').ok&&JSON.stringify(h.R.get())===before);
}
{
 const h=make();h.R.addMerit(100,'fixture warm rank source');await tick();let scans=0;
 h.ctx.window.CSH_ACHV.defs.filter(d=>d.cat==='官阶'||d.cat==='功勋').forEach(d=>{const real=d.prog;d.prog=function(s){scans++;return real(s)}});
 h.W.add(20,'fixture unrelated wallet action');h.lib.cshWallet.flushSave();await tick();check('unchanged rank source is cached across wallet actions without rescanning rank rules',scans===0,{scans});
}
{
 const h=make();h.R.addMerit(100,'fixture immediate rank export');const stamp=rankDisk(h).careerUnlocks.entries.rank_1.observedAt,code=await h.M.export(),ex=await h.M.inspect(code);check('immediate export before deferred aggregation includes exact source and wallet observations',ex.ok&&ex.data.rank.careerUnlocks.entries.rank_1.observedAt===stamp&&ex.data.wallet.careerUnlocks.entries.rank_1.observedAt===stamp);
}
{
 const h=make();h.R.addMerit(100,'fixture stale rank callback');const before=h.lib.cshWallet.saveEpoch();h.lib.cshWallet.reloadSave({wallet:{pc:1234,pcPeak:1234},rank:{rank:0,merit:0,meritToday:0,meritDate:''},dailyTask:{}},{memoryOnly:true});await tick();h.O.start();await tick();check('adoption before queued rank aggregation drops old callback and notification',h.lib.cshWallet.saveEpoch()===before+1&&h.R.get().merit===0&&!entry(h,'rank_1')&&h.feedback.every(f=>f.rows.every(r=>r.id!=='rank_1')));
}
{
 const data=new Map([['csh_wallet',JSON.stringify({pc:2000,pcPeak:2000,careerClaims:{rank_1:1},careerUnlocks:{v:1,baseline:true,entries:{rank_1:{observedAt:0}}}})]]),h=make({data});h.R.addMerit(100,'fixture already-qualified old rank');await tick();const ex=await h.M.inspect(await h.M.export());check('old already-qualified rank never leaves an unnecessary export barrier or duplicate feedback',ex.ok&&entry(h,'rank_1').observedAt===0&&h.feedback.flatMap(f=>f.rows).every(r=>r.id!=='rank_1'));
}
{
 const h=make();h.R.addMerit(100,'fixture concurrent qualification sync');h.W.syncCareerUnlocks(['rank_1']);await tick();check('an accepted concurrent wallet sync releases redundant rank pending qualification',h.O.flushForSnapshot()&&entry(h,'rank_1')?.observedAt>0);
}
const failures=checks.filter(c=>!c.passed),result={scope:'Actual rank/wallet/migration/achievement modules and shell stats, isolated stores and API-created merit; not natural complete matches.',passed:checks.length-failures.length,failed:failures.length,checks};fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,failed:result.failed,failures},null,2));process.exitCode=failures.length?1:0;
