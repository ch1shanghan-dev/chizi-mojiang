#!/usr/bin/env node
/**
 * U4 · 失败暂存与容量边界反例（2026-11-05）
 *
 * A：真实 core/csh_update.js 的 backups 管理器在隔离 vm 里跑，构造
 *    「无 journal、实际已失败的 staging 组」，验证下载副本可单独清理、
 *    原文件副本与说明保留、整组仍不可删、journal 引用时全保护。
 * B：tools/lib/update_limits.mjs 的发布预检纯函数，验证 512KiB / 16MiB 上限、
 *    超限给出分块 / 完整包 / 提高上限三条出路，以及各处接线不漂移。
 * 隔离内存文件系统，无真机安装。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TEXT_LIMIT, FILE_LIMIT, checkLimits, limitsBlock, REMEDY, classify } from './lib/update_limits.mjs';

const argAt = process.argv.indexOf('--out');
if (argAt < 0) throw Error('--out required');
const out = path.resolve(process.argv[argAt + 1]);
fs.mkdirSync(out, { recursive: true });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const enc = s => new TextEncoder().encode(s);
const dec = v => v && new TextDecoder().decode(v);
const AREA = 'extension/.csh-updates/chizi-mojiang';
const JOURNAL = AREA + '/journal.json';
const META = 'backup.json';
const ID = 'update-failed-1';
const checks = [];
const check = async (name, fn) => {
	try { const r = await fn(); checks.push({ name, passed: r === true, ...(r === true ? {} : { detail: r }) }); }
	catch (e) { checks.push({ name, passed: false, error: e.stack || String(e) }); }
};

function makeEnv() {
	const sandbox = { crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, AbortController, console };
	const ctx = vm.createContext(sandbox);
	vm.runInContext(fs.readFileSync(root + '/core/csh_update.js', 'utf8'), ctx);
	return { ctx, API: ctx.CSHUpdate };
}

function disk() {
	const files = new Map(), dirs = new Set();
	const addFile = (p, data) => {
		const v = data instanceof Uint8Array ? data.slice() : enc(String(data));
		files.set(p, v);
		let d = p.slice(0, p.lastIndexOf('/'));
		while (d && d !== '/') { dirs.add(d); d = d.slice(0, d.lastIndexOf('/')); }
	};
	const io = {
		scope: 'u4-test',
		async read(p) { return files.has(p) ? files.get(p).slice() : null; },
		async write(p, v) { addFile(p, v); },
		async remove(p) { files.delete(p); },
		async list(p) {
			const prefix = p.endsWith('/') ? p : p + '/';
			const fs = new Set(), ds = new Set();
			for (const k of files.keys()) if (k.startsWith(prefix)) {
				const rest = k.slice(prefix.length);
				if (!rest.includes('/')) fs.add(rest); else ds.add(rest.split('/')[0]);
			}
			for (const d of dirs) if (d.startsWith(prefix)) {
				const rest = d.slice(prefix.length);
				if (rest && !rest.includes('/')) ds.add(rest);
			}
			return { files: [...fs].sort(), directories: [...ds].sort() };
		},
		async stat(p) {
			if (files.has(p)) return { kind: 'file', size: files.get(p).byteLength };
			if (dirs.has(p)) return { kind: 'directory', size: 0 };
			return null;
		},
		async removeEmptyDirectory(p) {
			if (![...files.keys()].some(k => k.startsWith(p + '/')) && ![...dirs].some(d => d.startsWith(p + '/'))) dirs.delete(p);
		},
	};
	return { files, dirs, io, addFile };
}

/** 构造一个无 journal 的失败 staging 组：before 有原文件、next 有下载副本、说明完整。 */
async function failedGroup(env, d) {
	const before = enc('original-module'), next = enc('downloaded-new-module');
	const beforeHash = await env.API.digest(before), nextHash = await env.API.digest(next);
	const base = AREA + '/' + ID + '/';
	d.addFile(base + 'before/a.js', before);
	d.addFile(base + 'next/a.js', next);
	const meta = {
		v: 1, id: ID, created: Date.now(), state: 'staging',
		fromVersion: '4.0.14', toVersion: '4.0.15',
		files: [{ rel: 'a.js', existed: true, beforeHash, beforeSize: before.byteLength, nextHash, nextSize: next.byteLength }],
	};
	d.addFile(base + META, enc(JSON.stringify(meta)));
	return { before, next, beforeHash, nextHash, base, meta };
}

