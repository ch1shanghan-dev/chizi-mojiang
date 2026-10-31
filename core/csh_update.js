/* Staged, verified local update transaction. No network or disk actions until explicitly invoked. */
(function(root){
 'use strict';
 const AREA='extension/.csh-updates/chizi-mojiang',JOURNAL=AREA+'/journal.json',TARGET='extension/池子魔将/';
 const bytes=v=>v instanceof Uint8Array?v:new Uint8Array(v),encode=s=>new TextEncoder().encode(s),decode=v=>new TextDecoder().decode(v);
 function safe(rel){if(typeof rel!=='string'||!rel||rel.length>240||rel.startsWith('/')||rel.includes('\\')||rel.includes(':')||/[?#%]/.test(rel)||rel.split('/').some(s=>!s||s==='.'||s==='..')||/[\x00-\x1f]/.test(rel))throw Error('更新文件路径无效');return rel;}
 async function digest(v){if(!root.crypto||!root.crypto.subtle)throw Error('当前环境缺少文件校验能力');const hash=await root.crypto.subtle.digest('SHA-256',bytes(v));return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');}
 function create(io){
  let busy=false,phase='idle';
  const note=(fn,p,n,total)=>{phase=p;if(fn)fn({phase:p,done:n,total});};
  async function put(file,data){await io.write(file,bytes(data));const saved=await io.read(file);if(!saved||await digest(saved)!==await digest(data))throw Error('文件写入校验失败：'+file);}
  async function journal(state){if(state)await put(JOURNAL,encode(JSON.stringify(state)));else {await io.remove(JOURNAL);if(await io.read(JOURNAL))throw Error('更新凭据未能清理');}}
  function validate(state){if(!state||state.v!==1||!/^update-[a-zA-Z0-9-]+$/.test(state.id)||!['prepared','committing','committed'].includes(state.phase)||!Array.isArray(state.files)||state.files.length>5000)throw Error('更新恢复凭据无效');const seen=new Set();state.files.forEach(f=>{safe(f.rel);if(seen.has(f.rel)||typeof f.existed!=='boolean'||f.existed&&!/^[a-f0-9]{64}$/.test(f.hash))throw Error('更新恢复内容无效');seen.add(f.rel);});return state;}
  async function restore(state,progress){
   validate(state);if(state.phase==='committed'){await journal(null);return {ok:true,committed:true};}if(state.phase==='prepared'){await journal(null);return {ok:true,untouched:true};}
   for(let i=state.files.length-1;i>=0;i--){const f=state.files[i];note(progress,'recovering',state.files.length-i,state.files.length);if(f.existed){const data=await io.read(AREA+'/'+state.id+'/before/'+f.rel);if(!data||await digest(data)!==f.hash)throw Error('原文件备份不可校验：'+f.rel);await put(TARGET+f.rel,data);}else {await io.remove(TARGET+f.rel);if(await io.read(TARGET+f.rel))throw Error('新增文件未能回滚：'+f.rel);}}
   await journal(null);return {ok:true,recovered:true};
  }
  async function recover(progress){if(busy)throw Error('更新任务正在进行');busy=true;try{const raw=await io.read(JOURNAL);if(!raw)return {ok:true,empty:true};return await restore(validate(JSON.parse(decode(raw))),progress);}finally{busy=false;phase='idle';}}
  async function apply(files,download,{hashes={},signal,progress}={}){
   if(busy)throw Error('更新任务正在进行');busy=true;let state=null,committing=false;
   const cancelled=()=>{if(signal&&signal.aborted)throw Error('下载已取消，原安装未改动');};
   try{
    const existing=await io.read(JOURNAL);if(existing)await restore(validate(JSON.parse(decode(existing))),progress);
    const list=Array.from(new Set(files.map(safe)));if(!list.length||list.length>5000)throw Error('更新清单数量无效');
    const id='update-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),staged=new Map();let index=0,done=0;
    let downloadError=null;const worker=async()=>{while(index<list.length&&!downloadError){cancelled();const rel=list[index++];try{const data=bytes(await download(rel,signal));cancelled();if(!data.length)throw Error('文件为空：'+rel);const hash=await digest(data);if(hashes[rel]&&hash!==hashes[rel])throw Error('文件摘要不符：'+rel);cancelled();await put(AREA+'/'+id+'/next/'+rel,data);staged.set(rel,{hash});note(progress,'downloading',++done,list.length);}catch(e){downloadError=Object.assign(Error("文件 "+rel+"："+String(e.message||e)),{file:rel,cause:e});throw downloadError;}}};
    const results=await Promise.allSettled(Array.from({length:Math.min(3,list.length)},worker));const failed=results.filter(r=>r.status==='rejected');if(failed.length)throw Object.assign(Error(failed.map(r=>r.reason.message).join('；')),{files:failed.map(r=>r.reason.file).filter(Boolean)});cancelled();
    const records=[];for(const rel of list){cancelled();const data=await io.read(TARGET+rel),record={rel,existed:data!==null,hash:data?await digest(data):null};if(data)await put(AREA+'/'+id+'/before/'+rel,data);records.push(record);note(progress,'backing-up',records.length,list.length);}
    state={v:1,id,phase:'prepared',files:records};await journal(state);cancelled();state.phase='committing';await journal(state);committing=true;
    /* New modules first, entry metadata last. The persistent backups remain available throughout commit. */
    const ordered=records.slice().sort((a,b)=>Number(a.existed)-Number(b.existed)||Number(/^(extension\.js|info\.json|package\.js)$/.test(a.rel))-Number(/^(extension\.js|info\.json|package\.js)$/.test(b.rel)));
    for(let i=0;i<ordered.length;i++){const f=ordered[i],data=await io.read(AREA+'/'+id+'/next/'+f.rel);if(!data||await digest(data)!==staged.get(f.rel).hash)throw Error('暂存文件校验失败：'+f.rel);await put(TARGET+f.rel,data);note(progress,'committing',i+1,ordered.length);}
    state.phase='committed';await journal(state);await journal(null);return {ok:true,count:list.length,backup:AREA+'/'+id+'/before'};
   }catch(error){if(state&&state.phase==='committed')throw Object.assign(Error('文件已全部提交，更新凭据清理待恢复：'+error.message),{recovery:true,cause:error});if(state&&committing){try{await restore(state,progress);}catch(rollback){throw Object.assign(Error('更新未完成，原文件恢复尚未完成：'+rollback.message),{recovery:true,cause:error});}}else if(state){await journal(null);}throw error;}
   finally{busy=false;phase='idle';}
  }
  return {apply,recover,status:()=>({busy,phase}),journal:JOURNAL};
 }
 function hostIO({game,lib}){
  if(!game||typeof game.readFile!=='function'||typeof game.writeFile!=='function'||typeof game.removeFile!=='function')throw Error('当前环境缺少安全更新所需的文件接口');
  const read=rel=>new Promise((resolve,reject)=>game.readFile(rel,v=>resolve(bytes(v)),e=>{if(e&&(e.code==='ENOENT'||e.code===1))resolve(null);else reject(e||Error('文件不可读取：'+rel));}));
  const remove=async rel=>{if(await read(rel)===null)return;const base=root.localStorage&&root.localStorage.getItem('noname_inited');if(!(lib.node&&lib.node.fs)&&base&&typeof root.resolveLocalFileSystemURL==='function'){await new Promise((resolve,reject)=>root.resolveLocalFileSystemURL(base+rel,entry=>entry.remove(resolve,reject),e=>e&&e.code===1?resolve():reject(e)));return;}await new Promise((resolve,reject)=>game.removeFile(rel,e=>e&&(e.code||e instanceof Error)?reject(e):resolve()));};
  const write=async(rel,data)=>{
   const i=rel.lastIndexOf('/'),dir=rel.slice(0,i),name=rel.slice(i+1);safe(rel);
   if(lib.node&&lib.node.fs){await new Promise((resolve,reject)=>game.writeFile(data,dir,name,e=>e?reject(e):resolve()));return;}
   /* Host Cordova writer does not truncate shorter files. Use its actual root and FileWriter lifecycle. */
   const base=root.localStorage&&root.localStorage.getItem('noname_inited');if(!base||typeof root.resolveLocalFileSystemURL!=='function')throw Error('当前设备缺少可验证的文件写入接口，请使用完整包安装');
   await new Promise((resolve,reject)=>game.ensureDirectory(dir,resolve));
   await new Promise((resolve,reject)=>root.resolveLocalFileSystemURL(base+dir,entry=>entry.getFile(name,{create:true},file=>file.createWriter(writer=>{let truncating=false;writer.onerror=reject;writer.onwriteend=()=>{if(!truncating){truncating=true;writer.truncate(data.byteLength);}else resolve();};writer.write(new Blob([data]));},reject),reject),reject));
  };
  return {read,write,remove};
 }
 root.CSHUpdate={create,hostIO,digest,safe};
})(typeof window!=='undefined'?window:globalThis);
