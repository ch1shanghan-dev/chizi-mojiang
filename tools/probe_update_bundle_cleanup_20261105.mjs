#!/usr/bin/env node
/**
 * U4 残余 · 失败组整组清理的安全判定（2026-11-06）
 *
 * 上一轮只开放了「无 journal 的失败组可只清 next/」，before/ 与说明仍永久占空间。
 * 本轮开放整组清理，但只在可证明安全时：
 *   · 明确失败 aborted / rolledback；或 staging / prepared 且无 journal 且超过 24h 冷静期
 *   · 无 journal 阻塞、元数据可核对、不是整组清理中断待重试的组
 *   · 必须存在**另一个**可校验回退（latest），且不会把它一起删掉
 * cleanup 执行时仍逐文件校验哈希、每个文件前查 journal、保留回退再复核。
 *
 * 真实 core/csh_update.js 的 backups 管理器 + 内存文件系统，不联网、不碰安装目录。
 * 用法：node tools/probe_update_bundle_cleanup_20261105.mjs --out <D盘目录>
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
const AREA = 'extension/.csh-updates/chizi-mojiang';
const JOURNAL = AREA + '/journal.json';
const META = 'backup.json';
const HOUR = 3600 * 1000;

const checks = [];
const check = async (name, fn) => {
	try { const r = await fn(); checks.push({ name, passed: r === true, ...(r === true ? {} : { detail: r }) }); }
	catch (e) { checks.push({ name, passed: false, error: String((e && e.stack) || e) }); }
};

function makeEnv() {
	const ctx = vm.createContext({ crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, AbortController, console });
	vm.runInContext(fs.readFileSync(root + '/core/csh_update.js', 'utf8'), ctx);
	return ctx.CSHUpdate;
}

function disk() {
	const files = new Map(), dirs = new Set();
	const addFile = (p, data) => {
		files.set(p, data instanceof Uint8Array ? data.slice() : enc(String(data)));
		let d = p.slice(0, p.lastIndexOf('/'));
		while (d && d !== '/') { dirs.add(d); d = d.slice(0, d.lastIndexOf('/')); }
	};
	const io = {
		scope: 'u4-bundle-test',
		async read(p) { return files.has(p) ? files.get(p).slice() : null; },
		async write(p, v) { addFile(p, v); },
		async remove(p) { files.delete(p); },
		async list(p) {
			const prefix = p.endsWith('/') ? p : p + '/';
			const fs2 = new Set(), ds = new Set();
			for (const k of files.keys()) if (k.startsWith(prefix)) {
				const rest = k.slice(prefix.length);
				if (!rest.includes('/')) fs2.add(rest); else ds.add(rest.split('/')[0]);
			}
			for (const d of dirs) if (d.startsWith(prefix)) {
				const rest = d.slice(prefix.length);
				if (rest && !rest.includes('/')) ds.add(rest);
			}
			return { files: [...fs2].sort(), directories: [...ds].sort() };
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

/** 造一个可核对的备份组。committed 组只有 before/（无 next/），其余组 before+next 都有。 */
async function group(API, d, id, opts = {}) {
	const state = opts.state || 'aborted';
	const created = opts.created != null ? opts.created : Date.now() - 48 * HOUR;
	const before = enc(opts.before || 'original-' + id);
	const beforeHash = await API.digest(before);
	const base = AREA + '/' + id + '/';
	d.addFile(base + 'before/a.js', before);
	const rec = { rel: 'a.js', existed: true, beforeHash, beforeSize: before.byteLength };
	if (state !== 'committed') {
		const next = enc(opts.next || 'downloaded-' + id);
		rec.nextHash = await API.digest(next);
		rec.nextSize = next.byteLength;
		d.addFile(base + 'next/a.js', next);
	}
	const meta = {
		v: 1, id, created, state, fromVersion: '4.0.15', toVersion: '4.0.16',
		files: [rec], ...(opts.metaExtra || {}),
	};
	d.addFile(base + META, enc(JSON.stringify(meta)));
	return { base, meta };
}

const setup = async (opts = {}) => {
	const API = makeEnv(), d = disk();
	const failedId = 'update-failed-1';
	const goodId = 'update-good-1';
	await group(API, d, goodId, { state: 'committed', created: Date.now() - 96 * HOUR });
	await group(API, d, failedId, { state: opts.state || 'aborted', created: opts.created, metaExtra: opts.metaExtra });
	if (opts.journal) d.addFile(JOURNAL, enc(JSON.stringify({ id: goodId, phase: 'prepared' })));
	if (opts.corruptMeta) d.addFile(AREA + '/' + failedId + '/' + META, enc('{not json'));
	return { API, d, mgr: API.backups(d.io), failedId, goodId };
};
const denied = async fn => { try { await fn(); return false; } catch (_e) { return true; } };

await check('1/explicitly aborted group with another verified fallback is bundle-cleanable', async () => {
	const { mgr, failedId, goodId } = await setup({ state: 'aborted' });
	const inv = await mgr.inventory({ keep: 2, budgetMB: 256 });
	const bad = inv.rows.find(r => r.id === failedId), good = inv.rows.find(r => r.id === goodId);
	return (bad.bundleCleanable === true && bad.protected === false && inv.retained === goodId && good.protected === true)
		? true : JSON.stringify({ bad, good, retained: inv.retained });
});

await check('2/bundle cleanup removes before, next and metadata while the fallback stays intact', async () => {
	const { mgr, d, failedId, goodId } = await setup({ state: 'aborted' });
	const plan = await mgr.plan({ keep: 2, budgetMB: 256, kind: 'bundle', ids: [failedId] });
	const r = await mgr.cleanup(plan.id);
	const left = [...d.files.keys()].filter(k => k.startsWith(AREA + '/' + failedId));
	const goodBefore = d.files.get(AREA + '/' + goodId + '/before/a.js');
	return (r.ok === true && r.freedBytes > 0 && plan.retained === goodId && left.length === 0 && !!goodBefore)
		? true : JSON.stringify({ r, plan, left, goodBefore: !!goodBefore });
});

