// Actual achievement page, wallet and host claim branch in disposable Chromium profiles.
// Synthetic host/player fixture only; never open the installed game's profile.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {root,parse,walk} from './lib/skill_audit.mjs';import {openProbe} from './lib/browser_probe.mjs';
const opt=(n,f)=>{let i=process.argv.indexOf(n);return i<0?f:process.argv[i+1];},read=f=>fs.readFileSync(path.join(root,f),'utf8');
let handler='';const shell=read('core/csh_shell.js');walk(parse(shell),n=>{if(n.type==='IfStatement'&&n.test.type==='BinaryExpression'&&n.test.left.name==='cmd'&&n.test.right.value==='shell-pool-ach-claim')handler=shell.slice(...n.range);});
if(!handler)throw Error('actual claim handler missing');
const js=s=>s.replace(/^import .*?;.*\r?\n/gm,'').replace(/<\/script/gi,'<\\/script');
const fixture=`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{width:100%;height:100%;border:0}#dock{position:fixed;top:6px;right:8px;width:150px;height:40px;background:#313535;color:#fff;display:flex;align-items:center;justify-content:center}</style><script>
var lib={config:{mode:'identity'},configprefix:'audit_',skill:{},translate:{}},game={saveConfig(){},addGlobalSkill(){},over(){}},ui={},get={},ai={},_status={};window.lib=lib;window.CSH={};
${js(read('core/csh_wallet.js'))}
${js(read('core/csh_pool_achv.js'))}
var PA=window.CSH_POOL_ACHV,audit={hold:false,failKey:'',queued:[],acks:[]};
var originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===audit.failKey)throw Error('injected write failure');return originalSet.call(this,k,v);};
if(!localStorage.getItem('fixture_seeded')){PA.unlock('op_one_slash','identity');PA.unlock('op_hit3','identity');PA.recordPaid('op_hit3',0,0);var st=PA.load();st.progress={op_thunder:3};PA.save(st);localStorage.setItem('fixture_seeded','1');}
function wallet(){return lib.cshWallet;}function paintPc(){}function ackToGame(cmd,ok,data){var ack={__csh:cmd+'-ack',req:audit.req,ok,data};audit.acks.push(ack);if(audit.hold)audit.queued.push(ack);else document.querySelector('iframe').contentWindow.postMessage(ack,'*');}
window.addEventListener('message',function(e){if(e.source!==document.querySelector('iframe').contentWindow)return;var d=e.data,cmd=d&&d.__csh;if(cmd!=='shell-pool-ach-claim')return;audit.req=d.req;${handler}});
</script><iframe title="池子成就" src="/games/achv.html"></iframe><div id="dock">池子币 · 关闭</div>`;
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/host.html'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(fixture);return;}const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',file.endsWith('.html')?'text/html;charset=utf-8':'text/javascript;charset=utf-8');res.end(fs.readFileSync(file));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const out=opt('--out',path.join(root,'docs/audit/ui/pool-achv-rebuild'));fs.mkdirSync(out,{recursive:true});const results=[];
try{for(const [name,width,height,scale] of [['desktop',1200,820,1],['portrait',390,844,1],['landscape',915,412,0.6],['short',720,350,1.5]]){
 const p=await openProbe('<!doctype html><title>Isolated achievement browser probe</title>');
 try{
 await p.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile:false});
 await p.send('Page.navigate',{url:origin+'/host.html'});
 for(let i=0;i<160;i++){if(await p.evaluate(`!!document.querySelector('iframe')?.contentDocument?.querySelector('[data-id="op_one_slash"]')`))break;await new Promise(r=>setTimeout(r,25));}
 const frame=`document.querySelector('iframe').contentWindow`,doc=`document.querySelector('iframe').contentDocument`;
 await p.evaluate(`(()=>{const d=${doc};d.getElementById("hero").value="general";d.getElementById("hero").dispatchEvent(new Event("change"));})()`);
 const run=async code=>{const expression=`(()=>{const win=${frame},doc=${doc},rows=[],check=(name,passed,detail)=>rows.push({name,passed:!!passed,detail});${code};return rows;})()`;let r;try{r=await p.evaluate(expression);}catch(e){throw Error(e.message+'\n'+expression);}results.push(...r.map(x=>({viewport:name,...x})));};
 await run(`check('all 80 rows render from real source',doc.querySelectorAll('.row').length===80);check('summary distinguishes pending and claimed',doc.querySelector('#summary').textContent.includes('待领取 1')&&doc.querySelector('#summary').textContent.includes('已领取 1'));check('row exposes condition, numeric progress, reward and status',doc.querySelector('[data-id="op_thunder"]').textContent.includes('3 / 6')&&doc.querySelector('[data-id="op_one_slash"]').textContent.includes('1500 池子币'));check('reset action removed',!doc.querySelector('#reset'));const list=doc.querySelector('#list').getBoundingClientRect();check('list retains at least half the viewport',list.height>=innerHeight*.5,{height:list.height,viewport:innerHeight});check('no horizontal overflow',doc.documentElement.scrollWidth<=innerWidth+1);check('real shell dock does not cover title',doc.querySelector('h1').getBoundingClientRect().right<document.querySelector('#dock').getBoundingClientRect().left);const rowsRect=[...doc.querySelectorAll('.claim')].map(b=>b.getBoundingClientRect());check('claim targets remain at least 44px',rowsRect.every(r=>r.height>=44));`);
 // Exercise native input/search/status events and actual pointer click for payment.
 await p.evaluate(`(()=>{let d=${doc},q=d.querySelector('#search');q.value='雷霆';q.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await run(`check('search filters the actual condition list',doc.querySelectorAll('.row').length===1&&doc.querySelector('.name').textContent.includes('雷霆'));`);
 await p.evaluate(`(()=>{let d=${doc};d.querySelector('#search').value='';d.querySelector('#search').dispatchEvent(new Event('input',{bubbles:true}));d.querySelector('#status').value='待领取';d.querySelector('#status').dispatchEvent(new Event('change',{bubbles:true}));audit.hold=true;})()`);
 const point=await p.evaluate(`(()=>{let b=${doc}.querySelector('[data-id="op_one_slash"] button'),r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 await p.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await p.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
 for(let i=0;i<100;i++){if(await p.evaluate('audit.queued.length>0'))break;await new Promise(r=>setTimeout(r,20));}
 await run(`check('real pointer click reaches actual host branch',audit.acks.length===1&&audit.acks[0].ok);check('button stays pending until ACK',doc.querySelector('.claim')?.disabled&&doc.querySelector('.claim')?.textContent==='领取中…');check('CBY and reward receipt saved before ACK',JSON.parse(localStorage.getItem('csh_wallet')).pc===3500&&!!JSON.parse(localStorage.getItem('csh_wallet')).poolClaims.op_one_slash);check('merit and own receipt saved before ACK',JSON.parse(localStorage.getItem('csh_rank')).merit===15&&JSON.parse(localStorage.getItem('csh_rank')).poolClaims.op_one_slash===15);`);
 await p.evaluate(`audit.hold=false;document.querySelector('iframe').contentWindow.postMessage(audit.queued.shift(),'*');`);
 for(let i=0;i<100;i++){if(await p.evaluate(`${doc}.querySelector('#message').textContent.includes('已领取')`))break;await new Promise(r=>setTimeout(r,20));}
 await run(`check('success ACK refreshes state and pending filter',doc.querySelectorAll('.row').length===0&&doc.querySelector('#summary').textContent.includes('待领取 0'));`);
 await p.evaluate('audit.navigating=true');await p.send('Page.reload');
 for(let i=0;i<160;i++){if(await p.evaluate(`typeof audit!=='undefined'&&!audit.navigating&&!!${doc}?.querySelector('#hero')`))break;await new Promise(r=>setTimeout(r,25));}
 await p.evaluate(`(()=>{const d=${doc};d.getElementById("hero").value="general";d.getElementById("hero").dispatchEvent(new Event("change"));})()`);
 await run(`check('closing/reopening restores earned and claimed data',doc.querySelector('[data-id="op_one_slash"] button').textContent==='已领取'&&JSON.parse(localStorage.getItem('csh_wallet')).pc===3500);check('closing/reopening retains partial progress',doc.querySelector('[data-id="op_thunder"]').textContent.includes('3 / 6'));`);
 await p.evaluate(`(()=>{let d=${doc};d.querySelector('#status').value='已领取';d.querySelector('#status').dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await run(`check('claimed filter shows both old and newly claimed',doc.querySelectorAll('.row').length===2);`);
 // A real pointer claim interrupted between wallet and merit must survive reopening.
 await p.evaluate(`(()=>{PA.unlock('op_hit5','identity');audit.failKey='csh_rank';let d=${doc};d.querySelector('#status').value='待领取';d.querySelector('#status').dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const clickClaim=async()=>{const at=await p.evaluate(`(()=>{let b=${doc}.querySelector('.claim'),r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await p.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...at});await p.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...at});};
 await clickClaim();
 for(let i=0;i<100;i++){if(await p.evaluate(`audit.acks.length===1&&${doc}.querySelector('#message').textContent.length>0`))break;await new Promise(r=>setTimeout(r,20));}
 await run(`check('rank fault reports failure after committing CBY exactly once',audit.acks.length===1&&!audit.acks[0].ok&&JSON.parse(localStorage.getItem('csh_wallet')).pc===5000&&JSON.parse(localStorage.getItem('csh_rank')).merit===15);check('failed ACK releases native claim button for retry',doc.querySelector('.claim')&&!doc.querySelector('.claim').disabled&&doc.querySelector('#message').textContent.includes('功勋待补领'));`);
 await p.evaluate('audit.navigating=true');await p.send('Page.reload');
 for(let i=0;i<160;i++){if(await p.evaluate(`typeof audit!=='undefined'&&!audit.navigating&&!!${doc}?.querySelector('[data-id="op_hit5"]')`))break;await new Promise(r=>setTimeout(r,25));}
 await p.evaluate(`(()=>{let d=${doc};d.querySelector('#status').value='待领取';d.querySelector('#status').dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await p.evaluate(`(()=>{const d=${doc};d.getElementById("hero").value="general";d.getElementById("hero").dispatchEvent(new Event("change"));})()`);
 await run(`check('reopen retains incomplete reward as pending',doc.querySelectorAll('.row').length===1&&doc.querySelector('.row').dataset.id==='op_hit5');`);
 await clickClaim();
 for(let i=0;i<100;i++){if(await p.evaluate('audit.acks.length===1'))break;await new Promise(r=>setTimeout(r,20));}
 await run(`check('retry completes merit without replaying CBY',audit.acks[0]?.ok&&JSON.parse(localStorage.getItem('csh_wallet')).pc===5000&&JSON.parse(localStorage.getItem('csh_rank')).merit===30);check('successful retry refreshes pending list',doc.querySelectorAll('.row').length===0);`);
 await p.evaluate(`(()=>{let d=${doc};d.querySelector('#status').value='全部状态';d.querySelector('#status').dispatchEvent(new Event('change',{bubbles:true}));d.querySelector('#list').scrollTop=d.querySelector('#list').scrollHeight;})()`);
 await run(`const last=doc.querySelector('.row:last-child').getBoundingClientRect(),list=doc.querySelector('#list').getBoundingClientRect();check('last achievement remains reachable by scrolling',last.bottom<=list.bottom+1&&last.top>=list.top);`);
 await p.evaluate(`${doc}.querySelector('#list').scrollTop=0`);const shot=await p.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'));
 }finally{await p.close();}
}}finally{server.close();}
const failures=results.filter(r=>!r.passed),summary={passed:results.length-failures.length,failed:failures.length,failures};console.log(JSON.stringify(summary,null,2));fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({scope:'real Chromium, actual sources and real localStorage, isolated synthetic host; not a live Noname match',...summary,checks:results},null,2));process.exitCode=failures.length?1:0;
