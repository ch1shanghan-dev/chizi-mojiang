#!/usr/bin/env node
/**
 * 池子魔将 · 动皮资源完整性自检
 *
 * 用法：
 *   node tools/check-dynamic-integrity.mjs             # 校验（默认，不写任何文件）
 *   node tools/check-dynamic-integrity.mjs --freeze    # 生成/更新 dynamic-integrity.lock.json
 *   node tools/check-dynamic-integrity.mjs --quiet     # 只输出问题与总结
 *
 * 校验项
 *   A. 注册表 vs 资源目录：cshDynamicSkins ⟷ cshDynamicDirs 双向一一对应
 *   B. 单键约束：每个武将只挂一个皮肤键（多键 = 皮肤面板出现可切换的空条目）
 *   C. 骨骼三件套：<dir>/<main>.skel / .atlas 必须成对存在
 *   D. 图集页：atlas 中声明的每个 .png 必须落盘；反之落盘却没被任何 atlas
 *      声明的 .png 是「孤儿页」（纯占体积，可删）
 *   E. 静止底图：background 指向的文件必须存在
 *   F. 第二形态：带 transform.cshForm2 的武将必须有对应的 `<main>#1.*` 全套
 *
 * 锁定文件
 *   dynamic-integrity.lock.json 记录每个必需文件的 size + md5。
 *   搬运 / 打包 / 重生成之后再跑一次，任何字节级差异都会被抓出来。
 *   这是为了防住「生成器覆盖 manifest 字段导致封面全丢」这类静默事故。
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath, pathToFileURL } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "..");
const EXTDIR = path.basename(SRC); // 池子魔将
const DYNROOT = path.join(SRC, "image", "dynamic");
const LOCK = path.join(HERE, "dynamic-integrity.lock.json");

const argv = process.argv.slice(2);
const FREEZE = argv.includes("--freeze");
const QUIET = argv.includes("--quiet");

const problems = []; // {level:'error'|'warn', code, msg}
const err = (code, msg) => problems.push({ level: "error", code, msg });
const warn = (code, msg) => problems.push({ level: "warn", code, msg });

/* ---------------- 工具 ---------------- */

const md5 = (f) => crypto.createHash("md5").update(fs.readFileSync(f)).digest("hex");
const rel = (p) => path.relative(SRC, p).split(path.sep).join("/");

function listFiles(dir) {
	try {
		return fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n)).isFile());
	} catch {
		return [];
	}
}

/**
 * 解析 Spine atlas，取出它声明的所有图集页文件名。
 * 格式：页文件名占一整行且顶格（列 0），其余行都是缩进的 region 属性。
 */
function atlasPages(atlasPath) {
	if (!fs.existsSync(atlasPath)) return null;
	const out = [];
	for (const raw of fs.readFileSync(atlasPath, "utf8").split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || raw[0] === " " || raw[0] === "\t") continue;
		if (/\.(png|jpg|jpeg|webp)$/i.test(line) && !line.includes(":")) out.push(line);
	}
	return out;
}

/**
 * 解析配置里的资源路径。
 * 形如 `../../../池子魔将/image/dynamic/<dir>/<file>` —— 前缀层数取决于运行时的
 * 解析基准，不便硬猜；这里只取 `/池子魔将/` 之后的部分，锚定到扩展根来校验，
 * 这对「文件到底存不存在」这个判断是充分且稳定的。
 */
function cfgAbs(p) {
	if (!p) return null;
	const marker = "/" + EXTDIR + "/";
	const i = p.indexOf(marker);
	const tail = i >= 0 ? p.slice(i + marker.length) : p.replace(/^(\.\.\/)+/, "");
	return path.resolve(SRC, tail);
}

function cfgExists(p) {
	const c = cfgAbs(p);
	return !!c && fs.existsSync(c);
}

function resolveCfgPath(p) {
	const c = cfgAbs(p);
	if (c && fs.existsSync(c)) return c;
	const alt = path.resolve(SRC, "main", p);
	return fs.existsSync(alt) ? alt : null;
}

/**
 * 配置里的 `name` / `beijing.name` 是**不带扩展名的前缀**，运行时会自行拼 .skel / .atlas。
 * 所以只要二者之一存在即视为通路正确。
 */
function rigPrefixOk(p) {
	if (!p) return null;
	return cfgExists(p + ".skel") || cfgExists(p + ".atlas");
}

/* ---------------- 已知上游缺陷 ---------------- */

