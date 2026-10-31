import fs from'node:fs';import path from'node:path';import{spawn}from'node:child_process';import{pathToFileURL,fileURLToPath}from'node:url';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];},root=path.resolve(arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'))),out=path.resolve(arg('--out',''));if(!arg('--out')||out===root||out.startsWith(root+path.sep))throw Error('External --out required');fs.mkdirSync(out,{recursive:true});
const hook='window.__debugDragTest={mountFloatBtn:mountFloatBtn,mountAll:mountAll};\n';
const tests=String.raw`
async function debugDragHost(){
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();})()');await until('!!document.getElementById("csh-dbg-float-btn")&&!!window.__debugDragTest','float and test diagnostics');await delay(400);
 const ball='document.getElementById("csh-dbg-float-btn")',key='extension_池子魔将_csh_debug_float_pos';
 const rect=async exp=>page.evaluate('(()=>{const r=('+exp+').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};})()');
 async function drag(exp,x,y){const r=await rect(exp),from={x:r.x+r.w/2,y:r.y+r.h/2};await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...from});await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...from,button:'left',clickCount:1});for(let i=1;i<=4;i++)await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:from.x+(x-from.x)*i/4,y:from.y+(y-from.y)*i/4,button:'left',buttons:1});await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:5,y:5});await delay(450);}
 async function resize(width,height){await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(400);}
 await resize(1365,768);const walletBefore=await page.evaluate('localStorage.getItem("csh_wallet")');
 await drag(ball,250,210);const moved=await rect(ball),saved=await page.evaluate('JSON.parse(localStorage.getItem('+JSON.stringify(key)+'))');
 check('native interior drag follows pointer and persists free placement',moved.x>180&&moved.x<260&&moved.y>140&&moved.y<220&&Math.abs(saved.x-moved.x)<3&&Math.abs(saved.y-moved.y)<3,{moved,saved});
 check('drag release does not accidentally open panel',await page.evaluate('!document.getElementById("csh-dbg-overlay")'));
 await clickElement(ball);await until('!!document.getElementById("csh-dbg-panel")','native ball opens panel');
 const full=await rect('document.getElementById("csh-dbg-panel")');await drag('document.getElementById("csh-dbg-title")',600,200);const afterTitle=await rect('document.getElementById("csh-dbg-panel")');
 check('current full-screen panel is stationary when title is dragged',Math.abs(afterTitle.x-full.x)<1&&Math.abs(afterTitle.y-full.y)<1&&afterTitle.w===full.w&&afterTitle.h===full.h,{full,afterTitle});
 await clickElement('document.getElementById("csh-dbg-close")');await until('!document.getElementById("csh-dbg-overlay")','close panel');const restored=await rect(ball);
 check('closing panel preserves floating entry position',Math.abs(restored.x-moved.x)<3&&Math.abs(restored.y-moved.y)<3,{restored,moved});
 for(const[w,h]of [[915,412],[844,390],[640,286],[390,844]]){await resize(w,h);const r=await rect(ball);check('entry remains reachable after viewport change '+w,r.x>=-3&&r.y>=-3&&r.right<=w+3&&r.bottom<=h+3,r);}
 await resize(1365,768);await drag(ball,1338,740);await resize(640,286);const clamped=await rect(ball);check('old large-screen edge position is clamped inside compact viewport',clamped.x>=-3&&clamped.y>=-3&&clamped.right<=643&&clamped.bottom<=289,clamped);
 for(const zoom of [.65,1,1.5]){await page.evaluate('document.body.style.zoom='+zoom+';game.documentZoom='+zoom);await page.evaluate('lib.cshDebugMenu.open()');await delay(300);const m=await page.evaluate('(()=>{const p=document.getElementById("csh-dbg-panel"),r=p.getBoundingClientRect(),x=document.getElementById("csh-dbg-close").getBoundingClientRect();return {parent:p.parentElement.parentElement.tagName,r:{x:r.x,y:r.y,right:r.right,bottom:r.bottom},close:{x:x.x,y:x.y,right:x.right,bottom:x.bottom},w:innerWidth,h:innerHeight};})()');check('full-screen panel ignores host body zoom '+zoom,m.parent==='HTML'&&m.r.x>=-1&&m.r.y>=-1&&m.r.right<=m.w+1&&m.r.bottom<=m.h+1&&m.close.right<=m.w+1&&m.close.bottom<=m.h+1,m);await clickElement('document.getElementById("csh-dbg-close")');}
 await page.evaluate('document.body.style.zoom="";game.documentZoom=1');
 // Only test instrumentation counts subsequent registrations; it never changes gameplay handlers.
 await page.evaluate('(()=>{const add=document.addEventListener.bind(document),remove=document.removeEventListener.bind(document),types=["pointermove","pointerup","pointercancel"];window.__dragActive=new Map(types.map(t=>[t,new Set()]));document.addEventListener=function(t,f,o){if(__dragActive.has(t))__dragActive.get(t).add(f);return add(t,f,o);};document.removeEventListener=function(t,f,o){if(__dragActive.has(t))__dragActive.get(t).delete(f);return remove(t,f,o);};})()');
 const counts=[];
 for(let i=0;i<5;i++){
  await page.evaluate('lib.config.extension_池子魔将_csh_debug_menu=false;__debugDragTest.mountAll("isolated-disable");');
  check('disabled mount removes floating entry '+i,await page.evaluate('!document.getElementById("csh-dbg-float-btn")'));
  await page.evaluate('lib.config.extension_池子魔将_csh_debug_menu=true;__debugDragTest.mountAll("isolated-enable");');
  const n=await page.evaluate('Array.from(__dragActive.values()).reduce((n,s)=>n+s.size,0)');counts.push(n);
 }
 check('repeated disable and remount retain exactly one document pointer listener set',counts.every(n=>n===3),counts);
 await drag(ball,180,130);check('remounted native pointer still drags without opening panel',await page.evaluate('!document.getElementById("csh-dbg-overlay")')&&(await rect(ball)).x>100);
 // Unloading in the middle of a pointer gesture must not leave the old closure listening.
 const r=await rect(ball),start={x:r.x+r.w/2,y:r.y+r.h/2};await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...start});await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1});
 await page.evaluate('lib.config.extension_池子魔将_csh_debug_menu=false;__debugDragTest.mountAll("isolated-cancel-drag");lib.config.extension_池子魔将_csh_debug_menu=true;__debugDragTest.mountAll("isolated-remount");');
 await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:350,y:190,button:'left',clickCount:1});await delay(350);
 check('unmount during pointer gesture never opens phantom panel',await page.evaluate('!document.getElementById("csh-dbg-overlay")'));
 check('unmount during pointer gesture leaves one usable listener set',await page.evaluate('Array.from(__dragActive.values()).every(s=>s.size===1)'));
 await clickElement(ball);await until('!!document.getElementById("csh-dbg-overlay")','remounted ball short press works');check('remount short press opens just one full-screen panel',await page.evaluate('document.querySelectorAll("#csh-dbg-overlay").length===1'));stage('debug-remount-640',{screenshot:await snap('debug-remount-640')});
 await clickElement('document.getElementById("csh-dbg-close")');

 // A bounded lifecycle stress is distinct from physical-device long-run acceptance.
 const stress=await page.evaluate('(()=>{const counts=[];for(let i=0;i<100;i++){lib.config.extension_池子魔将_csh_debug_menu=false;__debugDragTest.mountAll("isolated-stress-off");lib.config.extension_池子魔将_csh_debug_menu=true;__debugDragTest.mountAll("isolated-stress-on");counts.push(Array.from(__dragActive.values()).reduce((n,s)=>n+s.size,0));}return {cycles:counts.length,min:Math.min(...counts),max:Math.max(...counts)};})()');await delay(350);
 check('100 controlled remount cycles retain one pointer listener set',stress.cycles===100&&stress.min===3&&stress.max===3,stress);
 async function pressF1(){await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'F1',code:'F1',windowsVirtualKeyCode:112});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'F1',code:'F1',windowsVirtualKeyCode:112});await delay(300);}
 await pressF1();check('native F1 opens current full-screen panel',await page.evaluate('document.querySelectorAll("#csh-dbg-overlay").length===1'));await pressF1();check('native F1 closes panel without removing entry',await page.evaluate('!document.getElementById("csh-dbg-overlay")&&!!document.getElementById("csh-dbg-float-btn")'));
 const tapRect=await rect(ball),touch={x:tapRect.x+tapRect.w/2,y:tapRect.y+tapRect.h/2,radiusX:2,radiusY:2,force:1,id:1};await page.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await page.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]});await page.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(350);await page.send('Emulation.setTouchEmulationEnabled',{enabled:false});
 check('native touch short tap opens one panel after remount stress',await page.evaluate('document.querySelectorAll("#csh-dbg-overlay").length===1'));await clickElement('document.getElementById("csh-dbg-close")');

 // Stored coordinates from another monitor are corrected at mount, without clearing any save.
 await page.evaluate('lib.config.extension_池子魔将_csh_debug_menu=false;__debugDragTest.mountAll("isolated-offscreen-reset");lib.config.extension_池子魔将_csh_debug_float_pos={x:9000,y:-9000};lib.config.extension_池子魔将_csh_debug_menu=true;__debugDragTest.mountAll("isolated-offscreen-mount");');await delay(300);const fixed=await rect(ball);check('offscreen saved coordinates return inside viewport at mount',fixed.x>=-3&&fixed.y>=-3&&fixed.right<=643&&fixed.bottom<=289,fixed);
 check('pointer/settings/layout observation leaves wallet bytes unchanged',walletBefore===await page.evaluate('localStorage.getItem("csh_wallet")'));
 const e=await page.evaluate('({errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})');check('debug pointer lifecycle has no runtime errors/rejections',!e.errors.length&&!e.rejections.length,e);fs.writeFileSync(path.join(out,'debug-pointer-counts.json'),JSON.stringify({counts},null,2));
}
`;
let s=fs.readFileSync(path.join(root,'tools/probe_host_smoke.mjs'),'utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root = '+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));
const route="    const target = resolveReadOnly(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));";s=s.replace(route,'    if(decodeURIComponent(url.pathname)==="/extension/池子魔将/core/csh_debug.js"){item.status=200;res.writeHead(200,{"Content-Type":"text/javascript; charset=utf-8","Cache-Control":"no-cache"});let body=fs.readFileSync('+JSON.stringify(path.resolve(arg('--source',path.join(root,'core/csh_debug.js'))))+',"utf8"),end=body.lastIndexOf("})();");if(end<0)throw Error("UI closure moved");body=body.slice(0,end)+'+JSON.stringify(hook)+'+body.slice(end);return res.end(body);}\n'+route);
const anchor="if(process.argv.includes('--world-layout-410'))";s=s.replace(anchor,"if(process.argv.includes('--debug-drag-host'))await debugDragHost();\n    else "+anchor);const runner=path.join(out,'runner.mjs');fs.writeFileSync(runner,tests+'\n'+s);const p=spawn(process.execPath,[runner,'--debug-drag-host','--out',out],{stdio:'inherit',windowsHide:true});await new Promise((r,reject)=>{p.once('error',reject);p.once('exit',code=>{process.exitCode=code||0;r();});});
