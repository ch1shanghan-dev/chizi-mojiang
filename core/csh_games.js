import { lib, game, ui } from "../../../noname.js";
// 池子魔将 · 小游戏「池子休闲」目录与入口（UNO / 斗地主 / 德州 / 廿一点）
//
// ⚠ 自 §E.2 起，**开局不再由本模块自己画 iframe 遮罩**，而是统一委托给
//   Game Shell（core/csh_shell.js）。原因：
//     ① 入场收费屏 / 门票扣费 / 结算入账只有一份实现（§F.3）；
//     ② 顶栏状态 · 暂停(失焦) · 竖屏提示 · Esc 兜底 三带结构全 Shell 统一（§E.4）；
//     ③ 各游戏 postMessage 协议收敛为 shell-* 一族，避免两套遮罩打架。
//   本模块只做两件事：
//     A. 维护「池子休闲」卡片的**展示文案**（tag / desc / 副标题统计）；
//     B. open(key) 转发给 lib.cshShell.open(key)，由 Shell 负责收费屏与开局。
//
// ⚠ 2026-09-29 架构收敛：本模块**不再持有目录与价格**。
//   此前这里有一张 GAMES 表，字段与 csh_shell.META 重复，注释只能写
//   「加一款游戏要同步改 csh_shell 的 META / TICKET」——把重复维护当成了设计。
//   现在：结构（标题 / 目录 / 文件 / 结算方式 / 门票）唯一真值在 core/csh_registry.js，
//   本模块只保留**纯展示**的 tag / desc / statFn，因此只可能「描述过时」，
//   不可能再出现「卡片点了开不起来」或「价格写错」这类功能性偏差。
//
// 新增小游戏：往 core/csh_registry.js 的 CATALOG 里加一条，
//   需要卡片文案再往本文件的 CARDS 补 tag/desc —— 两处，职责分明，csh_debug.js 一行都不用改。

