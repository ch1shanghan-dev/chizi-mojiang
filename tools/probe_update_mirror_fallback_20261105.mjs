#!/usr/bin/env node
/**
 * U2 · 镜像/缓存/完整性反例（2026-11-05）
 *
 * 把 **真实的 startUpdate** 与 **真实的 csh_update.js 事务**放进隔离 vm，
 * 用可控的多源响应复现交接第 4 节 U2：首个 HTTP 200 返回旧缓存内容时，
 * 旧实现直接在更外层报摘要不符、不再试其他镜像。
 * 这里验证：按同一目录预期哈希逐源核验，旧缓存/HTML/空/截断/404/5xx 全部拒绝后
 * 继续尝试可信源；全源失败不写安装文件、不写版本、不重启；目录与文件同源起步。
 * 隔离内存磁盘，无网络、无真机安装。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parse, walk } from './lib/skill_audit.mjs';

const argAt = process.argv.indexOf('--out');
if (argAt < 0) throw Error('--out required');
const out = path.resolve(process.argv[argAt + 1]);
fs.mkdirSync(out, { recursive: true });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const enc = s => new TextEncoder().encode(s);
const dec = v => v && new TextDecoder().decode(v);

const updateSrc = fs.readFileSync(root + '/core/csh_update.js', 'utf8');
const apiCtx = vm.createContext({ crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, AbortController, console });
vm.runInContext(updateSrc, apiCtx);
const API = apiCtx.CSHUpdate;

const debugSrc = fs.readFileSync(root + '/core/csh_debug.js', 'utf8');
const ast = parse(debugSrc);
const pieces = {};
walk(ast, n => {
	if (n.type === 'FunctionDeclaration' && ['startUpdate', 'updateBases', 'cshFetchText'].includes(n.id?.name)) {
		pieces[n.id.name] = debugSrc.slice(...n.range);
	}
});
for (const k of ['startUpdate', 'updateBases', 'cshFetchText']) if (!pieces[k]) throw Error('missing ' + k);

const BASES = ['https://s1.invalid/', 'https://s2.invalid/', 'https://s3.invalid/'];
const PREFIX = 'extension/池子魔将/';
const JOURNAL = 'extension/.csh-updates/chizi-mojiang/journal.json';
const checks = [];
const check = async (name, fn) => {
	try { const r = await fn(); checks.push({ name, passed: r === true, ...(r === true ? {} : { detail: r }) }); }
	catch (e) { checks.push({ name, passed: false, error: e.stack || String(e) }); }
};

function memory() {
	const data = new Map();
	data.set(PREFIX + 'a.js', enc('old-a'));
	data.set(PREFIX + 'extension.js', enc('old-entry'));
	const io = {
		async read(f) { return data.has(f) ? data.get(f).slice() : null; },
		async write(f, v) { data.set(f, v.slice()); },
		async remove(f) { data.delete(f); },
	};
	return { data, io, value: r => dec(data.get(PREFIX + r)) };
}

function response(spec) {
	const headers = {
		get: k => {
			const map = spec.headers || {};
			return Object.prototype.hasOwnProperty.call(map, String(k).toLowerCase()) ? map[String(k).toLowerCase()] : null;
		},
	};
	if (spec.type === 'http') return { ok: false, status: spec.status || 404, redirected: false, headers, arrayBuffer: async () => new ArrayBuffer(0), text: async () => '' };
	if (spec.type === 'throw') throw { type: 'error', status: 0 };
	const body = spec.body != null ? enc(spec.body) : new Uint8Array(0);
	return {
		ok: true, status: 200, redirected: !!spec.redirected, headers,
		arrayBuffer: async () => Uint8Array.from(body).buffer,
		text: async () => dec(body),
	};
}

async function runUpdate(plan) {
	const h = memory();
	const requests = [];
	const saved = [];
	let reloads = 0;
	const timers = new Map();
	let tid = 0;
	const box = vm.createContext({
		window: { CSHUpdate: { ...API, hostIO: () => h.io } },
		lib: { config: {} },
		game: { saveConfig: (...a) => saved.push(a), reload: () => { reloads++; } },
		_status: {}, status: { textContent: '' }, _cshUpdating: false,
		AbortController, Uint8Array, encodeURI, console,
		onlineFetch: async (url, opts) => {
			requests.push(url);
			const idx = BASES.findIndex(b => url.startsWith(b));
			return response(plan[idx] || { type: 'throw' });
		},
		updateBases: () => BASES.slice(),
		cshIsCode: () => true,
		setTimeout(fn) { const n = ++tid; timers.set(n, fn); return n; },
		clearTimeout(n) { timers.delete(n); },
	});
	vm.runInContext(pieces.startUpdate, box);
	const good = await API.digest(enc('new'));
	const info = { files: ['a.js'], hashes: { 'a.js': good, 'extension.js': good }, build: 'test-build' };
	await box.startUpdate(info, '4.1.0', {}, {});
	return { h, requests, saved, reloads, timers, status: box.status.textContent, updating: box._cshUpdating };
}

const GOOD = { type: 'ok', body: 'new' };
const OLD = { type: 'ok', body: 'old-cache-content' };
const success = r => r.h.value('a.js') === 'new' && r.h.value('extension.js') === 'new' && r.saved.length === 2 && !r.h.data.has(JOURNAL);
const secondSourceUsed = r => r.requests.some(u => u.startsWith(BASES[1]));

await check('1/first source stale cache falls back to next trusted source', async () => {
	const r = await runUpdate([OLD, GOOD, GOOD]);
	return success(r) && secondSourceUsed(r) ? true : JSON.stringify({ value: r.h.value('a.js'), saved: r.saved.length, requests: r.requests });
});
await check('2/HTML error page rejected, fallback succeeds', async () => {
	const r = await runUpdate([{ type: 'ok', body: '<html>proxy error</html>', headers: { 'content-type': 'text/html' } }, GOOD, GOOD]);
	return success(r) && secondSourceUsed(r) ? true : JSON.stringify({ value: r.h.value('a.js'), requests: r.requests });
});
await check('3/empty response rejected, fallback succeeds', async () => {
	const r = await runUpdate([{ type: 'ok', body: '' }, GOOD, GOOD]);
	return success(r) && secondSourceUsed(r) ? true : JSON.stringify({ value: r.h.value('a.js'), requests: r.requests });
});
await check('4/HTTP 404 rejected, fallback succeeds', async () => {
	const r = await runUpdate([{ type: 'http', status: 404 }, { type: 'http', status: 503 }, GOOD]);
	return success(r) && r.requests.some(u => u.startsWith(BASES[2])) ? true : JSON.stringify({ value: r.h.value('a.js'), requests: r.requests });
});
await check('5/truncated response rejected, fallback succeeds', async () => {
	const r = await runUpdate([{ type: 'ok', body: 'new', headers: { 'content-length': '999' } }, GOOD, GOOD]);
	return success(r) && secondSourceUsed(r) ? true : JSON.stringify({ value: r.h.value('a.js'), requests: r.requests });
});
await check('6/redirected response rejected, fallback succeeds', async () => {
	const r = await runUpdate([{ type: 'ok', body: 'new', redirected: true }, GOOD, GOOD]);
	return success(r) && secondSourceUsed(r) ? true : JSON.stringify({ value: r.h.value('a.js'), requests: r.requests });
});
await check('7/all sources stale: no install, no version write, no restart', async () => {
	const r = await runUpdate([OLD, OLD, OLD]);
	return r.h.value('a.js') === 'old-a' && r.h.value('extension.js') === 'old-entry' && r.saved.length === 0 && r.timers.size === 0 && !r.h.data.has(JOURNAL)
		? true : JSON.stringify({ value: r.h.value('a.js'), saved: r.saved.length, timers: r.timers.size });
});
await check('8/all-source failure lists readable reasons', async () => {
	const r = await runUpdate([OLD, { type: 'http', status: 404 }, { type: 'throw' }]);
	return r.status.includes('未能完成') && r.status.includes('摘要不符') && r.status.includes('HTTP 404')
		? true : JSON.stringify({ status: r.status });
});
await check('9/download does not downgrade transaction digest check', () => {
	return /hash!==hashes\[rel\]/.test(updateSrc) && /hashes\[rel\]&&hash!==hashes\[rel\]/.test(updateSrc);
});
await check('10/updateBases starts from the catalog source and de-duplicates', () => {
	function bases(st, picked) {
		const ctx = vm.createContext({
			st, _cshUpdBase: picked, CSH_UPDATE_SRC: 'https://official.invalid/',
			CSH_UPDATE_MIRRORS: ['https://m1.invalid/', 'https://m2.invalid/'], console,
		});
		vm.runInContext(pieces.updateBases, ctx);
		return ctx.updateBases();
	}
	const a = bases({ candidateBase: 'https://candidate.invalid/' }, 'https://picked.invalid/');
	const b = bases({ candidateBase: null }, 'https://official.invalid/');
	return a[0] === 'https://candidate.invalid/' && a.length === 5 && new Set(a).size === a.length
		&& b[0] === 'https://official.invalid/' && b.length === 3 && new Set(b).size === b.length
		? true : JSON.stringify({ a, b });
});
await check('11/manifest text request rejects HTML and redirect', async () => {
	async function text(spec) {
		const ctx = vm.createContext({
			AbortController, setTimeout, clearTimeout, console,
			onlineFetch: async () => ({
				ok: true, redirected: !!spec.redirected,
				headers: { get: k => (String(k).toLowerCase() === 'content-type' ? (spec.ct || 'text/plain') : null) },
				text: async () => '{"version":"4.0.15"}',
			}),
		});
		vm.runInContext(pieces.cshFetchText, ctx);
		try { await ctx.cshFetchText('https://x.invalid/info.json', 100); return 'accepted'; }
		catch (e) { return String(e && e.message || e); }
	}
	const html = await text({ ct: 'text/html' });
	const redirect = await text({ redirected: true });
	const ok = await text({ ct: 'text/plain' });
	return html.includes('网页') && redirect.includes('跳转') && ok === 'accepted'
		? true : JSON.stringify({ html, redirect, ok });
});

const failed = checks.filter(x => !x.passed);
const result = {
	scope: 'Real startUpdate + real csh_update.js transaction in isolated vm; controllable multi-source responses and in-memory disk. No network or device install.',
	passed: checks.length - failed.length,
	failed: failed.length,
	checks,
};
fs.writeFileSync(out + '/mirrors.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, checks: failed }, null, 2));
process.exitCode = failed.length ? 1 : 0;
