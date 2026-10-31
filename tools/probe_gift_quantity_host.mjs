// Installed page in a real host, disposable browser profile; writes only to external --out.
import fs from 'node:fs';import path from 'node:path';import {spawn}from'node:child_process';import{fileURLToPath,pathToFileURL}from'node:url';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];};
const root=arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')),out=path.resolve(arg('--out',''));
if(!arg('--out')||out===root||out.startsWith(root+path.sep))throw Error('Use an external --out');fs.mkdirSync(out,{recursive:true});
const tests=String.raw`
async function codexContent(){
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshDebug.openLobby();lib.cshBossRecord.recordMinion("csh_boss_minion_eve");lib.cshWallet.wallet.add(10000000,"隔离赠礼验收");lib.cshWallet.flushSave();lib.cshShell.open("codex");})()');
 const f='document.getElementById("csh-shell-frame")',d=f+'.contentDocument',win=f+'.contentWindow.__giftTest';
 if(await page.evaluate('!!document.querySelector(".csh-fee-go")'))await clickElement('document.querySelector(".csh-fee-go")');
 await until(d+'?.querySelectorAll(".gitem").length===50','all codex items');
 // Data fixture: one recorded hunt via actual API; this is not natural combat evidence.
 await page.evaluate('(()=>{const w='+win+';w.Data.cur=w.Data.items.findIndex(x=>x.id==="csh_boss_minion_eve");w.renderDossier(w.Data.items[w.Data.cur]);w.renderList();})()');
 const pc=()=>page.evaluate('lib.cshWallet.wallet.pc()');
 const status=()=>page.evaluate('('+win+'.AFF.say||{}).msg||""');
 async function key(key,code,vk,modifiers){await page.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:vk,modifiers:modifiers||0});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk,modifiers:modifiers||0});}
 async function choose(n){await clickElement(d+'.getElementById("aff-gift-quantity")',true);await key('Home','Home',36);for(let i=0;i<n;i++)await key('ArrowDown','ArrowDown',40);await key('Enter','Enter',13);await delay(200);}
 async function gift(){await clickElement(d+'.querySelector(".affgifts .affbtn")',true);await delay(200);}
 const before=await pc();
 for(const[w,h]of [[1365,768],[915,412],[844,390],[640,286],[390,844]]){
  await page.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});await delay(350);
  const m=await page.evaluate('('+function(){const d=document.getElementById('csh-shell-frame').contentDocument,n=d.querySelector('.affgift-tools'),r=n.getBoundingClientRect(),info=d.querySelector('.dinfo');return {bodyOverflow:d.documentElement.scrollWidth>d.documentElement.clientWidth+2,infoOverflow:info.scrollWidth>info.clientWidth+2,selectH:d.getElementById('aff-gift-quantity').getBoundingClientRect().height,toolW:r.width,infoW:info.clientWidth};}.toString()+')()');
  check('gift compact tools readable without horizontal overflow '+w,!m.bodyOverflow&&!m.infoOverflow&&m.selectH>=44,m);stage('gift-default-'+w,{screenshot:await snap('gift-default-'+w)});
 }
 await page.send('Emulation.setDeviceMetricsOverride',{width:915,height:412,deviceScaleFactor:1,mobile:false});await delay(350);
 await choose(1);await gift();
 const q=await page.evaluate(win+'.AFF.giftPending');
 check('native quantity10 opens accurate aggregate quote without payment',q?.quantity===10&&q.count===10&&q.cost===60000&&await pc()===before,q);
 check('quote names recipient total cost and final gain',await page.evaluate(d+'.querySelector(".affgift-confirm").textContent.includes("60,000")&&'+d+'.querySelector(".affgift-confirm").textContent.includes("好感")'));
 stage('gift-confirm10',{screenshot:await snap('gift-confirm10')});
 await clickElement(d+'.querySelector(".gift-actions button:last-child")',true);
 check('cancel has no transaction and returns keyboard focus to quantity',await pc()===before&&await page.evaluate('!'+win+'.AFF.giftPending&&'+d+'.activeElement.id==="aff-gift-quantity"'));
 await gift();await clickElement(d+'.getElementById("aff-gift-confirm")',true);await delay(350);
 check('native confirm purchases ten gifts once with one combined feedback',await pc()===before-60000&&await page.evaluate(win+'.AFF.say.msg.includes("×10")&&'+win+'.AFF.giftPending===null'));
 const after10=await pc();
 // Force bridge fallback, let the actual host commit, then simulate a lost reply at the UI boundary.
 await page.evaluate('(()=>{const w='+win+',A=lib.cshAffection;w.AFF.api={get:A.get,favOf:A.favOf,linesOf:A.linesOf};const call=w.Bridge.call;let lost=false;w.Bridge.call=function(cmd,data,cb){return call.call(this,cmd,data,function(ok,res){if(cmd==="shell-aff-do"&&data.act==="gift"&&!lost){lost=true;cb(false,null);}else cb(ok,res);});};})()');
 await choose(0);await gift();const lostQ=await page.evaluate(win+'.AFF.giftPending');await clickElement(d+'.getElementById("aff-gift-confirm")',true);await delay(500);
 const paid=await pc();check('lost confirmation retains original request and offers retry',paid===after10-6000&&await page.evaluate(win+'.AFF.giftPending.cid==='+JSON.stringify(lostQ.cid)+'&&!'+win+'.AFF.giftBusy'));
 await clickElement(d+'.getElementById("aff-gift-confirm")',true);await delay(500);
 check('retry reconciles actual host receipt without a second charge',await pc()===paid&&(await status()).includes('已确认'));
 // Reject the durable write, retry with the same quotation after repairing storage.
 await gift();const failedQ=await page.evaluate(win+'.AFF.giftPending');
 await page.evaluate('window.__giftSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==="csh_wallet")throw Error("isolated wallet quota");return __giftSet.call(this,k,v);};');
 await clickElement(d+'.getElementById("aff-gift-confirm")',true);await delay(400);
 check('real wallet quota shows failure and retains exact request without debit',await pc()===paid&&await page.evaluate(win+'.AFF.giftPending.cid==='+JSON.stringify(failedQ.cid)));
 await page.evaluate('Storage.prototype.setItem=__giftSet;delete window.__giftSet;');
 await clickElement(d+'.getElementById("aff-gift-confirm")',true);await delay(500);check('repaired same request completes one purchase',await pc()===paid-6000&&await page.evaluate(win+'.AFF.giftPending===null'));
 // Custom input is native, invalid count never quotes or buys.
 await choose(4);await clickElement(d+'.getElementById("aff-gift-custom")',true);await key('a','KeyA',65,2);await page.send('Input.insertText',{text:'101'});await gift();
 check('custom invalid101 gives clear validation and no debit',await pc()===paid-6000&&!(await page.evaluate(win+'.AFF.giftPending'))&&(await status()).includes('1到100'));
 // Close/reopen reconstructs current progress; last economic receipt survives page teardown.
 const stable=await pc();const receipt=await page.evaluate('lib.cshWallet.wallet.affectionSaved().csh_boss_minion_eve.giftTxn.request.cid');
 await clickElement('document.getElementById("csh-shell-close")');await until('!document.getElementById("csh-shell-frame")','close codex');await delay(350);await page.evaluate('lib.cshShell.open("codex")');if(await page.evaluate('!!document.querySelector(".csh-fee-go")'))await clickElement('document.querySelector(".csh-fee-go")');await until(f+'?.contentDocument?.querySelectorAll(".gitem").length===50','reopen codex');
 check('reopen never resends a purchase and retains durable receipt',await pc()===stable&&receipt===await page.evaluate('lib.cshWallet.wallet.affectionSaved().csh_boss_minion_eve.giftTxn.request.cid'));
 // Adopt a controlled near-cap affection fixture through the existing atomic store API.
 await page.evaluate('(()=>{const s=lib.cshWallet.wallet.affectionSaved();s.csh_boss_minion_eve.v=87999;lib.cshWallet.wallet.commitAffection(s,0,"隔离封顶验收");const w='+win+';w.Data.cur=w.Data.items.findIndex(x=>x.id==="csh_boss_minion_eve");w.refreshAff("csh_boss_minion_eve");w.renderDossier(w.Data.items[w.Data.cur]);})()');
 await choose(3);await gift();
 const capQ=await page.evaluate(win+'.AFF.giftPending');check('native100 quote reduces to one unit with explicit explanation',capQ.quantity===100&&capQ.count===1&&capQ.cost===6000&&capQ.gain===1&&await page.evaluate(d+'.querySelector(".affgift-confirm").textContent.includes("减为1份")'),capQ);
 stage('gift-cap-reduction',{screenshot:await snap('gift-cap-reduction')});
 await clickElement(d+'.getElementById("aff-gift-confirm")',true);await delay(400);check('cap purchase charges only actual count and reaches exact maximum',await pc()===stable-6000&&await page.evaluate('lib.cshAffection.get("csh_boss_minion_eve").v===88000'));
 await gift();check('full affection refuses further gifts with clear feedback',await pc()===stable-6000&&(await status()).includes('已满'));
 const e=await page.evaluate('({host:__hostSmoke,frame:'+win+'.__hostSmoke})');check('gift host/frame have no runtime errors or unhandled rejections',!e.host.errors.length&&!e.host.rejections.length&&(!e.frame||(!e.frame.errors.length&&!e.frame.rejections.length)),e);
}


`;
let source=fs.readFileSync(path.join(root,'tools/probe_host_smoke.mjs'),'utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root = '+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));
const marker="if(process.argv.includes('--world-layout-410'))";if(!source.includes(marker))throw Error('host harness anchor changed');source=source.replace(marker,"if(process.argv.includes('--codex-content'))await codexContent();\n    else "+marker);
if(arg('--page-source')){const anchor="    const target = resolveReadOnly(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));";if(!source.includes(anchor))throw Error('server anchor');source=source.replace(anchor,'    if(decodeURIComponent(url.pathname)==="/extension/池子魔将/games/codex.html"){item.status=200;res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-cache"});return res.end(fs.readFileSync('+JSON.stringify(path.resolve(arg('--page-source')))+'));}\n'+anchor);}

// Test-only export inside the served IIFE; production file remains untouched.
const actualPage=fs.readFileSync(path.join(root,'games/codex.html'),'utf8');
const servedPage=actualPage.replace(/fetchShare\(refreshShareView\);\r?\n\}\)\(\);/,'fetchShare(refreshShareView);\nwindow.__giftTest={Data,AFF,Bridge,refreshAff,renderDossier,renderList};\n})();');
if(actualPage===servedPage)throw Error('test IIFE export anchor missing');
const routeAnchor="    const target = resolveReadOnly(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));";
source=source.replace(routeAnchor,'    if(decodeURIComponent(url.pathname)==="/extension/池子魔将/games/codex.html"){item.status=200;res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-cache"});return res.end('+JSON.stringify(servedPage)+');}\n'+routeAnchor);

const runner=path.join(out,'isolated-codex-runner.mjs');fs.writeFileSync(runner,tests+'\n'+source);
const child=spawn(process.execPath,[runner,'--codex-content',...(process.argv.includes('--baseline')?['--baseline']:[]),'--out',out],{stdio:'inherit',windowsHide:true});await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{process.exitCode=code||0;resolve();});});
