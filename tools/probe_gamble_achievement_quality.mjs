// Actual career predicates and world settlement records; isolated stores only.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import crypto from 'node:crypto';import{fileURLToPath}from'node:url';
import {parse,walk} from './lib/skill_audit.mjs';import{auditModel,loadModel}from'./audit_achievement_quality.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),at=process.argv.indexOf('--out');if(at<0)throw Error('External --out required');const out=path.resolve(process.argv[at+1]);if(out===root||out.startsWith(root+path.sep)||process.platform==='win32'&&path.parse(out).root.toUpperCase().startsWith('C:'))throw Error('Keep artifacts outside installation and C:');
const checks=[],check=(name,passed,detail)=>checks.push({name,passed:!!passed,...(!passed?{detail}:{})});
const source=fs.readFileSync(root+'/core/csh_achv.js','utf8');
function engine(claimed={}){const store=new Map([['csh_career_achv',JSON.stringify(claimed)]]),ctx=vm.createContext({window:{},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v))}});vm.runInContext(source,ctx);return {A:ctx.window.CSH_ACHV,store};}
const {A}=engine(),changed=new Set([2,3,5,8].map(n=>'gstreak2_'+n).concat([100000,500000,2000000,10000000,30000000,80000000].map(n=>'gmloss_'+n)));
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex'),met=(d,s)=>{const p=d.prog(s);return p[0]>=p[1];};
/* 2026-11-04 生涯扩容：定义总数从 493 增至 2000，但前 493 条的 ID/顺序/奖励必须原样。
   改为校验切片前缀，保护强度不变，同时允许末尾追加。 */
