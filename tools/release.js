#!/usr/bin/env node
/**
 * 池子魔将 · 在线更新发布工具（配合无名杀自带「更新扩展」机制）
 *
 * 原理：noname 在线扩展页会 fetch <更新源>catalog.js 并 eval，得到
 *   window.extension = { 扩展名: { name, author, intro, version, date, size, files:[...] } }
 * 已安装扩展版本 ≠ catalog 版本时，扩展页显示「更新扩展」，逐文件从
 * <更新源><相对路径> 下载（files 模式），正好匹配本仓库「根目录=扩展内容」的布局。
 *
 * 用法（在扩展根目录执行）：
 *   node tools/release.js            → 按 info.json 当前版本重新生成 catalog.js
 *   node tools/release.js 4.0.6      → 先把 info.json / package.js 版本号改成 4.0.6，再生成 catalog.js
 * 生成后自行 git add catalog.js && git commit && git push 推到 GitHub 即完成发版。
 *
 * 玩家侧一次性设置：设置 → 通用 → 获取扩展地址 → 填入
 *   https://raw.githubusercontent.com/ch1shanghan-dev/chizi-mojiang/main/
 * 之后每次 push 新版本，在线扩展页就会出现「更新扩展」按钮。
 */
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_RAW = "https://raw.githubusercontent.com/ch1shanghan-dev/chizi-mojiang/main/";
const REPO_PAGE = "https://github.com/ch1shanghan-dev/chizi-mojiang";

/* ---------- 版本号（可选参数：node tools/release.js 4.0.6） ---------- */
const infoPath = path.join(root, "info.json");
const pkgPath = path.join(root, "package.js");
const info = JSON.parse(fs.readFileSync(infoPath, "utf8"));
const newVersion = process.argv[2];
if (newVersion) {
	info.version = newVersion;
	info.intro = info.intro.replace(/>\s*[\d.]+\s*</, `>${newVersion}<`);
	fs.writeFileSync(infoPath, JSON.stringify(info, null, 2) + "\n", "utf8");
	let pkg = fs.readFileSync(pkgPath, "utf8");
	pkg = pkg.replace(/version\s*:\s*"[^"]+"/, `version:"${newVersion}"`);
	fs.writeFileSync(pkgPath, pkg, "utf8");
	console.log(`[release] 版本号已更新 -> ${newVersion}（info.json / package.js / intro 同步）`);
}
const version = JSON.parse(fs.readFileSync(infoPath, "utf8")).version;

/* ---------- 展开 package.js files 清单为完整文件列表 ---------- */
const pkg = fs.readFileSync(pkgPath, "utf8");
const m = pkg.match(/files\s*:\s*\[([^\]]*)\]/);
if (!m) throw new Error("package.js 里找不到 files 清单");
const entries = m[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1));

const files = [];
const warnNonAscii = [];
function walk(rel) {
	const abs = path.join(root, rel);
	const st = fs.statSync(abs);
	if (st.isFile()) {
		const normRel = rel.split(path.sep).join("/");
		if (/[^A-Za-z0-9._\-/]/.test(normRel)) warnNonAscii.push(normRel); // 引擎按 URL 拼接，非 ASCII 文件名有风险
		files.push(normRel);
		return;
	}
	for (const name of fs.readdirSync(abs).sort()) {
		if (name === ".git" || name === "catalog.js" || name.endsWith(".zip")) continue;
		walk(path.join(rel, name));
	}
}
for (const e of entries) walk(e);
files.sort();

/* ---------- 体积（MB，用于展示） ---------- */
let total = 0;
for (const f of files) total += fs.statSync(path.join(root, f)).size;
const size = (total / 1024 / 1024).toFixed(1) + "MB";

/* ---------- catalog.js ---------- */
const hashes=Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]));
const build=crypto.createHash('sha256').update(files.map(f=>f+':'+hashes[f]).join('\n')).digest('hex');
const catalog = {
    build, hashes,
	name: "池子魔将",
	author: info.author || "池上寒",
	intro: info.intro,
	version,
	date: new Date().toISOString().slice(0, 10),
	size,
	forum: REPO_PAGE,
	netdisk: "",
	files,
};
const header = `/* 自动生成于 ${new Date().toISOString()} by tools/release.js —— 发版后 git push 即生效，勿手改 files */\n`;
fs.writeFileSync(path.join(root, "catalog.js"), header + "window.extension = " + JSON.stringify({ "池子魔将": catalog }, null, "\t") + ";\n", "utf8");

console.log(`[release] catalog.js 已生成：版本 ${version}，${files.length} 个文件，${size}`);
if (warnNonAscii.length) {
	console.warn("[release] ⚠ 以下文件名含非 ASCII 字符，raw 下载可能失败，建议改名：");
	for (const f of warnNonAscii) console.warn("  - " + f);
}

/* ---------- 可选：--push 一步到位（add + commit + push） ---------- */
/* 用法：node tools/release.js [新版本号] --push  →  改码、升版、提交、推送一条龙 */
if (process.argv.includes("--push")) {
	const { execSync } = await import("node:child_process");
	const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });
	try {
		run("git add -A");
		run(`git commit -m "release ${version}"`);
		run("git push origin main");
		console.log(`[release] ✅ 已提交并推送 ${version} —— 玩家在线扩展页稍后即可见「更新扩展」`);
	} catch (e) {
		console.warn("[release] git 步骤失败（可能没有改动/未配远端），可手动 git push：" + e.message);
	}
} else {
	console.log("[release] 下一步：git add -A && git commit -m 'release " + version + "' && git push");
}
console.log("[release] 玩家侧更新源：" + REPO_RAW);
