// Actual shared page, wallet and selected HTML functions; disposable VM/browser, no player profile.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {root,parse,walk} from './lib/skill_audit.mjs';
import {openProbe} from './lib/browser_probe.mjs';
const opt=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];};
const source=fs.readFileSync(opt('--source',path.join(root,'core/csh_page.js')),'utf8');
const walletSource=fs.readFileSync(path.join(root,'core/csh_wallet.js'),'utf8').replace(/^import .*?;\r?\n/gm,'');
const rows=[];
async function check(name,fn){try{const r=await fn();rows.push({name,passed:r===true,...(r===true?{}:{detail:r})});}catch(e){rows.push({name,passed:false,detail:e.message});}}
function storage(){const data=new Map();return {data,readFault:false,writeFault:false,getItem(k){if(this.readFault)throw Error('read failed');return data.get(k)??null;},setItem(k,v){if(this.writeFault)throw Error('quota');data.set(k,String(v));},removeItem:k=>data.delete(k),key:i=>[...data.keys()][i]??null,get length(){return data.size;}};}
function host(){const store=storage(),lib={config:{},skill:{},translate:{}},window={CSH:{},addEventListener(){}};
 const ctx=vm.createContext({lib,window,game:{},ui:{},get:{},ai:{},_status:{},localStorage:store,document:{addEventListener(){}},crypto:webcrypto,console:{warn(){},error(){},log(){}},setTimeout:()=>1,clearTimeout(){}});
 vm.runInContext(walletSource,ctx);return {store,lib,api:lib.cshWallet,window};}
