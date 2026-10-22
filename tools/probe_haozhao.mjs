// Actual new skills + installed GameEvent/compiler/useCard resolution steps, isolated saves.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {root,host,parse,walk,keyOf,property,skillsOf} from './lib/skill_audit.mjs';
const read=p=>fs.readFileSync(path.join(host,p),'utf8');
const source=fs.readFileSync(path.join(root,'skills/index.js'),'utf8'), pack=skillsOf(parse(source));
const hostSources={event:read('noname/library/element/gameEvent.js'),content:read('noname/library/element/content.js'),base:read('noname/library/element/GameEvent/compilers/ContentCompilerBase.js'),array:read('noname/library/element/GameEvent/compilers/ArrayCompiler.js'),cards:read('card/standard.js'),get:read('noname/get/index.js')};
const trees=Object.fromEntries(Object.entries(hostSources).map(([k,s])=>[k,parse(s)]));
let nativeWuxieCandidates;walk(trees.cards,n=>{if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.object.name==='game'&&n.callee.property.name==='filterPlayer'&&n.arguments[0]){const text=hostSources.cards.slice(...n.arguments[0].range);if(text.includes('trigger.getParent().directHit.includes(current)')&&text.includes('current.hasWuxie(map)'))nativeWuxieCandidates=text;}});
function classText(file,name){let found;walk(trees[file],n=>{if(n.type==='ClassDeclaration'&&n.id.name===name)found=hostSources[file].slice(...n.range);});if(!found)throw Error('class '+name);return found;}
function prop(file,name){let found,scope=trees[file];if(file==='content'){walk(trees[file],n=>{if(n.type==='VariableDeclarator'&&n.id.name==='Content')scope=n.init;});found=scope.properties.find(n=>keyOf(n)===name);}else walk(scope,n=>{if(n.type==='Property'&&keyOf(n)===name&&!found)found=n;});if(!found)throw Error('property '+name);return found.method?'({'+hostSources[file].slice(...found.range)+'}).'+name:hostSources[file].slice(...found.value.range);}
const results=[];
async function check(name,fn){try{const value=await fn();results.push({name,passed:value===true,detail:value===true?undefined:value});}catch(e){results.push({name,passed:false,error:e.message});}}
await check('registered 100th hero converts through native Character as male Wei 2/3/1',()=>{
  const text=fs.readFileSync(path.join(root,'character/index.js'),'utf8'),tree=parse(text);let pack;walk(tree,n=>{if(n.type==='ExportDefaultDeclaration')pack=n.declaration;});
  const roster=property(pack,'character'),node=property(roster,'csh_haozhao');
  const native=read('noname/library/element/character.js');let cls;walk(parse(native),n=>{if(n.type==='ClassDeclaration'&&n.id.name==='Character')cls=native.slice(...n.range);});
  const ctx=vm.createContext({get:{is:{object:v=>!!v&&typeof v==='object'}},lib:{}}),Character=vm.runInContext('('+cls+')',ctx),data=vm.runInContext('('+text.slice(...node.range)+')',ctx),info=new Character(data);
  return roster.properties.length===100&&info.hp===2&&info.maxHp===3&&info.hujia===1&&info.sex==='male'&&info.group==='wei'&&info.skills.join(',')==='csh_juwei,csh_chonglei'&&property(property(pack,'translate'),'csh_haozhao').value==='郝昭'&&property(property(pack,'characterTitle'),'csh_haozhao').value.includes('孤城不摧');
});
await check('real legend registration contains new hero once',()=>{
  const text=fs.readFileSync(path.join(root,'main/content.js'),'utf8');let call;walk(parse(text),n=>{if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='addArray'&&n.arguments[0]?.type==='ArrayExpression'&&n.arguments[0].elements.some(e=>e.value==='csh_haozhao'))call=text.slice(...n.range);});
  const lib={rank:{rarity:{legend:[]}}};lib.rank.rarity.legend.addArray=function(list){this.push(...list);};vm.runInNewContext(call,{lib});return lib.rank.rarity.legend.join(',')==='csh_haozhao';
});
function fixture(){
  const history=[], log=[], manager={stack:[],setStatusEvent(e){this.stack.push(e);},popStatusEvent(){this.stack.pop();},getStartedEvent(){return this.stack.at(-1);}};
  const status={eventManager:manager,pauseManager:{waitPause:async()=>{}},dieClose:[],dying:[],event:null};
  const person=id=>({playerid:id,storage:{},hp:2,maxHp:3,hujia:1,drawn:0,hand:[],skipList:[],alive:true,
    syncStorage(k){log.push(['sync',k,this.storage[k]]);},markSkill(){},isIn(){return this.alive;},isDead(){return !this.alive;},isOut:()=>false,isLinked:()=>false,
    hasSkillTag:()=>false,hasSkill:()=>false,update(){},getHp(){return this.hp;},$damagepop(){},addTempClass(){},getSkills:()=>[],
    countCards(){return this.hand.length;},getCards(){return this.hand;},draw:async function(n=1){this.drawn+=n;log.push(['draw',n]);},changeHujia:async function(n){this.hujia+=n;log.push(['armor',n]);},
    chooseToUse(){log.push(['respond',id]);return {set(){return this;},forResult:async()=>({bool:true,result:'shaned'})};},
    damage:async function(){log.push(['damage',id]);},addGaintag(){},mayHaveShan:()=>1,
    chooseControl(controls){this.controls=controls;const selected={player:this,controls};return {set(k,v){selected[k]=v;return this;},forResult:async()=>{status.event=selected;return {control:this.choice??'选项二'};}};},
  });
  const player=person('hao'),other=person('other');
  const lib={skill:{global:[]},element:{content:{}},config:{},phaseName:[],card:{},translate:{}};
  const get={info:c=>lib.card[c.name],type:c=>lib.card[c.name].type,event:()=>status.event,prompt:()=>'',nature:c=>c.nature,
    effect:(t,c)=>lib.card[c.name].value??-2,tag:(c,t)=>lib.card[c.name][t]||0,is:{versus:()=>false},damageEffect:()=>-1,attitude:()=>-1};
  const game={players:[player,other],dead:[],online:false,globalEventHandlers:{addHandlerToEvent(){}},getGlobalHistory:key=>key?history:({everything:history,changeHp:[]}),broadcast(){},broadcastAll(){},delayx:async()=>{},hasNature:c=>!!c.nature,hasPlayer:fn=>[player,other].some(fn)};
  const ui={};
  const ctx=vm.createContext({lib,get,game,ui,_status:status,document:{getElementsByClassName:()=>[]},console});
  vm.runInContext('Array.prototype.addArray=function(xs){for(const x of xs)if(!this.includes(x))this.push(x);return this;}; Array.prototype.sortBySeat=function(){return this;}; Array.prototype.remove=function(x){const i=this.indexOf(x);if(i>=0)this.splice(i,1);return this;};',ctx);
  const Base=vm.runInContext('('+classText('base','ContentCompilerBase')+')',ctx);ctx.ContentCompilerBase=Base;
  const ArrayCompiler=vm.runInContext('('+classText('array','ArrayCompiler')+')',ctx), arr=new ArrayCompiler();
  ctx.compiler={compile(content){if(typeof content==='string')content=lib.element.content[content];return content?.compiled?content:arr.compile(Array.isArray(content)?content:[content]);}};
  const Event=vm.runInContext('('+classText('event','GameEvent')+')',ctx);lib.element.GameEvent=Event;ctx.GameEvent=Event;
  // Use the native event constructor, queue proxy, thenable, start, loop, compiler and handlers.
  // Trigger dispatch below isolates the host skill registry; no live game is imported.
  game.createEvent=(name,trigger,parent)=>{const e=new Event(name,trigger,manager);(parent||manager.getStartedEvent())?.next.push(e);return e;};
  for(const id of ['csh_juwei','csh_chonglei'])lib.skill[id]=vm.runInContext('('+source.slice(...property(pack,id).range)+')',ctx);
  lib.element.content.emptyEvent=vm.runInContext('('+prop('content','emptyEvent')+')',ctx);
  const changeHp=vm.runInContext('('+prop('content','changeHp')+')',ctx);
  const nativeUse=vm.runInContext('('+prop('content','useCard')+')',ctx);
  for(const name of ['sha','wuzhong','tao','juedou']){let n;walk(trees.cards,x=>{if(x.type==='Property'&&keyOf(x)===name&&x.value.type==='ObjectExpression'&&!n)n=x.value;});const p=n.properties.find(x=>keyOf(x)==='content');lib.card[name]={type:name==='sha'||name==='tao'?'basic':'trick',content:vm.runInContext('({'+hostSources.cards.slice(...p.range)+'}).content',ctx),value:name==='wuzhong'||name==='tao'?2:-2,damage:name==='sha'||name==='juedou'?1:0,recover:name==='tao'?1:0};}
  lib.card.equip={type:'equip',content:async()=>{} };lib.card.delay={type:'delay',content:async()=>{} };
  lib.filter={cardEnabled:()=>true};lib.element.VCard=class{constructor(c){Object.assign(this,c);}};
  let use, costCount=0, beforeTarget, cancelFirst=false;
  Event.prototype.trigger=async function(name){
    log.push(['trigger',name,this.type||'']);
    if(cancelFirst&&name==='useCardToBegin'&&this.type==='card'&&this.parent.childEvents.filter(e=>e.type==='card').length===1)this.finish();
    if(name==='useCardToTargeted'){
      await beforeTarget?.(this,use);
      const s=lib.skill.csh_juwei;
      if(s.filter(this,player)){
        costCount++;const cost={};await s.cost(cost,this,player);
        if(cost.result.bool)await s.content(cost.result,this,player);
      }
    }
    if(name==='changeHp'&&lib.skill.csh_chonglei.filter(this,player))await lib.skill.csh_chonglei.content({},this,player);
  };
  async function run(name='wuzhong',choice='背水！',options={}){
    player.choice=choice;lib.skill.csh_juwei.init(player);
    use=new Event('useCard',false,manager);
    const targets=vm.runInContext('[]',ctx);targets.push(...(options.targets||[player]));
    Object.assign(use,{player:options.source||player,card:{name},cards:[{name}],targets,num:0,baseDamage:1,effectCount:1,effectedCount:0,excluded:vm.runInContext('[]',ctx),directHit:vm.runInContext('[]',ctx),customArgs:{default:{},hao:{}},animate:false});
    if(options.info)Object.assign(lib.card[name],options.info);
    beforeTarget=options.beforeTarget;
    cancelFirst=!!options.cancelFirst;
    // Preserve exact native step indices and loop destinations; setup/animation not under test.
    const steps=Array.from({length:17},()=>async()=>{});
    for(const i of [5,9,10,11,12,13,14,15])steps[i]=nativeUse[i];
    if(options.afterTarget)steps[11]=async function(e,t,p){await options.afterTarget(e);await nativeUse[11](e,t,p);};
    steps[16]=async e=>e.finish();use.setContent(steps);await use.start();
    return use;
  }
  async function hp(delta,parentName='loseHp'){
    const e=new Event('changeHp',false,manager);e.num=delta;e.originalHp=player.hp;e.player=player;e.popup=false;e.parent={name:parentName};
    await changeHp(e,null,player);return {event:e};
  }
  function wuxieCandidates(){ctx.event={triggername:'useCardToBegin'};ctx.trigger={getParent:()=>use};ctx.map={card:use.card,player:use.player,target:player};game.checkMod=()=> 'unchanged';for(const p of game.players)p.hasWuxie=()=>true;const fn=vm.runInContext('('+nativeWuxieCandidates+')',ctx);return game.players.filter(fn);}
  return {lib,get,game,ctx,player,other,log,run,hp,Event,wuxieCandidates,get use(){return use;},get costCount(){return costCount;}};
}
await check('skill initialization adds no HP/armor event and preserves existing X',()=>{const f=fixture();f.lib.skill.csh_juwei.init(f.player);if(f.player.storage.csh_juwei!==1)return false;f.player.storage.csh_juwei=7;f.lib.skill.csh_juwei.init(f.player);return f.player.hp===2&&f.player.maxHp===3&&f.player.hujia===1&&f.player.storage.csh_juwei===7&&!f.log.some(x=>x[0]==='armor');});
for(const [x,c,after,draw]of [[3,'选项一',4,0],[3,'选项二',3,3],[3,'背水！',4,4]])await check(`X=${x} ${c} order and amount`,async()=>{const f=fixture();f.player.storage.csh_juwei=x;await f.run('equip',c,{info:{type:c==='背水！'?'trick':'equip',content:async()=>{}}});return f.player.storage.csh_juwei===after&&f.player.drawn===draw&&(!c.includes('背水')||f.log.findIndex(x=>x[0]==='sync')<f.log.findIndex(x=>x[0]==='draw'));});
await check('self wuzhong backwater draws 2 skill + 4 card, one target trigger',async()=>{const f=fixture();await f.run();return f.player.drawn===6&&f.player.storage.csh_juwei===2&&f.costCount===1&&f.use.childEvents.filter(x=>x.type==='card').length===2;});
await check('extra effect has same original useCard parent/cards and response events',async()=>{const f=fixture();await f.run();const cards=f.use.childEvents.filter(x=>x.type==='card');return cards.length===2&&cards.every(x=>x.parent===f.use&&x.cards===f.use.cards&&x._triggered===4)&&f.log.filter(x=>x[1]==='useCardToBegin').length===2&&f.use.effectCount===1;});
await check('cancel leaves X and directHit untouched',async()=>{const f=fixture();await f.run('wuzhong','cancel2');return f.player.drawn===2&&f.player.storage.csh_juwei===1&&f.use.directHit.length===0;});
await check('equipment/delay expose options one/two/cancel only',async()=>{for(const name of ['equip','delay']){const f=fixture();await f.run(name,'选项二');if(f.player.controls.includes('背水！')||f.player.drawn!==1)return false;}return true;});
for(const info of [{contentBefore:async()=>{}},{contentAfter:async()=>{}},{multitarget:true},{singleCard:true},{filterAddedTarget:()=>true}])await check('unsupported compound effect disables backwater '+Object.keys(info)[0],async()=>{const f=fixture();await f.run('equip','选项二',{info:{...info,type:'trick'}});return !f.player.controls.includes('背水！');});
await check('multiple targets never trigger',async()=>{const f=fixture();await f.run('equip','选项二',{targets:[f.player,f.other]});return f.costCount===0&&f.player.drawn===0;});
await check('target appended before targeted check prevents skill',async()=>{const f=fixture();await f.run('equip','选项二',{beforeTarget:(e,u)=>{if(u.targets.length===1)u.targets.push(f.other);}});return f.costCount===0;});
await check('target transferred before final decision does not trigger for former target',async()=>{const f=fixture();await f.run('equip','选项二',{beforeTarget:(e,u)=>{u.targets[0]=f.other;}});return f.costCount===0&&f.player.drawn===0;});
await check('X has no added hundred-point or round cap',async()=>{const f=fixture();f.player.storage.csh_juwei=1000;await f.run('equip','选项一');return f.player.storage.csh_juwei===1001;});
await check('late appended target is never repeated by backwater',async()=>{const f=fixture();await f.run('wuzhong','背水！',{afterTarget:u=>u.targets.push(f.other)});return f.player.drawn===6&&f.other.drawn===2&&f.use.childEvents.filter(e=>e.type==='card'&&e.target===f.other).length===1;});
await check('duplicate designation event cannot reoffer same use',async()=>{const f=fixture();await f.run('equip','选项二');const t={target:f.player,getParent:()=>f.use};return !f.lib.skill.csh_juwei.filter(t,f.player);});
await check('cancelled/removed target does not get an extra effect',async()=>{for(const mode of ['removed','excluded','all','dead']){const f=fixture();await f.run('wuzhong','背水！',{info:{content:async e=>{if(mode==='removed')e.parent.targets=[];if(mode==='excluded')e.parent.excluded.push(f.player);if(mode==='all')e.parent.all_excluded=true;if(mode==='dead')f.player.alive=false;}}});if(f.use.childEvents.filter(x=>x.type==='card').length!==1)return false;}return true;});
await check('custom target damage arguments preserved',async()=>{const f=fixture();const seen=[];await f.run('wuzhong','背水！',{beforeTarget:(e,u)=>{u.customArgs.default.extraDamage=2;u.customArgs.hao.shanRequired=3;},info:{content:async e=>seen.push([e.extraDamage,e.shanRequired,e.directHit])}});return seen.length===2&&seen.every(a=>a[0]===2&&a[1]===3&&a[2]);});
await check('whole current card cannot be responded to, including other Wuxie players',async()=>{const f=fixture();await f.run('wuzhong','选项一');return f.game.players.every(p=>f.use.directHit.includes(p))&&f.player.storage.csh_juwei===2;});
await check('following card has independent response set',async()=>{const f=fixture();await f.run('equip','选项一');await f.run('equip','选项二');return f.use.directHit.length===0&&f.player.storage.csh_juwei===2;});
await check('native Wuxie candidate filter blocks every responder only for this card',async()=>{const f=fixture();await f.run('wuzhong','选项一');if(f.wuxieCandidates().length!==0)return false;await f.run('wuzhong','选项二');return f.wuxieCandidates().length===2;});
await check('cancelled first effect still schedules exactly one legal extra effect',async()=>{const f=fixture();await f.run('wuzhong','背水！',{cancelFirst:true});return f.player.drawn===4&&f.use.childEvents.filter(e=>e.type==='card').length===2&&f.costCount===1;});
await check('native Sha option two retains real Shan response',async()=>{const f=fixture();await f.run('sha','选项二',{source:f.other});return f.player.drawn===1&&f.log.filter(x=>x[0]==='respond').length===1&&!f.log.some(x=>x[0]==='damage');});
await check('native Sha option one blocks Shan but does not force card effectiveness',async()=>{const f=fixture();await f.run('sha','选项一',{source:f.other});return !f.log.some(x=>x[0]==='respond')&&f.log.filter(x=>x[0]==='damage').length===1;});
await check('native Sha backwater resolves twice without new targeting',async()=>{const f=fixture();await f.run('sha','背水！',{source:f.other});return !f.log.some(x=>x[0]==='respond')&&f.log.filter(x=>x[0]==='damage').length===2&&f.costCount===1;});
for(const [hp,armor,delta,reason,expectedHp,expectedArmor]of [[2,1,-1,'damage',2,0],[2,1,-2,'damage',1,1],[1,0,1,'recover',2,1],[3,0,1,'recover',3,0],[3,0,-2,'loseHp',1,1],[-1,0,-1,'loseHp',-2,1],[2,0,0,'gainMaxHp',2,0]])await check(`actual changeHp ${hp}/${armor} ${reason} ${delta}`,async()=>{const f=fixture();f.player.hp=hp;f.player.hujia=armor;await f.hp(delta,reason);return f.player.hp===expectedHp&&f.player.hujia===expectedArmor;});
await check('enemy damage AI chooses draw at one HP despite armor',()=>{const f=fixture();f.player.hp=1;f.player.hujia=9;f.player.storage.csh_juwei=1;return ['sha','juedou'].every(name=>f.lib.skill.csh_juwei.ai.choose({card:{name},player:f.other},f.player,true)==='选项二');});
await check('positive self wuzhong AI chooses real backwater',()=>{const f=fixture();f.player.storage.csh_juwei=1;return f.lib.skill.csh_juwei.ai.choose({card:{name:'wuzhong'},player:f.player},f.player,true)==='背水！';});
await check('AI cannot choose unsupported backwater or unbounded X growth',()=>{const f=fixture();f.player.storage.csh_juwei=100;f.player.hand=Array(200);return f.lib.skill.csh_juwei.ai.choose({card:{name:'wuzhong'},player:f.player},f.player,false)==='选项二';});
// Full skill file protection: only the two added definitions and translations may differ.
const baseArg=process.argv.indexOf('--baseline');
if(baseArg>=0)await check('all previously existing skills/rules/AI unchanged',()=>{const ast=parse(source),remove=[];walk(ast,n=>{if(n.type==='Property'&&['csh_juwei','csh_chonglei','csh_juwei_info','csh_chonglei_info'].includes(keyOf(n)))remove.push(n.range);});let stripped=source;for(const [a,b]of remove.sort((x,y)=>y[0]-x[0]))stripped=stripped.slice(0,a)+stripped.slice(b).replace(/^,\s*/,'');const signature=s=>JSON.stringify(parse(s),(k,v)=>['parent','tokens','comments','loc','range','start','end','raw'].includes(k)?undefined:v);return signature(stripped)===signature(fs.readFileSync(process.argv[baseArg+1],'utf8'));});
const failures=results.filter(r=>!r.passed);console.log(JSON.stringify({scope:'Haozhao actual skills, GameEvent/compiler/target-resolution/changeHp; isolated dispatch, no live saves',passed:results.length-failures.length,failed:failures.length,failures},null,2));process.exitCode=failures.length?1:0;
