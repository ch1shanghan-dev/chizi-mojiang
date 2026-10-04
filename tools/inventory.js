#!/usr/bin/env node
/**
 * 池子魔将 · 结构清单生成器（纯静态分析，只读，不执行扩展代码）
 *
 * 用途：把 extension.js 的 package 对象量化成可审核的清单，
 *      为「拆分优先级」「技能审计范围」「缩进整改」提供依据。
 *
 * 用法：
 *   node tools/inventory.js                 # 打印摘要到 stdout
 *   node tools/inventory.js --md            # 输出 Markdown 全文
 *   node tools/inventory.js --top 30        # 最长技能榜取前 30
 *   node tools/inventory.js --out FILE      # 写入文件（相对项目根）
 *   node tools/inventory.js --skills        # 额外列出全部技能名（长）
 *
 * 设计约束（与 README「只读优先」一致）：
 *   - 不 import / 不 eval 任何扩展源码
 *   - 不写回任何业务文件，--out 仅写报告
 *
 * 重要：层级判定用**括号深度**而不是缩进。
 *   本项目存在大量自动生成的代码（如 29798 行起的「外部技能独立化」段），
 *   技能名缩进 12 空格、属性却缩进 4 空格。JS 引擎不敏感缩进，功能正常，
 *   但任何基于缩进的静态分析都会得出错误结论——曾经把 3 万行的 skill 块
 *   误判成在 29800 行结束，技能数被少算一个数量级。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/* 无名杀 app/ 根目录的 package.json 声明了 "type":"module"，
   因此 tools/ 下脚本也必须是 ESM，不能用 require / __dirname。 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "extension.js");

const argv = process.argv.slice(2);
const flag = (name, def) => {
	const i = argv.indexOf(name);
	return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const has = (name) => argv.includes(name);
const WANT_MD = has("--md");
const WANT_SKILLS = has("--skills");
const TOP_N = parseInt(flag("--top", "20"), 10) || 20;
const OUT = flag("--out", "");

if (!fs.existsSync(SRC)) {
	console.error("[inventory] 找不到 extension.js：" + SRC);
	process.exit(1);
}

const src = fs.readFileSync(SRC, "utf8");

/* ------------------------------------------------------------------ *
 * 1. 字符级扫描：计算括号深度，跳过字符串 / 注释 / 模板串
 *    记录每个 '{' 的 { line, col, depthAfter }
 * ------------------------------------------------------------------ */
function scan(srcText) {
	const braces = []; // { line, col, depthAfter }
	let depth = 0;
	let line = 1;
	let col = 0;
	let state = "normal"; // normal | sq | dq | tpl | lc | bc
	const n = srcText.length;
	let i = 0;
	/* 每行的起始深度与缩进，用于缩进一致性检查 */
	const lineStartDepth = [0];
	const lineIndent = [0];
	let curIndent = 0;
	let seenNonSpace = false;

	while (i < n) {
		const c = srcText[i];
		const d = srcText[i + 1];

		/* 换行处理必须放在最前面：注释、字符串、模板串内部的换行同样要推进行号，
		   否则后续所有行号都会错位（曾经导致 package 块定位失败）。 */
		if (c === "\n") {
			line++;
			col = 0;
			lineStartDepth.push(depth);
			lineIndent.push(0);
			curIndent = 0;
			seenNonSpace = false;
			/* 行注释到行尾结束；单/双引号字符串不能合法跨行，遇到换行说明未闭合，容错退出 */
			if (state === "lc" || state === "sq" || state === "dq") state = "normal";
			/* 模板串允许跨行，保持 tpl 状态 */
			i++;
			continue;
		}

		if (state === "normal") {
			if (c === " " || c === "\t") {
				if (!seenNonSpace) curIndent += c === "\t" ? 4 : 1;
				col++;
				i++;
				continue;
			}
			seenNonSpace = true;
			if (c === "/" && d === "/") { state = "lc"; i += 2; col += 2; continue; }
			if (c === "/" && d === "*") { state = "bc"; i += 2; col += 2; continue; }
			if (c === "'") { state = "sq"; i++; col++; continue; }
			if (c === '"') { state = "dq"; i++; col++; continue; }
			if (c === "`") { state = "tpl"; i++; col++; continue; }
			if (c === "{") {
				depth++;
				braces.push({ line, col, depthAfter: depth });
				i++; col++;
				continue;
			}
			if (c === "}") { depth--; i++; col++; continue; }
			i++; col++;
			continue;
		}

		if (state === "lc") {
			if (c === "\n") state = "normal";
			i++;
			continue;
		}
		if (state === "bc") {
			if (c === "*" && d === "/") { state = "normal"; i += 2; col += 2; continue; }
			i++; col++;
			continue;
		}
		/* 字符串 / 模板串：内部花括号不参与深度统计（成对出现，整体自平衡） */
		if (state === "sq" || state === "dq" || state === "tpl") {
			const q = state === "sq" ? "'" : state === "dq" ? '"' : "`";
			if (c === "\\") { i += 2; col += 2; continue; }
			if (c === q) { state = "normal"; i++; col++; continue; }
			i++; col++;
			continue;
		}
		i++; col++;
	}

	return { braces, lineStartDepth, lineIndent, finalDepth: depth };
}

