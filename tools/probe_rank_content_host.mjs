// Disposable full host, with every remote fetch denied or explicitly mocked. No player profile or service.
import fs from'node:fs';import path from'node:path';import{spawn}from'node:child_process';import{fileURLToPath,pathToFileURL}from'node:url';
const arg=(n,d)=>{let i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];},root=arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')),out=arg('--out');if(!out)throw Error('Use external --out');fs.mkdirSync(out,{recursive:true});
const injection=String.raw`
window.__remoteProbe=[];window.__onlineMock='deny';
const originalFetch=window.fetch.bind(window);
window.fetch=async function(input,options){
 const url=new URL(typeof input==='string'?input:input.url,location.href);
 if(url.origin===location.origin)return originalFetch(input,options);
 var owner=window;try{if(parent!==window)owner=parent;}catch(e){}
 if(!owner.__remoteProbe)owner.__remoteProbe=[];
 owner.__remoteProbe.push({url:url.href,method:options&&options.method||'GET'});
 if(owner.__onlineMock!=='online')throw Error('Isolated remote service unavailable');
 if(url.origin!=='https://chishanghan.duckdns.org')throw Error('Unexpected remote target');
 if(options&&options.method==='POST')throw Error('Unexpected write during read-only test');
 var data=url.pathname==='/girls'?{ok:true,girls:[{girl:'csh_boss_minion_temari',total:77,n:2,chief_name:'隔离魁首',chief_sig:'快照题壁'}]}:{ok:true,list:[{uid:'mock-'+url.searchParams.get('type'),name:url.searchParams.get('type')==='merit'?'功勋样本':'池币样本',cby:12345,merit:678,rank:1}],n:1};
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
};
`;
const tests=String.raw`
async function offlineHost(){
 await page.send('Emulation.setDeviceMetricsOverride',{width:915,height:412,deviceScaleFactor:1,mobile:false});
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshDebug.openLobby();lib.cshWallet.flushSave();lib.cshShell.open("rank");})()');
 const f='document.getElementById("csh-shell-frame")',d=f+'.contentDocument',w=f+'.contentWindow';
 if(await page.evaluate('!!document.querySelector(".csh-fee-go")'))await clickElement('document.querySelector(".csh-fee-go")');
 await until(f+'?.contentDocument?.querySelector("#net-toggle")','rank page');await delay(350);
 const wallet=await page.evaluate('localStorage.getItem("csh_wallet")'),metrics=[];
 async function metric(width,height,label){
  await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(300);
  const m=await page.evaluate('('+function(){const f=document.getElementById('csh-shell-frame'),d=f.contentDocument,wrap=d.getElementById('wrap'),list=d.getElementById('rows'),r=list.getBoundingClientRect();return {w:f.clientWidth,h:f.clientHeight,list:{top:r.top,bottom:r.bottom,h:r.height,width:r.width},visible:Math.max(0,Math.min(r.bottom,f.clientHeight)-Math.max(0,r.top)),overflow:d.documentElement.scrollWidth>f.clientWidth+2||wrap.scrollWidth>wrap.clientWidth+2,headerH:d.querySelector('h1').getBoundingClientRect().height,policy:d.getElementById('net-policy').textContent,profileOpen:d.getElementById('local-profile').open,controls:['net-toggle','net-refresh','t-cby','t-merit','t-cheer'].map(id=>({id,h:d.getElementById(id).getBoundingClientRect().height}))};}.toString()+')()');
  metrics.push({width,height,label,...m});check('rank fits and keeps useful list '+label+' '+width,!m.overflow&&(label==="long-error"?m.list.h>=100:m.visible>=(height<320?100:height<500?180:220)),m);check('rank primary controls retain44px '+label+' '+width,m.controls.every(x=>x.h>=44),m);stage('rank-'+label+'-'+width,{screenshot:await snap('rank-'+label+'-'+width)});
 }
 for(const[width,height]of [[1365,768],[915,412],[844,390],[640,286],[390,844]])await metric(width,height,'offline');
 check('default offline view makes no remote requests and preserves disclosure',await page.evaluate('__remoteProbe.length===0&&'+d+'.getElementById("net-policy").textContent.includes("IP")&&!CSHOnline.enabled()'));
 await page.send('Emulation.setDeviceMetricsOverride',{width:915,height:412,deviceScaleFactor:1,mobile:false});await delay(250);
 await clickElement(d+'.querySelector("#local-profile summary")',true);check('native details exposes edit form without clipping controls',await page.evaluate(d+'.getElementById("local-profile").open&&'+d+'.getElementById("nm").getBoundingClientRect().height>=44&&'+d+'.getElementById("save").getBoundingClientRect().height>=44'));
 const nmBefore=await page.evaluate('localStorage.getItem("csh_net_name")');await clickElement(d+'.querySelector("#local-profile summary")',true);check('folding local profile has no save side effect',nmBefore===await page.evaluate('localStorage.getItem("csh_net_name")'));
 await page.evaluate('__onlineMock="online"');await clickElement(d+'.getElementById("net-toggle")',true);await until(w+'.NET.rows.some(x=>x.name==="池币样本")','read-only public fixture');
 await metric(915,412,'public');
 await clickElement(d+'.getElementById("t-cheer")',true);await until(w+'.CHEER.list.length===50','all50 local girls');
 await page.evaluate('(()=>{const p='+w+';p.__render=0;const render=p.netRenderGirls;p.netRenderGirls=function(){p.__render++;return render.apply(this,arguments);};})()');
 await clickElement(d+'.getElementById("v-list")',true);
 check('one native list view click renders once',await page.evaluate(w+'.__render===1'),await page.evaluate(w+'.__render'));
 await metric(915,412,'flower-list');await metric(640,286,'flower-list');
 check('all50 girls remain browsable and global paid actions remain disabled',await page.evaluate(w+'.CHEER.list.length===50&&'+d+'.querySelectorAll("#rows .row").length===50&&[...'+d+'.querySelectorAll(".cheerbtn")].every(n=>n.disabled)'));
 for(const skin of await page.evaluate('Object.keys(lib.cshTheme.SKINS)')){await page.evaluate('lib.cshTheme.setSkin('+JSON.stringify(skin)+')');await metric(915,412,'skin-'+skin);}await page.evaluate('lib.cshTheme.setSkin("sgs")');
 await page.evaluate('__onlineMock="deny";CSHOnline.setEnabled(false)');await delay(250);await clickElement(d+'.getElementById("t-cby")',true);await delay(250);
 check('offline switch retains cached row and honest snapshot wording',await page.evaluate(w+'.NET.rows[0]?.name==="池币样本"&&'+d+'.getElementById("stat").textContent.includes("未连接")&&'+w+'.NET.cacheTs>0'));
 await page.evaluate(d+'.getElementById("local-best").textContent="本机历史最佳 · 100,000,000,000 池子币 · 999,999,999 功勋"');
 const safe=await page.evaluate('('+function(){const f=document.getElementById('csh-shell-frame'),d=f.contentDocument,n=d.getElementById('local-best'),range=d.createRange();range.selectNodeContents(n);const frame=f.getBoundingClientRect(),over=[...document.querySelectorAll('#csh-shell-dock,#csh-shell-close')].filter(n=>getComputedStyle(n).display!=='none').map(n=>n.getBoundingClientRect());return [...range.getClientRects()].every(r=>over.every(o=>Math.min(r.right+frame.left,o.right)-Math.max(r.left+frame.left,o.left)<=1||Math.min(r.bottom+frame.top,o.bottom)-Math.max(r.top+frame.top,o.top)<=1));}.toString()+')()');check('long local high scores remain clear of host wallet and close chrome',safe);
 await page.evaluate('(()=>{const d='+d+';d.getElementById("net-policy").textContent="PublicReadOnlyNetworkState".repeat(30);d.getElementById("stat").textContent="缓存读取失败，请刷新后重试。".repeat(8);})()');
 await metric(640,286,'long-error');
 check('long error remains completely available via page scroll',await page.evaluate('(()=>{const d='+d+',n=d.getElementById("net-policy");return n.scrollWidth<=n.clientWidth+2&&getComputedStyle(n).display!=="none";})()'));
 await page.evaluate(d+'.getElementById("wrap").scrollTop=999999');check('long error still allows list to be reached by normal scrolling',await page.evaluate('(()=>{const d='+d+',r=d.getElementById("rows").getBoundingClientRect();return r.top<'+f+'.clientHeight&&r.bottom>0;})()'));
 check('reading lists changing views and cancelling edits never changes wallet',wallet===await page.evaluate('localStorage.getItem("csh_wallet")'));
 check('all public traffic stays GET and omits identifying UID',await page.evaluate('__remoteProbe.every(x=>x.method==="GET"&&!new URL(x.url).searchParams.has("uid"))'));
 fs.writeFileSync(path.join(out,'rank-layout-metrics.json'),JSON.stringify(metrics,null,2));
 const e=await page.evaluate('({host:__hostSmoke,frame:'+w+'.__hostSmoke})');check('rank host/frame have no runtime errors or rejections',!e.host.errors.length&&!e.host.rejections.length&&(!e.frame||(!e.frame.errors.length&&!e.frame.rejections.length)),e);
}

`;
let source=fs.readFileSync(root+'/tools/probe_host_smoke.mjs','utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root = '+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));
source=source.replace("  await page.send('Page.navigate', { url: origin + '/__probe_init.html' });","  await page.send('Page.addScriptToEvaluateOnNewDocument',{source:"+JSON.stringify(injection)+"});\n  await page.send('Page.navigate', { url: origin + '/__probe_init.html' });");
source=source.replace("if(process.argv.includes('--world-layout-410'))","if(process.argv.includes('--offline-host'))await offlineHost();\n    else if(process.argv.includes('--world-layout-410'))");

if(arg('--page-source')){const route="    const target = resolveReadOnly(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));";source=source.replace(route,'    if(decodeURIComponent(url.pathname)==="/extension/池子魔将/games/rank.html"){item.status=200;res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-cache"});return res.end(fs.readFileSync('+JSON.stringify(path.resolve(arg('--page-source')))+'));}\n'+route);}

const runner=path.join(out,'isolated-online-runner.mjs');fs.writeFileSync(runner,tests+'\n'+source);const child=spawn(process.execPath,[runner,'--offline-host','--out',out],{stdio:'inherit',windowsHide:true});await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{process.exitCode=code||0;resolve();});});
