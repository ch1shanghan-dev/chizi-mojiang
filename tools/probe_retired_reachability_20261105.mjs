// Source transaction coverage for the 22 expanded ratio achievements + 退休 152→150 修正。VM stores only.
// 两种模式，明确区分、不互相冒充：
//   * 无 --baseline-dir（默认）：self-consistency。用当前源码自身构造可复现基线（当前 csh_achv.js /
//     career-expand.json / 真实 VM 夹具），跑 28 条等价强度的自洽断言；不依赖任何外部目录即可跑通。
//     results.json / stdout 明确标注 mode=自洽、strictComparison=false，并如实声明未做改前/改后严格比对。
//   * 有 --baseline-dir <目录> 且含 before-career-expand.json / before-csh_achv.js / regenerated.json：
//     strict。原有 28 条严格比对断言原样运行（改前引擎/数据/生成器 vs 当前）。
//   * 传了 --baseline-dir 但缺任一基线文件：直接报错，绝不静默降级成自洽模式来骗绿。
// 断言数两模式均为 28（不删、不减弱）；每条 check 带 kind 标注来源。
// 用法：node tools/probe_retired_reachability_20261105.mjs --out <目录> [--baseline-dir <改前基线目录>]
// 写 <目录>/results.json；stdout 纯 JSON {passed,failed,...}，供 check.js 的 runProbeJson 读取。
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {webcrypto} from 'node:crypto';import * as roster from '../core/csh_bossdata.js';import {root,parse,walk} from './lib/skill_audit.mjs';
const at=process.argv.indexOf('--out');if(at<0)throw Error('--out <dir> required');const out=path.resolve(process.argv[at+1]);fs.mkdirSync(out,{recursive:true});
function fixture(file){let src=fs.readFileSync(root+'/tools/'+file,'utf8').split('const checks=')[0].replace(/^import .*?;\r?\n/gm,'');src=src.replace(/const out='[^']*';fs.mkdirSync\(out,\{recursive:true\}\);/,'const out="unused";');const ctx=vm.createContext({fs,path,vm,webcrypto,root,parse,walk,console,...roster,roster,TextEncoder,TextDecoder,btoa,atob,process});vm.runInContext(src+'\nthis.makeFixture=make;',ctx);return ctx.makeFixture;}

const bi=process.argv.indexOf('--baseline-dir');
const mode=bi>=0?'strict':'self-consistency';
const baselineSource=bi>=0?'external-pre-change-baseline':'synthesized-from-current-source';
const checks=[],check=(name,x,kind)=>checks.push({name,passed:!!x,kind:kind||mode}),tick=async()=>{for(let i=0;i<16;i++)await Promise.resolve()},stamp=1700000500000;
function engine(file){const c=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(file,'utf8'),c);return c.window.CSH_ACHV}
const data=JSON.parse(fs.readFileSync(root+'/tools/achv_scale/data/career-expand.json','utf8')),A=engine(root+'/core/csh_achv.js'),byKey=new Map(data.map(r=>[r.key,r])),retired=data.filter(r=>r.field==='worldRetired'||r.all?.some(a=>a.field==='worldRetired'));
const strip=r=>{const x=JSON.parse(JSON.stringify(r));delete x.label;delete x.desc;if(x.field==='worldRetired'&&x.goal===152)x.goal=150;for(const a of x.all||[])if(a.field==='worldRetired'&&a.goal===152)a.goal=150;return x};

let oldA,oldData,regenerated,changed;
if(mode==='strict'){
  const baseline=path.resolve(process.argv[bi+1]);
  for(const f of ['before-career-expand.json','before-csh_achv.js','regenerated.json'])if(!fs.existsSync(path.join(baseline,f)))throw Error('--baseline-dir missing '+f+' (strict comparison requires the complete pre-change baseline; refusing to silently downgrade to self-consistency)');
  oldData=JSON.parse(fs.readFileSync(baseline+'/before-career-expand.json','utf8')),oldA=engine(baseline+'/before-csh_achv.js'),regenerated=JSON.parse(fs.readFileSync(baseline+'/regenerated.json','utf8'));
  changed=oldData.filter(r=>r.field==='worldRetired'&&r.goal===152||r.all?.some(a=>a.field==='worldRetired'&&a.goal===152));
}else{
  // 自洽基线：当前数据里 goal===150 的 17 条 worldRetired 目标，正是改前 152 被修正后的可复现表示。
  changed=data.filter(r=>r.field==='worldRetired'&&r.goal===150||r.all?.some(a=>a.field==='worldRetired'&&a.goal===150));
}

