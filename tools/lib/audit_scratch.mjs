// Project test scratch only. Windows tests never write profiles to the system drive.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
export function auditTempRoot(){
 const root=path.resolve(process.env.CSH_AUDIT_TEMP||(process.platform==='win32'?'D:/CodexWork/chizi-mojiang/temp':path.join(os.tmpdir(),'chizi-mojiang-audit')));
 if(process.platform==='win32'&&path.parse(root).root.toUpperCase()==='C:\\')throw Error('CSH_AUDIT_TEMP must be outside C:');
 fs.mkdirSync(root,{recursive:true});
 if(process.platform==='win32'&&path.parse(fs.realpathSync(root)).root.toUpperCase()==='C:\\')throw Error('Audit scratch resolves to C:');
 if(process.platform==="win32"){process.env.TEMP=root;process.env.TMP=root;}
 return root;
}
function checked(dir){
 const root=fs.realpathSync(auditTempRoot()),target=path.resolve(dir),rel=path.relative(root,target);
 if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('Refusing to remove non-scratch path');
 if(fs.existsSync(target)){const real=fs.realpathSync(target),r=path.relative(root,real);if(!r||r==='..'||r.startsWith('..'+path.sep)||path.isAbsolute(r))throw Error('Scratch path escapes its root');}
 return target;
}
export function removeAuditScratch(dir){fs.rmSync(checked(dir),{recursive:true,force:true,maxRetries:6,retryDelay:100});}
export async function disposeAuditBrowser(proc,dir){
 checked(dir);
 if(proc&&proc.exitCode===null&&proc.signalCode===null){
  const exited=new Promise(resolve=>{const timer=setTimeout(resolve,2000);proc.once('exit',()=>{clearTimeout(timer);resolve();});});
  proc.kill();await exited;
 }
 await fs.promises.rm(checked(dir),{recursive:true,force:true,maxRetries:8,retryDelay:100});
}