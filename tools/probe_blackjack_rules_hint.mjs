// Actual strategy/action/render functions in isolated VM, no host/player storage.
import fs from'node:fs';import path from'node:path';import vm from'node:vm';import{fileURLToPath,pathToFileURL}from'node:url';
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1];},root=arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')),source=arg('--source',root),out=arg('--out');
if(!out||path.resolve(out).toLowerCase().startsWith(path.resolve(root).toLowerCase()+path.sep))throw Error('Use external --out');
const {parse,walk}=await import(pathToFileURL(path.join(root,'tools/lib/skill_audit.mjs')).href);
const text=fs.readFileSync(source+'/games/blackjack/blackjack.html','utf8').match(/<script>\s*([\s\S]*?)<\/script>/)[1],c=vm.createContext({}),rows=[];
walk(parse(text),n=>{if(n.type==='FunctionDeclaration'&&['cardRank','bjValue','bjPairValue','bjBasic','canDoubleNow','canSplitNow','setAct','renderActions','renderHint','bjDealerPlay'].includes(n.id.name))vm.runInContext(text.slice(...n.range),c);});
const check=(name,ok,detail)=>rows.push({name,passed:!!ok,...(!ok?{detail}:{})}),card=(rank,suit=0)=>(rank<<2)|suit;
const controls=new Map();function el(sel){if(sel==='#dock-note')return null;if(!controls.has(sel)){const classes=new Set();controls.set(sel,{disabled:false,innerHTML:'',classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x),contains:x=>classes.has(x)}});}return controls.get(sel);}
c.$=el;c.ACT_NAME={hit:'要牌',stand:'停牌',double:'加倍',split:'分牌',surrender:'投降'};c.set={hintOn:true};
for(const tier of [{decks:8,h17:true},{decks:6,h17:false},{decks:4,h17:false}]){
 for(const canDouble of [false,true])for(const canSplit of [false,true])for(const surrender of [false,true]){
  c.state={tier};const a=c.bjBasic([card(6),card(6,1)],card(2),canDouble,canSplit,surrender);
  check('NDAS six pair versus two hits '+tier.decks+' flags '+[canDouble,canSplit,surrender],a==='hit',a);
 }
 for(const up of [3,4,5,6])check('six pair versus '+up+' retains split '+tier.decks,c.bjBasic([card(6),card(6,1)],card(up),true,true,true)==='split');
 for(const up of [7,8,9,10,14])check('six pair versus '+up+' retains hit '+tier.decks,c.bjBasic([card(6),card(6,1)],card(up),true,true,true)==='hit');
 c.state={tier};let draws=0;const dealer=[card(14),card(6)];c.bjDealerPlay(dealer,()=>{draws++;return card(2);});check('actual '+tier.decks+' deck dealer soft17 rule unchanged',draws===(tier.h17?1:0),{draws,dealer});
}
for(const phase of ['play','dealer','over'])for(const split of [false,true])for(const chips of [0,1000]){
 c.state={phase,tier:{h17:false},chips,activeHand:0,hands:[{cards:[card(6),card(6,1)],wager:100,fromSplit:split,done:phase==='over'}],dealer:[card(2)]};if(split)c.state.hands.push({cards:[card(7),card(6)],wager:100,fromSplit:true,done:true});
 c.renderActions();c.renderHint();const playable=phase==='play';
 check('actual action/hint state '+[phase,split,chips],el('#btn-hit').disabled!==playable&&(playable?el('#hint').innerHTML.includes('要牌')&&!el('#hint').classList.contains('hidden'):el('#hint').classList.contains('hidden')));
 check('NDAS actual double guard '+[phase,split,chips],el('#btn-double').disabled===(!playable||split||chips===0));
 check('actual surrender button only unsplit two-card hand '+[phase,split,chips],el('#btn-surrender').disabled===(!playable||split));
}
let legal=0;for(const tier of [{decks:8,h17:true},{decks:6,h17:false},{decks:4,h17:false}])for(const rank of [2,3,4,5,6,7,8,9,10,11,12,13,14])for(const up of [2,3,4,5,6,7,8,9,10,14])for(const split of [false,true])for(const chips of [0,1000]){
 c.state={phase:'play',tier,chips,activeHand:0,hands:[{cards:[card(rank),card(rank,1)],wager:100,fromSplit:split,done:false}],dealer:[card(up)]};if(split)c.state.hands.push({cards:[card(2),card(7)],wager:100,fromSplit:true,done:true});c.renderActions();const a=c.bjBasic(c.state.hands[0].cards,c.state.dealer[0],c.lastCan.canDouble,c.lastCan.canSplit,c.lastCan.canSurr);check('recommendation is an enabled actual button '+(++legal),!!controls.get('#btn-'+a)&&!el('#btn-'+a).disabled,{tier,rank,up,split,chips,action:a});
}
for(const up of [9,10,14])check('surrender-disabled hard16 never recommends surrender '+up,c.bjBasic([card(10),card(6)],card(up),false,false,false)!=='surrender');
const result={scope:'Real blackjack strategy/action/render functions; base NDAS six-pair advice and action legality, not custom multiplier optimum or natural host match',passed:rows.filter(x=>x.passed).length,failed:rows.filter(x=>!x.passed).length,legalButtonCases:legal,rows};fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,failed:result.failed,legalButtonCases:legal,failures:rows.filter(x=>!x.passed)},null,2));if(result.failed)process.exitCode=1;
