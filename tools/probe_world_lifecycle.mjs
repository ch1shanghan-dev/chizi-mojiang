// Actual shell handlers + actual UNO Bridge/Room callbacks, isolated VM stores only.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {root, parse, walk} from './lib/skill_audit.mjs';
const option=(n,f)=>{const i=process.argv.indexOf(n);return i<0?f:process.argv[i+1];};
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const shell=fs.readFileSync(option('--shell',path.join(root,'core/csh_shell.js')),'utf8');
const world=fs.readFileSync(option('--world',path.join(root,'core/csh_world.js')),'utf8');
const uno=fs.readFileSync(option('--uno',path.join(root,'games/uno/uno.html')),'utf8').match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const functions=new Map();walk(parse(shell),n=>{if(n.type==='FunctionDeclaration')functions.set(n.id.name,shell.slice(...n.range));});
const clean=s=>s.replace(/^import .*?;.*\r?\n/gm,'').replace(/^export (const|function) /gm,'$1 ');
function harness(key='uno'){
  const data=new Map(),nodes=new Map(),acks=[],errors=[],writes=[],fault={read:false};
  const storage={getItem:k=>{if(fault.read)throw Error('read-fault');return data.get(k)??null;},setItem:(k,v)=>{writes.push(k);data.set(k,String(v));},removeItem:k=>data.delete(k)};
  const doc={addEventListener(){},body:{classList:{toggle(){}}},documentElement:{classList:{add(){},remove(){}}},getElementById:id=>nodes.get(id)||null};
  const ctx=vm.createContext({lib:{config:{},skill:{},translate:{}},game:{},get:{poptip:()=>''},_status:{},cshVoices:{},localStorage:storage,window:{CSH:{},addEventListener(){}},document:doc,
    console:{log(){},warn(){},error(){}},setTimeout(){return 1;},clearTimeout(){},setInterval(){return 1;},clearInterval(){}});
  vm.runInContext(clean(read('character/index.js')).replace('export default','var cshCharacter ='),ctx);
  vm.runInContext(clean(read('core/csh_bossdata.js')),ctx);
  vm.runInContext(clean(world),ctx);
  const noop=()=>{};
  Object.assign(ctx,{ackToGame:(name,ok,d)=>acks.push({name,ok,data:d}),logError:(m,e)=>errors.push(m+(e?' '+e.message:'')),logInfo:noop,paintTop:noop,paintPc:noop,cshTableAward:noop,selfCloseAfterSettle:noop,
    cancelSelfClose:noop,removeLeave:noop,ensureStyle:noop,bindMessage:noop,bindEsc:noop,bindVisibility:noop,setTitle:noop,checkOrientation:noop,urlOf:k=>k+'.html',docHost:()=>doc.documentElement,
    ensureChrome(){const fr={src:'',contentWindow:{}};const ov={parentNode:{removeChild(){nodes.clear();}}};nodes.set('csh-shell-frame',fr);nodes.set('csh-shell-overlay',ov);return ov;},
    wallet:()=>({flushSave:noop}),emit:noop,
    settle(k,d){ctx.cashCalls++;const profit=d.chips-d.buyIn;return {profit,credited:profit>=0?d.buyIn+Math.floor(profit*.9):d.chips,rate:.9,...ctx.cashOverride};}});
  vm.runInContext(`var current=null,currentBuyIn=0,paused=false,pausedAuto=false,enteredAt=0,tickTimer=0,pausedAt=0,totalPaused=0,CUR_REQ=null;
    var GUARD={},SHELL_GENERATION=0,TABLE_AFF={minions:[],awarded:false},TABLE_WORLD=null,TABLE_SERIAL=0;
    var OV_ID='csh-shell-overlay',META={uno:{},texas:{},blackjack:{},doudizhu:{}},LEGACY_CLOSE={'uno-close':'uno'};`,ctx);
  const names=['persistenceBlocked','persistenceRefused','cshWorldTableFinish','cshWorldTableBegin','cshWorldTableResult','cshTableRecord','cshTableAward','settleSession','guardKey','fromCurrentFrame','openShell','closeShell','onMessage'];
  for(const n of names)if(functions.has(n))vm.runInContext(functions.get(n),ctx);
  const affection=[];ctx.lib.cshAffection={notePlay:id=>{affection.push(id);return true;}};ctx.toast=noop;
  ctx.close=()=>ctx.closeShell(false);ctx.cashCalls=0;ctx.cashOverride={};
  ctx.openShell(key,{buyIn:200});
  const send=(cmd,d={},source=nodes.get('csh-shell-frame')?.contentWindow)=>{const before=acks.length;ctx.onMessage({source,data:{__csh:cmd,req:cmd+'#'+before,...d}});if(acks.length===before&&errors.at(-1)?.startsWith('onMessage'))throw Error(errors.at(-1));return acks.length>before?acks.at(-1):null;};
  const seat=(n=2)=>send('shell-seat',{n,buyIn:200}).data;
  return {ctx,data,storage,writes,fault,nodes,acks,errors,affection,send,seat,W:ctx.lib.cshWorld,p:id=>ctx.lib.cshWorld.byId(id).withPlayer};
}
const tests=[];
async function check(name,fn){try{const x=await fn();tests.push({name,passed:x===true,detail:x===true?undefined:x});}catch(e){tests.push({name,passed:false,detail:e.message});}}
const tableRound=h=>{const t=h.seat();h.send('shell-world-round',{table:t.table,round:1});return t;};
const result=(h,t,id,round=1,won=false)=>h.send('shell-world-result',{table:t.table,round,id,won});
await check('seat selection alone creates no player experience',()=>{const h=harness();h.seat();h.ctx.closeShell(false);return h.W.stats().playerHands===0;});
await check('seat ACK includes a host table identity',()=>{const h=harness(),t=h.seat();return typeof t.table==='string'&&t.seats.length===2;});
await check('result without actual round registration rejected',()=>{const h=harness(),t=h.seat(),r=result(h,t,t.seats[0].id);return !r.ok&&h.W.stats().playerHands===0;});
await check('actual round result is recorded once',()=>{const h=harness(),t=tableRound(h),id=t.seats[0].id;return result(h,t,id).ok&&h.p(id).hands===1&&h.p(id).wins===1;});
await check('duplicate message replays result without world mutation',()=>{const h=harness(),t=tableRound(h),id=t.seats[0].id,a=result(h,t,id);const before=JSON.stringify(h.W.raw()),b=result(h,t,id,1,true);return b.ok&&JSON.stringify(a.data)===JSON.stringify(b.data)&&before===JSON.stringify(h.W.raw());});
await check('same-frame next real round is accepted',()=>{const h=harness(),t=tableRound(h),id=t.seats[0].id;result(h,t,id);const r=h.send('shell-world-round',{table:t.table,round:2});return r.ok&&result(h,t,id,2,true).ok&&h.p(id).hands===2&&h.p(id).losses===1;});
await check('duplicate round start does not finish an unfinished round',()=>{const h=harness(),t=tableRound(h);return h.send('shell-world-round',{table:t.table,round:1}).ok&&h.W.stats().playerHands===0;});
await check('old result cannot count again after next round begins',()=>{const h=harness(),t=tableRound(h),id=t.seats[0].id;result(h,t,id);h.send('shell-world-round',{table:t.table,round:2});return !result(h,t,id).ok&&h.p(id).hands===1;});
await check('skipped round number rejected',()=>{const h=harness(),t=tableRound(h);return !h.send('shell-world-round',{table:t.table,round:3}).ok&&h.W.stats().playerHands===0;});
for(const n of [0,-1,1.1,'1',Infinity,1000000001])await check('invalid round rejected: '+String(n),()=>{const h=harness(),t=h.seat();return !h.send('shell-world-round',{table:t.table,round:n}).ok&&h.W.stats().playerHands===0;});
await check('off-table opponent result rejected',()=>{const h=harness(),t=tableRound(h),foreign=h.W.list().find(a=>!t.seats.some(s=>s.id===a.id)).id;return !result(h,t,foreign).ok&&h.W.stats().playerHands===0;});
for(const won of [undefined,0,1,'win',{},[]])await check('invalid result cannot become a draw: '+String(won),()=>{const h=harness(),t=tableRound(h);return !h.send('shell-world-result',{table:t.table,round:1,id:t.seats[0].id,won}).ok&&h.W.stats().playerHands===0;});
for(const id of [null,1,{},[]])await check('non-string opponent ID rejected: '+String(id),()=>{const h=harness(),t=tableRound(h);return !result(h,t,id).ok&&h.W.stats().playerHands===0;});
await check('explicit null result is a real draw',()=>{const h=harness(),t=tableRound(h),id=t.seats[0].id;return result(h,t,id,1,null).ok&&h.p(id).draws===1;});
await check('stale table token rejected in same iframe',()=>{const h=harness(),t=tableRound(h),id=t.seats[0].id;h.seat();return !result(h,t,id).ok&&h.p(id).hands===1;});
await check('closing active unfinished round records unresolved encounter only',()=>{const h=harness(),t=tableRound(h);h.ctx.closeShell(false);return t.seats.every(s=>{const p=h.p(s.id);return p.hands===1&&p.wins===0&&p.losses===0&&p.draws===0;});});
await check('closing completed round does not duplicate completed opponents',()=>{const h=harness(),t=tableRound(h);for(const s of t.seats)result(h,t,s.id);h.ctx.closeShell(false);return t.seats.every(s=>h.p(s.id).hands===1);});
await check('closing partially reported round keeps finished outcomes',()=>{const h=harness(),t=tableRound(h);result(h,t,t.seats[0].id);h.ctx.closeShell(false);return h.p(t.seats[0].id).wins===1&&h.p(t.seats[1].id).hands===1&&h.p(t.seats[1].id).draws===0;});
await check('close is idempotent for unfinished encounters',()=>{const h=harness(),t=tableRound(h);h.ctx.closeShell(false);h.ctx.closeShell(false);return t.seats.every(s=>h.p(s.id).hands===1);});
await check('new round closes previous unfinished round once',()=>{const h=harness(),t=tableRound(h);h.send('shell-world-round',{table:t.table,round:2});return t.seats.every(s=>h.p(s.id).hands===1&&h.p(s.id).draws===0);});
await check('old iframe cannot report after reopening',()=>{const h=harness(),t=tableRound(h),old=h.nodes.get('csh-shell-frame').contentWindow;h.ctx.openShell('uno',{});const count=h.W.stats().playerHands;return h.send('shell-world-result',{table:t.table,round:1,id:t.seats[0].id,won:false},old)===null&&h.W.stats().playerHands===count;});
await check('new iframe table identity differs and has a clean round sequence',()=>{const h=harness(),t=tableRound(h);h.ctx.openShell('uno',{});const newer=h.seat();return newer.table!==t.table&&h.send('shell-world-round',{table:newer.table,round:1}).ok;});
await check('closing clears old minion affection recipients',()=>{const h=harness();h.ctx.cshTableRecord([{id:'csh_boss_minion_1'}]);h.ctx.closeShell(false);return h.ctx.TABLE_AFF.minions.length===0&&!h.ctx.TABLE_AFF.awarded;});
await check('UNO seat-only close cannot grant same-table affection',()=>{const h=harness();h.ctx.cshTableRecord([{id:'csh_boss_minion_1'}]);h.send('uno-close');return h.affection.length===0;});
await check('direct shell close awards actual UNO table affection once',()=>{const h=harness();h.ctx.cshTableRecord([{id:'csh_boss_minion_1'}]);h.send('shell-world-round',{table:h.ctx.TABLE_WORLD.token,round:1});h.ctx.closeShell(false);h.ctx.closeShell(false);return h.affection.length===1;});
await check('replacing a real UNO table awards old recipients before clearing',()=>{const h=harness();h.ctx.cshTableRecord([{id:'csh_boss_minion_1'}]);h.send('shell-world-round',{table:h.ctx.TABLE_WORLD.token,round:1});h.ctx.cshTableRecord([{id:'csh_boss_minion_2'}]);return h.affection.length===1&&h.affection[0]==='csh_boss_minion_1';});
await check('world round reports rejected outside UNO',()=>{const h=harness('texas'),t=h.seat();return !h.send('shell-world-round',{table:t.table,round:1}).ok;});
await check('world result failure can be retried without false success cache',()=>{const h=harness(),t=tableRound(h),id=t.seats[0].id,orig=h.W.settleResult;h.W.settleResult=()=>{throw Error('injected');};const first=result(h,t,id);h.W.settleResult=orig;return !first.ok&&result(h,t,id).ok&&h.p(id).hands===1&&h.errors.some(s=>s.includes('战果'));});
await check('zero-fund cap still records every real session opponent',()=>{const h=harness('texas'),t=h.seat();h.ctx.cashOverride={credited:200};const r=h.send('shell-settle-session',{buyIn:200,chips:220,seats:t.seats});return r.ok&&t.seats.every(s=>{const p=h.p(s.id);return p.hands===1&&p.wins===0&&p.losses===0&&p.draws===0;})&&r.data.aiSettled.every(s=>s.delta===0);});
await check('rounding does not omit zero-share session opponents',()=>{const h=harness('texas'),t=h.seat();const seats=t.seats.map((s,i)=>({...s,stake:i?100:1}));h.send('shell-settle-session',{buyIn:200,chips:202,seats});return seats.every(s=>h.p(s.id).hands===1)&&h.p(seats[0].id).wins===0&&h.p(seats[1].id).wins===1;});
await check('explicit zero-stake opponent counts unresolved without money change',()=>{const h=harness('texas'),t=h.seat();const id=t.seats[0].id,fund=h.W.byId(id).fund;h.send('shell-settle-session',{buyIn:200,chips:220,seats:[{id,stake:0}]});return h.p(id).hands===1&&h.p(id).wins===0&&h.W.byId(id).fund===fund;});
await check('duplicate zero-share IDs count a single unresolved encounter',()=>{const h=harness('texas'),t=h.seat(),id=t.seats[0].id;h.ctx.cashOverride={credited:200};h.send('shell-settle-session',{buyIn:200,chips:220,seats:[{id,stake:20},{id,stake:20}]});return h.p(id).hands===1&&h.p(id).wins===0;});
await check('session break-even counts one draw per opponent',()=>{const h=harness('texas'),t=h.seat();h.send('shell-settle-session',{buyIn:200,chips:200,seats:t.seats});return t.seats.every(s=>h.p(s.id).hands===1&&h.p(s.id).draws===1);});
await check('unstarted refund with cached seats creates no experience',()=>{const h=harness('texas');h.seat();h.send('shell-settle-session',{buyIn:200,chips:200,seats:[]});h.ctx.closeShell(false);return h.W.stats().playerHands===0;});
await check('economic session guard still prevents repeated world and wallet writes',()=>{const h=harness('texas'),t=h.seat(),p={buyIn:200,chips:220,seats:t.seats};h.send('shell-settle-session',p);const before=JSON.stringify(h.W.raw());h.send('shell-settle-session',p);h.send('shell-settle',{data:p});return h.ctx.cashCalls===1&&before===JSON.stringify(h.W.raw());});
await check('ordinary session fund formula remains the existing proportional 90 percent',()=>{const h=harness('texas'),t=h.seat();const before=t.seats.map(s=>h.W.byId(s.id).fund);h.send('shell-settle-session',{buyIn:200,chips:300,seats:t.seats});return t.seats.every((s,i)=>before[i]-h.W.byId(s.id).fund===45&&h.p(s.id).hands===1);});
await check('losing session retains AI 95 percent gain formula',()=>{const h=harness('texas'),t=h.seat();const before=t.seats.map(s=>h.W.byId(s.id).fund);h.send('shell-settle-session',{buyIn:200,chips:100,seats:t.seats});return t.seats.every((s,i)=>h.W.byId(s.id).fund-before[i]===47&&h.p(s.id).losses===1);});
await check('failed AI money settlement remains visibly failed without invented outcome',()=>{const h=harness('texas'),t=h.seat();h.W.settleLose=()=>{throw Error('world-fault');};const r=h.send('shell-settle-session',{buyIn:200,chips:220,seats:t.seats});return r.data.aiSettled.every(s=>s.failed&&s.delta===0)&&t.seats.every(s=>h.p(s.id).hands===0)&&h.errors.some(s=>s.includes('world-fault'));});

