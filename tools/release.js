#!/usr/bin/env node
/**
 * 池子魔将 · 在线更新发布工具（配合无名杀自带「更新扩展」机制）
 *
 * 原理：noname 在线扩展页会 fetch <更新源>catalog.js 并 eval，得到
 *   window.extension = { 扩展名: { name, author, intro, version, date, size, files:[...] } }
 * 已安装扩展版本 ≠ catalog 版本时，扩展页显示「更新扩展」，逐文件从
 * <更新源><相对路径> 下载（files 模式），正好匹配本仓库「根目录=扩展内容」的布局。
 *
 * 【2026-11-05 U0 修正】catalog.hashes 必须对应 **Git 提交后玩家真正下载的字节**。
 * 仓库 .gitattributes 是 `* text=auto eol=lf`，Windows 工作目录的 CRLF 文本文件在
 * git add 时会被转成 LF。旧版本用 fs.readFileSync 直接算工作目录字节，导致
 * 「本地检查通过、玩家从 GitHub raw 下载后摘要校验失败」。开发提交 5b266c6 曾
 * 因此有 17 个文件不符。现在统一走 catalog_git_bytes.mjs 的隔离索引 clean filter，
 * 由 Git 自己决定换行与二进制，不自行猜测文本规则。
 *
 * 用法（在扩展根目录执行）：
 *   node tools/release.js --check      → **只读**：核对现有 catalog.js 与发布字节，不写任何文件
 *   node tools/release.js              → 按 info.json 当前版本重新生成 catalog.js
 *   node tools/release.js 4.0.6        → 同步 info.json / package.js / extension.js，再生成 catalog.js
 *   node tools/release.js --push       → 生成 + 提交 + 提交后字节复核 + 推送（复核不过绝不推送）
 *
 * 生成后自行提交；**最终候选提交**必须再跑一次只读核对：
 *   node tools/catalog_git_bytes.mjs --rev <最终提交>
 * 0 错才可发布。提交后若再改任何运行源码，旧清单立即失效，必须重跑本工具。
 * git add/commit/push 不在本工具默认行为内，交接期间不自动发布。
 *
 * 玩家侧一次性设置：设置 → 通用 → 获取扩展地址 → 填入
 *   https://raw.githubusercontent.com/ch1shanghan-dev/chizi-mojiang/main/
 * 之后每次 push 新版本，在线扩展页就会出现「更新扩展」按钮。
 */
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { TEXT_LIMIT, FILE_LIMIT, checkLimits, limitsBlock, REMEDY } from "./lib/update_limits.mjs";
import {
	worktreeBlobHashes,
	revBlobHashes,
	readCatalog,
	readCatalogAtRev,
	releaseVersions,
	parseCatalogText,
	verifyCatalog,
} from "./catalog_git_bytes.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_RAW = "https://raw.githubusercontent.com/ch1shanghan-dev/chizi-mojiang/main/";
const REPO_PAGE = "https://github.com/ch1shanghan-dev/chizi-mojiang";

const pushMode = process.argv.includes("--push");
const checkMode = process.argv.includes("--check");
const positional = process.argv.slice(2).filter((a) => a !== "--push" && a !== "--check");
const newVersion = positional[0] || null;
if (positional.length > 1 || (newVersion && !/^\d+\.\d+\.\d+$/.test(newVersion))) {
	throw new Error("版本号必须是三段数字，例如 4.0.16");
}
if (pushMode) {
	const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
	if (branch !== "main") throw new Error("--push 只能从本地 main 发布当前候选，当前分支为 " + branch);
}
if (checkMode && (pushMode || newVersion)) {
	throw new Error("--check 是纯只读模式，不能同时 --push 或改版本号");
}

