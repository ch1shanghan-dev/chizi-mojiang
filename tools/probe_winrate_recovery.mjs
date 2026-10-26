// Actual winrate module in an isolated VM. No game imports or real player profiles.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const option=n=>{const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1];};
const filename=option('--source')||path.join(root,'core/csh_winrate.js');
const source=fs.readFileSync(filename,'utf8').replace(/^import[^\n]*\n/gm,'').replace(/^export default null;.*$/gm,'');
const KEY='extension_池子魔将_winrateData', rows=[];
const clone=v=>JSON.parse(JSON.stringify(v));
const entry=()=>({games:2,win:1,lose:1,damage:4,damaged:2,gain:6,discard:2,kill:1});
const data=()=>({identity:{hero:entry(),enemy:entry()},versus:{hero:entry()},doudizhu:{},guozhan:{},camps:{zhu:{games:2,win:1,lose:1}},me:{chars:{hero:{games:2,win:1,lose:1}},camps:{zhu:{games:2,win:1,lose:1}}}});
function check(name,fn){try{const value=fn();rows.push({name,passed:value===true,detail:value===true?undefined:value});}catch(e){rows.push({name,passed:false,error:e.message});}}
function fixture(initial=data()){
  const store=new Map(),writes=[],timers=new Map(),confirmations=[],notices=[];
  let pending=false,busy=false,fault=false,seq=0,originalOvers=0;
  class Node{
    constructor(tag='div'){this.tagName=tag;this.children=[];this.parentNode=null;this.attrs={};this.events={};this.style={};this.value='';this.classList={add(){},remove(){},toggle(){}};}
    appendChild(n){n.parentNode=this;this.children.push(n);return n;}
    removeChild(n){this.children=this.children.filter(v=>v!==n);n.parentNode=null;}
    addEventListener(k,fn){this.events[k]=fn;}
    setAttribute(k,v){this.attrs[k]=v;}
    getAttribute(k){return this.attrs[k]??null;}
    querySelector(sel){const id=sel[0]==='#'?sel.slice(1):null;for(const n of this.children){if(id&&n.id===id)return n;const found=n.querySelector(sel);if(found)return found;}return null;}
    set innerHTML(text){this.html=text;this.children=[];for(const match of text.matchAll(/<([\w-]+)[^>]*\bid="([^"]+)"[^>]*>/g)){const n=new Node(match[1]);n.id=match[2];this.appendChild(n);}}
    get innerHTML(){return this.html||'';}
    focus(){}
  }
  const document={documentElement:new Node(),body:new Node(),createElement:t=>new Node(t),addEventListener(){},getElementById(id){return this.documentElement.querySelector('#'+id)||this.body.querySelector('#'+id);}};
  const lib={config:{[KEY]:clone(initial)},translate:{},cshMigrate:{recoveryState:()=>({pending,busy})},cshUI:{confirm(o,cb){confirmations.push(cb);},notice(t){notices.push(t);},toast(t){notices.push(t);}}};
  const localStorage={getItem(k){if(fault&&k==='csh_migrate_recovery')throw Error('storage unavailable');return store.get(k)??null;}};
  const me={name:'hero',name1:'hero',playerid:'me',side:true,identity:'zhu',stat:[{damage:3}]};
  const enemy={name:'enemy',name1:'enemy',playerid:'enemy',side:false,identity:'fan'};
  const game={players:[me,enemy],dead:[],me,over(){originalOvers++;},checkOnlineResult:p=>p===me,saveConfig(k,v){writes.push(clone(v));lib.config[k]=v;}};
  const context=vm.createContext({lib,game,ui:{},get:{mode:()=> 'identity',translation:n=>n},ai:{},_status:{},document,window:{},localStorage,console,navigator:{},confirm:()=>false,setTimeout(fn){const id=++seq;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}});
  // Expose closure functions only inside this VM. Render is a read-only DOM stub;
  // real action dispatch, confirmation callbacks and IO handlers remain intact.
  const hook=`wr.__probe={readData,record,recordCamp,recordMe,capture,mergePayload,delChar,exportData,importData,openClearAll}; render=function(){readData();}; ensureStyle=function(){};`;
  vm.runInContext(source.replace('lib.csh_winrate=wr;',hook+'\nlib.csh_winrate=wr;'),context);
  const wr=lib.csh_winrate,api=wr.__probe;
  const click=(node,act,val)=>{const t=new Node();t.setAttribute('data-act',act);if(val)t.setAttribute('data-val',val);t.parentNode=node;node.events.click({target:t});};
  return {lib,game,wr,api,document,writes,confirmations,timers,raw:()=>JSON.stringify(lib.config[KEY]),overs:()=>originalOvers,
    lock(state){if(['persisted','broken','startup'].includes(state))store.set('csh_migrate_recovery',state==='broken'?'{':'{"v":1}');if(state==='pending')pending=true;if(state==='busy')busy=true;if(state==='read-fault')fault=true;if(state==='guard-throw')lib.cshWallet={saveGuard:{blocked(){throw Error('guard failed');}}};if(state==='wallet')lib.cshWallet={saveGuard:{blocked:()=>true}};if(state==='startup')delete lib.cshMigrate;},
    unlock(){store.clear();pending=false;busy=false;fault=false;delete lib.cshWallet;},
    open(){wr.open();return document.getElementById('csh-wr-root');},
    act(act,val){const node=document.getElementById('csh-wr-root')||this.open();click(node,act,val);},
    io(act){click(document.getElementById('csh-wr-io'),act);},
    input(id,value){document.getElementById(id).value=value;},
    flush(){for(const [id,fn]of [...timers]){timers.delete(id);fn();}}};
}
const payload={__csh:'winrate',ver:1,data:{identity:{hero:entry()}}};
const mutationCases=[
  ['record character',h=>h.api.record('identity','hero',true,{damage:1,damaged:0,gain:0,discard:0,kill:0})],
  ['record camp',h=>h.api.recordCamp('zhu',true)],
  ['record personal character',h=>h.api.recordMe('chars','hero',true)],
  ['record personal camp',h=>h.api.recordMe('camps','zhu',true)],
  ['native game over',h=>h.game.over(true)],
  ['merge payload',h=>h.api.mergePayload(payload)],
  ['import click',h=>{h.api.importData();h.input('csh-wr-io-text',JSON.stringify(payload));h.io('io-import');}],
  ['clear all',h=>{h.api.openClearAll(h.open());h.input('csh-wr-io-input','确认');h.io('io-confirm');}],
  ['delete character',h=>{h.api.delChar('hero',h.open());h.confirmations.shift()?.(true);}],
  ['reset camps',h=>{h.act('resetcamps');h.confirmations.shift()?.(true);}],
  ['clear mode',h=>{h.act('clearmode');h.confirmations.shift()?.(true);}],
  ['undo',h=>{h.wr._undo={identity:{restored:entry()}};h.act('undo');}],
];
for(const state of ['persisted','broken','pending','busy','read-fault','startup','guard-throw','wallet']){
  for(const [name,run]of mutationCases)check(state+' blocks '+name+' before config mutation/save',()=>{const h=fixture(),original=h.lib.config[KEY],before=h.raw();h.lock(state);run(h);return h.raw()===before&&h.lib.config[KEY]===original&&h.writes.length===0;});
  check(state+' allows sanitized read/export without rewriting history',()=>{const dirty={identity:{hero:{...entry(),games:90,damage:-1,name:'stale',draw:4}},versus:{offline:{hero:entry()},online:{hero:entry()}},camps:{bad:{games:5,win:0,lose:0}}};const h=fixture(dirty),before=h.raw();h.lock(state);const view=h.api.readData();h.api.exportData();view.identity.hero.win=999;return h.raw()===before&&h.writes.length===0&&view.identity.hero.games===2&&view.versus.hero.games===4&&!view.camps;});
}
for(const action of ['delete','resetcamps','clearmode'])check('lock beginning during '+action+' confirmation rejects late callback',()=>{const h=fixture(),root=h.open();if(action==='delete')h.api.delChar('hero',root);else h.act(action);const cb=h.confirmations.shift();if(!cb)return false;const before=h.raw();h.lock('persisted');cb(true);return h.raw()===before&&h.writes.length===0&&!h.wr._undo;});
for(const action of ['import','clearall'])check('lock beginning after '+action+' dialog opens rejects delayed click',()=>{const h=fixture(),root=h.open();if(action==='import'){h.api.importData();h.input('csh-wr-io-text',JSON.stringify(payload));}else{h.api.openClearAll(root);h.input('csh-wr-io-input','确认');}const before=h.raw();h.lock('persisted');h.io(action==='import'?'io-import':'io-confirm');h.flush();return h.raw()===before&&h.writes.length===0;});
check('blocked undo retains pending snapshot for retry',()=>{const h=fixture();h.wr._undo={identity:{restored:entry()}};h.open();h.lock('persisted');h.act('undo');if(!h.wr._undo)return false;h.unlock();h.act('undo');return !h.wr._undo&&h.lib.config[KEY].identity.restored.games===2;});
check('blocked game over still invokes previous native over exactly once',()=>{const h=fixture();h.lock('persisted');h.game.over(true);return h.overs()===1&&h.writes.length===0;});
check('read always detaches clean nested config data',()=>{const h=fixture(),original=h.lib.config[KEY],before=h.raw(),view=h.api.readData();view.identity.hero.games=999;view.me.chars.hero.win=99;return h.raw()===before&&h.lib.config[KEY]===original&&h.writes.length===0;});
check('normal historical cleaning persists once and retains original object',()=>{const h=fixture({identity:{hero:{...entry(),games:99,damage:-1,name:'stale'}}}),original=h.lib.config[KEY],before=JSON.stringify(original);const view=h.api.readData();h.api.readData();return view.identity.hero.games===2&&view.identity.hero.damage===0&&!('name'in view.identity.hero)&&h.writes.length===1&&JSON.stringify(original)===before;});
check('historical cleaning return value remains detached after host adopts saved object',()=>{const h=fixture({identity:{hero:{...entry(),games:99}}}),view=h.api.readData(),before=h.raw();view.identity.hero.win=999;return h.raw()===before&&h.lib.config[KEY]!==view;});
check('late delete reads fresh history and only deletes originally confirmed mode',()=>{const h=fixture(),root=h.open();h.api.delChar('hero',root);const cb=h.confirmations.shift();h.lib.config[KEY].identity.newcomer=entry();h.wr.mode='versus';cb(true);const d=h.lib.config[KEY];return !d.identity.hero&&d.identity.newcomer.games===2&&d.versus.hero.games===2&&h.wr._undo.identity.newcomer.games===2;});
check('late clear mode only clears originally confirmed mode',()=>{const h=fixture();h.act('clearmode');h.wr.mode='versus';h.confirmations.shift()(true);const d=h.lib.config[KEY];return Object.keys(d.identity||{}).length===0&&d.versus.hero.games===2;});
check('recovery starts in host winner callback before first record',()=>{const h=fixture(),before=h.raw();h.game.checkOnlineResult=()=>{h.lock('persisted');return true;};h.game.over(true);return h.raw()===before&&h.writes.length===0&&h.overs()===1;});
check('blocked import displays recovery reason and keeps editable dialog',()=>{const h=fixture();h.api.importData();h.input('csh-wr-io-text',JSON.stringify(payload));h.lock('persisted');h.io('io-import');const stat=h.document.getElementById('csh-wr-io-stat'),ta=h.document.getElementById('csh-wr-io-text');return stat.textContent==='存档操作尚未完成，请先在行囊恢复后再继续'&&stat.className==='bad'&&!ta.disabled&&h.writes.length===0;});
check('delayed undo expiry and focus callbacks cannot save during recovery',()=>{const h=fixture(),root=h.open();h.api.delChar('hero',root);h.confirmations.shift()(true);h.api.importData();const before=h.raw(),writes=h.writes.length;h.lock('persisted');h.flush();return h.raw()===before&&h.writes.length===writes;});
check('invalid import and cancel confirmation never change statistics',()=>{const h=fixture(),root=h.open(),before=h.raw();h.api.importData();h.input('csh-wr-io-text','broken');h.io('io-import');h.api.delChar('hero',root);h.confirmations.shift()(false);return h.raw()===before&&h.writes.length===0&&!h.wr._undo;});
check('normal capture keeps hero/camp/personal formulas',()=>{const h=fixture({});h.game.over(true);const d=h.lib.config[KEY];return h.overs()===1&&d.identity.hero.games===1&&d.identity.hero.win===1&&d.identity.hero.damage===3&&d.identity.enemy.lose===1&&d.camps.zhu.win===1&&d.me.chars.hero.games===1&&d.me.camps.zhu.win===1;});
check('normal import accumulates existing history',()=>{const h=fixture();h.api.importData();h.input('csh-wr-io-text',JSON.stringify(payload));h.io('io-import');return h.lib.config[KEY].identity.hero.games===4&&h.lib.config[KEY].identity.hero.win===2&&h.lib.config[KEY].identity.hero.damage===8;});
check('normal delete and undo restore full snapshot',()=>{const h=fixture(),root=h.open(),before=h.raw();h.api.delChar('hero',root);h.confirmations.shift()(true);if(h.lib.config[KEY].identity.hero||h.lib.config[KEY].me.chars?.hero)return false;h.act('undo');return h.raw()===before&&!h.wr._undo;});
check('normal reset camps preserves characters',()=>{const h=fixture();h.act('resetcamps');h.confirmations.shift()(true);const d=h.lib.config[KEY];return !d.camps&&!d.me.camps&&d.identity.hero.games===2&&d.me.chars.hero.games===2;});
check('normal clear mode preserves other scopes',()=>{const h=fixture();h.act('clearmode');h.confirmations.shift()(true);const d=h.lib.config[KEY];return Object.keys(d.identity||{}).length===0&&d.versus.hero.games===2&&d.me.chars.hero.games===2;});
check('normal clear all requires exact confirmation',()=>{const h=fixture();h.api.openClearAll(h.open());h.input('csh-wr-io-input','no');const before=h.raw();h.io('io-confirm');if(h.raw()!==before)return false;h.input('csh-wr-io-input','确认');h.io('io-confirm');return Object.keys(h.lib.config[KEY].identity||{}).length===0&&!h.lib.config[KEY].me;});
check('recovery completion allows fresh record without replaying blocked progress',()=>{const h=fixture({});h.lock('persisted');h.game.over(true);h.unlock();h.game.over(true);return h.lib.config[KEY].me.chars.hero.games===1&&h.lib.config[KEY].identity.hero.games===1;});
const failures=rows.filter(r=>!r.passed);
console.log(JSON.stringify({scope:'actual winrate module, memory-only config/storage, DOM event stubs; no real profile',source:filename,passed:rows.length-failures.length,failed:failures.length,failures},null,2));
process.exitCode=failures.length?1:0;
