// Actual installed Noname host; disposable profile/IDB and read-only server.
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {fileURLToPath,pathToFileURL} from 'node:url';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];},root=path.resolve(arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'))),out=path.resolve(arg('--out',''));
if(!arg('--out')||out===root||out.startsWith(root+path.sep))throw Error('External --out required');fs.mkdirSync(out,{recursive:true});
const tests=String.raw`
async function bagContent(){
 const metrics=[];await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshWallet.flushSave();window.__bagWallet=lib.cshWallet.wallet.pc();})()');
 const f='document.getElementById("csh-shell-frame")',d=f+'.contentDocument';
 async function open(){await page.evaluate('lib.cshShell.close("bag-content");lib.cshShell.open("save");');await until(f+'?.contentWindow?.STATE?.ready','bag ready');await delay(250);}
 async function metric(mode,w,h){const x=await page.evaluate('('+function(){
  const f=document.getElementById('csh-shell-frame'),d=f.contentDocument,v=f.contentWindow,b=d.getElementById('board'),br=b.getBoundingClientRect(),fr=f.getBoundingClientRect();
  const rect=n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
  const button=id=>{const n=d.getElementById(id),r=rect(n),hit=d.elementFromPoint(r.x+r.w/2,r.y+r.h/2);return {...r,id,text:n.textContent,font:parseFloat(v.getComputedStyle(n).fontSize),visible:r.y>=br.y&&r.bottom<=br.bottom,hit:hit===n||n.contains(hit),hostHit:document.elementFromPoint(fr.x+r.x+r.w/2,fr.y+r.y+r.h/2)===f};};
  return{width:v.innerWidth,height:v.innerHeight,board:rect(b),header:rect(d.querySelector('.topbar')),pack:button('b-pack'),file:button('b-file'),check:button('b-check'),retry:button('pending-retry'),recover:button('b-recover'),textarea:rect(d.getElementById('code')),actions:rect(d.querySelector('.work-actions')),data:rect(d.querySelector('.work-data')),overflow:b.scrollWidth>b.clientWidth+2||d.documentElement.scrollWidth>v.innerWidth+2,scope:d.getElementById('scope').textContent,primaryRows:[...d.querySelectorAll('.inv-core .iv')].map(n=>({key:n.dataset.domain,...rect(n)})),smallestFont:Math.min(...[...d.querySelectorAll('.card .note,.card .iv-k,.card .iv-x')].map(n=>parseFloat(v.getComputedStyle(n).fontSize))),pendingText:d.getElementById('pending-note').textContent,recovery:d.getElementById('recovery').hidden};
 }.toString()+')()');metrics.push({mode,w,h,...x});stage('bag-'+mode+'-'+w+'x'+h,{metric:x,screenshot:await snap('bag-'+mode+'-'+w+'x'+h)});
 check('bag no overflow and readable body '+mode+' '+w,!x.overflow&&x.smallestFont>=12,x);
 if(mode==='normal'){
  check('bag primary pack is initially visible with native hit target '+w,x.pack.visible&&x.pack.hit&&x.pack.hostHit&&x.pack.h>=44,x);
  check('primary tasks precede duplicate instructions '+w,x.pack.y-x.board.y<=90&&x.file.visible&&x.file.hit&&x.file.hostHit&&x.file.h>=44,x);
 }
 return x;}
 for(const[w,h]of[[1365,768],[915,412],[844,390],[640,286],[390,844]]){await page.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});await open();await metric('normal',w,h);}
 check('unavailable copy/file output does not occupy the initial task area',await page.evaluate(d+'.getElementById("output-actions")?.hidden===true'));
 await page.send('Emulation.setDeviceMetricsOverride',{width:640,height:286,deviceScaleFactor:1,mobile:false});await open();
 await clickElement(d+'.getElementById("b-pack")',true);await until(d+'.getElementById("code").value.length>0','real portable code');
 check('native pack retains complete portable code and enables copy/file',await page.evaluate(d+'.getElementById("code").value.startsWith("CSH")&&!'+d+'.getElementById("b-copy").disabled&&!'+d+'.getElementById("b-download").disabled&&lib.cshWallet.wallet.pc()===__bagWallet'));
 check('generated code reveals available copy/file actions',await page.evaluate('!!'+d+'.getElementById("output-actions")&&!'+d+'.getElementById("output-actions").hidden'));
 stage('bag-packed-640x286',{screenshot:await snap('bag-packed-640x286')});
 const code=await page.evaluate(d+'.getElementById("code").value');
 await page.evaluate('(()=>{const w='+f+'.contentWindow,n=w.document.getElementById("code");n.value="";n.dispatchEvent(new w.Event("input",{bubbles:true}));})()');
 check('clearing code folds output actions and disables empty transfers',await page.evaluate('!!'+d+'.getElementById("output-actions")&&'+d+'.getElementById("output-actions").hidden&&'+d+'.getElementById("b-copy").disabled&&'+d+'.getElementById("b-download").disabled'));
 await page.evaluate('(()=>{const w='+f+'.contentWindow,n=w.document.getElementById("code");n.value='+JSON.stringify(code)+';n.dispatchEvent(new w.Event("input",{bubbles:true}));})()');
 await clickElement(d+'.getElementById("b-check")',true);await until(f+'.contentWindow.STATE.pending!==null','real preview');
 check('native preview arms the unchanged import confirmation',await page.evaluate(d+'.getElementById("b-unpack").textContent==="确认导入"&&'+f+'.contentWindow.STATE.pending==='+JSON.stringify(code)+'&&lib.cshWallet.wallet.pc()===__bagWallet'));
 await clickElement(d+'.getElementById("b-unpack")',true);await until('!!document.querySelector("#csh-ui-confirm .csh-ui-cf-btn:not(.ok)")','native import confirm');await clickElement('document.querySelector("#csh-ui-confirm .csh-ui-cf-btn:not(.ok)")');
 check('cancel import preserves wallet and has no mutation credential',await page.evaluate('lib.cshWallet.wallet.pc()===__bagWallet&&!lib.cshMigrate.recoveryState().pending'));
 await page.evaluate('lib.cshShell.close("bag-content");localStorage.setItem(lib.cshWallet.pending.KEY,"{bag-content-corrupt");');
 for(const[w,h]of[[915,412],[844,390],[640,286],[390,844]]){await page.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});await open();const x=await metric('pending-error',w,h);check('pending failure remains first-screen actionable '+w,x.pendingText.includes('遇到问题')&&x.retry.visible&&x.retry.hit&&x.retry.hostHit&&x.retry.h>=44,x);}
 await clickElement(d+'.querySelector("#pending-details > summary")',true);check('diagnostic remains available on demand',await page.evaluate(d+'.getElementById("pending-details").open&&'+d+'.getElementById("pending-error").textContent.length>0'));
 await page.evaluate('lib.cshShell.close("bag-content");localStorage.removeItem(lib.cshWallet.pending.KEY);lib.cshWallet.pending.retry();');
 await page.send('Emulation.setDeviceMetricsOverride',{width:640,height:286,deviceScaleFactor:1,mobile:false});await open();await page.evaluate('(()=>{const w='+f+'.contentWindow;w.STATE.recovery=true;w.syncControls();})()');
 const recovery=await metric('recovery',640,286);check('recovery action is first-screen and main mutation controls locked',!recovery.recovery&&recovery.recover.visible&&recovery.recover.hit&&recovery.recover.hostHit&&await page.evaluate(d+'.getElementById("b-pack").disabled&&'+d+'.getElementById("b-unpack").disabled'),recovery);
 await page.evaluate('(()=>{const w='+f+'.contentWindow;w.STATE.recovery=false;w.syncControls();})()');
 await page.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await open();
 await page.evaluate('(()=>{const d='+d+';d.getElementById("scope").appendChild(d.createTextNode("旧存档保留全部进度，所有重要操作仍需确认。".repeat(8)+"LegacyUnbrokenStatus".repeat(4)));})()');await metric('long-text',390,844);
 await clickElement(d+'.querySelector(".inv-extra > summary")',true);check('native extra-domain disclosure retains all inventory rows',await page.evaluate(d+'.querySelector(".inv-extra").open&&'+d+'.querySelectorAll(".iv[data-domain]").length==='+f+'.contentWindow.STATE.inv.length'));
 const e=await page.evaluate('({errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})');check('bag host has no runtime errors/rejections',!e.errors.length&&!e.rejections.length,e);fs.writeFileSync(path.join(out,'bag-content-metrics.json'),JSON.stringify(metrics,null,2));
}
`;
let source=fs.readFileSync(root+'/tools/probe_host_smoke.mjs','utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root = '+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));
const marker="if(process.argv.includes('--world-layout-410'))";if(!source.includes(marker))throw Error('Host anchor changed');source=source.replace(marker,"if(process.argv.includes('--bag-content'))await bagContent();\n    else "+marker);
if(arg('--save-source')){const anchor="    const target = resolveReadOnly(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));";if(!source.includes(anchor))throw Error('Server anchor changed');source=source.replace(anchor,'    if(decodeURIComponent(url.pathname)==="/extension/池子魔将/games/save.html"){item.status=200;res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-cache"});return res.end(fs.readFileSync('+JSON.stringify(path.resolve(arg('--save-source')))+'));}\n'+anchor);}
const file=path.join(out,'isolated-bag-content-runner.mjs');fs.writeFileSync(file,tests+'\n'+source);const child=spawn(process.execPath,[file,'--bag-content','--out',out],{stdio:'inherit',windowsHide:true});await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{process.exitCode=code||0;resolve();});});
