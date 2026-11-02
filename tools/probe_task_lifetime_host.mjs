// Five virtual dates in a disposable full host; real task APIs and native career claim.
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {pathToFileURL,fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),i=process.argv.indexOf('--out');if(i<0)throw Error('External --out on D: required');const out=path.resolve(process.argv[i+1]);if(out.toLowerCase()===root.toLowerCase()||out.toLowerCase().startsWith((root+path.sep).toLowerCase())||process.platform==='win32'&&/^c:/i.test(out))throw Error('Test output must be outside installation and C:');fs.mkdirSync(out,{recursive:true});
const tests=String.raw`
async function taskLifetimeHost(){
 await page.send('Emulation.setDeviceMetricsOverride',{width:915,height:412,deviceScaleFactor:1,mobile:false});
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshDebug.openLobby()})()');await until('lib.cshWallet.wallet.careerUnlocks()?.baseline','passive career baseline');
 const initial=await page.evaluate('lib.cshWallet.wallet.pc()'),keys=['task_4','task_5','task_6','task_7','task_8','task_9','task_10','task_12','task_15'];
 check('fresh real host has zero lifetime and no fabricated cumulative unlock',await page.evaluate('lib.cshWallet.task.lifetime().completed===0&&lib.cshWallet.task.lifetime().fullDays===0&&!document.getElementById("csh-shell-frame")&&'+JSON.stringify(keys)+'.every(k=>!lib.cshWallet.wallet.careerUnlocks().entries[k])'));
 await page.evaluate('(()=>{window.__lifeRealDate=Date;window.__lifeClock=Date.now();window.Date=class extends __lifeRealDate{constructor(...args){super(...(args.length?args:[__lifeClock]))}static now(){return __lifeClock}};window.__lifeWrites=[];window.__lifeOriginalPut=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){const r=__lifeOriginalPut.call(this,k,v);if(k==="csh_wallet")__lifeWrites.push(JSON.parse(v));return r;}})()');
 try{
  await page.evaluate('lib.cshWallet.task.add("hands",10);lib.cshWallet.task.add("wins",3);lib.cshWallet.task.add("bigPot",2000)');
  check('first real task day counts three accepted items and one full day',await page.evaluate('lib.cshWallet.task.lifetime().completed===3&&lib.cshWallet.task.lifetime().fullDays===1&&lib.cshWallet.wallet.pc()==='+String(initial+1600)+'&&!lib.cshWallet.wallet.careerUnlocks().entries.task_4'));
  await page.evaluate('__lifeClock+=86400000;lib.cshWallet.task.ensureDay();lib.cshWallet.task.add("hands",10)');
  await until('lib.cshWallet.wallet.careerUnlocks().entries.task_4?.observedAt>0','second-date fourth task unlock');
  const fourth=await page.evaluate('lib.cshWallet.wallet.careerUnlocks().entries.task_4.observedAt');
  check('fourth item and original daily reward share a single real wallet checkpoint',await page.evaluate('(()=>{const w=__lifeWrites.find(w=>w.taskLifetime?.completed===4);return w&&w.pc==='+String(initial+1900)+'&&w.taskLifetime.fullDays===1&&w.dailyTaskSaved.claimed.includes("hands")&&w.careerUnlocks.entries.task_4.observedAt==='+fourth+'})()'));
  check('fourth task is collected before career opens without automatic career payout',await page.evaluate('!document.getElementById("csh-shell-frame")&&!CSH_ACHV.claimed("task_4")&&lib.cshWallet.wallet.pc()==='+String(initial+1900)));
  await page.evaluate('lib.cshWallet.task.add("wins",3);lib.cshWallet.task.add("bigPot",2000)');
  for(let day=3;day<=5;day++)await page.evaluate('__lifeClock+=86400000;lib.cshWallet.task.ensureDay();lib.cshWallet.task.add("hands",10);lib.cshWallet.task.add("wins",3);lib.cshWallet.task.add("bigPot",2000)');
  const life=await page.evaluate('lib.cshWallet.task.lifetime()'),record=await page.evaluate('lib.cshWallet.wallet.careerUnlocks()');
  check('five accepted task days make all nine formerly unreachable keys achievable',life.completed===15&&life.fullDays===5&&keys.every(k=>record.entries[k]?.observedAt>0),{life,keys});
  check('five days pay only the existing daily rewards and no cumulative career reward',await page.evaluate('lib.cshWallet.wallet.pc()')===initial+5*1600&&await page.evaluate(JSON.stringify(keys)+'.every(k=>!CSH_ACHV.claimed(k))'));
  await page.evaluate('lib.cshWallet.task.add("hands",10);lib.cshWallet.pending.retry();lib.cshWallet.pending.retry();lib.cshWallet.flushSave()');
  check('duplicate same-day progress and pending retries count and pay nothing extra',await page.evaluate('lib.cshWallet.task.lifetime().completed===15&&lib.cshWallet.task.lifetime().fullDays===5&&lib.cshWallet.wallet.pc()==='+String(initial+8000)+'&&lib.cshWallet.wallet.careerUnlocks().entries.task_4.observedAt==='+fourth));
  check('host stats expose the exact committed lifetime used by achievement rules',await page.evaluate('lib.cshShell.stats({readOnly:true}).taskCompletedTotal===15&&lib.cshShell.stats({readOnly:true}).taskFullDays===5'));
  await clickElement('document.querySelector(".gb-career")');const f='document.getElementById("csh-shell-frame")',d=f+'.contentDocument';await until(d+'?.querySelectorAll("#ach-grid .ach").length>0','real career loaded');
  if(await page.evaluate('!'+d+'.querySelector(".tab[data-p=ach]").getClientRects().length'))await clickElement(d+'.getElementById("career-nav-toggle")',true);
  await clickElement(d+'.querySelector(".tab[data-p=ach]")',true);await page.evaluate('(()=>{const d='+d+',n=d.getElementById("ach-search");n.value="日课";n.dispatchEvent(new d.defaultView.Event("input",{bubbles:true}))})()');await delay(200);
  await clickElement(d+'.getElementById("ach-filters-toggle")',true);await clickElement(d+'.getElementById("ach-sort")',true);
  for(const [key,code]of [['End',35],['Enter',13]]){await page.send('Input.dispatchKeyEvent',{type:'keyDown',key,windowsVirtualKeyCode:code});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key,windowsVirtualKeyCode:code});}
  await until(d+'.getElementById("ach-sort").value==="recent"','native recent sort');const row=d+'.querySelector(".ach[data-key=task_4]")';await until(row+'?.querySelector(".aclaim")','native cumulative task card');
  check('native cumulative card labels real cross-day condition and observation date',await page.evaluate(row+'.querySelector("strong").textContent==="日课 · 累计 4 项"&&'+row+'.querySelector(".adesc").textContent.includes("跨日累计")&&'+row+'.querySelector(".ach-record-time").textContent.includes("首次记录")&&!'+row+'.querySelector(".aclaim").disabled'));
  const reward=await page.evaluate('CSH_ACHV.byId("task_4").reward');check('old task_4 reward remains unchanged',reward===1800);
  await clickElement(row+'.querySelector(".aclaim")',true);await until('CSH_ACHV.claimed("task_4")','native cumulative claim');const paid=await page.evaluate('lib.cshWallet.wallet.pc()');
  check('native manual cumulative claim pays original reward exactly once',paid===initial+8000+reward);
  await clickElement(row+'.querySelector(".aclaim")',true,true);check('repeated disabled native claim never duplicates the reward',await page.evaluate('lib.cshWallet.wallet.pc()')===paid);
  stage('cumulative-task-claim',{screenshot:await snap('cumulative-task-claim'),lifetime:life,observedAt:fourth,reward,balance:paid});
  await page.evaluate('Storage.prototype.setItem=__lifeOriginalPut;window.Date=__lifeRealDate;lib.cshShell.close("lifetime-reload-test");lib.cshWallet.flushSave()');
  await reloadHost('!!window.lib?.cshWallet&&!!lib.character?.csh_haozhao','whole real host reload after five virtual task dates',20000);
  check('whole host reload keeps accepted lifetime and full-day facts exactly',await page.evaluate('lib.cshWallet.task.lifetime().completed===15&&lib.cshWallet.task.lifetime().fullDays===5'));
  check('reload keeps every exact cumulative qualification time and the manual claim receipt',await page.evaluate('(()=>{const r=lib.cshWallet.wallet.careerUnlocks();return '+JSON.stringify(keys)+'.every(k=>r.entries[k].observedAt==='+JSON.stringify(record.entries)+'[k].observedAt)&&CSH_ACHV.claimed("task_4")&&lib.cshWallet.wallet.pc()==='+paid+'})()'));
  check('reload does not replay accepted cumulative unlock notifications',await page.evaluate('lib.cshUI.achievementState().history.every(r=>!'+JSON.stringify(keys)+'.includes(r.id))'));
  const e=await page.evaluate('({errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})');check('full host cumulative task flow has no runtime error or rejection',!e.errors.length&&!e.rejections.length,e);
 }finally{await page.evaluate('if(window.__lifeOriginalPut)Storage.prototype.setItem=__lifeOriginalPut;if(window.__lifeRealDate)window.Date=__lifeRealDate');}
}
`;
let s=fs.readFileSync(root+'/tools/probe_host_smoke.mjs','utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root='+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));s=s.replace("if(process.argv.includes('--world-layout-410'))","if(process.argv.includes('--task-lifetime-host'))await taskLifetimeHost();else if(process.argv.includes('--world-layout-410'))");const runner=path.join(out,'runner.mjs');fs.writeFileSync(runner,tests+'\n'+s);const child=spawn(process.execPath,[runner,'--task-lifetime-host','--out',out],{stdio:'inherit',windowsHide:true});try{await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{process.exitCode=code||0;resolve()})})}finally{fs.rmSync(runner,{force:true})}
