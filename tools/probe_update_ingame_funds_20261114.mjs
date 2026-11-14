/* 局中直接更新（定案 B）· 常驻门禁（2026-11-14 批次 C）
 *
 * 作者要求：点「立即更新」就下载/核验/写入/重启，不等本局结束、不弹确认。
 * 但「不等整场结束」不等于「不等当前这一次存档落盘」——钱包/迁移仍有未决写入时
 * 必须等它写完再替换文件，否则局中重启可能让带入/补码凭据半写。本探针锁住两件事：
 *   ① 旧策略（本局结束后自动安装/自动重启、scheduleDeferredInstall、局中拒绝）彻底移除；
 *   ② 资金落盘护栏 waitPendingWrites 在事务 apply 之前生效，且局中确实直接提交并重启。
 *
 * 用法：node tools/probe_update_ingame_funds_20261114.mjs [--out <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parse, walk } from './lib/skill_audit.mjs';
import { auditTempRoot } from './lib/audit_scratch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', path.join(auditTempRoot(), 'update-ingame')));
fs.mkdirSync(out, { recursive: true });
const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(ok ? {} : { detail }) });
const save = o => { try { fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(o, null, 2)); } catch (e) {} };

const debug = fs.readFileSync(path.join(root, 'core/csh_debug.js'), 'utf8');
const updater = fs.readFileSync(path.join(root, 'core/csh_update.js'), 'utf8');

/* ---------- 1. 旧策略必须彻底移除（改前基线会在这里判红） ---------- */
const FORBIDDEN = [
  ['本局结束后自动安装', '不再提示「本局结束后自动安装」'],
  ['本局结束后自动重启', '不再提示「本局结束后自动重启」'],
  ['请在本局结束后安装扩展', '扩展商城入口不再拒绝局中安装'],
  ['新对局已开始，请结束后再继续安装', '商城链路不再因新对局中断'],
  ['scheduleDeferredInstall()', '不再启动延迟安装轮询'],
];
for (const [needle, label] of FORBIDDEN) check(label, !debug.includes(needle), needle);
check('不再有「局中只预下载」分支', !/if\s*\(needed\.length\s*&&\s*inGame\)/.test(debug));
check('apply 进度不再因新对局取消安装', !/检测到新对局，安装已取消/.test(debug));

/* ---------- 2. 资金落盘护栏：等当前写入完成，而非等一局结束 ---------- */
const applyAt = debug.indexOf('task.tx.apply(');
const waitAt = debug.indexOf('await waitPendingWrites()');
check('存在 waitPendingWrites 且在事务 apply 之前调用',
  /function waitPendingWrites|async function waitPendingWrites/.test(debug) && waitAt > 0 && applyAt > 0 && waitAt < applyAt,
  { waitAt, applyAt });
const guardAt = debug.indexOf('async function waitPendingWrites');
const guardBody = guardAt > 0 ? debug.slice(guardAt, guardAt + 900) : '';
check('护栏同时检查钱包 pending 与迁移未决',
  /cshWallet/.test(guardBody) && /recoveryState/.test(guardBody), guardBody.slice(0, 160));
check('护栏是短等待而非轮询整局',
  /for \(var i=0;i<40/.test(guardBody) && !/scheduleDeferredInstall/.test(guardBody));

/* ---------- 3. 动态：局中（gameStarted=true, over=false）直接提交并重启 ---------- */
const API = (() => {
  const ctx = vm.createContext({ crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, AbortController, console });
  vm.runInContext(updater, ctx);
  return ctx.CSHUpdate;
})();
let startSource = '';
walk(parse(debug), n => { if (n.type === 'FunctionDeclaration' && n.id?.name === 'startUpdate') startSource = debug.slice(...n.range); });
check('AST 能抽到真实 startUpdate', startSource.length > 1000);

const enc = s => new TextEncoder().encode(s);
const dec = x => x && new TextDecoder().decode(x);
const prefix = 'extension/池子魔将/';
const journal = 'extension/.csh-updates/chizi-mojiang/journal.json';
const hashOf = async () => API.digest(enc('new'));

function harness(activeMatch) {
  const data = new Map([[prefix + 'a.js', enc('old-a')], [prefix + 'extension.js', enc('old-entry')]]);
  const io = {
    async read(f) { return data.has(f) ? data.get(f).slice() : null; },
    async write(f, v) { data.set(f, v.slice()); },
    async remove(f) { data.delete(f); }
  };
  const saved = [], calls = [], timers = new Map();
  let tid = 0;
  const box = vm.createContext({
    window: { CSHUpdate: { ...API, hostIO: () => io } },
    lib: { config: {} },
    game: { saveConfig: (...a) => saved.push(a), reload: () => calls.push('reload') },
    _status: { gameStarted: activeMatch, over: false },
    status: {}, _cshUpdating: false,
    AbortController, Uint8Array, encodeURI,
    onlineFetch: async () => ({ ok: true, arrayBuffer: async () => enc('new').buffer }),
    updateBases: () => ['https://isolated.invalid/'],
    cshIsCode: () => true,
    setTimeout(fn) { const n = ++tid; timers.set(n, fn); return n; },
    clearTimeout(n) { timers.delete(n); }
  });
  vm.runInContext(startSource, box);
  return { box, data, saved, calls, timers, io, value: r => dec(data.get(prefix + r)) };
}

if (startSource) {
  const hashes = { 'a.js': await hashOf(), 'extension.js': await hashOf() };
  const h = harness(true);
  await h.box.startUpdate({ files: ['a.js', 'extension.js'], hashes, build: 'test-build' }, '4.1.0', {}, {});
  /* 局中直接提交：文件立刻是新版、版本写回、无待安装凭据 */
  check('局中点更新立即写入新版文件', h.value('a.js') === 'new' && h.value('extension.js') === 'new',
    { a: h.value('a.js'), entry: h.value('extension.js') });
  check('局中点更新不留下 __cshPendingInstall', !h.box.window.CSHUpdate.__cshPendingInstall);
  check('局中点更新写回版本号与 build', h.saved.some(x => x[0] === 'extension_池子魔将_version') && h.saved.some(x => x[0] === 'extension_池子魔将_build'), h.saved);
  check('状态文案不含「本局结束」', !String(h.box.status.textContent).includes('本局结束'), h.box.status.textContent);
  /* 重启由 setTimeout 排程，执行后应调用 reload（B：不等局结束） */
  for (const [, fn] of [...h.timers]) { try { fn(); } catch (e) {} await Promise.resolve(); }
  check('重启排程执行后调用 game.reload（不等整场结束）', h.calls.includes('reload'), { calls: h.calls, timers: h.timers.size });
  check('事务日志已清理（断电可恢复链路未破）', !h.data.has(journal));

  const h2 = harness(false);
  await h2.box.startUpdate({ files: ['a.js', 'extension.js'], hashes, build: 'test-build' }, '4.1.0', {}, {});
  check('局外更新行为与局中一致', h2.value('a.js') === 'new' && h2.value('extension.js') === 'new' && !h2.box.window.CSHUpdate.__cshPendingInstall);
}

const result = { scope: 'Direct in-game update (plan B): no deferred install, pending-write guard, immediate commit/reload', passed: rows.filter(r => r.passed).length, failed: rows.filter(r => !r.passed).length, rows };
save(result);
console.log(JSON.stringify(result));
if (result.failed) process.exitCode = 1;
