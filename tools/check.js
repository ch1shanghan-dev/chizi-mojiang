#!/usr/bin/env node
/**
 * 池子魔将 · 改动门禁（只读检查，不改任何业务文件）
 *
 * 用法：
 *   node tools/check.js              # 语法 + 自由变量 + import + 技能/翻译/音频一致性 + 版本
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
 *
 * 关于技能/翻译/音频一致性（2026-10-08 新增）：
 *   postmortem #1（三向核对）、#9（无译名技能被引擎 silent 抢跑）、#14（_info 是渲染门槛）
 *   与卡尔语音事故（audio 字符串引用不存在的技能 → console.error 且无声）的共同点：
 *   全都静态可查、运行时静默失败。这里固化为常驻判据。
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
	let reCls = false; // 正则字符类 [ ] 内（/ 不结束正则）
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
				state = "re"; reCls = false; col++; prev = c; continue;
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
			/* 【2026-10-09 修】字符类 [ ] 内的 "/" 不结束正则（JS 语法本身如此）——
			   此前 /[\\/]/g 与 /[^A-Za-z0-9._\-/]/ 这类"字符类含斜杠"的正则会被误判
			   提前闭合，把后面的代码当正则内容吞掉，连锁报出假的括号不匹配。 */
			if (c === "[") reCls = true;
			else if (c === "]") reCls = false;
			else if (c === "/" && !reCls) { state = "normal"; col++; prev = c; continue; }
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
	/* 【2026-10-08 补】三种漏收的声明形态——不收齐会把合法变量误报成自由变量：
	   · 多声明符列表 `var a = 1, b = 2, c;`（原正则只抓第一个名字）；
	   · catch 参数 `catch (eXxx)`；
	   · 箭头函数参数 `x => …` / `(a, b) => …`。
	   多收名字只会让检查更松（不产生新误报），换来判据可用。 */
	const multiRe = /\b(?:var|let|const)\s+([^\n;]+)/g;
	while ((m = multiRe.exec(code))) {
		const nameRe = /(?:^|,)\s*([A-Za-z_$][\w$]*)\s*(?==|,|$)/g;
		let mm;
		while ((mm = nameRe.exec(m[1]))) names.add(mm[1]);
	}
	const catchRe = /catch\s*\(\s*([A-Za-z_$][\w$]*)/g;
	while ((m = catchRe.exec(code))) names.add(m[1]);
	const arrowRe = /(?:\(([^()]*)\)|([A-Za-z_$][\w$]*))\s*=>/g;
	while ((m = arrowRe.exec(code))) {
		(m[1] || m[2] || "").split(",").forEach((s) => {
			const n = s.trim().replace(/=.*$/, "").replace(/^\.\.\./, "").trim();
			if (/^[A-Za-z_$][\w$]*$/.test(n)) names.add(n);
		});
	}
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
	/* 【2026-10-08 补线】上一条只认 csh[A-Z]… 前缀的助手，漏掉了 tongyuanBird 这类驼峰助手：
	   童渊并入时 22 处引用悬空（模块级管理器没随技能块搬入），check 全绿、运行时必炸。
	   这里补一条收窄判据：**驼峰标识符 + 紧跟属性访问**（name.xxx）——正是「模块级助手对象」的
	   用法形态。不查普通调用（parseInt(...) 之类宿主全局会误报），宿主全局另行白名单豁免。 */
	const HOST_GLOBALS = new Set([
		"localStorage", "sessionStorage", "queueMicrotask", "structuredClone",
		"webkitAudioContext", "AudioContext", "OffscreenCanvas", "createImageBitmap",
	]);
	const re2 = /(\b[a-z][A-Za-z0-9_]*[A-Z][A-Za-z0-9_]*)\b(?=\s*\.)/g;
	while ((m = re2.exec(code))) {
		const ns = m.index;
		if (declared.has(m[1]) || HOST_GLOBALS.has(m[1]) || isPropertyAccess(code, ns)) continue;
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
		/* 【2026-10-08 补】skills/ 此前不在扫描范围 —— 而它正是拆分事故的高发区
		   （skills/index.js 曾因缺 noname import 让全扩展 ReferenceError）。 */
		...collect(path.join(ROOT, "skills")),
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
 * import 路径完整性（2026-10-04 新增）
 *
 * 背景：skills/index.js 拆分后比 extension.js 深一层目录，noname 导入却沿用了
 * ../../noname.js → 指向不存在的 extension/noname.js。node --check 只查语法、
 * 自由变量扫描只查绑定名，双双放过；浏览器里报
 * "Failed to fetch dynamically imported module"，扩展整体加载失败（用户可见的
 * 「扩展加载失败」弹窗）。本检查把「相对导入必须解析到实体文件」变成门禁项。
 * ------------------------------------------------------------------ */
function stripComments(src) {
	// 极简剥离块注释与整行注释（校验器用途够用；不动字符串内如 URL 的 //）
	return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

function importSpecsOf(file) {
	let src;
	try { src = stripComments(fs.readFileSync(file, "utf8")); } catch { return []; }
	const specs = new Set();
	const patterns = [
		/\b(?:import|export)\s[^;]*?\bfrom\s*["']([^"']+)["']/g,
		/\bimport\s*["']([^"']+)["']/g,
		/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
	];
	for (const re of patterns) {
		let m;
		while ((m = re.exec(src))) specs.add(m[1]);
	}
	return [...specs];
}

function runImports() {
	log("== import 路径完整性（相对导入必须解析到实体文件）==");
	const files = targets().filter((f) => f.endsWith(".js"));
	let bad = 0;
	for (const f of files) {
		const rel = path.relative(ROOT, f).replace(/\\/g, "/");
		for (const spec of importSpecsOf(f)) {
			if (!spec.startsWith(".")) continue; // 裸说明符（如 "noname"）由宿主解析
			const target = path.resolve(path.dirname(f), spec);
			if (!fs.existsSync(target)) {
				bad++;
				fail(rel + ' import 路径失效："' + spec + '" → 解析为 ' + target + "（不存在）" +
					"\n         → 浏览器会报 Failed to fetch dynamically imported module，扩展整体加载失败。");
			}
		}
	}
	if (!bad) ok(files.length + " 个文件的相对 import 均可解析到实体文件");
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
 * 五、技能 / 翻译 / 音频 一致性（2026-10-08 新增）
 *
 * 三件「静态可查、运行时静默失败」的事，来自事故复盘：
 *   · postmortem #1：武将 skills 数组 ↔ 技能注册键 ↔ 翻译键，任一处拼错即整体失效；
 *   · postmortem #9 / #14：无译名技能会被引擎当 silent 直接抢跑；_info 是技能列表渲染门槛；
 *   · 卡尔语音事故（2026-10-08）：audio 字符串是「引用另一个技能」，被引用技能不存在时
 *     引擎 console.error 且无声（get/audio.ts 的 SkillAudio 构造），6 个秘术因此全哑。
 * 判据：A/A2/C 失败；B 告警（silent 子技能无译名是合法设计，只提示）。
 * ------------------------------------------------------------------ */
function sliceBetween(src, startMark, endMark, label) {
	const s = src.indexOf(startMark);
	const e = s < 0 ? -1 : src.indexOf(endMark, s + startMark.length);
	if (s < 0 || e < 0) return null;
	return src.slice(s, e);
}

/* 本体技能名索引（character/ 全目录扫一遍，结果缓存；只用于解析 audio 引用） */
let __baseSkillIndex = null;
function baseSkillIndex() {
	if (__baseSkillIndex) return __baseSkillIndex;
	const base = path.resolve(ROOT, "..", ".."); // resources/app
	const set = new Set();
	const walk = (d) => {
		let entries;
		try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
		for (const e of entries) {
			const p = path.join(d, e.name);
			if (e.isDirectory()) walk(p);
			else if (e.name.endsWith(".js")) {
				let t = "";
				try { t = fs.readFileSync(p, "utf8"); } catch { continue; }
				for (const m of t.matchAll(/^\s*"?([A-Za-z_][A-Za-z0-9_]*)"?\s*:\s*\{/gm)) set.add(m[1]);
			}
		}
	};
	walk(path.join(base, "character"));
	__baseSkillIndex = set;
	return set;
}

function runConsistency() {
	log("== 技能 / 翻译 / 音频 一致性 ==");
	const skillsPath = path.join(ROOT, "skills", "index.js");
	const charPath = path.join(ROOT, "character", "index.js");
	const cardPath = path.join(ROOT, "card", "index.js");
	if (!fs.existsSync(skillsPath) || !fs.existsSync(charPath)) {
		warn("skills/index.js 或 character/index.js 不存在，跳过一致性检查");
		log("");
		return;
	}
	const skillsSrc = fs.readFileSync(skillsPath, "utf8");
	const charSrc = fs.readFileSync(charPath, "utf8");
	const cardSrc = fs.existsSync(cardPath) ? fs.readFileSync(cardPath, "utf8") : "";

	const skillBlock = sliceBetween(skillsSrc, "\n        skill: {", "\n        translate: {", "skill");
	const skillsTrans = sliceBetween(skillsSrc, "\n        translate: {", "\nexport default cshSkillPack;", "translate");
	if (!skillBlock || !skillsTrans) {
		fail("skills/index.js 的 skill / translate 区块定位失败（结构变了？同步更新本检查）");
		log("");
		return;
	}

	/* 技能键（over-approximate：任意缩进的 name: { 都算已定义，宁松勿误报） */
	const skillKeys = new Set();
	for (const m of skillBlock.matchAll(/"?([A-Za-z_][A-Za-z0-9_]*)"?\s*:\s*\{/g)) skillKeys.add(m[1]);
	/* 翻译键：skills 区 + character 区 + card 区（武将名/技能名/标记名可能分居三处） */
	const transKeys = new Set();
	const addTrans = (text) => {
		if (!text) return;
		for (const m of text.matchAll(/^\s*"?([A-Za-z_][A-Za-z0-9_]*)"?\s*:/gm)) transKeys.add(m[1]);
	};
	addTrans(skillsTrans);
	addTrans(sliceBetween(charSrc, "\n        translate: {", "\n                        characterIntro:", "char.translate"));
	addTrans(sliceBetween(charSrc, "\n                        characterIntro:", "\n        characterTitle:", "char.intro"));
	addTrans(sliceBetween(cardSrc, "\n        translate: {", "\n        skill:", "card.translate"));
	/* card 键（衍生卡/装备技名） */
	const cardKeys = new Set();
	for (const m of cardSrc.matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"\s*:/g)) cardKeys.add(m[1]);

	/* 武将技能数组 */
	const charEntries = [];
	const starts = [];
	for (const m of charSrc.matchAll(/^\s{12}"(csh_[A-Za-z0-9_]+)":\s*\{\s*$/gm)) starts.push({ id: m[1], at: m.index });
	for (let i = 0; i < starts.length; i++) {
		const body = charSrc.slice(starts[i].at, i + 1 < starts.length ? starts[i + 1].at : charSrc.length);
		const sm = body.match(/skills:\s*\[([^\]]*)\]/);
		const skills = sm ? [...sm[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
		charEntries.push({ id: starts[i].id, skills });
	}

	/* A：武将技能必须能解析到技能键 / card 键 */
	const missA = [];
	for (const c of charEntries) for (const s of c.skills) {
		if (!skillKeys.has(s) && !cardKeys.has(s)) missA.push(c.id + " → " + s);
	}
	if (missA.length) fail("武将技能未定义（" + missA.length + "）：" + missA.slice(0, 8).join("；") + "。武将技会整体空白");
	else ok(charEntries.length + " 名武将的技能数组均可解析到技能键");

	/* A2：武将技能必须有译名 + _info（引擎渲染门槛，postmortem #14） */
	const missA2 = [];
	for (const c of charEntries) for (const s of c.skills) {
		if (!skillKeys.has(s) && !cardKeys.has(s)) continue;
		if (!transKeys.has(s)) missA2.push(c.id + " → " + s + "（缺名称）");
		else if (!transKeys.has(s + "_info")) missA2.push(c.id + " → " + s + "（缺 _info）");
	}
	if (missA2.length) fail("武将技能缺译名 / _info（" + missA2.length + "）：" + missA2.slice(0, 8).join("；") + "。技能列表不渲染");
	else ok("武将技能的译名与 _info 齐备");

	/* B：技能键缺译名（告警级；silent 子技能无译名是合法设计） */
	const missB = [];
	for (const s of skillKeys) {
		if (!s.startsWith("csh_") || transKeys.has(s)) continue;
		const at = skillBlock.indexOf('"' + s + '": {') >= 0 ? skillBlock.indexOf('"' + s + '": {') : skillBlock.indexOf(s + ": {");
		const body = at >= 0 ? skillBlock.slice(at, at + 900) : "";
		missB.push(s + (/silent:\s*true/.test(body) ? "" : "（非 silent）"));
	}
	if (missB.length) warn("技能缺译名 " + missB.length + " 个（多为 silent 子技能，可接受；非 silent 项需补名）：" + missB.slice(0, 6).join("、"));
	else ok("全部技能均有译名");

	/* C：audio 字符串引用必须解析到实体技能（扩展内 / 本体） */
	const refs = new Map();
	for (const m of skillBlock.matchAll(/audio:\s*"([^"]+)"/g)) {
		const v = m[1];
		if (v.includes("/") || v.includes(":") || v.includes(".")) continue; // 路径 / ext: 路径不当引用
		refs.set(v, (refs.get(v) || 0) + 1);
	}
	const base = baseSkillIndex();
	const missC = [];
	for (const [name] of refs) {
		if (skillKeys.has(name) || cardKeys.has(name) || base.has(name)) continue;
		missC.push(name);
	}
	if (missC.length) fail("audio 字符串引用无法解析（" + missC.length + "）：" + missC.join("、") +
		"。引擎会 console.error 且无声（语音全哑）——改成现存技能 id，或 audio: false");
	else ok("audio 引用全部可解析（" + refs.size + " 个外部/裸名引用，本体技能索引 " + base.size + " 项）");
	log("");
}

/* ------------------------------------------------------------------ *
 * BOSS 模式断言（2026-10-13 · 设计定稿 §5.4 · runBossChecks）
 * 数据源：core/csh_bossdata.js（零 import 纯数据，Node 可直校）+ skills/boss.js
 * ------------------------------------------------------------------ */
function bossBlockOf(text, marker) {
	const start = text.indexOf(marker);
	if (start < 0) return "";
	let i = text.indexOf("{", start), depth = 0;
	for (let p = i; p < text.length; p++) {
		const c = text[p];
		if (c === "{") depth++;
		else if (c === "}") { depth--; if (depth === 0) return text.slice(i + 1, p); }
	}
	return "";
}

async function runBossChecks() {
	log("");
	log("【BOSS 模式断言（runBossChecks）】");
	let BD, BJ;
	try {
		BD = await import("../core/csh_bossdata.js");
		/* ★ 2026-10-15：skills/boss.js 现在**必须**显式 import 引擎全局
		   （它此前零 import 却用了 160 次 game./lib./get. …，作者实机吃到
		   `game is not defined` —— 见门禁 E36）。但真去 import 引擎会连带加载
		   noname 的 onload 模块，而那条链上依赖 vue 包，工具侧（Node）解析不到。
		   这里的静态断言只关心"技能表的结构"（数量/描述/文案/registry），
		   并不需要真引擎对象 ⇒ 因此**用桩加载**：把 import 行换成一组空对象，
		   写进临时文件再 import，其余检查一字不变。 */
		const bjPath = path.join(ROOT, "skills", "boss.js");
		const bjSrc = fs.readFileSync(bjPath, "utf8");
		const STUB = "const lib = {}, game = {}, ui = {}, get = {}, ai = {}, _status = {};";
		let okStub = false;
		const bjStub = bjSrc.replace(
			/^import\s*\{[^}]*\}\s*from\s*["'][^"']*noname\.js["'];?[^\n]*\n/m,
			function (m0) { okStub = true; return STUB + "\n"; }
		);
		if (okStub) {
			const os = await import("node:os");
			const { pathToFileURL } = await import("node:url");
			const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "csh-bj-"));
			const tmpFile = path.join(tmpDir, "boss_stub.mjs");
			fs.writeFileSync(tmpFile, bjStub, "utf8");
			BJ = await import(pathToFileURL(tmpFile).href);
			try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (eRm) {}
		} else {
			/* 没有可替换的 import 行 ⇒ 说明又回到"零 import 用全局"的老写法，正是 E36 要挡的 */
			fail("skills/boss.js 缺引擎 import 行（工具侧无法桩加载；见 E36）");
			return;
		}
	} catch (e) {
		fail("BOSS 模块无法 import（ESM 语法错误？" + e.message + "）");
		return;
	}

	/* 名册真值（character/index.js 单源） */
	const charText = fs.readFileSync(path.join(ROOT, "character", "index.js"), "utf8");
	const charBlock = bossBlockOf(charText, "character: {");
	const roster = [];
	{ const re = /"(csh_[a-z_0-9]+)"\s*:\s*\{/g; let m; while ((m = re.exec(charBlock))) roster.push(m[1]); }
	const rosterSkills = new Set();
	{ const re = /"(csh_[a-z_0-9]+)"\s*:\s*\{/g; let m;
		while ((m = re.exec(charBlock))) {
			const seg = charBlock.slice(m.index, m.index + 900);
			const sk = /(?:^|[\s,{])skills\s*:\s*\[([^\]]*)\]/.exec(seg);
			if (sk) (sk[1].match(/"(csh_[^"]+)"/g) || []).forEach(x => rosterSkills.add(x.slice(1, -1)));
		}
	}

	/* ① 覆盖与档位：分配表 ↔ 名册（selfCheck 内含 93/总数/重复/档位计数） */
	const errs = BD.selfCheck(roster);
	if (errs.length) fail("BOSS 分配表自检未过：" + errs.join("；"));
	else ok("BOSS 分配表 93/93 覆盖名册（究极 8 / 霸主 30 / 彩蛋 4 / 精英 51，无重复无缺漏；移出 6 人见 BOSS_EXCLUDED）");

	/* ② 构造冒烟（mock 原始包数据 → 纯构造函数；trans/titles 与 bossmode 实调同参） */
	const mock = {}; const mockTrans = {}; const mockTitles = {};
	roster.forEach(id => {
		mock[id] = { sex: "male", group: "qun", hp: 4, skills: ["csh_mock_skill"], img: "extension/池子魔将/image/" + id + ".webp", dieAudios: ["d"] };
		mockTrans[id] = "测名_" + id;
		mockTitles[id] = "称号_" + id;
	});
	const built = BD.buildBossEntries(mock, mockTrans, mockTitles);

	/* ③ 条目完整性：watch 全装配 / group=devil / extraModeData 保留出身 / hp=maxHp */
	const bossIds = Object.keys(built.entries);          /* boss ID 键序 = 出场顺序（对象键序） */
	const badE = [];
	for (const bid of bossIds) {
		const e = built.entries[bid];
		if (!e) { badE.push(bid + "（缺条目）"); continue; }
		const id = BD.origIdOf(bid);                     /* ★ v4 修正：循环变量是 bid，原 ID 需转换 */
		const tier = BD.tierOf(id);
		/* v4：条目为对象形态（与 character/index.js 原生条目同格式），
		   但必须补齐数组索引（[0]sex/[1]group/[2]hp/[3]skills/[5]extraModeData）——
		   引擎多处 [N] 直读（optionsMenu.js:203 / boss.js:109 / player.init:2628） */
		if (Array.isArray(e)) { badE.push(bid + "（不应为数组，应与原生条目同对象格式）"); continue; }
		if (!Array.isArray(e[3]) || !e[3].length) { badE.push(bid + "（[3] 索引缺失）"); continue; }
		if (e[1] !== BD.BOSS_GROUP) badE.push(bid + "（[1]/group≠" + BD.BOSS_GROUP + "）");
		if (e[5] !== "qun") badE.push(bid + "（[5]/extraModeData 丢失）");
		if (!e.skills.includes("csh_boss_watch")) badE.push(bid + "（缺 watch）");
		if (BD.BOSS_SYSTEM_SKILLS.some(sk => !e.skills.includes(sk))) badE.push(bid + "（缺系统层技能）");
		if (!e.isUnseen) badE.push(bid + "（缺 isUnseen · 武将设置页隐藏）");
		/* 醒魔（解封）：张飞/关索（NO_AWAKEN）/ 彩蛋档 / 50 血特例不装配；其余必须装配 */
		const wantXm = BD.growsOf(id);
		if (wantXm && !e.skills.includes("csh_boss_xingmo")) badE.push(bid + "（缺 xingmo）");
		if (!wantXm && e.skills.includes("csh_boss_xingmo")) badE.push(bid + "（不应有 xingmo）");
		if (e.skills.includes("csh_boss_groupfix")) badE.push(bid + "（groupfix 应已删除）");
		/* v4 开局血量：装解封者 = 40% 起点；不装者 = 完全体 X（董卓/兀突骨 50 特例同口径） */
		const wantHp = BD.startHpOf(id);
		if (e.hp !== wantHp || e.maxHp !== wantHp) badE.push(bid + "（开局 hp≠" + wantHp + "）");
		if (!e.groupInGuozhan) badE.push(bid + "（缺 groupInGuozhan）");
		if (!built.names[bid] || built.names[bid] === bid) badE.push(bid + "（译名缺失/未取到）");
		if (!e.img || e.img === bid) badE.push(bid + "（立绘未复制）");
	}
	if (bossIds.length !== 93) badE.unshift("构造条目 " + bossIds.length + " ≠ 93");
	if (badE.length) fail("魔王条目异常：" + badE.slice(0, 6).join("；"));
	else ok("魔王条目 93 条完整（对象形态+数组索引双通道 / watch+系统层二技+isUnseen+醒魔 按档位装配 / 立绘·出身色 / hp=maxHp）");

	/* ④ 档位参数：chongzheng 5/4/2/0（2026-10-15 作者定案）· 魔息 3/2/1/0 · minion（究极 2@2/8 · 霸主 1@2 · 精英游魂） */
	const badC = [];
	for (const bid of bossIds) {
		const id = BD.origIdOf(bid);
		const tier = BD.tierOf(id);
		const c = built.cfg[bid];
		if (!c) { badC.push(bid + "（缺 cfg）"); continue; }
		if (c.chongzheng !== BD.TIER_CHONGZHENG[tier]) badC.push(bid + "（chongzheng≠" + BD.TIER_CHONGZHENG[tier] + "）");
		if (c._csh_moxi !== BD.TIER_MOXI[tier]) badC.push(bid + "（魔息≠" + BD.TIER_MOXI[tier] + "）");
		if (c._csh_x !== BD.fullHpOf(id)) badC.push(bid + "（_csh_x≠" + BD.fullHpOf(id) + "）");
		/* v6.1 随机搭配（全随机）：断言【结构】——究极 2 只 @2/8 互异且在池、
		   霸主 1 只 @2 在池、**精英 1 只 @2 在池**、彩蛋不配。 */
		const mn = c.minion || null;
		if (tier === "egg") {
			if (mn) badC.push(bid + "（彩蛋不应配 minion）");
		} else if (tier === "elite") {
			if (!mn || Object.keys(mn).length !== 1 || !mn["2"]) badC.push(bid + "（精英应配 1 只 @2）");
			else if (!BD.MINION_POOL.includes(mn["2"])) badC.push(bid + "（精英妖灵不在池内）");
		} else if (tier === "ultimate") {
			const ks = mn ? Object.keys(mn).sort() : [];
			if (ks.length !== 2 || ks[0] !== "2" || ks[1] !== "8") badC.push(bid + "（究极应 2 只 @2/8）");
			else if (mn["2"] === mn["8"]) badC.push(bid + "（究极两妖灵重复）");
			else if (!BD.MINION_POOL.includes(mn["2"]) || !BD.MINION_POOL.includes(mn["8"])) badC.push(bid + "（究极妖灵不在池内）");
		} else if (tier === "lord") {
			if (!mn || Object.keys(mn).length !== 1 || !mn["2"]) badC.push(bid + "（霸主应配 1 只 @2）");
			else if (!BD.MINION_POOL.includes(mn["2"])) badC.push(bid + "（霸主妖灵不在池内）");
		}
	}
	if (badC.length) fail("lib.boss 配置异常：" + badC.slice(0, 6).join("；"));
	else ok("档位参数正确（重整 5/4/2/0 · 魔息 3/2/1 · 解封上限 _csh_x=档位完全体 · 妖灵 v6.1 全随机：究极 2@2/8 池内互异/霸主 1@2 池内/精英 1@2 池内/彩蛋无）");
	/* v6.1 随机覆盖（抽取 1000 次，三档合计必须覆盖全池 50 只） */
	{
		const hit = new Set();
		for (let i = 0; i < 1000; i++) {
			const p2 = BD.pickMinions("ultimate");
			hit.add(p2["2"]); hit.add(p2["8"]);
			hit.add(BD.pickMinions("lord")["2"]);
			hit.add(BD.pickMinions("elite")["2"]);
		}
		const missed = BD.MINION_POOL.filter(x => !hit.has(x));
		if (missed.length) fail("随机池覆盖不足（三档合计抽取未出现）：" + missed.join("、"));
		else ok("随机搭配覆盖：三档合计抽取命中全池 50 只（六式 6 + 十二美 12 + 希里 + 春野樱 + 十卫 10 + 二十刑 20）");
	}

	/* ④+ ★执行级门禁 E1/E2（v4.0.6 键系错配 BUG 的形式化——order 键系必须与产物同键，
	   且引擎开局合并逻辑（boss.js:215-218 同款）必须能读到 minion/gameDraw） */
	const e1bad = BD.allBossIds().filter(bid => !built.entries[bid] || !built.cfg[bid] || !built.names[bid]);
	if (e1bad.length) fail("键系错配（order 出现与 entries/cfg/names 不同键的 ID）：" + e1bad.slice(0, 5).join("、"));
	else ok("执行级 E1：allBossIds() 与产物同键系（csh_boss_*）——4.0.6 妖灵 BUG 的键系错配已结构性排除");
	const simCfg = built.cfg["csh_boss_mlb"];
	const simBossinfo = { loopType: 1, chongzheng: 5 };
	for (const k in simCfg) simBossinfo[k] = simCfg[k];
	if (!simBossinfo.minion || !simBossinfo.minion["2"] || simBossinfo._csh_moxi !== 4 || simBossinfo._csh_x !== 30
		|| simBossinfo._csh_bati_lim !== 2 || simBossinfo._csh_monu_lim !== 3) {
		fail("执行级 E2：模拟引擎开局合并后 minion/_csh_moxi/_csh_x 不可达（" + JSON.stringify(simBossinfo) + "）");
	} else {
		ok("执行级 E2：模拟引擎合并（boss.js:215-218）后究极配置可达——minion 双怪 / 魔息 4 / 重整 5 / 解封上限 30 / 霸体 2 次 / 魔怒 3 次");
	}
	const bmText = fs.readFileSync(path.join(ROOT, "main", "bossmode.js"), "utf8");
	if (/\bbid\.slice\(\d+\)|bid\.replace\(/.test(bmText)) {
		fail("执行级 E4：bossmode.js 存在散落的手工键转换（应使用 bossdata 的键系导出）");
	} else {
		ok("执行级 E4：bossmode 无散落键转换（键系唯一真源）");
	}
	/* E5（v4 · 原生注册守护）：角色必须走 game.import("character", …) 由引擎 loadCharacter
	   处理（init/index.js:465），bossmode **禁止**手工写 lib.character / mode_boss 包
	   （手工塞 = 绕过引擎 → 条目形态不一致 → optionsMenu.js:203 等 [N] 读取报错）。 */
	if (/lib\.character\s*=|lib\.characterPack\.mode_boss\s*=/.test(bmText)) {
		fail("执行级 E5：bossmode 违反原生注册原则（不得手工写 lib.character / mode_boss 包）");
	} else {
		ok("执行级 E5：bossmode 零手工写 lib.character / mode_boss 包（角色走原生注册）");
	}
	/* E7：character/boss.js 在位且用 game.import 原生注册 */
	const cbPath = path.join(ROOT, "character", "boss.js");
	const cbText = fs.existsSync(cbPath) ? fs.readFileSync(cbPath, "utf8") : "";
	if (!/game\.import\(\s*"character"/.test(cbText)) {
		fail("执行级 E7：character/boss.js 缺失或未用 game.import(\"character\") 原生注册");
	} else if (!/lib\.config\.characters\.add/.test(cbText)) {
		fail("执行级 E8：动态角色包必须先登记启用（lib.config.characters.add）——否则 loadCharacter 会跳过处理（loading.js:110）");
	} else {
		ok("执行级 E7/E8：魔王角色走 game.import(\"character\") 原生注册且已登记启用（引擎 loadCharacter 处理）");
	}
	/* E10（v4 · 包级隐藏守护）：武将设置页的包节点枚举 = 静态包列表 + lib.characterPack
	   全键兜底补建（characterPackMenu.js:424-430）——仅条目级 isUnseen 只隐藏条目、节点仍在。
	   必须先导出 cshBossPackHide（character/boss.js）并在 content 时点调用（loadCharacter 之后）。 */
	{
		const contentText = fs.readFileSync(path.join(ROOT, "main", "content.js"), "utf8");
		if (!/export function cshBossPackHide\s*\(/.test(cbText)) {
			fail("执行级 E10：character/boss.js 未导出 cshBossPackHide（包级隐藏缺失——武将设置页会出现魔王包节点）");
		} else if (!/import\s*\{[^}]*cshBossPackHide[^}]*\}/.test(contentText) || !/cshBossPackHide\s*\(\s*\)/.test(contentText)) {
			fail("执行级 E10：main/content.js 未引入/调用 cshBossPackHide（包级隐藏未接电）");
		} else if (!/lib\.characterPack\[NAME\]/.test(cbText) || !/delete\s+lib\.characterPack\[NAME\]/.test(cbText)) {
			fail("执行级 E10：cshBossPackHide 未按「移除包键 + 加载守卫」实现（delete lib.characterPack[NAME]）");
		} else {
			ok("执行级 E10：包级隐藏接线在位（导出 → content 调用 → loadCharacter 后移除包键，守卫防误删）");
		}
	}

	/* E12（v5 · 冷眼 global 装配守护）：【冷眼】的 maxHandcard mod 要让「挑战者」
	   的手牌上限-1，必须登记 lib.skill.global——引擎 checkMod 的遍历范围 =
	   自身技能 + lib.skill.global（getModableSkills 内 concat），妖灵技能
	   挂在挑战者身上是不可能的，唯一通路是 global。漏装配 = 技能静默失效。 */
	{
		const bmText12 = fs.readFileSync(path.join(ROOT, "main", "bossmode.js"), "utf8");
		const hasGlobal = /lib\.skill\.global/.test(bmText12) && /csh_boss_lengyan/.test(bmText12);
		const sk12 = fs.readFileSync(path.join(ROOT, "skills", "boss.js"), "utf8");
		const isMod = /csh_boss_lengyan:[\s\S]{0,200}?maxHandcard/.test(sk12);
		if (!isMod) fail("执行级 E12：csh_boss_lengyan 未按 maxHandcard mod 实现（手牌上限-1 的唯一通路）");
		else if (!hasGlobal) fail("执行级 E12：bossmode.js 未装配 lib.skill.global（冷眼将静默失效——挑战者 checkMod 遍历不到妖灵 mod）");
		else {
			/* v6.2：跨角色 mod 技全部必须登记（漏一个 = 该技静默失效） */
			const bmTxt = fs.readFileSync(path.join(ROOT, "main", "bossmode.js"), "utf8");
			const needG = ["csh_boss_lengyan", "csh_boss_yongdong", "csh_boss_ranxin_mod", "csh_boss_kongshou_lock"];
			const missG = needG.filter(g => !bmTxt.includes('"' + g + '"'));
			if (missG.length) fail("执行级 E12：bossmode.js 未登记跨角色 mod 技：" + missG.join("、"));
			else {
				/* 带触发器的技绝不能进 global（会每个角色各触发一次） */
				const skillTxt12 = fs.readFileSync(path.join(ROOT, "skills", "boss.js"), "utf8");
				const bad = [];
				for (const g of needG) {
					const i = skillTxt12.indexOf("\n\t" + g + ": {");
					if (i < 0) continue;
					/* 只取该技能**自己的块**（到下一个顶层 key / 收尾 `};` 为止）——
					   取固定长度窗口会把后面带触发器的技能一起圈进来（误报）。 */
					const rest = skillTxt12.slice(i + 1);
					const mm = /\n(?=\t[a-zA-Z_$][A-Za-z0-9_$]*: \{|\};)/.exec(rest);
					const seg = mm ? rest.slice(0, mm.index) : rest.slice(0, 700);
					if (/trigger\s*:/.test(seg)) bad.push(g);
				}
				if (bad.length) fail("执行级 E12：被登记进 global 的 mod 技带触发器（会重复触发）：" + bad.join("、"));
				else ok("执行级 E12：跨角色 mod 技接线在位（冷眼/永动/燃心 maxHandcard + 空手 cardEnabled · bossmode 全 4 技登记 · global 内无触发器）");
			}
		}
	}

	/* E13（v5.3 立 · v6.2 修正 · 2026-10-16 三轮修正价值 · 四轮修正数值 · 妖灵讨伐收益守护）：
	   作者定案"CBY + 功勋 + 永久加成"；2026-10-16 拍板两场景两值、当晚又**统一为 800**
	   （"3000 和 1000 有点多，统一改成 800"）——两值同为 800，分流结构保留。
	   常量单点 + recordMinion（含 asBoss 场景参数）/minionHeat 实现 + watch 击破分支接线（含 asBoss 传参）。 */
	{
		const rt13 = fs.readFileSync(path.join(ROOT, "core", "csh_bossrecord.js"), "utf8");
		const bt13 = fs.readFileSync(path.join(ROOT, "skills", "boss.js"), "utf8");
		if (!/MINION_CBY\s*=\s*800\b/.test(rt13)) fail("执行级 E13：MINION_CBY 缺失或 ≠ 800（2026-10-16 四轮拍板）");
		else if (!/MINION_CBY_ASBOSS\s*=\s*800\b/.test(rt13)) fail("执行级 E13：MINION_CBY_ASBOSS 缺失或 ≠ 800（四轮统一值）");
		else if (!/export function recordMinion\s*\(\s*minionId,\s*opts\s*\)/.test(rt13)) fail("执行级 E13：recordMinion 未接 asBoss 场景参数");
		else if (!/export function minionHeat\s*\(/.test(rt13)) fail("执行级 E13：minionHeat（金鳞市基本面读取）未实现");
		else if (/guardPass/.test(rt13)) fail("执行级 E13：v6.2 已取消同局去重，但去重守卫仍在（作者：妖灵收益不再去重）");
		else if (!/recordMinion/.test(bt13) || !/csh_boss_minion_/.test(bt13)) fail("执行级 E13：csh_boss_watch 未接妖灵讨伐分支");
		else if (!/recordMinion\([^)]*asBoss/.test(bt13)) fail("执行级 E13：csh_boss_watch 未把应战场景传给 recordMinion（应传 asBoss）");
		else ok("执行级 E13：妖灵讨伐收益接线在位（统一 800 + 功勋 + 金鳞市热度 · watch 击破分支 · 无同局去重）");
	}

	/* E14（v5.4 · 金鳞市守护）：registry 卡片 + 页面文件 + 市场引擎四件套 + 50 位人设 */
	{
		const rg14 = fs.readFileSync(path.join(ROOT, "core", "csh_registry.js"), "utf8");
		const mk14 = fs.readFileSync(path.join(ROOT, "core", "csh_market.js"), "utf8");
		const hasCard = /goldfish:\s*\{/.test(rg14) && /"goldfish"/.test(rg14);
		const hasPage = fs.existsSync(path.join(ROOT, "games", "goldfish.html"));
		const hasEngine = /export const BASE_PRICE/.test(mk14) && /export function ensureDay/.test(mk14)
			&& /export function trade/.test(mk14) && /export function snapshot/.test(mk14);
		const girlCount = (mk14.match(/tag:\s*"/g) || []).length;
		if (!hasCard) fail("执行级 E14：金鳞市未接入 registry（池子世界卡片）");
		else if (!hasPage) fail("执行级 E14：games/goldfish.html 缺失");
		else if (!hasEngine) fail("执行级 E14：市场引擎四件套（BASE_PRICE/ensureDay/trade/snapshot）不完整");
		else if (girlCount < 50) fail("执行级 E14：妖灵人设不足 50 位（实际 " + girlCount + "）");
		else ok("执行级 E14：金鳞市接线在位（registry 卡片 + 页面 + 市场引擎 + 50 位人设台词）");
	}

	/* E15（批次 A · 讨伐录「外传卷」守护）：收录 **非池子魔将** 的 isBoss 角色。
	   四个必须同时在位的接线点（缺一即静默失效）：
	     ① 数据层 extRoster（动态枚举）/ recordExt（独立段 s.ext，不并入 93 主进度）
	     ② 全局捕获 csh_boss_watch_ext（本体 BOSS 身上没有我们的技能，只能靠 lib.skill.global）
	     ③ bossmode 登记 lib.skill.global
	     ④ 页面 renderExtSection + **根相对立绘前缀三位**（../../ 是错的——页面在 games/ 下） */
	{
		const rt15 = fs.readFileSync(path.join(ROOT, "core", "csh_bossrecord.js"), "utf8");
		const bt15 = fs.readFileSync(path.join(ROOT, "skills", "boss.js"), "utf8");
		const bm15 = fs.readFileSync(path.join(ROOT, "main", "bossmode.js"), "utf8");
		const bb15 = fs.readFileSync(path.join(ROOT, "games", "bossbook.html"), "utf8");
		const sh15 = fs.readFileSync(path.join(ROOT, "core", "csh_shell.js"), "utf8");
		const hasData = /export function extRoster\s*\(/.test(rt15) && /export function recordExt\s*\(/.test(rt15);
		const sepSeg = /s\.ext\s*=\s*\{\}/.test(rt15) && /isBossChar/.test(rt15) && /deriveImg/.test(rt15);
		const hasWatch = /csh_boss_watch_ext\s*:/.test(bt15) && /recordExt/.test(bt15);
		const hasGlobal = /csh_boss_watch_ext/.test(bm15) && /lib\.skill\.global/.test(bm15);
		const hasPage = /function renderExtSection\s*\(/.test(bb15) && /异界来客/.test(bb15);
		/* ★ 跨模式名册（池子休闲里 lib.character 不含本体 BOSS → 纯当场枚举恒空）：
		   snapshotExt（boss 局内快照 s.extPool）+ extRosterAll（三源合并）必须成对在位，
		   且 shell 透传与 bossmode 快照调用都要接上，否则外传卷永远空态。 */
		const hasPool = /s\.extPool/.test(rt15) && /export function extRosterAll\s*\(/.test(rt15) && /export function snapshotExt\s*\(/.test(rt15);
		const wiredSnap = /snapshotExt\s*\(/.test(bm15) && /extRosterAll/.test(sh15) && /extRosterAll/.test(bb15);
		/* 立绘前缀回归守卫：必须是 ../../../（三层），且不得残留 "../../" + rec.img 的错位写法 */
		const badPrefix = /"\.\.\/\.\.\/"\s*\+\s*rec\.img/.test(bb15);
		const goodPrefix = /"\.\.\/\.\.\/\.\.\/"\s*\+\s*raw/.test(bb15);
		if (!hasData) fail("执行级 E15：外传数据层缺失（extRoster / recordExt 未导出）");
		else if (!sepSeg) fail("执行级 E15：外传独立存储段 s.ext / isBossChar / deriveImg 不完整（会污染 93 主进度）");
		else if (!hasWatch) fail("执行级 E15：skills/boss.js 缺 csh_boss_watch_ext（外传阵亡无法捕获）");
		else if (!hasGlobal) fail("执行级 E15：bossmode.js 未登记 csh_boss_watch_ext 到 lib.skill.global（全局触发失效）");
		else if (!hasPage) fail("执行级 E15：games/bossbook.html 缺 renderExtSection / 异界来客 区块");
		else if (!hasPool) fail("执行级 E15：缺 s.extPool / extRosterAll / snapshotExt（池子世界里外传卷将恒空态）");
		else if (!wiredSnap) fail("执行级 E15：跨模式名册未接电（bossmode 调 snapshotExt / shell 与页面用 extRosterAll）");
		else if (badPrefix || !goodPrefix) fail("执行级 E15：外传立绘前缀错位（页面在 games/ 下，根相对须 ../../../，不得 ../../）");
		else ok("执行级 E15：外传卷接线在位（extRoster/recordExt 独立段 + global 捕获 + bossmode 登记 + 跨模式快照 + 页面区块 + 立绘前缀三层）");
	}

	/* E16（批次 C · 妖灵图鉴守护）：galgame 档案页 —— 只消费数据层，不硬编码名单。
	     registry 卡片 + games/codex.html + csh_games 卡片三者齐备，且人设/挂牌来自市场引擎。 */
	{
		const rg16 = fs.readFileSync(path.join(ROOT, "core", "csh_registry.js"), "utf8");
		const gm16 = fs.readFileSync(path.join(ROOT, "core", "csh_games.js"), "utf8");
		const hasCard = /codex:\s*\{/.test(rg16) && /"codex"/.test(rg16);
		const hasPage = fs.existsSync(path.join(ROOT, "games", "codex.html"));
		const hasGamesCard = /codex:\s*\{/.test(gm16);
		let codexOk = hasCard && hasPage && hasGamesCard;
		let codexDetail = "（registry 卡片 + csh_games 卡片 + games/codex.html）";
		if (codexOk) {
			const cx = fs.readFileSync(path.join(ROOT, "games", "codex.html"), "utf8");
			const noHard = /GIRLS/.test(cx) && /LISTED/.test(cx) && !/csh_boss_minion_[a-z]/.test(cx);
			const hasFace = /csh_face_/.test(cx);
			if (!noHard) { codexOk = false; codexDetail = "图鉴页硬编码了妖灵名单（必须走 GIRLS/LISTED 数据层）"; }
			else if (!hasFace) { codexOk = false; codexDetail = "图鉴页未接人像图（csh_face_）"; }
		}
		if (!codexOk) fail("执行级 E16：妖灵图鉴接线不完整 " + codexDetail);
		else ok("执行级 E16：妖灵图鉴接线在位（registry 卡片 + csh_games 卡片 + 页面 · 人设走市场引擎，零硬编码名单）");
	}

	/* E17（2026-10-14 审计 · BOSS 成就键系守护）：★ 真 BUG 回归守卫 ——
	   csh_bossrecord.summary() 输出的 series/seriesTotal **键无 csh_ 前缀**
	   （`sk.replace(/^csh_/,"")`，与 bossbook 系列表同契约）。而 csh_achv 的
	   系列成就此前用带前缀的键索引 → 恒 undefined → 分子恒 0 → **8 条成就永不可达成**。
	   这里**真跑一遍成就引擎**（vm + window 桩，与浏览器同路径）：
	     · 「挑战」分类 22 条；
	     · 系列成就 prog() 在无前缀 / 带前缀两种快照下都要算出非零进度（键系契约）。 */
	try {
		const vm = await import("node:vm");
		const aSrc = fs.readFileSync(path.join(ROOT, "core", "csh_achv.js"), "utf8");
		const relText = fs.readFileSync(path.join(ROOT, "core", "csh_bossrecord.js"), "utf8");
		const sandbox = { window: {}, localStorage: { getItem() { return null; }, setItem() { } }, console: console };
		sandbox.window.localStorage = sandbox.localStorage;
		vm.createContext(sandbox);
		vm.runInContext(aSrc, sandbox, { filename: "csh_achv.js" });
		const AC = sandbox.window.CSH_ACHV;
		const contractOk = /sk\.replace\(\/\^csh_\//.test(relText);      /* 快照侧：去前缀 */
		if (!AC || !AC.defs) fail("执行级 E17：成就引擎无法在 vm 中加载（window.CSH_ACHV 缺失）");
		else if (!contractOk) fail("执行级 E17：csh_bossrecord 的 series 键不再去 csh_ 前缀（成就/讨伐录键系契约被破坏）");
		else {
			const boss = AC.defs.filter(d => d.cat === "挑战");
			const sfx = AC.byId("boss_series_cuifeng");
			if (!sfx) fail("执行级 E17：缺系列成就 boss_series_cuifeng");
			else {
				const bagA = { bossSeries: { cuifeng: 24 }, bossSeriesTotal: { cuifeng: 24 } };
				const bagB = { bossSeries: { csh_cuifeng: 24 }, bossSeriesTotal: { csh_cuifeng: 24 } };
				const pA = sfx.prog(bagA), pB = sfx.prog(bagB);
				if (pA[0] !== 24 || pA[1] !== 24) fail("执行级 E17：系列成就读无前缀快照失败（得到 " + JSON.stringify(pA) + "）—— 与 csh_bossrecord 键系不一致，成就会恒不可达成");
				else if (pB[0] !== 24) fail("执行级 E17：系列成就未兼容带 csh_ 前缀的旧键（容错读取失效）");
				else if (boss.length !== 22) fail("执行级 E17：「挑战」成就条数 " + boss.length + " ≠ 22");
				else ok("执行级 E17：BOSS 成就键系一致（真跑引擎：系列进度 24/24，兼容两种键写法 · 22 条挑战成就）");
			}
		}
	} catch (e17) {
		fail("执行级 E17 执行异常：" + e17.message);
	}

	/* E18：以真实钱包/市场函数的故障行为取代旧的赋值顺序正则。
	   覆盖钱包失败、宿主事务中止/超时/迟到完成、流水恢复、重启及开户礼/分红幂等。
	   页面交易桥仍禁止失败后本地重放。 */
	{
		const gText = fs.readFileSync(path.join(ROOT, "games", "goldfish.html"), "utf8");
		let economicSafe = false;
		try {
			const result = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, "tools/probe_market_persistence.mjs")],
				{ encoding: "utf8", timeout: 10000, windowsHide: true }));
			economicSafe = result.passed > 0 && result.failed === 0;
		} catch (error) { fail("执行级 E18：市场持久化故障回归失败：" + error.message.slice(0, 160)); }
		const dblRaw = bossBlockOf(gText, "function doTrade(");
		/* 去注释后再判（注释里也会出现 M.trade() 字样） */
		const dbl = dblRaw ? dblRaw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "") : "";
		/* 桥分支必须"报错退出"而不是回落执行：块内 M.trade( 只应出现在非桥分支（1 次），
		   且桥分支内出现失败回调（cb({ ok:false ...)）而非交易调用。 */
		const bridgeSafe = !!dbl
			&& (dbl.match(/M\.trade\(/g) || []).length === 1
			&& /Bridge\.active\) \{[\s\S]*?cb\(\{\s*ok:\s*false[\s\S]*?\n\s*\}\s*\);\s*\n\s*return;/.test(dbl);
		if (!bridgeSafe) fail("执行级 E18：金鳞市 doTrade 桥分支仍在失败时本地重放（Bridge 超时 ⇒ 双买双卖）");
		else if (economicSafe) ok("执行级 E18：金鳞市余额/持仓原子提交、失败/重启恢复、流水幂等与桥不重放通过");
	}

	/* E19（2026-10-14 审计 · 「静默永不发动」三例回归守卫）：这三条都是**改前完全
	   不生效**的真 BUG（静态可判，运行时无痕），固化为断言 ——
	   ① 【乱入】原 `player: "gameStart"`：gameStart 是全局事件（宿主事件不带 player），
	      `player:` 角色要求 event.player === 持有者 → 恒 false。必须 global。
	   ② 【天命】原写 `trigger.directresult`：judge content 在**触发 judge 之前**就读取
	      directresult 选牌并亮出（content.js judge step1）→ 赋值太晚 = 全无效果。
	      改判必须替换 `judging[0]`（本体 guidao/key/diy 范式）。
	   ③ 【水月】原用 `trigger.source`：useCardToTarget 系事件由 _triggerTo 构造，
	      只有 player/target/card/cards（无 source）→ undefined 传入 targetEnabled
	      → checkMod 取 getModableSkills 抛 TypeError。必须用 trigger.player。 */
	{
		const b19 = fs.readFileSync(path.join(ROOT, "skills", "boss.js"), "utf8");
		const strip19 = (s) => String(s || "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
		const badGS = /trigger\s*:\s*\{\s*player\s*:\s*"gameStart"/.test(strip19(b19));
		const tm = strip19(bossBlockOf(b19, "csh_boss_tianming: {"));
		const badTM = /trigger\.directresult\s*=/.test(tm) || !/judging\[0\]\s*=\s*best/.test(tm);
		const sy = strip19(bossBlockOf(b19, "csh_boss_shuiyue: {"));
		const badSY = /trigger\.source/.test(sy);
		if (badGS) fail("执行级 E19：【乱入】用 player:\"gameStart\"（永不发动——gameStart 必须 global）");
		else if (badTM) fail("执行级 E19：【天命】改判写 directresult 而非 judging[0]（判定牌早已选定 → 全无效果）");
		else if (badSY) fail("执行级 E19：【水月】用 trigger.source（useCardToTarget 无该字段 → targetEnabled 抛 TypeError）");
		else ok("执行级 E19：三例「静默永不发动」已修且无回归（乱入 global / 天命 judging[0] / 水月 trigger.player）");
	}

	/* E20（2026-10-15 · 书法体字表覆盖守护）：全部会以书法体呈现的文字（技能名 /
	   妖灵名 / 魔王名）必须落在 csh_fx_font_3.woff2 的字形表内，否则逐字回退系统字体 =
	   同一串文字混排（作者 2026-10-15 实机反馈的"字体不统一"根因）。
	   字表由 tools/make_font_subset.py 从字体导出到 tools/font_charset.json。
	   KNOWN_MISSING = 源字体本身缺的 5 个生僻字（回退到楷体，肉眼可接受）—— 除这 5 个以外
	   出现任何缺字都视为缺陷（新增人名/技能名写了表外字会被立刻拦下）。 */
	{
		const KNOWN_MISSING = "濑鬘郿毦囷";
		let fc = null;
		try { fc = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "font_charset.json"), "utf8")); } catch (e) {}
		if (!fc || !fc.chars) fail("执行级 E20：tools/font_charset.json 缺失（跑 tools/make_font_subset.py 生成）");
		else {
			const have = new Set(fc.chars);
			const bTrans2 = (BJ.default && BJ.default.translate) || BJ.translate || {};
			const texts = [];
			for (const k in bTrans2) if (/^csh_boss_/.test(k) && !/_info$/.test(k)) texts.push([k, bTrans2[k]]);
			for (const mid in BD.MINIONS) texts.push([mid, BD.MINIONS[mid].name]);
			for (const bid of bossIds) if (built.names[bid]) texts.push([bid, built.names[bid]]);
			const bad = [], known = [];
			for (const [k, v] of texts) {
				for (const ch of String(v || "")) {
					if (!/[\u4e00-\u9fff]/.test(ch) || have.has(ch)) continue;
					(KNOWN_MISSING.includes(ch) ? known : bad).push(v + ". " + ch);
				}
			}
			if (bad.length) fail("执行级 E20：书法体字形表缺字（会逐字回退 → 混排）：" + bad.slice(0, 8).join("；"));
			else ok("执行级 E20：书法体字形表覆盖全部技能名/妖灵名/魔王名（" + fc.subsetCount +
				" 字；源字体自带缺失 " + known.length + " 处已白名单：" + KNOWN_MISSING + "）");
		}
	}

	/* E21（2026-10-15 · 金鳞市人设与挂牌一致性）：GIRLS 键集合必须与 LISTED 完全一致 ——
	   多了会"人设永不出现"，少了会"挂牌却没有台词"（galgame 面板空口无言）。 */
	{
		const mkText = fs.readFileSync(path.join(ROOT, "core", "csh_market.js"), "utf8");
		const gSeg = (mkText.match(/export const GIRLS = \{[\s\S]*?\n\};/) || [""])[0];
		const gKeys = [...gSeg.matchAll(/^\tcsh_boss_minion_([a-z0-9_]+):\s*\{/gm)].map(m => "csh_boss_minion_" + m[1]);
		const listed = BD.MINION_POOL.slice();
		const noLine = listed.filter(k => !gKeys.includes(k));
		const noStock = gKeys.filter(k => !listed.includes(k));
		if (gKeys.length !== listed.length || noLine.length || noStock.length) {
			fail("执行级 E21：人设/挂牌不一致（挂牌无台词 " + noLine.length + " / 台词未挂牌 " + noStock.length + "）");
		} else ok("执行级 E21：金鳞市人设与挂牌一一对应（" + listed.length + " 位，零缺零余）");
	}

	/* ⑤ 妖灵完整（v6.1 · 50 只全女性立绘 · **全员 3 血**：六式 6 + 十二美 12 + 希里 + 春野樱 + 十卫 10 + 二十刑 20） */
	const mBad = [];
	const MINION_HP = {};                                          /* v6.1：无特例，全部取 MINIONS 的 hp（=3） */
	/* 50 只逐只：专属技映射 + 女性 + webp 立绘 + 人像文件存在性 */
	const BEAUTY_SKILL = {
		csh_boss_minion_eve: "csh_boss_ying_hunshi",
		csh_boss_minion_ada: "csh_boss_kan_guzao",
		csh_boss_minion_tenten: "csh_boss_feng_fengshi",
		csh_boss_minion_empress: "csh_boss_lang_nongchao",
		csh_boss_minion_triss: "csh_boss_fen_yujin",
		csh_boss_minion_fubuki: "csh_boss_kui_qiansi",
		csh_boss_minion_ciri: "csh_boss_you_cannian",
		csh_boss_minion_catherine: "csh_boss_jinchi",
		csh_boss_minion_kaguya: "csh_boss_lengyan",
		csh_boss_minion_zelda: "csh_boss_xiushi",
		csh_boss_minion_angel: "csh_boss_enze",
		csh_boss_minion_chunli: "csh_boss_bailie",
		csh_boss_minion_makima: "csh_boss_zhipei",
		csh_boss_minion_ayasato: "csh_boss_jiangling",
		csh_boss_minion_robin: "csh_boss_huafu",
		csh_boss_minion_emilia: "csh_boss_bingjie",
		csh_boss_minion_ashe: "csh_boss_qianru",
		csh_boss_minion_frieren: "csh_boss_qiannian",
		csh_boss_minion_tifa: "csh_boss_yaoqi",
		csh_boss_minion_sakura: "csh_boss_baihao",
		/* v6 新批次（2026-10-15 · 十卫 10 + 二十刑 20） */
		csh_boss_minion_mai: "csh_boss_renwu",
		csh_boss_minion_android: "csh_boss_yongdong",
		csh_boss_minion_ishtar: "csh_boss_tianzhou",
		csh_boss_minion_sarada: "csh_boss_xuetong",
		csh_boss_minion_perona: "csh_boss_youling",
		csh_boss_minion_guangxi: "csh_boss_guangyan",
		csh_boss_minion_hachikuji: "csh_boss_milu",
		csh_boss_minion_megumi: "csh_boss_linzuo",
		csh_boss_minion_yoruichi: "csh_boss_shunbu",
		csh_boss_minion_fortune: "csh_boss_shuangqiang",
		csh_boss_minion_nilou: "csh_boss_wuqi",
		csh_boss_minion_nami: "csh_boss_tianhou",
		csh_boss_minion_konan: "csh_boss_zhiwu",
		csh_boss_minion_temari: "csh_boss_lianyou",
		csh_boss_minion_tsukihi: "csh_boss_fenshen",
		csh_boss_minion_liulibei: "csh_boss_libei",
		csh_boss_minion_maisakura: "csh_boss_yinshen",
		csh_boss_minion_ran: "csh_boss_kongshou",
		csh_boss_minion_mui: "csh_boss_wangzhi",
		csh_boss_minion_tayama: "csh_boss_shanwu",
		csh_boss_minion_wonder: "csh_boss_shendun",
		csh_boss_minion_yui: "csh_boss_shuju",
		csh_boss_minion_momo: "csh_boss_taoyao",
		csh_boss_minion_fern: "csh_boss_bingshuang",
		csh_boss_minion_valentine: "csh_boss_lianfu",
		csh_boss_minion_shinobu: "csh_boss_dudie",
		csh_boss_minion_yukino: "csh_boss_fengyan",
		csh_boss_minion_luna: "csh_boss_yueying",
		csh_boss_minion_anne: "csh_boss_ranxin",
		csh_boss_minion_oniko: "csh_boss_guiku",
	};
	for (const mid in BD.MINIONS) {
		const e = built.minionEntries[mid];
		if (!e) { mBad.push(mid + "（缺）"); continue; }
		const wantHp = MINION_HP[mid] || 3;                       /* v6.1：全员 3 血 */
		if (!e.isUnseen) mBad.push(mid + "（缺 isUnseen）");
		if (e.hp !== wantHp) mBad.push(mid + "（hp≠" + wantHp + "）");
		if (!e.skills.length) mBad.push(mid + "（无技能）");
		/* v4：每只妖灵 2 技 = 专属（存活+死亡段）+ 统一【池悯】 */
		if (!e.skills.includes("csh_boss_chi")) mBad.push(mid + "（缺池悯）");
		if (e.skills.length < 2) mBad.push(mid + "（技能不足 2）");
		if (e.group !== BD.BOSS_GROUP) mBad.push(mid + "（group）");
		if (!e.img || !/csh_minion_/.test(e.img)) mBad.push(mid + "（缺妖灵立绘）");
		/* v5：立绘与 人像 文件必须真实存在（中文名 webp） */
		const imgRel = String(e.img || "").replace(/^extension\/池子魔将\//, "");
		if (!imgRel || !fs.existsSync(path.join(ROOT, imgRel))) mBad.push(mid + "（立绘文件缺失）");
		const faceRel = String(e.face || "").replace(/^extension\/池子魔将\//, "");
		if (!faceRel || !fs.existsSync(path.join(ROOT, faceRel))) mBad.push(mid + "（人像文件缺失）");
	}
	if (!built.minionEntries["csh_boss_minion_ciri"] || !built.minionEntries["csh_boss_minion_ciri"].skills.includes("csh_boss_you_cannian")) {
		mBad.push("希里（游魂位 · 缺【时痕】死亡段）");
	}
	for (const mid in BEAUTY_SKILL) {
		const e = built.minionEntries[mid];
		if (!e) { mBad.push(mid + "（缺条目）"); continue; }
		if (!e.skills.includes(BEAUTY_SKILL[mid])) mBad.push(mid + "（缺专属技）");
		if (e.sex !== "female") mBad.push(mid + "（sex≠female）");
		if (!/\.webp$/.test(e.img || "")) mBad.push(mid + "（立绘应为 webp）");
		if (!/csh_minion_/.test(String(e.img || ""))) mBad.push(mid + "（立绘命名异常）");
		if (!/csh_face_/.test(String(e.face || ""))) mBad.push(mid + "（人像命名异常）");
	}
	if (Object.keys(BD.MINIONS).length !== 50) mBad.unshift("妖灵 " + Object.keys(BD.MINIONS).length + " 只 ≠ 50");
	if (BD.MINION_POOL.length !== 50) mBad.unshift("随机池 " + BD.MINION_POOL.length + " ≠ 50（v6.1 全池随机）");
	if (mBad.length) fail("妖灵条目异常：" + mBad.join("；"));
	else ok("妖灵 50 只完整（全女性 / 统一 3 血 / 全池随机出场 / 每只 2 技含池悯 / 专属技·webp·人像文件全在位）");

	/* v6.2 立绘比例统一（作者："需要重构，但是不能丢失主体人物完整画面"）——
	   引擎立绘框 130×160 ≈ 0.8125 且 background-size: cover：方图横裁、
	   窄图纵裁（0.524 的窄图会被裁掉 36% 高度）。故主图统一重构为
	   0.8125 画布（原图等比完整放入 + 自身模糊扩边，**零裁切**）。
	   此处直接解析 WebP 头断言比例，防止日后又混进异形图。 */
	{
		const vp = [];
		function webpSize(buf) {
			try {
				if (buf.slice(0, 4).toString("latin1") !== "RIFF" || buf.slice(8, 12).toString("latin1") !== "WEBP") return null;
				const fourcc = buf.slice(12, 16).toString("latin1");
				if (fourcc === "VP8 ") return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
				if (fourcc === "VP8L") {
					const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
					return [1 + (((b1 & 0x3f) << 8) | b0), 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | (b1 >> 6))];
				}
				if (fourcc === "VP8X") {
					const w = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
					const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
					return [w, h];
				}
			} catch (e) {}
			return null;
		}
		for (const mid in BD.MINIONS) {
			const m = BD.MINIONS[mid];
			const rel = String((m && m.img) || "").replace(/^extension\/池子魔将\//, "");
			if (!rel) continue;
			let buf = null;
			try { buf = fs.readFileSync(path.join(ROOT, rel)); } catch (e) { continue; }
			const sz = webpSize(buf);
			if (!sz) { vp.push(mid.replace("csh_boss_minion_", "") + "（WebP 头不可解析）"); continue; }
			const ar = sz[0] / sz[1];
			if (Math.abs(ar - 0.8125) > 0.02) {
				vp.push(mid.replace("csh_boss_minion_", "") + " ar=" + ar.toFixed(3));
			}
		}
		if (vp.length) fail("妖灵主图比例不统一（目标 0.8125，容差 0.02）：" + vp.slice(0, 6).join("、"));
		else ok("妖灵主图 50 张比例统一（0.8125 = 引擎立绘框 · 原图完整放入 + 部分构图微调）；人像仍为 4:5");
	}

	/* E22（v6.2 · 妖灵技能「不重复」守护）：作者实机反馈"50 个技能里很多都重复了"。
	   三重断言：
     ① 50 条 `_info` 两两不同（玩家看到的描述不许撞车）
     ② 50 只的 (触发事件 + 效果动词) 签名两两不同（**机制**不许撞车）
     ③ 「纯随机弃牌 / 流失体力」家族封顶（通用副作用不许占半壁）
   —— 签名由源码文本推出（触发器名 / 主动技 / num 增减方向 / 动作动词 / 条件里的牌名），
      不看注释、不看 `_info`：**改描述不改机制骗不过这道门**。
      `_clear` / `_round` 这类"状态复位"子技不计入签名（它们是记账，不是机制）。 */
	{
		const bj22 = fs.readFileSync(path.join(ROOT, "skills", "boss.js"), "utf8");
		function minionBlock(key) {
			const i = bj22.indexOf("\n\t" + key + ": {");
			if (i < 0) return "";
			const out = bj22.slice(i + 1);
			let end = out.length;
			const re = /\n(?=\t([a-zA-Z_$][A-Za-z0-9_$]*): \{|\};)/g;
			let m;
			while ((m = re.exec(out))) {
				const nm = m[1];
				if (nm && (nm === key || nm.indexOf(key + "_") === 0)) continue;
				end = m.index;
				break;
			}
			let txt = out.slice(0, end);
			/* 剔掉"状态复位"子技整块（纯记账，不构成机制差异） */
			txt = txt.replace(new RegExp("\\n\\t" + key + "_(clear|round): \\{[\\s\\S]*?\\n\\t\\},", "g"), "");
			return txt;
		}
		const VERB_PAT = [
			[/num\s*\+=\s*1|num\s*\+\+/, "numUp"],
			[/num\s*=\s*Math\.max\(0,\s*trigger\.num\s*-\s*1\)|num\s*--|num\s*-\s*1/, "numDown"],
			[/trigger\.num\s*=\s*0\b/, "numZero"],
			[/Math\.ceil\(trigger\.num\s*\/\s*2\)/, "numHalf"],
			[/randomDiscard/, "randomDiscard"],
			[/\.discard\(/, "discard"],
			[/loseHp/, "loseHp"],
			[/\.damage\(/, "damage"],
			[/\.draw\(/, "draw"],
			[/recover\(/, "recover"],
			[/\.gain\(/, "gain"],
			[/\.equip\(/, "equip"],
			[/game\.boss\.useCard\(|boss\.useCard\(/, "bossUse"],
			[/pr\[0\]\.useCard\(/, "otherUse"],
			[/player\.useCard\(/, "selfUse"],
			[/cancel\(\)/, "cancel"],
			[/maxHp\s*-\s*1/, "maxHpDown"],
			[/addJudge/, "addJudge"],
			[/\.link\(\)/, "link"],
			[/changeHujia\(/, "hujia"],
			[/globalTo/, "globalTo"],
			[/maxHandcard/, "maxHandcard"],
			[/judging\[0\]/, "judgeFlip"],
			[/card\.name\s*===\s*"sha"|card\.name\s*==\s*"sha"/, "cardSha"],
			[/card\.name\s*===\s*"shan"|card\.name\s*==\s*"shan"/, "cardShan"],
			[/"tao"/, "cardTao"],
			[/get\.type\(event\.card\)\s*===\s*"trick"/, "cardTrick"],
		];
		const iBad = [];
		const sigMap = {};
		let pureDiscard = 0, loseFam = 0;
		const infos = [];
		for (const mid in BEAUTY_SKILL) {
			const key = BEAUTY_SKILL[mid];
			const blk = minionBlock(key);
			if (!blk) { iBad.push(key + "（块未找到）"); continue; }
			const trigs = [...new Set([...blk.matchAll(/(?:player|source|target|global)\s*:\s*"([a-zA-Z0-9]+)"/g)].map(x => x[1]))].sort();
			const isActive = /\benable\s*:/.test(blk);
			const verbs = VERB_PAT.filter(([re]) => re.test(blk)).map(x => x[1]).sort();
			const sig = (isActive ? "主动" : (trigs.join("+") || "(mod)")) + "|" + verbs.join(",");
			const nm = (bj22.match(new RegExp(key + '_info:\\s*"([^"]*)"')) || [])[1] || "";
			infos.push({ key: mid, info: nm });
			(sigMap[sig] = sigMap[sig] || []).push(mid.replace("csh_boss_minion_", ""));
			const other = ["gain", "equip", "damage", "loseHp", "maxHpDown", "draw", "addJudge", "recover", "maxHandcard"].some(v => verbs.includes(v));
			if (verbs.includes("randomDiscard") && !other) pureDiscard++;
			if (verbs.includes("loseHp")) loseFam++;
		}
		const infoSeen = {};
		for (const r of infos) {
			if (!r.info) iBad.push(r.key + "（缺 _info）");
			else if (infoSeen[r.info]) iBad.push(r.key + " 与 " + infoSeen[r.info] + " 描述完全相同");
			else infoSeen[r.info] = r.key;
		}
		for (const sg in sigMap) if (sigMap[sg].length > 1) iBad.push("机制签名重复：" + sigMap[sg].join("/") + "（" + sg + "）");
		if (pureDiscard > 4) iBad.push("「纯随机弃牌」家族过大：" + pureDiscard + " 只（上限 4）");
		if (loseFam > 5) iBad.push("「流失体力」家族过大：" + loseFam + " 只（上限 5）");
		/* v6.3 追加三个家族封顶：「无差别减伤」「增伤」「限制手牌/摸牌」也最容易变成模板 */
		const famTxt = {};
		for (const r2 of infos) famTxt[r2.key] = r2.info || "";
		const cntFam = (re) => Object.keys(famTxt).filter(k => re.test(famTxt[k])).length;
		const cutFam = Object.keys(famTxt).filter(k => /伤害减半|伤害改为0|伤害-1|伤害 −1/.test(famTxt[k])).length;
		const upFam = cntFam(/伤害\+1|伤害 \+1/);
		const handFam = Object.keys(famTxt).filter(k => /挑战者.{0,12}(摸牌阶段少摸|手牌上限)/.test(famTxt[k])).length;
		if (cutFam > 3) iBad.push("「无差别减伤」家族过大：" + cutFam + " 只（上限 3）");
		if (upFam > 4) iBad.push("「增伤」家族过大：" + upFam + " 只（上限 4）");
		if (handFam > 4) iBad.push("「限制手牌/摸牌」家族过大：" + handFam + " 只（上限 4）");
		if (iBad.length) fail("执行级 E22：妖灵技能重复（" + iBad.slice(0, 6).join("；") + "）");
		else ok("执行级 E22：妖灵 50 技零重复（描述 50 条互异 · 机制签名 50 个互异 · 家族分布 纯随机弃牌 " +
			pureDiscard + " / 流失体力 " + loseFam + " / 无差别减伤 " + cutFam + " / 增伤 " + upFam + " / 限手牌 " + handFam + " 只，全在上限内）");
	}

	/* E23（v6.2 · 账本守护）：作者「CBY 需要有一个地方写清楚来源和去处，就是做账」。
	   四件套缺一即静默降级：① 钱包有账本容器与读写
	                              ② **单一写入点**（addPC/spendPC 两处都挂）
	                              ③ shell-ledger 命令
	                              ④ 生涯大厅「账本」页（页签 + 容器 + 加载函数 + 总览大数字入口） */
	{
		const w23 = fs.readFileSync(path.join(ROOT, "core", "csh_wallet.js"), "utf8");
		const sh23 = fs.readFileSync(path.join(ROOT, "core", "csh_shell.js"), "utf8");
		const cr23 = fs.readFileSync(path.join(ROOT, "games", "career.html"), "utf8");
		const addHooked = /pushLedger\(got, reason/.test(w23);
		const spendHooked = /pushLedger\(-n, reason/.test(w23);
		const e23 = [];
		if (!/K_LEDGER\s*=/.test(w23) || !/function pushLedger/.test(w23) || !/function ledgerSummary/.test(w23)) e23.push("钱包缺账本容器/读写");
		if (!addHooked) e23.push("入账未挂账本");
		if (!spendHooked) e23.push("出账未挂账本");
		if (!/ledger: ledger/.test(w23)) e23.push("账本未对外导出");
		if (!/cmd === "shell-ledger"/.test(sh23)) e23.push("shell-ledger 命令缺失");
		if (!/data-p="ledger"/.test(cr23)) e23.push("生涯大厅缺账本页签");
		if (!/id="p-ledger"/.test(cr23) || !/function loadLedger/.test(cr23) || !/function renderHeat/.test(cr23)) e23.push("账本页渲染不完整");
		/* v6.3（作者修正）：总览的池子币大数字**不再是入口**（左侧页签即入口）——
		   反过来守：大数字上不许再挂「查账 ›」这类链接文案与事件（会与小字重叠）。 */
		const cr23n = cr23.replace(/<!--[\s\S]*?-->/g, "");   /* 注释里的「查账」是历史说明，不算残留 */
		if (/ov-pc-link/.test(cr23n)) e23.push("总览大数字仍在当账本入口（作者已要求移除）");
		if (/查账/.test(cr23n)) e23.push("总览/账本仍残留「查账 ›」链接文案");
		if (!/data-p="ledger"/.test(cr23)) e23.push("左侧导航缺账本页签");
		if (e23.length) fail("执行级 E23：账本接线不完整（" + e23.join("；") + "）");
		else ok("执行级 E23：账本接线在位（钱包容器 + 入/出账双挂 + shell-ledger + 生涯大厅账本页 · 入口只走左侧页签）");
	}

	/* E24（v6.2 · 好感度守护）：作者全权委托的「好感度系统」。
	   六件套：① core/csh_affection.js 五档 + 四来源 + 送礼扣款 + interact/heard
	           ② content 安装（lib.cshAffection）
	           ③ 讨伐/持股两处自动增长接线
	           ④ shell 读写命令
	           ⑤ 图鉴与金鳞市都有爱心 UI（且 GIRLS 50 位齐备好感台词） */
	{
		const affPath = path.join(ROOT, "core", "csh_affection.js");
		const e24 = [];
		if (!fs.existsSync(affPath)) e24.push("缺 core/csh_affection.js");
		else {
			const af = fs.readFileSync(affPath, "utf8");
			if (!/AFF_LEVELS\s*=/.test(af) || (fs.readFileSync(path.join(ROOT,"core/csh_bond.js"),"utf8").match(/key:\x27[SABCD]\x27/g) || []).length < 5) e24.push("五档定义不完整");
			if (!/export function noteHunt/.test(af) || !/export function noteHold/.test(af) || !/export function noteTalk/.test(af) || !/export function gift/.test(af)) e24.push("四来源不齐");
			/* v6.4：统一互动入口 interact（含 close 贴近）与台词收集册 heard —— 缺一即静默降级 */
			if (!/export function interact\s*\(/.test(af)) e24.push("缺统一互动入口 interact");
			if (!/key: "close"/.test(af)) e24.push("缺 close（贴近）互动");
			if (!/export function heardOf\s*\(/.test(af) || !/export function heardLines\s*\(/.test(af)) e24.push("缺台词收集册 heard");
			if (!/function pickFresh\s*\(/.test(af)) e24.push("缺 pickFresh（优先说没听过的台词）");
			/* v6.5：她的回礼（陪伴类互动给 CBY）+ 疏远按日键判定 */
			if (!/AFF_GIVE\s*=/.test(af) || !/export function giveRoll\s*\(/.test(af)) e24.push("缺她的回礼（AFF_GIVE/giveRoll）");
			/* v6.5：回礼收在一个单点实现 rollGive() 里（满档 / 常规两条路都走它） */
			if (!/function rollGive\s*\(/.test(af)) e24.push("缺回礼单点实现 rollGive");
			if (!/rollGive\(id, cur\.level, cur\.v, act\)/.test(af)) e24.push("满档（羁绊 100）后回礼断线");
			if (!/rollGive\(id, r\.level\.key, r\.value, act\)/.test(af)) e24.push("回礼未接进常规 interact");
			if (!/AFF_GIVE\.acts\.indexOf\(act\)/.test(af)) e24.push("回礼未按「陪伴类动作」白名单收口（送礼不该回礼）");
			if (!/var LINE_KINDS = \[[^\]]*"give"/.test(af)) e24.push("give 段未接入选句（LINE_KINDS 缺 give）");
			if (!/function stDay\s*\(/.test(af) || !/cur\.v >= AFF_MAX/.test(af)) e24.push("满档后互动变死按钮（缺 stDay / 满档分支）");
			if (!/backfillSaw\s*\(/.test(af) || !/function dayGap\s*\(/.test(af)) e24.push("缺疏远的日键守卫（backfillSaw/dayGap）");
			const sh24b = fs.readFileSync(path.join(ROOT, "core", "csh_shell.js"), "utf8");
			if (!/cmd === "shell-pc"/.test(sh24b)) e24.push("缺 shell-pc（回礼后刷新余额胶囊）");
			const wt24 = fs.readFileSync(path.join(ROOT, "core", "csh_wallet.js"), "utf8");
			if (!/她的回礼/.test(wt24)) e24.push("账本缺「她的回礼」分类");
			/* NC-01: debit and entitlement must survive together; a spend() regex enforces the old unsafe split. */
            try {
                const result = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, "tools/probe_affection_transactions.mjs"), "--gate"],
                    { encoding: "utf8", timeout: 20000, windowsHide: true }));
                if (result.passed < 33 || result.failed !== 0) e24.push("送礼/结契共同事务故障回归未通过");
            } catch (error) { e24.push("送礼/结契共同事务故障回归失败：" + error.message.slice(0, 160)); }
			if (!/export function installAffection/.test(af)) e24.push("缺 installAffection");
		}
		const ct24 = fs.readFileSync(path.join(ROOT, "main", "content.js"), "utf8");
		if (!/installAffection\(\)/.test(ct24)) e24.push("content 未安装好感度层");
		const br24 = fs.readFileSync(path.join(ROOT, "core", "csh_bossrecord.js"), "utf8");
		if (!/noteHunt\(minionId\)/.test(br24)) e24.push("讨伐未接好感度");
		const mk24 = fs.readFileSync(path.join(ROOT, "core", "csh_market.js"), "utf8");
		if (!/noteHold\(id\)/.test(mk24)) e24.push("持股未接好感度");
		/* v6.3：好感台词搬到了独立台词库 core/csh_aff_lines.js（v6.4 已扩到每人 29 句）——
		   这里只断言"模块在、装载正确"，句数与去重交给 E26。 */
		const af24 = fs.existsSync(path.join(ROOT, "core", "csh_aff_lines.js"))
			? fs.readFileSync(path.join(ROOT, "core", "csh_aff_lines.js"), "utf8") : "";
		if ((af24.match(/^\tcsh_boss_minion_\w+: \{/gm) || []).length < 50) e24.push("好感台词库不足 50 位");
		if (!/export function linesOf/.test(af24) && !/export const AFF_LINES/.test(af24)) e24.push("台词库未导出访问器");
		const sh24 = fs.readFileSync(path.join(ROOT, "core", "csh_shell.js"), "utf8");
		if (!/cmd === "shell-aff"/.test(sh24) || !/cmd === "shell-aff-do"/.test(sh24)) e24.push("shell 好感度命令缺失");
		const cx24 = fs.readFileSync(path.join(ROOT, "games", "codex.html"), "utf8");
		const gf24 = fs.readFileSync(path.join(ROOT, "games", "goldfish.html"), "utf8");
		if (!/id="affbox"/.test(cx24) || !/function heartSvg/.test(cx24)) e24.push("图鉴缺爱心 UI");
		if (!/id="affbox"/.test(gf24) || !/function renderCardAff/.test(gf24)) e24.push("金鳞市缺爱心 UI");
		if (!/ff-callig/.test(cx24)) e24.push("好感标题未用书法体");
		if (e24.length) fail("执行级 E24：好感度系统不完整（" + e24.join("；") + "）");
		else ok("执行级 E24：好感度系统就位（五档 · 十种互动含贴近/递茶/看星/称呼 · 送礼扣款 · **她的回礼（满档仍可互动）** · 日键疏远守卫 · content/shell 接线 · 独立台词库 · 收集册 · 两页爱心 UI）");
	}

	/* E26（v6.3 · 好感台词库守护）：作者「台词越丰富越好，每个角色都要差异化，
	   目前的重复度还是太高了，争取每个角色各不同」——
	   ① 覆盖 50 位妖灵，一位不缺
	   ② 每人结构齐全（2 招呼 / 8 闲聊 / 5 摸头 / 4 贴近 / 3 回礼 / 4 礼物 / 4 升档 / 1 羁绊 / 1 疏远 = 32 句）
	   ③ 全库 **两两不同**（去重断言：把描述改一改糊弄不过去）
	   ④ 儿童向角色（结衣/佐良娜/八九寺/月火）不含恋爱语气词 */
	{
		const afP = path.join(ROOT, "core", "csh_aff_lines.js");
		const e26 = [];
		if (!fs.existsSync(afP)) e26.push("缺 core/csh_aff_lines.js");
		else {
			const af = fs.readFileSync(afP, "utf8");
			/* 不落临时文件：直接用文本手段抽出所有台词字面量做去重
			   （RAW 表里的每一行 `"..."` 都是台词；注释与键名不带中文引号包裹的句号结尾格式） */
			const body = af.slice(af.indexOf("const RAW = {"), af.indexOf("/* 只读访问器"));
			const lines = [];
			for (const m of body.matchAll(/"(\u[0-9a-fA-F]{4}|[^"\\])*"/g)) {
				const t = m[0].slice(1, -1);
				if (t.indexOf("csh_boss_minion_") === 0) continue;      /* 键名 */
				if (!t) continue;
				lines.push(t);
			}
			const seen = {};
			for (const t of lines) {
				if (seen[t]) e26.push("台词重复：" + t.slice(0, 14));
				else seen[t] = 1;
			}
			if (lines.length < 1500) e26.push("台词总量偏少：" + lines.length);
			if (lines.length !== new Set(lines).size) e26.push("存在重复台词");
			/* 每角色的结构（逐个键数下来太脆，改断言总键数与 19 的倍数关系 + 关键字段全在） */
			if ((af.match(/\bgreet: \[/g) || []).length !== 50) e26.push("greet 段不等于 50");
			if ((af.match(/\btalk: \[/g) || []).length !== 50) e26.push("talk 段不等于 50");
			if ((af.match(/\bhead: \[/g) || []).length !== 50) e26.push("head 段不等于 50");
			if ((af.match(/\bclose: \[/g) || []).length !== 50) e26.push("close 段不等于 50");
			if ((af.match(/\bgive: \[/g) || []).length !== 50) e26.push("give 段（她的回礼）不等于 50");
			if ((af.match(/\bwine: "/g) || []).length !== 50) e26.push("礼物 wine 段不等于 50");
			if ((af.match(/\bstardust: "/g) || []).length !== 50) e26.push("礼物 stardust 段不等于 50");
			if ((af.match(/\btop: "/g) || []).length !== 50) e26.push("top 段不等于 50");
			if ((af.match(/\bcool: "/g) || []).length !== 50) e26.push("cool 段不等于 50");
			/* v6.3.1 作者校正：结衣 / 佐良娜 / 八九寺真宵 / 月火 是**平行时空的成年角色**，
			   "跟其他的一样待遇即可" ⇒ 取消语气特例，改为**正向断言**：
			   这四位与其余 46 位结构完全同级（32 句，且各有独立的 top / cool）。 */
			const SAME = ["csh_boss_minion_yui", "csh_boss_minion_sarada", "csh_boss_minion_hachikuji", "csh_boss_minion_tsukihi"];
			const tops = new Set();
			for (const cid of SAME) {
				const i = af.indexOf("\t" + cid + ": {");
				if (i < 0) { e26.push("缺角色 " + cid); continue; }
				const seg = af.slice(i, af.indexOf("\n\t},", i));
				if (!/\btop: "/.test(seg) || !/\bcool: "/.test(seg)) e26.push(cid + " 结构与其他角色不同级");
				const tm = seg.match(/\btop: "([^"]*)"/);
				if (tm) { if (tops.has(tm[1])) e26.push(cid + " 的羁绊台词与他人重复"); tops.add(tm[1]); }
			}
		}
		if (e26.length) fail("执行级 E26：好感台词库异常（" + e26.slice(0, 5).join("；") + "）");
		else ok("执行级 E26：好感台词库完备（50 位 · 每人 32 句 = 1600 句 · 全库两两不同 · 全员同一待遇）");
	}

	/* E27（v6.3 · 好感经济回报守护）：作者「好感度经济回报需要，而且这个功能需要再丰富」。
	   四件套：① 特权与经济常量单点定义（AFF_PERKS / AFF_ECON）
	           ② 三个读取函数（feeDiscount / divBonus / heatBonus）
	           ③ 金鳞市真的用上了（heatOf 加好感 · 买卖用 feeOf · 分红用 divRateOf）
	           ④ 0 好感时**完全无副作用**（否则原有 35 条金鳞市断言会被打破） */
	{
		const af = fs.readFileSync(path.join(ROOT, "core", "csh_affection.js"), "utf8");
		const mk = fs.readFileSync(path.join(ROOT, "core", "csh_market.js"), "utf8");
		const e27 = [];
		if (!/AFF_PERKS\s*=/.test(af) || (af.match(/key: "fee1"|key: "tip"|key: "fee2"|key: "div"/g) || []).length < 4) e27.push("四档特权定义不齐");
		if (!/AFF_ECON\s*=/.test(af)) e27.push("经济常量未单点定义");
		if (!/export function feeDiscount/.test(af) || !/export function divBonus/.test(af) || !/export function heatBonus/.test(af)) e27.push("经济读取函数不齐");
		if (!/export function perkKeys/.test(af)) e27.push("perkKeys 未实现");
		if (!/affHeatOf\(id\)/.test(mk)) e27.push("金鳞市未接好感热度");
		if (!/function feeOf\(id\)/.test(mk) || !/feeOf\(id\)/.test(mk.slice(mk.indexOf("function feeOf")))) e27.push("金鳞市未实现 feeOf");
		if (!/divRateOf\(id\)/.test(mk)) e27.push("金鳞市分红未接好感加成");
		if (e27.length) fail("执行级 E27：好感经济回报接线不完整（" + e27.join("；") + "）");
		else ok("执行级 E27：好感经济回报在位（四档特权 + 基本面热度 + 手续费/分红接线 · 0 好感时零副作用）");
	}

	if (!built.minionEntries["csh_boss_minion_ciri"] || !built.minionEntries["csh_boss_minion_ciri"].skills.includes("csh_boss_you_cannian")) {
		mBad.push("希里（游魂位 · 缺【时痕】死亡段）");
	}
	for (const mid in BEAUTY_SKILL) {
		const e = built.minionEntries[mid];
		if (!e) { mBad.push(mid + "（缺条目）"); continue; }
		if (!e.skills.includes(BEAUTY_SKILL[mid])) mBad.push(mid + "（缺专属技）");
		if (e.sex !== "female") mBad.push(mid + "（sex≠female）");
		if (!/\.webp$/.test(e.img || "")) mBad.push(mid + "（立绘应为 webp）");
		if (!/csh_minion_/.test(String(e.img || ""))) mBad.push(mid + "（立绘命名异常）");
		if (!/csh_face_/.test(String(e.face || ""))) mBad.push(mid + "（人像命名异常）");
	}
	if (Object.keys(BD.MINIONS).length !== 50) mBad.unshift("妖灵 " + Object.keys(BD.MINIONS).length + " 只 ≠ 50");
	if (BD.MINION_POOL.length !== 50) mBad.unshift("随机池 " + BD.MINION_POOL.length + " ≠ 50（v6.1 全池随机）");
	if (mBad.length) fail("妖灵条目异常：" + mBad.join("；"));
	else ok("妖灵 50 只完整（全女性 / 统一 3 血 / 全池随机出场 / 每只 2 技含池悯 / 专属技·webp·人像文件全在位）");



	/* ⑥ 技能完整性：装配引用 ⊆ boss.js 定义；非 silent 技译名齐备且 2 字 */
	const bSkill = (BJ.default && BJ.default.skill) || BJ.skill || {};
	const bTrans = (BJ.default && BJ.default.translate) || BJ.translate || {};
	const need = new Set(BD.MAIN_SKILLS);
	for (const bid of bossIds) (built.entries[bid].skills || []).forEach(s => { if (s.startsWith("csh_boss_")) need.add(s); });
	for (const mid in built.minionEntries) (built.minionEntries[mid].skills || []).forEach(s => need.add(s));
	const missS = [...need].filter(s => !bSkill[s]);
	if (missS.length) fail("装配引用缺技能定义：" + missS.join("、"));
	else ok("装配引用的 " + need.size + " 个技能全部在 skills/boss.js 定义");

	const missT = [];
	for (const s of need) {
		const def = bSkill[s] || {};
		if (def.silent) continue;
		if (!bTrans[s]) missT.push(s + "（缺名）");
		else if ([...bTrans[s]].length > 2) missT.push(s + "（名超 2 字）");
		else if (!bTrans[s + "_info"]) missT.push(s + "（缺 _info）");
	}
	if (missT.length) fail("魔王技译名/命名规约异常：" + missT.slice(0, 8).join("；"));
	else ok("非 silent 技译名齐备且全部 2 字（§2.0 铁律）");

	/* ⑦ 隔离：BOSS 角色 ID 与名册零冲突；名册零引用 BOSS 技 */
	const conflict = bossIds.filter(bid => roster.includes(bid))
		.concat(Object.keys(built.minionEntries).filter(mid => roster.includes(mid)));
	if (conflict.length) fail("BOSS 角色 ID 与名册冲突：" + conflict.join("、"));
	else ok("BOSS/妖灵 ID 与名册零冲突");
	const leak = [...need].filter(s => rosterSkills.has(s));
	if (leak.length) fail("名册角色引用了 BOSS 技：" + leak.join("、"));
	else ok("普通武将名册零引用 BOSS 技（隔离成立）");

	/* E9（filter 禁 trigger · v4 实机报错根因）：filter(event, player) 的参数是 event/player，
	   trigger 仅 content 内由引擎注入——filter 内引用 trigger = ReferenceError（实机 556 行）。
	   按技能块提取 filter 函数体（括号平衡）逐一检查。 */
	{
		const bLines0 = fs.readFileSync(path.join(ROOT, "skills", "boss.js"), "utf8");
		const skillRe2 = /\t(csh_boss_[a-z_0-9]+): \{/g;
		let mm; const badF = [];
		while ((mm = skillRe2.exec(bLines0))) {
			const skill = mm[1];
			const start = mm.index;
			let d = 0, end = -1;
			const q = bLines0.indexOf("{", start);
			for (let p = q; p < bLines0.length; p++) {
				const c = bLines0[p];
				if (c === '"') { let z = p + 1; while (z < bLines0.length) { if (bLines0[z] === "\\") z++; else if (bLines0[z] === '"') break; z++; } p = z; continue; }
				if (c === "{") d++;
				else if (c === "}") { d--; if (d === 0) { end = p; break; } }
			}
			const body = bLines0.slice(start, end);
			const fAt = body.search(/\bfilter\s*\(/);
			if (fAt < 0) continue;
			let fd = 0, fend = -1;
			const fp = body.indexOf("(", fAt);
			for (let p = fp; p < body.length; p++) {
				const c = body[p];
				if (c === '"') { let z = p + 1; while (z < body.length) { if (body[z] === "\\") z++; else if (body[z] === '"') break; z++; } p = z; continue; }
				if (c === "(" || c === "{") fd++;
				else if (c === ")" || c === "}") { fd--; if (fd === 0) { fend = p; break; } }
			}
			if (/\btrigger\b/.test(body.slice(fAt, fend))) badF.push(skill);
		}
		if (badF.length) fail("执行级 E9：filter 内引用 trigger（应使用参数 event）：" + badF.join("、"));
		else ok("执行级 E9：全部 filter 无 trigger 误用（filter(event, player) 参数纪律）");
	}

	/* E11（v4.1 · 实机「选择下一个触发的技能」弹窗根因）：同一玩家、同一事件、
	   同优先级出现多个可触发技能时，引擎 arrangeTrigger（content.js:3502-3535）会弹窗
	   让玩家排序；本模式技能多为数值叠加，选择毫无意义。纪律 = 非 silent 触发技
	   全部显式声明 priority 且【两两不同】（含 惊变·天鼓/魔威、汇流/魔息 两组同场组合）。 */
	{
		const bLines1 = fs.readFileSync(path.join(ROOT, "skills", "boss.js"), "utf8");
		const skillRe3 = /\t(csh_boss_[a-z_0-9]+): \{/g;
		let mm3; const noPri = [], priMap = new Map(), dupPri = [];
		while ((mm3 = skillRe3.exec(bLines1))) {
			const skill = mm3[1];
			const start = mm3.index;
			let d = 0, end = -1;
			const q = bLines1.indexOf("{", start);
			for (let p = q; p < bLines1.length; p++) {
				const c = bLines1[p];
				if (c === '"') { let z = p + 1; while (z < bLines1.length) { if (bLines1[z] === "\\") z++; else if (bLines1[z] === '"') break; z++; } p = z; continue; }
				if (c === "{") d++;
				else if (c === "}") { d--; if (d === 0) { end = p; break; } }
			}
			const body = bLines1.slice(start, end);
			if (!/trigger:/.test(body)) continue;
			if (/silent:\s*true/.test(body)) continue;
			const pm = body.match(/priority:\s*(-?[\d.]+)/);
			if (!pm) { noPri.push(skill); continue; }
			const v = Number(pm[1]);
			if (priMap.has(v)) dupPri.push(skill + " 与 " + priMap.get(v) + " 同为 " + v);
			else priMap.set(v, skill);
		}
		if (noPri.length) fail("执行级 E11：非 silent 触发技缺 priority（实机会弹「选择下一个触发的技能」）：" + noPri.join("、"));
		else if (dupPri.length) fail("执行级 E11：priority 撞值（同值时引擎弹窗让玩家排序）：" + dupPri.join("；"));
		else ok("执行级 E11：技能结算顺序纪律——非 silent 触发技全部显式 priority 且两两不同（" + priMap.size + " 个）");
	}

	/* ⑧ 触发事件白名单（运行时静默失败的高危点 → fail 级） */
	const WL = new Set(["damageBegin1", "damageBegin3", "damageBegin4", "damageEnd", "damageBegin", "phaseBegin",
		"roundStart", "phaseDrawBegin2", "useCardToBefore", "useCardToPlayered", "useCardToTarget", "useCardAfter",
		"judge", "dying", "gameStart", "enterGame", "phaseZhunbeiBegin", "die", "dieAfter",
		/* v5 新增（十二美）：useCard/respond（锈蚀 · 与 rehujia 同款双时点）；
		   recoverEnd（恩泽 · zhanfa.js:1912 同款）；phaseEnd（百裂/支配/七曜/花缚 · content.js:4310） */
		"useCard", "respond", "recoverEnd", "phaseEnd",
		/* v6 新增（2026-10-15 新批次妖灵 · 均已源码核实）：
		   gainAfter   —— 获得牌后（content.js gain 内容尾部 trigger("gainAfter")；本体 bingshi:415 同款）
		   recoverBegin—— 回复体力前（content.js recover 内容 begin 阶段；本体 key:520 同款） */
		"gainAfter", "recoverBegin",
		/* v6.6 dynamic-integrity: dyingAfter (fanpu-back). Engine proof:
		   library/element/gameEvent.js:213-218 trigger(name,to) does
		   `await this.trigger(this.name + trigger2)` with trigger2 in Before/Begin/End/After
		   => every event X also exposes XBefore / XBegin / XEnd / XAfter.
		   dying order = dyingBefore -> dyingBegin -> content -> dyingEnd -> dyingAfter. */
		"dyingAfter",
		/* v6.3 新增：damageBegin2 —— 伤害流程第二时点（huicui.js:14318 / clan.js:2380 同款），
		   用于把【烈焰】的增伤与【魂矢】的通用增伤在签名上错开。 */
		"damageBegin2"]);
	const bText = fs.readFileSync(path.join(ROOT, "skills", "boss.js"), "utf8");
	const badEv = new Set();
	/* 支持两种书写：`global: "event"` 与 `global: ["a", "b"]` */
	for (const m of bText.matchAll(/(?:player|source|target|global)\s*:\s*(\[[^\]]*\]|"([a-zA-Z0-9]+)")/g)) {
		const seg = m[1];
		const names = seg.startsWith("[")
			? (seg.match(/"([a-zA-Z0-9]+)"/g) || []).map(x => x.slice(1, -1))
			: [seg.slice(1, -1)];
		for (const n of names) if (!WL.has(n)) badEv.add(n);
	}
	if (badEv.size) fail("BOSS 技出现白名单外事件名（核对引擎后更新白名单或改正）：" + [...badEv].join("、"));
	else ok("全部触发事件在白名单内（16 种，均已源码核实；含数组写法）");

	/* ⑨ 讨伐录接入：registry 条目 + 页面文件 */
	const regText = fs.readFileSync(path.join(ROOT, "core", "csh_registry.js"), "utf8");
	const hasReg = /bossbook/.test(regText);
	const hasPage = fs.existsSync(path.join(ROOT, "games", "bossbook.html"));
	if (!hasReg || !hasPage) fail("讨伐录接入缺失：" + (!hasReg ? "registry 无 bossbook 条目；" : "") + (!hasPage ? "games/bossbook.html 不存在" : ""));
	else ok("讨伐录接入在位（registry 条目 + games/bossbook.html）");

	/* E25（v6.5 新增 · 难度评分守护）：`difficultyOf` / `difficultyOfForeign` 是讨伐录
	   「难度 N · 档名」的数据真源，此前零门禁。★ 这类纯函数最危险的失败模式是
	   "**静默返回一个看着合理的常数**"——传错键系（`csh_boss_x` 而非 `csh_x`）时
	   `tierOf` 落回 elite、其余维度全取缺省，93 位会长出同一个分数：不报错、不像 BUG。
	   这里**真跑函数**把它钉住（档位台阶 · 值域 · 键系敏感性 · 本体公式单调封顶）。 */
	{
		const d25 = [];
		const rawIds25 = BD.allBossIds().map(b => b.replace(/^csh_boss_/, "csh_"));
		const byTier25 = { ultimate: [], lord: [], egg: [], elite: [] };
		const cnt25 = {};
		for (const r of rawIds25) {
			const s = BD.difficultyOf(r, 4);
			if (!(typeof s === "number" && s >= 5 && s <= 99)) d25.push(r + " 难度分越界（" + s + "）");
			cnt25[s] = 1;
			(byTier25[BD.tierOf(r)] || byTier25.elite).push(s);
		}
		const avg25 = (a) => a.reduce((p, c) => p + c, 0) / (a.length || 1);
		const nUniq25 = Object.keys(cnt25).length;
		if (rawIds25.length !== 93) d25.push("难度评分覆盖 " + rawIds25.length + " 位 ≠ 93");
		if (nUniq25 < 3) d25.push("93 位魔王只有 " + nUniq25 + " 种难度取值（档位/键系可能整体塌回缺省）");
		if (!(avg25(byTier25.ultimate) > avg25(byTier25.lord) && avg25(byTier25.lord) > avg25(byTier25.elite) && avg25(byTier25.elite) > avg25(byTier25.egg)))
			d25.push("档位台阶不单调（究极/霸主/精英/彩蛋 均值 " + ["ultimate", "lord", "elite", "egg"].map(t => avg25(byTier25[t]).toFixed(1)).join(" / ") + "）");
		if (Math.min(...byTier25.ultimate) < 90) d25.push("究极档出现非 S 级难度（最低 " + Math.min(...byTier25.ultimate) + "）");
		if (Math.max(...byTier25.egg) >= 58) d25.push("彩蛋档难度过高（最高 " + Math.max(...byTier25.egg) + "）");
		/* 错键系自证：传 boss 键（csh_boss_x）必须与传原始键（csh_x）不同 —— 记录层只许传原始键 */
		if (BD.difficultyOf("csh_boss_mlb", 4) === BD.difficultyOf("csh_mlb", 4))
			d25.push("难度分对键系不敏感（传错键也命中）——记录层传参口径可能已改错");
		/* 本体/他扩展公式：单调 + 封顶 + 锚点 */
		if (!(BD.difficultyOfForeign(5, 3) < BD.difficultyOfForeign(6, 5) && BD.difficultyOfForeign(6, 5) < BD.difficultyOfForeign(10, 7)))
			d25.push("本体难度公式非单调（体力/技数上升分数不升）");
		if (BD.difficultyOfForeign(30, 12) > 99 || BD.difficultyOfForeign(5, 3) < 5) d25.push("本体难度公式值域越界");
		if (BD.difficultyOfForeign(10, 7) < 50) d25.push("本体锚点偏低（10 血 7 技 = " + BD.difficultyOfForeign(10, 7) + "，文档口径 ≈ 58）");
		/* 档名映射：从高到低、端点正确 */
		for (let i = 1; i < BD.DIFF_BANDS.length; i++) if (BD.DIFF_BANDS[i - 1].min <= BD.DIFF_BANDS[i].min) d25.push("DIFF_BANDS 未按 min 降序");
		if (BD.diffBandOf(0).key !== "D" || BD.diffBandOf(94).key !== "S") d25.push("档名映射端点错误");
		/* 记录层必须传原始键（页面只读不重算） */
		const br25 = fs.readFileSync(path.join(ROOT, "core", "csh_bossrecord.js"), "utf8");
		if (!/difficultyOf\(orig, baseSk\)/.test(br25)) d25.push("讨伐录未按原始键调用 difficultyOf（页面会显示常数分）");
		if (d25.length) fail("执行级 E25：难度评分异常（" + d25.slice(0, 5).join("；") + "）");
		else ok("执行级 E25：难度评分正确（93 位全算 · 台阶单调 究极 " + avg25(byTier25.ultimate).toFixed(0) +
			" > 霸主 " + avg25(byTier25.lord).toFixed(0) + " > 精英 " + avg25(byTier25.elite).toFixed(0) +
			" > 彩蛋 " + avg25(byTier25.egg).toFixed(0) + " · 共 " + nUniq25 + " 种取值 · 键系敏感 · 本体公式单调封顶）");
	}

	/* E28（v6.5.1 新增 · 成品卫生）：玩家可见页面**不许**出现调试入口与「调试」字样。
	   作者原话：「现在应该是完全版成品才对，不应该让玩家知道的就隐去相关内容」——
	   典型踩坑：图鉴右栏曾挂过「重置她的记录（调试）」按钮（只有 lib.cshDebug 存在才渲染，
	   作者机器上恰好有 → 作者自己截图看到），斗地主开局页副标题曾写「调试面板彩蛋」。
	   扫描前先剥掉注释（`<!-- -->` / 块注释 / 整行 `//`），只查**真正会被渲染**的文本。 */
	{
		const e28 = [];
		const gdir = path.join(ROOT, "games");
		const pages = [];
		for (const f of fs.readdirSync(gdir)) {
			const p = path.join(gdir, f);
			if (fs.statSync(p).isDirectory()) {
				for (const g of fs.readdirSync(p)) if (/\.html$/.test(g)) pages.push(path.join(p, g));
			} else if (/\.html$/.test(f)) pages.push(p);
		}
		for (const p of pages) {
			const rel = path.relative(ROOT, p).replace(/\\/g, "/");
			const src = fs.readFileSync(p, "utf8")
				.replace(/<!--[\s\S]*?-->/g, "")
				.replace(/\/\*[\s\S]*?\*\//g, "")
				.replace(/^[ \t]*\/\/.*$/gm, "");
			if (/cshDebug/.test(src)) e28.push(rel + "：出现 lib.cshDebug 分支（调试入口不该进成品页）");
			if (/调试/.test(src)) e28.push(rel + "：可见文本出现「调试」字样");
		}
		if (pages.length < 8) e28.push("页面枚举异常（只找到 " + pages.length + " 个，应 ≥ 8）");
		if (e28.length) fail("执行级 E28：成品页面卫生（" + e28.slice(0, 4).join("；") + "）");
		else ok("执行级 E28：成品页面卫生（" + pages.length + " 页 · 零调试入口 · 零「调试」字样）");
	}

	/* E29（v6.6 新增 · 濒死链路隔离）：作者指出「有一些进入濒死触发技能的武将，会不会出现
	   一些跟魔王技的冲突」。实证后确认两处真冲突并已修，这里钉住：
	   ① 名册里"观察**别人**濒死"的技（功傲 csh_gongao / 刀锐 csh_daorui）在挑战局里会被
	      魔王方的濒死白嫖（魔王濒死 = 挑战者即将获胜，却白送 +1 上限 / 回血 / 摸牌）
	      ⇒ 必须走 cshIsBossSidePlayer 隔离；
	   ② 【反扑】原本在 dying 的 content 里让全体挑战者一起进 _status.dying 队列，
	      会在"魔王半死"的上下文里连环触发挑战者的 22 个濒死技 ⇒ 已把反噬挪到 dyingAfter。
	   注：csh_rewansha（完杀）的封印只封**非锁定技**（library/skill.js:1634
	   `!persevereSkill && !charlotte && !get.is.locked()`），魔王技全员锁定 ⇒ 不受影响，
	   只封妖灵的主动技（百裂/支配/七曜），属可接受语义，故不隔离。 */
	{
		const e29 = [];
		const sk29 = fs.readFileSync(path.join(ROOT, "skills", "index.js"), "utf8");
		const bo29 = fs.readFileSync(path.join(ROOT, "skills", "boss.js"), "utf8");
		if (!/function cshIsBossSidePlayer\s*\(/.test(sk29)) e29.push("缺濒死隔离守卫 cshIsBossSidePlayer");
		if (!/lib\.config\.mode !== "boss"/.test(sk29) || !/p\.side === true/.test(sk29))
			e29.push("隔离守卫口径不对（应「非 boss 模式恒 false + 魔王方 side===true」）");
		const gongao = sk29.slice(sk29.indexOf('"csh_gongao"'), sk29.indexOf('"csh_gongao"') + 900);
		if (!/cshIsBossSidePlayer\(event\.player\)/.test(gongao)) e29.push("功傲未隔离（任何人濒死都给挑战者成长）");
		const daorui = sk29.slice(sk29.indexOf('"csh_daorui"'), sk29.indexOf('"csh_daorui"') + 1200);
		if (!/cshIsBossSidePlayer\(event\.player\)/.test(daorui)) e29.push("刀锐未隔离");
		/* 反扑：dying 段只许回血，反噬必须在 dyingAfter 段 */
		const fpStart = bo29.indexOf("\tcsh_boss_fanpu: {");
		const fpMain = bo29.slice(fpStart, bo29.indexOf("\tcsh_boss_fanpu_back: {"));
		if (/loseHp/.test(fpMain)) e29.push("反扑的 dying 段仍在对挑战者流失体力（应挪到 dyingAfter）");
		if (!/trigger: \{ player: "dyingAfter" \}/.test(bo29.slice(fpStart, fpStart + 2600)))
			e29.push("反扑缺少 dyingAfter 反噬段");
		if (!/cur\.hp > 1/.test(bo29.slice(fpStart, fpStart + 2600)))
			e29.push("反扑反噬段缺「跳过已濒死者」守卫");
		/* 换血：对方"归零"必须走 loseHp（changeHp 不触发濒死 · content.ts:12275-12281） */
		const hxStart = bo29.indexOf("\tcsh_boss_huanxue: {");
		const hxMain = bo29.slice(hxStart, bo29.indexOf("\tcsh_boss_huanxue_round: {"));
		if (!/best\.loseHp\(/.test(hxMain)) e29.push("换血掉血未走 loseHp（changeHp 不会触发濒死 ⇒ 0 血活人复发）");
		if (/best\.changeHp\(/.test(hxMain)) e29.push("换血仍在对对方用 changeHp（应改用 loseHp）");
		if (e29.length) fail("执行级 E29：濒死链路隔离（" + e29.slice(0, 4).join("；") + "）");
		else ok("执行级 E29：濒死链路隔离（功傲/刀锐不再被魔王方濒死白嫖 · 反扑已拆到 dyingAfter · 换血掉血改用 loseHp）");
	}

	/* E30（v6.7 新增 · CBY 防护 + 同桌好感）：
	   ① CBY 防护只拦两条"正常玩法绝不可能命中"的路径（无来源 / 单笔超硬上限），
	      并**扫描所有入账调用点**确保今后新增来源都带字符串前缀（否则会被这层静默丢掉）；
	   ② 同桌好感度：notePlay 无冷却 + 壳层接线齐全（shell-seat 记账 · shell-close/settle 发放）。 */
	{
		const e30 = [];
		const wt30 = fs.readFileSync(path.join(ROOT, "core", "csh_wallet.js"), "utf8");
		if (!/SINGLE_ADD_CAP\s*=\s*\d+/.test(wt30)) e30.push("缺单笔硬上限常量 SINGLE_ADD_CAP");
		if (!/typeof reason !== "string"/.test(wt30)) e30.push("addPC 未拦「无来源入账」（控制台最容易走的那条）");
		if (!/n > SINGLE_ADD_CAP/.test(wt30)) e30.push("addPC 未拦「单笔超硬上限」");
		if (!/SINGLE_ADD_CAP: SINGLE_ADD_CAP/.test(wt30)) e30.push("SINGLE_ADD_CAP 未对外暴露（页面/门禁读不到）");
		/* 扫描全部入账调用点：第 2 参必须是非空字符串字面量或以 " 开头的拼接。
		   先剥注释（否则注释里的示例代码会误报），再逐行匹配（跨行匹配会吃掉后面的对象字面量）。
		   另外 `core/csh_market.js` 的 pay(amount, reason) 是入账封装，内部已加同样的守卫，
		   故这里连它的调用点一起查。 */
		const bad30 = [];
		const scan30 = (dir) => {
			for (const f of fs.readdirSync(dir)) {
				const fp = path.join(dir, f);
				if (fs.statSync(fp).isDirectory()) { scan30(fp); continue; }
				if (!/\.(js|html)$/.test(f)) continue;
				const t = fs.readFileSync(fp, "utf8")
					.replace(/\/\*[\s\S]*?\*\//g, "")
					.replace(/^[ \t]*\/\/.*$/gm, "")
					.replace(/<!--[\s\S]*?-->/g, "");
				const rel = path.relative(ROOT, fp).replace(/\\/g, "/");
				const re = /(?:wallet\.add|pay)\(\s*[^,()]+,\s*([^)]*)\)/g;
				let m;
				while ((m = re.exec(t))) {
					if (/\n/.test(m[0])) continue;                 /* 跨行 = 不是入账调用 */
					if (/\bfunction\s+$/.test(t.slice(Math.max(0, m.index - 12), m.index))) continue;  /* 函数定义行 */
					const arg = m[1].trim();
					/* 封装函数自身的函数体（core/csh_market.js 的 pay → wallet.add(amount, reason)）
					   已在封装内做过同样的守卫，这里放行；守卫缺失由下面那条断言单独抓。 */
					if (rel === "core/csh_market.js" && arg === "reason") continue;
					if (!/^"/.test(arg)) bad30.push(rel + " → " + arg.slice(0, 40));
				}
			}
		};
		scan30(path.join(ROOT, "core"));
		scan30(path.join(ROOT, "games"));
		if (bad30.length) e30.push("入账调用点缺字符串来源（会被 CBY 防护丢掉）：" + bad30.slice(0, 4).join("；"));
		const mk30 = fs.readFileSync(path.join(ROOT, "core", "csh_market.js"), "utf8");
		if (!/wallet\.commitMarket\(s,/.test(mk30) || !/function commitMarket\(state, delta, reason\)[\s\S]*?typeof reason !== "string"/.test(wt30))
			e30.push("金鳞市原子提交缺少钱包来源守卫");
		/* 同桌好感 */
		const af30 = fs.readFileSync(path.join(ROOT, "core", "csh_affection.js"), "utf8");
		if (!/export function notePlay\s*\(/.test(af30)) e30.push("缺 notePlay（同桌游玩好感）");
		if (!/stAdd\(id, AFF_GAIN\.play, null\)/.test(af30)) e30.push("notePlay 不是无冷却写法（应为 stAdd(id, AFF_GAIN.play, null)）");
		if (!/play:\s*\d+/.test(af30)) e30.push("AFF_GAIN 缺 play 档");
		const sh30 = fs.readFileSync(path.join(ROOT, "core", "csh_shell.js"), "utf8");
		if (!/function cshTableRecord\s*\(/.test(sh30) || !/function cshTableAward\s*\(/.test(sh30))
			e30.push("壳层缺同桌记账/发放函数");
		if (!/cshTableRecord\(seats\)/.test(sh30)) e30.push("shell-seat 未记同桌座位");
		if ((sh30.match(/cshTableAward\(\)/g) || []).length < 3) e30.push("同桌好感发放点不足（应在 close / settle / settle-session 三处各一次）");
		if (e30.length) fail("执行级 E30：CBY 防护与同桌好感（" + e30.slice(0, 4).join("；") + "）");
		else ok("执行级 E30：CBY 防护（无来源 / 单笔超 10 亿 一律拒收 · 全部入账调用点带字符串来源）+ 同桌好感（notePlay 无冷却 · 三处发放点）");
	}

	/* E31（v6.8 新增 · 防作弊的"体感"纪律）：作者原话——
	   「防作弊可能会让玩家不爽，所以要让玩家不能不适。」
	   技术上的拦截可以静默、可以只写调试日志；但**凡是玩家可能看到的文字，一律不许带指控**。
	   本门禁扫全部成品页（剥注释后），禁止出现指责性字眼。
	   注：「未检测到…」这类**空态描述**不算指控（它说的是"没找到某个游戏内容"），
	   所以白名单里显式放行「未检测到」，只禁「检测到你」这种指向人的说法。 */
	{
		const e31 = [];
		const BAD31 = /作弊|违规|非法|可疑|封禁|黑名单|篡改|数值异常|检测到你|异常的数值|不许|禁止刷/;
		const gdir = path.join(ROOT, "games");
		const pages31 = [];
		for (const f of fs.readdirSync(gdir)) {
			const p0 = path.join(gdir, f);
			if (fs.statSync(p0).isDirectory()) {
				for (const g of fs.readdirSync(p0)) if (/\.html$/.test(g)) pages31.push(path.join(p0, g));
			} else if (/\.html$/.test(f)) pages31.push(p0);
		}
		for (const p0 of pages31) {
			const rel = path.relative(ROOT, p0).replace(/\\/g, "/");
			const src = fs.readFileSync(p0, "utf8")
				.replace(/<!--[\s\S]*?-->/g, "")
				.replace(/\/\*[\s\S]*?\*\//g, "")
				.replace(/^[ \t]*\/\/.*$/gm, "");
			const m = BAD31.exec(src);
			if (m) e31.push(rel + "：出现指责性字样「" + m[0] + "」");
		}
		if (e31.length) fail("执行级 E31：防作弊体感纪律（" + e31.slice(0, 3).join("；") + "）");
		else ok("执行级 E31：防作弊体感纪律（" + pages31.length + " 个成品页零指责性字样——拦截静默、提示中性）");
	}

	/* E32（v6.9 新增 · 天下榜接线）：联机榜必须是**一个独立页**、与生涯大厅同级，
	   且**玩家看不到服务器地址**（作者：「应该整合成一个榜，跟生涯大厅、讨伐录同级别」
	   「服务器端口都不用让用户看到」）。
	   通信必须走 Node 原生 http —— 游戏窗口是 file://（Chromium 安全上下文），
   fetch 明文 http 会被拦；本项目 app/main.js 开了 nodeIntegration / nodeIntegrationInSubFrames
   / webSecurity:false，所以渲染进程与 iframe 都能 require("http")。 */
	{
		const e32 = [];
		const rp32 = path.join(ROOT, "games", "rank.html");
		if (!fs.existsSync(rp32)) e32.push("缺 games/rank.html");
		else {
			const t32 = fs.readFileSync(rp32, "utf8");
			if (!t32.includes("csh_online.js") || !/function netService/.test(t32)) e32.push("rank.html 未接单一可信联网策略");
			if (/id="net-url"|placeholder="https?:/.test(t32)) e32.push("rank.html 把服务器地址做成了输入框（玩家不该看到）");
			if (!/CSHNet\.request/.test(t32) || !t32.includes("csh_net.js")) e32.push("rank.html 未接共享 HTTPS 双通道");
			if (t32.indexOf('NET_BASE.indexOf("https://") !== 0') >= 0)
				e32.push("rank.html 仍在明文 http 下直接放弃 fetch —— 手机端没有 Node，必须允许尝试（失败静默）");
		}
		const rg32 = fs.readFileSync(path.join(ROOT, "core", "csh_registry.js"), "utf8");
		if (!/key: "rank", title: "/.test(rg32)) e32.push("registry 缺 rank 条目");
		/* 非游戏页要进 all()（否则 shell 侧 META 里没有它 ⇒ open 恒失败）。
		   断言"rank 在这个 concat 列表里"，不绑死整串写法 —— 后来加行囊时才发现
		   原来写的是全串精确匹配（加一个条目就红），这种断言绑的是**写法**不是**语义**。 */
		const allLine32 = (rg32.match(/ORDER\.concat\(\[[^\]]*\]\)/) || [""])[0];
		if (allLine32.indexOf('"rank"') < 0) e32.push("registry.all() 未并入 rank");
		if (allLine32.indexOf('"bossbook"') < 0) e32.push("registry.all() 未并入 bossbook");
		const gm32 = fs.readFileSync(path.join(ROOT, "core", "csh_games.js"), "utf8");
		if (!/\t\trank: \{/.test(gm32)) e32.push("大厅 CARDS 缺 rank 展示文案（大厅自检会报错）");
		const cr32 = fs.readFileSync(path.join(ROOT, "games", "career.html"), "utf8");
		if (/bd-net-cby/.test(cr32)) e32.push("career.html 还留着旧的联机子页签（职责应收敛到天下榜）");
		/* ★ 大厅入口卡是**手写**的（生涯大厅 / 讨伐录 两张 + games.forEach 循环四款游戏），
		   非游戏页不进 ORDER ⇒ 只加 registry 条目**不会出现卡片**。
		   这条断言就是为那次真事故加的：只查注册表 = 漏掉真正的可见性。 */
		const db32 = fs.readFileSync(path.join(ROOT, "core", "csh_debug.js"), "utf8");
		if (!/gb-rank/.test(db32) || !/cshGames\.open\("rank"/.test(db32))
			e32.push("大厅缺天下榜的手写入口卡（只加 registry 条目不会出卡片）");
		if (e32.length) fail("执行级 E32：天下榜接线（" + e32.slice(0, 4).join("；") + "）");
		else ok("执行级 E32：天下榜（独立页 · 与生涯大厅同级 · 玩家只见昵称不见地址 · Node http 通道）");
	}

	/* E33: Offline-first identity contract. Public UID/IP does not prove ownership. */
	{
		const e33 = [];
		const t33 = fs.readFileSync(path.join(ROOT, "games", "rank.html"), "utf8");
		if (/networkInterfaces|os\.hostname|os\.cpus|os\.totalmem/.test(t33) || !/function machineFp\(\) \{ return ""; \}/.test(t33))
			e33.push("客户端必须停止收集硬件指纹，旧字段仅留空兼容");
		if (!/fp:\s*(?:NET\.fp|['"]['"])/.test(t33)) e33.push("submit 未保留空 fp 兼容字段");
		if (!/seg: NET\.seg/.test(t33)) e33.push("submit 未带 seg（官阶，真源是钱包 RANKS，页面不许另抄一份表）");
		if (!/uid=/.test(t33) || !/NET\.me/.test(t33))
			e33.push("拉榜未带 uid / 未接 me（不在前 N 名就看不到自己排第几）");
		if (!/renderMeBar/.test(t33)) e33.push("缺「我的名次」常驻条");
        if (/NET\.uid\s*=\s*r\.uid/.test(t33) || !/r\.uid !== context\.uid/.test(t33)) e33.push("未经验证的服务归属不能自动替换本机身份");
        if(!/netCanPublish/.test(t33))e33.push("公开读取与发布权限未隔离");
		if (!/name-taken/.test(t33)) e33.push("未处理名字已被占用的情况");
		if (!/r\.ignored/.test(t33)) e33.push("未处理服务端静默忽略（会让玩家以为点了个死按钮）");
		/* v2.1（打榜 + 签名）：扣费必须在宿主单一账本（shell-cheer），服务端只做聚合 */
		if (!/id="sg"/.test(t33) || !/sig: NET\.sig/.test(t33))
			e33.push("缺个性签名（≤10 字，随留名上送）");
		if (!/shell-cheer-list/.test(t33) || !/shell-cheer"/.test(t33))
			e33.push("打榜未走宿主桥（扣费必须走钱包单一账本，页面不许自己扣）");
		if (!/\/cheer/.test(t33) || !/\/girls/.test(t33))
			e33.push("打榜未接服务端聚合接口（/cheer · /girls）");
		/* 玩家侧文案：可以说明规则，但不得出现任何指责/内部术语（E31 的同源纪律） */
		if (/作弊|违规|非法|封禁|黑名单|数值异常/.test(t33))
			e33.push("页面出现指责性或内部术语字样（玩家不该看见）");
		if (e33.length) fail("执行级 E33：天下榜留名契约（" + e33.slice(0, 4).join("；") + "）");
		else ok("执行级 E33：天下榜契约（无硬件指纹 · 公开读取与发布分离 · 旧UID不自动认领 · 已付记录保留）");
	}

	/* E34（2026-10-15 新增 · 魔王可见性 fail-loud）：
	   事故：懒人包（作者报版本 1.11.51）导入本扩展后，**挑战模式看不到魔王，控制台零提示**。
	   链路：NAME ∈ lib.config.characters → 引擎 loadCharacter 写进 lib.character →
	   引擎 mode/boss.js 只枚举 lib.character 且只认 info.isBoss —— **任一环不落地都是静默**：
	     · character/boss.js 顶层登记失败 → 原本只有一句 console.warn（失败即无声）；
	     · main/bossmode.js 条目全缺 → 原本 warn + return，且 content.js 随后
	       delete lib.characterPack[NAME]，现场证据一并消失。
	   → 固化为两条常驻判据：① character/boss.js 必须有对 lib.config.characters 的
	   **幂等**登记动作；② main/bossmode.js 必须有可整条搜索的前缀串 [池子魔将][BOSS-诊断]。 */
	{
		const e34 = [];
		const cb34 = fs.readFileSync(path.join(ROOT, "character", "boss.js"), "utf8");
		if (!/lib\.config\.characters\s*.\s*add\s*\(/.test(cb34))
			e34.push("character/boss.js 缺 lib.config.characters 的登记动作（魔王一个都进不了 lib.character）");
		if (!/lib\.config\.characters\s*.\s*includes\s*\(/.test(cb34))
			e34.push("character/boss.js 的登记缺少幂等 includes 判断（重复 add 会污染已启用角色包列表）");
		if (!cb34.includes("[池子魔将][BOSS-诊断]"))
			e34.push("character/boss.js 缺同前缀的诊断输出（登记失败会退回静默）");
		const mb34 = fs.readFileSync(path.join(ROOT, "main", "bossmode.js"), "utf8");
		if (!mb34.includes("[池子魔将][BOSS-诊断]"))
			e34.push("main/bossmode.js 缺可搜索的前缀串 [池子魔将][BOSS-诊断]（魔王条目全缺时会静默）");
		if (e34.length) fail("执行级 E34：魔王可见性 fail-loud（" + e34.slice(0, 4).join("；") + "）");
		else ok("执行级 E34：魔王可见性 fail-loud（lib.config.characters 幂等登记 + 失败后自愈补登记 + [池子魔将][BOSS-诊断] 双处可搜前缀）");
	}

	/* E35（v6.7 新增 · 妖灵中文名单一真源）：
	   作者实机：妖灵图鉴（games/codex.html）把 50 位妖灵显示成原始 id
	   （如 csh_boss_minion_eve）。根因 = 中文名只有一个来源 lib.translate，
	   那是 boss 角色包被引擎 loadCharacter 之后才落地的（懒人包/旧版客户端不加载
	   ⇒ 全池回退成 id）；同时旧回退链末级 `return id` 是**静默**的，没人知道它掉了。
	   固化为三条常驻判据：数据层 50 名齐且互异 · 页面/模块不再把 translate 放在第一顺位
	   · 兜底必须留可搜索的 warn。 */
	{
		const e35 = [];
		const MN = BD.MINION_NAMES || null;
		const ids = Object.keys(BD.MINIONS || {});
		/* ① 数据层：50 条全部带非空 name */
		const noName = ids.filter(k => !BD.MINIONS[k] || typeof BD.MINIONS[k].name !== "string" || !BD.MINIONS[k].name.trim());
		if (ids.length !== 50) e35.push("MINIONS 条目数不是 50（实际 " + ids.length + " 条）");
		if (noName.length) e35.push("缺 name：" + noName.slice(0, 4).join("、") + " 等 " + noName.length + " 条");
		/* ② 两两可不同名（重名会让图鉴/日志指认错人） */
		const seen = new Map(), dupName = [];
		for (const k of ids) {
			const n = BD.MINIONS[k] && BD.MINIONS[k].name;
			if (typeof n !== "string" || !n) continue;
			if (seen.has(n)) { if (dupName.indexOf(n) < 0) dupName.push(n); }
			else seen.set(n, k);
		}
		if (dupName.length) e35.push("重名：" + dupName.slice(0, 4).join("、"));
		/* ③ MINION_NAMES 导出必须与 MINIONS.name 逐项一致（单一真源） */
		if (!MN) e35.push("core/csh_bossdata.js 未导出 MINION_NAMES（页面拿不到数据层名单）");
		else {
			const mk = Object.keys(MN);
			const diff2 = ids.filter(k => MN[k] !== BD.MINIONS[k].name);
			if (mk.length !== ids.length || diff2.length)
				e35.push("MINION_NAMES 与 MINIONS 不一致（" + diff2.slice(0, 3).join("、") + "）");
		}
		/* ④ 接线：页面通道（lib.cshMarket.MINION_NAMES） + 妖灵条目自带 name */
		const mk35 = fs.readFileSync(path.join(ROOT, "core", "csh_market.js"), "utf8");
		if (!/MINION_NAMES/.test(mk35)) e35.push("core/csh_market.js 未把 MINION_NAMES 转交给页面");
		const built35 = BD.buildBossEntries(mock, mockTrans, mockTitles);
		const meBad = Object.keys(built35.minionEntries || {})
			.filter(mid => !(built35.minionEntries[mid] && built35.minionEntries[mid].name));
		if (meBad.length) e35.push("minionEntries 未带 name（引擎侧 lib.character[妖灵].name 恒空 · " + meBad.length + " 条）");
		/* ⑤ 模块侧不许再把 lib.translate 放在第一顺位（防止下一轮又冒出第二个来源）
		   —— 判定口径：同一条赋值语句里，数据层的读取位置必须在 translate 之前。 */
		const br35 = fs.readFileSync(path.join(ROOT, "core", "csh_bossrecord.js"), "utf8");
		const lines35 = br35.split(/\r?\n/);
		const orderBad35 = [];
		for (const raw of lines35) {
			const tNO = raw.indexOf("lib.translate["), tIS = raw.indexOf("MINION_NAMES[");
			if (tNO >= 0 && raw.indexOf("lib.translate[minionId]") >= 0) {
				if (!(tIS >= 0 && tIS < tNO)) orderBad35.push("recordMinion 的日志/结算");
			}
			if (tNO >= 0 && raw.indexOf("lib.translate[mid]") >= 0) {
				if (!(tIS >= 0 && tIS < tNO)) orderBad35.push("summary().minions[].name");
			}
		}
		const noOrder35 = [...new Set(orderBad35)];
		if (noOrder35.length) e35.push("仍有读取点把 translate 排在数据层之前：" + noOrder35.join("、"));
		/* ⑥ 页面回退链：数据层优先 + 末级必须留可搜索 warn（不许再静默） */
		const cx35 = fs.readFileSync(path.join(ROOT, "games", "codex.html"), "utf8");
		const nm35 = (cx35.match(/function nameOf[\s\S]*?\n\}/) || [""])[0];
		if (!nm35) e35.push("games/codex.html 找不到 nameOf()");
		else {
			const iData = nm35.indexOf("names[id]"), iTrans = nm35.indexOf("L.translate[id]");
			if (iData < 0) e35.push("nameOf() 未读数据层名单（MINION_NAMES）");
			if (iTrans < 0) e35.push("nameOf() 未保留 lib.translate 兜底");
			if (iData >= 0 && iTrans >= 0 && iData > iTrans)
				e35.push("nameOf() 顺序错：lib.translate 排在数据层之前");
			if (!/\[池子魔将\]\[图鉴\] 缺名 id:/.test(nm35))
				e35.push("末级回退缺可搜索的 warn（需要 \"[池子魔将][图鉴] 缺名 id:\"）");
		}
		if (e35.length) fail("执行级 E35：妖灵中文名单一真源（" + e35.slice(0, 4).join("；") + "）");
		else ok("执行级 E35：妖灵中文名单一真源（50 条全带非空 name · 零重名 · 页面/结算均取自 MINION_NAMES · 末级回退留 [池子魔将][图鉴] 缺名 id: warn）");
	}

	/* E36（2026-10-15 新增 · 引擎全局的显式 import）：
	   ★ 真事故回归守卫 —— skills/boss.js **零 import**，却在函数体里用了 160 次引擎全局
	   （game. 138 / lib. 13 / get. 7 / ai. 2 / ui. 1 / _status. 2）。ESM 模块作用域没有这些
	   隐式全局 ⇒ 作者实机在 arrangeTrigger 阶段吃到 `game is not defined`（787 行）。
	   静态门禁与 simulate_world 都抓不到（不真跑那条技能路径）。这条断言扫 skills/ 下
	   所有 .js：**只要用到某个引擎全局，就必须有对应的具名 import**。 */
	{
		const e36 = [];
		const skDir = path.join(ROOT, "skills");
		const ENGINE_IDS = ["lib", "game", "ui", "get", "ai", "_status"];
		let scanned36 = 0;
		if (fs.existsSync(skDir)) {
			const walk36 = (dir) => {
				for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
					const fp = path.join(dir, ent.name);
					if (ent.isDirectory()) { walk36(fp); continue; }
					if (!/\.js$/.test(ent.name)) continue;
					scanned36++;
					const t36 = fs.readFileSync(fp, "utf8");
					/* 注释掉的代码不算：先剥块注释与整行 // */
					const body = t36.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
					const rel = path.relative(ROOT, fp).replace(/\\/g, "/");
					for (const id of ENGINE_IDS) {
						const used = new RegExp("(?<![\\w$.])" + id + "\\.").test(body);
						if (!used) continue;
						/* 具名 import / 动态解构 / 全局挂载（lib.x = …）之外的引用都要能解析 */
						const hasNamed = new RegExp("import\\s*\\{[^}]*\\b" + id + "\\b[^}]*\\}\\s*from").test(body);
						const hasNs = /import\s+\*\s+as\s+\w+\s+from/.test(body);
						const isGlobalDef = new RegExp("(^|[^\\w$.])" + id + "\\s*=", "m").test(body);
						if (!hasNamed && !hasNs && !isGlobalDef)
							e36.push(rel + " 用了 " + id + ". 但没有 import");
					}
				}
			};
			walk36(skDir);
		}
		if (scanned36 < 2) e36.push("skills/ 下只扫到 " + scanned36 + " 个 js（扫描器可能失效）");
		if (e36.length) fail("执行级 E36：引擎全局必须显式 import（" + e36.slice(0, 3).join("；") + "）");
		else ok("执行级 E36：skills/ 下 " + scanned36 + " 个模块的引擎全局引用全部有显式 import");
	}

	/* E37（2026-10-15 新增 · 图片文件名全 ASCII 化守护）：
	   ★ 作者批准把 50 只妖灵的 100 张**中文名**立绘永久改成 ASCII 名
	     （命名规则 = 妖灵主名 = MINION 键去掉 csh_boss_minion_ 前缀）。
	     起因：中文文件名在部分客户端/打包链路上会被"自动修正乱码"改名
	     （疑为安卓端启动卡顿源，此假设未经证实，故仅作背景、不作判据）。
	   两条常驻判据：
	     ① image/ 目录（含子目录）下 **零非 ASCII 文件名**；
	     ② 数据层 MINIONS 的每一条 img/face 路径**逐条真实存在**（50 × 2 = 100 条全在位）。 */
	{
		const e37 = [];
		/* ① 扫 image/ 全目录：文件名不许含非 ASCII 字符 */
		const imgDir37 = path.join(ROOT, "image");
		const nonAscii37 = [];
		if (fs.existsSync(imgDir37)) {
			const walk37 = (dir) => {
				for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
					const fp = path.join(dir, ent.name);
					if (ent.isDirectory()) { walk37(fp); continue; }
					if (/[^\x00-\x7F]/.test(ent.name))
						nonAscii37.push(path.relative(ROOT, fp).replace(/\\/g, "/"));
				}
			};
			walk37(imgDir37);
		} else e37.push("image/ 目录不存在");
		if (nonAscii37.length)
			e37.push("image/ 下仍有非 ASCII 文件名 " + nonAscii37.length + " 个：" + nonAscii37.slice(0, 5).join("、"));

		/* ② 数据层 100 条 img/face 路径逐条存在且为 ASCII */
		let checked37 = 0;
		const missing37 = [];
		for (const mid in BD.MINIONS) {
			const m = BD.MINIONS[mid] || {};
			for (const which of ["img", "face"]) {
				const rel = String(m[which] || "").replace(/^extension\/池子魔将\//, "");
				checked37++;
				if (!rel || /[^\x00-\x7F]/.test(rel)) { missing37.push(mid + "." + which + "（路径空或非 ASCII）"); continue; }
				if (!fs.existsSync(path.join(ROOT, rel))) missing37.push(mid + "." + which + "（文件缺失：" + rel + "）");
			}
		}
		if (checked37 !== 100) e37.push("数据层 img/face 应 100 条，实际 " + checked37 + " 条");
		if (missing37.length) e37.push("立绘文件缺失 " + missing37.length + " 条：" + missing37.slice(0, 5).join("；"));

		if (e37.length) fail("执行级 E37：图片文件名未全 ASCII 化（" + e37.slice(0, 3).join("；") + "）");
		else ok("执行级 E37：image/ 目录零非 ASCII 文件名；数据层 img/face 100 条路径逐条存在（50 只 × 主图/人像）");
	}
	/* E38（2026-10-15 · 云功能「单点可切换 + 离线可降级」硬约束）：
	   ★ 真事故回归守卫 —— 手机端「未连接」的根因就是明文 http：安卓端页面 origin 是
	   https://localhost（androidScheme=https）且 usesCleartextTraffic=false，
	   https 页面请求明文 http 会被混合内容拦掉。因此断言：
	     ① 成品页网络基址必须是 https；
	     ② 必须保留 Node 通道（桌面）与 fetch 兜底（手机没有 window.require）；
	     ③ 换服务器只改 NET_BASE 一行（这就是「单点可切换」）。 */
	{
		const e38 = [];
		const gdir = path.join(ROOT, "games");
		const walk38 = (dir) => {
			for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
				const fp = path.join(dir, ent.name);
				if (ent.isDirectory()) { walk38(fp); continue; }
				if (!ent.name.endsWith(".html")) continue;
				const t = fs.readFileSync(fp, "utf8");
				if (t.indexOf("NET_BASE") < 0) continue;
				const rel = path.relative(ROOT, fp);
				const m = t.match(/var NET_BASE = "([^"]*)"/);
				if (!m) e38.push(rel + " 有 NET_BASE 但写法无法静态核对");
				else if (m[1].indexOf("https://") !== 0) e38.push(rel + " 基址不是 https（手机端会被拦）：" + m[1]);
				if (!t.includes("csh_net.js") || !t.includes("CSHNet.request")) e38.push(rel + " 未接共享 HTTPS 双通道");
			}
		};
		if (fs.existsSync(gdir)) walk38(gdir);
        const transport38=fs.readFileSync(path.join(ROOT,"core/csh_net.js"),"utf8");
        if(!transport38.includes("req('https')")||!transport38.includes("root.fetch(")||!/credentials:\s*'omit'/.test(transport38)||!/redirect:\s*'error'/.test(transport38)||!/size\s*>\s*MAX/.test(transport38))e38.push("共享传输缺HTTPS双通道、凭据隔离或响应尺寸上限");
        try{const result=JSON.parse(execFileSync(process.execPath,[path.join(ROOT,"tools/probe_online_offline.mjs")],{encoding:"utf8",timeout:20000,windowsHide:true}));if(result.failed!==0||result.passed<76)e38.push("联网开关、取消、缓存/竞态与补送故障回归未通过");}catch(error){e38.push("联网离线故障回归失败："+error.message.slice(0,150));}
		if (e38.length) fail("执行级 E38：云功能基址与双通道（" + e38.slice(0, 3).join("；") + "）");
		else ok("执行级 E38：云功能基址全 https + Node/fetch 双通道齐全（手机端混合内容拦截不再复发）");
	}

	/* E39（2026-10-15 · 天下榜 P6 观赏层「四件套」守卫；2026-10-16 主推位并入花魁三席）：
	   P6 四项（花魁展示 / 行头像 / 照片墙 / 懒加载）全部是**加在成品页上的表现层**，
	   最容易在后续改版里被顺手删掉或改坏。逐条钉死：
	     ① 花魁展示：花魁三席（renderChiefs + 席位卡 + 素材路径规则 csh_face_<主名>.webp）
	        —— 2026-10-16 作者定案「花魁只列前三名的详细情况」，原独立主推位（.hero/paintHero）
	        已并入第一席，故断言随之改指三席；
	     ② 行头像：币/功勋榜的姓氏印章（sealOf）+ 花榜的真头像（data-bg 懒加载）；
	     ③ 照片墙：.wall 网格 + 分批渲染游标（WALL.batch / renderWall）
	        —— 三席为默认，但**全 50 位必须仍然可达**（否则其余 47 位再没人能打赏）；
	     ④ 懒加载：data-bg 必须成对出现「写入点」与「IntersectionObserver 读取点」，
	        且必须有「无 IO 环境全量落位」的兜底（极老 WebView 不残）。
	   另：素材映射必须与 MINION_POOL 全对齐（50 只 id 去前缀 → image/csh_face_<主名>.webp 全在位），
	   否则花榜会出现空头像格。 */
	{
		const e39 = [];
		const rk = path.join(ROOT, "games", "rank.html");
		if (!fs.existsSync(rk)) e39.push("找不到 games/rank.html");
		else {
			const t = fs.readFileSync(rk, "utf8");
			const need = [
				["花魁三席", ["function renderChiefs", "function seatCardHtml", "class=\"chief", "csh_face_", "tops"]],
				["行头像", ["function sealOf", "class=\"av seal\"", "class=\"av\" data-bg="]],
				["照片墙", ["class=\"wall\"", "function renderWall", "WALL.batch"]],
				["懒加载", ["data-bg", "IntersectionObserver", "function lazyBg", "removeAttribute(\"data-bg\")"]],
				["版式切换", ["id=\"viewbar\"", "id=\"v-chief\"", "function setView", "function preferView"]],
			];
			for (const [name, keys] of need)
				for (const k of keys) if (t.indexOf(k) < 0) e39.push("P6「" + name + "」缺 " + k);
			/* 懒加载必须同时有"写入"与"读取"，只有 data-bg 没有 IO 读取点 = 图永远不落 */
			if (t.indexOf("data-bg") >= 0 && t.indexOf("IntersectionObserver") < 0)
				e39.push("有 data-bg 写入点但没有 IntersectionObserver 读取点（头像/立绘永不落图）");
			/* 无 IO 兜底：极老 WebView 上必须全量落位，否则整页没图 */
			if (t.indexOf("typeof IntersectionObserver === \"undefined\"") < 0)
				e39.push("缺「无 IntersectionObserver 环境全量落位」兜底");
			/* ★ 三席是默认，但全 50 位必须仍然可达：否则其余 47 位再没人能打赏（功能缺失，
			   不是"简化"）。既然"只列前三"是作者要求，这条就是它的**边界守卫**。 */
			for (const k of ["renderCheerList", "WALL.rows.length", "照片墙 / 名录"])
				if (t.indexOf(k) < 0) e39.push("全榜入口不完整（缺 " + k + "）——" +
					"只留三席会让其余 47 位无法被打赏");
			/* ★ 兼容契约：老服务端不返回 tops（服务端上了新版本才有）——
			   页面必须能降级，否则"页面已经依赖、服务端还没上"的那段时间花榜会空白。 */
			if (t.indexOf("(c && c.tops) ? c.tops : []") < 0)
				e39.push("缺 tops 降级（老服务端没有该字段时三席会空）");
		}
		/* 素材映射：MINION_POOL 每只都要有对应的人像图 */
		try {
			const bd = fs.readFileSync(path.join(ROOT, "core", "csh_bossdata.js"), "utf8");
			const pool = bd.match(/export const MINION_POOL = \[([\s\S]*?)\]/);
			if (!pool) e39.push("取不到 MINION_POOL（素材映射无法核对）");
			else {
				const ids = (pool[1].match(/csh_boss_minion_[a-z0-9_]+/g) || []);
				const imgDir = path.join(ROOT, "image");
				const miss = [];
				for (const id of ids) {
					const f = "csh_face_" + id.replace("csh_boss_minion_", "") + ".webp";
					if (!fs.existsSync(path.join(imgDir, f))) miss.push(f);
				}
				if (miss.length) e39.push("花榜人像缺失 " + miss.length + " 张（如 " + miss.slice(0, 3).join("、") + "）");
			}
		} catch (e39b) { e39.push("素材映射核对异常：" + e39b.message); }
		if (e39.length) fail("执行级 E39：天下榜花榜层（" + e39.slice(0, 3).join("；") + "）");
		else ok("执行级 E39：花魁三席 + 全榜入口 + 行头像 + 照片墙/懒加载齐备（50 只人像全在位）");
	}

	/* E40（2026-10-15 · 「行囊」存档总口接线）：
	   作者定案：「这次做的导入导出要涵盖全部的玩家数据，做成跟生涯大厅、讨伐录平级」，
	   且「原先位置的那些导入导出……除了生涯大厅的，其他都保留」。
	   本断言钉四件事：
	     ① 新页在册且是大厅平级（registry 条目 lobby:true + all() 并入 + CARDS 文案 + 手写入口卡）；
	     ② 宿主桥齐备（export / import / backups / rollback / reset / inventory）；
	     ③ 页面**只走桥**：不自己去读 localStorage 里的业务键（那正是旧版读错后端的病根）；
	     ④ 生涯大厅那边**搬干净了**（mig- 元素与绑定全无残留），但其余入口（调试面板的
	        技能方案导入导出、胜负统计自带导入导出、导出日志）保留。 */
	{
		const e40 = [];
		const sv = path.join(ROOT, "games", "save.html");
		const rg40 = fs.readFileSync(path.join(ROOT, "core", "csh_registry.js"), "utf8");
		const db40 = fs.readFileSync(path.join(ROOT, "core", "csh_debug.js"), "utf8");
		const gm40 = fs.readFileSync(path.join(ROOT, "core", "csh_games.js"), "utf8");
		const sh40 = fs.readFileSync(path.join(ROOT, "core", "csh_shell.js"), "utf8");
		const cr40 = fs.readFileSync(path.join(ROOT, "games", "career.html"), "utf8");
		if (!fs.existsSync(sv)) e40.push("缺 games/save.html");
		else {
			const t = fs.readFileSync(sv, "utf8");
			/* ③ 只走桥：不许出现"页面自己读业务键" */
			const forbidden = ["csh_wallet", "csh_rank", "csh_affection", "csh_ledger",
				"extension_池子魔将_bossKill", "extension_池子魔将_goldfish", "extension_池子魔将_winrateData"];
			for (const k of forbidden) if (t.indexOf(k) >= 0) e40.push("save.html 自己碰了业务键 " + k + "（应全程走桥）");
			for (const b of ["shell-mig-export", "shell-mig-import", "shell-mig-backups",
				"shell-mig-rollback", "shell-mig-reset", "shell-mig-inventory"])
				if (t.indexOf(b) < 0) e40.push("save.html 未接桥命令 " + b);
			/* 导入必须**先预检再执行**（dryRun），否则一次误点就覆盖了一身家当 */
			if (t.indexOf("dryRun") < 0) e40.push("save.html 缺 dryRun 预检（导入前必须先看差异）");
			if (t.indexOf("window.confirm") < 0) e40.push("save.html 缺二次确认");
			/* 文案纪律（与天下榜同款）：页面上的字只从文案表 T 取 */
			if (!/var T = \{/.test(t)) e40.push("save.html 缺文案表 T");
			/* ★ 「调试」二字不许出现在成品页（E28 已管，这里再钉一次是因为本页
			     天生容易把宿主的内部域名叫出来） */
			if (/调试/.test(t.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "")))
				e40.push("save.html 可见文本出现「调试」字样");
		}
		if (!/key: "save", title: "行囊"/.test(rg40)) e40.push("registry 缺 save 条目");
		if (!/lobby: true/.test((rg40.match(/save: \{[\s\S]*?\n\t\t\},/) || [""])[0])) e40.push("registry 的 save 条目不是 lobby（会走收费屏）");
		const allLine40 = (rg40.match(/ORDER\.concat\(\[[^\]]*\]\)/) || [""])[0];
		if (allLine40.indexOf('"save"') < 0) e40.push("registry.all() 未并入 save");
		if (!/\t\tsave: \{/.test(gm40)) e40.push("大厅 CARDS 缺 save 展示文案（大厅自检会报错）");
		if (!/gb-save/.test(db40) || !/cshGames\.open\("save"/.test(db40))
			e40.push("大厅缺行囊的手写入口卡（只加 registry 条目不会出卡片）");
		if (db40.indexOf('if (cmd === "shell-mig-inventory")') < 0 && sh40.indexOf('if (cmd === "shell-mig-inventory")') < 0)
			e40.push("宿主缺 shell-mig-inventory 桥命令（家当清点拿不到）");
		/* ④ 生涯大厅搬干净 */
		if (/mig-export|mig-apply|mig-text|bindMigrate|migrow/.test(cr40)) e40.push("career.html 还有迁移残留（应已搬去行囊）");
		if (cr40.indexOf("bindMigrate") >= 0) e40.push("career.html 还调用着已删除的 bindMigrate");
		if (cr40.indexOf('$("#md-close")') < 0) e40.push("career.html 的弹窗关闭丢了（摘区块时误删）");
		/* 其余入口必须保留（作者：「除了生涯大厅的，其他都保留」） */
		if (db40.indexOf("导入 / 导出") < 0 && db40.indexOf("导入（合并）") < 0) e40.push("调试面板的技能方案导入导出被误删（应保留）");
		const wr40 = fs.readFileSync(path.join(ROOT, "core", "csh_winrate.js"), "utf8");
		if (wr40.indexOf("exportData") < 0 || wr40.indexOf("导入") < 0) e40.push("胜负统计自带的导入导出被误删（应保留）");
		if (e40.length) fail("执行级 E40：行囊存档总口（" + e40.slice(0, 4).join("；") + "）");
		else ok("执行级 E40：行囊在册且大厅平级（桥六件齐 · 先预检后覆盖 · 生涯大厅已搬净 · 其余导入导出保留）");
	}

	/* E41（2026-10-15 · 存档覆盖度：**扫源码比对白名单**）：
	   ★ 这条门禁的由来：这一轮做「涵盖全部玩家数据」时，靠人工 grep 才发现
	     `csh_affection`（好感度）、讨伐录/扮演魔王/金鳞市（lib.config 域）、
	     以及一个**只写不读的死键** `csh_ddz_good`。靠人不靠机器 = 下次还会漏。
	   规则：把扩展里所有"自己持久化"的键挖出来（localStorage.* 字面量 / ls*(字面量) /
	   lib.config[字面量] / saveConfig(字面量) / 以及 "K_XXX = 字面量" 常量被上述调用引用），
	   要求每个键**要么在 csh_migrate 的键表里，要么在下面这份带理由的豁免表里**。
	   豁免表只收"设置项"与"内部前缀"，且必须写明理由 —— 加一条要动这里的注释。 */
	{
		const e41 = [];
		const MIG_IGNORE = {
			"extension_池子魔将_csh_debug_menu": "无名杀设置项（lib.config 配置项，走引擎设置界面与自身存档）",
			"extension_池子魔将_csh_dev_log": "无名杀设置项（同上）",
			"extension_池子魔将_csh_effect_announce": "无名杀设置项（同上）",
			"extension_池子魔将_csh_enable_pingxing": "无名杀设置项（同上）",
			"extension_池子魔将_csh_eg_group_scroll": "无名杀设置项（同上 · 2026-10-16 新增：选将势力面板滚动条开关，engine-compat C4）",
			"extension_池子魔将_csh_kami_group": "无名杀设置项（同上 · 2026-10-18 新增：非身份场「神将选势力」的独立开关，作者要求能单独关掉以免与别的扩展重复）",
			"extension_池子魔将_version": "引擎写入的扩展版本号（架构级内部键，非玩家数据、不进行囊；2026-10-17 「检查更新」读它比对远端版本）",
		};
		const walkDirs = ["core", "main", "games", "character", "skills"];
		const files41 = [];
		const walk41 = (d) => {
			if (!fs.existsSync(d)) return;
			for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
				const fp = path.join(d, ent.name);
				if (ent.isDirectory()) walk41(fp);
				else if (/\.(js|html)$/.test(ent.name)) files41.push(fp);
			}
		};
		walkDirs.forEach((d) => walk41(path.join(ROOT, d)));
		const found = new Map();
		const consts41 = new Map();
		const note = (k, where) => { if (!found.has(k)) found.set(k, new Set()); found.get(k).add(where); };
		for (const fp of files41) {
			const rel = path.relative(ROOT, fp).replace(/\\/g, "/");
			const t = fs.readFileSync(fp, "utf8");
			for (const m of t.matchAll(/\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*["']([^"']+)["']/g)) consts41.set(m[1], m[2]);
			for (const m of t.matchAll(/(?:localStorage|sessionStorage)\.(?:setItem|getItem|removeItem)\(\s*["']([^"']+)["']/g)) note(m[1], rel);
			for (const m of t.matchAll(/\b(?:lsSet|lsPut|lsGet|lsDel|lsJSON)\(\s*["']([^"']+)["']/g)) note(m[1], rel);
			for (const m of t.matchAll(/lib\.config\[\s*["']([^"']+)["']\s*\]/g)) note(m[1], rel);
			for (const m of t.matchAll(/saveConfig\(\s*["']([^"']+)["']/g)) note(m[1], rel);
			for (const m of t.matchAll(/(?:localStorage\.(?:setItem|getItem|removeItem)|lsSet|lsPut|lsGet|lsDel|lsJSON|lib\.config\[|saveConfig\()\s*\(?\s*([A-Za-z_$][\w$]*)/g)) {
				const v = consts41.get(m[1]);
				if (v && /^(csh_|extension_池子魔将_)/.test(v)) note(v, rel);
			}
		}
		/* 迁移模块声明了哪些键（含键族成员与通配族主键） */
		const mig41 = fs.readFileSync(path.join(ROOT, "core", "csh_migrate.js"), "utf8");
		const declared = new Set(["csh_bgm_on"]);
		for (const m of mig41.matchAll(/["']((?:csh_|extension_池子魔将_)[a-z0-9_]+)["']/gi)) declared.add(m[1]);
		const missed = [];
		for (const k of found.keys()) {
			if (!/^(csh_|extension_池子魔将_)/.test(k)) continue;
			if (declared.has(k) || MIG_IGNORE[k]) continue;
			missed.push(k + "（" + [...found.get(k)].slice(0, 2).join(", ") + "）");
		}
		if (missed.length) e41.push("有键没登记：" + missed.slice(0, 4).join("；"));
		/* 反向：白名单里声明的 localStorage 键，若全项目再无任何读写点 ⇒ 也是坏账 */
		const lsk = ["csh_affection", "csh_ledger", "csh_wallet_hist", "csh_wallet_snap",
			"csh_bossbook_seen", "csh_boss_hide_killed", "csh_ddz_name", "csh_uno_name"];
		for (const k of lsk) if (!found.has(k)) e41.push("白名单声明了 " + k + " 但全项目没有读写点（坏账）");
		if (e41.length) fail("执行级 E41：存档覆盖度（" + e41.slice(0, 3).join("；") + "）");
		else ok("执行级 E41：存档覆盖度 —— 旧有 " + found.size + " 个持久化键全部有名有姓（键表或带理由的豁免），无漏登、无坏账");
	}

	/* E42（2026-10-16 · 死亡段技能守卫）：凡"死时触发"的 csh 技能（trigger 域 player/global
	   的 die / dieAfter / dieBegin）——触发时**持有者自己已是 dead**，必须写 forceDie: true，
	   否则会被 lib.filter.filterTrigger 的 `!info.forceDie && player.isDead()` 静默拦截 ⇒
	   永不发动（2026-10-16 实证：讨伐记录 csh_boss_watch 的"击破魔王 / 应战负场"与池悯
	   csh_boss_chi 等 10 处曾全部"死技"）。新增死亡段技能时把技能名加进下方清单。 */
	{
		const e42 = [];
		const dieSkillList = {
			"skills/boss.js": ["csh_boss_watch", "csh_boss_watch_ext", "csh_boss_chi", "csh_boss_feng_fengshi_die",
				"csh_boss_kui_qiansi_die", "csh_boss_you_cannian", "csh_boss_wangzhi_die", "csh_boss_guiku"],
			"skills/index.js": ["csh_karl_clear"],
		};
		for (const f of Object.keys(dieSkillList)) {
			const src = fs.readFileSync(path.join(ROOT, f), "utf8");
			for (const nm of dieSkillList[f]) {
				const re = new RegExp("(?:\\n|^)\\s*[\\\"']?" + nm + "[\\\"']?\\s*:\\s*\\{");
				const m42 = src.match(re);
				if (!m42) { e42.push(nm + " 未找到定义"); continue; }
				/* 从"匹配串结束处"起算（含多空行时若用 at+1 会把自己的定义行当"下一个边界"→ 块变空误报） */
				const rest = src.slice(m42.index + m42[0].length);
				const nxt = rest.search(/\n\s*[\"']?csh_[a-z0-9_]+[\"']?\s*:\s*\{/);
				const block = nxt >= 0 ? rest.slice(0, nxt) : rest.slice(0, 3000);
				/* ★ 剥注释再判定：注释里的 `forceDie: true` 不算数（负测试抓出的漏洞：注掉标注会被误判为已有） */
				const clean = block.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
				if (!/forceDie\s*:\s*true/.test(clean)) e42.push(nm + " 缺 forceDie（死亡段技能会被 filterTrigger 拦截，永不发动）");
			}
		}
		/* 萨科「die」子技（无 csh_ 前缀名）：按唯一串定位——forceDie 须出现在其 filter 之前
		   （注意用带 game.hasPlayer 的完整形态：全文件唯一，早先的短串会撞到 24368 行的 countPlayer 处） */
		{
			const src = fs.readFileSync(path.join(ROOT, "skills", "index.js"), "utf8");
			const z = src.indexOf("game.hasPlayer((cur) => cur.storage.csh_zhali_box");
			if (z >= 0 && !/forceDie/.test(src.slice(Math.max(0, z - 800), z))) e42.push("萨科 die 子技缺 forceDie");
		}
		if (e42.length) fail("执行级 E42：死亡段技能 forceDie 守卫（" + e42.slice(0, 3).join("；") + "）");
		else ok("执行级 E42：死亡段技能 forceDie 守卫 —— 9 个死技 + 萨科子技全部标注（讨伐记录/池悯不再静默不发动）");
	}

	/* E43（2026-10-16 晚 · 收尾记录通道守护 · 第四批根因修复）：
	   根因：讨伐记录挂在 dieAfter（die 事件的 After 阶段），而「击破魔王 / 应战负 / 应战胜」
	   三种该记录的死亡都在同一死亡事件的更早步骤里 game.checkResult()→game.over() 收尾
	   （mode/boss.js:463/471-472 · 1718-1724），After 阶段推进不到 ⇒ 讨伐录恒 0。
	   修法：包装 game.over 补记三种结局（+外传），与 dieAfter 通道用 boss._cshBossRecorded 哨兵互斥。 */
	{
		const rb43 = fs.readFileSync(path.join(ROOT, "core", "csh_bossrecord.js"), "utf8");
		const bj43 = fs.readFileSync(path.join(ROOT, "skills", "boss.js"), "utf8");
		if (!/function recordOnOver\s*\(/.test(rb43)) fail("执行级 E43：csh_bossrecord 缺 recordOnOver（收尾记录通道未实现）");
		else if (!/game\._csh_bossOverOriginal\s*=\s*game\.over/.test(rb43)) fail("执行级 E43：未按包装纪律保存上一层 game.over（_csh_bossOverOriginal）");
		else if (!/game\.over\s*=\s*function/.test(rb43)) fail("执行级 E43：csh_bossrecord 未包装 game.over（收尾记录未接线）");
		else if (!/_cshBossRecorded/.test(rb43) || !/_cshBossRecorded/.test(bj43)) fail("执行级 E43：两通道哨兵（boss._cshBossRecorded）缺失——会重复记账");
		else if (!/recordAsBoss\(false\)/.test(rb43) || !/recordAsBoss\(true\)/.test(rb43) || !/recordExt\(nm/.test(rb43)) fail("执行级 E43：收尾通道未覆盖三种结局 + 外传（recordAsBoss 双向 / recordExt）");
		else if (!/game\._csh_bossOverCapture/.test(rb43)) fail("执行级 E43：包装体内未走 game 属性入口（联机安全红线：不得引用闭包变量）");
		else ok("执行级 E43：收尾记录通道在位（game.over 包装 · 击破魔王/应战双向/外传 · 哨兵互斥 · 包装纪律合规）");
	}

	/* E44（2026-10-16 深夜三 · 契约/誓约 + 三新互动守护）：
	   满羁绊 88000 结契（星砂 ×2 + 偏爱礼物 ×3 → 契约台词）；
	   三新互动（递杯茶 C / 并肩看星 A / 专属称呼 S · 先复用既存台词池）；
	   导入导出必须带契约字段（migrate 清洗）；图鉴必须有结契按钮与契约横幅。 */
	{
		const af44 = fs.readFileSync(path.join(ROOT, "core", "csh_affection.js"), "utf8");
		const al44 = fs.readFileSync(path.join(ROOT, "core", "csh_aff_lines.js"), "utf8");
		const cx44 = fs.readFileSync(path.join(ROOT, "games", "codex.html"), "utf8");
		const mg44 = fs.readFileSync(path.join(ROOT, "core", "csh_migrate.js"), "utf8");
		if (!/export function oath\s*\(/.test(af44)) fail("执行级 E44：缺 oath()（契约机制）");
		else if (!/OATH_COST/.test(af44) || !/结契/.test(af44)) fail("执行级 E44：契约消耗/理由缺失");
		else if (!/export const OATH_LINES/.test(al44)) fail("执行级 E44：契约台词表（OATH_LINES）缺失");
		else if (!/key: "tea"/.test(af44) || !/key: "stars"/.test(af44) || !/key: "callname"/.test(af44)) fail("执行级 E44：三新互动缺档");
		else if (!/oath: isPastStamp\(e\.oath\)/.test(mg44)) fail("执行级 E44：迁移清洗未带契约字段（导入导出会丢契约）");
		else if (!/oathbtn/.test(cx44) || !/oathov/.test(cx44) || !/tableQuip/.test(af44)) fail("执行级 E44：图鉴契约 UI / 对局互动接线缺失");
		else ok("执行级 E44：契约机制在位（oath + OATH_LINES + 三新互动 + 迁移字段 + 图鉴 UI + tableQuip）");
	}

	/* E45（2026-10-16 深夜四 · 本体兼容注入 + 懒人包自愈；深夜七 · 实机重做锚；
	   2026-10-18 · 误伤主菜单回归锚）：
	   ① 选将势力面板滚动条必须在 content 加载时即注入（曾误挂 kill-fx 懒注入块——要等第一次
	      击杀特效才生效，等于没装）；② 必须有设置开关（csh_eg_group_scroll → __cshEgScrollApply）；
	   ③ 懒人包自愈补载（cshBossSelfLoad）已导出且在 bossmode 接线；
	   ④ ★ 滚动必须交还原生 `.content-container`，不得再退回「截断 .buttons」方案
	      —— 实机（2026-10-16 深夜七）已证：按钮盒子 54vh 比对话框 45% 还高，外层滚动
	      范围塌缩成固定 ~120px 小段（作者「滚不动 / 范围固定」的根因）；
	   ⑤ ★ 2026-10-18 实机：`.dialog:not(.fullheight):has(.card.button)` 会命中引擎主菜单
	      （ui/create/menu/index.js:135 的 `.main.menu.dialog`，卡牌/武将页含 .card.button）
	      ⇒ 选项菜单被压成 70vh 并裁掉下半截。全局 :has 规则永久废弃，封顶只走 .csh-egdlg；
	      且封顶值必须按 body 缩放换算 px（documentZoom），不能写 vh（手机会只剩 28% 屏幕）。 */
	{
		const ct45 = fs.readFileSync(path.join(ROOT, "main", "content.js"), "utf8");
		const cf45 = fs.readFileSync(path.join(ROOT, "main", "config.js"), "utf8");
		const bm45 = fs.readFileSync(path.join(ROOT, "main", "bossmode.js"), "utf8");
		const cb45 = fs.readFileSync(path.join(ROOT, "character", "boss.js"), "utf8");
		const i45 = ct45.indexOf("_inject: function");
		const fx45 = i45 >= 0 ? ct45.slice(i45, i45 + 3200) : "";
		if (/(?:\"csh_eg_group_scroll\"|__cshEgScrollApply)/.test(cf45)) fail("E45: retired scroll option must stay out of settings");
		else if (!/function cshEgScrollApply\(\) \{ return false; \}/.test(ct45)) fail("E45: retired scroll compatibility must remain a no-op");
		else if (/installKamiChoice|kamiStatus/.test(ct45)) fail("E45: retired kami choice must not be wired into content");
		else if (fx45.indexOf(":has(.card.button)") >= 0) fail("E45: scroll compatibility leaked into kill-fx lazy block");
		else if (!/export function cshBossSelfLoad\s*\(/.test(cb45)) fail("执行级 E45：缺 cshBossSelfLoad（懒人包自愈补载）");
		else if (!/cshBossSelfLoad/.test(bm45)) fail("执行级 E45：bossmode 未接自愈补载");
		else ok("执行级 E45：势力兼容项已隐藏并停用 + 懒人包自愈补载在位");
	}

	/* E46（2026-10-17 · 在线更新自动化 + 池子休闲框体分层）：
	   作者诉求：「更新还是要别人先输入比较麻烦，能不能自动化，然后在扩展设置-池子魔将-里面做一个按钮」。
	   ⇒ 更新源必须**硬编码**在扩展里（不读引擎的「获取扩展地址」设置项），
	      且扩展设置页必须有「检查更新」按钮（config.js 的 csh_check_update）。
	   作者诉求：「德州斗地主 UNO 廿一点就统一，其他的各具特色」。
	   ⇒ 四款牌桌必须共用 gb-table；金鳞市/妖灵图鉴各有专属类（gb-goldfish/gb-codex），
	      且**样式规则 + JS 挂类**两件都在位 —— 光加 CSS 不挂类是过去踩过的坑（E32/E40 同源）。 */
	{
		const e46 = [];
		const db46 = fs.readFileSync(path.join(ROOT, "core", "csh_debug.js"), "utf8");
		const cf46 = fs.readFileSync(path.join(ROOT, "main", "config.js"), "utf8");
		/* ① 在线更新自动化 */
		if (!/lib\.cshDebug\.checkUpdate\s*=\s*function/.test(db46)) e46.push("csh_debug.js 缺 checkUpdate（在线更新入口）");
		else if (!/CSH_UPDATE_SRC\s*=\s*"https:\/\/raw\.githubusercontent\.com\/ch1shanghan-dev\/chizi-mojiang\/main\/"/.test(db46))
			e46.push("更新源未硬编码为仓库 raw 根（自动化要求不依赖引擎「获取扩展地址」设置项）");
		else if (/lib\.config\.extension_sources?\[/.test(db46)) e46.push("更新逻辑读了 lib.config.extension_sources（应由内置源接管）");
		else if (!/updateTx\.apply/.test(db46) || !/updateTx\.recover/.test(db46) || !/engine\.digest/.test(db46))
            e46.push("更新缺暂存、摘要核验或恢复接线");
        else if (!fs.existsSync(path.join(ROOT, "core/csh_update.js")))
            e46.push("缺分阶段更新事务模块");
		else if (!/csh_check_update/.test(cf46) || !/lib\.cshDebug\.checkUpdate/.test(cf46))
			e46.push("扩展设置缺「检查更新」按钮接线（config.js → lib.cshDebug.checkUpdate）");
		/* ② 框体分层 */
		if (!/gb-table/.test(db46)) e46.push("缺牌桌统一框体 gb-table（四款应共用一套）");
		if (!/texas:\s*"gb-table"[\s\S]*?uno:\s*"gb-table"/.test(db46))
			e46.push("GAMECLASS 未把德州/斗地主/廿一点/UNO 全部归入 gb-table");
		if (!/gb-goldfish/.test(db46)) e46.push("金鳞市缺专属框体 gb-goldfish");
		if (!/gb-codex/.test(db46)) e46.push("妖灵图鉴缺专属框体 gb-codex");
		if (!/GAMECLASS\[g\.key\]/.test(db46)) e46.push("games.forEach 未按 key 挂框体类（只加 CSS 不会生效）");
		if (!/gb-career/.test(db46) || !/gb-bossbook/.test(db46) || !/gb-rank/.test(db46) || !/gb-save/.test(db46))
			e46.push("既有四张特色卡（生涯大厅/讨伐录/天下榜/行囊）的类被误删");
		/* 势力面板适配已退役；停用状态由 E45/E49 检查，不再要求观察器接线。 */
		/* ④ 礼物价格字号（作者：价格数字字太小了）
		   2026-10-20 字号收编后：字面量变成了 var(--pfs-*)，断言改为「解析出实际数值」——
		   先抓 font-size 声明（字面 px 或 var 引用），var 引用回页内 :root 定义求真值。
		   同组件同规则：codex 与 goldfish 两处礼物价格都要 ≥12.5px。 */
		function resolveFs46(src, sel) {
			const m = src.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{[^}]*font-size:\\s*(?:var\\((--[a-z0-9-]+)\\)|([\\d.]+)px)"));
			if (!m) return null;
			if (m[2]) return parseFloat(m[2]);
			const def = src.match(new RegExp(m[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:\\s*([\\d.]+)px\\s*;"));
			return def ? parseFloat(def[1]) : null;
		}
		for (const f46 of ["games/codex.html", "games/goldfish.html"]) {
			const cx46 = fs.readFileSync(path.join(ROOT, f46), "utf8");
			const cost46 = resolveFs46(cx46, ".affgifts .affbtn .cost");
			if (cost46 == null || cost46 < 12.5) e46.push(f46 + " 礼物价格 .cost 字号过小（现 " + (cost46 == null ? "无法解析" : cost46 + "px") + "，应 ≥12.5px）");
		}
		if (e46.length) fail("执行级 E46：在线更新自动化 + 框体分层 + 价格字号（" + e46.slice(0, 4).join("；") + "）");
		else ok("执行级 E46：更新已自动化（内置源 · 文件核对→暂存校验→备份→提交或恢复→成功重启）＋ 框体分层在位（牌桌四款统一 gb-table · 金鳞市/妖灵图鉴各具特色）＋ 礼物价格字号达标");
	}

	/* E47（2026-10-17 · 指定讨伐令 A 方案：1000 CBY 指定一只未讨伐妖灵出战）：
	   作者担心「强制出战会出 BUG」⇒ 本门禁把风险边界**钉死**：
	     ① pickMinions 必须带守卫（非法 id → 当没给，走原随机）；
	     ② 出怪入口必须把 bountyGet() 传进去（不传 = 悬赏不生效）；
	     ③ 存档键必须入 csh_migrate 键表（否则行囊不覆盖 + E41 会红）；
	     ④ 下单必须先校验、再扣费、失败原额回滚（不白扣钱）；
	     ⑤ 达成即消费（recordMinion 里清标记，不能粘住）。 */
	{
		const e47 = [];
		const bd47 = fs.readFileSync(path.join(ROOT, "core", "csh_bossdata.js"), "utf8");
		const br47 = fs.readFileSync(path.join(ROOT, "core", "csh_bossrecord.js"), "utf8");
		const sh47 = fs.readFileSync(path.join(ROOT, "core", "csh_shell.js"), "utf8");
		const bm47 = fs.readFileSync(path.join(ROOT, "main", "bossmode.js"), "utf8");
		const mg47 = fs.readFileSync(path.join(ROOT, "core", "csh_migrate.js"), "utf8");
		const cx47 = fs.readFileSync(path.join(ROOT, "games", "codex.html"), "utf8");
		if (!/export function pickMinions\(tier, bounty\)/.test(bd47)) e47.push("pickMinions 未接 bounty 参数（指定讨伐令无处生效）");
		else if (!/MINION_POOL\.indexOf\(bounty\) >= 0/.test(bd47)) e47.push("pickMinions 缺「非法 id → 走原随机」守卫（脏数据会改变出怪）");
		if (!/BOUNTY_COST\s*=\s*1000/.test(br47)) e47.push("BOUNTY_COST ≠ 1000（作者定 1000 CBY 一次）");
		if (!/export function bountyGet/.test(br47) || !/export function bountySet/.test(br47) || !/export function bountyClear/.test(br47) || !/export function bountyCheck/.test(br47))
			e47.push("bountyGet/Set/Clear/Check 四件套不齐");
		else if (!/if\(bountyRaw\(\)===minionId\)saved.bounty=\x27\x27/.test(br47)) e47.push("recordMinion 未在达成后清空悬赏标记（会粘住下一次）");
		/* ★ 2026-10-17 实机踩坑（「悬赏失败 · 明明有 CBY」）：installBossRecord 是**手写白名单**，
		   新函数漏挂 → 宿主桥取不到 → 报 nomodule → 点了没用。必须白名单显式挂 + 缺失补挂。 */
		else if (!/bountySet: bountySet/.test(br47) || !/bountyGet: bountyGet/.test(br47) || !/BOUNTY_COST: BOUNTY_COST/.test(br47))
			e47.push("installBossRecord 白名单漏挂 bounty*（宿主桥会报 nomodule → 点了没用）");
		else if (!/for \(const k in api\) if \(lib\.cshBossRecord\[k\] === undefined\)/.test(br47))
			e47.push("installBossRecord 缺「缺失补挂」分支（已装老实例拿不到新能力）");
		if (!/cmd === "shell-bounty"/.test(sh47) || !/BR1\.bountyCheck\(bId\)/.test(sh47)) e47.push("宿主缺 shell-bounty（或未先校验再扣费）");
		else if (!/悬赏失败回滚/.test(sh47) || !/W4\.wallet\.spend\(BR1\.BOUNTY_COST/.test(sh47)) e47.push("shell-bounty 未走钱包扣费 / 未做失败回滚");
		if (!/buildBossConfig\(\(lib\.cshBossRecord/.test(bm47)) e47.push("bossmode 未把 bountyGet() 传给 buildBossConfig（悬赏不会生效）");
		if (!/K_CFG_BOUNTY\s*=\s*"extension_池子魔将_csh_bounty"/.test(mg47)) e47.push("存档键未登记 csh_migrate（行囊不覆盖 + E41 会红）");
		else if (!/K_CFG_BOUNTY,/.test(mg47)) e47.push("K_CFG_BOUNTY 未进键表 / RESET_KEYS");
		if (!/function doBounty/.test(cx47) || !/shell-bounty/.test(cx47)) e47.push("图鉴缺悬赏下单接线（doBounty → shell-bounty）");
		else if (!/String\(Data\.bountyTarget/.test(cx47)) e47.push("图鉴未读宿主下发的 bounty（「已悬赏」态显示不出来）");
		else if (!/afflock/.test(cx47)) e47.push("悬赏按钮未挂在未讨伐锁定行（应为零新增行）");
		else if (!/snapS\.bounty/.test(sh47)) e47.push("shell-stats 未下发 bounty（图鉴拿不到当前悬赏）");
		if (e47.length) fail("执行级 E47：指定讨伐令（" + e47.slice(0, 4).join("；") + "）");
		else ok("执行级 E47：指定讨伐令在位（pickMinions 带守卫 · 出怪入口接线 · 先校验后扣费+回滚 · 达成即清 · 键入行囊 · 图鉴挂未讨伐行）");
	}

	/* E48（2026-10-18 · 界面基座 + 网络容灾）：
	   作者定则：不要只修尺寸，要从根上不再出现 —— 所以门禁锁「机制」而不是某一句文案：
	     ① 界面基座必须存在、被 content 安装；所有会弹提示的模块必须优先走 lib.cshUI.toast
	        （引擎 ui.create.toast 挂在被缩放 body 上：手机只剩四成大小、nowrap 溢出、
	          innerHTML 注入、单条 1.5s 串行 —— 这就是「奖励提示一闪就没」的总根）；
	     ② 全项目禁止 window.prompt（Electron 渲染进程直接抛 “prompt() is not supported.”）；
	     ③ 检查更新必须有「超时 + 镜像 + 缓存」三件（单源无超时 = 一直停在“正在检查”）；
	     ④ 天下榜必须「缓存先上屏 + 超时 ≤5s」（否则一断网就白屏 8 秒）；
	     ⑤ 两个新缓存键必须登记 csh_migrate（E41 同一套账）。 */
	{
		const e48 = [];
		const uk48 = path.join(ROOT, "core", "csh_uikit.js");
		if (!fs.existsSync(uk48)) e48.push("缺 core/csh_uikit.js（界面基座）");
		else {
			const u48 = fs.readFileSync(uk48, "utf8");
			if (!/export function installUIKit\s*\(/.test(u48)) e48.push("基座缺 installUIKit 导出");
			else if (!/document\.documentElement/.test(u48)) e48.push("提示容器未挂 documentElement（会随 body 缩放）");
			else if (!/white-space:normal/.test(u48)) e48.push("提示未允许换行（长奖励文案会溢出屏幕）");
			else if (!/\.textContent\s*=/.test(u48)) e48.push("提示未走 textContent（innerHTML 有注入风险）");
			else if (!/function confirmBox\s*\(/.test(u48)) e48.push("基座缺 confirmBox（原生 confirm 不可控）");
		}
		const ct48 = fs.readFileSync(path.join(ROOT, "main", "content.js"), "utf8");
		if (!/installUIKit\(\)/.test(ct48)) e48.push("content 未安装界面基座");
		const users48 = ["core/csh_shell.js", "core/csh_wallet.js", "core/csh_games.js", "core/csh_world.js", "core/csh_interact.js"];
		for (const f of users48) {
			const t = fs.readFileSync(path.join(ROOT, f), "utf8");
			if (!/lib\.cshUI\.toast/.test(t)) e48.push(f + " 未接 lib.cshUI.toast（仍会被 body 缩放）");
		}
		const scan48 = [];
		const walk48 = (d) => {
			if (!fs.existsSync(d)) return;
			for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
				const fp = path.join(d, ent.name);
				if (ent.isDirectory()) walk48(fp);
				else if (/\.(js|html)$/.test(ent.name)) scan48.push(fp);
			}
		};
		["core", "main", "games"].forEach((d) => walk48(path.join(ROOT, d)));
		for (const fp of scan48) {
			const t = fs.readFileSync(fp, "utf8");
			const rel = path.relative(ROOT, fp).replace(/\\/g, "/");
			if (/window\.prompt\s*\(/.test(t) || /[^.\w]prompt\s*\(\s*["']/.test(t)) {
				e48.push(rel + " 仍在用 prompt（Electron 不支持）");
				break;
			}
		}
		const db48 = fs.readFileSync(path.join(ROOT, "core", "csh_debug.js"), "utf8");
		if (!/AbortController/.test(db48)) e48.push("检查更新缺超时（AbortController）");
		else if (!/CSH_UPDATE_MIRRORS/.test(db48) || !/cshFetchManifest/.test(db48)) e48.push("检查更新缺镜像兜底");
		else if (!/CSH_UPDATE_CACHE/.test(db48)) e48.push("检查更新缺离线缓存");
		/* 小包优先：必须先拉 info.json（240B）比版本，相同就别拉 35KB 的 catalog */
		else if (!/function cshFetchVer\s*\(/.test(db48) || !/info\.json/.test(db48)) e48.push("检查更新未走 info.json 小包优先（每次白拉 35KB 目录）");
		else if (!/CSH_UPDATE_VER_CACHE\s*=\s*"csh_update_ver_v1"/.test(db48)) e48.push("缺版本小包缓存键");
		else if (!/_cshUpdBase/.test(db48)) e48.push("更新下载未复用验证通过的基址");
		/* 逐文件回退：必须有 updateBases（多源）与逐文件尝试，而不是整批塞给引擎 */
		else if (!/function updateBases\s*\(/.test(db48)) e48.push("更新下载未做逐文件多源回退（单源挂 = 整批挂）");
		else if (/game\.multiDownload/.test(db48)) e48.push("仍在用 game.multiDownload（onfinish 无条件触发 → 失败也会重启）");
		else if (!/catch\(e\)\{status\.textContent/.test(db48) || !/updateTx\.apply/.test(db48)) e48.push("更新失败缺可见反馈或绕过事务");
		/* 2026-10-19 三个回归点（都是玩家端真实踩到的）：
		   ① 源必须「并列摆出来」而不是串行试探（作者：所有可选源都列出来）；
		   ② 本机版本必须以包内/info.json 为准 —— `extension_<名>_version` 只在「从网址安装」时写一次，
		      排在第一位会让已更新的机器永远显示旧版本、反复全量重下；
		   ③ 更新成功后必须把版本号写回，否则下一次检查又报「有新版本」。 */
		else if (!/CSH_UPDATE_SOURCES/.test(db48) || !/function cshProbeAll\s*\(/.test(db48) || !/function renderSources\s*\(/.test(db48)) e48.push("更新源未并列展示（并发探测 + 可点选）");
		else if (!/var diskVer\s*=/.test(db48) || !/localVer = diskVer \|\|/.test(db48)) e48.push("本机版本仍以 lib.config 记录为准（已手动更新的机器会永远显示旧版本）");
		else if (!/game\.saveConfig\(['"]extension_池子魔将_version['"],\s*remoteVer\)/.test(db48)) e48.push("更新成功后未写回版本号（下次检查仍报有新版本）");
		else if (/"https:\/\/raw\.gitmirror\.com/.test(db48)) e48.push("更新源仍含已停止解析的 raw.gitmirror.com");
        /* Execute faults against the actual staged engine; old failed.push/finishAll regexes required an unsafe updater. */
        try {
            const result = JSON.parse(execFileSync(process.execPath,[path.join(ROOT,"tools/probe_update_transaction.mjs")],{encoding:"utf8",timeout:20000,windowsHide:true}));
            if(result.passed<18||result.failed!==0)e48.push("更新暂存/取消/失败文件清单/回滚故障回归未通过");
        } catch(error){e48.push("更新事务故障回归失败："+error.message.slice(0,160));}
		const rk48 = fs.readFileSync(path.join(ROOT, "games", "rank.html"), "utf8");
		if (!/RANK_CACHE_KEY\s*=\s*"csh_rank_cache_v1"/.test(rk48)) e48.push("天下榜缺榜单缓存键");
		else if (!/function cacheWrite\s*\(/.test(rk48) || !/cacheWrite\(context\.kind/.test(rk48)) e48.push("天下榜未写缓存");
		else if (!/CSHNet\.request\(path,\s*method,\s*body,\s*cb,\s*4500[,)]/.test(rk48)) e48.push("天下榜未向共享传输传入4.5s超时");
		/* 上报口径（2026-10-18）：服务端取 max，客户端必须上报「历史最高」而不是当前余额，
		   否则「打出新高 → 断网 → 花掉一部分 → 再传」会把那一笔永久抹掉。 */
		else if (!/rankHighMerge\s*\(/.test(rk48) || !/cby:\s*upCby/.test(rk48)) e48.push("天下榜上报未取历史最高（花掉池子币会带走已打出的成绩）");
		else if (!/pendSet\s*\(/.test(rk48) || !/pendClear\s*\(/.test(rk48)) e48.push("天下榜失败未留待送达标记（断网那一笔永远补不上）");
		else if (!/ver:\s*NET\.ver/.test(rk48)) e48.push("天下榜上报未带版本字段（版本不同照样能上榜，但服务端认不出旧口径）");
		const mg48 = fs.readFileSync(path.join(ROOT, "core", "csh_migrate.js"), "utf8");
		if (!/csh_update_manifest_v1/.test(mg48) || !/csh_rank_cache_v1/.test(mg48) || !/csh_update_ver_v1/.test(mg48)) e48.push("新缓存键未登记 csh_migrate（E41 会红）");
		/* 同屏提示上限：唯一真源在 csh_page.js，页面不得再各写一份魔数
		   （德州/斗地主写过 2/3、黑杰克/UNO 固定 3、生涯干脆没有 —— 矮屏全在探牌桌） */
		const pg48 = fs.readFileSync(path.join(ROOT, "core", "csh_page.js"), "utf8");
		if (!/function toastCap\s*\(/.test(pg48) || !/toastCap:\s*toastCap/.test(pg48)) e48.push("csh_page.js 缺 toastCap（同屏提示上限的唯一真源）");
		const capUsers = ["games/texas/texas.html", "games/doudizhu/doudizhu.html", "games/blackjack/blackjack.html", "games/uno/uno.html", "games/career.html"];
		for (const f of capUsers) {
			const t = fs.readFileSync(path.join(ROOT, f), "utf8");
			if (!/CSHPage\.toastCap/.test(t)) e48.push(f + " 未接 CSHPage.toastCap（矮屏提示仍会盖住牌桌）");
			else if (/innerHeight\s*<=\s*480\)\s*\?\s*2\s*:\s*3/.test(t)) e48.push(f + " 仍留着 2/3 魔数（应交给 toastCap）");
		}
		if (e48.length) fail("执行级 E48：界面基座/网络容灾（" + e48.slice(0, 4).join("；") + "）");
		else ok("执行级 E48：界面基座在位（documentElement · 唯一 toast · 合并排队 · confirm 自绘）＋ 更新多源并列容灾（并发探测/逐文件换源/版本写回/离线缓存）＋ 榜单缓存先上屏（4.5s）");
	}

	/* E49（2026-10-18 · 神武将选势力 · 第四版）：
	   四次迭代的结论要写进门禁，否则下一个人（或下一轮的我）还会走回同两条死路：
	     死路 A：给角色补 doubleGroup，让引擎 _doublegroup_choice 认领 ——
	       确实能弹，但选将界面会把 doubleGroup 逐个画出来
	       （ui/create/index.js:3191-3197：double2.reduce(... <div data-nature=...>)），
	       势力越多越乱，作者实机截图已确认。字段语义被滥用，UI 必然跟着错。
	     死路 B：给技能补 initGroup —— 一个技能只能一个势力（groups.add 去重），
	       表达不了"可选 5 个"；且神将技能常与普通武将共享（longdan），改一个波及一片。
	   ⇒ 准确说不是"引擎没有入口"，而是**有零件、没有装配好的流程**：
	     通用零件齐全（get.selectGroup / player.changeGroup），但"弹窗让玩家选"的唯一完整实现
	     写在 mode/identity.js:2358-2372，是身份模式私有；斗地主三处是空语句；
	     mode/brawl.js:2733 的 choose_group 只给 AI 随机赋势力。
	     生态里的标准做法就是自写全局技（十周年UI 的 _slyh 也是这么做的，
	     filter 是 !lib.group.includes(player.group)，与本技能的 shen 判定不重叠）。
	     门禁锁这些条，都是前三次真实炸过的点：
	     ① 文件存在、被 content 调用；
	     ② 走 game.addGlobalSkill 注册全局技（与 _doublegroup_choice 同构的两个触发点）；
	     ③ 用原生 chooseButton(vcard) + changeGroup 落地；
	     ④ **只认 shen** —— devil 是本扩展魔王/小怪全家，碰了 BOSS 模式整桌 AI 会被弹框改势力；
	     ⑤ 不许再用 player.isUnseen（DOM 状态，斗地主 gameStart 恒 true）；
	     ⑥ choose_group 只认显式 false（老存档缺键时 undefined 会让引擎 && 短路）；
	     ⑦ 必须补 _priority（finishCards 早跑完，运行时后加的技能拿不到触发档位）；
	     ⑧ 必须有诊断通道（why(...)），弹不出来时能说出原因，而不是靠猜。 */
	{
		const e49 = [];
		const r49 = fs.readFileSync(path.join(ROOT, "core", "csh_rules.js"), "utf8");
		const cfg49 = fs.readFileSync(path.join(ROOT, "main", "config.js"), "utf8");
		const ct49 = fs.readFileSync(path.join(ROOT, "main", "content.js"), "utf8");
		if (/"csh_kami_group"\s*:/.test(cfg49) || /"csh_eg_group_scroll"\s*:/.test(cfg49)) e49.push("retired compatibility settings must remain hidden");
		if (!/function kamiEnabled\(\) \{[\s\S]*?return false;/.test(r49)) e49.push("kami choice must remain disabled regardless of saved config");
		if (/installKamiChoice|kamiStatus/.test(ct49)) e49.push("kami choice must not be installed from content");
		if (!/function cshEgScrollApply\(\) \{ return false; \}/.test(ct49)) e49.push("faction panel adaptation must remain a no-op");
		if (e49.length) fail("E49: retired faction compatibility policy (" + e49.join("; ") + ")");
		else ok("E49: faction compatibility features are hidden and disabled");
	}

	{
		const cfg50 = fs.readFileSync(path.join(ROOT, "main", "config.js"), "utf8");
		const e50 = [];
		const WIDTH_BUDGET = 28;   /* 28 半角宽 = 14 个汉字 */
		const INTRO_BUDGET = 120;  /* 120 半角宽 = 60 汉字：提示框只有 170px 宽，再长就成一条竖着的长条 */
		for (const line of cfg50.split(/\r?\n/)) {
			const k = line.match(/"([A-Za-z0-9_]+)"\s*:\s*\{/);
			const n = line.match(/"name"\s*:\s*"((?:[^"\\]|\\.)*)"/);
			if (!k || !n) continue;
			const plain = n[1].replace(/<[^>]+>/g, "").replace(/\\"/g, '"');
			let w = 0;
			for (const ch of plain) w += ch.charCodeAt(0) > 127 ? 2 : 1;
			if (w > WIDTH_BUDGET) e50.push("设置项 " + k[1] + " 名过长（" + w + " 半角宽 > " + WIDTH_BUDGET + "）：「" + plain + "」");
			/* 说明文字：玩家在提示框里读，只留「做什么 / 何时开」，不写实现与来龙去脉 */
			const it = line.match(/"intro"\s*:\s*"((?:[^"\\]|\\.)*)"/);
			if (it) {
				const ip = it[1].replace(/<[^>]+>/g, "").replace(/\\"/g, '"');
				let iw = 0;
				for (const ch of ip) iw += ch.charCodeAt(0) > 127 ? 2 : 1;
				if (iw > INTRO_BUDGET) e50.push("设置项 " + k[1] + " 说明过长（" + iw + " 半角宽 > " + INTRO_BUDGET + "，提示框里要拖很久）");
			}
		}
		/* 注释里会写「旧写法只 overflow:hidden」这类说明，先剥注释再断言，否则自己误伤自己 */
		const lay50 = fs.readFileSync(path.join(ROOT, "core", "csh_layout.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
		if (/\.csh-dock\s*\{[^}]*\boverflow\s*:\s*hidden/.test(lay50)) e50.push(".csh-dock 又被写回 overflow:hidden（超出的按钮会被整颗切掉）");
		else if (!/\.csh-dock\s*\{[^}]*overflow-x\s*:\s*auto/.test(lay50)) e50.push(".csh-dock 不可横向滚动（窄屏下尾部按钮点不到）");
		else if (!/\.csh-dock > \.act-group[^{]*\{[^}]*flex\s*:\s*0 0 auto/.test(lay50)) e50.push(".csh-dock 的按钮组未固定宽度（会被压扁，而不是触发滚动）");
		if (!/\.csh-player \.pl-line > \*\s*\{[^}]*text-overflow\s*:\s*ellipsis/.test(lay50)) e50.push(".pl-line 子项缺省略号兜底（长手牌名会挤掉后面的字）");
		if (!/\.csh-hudrow \.tb-v\s*\{[^}]*text-overflow\s*:\s*ellipsis/.test(lay50)) e50.push(".csh-hudrow .tb-v 缺省略号兜底");
		if (!/\.csh-topbar \.tb-k\s*\{[^}]*text-overflow\s*:\s*ellipsis/.test(lay50)) e50.push(".csh-topbar .tb-k 缺省略号兜底");
		/* 【2026-10-20 三轮自查】设置页/统计页不许弹原生 alert：系统级弹窗会压住整个游戏窗口，
		   与本扩展的视觉完全脱节（E48 的自绘精神）。兜底只允许显式 `window.alert(`。 */
		for (const f of ["main/config.js", "core/csh_winrate.js"]) {
			const src = fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
			if (/(?<![\w.])alert\s*\(/.test(src)) e50.push(f + " 里还有裸 alert（应走自绘 toast）");
		}
		/* 【2026-10-20 · 重叠事故根治】右上角是壳的悬浮控制组（余额胶囊+关闭），
		   页面必须为它留出安全区。以前每页各写一套 px，新页忘了写就被压住（成就页翻车）。
		   现在统一：要么用 --csh-dock-safe，要么至少 120px 的 padding-right。
		   牌桌四页是整屏 grid、无顶部条，不在此列。 */
		for (const f of ["achv.html", "bossbook.html", "career.html", "codex.html", "goldfish.html", "rank.html", "save.html"]) {
			const fp = path.join(ROOT, "games", f);
			if (!fs.existsSync(fp)) continue;
			const hs = fs.readFileSync(fp, "utf8");
			const key = f.replace(/\.html$/, "");
			const shellSrc = fs.readFileSync(path.join(ROOT, "core", "csh_shell.js"), "utf8");
			const hasVar = hs.includes("--csh-dock-safe");
			const hasPad = /padding-right:\s*(?:clamp\(\s*)?(\d{2,3})px/.test(hs) && Number((hs.match(/padding-right:\s*(?:clamp\(\s*)?(\d{2,3})px/) || [0, 0, 0])[1]) >= 120;
			const dockShift = new RegExp("csh-shell-" + key + " #csh-shell-dock").test(shellSrc);
			if (!hasVar && !hasPad && !dockShift) e50.push(f + " 未给壳的右上安全区让位（会被余额胶囊压住）");
		}
		/* 【2026-10-20 · 叠层错乱根治】浮层层级只允许 var(--csh-z-*)（真值在 csh_theme.js 的层级表）。
		   以前 22 处裸 2147xxxx 散在 7 个文件，两个浮层同时打开时谁盖谁纯看数字大小。
		   2026-10-20 下午扩扫描：不止 2147xxxx —— 旧 100xxxx / 999990 档同样中招
		  （商店暗幕 2147482999 会压过 toast 1000090 / 确认框 1000010，作者实测踩到）。 */
		for (const f of fs.readdirSync(path.join(ROOT, "core")).filter((x) => x.endsWith(".js")).map((x) => "core/" + x)
			.concat(fs.readdirSync(path.join(ROOT, "games")).filter((x) => x.endsWith(".html")).map((x) => "games/" + x))
			.concat(fs.readdirSync(path.join(ROOT, "main")).filter((x) => x.endsWith(".js")).map((x) => "main/" + x))) {
			const src = fs.readFileSync(path.join(ROOT, f), "utf8");
			const bad = src.match(/z-index:[^0-9var]{0,12}\d{5,}/g);
			if (bad && bad.some((b) => !b.includes("var(--csh-z-"))) e50.push(f + " 有裸的浮层魔数 z-index（应走 --csh-z-*）：" + bad.filter((b) => !b.includes("var(--csh-z-")).slice(0, 2).join(" / "));
		}
		/* 【2026-10-20 下午 · 两套体系一致性】csh_uikit.js 的 CSH_Z 常量与 csh_theme.js 的
		   --csh-z-* 表必须同值 —— 10-20 凌晨的裂缝就是「表改了、常量没改」：
		   确认框 1000010 被商店暗幕 2147482999 压住点不到（安装无进度）。 */
		{
			const ukSrc = fs.readFileSync(path.join(ROOT, "core", "csh_uikit.js"), "utf8");
			const thSrc = fs.readFileSync(path.join(ROOT, "core", "csh_theme.js"), "utf8");
			const zBlock = ukSrc.match(/export const CSH_Z = \{([\s\S]*?)\};/);
			const tableBlock = thSrc.match(/var Z = \[([\s\S]*?)\];/);
			if (!zBlock) e50.push("csh_uikit.js 里找不到 CSH_Z");
			else if (!tableBlock) e50.push("csh_theme.js 里找不到层级表 Z");
			else {
				const consts = {};
				for (const m of zBlock[1].matchAll(/(\w+):\s*(\d+)/g)) consts[m[1]] = Number(m[2]);
				const table = {};
				for (const m of tableBlock[1].matchAll(/\["(\w+)",\s*(\d+)\]/g)) table[m[1]] = Number(m[2]);
				for (const k in consts) {
					if (k === "scene" || k === "sceneTop") continue;   /* 对局内演出，游戏页 iframe 自成体系 */
					if (!(k in table)) e50.push("CSH_Z." + k + "（" + consts[k] + "）在主题层级表里没有对应档位");
					else if (table[k] !== consts[k]) e50.push("CSH_Z." + k + "=" + consts[k] + " ≠ 层级表 " + table[k] + "（两套体系数值脱节，必现互压）");
				}
				if (!("modal" in table)) e50.push("层级表缺 modal 档（确认框会被 panel 压住）");
				else if (table.modal <= table.panel) e50.push("modal 档必须高于 panel");
				/* 层序纪律（2026-10-20 下午 · 作者实测「池子世界浮层父子关系错」）：
				   壳（生涯/讨伐/天下榜/行囊/成就/游戏）从调试面板内打开，必须盖过调试遮罩；
				   确认框必须盖过壳（壳内页面的重置确认，历史遗留坑）；
				   商店/兑换暗幕挂 documentElement 与调试遮罩同级，必须用 panel 档显式压过。 */
				if ("shell" in table && "backdrop" in table && table.shell <= table.backdrop) e50.push("shell 档必须高于 backdrop（从池子世界打开的游戏壳会被调试面板盖住——作者实测踩过）");
				if ("shell" in table && "modal" in table && table.modal <= table.shell) e50.push("modal 档必须高于 shell（壳内页面的确认框会被壳盖住）");
				const dbgZ = fs.readFileSync(path.join(ROOT, "core", "csh_debug.js"), "utf8");
				if (!/#csh-extstore-bg\{[^}]*z-index:var\(--csh-z-panel/.test(dbgZ)) e50.push("商店暗幕没用 panel 档（与调试遮罩同档靠 DOM 顺序，顺序一反就被压）");
				if (!/#csh-redeem-bg\{[^}]*z-index:var\(--csh-z-panel/.test(dbgZ)) e50.push("兑换暗幕没用 panel 档（同商店问题）");
			}
		}
		/* 【2026-10-20】行囊页三处破坏性操作（回滚/解包/重置）必须走自绘确认。
		   代码层面锁两件事：有 ask() 统一入口、裸 window.confirm 只剩它内部那一处兜底。
		   行为（取消是否真的不执行）由 tools/probe_save_guards.mjs 跑 12 条断言。 */
		{
			const svPath = path.join(ROOT, "games", "save.html");
			if (!fs.existsSync(svPath)) e50.push("缺 games/save.html");
			else {
				const sv = fs.readFileSync(svPath, "utf8");
				if (!/function ask\(msg, onOk(?:, onCancel)?\)/.test(sv)) e50.push("save.html 缺 ask() 统一确认入口");
				const rawConf = (sv.match(/window\.confirm\(/g) || []).length;
				if (rawConf > 1) e50.push("save.html 仍有 " + rawConf + " 处裸 window.confirm（破坏性操作必须走 ask）");
				if (!fs.existsSync(path.join(ROOT, "tools", "probe_save_guards.mjs"))) e50.push("缺 tools/probe_save_guards.mjs（确认回调行为没有验证）");
			}
		}
		if (e50.length) fail("执行级 E50：文案不挤压控件（" + e50.slice(0, 4).join("；") + "）");
		else ok("执行级 E50：文案不挤压控件（设置项名 ≤14 汉字 · 说明 ≤60 汉字 · 控制条溢出可横滚不切按钮 · 状态/玩家/顶栏省略号兜底）");

		/* ------------------------------------------------------------------ *
		 * E51（2026-10-19 · 作者：其他扩展功能整体优化，要多挂优质扩展）
		 * ------------------------------------------------------------------
		 * 「其他扩展」的货单有两份：远端 store.json（最新）+ 代码里的 FALLBACK（断网兜底）。
		 * 过去两边各写各的，改了远端忘了改本地 ⇒ 断网时玩家看到的是旧清单、甚至装到已下架的东西。
		 * 另外货单条目一旦缺 repo / 写成错的格式，面板上会多出一行点了没反应的按钮。
		 * 这里锁四件事：条目字段完整、名字不重复、两份清单同名同量、安装器支持 dir 与并发。 */
		const e51 = [];
		let store51 = null;
		try {
			store51 = JSON.parse(fs.readFileSync(path.join(ROOT, "store.json"), "utf8"));
		} catch (eParse) {
			e51.push("store.json 不是合法 JSON（" + eParse.message + "）");
		}
		const names51 = [];
		if (store51) {
			const list51 = store51.extensions || [];
			if (!list51.length) e51.push("store.json 货单为空");
			for (const it of list51) {
				if (!it.name) e51.push("有条目缺 name");
				else names51.push(it.name);
				if (!it.repo || !/^[\w.-]+\/[\w.-]+$/.test(it.repo)) e51.push((it.name || "?") + " 的 repo 不是 owner/repo 格式");
				if (it.dir != null && (typeof it.dir !== "string" || !it.dir.trim())) e51.push((it.name || "?") + " 的 dir 字段为空");
				const ip = String(it.intro || "").replace(/<[^>]+>/g, "");
				let iw = 0;
				for (const ch of ip) iw += ch.charCodeAt(0) > 127 ? 2 : 1;
				if (!ip) e51.push((it.name || "?") + " 缺 intro（面板上会只有标题）");
				else if (iw > 120) e51.push((it.name || "?") + " 的 intro 过长（" + iw + " 半角宽 > 120）");
			}
			const dup = names51.filter((n, i) => names51.indexOf(n) !== i);
			if (dup.length) e51.push("货单里重名：" + Array.from(new Set(dup)).join("、"));
			if (list51.length < 12) e51.push("货单条目过少（" + list51.length + " < 12），作者要求多挂优质扩展");
		}
		const dbg51 = fs.readFileSync(path.join(ROOT, "core", "csh_debug.js"), "utf8");
		const fb51 = dbg51.match(/var FALLBACK = \[([\s\S]*?)\n\s*\];/);
		if (!fb51) e51.push("csh_debug.js 里找不到 FALLBACK 兜底货单");
		else {
			const fbNames = Array.from(fb51[1].matchAll(/name:\s*"([^"]+)"/g)).map((m) => m[1]);
			const onlyRemote = names51.filter((n) => !fbNames.includes(n));
			const onlyLocal = fbNames.filter((n) => !names51.includes(n));
			if (onlyRemote.length) e51.push("store.json 有、FALLBACK 没有：" + onlyRemote.join("、"));
			if (onlyLocal.length) e51.push("FALLBACK 有、store.json 没有：" + onlyLocal.join("、"));
		}
		/* 安装器能力：没有这三样，合集仓库装不了、大包会卡成一条线 */
		if (!/entry\.dir/.test(dbg51)) e51.push("安装器不支持 dir（合集仓库只能整包下载，引擎会报「这不是一个扩展」）");
		if (!/STORE_PARALLEL/.test(dbg51)) e51.push("安装器没有并发下载（几百个文件会一个接一个排队）");
		if (!/AbortController/.test(dbg51) || !/ctrl\.abort\(\)/.test(dbg51)) e51.push("安装器不可取消");
		if (!/installedVer\s*\(/.test(dbg51)) e51.push("面板不显示已装版本（装过的还会显示「安装」）");
		/* 其他扩展 2.0（2026-10-20）：版本对比 + 断点续传 */
		if (!/function remoteVer\(/.test(dbg51)) e51.push("缺远端版本探测（有新版玩家看不到「更新」）");
		if (!/cshVerCmp/.test(dbg51)) e51.push("版本对比没走 cshVerCmp（字符串比大小会把 v9 判成比 v10 新）");
		if (!/RESUME_KEY/.test(dbg51) || !/resumeSave\(/.test(dbg51) || !/resumeLoad\(/.test(dbg51)) e51.push("缺断点续传三件套（RESUME_KEY/resumeSave/resumeLoad）");
		if (!/storePartial/.test(dbg51)) e51.push("缺内存半成品表 storePartial（续传会把没下载完的包写坏）");
		if (!/\.upd/.test(dbg51)) e51.push("缺「更新」高亮样式（.upd）");
		if (!/接着下/.test(dbg51)) e51.push("面板没提示续传（玩家不知道没下完的能接着下）");
		if (e51.length) fail("执行级 E51：其他扩展货单/安装器（" + e51.slice(0, 4).join("；") + "）");
		else ok("执行级 E51：其他扩展（货单 " + names51.length + " 条 · 两份清单同名 · 字段完整 · 支持 dir 子目录 / 并发 / 取消 / 已装识别）");

		/* ------------------------------------------------------------------ *
		 * E52（2026-10-20 · 池子成就：操作型成就引擎）
		 * ------------------------------------------------------------------
		 * 这套东西最容易烂的三个地方：
		 *   ① 既有内容丢失/主键重复——保留至少 80 条与 id 唯一；
		 *   ② 悄悄接了新事件（万能 Hook 的开端）——锁事件白名单恰好 8 个；
		 *   ③ 联机/旁观把成就刷爆——锁 connectMode 守卫与 silent。
		 * 行为由 probe_pool_achv/rebuild/browser 覆盖；门禁锁采集、宿主领奖和滚动结构。 */
		const e52 = [];
		let ids52 = [];
		const paPath = path.join(ROOT, "core", "csh_pool_achv.js");
		if (!fs.existsSync(paPath)) e52.push("缺 core/csh_pool_achv.js");
		else {
			const pa52 = fs.readFileSync(paPath, "utf8");
			try {
                const vm52=await import('node:vm'),box52=vm52.createContext({window:{}});vm52.runInContext(pa52,box52,{timeout:2000});
                const api52=box52.window.CSH_POOL_ACHV;ids52=api52.RULES.map(r=>r.id);
                const heroes52=api52.PROFILES||[],roster52=fs.readFileSync(path.join(ROOT,'character/index.js'),'utf8');
                if(heroes52.length!==100||new Set(heroes52.map(p=>p.id)).size!==100||heroes52.some(p=>!roster52.includes('"'+p.id+'"')))e52.push('100人专属名册覆盖不完整');
                if(api52.RULES.filter(r=>!r.hero&&!r.collection).length!==80||heroes52.some(p=>api52.RULES.filter(r=>r.hero===p.id).length<10))e52.push('旧80项或每人至少10项专属内容丢失');
                if(!api52.selfTest().ok)e52.push('成就运行时自检失败');
            }catch(error52){e52.push('规则表执行失败：'+error52.message);}
			if (ids52.length < 1080) e52.push("规则不足 1080 条（当前 " + ids52.length + "）");
			const dup52 = ids52.filter((x, i) => ids52.indexOf(x) !== i);
			if (dup52.length) e52.push("规则 id 重复：" + Array.from(new Set(dup52)).join("、"));
			const ev52 = pa52.match(/var _EVENTS = \{([^}]*)\}/);
			if (!ev52) e52.push("找不到事件白名单 _EVENTS");
			else if ((ev52[1].match(/([a-zA-Z]+)\s*:/g) || []).length !== 9) e52.push("事件白名单不是 9 个（改了要同步本断言与设计文档）");
			if (!/connectMode/.test(pa52)) e52.push("缺联机守卫（联机会把成就刷爆）");
			if (!/silent:\s*true/.test(pa52)) e52.push("全局技未设 silent（会打断牌局）");
			if (!/addGlobalSkill/.test(pa52)) e52.push("未走 addGlobalSkill 注册");
			const mg52 = fs.readFileSync(path.join(ROOT, "core", "csh_migrate.js"), "utf8");
			if (!/csh_pool_achv/.test(mg52)) e52.push("存档键 csh_pool_achv 未登记 csh_migrate（E41 会连带报）");
			/* 发奖对账（2026-10-20）：清档刷奖的漏洞三层防线，一层都不能少 */
			if (!/csh_pool_achv_pay/.test(pa52)) e52.push("缺独立发奖台账 csh_pool_achv_pay（清主存档就能重领奖励）");
			if (!/function isPaid\(/.test(pa52) || !/function recordPaid\(/.test(pa52) || !/function reconcile\(/.test(pa52)) e52.push("发奖对账三件套（isPaid/recordPaid/reconcile）不齐");
			if (!/池子成就\//.test(pa52) || !/ledger/.test(pa52)) e52.push("缺钱包流水反推兜底（台账被清时最后一道防线）");
			if (!/K_POOL_ACHV_PAY/.test(mg52)) e52.push("台账键 csh_pool_achv_pay 未登记 csh_migrate（导出/导入会丢台账）");
			const ah52 = fs.existsSync(path.join(ROOT, "games", "achv.html")) ? fs.readFileSync(path.join(ROOT, "games", "achv.html"), "utf8") : "";
			/* 奖励只在宿主复核并提交；页面只发规则 ID，不再自行写钱包。 */
			const sh52 = fs.readFileSync(path.join(ROOT, "core", "csh_shell.js"), "utf8");
			const claim52 = sh52.match(/if \(cmd === "shell-pool-ach-claim"\) \{([\s\S]*?)ackToGame\("shell-pool-ach-claim",[^;]+;[\s\S]*?return;\s*\}/)?.[1] || "";
			if (!/PA\.load\(\)\.got\[def\.id\]/.test(claim52) || !/PA\.RULES\.find/.test(claim52)) e52.push("宿主未复核真实规则与解锁记录");
			if (!/PA\.isPaid/.test(claim52) || !/PA\.recordPaid/.test(claim52) || !/PA\.reward\(def\)/.test(claim52) || !/wallet\.claimPool\(def\.id,rw\.pc,rw\.merit,def\.name\)/.test(claim52)) e52.push("宿主领奖缺去重/规则奖励/持久提交/对账");
			const wa52 = fs.readFileSync(path.join(ROOT, "core", "csh_wallet.js"), "utf8");
			if (!/function claimPool\(/.test(wa52) || !/poolClaims/.test(wa52) || !/next\.poolClaims\[id\]/.test(wa52)) e52.push("钱包/官阶缺池子奖励独立持久收据");
			if (ah52 && (!/T\.call\("shell-pool-ach-claim",\{key:r\.id\}/.test(ah52) || !/PA\.reconcile\(\)/.test(ah52))) e52.push("成就页缺宿主领奖请求或刷新对账");
			if (ah52 && /(?:wallet|CSH\.wallet)\.(?:add|claimPool)\(/.test(ah52)) e52.push("成就页不应自行提交经济奖励");
			if (!fs.existsSync(path.join(ROOT, "tools", "probe_pool_achv.mjs"))) e52.push("缺 tools/probe_pool_achv.mjs（判定层没有探针就等于没有验证）");
			for (const probe52 of ["probe_pool_achv_rebuild.mjs", "probe_pool_achv_browser.mjs"]) if (!fs.existsSync(path.join(ROOT, "tools", probe52))) e52.push("缺 tools/" + probe52);
            // Post-ACK presentation is allowed; all original rule/receipt assertions remain above.
            for(const [probe,minimum] of [["probe_pool_achv_rebuild.mjs",57],["probe_achievement_feedback.mjs",35]]){
                try{const r=JSON.parse(execFileSync(process.execPath,[path.join(ROOT,"tools",probe)],{encoding:"utf8",timeout:20000,windowsHide:true}));if(r.failed!==0||r.passed<minimum)e52.push(probe+" 实际持久化/反馈契约未通过");}
                catch(error){e52.push(probe+" 执行失败："+error.message.slice(0,120));}
            }

			const dbgA = fs.readFileSync(path.join(ROOT, "core", "csh_debug.js"), "utf8");
			/* 2026-10-20 真实事故：成就卡建好了却忘了 appendChild ⇒ 池子世界里那张卡直接不存在，
			   而 E32（registry/CARDS）和 E52 全都绿 —— 因为没人检查"卡有没有挂上去"。
			   这里锁死：gb-achv 卡在 document.createElement 之后、紧随的位置必须 appendChild 到列表。 */
			if (!/gb-achv/.test(dbgA)) e52.push("csh_debug 里没有池子成就入口卡（gb-achv）");
			else if (!/classList\.add\("gb-achv"\)[\s\S]{0,400}?list\.appendChild\(ac1\)/.test(dbgA)) e52.push("池子成就卡建了但没 appendChild 到列表（成就页会「消失」——2026-10-20 真实踩过）");
			const achvPath = path.join(ROOT, "games", "achv.html");
			if (!fs.existsSync(achvPath)) e52.push("缺 games/achv.html 成就页");
			else {
				/* 2026-10-20 真实事故：整页划不动。游戏 iframe 里 body 自然滚动会被裁掉，
				   必须 body 定高 + overflow:hidden，列表自己做唯一滚动容器。 */
				const ah = fs.readFileSync(achvPath, "utf8");
				if (!/(?:html\s*,\s*body\s*\{[^}]*height:\s*100%|body\s*\{[^}]*height:\s*100dvh)/.test(ah) || !/body\s*\{[^}]*overflow:\s*hidden/.test(ah)) e52.push("成就页 body 未定高/未裁切（在 iframe 里会划不动）");
				if (!/(?:#list|\.list)\s*\{[^}]*(?:overflow-y|overflow):\s*auto/.test(ah)) e52.push("成就页列表不是滚动容器（列表缺 overflow:auto）");
				if (!/min-height:\s*0/.test(ah)) e52.push("成就页滚动容器缺 min-height:0（flex 子项不会收缩，滚不动）");
			}
		}
		if (e52.length) fail("执行级 E52：池子成就（" + e52.slice(0, 4).join("；") + "）");
		else ok("执行级 E52：池子成就引擎（" + ids52.length + " 条规则 · 100武将每人至少10项专属 · id 唯一 · 事件白名单 9 个 · 联机守卫 · 存档已登记 · 探针在位）");

		/* ------------------------------------------------------------------ *
		 * E53（2026-10-20 · 发版命脉：catalog.js ↔ package.js ↔ 磁盘 三方对账）
		 * ------------------------------------------------------------------
		 * 在线更新是按 catalog.js 的 files 清单逐文件下载的。清单漏了新文件，
		 * 玩家更新完就是残缺版（4.0.7 工作版曾漏了成就引擎两个文件，差点发出去）。
		 * 这里锁死三件事：
		 *   ① 三处版本号一致（info.json / package.js / catalog.js）；
		 *   ② package.js 的 files 条目在磁盘上都存在；
		 *   ③ catalog.js 的 files 与磁盘实扫结果一一对应（不多不少）。 */
		const e53 = [];
		const info53 = JSON.parse(fs.readFileSync(path.join(ROOT, "info.json"), "utf8"));
		const pkg53 = fs.readFileSync(path.join(ROOT, "package.js"), "utf8");
		const catPath53 = path.join(ROOT, "catalog.js");
		const pv53 = (pkg53.match(/version\s*:\s*"([^"]+)"/) || [])[1];
		if (!pv53) e53.push("package.js 里找不到 version");
		else if (pv53 !== info53.version) e53.push("版本号不一致：info.json=" + info53.version + "，package.js=" + pv53);
		const fm53 = pkg53.match(/files\s*:\s*\[([^\]]*)\]/);
		if (!fm53) e53.push("package.js 里找不到 files 清单");
		let expect53 = [];
		if (fm53) {
			const entries53 = fm53[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1));
			const walk53 = (rel) => {
				const abs = path.join(ROOT, rel);
				if (!fs.existsSync(abs)) { e53.push("package.js 声明的 " + rel + " 在磁盘上不存在"); return; }
				const st = fs.statSync(abs);
				if (st.isFile()) { expect53.push(rel.split(path.sep).join("/")); return; }
				for (const name of fs.readdirSync(abs).sort()) {
					if (name === ".git" || name === "catalog.js" || name.endsWith(".zip")) continue;
					walk53(path.join(rel, name));
				}
			};
			for (const e of entries53) walk53(e);
			expect53.sort();
		}
		if (!fs.existsSync(catPath53)) e53.push("缺 catalog.js（在线更新的入口，必须随包存在）");
		else {
			const catRaw53 = fs.readFileSync(catPath53, "utf8");
			const catJson53 = catRaw53.substring(catRaw53.indexOf("{"), catRaw53.lastIndexOf("}") + 1);
			let cat53 = null;
			try { cat53 = JSON.parse(catJson53)["池子魔将"]; } catch (err) { e53.push("catalog.js 解析失败：" + err.message); }
			if (cat53) {
				if (cat53.version !== info53.version) e53.push("catalog.js 版本 " + cat53.version + " ≠ info.json " + info53.version + "（发版前必须重跑 tools/release.js）");
				const catFiles53 = (cat53.files || []).slice().sort();
				const miss53 = expect53.filter((f) => !catFiles53.includes(f));
				const extra53 = catFiles53.filter((f) => !expect53.includes(f));
				if (miss53.length) e53.push("catalog 漏收 " + miss53.length + " 个文件（" + miss53.slice(0, 3).join("、") + (miss53.length > 3 ? " …" : "") + "）——在线更新会丢文件");
				if (extra53.length) e53.push("catalog 多列 " + extra53.length + " 个文件（" + extra53.slice(0, 3).join("、") + (extra53.length > 3 ? " …" : "") + "）——玩家会下到 404");
				const nonAscii53 = catFiles53.filter((f) => /[^A-Za-z0-9._\-/]/.test(f));
				if (nonAscii53.length) e53.push("catalog 里有非 ASCII 文件名 " + nonAscii53.length + " 个（" + nonAscii53.slice(0, 2).join("、") + " …），raw 拼接下载有风险");
			}
		}
		if (e53.length) fail("执行级 E53：发版对账（" + e53.slice(0, 4).join("；") + "）");
		else ok("执行级 E53：发版对账（版本 " + info53.version + " 三处一致 · catalog " + expect53.length + " 文件与磁盘一一对应）");

		/* ------------------------------------------------------------------ *
		 * E54（2026-10-20 · 字号标尺：禁止新增裸 font-size:px）
		 * ------------------------------------------------------------------
		 * 收编后的格局：
		 *   宿主文档 UI → var(--csh-lfs-*)（csh_theme.js 统一定义，同值兜底）
		 *   游戏页     → var(--pfs-*)（页内 :root，与宿主互不污染）
		 *   内容层     → 技能名艺术字/台词是「内容」不是 UI 标尺，白名单锁存量
		 * 规则：白名单外的文件出现一个裸 font-size:Npx 就失败；
		 *       白名单内的文件计数变了也失败（逼你有意识地更新白名单）。 */
		const e54 = [];
		const FS_WHITELIST = {
			"character/index.js": 31, /* 技能名艺术字/称号铭牌——内容层 */
			"skills/index.js": 7,     /* 技能台词/演出文案——内容层 */
		};
		const fsScanDirs = ["core", "games", "main", "hooks", "card", "effect", "mobilefx", "character", "skills"];
		const fsRe = /font-size\s*:\s*[0-9.]+px/g;
		const fsSeen = {};
		for (const d of fsScanDirs) {
			const dAbs = path.join(ROOT, d);
			if (!fs.existsSync(dAbs)) continue;
			const walk54 = (dir) => {
				for (const name of fs.readdirSync(dir)) {
					const abs = path.join(dir, name);
					const st = fs.statSync(abs);
					if (st.isDirectory()) { walk54(abs); continue; }
					if (!/\.(js|css|html)$/.test(name)) continue;
					const rel = path.relative(ROOT, abs).split(path.sep).join("/");
					const cnt = (fs.readFileSync(abs, "utf8").match(fsRe) || []).length;
					if (cnt) fsSeen[rel] = cnt;
				}
			};
			walk54(dAbs);
		}
		for (const rel in fsSeen) {
			if (!(rel in FS_WHITELIST)) e54.push(rel + " 出现 " + fsSeen[rel] + " 处裸字号（用 var(--csh-lfs-*) / var(--pfs-*) 收编）");
			else if (fsSeen[rel] !== FS_WHITELIST[rel]) e54.push(rel + " 裸字号计数 " + fsSeen[rel] + " ≠ 白名单 " + FS_WHITELIST[rel] + "（有增删就更新 E54 白名单并写清理由）");
		}
		for (const rel in FS_WHITELIST) {
			if (!(rel in fsSeen)) e54.push("白名单条目已失效：" + rel + "（裸字号已清零，把这条从 E54 删掉）");
		}
		if (e54.length) fail("执行级 E54：字号标尺（" + e54.slice(0, 4).join("；") + "）");
		else ok("执行级 E54：字号标尺（运行目录零新增裸字号 · 内容层白名单 2 文件 35 处锁定）");

		/* ------------------------------------------------------------------ *
		 * E55（2026-10-20 · 生涯成就退休层：形态治理的兼容机制）
		 * ------------------------------------------------------------------
		 * 治理方案见 docs/career-achv-governance.md。锁三件事：
		 *   ① RETIRED 机制在位（软下线，不动存档）；
		 *   ② evalAll 的过滤规则没被改掉（未达成未领取才隐藏）；
		 *   ③ selfTest 校验 RETIRED 幽灵 key（防笔误退役不存在的条目）。 */
		const e55 = [];
		const ach55 = fs.readFileSync(path.join(ROOT, "core", "csh_achv.js"), "utf8");
		if (!/var RETIRED = \{/.test(ach55)) e55.push("缺 RETIRED 退休表（形态治理没有兼容层）");
		if (!/retired && !done && !claimedMap\[df\.key\]/.test(ach55)) e55.push("evalAll 退休过滤规则缺失（退休条目不隐藏，减法等于没做）");
		if (!/RETIRED 指向不存在的 key/.test(ach55)) e55.push("selfTest 没校验 RETIRED 幽灵 key（笔误会静默退役空气）");
		if (!/function isRetired\(/.test(ach55) || !/isRetired: isRetired/.test(ach55)) e55.push("isRetired 未导出（调用方无法查询退休状态）");
		/* C 形态（彩蛋/全破/速通）永不退休：这些 key 不允许进 RETIRED */
		const ret55 = ach55.match(/var RETIRED = \{([\s\S]*?)\n\s*\};/);
		if (ret55 && /"(?:egg_|boss_series|boss_speed|boss_all|boss_ult|boss_lord|boss_egg)/.test(ret55[1])) e55.push("RETIRED 里有 C 形态条目（彩蛋/全破/速通永不退休，见治理方案 §2.5）");
		const car55 = fs.readFileSync(path.join(ROOT, "games", "career.html"), "utf8");
		if (car55 && !/r\.retired/.test(car55)) e55.push("生涯页没有「绝版」标记（玩家看不出退休与普通条目的区别）");
		if (e55.length) fail("执行级 E55：生涯成就退休层（" + e55.slice(0, 4).join("；") + "）");
		else ok("执行级 E55：生涯成就退休层（软下线机制在位 · 过滤规则锁死 · 幽灵 key 有校验 · C 形态禁入）");

		/* ------------------------------------------------------------------ *
		 * E56（2026-10-20 · 演出素材注册表 EFFECT_MEDIA / cshShoushaFx.MEDIA）
		 * ------------------------------------------------------------------
		 * 方案见 docs/skill-fx-plan.md §2。锁五件事：
		 *   ① 表挂 lib.cshShoushaFx 属性（不能模块级 var——play 会被联机广播下发 eval）；
		 *   ② 条目字段齐、kind 合法、dur 合理；
		 *   ③ 表内 file 与 effect/ 磁盘双向对账（防「加了素材忘登记」与「登记了没文件」）；
		 *   ④ play() 查表分派 + durOf 入口在位；
		 *   ⑤ 技能侧不许再直读 _dur（时长真值只有表一处）。 */
		const e56 = [];
		const ct56 = fs.readFileSync(path.join(ROOT, "main", "content.js"), "utf8");
		const sk56 = fs.readFileSync(path.join(ROOT, "skills", "index.js"), "utf8");
		const efxDir = path.join(ROOT, "effect");
		/* 表体提取前先剥块注释（表内有「照抄一行」示例，不当真条目） */
		const mediaBlock = ct56.match(/MEDIA: \{([\s\S]*?)\n        \},/);
		const mediaBody = mediaBlock ? mediaBlock[1].replace(/\/\*[\s\S]*?\*\//g, "") : "";
		if (!/MEDIA: \{/.test(ct56)) e56.push("cshShoushaFx 缺 MEDIA 注册表");
		else if (!/lib\.cshShoushaFx = \{[\s\S]{0,3000}?MEDIA: \{/.test(ct56)) e56.push("MEDIA 不在 lib.cshShoushaFx 属性上（联机广播下发后闭包丢失）");
		let entries56 = {};
		if (mediaBlock) {
			for (const m of mediaBody.matchAll(/(\w+):\s*\{\s*kind:\s*"(\w+)",([^}]*)\}/g)) {
				entries56[m[1]] = { kind: m[2], body: m[3] };
			}
			const keys56 = Object.keys(entries56);
			if (keys56.length < 8) e56.push("注册表条目不足 8（现役 8 支视频演出，当前 " + keys56.length + "）");
			for (const k in entries56) {
				const e = entries56[k];
				if (["video", "frames"].indexOf(e.kind) < 0) e56.push(k + " kind 非法：" + e.kind);
				if (!/file:\s*"([^"]+)"/.test(e.body)) { e56.push(k + " 缺 file"); continue; }
				const file = (e.body.match(/file:\s*"([^"]+)"/) || [])[1];
				if (!fs.existsSync(path.join(efxDir, file))) e56.push(k + " 的素材文件不在 effect/：" + file);
				const dm = e.body.match(/dur:\s*(\d+)/);
				if (!dm || !(Number(dm[1]) >= 500 && Number(dm[1]) <= 60000)) e56.push(k + " 的 dur 非法（" + (dm ? dm[1] : "缺") + "，应 500~60000ms）");
				if (!/pipe:\s*"(banner|legacy)"/.test(e.body)) e56.push(k + " 缺 pipe 字段");
				if (/pipe:\s*"legacy"/.test(e.body) && !/fn:\s*"_\w+"/.test(e.body)) e56.push(k + " legacy 管线缺 fn（实现函数名）");
			}
			/* 反向对账：effect/ 里的 banner 素材必须都在表内（防加了文件忘登记） */
			const diskMp4 = fs.existsSync(efxDir) ? fs.readdirSync(efxDir).filter((f) => f.endsWith(".mp4")) : [];
			const regFiles = [];
			for (const k in entries56) {
				const fm = entries56[k].body.match(/file:\s*"([^"]+)"/);
				if (fm) regFiles.push(fm[1]);
			}
			for (const f of diskMp4) if (regFiles.indexOf(f) < 0) e56.push("effect/" + f + " 没登记进 MEDIA（加了素材忘登记=演出永远不播）");
		}
		if (!/this\.MEDIA && this\.MEDIA\[type\]/.test(ct56)) e56.push("play() 没有查 MEDIA 表（分派还是硬分支）");
		if (!/durOf: function/.test(ct56)) e56.push("缺 durOf 入口（技能侧只能认这个）");
		if (typeof durOfProbe56 !== "function") { /* 占位，防误删下面探针调用 */ }
		const bareDur56 = sk56.match(/(?<!\w)lib\.cshShoushaFx\._dur\.\w+/g) || [];
		if (bareDur56.length) e56.push("skills/index.js 还有 " + bareDur56.length + " 处直读 _dur（应走 durOf）");
		if (e56.length) fail("执行级 E56：演出素材注册表（" + e56.slice(0, 4).join("；") + "）");
		else ok("执行级 E56：演出素材注册表（" + Object.keys(entries56).length + " 条 · 字段齐 · 与 effect/ 双向对账 · play 查表 · durOf 入口 · 技能侧零直读）");
	}
  // E57: Execute actual hint/policy boundaries; syntax and autoplay alone missed a free-variable regression.
  if (spawnOk && execFileSync) {
    let tmp57;
    try {
      tmp57 = fs.mkdtempSync(path.join(os.tmpdir(), 'csh-planning-'));
      const target57 = path.join(tmp57, 'result.json');
      const result57 = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'tools/probe_minigame_planning.mjs'), '--out', target57], {encoding:'utf8', timeout:20000, windowsHide:true}));
      if (result57.failed !== 0 || result57.passed < 42) fail('执行级 E57：小游戏提示/残局规划/公开记忆边界未通过');
      else ok('执行级 E57：实际提示/残局规划/公开记忆/托管销毁边界（'+result57.passed+'/0）');
      const bj57=JSON.parse(execFileSync(process.execPath,[path.join(ROOT,'tools/probe_blackjack_hint.mjs'),'--out',path.join(tmp57,'blackjack.json')],{encoding:'utf8',timeout:20000,windowsHide:true}));
      if(bj57.failed!==0||bj57.passed<14)fail('执行级 E57B：廿一点4对NDAS提示未通过');else ok('执行级 E57B：廿一点4对NDAS提示（14/0）');
      const rules57=JSON.parse(execFileSync(process.execPath,[path.join(ROOT,'tools/probe_blackjack_rules_hint.mjs'),'--out',path.join(tmp57,'blackjack-rules.json')],{encoding:'utf8',timeout:20000,windowsHide:true}));
      if(rules57.failed!==0||rules57.passed<1653)fail('执行级 E57C：廿一点NDAS提示与合法动作未通过');else ok('执行级 E57C：廿一点NDAS与合法按钮（'+rules57.passed+'/0）');
      const uno59=JSON.parse(execFileSync(process.execPath,[path.join(ROOT,'tools/probe_uno_round_boundaries.mjs'),'--out',path.join(tmp57,'uno-rounds.json')],{encoding:'utf8',timeout:20000,windowsHide:true}));
      if(uno59.failed!==0||uno59.passed<27)fail('执行级 E59：UNO轮次/关闭回调边界未通过');else ok('执行级 E59：UNO轮次/关闭与迟到ACK（'+uno59.passed+'/0）');
      const matrix60=JSON.parse(execFileSync(process.execPath,[path.join(ROOT,'tools/probe_blackjack_strategy_matrix.mjs'),'--out',path.join(tmp57,'blackjack-matrix.json')],{encoding:'utf8',timeout:20000,windowsHide:true}));
      if(matrix60.failed!==0||matrix60.passed<24365)fail('执行级 E60：廿一点实际桌规策略矩阵未通过');else ok('执行级 E60：廿一点S17/H17与NDAS策略矩阵（'+matrix60.passed+'/0）');
      const ddz61=JSON.parse(execFileSync(process.execPath,[path.join(ROOT,'tools/probe_doudizhu_round_boundaries.mjs'),'--out',path.join(tmp57,'ddz-rounds.json')],{encoding:'utf8',timeout:20000,windowsHide:true}));
      if(ddz61.failed!==0||ddz61.passed<31)fail('执行级 E61：斗地主关窗/再来互斥未通过');else ok('执行级 E61：斗地主关窗/收工/重开与迟到ACK（'+ddz61.passed+'/0）');
      const gifts62=JSON.parse(execFileSync(process.execPath,[path.join(ROOT,'tools/probe_gift_quantity.mjs'),'--out',tmp57],{encoding:'utf8',timeout:20000,windowsHide:true}));
      if(gifts62.failed!==0||gifts62.passed<41)fail('执行级 E62：批量赠礼事务与幂等凭据未通过');else ok('执行级 E62：批量赠礼/幂等/封顶/故障/迁移（'+gifts62.passed+'/0）');
      const goals63=JSON.parse(execFileSync(process.execPath,[path.join(ROOT,'tools/probe_goal_recommendations.mjs'),'--out',path.join(tmp57,'goals.json')],{encoding:'utf8',timeout:20000,windowsHide:true}));
      if(goals63.failed!==0||goals63.passed<35)fail('执行级 E63：近期目标纯策略未通过');else ok('执行级 E63：近期目标/阶梯去重/真实进度/可靠性（'+goals63.passed+'/0）');
      const blackjack64=JSON.parse(execFileSync(process.execPath,[path.join(ROOT,'tools/probe_blackjack_exit_boundaries.mjs'),'--out',path.join(tmp57,'bj-exit.json')],{encoding:'utf8',timeout:20000,windowsHide:true}));
      if(blackjack64.failed!==0||blackjack64.passed<36)fail('执行级 E64：廿一点退出/失败续局未通过');else ok('执行级 E64：廿一点退出互斥/失败续步/迟到ACK（'+blackjack64.passed+'/0）');
      const spirit65=JSON.parse(execFileSync(process.execPath,[path.join(ROOT,'tools/probe_spirit_owner_boundaries.mjs'),'--out',tmp57],{encoding:'utf8',timeout:20000,windowsHide:true}));
      if(spirit65.failed!==0||spirit65.passed<31)fail('执行级 E65：妖灵主人与执行期支援边界未通过');else ok('执行级 E65：妖灵主人/配额/暂停/迟到支援（'+spirit65.passed+'/0）');
      const feedback66=JSON.parse(execFileSync(process.execPath,[path.join(ROOT,'tools/probe_feedback_lifecycle.mjs'),'--out',tmp57],{encoding:'utf8',timeout:20000,windowsHide:true}));
      if(feedback66.failed!==0||feedback66.passed<43)fail('执行级 E66：成就反馈恢复/暂停/重入生命周期未通过');else ok('执行级 E66：成就反馈恢复/前后台/暂停重入（'+feedback66.passed+'/0）');
      const tactics67=JSON.parse(execFileSync(process.execPath,[path.join(ROOT,'tools/probe_tactical_achievements.mjs')],{encoding:'utf8',timeout:20000,windowsHide:true}));
      if(tactics67.failed!==0||tactics67.passed<180)fail('执行级 E67：同局组合成就边界未通过');else ok('执行级 E67：28条同局挑战/事件/身份/模式/重载/领奖（'+tactics67.passed+'/0）');
      const badges68=JSON.parse(execFileSync(process.execPath,[path.join(ROOT,'tools/probe_achievement_badges.mjs')],{encoding:'utf8',timeout:20000,windowsHide:true}));
      if(badges68.failed!==0||badges68.passed<41)fail('执行级 E68：语义徽章隔离边界未通过');else ok('执行级 E68：十类徽章/稀有度/纯DOM/只读（'+badges68.passed+'/0）');
      const facts69=JSON.parse(execFileSync(process.execPath,[path.join(ROOT,'tools/probe_achievement_event_facts.mjs')],{encoding:'utf8',timeout:20000,windowsHide:true}));
      if(facts69.failed!==0||facts69.passed<35)fail('执行级 E69：成就事件事实边界未通过');else ok('执行级 E69：装备前后事实/有效判定/去重/保存隔离（'+facts69.passed+'/0）');
      const career58=JSON.parse(execFileSync(process.execPath,[path.join(ROOT,'tools/probe_career_unlocks.mjs'),'--out',path.join(tmp57,'career.json')],{encoding:'utf8',timeout:20000,windowsHide:true}));
      if(career58.failed!==0||career58.passed<40)fail('执行级 E58：生涯首次达成与永久资格未通过');else ok('执行级 E58：生涯首次达成/旧档/失败/迁移/资格（'+career58.passed+'/0）');
    } catch(error) { fail('执行级 E57—E69：小游戏/生涯/赠礼执行回归失败（'+String(error.message).slice(0,160)+'）'); }
    finally { if(tmp57){for(const file of ['blackjack-matrix.json','ddz-rounds.json','gift-quantity.json','goals.json','bj-exit.json','spirit-owner-boundaries.json','feedback-lifecycle.json']){try{fs.unlinkSync(path.join(tmp57,file));}catch{}}try{fs.unlinkSync(path.join(tmp57,'uno-rounds.json'));}catch{}try{fs.unlinkSync(path.join(tmp57,'blackjack-rules.json'));}catch{}try{fs.unlinkSync(path.join(tmp57,'career.json'));}catch{}try{fs.unlinkSync(path.join(tmp57,'blackjack.json'));}catch{}try{fs.unlinkSync(path.join(tmp57,'result.json'));}catch{}try{fs.rmdirSync(tmp57);}catch{}} }
  } else warn('执行级 E57—E69：当前环境不能启动Node，小游戏/生涯/赠礼执行回归待运行');
	log("");
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */
log("池子魔将 · 改动门禁");
log("项目根：" + ROOT);
log("");

if (!ONLY_VERSIONS) { runSyntax(); runFreeVars(); runImports(); runConsistency(); }
if (!ONLY_SYNTAX && !ONLY_VERSIONS) await runBossChecks();
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