await check('3/without another verified fallback the failed group stays protected', async () => {
	const API = makeEnv(), d = disk();
	await group(API, d, 'update-failed-1', { state: 'aborted' });
	const mgr = API.backups(d.io);
	const inv = await mgr.inventory({ keep: 2, budgetMB: 256 });
	const row = inv.rows[0];
	return (row.bundleCleanable === false && row.protected === true &&
		await denied(() => mgr.plan({ keep: 2, budgetMB: 256, kind: 'bundle', ids: ['update-failed-1'] })))
		? true : JSON.stringify({ row, retained: inv.retained });
});

await check('4/recent orphan staging group stays in the 24h cooling-off period', async () => {
	const { mgr, failedId } = await setup({ state: 'staging', created: Date.now() - 2 * HOUR });
	const inv = await mgr.inventory({ keep: 2, budgetMB: 256 });
	const row = inv.rows.find(r => r.id === failedId);
	return (row.bundleCleanable === false && row.protected === true && row.downloadsCleanable === true &&
		await denied(() => mgr.plan({ keep: 2, budgetMB: 256, kind: 'bundle', ids: [failedId] })) &&
		!await denied(() => mgr.plan({ keep: 2, budgetMB: 256, kind: 'next', ids: [failedId] })))
		? true : JSON.stringify({ row });
});

await check('5/orphan staging group older than 24h becomes bundle-cleanable', async () => {
	const { mgr, failedId, goodId } = await setup({ state: 'prepared', created: Date.now() - 72 * HOUR });
	const inv = await mgr.inventory({ keep: 2, budgetMB: 256 });
	const row = inv.rows.find(r => r.id === failedId);
	const plan = await mgr.plan({ keep: 2, budgetMB: 256, kind: 'bundle', ids: [failedId] });
	return (row.bundleCleanable === true && plan.retained === goodId) ? true : JSON.stringify({ row, plan });
});

await check('6/an active journal protects every group from bundle cleanup', async () => {
	const { mgr, failedId } = await setup({ state: 'aborted', journal: true });
	const inv = await mgr.inventory({ keep: 2, budgetMB: 256 });
	const row = inv.rows.find(r => r.id === failedId);
	return (!!inv.blocked && row.protected === true && row.bundleCleanable === false &&
		await denied(() => mgr.plan({ keep: 2, budgetMB: 256, kind: 'bundle', ids: [failedId] })))
		? true : JSON.stringify({ blocked: inv.blocked, row });
});

await check('7/unverifiable metadata is never bundle-cleanable', async () => {
	const { mgr, failedId } = await setup({ state: 'aborted', corruptMeta: true });
	const inv = await mgr.inventory({ keep: 2, budgetMB: 256 });
	const row = inv.rows.find(r => r.id === failedId);
	return (row.trusted === false && row.bundleCleanable === false &&
		await denied(() => mgr.plan({ keep: 2, budgetMB: 256, kind: 'bundle', ids: [failedId] })))
		? true : JSON.stringify({ row });
});

await check('8/automatic over-quota selection deletes the failed group but never the retained fallback', async () => {
	const { mgr, d, failedId, goodId } = await setup({ state: 'rolledback' });
	const plan = await mgr.plan({ keep: 1, budgetMB: 256, kind: 'bundle' });
	const r = await mgr.cleanup(plan.id);
	const leftFailed = [...d.files.keys()].filter(k => k.startsWith(AREA + '/' + failedId));
	const goodBefore = d.files.get(AREA + '/' + goodId + '/before/a.js');
	return (plan.groups === 1 && plan.retained === goodId && r.ok === true &&
		leftFailed.length === 0 && !!goodBefore)
		? true : JSON.stringify({ plan, r, leftFailed, goodBefore: !!goodBefore });
});

await check('9/cleanup refuses when the retained fallback is damaged between plan and execution', async () => {
	const { mgr, d, failedId, goodId } = await setup({ state: 'aborted' });
	const plan = await mgr.plan({ keep: 2, budgetMB: 256, kind: 'bundle', ids: [failedId] });
	d.addFile(AREA + '/' + goodId + '/before/a.js', enc('tampered'));
	return await denied(() => mgr.cleanup(plan.id)) ? true : 'tampered fallback was accepted';
});

await check('10/interrupted bundle cleanup stays retryable instead of being permanently stuck', async () => {
	const { mgr, failedId, goodId } = await setup({
		state: 'aborted', metaExtra: { cleaning: { kind: 'bundle', started: Date.now() - 1000 } },
	});
	const inv = await mgr.inventory({ keep: 2, budgetMB: 256 });
	const row = inv.rows.find(r => r.id === failedId);
	const plan = await mgr.plan({ keep: 2, budgetMB: 256, kind: 'bundle', ids: [failedId] });
	return (row.interrupted === true && row.bundleCleanable === true && plan.retained === goodId)
		? true : JSON.stringify({ row, plan });
});

const result = {
	scope: 'Actual backups manager in isolated vm + in-memory filesystem. No network, no player backups touched.',
	passed: checks.filter(c => c.passed).length,
	failed: checks.filter(c => !c.passed).length,
	checks,
};
fs.writeFileSync(path.join(out, 'bundle-cleanup.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ passed: result.passed, failed: result.failed, checks: checks.filter(c => !c.passed) }, null, 2));
if (result.failed) process.exitCode = 1;
