// Real Chromium pointer input, real page/transport/migration/wallet/UIKit and native LS.
// Disposable browser profile and localhost origin; never attaches to Noname/player saves.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {root,parse,walk} from './lib/skill_audit.mjs';
import {openProbe} from './lib/browser_probe.mjs';
const option=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const html=fs.readFileSync(option('--source',path.join(root,'games/save.html')),'utf8');
const clean=s=>s.replace(/^import .*?;\r?\n/gm,'').replace(/^export default .*?;\r?\n/gm,'').replace(/^export /gm,'');
const sources=Object.fromEntries(['wallet','migrate','uikit'].map(n=>[n,clean(fs.readFileSync(path.join(root,'core/csh_'+n+'.js'),'utf8'))]));
const shell=fs.readFileSync(path.join(root,'core/csh_shell.js'),'utf8'), commands=[],helpers=[];
walk(parse(shell),n=>{
  if(n.type==='IfStatement'&&n.test.type==='BinaryExpression'&&n.test.left?.name==='cmd'&&/^shell-mig-/.test(n.test.right?.value||''))commands.push(shell.slice(...n.range));
  if(n.type==='FunctionDeclaration'&&['ackToGame','captureMigReply','postToGame'].includes(n.id?.name))helpers.push(shell.slice(...n.range));
});
const fixture=`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#191512}iframe{width:100%;height:100%;border:0}</style><iframe id="csh-shell-frame"></iframe><script>
window.sources=${JSON.stringify(sources).replace(/<\/script/gi,'<\\/script')};
var lib={config:{},configprefix:'bag_isolated_',skill:{},translate:{}},game={addGlobalSkill(){},saveConfig(){throw Error('unconfirmed saveConfig');}},ui={};
var SHELL_GENERATION=1,CUR_REQ=null,calls=[],heldExport=null,holdExport=false,heldInspect=null,holdInspect=false,readFault=false,cleanupFault=false;
var storage={getItem(k){if(readFault&&k==='csh_player_interact')throw Error('injected read failure');return localStorage.getItem(k);},setItem(k,v){localStorage.setItem(k,v);},removeItem(k){if(cleanupFault&&k==='csh_migrate_recovery')throw Error('injected cleanup failure');localStorage.removeItem(k);},key(i){return localStorage.key(i);},get length(){return localStorage.length;}};
function runtime(){window.CSH={};for(var n of ['wallet','migrate'])new Function('lib','game','ui','get','ai','_status','localStorage',sources[n])(lib,game,ui,{},{},{},storage);new Function('lib','game',sources.uikit+';installUIKit();')(lib,game);}
runtime();lib.cshWallet.wallet.add(1234,'isolated fixture');lib.cshWallet.flushSave();localStorage.setItem('csh_player_interact','{"v":1,"total":9}');
var M=lib.cshMigrate,realExport=M.export,realImport=M.import;
M.export=function(){if(holdExport)return new Promise(resolve=>{heldExport=()=>realExport().then(resolve);});return realExport();};
M.import=function(code,opts){if(holdInspect&&opts&&opts.dryRun)return new Promise(resolve=>{heldInspect=()=>realImport(code,opts).then(resolve);});return realImport(code,opts);};
function migMod(){return M;}
${helpers.join('\n')}
window.addEventListener('message',function(e){var f=document.getElementById('csh-shell-frame');if(e.source!==f.contentWindow)return;var d=e.data||{},cmd=d.__csh;CUR_REQ=d.req;var req0=CUR_REQ,migReply=captureMigReply(e,req0);calls.push({cmd,req:req0,dryRun:!!d.dryRun});if(cmd==='shell-stats'){ackToGame(cmd,true,{pc:lib.cshWallet.wallet.pc()});return;} ${commands.join('\n')}
});
function reopen(){SHELL_GENERATION++;var old=document.getElementById('csh-shell-frame');old.src='about:blank';old.remove();var f=document.createElement('iframe');f.id='csh-shell-frame';document.body.appendChild(f);f.src='/page.html';}
reopen();
<\/script>`;
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');let content,mime='text/html';
  if(url.pathname==='/fixture.html')content=fixture;
  else if(url.pathname==='/page.html')content=html;
  else if(url.pathname.startsWith('/core/')){const target=path.join(root,url.pathname.slice(1));if(!target.startsWith(path.join(root,'core')+path.sep)){res.writeHead(403).end();return;}try{content=fs.readFileSync(target);mime='text/javascript';}catch{res.writeHead(404).end();return;}}
  else{res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':mime+';charset=utf-8'}).end(content);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const rows=[],page=await openProbe('<!doctype html><title>Bag isolated probe</title>',option('--browser-path',undefined));
const check=(name,passed,detail)=>rows.push({name,passed:!!passed,...(!passed?{detail}: {})});
const child=expr=>page.evaluate(`(()=>{var w=document.getElementById('csh-shell-frame').contentWindow;return (${expr});})()`);
const poll=async expr=>{for(let i=0;i<120;i++){if(await page.evaluate(expr))return;await new Promise(r=>setTimeout(r,30));}throw Error('Timeout: '+expr);};
const ready=()=>poll(`document.getElementById('csh-shell-frame').contentWindow.document.getElementById('b-pack')?.textContent&&document.getElementById('csh-shell-frame').contentWindow.STATE.inv.length>0&&!document.getElementById('csh-shell-frame').contentWindow.document.getElementById('b-pack').disabled`);
async function click(selector,outer=false){
  const rect=await page.evaluate(`(async()=>{var doc=${outer?'document':"document.getElementById('csh-shell-frame').contentWindow.document"};var e=doc.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing button');e.scrollIntoView({block:'center'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));var r=e.getBoundingClientRect(),f=${outer?'{x:0,y:0}':"document.getElementById('csh-shell-frame').getBoundingClientRect()"};return {x:f.x+r.x+r.width/2,y:f.y+r.y+r.height/2};})()`);
  for(const type of ['mousePressed','mouseReleased'])await page.send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...rect});
}
try{
  await page.send('Emulation.setDeviceMetricsOverride',{width:1240,height:900,deviceScaleFactor:1,mobile:false});
  await page.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/fixture.html'});await ready();
  check('primary action is one-click pack and range/actual counts are visible',await child(`w.document.getElementById('b-pack').textContent==='一键打包'&&w.document.getElementById('scope')?.textContent.includes('全部玩家数据')&&w.document.getElementById('selection')?.textContent.includes('全部随行')`));
  const before=await page.evaluate(`localStorage.getItem('csh_wallet')`);
  await click('#b-pack');await poll(`!!document.getElementById('csh-shell-frame').contentWindow.document.getElementById('code').value`);
  check('native click produces real valid portable code without changing source save',await child(`w.document.getElementById('msg').textContent.includes('打包完成')&&w.document.getElementById('code').value.startsWith('CSH')`)&&(await page.evaluate(`localStorage.getItem('csh_wallet')`))===before);
  check('pack result has measured text/byte size and copy/file actions enabled',await child(`w.document.getElementById('msg').textContent.includes('字 /')&&!w.document.getElementById('b-copy').disabled&&!w.document.getElementById('b-download')?.disabled`));
  await page.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:page.temp});
  if(await child(`!!w.document.getElementById('b-download')`)){await click('#b-download');for(let i=0;i<50&&!fs.readdirSync(page.temp).some(n=>n.startsWith('chizi-save-')&&n.endsWith('.txt'));i++)await new Promise(r=>setTimeout(r,40));check('second native click saves exact complete code file',fs.readdirSync(page.temp).some(n=>n.startsWith('chizi-save-')&&n.endsWith('.txt')&&fs.readFileSync(path.join(page.temp,n),'utf8').startsWith('CSH')));}
  const portable=await child(`w.document.getElementById('code').value`);
  await page.evaluate(`window.testPortable=${JSON.stringify(portable)};lib.cshWallet.wallet.add(100,'fixture mutation');lib.cshWallet.flushSave();`);
  await click('#b-unpack');await poll(`document.getElementById('csh-shell-frame').contentWindow.STATE.pending!==null`);
  check('first import action previews real differences without writing',await child(`w.document.getElementById('b-unpack').textContent==='确认导入'&&w.document.getElementById('diff').textContent.includes('3,334')`)&&(await page.evaluate('lib.cshWallet.wallet.pc()'))===3334);
  await click('#b-unpack');
  await poll(`!!document.querySelector('#csh-ui-confirm')`);
  await click('#csh-ui-confirm button.ok',true);
  await poll(`lib.cshWallet.wallet.pc()===3234`);
  check('third native action confirms import, creates backup, adopts stored wallet',await child(`w.document.getElementById('msg').textContent.includes('已倒进来')`)&&(await page.evaluate('M.backups().length'))===1);
  await page.evaluate('reopen()');await ready();
  check('closing and reopening page reads persisted import and backup',await page.evaluate(`lib.cshWallet.wallet.pc()===3234&&M.backups().length===1`)&&await child(`w.document.getElementById('bklist').textContent.includes('3,334')`));
  await child(`(w.document.getElementById('bklist').closest('details')&&(w.document.getElementById('bklist').closest('details').open=true),true)`);
  await click('[data-roll]');await poll(`!!document.querySelector('#csh-ui-confirm')`);await click('#csh-ui-confirm button.ok',true);
  await poll('lib.cshWallet.wallet.pc()===3334');
  check('native backup rollback click restores original durable balance',await page.evaluate(`JSON.parse(localStorage.getItem('csh_wallet')).pc===3334`));
  await page.evaluate('reopen()');await ready();
  await page.evaluate('holdExport=true');await click('#b-pack');await click('#b-pack');
  await poll('typeof heldExport==="function"');
  check('double pointer click sends only one in-flight export',await page.evaluate(`calls.filter(x=>x.cmd==='shell-mig-export').length===2`)&&await child(`w.document.getElementById('b-pack').disabled`));
  await page.evaluate('reopen()');await ready();await page.evaluate('heldExport();holdExport=false');await new Promise(r=>setTimeout(r,100));
  check('late export result cannot fill the reopened page',await child(`w.document.getElementById('code').value===''`));
  await child(`(w.document.getElementById('code').value=parent.testPortable,w.document.getElementById('code').dispatchEvent(new Event('input')),true)`);
  await page.evaluate('holdInspect=true');await click('#b-check');
  await poll('typeof heldInspect==="function"');
  await child(`(w.document.getElementById('code').value='changed',w.document.getElementById('code').dispatchEvent(new Event('input')),true)`);
  await page.evaluate('heldInspect();holdInspect=false');await new Promise(r=>setTimeout(r,150));
  check('changed code rejects a late validation result instead of arming import',await child(`w.STATE.pending===null&&w.document.getElementById('msg').textContent.includes('已修改')`));
  const savedInv=await child(`w.document.getElementById('inv').textContent`);
  await page.evaluate('readFault=true');await child('(w.loadAll(),true)');await new Promise(r=>setTimeout(r,150));
  check('inventory read failure preserves shown data and disables export',await child(`w.document.getElementById('inv').textContent===${JSON.stringify(savedInv)}&&w.document.getElementById('b-pack').disabled`));
  await page.evaluate('readFault=false');await child('(w.loadAll(),true)');
  const failed=await page.evaluate(`(async()=>{cleanupFault=true;return await M.import(testPortable);})()`);
  check('native journal cleanup failure leaves a real recovery credential',!failed.ok&&failed.recovery&&await page.evaluate(`!!localStorage.getItem('csh_migrate_recovery')`));
  await page.evaluate('reopen()');await poll(`document.getElementById('csh-shell-frame').contentWindow.document.getElementById('recovery')&&!document.getElementById('csh-shell-frame').contentWindow.document.getElementById('recovery').hidden`);
  check('reopened recovery state locks pack/import/reset and exposes recovery above folds',await child(`w.document.getElementById('b-pack').disabled&&w.document.getElementById('b-unpack').disabled&&w.document.getElementById('b-reset').disabled&&!w.document.getElementById('b-recover').disabled`));
  await click('#b-recover');await poll(`document.getElementById('csh-shell-frame').contentWindow.document.getElementById('msg').textContent.includes('injected cleanup failure')`);
  check('failed native recovery remains locked with the exact host reason visible',await child(`w.document.getElementById('b-pack').disabled&&w.document.getElementById('msg').textContent.includes('injected cleanup failure')`));
  await page.evaluate('cleanupFault=false');await click('#b-recover');await ready();
  check('native recovery click clears credential before unlocking and preserves original save',await page.evaluate(`!localStorage.getItem('csh_migrate_recovery')&&JSON.parse(localStorage.getItem('csh_wallet')).pc===3334`));
  await page.evaluate(`(async()=>{for(let i=0;i<4;i++)await M.import(testPortable);})()`);await child('(w.loadAll(),true)');
  check('actual backend keeps only the three most recent original-save backups',await page.evaluate('M.backups().length===3'));
  await click('#b-pack');await poll(`document.getElementById('csh-shell-frame').contentWindow.document.getElementById('msg').textContent.includes('打包完成')`);
  await page.send('Emulation.setDeviceMetricsOverride',{width:915,height:412,deviceScaleFactor:1,mobile:false});
  check('short screen has no horizontal overflow and primary targets remain 44px',await child(`w.document.body.scrollWidth<=w.innerWidth&&w.document.getElementById('b-pack').getBoundingClientRect().height>=44&&w.document.getElementById('b-unpack').getBoundingClientRect().height>=44`));
  const output=option('--output',path.join(page.temp,'bag-flow-result.json'));
  const screenshot=await page.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(output.replace(/\.json$/,'.png'),Buffer.from(screenshot.data,'base64'));
  await page.send('Emulation.setDeviceMetricsOverride',{width:480,height:800,deviceScaleFactor:1,mobile:false});
  check('narrow screen puts primary action before content and keeps all content reachable',await child(`w.document.body.scrollWidth<=w.innerWidth&&w.document.getElementById('b-pack').getBoundingClientRect().top<w.document.getElementById('inv').getBoundingClientRect().top&&w.document.getElementById('board').scrollHeight>w.document.getElementById('board').clientHeight`));
  const narrow=await page.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(output.replace(/\.json$/,'-narrow.png'),Buffer.from(narrow.data,'base64'));
}catch(error){check('probe completed all required stages',false,error.stack);}
finally{await page.close();await new Promise(r=>server.close(r));}
const failures=rows.filter(x=>!x.passed),result={scope:'real Chromium pointer input; real page/transport/UIKit/migration/wallet and native localStorage in isolated host fixture, not Noname engine',passed:rows.length-failures.length,failed:failures.length,rows};
if(process.argv.includes('--output'))fs.writeFileSync(option('--output'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));process.exitCode=failures.length?1:0;
