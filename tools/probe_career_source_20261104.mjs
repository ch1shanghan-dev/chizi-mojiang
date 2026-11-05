// 回归探针：改前 winrate 采集 / 整桌聚合反例 + 当前运行时生涯定义的被动覆盖分类。
// 输入全部来自本副本，不再指向旧安装（D:/noname，493 条）或 work 目录产物：
//   - tools/fixtures/career-source-baseline/winrate-aggregation-before.js：冻结的改前整桌聚合片段
//   - tools/fixtures/career-source-baseline/pool-page-results.json：冻结的 63/0 浏览器专项产物
//   - core/csh_winrate.js：本副本当前采集源码（实跑复现与改前基线相同的双将反例）
//   - core/csh_achv.js：本副本当前运行时定义（2000 条，替换旧写死 493）
// 用法：node tools/probe_career_source_20261104.mjs --out <目录> [--baseline-dir <目录>]
// 写 <目录>/results.json；stdout 纯 JSON {passed,failed,...}，供 check.js 的 runProbeJson 读取。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const here=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const at=process.argv.indexOf('--out');if(at<0)throw Error('--out <dir> required');
const out=path.resolve(process.argv[at+1]);fs.mkdirSync(out,{recursive:true});
const bi=process.argv.indexOf('--baseline-dir');
const baseline=bi>=0?path.resolve(process.argv[bi+1]):path.join(here,'tools/fixtures/career-source-baseline');
const checks=[],observations=[];
const assert=(name,passed)=>checks.push({name,passed:!!passed});

// ---- 冻结改前聚合片段（本副本内静态基线）：整桌对局被重复计入个人战绩的旧缺陷 ----
const snippet=fs.readFileSync(path.join(baseline,'winrate-aggregation-before.js'),'utf8');
assert('frozen pre-fix aggregation snippet retains the real winrate anchor and whole-table accumulation',
  snippet.startsWith('\t\t\tvar d = lib.config["extension_池子魔将_winrateData"];')&&
  snippet.includes('s.wrGames += e2.games')&&snippet.includes('s.wrKill += e2.kill'));
const KEY='extension_池子魔将_winrateData';
function aggregate(d){const x={lib:{config:{[KEY]:d}},s:{wrGames:0,wrWin:0,wrLose:0,wrKill:0,wrChars:0,wrModes:0}};vm.runInNewContext(snippet,x);return x.s;}
const entry=(win,kill=0)=>({games:1,win:win?1:0,lose:win?0:1,damage:0,damaged:0,gain:0,discard:0,kill});
const one={identity:{hero:entry(true,1),enemy:entry(false,3)},me:{chars:{hero:entry(true)},camps:{zhu:entry(true)}}};
const a=aggregate(one);observations.push({scenario:'one actual player win with one enemy',actual:a,correctPlayer:{games:1,win:1,lose:0,kill:1,chars:1,modes:1}});
assert('baseline aggregation reproduces whole-table game duplication',a.wrGames===2&&a.wrLose===1);
assert('baseline aggregation reproduces enemy kills and unplayed character contamination',a.wrKill===4&&a.wrChars===2);
const double={identity:{hero:entry(true,1),partner:entry(true,1),enemy:entry(false)},me:{chars:{hero:entry(true),partner:entry(true)},camps:{zhu:entry(true)}}};
observations.push({scenario:'one dual-general player win with one enemy',actual:aggregate(double),meCharSum:2,correctPlayerGames:1});
assert('summing me.chars alone would still double one dual-general match',Object.values(double.me.chars).reduce((n,e)=>n+e.games,0)===2);
// 采集链路改用本副本当前 core/csh_winrate.js（与改前基线语义一致，实跑复现同一反例）。
const code=fs.readFileSync(path.join(here,'core/csh_winrate.js'),'utf8').replace(/^import[^\n]*\n/gm,'').replace(/^export default null;.*$/gm,'');
let saves=0;const me={name:'hero',name1:'hero',name2:'partner',playerid:'me',identity:'zhu',side:true,stat:[{kill:1}]},enemy={name:'enemy',playerid:'enemy',identity:'fan',side:false,stat:[{kill:3}]};
const lib={config:{},translate:{}},game={players:[me,enemy],dead:[],me,over(){},checkOnlineResult:p=>p===me,saveConfig(k,v){saves++;lib.config[k]=JSON.parse(JSON.stringify(v));}};
const context={lib,game,ui:{},get:{mode:()=> 'identity'},ai:{},_status:{},localStorage:{getItem:()=>null},window:{},console};
vm.runInNewContext(code,context);game.over(true);const captured=lib.config[KEY];
observations.push({scenario:'baseline capture one dual-general game',saveCalls:saves,record:captured,aggregated:aggregate(captured)});
assert('baseline capture stores both own generals as separate personal character games',captured.me.chars.hero.games===1&&captured.me.chars.partner.games===1);
assert('baseline capture personal character records cannot prove kill history',!Object.hasOwn(captured.me.chars.hero,'kill'));
assert('baseline capture persists multiple per-character/camp snapshots rather than one accepted transaction',saves>1);
assert('baseline capture and actual aggregation reproduce 3 games for one dual-general player game',aggregate(captured).wrGames===3);

