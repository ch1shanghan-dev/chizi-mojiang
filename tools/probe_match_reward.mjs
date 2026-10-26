// Actual observer/UI source with a wallet stub. No player's profile or wallet is read.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {openProbe} from './lib/browser_probe.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),source=fs.readFileSync(path.join(root,'core/csh_match_reward.js'),'utf8'),checks=[];
const check=(name,pass,detail)=>checks.push({name,pass:!!pass,...detail===undefined?{}:{detail}}),tick=()=>new Promise(r=>setImmediate(r));
function setup(mode='identity'){
 const timers=new Map();let serial=0;const calls=[],notes=[],listeners={},me={},p={},status={},config={},lib={skill:{},config:{mode},mode:{identity:{},versus:{},doudizhu:{},guozhan:{},boss:{},chess:{},custom:{}},translate:{identity:'身份',custom:'自定义'},cshUI:{toast:s=>notes.push(s)}};
 let fail=false,guard=false,restoring=false; const W={matchRewardConfig:()=>config,setMatchRewardConfig:async map=>{if(fail)return{ok:false,reason:'fixture failure'};Object.assign(config,map);return{ok:true};},settleMatch:async(...args)=>{calls.push(args);if(fail)return{ok:false,reason:'fixture failure'};return{ok:true,gained:args[3],already:false,balance:1000};}};
 lib.cshWallet={wallet:W,saveGuard:{blocked:()=>guard}};lib.cshMigrate={recoveryState:()=>({pending:restoring})};
 const original=[];const game={players:[me,p],dead:[],me,addGlobalSkill(){},over(...args){original.push({args,self:this});return'original-result';}};
 const ctx={setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id),console,Uint32Array,crypto:webcrypto,Date,Promise,localStorage:{getItem:()=>null},addEventListener:(n,fn)=>listeners[n]=fn};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);const host={lib,game,status,get:{mode:()=>lib.config.mode}};ctx.CSH_MATCH_REWARD.install(host);
 const tap=async(name,ev={player:p})=>{const s=lib.skill.csh_match_reward_tap;if(s.filter(ev,game.me,name))await s.content({triggername:name},ev);};
 return{timers,ctx,lib,game,status,config,calls,notes,original,host,listeners,tap,setFail:v=>fail=v,setGuard:v=>guard=v,setRestoring:v=>restoring=v};
}
for(const [mode,winAmount,loseAmount]of [['identity',300,100],['versus',250,80],['doudizhu',300,100],['guozhan',400,120],['boss',150,50],['chess',250,80],['custom',250,80]])for(const win of [true,false]){
 const a=setup(mode);await a.tap('gameStart');await a.tap('phaseBefore');a.game.over(win);await tick();check(mode+' '+win+' reward',a.calls.length===1&&a.calls[0][1]===mode&&a.calls[0][2]===win&&a.calls[0][3]===(win?winAmount:loseAmount));
}
{
 const a=setup();await a.tap('gameStart');await a.tap('useCardAfter');await a.tap('gameStart');const self={test:true},returned=a.game.over.call(self,true,'keep',42);a.game.over(false);await tick();check('duplicate gameStart/over pays once',a.calls.length===1);check('native this/args/return preserved',returned==='original-result'&&a.original[0].self===self&&JSON.stringify(a.original[0].args)==='[true,"keep",42]');check('random run id',/^match-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/.test(a.calls[0][0]));const over=a.game.over;a.ctx.CSH_MATCH_REWARD.install(a.host);check('installation is idempotent',a.game.over===over);
}
for(const [name,arr]of [['no gameStart',['phaseBefore']],['no real activity',['gameStart']],['foreign player activity',['gameStart','foreign']]]){
 const a=setup();for(const t of arr)await a.tap(t==='foreign'?'phaseBefore':t,t==='foreign'?{player:{}}:undefined);a.game.over(true);await tick();check(name+' rejected',!a.calls.length);
}
for(const result of [undefined,null,'win',[],{},1]){const a=setup();await a.tap('gameStart');await a.tap('phaseBefore');a.game.over(result);a.game.over(true);await tick();check('nonboolean '+String(result)+' finalizes without pay',!a.calls.length);}
for(const flag of ['video','reloading','connectMode','importingExtension','online','observe','configConnect','guard','recovery','modechange','over','pagehide','beforeunload','invalidate']){
 const a=setup();await a.tap('gameStart');await a.tap('respondAfter');if(flag==='guard')a.setGuard(true);else if(flag==='recovery')a.setRestoring(true);else if(flag==='modechange')a.lib.config.mode='versus';else if(flag==='configConnect')a.lib.config.connectMode=true;else if(flag==='online'||flag==='observe')a.game[flag]=true;else if(flag==='pagehide'||flag==='beforeunload')a.listeners[flag]();else if(flag==='invalidate')a.lib.cshMatchReward.invalidate();else a.status[flag]=true;a.game.over(false);await tick();check(flag+' blocks settlement',!a.calls.length);
}
{
 const a=setup();a.config.identity={win:0,lose:7};await a.tap('gameStart');await a.tap('phaseBefore');a.game.over(true);await tick();check('old zero config does not disable fixed outcome',a.calls[0]?.[3]===300);
 const b=setup();b.config.identity={win:17,lose:7};await b.tap('gameStart');await b.tap('damageEnd');b.game.over(false);await tick();check('old custom config ignored for fixed outcome',b.calls[0][3]===100);
}
{
 const a=setup();a.setFail(true);await a.tap('gameStart');await a.tap('phaseBefore');a.game.over(true);await tick();a.config.identity={win:999,lose:999};a.setFail(false);await a.lib.cshMatchReward.retryPending('fake-run','boss',true,1000);await a.lib.cshMatchReward.retryPending();check('retry uses frozen run/outcome/amount once',a.calls.length===2&&JSON.stringify(a.calls[0])===JSON.stringify(a.calls[1])&&a.calls[1][3]===300);check('failure is visible',a.notes.some(s=>s.includes('待补领')));
}
{
 const a=setup();a.setFail(true);await a.tap('gameStart');await a.tap('phaseBefore');a.game.over(true);await tick();a.lib.cshMatchReward.invalidate();a.setFail(false);await a.lib.cshMatchReward.retryPending();check('reload discards pending confirmed in older session',a.calls.length===1);
}
{
 const a=setup(),event={player:a.game.me};await a.tap('gameStart',event);await a.tap('phaseBefore');a.lib.cshMatchReward.invalidate();await a.tap('gameStart',event);await a.tap('phaseBefore');a.game.over(true);await tick();check('reload rejects same old gameStart event',!a.calls.length);await a.tap('gameStart');await a.tap('phaseBefore');a.game.over(true);await tick();check('fresh gameStart after recovery can earn',a.calls.length===1);
}
{
 const a=setup();let release;a.lib.cshWallet.wallet.settleMatch=()=>new Promise(r=>release=r);await a.tap('gameStart');await a.tap('phaseBefore');a.game.over(true);a.lib.cshMatchReward.invalidate();release({ok:true,gained:80});await tick();check('late ACK after invalidation is silent',!a.notes.length);
}
{
 const a=setup();const wrapper=a.game.over.toString(),client={game:{over(...args){return args.join('-');}},console};vm.createContext(client);const received=vm.runInContext('('+wrapper+')',client);check('serialized wrapper without extension falls back to client over',received(true,'client')==='true-client');
}
{
 const a=setup();a.setFail(true);await a.tap('gameStart');await a.tap('phaseBefore');a.game.over(true);await tick();check('failure schedules automatic retry',a.timers.size===1);let [id,fn]=[...a.timers.entries()][0];a.timers.delete(id);fn();await tick();check('automatic retry preserves frozen request without repeated failure toasts',a.calls.length===2&&a.notes.filter(s=>s.includes('待补领')).length===1);a.setFail(false);[id,fn]=[...a.timers.entries()][0];a.timers.delete(id);fn();await tick();check('storage recovery automatically clears pending reward',a.calls.length===3&&a.notes.some(s=>s.includes('获得 300')));a.lib.cshMatchReward.invalidate();check('invalidation clears retry timer',a.timers.size===0);
}
if(process.argv.includes('--browser')){
 for(const [name,width,height]of [['desktop',1200,820],['portrait',320,640],['landscape',720,350]]){
  const init='var calls=[],notes=[],lib={config:{mode:"identity"},skill:{},cshUI:{toast:s=>notes.push(s)},cshWallet:{wallet:{matchRewardConfig:()=>({identity:{win:999,lose:999}}),setMatchRewardConfig:()=>calls.push("edit")}}},game={addGlobalSkill(){},over(){}},status={},get={mode:()=>"identity"};';
  const p=await openProbe('<!doctype html><button id="open">旧入口</button><script>'+init+source+';CSH_MATCH_REWARD.install({lib,game,status,get});document.getElementById("open").onclick=()=>lib.cshMatchReward.openPanel();</script>');
  try{await p.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await p.evaluate('document.getElementById("open").click()');const r=await p.evaluate('({editor:!!document.querySelector("input,form,#csh-match-reward"),edits:calls.length,rates:lib.cshMatchReward.rates("identity"),notes})');check(name+' has no player-editable reward UI',!r.editor&&!r.edits);check(name+' old configured values cannot affect fixed rate',r.rates.win===300&&r.rates.lose===100);check(name+' legacy entry explains fixed automatic rewards',r.notes.some(s=>s.includes('统一设定')));}finally{await p.close();}
 }
}
const failed=checks.filter(c=>!c.pass);console.log(JSON.stringify({scope:'actual fixed observer, automatic retry and retired editor, isolated wallet stub; no real wallet persistence or live Noname match',passed:checks.length-failed.length,failed:failed.length,failures:failed},null,2));
const out=process.argv.indexOf('--out');if(out>=0)fs.writeFileSync(process.argv[out+1],JSON.stringify({checks},null,2));process.exitCode=failed.length?1:0;
