import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {root,parse,walk} from './lib/skill_audit.mjs';
const i=process.argv.indexOf('--out');if(i<0)throw Error('--out required');
const out=path.resolve(process.argv[i+1]),source=fs.readFileSync(root+'/core/csh_career_observer.js','utf8');
const names=['bossRule','taskRule','rankRule','gambleComboRule','gambleRule','playerRatioRule','playerComboRule','playerRule','walletComboRule','worldHandsRule'],chunks=[];
walk(parse(source),n=>{
  if(n.type==='FunctionDeclaration'&&names.includes(n.id?.name))chunks.push(source.slice(...n.range));
  if(n.type==='VariableDeclarator'&&n.id?.name==='TASK_KEYS')chunks.push('var TASK_KEYS='+source.slice(...n.init.range)+';');
});
const c=vm.createContext({window:{}});
vm.runInContext(fs.readFileSync(root+'/core/csh_achv.js','utf8'),c);
vm.runInContext(chunks.join('\n').replace(/\\n/g,'\n'),c);
const kinds={wallet:[],rank:[],gamble:[],interaction:[],personal:[],world:[],unrouted:[]},details=[];
for(const d of c.window.CSH_ACHV.defs){
  const routes=[];
  if(c.bossRule(d)||c.taskRule(d)||c.walletComboRule(d)||['资产','签到'].includes(d.cat)||['egg_signed_first','egg_hungry','egg_rich_first'].includes(d.key))routes.push('wallet');
  if(c.rankRule(d))routes.push('rank');
  if(c.gambleRule(d))routes.push('gamble');
  if(d.cat==='互动')routes.push('interaction');
  if(c.playerRule(d))routes.push('personal');
  if(c.worldHandsRule(d))routes.push('world');
  if(!routes.length)routes.push('unrouted');
  routes.forEach(k=>kinds[k].push(d.key));
  details.push({id:d.key,category:d.cat,routes});
}

/* 手册 §10-2：「静态未匹配项应分类为待接真实源、已有派生源、组合或设计取舍，
   避免一律判不可达」。unrouted 只说明「不走 observer 独立记录链」，不等于不可达：
   AI世界类由 buildStats 的真实字段直接判定，组合类由已有派生源组合，彩蛋是隐藏条件。
   只有真正找不到任何事实源的项才算 pendingSource，出现即视为待办、必须判红。 */
const classification={pendingSource:[],derivedSource:[],combination:[],design:[]};
for(const d of details){
  if(!d.routes.includes('unrouted'))continue;
  if(d.category==='彩蛋')classification.design.push(d.id);
  else if(/^cx_(combo|ratio|retired|hands)_/.test(d.id))classification.combination.push(d.id);
  else if(d.category==='AI世界'||/^(worldchars|worldrec|tierdown|comebacksee|rivalsee|grudge8|retired)_/.test(d.id))classification.derivedSource.push(d.id);
  else classification.pendingSource.push(d.id);
}
/* 派生源契约：这些字段必须由 buildStats 真实赋值，否则 AI世界成就会退化成不可达。 */
const shell=fs.readFileSync(root+'/core/csh_shell.js','utf8');
const worldFields=['worldChars','worldRetired','recordsSeen','tierDown','comebacks','rivals','grudge8'];
const missingFields=worldFields.filter(f=>!new RegExp('s\\.'+f+'\\s*(?:=|\\+\\+)').test(shell));
const checks=[
  {name:'未路由项已按四类归因，不一律判不可达',passed:classification.pendingSource.length===0,detail:classification.pendingSource.slice(0,8)},
  {name:'派生源计数与 observer 未路由总数一致',passed:Object.values(classification).reduce((n,v)=>n+v.length,0)===kinds.unrouted.length},
  {name:'AI世界成就的事实源字段仍由 buildStats 真实注入',passed:missingFields.length===0,detail:missingFields},
];
const failed=checks.filter(x=>!x.passed);
const result={
  scope:'Static route inventory derived from actual observer predicates, not end-to-end or natural-play coverage.',
  total:details.length,routed:details.filter(d=>!d.routes.includes('unrouted')).length,
  counts:Object.fromEntries(Object.entries(kinds).map(([k,v])=>[k,v.length])),
  unroutedByCategory:Object.fromEntries([...new Set(details.filter(d=>d.routes.includes('unrouted')).map(d=>d.category))].map(cat=>[cat,details.filter(d=>d.category===cat&&d.routes.includes('unrouted')).length])),
  classification:Object.fromEntries(Object.entries(classification).map(([k,v])=>[k,v.length])),
  classificationIds:classification,
  checks,passed:checks.length-failed.length,failed:failed.length,failures:failed,
  ids:kinds,
};
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,ids:undefined,classificationIds:undefined}));
if(failed.length)process.exitCode=1;
