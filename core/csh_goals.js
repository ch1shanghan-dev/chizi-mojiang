/* Shared, bounded achievement tracking preferences. Rewards remain in host APIs. */
(function(root){
 if(root.CSHGoals)return;var KEY='csh_goal_pins_v1',LIMIT=3;
 function read(){try{var x=JSON.parse(root.localStorage.getItem(KEY)||'{}');return x&&typeof x==='object'&&!Array.isArray(x)?x:{};}catch(e){return {};}}
 function list(kind){var a=read()[kind];return Array.isArray(a)?a.filter(function(x,i){return typeof x==='string'&&/^[\w:-]{1,80}$/.test(x)&&a.indexOf(x)===i;}).slice(0,LIMIT):[];}
 function toggle(kind,id){if(['career','pool'].indexOf(kind)<0||typeof id!=='string'||!/^[\w:-]{1,80}$/.test(id))return {ok:false,reason:'目标无效'};var a=list(kind),at=a.indexOf(id);if(at<0&&a.length>=LIMIT)return {ok:false,reason:'最多同时追踪3项目标，请先取消一项'};if(at<0)a.push(id);else a.splice(at,1);var s=read();s[kind]=a;if(!root.CSHPage||!root.CSHPage.lsSet(KEY,JSON.stringify(s)))return {ok:false,reason:'追踪未保存，请稍后重试'};return {ok:true,pins:a};}
 function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
 function style(){if(document.getElementById('csh-goal-css'))return;var s=el('style');s.id='csh-goal-css';s.textContent='.csh-goal-bar{margin:10px 0;display:grid;gap:8px}.csh-goal-bar[hidden]{display:none}.csh-goal-bar h4{font:inherit;font-weight:700;margin:0}.csh-goal-items{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:8px}.csh-goal-item{border:1px solid var(--line,#4b514c);border-radius:8px;padding:10px;min-width:0}.csh-goal-item strong,.csh-goal-item p{display:block;margin:0 0 5px;line-height:1.5;overflow-wrap:anywhere}.csh-goal-item p{font-size:var(--pfs-sm,12px)}.csh-goal-item progress{width:100%;height:6px}.csh-goal-item button,.csh-goal-pin{font:inherit;min-height:44px;padding:6px 12px;border:1px solid var(--line,#4b514c);border-radius:8px;background:transparent;color:inherit;cursor:pointer}.csh-goal-pin{margin-top:6px}.csh-goal-pin[aria-pressed=true]{border-color:currentColor;font-weight:700}';(document.head||document.documentElement).appendChild(s);}
 function paint(box,kind,rows,onChange){style();var pins=list(kind),chosen=pins.map(function(id){return rows.find(function(r){return r.id===id;});}).filter(Boolean);box.textContent='';box.className='csh-goal-bar';box.hidden=!chosen.length;if(!chosen.length)return;box.appendChild(el('h4','','正在追踪 · '+chosen.length+'/'+LIMIT));var grid=el('div','csh-goal-items');chosen.forEach(function(r){var item=el('article','csh-goal-item');item.appendChild(el('strong','',r.label));item.appendChild(el('p','',r.description));var bar=el('progress');bar.max=Math.max(1,Number(r.target)||1);bar.value=Math.max(0,Number(r.current)||0);bar.setAttribute('aria-label',r.label+'进度');item.appendChild(bar);item.appendChild(el('p','',r.claimed?'已领取':r.done?'已达成，可领取':String(r.current)+' / '+String(r.target)));var remove=el('button','','取消追踪');remove.type='button';remove.addEventListener('click',function(){var result=toggle(kind,r.id);if(result.ok)onChange();else{var note=el("p","",result.reason);note.setAttribute("role","status");item.appendChild(note);}});item.appendChild(remove);grid.appendChild(item);});box.appendChild(grid);}
 function button(kind,id,label,onChange,notify){var b=el('button','csh-goal-pin');b.type='button';function sync(){var on=list(kind).indexOf(id)>=0;b.textContent=on?'取消追踪':'追踪目标';b.setAttribute('aria-pressed',String(on));b.setAttribute('aria-label',label+' · '+b.textContent);}sync();b.addEventListener('click',function(){var result=toggle(kind,id);if(!result.ok){if(notify)notify(result.reason);return;}sync();onChange();});return b;}
 /* Presentation-only candidates: actual partial progress, one next milestone per route.
    Caller supplies pins/reliability; no storage, reward or definition mutation here. */
 function recommend(rows,pins,reliable){
  if(reliable!==true||!Array.isArray(rows))return [];
  pins=Array.isArray(pins)?pins:[];
  var items=[],seen=Object.create(null);
  rows.forEach(function(row,index){
   if(!row||typeof row.key!=="string"||!row.key||seen[row.key]||row.done||row.claimed||row.retired||!Number.isFinite(row.cur)||!Number.isFinite(row.goal)||row.cur<0||row.goal<=0||row.cur>=row.goal)return;
   seen[row.key]=true;
   var pin=pins.indexOf(row.key);if(row.cur===0&&pin<0)return;
   items.push({row:row,index:index,pin:pin,family:row.key.replace(/_[0-9]+(?:\.[0-9]+)?$/,""),ratio:row.cur/row.goal});
  });
  var selected=[],families=Object.create(null),cats=Object.create(null);
  function add(item){if(selected.length>=LIMIT||families[item.family])return false;selected.push(item.row);families[item.family]=true;cats[item.row.cat||""]=true;return true;}
  items.filter(function(x){return x.pin>=0;}).sort(function(a,b){return a.pin-b.pin;}).forEach(add);
  items.sort(function(a,b){return b.ratio-a.ratio||a.index-b.index;});
  items.forEach(function(item){if(!cats[item.row.cat||""])add(item);});
  items.forEach(add);
  return selected;
 }
 root.CSHGoals={KEY:KEY,list:list,toggle:toggle,paint:paint,button:button,recommend:recommend};
})(typeof window!=='undefined'?window:globalThis);
