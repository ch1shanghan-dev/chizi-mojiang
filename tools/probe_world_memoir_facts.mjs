// Read-only memoir projection: real world settlements plus explicit hostile/legacy snapshots.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {root,parse,walk} from './lib/skill_audit.mjs';
const at=process.argv.indexOf('--out');if(at<0)throw Error('External --out required');const out=path.resolve(process.argv[at+1]);if(process.platform==='win32'&&/^c:/i.test(out))throw Error('No C: test output');
const prefix=fs.readFileSync(root+'/tools/probe_world_lifecycle.mjs','utf8').split('const tests=[];')[0].replace(/^import .*;\r?\n/gm,'');const outer=vm.createContext({fs,path,vm,root,parse,walk,process,console});vm.runInContext(prefix+'\nthis.makeWorld=harness;',outer);
const source=fs.readFileSync(root+'/core/csh_world_view.js','utf8'),checks=[];
function make(){const h=outer.makeWorld();vm.runInContext(source,h.ctx);h.view=h.ctx.window.CSHWorldView;return h;}
function check(name,fn){try{const value=fn();checks.push({name,passed:value===true,...(value===true?{}:{detail:value})});}catch(e){checks.push({name,passed:false,detail:e.stack||e.message});}}
const clone=v=>JSON.parse(JSON.stringify(v)),today=(()=>{const d=new Date();return Math.floor((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-Date.UTC(2026,0,1))/86400000)})();
function fixture(patch={},history=[]){const h=make(),raw=h.W.raw(),a=raw.ai[0];Object.assign(a,patch);raw.history=history.map(e=>({...e,n:e.n??a.name}));return {h,raw,a,read:()=>h.view.memoryOf({...h.W,raw:()=>clone(raw)},a.id)};}
{
 const h=make(),before=JSON.stringify(h.W.raw()),writes=h.writes.length,id=h.W.list()[0].id,all=h.view.memoryOf(h.W),individual=h.view.memoryOf(h.W,id);
 check('no personal history yields empty library instead of borrowed world activity',()=>all.person===null&&all.choices.length===0);
 check('selected unfamiliar real person has no invented milestones',()=>individual.person.id===id&&individual.facts.hands===0&&individual.fragments.length===0&&individual.text.includes('还未同桌'));
 check('reading default and selected memoir never writes world or changes facts',()=>writes===h.writes.length&&JSON.stringify(h.W.raw())===before);
 check('unknown and prototype-like IDs never select another person',()=>h.view.memoryOf(h.W,'missing').person===null&&h.view.memoryOf(h.W,'__proto__').person===null);
}
{
 const h=make(),id=h.W.list()[0].id;h.W.settleWin(id,1000);h.W.settleLose(id,500);h.W.settleResult(id,null);for(let i=0;i<7;i++)h.W.settleResult(id,false);const before=JSON.stringify(h.W.raw()),writes=h.writes.length,m=h.view.memoryOf(h.W,id);
 check('real opposing settlements maintain player perspective',()=>m.facts.hands===10&&m.facts.wins===8&&m.facts.losses===1&&m.facts.draws===1&&m.facts.unknown===0);
 check('actual reverse win creates one dated personal revenge fragment',()=>m.facts.revenge&&m.fragments.filter(r=>r.key==='revenge'&&r.date).length===1);
 check('actual tenth meeting creates dated familiar milestone',()=>m.fragments.filter(r=>r.key==='oldfriend-10'&&r.date).length===1);
 check('first encounter does not receive a made-up date',()=>m.fragments.find(r=>r.key==='first')?.date===undefined);
 check('reading completed memoir preserves money history and all counters',()=>before===JSON.stringify(h.W.raw())&&writes===h.writes.length);
}
{
 const f=fixture({hands:9000,wins:8000,withPlayer:{hands:0,wins:0,losses:0,draws:0}},[{kind:'oldfriend',c:10,day:today},{kind:'playerrevenge',day:today}]),m=f.read();
 check('autonomous AI thousands of hands cannot create player meetings',()=>m.facts.hands===0&&m.fragments.length===0);
}
{
 const f=fixture({withPlayer:{hands:150,wins:80,losses:50,draws:20,revenge:true}}),m=f.read();
 check('legacy reliable cumulative facts retain all three familiarity stages',()=>[10,40,150].every(n=>m.fragments.some(r=>r.key==='oldfriend-'+n)));
 check('lost history leaves truthful undated fragments and never fabricates today',()=>m.fragments.length===5&&m.fragments.every(r=>!r.date)&&m.facts.revenge);
}
for(const kind of ['rival','pot','streak','retire','comeback','tierdown','grudge']){
 const f=fixture({withPlayer:{hands:10,wins:5,losses:5,draws:0,revenge:true}},[{kind,c:10,day:today}]);check('world event never becomes dated player recollection: '+kind,()=>f.read().fragments.every(r=>!r.date));
}
for(const day of [undefined,null,'0',.5,-1,today+1,Number.MAX_SAFE_INTEGER]){
 const f=fixture({withPlayer:{hands:10,wins:1,losses:0,draws:0}},[{kind:'oldfriend',c:10,day}]);check('invalid missing or future day remains unknown: '+String(day),()=>f.read().fragments.every(r=>!r.date));
}
{
 const f=fixture({withPlayer:{hands:10,wins:1,losses:0,draws:0}},[{kind:'oldfriend',c:10,day:0}]);check('valid calendar epoch day zero is preserved as January first',()=>f.read().fragments.find(r=>r.key==='oldfriend-10')?.date==='2026-01-01');
 f.raw.history.push({...f.raw.history[0]},{...f.raw.history[0],day:1});check('duplicate milestone events produce only one fragment with first retained date',()=>f.read().fragments.filter(r=>r.key==='oldfriend-10').length===1&&f.read().fragments.find(r=>r.key==='oldfriend-10').date==='2026-01-01');
 f.raw.ai[1].name=f.a.name;check('ambiguous legacy names do not attach dates to a particular person',()=>f.read().fragments.every(r=>!r.date));
}
{
 const f=fixture({withPlayer:{hands:10,wins:5,losses:5,draws:0,revenge:false}},[{kind:'playerrevenge',day:today},{kind:'oldfriend',c:40,day:today}]),m=f.read();
 check('mutual wins alone cannot invent sequence or accept unsupported revenge event',()=>!m.facts.revenge&&m.fragments.some(r=>r.key==='balanced')&&!m.fragments.some(r=>r.key==='revenge'));
 check('unsupported higher threshold event cannot invent a reached milestone',()=>!m.fragments.some(r=>r.key==='oldfriend-40')&&m.fragments.every(r=>!r.date));
 f.raw.history=[{kind:'oldfriend',n:'another person',c:10,day:today}];check('another persons personal event is never attributed by kind alone',()=>f.read().fragments.every(r=>!r.date));
}
{
 const f=fixture({withPlayer:{hands:3,wins:0,losses:0,draws:0}}),m=f.read();check('unresolved encounters remain neither wins losses nor draws',()=>m.facts.unknown===3&&m.facts.draws===0&&m.text.includes('未分的胜负'));
 f.a.withPlayer={hands:3,wins:0,losses:0,draws:3};check('draw-only meetings are described without attributing an advantage',()=>f.read().text.includes('胜负都留给')&&!f.read().text.includes('上风'));
 f.a.withPlayer={hands:3,wins:0,losses:9,draws:9,revenge:true};check('overfull legacy outcomes stay bounded by meetings and cannot invent revenge',()=>f.read().facts.losses===3&&f.read().facts.draws===0&&f.read().facts.unknown===0&&!f.read().facts.revenge);
 f.a.withPlayer={hands:-1,wins:NaN,losses:1.5,draws:0};check('malformed counts do not fabricate positive personal milestones',()=>f.read().facts.hands===0&&f.read().fragments.length===0);
}
{
 const f=fixture({retired:true,fund:0,withPlayer:{hands:40,wins:20,losses:20,draws:0}}),m=f.read();check('known retired person remains in library but cannot be invited',()=>m.person.id===f.a.id&&!m.person.available&&m.choices.some(r=>r.id===f.a.id));
 const before=JSON.stringify(f.raw);f.read();check('retired memoir does not revive or fund a person',()=>JSON.stringify(f.raw)===before&&f.a.retired&&f.a.fund===0);
}
{
 const h=make();let error=false;try{h.view.memoryOf({...h.W,raw:()=>{throw Error('read unavailable')}},null)}catch{error=true}check('unavailable source propagates as failure instead of an empty successful memoir',()=>error);
 error=false;try{h.view.memoryOf({...h.W,raw:()=>({ai:null})},null)}catch{error=true}check('malformed roster propagates as failure instead of fabricated zero stats',()=>error);
}
const failed=checks.filter(r=>!r.passed),result={scope:'Real isolated world/character and readonly memoir source; actual API settlements plus explicitly crafted hostile/legacy snapshots. No complete host or natural lifetime claim.',passed:checks.length-failed.length,failed:failed.length,checks};fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:result.passed,failed:result.failed,failures:failed},null,2));process.exitCode=failed.length?1:0;
