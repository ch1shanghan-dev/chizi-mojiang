/* 行囊跨版本兼容专项（2026-11-05）。
   目标：承诺「以后的新版本必须能正确读旧行囊，且旧行囊不会清掉新版本的数据」。
   用真实 core/csh_migrate.js + core/csh_wallet.js，在隔离 localStorage 中执行；
   不接触玩家存档，不写项目文件。 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { root } from './lib/skill_audit.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const out = arg('--out', 'D:/CodexWork/chizi-mojiang/workbuddy/outputs/wb-public/migrate-compat');
fs.mkdirSync(out, { recursive: true });

const clean = s => s.replace(/^import .*?;\r?\n/gm, '');
const walletSource = fs.readFileSync(path.join(root, 'core/csh_wallet.js'), 'utf8');
const migrationSource = fs.readFileSync(path.join(root, 'core/csh_migrate.js'), 'utf8');
const PREFIX = 'CSHMIG1.';
const enc = obj => PREFIX + Buffer.from(JSON.stringify(obj), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = code => JSON.parse(Buffer.from(code.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));

function storage(seed) {
	const data = new Map(Object.entries(seed || {}));
	return {
		data,
		get length() { return data.size; },
		key(i) { return [...data.keys()][i] ?? null; },
		getItem(k) { return data.get(k) ?? null; },
		setItem(k, v) { data.set(k, String(v)); },
		removeItem(k) { data.delete(k); },
	};
}
function harness(seed) {
	const store = storage(seed);
	const timers = new Map(), listeners = { window: new Map(), document: new Map() };
	const listen = scope => (name, fn) => {
		if (!listeners[scope].has(name)) listeners[scope].set(name, []);
		listeners[scope].get(name).push(fn);
	};
	const lib = { config: {}, configprefix: 'probe_', skill: {}, translate: {} };
	let serial = 0;
	const context = vm.createContext({
		lib,
		game: { saveConfig(k, v) { if (v === undefined) delete lib.config[k]; else lib.config[k] = v; }, addGlobalSkill() {} },
		localStorage: store,
		window: { CSH: {}, addEventListener: listen('window') },
		document: { addEventListener: listen('document') },
		console: { log() {}, warn() {}, error() {} },
		crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob,
		ui: {}, get: {}, ai: {}, _status: {},
		setTimeout(fn) { const id = ++serial; timers.set(id, fn); return id; },
		clearTimeout(id) { timers.delete(id); },
	});
	vm.runInContext(clean(walletSource), context);
	vm.runInContext(clean(migrationSource), context);
	lib.cshWallet.flushSave();
	return { store, lib, M: lib.cshMigrate, W: lib.cshWallet.wallet };
}

const rows = [];
async function check(name, fn) {
	try {
		const r = await fn();
		rows.push({ name, passed: r === true, ...(r === true ? {} : { detail: r }) });
	} catch (e) {
		rows.push({ name, passed: false, detail: String(e && e.message || e) });
	}
}

/* 源环境：真实钱包 800，官阶与若干旧键 */
const source = harness({ csh_rank: JSON.stringify({ rank: 3, merit: 40 }), csh_ddz_name: '旧名字' });
source.W.add(800, 'fixture');
const current = await source.M.export();
const full = dec(current);
const sourcePc = full.wallet.pc;

await check('1/current export round-trips and reports v3', async () => {
	const r = await source.M.inspect(current);
	return (r.ok === true && r.meta.v === 3 && r.summary.pc === sourcePc && sourcePc === 2800) ? true
		: { summary: r.summary, sourcePc, meta: r.meta };
});

await check('2/current pack re-imports wallet into a fresh profile', async () => {
	const target = harness();
	const r = await target.M.import(current);
	const disk = JSON.parse(target.store.getItem('csh_wallet') || 'null');
	return (r.ok === true && r.applied === true && disk && disk.pc === sourcePc) ? true : { r, disk, sourcePc };
});

await check('3/v1 pack with only wallet+rank is accepted', async () => {
	const v1 = enc({ meta: { v: 1, t: 1, build: '4.0.4' }, wallet: full.wallet, rank: full.rank });
	const r = await source.M.inspect(v1);
	return (r.ok === true && r.meta.v === 1 && !!r.data.wallet && !!r.data.rank) ? true : r;
});

