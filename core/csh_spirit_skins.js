/* Cosmetic-only spirit skins. Unlocks are wallet-backed entitlements, never combat state. */
(function(root){
 'use strict';
 const KEY='csh_spirit_skin_v1',VERSION=2,PRICE=10000,catalogs=new Map(),validSkin=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,60}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id);
 function spiritId(id){if(typeof id!=='string')return null;id=id.replace(/^csh_aux_/,'csh_boss_minion_');return /^csh_boss_minion_[a-z0-9_]{1,50}$/.test(id)?id:null;}
 function asset(path){if(typeof path!=='string'||path.length>240||!/^image\/[A-Za-z0-9_\-/]+\.(?:webp|png|jpg|jpeg|avif|gif)$/.test(path)||path.split('/').some(p=>p==='.'||p==='..'))throw Error('装扮图片配置无效');return '../'+path;}
 function register(id,rows){id=spiritId(id);if(!id||!Array.isArray(rows)||rows.length>1000)throw Error('妖灵装扮配置无效');const seen=new Set(),safe=rows.map(row=>{if(!row||!validSkin(row.id)||row.id==='classic'||seen.has(row.id)||typeof row.name!=='string'||!row.name.trim()||row.name.length>40)throw Error('装扮条目无效');seen.add(row.id);return {id:row.id,name:row.name.trim(),portrait:asset(row.portrait),face:row.face?asset(row.face):null,cover:row.cover?asset(row.cover):null};});catalogs.set(id,safe);return safe.length;}
 function list(id,classic){id=spiritId(id);return [{id:'classic',name:'经典形象',portrait:classic,face:null,cover:null}].concat(id?(catalogs.get(id)||[]).map(row=>({...row})):[]);}
 function empty(){return {v:VERSION,selected:{},unlocked:{}};}
 function clone(value){return JSON.parse(JSON.stringify(value));}
 function normalize(value){
   if(!value||typeof value!=='object'||Array.isArray(value))throw Error('装扮偏好格式异常');
   if(value.v===1){
     if(!value.selected||typeof value.selected!=='object'||Array.isArray(value.selected)||Object.keys(value.selected).length>1000)throw Error('装扮偏好格式异常');
     const migrated=empty();Object.keys(value.selected).forEach(id=>{const skin=value.selected[id];if(spiritId(id)!==id||!validSkin(skin))throw Error('装扮偏好格式异常');if(skin!=='classic'){migrated.selected[id]=skin;(migrated.unlocked[id]||(migrated.unlocked[id]={}))[skin]=1;}});return migrated;
   }
   if(value.v!==VERSION||!value.selected||typeof value.selected!=='object'||Array.isArray(value.selected)||!value.unlocked||typeof value.unlocked!=='object'||Array.isArray(value.unlocked)||Object.keys(value.selected).length>1000||Object.keys(value.unlocked).length>1000)throw Error('装扮偏好格式异常');
   const out=empty();Object.keys(value.unlocked).forEach(id=>{const row=value.unlocked[id];if(spiritId(id)!==id||!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length>1000)throw Error('装扮解锁记录格式异常');Object.keys(row).forEach(skin=>{if(!validSkin(skin)||row[skin]!==1)throw Error('装扮解锁条目异常');(out.unlocked[id]||(out.unlocked[id]={}))[skin]=1;});});
   Object.keys(value.selected).forEach(id=>{const skin=value.selected[id];if(spiritId(id)!==id||!validSkin(skin))throw Error('装扮偏好格式异常');if(skin!=='classic'&&!(out.unlocked[id]&&out.unlocked[id][skin]))throw Error('装扮选择尚未解锁');if(skin!=='classic')out.selected[id]=skin;});return out;
 }
 function read(storage,authority){const raw=authority==null?storage.getItem(KEY):authority;if(raw==null)return empty();const value=typeof raw==='string'?JSON.parse(raw):raw;return normalize(value);}
 function write(prefs,storage){const safe=normalize(prefs),raw=JSON.stringify(safe);storage.setItem(KEY,raw);if(storage.getItem(KEY)!==raw)throw Error('装扮偏好未保存');return safe;}
 function isUnlocked(id,skin,prefs){return skin==='classic'||!!(prefs.unlocked[id]&&prefs.unlocked[id][skin]);}
 function resolve(id,classic,storage,authority){const normalized=spiritId(id),rows=list(id,classic),prefs=read(storage,authority),requested=normalized&&prefs.selected[normalized]||'classic';return {skin:rows.find(row=>row.id===requested)||rows[0],requested,unavailable:requested!=='classic'&&!rows.some(row=>row.id===requested),unlocked:isUnlocked(normalized,requested,prefs),prefs};}
 function prepareUnlock(id,skinId,prefs){id=spiritId(id);if(!id||!validSkin(skinId)||skinId==='classic'||!(catalogs.get(id)||[]).some(row=>row.id===skinId))throw Error('这套装扮当前不可用');const state=normalize(prefs||empty());if(isUnlocked(id,skinId,state)){state.selected[id]=skinId;return {state,already:true,cost:0};}const next=clone(state);(next.unlocked[id]||(next.unlocked[id]={}))[skinId]=1;next.selected[id]=skinId;return {state:next,already:false,cost:PRICE};}
 function prepareSelect(id,skinId,prefs){id=spiritId(id);if(!id||!validSkin(skinId)||skinId!=='classic'&&!(catalogs.get(id)||[]).some(row=>row.id===skinId))throw Error('这套装扮当前不可用');const next=normalize(prefs||empty());if(skinId==='classic')delete next.selected[id];else {if(!isUnlocked(id,skinId,next))throw Error('请先解锁这套装扮');next.selected[id]=skinId;}return next;}
 function select(id,skinId,storage,authority){id=spiritId(id);if(!id||!validSkin(skinId)||skinId!=='classic'&&!(catalogs.get(id)||[]).some(row=>row.id===skinId))throw Error('这套装扮当前不可用');const prefs=read(storage,authority);if(skinId==='classic')delete prefs.selected[id];else {if(!isUnlocked(id,skinId,prefs))throw Error('请先解锁这套装扮');prefs.selected[id]=skinId;}write(prefs,storage);return true;}
 function skinOf(id,storage,authority){const normalized=spiritId(id);if(!normalized)return null;try{const prefs=read(storage,authority),requested=prefs.selected[normalized]||'classic',rows=list(id,'');return rows.find(row=>row.id===requested)||rows[0];}catch(e){return {id:'classic',name:'经典形象',portrait:'',face:null,cover:null};}}
 root.CSHSpiritSkins={KEY,VERSION,PRICE,spiritId,register,list,read,write,isUnlocked,resolve,prepareUnlock,prepareSelect,select,skinOf};
})(typeof window!=='undefined'?window:globalThis);
