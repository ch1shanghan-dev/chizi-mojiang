/* Presentation only. Never imports a wallet, writes a reward or acknowledges a receipt. */
export const ACHIEVEMENT_UI_KEY = 'csh_achievement_ui_v1';

export function createAchievementQueue(env) {
    const now=env.now||Date.now, later=env.setTimeout||setTimeout, cancel=env.clearTimeout||clearTimeout;
    let owner,epoch,initialized=false,queue=[],history=[],current=null,overflow=0,used=0,last=0,timer=null,paused=false,destroyed=false,generation=0,displaySeq=0,timerVersion=0;
    const seen=new Map();
    function tell(){if(env.changed)env.changed();}
    function clearTimer(){timerVersion++;if(timer!==null)cancel(timer);timer=null;}
    function arm(ms){clearTimer();const version=timerVersion,g=generation,id=current&&current.displayId;timer=later(()=>{if(version===timerVersion&&g===generation&&current&&current.displayId===id)next();},ms);}
    function reset(){generation++;clearTimer();queue=[];history=[];current=null;overflow=0;used=0;seen.clear();}
    function scope(){
        if(destroyed)return false;
        let s;try{s=env.scope();}catch(e){s=null;}
        if(!s||s.blocked){if(initialized){reset();initialized=false;tell();}return false;}
        if(!initialized||owner!==s.owner||epoch!==s.epoch){reset();owner=s.owner;epoch=s.epoch;initialized=true;tell();}
        return true;
    }
    function pump(){
        if(!scope()||paused||current)return;
        if(queue.length)current=queue.shift();
        else if(overflow){current={summary:true,count:overflow,time:now()};overflow=0;}
        if(!current){tell();return;}
        current.displayId=++displaySeq;tell();arm(current.summary?2600:current.rare===3?3200:2400);
    }
    function next(){clearTimer();if(!scope())return;current=null;pump();}
    function accept(items,options={}){
        if(!scope()||!Array.isArray(items))return 0;
        const kind=options.kind==='claim'?'claim':'unlock',accepted=[];
        for(const row of items.slice(0,1000)){
            if(!row||typeof row.id!=='string'||!/^[\w:-]{1,100}$/.test(row.id)||typeof row.title!=='string'||!row.title.trim())continue;
            const source=row.source==='career'?'career':'pool',key=source+':'+kind+':'+row.id;
            if(seen.has(key))continue;
            const number=n=>Number.isSafeInteger(n)&&n>=0?n:0;
            const item={id:row.id,source,kind,title:row.title.trim().slice(0,100),description:typeof row.description==='string'?row.description.slice(0,400):'',rare:[1,2,3].includes(row.rare)?row.rare:1,pc:number(row.pc),merit:number(row.merit),time:now()};
            seen.set(key,true);accepted.push(item);
        }
        while(seen.size>2000)seen.delete(seen.keys().next().value);
        history=accepted.slice().reverse().concat(history).slice(0,200);
        if(!accepted.length)return 0;
        if(!current&&!queue.length&&!overflow&&now()-last>15000)used=0;
        last=now();let enabled=true;try{enabled=env.enabled()!==false;}catch(e){enabled=false;}
        if(enabled){const ranked=accepted.slice().sort((a,b)=>b.rare-a.rare||b.pc-a.pc);const count=Math.min(3-used,ranked.length);queue.push(...ranked.slice(0,count));used+=count;overflow+=ranked.length-count;pump();}
        tell();return accepted.length;
    }
    function skip(){if(!scope())return;clearTimer();queue=[];current=null;overflow=0;tell();}
    function pause(value){if(destroyed)return;if(!scope()){paused=!!value;clearTimer();return;}paused=!!value;clearTimer();if(!paused){queue=queue.filter(x=>now()-x.time<=30000);if(now()-last>30000)overflow=0;if(current&&now()-current.time>30000)current=null;if(current)arm(1800);else pump();}tell();}
    function snapshot(){scope();return {generation,current:current?{...current}:null,pending:queue.length+(overflow?1:0),overflow,history:history.map(x=>({...x})),paused};}
    return {accept,next,skip,pause,snapshot,check:scope,destroy(){reset();destroyed=true;tell();}};
}

