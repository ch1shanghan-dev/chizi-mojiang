// Actual DDZ functions and shared transport in isolated VM; controlled ACKs, no player saves.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {root,parse,walk} from './lib/skill_audit.mjs';
const opt=(k,f)=>{const i=process.argv.indexOf(k);return i<0?f:process.argv[i+1];};
const source=path.resolve(opt('--source',path.join(root,'games/doudizhu/doudizhu.html'))),out=path.resolve(opt('--out',''));
if(!opt('--out')||/^c:/i.test(out)||out.toLowerCase().startsWith(root.toLowerCase()+path.sep))throw Error('External D: --out directory required');
const html=fs.readFileSync(source,'utf8'),code=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const shared=fs.readFileSync(path.join(root,'core/csh_page.js'),'utf8');let transport;
walk(parse(shared),n=>{if(n.type==='FunctionDeclaration'&&n.id.name==='transport')transport=shared.slice(...n.range);});
const names=new Set(['rnd','buildDeck','shuffle','sortHand','arrangeGoodDeck','leavePage','nextIdx','later','clearAllTimers','newGame','startGame','showStart','closePage','afterGameAction','cashOutGame','setAuto','queueDecision','autoKick','onTeardown','sideWon','isLandlord','endGame','sessionSettlementData']);
const pieces=[],found=new Set();walk(parse(code),n=>{
 if(n.type==='VariableDeclarator'&&['Bridge','game','JOKER_S','JOKER_B'].includes(n.id.name))pieces.push('var '+code.slice(...n.range)+';');
 if(n.type==='FunctionDeclaration'&&names.has(n.id.name)){pieces.push(code.slice(...n.range));found.add(n.id.name);}
});
for(const n of [...names].filter(n=>n!=='sessionSettlementData'))if(!found.has(n))throw Error('Missing actual function '+n);
if(!transport)throw Error('Missing shared transport');
function harness(active=true){
 const sent=[],messages=[],listeners=[],timers=[],nodes=new Map();let seq=0,reloads=0,decisions=0,renders=0,seed=123456;
 const math=Object.create(Math);math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const node=s=>{if(!nodes.has(s))nodes.set(s,{value:'我',textContent:'',style:{},classList:{add(){},remove(){},toggle(){}}});return nodes.get(s);};
 const parent=active?{postMessage:m=>sent.push(JSON.parse(JSON.stringify(m)))}:null;
 const window={crypto:webcrypto,location:{reload(){reloads++;}},close(){sent.push({__csh:'window-close'});},addEventListener(n,fn){if(n==='message')listeners.push(fn);}};window.parent=active?parent:window;
 const ctx=vm.createContext({window,root:window,document:{body:{style:{display:''}}},console:{log(){},warn(){},error(){}},Math:math,crypto:webcrypto,alive:true,tornDown:false,closePending:false,timers:[],selIds:[],hintIdx:0,goodMode:false,CRD:null,CSHPage:null,requireSave:()=>true,saveReason:'isolated',$:node,lsSet:()=>true,
 sfx:{deal(){},lose(){}},sfxPlay(){},hideBanner(){},showBanner(){},syncOverButtons(){},esc:String,bumpMult(){throw Error('Unexpected spring fixture');},switchView:s=>messages.push(s),renderAll(){renders++;},renderActions(){renders++;},logLine:s=>messages.push(s),toast:s=>messages.push(s),botBidAct(){decisions++;},autoPlayTurn(){decisions++;},bidStep(){decisions++;},scheduleTurn(){decisions++;},
 setTimeout(fn,ms){const t={id:++seq,fn,ms,active:true};timers.push(t);return t.id;},clearTimeout(id){const t=timers.find(t=>t.id===id);if(t)t.active=false;}});
 vm.runInContext(transport+'\nCSHPage={transport:transport,sayThrottled(){}};',ctx);for(const p of pieces)vm.runInContext(p,ctx);
 const commands=k=>sent.filter(x=>x.__csh===k),latest=k=>commands(k).at(-1),ack=(m,ok=true,data={ok:true})=>{if(!m)throw Error('No pending request');listeners.forEach(fn=>fn({source:parent,data:{__csh:m.__csh+'-ack',req:m.req,ok,data}}));};
 if(active){ctx.Bridge.pull();ack(latest('shell-wallet'),true,{buyIn:300});ack(latest('shell-seat'),true,{seats:[{id:'a',name:'甲',stake:300},{id:'b',name:'乙',stake:300}]});}
 ctx.newGame();ctx.clearAllTimers();
 return{ctx,sent,messages,timers,commands,latest,ack,reloads:()=>reloads,decisions:()=>decisions,renders:()=>renders,expire(ms){const t=timers.findLast(t=>t.active&&t.ms===ms);if(!t)throw Error('No timer '+ms);t.active=false;t.fn();}};
}
const rows=[];function check(name,fn){try{const v=fn();rows.push({name,passed:v===true,...(v===true?{}:{detail:v})});}catch(e){rows.push({name,passed:false,error:e.stack});}}
const payment=h=>h.latest('shell-settle-session')||h.latest('shell-settle');
const data=m=>m?.data&&typeof m.data==='object'?m.data:m;
const clean=m=>{const p=data(m);return p&&{key:p.key,buyIn:p.buyIn,chips:p.chips,seats:p.seats,team:p.team};};
const refund=m=>m?.__csh==='shell-settle-session'&&data(m).key==='doudizhu'&&data(m).buyIn===300&&data(m).chips===300&&Array.isArray(data(m).seats)&&data(m).seats.length===0;
const terminal=h=>{Object.assign(h.ctx.game,{phase:'over',over:true,landlord:1,winner:2,chips:900,practice:false});return h;};
const terminalPayment=m=>m?.__csh==='shell-settle-session'&&data(m).key==='doudizhu'&&data(m).buyIn===300&&data(m).chips===900&&JSON.stringify(data(m).seats)===JSON.stringify([{id:'a',stake:300},{id:'b',stake:300}]);
const leave=(h,again)=>again?h.ctx.afterGameAction('again'):h.ctx.closePage();
const destination=(h,again)=>again?h.commands('shell-open').length===1&&h.reloads()===0&&h.commands('doudizhu-close').length===0:h.reloads()===0&&h.commands('doudizhu-close').length===1;
check('actual newGame keeps own 300 chips while whole table stake remains 900',()=>{const h=harness();return h.ctx.game.chips===300&&h.ctx.game.stake===900&&h.ctx.game.aiStakes.join(',')==='300,300';});
check('actual newGame deals all 54 unique cards without changing the game start',()=>{const h=harness(),g=h.ctx.game,cards=g.hands.flat().concat(g.bottom);return g.phase==='bid'&&!g.over&&g.hands.every(x=>x.length===17)&&g.bottom.length===3&&new Set(cards.map(c=>c.id)).size===54;});
for(const phase of ['idle','bid','play'])for(const again of [false,true]){
 const label=phase+'/'+(again?'again':'close');
 check('unfinished '+label+' refunds only own principal and no AI encounters',()=>{const h=harness();h.ctx.game.phase=phase;h.ctx.game.chips=900;leave(h,again);return refund(payment(h))&&h.commands('shell-settle').length===0;});
 check('unfinished '+label+' waits for success and runs exactly one destination',()=>{const h=harness();h.ctx.game.phase=phase;h.ctx.game.chips=900;leave(h,again);if(h.reloads()||h.commands('doudizhu-close').length)return false;const m=payment(h);leave(h,again);h.ack(m);leave(h,again);h.ack(m);return destination(h,again)&&h.commands('shell-settle-session').length===1;});
}
for(const invalid of [
 ['over flag absent',{phase:'over',over:false,landlord:1,winner:2}],
 ['phase inconsistent',{phase:'play',over:true,landlord:1,winner:2}],
 ['landlord unknown',{phase:'over',over:true,landlord:-1,winner:2}],
 ['winner unknown',{phase:'over',over:true,landlord:1,winner:-1}],
 ['landlord out of range',{phase:'over',over:true,landlord:3,winner:2}],
 ['winner out of range',{phase:'over',over:true,landlord:1,winner:3}],
 ['landlord numeric string',{phase:'over',over:true,landlord:'1',winner:2}],
 ['winner fractional',{phase:'over',over:true,landlord:1,winner:1.5}]
])for(const again of [false,true])check('invalid terminal '+invalid[0]+'/'+again+' conservatively refunds principal',()=>{const h=harness();Object.assign(h.ctx.game,invalid[1],{chips:900});leave(h,again);return refund(payment(h));});
for(const again of [false,true]){
 const label=again?'again':'close';
 check('valid terminal '+label+' uses exact same session money and AI seats',()=>{const h=terminal(harness());leave(h,again);return terminalPayment(payment(h))&&h.commands('shell-settle').length===0;});
 for(const fail of ['ack-failed','data-rejected','timeout'])check('valid terminal '+label+' '+fail+' retry preserves result and ignores old ACK',()=>{
  const h=terminal(harness());leave(h,again);const old=payment(h),oldPayload=JSON.stringify(clean(old));
  if(fail==='timeout')h.expire(4000);else h.ack(old,fail==='data-rejected',{ok:false});
  if(!h.ctx.alive||h.ctx.closePending||h.reloads()||h.commands('doudizhu-close').length)return false;
  leave(h,again);const newer=payment(h);if(newer.req===old.req||JSON.stringify(clean(newer))!==oldPayload)return false;
  h.ack(old);if(!h.ctx.closePending||h.reloads()||h.commands('doudizhu-close').length)return false;
  h.ack(newer);return destination(h,again)&&h.commands('shell-settle-session').length===2&&terminalPayment(newer);
 });
 check('already accepted terminal '+label+' skips a second money request',()=>{const h=terminal(harness());h.ctx.Bridge.settleSession({key:'doudizhu',buyIn:300,chips:900,seats:[{id:'a',stake:300},{id:'b',stake:300}]},()=>{});h.ack(payment(h));leave(h,again);leave(h,again);return destination(h,again)&&h.commands('shell-settle-session').length===1;});
 check('pending '+label+' prevents opposite exit from stealing destination',()=>{const h=terminal(harness());leave(h,again);leave(h,!again);h.ack(payment(h));return destination(h,again)&&h.commands('shell-settle-session').length===1;});
}
for(const lord of [0,1,2])for(const winner of [0,1,2])for(const practice of [false,true])check('real endGame and retry share exact payload '+[lord,winner,practice].join('/'),()=>{
 const h=harness();Object.assign(h.ctx.game,{phase:'play',over:false,landlord:lord,winner:-1,turn:winner,mult:4,multLog:[],practice,plays:[2,2,2]});h.ctx.game.hands[winner]=[];h.ctx.endGame(winner);const first=payment(h),before=JSON.stringify(clean(first)),expected=practice?300:((lord===0)===(lord===winner))?(lord===0?900:600):0;
 if(!first||first.__csh!=='shell-settle-session'||data(first).chips!==expected)return false;
 const count=h.commands('shell-settle-session').length,merit=h.commands('shell-merit').length;h.ctx.endGame(winner);if(h.commands('shell-settle-session').length!==count||h.commands('shell-merit').length!==merit)return false;
 h.ack(first,false,{ok:false});h.ctx.afterGameAction('again');const next=payment(h);if(next.req===first.req||JSON.stringify(clean(next))!==before||h.commands('shell-settle').length)return false;h.ack(next);return h.commands('shell-open').length===1&&h.reloads()===0;
});
check('failed unfinished close resumes original bidding without fabricating terminal chips',()=>{const h=harness(),n=h.decisions();h.ctx.closePage();h.ack(payment(h),false,{ok:false});return h.ctx.alive&&!h.ctx.closePending&&h.ctx.game.phase==='bid'&&h.ctx.game.chips===300&&h.decisions()===n+1;});
check('destroyed pending again cannot reload or revive old page on late ACK',()=>{const h=terminal(harness());h.ctx.afterGameAction('again');const m=payment(h);h.ctx.onTeardown();h.ack(m);return !h.ctx.alive&&!h.reloads()&&!h.commands('doudizhu-close').length;});
// Real transport lifecycle for the new fee request, after the old payout is accepted.
function paidAgain(){const h=terminal(harness());h.ctx.Bridge.settleSession({key:'doudizhu',buyIn:300,chips:900,seats:[{id:'a',stake:300},{id:'b',stake:300}]},()=>{});h.ack(payment(h));h.ctx.afterGameAction('again');return h;}
check('accepted result requests a fresh fee with original game and buyin, never reloads',()=>{const h=paidAgain(),o=h.latest('shell-open');return o.key==='doudizhu'&&o.buyIn===300&&!h.reloads()&&h.ctx.closePending&&!h.ctx.alive&&h.commands('shell-settle-session').length===1;});
check('pending fee request blocks repeated again, close and direct newGame',()=>{const h=paidAgain(),epoch=h.ctx.game.actionEpoch;h.ctx.afterGameAction('again');h.ctx.closePage();h.ctx.newGame();return h.commands('shell-open').length===1&&!h.commands('doudizhu-close').length&&h.ctx.game.actionEpoch===epoch;});
check('fee opening ACK restores same paid result so cancelling fee can return safely',()=>{const h=paidAgain();h.ack(h.latest('shell-open'),true,{key:'doudizhu'});return h.ctx.alive&&!h.ctx.closePending&&h.ctx.game.over&&h.ctx.game.winner===2&&h.ctx.game.chips===900&&h.ctx.Bridge.isSettled()&&!h.reloads();});
check('cancelled fee can be requested again without repeating previous payout',()=>{const h=paidAgain();h.ack(h.latest('shell-open'),true,{key:'doudizhu'});h.ctx.afterGameAction('again');return h.commands('shell-open').length===2&&h.commands('shell-settle-session').length===1&&h.ctx.closePending;});
check('rejected opening restores paid result and allows one fee retry without another payout',()=>{const h=paidAgain();h.ack(h.latest('shell-open'),false,{});if(!h.ctx.alive||h.ctx.closePending||!h.messages.some(m=>String(m).includes('上一局已结算')))return false;h.ctx.afterGameAction('again');return h.commands('shell-open').length===2&&h.commands('shell-settle-session').length===1;});
check('opening timeout releases lock and late old ACK cannot unlock the newer request',()=>{const h=paidAgain(),old=h.latest('shell-open');h.expire(4000);if(!h.ctx.alive||h.ctx.closePending)return false;h.ctx.afterGameAction('again');const newer=h.latest('shell-open');h.ack(old);if(!h.ctx.closePending||h.ctx.alive||newer.req===old.req)return false;h.ack(newer);return h.ctx.alive&&!h.ctx.closePending&&h.commands('shell-settle-session').length===1;});
check('destroyed paid page cannot be revived by delayed opening ACK',()=>{const h=paidAgain(),old=h.latest('shell-open');h.ctx.onTeardown();const n=h.renders();h.ack(old);return !h.ctx.alive&&h.renders()===n&&!h.reloads();});
check('paid result can close after fee cancellation without another payout',()=>{const h=paidAgain();h.ack(h.latest('shell-open'));h.ctx.closePage();return h.commands('shell-settle-session').length===1&&h.commands('doudizhu-close').length===1&&!h.ctx.alive;});
for(const stakes of [[75,125],[0,125],[0,0]])for(const lord of[0,1,2])for(const winner of[0,1,2])check('actual endGame caps both directions by enemy exposure '+stakes.join('/')+' '+lord+'/'+winner,()=>{const h=harness();h.ctx.Bridge.opponents=()=>[{id:'a',stake:stakes[0]},{id:'b',stake:stakes[1]}];Object.assign(h.ctx.game,{phase:'play',over:false,landlord:lord,winner:-1,turn:winner,mult:4,multLog:[],practice:false,plays:[2,2,2],aiStakes:stakes});h.ctx.game.hands[winner]=[];h.ctx.endGame(winner);const p=data(payment(h)),cap=stakes.reduce((n,st,i)=>n+(((i+1===lord)!==(lord===0))?st:0),0),won=(lord===0)===(lord===winner);return p.chips===(won?300+Math.min(1200,cap):300-Math.min(300,1200,cap))&&p.team.landlord===lord&&p.team.winner===winner});
const result={scope:'Actual AST-extracted DDZ newGame/endGame/exit functions and actual CSHPage transport, isolated VM with explicit states and controlled ACK/timers; no real wallet or natural game claim',source,passed:rows.filter(r=>r.passed).length,failed:rows.filter(r=>!r.passed).length,checks:rows};
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,failed:result.failed,failures:rows.filter(r=>!r.passed)},null,2));process.exitCode=result.failed?1:0;
