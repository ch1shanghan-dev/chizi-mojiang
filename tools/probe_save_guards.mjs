/* 行囊页 · 破坏性操作确认的守卫测试（2026-10-20）
   ------------------------------------------------------------
   背景：`save.html` 的三处破坏性操作（回滚存档 / 解包导入 / 重置家当）原本用原生
   `window.confirm`，在游戏 iframe 里既难看也压不住（系统弹窗层级在 iframe 之上）。
   改成自绘确认时，**最大的风险不是样式，是控制流**：确认改成回调后，"取消"必须真的
   什么都不做。改错了就是玩家点一下"取消"结果存档被清空。

   所以这里不测样式，只测两件事：
     ① 结构：动作必须写在 ask() 的回调里，不许再出现裸 window.confirm；
     ② 行为：把 ask 的源码抽出来在 vm 里真跑 —— 确认才执行、取消不执行、抛错不执行。

   跑法：node tools/probe_save_guards.mjs
*/
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = fs.readFileSync(path.join(ROOT, "games", "save.html"), "utf8");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
	if (cond) { pass++; console.log("  [PASS] " + name); }
	else { fail++; console.log("  [FAIL] " + name + (extra ? "  → " + extra : "")); }
}

console.log("== 1. 结构：动作必须在 ask 回调里 ==");
{
	const asks = (SRC.match(/ask\(/g) || []).length;
	ok("ask 调用至少 4 处（回滚 / 解包 / 重置×2）", asks >= 4, "实际 " + asks);

	const raw = (SRC.match(/window\.confirm\(/g) || []).length;
	ok("裸 window.confirm 只剩 ask 内那一处兜底", raw === 1, "实际 " + raw);

	/* 三个动作各自必须被 ask( 包住：动作可能在同一文件里出现多次（注释里也会提到），
	   只要有**一处**满足"前 600 字内有 ask("即可。 */
	for (const act of ["shell-mig-rollback", "shell-mig-import", "shell-mig-reset"]) {
		let hit = false, seen = 0;
		let from = 0;
		while (true) {
			const i = SRC.indexOf(act, from);
			if (i < 0) break;
			seen++;
			const near = SRC.slice(Math.max(0, i - 600), i);
			if (near.includes("ask(")) { hit = true; break; }
			from = i + act.length;
		}
		ok(act + " 在 ask 回调内", hit, seen ? ("出现 " + seen + " 次，没有一次被 ask 包住") : "找不到该动作");
	}
}

console.log("\n== 2. 行为：抽出 ask 源码真跑 ==");
const m = SRC.match(/function ask\(msg, onOk\) \{[\s\S]*?\n\}/);
ok("能抽出 ask 函数", !!m);
const askSrc = m ? m[0] : "";

function makeSandbox(hostConfirm, nativeResult) {
	/* 用一个最小 window 桩：parent.lib.cshUI.confirm 可选，window.confirm 可选。 */
	const win = {
		parent: { lib: {} },
		confirm: nativeResult === undefined ? undefined : () => nativeResult,
	};
	if (hostConfirm) win.parent.lib.cshUI = { confirm: hostConfirm };
	const sandbox = { window: win, console, Math, Number, String, Object, Array };
	vm.createContext(sandbox);
	vm.runInContext(askSrc + "\n;this.__ask = ask;", sandbox);
	return { ask: sandbox.__ask, win };
}

{
	/* 场景 A：宿主有自绘确认，用户点"确定" → 必须执行 */
	let fired = 0, seenMsg = "";
	const { ask } = makeSandbox((opts, cb) => { seenMsg = opts.message; cb(true); }, true);
	ask("确认吗", () => fired++);
	ok("宿主确定 → 执行一次", fired === 1, "fired=" + fired);
	ok("文案透传给宿主", seenMsg === "确认吗", seenMsg);
}
{
	/* 场景 B：宿主有自绘确认，用户点"取消" → 绝不能执行（最关键的一条） */
	let fired = 0;
	const { ask } = makeSandbox((opts, cb) => cb(false), true);
	ask("确认吗", () => fired++);
	ok("宿主取消 → 不执行", fired === 0, "fired=" + fired);
}
{
	/* 场景 C：无宿主 → 回退原生；原生返回 true 执行、false 不执行 */
	let a = 0, b = 0;
	makeSandbox(null, true).ask("x", () => a++);
	makeSandbox(null, false).ask("x", () => b++);
	ok("无宿主 + 原生确定 → 执行", a === 1, "a=" + a);
	ok("无宿主 + 原生取消 → 不执行", b === 0, "b=" + b);
}
{
	/* 场景 D：原生 confirm 抛错 → 安全地不执行（宁可不动手，不可误删） */
	let fired = 0;
	const win = { parent: { lib: {} }, confirm: () => { throw new Error("boom"); } };
	const sandbox = { window: win, console, Math, Number, String, Object, Array };
	vm.createContext(sandbox);
	vm.runInContext(askSrc + "\n;this.__ask = ask;", sandbox);
	let threw = false;
	try { sandbox.__ask("x", () => fired++); } catch (e) { threw = true; }
	ok("原生抛错 → 不执行且不外抛", fired === 0 && !threw, "fired=" + fired + " threw=" + threw);
}

console.log("\n----------------------------------------");
console.log(fail ? "结论：未通过（PASS " + pass + " / FAIL " + fail + "）" : "结论：通过（PASS " + pass + " / FAIL " + fail + "）");
process.exit(fail ? 1 : 0);
