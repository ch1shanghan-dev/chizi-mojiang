import { lib, game, ui } from "../../../noname.js";
/* 游戏目录唯一真值（零 import，幂等）。extension.js 已先引；此处再引一次是为了
   把「本模块依赖目录」写成显式依赖，而不是靠 import 顺序的隐含约定。 */
import "./csh_registry.js";
// 池子魔将 · 统一 Game Shell（§E.2 / §5.1 #2 · §5.5.5 任务 #4）
//
// 定位：5 款小游戏**共用一套**「入场收费屏 → 三带壳 → 暂停/关闭 → 结算回钱包」流程。
//   此前每款游戏各写一套关闭/暂停/结算，改一处要改五处；本模块是唯一实现。
//
// 三带结构（§E.2，横屏/竖屏都适用；**禁用 100vw/100vh**，父层 transform:scale 会失真）：
//   ┌──────────────────────────────┐
//   │ 顶带 48px：局内状态 + 暂停 + 关闭 │  元信息区
//   ├──────────────────────────────┤
//   │ 中带 flex:1：舞台 / 牌桌 / 靶场  │  焦点区
//   ├──────────────────────────────┤
//   │ 底带 ≥96px：操作区（拇指热区）   │  主操作区（≥48px 触摸目标）
//   └──────────────────────────────┘
//
// 入场收费屏（§F.3）——所有小游戏在进入 Game Shell 前，先过一道「入场确认」：
//   显示门票价 + 当前池子币 + 剩余局数；确认后扣门票才加载游戏。
//   德州门票 0，但**必须带入**（带入额 = 真实成本，§F.3 注释）。
//
// 手机端刚需（§E.4）：
//   ① 失焦自动暂停：visibilitychange→hidden / blur → 冻结计时器
//   ② 防下拉刷新 / 橡皮筋：overscroll-behavior:none + 画布 touch-action:none
//   ③ 可视高度修正：用 100%（不是 100vh）
//   ④ 滚动穿透：遮罩 touchmove 阻止冒泡
//
// 对外接口（lib.cshShell / window.CSH.shell）：
//   CSH.shell.open(key, opts)      入场收费屏 → 通过则开壳
//   CSH.shell.charge(key, buyIn)   仅收费，不开壳（供子页面自己开）
//   CSH.shell.close(reason)        关壳（未结算且有带入时先弹确认）
//   CSH.shell.pause([on])          暂停/恢复
//   CSH.shell.settle(key, data)    结算（唯一金额实现在 csh_wallet.settleRun）
//   CSH.shell.settleSession(k, d)  牌桌类结算 + AI 世界双向记账
//   CSH.shell.register(key, cfg)   子页面注册自身元信息（顶带状态文案等）
//   CSH.shell.tick(key, text)      更新顶带状态文案
//   CSH.shell.ticketOf(key)        查门票（委托 csh_wallet，含官阶折扣）
//
// 依赖方向（2026-09-29 架构收敛后）：
//   csh_registry（目录真值）→ csh_wallet（经济真值）→ csh_shell（流程 + 展示）
//   csh_shell 不再自带目录表、回收率表、结算公式、门票表 —— 全部向上层取真值。
//
// 子页面桥命令（postMessage {__csh, req, ...} → 应答 {__csh:"<cmd>-ack", req, ok, data}）：
//   shell-wallet / shell-games / shell-seat / shell-settle / shell-settle-session /
//   shell-tasks / shell-task-add / shell-merit / shell-stats / shell-ach-claim /
//   shell-rank-all / shell-world / shell-sign / shell-relief /
//   shell-open / shell-mig-* / shell-badge-all / shell-close
//
// 红线：零外链、零外部图片；localStorage 前缀 csh_；`node --check` 通过。