function page(h=host(),{standalone=false,debug=false}={}){
 const events={},sent=[],timers=[],store=standalone?storage():h.store;
 const doc={getElementById:()=>null,createElement:()=>({setAttribute(){},style:{},parentNode:null}),body:{appendChild(){}},documentElement:{appendChild(){}}};
 const parent=standalone?null:{CSH:{wallet:h.api},localStorage:store,postMessage:m=>sent.push(m)};
 if(debug)parent.lib=h.lib;
 const win={document:doc,localStorage:store,addEventListener:(n,f)=>events[n]=f};win.parent=parent||win;
 const ctx=vm.createContext({window:win,document:doc,localStorage:store,console,setTimeout:f=>(timers.push(f),timers.length),clearTimeout(){}});
 vm.runInContext(source,ctx,{filename:'csh_page.js'});
 const p={h,ctx,win,parent,store,sent,timers,events,P:win.CSHPage,adopt(){h.api.reloadSave({wallet:{pc:1234},rank:null,dailyTask:null},{memoryOnly:true});},ack(msg,ok=true,data={}){events.message({source:parent,data:{__csh:msg.__csh+'-ack',req:msg.req,ok,data}});}};
 return p;
}
await check('real wallet exports identical lib and non-debug CSH API',()=>{const h=host();return h.window.CSH.wallet===h.api&&typeof h.api.saveEpoch==='function';});
for(const debug of [false,true])await check('normal write and epoch invalidation '+(debug?'lib':'CSH-only'),()=>{const p=page(host(),{debug});if(!p.P.lsSet('setting','old'))return false;p.adopt();p.store.setItem('setting','imported');return !p.P.lsSet('setting','old')&&p.store.getItem('setting')==='imported'&&p.h.api.wallet.pc()===1234;});
await check('fresh child after adoption may write',()=>{const h=host(),p=page(h);p.adopt();return page(h).P.lsSet('setting','fresh')&&h.store.getItem('setting')==='fresh';});
await check('ordinary wallet operations leave page epoch valid',()=>{const p=page(),n=p.h.api.saveEpoch();p.h.api.wallet.add(10,'probe');return p.h.api.saveEpoch()===n&&p.P.lsSet('setting','ok');});
for(const state of ['pending','busy','err'])await check('migration '+state+' refuses without mutating local data',()=>{const p=page();p.parent.CSH.migrate={recoveryState:()=>({pending:state==='pending',busy:state==='busy',err:state==='err'?'bad':undefined})};return !p.P.lsSet('setting','bad')&&!p.store.getItem('setting');});
await check('durable recovery journal refuses then allows unchanged snapshot',()=>{const p=page();p.store.setItem('csh_migrate_recovery','{}');if(p.P.lsSet('setting','bad'))return false;p.store.removeItem('csh_migrate_recovery');return p.P.lsSet('setting','ok');});
await check('read failure refuses without losing existing value',()=>{const p=page();p.store.setItem('setting','saved');p.store.readFault=true;const result=p.P.lsSet('setting','bad');p.store.readFault=false;return result===false&&p.store.getItem('setting')==='saved';});
await check('quota failure returns false and retry succeeds',()=>{const p=page();p.store.writeFault=true;if(p.P.lsSet('setting','bad')!==false)return false;p.store.writeFault=false;return p.P.lsSet('setting','ok');});
await check('wallet identity change permanently invalidates old child',()=>{const p=page(),api=p.parent.CSH.wallet;p.parent.CSH.wallet={...api};if(p.P.saveAllowed())return false;p.parent.CSH.wallet=api;return !p.P.saveAllowed();});
await check('missing epoch fails closed',()=>{const h=host();h.api.saveEpoch=undefined;return !page(h).P.lsSet('setting','bad');});
await check('standalone preview local storage remains writable',()=>page(host(),{standalone:true}).P.lsSet('setting','ok'));
await check('cross-origin parent access fails closed',()=>{const p=page();Object.defineProperty(p.parent,'CSH',{get(){throw Error('cross origin');}});return !p.P.lsSet('setting','bad');});
const mutations=['shell-settle','shell-settle-session','shell-task-add','shell-merit','shell-sign','shell-relief','shell-ach-claim','shell-pool-ach-claim','shell-trade','shell-goldfish','shell-market-new','shell-aff-do','shell-cheer','shell-bounty','shell-seat','shell-world-round','shell-world-result','shell-open'];
for(const name of mutations)await check('stale document cannot send '+name,()=>{const p=page(),T=p.P.transport();p.adopt();let result;T.call(name,{},(ok,data)=>result={ok,data});return p.sent.length===0&&result?.ok===false&&result?.data?.recovery===true;});
await check('ACK arriving after adoption cannot confirm stale settlement',()=>{const p=page(),T=p.P.transport();let result;T.settle('shell-settle',{},ok=>result=ok);p.adopt();p.ack(p.sent[0]);return result===false&&!T.isSettled();});
await check('normal settlement ACK remains once-only',()=>{const p=page(),T=p.P.transport();let calls=0;T.settle('shell-settle',{},ok=>{if(ok)calls++;});p.ack(p.sent[0]);p.ack(p.sent[0]);return calls===1&&T.isSettled()&&!T.claim();});
for(const name of ['shell-wallet','shell-stats','shell-mig-import','shell-mig-recover'])await check('stale page can still query or recover '+name,()=>{const p=page(),T=p.P.transport();p.adopt();T.call(name,{},()=>{});return p.sent.length===1;});
await check('stale page close is still available',()=>{const p=page(),T=p.P.transport({closeName:'texas-close'});p.adopt();T.close();return p.sent[0]?.__csh==='texas-close';});
// Host dispatcher independently rejects messages already queued before adoption.
const shellSource=fs.readFileSync(opt('--shell-source',path.join(root,'core/csh_shell.js')),'utf8'),shellFunctions=new Map();
walk(parse(shellSource),n=>{if(n.type==='FunctionDeclaration')shellFunctions.set(n.id.name,shellSource.slice(...n.range));});
function shellPage(){
 const h=host(),ctx=vm.createContext({lib:h.lib,localStorage:h.store,document:{getElementById:()=>null},Math}),acks=[],calls=[];
 Object.assign(ctx,{wallet:()=>h.api,fromCurrentFrame:()=>true,ackToGame:(cmd,ok,data)=>acks.push({cmd,ok,data}),logError(){},logInfo(){},paintPc(){},toast(){},captureMigReply:()=>(cmd,ok,data)=>acks.push({cmd,ok,data}),cancelSelfClose(){}});
 vm.runInContext('var SAVE_SESSION=null,CUR_REQ=null,current="texas",META={texas:{}},LEGACY_CLOSE={},GUARD={},TABLE_WORLD=null,TABLE_AFF={minions:[],awarded:false},SHELL_GENERATION=0,OV_ID="overlay";',ctx);
 for(const name of ['captureSaveSession','sessionSaveBlocked','sessionRefused','persistenceBlocked','persistenceRefused','onMessage','cshWorldTableFinish','cshTableAward','closeShell'])if(shellFunctions.has(name))vm.runInContext(shellFunctions.get(name),ctx);
 ctx.SAVE_SESSION=typeof ctx.captureSaveSession==='function'?ctx.captureSaveSession():{wallet:h.api,epoch:h.api.saveEpoch()};
 return {h,ctx,acks,calls,adopt:()=>h.api.reloadSave({wallet:{pc:1234},rank:null,dailyTask:null},{memoryOnly:true})};
}
for(const name of mutations)await check('host rejects already queued stale '+name,()=>{
 const p=shellPage();p.adopt();const before=p.h.api.wallet.pc();p.ctx.onMessage({data:{__csh:name,req:'queued',key:'texas'}});const r=p.acks.at(-1);
 return r?.ok===false&&r.data?.recovery===true&&r.data.reason==='存档已更新，请关闭后重新进入'&&before===p.h.api.wallet.pc()&&Object.keys(p.ctx.GUARD).length===0;
});
await check('closing stale host table cannot add world experience or affection',()=>{const p=shellPage();p.ctx.TABLE_WORLD={ids:{old:true},round:{results:{}}};p.ctx.TABLE_AFF={minions:['old'],awarded:false};p.h.lib.cshWorld={settlePlay(){p.calls.push('world');return {};}};p.h.lib.cshAffection={notePlay(){p.calls.push('affection');return true;}};p.adopt();p.ctx.closeShell(false);return p.calls.length===0&&p.ctx.SAVE_SESSION===null;});
await check('fresh host capture after adoption is writable again',()=>{const p=shellPage();p.adopt();p.ctx.SAVE_SESSION=typeof p.ctx.captureSaveSession==='function'?p.ctx.captureSaveSession():null;p.ctx.onMessage({data:{__csh:'shell-sign',req:'fresh'}});return p.acks.at(-1)?.ok===true;});
for(const scenario of ['normal','adopt','new-session','pending'])await check('deferred market read '+scenario+' rechecks before daily mutation',async()=>{
 const p=shellPage();let release,daily=0;const ready=new Promise(r=>release=r);
 p.h.lib.cshMarket={ready:()=>ready,ensureDay(){daily++;},snapshot:()=>({ready:true})};
 p.ctx.onMessage({data:{__csh:'shell-goldfish',req:'deferred'}});
 if(scenario==='adopt')p.adopt();
 if(scenario==='new-session'){p.adopt();p.ctx.SAVE_SESSION=typeof p.ctx.captureSaveSession==='function'?p.ctx.captureSaveSession():null;}
 if(scenario==='pending')p.h.store.setItem('csh_migrate_recovery','{}');
 release(true);await new Promise(resolve=>setImmediate(resolve));const ack=p.acks.at(-1);
 return scenario==='normal'?daily===1&&ack?.ok===true:daily===0&&ack?.ok===false;
});
await check('stale child can navigate to recovery bag',()=>{const p=page(),T=p.P.transport();p.adopt();T.call('shell-open',{key:'save'},()=>{});return p.sent[0]?.key==='save';});
await check('stale host can still open recovery bag',()=>{const p=shellPage();p.adopt();p.ctx.META.save={lobby:true};let opened;p.ctx.openFee=key=>opened=key;p.ctx.setTimeout=fn=>fn();p.ctx.onMessage({data:{__csh:'shell-open',key:'save',req:'recover'}});return p.acks.at(-1)?.ok===true&&opened==='save';});
function htmlFunction(file,name){const html=fs.readFileSync(path.join(root,file),'utf8');let found;for(const block of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){if(!block[1].trim())continue;walk(parse(block[1]),n=>{if(n.type==='FunctionDeclaration'&&n.id?.name===name)found=block[1].slice(...n.range);});}if(!found)throw Error('Missing '+file+':'+name);return found;}
const pages=['games/bossbook.html','games/codex.html','games/rank.html','games/blackjack/blackjack.html','games/texas/texas.html','games/doudizhu/doudizhu.html','games/uno/uno.html'];
for(const file of pages)await check(file+' actual storage wrapper refuses stale writes',()=>{const p=page(),name=file.includes('codex')?'pinLS':file.includes('bossbook')?'saveSeen':file.includes('rank')?'ls':'lsSet';p.ctx.CSHPage=p.P;p.ctx.SEEN_KEY="csh_boss_seen";vm.runInContext(htmlFunction(file,name),p.ctx);p.adopt();const r=name==='saveSeen'?p.ctx[name](10):p.ctx[name]('setting','bad');return r===false&&!p.store.getItem(name==='saveSeen'?'csh_boss_seen':'setting');});
for(const file of ['games/blackjack/blackjack.html','games/texas/texas.html'])await check(file+' rejected settings preserve memory',()=>{const p=page();Object.assign(p.ctx,{CSHPage:p.P,set:{bet:10},career:{set:{buyIn:200}},lsPut:(k,v)=>p.P.lsSet(k,JSON.stringify(v)),K_SET:'settings'});vm.runInContext(htmlFunction(file,'chooseSet'),p.ctx);p.store.writeFault=true;const before=JSON.stringify({set:p.ctx.set,career:p.ctx.career});return p.ctx.chooseSet(file.includes('texas')?'buyIn':'bet',999)===false&&before===JSON.stringify({set:p.ctx.set,career:p.ctx.career});});
if(process.argv.includes('--browser')){
 let b;
 try{
 const safe=s=>s.replace(/<\/script/gi,'<\\/script');
 const child='<button id="save" onclick="window.saved=CSHPage.lsSet(\'csh_probe_page\',\'clicked\')">save</button><script>'+safe(source)+'</script>';
 const html='<script>var lib={config:{},skill:{},translate:{}},game={},get={},ui={},ai={},_status={};</script><script>'+safe(walletSource)+'</script><iframe id="child" srcdoc="'+child.replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'"></iframe>';
 b=await openProbe(html);
 await check('Chromium child uses real shared script and actual wallet epoch',()=>b.evaluate(`(()=>{const w=document.getElementById('child').contentWindow;w.document.getElementById('save').click();return w.saved===true&&localStorage.getItem('csh_probe_page')==='clicked';})()`));
 await check('Chromium old iframe refuses writes after actual reloadSave',()=>b.evaluate(`(()=>{CSH.wallet.reloadSave({wallet:{pc:1234},rank:null,dailyTask:null},{memoryOnly:true});localStorage.setItem('csh_probe_page','imported');const w=document.getElementById('child').contentWindow;w.document.getElementById('save').click();return w.saved===false&&localStorage.getItem('csh_probe_page')==='imported'&&!!w.document.getElementById('csh-page-save-notice');})()`));
 }catch(e){rows.push({name:'Chromium harness',passed:false,detail:e.stack});}finally{if(b)await b.close();}
}
const result={scope:'actual wallet/shared page and HTML function extraction in isolated VM; optional Chromium shared-page iframe, no full game or player profile',passed:rows.filter(r=>r.passed).length,failed:rows.filter(r=>!r.passed).length,failures:rows.filter(r=>!r.passed)};
const out=opt('--out',null);if(out){fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({...result,checks:rows},null,2));}
console.log(JSON.stringify(result,null,2));if(result.failed)process.exitCode=1;