const { braces, lineStartDepth, lineIndent, finalDepth } = scan(src);

const lines = src.split(/\r?\n/);
const total = lines.length;
const bytes = Buffer.byteLength(src, "utf8");

/* ------------------------------------------------------------------ *
 * 2. 关联  key: {  /  "key": {  与其括号深度
 * ------------------------------------------------------------------ */
const KEY_RE = /^([ \t]*)(?:"([^"]+)"|([A-Za-z_$][\w$]*))[ \t]*:[ \t]*\{/;
const nodes = [];
for (let li = 0; li < lines.length; li++) {
	const m = lines[li].match(KEY_RE);
	if (!m) continue;
	const braceCol = m[0].length - 1; // '{' 在匹配串末尾
	const ev = braces.find((b) => b.line === li + 1 && b.col === braceCol);
	if (!ev) continue;
	nodes.push({
		name: m[2] || m[3],
		line: li + 1,
		depth: ev.depthAfter,
		indent: m[1].replace(/\t/g, "    ").length,
	});
}

/* package 块：找 package:{ 那一行的括号深度 */
let pkgNode = null;
for (let i = 0; i < lines.length; i++) {
	const m = lines[i].match(/package[ \t]*:[ \t]*\{/);
	if (!m) continue;
	const braceCol = m.index + m[0].length - 1;
	const ev = braces.find((b) => b.line === i + 1 && b.col === braceCol);
	if (ev) { pkgNode = { name: "package", line: i + 1, depth: ev.depthAfter }; break; }
}
if (!pkgNode) {
	console.error("[inventory] 未定位到 package 块，请检查 extension.js 结构");
	process.exit(1);
}

const PKG_DEPTH = pkgNode.depth;
const blocks = nodes.filter((n) => n.line > pkgNode.line && n.depth === PKG_DEPTH + 1);

/** 行范围：到下一个「深度 <= 自身深度」的节点为止，或文件末尾 */
function rangeOf(node) {
	const idx = nodes.indexOf(node);
	let end = total;
	for (let j = idx + 1; j < nodes.length; j++) {
		if (nodes[j].depth <= node.depth) { end = nodes[j].line - 1; break; }
	}
	return { start: node.line, end };
}

function childrenOf(node) {
	const r = rangeOf(node);
	const inner = nodes.filter((n) => n.line > node.line && n.line <= r.end);
	if (!inner.length) return [];
	const min = inner.reduce((a, n) => Math.min(a, n.depth), Infinity);
	return inner.filter((n) => n.depth === min);
}

/** 无名杀分包格式是双层：character:{character:{...}} / card:{card:{...}} / skill:{skill:{...}} */
function entitiesOf(node) {
	const kids = childrenOf(node);
	const container = kids.find((k) => k.name === node.name);
	return container ? childrenOf(container) : kids;
}

const span = (k) => {
	const kr = rangeOf(k);
	return { name: k.name, start: kr.start, end: kr.end, rows: kr.end - kr.start + 1 };
};

const report = blocks.map((b) => {
	const r = rangeOf(b);
	const kidSpans = childrenOf(b).map(span);
	const entSpans = entitiesOf(b).map(span);
	const body = lines.slice(r.start - 1, r.end);
	/* 缩进一致性：期望缩进 = (depth-1)*4，偏差 > 4 空格视为排版错乱 */
	let off = 0;
	for (const L of body) {
		if (!L.trim() || /^\s*\/\//.test(L) || /^\s*\*/.test(L)) continue;
		const ind = (L.match(/^[ \t]*/) || [""])[0].replace(/\t/g, "    ").length;
		if (Math.abs(ind - b.depth * 4) > 4) off++;
	}
	return {
		name: b.name,
		start: r.start,
		end: r.end,
		rows: r.end - r.start + 1,
		depth: b.depth,
		children: kidSpans.length,
		kids: kidSpans,
		entities: entSpans.length,
		ents: entSpans,
		indentOff: off,
	};
});

const byName = {};
for (const b of report) {
	byName[b.name] = byName[b.name] || { rows: 0, entities: 0, count: 0, indentOff: 0 };
	byName[b.name].rows += b.rows;
	byName[b.name].entities += b.entities;
	byName[b.name].indentOff += b.indentOff;
	byName[b.name].count += 1;
}

const findBlock = (n) => report.find((b) => b.name === n);
const charBlock = findBlock("character");
const cardBlock = findBlock("card");
const skillBlock = findBlock("skill");

const pct = (x) => ((x / total) * 100).toFixed(1) + "%";
const mb = (x) => (x / 1024 / 1024).toFixed(2) + "MB";

/* ------------------------------------------------------------------ *
 * 3. 输出
 * ------------------------------------------------------------------ */
const out = [];
const P = (s = "") => out.push(s);

P("# 池子魔将 · extension.js 结构清单");
P("");
P("> 由 `tools/inventory.js` 自动生成 · " + new Date().toISOString());
P("> 层级判定基于**括号深度**（非缩进），纯静态解析，不代表运行时行为。");
P("");
P("## 一、文件规模");
P("");
P("| 指标 | 数值 |");
P("| --- | --- |");
P("| 总行数 | " + total + " |");
P("| 文件体积 | " + mb(bytes) + " |");
P("| package 起始行 | " + pkgNode.line + " |");
P("| package 括号深度 | " + PKG_DEPTH + " |");
P("| 全文括号是否平衡 | " + (finalDepth === 0 ? "是（finalDepth=0）" : "否（finalDepth=" + finalDepth + "）") + " |");
P("");

P("## 二、package 直接子块");
P("");
P("| 区块 | 起止行 | 行数 | 占比 | 实体数 | 排版错乱行 |");
P("| --- | --- | --- | --- | --- | --- |");
for (const b of report) {
	P("| `" + b.name + "` | " + b.start + "–" + b.end + " | " + b.rows + " | " + pct(b.rows) + " | " + b.entities + " | " + b.indentOff + " |");
}
P("");

P("## 三、按区块名合并");
P("");
P("| 区块名 | 出现次数 | 总行数 | 占比 | 实体总数 | 排版错乱行 |");
P("| --- | --- | --- | --- | --- | --- |");
for (const name of Object.keys(byName).sort((a, b) => byName[b].rows - byName[a].rows)) {
	const v = byName[name];
	P("| `" + name + "` | " + v.count + " | " + v.rows + " | " + pct(v.rows) + " | " + v.entities + " | " + v.indentOff + " |");
}
P("");

P("## 四、实体口径（下钻到分包内层后的真实数量）");
P("");
P("| 类别 | 解析路径 | 数量 |");
P("| --- | --- | --- |");
if (charBlock) P("| 武将 | package.character.character | " + charBlock.entities + " |");
if (cardBlock) P("| 卡牌 | package.card.card | " + cardBlock.entities + " |");
if (skillBlock) P("| 技能 | package.skill.skill | " + skillBlock.entities + " |");
P("");

if (skillBlock) {
	P("## 五、最长技能 Top " + TOP_N + "（拆分优先级参考）");
	P("");
	P("| # | 技能 | 起止行 | 行数 |");
	P("| --- | --- | --- | --- |");
	skillBlock.ents.slice().sort((a, b) => b.rows - a.rows).slice(0, TOP_N).forEach((k, i) => {
		P("| " + (i + 1) + " | `" + k.name + "` | " + k.start + "–" + k.end + " | " + k.rows + " |");
	});
	P("");

	const big = skillBlock.ents.filter((k) => k.rows >= 200).length;
	const mid = skillBlock.ents.filter((k) => k.rows >= 80 && k.rows < 200).length;
	const small = skillBlock.ents.filter((k) => k.rows < 80).length;
	P("### 技能规模分档");
	P("");
	P("| 档位 | 行数区间 | 数量 |");
	P("| --- | --- | --- |");
	P("| 巨型（优先拆分） | >= 200 | " + big + " |");
	P("| 中型 | 80–199 | " + mid + " |");
	P("| 小型 | < 80 | " + small + " |");
	P("");

	if (WANT_SKILLS) {
		P("### 全部技能名");
		P("");
		P("```");
		skillBlock.ents.forEach((k) => P(k.name));
		P("```");
		P("");
	}
}

P("## 六、排版错乱诊断");
P("");
P("> 判定口径：某行的实际缩进与「括号深度 × 4」偏差超过 4 空格即计入。");
P("> JS 引擎不敏感缩进，**不影响运行**，但会让基于缩进的静态分析整体失效，");
P("> 且通常是自动生成代码（脚本批量产出）留下的痕迹，应优先格式化。");
P("");
const messy = report.filter((b) => b.indentOff > 0).sort((a, b) => b.indentOff - a.indentOff);
if (messy.length) {
	P("| 区块 | 起止行 | 错乱行数 | 占该块比例 |");
	P("| --- | --- | --- | --- |");
	for (const b of messy) {
		P("| `" + b.name + "` | " + b.start + "–" + b.end + " | " + b.indentOff + " | " +
			((b.indentOff / b.rows) * 100).toFixed(1) + "% |");
	}
} else {
	P("无。全文缩进与括号深度一致。");
}
P("");

const text = out.join("\n");

if (OUT) {
	fs.writeFileSync(path.resolve(ROOT, OUT), text, "utf8");
	console.log("[inventory] 已写入 " + OUT);
} else if (WANT_MD) {
	console.log(text);
} else {
	console.log("=== 池子魔将 · extension.js 结构摘要 ===");
	console.log("总行数      : " + total + "（" + mb(bytes) + "）");
	console.log("package起点 : 第 " + pkgNode.line + " 行，括号深度 " + PKG_DEPTH);
	console.log("括号平衡    : " + (finalDepth === 0 ? "OK" : "不平衡 finalDepth=" + finalDepth));
	console.log("");
	console.log("区块分布（按行数降序）:");
	for (const name of Object.keys(byName).sort((a, b) => byName[b].rows - byName[a].rows)) {
		const v = byName[name];
		console.log("  " + name.padEnd(14) + " x" + String(v.count).padStart(2) +
			"  " + String(v.rows).padStart(6) + " 行  " + pct(v.rows).padStart(6) +
			"  实体 " + String(v.entities).padStart(4) +
			"  排版错乱 " + v.indentOff);
	}
	console.log("");
	console.log("实体数：武将 " + (charBlock ? charBlock.entities : "?") +
		" / 卡牌 " + (cardBlock ? cardBlock.entities : "?") +
		" / 技能 " + (skillBlock ? skillBlock.entities : "?"));
	if (skillBlock) {
		console.log("");
		console.log("最长技能 Top 5:");
		skillBlock.ents.slice().sort((a, b) => b.rows - a.rows).slice(0, 5).forEach((k, i) => {
			console.log("  " + (i + 1) + ". " + k.name.padEnd(28) + k.rows + " 行 (" + k.start + "–" + k.end + ")");
		});
	}
	console.log("");
	console.log("（完整 Markdown 加 --md；写入文件用 --out 文件名）");
}
