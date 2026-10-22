// Actual theme, registry, game directory and debug/world UI in headless Chromium.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './lib/skill_audit.mjs';
import {withChromium} from './lib/chromium_audit.mjs';
const option=(n,f)=>{const i=process.argv.indexOf(n);return i<0?f:process.argv[i+1];};
const clean=s=>s.replace(/^import .*?;\r?\n/gm,'').replace(/^export default null;.*$/gm,'').replace(/^export /gm,'').replace(/<\/script/gi,'<\\/script');
const source=clean(fs.readFileSync(option('--source',path.join(root,'core/csh_debug.js')),'utf8'));
const modules=['core/csh_theme.js','core/csh_uikit.js','core/csh_registry.js','core/csh_games.js'].map(f=>clean(fs.readFileSync(path.join(root,f),'utf8'))).join('\n');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'csh-world-entry-'));
const out=option('--out',path.join(root,'docs/audit/ui/world-entry'));fs.mkdirSync(out,{recursive:true});
const cases=[{name:'desktop',w:1200,h:820,scale:1},{name:'portrait',w:390,h:844,scale:1},{name:'landscape',w:915,h:412,scale:0.6},{name:'zoom',w:720,h:600,scale:1.5}];
const all=[];
for(const c of cases){
  const html=`<!doctype html><meta charset="utf-8"><style>body{margin:0;transform:scale(${c.scale});transform-origin:top left}div{position:absolute}*{box-sizing:border-box;animation:none!important;transition:none!important}</style><button id="opener">进入世界</button><script>
    const checks=[],check=(name,ok,detail)=>checks.push({name,passed:!!ok,detail});
    const opens=[];const lib={config:{'extension_池子魔将_csh_debug_menu':false},skill:{},character:{},translate:{},arenaReady:[]};
    const game={players:[],me:null,saveConfig(k,v){lib.config[k]=v;},print(){},over(){}};
    const ui={},ai={},_status={},get={translation:v=>typeof v==='string'?v:v?.name||'',is:{online:()=>false},mode:()=> 'identity'};
    lib.cshShell={open(key){opens.push(key);return true;}};
    lib.cshWorld={stats(){return {chars:149,retired:0,fundSum:100000};},tick(){}};
    ${modules}
    installUIKit();
    lib.cshShell.META=Object.fromEntries(window.CSH.registry.all().map(k=>[k,window.CSH.registry.get(k)]));
    ${source}
    try{
      const opener=document.getElementById('opener');opener.focus();
      lib.cshDebug.openLobby();
      let panel=document.getElementById('csh-dbg-panel');
      check('world opens with developer tools disabled',!!panel);
      if(!panel){lib.config['extension_池子魔将_csh_debug_menu']=true;lib.cshDebug.openLobby();panel=document.getElementById('csh-dbg-panel');}
      if(panel){
        panel.style.setProperty('animation','none','important');
        document.getElementById('csh-dbg-overlay').style.setProperty('animation','none','important');
        check('player title is world',document.getElementById('csh-dbg-title').textContent==='池子世界');
        check('player subtitle survives world rendering',document.getElementById('csh-dbg-sub').textContent==='生涯、成就、牌桌与 AI 世界');
        check('no developer operation tabs in player entry',![...panel.querySelectorAll('.csh-dbg-tab')].some(t=>['资源','卡牌','技能','场景','状态','追踪','诊断'].includes(t.textContent)));
        check('world has dialog semantics',panel.getAttribute('role')==='dialog'&&panel.getAttribute('aria-modal')==='true');
        const cards=[...panel.querySelectorAll('button.csh-dbg-gamebtn')];
        check('all eleven current page/game entries remain available',cards.filter(b=>!b.classList.contains('locked')).length===11,cards.map(b=>b.textContent));
        check('real career entry routes to existing shell',(()=>{cards.find(b=>b.textContent.includes('生涯大厅'))?.click();return opens.includes('career');})());
        const box=panel.getBoundingClientRect();check('panel inside viewport',box.left>=-1&&box.top>=-1&&box.right<=innerWidth+1&&box.bottom<=innerHeight+1,box.toJSON());
        const body=document.getElementById('csh-dbg-body');check('content has vertical scrolling',body.scrollHeight<=body.clientHeight+1||['auto','scroll'].includes(getComputedStyle(body).overflowY));
        const close=document.getElementById('csh-dbg-close');const r=close.getBoundingClientRect();check('close is reachable',r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1);
        const first=panel.querySelector('#csh-dbg-bgm-rd'),last=cards.filter(b=>!b.disabled).at(-1);
        first.focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));
        check('Shift+Tab wraps to last playable entry',document.activeElement===last);
        last.focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
        check('Tab wraps to first world control',document.activeElement===first);
        close.focus();
        lib.cshUI.confirm({title:'子弹窗',message:'验证最上层Esc'},()=>{});
        document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
        check('child confirmation closes without closing world',!!document.getElementById('csh-dbg-overlay')&&!document.getElementById('csh-ui-confirm'));
        close.focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
        check('Escape closes player world',!document.getElementById('csh-dbg-overlay'));
        check('close restores opener focus',document.activeElement===opener);
      }
      document.getElementById('csh-dbg-close')?.click();
      lib.config['extension_池子魔将_csh_debug_menu']=false;
      lib.cshDebugMenu.open();check('developer tools still require their own setting',!document.getElementById('csh-dbg-panel'));
      lib.config['extension_池子魔将_csh_debug_menu']=true;lib.cshDebugMenu.open();
      check('developer entry still has operation tabs',!![...document.querySelectorAll('.csh-dbg-tab')].find(t=>t.textContent==='技能'));
      document.getElementById('csh-dbg-close')?.click();
      _status.connectMode=true;lib.cshDebug.openLobby();check('world keeps online restriction',!document.getElementById('csh-dbg-overlay'));
      _status.connectMode=false;lib.cshDebug.openLobby();
      lib.arenaReady.forEach(fn=>fn());
      const floating=document.getElementById('csh-dbg-float-btn');
      check('developer floating button is hidden over player view',!floating||getComputedStyle(floating).display==='none');
      document.getElementById('csh-dbg-close')?.click();
      check('developer floating button is restored after leaving world',!floating||getComputedStyle(floating).display!=='none');
      lib.cshDebug.openLobby();
      check('reopening world keeps one BGM stylesheet',document.querySelectorAll('#csh-dbg-bgm-css').length===1);
      for(const id of ['csh-dbg-panel','csh-dbg-overlay'])document.getElementById(id)?.style.setProperty('animation','none','important');
      document.getElementById('csh-ui-toast-root')?.replaceChildren();
    }catch(error){check('real UI execution',false,error.stack);}
    const result=document.createElement('pre');result.id='audit-results';result.hidden=true;result.textContent=JSON.stringify(checks);document.documentElement.appendChild(result);
  </script>`;
  const file=path.join(tmp,c.name+'.html');fs.writeFileSync(file,html);
  const result=await withChromium({width:c.w,height:c.h,browser:option('--browser')},async send=>{
    await send('Page.navigate',{url:pathToFileURL(file).href});
    for(let i=0;i<180;i++){
      const r=await send('Runtime.evaluate',{expression:'document.getElementById("audit-results")?.textContent||""',returnByValue:true});
      if(r.result.value){const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,c.name+'.png'),Buffer.from(shot.data,'base64'));return JSON.parse(r.result.value);}
      await new Promise(resolve=>setTimeout(resolve,50));
    }throw Error('world entry browser test timed out');
  });all.push({case:c,checks:result});
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({scope:'actual UI in Chromium with isolated data, not Noname game',cases:all},null,2));
const checks=all.flatMap(c=>c.checks.map(k=>({...k,case:c.case.name}))),failures=checks.filter(c=>!c.passed);
console.log(JSON.stringify({passed:checks.length-failures.length,failed:failures.length,failures,output:out},null,2));process.exitCode=failures.length?1:0;
