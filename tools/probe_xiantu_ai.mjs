// Li Ximing's actual progression/crafting/card chain; VM only, no real saves.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {root,host,parse,walk,keyOf,property,skillsOf,ruleSignature} from './lib/skill_audit.mjs';
const option=n=>{const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1];};
const source=fs.readFileSync(option('--source')||path.join(root,'skills/index.js'),'utf8'),pack=skillsOf(parse(source));
const cardSource=fs.readFileSync(option('--cards')||path.join(root,'card/index.js'),'utf8');
function cardPackOf(text){let found;walk(typeof text==='string'?parse(text):text,n=>{if(n.type==='Property'&&keyOf(n)==='card'&&property(n.value,'csh_dan'))found=n.value;});if(!found)throw Error('Card pack missing');return found;}
const cards=cardPackOf(cardSource),methods={};
for(const [file,names] of [['noname/get/index.js',['effect','damageEffect','autoViewAs','value','result','tag','buttonValue']],['noname/library/element/player.js',['getKnownCards','iterableGetKnownCards','getCardIndex','canSave','hasSkillTag','discardPlayerCard']]]){
  const text=fs.readFileSync(path.join(host,file),'utf8');walk(parse(text),n=>{if(n.type==='MethodDefinition'&&names.includes(keyOf(n)))methods[keyOf(n)]=text.slice(...n.range);});
}
const vcardText=fs.readFileSync(path.join(host,'noname/library/element/vcard.js'),'utf8');let vcardClass;
walk(parse(vcardText),n=>{if(n.type==='ClassDeclaration'&&n.id.name==='VCard')vcardClass=vcardText.slice(...n.range);});
const results=[];
async function check(name,fn){try{const detail=await fn();results.push({name,passed:detail===true,detail:detail===true?undefined:detail});}catch(e){results.push({name,passed:false,error:e.message});}}
function fixture(){
  const nativeReads=[];
  const person=id=>({id,hp:3,maxHp:4,attitude:id==='actor'?4:-4,hand:[],equipment:[],storage:{csh_xiantu_stage:'taixi',csh_qi:6},skills:[],dead:false,hujia:0,
    getCards(zone,filter){const list=zone==='e'?this.equipment:zone==='j'?[]:this.hand;return filter?list.filter(filter):list;},
    countCards(zone,filter){if(id!=='actor'&&filter)throw Error('hidden opponent filtered count');const list=this.hand;return filter?list.filter(c=>typeof filter==='function'?filter(c):c.name===filter).length:list.length;},
    *iterableGetCards(){yield* this.hand;},
    getSkills(){return this.skills;},hasSkillTag(){return false;},hasUsableCard(name){return this.hand.some(c=>c.name===name);},isIn(){return !this.dead;},isDead(){return this.dead;},
    async gainMaxHp(n){this.maxHp+=n;},async recover(n){this.hp=Math.min(this.maxHp,this.hp+n);},async draw(n=1){this.draws=(this.draws||0)+n;},async give(cs,t){t.hand.push(...cs);this.hand=this.hand.filter(c=>!cs.includes(c));},
    async revive(n){this.dead=false;this.hp=n;},async loseMaxHp(n){this.maxHp-=n;},async loseHp(n){this.hp-=n;},changeHp(n){this.hp+=n;}});
  const player=person('actor'),target=person('target'),lib={skill:{global:[]},card:{},element:{},inpile:[],suits:['spade','heart','club','diamond'],color:{red:['heart','diamond'],black:['spade','club']},filter:{all:()=>true,cardDiscardable:c=>!c.protected}};
  const ui={selected:{cards:[],targets:[]},cardPile:new Proxy({}, {get(){throw Error('hidden deck read');}})},status={event:{player,target,getTrigger(){return this.trigger;}}};
  const game={players:[player,target],dead:[],expandSkills(){},checkMod(...args){return args[args.length-3];},createEvent(name){return {name,setContent(){}};},log(){}};
  const get={itemtype:c=>c instanceof lib.element.VCard?'vcard':c?._physical?'card':c?.id?'player':'',name:c=>{if(c?.forbidden)throw Error('hidden name');return c.name;},type:c=>get.info(c).type,type2:c=>get.info(c).type,
    color:c=>{if(c?.forbidden)throw Error('hidden color');return c.color;},suit:c=>c.suit,number:c=>c.number||5,nature:c=>c.nature,position:c=>c.position||'h',owner:c=>c.owner,
    copy:v=>v&&typeof v==='object'?{...v}:v,info:c=>{if(c?.forbidden)throw Error('hidden card info');return typeof c==='string'?lib.skill[c]:lib.card[c.name]||{ai:{}};},
    attitude:(p,t)=>t.attitude,translation:n=>n,event:()=>status.event,player:()=>status.event.player};
  const ctx=vm.createContext({lib,game,ui,get,_status:status,Math:Object.create(Math),CacheContext:{requireCacheContext:()=>({get,delegate:x=>x})}});
  lib.element.VCard=vm.runInContext('('+vcardClass+')',ctx);
  const engine=vm.runInContext('({'+Object.values(methods).join(',\n')+'})',ctx);
  for(const id of ['effect','damageEffect','autoViewAs','value','result','tag','buttonValue'])get[id]=engine[id];
  for(const p of [player,target]){p.getKnownCards=engine.getKnownCards;p.iterableGetKnownCards=engine.iterableGetKnownCards;p.getCardIndex=engine.getCardIndex;p.canSave=engine.canSave;p.discardPlayerCard=engine.discardPlayerCard;}
  lib.filter.cardSavable=(c,p,t)=>lib.card[c.name].savable;
  for(const id of ['csh_xiantu','csh_xiantu_mod','csh_huangyuan','csh_yetian'])lib.skill[id]=vm.runInContext('('+source.slice(...property(pack,id).range)+')',ctx);
  lib.card.csh_dan=vm.runInContext('('+cardSource.slice(...property(cards,'csh_dan').range)+')',ctx);
  for(const [name,type,value] of [['cheapbasic','basic',2],['cheaptrick','trick',3],['priceybasic','basic',8],['priceytrick','trick',8],['midbasic','basic',5.5],['midtrick','trick',5.5]])lib.card[name]={type,ai:{basic:{value}}};
  for(const [name,field] of [['damage','damage'],['firedamage','fire'],['thunderdamage','thunder']])lib.card[name]={ai:{result:{target:(p,t)=>t[field]??-1.5}}};
  const card=(name,owner=player,position='h')=>{const c={_physical:true,name,owner,position,isKnownBy(){return !!this.known;}};(position==='e'?owner.equipment:owner.hand).push(c);return c;};
  const callbacks={};for(const id of ['csh_xiantu','csh_yetian']){callbacks[id]=[];walk(property(pack,id),n=>{if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='set'&&n.arguments[0]?.value==='ai')callbacks[id].push(vm.runInContext('('+source.slice(...n.arguments[1].range)+')',ctx));});}
  const choose=index=>callbacks.csh_xiantu[index]();
  return {player,target,game,lib,ui,status,get,card,choose,callbacks,ctx,nativeReads};
}
await check('taixi at one HP does not invent an HP failure cost',()=>{const f=fixture();f.player.hp=1;return f.choose(0)!=='按兵不动';});
await check('taixi chooses a legal color without reading hidden pile',()=>{const f=fixture();return ['赤焰（红）','玄冥（黑）'].includes(f.choose(0));});
await check('lianqi retains low-HP protection against actual HP loss',()=>{const f=fixture();f.player.hp=1;const a=f.choose(1);f.player.hp=2;return a==='按兵不动'&&f.choose(1)==='按兵不动';});
await check('lianqi healthy progression remains available',()=>{const f=fixture();return f.choose(1)==='凡兵（基本）';});
await check('zhuji high HP does not license direct-death gambling',()=>{const f=fixture();f.player.hp=8;return f.choose(2)==='按兵不动';});
await check('zhuji at ordinary HP also retains current stage',()=>{const f=fixture();return f.choose(2)==='按兵不动';});
await check('qi boost respects current fire immunity',()=>{const f=fixture();f.target.fire=0;f.status.event.trigger={player:f.target,nature:'fire'};return f.choose(3)===false;});
await check('qi boost respects current thunder immunity',()=>{const f=fixture();f.target.thunder=0;f.status.event.trigger={player:f.target,nature:'thunder'};return f.choose(3)===false;});
await check('qi boost uses beneficial damage to an ally',()=>{const f=fixture();f.target.attitude=4;f.target.fire=1;f.status.event.trigger={player:f.target,nature:'fire'};return f.choose(3)===true;});
await check('qi boost rejects damage beneficial to enemy',()=>{const f=fixture();f.target.fire=1;f.status.event.trigger={player:f.target,nature:'fire'};return f.choose(3)===false;});
await check('qi boost accepts harmful ordinary damage to enemy',()=>{const f=fixture();f.status.event.trigger={player:f.target};return f.choose(3)===true;});
await check('qi boost missing trigger safely declines',()=>{const f=fixture();return f.choose(3)===false;});
await check('huangyuan declines a two-card cost above Dan value',()=>{const f=fixture();f.player.hand=[f.card('priceybasic'),f.card('priceytrick')];return f.lib.skill.csh_huangyuan.ai.result.player(f.player)<=0;});
await check('huangyuan declines zero-net pair even if each card is below six',()=>{const f=fixture();f.player.hand=[f.card('midbasic'),f.card('midtrick')];return f.lib.skill.csh_huangyuan.check(f.player.hand[0])<=0;});
await check('huangyuan accepts a cheap basic/trick pair',()=>{const f=fixture();f.player.hand=[f.card('cheapbasic'),f.card('cheaptrick')];return f.lib.skill.csh_huangyuan.ai.result.player(f.player)>0&&f.lib.skill.csh_huangyuan.check(f.player.hand[0])>0;});
await check('huangyuan checks candidate plus partner total cost',()=>{const f=fixture();f.player.hand=[f.card('cheapbasic'),f.card('priceybasic'),f.card('priceytrick')];return f.lib.skill.csh_huangyuan.check(f.player.hand[0])>0&&f.lib.skill.csh_huangyuan.check(f.player.hand[1])<=0;});
await check('huangyuan selected expensive card is not replaced in estimate',()=>{const f=fixture();f.player.hand=[f.card('cheapbasic'),f.card('priceybasic'),f.card('priceytrick')];f.ui.selected.cards=[f.player.hand[1]];return f.lib.skill.csh_huangyuan.check(f.player.hand[2])<=0;});
await check('huangyuan has no gain without both required card types',()=>{const f=fixture();f.player.hand=[f.card('cheapbasic')];return f.lib.skill.csh_huangyuan.ai.result.player(f.player)<=0;});
await check('huangyuan does not budget protected cost cards',()=>{const f=fixture();f.player.hand=[f.card('cheapbasic'),f.card('cheaptrick')];f.player.hand[0].protected=true;return f.lib.skill.csh_huangyuan.ai.result.player(f.player)<=0;});
await check('huangyuan gain can use native own duplicate-index valuation',()=>{const f=fixture();f.player.hand=[f.card('cheapbasic'),f.card('cheaptrick'),f.card('csh_dan')];return Number.isFinite(f.lib.skill.csh_huangyuan.ai.result.player(f.player));});
await check('Dan does not gain positive native utility by helping enemy',()=>{const f=fixture();return f.get.effect(f.target,{name:'csh_dan'},f.player,f.player)<=0;});
await check('Dan does not gain positive native utility by reviving enemy',()=>{const f=fixture();f.target.dead=true;return f.get.effect(f.target,{name:'csh_dan'},f.player,f.player)<=0;});
await check('Dan allied transfer remains a positive native option',()=>{const f=fixture();f.target.attitude=4;return f.get.effect(f.target,{name:'csh_dan'},f.player,f.player)>0;});
await check('Dan allied revival remains a positive native option',()=>{const f=fixture();f.target.dead=true;f.target.attitude=4;return f.get.effect(f.target,{name:'csh_dan'},f.player,f.player)>0;});
await check('Dan self-use remains positive even at full HP',()=>{const f=fixture();f.player.hp=f.player.maxHp;return f.get.effect(f.player,{name:'csh_dan'},f.player,f.player)>0;});
await check('Dan AI does not inspect hidden identity',()=>{const f=fixture();f.target.dead=true;Object.defineProperty(f.target,'identity',{get(){throw Error('hidden identity');}});return f.lib.card.csh_dan.ai.result.target(f.player,f.target)>0;});
await check('Dan still has rule-level savable metadata (known direct-heal discrepancy)',()=>{const f=fixture();f.player.hand=[f.card('csh_dan')];return f.player.canSave(f.target)===true;});
await check('Dan actual self-use gains max HP and heals',async()=>{const f=fixture();const before=f.player.hp;await f.lib.card.csh_dan.content({target:f.player,cards:[]},null,f.player);return f.player.maxHp===5&&f.player.hp===before+1;});
await check('Dan actual allied dying use transfers, without immediate healing',async()=>{const f=fixture();f.target.hp=0;const c=f.card('csh_dan');f.player.hand=[c];const event={target:f.target,cards:[c]};await f.lib.card.csh_dan.content(event,null,f.player);return f.target.hp===0&&f.target.hand.includes(c)&&f.player.draws===1&&event.cards.length===0;});
await check('Dan actual revival keeps one HP and loses one max HP',async()=>{const f=fixture();f.target.dead=true;await f.lib.card.csh_dan.content({target:f.target,cards:[]},null,f.player);return !f.target.dead&&f.target.hp===1&&f.target.maxHp===3;});
const yetianChoice=f=>f.callbacks.csh_yetian[0]||f.player.discardPlayerCard(f.target,'he',true).ai;
await check('Yetian public equipment valuation avoids native recipient hidden index',()=>{const f=fixture();const c=f.card('csh_dan',f.target,'e');f.target.equipment=[c];const h=f.card('csh_dan',f.target);h.forbidden=true;f.target.hand=[h];return Number.isFinite(yetianChoice(f)({link:c}));});
await check('Yetian hidden hand buttons remain equal and do not reveal names',()=>{const f=fixture(),choose=yetianChoice(f);const a=f.card('cheapbasic',f.target),b=f.card('csh_dan',f.target);a.forbidden=true;b.forbidden=true;f.target.hand=[a,b];const blank=c=>({link:c,classList:{contains:t=>t==='blank'}});return choose(blank(a))===choose(blank(b));});
await check('Yetian missing known-card API keeps hidden buttons uniform',()=>{const f=fixture();delete f.target.getKnownCards;const c=f.card('csh_dan',f.target);c.forbidden=true;return Number.isFinite(yetianChoice(f)({link:c,classList:{contains:t=>t==='blank'}}));});
await check('Yetian revealed equipment prefers high-value enemy resource',()=>{const f=fixture(),choose=yetianChoice(f);return choose({link:f.card('csh_dan',f.target,'e')})>choose({link:f.card('cheapbasic',f.target,'e')});});
await check('Yetian allied revealed equipment preserves high-value resource',()=>{const f=fixture(),choose=yetianChoice(f);f.target.attitude=4;return choose({link:f.card('csh_dan',f.target,'e')})<choose({link:f.card('cheapbasic',f.target,'e')});});
await check('Yetian foreign public function value cannot run hidden recipient callback',()=>{const f=fixture();f.lib.card.trap={type:'equip',ai:{value(){throw Error('recipient callback');}}};return Number.isFinite(yetianChoice(f)({link:f.card('trap',f.target,'e')}));});
await check('Yetian known hand card may use its public base value',()=>{const f=fixture();const c=f.card('csh_dan',f.target);c.known=true;f.target.hand=[c];return yetianChoice(f)({link:c})>5;});
await check('native default reproduces public-equipment hidden-index hazard',()=>{const f=fixture();const c=f.card('csh_dan',f.target,'e');f.target.equipment=[c];const h=f.card('csh_dan',f.target);h.forbidden=true;f.target.hand=[h];try{f.player.discardPlayerCard(f.target,'he',true).ai({link:c});return false;}catch(e){return e.message==='hidden name';}});
await check('rule guard retains breakthrough death outcome',()=>{const n=property(property(property(property(pack,'csh_xiantu'),'subSkill'),'break'),'content').body;return ruleSignature(source)!==ruleSignature(source.slice(0,n.range[0])+'{}'+source.slice(n.range[1]));});
await check('rule guard retains Yetian discard arguments',()=>{const n=property(property(pack,'csh_yetian'),'content');const old=source.slice(...n.range),changed=old.replace('discardPlayerCard(target, "he", true)','discardPlayerCard(target, "h", true)');return old!==changed&&ruleSignature(source)!==ruleSignature(source.slice(0,n.range[0])+changed+source.slice(n.range[1]));});
function cardRuleSignature(text){const ast=parse(text),danAI=property(property(cardPackOf(ast),'csh_dan'),'ai');function clean(n){if(n===danAI)return {type:'Identifier',name:'__AUDIT_DAN_AI__'};if(Array.isArray(n))return n.map(clean);if(n&&typeof n==='object')return Object.fromEntries(Object.entries(n).filter(([k])=>!['parent','tokens','comments','range','loc','start','end','raw'].includes(k)).map(([k,v])=>[k,clean(v)]));return n;}return JSON.stringify(clean(ast));}
await check('Dan rule guard retains revive/transfer/healing content',()=>{const n=property(property(cards,'csh_dan'),'content').body;return cardRuleSignature(cardSource)!==cardRuleSignature(cardSource.slice(0,n.range[0])+'{}'+cardSource.slice(n.range[1]));});
await check('Dan rule guard retains savable metadata',()=>{const n=property(property(cards,'csh_dan'),'savable');return cardRuleSignature(cardSource)!==cardRuleSignature(cardSource.slice(0,n.range[0])+'false'+cardSource.slice(n.range[1]));});
const otherCard=cards.properties.find(n=>keyOf(n)!=='csh_dan'&&property(n.value,'content')&&property(n.value,'ai')).value;
await check('card-file guard retains another card actual content',()=>{const n=property(otherCard,'content').body;return cardRuleSignature(cardSource)!==cardRuleSignature(cardSource.slice(0,n.range[0])+'{}'+cardSource.slice(n.range[1]));});
await check('card-file guard also retains unrelated card AI',()=>{const n=property(otherCard,'ai');return cardRuleSignature(cardSource)!==cardRuleSignature(cardSource.slice(0,n.range[0])+'{}'+cardSource.slice(n.range[1]));});
const baseline=option('--baseline');if(baseline)await check('all non-AI skill AST remains unchanged',()=>ruleSignature(source)===ruleSignature(fs.readFileSync(baseline,'utf8')));
const cardBaseline=option('--card-baseline');if(cardBaseline)await check('all non-AI card AST remains unchanged',()=>cardRuleSignature(cardSource)===cardRuleSignature(fs.readFileSync(cardBaseline,'utf8')));
const failures=results.filter(r=>!r.passed);console.log(JSON.stringify({scope:'Li Ximing actual progression/crafting/Dan/Yetian + installed Get/Player/VCard; no real game/saves',passed:results.length-failures.length,failed:failures.length,failures},null,2));process.exitCode=failures.length?1:0;
