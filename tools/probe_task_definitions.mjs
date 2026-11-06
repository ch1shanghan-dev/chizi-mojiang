// 回归探针：每日任务「跨日累计」语义 + 生涯成就定义键/奖励/文案留存。
// 隔离 VM 存储，无玩家档案或钱包真实改动。
//
// 两种模式，明确区分、不互相冒充（复用 B8 双模式策略）：
//   * 默认（无 --baseline）：self-consistency / 自洽。用本副本内静态基线
//     tools/fixtures/task-definitions-baseline/{keys.json,manifest.json} 做
//     「旧键不丢 / 定义结构完整 / 动态数量互证」检查，无需任何仓库外目录即可跑通。
//     strictComparison=false，绝不冒充「改前/改后严格比对」。
//   * --baseline <dir>：strict / 严格比对。dir 内必须含 before-csh_achv.js
//     （改前 csh_achv.js 引擎快照，如扩容前 493 条旧安装）。逐键比对旧键留存、
//     奖励保留、非任务文案不变；缺文件直接报错，绝不静默降级成自洽模式来骗绿。
//   * --fixture <dir>：可选，覆盖默认自洽静态基线目录（供负向验证 / 复核用）。
//   * --out <dir>：必需，写 <dir>/results.json；stdout 纯 JSON {passed,failed,...}，
//     供 check.js 的 runProbeJson 读取（JSON.parse(stdout) 只看 failed / passed）。
//
// 断言强度只增不减：原探针 47 条中 44 条行为断言原样保留（36 条累计语义 +
// 3 条日常 + 2 条彩蛋 + 已领取资格 + 永久资格 + 反伪造自检），另 3 条「整集比对」
// 断言在自洽模式替换为等价或更强的自洽断言、在严格模式保留为改前/改后比对；
// 新增「动态数 == 真实 defs.length / stats().total」互证与「定义结构完整」断言。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {metadata,fingerprint} from './fixtures/task-definitions-baseline/canonical.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=key=>{const i=process.argv.indexOf(key);return i<0?null:process.argv[i+1];};

// ---- 参数与模式 ----
const outDir=arg('--out');
if(!outDir)throw Error('--out <dir> required');
const out=path.resolve(outDir);fs.mkdirSync(out,{recursive:true});
const baselineDir=arg('--baseline');
const fixtureDir=arg('--fixture')?path.resolve(arg('--fixture')):path.join(root,'tools','fixtures','task-definitions-baseline');
const mode=baselineDir?'strict':'self-consistency';
const strictComparison=mode==='strict';
const baselineSource=strictComparison?'external-pre-change-engine (--baseline)':'frozen-in-repo-snapshot (tools/fixtures/task-definitions-baseline)';
const LEGACY_MIN_DEFS=493; // 扩容前（493 条）历史下界，仅兜住「缩水」，不是当前计数

const checks=[];
const check=(name,passed,kind,detail)=>checks.push({name,passed:!!passed,kind:kind||'shared',...(!passed?{detail}:{})});

// ---- 引擎加载（与原探针一致：隔离 VM，localStorage 仅含受控 claimed 状态）----
function engine(source,claimed={}){
  const state=new Map([['csh_career_achv',JSON.stringify(claimed)]]);
  const ctx=vm.createContext({window:{},localStorage:{getItem:k=>state.get(k)||null,setItem:(k,v)=>state.set(k,String(v))}});
  vm.runInContext(source,ctx);
  return ctx.window.CSH_ACHV;
}
const A=engine(fs.readFileSync(path.join(root,'core','csh_achv.js'),'utf8'));
const dynamicCount=A.stats().total; // 动态定义数（当前 2000），替换原写死 493
const cumulative=[4,5,6,7,8,9,10,12,15];
const changed=new Set(cumulative.map(n=>'task_'+n));

// ---- 静态基线（本副本内，始终可读；自洽模式断言依赖它）----
const keysPath=path.join(fixtureDir,'keys.json');
const manifestPath=path.join(fixtureDir,'manifest.json');
if(!fs.existsSync(keysPath)||!fs.existsSync(manifestPath))
  throw Error('self-consistency static baseline missing at '+fixtureDir+' (keys.json / manifest.json required)');
const frozenKeys=JSON.parse(fs.readFileSync(keysPath,'utf8'));
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));

// ---- 改前引擎（仅严格模式）----
let old=null;
if(strictComparison){
  const before=path.join(path.resolve(baselineDir),'before-csh_achv.js');
  if(!fs.existsSync(before))
    throw Error('--baseline missing before-csh_achv.js (strict comparison requires the complete pre-change baseline; refusing to silently downgrade to self-consistency)');
  old=engine(fs.readFileSync(before,'utf8'));
  if(!old||!Array.isArray(old.defs)||typeof old.byId!=='function')
    throw Error('before-csh_achv.js did not expose a valid CSH_ACHV engine (defs/byId missing)');
}

