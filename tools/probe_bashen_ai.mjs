// Actual Bashen eight-skill choices, native effect, no game or persistent storage.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {root,host,parse,walk,keyOf,property,skillsOf,ruleSignature} from './lib/skill_audit.mjs';
const option=n=>{const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1];};
const source=fs.readFileSync(option('--source')||path.join(root,'skills/index.js'),'utf8'),pack=skillsOf(parse(source)),results=[];
function check(name,fn){try{const detail=fn();results.push({name,passed:detail===true,detail:detail===true?undefined:detail});}catch(e){results.push({name,passed:false,error:e.message});}}
const hostText=fs.readFileSync(path.join(host,'noname/get/index.js'),'utf8'),methods=[];
walk(parse(hostText),n=>{if(n.type==='MethodDefinition'&&['effect','damageEffect'].includes(keyOf(n)))methods.push(hostText.slice(...n.range));});
const playerText=fs.readFileSync(path.join(host,'noname/library/element/player.js'),'utf8');
walk(parse(playerText),n=>{if(n.type==='MethodDefinition'&&['canSave','hasSkillTag','getKnownCards','iterableGetKnownCards'].includes(keyOf(n)))methods.push(playerText.slice(...n.range));});
const ids=['csh_bashen',...property(property(pack,'csh_bashen'),'derivation').elements.map(n=>n.value)];
function fixture(){
  const hidden=[];
  const person=id=>({id,hp:3,maxHp:4,hujia:0,attitude:id==='actor'?4:-4,hand:[{name:'sha',color:'black'}],equipment:[],turned:false,noturn:false,alive:true,damage:-1.5,skills:[],storage:{},
    getCards(zone){if(id!=='actor'&&zone!=='e')throw Error('hidden opponent cards');return zone==='e'?this.equipment:this.hand;},
    *iterableGetCards(){for(const c of this.hand){if(!c.isKnownBy)c.isKnownBy=()=>!!c.known;yield c;}},
    countCards(zone,filter){if(id!=='actor'&&filter)throw Error('hidden opponent count');const list=zone==='he'?[...this.hand,...this.equipment]:this.hand;return filter?list.filter(c=>typeof filter==='string'?c.name===filter:filter(c)).length:list.length;},
    isIn(){return this.alive;},isTurnedOver(){return this.turned;},getEquip(){return this.armor;},hasSkill(s){return this.skills.includes(s);},getSkills(){const list=[...this.skills];list.addArray=items=>{for(const item of items)if(!list.includes(item))list.push(item);return list;};return list;},hasSkillTag(t){return t==='noturn'&&this.noturn;}});
  const player=person('actor'),target=person('target'),game={players:[player,target],filterPlayer:fn=>game.players.filter(fn),hasPlayer:fn=>game.players.some(fn),expandSkills(){}};
  const lib={skill:{global:[]},card:{},inpile:[],filter:{canBeGained:c=>!c.unstealable}},status={event:{player}},ui={selected:{buttons:[]}};
  const get={event:()=>status.event,attitude:(p,t)=>t.attitude,distance:()=>2,name:c=>c.name,color:c=>c.color,tag:(c,t)=>t==='damage'&&(c.damage||c.name.includes('damage')),itemtype:()=>'',autoViewAs:c=>c,
    info:c=>typeof c==='string'?lib.skill[c]:{ai:{}},result:c=>({player:c.sourceBenefit||0,target:c.name.includes('damage')||c.damage?((p,t)=>t.damage):0})};
  const ctx=vm.createContext({lib,game,ui,get,_status:status,CacheContext:{requireCacheContext:()=>({get,delegate:x=>x})}}),engine=vm.runInContext('({'+methods.join(',\n')+'})',ctx);
  get.effect=engine.effect;get.damageEffect=engine.damageEffect;
  for(const p of [player,target]){p.getKnownCards=engine.getKnownCards;p.iterableGetKnownCards=engine.iterableGetKnownCards;p.canSave=engine.canSave;p.nativeHasSkillTag=engine.hasSkillTag;}
  const callbacks={};for(const id of ids){lib.skill[id]=vm.runInContext('('+source.slice(...property(pack,id).range)+')',ctx);callbacks[id]=[];walk(property(pack,id),n=>{if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='set'&&n.arguments[0]?.value==='ai')callbacks[id].push(vm.runInContext('('+source.slice(...n.arguments[1].range)+')',ctx));});}
  return {player,target,game,lib,status,ui,get,hidden,person,callbacks};
}
const select=(f,id,t=f.target)=>f.callbacks[id][0](t);
check('leiji refuses one-HP thunder-immune enemy',()=>{const f=fixture();f.target.hp=1;f.target.damage=0;return select(f,'csh_bashen_leiji')<=0;});
check('leiji refuses immune empty-hand enemy',()=>{const f=fixture();f.target.hand=[];f.target.damage=0;return select(f,'csh_bashen_leiji')<=0;});
check('leiji refuses enemy benefiting from thunder damage',()=>{const f=fixture();f.target.hp=1;f.target.hand=[];f.target.damage=0.4;return select(f,'csh_bashen_leiji')<=0;});
check('leiji values enemy with positive thunder outcome',()=>{const f=fixture();return select(f,'csh_bashen_leiji')>0;});
check('leiji may help ally who benefits from thunder',()=>{const f=fixture();f.target.attitude=4;f.target.damage=1.5;return select(f,'csh_bashen_leiji')>0;});
check('leiji will not hurt ordinary ally for fixed bonus',()=>{const f=fixture();f.target.attitude=4;f.target.hp=1;f.target.hand=[];return select(f,'csh_bashen_leiji')<=0;});
check('leiji shan has no bonus without profitable thunder target',()=>{const f=fixture();f.target.damage=0;return f.lib.skill.csh_bashen_leiji.ai.effect.player({name:'shan'},f.player)===undefined;});
check('leiji shan retains bonus with a profitable thunder target',()=>{const f=fixture();return f.lib.skill.csh_bashen_leiji.ai.effect.player({name:'shan'},f.player)?.[1]>0;});
check('leiji other cards get no shan bonus',()=>{const f=fixture();return f.lib.skill.csh_bashen_leiji.ai.effect.player({name:'sha'},f.player)===undefined;});
check('leiji ignores departed profitable targets',()=>{const f=fixture();f.target.alive=false;return f.lib.skill.csh_bashen_leiji.ai.effect.player({name:'shan'},f.player)===undefined;});
check('jushou counts face-up flip cost before one-card theft',()=>{const f=fixture();return select(f,'csh_bashen_jushou')<=0;});
check('jushou two-card enemy still provides an option',()=>{const f=fixture();f.target.hand.push({name:'shan'});return select(f,'csh_bashen_jushou')>0;});
check('jushou flip-back can use an allied target',()=>{const f=fixture();f.player.turned=true;f.target.attitude=4;return select(f,'csh_bashen_jushou')>0;});
check('jushou flip-back may select self without fake theft gain',()=>{const f=fixture();f.player.turned=true;return select(f,'csh_bashen_jushou',f.player)>0&&select(f,'csh_bashen_jushou',f.player)<=select(f,'csh_bashen_jushou');});
check('jushou noturn omits face-up flip cost',()=>{const f=fixture();f.target.attitude=4;f.player.noturn=true;return select(f,'csh_bashen_jushou')>0;});
check('jushou face-up ordinary allied transfer is not free gain',()=>{const f=fixture();f.target.attitude=4;return select(f,'csh_bashen_jushou')<=0;});
check('jushou never reads opponent hidden card contents',()=>{const f=fixture();f.target.getCards=zone=>{if(zone!=='e')throw Error('hidden cards');return [];};return Number.isFinite(select(f,'csh_bashen_jushou'));});
check('jushou rejects departed target',()=>{const f=fixture();f.target.alive=false;return select(f,'csh_bashen_jushou')<=0;});
check('jushou rejects empty target',()=>{const f=fixture();f.target.hand=[];return select(f,'csh_bashen_jushou')<=0;});
check('bashen skill selection uses same flip-back option valuation',()=>{const f=fixture();f.target.attitude=4;const choose=()=>f.callbacks.csh_bashen[0]({link:'csh_bashen_jushou'});const before=choose();f.player.turned=true;return choose()>before;});
check('bashen selects skills without deck or opponent hand reads',()=>{const f=fixture();f.get.cards=()=>{throw Error('hidden deck');};return ids.slice(1).every(id=>Number.isFinite(f.callbacks.csh_bashen[0]({link:id})));});
check('kuanggu armor/draw choice reads own resources only',()=>{const f=fixture(),fn=f.callbacks.csh_bashen_kuanggu[0];const first=fn();f.player.hujia=3;return first==='获得1点护甲'&&fn()==='摸一张牌';});
check('xinzhan chooses color before seeing deck and uses own needs',()=>{const f=fixture();f.player.hp=1;f.get.cards=()=>{throw Error('hidden deck');};return f.callbacks.csh_bashen_xinzhan[0]()==='红色';});
check('lianying free draw choice remains available',()=>{const f=fixture();return f.callbacks.csh_bashen_lianying[0]()===true;});
check('kuanggu does not invent source income on immune damage',()=>{const f=fixture();f.player.skills=['csh_bashen_kuanggu'];f.target.damage=0;return f.get.effect(f.target,{name:'damage'},f.player,f.player)<=0;});
check('yizhong defense depends on public armor and color',()=>{const f=fixture(),s=f.lib.skill.csh_bashen_yizhong;const c={name:'damage',color:'black'};const first=s.ai.effect.target(c,f.player,f.target);f.target.armor={};return first==='zerotarget'&&s.ai.effect.target(c,f.player,f.target)===undefined;});
check('yizhong preserves independent source benefit in native effect',()=>{const f=fixture();f.target.skills=['csh_bashen_yizhong'];return f.get.effect(f.target,{name:'damage',color:'black',sourceBenefit:2},f.player,f.player)>0;});
check('buqu cannot tell native canSave that it rescues others',()=>{const f=fixture();f.player.skills=['csh_bashen_buqu'];f.player.hasSkillTag=f.player.nativeHasSkillTag;return f.player.canSave(f.target)===false;});
check('jushou publicly protected equipment is not theft income',()=>{const f=fixture();f.target.hand=[];f.target.equipment=[{unstealable:true},{unstealable:true}];return select(f,'csh_bashen_jushou')<=0;});
check('jushou fully known protected hand is not theft income',()=>{const f=fixture();f.target.hand=[{name:'sha',known:true,unstealable:true},{name:'shan',known:true,unstealable:true}];return select(f,'csh_bashen_jushou')<=0;});
check('jushou hidden card protection cannot leak into estimate',()=>{const f=fixture();f.target.hand.push({name:'shan'});const before=select(f,'csh_bashen_jushou');f.target.hand.forEach(c=>c.unstealable=true);f.lib.filter.canBeGained=c=>{if(!c.known)throw Error('hidden legality inspected');return !c.unstealable;};return select(f,'csh_bashen_jushou')===before;});
check('AI exclusions preserve eight-skill removal rule',()=>{const n=property(property(pack,'csh_bashen'),'content').body;return ruleSignature(source)!==ruleSignature(source.slice(0,n.range[0])+'{}'+source.slice(n.range[1]));});
check('AI exclusions preserve leiji actual damage',()=>{const n=property(property(pack,'csh_bashen_leiji'),'content').body;return ruleSignature(source)!==ruleSignature(source.slice(0,n.range[0])+'{}'+source.slice(n.range[1]));});
const baseline=option('--baseline');if(baseline)check('all non-AI rule AST remains unchanged',()=>ruleSignature(source)===ruleSignature(fs.readFileSync(baseline,'utf8')));
const failures=results.filter(r=>!r.passed);console.log(JSON.stringify({scope:'Bashen actual eight-skill callbacks + installed host effect; no real game/saves',passed:results.length-failures.length,failed:failures.length,failures},null,2));process.exitCode=failures.length?1:0;
