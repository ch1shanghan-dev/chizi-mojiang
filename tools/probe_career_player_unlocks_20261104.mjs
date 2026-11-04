// Real BOSS transactions + real career/wallet/migration modules; disposable VM stores only.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {webcrypto} from 'node:crypto';import * as roster from '../core/csh_bossdata.js';import {root,parse,walk} from './lib/skill_audit.mjs';
const out='D:/CodexWork/chizi-mojiang/work/career-player-unlocks-20261104';fs.mkdirSync(out,{recursive:true});
const prefix=fs.readFileSync(root+'/tools/probe_boss_transactions.mjs','utf8').split('const rows=[];')[0].replace(/^import .*?;\r?\n/gm,'');const outer=vm.createContext({fs,path,vm,webcrypto,root,console,...roster,roster,TextEncoder,TextDecoder,btoa,atob});vm.runInContext(prefix+'\nthis.makeBoss=harness;',outer);
const clean=s=>s.replace(/^import [\s\S]*?;\r?\n/gm,'').replace(/\bexport /g,'');const read=p=>fs.readFileSync(root+'/core/csh_'+p+'.js','utf8');let build;walk(parse(read('shell')),n=>{if(n.type==='FunctionDeclaration'&&n.id.name==='buildStats')build=read('shell').slice(...n.range).replace('function buildStats','function realBossBuildStats')});
function make(options={}){const h=outer.makeBoss(options);vm.runInContext(clean(read('achv')),h.ctx);h.ctx.wallet=()=>h.lib.cshWallet;h.ctx.projectBossCareer=h.ctx.careerSnapshot;vm.runInContext(build,h.ctx);
 h.lib.cshWorld={list:()=>[],stats:()=>({}),gambleStats:()=>({}),reloadSave:()=>true};h.lib.cshInteract={stats:()=>({playerThrows:0})};h.lib.cshShell={stats:o=>h.ctx.realBossBuildStats(o)};h.feedback=[];h.lib.cshUI={achievement:(rows,options)=>h.feedback.push({rows,options})};
 vm.runInContext(clean(read('career_observer')),h.ctx);h.O=h.lib.cshCareerObserver;h.bank=h.lib.cshWallet;if(options.start!==false)h.O.start();return h;}

