// Actual Chromium localStorage + IndexedDB, disposable profile and fixture balances.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openProbe } from './lib/browser_probe.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const option=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const sourceRoot=option('--root',root);
const source=Object.fromEntries(['wallet','market','migrate'].map(name=>[name,fs.readFileSync(path.join(sourceRoot,'core/csh_'+name+'.js'),'utf8').replace(/^import[^\n]*\n/gm,'').replace(/^export (const|function|async function) /gm,'$1 ')]));
const fixture=`<!doctype html><meta charset="utf-8"><title>Isolated market persistence probe</title><script>globalThis.sources=${JSON.stringify(source).replace(/<\/script/gi,'<\\/script')};</script>`;
const page=await openProbe(fixture,option('--browser',undefined));
try {
  const result=await page.evaluate(`(async function(){
    const rows=[],warnings=[],key='extension_池子魔将_goldfish',id='sample';
    const warn=console.warn;console.warn=(...args)=>{warnings.push(args.map(x=>String(x)).join(' '));warn(...args);};
    const check=(name,passed)=>rows.push({name,passed:!!passed});
    const opening=indexedDB.open('csh-isolated-market',1);opening.onupgradeneeded=()=>opening.result.createObjectStore('config');
    const db=await new Promise((resolve,reject)=>{opening.onsuccess=()=>resolve(opening.result);opening.onerror=()=>reject(opening.error);});
    const readDB=()=>new Promise((resolve,reject)=>{const request=db.transaction(['config']).objectStore('config').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const seed={v:1,day:'2026-10-21',dayNo:0,prices:{sample:1000},hold:{},cost:{},gift:true,earned:0,pendingDiv:0,tips:[]};
    async function runtime(mode){
      const timers=new Set();let abortedAfterSuccess=false,quota=false;
      const storage={getItem:k=>localStorage.getItem(k),setItem(k,v){if(quota&&k==='csh_wallet')throw new DOMException('quota','QuotaExceededError');localStorage.setItem(k,v);},removeItem:k=>localStorage.removeItem(k),key:n=>localStorage.key(n),get length(){return localStorage.length;}};
      const lib={config:{[key]:await readDB()||structuredClone(seed)},configprefix:'isolated_',skill:{},translate:{},db:{transaction(stores,access){
        const tx=db.transaction(stores,access);
        if(mode==='abort-after-request'){
          const objectStore=tx.objectStore.bind(tx);tx.objectStore=function(name){const store=objectStore(name),put=store.put.bind(store);store.put=function(...args){const request=put(...args);request.addEventListener('success',()=>{abortedAfterSuccess=true;tx.abort();});return request;};return store;};
        }return tx;
      }}};
      window.CSH={};const game={saveConfig(k,v){lib.config[k]=v;}};
      const schedule=(fn,ms)=>{const timer=setTimeout(()=>{timers.delete(timer);fn();},ms);timers.add(timer);return timer;};
      const args=['lib','game','ui','get','ai','_status','localStorage','MINIONS','MINION_POOL','MINION_NAMES','setTimeout','clearTimeout'];
      const values=[lib,game,{},{},{},{},storage,{sample:{name:'Sample'}},[id],{sample:'Sample'},schedule,clearTimeout];
      new Function(...args,sources.wallet)(...values);
      const market=new Function(...args,sources.market+';installMarket();return {trade,ensureDay,snapshot,syncPending};')(...values);
      new Function(...args,sources.migrate)(...values);
      return {lib,market,W:lib.cshWallet.wallet,stop(){for(const t of timers)clearTimeout(t);},quota(v){quota=v;},aborted(){return abortedAfterSuccess;}};
    }
    let h=await runtime('abort-after-request');h.W.add(20000,'fixture');h.lib.cshWallet.flushSave();const before=h.W.pc();
    check('native IDB aborted buy has durable wallet checkpoint',h.market.trade(id,2,'buy').ok);await h.market.syncPending();
    check('native request success then transaction abort was exercised',h.aborted());
    check('aborted IDB transaction has no committed market record',!(await readDB()));
    check('abort retains checkpoint with purchased stock',JSON.parse(localStorage.getItem('csh_wallet')).marketPending.state.hold[id]===2);
    h.stop();h=await runtime('complete');await h.market.syncPending();
    check('fresh runtime recovers stock from real localStorage',h.market.snapshot().list[0].hold===2);
    check('fresh runtime does not debit twice',h.W.pc()===before-2040);
    check('recovery commits real IDB record before clearing checkpoint',(await readDB()).hold[id]===2&&!h.W.marketPending());
    const pc=h.W.pc();h.quota(true);check('wallet quota rejects native-storage sell',!h.market.trade(id,1,'sell').ok);
    check('quota leaves stock and balance unchanged',h.market.snapshot().list[0].hold===2&&h.W.pc()===pc);
    h.quota(false);check('sell retry is accepted',h.market.trade(id,1,'sell').ok);await h.market.syncPending();
    check('native IDB sell commits stock and balance once',(await readDB()).hold[id]===1&&h.W.pc()===pc+980);
    const exported=h.lib.cshMigrate._collect();check('migration exports recovered native config',exported.goldfish.hold[id]===1);
    h.stop();db.close();const failures=rows.filter(x=>!x.passed);return {scope:'real Chromium localStorage/IndexedDB, isolated profile; no Noname or player saves',passed:rows.length-failures.length,failed:failures.length,failures,...(failures.length?{warnings}:{})};
  })()`);
  console.log(JSON.stringify(result,null,2));process.exitCode=result.failed?1:0;
} finally {await page.close();}