await check('1/failed staging group exposes cleanable downloads (was permanently protected)', async () => {
	const env = makeEnv(), d = disk();
	await failedGroup(env, d);
	const mgr = env.API.backups(d.io);
	const inv = await mgr.inventory({ keep: 2, budgetMB: 256 });
	const row = inv.rows.find(r => r.id === ID);
	return row && row.trusted === true && row.state === 'staging' && row.downloadsCleanable === true
		? true : JSON.stringify({ row });
});
await check('2/next-only cleanup removes downloads but keeps originals and metadata', async () => {
	const env = makeEnv(), d = disk();
	const g = await failedGroup(env, d);
	const mgr = env.API.backups(d.io);
	const plan = await mgr.plan({ keep: 2, budgetMB: 256, kind: 'next', ids: [ID] });
	const res = await mgr.cleanup(plan.id);
	const meta = JSON.parse(dec(d.files.get(g.base + META)));
	return res.freedBytes > 0 && !d.files.has(g.base + 'next/a.js')
		&& d.files.has(g.base + 'before/a.js') && d.files.has(g.base + META)
		&& meta.nextRemoved === true
		? true : JSON.stringify({ res, meta, files: [...d.files.keys()] });
});
await check('3/bundle cleanup of a failed group is still refused (originals protected)', async () => {
	const env = makeEnv(), d = disk();
	await failedGroup(env, d);
	const mgr = env.API.backups(d.io);
	let err = '';
	try { await mgr.plan({ keep: 2, budgetMB: 256, kind: 'bundle', ids: [ID] }); }
	catch (e) { err = String(e && e.message || e); }
	return /原文件副本保留|保护|不能清理/.test(err) ? true : JSON.stringify({ err });
});
await check('4/journal-referenced group is fully protected from any cleanup', async () => {
	const env = makeEnv(), d = disk();
	await failedGroup(env, d);
	d.addFile(JOURNAL, enc(JSON.stringify({ v: 1, id: ID, phase: 'committing', files: [] })));
	const mgr = env.API.backups(d.io);
	const inv = await mgr.inventory({ keep: 2, budgetMB: 256 });
	const row = inv.rows.find(r => r.id === ID);
	let err = '';
	try { await mgr.plan({ keep: 2, budgetMB: 256, kind: 'next', ids: [ID] }); }
	catch (e) { err = String(e && e.message || e); }
	return !!inv.blocked && row.downloadsCleanable === false && /恢复|未完成/.test(err)
		? true : JSON.stringify({ blocked: inv.blocked, row, err });
});
await check('5/after cleanup the group is retained but no longer offers download cleanup', async () => {
	const env = makeEnv(), d = disk();
	await failedGroup(env, d);
	const mgr = env.API.backups(d.io);
	const plan = await mgr.plan({ keep: 2, budgetMB: 256, kind: 'next', ids: [ID] });
	await mgr.cleanup(plan.id);
	const inv = await mgr.inventory({ keep: 2, budgetMB: 256 });
	const row = inv.rows.find(r => r.id === ID);
	return row && row.downloadsCleanable === false && row.beforeBytes > 0 && row.nextBytes === 0
		? true : JSON.stringify({ row });
});

/* ---------- B：发布预检 ---------- */
await check('6/limits match csh_online.js and classify binary assets', () => {
	return TEXT_LIMIT === 512 * 1024 && FILE_LIMIT === 16 * 1024 * 1024
		&& classify('image/a.png') === 'binary' && classify('core/a.js') === 'text'
		? true : JSON.stringify({ TEXT_LIMIT, FILE_LIMIT });
});
await check('7/preflight accepts today largest file and reports maxFileBytes', () => {
	const r = checkLimits([{ path: 'core/big.js', size: 3.14 * 1024 * 1024 | 0 }, { path: 'a.png', size: 1024 }]);
	const b = limitsBlock([{ path: 'a', size: 10 }, { path: 'b', size: 999 }]);
	return r.ok && r.maxFileBytes > 3 * 1024 * 1024 && b.maxFileBytes === 999
		&& b.textBytes === TEXT_LIMIT && b.fileBytes === FILE_LIMIT
		? true : JSON.stringify({ r, b });
});
await check('8/oversize file is rejected with three explicit remedies before publish', () => {
	const r = checkLimits([{ path: 'audio/huge.mp3', size: FILE_LIMIT + 1 }]);
	return !r.ok && r.violations.length === 1 && r.violations[0].kind === 'binary'
		&& /分块/.test(REMEDY) && /完整安装包/.test(REMEDY) && /提高/.test(REMEDY)
		? true : JSON.stringify({ r, REMEDY });
});
await check('9/bad size is rejected rather than silently ignored', () => {
	const r = checkLimits([{ path: 'x', size: NaN }, { path: 'y', size: -1 }]);
	return !r.ok && r.violations.length === 2 ? true : JSON.stringify(r);
});
await check('10/release preflight and honest space wording are wired', () => {
	const rel = fs.readFileSync(root + '/tools/release.js', 'utf8');
	const dbg = fs.readFileSync(root + '/core/csh_debug.js', 'utf8');
	const onl = fs.readFileSync(root + '/core/csh_online.js', 'utf8');
	return /checkLimits\s*\(/.test(rel) && /limits:\s*limitsBlock/.test(rel)
		&& /16\s*\*\s*1024\s*\*\s*1024/.test(onl) && /512\s*\*\s*1024/.test(onl)
		&& /设备可用空间/.test(dbg) && /设备剩余空间无法可靠读取/.test(dbg)
		&& /info\.limits/.test(dbg)
		? true : JSON.stringify({ rel: /checkLimits\s*\(/.test(rel), dbg: /设备可用空间/.test(dbg) });
});

const failed = checks.filter(x => !x.passed);
const result = {
	scope: 'Real backups manager + release limit preflight in isolated vm / pure functions; in-memory filesystem. No device install.',
	passed: checks.length - failed.length,
	failed: failed.length,
	checks,
};
fs.writeFileSync(out + '/capacity.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, checks: failed }, null, 2));
process.exitCode = failed.length ? 1 : 0;
