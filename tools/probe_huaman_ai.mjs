// Isolated Huaman callbacks plus the installed Noname effect/known-card methods.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';
import {root,host,parse,walk,keyOf,property,skillsOf} from './lib/skill_audit.mjs';
const option=n=>{const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1];};
const source=fs.readFileSync(option('--source')||path.join(root,'skills/index.js'),'utf8');
const pack=skillsOf(parse(source)), ids=['csh_manyi','csh_xiangzhen','csh_xizhan'];
const results=[],metrics={};
function check(name,fn){try{const detail=fn();results.push({name,passed:detail===true,...(detail===true?{}:{detail})});}catch(error){results.push({name,passed:false,error:error.message});}}
async function checkAsync(name,fn){try{const detail=await fn();results.push({name,passed:detail===true,...(detail===true?{}:{detail})});}catch(error){results.push({name,passed:false,error:error.message});}}
const hostMethods={};
for(const [file,names]of [['noname/get/index.js',['effect','damageEffect']],['noname/library/element/player.js',['iterableGetKnownCards','getKnownCards']]]){
  const text=fs.readFileSync(path.join(host,file),'utf8');walk(parse(text),n=>{if(n.type==='MethodDefinition'&&names.includes(keyOf(n)))hostMethods[keyOf(n)]=text.slice(...n.range);});
}
const standard=fs.readFileSync(path.join(host,'card/standard.js'),'utf8');
let nanmanAI;walk(parse(standard),n=>{if(n.type==='Property'&&keyOf(n)==='nanman'&&property(n.value,'ai'))nanmanAI=standard.slice(...property(n.value,'ai').range);});
if(!nanmanAI)throw Error('Native Nanman AI not located');
function fixture(){
  const reads=[], hiddenReads=[];
  function card(name='sha',type='basic',value=1,known=false,color='black'){return {name,type,value,known,color,isKnownBy(viewer){return this.owner===viewer||this.known;}};}
  function person(id,att=-4){return {id,hp:3,maxHp:4,sex:'male',hujia:0,hand:[],equips:[],storage:{},att,skillSet:[],tags:{},used:0,damage:-1.5,fire:-1.5,
    getCards(zone,filter){if(this!==player&&zone.includes('h')){hiddenReads.push(this.id);throw Error('Raw opponent hand read');}const cs=zone==='e'?this.equips:zone==='he'?[...this.hand,...this.equips]:this.hand;return cs.filter(c=>!filter||filter(c));},
    *iterableGetCards(){yield* this.hand;},
    countCards(zone,filter){const cs=zone==='e'?this.equips:zone==='he'?[...this.hand,...this.equips]:this.hand;if(this!==player&&typeof filter==='string'&&(this.rejectNamedCount||cs.some(c=>c.forbidden)))throw Error('Hidden named count');return !filter?cs.length:typeof filter==='function'?cs.filter(filter).length:cs.filter(c=>c.name===filter).length;},
    hasSkillTag(tag){return !!this.tags[tag];},hasSkill(id){return this.skillSet.includes(id);},getSkills(){return ['fixture_damage',...this.skillSet];},getStat(){return {csh_xiangzhen:this.used};},
    canUse(c,target){return this!==target&&!target.disabled;},isIn(){return true;},isLinked(){return false;},
    getDamagedHp(){return this.maxHp-this.hp;},isDamaged(){return this.hp<this.maxHp;},countCharge(){return 2;},countMark(){return 2;},countGainableCards(){return this.hand.length+this.equips.length;},canCompare(other){return this.hand.length>0&&other.hand.length>0;}};}
  const player=person('huaman',4),target=person('foe');player.sex='female';
  const put=(p,cards)=>{p.hand=cards;for(const c of cards)c.owner=p;return cards;};
  put(player,[card('sha'),card('shan')]);put(target,[card('shan'),card('shan')]);
  const lib={card:{liehuo:{}},skill:{global:[]},filter:{cardRespondable:(c,p)=>!p.noRespond&&!c.blocked,cardEnabled:()=>true,cardDiscardable:c=>!c.locked},element:{VCard:class{constructor(c){Object.assign(this,c);}}}};
  const ui={selected:{cards:[],targets:[]}},status={event:{player}};
  const game={players:[player,target],expandSkills(){},filterPlayer(fn){return game.players.filter(fn||(()=>true));},hasPlayer(fn){return game.players.some(fn);},log(){},broadcastAll(fn,...args){fn(...args);}};
  const get={player:()=>status.event.player,event:()=>status.event,autoViewAs:c=>c,itemtype:()=>'',
    attitude:(a,b)=>a===b?4:a===player?b.att:b===player?a.att:b.att,
    name(c){if(c.forbidden)throw Error('Hidden name inspected');return c.name;},type:c=>c.type,type2:c=>c.type==='delay'?'trick':c.type,
    color(c){if(c.forbidden)throw Error('Hidden color inspected');return c.color;},value(c,p){if(c.forbidden||p&&p!==player)throw Error('Hidden or recipient value inspected');reads.push(c);return c.value;},
    tag:(c,tag)=>tag==='respondSha'?c.name==='nanman':tag==='natureDamage'?c.name==='firedamage':false,
    info(c){return typeof c==='string'?lib.skill[c]:lib.card[c.name];},
    result(c){if(typeof c==='string')return lib.skill[c].ai?.result||{};return lib.card[c.name]?.ai?.result||{target:-1.5};},
    mode:()=> 'identity',sgnAttitude:(a,b)=>Math.sign(get.attitude(a,b)),translation:x=>x?.name||x};
  const ctx=vm.createContext({lib,ui,game,get,_status:status,console,CacheContext:{requireCacheContext:()=>({get,delegate:x=>x})}});
  const engine=vm.runInContext('({'+Object.values(hostMethods).join(',\n')+'})',ctx);
  get.effect=engine.effect;get.damageEffect=engine.damageEffect;
  for(const p of [player,target]){p.iterableGetKnownCards=engine.iterableGetKnownCards;p.getKnownCards=engine.getKnownCards;}
  lib.card.nanman={ai:vm.runInContext('('+nanmanAI+')',ctx)};
  lib.skill.fixture_damage={ai:{effect:{target(c,from,to){if(c.name==='nanman'&&to.immune)return 'zerotarget';if(c.name==='damage')return to.damage===0?'zerotarget':to.damage/-1.5;if(c.name==='firedamage')return to.fire===0?'zerotarget':to.fire/-1.5;}}}};
  for(const id of ids)lib.skill[id]=vm.runInContext('('+source.slice(...property(pack,id).range)+')',ctx);
  function add(id,att){const p=person(id,att);p.iterableGetKnownCards=engine.iterableGetKnownCards;p.getKnownCards=engine.getKnownCards;game.players.push(p);return p;}
  return {lib,ui,status,ctx,game,get,player,target,card,put,add,reads,hiddenReads,skill:lib.skill.csh_xiangzhen,manyi:lib.skill.csh_manyi};
}
const score=f=>f.skill.ai.result.player(f.player);
check('activation never uses named opponent hand counts',()=>{const f=fixture();f.target.rejectNamedCount=true;return Number.isFinite(score(f));});
check('hidden sha/shan names cannot alter activation',()=>{const f=fixture();const before=score(f);f.target.hand.forEach(c=>c.name='sha');return score(f)===before;});
check('hidden content objects cannot be evaluated',()=>{const f=fixture();f.target.hand.forEach(c=>c.forbidden=true);return Number.isFinite(score(f))&&f.hiddenReads.length===0;});
check('known sha increases response probability over known shan',()=>{const f=fixture();f.put(f.target,[f.card('shan','basic',1,true)]);const before=f.skill.ai.responseChance(f.player,f.target);f.target.hand[0].name='sha';return f.skill.ai.responseChance(f.player,f.target)>before;});
check('known blocked sha does not guarantee response',()=>{const f=fixture();f.put(f.target,[f.card('sha','basic',1,true)]);f.target.hand[0].blocked=true;return f.skill.ai.responseChance(f.player,f.target)===0;});
check('response disallowed is respected',()=>{const f=fixture();f.target.noRespond=true;return f.skill.ai.responseChance(f.player,f.target)===0;});
check('old known-card API absence uses public count in estimator',()=>{const f=fixture();f.target.getKnownCards=undefined;f.target.hand.forEach(c=>c.forbidden=true);return f.skill.ai.responseChance(f.player,f.target)>0;});
check('larger unknown count means larger response probability',()=>{const f=fixture();const before=f.skill.ai.responseChance(f.player,f.target);f.target.hand.push(f.card());return f.skill.ai.responseChance(f.player,f.target)>before;});
check('free response conversion is considered',()=>{const f=fixture();f.target.tags.freeSha=true;return f.skill.ai.responseChance(f.player,f.target)===1;});
check('respondSha conversion raises response floor',()=>{const f=fixture();f.target.tags.respondSha=true;return f.skill.ai.responseChance(f.player,f.target)>=0.65;});
check('noSha overrides unknown response estimate',()=>{const f=fixture();f.target.tags.noSha=true;return f.skill.ai.responseChance(f.player,f.target)===0;});
check('allied-only damage is rejected',()=>{const f=fixture();f.target.att=4;return score(f)<=0;});
check('neutral target grants no invented attack reward',()=>{const f=fixture();f.target.att=0;return score(f)<=0;});
check('immune target grants no fixed attack reward',()=>{const f=fixture();f.target.immune=true;return score(f)<=0;});
check('no legal attack target grants no reward',()=>{const f=fixture();f.target.disabled=true;return score(f)<=0;});
check('expensive pair can outweigh attack benefit',()=>{const f=fixture();f.player.hand.forEach(c=>c.value=30);return score(f)<=0;});
check('fewer than two eligible cards cannot activate',()=>{const f=fixture();f.put(f.player,[f.card()]);return score(f)===0;});
check('equipment is never considered as payment',()=>{const f=fixture();f.put(f.player,[f.card(),f.card('weapon','equip')]);return score(f)===0;});
check('undiscardable hand card is never payment',()=>{const f=fixture();f.player.hand[0].locked=true;return score(f)===0;});
check('basic/basic mode matches content',()=>{const f=fixture();return f.skill.ai.pairMode(f.player.hand)==='usable2';});
check('basic/trick mode matches content',()=>{const f=fixture();f.player.hand[1].type='trick';return f.skill.ai.pairMode(f.player.hand)==='unrespond';});
check('trick/delay mode matches content',()=>{const f=fixture();f.player.hand[0].type='trick';f.player.hand[1].type='delay';return f.skill.ai.pairMode(f.player.hand)==='damage+1';});
check('unrecognised card types receive no phantom branch',()=>{const f=fixture();f.player.hand[1].type='special';return f.skill.ai.pairMode(f.player.hand)==='';});
check('cost distinguishes otherwise equivalent pairs',()=>{const f=fixture();const a=f.card('sha','basic',1),b=f.card('shan','basic',3);f.put(f.player,[a,b,f.card('tao','basic',20)]);return f.skill.check(a)>f.skill.check(f.player.hand[2]);});
check('selected first card is preserved in second-card score',()=>{const f=fixture();const a=f.card('sha','basic',1),b=f.card('shan','basic',1),c=f.card('tao','basic',30);f.put(f.player,[a,b,c]);f.ui.selected.cards=[a];return f.skill.check(b)>f.skill.check(c);});
check('second-card choice can pay more for the better combo',()=>{const f=fixture();f.put(f.target,[f.card('sha','basic',1,true)]);const a=f.card('sha','basic',1),b=f.card('shan','basic',1),c=f.card('wuxie','trick',3);f.put(f.player,[a,b,c]);f.ui.selected.cards=[a];return f.skill.check(c)>f.skill.check(b);});
check('known sha makes mixed direct-hit pair more valuable',()=>{const f=fixture();f.put(f.target,[f.card('sha','basic',1,true)]);const basic=[f.card(),f.card()],mixed=[f.card(),f.card('wuxie','trick')];return f.skill.ai.pairScore(f.player,mixed)>f.skill.ai.pairScore(f.player,basic);});
check('damage pair raises current base before attack',()=>{const f=fixture();f.put(f.target,[f.card('shan','basic',1,true)]);return f.skill.ai.blastScore(f.player,'damage+1')>f.skill.ai.blastScore(f.player,'usable2');});
check('existing permanent base is included',()=>{const f=fixture();const before=score(f);f.player.storage.csh_xiangzhen_base=2;return score(f)>before;});
check('allied damage penalty grows with permanent base',()=>{const f=fixture();f.target.att=4;const before=score(f);f.player.storage.csh_xiangzhen_base=2;return score(f)<before;});
check('basic pair alone gets no fake second activation bonus',()=>{const f=fixture();return score(f)===f.skill.ai.pairScore(f.player,f.player.hand);});
check('two basic pairs support a real second activation',()=>{const f=fixture();f.player.hand.push(f.card(),f.card());return score(f)>f.skill.ai.pairScore(f.player,f.player.hand.slice(0,2));});
check('second activation cannot open a third activation',()=>{const f=fixture();f.player.hand.push(f.card(),f.card());const first=score(f);f.player.used=1;f.player.storage.csh_xiangzhen_double=true;return score(f)<first;});
check('unaffordable remaining pair grants no follow-up',()=>{const f=fixture();f.player.hand.push(f.card('sha','basic',100),f.card('shan','basic',100));return score(f)===f.skill.ai.pairScore(f.player,f.player.hand.slice(0,2));});
check('required card outside legal payment is rejected',()=>{const f=fixture();return f.skill.ai.bestPair(f.player,[f.card()])===0;});
check('manyi is neutral for unrelated card effects',()=>{const f=fixture();return f.manyi.ai.effect.target({name:'sha'},f.player,f.target)===undefined;});
check('manyi immunity gives no fictitious bonus without hand',()=>{const f=fixture();f.target.hand=[];const result=f.manyi.ai.effect.target({name:'nanman'},f.player,f.target);return result[0]===0&&result[1]===0;});
check('manyi missing native liehuo gives no bonus',()=>{const f=fixture();delete f.lib.card.liehuo;return f.manyi.ai.effect.target({name:'nanman'},f.player,f.target)[1]===0;});
check('manyi all players empty gives no bonus',()=>{const f=fixture();f.player.hand=[];return f.manyi.ai.effect.target({name:'nanman'},f.player,f.target)[1]===0;});
check('manyi hidden colors cannot alter retaliation estimate',()=>{const f=fixture();const before=f.manyi.ai.effect.target({name:'nanman'},f.player,f.target)[1];f.target.hand.forEach(c=>c.color='red');return before===f.manyi.ai.effect.target({name:'nanman'},f.player,f.target)[1];});
check('manyi never evaluates hidden cards or recipient values',()=>{const f=fixture();f.target.hand.forEach(c=>c.forbidden=true);return Number.isFinite(f.manyi.ai.effect.target({name:'nanman'},f.player,f.target)[1])&&f.hiddenReads.length===0&&f.reads.length===0;});
check('manyi known matching colors can hurt enemy',()=>{const f=fixture();f.target.hand.forEach(c=>{c.known=true;c.color='black';});return f.manyi.ai.effect.target({name:'nanman'},f.player,f.target)[1]>0;});
check('manyi known opposed colors have no collision or payment',()=>{const f=fixture();f.target.hand.forEach(c=>{c.known=true;c.color='red';});return f.manyi.ai.effect.target({name:'nanman'},f.player,f.target)[1]===0;});
check('manyi friendly fire is penalised',()=>{const f=fixture();f.player.att=4;f.target.att=4;f.target.hand.forEach(c=>{c.known=true;c.color='black';});return f.manyi.ai.effect.target({name:'nanman'},f.player,f.target)[1]<0;});
check('manyi fire immunity leaves only actual discard cost',()=>{const f=fixture();f.player.fire=0;f.target.hand.forEach(c=>{c.known=true;c.color='black';});return f.manyi.ai.effect.target({name:'nanman'},f.player,f.target)[1]<0;});
check('manyi colorless cards do not cause red/black collisions',()=>{const f=fixture();f.target.hand.forEach(c=>{c.known=true;c.color='none';});return f.manyi.ai.effect.target({name:'nanman'},f.player,f.target)[1]===0;});
check('manyi old host API absence does not read hidden cards',()=>{const f=fixture();f.target.getKnownCards=undefined;f.target.hand.forEach(c=>c.forbidden=true);return Number.isFinite(f.manyi.ai.effect.target({name:'nanman'},f.player,f.target)[1]);});
check('manyi full native get.effect honours immunity',()=>{const f=fixture();f.target.skillSet=['csh_manyi'];f.target.hand=[];return f.get.effect(f.target,{name:'nanman'},f.player,f.player)===0;});
check('larger own hand stays finite without repeated blast scans',()=>{const f=fixture();f.put(f.player,Array.from({length:50},(_,i)=>f.card('sha',i%3?'basic':'trick',i%7)));const effect=f.get.effect;let calls=0;f.get.effect=(...args)=>{if(args[1]?.name==='nanman')calls++;return effect(...args);};return Number.isFinite(score(f))&&calls===4;});
check('AI estimation does not mutate hand or skill state',()=>{const f=fixture();const before=JSON.stringify([f.player.hand.map(({owner,...card})=>card),f.player.storage]);score(f);f.skill.check(f.player.hand[0]);return JSON.stringify([f.player.hand.map(({owner,...card})=>card),f.player.storage])===before&&f.ui.selected.cards.length===0;});
check('seven representative pairs equal exhaustive disjoint search',()=>{
  let seed=76261;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  for(let run=0;run<120;run++){
    const f=fixture(),n=4+run%6;f.put(f.player,Array.from({length:n},(_,i)=>f.card('card'+i,['basic','trick','delay','special'][Math.floor(rand()*4)],Math.floor(rand()*18)-2)));
    f.player.storage.csh_xiangzhen_base=run%3;f.player.used=run%4===0?1:0;f.player.storage.csh_xiangzhen_double=run%5===0;f.target.att=run%7===0?4:-4;
    const pairs=[];for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){const cards=[f.player.hand[i],f.player.hand[j]];pairs.push({cards,score:f.skill.ai.pairScore(f.player,cards)});}
    for(const required of [[],[f.player.hand[run%n]],[f.player.hand[0],f.player.hand[n-1]]]){
      let expected=-Infinity;
      for(const pair of pairs){
        if(required.some(card=>!pair.cards.includes(card)))continue;let value=pair.score;
        if(f.skill.ai.pairMode(pair.cards)==='usable2'&&!f.player.used&&!f.player.storage.csh_xiangzhen_double){let follow=0;for(const other of pairs)if(other.cards.every(card=>!pair.cards.includes(card)))follow=Math.max(follow,other.score);value+=follow;}
        expected=Math.max(expected,value);
      }
      if(Math.abs(f.skill.ai.bestPair(f.player,required)-expected)>1e-9)return {run,required:required.length,expected,actual:f.skill.ai.bestPair(f.player,required)};
    }
  }
  return true;
});
check('128-card activation and every candidate obey time/scan budget',()=>{
  const f=fixture(),n=128;f.put(f.player,Array.from({length:n},(_,i)=>f.card('card'+i,i%4?'basic':'trick',i%11)));
  vm.runInContext('globalThis.auditFindVisits=0; const originalFind=Array.prototype.find; Array.prototype.find=function(predicate,thisArg){return originalFind.call(this,function(...args){auditFindVisits++;return predicate.apply(thisArg,args);});};',f.ctx);
  const begin=performance.now();const values=[score(f),...f.player.hand.map(card=>f.skill.check(card))];const elapsed=performance.now()-begin;
  metrics.largeHand={cards:n,decisions:values.length,elapsedMs:Math.round(elapsed),findVisits:f.ctx.auditFindVisits,valueReads:f.reads.length};
  return values.every(Number.isFinite)&&elapsed<6000&&f.ctx.auditFindVisits<12*n*n*(n+1)&&f.reads.length===n*(n+1);
});
// Execute the rule branches as an extra contract check; these callbacks are not edited.
for(const [types,mode]of [[['basic','basic'],'usable2'],[['basic','trick'],'unrespond'],[['trick','delay'],'damage+1']])await checkAsync('actual content branch '+mode,async()=>{
  const f=fixture();let used;f.player.useCard=(card,targets,count)=>{used={card,targets,count};return used;};f.player.markSkill=()=>{};
  await f.skill.content({cards:types.map((type,i)=>f.card('card'+i,type))},null,f.player);
  return used.card.name==='nanman'&&used.targets.length===1&&(mode==='usable2'?f.player.storage.csh_xiangzhen_double===true:mode==='unrespond'?used.directHit.length===2:f.player.storage.csh_xiangzhen_base===1);
});
for(const [present,expected]of [[['sbzaiqi','relieren'],['sbzaiqi','relieren']],[['zaiqi','sblieren'],['zaiqi','sblieren']],[['zaiqi','lieren'],['zaiqi','lieren']],[[],[]]])await checkAsync('mission success grants native/fallback '+present.join(','),async()=>{
  const f=fixture();let obtained=[],maxhp=0,awake=false;for(const id of present)f.lib.skill[id]={};f.player.gainMaxHp=()=>maxhp++;f.player.addSkills=async skills=>obtained=[...skills];f.player.awakenSkill=()=>awake=true;
  await f.lib.skill.csh_xizhan.subSkill.success.content({},null,f.player);return maxhp===1&&awake&&f.player.storage.csh_xizhan_done===true&&JSON.stringify(obtained)===JSON.stringify(expected);
});
check('mission failure only male damage sources',()=>{const f=fixture(),filter=f.lib.skill.csh_xizhan.subSkill.fail.filter;const event={getParent:()=>({source:f.target})};const yes=filter(event,f.player);f.target.sex='female';return yes&&!filter(event,f.player);});
check('mission completed flag blocks both endings',()=>{const f=fixture();f.player.storage.csh_xizhan_done=true;return !f.lib.skill.csh_xizhan.subSkill.success.filter({},f.player)&&!f.lib.skill.csh_xizhan.subSkill.fail.filter({source:f.target},f.player);});
check('phase-use reset clears extra activation only',()=>{const f=fixture();f.player.storage={csh_xiangzhen_double:true,csh_xiangzhen_base:2};f.ctx.player=f.player;f.skill.subSkill.reset.content();return !f.player.storage.csh_xiangzhen_double&&f.player.storage.csh_xiangzhen_base===2;});
check('nanman damage modifier only matches own use event',()=>{const f=fixture();f.player.storage.csh_xiangzhen_base=2;const filter=f.skill.subSkill.dmg.filter;return filter({card:{name:'nanman'}},f.player)&&!filter({card:{name:'sha'}},f.player);});
check('nanman damage modifier adds persistent base',()=>{const f=fixture();f.player.storage.csh_xiangzhen_base=2;f.ctx.player=f.player;f.ctx.trigger={baseDamage:1};f.skill.subSkill.dmg.content();return f.ctx.trigger.baseDamage===3;});
// Compare only this agent's three skill objects: other concurrent work is excluded.
function signature(text){
  const pack=skillsOf(parse(text));
  function norm(value){if(Array.isArray(value))return value.map(norm);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['parent','tokens','comments','loc','range','start','end','raw'].includes(k)).map(([k,v])=>[k,norm(v)]));return value;}
  return JSON.stringify(ids.map(id=>{const object=property(pack,id);return norm({...object,properties:object.properties.filter(p=>keyOf(p)!=='ai'&&!(id==='csh_xiangzhen'&&keyOf(p)==='check'))});}));
}
const baseline=option('--baseline');if(baseline)check('full Huaman non-AI AST unchanged',()=>signature(source)===signature(fs.readFileSync(baseline,'utf8')));
check('rule guard rejects altered payment count',()=>{const node=property(property(pack,'csh_xiangzhen'),'selectCard');return signature(source)!==signature(source.slice(0,node.range[0])+'3'+source.slice(node.range[1]));});
check('rule guard rejects altered content branch',()=>signature(source)!==signature(source.replace('if (effect === "damage+1") {','if (effect === "unrespond") {')));
const compareNames=new Set(['activation never uses named opponent hand counts','hidden sha/shan names cannot alter activation','hidden content objects cannot be evaluated','allied-only damage is rejected','neutral target grants no invented attack reward','immune target grants no fixed attack reward','no legal attack target grants no reward','expensive pair can outweigh attack benefit','fewer than two eligible cards cannot activate','equipment is never considered as payment','undiscardable hand card is never payment','cost distinguishes otherwise equivalent pairs','selected first card is preserved in second-card score','second-card choice can pay more for the better combo','existing permanent base is included','allied damage penalty grows with permanent base','manyi is neutral for unrelated card effects','manyi immunity gives no fictitious bonus without hand','manyi missing native liehuo gives no bonus','manyi all players empty gives no bonus','manyi hidden colors cannot alter retaliation estimate','manyi never evaluates hidden cards or recipient values','manyi known matching colors can hurt enemy','manyi known opposed colors have no collision or payment','manyi friendly fire is penalised','manyi fire immunity leaves only actual discard cost','manyi colorless cards do not cause red/black collisions','manyi old host API absence does not read hidden cards','manyi full native get.effect honours immunity']);
const selected=process.argv.includes('--original-only')?results.filter(r=>compareNames.has(r.name)):results;
const failed=selected.filter(r=>!r.passed);console.log(JSON.stringify({source:option('--source')||'skills/index.js',passed:selected.length-failed.length,failed:failed.length,metrics,results:selected},null,2));process.exitCode=failed.length?1:0;
