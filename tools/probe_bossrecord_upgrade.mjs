// Actual wallet/record/migration/observer sources; disposable Chromium profile and native IDB.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openProbe} from './lib/browser_probe.mjs';
import {parse,walk,property} from './lib/skill_audit.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const opt=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const before=opt('--before');
const strip=s=>s.replace(/^import [\s\S]*?;\r?\n/gm,'').replace(/\bexport (const|function|async function) /g,'$1 ').replace(/^export default .*;\r?$/gm,'');
const sources=Object.fromEntries(['wallet','bossrecord','migrate'].map(name=>[name,strip(fs.readFileSync(before?path.join(before,'csh_'+name+'.js.before'):path.join(root,'core/csh_'+name+'.js'),'utf8'))]));
sources.roster=strip(fs.readFileSync(path.join(root,'core/csh_bossdata.js'),'utf8'));
sources.skills=strip(fs.readFileSync(before?path.join(before,'boss.js.before'):path.join(root,'skills/boss.js'),'utf8'));
const host=fs.readFileSync(path.resolve(root,'../../noname/game/index.js'),'utf8');
const start=host.indexOf('  removeExtension(extensionName, keepFile) {'),end=host.indexOf('  addRecentCharacter()',start);
if(start<0||end<0||!host.includes('game.removeExtension(name2, true)'))throw Error('Host update/removal anchor changed');
sources.remove=host.slice(start,end);
function observerOnlyChanged(){
  const baseline=opt('--scope-before',before);
  if(!baseline)return null;
  const signature=source=>{const ast=parse(source);let observer;walk(ast,n=>{if(n.type==='VariableDeclarator'&&n.id.name==='skill')observer=property(property(n.init,'csh_boss_watch'),'content');});if(!observer)throw Error('Observer AST anchor changed');return source.slice(0,observer.range[0])+'__RECORD_OBSERVER_CONTENT__'+source.slice(observer.range[1]);};
  return signature(fs.readFileSync(path.join(baseline,'boss.js.before'),'utf8'))===signature(fs.readFileSync(path.join(root,'skills/boss.js'),'utf8'));
}
const page=await openProbe('<!doctype html><meta charset="utf-8"><title>Isolated boss upgrade</title><script>globalThis.sources='+JSON.stringify(sources).replace(/<\/script/gi,'<\\/script')+';</script>',opt('--browser'));
async function setup(){
  const keys={bossKill:'extension_池子魔将_bossKill',bossAsBoss:'extension_池子魔将_bossAsBoss',bounty:'extension_池子魔将_csh_bounty'};
  const request=indexedDB.open('csh-isolated-boss-upgrade',1);
  request.onupgradeneeded=()=>{for(const k of ['config','data','image'])request.result.createObjectStore(k);};
  const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  const readAll=()=>new Promise((resolve,reject)=>{const tx=db.transaction(['config']),store=tx.objectStore('config'),out={};const req=store.openCursor();req.onsuccess=()=>{const c=req.result;if(c){out[c.key]=c.value;c.continue();}};tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(tx.error);});
  const seed=values=>new Promise((resolve,reject)=>{const tx=db.transaction(['config'],'readwrite'),store=tx.objectStore('config');store.clear();for(const [key,value]of Object.entries(values))store.put(value,key);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
  const code=data=>{const text=JSON.stringify({meta:{v:1},...data}),bytes=new TextEncoder().encode(text);let raw='';for(const b of bytes)raw+=String.fromCharCode(b);return 'CSHMIG1.'+btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');};
  async function runtime({backend='idb'}={}){
    const timers=new Set(),jobs=[],logs=[],fault={wallet:false,mirror:false,dropMirror:false,abort:false};
    const storage={getItem:k=>localStorage.getItem(k),setItem(k,v){if(fault.wallet&&k==='csh_wallet')throw Error('injected quota');localStorage.setItem(k,v);},removeItem:k=>localStorage.removeItem(k),key:i=>localStorage.key(i),get length(){return localStorage.length;}};
    const config=backend==='idb'?await readAll():JSON.parse(localStorage.getItem('isolated_config')||'{}');
    const lib={config:{...config,mode:'boss',extensions:['池子魔将'],extensionInfo:{}},configprefix:'isolated_',skill:{},translate:{},character:{}};
    Object.defineProperty(lib.config.extensions,'remove',{value(name){const i=this.indexOf(name);if(i>=0)this.splice(i,1);}});
    if(backend==='idb')lib.db={transaction(stores,access){const tx=db.transaction(stores,access);if(fault.abort&&access==='readwrite'){const get=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=get(name),put=store.put.bind(store);store.put=(...args)=>{const req=put(...args);req.addEventListener('success',()=>tx.abort());return req;};return store;};}return tx;}};
    const status={},trigger={player:null};
    const game={online:false,me:{name:'challenger'},bossinfo:{},players:[],dead:[],roundNumber:4,hasPlayer(){return false;},over(){this.overCalls=(this.overCalls||0)+1;return 'over';},log(...args){logs.push(args.join(' '));},
      saveConfig(k,v){if(fault.mirror)throw Error('injected config refusal');v===undefined?delete lib.config[k]:lib.config[k]=v;if(fault.dropMirror)return;
        if(backend==='idb')jobs.push(new Promise((resolve,reject)=>{const tx=db.transaction(['config'],'readwrite'),s=tx.objectStore('config');v===undefined?s.delete(k):s.put(v,k);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);}));
        else{const all=JSON.parse(localStorage.getItem('isolated_config')||'{}');v===undefined?delete all[k]:all[k]=v;localStorage.setItem('isolated_config',JSON.stringify(all));}},
      saveConfigValue(k){this.saveConfig(k,lib.config[k]);},deleteDB(store,k){jobs.push(new Promise((resolve,reject)=>{const tx=db.transaction([store],'readwrite');tx.objectStore(store).delete(k);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);}));}};
    const win={CSH:{},addEventListener(){}},doc={addEventListener(){},hidden:false,visibilityState:'visible'};
    const schedule=(fn,ms)=>{const timer=setTimeout(()=>{timers.delete(timer);fn();},ms);timers.add(timer);return timer;};
    const names=['lib','game','_status','localStorage','window','document','setTimeout','clearTimeout','ui','get','ai','trigger'];
    const args=[lib,game,status,storage,win,doc,schedule,clearTimeout,{},{},{},trigger];
    new Function(...names,sources.wallet)(...args);
    new Function(...names,sources.migrate)(...args);
    const R=new Function(...names,sources.roster+'\n'+sources.bossrecord+'\ninstallBossRecord();return {bid:allBossIds()[0],mid:allMinionIds()[0],tier:tierOf("csh_"+allBossIds()[0].slice(9))};')(...args);
    game.boss={name:R.bid,isAlive:()=>false};
    const watch=new Function(...names,sources.skills+'\nreturn skill.csh_boss_watch;')(...args);
    const remove=new Function('lib','game','localStorage','return ({'+sources.remove+'}).removeExtension;')(lib,game,storage);
    return {lib,game,status,trigger,R,watch,fault,logs,api:lib.cshBossRecord,W:lib.cshWallet.wallet,M:lib.cshMigrate,
      disk:()=>JSON.parse(localStorage.getItem('csh_wallet'))||{},
      async remove(){remove('池子魔将',true);await Promise.all(jobs);},async done(){await Promise.all(jobs);},
      stop(){for(const timer of timers)clearTimeout(timer);}};
  }
  globalThis.fixture={keys,db,readAll,seed,code,runtime};
}
const scope=observerOnlyChanged(),rows=scope===null?[]:[{name:'all skill/AI source outside record-observer content is byte-identical to backup',passed:scope}];
try{
  await page.evaluate('('+setup.toString()+')()');
  rows.push(...await page.evaluate(`(async()=>{
    const {keys,seed,readAll,code,runtime}=fixture,rows=[];const check=(name,value)=>rows.push({name,passed:!!value});
    const sample={map:{legacy:{n:3,first:1,last:4}},minions:{},ext:{},extPool:{}};
    localStorage.clear();await seed({[keys.bossKill]:sample,[keys.bossAsBoss]:{win:4,lose:2},[keys.bounty]:'csh_boss_minion_eve'});
    let h=await runtime(),balance=h.W.pc(),saved=h.disk().bossSaved;
    check('startup durably preserves all three legacy config domains',saved?.bossKill?.map?.legacy?.n===3&&saved.bossAsBoss.win===4&&saved.bounty==='csh_boss_minion_eve');
    check('startup preservation never grants CBY or mutates original config',h.W.pc()===2000&&JSON.stringify(h.lib.config[keys.bossKill])===JSON.stringify(sample));
    await h.remove();const removed=await readAll();
    check('actual host ZIP removal deletes all three extension config keys',Object.values(keys).every(k=>!Object.hasOwn(removed,k)&&!Object.hasOwn(h.lib.config,k)));
    check('actual host ZIP removal preserves wallet backup',h.disk().bossSaved?.bossKill?.map?.legacy?.n===3);
    h.stop();h=await runtime();
    check('fresh runtime reads ZIP-cleared hunt and as-boss records',h.api.read().map.legacy?.n===3&&h.api.summary().asBoss.win===4);
    check('fresh runtime reads ZIP-cleared bounty without granting money',h.api.bountyGet()==='csh_boss_minion_eve'&&h.W.pc()===balance);
    const copied=h.W.bossSaved?.();if(copied?.bossKill)copied.bossKill.map.legacy.n=99;
    check('public saved snapshot cannot mutate persisted backup',h.disk().bossSaved?.bossKill?.map?.legacy?.n===3);
    h.fault.dropMirror=true;h.api.recordMinion(h.R.mid);h.lib.cshWallet.flushSave();h.stop();h=await runtime();
    check('accepted hunt survives restart when async config mirror never persists',h.api.read().minions[h.R.mid]?.n===1&&h.W.pc()===balance+800);
    h.fault.mirror=true;const as=h.api.recordAsBoss(true);
    check('synchronous mirror failure retains durably accepted as-boss record',as?.win===5&&h.disk().bossSaved?.bossAsBoss?.win===5);
    h.stop();h=await runtime();check('mirror failure remains visible after restart',h.api.summary().asBoss.win===5);
    const old=JSON.stringify(h.api.read()),pc=h.W.pc(),merit=h.lib.cshWallet.rank.get().merit;h.fault.wallet=true;
    check('wallet quota failure refuses record before reward',h.api.recordMinion(h.R.mid)===null&&JSON.stringify(h.api.read())===old&&h.W.pc()===pc&&h.lib.cshWallet.rank.get().merit===merit);
    check('wallet quota failure refuses as-boss and bounty writes',h.api.recordAsBoss(false)===null&&!h.api.bountyClear());h.fault.wallet=false;
    const imported={map:{imported:{n:8,first:1,last:2}},minions:{},ext:{},extPool:{}};
    const result=await h.M.import(code({bossKill:imported}));
    check('hunt-only import succeeds with an existing backup',result.ok);
    check('hunt-only import immediately replaces config and durable copy',h.api.read().map.imported?.n===8&&!h.api.read().map.legacy&&h.disk().bossSaved?.bossKill?.map?.imported?.n===8&&(await readAll())[keys.bossKill]?.map?.imported?.n===8);
    check('hunt-only import retains other two backup domains',h.api.summary().asBoss.win===5&&h.api.bountyGet()==='');
    h.stop();h=await runtime();check('hunt-only import remains adopted after restart',h.api.read().map.imported?.n===8&&!h.api.read().map.legacy);
    const rollback=await h.M.rollback(result.backup);check('rollback restores matching config and durable hunt backup',rollback.ok&&h.api.read().map.legacy?.n===3&&h.disk().bossSaved?.bossKill?.map?.legacy?.n===3);
    const battle=await h.M.import(code({bossAsBoss:{win:12,lose:9},bounty:''}));
    check('as-boss and empty bounty imports replace backups',battle.ok&&h.api.summary().asBoss.win===12&&h.api.bountyGet()===''&&h.disk().bossSaved?.bounty==='');
    const exported=await h.M.inspect(await h.M.export());
    check('portable export flattens authoritative backup into original domains',exported.ok&&exported.data?.bossKill?.map?.legacy?.n===3&&exported.data?.bossAsBoss?.win===12&&exported.data?.bounty==='');
    const walletOnly=await h.M.import(code({wallet:{pc:1234,pcPeak:1234}}));
    check('wallet-only import refuses to split an existing boss reward checkpoint',!walletOnly.ok&&h.W.pc()===pc&&h.api.read().map.legacy?.n===3);
    const pair=await h.M.import(code({wallet:{...exported.data.wallet,pc:1234,pcPeak:Math.max(1234,exported.data.wallet.pcPeak||0)},rank:exported.data.rank}));
    check('paired economic import preserves unmentioned hunt/as-boss/bounty backups',pair.ok&&h.W.pc()===1234&&h.api.read().map.legacy?.n===3&&h.disk().bossSaved?.bossAsBoss?.win===12&&h.disk().bossSaved?.bounty==='');
    h.lib.cshWallet.flushSave();const original=localStorage.getItem('csh_wallet');h.fault.abort=true;
    const failure=await h.M.import(code({bossAsBoss:{win:99,lose:99}}));
    const journal=JSON.parse(localStorage.getItem('csh_migrate_recovery')||'null');
    check('native config transaction abort preserves exact pre-import wallet in journal',!failure.ok&&journal?.local?.csh_wallet===original);
    h.fault.abort=false;const recovered=await h.M.recover();
    check('recovery restores exact wallet and prior battle result',recovered.ok&&localStorage.getItem('csh_wallet')===original&&h.api.summary().asBoss.win===12);
    h.fault.wallet=true;h.trigger.player=h.game.boss;h.watch.content();
    check('observer refuses completion marker when durable save fails',!h.game.boss._cshBossRecorded);h.fault.wallet=false;
    h.watch.content();const count=h.api.read().map[h.R.bid]?.n;h.watch.content();h.game.over();
    check('observer and native over share completion marker after acceptance',h.game.boss._cshBossRecorded===true&&count===1&&h.api.read().map[h.R.bid]?.n===1&&h.game.overCalls===1);
    for(const win of [false,true]){
      h.game.boss={name:h.R.bid,isAlive:()=>win};h.game.me=h.game.boss;h.trigger.player=win?{name:'challenger'}:h.game.boss;
      const before=h.api.summary().asBoss,field=win?'win':'lose';h.fault.wallet=true;h.watch.content();
      check('as-boss '+field+' observer does not consume marker on save failure',!h.game.boss._cshBossRecorded&&h.api.summary().asBoss[field]===before[field]);
      h.fault.wallet=false;h.watch.content();h.watch.content();h.game.over();
      check('as-boss '+field+' observer and over record accepted result exactly once',h.game.boss._cshBossRecorded===true&&h.api.summary().asBoss[field]===before[field]+1);
    }
    const reset=await h.M.reset();h.stop();h=await runtime();
    check('explicit reset removes all backups without reviving hunts on restart',reset.ok&&!h.disk().bossSaved&&Object.keys(h.api.read().map).length===0&&h.api.summary().asBoss.win===0&&h.api.bountyGet()==='');
    h.stop();localStorage.clear();await seed({});
    localStorage.setItem(keys.bossKill,JSON.stringify(sample));localStorage.setItem(keys.bossAsBoss,JSON.stringify({win:7,lose:3}));
    h=await runtime();check('same-key legacy localStorage records are preserved on install',h.api.read().map.legacy?.n===3&&h.disk().bossSaved?.bossAsBoss?.win===7);
    h.stop();localStorage.clear();await seed({[keys.bossKill]:{...sample,minions:[]}});h=await runtime();
    check('malformed original config is retained without creating empty backup',Array.isArray((await readAll())[keys.bossKill].minions)&&!h.disk().bossSaved&&h.api.recordMinion(h.R.mid)===null);
    h.stop();localStorage.clear();await seed({[keys.bossKill]:sample,[keys.bossAsBoss]:{win:13,lose:2},[keys.bounty]:'csh_boss_minion_ada'});
    localStorage.setItem('csh_migrate_recovery','broken recovery journal');h=await runtime();
    const frozen=localStorage.getItem('csh_wallet');
    check('startup recovery lock prevents initial backup creation',!h.disk().bossSaved);
    check('real shared recovery guard rejects record/as-boss/bounty mutations',h.api.recordMinion(h.R.mid)===null&&h.api.recordAsBoss(true)===null&&!h.api.bountySet(h.R.mid).ok&&!h.api.bountyClear()&&localStorage.getItem('csh_wallet')===frozen);
    h.trigger.player=h.game.boss;h.watch.content();h.game.over();
    check('observer and over keep native termination and marker available under recovery lock',!h.game.boss._cshBossRecorded&&h.game.overCalls===1&&localStorage.getItem('csh_wallet')===frozen);
    localStorage.removeItem('csh_migrate_recovery');const afterUnlock=h.api.recordMinion(h.R.mid);
    check('first new write after recovery preserves all previously frozen legacy domains',afterUnlock?.n===1&&h.disk().bossSaved?.bossAsBoss?.win===13&&h.disk().bossSaved?.bounty==='csh_boss_minion_ada');
    h.stop();localStorage.clear();await seed({[keys.bossKill]:sample});
    localStorage.setItem('csh_wallet',JSON.stringify({pc:2000,pcPeak:2000,bossSaved:{bossKill:null}}));h=await runtime();
    let rejected=false;try{h.api.read();}catch{rejected=true;}
    check('malformed durable domain refuses empty substitution and keeps original config',rejected&&h.api.recordMinion(h.R.mid)===null&&(await readAll())[keys.bossKill].map.legacy.n===3&&h.disk().bossSaved?.bossKill===null);
    const badExport=await h.M.export().then(()=>false,()=>true);
    check('malformed durable domain refuses portable export instead of erasing hunt data',badExport);
    h.stop();localStorage.clear();await seed({});localStorage.setItem('isolated_config',JSON.stringify({[keys.bossKill]:sample,[keys.bossAsBoss]:{win:6,lose:2},[keys.bounty]:'csh_boss_minion_eve'}));
    h=await runtime({backend:'local'});await h.remove();h.stop();h=await runtime({backend:'local'});
    check('native localStorage config fallback survives actual ZIP clearing',h.api.read().map.legacy?.n===3&&h.api.summary().asBoss.win===6&&h.api.bountyGet()==='csh_boss_minion_eve');
    const localImport=await h.M.import(code({bossAsBoss:{win:15,lose:4}}));h.stop();h=await runtime({backend:'local'});
    check('fallback backend partial import stays adopted after restart',localImport.ok&&h.api.summary().asBoss.win===15&&h.disk().bossSaved?.bossAsBoss?.win===15);
    localStorage.setItem('probe_expected',JSON.stringify({win:15,legacy:3,pc:h.W.pc()}));h.stop();fixture.db.close();return rows;
  })()`));
  const marker=await page.evaluate('globalThis.__oldDocument=crypto.randomUUID()');await page.send('Page.reload');
  for(let i=0;i<160;i++){if(await page.evaluate('document.readyState==="complete"&&!!globalThis.sources&&globalThis.__oldDocument!=='+JSON.stringify(marker)))break;await new Promise(r=>setTimeout(r,20));}
  await page.evaluate('('+setup.toString()+')()');
  rows.push(await page.evaluate(`(async()=>{const expected=JSON.parse(localStorage.getItem('probe_expected')),h=await fixture.runtime({backend:'local'});const passed=h.api.summary().asBoss.win===expected.win&&h.api.read().map.legacy?.n===expected.legacy&&h.W.pc()===expected.pc;h.stop();fixture.db.close();return {name:'whole Chromium document reload preserves backup and imported result',passed};})()`));
}finally{await page.close();}
const failures=rows.filter(r=>!r.passed),result={scope:'actual sources and host removeExtension, disposable Chromium native IDB/LS; synthetic observer event, no player profile/BOSS match',passed:rows.length-failures.length,failed:failures.length,failures,checks:rows};
if(opt('--out'))fs.writeFileSync(opt('--out'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,checks:undefined},null,2));process.exitCode=failures.length?1:0;
