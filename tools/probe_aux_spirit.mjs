// Actual extension + host addPlayer/checkResult in a small isolated player fixture. Not natural games.
import fs from 'node:fs';import vm from 'node:vm';import {webcrypto} from 'node:crypto';
import {installAuxSpirit} from '../core/csh_aux_spirit.js';import {root,parse,walk} from './lib/skill_audit.mjs';
const host=fs.readFileSync(root+'/../../noname/game/index.js','utf8'),identity=fs.readFileSync(root+'/../../mode/identity.js','utf8');
function nativeMethod(source,key){let found;walk(parse(source),n=>{if((n.type==='MethodDefinition'||n.type==='Property')&&n.key?.name===key&&n.value?.type==='FunctionExpression')found=source.slice(n.range[0],n.range[1]);});if(!found)throw Error(key+' missing');return found;}
const addSource=nativeMethod(host,'addPlayer'),resultSource=nativeMethod(identity,'checkResult');
if(!addSource||!resultSource)throw Error('native anchors changed');
const strip=s=>s.replace(/^import [\s\S]*?;\r?\n/gm,'').replace(/\bexport /g,'');
const rows=[];const check=(name,value)=>rows.push({name,passed:!!value});
function harness(role='zhu',n=4){
 const data=new Map(),fault={wallet:false},storage={getItem:k=>data.get(k)??null,setItem(k,v){if(fault.wallet&&k==='csh_wallet')throw Error('quota');data.set(k,String(v));},removeItem:k=>data.delete(k),key:i=>[...data.keys()][i],get length(){return data.size;}};
 const lib={config:{mode:'identity',extension_池子魔将_csh_aux_spirit:true},skill:{},character:{},translate:{},sort:{position:(a,b)=>Number(a.dataset.position)-Number(b.dataset.position)}};const status={mode:'normal'};
 const player=(id,pos)=>({name:id,dataset:{position:String(pos)},playerid:'p'+pos,identity:'fan',skills:[],storage:{},ai:{},hp:3,maxHp:3,hand:[],equip:[],dead:false,
  addTempClass(){return this;},getId(){return this;},init(name){this.name=name;this.skills=lib.character[name].skills.slice();return this;},isIn(){return !this.dead;},isAlive(){return !this.dead;},setIdentity(){this.shown=true;},draw(n){this.hand.push(...Array(n).fill('card'));},recover(n){this.hp+=n;},remove(){this.removed=true;},classList:{contains(k){return k==='dead'&&this.self.dead;}}});
 const game={players:[],dead:[],online:false,logs:[],overCalls:[],addGlobalSkill(){},log(...a){this.logs.push(a);},addVideo(...a){this.video=a;},arrangePlayers(){const ps=this.players.slice().sort(lib.sort.position);ps.forEach((p,i)=>{p.next=ps[(i+1)%ps.length];p.previous=ps[(i+ps.length-1)%ps.length];});},swapPlayer(p){this.me=p;},swapControl(p){this.me=p;},addRecord(){this.ordinary=(this.ordinary||0)+1;},showIdentity(){},over(win){this.overCalls.push(win);this.addRecord(win);status.over=true;},saveConfig(k,v){lib.config[k]=v;}};
 const ui={arena:{setNumber(n){this.number=n;}},create:{player:()=>player('new',0)}};const get={mode:()=>lib.config.mode,convertedCharacter:v=>v,population:role=>game.players.filter(p=>p.identity===role).length};
 game.addPlayer=new Function('game','ui','return ({'+addSource+'}).addPlayer')(game,ui);
 game.checkResult=new Function('game','get','_status','return ({'+resultSource+'}).checkResult')(game,get,status);
 for(let i=0;i<n;i++){const p=player('original'+i,i);p.classList.self=p;game.players.push(p);}game.me=game.players[0];game.me.identity=role;game.zhu=role==='zhu'?game.me:game.players[1];game.zhu.identity='zhu';game.arrangePlayers();
 const timers=new Map();let t=0;const ctx=vm.createContext({lib,game,_status:status,localStorage:storage,window:{CSH:{},addEventListener(){}},document:{addEventListener(){}},setTimeout(fn){timers.set(++t,fn);return t;},clearTimeout:id=>timers.delete(id),crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,console:{log(){},warn(){},error(){}}});
 vm.runInContext(strip(fs.readFileSync(root+'/core/csh_wallet.js','utf8')),ctx);vm.runInContext(strip(fs.readFileSync(root+'/core/csh_migrate.js','utf8')),ctx);
 const A=installAuxSpirit({lib,game,get,ui,status});return {lib,game,get,ui,status,A,data,fault,W:lib.cshWallet.wallet,M:lib.cshMigrate};
}
for(const role of ['zhu','zhong','fan'])for(let index=0;index<10;index++){
 const h=harness(role,2+index%6),before=h.game.players.slice(),money=h.W.pc(),run=h.A.start(),p=run?.spirit;
 check(role+'/'+index+' real added seat and ring',!!p&&h.game.players.length===before.length+1&&h.game.me.next===p&&p.next.previous===p&&before.every(x=>h.game.players.includes(x)));
 check(role+'/'+index+' mapping and bounded own skills',p?.identity===(role==='fan'?'fan':'zhong')&&p.identityShown&&p.skills.length===4&&!p.skills.some(k=>k.startsWith('csh_boss_')));
 if(!p)continue;
 h.A.start();check(role+'/'+index+' start is idempotent',h.game.players.length===before.length+1);
 h.game.swapControl(p);h.game.swapPlayer(p);check(role+'/'+index+' never human controlled',h.game.me===run.owner);
 const outsider=before.find(x=>x!==h.game.me),guard=h.lib.skill.csh_aux_guard,aid=h.lib.skill.csh_aux_aid,rescue=h.lib.skill.csh_aux_rescue;
 check(role+'/'+index+' guard rejects other friends',!guard.filter({player:outsider,num:2},p));
 for(let i=0;i<4;i++){const e={player:h.game.me,num:2};if(guard.filter(e,p))await guard.content({},e,p);}
 for(let i=0;i<4;i++)if(aid.filter({},p))await aid.content({},null,p);
 h.game.me.hp=0;if(rescue.filter({player:h.game.me},p))await rescue.content({},{player:h.game.me},p);
 check(role+'/'+index+' finite human-only support',p.storage.cshAuxGuard===3&&h.game.me.hand.length===3&&h.game.me.hp===1&&!rescue.filter({player:h.game.me},p)&&!aid.filter({},p));
 /* Kill the real participants in fixture, then invoke unmodified identity result rules. */
 const dead=role==='fan'?[h.game.zhu]:h.game.players.filter(x=>x.identity==='fan'||x.identity==='nei');
 dead.forEach(x=>{x.dead=true;h.game.dead.push(x);h.game.players.splice(h.game.players.indexOf(x),1);});h.game.checkResult();
 check(role+'/'+index+' native camp victory and isolated durable record',h.game.overCalls.at(-1)===true&&h.W.assistedStats().wins===1&&!h.game.ordinary&&h.W.pc()===money&&!JSON.parse(h.data.get('csh_wallet')).matchClaims);
 h.game.over(true);check(role+'/'+index+' repeated terminal callback is free',h.W.assistedStats().wins===1);
}
for(const [name,change]of [['off',h=>h.lib.config.extension_池子魔将_csh_aux_spirit=false],['nei',h=>h.game.me.identity='nei'],['full',h=>{}],['online',h=>h.status.connectMode=true],['replay',h=>h.status.video=true],['spectator',h=>h.game.observe=true],['special',h=>h.status.mode='zhong'],['boss',h=>h.lib.config.mode='boss'],['brawl',h=>h.status.brawl={}],['bad-seat',h=>h.game.me.dataset.position='NaN']]){const h=harness('zhu',name==='full'?8:4);change(h);const n=h.game.players.length;check(name+' safely skips and preserves originals',!h.A.start()&&!h.status.cshAssistedMatch&&h.game.players.length===n);}
{
 const h=harness(),before=h.game.players.slice();h.game.addPlayer=function(pos,name){const p=before[0];throw Error('injected');};check('injection failure restores arena and ordinary flow',!h.A.start()&&h.game.players.length===before.length&&!h.status.cshAssistedMatch);h.game.addRecord(true);check('rollback retains ordinary recording',h.game.ordinary===1);
}
{
 const h=harness(),r=h.A.start();h.game.over(false);check('loss is separately counted without currency',h.W.assistedStats().losses===1&&h.W.pc()===2000&&!h.game.ordinary);const x=h.W.settleAssisted(r.id,false);check('wallet itself rejects duplicate settlement',x.already&&h.W.assistedStats().losses===1);
 const portable=await h.M.inspect(await h.M.export());check('portable export retains assisted counts',portable.data.wallet.assistedStats.losses===1);
}
{
 const h=harness();h.fault.wallet=true;const r=h.W.settleAssisted('spirit-isolated-quota',true);check('failed write never increments memory',!r.ok&&h.W.assistedStats().wins===0);h.fault.wallet=false;check('safe wallet retry increments once',h.W.settleAssisted('spirit-isolated-quota',true).ok&&h.W.assistedStats().wins===1);
}
{
 const h=harness(),native=h.game.addPlayer,before=h.game.players.slice(),positions=before.map(p=>p.dataset.position);h.game.addPlayer=function(...args){const p=native.apply(this,args);p.setIdentity=function(){throw Error('injected late failure');};return p;};const result=h.A.start();check('failure after real addPlayer restores all original seats',!result&&h.game.players.length===before.length&&before.every((p,i)=>p.dataset.position===positions[i])&&!h.status.cshAssistedMatch);
}
{
 const h=harness(),oldRecord=h.game.addRecord,oldSwap=h.game.swapControl;h.A.start();h.game.players=[];h.lib.config.extension_池子魔将_csh_aux_spirit=false;h.A.start();check('next disabled game restores scoped native hooks and marker',h.game.addRecord===oldRecord&&h.game.swapControl===oldSwap&&!h.status.cshAssistedMatch);
}
{
 const h=harness(),r=h.A.start();let animation=null;r.spirit.$skill=(name,type,color)=>{animation={name,type,color};};await h.lib.skill.csh_aux_entry.content({},null,r.spirit);
 check('entry uses native skill animation argument positions',animation?.type==='legend'&&animation?.color==='water');check('entry records explicit assisted replay storage',h.game.video?.[0]==='storage'&&h.game.video[2][0]==='cshAssistedMatch'&&h.game.video[2][1].type==='identity_with_spirit');
}
const result={scope:'actual auxiliary/wallet/migration, native host addPlayer and identity checkResult; 30 synthetic complete role scenarios, not 30 natural games',passed:rows.filter(x=>x.passed).length,failed:rows.filter(x=>!x.passed).length,failures:rows.filter(x=>!x.passed)};console.log(JSON.stringify(result,null,2));if(result.failed)process.exitCode=1;
