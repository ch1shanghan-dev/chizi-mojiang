// Real host pointer flows for tracking and partial/retried bulk awards. Isolated data only.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const arg=n=>{const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1];};
const root=arg('--root')||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=arg('--out');if(!out)throw Error('External --out required');fs.mkdirSync(out,{recursive:true});
const test=String.raw`
async function progress410(){
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();return lib.cshDebug.openLobby();})()');
 const frame=js=>page.evaluate('(()=>{const d=document.getElementById("csh-shell-frame").contentDocument,w=d.defaultView;return ('+js+');})()');
 const open=async(key)=>{await page.evaluate('lib.cshShell.close("isolated-progress");lib.cshShell.open('+JSON.stringify(key)+')');await until('document.getElementById("csh-shell-frame")?.contentDocument?.readyState==="complete"&&document.getElementById("csh-shell-frame").src.includes("/'+key+'.html")',key+' load');await delay(500);};
 await open('achv');await until('document.getElementById("csh-shell-frame").contentDocument.querySelectorAll(".csh-goal-pin").length===80','all 80 operations');
 for(let i=0;i<3;i++)await clickElement('document.getElementById("csh-shell-frame").contentDocument.querySelectorAll(".csh-goal-pin")['+i+']',true);
 check('pool pins three actual distinct goals',await frame('w.CSHGoals.list("pool").length===3&&d.querySelectorAll("#goal-bar article").length===3'));
 await clickElement('document.getElementById("csh-shell-frame").contentDocument.querySelectorAll(".csh-goal-pin")[3]',true);
 check('fourth goal is refused with readable feedback',await frame('w.CSHGoals.list("pool").length===3&&d.getElementById("message").textContent.includes("最多")'));
 await open('save');await open('achv');check('pool pins survive closing and reopening',await frame('w.CSHGoals.list("pool").length===3&&d.querySelectorAll("#goal-bar article").length===3'));
 const layout=async(kind,listId)=>{
  for(const [width,height]of [[390,844],[640,286]]){
   await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(650);
   await frame('(d.querySelector('+JSON.stringify(listId)+').scrollIntoView({block:"start"}),true)');await delay(300);
   const p=await frame('(()=>{const list=d.querySelector('+JSON.stringify(listId)+'),r=list.getBoundingClientRect(),bar=d.querySelector(".csh-goal-bar"),b=bar.getBoundingClientRect(),first=list.firstElementChild,f=first&&first.getBoundingClientRect();return {list:{y:r.y,height:r.height,bottom:r.bottom},bar:{height:b.height,scrollHeight:bar.scrollHeight},first:f?{y:f.y,height:f.height}:null,width:w.innerWidth,height:w.innerHeight,overflow:d.documentElement.scrollWidth>w.innerWidth+1};})()');
   check(kind+' tracking leaves reachable usable list '+width+'x'+height,Math.min(p.list.bottom,p.height)-Math.max(0,p.list.y)>=60&&!p.overflow,p);
   stage(kind+'-tracked-'+width+'x'+height,{screenshot:await snap(kind+'-tracked-'+width+'x'+height)});
  }
 };
 await layout('pool','#list');
 await frame('(w.CSHGoals.list("pool").forEach(id=>w.CSHGoals.toggle("pool",id)),true)');await open('achv');
 // A synthetic unlock fixture tests the real, unchanged reward definitions and persistence.
 const fixture=await page.evaluate('(()=>{const p=CSH_POOL_ACHV,rows=p.RULES.slice(0,3);for(const r of rows)p.unlock(r.id,"identity");return rows.map(r=>({id:r.id,...p.reward(r)}));})()');await open('achv');
 await until('!document.getElementById("csh-shell-frame").contentDocument.getElementById("claim-all").disabled','bulk ready');
 await page.evaluate('window.__progressBefore={pc:lib.cshWallet.wallet.pc(),merit:lib.cshWallet.rank.get().merit};window.__claimPoolOriginal=lib.cshWallet.wallet.claimPool;window.__claimPoolN=0;lib.cshWallet.wallet.claimPool=function(...args){if(++window.__claimPoolN===2)return {ok:false,reason:"isolated injected write refusal"};return window.__claimPoolOriginal.apply(this,args);}');
 await clickElement('document.getElementById("csh-shell-frame").contentDocument.getElementById("claim-all")',true);await delay(500);
 const partial=await page.evaluate('({before:__progressBefore,pc:lib.cshWallet.wallet.pc(),merit:lib.cshWallet.rank.get().merit,paid:CSH_POOL_ACHV.RULES.slice(0,3).map(r=>CSH_POOL_ACHV.isPaid(r.id)),message:document.getElementById("csh-shell-frame").contentDocument.getElementById("message").textContent})');
 check('bulk refusal preserves first actual receipt and remaining eligibility',partial.paid[0]&&!partial.paid[1]&&!partial.paid[2]&&partial.pc-partial.before.pc===fixture[0].pc&&partial.message.includes('仍有'),partial);
 await page.evaluate('lib.cshWallet.wallet.claimPool=window.__claimPoolOriginal');
 await clickElement('document.getElementById("csh-shell-frame").contentDocument.getElementById("claim-all")',true);await delay(500);
 const paid=await page.evaluate('({pc:lib.cshWallet.wallet.pc(),merit:lib.cshWallet.rank.get().merit,all:CSH_POOL_ACHV.RULES.slice(0,3).every(r=>CSH_POOL_ACHV.isPaid(r.id)),wallet:JSON.parse(localStorage.getItem("csh_wallet")),rank:JSON.parse(localStorage.getItem("csh_rank"))})');
 check('retry credits exactly all three rewards with durable dual receipts',paid.all&&paid.pc-partial.before.pc===fixture.reduce((n,r)=>n+r.pc,0)&&paid.merit-partial.before.merit===fixture.reduce((n,r)=>n+r.merit,0)&&fixture.every(r=>paid.wallet.poolClaims[r.id]&&paid.rank.poolClaims[r.id]===r.merit),{fixture,partial,paid});
 await page.evaluate('document.getElementById("csh-shell-frame").contentDocument.getElementById("claim-all").dispatchEvent(new MouseEvent("click"))');await delay(400);
 check('repeated bulk request cannot duplicate awards',await page.evaluate('lib.cshWallet.wallet.pc()')===paid.pc);
 await page.evaluate('window.__progressReloadMark=true');await page.send('Page.reload',{ignoreCache:true});await until('typeof window.__progressReloadMark==="undefined"&&!!window.lib?.cshWallet&&!!window.lib?.cshShell&&!!window.CSH_POOL_ACHV&&!!document.getElementById("arena")','whole host reload',30000);await delay(600);
 check('bulk awards survive entire host reload',await page.evaluate('lib.cshWallet.wallet.pc()')===paid.pc&&await page.evaluate('CSH_POOL_ACHV.RULES.slice(0,3).every(r=>CSH_POOL_ACHV.isPaid(r.id))'));
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();return lib.cshDebug.openLobby();})()');
 await page.send('Emulation.setDeviceMetricsOverride',{width:1365,height:768,deviceScaleFactor:1,mobile:false});
 await open('career');await clickElement('document.getElementById("csh-shell-frame").contentDocument.querySelector("[data-p=ach]")',true);await until('document.getElementById("csh-shell-frame").contentDocument.querySelectorAll(".csh-goal-pin").length>=4','career goals');
 for(let i=0;i<3;i++)await clickElement('document.getElementById("csh-shell-frame").contentDocument.querySelectorAll(".csh-goal-pin")['+i+']',true);
 check('career pins independent of operation pins',await frame('w.CSHGoals.list("career").length===3&&w.CSHGoals.list("pool").length===0'));
 await layout('career','#ach-grid');
 const e=await page.evaluate('({errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})');check('tracking and batch flows have no runtime exceptions',!e.errors.length&&!e.rejections.length,e);
}
`;
let source=fs.readFileSync(path.join(root,'tools/probe_host_smoke.mjs'),'utf8');
source=source.replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root = '+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));
const anchor="if(process.argv.includes('--world-layout-410'))";if(!source.includes(anchor))throw Error('Host harness dispatch changed');source=source.replace(anchor,"if(process.argv.includes('--progress410-only'))await progress410();\n    else "+anchor);
const runner=path.join(out,'isolated-progress-runner.mjs');fs.writeFileSync(runner,test+'\n'+source);
const child=spawn(process.execPath,[runner,'--progress410-only','--out',out],{stdio:'inherit',windowsHide:true});await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{process.exitCode=code||0;resolve();});});
