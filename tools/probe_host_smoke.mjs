import { auditTempRoot, removeAuditScratch, disposeAuditBrowser } from './lib/audit_scratch.mjs';
// Full unmodified localhost Noname entry + installed extension; disposable Chromium origin/profile only.
import fs from 'node:fs';
import {surveyNoncharacter} from './lib/noncharacter_host_survey.mjs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opt = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const host = path.resolve(opt('--host', path.resolve(root, '../..')));
const extensionSource = opt('--extension-source', null);
const matchUntilOver = process.argv.includes('--match-until-over');
const matchMode = opt('--match-mode','identity');
const rewardOnly = process.argv.includes('--reward-only');
const spiritMode=process.argv.includes('--spirit');
const spiritSeats=Number(opt('--spirit-seats','2'));
const challengeMode=process.argv.includes('--challenge-smoke');
const recoveryBoot=process.argv.includes('--recovery-boot');
const brokenPackage='/extension/池子魔将/main/extension-package.js';
const matchConfig = {identity:{player_number_mode_config_identity:'2'},versus:{versus_mode_mode_config_versus:'two'},doudizhu:{doudizhu_mode_mode_config_doudizhu:'normal'}};
if(spiritMode)matchConfig.identity.player_number_mode_config_identity=String(spiritSeats);
if(matchUntilOver && !Object.hasOwn(matchConfig,matchMode))throw Error('Natural-mode probe currently supports identity/versus/doudizhu only; no guessed host configuration');
const out = path.resolve(opt('--out', 'D:/noname-audit-backups/chizi-mojiang/20261022-art-rebuild/host-smoke-' + new Date().toISOString().replace(/[:.]/g, '-')));
fs.mkdirSync(out, { recursive: true });
const requests = [], errors = [], stages = [], checks = [];
const journal = (kind, data) => fs.appendFileSync(path.join(out, 'progress.jsonl'), JSON.stringify({ time: new Date().toISOString(), kind, ...data }) + '\n');
const stage = (name, data = {}) => { const item = { name, ...data }; stages.push(item); journal('stage', item); console.log('[host-smoke] ' + name); };
const check = (name, passed, detail) => { const item = { name, passed: !!passed, ...(detail === undefined ? {} : { detail }) }; checks.push(item); journal('check', item); };
const commandTimeout = Number(opt('--command-timeout-ms', '20000'));
const bounded = (operation, name, ms = commandTimeout) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error(name + ' timed out after ' + ms + ' ms (target may still be alive)')), ms);
  Promise.resolve(operation).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});
