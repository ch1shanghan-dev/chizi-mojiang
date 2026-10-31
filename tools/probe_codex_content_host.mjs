// Installed page in a real host, disposable browser profile; writes only to external --out.
import fs from 'node:fs';import path from 'node:path';import {spawn}from'node:child_process';import{fileURLToPath,pathToFileURL}from'node:url';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];};
const root=arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')),out=path.resolve(arg('--out',''));
if(!arg('--out')||out===root||out.startsWith(root+path.sep))throw Error('Use an external --out');fs.mkdirSync(out,{recursive:true});
const tests=String.raw`
async function codexContent(){
 const baseline=process.argv.includes('--baseline'),metrics=[];
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshDebug.openLobby();lib.cshShell.open("codex");})()');
 if(await page.evaluate('!!document.querySelector(".csh-fee-go")'))await clickElement('document.querySelector(".csh-fee-go")');
 const f='document.getElementById("csh-shell-frame")',d=f+'.contentDocument';
 await until(f+'?.contentDocument?.querySelectorAll(".gitem").length===50','all 50 codex entries');
 async function metric(w,h,mode='normal'){
  const m=await page.evaluate('('+function(){
   const f=document.getElementById('csh-shell-frame'),d=f.contentDocument,w=f.clientWidth,h=f.clientHeight;
   const rect=q=>{const n=d.querySelector(q),r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,clientW:n.clientWidth,clientH:n.clientHeight,scrollW:n.scrollWidth,scrollH:n.scrollHeight};};
   const dossier=rect('.dossier'),info=rect('.dinfo'),portrait=rect('.dstage'),main=rect('.main');
   const area=r=>Math.max(0,Math.min(w,r.right,main.right)-Math.max(0,r.x,main.x))*Math.max(0,Math.min(h,r.bottom,main.bottom)-Math.max(0,r.y,main.y));
   const hit=d.elementFromPoint(Math.min(w-1,info.x+info.w/2),Math.min(h-1,info.y+Math.min(info.h/2,60)));
   return {w,h,dossier,info,portrait,main,roster:rect('.rolodexwrap'),topbar:rect('.topbar'),bodyOverflow:d.documentElement.scrollWidth>w+2,infoOverflow:info.scrollW>info.clientW+2,ratio:area(dossier)/(w*h),infoVisibleHeight:Math.max(0,Math.min(h,info.bottom,main.bottom)-Math.max(0,info.y,main.y)),infoHit:!!hit&&!!hit.closest('.dinfo'),walletHidden:document.getElementById('csh-shell-pc')?getComputedStyle(document.getElementById('csh-shell-pc')).display==='none':null};
  }.toString()+')()');metrics.push({width:w,height:h,mode,...m});
  stage('codex-'+mode+'-'+w+'x'+h,{metric:m,screenshot:await snap('codex-'+mode+'-'+w+'x'+h)});
  check('codex no horizontal overflow '+mode+' '+w,!m.bodyOverflow&&!m.infoOverflow,m);
  check('codex dossier has priority '+mode+' '+w,m.ratio>=(h<320?.55:w>1000?.75:.65),m);check('codex information is readable and directly hit '+mode+' '+w,m.infoVisibleHeight>=(h<320?110:160)&&m.infoHit,m);
 }
 for(const[w,h]of [[1365,768],[915,412],[844,390],[640,286],[390,844]]){
  await page.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});await delay(450);
  await page.evaluate(d+'.querySelector(".dinfo").scrollTop=0');await metric(w,h);
 }
 if(!baseline){
  const walletBefore=await page.evaluate('localStorage.getItem(lib.cshWallet.KEYS.wallet)');
  await page.send('Emulation.setDeviceMetricsOverride',{width:640,height:286,deviceScaleFactor:1,mobile:false});await delay(450);
  await page.evaluate(d+'.body.classList.add("empty")');
  check('empty-state layout has no unusable roster button',await page.evaluate('getComputedStyle('+d+'.getElementById("empty")).display!=="none"&&getComputedStyle('+d+'.getElementById("codex-roster-toggle")).display==="none"'));
  await page.evaluate(d+'.body.classList.remove("empty")');
  check('compact roster starts folded without hiding current dossier',await page.evaluate(d+'.getElementById("codex-roster-toggle").getAttribute("aria-expanded")==="false"&&getComputedStyle('+d+'.getElementById("codex-roster")).display==="none"'));
  // Independent review regression: changing the person while the list is hidden must not focus an offscreen entry.
  await clickElement(d+'.getElementById("codex-roster-toggle")',true);await clickElement(d+'.getElementById("codex-roster-toggle")',true);
  await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});await delay(350);
  const selectedBefore=await page.evaluate(d+'.getElementById("dname").textContent');
  await clickElement(d+'.getElementById("codex-roster-toggle")',true);
  async function selectedVisible(label){const m=await page.evaluate('('+function(){const f=document.getElementById('csh-shell-frame'),d=f.contentDocument,l=d.getElementById('rolodex'),n=l.querySelector('.gitem.on'),a=n.getBoundingClientRect(),r=l.getBoundingClientRect();return {focus:d.activeElement===n,top:a.top,bottom:a.bottom,listTop:r.top,listBottom:r.bottom,listScroll:l.scrollTop,infoScroll:d.querySelector('.dinfo').scrollTop,pageScroll:d.defaultView.scrollY,appScroll:d.getElementById('app').scrollTop,name:d.getElementById('dname').textContent};}.toString()+')()');check(label,m.focus&&m.top>=m.listTop-1&&m.bottom<=m.listBottom+1&&m.pageScroll===0&&m.appScroll===0,m);return m;}
  const lastVisible=await selectedVisible('hidden-list arrow to last entry then expand keeps selected row fully visible');
  check('revealing current entry does not change person or move dossier',lastVisible.name===selectedBefore&&lastVisible.infoScroll===0);
  stage('codex-last-entry-visible',{screenshot:await snap('codex-last-entry-visible')});
  await clickElement(d+'.getElementById("codex-roster-toggle")',true);
  for(let i=0;i<24;i++){await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});}
  await clickElement(d+'.getElementById("codex-roster-toggle")',true);await selectedVisible('hidden-list navigation to middle then expand keeps current row visible');
  await clickElement(d+'.querySelector(".gitem:first-child")',true);await delay(350);
  await clickElement(d+'.getElementById("codex-roster-toggle")',true);
  check('native click reveals all entries and focuses selected row',await page.evaluate(d+'.getElementById("codex-roster-toggle").getAttribute("aria-expanded")==="true"&&getComputedStyle('+d+'.getElementById("codex-roster")).display!=="none"&&'+d+'.activeElement.matches(".gitem.on")&&'+d+'.querySelectorAll(".gitem").length===50'));
  stage('codex-roster-open',{screenshot:await snap('codex-roster-open')});
  const last=await page.evaluate(d+'.querySelector(".gitem:last-child .gname").textContent');
  await page.evaluate(d+'.querySelector(".dinfo").scrollTop=99999');
  await clickElement(d+'.querySelector(".gitem:last-child")',true);await delay(500);
  check('selection changes dossier and folds roster with focus return',await page.evaluate(d+'.getElementById("dname").textContent==='+JSON.stringify(last)+'&&'+d+'.getElementById("codex-roster-toggle").getAttribute("aria-expanded")==="false"&&'+d+'.activeElement.id==="codex-roster-toggle"&&'+d+'.querySelector(".dinfo").scrollTop===0'));
  await clickElement(d+'.getElementById("codex-roster-toggle")',true);
  await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await delay(150);
  check('Escape folds only the roster and restores toggle focus',await page.evaluate('!!'+f+'&&'+d+'.getElementById("dname").textContent==='+JSON.stringify(last)+'&&'+d+'.getElementById("codex-roster-toggle").getAttribute("aria-expanded")==="false"&&'+d+'.activeElement.id==="codex-roster-toggle"'));
  await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await delay(450);
  check('arrow navigation still wraps from last entry to first',await page.evaluate(d+'.getElementById("dname").textContent==='+d+'.querySelector(".gitem:first-child .gname").textContent'));
  const point=await page.evaluate('(()=>{const f='+f+',r=f.contentDocument.getElementById("codex-roster-toggle").getBoundingClientRect(),p=f.getBoundingClientRect();return {x:p.x+r.x+r.width/2,y:p.y+r.y+r.height/2};})()');
  await page.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await page.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,radiusX:2,radiusY:2,force:1,id:1}]});await page.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(300);
  check('real touch tap opens the roster',await page.evaluate(d+'.getElementById("codex-roster-toggle").getAttribute("aria-expanded")==="true"'));
  await page.send('Emulation.setTouchEmulationEnabled',{enabled:false});await clickElement(d+'.getElementById("codex-roster-toggle")',true);
  await page.send('Emulation.setDeviceMetricsOverride',{width:1365,height:768,deviceScaleFactor:1,mobile:false});await delay(450);
  check('desktop resize restores permanent roster without extra header control',await page.evaluate('getComputedStyle('+d+'.getElementById("codex-roster")).display!=="none"&&getComputedStyle('+d+'.getElementById("codex-roster-toggle")).display==="none"'));
  await clickElement(d+'.querySelectorAll(".gitem")[35]',true);const resizeName=await page.evaluate(d+'.getElementById("dname").textContent');
  await page.send('Emulation.setDeviceMetricsOverride',{width:640,height:286,deviceScaleFactor:1,mobile:false});await delay(350);await clickElement(d+'.getElementById("codex-roster-toggle")',true);
  const resizeVisible=await selectedVisible('desktop scroll selection remains visible after compact resize and reveal');check('resize keeps actual selected dossier',resizeVisible.name===resizeName);
  await clickElement(d+'.querySelector(".gitem:first-child")',true);await delay(350);
  await page.send('Emulation.setDeviceMetricsOverride',{width:915,height:412,deviceScaleFactor:1,mobile:false});await delay(450);
  await clickElement(d+'.querySelector(".pkbox > summary")',true);
  check('existing reward details remain expandable after scrolling',await page.evaluate(d+'.querySelector(".pkbox").open'));
  const giftLayout=await page.evaluate('('+function(){const d=document.getElementById('csh-shell-frame').contentDocument;return [...d.querySelectorAll('.affgifts .affbtn')].map(n=>({text:n.textContent,disabled:n.disabled,h:n.getBoundingClientRect().height,w:n.getBoundingClientRect().width}));}.toString()+')()');
  check('four real gift prices and locked state are preserved with usable targets',giftLayout.length===4&&giftLayout.every(x=>x.disabled&&x.h>=44)&&['6,000','28,000','120,000','680,000'].every(x=>giftLayout.some(y=>y.text.includes(x))),giftLayout);
  await page.evaluate('(()=>{const d='+d+';d.querySelector(".dinfo").scrollTop=0;d.getElementById("dbio").textContent="长说明".repeat(140);const n=d.getElementById("dchief");n.hidden=false;n.textContent="公开快照 · "+"LongPublicName".repeat(30);})()');await metric(915,412,'long-text');
  for(const skin of await page.evaluate('Object.keys(lib.cshTheme.SKINS)')){await page.evaluate('lib.cshTheme.setSkin('+JSON.stringify(skin)+')');await delay(250);await metric(915,412,'skin-'+skin);}
  await page.evaluate('lib.cshTheme.setSkin("sgs")');
  check('viewing navigation and details leave wallet bytes unchanged',walletBefore===await page.evaluate('localStorage.getItem(lib.cshWallet.KEYS.wallet)'));
  await clickElement('document.getElementById("csh-shell-close")');check('host close removes codex iframe',await page.evaluate('!document.getElementById("csh-shell-frame")'));
  await page.evaluate('lib.cshShell.open("codex")');if(await page.evaluate('!!document.querySelector(".csh-fee-go")'))await clickElement('document.querySelector(".csh-fee-go")');await until(f+'?.contentDocument?.querySelectorAll(".gitem").length===50','reopened codex');
  check('reopening resets only local roster disclosure',await page.evaluate(d+'.getElementById("codex-roster-toggle").getAttribute("aria-expanded")==="false"')&&walletBefore===await page.evaluate('localStorage.getItem(lib.cshWallet.KEYS.wallet)'));
 }
 fs.writeFileSync(path.join(out,'codex-metrics.json'),JSON.stringify({baseline,metrics},null,2));
 const e=await page.evaluate('(()=>{const f=document.getElementById("csh-shell-frame");return {host:__hostSmoke,frame:f?.contentWindow.__hostSmoke};})()');check('codex host and iframe have no runtime error/rejection',!e.host.errors.length&&!e.host.rejections.length&&(!e.frame||(!e.frame.errors.length&&!e.frame.rejections.length)),e);
}
`;
let source=fs.readFileSync(path.join(root,'tools/probe_host_smoke.mjs'),'utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root = '+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));
const marker="if(process.argv.includes('--world-layout-410'))";if(!source.includes(marker))throw Error('host harness anchor changed');source=source.replace(marker,"if(process.argv.includes('--codex-content'))await codexContent();\n    else "+marker);
if(arg('--page-source')){const anchor="    const target = resolveReadOnly(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));";if(!source.includes(anchor))throw Error('server anchor');source=source.replace(anchor,'    if(decodeURIComponent(url.pathname)==="/extension/池子魔将/games/codex.html"){item.status=200;res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-cache"});return res.end(fs.readFileSync('+JSON.stringify(path.resolve(arg('--page-source')))+'));}\n'+anchor);}
const runner=path.join(out,'isolated-codex-runner.mjs');fs.writeFileSync(runner,tests+'\n'+source);
const child=spawn(process.execPath,[runner,'--codex-content',...(process.argv.includes('--baseline')?['--baseline']:[]),'--out',out],{stdio:'inherit',windowsHide:true});await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{process.exitCode=code||0;resolve();});});
