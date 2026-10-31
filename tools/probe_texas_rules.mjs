import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {parse,walk}=await import(pathToFileURL(root+'/tools/lib/skill_audit.mjs'));
const arg=(key,def)=>{let i=process.argv.indexOf(key);return i<0?def:process.argv[i+1];};
if(!arg('--out',null))throw Error('Use an external --out JSON path');
const sourceRoot=arg('--source',root),html=fs.readFileSync(sourceRoot+'/games/texas/texas.html','utf8'),source=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
let seed=20261028;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},math=Object.create(Math);math.random=random;
const noop=()=>{},c=vm.createContext({Math:math,console:{log:noop},window:{},sfx:{fold:noop,check:noop,chip:noop,raise:noop,deal:noop,flip:noop},sfxPlay:noop,SFX:null,CRD:null,quippedGreet:true,worldSeats:null,eqDirty:false,_eqA:Array(7),_eqB:Array(7),_eqRem:[],HE_COMBOS:null,HE_RANK_NAME:null});
vm.runInContext(fs.readFileSync(root+'/core/csh_pots.js','utf8'),c);
vm.runInContext(fs.readFileSync(root+'/core/csh_registry.js','utf8'),c);c.CSH=c.window.CSH;
vm.runInContext(fs.readFileSync(root+'/core/csh_texas_ai.js','utf8'),c);
walk(parse(source),n=>{if(n.type==='FunctionDeclaration')vm.runInContext(source.slice(...n.range),c);if(n.type==='VariableDeclaration'&&n.declarations.some(d=>['PERSONAS','PACING'].includes(d.id.name)))vm.runInContext(source.slice(...n.range),c);});
const originalSchedule=c.scheduleAI;
for(const k of ['render','scheduleAI','recordHuman','announceAction','logErr'])c[k]=noop;
c.later=f=>f();c.endSession=()=>{c.G.sessionOver=true;};c.endHandByFold=()=>{c.G.over=true;c.settleHand();};c.showdown=()=>{c.G.over=true;c.settleHand();};c.initEval();
// Compile the unchanged evaluator/equity bodies in one native realm to avoid millions of VM proxy crossings.
const nativeP=Function('var window={};'+fs.readFileSync(root+'/core/csh_pots.js','utf8')+';return window.CSHPots;')();
const nativeDeck=Function('return ('+c.newDeck.toString()+')')();
c.equity=Function('newDeck','heBestN','Math','var _eqA=Array(7),_eqB=Array(7),_eqRem=[];return ('+c.equity.toString()+');')(nativeDeck,cards=>nativeP.heBest7(cards),math);
const rows=[],check=(name,ok,detail)=>rows.push({name,passed:!!ok,...(!ok?{detail}: {})});
function table(chips=[1000,1000,1000,1000],dealer=0){c.G={sessionId:'sim',handNo:0,buyIn:1000,n:chips.length,dealer,pacing:{every:20},players:chips.map((v,i)=>({id:i,isHuman:i===0,name:'P'+i,chips:v,out:v<=0,bet:0,contrib:0,folded:false,allin:false,acted:false,hole:[],persona:['tag','loose','bluff'][i%3],skill:.75})),rake:{rateBps:100,cap:null,noFlopNoDrop:true},community:[],pot:0,currentBet:0,minRaise:20,bb:20,sb:10,street:'pre',over:false,sessionOver:false,toAct:0,review:[]};return c.G;}
let g=table([1000,0,1000,0],0);c.startHand();check('eliminated seats skipped, heads-up dealer posts small blind',g.players[0].bet===10&&g.players[2].bet===20&&g.toAct===0,g.players);
g=table();g.handNo=20;c.applyBlinds();check('first 20 hands retain initial blind level',g.bb===20);g.handNo=21;c.applyBlinds();check('hand 21 raises blind level',g.bb===40);
g=table();g.currentBet=100;g.minRaise=100;g.toAct=1;g.players[0].bet=100;g.players[0].acted=true;g.players[0].actionAt=100;g.players[1].chips=150;
let advance=c.advance;c.advance=noop;c.applyAction(1,'allin');check('short all-in does not reopen prior bettor',g.currentBet===150&&g.minRaise===100&&!c.canPlayerRaise(g.players[0]));check('unacted player can raise short all-in',c.canPlayerRaise(g.players[2]));
const before=g.players[0].chips;c.G.toAct=0;c.applyAction(0,'raise',300);check('illegal reopening cannot move chips',g.players[0].chips===before);
g.toAct=2;g.players[2].chips=200;c.applyAction(2,'allin');check('cumulative short all-ins reopen at a full increment',g.currentBet===200&&c.canPlayerRaise(g.players[0]));
g=table();g.players[0].hole=[56,57];g.opStats={hands:1,vpip:0,raises:0};g.toAct=1;c.applyAction(0,'raise',50);check('out-of-turn request does not count as a hand or raise',g.opStats.hands===1&&g.opStats.vpip===0&&g.opStats.raises===0);
g.toAct=0;c.applyAction(0,'raise',40);g.toAct=0;g.currentBet=80;c.applyAction(0,'call');check('repeat preflop decisions count VPIP and PFR once per hand',g.opStats.hands===1&&g.opStats.vpip===1&&g.opStats.raises===1,g.opStats);
g=table([1000,0,10]);g.players[0].bet=10;g.players[0].acted=false;g.players[2].bet=5;g.players[2].allin=true;check('lone player who has covered all opponents finishes the round',c.roundDone());check('cannot raise against only all-in opponents',!c.canPlayerRaise(g.players[0]));
c.advance=advance;
const originalDecide=c.aiDecide,originalLater=c.later,originalApply=c.applyAction;let queued=[],decisions=0;
c.later=f=>queued.push(f);c.aiDecide=()=>{decisions++;return {act:'fold'};};c.applyAction=noop;c.rndMs=()=>1;
g=table();g.toAct=1;originalSchedule();g.handNo++;queued.shift()();check('AI callback from prior hand is ignored',decisions===0);
g=table();g.toAct=1;originalSchedule();const stale=queued.shift();g=table();g.toAct=1;stale();check('AI callback from prior session is ignored',decisions===0);
originalSchedule();originalSchedule();queued.shift()();queued.shift()();check('duplicate scheduled AI callback only decides once',decisions===1);
c.aiDecide=originalDecide;c.later=originalLater;c.applyAction=originalApply;
// Ante accounting and hidden-information boundary use the actual page, registry, policy and ledger.
const registry=c.CSH.registry,fees=registry.texasRake();
check('new default has 10% BB ante and 0.5% postflop rake',fees.rateBps===50&&fees.anteBbBps===1000&&registry.texasAnte(fees,20)===2);
check('legacy descriptors keep no ante',registry.texasAnte({rateBps:100},20)===0);
check('explicit old user rake preference preserved',registry.texasRake('100').rateBps===100&&registry.texasRake('0').rateBps===0);
g=table([1000,1000,1000]);g.rake=fees;c.startHand();check('ante moves table chips to pot without reducing street obligations',g.pot===36&&g.players.every(p=>p.antePaid===2)&&g.players[1].bet===10&&g.players[2].bet===20);
const savedAdvance=c.advance;c.advance=noop;g.toAct=0;c.applyAction(0,'fold');g.toAct=1;c.applyAction(1,'fold');c.endHandByFold();check('preflop fold keeps antes in prize and collects no postflop rake',g.ledger.conservation==='PASS'&&g.ledger.systemCollected===0&&g.ledger.ledger[0].antePaid===2&&g.ledger.ledger[0].net===-2,g.ledger.ledger);
c.advance=savedAdvance;
g=table([1,1,1]);g.rake=fees;c.startHand();check('ante-only all-ins are dealt cards and settled',g.over&&g.community.length===5&&g.ledger.conservation==='PASS'&&g.players.every(p=>p.hole.length===2));
g=table([1000,1000,1000]);g.rake=fees;c.startHand();g.players[1].contrib=5000;g.players[2].contrib=5000;g.players[0].chips=10;g.currentBet=5000;
let o=c.aiObservation(0);check('short stack odds exclude inaccessible side pots',o.contestablePot===26&&o.toCall===5000&&o.chips===10,o);
Object.defineProperty(g.players[1],'hole',{get(){throw Error('opponent hidden cards read');}});Object.defineProperty(g,'deck',{get(){throw Error('undealt deck read');}});
let secretSafe=true;try{o=c.aiObservation(0);c.window.CSHTexasAI.decide(o,()=>.5);}catch{secretSafe=false;}check('policy observation never reads other hole cards or deck',secretSafe);
check('observation has no players or deck object',!('players'in o)&&!('deck'in o)&&!('G'in o));
const policy=c.window.CSHTexasAI,base={hole:[56,57],board:[8,16,24],strength:.9,equity:.95,opponents:1,pot:200,contestablePot:200,toCall:20,chips:1000,bb:20,currentBet:40,minTo:60,maxTo:1020,canRaise:false,latePosition:true,persona:'tag',skill:.95,difficulty:'expert'};
check('policy obeys locked raising rights even with strong hand',policy.decide(base,()=>.5).act==='call');
check('cheap all-in call does not apply old arbitrary fold veto',policy.decide({...base,chips:5,toCall:200,equity:.5},()=>.5).act==='call');
check('weak expensive hand folds',policy.decide({...base,equity:.03,toCall:900,contestablePot:1000},()=>.99).act==='fold');
check('ante minimum is one chip and disabled for legacy',registry.texasAnte(fees,1)===1&&registry.texasAnte({},20)===0);
for(const bad of [-1,1.5,NaN,999]){let rejected=false;try{nativeP.settle({players:[{id:0,contrib:10,antePaid:bad},{id:1,contrib:10}],stacks:{0:20,1:20},community:[]});}catch{rejected=true;}check('invalid ante rejected '+bad,rejected);}
const legacyHand={roundId:'legacy',players:[{id:0,contrib:100,hole:[56,57]},{id:1,contrib:100,folded:true,hole:[40,41]}],community:[],stacks:{0:1000,1:1000},rake:{rateBps:100,cap:null,noFlopNoDrop:true}};
const legacyResult=nativeP.settle(legacyHand);check('legacy preflop replay has no invented ante or fee',legacyResult.ledger.every(p=>p.antePaid===0)&&legacyResult.systemCollected===0&&legacyResult.ledger[0].net===100&&legacyResult.conservation==='PASS');
let fuzzBad=0;for(let k=0;k<500;k++){const v={...base,equity:random(),strength:random(),chips:1+Math.floor(random()*1000),toCall:Math.floor(random()*1500),canRaise:k%2===0,persona:['tag','loose','bluff'][k%3],difficulty:['friendly','standard','expert'][k%3]};v.maxTo=v.chips+20;v.minTo=60;const action=policy.decide(v,random);if(action.act==='raise'&&(!v.canRaise||action.amount>v.maxTo||action.amount<Math.min(v.maxTo,v.minTo)))fuzzBad++;}check('500 policy samples obey raise rights and stack limits',fuzzBad===0,fuzzBad);
const count=Number(arg('--hands',0)),stats=[],samples=[],clock=()=>performance.now();
const definitions=process.argv.includes('--compare')?[['A',{rateBps:100,cap:null,noFlopNoDrop:true}],['B',{modelVersion:2,anteBbBps:1000,rateBps:50,cap:null,noFlopNoDrop:true}],['C',{modelVersion:2,anteBbBps:2000,rateBps:50,cap:null,noFlopNoDrop:true}]]:[['current',fees]];
function bucket(){return {hands:0,actions:0,vpip:0,pfr:0,fold:0,call:0,raise:0,check:0,actualAllins:0,bluffs:0,positiveHands:0,net:0};}
for(const [model,fee]of definitions){
 g=null; seed=20261028;let total={model,hands:count,actions:0,preflopEnds:0,timeouts:0,illegalActions:0,conservationFailures:0,systemCollected:0,anteCommitted:0,sessions:0,completedSessions:0,sessionHandLimit:0,seat0Busts:0,seat0PositiveSessions:0,maxActions:0,elapsedMs:0,byStyle:{},bySkill:{},strength:{weak:{n:0,wins:0},strong:{n:0,wins:0}},maxDecisionMs:0};let sessionStart=[],sessionHands=0,sessionSequence=0;const began=Date.now();
 for(let h=0;h<count;h++){
  if(!g||g.players.filter(p=>p.chips>0).length<2||sessionHands>=100){
   if(sessionHands){if(sessionHands>=100)total.sessionHandLimit++;else total.completedSessions++;if(g.players[0].chips<=0)total.seat0Busts++;if(g.players[0].chips>sessionStart[0])total.seat0PositiveSessions++;}
   const n=2+Math.floor(random()*5),chips=Array.from({length:n},()=>50+Math.floor(random()*1951));g=table(chips,Math.floor(random()*n));g.sessionId=model+'-'+sessionSequence++;g.rake=fee;g.players.forEach((p,i)=>{p.skill=[.55,.75,.95][i%3];});sessionStart=chips;sessionHands=0;total.sessions++;
  }
  c.startHand();sessionHands++;let actions=0;const seen=new Map(),played=g.players.filter(p=>!p.out),powers=new Map(played.map(p=>[p.id,c.preflopScore(...p.hole)]));
  for(const p of played){seen.set(p.id,{vpip:false,pfr:false});(total.byStyle[p.persona]||(total.byStyle[p.persona]=bucket())).hands++;(total.bySkill[String(p.skill)]||(total.bySkill[String(p.skill)]=bucket())).hands++;}
  while(!g.over&&!g.sessionOver&&actions<300){
   const idx=g.toAct,p=g.players[idx];if(!p||p.folded||p.allin||p.out){total.timeouts++;break;}
   const mark=clock(),d=c.aiDecide(idx);const ms=clock()-mark;if(samples.length<20000)samples.push(ms);total.maxDecisionMs=Math.max(total.maxDecisionMs,ms);
   const pre=g.community.length===0,oldBet=g.currentBet,beforeChips=p.chips,prior=g.toAct;const bs=[total.byStyle[p.persona],total.bySkill[String(p.skill)]];
   var observed = null, advanceAfterPayment = c.advance;
   c.advance = function () { observed = { chips: p.chips, bet: p.bet }; advanceAfterPayment(); };
   c.applyAction(idx,d.act,d.amount);c.advance=advanceAfterPayment;actions++;total.actions++;
   if (!observed) { total.illegalActions++; break; }
   const raised=(d.act==='raise'||d.act==='allin')&&observed.bet>oldBet;
   for(const b of bs){b.actions++;b[d.act]=(b[d.act]||0)+1;if(beforeChips>0&&observed.chips===0)b.actualAllins++;if(d.bluff)b.bluffs++;}
   if(pre&&beforeChips>observed.chips){seen.get(idx).vpip=true;if(raised)seen.get(idx).pfr=true;}
  }
  if(actions>=300)total.timeouts++;if(g.community.length===0)total.preflopEnds++;if(!g.ledger||g.ledger.conservation!=='PASS')total.conservationFailures++;
  total.maxActions=Math.max(total.maxActions,actions);total.systemCollected+=g.ledger?.systemCollected||0;
  for(const p of played){const net=g.ledger?.ledger.find(x=>x.id===p.id)?.net||0,state=seen.get(p.id);total.anteCommitted+=p.antePaid||0;for(const b of [total.byStyle[p.persona],total.bySkill[String(p.skill)]]){if(state.vpip)b.vpip++;if(state.pfr)b.pfr++;if(net>0)b.positiveHands++;b.net+=net;}const power=powers.get(p.id);if(power<.35){total.strength.weak.n++;if(net>0)total.strength.weak.wins++;}if(power>=.65){total.strength.strong.n++;if(net>0)total.strength.strong.wins++;}}
  if(h%1000===999)fs.writeFileSync(arg('--out',null)+'.progress.json',JSON.stringify({model,completed:h+1,elapsedMs:Date.now()-began}));
 }
 total.elapsedMs=Date.now()-began;stats.push(total);if(count)check(model+' continuous hands terminate, obey actions and conserve',!total.timeouts&&!total.illegalActions&&!total.conservationFailures,total);
 g=null;
}
samples.sort((a,b)=>a-b);const timing={sampled:samples.length,p50Ms:samples[Math.floor(samples.length*.50)]||0,p95Ms:samples[Math.floor(samples.length*.95)]||0,p99Ms:samples[Math.floor(samples.length*.99)]||0};
const result={seed:20261028,scope:'Actual page/registry/policy/equity/ledger. Synthetic 2–6 player continuous tables, varying stacks and world skill; presentation and wall-clock delays stubbed; no real wallet. Session hand limit 100 reported separately from completion.',passed:rows.filter(r=>r.passed).length,failed:rows.filter(r=>!r.passed).length,rows,stats,timing};fs.writeFileSync(arg('--out',null),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,failed:result.failed,failures:rows.filter(r=>!r.passed),stats,timing},null,2));if(result.failed)process.exitCode=1;