stage('probe-created', { host, out });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.ts': 'text/plain; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
function resolveReadOnly(relative) {
  const target = path.resolve(host, relative.replace(/^[/\\]+/, ''));
  if (target !== host && !target.startsWith(host + path.sep)) throw Error('path outside host');
  if (path.relative(host, target).split(path.sep).some(part => /^(home|userdata|user data|\.git)$/i.test(part))) return null;
  const installedExt = path.join(host, 'extension', '池子魔将');
  if(extensionSource&&(target===installedExt||target.startsWith(installedExt+path.sep))){
    const file=path.relative(installedExt,target);
    if(/^(docs|tools)([\\/]|$)/i.test(file))return null;
    return path.resolve(extensionSource,file);
  }
  // A portable real player config must never be imported into the smoke profile.
  if (path.basename(target).toLowerCase() === 'noname.config.txt') return null;
  return target;
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const item = { method: req.method, path: decodeURIComponent(url.pathname) }; requests.push(item);
  journal('request-start', item);
  res.on('finish', () => journal('request-finish', { ...item, status: res.statusCode }));
  res.setHeader('Content-Security-Policy', "connect-src 'self'");
  const json = (status, data) => { item.status = status; res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
  try {
    if (!['GET', 'HEAD'].includes(req.method)) return json(405, { success: false, errorMsg: 'Read-only smoke server' });
    if (recoveryBoot && item.path === brokenPackage) {
      item.status = 200;
      res.writeHead(200, {'Content-Type':'text/javascript; charset=utf-8'});
      return res.end('export const INTERRUPTED_WRITE = ;');
    }
    if (url.pathname === '/__probe_init.html') { item.status = 200; res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><title>Isolated host smoke initialization</title>'); }
    if (['/checkFile', '/getFileList', '/readFile'].includes(url.pathname)) {
      const target = resolveReadOnly(url.searchParams.get('fileName') || url.searchParams.get('dir') || '');
      if (url.pathname === '/checkFile') return json(200, { success: true, data: !target || !fs.existsSync(target) ? null : fs.statSync(target).isDirectory() ? 'directory' : 'file' });
      if (!target || !fs.existsSync(target)) return json(404, { success: false, errorMsg: 'Not found' });
      if (url.pathname === '/readFile') return json(200, { success: true, data: fs.readFileSync(target).toString('base64') });
      const entries = fs.readdirSync(target, { withFileTypes: true });
      return json(200, { success: true, data: { folders: entries.filter(e => e.isDirectory()).map(e => e.name), files: entries.filter(e => e.isFile()).map(e => e.name) } });
    }
    if (/^\/(writeFile|removeFile|removeDir|createDir|createDirectory|mkdir|rename|moveFile)/.test(url.pathname)) return json(405, { success: false, errorMsg: 'Read-only smoke server' });
    const target = resolveReadOnly(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile()) return json(404, { success: false, errorMsg: 'Not found' });
    item.status = 200; res.writeHead(200, { 'Content-Type': mime[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(target); stream.on('error', error => res.destroy(error)); stream.pipe(res);
  } catch (error) { errors.push({ source: 'server', message: error.message }); json(400, { success: false, errorMsg: error.message }); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
stage('readonly-server-listening', { origin });
let page, diagnosticSocket;
async function launchIsolatedBrowser() {
  const temp = fs.mkdtempSync(path.join(auditTempRoot(), 'csh-host-smoke-'));
  const child = spawn(opt('--browser', 'C:/Program Files/Google/Chrome/Application/chrome.exe'), ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', '--user-data-dir=' + path.join(temp, 'profile'), 'about:blank'], { windowsHide: true, stdio: 'ignore', env: {...globalThis.process.env,TEMP:temp,TMP:temp} });
  let launchError;
  child.on('error', error => { launchError = error; });
  journal('isolated-browser-process', { pid: child.pid, temp });
  const portFile = path.join(temp, 'profile', 'DevToolsActivePort');
  try {
    const started = Date.now();
    while (!fs.existsSync(portFile)) {
      if (launchError) throw launchError;
      if (child.exitCode !== null) throw Error('Isolated Chrome exited before its debugging endpoint opened');
      if (Date.now() - started > commandTimeout) throw Error('Isolated Chrome launch timed out');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const isolated = { temp, async close() { try { if (isolated.send) await bounded(isolated.send('Browser.close'), 'isolated Browser.close', 2500); } catch (error) { if (!/disconnected/.test(error.message)) throw error; } finally { diagnosticSocket?.close(); await disposeAuditBrowser(child,temp); } } };
    return isolated;
  } catch (error) { await disposeAuditBrowser(child,temp); throw error; }
}
async function attachDiagnostics() {
  const port = fs.readFileSync(path.join(page.temp, 'profile', 'DevToolsActivePort'), 'utf8').split('\n')[0];
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list', { signal: AbortSignal.timeout(commandTimeout) })).json();
  const target = targets.find(item => item.type === 'page');
  stage('isolated-browser-connected', { profile: path.join(page.temp, 'profile'), debuggingPort: port, target: target.id });
  const ws = diagnosticSocket = new WebSocket(target.webSocketDebuggerUrl);
  await bounded(new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; }), 'diagnostic WebSocket');
  let seq = 0; const pending = new Map();
  ws.onclose = () => { for (const item of pending.values()) item.reject(Error('Isolated target disconnected')); pending.clear(); };
  ws.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.id) {
      const item = pending.get(data.id); pending.delete(data.id);
      if (item) { clearTimeout(item.timer); data.error ? item.reject(Error(JSON.stringify(data.error))) : item.resolve(data.result); }
    } else if (data.method) {
      const params = data.params || {};
      if (/^(Runtime\.(exceptionThrown|consoleAPICalled)|Log\.entryAdded|Network\.(loadingFailed|responseReceived)|Page\.(javascriptDialogOpening|frameNavigated)|ServiceWorker\.)/.test(data.method)) journal('cdp-event', { method: data.method, params });
    }
  };
  page.send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    journal('cdp-start', { id, method });
    const timer = setTimeout(() => { pending.delete(id); journal('cdp-timeout', { id, method, milliseconds: commandTimeout }); reject(Error(method + ' timed out after ' + commandTimeout + ' ms (target may still be alive)')); }, commandTimeout);
    pending.set(id, { timer, resolve(value) { journal('cdp-finish', { id, method }); resolve(value); }, reject(error) { clearTimeout(timer); journal('cdp-error', { id, method, message: error.message }); reject(error); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
  page.evaluate = async expression => {
    const response = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw Error(response.exceptionDetails.text + ' ' + JSON.stringify(response.exceptionDetails.exception));
    return response.result.value;
  };
  for (const method of ['Runtime.enable', 'Page.enable', 'Network.enable', 'Log.enable', 'ServiceWorker.enable']) await page.send(method);
}
async function snap(name) {
  const shot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const filename = name + '.png'; fs.writeFileSync(path.join(out, filename), Buffer.from(shot.data, 'base64')); return filename;
}
async function state() {
  return page.evaluate(`(()=>({url:location.href,title:document.title,readyState:document.readyState,serviceWorker:!!navigator.serviceWorker.controller,globals:{lib:!!window.lib,game:!!window.game,CSH:!!window.CSH},aux:window.lib?.cshAuxSpirit?{enabled:lib.config.extension_池子魔将_csh_aux_spirit,reason:lib.cshAuxSpirit.eligibility(),submode:_status.mode,started:!!_status.gameStarted,role:game.me?.identity,run:!!lib.cshAuxSpirit.current()}:null,arena:!!document.getElementById('arena'),protectedBoot:!!window.__cshStartupRecovery?.needRestart&&typeof _status!=='undefined'&&!!_status.extensionLoaded?.includes('池子魔将'),extensionLoaded:!!window.lib?.cshWallet,character:!!window.lib?.character?.csh_haozhao,body:document.body?.innerText?.slice(0,1800),diagnostics:window.__hostSmoke||null}))()`);
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(expression, description, ms = 8000) {
  const started = Date.now();
  while (Date.now() - started < ms) { const result = await page.evaluate(expression); if (result) return result; await delay(100); }
  throw Error(description + ' did not become ready within ' + ms + ' ms');
}
async function reloadHost(ready, description, ms = 15000) {
  const marker = 'reload-' + Date.now() + '-' + Math.random();
  await page.evaluate('window.__cshSmokeReloadMarker='+JSON.stringify(marker));
  await page.send('Page.reload',{ignoreCache:true});
  const started=Date.now();
  while(Date.now()-started<ms){
    try {
      if(await page.evaluate('window.__cshSmokeReloadMarker!=='+JSON.stringify(marker)+' && document.readyState==="complete" && ('+ready+')')) {
        stage('verified-new-host-document',{description,oldMarker:marker}); return;
      }
    } catch(error) { if(!/Execution context was destroyed|Cannot find context|Inspected target navigated/.test(error.message))throw error; }
    await delay(100);
  }
  throw Error(description+' did not load a fresh document within '+ms+' ms');
}
async function clickElement(expression, inFrame = false, allowDisabled = false) {
  const point = await page.evaluate(`(()=>{const el=${expression};if(!el)throw Error('Click target missing');el.scrollIntoView({block:'center',inline:'center'});const r=el.getBoundingClientRect();const fr=${inFrame ? "document.getElementById('csh-shell-frame')" : 'null'};const f=fr?.getBoundingClientRect();return {x:(f?.left||0)+r.left+r.width/2,y:(f?.top||0)+r.top+r.height/2,disabled:!!el.disabled,text:el.textContent?.slice(0,100)};})()`);
  if (point.disabled && !allowDisabled) throw Error('Click target disabled: ' + point.text);
  journal('pointer-click', point);
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await delay(250);
}
/* ---------- 工作包 B · 房间凭据的真实宿主验证（2026-11-09） ----------
   用未改动的无名杀宿主 + 真实钱包 + 真实 localStorage + 真实 Page.reload，
   证明「扣款 → 落凭据 → 进程重启 → 判定续局 → 结算凭据可自证」这条链。
   不驱动牌桌 UI，也不碰玩家档：一次性 Chromium 档案里自行注资。 */
/* ---------- 工作包 B · 完整玩家路径（2026-11-09） ----------
   上一批验的是事务层（直接调 CSHRoom / settleRun），中间还缺一段：
   收费入场 → iframe 真的开一桌 → 打一手 → 进程重载 → 重进同一张桌 →
   页面自己通过 shell-room-state 恢复，且钱包只扣过一次。
   这条跑通，P1「房间跨进程恢复」才算闭环。 */
async function smokeRoomPlayerPath(table){
  table=table||'blackjack';
  const API=table==='texas'?'__TX':'__BJ';
  const BUYIN=20000;
  const win='(()=>{const f=document.getElementById("csh-shell-frame");return f&&f.contentWindow;})()';
  const frameReady=`(()=>{const w=${win};return !!(w&&w.${API}&&typeof w.${API}.roomShot==="function"&&w.${API}.getRoomDiag&&w.${API}.getRoomDiag().bootDone);})()`;
  const hostReady='!!window.lib?.cshWallet && !!window.lib?.cshShell && typeof window.CSHRoom === "object"';
  const snapshotExpr=`(()=>{const w=${win};return {shot:w.${API}.roomShot(),pc:lib.cshWallet.wallet.pc()};})()`;
  const cardField=table==='texas'?'deck':'shoe';
  stage('room-player-path-start',{table,buyIn:BUYIN});

  await page.evaluate('(()=>{lib.cshWallet.wallet.add(300000,"isolated room path funding");lib.cshWallet.flushSave();return lib.cshWallet.wallet.pc();})()');
  const pc0=await page.evaluate('lib.cshWallet.wallet.pc()');
  const opened=await page.evaluate(`(()=>{const r=lib.cshShell.charge("${table}",${BUYIN});return {r,isOpen:lib.cshShell.isOpen(),current:lib.cshShell.current()};})()`);
  check('真实收费入口开桌成功（'+table+'）',opened.r===true&&opened.isOpen===true&&opened.current===table,opened);
  await until(frameReady,table+' iframe 启动',15000);
  const pc1=await page.evaluate('lib.cshWallet.wallet.pc()');
  check('★ 入场只扣一次带入',pc1===pc0-BUYIN,{pc0,pc1,buyIn:BUYIN});

  /* 真实开一手：廿一点用 startHand，德州用 startGame（内部建 G 并发牌），
     两条路径都会走 render/renderAll → saveRoom → 宿主写快照。 */
  const deal=table==='texas'?`${win}.__TX.startGame()`:`${win}.__BJ.startHand()`;
  await page.evaluate(`(()=>{const w=${win};${deal};return true;})()`);
  await delay(700);
  const before=await page.evaluate(snapshotExpr);
  const diag=await page.evaluate(`(()=>({raw:localStorage.getItem(window.CSHRoom.KEY),pageDiag:(()=>{const w=${win};try{return w.${API}.getRoomDiag();}catch(e){return String(e.message);}})(),metaRoom:lib.cshShell.META["${table}"].room,shellCurrent:lib.cshShell.current(),roomId:lib.cshShell.roomId&&lib.cshShell.roomId(),csRoom:typeof window.CSHRoom,saveGuard:!!lib.cshWallet.saveGuard&&lib.cshWallet.saveGuard.blocked()}))()`);
  check('开局后快照已落盘（宿主侧有 active 凭据）',
    (()=>{try{const d=JSON.parse(diag.raw);return !!d&&d.phase==='active'&&!!d.shot&&!!d.shot.s&&Array.isArray(d.shot.s[cardField]);}catch(e){return false;}})(),diag);
  check('快照含真实牌面',!!before.shot&&!!before.shot.s&&before.shot.s[cardField].length>0&&
    (table==='texas'?before.shot.s.players.length>=2:before.shot.s.hands.length>0),
    before.shot&&{cards:before.shot.s[cardField].length});

  /* 进程边界：宿主整体重载，iframe 一并销毁。 */
  await reloadHost(hostReady,'重载宿主（模拟杀进程后重开）');
  const pc2=await page.evaluate('lib.cshWallet.wallet.pc()');
  check('重载后余额未被二次扣款',pc2===pc1,{pc1,pc2});
  check('重载后本机仍留有房间凭据',
    await page.evaluate('!!localStorage.getItem(window.CSHRoom.KEY)'));

  /* 玩家重进同一张桌：走同一个收费入口，doCharge 应命中「已有未完成牌局」分支。 */
  const reopened=await page.evaluate(`(()=>{const r=lib.cshShell.charge("${table}",${BUYIN});return {r,current:lib.cshShell.current()};})()`);
  check('重进同一张桌成功（未被要求重复入场）',reopened.r===true&&reopened.current===table,reopened);
  await until(frameReady,'续局 iframe 启动',15000);
  await delay(400);
  const pc3=await page.evaluate('lib.cshWallet.wallet.pc()');
  check('★ 重进不二次扣款（钱没有凭空少一份）',pc3===pc1,{pc1,pc3});

  const after=await page.evaluate(snapshotExpr);
  const same=JSON.stringify(before.shot)===JSON.stringify(after.shot);
  const diffKeys=[...new Set([...Object.keys(before.shot.s||{}),...Object.keys(after.shot.s||{})])]
    .filter(k=>JSON.stringify(before.shot.s[k])!==JSON.stringify(after.shot.s[k]));
  check('★ 续局后页面状态与重载前完全一致（牌面/筹码/阶段逐字段相等）',same,
    {table,diffKeys,
     before:{cards:before.shot.s[cardField].length,chips:before.shot.s.chips||(before.shot.s.players&&before.shot.s.players[0].chips),phase:before.shot.s.phase},
     after:{cards:after.shot.s[cardField].length,chips:after.shot.s.chips||(after.shot.s.players&&after.shot.s.players[0].chips),phase:after.shot.s.phase},
     beforeVals:diffKeys.reduce((o,k)=>{o[k]=JSON.stringify(before.shot.s[k]).slice(0,160);return o;},{}),
     afterVals:diffKeys.reduce((o,k)=>{o[k]=JSON.stringify(after.shot.s[k]).slice(0,160);return o;},{})});
  check('恢复走的是 view-game 而不是开局页',
    await page.evaluate('(()=>{const d=document.getElementById("csh-shell-frame").contentDocument;const v=d.getElementById("view-game");return !!v&&getComputedStyle(v).display!=="none";})()'));
  const boot=await state();
  check('完整玩家路径期间宿主无脚本错误与对话框',
    !boot.diagnostics?.errors?.length&&!boot.diagnostics?.rejections?.length&&!boot.diagnostics?.dialogs?.length,boot.diagnostics);
  stage('room-player-path-done',{table,same,pc0,pc1,pc2,pc3});
}
async function smokeRoomRecovery(){
  const ID='room-host-smoke-0001', AMOUNT=50000;
  stage('room-recovery-start',{id:ID,amount:AMOUNT});
  check('真实宿主已加载房间凭据模块（此前从未进入加载图）',
    await page.evaluate('typeof window.CSHRoom === "object" && typeof window.CSHRoom.prepare === "function"'));
  check('真实宿主钱包暴露 roomReceipt',
    await page.evaluate('lib.cshWallet && typeof lib.cshWallet.wallet.roomReceipt === "function"'));
  check('真实宿主已加载补码凭据模块（此前补码恒失败）',
    await page.evaluate('typeof window.CSHTopUpJournal === "object"'));

  await page.evaluate('(()=>{lib.cshWallet.wallet.add(200000,"isolated room test funding");lib.cshWallet.flushSave();return lib.cshWallet.wallet.pc();})()');
  const before=await page.evaluate(`(()=>{const pc=lib.cshWallet.wallet.pc();const r=window.CSHRoom.prepare(localStorage,{id:"${ID}",table:"blackjack",amount:${AMOUNT},balanceBefore:pc,t:Date.now(),shot:null});return {pc,prep:r};})()`);
  check('★ 扣款前凭据在真实 localStorage 落盘并读回成功',before.prep&&before.prep.ok===true,before);

  const act=await page.evaluate(`(()=>{const w=lib.cshWallet.wallet;const paid=w.spend(${AMOUNT},"入场:blackjack");lib.cshWallet.flushSave();const a=window.CSHRoom.activate(localStorage,"${ID}",{v:1,buyIn:${AMOUNT},s:{shoe:[1,2,3,4],hands:[],dealer:[],chips:${AMOUNT},phase:"deal"}});return {paid,a,pc:w.pc()};})()`);
  check('扣款成功且凭据进入 active',act.paid===true&&act.a.ok===true&&act.pc===before.pc-AMOUNT,act);

  /* 真实重载 = 新文档 + 钱包从磁盘重读。这一步才是「跨进程」的证据。 */
  await reloadHost('!!window.lib?.cshWallet && typeof window.CSHRoom === "object"','房间凭据重载');
  const after=await page.evaluate(`(()=>{const w=lib.cshWallet.wallet;const d=window.CSHRoom.decide(localStorage,{pc:()=>w.pc(),settledId:()=>w.roomReceipt().id});const raw=localStorage.getItem(window.CSHRoom.KEY);return {pc:w.pc(),action:d.action,charged:d.charged,phase:raw?JSON.parse(raw).phase:null,shot:raw?JSON.parse(raw).shot:null,receipt:w.roomReceipt()};})()`);
  check('★ 重载后判定为 resume 且确认扣款已持久化',after.action==='resume'&&after.charged===true,after);
  check('★ 重载后余额只扣一次（不重复入场费）',after.pc===before.pc-AMOUNT,{before:before.pc,after:after.pc});
  check('重载后快照原样带回（牌靴未重抽）',after.phase==='active'&&after.shot&&after.shot.s&&after.shot.s.shoe.length===4,after);

  const settled=await page.evaluate(`(()=>{const w=lib.cshWallet.wallet;const r=w.settleRun("blackjack",{buyIn:${AMOUNT},netWin:0,aiStakeTotal:0,settleId:"${ID}"});lib.cshWallet.flushSave();return {ok:r.ok,credited:r.credited,receipt:w.roomReceipt()};})()`);
  check('真实钱包结算把房间编号写进同一次余额写入',settled.ok===true&&settled.receipt.id===ID,settled);
  await reloadHost('!!window.lib?.cshWallet && typeof window.CSHRoom === "object"','结算凭据重载');
  const rec=await page.evaluate('lib.cshWallet.wallet.roomReceipt()');
  check('★ 结算凭据跨重载仍在（重启后能自证这一局付过，不必重放结算）',rec.id===ID&&rec.credited>0,rec);

  const done=await page.evaluate(`(()=>{const R=window.CSHRoom;R.markSettled(localStorage,"${ID}",0);R.clear(localStorage);return R.decide(localStorage,{pc:()=>lib.cshWallet.wallet.pc(),settledId:()=>lib.cshWallet.wallet.roomReceipt().id});})()`);
  check('结算收尾后房间凭据清空，恢复判定为 none',done.action==='none',done);

  const discard=await page.evaluate(`(()=>{const R=window.CSHRoom,w=lib.cshWallet.wallet,pc=w.pc();R.prepare(localStorage,{id:"room-host-smoke-0002",table:"texas",amount:1000,balanceBefore:pc,t:Date.now(),shot:null});const d=R.decide(localStorage,{pc:()=>w.pc(),settledId:()=>w.roomReceipt().id});R.clear(localStorage);return {d,pcAfter:w.pc()};})()`);
  check('★ 只写了凭据但没扣款 → 判 discard，绝不白送钱',
    discard.d.action==='discard'&&discard.pcAfter===discard.d.entry.balanceBefore,discard);
  const boot=await state();
  check('房间验证期间宿主无脚本错误与对话框',
    !boot.diagnostics?.errors?.length&&!boot.diagnostics?.rejections?.length&&!boot.diagnostics?.dialogs?.length,boot.diagnostics);
  stage('room-recovery-done');
}
async function smokeExperience(){
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshWallet.wallet.add(250000,"isolated UI test funding");lib.cshWallet.flushSave();return lib.cshDebug.openLobby();})()');
 await until('!!document.querySelector(".csh-world-hero")&&!!document.getElementById("csh-experience-css")?.sheet','new world design and stylesheet');
 check('world summary and direct invitation cards exist',await page.evaluate('document.querySelectorAll(".csh-world-digest article").length===3&&!!document.querySelector(".csh-world-start")'));
 await delay(450);stage('world-experience',{screenshot:await snap('experience-world-desktop')});
 await page.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await delay(350);
 const narrow=await page.evaluate(`(()=>{const p=document.getElementById('csh-dbg-panel'),r=p.getBoundingClientRect(),hero=document.querySelector('.csh-world-hero').getBoundingClientRect(),d=document.querySelector('.csh-world-digest');return {panel:{x:r.x,w:r.width},hero:{x:hero.x,w:hero.width},viewport:innerWidth,digestScroll:d.scrollWidth>d.clientWidth,heroHeight:hero.height,stories:d.querySelectorAll("article").length};})()`);
 check('world narrow layout fits with directly visible story list',narrow.panel.x>=-1&&narrow.panel.x+narrow.panel.w<=narrow.viewport+1&&narrow.hero.x+narrow.hero.w<=narrow.viewport+1&&!narrow.digestScroll&&narrow.stories===3&&narrow.heroHeight<100,narrow);stage('world-experience-phone',{screenshot:await snap('experience-world-phone')});if(process.argv.includes('--preview-only'))return;
 await page.send('Emulation.setDeviceMetricsOverride',{width:1365,height:900,deviceScaleFactor:1,mobile:false});
 await clickElement('[...document.querySelectorAll("button.csh-dbg-gamebtn")].find(b=>b.querySelector(".gb-name")?.textContent==="生涯大厅")');
 await until('!!document.getElementById("csh-shell-frame")?.contentDocument?.getElementById("ach-claim-all")','career actual page');
 await clickElement('document.getElementById("csh-shell-frame").contentDocument.querySelector("button[data-p=ach]")',true);
 await until('!document.getElementById("csh-shell-frame").contentDocument.getElementById("ach-claim-all").disabled','career claimable snapshot');
 const before=await page.evaluate('({pc:lib.cshWallet.wallet.pc(),claims:Object.keys(JSON.parse(localStorage.getItem("csh_wallet")).careerClaims||{}).length})');
 stage('career-before-bulk',{screenshot:await snap('experience-career-before')});
 await clickElement('document.getElementById("csh-shell-frame").contentDocument.getElementById("ach-claim-all")',true);
 await until('Object.keys(JSON.parse(localStorage.getItem("csh_wallet")).careerClaims||{}).length>'+before.claims,'actual bulk receipts');await delay(500);
 const after=await page.evaluate('({pc:lib.cshWallet.wallet.pc(),claims:Object.keys(JSON.parse(localStorage.getItem("csh_wallet")).careerClaims||{}).length,disabled:document.getElementById("csh-shell-frame").contentDocument.getElementById("ach-claim-all").disabled,button:document.getElementById("csh-shell-frame").contentDocument.getElementById("ach-claim-all").textContent})');
 check('native pointer batch claim credits durable wallet and multiple receipts',after.pc>before.pc&&after.claims>before.claims+1,{before,after});check('one batch includes newly unlocked claims and leaves none ready',after.disabled,{after});stage('career-after-bulk',{screenshot:await snap('experience-career-after')});
 await clickElement('document.getElementById("csh-shell-close")');
 if(await page.evaluate('!!document.getElementById("csh-dbg-close")'))await clickElement('document.getElementById("csh-dbg-close")');
 if(await page.evaluate("[...document.querySelectorAll('.control')].some(n=>n.textContent==='确定')"))await clickElement("[...document.querySelectorAll('.control')].find(n=>n.textContent==='确定')");if(!await page.evaluate('!!_status.auto'))await clickElement('ui.auto');await until('!!_status.gameStarted','debug actor initialized',20000);await page.evaluate('lib.cshDebugMenu.open()');await clickElement("[...document.querySelectorAll('#csh-dbg-tabs .csh-dbg-tab')].find(n=>n.textContent==='资源')");await until('!!document.querySelector("#csh-dbg-panel .csh-art-primary")','developer debug actions');await delay(350);
 const align=await page.evaluate(`(()=>{const ps=[...document.querySelectorAll('#csh-dbg-panel .csh-art-primary,#csh-dbg-panel .csh-art-compact')].filter(b=>b.getBoundingClientRect().width>0);return ps.map(b=>({text:b.textContent,align:getComputedStyle(b).alignItems,justify:getComputedStyle(b).justifyContent}));})()`);
 check('debug actions and actor tabs use centered content',align.length>5&&align.every(r=>r.align==='center'&&r.justify==='center'),align);
 stage('debug-centered',{screenshot:await snap('experience-debug')});
 const errors=await page.evaluate('({errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})');check('experience flow has no runtime errors',!errors.errors.length&&!errors.rejections.length,errors);
}
async function smokeUiRecovery(){
 const dimensions=[[1280,573],[915,412],[640,360],[640,286],[390,844]];
 const resize=async(w,h)=>{await page.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});await delay(250);};
 await clickElement("[...document.querySelectorAll('#csh-dbg-tabs .csh-dbg-tab')].find(n=>n.textContent==='诊断')");
 for(const [w,h]of dimensions){await resize(w,h);const metrics=await page.evaluate(`(()=>{const tabs=[...document.querySelectorAll('#csh-dbg-tabs .csh-dbg-tab')],nav=document.getElementById('csh-dbg-tabs').getBoundingClientRect(),body=document.getElementById('csh-dbg-body').getBoundingClientRect();return {layout:['csh-dbg-overlay','csh-dbg-panel','csh-dbg-head','csh-dbg-main','csh-dbg-body','csh-dbg-tabs'].map(id=>{const n=document.getElementById(id),r=n.getBoundingClientRect(),s=getComputedStyle(n);return {id,rect:{x:r.x,y:r.y,w:r.width,h:r.height},display:s.display,position:s.position,height:s.height,minHeight:s.minHeight,flex:s.flex,transition:s.transitionProperty,duration:s.transitionDuration,margin:s.margin,padding:s.padding,box:s.boxSizing,transform:s.transform};}),nav:{x:nav.x,y:nav.y,w:nav.width,h:nav.height},bodyBottom:body.bottom,viewport:{w:innerWidth,h:innerHeight},tabs:tabs.map(t=>{const r=t.getBoundingClientRect();return {text:t.textContent,x:r.x,y:r.y,w:r.width,h:r.height,nowrap:getComputedStyle(t).whiteSpace,art:t.classList.contains('csh-art-primary'),overflow:t.scrollWidth>t.clientWidth+1};})};})()`);check('debug navigation fits without ornate frames '+w+'x'+h,metrics.tabs.length===11&&metrics.tabs.every(t=>!t.art&&!t.overflow&&t.nowrap==='nowrap'&&t.x>=-1&&t.x+t.w<=w+1&&t.y>=-1&&t.y+t.h<=h+1)&&metrics.nav.y+metrics.nav.h<=h+1&&metrics.bodyBottom<=metrics.nav.y+1,metrics);stage('debug-layout-'+w+'x'+h,{screenshot:await snap('debug-'+w+'x'+h)});}
 if(process.argv.includes('--nav-only'))return;
 await resize(915,412);
 for(const skin of ['sgs','warm','paper','night','celadon','gold']){await page.evaluate('lib.cshTheme.setSkin('+JSON.stringify(skin)+')');await delay(400);const c=await page.evaluate(`(()=>{const rgb=s=>(s.match(/[0-9.]+/g)||[]).slice(0,3).map(Number),lum=a=>a.map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0),ratio=(a,b)=>{const x=lum(rgb(a)),y=lum(rgb(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};const nav=document.getElementById('csh-dbg-tabs'),s=getComputedStyle(nav);return [...nav.querySelectorAll('.csh-dbg-tab')].map(el=>{const t=getComputedStyle(el);return {text:el.textContent,ratio:ratio(t.color,el.classList.contains('on')?t.backgroundColor:s.backgroundColor)};});})()`);check('six-skin actual navigation contrast '+skin,c.every(v=>v.ratio>=4.5),c);stage('skin-'+skin,{screenshot:await snap('skin-'+skin)});}
 await clickElement("[...document.querySelectorAll('#csh-dbg-tabs .csh-dbg-tab')].find(n=>n.textContent==='世界')");await delay(200);stage('debug-world-short',{screenshot:await snap('debug-world-short')});
 await clickElement("[...document.querySelectorAll('button.csh-dbg-gamebtn')].find(n=>n.querySelector('.gb-name')?.textContent==='金鳞市')");
 if(await page.evaluate('!!document.querySelector(".csh-fee-go")'))await clickElement('document.querySelector(".csh-fee-go")');
 await until('!!document.getElementById("csh-shell-frame")?.contentDocument?.getElementById("retryMarket")','real market UI');
 if(await page.evaluate('!document.getElementById("csh-shell-frame").contentDocument.getElementById("startNewMarket").hidden')){await clickElement('document.getElementById("csh-shell-frame").contentDocument.getElementById("startNewMarket")',true);await until('!!document.querySelector("#csh-ui-confirm button.ok")','isolated new market');await clickElement('document.querySelector("#csh-ui-confirm button.ok")');}
 await until('lib.cshMarket.snapshot().ready&&document.getElementById("csh-shell-frame").contentDocument.querySelectorAll("#grid .card").length===50','market listing');
 for(const [w,h]of dimensions){await resize(w,h);const top=await page.evaluate(`(()=>{const d=document.getElementById('csh-shell-frame').contentDocument,b=d.querySelector('.brand').getBoundingClientRect(),stats=d.querySelector('.stats').getBoundingClientRect(),p=d.defaultView;return {brand:{w:b.width,h:b.height},stats:{w:stats.width,h:stats.height},ink:p.getComputedStyle(d.body).getPropertyValue('--ink').trim(),ready:d.body.dataset.marketReady,retry:p.getComputedStyle(d.getElementById('retryMarket')).display,overflow:d.documentElement.scrollWidth>d.documentElement.clientWidth};})()`);check('market readable header and no useless ready banner '+w+'x'+h,top.brand.w>=100&&top.brand.h<90&&!top.overflow&&top.retry==='none'&&top.ready==='true',top);const labels=await page.evaluate(`(()=>{const d=document.getElementById('csh-shell-frame').contentDocument,p=d.defaultView,rgb=s=>(s.match(/[0-9.]+/g)||[]).slice(0,3).map(Number),lum=a=>a.map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0),ratio=(a,b)=>{const x=lum(rgb(a)),y=lum(rgb(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};return [...d.querySelectorAll('#grid .card')].filter(n=>{const r=n.getBoundingClientRect();return r.top< p.innerHeight&&r.bottom>0;}).map(c=>{const plate=c.querySelector('.cinfo'),style=p.getComputedStyle(plate),after=p.getComputedStyle(c.querySelector('.face'),'::after');return {name:c.querySelector('.cname').textContent,foreground:p.getComputedStyle(c.querySelector('.cname')).color,fontSize:parseFloat(p.getComputedStyle(c.querySelector('.cname')).fontSize),background:style.backgroundColor,nameRatio:ratio(p.getComputedStyle(c.querySelector('.cname')).color,style.backgroundColor),priceRatio:ratio(p.getComputedStyle(c.querySelector('.cprice')).color,style.backgroundColor),aboveGradient:Number(style.zIndex)>Number(after.zIndex==='auto'?0:after.zIndex)};});})()`);check('market card names and prices remain above portrait gradient '+w+'x'+h,labels.length>0&&labels.every(l=>l.aboveGradient&&l.fontSize>=18&&l.nameRatio>=4.5&&l.priceRatio>=4.5),labels);stage('market-grid-'+w+'x'+h,{screenshot:await snap('market-grid-'+w+'x'+h)});await clickElement('document.getElementById("csh-shell-frame").contentDocument.querySelector("#grid .card")',true);await until('document.getElementById("csh-shell-frame").contentDocument.querySelector("#panel.on")','market detail');const panel=await page.evaluate(`(()=>{const f=document.getElementById('csh-shell-frame'),d=f.contentDocument,p=d.defaultView,rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom,r:r.right}};return {viewport:{w:p.innerWidth,h:p.innerHeight},info:rect(d.querySelector('.pcontent')),ops:rect(d.querySelector('.ops')),buy:rect(d.getElementById('bBuy')),close:rect(d.getElementById('pclose')),top:d.querySelector('.pcontent').scrollTop,prices:['fPrice','fHold','fCost'].map(id=>({id,text:d.getElementById(id).textContent,color:p.getComputedStyle(d.getElementById(id)).color}))};})()`);check('market detail retains visible actions and separate content scroll '+w+'x'+h,panel.buy.b<=panel.viewport.h+1&&panel.buy.x>=0&&panel.buy.r<=panel.viewport.w+1&&panel.info.b<=panel.ops.y+1&&panel.top===0&&panel.close.y>=44,panel);stage('market-detail-'+w+'x'+h,{screenshot:await snap('market-detail-'+w+'x'+h)});await clickElement('document.getElementById("csh-shell-frame").contentDocument.getElementById("pclose")',true);}
 await clickElement('document.getElementById("csh-shell-close")');await clickElement("[...document.querySelectorAll('button.csh-dbg-gamebtn')].find(n=>n.querySelector('.gb-name')?.textContent==='生涯大厅')");await until('!!document.getElementById("csh-shell-frame")?.contentDocument?.getElementById("ach-claim-all")','career recovery page');await clickElement('document.getElementById("csh-shell-frame").contentDocument.querySelector("button[data-p=ach]")',true);
 for(const [w,h]of [[1920,859],...dimensions]){await resize(w,h);const detail=await page.evaluate(`(()=>{const f=document.getElementById('csh-shell-frame'),d=f.contentDocument,p=d.defaultView,button=d.getElementById('ach-claim-all'),r=button.getBoundingClientRect(),header=d.querySelector('.ach-header').getBoundingClientRect();return {header:{h:header.height,w:header.width},button:{h:r.height,w:r.width},viewport:{w:p.innerWidth,h:p.innerHeight},overflow:d.documentElement.scrollWidth>d.documentElement.clientWidth,ancestor:button.closest('.ach-header')!==null,cardTitle:parseFloat(p.getComputedStyle(d.querySelector('#ach-grid .adetail strong')).fontSize),cardDescription:parseFloat(p.getComputedStyle(d.querySelector('#ach-grid .adesc')).fontSize),contentWidth:d.getElementById('p-ach').getBoundingClientRect().width};})()`);check('career claim is a compact header action '+w+'x'+h,detail.ancestor&&detail.button.h<=64&&detail.header.h<=180&&!detail.overflow&&detail.cardTitle>=16&&detail.cardDescription>=14&&detail.contentWidth<=1441,detail);stage('career-layout-'+w+'x'+h,{screenshot:await snap('career-'+w+'x'+h)});}
 const state=await page.evaluate('({errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})');check('UI recovery has no runtime errors',!state.errors.length&&!state.rejections.length,state);
}
async function worldLayout410(){
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();return lib.cshDebug.openLobby();})()');await until('!!document.querySelector(".csh-world-board")','compact world');
 for(const [width,height]of [[1365,768],[915,412],[640,286],[390,844]]){await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(650);const metrics=await page.evaluate(`(()=>{const r=n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom}};return {viewport:{w:innerWidth,h:innerHeight},head:r(document.getElementById('csh-dbg-head')),hero:r(document.querySelector('.csh-world-hero')),body:r(document.getElementById('csh-dbg-body')),board:r(document.querySelector('.csh-world-board')),cards:[...document.querySelectorAll('.csh-world-board .csh-dbg-gamebtn')].map(n=>({text:n.querySelector('.gb-name').textContent,...r(n)})),drawers:document.querySelectorAll('.csh-world-board details').length,stories:document.querySelectorAll('.csh-world-digest article').length,storyOverflow:document.querySelector('.csh-world-digest').scrollWidth>document.querySelector('.csh-world-digest').clientWidth};})()`);check('world direct information and compact summary '+width+'x'+height,metrics.cards.length===11&&metrics.hero.h<=85&&metrics.board.right<=width+1&&!metrics.drawers&&!metrics.storyOverflow&&metrics.stories===3,metrics);stage('world-layout-'+width+'x'+height,{screenshot:await snap('world-layout-'+width+'x'+height)});}
}
async function smokeChallenge(){
 if(await page.evaluate("[...document.querySelectorAll('.control')].some(n=>n.textContent==='确定')"))await clickElement("[...document.querySelectorAll('.control')].find(n=>n.textContent==='确定')");
 if(!await page.evaluate('!!_status.auto'))await clickElement('ui.auto');
 await until('!!_status.gameStarted && !!game.boss','challenge actual engine start',30000);
 const initial=await page.evaluate(`({boss:game.boss.name,hp:game.boss.hp,maxHp:game.boss.maxHp,profile:game.bossinfo._csh_profile,moxi:game.bossinfo._csh_moxi,x:game.bossinfo._csh_x,epoch:game.boss._cshBossEpoch,challenger:game.me!==game.boss,players:game.players.map(p=>({name:p.name,side:p.side,armor:p.hujia,hand:p.countCards('h')}))})`);
 check('actual challenge uses pool boss profile and epoch guard',initial.boss.startsWith('csh_boss_')&&initial.challenger&&initial.profile==='normal'&&Number.isInteger(initial.epoch),initial);
 check('actual profile caps boss HP and extra draw',initial.x<=38&&initial.moxi<=2&&initial.maxHp<=initial.x,initial);
 await delay(15000);const final=await page.evaluate(`({round:game.roundNumber,history:game.players.concat(game.dead).map(p=>({name:p.name,cards:p.getAllHistory('useCard').length,damages:p.getAllHistory('damage').length})),errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})`);
 check('real challenge progresses with cards without runtime rejection',final.history.some(p=>p.cards>0)&&!final.rejections.length&&!final.errors.length,final);
 stage('challenge-engine-smoke',{initial,final,screenshot:await snap('challenge-engine')});
}
async function smokeInterfaces() {
  // Use the installed lazy loader and player-facing world entry, then actual pointer clicks.
  await page.evaluate('(async()=>{await lib.__cshLoadDebug();return lib.cshDebug.openLobby();})()');
  const world = await until(`(()=>{const p=document.getElementById('csh-dbg-panel');return p&&p.dataset.view==='world'?{view:p.dataset.view,cards:p.querySelectorAll('button.csh-dbg-gamebtn:not(.locked)').length,world:lib.cshWorld?.stats(),achievements:CSH_POOL_ACHV.claimState()}:null})()`, 'real player world');
  await delay(350);
  stage('real-player-world', { state: world, screenshot: await snap('world-desktop') });
  check('player world opens against actual engine and real world state', world.cards >= 10 && world.world?.chars > 0, world);
  for (const key of ['achv', 'save', 'goldfish']) {
    await clickElement(`document.querySelector('.gb-${key}')`);
    if (await page.evaluate("!!document.querySelector('.csh-fee-go')")) await clickElement("document.querySelector('.csh-fee-go')");
    const frame = await until(`(()=>{const f=document.getElementById('csh-shell-frame'),d=f?.contentDocument;return d&&d.readyState==='complete'&&f.src.includes('/${key}.html')?{url:f.src,title:d.title}:null})()`, key + ' shell iframe');
    await until(`(()=>{const d=document.getElementById('csh-shell-frame')?.contentDocument;return ${key === 'achv' ? "d?.querySelectorAll('#list [data-id]').length>0" : key === 'save' ? "!!d?.querySelector('#inv .iv')&&!d?.getElementById('b-pack')?.disabled" : "!!d?.getElementById('storageStatus')&&!d.getElementById('storageStatus').textContent.includes('正在')"};})()`, key + ' actual bridge data');
    let before;
    if (key === 'save') {
      await clickElement("document.getElementById('csh-shell-frame').contentDocument.getElementById('b-pack')", true);
      const encoded = await until("document.getElementById('csh-shell-frame').contentDocument.getElementById('code').value || false", 'real save export');
      check('bag export produced an actual bridge export from isolated engine storage', typeof encoded === 'string' && encoded.length > 100, { length: encoded.length });
    }
    if (key === 'goldfish') {
      if (await page.evaluate("!document.getElementById('csh-shell-frame').contentDocument.getElementById('startNewMarket').hidden")) {
        await clickElement("document.getElementById('csh-shell-frame').contentDocument.getElementById('startNewMarket')", true);
        await until("!!document.querySelector('#csh-ui-confirm button.ok')", 'new isolated market confirmation');
        await clickElement("document.querySelector('#csh-ui-confirm button.ok')");
      }
      await until('lib.cshMarket.snapshot().ready && document.getElementById("csh-shell-frame").contentDocument.querySelectorAll("#grid .card").length===50', 'real market listing');
      const item = await page.evaluate('lib.cshMarket.snapshot().list.filter(x=>x.price*1.02<=lib.cshWallet.wallet.pc()).sort((a,b)=>a.price-b.price)[0]');
      if (!item) throw Error('New isolated profile cannot afford one market unit');
      await clickElement(`document.getElementById('csh-shell-frame').contentDocument.querySelector('#grid .card[data-id="${item.id}"]')`, true);
      await clickElement("document.getElementById('csh-shell-frame').contentDocument.querySelector('#qty .qbtn')", true);
      const oldBalance = await page.evaluate('lib.cshWallet.wallet.pc()');
      await clickElement("document.getElementById('csh-shell-frame').contentDocument.getElementById('bBuy')", true);
      await until(`lib.cshMarket.snapshot().list.find(x=>x.id===${JSON.stringify(item.id)}).hold===1`, 'real pointer-driven market purchase');
      const purchase = await page.evaluate(`(()=>({balance:lib.cshWallet.wallet.pc(),item:lib.cshMarket.snapshot().list.find(x=>x.id===${JSON.stringify(item.id)})}))()`);
      check('market purchase via real iframe click commits one unit and debit', purchase.item.hold === 1 && purchase.balance < oldBalance, { oldBalance, ...purchase });
      await clickElement("document.getElementById('csh-shell-frame').contentDocument.getElementById('pclose')", true);
      before = await page.evaluate('lib.cshMarket.snapshot()');
    }
    const details = await page.evaluate(`(()=>{const d=document.getElementById('csh-shell-frame').contentDocument;return {title:d.title,body:d.body.innerText.slice(0,1800),cards:d.querySelectorAll('#list [data-id]').length,inventory:d.querySelectorAll('#inv .iv').length,storage:d.getElementById('storageStatus')?.textContent,errors:d.defaultView.__hostSmoke?.errors,rejections:d.defaultView.__hostSmoke?.rejections};})()`);
    await delay(350);
    stage('real-' + key + '-desktop', { frame, state: details, screenshot: await snap(key + '-desktop') });
    check(key + ' actual shell page and bridge render without JS errors', !(details.errors?.length || details.rejections?.length), details);
    await page.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: false });
    await delay(350);
    stage('real-' + key + '-short', { screenshot: await snap(key + '-844x390') });
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1365, height: 900, deviceScaleFactor: 1, mobile: false });
    await delay(250);
    await clickElement("document.getElementById('csh-shell-close')");
    check(key + ' shell closes by actual pointer and removes iframe', await page.evaluate("!document.getElementById('csh-shell-frame')"));
    await clickElement(`document.querySelector('.gb-${key}')`);
    if (await page.evaluate("!!document.querySelector('.csh-fee-go')")) await clickElement("document.querySelector('.csh-fee-go')");
    await until(`document.getElementById('csh-shell-frame')?.src.includes('/${key}.html') && document.getElementById('csh-shell-frame')?.contentDocument?.readyState==='complete'`, key + ' reopen');
    await delay(500);
    if (key === 'goldfish') {
      const after = await page.evaluate('lib.cshMarket.snapshot()');
      check('market reopen preserves actual host snapshot', JSON.stringify(before) === JSON.stringify(after), { before, after });
    } else check(key + ' real page reopens', true);
    await clickElement("document.getElementById('csh-shell-close')");
  }
  await clickElement("document.getElementById('csh-dbg-close')");
  check('world close button removes actual overlay', await page.evaluate("!document.getElementById('csh-dbg-overlay')"));
  await page.evaluate("ui.click.charactercard('csh_haozhao',null,true)");
  const portrait = await until(`(async()=>{const n=document.querySelector('.charactercard .ava .avatar');if(!n)return false;const s=getComputedStyle(n),match=s.backgroundImage.match(/url\\([\"']?(.*?)[\"']?\\)/);if(!match)return false;const img=new Image();img.src=match[1];await img.decode();const r=n.getBoundingClientRect();return {image:img.src,width:img.naturalWidth,height:img.naturalHeight,rect:{x:r.x,y:r.y,w:r.width,h:r.height},backgroundSize:s.backgroundSize,backgroundPosition:s.backgroundPosition,character:lib.character.csh_haozhao};})()`, 'native Haozhao portrait');
  await delay(350);
  stage('actual-engine-haozhao-character-card', { state: portrait, screenshot: await snap('haozhao-native-card') });
  check('native host character card resolves installed Haozhao portrait', portrait.image.includes('/image/csh_haozhao.jpg') && portrait.width === 400 && portrait.height === 472, portrait);
  const outside = await page.evaluate("(()=>{const r=document.querySelector('.charactercard').closest('.popup-container').getBoundingClientRect();return {x:r.left+8,y:r.top+8};})()");
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...outside, button: 'left', clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...outside, button: 'left', clickCount: 1 });
  await until("!document.querySelector('.charactercard')", 'native popup 500 ms close animation', 2500);
  check('native character popup closes by outside pointer', true);
  const final = await state();
  stage('interfaces-complete', { state: { ...final, diagnostics: { errors: final.diagnostics?.errors, rejections: final.diagnostics?.rejections } } });
  check('actual host remains loaded after module open/close cycle', final.arena && final.extensionLoaded && !final.diagnostics?.errors.length && !final.diagnostics?.rejections.length);
  const persisted = await page.evaluate(`(async()=>({market:await game.getDB('config','extension_池子魔将_goldfish'),snapshot:lib.cshMarket.snapshot()}))()`);
  check('market purchase reached actual engine IndexedDB config backend', Object.values(persisted.market?.hold || {}).some(value => value === 1), { market: persisted.market });
  await page.evaluate('window.__beforeSmokeReload=true');
  await page.send('Page.reload', { ignoreCache: true });
  await until("typeof window.__beforeSmokeReload==='undefined' && document.readyState==='complete' && !!window.lib?.cshWallet && !!document.getElementById('arena')", 'real engine reload', 15000);
  await until('window.lib?.cshMarket?.snapshot().ready', 'market persisted reload', 10000);
  const reloaded = await page.evaluate('lib.cshMarket.snapshot()');
  check('complete host reload preserves purchased holding, cost and wallet', JSON.stringify(reloaded.list.map(x => [x.id,x.hold,x.cost])) === JSON.stringify(persisted.snapshot.list.map(x => [x.id,x.hold,x.cost])) && reloaded.pc === persisted.snapshot.pc, { pc: reloaded.pc, held: reloaded.list.filter(x => x.hold).map(x => ({ id:x.id,hold:x.hold,cost:x.cost })) });
  stage('actual-host-reload', { screenshot: await snap('host-reloaded'), state: { pc: reloaded.pc, held: reloaded.list.filter(x => x.hold).map(x => ({ id:x.id,hold:x.hold,cost:x.cost })) } });
  await smokeIdentityMatch();
}
async function smokeIdentityMatch() {
  const observation = `(()=>({mode:get.mode(),round:game.roundNumber,started:!!_status.gameStarted,auto:!!_status.auto,paused:!!_status.paused,event:_status.event?.name,me:game.me?.name,guards:{video:!!_status.video,videoInited:!!_status.videoInited,connectMode:!!_status.connectMode,blocked:typeof lib.cshMigrate?.persistenceBlocked==='function'?!!lib.cshMigrate.persistenceBlocked():null,installed:!!lib.__cshPoolAchvInstalled,globalRegistered:lib.skill.global.includes('csh_pool_achv_tap'),gameStartFilter:!!lib.skill.csh_pool_achv_tap?.filter({},game.me,'gameStart'),phaseFilter:!!lib.skill.csh_pool_achv_tap?.filter({},game.me,'phaseBefore')},players:game.players.map(p=>({name:p.name,hp:p.hp,identity:p.identity,damages:p.getAllHistory('damage').length,cards:p.getAllHistory('useCard').length})),achievements:CSH_POOL_ACHV.load(),controls:[...document.querySelectorAll('.control')].map(n=>n.textContent)}))()`;
  try {
    stage('identity-before-play', { state: await page.evaluate(observation) });
    const updateButton = await page.evaluate("[...document.querySelectorAll('.control')].some(n=>n.textContent==='确定')");
    if (updateButton) await clickElement("[...document.querySelectorAll('.control')].find(n=>n.textContent==='确定')");
    if (!await page.evaluate('!!_status.auto')) await clickElement('ui.auto');
    const started = Date.now(); let sample;
    while (Date.now() - started < 35000) {
      sample = await page.evaluate(observation);
      journal('identity-observation', { state: sample });
      if (sample.players.some(p=>p.damages > 0) && Object.values(sample.achievements.progress || {}).some(n=>n>0)) break;
      await delay(800);
    }
    const progressed = Object.values(sample?.achievements.progress || {}).some(n=>n>0);
    const damaged = sample?.players.some(p=>p.damages > 0);
    stage('actual-identity-match', { status: progressed && damaged ? 'observed' : 'partial', state: sample, screenshot: await snap('identity-match') });
    if (sample.started && damaged) check('actual identity lifecycle records operation-achievement progress without manual feed or unlock', progressed, { guards: sample.guards, achievements: sample.achievements });
    if (damaged) check('actual identity engine generated damage history during autoplay', true, sample.players);
    // No injected game event, fabricated achievement state, or forced victory is used.
  } catch (error) { stage('identity-match-not-verified', { reason: error.message }); }
}
async function smokeNaturalMatch() {
  const maxMs = Math.min(240000, Math.max(1000, Number(opt('--match-budget-ms', '240000'))));
  const observe = `(()=>{const ps=[...game.players,...game.dead],me=game.me;return {mode:get.mode(),configuredPlayers:get.playerNumber(),speed:lib.config.game_speed,round:game.roundNumber,started:!!_status.gameStarted,over:!!_status.over,auto:!!_status.auto,event:_status.event?.name,me:me?.name,video:!!_status.video,videoInited:!!_status.videoInited,phaseFilter:!!lib.skill.csh_pool_achv_tap?.filter({},me,'phaseBefore'),players:ps.map(p=>({name:p.name,hp:p.hp,dead:game.dead.includes(p),identity:p.identity,cards:p.getAllHistory('useCard').length,damages:p.getAllHistory('damage').length,sourceDamage:p.getAllHistory('sourceDamage').reduce((n,e)=>n+(e.num||0),0)})),local:me?{cards:me.getAllHistory('useCard').map(e=>e.card?.name),sourceDamage:me.getAllHistory('sourceDamage').reduce((n,e)=>n+(e.num||0),0),receivedDamage:me.getAllHistory('damage').reduce((n,e)=>n+(e.num||0),0)}:null,achievements:CSH_POOL_ACHV.load(),wallet:{pc:lib.cshWallet.wallet.pc(),rank:lib.cshWallet.rank.get()},dialogs:(ui.dialogs||[]).map(n=>n.innerText?.slice(0,1000))};})()`;
  let sample = await page.evaluate(observe);
  const openingBalance = sample.wallet.pc;
  stage('natural-match-config', { state: sample, budgetMs: maxMs, sources: { speed: 'noname/library/index.js:1052 and noname/get/index.js:1443', players: 'noname/library/index.js:6091 and noname/get/index.js:1507', storageKey: 'noname/init/index.js:767-770 (_mode_config parser)' } });
  const expectedPlayers = {identity:spiritMode?spiritSeats:2,versus:4,doudizhu:3}[matchMode];
  check('natural-match configuration uses real supported '+matchMode+' and vvfast', sample.mode === matchMode && sample.speed === 'vvfast' && sample.players.length === expectedPlayers, {expectedPlayers,mode:sample.mode,speed:sample.speed,players:sample.players.length});
  if (sample.mode !== matchMode || sample.players.length !== expectedPlayers || sample.speed !== 'vvfast') throw Error('Actual supported test configuration was not applied');
  if (await page.evaluate("[...document.querySelectorAll('.control')].some(n=>n.textContent==='确定')")) await clickElement("[...document.querySelectorAll('.control')].find(n=>n.textContent==='确定')");
  if (!await page.evaluate('!!_status.auto')) await clickElement('ui.auto');
  if(spiritMode){await until('!!_status.gameStarted && !!lib.cshAuxSpirit.current()?.spirit','owner preparation injection',spiritSeats>2?120000:45000);check('real gameStart adds a complete independent lower seat',await page.evaluate('game.players.concat(game.dead).length==='+String(spiritSeats+1)+' && game.me.next===lib.cshAuxSpirit.current().spirit && lib.cshAuxSpirit.current().spirit.identityShown'));}
  if(spiritMode&&process.argv.includes('--spirit-status-ui')){
    for(const [width,height] of [[1365,768],[915,412],[640,286]]){
      await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      // Noname applies its new body zoom 500 ms after resize.
      await delay(650);
      const mark='game.me.marks.csh_aux_status';
      await clickElement(mark);
      const pane=await page.evaluate('(()=>{const p=document.querySelector(".csh-aux-status-panel");if(!p)return null;const d=p.closest(".dialog"),r=d.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,text:p.innerText,marks:document.querySelectorAll(".csh-aux-status-mark").length,ruleHeight:p.querySelector("summary").getBoundingClientRect().height,font:parseFloat(getComputedStyle(p).fontSize)*p.getBoundingClientRect().width/p.offsetWidth};})()');
      check('native spirit status fits '+width+'x'+height,pane&&pane.left>=-1&&pane.top>=-1&&pane.right<=width+1&&pane.bottom<=height+1&&pane.marks===1&&pane.font>=12&&pane.ruleHeight>=43,pane);
      if(pane){
        await clickElement('document.querySelector(".csh-aux-status-panel summary")');
        check('native status rules expand without dismissing '+width,await page.evaluate('!!document.querySelector(".csh-aux-status-panel details[open]")'));
        stage('spirit-status-'+width,{screenshot:await snap('spirit-status-'+width)});
        await page.evaluate('(()=>{const d=document.querySelector(".csh-aux-status-dialog");if(d?.nextElementSibling?.classList.contains("poplayer"))d._close.call(d.nextElementSibling);})()');
      }
    }
    return;
  }
  if(spiritMode&&process.argv.includes('--spirit-effect-smoke')){
    check('host loads all six real guardian effects',await page.evaluate('!!window.CSHSpiritBuffs&&!!window.CSHSpiritBuffRuntime&&["t1","t2","t3","t4","t5","t6"].every(k=>lib.skill.global.includes("csh_spirit_buff_"+k))'));
    await page.evaluate('('+function(){
      window.__spiritEffectResult=null;
      lib.skill.__cshAuditSpiritEffects={
        trigger:{global:'phaseUseBegin'},forced:true,silent:true,firstDo:true,
        filter(){return !window.__spiritEffectResult&&!!lib.cshAuxSpirit.current()?.spirit;},
        async content(){
          window.__spiritEffectResult={running:true};
          const r=lib.cshAuxSpirit.current(),p=r.spirit,o=r.owner,rt=window.CSHSpiritBuffRuntime;
          function equip(template){
            const buff=window.CSHSpiritBuffs.list().find(b=>b.template===template);
            rt.end(r.id);rt.begin({sessionId:r.id,spiritId:buff.id,level:'B',epoch:r.epoch});
          }
          const used=template=>rt.snapshot(r.id).used[template]||0;
          equip('T2_draw_once');
          await o.useCard({name:'wuzhong',isCard:true},o,false);
          const harmless=used('T2_draw_once');
          const hit=o.useCard({name:'sha',isCard:true},p,false);
          hit.directHit=[p];
          await hit;
          const actualDamage=o.hasHistory('sourceDamage',d=>d.num>0&&d.getParent('useCard')===hit);
          const hitUsed=used('T2_draw_once'),damageCard=o.getHistory('sourceDamage').find(d=>d.getParent('useCard')===hit);
          equip('T5_response_once');
          const responsesBefore=o.getHistory('respond').length;
          const arrow=p.useCard({name:'wanjian',isCard:true},o,'nowuxie',false);
          await arrow;
          const arrowUsed=rt.snapshot(r.id).used.T5_response_once||0;
          const physicalResponse=o.getHistory('respond').length>responsesBefore;
          const arrowHarm=o.hasHistory('damage',d=>d.num>0&&d.getParent('useCard')===arrow);
          const beforeGuard=p.storage.cshAuxGuard||0, beforeHp=o.hp;
          equip('T1_guard_damage');
          await o.damage(1,p,'nocard');
          const specialtyGuard=used('T1_guard_damage')===1&&o.hp===beforeHp&&(p.storage.cshAuxGuard||0)===beforeGuard;
          const normalCap=o.getHandcardLimit();
          equip('T3_hand_cap');
          const capBonus=o.getHandcardLimit()-normalCap;
          const capPersistent=o.getHandcardLimit()===normalCap+1&&used('T3_hand_cap')===1;
          const targets=game.players.filter(q=>q!==o), distances=targets.map(q=>get.distance(o,q));
          equip('T4_distance');
          const distanceChanges=targets.map((q,i)=>[distances[i],get.distance(o,q)]);
          equip('T6_recover_once');
          const basicRescue=p.storage.cshAuxRescue;
          o.hp=1;o.update();
          await o.loseHp(1);
          const specialtyRescue=used('T6_recover_once')===1&&o.hp===1&&p.storage.cshAuxRescue===basicRescue;
          await p.die(o);
          const s=lib.cshAuxSpirit.summary();
          window.__spiritEffectResult={
            done:true,harmless,actualDamage,hitUsed,sameCard:damageCard?.card===hit.card,arrowUsed,physicalResponse,arrowHarm,
            specialtyGuard,capBonus,capPersistent,distanceChanges,specialtyRescue,
            removed:!game.players.includes(p)&&game.dead.includes(p),
            inactive:s.state==='dead'&&!s.supportActive,mark:o.marks.csh_aux_status?.dataset.cshAuxStatus,
            diagnostics:{errors:__hostSmoke.errors,rejections:__hostSmoke.rejections}
          };
        }
      };
      game.addGlobalSkill('__cshAuditSpiritEffects');
    }.toString()+')()');
    await until('window.__spiritEffectResult?.done','native damage and guardian death effects',60000);
    const result=await page.evaluate('window.__spiritEffectResult');
    check('non-damaging card does not consume the real guardian effect',result.harmless===0,result);
    check('damage in a real card resolution consumes T2 exactly once',result.actualDamage&&result.hitUsed===1,result);
    check('T5 native arrows resolve with no physical response and no damage',result.arrowUsed===1&&!result.physicalResponse&&!result.arrowHarm,result);
    check('T1 uses its own protection before a base guard charge',result.specialtyGuard,result);
    check('T3 native handcard limit remains increased by exactly one',result.capBonus===1&&result.capPersistent,result);
    check('T4 reduces native distance and does not go below one',
      result.distanceChanges.some(([before,after])=>before>1&&after===before-1)&&
      result.distanceChanges.every(([before,after])=>after===Math.max(1,before-1)),result);
    check('T6 saves the owner without spending the basic rescue',result.specialtyRescue,result);
    check('dead spirit leaves active seating and its mark stops offering support',result.removed&&result.inactive&&result.mark==='dead',result);
    check('native effects produced no errors',!result.diagnostics.errors.length&&!result.diagnostics.rejections.length,result);
    stage('spirit-native-effects',{result,screenshot:await snap('spirit-native-effects')});
    return;
  }
  if(process.argv.includes('--spirit-seat-smoke')){
    await delay(500);const seating=await page.evaluate(`(()=>{const r=lib.cshAuxSpirit.current();return {number:ui.arena.dataset.number,count:game.players.concat(game.dead).length,cause:r.summonedAt,hand:r.spirit.countCards('h'),position:r.spirit.dataset.position,rects:game.players.map(p=>{const a=p.getBoundingClientRect();return {name:p.name,x:a.x,y:a.y,width:a.width,height:a.height};}),size:{w:innerWidth,h:innerHeight},errors:__hostSmoke.errors,rejections:__hostSmoke.rejections};})()`);
    check('real owner preparation summons ninth seat with initial hand',seating.count===spiritSeats+1&&seating.cause.trigger==='phaseZhunbeiBegin'&&seating.cause.owner&&seating.hand===4,seating);
    check('native extra-seat layout stays inside viewport',seating.rects.every(r=>r.x>=-2&&r.y>=-2&&r.x+r.width<=seating.size.w+2&&r.y+r.height<=seating.size.h+2),seating);
    await until('!!lib.cshAuxSpirit.current().spirit.storage.cshAuxAid','new guardian own preparation phase',90000);check('ninth participant takes native turn and aids only owner',await page.evaluate('lib.cshAuxSpirit.current().spirit.storage.cshAuxAid>=1'));
    check('extra-seat initial event chain has no script errors',!seating.errors.length&&!seating.rejections.length,seating);stage('extra-seat-smoke',{seating,screenshot:await snap('extra-seat')});return;
  }
  const started = Date.now(); let observedLocalCards = false, observedLocalDamage = false;
  while (Date.now() - started < maxMs) {
    sample = await page.evaluate(observe);
    observedLocalCards ||= (sample.local?.cards.length || 0) > 0;
    observedLocalDamage ||= (sample.local?.sourceDamage || 0) > 0;
    journal('natural-match-observation', { elapsedMs: Date.now() - started, state: sample });
    if (sample.over) break;
    if (Math.floor((Date.now() - started) / 1000) % 20 === 0) console.log('[host-smoke] natural match round ' + sample.round + ', elapsed ' + Math.floor((Date.now() - started) / 1000) + 's');
    await delay(900);
  }
  await delay(1200);
  sample = await page.evaluate(observe);
  stage('natural-match-result', { status: sample.over ? 'natural-over' : 'budget-reached', elapsedMs: Date.now() - started, state: sample, screenshot: await snap('natural-match-result') });
  if(matchMode === 'identity') {
    check('natural identity match produced local real card history', observedLocalCards, sample.local);
    check('natural identity match produced local real source-damage history', observedLocalDamage, sample.local);
  }
  if (!spiritMode && observedLocalCards) check('natural local card history reaches persisted operation card progress', Number(sample.achievements.progress.op_cards_total) > 0, { history: sample.local.cards, progress: sample.achievements.progress });
  if (!spiritMode && observedLocalDamage) check('natural local source damage reaches persisted best-damage progress', Number(sample.achievements.progress.op_one_slash) > 0, { sourceDamage: sample.local.sourceDamage, progress: sample.achievements.progress });
  if (!sample.over) { stage('natural-match-unverified', { reason: 'One natural match reached the time budget; no forced victory or repeated match.' }); return; }
  check('actual '+matchMode+' match reached native game.over without forcing a result', sample.over, { round: sample.round, dialogs: sample.dialogs });
  if(spiritMode){
    const state=await page.evaluate(`(()=>{const r=lib.cshAuxSpirit.current(),s=lib.cshAuxSpirit.stats(),w=JSON.parse(localStorage.getItem('csh_wallet'));return {stats:s,pc:w.pc,claims:w.matchClaims||[],ordinary:lib.config.gameRecord.identity.data,assisted:_status.cshAssistedMatch,spirit:r.spirit.name,owner:r.owner.name,control:game.me===r.owner,skills:r.spirit.getSkills(),progress:CSH_POOL_ACHV.load().progress,videoMarker:lib.video.some(v=>v.type==='storage'&&v.content?.[0]==='cshAssistedMatch'&&v.content[1]?.type==='identity_with_spirit'),rejections:__hostSmoke.rejections,errors:__hostSmoke.errors};})()`);
    const receipt=state.claims[0],rates=await page.evaluate('lib.cshWallet.wallet.matchRewardConfig().identity');
    check('natural assisted match pays once with separate result and configured reward',
      state.assisted&&state.stats.wins+state.stats.losses===1&&state.claims.length===1&&receipt.mode==='assisted_identity'&&
      receipt.pc===rates[receipt.win?'win':'lose']&&state.pc===openingBalance+receipt.pc,state);
    check('natural assisted match never transfers human control or achievement progress',state.control&&Object.values(state.progress).every(n=>!n),state);
    await page.evaluate('game.over(false)');check('repeated assisted callback does not duplicate result',await page.evaluate('lib.cshAuxSpirit.stats().wins+lib.cshAuxSpirit.stats().losses===1'));
    check('assisted replay is tagged and runtime is clean',state.videoMarker&&!state.errors.length&&!state.rejections.length,state);
    stage('natural-assisted-result',{state});return;
  }
  const payment = await page.evaluate(`(()=>{const w=JSON.parse(localStorage.getItem(lib.cshWallet.KEYS.wallet)||'{}');return {pc:lib.cshWallet.wallet.pc(),diskPc:w.pc,claims:w.matchClaims||[],rates:lib.cshMatchReward?.rates(get.mode()),ledger:lib.cshWallet.wallet.ledger()};})()`);
  const receipt = payment.claims.at(-1), expectedReward = receipt ? payment.rates[receipt.win ? 'win' : 'lose'] : null;
  check('natural native terminal result credits configured match reward with durable receipt', payment.claims.length === 1 && receipt.mode === matchMode && receipt.pc === expectedReward && payment.pc === openingBalance + expectedReward && payment.diskPc === payment.pc, { openingBalance,payment });
  if (receipt) {
    await page.evaluate(`game.over(${JSON.stringify(!receipt.win)})`);
    const repeated = await page.evaluate(`(()=>{const w=JSON.parse(localStorage.getItem(lib.cshWallet.KEYS.wallet));return {pc:w.pc,claims:w.matchClaims.length};})()`);
    check('repeated callback after completed natural match cannot pay again', repeated.pc === payment.pc && repeated.claims === payment.claims.length, repeated);
  }
  stage('natural-match-CBY', {openingBalance,payment});
  if(rewardOnly) {
    await reloadHost('!!window.lib?.cshMatchReward && !!window.lib?.cshWallet','match reward entire host reload');
    const restored=await page.evaluate(`(()=>{const w=JSON.parse(localStorage.getItem(lib.cshWallet.KEYS.wallet)||'{}');return {pc:lib.cshWallet.wallet.pc(),diskPc:w.pc,receipt:w.matchClaims?.find(r=>r.id===${JSON.stringify(receipt?.id)})};})()`);
    check('natural '+matchMode+' reward and receipt survive entire host reload',!!receipt&&restored.pc===payment.pc&&restored.diskPc===payment.pc&&restored.receipt?.id===receipt.id&&restored.receipt.pc===receipt.pc,restored);
    stage('natural-mode-reward-reloaded',{state:restored,screenshot:await snap('natural-mode-reward-reloaded')});
    return;
  }
  const fresh = await page.evaluate('CSH_POOL_ACHV.RULES.filter(r=>CSH_POOL_ACHV.load().got[r.id]&&!CSH_POOL_ACHV.isPaid(r.id)).map(r=>({id:r.id,name:r.name,reward:CSH_POOL_ACHV.reward(r)}))');
  stage('natural-unlocks', { rows: fresh });
  if (!fresh.length) {
    stage('natural-claim-not-verified', { reason: 'This single natural match produced no unpaid unlock. No fabricated threshold or replayed match.' });
    await reloadHost('!!window.lib?.cshMatchReward && !!window.lib?.cshWallet','match reward complete host reload');
    const restored=await page.evaluate(`(()=>{const w=JSON.parse(localStorage.getItem(lib.cshWallet.KEYS.wallet));return {pc:w.pc,receipt:w.matchClaims?.find(r=>r.id===${JSON.stringify(receipt?.id)})};})()`);
    check('natural match CBY and receipt survive complete host reload',restored.pc===payment.pc&&restored.receipt?.id===receipt?.id,restored);
    return;
  }
  const chosen = fresh[0];
  await page.evaluate('(async()=>{await lib.__cshLoadDebug();return lib.cshDebug.openLobby();})()');
  await until("!!document.querySelector('.gb-achv')", 'natural endgame world entry');
  await clickElement("document.querySelector('.gb-achv')");
  const button = `document.getElementById('csh-shell-frame').contentDocument.querySelector('[data-id="${chosen.id}"] button.claim')`;
  await until(`(()=>{const f=document.getElementById('csh-shell-frame');return f?.src.includes('/achv.html')&&f.contentDocument?.querySelector('[data-id="${chosen.id}"] button.claim.ready')&&!f.contentDocument.querySelector('[data-id="${chosen.id}"] button.claim.ready').disabled})()`, 'naturally unlocked claim button');
  const before = await page.evaluate('({pc:lib.cshWallet.wallet.pc(),merit:lib.cshWallet.rank.get().merit})');
  stage('natural-claim-before', { chosen, before, screenshot: await snap('natural-claim-before') });
  await clickElement(button, true);
  await until(`CSH_POOL_ACHV.isPaid(${JSON.stringify(chosen.id)})`, 'natural achievement claim receipt');
  const after = await page.evaluate(`(()=>({pc:lib.cshWallet.wallet.pc(),merit:lib.cshWallet.rank.get().merit,walletReceipt:JSON.parse(localStorage.getItem(lib.cshWallet.KEYS.wallet)).poolClaims?.[${JSON.stringify(chosen.id)}],rankReceipt:JSON.parse(localStorage.getItem(lib.cshWallet.KEYS.rank)).poolClaims?.[${JSON.stringify(chosen.id)}],paid:CSH_POOL_ACHV.isPaid(${JSON.stringify(chosen.id)})}))()`);
  check('natural unlock claim via actual iframe pointer credits wallet and merit exactly once', after.pc - before.pc === chosen.reward.pc && after.merit - before.merit === chosen.reward.merit && after.paid && !!after.walletReceipt && after.rankReceipt === chosen.reward.merit, { chosen, before, after });
  stage('natural-claim-after', { chosen, before, after, screenshot: await snap('natural-claim-after') });
  await page.evaluate('window.__beforeClaimReload=true');
  await page.send('Page.reload', { ignoreCache: true });
  await until("typeof window.__beforeClaimReload==='undefined' && document.readyState==='complete' && !!window.lib?.cshWallet && !!window.CSH_POOL_ACHV && !!document.getElementById('arena')", 'claimed achievement real host reload', 20000);
  await page.evaluate('(async()=>{await lib.__cshLoadDebug();return lib.cshDebug.openLobby();})()');
  await clickElement("document.querySelector('.gb-achv')");
  await until(`(()=>{const f=document.getElementById('csh-shell-frame');return f?.src.includes('/achv.html')&&!!f.contentDocument?.querySelector('[data-id="${chosen.id}"] button.claim.done')})()`, 'claimed achievement disabled after reload');
  const reloaded = await page.evaluate(`({pc:lib.cshWallet.wallet.pc(),merit:lib.cshWallet.rank.get().merit,paid:CSH_POOL_ACHV.isPaid(${JSON.stringify(chosen.id)}),disabled:!!(${button}).disabled})`);
  check('natural achievement receipt and credited balance survive complete host reload', reloaded.pc === after.pc && reloaded.merit === after.merit && reloaded.paid && reloaded.disabled, { after, reloaded });
  const matchRestored=await page.evaluate(`JSON.parse(localStorage.getItem(lib.cshWallet.KEYS.wallet)).matchClaims?.find(r=>r.id===${JSON.stringify(receipt?.id)})`);
  check('natural match receipt remains after achievement payment and complete host reload',!!receipt&&matchRestored?.pc===receipt.pc&&matchRestored?.win===receipt.win,matchRestored);
  await clickElement(button, true, true);
  await delay(600);
  const repeated = await page.evaluate('({pc:lib.cshWallet.wallet.pc(),merit:lib.cshWallet.rank.get().merit})');
  check('pointer click on disabled claimed reward after reload does not pay again', repeated.pc === after.pc && repeated.merit === after.merit, repeated);
  stage('natural-claim-reloaded', { chosen, state: reloaded, screenshot: await snap('natural-claim-reloaded') });
}
try {
  page = await launchIsolatedBrowser();
  await attachDiagnostics();
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1365, height: 900, deviceScaleFactor: 1, mobile: false });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__hostSmoke={errors:[],rejections:[],dialogs:[],logs:[]};
    addEventListener('error',e=>window.__hostSmoke.errors.push({message:e.message,file:e.filename,line:e.lineno}));
    addEventListener('unhandledrejection',e=>window.__hostSmoke.rejections.push(String(e.reason?.stack||e.reason)));
    window.alert=message=>window.__hostSmoke.dialogs.push({type:'alert',message:String(message)});
    window.confirm=message=>{window.__hostSmoke.dialogs.push({type:'confirm-declined',message:String(message)});return false;};
    window.prompt=message=>{window.__hostSmoke.dialogs.push({type:'prompt-cancelled',message:String(message)});return null;};
    for(const level of ['log','warn','error']){const original=console[level];console[level]=function(...args){window.__hostSmoke.logs.push({level,text:args.map(x=>typeof x==='string'?x:x?.message||String(x)).join(' ').slice(0,2000)});return original.apply(this,args);};}
  ` });
  await page.send('Page.navigate', { url: origin + '/__probe_init.html' });
  for (let i = 0; i < 120 && !(await page.evaluate('location.origin === ' + JSON.stringify(origin) + ' && document.readyState === "complete"')); i++) await new Promise(r => setTimeout(r, 20));
  await page.evaluate(`(async()=>{localStorage.setItem('noname_0.9_loadtime','60000');localStorage.setItem('gplv3_noname_alerted','true');const request=indexedDB.open('noname_0.9_data',4);request.onupgradeneeded=()=>{for(const name of ['video','image','audio','config','data'])request.result.createObjectStore(name,name==='video'?{keyPath:'time'}:undefined);};const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});const values={extensions:['池子魔将'],extensionInfo:{'池子魔将':{}},'extension_池子魔将_enable':true,'extension_池子魔将_csh_debug_menu':true,extension_auto_import:false,mode:${JSON.stringify(challengeMode?'boss':matchUntilOver?matchMode:'identity')},'extension_池子魔将_csh_aux_spirit':${JSON.stringify(spiritMode)},show_splash:'off',...${JSON.stringify(spiritMode?{ban_identity_mode_config_identity:'nei'}:{})},dev:true,debug:false,totouched:true,touchscreen:false,new_tutorial:true,show_time:false,...${JSON.stringify(matchUntilOver ? {game_speed:'vvfast',...matchConfig[matchMode]} : {})}};const tx=db.transaction(['config'],'readwrite');for(const [key,value]of Object.entries(values))tx.objectStore('config').put(value,key);await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();return true;})()`);
  if(recoveryBoot){
    await page.evaluate('localStorage.setItem("csh_update_recovery_pending_v1","1");localStorage.setItem("csh_wallet","recovery-probe-sentinel");');
  }
  stage('test-only-idb-seeded');
  await page.send('Page.navigate', { url: origin + '/index.html' });
  stage('unmodified-host-navigation-sent');
  let current;
  for (let i = 0; i < 240; i++) {
    await new Promise(r => setTimeout(r, 200));
    try { current = await state(); } catch (error) { journal('boot-observation-error', { message: error.message }); if (/timed out|disconnected/.test(error.message)) throw error; continue; }
    if (i % 25 === 0) journal('boot-observation', { state: current });
    if (current.arena && (recoveryBoot ? current.protectedBoot : current.extensionLoaded && current.character)) break;
  }
  stage('full-host-boot', { state: current, screenshot: await snap('host-boot') });
  check('unmodified host entry is controlled by real service worker', current?.serviceWorker);
  if(recoveryBoot){
    const recovery=await page.evaluate('(()=>({result:window.__cshStartupRecovery,pending:localStorage.getItem("csh_update_recovery_pending_v1"), wallet:localStorage.getItem("csh_wallet"), label:window.lib?.extensionMenu?.["extension_池子魔将"]?.intro?.name,buffLoaded:!!window.CSHSpiritBuffs}))()');
    check('native loader registers a protected extension and can open the base game',current?.arena&&current?.protectedBoot,recovery);
    check('protected boot does not request the deliberately corrupt business module',!requests.some(r=>r.path===brokenPackage));
    check('protected boot never installs wallet, characters or guardian scripts',!current?.extensionLoaded&&!current?.character&&!recovery.buffLoaded);
    check('protected boot preserves existing local data and presents restart guidance',recovery.wallet==='recovery-probe-sentinel'&&/重启/.test(recovery.label||''),recovery);
    check('native adapter treats a missing journal as empty and clears the marker',
      recovery.result?.ok&&recovery.result.result?.empty&&!recovery.pending&&/已恢复/.test(recovery.label||''),recovery);
    check('protected native boot has no script errors or dialogs',!current?.diagnostics?.errors?.length&&!current?.diagnostics?.rejections?.length&&!current?.diagnostics?.dialogs?.length);
  }else{
    check('actual engine created arena and loaded extension/registered Haozhao', current?.arena && current?.extensionLoaded && current?.character);
  }
  if (!recoveryBoot && current?.arena && current?.extensionLoaded && current?.character) {
    if(process.argv.includes('--world-layout-410'))await worldLayout410();
    else if(process.argv.includes('--room-player-path'))await smokeRoomPlayerPath(opt('--room-table','blackjack'));
    else if(process.argv.includes('--room-smoke'))await smokeRoomRecovery();
    else if(process.argv.includes('--noncharacter-survey'))await surveyNoncharacter({page,out,snap,until,delay,clickElement,check,stage});
    else if(process.argv.includes('--ui-recovery')){await smokeExperience();await smokeUiRecovery();}
    else if(process.argv.includes('--experience-smoke'))await smokeExperience();
    else if(challengeMode) await smokeChallenge();
    else if (matchUntilOver) await smokeNaturalMatch();
    else if (process.argv.includes('--match-only')) await smokeIdentityMatch();
    else await smokeInterfaces();
  }
} catch (error) { const item = { source: 'probe', message: error.stack || error.message }; errors.push(item); journal('error', item); if (page) { try { stage('failure-capture', { screenshot: await snap('failure'), state: await state() }); } catch (captureError) { journal('capture-error', { message: captureError.message }); } } }
finally {
  const failures = checks.filter(item => !item.passed);
  const result = { scope: 'Full unmodified host index.html and real engine/extension over read-only localhost HTTP server, new Chromium profile and test-only IndexedDB. No Electron or real player profile. BrowserAdapter read-only checkFile/readFile/getFileList compatibility endpoints. Portable noname.config.txt is deliberately unavailable. External connect requests blocked by CSP. Native JS dialogs are recorded and dismissed/declined.', origin, host, out, passed: checks.length - failures.length, failed: failures.length, checks, errors, stages, failedRequests: requests.filter(item => item.status !== 200), requestCount: requests.length };
  fs.writeFileSync(path.join(out, 'host-smoke.json'), JSON.stringify(result, null, 2) + '\n');
  const boot = stages.find(item => item.name === 'full-host-boot')?.state;
  console.log(JSON.stringify({ out, passed: result.passed, failed: result.failed, errors, boot: boot ? { ...boot, diagnostics: { errors: boot.diagnostics?.errors, rejections: boot.diagnostics?.rejections, dialogs: boot.diagnostics?.dialogs, logCount: boot.diagnostics?.logs?.length } } : null, failedRequests: result.failedRequests.slice(0, 30), requestCount: requests.length }, null, 2));
  if (page) { try { await bounded(page.close(), 'isolated browser cleanup', 3000); } catch (error) { journal('cleanup-error', { message: error.message }); } }
  diagnosticSocket?.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  process.exitCode = failures.length || errors.length ? 1 : 0;
}
