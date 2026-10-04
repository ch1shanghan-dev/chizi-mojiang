#!/usr/bin/env node
/**
 * 池子魔将 · 改动门禁（只读检查，不改任何业务文件）
 *
 * 用法：
 *   node tools/check.js              # 语法 + 版本一致性
 *   node tools/check.js --syntax     # 只跑语法
 *   node tools/check.js --versions   # 只跑版本一致性
 *   node tools/check.js --strict     # 任一告警也视为失败（CI 用）
 *
 * 退出码：0 = 通过；1 = 存在失败项。
 *
 * 为什么需要它：
 *   README 第二十一章要求「改前备份 + 静态检查」，第二十五章要求三处版本号一致。
 *   人工核对不可靠，这里把它变成一条命令。
 *
 * 关于语法检查的实现：
 *   无名杀 app/ 的 package.json 声明 "type":"module"，源码都是 ESM。
 *   用 `node --check` 检查时，Node 按扩展名判定模块类型，因此把待检文件
 *   复制到临时目录下的 .mjs 再检查，可正确按 ESM 解析（不执行代码）。
 */

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

/* 说明：这里不再静态引入 child_process。
   某些受限环境（沙箱 / 严格策略）会禁止 spawn 子进程，import 即失败。
   改为运行时动态尝试，失败则自动降级到内置的平衡检查。 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const ONLY_SYNTAX = has("--syntax");
const ONLY_VERSIONS = has("--versions");
const STRICT = has("--strict");

let failures = 0;
let warnings = 0;
const log = (s = "") => console.log(s);
const fail = (s) => { failures++; log("  [FAIL] " + s); };
const warn = (s) => { warnings++; log("  [WARN] " + s); };
const ok = (s) => log("  [ OK ] " + s);

/* ------------------------------------------------------------------ *
 * 一、语法检查
 * ------------------------------------------------------------------ */
function collect(dir, out = [], depth = 0) {
	if (!fs.existsSync(dir)) return out;
	let entries;
	try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
	for (const e of entries) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) {
			/* 资源目录不扫：mobilefx 下的 kill1..kill7、diankuang、wanjun、recover_* 都是帧数据/图片 */
			if (depth < 1 && !/^(image|audio|font|effect|kill|diankuang|wanjun|recover)/i.test(e.name)) {
				collect(p, out, depth + 1);
			}
			continue;
		}
		if (e.isFile() && e.name.endsWith(".js")) out.push(p);
	}
	return out;
}

function targets() {
	const list = [];
	const add = (rel) => {
		const p = path.join(ROOT, rel);
		if (fs.existsSync(p)) list.push(p);
	};
	add("extension.js");
	add("package.js");
	for (const f of collect(path.join(ROOT, "core"))) list.push(f);
	for (const f of collect(path.join(ROOT, "main"))) list.push(f);
	for (const f of collect(path.join(ROOT, "character"))) list.push(f);
	for (const f of collect(path.join(ROOT, "card"))) list.push(f);
	for (const f of collect(path.join(ROOT, "skills"))) list.push(f);
	for (const f of collect(path.join(ROOT, "mobilefx"))) list.push(f);
	for (const f of collect(path.join(ROOT, "tools"))) {
		/* 工具脚本自身也纳入检查，但跳过正在运行的这个文件以外的无关项 */
		list.push(f);
	}
	return [...new Set(list)];
}

/* ------------------------------------------------------------------ *
 * 语法检查 A：优先用 node --check（权威，能报行号）
 * ------------------------------------------------------------------ */
let spawnOk = true; // 环境是否允许 spawn，一旦失败就不再重试
let tmpSeq = 0;

/* ESM 里拿 require 的标准做法 */
let execFileSync = null;
try {
	({ execFileSync } = createRequire(import.meta.url)("child_process"));
} catch {
	execFileSync = null;
	spawnOk = false;
}

function nodeCheck(file) {
	if (!spawnOk || !execFileSync) return null;
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cshchk-"));
	const tmp = path.join(tmpDir, "t" + tmpSeq++ + ".mjs");
	try {
		fs.copyFileSync(file, tmp);
		execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" });
		return { ok: true, via: "node --check" };
	} catch (e) {
		const msg = (e && e.stderr && e.stderr.toString()) || (e && e.message) || String(e);
		/* EBUSY / EPERM / EACCES 说明环境不允许起子进程，降级而不是判失败 */
		if (/EBUSY|EPERM|EACCES|ENOENT/.test(String(e && e.message))) {
			spawnOk = false;
			return null;
		}
		return { ok: false, via: "node --check", msg: msg.split("\n").slice(0, 6).join("\n") };
	} finally {
		try { fs.unlinkSync(tmp); fs.rmdirSync(tmpDir); } catch { /* 忽略清理失败 */ }
	}
}

