import fs from 'node:fs';import path from 'node:path';import{spawnSync}from'node:child_process';import{fileURLToPath}from'node:url';import{auditTempRoot,removeAuditScratch}from'./lib/audit_scratch.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out='D:/CodexWork/chizi-mojiang/work/backlog-quote-20261103/accepted';fs.mkdirSync(out,{recursive:true});const tmp=fs.mkdtempSync(path.join(auditTempRoot(),'csh-market-quote-'));
try{
let src=fs.readFileSync(path.join(root,'tools/probe_market_persistence.mjs'),'utf8').split('// Negative baseline:')[0];
src+=`
for(const price of [1000.49,1000.51,50.01])for(const cut of [0,0.003,0.007])for(const n of [1,10,50]) {
 const seed={v:1,day:'2026-10-21',dayNo:0,prices:{sample:price},hold:{sample:100},cost:{sample:10000},gift:true,earned:0,pendingDiv:0,tips:[]};
 const h=harness(new Map(),new Map([[key,seed]]));h.W.add(1000000,'fixture');h.lib.cshWallet.flushSave();h.lib.cshAffection={feeDiscount:()=>cut};
 const before=h.W.pc(),q=h.market.snapshot().list[0].quote,fee=0.02-cut;
 check('raw price and true discount '+price+'/'+cut+'/'+n,q?.unitPrice===price&&q?.feeRate===fee);
 const buy=Math.round(q.unitPrice*n*(1+q.feeRate));const br=h.market.trade(id,n,'buy');await h.settle();
 check('buy estimate equals actual wallet debit '+price+'/'+cut+'/'+n,br.ok&&before-h.W.pc()===buy);
 const after=h.W.pc(),sell=Math.round(q.unitPrice*n*(1-q.feeRate));const sr=h.market.trade(id,n,'sell');await h.settle();
 check('sell estimate equals actual wallet credit '+price+'/'+cut+'/'+n,sr.ok&&h.W.pc()-after===sell);
}
const failures=rows.filter(x=>!x.passed);const result={scope:'real market/wallet functions with isolated saves; quote compared against actual wallet deltas',passed:rows.length-failures.length,failed:failures.length,failures};console.log(JSON.stringify(result));if(failures.length)process.exitCode=1;
`;
const runner=path.join(tmp,'source.mjs');fs.writeFileSync(runner,src);const r=spawnSync(process.execPath,[runner,'--root',root],{cwd:root,encoding:'utf8',windowsHide:true});if(r.status)throw Error(r.stdout+'\n'+r.stderr);fs.writeFileSync(path.join(out,'source.json'),r.stdout);console.log(r.stdout.trim());
const before=fs.readFileSync('D:/CodexWork/chizi-mojiang/work/backlog-quote-20261103/before/csh_market.js','utf8'),after=fs.readFileSync(path.join(root,'core/csh_market.js'),'utf8');const trade=s=>s.slice(s.indexOf('export function trade('),s.indexOf('/* ---------- 安装',s.indexOf('export function trade(')));if(trade(before)!==trade(after))throw Error('trade function changed');console.log('Original trade implementation preserved exactly.');
}finally{removeAuditScratch(tmp)}
