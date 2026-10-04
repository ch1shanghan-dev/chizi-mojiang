/* 池子魔将 · 游戏目录唯一真值（零 import · 双载）
   ============================================================
   为什么需要这一层（架构原因，2026-09-29）：
     小游戏目录此前散在 **4 处**、各写一份，且互不引用：
       ① core/csh_shell.js  META      —— 标题 / 目录 / 文件 / 横屏 / 结算方式 / 是否必选带入
       ② core/csh_shell.js  DECAY     —— 各游戏回收率
       ③ core/csh_games.js  GAMES     —— 标题 / 描述 / 标签 / 卡片统计
       ④ games/career.html  games[]   —— 标题 / 门票 / 最低余额
       ⑤ core/csh_debug.js            —— 通过 cshGames 间接依赖
     于是「加一款游戏要改四处」被写进了注释当成约定，而且已经漂移：
       · csh_games 里德州描述还写着「每日上限」（该机制早已删除）；
       · career.html 的门票/最低余额与真实门票表脱钩（廿一点改免门票后仍写着 300）。
     这类「同一事实多份副本」是本项目最容易反复复发的一类缺陷，必须从根上收敛。

   职责边界（只有这一份）：
     · 游戏清单与展示元数据（key / 标题 / 目录 / 文件 / 顺序 / 标签 / 描述）
     · 结构与玩法开关（横屏 / 结算方式 / 是否必选带入 / 是否大厅）
     · 经济参数（门票基价 / 回收率 / 计分与名次奖励参数）
   不负责：钱包读写（csh_wallet）、开局流程（csh_shell）、AI 世界（csh_world）。

   双载方式与 csh_sfx.js / csh_svggen.js / csh_cards.js 一致（零 import）：
     · 主页面：extension.js 最先 `import "./core/csh_registry.js"`（纯副作用）
     · 游戏帧：一般无需引入（帧只知道自己的 key，由宿主告知）

   对外 API（window.CSH.registry）：
     keys()                     → 有序列（不含大厅）
     all()                      → 有序列（含大厅，调试面板用）
     get(key)                   → 该条目或 null
     has(key) / isLobby(key) / settleOf(key) / needBuyIn(key) / isLandscape(key)
     dirOf(key, [withSlash])    → 相对扩展根的目录段（career 为空串）
     titleOf(key)
     tickets()                  → {key: 门票基价}（不含官阶折扣）
     decays()                   → {key: 回收率}
     minTicket()                → 最低非零门票（救济门槛真值）
     settlePlan(key)            → 该游戏的结算参数对象（回收率 / 计分率 / 名次系数 …）
     selfTest()                 → 目录自检报告
   ============================================================ */