/* ------------------------------------------------------------------ *
 * 语法检查 B：内置平衡检查（零依赖，任何环境都能跑）
 *
 * 能捕获：括号/方括号/花括号不配对、嵌套错序、字符串或注释未闭合。
 * 不能捕获：语义错误、非法标识符等。拆分重构时最容易犯的就是括号类错误，
 * 因此作为降级方案对本项目足够。
 * ------------------------------------------------------------------ */
function balanceCheck(srcText) {
	const stack = [];
	const errors = [];
	let state = "normal"; // normal | sq | dq | tpl | lc | bc | re
	let line = 1;
	let col = 0;
	let prev = ""; // 前一个有效字符，用于正则字面量判定
	const openOf = { ")": "(", "]": "[", "}": "{" };

	for (let i = 0; i < srcText.length; i++) {
		const c = srcText[i];
		const d = srcText[i + 1];

		if (c === "\n") {
			line++; col = 0; prev = "";
			if (state === "lc" || state === "sq" || state === "dq" || state === "re") state = "normal";
			continue;
		}

		if (state === "normal") {
			if (c === "/" && d === "/") { state = "lc"; i++; col += 2; continue; }
			if (c === "/" && d === "*") { state = "bc"; i++; col += 2; continue; }
			if (c === "'") { state = "sq"; col++; prev = c; continue; }
			if (c === '"') { state = "dq"; col++; prev = c; continue; }
			if (c === "`") { state = "tpl"; col++; prev = c; continue; }
			/* 正则字面量启发式：/ 出现在不能接除号的位置时视为正则开始 */
			if (c === "/" && /[(,=:[!&|?{};+\-*%~^<>]/.test(prev) === true) {
				state = "re"; col++; prev = c; continue;
			}
			if (c === "(" || c === "[" || c === "{") { stack.push({ ch: c, line, col }); col++; prev = c; continue; }
			if (c === ")" || c === "]" || c === "}") {
				if (!stack.length) errors.push("L" + line + ":" + col + " 多余的闭括号 '" + c + "'");
				else {
					const t = stack.pop();
					if (t.ch !== openOf[c]) {
						errors.push("L" + line + ":" + col + " 括号不匹配：'" + c + "' 对应的是 L" + t.line + " 的 '" + t.ch + "'");
					}
				}
				col++; prev = c; continue;
			}
			if (!/\s/.test(c)) prev = c;
			col++;
			continue;
		}

		if (state === "lc") { col++; continue; }
		if (state === "bc") {
			if (c === "*" && d === "/") { state = "normal"; i++; col += 2; continue; }
			col++; continue;
		}
		if (state === "re") {
			if (c === "\\") { i++; col += 2; continue; }
			if (c === "/") { state = "normal"; col++; prev = c; continue; }
			col++; continue;
		}
		/* sq / dq / tpl */
		if (c === "\\") { i++; col += 2; continue; }
		const q = state === "sq" ? "'" : state === "dq" ? '"' : "`";
		if (c === q) { state = "normal"; col++; prev = c; continue; }
		col++;
	}

	if (state === "sq" || state === "dq") errors.push("文件末尾存在未闭合的字符串（" + state + "）");
	if (state === "bc") errors.push("文件末尾存在未闭合的块注释");
	if (state === "tpl") errors.push("文件末尾存在未闭合的模板字符串");
	for (const s of stack.slice(-5)) {
		errors.push("L" + s.line + ":" + s.col + " 的 '" + s.ch + "' 未闭合");
	}
	return { ok: errors.length === 0, via: "内置平衡检查", msg: errors.slice(0, 8).join("\n") };
}

function checkSyntax(file) {
	const r = nodeCheck(file);
	if (r) return r;
	return balanceCheck(fs.readFileSync(file, "utf8"));
}

function runSyntax() {
	log("== 语法检查 ==");
	const files = targets();
	let bad = 0;
	let via = "";
	for (const f of files) {
		const rel = path.relative(ROOT, f).replace(/\\/g, "/");
		const r = checkSyntax(f);
		via = r.via;
		if (r.ok) log("  [ OK ] " + rel);
		else {
			bad++;
			fail(rel + "\n" + String(r.msg).split("\n").map((l) => "         " + l).join("\n"));
		}
	}
	log("  共 " + files.length + " 个文件，失败 " + bad + " 个。（检查方式：" + via + "）");
	if (!spawnOk) {
		log("  注意：当前环境不允许启动子进程，已降级为内置平衡检查。");
		log("        在正常机器上会改用 node --check，报错可精确到行。");
	}
	log("");
}

/* ------------------------------------------------------------------ *
 * 一之二、自由变量检查（2026-09-30 新增 —— 补上语法检查的盲区）
 *
 * 为什么需要：
 *   `node --check` 只查语法。把 extension.js 拆成多模块时，原本靠模块作用域
 *   可见的**具名绑定**如果在新文件里被裸引用却没 import，语法照样通过，
 *   但运行时抛 ReferenceError。已经因此翻过两次车：
 *     ① character/index.js 的 `...cshVoices` 漏 import → 整个扩展加载失败
 *     ② extension.js 自己漏 import noname → skill 区块约 3700 处引用全未定义
 *   这两次都是 node --check 全绿但游戏打不开。所以这里独立扫一遍。
 * ------------------------------------------------------------------ */
function stripCommentsAndStrings(src) {
	let out = "";
	let state = "normal";
	let prev = ""; // 前一个有效字符，用于判定「/ 是除号还是正则开始」
	for (let i = 0; i < src.length; i++) {
		const c = src[i], d = src[i + 1];
		if (state === "normal") {
			if (c === "/" && d === "/") { state = "lc"; out += "  "; i++; continue; }
			if (c === "/" && d === "*") { state = "bc"; out += "  "; i++; continue; }
			/* 正则字面量：不处理会把正则里的 / 当成注释开始，导致后续整段状态错位
			   （曾因此把 CSS 里的 @keyframes 名误报成未声明变量）。 */
			if (c === "/" && /[(,=:[!&|?{};+\-*%~^<>]/.test(prev)) {
				state = "re"; out += " "; continue;
			}
			if (c === "'" || c === '"' || c === "`") { state = c === "'" ? "sq" : c === '"' ? "dq" : "tpl"; out += " "; continue; }
			if (!/\s/.test(c)) prev = c;
			out += c; continue;
		}
		if (state === "re") {
			if (c === "\\") { out += "  "; i++; continue; }
			if (c === "/") { state = "normal"; prev = "/"; out += " "; continue; }
			if (c === "\n") { state = "normal"; out += "\n"; continue; }
			out += " "; continue;
		}
		if (state === "lc") { if (c === "\n") { state = "normal"; out += "\n"; } else out += " "; continue; }
		if (state === "bc") { if (c === "*" && d === "/") { state = "normal"; out += "  "; i++; } else out += c === "\n" ? "\n" : " "; continue; }
		if (c === "\\") { out += "  "; i++; continue; }
		const q = state === "sq" ? "'" : state === "dq" ? '"' : "`";
		if (c === q) { state = "normal"; out += " "; continue; }
		out += c === "\n" ? "\n" : " ";
	}
	return out;
}

function declaredNames(code) {
	const names = new Set();
	/* import 绑定：分四种形态，逐行解析（一个复杂正则容易漏掉默认导入） */
	for (const raw of code.split("\n")) {
		const line = raw.trim();
		if (!/^import\b/.test(line)) continue;
		const ns = line.match(/^import\s+\*\s+as\s+([A-Za-z_$][\w$]*)/);
		if (ns) { names.add(ns[1]); continue; }
		const br = line.match(/\{([^}]*)\}/);
		if (br) {
			br[1].split(",").forEach((x) => {
				const p = x.trim().split(/\s+as\s+/);
				const n = (p[1] || p[0] || "").trim();
				if (n) names.add(n);
			});
		}
		const head = line.split(/\bfrom\b/)[0].replace(/\{[^}]*\}/, "").replace(/^import\s*/, "");
		head.split(",").forEach((x) => {
			const n = x.trim();
			if (/^[A-Za-z_$][\w$]*$/.test(n)) names.add(n);
		});
	}
	const decRe = /\b(?:var|let|const|function|class)\s+([A-Za-z_$][\w$]*)/g;
	let m;
	while ((m = decRe.exec(code))) names.add(m[1]);
	const fnRe = /function\s*[A-Za-z_$\w]*\s*\(([^)]*)\)/g;
	while ((m = fnRe.exec(code))) {
		m[1].split(",").forEach((s) => {
			const n = s.trim().replace(/=.*$/, "").trim();
			if (/^[A-Za-z_$][\w$]*$/.test(n)) names.add(n);
		});
	}
	return names;
}

const NONAME_BINDINGS = ["lib", "game", "ui", "get", "ai", "_status"];

function freeVarsOf(file) {
	const raw = fs.readFileSync(file, "utf8");
	const code = stripCommentsAndStrings(raw);
	const declared = declaredNames(code);

	/* 关键判据：本文件是不是「ESM 模块」。
	 *   · 有 import  → 模块，所有绑定必须来自 import 或本地声明；缺一个就是真 bug。
	 *   · 零 import  → 双载脚本（csh_sfx / csh_bgm / csh_registry / csh_migrate 等），
	 *                  本就从宿主全局取 lib，`typeof lib !== "undefined"` 是**必需**的守卫，
	 *                  对这类文件不做 NONAME 绑定检查。
	 *
	 * 这条判据是踩坑换来的：最初按「凡被 typeof 探过的名字就整体豁免」处理，结果
	 * extension.js 技能区里大量 `typeof lib !== "undefined"` 防御代码把 lib/game/ui/get/_status
	 * 全部豁免掉，整个检查形同虚设 —— 故意注释掉 noname import 做反证测试时竟然照样通过。
	 * 换成「按文件类型判定」后，反证测试能正确报错。 */
	/* 要求 import 后紧跟的是绑定名 / { / * / 引号，而不是冒号 ——
	   否则对象字面量里的 `import: doImport,`（csh_migrate.js 里就有）会被误判成 import 语句，
	   把整个文件错当成 ESM 模块。 */
	const hasImport = /^\s*import\s+[^:\s]/m.test(code);

	/* 判断某次出现是不是「属性访问」（obj.lib）。要放过展开语法 `...name`：
	   `...cshVoices` 的前一个字符也是 `.`，最初当成属性访问跳过了，
	   导致 character/index.js 漏 import 的致命 bug 没被检出来。 */
	function isPropertyAccess(c0, nameStart) {
		if (c0[nameStart - 1] !== ".") return false;
		if (c0.slice(nameStart - 3, nameStart) === "...") return false;
		return true;
	}

	const hits = new Set();
	let m;
	/* 前导 \b 必须有：属性名常带下划线前缀（event._cshPoyinAI / el._cshRollId / item.__cshKey），
	   少了词边界会把 `_cshXxx` 里的 cshXxx 当成独立标识符报出来。 */
	const re = /(\bcsh[A-Z][A-Za-z0-9_]*)\b/g;
	while ((m = re.exec(code))) {
		const ns = m.index;
		if (declared.has(m[1]) || isPropertyAccess(code, ns)) continue;
		if (/^\s*:/.test(code.slice(ns + m[1].length, ns + m[1].length + 3))) continue;
		hits.add(m[1]);
	}
	if (hasImport) {
		for (const nb of NONAME_BINDINGS) {
			if (declared.has(nb)) continue;
			const re2 = new RegExp("\\b" + nb + "\\b", "g");
			let m2;
			while ((m2 = re2.exec(code))) {
				if (isPropertyAccess(code, m2.index)) continue;
				if (/^\s*:/.test(code.slice(m2.index + nb.length, m2.index + nb.length + 3))) continue;
				hits.add(nb);
				break;
			}
		}
	}
	return [...hits];
}

function runFreeVars() {
	log("== 自由变量检查（拆分后未 import 的裸引用）==");
	const files = [
		path.join(ROOT, "extension.js"),
		...collect(path.join(ROOT, "main")),
		...collect(path.join(ROOT, "character")),
		...collect(path.join(ROOT, "card")),
		...collect(path.join(ROOT, "core")),
	].filter((f) => fs.existsSync(f));
	let bad = 0;
	for (const f of files) {
		const rel = path.relative(ROOT, f).replace(/\\/g, "/");
		let hits;
		try { hits = freeVarsOf(f); } catch (e) { warn(rel + " 扫描失败：" + e.message); continue; }
		if (hits.length) {
			bad++;
			fail(rel + " 存在未声明的裸引用：" + hits.join(", ") +
				"\n         → 缺 import 或拼写错误。这类问题 node --check 查不出，但运行时会抛 ReferenceError。");
		}
	}
	if (!bad) ok(files.length + " 个文件均无未声明的自由变量");
	log("");
}

/* ------------------------------------------------------------------ *
 * 二、版本号三处一致（README 第一章红线）
 * ------------------------------------------------------------------ */
function readVersion(file, pattern) {
	if (!fs.existsSync(file)) return null;
	const s = fs.readFileSync(file, "utf8");
	const m = s.match(pattern);
	return m ? m[1] : null;
}

function runVersions() {
	log("== 版本号一致性（package.js / info.json / extension.js 三处必须相同）==");
	const vPkg = readVersion(path.join(ROOT, "package.js"), /version\s*:\s*"([^"]+)"/);
	const vInfo = readVersion(path.join(ROOT, "info.json"), /"version"\s*:\s*"([^"]+)"/);
	const vExt = readVersion(path.join(ROOT, "extension.js"), /version\s*:\s*"([^"]+)"/);

	const found = { "package.js": vPkg, "info.json": vInfo, "extension.js": vExt };
	for (const k of Object.keys(found)) {
		if (found[k]) log("  " + k.padEnd(14) + " -> " + found[k]);
		else fail(k + " 未解析到版本号");
	}
	const vals = Object.values(found).filter(Boolean);
	if (vals.length === 3) {
		if (new Set(vals).size === 1) ok("三处一致：" + vals[0]);
		else fail("三处不一致：" + JSON.stringify(found) + "。README 红线：版本号须完全一致");
	}
	log("");

	/* 附加：package.js 的 files 清单与实际目录是否对得上（漏列会导致打包缺文件） */
	log("== package.js files 清单核对 ==");
	const pkgSrc = fs.existsSync(path.join(ROOT, "package.js"))
		? fs.readFileSync(path.join(ROOT, "package.js"), "utf8") : "";
	const fm = pkgSrc.match(/files\s*:\s*\[([^\]]*)\]/);
	if (!fm) {
		warn("package.js 未声明 files 清单");
	} else {
		const declared = [...fm[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
		const actual = fs.readdirSync(ROOT).filter((n) => !n.startsWith("."));
		const missing = declared.filter((d) => !actual.includes(d));
		const undeclared = actual.filter((a) => !declared.includes(a));
		if (missing.length) fail("files 声明了但磁盘不存在：" + missing.join(", "));
		else ok("files 声明项均存在（" + declared.length + " 项）");
		if (undeclared.length) {
			warn("磁盘存在但未列入 files（不会随扩展打包）：" + undeclared.join(", "));
		}
	}
	log("");

	/* 附加：package.js 的 size 声明与 files 清单实际体积核对（偏差 >5% 提醒同步） */
	const sm = pkgSrc.match(/size\s*:\s*"([\d.]+)\s*(KB|MB|GB)\s*"/i);
	if (!sm) {
		warn("package.js 未声明 size（可运行 node tools/sync_size.js 自动写入）");
	} else if (fm) {
		const items2 = [...fm[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
		let total = 0;
		const addSize = (p) => {
			if (!fs.existsSync(p)) return;
			const st = fs.statSync(p);
			if (st.isDirectory()) {
				for (const e of fs.readdirSync(p)) {
					if (!e.startsWith(".")) addSize(path.join(p, e));
				}
			} else total += st.size;
		};
		items2.forEach((d) => addSize(path.join(ROOT, d)));
		const mb = total / 1024 / 1024;
		const unitMB = { KB: 1 / 1024, MB: 1, GB: 1024 }[sm[2].toUpperCase()];
		const declaredMB = parseFloat(sm[1]) * unitMB;
		if (Math.abs(mb - declaredMB) / Math.max(mb, 0.01) > 0.05) {
			warn("size 声明 \"" + sm[1] + sm[2] + "\" 与 files 清单实际 " + mb.toFixed(1) + "MB 偏差超 5% —— 运行 node tools/sync_size.js 同步");
		} else ok("size 声明与实际体积一致（约 " + mb.toFixed(1) + "MB）");
	}
	log("");
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */
log("池子魔将 · 改动门禁");
log("项目根：" + ROOT);
log("");

if (!ONLY_VERSIONS) { runSyntax(); runFreeVars(); }
if (!ONLY_SYNTAX) runVersions();

log("----------------------------------------");
if (failures > 0) {
	log("结论：未通过，失败 " + failures + " 项，告警 " + warnings + " 项。");
	process.exit(1);
}
if (STRICT && warnings > 0) {
	log("结论：--strict 模式下存在 " + warnings + " 项告警，视为失败。");
	process.exit(1);
}
log("结论：通过。（告警 " + warnings + " 项，不阻断）");
process.exit(0);
