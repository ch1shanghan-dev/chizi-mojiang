#!/usr/bin/env node
/**
 * 池子魔将 · 发布字节核对（U0 / 2026-11-05）
 *
 * 问题：.gitattributes 是 `* text=auto eol=lf`，Windows 工作目录里的 CRLF 文本文件
 * 提交到 Git 时会转成 LF。玩家从 raw.githubusercontent.com 下载的是 **Git blob 字节**，
 * 不是开发者工作目录字节。旧 tools/release.js 用 fs.readFileSync 算 catalog.hashes，
 * 于是出现「本地校验通过、玩家下载后摘要校验失败」。
 *
 * 本模块统一提供「精确发布字节」的 SHA256：
 *   --rev <commit>  只读，读取 <commit>:<path> 的 blob（最终候选提交用这个）
 *   默认/--worktree 用隔离 GIT_INDEX_FILE 让 git add 应用 .gitattributes 的 clean filter，
 *                  得到「若此刻提交会产生的 blob 字节」（生成 catalog 用这个）
 *
 * 两种来源都由 Git 自己决定换行/二进制，不自行猜测文本规则。
 * 隔离索引写在系统临时目录，不触碰仓库真实索引、工作区或任何提交。
 *
 * 用法（扩展根目录）：
 *   node tools/catalog_git_bytes.mjs --rev 5b266c6        # 对已提交候选只读核对
 *   node tools/catalog_git_bytes.mjs --rev HEAD
 *   node tools/catalog_git_bytes.mjs --worktree --out D:/.../git-bytes.json
 * 退出码：0 = 全部一致；1 = 存在不一致或核对失败。
 */
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_BUFFER = 64 * 1024 * 1024;
const MAX_BATCH_BYTES = 24 * 1024 * 1024;

function git(args, opts = {}) {
	// 吞掉 git add 的 CRLF 警告（每次 20 行，属已知现象），失败时由调用方读 err.stderr
	return execFileSync("git", args, {
		cwd: ROOT,
		maxBuffer: MAX_BUFFER,
		stdio: ["pipe", "pipe", "pipe"],
		...opts,
	});
}
function sha256(buf) {
	return crypto.createHash("sha256").update(buf).digest("hex");
}

/** 解析 catalog.js 文本（window.extension = {...}; 包装，取最外层 JSON） */
export function parseCatalogText(raw) {
	const start = raw.indexOf("{");
	const end = raw.lastIndexOf("}");
	if (start < 0 || end <= start) throw new Error("catalog.js 格式不可解析");
	const cat = JSON.parse(raw.slice(start, end + 1))["池子魔将"];
	if (!cat || !Array.isArray(cat.files)) throw new Error("catalog.js 缺少 池子魔将.files");
	return cat;
}

/** 当前工作目录的 catalog.js */
export function readCatalog() {
	return parseCatalogText(fs.readFileSync(path.join(ROOT, "catalog.js"), "utf8"));
}

/** 指定提交自带的 catalog.js —— 核对历史/最终候选提交时必须用它，不能用工作区版本 */
export function readCatalogAtRev(commit) {
	return parseCatalogText(git(["show", commit + ":catalog.js"]).toString("utf8"));
}

export function resolveRev(rev) {
	if (typeof rev !== "string" || !rev || rev.startsWith("-") || /[\0\n\r]/.test(rev)) {
		throw new Error("非法 rev");
	}
	return git(["rev-parse", "--verify", rev + "^{commit}"]).toString("utf8").trim();
}

/** 一批 oid → { sha256, size }，按累计体积分批，避免一次读完整仓 137MB */
function hashOids(oids) {
	const unique = [...new Set(oids)];
	const checkOut = git(["cat-file", "--batch-check"], { input: unique.join("\n") + "\n" }).toString("utf8");
	const checkLines = checkOut.split("\n").filter(Boolean);
	if (checkLines.length !== unique.length) throw new Error("git cat-file --batch-check 行数不符");
	const sizes = new Map();
	unique.forEach((oid, i) => {
		const parts = checkLines[i].trim().split(" ");
		if (parts.length !== 3 || parts[1] !== "blob") throw new Error("非 blob 对象：" + checkLines[i]);
		sizes.set(oid, Number(parts[2]));
	});

	const hashes = new Map();
	let batch = [];
	let bytes = 0;
	const flush = () => {
		if (!batch.length) return;
		const buf = git(["cat-file", "--batch"], { input: batch.join("\n") + "\n" });
		let off = 0;
		for (const oid of batch) {
			const nl = buf.indexOf(0x0a, off);
			if (nl < 0) throw new Error("git cat-file --batch 输出截断（header）");
			const header = buf.toString("ascii", off, nl).trim().split(" ");
			off = nl + 1;
			if (header.length !== 3 || header[1] !== "blob") throw new Error("git cat-file --batch 非 blob 对象");
			const size = Number(header[2]);
			const content = buf.subarray(off, off + size);
			if (content.length !== size) throw new Error("git cat-file --batch 输出截断（内容）");
			hashes.set(oid, sha256(content));
			off += size + 1;
		}
		batch = [];
		bytes = 0;
	};
	for (const oid of unique) {
		const size = sizes.get(oid);
		if (bytes + size > MAX_BATCH_BYTES && batch.length) flush();
		batch.push(oid);
		bytes += size;
	}
	flush();
	return { hashes, sizes };
}

