// Independent full-host verification. Only disposable Chromium/IDB/LS; no project mutation.
import fs from'node:fs';import path from'node:path';import{spawn}from'node:child_process';import{pathToFileURL,fileURLToPath}from'node:url';
const opt=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];},root=path.resolve(opt('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'))),out=path.resolve(opt('--out',''));if(!opt('--out')||out.toLowerCase()===root.toLowerCase()||out.toLowerCase().startsWith(root.toLowerCase()+path.sep))throw Error('External --out required');fs.mkdirSync(out,{recursive:true});
const tests=String.raw`
async function independentCareerHost(){
 await page.send('Emulation.setDeviceMetricsOverride',{width:915,height:412,deviceScaleFactor:1,mobile:false});
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshDebug.openLobby();lib.cshWallet.flushSave();localStorage.setItem("csh_career_achv",JSON.stringify({rank_1:1}));})()');
 const f='document.getElementById("csh-shell-frame")',d=f+'.contentDocument';
 const initialBalance=await page.evaluate('lib.cshWallet.wallet.pc()');
 check('world view alone does not initialize career-only observer',await page.evaluate('lib.cshWallet.wallet.careerUnlocks()===null'));
 async function openCareer(){await page.evaluate('lib.cshShell.close("independent-review");lib.cshShell.open("career")');await until(f+'?.contentDocument?.querySelectorAll("#ach-grid .ach").length>0','career actual page');await goTab('ach');await until('lib.cshWallet.wallet.careerUnlocks()?.baseline===true','career baseline');await delay(300);}
 async function request(cmd,data){return page.evaluate('(async()=>{const w='+f+'.contentWindow;return new Promise(resolve=>w.CSHPage.transport({timeout:3000}).call('+JSON.stringify(cmd)+','+JSON.stringify(data)+',(ok,data)=>resolve({ok,data})));})()');}
 async function search(value){await page.evaluate('(()=>{const d='+d+',n=d.getElementById("ach-search");n.value='+JSON.stringify(value)+';n.dispatchEvent(new d.defaultView.Event("input",{bubbles:true}));})()');await delay(150);}
 async function goTab(key){const isHidden=await page.evaluate('!'+d+'.querySelector(".tab[data-p='+key+']").getClientRects().length');if(isHidden)await clickElement(d+'.getElementById("career-nav-toggle")',true);await clickElement(d+'.querySelector(".tab[data-p='+key+']")',true);await until(d+'.querySelector("#p-'+key+'").getClientRects().length>0','actual visible '+key+' panel');}
 async function refreshNative(){await goTab('board');await clickElement(d+'.getElementById("bd-refresh")',true);await delay(400);await goTab('ach');await delay(400);}
 await openCareer();
 let baseline=await page.evaluate('lib.cshWallet.wallet.careerUnlocks()');
 check('initial currently met rich_1000 is historical unknown time',baseline.entries.rich_1000?.observedAt===0,baseline.entries.rich_1000);
 check('legacy paid rank_1 is silently preserved with unknown time',baseline.entries.rank_1?.observedAt===0&&await page.evaluate('CSH_ACHV.claimed("rank_1")'),baseline.entries.rank_1);
 check('baseline neither pays rewards nor creates fresh unlock feedback',await page.evaluate('lib.cshWallet.wallet.pc()')===initialBalance&&await page.evaluate('lib.cshUI.achievementState().history.filter(x=>x.source==="career"&&x.kind==="unlock").length===0'));
 check('rich_3000 starts below threshold and unrecorded',!baseline.entries.rich_3000&&initialBalance<3000);
 await page.evaluate('lib.cshWallet.wallet.add(2000,"isolated independent career threshold");lib.cshWallet.flushSave()');
 const crossedBalance=await page.evaluate('lib.cshWallet.wallet.pc()');check('actual wallet mutation crosses threshold with no reward auto claim',crossedBalance===initialBalance+2000&&!await page.evaluate('CSH_ACHV.claimed("rich_3000")'));
 await refreshNative();
 const afterNative=await page.evaluate('(()=>{const d='+d+';return {record:lib.cshWallet.wallet.careerUnlocks(),balance:lib.cshWallet.wallet.pc(),note:d.getElementById("ach-note").textContent};})()');stage('after-native-refresh',afterNative);
 check('native board refresh and return to career discovers rich_3000',afterNative.record.entries.rich_3000?.observedAt>0,afterNative);
 await until('lib.cshWallet.wallet.careerUnlocks()?.entries.rich_3000?.observedAt>0','actual new first observed time');
 const observedAt=await page.evaluate('lib.cshWallet.wallet.careerUnlocks().entries.rich_3000.observedAt');
 check('new completion persists positive first observed time',Number.isSafeInteger(observedAt)&&observedAt>0);
 check('new career feedback is unlock and reward stays pending',await page.evaluate('lib.cshUI.achievementState().history.filter(x=>x.id==="rich_3000"&&x.source==="career"&&x.kind==="unlock").length===1&&!CSH_ACHV.claimed("rich_3000")&&lib.cshWallet.wallet.pc()')===crossedBalance);
 await page.evaluate('lib.cshWallet.wallet.spend(2000,"isolated independent career wealth drop");lib.cshWallet.flushSave()');
 await refreshNative();await search('资产');
 const dropped=await page.evaluate('(()=>{const d='+d+',n=d.querySelector(".ach[data-key=rich_3000]");return {balance:lib.cshWallet.wallet.pc(),text:n?.textContent,button:!!n?.querySelector(".aclaim:not([disabled])"),bar:n?.querySelector(".aprog i")?.style.width,entry:lib.cshWallet.wallet.careerUnlocks().entries.rich_3000};})()');
 check('actual spending below threshold keeps real UI claimable',dropped.balance===initialBalance&&dropped.button&&dropped.entry.observedAt===observedAt,dropped);
 await clickElement(d+'.querySelector(".ach[data-key=rich_3000] .adetail")',true);
 const note=await page.evaluate(d+'.getElementById("ach-note").textContent');
 check('detail distinguishes first record time from actual current value',note.includes('首次记录于')&&note.includes('达成资格已保留')&&note.includes('2,000'),note);
 stage('wealth-drop-persisted',{screenshot:await snap('wealth-drop-persisted'),observedAt,dropped,note});
 await page.evaluate('lib.cshShell.close("independent-reload");lib.cshWallet.flushSave()');
 await reloadHost('!!window.lib?.cshWallet&&!!lib.character?.csh_haozhao','whole host reload with same disposable profile',20000);
 check('whole host reload retains exact time and wallet balance',await page.evaluate('lib.cshWallet.wallet.careerUnlocks()?.entries.rich_3000?.observedAt')===observedAt&&await page.evaluate('lib.cshWallet.wallet.pc()')===initialBalance);
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshDebug.openLobby();})()');await openCareer();await search('资产');
 check('reopened real UI still provides saved completion claim button',await page.evaluate('!!'+d+'.querySelector(".ach[data-key=rich_3000] .aclaim:not([disabled])")'));
 check('reload does not replay old rich_3000 unlock or auto claim',await page.evaluate('lib.cshUI.achievementState().history.filter(x=>x.id==="rich_3000"&&x.kind==="unlock").length===0&&!CSH_ACHV.claimed("rich_3000")'));
 const reward=await page.evaluate('CSH_ACHV.byId("rich_3000").reward'),beforeClaim=await page.evaluate('lib.cshWallet.wallet.pc()');
 await clickElement(d+'.querySelector(".ach[data-key=rich_3000] .aclaim")',true);await until('CSH_ACHV.claimed("rich_3000")','real native claim');
 check('native single claim pays real reward exactly once',await page.evaluate('lib.cshWallet.wallet.pc()')===beforeClaim+reward&&await page.evaluate('JSON.parse(localStorage.getItem("csh_wallet")).careerClaims.rich_3000===1'));
 const duplicate=await request('shell-ach-claim',{key:'rich_3000'});
 check('duplicate actual bridge claim does not pay again',duplicate.ok&&duplicate.data.already&&await page.evaluate('lib.cshWallet.wallet.pc()')===beforeClaim+reward,duplicate);
 await search('官阶');
 if(await page.evaluate('!!'+d+'.querySelector(".ach[data-key=rank_1] .adetail")')){
  await clickElement(d+'.querySelector(".ach[data-key=rank_1] .adetail")',true);const oldNote=await page.evaluate(d+'.getElementById("ach-note").textContent');check('old paid history shows unknown date instead of 1970/today',oldNote.includes('时间未记录')&&!oldNote.includes('1970'),oldNote);
 }
 stage('native-claim-after-reload',{screenshot:await snap('native-claim-after-reload'),reward,beforeClaim});
 await search('');await delay(300);const sortBefore=await page.evaluate('localStorage.getItem("csh_wallet")');
 await clickElement(d+'.getElementById("ach-filters-toggle")',true);await clickElement(d+'.getElementById("ach-sort")',true);
 await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End',windowsVirtualKeyCode:35});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'End',code:'End',windowsVirtualKeyCode:35});await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await until(d+'.getElementById("ach-sort").value==="recent"','native recent sort');
 const recent=await page.evaluate('(()=>{const d='+d+',key=d.querySelector("#ach-grid .ach").dataset.key,record=lib.cshWallet.wallet.careerUnlocks(),stamp=record.entries[key]?.observedAt;return {key,stamp,max:Math.max(...Object.values(record.entries).map(x=>x.observedAt)),label:d.querySelector("#ach-grid .ach-record-time")?.textContent};})()');
 check('recent sort promotes latest real record without inventing dates',recent.stamp>0&&recent.stamp===recent.max&&recent.label.includes('首次记录')&&!recent.label.includes('1970'),recent);
 await search('官阶');const oldTime=await page.evaluate(d+'.querySelector(".ach[data-key=rank_1] .ach-record-time")?.textContent');check('recent historical entry explicitly has unknown time',oldTime==='历史达成 · 时间未记录',oldTime);
 check('sorting and filtering leave actual wallet and unlock bytes unchanged',sortBefore===await page.evaluate('localStorage.getItem("csh_wallet")'));
 stage('recent-record-sort',{screenshot:await snap('recent-record-sort')});
 const e=await page.evaluate('({host:__hostSmoke,child:document.getElementById("csh-shell-frame").contentWindow.__hostSmoke})');check('independent host and iframe no runtime error/rejection',!e.host.errors.length&&!e.host.rejections.length&&(!e.child||(!e.child.errors.length&&!e.child.rejections.length)),e);
}
`;
let s=fs.readFileSync(root+'/tools/probe_host_smoke.mjs','utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root='+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));s=s.replace("if(process.argv.includes('--world-layout-410'))","if(process.argv.includes('--independent-career-host'))await independentCareerHost();else if(process.argv.includes('--world-layout-410'))");const runner=out+'/runner.mjs';fs.writeFileSync(runner,tests+'\n'+s);const c=spawn(process.execPath,[runner,'--independent-career-host','--out',out],{stdio:'inherit',windowsHide:true});await new Promise((resolve,reject)=>{c.once('error',reject);c.once('exit',code=>{process.exitCode=code||0;resolve();});});
