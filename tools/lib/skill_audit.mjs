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
// .set('ai') callbacks, and the one existing helper called only by jiaomeng's ai.
export function ruleSignature(source){
  const ast=parse(source), pack=skillsOf(ast), excluded=new Set();
  const helper=property(property(pack,'csh_jiaomeng'),'_advantage');if(helper)excluded.add(helper);
  walk(ast,n=>{
    if(n.type==='Property'&&keyOf(n)==='ai')excluded.add(n.value);
    if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='set'&&n.arguments[0]?.value==='ai'&&n.arguments[1])excluded.add(n.arguments[1]);
  });
  function normalize(value){
    if(excluded.has(value))return {type:'Identifier',name:'__AUDIT_AI__'};
    if(Array.isArray(value))return value.map(normalize);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['parent','tokens','comments','loc','range','start','end','raw'].includes(k)).map(([k,v])=>[k,normalize(v)]));
    return value;
  }
  return JSON.stringify(normalize(ast));
}
