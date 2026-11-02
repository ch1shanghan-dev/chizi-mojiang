// Full installed host; disposable IDB/profile and real invitation/fee controls.
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {pathToFileURL,fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),i=process.argv.indexOf('--out');if(i<0)throw Error('External --out required');const out=path.resolve(process.argv[i+1]);if(out.startsWith(root+path.sep))throw Error('Keep test artifacts outside installation');fs.mkdirSync(out,{recursive:true});
const tests=String.raw`
async function worldInvitationHost(){
 await page.send('Emulation.setDeviceMetricsOverride',{width:1365,height:768,deviceScaleFactor:1,mobile:false});
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshDebug.openLobby()})()');
 await until('document.querySelectorAll(".csh-world-digest article").length===3','three live invitation cards');
 const before=await page.evaluate('({pc:lib.cshWallet.wallet.pc(),hands:lib.cshWorld.stats().playerHands,world:lib.cshWorld.raw(),row:lib.cshWorld.storylines(1)[0]})');
 const id=before.row.id,row='[...document.querySelectorAll(".csh-world-digest article")].find(n=>n.dataset.person==='+JSON.stringify(id)+')';
 await clickElement(row+'.querySelector("button")');await until('!!document.querySelector(".csh-fee-no")','native invitation entry fee');
 const response=await page.evaluate('lib.cshWorld.storylines(1)[0]');
 check('live click receives a persona response and keeps invited person visible first',response.id===id&&response.invited&&response.response.length>0);
 check('inviting itself never charges or fabricates personal meetings',await page.evaluate('lib.cshWallet.wallet.pc()')===before.pc&&await page.evaluate('lib.cshWorld.stats().playerHands')===before.hands);
 await clickElement('document.querySelector(".csh-fee-no")');await until('!document.getElementById("csh-shell-fee")','fee cancelled');
 check('cancelled entry retains response and offers a real invitation cancel button',await page.evaluate(row+'.querySelectorAll("button").length===2&&'+row+'.querySelector("p").textContent.includes('+JSON.stringify(response.response)+')'));
 for(const [width,height]of [[1365,768],[915,412],[640,286]]){
  await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(180);
  await page.evaluate(row+'.scrollIntoView({block:"center"})');
  const layout=await page.evaluate('(()=>{let article='+row+',r=article.getBoundingClientRect();return {width:r.width,right:r.right,viewport:innerWidth,actions:[...article.querySelectorAll("button")].map(n=>{let b=n.getBoundingClientRect();return {w:b.width,h:b.height,left:b.left,right:b.right,top:b.top,bottom:b.bottom}}),font:parseFloat(getComputedStyle(article.querySelector("p")).fontSize),overflow:document.getElementById("csh-dbg-body").scrollWidth>document.getElementById("csh-dbg-body").clientWidth+1}})()');
  check('pending invitation actions readable on landscape '+width,layout.font>=12&&!layout.overflow&&layout.actions.length===2&&layout.actions.every(r=>r.h>=44&&r.w>=44&&r.left>=0&&r.right<=width+1),layout);
  if(width!==915)stage('pending-invitation-'+width,{screenshot:await snap('pending-invitation-'+width)});
 }
 await clickElement(row+'.querySelectorAll("button")[1]');
 check('real cancel button clears pending invitation and restores invite action',await page.evaluate('lib.cshWorld.storylines(6).every(r=>!r.invited)&&'+row+'.querySelectorAll("button").length===1&&'+row+'.querySelector("button").textContent==="邀下一桌"'));
 check('cancel rerender restores focus to the same person action',await page.evaluate('document.activeElement==='+row+'.querySelector("button")'));
 await clickElement(row+'.querySelector("button")');await until('!!document.querySelector(".csh-fee-no")','second invitation');await clickElement('document.querySelector(".csh-fee-no")');
 const second=await page.evaluate('lib.cshWorld.storylines(1)[0].response');
 await clickElement(row+'.querySelector("button")');await until('!!document.querySelector(".csh-fee-no")','repeat invitation');await clickElement('document.querySelector(".csh-fee-no")');
 check('reopening entry confirmation preserves the original response and no double charge',second===await page.evaluate('lib.cshWorld.storylines(1)[0].response')&&await page.evaluate('lib.cshWallet.wallet.pc()')===before.pc);
 await clickElement('document.getElementById("csh-dbg-close")');await page.evaluate('lib.cshDebug.openLobby()');
 check('world reopen in the same session retains cancelable invitation',await page.evaluate(row+'.querySelectorAll("button").length===2&&lib.cshWorld.storylines(1)[0].id==='+JSON.stringify(id)));
 await page.send('Page.addScriptToEvaluateOnNewDocument',{source:'window.__invitationSeatAcks=[];addEventListener("message",e=>{if(e.data&&e.data.__csh==="shell-seat-ack")__invitationSeatAcks.push(e.data)})'});
 await clickElement(row+'.querySelector("button")');await until('!!document.querySelector(".csh-fee-go")','actual payable entry');
 await clickElement('[...document.querySelectorAll(".csh-fee-chip")].find(n=>n.textContent.replace(/,/g,"")==="200")');await clickElement('document.querySelector(".csh-fee-go")');
 const f='document.getElementById("csh-shell-frame")';await until(f+'?.contentWindow?.__invitationSeatAcks?.some(r=>r.ok&&r.data?.seats?.length)','actual Texas world seat prefetch');
 const seats=await page.evaluate(f+'.contentWindow.__invitationSeatAcks.find(r=>r.ok&&r.data?.seats?.length).data.seats');
 check('real paid normal table reserves invited person in its actual first AI seat',seats[0].id===id,seats.map(r=>({id:r.id,name:r.name})));
 check('real seat reservation consumes pending invitation without inventing a played hand',await page.evaluate('lib.cshWorld.storylines(6).every(r=>!r.invited)&&lib.cshWorld.stats().playerHands')===before.hands);
 check('entry uses the existing single 200 CBY charge',await page.evaluate('lib.cshWallet.wallet.pc()')===before.pc-200);
 await clickElement('document.getElementById("csh-shell-close")');await until('!document.getElementById("csh-shell-overlay")','unstarted table returned');
 check('unstarted real table returns bring-in once through original settlement',await page.evaluate('lib.cshWallet.wallet.pc()')===before.pc&&await page.evaluate('lib.cshWorld.stats().playerHands')===before.hands);
 check('returned world shows an ordinary invite action after its seat was consumed',await page.evaluate('lib.cshWorld.storylines(6).every(r=>!r.invited)&&[...document.querySelectorAll(".csh-world-invite-actions button")].every(n=>n.textContent==="邀下一桌")'));
 const e=await page.evaluate('({errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})');check('invitation flow has no host runtime errors',!e.errors.length&&!e.rejections.length,e);
}
`;
let s=fs.readFileSync(root+'/tools/probe_host_smoke.mjs','utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root='+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));s=s.replace("if(process.argv.includes('--world-layout-410'))","if(process.argv.includes('--world-invitation-host'))await worldInvitationHost();else if(process.argv.includes('--world-layout-410'))");const runner=path.join(out,'runner.mjs');fs.writeFileSync(runner,tests+'\n'+s);const c=spawn(process.execPath,[runner,'--world-invitation-host','--out',out],{stdio:'inherit',windowsHide:true});try{await new Promise((resolve,reject)=>{c.once('error',reject);c.once('exit',code=>{process.exitCode=code||0;resolve()})})}finally{fs.rmSync(runner,{force:true})}
