// Disposable full host, with every remote fetch denied or explicitly mocked. No player profile or service.
import fs from'node:fs';import path from'node:path';import{spawn}from'node:child_process';import{fileURLToPath,pathToFileURL}from'node:url';
const arg=(n,d)=>{let i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];},root=arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')),out=arg('--out');if(!out)throw Error('Use external --out');fs.mkdirSync(out,{recursive:true});
const injection=String.raw`
window.__remoteProbe=[];window.__onlineMock='deny';
const originalFetch=window.fetch.bind(window);
window.fetch=async function(input,options){
 const url=new URL(typeof input==='string'?input:input.url,location.href);
 if(url.origin===location.origin)return originalFetch(input,options);
 var owner=window;try{if(parent!==window)owner=parent;}catch(e){}
 if(!owner.__remoteProbe)owner.__remoteProbe=[];
 owner.__remoteProbe.push({url:url.href,method:options&&options.method||'GET'});
 if(owner.__onlineMock!=='online')throw Error('Isolated remote service unavailable');
 if(url.origin!=='https://chishanghan.duckdns.org')throw Error('Unexpected remote target');
 if(options&&options.method==='POST')throw Error('Unexpected write during read-only test');
 var data=url.pathname==='/girls'?{ok:true,girls:[{girl:'csh_boss_minion_temari',total:77,n:2,chief_name:'隔离魁首',chief_sig:'快照题壁'}]}:{ok:true,list:[{uid:'mock-'+url.searchParams.get('type'),name:url.searchParams.get('type')==='merit'?'功勋样本':'池币样本',cby:12345,merit:678,rank:1}],n:1};
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
};
`;
const tests=String.raw`
async function offlineHost(){
 await page.send('Emulation.setDeviceMetricsOverride',{width:915,height:412,deviceScaleFactor:1,mobile:false});
 check('default policy is disabled before opening any optional page',await page.evaluate('!CSHOnline.enabled()&&!localStorage.getItem("csh_online_policy_v1")'));
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshWallet.wallet.add(50000,"isolated offline funds");lib.cshWallet.flushSave();return lib.cshDebug.openLobby();})()');

 await page.evaluate('(async()=>{window.__configProbe=(await import("./extension/池子魔将/main/config.js")).cshConfig;__configProbe.csh_online_settings.onclick();})()');
 check('actual settings dialog explains IP disclosure and fits landscape',await page.evaluate('(()=>{var d=document.querySelector("#csh-ui-confirm .csh-ui-cf-card"),r=d.getBoundingClientRect();return d.textContent.includes("IP")&&r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight;})()'));
 await clickElement('document.querySelector("#csh-ui-confirm .csh-ui-cf-btn:not(.ok)")');
 check('settings cancellation retains disabled policy and zero requests',await page.evaluate('!CSHOnline.enabled()&&__remoteProbe.length===0'));
 await page.evaluate('__configProbe.csh_online_settings.onclick()');await clickElement('document.querySelector("#csh-ui-confirm .ok")');
 check('actual settings enables public reads without submitting or requesting',await page.evaluate('CSHOnline.enabled()&&!CSHOnline.canPublish()&&__remoteProbe.length===0'));
 await page.evaluate('__configProbe.csh_online_settings.onclick()');await clickElement('document.querySelector("#csh-ui-confirm .ok")');
 check('actual settings disables reads without changing local wallet',await page.evaluate('!CSHOnline.enabled()&&lib.cshWallet.wallet.pc()===52000'));
 const pending=await page.evaluate('(()=>{var girl=lib.cshMarket.LISTED[0],t=Date.now().toString(36);return [0,1].map(i=>lib.cshCheer.enqueue({cid:"c-lost-"+t+"-"+i,uid:"old-identity",name:"隔离测试",sig:"",girl:girl,gname:"",amt:1000}));})()');
 check('synthetic historical cheer persists free and paid entries once',pending.every(x=>x.ok)&&await page.evaluate('lib.cshWallet.wallet.cheerState().pending.length===2&&lib.cshWallet.wallet.pc()===51000'));
 async function open(key,selector){await page.evaluate('lib.cshShell.close("offline-probe");lib.cshShell.open('+JSON.stringify(key)+',{buyIn:300})');if(await page.evaluate('!!document.querySelector(".csh-fee-go")'))await clickElement('document.querySelector(".csh-fee-go")');await until('document.getElementById("csh-shell-frame")?.contentDocument?.readyState==="complete"&&document.getElementById("csh-shell-frame").contentDocument.querySelector('+JSON.stringify(selector)+')',key+' actual page');await delay(300);}
 await open('rank','#net-toggle');
 check('offline rank renders local best and creates no online UID',await page.evaluate('document.getElementById("csh-shell-frame").contentDocument.getElementById("local-best").textContent.includes("本机历史最佳")&&!localStorage.getItem("csh_net_uid")'));

 await until('!document.getElementById("csh-shell-frame").contentDocument.getElementById("cheerPending").hidden','orphaned pending status');
 check('historical pending remains visible with no current online identity',await page.evaluate('document.getElementById("csh-shell-frame").contentDocument.getElementById("cheerPendingText").textContent.includes("2")&&lib.cshWallet.wallet.cheerState().pending.length===2'));
 check('default rank does not request remote API',await page.evaluate('__remoteProbe.length===0'));
 check('rank HTML contains no preconnect or DNS-prefetch',await page.evaluate('!document.getElementById("csh-shell-frame").contentDocument.querySelector("link[rel=preconnect],link[rel=dns-prefetch]")'));
 await delay(3200);
 stage('offline-rank',{screenshot:await snap('offline-rank-landscape')});
 check('offline update/store actions perform no request',await page.evaluate('(()=>{lib.cshDebug.checkUpdate();lib.cshDebug.openExtStore();return !document.getElementById("csh-update")&&!document.getElementById("csh-extstore")&&__remoteProbe.length===0;})()'));
 await delay(3000);
 await page.evaluate('__onlineMock="online"');
 await clickElement('document.getElementById("csh-shell-frame").contentDocument.getElementById("net-toggle")',true);
 await until('document.getElementById("csh-shell-frame").contentWindow.NET.rows.some(r=>r.name==="池币样本")','mock public currency read');
 await clickElement('document.getElementById("csh-shell-frame").contentDocument.getElementById("t-merit")',true);
 await until('document.getElementById("csh-shell-frame").contentWindow.NET.rows.some(r=>r.name==="功勋样本")','mock public merit read');
 check('public read omits personal UID and uses GET only',await page.evaluate('__remoteProbe.every(r=>r.method==="GET"&&!new URL(r.url).searchParams.has("uid"))'));
 await clickElement('document.getElementById("csh-shell-frame").contentDocument.getElementById("t-cheer")',true);
 await until('document.getElementById("csh-shell-frame").contentWindow.CHEER.girls.csh_boss_minion_temari?.total===77','mock flower result');
 check('public flowers keep local fifty-member roster and disabled fee actions',await page.evaluate('(()=>{var f=document.getElementById("csh-shell-frame"),d=f.contentDocument;return f.contentWindow.CHEER.list.length===50&&[...d.querySelectorAll(".cheerbtn,.chbtn,.wb")].every(n=>n.disabled);})()'));
 const before=await page.evaluate('lib.cshWallet.wallet.pc()');
 await page.evaluate('document.getElementById("csh-shell-frame").contentWindow.doCheer("csh_boss_minion_temari","测试",1000)');
 check('unavailable global write never charges local balance',await page.evaluate('lib.cshWallet.wallet.pc()')===before);
 stage('public-flower-cache',{screenshot:await snap('public-flower-landscape')});
 await page.evaluate('__onlineMock="deny";CSHOnline.setEnabled(false)');await delay(250);
 const count=await page.evaluate('__remoteProbe.length');
 for(const tab of ['t-cby','t-merit','t-cheer']){await clickElement('document.getElementById("csh-shell-frame").contentDocument.getElementById('+JSON.stringify(tab)+')',true);await delay(150);}
 check('disabling policy permits all three cached views with no new request',await page.evaluate('__remoteProbe.length')===count);
 check('cached flower remains 77 during permanent remote failure',await page.evaluate('document.getElementById("csh-shell-frame").contentWindow.CHEER.girls.csh_boss_minion_temari.total===77'));

 check('landscape keeps a usable list with historical pending and folded local profile',await page.evaluate('(()=>{var d=document.getElementById("csh-shell-frame").contentDocument,rows=d.getElementById("rows");return !d.getElementById("local-profile").open&&rows.clientHeight>=120;})()'));
 await clickElement('document.getElementById("csh-shell-frame").contentDocument.querySelector("#local-profile summary")',true);
 check('local title form expands with its save action available',await page.evaluate('(()=>{var d=document.getElementById("csh-shell-frame").contentDocument;return d.getElementById("local-profile").open&&!d.getElementById("save").disabled;})()'));
 await clickElement('document.getElementById("csh-shell-frame").contentDocument.querySelector("#local-profile summary")',true);
 for(const [width,height]of [[844,390],[640,286],[915,412]]){
  await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(200);
  check('offline flower/pending has scrollable list in landscape '+width+'x'+height,await page.evaluate('(()=>{var d=document.getElementById("csh-shell-frame").contentDocument,w=d.getElementById("wrap"),rows=d.getElementById("rows");return rows.clientHeight>=120&&w.scrollWidth<=w.clientWidth+2&&getComputedStyle(w).overflowY==="auto";})()'));
 }
 stage('cached-offline-flower',{screenshot:await snap('cached-offline-flower-landscape')});

 await open('codex','#dchief');
 if(await page.evaluate('getComputedStyle(document.getElementById("csh-shell-frame").contentDocument.getElementById("codex-roster-toggle")).display!=="none"'))await clickElement('document.getElementById("csh-shell-frame").contentDocument.getElementById("codex-roster-toggle")',true);
 await clickElement('[...document.getElementById("csh-shell-frame").contentDocument.querySelectorAll("#rolodex .gitem")].find(n=>n.getAttribute("aria-label")==="手鞠 · 查看档案")',true);
 await until('document.getElementById("csh-shell-frame").contentDocument.getElementById("dchief").textContent.includes("隔离魁首")','cached codex chief');
 check('actual codex uses host policy and cached public title wall offline',await page.evaluate('(()=>{var f=document.getElementById("csh-shell-frame");return f.contentWindow.CSHOnline===CSHOnline&&f.contentDocument.getElementById("dchief").textContent.includes("公开快照")&&__remoteProbe.length==='+count+';})()'));
 await page.evaluate('__onlineMock="online";CSHOnline.setEnabled(true)');
 await until('__remoteProbe.length>'+count,'codex live public read');
 check('codex policy change performs GET with no personal UID or balance effect',await page.evaluate('__remoteProbe.slice('+count+').every(r=>r.method==="GET"&&!new URL(r.url).searchParams.has("uid"))&&lib.cshWallet.wallet.pc()==='+before));
 await page.evaluate('__onlineMock="deny";CSHOnline.setEnabled(false)');
 await page.evaluate('lib.cshShell.close("offline-probe");lib.cshWallet.task.add("hands",10);lib.cshWallet.flushSave()');
 check('offline daily task persists progress and reward claim',await page.evaluate('lib.cshWallet.task.state().defs[0].claimed===true&&JSON.parse(localStorage.getItem("csh_wallet")).dailyTaskSaved.claimed.includes("hands")'));
 const snapshot=await page.evaluate('({pc:lib.cshWallet.wallet.pc(),peak:lib.cshWallet.wallet.peak(),code:null})');
 const exported=await page.evaluate('lib.cshMigrate.export()');fs.writeFileSync(path.join(out,'representative-isolated-save.txt'),exported);
 const portable=await page.evaluate('lib.cshMigrate.inspect('+JSON.stringify(exported)+')');
 check('offline portable export roundtrips actual wallet/task without network settings',portable.ok&&portable.data.wallet.pc===snapshot.pc&&!Object.hasOwn(portable.data,'csh_online_policy_v1'));
 await open('save','#b-check');check('actual bag remains usable with remote services disabled',await page.evaluate('!document.getElementById("csh-shell-frame").contentDocument.getElementById("b-pack").disabled'));
 await page.evaluate('lib.cshShell.close("offline-probe")');
 for(let i=1;i<=3;i++){
  await reloadHost('!!window.lib?.cshWallet&&!!window.CSHOnline&&!!document.getElementById("arena")','offline cold load '+i,25000);
  check('cold load '+i+' retains offline preference and confirmed wallet',await page.evaluate('!CSHOnline.enabled()&&lib.cshWallet.wallet.pc()==='+snapshot.pc+'&&lib.cshWallet.wallet.peak()==='+snapshot.peak+'&&lib.cshWallet.wallet.cheerState().pending.length===2'));
  await page.evaluate('lib.__cshLoadDebug()');await open('rank','#net-toggle');
  check('cold load '+i+' retains corresponding cached currency and emits zero request',await page.evaluate('document.getElementById("csh-shell-frame").contentWindow.NET.rows[0]?.name==="池币样本"&&__remoteProbe.length===0'));
  await page.evaluate('lib.cshShell.close("offline-probe")');
 }

 const imported=await page.evaluate('lib.cshMigrate.import('+JSON.stringify(exported)+')');
 check('actual host save import preserves wallet and pending while staying offline',imported.ok&&await page.evaluate('!CSHOnline.enabled()&&lib.cshWallet.wallet.pc()==='+snapshot.pc+'&&lib.cshWallet.wallet.cheerState().pending.length===2'));
 const errors=await page.evaluate('({errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})');check('offline host no uncaught runtime error/rejection',!errors.errors.length&&!errors.rejections.length,errors);
}
`;
let source=fs.readFileSync(root+'/tools/probe_host_smoke.mjs','utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root = '+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));
source=source.replace("  await page.send('Page.navigate', { url: origin + '/__probe_init.html' });","  await page.send('Page.addScriptToEvaluateOnNewDocument',{source:"+JSON.stringify(injection)+"});\n  await page.send('Page.navigate', { url: origin + '/__probe_init.html' });");
source=source.replace("if(process.argv.includes('--world-layout-410'))","if(process.argv.includes('--offline-host'))await offlineHost();\n    else if(process.argv.includes('--world-layout-410'))");
const runner=path.join(out,'isolated-online-runner.mjs');fs.writeFileSync(runner,tests+'\n'+source);const child=spawn(process.execPath,[runner,'--offline-host','--out',out],{stdio:'inherit',windowsHide:true});await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{process.exitCode=code||0;resolve();});});
