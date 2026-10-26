// Real Chromium storage in a disposable profile. Never connects to a player profile.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openProbe } from './lib/browser_probe.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const option = (key, fallback) => { const i = process.argv.indexOf(key); return i < 0 ? fallback : process.argv[i + 1]; };
const sourceRoot = option('--root', root);
const sources = Object.fromEntries(['wallet', 'market', 'migrate'].map(name => [name, fs.readFileSync(path.join(sourceRoot, 'core/csh_' + name + '.js'), 'utf8').replace(/^import[^\n]*\n/gm, '').replace(/^export (const|function|async function) /gm, '$1 ')]));
const host = fs.readFileSync(path.resolve(root, '../../noname/game/index.js'), 'utf8');
const start = host.indexOf('  removeExtension(extensionName, keepFile) {');
const end = host.indexOf('  addRecentCharacter()', start);
if (start < 0 || end < 0 || !host.includes('game.removeExtension(name2, true)')) throw Error('Host ZIP upgrade/removeExtension anchor changed');
sources.remove = host.slice(start, end);
sources.page = fs.readFileSync(path.join(sourceRoot, 'games/goldfish.html'), 'utf8').replace(/<script\b[^>]*\bsrc=[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
const fixture = '<!doctype html><meta charset="utf-8"><title>Isolated market upgrade probe</title><script>globalThis.sources=' + JSON.stringify(sources).replace(/<\/script/gi, '<\\/script') + ';</script>';
const page = await openProbe(fixture, option('--browser', undefined));
async function reloadDocument() {
  const marker = await page.evaluate('globalThis.__marketDocumentMarker = crypto.randomUUID()');
  await page.send('Page.reload');
  for (let i = 0; i < 160; i++) {
    const fresh = await page.evaluate('document.readyState === "complete" && !!globalThis.sources && globalThis.__marketDocumentMarker !== ' + JSON.stringify(marker));
    if (fresh) return;
    await new Promise(r => setTimeout(r, 20));
  }
  throw Error('Chromium did not replace the document after reload');
}
const setup = async function () {
  const key = 'extension_池子魔将_goldfish', id = 'sample';
  const opening = indexedDB.open('csh-isolated-market-upgrade', 1);
  opening.onupgradeneeded = () => { for (const name of ['config', 'data', 'image']) opening.result.createObjectStore(name); };
  const db = await new Promise((resolve, reject) => { opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error); });
  const dbRead = () => new Promise((resolve, reject) => { const req = db.transaction(['config']).objectStore('config').get(key); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  const dbWrite = value => new Promise((resolve, reject) => { const tx = db.transaction(['config'], 'readwrite'), store = tx.objectStore('config'); value == null ? store.delete(key) : store.put(value, key); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
  const day = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const seed = hold => ({ v: 1, day: day(), dayNo: 0, prices: { sample: 1000 }, hold: { sample: hold }, cost: { sample: hold * 1020 }, gift: true, earned: 0, pendingDiv: 0, tips: [] });
  const code = body => 'CSHMIG1.' + btoa(unescape(encodeURIComponent(JSON.stringify({ meta: { v: 1 }, ...body })))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  async function runtime({ backend = 'idb', cache = true, readFail = false } = {}) {
    const timers = new Set(), jobs = [], fault = { readFail, abortWrite: false, failLocal: false, holdRestore: false };
    const storage = {
      getItem: k => localStorage.getItem(k),
      setItem(k, v) { if (fault.failLocal && k === 'csh_wallet') throw Error('injected wallet quota'); localStorage.setItem(k, v); },
      removeItem: k => localStorage.removeItem(k), key: n => localStorage.key(n), get length() { return localStorage.length; }
    };
    const config = backend === 'idb' ? (cache ? await dbRead() : null) : JSON.parse(localStorage.getItem('isolated_config') || '{}')[key];
    const lib = { config: { ...(config ? { [key]: config } : {}), extensions: ['池子魔将'], extensionInfo: {} }, configprefix: 'isolated_', skill: {}, translate: {} };
    Object.defineProperty(lib.config.extensions, 'remove', { value(name) { const i = this.indexOf(name); if (i >= 0) this.splice(i, 1); } });
    if (backend === 'idb') lib.db = { transaction(stores, access) {
      if (fault.readFail && access === 'readonly') throw Error('injected IDB read failure');
      const tx = db.transaction(stores, access);
      if (fault.abortWrite && access === 'readwrite') { const getStore = tx.objectStore.bind(tx); tx.objectStore = name => { const store = getStore(name), put = store.put.bind(store); store.put = (...args) => { const req = put(...args); req.addEventListener('success', () => tx.abort()); return req; }; return store; }; }
      return tx;
    } };
    const game = {
      saveConfig(k, v) {
        v === undefined ? delete lib.config[k] : lib.config[k] = v;
        if (backend === 'idb') jobs.push(new Promise((resolve, reject) => { const tx = db.transaction(['config'], 'readwrite'), store = tx.objectStore('config'); v === undefined ? store.delete(k) : store.put(v, k); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); }));
        else { const all = JSON.parse(localStorage.getItem('isolated_config') || '{}'); v === undefined ? delete all[k] : all[k] = v; localStorage.setItem('isolated_config', JSON.stringify(all)); }
      },
      deleteDB(store, k) { jobs.push(new Promise((resolve, reject) => { const tx = db.transaction([store], 'readwrite'); tx.objectStore(store).delete(k); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); })); },
      saveConfigValue(k) { this.saveConfig(k, lib.config[k]); }
    };
    const win = { CSH: {}, addEventListener() {} }, doc = { addEventListener() {}, visibilityState: 'visible', hidden: false };
    const schedule = (fn, ms) => { const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms); timers.add(timer); return timer; };
    const args = ['lib', 'game', 'ui', 'get', 'ai', '_status', 'localStorage', 'MINIONS', 'MINION_POOL', 'MINION_NAMES', 'setTimeout', 'clearTimeout', 'window', 'document'];
    const values = [lib, game, {}, {}, {}, {}, storage, { sample: { name: 'Sample' } }, [id], { sample: 'Sample' }, schedule, clearTimeout, win, doc];
    new Function(...args, sources.wallet)(...values);
    const market = new Function(...args, sources.market + ';installMarket();return {ready,startNew,trade,ensureDay,snapshot,syncPending};')(...values);
    new Function(...args, sources.migrate)(...values);
    const ready = await market.ready(); await market.syncPending();
    lib.cshWallet.flushSave();
    const remove = new Function('lib', 'game', 'localStorage', 'return ({' + sources.remove + '}).removeExtension;')(lib, game, storage);
    return { lib, market, W: lib.cshWallet.wallet, M: lib.cshMigrate, fault, ready, window: win,
      async remove() { remove('池子魔将', true); await Promise.all(jobs); },
      stop() { for (const timer of timers) clearTimeout(timer); },
      disk() { return JSON.parse(localStorage.getItem('csh_wallet')); }
    };
  }
  globalThis.fixture = { key, id, db, dbRead, dbWrite, seed, code, runtime };
};
const rows = [];
try {
  await page.evaluate('(' + setup.toString() + ')()');
  rows.push(...await page.evaluate(`(async function(){
    const {key,id,dbRead,dbWrite,seed,code,runtime}=fixture, rows=[];
    const check=(name,passed)=>rows.push({name,passed:!!passed});
    localStorage.clear(); await dbWrite(seed(3));
    let h=await runtime();
    check('legacy native config is durably preserved before ZIP upgrade',h.ready&&h.W.marketSaved().hold[id]===3&&h.disk().marketSaved.hold[id]===3);
    const before=h.W.pc(); await h.remove();
    check('actual host removeExtension(name,true) deletes native market config',!(await dbRead())&&!Object.hasOwn(h.lib.config,key));
    check('actual host removal leaves durable wallet market copy',h.disk().marketSaved.hold[id]===3);
    h.stop();h=await runtime();
    check('new runtime recovers ZIP-cleared config from wallet',h.ready&&h.market.snapshot().list[0].hold===3&&h.W.pc()===before);
    h.market.ensureDay();await h.market.syncPending();
    check('ZIP recovery never repeats welcome gift',h.W.pc()===before);
    const imported=seed(7), importResult=await h.M.import(code({goldfish:imported}));
    check('goldfish-only import succeeds with existing wallet marketSaved',importResult.ok);
    check('partial import updates config and wallet copy together',(await dbRead()).hold[id]===7&&h.disk().marketSaved.hold[id]===7&&h.W.marketSaved().hold[id]===7&&h.W.pc()===before);
    check('partial import is immediately visible through real market snapshot',h.market.snapshot().list[0].hold===7);
    const backup=JSON.parse(localStorage.getItem('csh_mig_backup_'+importResult.backup));
    check('partial import backup retains original market and wallet copy',backup.goldfish.hold[id]===3&&backup.wallet.marketSaved.hold[id]===3);
    h.stop();h=await runtime();
    check('partial import survives runtime restart',h.market.snapshot().list[0].hold===7&&h.W.pc()===before);
    // Abort the native config write after request success; journal must restore the exact wallet bytes.
    const original=localStorage.getItem('csh_wallet');h.fault.abortWrite=true;
    const failure=await h.M.import(code({goldfish:seed(9)}));
    const journal=JSON.parse(localStorage.getItem('csh_migrate_recovery')||'null');
    check('failed partial import journals original wallet and blocks success',!failure.ok&&journal&&journal.local.csh_wallet===original);
    h.fault.abortWrite=false;const recovered=await h.M.recover();
    check('partial import recovery restores exact original data',recovered.ok&&localStorage.getItem('csh_wallet')===original&&(await dbRead()).hold[id]===7&&h.market.snapshot().list[0].hold===7);
    const empty={...seed(0),hold:{},cost:{}},emptyImport=await h.M.import(code({goldfish:empty}));
    check('zero-holding import keeps canonical empty maps and ready state',emptyImport.ok&&await h.market.ready()&&h.market.snapshot().list[0].hold===0&&JSON.stringify(h.disk().marketSaved.hold)==='{}'&&JSON.stringify(h.disk().marketSaved.cost)==='{}');
    h.stop();h=await runtime();
    check('zero-holding import stays readable after restart',h.ready&&h.market.snapshot().list[0].hold===0&&h.W.pc()===before);
    const restoredStock=await h.M.rollback(emptyImport.backup);
    check('rollback from zero-holding import restores prior nonzero stock',restoredStock.ok&&await h.market.ready()&&h.market.snapshot().list[0].hold===7);
    const zeroSaved=await h.M.import(code({goldfish:empty}));
    const restoreZero=await h.M.import(code({goldfish:seed(8)}));
    const zeroRollback=await h.M.rollback(restoreZero.backup);
    check('zero-holding backup itself rolls back without null maps',zeroSaved.ok&&zeroRollback.ok&&await h.market.ready()&&h.market.snapshot().list[0].hold===0);
    h.stop();h=await runtime();
    check('zero-holding rollback survives restart',h.ready&&h.market.snapshot().list[0].hold===0&&h.W.pc()===before);
    h.stop();localStorage.clear();const historicalNull={...seed(0),hold:null,cost:null};await dbWrite(historicalNull);h=await runtime();
    check('historical legal null maps decode as empty without mutating source',h.ready&&h.market.snapshot().list[0].hold===0&&historicalNull.hold===null&&historicalNull.cost===null&&JSON.stringify(h.disk().marketSaved.hold)==='{}');
    h.stop();h=await runtime();
    check('historical null-map recovery survives restart without a grant',h.ready&&h.market.snapshot().list[0].hold===0&&h.W.pc()===2000);
    h.stop();localStorage.clear();const invalid={...seed(0),hold:[]};await dbWrite(invalid);h=await runtime();
    check('illegal market map types still reject reads and retain raw native data',!h.ready&&h.market.snapshot().ready===false&&Array.isArray((await dbRead()).hold)&&!h.disk().marketSaved);
    h.stop();localStorage.clear();await dbWrite(seed(4));h=await runtime({cache:false,readFail:true});
    const oldWallet=localStorage.getItem('csh_wallet'),oldBalance=h.W.pc();
    check('native IDB read failure refuses ready/snapshot',!h.ready&&h.market.snapshot().ready===false);
    check('native IDB read failure blocks trade/day/new-account gift',!h.market.trade(id,1,'buy').ok&&!h.market.ensureDay().ok&&!h.market.startNew(true).ok&&h.W.pc()===oldBalance&&localStorage.getItem('csh_wallet')===oldWallet);
    check('native IDB read failure preserves original record',(await dbRead()).hold[id]===4&&!h.disk().marketPending&&!h.disk().marketSaved);
    h.fault.readFail=false;check('retry reads original config after IDB recovers',await h.market.ready());await h.market.syncPending();
    check('retry retains original holding without another grant',h.market.snapshot().list[0].hold===4&&h.W.pc()===oldBalance);
    h.stop();localStorage.clear();await dbWrite(null);
    localStorage.setItem('csh_ledger',JSON.stringify([{t:Date.now(),d:-1020,r:'金鳞市买入:Sample',b:980}]));
    h=await runtime();const lostBalance=h.W.pc();
    check('missing config with historical trade refuses automatic account',!h.ready&&h.market.snapshot().missingState.history&&!h.market.ensureDay().ok&&!h.disk().marketSaved);
    check('new account requires explicit confirmation',!h.market.startNew(false).ok&&h.W.pc()===lostBalance);
    const fresh=h.market.startNew(true);await h.market.syncPending();h.market.ensureDay();await h.market.syncPending();
    check('explicit new account has zero holdings without welcome grant',fresh.ok&&h.W.pc()===lostBalance&&h.market.snapshot().list[0].hold===0&&h.disk().marketSaved.gift===true);
    h.stop();h=await runtime();h.market.ensureDay();await h.market.syncPending();
    check('confirmed new account never grants again after restart',h.W.pc()===lostBalance&&h.market.snapshot().list[0].hold===0);
    // Legacy LS source must also be preserved before its config is removed.
    h.stop();localStorage.clear();await dbWrite(null);localStorage.setItem(key,JSON.stringify(seed(2)));
    h=await runtime();check('historical same-key LS archive is recovered',h.ready&&h.market.snapshot().list[0].hold===2&&h.disk().marketSaved.hold[id]===2);
    h.stop();localStorage.clear();localStorage.setItem('isolated_config',JSON.stringify({[key]:seed(5),unrelated:17}));
    h=await runtime({backend:'local'});await h.remove();
    check('actual host removeExtension also deletes native LS config',!Object.hasOwn(JSON.parse(localStorage.getItem('isolated_config')),key)&&JSON.parse(localStorage.getItem('isolated_config')).unrelated===17);
    h.stop();h=await runtime({backend:'local'});
    check('native LS upgrade retains holdings and no grant',h.market.snapshot().list[0].hold===5&&h.W.pc()===2000);
    // Use the actual HTML inline code, with its parent transport fallback and browser DOM.
    globalThis.CSH=h.window.CSH;let unavailable=false,trades=0;const real=CSH.market;
    CSH.market={...real,ready:()=>Promise.resolve(!unavailable),snapshot:()=>unavailable?{ok:false,ready:false,saveError:'fixture read failure'}:real.snapshot(),trade(){trades++;return {ok:false,msg:'fixture'};}};
    const frame=document.createElement('iframe');frame.srcdoc=sources.page;document.body.append(frame);
    for(let i=0;i<100&&!(frame.contentWindow.Data&&frame.contentWindow.Data.snap);i++)await new Promise(r=>setTimeout(r,10));
    const w=frame.contentWindow;w.openGirl(id);
    check('actual market page becomes available after successful read',w.Data.snap&&w.Data.unavailable===false&&!w.document.querySelector('#bBuy').disabled);
    unavailable=true;await new Promise(resolve=>w.loadSnap(s=>{w.Data.snap=s;w.renderStats();resolve();}));
    check('failed refresh keeps prior snapshot visibly read-only',w.Data.unavailable&&w.Data.snap.list[0].hold===5&&w.document.querySelector('#stats').textContent.includes('只读')&&w.document.querySelector('#bBuy').disabled&&w.document.querySelector('#bSell').disabled);
    w.tradeAct('buy');let rejected=false;w.doTrade(id,1,'buy',r=>{rejected=!r.ok;});
    check('stale snapshot cannot trade through UI or direct transport helper',trades===0&&rejected);
    unavailable=false;await new Promise(resolve=>w.loadSnap(s=>{w.Data.snap=s;resolve();}));
    check('successful retry re-enables page trading',!w.Data.unavailable&&!w.document.querySelector('#bBuy').disabled);
    frame.remove();h.stop();await dbWrite(null);fixture.db.close();
    localStorage.setItem('probe_expected',JSON.stringify({hold:5,pc:2000,backend:'local'}));
    return rows;
  })()`));
  // A real top-level Chromium reload, then reconstruct all extension functions from disk source.
  await reloadDocument();
  await page.evaluate('(' + setup.toString() + ')()');
  rows.push(await page.evaluate(`(async()=>{const expected=JSON.parse(localStorage.getItem('probe_expected'));const h=await fixture.runtime({backend:expected.backend});const passed=h.ready&&h.market.snapshot().list[0].hold===expected.hold&&h.W.pc()===expected.pc;h.stop();fixture.db.close();return {name:'real Chromium page reload preserves upgraded market and balance',passed};})()`));
  await page.evaluate(`localStorage.setItem('probe_expected',JSON.stringify({hold:5,pc:2000,backend:'idb'}))`);
  await reloadDocument();
  await page.evaluate('(' + setup.toString() + ')()');
  rows.push(await page.evaluate(`(async()=>{const expected=JSON.parse(localStorage.getItem('probe_expected'));const h=await fixture.runtime({backend:expected.backend});const passed=h.ready&&!(await fixture.dbRead())&&h.market.snapshot().list[0].hold===expected.hold&&h.W.pc()===expected.pc;h.stop();fixture.db.close();return {name:'real Chromium reload also recovers wallet copy with IDB config absent',passed};})()`));
  const failures = rows.filter(row => !row.passed);
  console.log(JSON.stringify({ scope: 'disposable Chromium localStorage/IndexedDB + actual host removeExtension method + actual market HTML; no player profile', passed: rows.length - failures.length, failed: failures.length, failures }, null, 2));
  process.exitCode = failures.length ? 1 : 0;
} finally { await page.close(); }
