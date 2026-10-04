import { lib, game, ui, get, ai, _status } from "../../../noname.js";
/* 兼容说明：懒人包/部分壳用相对路径加载 noname.js；纯源码站若报模块找不到，可改回 from "noname" */
/* 注：core/voices.js 的 cshVoices 原本在此处 import 供 content 使用；
   拆分后由 main/content.js 自行 import。core/voices.js 是纯数据模块（零副作用），
   ESM 单例保证只求值一次，因此把它挪走不影响加载顺序。 */
/* 游戏目录唯一真值（2026-09-29 新增 · 零 import）。
   必须**最先**加载：csh_wallet（门票）/ csh_shell（META、回收率）/ csh_games（卡片清单）
   全部改为从它派生，杜绝「加一款游戏要改四处」的重复副本。 */
import "../core/csh_registry.js";
import "../core/csh_sfx.js";
/* BGM 音乐引擎（2026-09-30）：零 import，只把引擎挂到 window.CSH_BGM。
   与 csh_sfx 同一套双载模式 —— 主页面在这里转挂到 lib.cshBgm，
   games/ 下的 iframe 用经典 <script src=".../csh_bgm.js" data-game="xx"> 直接加载。
   配乐与音效是两条独立总线（各自音量档 + 各自开关），互不干扰。 */
import "../core/csh_bgm.js";
/* 纯 SVG 生成器（零 import）：主页面的徽章/头像唯一实现，
   同时供 games/ 下的 iframe 用经典 <script> 直接引（§I.4 一份代码两处使用）。 */
import "../core/csh_svggen.js";
/* 隐藏自检 ?selftest=1（第五部分建议增补 #6）：判据集中在这里，
   游戏帧用经典 <script data-csh-selftest="auto"> 自动跑，
   主页面（ESM，无 currentScript）由 csh_debug.js 在面板渲染完后显式调 auto(overlay)。 */
import "../core/csh_selftest.js";
import "../core/csh_wallet.js";
import "../core/csh_world.js";
import "../core/csh_badge.js";
import "../core/csh_shell.js";
import "../core/csh_migrate.js";
/* 面板样式 token 层（阶段 4 · 2026-09-29）：调试面板/局内互动的颜色唯一真值，
   启动即把 :root 的 --csh-* 变量注入宿主文档，csh_debug/csh_interact 全部改用它。 */
import "../core/csh_theme.js";
import "../core/csh_interact.js";
import "../core/csh_voice.js";
import "../core/csh_games.js";
/* 成就引擎（2026-09-28）：零 import 双载——主文档这份供壳层 shell-ach-claim 领奖复核，
   career.html 用经典 <script> 引同一份源码渲染成就墙。 */
import "../core/csh_achv.js";
/* 音效总线（§4.7.1）：core/csh_sfx.js 零 import，只把总线挂到 window.CSH_SFX。
   主页面里由这里转挂到 lib.cshSfx —— 这样 csh_sfx.js 自身不必依赖 noname 的 lib，
   才能被 games/ 下的 iframe 用经典 <script> 直接加载（同一份实现，两个文档各挂各的）。 */
try {
	if (typeof window !== "undefined" && window.CSH_SFX) lib.cshSfx = window.CSH_SFX;
} catch (eSfx) { console.warn("[池子魔将] csh_sfx.js 未加载", eSfx); }
/* BGM 同上：csh_bgm.js 零 import，主页面把它转挂到 lib.cshBgm。
   注意这里**不主动播放** —— 主页面是无名杀本体，贸然放配乐会干扰对局；
   配乐只在「池子休闲」面板打开时由面板显式调 lib.cshBgm.play("lobby")。 */
try {
	if (typeof window !== "undefined" && window.CSH_BGM) lib.cshBgm = window.CSH_BGM;
} catch (eBgm) { console.warn("[池子魔将] csh_bgm.js 未加载", eBgm); }
/* 隐藏自检同上：csh_selftest.js 零 import，主页面把它转挂到 lib.cshSelftest。 */
try {
	if (typeof window !== "undefined" && window.CSH && window.CSH.selftest) lib.cshSelftest = window.CSH.selftest;
} catch (eSelf) { console.warn("[池子魔将] csh_selftest.js 未加载", eSelf); }

