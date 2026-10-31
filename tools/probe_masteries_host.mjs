import fs from 'node:fs';import path from 'node:path';import{spawn}from'node:child_process';import{fileURLToPath,pathToFileURL}from'node:url';
const arg=(n,d)=>{let i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];},root=arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')),out=arg('--out');if(!out)throw Error('External --out required');fs.mkdirSync(out,{recursive:true});
const tests=String.raw`
async function masteriesHost(){
 if(await page.evaluate('[...document.querySelectorAll(".control")].some(n=>n.textContent==="确定")'))await clickElement('[...document.querySelectorAll(".control")].find(n=>n.textContent==="确定")');
 stage('native-selection',{state:await page.evaluate('({name:game.me?.name1,started:_status.gameStarted,continued:lib.config.continue_name,controls:[...document.querySelectorAll(".control")].map(n=>n.textContent)})')});
 await until('!!_status.gameStarted&&game.me?.name1==="csh_pingfan"','native selected Pingfan match',25000);
 if(!await page.evaluate('!!_status.auto'))await clickElement('ui.auto');
 await until('((CSH_POOL_ACHV.load().mastery||{}).csh_pingfan?.totals?.["s:csh_jilei"]||0)>0','natural silent accumulation skill observed',30000);
 const native=await page.evaluate('({name:game.me.name1,record:CSH_POOL_ACHV.load().mastery.csh_pingfan,mark:game.me.countMark("csh_jilei"),errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})');
 check('real native silent skill completion records Pingfan mastery',native.name==='csh_pingfan'&&native.record.totals['s:csh_jilei']>=1&&native.mark>=1,native);
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();return lib.cshDebug.openLobby();})()');
 const open=async(key)=>{await page.evaluate('lib.cshShell.close("mastery-review");lib.cshShell.open('+JSON.stringify(key)+')');await until('document.getElementById("csh-shell-frame")?.contentDocument?.readyState==="complete"&&document.getElementById("csh-shell-frame").src.includes("/'+key+'.html")',key+' load');await delay(500);};
 const frame=js=>page.evaluate('(()=>{const d=document.getElementById("csh-shell-frame").contentDocument,w=d.defaultView;return ('+js+');})()');
 await open('achv');
 check('100 named heroes plus all/general filters are present',await frame('d.getElementById("hero").options.length===102&&d.getElementById("summary").textContent.includes("1300")&&d.querySelectorAll(".row").length===80'));
 await clickElement('document.getElementById("csh-shell-frame").contentDocument.querySelector(".load-more")',true);check('expansion renders the next bounded 80 rows',await frame('d.querySelectorAll(".row").length===160'));
 await frame('(d.getElementById("hero").value="csh_haozhao",d.getElementById("hero").dispatchEvent(new Event("change")),true)');
 check('Haozhao filters all 13 actual exclusive rules',await frame('d.querySelectorAll(".row").length===13&&[...d.querySelectorAll(".row")].every(n=>n.dataset.id.startsWith("ca_haozhao_"))'));
 await frame('(d.getElementById("search").value="重垒",d.getElementById("search").dispatchEvent(new Event("input")),true)');check('skill-name search finds the three distinct mastery tiers',await frame('d.querySelectorAll(".row").length===3&&d.getElementById("list").textContent.includes("1000")'));
 await frame('(d.getElementById("search").value="",d.getElementById("search").dispatchEvent(new Event("input")),true)');
 for(const [width,height]of [[1920,1080],[1365,768],[915,412],[844,390],[640,286]]){
  await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(400);
  await frame('(d.querySelector(".row").scrollIntoView({block:"start"}),true)');
  const p=await frame('(()=>{const n=d.querySelector(".row"),r=n.getBoundingClientRect(),b=d.querySelector("#claim-all").getBoundingClientRect();return {width:w.innerWidth,height:w.innerHeight,overflow:d.documentElement.scrollWidth>w.innerWidth+1,row:{x:r.x,y:r.y,w:r.width,h:r.height},claim:{x:b.x,y:b.y,right:b.right,bottom:b.bottom},columns:w.getComputedStyle(d.getElementById("list")).gridTemplateColumns};})()');
  check('exclusive achievement list stays readable and reachable '+width+'x'+height,!p.overflow&&p.row.w>=280&&p.row.h>=88&&p.row.y<height-50,p);
  stage('exclusive-'+width+'x'+height,{screenshot:await snap('exclusive-'+width+'x'+height)});
 }
 await page.send('Emulation.setDeviceMetricsOverride',{width:915,height:412,deviceScaleFactor:1,mobile:false});
 const count=await page.evaluate('(()=>{const p=CSH_POOL_ACHV;for(const r of p.RULES.filter(r=>r.hero).slice(0,83))p.unlock(r.id,"identity");return p.RULES.filter(r=>p.load().got[r.id]&&!p.isPaid(r.id)).length;})()');await open('achv');
 const before=await page.evaluate('(()=>{const p=CSH_POOL_ACHV,ready=p.RULES.filter(r=>p.load().got[r.id]&&!p.isPaid(r.id));window.__masteryReady=ready.map(r=>r.id);window.__bulkReqs=0;window.addEventListener("message",e=>{if(e.data?.__csh==="shell-pool-ach-claim-all")__bulkReqs++;});return {pc:lib.cshWallet.wallet.pc(),expected:ready.reduce((n,r)=>n+p.reward(r).pc,0),count:ready.length};})()');
 await clickElement('document.getElementById("csh-shell-frame").contentDocument.getElementById("claim-all")',true);
 await until('window.__masteryReady.every(id=>lib.cshWallet.wallet.poolClaimed(id))','multi-request exact bulk receipts',30000);await delay(500);
 const after=await page.evaluate('({pc:lib.cshWallet.wallet.pc(),requests:__bulkReqs,claimed:__masteryReady.every(id=>CSH_POOL_ACHV.isPaid(id)),message:document.getElementById("csh-shell-frame").contentDocument.getElementById("message").textContent})');
 check('more than 80 awards use bounded chunks and pay exactly once',before.count>=83&&after.requests>=3&&after.pc-before.pc===before.expected&&after.claimed,{before,after});
 await page.evaluate('document.getElementById("csh-shell-frame").contentDocument.getElementById("claim-all").dispatchEvent(new MouseEvent("click"))');await delay(500);check('repeated completed bulk input pays nothing again',await page.evaluate('lib.cshWallet.wallet.pc()')===after.pc);
 await open('save');const grouped=await frame('({core:d.querySelectorAll(".inv-core .iv").length,extra:d.querySelectorAll(".inv-extra .iv").length,all:d.querySelectorAll("#inv .iv").length,closed:!d.querySelector(".inv-extra").open})');
 check('bag keeps all domains while prioritising eight progress summaries',grouped.core===8&&grouped.extra>20&&grouped.all===grouped.core+grouped.extra&&grouped.closed,grouped);
 await clickElement('document.getElementById("csh-shell-frame").contentDocument.querySelector(".inv-extra summary")',true);check('secondary bag data remains directly accessible',await frame('d.querySelector(".inv-extra").open'));
 await clickElement('document.getElementById("csh-shell-frame").contentDocument.getElementById("b-pack")',true);const code=await until('document.getElementById("csh-shell-frame").contentDocument.getElementById("code").value||false','real full bag export');
 const portable=await page.evaluate('lib.cshMigrate.inspect('+JSON.stringify(code)+')');check('bag full export retains native mastery and all new paid receipts',portable.ok&&portable.data.poolAchv.mastery.csh_pingfan.totals['s:csh_jilei']>=1&&Object.keys(portable.data.wallet.poolClaims).length>=83, {codeLength:code.length,domains:Object.keys(portable.data||{})});
 const e=await page.evaluate('({errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})');check('native mastery and expanded page flow has no runtime errors',!e.errors.length&&!e.rejections.length,e);
}
`;
let source=fs.readFileSync(path.join(root,'tools/probe_host_smoke.mjs'),'utf8');source=source.replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root = '+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));
source=source.replace("show_splash:'off'","continue_name:['csh_pingfan'],player_number_mode_config_identity:'2',game_speed:'vvfast',show_splash:'off'");
source=source.replace("if(process.argv.includes('--world-layout-410'))","if(process.argv.includes('--masteries-host'))await masteriesHost();\n    else if(process.argv.includes('--world-layout-410'))");
const runner=path.join(out,'isolated-masteries-runner.mjs');fs.writeFileSync(runner,tests+'\n'+source);const child=spawn(process.execPath,[runner,'--masteries-host','--out',out],{stdio:'inherit',windowsHide:true});await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{process.exitCode=code||0;resolve();});});
