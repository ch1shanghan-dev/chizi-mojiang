import fs from'node:fs';import path from'node:path';import{spawn}from'node:child_process';import{fileURLToPath,pathToFileURL}from'node:url';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];},root=path.resolve(arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'))),out=path.resolve(arg('--out',''));
if(!arg('--out')||out.toLowerCase()===root.toLowerCase()||out.toLowerCase().startsWith(root.toLowerCase()+path.sep))throw Error('Use an external --out');fs.mkdirSync(out,{recursive:true});
const source=arg('--source',root+'/core/csh_achievement_feedback.js');
const {createAchievementQueue}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(source,'utf8')).toString('base64'));
let unit=fs.readFileSync(root+'/tools/probe_achievement_feedback.mjs','utf8');unit=unit.slice(unit.indexOf('const rows=[];'),unit.indexOf('const result={scope:'));
const extra=String.raw`
check('closing a review during a blocked scope can release its pause',()=>{const h=fixture();h.q.accept([item('old')]);h.q.pause(true);h.blocked=true;h.q.snapshot();h.q.pause(false);h.blocked=false;h.q.accept([item('new')]);const s=h.q.snapshot();return !s.paused&&s.current?.id==='new'&&h.timers.size===1;});
check('visibility return during recovery permits later fresh presentation',()=>{const h=fixture();h.q.accept([item()]);h.q.pause(true);h.blocked=true;h.q.pause(false);h.blocked=false;h.q.accept([item('fresh')]);return !h.q.snapshot().paused&&h.q.snapshot().current?.id==='fresh';});
check('blocked hidden scope still retains an explicit background pause',()=>{const h=fixture();h.blocked=true;h.q.pause(true);h.blocked=false;h.q.accept([item('hidden')]);const s=h.q.snapshot();return s.paused&&!s.current&&s.pending===1&&!h.timers.size;});
check('100 review pause/clear/resume cycles do not accumulate timers',()=>{const h=fixture();for(let i=0;i<100;i++){h.q.accept([item('cycle'+i)]);h.q.pause(true);h.q.pause(false);h.q.skip();if(h.timers.size!==0||h.q.snapshot().pending!==0)return false;h.tick(16000);}return h.q.snapshot().history.length===100;});
check('100 save adoptions never mix histories or leave old timers live',()=>{const h=fixture();for(let i=0;i<100;i++){h.q.accept([item('scope'+i)]);h.epoch++;h.q.snapshot();if(h.timers.size||h.q.snapshot().history.length)return false;}return true;});
check('destroyed queue rejects all future accepted and paused work',()=>{const h=fixture();h.q.accept([item()]);h.q.pause(true);h.q.destroy();h.q.pause(false);h.q.accept([item('late')]);h.cancelled.forEach(fn=>fn());return !h.q.snapshot().current&&!h.q.snapshot().pending&&!h.q.snapshot().history.length&&!h.timers.size;});

for(const mode of ['blocked','epoch'])check(mode+' outer background pause survives reentrant close of old review',()=>{
 const timers=new Map(),state={owner:{},epoch:1,blocked:false};let seq=0,closing=false,q;
 q=createAchievementQueue({scope:()=>state,now:()=>100000,enabled:()=>true,setTimeout(fn,ms){timers.set(++seq,{fn,ms});return seq;},clearTimeout:id=>timers.delete(id),changed(){if(closing){closing=false;q.pause(false);}}});
 q.accept([item('old')]);q.pause(true);if(mode==='blocked')state.blocked=true;else state.epoch++;
 closing=true;q.pause(true);state.blocked=false;q.accept([item('hidden-new')]);return q.snapshot().paused&&!q.snapshot().current&&timers.size===0;
});
return {scope:'actual feedback queue with original35 unchanged plus recovery/visibility/100-cycle boundaries; no wallet writes',passed:rows.filter(x=>x.passed).length,failed:rows.filter(x=>!x.passed).length,checks:rows};
`;
const factory=new Function('createAchievementQueue','return (async()=>{'+unit+'\n'+extra+'})()');const result=await factory(createAchievementQueue);fs.writeFileSync(out+'/feedback-lifecycle.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,checks:undefined,failures:result.checks.filter(x=>!x.passed)},null,2));if(result.failed)process.exitCode=1;
if(process.argv.includes('--host')){
const tests=String.raw`
async function feedbackLifecycleHost(){
 await page.send('Emulation.setDeviceMetricsOverride',{width:915,height:412,deviceScaleFactor:1,mobile:false});
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshUI.achievement([{id:"life-normal",title:"生命周期样本",description:"仅测试显示，未达成/领奖",pc:1}]);})()');
 await until('!!document.getElementById("csh-ach-feedback")','feedback card');
 const walletBefore=await page.evaluate('localStorage.getItem("csh_wallet")');
 check('native card begins outside a developer panel',await page.evaluate('document.getElementById("csh-ach-feedback").dataset.compact==="false"'));
 await page.evaluate('lib.cshDebug.openLobby()');await delay(450);
 check('current visible card follows an opened panel into compact header mode',await page.evaluate('document.getElementById("csh-ach-feedback")?.dataset.compact==="true"'));
 await clickElement('document.getElementById("csh-dbg-close")');await delay(450);
 check('current visible card returns to normal mode after panel closes',await page.evaluate('document.getElementById("csh-ach-feedback")?.dataset.compact==="false"'));
 // Recovery during a real shared review must not strand the following scope in paused state.
 await page.evaluate('lib.cshUI.achievementHistory()');
 await page.evaluate('localStorage.setItem("csh_migrate_recovery","{}")');await delay(450);
 check('real recovery closes old review and old presentation',await page.evaluate('!document.getElementById("csh-ach-review")&&!document.getElementById("csh-ach-feedback")&&!lib.cshUI.achievementState().history.length'));
 await page.evaluate('localStorage.removeItem("csh_migrate_recovery");lib.cshUI.achievement([{id:"life-after-recovery",title:"恢复后的新反馈",pc:1}])');await delay(100);
 check('new confirmed display resumes after recovery without reopening app',await page.evaluate('!lib.cshUI.achievementState().paused&&!!document.getElementById("csh-ach-feedback")'));
 stage('feedback-after-recovery',{screenshot:await snap('feedback-after-recovery')});await page.evaluate('lib.cshUI.achievementSkip()');
 // Separate instance of the same actual module, real DOM, own instrumented timers/listeners.
 const audit=await page.evaluate('('+async function(){
  const module=await import('/extension/池子魔将/core/csh_achievement_feedback.js');
  const rows=[],check=(name,passed,detail)=>rows.push({name,passed:!!passed,detail}),timers=new Map(),listeners=new Set(),cancelled=[];let maxTimers=0,maxCards=0,maxReviews=0,clock=100000,hidden=false;const scope={owner:{},epoch:1,blocked:false},store=new Map(),noWalletStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))};
  const set=(fn,ms)=>{const id=window.setTimeout(()=>{timers.delete(id);fn();},ms);timers.set(id,fn);maxTimers=Math.max(maxTimers,timers.size);return id;},clear=id=>{const fn=timers.get(id);if(fn)cancelled.push(fn);timers.delete(id);window.clearTimeout(id);};
  const listen=(target,type,fn,capture)=>{listeners.add(fn);target.addEventListener(type,fn,capture);},unlisten=(target,type,fn,capture)=>{listeners.delete(fn);target.removeEventListener(type,fn,capture);};
  const doc=new Proxy(document,{get(target,key){if(key==='hidden')return hidden;if(key==='addEventListener')return(type,fn,capture)=>listen(target,type,fn,capture);if(key==='removeEventListener')return(type,fn,capture)=>unlisten(target,type,fn,capture);const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
  const win={setTimeout:set,clearTimeout:clear,matchMedia:q=>window.matchMedia(q),addEventListener:(type,fn,capture)=>listen(window,type,fn,capture),removeEventListener:(type,fn,capture)=>unlisten(window,type,fn,capture)};
  const ui=module.createAchievementFeedback({document:doc,window:win,storage:noWalletStorage,scope:()=>scope,now:()=>clock,setTimeout:set,clearTimeout:clear,z:9997,modal:9999});
  const sample=i=>({id:'stress-'+i,title:'循环样本'+i,description:'只测试显示，不产生交易',rare:1,pc:1});
  check('one feedback instance installs exactly four scoped listeners',listeners.size===4,listeners.size);
  for(let i=0;i<100;i++){
   ui.show([sample(i)]);ui.review();maxReviews=Math.max(maxReviews,document.querySelectorAll('#csh-ach-review').length);
   const reduce=document.querySelector('#csh-ach-review input[aria-label="减少动效"]');reduce.click();
   ui.review();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
   maxCards=Math.max(maxCards,document.querySelectorAll('#csh-ach-feedback').length);maxReviews=Math.max(maxReviews,document.querySelectorAll('#csh-ach-review').length);
   ui.skip();clock+=16000;
   if(listeners.size!==4||timers.size||document.getElementById('csh-ach-feedback')||document.getElementById('csh-ach-review'))throw Error('cycle leak at '+i);
  }
  check('100 real DOM reviews toggles and closes retain bounded listeners timers and nodes',listeners.size===4&&timers.size===0&&maxCards===1&&maxReviews===1&&maxTimers<=2,{listeners:listeners.size,timers:timers.size,maxTimers,maxCards,maxReviews});
  check('100 toggles leave one preference value and truthful bounded history',store.size===1&&ui.status().history.length===100,{keys:[...store.keys()],history:ui.status().history.length});
  // Current card metadata should refresh without creating another display or sound.
  ui.show([sample('settings')]);const id=document.getElementById('csh-ach-feedback').__displayId;ui.setPreferences({reduced:true});
  check('changing reduced preference updates same visible card without replacing display',document.getElementById('csh-ach-feedback').dataset.reduced==='true'&&document.getElementById('csh-ach-feedback').__displayId===id);
  ui.review();scope.blocked=true;ui.status();ui.status();scope.blocked=false;ui.show([sample('recovered')]);
  check('instrumented real DOM recovery closes review and resumes new display',!document.getElementById('csh-ach-review')&&!ui.status().paused&&!!document.getElementById('csh-ach-feedback'));
  document.dispatchEvent(new Event('visibilitychange'));hidden=true;document.dispatchEvent(new Event('visibilitychange'));check('background entry removes card and cancels display timer',ui.status().paused&&!document.getElementById('csh-ach-feedback')&&timers.size===0,{timers:timers.size});
  clock+=31000;hidden=false;document.dispatchEvent(new Event('visibilitychange'));check('long background return discards expired animation without deleting history',!ui.status().paused&&!ui.status().current&&ui.status().history.length===1&&!document.getElementById('csh-ach-feedback'));
  ui.show([sample('bfcache-before')]);window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
  check('cache suspension folds animations but retains live instance',ui.status().paused&&!document.getElementById('csh-ach-feedback')&&listeners.size===4);
  window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));ui.show([sample('bfcache-after')]);
  check('cache return accepts a new item without stale replay',!ui.status().paused&&ui.status().current?.id==='stress-bfcache-after'&&document.querySelectorAll('#csh-ach-feedback').length===1);
  ui.review();scope.epoch++;ui.status();check('wallet adoption removes review old cards and history',!document.getElementById('csh-ach-review')&&!document.getElementById('csh-ach-feedback')&&!ui.status().history.length);

  for(const mode of ['blocked','epoch']){
   ui.show([sample('review-background-'+mode)]);ui.review();if(mode==='blocked')scope.blocked=true;else scope.epoch++;
   hidden=true;document.dispatchEvent(new Event('visibilitychange'));scope.blocked=false;ui.show([sample('hidden-'+mode)]);
   check('real DOM '+mode+' old-review close preserves outer hidden pause',ui.status().paused&&!ui.status().current&&timers.size===0&&!document.getElementById('csh-ach-review')&&!document.getElementById('csh-ach-feedback'),{paused:ui.status().paused,current:ui.status().current,timers:timers.size});
   hidden=false;document.dispatchEvent(new Event('visibilitychange'));ui.skip();clock+=16000;
  }
  ui.show([sample('new-save')]);window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));
  check('unload removes all owned DOM listeners and timers',listeners.size===0&&timers.size===0&&!document.getElementById('csh-ach-feedback')&&!document.getElementById('csh-ach-review'),{listeners:listeners.size,timers:timers.size});
  for(const fn of cancelled)fn();ui.show([sample('late')]);ui.review();ui.destroy();
  check('cancelled callbacks and repeated destroy cannot revive DOM or timers',listeners.size===0&&timers.size===0&&!ui.status().current&&!document.getElementById('csh-ach-feedback')&&!document.getElementById('csh-ach-review'));
  for(let i=0;i<100;i++){const next=module.createAchievementFeedback({document:doc,window:win,storage:noWalletStorage,scope:()=>scope,now:()=>clock,setTimeout:set,clearTimeout:clear,z:9997,modal:9999});next.show([sample('instance-'+i)]);next.review();next.destroy();if(listeners.size||timers.size||document.getElementById('csh-ach-feedback')||document.getElementById('csh-ach-review'))throw Error('instance disposal leak '+i);}
  check('100 consecutive creations and destructions release all owned global resources',listeners.size===0&&timers.size===0&&document.querySelectorAll('#csh-ach-feedback,#csh-ach-review').length===0);

  hidden=true;
  const initiallyHidden=module.createAchievementFeedback({document:doc,window:win,storage:noWalletStorage,scope:()=>scope,now:()=>clock,setTimeout:set,clearTimeout:clear,z:9997,modal:9999});
  initiallyHidden.show([sample('initial-hidden')]);const initialState=initiallyHidden.status();
  check('already-hidden document initializes paused without waiting for visibility event',initialState.paused&&!initialState.current&&timers.size===0&&!document.getElementById('csh-ach-feedback'),{paused:initialState.paused,current:initialState.current,timers:timers.size});
  hidden=false;document.dispatchEvent(new Event('visibilitychange'));
  check('initially hidden instance resumes its fresh card upon real foreground event',!initiallyHidden.status().paused&&initiallyHidden.status().current?.id==='stress-initial-hidden'&&!!document.getElementById('csh-ach-feedback'));initiallyHidden.destroy();
  check('same document retains exactly one shared style definition',document.querySelectorAll('#csh-ach-feedback-css').length===1);
  return {rows,maxTimers,maxCards,maxReviews,listeners:listeners.size,timers:timers.size};
 }.toString()+')()');
 for(const row of audit.rows)check(row.name,row.passed,row.detail);fs.writeFileSync(out+'/feedback-dom-lifecycle.json',JSON.stringify(audit,null,2));
 check('all display stress leaves actual wallet bytes unchanged',await page.evaluate('localStorage.getItem("csh_wallet")')===walletBefore);
 const errors=await page.evaluate('({errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})');check('feedback lifecycle full host has no uncaught errors or rejections',!errors.errors.length&&!errors.rejections.length,errors);
}
`;
let s=fs.readFileSync(root+'/tools/probe_host_smoke.mjs','utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root = '+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));
s=s.replace("if(process.argv.includes('--world-layout-410'))","if(process.argv.includes('--feedback-lifecycle'))await feedbackLifecycleHost();\n    else if(process.argv.includes('--world-layout-410'))");
if(arg('--source')){const route="    const target = resolveReadOnly(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));";s=s.replace(route,'    if(decodeURIComponent(url.pathname)==="/extension/池子魔将/core/csh_achievement_feedback.js"){item.status=200;res.writeHead(200,{"Content-Type":"text/javascript; charset=utf-8","Cache-Control":"no-cache"});return res.end(fs.readFileSync('+JSON.stringify(path.resolve(source))+'));}\n'+route);}
const runner=out+'/runner.mjs';fs.writeFileSync(runner,tests+'\n'+s);const child=spawn(process.execPath,[runner,'--feedback-lifecycle','--out',out],{stdio:'inherit',windowsHide:true});await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{if(code)process.exitCode=code;resolve();});});
}
