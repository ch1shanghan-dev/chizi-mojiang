#!/usr/bin/env node
/**
 * 妖灵特色增益数据层反例（2026-11-07 · 设计方案 S1）
 *
 * 测的是真实 core/csh_spirit_buffs.js 在 vm 里的行为，并与两个真值对账：
 *   · core/csh_bossdata.js 的 MINIONS（50 只，ID 与名字）
 *   · docs/spirit-buff-draft.json（设计期数值草案，防运行时表漂移）
 * 另验证方案里写死的红线：单一 B 档解锁、magnitude=1、perGame=1、只读无写入、
 * 不新增存档键、不产生经济回报、未知输入一律不放行。
 *
 * 用法：node tools/probe_spirit_buffs_20261107.mjs [--out <D盘目录>]
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = arg('--out', null);

const checks = [];
const record = (name, pass, detail) => checks.push({ name, passed: pass === true, ...(pass === true ? {} : { detail }) });

const moduleSrc = fs.readFileSync(path.join(ROOT, 'core', 'csh_spirit_buffs.js'), 'utf8');
const draft = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'spirit-buff-draft.json'), 'utf8'));
const { MINIONS } = await import(pathToFileURL(path.join(ROOT, 'core', 'csh_bossdata.js')).href);

const ctx = vm.createContext({ console });
vm.runInContext(moduleSrc, ctx, { filename: 'csh_spirit_buffs.js' });
const B = ctx.CSHSpiritBuffs;
const rows = B.list();

const strip = src => src
	.replace(/\/\*[\s\S]*?\*\//g, '')
	.replace(/(^|[^:])\/\/.*$/gm, '$1')
	.replace(/'(?:[^'\\]|\\.)*'/g, "''")
	.replace(/"(?:[^"\\]|\\.)*"/g, '""');
const code = strip(moduleSrc);

await record('1/runtime table has exactly 50 buffs', rows.length === 50, rows.length);
await record('2/buff ids match MINIONS one-to-one', (() => {
	const a = B.ids().slice().sort();
	const b = Object.keys(MINIONS).sort();
	return a.length === 50 && b.length === 50 && a.every((x, i) => x === b[i]);
})(), { buffIds: B.ids().length, minionIds: Object.keys(MINIONS).length });

await record('3/names come from MINIONS, not invented', rows.every(r => MINIONS[r.id] && MINIONS[r.id].name === r.name),
	rows.filter(r => !MINIONS[r.id] || MINIONS[r.id].name !== r.name).map(r => r.id));

await record('4/sourceSkill matches the minion unique skill', rows.every(r => {
	const s = (MINIONS[r.id] && MINIONS[r.id].skills) || [];
	return s.length === 1 && s[0] === r.sourceSkill;
}), rows.filter(r => !((MINIONS[r.id] || {}).skills || []).includes(r.sourceSkill)).map(r => r.id));

await record('5/runtime table matches the design draft field by field', (() => {
	const d = new Map(draft.buffs.map(b => [b.id, b]));
	return rows.length === draft.buffs.length && rows.every(r => {
		const x = d.get(r.id);
		return x && ['name', 'template', 'unlockLevel', 'magnitude', 'perGame', 'playerText', 'sourceSkill']
			.every(k => r[k] === x[k]);
	});
})());

await record('6/templates are legal and balanced 8-9 per class', (() => {
	const legal = new Set(Object.keys(B.TEMPLATES));
	const counts = {};
	for (const r of rows) {
		if (!legal.has(r.template)) return false;
		counts[r.template] = (counts[r.template] || 0) + 1;
	}
	return legal.size === 6 && Object.values(counts).every(n => n >= 8 && n <= 9)
		&& Object.keys(counts).length === 6;
})(), (() => { const c = {}; for (const r of rows) c[r.template] = (c[r.template] || 0) + 1; return c; })());

await record('7/player text is unique for all 50', new Set(rows.map(r => r.playerText)).size === 50);
await record('8/every row keeps the hard numeric bounds', rows.every(r =>
	r.magnitude === 1 && r.perGame === 1 && r.unlockLevel === 'B'), rows.filter(r =>
	r.magnitude !== 1 || r.perGame !== 1 || r.unlockLevel !== 'B').map(r => r.id));

await record('9/single unlock level: D/C off, B/A/S on', (() => {
	const id = rows[0].id;
	return ['D', 'C'].every(l => B.unlocked(l, id) === false)
		&& ['B', 'A', 'S'].every(l => B.unlocked(l, id) === true);
})());

await record('10/unknown level / unknown id / non-string never unlock',
	B.unlocked('X', rows[0].id) === false &&
	B.unlocked(undefined, rows[0].id) === false &&
	B.unlocked(null, rows[0].id) === false &&
	B.unlocked('S', '__proto__') === false &&
	B.unlocked('S', 'constructor') === false &&
	B.unlocked('S', 42) === false &&
	B.unlocked('S', 'csh_boss_minion_nope') === false);

await record('11/unknown id returns null and perGame 0', B.get('nope') === null && B.perGame('nope') === 0 && B.templateOf('nope') === null);
await record('12/templateOf resolves the right template', rows.every(r => {
	const t = B.templateOf(r.id);
	return t && typeof t.name === 'string' && typeof t.text === 'string' && r.playerText.includes(t.name);
}));

await record('13/get returns a frozen row; tampering cannot change the table', (() => {
	const r = B.get(rows[0].id);
	try { r.magnitude = 99; r.template = 'evil'; } catch (_e) { /* strict mode throws, also fine */ }
	return B.get(rows[0].id).magnitude === 1 && B.get(rows[0].id).template !== 'evil';
})());

await record('14/module writes no storage key and calls no save config', !/localStorage|saveConfig|sessionStorage|indexedDB/.test(code),
	code.match(/localStorage|saveConfig|sessionStorage|indexedDB/g));
await record('15/module has no economy / wallet / reward path', !/\b(cshWallet|claim|settle|reward|CBY)\b/.test(code),
	code.match(/\b(cshWallet|claim|settle|reward|CBY)\b/g));
await record('16/public API is read-only; list() returns a copy that cannot mutate the table', (() => {
	const keys = Object.keys(B).sort();
	const writeLike = keys.filter(k => /^(save|add|set|put|claim|consume|grant|write)/i.test(k));
	const copy = B.list();
	copy.length = 0;
	copy.push({ id: 'evil' });
	return writeLike.length === 0 && Object.isFrozen(B) && Object.isFrozen(B.TEMPLATES)
		&& B.list().length === 50 && B.get('evil') === null;
})(), Object.keys(B));

await record('17/version and level order are stable', B.VERSION === 1 && B.LEVEL_ORDER.join(',') === 'D,C,B,A,S' && B.UNLOCK_LEVEL === 'B');

const passed = checks.filter(c => c.passed).length;
const failed = checks.length - passed;
const result = {
	scope: 'Real core/csh_spirit_buffs.js in vm, cross-checked against MINIONS and the design draft. No game, no storage, no network.',
	passed, failed, checks,
};
if (out) {
	fs.mkdirSync(out, { recursive: true });
	fs.writeFileSync(path.join(out, 'spirit-buffs.json'), JSON.stringify(result, null, 2));
}
console.log(JSON.stringify({ passed, failed, checks: checks.filter(c => !c.passed) }, null, 2));
if (failed) process.exitCode = 1;
