// S0: actual module DOM/CSS in isolated Chrome fixtures. Never imports Noname or user saves.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {withChromium} from './lib/chromium_audit.mjs';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const opt=(n,f)=>{const i=process.argv.indexOf(n);return i<0?f:process.argv[i+1];};
const out=path.resolve(opt('--out','D:/noname-audit-backups/chizi-mojiang/20261022-art-rebuild'));
fs.mkdirSync(out,{recursive:true});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'csh-art-s0-'));
const clean=s=>s.replace(/^import .*?;\r?\n/gm,'').replace(/^export default null;.*$/gm,'').replace(/^export /gm,'').replace(/<\/script/gi,'<\\/script');
const read=f=>clean(fs.readFileSync(path.join(root,f),'utf8'));
const common=['core/csh_theme.js','core/csh_uikit.js','core/csh_registry.js','core/csh_games.js'].map(read).join('\n');
const moduleRead=file=>opt('--source-dir')?clean(fs.readFileSync(path.join(opt('--source-dir'),path.basename(file)),'utf8')):read(file);
const sources={debug:moduleRead('core/csh_debug.js'),winrate:moduleRead('core/csh_winrate.js'),interact:moduleRead('core/csh_interact.js'),config:moduleRead('main/config.js')};
const art=process.argv.includes('--art');
const artSource=art?read('core/csh_art.js'):'';
const hostAssetURL=pathToFileURL(path.resolve(root,'../..')+path.sep).href;
const cases=[{name:'desktop',w:1200,h:820,scale:1},{name:'narrow',w:720,h:600,scale:1.5},{name:'portrait',w:390,h:844,scale:1},{name:'landscape',w:915,h:412,scale:.6}];
const results=[];
const checks=[];
for(const test of cases){
  const html=`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#ddd;transform:scale(${test.scale});transform-origin:top left}div{position:absolute;display:inline-block}*{box-sizing:border-box;animation:none!important;transition:none!important}</style><body><script>
  const memory=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k),clear:()=>memory.clear(),key:i=>[...memory.keys()][i]||null,get length(){return memory.size}}});
  window.artNetworkHold=false;window.fetch=()=>window.artNetworkHold?new Promise(()=>{}):Promise.reject(Error('Network disabled in art fixture'));
  const lib={assetURL:${JSON.stringify(hostAssetURL)},config:{'extension_池子魔将_csh_debug_menu':true},arenaReady:[],skill:{fixture_skill:{description:'fixture'}},character:{fixture_char:['male','wei',4,['fixture_skill']]},characterPack:{fixture:{fixture_char:['male','wei',4,['fixture_skill']]}},card:{sha:{type:'basic'}},translate:{fixture_char:'长名称武将·截图夹具',fixture_skill:'夹具技能',fixture_skill_info:'隔离截图用技能描述',sha:'杀',sha_info:'夹具卡牌描述'}};
  let recoverCalls=0,drawCalls=0;
  const player={name:'fixture_char',hp:3,maxHp:4,hujia:1,storage:{},recover(){recoverCalls++},draw(n){drawCalls+=n},getSkills:()=>['fixture_skill'],countCards:()=>2,getCards:()=>[],isAlive:()=>true,isDead:()=>false,isOut:()=>false,isUnderControl:()=>false};
  const game={players:[player],dead:[],me:player,over(){},print(){},saveConfig(k,v){lib.config[k]=v},saveExtensionConfig(k,n,v){lib.config['extension_'+k+'_'+n]=v}};
  const ui={},ai={},_status={},get={translation:v=>typeof v==='string'?lib.translate[v]||v:v?.name||'',is:{online:()=>false},mode:()=> 'identity',type:n=>lib.card[n]?.type||'basic',info:n=>lib.skill[n]||{},attitude:()=>0};
  const EXTRA_LINES={},GEN_LINES={};
  lib.cshShell={open(){return true}};lib.cshWorld={stats:()=>({chars:149,retired:0,fundSum:100000}),tick(){},heartbeat:()=>({changed:false})};
  ${common}
  ${artSource}
  installUIKit();lib.cshShell.META=Object.fromEntries(window.CSH.registry.all().map(k=>[k,window.CSH.registry.get(k)]));
  const data={identity:{},versus:{},doudizhu:{},guozhan:{},me:{chars:{},camps:{}},camps:{}};
  for(let i=0;i<23;i++){let id='fixture_'+i;lib.translate[id]=i===0?'超长名称武将·示例截图夹具':'夹具武将'+i;data.identity[id]={games:10+i,win:8,lose:2+i,damage:30,kill:2,damaged:12,gain:40,discard:10};data.me.chars[id]={...data.identity[id]};}lib.config['extension_池子魔将_winrateData']=data;
  ${sources.debug}
  ${sources.winrate}
  ${sources.interact}
  ${sources.config}
  window.artReady=true;
  </script>`;
  const file=path.join(temp,test.name+'.html');fs.writeFileSync(file,html);
  await withChromium({width:test.w,height:test.h,browser:opt('--browser')},async send=>{
    await send('Page.navigate',{url:pathToFileURL(file).href});
    const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+': '+r.exceptionDetails.exception?.description);return r.result.value;};
    for(let i=0;i<120&&!await run('window.artReady===true');i++)await new Promise(r=>setTimeout(r,40));
    async function snap(name,panel){
      await run(`(async()=>{await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));document.getElementById('csh-ui-toast-root')?.replaceChildren();document.getElementById('csh-dbg-toast-host')?.replaceChildren();document.querySelectorAll('*').forEach(n=>n.style.setProperty('animation','none','important'));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()`);
      const geometry=await run(`(()=>{const p=document.querySelector(${JSON.stringify(panel)});if(!p)return {missing:true};const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};return {panel:rect(p),scroll:{height:p.scrollHeight,client:p.clientHeight},controls:[...p.querySelectorAll('button,input,select,textarea,[role=button],[data-act],.csh-dbg-tab,.csh-dbg-chip,.csh-ia-sw,.csh-ia-seg .it,.csh-ia-btn,.csh-cust-seg .it,.csh-cust-line .del,.csh-cust-add .b,.csh-cust-btn')].map(n=>({tag:n.tagName,id:n.id,cls:n.className,label:n.textContent?.trim().slice(0,90)||n.placeholder||n.title,disabled:!!n.disabled,artVariant:n.getAttribute("data-csh-art-variant"),artAction:n.getAttribute("data-csh-art-action"),role:n.getAttribute('role'),tabindex:n.getAttribute('tabindex'),...rect(n)}))}})()`);
      const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      const filename=test.name+'-'+name+'.png';fs.writeFileSync(path.join(out,filename),Buffer.from(shot.data,'base64'));
      results.push({case:test,name,screenshot:filename,...geometry});
    }
    if(process.argv.includes('--empty-only')){
      await run(`lib.csh_winrate.open();document.querySelector('[data-act="tab"][data-val="list"]').click();document.querySelector('[data-act="mode"][data-val="versus"]').click()`);await snap('winrate-empty-corrected','#csh-wr-panel');checks.push({case:test.name,name:'actual empty list with zero versus records',passed:!!await run(`!!document.getElementById('csh-wr-empty')&&document.querySelector('.csh-wr-empty-t').textContent.includes('暂无')`)});return;
    }
    if(art){
      const check=async(name,expression)=>{const result=await run(expression);checks.push({case:test.name,name,passed:!!result});};
      await run(`window.outsideButton=document.createElement('button');outsideButton.textContent='宿主按钮';document.body.appendChild(outsideButton);window.outsideBefore=[getComputedStyle(outsideButton).minHeight,getComputedStyle(outsideButton).backgroundImage,getComputedStyle(outsideButton).borderImageSource].join('|')`);
      await run('lib.cshDebugMenu.open()');await snap('s3-debug','#csh-dbg-panel');
      await check('debug real icon loaded',`document.querySelector('#csh-dbg-title img')?.naturalWidth>0`);
      await check('debug native raster button',`[...document.querySelectorAll('#csh-dbg-panel button.csh-art-primary')].some(n=>n.textContent==='回满血')`);
      await check('debug click retains recover callback',`(()=>{let n=recoverCalls;[...document.querySelectorAll('#csh-dbg-panel button')].find(n=>n.textContent==='回满血').click();return recoverCalls===n+1})()`);
      await run(`[...document.querySelectorAll('#csh-dbg-panel button')].find(n=>n.textContent==='回满血').focus();window.recoverBeforeKeyboard=recoverCalls`);
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
      await check('debug real Enter retains one callback',`recoverCalls===window.recoverBeforeKeyboard+1`);
      await check('visible decorated buttons have effective >=44 CSS px',`[...document.querySelectorAll('#csh-dbg-panel .csh-art-primary')].filter(n=>n.getClientRects().length).every(n=>{const r=n.getBoundingClientRect();return r.width>=44&&r.height>=44})`);
      await check('resource action labels fit between decorative end caps',`[...document.querySelectorAll('#csh-dbg-panel button')].filter(n=>/^(增加|减少|设置)体力上限/.test(n.textContent)).every(n=>{const r=document.createRange();r.selectNodeContents(n);const s=getComputedStyle(n);return r.getBoundingClientRect().width<=n.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)+.5})`);
      await check('native disabled cannot invoke callback',`(()=>{const b=[...document.querySelectorAll('#csh-dbg-panel button')].find(n=>n.textContent==='回满血');const count=recoverCalls;b.disabled=true;b.click();const ok=recoverCalls===count;b.disabled=false;return ok})()`);
      await check('outside host button has no art CSS changes',`outsideBefore===[getComputedStyle(outsideButton).minHeight,getComputedStyle(outsideButton).backgroundImage,getComputedStyle(outsideButton).borderImageSource].join('|')`);
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      await check('reduced motion removes transitions',`getComputedStyle(document.querySelector('#csh-dbg-panel .csh-art-primary')).transitionDuration==='0s'`);
      await send('Emulation.setEmulatedMedia',{features:[]});
      const hit=await run(`(()=>{const b=[...document.querySelectorAll('#csh-dbg-panel button')].find(n=>n.textContent==='回满血');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:hit.x,y:hit.y});
      await send('Input.dispatchMouseEvent',{type:'mousePressed',x:hit.x,y:hit.y,button:'left',clickCount:1});
      await run(`new Promise(r=>setTimeout(r,160))`);
      await check('actual pointer press sinks button 2px',`getComputedStyle([...document.querySelectorAll('#csh-dbg-panel button')].find(n=>n.textContent==='回满血')).transform==='matrix(1, 0, 0, 1, 0, 2)'`);
      await snap('s3-debug-pressed','#csh-dbg-panel');
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:hit.x,y:hit.y,button:'left',clickCount:1});
      await run(`document.getElementById('csh-dbg-close').click();lib.csh_winrate.open()`);await snap('s3-winrate','#csh-wr-panel');
      await check('statistics icon loaded',`document.querySelector('#csh-wr-title img')?.naturalWidth>0`);
      await check('floating launcher does not obscure statistics rows',`!!document.getElementById('csh-dbg-float-btn')&&getComputedStyle(document.getElementById('csh-dbg-float-btn')).display==='none'`);
      await check('statistics export native and preserves delegate',`(()=>{const b=document.querySelector('#csh-wr-panel [data-act="export"]');const native=b.tagName==='BUTTON';b.click();window.artValidJSON=document.getElementById('csh-wr-io-text').value;return native&&!!document.getElementById('csh-wr-io')})()`);
      await run(`document.querySelector('[data-act="io-close"]').click();document.querySelector('[data-act="tab"][data-val="me"]').click()`);
      await check('statistics rerender reapplies one icon and export',`document.querySelectorAll('#csh-wr-title img').length===1&&document.querySelector('#csh-wr-panel [data-act="export"]').tagName==='BUTTON'`);
      await run(`document.querySelector('[data-act="close"]').click();lib.cshInteract.openPanel()`);await snap('s3-interact','#csh-ia-panel');
      await check('interaction icon loaded',`document.querySelector('#csh-ia-title img')?.naturalWidth>0`);
      await check('floating launcher does not obscure interaction controls',`!!document.getElementById('csh-dbg-float-btn')&&getComputedStyle(document.getElementById('csh-dbg-float-btn')).display==='none'`);
      await check('interaction trial retains no-AI feedback',`(()=>{[...document.querySelectorAll('#csh-ia-panel button')].find(n=>n.textContent==='试 发').click();return document.getElementById('csh-ui-toast-root')?.textContent.includes('场上没有 AI 角色')})()`);
      await check('interaction custom native click opens real editor',`(()=>{const b=[...document.querySelectorAll('#csh-ia-panel button')].find(n=>n.textContent.includes('管理'));b.click();return !!document.getElementById('csh-ia-cust-ov')})()`);
      await run(`(async()=>{document.querySelector('#csh-ia-cust-ov .csh-cust-btn').click();document.querySelector('#csh-ia-panel img').src='file:///missing-csh-art-icon.png';await new Promise(r=>setTimeout(r,80))})()`);
      await check('missing icon keeps heading and controls',`document.getElementById('csh-ia-title').textContent==='AI 局内互动'&&!document.querySelector('#csh-ia-title img')&&!!document.querySelector('#csh-ia-panel button')`);
      await run(`(async()=>{lib.cshInteract.closePanel();lib.assetURL='file:///missing-csh-art/';lib.cshInteract.openPanel();await new Promise(r=>setTimeout(r,80))})()`);
      await check('missing button image retains original readable buttons',`!document.querySelector('#csh-ia-panel .csh-art-primary')&&[...document.querySelectorAll('#csh-ia-panel button')].some(n=>n.textContent==='试 发')`);
      await snap('s3-missing-assets','#csh-ia-panel');
      await run(`lib.cshInteract.closePanel();lib.assetURL=${JSON.stringify(hostAssetURL)}`);
      await check('closing panels restores floating launcher',`!!document.getElementById('csh-dbg-float-btn')&&getComputedStyle(document.getElementById('csh-dbg-float-btn')).display!=='none'`);
      if(process.argv.includes('--full-controls')){
        await run(`lib.cshDebugMenu.open();document.querySelector('[data-tab="res"]').click();[...document.querySelectorAll('#csh-dbg-panel button')].find(n=>n.textContent==='摸牌…').click()`);
        await snap('s4-input-dialog','#csh-dbg-ask');
        await check('input popup buttons receive scoped art',`[...document.querySelectorAll('#csh-dbg-ask button')].every(n=>n.classList.contains('csh-art-primary'))`);
        await run(`document.querySelector('#csh-dbg-ask input').value='2';document.querySelector('#csh-dbg-ask input').focus();window.drawBefore=drawCalls`);
        await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
        await check('native input Enter preserves draw callback',`drawCalls===drawBefore+2&&!document.getElementById('csh-dbg-ask')`);
        await run(`document.querySelector('[data-tab="card"]').click();[...document.querySelectorAll('#csh-dbg-panel button')].find(n=>n.textContent==='打开卡牌检索器…').click()`);
        await snap('s4-card-picker','#csh-pick-panel');
        await run(`document.querySelector('.csh-pick-card').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))`);
        await snap('s4-card-detail','#csh-cardinfo');
        await check('card detail original copy and close decorated',`[...document.querySelectorAll('#csh-cardinfo button')].filter(n=>n.textContent==='复制 ID'||n.textContent==='关闭').length===2&&[...document.querySelectorAll('#csh-cardinfo button')].every(n=>n.classList.contains('csh-art-primary'))`);
        await run(`[...document.querySelectorAll('#csh-cardinfo button')].find(n=>n.textContent==='关闭').click();document.getElementById('csh-pick-ov').__close();document.querySelector('[data-tab="skill"]').click();const input=document.querySelector('#csh-dbg-body input');input.value='夹具';input.dispatchEvent(new Event('input',{bubbles:true}))`);
        await run(`new Promise(r=>setTimeout(r,140))`);await snap('s4-skill-search','#csh-dbg-panel');
        await run(`document.querySelector('#csh-dbg-skill-list .csh-dbg-sk:not(.csh-dbg-ch)').click()`);await snap('s4-skill-detail','#csh-dbg-panel');
        await run(`[...document.querySelectorAll('#csh-dbg-body button')].find(n=>n.textContent==='查看技能代码').click()`);await snap('s4-skill-code','#csh-skillcode');
        await check('code popup original copy action is semantic copy',`[...document.querySelectorAll('#csh-skillcode button')].some(n=>n.textContent==='复制全部'&&n.getAttribute('data-csh-art-action')==='copy')`);
        await run(`[...document.querySelectorAll('#csh-skillcode button')].find(n=>n.textContent==='关闭').click();[...document.querySelectorAll('#csh-dbg-body button')].find(n=>n.textContent.includes('返回列表')).click();[...document.querySelectorAll('#csh-dbg-skill-list .csh-dbg-ch button')].find(n=>n.textContent==='查看').click()`);await snap('s4-character-detail','#csh-dbg-panel');
        await run(`[...document.querySelectorAll('#csh-dbg-body button')].find(n=>n.textContent==='新建空方案').click();document.querySelector('#csh-dbg-ask input').value='美术夹具方案';[...document.querySelectorAll('#csh-dbg-ask button')].find(n=>n.textContent==='确定').click()`);await snap('s4-preset-editor','#csh-dbg-panel');
        await run(`const presetSearchField=document.querySelector('#csh-dbg-body input');presetSearchField.value='夹具';presetSearchField.dispatchEvent(new Event('input',{bubbles:true}));[...document.querySelectorAll('#csh-dbg-body button')].find(n=>n.textContent==='加入').click()`);await snap('s4-preset-joined','#csh-dbg-panel');
        await check('preset add keeps original isolated save path',`JSON.parse(localStorage.getItem('csh_dbg_presets'))[0].skills.includes('fixture_skill')`);
        await run(`[...document.querySelectorAll('#csh-dbg-body button')].find(n=>n.textContent.includes('返回方案列表')).click()`);await snap('s4-preset-list','#csh-dbg-panel');
        await check('preset deletion and overwrite keep danger variants',`[...document.querySelectorAll('#csh-dbg-body button')].filter(n=>n.textContent==='删除'||n.textContent==='覆盖').every(n=>n.getAttribute('data-csh-art-variant')==='danger')`);
        await run(`[...document.querySelectorAll('#csh-dbg-body button')].find(n=>n.textContent==='删除').click()`);await snap('s4-preset-delete-confirm','#csh-dbg-ask');
        await check('original preset confirmation receives danger art',`[...document.querySelectorAll('#csh-dbg-ask button')].find(n=>n.textContent==='1. 确认删除').getAttribute('data-csh-art-variant')==='danger'`);
        await run(`[...document.querySelectorAll('#csh-dbg-ask button')].find(n=>n.textContent==='取消').click()`);await check('preset cancel keeps saved fixture intact',`JSON.parse(localStorage.getItem('csh_dbg_presets')).length===1`);
        await run(`window.artConfirmResult=null;lib.cshUI.confirm({title:'清空确认夹具',message:'只验证取消；不清空真实数据',danger:true},ok=>window.artConfirmResult=ok)`);await snap('s4-danger-confirm','#csh-ui-confirm');
        await check('danger confirmation keeps explicit danger variant',`document.querySelector('#csh-ui-confirm .ok').getAttribute('data-csh-art-variant')==='danger'`);
        await check('danger confirmation retains readable live text',`(()=>{const b=document.querySelector('#csh-ui-confirm .ok');return b.textContent==='确定'&&getComputedStyle(b).color==='rgb(243, 227, 189)'&&getComputedStyle(b).backgroundImage==='none'})()`);
        await run(`document.querySelector('#csh-ui-confirm .csh-ui-cf-btn:not(.ok)').click()`);await check('danger cancel preserves false callback once',`window.artConfirmResult===false&&!document.getElementById('csh-ui-confirm')`);
        await run(`for(let n=0;n<10;n++)document.querySelector('[data-tab="games"]').click()`);await snap('s4-redeem','#csh-redeem');
        await run(`[...document.querySelectorAll('#csh-redeem button')].find(n=>n.textContent==='关闭').click();lib.cshDebug.openExtStore()`);await run(`new Promise(r=>setTimeout(r,160))`);await snap('s4-extension-store','#csh-extstore');
        await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));lib.cshDebug.checkUpdate()`);await run(`new Promise(r=>setTimeout(r,160))`);await snap('s4-update-failed','#csh-update');
        await run(`[...document.querySelectorAll('#csh-update button')].find(n=>n.textContent==='关闭').click();window.artNetworkHold=true;lib.cshDebug.checkUpdate()`);await snap('s4-update-loading','#csh-update');
        await run(`[...document.querySelectorAll('#csh-update button')].find(n=>n.textContent==='关闭').click();window.artNetworkHold=false;document.getElementById('csh-dbg-close').click()`);
        await check('all known popup observers clean on close',`!document.querySelector('#csh-dbg-panel,#csh-ui-confirm,#csh-extstore,#csh-update,#csh-redeem,#csh-cardinfo,#csh-skillcode')`);
        await run(`window.artDataSnapshot=JSON.parse(JSON.stringify(lib.config['extension_池子魔将_winrateData']));lib.csh_winrate.open();document.querySelector('[data-act="import"]').click();const ta=document.getElementById('csh-wr-io-text');ta.value=window.artValidJSON;ta.dispatchEvent(new Event('input',{bubbles:true}))`);await run(`new Promise(r=>setTimeout(r,0))`);await snap('s4-import-valid','#csh-wr-io');
        await check('valid import enables decorated native button after input',`(()=>{const b=document.getElementById('csh-wr-io-ok');return b.tagName==='BUTTON'&&!b.disabled&&!b.classList.contains('dis')&&b.classList.contains('csh-art-primary')})()`);
        await run(`document.getElementById('csh-wr-io-ok').click()`);await check('original import delegate reaches completion in memory fixture',`document.getElementById('csh-wr-io-acts')?.textContent.includes('完 成')`);
        await run(`document.querySelector('[data-act="io-close"]').click();document.querySelector('[data-act="clearall"]').click();const inp=document.getElementById('csh-wr-io-input');inp.value='确认';inp.dispatchEvent(new Event('input',{bubbles:true}))`);await run(`new Promise(r=>setTimeout(r,0))`);await snap('s4-clear-confirm-enabled','#csh-wr-io');
        await check('confirmation input enables native danger button',`(()=>{const b=document.getElementById('csh-wr-io-ok');return !b.disabled&&b.getAttribute('data-csh-art-variant')==='danger'})()`);
        await run(`document.querySelector('[data-act="io-close"]').click();document.querySelector('[data-act="close"]').click();lib.config['extension_池子魔将_winrateData']=window.artDataSnapshot`);
        await run(`const box=document.createElement('div');box.id='art-config-fixture';box.style.cssText='position:fixed;inset:8px;display:flex;flex-direction:column;gap:8px;padding:12px;background:#211a0e;z-index:2147482000';for(const key of ['winrateStats','csh_lobby','csh_interact_panel','csh_debug_menu','csh_check_update','csh_extstore']){const b=document.createElement('button');b.type='button';b.dataset.key=key;b.style.cssText='font:15px sans-serif;color:#e8d9b8;background:#342a1a;border:1px solid #655132;padding:10px;text-align:left;min-height:48px';b.innerHTML=cshConfig[key].name;if(cshConfig[key].onclick)b.addEventListener('click',()=>cshConfig[key].onclick());box.appendChild(b)}document.documentElement.appendChild(box)`);await snap('s4-config-entry-fixture','#art-config-fixture');
        await check('six actual config labels load local art',`[...document.querySelectorAll('#art-config-fixture img')].length===6&&[...document.querySelectorAll('#art-config-fixture img')].every(i=>i.naturalWidth===192)`);
        await run(`document.querySelector('#art-config-fixture [data-key="winrateStats"]').click()`);await check('actual config statistics callback remains wired',`!!document.getElementById('csh-wr-panel')`);await run(`document.querySelector('[data-act="close"]').click();document.querySelector('#art-config-fixture [data-key="csh_interact_panel"]').click()`);await check('actual config interaction callback remains wired',`!!document.getElementById('csh-ia-panel')`);await run(`lib.cshInteract.closePanel();document.querySelector('#art-config-fixture [data-key="csh_lobby"]').click()`);await check('actual world config entry keeps player boundary',`document.getElementById('csh-dbg-title').textContent==='池子世界'&&!document.getElementById('csh-dbg-panel').classList.contains('csh-art-sample')`);await run(`document.getElementById('csh-dbg-close').click();document.getElementById('art-config-fixture').remove()`);
      }
    }
    if(art&&process.argv.includes('--full-controls')){
      await run(`new Promise(r=>setTimeout(r,350))`);await snap('s4-floating-entry','#csh-dbg-float-btn');
      checks.push({case:test.name,name:'floating icon loads and retains pointer hit',passed:!!await run(`(()=>{const b=document.getElementById('csh-dbg-float-btn'),r=b.getBoundingClientRect();return b.querySelector('img').naturalWidth===192&&r.width>=44&&r.height>=44&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b})()`)});
      await run(`document.getElementById('csh-dbg-float-btn').focus()`);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});checks.push({case:test.name,name:'floating Enter preserves original open callback',passed:!!await run(`document.querySelectorAll('#csh-dbg-panel').length===1`)});await run(`document.getElementById('csh-dbg-close').click()`);
    }
    await run(`localStorage.removeItem('csh_dbg_presets');delete lib.config.csh_dbg_presets;lib.cshDebugMenu.open()`);
    for(const tab of ['res','card','skill','scene','state','fx','emote','char','track','diag','games']){
      await run(`document.querySelector('[data-tab="${tab}"]').click()`);await snap('debug-'+tab,'#csh-dbg-panel');
    }
    await run("document.getElementById('csh-dbg-close').click();lib.csh_winrate.open()");
    await snap('winrate-list','#csh-wr-panel');
    for(const view of ['camps','me']){await run(`document.querySelector('[data-act="tab"][data-val="${view}"]').click()`);await snap('winrate-'+view,'#csh-wr-panel');}
    await run(`document.querySelector('[data-act="export"]').click()`);await snap('winrate-export','#csh-wr-io');
    await run(`document.querySelector('[data-act="io-close"]').click();document.querySelector('[data-act="import"]').click()`);await snap('winrate-import-invalid','#csh-wr-io');
    await run(`document.querySelector('[data-act="io-cancel"]').click();document.querySelector('[data-act="clearall"]').click()`);await snap('winrate-clear-disabled','#csh-wr-io');
    await run(`document.querySelector('[data-act="io-close"]').click();document.querySelector('[data-act="tab"][data-val="list"]').click();document.querySelector('[data-act="mode"][data-val="versus"]').click()`);await snap('winrate-empty','#csh-wr-panel');
    if(art)checks.push({case:test.name,name:'empty statistics keeps live text with real icon',passed:!!await run(`document.querySelector('.csh-wr-empty-icon img')?.naturalWidth===192&&document.querySelector('.csh-wr-empty-t').textContent.includes('暂无')`)});
    await run(`document.querySelector('[data-act="close"]').click();lib.cshInteract.openPanel()`);await snap('interact-main','#csh-ia-panel');
    await run(`document.querySelector('#csh-ia-panel .csh-ia-card:last-of-type .csh-ia-btn')?.click();[...document.querySelectorAll('#csh-ia-panel .csh-ia-btn')].find(n=>n.textContent.includes('管理'))?.click()`);await snap('interact-custom-empty','#csh-ia-cust-ov');
    await run(`document.querySelector('#csh-ia-cust-ov input').value='夹具台词，仅存在临时内存';document.querySelector('#csh-ia-cust-ov .csh-cust-add .b').click()`);await snap('interact-custom-filled','#csh-ia-cust-ov');
    await run(`document.querySelector('#csh-ia-cust-ov .csh-cust-btn').click();lib.cshInteract.closePanel();_status.connectMode=true;lib.cshInteract.openPanel()`);await snap('interact-online-disabled','#csh-ia-panel');
  });
}
const report={scope:'Real Chrome DOM/CSS, actual module code with synthetic game/config/translation/data and in-memory localStorage; not Noname game or physical mobile device. No real user saves read/written. Interaction extra line corpora omitted; panel controls intact. Config label fixture uses actual labels/callbacks inside synthetic host rows.',art,checks,art_source_sha256_clean:art?createHash('sha256').update(artSource).digest('hex'):null,source_hashes_clean:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')])),cases:results};
fs.writeFileSync(path.join(out,'art-baseline.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({screenshots:results.length,missing:results.filter(r=>r.missing).map(r=>r.name),passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed),out},null,2));
if(checks.some(c=>!c.passed))process.exitCode=1;
