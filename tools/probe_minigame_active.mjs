import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {pathToFileURL,fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),idx=process.argv.indexOf('--out');if(idx<0)throw Error('External --out required');const out=process.argv[idx+1];fs.mkdirSync(out,{recursive:true});
const tests=String.raw`
async function activeLandscape(){
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshWallet.wallet.add(50000,"isolated active survey");lib.cshWallet.flushSave();return lib.cshDebug.openLobby();})()');
 for(const key of ['texas','blackjack','doudizhu','uno']){
  await page.evaluate('lib.cshShell.close("active-survey");lib.cshShell.open('+JSON.stringify(key)+',{buyIn:1000})');
  if(await page.evaluate('!!document.querySelector(".csh-fee-go")'))await clickElement('document.querySelector(".csh-fee-go")');
  await until('document.getElementById("csh-shell-frame")?.contentDocument?.getElementById("btn-start-game")',key+' start ready');await delay(600);
  await page.send('Emulation.setDeviceMetricsOverride',{width:915,height:412,deviceScaleFactor:1,mobile:false});await delay(400);
  if(key==='texas'&&await page.evaluate('(()=>{const d=document.getElementById("csh-shell-frame").contentDocument,n=d.getElementById("btn-sign-go");return n&&n.getBoundingClientRect().height>0;})()'))await clickElement('document.getElementById("csh-shell-frame").contentDocument.getElementById("btn-sign-go")',true);
  await delay(400);await clickElement('document.getElementById("csh-shell-frame").contentDocument.getElementById("btn-start-game")',true);await delay(1000);
  const active=await page.evaluate('(()=>{const d=document.getElementById("csh-shell-frame").contentDocument;return {active:!d.getElementById("view-game").classList.contains("hidden"),text:d.body.innerText.slice(-1500)};})()');check(key+' native start enters gameplay',active.active,active);
  for(const [width,height]of [[1365,768],[915,412],[844,390],[640,286]]){
   await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(350);
   const m=await page.evaluate('(()=>{const d=document.getElementById("csh-shell-frame").contentDocument,w=d.defaultView,buttons=[...d.querySelectorAll("#view-game button")].filter(n=>{const r=n.getBoundingClientRect(),s=w.getComputedStyle(n);return r.width&&r.height&&s.visibility!=="hidden"&&s.display!=="none"});return {overflow:d.documentElement.scrollWidth>w.innerWidth+1,height:w.innerHeight,buttons:buttons.map(n=>{const r=n.getBoundingClientRect();return {id:n.id,text:n.textContent.trim().slice(0,30),x:r.x,y:r.y,right:r.right,bottom:r.bottom,h:r.height}}),errors:w.__hostSmoke};})()');
   check(key+' active width bounds '+width+'x'+height,!m.overflow&&m.buttons.every(b=>b.x>=-1&&b.right<=width+1),m);stage('active-'+key+'-'+width+'x'+height,{screenshot:await snap('active-'+key+'-'+width+'x'+height)});
  }
  const e=await page.evaluate('(()=>{const w=document.getElementById("csh-shell-frame").contentWindow;return {errors:w.__hostSmoke.errors,rejections:w.__hostSmoke.rejections};})()');check(key+' gameplay runtime',!e.errors.length&&!e.rejections.length,e);
 }
}
`;
let source=fs.readFileSync(path.join(root,'tools/probe_host_smoke.mjs'),'utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root = '+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));source=source.replace("if(process.argv.includes('--world-layout-410'))","if(process.argv.includes('--active-landscape'))await activeLandscape();\n    else if(process.argv.includes('--world-layout-410'))");const runner=path.join(out,'isolated-active-runner.mjs');fs.writeFileSync(runner,tests+'\n'+source);const child=spawn(process.execPath,[runner,'--active-landscape','--out',out],{stdio:'inherit',windowsHide:true});await new Promise(r=>child.once('exit',c=>{process.exitCode=c||0;r();}));
