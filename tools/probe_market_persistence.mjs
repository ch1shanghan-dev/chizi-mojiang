// Real wallet/market/migration functions, isolated durable maps and IDB faults. No player saves.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
const option = (key, fallback) => { const i = process.argv.indexOf(key); return i < 0 ? fallback : process.argv[i + 1]; };
const root = path.resolve(option('--root', path.join(path.dirname(fileURLToPath(import.meta.url)), '..')));
const key = 'extension_池子魔将_goldfish', id = 'sample';
const clone = x => JSON.parse(JSON.stringify(x));
const rows = [];
function check(name, passed) { rows.push({ name, passed: !!passed }); }
function harness(durable = new Map(), database = new Map(), mode = 'complete') {
  let failKey = '', behavior = mode, timerId = 0;
  const timers = new Map(), transactions = [];
  const localStorage = { getItem: k => durable.get(k) ?? null,
    setItem(k,v) { if (k === failKey) throw Error('injected quota'); durable.set(k,String(v)); },
    removeItem: k => durable.delete(k), key: n => [...durable.keys()][n], get length() { return durable.size; } };
  const lib = { config: { [key]: clone(database.get(key) || {v:1,day:'2026-10-21',dayNo:0,prices:{sample:1000},hold:{},cost:{},gift:true,earned:0,pendingDiv:0,tips:[]}) }, configprefix:'probe_', skill:{}, translate:{} };
  lib.db = { transaction() {
    const state = { value:null, done:false, objectStore() { return { put(value) { state.value = clone(value); return {}; } }; },
      abort() { if (state.done) return; state.done = true; state.onabort?.(); } };
    state.complete = () => { if (state.done) return; state.done = true; database.set(key,state.value); state.oncomplete?.(); };
    transactions.push(state);
    if (behavior === 'complete') queueMicrotask(state.complete);
    else if (behavior === 'abort') queueMicrotask(() => state.abort());
    return state;
  } };
  const game = { saveConfig(k,v) { lib.config[k]=v; if (behavior === 'complete') queueMicrotask(() => database.set(k,clone(v))); }, addGlobalSkill() {} };
  const math = Object.create(Math); math.random = () => 0.5;
  const context = vm.createContext({ lib,game,ui:{},get:{},ai:{},_status:{},localStorage,
    MINIONS:{sample:{name:'Sample'}},MINION_POOL:[id],MINION_NAMES:{sample:'Sample'},
    console:{log(){},warn(){},error(){}},Math:math,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,
    Date:class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-21T12:00:00+08:00'])); } static now(){return 1792555200000;} },
    setTimeout(fn,ms) { const n=++timerId;timers.set(n,{fn,ms});return n; }, clearTimeout(n){timers.delete(n);},
    window:{CSH:{},addEventListener(){}},document:{addEventListener(){}} });
  for (const file of ['csh_wallet.js','csh_market.js','csh_migrate.js']) {
    const src = fs.readFileSync(path.join(root,'core',file),'utf8').replace(/^import[^\n]*\n/gm,'').replace(/^export (const|function|async function) /gm,'$1 ').replace(/^export default null;.*$/gm,'');
    vm.runInContext(src, context, {filename:file,timeout:2500});
  }
  vm.runInContext('installMarket(); globalThis.market={trade,ensureDay,snapshot,sync:typeof syncPending === "function" ? syncPending : async function(){return false;}};',context);
  return {durable,database,lib,game,context,timers,transactions,market:context.market,W:lib.cshWallet.wallet,M:lib.cshMigrate,
    fail(k){failKey=k;},mode(v){behavior=v;},
    async settle(){await Promise.resolve(); await context.market.sync();},
    async tick(){for(let i=0;i<8;i++)await Promise.resolve();},
    timeout(){for(const [n,t] of [...timers])if(t.ms===5000){timers.delete(n);t.fn();}},
    persisted(){return JSON.parse(durable.get('csh_wallet') || '{}');},
    held(){return context.market.snapshot().list[0].hold;},
  };
}
function funded(mode='complete') {
  const h=harness(undefined,undefined,mode);h.W.add(20000,'fixture');h.lib.cshWallet.flushSave();return h;
}
// Negative baseline: old write reports success after saveConfig returns undefined; restart loses stock.
{
  const h=funded('abort'), before=h.W.pc();
  check('buy accepted only with recoverable durable state',h.market.trade(id,2,'buy').ok);
  h.lib.cshWallet.flushSave();await h.settle();
  const restarted=harness(h.durable,h.database,'abort');
  check('failed config + restart keeps purchased stock',restarted.held()===2);
  check('failed config + restart keeps exactly one debit',restarted.W.pc()===before-2040);
  await restarted.tick();restarted.timeout();await restarted.settle();
}
if (process.argv.includes('--baseline-only')) {
  const failures=rows.filter(x=>!x.passed);
  console.log(JSON.stringify({passed:rows.length-failures.length,failed:failures.length,failures},null,2));
  process.exit(failures.length?1:0);
}
for (const side of ['buy','sell']) {
  const h=funded();h.market.trade(id,2,'buy');await h.settle();
  const before=h.W.pc(), held=h.held(), ledger=h.W.ledger().length;
  h.fail('csh_wallet');const result=h.market.trade(id,1,side);
  check(side+': wallet quota rejects transaction',!result.ok);
  check(side+': failed write leaves memory/stock unchanged',h.W.pc()===before&&h.held()===held);
  check(side+': failed write leaves durable balance/ledger unchanged',h.persisted().pc===before&&h.W.ledger().length===ledger);
  h.fail('');check(side+': retry succeeds',h.market.trade(id,1,side).ok);await h.settle();
  check(side+': retry moves stock once',h.held()===held+(side==='buy'?1:-1));
}
{
  const h=funded('hold'), before=h.W.pc();h.market.trade(id,2,'buy');await h.tick();
  check('request success alone retains recovery checkpoint',!!h.W.marketPending?.());
  h.market.trade(id,1,'sell');h.transactions[0].complete();await h.tick();
  check('old transaction completion does not clear newer checkpoint',h.W.marketPending?.()?.state.hold[id]===1);
  h.transactions.at(-1).complete();await h.settle();
  check('serialized latest config matches stock',h.database.get(key)?.hold[id]===1&&!h.W.marketPending?.());
  check('overlap keeps exact buy/sell balance',h.W.pc()===before-2040+980);
}
{
  const h=funded('hold');h.market.trade(id,1,'buy');await h.tick();h.timeout();await h.settle();
  check('timeout preserves durable pending stock',h.persisted().marketPending?.state.hold[id]===1);
  h.mode('complete');await h.settle();
  check('timeout retry synchronizes without another debit',h.database.get(key)?.hold[id]===1&&h.W.ledger().filter(x=>x.r.includes('买入')).length===1);
}
{
  const h=funded('abort');h.fail('csh_ledger');h.market.trade(id,1,'buy');await h.settle();
  check('failed ledger write retains receipt in wallet',!!h.persisted().marketPending?.entry);
  check('second trade waits for prior ledger recovery',!h.market.trade(id,1,'buy').ok);
  const exported=h.M._collect();
  check('export uses durable checkpoint stock',exported.goldfish.hold[id]===1);
  check('export includes pending receipt exactly once',exported.ledger.filter(x=>x.marketTx).length===1);
  check('export strips internal checkpoint from portable wallet',!h.M._clean.wallet(exported.wallet).marketPending);
  check('reset waits for pending synchronization',!h.M.reset().ok);
  check('rollback waits for pending synchronization',!h.M.rollback('missing').ok);
  h.fail('');h.mode('complete');await h.settle();await h.settle();
  check('ledger recovery writes receipt once',JSON.parse(h.durable.get('csh_ledger')).filter(x=>x.marketTx).length===1);
  check('ledger recovery clears checkpoint',!h.W.marketPending?.());
}
{
  const h=funded('abort');h.lib.config[key].gift=false;
  h.market.ensureDay();await h.settle();const after=h.W.pc();
  const r=harness(h.durable,h.database,'abort');r.market.ensureDay();await r.settle();
  check('opening gift is not paid twice after config failure/restart',r.W.pc()===after&&r.held()===0);
}
{
  const h=funded('abort');h.lib.config[key].day='2026-10-20';h.lib.config[key].hold[id]=3;h.lib.config[key].cost[id]=3000;
  const result=h.market.ensureDay();await h.settle();const after=h.W.pc();
  const r=harness(h.durable,h.database,'abort');r.market.ensureDay();await r.settle();
  check('dividend was paid',result.dividend>0);
  check('day/dividend checkpoint prevents duplicate on restart',r.W.pc()===after);
}
{
  const h=funded();h.market.trade(id,1,'buy');await h.settle();
  const before=JSON.parse(h.durable.get('csh_ledger')).filter(x=>x.marketTx).length;
  const restarted=harness(h.durable,h.database);restarted.market.trade(id,1,'buy');await restarted.settle();
  const receipts=JSON.parse(h.durable.get('csh_ledger')).filter(x=>x.marketTx);
  check('same-clock restart gives new trade a distinct durable receipt',receipts.length===before+1&&new Set(receipts.map(x=>x.marketTx)).size===receipts.length);
  check('same-clock restart keeps both purchases',restarted.held()===2);
}
{
  const h=funded('hold'),before=h.W.pc();h.market.trade(id,1,'buy');await h.tick();
  h.W.add(17,'unrelated reward');h.fail('csh_wallet');h.transactions[0].complete();await h.settle();
  check('cleanup quota retains pending checkpoint',!!h.persisted().marketPending);
  check('in-flight unrelated wallet activity is preserved',h.W.pc()===before-1020+17);
  h.fail('');h.mode('complete');await h.settle();
  check('cleanup retry saves current balance without replay',h.persisted().pc===before-1020+17&&!h.W.marketPending());
}
{
  const h=funded(),before=h.W.pc(),s=clone(h.lib.config[key]);
  for(const [amount,reason] of [[1,''],[1,'   '],[1,null],[1000000001,'fixture'],[NaN,'fixture'],[0.5,'fixture'],[-before-1,'fixture']]) {
    check('invalid commit rejects '+String(amount)+' / '+String(reason),!h.W.commitMarket(s,amount,reason).ok);
  }
  check('invalid commits preserve balance and stock',h.W.pc()===before&&h.held()===0);
}
{
  const h=funded('abort');h.lib.config[key].pendingDiv=100;
  check('pending dividend commits together with cleared payable',h.market.ensureDay().ok);await h.settle();
  const after=h.W.pc(),code=await h.M.export();
  check('pending export remains inspectable',(await h.M.inspect(code)).ok);
  check('pending import preview remains available',(await h.M.import(code,{dryRun:true})).ok);
  check('pending import cannot overwrite in-flight state',!(await h.M.import(code)).ok);
  const r=harness(h.durable,h.database,'abort');r.market.ensureDay();await r.settle();
  check('pending dividend is not repaid after restart',r.W.pc()===after);
}
{
  const h=funded();h.lib.db=null;
  h.durable.set('probe_config',JSON.stringify({unrelated:7}));
  h.market.trade(id,1,'buy');await h.settle();
  const cfg=JSON.parse(h.durable.get('probe_config'));
  check('localStorage host fallback saves market and preserves unrelated config',cfg[key].hold[id]===1&&cfg.unrelated===7);
  check('fallback clears only confirmed checkpoint',!h.W.marketPending?.());
  h.fail('probe_config');h.market.trade(id,1,'sell');await h.settle();
  check('fallback quota retains recoverable sell',h.persisted().marketPending?.state.hold[id]===0);
}
const failed=rows.filter(x=>!x.passed);
console.log(JSON.stringify({scope:'VM + isolated durable backends, not Noname/device tests',passed:rows.length-failed.length,failed:failed.length,failures:failed},null,2));
process.exitCode=failed.length?1:0;
