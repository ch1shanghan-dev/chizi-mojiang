// Public affection APIs against isolated storage and the real wallet recovery guard.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {MINIONS} from '../core/csh_bossdata.js';
import {affOf, AFF_SHAPE, FAV, OATH_LINES} from '../core/csh_aff_lines.js';
import {root,parse,walk} from './lib/skill_audit.mjs';
const option=n=>{const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1];};
const source=fs.readFileSync(option('--source')||path.join(root,'core/csh_affection.js'),'utf8');
const wallet=fs.readFileSync(path.join(root,'core/csh_wallet.js'),'utf8');let guard;
walk(parse(wallet),n=>{if(n.type==='FunctionDeclaration'&&n.id.name==='saveBlocked')guard=wallet.slice(...n.range);});
const clean=s=>s.replace(/^import .*?;\r?\n/gm,'').replace(/^export (const|function) /gm,'$1 ');
const rows=[];function check(name,fn){try{const r=fn();rows.push({name,passed:r===true,detail:r===true?undefined:r});}catch(e){rows.push({name,passed:false,error:e.message});}}
const id=Object.keys(MINIONS).find(i=>FAV[i]&&affOf(i));if(!id)throw Error('No real affection subject');
function fixture(state='open',max=false){
  const data=new Map(),writes=[],coins=[];let pending=false,busy=false,fault=false;
  const store={getItem(k){if(fault&&k==='csh_migrate_recovery')throw Error('read failed');return data.get(k)??null;},setItem(k,v){writes.push(k);data.set(k,String(v));},removeItem(k){writes.push(k);data.delete(k);}};
  const lib={config:{},translate:{},cshMigrate:{recoveryState:()=>({pending,busy})},cshBossRecord:{summary:()=>({minions:{[id]:{n:1}}})},cshWallet:{wallet:{spend(n){coins.push(-n);return true;},add(n){coins.push(n);return n;}}}};
  const context=vm.createContext({lib,game:{log(){}},localStorage:store,MINIONS,affLinesOf:affOf,AFF_SHAPE,FAV,OATH_LINES,window:{CSH:{}},console});
  lib.cshWallet.saveGuard={blocked:vm.runInContext('('+guard+')',context)};
  vm.runInContext(fs.readFileSync(path.join(root,'core/csh_bond.js'),'utf8'),context);
  vm.runInContext(clean(source)+'\ninstallAffection();',context);
  const today=vm.runInContext('dayKey()',context);
  data.set('csh_affection',JSON.stringify({[id]:{v:max?88000:5000,last:Date.now(),saw:today,day:{},cnt:{},heard:{}}}));
  function lock(mode){
    if(mode==='persisted'||mode==='startup')data.set('csh_migrate_recovery','{"v":1}');
    if(mode==='broken')data.set('csh_migrate_recovery','{');
    if(mode==='busy')busy=true;if(mode==='pending')pending=true;if(mode==='read-fault')fault=true;
    if(mode==='startup')delete lib.cshWallet.saveGuard;
    if(mode==='guard-throw')lib.cshWallet.saveGuard.blocked=()=>{throw Error('guard failed');};
  }
  lock(state);
  return {A:lib.cshAffection,data,writes,coins,lib,lock,raw:()=>data.get('csh_affection'),unlock(){data.delete('csh_migrate_recovery');pending=false;busy=false;fault=false;}};
}
const mutations=[
  ['hunt',h=>h.A.noteHunt(id),r=>r===null],['hold',h=>h.A.noteHold(id),r=>r===null],['talk note',h=>h.A.noteTalk(id),r=>r===null],['table game',h=>h.A.notePlay(id),r=>r===null],
  ['interact',h=>h.A.interact(id,'talk'),r=>r.ok===false&&r.recovery===true],['greet',h=>h.A.interact(id,'greet'),r=>r.ok===false&&r.recovery===true],
  ['gift',h=>h.A.gift(id,'wine'),r=>r.ok===false&&r.recovery===true],['oath',h=>h.A.oath(id),r=>r.ok===false&&r.recovery===true,true],
  ['reset one',h=>h.A.reset(id),r=>r===false],['reset all',h=>h.A.reset(),r=>r===false],
  ['max companionship',h=>h.A.interact(id,'head'),r=>r.ok===false&&r.recovery===true,true],
];
for(const state of ['persisted','broken','busy','pending','read-fault','startup','guard-throw']){
  for(const [name,run,denied,max]of mutations)check(state+' rejects '+name+' before writes/payment',()=>{const h=fixture(state,max),before=h.raw(),r=run(h);return denied(r)&&h.raw()===before&&h.writes.length===0&&h.coins.length===0;});
  check(state+' permits read views without collecting heard lines',()=>{const h=fixture(state),before=h.raw();const view=h.A.get(id),all=h.A.summary(),text=h.A.line(id,'talk'),quip=h.A.tableQuip(id);return view.v===5000&&all.n===1&&typeof text==='string'&&!!quip&&h.raw()===before&&h.writes.length===0;});
  check(state+' disables gain status',()=>fixture(state).A.canGain(id,'talk')===false);
}
check('recovery completion permits the same pending interaction once',()=>{const h=fixture('persisted'),before=h.raw();if(h.A.interact(id,'talk').ok||h.raw()!==before)return false;h.unlock();const first=h.A.interact(id,'talk'),second=h.A.interact(id,'talk');return first.ok&&first.gain>0&&!second.ok&&second.reason==='daily';});
check('normal gift pays once and increases affection',()=>{const h=fixture(),r=h.A.gift(id,'wine');return r.ok&&r.gain>0&&h.coins.length===1&&h.coins[0]===-r.cost&&h.A.get(id).v===r.value;});
check('normal notes and table games retain progression',()=>{const h=fixture();return [h.A.noteHunt(id),h.A.noteHold(id),h.A.noteTalk(id),h.A.notePlay(id)].every(r=>r?.gain>0)&&h.A.get(id).v>5000;});
check('normal oath retains two payment entries and oath receipt',()=>{const h=fixture('open',true),r=h.A.oath(id);return r.ok&&h.coins.length===2&&-h.coins.reduce((a,b)=>a+b,0)===r.cost&&h.A.get(id).oath>0;});
check('normal line collection and reset remain available',()=>{const h=fixture();h.A.line(id,'talk');if(h.A.heardOf(id).got!==1)return false;return h.A.reset(id)===true&&h.A.get(id).v===0;});
check('wallet-free normal startup remains usable',()=>{const h=fixture();delete h.lib.cshWallet;return h.A.notePlay(id)?.gain>0;});
const failures=rows.filter(r=>!r.passed);console.log(JSON.stringify({scope:'actual affection public APIs and wallet saveBlocked, isolated stores; no live saves',passed:rows.length-failures.length,failed:failures.length,failures},null,2));process.exitCode=failures.length?1:0;
