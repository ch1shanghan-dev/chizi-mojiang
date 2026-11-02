// Actual career engine definitions. Isolated storage only; no player profile or wallet mutations.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),opt=(key)=>{const i=process.argv.indexOf(key);return i<0?null:process.argv[i+1]};
const out=opt('--out'),baseline=opt('--baseline');if(!out||!baseline)throw Error('External --out and preserved --baseline required');
const rows=[],check=(name,passed,detail)=>rows.push({name,passed:!!passed,...(!passed?{detail}:{})});
function engine(source,claimed={}){const state=new Map([['csh_career_achv',JSON.stringify(claimed)]]),ctx=vm.createContext({window:{},localStorage:{getItem:k=>state.get(k)||null,setItem:(k,v)=>state.set(k,String(v))}});vm.runInContext(source,ctx);return ctx.window.CSH_ACHV;}
const old=engine(fs.readFileSync(baseline,'utf8')),A=engine(fs.readFileSync(root+'/core/csh_achv.js','utf8')),cumulative=[4,5,6,7,8,9,10,12,15],changed=new Set(cumulative.map(n=>'task_'+n));
check('exactly the original 493 definitions and IDs remain',A.defs.length===493&&old.defs.length===493&&A.defs.every((d,i)=>d.key===old.defs[i].key));
check('all original career rewards are preserved',A.defs.every(d=>d.reward===old.byId(d.key).reward));
const metadata=d=>JSON.stringify({key:d.key,cat:d.cat,ico:d.ico,label:d.label,desc:d.desc,reward:d.reward});
check('all other 484 definition labels and descriptions are unchanged',A.defs.filter(d=>!changed.has(d.key)).every(d=>metadata(d)===metadata(old.byId(d.key))));
for(const n of cumulative){const key='task_'+n,d=A.byId(key);
 check(key+' explains cross-day cumulative objective',d.label.includes('累计')&&d.desc==='跨日累计完成 '+n+' 项每日任务');
 check(key+' cannot unlock from three current-day tasks alone',!A.test(d,{taskDone:3,taskTotal:3}));
 check(key+' does not read an inflated old single-day count',!A.test(d,{taskDone:15,taskTotal:3,taskCompletedTotal:0}));
 check(key+' requires the actual cumulative threshold',!A.test(d,{taskDone:0,taskCompletedTotal:n-1})&&A.test(d,{taskDone:0,taskCompletedTotal:n}));
}
for(const n of [1,2,3]){const d=A.byId('task_'+n);check(d.key+' keeps its existing daily condition and text',metadata(d)===metadata(old.byId(d.key))&&A.test(d,{taskDone:n})&&!A.test(d,{taskDone:n-1,taskCompletedTotal:100}));}
for(const key of ['egg_task_full','egg_full_house']){const d=A.byId(key);check(key+' still depends on the same daily completion condition',metadata(d)===metadata(old.byId(key))&&A.test(d,{taskDone:3,taskTotal:3})&&!A.test(d,{taskDone:0,taskTotal:3,taskCompletedTotal:100}));}
const paid=engine(fs.readFileSync(root+'/core/csh_achv.js','utf8'),{task_15:1}),paidRow=paid.evalAll({taskDone:0,taskCompletedTotal:0}).find(d=>d.key==='task_15');
check('old claimed task_15 stays claimed under its original ID and reward',paid.claimed('task_15')&&paidRow.claimed&&paidRow.reward===old.byId('task_15').reward);
const saved=A.evalAll({taskDone:0,taskCompletedTotal:0,careerUnlocks:{v:1,baseline:true,entries:{task_12:{observedAt:0}}}}).find(d=>d.key==='task_12');check('old permanent qualification and its unknown historical date survive',saved.done&&saved.recorded&&saved.observedAt===0);
check('zero-source anti-fake engine self-test still passes',A.selfTest().ok,A.selfTest());
const result={scope:'Actual original and current career engine; no wallet counter, migration, UI or natural-play coverage inferred',passed:rows.filter(r=>r.passed).length,failed:rows.filter(r=>!r.passed).length,checks:rows};fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,failed:result.failed,failures:rows.filter(r=>!r.passed)},null,2));process.exitCode=result.failed?1:0;
