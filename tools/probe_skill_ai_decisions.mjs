// Real skill callbacks, installed host effect methods, and known-card API in VM.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {root,host,parse,walk,keyOf,property,skillsOf,ruleSignature} from './lib/skill_audit.mjs';
const option=n=>{const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:null;};
const source=fs.readFileSync(option('--source')||path.join(root,'skills/index.js'),'utf8'), ast=parse(source), pack=skillsOf(ast);
const results=[];
function check(name,fn){try{const detail=fn();results.push({name,passed:detail===true,detail:detail===true?undefined:detail});}catch(error){results.push({name,passed:false,error:error.message});}}
const methods={};
for(const [file,names]of [['noname/get/index.js',['effect','damageEffect']],['noname/library/element/player.js',['getKnownCards','iterableGetKnownCards','getUseValue']]]){
  const text=fs.readFileSync(path.join(host,file),'utf8');walk(parse(text),n=>{if(n.type==='MethodDefinition'&&names.includes(keyOf(n)))methods[keyOf(n)]=text.slice(...n.range);});
}
function fixture(){
  const reads=[], hiddenReads=[];
  function card(number,value=4,known=false,name='sha'){return {number,value,known,name,type:'basic',isKnownBy(){return this.known;}};}
  function person(id){return {id,hp:3,maxHp:4,attitude:id==='actor'?4:-4,hand:[],equip:[],storage:{},turned:false,noturn:false,alive:true,damage:-1.5,losehp:-1.5,
    getCards(zone){if(this.id!=='actor'&&zone==='h')hiddenReads.push(this.id);return zone==='he'?[...this.hand,...this.equip]:zone==='e'?[...this.equip]:[...this.hand];},
    *iterableGetCards(){yield* this.hand;},countCards(zone,filter){if(this.id!=='actor'&&filter&&this.rejectNamedCount)throw Error('Hidden named hand count accessed');const list=zone==='he'?[...this.hand,...this.equip]:zone==='e'?this.equip:this.hand;return !filter?list.length:list.filter(c=>typeof filter==='string'?c.name===filter:typeof filter==='function'?filter(c):Object.entries(filter).every(([k,v])=>c[k]===v)).length;},
    hasCard(fn){return this.hand.some(fn);},getSkills(){return [];},hasSkillTag(tag){return tag==='noturn'?this.noturn:false;},
    isTurnedOver(){return this.turned;},isIn(){return this.alive;},isDamaged(){return this.hp<this.maxHp;},isLinked(){return false;},hasEnabledSlot(){return true;},hasSkill(id){return (this.skillSet||[]).includes(id);},canCompare(other){return this.hand.length>0&&other.hand.length>0&&other.alive;},canUse(card,other,distance,includecard){return this!==other&&other.alive&&(!other.far||distance===false)&&(!this.shaUsed||includecard===false);},getExpansions(){return this.expansions||[];},hasHistory(){return !!this.discarded;},isMinHandcard(){return !this.notMin;},getStat(){return this.damagePoints||0;}};}
  const player=person('actor'),target=person('target');
  player.hand=[card(5,2),card(8,3)]; target.hand=[card(6,4),card(9,4)];
  const lib={skill:{global:[]},filter:{cardDiscardable:()=>true}};
  const ui={selected:{cards:[card(2,1)],targets:[]}},status={event:{player}},game={players:[player,target],expandSkills(){},checkMod(){},hasPlayer:fn=>game.players.some(fn),filterPlayer:fn=>game.players.filter(fn),filterPlayer2:()=>game.players};
  const get={attitude:(a,b)=>a===b?4:b===target?target.attitude:target.attitude,
    player:()=>status.event.player,event:()=>status.event,
    value(c,p){reads.push(c);if(c.forbidden)throw Error('Hidden card value accessed');if(p===target&&target.rejectRecipientValue)throw Error('Recipient value can inspect hidden duplicate cards');return c.values?.[p?.id]??c.value;},
    number(c){if(c.forbidden)throw Error('Hidden card number accessed');return c.number;},type:c=>c.type,name:c=>c.name,suit(c){if(c.forbidden)throw Error('Hidden card suit accessed');return c.suit||'spade';},position:c=>c.position||'h',
    color(c){if(c.forbidden)throw Error('Hidden card color accessed');return c.color;},
    itemtype:()=>'',autoViewAs:c=>c,tag:()=>false,owner:c=>c.owner,copy:v=>Array.isArray(v)?[...v]:v,inpileVCardList:fn=>[['基本','','sha'],['基本','','sha','thunder']].filter(fn),info:item=>typeof item==='string'?lib.skill[item]:({filterTarget(){return true;},selectTarget:1,ai:{basic:{value:item.value??5}}}),
    result(c){if(typeof c==='string')return lib.skill[c].ai.result;return {player:c.name==='juedou'?-2:0,target:c.name==='juedou'?-1:c.name==='draw'?1:c.name==='losehp'?((from,to)=>to.losehp):c.name==='sha'?((c.nature?target.natureEffects?.[c.nature]:target.shaEffect)??-1.5):c.name==='damage'?-1.5:0};}};
  const ctx=vm.createContext({lib,ui,game,get,_status:status,cards:ui.selected.cards,CacheContext:{requireCacheContext:()=>({get,delegate:x=>x})}});
  const engine=vm.runInContext('({'+Object.values(methods).join(',\n')+'})',ctx);
  get.effect=engine.effect; get.damageEffect=engine.damageEffect;
  for(const p of [player,target]){p.iterableGetKnownCards=engine.iterableGetKnownCards;p.getKnownCards=engine.getKnownCards;p.getUseValue=engine.getUseValue;}
  // Damage immunity/benefit is supplied as a real effect modifier on each target.
  lib.skill.fixture_damage={ai:{effect:{target(c,from,to){if(c.name==='damage')return to.damage===0?'zerotarget':to.damage/-1.5;}}}};
  player.getSkills=target.getSkills=()=>['fixture_damage'];
  for(const id of ['csh_jiaomeng','csh_karl_junxing','csh_karl_hannan','csh_sheque','csh_luoyi','csh_zhanlai','csh_douyan','csh_bizui','csh_yiwu','csh_duolve','csh_ssx_pianzhu','csh_ssx_saran','csh_hyy_jizhi','csh_hyy_linglong','csh_hyy_qicai','csh_hyy_guanxu','csh_hyy_zuilun'])lib.skill[id]=vm.runInContext('('+source.slice(...property(pack,id).range)+')',ctx);
  let discardAI;walk(property(pack,'csh_karl_junxing'),n=>{if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='set'&&n.arguments[0]?.value==='ai')discardAI=vm.runInContext('('+source.slice(...n.arguments[1].range)+')',ctx);});
  let yiwuAI;walk(property(pack,'csh_yiwu'),n=>{if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='set'&&n.arguments[0]?.value==='ai')yiwuAI=vm.runInContext('('+source.slice(...n.arguments[1].range)+')',ctx);});
  const saranChoices=[];walk(property(pack,'csh_ssx_saran'),n=>{if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='set'&&n.arguments[0]?.value==='ai')saranChoices.push(vm.runInContext('('+source.slice(...n.arguments[1].range)+')',ctx));});
  const hyy={};for(const id of ['csh_hyy_jizhi','csh_hyy_qicai','csh_hyy_zuilun'])walk(property(pack,id),n=>{
    if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='set'&&['ai','processAI'].includes(n.arguments[0]?.value))hyy[id+'_'+n.arguments[0].value]=vm.runInContext('('+source.slice(...n.arguments[1].range)+')',ctx);
    if(n.type==='AssignmentExpression'&&n.left.type==='MemberExpression'&&n.left.property.name==='ai')hyy.zuilunTarget=vm.runInContext('('+source.slice(...n.right.range)+')',ctx);
  });
  return {lib,ui,get,ctx,status,player,target,card,person,reads,hiddenReads,discardAI,yiwuAI,saranChoices,hyy};
}
const skill=(f,id)=>f.lib.skill[id];
check('jiaomeng never reads raw opponent hand',()=>{const f=fixture();skill(f,'csh_jiaomeng')._advantage(f.player,f.target);return f.hiddenReads.length===0;});
check('jiaomeng hidden card contents cannot affect estimate',()=>{const f=fixture(),s=skill(f,'csh_jiaomeng');const first=s._advantage(f.player,f.target);f.target.hand=f.target.hand.map(c=>({...c,number:13,value:100}));return first===s._advantage(f.player,f.target);});
check('jiaomeng never evaluates unknown card values',()=>{const f=fixture();f.target.hand.forEach(c=>c.forbidden=true);skill(f,'csh_jiaomeng')._advantage(f.player,f.target);return true;});
check('jiaomeng avoids indirect recipient-hand reads through get.value',()=>{const f=fixture();f.target.rejectRecipientValue=true;f.target.hand[0].known=true;skill(f,'csh_jiaomeng')._advantage(f.player,f.target);return true;});
check('jiaomeng known card values affect estimate',()=>{const f=fixture(),s=skill(f,'csh_jiaomeng');f.target.hand[0].known=true;const before=s._advantage(f.player,f.target);f.target.hand[0].value+=5;return s._advantage(f.player,f.target)>before;});
check('jiaomeng old host without known-card API treats all as unknown',()=>{const f=fixture();f.target.getKnownCards=undefined;skill(f,'csh_jiaomeng')._advantage(f.player,f.target);return f.hiddenReads.length===0;});
for(const callback of ['player','target'])check('jiaomeng neutral without target: '+callback,()=>{const f=fixture();return skill(f,'csh_jiaomeng').ai.result[callback](f.player,undefined)===0;});
check('jiaomeng helper ignores self and illegal hand-count difference',()=>{const f=fixture(),s=skill(f,'csh_jiaomeng');const self=s._advantage(f.player,f.player);f.target.hand=[];return self===0&&s._advantage(f.player,f.target)===0;});
check('jiaomeng will not steal ally cards without team improvement',()=>{const f=fixture();f.target.attitude=4;f.target.hand.forEach(c=>{c.known=true;c.value=9;});return skill(f,'csh_jiaomeng')._advantage(f.player,f.target)===0;});
check('jiaomeng improves allied card allocation without target penalty',()=>{const f=fixture();f.target.attitude=4;f.player.hand.forEach(c=>c.values={actor:2,target:7});f.target.hand.forEach(c=>{c.known=true;c.values={actor:8,target:2};});const s=skill(f,'csh_jiaomeng');return s.ai.result.player(f.player,f.target)>0&&s.ai.result.target(f.player,f.target)===0;});
check('jiaomeng enemy poor hand can be exchanged without hidden reads',()=>{const f=fixture(),s=skill(f,'csh_jiaomeng');return s.ai.result.player(f.player,f.target)>0&&s.ai.result.target(f.player,f.target)<0&&f.hiddenReads.length===0;});
for(const mode of ['turned','noturn']){
  check('junxing '+mode+' grants target a benefit',()=>{const f=fixture();f.target[mode]=true;return skill(f,'csh_karl_junxing').ai.result.target(f.player,f.target)>0;});
  check('junxing target chooses flip/draw when '+mode,()=>{const f=fixture();f.target[mode]=true;f.status.event={player:f.target,cardsx:f.ui.selected.cards};return f.discardAI(f.card(2,1))<0;});
  check('junxing can benefit ally when '+mode,()=>{const f=fixture();f.target.attitude=4;f.target[mode]=true;return skill(f,'csh_karl_junxing').ai.result.target(f.player,f.target)>0;});
}
check('junxing has no automatic player reward',()=>{const f=fixture(),r=skill(f,'csh_karl_junxing').ai.result.player;return (typeof r==='function'?r(f.player,f.target):r)===0;});
check('junxing face-up enemy with one discard is harmed',()=>{const f=fixture();return skill(f,'csh_karl_junxing').ai.result.target(f.player,f.target)<0;});
check('junxing large draw alternative is not treated as enemy harm',()=>{const f=fixture();f.ui.selected.cards.push(f.card(3,1),f.card(4,1),f.card(5,1));return skill(f,'csh_karl_junxing').ai.result.target(f.player,f.target)>0;});
check('junxing loss of HP ignores damage immunity',()=>{const f=fixture(),s=skill(f,'csh_karl_junxing');const a=s.ai.result.target(f.player,f.target);f.target.damage=0;return a===s.ai.result.target(f.player,f.target)&&a<0;});
check('junxing model uses public counts, no hidden card values',()=>{const f=fixture();f.target.hand.forEach(c=>c.forbidden=true);skill(f,'csh_karl_junxing').ai.result.target(f.player,f.target);return f.hiddenReads.length===0;});
check('junxing impossible discard branch leaves flip/draw choice',()=>{const f=fixture();f.target.hand=[];f.ui.selected.cards.push(f.card(3,1),f.card(4,1),f.card(5,1));return skill(f,'csh_karl_junxing').ai.result.target(f.player,f.target)>0;});
check('hannan rejects damage-immune opponent',()=>{const f=fixture();f.player.hand=[f.card(13,3)];f.target.damage=0;return skill(f,'csh_karl_hannan').ai.result.target(f.player,f.target)===0;});
check('hannan rejects opponent benefiting from damage',()=>{const f=fixture();f.player.hand=[f.card(13,3)];f.target.damage=1.5;return skill(f,'csh_karl_hannan').ai.result.target(f.player,f.target)===0;});
check('hannan rejects empty opponent hand',()=>{const f=fixture();f.target.hand=[];return skill(f,'csh_karl_hannan').ai.result.target(f.player,f.target)===0;});
check('hannan rejects empty own hand',()=>{const f=fixture();f.player.hand=[];return skill(f,'csh_karl_hannan').ai.result.target(f.player,f.target)===0;});
check('hannan rejects guaranteed loss to a known higher card',()=>{const f=fixture();f.player.hand=[f.card(11,2)];f.target.hand=[f.card(13,4,true)];return skill(f,'csh_karl_hannan').ai.result.target(f.player,f.target)===0;});
check('hannan rejects guaranteed tie without damage benefit',()=>{const f=fixture();f.player.hand=[f.card(11,2)];f.target.hand=[f.card(11,4,true)];return skill(f,'csh_karl_hannan').ai.result.target(f.player,f.target)===0;});
check('hannan values a known winning comparison',()=>{const f=fixture();f.player.hand=[f.card(12,2)];f.target.hand=[f.card(4,4,true)];return skill(f,'csh_karl_hannan').ai.result.target(f.player,f.target)<0;});
check('hannan risk rises with unknown opponent hand count',()=>{const f=fixture();f.player.hand=[f.card(10,2)];f.target.hand=[f.card(4,3)];const s=skill(f,'csh_karl_hannan');const before=s.ai.result.target(f.player,f.target);f.target.hand.push(f.card(4,3),f.card(4,3),f.card(4,3));return before<0&&s.ai.result.target(f.player,f.target)>before;});
check('hannan considers own dying risk on a failed comparison',()=>{const f=fixture();f.player.hand=[f.card(11,2)];f.target.hand=[f.card(4,3),f.card(4,3)];const s=skill(f,'csh_karl_hannan'),before=s.ai.result.target(f.player,f.target);f.player.hp=1;return before<0&&s.ai.result.target(f.player,f.target)>before;});
check('hannan unknown card number/value does not affect decision',()=>{const f=fixture(),s=skill(f,'csh_karl_hannan');f.player.hand=[f.card(11,3)];const before=s.ai.result.target(f.player,f.target);f.target.hand.forEach(c=>{c.number=13;c.value=100;c.forbidden=true;});return s.ai.result.target(f.player,f.target)===before&&f.hiddenReads.length===0;});
check('hannan follows default compare card-value penalty',()=>{const f=fixture();f.player.hand=[f.card(13,10,false,'tao'),f.card(10,3)];f.target.hand=[f.card(11,3,true)];return skill(f,'csh_karl_hannan').ai.result.target(f.player,f.target)===0;});
const sheque=f=>skill(f,'csh_sheque').check({player:f.target},f.player);
check('sheque activation never reads raw opponent hand',()=>{const f=fixture();f.target.hand.forEach((c,i)=>c.color=i?'red':'black');sheque(f);return f.hiddenReads.length===0;});
check('sheque unknown card colors and values cannot change activation',()=>{const f=fixture();f.target.hand.forEach(c=>c.color='red');const before=sheque(f);f.target.hand[0].color='black';f.target.hand[0].value=100;return before===sheque(f);});
check('sheque unknown card objects may forbid all evaluation',()=>{const f=fixture();f.target.hand.forEach(c=>c.forbidden=true);return sheque(f)===true&&f.hiddenReads.length===0;});
check('sheque fully known same-color hand has no discard pair',()=>{const f=fixture();f.target.hand.forEach(c=>{c.known=true;c.color='red';});return sheque(f)===false;});
check('sheque known different colors can justify activation',()=>{const f=fixture();f.target.hand.forEach((c,i)=>{c.known=true;c.color=i?'red':'black';});return sheque(f)===true;});
check('sheque known cards avoid indirect recipient-hand evaluation',()=>{const f=fixture();f.target.rejectRecipientValue=true;f.target.hand.forEach((c,i)=>{c.known=true;c.color=i?'red':'black';});return sheque(f)===true;});
check('sheque old host without known-card API uses public count',()=>{const f=fixture();f.target.getKnownCards=undefined;f.target.hand.forEach(c=>c.forbidden=true);return sheque(f)===true&&f.hiddenReads.length===0;});
check('sheque rejects allied target without reading hand',()=>{const f=fixture();f.target.attitude=4;return sheque(f)===false&&f.hiddenReads.length===0;});
check('sheque absent target is neutral',()=>{const f=fixture();return skill(f,'csh_sheque').check({},f.player)===false;});
check('sheque fewer than two hand cards cannot make a color pair',()=>{const f=fixture();f.target.hand=[f.card(4,3)];return sheque(f)===false;});
check('sheque adverse attack can outweigh known discard value',()=>{const f=fixture();f.target.shaEffect=20;f.target.hand.forEach((c,i)=>{c.known=true;c.color=i?'red':'black';});return sheque(f)===false;});
check('sheque known colorless plus one unknown cannot make a pair',()=>{const f=fixture();f.target.hand[0].known=true;f.target.hand[0].color='none';return sheque(f)===false;});
const baseline=option('--baseline');if(baseline)check('rule AST unchanged outside explicit AI callbacks/helper',()=>ruleSignature(source)===ruleSignature(fs.readFileSync(baseline,'utf8')));
const zhanlai=f=>skill(f,'csh_zhanlai').ai.result.player(f.player,f.target);
check('zhanlai no own response cannot be overridden by target bonus',()=>{const f=fixture();f.player.hand=[f.card(4,3,false,'shan')];return f.get.effect(f.target,'csh_zhanlai',f.player,f.player)<=0;});
check('zhanlai no damage benefit cannot be overridden by target bonus',()=>{const f=fixture();f.target.damage=0;return f.get.effect(f.target,'csh_zhanlai',f.player,f.player)<=0;});
check('zhanlai opponent named hand counts are not read',()=>{const f=fixture();f.target.rejectNamedCount=true;return Number.isFinite(zhanlai(f));});
check('zhanlai hidden sha names do not affect activation estimate',()=>{const f=fixture();f.player.hand=[f.card(4,3)];const before=zhanlai(f);f.target.hand.forEach(c=>c.name='shan');return before===zhanlai(f);});
check('zhanlai fully known sufficient enemy responses reject losing duel',()=>{const f=fixture();f.player.hand=[f.card(4,3)];f.target.hand=[f.card(4,3,true),f.card(4,3,true)];return zhanlai(f)===0;});
check('zhanlai favorable known response advantage remains usable',()=>{const f=fixture();f.player.hand=[f.card(4,3)];f.target.hand=[f.card(4,3,true,'shan')];return zhanlai(f)>0;});
check('zhanlai luoyi accounts for two enemy responses per exchange',()=>{const f=fixture();f.player.hand=[f.card(4,3)];f.target.hand=[f.card(4,3,true)];f.player.skillSet=['csh_luoyi'];return zhanlai(f)>0;});
check('zhanlai missing target is neutral',()=>{const f=fixture();return skill(f,'csh_zhanlai').ai.result.player(f.player)===0;});
check('zhanlai old host known-card fallback never inspects raw opponent hand',()=>{const f=fixture();f.target.getKnownCards=undefined;f.target.rejectNamedCount=true;return Number.isFinite(zhanlai(f))&&f.hiddenReads.length===0;});
check('luoyi direct-hit estimate avoids named opponent hand query',()=>{const f=fixture();f.target.rejectNamedCount=true;return typeof skill(f,'csh_luoyi').ai.skillTagFilter(f.player,'directHit_ai',{card:{name:'juedou'},target:f.target})==='boolean';});
check('luoyi direct-hit estimate is invariant to unknown sha names',()=>{const f=fixture(),s=skill(f,'csh_luoyi').ai;f.player.hand=[f.card(4,3)];f.target.hand=[...f.target.hand,...f.target.hand,...f.target.hand];const a=s.skillTagFilter(f.player,'directHit_ai',{card:{name:'juedou'},target:f.target});f.target.hand.forEach(c=>c.name='shan');return a===s.skillTagFilter(f.player,'directHit_ai',{card:{name:'juedou'},target:f.target});});
const douyan=f=>f.get.effect(f.target,'csh_douyan',f.player,f.player);
check('douyan favorable known comparison has positive actual engine utility',()=>{const f=fixture();f.player.hand=[f.card(13,2)];f.target.hand=[f.card(4,2,true)];return f.get.effect(f.target,'csh_douyan',f.player,f.player)>0;});
check('douyan unknown opponent hand is never read raw',()=>{const f=fixture();douyan(f);return f.hiddenReads.length===0;});
check('douyan unknown numbers and values cannot affect scoring',()=>{const f=fixture(),before=douyan(f);f.target.hand.forEach(c=>{c.number=13;c.value=100;c.forbidden=true;});return douyan(f)===before&&f.hiddenReads.length===0;});
check('douyan old host without known-card API remains fair',()=>{const f=fixture();f.target.getKnownCards=undefined;f.target.hand.forEach(c=>c.forbidden=true);return Number.isFinite(douyan(f))&&f.hiddenReads.length===0;});
check('douyan guaranteed known tie spends cards without damage benefit',()=>{const f=fixture();f.player.hand=[f.card(13,2)];f.target.hand=[f.card(13,2,true)];return f.get.effect(f.target,'csh_douyan',f.player,f.player)<=0;});
check('douyan known losing lethal comparison is rejected',()=>{const f=fixture();f.player.hp=2;f.player.hand=[f.card(2,2)];f.target.hand=[f.card(13,2,true)];return f.get.effect(f.target,'csh_douyan',f.player,f.player)<=0;});
check('douyan enemy damage immunity cannot be overridden by own bonus',()=>{const f=fixture();f.target.damage=0;return f.get.effect(f.target,'csh_douyan',f.player,f.player)<=0;});
check('douyan enemy benefiting from damage is rejected',()=>{const f=fixture();f.target.damage=1.5;return f.get.effect(f.target,'csh_douyan',f.player,f.player)<=0;});
check('douyan high-value comparison card cost can outweigh damage',()=>{const f=fixture();f.player.hand=[f.card(13,60)];f.target.hand=[f.card(4,2,true)];return f.get.effect(f.target,'csh_douyan',f.player,f.player)<=0;});
check('douyan certain lethal retaliation is not masked by heal used in comparison',()=>{const f=fixture();f.player.hp=1;f.player.hand=[f.card(13,3,false,'tao')];f.target.hp=4;f.target.hand=[f.card(4,2,true)];return f.get.effect(f.target,'csh_douyan',f.player,f.player)<=0;});
check('douyan killing loser before retaliation retains positive utility',()=>{const f=fixture();f.player.hp=1;f.player.hand=[f.card(13,2)];f.target.hp=2;f.target.hand=[f.card(4,2,true)];return douyan(f)>0;});
check('douyan no target remains neutral',()=>{const f=fixture();return skill(f,'csh_douyan').ai.result.player(f.player)===0;});
check('douyan allied target cannot be selected for fixed reward',()=>{const f=fixture();f.target.attitude=4;return f.get.effect(f.target,'csh_douyan',f.player,f.player)<=0;});
for(const who of ['player','target'])check('douyan empty hand is neutral: '+who,()=>{const f=fixture();f[who].hand=[];return f.get.effect(f.target,'csh_douyan',f.player,f.player)<=0;});
for(const hp of [1,2])check('bizui never discounts lethal damage at '+hp+' HP',()=>{const f=fixture();f.target.hp=hp;f.get.tag=(c,t)=>t==='damage'?c.damage:0;return skill(f,'csh_bizui').ai.effect.target({damage:hp},f.player,f.target)===undefined;});
check('bizui ordinary damage leaving one HP may anticipate recovery',()=>{const f=fixture();f.target.hp=2;f.get.tag=(c,t)=>t==='damage'?c.damage:0;return skill(f,'csh_bizui').ai.effect.target({damage:1},f.player,f.target)?.[1]>0;});
check('bizui cannot anticipate prohibited recovery',()=>{const f=fixture();f.target.hp=2;f.target.hasSkillTag=t=>t==='norecover';f.get.tag=(c,t)=>t==='damage'?c.damage:0;return skill(f,'csh_bizui').ai.effect.target({damage:1},f.player,f.target)===undefined;});
const yiwuFixture=()=>{const f=fixture();f.ui.selected.buttons=[];f.status.event.maxNum=15;f.buttons=[f.card(13,9),f.card(7,6),f.card(8,6),f.card(12,0),f.card(13,0)].map(link=>({link}));f.status.event.dialog={buttons:f.buttons};return f;};
check('yiwu chooses combined public 7+8 value over greedy 13',()=>{const f=yiwuFixture();return f.yiwuAI(f.buttons[0])<0&&f.yiwuAI(f.buttons[1])>0&&f.yiwuAI(f.buttons[2])>0;});
check('yiwu recomputes remaining combination after first selection',()=>{const f=yiwuFixture();f.ui.selected.buttons=[f.buttons[1]];return f.yiwuAI(f.buttons[2])>0&&f.yiwuAI(f.buttons[0])===0;});
check('yiwu used budget prevents illegal extra choice',()=>{const f=yiwuFixture();f.ui.selected.buttons=[f.buttons[1],f.buttons[2]];return f.buttons.every(b=>f.yiwuAI(b)===0);});
check('yiwu can decline entirely harmful public cards',()=>{const f=yiwuFixture();f.buttons.forEach(b=>b.link.value=-10);return f.buttons.every(b=>f.yiwuAI(b)<0);});
check('yiwu numeric video dialog resolves through native dialog lookup',()=>{const f=yiwuFixture();f.status.event.dialog=12;f.get.idDialog=id=>id===12?{buttons:f.buttons}:null;return f.yiwuAI(f.buttons[1])>0&&f.yiwuAI(f.buttons[0])<0;});
check('yiwu missing or old dialog API keeps safe single-card fallback',()=>{const f=yiwuFixture();delete f.status.event.dialog;return Number.isFinite(f.yiwuAI(f.buttons[0]));});
check('yiwu extra large foreign dialog does not enumerate exponentially',()=>{const f=yiwuFixture();f.status.event.dialog.buttons=Array(40).fill(f.buttons[0]);return Number.isFinite(f.yiwuAI(f.buttons[0]));});
check('duolve replenishment does not penalize ordinary attack card utility',()=>{const f=fixture(),card={name:'sha'};const before=f.get.effect(f.target,card,f.player,f.player);f.player.getSkills=()=>['fixture_damage','csh_duolve'];return f.get.effect(f.target,card,f.player,f.player)===before;});
const yin=f=>skill(f,'csh_ssx_pianzhu').ai.result.player(f.player);
const yinFixture=()=>{const f=fixture();f.player.storage.csh_ssx_pianzhu=true;f.player.hand=[f.card(4,1,false,'shan')];f.target.equip=[{...f.card(5,4),type:'equip',owner:f.target}];return f;};
check('pianzhu yin uses non-sha legal hand cost',()=>{const f=yinFixture();return yin(f)>0&&skill(f,'csh_ssx_pianzhu').ai.order(null,f.player)>0;});
check('pianzhu costly discard cannot buy trivial equipment for fixed reward',()=>{const f=yinFixture();f.player.hand=[f.card(13,12)];f.target.equip[0].value=1;return yin(f)===0;});
check('pianzhu yin empty hand cannot activate',()=>{const f=yinFixture();f.player.hand=[];return yin(f)===0;});
check('pianzhu yin no equipment cannot activate',()=>{const f=yinFixture();f.target.equip=[];return yin(f)===0;});
check('pianzhu allied equipment loss is a team cost',()=>{const f=yinFixture();f.target.attitude=4;return yin(f)===0;});
check('pianzhu awake self equipment loss includes own double draw',()=>{const f=yinFixture();f.target.equip=[];f.player.equip=[{...f.card(5,4),type:'equip',owner:f.player}];f.player.skillSet=['csh_ssx_xiaoji2'];return yin(f)>0;});
check('pianzhu equipment estimates never query opponent recipient hand value',()=>{const f=yinFixture();f.target.rejectRecipientValue=true;return yin(f)>0&&f.hiddenReads.length===0;});
check('pianzhu yin hidden opponent contents cannot affect equipment choice',()=>{const f=yinFixture(),before=yin(f);f.target.hand.forEach(c=>{c.forbidden=true;c.value=99;});return yin(f)===before;});
const saran=f=>f.get.effect(f.target,'csh_ssx_saran',f.player,f.player);
check('saran no profitable attack window cannot gain target bonus',()=>{const f=fixture();f.target.shaEffect=0;f.target.natureEffects={thunder:0};return saran(f)<=0;});
check('saran known losing comparison cannot gain target bonus',()=>{const f=fixture();f.player.hand=[f.card(5,2)];f.target.hand=[f.card(13,3,true)];return saran(f)<=0;});
check('saran known tie cannot gain target bonus',()=>{const f=fixture();f.player.hand=[f.card(13,2)];f.target.hand=[f.card(13,3,true)];return saran(f)<=0;});
check('saran known winning comparison remains profitable',()=>{const f=fixture();f.player.hand=[f.card(13,2)];f.target.hand=[f.card(3,3,true)];return saran(f)>0;});
check('saran never reads raw opponent hand',()=>{const f=fixture();saran(f);return f.hiddenReads.length===0;});
check('saran hidden points cannot alter activation',()=>{const f=fixture(),before=saran(f);f.target.hand.forEach(c=>{c.forbidden=true;c.number=13;});return saran(f)===before;});
check('saran old host without known-card API remains fair',()=>{const f=fixture();f.target.getKnownCards=undefined;f.target.hand.forEach(c=>c.forbidden=true);return Number.isFinite(saran(f))&&f.hiddenReads.length===0;});
check('saran attack valuation ignores distance and ordinary sha count',()=>{const f=fixture();f.player.hand=[f.card(13,2)];f.target.hand=[f.card(3,3,true)];f.target.far=true;f.player.shaUsed=true;return saran(f)>0;});
check('saran second win values two actual virtual attacks',()=>{const f=fixture();f.player.hand=[f.card(13,2)];f.target.hand=[f.card(3,3,true)];const before=saran(f);f.player.storage.csh_ssx_saran_wins=1;return saran(f)>before;});
check('saran expensive compare card can outweigh attack gain',()=>{const f=fixture();f.player.hand=[f.card(13,80)];f.target.hand=[f.card(3,3,true)];return saran(f)<=0;});
check('saran absent target remains neutral',()=>{const f=fixture();return skill(f,'csh_ssx_saran').ai.result.player(f.player)===0;});
check('saran allied comparison follows lowest card cooperation',()=>{const f=fixture(),enemy=f.person('enemy');enemy.hand=[f.card(8,3)];f.get.attitude=(a,b)=>a===b?4:b===enemy?-4:4;f.ctx.game.players.push(enemy);f.player.hand=[f.card(10,2)];f.target.hand=[f.card(3,2,true),f.card(12,3,true)];return saran(f)>0;});
check('saran actual response callback helps allied initiator',()=>{const f=fixture();f.target.attitude=4;f.status.event={player:f.target,getParent:()=>({name:'csh_ssx_saran',player:f.player})};return f.saranChoices[0](f.card(3,2))>f.saranChoices[0](f.card(12,2));});
check('saran actual initiator response keeps high point preference',()=>{const f=fixture();f.status.event={player:f.player,getParent:()=>({name:'csh_ssx_saran',player:f.player})};return f.saranChoices[0](f.card(12,2))>f.saranChoices[0](f.card(3,2));});
check('saran chosen thunder attack target uses actual thunder card',()=>{const f=fixture();f.target.natureEffects={thunder:0};f.status.event.card={name:'sha',nature:'thunder',isCard:true};return f.saranChoices[2](f.target)===0;});
const guanxu=f=>f.get.effect(f.target,'csh_hyy_guanxu',f.player,f.player);
check('guanxu activation never reads raw unseen hand',()=>{const f=fixture();guanxu(f);return f.hiddenReads.length===0;});
check('guanxu hidden suit changes cannot alter activation',()=>{const f=fixture(),before=guanxu(f);f.target.hand.forEach(c=>{c.forbidden=true;c.suit='heart';});return guanxu(f)===before&&f.hiddenReads.length===0;});
check('guanxu old host without known-card API uses public counts',()=>{const f=fixture();f.target.getKnownCards=undefined;f.target.hand.forEach(c=>c.forbidden=true);return Number.isFinite(guanxu(f))&&f.hiddenReads.length===0;});
check('guanxu public hand count still changes expected value',()=>{const f=fixture(),before=guanxu(f);f.target.hand.push(f.card(8),f.card(9),f.card(10));return guanxu(f)>before;});
check('guanxu known same-suit triple can affect estimate',()=>{const f=fixture();f.target.hand=[f.card(5,3,true),f.card(6,3,true),f.card(7,3,true)];const before=guanxu(f);f.target.hand.forEach((c,i)=>c.suit=['spade','heart','club'][i]);return guanxu(f)<before;});
check('guanxu missing or empty target is neutral',()=>{const f=fixture();f.target.hand=[];return guanxu(f)===0&&skill(f,'csh_hyy_guanxu').ai.result.target(f.player)===0;});
const qicaiCard=f=>f.hyy.csh_hyy_qicai_ai;
check('qicai blank hand button cannot reveal unknown value',()=>{const f=fixture(),c={...f.card(5,8),owner:f.target,position:'h',forbidden:true};return Number.isFinite(qicaiCard(f)({link:c}));});
check('qicai unknown identities have identical score',()=>{const f=fixture(),c={...f.card(5,2),owner:f.target,position:'h'},before=qicaiCard(f)({link:c});c.value=100;c.forbidden=true;return qicaiCard(f)({link:c})===before;});
check('qicai known foreign card avoids recipient hand value lookup',()=>{const f=fixture(),c={...f.card(5,8,true),owner:f.target};f.target.hand=[c];f.target.rejectRecipientValue=true;return Number.isFinite(qicaiCard(f)({link:c}));});
check('qicai prefers taking publicly valuable enemy equipment',()=>{const f=fixture(),make=v=>({link:{...f.card(5,v,true),owner:f.target,position:'e'}});return qicaiCard(f)(make(9))>qicaiCard(f)(make(2));});
check('qicai protects own high-value card when choosing to return one',()=>{const f=fixture(),make=v=>({link:{...f.card(5,v,true),owner:f.player}});return qicaiCard(f)(make(2))>qicaiCard(f)(make(9));});
check('qicai old known-card API fallback keeps unknown buttons private',()=>{const f=fixture();f.target.getKnownCards=undefined;return Number.isFinite(qicaiCard(f)({link:{...f.card(5,4),owner:f.target,forbidden:true}}));});
check('qicai missing owner is neutral',()=>{const f=fixture();return qicaiCard(f)({link:f.card(5,4)})===0;});
check('linglong cannot advertise response during round cooldown',()=>{const f=fixture();f.player.expansions=[f.card(5,4,false,'sha')];f.ctx.game.roundNumber=5;f.player.storage.csh_hyy_linglong_roundcount=5;return skill(f,'csh_hyy_linglong').ai.skillTagFilter(f.player,'respondSha')===false;});
check('linglong round zero marker also prevents duplicate response',()=>{const f=fixture();f.player.expansions=[f.card(5,4,false,'sha')];f.ctx.game.roundNumber=0;f.player.storage.csh_hyy_linglong_roundcount=0;return skill(f,'csh_hyy_linglong').ai.skillTagFilter(f.player,'respondSha')===false;});
check('linglong advertises real response after cooldown expires',()=>{const f=fixture();f.player.expansions=[f.card(5,4,false,'sha')];f.ctx.game.roundNumber=6;f.player.storage.csh_hyy_linglong_roundcount=5;return skill(f,'csh_hyy_linglong').ai.skillTagFilter(f.player,'respondSha')===true;});
check('linglong phase use rejects card with no positive legal effect',()=>{const f=fixture();f.target.shaEffect=0;f.status.event.getParent=()=>({type:'phase'});return skill(f,'csh_hyy_linglong').chooseButton.check({link:f.card(5,8)})===0;});
check('linglong legal response preserves higher opportunity-value copy',()=>{const f=fixture();f.status.event.getParent=()=>({type:'respond'});const check=skill(f,'csh_hyy_linglong').chooseButton.check;return check({link:f.card(5,2)})>check({link:f.card(5,8)});});
check('jizhi one-card emergency prioritizes immediate hand resource',()=>{const f=fixture();f.player.hand=[f.card(5,2)];f.player.skillSet=['csh_hyy_linglong'];return f.hyy.csh_hyy_jizhi_ai()==='牌堆顶';});
check('jizhi stocked hand may prepare linglong expansion resource',()=>{const f=fixture();f.player.skillSet=['csh_hyy_linglong'];return f.hyy.csh_hyy_jizhi_ai()==='牌堆底';});
const zuilunFixture=()=>{const f=fixture();f.player.discarded=true;f.player.notMin=true;return f;};
check('zuilun no-card branch declines mutual ally HP loss',()=>{const f=zuilunFixture();f.target.attitude=4;return !skill(f,'csh_hyy_zuilun').check({},f.player);});
check('zuilun no-card branch declines enemy benefiting from HP loss',()=>{const f=zuilunFixture();f.target.losehp=2;return !skill(f,'csh_hyy_zuilun').check({},f.player);});
check('zuilun favorable HP trade ignores damage immunity',()=>{const f=zuilunFixture();f.target.losehp=-3;f.target.damage=0;return skill(f,'csh_hyy_zuilun').check({},f.player);});
check('zuilun ordinary gain branch remains available',()=>{const f=fixture();f.player.notMin=true;return skill(f,'csh_hyy_zuilun').check({},f.player);});
check('zuilun keeps highest-value revealed card rather than deck order',()=>{const f=fixture();f.status.event.num=2;const cards=[f.card(5,9),f.card(4,1),f.card(7,5)],r=f.hyy.csh_hyy_zuilun_processAI([['牌堆顶',cards]]);return r[0].length===2&&r[1].length===1&&r[1][0]===cards[0]&&new Set([...r[0],...r[1]]).size===3;});
check('zuilun target considers HP-loss benefit rather than attitude alone',()=>{const f=fixture(),other=f.person('other');f.target.losehp=2;other.losehp=-3;return f.hyy.zuilunTarget(other)>f.hyy.zuilunTarget(f.target);});
check('AI rule exclusions do not hide linglong card conversion mechanism',()=>{const node=property(property(pack,'csh_hyy_linglong'),'hiddenCard');const changed=source.slice(0,node.range[0])+'function(){return false;}'+source.slice(node.range[1]);return ruleSignature(source)!==ruleSignature(changed);});
check('AI rule exclusions do not hide zuilun move-count constraint',()=>{let node;walk(property(pack,'csh_hyy_zuilun'),n=>{if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='set'&&n.arguments[0]?.value==='num')node=n.arguments[1];});const changed=source.slice(0,node.range[0])+'99'+source.slice(node.range[1]);return ruleSignature(source)!==ruleSignature(changed);});
check('rule comparison detects changed activation count',()=>{const value=property(property(pack,'csh_jiaomeng'),'usable');const changed=source.slice(0,value.range[0])+'4'+source.slice(value.range[1]);return ruleSignature(source)!==ruleSignature(changed);});
check('jiaomeng helper is referenced only by its AI',()=>{const node=property(pack,'csh_jiaomeng'),ai=property(node,'ai');let bad=false,calls=0;walk(ast,n=>{if(n.type==='MemberExpression'&&n.property.name==='_advantage'){calls++;if(n.range[0]<ai.range[0]||n.range[1]>ai.range[1])bad=true;}});return calls===3&&!bad;});
const failures=results.filter(r=>!r.passed);console.log(JSON.stringify({scope:'isolated actual skill/known-card/host-effect callbacks; no real game or saves',passed:results.length-failures.length,failed:failures.length,failures},null,2));process.exitCode=failures.length?1:0;
