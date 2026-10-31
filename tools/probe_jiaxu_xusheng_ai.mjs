// Actual skill callbacks and installed native effect/savable; isolated actors only.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {root,host,parse,walk,keyOf,property,skillsOf,ruleSignature} from './lib/skill_audit.mjs';
const option=n=>{const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1];};
const source=fs.readFileSync(option('--source')||path.join(root,'skills/index.js'),'utf8'),pack=skillsOf(parse(source)),rows=[];
const check=(name,fn)=>{try{const r=fn();rows.push({name,passed:r===true,detail:r===true?undefined:r});}catch(e){rows.push({name,passed:false,error:e.message});}};
const native={};const gt=fs.readFileSync(path.join(host,'noname/get/index.js'),'utf8');walk(parse(gt),n=>{if(n.type==='MethodDefinition'&&['effect','effect_use','recoverEffect'].includes(keyOf(n)))native[keyOf(n)]=gt.slice(...n.range);});
const lt=fs.readFileSync(path.join(host,'noname/library/index.js'),'utf8');let savable;walk(parse(lt),n=>{if(n.type==='Property'&&keyOf(n)==='cardSavable')savable='({'+lt.slice(...n.range)+'}).cardSavable';});
function fixture(){
  const card=(name='sha',value=4,position='h',known=false)=>({_physical:true,name,value,position,known,color:'black',suit:'spade'});
  const person=id=>({id,hp:3,maxHp:4,hujia:0,storage:{},hand:[],equips:[],skills:[],attitude:id==='actor'?4:-4,noRecover:false,
    getSkills(){return this.skills;},hasSkillTag:()=>false,isLinked:()=>false,isIn:()=>true,
    countCards(zone,filter){if(id!=='actor'&&zone.includes('h')&&filter)throw Error('hidden named count');const a=(zone.includes('h')?this.hand:[]).concat(zone.includes('e')?this.equips:[]);return filter?a.filter(typeof filter==='function'?filter:c=>c.name===filter).length:a.length;},
    getCards(zone){if(id!=='actor'&&zone.includes('h'))throw Error('raw opponent hand');return (zone.includes('h')?this.hand:[]).concat(zone.includes('e')?this.equips:[]);},
    getKnownCards(){return this.hand.filter(c=>c.known);},getEquip(slot){return slot===2?this.equips.find(c=>c.armor):null;}});
  const player=person('actor'),target=person('target');player.hand=[card(),card('shan'),card('tao',8)];target.hand=[card(),card('shan')];
  const lib={skill:{global:[]},filter:{},card:{sha:{type:'basic',ai:{basic:{value:5}}},shan:{type:'basic',ai:{basic:{value:7}}},tao:{type:'basic',savable:true,ai:{basic:{value:8}}},jiu:{type:'basic',savable:(c,p,t)=>p===t,ai:{basic:{value:5}}},bagua:{type:'equip',ai:{basic:{value:6}}},wuzhong:{type:'trick',ai:{basic:{value:8}}}}};
  const status={event:{player,target,goon:true,getParent:()=>({player:target})}},ui={selected:{cards:[],buttons:[]}};
  const game={players:[player,target],expandSkills(){},filterPlayer(fn){return this.players.filter(fn);},checkMod(c,...args){return c.blocked&&args.at(-2)==='cardEnabled2'?false:'unchanged';}};
  const get={autoViewAs:x=>x,itemtype:c=>c?._physical?'card':'',name:c=>c.name,color:c=>c.color,type:(c,group)=>group==='trick'&&c.type==='delay'?'trick':c.type||lib.card[c.name]?.type,position:c=>c.position,
    attitude:(a,b)=>a===b?4:b.attitude,info:x=>typeof x==='string'?lib.skill[x]:lib.card[x.name]||{},tag:()=>false,event:()=>status.event,
    value(c,p=player){if(c.forbidden)throw Error('hidden value');if(p!==player)throw Error('recipient indirect hand value');return c.value;},
    result(c){if(typeof c==='string')return lib.skill[c].ai.result;return {player:c.sourceUtility||0,target:c.name==='recover'?1:c.name==='losehp'?-1.5:c.name==='sha'?-1.5:c.name==='wuzhong'?2:0,ignoreStatus:true};}};
  const ctx=vm.createContext({lib,get,game,ui,_status:status,player,target,CacheContext:{requireCacheContext:()=>({get,delegate:x=>x})}});Object.assign(get,vm.runInContext('({'+Object.values(native).join(',\n')+'})',ctx));
  lib.filter.cardSavable=vm.runInContext(savable,ctx);
  for(const id of ['csh_wuzhen','csh_qiai','csh_sbweimu','csh_pojun12','csh_repojun2','csh_repojun3','csh_yingzipojun'])lib.skill[id]=vm.runInContext('('+source.slice(...property(pack,id).range)+')',ctx);
  lib.skill.fixture_immune={ai:{effect:{target:c=>c.name==='sha'?'zerotarget':undefined}}};
  lib.skill.fixture_benefit={ai:{effect:{target:c=>c.name==='sha'?-1:undefined}}};
  lib.skill.fixture_noheal={ai:{effect:{target:c=>c.name==='recover'?'zerotarget':undefined}}};
  const callbacks={};for(const [id,label]of [['csh_pojun12','pojun'],['csh_qiai','qiai']])walk(property(pack,id),n=>{if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='set'&&n.arguments[0]?.value==='ai')callbacks[label]=vm.runInContext('('+source.slice(...n.arguments[1].range)+')',ctx);});
  return {lib,get,game,ui,status,ctx,player,target,card,...callbacks};
}
const result=f=>f.lib.skill.csh_wuzhen.ai.result.target(f.player,f.target);
check('luanwu adverse target outcome has negative target utility',()=>result(fixture())<0);
check('luanwu target utility does not invert with attitude',()=>{const f=fixture(),a=result(f);f.target.attitude=4;return result(f)===a;});
check('luanwu one HP remains adverse with arbitrarily high armor',()=>{const f=fixture();f.target.hp=1;const a=result(f);f.target.hujia=99;return a<0&&result(f)===a;});
check('luanwu no target is neutral',()=>{const f=fixture();return f.lib.skill.csh_wuzhen.ai.result.target(f.player,null)===0;});
check('luanwu no hidden card evaluations',()=>{const f=fixture();f.target.hand.forEach(c=>c.forbidden=true);return Number.isFinite(result(f));});
check('luanwu all-allied table has negative total utility',()=>{const f=fixture();f.target.attitude=4;return f.get.effect(f.target,'csh_wuzhen',f.player,f.player)<0;});
for(const yin of [false,true])for(const type of ['basic','trick','delay'])for(const color of ['black','red'])check('weimu matches actual filter '+[yin,type,color],()=>{const f=fixture();f.target.storage.csh_sbweimu=yin;const c={name:'sha',type,color};const yes=f.lib.skill.csh_sbweimu.filter({card:c},f.target);return (f.lib.skill.csh_sbweimu.ai.effect.target(c,f.player,f.target)==='zerotarget')===yes;});
for(const utility of [-2,0,2])check('weimu preserves independent source utility '+utility,()=>{const f=fixture();f.target.skills=['csh_sbweimu'];f.target.storage.csh_sbweimu=true;return f.get.effect(f.target,{name:'sha',color:'black',sourceUtility:utility},f.player,f.player)===utility*4;});
check('weimu honors third observer attitude',()=>{const f=fixture();f.target.skills=['csh_sbweimu'];f.target.storage.csh_sbweimu=true;const observer={attitude:0};const old=f.get.attitude;f.get.attitude=(a,b)=>a===observer?(b===f.player?-3:2):old(a,b);return f.get.effect(f.target,{name:'sha',color:'black',sourceUtility:2},f.player,observer)===-6;});
check('qiai ally offers legal self rescue before filler',()=>{const f=fixture();f.target.attitude=4;return f.qiai(f.card('tao',8))>f.qiai(f.card('sha',1));});
check('qiai disabled rescue is not preferential',()=>{const f=fixture();f.target.attitude=4;const c=f.card('tao',8);c.blocked=true;return f.qiai(c)<f.qiai(f.card('sha',1));});
check('qiai ineffective recovery is not preferential',()=>{const f=fixture();f.target.attitude=4;f.target.skills=['fixture_noheal'];return f.qiai(f.card('tao',8))<f.qiai(f.card('sha',1));});
check('qiai enemy does not donate premium rescue',()=>{const f=fixture();return f.qiai(f.card('tao',8))<f.qiai(f.card('sha',1));});
check('qiai actual donor is event player rather than closure owner',()=>{const f=fixture();f.target.attitude=4;const donor=f.player;f.status.event.player=donor;return f.qiai(f.card('jiu',5))>f.qiai(f.card('sha',1));});
const tag=(f,t,arg={name:'sha',target:f.target})=>f.lib.skill.csh_pojun12.ai.skillTagFilter(f.player,t,arg);
check('pojun missing tag argument is safely declined',()=>{const f=fixture();return f.lib.skill.csh_pojun12.ai.skillTagFilter(f.player,'unequip_ai',undefined)===false;});
check('pojun no automatic direct hit from count guess',()=>{const f=fixture();return f.lib.skill.csh_pojun12.ai.directHit_ai!==true||tag(f,'directHit_ai')===false;});
check('pojun unequip allowed only with live removal budget',()=>{const f=fixture();f.target.equips=[Object.assign(f.card('bagua',6,'e'),{armor:true})];const yes=tag(f,'unequip_ai');f.target.hp=0;return yes===true&&tag(f,'unequip_ai')===false;});
check('pojun unknown cards treated without hidden value',()=>{const f=fixture();f.target.hand[0].forbidden=true;return Number.isFinite(f.pojun({link:f.target.hand[0]}));});
check('pojun hidden card changes cannot alter blank button rank',()=>{const f=fixture();const c=f.target.hand[0],a=f.pojun({link:c});c.name='tao';c.value=999;return f.pojun({link:c})===a;});
check('pojun known hand uses public printed value, no foreign value',()=>{const f=fixture();const c=f.target.hand[0];c.known=true;const a=f.pojun({link:c});c.name='tao';return f.pojun({link:c})>a;});
check('pojun public armor outranks ordinary hand',()=>{const f=fixture();const c=Object.assign(f.card('bagua',6,'e'),{armor:true});f.target.equips=[c];return f.pojun({link:c})>f.pojun({link:f.target.hand[0]});});
check('pojun ally is not stripped',()=>{const f=fixture();f.status.event.goon=false;return f.pojun({link:f.target.hand[0]})===0;});
check('pojun native array printed values use first public copy only',()=>{const f=fixture();const c=f.target.hand[0];c.known=true;f.lib.card.sha.ai.basic.value=[7,5,1];const a=f.pojun({link:c});f.target.hand.push(f.card());return a===7&&f.pojun({link:c})===7;});
check('pojun public value functions are not invoked with recipient hand',()=>{const f=fixture();const c=f.target.hand[0];c.known=true;f.lib.card.sha.ai.basic.value=()=>{throw Error('recipient helper must not run');};return f.pojun({link:c})===5;});
check('pojun old host without known API does not reveal hand names',()=>{const f=fixture();f.target.getKnownCards=undefined;const c=f.target.hand[0];Object.defineProperty(c,'name',{get(){throw Error('hidden name');}});return f.pojun({link:c})===5;});
check('pojun concealed button never reads name/color/number',()=>{const f=fixture(),c=f.target.hand[0];for(const k of ['name','color','number'])Object.defineProperty(c,k,{get(){throw Error('hidden '+k);}});return f.pojun({link:c})===5;});
check('pojun zero hand cards cannot imply automatic direct hit',()=>{const f=fixture();f.target.hand=[];return f.lib.skill.csh_pojun12.ai.directHit_ai!==true||tag(f,'directHit_ai')===false;});
check('pojun unequip declines non-attack and allied target',()=>{const f=fixture();f.target.equips=[Object.assign(f.card('bagua',6,'e'),{armor:true})];if(tag(f,'unequip_ai',{name:'wuzhong',target:f.target})!==false)return false;f.target.attitude=4;return tag(f,'unequip_ai')===false;});
const bonus=(f,c={name:'sha'})=>f.lib.skill.csh_pojun12.ai.effect.player(c,f.player,f.target);
check('pojun separate hand and equipment inequalities, not combined count',()=>{const f=fixture();f.player.equips=[f.card('bagua',6,'e')];f.target.hand=[];f.target.equips=[f.card('bagua',6,'e'),f.card('bagua',6,'e')];return bonus(f)===undefined;});
check('pojun physical attack materials are not still counted in hand',()=>{const f=fixture();f.target.hand=[f.card(),f.card(),f.card()];return bonus(f,f.player.hand[0])===undefined;});
check('pojun virtual attack material is not still counted in hand',()=>{const f=fixture();f.target.hand=[f.card(),f.card(),f.card()];return bonus(f,{name:'sha',cards:[f.player.hand[0]]})===undefined;});
check('pojun source-independent bonus does not encourage immune target',()=>{const f=fixture();f.player.skills=['csh_pojun12'];f.target.skills=['fixture_immune'];return f.get.effect(f.target,{name:'sha'},f.player,f.player)===0;});
check('pojun real damage benefit is amplified in target direction',()=>{const f=fixture();f.player.skills=['csh_pojun12'];f.target.skills=['fixture_benefit'];const c={name:'sha'};const withSkill=f.get.effect(f.target,c,f.player,f.player);f.player.skills=[];return withSkill===f.get.effect(f.target,c,f.player,f.player)*3;});
check('pojun +2 damage uses target multiplier and preserves source utility',()=>{const f=fixture();f.player.skills=['csh_pojun12'];const c={name:'sha',sourceUtility:2};const boosted=f.get.effect(f.target,c,f.player,f.player);f.player.skills=[];const plain=f.get.effect(f.target,c,f.player,f.player);return Math.abs((boosted-8)-(plain-8)*3)<1e-9;});
check('pojun consumed equipped material changes the actual equip inequality',()=>{const f=fixture();const c=f.card('bagua',6,'e');f.player.equips=[c];f.target.equips=[f.card('bagua',6,'e')];return bonus(f,{name:'sha',cards:[c]})===undefined;});
check('pojun material already outside player zones is not subtracted twice',()=>{const f=fixture();f.target.hand=[f.card(),f.card(),f.card()];const c=f.card('sha');const a=bonus(f,{name:'sha',cards:[c]});return Array.isArray(a)&&a[2]===3;});
check('native effect_use also preserves immune target zero',()=>{const f=fixture();f.player.skills=['csh_pojun12'];f.target.skills=['fixture_immune'];return f.get.effect_use(f.target,{name:'sha'},f.player,f.player)===0;});
check('pojun non-sha gets no damage multiplier',()=>{const f=fixture();return bonus(f,{name:'wuzhong'})===undefined;});
check('pojun actual +2 filter uses separate counts',()=>{const f=fixture();f.player.equips=[];f.target.equips=[f.card('bagua',6,'e')];return f.lib.skill.csh_repojun3.filter({card:{name:'sha'},player:f.target},f.player)===false;});
check('rule signature detects actual damage change',()=>{const changed=source.replace('trigger.num+=2;','trigger.num+=3;');return changed!==source&&ruleSignature(source)!==ruleSignature(changed);});
const baseline=option('--baseline');if(baseline){
  const old=fs.readFileSync(baseline,'utf8');
  check('whole non-AI AST unchanged',()=>ruleSignature(source)===ruleSignature(old));
  const protectedSkills=text=>{const p=skillsOf(parse(text));return JSON.stringify(p.properties.filter(n=>!['csh_wuzhen','csh_qiai','csh_sbweimu','csh_pojun12','csh_liegong','csh_wanshi','csh_lieqiong'].includes(keyOf(n))).map(n=>text.slice(...n.range).replaceAll('\r\n','\n')));};
  check('every other skill including AI remains byte equivalent',()=>protectedSkills(source)===protectedSkills(old));
}
const checkAsync=async(name,fn)=>{try{const r=await fn();rows.push({name,passed:r===true});}catch(e){rows.push({name,passed:false,error:e.message});}};
await checkAsync('actual temporary withholding returns every card at phase end',async()=>{const f=fixture(),held=[f.card(),f.card('bagua',6,'e')];let gained,removed;f.target.getExpansions=()=>held;f.target.gain=async cards=>{gained=cards;};f.target.removeSkill=s=>{removed=s;};f.game.log=()=>{};f.get.cnNumber=String;const sk=f.lib.skill.csh_repojun2;if(!sk.filter({},f.target))return false;await sk.content({},null,f.target);return gained===held&&removed==='csh_repojun2';});
check('actual damage content adds two and retains baseline damage',()=>{const f=fixture();f.ctx.trigger={num:2};f.lib.skill.csh_repojun3.content();return f.ctx.trigger.num===4;});
await checkAsync('actual draw modifier adds one only in mutable draw phase',async()=>{const f=fixture(),sk=f.lib.skill.csh_yingzipojun,tr={num:2};if(sk.filter({numFixed:true},f.player))return false;await sk.content({},tr,f.player);return tr.num===3;});
check('actual derived kill reward draws exactly three',()=>{const f=fixture();let n=0;f.player.draw=k=>{n+=k;};f.lib.skill.csh_yingzipojun.subSkill.dabaoliewei.content({},null,f.player);return n===3;});
await checkAsync('actual weimu cancels only its own target and toggles stance',async()=>{const f=fixture(),others=[f.player,f.target];others.remove=function(p){const i=this.indexOf(p);if(i>=0)this.splice(i,1);};const triggered=[f.target];triggered.remove=others.remove;let untriggered=false;const tr={targets:others,getParent:()=>({triggeredTargets2:triggered}),untrigger(){untriggered=true;}};f.target.changeZhuanhuanji=k=>{f.target.storage[k]=!f.target.storage[k];};await f.lib.skill.csh_sbweimu.content({},tr,f.target);return others.length===1&&others[0]===f.player&&triggered.length===0&&untriggered&&f.target.storage.csh_sbweimu===true;});
const failed=rows.filter(r=>!r.passed);console.log(JSON.stringify({scope:'Jia Xu/Xu Sheng actual AI/native effect/filter; isolated actors, no real saves or full games',passed:rows.length-failed.length,failed:failed.length,failures:failed},null,2));process.exitCode=failed.length?1:0;
