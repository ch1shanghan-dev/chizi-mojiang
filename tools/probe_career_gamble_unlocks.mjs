// Real BOSS transactions + real career/wallet/migration modules; disposable VM stores only.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {webcrypto} from 'node:crypto';import * as roster from '../core/csh_bossdata.js';import {root,parse,walk} from './lib/skill_audit.mjs';
const at=process.argv.indexOf('--out');if(at<0)throw Error('External --out required');const out=path.resolve(process.argv[at+1]);
const prefix=fs.readFileSync(root+'/tools/probe_boss_transactions.mjs','utf8').split('const rows=[];')[0].replace(/^import .*?;\r?\n/gm,'');const outer=vm.createContext({fs,path,vm,webcrypto,root,console,...roster,roster,TextEncoder,TextDecoder,btoa,atob});vm.runInContext(prefix+'\nthis.makeBoss=harness;',outer);
const clean=s=>s.replace(/^import [\s\S]*?;\r?\n/gm,'').replace(/\bexport /g,'');const read=p=>fs.readFileSync(root+'/core/csh_'+p+'.js','utf8');let build;walk(parse(read('shell')),n=>{if(n.type==='FunctionDeclaration'&&n.id.name==='buildStats')build=read('shell').slice(...n.range).replace('function buildStats','function realBossBuildStats')});

function make(options={}){const h=outer.makeBoss(options);h.ctx.ui={};h.ctx.cshVoices={};h.ctx.get={poptip:()=>""};h.ctx.ai={};h.ctx.setInterval=()=>1;h.ctx.clearInterval=()=>{};
 vm.runInContext(clean(fs.readFileSync(root+'/character/index.js','utf8').replace('export default','var cshCharacter =')),h.ctx);vm.runInContext(clean(read('achv')),h.ctx);vm.runInContext(clean(read('world')),h.ctx);h.G=h.lib.cshWorld;h.ctx.wallet=()=>h.lib.cshWallet;h.ctx.projectBossCareer=h.ctx.careerSnapshot;vm.runInContext(build,h.ctx);
 h.lib.cshInteract={stats:()=>({playerThrows:0})};h.lib.cshShell={stats:o=>h.ctx.realBossBuildStats(o)};h.feedback=[];h.lib.cshUI={achievement:(rows,options)=>h.feedback.push({rows,options})};vm.runInContext(clean(read('career_observer')),h.ctx);h.O=h.lib.cshCareerObserver;h.bank=h.lib.cshWallet;if(options.start!==false)h.O.start();return h;}
