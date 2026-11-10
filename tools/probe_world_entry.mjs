import { auditTempRoot, removeAuditScratch, disposeAuditBrowser } from './lib/audit_scratch.mjs';
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
const modules=['core/csh_theme.js','core/csh_uikit.js','core/csh_registry.js','core/csh_games.js','core/csh_world_view.js','core/csh_room.js'].map(f=>clean(fs.readFileSync(path.join(root,f),'utf8'))).join('\n');
const tmp=fs.mkdtempSync(path.join(auditTempRoot(),'csh-world-entry-'));
process.once("exit",()=>{try{removeAuditScratch(tmp);}catch(e){console.warn("Audit cleanup:",e.message);}});
const out=option('--out',path.join(root,'docs/audit/ui/world-entry'));fs.mkdirSync(out,{recursive:true});
const cases=[{name:'desktop',w:1200,h:820,scale:1},{name:'portrait',w:390,h:844,scale:1},{name:'landscape',w:915,h:412,scale:0.6},{name:'zoom',w:720,h:600,scale:1.5}];
const all=[];
for(const c of cases){
  const html=`<!doctype html><meta charset="utf-8"><style>body{margin:0;transform:scale(${c.scale});transform-origin:top left}div{position:absolute}*{box-sizing:border-box;animation:none!important;transition:none!important}</style><button id="opener">进入世界</button><script>
    const checks=[],check=(name,ok,detail)=>checks.push({name,passed:!!ok,detail});
    const opens=[],charges=[];let walletPc=100000,settledRoomId='';
    const lib={config:{'extension_池子魔将_csh_debug_menu':false},skill:{},character:{},translate:{},arenaReady:[]};
    const game={players:[],me:null,saveConfig(k,v){lib.config[k]=v;},print(){},over(){}};
    const ui={},ai={},_status={},get={translation:v=>typeof v==='string'?v:v?.name||'',is:{online:()=>false},mode:()=> 'identity'};
    lib.cshShell={open(key){opens.push(key);return true;},charge(key,buyIn){charges.push({key,buyIn});return true;}};
    lib.cshWorld={stats(){return {chars:149,retired:0,fundSum:100000};},tick(){}};
    lib.cshWallet={wallet:{pc(){return walletPc;},roomReceipt(){return {id:settledRoomId,credited:0,t:0};}},
      roomReceipt(){return {id:settledRoomId,credited:0,t:0};},flushSave(){return true;}};
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
        /* 焦点环绕：产品 csh_debug.js 用 panel 下所有可聚焦且可见元素的首尾做环绕。
           旧断言写死 first=#csh-dbg-bgm-rd、last=最后一个 gamebtn，DOM 变化后首尾已不同，
           于是 4 个 viewport 全报假红。这里改用与产品完全相同的 stops 选择器，
           并额外断言首尾都存在且不同——强度只增不减。 */
        const stops=[...panel.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(n=>!n.disabled&&n.getClientRects().length);
        const first=stops[0],last=stops.at(-1);
        check('focus ring has distinct reachable first and last controls',stops.length>2&&!!first&&!!last&&first!==last,stops.length);
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
      /* ---- 上次未完成牌桌卡片（B2）：只读判定、不打断进场、点击不二次扣款 ---- */
      function seedResume(){
        localStorage.removeItem(window.CSHRoom.KEY);
        window.CSHRoom.prepare(localStorage,{id:'room-resume-1',table:'blackjack',amount:20000,balanceBefore:120000,t:1700000000000,shot:null});
        return window.CSHRoom.activate(localStorage,'room-resume-1',{buyIn:20000,s:{shoe:[9,13,17,21],hands:[{cards:[25,29]}]}});
      }
      function reopen(){
        const c=document.getElementById('csh-dbg-close');if(c)c.click();
        lib.cshDebug.openLobby();
        for(const id of ['csh-dbg-panel','csh-dbg-overlay'])document.getElementById(id)?.style.setProperty('animation','none','important');
      }
      localStorage.removeItem(window.CSHRoom.KEY);reopen();
      check('no pending room keeps world free of resume card',!document.getElementById('csh-resume-card'));
      walletPc=100000;settledRoomId='';
      const seeded=seedResume(),rawBefore=localStorage.getItem(window.CSHRoom.KEY),seededPhase=rawBefore&&JSON.parse(rawBefore).phase;
      check('real CSHRoom fixture produces an active room',seeded.ok===true&&seededPhase==='active'&&!!rawBefore,{seeded,seededPhase});
      reopen();
      const card=document.getElementById('csh-resume-card');
      check('pending room shows exactly one resume card at world entry',!!card&&document.querySelectorAll('#csh-resume-card').length===1);
      check('card names the real table and buy-in',!!card&&card.textContent.includes('廿一点')&&card.textContent.includes('2.00 万'),card&&card.textContent);
      check('card is read-only (room record untouched)',localStorage.getItem(window.CSHRoom.KEY)===rawBefore);
      check('resume card does not replace any of the 11 world entries',document.querySelectorAll('button.csh-dbg-gamebtn:not(.locked)').length===11);
      const rb=document.getElementById('csh-resume-btn'),rbox=rb&&rb.getBoundingClientRect();
      check('resume button is touch sized and inside viewport',!!rbox&&rbox.height>=44&&rbox.left>=-1&&rbox.right<=innerWidth+1,rbox&&rbox.toJSON());
      charges.length=0;if(rb)rb.click();
      check('click routes to existing shell charge with no second entry fee',charges.length===1&&charges[0].key==='blackjack'&&charges[0].buyIn===20000,charges);
      check('click never writes the room record',localStorage.getItem(window.CSHRoom.KEY)===rawBefore);
      walletPc=120000;reopen();
      check('unpersisted charge (discard) shows no card',!document.getElementById('csh-resume-card'));
      walletPc=100000;settledRoomId='room-resume-1';reopen();
      check('already settled room shows no card',!document.getElementById('csh-resume-card'));
      settledRoomId='';localStorage.removeItem(window.CSHRoom.KEY);reopen();
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
      if(r.result.value){
        const rows=JSON.parse(r.result.value);
        const returns=await send('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
          const checks=[],check=(name,passed,detail)=>checks.push({name,passed,detail});
          const body=document.getElementById('csh-dbg-body');body.scrollTop=140;const before=body.scrollTop;
          const beforeSections=body.querySelectorAll('.csh-world-section').length;
          const beforeCards=body.querySelectorAll('button.csh-dbg-gamebtn:not(.locked)').length;
          const shell=document.createElement('div');shell.id='csh-shell-overlay';document.documentElement.appendChild(shell);
          await new Promise(r=>setTimeout(r,0));
          lib.cshWorld.stats=()=>({chars:149,retired:1,fundSum:200000});shell.remove();
          await new Promise(r=>setTimeout(r,0));
          check('return from shell refreshes world card summary',body.querySelector('.gb-career').textContent.includes('在场 148 人')&&body.querySelector('.gb-career').textContent.includes('20.00 万'));
          check('return refresh preserves directory scroll',Math.abs(body.scrollTop-before)<2);
          const afterSections=body.querySelectorAll('.csh-world-section').length,afterCards=body.querySelectorAll('button.csh-dbg-gamebtn:not(.locked)').length;
          check('all task groups survive refresh',beforeSections>0&&beforeCards>0&&afterSections===beforeSections&&afterCards===beforeCards,{beforeSections,beforeCards,afterSections,afterCards});
          const overlay=document.getElementById('csh-dbg-overlay');
          check('world return observer belongs to overlay',!!overlay.__worldObserver);
          document.getElementById('csh-dbg-close').click();
          check('closing world removes its only overlay',!document.getElementById('csh-dbg-overlay'));
          lib.cshDebug.openLobby();
          document.getElementById('csh-dbg-body').scrollTop=0;
          for(const id of ['csh-dbg-panel','csh-dbg-overlay'])document.getElementById(id)?.style.setProperty('animation','none','important');
          return checks;
        })()`});
        rows.push(...returns.result.value);
        const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,c.name+'.png'),Buffer.from(shot.data,'base64'));return rows;
      }
      await new Promise(resolve=>setTimeout(resolve,50));
    }throw Error('world entry browser test timed out');
  });all.push({case:c,checks:result});
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({scope:'actual UI in Chromium with isolated data, not Noname game',cases:all},null,2));
const checks=all.flatMap(c=>c.checks.map(k=>({...k,case:c.case.name}))),failures=checks.filter(c=>!c.passed);
console.log(JSON.stringify({passed:checks.length-failures.length,failed:failures.length,failures,output:out},null,2));process.exitCode=failures.length?1:0;