// =====================================================================
// A) 共享行为断言（两种模式完全一致，44 条，原探针语义原样保留）
// =====================================================================
for(const n of cumulative){
  const key='task_'+n,d=A.byId(key);
  check(key+' explains cross-day cumulative objective',
    d.label.includes('累计')&&d.desc==='跨日累计完成 '+n+' 项每日任务','shared');
  check(key+' cannot unlock from three current-day tasks alone',
    !A.test(d,{taskDone:3,taskTotal:3}),'shared');
  check(key+' does not read an inflated old single-day count',
    !A.test(d,{taskDone:15,taskTotal:3,taskCompletedTotal:0}),'shared');
  check(key+' requires the actual cumulative threshold',
    !A.test(d,{taskDone:0,taskCompletedTotal:n-1})&&A.test(d,{taskDone:0,taskCompletedTotal:n}),'shared');
}
for(const n of [1,2,3]){
  const d=A.byId('task_'+n);
  // 原断言的行为半部（文案/奖励半部：自洽模式由全量结构指纹覆盖，严格模式见 T4）
  check(d.key+' keeps its existing daily condition',
    A.test(d,{taskDone:n})&&!A.test(d,{taskDone:n-1,taskCompletedTotal:100}),'shared');
}
for(const key of ['egg_task_full','egg_full_house']){
  const d=A.byId(key);
  // 原断言的行为半部（文案半部：自洽模式由全量结构指纹覆盖，严格模式见 T5）
  check(key+' still depends on the same daily completion condition',
    A.test(d,{taskDone:3,taskTotal:3})&&!A.test(d,{taskDone:0,taskTotal:3,taskCompletedTotal:100}),'shared');
}
const paid=engine(fs.readFileSync(path.join(root,'core','csh_achv.js'),'utf8'),{task_15:1});
const paidRow=paid.evalAll({taskDone:0,taskCompletedTotal:0}).find(d=>d.key==='task_15');
// 原断言的「已领取」半部（奖励半部：自洽模式由结构指纹覆盖，严格模式见 T6）
check('old claimed task_15 stays claimed under its original ID',
  paid.claimed('task_15')&&paidRow.claimed,'shared');
const saved=A.evalAll({taskDone:0,taskCompletedTotal:0,careerUnlocks:{v:1,baseline:true,entries:{task_12:{observedAt:0}}}}).find(d=>d.key==='task_12');
check('old permanent qualification and its unknown historical date survive',
  saved.done&&saved.recorded&&saved.observedAt===0,'shared');
check('zero-source anti-fake engine self-test still passes',A.selfTest().ok,'shared',A.selfTest());

// 新增：动态数 == 真实 defs.length / stats().total 互证（四条独立路径 + 下界）
check('dynamic definition count mutually verified (stats/selfTest/evalAll/defs/MIN_DEFS)',
  dynamicCount===A.defs.length&&
  A.stats().total===dynamicCount&&
  A.selfTest().ok&&A.selfTest().count===dynamicCount&&
  A.evalAll({}).length===dynamicCount&&
  A.defs.length>=A.MIN_DEFS&&
  A.defs.length>=LEGACY_MIN_DEFS,'shared');

// =====================================================================
// B) 自洽模式断言（3 条，替换原 3 条「整集比对」为等价或更强的自洽断言）
//    原 line 8/9/11 在自洽模式若把 old 指向当前引擎会变成恒真（无关事实/假绿），
//    故替换为：有序键集合比对、全量结构指纹、定义结构完整。
// =====================================================================
if(!strictComparison){
  check('[self] exactly the dynamic N definitions and all frozen IDs remain (no key lost)',
    A.defs.length===frozenKeys.length&&
    A.defs.every((d,i)=>d.key===frozenKeys[i])&&
    frozenKeys.length===manifest.capturedDefCount&&
    A.defs.length>=LEGACY_MIN_DEFS,'self-consistency');
  check('[self] all career rewards and definition metadata preserved (frozen structure fingerprint)',
    manifest.metaFingerprint?.algo==='sha256'&&
    fingerprint(A.defs)===manifest.metaFingerprint.value,'self-consistency');
  check('[self] every definition is structurally complete with unique keys',
    A.defs.every(d=>
      typeof d.key==='string'&&d.key.length>0&&
      typeof d.cat==='string'&&d.cat.length>0&&
      typeof d.ico==='string'&&
      typeof d.label==='string'&&d.label.length>0&&
      typeof d.desc==='string'&&d.desc.length>0&&
      typeof d.reward==='number'&&Number.isFinite(d.reward)&&
      typeof d.prog==='function'&&A.byId(d.key)===d)&&
    new Set(frozenKeys).size===frozenKeys.length,'self-consistency');
}

