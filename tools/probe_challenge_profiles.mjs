// Deterministic parameter and init checks; these samples are NOT automatic battle win-rate data.
import {buildBossConfig,allBossIds} from '../core/csh_bossdata.js';import {challengeProfile,tuneBossConfig,installChallengeConfig} from '../core/csh_challenge.js';
let seed=1;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);const originalRandom=Math.random;const rows=[];const check=(name,v)=>rows.push({name,passed:!!v});
const samples=[];
try{Math.random=random;for(let n=1;n<=100;n++){seed=n;const base=buildBossConfig('csh_boss_minion_eve');let full=0,normal=0,cards=0;
 for(const id of allBossIds()){const c=base[id],copy=JSON.stringify(c),a=tuneBossConfig(c,'normal'),b=tuneBossConfig(c,'hard');
 check(n+'/'+id+' hard unchanged',JSON.stringify(b)===copy);check(n+'/'+id+' normal bounded and no source mutation',a._csh_x<=c._csh_x&&a._csh_x<=38&&a._csh_moxi<=2&&a._csh_monu_lim<=1&&a._csh_bati_lim<=1&&JSON.stringify(c)===copy&&JSON.stringify(a.minion)===JSON.stringify(c.minion));
 full+=c._csh_x;normal+=a._csh_x;cards+=a._csh_moxi;
 }samples.push({seed:n,bosses:allBossIds().length,hardHp:full,normalHp:normal,totalExtraDraw:cards});
 }
}finally{Math.random=originalRandom;}
for(const profile of ['normal','hard'])for(const asBoss of [false,true]){const boss={name:allBossIds()[0],maxHp:12,hp:12,update(){this.updates=(this.updates||0)+1;}},human={side:false,armor:0,changeHujia(n){this.armor+=n;}},game={boss,me:asBoss?boss:human,players:[boss,human],bossinfo:{},log(){},addVideo(){}};const base=buildBossConfig()[boss.name],cfg=installChallengeConfig(base,profile,{game});Object.assign(game.bossinfo,cfg);cfg.init();const hp=boss.maxHp,armor=human.armor;cfg.init();check(profile+'/'+asBoss+' init once and original boss-player encounter',asBoss?hp===12&&armor===0&&game.bossinfo._csh_x===base._csh_x:boss.maxHp===hp&&human.armor===armor&&armor===(profile==='normal'?1:0));check(profile+'/'+asBoss+' explicit start cards',game.bossinfo.gameDraw(boss)===(asBoss?8:challengeProfile(profile).bossCards)&&game.bossinfo.gameDraw(human)===(asBoss?4:challengeProfile(profile).challengerCards));}
console.log(JSON.stringify({scope:'100 seeded full-roster parameter samples and init behavior, no natural battle timing or win rates',samples:samples.length,bosses:samples[0].bosses,comparison:samples[0],passed:rows.filter(x=>x.passed).length,failed:rows.filter(x=>!x.passed).length,failures:rows.filter(x=>!x.passed)},null,2));if(rows.some(x=>!x.passed))process.exitCode=1;