(function () {
	if (lib.cshShell) return;

	/* ---------- 常量 ---------- */
	var OV_ID = "csh-shell-overlay";
	var CSS_ID = "csh-shell-css";
	var FEE_ID = "csh-shell-fee";
	var BASE = "extension/池子魔将/games/";

	/* ⚠ 2026-09-29 门票表**去重**（契约族实例 / §S1）：
	   此处原有一份与 csh_wallet.TICKET 数值相同的副本，但**不带官阶折扣**，
	   而实际收费走 shell → 那份副本 ⇒ 官阶折扣整条链是死的（payTicket 零调用）。
	   现在全扩展只有 csh_wallet 一份门票表，这里委托它。 */
	function ticketOf(key) {
		try {
			var W = lib.cshWallet;
			if (W && W.wallet && typeof W.wallet.ticketOf === "function") return W.wallet.ticketOf(key);
		} catch (e) {}
		return 0;
	}
	/* 带入档位（唯一来源：csh_wallet.BUYIN_TIERS），缺钱包时退回旧口径保证可用 */
	function buyInTiers() {
		try {
			var W = lib.cshWallet;
			if (W && typeof W.tiers === "function") {
				var t = W.tiers();
				if (Array.isArray(t) && t.length) return t;
			}
		} catch (e) {}
		return [200, 2000, 20000, 200000];
	}
	function isGambleBuyIn(v) {
		try {
			var W = lib.cshWallet;
			if (W && typeof W.isGamble === "function") return W.isGamble(v);
		} catch (e) {}
		return Math.floor(Number(v) || 0) >= 200000;
	}

	/* ---------- 游戏目录（唯一真值在 core/csh_registry.js） ----------
	   2026-09-29 架构收敛：本模块**不再自带**目录表与回收率表。
	   此前「加一款游戏要改四处」（shell.META / shell.DECAY / games.GAMES / career.games[]）
	   是写在注释里的约定，而且已经漂移（德州描述还写着「每日上限」、
	   career 里廿一点仍是门票 300）。现在只保留 registry 一份，这里派生。
	   registry 缺失属于装配错误：记录错误并让 META 为空（立刻暴露，而不是静默跑旧副本）。 */
	var REG = null;
	try { REG = (typeof window !== "undefined" && window.CSH && window.CSH.registry) || null; } catch (eReg) {}

	var META = {};
	(function buildMeta() {
		if (!REG) return;
		var ks = REG.all();
		for (var i = 0; i < ks.length; i++) {
			var g = REG.get(ks[i]);
			if (!g) continue;
			META[ks[i]] = {
				title: g.title, dir: g.dir, file: g.file,
				landscape: !!g.landscape, settle: g.settle, needBuyIn: !!g.needBuyIn,
				lobby: !!g.lobby, tag: g.tag || "", desc: g.desc || "", decay: g.decay || 0,
				/* 2026-09-29：漏派生这一项 ⇒ autoPauseOn() 恒 false ⇒ 实时游戏切后台也不暂停。
				   注：神弩手已于 2026-10-03 移除，当前四款都是回合制（autoPause 全缺省 false），
				   本派生点保留 —— 以后再加实时游戏时 registry 声明即可。 */
				autoPause: !!g.autoPause,
			};
		}
	})();

	/* 结算回收率（§F.5）——同样派生自 registry，本模块不再各写一份 */
	var DECAY = (REG && typeof REG.decays === "function") ? REG.decays() : {};

	/* ---------- 状态 ---------- */
	var current = null;      // 当前游戏 key
	var currentBuyIn = 0;    // 本次入场带入（已在收费屏扣除；供子页面读取，§4.1.1）
	var paused = false;
	var pausedAuto = false;   // 本次暂停是否自动触发（失焦/切页）。手动暂停不参与「回前台自动恢复」
	var msgBound = false;
	var escBound = false;
	var visBound = false;
	var feeEl = null;        // 入场收费屏元素
	var host = null;         // 承载壳的 iframe 元素
	var regCfg = {};         // 子页面注册的配置
	var topText = "";        // 顶带左文案
	var enteredAt = 0;       // 进入时间戳（供时长统计）
	var tickTimer = 0;       // 顶带状态刷新定时器（2026-09-29 新增）
	var pausedAt = 0;        // 暂停起始（冻结计时用）
	var totalPaused = 0;     // 累计暂停时长
	var listeners = { pause: [], resume: [], close: [], settle: [] };
	/* 当前正在处理的请求 ID（2026-09-29 修复 P0-0）：
	   客户端 waiter 键 = `命令名#自增序号`（唯一请求 ID），宿主却把"命令名常量"回填进 req
	   ⇒ waiters["shell-wallet#1"] 永不命中 ⇒ 全部桥调用 100% 走超时分支，
	   生涯大厅五个页签全空、德州"一直玩不了"。
	   修法：onMessage 进入时记下本次真实 req，ackToGame 回显它。
	   **23 个 ackToGame 调用点一行都不用改。** */
	var CUR_REQ = null;
	/* 会话级结算守卫（2026-09-29 新增；2026-09-29 二审归一）：
	   一次入场只结算一次。key 由 guardKey() 生成（**与命令族无关**），
	   value = 首次结算的结果对象。
	   此前 `shell-settle` 用 "r|key"、`shell-settle-session` 用 "S|key" 两个键，
	   客户端（或伪造消息）把两条都发一遍就能把同一局的钱记两遍。
	   现在两族共用同一个键；退壳保护也用它判断「本局是否已结算」。 */
	var GUARD = {};
	function guardKey() { return "|" + (current || "?"); }
	/* 旧版关闭协议白名单（显式，不再靠 `-close` 后缀猜）。
	   历史上各页面自己发 "<key>-close"，现在统一为 shell-close；
	   白名单方式可避免再出现「shell-close 被旧正则抢先吃掉」这类事故。 */
	var LEGACY_CLOSE = { "uno-close": "uno", "doudizhu-close": "doudizhu", "texas-close": "texas", "blackjack-close": "blackjack", "career-close": "career" };

	/* ---------- 工具 ---------- */
	function docHost() { return document.documentElement || document.body; }
	function assetURL() { try { return lib.assetURL || ""; } catch (e) { return ""; } }
	function urlOf(key) {
		var m = META[key];
		if (!m) return "";
		/* dir 可为空（如 career.html 直接放在 games/ 下）：
		   此时拼成 …/games/career.html，而不是 …/games//career.html */
		var seg = m.dir ? m.dir + "/" : "";
		var url = assetURL() + BASE + seg + m.file;
		/* 隐藏自检透传（?selftest=1）：宿主页带标志 → 子页也带，
		   这样宿主页加一次 ?selftest=1 就能同时拿到「面板」与「游戏帧」两份自检报告。 */
		try {
			var q = (typeof window !== "undefined" && window.location && window.location.search) || "";
			if (/(?:^|[?&])selftest=1(?:&|$)/.test(q)) url += (url.indexOf("?") >= 0 ? "&" : "?") + "selftest=1";
		} catch (e0) {}
		return url;
	}
	function fmt(n) {
		return String(Math.floor(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	}
	function toast(msg) {
		msg = String(msg == null ? "" : msg);
		try {
			if (typeof ui !== "undefined" && ui && ui.create && typeof ui.create.toast === "function") {
				ui.create.toast(msg); return;
			}
		} catch (e) {}
		try { console.log("[池子魔将·壳] " + msg); } catch (e2) {}
	}
	function logInfo(m) { try { if (lib.cshDebug && lib.cshDebug.info) lib.cshDebug.info("shell: " + m); } catch (e) {} }
	/* 音效（§4.7.1 统一总线）。拿不到总线就静默，绝不因音效影响壳流程。 */
	function sfx(name, opt) {
		try {
			var S = lib.cshSfx || (typeof window !== "undefined" ? window.CSH_SFX : null);
			if (S && typeof S.play === "function") S.play(name, opt);
		} catch (e) {}
	}
	function logError(m, e) {
		try {
			if (lib.cshDebug && lib.cshDebug.error) lib.cshDebug.error("shell: " + m, e);
			else console.error("[池子魔将·壳] " + m, e);
		} catch (e2) {}
	}
	function emit(ev, arg) {
		var arr = listeners[ev] || [];
		for (var i = 0; i < arr.length; i++) { try { arr[i](arg); } catch (e) {} }
	}
	function wallet() { try { return lib.cshWallet || null; } catch (e) { return null; } }
	/* ticketOf / buyInTiers 已在文件头定义（委托 csh_wallet，唯一门票表） */
	/* 顶带 CBY 余额刷新（2026-09-28 新增）：开局 / 带入 / 结算 / 兑换后都调 */
	function paintPc() {
		try {
			var el = document.querySelector("#" + OV_ID + " .csh-sh-pc");
			if (!el) return;
			var W = wallet();
			el.textContent = W ? (fmt(W.wallet.pc()) + " CBY") : "";
		} catch (e) {}
	}

	/* ---------- 样式（§E.2 / §E.4） ---------- */
	function ensureStyle() {
		var old = document.getElementById(CSS_ID);
		if (old && old.parentNode) old.parentNode.removeChild(old);
		var st = document.createElement("style");
		st.id = CSS_ID;
		st.textContent = [
			"@keyframes cshShFade{from{opacity:0;}to{opacity:1;}}",
			"@keyframes cshShUp{from{transform:translateY(12px);opacity:0;}to{transform:translateY(0);opacity:1;}}",
			/* 外壳：全屏遮罩，禁止 100vw/100vh，用 100% */
			"#" + OV_ID + "{position:fixed!important;left:0!important;top:0!important;width:100%!important;height:100%!important;",
			"z-index:1000020!important;display:block!important;pointer-events:auto!important;",
			"background:rgba(var(--csh-bg-deep-rgb),.96)!important;",
			"font-family:'Microsoft YaHei','PingFang SC','STHeiti',sans-serif!important;",
			/* ★ 2026-09-29：壳内文字全局抗锯齿（深色底上亚像素渲染会出彩边，用户反馈"散光"）。
			   只作用于壳遮罩与收费屏，不碰 noname 自身 UI。 */
			"-webkit-font-smoothing:antialiased!important;text-rendering:optimizeLegibility!important;",
			"animation:cshShFade .18s ease-out!important;overscroll-behavior:contain!important;}",
			/* ⚠ noname 全局 `div{display:inline-block;position:absolute}` 会摧毁壳布局：
			   先把所有后代复位为 static，再对需要定位的容器单独覆盖。
			   （不动 iframe，它是替换元素；统一低优先级复位不影响。）*/
			"#" + OV_ID + " *{position:static!important;float:none!important;box-sizing:border-box!important;transition:none!important;}",
			/* 三带容器 */
			"#csh-shell-wrap{position:absolute!important;left:0!important;top:0!important;width:100%!important;height:100%!important;",
			"display:flex!important;flex-direction:column!important;",
			"padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)!important;box-sizing:border-box!important;}",
			/* 悬浮控制组（2026-10-03 取代整条顶带）：余额胶囊 + 关闭按钮
			   · 半透明常驻（.62），hover/按下变 1.0 —— 存在感低但不消失；
			   · 触摸目标 ≥44px（关闭按钮），余额胶囊按内容宽；
			   · 右侧留 8px、顶部 6px，正好落在骨架给 .csh-topbar 预留的空白带里。 */
			"#csh-shell-dock{position:absolute!important;right:8px!important;top:6px!important;z-index:25!important;",
			"display:flex!important;align-items:center!important;gap:6px!important;",
			"opacity:.62!important;transition:opacity .18s ease!important;}",
			"#csh-shell-dock:hover,#csh-shell-dock:active{opacity:1!important;}",
			"#csh-shell-dock .csh-sh-pc{display:block!important;flex:0 0 auto!important;font-size:12.5px!important;font-weight:700!important;",
			"color:var(--csh-accent)!important;white-space:nowrap!important;padding:5px 11px!important;border-radius:999px!important;",
			"background:rgba(var(--csh-bg-deep-rgb),.72)!important;border:1px solid rgba(var(--csh-accent-rgb),.30)!important;}",
			"#csh-shell-dock button{flex:0 0 auto!important;min-width:44px!important;height:44px!important;",
			"padding:0!important;font-size:15px!important;line-height:1!important;cursor:pointer!important;user-select:none!important;",
			"border-radius:999px!important;color:var(--csh-paper)!important;background:rgba(var(--csh-bg-deep-rgb),.72)!important;",
			"border:1px solid rgba(var(--csh-accent-rgb),.30)!important;touch-action:manipulation!important;}",
			"#csh-shell-dock button:hover,#csh-shell-dock button:active{border-color:rgba(var(--csh-accent-rgb),.95)!important;",
			"background:rgba(var(--csh-accent-rgb),.22)!important;}",
			/* 壳内 toast（结算/入账提示用，浮在顶带下方） */
			"@keyframes cshShToast{from{transform:translate(-50%,-8px);opacity:0;}to{transform:translate(-50%,0);opacity:1;}}",
			/* 【2026-10-03】原为 white-space:nowrap —— 结算文案随金额变长
			   （「本场净赢 +12,345 CBY · 入账 13,000 · 余额 104,058 · 功勋 +12」约 40 字），
			   在 360px 宽的手机上必然溢出屏幕。改为允许换行 + 最大宽度 92%。 */
			"#" + OV_ID + " .csh-sh-toast{position:absolute!important;left:50%!important;top:50px!important;transform:translate(-50%,0)!important;",
			"z-index:30!important;background:rgba(var(--csh-paper2-rgb),.96)!important;border:1px solid rgba(var(--csh-accent-rgb),.55)!important;color:var(--csh-bg)!important;",
			"padding:7px 16px!important;border-radius:18px!important;font-size:12.5px!important;",
			"max-width:92%!important;text-align:center!important;line-height:1.6!important;",
			"box-shadow:0 6px 18px rgba(0,0,0,.55)!important;animation:cshShToast .25s ease-out!important;pointer-events:none!important;}",
			/* 中带 */
			"#csh-shell-mid{flex:1 1 auto!important;position:relative!important;min-height:0!important;overflow:hidden!important;}",
			"#csh-shell-frame{position:absolute!important;left:0!important;top:0!important;width:100%!important;height:100%!important;",
			"border:0!important;margin:0!important;padding:0!important;display:block!important;background:var(--csh-bg-deep)!important;",
			"touch-action:none!important;}",
			/* 底带（2026-09-30 修复 · 空间浪费）
			   原先 min-height:96px，而带内**只有一句 12px 的提示文字**
			   「局内操作请使用游戏内按钮」—— 96px 里约 90% 是空白，
			   却占掉高屏场景下屏高的 11%，把游戏画面整块往上挤（用户实机截图）。
			   原注释写的是「底带 ≥96px：操作区（拇指热区）」，但操作早已交给游戏内按钮
			   （这句提示文字本身就在说明这一点），这个热区从来没有实际内容。
			   证据：文件里矮屏断点（第 364 行）本来就把它压成 min-height:0 ——
			   说明收窄是安全且已知正确的，现在直接提升为默认，回收约 66px。 */
			/* 底带（2026-10-03 · 整体删除）
			   原本是「操作区（拇指热区）」，但操作早已全部交给游戏内按钮，
			   带内只剩下唯一一句 12px 的提示「局内操作请使用游戏内按钮」——
			   这句既没有信息量（玩家看得见按钮），也不属于玩家需要被告知的事，
			   却常年占着一条横带，把游戏画面往下挤（用户实机截图 + 反复反馈）。
			   2026-09-30 已把它从 96px 压成细条，这次连细条一起删掉：
			   壳的高度 100% 全部让给游戏本身。ensureChrome 里对应的 DOM 也已移除。 */
			"html.csh-sh-open #csh-dbg-float-btn{display:none!important;}",
			/* 暂停遮罩 */
			"#csh-shell-pause{position:absolute!important;left:0!important;top:0!important;width:100%!important;height:100%!important;",
			"z-index:3!important;display:none!important;align-items:center!important;justify-content:center!important;",
			"background:rgba(var(--csh-bg-deep-rgb),.82)!important;}",
			"#csh-shell-pause.on{display:flex!important;}",
			"#csh-shell-pause .csh-sh-pbox{padding:20px 28px!important;border-radius:14px!important;text-align:center!important;",
			"background:rgba(var(--csh-paper2-rgb),.97)!important;border:1px solid rgba(var(--csh-accent-rgb),.4)!important;}",
			"#csh-shell-pause b{display:block!important;font-size:16px!important;color:var(--csh-accent)!important;margin-bottom:12px!important;}",
			"#csh-shell-pause button{min-width:120px!important;height:44px!important;font-size:14px!important;cursor:pointer!important;",
			"border-radius:10px!important;color:var(--csh-bg)!important;background:rgba(var(--csh-paper2-rgb),.92)!important;",
			"border:1px solid rgba(var(--csh-accent-rgb),.6)!important;}",
			/* 遮罩第二颗按钮「离开本局」：次级（幽灵）样式，避免与主按钮「继续」抢注意力 */
			"#csh-shell-pause button.csh-sh-pquit{display:block!important;margin:10px auto 0!important;",
			"color:var(--csh-gray)!important;background:transparent!important;border-color:rgba(var(--csh-accent-rgb),.32)!important;}",
			/* 横屏提示 */
			"#csh-shell-rot{position:absolute!important;inset:0!important;z-index:4!important;display:none!important;",
			"align-items:center!important;justify-content:center!important;background:rgba(var(--csh-bg-deep-rgb),.96)!important;}",
			"#csh-shell-rot.on{display:flex!important;}",
			"#csh-shell-rot .csh-sh-rbox{text-align:center!important;font-size:14px!important;line-height:1.9!important;color:var(--csh-bg)!important;}",
			/* ---------- 入场收费屏（§F.3） ---------- */
			"#" + FEE_ID + "{position:fixed!important;left:0!important;top:0!important;width:100%!important;height:100%!important;",
			"z-index:1000030!important;display:flex!important;align-items:center!important;justify-content:center!important;",
			"padding:12px!important;box-sizing:border-box!important;",
			"background:rgba(var(--csh-bg-deep-rgb),.94)!important;font-family:'Microsoft YaHei','PingFang SC','STHeiti',sans-serif!important;",
			"-webkit-font-smoothing:antialiased!important;text-rendering:optimizeLegibility!important;",
			/* touch-action 由 none → pan-y：none 会连卡片内部滚动一起掐死（手机横屏收费卡被顶部裁切且无法滚动，2026-09-30） */
			"animation:cshShFade .16s ease-out!important;touch-action:pan-y!important;}",
			/* ⚠ 关键：noname 的全局 CSS 有 `div{display:inline-block;position:absolute;transition:all .5s}`，
			   会把壳内每个 div 变成脱流的绝对定位元素 → 卡片内容叠成一团。
			   故必须对本模块所有元素强制复位 position:static / float:none。 */
			"#" + FEE_ID + " *{position:static!important;float:none!important;box-sizing:border-box!important;}",
			"#" + FEE_ID + " .csh-fee-card{animation:cshShUp .18s ease-out!important;width:86%!important;max-width:340px!important;",
			/* 手机横屏（高约 512px）整卡曾高于视口被顶部裁切且不可滚：限高 + 卡内自滚 */
			"max-height:100%!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;",
			"padding:22px 20px!important;border-radius:16px!important;box-sizing:border-box!important;text-align:center!important;",
			"background:rgba(var(--csh-paper2-rgb),.97)!important;border:1px solid rgba(var(--csh-accent-rgb),.4)!important;}",
			"#" + FEE_ID + " h3{display:block!important;margin:0 0 6px!important;font-size:18px!important;color:var(--csh-accent)!important;font-weight:600!important;}",
			"#" + FEE_ID + " .csh-fee-sub{display:block!important;font-size:12px!important;color:var(--csh-gray-soft)!important;margin-bottom:16px!important;}",
			"#" + FEE_ID + " .csh-fee-row{display:flex!important;justify-content:space-between!important;align-items:baseline!important;",
			"font-size:13px!important;color:var(--csh-gray)!important;padding:7px 2px!important;border-bottom:1px dashed rgba(var(--csh-accent-rgb),.18)!important;}",
			"#" + FEE_ID + " .csh-fee-row span{display:inline!important;}",
			"#" + FEE_ID + " .csh-fee-row b{display:inline!important;font-size:15px!important;color:var(--csh-accent)!important;}",
			"#" + FEE_ID + " .csh-fee-row b.warn{color:var(--csh-red)!important;}",
			"#" + FEE_ID + " .csh-fee-acts{display:flex!important;gap:10px!important;margin-top:18px!important;}",
			"#" + FEE_ID + " .csh-fee-acts button{display:block!important;flex:1!important;height:48px!important;font-size:15px!important;",
			"cursor:pointer!important;user-select:none!important;border-radius:10px!important;touch-action:manipulation!important;}",
			"#" + FEE_ID + " .csh-fee-go{color:var(--csh-accent-ink)!important;background:linear-gradient(180deg,var(--csh-accent),var(--csh-accent-dark))!important;",
			"border:1px solid rgba(var(--csh-accent-rgb),.8)!important;font-weight:600!important;}",
			"#" + FEE_ID + " .csh-fee-go[disabled]{opacity:.45!important;cursor:not-allowed!important;filter:grayscale(.5)!important;}",
			"#" + FEE_ID + " .csh-fee-no{color:var(--csh-bg)!important;background:rgba(var(--csh-paper2-rgb),.9)!important;",
			"border:1px solid rgba(var(--csh-accent-rgb),.35)!important;}",
			"#" + FEE_ID + " .csh-fee-tip{display:block!important;margin-top:12px!important;font-size:11px!important;line-height:1.7!important;color:var(--csh-gray-soft)!important;}",
			/* 带入快捷档（德州）：一排金色小胶囊 */
			"#" + FEE_ID + " .csh-fee-chips{display:flex!important;gap:8px!important;margin-top:12px!important;flex-wrap:wrap!important;}",
			"#" + FEE_ID + " .csh-fee-chip{display:block!important;flex:1 1 auto!important;min-width:60px!important;height:38px!important;font-size:13px!important;",
			"cursor:pointer!important;user-select:none!important;border-radius:8px!important;touch-action:manipulation!important;",
			"color:var(--csh-bg)!important;background:rgba(var(--csh-paper2-rgb),.9)!important;border:1px solid rgba(var(--csh-accent-rgb),.3)!important;}",
			"#" + FEE_ID + " .csh-fee-chip.on{color:var(--csh-accent-ink)!important;background:linear-gradient(180deg,var(--csh-accent),var(--csh-accent-dark))!important;",
			"border-color:rgba(var(--csh-accent-rgb),.85)!important;font-weight:600!important;}",
			"#" + FEE_ID + " .csh-fee-chip[disabled]{opacity:.35!important;cursor:not-allowed!important;}",
			/* 未结算退壳确认层（2026-09-29）：带入已真实扣款，直接关壳等于静默损失 */
			"#csh-shell-leave{position:absolute!important;left:0!important;top:0!important;width:100%!important;height:100%!important;",
			"z-index:6!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;",
			"gap:16px!important;background:rgba(var(--csh-bg-deep-rgb),.88)!important;padding:24px!important;box-sizing:border-box!important;}",
			"#csh-shell-leave .csh-sh-leavetxt{display:block!important;text-align:center!important;font-size:14px!important;",
			"line-height:1.9!important;color:var(--csh-bg)!important;}",
			"#csh-shell-leave .csh-sh-leavetxt b{display:inline!important;color:var(--csh-red)!important;}",
			"#csh-shell-leave .csh-sh-leaveacts{display:flex!important;gap:12px!important;}",
			"#csh-shell-leave button{min-width:110px!important;height:44px!important;font-size:14px!important;cursor:pointer!important;",
			"border-radius:10px!important;color:var(--csh-bg)!important;background:rgba(var(--csh-paper2-rgb),.92)!important;",
			"border:1px solid rgba(var(--csh-accent-rgb),.6)!important;}",
			"#csh-shell-leave .csh-sh-leavego{color:var(--csh-red)!important;border-color:rgba(var(--csh-red-rgb),.6)!important;}",
			/* ---------- 手机短视口（横屏/小窗，高 ≤600px）紧凑化（2026-09-30） ----------
			   收费卡整卡可见（压缩行距/按钮），壳底带从 96px 压成细条——
			   手机横屏下原 96px 底带吃掉约 1/5 高度，游戏画面被挤、内部底部按钮遭 iframe 裁切。 */
			"@media (max-height:600px){",
			"#" + FEE_ID + " .csh-fee-card{padding:12px 14px!important;border-radius:12px!important;}",
			"#" + FEE_ID + " h3{font-size:15px!important;margin:0 0 3px!important;}",
			"#" + FEE_ID + " .csh-fee-sub{margin-bottom:8px!important;font-size:11px!important;}",
			"#" + FEE_ID + " .csh-fee-row{padding:4px 2px!important;font-size:12px!important;}",
			"#" + FEE_ID + " .csh-fee-row b{font-size:13px!important;}",
			"#" + FEE_ID + " .csh-fee-chips{margin-top:8px!important;gap:6px!important;}",
			"#" + FEE_ID + " .csh-fee-chip{height:32px!important;font-size:12px!important;min-width:52px!important;}",
			"#" + FEE_ID + " .csh-fee-acts{margin-top:10px!important;gap:8px!important;}",
			"#" + FEE_ID + " .csh-fee-acts button{height:40px!important;font-size:13px!important;}",
			"#" + FEE_ID + " .csh-fee-tip{margin-top:8px!important;font-size:10px!important;line-height:1.5!important;}",
			/* 矮屏（手机横屏）：悬浮件再压一档 —— 壳的每 6px 都是游戏画面 */
			"#csh-shell-dock{right:6px!important;top:4px!important;gap:5px!important;}",
			"#csh-shell-dock .csh-sh-pc{font-size:11.5px!important;padding:4px 9px!important;}",
			"#csh-shell-dock button{min-width:40px!important;height:40px!important;font-size:14px!important;}",
			"#" + OV_ID + " .csh-sh-toast{top:8px!important;font-size:12px!important;padding:6px 12px!important;}",
			"}",
			"html.csh-sh-open #csh-dbg-float-btn{display:none!important;}",
			"html,body{overscroll-behavior:none;}",
		].join("");
		(document.head || document.documentElement).appendChild(st);
	}

	/* ---------- 入场收费屏 ---------- */
	function closeFee() {
		if (feeEl && feeEl.parentNode) feeEl.parentNode.removeChild(feeEl);
		feeEl = null;
	}

	function openFee(key, opts) {
		opts = opts || {};
		var m = META[key];
		if (!m) { toast("未知小游戏: " + key); return; }
		/* 生涯大厅等非游戏页面：免门票、直接开壳（§4.1.6） */
		if (m.lobby) { currentBuyIn = 0; openShell(key, { buyIn: 0 }); return; }
		closeFee();
		ensureStyle();

		var tk = ticketOf(key);
		var W = wallet();
		var pc = W ? W.wallet.pc() : 0;
		var buyIn = Math.max(0, Math.floor(Number(opts.buyIn) || 0));
		var needBuyIn = !!m.needBuyIn;
		var gamesLeft = tk > 0 ? Math.floor(pc / tk) : "∞";

		feeEl = document.createElement("div");
		feeEl.id = FEE_ID;
		var card = document.createElement("div");
		card.className = "csh-fee-card";

		function mkEl(tag, cls, text) {
			var e = document.createElement(tag);
			if (cls) e.className = cls;
			if (text != null) e.textContent = text;
			return e;
		}
		function mkRow(label, value, warn) {
			var row = mkEl("div", "csh-fee-row");
			row.appendChild(mkEl("span", "", label));
			var b = mkEl("b", warn ? "warn" : "", value);
			row.appendChild(b);
			row._val = b;              // 保存值节点引用，供 refresh() 改写
			return row;
		}

		var h3 = mkEl("h3", "", m.title);
		var sub = mkEl("div", "csh-fee-sub", "入场确认 · 池子币计价");
		card.appendChild(h3); card.appendChild(sub);
		/* 门票行：如实展示官阶折扣（2026-09-29 起折扣真正生效） */
		var baseTk = 0;
		try { baseTk = W ? (W.const.TICKET[key] || 0) : 0; } catch (eBT) {}
		/* 单位统一为 CBY（玩家侧货币名，见 config.js「赢取池子币（CBY）」）。
		   【2026-10-03】此前门票 / 合计写的是 "PC" —— 那是钱包内部字段名（pc），
		   属于开发视角泄漏，按 README §二十六（玩家可见文案规范）改掉。 */
		var tkLabel = tk > 0 ? fmt(tk) + " CBY" : "免门票";
		if (baseTk > tk && tk > 0) tkLabel += "（原价 " + fmt(baseTk) + " · 官阶 −" + Math.round((1 - tk / baseTk) * 100) + "%）";
		card.appendChild(mkRow("门票", tkLabel, false));

		/* 带入行 + 合计行 + 当前余额行：德州需要动态刷新（选择带入后合计/按钮联动） */
		var buyInRow = null, costRow = null;
		if (needBuyIn) {
			buyInRow = mkRow("带入", "未选择", true);
			card.appendChild(buyInRow);
		}
		costRow = mkRow("本次合计", fmt(tk) + " CBY", false);
		card.appendChild(costRow);
		card.appendChild(mkRow("当前池子币", fmt(pc), pc < tk));
		card.appendChild(mkRow("还可玩", gamesLeft + (tk > 0 ? " 局" : ""), false));

		var acts = document.createElement("div");
		acts.className = "csh-fee-acts";
		var go = document.createElement("button");
		go.className = "csh-fee-go";
		var no = document.createElement("button");
		no.className = "csh-fee-no";
		no.textContent = "再想想";

		/* 统一刷新：带入值变化时重算 合计 / 余额是否够 / 按钮文案与可用态 */
		function refresh() {
			var total = tk + (needBuyIn ? buyIn : 0);
			var okNow = pc >= total && (!needBuyIn || buyIn > 0);
			if (buyInRow) {
				buyInRow._val.textContent = buyIn > 0 ? fmt(buyIn) + " CBY" : "未选择";
				buyInRow._val.className = buyIn <= 0 ? "warn" : "";
			}
			costRow._val.textContent = fmt(total) + " CBY";
			costRow._val.className = pc >= total ? "" : "warn";
			go.textContent = okNow ? "确认入场" : (pc < total ? "池子币不足" : "请先选带入");
			if (okNow) go.removeAttribute("disabled");
			else go.setAttribute("disabled", "disabled");
			try { paintGamble(); } catch (ePG) {}
		}

		/* 德州：快捷带入档（1/2/全部/自定义由 opts 决定），点选即时刷新 */
		/* 带入档位（2026-09-29 重做）：唯一来源 csh_wallet.BUYIN_TIERS =
		   200 / 2,000 / 20,000 / 200,000。四档**全部列出**（买不起/未解锁的置灰），
		   这样玩家能看见自己的成长目标，而不是被静默隐藏。 */
		var lockedTiers = null;
		try { lockedTiers = W && W.rank && W.rank.unlockedStakes ? W.rank.unlockedStakes() : null; } catch (eLT) {}
		if (needBuyIn) {
			var chips = document.createElement("div");
			chips.className = "csh-fee-chips";
			var presets = (Array.isArray(opts.buyInOptions) && opts.buyInOptions.length)
				? opts.buyInOptions.slice(0, 4)
				: buyInTiers();
			presets.forEach(function (v) {
				var c = document.createElement("button");
				c.className = "csh-fee-chip";
				c.textContent = fmt(v);
				var lockedByRank = !!(lockedTiers && lockedTiers.indexOf(v) < 0);
				if (v > pc || lockedByRank) {
					c.setAttribute("disabled", "disabled");
					c.title = lockedByRank ? "官阶未达，未解锁" : "池子币不足";
				}
				if (isGambleBuyIn(v)) c.title = (c.title ? c.title + " · " : "") + "豪赌桌";
				c.addEventListener("click", function (e) {
					e.preventDefault(); e.stopPropagation();
					if (v > pc || lockedByRank) return;
					buyIn = v;
					for (var j = 0; j < chips.children.length; j++) chips.children[j].className = "csh-fee-chip";
					c.className = "csh-fee-chip on";
					refresh();
				}, true);
				chips.appendChild(c);
			});
			var all = document.createElement("button");
			all.className = "csh-fee-chip";
			all.textContent = "全部";
			all.addEventListener("click", function (e) {
				e.preventDefault(); e.stopPropagation();
				if (pc <= 0) return;
				buyIn = pc;
				for (var j = 0; j < chips.children.length; j++) chips.children[j].className = "csh-fee-chip";
				all.className = "csh-fee-chip on";
				refresh();
			}, true);
			chips.appendChild(all);
			card.appendChild(chips);
		}

		/* 豪赌桌如实标注（2026-09-29 · 用户明确要求"可信度极高、不粉饰"）：
		   选到 200,000 档时，把同桌 AI 的带入倍数与牌技如实写出来。
		   【2026-10-03】按 README §二十六（玩家可见文案规范）统一口径：
		   保留**事实与数字**（带入区间 / 倍数 / 牌技区间 / 风险提示），
		   去掉"为什么这样设计"的开发说明 —— 原句「期望收益为负是设计意图」「他们的钱是
		   从牌桌上**真**赢来的」属于开发视角的解释，改为玩家视角的"会怎样"。 */
		var gambleNote = mkEl("div", "csh-fee-tip");
		gambleNote.style.display = "none";
		card.appendChild(gambleNote);
		function paintGamble() {
			if (!needBuyIn || !isGambleBuyIn(buyIn)) { gambleNote.style.display = "none"; return; }
			var gi = null;
			try { gi = (lib.cshWorld && lib.cshWorld.gambleInfo) ? lib.cshWorld.gambleInfo(buyIn) : null; } catch (eGI) {}
			if (!gi) { gambleNote.style.display = "none"; return; }
			gambleNote.style.display = "block";
			if (key === "blackjack") {
				/* 廿一点是「玩家 vs 一位庄家」：写「同桌牌手 / 同桌牌技」是不成立的描述 ——
				   庄家必须照固定规则要牌（≤16 要、≥17 停），没有决策空间。
				   如实只写它真有的东西：本钱与来源。 */
				gambleNote.innerHTML = "<b style='color:var(--csh-accent)'>豪赌桌</b>　庄家台面本钱 " +
					fmt(gi.stakeMin) + " ~ " + fmt(gi.stakeMax) + " CBY（你的 " + gi.multMin + "~" + gi.multMax + " 倍）<br>" +
					"有钱的牌手才坐得起这个庄，他们的钱都是在牌桌上赢来的<br>" +
					"<span style='color:#c98a6a'>庄家照固定规则要牌，不犯错也不放水 —— 长期打下去，亏的通常是你。</span>";
			} else {
				gambleNote.innerHTML = "<b style='color:var(--csh-accent)'>豪赌桌</b>　同桌牌手带入 " +
					fmt(gi.stakeMin) + " ~ " + fmt(gi.stakeMax) + " CBY（你的 " + gi.multMin + "~" + gi.multMax + " 倍）<br>" +
					"同桌牌技 " + (gi.skillMin || 0).toFixed(2) + " ~ " + (gi.skillMax || 0).toFixed(2) +
					"（满分 1.00）· 他们的钱都是在牌桌上赢来的<br>" +
					"<span style='color:#c98a6a'>赢一次可能通吃，但他们很少失误 —— 长期打下去，亏的通常是你。</span>";
			}
		}

		go.addEventListener("click", function (e) {
			e.preventDefault(); e.stopPropagation();
			var total = tk + (needBuyIn ? buyIn : 0);
			if (pc < total || (needBuyIn && buyIn <= 0)) return;
			doCharge(key, tk, needBuyIn ? buyIn : 0);
		}, true);
		no.addEventListener("click", function (e) {
			e.preventDefault(); e.stopPropagation();
			closeFee();
			emit("close", { key: key, reason: "fee-cancel" });
		}, true);
		acts.appendChild(go); acts.appendChild(no);
		refresh();

		var tip = document.createElement("div");
		tip.className = "csh-fee-tip";
		/* 【2026-10-03】只留玩家真的需要知道的一句：
		   带入制的成本口径。原第二句「确认后扣除门票，进入游戏」是把按钮文案复述一遍。 */
		tip.textContent = needBuyIn ? "带入从池子币扣除，结算后按比例回账。" : "";

		card.appendChild(acts); card.appendChild(tip);
		feeEl.appendChild(card);
		// 滚动穿透：遮罩内阻止冒泡
		feeEl.addEventListener("touchmove", function (e) { e.stopPropagation(); }, { passive: true });
		docHost().appendChild(feeEl);
	}

	function doCharge(key, tk, buyIn) {
		var W = wallet();
		if (!W) { toast("钱包未加载，无法收费"); closeFee(); return false; }
		var total = tk + buyIn;
		if (total > 0) {
			// spendPC 返回布尔：false = 余额不足
			var paid = W.wallet.spend(total, "入场:" + key);
			if (paid !== true && (paid && paid.ok !== true)) { toast("池子币不足"); return false; }
		}
		closeFee();
		logInfo("收费 " + key + " 门票 " + tk + " 带入 " + buyIn);
		currentBuyIn = Math.max(0, Math.floor(Number(buyIn) || 0));
		emit("charge", { key: key, charged: total });
		openShell(key, { buyIn: buyIn });
		return true;
	}

	/* ---------- 壳 ---------- */
	/* ---------- 子页面经济桥（§4.1.1 统一钱包） ----------
	   子页面在 iframe 内无法直接访问宿主 CSH.wallet，
	   故通过 postMessage 请求宿主代扣/代记账。
	   应答统一用 { __csh:"shell-wallet-ack"|"shell-buyin-ack"|..., req, ok, data } 回发。*/
	function walletSnapshot() {
		var W = wallet();
		if (!W) return null;
		var out = {
			pc: 0, pcPeak: 0, rank: null, streak: 0, signedToday: false,
			buyIn: currentBuyIn, key: current,
			/* 门票额：门票制游戏的入场费（含官阶折扣）。
			   带入制游戏（德州 / 斗地主 / 廿一点）门票为 0，真实成本是带入。 */
			ticket: current ? ticketOf(current) : 0,
			/* 最低非零门票 = 破产救济门槛（§F.4）。此前 career.html 自己硬编码 150，
			   与钱包里的 RELIEF_THRESHOLD 是两份副本。 */
			minTicket: (REG && typeof REG.minTicket === "function") ? REG.minTicket() : 150,
			/* 2026-09-29：删除 quota / bank（死字段），改为真实字段 */
			tiers: buyInTiers(), gamble: isGambleBuyIn(currentBuyIn),
			/* 资产里程碑（第四轮）：游戏页的「余额进度条」直接消费宿主算好的阶梯，
			   不再各自写一套口径（此前德州页 min(100, bank/200000×100) 一过 20 万就恒满） */
			bankSteps: (W && W.bankSteps) ? W.bankSteps() : null,
			bankLadder: null,
		};
		try { out.pc = W.wallet.pc(); } catch (e) {}
		/* 阶梯求值也由钱包唯一实现（游戏页只读结果，不重算） */
		try { out.bankLadder = W.bankLadder ? W.bankLadder(out.pc) : null; } catch (eBL) {}
		try { out.pcPeak = W.wallet.peak(); } catch (eP) {}
		try { out.streak = W.wallet.get().streak || 0; } catch (e2) {}
		try { out.signedToday = W.wallet.canSign ? !W.wallet.canSign() : false; } catch (e3) {}
		/* 下次签到可得额度（取代已删除的 shell-sign-state 命令） */
		try { out.signNext = W.wallet.signAmount ? W.wallet.signAmount((W.wallet.get().streak || 0) + 1) : 0; } catch (eS) {}
		try { if (W.rank && W.rank.get) out.rank = W.rank.get(); } catch (e4) {}
		try { if (W.rank && W.rank.perks) out.perks = W.rank.perks(); } catch (e5) {}
		/* 本局结算口径（来自 core/csh_registry.js 单一真值）：
		   {mode, ticket, perBeat|scoreRate|decay, capMult}。游戏页据此**如实**展示
		   「第 N 名得多少 / 每分多少钱」，不再各自硬编码 300/180/90 之类。 */
		try { out.plan = (W && typeof W.planOf === "function" && current) ? W.planOf(current) : null; } catch (ePl) {}
		try { if (W.task && W.task.state) out.tasks = W.task.state(); } catch (e6) {}
		try {
			if (lib.cshWorld && lib.cshWorld.stats) out.world = lib.cshWorld.stats();
		} catch (e7) {}
		return out;
	}
	function ackToGame(req, ok, data, reqOverride) {
		/* 回显**本次请求的真实 ID**（CUR_REQ），而不是传进来的命令名常量。
		   第 4 参 reqOverride 供异步分支（导出/导入）显式传入捕获到的请求 ID。 */
		var id = (reqOverride != null && reqOverride !== "") ? reqOverride
			: ((CUR_REQ != null && CUR_REQ !== "") ? CUR_REQ : req);
		postToGame({ __csh: req + "-ack", req: id, ok: !!ok, data: data == null ? null : data });
	}
	/* 来源校验（§3.7）：只接受来自**当前 iframe** 的消息。
	   修复（2026-09-29 红队 P2）：改为 fail-closed —— 来源缺失 / 取不到本帧窗口 /
	   校验抛异常，一律拒绝；只有「来源明确存在且就是本帧 contentWindow」才放行。
	   真实浏览器 postMessage 必带 source，本帧游戏页的 source 即其 iframe 的
	   contentWindow，二者一致即放行；非法/伪造消息不再被信任。 */
	function fromCurrentFrame(e) {
		try {
			var src = e && e.source;
			if (!src) return false;            // fail-closed：缺来源即拒绝
			var fr = document.getElementById("csh-shell-frame");
			if (!fr || !fr.contentWindow) return false;
			return src === fr.contentWindow;
		} catch (err) { return false; }        // fail-closed：异常也拒绝
	}
	/* 成就统计聚合（2026-09-28 新增）：只读，把各模块数据归成一张快照。
	   任何子模块缺失都降级为 0，绝不抛错。 */
	function buildStats() {
		/* 统计口径（2026-09-29 重写）：
		   每一项都必须是**真实可核**的字段，禁止任何占位/推算值。
		   已删除：bank（全仓无写入）、quota（恒 1200）。 */
		var s = {
			pc: 0, pcPeak: 0, streak: 0, signedToday: false,
			rank: 0, merit: 0, meritToday: 0, segIdx: 0, segName: "",
			cdkCount: 0, cdkGained: 0, cdkMax: 0,
			wrGames: 0, wrWin: 0, wrLose: 0, wrKill: 0, wrChars: 0, wrModes: 0,
			worldChars: 0, worldHands: 0, worldFundMin: 0, worldFundMax: 0,
			worldTopFund: 0, worldRetired: 0, worldSkillTop: 0,
			billionaires: 0, billionaireBroke: 0,
			interactTotal: 0,
			taskDone: 0, taskTotal: 0,
			gamblePlays: 0, gambleWins: 0, gambleNet: 0, gambleBest: 0, gambleBust: 0, gambleBestStreak: 0,
			nightOwl: false,
		};
		/* 夜猫子：真实时间判定（0:00–3:59 之间调用统计即成立） */
		try { var __h = new Date().getHours(); s.nightOwl = (__h >= 0 && __h < 4); } catch (eH) {}
		try {
			var W = wallet();
			if (W) {
				var g = W.wallet.get();
				s.pc = g.pc || 0; s.pcPeak = g.pcPeak || 0; s.streak = g.streak || 0;
				s.signedToday = !!g.signedToday;
				var r = W.rank.get();
				if (r) {
					s.rank = r.rank || 0; s.merit = r.merit || 0; s.meritToday = r.meritToday || 0;
					if (r.seg) { s.segIdx = r.seg.seg || 0; s.segName = r.seg.name || ""; }
				}
				var t = W.task.state();
				if (t && t.defs) {
					s.taskTotal = t.defs.length;
					for (var ti = 0; ti < t.defs.length; ti++) if (t.defs[ti].done) s.taskDone++;
				}
			}
		} catch (e0) {}
		try {
			var C = lib.cshWallet && lib.cshWallet.cdk;
			if (C) {
				var lf = C.lifetime ? C.lifetime() : null;
				s.cdkCount = lf ? (lf.count || 0) : (C.usedCount ? C.usedCount() : 0);
				s.cdkGained = lf ? (lf.gained || 0) : 0;
				/* 单笔最大面额：取最近兑换记录里的最大 amount（成就「单笔大额」用） */
				var rec = C.recent ? (C.recent() || []) : [];
				for (var ri = 0; ri < rec.length; ri++) {
					var am = Number(rec[ri] && rec[ri].amount) || 0;
					if (am > s.cdkMax) s.cdkMax = am;
				}
			}
		} catch (e1) {}
		try {
			var d = lib.config["extension_池子魔将_winrateData"];
			if (d && typeof d === "object") {
				var chars = {};
				for (var m in d) {
					if (!Object.prototype.hasOwnProperty.call(d, m)) continue;
					if (m === "camps" || m === "me") continue;
					var md = d[m];
					if (!md || typeof md !== "object" || Array.isArray(md)) continue;
					var hasMode = false;
					for (var n in md) {
						if (!Object.prototype.hasOwnProperty.call(md, n)) continue;
						var e2 = md[n];
						if (!e2 || typeof e2 !== "object") continue;
						if (!e2.games) continue;
						s.wrGames += e2.games || 0; s.wrWin += e2.win || 0; s.wrLose += e2.lose || 0;
						s.wrKill += e2.kill || 0;
						chars[n] = 1; hasMode = true;
					}
					if (hasMode) s.wrModes++;
				}
				s.wrChars = 0;
				for (var c in chars) if (Object.prototype.hasOwnProperty.call(chars, c)) s.wrChars++;
			}
		} catch (e3) {}
		try {
			var wl = (lib.cshWorld && lib.cshWorld.list) ? lib.cshWorld.list() : [];
			s.worldChars = wl.length;
			var fundMin = Infinity, fundMax = 0, skillTop = 0;
			for (var i = 0; i < wl.length; i++) {
				s.worldHands += wl[i].hands || 0;
				if (wl[i].retired) s.worldRetired++;
				if (wl[i].fund != null) {
					if (wl[i].fund < fundMin) fundMin = wl[i].fund;
					if (wl[i].fund > fundMax) fundMax = wl[i].fund;
				}
				if ((wl[i].skill || 0) > skillTop) skillTop = wl[i].skill || 0;
			}
			s.worldFundMin = fundMin === Infinity ? 0 : fundMin;
			s.worldFundMax = fundMax;
			s.worldTopFund = fundMax;
			s.worldSkillTop = skillTop;
			/* 豪赌席人数 / 曾被玩家打穿的首富数（真实计数，成就数据源） */
			try {
				var wst = (lib.cshWorld && lib.cshWorld.stats) ? lib.cshWorld.stats() : null;
				if (wst) {
					s.billionaires = wst.tier3 || 0; s.billionaireBroke = wst.billionaireBroke || 0;
					/* 世界动态的累计计数（2026-10-03）：成就引擎直接读这几个字段 */
					s.recordsSeen = wst.recordsSeen || 0; s.tierDown = wst.tierDown || 0;
					s.comebacks = wst.comebacks || 0; s.rivals = wst.rivals || 0; s.grudge8 = wst.grudge8 || 0;
				}
			} catch (eWs) {}
			var gs = (lib.cshWorld && lib.cshWorld.gambleStats) ? lib.cshWorld.gambleStats() : null;
			if (gs) {
				s.gamblePlays = gs.plays || 0; s.gambleWins = gs.wins || 0;
				s.gambleNet = gs.net || 0; s.gambleBest = gs.best || 0; s.gambleBust = gs.bust || 0;
				s.gambleBestStreak = gs.bestStreak || 0;
			}
		} catch (e4) {}
		try {
			if (lib.cshInteract && lib.cshInteract.stats) s.interactTotal = lib.cshInteract.stats().total || 0;
		} catch (e5) {}
		return s;
	}
	/* ⚠ 2026-09-29 删除两条**死通道**（架构收敛）：
	     · buyInCharge()（shell-buyin）—— 带入扣款已统一在入场收费屏 doCharge 内完成，
	       没有任何子页面调用它；留着一个能主动花玩家钱的桥命令纯属攻击面。
	     · cashOut()（shell-cashout）—— 回账已统一走 settle / settleSession
	       （会话级幂等），cashOut 是第三套并行入账实现（连同它自己的 ACK_SEEN
	       去重表 512 条 FIFO，也是唯一的内存增长点）。
	   两者都是「当年还没收敛时的过渡实现」，此次一并清除，连同 ACK_SEEN/ACK_ORDER。 */

	/* 本场结算（牌桌类 · 2026-09-29 归一）：
	   = settle()（唯一的金额计算与入账 + 唯一提示 + 唯一事件）
	     + 「AI 世界双向记账」。本函数**不再自己算钱**。

	   历史问题：此前本函数另写了一遍 payout 公式（含一份硬编码回收率 rate0），
	   与 settle() 分叉 ⇒ 同一局走 shell-settle 与 shell-settle-session 两条通道
	   拿到的钱不一样；且那遍公式把净赢 max(0,…) 钳平后走"正收益"分支，
	   导致输光筹码也满额返还（输钱不亏）。现全部收敛到 wallet.settle。

	   data = { key, buyIn, chips, seats:[{id, stake}], gamble }
	   · 玩家净赢 = chips − buyIn
	   · 净赢为正 → 按同桌 AI 带入比例从各 AI 资金扣除（世界真实失血）
	   · 净赢为负 → 按比例把输掉的钱记入各 AI 资金（世界真实回血）
	   两侧零和：玩家赢多少，世界就少多少（回收率部分视为"台费"，蒸发）。 */
	function settleSession(key, data) {
		data = data || {};
		var k = data.key || current || "texas";
		var buyIn = Math.max(0, Math.floor(Number(data.buyIn) || 0));
		var chips = Math.max(0, Math.floor(Number(data.chips) || 0));
		var seats = Array.isArray(data.seats) ? data.seats : [];

		var aiTotal = 0, i;
		for (i = 0; i < seats.length; i++) aiTotal += Math.max(0, Math.floor(Number(seats[i] && seats[i].stake) || 0));

		/* 玩家侧：金额 + 入账 + 提示 + 事件，全部在 settle 内完成 */
		var res = settle(k, { buyIn: buyIn, chips: chips, aiStakeTotal: aiTotal });
		if (!res) return null;
		var profit = res.profit || 0;
		var credited = res.credited || 0;

		/* —— AI 世界双向记账 ——
		   ★ 玩家赢时，世界失血按玩家的**实际净增**（入账 − 带入）计算。
		   pc 触顶（PC_CAP 上限）时 addPC 会截断，若仍按理论 profit×回收率 扣 AI，
		   差额会凭空蒸发（玩家没拿到、AI 却被扣了，账不平）。 */
		var world = lib.cshWorld;
		var settled = [];
		if (world && aiTotal > 0 && seats.length && profit !== 0) {
			var realGain = profit >= 0 ? Math.max(0, credited - buyIn) : 0;
			var moved = profit >= 0
				? Math.min(Math.floor(profit * (res.rate == null ? 0.9 : res.rate)), aiTotal, realGain)
				: Math.min(-profit, aiTotal);
			var left = moved;
			for (i = 0; i < seats.length; i++) {
				var s = seats[i] || {};
				var st = Math.max(0, Math.floor(Number(s.stake) || 0));
				if (st <= 0 || !s.id) continue;
				var share = (i === seats.length - 1) ? left : Math.floor(moved * st / aiTotal);
				if (share <= 0) continue;
				left -= share;
				var wr = null, wErr = null;
				try {
					wr = (profit >= 0) ? world.settleLose(s.id, share) : world.settleWin(s.id, share);
				} catch (e2) { wErr = e2; logError("AI 侧结算异常（" + s.id + "）", e2); }
				/* delta = AI 资金**真实**变动（settleWin 会抽 5% 台费、并受资金上限钳制），
				   不是名义 share —— 否则消费方（UI / 成就）读到的账与真实资金对不上。
				   ★ 2026-10-03（审计 §7）：结算抛异常时**不再拿名义 share 冒充 delta**——
				   那是"看起来像结算成功"的假账，记账方会按已入账统计；改为如实记 0
				   并打 failed 标记，异常同时进错误日志（不再静默吞掉）。 */
				if (!wr || typeof wr._delta !== "number") {
					settled.push({ id: s.id, delta: 0, asked: profit >= 0 ? -share : share, failed: true });
				} else {
					settled.push({ id: s.id, delta: wr._delta, asked: profit >= 0 ? -share : share });
				}
			}
		} else if (world && seats.length && profit === 0) {
			/* U10（2026-10-01 平局补记）：平局时 AI 的 hands 也要 +1，
			   否则胜率榜分母虚高（此前 profit !== 0 守卫连 settlePlay 一起跳过）。
			   ★ 2026-10-03：传 isDraw=true —— 平局还要走 advanceState 的和局分支
			   （drew 计数 / 手感回归 / 经验），否则"平局数"永远显示 0。 */
			for (i = 0; i < seats.length; i++) {
				var s0 = seats[i] || {};
				if (!s0.id) continue;
				try { world.settlePlay(s0.id, true); settled.push({ id: s0.id, delta: 0, asked: 0 }); }
				catch (eP) { logError("平局补记失败（" + s0.id + "）", eP); }
			}
		}

		res.game = "session";
		res.aiSettled = settled;
		/* 豪赌桌战绩（成就 / 生涯大厅的真实数据源） */
		if (data.gamble && world && world.noteGamble) {
			try { res.gamble = world.noteGamble(profit); } catch (eG) {}
		}
		paintTop();
		logInfo("本场结算 " + k + " 带入 " + buyIn + " 结算筹码 " + chips + " → 入账 " + credited +
			"（AI 世界 " + settled.length + " 笔联动）");
		return res;
	}
	/* ---------- 壳 ---------- */
	function ensureChrome() {
		var ov = document.getElementById(OV_ID);
		if (ov) return ov;
		ov = document.createElement("div");
		ov.id = OV_ID;

		var wrap = document.createElement("div");
		wrap.id = "csh-shell-wrap";

		/* 【2026-10-03 用户决定：整条顶带删除】
		   旧顶带 40px（矮屏 34px）：游戏名 + 带入/门票/余额/时长 + 关闭。
		   它不是单独存在 —— 下面是游戏页自己的「街道/筹码/盲注」条与
		   「生涯/带入/连签/第几手」条，三层叠在牌桌上：
		   手机横屏 412px 屏高里合计约 90px（22%），顶部一排在座的 AI
		   说话/行动就发生在这块被吃掉的空间里（用户实机截图）。
		   现在只剩右上角一组**半透明悬浮件**：余额胶囊 + 关闭按钮。
		   余额必须常驻（2026-09-28 用户明确要过「一个可以查看池子币的地方」）；
		   游戏名/带入/时长不再常驻（结算横幅与游戏内各自呈现）。
		   骨架 csh_layout.css 给 .csh-topbar 右侧预留了空白带，悬浮件不压数据。 */
		var mid = document.createElement("div");
		mid.id = "csh-shell-mid";
		var fr = document.createElement("iframe");
		fr.id = "csh-shell-frame";
		fr.setAttribute("frameborder", "0");
		fr.setAttribute("scrolling", "no");
		fr.setAttribute("allow", "autoplay; fullscreen");
		mid.appendChild(fr);

		/* 暂停遮罩 */
		var pz = document.createElement("div");
		pz.id = "csh-shell-pause";
		var pbox = document.createElement("div");
		pbox.className = "csh-sh-pbox";
		var pb = document.createElement("b");
		pb.textContent = "已暂停";
		/* ★ 2026-09-29 第四轮：按钮语义必须与文案一致。
		   旧写法是 togglePause() —— 文案写着「继续」，动作却是"切换"：
		   只要内部 paused 与遮罩可见性有一帧不同步，点「继续」反而会变成暂停。
		   改为直呼 resume()；另补一颗「离开本局」—— 此前遮罩里只有唯一出路，
		   想退出只能先继续再找关闭，等于把玩家锁在暂停里。
		   离开走 close("user")，未结算时仍会弹「损失带入」二次确认（与顶带关闭同一条链路）。 */
		var pbtn = document.createElement("button");
		pbtn.textContent = "继续";
		pbtn.addEventListener("click", function (e) { e.preventDefault(); resume(); }, true);
		var pquit = document.createElement("button");
		pquit.className = "csh-sh-pquit";
		pquit.textContent = "离开本局";
		pquit.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); close("user"); }, true);
		pbox.appendChild(pb); pbox.appendChild(pbtn); pbox.appendChild(pquit);
		pz.appendChild(pbox);
		mid.appendChild(pz);

		/* 横屏提示 */
		var rot = document.createElement("div");
		rot.id = "csh-shell-rot";
		/* 横屏提示（2026-10-03 精简）：原第三行「若已横屏仍显示，请检查系统自动旋转」
		   是排障说明，不是玩家需要读的内容 —— 判定已经覆盖旋转后的 resize 事件，
		   真出现误判也不该把解释成本转嫁给玩家。 */
		rot.innerHTML = "<div class='csh-sh-rbox'>本游戏为横屏体验<br>请旋转手机 →</div>";
		mid.appendChild(rot);

		/* 悬浮控制组（最后挂 → 画在遮罩之上）：余额胶囊 + 关闭。
		   半透明常驻，hover/按下变为不透明；不遮游戏数据靠骨架预留的右侧空白带。 */
		var dock = document.createElement("div");
		dock.id = "csh-shell-dock";
		var pcShow = document.createElement("span");
		pcShow.className = "csh-sh-pc";
		pcShow.textContent = "";
		var btnClose = document.createElement("button");
		btnClose.id = "csh-shell-close";
		btnClose.type = "button";
		btnClose.setAttribute("aria-label", "关闭");
		btnClose.textContent = "✕";
		btnClose.addEventListener("click", function (e) { e.preventDefault(); close("user"); }, true);
		dock.appendChild(pcShow); dock.appendChild(btnClose);
		mid.appendChild(dock);

		wrap.appendChild(mid);
		ov.appendChild(wrap);
		// 滚动穿透
		ov.addEventListener("touchmove", function (e) {
			if (e.target === ov) e.stopPropagation();
		}, { passive: true });
		docHost().appendChild(ov);
		return ov;
	}

	function setTop(text) {
		/* 【2026-10-03】状态文本不再有渲染位（顶带已删）——只留状态记录，
		   桥协议（tickStatus / CSH.shell.tick）不变，老页面调用不报未定义。 */
		topText = String(text == null ? "" : text);
	}
	/* 子页面通过 CSH.shell.tick 更新顶带状态（旧桥命令已移除）。
	   存进 regCfg 而不是直接 setTop，这样 paintTop 的秒级刷新不会把它冲掉。 */
	function tickStatus(text) {
		if (!current) return false;
		regCfg[current] = regCfg[current] || {};
		regCfg[current].status = String(text == null ? "" : text);
		paintTop();
		return true;
	}
	/* 秒级刷新（2026-10-03 起）：只刷新右上角余额胶囊。
	   原先还拼「带入/门票/余额/已玩」写入整条顶带 —— 顶带删除后那条信息链一并删除。 */
	function paintTop() {
		paintPc();
	}
	/* 【2026-10-03】游戏名不再常驻显示（顶带已删）—— 保留空实现，
	   调用点（openShell）不动；避免把「改壳」变成「改壳 + 删函数 + 改调用」三处联动。 */
	function setTitle(text) { /* 无渲染位，见上 */ }

	function openShell(key, opts) {
		var m = META[key];
		if (!m) return false;
		closeShell(true);
		/* 【2026-09-30 修复 · 配乐叠播】进入小游戏时，必须先停掉主页面（池子休闲面板）的 BGM。
		   主页面与游戏 iframe 是**两个独立 window、各有独立 AudioContext**，
		   两边各播各的、谁也管不了谁 —— 不显式停就会出现
		   「面板 lobby + 游戏主题曲」两路同时响（用户实机反馈「叠播」）。
		   退出游戏时由 closeShell 恢复 lobby。 */
		try { if (lib.cshBgm) lib.cshBgm.stop(); } catch (eBgmA) {}
		/* ★ 2026-09-29 修复两处真 bug，根因都是「current / currentBuyIn 定得太晚」：
		   ① 顶带首帧永远为空 —— 此前 `current = key` 写在 paintTop() 之后，
		      paintTop 里 `if (!current) return;` 直接退出，状态 / 带入 / 余额全不显示；
		   ② 二次进同一游戏带入凭空消失 —— doCharge 先赋 currentBuyIn，
		      随后 openShell → closeShell 又把它清 0（仅当壳已存在时），
		      于是顶带显示「门票」而非「带入」，未结算退壳保护也随之失效。
		   现在统一在 paintTop 之前从 opts.buyIn 取真值（doCharge 传的就是它）。 */
		current = key;
		currentBuyIn = Math.max(0, Math.floor(Number(opts && opts.buyIn) || 0));
		ensureStyle();
		bindMessage(); bindEsc(); bindVisibility();
		/* 新入场 = 新会话：清空结算守卫（上一局的"已结算"不能带到这一局） */
		GUARD = {};

		var ov = ensureChrome();
		setTitle(m.title);
		paused = false; totalPaused = 0; enteredAt = Date.now();
		paintTop();                      /* 顶带真实状态（带入 / 门票 / 余额 / 时长） */
		paintPc();                       /* 顶带 CBY 余额（2026-09-28 新增） */
		try { docHost().classList.add("csh-sh-open"); } catch (e) {}

		var fr = document.getElementById("csh-shell-frame");
		try { fr.src = urlOf(key); } catch (e0) {}

		/* 横屏检测 */
		checkOrientation(key);

		/* 时长秒级刷新（仅游戏，不含大厅）。失败（沙箱无 setInterval）则静默降级。 */
		try {
			if (tickTimer) clearInterval(tickTimer);
			tickTimer = setInterval(function () {
				if (!current) { clearInterval(tickTimer); tickTimer = 0; return; }
				paintTop();
			}, 1000);
		} catch (eTk) {}
		logInfo("开壳 " + key + " → " + fr.src);
		return true;
	}

	function checkOrientation(key) {
		var m = META[key];
		var rot = document.getElementById("csh-shell-rot");
		if (!m || !rot) return;
		if (!m.landscape) { rot.classList.remove("on"); return; }
		var landscape = true;
		try {
			landscape = (window.innerWidth || 0) >= (window.innerHeight || 0);
		} catch (e) {}
		if (!landscape) rot.classList.add("on"); else rot.classList.remove("on");
	}

	function closeShell(silent) {
		cancelSelfClose();      /* 壳真要拆了：清掉委托关窗的兜底定时器与状态 */
		var ov = document.getElementById(OV_ID);
		if (!ov) { current = null; return false; }
		removeLeave();
		var fr = document.getElementById("csh-shell-frame");
		try { if (fr) fr.src = "about:blank"; } catch (e0) {}
		try { if (ov.parentNode) ov.parentNode.removeChild(ov); } catch (e1) {}
		try { docHost().classList.remove("csh-sh-open"); } catch (e2) {}
		if (tickTimer) { clearInterval(tickTimer); tickTimer = 0; }
		/* 2026-09-29 优化：关壳前强制落盘最后一拍（钱包已改合并写盘，避免退出瞬间丢 ≤250ms 改动） */
		try { var _W = wallet(); if (_W && typeof _W.flushSave === "function") _W.flushSave(); } catch (eFs) {}
		if (!silent) logInfo("关壳 " + (current || "?"));
		current = null; paused = false; currentBuyIn = 0;
		/* 【2026-09-30 修复 · 配乐叠播】退出小游戏后恢复主页面 BGM。
		   只有当「池子休闲面板还开着」才恢复 —— 玩家会回到面板继续挑游戏；
		   若面板已关（例如从悬浮球直接开局再退出），则不擅自起播，
		   避免又出现「在无名杀本体里听见池子配乐」的老问题。 */
		try {
			/* `!silent` 很关键：openShell 开头就会调 closeShell(true) 来替换旧壳，
			   那不是「玩家退出游戏」而是「换一个游戏」。若不过滤，
			   切游戏时会先冒出一小段 lobby 再被 openShell 的 stop() 掐掉（能听出来）。 */
			if (!silent && lib.cshBgm && document.getElementById("csh-dbg-overlay")) {
				lib.cshBgm.play("lobby");
			}
		} catch (eBgmB) {}
		return true;
	}

	function togglePause() {
		if (!current) return false;
		if (paused) resume(); else pause();
		return true;
	}
	function pause(auto) {
		if (!current || paused) return false;
		paused = true; pausedAuto = !!auto; pausedAt = Date.now();
		var pz = document.getElementById("csh-shell-pause");
		if (pz) pz.classList.add("on");
		postToGame({ __csh: "pause", auto: !!auto });
		emit("pause", { key: current, auto: !!auto });
		logInfo("暂停 " + current + (auto ? "（自动）" : ""));
		return true;
	}
	function resume() {
		if (!current || !paused) return false;
		if (pausedAt) { totalPaused += Date.now() - pausedAt; pausedAt = 0; }
		paused = false; pausedAuto = false;
		var pz = document.getElementById("csh-shell-pause");
		if (pz) pz.classList.remove("on");
		postToGame({ __csh: "resume" });
		emit("resume", { key: current });
		logInfo("恢复 " + current);
		return true;
	}
	function isPaused() { return paused; }
	/* 局内有效时长（扣除暂停） */
	function elapsed() {
		if (!enteredAt) return 0;
		var end = paused && pausedAt ? pausedAt : Date.now();
		return end - enteredAt - totalPaused;
	}

	function postToGame(msg) {
		try {
			var fr = document.getElementById("csh-shell-frame");
			if (fr && fr.contentWindow) fr.contentWindow.postMessage(msg, "*");
		} catch (e) {}
	}

	/* ---------- 消息 / Esc / 失焦（§E.4） ---------- */
	function onMessage(e) {
		try {
			var d = e && e.data;
			if (!d || typeof d !== "object") return;
			var cmd = d.__csh;
			if (!cmd) return;
			if (!fromCurrentFrame(e)) { logError("丢弃非本帧消息：" + cmd); return; }
			/* 记下本次真实请求 ID：后续所有 ackToGame 回显它（P0-0 修复） */
			CUR_REQ = (typeof d.req === "string" && d.req) ? d.req : null;
			var req0 = CUR_REQ;
			// 子页面关闭协议（2026-09-29 修正）
			/* ⚠ 真 bug：此前旧协议正则 `/-close$/` 写在最前面，而 `shell-close` 同样
			   以 `-close` 结尾 ⇒ 被它先捕获，剥出前缀 "shell" 与 current 不相等
			   ⇒ **`shell-close` 永远不会关壳**（下面那条分支成了不可达死代码）。
			   修法：① 先判 `shell-close`；② 旧协议收敛为显式白名单，不再靠后缀猜。 */
			if (cmd === "shell-close") { close("game"); return; }
			if (typeof cmd === "string" && LEGACY_CLOSE[cmd]) {
				if (!current || LEGACY_CLOSE[cmd] === current) close("game");
				return;
			}
			if (cmd === "shell-settle") {
				/* 会话级幂等（与 shell-settle-session 共用同一个键）：一次入场只结算一次。
				   此前两族命令各用 r| / S| 两个键 ⇒ 客户端（或伪造消息）两条都发就重复入账。 */
				var gk1 = guardKey();
				if (GUARD[gk1]) { ackToGame("shell-settle", true, GUARD[gk1]); return; }
				var r1 = settle(current, d.data || {});
				/* ★ 2026-09-29 P0：应答必须带 ok —— 此前 res 里没有 ok 字段，
				   子页面若校验 data.ok 会把成功结算误判为失败（德州「实得 0」谎报的根因之一）。 */
				r1.ok = true;
				GUARD[gk1] = r1;
				ackToGame("shell-settle", true, r1);
				selfCloseAfterSettle(r1);   /* ★ 2026-09-30：委托关窗时，结算落地即关壳 */
				return;
			}
			/* 经济桥（§4.1.1）：子页面请求宿主钱包快照 */
			if (cmd === "shell-wallet") { ackToGame("shell-wallet", true, walletSnapshot()); return; }
			if (cmd === "shell-sign") {
				var W2 = wallet();
				var s = null;
				try { s = W2 && W2.wallet.sign ? W2.wallet.sign(d.today) : null; } catch (e2) {}
				ackToGame("shell-sign", !!(s && s.ok), s);
				return;
			}
			/* 功勋上报（§G.6.2 / §G.6.3）：各游戏只报 n + reason，
			   软上限 / 高段衰减 / 不可购买全部由 csh_wallet.addMerit 内部实现 */
			if (cmd === "shell-merit") {
				var WM = wallet();
				var mr = null;
				try { mr = WM && WM.rank.addMerit ? WM.rank.addMerit(d.n, d.reason) : null; } catch (e3) {}
				ackToGame("shell-merit", !!(mr && mr.ok !== false), mr);
				paintPc();
				return;
			}
			/* 成就系统（2026-09-28 新增）：聚合各模块统计 → 生涯大厅成就引擎评估。
			   只读聚合，不写任何状态；解锁奖励走 shell-ach-claim。 */
			if (cmd === "shell-stats") {
				ackToGame("shell-stats", true, buildStats());
				return;
			}
			/* 成就领奖：服务端（宿主侧）复核条件 → 入账 → 标记已领。
			   复核用 window.CSH_ACHV（本档文档里的同一份引擎），防伪造桥消息刷奖励。 */
			if (cmd === "shell-ach-claim") {
				var AC = (typeof window !== "undefined" && window.CSH_ACHV) || null;
				var rA = { ok: false };
				try {
					var defA = AC && AC.byId ? AC.byId(d.key) : null;
					if (!defA) rA.reason = "成就不存在";
					else if (AC.claimed(d.key)) { rA.ok = true; rA.reward = defA.reward; rA.already = true; }
					else {
						var stA = buildStats();
						var stOK = AC.byKey(d.key) ? AC.test(defA, stA) : false;
						if (!stOK) rA.reason = "条件未达成";
						else {
							var WA2 = wallet();
							var gotA = WA2 ? WA2.wallet.add(defA.reward || 0, "成就:" + defA.label) : 0;
							AC.markClaimed(d.key);
							rA.ok = true; rA.reward = defA.reward || 0; rA.gained = gotA;
							rA.balance = WA2 ? WA2.wallet.pc() : 0;
							shellToast("成就达成「" + defA.label + "」 +" + fmt(defA.reward || 0) + " CBY");
							paintPc();
						}
					}
				} catch (eAC) { rA.reason = String(eAC && eAC.message || eAC); }
				ackToGame("shell-ach-claim", !!rA.ok, rA);
				return;
			}
			/* 生涯大厅专用桥（§4.1.6 / §G.7 / §I）
			   2026-09-29：补 seg / perks / segList —— 段名与官阶加成改为
			   **从钱包取真值**，取代 career.html 里那套与之冲突的本地 segOf/perksOf。 */
			if (cmd === "shell-rank-all") {
				var WA = wallet();
				var list = null, cur = null, perks = null, segList = null, perksAll = null;
				try { list = WA && WA.rank.allRanks ? WA.rank.allRanks() : null; } catch (eA) {}
				try { cur = WA && WA.rank.get ? WA.rank.get() : null; } catch (eB) {}
				try { perks = WA && WA.rank.perks ? WA.rank.perks() : null; } catch (ePe) {}
				try { segList = WA && WA.rank.segList ? WA.rank.segList() : null; } catch (eSl) {}
				try { perksAll = WA && WA.rank.perksAll ? WA.rank.perksAll() : null; } catch (ePa) {}
				ackToGame("shell-rank-all", !!WA, {
					ranks: list, current: cur, perks: perks, segList: segList, perksAll: perksAll,
				});
				return;
			}
		if (cmd === "shell-world") {
			var WW = wallet(); var wl = null;
			try { wl = (lib.cshWorld && lib.cshWorld.leaderboard) ? lib.cshWorld.leaderboard() : null; } catch (eC) {}
			var ai = null;
			try { ai = (lib.cshWorld && lib.cshWorld.list) ? lib.cshWorld.list() : null; } catch (eD) {}
			/* 叙述层（2026-10-03）：把"世界史"与"世界动态（流言）"一并下发 ——
			   它们都是只读派生（worldWorld/records/history → 人话），生涯大厅直接渲染。
			   尺寸有界：news 默认 8 条、每条一句话；worldStory 是聚合对象。 */
			var story = null, wnews = null, wstats = null;
			try { story = (lib.cshWorld && lib.cshWorld.worldStory) ? lib.cshWorld.worldStory() : null; } catch (eS) {}
			try { wnews = (lib.cshWorld && lib.cshWorld.news) ? lib.cshWorld.news(10) : null; } catch (eN) {}
			try { wstats = (lib.cshWorld && lib.cshWorld.stats) ? lib.cshWorld.stats() : null; } catch (eT) {}
			ackToGame("shell-world", true, { leaderboard: wl, ai: ai, story: story, news: wnews, stats: wstats });
			return;
		}
			/* 名次制牌桌的"只记战果不动钱"（2026-10-03）：UNO 同桌 AI 的手数/胜负/心态回报。
		   金额一律不参与 —— 记账口径由宿主统一，客户端只报"谁赢谁输"。 */
		if (cmd === "shell-world-result") {
			var WR = lib.cshWorld;
			var rr = null;
			try {
				rr = (WR && WR.settleResult && d.id) ? WR.settleResult(d.id, d.won === true ? true : (d.won === false ? false : null)) : null;
			} catch (eWR) { logError("世界战果回报失败（" + d.id + "）", eWR); }
			ackToGame("shell-world-result", !!rr, rr);
			return;
		}
		/* 抽取同桌 AI（§I / §H.4）：seat(n, buyIn, opts) → [{id,name,persona,stake,fund,skill,mult}] */
			if (cmd === "shell-seat") {
				var WSe = lib.cshWorld;
				var seats = null;
				try {
					seats = (WSe && WSe.seat) ? WSe.seat(d.n, d.buyIn, { tier: d.tier }) : null;
				} catch (eSe) {}
				ackToGame("shell-seat", !!(seats && seats.length), { seats: seats || [] });
				return;
			}
			/* 本场结算（2026-09-29 新增 · 德州用）：
			   一次调用同时完成「玩家入账」与「AI 世界双向记账」，
			   保证两侧资金永远零和，不再出现"玩家赢了但世界不知道"。
			   入参：{ key, buyIn, chips, seats:[{id,stake}] } */
			if (cmd === "shell-settle-session") {
				/* 载荷形状兼容：平铺 {key,buyIn,chips,seats…} 或包一层 {data:{…}}。
				   此前只有本命令读平铺、shell-settle 读 d.data，两套约定并存，
				   任一客户端写错就是「静默零结算」（钱不进钱包、世界不记账）。 */
				var sd = (d.data && typeof d.data === "object") ? d.data : d;
				var gk2 = guardKey();
				if (GUARD[gk2]) { ackToGame("shell-settle-session", true, GUARD[gk2]); return; }
				var r2 = settleSession(current, sd);
				/* ★ 2026-09-29 P0：应答必须带 ok —— 德州 endSession 校验 data.ok，
				   此前恒 undefined ⇒ 每次成功结算都被当成失败（横幅谎报「实得 0」、
				   toast 谎报「本局未入账」，而钱包其实已正确入账）。 */
				r2.ok = true;
				GUARD[gk2] = r2;
				ackToGame("shell-settle-session", true, r2);
				selfCloseAfterSettle(r2);   /* ★ 2026-09-30：同上，牌桌类走这条 */
				return;
			}
			/* 每日任务（唯一真值在 csh_wallet） */
			if (cmd === "shell-tasks") {
				var WT = wallet();
				var ts = null;
				try { ts = WT && WT.task ? WT.task.state() : null; } catch (eT) {}
				ackToGame("shell-tasks", !!ts, ts);
				return;
			}
			if (cmd === "shell-task-add") {
				var WTA = wallet();
				var td = [];
				try { td = WTA && WTA.task ? WTA.task.add(d.kind, d.n) : []; } catch (eTa) {}
				ackToGame("shell-task-add", true, { done: td });
				paintPc();
				return;
			}
			/* 游戏目录（生涯大厅「快捷开局」· 2026-09-29 新增）：
			   目录真值在 core/csh_registry.js，报价（官阶门票折扣）在 csh_wallet。
			   此前生涯大厅自己硬编码了一张 { 门票 / 最低余额 } 表，
			   与真实门票脱钩（廿一点改免门票后仍写着 300，余额 200~299 会被误判为不足）。
			   现在大厅不再持有任何价格数字，全部向宿主查询。 */
			if (cmd === "shell-games") {
				var WG = wallet();
				var pcG = WG ? WG.wallet.pc() : 0;
				var stakesG = null;
				try { stakesG = (WG && WG.rank && WG.rank.unlockedStakes) ? WG.rank.unlockedStakes() : null; } catch (eSG) {}
				var minStakeG = 200;
				if (stakesG && stakesG.length) {
					minStakeG = stakesG[0];
					for (var si = 1; si < stakesG.length; si++) if (stakesG[si] < minStakeG) minStakeG = stakesG[si];
				}
				var ksG = (REG && REG.keys) ? REG.keys() : [];
				var listG = [];
				for (var xi = 0; xi < ksG.length; xi++) {
					var gx = META[ksG[xi]];
					if (!gx) continue;
					var tkG = ticketOf(ksG[xi]);
					var needG = tkG + (gx.needBuyIn ? minStakeG : 0);
					listG.push({
						key: ksG[xi], title: gx.title, tag: gx.tag, desc: gx.desc,
						settle: gx.settle, needBuyIn: !!gx.needBuyIn,
						ticket: tkG, minStake: gx.needBuyIn ? minStakeG : 0,
						need: needG, afford: pcG >= needG,
					});
				}
				ackToGame("shell-games", true, { pc: pcG, list: listG, tiers: buyInTiers() });
				return;
			}
			/* 生涯大厅「快捷开局」：真正开局（此前误发 shell-close，点了等于关页面） */
			if (cmd === "shell-open") {
				var okOpen = !!(d.key && META[d.key]);
				var bi = Math.max(0, Math.floor(Number(d.buyIn) || 0));
				/* ⚠ 应答顺序是真 bug（2026-09-29 修）：
				   此前先 openFee()（内部 doCharge → openShell → 替换 iframe.src）再 ackToGame，
				   应答被投递到**新文档**（刚打开的游戏页），生涯大厅里的 waiter 永远等不到，
				   1.2s 后超时 → 必定弹一句「无法打开：德州扑克」——尽管游戏其实顺利开了。
				   现在：ack 同步发出（投递目标仍是当前子页面），开壳延到下一个事件循环。 */
				ackToGame("shell-open", okOpen, { key: d.key || null });
				if (okOpen) {
					var doOpen = function () {
						try { openFee(d.key, { buyIn: bi }); }
						catch (eOp) { logError("shell-open", eOp); }
					};
					try { setTimeout(doOpen, 0); } catch (eT0) { doOpen(); }
				}
				return;
			}
			/* ⚠ 2026-09-29 删除 shell-sign-state（死通道）：
			   它只比 shell-wallet 多一个「本次签到可得额度」字段，而没有任何调用点。
			   该字段已并入 walletSnapshot().signNext（一个快照命令就够，不必两条）。 */
			/* 救济（§F.4）：此前 relief() 零调用，破产玩家永远拿不到 */
			if (cmd === "shell-relief") {
				var WRL = wallet();
				var rl = null;
				try { rl = WRL && WRL.wallet.relief ? WRL.wallet.relief() : null; } catch (eRl) {}
				ackToGame("shell-relief", !!(rl && rl.ok), rl);
				paintPc();
				return;
			}
			/* ★ 2026-09-29 R3-2：迁移模块此前只挂 window.CSH.migrate，从不挂 lib.cshMigrate，
			   而 shell 的 5 个 mig 桥命令全部读 lib.cshMigrate ⇒ 导出/导入/备份/回滚/重置
			   **恒失败**（大厅「重置存档」点了没反应就是它）。这里加双通道兜底，
			   即使将来挂载方式再漂移，桥也不会静默变死。 */
		function migMod() {
			if (lib.cshMigrate) return lib.cshMigrate;
			try { if (typeof window !== "undefined" && window.CSH && window.CSH.migrate) return window.CSH.migrate; } catch (e) {}
			return null;
		}
				if (cmd === "shell-mig-export") {
				var MM = migMod();
				if (!MM) { ackToGame("shell-mig-export", false, null, req0); return; }
				try {
					Promise.resolve(MM.export()).then(function (code) {
						ackToGame("shell-mig-export", true, { code: code }, req0);
					}, function (e) { ackToGame("shell-mig-export", false, { err: String(e && e.message || e) }, req0); });
				} catch (e) { ackToGame("shell-mig-export", false, null, req0); }
				return;
			}
			if (cmd === "shell-mig-import") {
				var MI = migMod();
				if (!MI) { ackToGame("shell-mig-import", false, null, req0); return; }
				Promise.resolve(MI.import(d.code, { dryRun: !!d.dryRun })).then(function (r) {
					ackToGame("shell-mig-import", !!r.ok, r, req0);
				}, function (e) { ackToGame("shell-mig-import", false, { err: String(e && e.message || e) }, req0); });
				return;
			}
			if (cmd === "shell-mig-backups") {
				var MB = migMod();
				ackToGame("shell-mig-backups", !!MB, MB ? MB.backups() : null);
				return;
			}
			if (cmd === "shell-mig-rollback") {
				var MR = migMod();
				var rr = MR ? MR.rollback(d.stamp) : null;
				ackToGame("shell-mig-rollback", !!(rr && rr.ok), rr);
				return;
			}
			if (cmd === "shell-mig-reset") {
				/* 重置存档：清空全部进度键（钱包/官阶/世界/胜率/成就/CDK/各游戏最佳）。
				   清空后数据需页面刷新才重新初始化，故这里只做清空，
				   刷新动作由调用方（career 大厅）在确认后触发。 */
				var MX = migMod();
				var rx = MX && typeof MX.reset === "function" ? MX.reset() : null;
				ackToGame("shell-mig-reset", !!(rx && rx.ok), rx);
				return;
			}
			if (cmd === "shell-badge-all") {
				var BB = lib.cshBadge;
				var form = d.form || "md";
				var svgs = null;
				try { svgs = BB && BB.all ? BB.all(form) : null; } catch (eE) {}
				ackToGame("shell-badge-all", !!BB, { form: form, list: svgs });
				return;
			}
		} catch (err) { logError("onMessage", err); }
	}
	function bindMessage() {
		if (msgBound) return;
		msgBound = true;
		try { window.addEventListener("message", onMessage, false); } catch (e) {}
	}
	function bindEsc() {
		if (escBound) return;
		escBound = true;
		try {
			document.addEventListener("keydown", function (e) {
				if (e.key !== "Escape" && e.keyCode !== 27) return;
				if (!document.getElementById(OV_ID)) return;
				/* ★ 2026-09-29 第四轮：Esc 从此**不再触发暂停**。
				   旧代码是 `if (paused) resume(); else pause(true);`，即 Esc 被做成了"暂停开关"，
				   而它上方的注释写的是「Esc 先恢复暂停，再关闭」—— 关闭逻辑压根不存在。
				   结果：用户按 Esc 想退出，得到的是一个「已暂停」遮罩（真机反馈
				   "动不动就弹已暂停"的主要来源之一）。
				   现在语义收敛成单一动作：Esc = 解除暂停（仅在暂停中），其余情况不拦、不动作。
				   退出请用壳顶带「关闭」（未结算走二次确认 / 委托页面幂等结算），
				   或结算横幅里的「收工结算」（2026-10-03：德州 topbar 的「收工」按钮已删，与壳顶带关闭冗余）。 */
				if (!paused) return;
				try { e.preventDefault(); e.stopPropagation(); } catch (_e) {}
				resume();
			}, true);
		} catch (e2) {}
	}
	/* 该游戏是否允许「自动暂停」（2026-09-29 第四轮新增，真值在 csh_registry META.autoPause）
	   回合制游戏（德州 / 斗地主 / 廿一点 / UNO）没有玩家倒计时，离开时游戏不会自行推进，
	   没有任何需要冻结的东西 ⇒ 现役四款全为 false（神弩手 2026-10-03 移除前是唯一的 true）。 */
	function autoPauseOn() {
		var m = META[current];
		return !!(m && m.autoPause);
	}
	function bindVisibility() {
		if (visBound) return;
		visBound = true;
		try {
			document.addEventListener("visibilitychange", function () {
				if (!current) return;
				if (document.hidden) { if (autoPauseOn()) pause(true); }
				/* 只自动解除「自动暂停」；玩家手动暂停的，回前台仍由玩家自己点继续。 */
				else if (paused && pausedAuto) resume();
			}, false);
		} catch (e) {}
		/* ★ 2026-09-29 第四轮：**删除 window.blur → 暂停** 这条触发路径。
		   为什么删（三条都在代码里验证过）：
		     1) 它没有与之配对的自动恢复 —— 只有 visibilitychange→可见 才 resume。
		       于是「切出去看一眼再回来」每次都要手点一次「继续」，
		       这正是用户说的"动不动就弹、很烦人"；
		     2) 回合制游戏没有玩家操作倒计时（德州全程 grep 不到 autoFold/超时），
		       人离开时游戏不会自行推进，没有需要"冻结"的对象；
	     3) （原文第三条针对已移除的神弩手：rAF 驱动的实时局在标签页隐藏时浏览器自停 rAF。）
		   2026-09-28 那次只给 blur 加了 180ms + hasFocus() 复核，治的是"点进 iframe 误判"，
		   但没治"离开了就不会自动回来"这个更根本的问题。
		   保留：可见性变化（切页签 / 最小化）仍由上面的 visibilitychange 处理，且回来自动恢复；
		         显式暂停能力（shell.pause() / 遮罩）保持可用。 */
		/* （blur 分支删除后此处不再注册任何监听；可见性由上方的 visibilitychange 负责） */
		/* 方向变化重算（§E.4 可视高度修正） */
		try {
			window.addEventListener("orientationchange", function () {
				if (current) checkOrientation(current);
			}, false);
		} catch (e3) {}
		try {
			window.addEventListener("resize", function () {
				if (current) checkOrientation(current);
			}, false);
		} catch (e4) {}
	}

	/* 壳内 toast（非 noname 的 ui.toast——那个会被壳遮罩压在底下看不见） */
	function shellToast(msg) {
		try {
			var ov = document.getElementById(OV_ID);
			if (!ov) { toast(msg); return; }
			var t = document.createElement("div");
			t.className = "csh-sh-toast";
			t.textContent = String(msg == null ? "" : msg);
			ov.appendChild(t);
			setTimeout(function () {
				if (t.parentNode) t.parentNode.removeChild(t);
			}, 2600);
		} catch (e) {}
	}
	/* ---------- 结算（§F.5 · 2026-09-29 归一） ----------
	   金额计算与入账**全部**在 csh_wallet.settleRun（全扩展唯一实现）；
	   本模块退化为纯展示层：组装 breakdown 文案 → 弹提示 → 播音效 → 发事件。
	   历史问题（本轮一次性消除）：
	     · 曾有 **3 套**并行结算公式（本函数 / csh_wallet.settle / shell.cashOut），
	       同一局走不同路径拿到的钱不一样；
	     · 亏损分支曾写在 chips 分支里，而 settleSession 又写了第二遍，
	       且那一遍把净赢 max(0,…) 钳平后走"正收益"分支 ⇒ 输光也满额返还。
	   现在：「负净赢」是 wallet.settle 的本征分支，调用方无从绕开。
	   data 形态：
	     chips: { buyIn, chips, aiStakeTotal } → 带入 + 净赢×回收率，受自然封顶
	     rank:  { place, players }             → 门票×0.6×击败对手数（UNO）
	     raw:   { payout }                     → 直接给金额（仅调试用，仍走钱包上限） */
	/* 功勋收入主渠道（2026-09-29 用户反馈「功勋是不是太难提升了」）：
	   此前功勋只有各游戏上报的 1~6 点/局风味奖励，升第 1 阶要 100 功勋
	   ⇒ 玩家几十局都看不到成长。现在每次结算按「本场规模 + 表现」发一次，
	   与金额入账共用同一个 GUARD 键 ⇒ 天然幂等，刷不出重复。
	   软上限 / 高段衰减仍由 csh_wallet.addMerit 内部实现，此处不重复。 */
	function sessionMeritOf(res) {
		var n = 3;                                          // 参与底薪
		if (res.mode === "chips") {
			n += Math.min(15, Math.floor((res.buyIn || 0) / 1000));   // 规模：每 1000 带入 +1，封 15
			if ((res.profit || 0) > 0) n += Math.min(10, 1 + Math.floor(res.profit / 2000)); // 表现
			try { if (isGambleBuyIn(res.buyIn)) n *= 2; } catch (eG) {}  // 豪赌桌 ×2
		} else if (res.mode === "rank") {
			n = 2 + (res.beat || 0) + (res.place === 1 ? 3 : 0);      // UNO：击败人数 + 夺冠
		}
		return Math.max(1, Math.floor(n));
	}
	function settle(key, data) {
		data = data || {};
		var W = wallet();
		var m = META[key];
		if (!m) return null;
		var res = {
			key: key, payout: 0, credited: 0, breakdown: "",
			cap: null, capped: false, mode: m.settle,
		};
		if (!W || !W.wallet || typeof W.wallet.settleRun !== "function") {
			/* 钱包不可用时不入账、不谎报：如实返回 0 并留下错误日志 */
			logError("钱包未加载或缺少 settleRun，结算中止：" + key);
			res.breakdown = "钱包不可用，未结算";
			res.balance = 0;
			return res;
		}
		var r = null;

		if (typeof data.payout === "number") {
			var PC_CAP = (W && W.const && W.const.PC_CAP) || 100000000000;
			var raw = Math.max(0, Math.floor(data.payout));
			/* 2026-09-29 红队 P3：raw 直充也受全局上限钳制，单笔不得超过 PC_CAP，
			   杜绝「绕过各游戏自身封顶」的潜脚枪（钱包 add 也已按总额钳到 PC_CAP）。 */
			if (raw > PC_CAP) { raw = PC_CAP; res.capped = true; }
			res.payout = raw;
			res.cap = PC_CAP;
			res.credited = raw > 0 ? W.wallet.add(raw, "结算:" + key) : 0;
			res.breakdown = "自定义结算 " + fmt(raw) + (res.capped ? "（触上限 " + fmt(PC_CAP) + "）" : "");
			res.mode = "raw";
		} else if (m.settle === "none") {
			res.mode = "none";
			res.breakdown = "无需结算";
		} else if (m.settle === "rank") {
			r = W.wallet.settleRun("uno", {
				netWin: Math.floor(Number(data.place) || 0),
				players: Math.floor(Number(data.players) || 0),
			});
			res.payout = r.payout; res.cap = r.cap; res.capped = !!r.capped;
			res.place = r.place; res.players = r.players; res.beat = r.beat;
			res.breakdown = "第 " + r.place + "/" + r.players + " 名 · 击败 " + r.beat +
				" 人 → 回收 " + fmt(r.payout);
		} else {
			// 牌桌类：德州 / 斗地主 / 廿一点
			var buyIn = Math.max(0, Math.floor(Number(data.buyIn) || 0));
			var chips = Math.max(0, Math.floor(Number(data.chips) || 0));
			var aiTotal = Math.max(0, Math.floor(Number(data.aiStakeTotal) || 0));
			var profit = chips - buyIn;
			r = W.wallet.settleRun(key, { buyIn: buyIn, netWin: profit, aiStakeTotal: aiTotal });
			res.payout = r.payout; res.cap = r.cap; res.capped = !!r.capped;
			res.discarded = r.discarded || 0;
			/* ★ 2026-09-29 修复：把 wallet 算出的**真实回收率**透传给 settleSession。
			   此前 res 不带 rate，settleSession 里 `res.rate == null ? 0.9` 恒命中 0.9，
			   于是廿一点（95%）玩家侧按 95% 入账、AI 世界却按 90% 扣款 —— 零和被破坏，
			   差额 90 凭空消失。现在 wallet 是 rate 的唯一来源。 */
			if (typeof r.rate === "number") res.rate = r.rate;
			res.buyIn = buyIn; res.chips = chips; res.profit = profit;
			res.breakdown = profit < 0
				? ("带入 " + fmt(buyIn) + " 结算 " + fmt(chips) + " → 亏损，仅带回剩余 " + fmt(r.payout))
				: ("带入 " + fmt(buyIn) + " 结算 " + fmt(chips) + " → 回收 " + fmt(r.payout) +
					(aiTotal > 0 ? "（同桌可赢 " + fmt(aiTotal) + "）" : ""));
		}
		if (r && typeof r.credited === "number") res.credited = r.credited;
		res.balance = W.wallet.pc();
		/* 功勋入账（见 sessionMeritOf）：结算成功即发，与金额同一幂等守卫。
		   ★ 2026-09-29：纯退款不发功勋 —— 未开局离场（chips === buyIn，零和）
		   也走结算通道拿回带入，若照发底薪，「入场秒退」就能反复刷功勋。 */
		var pureRefund = (res.mode === "chips" && res.buyIn > 0 &&
			res.chips === res.buyIn && res.profit === 0);
		var sm = pureRefund ? 0 : sessionMeritOf(res);
		try {
			var mrS = W.rank && W.rank.addMerit ? W.rank.addMerit(sm, "settle:" + key) : null;
			res.merit = sm;
			res.meritGained = mrS ? (mrS.gained || 0) : 0;
		} catch (eM) { res.merit = sm; res.meritGained = 0; }
		logInfo("结算 " + key + " → " + res.payout + " " + res.breakdown);

		/* 壳内入账提示（2026-09-28 用户反馈「赢了不知道加没加」）+ 顶带余额刷新。
		   牌桌类分「净赢 / 净输」两种说法 —— 输局仍会带回剩余筹码，
		   只说「结算 +N」会让玩家以为是赢了。 */
		/* ★ 2026-09-30：委托关窗（selfClosing）时壳马上要拆，壳内 toast 会随遮罩一起消失，
		   改由 selfCloseAfterSettle 在宿主页面弹一条同义提示，这里就不再闪一下。 */
		var suffix = " · 余额 " + fmt(res.balance) + (res.capped ? "（已封顶）" : "") +
			(res.meritGained > 0 ? " · 功勋 +" + fmt(res.meritGained) : "");
		if (selfClosing) { paintPc(); sfx(res.payout > 0 ? "settle" : "lose"); emit("settle", res); return res; }
		if (res.mode === "chips" && typeof res.profit === "number") {
			shellToast(res.profit >= 0
				? ("本场净赢 +" + fmt(res.profit) + " CBY · 入账 " + fmt(res.credited) + suffix)
				: ("本场净输 " + fmt(-res.profit) + " CBY · 带回剩余 " + fmt(res.credited) + suffix));
		} else if (res.payout > 0) {
			shellToast("结算 +" + fmt(res.credited) + " CBY" + suffix);
		} else if (res.mode === "rank" || res.mode === "score") {
			shellToast("本局未达回收线（门票不返还）· 余额 " + fmt(res.balance));
		}
		paintPc();
		/* §4.7.1：结算音。有回收用上行音，颗粒无收用下行音（听得出来） */
		sfx(res.payout > 0 ? "settle" : "lose");
		emit("settle", res);
		return res;
	}

	/* ---------- 关闭 ---------- */
	/* 未结算退壳保护（2026-09-29 新增）：
	   带入在收费屏就已真实扣款，若玩家中途点「关闭」而不是「收工结算」，
	   桌上的钱既拿不回来也无处入账 —— 静默损失全部带入。
	   此前完全没有任何提示。现在：只要本会话尚未结算、且带入 > 0，
	   就先弹一次确认；确认后才关。 */
	function needsSettleWarn() {
		if (!current || currentBuyIn <= 0) return false;
		if (GUARD["|" + current]) return false;      // 已结算
		var m = META[current];
		return !!(m && m.settle === "chips");
	}
	/* 2026-09-30 用户拍板：「离开自动结算就可以了，二次确认多此一举」。
	   于是把「关闭」从**问一句再关**改成**先自动结算、再关**：
	     · 壳只发一条 `shell-close-self`，由游戏页跑自己的收尾流程
	       （六个页面的 closePage 都已带幂等结算：未开局全额退回带入、
	        牌局中途按手上筹码结算），钱先回账，再关窗；
	     · 收尾完成后游戏页回发 `<key>-close`（或先发结算请求，FIFO 保证在关闭之前到），
	       壳据此真正关壳，**不再弹「离开将损失带入」**；
	     · 唯一例外的兜底：1.5s 内既没等到结算落账、也没等到关闭回执
	       （页面卡死 / 未接本协议的旧页面）→ 回落原二次确认弹窗。
	       宁可多问一句，也不静默吞掉玩家已扣的带入。 */
	var selfClosing = null;        // 委托关窗中：存本次原因（"user"/"game"）
	var selfCloseTimer = 0;
	function requestSelfClose(reason) {
		selfClosing = reason || "user";
		postToGame({ __csh: "shell-close-self" });
		if (selfCloseTimer) clearTimeout(selfCloseTimer);
		selfCloseTimer = setTimeout(function () {
			selfCloseTimer = 0;
			if (!selfClosing) return;
			var r = selfClosing; selfClosing = null;
			if (needsSettleWarn()) { confirmLeave(current, r); return; }
			doClose(r);
		}, 1500);
	}
	function cancelSelfClose() {
		if (selfCloseTimer) { clearTimeout(selfCloseTimer); selfCloseTimer = 0; }
		selfClosing = null;
	}
	/* 结算应答到达 → 关壳 + 一条**宿主级**提示。
	   为什么提示必须落在宿主页面：壳一关，壳内 toast 随遮罩一起被移除，
	   玩家看不到「本局已自动结算 +N」—— 那正是"自动结算"唯一需要交代的信息。 */
	function selfCloseAfterSettle(res) {
		if (!selfClosing) return false;
		var r = selfClosing;
		cancelSelfClose();
		/* 先弹提示、再关壳：提示落在宿主页面（壳内 toast 会随遮罩一起消失），
		   且即使用户此刻正在关页面/关壳流程抛错，结论也已经说出口了。 */
		try { var msg = autoSettleText(res); if (msg) toast(msg); } catch (eT) {}
		doClose(r);
		return true;
	}
	function autoSettleText(res) {
		if (!res) return "本局已自动结算";
		var tail = " · 余额 " + fmt(res.balance);
		if (res.mode === "chips" && typeof res.profit === "number") {
			return res.profit >= 0
				? "本局已自动结算 · 净赢 +" + fmt(res.profit) + " CBY · 回账 " + fmt(res.credited) + tail
				: "本局已自动结算 · 净输 " + fmt(-res.profit) + " CBY · 带回剩余 " + fmt(res.credited) + tail;
		}
		return "本局已自动结算 · 入账 " + fmt(res.credited || res.payout || 0) + " CBY" + tail;
	}
	function close(reason) {
		if (!current) return false;
		if (selfClosing) {
			/* 委托关窗中收到游戏页关闭回执：它已跑完自己的收尾流程。
			   但若此刻仍未见到结算落账，说明该页跳过了结算（或结算请求丢了）——
			   此时回落二次确认，绝不静默吞掉带入。 */
			var pending = selfClosing;
			cancelSelfClose();
			if (needsSettleWarn()) { confirmLeave(current, pending); return true; }
			return doClose(pending);
		}
		if ((reason === "user" || reason === "game") && needsSettleWarn()) {
			requestSelfClose(reason);
			return true;
		}
		return doClose(reason);
	}
	function doClose(reason) {
		if (!current) return false;
		var key = current;
		emit("close", { key: key, reason: reason || "user", elapsed: elapsed() });
		closeShell(false);
		closeFee();
		return true;
	}
	/* 轻量确认层（复用壳内样式，不引入 second 遮罩体系） */
	function confirmLeave(key, reason) {
		var ov = document.getElementById(OV_ID);
		if (!ov || document.getElementById("csh-shell-leave")) return;
		var box = document.createElement("div");
		box.id = "csh-shell-leave";
		box.className = "csh-sh-leave";
		var txt = document.createElement("div");
		txt.className = "csh-sh-leavetxt";
		txt.innerHTML = "本局尚未结算<br><b>离开将损失带入 " + fmt(currentBuyIn) + " CBY</b>";
		var row = document.createElement("div");
		row.className = "csh-sh-leaveacts";
		var back = document.createElement("button");
		back.textContent = "去结算";
		back.addEventListener("click", function (e) {
			e.preventDefault(); e.stopPropagation();
			removeLeave();
			/* 把焦点交回游戏：提示它走收工流程（子页面收到后应弹结算界面） */
			postToGame({ __csh: "settle-request" });
		}, true);
		var go = document.createElement("button");
		go.className = "csh-sh-leavego";
		go.textContent = "仍要离开";
		go.addEventListener("click", function (e) {
			e.preventDefault(); e.stopPropagation();
			removeLeave();
			doClose(reason || "user");
		}, true);
		row.appendChild(back); row.appendChild(go);
		box.appendChild(txt); box.appendChild(row);
		ov.appendChild(box);
	}
	function removeLeave() {
		var b = document.getElementById("csh-shell-leave");
		if (b && b.parentNode) b.parentNode.removeChild(b);
	}

	/* ---------- 注册 / 监听 ---------- */
	function register(key, cfg) {
		if (!key || !META[key]) return false;
		regCfg[key] = Object.assign(regCfg[key] || {}, cfg || {});
		if (current === key) paintTop();
		return true;
	}
	function on(ev, fn) {
		if (!listeners[ev] || typeof fn !== "function") return false;
		listeners[ev].push(fn);
		return true;
	}
	function off(ev, fn) {
		var arr = listeners[ev];
		if (!arr) return false;
		var i = arr.indexOf(fn);
		if (i >= 0) arr.splice(i, 1);
		return i >= 0;
	}

	/* ---------- 对外导出 ---------- */
	var CSH = {
		META: META,
		/* 门票表已去重到 csh_wallet（唯一来源），这里只做转发 */
		ticketTable: function () {
			try { return lib.cshWallet.const.TICKET; } catch (e) { return {}; }
		},
		tiers: buyInTiers,
		open: openFee,          // 收费屏优先（§F.3）
		openShellRaw: openShell,
		charge: function (key, buyIn) {
			var tk = ticketOf(key);
			/* ★ 2026-09-29 R3-2 经济路径烟测抓出：此处原写 `key === "texas" ? buyIn : 0`，
			   于是同为带入制的斗地主 / 廿一点经本入口收费时**带入恒扣 0**（白嫖入场），
			   与收费屏 doCharge 的口径不一致。改为按 META.needBuyIn 判定（唯一真值）。 */
			var m = META[key];
			var bi = (m && m.needBuyIn) ? Math.max(0, Math.floor(Number(buyIn) || 0)) : 0;
			return doCharge(key, tk, bi);
		},
		close: close,
		pause: pause, resume: resume, toggle: togglePause, isPaused: isPaused,
		settle: settle,
		settleSession: settleSession,
		register: register,
		tick: function (key, text) { if (!key || key === current) return tickStatus(text); return false; },
		ticketOf: ticketOf,
		elapsed: elapsed,
		isOpen: function () { return !!document.getElementById(OV_ID); },
		isFeeOpen: function () { return !!document.getElementById(FEE_ID); },
		current: function () { return current; },
		buyIn: function () { return currentBuyIn; },
		walletSnapshot: walletSnapshot,
		stats: buildStats,
		/* 功勋上报（§G.6.2）：统一入口，签名与 csh_wallet.addMerit 一致 */
		merit: function (n, reason) {
			var W = wallet();
			try { return W && W.rank.addMerit ? W.rank.addMerit(n, reason) : null; } catch (e) { return null; }
		},
		on: on, off: off,
		urlOf: urlOf,
	};

	lib.cshShell = CSH;
	try {
		if (typeof window !== "undefined") { window.CSH = window.CSH || {}; window.CSH.shell = CSH; }
	} catch (e) {}

	logInfo("Game Shell 已加载（门票表已去重至 csh_wallet；带入档位 " + buyInTiers().join("/") + "）");
})();
