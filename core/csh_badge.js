import { lib } from "../../../noname.js";
/* 池子魔将 · 程序化 SVG 生成器入口（官阶徽章 + AI 头像 · §G.5 / §I.4）
   ============================================================
   本文件只做一件事：把**唯一的**生成器实现（core/csh_svggen.js）
   接到主页面既有的两个入口上：
     · lib.cshBadge      —— 供 core/csh_wallet / csh_world / csh_debug / career 等 ESM 模块使用
     · window.CSH.badge  —— 供页面内联脚本（调试面板 / 生涯大厅）使用
   并在启动时跑一次规格自检、把结论写进调试面板日志。

   ⚠ 为什么生成逻辑不在本文件里（2026-09-28 重构）：
     §I.4 要求「同一套 SVG 生成器同时产出 36 个 AI 头像与 50 个官阶徽章 —— 一份代码，两处使用」。
     本文件走 ESM（`import { lib } from "../../../noname.js"`），
     而 games/ 下的游戏是在 iframe 里跑的经典脚本，**不可能**再 import 一次 noname
     （会在子文档里跑出第二份本体）。所以把纯 SVG 逻辑搬到零 import 的 core/csh_svggen.js：
       主页面 —— ESM import（下面这行）
       游戏帧 —— <script src="../../core/csh_svggen.js"></script>
     两个文档各自一份实例、互不干扰，源码仍然只有一份。csh_sfx.js 用的是同一招（§4.7.1）。

   对外接口（与重构前**完全一致**，调用点无需改动）：
     CSH.badge.badge(段序号 0~4, 段内第几阶 1~10, 形态 'lg'|'md'|'sm')  → <svg> 字符串
     CSH.badge.forRank(官阶级 0~50, 形态)                              → 便捷包装
     CSH.badge.avatar(姓氏单字, 性格key, 尺寸px)                        → AI 头像 <svg>
     CSH.badge.selfTest()                                              → 跑规格自检，返回报告
   ============================================================ */
import "./csh_svggen.js";

(function () {
	if (lib.cshBadge) return;

	/* 取生成器：浏览器里 window 即 globalThis；Node 自检沙箱里 window 未定义、走 globalThis */
	var G = null;
	try {
		var g = (typeof window !== "undefined" && window) ||
			(typeof globalThis !== "undefined" && globalThis) || null;
		G = g && g.CSH && g.CSH.svggen ? g.CSH.svggen : null;
	} catch (e0) {}
	if (!G) {                       // 兜底：非 ESM 环境里 svggen 会顺手挂到 lib.cshSvggen
		try { if (lib.cshSvggen) G = lib.cshSvggen; } catch (e1) {}
	}

	if (!G) {
		try {
			if (lib.cshDebug && typeof lib.cshDebug.error === "function") {
				lib.cshDebug.error("badge: core/csh_svggen.js 未加载，徽章/头像不可用");
			}
		} catch (e2) {}
		console.warn("[池子魔将] csh_badge.js: core/csh_svggen.js 未加载，徽章/头像不可用");
		return;
	}

	lib.cshBadge = G;
	try {
		if (typeof window !== "undefined") { window.CSH = window.CSH || {}; window.CSH.badge = G; }
	} catch (e) {}

	var rep = G.selfTest();
	try {
		if (lib.cshDebug && typeof lib.cshDebug.info === "function") {
			lib.cshDebug.info("badge 自检：" + (rep.pass ? "全过" : "有失败") + "（" + rep.checks.length + " 项）");
		}
	} catch (e) {}
})();