/**
 * 官方原始皮肤包里就缺这些图集页，**不是我方提取失误**。
 *
 * 核实方式：逐一比对 `[已移除]/骨骼提取/导出/原始压缩包/<md5>.zip`
 *   —— csh_zhangxingcai/12405_1 的来源包 c3adba10a0266b7a73afb628ff0ae1c5.zip
 *      内含文件与我们拷贝的完全一致（10 个），同样没有 eff/ 页。
 *
 * 影响评估（实测）：BeiJing.atlas 声明 12 页，官方只给 2 页。
 *   缺的 10 页里有 9 页是 **0 region 的空页**，仅 eff/D_0027_C_00027.png
 *   挂着 18 个 eff/ 系 region（占该 atlas region 总数 30%）。
 *   渲染实测：背景 bg=120x180 满框、无报错 → 加载器容忍缺页，
 *   且这 18 个 region 在待机/攻击/特殊动作中不可见 ⇒ 良性，降级为提示。
 */
const UPSTREAM_MISSING = new Set([
	"csh_zhangxingcai/12405_1/eff/D_0000_C_00000.png",
	"csh_zhangxingcai/12405_1/eff/D_0003_C_00003.png",
	"csh_zhangxingcai/12405_1/eff/D_0006_C_00006.png",
	"csh_zhangxingcai/12405_1/eff/D_0009_C_00009.png",
	"csh_zhangxingcai/12405_1/eff/D_0012_C_00012.png",
	"csh_zhangxingcai/12405_1/eff/D_0015_C_00015.png",
	"csh_zhangxingcai/12405_1/eff/D_0018_C_00018.png",
	"csh_zhangxingcai/12405_1/eff/D_0021_C_00021.png",
	"csh_zhangxingcai/12405_1/eff/D_0024_C_00024.png",
	"csh_zhangxingcai/12405_1/eff/D_0027_C_00027.png",
]);

/* ---------------- 读注册数据 ---------------- */

let S, D;
try {
	const m = await import(pathToFileURL(path.join(SRC, "main", "dynamic-skins.js")).href);
	S = m.cshDynamicSkins;
	D = m.cshDynamicDirs;
} catch (e) {
	console.error("✗ 无法加载 main/dynamic-skins.js：" + e.message);
	process.exit(2);
}
if (!S || !D) {
	console.error("✗ dynamic-skins.js 未导出 cshDynamicSkins / cshDynamicDirs");
	process.exit(2);
}

/* ---------------- A. 双向对应 ---------------- */

const skinKeys = Object.keys(S).sort();
const dirKeys = Object.keys(D).sort();

for (const k of skinKeys) if (!D[k]) err("A/missing-dir", `${k}：注册了动皮但没有目录映射`);
for (const k of dirKeys) if (!S[k]) err("A/orphan-dir", `${k}：有目录映射但没有注册动皮`);
if (skinKeys.length !== dirKeys.length) {
	err("A/count", `数量不等：注册 ${skinKeys.length} 个 vs 目录映射 ${dirKeys.length} 个`);
}

/* ---------------- 逐武将检查 ---------------- */

const required = []; // 必需文件（用于锁定）
const orphans = []; // 落盘但未被 atlas 声明的 .png
const upstreamHits = []; // 命中的已知上游缺陷
const stats = { skins: 0, files: 0, bytes: 0, forms: 0, multiKey: 0 };

/** 收集一个骨骼（main 名，如 XingXiang 或 XingXiang#1）的全部必需文件 */
function collectRig(dir, main, tag) {
	const base = path.join(DYNROOT, dir);
	const skel = path.join(base, main + ".skel");
	const atlas = path.join(base, main + ".atlas");

	if (!fs.existsSync(skel)) err("C/no-skel", `${dir}/${main}.skel 缺失（${tag}）`);
	else required.push(skel);
	if (!fs.existsSync(atlas)) {
		err("C/no-atlas", `${dir}/${main}.atlas 缺失（${tag}）`);
		return [];
	}
	required.push(atlas);

	const pages = atlasPages(atlas) || [];
	if (!pages.length) warn("D/empty-atlas", `${dir}/${main}.atlas 未声明任何图集页（${tag}）`);

	const declared = new Set(pages);
	for (const p of pages) {
		const pf = path.join(base, p);
		if (fs.existsSync(pf)) {
			required.push(pf);
		} else if (UPSTREAM_MISSING.has(dir + "/" + p)) {
			upstreamHits.push(dir + "/" + p);
		} else {
			err("D/page-missing", `${dir}/${p} 被 ${main}.atlas 声明但不存在（${tag}）`);
		}
	}
	return [...declared];
}