const checks=[],check=(name,passed,detail)=>checks.push({name,passed:!!passed,...passed?{}:{detail}}),tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve()},entry=(h,k)=>h.W.careerUnlocks()?.entries[k];
const input=(id='player-natural-fixture-0001',extra={})=>({id,mode:'identity',win:true,kills:1,chars:['hero'],observedAt:Date.now()-10000,...extra});
{
 const h=make(),before=h.W.pc(),offset=h.writes.length,p=input(),r=h.bank.commitPlayerMatch(p,h.bank.saveEpoch()),write=h.writes.slice(offset).find(x=>x.k==='csh_wallet'),saved=JSON.parse(write.v);
 check('actual games/wins/kills/chars/modes qualifications share first accepted personal wallet write',r.ok&&['games_1','wins_1','kills_1','chars_1','modes_1'].every(k=>saved.careerUnlocks.entries[k]?.observedAt===p.observedAt)&&saved.playerMatches.modes.identity.games===1);
 await tick();check('new personal achievements notify once after strict save without automatic rewards',h.W.pc()===before&&h.feedback.flatMap(x=>x.rows).filter(x=>x.id==='games_1').length===1&&!h.disk().careerClaims?.games_1);
 h.bank.commitPlayerMatch(p,h.bank.saveEpoch());h.bank.flushSave();await tick();check('duplicate personal receipt and normal wallet flush do not repeat unlock notification',h.feedback.flatMap(x=>x.rows).filter(x=>x.id==='games_1').length===1&&entry(h,'games_1').observedAt===p.observedAt);
 const restarted=make({data:h.data});await tick();check('whole module restart preserves exact personal first date without replay',entry(restarted,'games_1').observedAt===p.observedAt&&restarted.feedback.length===0);
 const reward=h.ctx.window.CSH_ACHV.byId('games_1').reward,a=h.W.claimCareer('games_1',reward,'manual personal career claim');h.W.claimCareer('games_1',reward,'repeat personal career claim');check('original manual reward and one-time receipt remain unchanged',a.ok&&h.W.pc()===before+reward);
 const exported=await h.M.inspect(await h.M.export());check('actual complete export preserves personal count and first qualification date',exported.ok&&exported.data.wallet.playerMatches.modes.identity.games===1&&exported.data.wallet.careerUnlocks.entries.games_1.observedAt===p.observedAt);
}
{
 const h=make(),raw=h.data.get('csh_wallet'),p=input();h.fault.key='csh_wallet';let refused=false;try{h.bank.commitPlayerMatch(p,h.bank.saveEpoch())}catch{refused=true}await tick();check('rejected first wallet write publishes neither count nor qualification/feedback',refused&&h.data.get('csh_wallet')===raw&&!entry(h,'games_1')&&h.bank.playerMatches()===null&&h.feedback.length===0);
 const q=h.bank.pending.put('player-match',p.id,p);check('rejected personal operation remains a durable queue item',q.durable&&q.pending&&h.bank.playerMatches()===null);h.fault.key=null;h.bank.pending.retry();await tick();check('queue recovery writes original first date exactly once',entry(h,'games_1')?.observedAt===p.observedAt&&h.bank.playerMatches().modes.identity.games===1&&h.feedback.flatMap(x=>x.rows).filter(x=>x.id==='games_1').length===1);
}
{
 const h=make();h.lib.config.extension_池子魔将_winrateData={identity:{enemy:{games:9999,win:9999,kill:9999}},me:{chars:{oldhero:{games:9},oldhero2:{games:9},oldhero3:{games:1}}}};h.O.adopted();h.O.start();await tick();
 check('old own characters qualify only historical unknown date and not table match/kill totals',entry(h,'chars_1')?.observedAt===0&&entry(h,'chars_3')?.observedAt===0&&!entry(h,'games_1')&&!entry(h,'kills_1')&&h.feedback.length===0);
 const p=input(undefined,{chars:['newhero']});h.bank.commitPlayerMatch(p,h.bank.saveEpoch());await tick();check('new personal result never overwrites unknown old character date',entry(h,'chars_1').observedAt===0&&entry(h,'chars_3').observedAt===0&&entry(h,'games_1').observedAt===p.observedAt);
}
{
 const h=make(),p=input(undefined,{win:false,chars:['hero','partner'],kills:0});h.bank.commitPlayerMatch(p,h.bank.saveEpoch());await tick();check('single losing dual-general match never invents a win or 3-character qualification',entry(h,'games_1')?.observedAt===p.observedAt&&entry(h,'loses_1')?.observedAt===p.observedAt&&!entry(h,'wins_1')&&!entry(h,'chars_3')&&!entry(h,'kills_1'));
 const p2=input('player-natural-fixture-0002',{mode:'guozhan',chars:['third'],observedAt:p.observedAt+100});h.bank.commitPlayerMatch(p2,h.bank.saveEpoch());await tick();check('second actual mode and third own character unlock at second accepted source time',entry(h,'modes_2')?.observedAt===p2.observedAt&&entry(h,'chars_3')?.observedAt===p2.observedAt&&entry(h,'games_1').observedAt===p.observedAt);
}
{
 const h=make({start:false}),p=input();delete h.lib.cshCareerObserver;h.bank.commitPlayerMatch(p,h.bank.saveEpoch());check('pre-observer source can hold reliable facts without fabricated qualification',!entry(h,'games_1'));
 vm.runInContext(clean(read('career_observer')),h.ctx);h.O=h.lib.cshCareerObserver;h.O.start();await tick();check('late observer derives historical exact first threshold date from accepted original receipt',entry(h,'games_1')?.observedAt===p.observedAt&&h.feedback.length===0);
}
{
 const h=make(),p=input(),old=h.bank.saveEpoch();h.bank.reloadSave({wallet:{pc:1000},rank:null,dailyTask:null},{memoryOnly:true});let refused=false;try{h.bank.commitPlayerMatch(p,old)}catch{refused=true}check('old imported-save generation cannot publish qualification into adopted wallet',refused&&!entry(h,'games_1')&&h.bank.playerMatches()===null);
}
function cumulative(n,win){const state={v:1,since:Date.now()-100000-n,modes:{},chars:[],receipts:[]},names=new Set();for(let i=0;i<n;i++){const mode=['identity','versus','doudizhu','guozhan'][i%4],chars=['hero'+(i%40)],d={id:'player-threshold-'+String(i).padStart(5,'0'),mode,win,kills:1,chars,observedAt:state.since+i},m=state.modes[mode]||(state.modes[mode]={games:0,win:0,lose:0,kill:0});m.games++;m[win?'win':'lose']++;m.kill++;names.add(chars[0]);state.receipts.push({id:d.id,payload:JSON.stringify(d),t:d.observedAt});}state.chars=Array.from(names).sort();return state;}
{
 const h=make(),seen=new Set(),defs=h.ctx.window.CSH_ACHV.defs.filter(d=>d.cat==='胜负');for(const [count,win]of [[10000,true],[6000,false]]){const next={...h.disk(),playerMatches:cumulative(count,win)},p=h.O.preparePlayerMatch(next,h.disk(),Date.now()-1);p.fresh.forEach(k=>seen.add(k));check('all original '+(win?'win':'loss')+' threshold rules evaluate from validated real-shape source',defs.filter(d=>d.prog((()=>{const s={wrGames:count,wrWin:win?count:0,wrLose:win?0:count,wrKill:count,wrChars:40,wrModes:4};return s})())[0]>=d.prog({})[1]).every(d=>p.record.entries[d.key]));}
 const oldDefs=defs.filter(d=>!/^cx_/.test(d.key));check('all 70 existing victory definitions are covered without changing IDs or rewards',oldDefs.length===70&&oldDefs.every(d=>seen.has(d.key)));
}
const failures=checks.filter(x=>!x.passed),result={scope:'Actual observer, strict wallet, migration and real definitions in disposable VM; threshold matrix uses validated synthetic cumulative receipts, not claimed natural long-term matches.',passed:checks.length-failures.length,failed:failures.length,checks};if(!process.argv.includes('--gate'))fs.writeFileSync(out+'/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,checks:failures}));process.exitCode=failures.length?1:0;
