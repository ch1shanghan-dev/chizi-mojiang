// Actual Asuka callbacks + installed host effect/VCard/known-card/getUseValue methods.
// No game instance, host files, network, or persistent player storage is modified.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {root,host,parse,walk,keyOf,property,skillsOf,ruleSignature} from './lib/skill_audit.mjs';
const option=n=>{const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1];};
const source=fs.readFileSync(option('--source')||path.join(root,'skills/index.js'),'utf8'),pack=skillsOf(parse(source));
const main=fs.readFileSync(path.join(root,'main/content.js'),'utf8'),results=[];
function check(name,fn){try{const detail=fn();results.push({name,passed:detail===true,detail:detail===true?undefined:detail});}catch(e){results.push({name,passed:false,error:e.message});}}
const methods={};
for(const [file,names]of [['noname/get/index.js',['effect','autoViewAs','recoverEffect']],['noname/library/element/player.js',['getKnownCards','iterableGetKnownCards','getUseValue','canUse']]]){
  const text=fs.readFileSync(path.join(host,file),'utf8');walk(parse(text),n=>{if(n.type==='MethodDefinition'&&names.includes(keyOf(n)))methods[keyOf(n)]=text.slice(...n.range);});
}
const libraryText=fs.readFileSync(path.join(host,'noname/library/index.js'),'utf8');let cardUsable;
walk(parse(libraryText),n=>{if(n.type==='Property'&&keyOf(n)==='cardUsable'&&n.value.type==='FunctionExpression')cardUsable='({'+libraryText.slice(...n.range)+'}).cardUsable';});
const vcardText=fs.readFileSync(path.join(host,'noname/library/element/vcard.js'),'utf8');let vcardClass,sync;
walk(parse(vcardText),n=>{if(n.type==='ClassDeclaration'&&n.id.name==='VCard')vcardClass=vcardText.slice(...n.range);});
walk(parse(main),n=>{if(n.type==='AssignmentExpression'&&n.left.type==='MemberExpression'&&n.left.object.name==='lib'&&n.left.property.name==='cshAsukaSync')sync=main.slice(...n.right.range);});
const ids=pack.properties.map(keyOf).filter(id=>/^csh_(tongbu(?:_|$)|lichang(?:_|$)|langqiang(?:_|$)|xinmo(?:_|$))/.test(id));
function fixture(){
  const card=(suit='spade',name='sha',value=5,known=false)=>({_physical:true,suit,name,value,known,number:7,color:['heart','diamond'].includes(suit)?'red':'black',isKnownBy(){return !!this.known;}});
  const person=id=>({id,hp:3,maxHp:4,hujia:0,attitude:id==='actor'?4:-4,alive:true,inRange:true,used:0,hand:[],skills:[],storage:{csh_tb:60},damage:-1,recover:1,
    getCards(zone){if(id!=='actor'&&zone==='h')throw Error('raw opponent hand');return this.hand;},
    countCards(zone,filter){if(id!=='actor'&&filter)throw Error('filtered opponent hand');return filter?this.hand.filter(filter).length:this.hand.length;},
    *iterableGetCards(){yield* this.hand;},getSkills(){return [...this.skills];},hasSkill(s){return this.skills.includes(s);},hasSkillTag(){return false;},
    isIn(){return this.alive;},isLinked:()=>false,isDamaged(){return this.hp<this.maxHp;},
    countUsed(){return this.used;},
    addSkill(s){if(!this.skills.includes(s))this.skills.push(s);},removeSkill(s){this.skills=this.skills.filter(x=>x!==s);},
    gainMaxHp(n){this.maxHp+=n;},loseMaxHp(n){this.maxHp-=n;},markSkill(){},update(){}});
  const player=person('actor'),target=person('target'),ally=person('ally');ally.attitude=4;
  const game={players:[player,target],expandSkills(){},filterPlayer:fn=>game.players.filter(fn),filterPlayer2:()=>game.players.filter(p=>p.isIn()),hasPlayer2:fn=>game.players.some(fn),countPlayer:fn=>game.players.filter(fn).length,findPlayer:fn=>game.players.find(fn),checkMod(...args){return args.at(-3);},log(){}};
  const targetEnabled=(c,p,t)=>t.isIn()&&(c.name==='sha'?t!==p:c.name==='tao'?t===p&&p.isDamaged():false);
  const lib={filter:{cardEnabled:c=>!c.disabled,targetInRange:(c,p,t)=>t.inRange,targetEnabled,targetEnabledx:targetEnabled},skill:{global:[],probe_immune:{ai:{effect:{target:()=> 'zerotarget'}}}},suit:['club','spade','diamond','heart'],suits:['club','spade','diamond','heart','none'],color:{red:['heart','diamond'],black:['spade','club']},element:{},cshPlayExt(){}};
  const phaseUse={name:'phaseUse',player},status={event:{player,_event:true,getParent(name){return name==='chooseToUse'?this:phaseUse;}}},ui={selected:{cards:[]}};
  const get={itemtype:c=>c?._event?'event':c instanceof lib.element.VCard?'vcard':c?._physical?'card':'',copy:v=>v==null?v:JSON.parse(JSON.stringify(v)),player:()=>status.event.player,
    name:c=>c.name,color:c=>{if(c.forbidden)throw Error('hidden color');return c.color;},number:c=>c.number,nature:c=>c.nature,
    suit:c=>{if(c.forbidden)throw Error('hidden suit');return c.suit;},attitude:(p,t)=>p===t?4:p.relations?.[t.id]??t.attitude,
    value(c,p){if(c.forbidden)throw Error('hidden value');if(p!==player)throw Error('opponent recipient value');return c.value;},
    info(c){if(typeof c==='string')return lib.skill[c];return {selectTarget:1,filterTarget:true,...(c.name==='sha'?{usable:1,updateUsable:'phaseUse'}:{}),ai:{basic:{value:c.baseValue??5}}};},
    tag(c,t){const damage=['sha','damage','firedamage','thunderdamage','huogong'].includes(c.name);return t==='damage'?damage:t==='loseHp'?c.name==='losehp':t==='natureDamage'?['firedamage','thunderdamage'].includes(c.name)||!!c.nature:false;},
    result(c){if(typeof c==='string')return lib.skill[c].ai.result;return {player:c.sourceBenefit||0,target:(p,t)=>c.name==='recover'||c.name==='tao'?t.recover:c.name==='losehp'?-1.5:get.tag(c,'damage')?t.damage:0};}};
  const ctx=vm.createContext({lib,game,ui,get,_status:status,player,CacheContext:{requireCacheContext:()=>({get,delegate:x=>x})}});
  lib.element.VCard=vm.runInContext('('+vcardClass+')',ctx);
  const engine=vm.runInContext('({'+Object.values(methods).join(',\n')+'})',ctx);
  for(const n of ['effect','autoViewAs','recoverEffect'])get[n]=engine[n];
  lib.filter.cardUsable=vm.runInContext(cardUsable,ctx);
  for(const p of [player,target,ally])for(const n of ['getKnownCards','iterableGetKnownCards','getUseValue','canUse'])p[n]=engine[n];
  for(const id of ids)lib.skill[id]=vm.runInContext('('+source.slice(...property(pack,id).range)+')',ctx);
  const callbacks={};for(const id of ids){callbacks[id]=[];walk(property(pack,id),n=>{if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='set'&&n.arguments[0]?.value==='ai')callbacks[id].push(vm.runInContext('('+source.slice(...n.arguments[1].range)+')',ctx));});}
  lib.cshAsukaSync=vm.runInContext('('+sync+')',ctx);
  return {player,target,ally,card,game,lib,get,status,choose:callbacks.csh_langqiang[0],reward:callbacks.csh_tongbu_reward100[0]};
}
const score=f=>f.get.effect(null,'csh_langqiang',f.player,f.player);
check('langqiang chooses known hostile suit without raw hand access',()=>{const f=fixture();f.target.hand=[f.card('spade','sha',5,true),f.card('spade','shan',5,true)];return f.choose()==='spade';});
check('langqiang hidden suit and value changes cannot alter choice',()=>{const f=fixture();f.target.hand=[f.card('heart'),f.card('spade')];const before=f.choose();f.target.hand.forEach(c=>{c.suit='diamond';c.value=100;c.forbidden=true;});return f.choose()===before;});
check('langqiang hidden changes cannot alter activation score',()=>{const f=fixture();f.target.hand=[f.card('heart'),f.card('spade')];const before=score(f);f.target.hand.forEach(c=>{c.suit='diamond';c.value=100;c.forbidden=true;});return score(f)===before;});
check('langqiang missing known-card API falls back to public count',()=>{const f=fixture();f.target.hand=[f.card('heart')];f.target.getKnownCards=undefined;const before=f.choose();f.target.hand[0].forbidden=true;return f.choose()===before&&Number.isFinite(score(f));});
check('langqiang does not reward sealing allied hand',()=>{const f=fixture();f.game.players=[f.player,f.ally];f.ally.hand=[f.card('heart','shan',5,true)];return f.choose()!=='heart'&&score(f)<=0;});
check('langqiang rejects high own costs across every suit',()=>{const f=fixture();f.player.hand=['heart','spade','club','diamond'].map(s=>f.card(s,'shan',20));f.target.hand=[f.card()];return score(f)<0;});
check('langqiang can activate for real off-suit draw without enemies',()=>{const f=fixture();f.target.attitude=4;f.target.hand=[];f.player.hand=[f.card('spade','tao')];return f.choose()!=='spade'&&score(f)>0;});
check('langqiang response-only cards do not pretend to yield use draws',()=>{const f=fixture();f.target.hand=[];f.player.hand=[f.card('spade','shan',5)];return score(f)===0;});
check('langqiang normal sha window observes actual native use-count limit',()=>{const f=fixture();f.target.hand=[];f.player.hand=[f.card()];const open=score(f);f.player.used=1;return open>0&&score(f)===0;});
check('native canUse demonstrates default call skips but explicit true checks quota',()=>{const f=fixture(),c=f.card();f.player.used=1;return f.player.getUseValue(c)>0&&f.player.getUseValue(c,undefined,true)===0&&f.lib.filter.cardUsable(c,f.player)===false;});
check('langqiang normal card window retains actual range requirement',()=>{const f=fixture();f.target.hand=[];f.player.hand=[f.card()];f.target.inRange=false;return score(f)===0;});
check('langqiang ignores departed opponents in activation',()=>{const f=fixture();f.target.alive=false;f.target.hand=[f.card()];return score(f)===0;});
check('langqiang neutral hand is not a free hostile reward',()=>{const f=fixture();f.target.attitude=0;f.target.hand=[f.card()];return score(f)===0;});
check('langqiang known-card estimates never invoke foreign value function',()=>{const f=fixture();const c=f.card('spade','shan',5,true);c.baseValue=()=>{throw Error('foreign value function');};f.target.hand=[c];return f.choose()==='spade'&&Number.isFinite(score(f));});
check('langqiang own non-finite value has safe finite fallback',()=>{const f=fixture();f.player.hand=[f.card('heart','shan',NaN)];return Number.isFinite(score(f));});
check('langqiang ally unknown count lowers net blocking utility',()=>{const f=fixture();f.target.hand=[f.card(),f.card()];const before=score(f);f.ally.hand=[f.card(),f.card(),f.card()];f.game.players.push(f.ally);return score(f)<before;});
check('langqiang true host VCard retains physical suit',()=>{const f=fixture(),c=f.card('diamond');return f.get.autoViewAs(c) instanceof f.lib.element.VCard&&f.get.autoViewAs(c).suit==='diamond';});
check('tongbu zero sync is not reset to sixty in threat',()=>{const f=fixture();f.target.storage.csh_tb=0;return f.lib.skill.csh_tongbu.ai.threaten(f.player,f.target)===0.9;});
check('tongbu threat reads skill owner rather than attack source',()=>{const f=fixture();f.player.storage.csh_tb=20;f.target.storage.csh_tb=90;return f.lib.skill.csh_tongbu.ai.threaten(f.player,f.target)===1.8;});
check('tongbu refuses fictional gain against zero damage utility',()=>{const f=fixture();f.player.skills=['csh_tongbu'];f.player.storage.csh_tb=30;f.target.damage=0;return f.get.effect(f.target,f.card(),f.player,f.player)===0;});
check('tongbu immunity does not grant fixed source sync income',()=>{const f=fixture();f.player.skills=['csh_tongbu'];f.player.storage.csh_tb=90;f.target.skills=['probe_immune'];return f.get.effect(f.target,f.card(),f.player,f.player)===0;});
check('tongbu seventy sync increases actual hostile sha utility',()=>{const f=fixture();f.player.skills=['csh_tongbu'];f.player.storage.csh_tb=65;const before=f.get.effect(f.target,f.card(),f.player,f.player);f.player.storage.csh_tb=70;return f.get.effect(f.target,f.card(),f.player,f.player)>before;});
check('tongbu seventy sync also increases sha cost against ordinary ally',()=>{const f=fixture();f.player.skills=['csh_tongbu'];f.target.attitude=4;f.player.storage.csh_tb=65;const before=f.get.effect(f.target,f.card(),f.player,f.player);f.player.storage.csh_tb=70;return f.get.effect(f.target,f.card(),f.player,f.player)<before;});
check('tongbu sha multiplier preserves independent source utility',()=>{const f=fixture();f.player.skills=['csh_tongbu'];f.player.storage.csh_tb=90;f.target.damage=0;return f.get.effect(f.target,{name:'sha',sourceBenefit:2},f.player,f.player)===8;});
check('tongbu source income stays independent for third-party observer',()=>{const f=fixture();const viewer={relations:{actor:-4,target:4}};f.player.skills=['csh_tongbu'];f.target.damage=0;const c={name:'sha',sourceBenefit:2};f.player.storage.csh_tb=65;const before=f.get.effect(f.target,c,f.player,viewer);f.player.storage.csh_tb=90;return before<0&&f.get.effect(f.target,c,f.player,viewer)===before;});
check('tongbu enhanced sha hurts a third-party observer ally more',()=>{const f=fixture();const viewer={relations:{actor:-4,target:4}};f.player.skills=['csh_tongbu'];f.player.storage.csh_tb=65;const c={name:'sha',sourceBenefit:2},before=f.get.effect(f.target,c,f.player,viewer);f.player.storage.csh_tb=70;return f.get.effect(f.target,c,f.player,viewer)<before;});
check('tongbu other damage does not get sha multiplier',()=>{const f=fixture();f.player.skills=['csh_tongbu'];f.player.storage.csh_tb=60;const c=f.card('heart','huogong'),before=f.get.effect(f.target,c,f.player,f.player);f.player.storage.csh_tb=90;return f.get.effect(f.target,c,f.player,f.player)===before;});
check('lichang native effect rejects normal sha',()=>{const f=fixture();f.target.skills=['csh_lichang'];return f.get.effect(f.target,f.card(),f.player,f.player)===0;});
check('lichang native effect keeps fire sha',()=>{const f=fixture();f.target.skills=['csh_lichang'];return f.get.effect(f.target,{...f.card(),nature:'fire'},f.player,f.player)>0;});
check('lichang natureDamage tag keeps thunder pseudo damage',()=>{const f=fixture();f.target.skills=['csh_lichang'];return f.get.effect(f.target,{name:'thunderdamage'},f.player,f.player)>0;});
check('lichang prevents normal pseudo damage',()=>{const f=fixture();f.target.skills=['csh_lichang'];return f.get.effect(f.target,{name:'damage'},f.player,f.player)===0;});
check('lichang does not suppress independent source benefit',()=>{const f=fixture();f.target.skills=['csh_lichang'];return f.get.effect(f.target,{name:'damage',sourceBenefit:2},f.player,f.player)===8;});
check('lichang does not prevent non-damage card utility',()=>{const f=fixture();f.target.skills=['csh_lichang'];f.target.attitude=4;return f.get.effect(f.target,{name:'recover'},f.player,f.player)>0;});
check('lichang does not prevent actual negative losehp utility',()=>{const f=fixture(),c={name:'losehp'};const before=f.get.effect(f.target,c,f.player,f.target);f.target.skills=['csh_lichang'];return before<0&&f.get.effect(f.target,c,f.player,f.target)===before;});
check('reward100 does not choose ineffective recovery',()=>{const f=fixture();f.player.recover=0;return f.reward()==='摸两张牌';});
check('reward100 retains beneficial recovery choice',()=>{const f=fixture();return f.reward()==='回复1点体力';});
check('actual sync helper grants both EVA skills at eighty',()=>{const f=fixture();f.lib.cshAsukaSync(f.player,20);return f.player.storage.csh_eva_on&&f.player.hasSkill('csh_lichang')&&f.player.hasSkill('csh_langqiang');});
check('actual sync helper removes EVA skills and armed suit below eighty',()=>{const f=fixture();f.lib.cshAsukaSync(f.player,20);f.player.storage.csh_langqiang_suit='heart';f.player.storage.csh_langqiang_armed=true;f.lib.cshAsukaSync(f.player,-5);return !f.player.hasSkill('csh_lichang')&&!f.player.hasSkill('csh_langqiang')&&!f.player.storage.csh_langqiang_suit;});
check('actual sync helper keeps xinmo until sixty',()=>{const f=fixture();f.lib.cshAsukaSync(f.player,-25);const first=f.player.hasSkill('csh_xinmo');f.lib.cshAsukaSync(f.player,20);const middle=f.player.hasSkill('csh_xinmo');f.lib.cshAsukaSync(f.player,5);return first&&middle&&!f.player.hasSkill('csh_xinmo');});
for(const method of ['cardEnabled','cardEnabled2','cardRespondable'])check('actual langqiang '+method+' restricts sealed physical and virtual suit',()=>{const f=fixture();f.player.storage.csh_langqiang_suit='spade';const mod=f.lib.skill.csh_langqiang_block.mod[method];return mod(f.card(),f.target)===false&&mod(f.get.autoViewAs(f.card()),f.target)===false&&mod(f.card('heart'),f.target)===undefined;});
check('actual langqiang discard restriction is phaseDiscard only',()=>{const f=fixture();f.player.storage.csh_langqiang_suit='spade';const mod=f.lib.skill.csh_langqiang_block.mod.cardDiscardable;return mod(f.card(),f.target,'phaseDiscard')===false&&mod(f.card(),f.target,'skillCost')===undefined;});
check('langqiang draw AI counts real use income even against immune target',()=>{const f=fixture();f.player.skills=['csh_langqiang_draw'];f.player.storage.csh_langqiang_suit='heart';f.target.skills=['probe_immune'];return f.get.effect(f.target,f.card(),f.player,f.player)>0;});
check('langqiang draw AI does not count same sealed suit',()=>{const f=fixture();f.player.skills=['csh_langqiang_draw'];f.player.storage.csh_langqiang_suit='spade';f.target.skills=['probe_immune'];return f.get.effect(f.target,f.card(),f.player,f.player)===0;});
check('langqiang draw AI stops when EVA exit clears stored suit',()=>{const f=fixture();f.player.skills=['csh_langqiang_draw'];f.target.skills=['probe_immune'];return f.get.effect(f.target,f.card(),f.player,f.player)===0;});
check('source chain includes twelve groups and temporary shaPlus',()=>{const group=property(property(pack,'csh_tongbu'),'group').elements;return group.length===12&&group.every(n=>ids.includes(n.value))&&ids.includes('csh_tongbu_shaPlus')&&source.slice(...property(pack,'csh_tongbu_extraSha').range).includes('addTempSkill("csh_tongbu_shaPlus"');});
check('rule guard retains damage prevention body',()=>{const n=property(property(pack,'csh_lichang'),'content').body;return ruleSignature(source)!==ruleSignature(source.slice(0,n.range[0])+'{}'+source.slice(n.range[1]));});
check('rule guard retains actual global suit restriction',()=>{const n=property(property(property(pack,'csh_langqiang_block'),'mod'),'cardEnabled2').body;return ruleSignature(source)!==ruleSignature(source.slice(0,n.range[0])+'{}'+source.slice(n.range[1]));});
check('rule guard retains sync damage threshold',()=>{const n=property(property(pack,'csh_tongbu_shaDmg'),'filter').body;return ruleSignature(source)!==ruleSignature(source.slice(0,n.range[0])+'{}'+source.slice(n.range[1]));});
const baseline=option('--baseline');if(baseline)check('all non-AI rule AST remains unchanged',()=>ruleSignature(source)===ruleSignature(fs.readFileSync(baseline,'utf8')));
const failures=results.filter(r=>!r.passed);console.log(JSON.stringify({scope:'Asuka actual full skill-chain callbacks + native effect/VCard/known cards/getUseValue; no real game or saves',passed:results.length-failures.length,failed:failures.length,failures},null,2));process.exitCode=failures.length?1:0;
