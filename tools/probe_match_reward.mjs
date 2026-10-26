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
 const calls=[],notes=[],listeners={},me={},p={},status={},config={},lib={skill:{},config:{mode},mode:{identity:{},versus:{},doudizhu:{},guozhan:{},boss:{},chess:{},custom:{}},translate:{identity:'身份',custom:'自定义'},cshUI:{toast:s=>notes.push(s)}};
 let fail=false,guard=false,restoring=false; const W={matchRewardConfig:()=>config,setMatchRewardConfig:async map=>{if(fail)return{ok:false,reason:'fixture failure'};Object.assign(config,map);return{ok:true};},settleMatch:async(...args)=>{calls.push(args);if(fail)return{ok:false,reason:'fixture failure'};return{ok:true,gained:args[3],already:false,balance:1000};}};
 lib.cshWallet={wallet:W,saveGuard:{blocked:()=>guard}};lib.cshMigrate={recoveryState:()=>({pending:restoring})};
 const original=[];const game={players:[me,p],dead:[],me,addGlobalSkill(){},over(...args){original.push({args,self:this});return'original-result';}};
 const ctx={console,Uint32Array,crypto:webcrypto,Date,Promise,localStorage:{getItem:()=>null},addEventListener:(n,fn)=>listeners[n]=fn};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);const host={lib,game,status,get:{mode:()=>lib.config.mode}};ctx.CSH_MATCH_REWARD.install(host);
 const tap=async(name,ev={player:p})=>{const s=lib.skill.csh_match_reward_tap;if(s.filter(ev,game.me,name))await s.content({triggername:name},ev);};
 return{ctx,lib,game,status,config,calls,notes,original,host,listeners,tap,setFail:v=>fail=v,setGuard:v=>guard=v,setRestoring:v=>restoring=v};
}
for(const [mode,winAmount,loseAmount]of [['identity',80,20],['versus',60,15],['doudizhu',80,20],['guozhan',100,25],['boss',50,15],['chess',60,15],['custom',60,15]])for(const win of [true,false]){
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
 const a=setup();a.config.identity={win:0,lose:7};await a.tap('gameStart');await a.tap('phaseBefore');a.game.over(true);await tick();check('zero disables outcome',!a.calls.length);
 const b=setup();b.config.identity={win:17,lose:7};await b.tap('gameStart');await b.tap('damageEnd');b.game.over(false);await tick();check('independent outcome configuration',b.calls[0][3]===7);
}
{
 const a=setup();a.setFail(true);await a.tap('gameStart');await a.tap('phaseBefore');a.game.over(true);await tick();a.config.identity={win:999,lose:999};a.setFail(false);await a.lib.cshMatchReward.retryPending('fake-run','boss',true,1000);await a.lib.cshMatchReward.retryPending();check('retry uses frozen run/outcome/amount once',a.calls.length===2&&JSON.stringify(a.calls[0])===JSON.stringify(a.calls[1])&&a.calls[1][3]===80);check('failure is visible',a.notes.some(s=>s.includes('待补领')));
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
if(process.argv.includes('--browser')){
 const init=`var notes=[],calls=[],config={custom:{win:123,lose:45}},auditFail=false,hold=false,release=null,guard=false;var lib={skill:{},config:{mode:'identity'},mode:{custom:{},identity:{},versus:{},doudizhu:{},guozhan:{},boss:{},chess:{}},translate:{identity:'身份',versus:'对决',doudizhu:'斗地主',guozhan:'国战',boss:'挑战',custom:'自定义扩展模式'}},game={me:{},players:[],addGlobalSkill(){},over(){}},_status={},get={mode:()=>lib.config.mode};game.players=[game.me];lib.cshWallet={saveGuard:{blocked:()=>guard},wallet:{matchRewardConfig:()=>config,setMatchRewardConfig:async map=>{calls.push(JSON.parse(JSON.stringify(map)));if(hold)await new Promise(r=>release=r);if(auditFail)return{ok:false,reason:'注入保存失败'};config=JSON.parse(JSON.stringify(map));return{ok:true}},settleMatch:async()=>({ok:true,gained:80})}};lib.cshUI={toast:t=>notes.push(t)};`;
 for(const [name,width,height,scale]of [['desktop',1200,820,1],['portrait',320,640,.4],['landscape',720,350,1.5]]){
  const p=await openProbe('<!doctype html><meta charset="utf-8"><style>html,body{width:100%;height:100%;margin:0}body{transform:scale('+scale+');transform-origin:0 0}div{position:absolute;display:inline-block}</style><button id="open">入口</button><script>'+init+'\n'+source+'\nCSH_MATCH_REWARD.install({lib,game,status:_status,get});document.getElementById("open").onclick=()=>lib.cshMatchReward.openPanel();</script>');
  try{
   await p.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await p.evaluate('document.getElementById("open").focus();document.getElementById("open").click()');
   let result=await p.evaluate(`(()=>{const o=document.getElementById('csh-match-reward'),f=o.querySelector('form'),r=f.getBoundingClientRect(),inputs=[...f.querySelectorAll('input')],buttons=[...f.querySelectorAll('button')];return{parent:o.parentNode===document.documentElement,fit:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,overflow:o.scrollWidth<=innerWidth,focus:document.activeElement===inputs[0],targets:inputs.concat(buttons.filter(b=>!b.hidden)).every(b=>b.getBoundingClientRect().height>=44),count:inputs.length,custom:inputs.find(n=>n.getAttribute('aria-label').includes('自定义扩展模式胜利')).value,role:f.getAttribute('role'),title:f.textContent.includes('胜利')&&f.textContent.includes('失败')};})()`);
   for(const k of ['parent','fit','overflow','focus','targets','title'])check(name+' UI '+k,result[k],result);check(name+' dynamic modes + saved values',result.count===14&&result.custom==='123');
   // native submit validation is bypassed for a deliberate invalid submission, reaching our defensive handler.
   await p.evaluate(`(()=>{let f=document.querySelector('#csh-match-reward form');f.querySelector('input').value='1.5';f.dispatchEvent(new Event('submit',{cancelable:true}));})()`);
   check(name+' rejects fraction before wallet',await p.evaluate(`calls.length===0&&document.querySelector('#csh-match-reward .message').textContent.includes('整数')`));
   await p.evaluate(`(()=>{let f=document.querySelector('#csh-match-reward form');f.querySelector('input').value='0';auditFail=true;f.dispatchEvent(new Event('submit',{cancelable:true}));})()`);
   check(name+' save failure remains visible',await p.evaluate(`document.querySelector('#csh-match-reward .message').textContent.includes('保存失败')&&!notes.some(n=>n.includes('设置已保存'))&&!document.querySelector('#csh-match-reward button[type=submit]').disabled`));
   await p.evaluate(`auditFail=false;hold=true;document.querySelector('#csh-match-reward form').dispatchEvent(new Event('submit',{cancelable:true}));document.querySelector('#csh-match-reward form').dispatchEvent(new Event('submit',{cancelable:true}));`);
   check(name+' duplicate pending submit blocked',await p.evaluate('calls.length===2'));
   await p.evaluate('hold=false;release()');check(name+' success allows zero',await p.evaluate(`config.identity.win===0&&document.querySelector('#csh-match-reward .message').textContent.includes('已保存')`));
   // Last visible button wraps focus through the actual keyboard handler.
   await p.evaluate(`document.querySelector('#csh-match-reward button[type=submit]').focus()`);await p.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await p.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});check(name+' Tab wraps focus',await p.evaluate(`document.activeElement===document.querySelector('#csh-match-reward input')`));
   await p.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});check(name+' Esc closes and restores focus',await p.evaluate(`!document.getElementById('csh-match-reward')&&document.activeElement.id==='open'`));
   await p.evaluate(`lib.cshMatchReward.openPanel();lib.cshMatchReward.openPanel()`);check(name+' reentry keeps one panel',await p.evaluate(`document.querySelectorAll('#csh-match-reward').length===1`));
   await p.evaluate(`[...document.querySelectorAll('#csh-match-reward button')].find(b=>b.textContent==='返回').click()`);check(name+' return closes',await p.evaluate(`!document.getElementById('csh-match-reward')`));
   await p.evaluate(`guard=true;lib.cshMatchReward.openPanel()`);check(name+' recovery blocks opening',await p.evaluate(`!document.getElementById('csh-match-reward')`));
  }finally{await p.close();}
 }
}
const failed=checks.filter(c=>!c.pass);console.log(JSON.stringify({scope:'actual observer and configuration UI, isolated wallet stub; no real wallet persistence or live Noname match',passed:checks.length-failed.length,failed:failed.length,failures:failed},null,2));
const out=process.argv.indexOf('--out');if(out>=0)fs.writeFileSync(process.argv[out+1],JSON.stringify({checks},null,2));process.exitCode=failed.length?1:0;