function finish(files, oidByPath) {
	const { hashes, sizes } = hashOids([...oidByPath.values()]);
	const byPath = new Map();
	for (const f of files) {
		const oid = oidByPath.get(f);
		if (!oid) { byPath.set(f, { error: "missing or not a Git blob" }); continue; }
		byPath.set(f, { hash: hashes.get(oid), size: sizes.get(oid) });
	}
	return byPath;
}

/**
 * 工作目录 → 隔离索引 → Git clean filter → blob 字节。
 * 返回 Map(relPath -> {hash, size} | {error})。不修改真实索引/工作区/提交。
 */
export function worktreeBlobHashes(files) {
	// 只用一个临时索引文件，不建目录、不递归删除：避免批量删除保护把核对本身判成失败。
	const tmpIndex = path.join(
		os.tmpdir(),
		`csh-catalog-index-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.index`,
	);
	const env = { ...process.env, GIT_INDEX_FILE: tmpIndex };
	try {
		git(["read-tree", "--empty"], { env });
		git(["add", "-f", "--pathspec-from-file=-", "--pathspec-file-nul"], {
			env,
			input: Buffer.from(files.join("\0") + "\0", "utf8"),
		});
		const ls = git(["ls-files", "-s", "-z"], { env }).toString("utf8");
		const oidByPath = new Map();
		for (const rec of ls.split("\0")) {
			if (!rec) continue;
			const tab = rec.indexOf("\t");
			if (tab < 0) continue;
			const meta = rec.slice(0, tab).trim().split(" ");
			const oid = meta[1];
			if (meta[2] === "0" && oid) oidByPath.set(rec.slice(tab + 1), oid);
		}
		return finish(files, oidByPath);
	} finally {
		try { fs.unlinkSync(tmpIndex); } catch { /* 单文件清理失败不影响核对结论 */ }
	}
}

function oidMapFromTree(treeish, files) {
	const tree = git(["ls-tree", "-r", "-z", "--full-tree", treeish]).toString("utf8");
	const oidByPath = new Map();
	for (const rec of tree.split("\0")) {
		if (!rec) continue;
		const tab = rec.indexOf("\t");
		if (tab < 0) continue;
		const meta = rec.slice(0, tab).trim().split(" ");
		if (meta[1] === "blob" && meta[2]) oidByPath.set(rec.slice(tab + 1), meta[2]);
	}
	return finish(files, oidByPath);
}

/** 已提交 rev 的 blob 字节（只读，最终候选发布核对用） */
export function revBlobHashes(rev, files) {
	const commit = resolveRev(rev);
	return { commit, byPath: oidMapFromTree(commit, files) };
}

/** 候选 tree oid（隔离索引 write-tree 得到，不移动 HEAD / 不建引用） */
export function treeBlobHashes(treeish, files) {
	if (!/^[0-9a-f]{40,64}$/.test(treeish)) throw new Error("非法 tree oid");
	return { treeish, byPath: oidMapFromTree(treeish, files) };
}

/** 同一个候选中的三处安装版本与目录版本必须一致。 */
export function releaseVersions(cat, treeish) {
	const read = (file) => treeish ? git(["show", treeish + ":" + file]).toString("utf8")
		: fs.readFileSync(path.join(ROOT, file), "utf8");
	const field = (file) => read(file).match(/^\s*version\s*:\s*"([^"]+)"/m)?.[1] || null;
	const versions = {
		info: JSON.parse(read("info.json")).version || null,
		package: field("package.js"),
		extension: field("extension.js"),
		catalog: cat.version || null,
	};
	return { versions, versionOk: /^\d+\.\d+\.\d+$/.test(versions.info || "") &&
		Object.values(versions).every(value => value === versions.info) };
}

