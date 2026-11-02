// Installed host with isolated task API events, real career UI claims, disposable storage.
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {pathToFileURL,fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),i=process.argv.indexOf('--out');if(i<0)throw Error('External --out required');const out=path.resolve(process.argv[i+1]);if(out.startsWith(root+path.sep))throw Error('Keep test artifacts outside installation');fs.mkdirSync(out,{recursive:true});
const tests=String.raw`
async function careerTasksHost(){
 await page.send('Emulation.setDeviceMetricsOverride',{width:915,height:412,deviceScaleFactor:1,mobile:false});
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshDebug.openLobby()})()');await until('lib.cshWallet.wallet.careerUnlocks()?.baseline','passive baseline');
 const initial=await page.evaluate('lib.cshWallet.wallet.pc()');
 check('fresh task records start empty without opening a career iframe',await page.evaluate('!document.getElementById("csh-shell-frame")&&!lib.cshWallet.wallet.careerUnlocks().entries.task_1&&lib.cshWallet.task.peek().defs.every(d=>!d.done)'));
 await page.evaluate('(()=>{window.__taskWrites=[];window.__taskWriteFail=true;window.__taskOriginalPut=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==="csh_wallet"&&__taskWriteFail)throw Error("isolated task save failure");const r=__taskOriginalPut.call(this,k,v);if(k==="csh_wallet")__taskWrites.push(JSON.parse(v));return r;};lib.cshWallet.task.add("hands",10)})()');
 check('native task write failure has no reward, permanent qualification or feedback',await page.evaluate('lib.cshWallet.wallet.pc()')===initial&&await page.evaluate('lib.cshWallet.pending.status().count>0&&!lib.cshWallet.wallet.careerUnlocks().entries.task_1&&!lib.cshUI.achievementState().history.some(r=>r.id==="task_1")'));
 await page.evaluate('__taskWriteFail=false;lib.cshWallet.pending.retry()');await until('JSON.parse(localStorage.getItem("csh_wallet")).careerUnlocks?.entries.task_1?.observedAt>0','task recovered with qualification');
 const first=await page.evaluate('lib.cshWallet.wallet.careerUnlocks().entries.task_1.observedAt');
 check('actual first task checkpoint includes its reward and career eligibility in one write',await page.evaluate('(()=>{const w=__taskWrites.find(w=>w.dailyTaskSaved?.claimed?.includes("hands"));return w&&w.pc==='+String(initial+300)+'&&w.careerUnlocks.entries.task_1.observedAt==='+first+'})()'));
 await page.evaluate('lib.cshWallet.pending.retry();lib.cshWallet.pending.retry()');check('pending retry does not duplicate the original task payout',await page.evaluate('lib.cshWallet.wallet.pc()')===initial+300);
 await page.evaluate('lib.cshWallet.task.add("wins",3);lib.cshWallet.task.add("bigPot",2000);Storage.prototype.setItem=__taskOriginalPut');
 const keys=['task_1','task_2','task_3','egg_task_full','egg_full_house'];
 await until(JSON.stringify(keys)+'.every(k=>lib.cshWallet.wallet.careerUnlocks().entries[k]?.observedAt>0)','all five daily achievements');
 const record=await page.evaluate('lib.cshWallet.wallet.careerUnlocks()');
 check('all reachable task achievements are captured before ever opening career',await page.evaluate('!document.getElementById("csh-shell-frame")&&lib.cshWallet.wallet.pc()==='+String(initial+1600)+'&&'+JSON.stringify(keys)+'.every(k=>!CSH_ACHV.claimed(k))'));
 check('unreachable old daily targets are never invented',!record.entries.task_4&&!record.entries.task_15);
 await clickElement('document.querySelector(".gb-career")');const f='document.getElementById("csh-shell-frame")',d=f+'.contentDocument';
 await until(d+'?.querySelectorAll("#ach-grid .ach").length>0','native career achievement document');
 if(await page.evaluate('!'+d+'.querySelector(".tab[data-p=ach]").getClientRects().length'))await clickElement(d+'.getElementById("career-nav-toggle")',true);
 await clickElement(d+'.querySelector(".tab[data-p=ach]")',true);
 await page.evaluate('(()=>{const d='+d+',n=d.getElementById("ach-search");n.value="任务";n.dispatchEvent(new d.defaultView.Event("input",{bubbles:true}))})()');await delay(200);
 await clickElement(d+'.getElementById("ach-filters-toggle")',true);await clickElement(d+'.getElementById("ach-sort")',true);
 for(const [key,code]of [['End',35],['Enter',13]]){await page.send('Input.dispatchKeyEvent',{type:'keyDown',key,windowsVirtualKeyCode:code});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key,windowsVirtualKeyCode:code});}
 await until(d+'.getElementById("ach-sort").value==="recent"','native recently-recorded sort');
 const row=d+'.querySelector(".ach[data-key=task_1]")';await until(row+'?.querySelector(".aclaim")','claimable actual task card');
 check('native career card shows recorded task date and a real claim action',await page.evaluate(row+'.querySelector(".ach-record-time").textContent.includes("首次记录")&&!'+row+'.querySelector(".aclaim").disabled'));
 const reward=await page.evaluate('CSH_ACHV.byId("task_1").reward');await clickElement(row+'.querySelector(".aclaim")',true);
 await until('CSH_ACHV.claimed("task_1")','native manual task claim');const paid=await page.evaluate('lib.cshWallet.wallet.pc()');
 check('actual manual career claim pays its original reward after daily task payout',paid===initial+1600+reward);
 await clickElement(row+'.querySelector(".aclaim")',true,true);check('repeated disabled native claim cannot pay again',await page.evaluate('lib.cshWallet.wallet.pc()')===paid);
 stage('native-task-claim',{screenshot:await snap('native-task-claim')});
 await page.evaluate('lib.cshShell.close("task-reload-test");lib.cshWallet.flushSave()');await reloadHost('!!window.lib?.cshWallet&&!!lib.character?.csh_haozhao','full host reload after accepted task and manual claim',20000);
 check('whole host reload preserves all exact observation times and reward receipt',await page.evaluate('(()=>{const r=lib.cshWallet.wallet.careerUnlocks();return '+JSON.stringify(keys)+'.every(k=>r.entries[k].observedAt==='+JSON.stringify(record.entries)+'[k].observedAt)&&CSH_ACHV.claimed("task_1")&&lib.cshWallet.wallet.pc()==='+paid+'})()'));
 check('reload never replays previous task unlock feedback',await page.evaluate('lib.cshUI.achievementState().history.every(r=>!'+JSON.stringify(keys)+'.includes(r.id))'));
 const e=await page.evaluate('({errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})');check('native task flow has no runtime errors',!e.errors.length&&!e.rejections.length,e);
}
`;
let s=fs.readFileSync(root+'/tools/probe_host_smoke.mjs','utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root='+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));s=s.replace("if(process.argv.includes('--world-layout-410'))","if(process.argv.includes('--career-tasks-host'))await careerTasksHost();else if(process.argv.includes('--world-layout-410'))");const runner=path.join(out,'runner.mjs');fs.writeFileSync(runner,tests+'\n'+s);const c=spawn(process.execPath,[runner,'--career-tasks-host','--out',out],{stdio:'inherit',windowsHide:true});try{await new Promise((resolve,reject)=>{c.once('error',reject);c.once('exit',code=>{process.exitCode=code||0;resolve()})})}finally{fs.rmSync(runner,{force:true})}