const checks=[],check=(name,passed,detail)=>checks.push({name,passed:!!passed,...(!passed?{detail}:{})}),tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve()},entry=(h,k)=>h.W.careerUnlocks()?.entries[k],disk=h=>JSON.parse(h.data.get('csh_world')||'{}'),Q=h=>h.bank.pending;
{
 const h=make(),pc=h.W.pc(),offset=h.writes.length,result=h.G.noteGamble(100000),first=h.writes.slice(offset).find(x=>x.k==='csh_world'),saved=JSON.parse(first.v),stamp=saved.careerUnlocks.entries.gmplay_1?.observedAt;
 check('first accepted gamble writes actual statistics, queue receipt and qualification together',result&&saved.gambles.plays===1&&saved.gambles.wins===1&&saved.gambles.receipts.length===1&&stamp>0&&saved.careerUnlocks.entries.gmnet_100000?.observedAt===stamp&&saved.careerUnlocks.entries.egg_gamble_first?.observedAt===stamp);
 await tick();check('passive aggregate keeps exact source dates without a career page or automatic reward',entry(h,'gmplay_1')?.observedAt===stamp&&entry(h,'gmnet_100000')?.observedAt===stamp&&h.W.pc()===pc&&!h.disk().careerClaims?.gmplay_1);
 check('accepted new qualification notifies after aggregation exactly once',h.feedback.flatMap(x=>x.rows).filter(x=>x.id==='gmplay_1').length===1&&Q(h).status().count===0);
 h.G.noteGamble(-100001);await tick();check('later net decrease preserves the earlier transient net qualification and original date',h.G.gambleStats().net===-1&&entry(h,'gmnet_100000')?.observedAt===stamp);
 const reboot=make({data:h.data});await tick();check('whole module reload preserves source and permanent date without replay',entry(reboot,'gmnet_100000')?.observedAt===stamp&&disk(reboot).careerUnlocks.entries.gmnet_100000.observedAt===stamp&&reboot.feedback.length===0);
 const ex=await h.M.inspect(await h.M.export());check('portable export retains exact world source and wallet observations',ex.ok&&ex.data.world.careerUnlocks.entries.gmplay_1.observedAt===stamp&&ex.data.wallet.careerUnlocks.entries.gmplay_1.observedAt===stamp&&ex.data.world.gambles.receipts.length===2);
 const before=h.W.pc(),reward=h.ctx.window.CSH_ACHV.byId('gmnet_100000').reward,r=h.W.claimCareer('gmnet_100000',reward,'fixture manual gamble claim');h.W.claimCareer('gmnet_100000',reward,'fixture manual gamble claim');check('manual reward after transient net falls pays the original reward once',r.ok&&h.W.pc()===before+reward);
}
{
 const h=make();h.G.noteGamble(1000);h.G.noteGamble(0);await tick();const g=h.G.gambleStats();check('real zero-profit outcome increments push without a loss or streak reset',g.plays===2&&g.wins===1&&g.push===1&&g.bust===0&&g.streak===1);
 h.G.noteGamble(1000);h.G.noteGamble(-1);h.G.noteGamble(-1);await tick();check('mixed lifetime facts unlock the distinct experience without inventing order',entry(h,'gmstreak_2')?.observedAt>0&&entry(h,'gstreak2_2')?.observedAt>0&&h.G.gambleStats().streak===0);
}
{
 const h=make(),before=JSON.stringify(h.G.raw());h.fault.key='csh_world';const r=h.G.noteGamble(100000);await tick();const st=Q(h).status(),job=JSON.parse(h.data.get(Q(h).KEY)).entries[0];
 check('failed world write keeps actual statistics/history/qualifications unchanged with one durable pending result',r===null&&JSON.stringify(h.G.raw())===before&&!entry(h,'gmplay_1')&&h.feedback.length===0&&st.count===1&&job.kind==='gamble');
 h.fault.key=null;Q(h).retry();await tick();const stamp=entry(h,'gmplay_1')?.observedAt;check('actual pending retry records original observation time once',h.G.gambleStats().plays===1&&stamp===job.data.t&&Q(h).status().count===0);
 Q(h).put('gamble',job.id,job.data);Q(h).retry();await tick();check('replayed accepted result ID cannot count or notify twice',h.G.gambleStats().plays===1&&entry(h,'gmplay_1')?.observedAt===stamp&&h.feedback.flatMap(x=>x.rows).filter(x=>x.id==='gmplay_1').length===1);
}
{
 const h=make();h.fault.key='csh_world';h.G.noteGamble(50000);const job=JSON.parse(h.data.get(Q(h).KEY)).entries[0],again=make({data:h.data});Q(again).retry();await tick();check('durable pending world result survives a whole module restart',again.G.gambleStats().plays===1&&entry(again,'gmplay_1')?.observedAt===job.data.t&&Q(again).status().count===0);
}
{
 const h=make();h.fault.key=Q(h).KEY;h.G.noteGamble(50000);check('journal write failure retains an in-memory pending result without adopting world facts',Q(h).status().volatile===1&&h.G.gambleStats().plays===0&&!entry(h,'gmplay_1'));
 h.fault.key=null;Q(h).retry();await tick();check('volatile recovery persists original result and qualification exactly once',h.G.gambleStats().plays===1&&entry(h,'gmplay_1')?.observedAt>0&&Q(h).status().count===0);
}
{
 const h=make(),store=h.ctx.localStorage,remove=store.removeItem;store.removeItem=k=>{if(k===Q(h).KEY)throw Error('fixture cleanup quota');return remove(k)};h.G.noteGamble(1000);await tick();const stamp=entry(h,'gmplay_1')?.observedAt;
 check('queue cleanup failure leaves accepted source receipt to prevent replay',h.G.gambleStats().plays===1&&Q(h).status().count===1&&stamp>0);store.removeItem=remove;Q(h).retry();Q(h).retry();await tick();check('queue cleanup retry cannot duplicate accepted world statistics or dates',h.G.gambleStats().plays===1&&Q(h).status().count===0&&entry(h,'gmplay_1')?.observedAt===stamp);
}
{
 const h=make();h.fault.key='csh_wallet';const r=h.G.noteGamble(100000),stamp=disk(h).careerUnlocks.entries.gmnet_100000.observedAt;await tick();check('wallet aggregation failure retains committed world source but no premature feedback',r&&h.G.gambleStats().net===100000&&stamp>0&&!entry(h,'gmnet_100000')&&h.feedback.length===0);
 let refused=false;try{await h.M.export()}catch{refused=true}check('export barrier refuses while exact accepted qualification cannot aggregate',refused);h.fault.key=null;h.bank.flushSave();await tick();check('wallet recovery restores original world observation without recounting a session',entry(h,'gmnet_100000')?.observedAt===stamp&&h.G.gambleStats().plays===1);
}
{
 const h=make();h.fault.key='csh_wallet';h.G.noteGamble(100000);await tick();const stamp=disk(h).careerUnlocks.entries.gmnet_100000.observedAt,reboot=make({data:h.data});await tick();check('cold restart after source-only commit preserves exact date quietly',entry(reboot,'gmnet_100000')?.observedAt===stamp&&reboot.feedback.length===0);
}
{
 const h=make({start:false});h.lib.cshInteract.stats=()=>{throw Error('fixture not ready')};h.G.noteGamble(100000);await tick();const stamp=disk(h).careerUnlocks.entries.gmnet_100000.observedAt;check('accepted result before full readiness keeps source date while aggregation waits',stamp>0&&!entry(h,'gmnet_100000'));
 h.lib.cshInteract.stats=()=>({playerThrows:0});h.O.start();await tick();check('readiness recovery retains newly accepted result date and a single notification',entry(h,'gmnet_100000')?.observedAt===stamp&&h.feedback.flatMap(x=>x.rows).filter(x=>x.id==='gmnet_100000').length===1);
}
{
 const seed=make(),raw=seed.G.raw();raw.gambles={plays:8,wins:4,bust:4,push:0,net:100000,best:100000,streak:0,bestStreak:4};delete raw.careerUnlocks;seed.data.set('csh_world',JSON.stringify(raw));seed.data.set('csh_wallet',JSON.stringify({pc:2000,pcPeak:2000,careerUnlocks:{v:1,baseline:true,entries:{}}}));const h=make({data:seed.data});await tick();check('existing-baseline legacy gamble history initializes silently with unknown dates',entry(h,'gmplay_1')?.observedAt===0&&entry(h,'gmnet_100000')?.observedAt===0&&entry(h,'gstreak2_2')?.observedAt===0&&h.feedback.length===0);
}
{
 const h=make(),raw=h.G.raw();raw.gambles={plays:1399,wins:129,bust:169,push:1101,net:9999999,best:4999999,streak:21,bestStreak:21};h.G.reloadSave(raw);h.G.noteGamble(5000000);h.G.noteGamble(-100000000);await tick();const defs=h.ctx.window.CSH_ACHV.defs.filter(d=>d.cat==='豪赌桌'||d.key==='egg_gamble_first'),missing=defs.filter(d=>!entry(h,d.key));check('all seventy-six rules bind to actual accepted world records across reliable legacy and new facts',defs.length===76&&missing.length===0,missing.map(d=>d.key));
}
{
 const h=make();h.G.noteGamble(100000);await tick();const stamp=entry(h,'gmnet_100000').observedAt,other=make({rank:0}),imported=await h.M.import(await other.M.export());await tick();h.O.start();check('actual new-world import cannot inherit previous qualification or pending callback',imported.ok&&!entry(h,'gmnet_100000')&&h.G.gambleStats().plays===0);
 const rollback=await h.M.rollback(imported.backup);await tick();h.O.start();check('actual backup rollback restores exact world and permanent observation',rollback.ok&&entry(h,'gmnet_100000')?.observedAt===stamp&&disk(h).careerUnlocks.entries.gmnet_100000.observedAt===stamp);
}
{
 const h=make(),before=JSON.stringify(h.G.raw()),version=h.G.gambleRevision(),raw=h.G.raw();raw.careerUnlocks={v:2,baseline:true,entries:{}};check('malformed direct world adoption refuses without changing current source or revision',h.G.reloadSave(raw)===false&&JSON.stringify(h.G.raw())===before&&h.G.gambleRevision()===version);
 const ex=await h.M.inspect('CSHMIG1.'+Buffer.from(JSON.stringify({meta:{v:1},world:raw})).toString('base64url'));check('portable cleaning rejects malformed source eligibility',!ex.ok);
 const bad=h.G.raw();bad.gambles.receipts=['bad'];check('malformed receipt cannot become an adopted replayable source',h.G.reloadSave(bad)===false&&JSON.stringify(h.G.raw())===before);
}
{
 const h=make();for(const profit of [NaN,Infinity,-Infinity,100000000001])check('invalid profit does not create a result or mutate source '+profit,h.G.noteGamble(profit)===null&&h.G.gambleStats().plays===0&&Q(h).status().count===0);
 h.data.set('csh_migrate_recovery','broken');check('persistent recovery lock refuses source progress',h.G.noteGamble(1000)===null&&h.G.gambleStats().plays===0);
}
for(const mode of ['connectMode','video']){const h=make();h.ctx._status[mode]=true;h.G.noteGamble(100000);await tick();check('restricted mode creates no background qualification '+mode,!entry(h,'gmplay_1')&&!disk(h).careerUnlocks?.entries.gmplay_1);}
{
 const h=make();h.G.noteGamble(1000);await tick();let scans=0;h.ctx.window.CSH_ACHV.defs.filter(d=>d.cat==='豪赌桌').forEach(d=>{const fn=d.prog;d.prog=s=>{scans++;return fn(s)}});h.W.add(10,'fixture unrelated wallet');h.bank.flushSave();await tick();check('unchanged world source is cached across unrelated wallet activity',scans===0,{scans});
}
{
 const h=make();h.G.noteGamble(100000);const ex=await h.M.inspect(await h.M.export());check('immediate export before deferred aggregate contains both exact source and permanent record',ex.ok&&ex.data.world.careerUnlocks.entries.gmplay_1.observedAt===ex.data.wallet.careerUnlocks.entries.gmplay_1.observedAt);
}
{
 const h=make(),raw=h.G.raw();raw.gambles={plays:2,wins:1};h.G.reloadSave(raw);const r=h.G.noteGamble(10);await tick();check('legacy partial gamble shape fills only missing zero fields before accepted arithmetic',r&&h.G.gambleStats().plays===3&&h.G.gambleStats().wins===2&&h.G.gambleStats().net===10);
 const d=h.ctx.window.CSH_ACHV.byId('egg_gamble_first');check('first gamble wording matches actual settled-result predicate, preserving its reward and ID',d.desc==='完成首次豪赌桌出战结算（单纯入场或未开局退款不计）'&&d.reward===1500&&d.prog({gamblePlays:0})[0]===0&&d.prog({gamblePlays:1})[0]===1);
}
const failures=checks.filter(c=>!c.passed),result={scope:'Actual world/wallet/observer/migration and real shell statistics, isolated API-created outcomes and injected storage faults; not natural full sessions.',passed:checks.length-failures.length,failed:failures.length,checks};fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,failed:result.failed,failures},null,2));process.exitCode=failures.length?1:0;