for (const key of skinKeys) {
	const entry = S[key];
	const keysOfSkin = Object.keys(entry);

	/* B. 单键约束 */
	if (keysOfSkin.length !== 1) {
		stats.multiKey++;
		err(
			"B/multi-key",
			`${key}：挂了 ${keysOfSkin.length} 个皮肤键 [${keysOfSkin.join(", ")}] —— ` +
				`皮肤面板会列出可切换的空条目，应改为单键`
		);
	}

	const cfg = entry[keysOfSkin[0]];
	if (!cfg) {
		err("B/no-cfg", `${key}：皮肤键 ${keysOfSkin[0]} 的配置为空`);
		continue;
	}
	stats.skins++;

	const dir = cfg.dir || D[key];
	if (!dir) {
		err("C/no-dir", `${key}：无法确定资源目录`);
		continue;
	}
	if (D[key] && cfg.dir && D[key] !== cfg.dir) {
		err("A/dir-mismatch", `${key}：配置里 dir="${cfg.dir}" 但 cshDynamicDirs 写的是 "${D[key]}"`);
	}

	const absDir = path.join(DYNROOT, dir);
	if (!fs.existsSync(absDir)) {
		err("C/no-dirpath", `${key}：资源目录不存在 image/dynamic/${dir}`);
		continue;
	}

	/* 该武将目录内被任何骨骼声明过的图集页（用于最后的孤儿页判定） */
	const usedPages = new Set();
	const declaredPages = collectRig(dir, cfg.main || "XingXiang", "主形态");
	declaredPages.forEach((p) => usedPages.add(p));
	stats.files++;

	/* C. 背景骨骼：走独立的 beijing 字段（dir/main 可与主形态不同） */
	if (cfg.beijing) {
		const bdir = cfg.beijing.dir || dir;
		const bmain = cfg.beijing.main || "BeiJing";
		stats.files++;
		if (!fs.existsSync(path.join(DYNROOT, bdir))) {
			err("C/no-bgdir", `${key}：背景骨骼目录不存在 image/dynamic/${bdir}`);
		} else {
			collectRig(bdir, bmain, "背景").forEach((p) => usedPages.add(p));
		}
		if (rigPrefixOk(cfg.beijing.name) === false) {
			err("C/no-bgname", `${key}：beijing.name 指向不存在的骨骼 → ${cfg.beijing.name}`);
		}
	} else {
		warn("C/no-beijing", `${key}：配置里没有 beijing 字段（动皮将没有背景层）`);
	}

	/* 主形态 name 通路 */
	if (cfg.name) {
		if (rigPrefixOk(cfg.name) === false) err("C/no-name", `${key}：name 指向不存在的骨骼 → ${cfg.name}`);
	}

	/* E. 静止底图 */
	if (cfg.background) {
		const found = resolveCfgPath(cfg.background);
		if (found) required.push(found);
		else err("E/no-bg", `${key}：background 指向的文件不存在 → ${cfg.background}`);
	} else {
		warn("E/no-bg-field", `${key}：配置里没有 background 字段（千幻面板会用空底图）`);
	}

	/* F. 变身态（觉醒形态）：transform 下的每个键都是一整套独立骨骼 */
	for (const [tkey, f2] of Object.entries(cfg.transform || {})) {
		if (!f2 || typeof f2 !== "object") continue;
		stats.forms++;
		const f2dir = f2.dir || dir;
		const f2main = f2.main || "XingXiang#1";
		const tag = `变身态 ${tkey}`;

		if (!fs.existsSync(path.join(DYNROOT, f2dir))) {
			err("F/no-dir2", `${key}：${tag} 目录不存在 image/dynamic/${f2dir}`);
			continue;
		}
		collectRig(f2dir, f2main, tag).forEach((p) => usedPages.add(p));

		if (f2.name && rigPrefixOk(f2.name) === false) {
			err("F/no-name2", `${key}：${tag} 的 name 指向不存在的骨骼 → ${f2.name}`);
		}
		if (f2.background) {
			const p2 = resolveCfgPath(f2.background);
			if (p2) required.push(p2);
			else err("F/no-bg2", `${key}：${tag} 的 background 不存在 → ${f2.background}`);
		}
		if (f2.beijing) {
			const b2dir = f2.beijing.dir || f2dir;
			const b2main = f2.beijing.main || "BeiJing#1";
			if (!fs.existsSync(path.join(DYNROOT, b2dir))) {
				err("F/no-bgdir2", `${key}：${tag} 背景目录不存在 image/dynamic/${b2dir}`);
			} else {
				collectRig(b2dir, b2main, tag + " · 背景").forEach((p) => usedPages.add(p));
			}
		} else {
			warn("F/no-beijing2", `${key}：${tag} 没有 beijing 字段（变身态将没有背景层）`);
		}
	}

	/* D. 孤儿页：目录内 .png 未被任何骨骼（主形态 / 背景 / 变身态）声明 */
	for (const p of listFiles(absDir).filter((n) => /\.png$/i.test(n))) {
		if (usedPages.has(p)) continue;
		const size = fs.statSync(path.join(absDir, p)).size;
		orphans.push({ key, dir, file: p, size });
	}
}