(function () {
	if (lib.cshGames) return;

	var BASE = "extension/池子魔将/games/";

	/* ---------- 展示层（只有文案，没有结构与价格） ----------
	   可选字段：
	     tag    卡片右上角的小标签（如「纸牌」「街机」）
	     statFn 返回一行统计文字（如「最高 12,340」），用于卡片副标题；
	            无统计的游戏不写此字段，卡片只显示 desc。 */
	var CARDS = {
		texas: {
			tag: "牌桌", desc: "真实 AI 同桌 · 带入制",
			statFn: function () {
				var o = lsJSON("csh_texas_best", null);
				if (!o || !o.hands) return "";
				return "生涯 " + fmtNum(o.hands) + " 手 · 最大池 " + fmtNum(o.biggestPot || 0);
			},
		},
		doudizhu: {
			tag: "牌桌", desc: "1 对 2 · 带入制",
		},
		blackjack: {
			tag: "牌桌", desc: "真庄家 · 台面零和",
			/* shell 内筹码由宿主钱包托管，本地不再记 chips
			   （否则卡片会拿沙盒里的旧值冒充生涯战绩 —— 假数据） */
			statFn: function () {
				var o = lsJSON("csh_bj_best", null);
				if (!o || !o.hands) return "";
				return "生涯 " + fmtNum(o.hands) + " 手 · 最高 " + (o.bestStreak || 0) + " 连胜";
			},
		},
		uno: {
			tag: "纸牌", desc: "你 vs 1~3 个人机",
		},
	};

	// 筹备中的小游戏：只在「池子休闲」里占位展示，点了不动作（不可开局）。
	// 上线时：往 registry.CATALOG 加条目 + 在 CARDS 补文案即可。
	// 【2026-10-03 用户决定】神弩手已移除（唯一的实时游戏，与其余四款节奏不合）；
	// registry.CATALOG 才是目录真值，此处只补文案，缺条目不会显示。
	var PLANNED = [];

	/* ---------- 真值读取（registry → shell.META 转发） ---------- */
	function registry() {
		try { return (typeof window !== "undefined" && window.CSH && window.CSH.registry) || null; } catch (e) { return null; }
	}
	function metaTable() {
		try { if (lib.cshShell && lib.cshShell.META) return lib.cshShell.META; } catch (e) {}
		return {};
	}
	/* 卡片顺序 = registry 声明顺序（不含生涯大厅） */
	function keys() {
		var R = registry();
		if (R && typeof R.keys === "function") return R.keys();
		var M = metaTable(), out = [];
		for (var k in M) {
			if (!Object.prototype.hasOwnProperty.call(M, k)) continue;
			if (!M[k].lobby) out.push(k);
		}
		return out;
	}

	function assetURL() {
		try { return lib.assetURL || ""; } catch (e) { return ""; }
	}
	function urlOf(key) {
		var m = metaTable()[key];
		if (!m) return "";
		var seg = m.dir ? m.dir + "/" : "";
		return assetURL() + BASE + seg + m.file;
	}
	function fmtNum(n) {
		return String(Math.floor(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	}
	function lsJSON(k, def) {
		try {
			var s = localStorage.getItem(k);
			if (!s) return def;
			var o = JSON.parse(s);
			return o == null ? def : o;
		} catch (e) { return def; }
	}
	function toast(msg) {
		msg = String(msg == null ? "" : msg);
		try {
			if (typeof ui !== "undefined" && ui && ui.create && typeof ui.create.toast === "function") {
				ui.create.toast(msg);
				return;
			}
		} catch (e) {}
		try { console.log("[池子魔将·小游戏] " + msg); } catch (e2) {}
	}
	function logInfo(msg) {
		try {
			if (lib.cshDebug && typeof lib.cshDebug.info === "function") lib.cshDebug.info("games: " + msg);
		} catch (e) {}
	}
	function logError(msg, err) {
		try {
			if (lib.cshDebug && typeof lib.cshDebug.error === "function") lib.cshDebug.error("games: " + msg, err);
			else console.error("[池子魔将·小游戏] " + msg, err);
		} catch (e) {}
	}
	/* 取 Game Shell；未加载则报错（避免静默失效） */
	function shell() {
		var S = lib.cshShell;
		if (!S || typeof S.open !== "function") {
			logError("Game Shell 未加载，无法开局");
			return null;
		}
		return S;
	}
	function known(key) { return !!metaTable()[key]; }

	/* 开局：委托 Shell（收费屏 → 扣费 → 开 iframe）。
	   opts.buyIn 仅带入制游戏需要（带入筹码）；门票制游戏忽略。 */
	function open(name, opts) {
		if (!known(name)) {
			toast("未知小游戏: " + name);
			return false;
		}
		var S = shell();
		if (!S) { toast("游戏外壳未就绪，请重开面板"); return false; }
		logInfo("委托 Shell 开局 " + name + (opts && opts.buyIn ? " buyIn=" + opts.buyIn : ""));
		S.open(name, opts || {});
		return true;
	}
	function close() {
		var S = lib.cshShell;
		if (S && typeof S.close === "function") return S.close("user");
		return false;
	}
	/* 生涯大厅（§4.1.6）：非游戏，免门票、不开收费屏，直接开壳 */
	function openLobby() {
		var S = shell();
		if (!S) { toast("游戏外壳未就绪，请重开面板"); return false; }
		S.open("career", {});
		return true;
	}

	lib.cshGames = {
		open: open,
		openLobby: openLobby,
		close: close,
		isOpen: function () {
			var S = lib.cshShell;
			return !!(S && typeof S.isOpen === "function" && S.isOpen());
		},
		current: function () {
			var S = lib.cshShell;
			return S && typeof S.current === "function" ? S.current() : null;
		},
		has: function (name) { return known(name); },
		// 「池子休闲」按此渲染已上线卡片，顺序 = registry 声明顺序
		list: function () {
			var M = metaTable();
			var ks = keys();
			var out = [];
			for (var i = 0; i < ks.length; i++) {
				var k = ks[i], g = M[k];
				if (!g) continue;
				var card = CARDS[k] || {};
				var stat = "";
				try {
					if (typeof card.statFn === "function") stat = String(card.statFn() || "");
				} catch (e) { stat = ""; }
				out.push({
					key: k, title: g.title,
					desc: card.desc || g.desc || "", tag: card.tag || g.tag || "",
					stat: stat, url: urlOf(k),
					settle: g.settle, needBuyIn: !!g.needBuyIn,
					ticket: (lib.cshShell && lib.cshShell.ticketOf) ? lib.cshShell.ticketOf(k) : 0,
				});
			}
			return out;
		},
		// 筹备中列表：只展示，不可开局
		planned: function () {
			var out = [];
			for (var i = 0; i < PLANNED.length; i++) {
				var p = PLANNED[i];
				out.push({ key: p.key, title: p.title, desc: p.desc, tag: p.tag || "" });
			}
			return out;
		},
		/* 目录自检（隐藏自检会调）：卡片与 registry 必须一一对应 */
		selfTest: function () {
			var errs = [], M = metaTable(), ks = keys();
			if (!ks.length) errs.push("registry 未加载，卡片清单为空");
			for (var i = 0; i < ks.length; i++) {
				if (!M[ks[i]]) errs.push("registry 有 " + ks[i] + "，但 shell.META 里没有");
				if (!CARDS[ks[i]]) errs.push("卡片缺展示文案：" + ks[i] + "（至少给 tag/desc）");
				if (!urlOf(ks[i])) errs.push("卡片 URL 为空：" + ks[i]);
			}
			for (var c in CARDS) {
				if (!Object.prototype.hasOwnProperty.call(CARDS, c)) continue;
				if (ks.indexOf(c) < 0) errs.push("CARDS 里有 registry 不认识的键：" + c);
			}
			return { ok: errs.length === 0, count: ks.length, errs: errs };
		},
	};
})();