/** 把 catalog 与精确发布字节逐项对账 */
export function verifyCatalog(cat, byPath) {
	const files = cat.files;
	const hashes = cat.hashes || {};
	const fileSet = new Set(files);
	const mismatches = [];
	for (const f of files) {
		const info = byPath.get(f);
		if (!info || info.error || !info.hash) {
			mismatches.push({ file: f, reason: info?.error || "missing or not a Git blob" });
			continue;
		}
		if (info.hash !== hashes[f]) {
			mismatches.push({ file: f, manifest: hashes[f] ?? null, gitBlobSHA256: info.hash });
		}
	}
	const extraKeys = Object.keys(hashes).filter((k) => !fileSet.has(k));
	const missingKeys = files.filter((f) => !(f in hashes));
	const expectedBuild = sha256(Buffer.from(files.map((f) => f + ":" + hashes[f]).join("\n"), "utf8"));
	const buildOk = cat.build === expectedBuild;
	return { mismatches, extraKeys, missingKeys, expectedBuild, buildOk };
}

function parseArgs(argv) {
	const out = { rev: null, tree: null, out: null, worktree: false };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--rev" && argv[i + 1]) out.rev = argv[++i];
		else if (argv[i] === "--tree" && argv[i + 1]) out.tree = argv[++i];
		else if (argv[i] === "--out" && argv[i + 1]) out.out = argv[++i];
		else if (argv[i] === "--worktree") out.worktree = true;
		else if (argv[i] === "--help" || argv[i] === "-h") { out.help = true; }
		else throw new Error("未知参数：" + argv[i]);
	}
	if ([out.rev, out.tree, out.worktree ? "wt" : null].filter(Boolean).length > 1) {
		throw new Error("--rev / --tree / --worktree 三者互斥");
	}
	return out;
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		console.log("用法：node tools/catalog_git_bytes.mjs [--rev <commit> | --tree <tree-oid> | --worktree] [--out <file>]");
		return;
	}
	const head = git(["rev-parse", "HEAD"]).toString("utf8").trim();
	let commit = head;
	let byPath;
	let scope;
	let cat;
	if (args.rev) {
		commit = resolveRev(args.rev);
		cat = readCatalogAtRev(commit);       // 必须与该提交同代，不能拿工作区 catalog 比
		byPath = revBlobHashes(commit, cat.files).byPath;
		scope = "Exact committed Git bytes; catalog.js from the same commit (final candidate check)";
	} else if (args.tree) {
		commit = args.tree;
		cat = readCatalogAtRev(commit);       // 候选 tree 自带的 catalog.js
		byPath = treeBlobHashes(commit, cat.files).byPath;
		scope = "Candidate tree from isolated index (no commit, no ref moved); HEAD=" + head;
	} else {
		cat = readCatalog();
		byPath = worktreeBlobHashes(cat.files);
		scope = "Worktree bytes after .gitattributes clean filter (what a commit would publish); HEAD=" + head;
	}
	const v = verifyCatalog(cat, byPath);
	const versions = releaseVersions(cat, args.rev || args.tree ? commit : null);
	const issues = v.mismatches.length + v.extraKeys.length + v.missingKeys.length +
		(v.buildOk ? 0 : 1) + (versions.versionOk ? 0 : 1);
	const result = {
		...versions,
		scope,
		commit,
		version: cat.version,
		build: cat.build,
		buildOk: v.buildOk,
		expectedBuild: v.expectedBuild,
		fileCount: cat.files.length,
		mismatchCount: v.mismatches.length,
		extraHashKeys: v.extraKeys,
		missingHashKeys: v.missingKeys,
		ok: issues === 0,
		mismatches: v.mismatches,
	};
	if (args.out) {
		const dest = path.resolve(args.out);
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		fs.writeFileSync(dest, JSON.stringify(result, null, 2) + "\n", "utf8");
	}
	const summary = { ...result };
	delete summary.mismatches;
	console.log(JSON.stringify(summary, null, 2));
	if (v.mismatches.length) {
		console.error("[catalog-bytes] 不一致文件（最多列 8 个）：");
		for (const m of v.mismatches.slice(0, 8)) console.error("  " + m.file + "  catalog=" + m.manifest + "  blob=" + (m.gitBlobSHA256 || m.reason));
	}
	process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	try {
		main();
	} catch (err) {
		console.error("[catalog-bytes] 核对失败：" + err.message);
		if (err.stderr) console.error(String(err.stderr).trim().slice(-2000));
		process.exitCode = 1;
	}
}