/* ---------------- 孤儿页汇总 ---------------- */

const orphanBytes = orphans.reduce((a, b) => a + b.size, 0);
if (orphans.length) {
	const mb = (orphanBytes / 1048576).toFixed(1);
	warn(
		"D/orphan-pages",
		`发现 ${orphans.length} 个孤儿图集页（落盘但未被任何 atlas 声明），合计 ${mb} MB —— 属纯占体积，可删`
	);
}

/* ---------------- 锁定文件比对 ---------------- */

const scan = {};
let totalBytes = 0;
for (const f of required) {
	try {
		const st = fs.statSync(f);
		totalBytes += st.size;
		scan[rel(f)] = { size: st.size, md5: md5(f) };
	} catch {
		err("Z/unreadable", `无法读取 ${rel(f)}`);
	}
}
stats.bytes = totalBytes;

let lockDiff = null;
if (FREEZE) {
	const doc = {
		_note: "池子魔将动皮资源锁定表 —— 由 tools/check-dynamic-integrity.mjs --freeze 生成",
		count: Object.keys(scan).length,
		bytes: totalBytes,
		files: scan,
	};
	fs.writeFileSync(LOCK, JSON.stringify(doc, null, 1), "utf8");
} else if (fs.existsSync(LOCK)) {
	let old;
	try {
		old = JSON.parse(fs.readFileSync(LOCK, "utf8"));
	} catch (e) {
		err("Z/bad-lock", `锁定文件无法解析：${e.message}`);
	}
	if (old && old.files) {
		const added = [],
			removed = [],
			changed = [];
		for (const k of Object.keys(scan)) {
			if (!old.files[k]) added.push(k);
			else if (old.files[k].size !== scan[k].size || old.files[k].md5 !== scan[k].md5) changed.push(k);
		}
		for (const k of Object.keys(old.files)) if (!scan[k]) removed.push(k);
		if (added.length || removed.length || changed.length) {
			lockDiff = { added, removed, changed };
			for (const k of changed) err("L/changed", `文件与锁定表不符（被改动或损坏）：${k}`);
			for (const k of removed) err("L/removed", `文件在锁定表里但已消失：${k}`);
			for (const k of added) warn("L/added", `新增文件（尚未锁定，重跑 --freeze 收录）：${k}`);
		}
	}
}

/* ---------------- 输出 ---------------- */

const ok = problems.filter((p) => p.level === "error").length === 0;

if (!QUIET) {
	console.log("池子魔将 · 动皮资源完整性自检");
	console.log("  资源根：" + rel(DYNROOT));
	console.log(
		`  武将 ${stats.skins} 个 · 第二形态 ${stats.forms} 个 · 必需文件 ${Object.keys(scan).length} 个 · ` +
			`${(totalBytes / 1048576).toFixed(1)} MB`
	);
	console.log("");
}

if (orphans.length && !QUIET) {
	console.log("孤儿图集页（可删）：");
	for (const o of orphans.slice(0, 20)) {
		console.log(`  ${(o.size / 1048576).toFixed(2)}MB  ${o.dir}/${o.file}`);
	}
	if (orphans.length > 20) console.log(`  … 另 ${orphans.length - 20} 个`);
	console.log("");
}

if (upstreamHits.length) {
	warn(
		"U/upstream-missing",
		`命中 ${upstreamHits.length} 个「官方原始包自带缺失」的图集页（非我方失误，已核实并实测无害）：` +
			upstreamHits.join("、")
	);
}

if (problems.length) {
	const es = problems.filter((p) => p.level === "error");
	const ws = problems.filter((p) => p.level === "warn");
	if (es.length) {
		console.log(`✗ 错误 ${es.length} 条：`);
		for (const p of es) console.log(`  [${p.code}] ${p.msg}`);
	}
	if (ws.length) {
		console.log(`${es.length ? "" : "△ "}提示 ${ws.length} 条：`);
		for (const p of ws) console.log(`  [${p.code}] ${p.msg}`);
	}
	console.log("");
}

if (FREEZE) {
	console.log(`✓ 已写入锁定表 tools/${path.basename(LOCK)}（${Object.keys(scan).length} 个文件）`);
} else if (lockDiff) {
	console.log("△ 与锁定表存在差异，见上方 L/* 条目。确认无误后重跑 --freeze。");
} else if (fs.existsSync(LOCK)) {
	console.log("✓ 全部文件与锁定表一致。");
} else {
	console.log("· 尚无锁定表，跑一次 --freeze 生成。");
}

console.log(ok ? "✓ 自检通过。" : "✗ 自检未通过。");
process.exit(ok ? 0 : 1);
