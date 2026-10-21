// Real native Chromium key input and DOM; source module, isolated host fixtures.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openProbe } from './lib/browser_probe.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const option=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const source=fs.readFileSync(option('--source',path.join(root,'core/csh_uikit.js')),'utf8').replace(/^import[^\n]*\n/gm,'').replace(/^export (const|function) /gm,'$1 ').replace(/^export default null;.*$/gm,'');
const page=await openProbe('<!doctype html><meta charset="utf-8"><title>Confirm focus probe</title><body><button id="opener">Open</button><input id="background"><iframe srcdoc="<button>Frame input</button>"></iframe></body>',option('--browser',undefined));
const rows=[];const check=(name,passed)=>rows.push({name,passed:!!passed});
const key=async(name,shift=false)=>{
  const code=name===' '?'Space':name,virtual=name==='Tab'?9:name==='Enter'?13:name==='Escape'?27:32;
  const params={key:name,code,windowsVirtualKeyCode:virtual,nativeVirtualKeyCode:virtual,modifiers:shift?8:0};
  await page.send('Input.dispatchKeyEvent',{type:'rawKeyDown',...params});await page.send('Input.dispatchKeyEvent',{type:'keyUp',...params});
};
try {
  await page.evaluate(`(()=>{window.listenerCounts={windowKey:new Set(),documentKey:new Set(),focus:new Set()};
    for(const [target,keyType] of [[window,'windowKey'],[document,'documentKey']]){const add=target.addEventListener.bind(target),remove=target.removeEventListener.bind(target);target.addEventListener=function(type,fn,...args){if(type==='keydown')listenerCounts[keyType].add(fn);if(target===document&&type==='focusin')listenerCounts.focus.add(fn);return add(type,fn,...args);};target.removeEventListener=function(type,fn,...args){if(type==='keydown')listenerCounts[keyType].delete(fn);if(target===document&&type==='focusin')listenerCounts.focus.delete(fn);return remove(type,fn,...args);};}
    window.lib={};window.game={};new Function('lib','game',${JSON.stringify(source)}+';window.confirmProbe=confirmBox;')(lib,game);
    window.calls=[];window.backgroundEsc=0;document.addEventListener('keydown',e=>{if(e.key==='Escape')backgroundEsc++;},true);
    window.start=(opts={})=>{document.getElementById('opener')?.focus();window.handle=confirmProbe(opts,v=>calls.push(v));};
    window.waitFocus=()=>new Promise(r=>setTimeout(r,60));window.current=()=>document.getElementById('csh-ui-confirm');
  })()`);
  await page.evaluate('start({title:"确认操作",message:"测试说明"});waitFocus()');
  check('native button semantics',await page.evaluate('current().querySelectorAll("button[type=button]").length===2'));
  check('dialog has accessible name and description',await page.evaluate('(()=>{const d=current().querySelector("[role=dialog]");return !!d&&d.getAttribute("aria-modal")==="true"&&document.getElementById(d.getAttribute("aria-labelledby")).textContent==="确认操作"&&document.getElementById(d.getAttribute("aria-describedby")).textContent==="测试说明";})()'));
  check('initial normal focus is confirm',await page.evaluate('document.activeElement.classList.contains("ok")'));
  check('host body and iframe are inert',await page.evaluate('document.body.inert'));
  await key('Tab');check('Tab cycles to cancel',await page.evaluate('document.activeElement.textContent==="取消"'));
  await key('Tab',true);check('Shift+Tab cycles back to confirm',await page.evaluate('document.activeElement.classList.contains("ok")'));
  await page.evaluate('document.getElementById("background").focus()');
  check('background input cannot take focus',await page.evaluate('current().contains(document.activeElement)'));
  if (!process.argv.includes('--baseline-only')) {
  await key(' ');check('Space confirms exactly once',await page.evaluate('JSON.stringify(calls)==="[true]"&&!current()'));
  check('close restores opener and original inert state',await page.evaluate('document.activeElement.id==="opener"&&!document.body.inert'));
  await page.evaluate('calls=[];start();waitFocus()');await key('Tab');await key('Enter');
  check('Enter on cancel cancels',await page.evaluate('JSON.stringify(calls)==="[false]"'));
  await page.evaluate('calls=[];start({danger:true});waitFocus()');
  check('danger action initially focuses cancel',await page.evaluate('document.activeElement.textContent==="取消"'));
  await key('Enter');check('danger default Enter does not confirm',await page.evaluate('JSON.stringify(calls)==="[false]"'));
  await page.evaluate('calls=[];start();waitFocus()');await key('Escape');
  check('Escape closes only confirmation',await page.evaluate('JSON.stringify(calls)==="[false]"&&backgroundEsc===0'));
  await key('Escape');check('next Escape reaches host after cleanup',await page.evaluate('backgroundEsc===1'));
  await page.evaluate('calls=[];start();confirmProbe("replacement",v=>calls.push(v));waitFocus()');
  check('replacement keeps background locked',await page.evaluate('document.body.inert&&JSON.stringify(calls)==="[false]"'));
  await key('Enter');check('replacement restores original opener',await page.evaluate('JSON.stringify(calls)==="[false,true]"&&document.activeElement.id==="opener"&&!document.body.inert'));
  await page.evaluate('calls=[];document.getElementById("opener").focus();confirmProbe("first",()=>confirmProbe("callback",v=>calls.push(v)));current().__cshClose();waitFocus()');
  check('callback-opened dialog keeps focus and inert state',await page.evaluate('current().contains(document.activeElement)&&document.body.inert'));
  await key('Escape');check('callback-opened dialog restores original opener',await page.evaluate('document.activeElement.id==="opener"&&!document.body.inert'));
  await page.evaluate('document.body.inert=true;confirmProbe("already inert");waitFocus()');await key('Escape');
  check('preexisting inert is preserved',await page.evaluate('document.body.inert'));await page.evaluate('document.body.inert=false');
  await page.evaluate('calls=[];start();waitFocus()');
  await page.evaluate(`(()=>{const top=document.createElement('div');top.id='higher';top.style.cssText='position:fixed;inset:0;z-index:2147483080;background:#222';const b=document.createElement('button');b.textContent='System layer';top.appendChild(b);document.documentElement.appendChild(top);b.focus();window.topEsc=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();top.remove();window.removeEventListener('keydown',topEsc,true);}};window.addEventListener('keydown',topEsc,true);})()`);
  check('higher system layer may own focus',await page.evaluate('document.activeElement.parentNode.id==="higher"'));
  await key('Escape');check('higher layer Escape leaves lower confirmation open',await page.evaluate('!document.getElementById("higher")&&!!current()&&calls.length===0'));
  await key('Escape');check('next Escape cancels lower dialog once',await page.evaluate('!current()&&JSON.stringify(calls)==="[false]"'));
  await page.evaluate('start();waitFocus()');
  await page.evaluate(`(()=>{const top=document.createElement('div');top.id='partial-higher';top.style.cssText='position:fixed;left:0;top:0;z-index:2147483080';const b=document.createElement('button');b.textContent='System';top.appendChild(b);document.documentElement.appendChild(top);b.focus();})()`);
  check('partial higher layer retains focus',await page.evaluate('document.activeElement.parentNode.id==="partial-higher"'));
  await page.evaluate('handle.close()');
  check('programmatic lower close does not steal higher focus',await page.evaluate('document.activeElement.parentNode.id==="partial-higher"'));await page.evaluate('document.getElementById("partial-higher").remove()');
  for(const [w,h,scale] of [[1200,820,1],[390,844,1],[915,412,0.6],[740,360,1.5]]) {
    await page.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});
    await page.evaluate(`document.body.style.transform='scale(${scale})';start({message:'长说明 '.repeat(100)});waitFocus()`);
    check('viewport '+w+'x'+h+' scale '+scale+' contains dialog and buttons',await page.evaluate('(()=>{const card=current().firstElementChild,r=card.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&card.scrollHeight>=card.clientHeight;})()'));
    await page.evaluate('current().firstElementChild.scrollTop=99999');
    check('viewport '+w+'x'+h+' actions receive pointer hit',await page.evaluate('(()=>{const button=current().querySelector(".ok"),r=button.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===button;})()'));
    await key('Escape');
  }
  await page.evaluate('document.body.style.transform="";start({title:"确认操作",message:"键盘焦点和关闭恢复验证"});waitFocus()');
  const tree=await page.send('Accessibility.getFullAXTree');
  check('Chromium accessibility tree exposes named dialog',tree.nodes.some(n=>n.role?.value==='dialog'&&n.name?.value==='确认操作'));
  const out=option('--out',null);if(out){fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});const shot=await page.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(out,Buffer.from(shot.data,'base64'));}
  await key('Escape');
  await page.evaluate('for(let n=0;n<20;n++){const a=confirmProbe("cycle A");const b=confirmProbe("cycle B");a.close();b.close();}');
  check('20 replacement cycles release background',await page.evaluate('!current()&&!document.body.inert'));
  check('20 cycles release window/document/focus handlers',await page.evaluate('listenerCounts.windowKey.size===0&&listenerCounts.documentKey.size===1&&listenerCounts.focus.size===0'));
  }
  const failed=rows.filter(x=>!x.passed);console.log(JSON.stringify({scope:'native Chromium keys, DOM, hit testing and accessibility tree; not Noname/Android',passed:rows.length-failed.length,failed:failed.length,failures:failed},null,2));process.exitCode=failed.length?1:0;
} finally {await page.close();}