// Execute the real UNO bridge and real Room.start/reportBots, not copied message logic.
function unoHarness(h,deferred=false){
  const ast=parse(uno),snippets=[];walk(ast,n=>{
    if(n.type==='VariableDeclarator'&&n.id.name==='Bridge')snippets.push('var '+uno.slice(...n.range)+';');
    if(n.type==='FunctionDeclaration'&&['Room','reportBots','leftOf','startGame','closePage','rankOf','buildDeck','shuffle'].includes(n.id.name))snippets.push(uno.slice(...n.range));
    if(n.type==='ExpressionStatement'&&n.expression.type==='AssignmentExpression'){
      const left=n.expression.left;
      if(left.type==='MemberExpression'&&left.object.type==='MemberExpression'&&left.object.object.name==='Room'&&['start','viewFor'].includes(left.property.name))snippets.push(uno.slice(...n.range));
    }
  });
  const pending=[],calls=[];
  const T={active:true,onCloseSelf(){},settle(){},isSettled:()=>false,call(cmd,d,cb){calls.push({cmd,d});const ack=h.send(cmd,d);if(cb){if(deferred)pending.push(()=>cb(ack.ok,ack.data));else cb(ack.ok,ack.data);}}};
  const ctx=vm.createContext({CSHPage:{transport:()=>T},COLORS:['red','yellow','green','blue'],Math,Bridge:null,sfx:{deal(){}},view:null,botSeats:[],alive:true,room:null,myHand:[],youIdx:-1,botCount:2,
    window:{parent:{postMessage:d=>h.send(d.__csh,d)}},LocalNet:{},lsSet(){},$:()=>({value:'玩家'}),toast(){},clearAllTimers(){},quipGreet(){}});
  for(const s of snippets)vm.runInContext(s,ctx);
  Object.assign(ctx.Room.prototype,{giveCards(p,n){p.hand=Array(n).fill({color:'red',value:'1',id:1});},pushLog(){},scheduleBot(){},addPlayer(name){this.players.push({name,hand:[],id:'local-me'});return {};},addBot(s){this.players.push({name:s.name,hand:[],id:s.id});},destroy(){},broadcastState(){},canPlay(){return true;}});
  const seats=()=>ctx.Bridge.seats(2,(ok,d)=>{ctx.botSeats=d.seats;});
  return {ctx,pending,calls,seats};
}
await check('actual UNO Room.start registers a real round through actual bridge',()=>{const h=harness(),u=unoHarness(h);u.seats();u.ctx.room=new u.ctx.Room('LOCAL');u.ctx.room.players=[{hand:[]},{hand:[]}];u.ctx.room.start();return h.ctx.TABLE_WORLD?.round?.n===1&&h.W.stats().playerHands===0;});
await check('failed UNO start does not register a round',()=>{const h=harness(),u=unoHarness(h);u.seats();u.ctx.room=new u.ctx.Room('LOCAL');return !!u.ctx.room.start().err&&h.ctx.TABLE_WORLD?.round===null;});
await check('actual UNO result callback includes exact table and round identities',()=>{const h=harness(),u=unoHarness(h);u.seats();const t=h.ctx.TABLE_WORLD;u.ctx.room=new u.ctx.Room('LOCAL');u.ctx.room.players=[{hand:[]},{hand:[]}];u.ctx.room.start();const seats=u.ctx.botSeats;u.ctx.view={round:1,players:[{name:'玩家',count:5},...seats.map((s,i)=>({name:s.name,count:i?6:0}))]};u.ctx.reportBots(5);return h.p(seats[0].id).losses===1&&h.p(seats[1].id).wins===1&&u.calls.filter(c=>c.cmd==='shell-world-result').every(c=>c.d.table===t.token&&c.d.round===1);});
await check('actual same UNO room plays and records two legitimate rounds',()=>{const h=harness(),u=unoHarness(h);u.seats();const seats=u.ctx.botSeats;u.ctx.room=new u.ctx.Room('LOCAL');u.ctx.room.players=[{hand:[]},{hand:[]}];for(let n=1;n<=2;n++){u.ctx.room.state='ended';u.ctx.room.start();u.ctx.view={round:n,players:seats.map(s=>({name:s.name,count:0}))};u.ctx.reportBots(5);u.ctx.reportBots(5);}return seats.every(s=>h.p(s.id).hands===2&&h.p(s.id).losses===2);});
await check('actual UNO close retries failed finished results before removing iframe',()=>{const h=harness(),u=unoHarness(h);u.seats();const seats=u.ctx.botSeats;u.ctx.room=new u.ctx.Room('LOCAL');u.ctx.room.players=[{hand:[]},{hand:[]}];u.ctx.room.start();u.ctx.youIdx=0;u.ctx.view={state:'ended',round:1,players:[{name:'玩家',count:0},...seats.map(s=>({name:s.name,count:5}))]};const orig=h.W.settleResult;h.W.settleResult=()=>null;u.ctx.reportBots(0);h.W.settleResult=orig;u.ctx.closePage();return seats.every(s=>h.p(s.id).hands===1&&h.p(s.id).wins===1)&&h.ctx.current===null;});
await check('UNO view snapshot carries its actual round number',()=>{const h=harness(),u=unoHarness(h),r=new u.ctx.Room('LOCAL');r.players=[{name:'玩家',id:'me',hand:[]}];r.round=7;return r.viewFor('me').room.round===7;});
await check('late old UNO seat ACK cannot replace newer table identity',()=>{const h=harness(),u=unoHarness(h,true);let old=0,newer=0;u.ctx.Bridge.seats(2,()=>old++);u.ctx.Bridge.seats(2,()=>newer++);u.pending[1]();u.pending[0]();u.ctx.Bridge.round(1);return old===0&&newer===1&&h.ctx.TABLE_WORLD.round?.n===1;});
await check('abandoned UNO room cannot start from a late seat callback',()=>{const h=harness(),u=unoHarness(h,true);u.ctx.startGame();u.ctx.room=null;u.pending[0]();return h.ctx.TABLE_WORLD.round===null&&h.W.stats().playerHands===0;});
await check('reload deleted world discards stale in-memory encounters without writing',()=>{const h=harness(),id=h.W.list()[0].id;h.W.settleResult(id,false);h.data.delete('csh_world');h.writes.length=0;return h.W.reloadSave()&&h.W.stats().playerHands===0&&!h.data.has('csh_world')&&h.writes.length===0;});
await check('world reload adopts actual stored encounters without offline simulation',()=>{const h=harness(),id=h.W.list()[0].id;h.W.settleResult(id,false);const raw=h.W.raw();raw.lastTick=0;raw.ai.find(a=>a.id===id).withPlayer.hands=7;h.data.set('csh_world',JSON.stringify(raw));h.writes.length=0;return h.W.reloadSave()&&h.p(id).hands===7&&h.W.raw().lastTick===0&&h.W.stats().hands===1&&h.writes.length===0;});
await check('world reload normalizes malformed fields only in memory',()=>{const h=harness(),raw=h.W.raw();raw.ai[0].persona='bad';raw.ai[0].withPlayer={hands:-1};const text=JSON.stringify(raw);h.data.set('csh_world',text);h.writes.length=0;return h.W.reloadSave()&&h.W.byId(raw.ai[0].id).persona!=='bad'&&h.p(raw.ai[0].id).hands===0&&h.data.get('csh_world')===text&&h.writes.length===0;});
await check('world reload storage read failure preserves previous memory',()=>{const h=harness(),id=h.W.list()[0].id;h.W.settleResult(id,false);const old=JSON.stringify(h.W.raw());h.fault.read=true;return !h.W.reloadSave()&&JSON.stringify(h.W.raw())===old;});
await check('world reload corrupt JSON uses a fresh view without overwriting disk',()=>{const h=harness(),id=h.W.list()[0].id;h.W.settleResult(id,false);h.data.set('csh_world','{broken');h.writes.length=0;return h.W.reloadSave()&&h.W.stats().playerHands===0&&h.data.get('csh_world')==='{broken'&&h.writes.length===0;});
await check('later world write after reset cannot revive old encounters',()=>{const h=harness(),id=h.W.list()[0].id;h.W.settleResult(id,false);h.W.settleResult(id,false);h.data.delete('csh_world');h.W.reloadSave();h.W.settleResult(id,true);return JSON.parse(h.data.get('csh_world')).ai.find(a=>a.id===id).withPlayer.hands===1&&h.p(id).losses===1&&h.p(id).wins===0;});
await check('pre-read world snapshot is adopted without reading or mutating caller data',()=>{const h=harness(),raw=h.W.raw(),id=raw.ai[0].id;raw.ai[0].withPlayer={hands:7,losses:3};const before=JSON.stringify(raw);h.fault.read=true;h.writes.length=0;return h.W.reloadSave(raw)&&h.p(id).hands===7&&h.p(id).losses===3&&JSON.stringify(raw)===before&&h.writes.length===0;});
await check('explicit absent world snapshot resets memory without any storage access',()=>{const h=harness(),id=h.W.list()[0].id;h.W.settleResult(id,true);h.fault.read=true;h.writes.length=0;return h.W.reloadSave(null)&&h.W.stats().playerHands===0&&h.writes.length===0;});
const failures=tests.filter(t=>!t.passed);console.log(JSON.stringify({passed:tests.length-failures.length,failed:failures.length,failures},null,2));process.exitCode=failures.length?1:0;
