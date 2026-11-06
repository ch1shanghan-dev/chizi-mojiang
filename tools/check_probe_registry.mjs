#!/usr/bin/env node
/**
 * 门禁注册自检（2026-11-06）
 *
 * 四轮并行工作反复暴露同一个事故：探针坏了几个月没人发现，因为没有任何入口引用它
 * （probe_first_batch HARNESS_ERROR、career_achievements 固化 493、career_source 指向旧安装）。
 * E95 注册区把 9 个关键专项接进了门禁，但**注册行本身也可能失效**：
 * 文件被删、改名、或新探针写进了 suite 却没进 check.js，都不会有人发现。
 *
 * 这个只读自检做三件事：
 *   1. 枚举 tools/probe_*.mjs，算出被 check.js / check_update_suite.mjs 引用的差集；
 *   2. 硬检查：两个入口里引用到的每个探针名，必须真的存在对应文件（防注册行指空）；
 *   3. 硬检查：一键套件引用的每个探针也必须存在。
 * 差集本身**只报告不判失败**——里面有一批需要真实宿主、本副本起不来的 *_host.mjs，
 * 拿差集当失败会天天误报，那是另一种噪音。
 *
 * --self-test 在隔离临时目录里构造「注册行指向不存在的文件」，验证自检确实会报红，
 * 而不是写个永远返回 ok=true 的摆设。
 *
 * 用法：
 *   node tools/check_probe_registry.mjs [--out <dir>] [--root <repo-root>] [--self-test]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(arg('--root', DEFAULT_ROOT));
const out = arg('--out', null);
const selfTest = process.argv.includes('--self-test');

const checks = [];
const record = (name, pass, detail) => checks.push({ name, passed: pass === true, ...(pass === true ? {} : { detail }) });
const NAME_RE = /['"](probe_[A-Za-z0-9_\-]+\.mjs)['"]/g;

function referenced(text) {
	const names = new Set();
	let m;
	NAME_RE.lastIndex = 0;
	while ((m = NAME_RE.exec(text))) names.add(m[1]);
	return names;
}

/** 核心：只读分析某个仓库根的注册情况 */
export function inspect(repoRoot) {
	const toolsDir = path.join(repoRoot, 'tools');
	const all = fs.existsSync(toolsDir)
		? fs.readdirSync(toolsDir).filter(f => /^probe_[A-Za-z0-9_\-]+\.mjs$/.test(f)).sort()
		: [];
	const entries = ['tools/check.js', 'tools/check_update_suite.mjs', 'tools/check_slow_suite.mjs'];
	const perEntry = {};
	const referencedNames = new Set();
	for (const rel of entries) {
		const p = path.join(repoRoot, rel);
		const text = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
		const names = [...referenced(text)].sort();
		perEntry[rel] = names;
		for (const n of names) referencedNames.add(n);
	}
	const present = new Set(all);
	const missing = [...referencedNames].filter(n => !present.has(n)).sort();
	const registeredCount = [...referencedNames].filter(n => present.has(n)).length;
	const orphans = all.filter(n => !referencedNames.has(n));
	return {
		totalProbes: all.length,
		registeredCount,
		orphanCount: orphans.length,
		orphanSample: orphans.slice(0, 12),
		perEntry,
		missingRegistrations: missing,
		ok: missing.length === 0,
	};
}

