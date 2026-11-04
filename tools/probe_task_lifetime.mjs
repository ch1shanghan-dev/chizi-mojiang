// Independent cumulative-task checks, reusing the installed real-module harness only.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),i=process.argv.indexOf('--out');if(i<0)throw Error('External --out required');const out=path.resolve(process.argv[i+1]);
if(out===root||out.startsWith(root+path.sep)||process.platform==='win32'&&path.parse(out).root.toUpperCase()==='C:\\')throw Error('Keep task audit artifacts outside installation and C:');
const original=fs.readFileSync(root+'/tools/probe_career_unlocks.mjs','utf8');
let prefix=original.slice(0,original.indexOf('let h=harness();check('));
prefix=prefix.replace("path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')",JSON.stringify(root));
const from=original.indexOf('function backgroundHarness('),to=original.indexOf('\n{',original.indexOf('const feedbackTick=',from));
if(from<0||to<0)throw Error('real harness anchors changed');
const helpers=prefix+original.slice(from,to)+'\nexport {backgroundHarness,storage,feedbackTick};';
const {backgroundHarness,storage,feedbackTick}=await import('data:text/javascript;base64,'+Buffer.from(helpers).toString('base64'));
const checks=[],check=(name,passed,detail)=>checks.push({name,passed:!!passed,...(passed?{}:{detail})});
function freeze(b){var noon=new Date();noon.setHours(12,0,0,0);b.ctx.evalClock=noon.getTime();/* local-day noon must not go backwards before 08:00 in Asia/Shanghai */
 return import('node:vm').then(({default:vm})=>{vm.runInContext('var OriginalLifetimeDate=Date;Date=class extends OriginalLifetimeDate{constructor(...args){super(...(args.length?args:[evalClock]))}static now(){return evalClock}};',b.ctx);});}
