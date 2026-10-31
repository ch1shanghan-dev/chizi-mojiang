// Restore historical AI surfaces only; preserve current rules and added characters.
import fs from 'node:fs';import path from 'node:path';import cp from 'node:child_process';
import {root,parse,walk,keyOf,skillsOf,property} from './lib/skill_audit.mjs';
const arg=n=>{const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1];},apply=process.argv.includes('--apply');
const requestedOut=arg('--out');if(!requestedOut)throw Error('--out external backup directory required');const out=path.resolve(requestedOut),relative=path.relative(root,out);if(!relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))throw Error('Backup output must stay outside the repository');if(fs.existsSync(out)&&fs.readdirSync(out).length)throw Error('Use a new empty output directory to preserve earlier backups');fs.mkdirSync(out,{recursive:true});
const aiFields=new Set(['ai','ai1','ai2','processAI','check','check2','aiOrder','aiUseful','_advantage']);const aiSetters=new Set(['ai','ai1','ai2','processAI']);
const historical=ref=>file=>cp.execFileSync('git',['show',ref+':'+file],{cwd:root,encoding:'utf8',maxBuffer:12*1024*1024});
const old=historical('b71ccd4'),hao=historical('c825879');
function containers(text,file){const tree=parse(text);if(file==='skills/index.js')return [['skill',skillsOf(tree)]];if(file==='skills/boss.js'){let p;walk(tree,n=>{if(n.type==='VariableDeclarator'&&n.id.name==='skill')p=n.init;});return [['skill',p]];}let p;walk(tree,n=>{if(n.type==='ExportDefaultDeclaration')p=n.declaration;});return ['card','skill'].map(k=>[k,property(p,k)]).filter(x=>x[1]);}
function anchor(n){if(!n)return '?';if(n.type==='Identifier')return n.name;if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'){const k=n.callee.property.name;if(k?.startsWith('choose'))return k;return anchor(n.callee.object);}return n.type;}
function markers(node,text){const list=[];function scan(n,p=[],parent){if(!n?.type)return;
 if(n.type==='Property'){const key=keyOf(n);if(aiFields.has(key)){list.push({key:[...p,'field:'+key].join('/'),node:n.value,prop:n,parent,kind:'field'});return;}scan(n.value,[...p,key],n);return;}
 if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'){
  if(n.callee.property.name==='set'&&aiSetters.has(n.arguments[0]?.value)){list.push({key:[...p,'set:'+n.arguments[0].value+':'+anchor(n.callee.object)].join('/'),node:n.arguments[1],call:n,kind:'set',parent});scan(n.callee.object,p,n);return;}
  if(['chooseControl','chooseDrawRecover'].includes(n.callee.property.name)){for(let i=0;i<n.arguments.length;i++){const a=n.arguments[i];if(['FunctionExpression','ArrowFunctionExpression'].includes(a.type))list.push({key:[...p,'choose-ai:'+n.callee.property.name+':'+i].join('/'),node:a,kind:'arg'});}scan(n.callee.object,p,n);for(const a of n.arguments)if(!['FunctionExpression','ArrowFunctionExpression'].includes(a.type))scan(a,p,n);return;}
 }
 if(n.type==='AssignmentExpression'&&n.left.type==='MemberExpression'&&aiSetters.has(n.left.property.name)&&['FunctionExpression','ArrowFunctionExpression'].includes(n.right.type)){list.push({key:[...p,'assign:'+anchor(n.left.object)+':'+n.left.property.name].join('/'),node:n.right,assign:n,parent,kind:'assign'});return;}
 for(const [k,v]of Object.entries(n)){if(['parent','tokens','comments'].includes(k))continue;if(Array.isArray(v))v.forEach(a=>scan(a,p,n));else if(v?.type)scan(v,p,n);}
 }scan(node);const counts=new Map();for(const m of list){const k=m.key;const count=counts.get(k)||0;counts.set(k,count+1);m.key=k+'#'+count;}return list;}
const sig=n=>JSON.stringify(n,(k,v)=>['parent','tokens','comments','loc','range','start','end','raw'].includes(k)?undefined:v);
function rules(text){const ast=parse(text);function clean(n){if(!n||typeof n!=='object')return n;if(Array.isArray(n))return n.map(clean).filter(v=>v!==undefined);if(n.type==='Property'&&aiFields.has(keyOf(n)))return undefined;
 if(n.type==='ExpressionStatement'){const e=n.expression;if(e.type==='AssignmentExpression'&&e.left.type==='MemberExpression'&&aiSetters.has(e.left.property.name))return undefined;if(e.type==='CallExpression'&&e.callee.property?.name==='set'&&aiSetters.has(e.arguments[0]?.value))return undefined;}
 if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'){
  if(n.callee.property.name==='set'&&aiSetters.has(n.arguments[0]?.value))return clean(n.callee.object);
  if(['chooseControl','chooseDrawRecover'].includes(n.callee.property.name))return {...cleanObject(n),arguments:n.arguments.map(a=>['FunctionExpression','ArrowFunctionExpression'].includes(a.type)?{type:'Identifier',name:'__AI__'}:clean(a))};
 }
 return cleanObject(n);
 }function cleanObject(n){const o={};for(const [k,v]of Object.entries(n))if(!['parent','tokens','comments','loc','range','start','end','raw'].includes(k))o[k]=clean(v);return o;}return JSON.stringify(clean(ast));}
