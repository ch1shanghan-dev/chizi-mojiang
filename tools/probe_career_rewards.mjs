// Actual wallet, achievement, migration and shell claim handler; isolated durable storage.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {root,parse,walk} from './lib/skill_audit.mjs';
const arg=(n,f)=>{const i=process.argv.indexOf(n);return i<0?f:process.argv[i+1];};
const src=name=>fs.readFileSync(arg('--before-dir')?path.join(arg('--before-dir'),'core_'+name+'.before'):path.join(root,'core',name),'utf8');
const clean=s=>s.replace(/^import .*?;.*\r?\n/gm,'');
const shell=src('csh_shell.js');let handler;
walk(parse(shell),n=>{if(n.type==='IfStatement'&&n.test.type==='BinaryExpression'&&n.test.left.name==='cmd'&&n.test.right.value==='shell-ach-claim')handler=shell.slice(...n.range);});
if(!handler)throw Error('actual career claim handler missing');
function storage(){const data=new Map();return {data,failKey:'',failAfter:0,writes:0,
  get length(){return data.size;},key(i){return [...data.keys()][i]??null;},getItem(k){return data.get(k)??null;},removeItem(k){data.delete(k);},
  setItem(k,v){if(k===this.failKey&&(!this.failAfter||++this.writes>=this.failAfter))throw Error('injected '+k+' failure');data.set(k,String(v));}};}
