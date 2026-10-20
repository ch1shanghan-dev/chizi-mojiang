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
for(const [file,names]of [['noname/get/index.js',['effect','damageEffect']],['noname/library/element/player.js',['getKnownCards','iterableGetKnownCards']]]){
  const text=fs.readFileSync(path.join(host,file),'utf8');walk(parse(text),n=>{if(n.type==='MethodDefinition'&&names.includes(keyOf(n)))methods[keyOf(n)]=text.slice(...n.range);});
}
function fixture(){
  const reads=[], hiddenReads=[];
  function card(number,value=4,known=false,name='sha'){return {number,value,known,name,type:'basic',isKnownBy(){return this.known;}};}
  function person(id){return {id,hp:3,maxHp:4,attitude:id==='actor'?4:-4,hand:[],equip:[],turned:false,noturn:false,alive:true,damage:-1.5,losehp:-1.5,
    getCards(zone){if(this.id!=='actor'&&zone==='h')hiddenReads.push(this.id);return zone==='he'?[...this.hand,...this.equip]:[...this.hand];},
    *iterableGetCards(){yield* this.hand;},countCards(zone,filter){const list=zone==='he'?[...this.hand,...this.equip]:this.hand;return !filter?list.length:list.filter(c=>typeof filter==='string'?c.name===filter:typeof filter==='function'?filter(c):Object.entries(filter).every(([k,v])=>c[k]===v)).length;},
    hasCard(fn){return this.hand.some(fn);},getSkills(){return [];},hasSkillTag(tag){return tag==='noturn'?this.noturn:false;},
    isTurnedOver(){return this.turned;},isLinked(){return false;},canCompare(other){return this.hand.length>0&&other.hand.length>0&&other.alive;}};}
  const player=person('actor'),target=person('target');
  player.hand=[card(5,2),card(8,3)]; target.hand=[card(6,4),card(9,4)];
  const lib={skill:{global:[]},filter:{cardDiscardable:()=>true}};
  const ui={selected:{cards:[card(2,1)],targets:[]}},status={event:{player}},game={players:[player,target],expandSkills(){},hasPlayer:fn=>game.players.some(fn)};
  const get={attitude:(a,b)=>a===b?4:b===target?target.attitude:target.attitude,
    player:()=>status.event.player,event:()=>status.event,
    value(c,p){reads.push(c);if(c.forbidden)throw Error('Hidden card value accessed');if(p===target&&target.rejectRecipientValue)throw Error('Recipient value can inspect hidden duplicate cards');return c.values?.[p?.id]??c.value;},
    number(c){if(c.forbidden)throw Error('Hidden card number accessed');return c.number;},type:c=>c.type,name:c=>c.name,
    itemtype:()=>'',autoViewAs:c=>c,tag:()=>false,info:item=>typeof item==='string'?lib.skill[item]:({ai:{basic:{value:item.value??5}}}),
    result(c){return {target:c.name==='draw'?1:c.name==='losehp'?target.losehp:c.name==='damage'?-1.5:0};}};
  const ctx=vm.createContext({lib,ui,game,get,_status:status,cards:ui.selected.cards,CacheContext:{requireCacheContext:()=>({get,delegate:x=>x})}});
  const engine=vm.runInContext('({'+Object.values(methods).join(',\n')+'})',ctx);
  get.effect=engine.effect; get.damageEffect=engine.damageEffect;
  for(const p of [player,target]){p.iterableGetKnownCards=engine.iterableGetKnownCards;p.getKnownCards=engine.getKnownCards;}
  // Damage immunity/benefit is supplied as a real effect modifier on each target.
  lib.skill.fixture_damage={ai:{effect:{target(c,from,to){if(c.name==='damage')return to.damage===0?'zerotarget':to.damage/-1.5;}}}};
  player.getSkills=target.getSkills=()=>['fixture_damage'];
  for(const id of ['csh_jiaomeng','csh_karl_junxing','csh_karl_hannan'])lib.skill[id]=vm.runInContext('('+source.slice(...property(pack,id).range)+')',ctx);
  let discardAI;walk(property(pack,'csh_karl_junxing'),n=>{if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='set'&&n.arguments[0]?.value==='ai')discardAI=vm.runInContext('('+source.slice(...n.arguments[1].range)+')',ctx);});
  return {lib,ui,get,ctx,status,player,target,card,reads,hiddenReads,discardAI};
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
const baseline=option('--baseline');if(baseline)check('rule AST unchanged outside explicit AI callbacks/helper',()=>ruleSignature(source)===ruleSignature(fs.readFileSync(baseline,'utf8')));
check('rule comparison detects changed activation count',()=>{const value=property(property(pack,'csh_jiaomeng'),'usable');const changed=source.slice(0,value.range[0])+'4'+source.slice(value.range[1]);return ruleSignature(source)!==ruleSignature(changed);});
check('jiaomeng helper is referenced only by its AI',()=>{const node=property(pack,'csh_jiaomeng'),ai=property(node,'ai');let bad=false,calls=0;walk(ast,n=>{if(n.type==='MemberExpression'&&n.property.name==='_advantage'){calls++;if(n.range[0]<ai.range[0]||n.range[1]>ai.range[1])bad=true;}});return calls===3&&!bad;});
const failures=results.filter(r=>!r.passed);console.log(JSON.stringify({scope:'isolated actual skill/known-card/host-effect callbacks; no real game or saves',passed:results.length-failures.length,failed:failures.length,failures},null,2));process.exitCode=failures.length?1:0;
