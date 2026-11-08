/* Staged, verified local update transaction. No network or disk actions until explicitly invoked. */
(function(root){
 'use strict';
 const AREA='extension/.csh-updates/chizi-mojiang',JOURNAL=AREA+'/journal.json',TARGET='extension/池子魔将/';
 const bytes=v=>v instanceof Uint8Array?v:new Uint8Array(v),encode=s=>new TextEncoder().encode(s),decode=v=>new TextDecoder().decode(v);
 function safe(rel){if(typeof rel!=='string'||!rel||rel.length>240||rel.startsWith('/')||rel.includes('\\')||rel.includes(':')||/[?#%]/.test(rel)||rel.split('/').some(s=>!s||s==='.'||s==='..')||/[\x00-\x1f]/.test(rel))throw Error('更新文件路径无效');return rel;}
 async function digest(v){if(!root.crypto||!root.crypto.subtle)throw Error('当前环境缺少文件校验能力');const hash=await root.crypto.subtle.digest('SHA-256',bytes(v));return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');}
 const LOCKS=new Set(),META='backup.json';
 const PENDING='csh_update_recovery_pending_v1';
 function isRecoveryPending(){try{return !!(root.localStorage&&root.localStorage.getItem(PENDING));}catch(e){return false;}}
 function markRecoveryPending(){try{if(root.localStorage)root.localStorage.setItem(PENDING,'1');}catch(e){}return isRecoveryPending();}
 function clearRecoveryPending(){try{if(root.localStorage)root.localStorage.removeItem(PENDING);}catch(e){}}
 const lockKey=io=>io.scope||io;
 function acquire(io){const key=lockKey(io);if(LOCKS.has(key))throw Error('更新或备份任务正在进行，请稍后再试');LOCKS.add(key);return ()=>LOCKS.delete(key);}
 const validId=id=>typeof id==='string'&&id.length<=120&&/^update-[a-zA-Z0-9-]+$/.test(id);
 function metadata(value,id){
  if(!value||value.v!==1||value.id!==id||!validId(id)||!Number.isSafeInteger(value.created)||value.created<0||!Array.isArray(value.files)||value.files.length<1||value.files.length>5000||!['staging','prepared','committed','aborted','rolledback'].includes(value.state))throw Error('备份说明无效');
  const seen=new Set();value.files.forEach(f=>{safe(f.rel);if(seen.has(f.rel)||![true,false,null].includes(f.existed))throw Error('备份内容无效');seen.add(f.rel);for(const k of ['beforeHash','nextHash'])if(f[k]!=null&&!/^[a-f0-9]{64}$/.test(f[k]))throw Error('备份摘要无效');for(const k of ['beforeSize','nextSize'])if(f[k]!=null&&(!Number.isSafeInteger(f[k])||f[k]<0))throw Error('备份大小无效');if(f.existed===true&&!f.beforeHash)throw Error('备份原文件摘要缺失');});
  if(value.cleaning!=null&&(!['bundle','next'].includes(value.cleaning.kind)||!Number.isSafeInteger(value.cleaning.started)))throw Error('备份清理凭据异常');return value;
 }
 function createBackups(io){
  const issued=new Map();let running=false;
  async function locked(fn){const release=acquire(io);running=true;try{return await fn();}finally{running=false;release();}}
  async function putMeta(id,value){const data=encode(JSON.stringify(value));await io.write(AREA+'/'+id+'/'+META,data);const got=await io.read(AREA+'/'+id+'/'+META);if(!got||await digest(got)!==await digest(data))throw Error('备份清理凭据尚未保存');}
  async function entries(dir){
   const found=[],dirs=[],todo=[{path:dir,depth:0}];let count=0;
   while(todo.length){const item=todo.pop();if(item.depth>24)throw Error('备份目录层级异常');const list=await io.list(item.path);if(!list||!Array.isArray(list.files)||!Array.isArray(list.directories))throw Error('备份目录未完整读取');
    for(const type of ['files','directories'])for(const name of list[type]){if(typeof name!=='string'||name.includes('/')||name.includes('\\'))throw Error('备份目录名称异常');safe(name);const path=item.path+'/'+name,stat=await io.stat(path);if(!stat||stat.kind!==(type==='files'?'file':'directory'))throw Error('备份目录已变化');if(++count>20000)throw Error('备份目录数量异常');if(type==='files'){if(!Number.isSafeInteger(stat.size)||stat.size<0)throw Error('备份大小未完整读取');found.push({path,size:stat.size});}else {dirs.push(path);todo.push({path,depth:item.depth+1});}}
   }return {files:found.sort((a,b)=>a.path.localeCompare(b.path)),dirs:dirs.sort((a,b)=>b.length-a.length)};
  }
  async function scan(){
   if(typeof io.list!=='function'||typeof io.stat!=='function'||typeof io.removeEmptyDirectory!=='function')throw Error('当前环境不支持安全读取和清理备份目录');
   const rawJournal=await io.read(JOURNAL);let journalId=null,blocked='';
   if(rawJournal){blocked='有未完成的更新，请先恢复后再清理';try{const j=JSON.parse(decode(rawJournal));if(validId(j.id))journalId=j.id;else blocked='更新恢复说明异常，暂不清理任何备份';}catch(e){blocked='更新恢复说明异常，暂不清理任何备份';}}
   const top=await io.list(AREA);if(!top||!Array.isArray(top.directories)||!Array.isArray(top.files))throw Error('备份目录未完整读取');const rows=[];
   for(const id of top.directories){safe(id);if(id.includes('/'))throw Error('备份目录名称异常');const tree=await entries(AREA+'/'+id),row={id,bytes:tree.files.reduce((n,f)=>n+f.size,0),beforeBytes:0,nextBytes:0,created:null,fromVersion:'',toVersion:'',state:'unknown',trusted:false,protected:true,recovering:false,reason:'缺少可核对说明，保留不清理',meta:null,metaHash:null,tree};
    for(const f of tree.files){if(f.path.startsWith(AREA+'/'+id+'/before/'))row.beforeBytes+=f.size;if(f.path.startsWith(AREA+'/'+id+'/next/'))row.nextBytes+=f.size;}
    const raw=await io.read(AREA+'/'+id+'/'+META);if(raw)try{const m=metadata(JSON.parse(decode(raw)),id),allowed=new Set([AREA+'/'+id+'/'+META]);for(const f of m.files){if(f.existed===true)allowed.add(AREA+'/'+id+'/before/'+f.rel);if(!m.nextRemoved&&f.nextHash)allowed.add(AREA+'/'+id+'/next/'+f.rel);}if(tree.files.some(f=>!allowed.has(f.path)))throw Error('有未识别内容');row.trusted=true;row.meta=m;row.metaHash=await digest(raw);row.created=m.created;row.state=m.state;row.fromVersion=typeof m.fromVersion==='string'?m.fromVersion.slice(0,40):'';row.toVersion=typeof m.toVersion==='string'?m.toVersion.slice(0,40):'';row.reason='';}catch(e){row.reason='备份说明或内容无法完整确认，保留不清理';}
    if(id===journalId){row.reason='未完成更新正在使用，保留不清理';row.protected=true;}
    rows.push(row);
   }
   for(const name of top.files){safe(name);if(name=== 'journal.json')continue;const st=await io.stat(AREA+'/'+name);if(!st||st.kind!=='file')throw Error('备份目录已变化');rows.push({id:name,bytes:st.size,beforeBytes:0,nextBytes:0,created:null,state:'unknown',trusted:false,protected:true,recovering:false,reason:'未识别的资料，保留不清理',tree:{files:[],dirs:[]}});}
   rows.sort((a,b)=>(b.created||0)-(a.created||0)||String(b.id).localeCompare(String(a.id)));return {rows,blocked,journalId,totalBytes:rows.reduce((n,r)=>n+r.bytes,0)};
  }
  async function recoverable(row){
   if(!row.trusted||row.meta.files.some(f=>typeof f.existed!=='boolean'))return false;
   for(const f of row.meta.files)if(f.existed){const data=await io.read(AREA+'/'+row.id+'/before/'+f.rel);if(!data||await digest(data)!==f.beforeHash)return false;}return true;
  }
  async function protect(state,keep){
   const managed=state.rows.filter(r=>r.trusted);let latest=null;
   /* U4 残余：无 journal 的失败组此前被永久保护，before/ 一直占空间。
      只在「确有另一个可校验回退」时开放整组清理：
        · aborted / rolledback 是明确失败，随时可清；
        · staging / prepared 但无 journal 是进程被杀留下的孤儿，给 24h 冷静期，
          避免刚中断就删掉玩家可能还想手动恢复的资料；
        · 整组清理中断（cleaning.kind==='bundle'）的组保留原重试入口，不在这里处理。
      latest 必须排除这些失败组，否则失败组自己会变成「必须保留的回退」，永远清不掉；
      排除后若没有任何可校验回退，!latest && beforeBytes>0 会把所有含原文件的组全部保住。 */
   const orphanAge=24*3600*1000;
   for(const row of managed){const st2=row.state;
    const orphan=Number.isFinite(row.created)&&row.created>0&&Date.now()-row.created>orphanAge;
    /* cleaning.kind==='bundle' 表示上次整组清理中断、部分文件已删：
       它必须能重试收尾，否则半清理状态会永久卡住。 */
    row.failedBundle=!!(!state.blocked&&row.id!==state.journalId&&
     (['aborted','rolledback'].includes(st2)||(['staging','prepared'].includes(st2)&&orphan)));}
   for(const row of managed){if(!row.failedBundle&&!['staging','prepared'].includes(row.state)&&!(row.meta.cleaning&&row.meta.cleaning.kind==='bundle')&&await recoverable(row)){latest=row.id;break;}}
   for(let i=0;i<managed.length;i++){const row=managed[i];row.recovering=!!state.blocked||row.id===state.journalId;
    row.protected=!!state.blocked||(['staging','prepared'].includes(row.state)&&!row.failedBundle)||row.id===latest||(i<keep&&!row.failedBundle)||!latest&&row.beforeBytes>0;
    row.reason=state.blocked||(['staging','prepared'].includes(row.state)&&!row.failedBundle?'更新未完成：原文件副本保留，下载副本可单独清理':'')||
     (row.id===latest?'最近可校验的回退资料，保留不清理':(i<keep&&!row.failedBundle)?'按保留组数保留':!latest&&row.beforeBytes>0?'没有其他可校验回退资料，保留不清理':'');
    if(row.failedBundle&&!row.protected&&!row.recovering&&!row.reason)row.reason='已确认失败的更新资料，可在保留可校验回退的前提下整组清理';}
   return latest;
  }
  function policy(options={}){return {keep:[1,2,3].includes(options.keep)?options.keep:2,budgetBytes:[256,512,1024].includes(options.budgetMB)?options.budgetMB*1024*1024:512*1024*1024};}
  function publicRow(row){return {id:row.id,bytes:row.bytes,beforeBytes:row.beforeBytes,nextBytes:row.nextBytes,created:row.created,fromVersion:row.fromVersion||'',toVersion:row.toVersion||'',state:row.state,trusted:row.trusted,protected:row.protected,reason:row.reason,interrupted:!!(row.meta&&row.meta.cleaning),downloadsCleanable:row.trusted&&!row.recovering&&!(row.meta&&row.meta.nextRemoved)&&(row.nextBytes>0||!!(row.meta&&row.meta.cleaning&&row.meta.cleaning.kind==='next')),bundleCleanable:!!(row.failedBundle&&!row.protected&&!row.recovering)};}
  async function inventory(options){return locked(async()=>{const s=await scan(),p=policy(options);const retained=await protect(s,p.keep);return {ok:true,blocked:s.blocked,totalBytes:s.totalBytes,rows:s.rows.map(publicRow),keep:p.keep,budgetBytes:p.budgetBytes,retained};});}
  async function fingerprint(state){return digest(encode(JSON.stringify({blocked:state.blocked,rows:state.rows.map(r=>[r.id,r.metaHash||null,r.tree.files.map(f=>[f.path,f.size])])})));}
  async function verifyTargets(row,kind){
   const expected=new Map();for(const f of row.meta.files){if(f.existed&&f.beforeHash)expected.set(AREA+'/'+row.id+'/before/'+f.rel,f.beforeHash);if(!row.meta.nextRemoved&&f.nextHash)expected.set(AREA+'/'+row.id+'/next/'+f.rel,f.nextHash);}
   const files=[];for(const entry of row.tree.files){if(entry.path===AREA+'/'+row.id+'/'+META)continue;if(kind==='next'&&!entry.path.startsWith(AREA+'/'+row.id+'/next/'))continue;const hash=expected.get(entry.path),data=await io.read(entry.path);if(!hash||!data||await digest(data)!==hash)throw Error('备份内容已变化，未清理，请重新读取');files.push({...entry,hash});}return files;
  }
  async function plan(options={}){return locked(async()=>{
   const state=await scan(),p=policy(options);if(state.blocked)throw Error(state.blocked);const retained=await protect(state,p.keep),kind=options.kind==='next'?'next':'bundle';let selected;
   if(options.ids!=null){if(!Array.isArray(options.ids)||!options.ids.length||options.ids.length>1000||options.ids.some(id=>typeof id!=='string'||!state.rows.some(r=>r.id===id)))throw Error('请选择当前可识别的备份');selected=state.rows.filter(r=>options.ids.includes(r.id));}
   else {selected=[];let total=state.totalBytes,count=state.rows.filter(r=>r.trusted).length;for(const row of state.rows.slice().reverse())if(row.trusted&&!row.protected&&(total>p.budgetBytes||count>p.keep)){selected.push(row);total-=row.bytes;count--;}}
   const jobs=[];for(const row of selected){if(!row.trusted)throw Error(row.reason||'这组资料无法核对，不能清理');if(kind==='bundle'&&(row.protected||row.recovering))throw Error(row.reason||'这组资料受保护，不能清理');
   if(kind==='bundle'&&!row.failedBundle&&['staging','prepared','aborted','rolledback'].includes(row.state))throw Error('这组更新尚未确认失败或仍在冷静期，不能整组清理；可只清理下载副本');
   if(kind==='bundle'&&row.id===retained)throw Error('最近可校验的回退资料不能清理');if(kind==='next'){const retryMeta=row.meta.cleaning&&row.meta.cleaning.kind==='next';if(row.recovering||row.meta.nextRemoved||(!(row.nextBytes>0)&&!retryMeta))throw Error('这组资料没有可清理的下载副本或正在恢复');}const files=await verifyTargets(row,kind);if(!files.length&&!(row.meta.cleaning&&row.meta.cleaning.kind===kind))continue;jobs.push({id:row.id,meta:JSON.parse(JSON.stringify(row.meta)),metaHash:row.metaHash,files,dirs:row.tree.dirs});}
   const bytes=jobs.reduce((n,j)=>n+j.files.reduce((m,f)=>m+f.size,0)+(kind==='bundle'?state.rows.find(r=>r.id===j.id).tree.files.find(f=>f.path===AREA+'/'+j.id+'/'+META).size:0),0),id='cleanup-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);issued.clear();issued.set(id,{kind,jobs,fingerprint:await fingerprint(state),policy:p,retained});return {ok:true,id,kind,groups:jobs.length,bytes,files:jobs.reduce((n,j)=>n+j.files.length,0),retained,empty:!jobs.length};
  });}
  async function cleanup(id){return locked(async()=>{
   const plan=issued.get(typeof id==='string'?id:id&&id.id);issued.clear();if(!plan)throw Error('清理预览已失效，请重新查看');const current=await scan();if(current.blocked||await fingerprint(current)!==plan.fingerprint)throw Error(current.blocked||'备份目录已变化，未清理，请重新查看');
   const retained=await protect(current,plan.policy.keep);if(plan.retained!==retained)throw Error('需要保留的回退资料已变化，请重新查看');let freedBytes=0,removedFiles=0;
   try{for(const job of plan.jobs){const row=current.rows.find(r=>r.id===job.id);if(plan.kind==='bundle'&&row&&row.beforeBytes>0&&(!retained||!await recoverable(current.rows.find(r=>r.id===retained))))throw Error('保留的回退资料已变化，未继续清理');if(!row||!row.trusted||row.recovering||plan.kind==='bundle'&&row.protected)throw Error('这组资料目前受保护或正在恢复，未继续清理');const meta=job.meta;meta.cleaning={kind:plan.kind,started:Date.now()};await putMeta(job.id,meta);
     for(const file of job.files){if(await io.read(JOURNAL))throw Error('检测到更新恢复任务，未继续清理');const raw=await io.read(file.path);if(!raw||await digest(raw)!==file.hash)throw Error('备份内容已变化，未继续清理');await io.remove(file.path);if(await io.read(file.path)!==null)throw Error('文件未能清理，请稍后重试');freedBytes+=file.size;removedFiles++;}
     if(plan.kind==='next'){meta.nextRemoved=true;meta.cleaning=null;await putMeta(job.id,meta);const dirs=job.dirs.filter(d=>d===AREA+'/'+job.id+'/next'||d.startsWith(AREA+'/'+job.id+'/next/'));for(const dir of dirs)await io.removeEmptyDirectory(dir);}
     else {const remaining=await entries(AREA+'/'+job.id);if(remaining.files.some(f=>f.path!==AREA+'/'+job.id+'/'+META))throw Error('目录出现新内容，未继续清理');const raw=await io.read(AREA+'/'+job.id+'/'+META);await io.remove(AREA+'/'+job.id+'/'+META);if(await io.read(AREA+'/'+job.id+'/'+META)!==null)throw Error('备份说明未能清理');freedBytes+=row.tree.files.find(f=>f.path===AREA+'/'+job.id+'/'+META).size;for(const dir of remaining.dirs)await io.removeEmptyDirectory(dir);await io.removeEmptyDirectory(AREA+'/'+job.id);}
   }return {ok:true,freedBytes,removedFiles};}catch(e){throw Object.assign(Error('部分清理尚未完成，请重新读取后继续'),{partial:removedFiles>0,freedBytes,removedFiles,cause:e});}
  });}
  return {inventory,plan,cleanup,status:()=>({busy:running})};
 }

 /* U3：文件接口可能永不回调。超时后**不能**宣布「未写入」并放行新任务 ——
    旧写入也许仍会发生。这里只置 uncertain，保留 journal 与事务锁，
    交给重启后的受保护恢复状态处理；迟到回调到达时也不改变这个结论。 */
 function guardIO(source,onTimeout){
  if(typeof setTimeout!=='function'||typeof clearTimeout!=='function')return source;
  const out=Object.assign({},source);
  for(const key of ['read','write','remove','list','stat','removeEmptyDirectory']){
   const fn=source[key];if(typeof fn!=='function')continue;
   out[key]=function(...args){
    return new Promise((resolve,reject)=>{
     let settled=false;
     const timer=setTimeout(()=>{
      if(settled)return;settled=true;onTimeout(key);
      reject(Object.assign(Error('文件接口超时，写入结果未知，请重启后恢复'),{uncertain:true}));
     },15000);
     Promise.resolve().then(()=>fn.apply(source,args)).then(
      v=>{if(settled)return;settled=true;clearTimeout(timer);resolve(v);},
      e=>{if(settled)return;settled=true;clearTimeout(timer);reject(e);}
     );
    });
   };
  }
  return out;
 }
 function create(rawIO){
  let busy=false,phase='idle',uncertain=false;
  const io=guardIO(rawIO,()=>{uncertain=true;});
  const note=(fn,p,n,total)=>{phase=p;if(fn)fn({phase:p,done:n,total});};
  async function put(file,data){await io.write(file,bytes(data));const saved=await io.read(file);if(!saved||await digest(saved)!==await digest(data))throw Error('文件写入校验失败：'+file);}
  async function journal(state){if(state){markRecoveryPending();await put(JOURNAL,encode(JSON.stringify(state)));}else {await io.remove(JOURNAL);if(await io.read(JOURNAL))throw Error('更新凭据未能清理');clearRecoveryPending();}}
  function validate(state){if(!state||state.v!==1||!/^update-[a-zA-Z0-9-]+$/.test(state.id)||!['prepared','committing','committed'].includes(state.phase)||!Array.isArray(state.files)||state.files.length>5000)throw Error('更新恢复凭据无效');const seen=new Set();state.files.forEach(f=>{safe(f.rel);if(seen.has(f.rel)||typeof f.existed!=='boolean'||f.existed&&!/^[a-f0-9]{64}$/.test(f.hash))throw Error('更新恢复内容无效');seen.add(f.rel);});return state;}
  async function restore(state,progress){
   validate(state);if(state.phase==='committed'){await journal(null);return {ok:true,committed:true};}if(state.phase==='prepared'){await journal(null);return {ok:true,untouched:true};}
   for(let i=state.files.length-1;i>=0;i--){const f=state.files[i];note(progress,'recovering',state.files.length-i,state.files.length);if(f.existed){const data=await io.read(AREA+'/'+state.id+'/before/'+f.rel);if(!data||await digest(data)!==f.hash)throw Error('原文件备份不可校验：'+f.rel);await put(TARGET+f.rel,data);}else {await io.remove(TARGET+f.rel);if(await io.read(TARGET+f.rel))throw Error('新增文件未能回滚：'+f.rel);}}
   await journal(null);return {ok:true,recovered:true};
  }
  async function recover(progress){if(busy)throw Error('更新任务正在进行');const release=acquire(io);busy=true;try{const raw=await io.read(JOURNAL);if(!raw)return {ok:true,empty:true};return await restore(validate(JSON.parse(decode(raw))),progress);}finally{if(!uncertain){busy=false;phase='idle';release();}}}
async function prepare(files,download,{hashes={},signal,progress,fromVersion='',toVersion=''}={}){
   if(busy)throw Error('更新任务正在进行');const release=acquire(io);busy=true;let state=null,meta=null;
   const cancelled=()=>{if(signal&&signal.aborted)throw Error('下载已取消，原安装未改动');};
   try{
    const existing=await io.read(JOURNAL);if(existing)await restore(validate(JSON.parse(decode(existing))),progress);
    const list=Array.from(new Set(files.map(safe)));if(!list.length||list.length>5000)throw Error('更新清单数量无效');
    const id='update-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),staged=new Map();let index=0,done=0;
    if(await io.read(AREA+'/'+id+'/'+META))throw Error('更新备份目录已存在，请重新尝试');
    meta={v:1,id,created:Date.now(),state:'staging',fromVersion:String(fromVersion).slice(0,40),toVersion:String(toVersion).slice(0,40),files:list.map(rel=>({rel,existed:null,beforeHash:null,beforeSize:null,nextHash:/^[a-f0-9]{64}$/.test(hashes[rel]||'')?hashes[rel]:null,nextSize:null}))};
    await put(AREA+'/'+id+'/'+META,encode(JSON.stringify(meta)));
    let downloadError=null;const worker=async()=>{while(index<list.length&&!downloadError){cancelled();const rel=list[index++];try{const data=bytes(await download(rel,signal));cancelled();if(!data.length)throw Error('文件为空：'+rel);const hash=await digest(data);if(hashes[rel]&&hash!==hashes[rel])throw Error('文件摘要不符：'+rel);cancelled();await put(AREA+'/'+id+'/next/'+rel,data);staged.set(rel,{hash,size:data.byteLength});note(progress,'downloading',++done,list.length);}catch(e){downloadError=Object.assign(Error("文件 "+rel+"："+errorText(e)),{file:rel,cause:e});throw downloadError;}}};
    const results=await Promise.allSettled(Array.from({length:Math.min(3,list.length)},worker));const failed=results.filter(r=>r.status==='rejected');
    if(failed.length)throw Object.assign(Error(failed.map(r=>r.reason.message).join('；')),{files:failed.map(r=>r.reason.file).filter(Boolean)});
    cancelled();
    const records=[];for(const rel of list){cancelled();const data=await io.read(TARGET+rel),record={rel,existed:data!==null,hash:data?await digest(data):null,size:data?data.byteLength:null};if(data)await put(AREA+'/'+id+'/before/'+rel,data);records.push(record);note(progress,'backing-up',records.length,list.length);}
    meta.files=records.map(f=>({rel:f.rel,existed:f.existed,beforeHash:f.hash,beforeSize:f.size,nextHash:staged.get(f.rel).hash,nextSize:staged.get(f.rel).size}));meta.state='prepared';await put(AREA+'/'+id+'/'+META,encode(JSON.stringify(meta)));
    state={v:1,id,phase:'prepared',files:records};await journal(state);
    /* 到 prepared 为止：目标目录一个字节都没改。局中可以先下载，等本局结束再 commit。 */
    return {ok:true,id,files:records,hashes,toVersion,nextHashes:Object.fromEntries([...staged].map(([rel,v])=>[rel,v.hash]))};
   }catch(error){
    if(uncertain)throw Object.assign(Error('文件接口结果未知，已保留更新凭据，请重启后恢复：'+error.message),{recovery:true,uncertain:true,cause:error});
    if(state){await journal(null);}
    throw error;
   }finally{if(!uncertain){busy=false;phase='idle';release();}}
  }
  async function commit(prepared,{progress}={}){
   if(!prepared||typeof prepared.id!=='string'||!Array.isArray(prepared.files))throw Error('待安装内容无效，请重新检查更新');
   if(busy)throw Error('更新任务正在进行');const release=acquire(io);busy=true;let state=null,committing=false;
   try{
    const raw=await io.read(JOURNAL);if(!raw)throw Error('待安装的更新凭据已不存在，请重新检查更新');
    const saved=validate(JSON.parse(decode(raw)));
    /* 先核对再赋值：token 不匹配时保留有效暂存，不能顺手把 prepared 凭据清掉。 */
    if(saved.id!==prepared.id||saved.phase!=='prepared')throw Error('待安装内容与更新凭据不一致，请重新检查更新');
    /* 安装文件落盘前必须读回启动恢复标志。失败时保留已核验的下载和凭据。 */
    if(io.requiresRecoveryMarker&&!markRecoveryPending())throw Error('无法保存更新恢复标志，安装文件尚未修改，请恢复本机存储后重试');
    state=saved;const records=state.files;
    state.phase='committing';await journal(state);committing=true;
    /* New modules first, entry metadata last. The persistent backups remain available throughout commit. */
    const ordered=records.slice().sort((a,b)=>Number(a.existed)-Number(b.existed)||Number(/^(extension\.js|info\.json|package\.js)$/.test(a.rel))-Number(/^(extension\.js|info\.json|package\.js)$/.test(b.rel)));
    for(let i=0;i<ordered.length;i++){const f=ordered[i],data=await io.read(AREA+'/'+state.id+'/next/'+f.rel);const want=prepared.nextHashes&&prepared.nextHashes[f.rel];if(!data||!want||await digest(data)!==want)throw Error('暂存文件校验失败：'+f.rel);await put(TARGET+f.rel,data);note(progress,'committing',i+1,ordered.length);}
    state.phase='committed';await journal(state);await journal(null);
    let backupNotice='';try{const metaText=await io.read(AREA+'/'+state.id+'/'+META);if(metaText){const meta=JSON.parse(decode(metaText));meta.state='committed';await put(AREA+'/'+state.id+'/'+META,encode(JSON.stringify(meta)));}}catch(e){backupNotice='更新完成，备份说明暂未更新；原文件副本仍保留';}
    return {ok:true,count:records.length,backup:AREA+'/'+state.id+'/before',backupNotice};
   }catch(error){
    if(uncertain)throw Object.assign(Error('文件接口结果未知，已保留更新凭据，请重启后恢复：'+error.message),{recovery:true,uncertain:true,cause:error});
    if(state&&state.phase==='committed')throw Object.assign(Error('文件已全部提交，更新凭据清理待恢复：'+error.message),{recovery:true,cause:error});
    if(state&&committing){try{await restore(state,progress);}catch(rollback){throw Object.assign(Error('更新未完成，原文件恢复尚未完成：'+rollback.message),{recovery:true,cause:error});}}
    else if(state){await journal(null);}
    throw error;
   }finally{if(!uncertain){busy=false;phase='idle';release();}}
  }
  async function abortPrepared(){
   if(busy)throw Error('更新任务正在进行');const release=acquire(io);busy=true;
   try{const raw=await io.read(JOURNAL);if(raw){const state=validate(JSON.parse(decode(raw)));if(state.phase!=='prepared')throw Error('更新已在提交阶段，不能取消');await journal(null);}return {ok:true};}
   finally{if(!uncertain){busy=false;phase='idle';release();}}
  }
  async function apply(files,download,opts={}){
   const prepared=await prepare(files,download,opts);
   return await commit(prepared,{progress:opts.progress});
  }
  return {apply,prepare,commit,abortPrepared,recover,status:()=>({busy,phase}),journal:JOURNAL};
 }
 function fileError(value){let e=value,seen=new Set();while(e&&typeof e==='object'&&!seen.has(e)){seen.add(e);let next=e.error||(e.target&&e.target.error);if(!next)break;e=next;}return e;}
 function errorText(value){
  const e=fileError(value),code=e&&e.code;
  const names={1:'文件或目录不存在',2:'文件访问受限，请检查存储权限',3:'操作已取消',4:'文件暂时无法读取',6:'文件不可修改，请检查存储权限',7:'文件当前状态不可写',9:'文件操作不被允许',10:'存储空间或配额不足',11:'文件路径类型不符',12:'同名文件或目录冲突',ENOENT:'文件或目录不存在',EACCES:'文件访问受限，请检查存储权限',EPERM:'文件操作权限不足',PERMISSION_DENIED:'文件访问受限，请检查存储权限',NOT_FOUND:'文件或目录不存在',ENOSPC:'存储空间不足'};
  if(code!=null&&names[code])return names[code];
  if(e&&e.name==='NotFoundError')return names[1];
  if(e&&e.name==='AbortError')return '请求已取消或超时';
  if(e&&typeof e.message==='string'&&e.message.trim())return e.message.slice(0,600);
  if(typeof e==='string'&&e.trim())return e.slice(0,600);
  if(code!=null)return '文件操作失败（代码 '+String(code).slice(0,40)+'）';
  return '操作未能完成，请检查网络连接与存储权限后重试';
 }
 function hostIO({game,lib}){
  if(!game||typeof game.readFile!=='function'||typeof game.writeFile!=='function'||typeof game.removeFile!=='function')throw Error('当前环境缺少安全更新所需的文件接口');
  const read=rel=>new Promise((resolve,reject)=>{try{safe(rel);if(lib.node&&lib.node.fs)nodePath(rel);}catch(e){reject(e);return;}game.readFile(rel,v=>resolve(bytes(v)),e=>{const cause=fileError(e);if(cause&&(cause.code==='ENOENT'||cause.code==='NOT_FOUND'||cause.code===1||cause.name==='NotFoundError'))resolve(null);else reject(Object.assign(Error('文件读取失败：'+errorText(e)),{cause:e}));});});
  const remove=async rel=>{if(await read(rel)===null)return;const base=root.localStorage&&root.localStorage.getItem('noname_inited');if(!(lib.node&&lib.node.fs)&&base&&typeof root.resolveLocalFileSystemURL==='function'){await new Promise((resolve,reject)=>root.resolveLocalFileSystemURL(base+rel,entry=>entry.remove(resolve,reject),e=>e&&e.code===1?resolve():reject(e)));return;}await new Promise((resolve,reject)=>game.removeFile(rel,e=>e&&(e.code||e instanceof Error)?reject(e):resolve()));};
  const write=async(rel,data)=>{
   const i=rel.lastIndexOf('/'),dir=rel.slice(0,i),name=rel.slice(i+1);safe(rel);
   if(lib.node&&lib.node.fs){nodePath(rel);await new Promise((resolve,reject)=>game.writeFile(data,dir,name,e=>e?reject(e):resolve()));return;}
   /* Host Cordova writer does not truncate shorter files. Use its actual root and FileWriter lifecycle. */
   const base=root.localStorage&&root.localStorage.getItem('noname_inited');if(!base||typeof root.resolveLocalFileSystemURL!=='function')throw Error('当前设备缺少可验证的文件写入接口，请使用完整包安装');
   // Some host ensureDirectory callbacks fire before recursive creation has finished.
   // Await each actual DirectoryEntry; concurrent stage workers may safely share parents.
   try{
    let entry=await new Promise((resolve,reject)=>root.resolveLocalFileSystemURL(base,resolve,reject));
    for(const part of dir.split('/'))entry=await new Promise((resolve,reject)=>entry.getDirectory(part,{create:true},resolve,reject));
    await new Promise((resolve,reject)=>entry.getFile(name,{create:true},file=>file.createWriter(writer=>{
     let truncating=false,settled=false;const fail=e=>{if(settled)return;settled=true;reject(e);};
     writer.onerror=fail;writer.onwriteend=()=>{if(settled)return;try{if(!truncating){truncating=true;writer.truncate(data.byteLength);}else {settled=true;resolve();}}catch(e){fail(e);}};
     try{writer.write(new Blob([data]));}catch(e){fail(e);}
    },reject),reject));
   }catch(e){throw Object.assign(Error('文件写入失败：'+errorText(e)),{cause:e});}
  };
  function nodePath(rel){
   safe(rel);const fs=lib.node&&lib.node.fs,path=lib.node&&lib.node.path;if(!fs||!path||typeof root.__dirname!=='string')throw Error('当前环境缺少可核对的安装目录');
   const base=fs.realpathSync(root.__dirname),target=path.resolve(base,rel);if(target!==base&&!target.startsWith(base+path.sep))throw Error('文件路径超出安装目录');let cursor=base;
   for(const part of rel.split('/')){cursor=path.join(cursor,part);try{const info=fs.lstatSync(cursor);if(info.isSymbolicLink())throw Error('备份含链接，保留不清理');}catch(e){if(e.code==='ENOENT')break;throw e;}}
   return target;
  }
  function cordovaEntry(rel){safe(rel);const base=root.localStorage&&root.localStorage.getItem('noname_inited');if(!base||typeof root.resolveLocalFileSystemURL!=='function')throw Error('当前环境不支持安全读取备份目录');return new Promise((resolve,reject)=>root.resolveLocalFileSystemURL(base+rel,resolve,e=>e&&e.code===1?resolve(null):reject(e)));}
  async function stat(rel){
   if(lib.node&&lib.node.fs){const file=nodePath(rel);try{const s=await lib.node.fs.promises.lstat(file);if(s.isSymbolicLink())throw Error('备份含链接，保留不清理');if(s.isDirectory())return {kind:'directory',size:0};if(s.isFile())return {kind:'file',size:s.size};throw Error('备份包含特殊文件，保留不清理');}catch(e){if(e.code==='ENOENT')return null;throw e;}}
   const entry=await cordovaEntry(rel);if(!entry)return null;if(entry.isDirectory)return {kind:'directory',size:0};if(!entry.isFile)throw Error('备份目录类型异常');const file=await new Promise((resolve,reject)=>entry.file(resolve,reject));if(!Number.isSafeInteger(file.size)||file.size<0)throw Error('备份大小未完整读取');return {kind:'file',size:file.size};
  }
  async function list(rel){
   if(lib.node&&lib.node.fs){const file=nodePath(rel);let names;try{names=await lib.node.fs.promises.readdir(file);}catch(e){if(e.code==='ENOENT')return {files:[],directories:[]};throw e;}const result={files:[],directories:[]};for(const name of names){safe(name);if(name.includes('/'))throw Error('备份目录名称异常');const s=await stat(rel+'/'+name);if(!s)throw Error('备份目录已变化');result[s.kind==='directory'?'directories':'files'].push(name);}return result;}
   const entry=await cordovaEntry(rel);if(!entry)return {files:[],directories:[]};if(!entry.isDirectory)throw Error('备份目录类型异常');const reader=entry.createReader(),result={files:[],directories:[]};let count=0;while(true){const batch=await new Promise((resolve,reject)=>reader.readEntries(resolve,reject));if(!Array.isArray(batch))throw Error('备份目录未完整读取');if(!batch.length)break;for(const item of batch){safe(item.name);if(item.name.includes('/')||++count>20000)throw Error('备份目录数量或名称异常');if(item.isDirectory)result.directories.push(item.name);else if(item.isFile)result.files.push(item.name);else throw Error('备份包含特殊文件，保留不清理');}}return result;
  }
  async function removeEmptyDirectory(rel){
   safe(rel);if(!rel.startsWith(AREA+'/'))throw Error('不能清理备份区以外的目录');
   if(lib.node&&lib.node.fs){const file=nodePath(rel);try{await lib.node.fs.promises.rmdir(file);}catch(e){if(e.code!=='ENOENT')throw e;}return;}
   const entry=await cordovaEntry(rel);if(!entry)return;if(!entry.isDirectory)throw Error('备份目录类型异常');await new Promise((resolve,reject)=>entry.remove(resolve,reject));
  }

  return {read,write,remove,list,stat,removeEmptyDirectory,requiresRecoveryMarker:true,scope:'host-update:'+String(root.__dirname||'cordova')};
 }
 root.CSHUpdate={create,backups:createBackups,hostIO,digest,safe,errorText,isRecoveryPending,clearRecoveryPending,recoveryJournal:JOURNAL};
})(typeof window!=='undefined'?window:globalThis);
