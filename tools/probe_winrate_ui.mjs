// Real module + DOM/CSS in headless Chromium, with fixture data and host stubs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const option=(n,f)=>{const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:f;};
const browser=option('--browser','C:/Program Files/Google/Chrome/Application/chrome.exe');
const source=fs.readFileSync(option('--source',path.join(root,'core/csh_winrate.js')),'utf8').replace(/^import[^\n]*\n/gm,'').replace(/^export default null;.*$/gm,'');
const out=path.resolve(option('--out',path.join(root,'docs/audit/ui')));fs.mkdirSync(out,{recursive:true});
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'csh-winrate-audit-'));
const cases=[{name:'desktop',w:1200,h:820,scale:1},{name:'portrait',w:390,h:844,scale:1},{name:'landscape',w:915,h:412,scale:0.6},{name:'zoom',w:720,h:600,scale:1.5}];
const all=[];
async function capture(htmlPath, screenshot, test) {
  const profile=path.join(tmp,'profile-'+test.name);
  const process=spawn(browser,['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let ws;
  try {
    const portFile=path.join(profile,'DevToolsActivePort');
    for(let n=0;!fs.existsSync(portFile)&&n<150;n++)await new Promise(r=>setTimeout(r,50));
    const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
    const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
    let seq=0;const pending=new Map();
    ws.onmessage=e=>{const data=JSON.parse(e.data);if(data.id){const callback=pending.get(data.id);pending.delete(data.id);data.error?callback?.reject(Error(JSON.stringify(data.error))):callback?.resolve(data.result);}};
    const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
    await send('Emulation.setDeviceMetricsOverride',{width:test.w,height:test.h,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:pathToFileURL(htmlPath).href});
    for(let n=0;n<150;n++){
      const r=await send('Runtime.evaluate',{expression:'document.getElementById("audit-results")?.textContent || ""',returnByValue:true});
      if(r.result.value){
        const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
        fs.writeFileSync(screenshot,Buffer.from(shot.data,'base64'));
        return JSON.parse(r.result.value);
      }
      await new Promise(r=>setTimeout(r,50));
    }
    throw Error('Browser probe timed out');
  } finally {ws?.close();process.kill();}
}
for(const test of cases){
  const html=`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#eee;font-family:sans-serif}html *{animation:none!important;transition:none!important}body{transform:scale(${test.scale});transform-origin:top left}body *{box-sizing:border-box}body{ text-shadow:0 0 18px #f00 } #outside{color:#222} table{table-layout:fixed} div{position:absolute;display:inline-block}</style><body><span id="outside">宿主文字保持原样</span><script>
  const _status={},ui={},ai={};
  const data={identity:{},me:{chars:{},camps:{}},camps:{}};
  const labels=['池子卡尔','池子曹操','长名称武将测试·诸葛亮','池子魔将','刘备','孙权','赵云','张飞','关羽','马超','黄忠','魏延'];
  const translations={};for(let i=0;i<labels.length;i++){const id='csh_fixture_'+i;translations[id]=labels[i];const e={games:10+i,win:8,lose:2+i,damage:30,damaged:20,gain:40,discard:10,kill:5};data.identity[id]=e;data.me.chars[id]=Object.assign({},e);}
  const lib={config:{'extension_池子魔将_winrateData':data},translate:translations};
  const game={players:[],over(){},saveConfig(k,v){lib.config[k]=v;}};
  const get={translation:n=>translations[n]||n,mode:()=> 'identity'};
  const checks=[];const check=(name,ok,detail)=>checks.push({name,passed:!!ok,detail});
  try{
  ${source}
  const outsideBefore=getComputedStyle(document.getElementById('outside')).textShadow;
  lib.csh_winrate.open();
  const q=s=>document.querySelector(s),style=s=>getComputedStyle(q(s));
  check('actual panel opened',!!q('#csh-wr-panel'));
  q('#csh-wr-panel').style.setProperty('animation','none','important');
  q('#csh-wr-overlay').style.setProperty('animation','none','important');
  for(const selector of ['.csh-wr-kpi .v','.csh-wr-kpi .n','.csh-wr-tab.on','#csh-wr-table th.on'])check('clear text '+selector,style(selector).textShadow==='none',style(selector).textShadow);
  check('small helper text at least 12px',parseFloat(style('.csh-wr-kpi .n').fontSize)>=12,style('.csh-wr-kpi .n').fontSize);
  const rgb=style('.csh-wr-kpi .n').color.match(/[0-9.]+/g).map(Number);
  const lum=a=>a.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const contrast=(lum(rgb)+.05)/(lum([43,38,31])+.05);
  check('helper contrast against conservative light panel sample >=4.5',contrast>=4.5,contrast);
  check('outside shadow preserved',outsideBefore===getComputedStyle(q('#outside')).textShadow,outsideBefore);
  check('decorative title shadow retained',style('#csh-wr-title').textShadow!=='none');
  const r=q('#csh-wr-panel').getBoundingClientRect();
  check('panel fits real viewport despite body scaling',r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1,{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight});
  check('mobile card view / desktop table switch',innerWidth<620?style('#csh-wr-cards').display!=='none':style('#csh-wr-table').display!=='none');
  q('[data-act="sort"][data-val="games"]').click();check('sort click changes state',lib.csh_winrate.sortKey==='games');
  q('[data-act="tab"][data-val="me"]').click();check('personal tab click renders',lib.csh_winrate.view==='me'&&!!q('#csh-wr-mytable'));
  q('[data-act="tab"][data-val="list"]').click();
  q('[data-act="close"]').click();check('close removes overlay',!q('#csh-wr-overlay'));
  lib.csh_winrate.open();check('reopen creates one panel',document.querySelectorAll('#csh-wr-panel').length===1);
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));check('Escape closes actual panel',!q('#csh-wr-overlay'));
  lib.csh_winrate.open();
  document.querySelectorAll('*').forEach(n=>n.style.setProperty('animation','none','important'));
  }catch(error){check('runtime error',false,error.stack);}
  const pre=document.createElement('pre');pre.id='audit-results';pre.hidden=true;pre.textContent=JSON.stringify(checks);document.documentElement.appendChild(pre);
  </script>`;
  const htmlPath=path.join(tmp,test.name+'.html');fs.writeFileSync(htmlPath,html);
  const screenshot=path.join(out,'winrate-'+test.name+'.png');
  const checks=await capture(htmlPath,screenshot,test);
  all.push({case:test,checks,screenshot:path.basename(screenshot)});
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({scope:'actual winrate module in Chromium with fixture data; not running Noname',cases:all},null,2)+'\n');
const checks=all.flatMap(c=>c.checks.map(k=>({...k,case:c.case.name}))),failures=checks.filter(c=>!c.passed);
console.log(JSON.stringify({passed:checks.length-failures.length,failed:failures.length,failures,output:out},null,2));process.exitCode=failures.length?1:0;
