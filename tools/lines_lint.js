#!/usr/bin/env node
// 互动台词池统计与查重（纯数据模块，node 直接 import，不依赖无名杀）
// 用法：ELECTRON_RUN_AS_NODE=1 noname.exe tools/lines_lint.js
// 输出：两个数据模块贡献的句数（合并去重后）/ 分类明细 / 文件内重复清单。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hand = (await import(pathToFileURL(path.join(root, "core", "csh_interact_lines.js")))).default;
const gen = (await import(pathToFileURL(path.join(root, "core", "csh_interact_lines_gen.js")))).default;

function dupScan(mod, tag) {
	let dups = 0;
	for (const cat of Object.keys(mod.lines || {})) {
		const seen = new Set();
		for (const s of mod.lines[cat] || []) {
			if (seen.has(s)) { console.error(`  ✗ ${tag} lines.${cat} 文件内重复：「${s}」`); dups++; }
			seen.add(s);
		}
	}
	return dups;
}
let dup = dupScan(hand, "hand") + dupScan(gen, "gen");

const merged = {};
for (const mod of [hand, gen]) {
	for (const cat of Object.keys(mod.lines || {})) {
		merged[cat] = merged[cat] || new Set();
		for (const s of mod.lines[cat] || []) merged[cat].add(s);
	}
}
let total = 0;
console.log("== 数据模块台词池（去重后）==");
for (const cat of Object.keys(merged).sort()) {
	console.log(`  ${cat.padEnd(14, " ")} ${merged[cat].size}`);
	total += merged[cat].size;
}
console.log(`  合计：${total}`);

// 内置池粗估（regex 数 csh_interact.js 台词区字符串，含 config 键噪声，标注为约数）
const src = fs.readFileSync(path.join(root, "core", "csh_interact.js"), "utf8");
const quoted = (src.match(/"[^"\n]{2,24}"/g) || []).length;
console.log(`\n内置（csh_interact.js 内联）粗估：~${Math.max(0, quoted - 120)} 句（约数，含少量键名噪声）`);
console.log(`运行时总池 ≈ ${total + Math.max(0, quoted - 120)}`);
console.log(`文件内重复：${dup === 0 ? "0（合格）" : dup + "（需清理）"}`);
if (dup > 0) process.exitCode = 1;
