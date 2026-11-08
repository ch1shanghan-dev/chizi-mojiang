#!/usr/bin/env node
/**
 * 更新链路一键只读验证（2026-11-05 · U0—U4 收口）
 *
 * 把分散的专项串成一个可复现入口，避免每次更新靠记忆漏跑：
 *   · tools/release.js --check                 发布清单与发布字节
 *   · tools/catalog_git_bytes.mjs --worktree  当前工作区候选的 Git blob 对账
 *   · 9 个更新/备份专项（含 U1—U4 新增反例）
 *   · 可选 --rev <最终候选提交>              提交后精确字节核对（发布硬步骤）
 *   · 可选 --full                            完整 node tools/check.js 门禁
 *
 * 全程只读业务文件；只写 --out 目录与系统 TEMP（默认指向 D 盘）。
 * 不提交、不推送、不安装、不升版。任一非零退出即整体失败。
 *
 * 用法：
 *   node tools/check_update_suite.mjs --out D:/.../wb-update-suite
 *   node tools/check_update_suite.mjs --out D:/.../run1 --rev <commit> --full
 * 注：对历史提交 5b266c6 跑 --rev 会返回非零（17 个不符），那是正确检测，不是脚本故障。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, def = null) => {
	const i = argv.indexOf(name);
	return i < 0 || !argv[i + 1] ? def : argv[i + 1];
};
const out = path.resolve(arg('--out', 'D:/CodexWork/chizi-mojiang/workbuddy/outputs/wb-update-suite'));
const rev = arg('--rev');
const full = argv.includes('--full');
const temp = path.resolve(arg('--temp', 'D:/CodexWork/chizi-mojiang/workbuddy/temp'));

for (const dir of [out, path.join(out, 'logs'), temp]) fs.mkdirSync(dir, { recursive: true });
const env = { ...process.env, TEMP: temp, TMP: temp };
const results = [];

function run(name, args) {
	const t0 = Date.now();
	const r = spawnSync(process.execPath, args, {
		cwd: root, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
	});
	const logName = name.replace(/[^a-z0-9_-]/gi, '_') + '.log';
	const logPath = path.join(out, 'logs', logName);
	fs.writeFileSync(logPath, (r.stdout || '') + (r.stderr ? '\n--- stderr ---\n' + r.stderr : ''), 'utf8');
	const item = { name, exit: r.status, ms: Date.now() - t0, log: 'logs/' + logName };
	if (r.error) item.error = String(r.error);
	results.push(item);
	console.log(`[${r.status === 0 ? ' OK ' : 'FAIL'}] ${name} (${item.ms}ms)`);
	return r;
}

/* ---------- 发布清单与字节 ---------- */
run('release-check', ['tools/release.js', '--check']);
run('catalog-worktree', ['tools/catalog_git_bytes.mjs', '--worktree', '--out', path.join(out, 'worktree.json')]);
if (rev) run('catalog-rev', ['tools/catalog_git_bytes.mjs', '--rev', rev, '--out', path.join(out, 'rev.json')]);

/* ---------- 发布元数据、更新与备份专项 ---------- */
const probes = [
	'probe_update_release_metadata_20261108.mjs',
	'probe_update_transaction.mjs',
	'probe_update_deferred_20261105.mjs',
	'probe_update_cancel_pending_20261105.mjs',
	'probe_update_mobile_io_20261105.mjs',
	'probe_update_ui_20261105.mjs',
	'probe_update_lifecycle_20261105.mjs',
	'probe_update_mirror_fallback_20261105.mjs',
	'probe_update_startup_recovery_20261105.mjs',
	'probe_update_backup_capacity_20261105.mjs',
	'probe_update_bundle_cleanup_20261105.mjs',
	'probe_backup_lifecycle_20261104.mjs',
	'probe_online_offline.mjs',
];
for (const probe of probes) {
	const label = probe.replace(/^probe_/, '').replace(/\.mjs$/, '');
	run(label, ['tools/' + probe, '--out', path.join(out, label)]);
}

/* ---------- 可选完整门禁 ---------- */
if (full) run('full-gate', ['tools/check.js']);

const failed = results.filter(r => r.exit !== 0);
const summary = {
	scope: 'Read-only update-chain verification suite; isolated probes, in-memory disks and D-drive scratch. No device install, publish or push.',
	at: new Date().toISOString(),
	repo: root,
	out,
	rev: rev || null,
	fullGate: full,
	total: results.length,
	passed: results.length - failed.length,
	failed: failed.length,
	results,
};
fs.writeFileSync(path.join(out, 'suite.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ passed: summary.passed, failed: summary.failed, failures: failed.map(x => x.name), suite: path.join(out, 'suite.json') }));
process.exitCode = failed.length ? 1 : 0;
