#!/usr/bin/env node
/**
 * U3 · 启动恢复与进程中断反例（2026-11-05）
 *
 * 真实 core/csh_update.js 事务在隔离 vm 里跑，注入故障模拟进程在
 * 下载 / 备份 / prepared / 逐文件提交 / committed 后凭据清理 被终止，
 * 然后用「新的 create(io)」模拟下一次启动的 recover()，核对三种结局之一。
 * 另测：文件接口超时只标记「结果未知」，不宣布未写入、不清凭据、不放行新任务；
 * 迟到回调到达也不改变结论；启动恢复模块在业务包启用前同步拦截，且不删用户数据。
 * 隔离内存磁盘 + 可控定时器，无真机安装。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const argAt = process.argv.indexOf('--out');
if (argAt < 0) throw Error('--out required');
const out = path.resolve(process.argv[argAt + 1]);
fs.mkdirSync(out, { recursive: true });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const enc = s => new TextEncoder().encode(s);
const dec = v => v && new TextDecoder().decode(v);
const PREFIX = 'extension/池子魔将/';
const JOURNAL = 'extension/.csh-updates/chizi-mojiang/journal.json';
const KEY = 'csh_update_recovery_pending_v1';
const checks = [];
const check = async (name, fn) => {
	try { const r = await fn(); checks.push({ name, passed: r === true, ...(r === true ? {} : { detail: r }) }); }
	catch (e) { checks.push({ name, passed: false, error: e.stack || String(e) }); }
};

/* 一个共享 sandbox：csh_update.js 的 IIFE 与 csh_startup_recovery.js 的
   globalThis 指向同一对象，等价于真实页面里的 window。 */