/* ===== csh_debug / csh_winrate 懒加载（2026-10-04 启动优化，合计约 430KB）=====
 * 依赖图核实：这两个模块只被本文件静态引用，其余模块全部经 lib.* 运行时访问（带保护），
 * 因此可以安全延后。加载时机与行为保持不变的对应关系：
 *   - csh_debug：悬浮球本就设计为对局内入口（内部 canShow/mountAll 控制），
 *     延迟到 arenaReady 加载不改变任何可见行为；主菜单可用的 F1 与设置页
 *     「池子休闲」按钮由下面的桩接管，首次触发时再拉起模块。
 *   - csh_winrate：模块在 eval 时包装 game.over 挂统计钩子，必须先于任何终局就位，
 *     因此同样挂 arenaReady（进局即加载）；设置页「胜负统计」按钮走桩。
 * 两个 loader 做去重；加载失败时允许重试。 */
var __cshDebugLoading = null, __cshWinrateLoading = null;
lib.__cshLoadDebug = function () {
	if (lib.cshDebugMenu) return Promise.resolve();
	if (!__cshDebugLoading) {
		__cshDebugLoading = import("../core/csh_debug.js").catch(function (e) {
			__cshDebugLoading = null; /* 失败允许下次重试 */
			throw e;
		});
	}
	return __cshDebugLoading;
};
lib.__cshLoadWinrate = function () {
	if (lib.csh_winrate) return Promise.resolve();
	if (!__cshWinrateLoading) {
		__cshWinrateLoading = import("../core/csh_winrate.js").catch(function (e) {
			__cshWinrateLoading = null;
			throw e;
		});
	}
	return __cshWinrateLoading;
};
/* csh_debug 加载前的诊断桩：其余模块的 lib.cshDebug.info/error/toast 调用
   转发到 console，模块加载后由其自身实现整体覆盖（csh_debug eval 时重挂 lib.cshDebug）。 */
if (!lib.cshDebug) {
	lib.cshDebug = {
		__lazyStub: true,
		info: function (m, d) { try { console.log("[池子魔将·info]", m, d || ""); } catch (e) {} },
		error: function (m, d) { try { console.error("[池子魔将·error]", m, d || ""); } catch (e) {} },
		toast: function (t) { try { console.log("[池子魔将·toast]", t); } catch (e) {} }
	};
}
try {
	if (lib.arenaReady && typeof lib.arenaReady.push === "function") {
		lib.arenaReady.push(function () {
			lib.__cshLoadWinrate().catch(function (e) { try { console.warn("[池子魔将] csh_winrate 懒加载失败", e); } catch (e2) {} });
			lib.__cshLoadDebug().catch(function (e) { try { console.warn("[池子魔将] csh_debug 懒加载失败", e); } catch (e2) {} });
		});
	}
} catch (eLazy) {}
/* F1 预绑定：模块加载前按 F1 也能打开调试面板；加载后 lib.cshDebugMenu 出现，
   本监听自动让位给 csh_debug 自己的热键。 */
try {
	if (typeof document !== "undefined" && document.addEventListener) {
		document.addEventListener("keydown", function (e) {
			if (e.key !== "F1" && e.keyCode !== 112) return;
			if (lib.cshDebugMenu) return; /* 已加载：交给 csh_debug 自己的热键 */
			var tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
			if (tag === "input" || tag === "textarea" || (e.target && e.target.isContentEditable)) return;
			try { e.preventDefault(); e.stopPropagation(); } catch (e2) {}
			lib.__cshLoadDebug().then(function () {
				try { if (lib.cshDebugMenu && typeof lib.cshDebugMenu.open === "function") lib.cshDebugMenu.open(); } catch (e3) {}
			}).catch(function () {});
		}, true);
	}
} catch (eF1) {}
