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
  if(!Array.isArray(game.players)||game.players.length<2||game.players.length>7||(game.dead||[]).length)return '当前席位不支持安全扩席（最多8人）';
  if(game.me._trueMe||game.players.some(p=>p._cshAuxSpirit))return '当前控制或席位状态不支持召唤';
  const positions=game.players.map(p=>Number(p.dataset&&p.dataset.position));
  if(positions.some(n=>!Number.isInteger(n)||n<0||n>=positions.length)||new Set(positions).size!==positions.length)return '席位模型不兼容';
  if(typeof game.addPlayer!=='function'||typeof game.arrangePlayers!=='function'||typeof get.convertedCharacter!=='function')return '当前引擎缺少安全扩席接口';
  if(!lib.cshWallet||!lib.cshWallet.wallet||typeof lib.cshWallet.wallet.settleAssisted!=='function'||lib.cshWallet.saveGuard.blocked())return '存档或战绩接口未就绪';
  return '';
}
export function installAuxSpirit(host) {
  const lib=host.lib,game=host.game,get=host.get,ui=host.ui,status=host.status;
  if(lib.cshAuxSpirit)return lib.cshAuxSpirit;
  let run=null,timer=null;
  const aliases=[];
  const toast=s=>{if(lib.cshUI&&lib.cshUI.toast)lib.cshUI.toast(s);};
  for(const [id,m] of Object.entries(MINIONS)){
    const alias='csh_aux_'+id.slice('csh_boss_minion_'.length);
    lib.character[alias]=get.convertedCharacter({sex:m.sex,group:m.group,hp:3,maxHp:3,hujia:0,skills:['csh_aux_guard','csh_aux_aid','csh_aux_rescue','csh_aux_entry'],img:m.img,isUnseen:true,isAiForbidden:true});
    lib.translate[alias]=MINION_NAMES[id];aliases.push(alias);
  }
  function active(p){return !!(run&&status.cshAssistedMatch&&p===run.spirit&&p.isIn()&&run.owner===game.me&&!status.over&&!status.video&&lib.cshWallet.saveEpoch()===run.epoch);}
  function owner(p){return active(p)&&run.owner.isIn()?run.owner:null;}
  lib.skill.csh_aux_guard={charlotte:true,forced:true,popup:false,trigger:{global:'damageBegin4'},
    filter(e,p){return owner(p)===e.player&&e.num>0&&(p.storage.cshAuxGuard||0)<3;},
    async content(event,trigger,player){player.storage.cshAuxGuard=(player.storage.cshAuxGuard||0)+1;trigger.num--;game.log(player,'护主：为',trigger.player,'抵消1点伤害（全局限3次）');}};
  lib.skill.csh_aux_aid={charlotte:true,forced:true,trigger:{player:'phaseZhunbeiBegin'},
    filter(e,p){return !!owner(p)&&(p.storage.cshAuxAid||0)<3;},
    async content(event,trigger,player){const target=owner(player);if(!target)return;player.storage.cshAuxAid=(player.storage.cshAuxAid||0)+1;await target.draw(1);}};
  lib.skill.csh_aux_rescue={charlotte:true,forced:true,trigger:{global:'dying'},
    filter(e,p){return owner(p)===e.player&&e.player.hp<=0&&!p.storage.cshAuxRescue;},
    async content(event,trigger,player){player.storage.cshAuxRescue=true;const target=owner(player);if(target)await target.recover(1);}};
  lib.skill.csh_aux_entry={charlotte:true,forced:true,popup:false,trigger:{global:'phaseZhunbeiBegin'},
    filter(e,p){return active(p)&&!p.storage.cshAuxEntered;},
    async content(event,trigger,player){player.storage.cshAuxEntered=true;game.addVideo('storage',run.owner,['cshAssistedMatch',{v:1,type:'identity_with_spirit',spirit:player.name,owner:run.owner.playerid}]);if(player.$skill)player.$skill('妖灵守护','legend','water');game.log(player,'妖灵守护：本局战绩单独记录，不发放普通对局奖励');}};
  Object.assign(lib.translate,{csh_aux_guard:'护主',csh_aux_guard_info:'本局限三次，真人受到伤害时令此伤害-1。',csh_aux_aid:'助战',csh_aux_aid_info:'前三个准备阶段，令真人摸一张牌。',csh_aux_rescue:'同契',csh_aux_rescue_info:'本局限一次，真人濒死时回复1点体力。',csh_aux_entry:'妖灵守护',csh_aux_entry_info:'本局为辅助身份场，战绩独立记录，无普通对局奖励。'});
  function restore(){
    if(!run)return;
    for(const [key,item]of Object.entries(run.hooks||{}))if(game[key]===item.wrapper)game[key]=item.previous;
    if(timer!==null){clearTimeout(timer);timer=null;}run=null;delete status.cshAssistedMatch;
  }
  function hook(key,fn){const previous=game[key];if(typeof previous!=='function')throw Error('缺少 '+key);const wrapper=function(...args){return fn.call(this,previous,args);};run.hooks[key]={previous,wrapper};game[key]=wrapper;}
  function retry(){
    timer=null;if(!run||run.result===undefined||run.saved||lib.cshWallet.saveEpoch()!==run.epoch)return;
    const result=lib.cshWallet.wallet.settleAssisted(run.id,run.result);if(result.ok)run.saved=true;else timer=setTimeout(retry,1000);
  }
  function start(){
    if(run&&run.owner===game.me&&game.players.includes(run.spirit))return run;
    restore();const reason=spiritEligibility({lib,game,get,status});
    if(reason){if(lib.config.extension_池子魔将_csh_aux_spirit)toast('妖灵未召唤：'+reason);return null;}
    const before=game.players.slice(),positions=before.map(p=>p.dataset.position),human=game.me;
    const arenaChildren=ui.arena.children?Array.from(ui.arena.children):[];
    let spirit;
    try{
      const name=aliases[Math.floor(Math.random()*aliases.length)];
      spirit=game.addPlayer(Number(human.dataset.position)+1,name);
      if(!spirit||game.players.length!==before.length+1||!game.players.includes(spirit))throw Error('扩席未完成');
      spirit._cshAuxSpirit=true;spirit._cshAuxOwner=human;spirit.identity=human.identity==='fan'?'fan':'zhong';spirit.identityShown=true;spirit.isZhu=false;spirit.ai.shown=1;spirit.setIdentity();
      spirit.storage.cshAuxiliarySpirit=true;human.storage.cshAssistedMatch=true;
      run={id:'spirit-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),epoch:lib.cshWallet.saveEpoch(),owner:human,spirit,hooks:{},result:undefined,saved:false};
      status.cshAssistedMatch=true;
      for(const key of ['swapPlayer','swapControl'])hook(key,function(previous,args){if(args.some(p=>p&&p._cshAuxSpirit))return;return previous.apply(this,args);});
      hook('addRecord',function(previous,args){if(status.cshAssistedMatch)return;return previous.apply(this,args);});
      hook('over',function(previous,args){if(run&&typeof args[0]==='boolean'&&run.result===undefined){run.result=args[0];retry();}return previous.apply(this,args);});
      toast('妖灵已在下家加入；本局为辅助身份场，战绩单独记录');
      return run;
    }catch(error){
      restore();for(const p of game.players.slice())if(!before.includes(p)){const index=game.players.indexOf(p);if(index>=0)game.players.splice(index,1);if(p.remove)p.remove();}
      if(ui.arena.children)for(const node of Array.from(ui.arena.children))if(!arenaChildren.includes(node)&&node.classList&&node.classList.contains('player'))node.remove();
      before.forEach((p,i)=>p.dataset.position=positions[i]);ui.arena.setNumber(before.length);game.arrangePlayers();delete human.storage.cshAssistedMatch;toast('妖灵未召唤：引擎扩席失败，已恢复原席位');console.warn('[池子魔将] 妖灵扩席失败',error);return null;
    }
  }
  lib.skill.csh_aux_start={charlotte:true,trigger:{global:'gameStart'},forced:true,silent:true,popup:false,priority:10000,firstDo:true,filter(e,p){return p===game.me;},async content(){start();}};
  game.addGlobalSkill('csh_aux_start');
  const api={start,eligibility:()=>spiritEligibility({lib,game,get,status}),current:()=>run,stats:()=>lib.cshWallet.wallet.assistedStats()};lib.cshAuxSpirit=api;return api;
}
