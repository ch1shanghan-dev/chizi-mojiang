/* Bond thresholds and progress: pure, shared by host ESM and standalone pages. */
(function(root){
 'use strict';if(root.CSHBond)return;
 var MAX=88000;
 var LEVELS=Object.freeze([
  Object.freeze({min:38000,key:'S',name:'羁绊',color:'#f0709c'}),
  Object.freeze({min:18000,key:'A',name:'信赖',color:'#dc9ab6'}),
  Object.freeze({min:8000,key:'B',name:'亲近',color:'#d8bd7a'}),
  Object.freeze({min:2000,key:'C',name:'相识',color:'#93a6bb'}),
  Object.freeze({min:0,key:'D',name:'陌路',color:'#6d7480'})
 ]);
 function resolveBondProgress(value,tiers,max){
  tiers=tiers||LEVELS.slice().reverse();max=max==null?MAX:max;
  if(!Array.isArray(tiers)||!tiers.length||!Number.isSafeInteger(max)||max<=0)throw Error('羁绊阈值无效');
  var keys=Object.create(null);
  tiers.forEach(function(t,i){if(!t||!Number.isSafeInteger(t.min)||t.min<0||t.min>=max||(i===0?t.min!==0:t.min<=tiers[i-1].min)||!t.key||keys[t.key])throw Error('羁绊阈值必须严格递增');keys[t.key]=true;});
  var raw=Number(value),invalid=!Number.isSafeInteger(raw)||raw<0||raw>max;
  var total=Number.isFinite(raw)?Math.max(0,Math.min(max,Math.round(raw))):0,index=0;
  for(var i=1;i<tiers.length;i++){if(total<tiers[i].min)break;index=i;}
  var level=tiers[index],next=tiers[index+1]||null,start=level.min,end=next?next.min:max,target=end-start,current=total-start;
  return {total:total,max:max,level:level,next:next,index:index,start:start,end:end,current:current,target:target,remaining:end-total,percent:Math.min(100,Math.max(0,current/target*100)),isMaxTier:!next,complete:total===max,invalidInput:invalid};
 }
 root.CSHBond=Object.freeze({MAX:MAX,LEVELS:LEVELS,resolveBondProgress:resolveBondProgress});
})(typeof window!=='undefined'?window:globalThis);
