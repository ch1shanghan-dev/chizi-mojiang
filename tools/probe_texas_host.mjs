import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {pathToFileURL,fileURLToPath} from 'node:url';
const arg=(k,d)=>{let i=process.argv.indexOf(k);return i<0?d:process.argv[i+1];},root=arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')),out=arg('--out');if(!out)throw Error('External --out required');fs.mkdirSync(out,{recursive:true});
const hook=`window.__texasProbe={get:function(){return G;},render:render,clear:clearAllTimers,action:applyAction,banner:showHandBanner,announce:announceAction,fixture:function(mode){clearAllTimers();hideBanner();G.over=false;G.sessionOver=false;G.revealAll=mode==='showdown';G.toAct=0;G.street='flop';G.community=mode==='showdown'?[8,17,30,48,57]:[8,17,30];G.pot=240;G.currentBet=20;G.minRaise=20;G.players.forEach(function(p,i){p.out=mode==='eliminated'&&i>1;p.folded=p.out;p.allin=false;p.bet=20;p.contrib=40;p.chips=960;p.actionAt=null;p.hole=[32+i*2,33+i*2];});if(mode==='locked'){G.players[0].actionAt=20;G.currentBet=30;}render();}};`;
const tests=String.raw`
async function texasHost(){
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshWallet.wallet.add(50000,"isolated texas fixture");lib.cshWallet.flushSave();lib.cshDebug.openLobby();lib.cshShell.open("texas",{buyIn:1000});})()');
 if(await page.evaluate('!!document.querySelector(".csh-fee-go")'))await clickElement('document.querySelector(".csh-fee-go")');
 await until('document.getElementById("csh-shell-frame")?.contentWindow?.__texasProbe','texas probe page ready');await delay(600);
 const w='document.getElementById("csh-shell-frame").contentWindow',d='document.getElementById("csh-shell-frame").contentDocument';
 if(await page.evaluate('(()=>{const n='+d+'.getElementById("btn-sign-go");return n&&n.getBoundingClientRect().height>0})()'))await clickElement(d+'.getElementById("btn-sign-go")',true);
 check('texas has no player difficulty selector',await page.evaluate(d+'.querySelector("#seg-difficulty")===null'));
 await clickElement('[...'+d+'.querySelectorAll("#seg-ai button")].at(-1)',true);
 const fee=await page.evaluate(d+'.getElementById("fee-tip").textContent');check('costs disclosed before first hand',fee.includes('10%')&&fee.includes('0.5%')&&fee.includes('不重复扣费'),fee);
 for(const [width,height]of [[915,412],[844,390],[640,286]]){
  await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(120);
  const startMetrics=await page.evaluate('(()=>{const d='+d+',b=d.getElementById("btn-start-game").getBoundingClientRect(),f=d.getElementById("fee-tip").getBoundingClientRect();return {buttonBottom:b.bottom,buttonTop:b.y,feeBottom:f.bottom,height:d.defaultView.innerHeight};})()');
  check('start costs and button visible '+width+'x'+height,startMetrics.buttonTop>=0&&startMetrics.buttonBottom<=height+1&&startMetrics.feeBottom<=height+1,startMetrics);stage('start-'+width+'x'+height,{screenshot:await snap('texas-start-'+width+'x'+height)});
 }
 const before=await page.evaluate('lib.cshWallet.wallet.pc()');
 await clickElement(d+'.getElementById("btn-start-game")',true);await delay(150);
 const start=await page.evaluate('(()=>{const t='+w+'.__texasProbe;t.clear();const g=t.get();return {active:!'+d+'.getElementById("view-game").classList.contains("hidden"),difficulty:g.difficulty,n:g.n,ante:g.ante,pot:g.pot,own:g.players[0].antePaid};})()');check('native start applies world opponents and real ante',start.active&&start.n===6&&start.ante===2&&start.own===2,start);
 check('first hand ante never separately debits wallet',await page.evaluate('lib.cshWallet.wallet.pc()')===before);
 check('cancelled pre-game toast cannot cover the board',await page.evaluate(d+'.getElementById("toasts").children.length')===0);
 const ledger=await page.evaluate('(()=>{const t='+w+'.__texasProbe;let n=0;while(!t.get().over&&n++<10){const g=t.get();t.action(g.toAct,"fold");t.clear();}return t.get().ledger;})()');
 check('real preflop fold hand settles antes once with no rake',ledger.conservation==='PASS'&&ledger.systemCollected===0&&ledger.ledger.every(p=>p.antePaid===2),ledger.ledger);
 for(const mode of ['active','locked','eliminated','showdown']){
  await page.evaluate(w+'.__texasProbe.fixture('+JSON.stringify(mode)+')');
  for(const [width,height]of [[1365,768],[915,412],[844,390],[640,286]]){
   await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(150);
   const m=await page.evaluate('(()=>{const d='+d+',w=d.defaultView,r=n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height};},visible=n=>{const b=n.getBoundingClientRect();return b.width>0&&b.height>0&&!n.hidden&&w.getComputedStyle(n).visibility!=="hidden";};const center=r(d.querySelector(".csh-center")),seats=[...d.querySelectorAll(".seat")].filter(visible).map(n=>{const boxes=[n,...n.querySelectorAll(".pcard")].filter(visible).map(r);return {x:Math.min(...boxes.map(b=>b.x)),y:Math.min(...boxes.map(b=>b.y)),right:Math.max(...boxes.map(b=>b.right)),bottom:Math.max(...boxes.map(b=>b.bottom))};}),buttons=[...d.querySelectorAll("#actions button")].filter(visible).map(n=>({text:n.textContent,...r(n)}));return {dock:r(document.getElementById("csh-shell-dock")),width:w.innerWidth,height:w.innerHeight,overflow:d.documentElement.scrollWidth>w.innerWidth+1,seats,buttons,center,board:r(d.querySelector(".csh-board")),main:r(d.querySelector(".csh-stage")),cost:d.getElementById("tb-ante").textContent};})()');
   check(mode+' table boundaries '+width+'x'+height,!m.overflow&&m.buttons.every(b=>b.x>=-1&&b.right<=width+1&&b.y>=0&&b.bottom<=height+1)&&m.seats.every(s=>s.x>=-1&&s.right<=width+1&&s.y>=-1&&s.bottom<=height+1),m);
   check(mode+' public cards clear of seat cards '+width+'x'+height,m.seats.every(s=>s.right<=m.center.x+1||s.x>=m.center.right-1||s.bottom<=m.center.y+1||s.y>=m.center.bottom-1),m);
   check(mode+' seats clear shell controls '+width+'x'+height,m.seats.every(s=>s.right<=m.dock.x+1||s.x>=m.dock.right-1||s.bottom<=m.dock.y+1||s.y>=m.dock.bottom-1),m);
   check(mode+' seat cards do not overlap each other '+width+'x'+height,m.seats.every((a,i)=>m.seats.every((b,j)=>i===j||a.right<=b.x+1||a.x>=b.right-1||a.bottom<=b.y+1||a.y>=b.bottom-1)),m.seats);
   if(mode==='eliminated')check('eliminated opponents leave visual table '+width+'x'+height,m.seats.length===1,m.seats);
   if(mode==='locked')check('locked raise controls are absent '+width+'x'+height,m.buttons.every(b=>!b.text.includes('池')&&!b.text.includes('全下')&&!b.text.includes('微调')&&!b.text.includes('加注')),m.buttons);
   stage(mode+'-'+width+'x'+height,{screenshot:await snap('texas-'+mode+'-'+width+'x'+height)});
  }
 }
 const errs=await page.evaluate('({errors:'+w+'.__hostSmoke.errors,rejections:'+w+'.__hostSmoke.rejections})');check('texas runtime has no errors',!errs.errors.length&&!errs.rejections.length,errs);
 await page.evaluate('lib.cshShell.close("texas-host-done")');
}
`;
let source=fs.readFileSync(path.join(root,'tools/probe_host_smoke.mjs'),'utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root = '+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));
const marker='    const stream = fs.createReadStream(target);';if(!source.includes(marker))throw Error('Server marker');source=source.replace(marker,'    if(target.endsWith(path.join("texas","texas.html"))){res.end(fs.readFileSync(target,"utf8").replace("/* ---------- 启动 ---------- */",'+JSON.stringify(hook)+'+"/* ---------- 启动 ---------- */"));return;}\n'+marker);
source=source.replace("if(process.argv.includes('--world-layout-410'))","if(process.argv.includes('--texas-host'))await texasHost();\n    else if(process.argv.includes('--world-layout-410'))");const runner=path.join(out,'isolated-texas-runner.mjs');fs.writeFileSync(runner,tests+'\n'+source);const child=spawn(process.execPath,[runner,'--texas-host','--out',out],{stdio:'inherit',windowsHide:true});await new Promise(r=>child.once('exit',c=>{process.exitCode=c||0;r();}));
