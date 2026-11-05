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
/* 2026-11-05：宿主环境的批量删除保护 / Windows 文件占用可能拒绝递归删除。
   清理失败不应推翻已经跑完的检查结论；路径校验失败仍然照抛。 */
function cleanupBlocked(e){return /SAFE_DELETE_BULK_CONFIRM_REQUIRED|EPERM|EBUSY|ENOTEMPTY|safe-delete|trash|Some operations were aborted/i.test(String(e&&e.message||e));}
function warnCleanup(target,e){console.warn('[audit-scratch] 临时目录未能删除（不影响检查结论）：'+target+' · '+(e&&e.message||e));}
export function removeAuditScratch(dir){
 const target=checked(dir);
 try{fs.rmSync(target,{recursive:true,force:true,maxRetries:6,retryDelay:100});}
 catch(e){if(!cleanupBlocked(e))throw e;warnCleanup(target,e);}
}
export async function disposeAuditBrowser(proc,dir){
 const target=checked(dir);
 if(proc&&proc.exitCode===null&&proc.signalCode===null){
  const exited=new Promise(resolve=>{const timer=setTimeout(resolve,2000);proc.once('exit',()=>{clearTimeout(timer);resolve();});});
  proc.kill();await exited;
 }
 try{await fs.promises.rm(target,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
 catch(e){if(!cleanupBlocked(e))throw e;warnCleanup(target,e);}
}