/* ---------- 版本号（可选参数：node tools/release.js 4.0.6） ---------- */
const infoPath = path.join(root, "info.json");
const pkgPath = path.join(root, "package.js");
const extPath = path.join(root, "extension.js");
const versionField = /^(\s*version\s*:\s*")([^"]+)(")/m;
const introVersion = /(<font color=#00FFFF>)\s*(\d+\.\d+\.\d+)\s*(<\/font>)/i;
const info = JSON.parse(fs.readFileSync(infoPath, "utf8"));
let pkg = fs.readFileSync(pkgPath, "utf8");
let ext = fs.readFileSync(extPath, "utf8");
if (!introVersion.test(info.intro) || !introVersion.test(pkg) || !introVersion.test(ext) ||
	!versionField.test(pkg) || !versionField.test(ext)) throw new Error("版本字段或版本标题缺失");
if (newVersion) {
	const replaceIntro = (_, open, before, close) => open + newVersion + close;
	const replaceField = (_, prefix, before, suffix) => prefix + newVersion + suffix;
	info.version = newVersion;
	info.intro = info.intro.replace(introVersion, replaceIntro);
	pkg = pkg.replace(versionField, replaceField).replace(introVersion, replaceIntro);
	ext = ext.replace(versionField, replaceField).replace(introVersion, replaceIntro);
	fs.writeFileSync(infoPath, JSON.stringify(info, null, 2) + "\n", "utf8");
	fs.writeFileSync(pkgPath, pkg, "utf8");
	fs.writeFileSync(extPath, ext, "utf8");
	console.log("[release] info.json、package.js、extension.js 及版本标题已同步到 " + newVersion);
}
const version = info.version;
if (!/^\d+\.\d+\.\d+$/.test(version || "") || pkg.match(versionField)[2] !== version ||
	ext.match(versionField)[2] !== version || [info.intro, pkg, ext].some(text => text.match(introVersion)[2] !== version)) {
	throw new Error("info.json、package.js、extension.js 的安装版本或版本标题不一致");
}

/* ---------- 展开 package.js files 清单为完整文件列表 ---------- */
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

/* ---------- 精确发布字节：隔离索引应用 .gitattributes clean filter ---------- */
const blob = worktreeBlobHashes(files);
const missing = files.filter((f) => !blob.get(f) || blob.get(f).error || !blob.get(f).hash);
if (missing.length) {
	throw new Error("以下文件无法取得 Git 发布字节，停止生成：" + missing.slice(0, 5).join("、") + (missing.length > 5 ? " …" : ""));
}
const hashes = Object.fromEntries(files.map((f) => [f, blob.get(f).hash]));
const build = crypto.createHash("sha256").update(files.map((f) => f + ":" + hashes[f]).join("\n")).digest("hex");
let total = 0;
for (const f of files) total += blob.get(f).size;               // 展示体积按实际下载字节
const size = (total / 1024 / 1024).toFixed(1) + "MB";

/* ---------- U4 发布预检：读取上限必须在发布前拦住 ----------
   逐文件下载器 fetchFile 走 CSHOnline.external().arrayBuffer()（16MiB）；
   cshFetchText 拉 catalog.js 走 .text()（512KiB）。
   超限就拒绝生成，不把已知不支持的文件留到玩家下载途中。 */
const sizes = files.map((f) => ({ path: f, size: blob.get(f).size }));
const preflight = checkLimits(sizes);
if (!preflight.ok) {
	const detail = preflight.violations.slice(0, 8)
		.map((v) => `${v.path} ${(v.size / 1024 / 1024).toFixed(2)}MB > ${(v.limit / 1024 / 1024).toFixed(0)}MiB`)
		.join("；");
	throw new Error(`发布预检未通过：${preflight.violations.length} 个文件超出在线读取上限（${detail}）。${REMEDY}`);
}
console.log(`[release] 发布预检：${files.length} 文件，最大 ${(preflight.maxFileBytes / 1024 / 1024).toFixed(2)}MB ≤ ${(FILE_LIMIT / 1024 / 1024).toFixed(0)}MiB`);

/* ---------- --check：只读核对，不写 catalog.js / 不改版本 ---------- */
if (checkMode) {
	const cat = readCatalog();
	const v = verifyCatalog(cat, blob);
	/* 磁盘上存在、但清单里没有的文件，比哈希不符更危险：玩家在线更新不会下载它，
	   代码一旦引用就是缺文件。verifyCatalog 只遍历 cat.files，看不见这种漏登记。 */
	const catSet = new Set(cat.files);
	const extraOnDisk = files.filter((f) => !catSet.has(f));
	const versionOk = cat.version === version;
	const issues = v.mismatches.length + v.extraKeys.length + v.missingKeys.length +
		(v.buildOk ? 0 : 1) + extraOnDisk.length + (versionOk ? 0 : 1);
	console.log(JSON.stringify({
		versionOk,
		mode: "read-only",
		version: cat.version,
		expectedVersion: version,
		fileCount: cat.files.length,
		mismatchCount: v.mismatches.length,
		extraHashKeys: v.extraKeys.length,
		missingHashKeys: v.missingKeys.length,
		extraDiskFiles: extraOnDisk.length,
		buildOk: v.buildOk,
		ok: issues === 0,
	}, null, 2));
	if (extraOnDisk.length) {
		console.error("[release] 磁盘有但发布清单漏登记的文件（最多列 8 个）：");
		for (const f of extraOnDisk.slice(0, 8)) console.error("  " + f);
		console.error("  修复：运行 node tools/release.js 重新生成清单。");
	}
	if (v.mismatches.length) {
		console.error("[release] 不一致文件（最多列 8 个）：");
		for (const d of v.mismatches.slice(0, 8)) {
			console.error("  " + d.file + "  catalog=" + d.manifest + "  blob=" + (d.gitBlobSHA256 || d.reason));
		}
	}
	console.log("[release] --check 未修改任何文件；修复请运行 node tools/release.js（会重写 catalog.js）");
	process.exit(issues === 0 ? 0 : 1);
}

/* ---------- catalog.js：先在内存里自检通过，再落盘 ---------- */
const catalog = {
	build, hashes,
	name: "池子魔将",
	author: info.author || "池上寒",
	intro: info.intro,
	version,
	date: new Date().toISOString().slice(0, 10),
	size,
	limits: limitsBlock(sizes),
	forum: REPO_PAGE,
	netdisk: "",
	files,
};
const header = `/* 自动生成于 ${new Date().toISOString()} by tools/release.js —— hashes 对应 Git 发布字节，发版后 git push 即生效，勿手改 files */\n`;
const text = header + "window.extension = " + JSON.stringify({ "池子魔将": catalog }, null, "\t") + ";\n";
if (Buffer.byteLength(text, "utf8") > TEXT_LIMIT) {
	throw new Error(`发布预检未通过：catalog.js 文本 ${Buffer.byteLength(text, "utf8")} 字节 > ${TEXT_LIMIT} 字节（cshFetchText 上限）。${REMEDY}`);
}
const selfCheck = verifyCatalog(parseCatalogText(text), blob);
if (selfCheck.mismatches.length || selfCheck.extraKeys.length || selfCheck.missingKeys.length || !selfCheck.buildOk) {
	throw new Error("生成的 catalog.js 自检未通过，未写盘：" + JSON.stringify({
		mismatches: selfCheck.mismatches.length,
		extra: selfCheck.extraKeys.length,
		missing: selfCheck.missingKeys.length,
		buildOk: selfCheck.buildOk,
	}));
}
fs.writeFileSync(path.join(root, "catalog.js"), text, "utf8");

console.log(`[release] catalog.js 已生成：版本 ${version}，${files.length} 个文件，${size}（按 Git 发布字节）`);
console.log("[release] 生成自检：" + files.length + " 文件哈希全匹配、build 一致");
if (warnNonAscii.length) {
	console.warn("[release] ⚠ 以下文件名含非 ASCII 字符，raw 下载可能失败，建议改名：");
	for (const f of warnNonAscii) console.warn("  - " + f);
}

/* ---------- 可选：--push 一步到位（add + commit + 提交后字节复核 + push） ---------- */
if (pushMode) {
	const run = (args) => execFileSync("git", args, { cwd: root, stdio: "inherit" });
	try {
		run(["add", "-A"]);
		run(["commit", "-m", "release " + version]);
		/* 提交后核对玩家下载到的字节和版本。 */
		const final = revBlobHashes("HEAD", files);
		const candidate = readCatalogAtRev(final.commit);
		const v = verifyCatalog(candidate, final.byPath);
		const { versionOk } = releaseVersions(candidate, final.commit);
		const issues = v.mismatches.length + v.extraKeys.length + v.missingKeys.length +
			(v.buildOk ? 0 : 1) + (versionOk ? 0 : 1);
		if (issues) {
			throw new Error(`最终提交 ${final.commit} 发布字节核对失败（${v.mismatches.length} 个文件不符 / buildOk=${v.buildOk} / versionOk=${versionOk}），已阻止 push`);
		}
		console.log(`[release] 提交字节核对通过：${files.length}/${files.length} 文件哈希一致`);
		run(["push", "origin", final.commit + ":refs/heads/main"]);
		console.log(`[release] ✅ 已提交并推送 ${version} —— 玩家在线扩展页稍后即可见「更新扩展」`);
	} catch (e) {
		console.warn("[release] git 步骤失败或未通过发布字节核对，未推送；请核对后重试：" + e.message);
		process.exitCode = 1;
	}
} else {
	console.log("[release] 下一步：提交改动后对最终提交运行 node tools/catalog_git_bytes.mjs --rev <commit>，0 错才可发布");
}
console.log("[release] 玩家侧更新源：" + REPO_RAW);
