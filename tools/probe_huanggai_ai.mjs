// Huang Gai actual skill decisions, native effect/conversion/savable; no real saves.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {root,host,parse,walk,keyOf,property,skillsOf,ruleSignature} from './lib/skill_audit.mjs';
const option=n=>{const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1];};
const source=fs.readFileSync(option('--source')||path.join(root,'skills/index.js'),'utf8'),pack=skillsOf(parse(source)),rows=[];
const check=(name,fn)=>{try{const r=fn();rows.push({name,passed:r===true,detail:r===true?undefined:r});}catch(e){rows.push({name,passed:false,error:e.message});}};
const methods={};
const getText=fs.readFileSync(path.join(host,'noname/get/index.js'),'utf8');walk(parse(getText),n=>{if(n.type==='MethodDefinition'&&['effect','effect_use','autoViewAs','recoverEffect'].includes(keyOf(n)))methods[keyOf(n)]=getText.slice(...n.range);});
const vText=fs.readFileSync(path.join(host,'noname/library/element/vcard.js'),'utf8');let vClass;walk(parse(vText),n=>{if(n.type==='ClassDeclaration'&&n.id.name==='VCard')vClass=vText.slice(...n.range);});
const libText=fs.readFileSync(path.join(host,'noname/library/index.js'),'utf8');let savable;walk(parse(libText),n=>{if(n.type==='Property'&&keyOf(n)==='cardSavable'&&n.value.type==='FunctionExpression')savable='({'+libText.slice(...n.range)+'}).cardSavable';});
function fixture(){
  const card=(name,value=4)=>({_physical:true,name,value,suit:'spade',number:7,color:'black',isKnownBy:()=>false});
  const person=id=>({id,hp:3,maxHp:4,hujia:0,hand:[],skills:[],attitude:id==='actor'?4:-4,using:false,noRecover:false,jueqing:false,
    getSkills(){return this.skills;},hasSkill(s){return this.skills.includes(s);},hasSkillTag(t){return t==='norecover'?this.noRecover:t==='jueqing'?this.jueqing:false;},isLinked:()=>false,
    countCards(zone,filter){if(id!=='actor'&&filter)throw Error('hidden named hand count');return filter?this.hand.filter(c=>typeof filter==='string'?c.name===filter:filter(c)).length:this.hand.length;},
    getCards(){if(id!=='actor')throw Error('raw opponent hand');return this.hand;},isPhaseUsing(){return this.using;}});
  const player=person('actor'),target=person('target');player.hand=[card('sha'),card('shan'),card('wuzhong')];target.hand=[card('sha')];
  const lib={element:{},suits:['spade','heart','club','diamond'],color:{black:['spade','club'],red:['heart','diamond']},skill:{global:[]},filter:{},card:{
    wuzhong:{type:'trick'},lebu:{type:'delay'},sha:{type:'basic'},shan:{type:'basic'},tao:{type:'basic',savable:true},jiu:{type:'basic',savable:(c,p,t)=>p===t},elixir:{type:'basic',savable:true},
    losehp:{type:'basic',loseHp:1},drain2:{type:'basic',loseHp:2},damage:{type:'basic',damage:1},recover:{type:'basic',recover:1}}};
  const status={event:{player,getParent:()=>({name:'chooseToUse'})}},game={players:[player,target],expandSkills(){},checkMod(c,...args){return c.blocked?'unchanged': 'unchanged';}},ui={selected:{cards:[]}};
  const get={itemtype:c=>c instanceof lib.element.VCard?'vcard':c?._physical?'card':'',name:c=>c.name,suit:c=>c.suit,color:c=>c.color,number:c=>c.number,nature:c=>c.nature,copy:v=>v==null?v:JSON.parse(JSON.stringify(v)),
    type:c=>lib.card[c.name]?.type,info:c=>typeof c==='string'?lib.skill[c]:lib.card[c.name]||{type:'basic'},tag:(c,t)=>lib.card[c.name]?.[t]||0,
    value(c,p){if(p&&p!==player)throw Error('foreign value');return c.value;},attitude:(a,b)=>a===b?4:b.attitude,event:()=>status.event,
    result:c=>({player:0,target:c.name==='losehp'||c.name==='damage'?-1.5:c.name==='recover'?1.5:0,ignoreStatus:true})};
  game.checkMod=(c,...args)=>{const key=args.at(-2);return key==='cardEnabled2'&&c.blocked?false:'unchanged';};
  const ctx=vm.createContext({lib,game,get,_status:status,ui,CacheContext:{requireCacheContext:()=>({get,delegate:x=>x})}});
  lib.element.VCard=vm.runInContext('('+vClass+')',ctx);const native=vm.runInContext('({'+Object.values(methods).join(',\n')+'})',ctx);Object.assign(get,native);
  lib.filter.cardSavable=vm.runInContext(savable,ctx);
  for(const id of ['csh_kurou','csh_zhaxiang'])lib.skill[id]=vm.runInContext('('+source.slice(...property(pack,id).range)+')',ctx);
  let recoverChoice;walk(property(pack,'csh_zhaxiang'),n=>{if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='set'&&n.arguments[0]?.value==='ai')recoverChoice=vm.runInContext('('+source.slice(...n.arguments[1].range)+')',ctx);});
  return {lib,get,game,status,player,target,card,recoverChoice};
}
const bonus=(f,c=f.card('wuzhong'))=>f.lib.skill.csh_kurou.ai.effect.player(f.get.autoViewAs(c),f.player,f.target)?.[1]??0;
check('kurou armor cannot protect against HP loss',()=>{const f=fixture();f.player.hp=3;const first=bonus(f);f.player.hujia=9;return bonus(f)===first;});
check('kurou one-HP no rescue cannot gain ordinary card-use utility',()=>{const f=fixture();f.player.hp=1;f.player.skills=['csh_kurou','csh_zhaxiang'];return f.get.effect_use(f.target,f.card('wuzhong'),f.player,f.player)<0;});
check('kurou one-HP armor cannot change the no-rescue penalty',()=>{const f=fixture();f.player.hp=1;const before=bonus(f);f.player.hujia=99;return bonus(f)===before&&bonus(f)<0;});
check('kurou available self rescue reduces dying penalty',()=>{const f=fixture();f.player.hp=1;const first=bonus(f);f.player.hand.push(f.card('tao'));return bonus(f)>first;});
check('kurou used rescue material is not still in hand',()=>{const f=fixture();f.player.hp=1;const before=bonus(f),tao=f.card('tao');f.player.hand.push(tao);const held=bonus(f),active=f.get.autoViewAs({name:'wuzhong'},[tao]);return bonus(f,active)===before&&held>before;});
check('kurou generic legal rescue card is considered',()=>{const f=fixture();f.player.hp=1;const first=bonus(f);f.player.hand.push(f.card('elixir'));return bonus(f)>first;});
check('kurou disabled rescue card is not counted',()=>{const f=fixture();f.player.hp=1;const first=bonus(f);f.player.hand.push({...f.card('tao'),blocked:true});return bonus(f)===first;});
check('kurou savable metadata alone cannot bypass actual recovery immunity',()=>{const f=fixture();f.player.hp=1;const first=bonus(f),tao=f.card('tao');f.player.hand.push(tao);f.lib.skill.fixture_norecover={ai:{effect:{target:c=>c.name==='recover'?'zerotarget':undefined}}};f.player.skills=['csh_kurou','fixture_norecover'];return f.lib.filter.cardSavable(tao,f.player,f.player)===true&&bonus(f)===first;});
check('kurou actual zhaxiang compensation changes the estimate',()=>{const f=fixture();const before=bonus(f);f.player.skills=['csh_zhaxiang'];return bonus(f)>before;});
check('kurou at two HP retains more caution than three',()=>{const f=fixture();f.player.skills=['csh_zhaxiang'];const before=bonus(f);f.player.hp=2;return bonus(f)<before;});
check('kurou delayed trick does not trigger ordinary-trick cost',()=>{const f=fixture();return f.lib.skill.csh_kurou.ai.effect.player(f.card('lebu'),f.player,f.target)===undefined;});
check('kurou basic card does not trigger trick cost',()=>{const f=fixture();return f.lib.skill.csh_kurou.ai.effect.player(f.card('sha'),f.player,f.target)===undefined;});
check('kurou uses no opponent hidden hand information',()=>{const f=fixture();f.target.getCards=()=>{throw Error('hidden hand');};return Number.isFinite(bonus(f));});
check('kurou no unsupported damage-benefit tag remains',()=>fixture().lib.skill.csh_kurou.ai.maixie!==true);
check('zhaxiang ordinary damage has no imaginary loss-of-HP reward',()=>{const f=fixture();return f.lib.skill.csh_zhaxiang.ai.effect.target(f.card('damage'),f.player,f.target)===undefined;});
check('zhaxiang safe HP loss is target resource benefit',()=>{const f=fixture();f.target.skills=['csh_zhaxiang'];return f.lib.skill.csh_zhaxiang.ai.effect.target(f.card('losehp'),f.player,f.target)?.[1]>0;});
check('zhaxiang one-HP loss has no future resource discount',()=>{const f=fixture();f.target.hp=1;return f.lib.skill.csh_zhaxiang.ai.effect.target(f.card('losehp'),f.player,f.target)===undefined;});
check('zhaxiang lethal multi-HP loss cannot prepay later armor and cards',()=>{const f=fixture();f.target.hp=2;return f.lib.skill.csh_zhaxiang.ai.effect.target(f.card('drain2'),f.player,f.target)===undefined;});
check('zhaxiang only target side receives HP loss compensation',()=>{const f=fixture();const fn=f.lib.skill.csh_zhaxiang.ai.effect.player;return !fn||fn(f.card('losehp'),f.player,f.player)===undefined;});
check('zhaxiang juleqing source conversion can receive real compensation',()=>{const f=fixture();f.player.jueqing=true;return f.lib.skill.csh_zhaxiang.ai.effect.target(f.card('damage'),f.player,f.target)?.[1]>0;});
check('zhaxiang high HP compensation does not query hidden sha',()=>{const f=fixture();f.target.hp=4;f.target.using=true;f.target.skills=['csh_zhaxiang'];return f.lib.skill.csh_zhaxiang.ai.effect.target(f.card('losehp'),f.player,f.target)?.[1]>0;});
check('zhaxiang compensation depends on receiver HP not source cards',()=>{const f=fixture();f.target.hp=2;f.target.using=true;const cb=()=>f.lib.skill.csh_zhaxiang.ai.effect.target(f.card('losehp'),f.player,f.target)?.[1];const before=cb();f.player.hand=[];return cb()===before;});
check('zhaxiang native effect changes receiver utility in the right direction',()=>{const f=fixture(),c=f.card('losehp');const original=f.get.effect(f.target,c,f.player,f.target);f.target.skills=['csh_zhaxiang'];return f.get.effect(f.target,c,f.player,f.target)>original;});
check('recover payment rejected when healing is prohibited',()=>{const f=fixture();f.player.hp=1;f.player.noRecover=true;return f.recoverChoice(f.card('shan',2))<=0;});
check('recover payment prefers cheaper legal basic cards',()=>{const f=fixture();f.player.hp=1;return f.recoverChoice(f.card('shan',2))>f.recoverChoice(f.card('tao',8));});
check('recover payment is absent outside actual one-HP condition',()=>{const f=fixture();f.player.hp=2;return f.recoverChoice(f.card('shan',2))===0;});
check('AI normalization allows newly added chained AI only',()=>{const a='const cshSkillPack={skill:{s:{content(){return player.chooseTarget().set("num",2);}}}};',b=a.replace('.set("num",2)','.set("num",2).set("ai",()=>1)');return ruleSignature(a)===ruleSignature(b);});
check('AI normalization still protects underlying chain parameters',()=>{const a='const cshSkillPack={skill:{s:{content(){return player.chooseTarget().set("num",2);}}}};',b=a.replace('.set("num",2)','.set("num",3).set("ai",()=>1)');return ruleSignature(a)!==ruleSignature(b);});
check('AI normalization allows AI metadata while preserving other properties',()=>{const a='const cshSkillPack={skill:{s:{usable:1}}};',b='const cshSkillPack={skill:{s:{usable:1,ai:{order:5}}}};',c=b.replace('usable:1','usable:2');return ruleSignature(a)===ruleSignature(b)&&ruleSignature(a)!==ruleSignature(c);});
check('rule guard protects real HP loss content',()=>{const n=property(property(pack,'csh_kurou'),'content').body;return ruleSignature(source)!==ruleSignature(source.slice(0,n.range[0])+'{}'+source.slice(n.range[1]));});
const baseline=option('--baseline');if(baseline)check('all non-AI rule AST unchanged',()=>ruleSignature(source)===ruleSignature(fs.readFileSync(baseline,'utf8')));
const failed=rows.filter(r=>!r.passed);console.log(JSON.stringify({scope:'actual Huang Gai AI/native effect/VCard/savable; isolated players, no game/saves',passed:rows.length-failed.length,failed:failed.length,failures:failed},null,2));process.exitCode=failed.length?1:0;