// ---- 当前运行时生涯定义：本副本 core/csh_achv.js（2000 条），替换旧安装 493 条 ----
const A={};vm.runInNewContext(fs.readFileSync(path.join(here,'core/csh_achv.js'),'utf8'),{window:A,console});
const E=A.CSH_ACHV,defs=E.defs;
const TASK_KEYS=['task_1','task_2','task_3','task_4','task_5','task_6','task_7','task_8','task_9','task_10','task_12','task_15','egg_task_full','egg_full_house'];
function supported(d){return ['挑战','官阶','功勋','豪赌桌','互动','资产','签到'].includes(d.cat)||TASK_KEYS.includes(d.key)||['egg_seg_rise','egg_rank_master','egg_gamble_first','egg_signed_first','egg_hungry','egg_rich_first'].includes(d.key);}
const covered=defs.filter(supported),remaining=defs.filter(d=>!supported(d));
// 动态定义数：走引擎公开统计 API（非直接读 defs.length，当前 2000），替换旧写死 493。
const dynamicCount=E.stats().total;
// 当前运行时分类真值（冻结当前谓词；定义数/分类变化时主动报数、需同步复核，同 B6 计数断言风格）。
const EXPECTED={covered:475,remaining:1525,winloss:110};
assert('actual runtime definitions and passive coverage match dynamic count / 475 / 1525',
  defs.length===dynamicCount&&covered.length===EXPECTED.covered&&remaining.length===EXPECTED.remaining&&covered.length+remaining.length===defs.length);
const groups={};for(const d of remaining)(groups[d.cat]??=[]).push(d.key);
assert('all 110 win/loss definitions are genuinely outside passive coverage',
  groups['胜负'].length===EXPECTED.winloss&&defs.filter(d=>d.cat==='胜负').every(d=>!supported(d)));
// 新增断言：动态数确实等于运行时 defs.length（stats / selfTest / evalAll / defs 四条独立路径互证）。
assert('dynamic definition count equals runtime defs.length (stats/selfTest/evalAll/defs)',
  dynamicCount===defs.length&&E.selfTest().ok&&E.selfTest().count===defs.length&&E.evalAll({}).length===defs.length&&defs.length>=E.MIN_DEFS);
const previous=JSON.parse(fs.readFileSync(path.join(baseline,'pool-page-results.json'),'utf8'));
assert('frozen pool-page final artifact records 63 actual-browser checks without failures',
  previous.passed===63&&previous.failed===0&&previous.checks.length===63);

const failures=checks.filter(c=>!c.passed);
const result={
  scope:'In-repo static pre-fix winrate aggregation/capture counterexample + current runtime (2000) career-definition passive-source classification. Frozen baselines live inside this copy; no external install/work directory dependency. Exposes an old capture bug, not a business fix.',
  passed:checks.length-failures.length,failed:failures.length,checks,observations,
  coverage:{total:defs.length,dynamicCount,minDefs:E.MIN_DEFS,passive:covered.length,remaining:remaining.length,expected:EXPECTED,groups,runtimeRoot:here,baseline,winrateSource:path.join(here,'core/csh_winrate.js')}
};
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,checks:failures,observations:undefined,coverage:{...result.coverage,groups:undefined}},null,2));
if(result.failed)process.exitCode=1;