function propertyRemoval(m,text){let a=m.prop.range[0],b=m.prop.range[1];const after=text.slice(b).match(/^\s*,/);if(after)b+=after[0].length;else{const before=text.slice(0,a).match(/,\s*$/);if(before)a-=before[0].length;}return {a,b,text:''};}
const reports=[],candidates=[];
for(const file of ['skills/index.js','skills/boss.js','card/index.js']){
 const current=fs.readFileSync(path.join(root,file),'utf8'),base=old(file),fallback=file==='skills/index.js'?hao(file):null;
 const baselineMap=new Map(containers(base,file).flatMap(([group,p])=>(p?.properties||[]).map(x=>[group+'/'+keyOf(x),{text:base,node:x.value}])));
 const fallbackMap=fallback?new Map(containers(fallback,file).flatMap(([group,p])=>p.properties.map(x=>[group+'/'+keyOf(x),{text:fallback,node:x.value}]))):new Map();
 const edits=[],changes=[],unresolved=[],newDefinitions=[];
 for(const [group,pack]of containers(current,file))for(const p of pack.properties){const id=group+'/'+keyOf(p);let b=baselineMap.get(id);if(!b){if(['skill/csh_juwei','skill/csh_chonglei'].includes(id))b=fallbackMap.get(id);else{newDefinitions.push(id);continue;}}
  const before=markers(b.node,b.text),now=markers(p.value,current),by=new Map(before.map(m=>[m.key,m]));
  for(const m of now){const old=by.get(m.key);by.delete(m.key);if(old&&sig(m.node)===sig(old.node))continue;
   if(old){edits.push({a:m.node.range[0],b:m.node.range[1],text:b.text.slice(...old.node.range)});changes.push(id+'/'+m.key);}
   else if(m.kind==='field'){edits.push(propertyRemoval(m,current));changes.push(id+'/'+m.key+' removed');}
   else if(m.kind==='set'){edits.push({a:m.call.range[0],b:m.call.range[1],text:current.slice(...m.call.callee.object.range)});changes.push(id+'/'+m.key+' removed');}
   else if(m.kind==='assign'&&m.parent?.type==='ExpressionStatement'){edits.push({a:m.parent.range[0],b:m.parent.range[1],text:''});changes.push(id+'/'+m.key+' removed');}
   else unresolved.push(id+'/'+m.key+' newly added unsupported '+m.kind);
  }
  for(const m of by.values()){
   if(m.kind==='field') {const end=p.value.range[1]-1;const tail=current.slice(p.value.properties.at(-1)?.range[1]||p.value.range[0]+1,end);const comma=p.value.properties.length&&!tail.includes(',')?',':'';edits.push({a:end,b:end,text:comma+b.text.slice(...m.prop.range)});changes.push(id+'/'+m.key+' restored');}
   else unresolved.push(id+'/'+m.key+' missing current '+m.kind);
  }
 }
 edits.sort((a,b)=>b.a-a.a);for(let i=1;i<edits.length;i++)if(edits[i].b>edits[i-1].a)unresolved.push('overlapping edits '+edits[i].a);
 let restored=current;for(const e of edits)restored=restored.slice(0,e.a)+e.text+restored.slice(e.b);
 let rulesEqual=false;try{rulesEqual=rules(current)===rules(restored);}catch(e){unresolved.push('parse candidate: '+e.message);}
 if(!rulesEqual)unresolved.push('non-AI AST mismatch');
 const restoredContainers=containers(restored,file);
 for(const [group,p]of restoredContainers)for(const entry of p.properties){const id=group+'/'+keyOf(entry);const reference=baselineMap.get(id)||(['skill/csh_juwei','skill/csh_chonglei'].includes(id)?fallbackMap.get(id):null);if(!reference)continue;const wanted=new Map(markers(reference.node,reference.text).map(m=>[m.key,sig(m.node)]));for(const m of markers(entry.value,restored)){if(wanted.get(m.key)!==sig(m.node))unresolved.push('AI surface verification mismatch: '+id+'/'+m.key);wanted.delete(m.key);}if(wanted.size)unresolved.push('Missing AI surfaces after rollback: '+id);}

 fs.writeFileSync(path.join(out,file.replaceAll('/','_')+'.before'),current);fs.writeFileSync(path.join(out,file.replaceAll('/','_')+'.candidate'),restored);
 reports.push({file,changedSurfaces:changes.length,changes,unresolved,newDefinitions,nonAiRulesEqual:rulesEqual});candidates.push({file,restored});
}
fs.writeFileSync(path.join(out,'rollback-plan.json'),JSON.stringify(reports,null,2));
console.log(JSON.stringify(reports.map(r=>({file:r.file,changedSurfaces:r.changedSurfaces,nonAiRulesEqual:r.nonAiRulesEqual,unresolved:r.unresolved,newDefinitions:r.newDefinitions})),null,2));
if(reports.some(r=>r.unresolved.length))throw Error('Review unresolved surfaces; no source files written');
if(apply){for(const c of candidates)fs.writeFileSync(path.join(root,c.file),c.restored);console.log('Applied AI-only historical rollback; current rules preserved.');}