function makeEnv() {
	const store = new Map();
	store.set('csh_user_save', 'keep-me');
	const timers = new Map();
	let tid = 0;
	const sandbox = {
		crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, AbortController, console,
		localStorage: {
			getItem: k => (store.has(k) ? store.get(k) : null),
			setItem: (k, v) => store.set(k, String(v)),
			removeItem: k => store.delete(k),
		},
		setTimeout(fn) { const n = ++tid; timers.set(n, fn); return n; },
		clearTimeout(n) { timers.delete(n); },
	};
	const ctx = vm.createContext(sandbox);
	vm.runInContext(fs.readFileSync(root + '/core/csh_update.js', 'utf8'), ctx);
	/* 启动恢复模块是 ESM；探针里剥离 import/export 后在 vm 里求值（不改产品源码）。 */
	let startup = fs.readFileSync(root + '/core/csh_startup_recovery.js', 'utf8')
		.replace(/^import\s+["'].*?["'];?\s*$/gm, '')
		.replace(/\bexport\s+/g, '');
	vm.runInContext(startup, ctx);
	return { ctx, store, timers, API: ctx.CSHUpdate };
}

function memory() {
	const data = new Map();
	data.set(PREFIX + 'a.js', enc('old-a'));
	data.set(PREFIX + 'extension.js', enc('old-entry'));
	const fault = { write: null, read: null, remove: null, hangWrite: null, releaseHang: null };
	const writes = [];
	const io = {
		scope: 'u3-test',
		async read(f) { if (fault.read && fault.read(f)) throw Error('read-fault'); return data.has(f) ? data.get(f).slice() : null; },
		async write(f, v) {
			writes.push(f);
			if (fault.hangWrite && fault.hangWrite(f, v)) return new Promise(r => { fault.releaseHang = r; });
			if (fault.write && fault.write(f, v)) throw Error('write-fault');
			data.set(f, v.slice());
		},
		async remove(f) { if (fault.remove && fault.remove(f)) throw Error('remove-fault'); data.delete(f); },
	};
	return { data, fault, writes, io, value: r => dec(data.get(PREFIX + r)) };
}

async function runApply(env, h, faultSetup) {
	const good = await env.API.digest(enc('new'));
	faultSetup(h.fault);
	try {
		await env.API.create(h.io).apply(['a.js', 'extension.js'], async () => enc('new'), { hashes: { 'a.js': good, 'extension.js': good } });
		return 'resolved';
	} catch (e) { return e; }
}
const restartRecover = (env, h) => env.API.create(h.io).recover();

/* ---------- 1—5：代表性中断点，下一次启动的结局 ---------- */
await check('1/download interruption: no journal, original bytes intact', async () => {
	const env = makeEnv(), h = memory();
	try { await env.API.create(h.io).apply(['a.js'], async () => { throw Error('network-lost'); }, {}); } catch (_e) {}
	const r = await restartRecover(env, h);
	return (h.value('a.js') === 'old-a' && r.empty === true && env.ctx.CSHUpdate.isRecoveryPending() === false)
		? true : JSON.stringify({ value: h.value('a.js'), recover: r, pending: env.ctx.CSHUpdate.isRecoveryPending() });
});
await check('2/backup interruption: no journal, original bytes intact', async () => {
	const env = makeEnv(), h = memory();
	const good = await env.API.digest(enc('new'));
	h.fault.write = f => f.indexOf('/before/') >= 0;
	try { await env.API.create(h.io).apply(['a.js'], async () => enc('new'), { hashes: { 'a.js': good, 'extension.js': good } }); } catch (_e) {}
	const r = await restartRecover(env, h);
	return h.value('a.js') === 'old-a' && r.empty === true && !env.ctx.CSHUpdate.isRecoveryPending()
		? true : JSON.stringify({ value: h.value('a.js'), recover: r });
});
await check('3/prepared interruption: journal left, next boot reports untouched', async () => {
	const env = makeEnv(), h = memory();
	h.fault.write = (f, v) => f === JOURNAL && dec(v).includes('"phase":"committing"');
	const e = await runApply(env, h, () => {});
	const r = await restartRecover(env, h);
	return h.value('a.js') === 'old-a' && (r.untouched === true || r.empty === true) && !env.ctx.CSHUpdate.isRecoveryPending()
		? true : JSON.stringify({ value: h.value('a.js'), recover: r, error: String(e && e.message || e) });
});
await check('4/commit interruption: rollback restores original bytes', async () => {
	const env = makeEnv(), h = memory();
	h.fault.write = (f, v) => f === PREFIX + 'extension.js' && dec(v) === 'new';
	const e = await runApply(env, h, () => {});
	const r = await restartRecover(env, h);
	return h.value('a.js') === 'old-a' && h.value('extension.js') === 'old-entry' && (r.empty === true || r.recovered === true)
		? true : JSON.stringify({ a: h.value('a.js'), entry: h.value('extension.js'), recover: r, error: String(e && e.message || e), journal: h.data.has(JOURNAL), pending: env.ctx.CSHUpdate.isRecoveryPending() });
});
await check('5/committed cleanup failure: next boot keeps new files and clears journal', async () => {
	const env = makeEnv(), h = memory();
	h.fault.remove = f => f === JOURNAL;
	const e = await runApply(env, h, () => {});
	h.fault.remove = null;
	const r = await restartRecover(env, h);
	return h.value('a.js') === 'new' && h.value('extension.js') === 'new' && r.committed === true
		&& !env.ctx.CSHUpdate.isRecoveryPending() && !h.data.has(JOURNAL)
		? true : JSON.stringify({ a: h.value('a.js'), entry: h.value('extension.js'), recover: r, pending: env.ctx.CSHUpdate.isRecoveryPending(), journal: h.data.has(JOURNAL), error: String(e && e.message || e) });
});

/* ---------- 6：超时不宣布未写入、不放行新任务；迟到回调不改变结论 ---------- */
await check('6/IO timeout keeps journal/lock and ignores late callback', async () => {
	const env = makeEnv(), h = memory();
	h.fault.hangWrite = (f, v) => f === JOURNAL && dec(v).includes('"phase":"prepared"');
	let error = null;
	const good = await env.API.digest(enc('new'));
	const pending = env.API.create(h.io).apply(['a.js', 'extension.js'], async () => enc('new'), { hashes: { 'a.js': good, 'extension.js': good } });
	for (let i = 0; i < 100 && !h.writes.includes(JOURNAL); i++) await new Promise(r => setImmediate(r));
	const timerFns = [...env.timers.values()];
	if (!timerFns.length) return JSON.stringify({ reason: 'no timer registered', timers: env.timers.size, writes: h.writes.slice(-6) });
	for (const fn of timerFns) fn();                                 // 触发超时观察
	try { await pending; } catch (e) { error = e; }
	const late = typeof h.fault.releaseHang === 'function';
	if (late) { h.fault.releaseHang(); await Promise.resolve(); await Promise.resolve(); }
	let refused = false, secondErr = '';
	try { await env.API.create(h.io).apply(['a.js'], async () => enc('new'), {}); }
	catch (e2) { secondErr = String(e2 && e2.message || e2); refused = /正在进行/.test(secondErr); }
	return !!(error && error.uncertain === true && error.recovery === true
		&& env.ctx.CSHUpdate.isRecoveryPending() === true && refused)
		? true : JSON.stringify({ uncertain: !!(error && error.uncertain), recovery: !!(error && error.recovery), pending: env.ctx.CSHUpdate.isRecoveryPending(), refused, late, secondErr });
});

/* ---------- 7—10：启动恢复模块 ---------- */
await check('7/pending flag is readable synchronously before any IO', async () => {
	const env = makeEnv();
	const before = env.ctx.cshRecoveryPending();
	env.store.set(KEY, '1');
	const after = env.ctx.cshRecoveryPending();
	env.ctx.cshClearRecoveryPending();
	return before === false && after === true && env.ctx.cshRecoveryPending() === false
		? true : JSON.stringify({ before, after });
});
await check('8/protected package disables all business content but keeps version and user data', () => {
	const env = makeEnv();
	let contentCalled = false;
	const full = {
		name: '池子魔将', content: () => { contentCalled = true; }, precontent: () => {},
		help: {}, config: {},
		package: { character: { a: 1 }, card: { b: 2 }, skill: { c: 3 }, intro: 'x', author: '池上寒', version: '4.0.15' },
	};
	const safe = env.ctx.cshProtectedPackage(full);
	return Object.keys(safe.package.character).length === 0 && Object.keys(safe.package.card).length === 0
		&& Object.keys(safe.package.skill).length === 0 && safe.package.version === '4.0.15'
		&& typeof safe.content === 'function' && contentCalled === false
		&& env.store.get('csh_user_save') === 'keep-me'
		? true : JSON.stringify({ safe, contentCalled });
});
await check('9/startup recovery clears pending on success, keeps it on failure; never restarts', async () => {
	const env = makeEnv();
	env.store.set(KEY, '1');
	const API = env.ctx.CSHUpdate;
	const oldHostIO = API.hostIO, oldCreate = API.create;
	let reloads = 0;
	API.hostIO = () => ({ scope: 'u3-startup' });
	API.create = () => ({ recover: async () => ({ ok: true, empty: true }) });
	const ok = await env.ctx.cshRecoverAtStartup({ game: { reload: () => { reloads++; } } });
	const pendingAfterOk = env.ctx.CSHUpdate.isRecoveryPending();
	env.store.set(KEY, '1');
	API.create = () => ({ recover: async () => { throw Error('权限不足'); } });
	const bad = await env.ctx.cshRecoverAtStartup({});
	const pendingAfterBad = env.ctx.CSHUpdate.isRecoveryPending();
	API.hostIO = oldHostIO; API.create = oldCreate;
	return ok.ok === true && ok.needRestart === true && pendingAfterOk === false
		&& bad.ok === false && bad.needRestart === true && pendingAfterBad === true
		&& reloads === 0 && env.store.get('csh_user_save') === 'keep-me'
		? true : JSON.stringify({ ok, bad, reloads, pendingAfterOk, pendingAfterBad });
});
await check('10/extension.js wires recovery before any business import', () => {
	const src = fs.readFileSync(root + '/extension.js', 'utf8');
	const guard = src.indexOf('core/csh_startup_recovery.js');
	const bootstrap = src.indexOf('import "./main/bootstrap.js"');
	const decision = src.indexOf('cshRecoveryPending()');
	const safe = src.indexOf('cshProtectedPackage(full)');
	return guard >= 0 && bootstrap > guard && decision > guard && safe > decision
		? true : JSON.stringify({ guard, bootstrap, decision, safe });
});

const failed = checks.filter(x => !x.passed);
const result = {
	scope: 'Real csh_update.js transaction + startup recovery module in isolated vm; injected interruption points, controllable timers, in-memory disk. No device install.',
	passed: checks.length - failed.length,
	failed: failed.length,
	checks,
};
fs.writeFileSync(out + '/startup-recovery.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, checks: failed }, null, 2));
process.exitCode = failed.length ? 1 : 0;