function advance(b,days=1){b.ctx.evalClock+=days*86400000;b.bank.task.ensureDay();}
function complete(b){b.bank.task.add('hands',10);b.bank.task.add('wins',3);b.bank.task.add('bigPot',2000);}
const life=b=>b.bank.task.lifetime(),nine=['task_4','task_5','task_6','task_7','task_8','task_9','task_10','task_12','task_15'];
{
 const b=backgroundHarness();await freeze(b);const initial=b.W.pc(),writes=[],put=b.store.setItem.bind(b.store);b.store.setItem=(k,v)=>{put(k,v);if(k==='csh_wallet')writes.push(JSON.parse(v));};
 check('fresh save starts with zero accepted lifetime tasks and full days',life(b).completed===0&&life(b).fullDays===0);
 complete(b);await feedbackTick();let l=life(b);
 check('three real daily awards add exactly three tasks and one complete day',l.completed===3&&l.fullDays===1&&b.W.pc()===initial+1600,l);
 check('third task reward, cumulative facts and qualification share one successful wallet write',writes.some(w=>w.dailyTaskSaved?.claimed?.length===3&&w.taskLifetime?.completed===3&&w.taskLifetime?.fullDays===1&&w.careerUnlocks?.entries.egg_task_full?.observedAt>0));
 b.bank.task.add('hands',500);b.bank.pending.retry();b.flush();
 check('repeated progress, retry and flush never recount paid daily tasks',life(b).completed===3&&life(b).fullDays===1&&b.W.pc()===initial+1600);
 check('single day never unlocks cumulative four even after excess progress',!b.W.careerUnlocks().entries.task_4);
 advance(b);check('new day clears daily progress but retains cumulative facts',b.bank.task.peek().defs.every(d=>!d.done)&&life(b).completed===3&&life(b).fullDays===1);
 b.bank.task.add('hands',10);await feedbackTick();let entry=b.W.careerUnlocks().entries.task_4;
 check('fourth paid task across days unlocks old task_4 with a real observed date',life(b).completed===4&&entry?.observedAt>0&&b.disk().careerUnlocks.entries.task_4.observedAt===entry.observedAt);
 b.bank.task.add('wins',3);b.bank.task.add('bigPot',2000);for(let day=2;day<5;day++){advance(b);complete(b);}await feedbackTick();
 check('five genuine complete days make all nine repaired old milestones reachable',life(b).completed===15&&life(b).fullDays===5&&nine.every(k=>b.W.careerUnlocks().entries[k]?.observedAt>0),life(b));
 check('new cumulative eligibility never auto-pays career rewards',b.W.pc()===initial+5*1600&&nine.every(k=>!b.disk().careerClaims?.[k]));
 const stats=b.ctx.realBuildStats({readOnly:true});check('actual shell statistics report the same saved cumulative facts',stats.taskCompletedTotal===15&&stats.taskFullDays===5,stats);
 const count=b.W.pc();advance(b,-2);complete(b);check('clock rollback cannot reset paid task receipts or inflate cumulative totals',life(b).completed===15&&life(b).fullDays===5&&b.W.pc()===count);
 const same=backgroundHarness(b.store);check('whole module reload preserves accepted cumulative facts and exact milestone date',life(same).completed===15&&life(same).fullDays===5&&same.W.careerUnlocks().entries.task_4.observedAt===entry.observedAt);
}
{
 const b=backgroundHarness();await freeze(b);const initial=b.W.pc();b.store.fail='csh_wallet';b.bank.task.add('hands',10);await feedbackTick();
 check('failed checkpoint adopts neither cumulative count, money nor qualification',life(b).completed===0&&life(b).fullDays===0&&b.W.pc()===initial&&!b.W.careerUnlocks().entries.task_1&&b.ctx.feedback.length===0);
 b.store.fail='';b.bank.pending.retry();await feedbackTick();const stamp=b.W.careerUnlocks().entries.task_1?.observedAt;b.bank.pending.retry();b.flush();
 check('pending retry accepts the first task once and keeps its observed date',life(b).completed===1&&life(b).fullDays===0&&b.W.pc()===initial+300&&stamp>0&&b.W.careerUnlocks().entries.task_1.observedAt===stamp);
 b.bank.task.add('wins',3);b.store.fail='csh_wallet';b.bank.task.add('bigPot',2000);
 check('failed final daily task cannot increment full days prematurely',life(b).completed===2&&life(b).fullDays===0&&b.W.pc()===initial+800);
 b.store.fail='';b.bank.pending.retry();b.bank.pending.retry();check('last-task retry adds the third count and full-day count once',life(b).completed===3&&life(b).fullDays===1&&b.W.pc()===initial+1600);
}
{
 const b=backgroundHarness();await freeze(b);const initial=b.W.pc();b.store.fail='csh_ledger';complete(b);const saved=b.disk();
 check('ledger mirror failure cannot undo accepted lifetime facts and original payouts',saved.taskLifetime.completed===3&&saved.taskLifetime.fullDays===1&&b.W.pc()===initial+1600);
 b.store.fail='';b.flush();b.bank.pending.retry();check('later ledger recovery never recounts accepted tasks',life(b).completed===3&&life(b).fullDays===1&&b.W.pc()===initial+1600);
}
{
 const b=backgroundHarness();await freeze(b);b.store.fail='csh_daily_task';complete(b);b.store.fail='';complete(b);
 check('daily-task mirror failure uses wallet receipts and cannot duplicate counts',life(b).completed===3&&life(b).fullDays===1&&b.disk().dailyTaskSaved.claimed.length===3);
}
{
 const b=backgroundHarness();await freeze(b);b.store.fail='csh_wallet';complete(b);advance(b);b.store.fail='';b.bank.pending.retry();
 check('previous-day durable queue paid after midnight counts only its three genuine task awards',life(b).completed===3&&life(b).fullDays===1&&b.bank.task.peek().defs.every(d=>!d.done),life(b));
 complete(b);check('following day adds its own three awards without double counting old queue',life(b).completed===6&&life(b).fullDays===2,life(b));
}
{
 const source=backgroundHarness();complete(source);const raw=source.disk();delete raw.taskLifetime;delete raw.careerUnlocks;delete raw._sig;
 const store=storage();store.setItem('csh_wallet',JSON.stringify(raw));const old=backgroundHarness(store);
 check('legacy missing counter uses only the retained three paid receipts as a lower bound',life(old).completed===3&&life(old).fullDays===1&&nine.every(k=>!old.W.careerUnlocks().entries[k]));
 old.bank.task.add('hands',200);check('legacy current-day repeats do not turn the known lower bound into new counts',life(old).completed===3&&life(old).fullDays===1);
 const partial=JSON.parse(JSON.stringify(raw));partial.dailyTaskSaved={...partial.dailyTaskSaved,wins:0,bigPot:0,claimed:['hands']};partial.pc=2300;partial.pcPeak=2300;const ps=storage();ps.setItem('csh_wallet',JSON.stringify(partial));const one=backgroundHarness(ps);
 check('legacy partial receipts seed one real task and zero full days',life(one).completed===1&&life(one).fullDays===0);
 one.bank.task.add('wins',3);one.bank.task.add('bigPot',2000);check('legacy partial lower bound continues to three without recounting its old first task',life(one).completed===3&&life(one).fullDays===1);
}
{
 const b=backgroundHarness();await freeze(b);const raw=b.disk();raw.taskLifetime={v:1,completed:999999999,fullDays:333333333};b.bank.reloadSave({wallet:raw,rank:{},dailyTask:raw.dailyTaskSaved},{memoryOnly:true});b.O.start();complete(b);
 const l=life(b);check('near-cap task completion stays within both cumulative safety limits',l.completed===1000000000&&l.fullDays===333333333&&b.bank.validateTaskLifetime(l).completed===l.completed,l);
}
{
 const b=backgroundHarness();await freeze(b);complete(b);advance(b);b.bank.task.add('hands',10);const before=life(b),stamp=b.W.careerUnlocks().entries.task_4.observedAt;
 const source=backgroundHarness(),code=await source.M.export();b.ctx.lib.cshWorld.reloadSave=()=>true;const imported=await b.M.import(code);await feedbackTick();b.O.start();
 check('real import replaces old lifetime progress instead of mixing saves',imported.ok&&life(b).completed===0&&life(b).fullDays===0&&!b.W.careerUnlocks().entries.task_4,imported);
 const rolled=await b.M.rollback(imported.backup);await feedbackTick();b.O.start();check('real backup rollback restores cumulative facts and exact milestone date',rolled.ok&&life(b).completed===before.completed&&life(b).fullDays===before.fullDays&&b.W.careerUnlocks().entries.task_4.observedAt===stamp,rolled);
}
{
 const b=backgroundHarness(),epoch=b.bank.saveEpoch();b.store.fail=b.bank.pending.KEY;b.bank.pending.put('match','task-lifetime-invalid-adopt-001',{mode:'identity',win:true,amount:300});const pending=b.bank.pending.status();b.store.fail='';
 let rejected=false;try{b.bank.reloadSave({wallet:{pc:2000,taskLifetime:{v:2,completed:0,fullDays:0}},rank:{},dailyTask:{}},{memoryOnly:true});}catch(error){rejected=true;}
 check('invalid incoming lifetime rejects before replacing a save or discarding volatile accepted work',rejected&&b.bank.saveEpoch()===epoch&&b.bank.pending.status().volatile===pending.volatile&&pending.volatile===1,{rejected,epochBefore:epoch,epochAfter:b.bank.saveEpoch(),pendingBefore:pending,pendingAfter:b.bank.pending.status()});
}
{
 for(const bad of [{v:2,completed:0,fullDays:0,opaque:'keep-unknown-record'},{v:1,completed:-1,fullDays:0}]){
  const source=backgroundHarness(),raw=source.disk();raw.taskLifetime=bad;delete raw._sig;const store=storage();store.setItem('csh_wallet',JSON.stringify(raw));
  let b,error;try{b=backgroundHarness(store);}catch(e){error=e.message;}
  check('bad local lifetime does not crash wallet module loading: '+bad.v,!!b&&typeof b.bank.task.add==='function',error);
  if(b){const before=b.disk(),pc=b.W.pc(),counter=JSON.stringify(before.taskLifetime),daily=JSON.stringify(before.dailyTaskSaved);b.bank.task.add('hands',10);b.bank.pending.retry();const after=b.disk();let strict=false;try{b.bank.task.lifetime();}catch(e){strict=true;}
   check('bad local lifetime stays intact and blocks task payout instead of silently becoming zero: '+bad.v,strict&&b.W.pc()===pc&&JSON.stringify(after.taskLifetime)===counter&&JSON.stringify(after.dailyTaskSaved)===daily&&b.bank.pending.status().count>0,{before:before.taskLifetime,after:after.taskLifetime,pcBefore:pc,pcAfter:b.W.pc(),strict,pending:b.bank.pending.status()});
  }
 }
}
const failures=checks.filter(c=>!c.passed),result={scope:'Actual installed wallet, achievement, migration modules and extracted shell stats with isolated stores/clock. No natural full game or player profile.',passed:checks.length-failures.length,failed:failures.length,checks};fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,failed:result.failed,failures},null,2));process.exitCode=failures.length?1:0;