function harness(store=storage()){
  let timer=0;const timers=new Map();
  const ctx=vm.createContext({localStorage:store,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,
    lib:{config:{},configprefix:'probe_',skill:{},translate:{}},game:{saveConfig(){},addGlobalSkill(){}},ui:{},get:{},ai:{},_status:{},
    console:{log(){},warn(){},error(){}},window:{CSH:{},addEventListener(){}},document:{addEventListener(){}},
    setTimeout(fn){const n=++timer;timers.set(n,fn);return n;},clearTimeout(n){timers.delete(n);}});
  for(const f of ['csh_wallet.js','csh_achv.js','csh_migrate.js'])vm.runInContext(clean(src(f)),ctx,{filename:f});
  vm.runInContext(`var stats={rank:1},acks=[],toasts=[];
    function wallet(){return lib.cshWallet;}function buildStats(){return stats;}
    function shellToast(s){toasts.push(s);}function paintPc(){}function fmt(v){return String(v);}
    function ackToGame(cmd,ok,data){acks.push({cmd,ok,data});}
    function claim(key){var cmd='shell-ach-claim',d={key};${handler}}
  `,ctx);
  return {ctx,store,timers,W:ctx.lib.cshWallet.wallet,AC:ctx.window.CSH_ACHV,M:ctx.lib.cshMigrate,
    claim(key='rank_1'){ctx.claim(key);return ctx.acks.at(-1);},
    disk(){return JSON.parse(store.getItem('csh_wallet')||'{}');},ledger(){return JSON.parse(store.getItem('csh_ledger')||'[]');},
    flush(){ctx.lib.cshWallet.flushSave();},};
}
const results=[];async function check(name,fn){try{const v=await fn();results.push({name,passed:v===true,detail:v===true?undefined:v});}catch(e){results.push({name,passed:false,detail:e.message});}}
await check('successful host claim persists balance before ACK',()=>{const h=harness(),before=h.W.pc(),a=h.claim();return a.ok&&a.data.gained===115&&h.disk().pc===before+115;});
await check('success writes atomic claim receipt with balance',()=>{const h=harness();h.claim();return h.disk().careerClaims?.rank_1===1&&h.AC.claimed('rank_1');});
await check('native host path pays once after duplicate claim',()=>{const h=harness(),before=h.W.pc();h.claim();h.claim();h.flush();return h.W.pc()===before+115&&h.ledger().filter(e=>e.r==='成就:官阶 · 1 阶').length===1;});
await check('native host path checks real achievement predicate',()=>{const h=harness();h.ctx.stats.rank=0;const before=h.W.pc(),a=h.claim();return !a.ok&&h.W.pc()===before&&!h.AC.claimed('rank_1');});
await check('unknown achievement cannot pay',()=>{const h=harness(),before=h.W.pc();return !h.claim('missing').ok&&h.W.pc()===before;});
await check('missing wallet cannot consume claim',()=>{const h=harness();h.ctx.lib.cshWallet=null;return !h.claim().ok&&!h.AC.claimed('rank_1');});
await check('wallet write failure rejects ACK and restores memory',()=>{const h=harness(),before=h.W.pc();h.flush();h.store.failKey='csh_wallet';const a=h.claim();return !a.ok&&h.W.pc()===before&&h.disk().pc===before&&!h.AC.claimed('rank_1');});
await check('wallet write failure emits neither ledger nor success toast',()=>{const h=harness();h.store.failKey='csh_wallet';h.claim();return h.ledger().length===0&&h.ctx.toasts.length===0;});
await check('retry after failed wallet write pays once',()=>{const h=harness(),before=h.W.pc();h.store.failKey='csh_wallet';h.claim();h.store.failKey='';return h.claim().ok&&h.disk().pc===before+115;});
await check('failed legacy claim mirror does not lose durable receipt',()=>{const h=harness(),before=h.W.pc();h.store.failKey='csh_career_achv';const a=h.claim();const restart=harness(h.store);return a.ok&&restart.AC.claimed('rank_1')&&restart.W.pc()===before+115;});
await check('failed mirror and restart cannot pay twice',()=>{const h=harness(),before=h.W.pc();h.store.failKey='csh_career_achv';h.claim();h.flush();const restart=harness(h.store);restart.claim();restart.flush();return restart.W.pc()===before+115;});
await check('ledger write failure keeps durable recovery item',()=>{const h=harness();h.store.failKey='csh_ledger';const a=h.claim();return a.ok&&h.disk().careerPending?.key==='rank_1'&&h.disk().careerClaims?.rank_1===1;});
await check('ledger recovery after restart writes one receipt without another reward',()=>{const h=harness(),before=h.W.pc();h.store.failKey='csh_ledger';h.claim();h.store.failKey='';const restart=harness(h.store);restart.claim();restart.flush();return restart.W.pc()===before+115&&restart.ledger().filter(e=>e.careerTx==='rank_1').length===1&&!restart.disk().careerPending;});
await check('second claim waits while prior ledger cannot recover',()=>{const h=harness();h.ctx.stats.rank=2;h.store.failKey='csh_ledger';h.claim();const before=h.W.pc();return !h.claim('rank_2').ok&&h.W.pc()===before&&!h.AC.claimed('rank_2');});
await check('cleanup wallet failure retains already committed reward',()=>{const h=harness(),before=h.W.pc();h.store.failKey='csh_wallet';h.store.failAfter=2;const a=h.claim();return a.ok&&h.disk().pc===before+115&&h.disk().careerPending?.key==='rank_1';});
await check('cleanup failure recovery does not duplicate ledger entry',()=>{const h=harness();h.store.failKey='csh_wallet';h.store.failAfter=2;h.claim();h.store.failKey='';const restart=harness(h.store);restart.claim();return restart.ledger().filter(e=>e.careerTx==='rank_1').length===1;});
await check('old claimed-map saves remain claimed without backpay',()=>{const s=storage();s.setItem('csh_career_achv','{"rank_1":1}');const h=harness(s),before=h.W.pc();return h.claim().ok&&h.W.pc()===before&&h.AC.claimed('rank_1');});
await check('claimed-map removal cannot erase atomic receipt',()=>{const h=harness();h.claim();h.store.removeItem('csh_career_achv');return h.AC.claimed('rank_1')&&h.AC.evalAll({rank:1}).find(r=>r.key==='rank_1').claimed;});
await check('full balance keeps reward unclaimed for later',()=>{const h=harness(),cap=h.ctx.lib.cshWallet.const.PC_CAP;const raw=h.W.get();raw.pc=cap;raw.pcPeak=cap;delete raw._sig;delete raw.chain;h.store.setItem('csh_wallet',JSON.stringify(raw));const restart=harness(h.store);return !restart.claim().ok&&!restart.AC.claimed('rank_1')&&restart.W.pc()===cap;});
await check('insufficient headroom cannot silently discard partial reward',()=>{const h=harness(),cap=h.ctx.lib.cshWallet.const.PC_CAP;const raw=h.W.get();raw.pc=cap-50;raw.pcPeak=cap-50;delete raw._sig;delete raw.chain;h.store.setItem('csh_wallet',JSON.stringify(raw));const restart=harness(h.store);return !restart.claim().ok&&!restart.AC.claimed('rank_1')&&restart.W.pc()===cap-50;});
await check('export merges durable receipts into compatible old claimed map',async()=>{const h=harness();h.store.failKey='csh_career_achv';h.claim();const code=await h.M.export(),ins=await h.M.inspect(code);return ins.ok&&ins.data.achv.rank_1===1&&ins.data.wallet.careerClaims?.rank_1===1;});
await check('export flattens pending ledger exactly once',async()=>{const h=harness();h.store.failKey='csh_ledger';h.claim();const code=await h.M.export(),ins=await h.M.inspect(code);return ins.ok&&ins.data.ledger.filter(e=>e.r==='成就:官阶 · 1 阶').length===1&&!ins.data.wallet.careerPending;});
await check('import immediately adopts balance and receipt without restart',async()=>{const h=harness();h.claim();const code=await h.M.export(),target=harness();target.W.add(50,'fixture');const a=await target.M.import(code);return a.ok&&target.W.pc()===h.W.pc()&&target.AC.claimed('rank_1')&&target.disk().careerClaims?.rank_1===1;});
await check('import then claim/restart does not pay again',async()=>{const h=harness();h.claim();const code=await h.M.export(),target=harness();await target.M.import(code);target.claim();target.flush();const restart=harness(target.store);return restart.W.pc()===h.W.pc();});
await check('imported rank and task data replace old memory',async()=>{const h=harness();h.ctx.lib.cshWallet.rank.addMerit(100,'fixture');h.ctx.lib.cshWallet.task.add('hands',3);const code=await h.M.export(),target=harness();await target.M.import(code);return target.ctx.lib.cshWallet.rank.get().merit===h.ctx.lib.cshWallet.rank.get().merit&&target.ctx.lib.cshWallet.task.state().defs.find(t=>t.key==='hands').cur===3;});
await check('rollback adopts backed-up balance and claim receipts',async()=>{const h=harness();h.claim();const code=await h.M.export(),target=harness(),before=target.W.pc();const a=await target.M.import(code);const b=await target.M.rollback(a.backup);return b.ok&&target.W.pc()===before&&!target.AC.claimed('rank_1');});
await check('full reset and restart removes receipts with wallet',async()=>{const h=harness();h.claim();const r=await h.M.reset();const restart=harness(h.store);return r.ok&&restart.W.pc()===2000&&!restart.AC.claimed('rank_1');});
await check('wallet transaction preserves existing pending market checkpoint',()=>{const h=harness();h.W.commitMarket({hold:{sample:1}},-10,'金鳞市买入:fixture');h.claim();return h.disk().marketPending?.state.hold.sample===1&&h.disk().careerClaims?.rank_1===1;});
await check('achievement engine expanded definitions and empty retired set preserved',()=>{const h=harness();return h.AC.defs.length===493&&Object.keys(h.AC.RETIRED).length===0&&h.AC.selfTest().ok;});
const failures=results.filter(r=>!r.passed);console.log(JSON.stringify({passed:results.length-failures.length,failed:failures.length,failures},null,2));process.exitCode=failures.length?1:0;
