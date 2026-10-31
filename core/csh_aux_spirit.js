/* Default-off auxiliary identity participant. Native victory checks are deliberately untouched. */
import { MINIONS, MINION_NAMES } from './csh_bossdata.js';
export function spiritEligibility(host) {
  const lib=host.lib,game=host.game,get=host.get,status=host.status;
  if(!lib.config.extension_池子魔将_csh_aux_spirit)return '开关未开启';
  if(status.connectMode||lib.config.connectMode||game.online)return '仅支持单机';
  if(status.video||game.observe||status.brawl)return '回放、观战或乱斗不召唤';
  const submode=status.mode==null?(typeof get.config==='function'?get.config('identity_mode'):null):status.mode;
  if(get.mode()!=='identity'||submode!=null&&submode!=='normal')return '仅支持标准身份场';
  if(!game.me||!['zhu','zhong','fan'].includes(game.me.identity))return '内奸及特殊身份不召唤';
  if(!Array.isArray(game.players)||game.players.length<2||game.players.length>8||(game.dead||[]).length)return '当前席位不支持安全扩席（最多9席）';
  if(game.me._trueMe||game.players.some(p=>p._cshAuxSpirit))return '当前控制或席位状态不支持召唤';
  const positions=game.players.map(p=>Number(p.dataset&&p.dataset.position));
  if(positions.some(n=>!Number.isInteger(n)||n<0||n>=positions.length)||new Set(positions).size!==positions.length)return '席位模型不兼容';
  if(['swapPlayer','swapControl','addRecord','over'].some(key=>typeof game[key]!=='function'))return '当前引擎缺少安全托管接口';
  if(typeof game.addPlayerOL!=='function'||typeof game.arrangePlayers!=='function'||typeof get.convertedCharacter!=='function'||!game.videoContent)return '当前引擎缺少安全扩席接口';
  if(!lib.cshWallet||!lib.cshWallet.wallet||typeof lib.cshWallet.wallet.settleAssisted!=='function'||lib.cshWallet.saveGuard.blocked())return '存档或战绩接口未就绪';
  return '';
}
export function installAuxSpirit(host) {
  const lib=host.lib,game=host.game,get=host.get,ui=host.ui,status=host.status;
  if(lib.cshAuxSpirit)return lib.cshAuxSpirit;
  let run=null,timer=null;
  const aliases=[];
  function summary(){
    if(!run)return null;const p=run.spirit,ownerAlive=!!(run.owner&&run.owner.isIn()),alive=!!(p&&p.isIn()),guardLeft=Math.max(0,3-Number(p&&p.storage.cshAuxGuard||0)),aidLeft=Math.max(0,3-Number(p&&p.storage.cshAuxAid||0)),rescueReady=!(p&&p.storage.cshAuxRescue);
    let state=!p?'waiting':!alive?'dead':!ownerAlive?'owner-dead':'active',reason='';
    if(run.cancelled)state='cancelled';else if(status.over)state='ended';else if(p&&alive&&ownerAlive&&!active(p)){state='paused';reason=run.owner!==game.me?'当前控制者已变化':run.owner.identity!==run.ownerIdentity?'主人身份已变化':lib.cshWallet.saveGuard.blocked()?'存档正在恢复':'本局会话已变化';}
    try{if(run.result!==undefined&&lib.cshWallet.wallet.assistedStats().receipts.includes(run.id))run.saved=true;}catch(e){}
    return {armed:true,summoned:!!p,alive:alive,ownerAlive:ownerAlive,state:state,reason:reason,name:p?MINION_NAMES['csh_boss_minion_'+p.name.slice('csh_aux_'.length)]||lib.translate[p.name]||p.name:'随机妖灵',guardLeft:guardLeft,aidLeft:aidLeft,rescueReady:rescueReady,supportActive:state==='active'&&(guardLeft>0||aidLeft>0||rescueReady),saved:run.saved,resultPending:run.result!==undefined&&!run.saved&&!run.cancelled};
  }
  function describe(){const s=summary();if(!s)return '本局未预约妖灵：'+spiritEligibility({lib,game,get,status});const names={waiting:'等待你的准备阶段',active:'守护中',dead:'妖灵已阵亡', 'owner-dead':'主人阵亡，妖灵按原身份继续作战',paused:'守护暂停',ended:'本局已结束',cancelled:'未入场，本局辅助记录中止'};return s.name+' · '+names[s.state]+(s.reason?'（'+s.reason+'）':'')+'。本局剩余：护主'+s.guardLeft+'次、援助'+s.aidLeft+'次、濒死回复'+(s.rescueReady?'1':'0')+'次。'+(!s.supportActive?'当前不能提供支援。':'')+'阵亡不补召，复活不重置次数；支援仅回复1点体力，不保证脱离濒死。辅助场不计普通战绩/奖励/池子成就。'+(s.resultPending?'辅助战绩待保存，可在行囊重试。':'');}
  function refresh(){if(!run)return;for(const p of [run.owner,run.spirit])if(p&&p.markSkill)try{p.markSkill('csh_aux_status');}catch(e){}}
  lib.skill.csh_aux_status={charlotte:true,marktext:'灵',intro:{content:function(){return lib.cshAuxSpirit?lib.cshAuxSpirit.describe():'妖灵状态未就绪';}}};lib.translate.csh_aux_status='妖灵守护状态';
  const toast=s=>{if(lib.cshUI&&lib.cshUI.toast)lib.cshUI.toast(s);};
  for(const [id,m] of Object.entries(MINIONS)){
    const alias='csh_aux_'+id.slice('csh_boss_minion_'.length);
    lib.character[alias]=get.convertedCharacter({sex:m.sex,group:m.group,hp:3,maxHp:3,hujia:0,skills:['csh_aux_guard','csh_aux_aid','csh_aux_rescue','csh_aux_entry'],img:m.img,dieAudios:["false"],isUnseen:true,isAiForbidden:true});
    lib.translate[alias]=MINION_NAMES[id];aliases.push(alias);
  }
  function active(p){return !!(run&&status.cshAssistedMatch&&p===run.spirit&&p&&p.isIn()&&run.owner===game.me&&run.owner.identity===run.ownerIdentity&&!status.over&&!status.video&&!status.connectMode&&!lib.config.connectMode&&!lib.cshWallet.saveGuard.blocked()&&lib.cshWallet.saveEpoch()===run.epoch);}
  function owner(p){return active(p)&&run.owner.isIn()?run.owner:null;}
  lib.skill.csh_aux_guard={charlotte:true,forced:true,popup:false,trigger:{global:'damageBegin4'},
    filter(e,p){return owner(p)===e.player&&e.num>0&&(p.storage.cshAuxGuard||0)<3;},
    async content(event,trigger,player){if(!lib.skill.csh_aux_guard.filter(trigger,player))return;player.storage.cshAuxGuard=(player.storage.cshAuxGuard||0)+1;trigger.num--;refresh();game.log(player,'护主：为',trigger.player,'抵消1点伤害（全局限3次）');}};
  lib.skill.csh_aux_aid={charlotte:true,forced:true,trigger:{player:'phaseZhunbeiBegin'},
    filter(e,p){return !!owner(p)&&(p.storage.cshAuxAid||0)<3;},
    async content(event,trigger,player){const target=owner(player);if(!target||(player.storage.cshAuxAid||0)>=3)return;player.storage.cshAuxAid=(player.storage.cshAuxAid||0)+1;await target.draw(1);refresh();}};
  lib.skill.csh_aux_rescue={charlotte:true,forced:true,trigger:{global:'dying'},
    filter(e,p){return owner(p)===e.player&&e.player.hp<=0&&!p.storage.cshAuxRescue;},
    async content(event,trigger,player){if(!lib.skill.csh_aux_rescue.filter(trigger,player))return;const target=owner(player);if(!target)return;player.storage.cshAuxRescue=true;await target.recover(1);refresh();}};
  lib.skill.csh_aux_entry={charlotte:true,forced:true,popup:false,trigger:{global:'phaseZhunbeiBegin'},
    filter(e,p){return active(p)&&!p.storage.cshAuxEntered;},
    async content(event,trigger,player){player.storage.cshAuxEntered=true;game.addVideo('storage',run.owner,['cshAssistedMatch',{v:1,type:'identity_with_spirit',spirit:player.name,owner:run.owner.playerid}]);if(player.$skill)player.$skill('妖灵守护','legend','water');game.log(player,'妖灵守护：本局战绩单独记录，不发放普通对局奖励');}};
  Object.assign(lib.translate,{csh_aux_guard:'护主',csh_aux_guard_info:'本局限三次，真人受到伤害时令此伤害-1。',csh_aux_aid:'助战',csh_aux_aid_info:'前三个准备阶段，令真人摸一张牌。',csh_aux_rescue:'同契',csh_aux_rescue_info:'本局限一次，真人濒死时回复1点体力。',csh_aux_entry:'妖灵守护',csh_aux_entry_info:'本局为辅助身份场，战绩独立记录，无普通对局奖励。'});
  function restore(){
    if(!run)return;
    for(const [key,item]of Object.entries(run.hooks||{}))if(game[key]===item.wrapper)game[key]=item.previous;
    if(timer!==null){clearTimeout(timer);timer=null;}for(const p of [run.owner,run.spirit])if(p&&p.unmarkSkill)try{p.unmarkSkill('csh_aux_status');}catch(e){}if(run.owner&&run.owner.storage)delete run.owner.storage.cshAssistedMatch;run=null;delete status.cshAssistedMatch;
  }
  function hook(key,fn){const previous=game[key];if(typeof previous!=='function')throw Error('缺少 '+key);const wrapper=function(...args){return fn.call(this,previous,args);};run.hooks[key]={previous,wrapper};game[key]=wrapper;}
  function retry(){timer=null;if(!run||run.cancelled||run.result===undefined||run.saved||lib.cshWallet.saveEpoch()!==run.epoch)return;
    const Q=lib.cshWallet.pending,result=Q?Q.put('assisted',run.id,{win:run.result}):lib.cshWallet.wallet.settleAssisted(run.id,run.result);
    if(result.ok)run.saved=true;else {if(!run.saveNotice){toast(result.durable?'辅助战绩已保留，恢复存储后会自动补记':'辅助战绩暂未写入本机，请保持页面打开并恢复存储');run.saveNotice=true;}timer=setTimeout(retry,2000);}refresh();}
  function arm(){
    if(run&&run.owner===game.me&&run.epoch===lib.cshWallet.saveEpoch())return run;
    restore();const reason=spiritEligibility({lib,game,get,status});if(reason){if(lib.config.extension_池子魔将_csh_aux_spirit)toast('妖灵未预约：'+reason);return null;}
    run={id:'spirit-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),epoch:lib.cshWallet.saveEpoch(),owner:game.me,ownerIdentity:game.me.identity,spirit:null,hooks:{},result:undefined,saved:false,summoning:false};status.cshAssistedMatch=true;
    for(const key of ['swapPlayer','swapControl'])hook(key,function(previous,args){if(args.some(p=>p&&p._cshAuxSpirit))return;return previous.apply(this,args);});
    hook('addRecord',function(previous,args){if(status.cshAssistedMatch)return;return previous.apply(this,args);});
    hook('over',function(previous,args){if(run&&typeof args[0]==='boolean'&&run.result===undefined){run.result=args[0];if(!run.spirit){run.cancelled=true;run.saved=true;toast("妖灵尚未入场，本局辅助记录中止；本局不计普通奖励");}else retry();}return previous.apply(this,args);});
    refresh();return run;
  }
  async function start(cause){
    const current=run||arm();if(!current)return null;if(current.spirit||current.summoning)return current;
    if(!['zhu','zhong','fan'].includes(current.owner.identity)||game.players.concat(game.dead||[]).length>8){restore();toast('妖灵未召唤：当前身份或席位已经变化');return null;}
    if(current.owner!==game.me||current.epoch!==lib.cshWallet.saveEpoch()||status.over||status.video||status.connectMode||lib.config.connectMode||game.online||lib.cshWallet.saveGuard.blocked())return null;
    current.summoning=true;current.summonedAt={trigger:cause&&cause.triggername||"manual",owner:!!(cause&&cause.player===current.owner)};
    const playersRef=game.players,before=game.players.slice(),dead=(game.dead||[]).slice(),all=before.concat(dead),positions=all.map(p=>p.dataset.position),seats=all.map(p=>p.getSeatNum?p.getSeatNum():null),human=current.owner;
    const name=aliases[Math.floor(Math.random()*aliases.length)];let spawned=null;
    function sameSession(){return run===current&&game.me===human&&game.players===playersRef&&current.epoch===lib.cshWallet.saveEpoch()&&!status.over&&!status.video&&!status.connectMode&&!lib.config.connectMode&&!lib.cshWallet.saveGuard.blocked();}
    try{
      const spirit=spawned=await game.addPlayerOL(human,name,null,true,{source:human,animate:false});
      if(!sameSession()||!spirit||game.players.length!==before.length+1||!game.players.includes(spirit))throw Error('召唤会话已失效或扩席未完成');
      spirit._cshAuxSpirit=true;spirit._cshAuxSource='csh_boss_minion_'+name.slice('csh_aux_'.length);spirit._cshAuxOwner=human;spirit.identity=human.identity==='fan'?'fan':'zhong';spirit.identityShown=true;spirit.isZhu=false;spirit.ai.shown=1;spirit.setIdentity();
      spirit.storage.cshAuxiliarySpirit=true;human.storage.cshAssistedMatch=true;current.spirit=spirit;
      game.addVideo('cshAuxSpawn',null,{position:Number(spirit.dataset.position),name:spirit.name,identity:spirit.identity,owner:Number(human.dataset.position)});
      await spirit.draw(4);
      if(!sameSession())throw Error('入场等待期间会话已变化');
      if(active(spirit)&&!spirit.storage.cshAuxEntered)await lib.skill.csh_aux_entry.content(null,null,spirit);
      refresh();toast('妖灵以守护形态加入下家；点“灵”查看状态与剩余支援，本局战绩独立');return current;
    }catch(error){
      // Remove only this attempt's hidden participant. A late completion must never roll back a newer table.
      const owned=playersRef.filter(p=>!before.includes(p)&&(p===spawned||p.name===name));if(spawned&&!owned.includes(spawned))owned.push(spawned);
      const sameActors=run===current&&game.me===human&&game.players===playersRef;
      for(const p of owned){for(const list of [playersRef,game.players]){const at=list.indexOf(p);if(at>=0)list.splice(at,1);}if(game.playerMap&&game.playerMap[p.playerid]===p)delete game.playerMap[p.playerid];if(p.remove)p.remove();}
      if(sameActors&&game.players.length===before.length&&before.every(p=>game.players.includes(p))){all.forEach((p,i)=>{p.dataset.position=positions[i];if(seats[i]!=null&&p.setSeatNum)p.setSeatNum(seats[i]);});ui.arena.setNumber(all.length);game.arrangePlayers();}
      delete human.storage.cshAssistedMatch;if(run===current)restore();toast('妖灵未召唤：本次入场已取消');console.warn('[池子魔将] 妖灵扩席失败',error);return null;
    }
  }
  if(game.videoContent)game.videoContent.cshAuxSpawn=function(data){
    const players=game.players.concat(game.dead||[]);
    if(!data||!aliases.includes(data.name)||!Number.isInteger(data.position)||data.position<0||data.position>players.length||players.length>8||players.some(p=>p.storage&&p.storage.cshAuxiliarySpirit))return;
    const p=game.addPlayer(data.position,data.name);p._cshAuxSpirit=true;p.isZhu=false;p.identity=data.identity==='fan'?'fan':'zhong';p.identityShown=true;p.setIdentity();p.storage.cshAuxiliarySpirit=true;
    game.playerMap={};for(const q of game.players.concat(game.dead||[]))game.playerMap[q.dataset.position]=q;
    const human=game.playerMap[data.owner];if(human)human.storage.cshAssistedMatch=true;
  };
  lib.skill.csh_aux_start={charlotte:true,trigger:{global:['gameStart','phaseZhunbeiBegin']},forced:true,silent:true,popup:false,priority:10000,firstDo:true,
    filter(e,p,name){return p===game.me&&(name==='gameStart'||!!run&&!run.spirit&&!run.summoning&&e.player===run.owner);},
    async content(event,trigger){if(event.triggername==='gameStart'){if(run&&run.spirit&&game.players.concat(game.dead||[]).includes(run.spirit))return;restore();arm();}else await start({triggername:event.triggername,player:trigger.player});}};
  game.addGlobalSkill('csh_aux_start');
  const api={start,arm,eligibility:()=>spiritEligibility({lib,game,get,status}),current:()=>run,summary,describe,refresh,stats:()=>lib.cshWallet.wallet.assistedStats()};lib.cshAuxSpirit=api;return api;
}
