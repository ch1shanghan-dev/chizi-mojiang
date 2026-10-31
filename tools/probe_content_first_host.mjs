// Actual host and pages, disposable browser profile/IDB; no remote service or player save.
import fs from'node:fs';import path from'node:path';import{spawn}from'node:child_process';import{fileURLToPath,pathToFileURL}from'node:url';
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1];},root=arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')),out=arg('--out');if(!out)throw Error('Use external --out');fs.mkdirSync(out,{recursive:true});
const tests=String.raw`
const contentMetrics=[];
async function contentFirst(){
 const baseline=process.argv.includes('--baseline');
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshWallet.wallet.add(100000,"isolated UI fixture");lib.cshWallet.flushSave();lib.cshDebug.openLobby();})()');
 async function metric(kind,w,h){if(kind.startsWith("career"))await page.evaluate('document.getElementById("csh-shell-frame").contentDocument.getElementById("body").scrollTop=0');const x=await page.evaluate('('+function(kind){
  kind=kind.startsWith('career')?'career':kind;const frame=document.getElementById('csh-shell-frame'),d=kind==='career'?frame.contentDocument:document;
  const wrap=d.querySelector(kind==='career'?'#body':'#csh-dbg-body'),main=d.querySelector(kind==='career'?'#ach-grid':kind==='world'?'.csh-world-columns':'#csh-dbg-body'),r=wrap.getBoundingClientRect(),m=main.getBoundingClientRect();
  const fh=kind==='career'?frame.clientHeight:innerHeight,fw=kind==='career'?frame.clientWidth:innerWidth;
  const top=Math.max(0,r.top,m.top),bottom=Math.min(fh,r.bottom,m.bottom),left=Math.max(0,r.left,m.left),right=Math.min(fw,r.right,m.right);
  const blocked=kind==='career'?[...d.querySelectorAll('.ach-controls input,.ach-controls select,.ach-controls button,#ach-claim-all')].filter(n=>{const a=n.getBoundingClientRect(),p=frame.getBoundingClientRect();return document.elementFromPoint(p.x+a.x+a.width/2,p.y+a.y+a.height/2)!==frame;}).map(n=>n.id):[];
  return {blocked,width:fw,height:fh,top,visibleHeight:Math.max(0,bottom-top),heightRatio:Math.max(0,bottom-top)/fh,widthRatio:Math.max(0,right-left)/fw,overflow:wrap.scrollWidth>wrap.clientWidth+2,headerHeight:kind==='career'?d.querySelector('.ach-header').getBoundingClientRect().height:d.querySelector('#csh-dbg-head').getBoundingClientRect().height,visibleItems:[...d.querySelectorAll(kind==='career'?'.ach':kind==='world'?'.csh-dbg-gamebtn':'button')].filter(e=>{const a=e.getBoundingClientRect();return a.bottom>top&&a.top<bottom&&a.width>0;}).length};
 }.toString()+')('+JSON.stringify(kind)+')');contentMetrics.push({kind,w,h,...x});stage(kind+'-'+w+'x'+h,{metric:x,screenshot:await snap(kind+'-'+w+'x'+h)});check(kind+' no horizontal overflow '+w+'x'+h,!x.overflow,x);if(!baseline)check(kind+' content has priority '+w+'x'+h,x.heightRatio>=(h<320?.5:kind.startsWith('career')?.65:kind==='world'?.65:.7),x);if(!baseline&&kind.startsWith('career'))check(kind+' native controls are clear of host wallet/close '+w+'x'+h,!x.blocked.length,x);return x;}
 for(const[w,h]of [[1366,768],[915,412],[844,390],[640,286]]){
  await page.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});
  await page.evaluate('lib.cshShell.close("ui-test");lib.cshDebug.openLobby()');await delay(350);await metric('world',w,h);
  await page.evaluate('lib.cshDebugMenu.open()');await delay(250);await metric('debug',w,h);
  await page.evaluate('lib.cshShell.open("career")');await until('document.getElementById("csh-shell-frame")?.contentDocument?.querySelector("#ach-grid .ach")','actual achievements');
  await clickElement('document.getElementById("csh-shell-frame").contentDocument.querySelector(".tab[data-p=ach]")',true);await metric('career',w,h);
 }
 if(!baseline){
  await page.send('Emulation.setDeviceMetricsOverride',{width:915,height:412,deviceScaleFactor:1,mobile:false});await delay(250);
  const f='document.getElementById("csh-shell-frame")',d=f+'.contentDocument';
  check('filters start folded and bulk claim stays in its own operation area',await page.evaluate('(()=>{var d='+d+';return d.getElementById("ach-refinements").hidden&&getComputedStyle(d.getElementById("ach-claim-all")).position==="static";})()'));
  await clickElement(d+'.getElementById("ach-filters-toggle")',true);
  check('filter panel opens with categories, ordering and tracking available',await page.evaluate('(()=>{var d='+d+';return !d.getElementById("ach-refinements").hidden&&d.querySelectorAll("#ach-cats button").length>1&&!!d.getElementById("ach-sort");})()')!==false);
  await page.evaluate('(()=>{var f='+f+';var input=f.contentDocument.getElementById("ach-search");input.value="不存在的筛选测试";input.dispatchEvent(new f.contentWindow.Event("input",{bubbles:true}));})()');await delay(300);
  check('search still reports an empty filtered result without deleting achievements',await page.evaluate('!'+d+'.getElementById("ach-empty").hidden&&'+d+'.querySelectorAll("#ach-grid .ach").length===0'));
  await clickElement(d+'.getElementById("ach-reset")',true);await delay(250);
  check('reset restores achievement cards',await page.evaluate(d+'.querySelectorAll("#ach-grid .ach").length>0'));
  await clickElement(d+'.getElementById("ach-filters-toggle")',true);
  for(let i=0;i<3;i++)await clickElement(d+'.querySelectorAll("#ach-grid .csh-goal-pin")['+i+']',true);
  const pins=await page.evaluate(f+'.contentWindow.CSHGoals.list("career")');
  check('three actual tracking preferences persist inside the optional panel',pins.length===3&&await page.evaluate(d+'.getElementById("ach-refinements").hidden&&'+d+'.querySelectorAll("#career-goal-bar .csh-goal-item").length===3'));
  await metric('career-tracked',915,412);
  await clickElement(d+'.getElementById("ach-filters-toggle")',true);await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await delay(200);
  check('Escape folds optional filters before closing the career page',await page.evaluate('!!'+f+'&&'+d+'.getElementById("ach-refinements").hidden&&'+d+'.activeElement.id==="ach-filters-toggle"'));
  await page.evaluate('lib.cshShell.close("ui-test");lib.cshDebug.openLobby()');await delay(250);
  await clickElement('document.getElementById("csh-dbg-settings-toggle")');
  check('header settings reveals existing volume and skin controls',await page.evaluate('document.getElementById("csh-dbg-panel").classList.contains("csh-head-settings-open")&&!!document.getElementById("csh-dbg-bgm-rd")&&!!document.getElementById("csh-dbg-skin")'));
  await clickElement('document.getElementById("csh-dbg-settings-toggle")');
  check('header settings closes without losing world actions',await page.evaluate('!document.getElementById("csh-dbg-panel").classList.contains("csh-head-settings-open")&&document.querySelectorAll(".csh-dbg-gamebtn").length===11'));
 }
 const errors=await page.evaluate('({errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})');check('content-first host no runtime errors or rejection',!errors.errors.length&&!errors.rejections.length,errors);
 fs.writeFileSync(path.join(out,'content-metrics.json'),JSON.stringify({baseline,metrics:contentMetrics},null,2));
}
`;
let source=fs.readFileSync(root+'/tools/probe_host_smoke.mjs','utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root = '+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));
source=source.replace("if(process.argv.includes('--world-layout-410'))","if(process.argv.includes('--content-first'))await contentFirst();\n    else if(process.argv.includes('--world-layout-410'))");
const runner=path.join(out,'isolated-content-runner.mjs');fs.writeFileSync(runner,tests+'\n'+source);const child=spawn(process.execPath,[runner,'--content-first',...(process.argv.includes('--baseline')?['--baseline']:[]),'--out',out],{stdio:'inherit',windowsHide:true});await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{process.exitCode=code||0;resolve();});});
