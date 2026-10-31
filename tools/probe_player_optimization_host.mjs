import fs from 'node:fs';import path from 'node:path';import{spawn}from'node:child_process';import{pathToFileURL,fileURLToPath}from'node:url';
const arg=(n,d)=>{let i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];},root=arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')),out=arg('--out');if(!out)throw Error('Use external --out');fs.mkdirSync(out,{recursive:true});
const tests=String.raw`
async function playerOptimization(){
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshWallet.wallet.add(50000,"isolated player audit");lib.cshWallet.flushSave();return lib.cshDebug.openLobby();})()');
 async function openPage(key,ready){await page.evaluate('lib.cshShell.close("test-only");lib.cshShell.open('+JSON.stringify(key)+',{buyIn:300})');if(await page.evaluate('!!document.querySelector(".csh-fee-go")'))await clickElement('document.querySelector(".csh-fee-go")');await until('document.getElementById("csh-shell-frame")?.contentDocument?.readyState==="complete" && document.getElementById("csh-shell-frame").contentDocument.querySelector('+JSON.stringify(ready)+')',key+' page');await delay(500);}
 await page.send('Emulation.setDeviceMetricsOverride',{width:915,height:412,deviceScaleFactor:1,mobile:false});
 await page.evaluate('(()=>{var s=CSH_POOL_ACHV.load();s.chars.csh_pingfan=2;CSH_POOL_ACHV.save(s);})()');
 const code=await page.evaluate('lib.cshMigrate.export()'),file=path.join(out,'isolated-save.txt');fs.writeFileSync(file,code);
 await page.evaluate('(()=>{var s=CSH_POOL_ACHV.load();s.chars.csh_pingfan=3;CSH_POOL_ACHV.save(s);})()');
 await openPage('save','#save-file');
 const input=await page.send('Runtime.evaluate',{expression:'document.getElementById("csh-shell-frame").contentDocument.getElementById("save-file")'});
 await page.send('DOM.setFileInputFiles',{objectId:input.result.objectId,files:[file]});
 await until('document.getElementById("csh-shell-frame").contentDocument.getElementById("diff").textContent.includes("覆盖内容")','actual file preview');
 const preview=await page.evaluate('(()=>{var d=document.getElementById("csh-shell-frame").contentDocument;return {text:d.getElementById("diff").textContent,code:d.getElementById("code").value.length,pool:CSH_POOL_ACHV.load().chars.csh_pingfan};})()');
 check('native file input loads and previews without applying save',preview.code===code.length&&preview.pool===3,preview);
 check('same character count with lower progress warns before overwrite',preview.text.includes('池子成就')&&preview.text.includes('回退或移除'),preview);
 stage('file-import-preview',{screenshot:await snap('bag-file-preview-landscape')});
 await page.evaluate('(()=>{lib.cshShell.close("test-only");lib.cshWallet.flushSave();window.__playerBefore=lib.cshWallet.wallet.pc();window.__setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==="csh_wallet")throw Error("isolated save fault");return __setItem.call(this,k,v);};return lib.cshWallet.pending.put("match","match-player-host-0001",{mode:"identity",win:true,amount:300});})()');
 await openPage('save','#pending-results');
 const pending=await page.evaluate('(()=>{var d=document.getElementById("csh-shell-frame").contentDocument;return {visible:!d.getElementById("pending-results").hidden,note:d.getElementById("pending-note").textContent};})()');
 check('failed result is shown as pending in actual bag',pending.visible&&pending.note.includes('待保存'),pending);
 await page.evaluate('Storage.prototype.setItem=window.__setItem');
 await clickElement('document.getElementById("csh-shell-frame").contentDocument.getElementById("pending-retry")',true);
 await until('lib.cshWallet.pending.status().count===0','pending retry');
 await page.evaluate('lib.cshWallet.pending.retry()');
 check('bag retry credits once and removes pending notice',await page.evaluate('lib.cshWallet.wallet.pc()===window.__playerBefore+300 && document.getElementById("csh-shell-frame").contentDocument.getElementById("pending-results").hidden'));
 await openPage('achv','#hero');
 await page.evaluate('(()=>{var d=document.getElementById("csh-shell-frame").contentDocument,h=d.getElementById("hero");h.value="csh_pingfan";h.dispatchEvent(new d.defaultView.Event("change"));})()');await delay(250);
 const route=await page.evaluate('(()=>{var d=document.getElementById("csh-shell-frame").contentDocument;return {headings:[...d.querySelectorAll(".route-heading")].map(n=>n.textContent),rows:d.querySelectorAll(".row").length,bulk:d.getElementById("claim-all").textContent};})()');
 check('selected hero has named routes milestones and same-match grouping',route.headings.length===5&&route.headings.some(s=>s.includes('长期里程碑'))&&route.headings.some(s=>s.includes('同局组合')),route);
 check('hero retains all thirteen achievements and clear bulk scope',route.rows===13&&route.bulk.includes('全部已达成'),route);stage('mastery-routes',{screenshot:await snap('mastery-routes-landscape')});
 await page.evaluate('(()=>{window.__live=CSH_POOL_ACHV.live;CSH_POOL_ACHV.live=()=>({ended:false,steps:[{label:"本局测试条件",current:1,target:2}]});var d=document.getElementById("csh-shell-frame").contentDocument;d.getElementById("hero").dispatchEvent(new d.defaultView.Event("change"));})()');
 check('same-match component keeps actual progress visible on short landscape',await page.evaluate('(()=>{var d=document.getElementById("csh-shell-frame").contentDocument,n=d.querySelector(".feat-live");return !!n&&d.defaultView.getComputedStyle(n).display!=="none"&&n.textContent.includes("本局");})()'));await page.evaluate('CSH_POOL_ACHV.live=window.__live');
 await openPage('career','#aux-summary');
 check('career shows independent assisted statistics',await page.evaluate('document.getElementById("csh-shell-frame").contentDocument.getElementById("aux-summary").textContent.includes("独立统计")'));
 await openPage('doudizhu','#btn-start-game');
 await clickElement('document.getElementById("csh-shell-frame").contentDocument.getElementById("btn-start-game")',true);await delay(600);
 await page.evaluate('(()=>{window.__closeBalance=lib.cshWallet.wallet.pc();Storage.prototype.setItem=function(k,v){if(k==="csh_wallet")throw Error("isolated close fault");return __setItem.call(this,k,v);};})()');
 await clickElement('document.getElementById("csh-shell-close")');await delay(700);
 const failedClose=await page.evaluate('(()=>{var f=document.getElementById("csh-shell-frame");return {exists:!!f,display:f&&f.contentDocument.body.style.display,text:f&&f.contentDocument.body.innerText.slice(-1500),phase:f&&f.contentWindow.game?.phase,balance:lib.cshWallet.wallet.pc(),before:__closeBalance};})()');
 check('real DDZ close failure preserves visible playable iframe and balance',failedClose.exists&&failedClose.display!=='none'&&failedClose.text.includes('页面已保留')&&failedClose.balance===failedClose.before,failedClose);stage('ddz-close-failure',{screenshot:await snap('ddz-close-failure-landscape')});
 await page.evaluate('Storage.prototype.setItem=window.__setItem');
 await clickElement('document.getElementById("csh-shell-close")');await until('!document.getElementById("csh-shell-frame")','DDZ retry close',10000);
 check('DDZ successful retry closes after acknowledged settlement',true);
 const errors=await page.evaluate('({errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})');check('new player flow no runtime exceptions',!errors.errors.length&&!errors.rejections.length,errors);
}
`;
let s=fs.readFileSync(root+'/tools/probe_host_smoke.mjs','utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root = '+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));s=s.replace("if(process.argv.includes('--world-layout-410'))","if(process.argv.includes('--player-optimization'))await playerOptimization();\n    else if(process.argv.includes('--world-layout-410'))");const runner=path.join(out,'isolated-player-runner.mjs');fs.writeFileSync(runner,tests+'\n'+s);const child=spawn(process.execPath,[runner,'--player-optimization','--out',out],{stdio:'inherit',windowsHide:true});await new Promise((r,j)=>{child.once('error',j);child.once('exit',c=>{process.exitCode=c||0;r();});});
