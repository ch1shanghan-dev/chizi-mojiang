// Full installed Noname host; disposable browser, isolated IDB and real pointer input.
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {pathToFileURL,fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),i=process.argv.indexOf('--out');if(i<0)throw Error('External --out required');const out=path.resolve(process.argv[i+1]);if(out.startsWith(root+path.sep))throw Error('Keep test artifacts outside installation');fs.mkdirSync(out,{recursive:true});
const tests=String.raw`
async function panelWindowHost(){
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();return lib.cshDebug.openLobby()})()');
 await until('!!window.CSHPanelWindow&&!!document.getElementById("csh-window-mode")','installed window controls');
 const money=await page.evaluate('lib.cshWallet.wallet.pc()');
 const bounds=async()=>page.evaluate('(()=>{let r=document.getElementById("csh-dbg-panel").getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,viewport:innerWidth,viewHeight:innerHeight}})()');
 const fits=r=>r.x>=0&&r.y>=0&&r.right<=r.viewport+1&&r.bottom<=r.viewHeight+1;
 check('fresh real host keeps fullscreen as default',await page.evaluate('document.getElementById("csh-dbg-panel").getAttribute("aria-modal")==="true"&&getComputedStyle(document.querySelector(".csh-window-options")).display==="none"'));
 await clickElement('document.getElementById("csh-dbg-settings-toggle")');await clickElement('document.getElementById("csh-window-mode")');
 check('actual settings enable floating without remaining open',await page.evaluate('document.getElementById("csh-dbg-overlay").classList.contains("csh-windowed")&&!document.getElementById("csh-dbg-panel").classList.contains("csh-head-settings-open")'));
 const before=await bounds(),p=await page.evaluate('(()=>{let r=document.querySelector(".csh-dbg-head-main").getBoundingClientRect();return{x:r.x+60,y:r.y+r.height/2}})()');
 for(const [type,dx,dy]of [['mousePressed',0,0],['mouseMoved',65,40],['mouseReleased',65,40]])await page.send('Input.dispatchMouseEvent',{type,x:p.x+dx,y:p.y+dy,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:type==='mouseMoved'?0:1});
 const after=await bounds();check('real title drag uses viewport pixels',Math.abs(after.x-before.x-65)<2&&Math.abs(after.y-before.y-40)<2&&fits(after),{before,after});
 const retained=await page.evaluate('({body:document.getElementById("csh-dbg-body").scrollTop,style:document.getElementById("csh-dbg-panel").getAttribute("style")})');
 await clickElement('document.querySelector(".gb-career")');await until('!!document.getElementById("csh-shell-frame")?.contentDocument?.getElementById("ach-grid")','real career child from floating world');
 check('floating world still opens the real fullscreen game shell',await page.evaluate('document.getElementById("csh-shell-frame").getBoundingClientRect().width>=innerWidth-2'));
 await clickElement('document.getElementById("csh-shell-close")');
 await until('!document.getElementById("csh-shell-overlay")','return from career');
 check('return from child preserves floating position and content',await page.evaluate('document.getElementById("csh-dbg-overlay").classList.contains("csh-windowed")&&document.querySelectorAll("button.csh-dbg-gamebtn:not(.locked)").length===11&&document.getElementById("csh-dbg-panel").getAttribute("style")==='+JSON.stringify(retained.style)));
 stage('panel-world-desktop',{screenshot:await snap('panel-world-desktop')});
 await page.evaluate('lib.cshUI.achievement([{id:"fixture_panel_window",source:"career",title:"浮窗交互验证",description:"测试提示不应遮住操作",pc:0}],{kind:"unlock"})');
 for(const [width,height]of [[915,412],[640,286]]){
  await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(150);const r=await bounds();
  check('real landscape viewport retains reachable controls '+width,fits(r)&&await page.evaluate('["csh-dbg-close","csh-window-fold","csh-dbg-settings-toggle"].every(id=>{let r=document.getElementById(id).getBoundingClientRect();return r.width>=44&&r.height>=44&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1})'),r);
  check('live feedback does not cover fold/close '+width,await page.evaluate('["csh-window-fold","csh-dbg-close"].every(id=>{const n=document.getElementById(id),r=n.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return n===top||n.contains(top)})'));
  await clickElement('document.getElementById("csh-window-fold")');const c=await bounds();check('real collapse keeps a compact recoverable strip '+width,c.h<80&&fits(c)&&await page.evaluate('getComputedStyle(document.getElementById("csh-dbg-main")).display==="none"'),c);
  await clickElement('document.getElementById("csh-window-fold")');check('real expand restores body '+width,await page.evaluate('document.getElementById("csh-dbg-body").getBoundingClientRect().height>100'));
  stage('panel-world-'+width,{screenshot:await snap('panel-world-'+width)});
 }
 await clickElement('document.getElementById("csh-dbg-close")');await page.evaluate('lib.cshDebugMenu.open()');
 check('developer view preserves its operation tabs',await page.evaluate('document.getElementById("csh-dbg-panel").dataset.view==="developer"&&!![...document.querySelectorAll(".csh-dbg-tab")].find(t=>t.textContent==="技能")'));
 await clickElement('document.getElementById("csh-dbg-settings-toggle")');await clickElement('document.getElementById("csh-window-mode")');check('developer view also floats within screen',fits(await bounds()));
 await clickElement('document.getElementById("csh-dbg-close")');await page.evaluate('lib.cshDebug.openLobby()');
 check('world preference survives closing and switching views',await page.evaluate('document.getElementById("csh-dbg-overlay").classList.contains("csh-windowed")'));
 check('display controls never alter player balance',await page.evaluate('lib.cshWallet.wallet.pc()')===money);
 const e=await page.evaluate('({errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})');check('native window flow has no runtime errors',!e.errors.length&&!e.rejections.length,e);
}
`;
let s=fs.readFileSync(root+'/tools/probe_host_smoke.mjs','utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root='+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));
s=s.replace("if(process.argv.includes('--world-layout-410'))","if(process.argv.includes('--panel-window-host'))await panelWindowHost();else if(process.argv.includes('--world-layout-410'))");const runner=path.join(out,'runner.mjs');fs.writeFileSync(runner,tests+'\n'+s);const c=spawn(process.execPath,[runner,'--panel-window-host','--out',out],{stdio:'inherit',windowsHide:true});try{await new Promise((resolve,reject)=>{c.once('error',reject);c.once('exit',code=>{process.exitCode=code||0;resolve()})})}finally{fs.rmSync(runner,{force:true})}
