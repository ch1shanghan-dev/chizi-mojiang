// 反例专项：当前退隐 26 条与世界其余指标、跨来源组合的「可靠首次采集」边界。
// 全部断言针对真实模块：core/csh_career_observer.js 的真实路由谓词（AST 抽取函数体），
// 以及 probe_career_gamble_unlocks.mjs 的真实 VM 夹具（csh_world/achv/wallet/migrate/shell/observer）。
// 不复制产品逻辑、不写假断言；--out 必需的 results.json 与退出码沿用既有专项契约。
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {webcrypto} from 'node:crypto';
import * as roster from '../core/csh_bossdata.js';import {root,parse,walk} from './lib/skill_audit.mjs';
const at=process.argv.indexOf('--out');if(at<0)throw Error('--out required');const out=path.resolve(process.argv[at+1]);fs.mkdirSync(out,{recursive:true});
function fixture(file){let src=fs.readFileSync(root+'/tools/'+file,'utf8').split('const checks=')[0].replace(/^import .*?;\r?\n/gm,'');src=src.replace(/const out='[^']*';fs.mkdirSync\(out,\{recursive:true\}\);/,'const out="unused";');const ctx=vm.createContext({fs,path,vm,webcrypto,root,parse,walk,console,...roster,roster,TextEncoder,TextDecoder,btoa,atob,process});vm.runInContext(src+'\nthis.makeFixture=make;',ctx);return ctx.makeFixture;}

// 从真实观察器源码按函数名抽取路由谓词；这些谓词只依赖 def / TASK_KEYS，无外层闭包，避免被 catch 兜成假失败。
const observerSource=fs.readFileSync(root+'/core/csh_career_observer.js','utf8');
const names=['bossRule','taskRule','rankRule','gambleComboRule','gambleRule','playerRatioRule','playerComboRule','playerRule','worldHandsRule','walletComboRule'];
const chunks=[];walk(parse(observerSource),n=>{if(n.type==='FunctionDeclaration'&&names.includes(n.id?.name))chunks.push(observerSource.slice(...n.range));if(n.type==='VariableDeclarator'&&n.id?.name==='TASK_KEYS')chunks.push('var TASK_KEYS='+observerSource.slice(...n.init.range)+';')});
const ctx=vm.createContext({window:{},console});vm.runInContext(fs.readFileSync(root+'/core/csh_achv.js','utf8'),ctx);vm.runInContext(chunks.join('\n').replace(/\\n/g,'\n'),ctx);
const A=ctx.window.CSH_ACHV;
const routed=d=>ctx.bossRule(d)||ctx.taskRule(d)||ctx.walletComboRule(d)||['资产','签到'].indexOf(d.cat)>=0||['egg_signed_first','egg_hungry','egg_rich_first'].indexOf(d.key)>=0||ctx.rankRule(d)||ctx.gambleRule(d)||d.cat==='互动'||ctx.playerRule(d)||ctx.worldHandsRule(d);
const defs=A.defs,worldOwned=defs.filter(d=>ctx.worldHandsRule(d)),retired=defs.filter(d=>/^retired_\d+$/.test(d.key)||/^cx_retired_\d+$/.test(d.key));
const gambleCombos=defs.filter(d=>ctx.gambleComboRule(d)),crossCombos=defs.filter(d=>d.cat==='组合'&&!routed(d));
const worldOwnedSet=new Set(worldOwned.map(d=>d.key)),gambleDefsSet=new Set(defs.filter(d=>ctx.gambleRule(d)).map(d=>d.key));
const crossComboSet=new Set(crossCombos.map(d=>d.key)),retiredSet=new Set(retired.map(d=>d.key)),comboKeys=defs.filter(d=>d.cat==='组合').map(d=>d.key);

const make=fixture('probe_career_gamble_unlocks.mjs'),checks=[],check=(name,x)=>checks.push({name,passed:!!x}),tick=async()=>{for(let i=0;i<16;i++)await Promise.resolve()},entry=(h,k)=>h.W.careerUnlocks()?.entries[k],W=h=>h.W.careerUnlocks()?.entries||{},stamp=1700000999000;
const observations=[];

// ---- G1 边界：真实源码谓词 + 真实 2000 条定义，把交接文档的「仍待」变成可复跑断言 ----
check('real engine exposes exactly 2000 career definitions',defs.length===2000);
check('real worldHandsRule owns exactly 111 first-capture world definitions',worldOwned.length===111);
check('exactly 26 current-retirement definitions exist',retired.length===26);
check('all 26 current-retirement definitions are unrouted (no reliable first-capture source)',retired.every(d=>!routed(d)));
check('six same-source gamble combo families cover exactly 54 definitions',gambleCombos.length===54);
check('real route predicates partition 872 routed / 1128 unrouted',defs.filter(routed).length===872&&defs.filter(d=>!routed(d)).length===1128);
check('exactly 1072 cross-source combinations remain unrouted by real predicates',crossCombos.length===1072);
check('the other 140 combination definitions are same-source families only',comboKeys.length-crossCombos.length===140&&defs.filter(d=>d.cat==='组合'&&routed(d)).every(d=>ctx.gambleComboRule(d)||ctx.playerComboRule(d)||ctx.walletComboRule(d)||/^cx_combo_merit_meritday_\d+$/.test(d.key)));

// ---- G2 首次采集可靠：真实严格牌桌跨阈值，日期必须等于来源结算时间 ----
function seed(n=0,edit=()=>{}){const h=make(),raw=h.G.raw();raw.ai.forEach(a=>{a.retired=false;a.hands=100000;a.wins=100000;a.withPlayer={hands:0,wins:0,losses:0,draws:0,skillTop:0,revenge:false,lowestFund:null}});raw.ai[0].withPlayer={hands:n,wins:0,losses:0,draws:n,skillTop:0,revenge:false,lowestFund:null};edit(raw);delete raw.careerUnlocks;h.data.set('csh_world',JSON.stringify(raw));return make({data:h.data});}
const table=(h,n=1)=>({id:'fc-first-capture-'+String(n).padStart(5,'0'),t:stamp+n,ops:[{id:h.G.list()[0].id,kind:'play'}]});
{
 const h=seed(),t=table(h),before=new Set(Object.keys(W(h)));
 const r=h.G.commitTableResult(t);await tick();
 const disk=JSON.parse(h.data.get('csh_world'));
 check('strict table crossing is accepted by real world module',r.ok===true);
 check('first world-hand capture writes exact source time into wallet aggregate',entry(h,'hands_1')?.observedAt===t.t);
 check('first world-hand capture writes exact source time into durable world source',disk.careerUnlocks?.entries?.hands_1?.observedAt===t.t);
 const added=Object.keys(W(h)).filter(k=>!before.has(k));
 check('world source checkpoint adds no cross-source combination',added.filter(k=>crossComboSet.has(k)).length===0&&comboKeys.every(k=>!W(h)[k]||W(h)[k].observedAt===0));
 check('world source checkpoint adds no retired definition',added.filter(k=>retiredSet.has(k)).length===0);
 check('world source checkpoint adds no gamble definition',added.filter(k=>gambleDefsSet.has(k)&&k!=='egg_gamble_first').length===0);
 h.G.commitTableResult(t);await tick();
 check('duplicate table result keeps first date and notifies once',entry(h,'hands_1')?.observedAt===t.t&&h.G.stats().playerHands===1&&h.feedback.flatMap(x=>x.rows).filter(x=>x.id==='hands_1').length===1);
 const reboot=make({data:h.data});await tick();
 check('cold restart preserves exact first date silently',entry(reboot,'hands_1')?.observedAt===t.t&&reboot.feedback.length===0);
}

// ---- G3 跨来源组合不串档：真实观察器检查点的记录集合隔离（高统计反例，组合条件即使全满足也不越界） ----
{
 // 让亲历/豪赌/退隐/资金等条件同时处于高位，检查点仍只能写入自身来源族。
 const h=make(),raw=h.G.raw();
 raw.ai.forEach(a=>{a.retired=true;a.hands=100000;a.wins=100000;a.withPlayer={hands:5000,wins:2500,losses:2500,draws:0,skillTop:0,revenge:false,lowestFund:null}});
 raw.gambles={plays:10000,wins:7000,bust:0,push:3000,streak:500,bestStreak:500,net:100000000000,best:100000000};
 delete raw.careerUnlocks;h.data.set('csh_world',JSON.stringify(raw));
 const h2=make({data:h.data});
 const pw=h2.O.prepareWorldHands(h2.G.raw(),stamp),pwKeys=Object.keys(pw.record.entries);
 check('prepareWorldHands checkpoint record contains only world-owned definitions',pwKeys.length>0&&pwKeys.every(k=>worldOwnedSet.has(k)));
 check('prepareWorldHands checkpoint never writes a cross-source combo or retired def',pwKeys.filter(k=>crossComboSet.has(k)||retiredSet.has(k)).length===0);
}
{
 const h=make(),raw=h.G.raw();
 raw.ai.forEach(a=>{a.retired=true;a.hands=100000;a.wins=100000;a.withPlayer={hands:5000,wins:2500,losses:2500,draws:0,skillTop:0,revenge:false,lowestFund:null}});
 raw.gambles={plays:10000,wins:7000,bust:0,push:3000,streak:500,bestStreak:500,net:100000000000,best:100000000};
 delete raw.careerUnlocks;h.data.set('csh_world',JSON.stringify(raw));
 const h2=make({data:h.data}),before=h2.G.raw();
 const pg=h2.O.prepareGamble(h2.G.raw(),before,stamp),pgKeys=Object.keys(pg.record.entries);
 check('prepareGamble checkpoint record contains only gamble-owned definitions',pgKeys.length>0&&pgKeys.every(k=>gambleDefsSet.has(k)));
 check('prepareGamble checkpoint never writes a world-owned, cross-source combo or retired def',pgKeys.filter(k=>worldOwnedSet.has(k)||crossComboSet.has(k)||retiredSet.has(k)).length===0);
}
{
 const h=seed(),before=new Set(Object.keys(W(h)));h.G.noteGamble(100000);await tick();
 const added=Object.keys(W(h)).filter(k=>!before.has(k));
 check('gamble checkpoint adds no world-owned definition',added.filter(k=>worldOwnedSet.has(k)).length===0);
 check('gamble checkpoint adds no cross-source combination',added.filter(k=>crossComboSet.has(k)).length===0);
}

// ---- G4 旧日期留未知：真实遗留高统计存档与首次采用都保持 observedAt===0 ----
{
 const h=seed(2000000);await tick();
 const hands=defs.filter(d=>/^(hands|cx_hands)_\d+$/.test(d.key));
 check('legacy high personal-hand history qualifies all 33 milestones with unknown first dates',hands.length===33&&hands.every(d=>entry(h,d.key)?.observedAt===0)&&h.feedback.length===0);
}
{
 // 真正首次采用（钱包尚无 careerUnlocks 记录）时，150 人当前退隐是旧事实，26 条退隐只能留未知日期。
 const h=make({start:false}),raw=h.G.raw();raw.ai.forEach(a=>a.retired=true);delete raw.careerUnlocks;h.data.set('csh_world',JSON.stringify(raw));
 const wallet=JSON.parse(h.data.get('csh_wallet'));delete wallet.careerUnlocks;wallet._sig=h.bank._sig.sign(wallet);h.data.set('csh_wallet',JSON.stringify(wallet));
 const fresh=make({data:h.data,start:false});fresh.O.adopted();fresh.O.start();await tick();
 const vals=retired.map(d=>entry(fresh,d.key)?.observedAt);
 check('first adoption of 150-retired legacy world keeps all 26 retired dates unknown (0)',vals.length===26&&vals.every(v=>v===0)&&fresh.feedback.length===0);
}

// ---- 实测残余（记录，不冒充通过）：非首次钱包上，未接来源的当前事实定义仍由通用被动路径给挂钟时间 ----
{
 const h=make(),raw=h.G.raw();raw.ai.forEach(a=>a.retired=true);delete raw.careerUnlocks;h.data.set('csh_world',JSON.stringify(raw));
 const w=JSON.parse(h.data.get('csh_wallet'));w.careerUnlocks={v:1,baseline:true,entries:{gmplay_1:{observedAt:1}}};w._sig=h.bank._sig.sign(w);h.data.set('csh_wallet',JSON.stringify(w));
 const h2=make({data:h.data});await tick();
 observations.push({scenario:'non-initial wallet, 150-retired legacy world, general passive start()',retired_1_observedAt:entry(h2,'retired_1')?.observedAt??null,note:'wall-clock Date.now(), not a source-exact first-capture time and not unknown; this is the remaining backlog gap, deliberately not fixed here'});
}
const failures=checks.filter(x=>!x.passed),r={scope:'Real csh_career_observer route predicates (AST-extracted function bodies) + real csh_world/achv/wallet/migrate/shell VM fixture. Counterexample-style negative assertions on actual checkpoints; not natural long-term play, no product code changed.',passed:checks.length-failures.length,failed:failures.length,checks,observations,partition:{total:defs.length,routed:defs.filter(routed).length,unrouted:defs.filter(d=>!routed(d)).length,worldOwned:worldOwned.length,retired:retired.length,gambleCombos:gambleCombos.length,crossCombos:crossCombos.length}};
fs.writeFileSync(out+'/results.json',JSON.stringify(r,null,2));console.log(JSON.stringify({...r,checks:failures,observations:undefined},null,2));process.exitCode=failures.length?1:0;
