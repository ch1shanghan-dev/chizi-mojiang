#!/usr/bin/env node
/**
 * 池子魔将 · package.js size 字段同步工具
 *
 * 按 files 清单逐项累计磁盘实际体积，把 size:"x.xMB" 重写为真实值
 * （四舍五入到 0.1MB）。目录里以 . 开头的项（如 .git）不计入。
 *
 * 用法：node tools/sync_size.js
 * 配套：tools/check.js 会在 size 与实际偏差超过 5% 时给出 WARN。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = path.join(ROOT, "package.js");

const src = fs.readFileSync(pkgPath, "utf8");
const fm = src.match(/files\s*:\s*\[([^\]]*)\]/);
if (!fm) {
	console.error("[sync_size] package.js 未找到 files 清单，无法统计");
	process.exit(1);
}
const items = [...fm[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

let total = 0;
let missing = [];
const addSize = (p) => {
	if (!fs.existsSync(p)) {
		missing.push(p);
		return;
	}
	const st = fs.statSync(p);
	if (st.isDirectory()) {
		for (const e of fs.readdirSync(p)) {
			if (!e.startsWith(".")) addSize(path.join(p, e));
		}
	} else total += st.size;
};
items.forEach((d) => addSize(path.join(ROOT, d)));

const mb = Math.round((total / 1024 / 1024) * 10) / 10;
if (missing.length) {
	console.warn("[sync_size] 警告：files 清单里有 " + missing.length + " 项在磁盘上不存在（未计入）");
}

const out = src.replace(/size\s*:\s*"[\d.]+\s*(KB|MB|GB)\s*"/i, `size:"${mb}MB"`);
if (out === src) {
	console.log(`[sync_size] size 已是最新（${mb}MB），无需修改`);
	process.exit(0);
}
fs.writeFileSync(pkgPath, out);
console.log(`[sync_size] 已更新 size -> ${mb}MB（按 files 清单 ${items.length} 项统计）`);
