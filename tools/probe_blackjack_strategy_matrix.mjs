// Independent published NDAS baseline tables against real hint/action functions.
// Total-dependent basic advice only; no custom streak/funding EV optimum claim.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1];};
const root=arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const source=arg('--source',root),out=arg('--out');
if(!out||path.resolve(out).toLowerCase().startsWith(path.resolve(root).toLowerCase()+path.sep))throw Error('External --out required');
const {parse,walk}=await import(pathToFileURL(path.join(root,'tools/lib/skill_audit.mjs')).href);
const script=fs.readFileSync(path.join(source,'games/blackjack/blackjack.html'),'utf8').match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const c=vm.createContext({});
walk(parse(script),n=>{if(n.type==='FunctionDeclaration'&&['cardRank','bjValue','bjPairValue','bjBasic','canDoubleNow','canSplitNow','setAct','renderActions','renderHint'].includes(n.id.name))vm.runInContext(script.slice(...n.range),c);});
// Published author reference: https://wizardofodds.com/games/blackjack/strategy/4-decks/
// Columns 2,3,4,5,6,7,8,9,T,A. P=split, R=surrender, D=double.
// The text explicitly defines NDAS pair exceptions and all four H17 adjustments.
const hard={4:'HHHHHHHHHH',5:'HHHHHHHHHH',6:'HHHHHHHHHH',7:'HHHHHHHHHH',8:'HHHHHHHHHH',9:'HDDDDHHHHH',10:'DDDDDDDDHH',11:'DDDDDDDDDH',12:'HHSSSHHHHH',13:'SSSSSHHHHH',14:'SSSSSHHHHH',15:'SSSSSHHHRH',16:'SSSSSHHRRR',17:'SSSSSSSSSS',18:'SSSSSSSSSS',19:'SSSSSSSSSS',20:'SSSSSSSSSS',21:'SSSSSSSSSS'};
const soft={12:'HHHHHHHHHH',13:'HHHDDHHHHH',14:'HHHDDHHHHH',15:'HHDDDHHHHH',16:'HHDDDHHHHH',17:'HDDDDHHHHH',18:'SDDDDSSHHH',19:'SSSSSSSSSS',20:'SSSSSSSSSS',21:'SSSSSSSSSS'};
const pairs={2:'HHPPPPHHHH',3:'HHPPPPHHHH',4:'HHHHHHHHHH',5:'DDDDDDDDHH',6:'HPPPPHHHHH',7:'PPPPPPHHHH',8:'PPPPPPPPPP',9:'PPPPPSPPSS',10:'SSSSSSSSSS',14:'PPPPPPPPPP'};
const action={H:'hit',S:'stand',D:'double',P:'split',R:'surrender'};
function expected(ranks,up,tier,flags){
 const values=ranks.map(r=>r===14?1:Math.min(10,r)),sum=values.reduce((a,b)=>a+b,0),isSoft=ranks.includes(14)&&sum<=11,total=sum+(isSoft?10:0),column=up===14?9:Math.min(10,up)-2;
 const pair=ranks.length===2&&values[0]===values[1],pv=ranks[0]===14?14:values[0];
 let row=pair&&flags.split?pairs[pv]:(isSoft?soft[total]:hard[total]);
 if(!row)throw Error('Oracle fixture outside valid nonbust totals');
 let a=row[column];
 if(tier.h17){
  if(pair&&flags.split&&pv===8&&up===14&&flags.surrender)a='R';
  if(!(pair&&flags.split)&&!isSoft&&total===15&&up===14)a='R';
  if(!isSoft&&total===17&&up===14)a='R';
  if(!isSoft&&total===11&&up===14)a='D';
  if(isSoft&&total===18&&up===2)a='D';
  if(isSoft&&total===19&&up===6)a='D';
 }
 if(a==='R'&&!flags.surrender)a=total===17?'S':'H';
 if(a==='D'&&!flags.double)a=isSoft&&total>=18?'S':'H';
 return action[a];
}
const classes=()=>{const v=new Set();return {add:x=>v.add(x),remove:x=>v.delete(x),toggle:(x,on)=>on?v.add(x):v.delete(x),contains:x=>v.has(x)};};
const controls=new Map(),el=sel=>{if(sel==='#dock-note')return null;if(!controls.has(sel))controls.set(sel,{disabled:false,innerHTML:'',classList:classes()});return controls.get(sel);};
c.$=el;c.ACT_NAME={hit:'要牌',stand:'停牌',double:'加倍',split:'分牌',surrender:'投降'};c.set={hintOn:true};
let passed=0,failed=0;const failures=[],groups={};
function check(group,name,ok,detail){const bucket=groups[group]||(groups[group]={passed:0,failed:0});if(ok){passed++;bucket.passed++;}else{failed++;bucket.failed++;failures.push({group,name,...detail});}}
const card=(r,suit=0)=>(r<<2)|suit;
const tiers=[{decks:8,h17:true},{decks:6,h17:false},{decks:4,h17:false}],ups=[2,3,4,5,6,7,8,9,10,14];
for(const tier of tiers)for(let first=2;first<=14;first++)for(let second=first;second<=14;second++)for(const up of ups){
 const ranks=[first,second],cards=[card(first),card(second,1)],canSplit=Math.min(10,first===14?1:first)===Math.min(10,second===14?1:second);
 for(const double of [false,true])for(const split of canSplit?[false,true]:[false])for(const surrender of [false,true]){
  const flags={double,split,surrender},want=expected(ranks,up,tier,flags),actual=c.bjBasic(cards,card(up),double,split,surrender,tier);
  check('baseline-table','base '+JSON.stringify({tier,ranks,up,flags}),actual===want,{actual,expected:want});
 }
 for(const fromSplit of [false,true])for(const chips of [0,1000]){
  c.state={phase:'play',tier,chips,activeHand:0,hands:[{cards,wager:100,fromSplit,done:false}],dealer:[card(up)]};
  if(fromSplit)c.state.hands.push({cards:[card(2),card(7)],wager:100,fromSplit:true,done:true});
  c.renderActions();c.renderHint();
  const flags={double:c.lastCan.canDouble,split:c.lastCan.canSplit,surrender:c.lastCan.canSurr},want=expected(ranks,up,tier,flags),markup=el('#hint').innerHTML;
  check('actual-render','render '+JSON.stringify({tier,ranks,up,fromSplit,chips}),markup.includes('<b>'+c.ACT_NAME[want]+'</b>')&&!el('#hint').classList.contains('hidden')&&!el('#btn-'+want).disabled,{expected:want,markup,flags});
 }
}
for(const tier of tiers)for(const ranks of [[2,3,6],[2,4,5],[14,2,4],[14,2,5],[14,2,6],[2,5,8],[3,6,8],[14,14,5]])for(const up of ups){
 c.state={phase:'play',tier,chips:1000,activeHand:0,hands:[{cards:ranks.map(card),wager:100,fromSplit:false,done:false}],dealer:[card(up)]};
 c.renderActions();c.renderHint();const want=expected(ranks,up,tier,{double:false,split:false,surrender:false});
 check('three-card-fallback','three '+JSON.stringify({tier,ranks,up}),!c.lastCan.canDouble&&!c.lastCan.canSplit&&!c.lastCan.canSurr&&el('#hint').innerHTML.includes('<b>'+c.ACT_NAME[want]+'</b>'),{expected:want,markup:el('#hint').innerHTML});
}
for(const phase of ['deal','insurance','dealer','settle','over']){c.state.phase=phase;c.renderActions();c.renderHint();check('inactive-hint','hide hint during '+phase,el('#hint').classList.contains('hidden'),{});}
const result={scope:'Independent total-dependent 4–8-deck NDAS/S17/H17 published baseline; real action/hint functions. Not a custom streak/funding/composition optimal solver or physical-device test.',sources:['https://wizardofodds.com/games/blackjack/strategy/4-decks/','https://wizardofodds.com/games/blackjack/appendix/9/4ds17r4/','https://wizardofodds.com/games/blackjack/appendix/9/6ds17r4/','https://wizardofodds.com/games/blackjack/appendix/9/8dh17r4/'],passed,failed,groups,failures};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({passed,failed,groups,failures:failures.slice(0,20)},null,2));if(failed)process.exitCode=1;