/** 自测：构造一个「注册行指向不存在文件」的假仓库，确认自检会报红 */
function runSelfTest() {
	const tmp = fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'csh-registry-self-'));
	const fakeTools = path.join(tmp, 'tools');
	fs.mkdirSync(fakeTools);
	const write = (rel, text) => fs.writeFileSync(path.join(tmp, rel), text);
	try {
		write('tools/probe_real.mjs', '// real');
		write('tools/check.js',
			"runProbeJson('probe_real.mjs',[],{timeout:2000});\n" +
			"runProbeJson('probe_ghost_missing.mjs',[],{timeout:2000});\n");
		write('tools/check_update_suite.mjs', "const probes = ['probe_real.mjs'];\n");

		const broken = inspect(tmp);
		record('1/self-test: a registration pointing at a deleted probe is reported as missing',
			broken.ok === false && broken.missingRegistrations.includes('probe_ghost_missing.mjs'),
			{ ok: broken.ok, missing: broken.missingRegistrations });

		/* 把幽灵文件补上，自检必须转绿 */
		write('tools/probe_ghost_missing.mjs', '// restored');
		const fixed = inspect(tmp);
		record('2/self-test: restoring the file turns the check green',
			fixed.ok === true && fixed.missingRegistrations.length === 0,
			{ ok: fixed.ok, missing: fixed.missingRegistrations });

		/* 差集只报告不判失败：存在未被任何入口引用的探针时 ok 仍为 true */
		write('tools/probe_orphan.mjs', '// orphan');
		const withOrphan = inspect(tmp);
		record('3/self-test: an orphan probe is counted but does not fail the check',
			withOrphan.ok === true && withOrphan.orphanCount === 1 && withOrphan.orphanSample.includes('probe_orphan.mjs'),
			{ ok: withOrphan.ok, orphanCount: withOrphan.orphanCount });

		/* 两个入口的引用都要被算进去，不能只看 check.js */
		write('tools/check.js', "runProbeJson('probe_real.mjs',[],{timeout:2000});\n");
		write('tools/check_update_suite.mjs', "const probes = ['probe_real.mjs','probe_suite_only.mjs'];\n");
		write('tools/probe_suite_only.mjs', '// suite only');
		const suiteCase = inspect(tmp);
		record('4/self-test: suite-only probes are included in the registry',
			suiteCase.ok === true && suiteCase.registeredCount === 2 &&
			suiteCase.perEntry['tools/check_update_suite.mjs'].includes('probe_suite_only.mjs'),
			{ registeredCount: suiteCase.registeredCount, perEntry: suiteCase.perEntry });
	} finally {
		for (const f of fs.readdirSync(fakeTools)) {
			try { fs.unlinkSync(path.join(fakeTools, f)); } catch (_e) {}
		}
		try { fs.rmdirSync(fakeTools); } catch (_e) {}
		try { fs.rmdirSync(tmp); } catch (_e) {}
	}
}

let scaleInfo = null;
if (selfTest) {
	runSelfTest();
	/* 自测不依赖真实仓库，但仍把仓库统计附上，便于一眼看清规模 */
	const real = inspect(DEFAULT_ROOT);
	record('5/real registry has no dangling registrations', real.ok === true,
		{ missing: real.missingRegistrations });
} else {
	const r = inspect(root);
	record('1/every probe referenced by the gate or the suite exists on disk', r.ok === true,
		{ missing: r.missingRegistrations });
	record('2/both entry points are present and reference at least one probe',
		Object.values(r.perEntry).every(v => v.length > 0),
		{ perEntry: r.perEntry });
	record('3/E95 registry covers the previously orphaned critical probes',
		(() => {
			const gate = r.perEntry['tools/check.js'] || [];
			const must = [
				'probe_career_source_20261104.mjs',
				'probe_retired_reachability_20261105.mjs',
				'probe_update_bundle_cleanup_20261105.mjs',
				'probe_migrate_compat_20261105.mjs',
				'probe_career_world_first_capture_20261105.mjs',
				'probe_4_0_12_economy.mjs',
			];
			return must.every(n => gate.includes(n));
		})(),
		{ gateCount: (r.perEntry['tools/check.js'] || []).length });
	/* 规模信息放进 JSON（stdout 必须是纯 JSON，门禁用 JSON.parse 读） */
	scaleInfo = {
		totalProbes: r.totalProbes,
		registeredCount: r.registeredCount,
		orphanCount: r.orphanCount,
		missingRegistrations: r.missingRegistrations.length,
	};
}

const passed = checks.filter(c => c.passed).length;
const failed = checks.length - passed;
const result = {
	scope: selfTest ? 'Isolated fake repo self-test of the registry checker' : 'Read-only registry audit of tools/check.js and tools/check_update_suite.mjs',
	passed, failed, checks,
	...(selfTest ? {} : { registry: inspect(root), summary: scaleInfo }),
};
if (out) {
	fs.mkdirSync(out, { recursive: true });
	fs.writeFileSync(path.join(out, 'probe-registry.json'), JSON.stringify(result, null, 2));
}
console.log(JSON.stringify({ passed, failed, checks: checks.filter(c => !c.passed) }, null, 2));
if (failed) process.exitCode = 1;
