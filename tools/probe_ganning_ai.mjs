// Actual installed skill choices + native effect/known-card methods, isolated from saves.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {root,host,parse,walk,keyOf,property,skillsOf,ruleSignature} from './lib/skill_audit.mjs';
const option=n=>{const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1];};
const source=fs.readFileSync(option('--source')||path.join(root,'skills/index.js'),'utf8'),pack=skillsOf(parse(source));
const results=[];
function check(name,fn){try{const detail=fn();results.push({name,passed:detail===true,detail:detail===true?undefined:detail});}catch(e){results.push({name,passed:false,error:e.message});}}
const methods={};
for(const [file,names]of [['noname/get/index.js',['effect','autoViewAs']],['noname/library/element/player.js',['getKnownCards','iterableGetKnownCards']]]){
  const text=fs.readFileSync(path.join(host,file),'utf8');walk(parse(text),n=>{if(n.type==='MethodDefinition'&&names.includes(keyOf(n)))methods[keyOf(n)]=text.slice(...n.range);});
}
const vcardText=fs.readFileSync(path.join(host,'noname/library/element/vcard.js'),'utf8');let vcardClass;
walk(parse(vcardText),n=>{if(n.type==='ClassDeclaration'&&n.id.name==='VCard')vcardClass=vcardText.slice(...n.range);});
function fixture(){
  const hidden=[];
  const card=(color='black',suit='spade',value=4,tag=true)=>({_physical:true,name:'sha',type:'basic',color,suit,value,tag,hasGaintag:t=>tag&&t==='csh_jinfan',isKnownBy(){return !!this.known;}});
  const person=id=>({id,hp:3,attitude:id==='actor'?4:-4,hand:[],rings:[],marks:0,storage:{},
    getCards(zone,fn){if(id!=='actor'&&zone==='h'&&!this.revealed)hidden.push('raw hand');const list=zone==='s'?this.rings:this.hand;return fn?list.filter(fn):list;},
    countCards(zone,fn){if(id!=='actor'&&zone==='h'&&fn&&!this.revealed)hidden.push('named count');const list=zone==='s'?this.rings:this.hand;return fn?list.filter(fn).length:list.length;},
    *iterableGetCards(){yield* this.hand;},getHandcardLimit:()=>4,countMark(name){return name==='csh_jinfan_draw'?this.marks:0;},
    getSkills:()=>id==='actor'?['csh_jinfan']:[],hasSkill:()=>true,isIn:()=>true});
  const player=person('actor'),target=person('target');player.hand=[card(),card('red','heart')];target.hand=[card(),card('red','heart')];
  const lib={skill:{global:[]},element:{},suits:['spade','heart','club','diamond'],color:{red:['heart','diamond'],black:['spade','club']}},ui={selected:{cards:[],buttons:[]}},status={event:{player,target}};
  const game={players:[player,target],expandSkills(){}};
  const get={itemtype:c=>c instanceof lib.element.VCard||c?.virtual?'vcard':c?._physical?'card':'',color:c=>{if(c.forbidden)throw Error('hidden color');return c.color;},suit:c=>c.suit,name:c=>c.name,type:c=>c.type,number:c=>c.number||5,nature:c=>c.nature,copy:v=>v==null?v:JSON.parse(JSON.stringify(v)),
    value(c,p){if(c.forbidden)throw Error('hidden value');if(p===target&&!target.revealed)throw Error('hidden recipient value');return c.value;},
    attitude:(a,b)=>b.attitude,info:c=>typeof c==='string'?lib.skill[c]:{ai:{basic:{value:c.value}}},
    tag:()=>false,result:()=>({player:0,target:-1}),player:()=>status.event.player};
  const ctx=vm.createContext({lib,ui,game,get,_status:status,CacheContext:{requireCacheContext:()=>({get,delegate:x=>x})}});
  lib.element.VCard=vm.runInContext('('+vcardClass+')',ctx);
  const engine=vm.runInContext('({'+Object.values(methods).join(',\n')+'})',ctx);get.effect=engine.effect;get.autoViewAs=engine.autoViewAs;
  for(const p of [player,target]){p.getKnownCards=engine.getKnownCards;p.iterableGetKnownCards=engine.iterableGetKnownCards;}
  for(const id of ['csh_jinfan','csh_sheque'])lib.skill[id]=vm.runInContext('('+source.slice(...property(pack,id).range)+')',ctx);
  const callbacks={};for(const id of ['csh_jinfan','csh_sheque']){callbacks[id]=[];walk(property(pack,id),n=>{if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='set'&&n.arguments[0]?.value==='ai')callbacks[id].push(vm.runInContext('('+source.slice(...n.arguments[1].range)+')',ctx));});}
  return {player,target,card,lib,ui,status,get,hidden,store:callbacks.csh_jinfan[0],reveal:callbacks.csh_sheque[1]};
}
const bonus=(f,c)=>f.lib.skill.csh_jinfan.ai.effect.player(c,f.player)?.[1]||0;
const order=(f,c)=>f.lib.skill.csh_jinfan.mod.aiOrder(f.player,c,5)??5;
for(const marks of [0,1,2,7])check('jinfan draw bonus respects real mark '+marks,()=>{const f=fixture(),c=f.card();f.player.rings=[c,f.card('red','heart'),f.card('black','club')];f.player.marks=marks;return Math.abs(bonus(f,c)-(marks<2?0.4:0))<1e-9;});
check('jinfan last ring has no fictional draw bonus',()=>{const f=fixture(),c=f.card();f.player.rings=[c];return bonus(f,c)===0&&order(f,c)===5;});
check('jinfan one remaining color earns one-card bonus',()=>{const f=fixture(),c=f.card();f.player.rings=[c,f.card('red','heart'),f.card('red','diamond')];return Math.abs(bonus(f,c)-0.2)<1e-9&&order(f,c)===5.3;});
check('jinfan two remaining colors earn two-card bonus',()=>{const f=fixture(),c=f.card();f.player.rings=[c,f.card('red','heart'),f.card('black','club')];return bonus(f,c)===0.4&&order(f,c)===5.6;});
check('jinfan exhausted draw quota has no priority bonus',()=>{const f=fixture(),c=f.card();f.player.rings=[c,f.card('red','heart')];f.player.marks=2;return order(f,c)===5;});
check('jinfan colorless reserves cannot draw',()=>{const f=fixture(),c=f.card();f.player.rings=[c,f.card('none','none')];return bonus(f,c)===0&&order(f,c)===5;});
check('jinfan untagged special cards do not supply a color',()=>{const f=fixture(),c=f.card();f.player.rings=[c,f.card('red','heart',4,false)];return bonus(f,c)===0;});
check('jinfan ordinary hand card has no ring bonus',()=>{const f=fixture(),c=f.card('black','spade',4,false);f.player.rings=[f.card('red','heart')];return bonus(f,c)===0&&order(f,c)===5;});
check('jinfan virtual card is not mistaken for physical ring',()=>{const f=fixture(),c={...f.card(),virtual:true};f.player.rings=[f.card('red','heart')];return bonus(f,c)===0&&order(f,c)===5;});
check('jinfan actual host effect drops fictional draw after quota',()=>{const f=fixture(),c=f.card();f.player.rings=[c,f.card('red','heart')];const before=f.get.effect(f.target,c,f.player,f.player);f.player.marks=2;return f.get.effect(f.target,c,f.player,f.player)<before;});
check('jinfan actual host effect has no last-ring windfall',()=>{const f=fixture(),c=f.card();f.player.rings=[c];const before=f.get.effect(f.target,c,f.player,f.player);f.player.getSkills=()=>[];return before===f.get.effect(f.target,c,f.player,f.player);});
check('native VCard keeps physical ring but does not copy gaintag',()=>{const f=fixture(),c=f.card(),v=f.get.autoViewAs(c);return f.get.itemtype(v)==='vcard'&&v.cards[0]===c&&!v.hasGaintag('csh_jinfan');});
check('jinfan native VCard single ring retains true draw bonus',()=>{const f=fixture(),c=f.card();f.player.rings=[c,f.card('red','heart')];return bonus(f,f.get.autoViewAs(c))===0.2;});
check('jinfan native VCard removes all consumed rings',()=>{const f=fixture(),a=f.card(),b=f.card('red','heart');f.player.rings=[a,b];return bonus(f,f.get.autoViewAs({name:'sha'},[a,b]))===0;});
check('jinfan multi-card conversion counts only unconsumed reserve color',()=>{const f=fixture(),a=f.card(),b=f.card('red','heart');f.player.rings=[a,b,f.card('red','diamond')];return bonus(f,f.get.autoViewAs({name:'sha'},[a,b]))===0.2;});
check('jinfan mixed hand/ring conversion still gets one real reserve bonus',()=>{const f=fixture(),a=f.card();f.player.rings=[a,f.card('red','heart')];return bonus(f,f.get.autoViewAs({name:'sha'},[a,f.player.hand[0]]))===0.2;});
check('jinfan foreign tagged entity cannot supply own ring bonus',()=>{const f=fixture();f.player.rings=[f.card('red','heart')];return bonus(f,f.get.autoViewAs(f.card()))===0;});
check('jinfan recycled already-drawn ring has no second income',()=>{const f=fixture(),c={...f.card(),cardid:'recycled'};f.player.rings=[c,f.card('red','heart')];f.player.storage.csh_jinfan_drawn={recycled:true};const gain=f.lib.skill.csh_jinfan.subSkill.gain;const actual=gain.getLingCards({name:'useCard',cards:[c]},f.player);return actual.length===0&&bonus(f,f.get.autoViewAs(c))===0&&order(f,c)===5;});
check('jinfan fresh entity in mixed conversion still earns actual batch draw',()=>{const f=fixture(),a={...f.card(),cardid:'old'},b={...f.card('red','heart'),cardid:'new'};f.player.rings=[a,b,f.card('black','club')];f.player.storage.csh_jinfan_drawn={old:true};const actual=f.lib.skill.csh_jinfan.subSkill.gain.getLingCards({name:'useCard',cards:[a,b]},f.player);return actual.length===1&&actual[0].card===b&&bonus(f,f.get.autoViewAs({name:'sha'},[a,b]))===0.2;});
check('jinfan storage considers colors already selected',()=>{const f=fixture();f.ui.selected.cards=[f.card('black','club')];return f.store(f.card('red','heart'))>f.store(f.card('black','spade'));});
check('jinfan storage stops at two rings per suit',()=>{const f=fixture();f.player.rings=[f.card(),f.card()];return f.store(f.card())===0;});
check('jinfan storage includes selected cards in suit cap',()=>{const f=fixture();f.player.rings=[f.card()];f.ui.selected.cards=[f.card()];return f.store(f.card())===0;});
check('jinfan storage rejects no-suit cards',()=>{const f=fixture();return f.store(f.card('none','none'))===0;});
check('jinfan storage only needs own hand and special cards',()=>{const f=fixture();f.target.hand.forEach(c=>c.forbidden=true);return Number.isFinite(f.store(f.card()))&&f.hidden.length===0;});
check('sheque activation ignores hidden colors and values',()=>{const f=fixture(),s=f.lib.skill.csh_sheque;const a=s.check({player:f.target},f.player);f.target.hand.forEach(c=>{c.color='none';c.value=100;c.forbidden=true;});return s.check({player:f.target},f.player)===a&&f.hidden.length===0;});
check('sheque revealed enemy card selection can use exposed values',()=>{const f=fixture();f.target.revealed=true;return f.reveal({link:f.card('red','heart',8)})>f.reveal({link:f.card('red','heart',2)});});
check('sheque revealed allied card selection preserves valuable cards',()=>{const f=fixture();f.target.revealed=true;f.target.attitude=4;return f.reveal({link:f.card('red','heart',8)})<f.reveal({link:f.card('red','heart',2)});});
check('jinfan clear resets the actual counter and per-card dedup map',()=>{const n=property(property(property(pack,'csh_jinfan'),'subSkill'),'clear'),fn=property(n,'content');const text=source.slice(...fn.range);return text.includes('csh_jinfan_draw')&&text.includes('csh_jinfan_drawn');});
check('rule guard retains ring-enable mechanism',()=>{const n=property(property(property(pack,'csh_jinfan'),'mod'),'cardEnabled2');return ruleSignature(source)!==ruleSignature(source.slice(0,n.range[0])+'function(){return false;}'+source.slice(n.range[1]));});
check('rule guard retains ring gain content',()=>{const n=property(property(property(property(pack,'csh_jinfan'),'subSkill'),'gain'),'content').body;return ruleSignature(source)!==ruleSignature(source.slice(0,n.range[0])+'{}'+source.slice(n.range[1]));});
const baseline=option('--baseline');if(baseline)check('all non-AI AST remains unchanged',()=>ruleSignature(source)===ruleSignature(fs.readFileSync(baseline,'utf8')));
const failures=results.filter(r=>!r.passed);console.log(JSON.stringify({scope:'Ganning actual skill callbacks/native effect; no real game or save',passed:results.length-failures.length,failed:failures.length,failures},null,2));process.exitCode=failures.length?1:0;