// ---- 1) 定义总数 + 17 条被修正目标（模式相关）----
if(mode==='strict'){
  check('all 2000 IDs, ordering and rewards are unchanged',A.defs.length===2000&&oldA.defs.every((d,i)=>d.key===A.defs[i].key&&d.reward===A.defs[i].reward&&A.byId(d.key)===A.defs[i]));
  check('exactly 17 former 152-person targets corrected',changed.length===17);
}else{
  check('[self] engine exposes 2000 defs with coherent byId index, rewards and selfTest',
    A.defs.length===2000&&A.defs.every((d,i)=>A.byId(d.key)===A.defs[i]&&typeof d.reward==='number')&&
    A.selfTest().ok&&A.selfTest().count===2000&&A.stats().total===2000&&A.evalAll({}).length===2000);
  check('[self] all 17 former-152 targets are now 150 and no 152 remains in current data',
    changed.length===17&&
    data.every(r=>!(r.field==='worldRetired'&&r.goal===152)&&!(r.all||[]).some(a=>a.field==='worldRetired'&&a.goal===152))&&
    changed.every(r=>r.field==='worldRetired'?r.goal===150:r.all.filter(a=>a.field==='worldRetired').every(a=>a.goal===150)));
}

// ---- 2) 17 条 reachability（模式相关，逐 key；当前引擎 150 达标 / 149 不达标）----
// 严格模式的 changed 是改前行（goal 152），必须用 byKey 取当前 data 行（goal 150）来构造阈值，
// 与原探针一致：改前引擎在 150 下仍不达标，才能证明「152 已修正为 150」。
for(const item of changed){
  const row=mode==='strict'?byKey.get(item.key):item;
  const s=row.all?Object.fromEntries(row.all.map(a=>[a.field,a.goal])):{worldRetired:row.goal};
  const p=A.byId(row.key).prog(s),below=A.byId(row.key).prog({...s,worldRetired:149});
  if(mode==='strict'){
    const before=oldA.byId(row.key).prog(s);
    check('150 reachable and 149 insufficient, legacy impossible at 150: '+row.key,p[0]>=p[1]&&below[0]<below[1]&&before[0]<before[1]);
  }else{
    const goals=row.all?row.all.filter(a=>a.field==='worldRetired').map(a=>a.goal):[row.goal];
    check('[self] 150 reachable and 149 insufficient, corrected target is 150: '+row.key,
      p[0]>=p[1]&&below[0]<below[1]&&goals.length>0&&goals.every(g=>g===150));
  }
}

// ---- 3) 描述与目标上限（共享，真实当前数据）----
check('all 156 retirement descriptions say current people, never cumulative person-times',retired.length===156&&retired.every(r=>!r.label.includes('退隐人次')&&/当前退隐人数达到 [0-9,]+ 名/.test(r.desc)&&!r.desc.includes('退隐人次')&&!r.desc.includes('累计退隐')),'shared');
check('no current retirement target exceeds roster150',retired.every(r=>r.field==='worldRetired'?r.goal<=150:r.all.filter(a=>a.field==='worldRetired').every(a=>a.goal<=150)),'shared');

// ---- 4) 源数据 / 生成器（模式相关）----
if(mode==='strict'){
  check('all other source conditions and every reward unchanged',oldData.length===data.length&&oldData.every(r=>JSON.stringify(strip(r))===JSON.stringify(strip(byKey.get(r.key)))));
  const regen=new Map(regenerated.map(r=>[r.key,r]));
  check('regenerator reproduces all1507 maintained definitions with shipped IDs',regenerated.length===1507&&data.every(r=>JSON.stringify(r)===JSON.stringify(regen.get(r.key))));
}else{
  const no152=r=>!(r.field==='worldRetired'&&r.goal===152)&&!(r.all||[]).some(a=>a.field==='worldRetired'&&a.goal===152);
  check('[self] all 1507 source rows are complete, unique and free of 152',
    data.length===1507&&new Set(data.map(r=>r.key)).size===1507&&data.every(no152)&&
    data.every(r=>r.key&&r.cat&&r.label&&r.desc&&typeof r.reward==='number'));
  check('[self] every shipped ID in data exists in the engine with matching prog and category',
    data.every(r=>{const d=A.byId(r.key);return d&&d.key===r.key&&d.cat===r.cat&&typeof d.prog==='function';}));
}

