import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {fileURLToPath,pathToFileURL}from'node:url';
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1]},root=arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const {parse,walk}=await import(pathToFileURL(path.join(root,'tools/lib/skill_audit.mjs')));
const registry=fs.readFileSync(arg('--registry-source',path.join(root,'core/csh_registry.js')),'utf8'),shell=fs.readFileSync(path.join(root,'core/csh_shell.js'),'utf8');
const context=vm.createContext({window:{}});vm.runInContext(registry,context);const R=context.window.CSH.registry;
let fn;walk(parse(shell),n=>{if(n.type==='FunctionDeclaration'&&n.id.name==='checkOrientation')fn=shell.slice(n.start,n.end)});if(!fn)throw Error('Actual shell orientation function not found');
const rows=[],check=(name,passed)=>rows.push({name,passed:!!passed});
check('registry self test',R.selfTest().ok);
for(const key of R.all()){
 check(key+' requires landscape',R.isLandscape(key));
 const active=new Set(),ctx=vm.createContext({window:{innerWidth:390,innerHeight:844},META:{[key]:R.get(key)},document:{getElementById:()=>({classList:{add:k=>active.add(k),remove:k=>active.delete(k)}})}});vm.runInContext(fn,ctx);
 vm.runInContext('checkOrientation('+JSON.stringify(key)+')',ctx);check(key+' actual shell shows guidance in portrait',active.has('on'));
 ctx.window.innerWidth=915;ctx.window.innerHeight=412;vm.runInContext('checkOrientation('+JSON.stringify(key)+')',ctx);check(key+' actual shell clears guidance in landscape',!active.has('on'));
}
const before=arg('--before');if(before){const ctx=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(before,'utf8'),ctx);const strip=r=>r.all().map(k=>{const v=JSON.parse(JSON.stringify(r.get(k)));delete v.landscape;return v});check('all non-orientation metadata unchanged',JSON.stringify(strip(R))===JSON.stringify(strip(ctx.window.CSH.registry)));}
const result={passed:rows.filter(r=>r.passed).length,failed:rows.filter(r=>!r.passed).length,failures:rows.filter(r=>!r.passed),checks:rows};if(arg('--out'))fs.writeFileSync(arg('--out'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,checks:undefined},null,2));if(result.failed)process.exitCode=1;
