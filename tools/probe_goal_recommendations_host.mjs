// Independent full-host verification. Only disposable Chromium/IDB/LS; no project mutation.
import fs from'node:fs';import path from'node:path';import{spawn}from'node:child_process';import{pathToFileURL,fileURLToPath}from'node:url';
const opt=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];},root=path.resolve(opt('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'))),out=path.resolve(opt('--out',''));if(!opt('--out')||out.toLowerCase()===root.toLowerCase()||out.toLowerCase().startsWith(root.toLowerCase()+path.sep))throw Error('External --out required');fs.mkdirSync(out,{recursive:true});
const tests=String.raw`
async function independentCareerHost(){
 await page.send('Emulation.setDeviceMetricsOverride',{width:915,height:412,deviceScaleFactor:1,mobile:false});
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshDebug.openLobby();lib.cshWallet.rank.addMerit(25,"isolated goal progress");lib.cshWallet.flushSave();lib.cshShell.open("career");})()');
 const f='document.getElementById("csh-shell-frame")',d=f+'.contentDocument',w=f+'.contentWindow',test=w+'.__careerGoalTest';
 if(await page.evaluate('!!document.querySelector(".csh-fee-go")'))await clickElement('document.querySelector(".csh-fee-go")');
 await until(f+'?.contentDocument?.querySelectorAll("#ach-grid .ach").length>0','actual493 career page');
 if(await page.evaluate('!'+d+'.querySelector(".tab[data-p=ach]").getClientRects().length'))await clickElement(d+'.getElementById("career-nav-toggle")',true);
 await clickElement(d+'.querySelector(".tab[data-p=ach]")',true);await delay(400);
 check('unfinished threshold progress stays visibly below target',await page.evaluate(test+'.progress(0.799,0.8)==="0.799"&&'+test+'.progress(0.8-Number.EPSILON,0.8)==="不足0.8"'));
 const walletBefore=await page.evaluate('localStorage.getItem("csh_wallet")');
 check('tiny unfinished gaps are not displayed as zero',await page.evaluate(test+'.remaining(0.695,0.7)==="不足0.01"'));
 async function key(key,code,vk,modifiers){await page.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:vk,modifiers:modifiers||0});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk,modifiers:modifiers||0});}
 async function state(index){await clickElement(d+'.getElementById("ach-state")',true);await key('Home','Home',36);for(let i=0;i<index;i++)await key('ArrowDown','ArrowDown',40);await key('Enter','Enter',13);await delay(200);}
 async function search(text){await clickElement(d+'.getElementById("ach-search")',true);await key('a','KeyA',65,2);if(text)await page.send('Input.insertText',{text});else await key('Backspace','Backspace',8);await delay(200);}
 const actual=await page.evaluate('(()=>{const t='+test+',G='+w+'.CSHGoals,rows=t.rows();return {count:rows.length,reliable:t.reliable(),expected:G.recommend(rows,[],t.reliable()).map(x=>x.key),shown:[...'+d+'.querySelectorAll(".ach-recommendation")].map(x=>x.closest(".ach").dataset.key)};})()');
 check('real host partial progress produces max3 honest next goals',actual.count===493&&actual.reliable&&actual.expected.length>0&&actual.expected.length<=3&&actual.shown.join(',')===actual.expected.join(','),actual);
 await state(3);
 const subset=await page.evaluate('(()=>{const d='+d+';return {state:d.getElementById("ach-state").value,keys:[...d.querySelectorAll("#ach-grid .ach")].map(n=>n.dataset.key),claims:d.querySelectorAll("#ach-grid .aclaim").length,more:d.getElementById("ach-more").hidden};})()');
 check('native recent target filter shows the bounded unfinished subset',subset.state==='near'&&subset.keys.join(',')===actual.expected.join(',')&&subset.claims===0&&subset.more,subset);
 const metrics=[];
 for(const[width,height]of [[1365,768],[915,412],[844,390],[640,286],[390,844]]){
  await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(300);
  const m=await page.evaluate('('+function(){const d=document.getElementById('csh-shell-frame').contentDocument,b=d.getElementById('body'),g=d.getElementById('ach-grid'),r=g.getBoundingClientRect();return {overflow:d.documentElement.scrollWidth>d.documentElement.clientWidth+2||b.scrollWidth>b.clientWidth+2||g.scrollWidth>g.clientWidth+2,count:g.children.length,buttons:[...g.querySelectorAll('button')].map(n=>n.getBoundingClientRect().height),gridTop:r.top,headerH:d.querySelector('.ach-header').getBoundingClientRect().height,bodyH:b.clientHeight};}.toString()+')()');
  metrics.push({width,height,...m});check('target filter readable without extra header '+width,!m.overflow&&m.count<=3&&m.buttons.every(x=>x>=44)&&m.headerH<=(width<480?100:52),m);stage('career-targets-'+width,{screenshot:await snap('career-targets-'+width)});
 }
 await page.send('Emulation.setDeviceMetricsOverride',{width:915,height:412,deviceScaleFactor:1,mobile:false});await delay(200);
 // Select an actual untouched row, then pin it through the visible button.
 await state(0);
 const chosen=await page.evaluate(test+'.rows().find(x=>!x.done&&!x.claimed&&!x.retired&&x.cur===0&&x.goal>0)');
 await search(chosen.label);await until(d+'.querySelectorAll("#ach-grid .ach").length>0','search real row');
 await clickElement(d+'.querySelector(".ach[data-key='+chosen.key+'] .csh-goal-pin")',true);await search('');await state(3);
 check('native tracked untouched goal becomes a real candidate without inventing progress',await page.evaluate('(()=>{const d='+d+',n=d.querySelector(".ach[data-key='+chosen.key+']");return !!n&&n.textContent.includes("正在追踪")&&n.textContent.includes("0 / ");})()'));
 await clickElement(d+'.getElementById("ach-filters-toggle")',true);
 check('existing tracked bar and new filter share same preference',await page.evaluate(w+'.CSHGoals.list("career").includes('+JSON.stringify(chosen.key)+')&&'+d+'.querySelector("#career-goal-bar .csh-goal-item")!==null'));
 await clickElement(d+'.querySelector("#career-goal-bar button")',true);
 check('native untrack removes zero-progress suggestion and keeps filter',!await page.evaluate(w+'.CSHGoals.list("career").includes('+JSON.stringify(chosen.key)+')')&&await page.evaluate(d+'.getElementById("ach-state").value==="near"&&!'+d+'.querySelector(".ach[data-key='+chosen.key+']")'));
 await clickElement(d+'.getElementById("ach-filters-toggle")',true);
 await search('根本不存在的目标');check('empty search subset explains no current target without fake rows',await page.evaluate(d+'.getElementById("ach-grid").children.length===0&&!'+d+'.getElementById("ach-empty").hidden&&'+d+'.getElementById("ach-empty").textContent.includes("暂无")'));
 await search('');
 // Actual host stats read failure: buildStats catches this and marks snapshot unreliable.
 await page.evaluate('window.__goalStats=lib.cshWorld.stats;lib.cshWorld.stats=function(){throw Error("isolated world read failure")};'+test+'.refresh();');await delay(500);
 check('failed host statistics suppress suggestions and show unavailable state',await page.evaluate('!'+test+'.reliable()&&'+d+'.getElementById("ach-grid").children.length===0&&'+d+'.getElementById("ach-empty").textContent.includes("尚未完整读取")'));
 await page.evaluate('lib.cshWorld.stats=__goalStats;delete window.__goalStats;'+test+'.refresh();');await delay(500);
 check('recovered actual stats restore candidates without touching definitions',await page.evaluate(test+'.reliable()&&'+d+'.querySelectorAll("#ach-grid .ach").length>0&&'+test+'.rows().length===493'));
 const prefsBefore=await page.evaluate('localStorage.getItem("csh_goal_pins_v1")');await state(0);
 await clickElement(d+'.getElementById("ach-filters-toggle")',true);await clickElement(d+'.getElementById("ach-reset")',true);await delay(200);
 check('reset restores normal view and does not clear tracking preferences',await page.evaluate(d+'.getElementById("ach-state").value==="all"&&'+d+'.querySelectorAll("#ach-grid .ach").length===60')&&prefsBefore===await page.evaluate('localStorage.getItem("csh_goal_pins_v1")'));
 check('all recommendation navigation and preference changes leave wallet bytes unchanged',walletBefore===await page.evaluate('localStorage.getItem("csh_wallet")'));
 fs.writeFileSync(path.join(out,'goal-layout-metrics.json'),JSON.stringify(metrics,null,2));
 const e=await page.evaluate('({host:__hostSmoke,frame:'+w+'.__hostSmoke})');check('target host/frame have no runtime errors or unhandled rejections',!e.host.errors.length&&!e.host.rejections.length&&(!e.frame||(!e.frame.errors.length&&!e.frame.rejections.length)),e);
}

`;
let s=fs.readFileSync(root+'/tools/probe_host_smoke.mjs','utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root='+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));s=s.replace("if(process.argv.includes('--world-layout-410'))","if(process.argv.includes('--independent-career-host'))await independentCareerHost();else if(process.argv.includes('--world-layout-410'))");
// Test-only references added to localhost response; installed product is untouched.
const html=fs.readFileSync(root+'/games/career.html','utf8'),i=html.lastIndexOf('})();');if(i<0)throw Error('career IIFE end missing');
const served=html.slice(0,i)+'window.__careerGoalTest={rows:()=>achRows,refresh:renderAch,reliable:()=>achRecommendationsReliable,remaining:achRemaining,progress:achProgress};\n'+html.slice(i);
const route="    const target = resolveReadOnly(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));";
s=s.replace(route,'    if(decodeURIComponent(url.pathname)==="/extension/池子魔将/games/career.html"){item.status=200;res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-cache"});return res.end('+JSON.stringify(served)+');}\n'+route);

const runner=out+'/runner.mjs';fs.writeFileSync(runner,tests+'\n'+s);const c=spawn(process.execPath,[runner,'--independent-career-host','--out',out],{stdio:'inherit',windowsHide:true});await new Promise((resolve,reject)=>{c.once('error',reject);c.once('exit',code=>{process.exitCode=code||0;resolve();});});
