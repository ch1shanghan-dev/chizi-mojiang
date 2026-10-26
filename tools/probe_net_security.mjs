import fs from 'node:fs';import vm from 'node:vm';import {root} from './lib/skill_audit.mjs';
const code=fs.readFileSync(root+'/core/csh_net.js','utf8'),rows=[];const check=(name,v)=>rows.push({name,passed:!!v});
function client(mode='ok'){
 let calls=0,options,url,aborted=false;
 const body=mode==='oversize'?'x'.repeat(524289):mode==='badjson'?'no json':JSON.stringify({ok:true,list:[{rank:'<img src=x onerror=alert(1)>',name:'<img>',cby:-1,merit:2}],n:1});
 const window={fetch:async(u,o)=>{
  calls++;url=u;options=o;if(mode==='error')throw Error('injected');
  return {ok:mode!=='httpfail',headers:{get:()=>null},body:{getReader(){let sent=false;return {async read(){if(sent)return {done:true};sent=true;return {done:false,value:new TextEncoder().encode(body)};},async cancel(){aborted=true;}};}}};
 }};
 const ctx=vm.createContext({window,URL,TextEncoder,TextDecoder,Uint8Array,AbortController,setTimeout,clearTimeout,Number,console});vm.runInContext(code,ctx);return {N:window.CSHNet,calls:()=>calls,opts:()=>options,url:()=>url,aborted:()=>aborted};
}
const req=(c,path='/board',method='GET',body=null)=>new Promise(resolve=>{let n=0;c.N.request(path,method,body,(ok,data)=>{n++;resolve({ok,data,count:()=>n});});});
for(const bad of ['http://evil.test/board','//evil.test/girls','/admin','/girls/../admin','/board?x='+'x'.repeat(2050)]){const c=client(),r=await req(c,bad);check('reject invalid target '+bad.slice(0,25),!r.ok&&c.calls()===0);}
for(const mode of ['ok','oversize','badjson','error','httpfail']){const c=client(mode),r=await req(c);check(mode+' bounded request returns once',r.ok===(mode==='ok')&&r.count()===1);if(mode==='ok'){check('HTTPS and no ambient credentials/referrer/redirect',c.url().startsWith('https://')&&c.opts().credentials==='omit'&&c.opts().referrerPolicy==='no-referrer'&&c.opts().redirect==='error');const b=c.N.board(r.data);check('server rank/amount are typed before HTML',b.list[0].rank===0&&b.list[0].cby===0&&b.list[0].merit===2);}}
{const c=client(),r=await req(c,'/cheer','POST',{text:'x'.repeat(4097)});check('reject oversized outbound JSON',!r.ok&&!c.calls());check('girl whitelist rejects prototype and forged IDs',c.N.girls([{girl:'__proto__'},{girl:'<img>'},{girl:'csh_boss_minion_eve'}]).length===1);check('board bounded rows',c.N.board({list:Array(100).fill({name:'x'.repeat(200)})}).list.length===50&&c.N.board({list:[{name:'x'.repeat(200)}]}).list[0].name.length===40);}
const rank=fs.readFileSync(root+'/games/rank.html','utf8');check('hardware inventory is absent',!/networkInterfaces|os\.hostname|os\.cpus|os\.totalmem/.test(rank));check('untrusted rank uses HTML encoding',rank.includes('+ esc(row.rank) +'));
console.log(JSON.stringify({scope:'isolated mocked transport only; no request to production endpoint',passed:rows.filter(x=>x.passed).length,failed:rows.filter(x=>!x.passed).length,failures:rows.filter(x=>!x.passed)},null,2));if(rows.some(x=>!x.passed))process.exitCode=1;
