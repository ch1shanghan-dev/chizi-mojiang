#!/usr/bin/env node
/**
 * 池子魔将 · 备份工具
 *
 * 用法：
 *   node tools/backup.js                 # 备份到 ../_backup/池子魔将_<时间戳>
 *   node tools/backup.js --to D:/xxx     # 指定备份根目录
 *   node tools/backup.js --slim          # 跳过 image/audio/effect/font 等大资源目录
 *   node tools/backup.js --list          # 只列出现有备份，不新建
 *
 * README 第二十一章要求「改前必须备份」，本脚本把它固化成一条命令。
 * slim 模式只备份代码（js/json/md），适合高频小改动；大改动请务必用完整模式。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const flag = (n, d) => {
	const i = argv.indexOf(n);
	return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const DEFAULT_BACKUP_ROOT = path.resolve(ROOT, "../../../../_backup");
const BACKUP_ROOT = flag("--to", DEFAULT_BACKUP_ROOT);
const SLIM = has("--slim");
const LIST = has("--list");

/* 大资源目录，slim 模式下跳过 */
const HEAVY = new Set(["image", "audio", "effect", "font", "mobilefx"]);

function stamp() {
	const d = new Date();
	const p = (x) => String(x).padStart(2, "0");
	return (
		d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
		"_" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
	);
}

function dirSize(dir) {
	if (!fs.existsSync(dir)) return 0;
	let sum = 0;
	const walk = (d) => {
		for (const e of fs.readdirSync(d, { withFileTypes: true })) {
			const p = path.join(d, e.name);
			if (e.isDirectory()) walk(p);
			else { try { sum += fs.statSync(p).size; } catch { /* 忽略 */ } }
		}
	};
	walk(dir);
	return sum;
}

const mb = (x) => (x / 1024 / 1024).toFixed(1) + "MB";

if (LIST) {
	console.log("备份根目录：" + BACKUP_ROOT);
	if (!fs.existsSync(BACKUP_ROOT)) { console.log("（尚不存在）"); process.exit(0); }
	const items = fs.readdirSync(BACKUP_ROOT, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.sort((a, b) => (a.name < b.name ? 1 : -1));
	if (!items.length) console.log("（空）");
	for (const e of items) {
		const p = path.join(BACKUP_ROOT, e.name);
		console.log("  " + e.name.padEnd(40) + mb(dirSize(p)));
	}
	process.exit(0);
}

const target = path.join(BACKUP_ROOT, "池子魔将_" + stamp() + (SLIM ? "_slim" : ""));
fs.mkdirSync(target, { recursive: true });

function copyDir(from, to, slim) {
	fs.mkdirSync(to, { recursive: true });
	for (const e of fs.readdirSync(from, { withFileTypes: true })) {
		const src = path.join(from, e.name);
		const dst = path.join(to, e.name);
		if (e.isDirectory()) {
			if (slim && HEAVY.has(e.name)) continue;
			copyDir(src, dst, slim);
		} else if (e.isFile()) {
			try { fs.copyFileSync(src, dst); }
			catch (err) { console.warn("  跳过（复制失败）：" + e.name + " - " + err.message); }
		}
	}
}

console.log("备份源：" + ROOT);
console.log("备份到：" + target);
console.log("模式  ：" + (SLIM ? "slim（跳过大资源目录）" : "完整"));
copyDir(ROOT, target, SLIM);

console.log("");
console.log("完成。大小：" + mb(dirSize(target)));
console.log("");
console.log("提示：还原时把备份目录整体覆盖回 extension/池子魔将 即可，");
console.log("      注意 package.js / info.json / extension.js 三处版本号需一同还原。");
