// Full engine, actual presentation and wallet; new browser/IDB and explicitly synthetic qualification for 100 claims.
import fs from'node:fs';import path from'node:path';import{spawn}from'node:child_process';import{fileURLToPath,pathToFileURL}from'node:url';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];},root=arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')),out=arg('--out');if(!out)throw Error('Use external --out');fs.mkdirSync(out,{recursive:true});
const tests=String.raw`
const feedbackMetrics=[];
async function achievementFeedbackHost(){
 await page.send('Emulation.setDeviceMetricsOverride',{width:915,height:412,deviceScaleFactor:1,mobile:false});
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshWallet.wallet.add(100000,"isolated feedback fixture");lib.cshWallet.flushSave();lib.cshDebug.openLobby();})()');
 const walletBefore=await page.evaluate('localStorage.getItem("csh_wallet")');
 const fake=Array.from({length:100},(_,i)=>({id:'feedback-'+i,source:'pool',title:i===99?'百项反馈 · 史诗样本':'反馈样本 '+i,description:'仅用于展示测试，不计入真实解锁',rare:i===99?3:1,pc:100+i,merit:1}));
 const accepted=await page.evaluate('lib.cshUI.achievement('+JSON.stringify(fake)+',{kind:"unlock"})');
 await until('!!document.getElementById("csh-ach-feedback")','achievement card');
 check('100 feedback candidates produce one visible card and bounded priority queue',accepted===100&&await page.evaluate('document.querySelectorAll("#csh-ach-feedback").length===1&&lib.cshUI.achievementState().pending===3&&lib.cshUI.achievementState().overflow===97'));
 check('priority card uses actual rarity and deferred reward wording',await page.evaluate('document.getElementById("csh-ach-feedback").dataset.rare==="3"&&document.getElementById("csh-ach-feedback").textContent.includes("奖励待领取")&&document.getElementById("csh-ach-feedback").querySelectorAll("svg path").length>=4'));
 check('panel feedback fits the compact header without covering the world primary action',await page.evaluate('(()=>{var r=document.getElementById("csh-ach-feedback").getBoundingClientRect(),b=document.querySelector(".csh-world-start").getBoundingClientRect();return r.bottom<=b.top&&r.x>=0&&r.right<=innerWidth;})()'));
 await delay(350);
 stage('feedback-unlock',{screenshot:await snap('feedback-unlock-915x412')});
 await clickElement('[...document.querySelectorAll("#csh-ach-feedback button")].find(n=>n.textContent==="详情")');
 check('detail view shows condition and does not claim an unlock is paid',await page.evaluate('document.getElementById("csh-ach-review").textContent.includes("仅用于展示测试")&&document.getElementById("csh-ach-review").textContent.includes("奖励待领取")'));
 const key=async()=>{await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await delay(150);};
 await key();check('Escape closes detail and restores focus to current feedback',await page.evaluate('!document.getElementById("csh-ach-review")&&document.getElementById("csh-ach-feedback").contains(document.activeElement)'));
 await clickElement('[...document.querySelectorAll("#csh-ach-feedback button")].find(n=>n.textContent==="收纳")');
 check('collect all cancels cards while preserving 100 feedback records',await page.evaluate('!document.getElementById("csh-ach-feedback")&&lib.cshUI.achievementState().history.length===100'));
 await page.evaluate('lib.cshUI.achievementHistory()');
 check('review exposes all 100 records without replaying animations',await page.evaluate('document.querySelectorAll("#csh-ach-review article").length===100&&!document.getElementById("csh-ach-feedback")'));

 await page.evaluate('window.__feedbackSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==="csh_achievement_ui_v1")throw Error("isolated preference quota");return __feedbackSetItem.call(this,k,v)}');
 await clickElement('document.querySelector("#csh-ach-review input[aria-label=减少动效]")');
 check('failed preference write reports failure and restores the checkbox',await page.evaluate('!document.querySelector("#csh-ach-review input[aria-label=减少动效]").checked&&document.getElementById("csh-ach-review").textContent.includes("未保存")'));
 await page.evaluate('Storage.prototype.setItem=__feedbackSetItem');
 stage('feedback-history',{screenshot:await snap('feedback-history-915x412')});
 await clickElement('document.querySelector("#csh-ach-review input[aria-label=减少动效]")');
 check('reduced motion preference saves to its own metadata key',await page.evaluate('JSON.parse(localStorage.getItem("csh_achievement_ui_v1")).reduced===true'));
 await key();
 check('feedback presentation and preference never alter wallet bytes',await page.evaluate('localStorage.getItem("csh_wallet")')===walletBefore);
 await page.evaluate('lib.cshUI.achievement([{id:"literal-text",title:"<img src=x onerror=alert(1)>",description:"<script>not executable</script>",pc:1}])');
 await page.evaluate('lib.cshUI.achievementHistory()');
 check('dynamic achievement text is displayed literally without injected nodes',await page.evaluate('!document.querySelector("#csh-ach-review img,#csh-ach-review script")&&document.getElementById("csh-ach-review").textContent.includes("<img src=x" )'));
 await page.evaluate('lib.cshWallet.reloadSave()');await delay(650);
 check('actual wallet adoption clears old cards and review within the guard interval',await page.evaluate('!document.getElementById("csh-ach-feedback")&&!document.getElementById("csh-ach-review")&&!lib.cshUI.achievementState().history.length'));
 // Real definitions and reward amounts, synthetic completed conditions; actual bridge/claim receipts/persistence.
 const expected=await page.evaluate('(()=>{var original=CSH_ACHV.evalAll;window.__feedbackOriginalEval=original;var rows=original({}).slice(0,100);CSH_ACHV.evalAll=function(s){return original(s).slice(0,100).map(r=>Object.assign({},r,{done:true,cur:r.goal,claimed:CSH_ACHV.claimed(r.key)}));};return rows.reduce((n,r)=>n+r.reward,0);})()');
 const beforeClaim=await page.evaluate('lib.cshWallet.wallet.pc()');
 await page.evaluate('lib.cshShell.open("career")');await until('!!document.getElementById("csh-shell-frame")?.contentDocument?.getElementById("ach-claim-all")','actual career page');await delay(400);
 await clickElement('document.getElementById("csh-shell-frame").contentDocument.querySelector(".tab[data-p=ach]")',true);
 await clickElement('document.getElementById("csh-shell-frame").contentDocument.getElementById("ach-claim-all")',true);await delay(500);
 check('100 actual career claims persist 100 receipts with the exact total',await page.evaluate('Object.keys(JSON.parse(localStorage.getItem("csh_wallet")).careerClaims).length===100&&lib.cshWallet.wallet.pc()==='+(beforeClaim+expected)));
 check('post-ACK claim feedback records only confirmed actual amounts',await page.evaluate('lib.cshUI.achievementState().history.length===100&&lib.cshUI.achievementState().history.every(r=>r.kind==="claim")&&lib.cshUI.achievementState().history.reduce((n,r)=>n+r.pc,0)==='+expected));
 const repeated=await page.evaluate('(async()=>{var f=document.getElementById("csh-shell-frame");return await new Promise(resolve=>f.contentWindow.CSHPage.transport({timeout:3000}).call("shell-ach-claim-all",null,(ok,data)=>resolve({ok,data})));})()');
 check('repeated bulk request cannot pay twice or append duplicate feedback',repeated.ok&&repeated.data.count===0&&await page.evaluate('lib.cshWallet.wallet.pc()==='+(beforeClaim+expected)+'&&lib.cshUI.achievementState().history.length===100'));
 await page.evaluate('lib.cshUI.achievementSkip();CSH_ACHV.evalAll=__feedbackOriginalEval');
 await delay(2800);
 for(const[w,h]of [[1366,768],[915,412],[844,390],[640,286]]){
  await page.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});await page.evaluate('var f=document.getElementById("csh-shell-frame");f.contentDocument.getElementById("body").scrollTop=0');await delay(200);
  const metric=await page.evaluate('(()=>{var f=document.getElementById("csh-shell-frame"),d=f.contentDocument,r=d.getElementById("ach-grid").getBoundingClientRect(),b=d.getElementById("body").getBoundingClientRect(),width=Math.max(0,Math.min(f.clientWidth,r.right,b.right)-Math.max(0,r.x,b.x)),height=Math.max(0,Math.min(f.clientHeight,r.bottom,b.bottom)-Math.max(0,r.y,b.y));return {width:f.clientWidth,height:f.clientHeight,area:width*height/(f.clientWidth*f.clientHeight),heightRatio:height/f.clientHeight,overflow:d.documentElement.scrollWidth>d.documentElement.clientWidth,navVisible:d.getElementById("tabs").getClientRects().length>0};})()');feedbackMetrics.push(metric);
  check('achievement subject screen area '+w+'x'+h,!metric.overflow&&metric.area>=(h<320?.55:w>1000?.75:.65),metric);stage('achievement-layout-'+w+'x'+h,{screenshot:await snap('achievement-'+w+'x'+h)});
 }
 await page.send('Emulation.setDeviceMetricsOverride',{width:915,height:412,deviceScaleFactor:1,mobile:false});await delay(150);
 await clickElement('document.getElementById("csh-shell-frame").contentDocument.getElementById("career-nav-toggle")',true);
 check('mobile column drawer opens all six real navigation entries',await page.evaluate('(()=>{var d=document.getElementById("csh-shell-frame").contentDocument;return d.getElementById("tabs").getClientRects().length>0&&d.querySelectorAll("#tabs .tab").length===6&&d.getElementById("tabs").contains(d.activeElement);})()'));
 await key();check('Escape closes mobile drawer and returns keyboard focus',await page.evaluate('(()=>{var d=document.getElementById("csh-shell-frame").contentDocument;return !d.getElementById("tabs").getClientRects().length&&d.activeElement.id==="career-nav-toggle";})()'));
 await clickElement('document.getElementById("csh-shell-frame").contentDocument.getElementById("ach-filters-toggle")',true);await clickElement('document.getElementById("csh-shell-frame").contentDocument.getElementById("ach-feedback-history")',true);
 check('career optional controls open the shared confirmed-feedback review',await page.evaluate('document.querySelectorAll("#csh-ach-review article").length===100'));
 await clickElement('document.querySelector("#csh-ach-review input[aria-label=显示解锁与领奖反馈]")');await key();
 await page.evaluate('lib.cshUI.achievement([{id:"disabled-show",title:"关闭显示样本",pc:10}])');
 check('disabled presentation leaves data intact without a card',await page.evaluate('!document.getElementById("csh-ach-feedback")&&lib.cshUI.achievementState().history.length===101'));
 const portable=await page.evaluate('(async()=>lib.cshMigrate.inspect(await lib.cshMigrate.export()))()');
 check('feedback preference is excluded from portable player data',portable.ok&&!Object.hasOwn(portable.data,'csh_achievement_ui_v1'));

 await page.evaluate('lib.cshUI.achievementHistory()');await clickElement('document.querySelector("#csh-ach-review input[aria-label=显示解锁与领奖反馈]")');await key();
 await page.evaluate('lib.cshShell.close("native-feedback")');await clickElement('document.getElementById("csh-dbg-close")');await page.evaluate('lib.cshWallet.reloadSave()');
 for(const[w,h]of [[915,412],[640,286]]){
  await page.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});
  await page.evaluate('lib.cshUI.achievement([{id:"native-'+w+'",source:"pool",title:"破阵 · 史诗展示样本",description:"原生宿主中的成就反馈样式，未模拟自然成就达成",rare:3,pc:500,merit:5}])');await delay(300);
  check('native feedback is bounded and honors reduced motion '+w+'x'+h,await page.evaluate('(()=>{var n=document.getElementById("csh-ach-feedback"),r=n.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&r.height<=innerHeight*.45&&n.dataset.reduced==="true"&&getComputedStyle(n).animationName==="none";})()'));
  stage('native-feedback-'+w+'x'+h,{screenshot:await snap('native-feedback-'+w+'x'+h)});await page.evaluate('lib.cshUI.achievementSkip()');
 }

 await page.evaluate('lib.cshUI.achievement([{id:"cache-before",title:"缓存前样本",pc:1}]);window.dispatchEvent(new PageTransitionEvent("pagehide",{persisted:true}))');
 check('back-forward cache entry folds animation without destroying presentation',await page.evaluate('!document.getElementById("csh-ach-feedback")&&lib.cshUI.achievementState().paused'));
 await page.evaluate('window.dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true}));lib.cshUI.achievement([{id:"cache-after",title:"缓存返回样本",pc:1}])');
 check('back-forward cache return accepts new feedback with no stale replay',await page.evaluate('!!document.getElementById("csh-ach-feedback")&&!lib.cshUI.achievementState().paused&&lib.cshUI.achievementState().history.some(r=>r.id==="cache-after")'));await page.evaluate('lib.cshUI.achievementSkip()');
 const errors=await page.evaluate('({errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})');check('feedback host has no uncaught error or rejection',!errors.errors.length&&!errors.rejections.length,errors);
 fs.writeFileSync(path.join(out,'feedback-layout.json'),JSON.stringify(feedbackMetrics,null,2));
}
`;
let s=fs.readFileSync(root+'/tools/probe_host_smoke.mjs','utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root = '+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));s=s.replace("if(process.argv.includes('--world-layout-410'))","if(process.argv.includes('--achievement-feedback'))await achievementFeedbackHost();\n    else if(process.argv.includes('--world-layout-410'))");const runner=path.join(out,'isolated-feedback-runner.mjs');fs.writeFileSync(runner,tests+'\n'+s);const child=spawn(process.execPath,[runner,'--achievement-feedback','--out',out],{stdio:'inherit',windowsHide:true});await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{process.exitCode=code||0;resolve();});});
