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
  /* S2：增益运行态是可选模块（纯内存、零依赖）。宿主没加载它时整条增益链静默跳过，
     既有助战流程一行不变；所有调用都包在 try 里。 */
  function buffRuntime(){try{var w=typeof window!=='undefined'?window:null;return w&&w.CSHSpiritBuffRuntime?w.CSHSpiritBuffRuntime:null;}catch(e){return null;}}
  function summary(){
    if(!run)return null;const p=run.spirit,ownerAlive=!!(run.owner&&run.owner.isIn()),alive=!!(p&&p.isIn()),guardLeft=Math.max(0,3-Number(p&&p.storage.cshAuxGuard||0)),aidLeft=Math.max(0,3-Number(p&&p.storage.cshAuxAid||0)),rescueReady=!(p&&p.storage.cshAuxRescue);
    let state=!p?'waiting':!alive?'dead':!ownerAlive?'owner-dead':'active',reason='';
    if(run.cancelled)state='cancelled';else if(run.fallback)state='fallback';else if(status.over||run.result!==undefined)state='ended';else if(p&&alive&&ownerAlive&&!active(p)){state='paused';reason=run.owner!==game.me?'当前控制者已变化':run.owner.identity!==run.ownerIdentity?'主人身份已变化':lib.cshWallet.saveGuard.blocked()?'存档正在恢复':'本局会话已变化';}
    try{if(run.result!==undefined&&lib.cshWallet.wallet.assistedStats().receipts.includes(run.rewardId))run.saved=true;}catch(e){}
    return {armed:true,summoned:!!p,alive:alive,ownerAlive:ownerAlive,state:state,reason:reason,name:p?MINION_NAMES['csh_boss_minion_'+p.name.slice('csh_aux_'.length)]||lib.translate[p.name]||p.name:'随机妖灵',guardLeft:guardLeft,aidLeft:aidLeft,rescueReady:rescueReady,supportActive:state==='active'&&(guardLeft>0||aidLeft>0||rescueReady),fallback:!!run.fallback,saved:run.saved,resultPending:run.result!==undefined&&!run.saved&&!run.cancelled};
  }
  function buffStatus(){
    try{
      const rt=buffRuntime(),s=rt&&run?rt.snapshot(run.id):null;
      if(!s||!s.active)return null;
      const table=typeof window!=='undefined'&&window.CSHSpiritBuffs;
      const t=table&&table.TEMPLATES[s.template];
      if(!t)return null;
      return {name:t.name,text:t.text,ready:!!s.activated[s.template]||(s.used[s.template]||0)<s.perGame};
    }catch(e){return null;}
  }
  function buffText(){
    const buff=buffStatus();
    return buff?'本局增益 · '+buff.name+'：'+(buff.ready?buff.text:'本局已使用。'):'';
  }
  function describe(){const s=summary();if(!s)return '本局未预约妖灵：'+spiritEligibility({lib,game,get,status});const names={waiting:'等待你的准备阶段',active:'守护中',dead:'妖灵已阵亡', 'owner-dead':'主人阵亡，妖灵按原身份继续作战',paused:'守护暂停',ended:'本局已结束',cancelled:'本局未形成有效对局',fallback:'妖灵未入场，按普通对局结算'};return s.name+' · '+names[s.state]+(s.reason?'（'+s.reason+'）':'')+'。本局剩余：护主'+s.guardLeft+'次、援助'+s.aidLeft+'次、濒死回复'+(s.rescueReady?'1':'0')+'次。'+(!s.supportActive?'当前不能提供支援。':'')+'阵亡不补召，复活不重置次数；支援仅回复1点体力，不保证脱离濒死。助战独立战绩，完局按身份场标准发放奖励；不计普通战绩或池子成就。'+(s.resultPending?'本局结果与奖励待保存，可在行囊重试。':'')+buffText();}
  const statusLabel={
    waiting:'等待你的准备阶段',active:'守护中',dead:'妖灵已阵亡','owner-dead':'你已阵亡，妖灵继续作战',
    paused:'守护暂停',ended:'本局已结束',cancelled:'对局未结算',fallback:'妖灵未入场，按普通对局结算'
  };
  function statusTitle(s){
    const label=s.state==='active'&&!s.supportActive&&!buffStatus()?.ready?'支援已用完':statusLabel[s.state];
    return s.name+' · '+label;
  }
  function remaining(s){
    return s&&s.state==='active'?s.guardLeft+s.aidLeft+Number(s.rescueReady):0;
  }
  function statusPanel(dialog,storage,player,event){
    const s=summary(),doc=dialog.content&&dialog.content.ownerDocument;
    if(!s||!doc)return describe();
    const panel=doc.createElement('section');panel.className='csh-aux-status-panel';
    function add(parent,tag,cls,text){
      const el=doc.createElement(tag);if(cls)el.className=cls;el.textContent=text;parent.appendChild(el);return el;
    }
    add(panel,'strong','csh-aux-status-title',statusTitle(s));
    if(s.state==='active'){
      const charges=add(panel,'div','csh-aux-status-counts','');
      for(const [name,left] of [['护主',s.guardLeft],['援助',s.aidLeft],['同契',Number(s.rescueReady)]]){
        add(charges,'span',left?'':'depleted',name+' '+left);
      }
      const special=buffText();if(special)add(panel,'div','',special);
    }
    if(s.reason)add(panel,'div','',s.reason);
    if(s.resultPending)add(panel,'div','','本局奖励待保存，可在行囊重试。');
    const rules=add(panel,'details','','');
    add(rules,'summary','','助战规则');
    add(rules,'p','','护主抵消1点伤害，援助摸1张牌，同契在濒死时回复1点体力。妖灵阵亡后停止支援，复活保留剩余次数。助战战绩单独记录，奖励按身份场标准结算。');
    dialog.classList.add('csh-aux-status-dialog');
    dialog.clickintro=true;
    /* 无名杀缩放施加在 body，弹层的入场动画不能作为尺寸依据。 */
    const body=doc.body;
    const zoom=(body.offsetWidth&&body.getBoundingClientRect().width/body.offsetWidth)||Number(game.documentZoom)||1;
    panel.style.setProperty('--csh-aux-scale',String(1/zoom));
    dialog.style.width=Math.min(300,doc.defaultView.innerWidth*.43)/zoom+'px';
    dialog.content.appendChild(panel);
    const point=event&&(event.touches&&event.touches[0]||event);
    const anchor=point&&Number.isFinite(point.clientX)?{clientX:point.clientX,clientY:point.clientY}:null;
    function place(){
      if(anchor&&dialog.isConnected&&typeof lib.placePoppedDialog==='function')lib.placePoppedDialog(dialog,anchor);
    }
    rules.addEventListener('toggle',place);
  }
  function refresh(){
    if(!run)return;
    const p=run.owner;
    if(!p||!p.markSkill)return;
    try{
      const existing=p.marks&&p.marks.csh_aux_status;
      if(existing&&p.updateMark)p.updateMark('csh_aux_status');
      else p.markSkill('csh_aux_status');
      const mark=p.marks&&p.marks.csh_aux_status,s=summary();
      if(!mark||!s||typeof mark.setAttribute!=='function')return;
      const text=statusTitle(s)+(remaining(s)?' · 剩余 '+remaining(s)+' 次基础支援':'');
      mark.title=text;mark.setAttribute('aria-label',text);mark.dataset.cshAuxStatus=s.state;
      if(!mark.classList.contains('csh-aux-status-mark')){
        mark.classList.add('csh-aux-status-mark');mark.tabIndex=0;mark.setAttribute('role','button');
        mark.addEventListener('keydown',function(e){
          if(e.repeat||(e.key!=='Enter'&&e.key!==' '))return;
          if(!ui.click||typeof ui.click.intro!=='function')return;
          e.preventDefault();e.stopPropagation();
          const rect=mark.getBoundingClientRect();
          ui.click.intro.call(mark,{clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2});
        });
      }
    }catch(e){}
  }
  lib.skill.csh_aux_status={charlotte:true,marktext:'灵',intro:{
    name:false,content:describe,mark:statusPanel,markcount:()=>remaining(summary())
  }};lib.translate.csh_aux_status='妖灵守护';lib.translate.csh_aux_status_bg='灵';
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
    async content(event,trigger,player){player.storage.cshAuxEntered=true;game.addVideo('storage',run.owner,['cshAssistedMatch',{v:1,type:'identity_with_spirit',spirit:player.name,owner:run.owner.playerid}]);if(player.$skill)player.$skill('妖灵守护','legend','water');game.log(player,'妖灵守护：本局战绩单独记录，完局按身份场标准发放奖励');}};
  Object.assign(lib.translate,{csh_aux_guard:'护主',csh_aux_guard_info:'本局限三次，真人受到伤害时令此伤害-1。',csh_aux_aid:'助战',csh_aux_aid_info:'前三个准备阶段，令真人摸一张牌。',csh_aux_rescue:'同契',csh_aux_rescue_info:'本局限一次，真人濒死时回复1点体力。',csh_aux_entry:'妖灵守护',csh_aux_entry_info:'本局为辅助身份场，战绩独立记录，完局按身份场标准发放奖励。'});
  /* S4：六类特色增益。用 addGlobalSkill 注册，**不进 character.skills** ——
     probe_aux_spirit.mjs 断言助战妖灵恰好 4 个技能，加进去会立刻红，也会让 50 只妖灵各多 6 技。
     模块缺失时整段跳过，既有助战流程一行不变。 */
  try{
    var SBM=(typeof window!=='undefined'&&window.CSHSpiritBuffSkills)||null;
    if(SBM){
      var buffSkills=SBM.create({
        runtime:buffRuntime,
        session:function(){return run;},
        active:active,
        me:function(){return game.me;},
        draw:function(n){return game.me.draw(n);},
        recover:function(n){return game.me.recover(n);},
        refresh:refresh,
        log:function(text){game.log(run&&run.spirit||game.me,text);}
      });
      for(const bk of ['t1','t2','t5','t6','t3','t4']){
        lib.skill['csh_spirit_buff_'+bk]=buffSkills[bk];
        game.addGlobalSkill('csh_spirit_buff_'+bk);
      }
    }
  }catch(eBuffSkills){}
  function restore(){
    if(!run)return;
    for(const [key,item]of Object.entries(run.hooks||{}))if(game[key]===item.wrapper)game[key]=item.previous;
    if(timer!==null){clearTimeout(timer);timer=null;}if(run.owner&&run.owner.unmarkSkill)try{run.owner.unmarkSkill('csh_aux_status');}catch(e){}if(run.owner&&run.owner.storage)delete run.owner.storage.cshAssistedMatch;
    /* 助战结束 / 换局 / 召唤回滚：本局计数不残留，迟到回包找不到会话。 */
    try{const RT=buffRuntime();if(RT)RT.end(run.id);}catch(e){}
    run=null;delete status.cshAssistedMatch;
  }
  function hook(key,fn){const previous=game[key];if(typeof previous!=='function')throw Error('缺少 '+key);const wrapper=function(...args){return fn.call(this,previous,args);};run.hooks[key]={previous,wrapper};game[key]=wrapper;}
  function retry(){timer=null;if(!run||run.cancelled||run.result===undefined||run.saved||lib.cshWallet.saveEpoch()!==run.epoch)return;
    const Q=lib.cshWallet.pending,payload=run.fallback?{mode:'identity',win:run.result,amount:run.rewardAmount}:{win:run.result,amount:run.rewardAmount,observedAt:run.observedAt};
    const result=Q?Q.put(run.fallback?'match':'assisted',run.rewardId,payload):run.fallback?lib.cshWallet.wallet.settleMatch(run.rewardId,'identity',run.result,run.rewardAmount):lib.cshWallet.wallet.settleAssisted(run.rewardId,run.result,run.rewardAmount,run.observedAt);
    if(result.ok){run.saved=true;if(!result.already)toast((run.fallback?'本局':'妖灵助战')+(run.result?'胜利':'完局')+'，获得 '+(Number.isSafeInteger(result.gained)?result.gained:0)+' CBY');}else {if(!run.saveNotice){toast(result.durable?'本局结果与奖励已保留，恢复存储后会自动补记':'本局结果暂未写入本机，请保持页面打开并恢复存储');run.saveNotice=true;}timer=setTimeout(retry,2000);}refresh();}
  function arm(){
    if(run&&run.owner===game.me&&run.epoch===lib.cshWallet.saveEpoch())return run;
    restore();
    /* 换档隔离：不属于当前存档代次的增益会话一律清掉。 */
    try{const RT=buffRuntime();if(RT)RT.switchEpoch(lib.cshWallet.saveEpoch());}catch(e){}
    const reason=spiritEligibility({lib,game,get,status});if(reason){if(lib.config.extension_池子魔将_csh_aux_spirit)toast('妖灵未预约：'+reason);return null;}
    run={id:'spirit-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),epoch:lib.cshWallet.saveEpoch(),owner:game.me,ownerIdentity:game.me.identity,engaged:false,spirit:null,hooks:{},result:undefined,saved:false,summoning:false};status.cshAssistedMatch=true;
    const normal=lib.cshMatchReward&&typeof lib.cshMatchReward.session==='function'?lib.cshMatchReward.session():null;run.rewardId=normal&&normal.id||run.id;
    for(const key of ['swapPlayer','swapControl'])hook(key,function(previous,args){
      if(args.some(p=>p&&p._cshAuxSpirit))return;
      const result=previous.apply(this,args);refresh();return result;
    });
    hook('addRecord',function(previous,args){if(status.cshAssistedMatch)return;return previous.apply(this,args);});
    hook('over',function(previous,args){
      if(run&&typeof args[0]==='boolean'&&run.result===undefined&&!status.over&&!status.video&&!status.connectMode&&!lib.config.connectMode&&!game.online&&!game.observe&&game.me===run.owner&&run.owner.identity===run.ownerIdentity&&lib.cshWallet.saveEpoch()===run.epoch){
        run.result=args[0];
        if(!run.engaged){run.cancelled=true;run.saved=true;toast('本局未形成有效对局，未结算奖励');}
        else {const rates=lib.cshWallet.wallet.matchRewardConfig().identity;run.rewardAmount=rates[run.result?'win':'lose'];run.observedAt=Date.now();if(!run.spirit){run.fallback=true;delete status.cshAssistedMatch;delete run.owner.storage.cshAssistedMatch;}retry();}
      }return previous.apply(this,args);
    });
    refresh();return run;
  }
  async function start(cause){
    const current=run||arm();if(!current||current.fallback)return null;if(current.spirit||current.summoning)return current;
    if(!['zhu','zhong','fan'].includes(current.owner.identity)||game.players.concat(game.dead||[]).length>8){restore();toast('妖灵未召唤：当前身份或席位已经变化');return null;}
    if(current.owner!==game.me||current.epoch!==lib.cshWallet.saveEpoch()||status.over||status.video||status.connectMode||lib.config.connectMode||game.online||lib.cshWallet.saveGuard.blocked())return null;
    if(cause&&cause.triggername==='phaseZhunbeiBegin'&&cause.player===current.owner)current.engaged=true;current.summoning=true;current.summonedAt={trigger:cause&&cause.triggername||"manual",owner:!!(cause&&cause.player===current.owner)};
    const playersRef=game.players,before=game.players.slice(),dead=(game.dead||[]).slice(),all=before.concat(dead),positions=all.map(p=>p.dataset.position),seats=all.map(p=>p.getSeatNum?p.getSeatNum():null),human=current.owner;
    const name=aliases[Math.floor(Math.random()*aliases.length)];let spawned=null;
    function sameSession(){return run===current&&game.me===human&&game.players===playersRef&&current.epoch===lib.cshWallet.saveEpoch()&&!status.over&&!status.video&&!status.connectMode&&!lib.config.connectMode&&!lib.cshWallet.saveGuard.blocked();}
    try{
      const spirit=spawned=await game.addPlayerOL(human,name,null,true,{source:human,animate:false});
      if(!sameSession()||!spirit||game.players.length!==before.length+1||!game.players.includes(spirit))throw Error('召唤会话已失效或扩席未完成');
      spirit._cshAuxSpirit=true;spirit._cshAuxSource='csh_boss_minion_'+name.slice('csh_aux_'.length);spirit._cshAuxOwner=human;spirit.identity=human.identity==='fan'?'fan':'zhong';spirit.identityShown=true;spirit.isZhu=false;spirit.ai.shown=1;spirit.setIdentity();
      spirit.storage.cshAuxiliarySpirit=true;human.storage.cshAssistedMatch=true;current.spirit=spirit;
      /* S2：用真实助战妖灵 id 与当前好感档位建立本局运行态；B 以下不解锁，
         数据层缺失 / 好感接口异常时静默不启用，绝不默认放行。 */
      try{
        const RT=buffRuntime();
        if(RT){
          let level='D';
          try{const AF=lib.cshAffection||(typeof window!=='undefined'&&window.CSH&&window.CSH.affection)||null;const info=AF&&typeof AF.get==='function'?AF.get(spirit._cshAuxSource):null;if(info&&typeof info.level==='string')level=info.level;}catch(eLv){}
          RT.begin({sessionId:current.id,spiritId:spirit._cshAuxSource,level:level,epoch:current.epoch});
        }
      }catch(eRt){}
      game.addVideo('cshAuxSpawn',null,{position:Number(spirit.dataset.position),name:spirit.name,identity:spirit.identity,owner:Number(human.dataset.position)});
      await spirit.draw(4);
      if(!sameSession())throw Error('入场等待期间会话已变化');
      if(active(spirit)&&!spirit.storage.cshAuxEntered)await lib.skill.csh_aux_entry.content(null,null,spirit);
      refresh();toast(summary().name+' 已入席 · 点「灵」查看支援');return current;
    }catch(error){
      // Remove only this attempt's hidden participant. A late completion must never roll back a newer table.
      const owned=playersRef.filter(p=>!before.includes(p)&&(p===spawned||p.name===name));if(spawned&&!owned.includes(spawned))owned.push(spawned);
      const sameActors=run===current&&game.me===human&&game.players===playersRef;
      for(const p of owned){for(const list of [playersRef,game.players]){const at=list.indexOf(p);if(at>=0)list.splice(at,1);}if(game.playerMap&&game.playerMap[p.playerid]===p)delete game.playerMap[p.playerid];if(p.remove)p.remove();}
      if(sameActors&&game.players.length===before.length&&before.every(p=>game.players.includes(p))){all.forEach((p,i)=>{p.dataset.position=positions[i];if(seats[i]!=null&&p.setSeatNum)p.setSeatNum(seats[i]);});ui.arena.setNumber(all.length);game.arrangePlayers();}
      delete human.storage.cshAssistedMatch;if(run===current){if(sameActors&&current.epoch===lib.cshWallet.saveEpoch()&&!status.over){current.spirit=null;current.summoning=false;current.fallback=true;delete status.cshAssistedMatch;}else restore();}refresh();toast('妖灵未召唤：本局继续普通对局结算');console.warn('[池子魔将] 妖灵扩席失败',error);return null;
    }
  }
  if(game.videoContent)game.videoContent.cshAuxSpawn=function(data){
    const players=game.players.concat(game.dead||[]);
    if(!data||!aliases.includes(data.name)||!Number.isInteger(data.position)||data.position<0||data.position>players.length||players.length>8||players.some(p=>p.storage&&p.storage.cshAuxiliarySpirit))return;
    const p=game.addPlayer(data.position,data.name);p._cshAuxSpirit=true;p.isZhu=false;p.identity=data.identity==='fan'?'fan':'zhong';p.identityShown=true;p.setIdentity();p.storage.cshAuxiliarySpirit=true;
    game.playerMap={};for(const q of game.players.concat(game.dead||[]))game.playerMap[q.dataset.position]=q;
    const human=game.playerMap[data.owner];if(human)human.storage.cshAssistedMatch=true;
  };
  lib.skill.csh_aux_start={charlotte:true,trigger:{global:['gameStart','phaseZhunbeiBegin','phaseBefore','useCardAfter','respondAfter','damageEnd']},forced:true,silent:true,popup:false,priority:10000,firstDo:true,
    filter(e,p,name){return p===game.me&&(name==='gameStart'||!!run&&(name==='phaseZhunbeiBegin'?!run.fallback&&!run.spirit&&!run.summoning&&e.player===run.owner:!!e.player&&game.players.concat(game.dead||[]).includes(e.player)));},
    async content(event,trigger){if(event.triggername==='gameStart'){if(run&&run.spirit&&game.players.concat(game.dead||[]).includes(run.spirit))return;restore();arm();}else if(event.triggername==='phaseZhunbeiBegin')await start({triggername:event.triggername,player:trigger.player});else if(run&&run.epoch===lib.cshWallet.saveEpoch()&&game.me===run.owner)run.engaged=true;}};
  lib.skill.csh_aux_status_sync={
    charlotte:true,forced:true,silent:true,popup:false,
    trigger:{global:['dieAfter','reviveAfter','phaseBefore']},
    filter(e,p,name){
      return !!(run&&p===run.owner&&(name==='phaseBefore'||e.player===run.owner||e.player===run.spirit));
    },
    async content(){refresh();}
  };
  game.addGlobalSkill('csh_aux_start');
  game.addGlobalSkill('csh_aux_status_sync');
  const api={start,arm,eligibility:()=>spiritEligibility({lib,game,get,status}),current:()=>run,summary,describe,refresh,stats:()=>lib.cshWallet.wallet.assistedStats()};lib.cshAuxSpirit=api;return api;
}
