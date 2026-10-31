// Isolated full-host storage failures, genuine wallet/result handlers and recovery UI.
import fs from'node:fs';import path from'node:path';import{spawn}from'node:child_process';import{pathToFileURL,fileURLToPath}from'node:url';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];},root=arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')),out=path.resolve(arg('--out',''));
if(!arg('--out')||out===root||out.startsWith(root+path.sep))throw Error('External --out required');fs.mkdirSync(out,{recursive:true});
const tests=String.raw`
async function worldResultStatus(){
 await page.send('Emulation.setDeviceMetricsOverride',{width:915,height:412,deviceScaleFactor:1,mobile:false});
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshWallet.flushSave();window.__walletInitial=lib.cshWallet.wallet.pc();window.__setReal=Storage.prototype.setItem;})()');
 const f='document.getElementById("csh-shell-frame")',d=f+'.contentDocument';
 async function world(name){await page.evaluate('lib.cshShell.close("status-test");lib.cshDebug.openLobby()');await delay(300);const m=await page.evaluate('(()=>{const n=document.querySelector(".csh-world-hero");return {status:lib.cshWallet.pending.status(),text:n.textContent,buttons:[...n.querySelectorAll("button")].map(x=>x.textContent)};})()');stage('world-'+name,{...m,screenshot:await snap('world-'+name)});return m;}
 async function bag(name){await page.evaluate('lib.cshShell.open("save")');await until(f+'?.contentDocument?.getElementById("pending-note")','bag loaded');await delay(350);const m=await page.evaluate('(()=>{const d='+d+',n=d.getElementById("pending-results"),r=n.getBoundingClientRect();return {hidden:n.hidden,text:d.getElementById("pending-note").textContent,error:d.getElementById("pending-error")?.textContent,detailsHidden:d.getElementById("pending-details")?.hidden,overflow:n.scrollWidth>n.clientWidth+2,viewport:innerWidth,right:r.right};})()');stage('bag-'+name,{...m,screenshot:await snap('bag-'+name)});return m;}
 let w=await world('empty');check('empty world has no misleading recovery action',w.status.count===0&&!w.status.error&&!w.buttons.some(x=>x.includes('行囊')));
 let s=await bag('empty');check('empty bag hides pending note',s.hidden);
 await page.evaluate('lib.cshShell.close("status-test");localStorage.removeItem(lib.cshWallet.pending.KEY);lib.cshWallet.pending.retry();localStorage.setItem(lib.cshWallet.pending.KEY,JSON.stringify({v:1,entries:[{kind:"match",id:"match-team-status-0001",data:{mode:"identity",win:true,amount:300},t:Date.now()}]}));');
 w=await world('durable');check('healthy durable result is automatically recovered by actual snapshot read',w.status.count===0&&!w.status.error&&await page.evaluate('lib.cshWallet.wallet.pc()===__walletInitial+300'),w);
 s=await bag('durable');check('bag hides notice for automatically recovered durable result',s.hidden,s);
 await page.evaluate('Storage.prototype.setItem=function(k,v){if(k==="csh_wallet")throw Error("isolated-wallet-write-failure");return __setReal.call(this,k,v);};lib.cshWallet.pending.put("match","match-team-status-0002",{mode:"identity",win:true,amount:300});');
 w=await world('commit-failure');check('commit error is not mislabeled as read error',w.status.count===1&&!!w.status.error&&w.text.includes('遇到问题')&&!w.text.includes('读取失败'),w);
 s=await bag('commit-failure');check('bag preserves commit error and retry without declaring read failure',!s.hidden&&s.text.includes('遇到问题')&&!s.text.includes('读取失败'),s);
 check('failed commit leaves balance unchanged',await page.evaluate('lib.cshWallet.wallet.pc()===__walletInitial+300'));
 await page.evaluate('Storage.prototype.setItem=__setReal');await clickElement(d+'.getElementById("pending-retry")',true);await until('lib.cshWallet.pending.status().count===0','durable retry');
 check('durable retry actually credits once and hides pending notice',await page.evaluate('lib.cshWallet.wallet.pc()===__walletInitial+600&&'+d+'.getElementById("pending-results").hidden'));
 await page.evaluate('lib.cshWallet.pending.retry()');check('duplicate durable retry does not pay again',await page.evaluate('lib.cshWallet.wallet.pc()===__walletInitial+600'));
 await page.evaluate('lib.cshShell.close("status-test");localStorage.setItem(lib.cshWallet.pending.KEY,"{corrupt-test");');
 w=await world('corrupt');check('real damaged journal reports error without claiming zero pending',w.status.count===0&&!!w.status.error&&!w.text.includes('有 0 项')&&w.text.includes('遇到问题')&&w.buttons.some(x=>x.includes('行囊')),w);
 s=await bag('corrupt');check('bag damaged journal reports problem without zero or raw error in primary note',!s.hidden&&!s.text.includes('有 0 项')&&s.text.includes('遇到问题')&&!s.text.includes('JSON'),s);
 check('bag retains raw diagnostic in optional detail rather than losing it',!!s.error&&!s.detailsHidden,s);
 for(const[width,height]of [[915,412],[640,286],[390,844]]){
  await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(300);
  const visible=await page.evaluate('('+function(){const f=document.getElementById('csh-shell-frame'),d=f.contentDocument,v=d.defaultView,board=d.getElementById('board'),note=d.getElementById('pending-note'),retry=d.getElementById('pending-retry'),nr=note.getBoundingClientRect(),rr=retry.getBoundingClientRect(),br=board.getBoundingClientRect(),p=f.getBoundingClientRect(),hit=d.elementFromPoint(rr.x+rr.width/2,rr.y+rr.height/2);return {noteTop:nr.top,noteBottom:nr.bottom,retryTop:rr.top,retryBottom:rr.bottom,bodyTop:br.top,viewport:v.innerHeight,scroll:board.scrollTop,overflow:d.documentElement.scrollWidth>v.innerWidth+2,retryHit:hit===retry,hostHit:document.elementFromPoint(p.x+rr.x+rr.width/2,p.y+rr.y+rr.height/2)===f};}.toString()+')()');
  check('bag error and retry are initially visible and hit-testable '+width,visible.noteTop>=visible.bodyTop&&visible.noteBottom<=visible.viewport&&visible.retryTop>=visible.bodyTop&&visible.retryBottom<=visible.viewport&&visible.retryHit&&visible.hostHit&&!visible.overflow,visible);
  stage('bag-visible-error-'+width,{screenshot:await snap('bag-visible-error-'+width)});
 }
 await clickElement(d+'.querySelector("#pending-details > summary")',true);
 check('native diagnostic disclosure expands retained error',await page.evaluate(d+'.getElementById("pending-details").open&&'+d+'.getElementById("pending-error").textContent.length>0'));
 await page.send('Emulation.setDeviceMetricsOverride',{width:915,height:412,deviceScaleFactor:1,mobile:false});await delay(250);
 check('looking at error does not credit or erase corrupt journal',await page.evaluate('lib.cshWallet.wallet.pc()===__walletInitial+600&&localStorage.getItem(lib.cshWallet.pending.KEY)==="{corrupt-test"'));
 await page.evaluate('lib.cshShell.close("status-test");localStorage.removeItem(lib.cshWallet.pending.KEY);lib.cshWallet.pending.retry();');
 await page.evaluate('Storage.prototype.setItem=function(k,v){if(k==="csh_wallet"||k===lib.cshWallet.pending.KEY)throw Error("isolated-persistence-failure");return __setReal.call(this,k,v);};lib.cshWallet.pending.put("match","match-team-status-0003",{mode:"identity",win:true,amount:300});');
 w=await world('volatile');check('world volatile error clearly asks to keep page open',w.status.volatile===1&&w.text.includes('请保持页面打开')&&w.text.includes('遇到问题'),w);
 s=await bag('volatile');check('bag volatile error distinguishes not written to local storage',!s.hidden&&s.text.includes('请保持页面打开')&&s.text.includes('尚未写入本机')&&s.text.includes('遇到问题'),s);
 await page.evaluate('Storage.prototype.setItem=__setReal');await clickElement(d+'.getElementById("pending-retry")',true);await until('lib.cshWallet.pending.status().count===0&&!lib.cshWallet.pending.status().error','volatile retry');
 check('volatile retry credits once with durable result recovery',await page.evaluate('lib.cshWallet.wallet.pc()===__walletInitial+900&&'+d+'.getElementById("pending-results").hidden'));
 await page.evaluate('lib.cshWallet.pending.retry()');check('duplicate volatile retry does not pay again',await page.evaluate('lib.cshWallet.wallet.pc()===__walletInitial+900'));
 w=await world('recovered');check('recovered world removes old error and repair call to action',!w.status.error&&w.status.count===0&&!w.buttons.some(x=>x.includes('行囊')));
 const e=await page.evaluate('({errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})');check('result-status host no unhandled error or rejection',!e.errors.length&&!e.rejections.length,e);
}
`;
let source=fs.readFileSync(root+'/tools/probe_host_smoke.mjs','utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root = '+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));
source=source.replace("if(process.argv.includes('--world-layout-410'))","if(process.argv.includes('--world-result-status'))await worldResultStatus();\n    else if(process.argv.includes('--world-layout-410'))");
const file=out+'/isolated-status-runner.mjs';fs.writeFileSync(file,tests+'\n'+source);const child=spawn(process.execPath,[file,'--world-result-status','--out',out],{stdio:'inherit',windowsHide:true});await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{process.exitCode=code||0;resolve();});});