(function (root) {
	if (!root) return;
	root.CSH = root.CSH || {};
	if (root.CSH.registry) return;          /* 幂等：重复引入直接返回 */

	/* ---------- 结算参数（数值唯一来源） ----------
	   chips  牌桌类：玩家自带本金（带入），回收 = 带入 + 净赢×回收率
	   rank   名次类：门票不返还，按「击败对手数」计奖（见 UNO_PER_BEAT）
	   none   非游戏（生涯大厅） */
	var UNO_PER_BEAT = 0.6;          /* 名次奖：每击败一名对手赢回 门票×0.6 */
	var UNO_CAP_MULT = 2;            /* 名次奖上限 = 门票×2（4 人局第一名 = 270/150 = 1.8，留余量） */

	/* ---------- 目录（唯一真值） ----------
	   decay 仅对 settle="chips" 有意义：本金之外的净赢按此比例回收，差额视为台费。 */
	var ORDER = ["texas", "doudizhu", "blackjack", "uno"];
	var LOBBY = "career";

	var CATALOG = {
		texas: {
			key: "texas", title: "德州扑克", dir: "texas", file: "texas.html",
			tag: "牌桌", desc: "真实 AI 同桌 · 带入制",
			landscape: false, settle: "chips", needBuyIn: true, ticket: 0, decay: 0.90,
		},
		doudizhu: {
			key: "doudizhu", title: "斗地主", dir: "doudizhu", file: "doudizhu.html",
			tag: "牌桌", desc: "1 对 2 · 带入制",
			/* 2026-09-29 三度调整：斗地主此前是「门票 300 即带入」——
			   门票在结算时被返还（带入 + 净赢×90%），所以它**本来就是带入**，
			   却挂着"门票"的名字，导致收费屏"还可玩 N 局"的说法不成立。
			   现与德州 / 廿一点统一为带入制（免门票 + 必选带入）。 */
			landscape: false, settle: "chips", needBuyIn: true, ticket: 0, decay: 0.90,
		},
		blackjack: {
			key: "blackjack", title: "廿一点", dir: "blackjack", file: "blackjack.html",
			tag: "牌桌", desc: "真庄家 · 台面零和",
			/* 2026-09-29：免门票 + 必选带入。回收率 95% 本身就是台费，
			   再叠一张门票等于双重抽水；且门票与最低带入叠加会高于本金。 */
			landscape: false, settle: "chips", needBuyIn: true, ticket: 0, decay: 0.95,
		},
		uno: {
			key: "uno", title: "UNO", dir: "uno", file: "uno.html",
			tag: "纸牌", desc: "你 vs 1~3 个人机",
			/* 名次类：门票不返还。奖励 = 门票 × 0.6 × 击败对手数。
			   4 人局 → 270 / 180 / 90 / 0，期望 135 < 门票 150（负期望）。 */
			landscape: false, settle: "rank", needBuyIn: false, ticket: 150, decay: 0,
		},
		career: {
			key: "career", title: "生涯大厅", dir: "", file: "career.html",
			tag: "", desc: "战绩 / 官阶 / 成就 / AI 世界",
			lobby: true,
			landscape: false, settle: "none", needBuyIn: false, ticket: 0, decay: 0,
		},
	};

	function get(key) {
		return (key && Object.prototype.hasOwnProperty.call(CATALOG, key)) ? CATALOG[key] : null;
	}
	function all() {
		return ORDER.concat([LOBBY]).filter(function (k) { return !!CATALOG[k]; });
	}
	function keys() { return ORDER.slice(); }
	function has(key) { return !!get(key); }
	function isLobby(key) { var g = get(key); return !!(g && g.lobby); }
	function settleOf(key) { var g = get(key); return g ? g.settle : "none"; }
	function needBuyIn(key) { var g = get(key); return !!(g && g.needBuyIn); }
	function isLandscape(key) { var g = get(key); return !!(g && g.landscape); }
	function titleOf(key) { var g = get(key); return g ? g.title : String(key == null ? "" : key); }
	function dirOf(key, withSlash) {
		var g = get(key);
		if (!g || !g.dir) return "";
		return withSlash ? (g.dir + "/") : g.dir;
	}
	function tickets() {
		var out = {};
		for (var i = 0; i < ORDER.length; i++) out[ORDER[i]] = CATALOG[ORDER[i]].ticket;
		return out;
	}
	function decays() {
		var out = {};
		for (var i = 0; i < ORDER.length; i++) out[ORDER[i]] = CATALOG[ORDER[i]].decay;
		return out;
	}
	function minTicket() {
		var m = Infinity;
		for (var i = 0; i < ORDER.length; i++) {
			var t = CATALOG[ORDER[i]].ticket;
			if (t > 0 && t < m) m = t;
		}
		return m === Infinity ? 0 : m;
	}
	/* 结算参数：把「按游戏分派」的散落常量收成一处，
	   csh_wallet / csh_shell 都读它，避免同一游戏两套回收率。 */
	function settlePlan(key) {
		var g = get(key);
		if (!g) return null;
		var base = { key: g.key, mode: g.settle, ticket: g.ticket };
		if (g.settle === "chips") {
			base.decay = g.decay;
		} else if (g.settle === "rank") {
			base.perBeat = UNO_PER_BEAT;
			base.capMult = UNO_CAP_MULT;
		}
		return base;
	}

	/* ---------- 目录自检（隐藏自检 ?selftest=1 会调） ---------- */
	function selfTest() {
		var errs = [];
		var seen = {};
		all().forEach(function (k) {
			var g = CATALOG[k];
			if (!g) { errs.push("目录缺失: " + k); return; }
			if (g.key !== k) errs.push("key 不一致: " + k + " vs " + g.key);
			if (!g.title) errs.push(k + " 缺标题");
			if (!g.file) errs.push(k + " 缺 file");
			if (!g.lobby && !g.dir) errs.push(k + " 非大厅却无 dir");
			if (g.lobby && g.dir) errs.push(k + " 大厅 dir 必须为空（拼 URL 时会多一个斜杠）");
			if (["chips", "rank", "none"].indexOf(g.settle) < 0) errs.push(k + " 结算方式非法: " + g.settle);
			if (g.settle === "chips" && !(g.decay > 0 && g.decay <= 1)) errs.push(k + " 回收率非法: " + g.decay);
			if (g.settle !== "chips" && g.needBuyIn) errs.push(k + " 非牌桌类不允许 needBuyIn");
			if (g.ticket < 0) errs.push(k + " 门票为负");
			if (g.needBuyIn && g.ticket > 0) errs.push(k + " 带入制不应收门票（双重抽水）");
			if (seen[k]) errs.push("重复 key: " + k); seen[k] = 1;
		});
		if (ORDER.length !== keys().length) errs.push("ORDER 与 keys() 不一致");
		/* 结算参数必须齐备：消费方（wallet/shell）不允许再自己写回收率 */
		keys().forEach(function (k) {
			var p = settlePlan(k);
			if (!p) { errs.push("settlePlan 缺失: " + k); return; }
			if (p.mode === "chips" && typeof p.decay !== "number") errs.push(k + " 缺回收率");
			if (p.mode === "rank" && typeof p.perBeat !== "number") errs.push(k + " 缺名次系数");
		});
		/* 负期望守护：名次类在「平均表现」下必须不赚 */
		var uno = settlePlan("uno");
		if (uno && uno.mode === "rank") {
			for (var n = 2; n <= 4; n++) {
				var sum = 0;
				for (var p = 1; p <= n; p++) sum += uno.ticket * uno.perBeat * (n - p);
				var ev = sum / n;
				if (ev >= uno.ticket) errs.push("UNO " + n + " 人局期望 " + ev + " ≥ 门票 " + uno.ticket + "（正期望刷钱）");
			}
		}
		return { ok: errs.length === 0, count: all().length, errs: errs };
	}

	var API = {
		version: "1.0.0",
		ORDER: ORDER.slice(),
		LOBBY: LOBBY,
		UNO_PER_BEAT: UNO_PER_BEAT,
		UNO_CAP_MULT: UNO_CAP_MULT,
		keys: keys, all: all, get: get, has: has,
		isLobby: isLobby, settleOf: settleOf, needBuyIn: needBuyIn, isLandscape: isLandscape,
		titleOf: titleOf, dirOf: dirOf,
		tickets: tickets, decays: decays, minTicket: minTicket, settlePlan: settlePlan,
		selfTest: selfTest,
	};
	root.CSH.registry = API;
	/* 兼容：非 ESM 环境（noname 本体把 lib 挂在全局） */
	try { if (typeof lib !== "undefined" && lib && !lib.cshRegistry) lib.cshRegistry = API; } catch (e) {}
})(typeof window !== "undefined" ? window : this);
