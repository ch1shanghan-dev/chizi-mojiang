import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {root,parse,walk} from './lib/skill_audit.mjs';
const ctx=vm.createContext({console:{log(){}}});vm.runInContext(fs.readFileSync(path.join(root,'core/csh_pots.js'),'utf8'),ctx);const P=ctx.CSHPots,rows=[];
const check=(name,ok,detail)=>rows.push({name,passed:!!ok,...(!ok?{detail}: {})});
const C=P.card,board=[C(14,0),C(13,3),C(9,1),C(9,3),C(5,2)],rake={rateBps:100,cap:20,noFlopNoDrop:true};
function hand(contrib=[224,224],fold=[false,false],community=board){return {roundId:'case-1',timestamp:123,rake,players:contrib.map((n,i)=>({id:i,name:'P'+i,contrib:n,folded:fold[i],hole:i===0?[C(13,0),C(13,2)]:[C(14,1),C(12,2)]})),stacks:Object.fromEntries(contrib.map((_,i)=>[i,10000])),community,dealerId:0};}
let r=P.settle(hand());check('224 equal inputs show fee instead of unexplained loss',r.systemCollected===4&&r.ledger[0].net===220&&r.conservation==='PASS',r.ledger);
r=P.settle(hand([5000,224]));check('uncalled refund excluded from rake',r.ledger[0].uncalledRefund===4776&&r.systemCollected===4&&r.conservation==='PASS',r);
r=P.settle(hand([5000,224],[false,true],[]));check('preflop fold no drop and full unmatched refund',r.systemCollected===0&&r.ledger[0].uncalledRefund===4776&&r.conservation==='PASS');
r=P.settle(hand([10000,10000]));check('per-hand cap not exceeded',r.systemCollected===20);
r=P.settle({...hand(),rake:{...rake,rateBps:0}});check('explicit fee off',r.systemCollected===0&&r.ledger[0].net===224);
r=P.settle(hand([500,2000,3000]));check('multiple side pots conserved with uncalled refund',r.conservation==='PASS'&&r.ledger[2].uncalledRefund===1000&&r.systemCollected<=20);
const tie=hand([101,101]);tie.community=[C(10,0),C(11,0),C(12,0),C(13,0),C(14,0)];r=P.settle(tie);check('tie and odd rake deterministic',JSON.stringify(r)===JSON.stringify(P.settle(tie))&&r.systemCollected===2&&r.ledger.every(x=>x.net===-1));
for(const bad of [-1,NaN,2.2,Number.MAX_SAFE_INTEGER]){let rejected=false;try{P.settle(hand([bad,224]));}catch{rejected=true;}check('invalid amount rejected '+bad,rejected);}
let seed=202611;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let n=0;n<1000;n++){const count=2+Math.floor(random()*5),contrib=Array.from({length:count},()=>Math.floor(random()*10000)),h=hand(contrib);h.roundId='seed-'+n;h.players.forEach((p,i)=>p.folded=i>0&&random()<.3);const a=P.settle(h),again=P.settle(h);const balance=a.ledger.reduce((sum,p)=>sum+p.net,0)+a.systemCollected;check('seed '+n+' ledger and replay',a.conservation==='PASS'&&balance===0&&a.systemCollected<=20&&JSON.stringify(a)===JSON.stringify(again)&&a.ledger.every(p=>a.events.filter(e=>e.playerId===p.id).reduce((sum,e)=>sum+e.amount,0)===p.net));}
const html=fs.readFileSync(path.join(root,'games/texas/texas.html'),'utf8'),inline=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
walk(parse(inline),n=>{if(n.type==='FunctionDeclaration'&&n.id.name==='settleHand')vm.runInContext(inline.slice(...n.range),ctx);});
const h=hand();ctx.G={...h,sessionId:'actual',handNo:1,n:2,players:h.players.map(p=>({...p,chips:10000-p.contrib})),rake,community:board};ctx.window={CSHPots:P};ctx.logErr=()=>{};
ctx.settleHand();const first=JSON.stringify(ctx.G.players);ctx.settleHand();ctx.settleHand();check('actual page settleHand pays/charges exactly once for three callbacks',JSON.stringify(ctx.G.players)===first&&ctx.G.ledger.systemCollected===4);
const old=P.selftest();check('legacy pots tests remain valid',old.ok,old);
const result={scope:'actual pots and actual page settlement; 1000 deterministic ledger/replay samples, no live wallet/profile',passed:rows.filter(x=>x.passed).length,failed:rows.filter(x=>!x.passed).length,failures:rows.filter(x=>!x.passed)};console.log(JSON.stringify(result,null,2));if(result.failed)process.exitCode=1;
