/* Challenge-only parameters. Hard preserves the existing encounter; no card/skill AI hooks. */
export const CHALLENGE_PROFILES = Object.freeze({
  normal: Object.freeze({name:'爽快',hpRatio:0.75,hpCap:38,moxiCap:2,batiCap:1,monuCap:1,bossCards:6,challengerCards:6,armor:1}),
  hard: Object.freeze({name:'原味困难',hpRatio:1,hpCap:Infinity,moxiCap:Infinity,batiCap:Infinity,monuCap:Infinity,bossCards:8,challengerCards:4,armor:0})
});
export function challengeProfile(value) { return CHALLENGE_PROFILES[value === 'hard' ? 'hard' : 'normal']; }
export function tuneBossConfig(config, value) {
  const p=challengeProfile(value),c={...config};
  c._csh_x=Math.max(1,Math.min(p.hpCap,Math.ceil(config._csh_x*p.hpRatio)));
  c._csh_moxi=Math.min(config._csh_moxi,p.moxiCap);
  c._csh_bati_lim=Math.min(config._csh_bati_lim,p.batiCap);
  c._csh_monu_lim=Math.min(config._csh_monu_lim,p.monuCap);
  return c;
}
export function installChallengeConfig(config,value,{game,get}) {
  const p=challengeProfile(value),c=tuneBossConfig(config,value);
  const original={...config};
  c.gameDraw=player=>player===game.boss?p.bossCards:p.challengerCards;
  c.init=function(){
    /* Playing as the boss keeps the original encounter and reward policy. */
    if(game.me===game.boss){Object.assign(game.bossinfo,original);game.bossinfo.gameDraw=player=>player===game.boss?8:4;return;}
    const b=game.boss;if(!b||!/^csh_boss_/.test(b.name||''))return;
    if(b._cshChallengeApplied)return;b._cshChallengeApplied=true;
    if(value!=='hard'){
      const hp=Math.max(1,Math.min(c._csh_x,Math.ceil(b.maxHp*p.hpRatio)));
      b.maxHp=hp;b.hp=Math.min(b.hp,hp);b.update();
      for(const player of game.players)if(player.side===false&&p.armor&&typeof player.changeHujia==='function')player.changeHujia(p.armor);
    }
    game.bossinfo._csh_profile=value==='hard'?'hard':'normal';
    game.addVideo('storage',b,['cshChallengeProfile',game.bossinfo._csh_profile]);
    if(typeof game.log==='function')game.log('挑战难度：'+p.name+'；收益沿用原有上限');
  };
  return c;
}