await check('4/v1 import applies wallet/rank but keeps newer local keys and other domains', async () => {
	const seed = {
		csh_rank: JSON.stringify({ rank: 7, merit: 99 }),
		csh_ddz_name: '新版本名字',
		csh_achievement_archive_v1: JSON.stringify({ v: 1, rows: [{ id: 'x' }] }),
		csh_goal_pins_v1: JSON.stringify({ career: ['cx_merit_400000'] }),
	};
	const target = harness(seed);
	const v1 = enc({ meta: { v: 1, t: 1, build: '4.0.4' }, wallet: { pc: 500, pcPeak: 500 }, rank: { rank: 3, merit: 40 } });
	const r = await target.M.import(v1);
	const wallet = JSON.parse(target.store.getItem('csh_wallet') || 'null');
	const keeps = ['csh_ddz_name', 'csh_achievement_archive_v1', 'csh_goal_pins_v1']
		.every(k => target.store.getItem(k) === seed[k]);
	return (r.ok === true && wallet && wallet.pc === 500 && keeps) ? true
		: { r, pc: wallet && wallet.pc, keeps, name: target.store.getItem('csh_ddz_name') };
});

await check('5/v2 pack with winrate is accepted', async () => {
	const v2 = enc({ meta: { v: 2, t: 1, build: '4.0.9' }, wallet: full.wallet, rank: full.rank, winrate: full.winrate });
	const r = await source.M.inspect(v2);
	return (r.ok === true && r.meta.v === 2) ? true : r;
});

await check('6/future v4 pack is rejected with upgrade hint', async () => {
	const v4 = enc({ meta: { v: 4, t: 1, build: '9.9.9' }, wallet: full.wallet });
	const r = await source.M.inspect(v4);
	return (r.ok === false && /升级扩展/.test(r.err || '')) ? true : r;
});

await check('7/tampered body is rejected by sum check', async () => {
	const bad = dec(current);
	bad.wallet = { ...bad.wallet, pc: 1 };
	const r = await source.M.inspect(enc(bad));
	return (r.ok === false && /校验不符/.test(r.err || '')) ? true : r;
});

await check('8/empty, bad prefix, bad base64 and bad json each fail safely', async () => {
	const cases = ['', 'NOPE.' + 'abc', PREFIX + '!!!', PREFIX + Buffer.from('{bad', 'utf8').toString('base64url')];
	const results = [];
	for (const c of cases) results.push(await source.M.inspect(c));
	return (results.every(r => r.ok === false && typeof r.err === 'string' && r.err.length > 0)) ? true : results;
});

await check('9/unknown keys are ignored and never written', async () => {
	const target = harness();
	const v1 = enc({ meta: { v: 1, t: 1, build: '4.0.4' }, wallet: { pc: 200 }, rank: { rank: 1, merit: 1 }, csh_unknown_domain: { boom: 1 } });
	const r = await target.M.import(v1);
	return (r.ok === true && target.store.getItem('csh_unknown_domain') === null) ? true : { r, leaked: target.store.getItem('csh_unknown_domain') };
});

await check('10/export after importing an old pack keeps newer local keys', async () => {
	const seed = { csh_achievement_archive_v1: JSON.stringify({ v: 1, rows: [] }), csh_ddz_name: '保留我' };
	const target = harness(seed);
	await target.M.import(enc({ meta: { v: 1, t: 1, build: '4.0.4' }, wallet: { pc: 300 } }));
	const again = dec(await target.M.export());
	const keeps = target.store.getItem('csh_achievement_archive_v1') === seed.csh_achievement_archive_v1
		&& target.store.getItem('csh_ddz_name') === seed.csh_ddz_name;
	return (keeps && !Object.prototype.hasOwnProperty.call(again, 'csh_achievement_archive_v1')) ? true : { keeps, exported: Object.keys(again) };
});

const result = {
	scope: 'Real csh_migrate.js + csh_wallet.js in isolated localStorage; no player saves, no project mutation.',
	format: { prefix: PREFIX, currentVersion: full.meta.v },
	passed: rows.filter(r => r.passed).length,
	failed: rows.filter(r => !r.passed).length,
	checks: rows,
};
fs.writeFileSync(path.join(out, 'migrate-compat.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, checks: rows.filter(r => !r.passed) }, null, 2));
if (result.failed) process.exitCode = 1;