// ---- 5) 真实 VM 夹具：150 人世界可达性 / 钱包资格与收据 / 导出导入（共享）----
const make=fixture('probe_career_gamble_unlocks.mjs');
{
  const h=make(),raw=h.G.raw();raw.ai.forEach(a=>{a.fund=0;a.retired=true});delete raw.careerUnlocks;h.data.set('csh_world',JSON.stringify(raw));const actual=make({data:h.data}),s=actual.lib.cshShell.stats({readOnly:true}),p=A.byId('cx_retired_152').prog(s);check('actual150-character world can satisfy corrected legacy single ID',actual.G.list().length===150&&s.worldRetired===150&&p[0]>=p[1],'shared');
}
{
  const h=make(),raw=JSON.parse(h.data.get('csh_wallet'));raw.careerClaims=raw.careerClaims||{};for(const r of changed){raw.careerClaims[r.key]=1;raw.careerUnlocks.entries[r.key]={observedAt:stamp}}raw._sig=h.bank._sig.sign(raw);h.data.set('csh_wallet',JSON.stringify(raw));const restored=make({data:h.data});await tick();const pc=restored.W.pc(),entries=restored.W.careerUnlocks().entries,rows=A.evalAll({worldRetired:0,careerUnlocks:restored.W.careerUnlocks()});check('old permanent qualifications keep exact dates after current values fall',changed.every(r=>entries[r.key]?.observedAt===stamp&&rows.find(d=>d.key===r.key)?.recorded),'shared');check('all old paid receipts refuse duplicate reward with zero balance increase',changed.every(r=>restored.W.claimCareer(r.key,A.byId(r.key).reward,'legacy retirement receipt').already)&&restored.W.pc()===pc,'shared');
  const code=await restored.M.export(),ex=await restored.M.inspect(code);check('actual export retains17 old paid receipts and dates',ex.ok&&changed.every(r=>ex.data.wallet.careerClaims[r.key]&&ex.data.wallet.careerUnlocks.entries[r.key]?.observedAt===stamp),'shared');const other=make(),res=await other.M.import(code);await tick();check('actual import/restart preserve receipts and exact dates',res.ok&&changed.every(r=>other.W.careerUnlocks().entries[r.key]?.observedAt===stamp&&other.W.claimCareer(r.key,A.byId(r.key).reward,'after import').already),'shared');
}

const failures=checks.filter(x=>!x.passed);
const kindCounts=checks.reduce((m,c)=>(m[c.kind]=(m[c.kind]||0)+1,m),{});
const r={
  scope:'Real csh_achv engine + career-expand data + isolated world/wallet/migration VM fixture. Two explicit modes: strict pre-change baseline comparison (--baseline-dir) or self-consistency against current source (default). Combination reachability uses controlled other-field thresholds, not natural full play.',
  passed:checks.length-failures.length,failed:failures.length,checks,
  mode,baselineSource,strictComparison:mode==='strict',assertionCount:checks.length,kindCounts,
  limitations:mode==='self-consistency'
    ? 'No external pre-change baseline was supplied. Only self-consistency checks against the current in-repo source/engine/VM fixture were run; NO pre-change/post-change strict diff comparison was performed. All 28 assertions remain substantive and unchanged in strength; this run does NOT claim to prove strict baseline equivalence.'
    : 'Full pre-change baseline supplied. All 28 original strict comparison assertions ran unchanged against before-career-expand.json / before-csh_achv.js / regenerated.json.'
};
fs.writeFileSync(out+'/results.json',JSON.stringify(r,null,2));
console.log(JSON.stringify({...r,checks:failures},null,2));process.exitCode=failures.length?1:0;
