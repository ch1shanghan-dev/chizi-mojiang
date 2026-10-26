// Real interaction module and native Player.throwEmotion; isolated memory only.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {root,host,parse,walk,keyOf} from './lib/skill_audit.mjs';
const option=n=>{const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1];};
const filename=option('--source')||path.join(root,'core/csh_interact.js');
const raw=fs.readFileSync(filename,'utf8');
const nativeSource=fs.readFileSync(path.join(host,'noname/library/element/player.js'),'utf8');
let nativeThrow;
walk(parse(nativeSource),n=>{if(n.type==='MethodDefinition'&&keyOf(n)==='throwEmotion')nativeThrow=nativeSource.slice(...n.range);});
if(!nativeThrow)throw Error('Native throwEmotion missing');
const PREFIX='extension_池子魔将_csh_interact',CUSTOM=PREFIX+'_custom',COUNT='csh_player_interact';
const rows=[];function check(name,fn){try{const value=fn();rows.push({name,passed:value===true,detail:value===true?undefined:value});}catch(e){rows.push({name,passed:false,error:e.message});}}
function fixture(){
  const storage=new Map([[COUNT,'{"v":1,"total":3}']]),writes=[],configWrites=[],notices=[],timers=new Map();
  let pending=false,busy=false,recoveryReadFault=false,writeFault=false,configFault=false,seq=0;
  class Node{
    constructor(tag){this.tagName=tag;this.children=[];this.parentNode=null;this.style={};this.events={};this.className='';this.value='';}
    appendChild(n){this.children.push(n);n.parentNode=this;return n;}
    removeChild(n){this.children=this.children.filter(c=>c!==n);n.parentNode=null;}
    addEventListener(k,fn){this.events[k]=fn;}
    set innerHTML(text){this.html=text;this.children=[];}
    get innerHTML(){return this.html||'';}
    querySelectorAll(sel){const matches=n=>sel[0]==='.'?n.className.split(' ').includes(sel.slice(1)):sel[0]==='#'?n.id===sel.slice(1):n.tagName===sel;const result=[];for(const c of this.children){if(matches(c))result.push(c);result.push(...c.querySelectorAll(sel));}return result;}
    querySelector(sel){return this.querySelectorAll(sel)[0]||null;}
  }
  const document={documentElement:new Node('html'),head:new Node('head'),body:new Node('body'),createElement:t=>new Node(t),addEventListener(){},getElementById(id){return this.documentElement.querySelector('#'+id)||this.head.querySelector('#'+id)||this.body.querySelector('#'+id);}};
  const localStorage={getItem(k){if(recoveryReadFault&&k==='csh_migrate_recovery')throw Error('recovery read failed');return storage.get(k)??null;},setItem(k,v){if(writeFault)throw Error('write failed');writes.push(k);storage.set(k,String(v));}};
  const ctx=vm.createContext({localStorage,document,EXTRA_LINES:{},GEN_LINES:{},console:{log(){},warn(){},error(){}},setTimeout(fn){const id=++seq;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}});
  ctx.notice=text=>notices.push(text);ctx.configSave=(k,v)=>{if(configFault)throw Error('config failed');configWrites.push(k);if(v===undefined)delete ctx.lib.config[k];else ctx.lib.config[k]=v;};
  vm.runInContext(`var visuals=0,nativeFails=false,lockDuringNative=null;
    class Player { constructor(id){this.name=this.playerid=id;this.alive=true;this.node={avatar:{}};} isIn(){return this.alive;} isUnderControl(){return false;} $throwEmotion(){visuals++;} chat(){visuals++;} ${nativeThrow} }
    var me=new Player('me'),npc=new Player('npc'),other=new Player('other');
    var lib={config:{'${PREFIX}':true,'${PREFIX}_chat':true,'${PREFIX}_rate':'normal','${PREFIX}_online':false,'${CUSTOM}':{egg:['old'],wine:['toast']}},skill:{},translate:{},element:{Player},cshUI:{toast:notice}};
    var game={me,players:[me,npc,other],roundNumber:1,over(){},addGlobalSkill(){},saveConfig:configSave,broadcastAll(fn,...args){if(nativeFails)throw Error('native failure');fn(...args);if(lockDuringNative)lockDuringNative();}};
    var _status={gameStarted:true},ui={},get={attitude(){return -2;},translation(v){return v.name||String(v);}};
    Array.prototype.randomGet=function(){return this[0];};`,ctx);
  ctx.lib.cshMigrate={recoveryState:()=>({pending,busy})};
  const hook='globalThis.interactProbe={saveCfg,queueScene,scene:()=>({epoch:sceneEpoch,chatEpoch:sceneChatEpoch,pending:sceneTimers.size})};\n';
  vm.runInContext(raw.replace(/^import .*?;\r?\n/gm,'').replace('lib.cshInteract.openPanel = openPanel;',hook+'lib.cshInteract.openPanel = openPanel;'),ctx);
  ctx.lib.cshInteract.install();
  return {ctx,api:ctx.lib.cshInteract,probe:ctx.interactProbe,storage,writes,configWrites,notices,timers,document,
    lock(state){if(['persisted','broken','startup'].includes(state))storage.set('csh_migrate_recovery',state==='broken'?'{':'{"v":1}');if(state==='pending')pending=true;if(state==='busy')busy=true;if(state==='read-fault')recoveryReadFault=true;if(state==='wallet')ctx.lib.cshWallet={saveGuard:{blocked:()=>true}};if(state==='guard-throw')ctx.lib.cshWallet={saveGuard:{blocked(){throw Error('guard failed');}}};if(state==='startup')delete ctx.lib.cshMigrate;},
    unlock(){storage.delete('csh_migrate_recovery');pending=false;busy=false;recoveryReadFault=false;delete ctx.lib.cshWallet;},
    failConfig(){configFault=true;},failStorage(){writeFault=true;},
    snapshot:()=>JSON.stringify({config:ctx.lib.config,counter:storage.get(COUNT)}),
    send(){return vm.runInContext("me.throwEmotion(npc,'egg')",ctx);},
    click(n){if(!n)throw Error('Missing DOM control');n.events.click({target:n,preventDefault(){},stopPropagation(){}});},
    open(){ctx.lib.cshInteract.openPanel();return document.getElementById('csh-ia-panel');},
    flush(){for(const [id,fn]of [...timers]){timers.delete(id);fn();}}};
}
const mutations=[
  ['native successful prop count',h=>h.send()],
  ['custom add',h=>h.api.setCustom('egg',['new'])],
  ['custom delete category',h=>h.api.setCustom('egg',[])],
  ['custom delete all',h=>{h.api.setCustom('egg',[]);h.api.setCustom('wine',[]);}],
  ['enable setting',h=>h.probe.saveCfg(PREFIX,false)],
  ['chat setting',h=>h.probe.saveCfg(PREFIX+'_chat',false)],
  ['rate setting',h=>h.probe.saveCfg(PREFIX+'_rate','high')],
  ['online setting',h=>h.probe.saveCfg(PREFIX+'_online',true)],
];
for(const state of ['persisted','broken','pending','busy','read-fault','startup','wallet','guard-throw']){
  for(const [name,run]of mutations)check(state+' freezes '+name+' before config/storage mutation',()=>{const h=fixture(),custom=h.ctx.lib.config[CUSTOM],before=h.snapshot();h.lock(state);run(h);return h.snapshot()===before&&h.ctx.lib.config[CUSTOM]===custom&&h.writes.length===0&&h.configWrites.length===0&&(name!=='native successful prop count'||h.ctx.visuals===1);});
  check(state+' retains read views and native chat/throw visuals',()=>{const h=fixture();h.lock(state);const before=h.snapshot();h.api.getCustom().egg.push('detached');h.ctx.npc.chat('hello');h.send();return h.api.customCount()===2&&h.api.stats().playerThrows===3&&h.ctx.visuals===2&&h.snapshot()===before;});
  check(state+' does not cancel queued visual callbacks on rejected setting',()=>{const h=fixture();h.probe.queueScene(()=>{h.ctx.visuals++;},100,h.ctx.npc,h.ctx.other,true);const before=JSON.stringify(h.probe.scene());h.lock(state);h.probe.saveCfg(PREFIX,false);h.probe.saveCfg(PREFIX+'_chat',false);if(JSON.stringify(h.probe.scene())!==before)return false;h.flush();return h.ctx.visuals===1;});
}
for(const action of ['enable','chat','rate'])check('dialog opened before recovery retains '+action+' control on late click',()=>{const h=fixture(),panel=h.open(),before=h.snapshot();const control=action==='rate'?panel.querySelectorAll('.it')[2]:panel.querySelectorAll('.csh-ia-sw')[action==='enable'?0:1],className=control.className;h.lock('persisted');h.click(control);return h.snapshot()===before&&control.className===className&&h.configWrites.length===0;});
check('custom editor opened before recovery rejects late add and preserves typed draft',()=>{const h=fixture(),panel=h.open();h.click(panel.querySelectorAll('.csh-ia-btn').find(n=>n.textContent==='管理自定义台词'));const ov=h.document.getElementById('csh-ia-cust-ov'),inp=ov.querySelector('input'),before=h.snapshot();inp.value='new draft';h.lock('persisted');h.click(ov.querySelector('.b'));return h.snapshot()===before&&inp.value==='new draft'&&h.notices.includes('存档操作尚未完成，请先在行囊恢复后再继续');});
check('custom editor opened before recovery rejects late delete',()=>{const h=fixture(),panel=h.open();h.click(panel.querySelectorAll('.csh-ia-btn').find(n=>n.textContent==='管理自定义台词'));const ov=h.document.getElementById('csh-ia-cust-ov'),before=h.snapshot();h.lock('persisted');h.click(ov.querySelector('.del'));return h.snapshot()===before&&ov.querySelectorAll('.csh-cust-line').length===1;});
check('lock appears inside successful native operation before counter hook',()=>{const h=fixture(),before=h.snapshot();h.ctx.lockDuringNative=()=>h.lock('persisted');h.send();return h.ctx.visuals===1&&h.snapshot()===before&&h.writes.length===0;});
check('failed native operation preserves exception and never records success',()=>{const h=fixture(),before=h.snapshot();h.ctx.nativeFails=true;let threw=false;try{h.send();}catch{threw=true;}return threw&&h.ctx.visuals===0&&h.snapshot()===before&&h.writes.length===0;});
check('normal native operation preserves undefined return and increments once',()=>{const h=fixture(),result=h.send();return result===undefined&&h.ctx.visuals===1&&h.api.stats().playerThrows===4&&h.writes.length===1;});
check('failed counter storage preserves native visual and lifetime total',()=>{const h=fixture();h.failStorage();h.send();return h.ctx.visuals===1&&h.api.stats().playerThrows===3;});
check('normal custom write trims new lines without mutating original config object',()=>{const h=fixture(),original=h.ctx.lib.config[CUSTOM],before=JSON.stringify(original);const result=h.api.setCustom('egg',[' new ','',4]);return result===true&&JSON.stringify(original)===before&&h.api.getCustom().egg.join()==='new'&&h.api.getCustom().wine[0]==='toast';});
check('normal empty custom removes full config key',()=>{const h=fixture();h.api.setCustom('egg',[]);h.api.setCustom('wine',[]);return !Object.hasOwn(h.ctx.lib.config,CUSTOM)&&h.api.customCount()===0;});
check('synchronous config failure does not mutate custom history or report success',()=>{const h=fixture(),before=h.snapshot();h.failConfig();const result=h.api.setCustom('egg',['new']);return result===false&&h.snapshot()===before;});
check('synchronous setting failure does not cancel queued visual callback',()=>{const h=fixture();h.probe.queueScene(()=>{h.ctx.visuals++;},100,h.ctx.npc,h.ctx.other,true);const before=JSON.stringify(h.probe.scene());h.failConfig();const result=h.probe.saveCfg(PREFIX,false);if(result!==false||JSON.stringify(h.probe.scene())!==before)return false;h.flush();return h.ctx.visuals===1;});
check('normal settings preserve scene invalidation after successful save',()=>{const h=fixture();h.probe.queueScene(()=>{},100,h.ctx.npc,h.ctx.other,true);const epoch=h.probe.scene().epoch,chatEpoch=h.probe.scene().chatEpoch;return h.probe.saveCfg(PREFIX,false)===true&&h.probe.scene().pending===0&&h.probe.scene().epoch===epoch+1&&h.probe.saveCfg(PREFIX+'_chat',false)===true&&h.probe.scene().chatEpoch===chatEpoch+1;});
check('wallet-free normal startup keeps writes available',()=>{const h=fixture();delete h.ctx.lib.cshMigrate;h.send();return h.api.stats().playerThrows===4&&h.api.setCustom('egg',['normal'])===true;});
check('recovery completion resumes only new calls without replaying blocked props',()=>{const h=fixture();h.lock('persisted');h.send();h.unlock();h.send();return h.ctx.visuals===2&&h.api.stats().playerThrows===4&&h.writes.length===1;});
check('normal setting fallback without game.saveConfig retains config semantics',()=>{const h=fixture();delete h.ctx.game.saveConfig;return h.probe.saveCfg(PREFIX+'_rate','low')===true&&h.ctx.lib.config[PREFIX+'_rate']==='low'&&h.api.setCustom('egg',[])===true&&!h.api.getCustom().egg;});
check('late blocked custom deletion can retry without consuming stale local list',()=>{const h=fixture();h.api.setCustom('egg',['first','second']);const panel=h.open();h.click(panel.querySelectorAll('.csh-ia-btn').find(n=>n.textContent==='管理自定义台词'));const ov=h.document.getElementById('csh-ia-cust-ov'),del=ov.querySelectorAll('.del')[1];h.lock('persisted');h.click(del);h.unlock();h.click(del);return h.api.getCustom().egg.join()==='first';});
check('native human props alone count while extension demo remains visual',()=>{const h=fixture();h.api.throw(h.ctx.me,h.ctx.npc,'egg');return h.ctx.visuals===1&&h.api.stats().playerThrows===3&&h.writes.length===0;});
check('real migration registry includes lifetime props but not interaction config keys',()=>{const migration=fs.readFileSync(path.join(root,'core/csh_migrate.js'),'utf8');let counter,defs;walk(parse(migration),n=>{if(n.type==='VariableDeclarator'&&n.id.name==='K_PLAYER_INTERACT')counter=n.init.value;if(n.type==='VariableDeclarator'&&n.id.name==='KEY_DEFS')defs=n.init;});return counter===COUNT&&defs.elements.some(n=>n.elements?.[0]?.value==='playerInteract'&&n.elements[1].name==='K_PLAYER_INTERACT'&&n.elements[3].value===0)&&![PREFIX,PREFIX+'_rate',PREFIX+'_chat',PREFIX+'_online',CUSTOM].some(k=>migration.includes('"'+k+'"'));});
const failures=rows.filter(r=>!r.passed);console.log(JSON.stringify({scope:'actual interaction/native source, isolated memory config/storage and DOM event stubs; no real profile',source:filename,passed:rows.length-failures.length,failed:failures.length,failures},null,2));process.exitCode=failures.length?1:0;
