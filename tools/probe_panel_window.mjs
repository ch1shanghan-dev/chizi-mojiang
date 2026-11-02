// Real world/debug UI and pointer input; isolated Chromium data, no player saves.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {root} from './lib/skill_audit.mjs';import {withChromium} from './lib/chromium_audit.mjs';import {auditTempRoot,removeAuditScratch} from './lib/audit_scratch.mjs';
const i=process.argv.indexOf('--out');if(i<0)throw Error('--out on D: required');const out=path.resolve(process.argv[i+1]);fs.mkdirSync(out,{recursive:true});
const clean=s=>s.replace(/^import .*?;\r?\n/gm,'').replace(/^export default null;.*$/gm,'').replace(/^export /gm,'').replace(/<\/script/gi,'<\\/script');
const files=['core/csh_theme.js','core/csh_uikit.js','core/csh_registry.js','core/csh_games.js','core/csh_world_view.js','core/csh_panel_window.js'];
const modules=files.map(f=>clean(fs.readFileSync(path.join(root,f),'utf8'))).join('\n'),source=clean(fs.readFileSync(path.join(root,'core/csh_debug.js'),'utf8')),css=fs.readFileSync(path.join(root,'core/csh_experience.css'),'utf8');
const tmp=fs.mkdtempSync(path.join(auditTempRoot(),'csh-panel-window-')),cases=[];
try{
 for(const [name,width,height,scale]of [['desktop',1365,768,1],['phone',915,412,.6],['short',640,286,1.5]]){
  const fixture=path.join(tmp,name+'.html');fs.writeFileSync(fixture,`<!doctype html><meta charset="utf-8"><style>body{margin:0;transform:scale(${scale});transform-origin:top left}div{position:absolute}*{box-sizing:border-box;animation:none!important;transition:none!important}${css}</style><button id="under" style="position:fixed;right:8px;bottom:8px;width:60px;height:44px" onclick="window.underClicks++">宿主</button><script>
  document.documentElement.appendChild(document.getElementById("under"));window.underClicks=0;const lib={config:{'extension_池子魔将_csh_debug_menu':true},skill:{},character:{},translate:{},arenaReady:[]};const game={players:[],me:null,saveConfig(k,v){lib.config[k]=v},print(){},over(){}};const ui={},ai={},_status={},get={translation:v=>typeof v==='string'?v:v?.name||'',is:{online:()=>false},mode:()=> 'identity'};
  lib.cshShell={open(){return true}};lib.cshWorld={stats(){return{chars:149,retired:0,fundSum:100000}},tick(){}};
  ${modules}\ninstallUIKit();lib.cshShell.META=Object.fromEntries(CSH.registry.all().map(k=>[k,CSH.registry.get(k)]));${source}
  window.auditErrors=[];window.addEventListener('error',e=>auditErrors.push(e.message));
  const activePointers=new Set(),add=document.addEventListener.bind(document),remove=document.removeEventListener.bind(document);document.addEventListener=function(k,f,o){if(k.startsWith('pointer')&&window.event?.type==='pointerdown'&&window.event.target.closest('.csh-dbg-head-main'))activePointers.add(f);return add(k,f,o)};document.removeEventListener=function(k,f,o){activePointers.delete(f);return remove(k,f,o)};
  lib.cshDebug.openLobby();</script>`);
  await withChromium({width,height},async send=>{
   const checks=[],check=(name,passed,detail)=>checks.push({name,passed:!!passed,...(detail===undefined?{}:{detail})});
   const value=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+' '+r.exceptionDetails.exception?.description);return r.result.value};
   const click=async selector=>{const p=await value(`(()=>{let n=document.querySelector(${JSON.stringify(selector)});n.scrollIntoView({block:'nearest'});let r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});};
   const mouse=async(type,x,y)=>send('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:type==='mouseMoved'?0:1});
   const head=()=>value(`(()=>{const r=document.querySelector('.csh-dbg-head-main').getBoundingClientRect();return{x:r.x+Math.min(r.width/2,90),y:r.y+r.height/2}})()`);
   const box=()=>value(`(()=>{let r=document.querySelector('#csh-dbg-panel').getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}})()`);
   const bounded=async()=>{const r=await box();return r.x>=0&&r.y>=0&&r.right<=width+1&&r.bottom<=height+1};
   await send('Page.navigate',{url:pathToFileURL(fixture).href});for(let n=0;n<100;n++){if(await value('!!document.getElementById("csh-window-mode")'))break;await new Promise(r=>setTimeout(r,30));}
   check('default stays full-screen with window settings hidden',await value('document.querySelector("#csh-dbg-panel").getAttribute("aria-modal")==="true"&&getComputedStyle(document.querySelector(".csh-window-options")).display==="none"'));
   await click('#csh-dbg-settings-toggle');check('window entry appears only in existing settings',await value('getComputedStyle(document.querySelector(".csh-window-options")).display==="flex"'));
   await click('#csh-window-mode');check('pointer enables nonmodal floating panel within viewport',await bounded()&&await value('document.querySelector("#csh-dbg-panel").getAttribute("aria-modal")==="false"&&!document.querySelector("#csh-dbg-panel").classList.contains("csh-head-settings-open")'));
   check('all eleven content entries and 44px controls retained',await value('document.querySelectorAll("button.csh-dbg-gamebtn:not(.locked)").length===11&&["#csh-window-fold","#csh-dbg-close","#csh-dbg-settings-toggle"].every(s=>{const r=document.querySelector(s).getBoundingClientRect();return r.width>=44&&r.height>=44})'));
   const before=await box(),p=await head();await mouse('mousePressed',p.x,p.y);await mouse('mouseMoved',p.x+80,p.y+45);await mouse('mouseReleased',p.x+80,p.y+45);
   const moved=await box();check('title drag uses viewport pixels and clamps at edges',await bounded()&&(width<1000||Math.abs(moved.x-before.x-80)<2),{before,moved});
   await click('#csh-window-fold');check('collapse retains reachable expand and close without content focus',await value('getComputedStyle(document.querySelector("#csh-dbg-main")).display==="none"&&document.querySelector("#csh-window-fold").textContent==="展开"')&&(await box()).h<80);
   const q=await head(),a=await box();await mouse('mousePressed',q.x,q.y);await mouse('mouseMoved',q.x+100,q.y+50);await mouse('mouseReleased',q.x+100,q.y+50);const b=await box();check('collapsed title also drags with host scale isolated',await bounded()&&b.x>a.x+20,{a,b});
   // Underlying host input is possible while the window is collapsed.
   await value('document.getElementById("under").style.transform="scale("+(1/'+scale+')+")";document.getElementById("under").style.transformOrigin="bottom right"');
   const target=await value('(()=>{let r=document.getElementById("under").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
   await mouse('mousePressed',target.x,target.y);await mouse('mouseReleased',target.x,target.y);
   check('transparent backdrop lets real host clicks through',await value('underClicks===1'),await value('({clicks:underClicks,target:'+JSON.stringify(target)+',hit:document.elementFromPoint('+target.x+','+target.y+')?.outerHTML.slice(0,350),body:document.body.getBoundingClientRect().toJSON()})'));
   await value('document.getElementById("under").focus();document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}))');check('host Escape does not close an unfocused floating panel',await value('!!document.getElementById("csh-dbg-overlay")'));
   await click('#csh-window-fold');check('expand restores content and bounded geometry',await bounded()&&await value('getComputedStyle(document.querySelector("#csh-dbg-main")).display!=="none"'));
   await click('#csh-dbg-settings-toggle');await click('#csh-window-snap');check('edge snapping is opt-in',await value('document.querySelector("#csh-window-snap").getAttribute("aria-pressed")==="true"'));
   await click('#csh-window-reset');check('position reset stays on-screen',await bounded());await click('#csh-dbg-settings-toggle');
   check('mode switch returns keyboard focus to a visible control',await value('document.activeElement===document.getElementById("csh-dbg-settings-toggle")'));
   await click('#csh-window-fold');const edgeStart=await head(),edgeBox=await box();
   await mouse('mousePressed',edgeStart.x,edgeStart.y);await mouse('mouseMoved',edgeStart.x+21-edgeBox.x,edgeStart.y+2);await mouse('mouseReleased',edgeStart.x+21-edgeBox.x,edgeStart.y+2);
   check('enabled snapping aligns a nearby edge after a real title drag',Math.abs((await box()).x-8)<1);
   const cancelStart=await head(),cancelBox=await box();await mouse('mousePressed',cancelStart.x,cancelStart.y);await mouse('mouseMoved',cancelStart.x+50,cancelStart.y+20);
   await value('document.querySelector(".csh-dbg-head-main").releasePointerCapture(1)');await mouse('mouseMoved',cancelStart.x+60,cancelStart.y+25);await mouse('mouseReleased',cancelStart.x+60,cancelStart.y+25);
   check('lost pointer capture cancels the gesture and removes drag listeners',await value('activePointers.size===0')&&Math.abs((await box()).x-cancelBox.x)<1,{before:cancelBox,after:await box(),names:await value('[...activePointers].map(f=>f.name)')});
   await click('#csh-window-fold');
   await click('#csh-dbg-close');check('close cleans drag listeners and restores opener',await value('!document.getElementById("csh-dbg-overlay")&&activePointers.size===0'));
   await value('lib.cshDebug.openLobby()');check('reopen remembers window preference, not collapse',await value('document.querySelector("#csh-dbg-overlay").classList.contains("csh-windowed")&&!document.querySelector("#csh-dbg-overlay").classList.contains("csh-window-collapsed")'));
   const start=await head();await mouse('mousePressed',start.x,start.y);await mouse('mouseMoved',start.x+30,start.y+20);await value('document.getElementById("csh-dbg-close").click()');await mouse('mouseReleased',start.x+30,start.y+20);check('closing during drag removes document listeners',await value('activePointers.size===0&&!document.getElementById("csh-dbg-overlay")'),await value('({listeners:activePointers.size,names:[...activePointers].map(f=>f.name),overlay:!!document.getElementById("csh-dbg-overlay"),active:document.activeElement?.outerHTML.slice(0,300)})'));
   await value('lib.cshDebug.openLobby()');await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await new Promise(r=>setTimeout(r,30));check('portrait uses existing fullscreen orientation flow, never a portrait floating layout',await value('!document.querySelector("#csh-dbg-overlay").classList.contains("csh-windowed")&&document.querySelector("#csh-dbg-panel").getAttribute("aria-modal")==="true"'));
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await new Promise(r=>setTimeout(r,30));check('return to landscape clamps window to current viewport',await bounded());
   await click('#csh-dbg-settings-toggle');await click('#csh-window-mode');check('full-screen remains reversible and modal',await value('document.querySelector("#csh-dbg-panel").getAttribute("aria-modal")==="true"')&&(await box()).w===width);
   await value('document.querySelector("#csh-dbg-close").click();lib.cshDebugMenu.open()');await click('#csh-dbg-settings-toggle');await click('#csh-window-mode');check('developer panel uses the same display controls without losing tabs',await value('document.querySelector("#csh-dbg-overlay").classList.contains("csh-windowed")&&!![...document.querySelectorAll(".csh-dbg-tab")].find(n=>n.textContent==="技能")'));
   check('no runtime errors',await value('auditErrors.length===0'),await value('auditErrors'));
   if(name==='desktop'||name==='short'){await value('document.getElementById("csh-dbg-close").click();lib.cshDebug.openLobby();document.getElementById("csh-dbg-settings-toggle").click();document.getElementById("csh-window-mode").click()');const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'));}
   cases.push({name,width,height,scale,checks});
  });
 }
}finally{removeAuditScratch(tmp);}
const checks=cases.flatMap(c=>c.checks.map(x=>({...x,case:c.name}))),failed=checks.filter(x=>!x.passed),result={scope:'Actual installed world/debug UI modules in Chromium, deterministic host fixtures and real pointer input. No complete Noname engine or player profile.',passed:checks.length-failed.length,failed:failed.length,cases};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,failed:result.failed,failures:failed}));process.exitCode=failed.length?1:0;