export function createAchievementFeedback(env) {
    const doc=env.document,win=env.window,storage=env.storage;
    let card=null,review=null,reviewBody=null,focusBack=null,guard=null,closed=false,preferenceError='',reviewGeneration=0,lastSoundId=0;
    function preferences(){try{const raw=storage.getItem(ACHIEVEMENT_UI_KEY);if(!raw)return {v:1,enabled:true,reduced:false,sound:false};const p=JSON.parse(raw);if(p.v!==1||['enabled','reduced','sound'].some(k=>typeof p[k]!=='boolean'))throw Error('format');return p;}catch(e){return {v:1,enabled:false,reduced:true,sound:false};}}
    function setPreferences(change){try{const p={...preferences(),...change,v:1},text=JSON.stringify(p);storage.setItem(ACHIEVEMENT_UI_KEY,text);if(storage.getItem(ACHIEVEMENT_UI_KEY)!==text)throw Error('readback');preferenceError='';if(!p.enabled)queue.skip();render();return {ok:true};}catch(e){preferenceError='显示设置未保存，请恢复本机存储后重试';return {ok:false,reason:preferenceError};}}
    const el=(tag,cls,text)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
    function reduced(){return preferences().reduced||!!(win.matchMedia&&win.matchMedia('(prefers-reduced-motion: reduce)').matches);}
    function button(text,fn,label){const b=el('button','csh-ach-action',text);b.type='button';if(label)b.setAttribute('aria-label',label);b.addEventListener('click',fn);return b;}
    function badge(rare){
        const ns='http://www.w3.org/2000/svg',svg=doc.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 64 64');svg.setAttribute('aria-hidden','true');
        const add=(type,attrs)=>{const n=doc.createElementNS(ns,type);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));svg.appendChild(n);};
        add('path',{d:'M16 8h32l-3 37-13 12-13-12z',fill:rare===3?'#653d67':rare===2?'#204a49':'#354331',stroke:'#edd399','stroke-width':2});
        add('path',{d:'M21 14h22l-2 27-9 9-9-9z',fill:'none',stroke:'#bfa469','stroke-width':1});
        add('path',{d:'M32 19l3.8 7.7 8.5 1.3-6.2 6 1.5 8.5-7.6-4-7.6 4 1.5-8.5-6.2-6 8.5-1.3z',fill:'#f1d594',stroke:'#fff0c0','stroke-width':1});
        add('path',{d:'M13 22C5 34 12 48 23 52M51 22c8 12 1 26-10 30',fill:'none',stroke:'#d8bd7b','stroke-width':2});return svg;
    }
    function style(){if(doc.getElementById('csh-ach-feedback-css'))return;const s=el('style');s.id='csh-ach-feedback-css';s.textContent=`
      #csh-ach-feedback,#csh-ach-review{box-sizing:border-box!important;font-family:'Microsoft YaHei','PingFang SC',system-ui,sans-serif!important;color:#f0eadb!important;text-shadow:none!important}
      #csh-ach-feedback * ,#csh-ach-review *{box-sizing:border-box!important;position:static!important;float:none!important;letter-spacing:0!important;text-shadow:none!important}
      #csh-ach-feedback{position:fixed!important;top:max(56px,env(safe-area-inset-top,0px))!important;right:max(12px,env(safe-area-inset-right,0px))!important;width:min(360px,calc(100% - 24px))!important;z-index:${env.z}!important;display:grid!important;grid-template-columns:48px minmax(0,1fr)!important;gap:4px 10px!important;padding:10px 12px!important;border:1px solid #c5a866!important;border-radius:12px!important;background:linear-gradient(115deg,#303627,#191d19 72%)!important;box-shadow:0 8px 24px #0005,inset 0 1px #fff2!important;pointer-events:auto!important;animation:cshAchEnter .2s ease-out!important}
      #csh-ach-feedback[data-rare='2']{border-color:#77b8a5!important;background:linear-gradient(115deg,#1e423b,#171e1d 72%)!important}
      #csh-ach-feedback[data-rare='3']{border-color:#c7a1d0!important;background:linear-gradient(115deg,#49334b,#201c24 72%)!important}
      #csh-ach-feedback[data-reduced='true']{animation:none!important}
      #csh-ach-feedback svg{display:block!important;width:48px!important;height:52px!important;grid-row:1/4!important}
      #csh-ach-feedback .csh-ach-kicker{display:block!important;font-size:var(--csh-lfs-sm,12px)!important;line-height:1.3!important;color:#dac595!important}
      #csh-ach-feedback h3{display:block!important;font-size:var(--csh-lfs-xl,16px)!important;line-height:1.4!important;margin:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;color:#fff0c8!important}
      #csh-ach-feedback p{display:block!important;margin:0!important;font-size:var(--csh-lfs-sm,12px)!important;line-height:1.5!important;color:#d8dfd1!important}
      #csh-ach-feedback .csh-ach-actions{grid-column:1/-1!important;display:flex!important;justify-content:flex-end!important;gap:6px!important}
      #csh-ach-feedback .csh-ach-action,#csh-ach-review button{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:44px!important;padding:6px 12px!important;border-radius:7px!important;border:1px solid #b8a47377!important;background:#ffffff09!important;color:#f0e3bf!important;font:inherit!important;font-size:var(--csh-lfs-md,13px)!important;cursor:pointer!important}
      #csh-ach-feedback button:focus-visible,#csh-ach-review button:focus-visible,#csh-ach-review input:focus-visible{outline:2px solid #ffe2a0!important;outline-offset:1px!important}
      #csh-ach-review{position:fixed!important;inset:0!important;z-index:${env.modal-1}!important;background:#0008!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:12px!important}
      #csh-ach-review .csh-ach-review-card{position:relative!important;display:flex!important;flex-direction:column!important;width:min(680px,100%)!important;max-height:100%!important;min-height:0!important;background:#202823!important;border:1px solid #c3a873!important;border-radius:12px!important;padding:12px!important;box-shadow:0 16px 52px #0008!important}
      #csh-ach-review .csh-ach-review-head{display:flex!important;align-items:center!important;gap:10px!important;flex:none!important}
      #csh-ach-review h2{display:block!important;flex:1!important;font-size:var(--csh-lfs-xl,16px)!important;margin:0!important;line-height:1.4!important;color:#f4e2b8!important}
      #csh-ach-review .csh-ach-preferences{display:flex!important;flex-wrap:wrap!important;gap:10px 16px!important;padding:8px 0!important;flex:none!important}
      #csh-ach-review label{display:flex!important;align-items:center!important;gap:6px!important;min-height:44px!important;font-size:var(--csh-lfs-sm,12px)!important;color:#d6ded3!important}
      #csh-ach-review input{width:18px!important;height:18px!important;appearance:auto!important;accent-color:#d7bc80!important}
      #csh-ach-review .csh-ach-review-list{display:block!important;overflow-y:auto!important;min-height:0!important;padding-right:4px!important;overscroll-behavior:contain!important}
      #csh-ach-review article{display:block!important;padding:10px 0!important;border-top:1px solid #ffffff20!important}
      #csh-ach-review h3{display:block!important;font-size:var(--csh-lfs-lg,14px)!important;margin:0 0 4px!important;color:#f0e3bf!important;overflow-wrap:anywhere!important}
      #csh-ach-review p{display:block!important;font-size:var(--csh-lfs-sm,12px)!important;line-height:1.6!important;margin:0!important;color:#c4cfc5!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important}
      #csh-ach-review .csh-ach-settings-note{display:block!important;min-height:18px!important;margin:0!important;font-size:var(--csh-lfs-sm,12px)!important;color:#dbcfac!important}
      #csh-ach-feedback[data-compact='true']{left:50%!important;right:auto!important;top:2px!important;transform:translateX(-50%)!important;width:min(400px,calc(100% - 24px))!important;grid-template-columns:32px minmax(0,1fr) auto!important;gap:0 6px!important;padding:2px 8px!important;animation:none!important}
      #csh-ach-feedback[data-compact='true'] svg{grid-row:1/3!important;width:32px!important;height:38px!important}
      #csh-ach-feedback[data-compact='true'] .csh-ach-kicker{display:none!important}
      #csh-ach-feedback[data-compact='true'] h3{font-size:var(--csh-lfs-lg,14px)!important}
      #csh-ach-feedback[data-compact='true'] .csh-ach-actions{grid-column:3!important;grid-row:1/3!important;gap:4px!important}
      #csh-ach-feedback[data-compact='true'] .csh-ach-action{padding:4px 8px!important}
      #csh-ach-feedback[data-compact='true'] .csh-ach-next{display:none!important}
      @keyframes cshAchEnter{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
      @media(max-height:340px){#csh-ach-feedback{grid-template-columns:32px minmax(0,1fr) auto!important;gap:2px 6px!important;padding:6px 8px!important}#csh-ach-feedback svg{width:32px!important;height:38px!important;grid-row:1/3!important}#csh-ach-feedback .csh-ach-kicker{display:none!important}#csh-ach-feedback h3{font-size:var(--csh-lfs-lg,14px)!important}#csh-ach-feedback .csh-ach-actions{grid-column:3!important;grid-row:1/3!important;gap:4px!important}#csh-ach-feedback .csh-ach-action{padding:4px 8px!important}#csh-ach-feedback .csh-ach-next{display:none!important}}
      @media(prefers-reduced-motion:reduce){#csh-ach-feedback{animation:none!important}}
    `;(doc.head||doc.documentElement).appendChild(s);}
    const queue=createAchievementQueue({now:env.now,scope:env.scope,enabled:()=>preferences().enabled,setTimeout:env.setTimeout,clearTimeout:env.clearTimeout,changed:()=>render()});
    function removeCard(){if(card){card.remove();card=null;}}
    function words(item){return item.kind==='claim'?'本次到账 +'+item.pc+' CBY'+(item.merit?' / +'+item.merit+' 功勋':''):'奖励待领取 · '+item.pc+' CBY'+(item.merit?' / '+item.merit+' 功勋':'');}
    function render(){
        if(closed)return;
        const state=queue.snapshot();
        if(review&&reviewGeneration!==state.generation){closeReview();return;}
        if(doc.getElementById("csh-ui-confirm")){removeCard();guarding();return;}
        if(review||state.paused||doc.hidden||!state.current||!preferences().enabled){removeCard();guarding();return;}
        if(card&&card.__displayId===state.current.displayId){card.dataset.reduced=String(reduced());card.dataset.compact=String([...doc.querySelectorAll('#csh-dbg-panel,#csh-shell-overlay')].some(n=>n.getClientRects().length>0));guarding();return;}
        removeCard();style();const item=state.current;card=el('section');card.id='csh-ach-feedback';card.__displayId=item.displayId;card.__item=item.id;card.__summaryCount=item.count;card.setAttribute('role','status');card.setAttribute('aria-live','polite');card.dataset.rare=String(item.rare||1);card.dataset.reduced=String(reduced());card.dataset.compact=String([...doc.querySelectorAll('#csh-dbg-panel,#csh-shell-overlay')].some(n=>n.getClientRects().length>0));card.appendChild(badge(item.rare||1));
        card.appendChild(el('span','csh-ach-kicker',item.summary?'反馈已收纳':(item.kind==='claim'?'成就领奖':'成就解锁')+' · '+(item.source==='pool'?['','普通','稀有','史诗'][item.rare]:'生涯')));
        card.appendChild(el('h3','',item.summary?'另有 '+item.count+' 项反馈':item.title));card.appendChild(el('p','',item.summary?'进度与奖励不受动画影响，可查看本次记录。':words(item)));
        const actions=el('div','csh-ach-actions');actions.appendChild(button('详情',()=>openReview(item.summary?null:item)));const next=button('跳过',()=>queue.next());next.classList.add('csh-ach-next');actions.appendChild(next);actions.appendChild(button('收纳',()=>queue.skip(),'收纳全部成就动画，保留记录'));card.appendChild(actions);doc.documentElement.appendChild(card);
        if(!item.summary&&item.displayId!==lastSoundId&&preferences().sound&&env.sound){lastSoundId=item.displayId;try{env.sound();}catch(e){}}
        guarding();
    }
    function guarding(){if(guard!==null){win.clearTimeout(guard);guard=null;}if(!closed&&!doc.hidden&&(review||queue.snapshot().current))guard=win.setTimeout(()=>{queue.check();render();},350);}
    function closeReview(){if(!review)return;review.remove();review=null;reviewBody=null;queue.pause(false);if(focusBack&&focusBack.isConnected)focusBack.focus({preventScroll:true});else if(card&&card.querySelector("button"))card.querySelector("button").focus({preventScroll:true});focusBack=null;}
    function openReview(item){
        if(!queue.check())return false;style();if(review)closeReview();focusBack=doc.activeElement;queue.pause(true);reviewGeneration=queue.snapshot().generation;review=el('div');review.id='csh-ach-review';const box=el('section','csh-ach-review-card');box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label',item?'成就详情':'最近成就反馈');
        const head=el('div','csh-ach-review-head');head.appendChild(el('h2','',item?'成就详情':'最近成就反馈 · 本次运行最多保留200项'));const back=button('返回',closeReview);head.appendChild(back);box.appendChild(head);
        const prefs=el('div','csh-ach-preferences'),note=el('p','csh-ach-settings-note',preferenceError);note.setAttribute('role','status');
        for(const[k,label]of [['enabled','显示解锁与领奖反馈'],['reduced','减少动效'],['sound','成就音效']]){const l=el('label'),input=el('input');input.type='checkbox';input.checked=preferences()[k];input.setAttribute('aria-label',label);input.addEventListener('change',()=>{const old=preferences()[k],r=setPreferences({[k]:input.checked});if(!r.ok)input.checked=old;note.textContent=r.ok?'已保存，仅影响本机显示':r.reason;});l.appendChild(input);l.appendChild(doc.createTextNode(label));prefs.appendChild(l);}box.appendChild(prefs);box.appendChild(note);
        reviewBody=el('div','csh-ach-review-list');const rows=item?[item]:queue.snapshot().history;if(!rows.length)reviewBody.appendChild(el('p','','暂无反馈记录；成就的永久进度与领奖状态仍保存在原成就页。'));
        rows.forEach(row=>{const a=el('article');a.appendChild(el('h3','',(row.kind==='claim'?'已领取 · ':'已解锁 · ')+row.title));a.appendChild(el('p','',row.description));a.appendChild(el('p','',words(row)+' · '+new Date(row.time).toLocaleTimeString()));reviewBody.appendChild(a);});box.appendChild(reviewBody);review.appendChild(box);review.addEventListener('click',e=>{if(e.target===review)closeReview();});doc.documentElement.appendChild(review);back.focus({preventScroll:true});guarding();return true;
    }
    function onKey(e){if(!review||doc.getElementById('csh-ui-confirm'))return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeReview();}else if(e.key==='Tab'){const stops=[...review.querySelectorAll('button,input')].filter(n=>!n.disabled&&n.getClientRects().length);const first=stops[0],last=stops[stops.length-1];if(!review.contains(doc.activeElement)||(e.shiftKey&&doc.activeElement===first)||(!e.shiftKey&&doc.activeElement===last)){e.preventDefault();(e.shiftKey?last:first).focus();}}}
    function visibility(){queue.pause(doc.hidden||!!review);}
    function pageHide(e){if(e&&e.persisted){closeReview();queue.skip();queue.pause(true);}else destroy();}
    function pageShow(e){if(e&&e.persisted)queue.pause(doc.hidden||!!review);}
    function destroy(){if(closed)return;closed=true;if(guard!==null)win.clearTimeout(guard);guard=null;removeCard();if(review)review.remove();review=null;queue.destroy();doc.removeEventListener('keydown',onKey,true);doc.removeEventListener('visibilitychange',visibility);win.removeEventListener('pagehide',pageHide);win.removeEventListener('pageshow',pageShow);}
    doc.addEventListener('keydown',onKey,true);doc.addEventListener('visibilitychange',visibility);win.addEventListener('pagehide',pageHide);win.addEventListener('pageshow',pageShow);visibility();
    return {show:queue.accept,review:()=>openReview(null),skip:queue.skip,preferences,setPreferences,status:queue.snapshot,destroy};
}