// =====================================================================
// C) 严格模式断言（6 条，改前/改后逐键比对，原 9 条比较语义全部保留）
//    注意比较方向：遍历「改前」defs 到「当前」按 key 查，故天然兼容扩容（当前更多键）。
//    原 line 8 的「old 与 A 都恰好 493 条且顺序逐一相等」在 2000 条运行时不可能成立，
//    替换为等价更强的「旧键全部留存（子集）+ 当前数 >= 改前数 + 等于动态数」。
// =====================================================================
if(strictComparison){
  check('all original definitions and IDs remain (no key lost, no shrink, dynamic current count)',
    old.defs.length===old.stats().total&&
    A.defs.length>=old.defs.length&&
    A.defs.length===dynamicCount&&
    old.defs.every(d=>A.byId(d.key)&&A.byId(d.key).key===d.key)&&
    A.defs.length>=LEGACY_MIN_DEFS,'strict');
  check('all original career rewards are preserved',
    old.defs.every(d=>A.byId(d.key)&&A.byId(d.key).reward===d.reward),'strict');
  check('all non-changed original definition labels and descriptions are unchanged',
    old.defs.filter(d=>!changed.has(d.key)).every(d=>A.byId(d.key)&&metadata(A.byId(d.key))===metadata(d)),'strict');
  check('daily task_1..3 keep their original metadata',
    [1,2,3].every(n=>{const k='task_'+n,o=old.byId(k);return o&&metadata(A.byId(k))===metadata(o);}),'strict');
  check('egg keys keep their original metadata',
    ['egg_task_full','egg_full_house'].every(k=>{const o=old.byId(k);return o&&metadata(A.byId(k))===metadata(o);}),'strict');
  check('old claimed task_15 keeps its original reward (pre-change engine)',
    paidRow.reward===old.byId('task_15').reward,'strict');
}

// =====================================================================
// 结果
// =====================================================================
const failures=checks.filter(c=>!c.passed);
const kindCounts=checks.reduce((m,c)=>(m[c.kind]=(m[c.kind]||0)+1,m),{});
const coverage={
  defs:A.defs.length,dynamicCount,minDefs:A.MIN_DEFS,legacyMinDefs:LEGACY_MIN_DEFS,
  oldDefs:strictComparison?old.defs.length:null,
  fingerprint:fingerprint(A.defs),frozenFingerprint:manifest.metaFingerprint?.value,
  runtimeRoot:root,fixtureDir,baselineDir:strictComparison?path.resolve(baselineDir):null
};
const limitations=strictComparison
  ? '严格改前/改后比对已运行：逐键验证旧键留存、奖励保留、非任务文案不变（基线为 --baseline 提供的 before-csh_achv.js）。注意：本副本无「累计任务修复前」的单日引擎；若提供的是扩容前 493 条引擎，它已含累计修复，故严格模式不声称证明累计修复本身的改前 diff——9 个累计任务的 36 条行为断言直接针对当前引擎验证跨日累计语义（在单日改前引擎上会失败）。'
  : '未提供外部改前基线。仅对当前本副本源码/引擎 + 仓库内冻结静态基线做自洽检查：旧键不丢、定义结构完整、动态数量互证。strictComparison=false；未做改前/改后严格 diff 比对，绝不冒充证明严格基线等价。9 个累计任务的 36 条行为断言直接验证跨日累计语义（在单日改前引擎上会失败），并非恒真断言。';
const result={
  scope:'Actual current career engine (core/csh_achv.js, 2000 defs) + frozen in-repo static baseline. Two explicit modes: strict pre-change comparison (--baseline <dir>/before-csh_achv.js) or self-consistency against current source (default). Isolated VM stores only; no wallet/profile/migration/UI/natural-play coverage inferred.',
  passed:checks.length-failures.length,failed:failures.length,checks,
  mode,baselineSource,strictComparison,assertionCount:checks.length,kindCounts,
  coverage,limitations
};
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2)+'\n');
// stdout 仅输出失败项，纯 JSON，供 runProbeJson 的 JSON.parse(stdout) 读取
console.log(JSON.stringify({
  passed:result.passed,failed:result.failed,mode,strictComparison,
  assertionCount:result.assertionCount,kindCounts,
  coverage:{defs:coverage.defs,dynamicCount,minDefs:coverage.minDefs,legacyMinDefs:LEGACY_MIN_DEFS,oldDefs:coverage.oldDefs,fingerprint:coverage.fingerprint},
  checks:failures
},null,2));
process.exitCode=result.failed?1:0;
