// Development-only AST access; reuse the installed host parser without dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const host = path.resolve(root, '../..');
const pnpm = path.join(host, 'node_modules/.pnpm');
const bundle = fs.readdirSync(pnpm).filter(n => n.startsWith('eslint-linter-browserify@')).sort().at(-1);
if (!bundle) throw Error('Installed host parser unavailable; no dependency was installed');
const { Linter } = await import(pathToFileURL(path.join(pnpm,bundle,'node_modules/eslint-linter-browserify/linter.js')));
const linter = new Linter({configType:'eslintrc'}); let captured;
linter.defineRule('capture',{create(){return {Program(n){captured=n;}};}});
export function parse(source) {
  const messages=linter.verify(source,{parserOptions:{ecmaVersion:'latest',sourceType:'module'},rules:{capture:'error'}});
  if(messages.length)throw Error(JSON.stringify(messages));
  return captured;
}
export function walk(node,visit){if(!node?.type)return;visit(node);for(const [key,value]of Object.entries(node)){if(['parent','tokens','comments'].includes(key))continue;if(Array.isArray(value))value.forEach(n=>walk(n,visit));else if(value?.type)walk(value,visit);}}
export const keyOf=p=>p.key?.name??p.key?.value;
export const property=(o,key)=>o?.properties?.find(p=>keyOf(p)===key)?.value;
export function skillsOf(ast){let pack;walk(ast,n=>{if(n.type==='VariableDeclarator'&&n.id.name==='cshSkillPack')pack=property(n.init,'skill');});if(!pack)throw Error('Skill pack not found');return pack;}
// Keep every rule/trigger/filter/cost/content node. Exclusions are actual ai fields,
// Explicit AI choices include set('ai'/'processAI'), direct event.ai functions,
// jiaomeng's helper, and the named activation/button checks below.
export function ruleSignature(source){
  const ast=parse(source), pack=skillsOf(ast), excluded=new Set(), scopedAiSetters=new Set();
  const zhansongCheck=property(property(pack,"csh_zhansong"),"check");if(zhansongCheck)excluded.add(zhansongCheck);
  walk(property(pack,"csh_junchi"),n=>{if(n.type==="CallExpression"&&n.callee.type==="MemberExpression"&&n.callee.property.name==="set"&&n.arguments[0]?.value==="ai2")scopedAiSetters.add(n);});
  const xiangbinCheck=property(property(pack,"csh_xiangbin"),"check");if(xiangbinCheck)excluded.add(xiangbinCheck);
  walk(property(pack,"csh_xianghong"),n=>{if(n.type==="CallExpression"&&n.callee.property?.name==="chooseControl"&&n.arguments[0]?.value==="baonue_hp"&&n.arguments[2])excluded.add(n.arguments[2]);});
  const longhunCheck=property(property(pack,"csh_longhun"),"check");if(longhunCheck)excluded.add(longhunCheck);
  const helper=property(property(pack,'csh_jiaomeng'),'_advantage');if(helper)excluded.add(helper);
  const shequeCheck=property(property(pack,'csh_sheque'),'check');if(shequeCheck)excluded.add(shequeCheck);
  const zuilunCheck=property(property(pack,'csh_hyy_zuilun'),'check');if(zuilunCheck)excluded.add(zuilunCheck);
  const linglongCheck=property(property(property(pack,'csh_hyy_linglong'),'chooseButton'),'check');if(linglongCheck)excluded.add(linglongCheck);
  const xiangzhenCheck=property(property(pack,'csh_xiangzhen'),'check');if(xiangzhenCheck)excluded.add(xiangzhenCheck);
  const jinfanOrder=property(property(property(pack,'csh_jinfan'),'mod'),'aiOrder');if(jinfanOrder)excluded.add(jinfanOrder);
  const huangyuanCheck=property(property(pack,'csh_huangyuan'),'check');if(huangyuanCheck)excluded.add(huangyuanCheck);
  walk(ast,n=>{
    if(n.type==='Property'&&keyOf(n)==='ai')excluded.add(n.value);
    if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='set'&&['ai','processAI'].includes(n.arguments[0]?.value)&&n.arguments[1])excluded.add(n.arguments[1]);
    if(n.type==='AssignmentExpression'&&n.left.type==='MemberExpression'&&n.left.property.name==='ai'&&['FunctionExpression','ArrowFunctionExpression'].includes(n.right.type))excluded.add(n.right);
  });
  function normalize(value){
    if(excluded.has(value))return {type:'Identifier',name:'__AUDIT_AI__'};
    // A new chained AI setter changes no underlying action or its parameters.
    // Preserve its receiver, including any non-AI setters in that receiver chain.
    if(scopedAiSetters.has(value)||(value?.type==='CallExpression'&&value.callee.type==='MemberExpression'&&value.callee.property.name==='set'&&['ai','processAI'].includes(value.arguments[0]?.value)))return normalize(value.callee.object);
    if(Array.isArray(value))return value.map(normalize);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['parent','tokens','comments','loc','range','start','end','raw'].includes(k)).map(([k,v])=>[k,normalize(k==='properties'&&Array.isArray(v)?v.filter(p=>!(p.type==='Property'&&keyOf(p)==='ai')):v)]));
    return value;
  }
  return JSON.stringify(normalize(ast));
}
