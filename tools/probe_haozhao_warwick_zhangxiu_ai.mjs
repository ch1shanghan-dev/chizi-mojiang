// Actual three heroes' skill-local decisions + native effect/savable/canUse/target AI.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
import {root,host,parse,walk,keyOf,property,skillsOf,ruleSignature} from './lib/skill_audit.mjs';
const opt=n=>{const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1];};
const source=fs.readFileSync(opt('--source')||path.join(root,'skills/index.js'),'utf8'),pack=skillsOf(parse(source)),rows=[];
const check=(name,fn)=>{try{const r=fn();rows.push({name,passed:r===true,detail:r===true?undefined:r});}catch(e){rows.push({name,passed:false,error:e.message});}};
const checkAsync=async(name,fn)=>{try{const r=await fn();rows.push({name,passed:r===true});}catch(e){rows.push({name,passed:false,error:e.message});}};
const methods={};for(const [file,names]of [['noname/get/index.js',['effect','effect_use','damageEffect','recoverEffect']],['noname/library/element/player.js',['canUse']],['noname/ai/basic.js',['chooseTarget']]]){const s=fs.readFileSync(path.join(host,file),'utf8');walk(parse(s),n=>{if(n.type==='MethodDefinition'&&names.includes(keyOf(n)))methods[keyOf(n)]=s.slice(...n.range);});}
const library=fs.readFileSync(path.join(host,'noname/library/index.js'),'utf8');let savable;walk(parse(library),n=>{if(n.type==='Property'&&keyOf(n)==='cardSavable')savable='({'+library.slice(...n.range)+'}).cardSavable';});
const contentText=fs.readFileSync(path.join(host,'noname/library/element/content.js'),'utf8');let drawRecoverText;walk(parse(contentText),n=>{if(n.type==='Property'&&keyOf(n)==='chooseDrawRecover')drawRecoverText='({'+contentText.slice(...n.range)+'}).chooseDrawRecover';});
function fixture(){
 const card=(name='sha',value=4,zone='h')=>({_physical:true,name,value,zone,suit:'spade',number:7});
 const person=id=>({id,playerid:id,hp:3,maxHp:4,hujia:0,storage:{csh_juwei:1},hand:[],equips:[],skills:[],attitude:id==='actor'?4:-4,distance:1,range:1,linked:false,overflow:false,
  isIn:()=>true,isDamaged(){return this.hp<this.maxHp;},isHealthy(){return !this.isDamaged();},isLinked(){return this.linked;},needsToDiscard(){return this.overflow;},getDamagedHp(){return this.maxHp-this.hp;},getSkills(){return this.skills;},hasSkill(s){return this.skills.includes(s);},hasSkillTag:()=>false,getAttackRange(){return this.range;},
  countCards(zone,filter){if(id!=='actor'&&filter&&zone.includes('h'))throw Error('opponent hidden named count');const a=(zone.includes('h')?this.hand:[]).concat(zone.includes('e')?this.equips:[]);return filter?a.filter(typeof filter==='string'?c=>c.name===filter:filter).length:a.length;},
  getCards(zone){if(id!=='actor'&&zone.includes('h'))throw Error('raw opponent hand');return (zone.includes('h')?this.hand:[]).concat(zone.includes('e')?this.equips:[]);},
  getKnownCards(){return this.hand.filter(c=>c.known);},getEquip(){return null;},hasValueTarget(){return true;},getCardUsable:()=>1,
  hasCard(fn,zone='h'){return this.getCards(zone).some(fn);},hasJudge:()=>false,hasFriend:()=>true,isTurnedOver:()=>false,
 });
 const player=person('actor'),target=person('target');player.hand=[card(),card('shan',3)];target.hand=[card(),card('shan')];
 const lib={skill:{global:[]},filter:{},card:{sha:{type:'basic',damage:1,ai:{}},juedou:{type:'trick',damage:1,ai:{}},tao:{type:'basic',recover:1,savable:true,ai:{}},jiu:{type:'basic',savable:(c,p,t)=>p===t,ai:{}},wuzhong:{type:'trick',draw:2,ai:{}},tiesuo:{type:'trick',ai:{}},shan:{type:'basic',ai:{}}}};
 for(const v of Object.values(lib.card))v.content=async()=>{};
 const status={event:{player,target,controls:['draw_card','recover_hp'],selectTarget:-1,getParent:()=>({choice:'draw_card'})},currentPhase:target};
 const ui={selected:{cards:[player.hand[0]],targets:[target],buttons:[]}},game={players:[player,target],dead:[],expandSkills(){},filterPlayer(fn){return this.players.filter(fn);},hasPlayer(fn){return this.players.some(fn);},checkMod(c,...args){return c.blocked&&args.at(-2)==='cardEnabled2'?false:'unchanged';}};
 const get={autoViewAs:c=>c,itemtype:c=>c?._physical?'card':'',name:c=>c.name,nature:c=>c.nature,card:()=>ui.selected.cards[0]||{name:'sha'},player:()=>status.event.player,event:()=>status.event,prompt:()=>'',translation:p=>p.id,
  info:c=>typeof c==='string'?lib.skill[c]:lib.card[c.name]||{},type:c=>lib.card[c.name]?.type,tag:(c,t)=>lib.card[c.name]?.[t]||0,distance:(a,b)=>b.distance,attitude:(a,b)=>a===b?4:b.attitude,
  value(c,p=player){if(c.forbidden)throw Error('hidden value');if(p!==player)throw Error('foreign hand value');return c.value;},select:n=>n===-1?[-1,-1]:[1,1],
  result(c){return {player:0,target:c.name==='recover'?1.5:c.name==='draw'?1:c.name==='wuzhong'?2:c.name==='tao'?1.5:c.name==='tiesuo'?(player.linked?1:-1):['sha','juedou','damage','losehp'].includes(c.name)?-1.5:0,ignoreStatus:true};}};
 class CacheContext{static requireCacheContext(){return {get,delegate:x=>x};}static setCacheContext(){}static setInCacheEnvironment(){}static removeCacheContext(){}}
 const ctx=vm.createContext({lib,game,get,ui,_status:status,CacheContext,player,target,trigger:{target},result:{control:'draw_card'}});
 vm.runInContext('Array.prototype.add=function(x){if(!this.includes(x))this.push(x);return this;};',ctx);
 const native=vm.runInContext('({'+Object.values(methods).join(',\n')+'})',ctx);for(const id of ['effect','effect_use','damageEffect','recoverEffect'])get[id]=native[id];
 for(const p of [player,target])p.canUse=native.canUse;
 lib.filter.cardSavable=vm.runInContext(savable,ctx);lib.filter.cardEnabled=c=>!c.disabled;lib.filter.targetEnabled=(c,p,t)=>!t.noTarget;lib.filter.targetInRange=(c,p,t)=>t.distance<=p.range;lib.filter.cardUsable=()=>true;
 for(const id of ['csh_juwei','csh_chonglei','csh_qianju','csh_kuanggu','csh_kuanggu_check','csh_langxi1x','csh_xiongluan','csh_junchi','csh_zhansong','csh_zhansong_unlimited'])lib.skill[id]=vm.runInContext('('+source.slice(...property(pack,id).range)+')',ctx);
 for(const [id,predicate]of [['fixture_immune',c=>['sha','juedou','damage'].includes(c.name)],['fixture_noheal',c=>c.name==='recover']])lib.skill[id]={ai:{effect:{target:c=>predicate(c)?'zerotarget':undefined}}};
 lib.skill.fixture_benefit={ai:{effect:{target:c=>c.name==='damage'?-1:undefined}}};
 const choices={};for(const id of ['csh_kuanggu','csh_langxi1x','csh_xiongluan','csh_junchi']){choices[id]=[];walk(property(pack,id),n=>{if(n.type==='CallExpression'&&n.callee.property?.name==='set'&&['ai','ai2'].includes(n.arguments[0]?.value))choices[id].push(vm.runInContext('('+source.slice(...n.arguments[1].range)+')',ctx));});}
 const rec=f=>{player.lastChoice=f;f.set=function(k,v){this[k]=v;return this;};return f;};player.chooseToUse=()=>rec({player,target});
 native.drawRecover=vm.runInContext(drawRecoverText,ctx);
 return {lib,game,get,ui,status,ctx,player,target,card,choices,native};
}
const hao=(f,name,repeat=true)=>f.lib.skill.csh_juwei.ai.choose({card:{name},player:f.player},f.player,repeat);
check('Hao does not repeat a beneficial first unlink into harmful relink',()=>{const f=fixture();f.player.linked=true;return hao(f,'tiesuo')!=='背水！';});
check('Hao ordinary draw still chooses supported backwater',()=>hao(fixture(),'wuzhong')==='背水！');
check('Hao missing two HP may repeat healing',()=>{const f=fixture();f.player.hp=2;return hao(f,'tao')==='背水！';});
check('Hao only missing one HP avoids redundant double recovery',()=>hao(fixture(),'tao')!=='背水！');
check('Hao does not infer repeat-safe unknown trick from positive utility',()=>{const f=fixture();f.lib.card.unknown={type:'trick'};const old=f.get.result;f.get.result=c=>c.name==='unknown'?{target:2,ignoreStatus:true}:old(c);return hao(f,'unknown')!=='背水！';});
check('Hao harmful cards keep immediate draw',()=>['sha','juedou'].every(name=>hao(fixture(),name)==='选项二'));
check('Hao unsupported repeat never chosen',()=>hao(fixture(),'wuzhong',false)!=='背水！');
check('Hao own X growth remains bounded as a preference, not a rule cap',()=>{const f=fixture();f.player.storage.csh_juwei=1000;return hao(f,'wuzhong',false)==='选项二';});
const kuang=f=>f.choices.csh_kuanggu[0]();
check('Warwick at one HP prioritizes effective recovery with no attack in hand',()=>{const f=fixture();f.player.hp=1;f.player.hand=[];return kuang(f)==='recover_hp';});
check('Warwick at two HP prioritizes effective recovery',()=>{const f=fixture();f.player.hp=2;return kuang(f)==='recover_hp';});
check('Warwick forbidden recovery chooses free draw',()=>{const f=fixture();f.player.hp=1;f.player.skills=['fixture_noheal'];return kuang(f)==='draw_card';});
check('Warwick full HP chooses available draw control',()=>{const f=fixture();f.player.hp=4;f.status.event.controls=['draw_card','cancel2'];return kuang(f)==='draw_card';});
check('Warwick low HP but missing recovery control does not return invalid option',()=>{const f=fixture();f.player.hp=1;f.status.event.controls=['draw_card'];return kuang(f)==='draw_card';});
check('Warwick public own hand overflow favors recovery',()=>{const f=fixture();f.player.overflow=true;return kuang(f)==='recover_hp';});
check('Warwick healthy resource window may draw',()=>kuang(fixture())==='draw_card');
check('Warwick distance modifier exactly tracks damaged HP',()=>{const f=fixture();f.player.hp=2;return f.lib.skill.csh_qianju.mod.globalFrom(f.player,f.target,4)===2;});
const wolf=(f,t=f.target)=>f.choices.csh_langxi1x[0](t);
check('Wolf random five-damage tail does not gamble low-HP ally',()=>{const f=fixture();f.target.attitude=4;f.target.skills=['fixture_benefit'];return wolf(f)<=0;});
check('Wolf safe high-HP ally may retain actual damage benefit',()=>{const f=fixture();f.target.attitude=4;f.target.hp=6;f.target.maxHp=6;f.target.skills=['fixture_benefit'];return wolf(f)>0;});
check('Wolf damage-immune opponent has zero utility',()=>{const f=fixture();f.target.skills=['fixture_immune'];return wolf(f)===0;});
check('Wolf ordinary enemy remains worthwhile',()=>wolf(fixture())>0);
check('Wolf actual probability expectation is one',()=>Math.abs(0*.13+1*.77+2*.09+5*.01-1)<1e-12);
check('Wolf metadata and actual target choice share one scorer',()=>{const f=fixture();return f.lib.skill.csh_langxi1x.ai.result.player(f.player)===wolf(f);});
check('Wolf out-of-range actors not counted in result estimate',()=>{const f=fixture();f.target.distance=2;return f.lib.skill.csh_langxi1x.ai.result.player(f.player)===0;});
check('Wolf first-distance check marks only actual close damage',()=>{const f=fixture();const sk=f.lib.skill.csh_kuanggu_check;if(!sk.filter({player:f.target},f.player))return false;f.target.distance=2;return !sk.filter({player:f.target},f.player);});
const xiong=f=>f.choices.csh_xiongluan[0](f.target);
check('Xiongluan never reads opponent hidden named shan',()=>Number.isFinite(xiong(fixture())));
check('Xiongluan hidden hand identities cannot change target score',()=>{const f=fixture(),a=xiong(f);f.target.hand.forEach(c=>Object.defineProperty(c,'name',{get(){throw Error('hidden name');}}));return xiong(f)===a;});
check('Xiongluan healing enemy is a real cost',()=>{const f=fixture();const damaged=xiong(f);f.target.hp=f.target.maxHp;return xiong(f)>damaged;});
check('Xiongluan mandatory friend choice values healing over harmless full HP',()=>{const f=fixture();f.target.attitude=4;f.target.skills=['fixture_immune'];const wounded=xiong(f);f.target.hp=f.target.maxHp;return wounded>xiong(f);});
check('Xiongluan does not score unusable free cards',()=>{const f=fixture();f.target.hp=f.target.maxHp;f.target.noTarget=true;return xiong(f)===0;});
check('Xiongluan no-recovery reward does not waste choice',()=>{const f=fixture();f.player.hp=1;f.player.skills=['fixture_noheal'];return f.choices.csh_xiongluan[1]()==='摸两张牌';});
check('Xiongluan effective critical recovery preferred',()=>{const f=fixture();f.player.hp=1;return f.choices.csh_xiongluan[1]()==='回复1点体力';});
function junchi(f){f.lib.skill.csh_junchi.content();return f.player.lastChoice;}
check('Junchi current oncard cannot be paid by armor at one HP',()=>{const f=fixture();f.player.hp=1;f.player.hujia=99;const e=junchi(f);return typeof e.ai2==='function'&&e.ai2(f.target)<=0;});
check('Junchi cost calculation can still use profitable cards at safe HP',()=>{const f=fixture();const e=junchi(f);return typeof e.ai2==='function'&&e.ai2(f.target)>0;});
check('Junchi ordinary card effect alone does not justify critical HP loss',()=>{const f=fixture();f.player.hp=2;const e=junchi(f);return typeof e.ai2==='function'&&e.ai2(f.target)<=0;});
check('Junchi actual native forced-target AI honors negative cost score',()=>{const f=fixture();f.player.hp=1;const e=junchi(f);if(!e.ai2)return false;f.status.event={...f.status.event,selectTarget:-1,filterTarget:()=>true};return f.native.chooseTarget(e.ai2)===false;});
check('Junchi actual oncard retains one draw, one HP loss and one armor',()=>{const f=fixture(),e=junchi(f);let drawn=0;f.player.draw=()=>{drawn++;};f.player.loseHp=()=>{f.player.hp--;};f.player.changeHujia=()=>{f.player.hujia++;};e.oncard();return drawn===1&&f.player.hp===2&&f.player.hujia===1;});
const zhan=f=>f.lib.skill.csh_zhansong.check({},f.player);
check('Zhancao does not call a one-HP armored enemy an immediate kill',()=>{const f=fixture();f.player.hp=1;f.player.hand=[f.card('tao',8)];f.target.hp=1;f.target.hujia=99;return zhan(f)===false;});
check('Zhancao effective self rescue is retained',()=>{const f=fixture();f.player.hp=1;f.player.hand=[f.card('tao',8)];return zhan(f)===false;});
check('Zhancao prohibited rescue can be exchanged for a useful burst',()=>{const f=fixture();f.player.hp=1;f.player.skills=['fixture_noheal'];f.player.hand=[f.card('tao',8)];return zhan(f)===true;});
check('Zhancao no targets means no sacrifice',()=>{const f=fixture();f.player.hp=1;f.target.attitude=4;return zhan(f)===false;});
check('Zhancao positive low-cost adjacent burst remains available',()=>{const f=fixture();f.player.hp=1;return zhan(f)===true;});
check('Zhancao discarded weapon range is not borrowed by new attacks',()=>{const f=fixture();f.player.hp=1;f.player.range=4;f.target.distance=3;f.player.equips=[f.card('weapon',5,'e')];return zhan(f)===false;});
check('Zhancao discarded offensive horse reduction is removed from prediction',()=>{const f=fixture();f.player.hp=1;f.player.equips=[f.card('horse',3,'e')];f.lib.card.horse={distance:{globalFrom:-1}};return zhan(f)===false;});
check('Zhancao spent limit no longer advertises special threat',()=>{const f=fixture();f.player.hp=1;f.player.storage.csh_zhansong=true;return f.lib.skill.csh_zhansong.ai.threaten(f.target,f.player)===1.3;});
check('Zhancao no unearned HP-two future activation reward',()=>{const f=fixture();const ai=f.lib.skill.csh_zhansong.ai;return !ai.effect?.target;});
await checkAsync('actual Xiongluan heals first, uses two legal cards and removes only direct modifier',async()=>{const f=fixture(),used=[],removed=[];f.player.chooseTarget=()=>({set(){return this;},forResult:async()=>({bool:true,targets:[f.target]})});f.player.line=()=>{};f.player.addTempSkill=id=>f.player.skills.push(id);f.player.removeSkill=id=>{removed.push(id);f.player.skills=f.player.skills.filter(s=>s!==id);};f.player.useCard=async(c,t)=>{used.push([c.name,t.id,f.target.hp]);};f.target.recover=async()=>{f.target.hp=Math.min(f.target.maxHp,f.target.hp+1);};await f.lib.skill.csh_xiongluan.content({},null,f.player);return used.map(x=>x[0]).join()==='sha,juedou'&&used.every(x=>x[2]===4)&&removed.join()==='csh_xiongluan_direct'&&f.player.skills.includes('csh_xiongluan_draw')&&f.player.storage.csh_xiongluan_draw===f.target.id;});
await checkAsync('actual Xiongluan reward options each consume once and then close filter',async()=>{const f=fixture(),sk=f.lib.skill.csh_xiongluan.subSkill.draw;f.player.hp=1;f.player.storage.csh_xiongluan_draw=f.target.id;let draws=0,heals=0;f.player.draw=async n=>{draws+=n;};f.player.recover=async()=>{heals++;f.player.hp++;};f.player.chooseControl=controls=>{const e={player:f.player,controls};return {set(k,v){e[k]=v;return this;},forResult:async()=>{f.status.event=e;return {control:e.ai()};}};};const tr={source:f.player,player:f.target};if(!sk.filter(tr,f.player))return false;await sk.content({},tr,f.player);await sk.content({},tr,f.player);return draws===2&&heals===1&&!sk.filter(tr,f.player)&&f.player.storage.csh_xiongluan_opts.length===2;});
await checkAsync('actual Zhancao discards he then gains three stabbing attacks and keeps limit flag',async()=>{const f=fixture();let discarded=0,temp,awaken;f.player.discard=async cs=>{discarded=cs.length;f.player.hand=[];f.player.equips=[];};f.player.addTempSkill=id=>{temp=id;};f.player.awakenSkill=id=>{awaken=id;};f.game.createCard=(name,suit,number)=>({name,suit,number});f.player.gain=async cards=>{f.player.hand.push(...cards);};await f.lib.skill.csh_zhansong.content({},null,f.player);return discarded===2&&temp==='csh_zhansong_unlimited'&&awaken==='csh_zhansong'&&f.player.storage.csh_zhansong===true&&f.player.hand.length===3&&f.player.hand.every(c=>c.name==='sha'&&c.nature==='stab'&&c.number>=1&&c.number<=13);});
check('actual unlimited only changes attack count',()=>{const f=fixture(),fn=f.lib.skill.csh_zhansong_unlimited.mod.cardUsable;return fn({name:'sha'})===Infinity&&fn({name:'shan'})===undefined;});
for(const [random,expected]of [[0,0],[.129,0],[.13,1],[.899,1],[.9,2],[.989,2],[.99,5],[.999,5]])check('actual Wolf random branch '+random+' yields '+expected,()=>{const f=fixture();f.ctx.Math={random:()=>random};f.ctx.result={bool:true,targets:[f.target]};f.player.chooseTarget=()=>({set(){return this;}});f.player.logSkill=()=>{};f.player.line=()=>{};let damage;f.target.damage=n=>{damage=n;};f.lib.skill.csh_langxi1x.content();return damage===expected;});
check('zhansong check exclusion protects actual cost and generated count',()=>{const n=property(property(pack,'csh_zhansong'),'content');const changed=source.slice(0,n.range[0])+source.slice(...n.range).replace('i < 3','i < 4')+source.slice(n.range[1]);return changed!==source&&ruleSignature(changed)!==ruleSignature(source);});
check('ai2 exclusion remains scoped to Junchi rather than arbitrary skills',()=>{const a='const cshSkillPack={skill:{s:{content(){return player.chooseToUse().set("ai2",()=>1);}}}};',b=a.replace('()=>1','()=>2');return ruleSignature(a)!==ruleSignature(b);});
for(const noHeal of [false,true])await checkAsync('actual native draw/recover calls skill AI with legal controls, blocked='+noHeal,async()=>{const f=fixture();f.player.hp=1;if(noHeal)f.player.skills=['fixture_noheal'];let heals=0,draws=0;const evt={player:f.player,target:f.player,num1:1,num2:1,gaintag:[],forced:false,prompt:'test',choice:'draw_card',ai:f.choices.csh_kuanggu[0]};f.player.chooseControl=controls=>{const e={player:f.player,controls,getParent:()=>evt};return {set(k,v){e[k]=v;return this;},forResult:async()=>{f.status.event=e;return {control:e.ai()};}};};f.player.recover=async()=>{heals++;};f.player.draw=()=>{draws++;return {gaintag:{addArray(){}}};};await f.native.drawRecover(evt,null,f.player);return noHeal?draws===1&&heals===0:heals===1&&draws===0;});
check('Zhancao keeps costly assets without sufficient attack utility',()=>{const f=fixture();f.player.hp=1;f.player.hand=Array.from({length:10},()=>f.card('shan',10));return zhan(f)===false;});
check('Junchi no-target callback is safely declined',()=>{const f=fixture(),e=junchi(f);return typeof e.ai2==='function'&&e.ai2()<=0;});
const baseline=opt('--baseline');if(baseline){const old=fs.readFileSync(baseline,'utf8');check('all non-AI rules equal turn baseline',()=>ruleSignature(source)===ruleSignature(old));const allowed=['csh_juwei','csh_kuanggu','csh_langxi1x','csh_xiongluan','csh_junchi','csh_zhansong'];const protectedText=s=>JSON.stringify(skillsOf(parse(s)).properties.filter(p=>!allowed.includes(keyOf(p))).map(p=>s.slice(...p.range).replaceAll('\r\n','\n')));check('all other skills and AI preserve previous turn work exactly',()=>protectedText(source)===protectedText(old));}
check('rule guard detects modified Junchi oncard HP cost',()=>{const n=property(property(pack,'csh_junchi'),'content'),a=source.slice(...n.range),b=a.replace('player.loseHp();','player.loseHp(2);');return a!==b&&ruleSignature(source)!==ruleSignature(source.slice(0,n.range[0])+b+source.slice(n.range[1]));});
check('scoped ai2 exclusion does not hide real setters',()=>{const a='const cshSkillPack={skill:{csh_junchi:{content(){return player.chooseToUse().set("targetRequired",true);}}}};',b=a.replace('targetRequired",true','targetRequired",false');return ruleSignature(a)!==ruleSignature(b);});
const failures=rows.filter(r=>!r.passed);console.log(JSON.stringify({scope:'Haozhao/Warwick/Zhang Xiu actual skill AI, native effect/filter/target selection; isolated actors, no real saves or full games',passed:rows.length-failures.length,failed:failures.length,failures},null,2));process.exitCode=failures.length?1:0;
