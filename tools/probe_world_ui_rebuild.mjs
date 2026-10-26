// Real career document, isolated host transport and fresh Chromium profiles.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './lib/skill_audit.mjs';
import {withChromium} from './lib/chromium_audit.mjs';
const outIndex=process.argv.indexOf('--out');
const out=outIndex<0?path.join(root,'docs/audit/ui/world-ui-rebuild'):process.argv[outIndex+1];
fs.mkdirSync(out,{recursive:true});
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'csh-world-ui-'));
let source=fs.readFileSync(path.join(root,'games/career.html'),'utf8').replace(/src="\.\.\/([^"]+)"/g,(_,f)=>'src="'+pathToFileURL(path.join(root,f)).href+'"');
const fixture=`<script>
window.auditWorld={hold:false,queue:[],fail:false,rev:0,closed:0};
CSHPage.transport=()=>({active:true,close(){auditWorld.closed++;},call(cmd,data,cb){
 const h=auditWorld;
 if(cmd==='shell-wallet')return cb(true,{pc:500,pcPeak:700,rank:{rank:2,merit:20},world:{}});
 if(cmd==='shell-world'){
   if(h.hold)return h.queue.push(cb);
   if(h.fail)return cb(false,null);
   return cb(true,{ai:Array.from({length:48},(_,i)=>({name:'牌友'+i,fund:1000+i*100,skill:.5+i/100,hands:20,wins:12,personaName:i%2?'读牌师':'进攻者',personaDesc:'观察公开出牌，等待合适的机会。',biggestPot:i*100})),news:[{when:'刚刚',text:'牌友'+h.rev+' 赢回一局'}],story:{matches:99},stats:{chars:48,playerOpponents:3,playerHands:10}});
 }
 if(cmd==='shell-stats')return cb(true,{});
 cb(false,null);
}});
</script>`;
source=source.replace(/<script>\r?\n/,fixture+'<script>\n');
const file=path.join(tmp,'career.html');fs.writeFileSync(file,source);
const all=[];
for(const [name,width,height] of [['desktop',1200,820],['portrait',390,844],['short',915,412],['tiny',568,320]]){
 const checks=[];const check=(name,passed,detail)=>checks.push({name,passed:!!passed,detail});
 await withChromium({width,height},async send=>{
  const value=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value;
  const click=async sel=>{
   const box=await value(`(()=>{let n=document.querySelector(${JSON.stringify(sel)});n.scrollIntoView({block:'nearest'});let r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
   await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...box});
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...box});
  };
  const key=async key=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,windowsVirtualKeyCode:key==='Escape'?27:13});await send('Input.dispatchKeyEvent',{type:'keyUp',key});};
  const boot=async()=>{await send('Page.navigate',{url:pathToFileURL(file).href});for(let n=0;n<100;n++){if(await value('document.querySelector("#bd-status")?.textContent.includes("已更新")'))return;await new Promise(r=>setTimeout(r,40));}throw Error('career boot timeout');};
  await boot();
  await click('[data-p="board"]');
  check('pointer opens real world page',await value('document.querySelector("#p-board").classList.contains("on")'));
  check('all people and player preserved',await value('document.querySelectorAll("#bd-fund .row").length===49'));
  check('refresh does not force player row into view',await value('document.querySelector("#body").scrollTop===0'));
  check('world search and refresh stay inside viewport',await value('[...document.querySelectorAll(".world-tools input,.world-tools button")].every(n=>{let r=n.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth+1&&r.height>=43})'));
  await click('#bd-search');await send('Input.insertText',{text:'牌友17'});
  check('search narrows actual roster',await value('document.querySelectorAll("#bd-fund .row").length===1&&document.querySelector("#bd-fund .row").textContent.includes("牌友17")'));
  check('search retains original position',await value('document.querySelector("#bd-fund .row .pvp").textContent==="31"'));
  await click('#bd-fund .row');
  check('pointer opens readable person profile',await value('document.querySelector("#modal").classList.contains("on")&&document.querySelector("#md-info").textContent.includes("读牌师")'));
  check('profile bounded in short screen',await value('(()=>{let r=document.querySelector("#modal .mbox").getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1})()'));
  await key('Escape');
  check('Escape closes profile and returns focus',await value('!document.querySelector("#modal").classList.contains("on")&&document.activeElement.matches("#bd-fund .row")'));
  check('profile Escape keeps parent page open',await value('auditWorld.closed===0'));
  await key('Enter');check('keyboard reopens person profile',await value('document.querySelector("#modal").classList.contains("on")'));
  await click('#md-close');
  await click('#bd-me');check('find me clears search and focuses player',await value('document.querySelector("#bd-search").value===""&&document.activeElement.classList.contains("me")'));
  await click('[data-bd="bd-skill"]');check('pointer switches ranking',await value('document.querySelector("#v-bd-skill").classList.contains("on")'));
  await value('auditWorld.fail=true');await click('#bd-refresh');
  check('failed refresh keeps data and explains retry',await value('document.querySelectorAll("#bd-skill .row").length===48&&document.querySelector("#bd-status").textContent.includes("刷新失败")'));
  await value('auditWorld.fail=false;auditWorld.rev=9');await click('#bd-refresh');
  check('retry refreshes narrative and preserves selected ranking',await value('document.querySelector("#bd-news").textContent.includes("牌友9")&&document.querySelector("#v-bd-skill").classList.contains("on")'));
  await value('auditWorld.hold=true');await click('#bd-refresh');await click('#bd-refresh');
  await value('auditWorld.queue.at(-1)(true,{ai:[],news:[{text:"新快照"}],story:{},stats:{}});auditWorld.queue[0](true,{ai:[],news:[{text:"旧快照"}],story:{},stats:{}});auditWorld.hold=false');
  check('late older refresh cannot replace current world',await value('document.querySelector("#bd-news").textContent.includes("新快照")&&!document.querySelector("#bd-news").textContent.includes("旧快照")'));
  await click('[data-p="overview"]');await click('[data-p="board"]');
  check('navigation returns to world with updated complete roster',await value('document.querySelectorAll("#bd-fund .row").length===49&&document.querySelector("#body").scrollTop===0'));
  check('no horizontal document overflow',await value('document.documentElement.scrollWidth<=innerWidth'));
  const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'));
  await boot();await click('[data-p="board"]');check('reopen leaves one clean profile and full roster',await value('document.querySelectorAll("#modal").length===1&&!document.querySelector("#modal").classList.contains("on")&&document.querySelectorAll("#bd-fund .row").length===49'));
  await key('Escape');check('page Escape requests shell return',await value('auditWorld.closed===1'));
 });all.push({name,width,height,checks});
}
const checks=all.flatMap(c=>c.checks.map(k=>({...k,case:c.name}))),failures=checks.filter(k=>!k.passed);
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({scope:'actual career document in isolated Chromium, host data simulated',cases:all},null,2));
console.log(JSON.stringify({passed:checks.length-failures.length,failed:failures.length,failures,output:out},null,2));process.exitCode=failures.length?1:0;
