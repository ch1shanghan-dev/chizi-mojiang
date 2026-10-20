/* 演出注册表 · 探针（2026-10-20）
   目的：没有真引擎/真 DOM 的情况下验证三件事：
     ① MEDIA 表的值与旧 _dur 表逐条一致（收编零行为变化）；
     ② durOf 对表内/表外/未知类型的返回值正确；
     ③ play() 的查表分派逻辑（用假 this 驱动，不碰真实 DOM）。
   跑法：node tools/probe_fx_media.mjs */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = fs.readFileSync(path.join(ROOT, "main", "content.js"), "utf8");

/* 从 content.js 提取 lib.cshShoushaFx 对象字面量里的 MEDIA / _dur / durOf / play 四件，
   在 vm 里拼一个最小宿主求值。play 体里的 this._inject/this._bannerVideo 等用假函数顶住。 */
function extract(re, what) {
	const m = SRC.match(re);
	if (!m) throw new Error("content.js 里找不到 " + what);
	return m[0];
}
const mediaSrc = extract(/\n        MEDIA: \{[\s\S]*?\n        \},/, "MEDIA 表");
const durSrc = extract(/_dur: \{[^\r\n]*\},/, "_dur 表（单行，kill 子对象会骗过非贪婪匹配，按行取）");
const durOfSrc = extract(/durOf: function[\s\S]*?\n        \},/, "durOf");
const playSrc = extract(/\n        play: function[\s\S]*?\n        \},/, "play");

const sb = { console, Date, JSON, Number, String, Object, Array, Math };
sb.console = { warn: (m) => sb.__warn.push(m), log: () => {}, error: () => {} };
sb.__warn = [];
/* play 里有 setTimeout(clear, …)：沙箱必须提供（不真跑，只求不抛）。
   缺它会被 play 的 try/catch 吞掉，表现为「分派没发生」——探针假阳性。 */
sb.setTimeout = function () { return 0; };
sb.clearTimeout = function () {};
vm.createContext(sb);
vm.runInContext("var FX = {" + mediaSrc + durSrc + durOfSrc + playSrc + "\n};", sb);
const FX = sb.FX;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
	if (cond) { pass++; console.log("  [PASS] " + name); }
	else { fail++; console.log("  [FAIL] " + name + (extra ? "  → " + extra : "")); }
}

console.log("== 1. 注册表与旧 _dur 逐条一致（收编零行为变化） ==");
const oldDur = { niliu: 23300, quedi: 2800, paiyi: 3100, liegong: 3060, luanwu: 3760, duwu: 2060, pojun: 2060, yannv1: 1860 };
for (const k in oldDur) {
	ok(k + " 表值 = 旧 _dur（" + oldDur[k] + "）", FX.MEDIA[k] && FX.MEDIA[k].dur === oldDur[k],
		FX.MEDIA[k] ? "表值 " + FX.MEDIA[k].dur : "表里没有");
	ok(k + " 的 file 在磁盘", FX.MEDIA[k] && fs.existsSync(path.join(ROOT, "effect", FX.MEDIA[k].file)));

}
console.log("\n== 2. durOf 取值 ==");
for (const k in oldDur) ok("durOf(" + k + ") = " + oldDur[k], FX.durOf(k) === oldDur[k], "实际 " + FX.durOf(k));
ok("durOf(guilai) 走 _dur（3000）", FX.durOf("guilai") === 3000, "实际 " + FX.durOf("guilai"));
ok("durOf(kill) 兜底 3500", FX.durOf("kill") === 3500, "实际 " + FX.durOf("kill"));
ok("durOf(不存在的类型) 兜底 3000", FX.durOf("no_such_fx") === 3000, "实际 " + FX.durOf("no_such_fx"));

console.log("\n== 3. play() 查表分派（假 this 驱动） ==");
function fakeThis() {
	return {
		MEDIA: FX.MEDIA, _dur: FX._dur,
		_running: {},
		_inject: function () {},
		_bannerVideo: function (m) { this.__banner = m && m.file; },
		_niliuVideo: function () { this.__legacy = "niliu"; },
		_guilai: function () { this.__guilai = true; },
		durOf: FX.durOf,
		play: FX.play,
	};
}
{
	const t = fakeThis();
	t.play("quedi", null);
	ok("quedi → banner 管线收到表条目（file 正确）", t.__banner === "csh_wenyang_quedi_banner.mp4", "收到 " + t.__banner);
	ok("quedi → 重入窗置位", t._running.quedi === true);
}
{
	const t = fakeThis();
	t.play("niliu", null);
	ok("niliu → legacy 管线（_niliuVideo）", t.__legacy === "niliu");
}
{
	const t = fakeThis();
	t.play("guilai", null);
	ok("guilai（表外）→ 原 CSS 路径", t.__guilai === true && t.__banner === undefined);
}
{
	const t = fakeThis();
	t.play("diankuang", null);
	ok("diankuang（表外·无分支）→ 静默 clear 不崩", t.__banner === undefined && t.__guilai === undefined);
}
{
	const t = fakeThis();
	t.play("quedi", null);
	t.__banner = null;
	t.play("quedi", null);
	ok("同类型重入被挡（不双播）", t.__banner === null);
}

console.log("\n----------------------------------------");
console.log(fail ? "结论：未通过（PASS " + pass + " / FAIL " + fail + "）" : "结论：通过（PASS " + pass + " / FAIL " + fail + "）");
process.exit(fail ? 1 : 0);