check('all 493 old IDs, order and rewards remain exactly unchanged',A.defs.length>=493&&hash(A.defs.slice(0,493).map(d=>[d.key,d.reward]))==='0bfc3b00cae87512f5fae26cd99a3ca68500862b50eaa52b8b0678cf4d55c3cf');
const semanticIds=new Set(A.defs.filter(d=>['seg_10','seg_20','seg_30','seg_40','egg_world_tour','egg_billion_killer','egg_gamble_first'].includes(d.key)||/^(topdown|topfund|broke)_/.test(d.key)).map(d=>d.key));
check('all other 448 definition labels, icons and descriptions remain unchanged',hash(A.defs.slice(0,493).filter(d=>!changed.has(d.key)&&!semanticIds.has(d.key)).map(d=>[d.key,d.cat,d.ico,d.label,d.desc,d.reward]))==='14901911f3b1b7dc57d0862e4601b31abfa4d1377451b31daba5e1c98766cb42');
check('no original definition is retired or hidden',Object.keys(A.RETIRED).length===0);
for(const n of [2,3,5,8]){
 const id='gstreak2_'+n,d=A.byId(id),record=A.byId('gmstreak_'+n);
 check('streak alone no longer unlocks the distinct experience '+n,!met(d,{gambleBestStreak:n,gambleBust:0})&&met(record,{gambleBestStreak:n}));
 check('loss count alone never invents a streak '+n,!met(d,{gambleBestStreak:0,gambleBust:n}));
 check('both real lifetime facts unlock the experience '+n,met(d,{gambleBestStreak:n,gambleBust:n}));
 check('either missing threshold keeps the experience locked '+n,!met(d,{gambleBestStreak:n-1,gambleBust:n})&&!met(d,{gambleBestStreak:n,gambleBust:n-1}));
 check('progress follows the missing fact without exceeding either witness '+n,d.prog({gambleBestStreak:n+10,gambleBust:n-1})[0]===n-1&&d.prog({gambleBestStreak:n-1,gambleBust:n+10})[0]===n-1);
 check('money loss or current streak cannot substitute for the two recorded counts '+n,!met(d,{gambleNet:-80000000,gambleStreak:n,worldHands:9999}));
 check('invalid count snapshots do not fabricate completion '+n,[NaN,Infinity,-1,.5].every(v=>!met(d,{gambleBestStreak:v,gambleBust:n})&&!met(d,{gambleBestStreak:n,gambleBust:v})));
 check('wording describes both facts without inventing their order '+n,d.label.startsWith('起伏之间')&&d.desc.includes('净亏出战数与历史连胜纪录均达到')&&!/先|后赢|回本/.test(d.desc)&&!d.desc.includes('{n}'));
 const paid=engine({[id]:1});const bytes=paid.store.get('csh_career_achv'),r=paid.A.evalAll({}).find(d=>d.key===id);
 check('old paid receipt remains paid and byte-identical '+n,r.claimed&&paid.A.claimed(id)&&paid.store.get('csh_career_achv')===bytes&&!r.retired);
 for(const observedAt of [0,1700000000000]){const stats={careerUnlocks:{v:1,baseline:true,entries:{[id]:{observedAt}}}},row=A.evalAll(stats).find(r=>r.key===id);check('old permanent eligibility keeps exact observation '+n+'/'+observedAt,row.recorded&&row.done&&!row.conditionMet&&row.observedAt===observedAt&&A.test(d,stats));}
}
for(const threshold of [100000,500000,2000000,10000000,30000000,80000000]){
 const d=A.byId('gmloss_'+threshold);
 check('negative net threshold remains unchanged '+threshold,!met(d,{gambleNet:-(threshold-1)})&&met(d,{gambleNet:-threshold})&&met(d,{gambleNet:-threshold-1}));
 check('gross losing sessions do not substitute for lifetime net loss '+threshold,!met(d,{gambleNet:threshold,gambleBust:999999,lossTotal:999999999})&&!met(d,{gambleBust:999999,lossTotal:999999999}));
 check('net loss wording includes both gains and losses '+threshold,d.desc.includes('累计净收益')&&d.desc.includes('盈亏抵消')&&!d.desc.includes('净输累计'));
}
// Reuse the real world harness, then extract its actual shell aggregate.
const prefix=fs.readFileSync(root+'/tools/probe_world_lifecycle.mjs','utf8').split('const tests=[];')[0].replace(/^import .*;\r?\n/gm,'');const outer=vm.createContext({fs,path,vm,root,parse,walk,process,console});vm.runInContext(prefix+'\nthis.make=harness;this.statsSource=functions.get("buildStats");',outer);
function actualWorld(){const h=outer.make();vm.runInContext(outer.statsSource,h.ctx);return h;}
for(const n of [2,3,5,8]){
 const first=actualWorld();for(let i=0;i<n;i++)first.W.noteGamble(1000);let s=first.ctx.buildStats({readOnly:true});
 check('actual win-only world distinguishes old record and new experience '+n,met(A.byId('gmstreak_'+n),s)&&!met(A.byId('gstreak2_'+n),s));
 for(let i=0;i<n;i++)first.W.noteGamble(-1000);s=first.ctx.buildStats({readOnly:true});
 check('actual wins then losses prove both facts with current streak zero '+n,first.W.gambleStats().streak===0&&s.gambleBust===n&&s.gambleBestStreak===n&&met(A.byId('gstreak2_'+n),s));
 const reverse=actualWorld();for(let i=0;i<n;i++)reverse.W.noteGamble(-1000);for(let i=0;i<n;i++)reverse.W.noteGamble(1000);s=reverse.ctx.buildStats({readOnly:true});
 check('actual losses then wins are equally valid without a false ordering claim '+n,met(A.byId('gstreak2_'+n),s));
}
const quality=auditModel(await loadModel(root));
check('all four old identical-description groups have disappeared',![2,3,5,8].some(n=>quality.review.some(r=>r.code==='SAME_DESCRIPTION'&&r.ids.includes('career:gstreak2_'+n)&&r.ids.includes('career:gmstreak_'+n))));
check('natural qualification stays explicitly unclaimed',quality.counts.qualifiedNaturalCount===null);
const failures=checks.filter(c=>!c.passed),result={scope:'Actual career predicates, world noteGamble and extracted real shell aggregate; isolated stores, no player profile or natural full game. Metadata signatures preserve the 493-definition baseline.',passed:checks.length-failures.length,failed:failures.length,checks};fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,failed:result.failed,failures},null,2));process.exitCode=failures.length?1:0;
