// World header layout in the installed host; disposable profile, read-only server and external output.
import fs from'node:fs';import path from'node:path';import{spawn}from'node:child_process';import{fileURLToPath,pathToFileURL}from'node:url';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];},root=path.resolve(arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'))),out=path.resolve(arg('--out',''));
if(!arg('--out')||out===root||out.startsWith(root+path.sep))throw Error('External --out required');fs.mkdirSync(out,{recursive:true});
const tests=String.raw`
async function worldHeader(){
 const metrics=[];
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshWallet.flushSave();window.__headerWallet=lib.cshWallet.wallet.pc();lib.cshDebug.openLobby();})()');
 async function open(){await page.evaluate('lib.cshShell.close("header-test");lib.cshDebug.openLobby();');await until('!!document.querySelector(".csh-world-hero")','world header');await delay(350);await page.evaluate('document.getElementById("csh-dbg-body").scrollTop=0');}
 async function metric(mode,w,h){
  const x=await page.evaluate('('+function(){
   const body=document.getElementById('csh-dbg-body'),hero=document.querySelector('.csh-world-hero'),intro=hero.querySelector('div'),board=document.querySelector('.csh-world-board'),rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};},r=rect(hero),b=rect(body),i=rect(intro),overlap=(a,c)=>Math.max(0,Math.min(a.right,c.right)-Math.max(a.x,c.x))*Math.max(0,Math.min(a.bottom,c.bottom)-Math.max(a.y,c.y));
   const buttons=[...hero.querySelectorAll('button')].map(n=>{const r=rect(n),hit=document.elementFromPoint(r.x+r.w/2,r.y+r.h/2);return {...r,text:n.textContent,font:parseFloat(getComputedStyle(n).fontSize),hit:hit===n||n.contains(hit),inViewport:r.x>=0&&r.right<=innerWidth&&r.y>=b.y&&r.bottom<=Math.min(b.bottom,innerHeight),overlap:overlap(r,i)};});
   const texts=[...intro.querySelectorAll('h2,p')].map(n=>({text:n.textContent,font:parseFloat(getComputedStyle(n).fontSize),overflow:n.scrollWidth>n.clientWidth+1,clipped:n.scrollHeight>n.clientHeight+1,...rect(n)}));
   return {width:innerWidth,height:innerHeight,hero:r,body:b,buttons,texts,overflow:body.scrollWidth>body.clientWidth+2||hero.scrollWidth>hero.clientWidth+2||board.getBoundingClientRect().right>innerWidth+1,warning:hero.querySelector('.csh-world-save-warning')?.textContent||'',scroll:body.scrollTop};
  }.toString()+')()');metrics.push({mode,...x});stage('world-header-'+mode+'-'+w+'x'+h,{metric:x,screenshot:await snap('world-header-'+mode+'-'+w+'x'+h)});
  check('world header no overflow or text clipping '+mode+' '+w,!x.overflow&&x.texts.every(n=>!n.overflow&&!n.clipped&&n.font>=12),x);
  check('world header buttons remain 44px readable and separate '+mode+' '+w,x.buttons.length>0&&x.buttons.every(n=>n.h>=44&&n.font>=14&&n.overlap<1),x);
  if(mode==='normal')check('normal header compact without hiding information '+w,x.hero.h<=85&&x.texts.some(n=>n.text.includes('池子币'))&&x.texts.some(n=>n.text.includes('相识')&&n.text.includes('同桌')&&n.text.includes('在场')),x);
  if(mode!=='long-text')check('world header actions are initially visible and hit-testable '+mode+' '+w,x.buttons.every(n=>n.inViewport&&n.hit),x);
  return x;
 }
 for(const[w,h]of[[1365,768],[915,412],[844,390],[640,286],[390,844]]){await page.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});await open();await metric('normal',w,h);}
 await clickElement('document.querySelector(".csh-world-hero .csh-world-start")');await until('!!document.querySelector(".csh-fee-no")','native table entry');
 check('real header table action opens entry without spending',await page.evaluate('!!document.querySelector(".csh-fee-go")&&lib.cshWallet.wallet.pc()===__headerWallet'));await clickElement('document.querySelector(".csh-fee-no")');
 await page.evaluate('localStorage.setItem(lib.cshWallet.pending.KEY,"{isolated-header-corrupt");');
 for(const[w,h]of[[915,412],[844,390],[640,286],[390,844]]){await page.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});await open();const x=await metric('warning',w,h);check('real pending warning is fully present '+w,x.warning.includes('遇到问题')&&x.buttons.some(n=>n.text.includes('行囊')),x);}
 await clickElement('[...document.querySelectorAll(".csh-world-hero .csh-world-start")].find(n=>n.textContent.includes("行囊"))');await until('!!document.getElementById("csh-shell-frame")?.contentDocument?.getElementById("pending-note")','native recovery target');
 check('real recovery action opens bag without erasing journal or paying',await page.evaluate('document.getElementById("csh-shell-frame").contentDocument.getElementById("pending-note").textContent.includes("遇到问题")&&localStorage.getItem(lib.cshWallet.pending.KEY)==="{isolated-header-corrupt"&&lib.cshWallet.wallet.pc()===__headerWallet'));
 await page.evaluate('lib.cshShell.close("header-test");localStorage.removeItem(lib.cshWallet.pending.KEY);lib.cshWallet.pending.retry();');
 for(const[w,h]of[[915,412],[640,286],[390,844]]){
  await page.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});await open();
  await page.evaluate('(()=>{const n=document.querySelector(".csh-world-hero>div");n.querySelector("h2").textContent="池子币 100,000,000,000 CBY · 生涯近况";n.querySelector("p").textContent="相识与同桌记录完整保留，长说明应换行而不裁切。".repeat(3)+"PublicLegacyStatusWithoutSpaces".repeat(3);})()');await delay(200);await metric('long-text',w,h);
  await page.evaluate('document.querySelector(".csh-world-hero button").scrollIntoView({block:"center"})');await delay(150);
  check('long header action remains scroll-reachable '+w,await page.evaluate('(()=>{const n=document.querySelector(".csh-world-hero button"),r=n.getBoundingClientRect(),b=document.getElementById("csh-dbg-body").getBoundingClientRect();return r.y>=b.y&&r.bottom<=b.bottom&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===n;})()'));
 }
 const e=await page.evaluate('({errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})');check('world header no runtime error/rejection',!e.errors.length&&!e.rejections.length,e);
 fs.writeFileSync(path.join(out,'world-header-metrics.json'),JSON.stringify(metrics,null,2));
}
`;
let source=fs.readFileSync(root+'/tools/probe_host_smoke.mjs','utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root = '+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));
const marker="if(process.argv.includes('--world-layout-410'))";if(!source.includes(marker))throw Error('Host anchor changed');source=source.replace(marker,"if(process.argv.includes('--world-header'))await worldHeader();\n    else "+marker);
if(arg('--world-source')){const anchor="    const target = resolveReadOnly(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));";if(!source.includes(anchor))throw Error('Server anchor changed');source=source.replace(anchor,'    if(decodeURIComponent(url.pathname)==="/extension/池子魔将/core/csh_world_view.js"){item.status=200;res.writeHead(200,{"Content-Type":"text/javascript; charset=utf-8","Cache-Control":"no-cache"});return res.end(fs.readFileSync('+JSON.stringify(path.resolve(arg('--world-source')))+'));}\n'+anchor);}
const file=path.join(out,'isolated-world-header-runner.mjs');fs.writeFileSync(file,tests+'\n'+source);const child=spawn(process.execPath,[file,'--world-header','--out',out],{stdio:'inherit',windowsHide:true});await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{process.exitCode=code||0;resolve();});});
