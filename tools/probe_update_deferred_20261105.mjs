/* 局中更新 · 事务层三态反例（2026-11-05）
   prepare：下载+备份+journal(prepared)，目标目录一个字节不改；
   commit：局后写入并核验；abortPrepared：丢弃暂存；
   重启后 recover 对 prepared 应「未动过」并清凭据。
   真实 core/csh_update.js + 内存 IO，不联网、不碰安装目录。 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const root = arg('--root', path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const out = arg('--out', 'D:/CodexWork/chizi-mojiang/workbuddy/outputs/wb-public/ingame/deferred');
const source = fs.readFileSync(path.join(root, 'core/csh_update.js'), 'utf8');
const ctx = vm.createContext({ crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, AbortController, console });
vm.runInContext(source, ctx);
const API = ctx.CSHUpdate;
const enc = s => new TextEncoder().encode(s);
const dec = x => x && new TextDecoder().decode(x);
const prefix = 'extension/池子魔将/';
const journal = 'extension/.csh-updates/chizi-mojiang/journal.json';
const checks = [];
const check = async (name, fn) => {
	try { const r = await fn(); checks.push({ name, passed: r === true, ...(r === true ? {} : { detail: r }) }); }
	catch (e) { checks.push({ name, passed: false, error: String(e && e.stack || e) }); }
};
function memory() {
	const data = new Map([[prefix + 'a.js', enc('old-long-a')], [prefix + 'b.js', enc('old-b')]]);
	const io = {
		async read(f) { return data.has(f) ? data.get(f).slice() : null; },
		async write(f, v) { data.set(f, v.slice()); },
		async remove(f) { data.delete(f); },
	};
	return { data, io, tx: API.create(io), value: r => dec(data.get(prefix + r)), phase() { try { return JSON.parse(dec(data.get(journal))).phase; } catch (e) { return null; } } };
}
const newHash = async () => API.digest(enc('new'));

await check('1/prepare downloads and journals but changes no installed byte', async () => {
	const h = memory(), hash = await newHash();
	const p = await h.tx.prepare(['a.js'], async () => enc('new'), { hashes: { 'a.js': hash } });
	return (p.ok === true && p.id && h.value('a.js') === 'old-long-a' && h.phase() === 'prepared') ? true : { p, value: h.value('a.js'), phase: h.phase() };
});

await check('2/commit after prepare installs verified bytes and clears the journal', async () => {
	const h = memory(), hash = await newHash();
	const p = await h.tx.prepare(['a.js'], async () => enc('new'), { hashes: { 'a.js': hash } });
	const r = await h.tx.commit(p);
	return (r.ok === true && h.value('a.js') === 'new' && !h.data.has(journal)) ? true : { r, value: h.value('a.js'), hasJournal: h.data.has(journal) };
});

await check('3/abortPrepared keeps originals and clears the journal', async () => {
	const h = memory(), hash = await newHash();
	await h.tx.prepare(['a.js'], async () => enc('new'), { hashes: { 'a.js': hash } });
	const r = await h.tx.abortPrepared();
	return (r.ok === true && h.value('a.js') === 'old-long-a' && !h.data.has(journal)) ? true : { r, value: h.value('a.js'), hasJournal: h.data.has(journal) };
});

await check('4/restart recover drops prepared staging without touching installed files', async () => {
	const h = memory(), hash = await newHash();
	await h.tx.prepare(['a.js'], async () => enc('new'), { hashes: { 'a.js': hash } });
	const fresh = API.create(h.io);
	const r = await fresh.recover();
	return (r.ok === true && r.untouched === true && h.value('a.js') === 'old-long-a' && !h.data.has(journal)) ? true : { r, value: h.value('a.js'), hasJournal: h.data.has(journal) };
});

await check('5/commit with a mismatched prepared id is refused and keeps originals', async () => {
	const h = memory(), hash = await newHash();
	const p = await h.tx.prepare(['a.js'], async () => enc('new'), { hashes: { 'a.js': hash } });
	let err = null;
	try { await h.tx.commit({ ...p, id: 'update-forged' }); } catch (e) { err = e; }
	return (!!err && h.value('a.js') === 'old-long-a' && h.phase() === 'prepared') ? true : { message: err && err.message, value: h.value('a.js'), phase: h.phase() };
});

await check('6/tampered staging is refused and originals are restored', async () => {
	const h = memory(), hash = await newHash();
	const p = await h.tx.prepare(['a.js'], async () => enc('new'), { hashes: { 'a.js': hash } });
	const staged = 'extension/.csh-updates/chizi-mojiang/' + p.id + '/next/a.js';
	h.data.set(staged, enc('evil'));
	let err = null;
	try { await h.tx.commit(p); } catch (e) { err = e; }
	return (!!err && h.value('a.js') === 'old-long-a' && !h.data.has(journal)) ? true : { message: err && err.message, value: h.value('a.js'), hasJournal: h.data.has(journal) };
});

await check('7/failed download during prepare leaves no journal and no installed change', async () => {
	const h = memory(), hash = await newHash();
	let err = null;
	try { await h.tx.prepare(['a.js', 'b.js'], async rel => { if (rel === 'b.js') throw Error('network'); return enc('new'); }, { hashes: { 'a.js': hash, 'b.js': hash } }); } catch (e) { err = e; }
	return (!!err && h.value('a.js') === 'old-long-a' && h.value('b.js') === 'old-b' && !h.data.has(journal)) ? true : { message: err && err.message, a: h.value('a.js'), hasJournal: h.data.has(journal) };
});

await check('8/apply remains prepare+commit and installs in one call', async () => {
	const h = memory(), hash = await newHash();
	const r = await h.tx.apply(['a.js'], async () => enc('new'), { hashes: { 'a.js': hash } });
	return (r.ok === true && r.count === 1 && h.value('a.js') === 'new' && !h.data.has(journal)) ? true : { r, value: h.value('a.js') };
});

const result = {
	scope: 'Actual update transaction with in-memory IO; prepare/commit/abort three-state. No network, no installed profile.',
	passed: checks.filter(c => c.passed).length,
	failed: checks.filter(c => !c.passed).length,
	checks,
};
if (out) { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'deferred.json'), JSON.stringify(result, null, 2)); }
console.log(JSON.stringify({ passed: result.passed, failed: result.failed, checks: checks.filter(c => !c.passed) }, null, 2));
if (result.failed) process.exitCode = 1;
