// Uses actual skill AI and the installed host's get.effect/damageEffect methods.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ruleSignature } from './lib/skill_audit.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), host = path.resolve(root, '../..');
const option = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const pnpm = path.join(host, 'node_modules/.pnpm');
const bundle = fs.readdirSync(pnpm).filter(x => x.startsWith('eslint-linter-browserify@')).sort().at(-1);
const { Linter } = await import(pathToFileURL(path.join(pnpm, bundle, 'node_modules/eslint-linter-browserify/linter.js')));
const linter = new Linter({ configType: 'eslintrc' }); let ast;
linter.defineRule('capture', { create() { return { Program(n) { ast = n; } }; } });
function parse(source) { const m = linter.verify(source, { parserOptions: { ecmaVersion: 'latest', sourceType: 'module' }, rules: { capture: 'error' } }); if (m.length) throw Error(JSON.stringify(m)); return ast; }
function walk(n, fn) { if (!n?.type) return; fn(n); for (const [k,v] of Object.entries(n)) { if (['parent','tokens','comments'].includes(k)) continue; if(Array.isArray(v)) v.forEach(x=>walk(x,fn)); else if(v?.type) walk(v,fn); } }
const key = p => p.key?.name ?? p.key?.value;
const prop = (o,k) => o?.properties?.find(p => key(p) === k)?.value;
const source = fs.readFileSync(option('--source') || path.join(root, 'skills/index.js'), 'utf8');
const tree = parse(source); let pack;
walk(tree,n=>{if(n.type==='VariableDeclarator'&&n.id.name==='cshSkillPack')pack=prop(n.init,'skill');});
function skillNode(id) { if(prop(pack,id)) return prop(pack,id); const base = id.lastIndexOf('_'); return prop(prop(skillNode(id.slice(0,base)),'subSkill'), id.slice(base+1)); }
const ids = ['csh_jsrgpingtao','csh_jsrgpingtao_2','csh_qiege','csh_gyweiyang','csh_spweiwu','csh_duwu'];
const engineSource = fs.readFileSync(path.join(host,'noname/get/index.js'),'utf8');
const engineTree = parse(engineSource), engine = {};
walk(engineTree,n=>{if(n.type==='MethodDefinition'&&['effect','damageEffect','recoverEffect'].includes(key(n)))engine[key(n)]=engineSource.slice(...n.range);});
const results=[]; const check=(name,ok,detail)=>results.push({name,passed:!!ok,detail});
let damage = -1.5;
const player = {id:'actor', hp:3, maxHp:4, countCards:()=>4, getSkills:()=>[],hasSkillTag:()=>false};
const target = {id:'target', hp:1, maxHp:4, hujia:0, attitude:-4, cards:1, countCards:()=>target.cards,getSkills:()=>[],hasSkillTag:()=>false,isLinked:()=>false};
const game={players:[player,target],expandSkills(){},hasPlayer:fn=>[player,target].some(fn)};
const lib={skill:{global:[]}}; const ui={selected:{cards:[{suit:'spade'}],targets:[]}};
const get={autoViewAs:x=>x,itemtype:()=>'',attitude:(a,b)=>a===b?4:b===target?target.attitude:a===target?target.attitude:4,
  info:()=>({ai:{}}),tag:()=>false,suit:c=>c.suit,
  result(card){ if(typeof card==='string')return lib.skill[card].ai.result; return {player:card.name==='shunshou'?1:0,target:card.name==='recover'?1:card.name==='shunshou'?-1:damage}; }};
const context=vm.createContext({lib,game,get,ui,_status:{event:{player}},CacheContext:{requireCacheContext:()=>({get,delegate:x=>x})}});
const methods=vm.runInContext('({' + Object.values(engine).join(',\n') + '})',context); Object.assign(get,methods);
for(const id of ids){const n=prop(skillNode(id),'ai');lib.skill[id]={ai:vm.runInContext('('+source.slice(...n.range)+')',context)};}
for(const id of ['csh_jsrgpingtao','csh_jsrgpingtao_2','csh_spweiwu','csh_duwu']){
  for(const [hp,cards] of [[1,0],[2,1],[4,5]]){
    target.hp=hp;target.cards=cards;target.attitude=-4; damage=-1.5;
    const raw=lib.skill[id].ai.result.target(player,target), final=get.effect(target,id,player,player);
    check(id+`: enemy hp=${hp}, cards=${cards} has negative target result`,raw<0,{raw,final});
    check(id+`: enemy hp=${hp}, cards=${cards} has positive final utility`,final>0,{raw,final});
  }
  target.attitude=4;target.hp=3;target.cards=3;
  if(id!=='csh_duwu')check(id+': ally is not scored as preferred harmful target',lib.skill[id].ai.result.target(player,target)===0);
}
target.attitude=-4;target.hp=2;target.cards=1;damage=0;
check('duwu: zero damage utility is rejected',lib.skill.csh_duwu.ai.result.target(player,target)===0);
damage=1.5;check('duwu: enemy benefiting from damage is rejected',lib.skill.csh_duwu.ai.result.target(player,target)===0);
damage=-1.5;
for(const suit of ['heart','diamond','spade']){
  ui.selected.cards[0].suit=suit;
  for(const attitude of [-4,4,0]){
    target.attitude=attitude;
    const score=lib.skill.csh_qiege.ai.result.target(player,target);
    check(`qiege ${suit} attitude=${attitude}: target benefit/harm sign`,suit==='spade'?score<0:score>0,score);
  }
}
ui.selected.cards.length=0;check('qiege: no selected card is neutral',lib.skill.csh_qiege.ai.result.target(player,target)===0);
for(const attitude of [-4,4,0]){
  target.attitude=attitude;
  const score=lib.skill.csh_gyweiyang.ai.result.target(player,target), final=get.effect(target,'csh_gyweiyang',player,player);
  check(`weiyang: recovery is target benefit at attitude=${attitude}`,score>0,score);
  if(attitude)check(`weiyang: final recovery utility follows attitude=${attitude}`,attitude<0?final<0:final>0,final);
}
// New batches also edit the existing AI-only helper and .set('ai') callbacks;
// compare the entire rule AST with those explicit AI locations excluded.
const baseline=option('--baseline');
if(baseline)check('rule AST unchanged outside explicit AI callbacks/helper',ruleSignature(source)===ruleSignature(fs.readFileSync(baseline,'utf8')));
const failures=results.filter(r=>!r.passed);
console.log(JSON.stringify({scope:'actual host effect/skill callbacks in VM; mocked players/cards, not complete game simulation',passed:results.length-failures.length,failed:failures.length,failures},null,2));
process.exitCode=failures.length?1:0;
