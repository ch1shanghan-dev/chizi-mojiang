// Actual world data and world-view source, disposable Chromium and explicit fixture adoption.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {root} from './lib/skill_audit.mjs';import {withChromium} from './lib/chromium_audit.mjs';import {auditTempRoot,removeAuditScratch} from './lib/audit_scratch.mjs';
const i=process.argv.indexOf('--out');if(i<0)throw Error('External D: --out required');const out=path.resolve(process.argv[i+1]);fs.mkdirSync(out,{recursive:true});
const read=p=>fs.readFileSync(path.join(root,p),'utf8'),clean=s=>s.replace(/^import .*?;.*\r?\n/gm,'').replace(/^export default /gm,'var cshCharacter = ').replace(/^export /gm,'').replace(/<\/script/gi,'<\\/script');
const source=['character/index.js','core/csh_bossdata.js','core/csh_world.js','core/csh_world_view.js'].map(p=>clean(read(p))).join('\n');
const css=read('core/csh_experience.css'),tmp=fs.mkdtempSync(path.join(auditTempRoot(),'csh-world-relation-')),cases=[];
try{
 for(const [name,width,height]of [['desktop',1365,768],['phone',915,412],['short',640,286]]){
  const fixture=path.join(tmp,name+'.html');fs.writeFileSync(fixture,`<!doctype html><meta charset="utf-8"><style>:root{--csh-paper:#191712;--csh-bg:#eee4d1;--csh-gray:#bcad92;--csh-bg-rgb:238,228,209;--csh-accent:#ceaa52;--csh-fg:#242017}*{box-sizing:border-box}body{margin:0;background:#191712;color:#eee4d1;font-family:Microsoft YaHei,system-ui}#csh-dbg-panel{width:100%;height:100vh;overflow:hidden;display:flex;flex-direction:column}#csh-dbg-body{overflow:auto;flex:1;min-height:0}.csh-dbg-gamelist{display:grid}.csh-dbg-gamebtn{min-height:88px;color:inherit;background:#28241c;border:1px solid #66593e}.gb-name,.gb-desc{display:block}${css}</style><div id="csh-dbg-panel" data-view="world"><div id="csh-dbg-body"></div></div><script>
  document.documentElement.classList.add('csh-world-view');const lib={config:{},skill:{},translate:{}},game={},ui={},get={poptip:()=>''},ai={},_status={},cshVoices={};window.auditErrors=[];addEventListener('error',e=>auditErrors.push(e.message));
  ${source}
  const W=lib.cshWorld,raw=W.raw(),first=raw.ai[0];window.personId=first.id;first.name='长名牌友·天地玄黄宇宙洪荒日月盈昃';first.hands=9999;first.wins=9000;first.withPlayer={hands:0,wins:0,losses:0,draws:0};W.reloadSave(raw);
  // Only the card order is deterministic; details read the unmodified actual byId API.
  const realStories=W.storylines;W.storylines=n=>{let r=realStories(6),chosen=r.find(r=>r.id===personId);if(!chosen){const a=W.byId(personId);chosen={id:a.id,name:a.name,persona:W.PERSONAS[a.persona].name,text:'本页验证牌友',invited:false};}chosen={...chosen,name:"长名牌友·天地玄黄宇宙洪荒日月盈昃"};return[chosen,...r.filter(r=>r.id!==personId)].slice(0,n)};
  const list=document.createElement('div');list.className='csh-dbg-gamelist';for(const [key,title]of [['texas','德州扑克'],['career','生涯大厅'],['achv','池子成就']]){let b=document.createElement('button');b.className='csh-dbg-gamebtn gb-'+key+(key==='texas'?' gb-table':'');b.innerHTML='<span class="gb-name">'+title+'</span><span class="gb-desc">完整内容入口</span>';list.appendChild(b)};
  lib.cshShell={walletSnapshot:()=>({pc:2000,signedToday:false})};lib.cshUI={toast(){}};window.openedGames=[];CSHWorldView.mount({body:document.getElementById('csh-dbg-body'),list,lib,openGame:k=>openedGames.push(k)});
 </script>`);
  await withChromium({width,height},async send=>{
   const checks=[],check=(name,passed,detail)=>checks.push({name,passed:!!passed,...(detail===undefined?{}:{detail})});
   const value=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
   const click=async selector=>{const p=await value(`(()=>{let n=document.querySelector(${JSON.stringify(selector)});n.scrollIntoView({block:'nearest'});let r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});await new Promise(r=>setTimeout(r,35));};
   const key=async key=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:key==='Enter'?13:32,text:key==='Enter'?'\r':' ',unmodifiedText:key==='Enter'?'\r':' '});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:key==='Enter'?13:32});await new Promise(r=>setTimeout(r,35))};
   await send('Page.navigate',{url:pathToFileURL(fixture).href});for(let n=0;n<100;n++){if(await value('!!document.querySelector(".csh-world-relationship")'))break;await new Promise(r=>setTimeout(r,30));}
   const detail='.csh-world-digest article:first-child .csh-world-relationship',summary=detail+' summary';
   check('personal records hidden by default without extra row of action buttons',await value('!document.querySelector('+JSON.stringify(detail)+').open&&document.querySelector(".csh-world-digest article").querySelectorAll("button").length===1'));
   const snapshot=await value('JSON.stringify(W.raw())');await click(summary);
   check('zero personal history does not borrow autonomous AI hands',await value('document.querySelector('+JSON.stringify(detail+' .csh-world-record')+').textContent.includes("尚无与你同桌的记录")&&!document.querySelector('+JSON.stringify(detail+' .csh-world-record')+').textContent.includes("9,999")'));
   check('details are a pure read of world facts',snapshot===await value('JSON.stringify(W.raw())'));
   check('long display name is fully retained instead of clipped',await value('document.querySelector('+JSON.stringify(summary)+').textContent.includes("长名牌友·天地玄黄宇宙洪荒日月盈昃")'));
   check('name is a readable 44px summary and no horizontal overflow',await value('(()=>{let s=document.querySelector('+JSON.stringify(summary)+'),r=s.getBoundingClientRect(),b=document.getElementById("csh-dbg-body");return r.height>=44&&r.left>=0&&r.right<=innerWidth+1&&b.scrollWidth<=b.clientWidth+1&&[...document.querySelectorAll('+JSON.stringify(detail+' .csh-world-record p')+')].every(n=>parseFloat(getComputedStyle(n).fontSize)>=12)})()'));
   await key('Enter');check('native Enter closes detail and retains focus on the same name',await value('!document.querySelector('+JSON.stringify(detail)+').open&&document.activeElement===document.querySelector('+JSON.stringify(summary)+')&&getComputedStyle(document.querySelector('+JSON.stringify(detail+' .csh-world-record')+')).display==="none"'),await value('({open:document.querySelector('+JSON.stringify(detail)+').open,active:document.activeElement.outerHTML.slice(0,250),display:getComputedStyle(document.querySelector('+JSON.stringify(detail+' .csh-world-record')+')).display})'));
   // These are actual settlement APIs: AI gain is your loss, AI loss is your win.
   await value('W.settleWin(personId,1000);W.settleLose(personId,500);W.settleResult(personId,null)');await click(summary);
   check('real opposing settlements and draw use the player perspective',await value('document.querySelector('+JSON.stringify(detail+' .csh-world-record')+').textContent.includes("与你同桌 3 手；你 1 胜、1 负、1 和")'));
   const recorded=await value('JSON.stringify(W.raw())');await click(summary);await click(summary);
   check('reopening reads facts without changing meetings, money or history',recorded===await value('JSON.stringify(W.raw())'));
   await click(summary);await click('.csh-world-digest article:first-child .csh-world-invite-actions button');
   check('name details preserve the original invitation/entry action',await value('openedGames[0]==="texas"&&W.storylines(1)[0].invited'));
   await click('.csh-world-digest article:first-child .csh-world-invite-actions button:nth-child(2)');check('existing invitation cancel still works after details',await value('W.storylines(6).every(r=>!r.invited)'));
   await click(summary);check('all runtime operations remain error free',await value('auditErrors.length===0'),await value('auditErrors'));
   if(name==='desktop'||name==='short'){const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'))}
   cases.push({name,width,height,checks});
  });
 }
}finally{removeAuditScratch(tmp)}
const rows=cases.flatMap(c=>c.checks.map(r=>({...r,case:c.name}))),failures=rows.filter(r=>!r.passed),result={scope:'Actual world/character data, actual world-view source in Chromium with real pointer/keyboard; isolated snapshot adoption only, not full Noname host.',passed:rows.length-failures.length,failed:failures.length,cases};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,failed:result.failed,failures}));process.exitCode=failures.length?1:0;
