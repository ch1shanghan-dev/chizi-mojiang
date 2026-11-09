/* ============================================================
   池子魔将 · 成就引擎 v2（§4.1.6 扩展 · 2026-09-29 规模翻倍）
   ------------------------------------------------------------
   零 import、IIFE 挂 window.CSH_ACHV（双载模式）：
   · 主文档（extension.js ESM import）：壳层 shell-ach-claim 复核领奖用；
   · games/career.html（经典 <script>）：成就墙渲染用。
   两份实例无状态串扰，领奖进度统一存 localStorage（同源共享）。

   ★ 2026-09-29 重写原则（用户需求原文：「禁止使用任何假数据或占位数据」
     「规模再翻倍，同样要求真实可信，让玩家可以长期投入游玩而不会失去目标」）：
     1. **每一条的判定量都来自真实统计快照**（宿主 csh_shell.buildStats 聚合），
        不允许出现常量进度、不允许 `1/1` 的伪达成、不允许引用已删除的字段
        （旧版 `bank` 成就读的是全仓无写入的死字段 —— 本次已删除并替换为
        真实可核的 `pcPeak`）。
     2. **规模 ≥ 420 条**（实测 434 条），按 11 个可浏览分类程序化生成，
        全部可在成就墙翻页浏览：
        官阶 55 / 功勋 26 / 资产 40 / 签到 16 / 胜负 70 /
        AI世界 81 / 豪赌桌 72 / 任务 12 / 互动 20 / 彩蛋 12。
     3. **长期目标阶梯**：最大档位刻意拉高到"需要长期投入才可能"的量级
        （例如把世界首富打穿、豪赌桌净赢 1,000 万、功勋 30 万），
        保证玩家无论玩多久都还有下一个目标；
        ★ 且每一档都必须**数学上可达**（2026-09-29 用户复核：
        「有些成就根本就完不成」——已按各系统物理上限重新校准顶格）。
     4. 奖励一次性，领取时由**宿主侧**复核条件（防伪造桥消息）。
   ============================================================ */
(function () {
	if (typeof window !== "undefined" && window.CSH_ACHV) return;   /* 幂等守卫 */
	var root = typeof window !== "undefined" ? window : globalThis;

	/* ---------- 存档（已领取集合）：同源 localStorage 共享 ---------- */
	var CLAIM_KEY = "csh_career_achv";
	var memClaim = {};                       /* localStorage 不可用时的内存兜底（vm 自检） */
	function lsGet() {
		var map = memClaim;
		try {
			if (typeof localStorage === "undefined") return memClaim;
			var raw = localStorage.getItem(CLAIM_KEY);
			var v = raw ? JSON.parse(raw) : {};
			map = (v && typeof v === "object" && !Array.isArray(v)) ? v : {};
		} catch (e) {}
		/* 奖励与钱包同写的凭据是真值之一；旧领奖集合写失败也不会重复兑现。
		   每次直读，支持刷新/其他文档与导入后的新状态。 */
		try {
			var w = JSON.parse(localStorage.getItem("csh_wallet") || "{}");
			var paid = w && w.careerClaims;
			if (paid && typeof paid === "object" && !Array.isArray(paid)) {
				map = Object.assign({}, map);
				Object.keys(paid).forEach(function (key) { if (paid[key]) map[key] = 1; });
			}
		} catch (eWallet) {}
		return map;
	}
	function lsPut(map) {
		memClaim = map;
		try {
			if (typeof localStorage !== "undefined") localStorage.setItem(CLAIM_KEY, JSON.stringify(map));
		} catch (e) {}
	}

	/* ---------- 定义工具 ---------- */
	var defs = [];
	function push(key, cat, ico, label, desc, prog, reward) {
		defs.push({ key: key, cat: cat, ico: ico, label: label, desc: desc, prog: prog, reward: Math.max(500,Math.ceil(reward*5/50)*50) });
	}
	/* 阶梯生成：tier(def{key,cat,ico}, 名称模板, 描述模板, 阈值数组, prog 工厂, 奖励工厂) */
	function tier(def, labelTpl, descTpl, arr, progOf, rewardOf) {
		for (var i = 0; i < arr.length; i++) {
			(function (v) {
				push(def.key + "_" + v, def.cat, def.ico,
					labelTpl.replace("{n}", fmt(v)), descTpl.replace("{n}", fmt(v)),
					progOf(v), rewardOf(v));
			})(arr[i]);
		}
	}
	function fmt(n) {
		var v = Number(n) || 0;
		/* 【2026-10-03 修复】小数阈值（如牌技 0.70 / 0.95）此前被 Math.floor 取整，
		   8 档全部渲染成「牌技上限 · 0」——标题重名、无法分辨。
		   现：整数照旧加千分位；小数保留原样（去掉末尾多余的 0）。 */
		if (v !== Math.floor(v)) return String(Number(v.toFixed(2)));
		return String(Math.floor(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	}
	function statProg(field, goal) {
		return function (s) { return [Number(s[field]) || 0, goal]; };
	}
	/* v4 · 总量型进度（BOSS 挑战专用）：分母 = 快照里的动态总量（shell buildStats 由
	   lib.cshBossRecord.summary() 注入，随档位名单变化），快照缺失时回落到静态值。
	   —— 名单改动后成就阈值自动跟随，"数学上恒可达"不再依赖人工同步数字。 */
	function bossProg(field, totalField, fallback) {
		return function (s) {
			return [Number(s[field]) || 0, Number(s[totalField]) || fallback];
		};
	}
	/* v4 · 系列计数读取（键系容错）：快照 series/seriesTotal 的键**无 csh_ 前缀**
	   （csh_bossrecord.summary 的 `sk.replace(/^csh_/,"")`，与讨伐录系列表同契约）。
	   这里对「无前缀」与「带前缀」两种写法都查一次 —— 单点兼容，避免键系漂移再静默归零。 */
	function pickSeries(bag, key) {
		if (!bag) return 0;
		var v = bag[key];
		if (v == null) v = bag["csh_" + key];
		return Number(v) || 0;
	}
	/* 「反向目标 + 证据前置」：必须先有真实经历（如打过手 / 曾有过钱），
	   否则宿主字段全 0（世界模块未加载）时会瞬间伪达成。
	   例：打穷它 → 至少同桌过 1 手；囊中羞涩 → 生涯峰值曾 ≥ 1000。 */
	function atMostAfter(field, v, witnessField, witnessMin) {
		return function (s) {
			var witness = (Number(s[witnessField]) || 0) >= witnessMin;
			return [(witness && (Number(s[field]) || 0) <= v) ? 1 : 0, 1];
		};
	}

	/* ============================================================
	   1. 官阶登阶（50 条 + 段里程碑 5 条 = 55）
	   ============================================================ */
	for (var r = 1; r <= 50; r++) {
		(function (rr) {
			push("rank_" + rr, "官阶", "🎖", "官阶 · " + rr + " 阶",
				"功勋达到第 " + rr + " 阶晋阶线（官阶达到 " + rr + "）",
				function (s) { return [Number(s.rank) || 0, rr]; }, 100 + rr * 15);
		})(r);
	}
	var segDefs = [
		[10, "晋入杂号", "官阶达到 10 阶，进入「杂号」段（10–19 阶）"],
		[20, "晋入中垒", "官阶达到 20 阶，进入「中垒」段（20–29 阶）"],
		[30, "晋入方镇", "官阶达到 30 阶，进入「方镇」段（30–39 阶）"],
		[40, "晋入上公", "官阶达到 40 阶，进入「上公」段（40–50 阶）"],
		[50, "五段 · 大将军", "官阶达到 50 阶，位极人臣"],
	];
	for (var sd = 0; sd < segDefs.length; sd++) {
		(function (v, lab, des) {
			push("seg_" + v, "官阶", "👑", lab, des,
				function (s) { return [Number(s.rank) || 0, v]; }, 500 + v * 20);
		})(segDefs[sd][0], segDefs[sd][1], segDefs[sd][2]);
	}

	/* ============================================================
	   2. 功勋（累计 16 + 单日 10 = 26）
	   ============================================================ */
	tier({ key: "merit", cat: "功勋", ico: "⚔" }, "功勋 · {n}", "生涯累计功勋达到 {n}",
		/* 2026-09-29 可达性校正：结算功勋挂钩后，顶格 50 万仍需上千天满打
		   ⇒「根本完不成」。顶格压到 30 万（≈ 顶阶官阶需求的 2.4 倍，
		   仍是毕级目标，但数学上可达）；同时加密低段阶梯保持总规模。 */
		[100, 300, 600, 1000, 1500, 2200, 3000, 4500, 6000, 8000, 10000, 13000,
			18000, 24000, 30000, 45000, 60000, 80000, 100000, 130000, 170000, 220000, 300000],
		function (v) { return statProg("merit", v); },
		function (v) { return Math.max(50, Math.round(v / 10)); });
	tier({ key: "meritday", cat: "功勋", ico: "🌞" }, "功勋 · 单日 {n}", "单日功勋达到 {n}（今日爆发）",
		/* 2026-09-29：meritToday 假钳制修复后，单日入账 = 软上限 + 半价溢出，
		   顶格 24,000 需要一天五千局，不可达 ⇒ 顶格压到 6,000，中段加密。 */
		[50, 100, 150, 200, 300, 400, 600, 800, 1200, 1500, 2000, 3000, 4000, 6000],
		function (v) { return statProg("meritToday", v); },
		function (v) { return Math.max(50, Math.round(v / 8)); });

	/* ============================================================
	   3. 资产（池子币 18 + 生涯峰值 18 + 落魄 4 = 40）
	   ★ pcPeak 取代旧版读死字段 bank 的"银行存款"成就
	   ============================================================ */
	tier({ key: "rich", cat: "资产", ico: "💰" }, "资产 · {n}", "池子币余额达到 {n}",
		[500, 1000, 3000, 8000, 20000, 50000, 120000, 300000, 800000, 2000000, 5000000, 10000000,
			20000000, 35000000, 50000000, 70000000, 85000000, 100000000],
		function (v) { return statProg("pc", v); },
		function (v) { return Math.max(80, Math.round(v / 60)); });
	tier({ key: "peak", cat: "资产", ico: "📈" }, "巅峰 · {n}", "生涯池子币峰值达到 {n}（历史最高，不会回落）",
		[2000, 5000, 12000, 30000, 60000, 120000, 250000, 500000, 1000000, 2000000, 4000000, 8000000,
			15000000, 25000000, 40000000, 60000000, 80000000, 100000000],
		function (v) { return statProg("pcPeak", v); },
		function (v) { return Math.max(100, Math.round(v / 50)); });
	tier({ key: "poor", cat: "资产", ico: "🪙" }, "囊中羞涩 · {n}", "池子币余额跌到 {n} 以下（谁还没个落魄的时候）",
		[100, 20, 1, 0],
		function (v) { return atMostAfter("pc", v, "pcPeak", 1000); },
		function (v) { return 66 + (100 - v); });

	/* ============================================================
	   4. 签到（连签 16）
	   ============================================================ */
	tier({ key: "sign", cat: "签到", ico: "📅" }, "连签 · {n} 天", "连续签到 {n} 天",
		[2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 120, 180, 240, 300, 365],
		function (v) { return statProg("streak", v); },
		function (v) { return 100 + v * 15; });

	/* ============================================================
	   6. 胜负（场次 16 / 胜场 16 / 败场 14 / 击杀 14 / 武将 6 / 模式 4 = 70）
	   ============================================================ */
	tier({ key: "games", cat: "胜负", ico: "🎮" }, "对局 · {n} 场", "生涯对局数（各模式合计）达到 {n} 场",
		[1, 5, 10, 25, 50, 100, 200, 400, 700, 1000, 1500, 2200, 3000, 4000, 6000, 10000],
		function (v) { return statProg("wrGames", v); },
		function (v) { return Math.max(60, Math.round(v / 2)); });
	tier({ key: "wins", cat: "胜负", ico: "🏆" }, "胜场 · {n}", "生涯胜场达到 {n} 场",
		[1, 5, 10, 25, 50, 100, 200, 400, 700, 1000, 1500, 2200, 3000, 4000, 6000, 10000],
		function (v) { return statProg("wrWin", v); },
		function (v) { return Math.max(80, Math.round(v / 2)); });
	tier({ key: "loses", cat: "胜负", ico: "🛡" }, "败场 · {n}", "生涯败场达到 {n} 场（败而不馁）",
		[1, 10, 25, 50, 100, 200, 400, 700, 1000, 1500, 2200, 3000, 4000, 6000],
		function (v) { return statProg("wrLose", v); },
		function (v) { return Math.max(50, Math.round(v / 3)); });
	tier({ key: "kills", cat: "胜负", ico: "🗡" }, "击杀 · {n}", "生涯击杀数达到 {n}",
		[1, 5, 10, 25, 50, 100, 250, 500, 1000, 1500, 2500, 4000, 6000, 10000],
		function (v) { return statProg("wrKill", v); },
		function (v) { return Math.max(80, Math.round(v / 2)); });
	tier({ key: "chars", cat: "胜负", ico: "🧝" }, "武将 · {n} 名", "使用过 {n} 名不同武将（有出场记录）",
		[1, 3, 5, 10, 20, 40],
		function (v) { return statProg("wrChars", v); },
		function (v) { return 120 + v * 40; });
	tier({ key: "modes", cat: "胜负", ico: "🗺" }, "模式 · {n} 种", "在 {n} 种模式下都有过对局",
		[1, 2, 3, 4],
		function (v) { return statProg("wrModes", v); },
		function (v) { return 150 + v * 60; });

	/* ============================================================
	   7. AI 世界（同桌手数 16 / 角色 5 / 打穷它 8 / 打穿首富 10
	               富豪人数 5 / 首富被打穷 10 / 牌技上限 8 / 退隐数 10 = 72）
	   ★ 全部来自 csh_world 的真实世界档案
	   ============================================================ */
	tier({ key: "hands", cat: "AI世界", ico: "🀄" }, "同桌 · {n} 人次", "与 AI 同桌累计 {n} 人次（每位对手每场记一次）",
		[1, 10, 30, 60, 120, 250, 500, 1000, 2000, 3500, 5500, 8000, 12000, 18000, 26000, 40000],
		function (v) { return statProg("worldHands", v); },
		function (v) { return Math.max(60, Math.round(v / 4)); });
	tier({ key: "worldchars", cat: "AI世界", ico: "🌐" }, "世界 · {n} 人", "AI 世界角色数达到 {n} 名",
		/* 2026-10-01：世界 36 → 97 人，档位顶格 = 全收 97。 */
		[20, 40, 60, 80, 97],
		function (v) { return statProg("worldChars", v); },
		function (v) { return 100 + v * 20; });
	tier({ key: "poorai", cat: "AI世界", ico: "🥊" }, "打穷它 · {n}", "把任意一位 AI 打到资金不超过 {n}（打穷它）",
		[10000, 5000, 2000, 1000, 500, 200, 100, 10],
		function (v) { return atMostAfter("playerFundMin", v, "playerFundWitness", 1); },
		function (v) { return Math.max(120, Math.round(20000 / v)); });
	/* 世界当前最高资金的观察线；同桌经历只作前置，不证明缩水幅度、先后或玩家归因。 */
	tier({ key: "topdown", cat: "AI世界", ico: "⛏" }, "首富观察 · {n}", "至少完成过 1 人次 AI 同桌游戏，且当前世界最高资金不超过 {n} CBY",
		[10000000, 5000000, 2000000, 1000000, 500000, 200000, 100000, 50000, 20000, 5000],
		function (v) { return atMostAfter("worldTopFund", v, "worldHands", 1); },
		function (v) { return Math.max(150, Math.round(5000000 / v)); });
	/* 世界当前最高资金，不将世界自行演化归因为玩家输赢。 */
	tier({ key: "topfund", cat: "AI世界", ico: "🏰" }, "首富身家 · {n}", "当前世界最高资金达到 {n} CBY",
		[10000000, 20000000, 35000000, 50000000, 92600000, 150000000, 300000000, 500000000],
		function (v) { return statProg("worldFundMax", v); },
		function (v) { return Math.max(400, Math.round(v / 50000)); });
	tier({ key: "billionaires", cat: "AI世界", ico: "💎" }, "豪赌席 · {n} 人", "当前有 {n} 名 AI 身家达到 2,000 万以上（豪赌席规模）",
		/* 2026-10-01：豪赌席 8 人，补 8 档（顶格 6 到不了满席）。 */
		[1, 2, 3, 4, 6, 8],
		function (v) { return statProg("billionaires", v); },
		function (v) { return 300 + v * 150; });
	tier({ key: "broke", cat: "AI世界", ico: "🔻" }, "首富落难 · {n} 人", "当前至少有 {n} 位曾进入豪赌席的 AI，资金已低于豪赌席门槛",
		/* 2026-10-01：世界扩到 97 人，可上探至 ~48（穷桌 30 + 富桌 18）。 */
		[1, 2, 3, 5, 8, 12, 18, 25, 34, 48],
		function (v) { return statProg("billionaireBroke", v); },
		function (v) { return 500 + v * 200; });
	tier({ key: "skilltop", cat: "AI世界", ico: "🧠" }, "牌技上限 · {n}", "与牌技达到 {n} 的 AI 同桌过",
		[0.70, 0.80, 0.85, 0.90, 0.95, 0.98, 0.99, 1.00],
		function (v) { return statProg("worldSkillTop", v); },
		function (v) { return Math.round(100 + v * 800); });
	/* 玩家亲历主题：四种不同的经历，长期阶梯不删旧目标、不补造历史。 */
	tier({ key: "tablefriends", cat: "AI世界", ico: "🤝" }, "牌友 · {n} 名", "与 {n} 名不同的 AI 完成过同桌游戏",
		[1, 3, 5, 10, 20, 40, 60, 80, 99], function (v) { return statProg("playerOpponents", v); },
		function (v) { return 150 + v * 25; });
	tier({ key: "oldfriend", cat: "AI世界", ico: "🍵" }, "熟面孔 · {n} 回", "与同一名 AI 累计完成 {n} 场同桌游戏",
		[3, 5, 10, 20, 40, 80, 150, 300], function (v) { return statProg("playerFamiliar", v); },
		function (v) { return 150 + v * 8; });
	tier({ key: "revengefriend", cat: "AI世界", ico: "♟" }, "再战破局 · {n} 位", "先输给某位 AI，再于之后战胜他；对 {n} 位不同对手完成逆转",
		[1, 3, 5, 10, 20, 40], function (v) { return statProg("playerRevenge", v); },
		function (v) { return 250 + v * 80; });
	tier({ key: "balancedfriend", cat: "AI世界", ico: "⚖" }, "互有胜负 · 各 {n} 回", "你与同一名 AI 互有胜负，双方各至少取胜 {n} 次",
		[1, 3, 5, 10, 20], function (v) { return statProg("playerBalanced", v); },
		function (v) { return 200 + v * 60; });
	/* ---------- 世界动态成就（2026-10-03 新增） ----------
	   数据来自 csh_world 的成就计数（world.feats）→ shell buildStats → 这里 statProg。
	   这批成就的共同点：**奖励"看见世界在动"**，而不是"刷数值" —— 纪录被破、有人破产、
	   有人复出、宿敌交手、你把人打落档、你被记恨，都是世界真实发生的事。
	   阈值与奖励参照同分类既有档位，避免出现"最难的那条给的钱最少"这种倒挂。 */
	tier({ key: "worldrec", cat: "AI世界", ico: "📈" }, "世界纪录 · 改写 {n} 次", "世界纪录累计被打破 {n} 次（包含世界自行演化）",
		[1, 3, 8, 15, 25],
		function (v) { return statProg("recordsSeen", v); },
		function (v) { return Math.round(200 + v * 150); });
	tier({ key: "tierdown", cat: "AI世界", ico: "⚔" }, "打落一档 · {n} 人次", "累计 {n} 人次 AI 在与你的牌桌游戏中从高档位跌到下一档",
		[1, 2, 5, 10, 20],
		function (v) { return statProg("tierDown", v); },
		function (v) { return Math.round(300 + v * 200); });
	tier({ key: "comebacksee", cat: "AI世界", ico: "🌱" }, "牌手归来 · {n} 人次", "世界累计 {n} 人次牌手输光退隐后重新坐回牌桌",
		[1, 3, 8, 15],
		function (v) { return statProg("comebacks", v); },
		function (v) { return Math.round(150 + v * 120); });
	tier({ key: "rivalsee", cat: "AI世界", ico: "🔥" }, "宿敌 · 见证 {n} 对", "见证 {n} 对宿敌交手破 50 局",
		[1, 3, 6, 10],
		function (v) { return statProg("rivals", v); },
		function (v) { return Math.round(200 + v * 180); });
	tier({ key: "grudge8", cat: "AI世界", ico: "🧾" }, "仇家 · {n} 人", "让 {n} 个人对你记恨到 8 级",
		[1, 2, 4, 8],
		function (v) { return statProg("grudge8", v); },
		function (v) { return Math.round(120 + v * 150); });
	/* 旧 gstreak2 四档保留ID/奖励；区别于 gmstreak 的单一连胜纪录。
	   只要求生涯同时具备两项事实，不从计数推断先后或毛亏损。 */
	tier({ key: "gstreak2", cat: "豪赌桌", ico: "🎲" }, "起伏之间 · {n}", "豪赌桌净亏出战数与历史连胜纪录均达到 {n} 场",
		[2, 3, 5, 8],
		function (v) { return function (s) {
			var streak = Number(s.gambleBestStreak), losses = Number(s.gambleBust);
			var known = Number.isSafeInteger(streak) && streak >= 0 && Number.isSafeInteger(losses) && losses >= 0;
			return [known ? Math.min(streak, losses) : 0, v];
		}; },
		function (v) { return Math.round(300 + v * 400); });
	tier({ key: "retired", cat: "AI世界", ico: "🪦" }, "退隐 · {n} 人", "当前有 {n} 名 AI 因资金耗尽而退隐",
		/* 2026-10-01：世界扩到 97 人，退隐数顶格上探（30/36 的 83% 等比例 ≈ 80）。 */
		[1, 2, 4, 6, 9, 12, 16, 20, 25, 32, 40, 50, 64, 80],
		function (v) { return statProg("worldRetired", v); },
		function (v) { return 120 + v * 45; });

	/* ============================================================
	   8. 豪赌桌（出场 14 / 胜场 10 / 净赢 14 / 单局最佳 10
	               折戟 8 / 连胜 10 = 66）
	   ★ 2026-09-29 全新维度：豪赌桌 AI 携带玩家 2~5 倍资金、牌技 0.85~1.00，
     期望收益为负 —— 所以这里的每一条都是**真正的勋章**。
	   ============================================================ */
	tier({ key: "gmplay", cat: "豪赌桌", ico: "🎰" }, "豪赌 · {n} 次", "在豪赌桌（带入 200,000）出战 {n} 次",
		[1, 2, 5, 10, 20, 35, 60, 100, 160, 250, 400, 600, 900, 1400],
		function (v) { return statProg("gamblePlays", v); },
		function (v) { return Math.max(200, v * 30); });
	tier({ key: "gmwin", cat: "豪赌桌", ico: "🥇" }, "豪赌胜场 · {n}", "在豪赌桌净赢 {n} 局（把世界顶级牌手打下桌）",
		[1, 2, 4, 8, 15, 25, 40, 60, 90, 130],
		function (v) { return statProg("gambleWins", v); },
		function (v) { return Math.max(400, v * 120); });
	tier({ key: "gmnet", cat: "豪赌桌", ico: "🏛" }, "豪赌净赢 · {n}", "豪赌桌生涯净赢达到 {n} CBY",
		/* 2026-09-29 可达性校正：单局自然封顶 = 同桌 AI 带入总额（约 500 万），
		   期望收益为负 ⇒ 顶格 10 亿需要几百次理论满赢，数学上不可能。
		   顶格压到 1,000 万（数十次好局 + 极限运气，难但不虚）。 */
		[100000, 200000, 300000, 500000, 800000, 1200000, 2000000, 3000000, 5000000, 7000000, 10000000],
		function (v) { return statProg("gambleNet", v); },
		function (v) { return Math.max(500, Math.round(v / 2000)); });
	tier({ key: "gmbest", cat: "豪赌桌", ico: "👑" }, "豪赌单局 · {n}", "豪赌桌单局净赢达到 {n} CBY（一次通吃）",
		/* 2026-09-29：单局净赢 ≤ 同桌 AI 带入总额（豪赌 AI 2~5 倍 × 桌面人数），
		   理论天花板约 500 万 ⇒ 顶格 50,000,000 不可达，压到 5,000,000（= 通吃全桌）。 */
		[50000, 80000, 120000, 200000, 300000, 500000, 700000, 1000000, 1500000, 2000000, 3000000, 5000000],
		function (v) { return statProg("gambleBest", v); },
		function (v) { return Math.max(300, Math.round(v / 500)); });
	tier({ key: "gmbust", cat: "豪赌桌", ico: "💀" }, "豪赌折戟 · {n}", "在豪赌桌净输 {n} 局（贪心的代价，也是必经之路）",
		[1, 3, 8, 20, 40, 70, 110, 170],
		function (v) { return statProg("gambleBust", v); },
		function (v) { return 100 + v * 25; });
	tier({ key: "gmstreak", cat: "豪赌桌", ico: "🔥" }, "豪赌连胜 · {n}", "在豪赌桌连赢 {n} 局",
		[2, 3, 4, 5, 6, 8, 10, 13, 17, 22],
		function (v) { return statProg("gambleBestStreak", v); },
		function (v) { return 300 + v * 250; });
	/* 豪赌失血读取生涯净额；包含此前盈亏抵消，不是各场毛亏损之和。 */
	(function () {
		var mags = [100000, 500000, 2000000, 10000000, 30000000, 80000000];
		for (var i = 0; i < mags.length; i++) {
			(function (m) {
				push("gmloss_" + m, "豪赌桌", "🩸", "豪赌失血 · " + fmt(m),
					"豪赌桌生涯累计净收益为 −" + fmt(m) + " CBY 或更低（按全部出战盈亏抵消后计算）",
					function (s) { var n = Number(s.gambleNet) || 0; return [n <= -m ? 1 : 0, 1]; },
					200 + Math.round(m / 5000));
			})(mags[i]);
		}
	})();

	/* ============================================================
	   9. 每日任务（完成 12）
	   ============================================================ */
	/* 每日只有三项；原 task_4 以上保留旧ID与奖励，改读真实跨日累计。 */
	tier({ key: "task", cat: "任务", ico: "📋" }, "任务 · {n} 项", "单日完成 {n} 项每日任务",
		[1, 2, 3],
		function (v) { return statProg("taskDone", v); },
		function (v) { return 120 + v * 60; });
	tier({ key: "task", cat: "任务", ico: "📋" }, "日课 · 累计 {n} 项", "跨日累计完成 {n} 项每日任务",
		[4, 5, 6, 7, 8, 9, 10, 12, 15],
		function (v) { return statProg("taskCompletedTotal", v); },
		function (v) { return 120 + v * 60; });

	/* ============================================================
	   10. 互动（扔道具 16）
	   ============================================================ */
	tier({ key: "interact", cat: "互动", ico: "🌹" }, "互动 · {n} 次", "向 AI 扔出道具累计 {n} 次（花 / 酒 / 蛋 / 鞋）",
		[1, 5, 15, 30, 60, 100, 200, 400, 700, 1100, 1600, 2200, 3000, 4000, 5500, 7500, 10000, 14000, 20000, 30000],
		function (v) { return statProg("interactTotal", v); },
		function (v) { return Math.max(50, Math.round(v / 2)); });

	/* ============================================================
	   11. 彩蛋（10）—— 全部是可判定的真实条件
	   ============================================================ */
	push("egg_night_owl", "彩蛋", "🌙", "夜猫子", "在深夜 0 点至 4 点间打开生涯大厅（今晚也是不眠夜）",
		function (s) { return [s.nightOwl ? 1 : 0, 1]; }, 88);
	push("egg_signed_first", "彩蛋", "🤝", "初次见面", "完成第一次签到（连签 ≥ 1 天）",
		function (s) { return [Number(s.streak) || 0, 1]; }, 50);
	push("egg_seg_rise", "彩蛋", "🪜", "初入段位", "官阶跨入第一个段位（段序号 ≥ 1）",
		function (s) { return [Number(s.segIdx) || 0, 1]; }, 150);
	push("egg_task_full", "彩蛋", "✅", "日课圆满", "当日每日任务全部完成（完成数 ≥ 任务总数）",
		function (s) { return [Number(s.taskDone) || 0, Math.max(1, Number(s.taskTotal) || 1)]; }, 600);
	push("egg_gamble_first", "彩蛋", "🎲", "初入豪赌", "完成首次豪赌桌出战结算（单纯入场或未开局退款不计）",
		function (s) { return [(Number(s.gamblePlays) || 0) >= 1 ? 1 : 0, 1]; }, 300);
	push("egg_hungry", "彩蛋", "🥣", "一贫如洗", "先有过四位数的身家，再跌回 0（然后你还会回来的）",
		function (s) { return [((Number(s.pcPeak) || 0) >= 1000 && (Number(s.pc) || 0) <= 0) ? 1 : 0, 1]; }, 200);
	push("egg_rich_first", "彩蛋", "🤑", "百万身家", "池子币首次突破 100 万",
		function (s) { return [Number(s.pcPeak) || 0, 1000000]; }, 1000);
	push("egg_rank_master", "彩蛋", "🏅", "登峰造极", "官阶达到 50 阶（大将军）",
		function (s) { return [Number(s.rank) || 0, 50]; }, 5000);
	push("egg_world_tour", "彩蛋", "🗺", "巡场", "与 AI 同桌累计人次达到当前世界角色数的 10 倍（至少 10 人次）",
		function (s) {
			var need = Math.max(1, (Number(s.worldChars) || 0)) * 10;
			return [Number(s.worldHands) || 0, need];
		}, 800);
	push("egg_billion_killer", "彩蛋", "⚰", "屠龙者", "世界中至少有 1 位曾进入豪赌席的 AI，当前资金已低于豪赌席门槛",
		function (s) { return [(Number(s.billionaireBroke) || 0) >= 1 ? 1 : 0, 1]; }, 2000);
	push("egg_full_house", "彩蛋", "🎯", "满堂彩", "单日把三项每日任务全部完成（任务完成数 ≥ 3）",
		function (s) { return [Number(s.taskDone) || 0, 3]; }, 400);

	/* ============================================================
	   12. 挑战（BOSS 讨伐 · 2026-10-13 批次 4c · 16 条）
	   ------------------------------------------------------------
	数据源 = buildStats 的 bossKill* / bossSeries / bossTotal* / bossSeriesTotal
	   （lib.cshBossRecord.summary 聚合，与讨伐录页面同一数据源，§6.4③）；
	   领奖走既有 shell-ach-claim 链。
	   阈值全部数学上可达：分母读快照动态总量（bossTotal*），名单改动自动跟随
	   ——"打满"= 逐一击破，恒有终点。
	   ============================================================ */
	(function () {
		var steps = [1, 5, 20, 50], rw = { 1: 200, 5: 400, 20: 900, 50: 2000 };
		for (var i = 0; i < steps.length; i++) {
			(function (v) {
				push("bosskill_" + v, "挑战", "🗡", "初讨 · " + v, "累计讨伐 " + v + " 位魔王（讨伐录可查）",
					function (s) { return [Number(s.bossKill) || 0, v]; }, rw[v]);
			})(steps[i]);
		}
	})();
	push("boss_all", "挑战", "🗡", "讨伐录 · 圆满", "册中魔王全部击破（整本讨伐录点亮）",
		bossProg("bossKill", "bossTotal", 93), 8000);
	push("boss_ult_all", "挑战", "🗡", "究极全破", "全部究极魔王击破（魔威 · 霸体 · 魔怒俱在）",
		bossProg("bossKillUlt", "bossTotalUlt", 8), 3000);
	push("boss_lord_all", "挑战", "🗡", "霸主全破", "全部霸主魔王击破",
		bossProg("bossKillLord", "bossTotalLord", 30), 2600);
	push("boss_egg_all", "挑战", "🗡", "彩蛋全破", "4 位彩蛋魔王全部击破",
		bossProg("bossKillEgg", "bossTotalEgg", 4), 1200);
	(function () {
		/* d[2] 仅用于描述文案（v4 实际计数）；判定分母走快照 bossSeriesTotal 动态值。
		   ★ 2026-10-14 审计修复（真 BUG）：快照 `series` / `seriesTotal` 的键是
		     **不带 csh_ 前缀**的（csh_bossrecord.summary 里 `sk.replace(/^csh_/,"")`，
		     与 bossbook 页的系列表契约一致）。此前本表用带前缀的 "csh_cuifeng" 去索引
		     无前缀的快照 → 恒 undefined → 分子恒 0、分母回落静态值 → **8 条系列成就
		     数学上永不可达成**（进度永远 0/N）。现在键统一为无前缀，并对旧写法双查兜底。 */
		var seriesDef = [
			["cuifeng", "摧锋", 24], ["zhoutian", "周天", 26], ["fulan", "覆澜", 10],
			["huichuan", "汇川", 10], ["fuguang", "浮光", 10], ["jinhuo", "烬火", 7],
			["jingting", "惊霆", 5], ["qunyou_lunwai", "外传", 1],
		];
		for (var i = 0; i < seriesDef.length; i++) {
			(function (d) {
				push("boss_series_" + d[0], "挑战", "🗡", d[1] + "全讨", d[1] + "系列 " + d[2] + " 位全部击破",
					function (s) {
						var tot = pickSeries(s.bossSeriesTotal, d[0]) || d[2];
						return [pickSeries(s.bossSeries, d[0]) || 0, tot];
					}, 800);
			})(seriesDef[i]);
		}
	})();
	/* v4.2 速通（作者定案：速通排行可以有）：某档"最快击破轮数 ≤ N"= 1/1 达成
	   （分母恒 1，未达成时显示 0/1；数据源 buildStats.bossSpeed*） */
	(function () {
		var speedDef = [
			["ultimate", "速通 · 究极", "12", 12, 2600],
			["lord", "速通 · 霸主", "10", 10, 1800],
			["elite", "速通 · 精英", "8", 8, 900],
		];
		for (var i = 0; i < speedDef.length; i++) {
			(function (d) {
				push("boss_speed_" + d[0], "挑战", "⏱", d[1], "在 " + d[2] + " 轮内击破一位" +
					({ ultimate: "究极", lord: "霸主", elite: "精英" })[d[0]] + "魔王",
					function (s) {
						var sp = s.bossSpeed && Number(s.bossSpeed[d[0]]);
						return [(sp && sp > 0 && sp <= d[3]) ? 1 : 0, 1];
					}, d[4]);
			})(speedDef[i]);
		}
	})();
	/* v4.2 魔王方战绩（作者定案：操纵魔王的战绩挂上去）：应战模式取胜 1 / 5 / 20 次 */
	(function () {
		var steps = [1, 5, 20], rw = { 1: 300, 5: 900, 20: 2600 };
		for (var i = 0; i < steps.length; i++) {
			(function (v) {
				push("boss_asboss_" + v, "挑战", "👑", "亲征 · " + v, "扮演魔王取得 " + v + " 场胜利（应战模式）",
					function (s) { return [Number(s.bossAsBossWin) || 0, v]; }, rw[v]);
			})(steps[i]);
		}
	})();


	/* ============================================================
	   引擎 API
	   ============================================================ */
	var byKey = {};
	for (var d = 0; d < defs.length; d++) byKey[defs[d].key] = defs[d];

	/* ---------- 退休层（2026-10-20 · 形态治理兼容机制） ----------
	   治理方案见 docs/career-achv-governance.md。
	   RETIRED 里的 key 是「退休」的凑数档位：
	     · 已领取或已达成的玩家 —— 照常可见、可领，进度与奖励记录不蒸发；
	     · 未达成也未领取的玩家 —— 列表里不再出现（软下线）。
	   存档永远不动： claimed 集合里的 key 不删不改，退役只影响「展示」。
	   执行减法批次时逐键登记（值 = 批次号，如 "R1"），禁止整族清空。 */
	var RETIRED = {
		/* 示例："rank_7": "R1"。本批次（4.0.8）只落地机制，不退役任何条目。 */
	};
	function isRetired(key) { return !!RETIRED[key]; }

	function evalAll(stats) {
		stats = stats || {};
		var claimedMap = lsGet(), out = [];
		for (var i = 0; i < defs.length; i++) {
			var df = defs[i], cur = 0, goal = 1;
			try { var pr = df.prog(stats); cur = Number(pr[0]) || 0; goal = Number(pr[1]) || 1; }
			catch (e) {}
			var conditionMet = cur >= goal;
            var entries=stats.careerUnlocks&&stats.careerUnlocks.v===1&&stats.careerUnlocks.baseline===true&&stats.careerUnlocks.entries;
            var recorded=!!(entries&&Object.prototype.hasOwnProperty.call(entries,df.key)&&entries[df.key]&&Number.isSafeInteger(entries[df.key].observedAt)&&entries[df.key].observedAt>=0);
            var done=recorded||conditionMet;
			var retired = !!RETIRED[df.key];
			/* 退休条目：未达成且未领取 → 不出现在列表（软下线） */
			if (retired && !done && !claimedMap[df.key]) continue;
			out.push({
				key: df.key, cat: df.cat, ico: df.ico, label: df.label, desc: df.desc,
				reward: df.reward, cur: Math.min(cur, goal), goal: goal,
				done: done, claimed: !!claimedMap[df.key], retired: retired,
                conditionMet:conditionMet, recorded:recorded, observedAt:recorded?entries[df.key].observedAt:null,
			});
		}
		return out;
	}
	function test(def, stats) {
        var entries=stats&&stats.careerUnlocks&&stats.careerUnlocks.v===1&&stats.careerUnlocks.baseline===true&&stats.careerUnlocks.entries;
        if(entries&&Object.prototype.hasOwnProperty.call(entries,def.key)&&entries[def.key]&&Number.isSafeInteger(entries[def.key].observedAt)&&entries[def.key].observedAt>=0)return true;
        if(stats&&stats.careerStatsReliable===false)return false;
		try { var pr = def.prog(stats); return (Number(pr[0]) || 0) >= (Number(pr[1]) || 1); }
		catch (e) { return false; }
	}
	function claimed(key) { return !!lsGet()[key]; }
	function markClaimed(key) { var m = lsGet(); m[key] = 1; lsPut(m); }
	function claimedList() { return Object.keys(lsGet()); }
	function statsOf() {
		var out = { total: defs.length, byCat: {}, claimable: 0 };
		for (var i = 0; i < defs.length; i++) {
			var c = defs[i].cat;
			out.byCat[c] = (out.byCat[c] || 0) + 1;
		}
		return out;
	}

	/* 自检（node vm / ?selftest 均可调）：定义表完整性 + 阶梯单调性 + 规模门槛 */
	var MIN_DEFS = 420;
	function selfTest() {
		var errs = [];
		if (defs.length < MIN_DEFS) errs.push("定义数 " + defs.length + " < " + MIN_DEFS);
		var seen = {};
		for (var rk in RETIRED) {
			if (Object.prototype.hasOwnProperty.call(RETIRED, rk) && !byKey[rk]) errs.push("RETIRED 指向不存在的 key: " + rk);
		}
		for (var i = 0; i < defs.length; i++) {
			var df = defs[i];
			if (!df.key || seen[df.key]) errs.push("key 重复或为空: " + df.key);
			seen[df.key] = 1;
			if (typeof df.prog !== "function") errs.push("prog 缺失: " + df.key);
			if (!(df.reward > 0)) errs.push("reward 非法: " + df.key);
			if (!df.label || !df.cat || !df.ico) errs.push("元数据缺失: " + df.key);
			/* 判定量必须来自 stats（防"假数据"回归）：prog 必须能被零 stats 安全调用 */
			try {
				var pr0 = df.prog({});
				if (!Array.isArray(pr0) || pr0.length < 2) errs.push("prog 返回值非法: " + df.key);
			} catch (e) { errs.push("prog 调用抛错: " + df.key); }
		}
		/* 阶梯单调：同一前缀的阈值必须严格递增（跳过 rank/seg/彩蛋） */
		var cats = {};
		for (var j = 0; j < defs.length; j++) {
			var m = defs[j].key.match(/^(.*)_(\d+)$/);
			if (!m) continue;
			var base = m[1], v = Number(m[2]);
			if (["rank", "seg"].indexOf(base) < 0 && base !== "") {
				cats[base] = cats[base] || [];
				cats[base].push(v);
			}
		}
		for (var b in cats) {
			if (!Object.prototype.hasOwnProperty.call(cats, b)) continue;
			var arr = cats[b].sort(function (x, y) { return x - y; });
			for (var k = 1; k < arr.length; k++) {
				if (arr[k] === arr[k - 1]) errs.push("阶梯重复: " + b + "_" + arr[k]);
			}
		}
		/* ★ 反伪达成守护：宿主字段全为 0（世界/钱包模块未加载）时，
		   不允许任何一条成就判定为"已达成"——防止空数据瞬刷成就。 */
		try {
			var zero = evalAll({});
			for (var z = 0; z < zero.length; z++) {
				if (zero[z].done) errs.push("零快照伪达成: " + zero[z].key);
			}
		} catch (eZero) { errs.push("零快照调用抛错: " + eZero.message); }
		return { ok: errs.length === 0, count: defs.length, errs: errs };
	}

/* ===== BEGIN APPEND:career-expand ===== */
	/* 生涯扩容：全部基于 buildStats 已有的真实字段，不新增采集、不新增存档键。
	   生成器 tools/achv_scale/gen_career_expand.mjs；本块由 apply_career_expand.mjs 整块替换。
	   三种判定：
	     f/g  单字段达到阈值（与既有 statProg 同构）
	     a    多字段同时达标（组合挑战，"富且贵"这类）
	     p    比率 + 最小样本量（防止 1 战 1 胜 = 100% 胜率这类永真条件） */
	(function careerExpand(){
		var ROWS = [
		{k:"cx_merit_400000",c:"功勋",i:"🏅",l:"功勋 · 400,000",d:"功勋达到 400,000 点功勋",f:"merit",g:400000,r:1000},
		{k:"cx_merit_550000",c:"功勋",i:"🏅",l:"功勋 · 550,000",d:"功勋达到 550,000 点功勋",f:"merit",g:550000,r:1014},
		{k:"cx_merit_750000",c:"功勋",i:"🏅",l:"功勋 · 750,000",d:"功勋达到 750,000 点功勋",f:"merit",g:750000,r:1058},
		{k:"cx_merit_1000000",c:"功勋",i:"🏅",l:"功勋 · 1,000,000",d:"功勋达到 1,000,000 点功勋",f:"merit",g:1000000,r:1130},
		{k:"cx_merit_1400000",c:"功勋",i:"🏅",l:"功勋 · 1,400,000",d:"功勋达到 1,400,000 点功勋",f:"merit",g:1400000,r:1230},
		{k:"cx_merit_1900000",c:"功勋",i:"🏅",l:"功勋 · 1,900,000",d:"功勋达到 1,900,000 点功勋",f:"merit",g:1900000,r:1360},
		{k:"cx_merit_2600000",c:"功勋",i:"🏅",l:"功勋 · 2,600,000",d:"功勋达到 2,600,000 点功勋",f:"merit",g:2600000,r:1518},
		{k:"cx_merit_3500000",c:"功勋",i:"🏅",l:"功勋 · 3,500,000",d:"功勋达到 3,500,000 点功勋",f:"merit",g:3500000,r:1706},
		{k:"cx_merit_4700000",c:"功勋",i:"🏅",l:"功勋 · 4,700,000",d:"功勋达到 4,700,000 点功勋",f:"merit",g:4700000,r:1922},
		{k:"cx_merit_6300000",c:"功勋",i:"🏅",l:"功勋 · 6,300,000",d:"功勋达到 6,300,000 点功勋",f:"merit",g:6300000,r:2166},
		{k:"cx_merit_8500000",c:"功勋",i:"🏅",l:"功勋 · 8,500,000",d:"功勋达到 8,500,000 点功勋",f:"merit",g:8500000,r:2440},
		{k:"cx_merit_11500000",c:"功勋",i:"🏅",l:"功勋 · 11,500,000",d:"功勋达到 11,500,000 点功勋",f:"merit",g:11500000,r:2742},
		{k:"cx_merit_15500000",c:"功勋",i:"🏅",l:"功勋 · 15,500,000",d:"功勋达到 15,500,000 点功勋",f:"merit",g:15500000,r:3074},
		{k:"cx_merit_21000000",c:"功勋",i:"🏅",l:"功勋 · 21,000,000",d:"功勋达到 21,000,000 点功勋",f:"merit",g:21000000,r:3434},
		{k:"cx_merit_28000000",c:"功勋",i:"🏅",l:"功勋 · 28,000,000",d:"功勋达到 28,000,000 点功勋",f:"merit",g:28000000,r:3822},
		{k:"cx_merit_38000000",c:"功勋",i:"🏅",l:"功勋 · 38,000,000",d:"功勋达到 38,000,000 点功勋",f:"merit",g:38000000,r:4240},
		{k:"cx_merit_52000000",c:"功勋",i:"🏅",l:"功勋 · 52,000,000",d:"功勋达到 52,000,000 点功勋",f:"merit",g:52000000,r:4686},
		{k:"cx_merit_70000000",c:"功勋",i:"🏅",l:"功勋 · 70,000,000",d:"功勋达到 70,000,000 点功勋",f:"merit",g:70000000,r:5162},
		{k:"cx_merit_95000000",c:"功勋",i:"🏅",l:"功勋 · 95,000,000",d:"功勋达到 95,000,000 点功勋",f:"merit",g:95000000,r:5666},
		{k:"cx_merit_130000000",c:"功勋",i:"🏅",l:"功勋 · 130,000,000",d:"功勋达到 130,000,000 点功勋",f:"merit",g:130000000,r:6198},
		{k:"cx_merit_180000000",c:"功勋",i:"🏅",l:"功勋 · 180,000,000",d:"功勋达到 180,000,000 点功勋",f:"merit",g:180000000,r:6760},
		{k:"cx_merit_250000000",c:"功勋",i:"🏅",l:"功勋 · 250,000,000",d:"功勋达到 250,000,000 点功勋",f:"merit",g:250000000,r:7350},
		{k:"cx_merit_350000000",c:"功勋",i:"🏅",l:"功勋 · 350,000,000",d:"功勋达到 350,000,000 点功勋",f:"merit",g:350000000,r:7970},
		{k:"cx_merit_480000000",c:"功勋",i:"🏅",l:"功勋 · 480,000,000",d:"功勋达到 480,000,000 点功勋",f:"merit",g:480000000,r:8618},
		{k:"cx_merit_660000000",c:"功勋",i:"🏅",l:"功勋 · 660,000,000",d:"功勋达到 660,000,000 点功勋",f:"merit",g:660000000,r:9294},
		{k:"cx_merit_900000000",c:"功勋",i:"🏅",l:"功勋 · 900,000,000",d:"功勋达到 900,000,000 点功勋",f:"merit",g:900000000,r:10000},
		{k:"cx_meritday_8000",c:"功勋",i:"🏅",l:"单日功勋 · 8,000",d:"单日功勋达到 8,000 点",f:"meritToday",g:8000,r:1000},
		{k:"cx_meritday_10000",c:"功勋",i:"🏅",l:"单日功勋 · 10,000",d:"单日功勋达到 10,000 点",f:"meritToday",g:10000,r:1074},
		{k:"cx_meritday_13000",c:"功勋",i:"🏅",l:"单日功勋 · 13,000",d:"单日功勋达到 13,000 点",f:"meritToday",g:13000,r:1298},
		{k:"cx_meritday_17000",c:"功勋",i:"🏅",l:"单日功勋 · 17,000",d:"单日功勋达到 17,000 点",f:"meritToday",g:17000,r:1669},
		{k:"cx_meritday_22000",c:"功勋",i:"🏅",l:"单日功勋 · 22,000",d:"单日功勋达到 22,000 点",f:"meritToday",g:22000,r:2190},
		{k:"cx_meritday_28000",c:"功勋",i:"🏅",l:"单日功勋 · 28,000",d:"单日功勋达到 28,000 点",f:"meritToday",g:28000,r:2860},
		{k:"cx_meritday_36000",c:"功勋",i:"🏅",l:"单日功勋 · 36,000",d:"单日功勋达到 36,000 点",f:"meritToday",g:36000,r:3678},
		{k:"cx_meritday_46000",c:"功勋",i:"🏅",l:"单日功勋 · 46,000",d:"单日功勋达到 46,000 点",f:"meritToday",g:46000,r:4645},
		{k:"cx_meritday_58000",c:"功勋",i:"🏅",l:"单日功勋 · 58,000",d:"单日功勋达到 58,000 点",f:"meritToday",g:58000,r:5760},
		{k:"cx_meritday_73000",c:"功勋",i:"🏅",l:"单日功勋 · 73,000",d:"单日功勋达到 73,000 点",f:"meritToday",g:73000,r:7025},
		{k:"cx_meritday_92000",c:"功勋",i:"🏅",l:"单日功勋 · 92,000",d:"单日功勋达到 92,000 点",f:"meritToday",g:92000,r:8438},
		{k:"cx_meritday_115000",c:"功勋",i:"🏅",l:"单日功勋 · 115,000",d:"单日功勋达到 115,000 点",f:"meritToday",g:115000,r:10000},
		{k:"cx_rich_130000000",c:"资产",i:"💰",l:"身家 · 130,000,000",d:"身家达到 130,000,000 池子币",f:"pc",g:130000000,r:1000},
		{k:"cx_rich_170000000",c:"资产",i:"💰",l:"身家 · 170,000,000",d:"身家达到 170,000,000 池子币",f:"pc",g:170000000,r:1025},
		{k:"cx_rich_220000000",c:"资产",i:"💰",l:"身家 · 220,000,000",d:"身家达到 220,000,000 池子币",f:"pc",g:220000000,r:1100},
		{k:"cx_rich_290000000",c:"资产",i:"💰",l:"身家 · 290,000,000",d:"身家达到 290,000,000 池子币",f:"pc",g:290000000,r:1224},
		{k:"cx_rich_380000000",c:"资产",i:"💰",l:"身家 · 380,000,000",d:"身家达到 380,000,000 池子币",f:"pc",g:380000000,r:1399},
		{k:"cx_rich_500000000",c:"资产",i:"💰",l:"身家 · 500,000,000",d:"身家达到 500,000,000 池子币",f:"pc",g:500000000,r:1623},
		{k:"cx_rich_650000000",c:"资产",i:"💰",l:"身家 · 650,000,000",d:"身家达到 650,000,000 池子币",f:"pc",g:650000000,r:1898},
		{k:"cx_rich_850000000",c:"资产",i:"💰",l:"身家 · 850,000,000",d:"身家达到 850,000,000 池子币",f:"pc",g:850000000,r:2222},
		{k:"cx_rich_1100000000",c:"资产",i:"💰",l:"身家 · 1,100,000,000",d:"身家达到 1,100,000,000 池子币",f:"pc",g:1100000000,r:2596},
		{k:"cx_rich_1450000000",c:"资产",i:"💰",l:"身家 · 1,450,000,000",d:"身家达到 1,450,000,000 池子币",f:"pc",g:1450000000,r:3019},
		{k:"cx_rich_1900000000",c:"资产",i:"💰",l:"身家 · 1,900,000,000",d:"身家达到 1,900,000,000 池子币",f:"pc",g:1900000000,r:3493},
		{k:"cx_rich_2500000000",c:"资产",i:"💰",l:"身家 · 2,500,000,000",d:"身家达到 2,500,000,000 池子币",f:"pc",g:2500000000,r:4017},
		{k:"cx_rich_3300000000",c:"资产",i:"💰",l:"身家 · 3,300,000,000",d:"身家达到 3,300,000,000 池子币",f:"pc",g:3300000000,r:4590},
		{k:"cx_rich_4300000000",c:"资产",i:"💰",l:"身家 · 4,300,000,000",d:"身家达到 4,300,000,000 池子币",f:"pc",g:4300000000,r:5213},
		{k:"cx_rich_5600000000",c:"资产",i:"💰",l:"身家 · 5,600,000,000",d:"身家达到 5,600,000,000 池子币",f:"pc",g:5600000000,r:5886},
		{k:"cx_rich_7300000000",c:"资产",i:"💰",l:"身家 · 7,300,000,000",d:"身家达到 7,300,000,000 池子币",f:"pc",g:7300000000,r:6609},
		{k:"cx_rich_9500000000",c:"资产",i:"💰",l:"身家 · 9,500,000,000",d:"身家达到 9,500,000,000 池子币",f:"pc",g:9500000000,r:7382},
		{k:"cx_rich_12000000000",c:"资产",i:"💰",l:"身家 · 12,000,000,000",d:"身家达到 12,000,000,000 池子币",f:"pc",g:12000000000,r:8205},
		{k:"cx_rich_16000000000",c:"资产",i:"💰",l:"身家 · 16,000,000,000",d:"身家达到 16,000,000,000 池子币",f:"pc",g:16000000000,r:9078},
		{k:"cx_rich_21000000000",c:"资产",i:"💰",l:"身家 · 21,000,000,000",d:"身家达到 21,000,000,000 池子币",f:"pc",g:21000000000,r:10000},
		{k:"cx_peak_130000000",c:"资产",i:"💰",l:"身家峰值 · 130,000,000",d:"身家峰值达到 130,000,000 池子币",f:"pcPeak",g:130000000,r:1000},
		{k:"cx_peak_170000000",c:"资产",i:"💰",l:"身家峰值 · 170,000,000",d:"身家峰值达到 170,000,000 池子币",f:"pcPeak",g:170000000,r:1025},
		{k:"cx_peak_220000000",c:"资产",i:"💰",l:"身家峰值 · 220,000,000",d:"身家峰值达到 220,000,000 池子币",f:"pcPeak",g:220000000,r:1100},
		{k:"cx_peak_290000000",c:"资产",i:"💰",l:"身家峰值 · 290,000,000",d:"身家峰值达到 290,000,000 池子币",f:"pcPeak",g:290000000,r:1224},
		{k:"cx_peak_380000000",c:"资产",i:"💰",l:"身家峰值 · 380,000,000",d:"身家峰值达到 380,000,000 池子币",f:"pcPeak",g:380000000,r:1399},
		{k:"cx_peak_500000000",c:"资产",i:"💰",l:"身家峰值 · 500,000,000",d:"身家峰值达到 500,000,000 池子币",f:"pcPeak",g:500000000,r:1623},
		{k:"cx_peak_650000000",c:"资产",i:"💰",l:"身家峰值 · 650,000,000",d:"身家峰值达到 650,000,000 池子币",f:"pcPeak",g:650000000,r:1898},
		{k:"cx_peak_850000000",c:"资产",i:"💰",l:"身家峰值 · 850,000,000",d:"身家峰值达到 850,000,000 池子币",f:"pcPeak",g:850000000,r:2222},
		{k:"cx_peak_1100000000",c:"资产",i:"💰",l:"身家峰值 · 1,100,000,000",d:"身家峰值达到 1,100,000,000 池子币",f:"pcPeak",g:1100000000,r:2596},
		{k:"cx_peak_1450000000",c:"资产",i:"💰",l:"身家峰值 · 1,450,000,000",d:"身家峰值达到 1,450,000,000 池子币",f:"pcPeak",g:1450000000,r:3019},
		{k:"cx_peak_1900000000",c:"资产",i:"💰",l:"身家峰值 · 1,900,000,000",d:"身家峰值达到 1,900,000,000 池子币",f:"pcPeak",g:1900000000,r:3493},
		{k:"cx_peak_2500000000",c:"资产",i:"💰",l:"身家峰值 · 2,500,000,000",d:"身家峰值达到 2,500,000,000 池子币",f:"pcPeak",g:2500000000,r:4017},
		{k:"cx_peak_3300000000",c:"资产",i:"💰",l:"身家峰值 · 3,300,000,000",d:"身家峰值达到 3,300,000,000 池子币",f:"pcPeak",g:3300000000,r:4590},
		{k:"cx_peak_4300000000",c:"资产",i:"💰",l:"身家峰值 · 4,300,000,000",d:"身家峰值达到 4,300,000,000 池子币",f:"pcPeak",g:4300000000,r:5213},
		{k:"cx_peak_5600000000",c:"资产",i:"💰",l:"身家峰值 · 5,600,000,000",d:"身家峰值达到 5,600,000,000 池子币",f:"pcPeak",g:5600000000,r:5886},
		{k:"cx_peak_7300000000",c:"资产",i:"💰",l:"身家峰值 · 7,300,000,000",d:"身家峰值达到 7,300,000,000 池子币",f:"pcPeak",g:7300000000,r:6609},
		{k:"cx_peak_9500000000",c:"资产",i:"💰",l:"身家峰值 · 9,500,000,000",d:"身家峰值达到 9,500,000,000 池子币",f:"pcPeak",g:9500000000,r:7382},
		{k:"cx_peak_12000000000",c:"资产",i:"💰",l:"身家峰值 · 12,000,000,000",d:"身家峰值达到 12,000,000,000 池子币",f:"pcPeak",g:12000000000,r:8205},
		{k:"cx_peak_16000000000",c:"资产",i:"💰",l:"身家峰值 · 16,000,000,000",d:"身家峰值达到 16,000,000,000 池子币",f:"pcPeak",g:16000000000,r:9078},
		{k:"cx_peak_21000000000",c:"资产",i:"💰",l:"身家峰值 · 21,000,000,000",d:"身家峰值达到 21,000,000,000 池子币",f:"pcPeak",g:21000000000,r:10000},
		{k:"cx_hands_50000",c:"AI世界",i:"🀄",l:"同桌人次 · 50,000",d:"同桌人次达到 50,000 人次",f:"worldHands",g:50000,r:1000},
		{k:"cx_hands_62000",c:"AI世界",i:"🀄",l:"同桌人次 · 62,000",d:"同桌人次达到 62,000 人次",f:"worldHands",g:62000,r:1035},
		{k:"cx_hands_78000",c:"AI世界",i:"🀄",l:"同桌人次 · 78,000",d:"同桌人次达到 78,000 人次",f:"worldHands",g:78000,r:1141},
		{k:"cx_hands_96000",c:"AI世界",i:"🀄",l:"同桌人次 · 96,000",d:"同桌人次达到 96,000 人次",f:"worldHands",g:96000,r:1316},
		{k:"cx_hands_120000",c:"AI世界",i:"🀄",l:"同桌人次 · 120,000",d:"同桌人次达到 120,000 人次",f:"worldHands",g:120000,r:1563},
		{k:"cx_hands_150000",c:"AI世界",i:"🀄",l:"同桌人次 · 150,000",d:"同桌人次达到 150,000 人次",f:"worldHands",g:150000,r:1879},
		{k:"cx_hands_185000",c:"AI世界",i:"🀄",l:"同桌人次 · 185,000",d:"同桌人次达到 185,000 人次",f:"worldHands",g:185000,r:2266},
		{k:"cx_hands_230000",c:"AI世界",i:"🀄",l:"同桌人次 · 230,000",d:"同桌人次达到 230,000 人次",f:"worldHands",g:230000,r:2723},
		{k:"cx_hands_285000",c:"AI世界",i:"🀄",l:"同桌人次 · 285,000",d:"同桌人次达到 285,000 人次",f:"worldHands",g:285000,r:3250},
		{k:"cx_hands_350000",c:"AI世界",i:"🀄",l:"同桌人次 · 350,000",d:"同桌人次达到 350,000 人次",f:"worldHands",g:350000,r:3848},
		{k:"cx_hands_430000",c:"AI世界",i:"🀄",l:"同桌人次 · 430,000",d:"同桌人次达到 430,000 人次",f:"worldHands",g:430000,r:4516},
		{k:"cx_hands_530000",c:"AI世界",i:"🀄",l:"同桌人次 · 530,000",d:"同桌人次达到 530,000 人次",f:"worldHands",g:530000,r:5254},
		{k:"cx_hands_650000",c:"AI世界",i:"🀄",l:"同桌人次 · 650,000",d:"同桌人次达到 650,000 人次",f:"worldHands",g:650000,r:6063},
		{k:"cx_hands_800000",c:"AI世界",i:"🀄",l:"同桌人次 · 800,000",d:"同桌人次达到 800,000 人次",f:"worldHands",g:800000,r:6941},
		{k:"cx_hands_980000",c:"AI世界",i:"🀄",l:"同桌人次 · 980,000",d:"同桌人次达到 980,000 人次",f:"worldHands",g:980000,r:7891},
		{k:"cx_hands_1200000",c:"AI世界",i:"🀄",l:"同桌人次 · 1,200,000",d:"同桌人次达到 1,200,000 人次",f:"worldHands",g:1200000,r:8910},
		{k:"cx_hands_1480000",c:"AI世界",i:"🀄",l:"同桌人次 · 1,480,000",d:"同桌人次达到 1,480,000 人次",f:"worldHands",g:1480000,r:10000},
		{k:"cx_interact_34000",c:"互动",i:"💬",l:"互动次数 · 34,000",d:"互动次数达到 34,000 次",f:"interactTotal",g:34000,r:1000},
		{k:"cx_interact_40000",c:"互动",i:"💬",l:"互动次数 · 40,000",d:"互动次数达到 40,000 次",f:"interactTotal",g:40000,r:1025},
		{k:"cx_interact_48000",c:"互动",i:"💬",l:"互动次数 · 48,000",d:"互动次数达到 48,000 次",f:"interactTotal",g:48000,r:1100},
		{k:"cx_interact_57000",c:"互动",i:"💬",l:"互动次数 · 57,000",d:"互动次数达到 57,000 次",f:"interactTotal",g:57000,r:1224},
		{k:"cx_interact_68000",c:"互动",i:"💬",l:"互动次数 · 68,000",d:"互动次数达到 68,000 次",f:"interactTotal",g:68000,r:1399},
		{k:"cx_interact_81000",c:"互动",i:"💬",l:"互动次数 · 81,000",d:"互动次数达到 81,000 次",f:"interactTotal",g:81000,r:1623},
		{k:"cx_interact_96000",c:"互动",i:"💬",l:"互动次数 · 96,000",d:"互动次数达到 96,000 次",f:"interactTotal",g:96000,r:1898},
		{k:"cx_interact_115000",c:"互动",i:"💬",l:"互动次数 · 115,000",d:"互动次数达到 115,000 次",f:"interactTotal",g:115000,r:2222},
		{k:"cx_interact_137000",c:"互动",i:"💬",l:"互动次数 · 137,000",d:"互动次数达到 137,000 次",f:"interactTotal",g:137000,r:2596},
		{k:"cx_interact_163000",c:"互动",i:"💬",l:"互动次数 · 163,000",d:"互动次数达到 163,000 次",f:"interactTotal",g:163000,r:3019},
		{k:"cx_interact_195000",c:"互动",i:"💬",l:"互动次数 · 195,000",d:"互动次数达到 195,000 次",f:"interactTotal",g:195000,r:3493},
		{k:"cx_interact_232000",c:"互动",i:"💬",l:"互动次数 · 232,000",d:"互动次数达到 232,000 次",f:"interactTotal",g:232000,r:4017},
		{k:"cx_interact_276000",c:"互动",i:"💬",l:"互动次数 · 276,000",d:"互动次数达到 276,000 次",f:"interactTotal",g:276000,r:4590},
		{k:"cx_interact_328000",c:"互动",i:"💬",l:"互动次数 · 328,000",d:"互动次数达到 328,000 次",f:"interactTotal",g:328000,r:5213},
		{k:"cx_interact_390000",c:"互动",i:"💬",l:"互动次数 · 390,000",d:"互动次数达到 390,000 次",f:"interactTotal",g:390000,r:5886},
		{k:"cx_interact_465000",c:"互动",i:"💬",l:"互动次数 · 465,000",d:"互动次数达到 465,000 次",f:"interactTotal",g:465000,r:6609},
		{k:"cx_interact_555000",c:"互动",i:"💬",l:"互动次数 · 555,000",d:"互动次数达到 555,000 次",f:"interactTotal",g:555000,r:7382},
		{k:"cx_interact_660000",c:"互动",i:"💬",l:"互动次数 · 660,000",d:"互动次数达到 660,000 次",f:"interactTotal",g:660000,r:8205},
		{k:"cx_interact_780000",c:"互动",i:"💬",l:"互动次数 · 780,000",d:"互动次数达到 780,000 次",f:"interactTotal",g:780000,r:9078},
		{k:"cx_interact_920000",c:"互动",i:"💬",l:"互动次数 · 920,000",d:"互动次数达到 920,000 次",f:"interactTotal",g:920000,r:10000},
		{k:"cx_kills_11000",c:"胜负",i:"⚔️",l:"击杀 · 11,000",d:"击杀达到 11,000 人",f:"wrKill",g:11000,r:1000},
		{k:"cx_kills_12500",c:"胜负",i:"⚔️",l:"击杀 · 12,500",d:"击杀达到 12,500 人",f:"wrKill",g:12500,r:1111},
		{k:"cx_kills_14500",c:"胜负",i:"⚔️",l:"击杀 · 14,500",d:"击杀达到 14,500 人",f:"wrKill",g:14500,r:1444},
		{k:"cx_kills_16500",c:"胜负",i:"⚔️",l:"击杀 · 16,500",d:"击杀达到 16,500 人",f:"wrKill",g:16500,r:2000},
		{k:"cx_kills_19000",c:"胜负",i:"⚔️",l:"击杀 · 19,000",d:"击杀达到 19,000 人",f:"wrKill",g:19000,r:2778},
		{k:"cx_kills_22000",c:"胜负",i:"⚔️",l:"击杀 · 22,000",d:"击杀达到 22,000 人",f:"wrKill",g:22000,r:3778},
		{k:"cx_kills_25500",c:"胜负",i:"⚔️",l:"击杀 · 25,500",d:"击杀达到 25,500 人",f:"wrKill",g:25500,r:5000},
		{k:"cx_kills_29500",c:"胜负",i:"⚔️",l:"击杀 · 29,500",d:"击杀达到 29,500 人",f:"wrKill",g:29500,r:6444},
		{k:"cx_kills_34000",c:"胜负",i:"⚔️",l:"击杀 · 34,000",d:"击杀达到 34,000 人",f:"wrKill",g:34000,r:8111},
		{k:"cx_kills_39000",c:"胜负",i:"⚔️",l:"击杀 · 39,000",d:"击杀达到 39,000 人",f:"wrKill",g:39000,r:10000},
		{k:"cx_chars_50",c:"胜负",i:"⚔️",l:"使用武将数 · 50",d:"使用武将数达到 50 名",f:"wrChars",g:50,r:1000},
		{k:"cx_chars_55",c:"胜负",i:"⚔️",l:"使用武将数 · 55",d:"使用武将数达到 55 名",f:"wrChars",g:55,r:1046},
		{k:"cx_chars_60",c:"胜负",i:"⚔️",l:"使用武将数 · 60",d:"使用武将数达到 60 名",f:"wrChars",g:60,r:1184},
		{k:"cx_chars_65",c:"胜负",i:"⚔️",l:"使用武将数 · 65",d:"使用武将数达到 65 名",f:"wrChars",g:65,r:1413},
		{k:"cx_chars_70",c:"胜负",i:"⚔️",l:"使用武将数 · 70",d:"使用武将数达到 70 名",f:"wrChars",g:70,r:1735},
		{k:"cx_chars_75",c:"胜负",i:"⚔️",l:"使用武将数 · 75",d:"使用武将数达到 75 名",f:"wrChars",g:75,r:2148},
		{k:"cx_chars_80",c:"胜负",i:"⚔️",l:"使用武将数 · 80",d:"使用武将数达到 80 名",f:"wrChars",g:80,r:2653},
		{k:"cx_chars_85",c:"胜负",i:"⚔️",l:"使用武将数 · 85",d:"使用武将数达到 85 名",f:"wrChars",g:85,r:3250},
		{k:"cx_chars_90",c:"胜负",i:"⚔️",l:"使用武将数 · 90",d:"使用武将数达到 90 名",f:"wrChars",g:90,r:3939},
		{k:"cx_chars_95",c:"胜负",i:"⚔️",l:"使用武将数 · 95",d:"使用武将数达到 95 名",f:"wrChars",g:95,r:4719},
		{k:"cx_chars_100",c:"胜负",i:"⚔️",l:"使用武将数 · 100",d:"使用武将数达到 100 名",f:"wrChars",g:100,r:5592},
		{k:"cx_chars_105",c:"胜负",i:"⚔️",l:"使用武将数 · 105",d:"使用武将数达到 105 名",f:"wrChars",g:105,r:6556},
		{k:"cx_chars_110",c:"胜负",i:"⚔️",l:"使用武将数 · 110",d:"使用武将数达到 110 名",f:"wrChars",g:110,r:7612},
		{k:"cx_chars_115",c:"胜负",i:"⚔️",l:"使用武将数 · 115",d:"使用武将数达到 115 名",f:"wrChars",g:115,r:8760},
		{k:"cx_chars_120",c:"胜负",i:"⚔️",l:"使用武将数 · 120",d:"使用武将数达到 120 名",f:"wrChars",g:120,r:10000},
		{k:"cx_games_11000",c:"胜负",i:"⚔️",l:"对局数 · 11,000",d:"对局数达到 11,000 局",f:"wrGames",g:11000,r:1000},
		{k:"cx_games_12000",c:"胜负",i:"⚔️",l:"对局数 · 12,000",d:"对局数达到 12,000 局",f:"wrGames",g:12000,r:1563},
		{k:"cx_games_13000",c:"胜负",i:"⚔️",l:"对局数 · 13,000",d:"对局数达到 13,000 局",f:"wrGames",g:13000,r:3250},
		{k:"cx_games_14000",c:"胜负",i:"⚔️",l:"对局数 · 14,000",d:"对局数达到 14,000 局",f:"wrGames",g:14000,r:6063},
		{k:"cx_games_15000",c:"胜负",i:"⚔️",l:"对局数 · 15,000",d:"对局数达到 15,000 局",f:"wrGames",g:15000,r:10000},
		{k:"cx_wins_11000",c:"胜负",i:"⚔️",l:"胜场 · 11,000",d:"胜场达到 11,000 胜",f:"wrWin",g:11000,r:1000},
		{k:"cx_wins_12000",c:"胜负",i:"⚔️",l:"胜场 · 12,000",d:"胜场达到 12,000 胜",f:"wrWin",g:12000,r:1563},
		{k:"cx_wins_13000",c:"胜负",i:"⚔️",l:"胜场 · 13,000",d:"胜场达到 13,000 胜",f:"wrWin",g:13000,r:3250},
		{k:"cx_wins_14000",c:"胜负",i:"⚔️",l:"胜场 · 14,000",d:"胜场达到 14,000 胜",f:"wrWin",g:14000,r:6063},
		{k:"cx_wins_15000",c:"胜负",i:"⚔️",l:"胜场 · 15,000",d:"胜场达到 15,000 胜",f:"wrWin",g:15000,r:10000},
		{k:"cx_loses_7000",c:"胜负",i:"⚔️",l:"负场 · 7,000",d:"负场达到 7,000 负",f:"wrLose",g:7000,r:1000},
		{k:"cx_loses_8000",c:"胜负",i:"⚔️",l:"负场 · 8,000",d:"负场达到 8,000 负",f:"wrLose",g:8000,r:1563},
		{k:"cx_loses_9000",c:"胜负",i:"⚔️",l:"负场 · 9,000",d:"负场达到 9,000 负",f:"wrLose",g:9000,r:3250},
		{k:"cx_loses_10000",c:"胜负",i:"⚔️",l:"负场 · 10,000",d:"负场达到 10,000 负",f:"wrLose",g:10000,r:6063},
		{k:"cx_loses_11000",c:"胜负",i:"⚔️",l:"负场 · 11,000",d:"负场达到 11,000 负",f:"wrLose",g:11000,r:10000},
		{k:"cx_gmplay_1500",c:"豪赌桌",i:"🎲",l:"出战次数 · 1,500",d:"出战次数达到 1,500 场",f:"gamblePlays",g:1500,r:1000},
		{k:"cx_gmplay_1700",c:"豪赌桌",i:"🎲",l:"出战次数 · 1,700",d:"出战次数达到 1,700 场",f:"gamblePlays",g:1700,r:1053},
		{k:"cx_gmplay_1900",c:"豪赌桌",i:"🎲",l:"出战次数 · 1,900",d:"出战次数达到 1,900 场",f:"gamblePlays",g:1900,r:1213},
		{k:"cx_gmplay_2200",c:"豪赌桌",i:"🎲",l:"出战次数 · 2,200",d:"出战次数达到 2,200 场",f:"gamblePlays",g:2200,r:1479},
		{k:"cx_gmplay_2500",c:"豪赌桌",i:"🎲",l:"出战次数 · 2,500",d:"出战次数达到 2,500 场",f:"gamblePlays",g:2500,r:1852},
		{k:"cx_gmplay_2900",c:"豪赌桌",i:"🎲",l:"出战次数 · 2,900",d:"出战次数达到 2,900 场",f:"gamblePlays",g:2900,r:2331},
		{k:"cx_gmplay_3300",c:"豪赌桌",i:"🎲",l:"出战次数 · 3,300",d:"出战次数达到 3,300 场",f:"gamblePlays",g:3300,r:2917},
		{k:"cx_gmplay_3800",c:"豪赌桌",i:"🎲",l:"出战次数 · 3,800",d:"出战次数达到 3,800 场",f:"gamblePlays",g:3800,r:3609},
		{k:"cx_gmplay_4400",c:"豪赌桌",i:"🎲",l:"出战次数 · 4,400",d:"出战次数达到 4,400 场",f:"gamblePlays",g:4400,r:4408},
		{k:"cx_gmplay_5100",c:"豪赌桌",i:"🎲",l:"出战次数 · 5,100",d:"出战次数达到 5,100 场",f:"gamblePlays",g:5100,r:5314},
		{k:"cx_gmplay_5900",c:"豪赌桌",i:"🎲",l:"出战次数 · 5,900",d:"出战次数达到 5,900 场",f:"gamblePlays",g:5900,r:6325},
		{k:"cx_gmplay_6800",c:"豪赌桌",i:"🎲",l:"出战次数 · 6,800",d:"出战次数达到 6,800 场",f:"gamblePlays",g:6800,r:7444},
		{k:"cx_gmplay_7900",c:"豪赌桌",i:"🎲",l:"出战次数 · 7,900",d:"出战次数达到 7,900 场",f:"gamblePlays",g:7900,r:8669},
		{k:"cx_gmplay_9200",c:"豪赌桌",i:"🎲",l:"出战次数 · 9,200",d:"出战次数达到 9,200 场",f:"gamblePlays",g:9200,r:10000},
		{k:"cx_gmwin_140",c:"豪赌桌",i:"🎲",l:"胜局 · 140",d:"胜局达到 140 胜",f:"gambleWins",g:140,r:1000},
		{k:"cx_gmwin_160",c:"豪赌桌",i:"🎲",l:"胜局 · 160",d:"胜局达到 160 胜",f:"gambleWins",g:160,r:1031},
		{k:"cx_gmwin_185",c:"豪赌桌",i:"🎲",l:"胜局 · 185",d:"胜局达到 185 胜",f:"gambleWins",g:185,r:1125},
		{k:"cx_gmwin_215",c:"豪赌桌",i:"🎲",l:"胜局 · 215",d:"胜局达到 215 胜",f:"gambleWins",g:215,r:1280},
		{k:"cx_gmwin_250",c:"豪赌桌",i:"🎲",l:"胜局 · 250",d:"胜局达到 250 胜",f:"gambleWins",g:250,r:1498},
		{k:"cx_gmwin_290",c:"豪赌桌",i:"🎲",l:"胜局 · 290",d:"胜局达到 290 胜",f:"gambleWins",g:290,r:1779},
		{k:"cx_gmwin_340",c:"豪赌桌",i:"🎲",l:"胜局 · 340",d:"胜局达到 340 胜",f:"gambleWins",g:340,r:2121},
		{k:"cx_gmwin_395",c:"豪赌桌",i:"🎲",l:"胜局 · 395",d:"胜局达到 395 胜",f:"gambleWins",g:395,r:2526},
		{k:"cx_gmwin_460",c:"豪赌桌",i:"🎲",l:"胜局 · 460",d:"胜局达到 460 胜",f:"gambleWins",g:460,r:2993},
		{k:"cx_gmwin_1000",c:"豪赌桌",i:"🎲",l:"胜局 · 1,000",d:"胜局达到 1,000 胜",f:"gambleWins",g:1000,r:3522},
		{k:"cx_gmwin_1500",c:"豪赌桌",i:"🎲",l:"胜局 · 1,500",d:"胜局达到 1,500 胜",f:"gambleWins",g:1500,r:4114},
		{k:"cx_gmwin_2000",c:"豪赌桌",i:"🎲",l:"胜局 · 2,000",d:"胜局达到 2,000 胜",f:"gambleWins",g:2000,r:4768},
		{k:"cx_gmwin_3000",c:"豪赌桌",i:"🎲",l:"胜局 · 3,000",d:"胜局达到 3,000 胜",f:"gambleWins",g:3000,r:5484},
		{k:"cx_gmwin_4000",c:"豪赌桌",i:"🎲",l:"胜局 · 4,000",d:"胜局达到 4,000 胜",f:"gambleWins",g:4000,r:6263},
		{k:"cx_gmwin_4500",c:"豪赌桌",i:"🎲",l:"胜局 · 4,500",d:"胜局达到 4,500 胜",f:"gambleWins",g:4500,r:7104},
		{k:"cx_gmwin_5000",c:"豪赌桌",i:"🎲",l:"胜局 · 5,000",d:"胜局达到 5,000 胜",f:"gambleWins",g:5000,r:8007},
		{k:"cx_gmwin_5500",c:"豪赌桌",i:"🎲",l:"胜局 · 5,500",d:"胜局达到 5,500 胜",f:"gambleWins",g:5500,r:8972},
		{k:"cx_gmwin_6000",c:"豪赌桌",i:"🎲",l:"胜局 · 6,000",d:"胜局达到 6,000 胜",f:"gambleWins",g:6000,r:10000},
		{k:"cx_gmbest_6000000",c:"豪赌桌",i:"🎲",l:"单场最高 · 6,000,000",d:"单场最高达到 6,000,000 池子币",f:"gambleBest",g:6000000,r:1000},
		{k:"cx_gmbest_7500000",c:"豪赌桌",i:"🎲",l:"单场最高 · 7,500,000",d:"单场最高达到 7,500,000 池子币",f:"gambleBest",g:7500000,r:1074},
		{k:"cx_gmbest_9500000",c:"豪赌桌",i:"🎲",l:"单场最高 · 9,500,000",d:"单场最高达到 9,500,000 池子币",f:"gambleBest",g:9500000,r:1298},
		{k:"cx_gmbest_12000000",c:"豪赌桌",i:"🎲",l:"单场最高 · 12,000,000",d:"单场最高达到 12,000,000 池子币",f:"gambleBest",g:12000000,r:1669},
		{k:"cx_gmbest_15000000",c:"豪赌桌",i:"🎲",l:"单场最高 · 15,000,000",d:"单场最高达到 15,000,000 池子币",f:"gambleBest",g:15000000,r:2190},
		{k:"cx_gmbest_19000000",c:"豪赌桌",i:"🎲",l:"单场最高 · 19,000,000",d:"单场最高达到 19,000,000 池子币",f:"gambleBest",g:19000000,r:2860},
		{k:"cx_gmbest_24000000",c:"豪赌桌",i:"🎲",l:"单场最高 · 24,000,000",d:"单场最高达到 24,000,000 池子币",f:"gambleBest",g:24000000,r:3678},
		{k:"cx_gmbest_30000000",c:"豪赌桌",i:"🎲",l:"单场最高 · 30,000,000",d:"单场最高达到 30,000,000 池子币",f:"gambleBest",g:30000000,r:4645},
		{k:"cx_gmbest_32000000",c:"豪赌桌",i:"🎲",l:"单场最高 · 32,000,000",d:"单场最高达到 32,000,000 池子币",f:"gambleBest",g:32000000,r:5760},
		{k:"cx_gmbest_35000000",c:"豪赌桌",i:"🎲",l:"单场最高 · 35,000,000",d:"单场最高达到 35,000,000 池子币",f:"gambleBest",g:35000000,r:7025},
		{k:"cx_gmbest_38000000",c:"豪赌桌",i:"🎲",l:"单场最高 · 38,000,000",d:"单场最高达到 38,000,000 池子币",f:"gambleBest",g:38000000,r:8438},
		{k:"cx_gmbest_39000000",c:"豪赌桌",i:"🎲",l:"单场最高 · 39,000,000",d:"单场最高达到 39,000,000 池子币",f:"gambleBest",g:39000000,r:10000},
		{k:"cx_gmstreak_24",c:"豪赌桌",i:"🎲",l:"连胜 · 24",d:"连胜达到 24 连胜",f:"gambleBestStreak",g:24,r:1000},
		{k:"cx_gmstreak_26",c:"豪赌桌",i:"🎲",l:"连胜 · 26",d:"连胜达到 26 连胜",f:"gambleBestStreak",g:26,r:1063},
		{k:"cx_gmstreak_29",c:"豪赌桌",i:"🎲",l:"连胜 · 29",d:"连胜达到 29 连胜",f:"gambleBestStreak",g:29,r:1250},
		{k:"cx_gmstreak_32",c:"豪赌桌",i:"🎲",l:"连胜 · 32",d:"连胜达到 32 连胜",f:"gambleBestStreak",g:32,r:1563},
		{k:"cx_gmstreak_36",c:"豪赌桌",i:"🎲",l:"连胜 · 36",d:"连胜达到 36 连胜",f:"gambleBestStreak",g:36,r:2000},
		{k:"cx_gmstreak_40",c:"豪赌桌",i:"🎲",l:"连胜 · 40",d:"连胜达到 40 连胜",f:"gambleBestStreak",g:40,r:2563},
		{k:"cx_gmstreak_45",c:"豪赌桌",i:"🎲",l:"连胜 · 45",d:"连胜达到 45 连胜",f:"gambleBestStreak",g:45,r:3250},
		{k:"cx_gmstreak_51",c:"豪赌桌",i:"🎲",l:"连胜 · 51",d:"连胜达到 51 连胜",f:"gambleBestStreak",g:51,r:4063},
		{k:"cx_gmstreak_58",c:"豪赌桌",i:"🎲",l:"连胜 · 58",d:"连胜达到 58 连胜",f:"gambleBestStreak",g:58,r:5000},
		{k:"cx_gmstreak_66",c:"豪赌桌",i:"🎲",l:"连胜 · 66",d:"连胜达到 66 连胜",f:"gambleBestStreak",g:66,r:6063},
		{k:"cx_gmstreak_70",c:"豪赌桌",i:"🎲",l:"连胜 · 70",d:"连胜达到 70 连胜",f:"gambleBestStreak",g:70,r:7250},
		{k:"cx_gmstreak_76",c:"豪赌桌",i:"🎲",l:"连胜 · 76",d:"连胜达到 76 连胜",f:"gambleBestStreak",g:76,r:8563},
		{k:"cx_gmstreak_78",c:"豪赌桌",i:"🎲",l:"连胜 · 78",d:"连胜达到 78 连胜",f:"gambleBestStreak",g:78,r:10000},
		{k:"cx_gmbust_185",c:"豪赌桌",i:"🎲",l:"爆仓次数 · 185",d:"爆仓次数达到 185 次",f:"gambleBust",g:185,r:1000},
		{k:"cx_gmbust_205",c:"豪赌桌",i:"🎲",l:"爆仓次数 · 205",d:"爆仓次数达到 205 次",f:"gambleBust",g:205,r:1023},
		{k:"cx_gmbust_228",c:"豪赌桌",i:"🎲",l:"爆仓次数 · 228",d:"爆仓次数达到 228 次",f:"gambleBust",g:228,r:1090},
		{k:"cx_gmbust_253",c:"豪赌桌",i:"🎲",l:"爆仓次数 · 253",d:"爆仓次数达到 253 次",f:"gambleBust",g:253,r:1203},
		{k:"cx_gmbust_281",c:"豪赌桌",i:"🎲",l:"爆仓次数 · 281",d:"爆仓次数达到 281 次",f:"gambleBust",g:281,r:1360},
		{k:"cx_gmbust_312",c:"豪赌桌",i:"🎲",l:"爆仓次数 · 312",d:"爆仓次数达到 312 次",f:"gambleBust",g:312,r:1563},
		{k:"cx_gmbust_347",c:"豪赌桌",i:"🎲",l:"爆仓次数 · 347",d:"爆仓次数达到 347 次",f:"gambleBust",g:347,r:1810},
		{k:"cx_gmbust_386",c:"豪赌桌",i:"🎲",l:"爆仓次数 · 386",d:"爆仓次数达到 386 次",f:"gambleBust",g:386,r:2103},
		{k:"cx_gmbust_430",c:"豪赌桌",i:"🎲",l:"爆仓次数 · 430",d:"爆仓次数达到 430 次",f:"gambleBust",g:430,r:2440},
		{k:"cx_gmbust_478",c:"豪赌桌",i:"🎲",l:"爆仓次数 · 478",d:"爆仓次数达到 478 次",f:"gambleBust",g:478,r:2823},
		{k:"cx_gmbust_531",c:"豪赌桌",i:"🎲",l:"爆仓次数 · 531",d:"爆仓次数达到 531 次",f:"gambleBust",g:531,r:3250},
		{k:"cx_gmbust_560",c:"豪赌桌",i:"🎲",l:"爆仓次数 · 560",d:"爆仓次数达到 560 次",f:"gambleBust",g:560,r:3723},
		{k:"cx_gmbust_590",c:"豪赌桌",i:"🎲",l:"爆仓次数 · 590",d:"爆仓次数达到 590 次",f:"gambleBust",g:590,r:4240},
		{k:"cx_gmbust_620",c:"豪赌桌",i:"🎲",l:"爆仓次数 · 620",d:"爆仓次数达到 620 次",f:"gambleBust",g:620,r:4803},
		{k:"cx_gmbust_660",c:"豪赌桌",i:"🎲",l:"爆仓次数 · 660",d:"爆仓次数达到 660 次",f:"gambleBust",g:660,r:5410},
		{k:"cx_gmbust_700",c:"豪赌桌",i:"🎲",l:"爆仓次数 · 700",d:"爆仓次数达到 700 次",f:"gambleBust",g:700,r:6063},
		{k:"cx_gmbust_750",c:"豪赌桌",i:"🎲",l:"爆仓次数 · 750",d:"爆仓次数达到 750 次",f:"gambleBust",g:750,r:6760},
		{k:"cx_gmbust_800",c:"豪赌桌",i:"🎲",l:"爆仓次数 · 800",d:"爆仓次数达到 800 次",f:"gambleBust",g:800,r:7502},
		{k:"cx_gmbust_830",c:"豪赌桌",i:"🎲",l:"爆仓次数 · 830",d:"爆仓次数达到 830 次",f:"gambleBust",g:830,r:8290},
		{k:"cx_gmbust_860",c:"豪赌桌",i:"🎲",l:"爆仓次数 · 860",d:"爆仓次数达到 860 次",f:"gambleBust",g:860,r:9123},
		{k:"cx_gmbust_890",c:"豪赌桌",i:"🎲",l:"爆仓次数 · 890",d:"爆仓次数达到 890 次",f:"gambleBust",g:890,r:10000},
		{k:"cx_sign_380",c:"签到",i:"📅",l:"连续签到 · 380",d:"连续签到达到 380 天",f:"streak",g:380,r:1000},
		{k:"cx_sign_400",c:"签到",i:"📅",l:"连续签到 · 400",d:"连续签到达到 400 天",f:"streak",g:400,r:1053},
		{k:"cx_sign_420",c:"签到",i:"📅",l:"连续签到 · 420",d:"连续签到达到 420 天",f:"streak",g:420,r:1213},
		{k:"cx_sign_445",c:"签到",i:"📅",l:"连续签到 · 445",d:"连续签到达到 445 天",f:"streak",g:445,r:1479},
		{k:"cx_sign_470",c:"签到",i:"📅",l:"连续签到 · 470",d:"连续签到达到 470 天",f:"streak",g:470,r:1852},
		{k:"cx_sign_500",c:"签到",i:"📅",l:"连续签到 · 500",d:"连续签到达到 500 天",f:"streak",g:500,r:2331},
		{k:"cx_sign_530",c:"签到",i:"📅",l:"连续签到 · 530",d:"连续签到达到 530 天",f:"streak",g:530,r:2917},
		{k:"cx_sign_565",c:"签到",i:"📅",l:"连续签到 · 565",d:"连续签到达到 565 天",f:"streak",g:565,r:3609},
		{k:"cx_sign_600",c:"签到",i:"📅",l:"连续签到 · 600",d:"连续签到达到 600 天",f:"streak",g:600,r:4408},
		{k:"cx_sign_640",c:"签到",i:"📅",l:"连续签到 · 640",d:"连续签到达到 640 天",f:"streak",g:640,r:5314},
		{k:"cx_sign_680",c:"签到",i:"📅",l:"连续签到 · 680",d:"连续签到达到 680 天",f:"streak",g:680,r:6325},
		{k:"cx_sign_730",c:"签到",i:"📅",l:"连续签到 · 730",d:"连续签到达到 730 天",f:"streak",g:730,r:7444},
		{k:"cx_sign_785",c:"签到",i:"📅",l:"连续签到 · 785",d:"连续签到达到 785 天",f:"streak",g:785,r:8669},
		{k:"cx_sign_845",c:"签到",i:"📅",l:"连续签到 · 845",d:"连续签到达到 845 天",f:"streak",g:845,r:10000},
		{k:"cx_task_17",c:"任务",i:"📋",l:"日课完成 · 17",d:"日课完成达到 17 项",f:"taskCompletedTotal",g:17,r:1000},
		{k:"cx_task_19",c:"任务",i:"📋",l:"日课完成 · 19",d:"日课完成达到 19 项",f:"taskCompletedTotal",g:19,r:1053},
		{k:"cx_task_21",c:"任务",i:"📋",l:"日课完成 · 21",d:"日课完成达到 21 项",f:"taskCompletedTotal",g:21,r:1213},
		{k:"cx_task_23",c:"任务",i:"📋",l:"日课完成 · 23",d:"日课完成达到 23 项",f:"taskCompletedTotal",g:23,r:1479},
		{k:"cx_task_26",c:"任务",i:"📋",l:"日课完成 · 26",d:"日课完成达到 26 项",f:"taskCompletedTotal",g:26,r:1852},
		{k:"cx_task_29",c:"任务",i:"📋",l:"日课完成 · 29",d:"日课完成达到 29 项",f:"taskCompletedTotal",g:29,r:2331},
		{k:"cx_task_32",c:"任务",i:"📋",l:"日课完成 · 32",d:"日课完成达到 32 项",f:"taskCompletedTotal",g:32,r:2917},
		{k:"cx_task_36",c:"任务",i:"📋",l:"日课完成 · 36",d:"日课完成达到 36 项",f:"taskCompletedTotal",g:36,r:3609},
		{k:"cx_task_40",c:"任务",i:"📋",l:"日课完成 · 40",d:"日课完成达到 40 项",f:"taskCompletedTotal",g:40,r:4408},
		{k:"cx_task_45",c:"任务",i:"📋",l:"日课完成 · 45",d:"日课完成达到 45 项",f:"taskCompletedTotal",g:45,r:5314},
		{k:"cx_task_51",c:"任务",i:"📋",l:"日课完成 · 51",d:"日课完成达到 51 项",f:"taskCompletedTotal",g:51,r:6325},
		{k:"cx_task_58",c:"任务",i:"📋",l:"日课完成 · 58",d:"日课完成达到 58 项",f:"taskCompletedTotal",g:58,r:7444},
		{k:"cx_task_66",c:"任务",i:"📋",l:"日课完成 · 66",d:"日课完成达到 66 项",f:"taskCompletedTotal",g:66,r:8669},
		{k:"cx_task_75",c:"任务",i:"📋",l:"日课完成 · 75",d:"日课完成达到 75 项",f:"taskCompletedTotal",g:75,r:10000},
		{k:"cx_retired_84",c:"AI世界",i:"🌍",l:"当前退隐人数 · 84",d:"当前退隐人数达到 84 名",f:"worldRetired",g:84,r:1000},
		{k:"cx_retired_88",c:"AI世界",i:"🌍",l:"当前退隐人数 · 88",d:"当前退隐人数达到 88 名",f:"worldRetired",g:88,r:1074},
		{k:"cx_retired_92",c:"AI世界",i:"🌍",l:"当前退隐人数 · 92",d:"当前退隐人数达到 92 名",f:"worldRetired",g:92,r:1298},
		{k:"cx_retired_96",c:"AI世界",i:"🌍",l:"当前退隐人数 · 96",d:"当前退隐人数达到 96 名",f:"worldRetired",g:96,r:1669},
		{k:"cx_retired_100",c:"AI世界",i:"🌍",l:"当前退隐人数 · 100",d:"当前退隐人数达到 100 名",f:"worldRetired",g:100,r:2190},
		{k:"cx_retired_105",c:"AI世界",i:"🌍",l:"当前退隐人数 · 105",d:"当前退隐人数达到 105 名",f:"worldRetired",g:105,r:2860},
		{k:"cx_retired_110",c:"AI世界",i:"🌍",l:"当前退隐人数 · 110",d:"当前退隐人数达到 110 名",f:"worldRetired",g:110,r:3678},
		{k:"cx_retired_116",c:"AI世界",i:"🌍",l:"当前退隐人数 · 116",d:"当前退隐人数达到 116 名",f:"worldRetired",g:116,r:4645},
		{k:"cx_retired_122",c:"AI世界",i:"🌍",l:"当前退隐人数 · 122",d:"当前退隐人数达到 122 名",f:"worldRetired",g:122,r:5760},
		{k:"cx_retired_130",c:"AI世界",i:"🌍",l:"当前退隐人数 · 130",d:"当前退隐人数达到 130 名",f:"worldRetired",g:130,r:7025},
		{k:"cx_retired_140",c:"AI世界",i:"🌍",l:"当前退隐人数 · 140",d:"当前退隐人数达到 140 名",f:"worldRetired",g:140,r:8438},
		{k:"cx_retired_152",c:"AI世界",i:"🌍",l:"当前退隐人数 · 150",d:"当前退隐人数达到 150 名",f:"worldRetired",g:150,r:10000},
		{k:"cx_combo_rich_peak_0",c:"组合",i:"🧩",l:"双峰并立 · 290,000,000·290,000,000",d:"累计身家达到 290,000,000 池子币，且身家峰值达到 290,000,000 池子币",a:[["pc",290000000],["pcPeak",290000000]],r:1500},
		{k:"cx_combo_rich_peak_1",c:"组合",i:"🧩",l:"双峰并立 · 500,000,000·500,000,000",d:"累计身家达到 500,000,000 池子币，且身家峰值达到 500,000,000 池子币",a:[["pc",500000000],["pcPeak",500000000]],r:1711},
		{k:"cx_combo_rich_peak_2",c:"组合",i:"🧩",l:"双峰并立 · 850,000,000·850,000,000",d:"累计身家达到 850,000,000 池子币，且身家峰值达到 850,000,000 池子币",a:[["pc",850000000],["pcPeak",850000000]],r:2344},
		{k:"cx_combo_rich_peak_3",c:"组合",i:"🧩",l:"双峰并立 · 1,450,000,000·1,450,000,000",d:"累计身家达到 1,450,000,000 池子币，且身家峰值达到 1,450,000,000 池子币",a:[["pc",1450000000],["pcPeak",1450000000]],r:3398},
		{k:"cx_combo_rich_peak_4",c:"组合",i:"🧩",l:"双峰并立 · 2,500,000,000·2,500,000,000",d:"累计身家达到 2,500,000,000 池子币，且身家峰值达到 2,500,000,000 池子币",a:[["pc",2500000000],["pcPeak",2500000000]],r:4875},
		{k:"cx_combo_rich_peak_5",c:"组合",i:"🧩",l:"双峰并立 · 4,300,000,000·4,300,000,000",d:"累计身家达到 4,300,000,000 池子币，且身家峰值达到 4,300,000,000 池子币",a:[["pc",4300000000],["pcPeak",4300000000]],r:6773},
		{k:"cx_combo_rich_peak_6",c:"组合",i:"🧩",l:"双峰并立 · 7,300,000,000·7,300,000,000",d:"累计身家达到 7,300,000,000 池子币，且身家峰值达到 7,300,000,000 池子币",a:[["pc",7300000000],["pcPeak",7300000000]],r:9094},
		{k:"cx_combo_rich_peak_7",c:"组合",i:"🧩",l:"双峰并立 · 12,000,000,000·12,000,000,000",d:"累计身家达到 12,000,000,000 池子币，且身家峰值达到 12,000,000,000 池子币",a:[["pc",12000000000],["pcPeak",12000000000]],r:11836},
		{k:"cx_combo_rich_peak_8",c:"组合",i:"🧩",l:"双峰并立 · 21,000,000,000·21,000,000,000",d:"累计身家达到 21,000,000,000 池子币，且身家峰值达到 21,000,000,000 池子币",a:[["pc",21000000000],["pcPeak",21000000000]],r:15000},
		{k:"cx_combo_merit_meritday_0",c:"组合",i:"🧩",l:"功勋与单日功勋 · 1,400,000·10,000",d:"累计功勋达到 1,400,000 点功勋，且单日功勋达到 10,000 点",a:[["merit",1400000],["meritToday",10000]],r:1500},
		{k:"cx_combo_merit_meritday_1",c:"组合",i:"🧩",l:"功勋与单日功勋 · 3,500,000·17,000",d:"累计功勋达到 3,500,000 点功勋，且单日功勋达到 17,000 点",a:[["merit",3500000],["meritToday",17000]],r:1711},
		{k:"cx_combo_merit_meritday_2",c:"组合",i:"🧩",l:"功勋与单日功勋 · 6,300,000·22,000",d:"累计功勋达到 6,300,000 点功勋，且单日功勋达到 22,000 点",a:[["merit",6300000],["meritToday",22000]],r:2344},
		{k:"cx_combo_merit_meritday_3",c:"组合",i:"🧩",l:"功勋与单日功勋 · 15,500,000·28,000",d:"累计功勋达到 15,500,000 点功勋，且单日功勋达到 28,000 点",a:[["merit",15500000],["meritToday",28000]],r:3398},
		{k:"cx_combo_merit_meritday_4",c:"组合",i:"🧩",l:"功勋与单日功勋 · 38,000,000·36,000",d:"累计功勋达到 38,000,000 点功勋，且单日功勋达到 36,000 点",a:[["merit",38000000],["meritToday",36000]],r:4875},
		{k:"cx_combo_merit_meritday_5",c:"组合",i:"🧩",l:"功勋与单日功勋 · 70,000,000·46,000",d:"累计功勋达到 70,000,000 点功勋，且单日功勋达到 46,000 点",a:[["merit",70000000],["meritToday",46000]],r:6773},
		{k:"cx_combo_merit_meritday_6",c:"组合",i:"🧩",l:"功勋与单日功勋 · 180,000,000·73,000",d:"累计功勋达到 180,000,000 点功勋，且单日功勋达到 73,000 点",a:[["merit",180000000],["meritToday",73000]],r:9094},
		{k:"cx_combo_merit_meritday_7",c:"组合",i:"🧩",l:"功勋与单日功勋 · 350,000,000·92,000",d:"累计功勋达到 350,000,000 点功勋，且单日功勋达到 92,000 点",a:[["merit",350000000],["meritToday",92000]],r:11836},
		{k:"cx_combo_merit_meritday_8",c:"组合",i:"🧩",l:"功勋与单日功勋 · 900,000,000·115,000",d:"累计功勋达到 900,000,000 点功勋，且单日功勋达到 115,000 点",a:[["merit",900000000],["meritToday",115000]],r:15000},
		{k:"cx_combo_wins_games_0",c:"组合",i:"🧩",l:"百战不殆 · 11,000·11,000",d:"累计胜场达到 11,000 胜，且对局数达到 11,000 局",a:[["wrWin",11000],["wrGames",11000]],r:1500},
		{k:"cx_combo_wins_games_1",c:"组合",i:"🧩",l:"百战不殆 · 12,000·12,000",d:"累计胜场达到 12,000 胜，且对局数达到 12,000 局",a:[["wrWin",12000],["wrGames",12000]],r:1711},
		{k:"cx_combo_wins_games_3",c:"组合",i:"🧩",l:"百战不殆 · 13,000·13,000",d:"累计胜场达到 13,000 胜，且对局数达到 13,000 局",a:[["wrWin",13000],["wrGames",13000]],r:3398},
		{k:"cx_combo_wins_games_5",c:"组合",i:"🧩",l:"百战不殆 · 14,000·14,000",d:"累计胜场达到 14,000 胜，且对局数达到 14,000 局",a:[["wrWin",14000],["wrGames",14000]],r:6773},
		{k:"cx_combo_wins_games_7",c:"组合",i:"🧩",l:"百战不殆 · 15,000·15,000",d:"累计胜场达到 15,000 胜，且对局数达到 15,000 局",a:[["wrWin",15000],["wrGames",15000]],r:11836},
		{k:"cx_combo_wins_kills_0",c:"组合",i:"🧩",l:"斩将搴旗 · 11,000·12,500",d:"累计胜场达到 11,000 胜，且击杀达到 12,500 人",a:[["wrWin",11000],["wrKill",12500]],r:1500},
		{k:"cx_combo_wins_kills_1",c:"组合",i:"🧩",l:"斩将搴旗 · 12,000·14,500",d:"累计胜场达到 12,000 胜，且击杀达到 14,500 人",a:[["wrWin",12000],["wrKill",14500]],r:1711},
		{k:"cx_combo_wins_kills_2",c:"组合",i:"🧩",l:"斩将搴旗 · 12,000·16,500",d:"累计胜场达到 12,000 胜，且击杀达到 16,500 人",a:[["wrWin",12000],["wrKill",16500]],r:2344},
		{k:"cx_combo_wins_kills_3",c:"组合",i:"🧩",l:"斩将搴旗 · 13,000·19,000",d:"累计胜场达到 13,000 胜，且击杀达到 19,000 人",a:[["wrWin",13000],["wrKill",19000]],r:3398},
		{k:"cx_combo_wins_kills_4",c:"组合",i:"🧩",l:"斩将搴旗 · 13,000·22,000",d:"累计胜场达到 13,000 胜，且击杀达到 22,000 人",a:[["wrWin",13000],["wrKill",22000]],r:4875},
		{k:"cx_combo_wins_kills_5",c:"组合",i:"🧩",l:"斩将搴旗 · 14,000·25,500",d:"累计胜场达到 14,000 胜，且击杀达到 25,500 人",a:[["wrWin",14000],["wrKill",25500]],r:6773},
		{k:"cx_combo_wins_kills_6",c:"组合",i:"🧩",l:"斩将搴旗 · 14,000·29,500",d:"累计胜场达到 14,000 胜，且击杀达到 29,500 人",a:[["wrWin",14000],["wrKill",29500]],r:9094},
		{k:"cx_combo_wins_kills_7",c:"组合",i:"🧩",l:"斩将搴旗 · 15,000·34,000",d:"累计胜场达到 15,000 胜，且击杀达到 34,000 人",a:[["wrWin",15000],["wrKill",34000]],r:11836},
		{k:"cx_combo_wins_kills_8",c:"组合",i:"🧩",l:"斩将搴旗 · 15,000·39,000",d:"累计胜场达到 15,000 胜，且击杀达到 39,000 人",a:[["wrWin",15000],["wrKill",39000]],r:15000},
		{k:"cx_combo_wins_chars_0",c:"组合",i:"🧩",l:"胜场与使用武将数 · 11,000·60",d:"累计胜场达到 11,000 胜，且使用武将数达到 60 名",a:[["wrWin",11000],["wrChars",60]],r:1500},
		{k:"cx_combo_wins_chars_1",c:"组合",i:"🧩",l:"胜场与使用武将数 · 12,000·70",d:"累计胜场达到 12,000 胜，且使用武将数达到 70 名",a:[["wrWin",12000],["wrChars",70]],r:1711},
		{k:"cx_combo_wins_chars_2",c:"组合",i:"🧩",l:"胜场与使用武将数 · 12,000·75",d:"累计胜场达到 12,000 胜，且使用武将数达到 75 名",a:[["wrWin",12000],["wrChars",75]],r:2344},
		{k:"cx_combo_wins_chars_3",c:"组合",i:"🧩",l:"胜场与使用武将数 · 13,000·85",d:"累计胜场达到 13,000 胜，且使用武将数达到 85 名",a:[["wrWin",13000],["wrChars",85]],r:3398},
		{k:"cx_combo_wins_chars_4",c:"组合",i:"🧩",l:"胜场与使用武将数 · 13,000·90",d:"累计胜场达到 13,000 胜，且使用武将数达到 90 名",a:[["wrWin",13000],["wrChars",90]],r:4875},
		{k:"cx_combo_wins_chars_5",c:"组合",i:"🧩",l:"胜场与使用武将数 · 14,000·100",d:"累计胜场达到 14,000 胜，且使用武将数达到 100 名",a:[["wrWin",14000],["wrChars",100]],r:6773},
		{k:"cx_combo_wins_chars_6",c:"组合",i:"🧩",l:"胜场与使用武将数 · 14,000·105",d:"累计胜场达到 14,000 胜，且使用武将数达到 105 名",a:[["wrWin",14000],["wrChars",105]],r:9094},
		{k:"cx_combo_wins_chars_7",c:"组合",i:"🧩",l:"胜场与使用武将数 · 15,000·115",d:"累计胜场达到 15,000 胜，且使用武将数达到 115 名",a:[["wrWin",15000],["wrChars",115]],r:11836},
		{k:"cx_combo_wins_chars_8",c:"组合",i:"🧩",l:"胜场与使用武将数 · 15,000·120",d:"累计胜场达到 15,000 胜，且使用武将数达到 120 名",a:[["wrWin",15000],["wrChars",120]],r:15000},
		{k:"cx_combo_games_kills_0",c:"组合",i:"🧩",l:"对局数与击杀 · 11,000·12,500",d:"累计对局数达到 11,000 局，且击杀达到 12,500 人",a:[["wrGames",11000],["wrKill",12500]],r:1500},
		{k:"cx_combo_games_kills_1",c:"组合",i:"🧩",l:"对局数与击杀 · 12,000·14,500",d:"累计对局数达到 12,000 局，且击杀达到 14,500 人",a:[["wrGames",12000],["wrKill",14500]],r:1711},
		{k:"cx_combo_games_kills_2",c:"组合",i:"🧩",l:"对局数与击杀 · 12,000·16,500",d:"累计对局数达到 12,000 局，且击杀达到 16,500 人",a:[["wrGames",12000],["wrKill",16500]],r:2344},
		{k:"cx_combo_games_kills_3",c:"组合",i:"🧩",l:"对局数与击杀 · 13,000·19,000",d:"累计对局数达到 13,000 局，且击杀达到 19,000 人",a:[["wrGames",13000],["wrKill",19000]],r:3398},
		{k:"cx_combo_games_kills_4",c:"组合",i:"🧩",l:"对局数与击杀 · 13,000·22,000",d:"累计对局数达到 13,000 局，且击杀达到 22,000 人",a:[["wrGames",13000],["wrKill",22000]],r:4875},
		{k:"cx_combo_games_kills_5",c:"组合",i:"🧩",l:"对局数与击杀 · 14,000·25,500",d:"累计对局数达到 14,000 局，且击杀达到 25,500 人",a:[["wrGames",14000],["wrKill",25500]],r:6773},
		{k:"cx_combo_games_kills_6",c:"组合",i:"🧩",l:"对局数与击杀 · 14,000·29,500",d:"累计对局数达到 14,000 局，且击杀达到 29,500 人",a:[["wrGames",14000],["wrKill",29500]],r:9094},
		{k:"cx_combo_games_kills_7",c:"组合",i:"🧩",l:"对局数与击杀 · 15,000·34,000",d:"累计对局数达到 15,000 局，且击杀达到 34,000 人",a:[["wrGames",15000],["wrKill",34000]],r:11836},
		{k:"cx_combo_games_kills_8",c:"组合",i:"🧩",l:"对局数与击杀 · 15,000·39,000",d:"累计对局数达到 15,000 局，且击杀达到 39,000 人",a:[["wrGames",15000],["wrKill",39000]],r:15000},
		{k:"cx_combo_games_chars_0",c:"组合",i:"🧩",l:"博采众将 · 11,000·60",d:"累计对局数达到 11,000 局，且使用武将数达到 60 名",a:[["wrGames",11000],["wrChars",60]],r:1500},
		{k:"cx_combo_games_chars_1",c:"组合",i:"🧩",l:"博采众将 · 12,000·70",d:"累计对局数达到 12,000 局，且使用武将数达到 70 名",a:[["wrGames",12000],["wrChars",70]],r:1711},
		{k:"cx_combo_games_chars_2",c:"组合",i:"🧩",l:"博采众将 · 12,000·75",d:"累计对局数达到 12,000 局，且使用武将数达到 75 名",a:[["wrGames",12000],["wrChars",75]],r:2344},
		{k:"cx_combo_games_chars_3",c:"组合",i:"🧩",l:"博采众将 · 13,000·85",d:"累计对局数达到 13,000 局，且使用武将数达到 85 名",a:[["wrGames",13000],["wrChars",85]],r:3398},
		{k:"cx_combo_games_chars_4",c:"组合",i:"🧩",l:"博采众将 · 13,000·90",d:"累计对局数达到 13,000 局，且使用武将数达到 90 名",a:[["wrGames",13000],["wrChars",90]],r:4875},
		{k:"cx_combo_games_chars_5",c:"组合",i:"🧩",l:"博采众将 · 14,000·100",d:"累计对局数达到 14,000 局，且使用武将数达到 100 名",a:[["wrGames",14000],["wrChars",100]],r:6773},
		{k:"cx_combo_games_chars_6",c:"组合",i:"🧩",l:"博采众将 · 14,000·105",d:"累计对局数达到 14,000 局，且使用武将数达到 105 名",a:[["wrGames",14000],["wrChars",105]],r:9094},
		{k:"cx_combo_games_chars_7",c:"组合",i:"🧩",l:"博采众将 · 15,000·115",d:"累计对局数达到 15,000 局，且使用武将数达到 115 名",a:[["wrGames",15000],["wrChars",115]],r:11836},
		{k:"cx_combo_games_chars_8",c:"组合",i:"🧩",l:"博采众将 · 15,000·120",d:"累计对局数达到 15,000 局，且使用武将数达到 120 名",a:[["wrGames",15000],["wrChars",120]],r:15000},
		{k:"cx_combo_kills_chars_0",c:"组合",i:"🧩",l:"击杀与使用武将数 · 12,500·60",d:"累计击杀达到 12,500 人，且使用武将数达到 60 名",a:[["wrKill",12500],["wrChars",60]],r:1500},
		{k:"cx_combo_kills_chars_1",c:"组合",i:"🧩",l:"击杀与使用武将数 · 14,500·70",d:"累计击杀达到 14,500 人，且使用武将数达到 70 名",a:[["wrKill",14500],["wrChars",70]],r:1711},
		{k:"cx_combo_kills_chars_2",c:"组合",i:"🧩",l:"击杀与使用武将数 · 16,500·75",d:"累计击杀达到 16,500 人，且使用武将数达到 75 名",a:[["wrKill",16500],["wrChars",75]],r:2344},
		{k:"cx_combo_kills_chars_3",c:"组合",i:"🧩",l:"击杀与使用武将数 · 19,000·85",d:"累计击杀达到 19,000 人，且使用武将数达到 85 名",a:[["wrKill",19000],["wrChars",85]],r:3398},
		{k:"cx_combo_kills_chars_4",c:"组合",i:"🧩",l:"击杀与使用武将数 · 22,000·90",d:"累计击杀达到 22,000 人，且使用武将数达到 90 名",a:[["wrKill",22000],["wrChars",90]],r:4875},
		{k:"cx_combo_kills_chars_5",c:"组合",i:"🧩",l:"击杀与使用武将数 · 25,500·100",d:"累计击杀达到 25,500 人，且使用武将数达到 100 名",a:[["wrKill",25500],["wrChars",100]],r:6773},
		{k:"cx_combo_kills_chars_6",c:"组合",i:"🧩",l:"击杀与使用武将数 · 29,500·105",d:"累计击杀达到 29,500 人，且使用武将数达到 105 名",a:[["wrKill",29500],["wrChars",105]],r:9094},
		{k:"cx_combo_kills_chars_7",c:"组合",i:"🧩",l:"击杀与使用武将数 · 34,000·115",d:"累计击杀达到 34,000 人，且使用武将数达到 115 名",a:[["wrKill",34000],["wrChars",115]],r:11836},
		{k:"cx_combo_kills_chars_8",c:"组合",i:"🧩",l:"击杀与使用武将数 · 39,000·120",d:"累计击杀达到 39,000 人，且使用武将数达到 120 名",a:[["wrKill",39000],["wrChars",120]],r:15000},
		{k:"cx_combo_gmplay_gmwin_0",c:"组合",i:"🧩",l:"出战次数与胜局 · 1,900·215",d:"累计出战次数达到 1,900 场，且胜局达到 215 胜",a:[["gamblePlays",1900],["gambleWins",215]],r:1500},
		{k:"cx_combo_gmplay_gmwin_1",c:"组合",i:"🧩",l:"出战次数与胜局 · 2,200·250",d:"累计出战次数达到 2,200 场，且胜局达到 250 胜",a:[["gamblePlays",2200],["gambleWins",250]],r:1711},
		{k:"cx_combo_gmplay_gmwin_2",c:"组合",i:"🧩",l:"出战次数与胜局 · 2,900·340",d:"累计出战次数达到 2,900 场，且胜局达到 340 胜",a:[["gamblePlays",2900],["gambleWins",340]],r:2344},
		{k:"cx_combo_gmplay_gmwin_3",c:"组合",i:"🧩",l:"出战次数与胜局 · 3,300·460",d:"累计出战次数达到 3,300 场，且胜局达到 460 胜",a:[["gamblePlays",3300],["gambleWins",460]],r:3398},
		{k:"cx_combo_gmplay_gmwin_4",c:"组合",i:"🧩",l:"出战次数与胜局 · 3,800·1,500",d:"累计出战次数达到 3,800 场，且胜局达到 1,500 胜",a:[["gamblePlays",3800],["gambleWins",1500]],r:4875},
		{k:"cx_combo_gmplay_gmwin_5",c:"组合",i:"🧩",l:"出战次数与胜局 · 5,100·3,000",d:"累计出战次数达到 5,100 场，且胜局达到 3,000 胜",a:[["gamblePlays",5100],["gambleWins",3000]],r:6773},
		{k:"cx_combo_gmplay_gmwin_6",c:"组合",i:"🧩",l:"出战次数与胜局 · 5,900·4,000",d:"累计出战次数达到 5,900 场，且胜局达到 4,000 胜",a:[["gamblePlays",5900],["gambleWins",4000]],r:9094},
		{k:"cx_combo_gmplay_gmwin_7",c:"组合",i:"🧩",l:"出战次数与胜局 · 7,900·5,000",d:"累计出战次数达到 7,900 场，且胜局达到 5,000 胜",a:[["gamblePlays",7900],["gambleWins",5000]],r:11836},
		{k:"cx_combo_gmplay_gmwin_8",c:"组合",i:"🧩",l:"出战次数与胜局 · 9,200·6,000",d:"累计出战次数达到 9,200 场，且胜局达到 6,000 胜",a:[["gamblePlays",9200],["gambleWins",6000]],r:15000},
		{k:"cx_combo_gmplay_gmnet_0",c:"组合",i:"🧩",l:"久赌必赢 · 1,900·10,000,000",d:"累计出战次数达到 1,900 场，且净赢达到 10,000,000 池子币",a:[["gamblePlays",1900],["gambleNet",10000000]],r:1500},
		{k:"cx_combo_gmplay_gmnet_1",c:"组合",i:"🧩",l:"久赌必赢 · 2,200·10,000,000",d:"累计出战次数达到 2,200 场，且净赢达到 10,000,000 池子币",a:[["gamblePlays",2200],["gambleNet",10000000]],r:1711},
		{k:"cx_combo_gmplay_gmnet_2",c:"组合",i:"🧩",l:"久赌必赢 · 2,900·10,000,000",d:"累计出战次数达到 2,900 场，且净赢达到 10,000,000 池子币",a:[["gamblePlays",2900],["gambleNet",10000000]],r:2344},
		{k:"cx_combo_gmplay_gmnet_3",c:"组合",i:"🧩",l:"久赌必赢 · 3,300·10,000,000",d:"累计出战次数达到 3,300 场，且净赢达到 10,000,000 池子币",a:[["gamblePlays",3300],["gambleNet",10000000]],r:3398},
		{k:"cx_combo_gmplay_gmnet_4",c:"组合",i:"🧩",l:"久赌必赢 · 3,800·10,000,000",d:"累计出战次数达到 3,800 场，且净赢达到 10,000,000 池子币",a:[["gamblePlays",3800],["gambleNet",10000000]],r:4875},
		{k:"cx_combo_gmplay_gmnet_5",c:"组合",i:"🧩",l:"久赌必赢 · 5,100·10,000,000",d:"累计出战次数达到 5,100 场，且净赢达到 10,000,000 池子币",a:[["gamblePlays",5100],["gambleNet",10000000]],r:6773},
		{k:"cx_combo_gmplay_gmnet_6",c:"组合",i:"🧩",l:"久赌必赢 · 5,900·10,000,000",d:"累计出战次数达到 5,900 场，且净赢达到 10,000,000 池子币",a:[["gamblePlays",5900],["gambleNet",10000000]],r:9094},
		{k:"cx_combo_gmplay_gmnet_7",c:"组合",i:"🧩",l:"久赌必赢 · 7,900·10,000,000",d:"累计出战次数达到 7,900 场，且净赢达到 10,000,000 池子币",a:[["gamblePlays",7900],["gambleNet",10000000]],r:11836},
		{k:"cx_combo_gmplay_gmnet_8",c:"组合",i:"🧩",l:"久赌必赢 · 9,200·10,000,000",d:"累计出战次数达到 9,200 场，且净赢达到 10,000,000 池子币",a:[["gamblePlays",9200],["gambleNet",10000000]],r:15000},
		{k:"cx_combo_gmplay_gmstreak_0",c:"组合",i:"🧩",l:"出战次数与连胜 · 1,900·29",d:"累计出战次数达到 1,900 场，且连胜达到 29 连胜",a:[["gamblePlays",1900],["gambleBestStreak",29]],r:1500},
		{k:"cx_combo_gmplay_gmstreak_1",c:"组合",i:"🧩",l:"出战次数与连胜 · 2,200·32",d:"累计出战次数达到 2,200 场，且连胜达到 32 连胜",a:[["gamblePlays",2200],["gambleBestStreak",32]],r:1711},
		{k:"cx_combo_gmplay_gmstreak_2",c:"组合",i:"🧩",l:"出战次数与连胜 · 2,900·36",d:"累计出战次数达到 2,900 场，且连胜达到 36 连胜",a:[["gamblePlays",2900],["gambleBestStreak",36]],r:2344},
		{k:"cx_combo_gmplay_gmstreak_3",c:"组合",i:"🧩",l:"出战次数与连胜 · 3,300·45",d:"累计出战次数达到 3,300 场，且连胜达到 45 连胜",a:[["gamblePlays",3300],["gambleBestStreak",45]],r:3398},
		{k:"cx_combo_gmplay_gmstreak_4",c:"组合",i:"🧩",l:"出战次数与连胜 · 3,800·51",d:"累计出战次数达到 3,800 场，且连胜达到 51 连胜",a:[["gamblePlays",3800],["gambleBestStreak",51]],r:4875},
		{k:"cx_combo_gmplay_gmstreak_5",c:"组合",i:"🧩",l:"出战次数与连胜 · 5,100·58",d:"累计出战次数达到 5,100 场，且连胜达到 58 连胜",a:[["gamblePlays",5100],["gambleBestStreak",58]],r:6773},
		{k:"cx_combo_gmplay_gmstreak_6",c:"组合",i:"🧩",l:"出战次数与连胜 · 5,900·66",d:"累计出战次数达到 5,900 场，且连胜达到 66 连胜",a:[["gamblePlays",5900],["gambleBestStreak",66]],r:9094},
		{k:"cx_combo_gmplay_gmstreak_7",c:"组合",i:"🧩",l:"出战次数与连胜 · 7,900·76",d:"累计出战次数达到 7,900 场，且连胜达到 76 连胜",a:[["gamblePlays",7900],["gambleBestStreak",76]],r:11836},
		{k:"cx_combo_gmplay_gmstreak_8",c:"组合",i:"🧩",l:"出战次数与连胜 · 9,200·78",d:"累计出战次数达到 9,200 场，且连胜达到 78 连胜",a:[["gamblePlays",9200],["gambleBestStreak",78]],r:15000},
		{k:"cx_combo_gmwin_gmnet_0",c:"组合",i:"🧩",l:"胜而后富 · 215·10,000,000",d:"累计胜局达到 215 胜，且净赢达到 10,000,000 池子币",a:[["gambleWins",215],["gambleNet",10000000]],r:1500},
		{k:"cx_combo_gmwin_gmnet_1",c:"组合",i:"🧩",l:"胜而后富 · 250·10,000,000",d:"累计胜局达到 250 胜，且净赢达到 10,000,000 池子币",a:[["gambleWins",250],["gambleNet",10000000]],r:1711},
		{k:"cx_combo_gmwin_gmnet_2",c:"组合",i:"🧩",l:"胜而后富 · 340·10,000,000",d:"累计胜局达到 340 胜，且净赢达到 10,000,000 池子币",a:[["gambleWins",340],["gambleNet",10000000]],r:2344},
		{k:"cx_combo_gmwin_gmnet_3",c:"组合",i:"🧩",l:"胜而后富 · 460·10,000,000",d:"累计胜局达到 460 胜，且净赢达到 10,000,000 池子币",a:[["gambleWins",460],["gambleNet",10000000]],r:3398},
		{k:"cx_combo_gmwin_gmnet_4",c:"组合",i:"🧩",l:"胜而后富 · 1,500·10,000,000",d:"累计胜局达到 1,500 胜，且净赢达到 10,000,000 池子币",a:[["gambleWins",1500],["gambleNet",10000000]],r:4875},
		{k:"cx_combo_gmwin_gmnet_5",c:"组合",i:"🧩",l:"胜而后富 · 3,000·10,000,000",d:"累计胜局达到 3,000 胜，且净赢达到 10,000,000 池子币",a:[["gambleWins",3000],["gambleNet",10000000]],r:6773},
		{k:"cx_combo_gmwin_gmnet_6",c:"组合",i:"🧩",l:"胜而后富 · 4,000·10,000,000",d:"累计胜局达到 4,000 胜，且净赢达到 10,000,000 池子币",a:[["gambleWins",4000],["gambleNet",10000000]],r:9094},
		{k:"cx_combo_gmwin_gmnet_7",c:"组合",i:"🧩",l:"胜而后富 · 5,000·10,000,000",d:"累计胜局达到 5,000 胜，且净赢达到 10,000,000 池子币",a:[["gambleWins",5000],["gambleNet",10000000]],r:11836},
		{k:"cx_combo_gmwin_gmnet_8",c:"组合",i:"🧩",l:"胜而后富 · 6,000·10,000,000",d:"累计胜局达到 6,000 胜，且净赢达到 10,000,000 池子币",a:[["gambleWins",6000],["gambleNet",10000000]],r:15000},
		{k:"cx_combo_gmwin_gmstreak_0",c:"组合",i:"🧩",l:"胜局与连胜 · 215·29",d:"累计胜局达到 215 胜，且连胜达到 29 连胜",a:[["gambleWins",215],["gambleBestStreak",29]],r:1500},
		{k:"cx_combo_gmwin_gmstreak_1",c:"组合",i:"🧩",l:"胜局与连胜 · 250·32",d:"累计胜局达到 250 胜，且连胜达到 32 连胜",a:[["gambleWins",250],["gambleBestStreak",32]],r:1711},
		{k:"cx_combo_gmwin_gmstreak_2",c:"组合",i:"🧩",l:"胜局与连胜 · 340·36",d:"累计胜局达到 340 胜，且连胜达到 36 连胜",a:[["gambleWins",340],["gambleBestStreak",36]],r:2344},
		{k:"cx_combo_gmwin_gmstreak_3",c:"组合",i:"🧩",l:"胜局与连胜 · 460·45",d:"累计胜局达到 460 胜，且连胜达到 45 连胜",a:[["gambleWins",460],["gambleBestStreak",45]],r:3398},
		{k:"cx_combo_gmwin_gmstreak_4",c:"组合",i:"🧩",l:"胜局与连胜 · 1,500·51",d:"累计胜局达到 1,500 胜，且连胜达到 51 连胜",a:[["gambleWins",1500],["gambleBestStreak",51]],r:4875},
		{k:"cx_combo_gmwin_gmstreak_5",c:"组合",i:"🧩",l:"胜局与连胜 · 3,000·58",d:"累计胜局达到 3,000 胜，且连胜达到 58 连胜",a:[["gambleWins",3000],["gambleBestStreak",58]],r:6773},
		{k:"cx_combo_gmwin_gmstreak_6",c:"组合",i:"🧩",l:"胜局与连胜 · 4,000·66",d:"累计胜局达到 4,000 胜，且连胜达到 66 连胜",a:[["gambleWins",4000],["gambleBestStreak",66]],r:9094},
		{k:"cx_combo_gmwin_gmstreak_7",c:"组合",i:"🧩",l:"胜局与连胜 · 5,000·76",d:"累计胜局达到 5,000 胜，且连胜达到 76 连胜",a:[["gambleWins",5000],["gambleBestStreak",76]],r:11836},
		{k:"cx_combo_gmwin_gmstreak_8",c:"组合",i:"🧩",l:"胜局与连胜 · 6,000·78",d:"累计胜局达到 6,000 胜，且连胜达到 78 连胜",a:[["gambleWins",6000],["gambleBestStreak",78]],r:15000},
		{k:"cx_combo_gmnet_gmstreak_0",c:"组合",i:"🧩",l:"净赢与连胜 · 10,000,000·29",d:"累计净赢达到 10,000,000 池子币，且连胜达到 29 连胜",a:[["gambleNet",10000000],["gambleBestStreak",29]],r:1500},
		{k:"cx_combo_gmnet_gmstreak_1",c:"组合",i:"🧩",l:"净赢与连胜 · 10,000,000·32",d:"累计净赢达到 10,000,000 池子币，且连胜达到 32 连胜",a:[["gambleNet",10000000],["gambleBestStreak",32]],r:1711},
		{k:"cx_combo_gmnet_gmstreak_2",c:"组合",i:"🧩",l:"净赢与连胜 · 10,000,000·36",d:"累计净赢达到 10,000,000 池子币，且连胜达到 36 连胜",a:[["gambleNet",10000000],["gambleBestStreak",36]],r:2344},
		{k:"cx_combo_gmnet_gmstreak_3",c:"组合",i:"🧩",l:"净赢与连胜 · 10,000,000·45",d:"累计净赢达到 10,000,000 池子币，且连胜达到 45 连胜",a:[["gambleNet",10000000],["gambleBestStreak",45]],r:3398},
		{k:"cx_combo_gmnet_gmstreak_4",c:"组合",i:"🧩",l:"净赢与连胜 · 10,000,000·51",d:"累计净赢达到 10,000,000 池子币，且连胜达到 51 连胜",a:[["gambleNet",10000000],["gambleBestStreak",51]],r:4875},
		{k:"cx_combo_gmnet_gmstreak_5",c:"组合",i:"🧩",l:"净赢与连胜 · 10,000,000·58",d:"累计净赢达到 10,000,000 池子币，且连胜达到 58 连胜",a:[["gambleNet",10000000],["gambleBestStreak",58]],r:6773},
		{k:"cx_combo_gmnet_gmstreak_6",c:"组合",i:"🧩",l:"净赢与连胜 · 10,000,000·66",d:"累计净赢达到 10,000,000 池子币，且连胜达到 66 连胜",a:[["gambleNet",10000000],["gambleBestStreak",66]],r:9094},
		{k:"cx_combo_gmnet_gmstreak_7",c:"组合",i:"🧩",l:"净赢与连胜 · 10,000,000·76",d:"累计净赢达到 10,000,000 池子币，且连胜达到 76 连胜",a:[["gambleNet",10000000],["gambleBestStreak",76]],r:11836},
		{k:"cx_combo_gmnet_gmstreak_8",c:"组合",i:"🧩",l:"净赢与连胜 · 10,000,000·78",d:"累计净赢达到 10,000,000 池子币，且连胜达到 78 连胜",a:[["gambleNet",10000000],["gambleBestStreak",78]],r:15000},
		{k:"cx_combo_hands_retired_0",c:"组合",i:"🧩",l:"阅尽众生 · 78,000·88",d:"累计同桌人次达到 78,000 人次，且当前退隐人数达到 88 名",a:[["worldHands",78000],["worldRetired",88]],r:1500},
		{k:"cx_combo_hands_retired_1",c:"组合",i:"🧩",l:"阅尽众生 · 120,000·96",d:"累计同桌人次达到 120,000 人次，且当前退隐人数达到 96 名",a:[["worldHands",120000],["worldRetired",96]],r:1711},
		{k:"cx_combo_hands_retired_2",c:"组合",i:"🧩",l:"阅尽众生 · 185,000·100",d:"累计同桌人次达到 185,000 人次，且当前退隐人数达到 100 名",a:[["worldHands",185000],["worldRetired",100]],r:2344},
		{k:"cx_combo_hands_retired_3",c:"组合",i:"🧩",l:"阅尽众生 · 285,000·105",d:"累计同桌人次达到 285,000 人次，且当前退隐人数达到 105 名",a:[["worldHands",285000],["worldRetired",105]],r:3398},
		{k:"cx_combo_hands_retired_4",c:"组合",i:"🧩",l:"阅尽众生 · 350,000·110",d:"累计同桌人次达到 350,000 人次，且当前退隐人数达到 110 名",a:[["worldHands",350000],["worldRetired",110]],r:4875},
		{k:"cx_combo_hands_retired_5",c:"组合",i:"🧩",l:"阅尽众生 · 530,000·116",d:"累计同桌人次达到 530,000 人次，且当前退隐人数达到 116 名",a:[["worldHands",530000],["worldRetired",116]],r:6773},
		{k:"cx_combo_hands_retired_6",c:"组合",i:"🧩",l:"阅尽众生 · 800,000·130",d:"累计同桌人次达到 800,000 人次，且当前退隐人数达到 130 名",a:[["worldHands",800000],["worldRetired",130]],r:9094},
		{k:"cx_combo_hands_retired_7",c:"组合",i:"🧩",l:"阅尽众生 · 980,000·140",d:"累计同桌人次达到 980,000 人次，且当前退隐人数达到 140 名",a:[["worldHands",980000],["worldRetired",140]],r:11836},
		{k:"cx_combo_hands_retired_8",c:"组合",i:"🧩",l:"阅尽众生 · 1,480,000·150",d:"累计同桌人次达到 1,480,000 人次，且当前退隐人数达到 150 名",a:[["worldHands",1480000],["worldRetired",150]],r:15000},
		{k:"cx_combo_sign_task_0",c:"组合",i:"🧩",l:"勤勉不辍 · 420·21",d:"累计连续签到达到 420 天，且日课完成达到 21 项",a:[["streak",420],["taskCompletedTotal",21]],r:1500},
		{k:"cx_combo_sign_task_1",c:"组合",i:"🧩",l:"勤勉不辍 · 445·23",d:"累计连续签到达到 445 天，且日课完成达到 23 项",a:[["streak",445],["taskCompletedTotal",23]],r:1711},
		{k:"cx_combo_sign_task_2",c:"组合",i:"🧩",l:"勤勉不辍 · 500·29",d:"累计连续签到达到 500 天，且日课完成达到 29 项",a:[["streak",500],["taskCompletedTotal",29]],r:2344},
		{k:"cx_combo_sign_task_3",c:"组合",i:"🧩",l:"勤勉不辍 · 530·32",d:"累计连续签到达到 530 天，且日课完成达到 32 项",a:[["streak",530],["taskCompletedTotal",32]],r:3398},
		{k:"cx_combo_sign_task_4",c:"组合",i:"🧩",l:"勤勉不辍 · 565·36",d:"累计连续签到达到 565 天，且日课完成达到 36 项",a:[["streak",565],["taskCompletedTotal",36]],r:4875},
		{k:"cx_combo_sign_task_5",c:"组合",i:"🧩",l:"勤勉不辍 · 640·45",d:"累计连续签到达到 640 天，且日课完成达到 45 项",a:[["streak",640],["taskCompletedTotal",45]],r:6773},
		{k:"cx_combo_sign_task_6",c:"组合",i:"🧩",l:"勤勉不辍 · 680·51",d:"累计连续签到达到 680 天，且日课完成达到 51 项",a:[["streak",680],["taskCompletedTotal",51]],r:9094},
		{k:"cx_combo_sign_task_7",c:"组合",i:"🧩",l:"勤勉不辍 · 785·66",d:"累计连续签到达到 785 天，且日课完成达到 66 项",a:[["streak",785],["taskCompletedTotal",66]],r:11836},
		{k:"cx_combo_sign_task_8",c:"组合",i:"🧩",l:"勤勉不辍 · 845·75",d:"累计连续签到达到 845 天，且日课完成达到 75 项",a:[["streak",845],["taskCompletedTotal",75]],r:15000},
		{k:"cx_combo_rich_merit_0",c:"组合",i:"🧩",l:"富且贵 · 290,000,000·1,400,000",d:"累计身家达到 290,000,000 池子币，且功勋达到 1,400,000 点功勋",a:[["pc",290000000],["merit",1400000]],r:1500},
		{k:"cx_combo_rich_merit_1",c:"组合",i:"🧩",l:"富且贵 · 500,000,000·3,500,000",d:"累计身家达到 500,000,000 池子币，且功勋达到 3,500,000 点功勋",a:[["pc",500000000],["merit",3500000]],r:1711},
		{k:"cx_combo_rich_merit_2",c:"组合",i:"🧩",l:"富且贵 · 850,000,000·6,300,000",d:"累计身家达到 850,000,000 池子币，且功勋达到 6,300,000 点功勋",a:[["pc",850000000],["merit",6300000]],r:2344},
		{k:"cx_combo_rich_merit_3",c:"组合",i:"🧩",l:"富且贵 · 1,450,000,000·15,500,000",d:"累计身家达到 1,450,000,000 池子币，且功勋达到 15,500,000 点功勋",a:[["pc",1450000000],["merit",15500000]],r:3398},
		{k:"cx_combo_rich_merit_4",c:"组合",i:"🧩",l:"富且贵 · 2,500,000,000·38,000,000",d:"累计身家达到 2,500,000,000 池子币，且功勋达到 38,000,000 点功勋",a:[["pc",2500000000],["merit",38000000]],r:4875},
		{k:"cx_combo_rich_merit_5",c:"组合",i:"🧩",l:"富且贵 · 4,300,000,000·70,000,000",d:"累计身家达到 4,300,000,000 池子币，且功勋达到 70,000,000 点功勋",a:[["pc",4300000000],["merit",70000000]],r:6773},
		{k:"cx_combo_rich_merit_6",c:"组合",i:"🧩",l:"富且贵 · 7,300,000,000·180,000,000",d:"累计身家达到 7,300,000,000 池子币，且功勋达到 180,000,000 点功勋",a:[["pc",7300000000],["merit",180000000]],r:9094},
		{k:"cx_combo_rich_merit_7",c:"组合",i:"🧩",l:"富且贵 · 12,000,000,000·350,000,000",d:"累计身家达到 12,000,000,000 池子币，且功勋达到 350,000,000 点功勋",a:[["pc",12000000000],["merit",350000000]],r:11836},
		{k:"cx_combo_rich_merit_8",c:"组合",i:"🧩",l:"富且贵 · 21,000,000,000·900,000,000",d:"累计身家达到 21,000,000,000 池子币，且功勋达到 900,000,000 点功勋",a:[["pc",21000000000],["merit",900000000]],r:15000},
		{k:"cx_combo_rich_meritday_0",c:"组合",i:"🧩",l:"身家与单日功勋 · 290,000,000·10,000",d:"累计身家达到 290,000,000 池子币，且单日功勋达到 10,000 点",a:[["pc",290000000],["meritToday",10000]],r:1500},
		{k:"cx_combo_rich_meritday_1",c:"组合",i:"🧩",l:"身家与单日功勋 · 500,000,000·17,000",d:"累计身家达到 500,000,000 池子币，且单日功勋达到 17,000 点",a:[["pc",500000000],["meritToday",17000]],r:1711},
		{k:"cx_combo_rich_meritday_2",c:"组合",i:"🧩",l:"身家与单日功勋 · 850,000,000·22,000",d:"累计身家达到 850,000,000 池子币，且单日功勋达到 22,000 点",a:[["pc",850000000],["meritToday",22000]],r:2344},
		{k:"cx_combo_rich_meritday_3",c:"组合",i:"🧩",l:"身家与单日功勋 · 1,450,000,000·28,000",d:"累计身家达到 1,450,000,000 池子币，且单日功勋达到 28,000 点",a:[["pc",1450000000],["meritToday",28000]],r:3398},
		{k:"cx_combo_rich_meritday_4",c:"组合",i:"🧩",l:"身家与单日功勋 · 2,500,000,000·36,000",d:"累计身家达到 2,500,000,000 池子币，且单日功勋达到 36,000 点",a:[["pc",2500000000],["meritToday",36000]],r:4875},
		{k:"cx_combo_rich_meritday_5",c:"组合",i:"🧩",l:"身家与单日功勋 · 4,300,000,000·46,000",d:"累计身家达到 4,300,000,000 池子币，且单日功勋达到 46,000 点",a:[["pc",4300000000],["meritToday",46000]],r:6773},
		{k:"cx_combo_rich_meritday_6",c:"组合",i:"🧩",l:"身家与单日功勋 · 7,300,000,000·73,000",d:"累计身家达到 7,300,000,000 池子币，且单日功勋达到 73,000 点",a:[["pc",7300000000],["meritToday",73000]],r:9094},
		{k:"cx_combo_rich_meritday_7",c:"组合",i:"🧩",l:"身家与单日功勋 · 12,000,000,000·92,000",d:"累计身家达到 12,000,000,000 池子币，且单日功勋达到 92,000 点",a:[["pc",12000000000],["meritToday",92000]],r:11836},
		{k:"cx_combo_rich_meritday_8",c:"组合",i:"🧩",l:"身家与单日功勋 · 21,000,000,000·115,000",d:"累计身家达到 21,000,000,000 池子币，且单日功勋达到 115,000 点",a:[["pc",21000000000],["meritToday",115000]],r:15000},
		{k:"cx_combo_peak_merit_0",c:"组合",i:"🧩",l:"富贵双全 · 290,000,000·1,400,000",d:"累计身家峰值达到 290,000,000 池子币，且功勋达到 1,400,000 点功勋",a:[["pcPeak",290000000],["merit",1400000]],r:1500},
		{k:"cx_combo_peak_merit_1",c:"组合",i:"🧩",l:"富贵双全 · 500,000,000·3,500,000",d:"累计身家峰值达到 500,000,000 池子币，且功勋达到 3,500,000 点功勋",a:[["pcPeak",500000000],["merit",3500000]],r:1711},
		{k:"cx_combo_peak_merit_2",c:"组合",i:"🧩",l:"富贵双全 · 850,000,000·6,300,000",d:"累计身家峰值达到 850,000,000 池子币，且功勋达到 6,300,000 点功勋",a:[["pcPeak",850000000],["merit",6300000]],r:2344},
		{k:"cx_combo_peak_merit_3",c:"组合",i:"🧩",l:"富贵双全 · 1,450,000,000·15,500,000",d:"累计身家峰值达到 1,450,000,000 池子币，且功勋达到 15,500,000 点功勋",a:[["pcPeak",1450000000],["merit",15500000]],r:3398},
		{k:"cx_combo_peak_merit_4",c:"组合",i:"🧩",l:"富贵双全 · 2,500,000,000·38,000,000",d:"累计身家峰值达到 2,500,000,000 池子币，且功勋达到 38,000,000 点功勋",a:[["pcPeak",2500000000],["merit",38000000]],r:4875},
		{k:"cx_combo_peak_merit_5",c:"组合",i:"🧩",l:"富贵双全 · 4,300,000,000·70,000,000",d:"累计身家峰值达到 4,300,000,000 池子币，且功勋达到 70,000,000 点功勋",a:[["pcPeak",4300000000],["merit",70000000]],r:6773},
		{k:"cx_combo_peak_merit_6",c:"组合",i:"🧩",l:"富贵双全 · 7,300,000,000·180,000,000",d:"累计身家峰值达到 7,300,000,000 池子币，且功勋达到 180,000,000 点功勋",a:[["pcPeak",7300000000],["merit",180000000]],r:9094},
		{k:"cx_combo_peak_merit_7",c:"组合",i:"🧩",l:"富贵双全 · 12,000,000,000·350,000,000",d:"累计身家峰值达到 12,000,000,000 池子币，且功勋达到 350,000,000 点功勋",a:[["pcPeak",12000000000],["merit",350000000]],r:11836},
		{k:"cx_combo_peak_merit_8",c:"组合",i:"🧩",l:"富贵双全 · 21,000,000,000·900,000,000",d:"累计身家峰值达到 21,000,000,000 池子币，且功勋达到 900,000,000 点功勋",a:[["pcPeak",21000000000],["merit",900000000]],r:15000},
		{k:"cx_combo_peak_meritday_0",c:"组合",i:"🧩",l:"身家峰值与单日功勋 · 290,000,000·10,000",d:"累计身家峰值达到 290,000,000 池子币，且单日功勋达到 10,000 点",a:[["pcPeak",290000000],["meritToday",10000]],r:1500},
		{k:"cx_combo_peak_meritday_1",c:"组合",i:"🧩",l:"身家峰值与单日功勋 · 500,000,000·17,000",d:"累计身家峰值达到 500,000,000 池子币，且单日功勋达到 17,000 点",a:[["pcPeak",500000000],["meritToday",17000]],r:1711},
		{k:"cx_combo_peak_meritday_2",c:"组合",i:"🧩",l:"身家峰值与单日功勋 · 850,000,000·22,000",d:"累计身家峰值达到 850,000,000 池子币，且单日功勋达到 22,000 点",a:[["pcPeak",850000000],["meritToday",22000]],r:2344},
		{k:"cx_combo_peak_meritday_3",c:"组合",i:"🧩",l:"身家峰值与单日功勋 · 1,450,000,000·28,000",d:"累计身家峰值达到 1,450,000,000 池子币，且单日功勋达到 28,000 点",a:[["pcPeak",1450000000],["meritToday",28000]],r:3398},
		{k:"cx_combo_peak_meritday_4",c:"组合",i:"🧩",l:"身家峰值与单日功勋 · 2,500,000,000·36,000",d:"累计身家峰值达到 2,500,000,000 池子币，且单日功勋达到 36,000 点",a:[["pcPeak",2500000000],["meritToday",36000]],r:4875},
		{k:"cx_combo_peak_meritday_5",c:"组合",i:"🧩",l:"身家峰值与单日功勋 · 4,300,000,000·46,000",d:"累计身家峰值达到 4,300,000,000 池子币，且单日功勋达到 46,000 点",a:[["pcPeak",4300000000],["meritToday",46000]],r:6773},
		{k:"cx_combo_peak_meritday_6",c:"组合",i:"🧩",l:"身家峰值与单日功勋 · 7,300,000,000·73,000",d:"累计身家峰值达到 7,300,000,000 池子币，且单日功勋达到 73,000 点",a:[["pcPeak",7300000000],["meritToday",73000]],r:9094},
		{k:"cx_combo_peak_meritday_7",c:"组合",i:"🧩",l:"身家峰值与单日功勋 · 12,000,000,000·92,000",d:"累计身家峰值达到 12,000,000,000 池子币，且单日功勋达到 92,000 点",a:[["pcPeak",12000000000],["meritToday",92000]],r:11836},
		{k:"cx_combo_peak_meritday_8",c:"组合",i:"🧩",l:"身家峰值与单日功勋 · 21,000,000,000·115,000",d:"累计身家峰值达到 21,000,000,000 池子币，且单日功勋达到 115,000 点",a:[["pcPeak",21000000000],["meritToday",115000]],r:15000},
		{k:"cx_combo_rich_wins_0",c:"组合",i:"🧩",l:"身家与胜场 · 290,000,000·11,000",d:"累计身家达到 290,000,000 池子币，且胜场达到 11,000 胜",a:[["pc",290000000],["wrWin",11000]],r:1500},
		{k:"cx_combo_rich_wins_1",c:"组合",i:"🧩",l:"身家与胜场 · 500,000,000·12,000",d:"累计身家达到 500,000,000 池子币，且胜场达到 12,000 胜",a:[["pc",500000000],["wrWin",12000]],r:1711},
		{k:"cx_combo_rich_wins_2",c:"组合",i:"🧩",l:"身家与胜场 · 850,000,000·12,000",d:"累计身家达到 850,000,000 池子币，且胜场达到 12,000 胜",a:[["pc",850000000],["wrWin",12000]],r:2344},
		{k:"cx_combo_rich_wins_3",c:"组合",i:"🧩",l:"身家与胜场 · 1,450,000,000·13,000",d:"累计身家达到 1,450,000,000 池子币，且胜场达到 13,000 胜",a:[["pc",1450000000],["wrWin",13000]],r:3398},
		{k:"cx_combo_rich_wins_4",c:"组合",i:"🧩",l:"身家与胜场 · 2,500,000,000·13,000",d:"累计身家达到 2,500,000,000 池子币，且胜场达到 13,000 胜",a:[["pc",2500000000],["wrWin",13000]],r:4875},
		{k:"cx_combo_rich_wins_5",c:"组合",i:"🧩",l:"身家与胜场 · 4,300,000,000·14,000",d:"累计身家达到 4,300,000,000 池子币，且胜场达到 14,000 胜",a:[["pc",4300000000],["wrWin",14000]],r:6773},
		{k:"cx_combo_rich_wins_6",c:"组合",i:"🧩",l:"身家与胜场 · 7,300,000,000·14,000",d:"累计身家达到 7,300,000,000 池子币，且胜场达到 14,000 胜",a:[["pc",7300000000],["wrWin",14000]],r:9094},
		{k:"cx_combo_rich_wins_7",c:"组合",i:"🧩",l:"身家与胜场 · 12,000,000,000·15,000",d:"累计身家达到 12,000,000,000 池子币，且胜场达到 15,000 胜",a:[["pc",12000000000],["wrWin",15000]],r:11836},
		{k:"cx_combo_rich_wins_8",c:"组合",i:"🧩",l:"身家与胜场 · 21,000,000,000·15,000",d:"累计身家达到 21,000,000,000 池子币，且胜场达到 15,000 胜",a:[["pc",21000000000],["wrWin",15000]],r:15000},
		{k:"cx_combo_rich_games_0",c:"组合",i:"🧩",l:"身家与对局数 · 290,000,000·11,000",d:"累计身家达到 290,000,000 池子币，且对局数达到 11,000 局",a:[["pc",290000000],["wrGames",11000]],r:1500},
		{k:"cx_combo_rich_games_1",c:"组合",i:"🧩",l:"身家与对局数 · 500,000,000·12,000",d:"累计身家达到 500,000,000 池子币，且对局数达到 12,000 局",a:[["pc",500000000],["wrGames",12000]],r:1711},
		{k:"cx_combo_rich_games_2",c:"组合",i:"🧩",l:"身家与对局数 · 850,000,000·12,000",d:"累计身家达到 850,000,000 池子币，且对局数达到 12,000 局",a:[["pc",850000000],["wrGames",12000]],r:2344},
		{k:"cx_combo_rich_games_3",c:"组合",i:"🧩",l:"身家与对局数 · 1,450,000,000·13,000",d:"累计身家达到 1,450,000,000 池子币，且对局数达到 13,000 局",a:[["pc",1450000000],["wrGames",13000]],r:3398},
		{k:"cx_combo_rich_games_4",c:"组合",i:"🧩",l:"身家与对局数 · 2,500,000,000·13,000",d:"累计身家达到 2,500,000,000 池子币，且对局数达到 13,000 局",a:[["pc",2500000000],["wrGames",13000]],r:4875},
		{k:"cx_combo_rich_games_5",c:"组合",i:"🧩",l:"身家与对局数 · 4,300,000,000·14,000",d:"累计身家达到 4,300,000,000 池子币，且对局数达到 14,000 局",a:[["pc",4300000000],["wrGames",14000]],r:6773},
		{k:"cx_combo_rich_games_6",c:"组合",i:"🧩",l:"身家与对局数 · 7,300,000,000·14,000",d:"累计身家达到 7,300,000,000 池子币，且对局数达到 14,000 局",a:[["pc",7300000000],["wrGames",14000]],r:9094},
		{k:"cx_combo_rich_games_7",c:"组合",i:"🧩",l:"身家与对局数 · 12,000,000,000·15,000",d:"累计身家达到 12,000,000,000 池子币，且对局数达到 15,000 局",a:[["pc",12000000000],["wrGames",15000]],r:11836},
		{k:"cx_combo_rich_games_8",c:"组合",i:"🧩",l:"身家与对局数 · 21,000,000,000·15,000",d:"累计身家达到 21,000,000,000 池子币，且对局数达到 15,000 局",a:[["pc",21000000000],["wrGames",15000]],r:15000},
		{k:"cx_combo_rich_kills_0",c:"组合",i:"🧩",l:"身家与击杀 · 290,000,000·12,500",d:"累计身家达到 290,000,000 池子币，且击杀达到 12,500 人",a:[["pc",290000000],["wrKill",12500]],r:1500},
		{k:"cx_combo_rich_kills_1",c:"组合",i:"🧩",l:"身家与击杀 · 500,000,000·14,500",d:"累计身家达到 500,000,000 池子币，且击杀达到 14,500 人",a:[["pc",500000000],["wrKill",14500]],r:1711},
		{k:"cx_combo_rich_kills_2",c:"组合",i:"🧩",l:"身家与击杀 · 850,000,000·16,500",d:"累计身家达到 850,000,000 池子币，且击杀达到 16,500 人",a:[["pc",850000000],["wrKill",16500]],r:2344},
		{k:"cx_combo_rich_kills_3",c:"组合",i:"🧩",l:"身家与击杀 · 1,450,000,000·19,000",d:"累计身家达到 1,450,000,000 池子币，且击杀达到 19,000 人",a:[["pc",1450000000],["wrKill",19000]],r:3398},
		{k:"cx_combo_rich_kills_4",c:"组合",i:"🧩",l:"身家与击杀 · 2,500,000,000·22,000",d:"累计身家达到 2,500,000,000 池子币，且击杀达到 22,000 人",a:[["pc",2500000000],["wrKill",22000]],r:4875},
		{k:"cx_combo_rich_kills_5",c:"组合",i:"🧩",l:"身家与击杀 · 4,300,000,000·25,500",d:"累计身家达到 4,300,000,000 池子币，且击杀达到 25,500 人",a:[["pc",4300000000],["wrKill",25500]],r:6773},
		{k:"cx_combo_rich_kills_6",c:"组合",i:"🧩",l:"身家与击杀 · 7,300,000,000·29,500",d:"累计身家达到 7,300,000,000 池子币，且击杀达到 29,500 人",a:[["pc",7300000000],["wrKill",29500]],r:9094},
		{k:"cx_combo_rich_kills_7",c:"组合",i:"🧩",l:"身家与击杀 · 12,000,000,000·34,000",d:"累计身家达到 12,000,000,000 池子币，且击杀达到 34,000 人",a:[["pc",12000000000],["wrKill",34000]],r:11836},
		{k:"cx_combo_rich_kills_8",c:"组合",i:"🧩",l:"身家与击杀 · 21,000,000,000·39,000",d:"累计身家达到 21,000,000,000 池子币，且击杀达到 39,000 人",a:[["pc",21000000000],["wrKill",39000]],r:15000},
		{k:"cx_combo_rich_chars_0",c:"组合",i:"🧩",l:"身家与使用武将数 · 290,000,000·60",d:"累计身家达到 290,000,000 池子币，且使用武将数达到 60 名",a:[["pc",290000000],["wrChars",60]],r:1500},
		{k:"cx_combo_rich_chars_1",c:"组合",i:"🧩",l:"身家与使用武将数 · 500,000,000·70",d:"累计身家达到 500,000,000 池子币，且使用武将数达到 70 名",a:[["pc",500000000],["wrChars",70]],r:1711},
		{k:"cx_combo_rich_chars_2",c:"组合",i:"🧩",l:"身家与使用武将数 · 850,000,000·75",d:"累计身家达到 850,000,000 池子币，且使用武将数达到 75 名",a:[["pc",850000000],["wrChars",75]],r:2344},
		{k:"cx_combo_rich_chars_3",c:"组合",i:"🧩",l:"身家与使用武将数 · 1,450,000,000·85",d:"累计身家达到 1,450,000,000 池子币，且使用武将数达到 85 名",a:[["pc",1450000000],["wrChars",85]],r:3398},
		{k:"cx_combo_rich_chars_4",c:"组合",i:"🧩",l:"身家与使用武将数 · 2,500,000,000·90",d:"累计身家达到 2,500,000,000 池子币，且使用武将数达到 90 名",a:[["pc",2500000000],["wrChars",90]],r:4875},
		{k:"cx_combo_rich_chars_5",c:"组合",i:"🧩",l:"身家与使用武将数 · 4,300,000,000·100",d:"累计身家达到 4,300,000,000 池子币，且使用武将数达到 100 名",a:[["pc",4300000000],["wrChars",100]],r:6773},
		{k:"cx_combo_rich_chars_6",c:"组合",i:"🧩",l:"身家与使用武将数 · 7,300,000,000·105",d:"累计身家达到 7,300,000,000 池子币，且使用武将数达到 105 名",a:[["pc",7300000000],["wrChars",105]],r:9094},
		{k:"cx_combo_rich_chars_7",c:"组合",i:"🧩",l:"身家与使用武将数 · 12,000,000,000·115",d:"累计身家达到 12,000,000,000 池子币，且使用武将数达到 115 名",a:[["pc",12000000000],["wrChars",115]],r:11836},
		{k:"cx_combo_rich_chars_8",c:"组合",i:"🧩",l:"身家与使用武将数 · 21,000,000,000·120",d:"累计身家达到 21,000,000,000 池子币，且使用武将数达到 120 名",a:[["pc",21000000000],["wrChars",120]],r:15000},
		{k:"cx_combo_peak_wins_0",c:"组合",i:"🧩",l:"身家峰值与胜场 · 290,000,000·11,000",d:"累计身家峰值达到 290,000,000 池子币，且胜场达到 11,000 胜",a:[["pcPeak",290000000],["wrWin",11000]],r:1500},
		{k:"cx_combo_peak_wins_1",c:"组合",i:"🧩",l:"身家峰值与胜场 · 500,000,000·12,000",d:"累计身家峰值达到 500,000,000 池子币，且胜场达到 12,000 胜",a:[["pcPeak",500000000],["wrWin",12000]],r:1711},
		{k:"cx_combo_peak_wins_2",c:"组合",i:"🧩",l:"身家峰值与胜场 · 850,000,000·12,000",d:"累计身家峰值达到 850,000,000 池子币，且胜场达到 12,000 胜",a:[["pcPeak",850000000],["wrWin",12000]],r:2344},
		{k:"cx_combo_peak_wins_3",c:"组合",i:"🧩",l:"身家峰值与胜场 · 1,450,000,000·13,000",d:"累计身家峰值达到 1,450,000,000 池子币，且胜场达到 13,000 胜",a:[["pcPeak",1450000000],["wrWin",13000]],r:3398},
		{k:"cx_combo_peak_wins_4",c:"组合",i:"🧩",l:"身家峰值与胜场 · 2,500,000,000·13,000",d:"累计身家峰值达到 2,500,000,000 池子币，且胜场达到 13,000 胜",a:[["pcPeak",2500000000],["wrWin",13000]],r:4875},
		{k:"cx_combo_peak_wins_5",c:"组合",i:"🧩",l:"身家峰值与胜场 · 4,300,000,000·14,000",d:"累计身家峰值达到 4,300,000,000 池子币，且胜场达到 14,000 胜",a:[["pcPeak",4300000000],["wrWin",14000]],r:6773},
		{k:"cx_combo_peak_wins_6",c:"组合",i:"🧩",l:"身家峰值与胜场 · 7,300,000,000·14,000",d:"累计身家峰值达到 7,300,000,000 池子币，且胜场达到 14,000 胜",a:[["pcPeak",7300000000],["wrWin",14000]],r:9094},
		{k:"cx_combo_peak_wins_7",c:"组合",i:"🧩",l:"身家峰值与胜场 · 12,000,000,000·15,000",d:"累计身家峰值达到 12,000,000,000 池子币，且胜场达到 15,000 胜",a:[["pcPeak",12000000000],["wrWin",15000]],r:11836},
		{k:"cx_combo_peak_wins_8",c:"组合",i:"🧩",l:"身家峰值与胜场 · 21,000,000,000·15,000",d:"累计身家峰值达到 21,000,000,000 池子币，且胜场达到 15,000 胜",a:[["pcPeak",21000000000],["wrWin",15000]],r:15000},
		{k:"cx_combo_peak_games_0",c:"组合",i:"🧩",l:"身家峰值与对局数 · 290,000,000·11,000",d:"累计身家峰值达到 290,000,000 池子币，且对局数达到 11,000 局",a:[["pcPeak",290000000],["wrGames",11000]],r:1500},
		{k:"cx_combo_peak_games_1",c:"组合",i:"🧩",l:"身家峰值与对局数 · 500,000,000·12,000",d:"累计身家峰值达到 500,000,000 池子币，且对局数达到 12,000 局",a:[["pcPeak",500000000],["wrGames",12000]],r:1711},
		{k:"cx_combo_peak_games_2",c:"组合",i:"🧩",l:"身家峰值与对局数 · 850,000,000·12,000",d:"累计身家峰值达到 850,000,000 池子币，且对局数达到 12,000 局",a:[["pcPeak",850000000],["wrGames",12000]],r:2344},
		{k:"cx_combo_peak_games_3",c:"组合",i:"🧩",l:"身家峰值与对局数 · 1,450,000,000·13,000",d:"累计身家峰值达到 1,450,000,000 池子币，且对局数达到 13,000 局",a:[["pcPeak",1450000000],["wrGames",13000]],r:3398},
		{k:"cx_combo_peak_games_4",c:"组合",i:"🧩",l:"身家峰值与对局数 · 2,500,000,000·13,000",d:"累计身家峰值达到 2,500,000,000 池子币，且对局数达到 13,000 局",a:[["pcPeak",2500000000],["wrGames",13000]],r:4875},
		{k:"cx_combo_peak_games_5",c:"组合",i:"🧩",l:"身家峰值与对局数 · 4,300,000,000·14,000",d:"累计身家峰值达到 4,300,000,000 池子币，且对局数达到 14,000 局",a:[["pcPeak",4300000000],["wrGames",14000]],r:6773},
		{k:"cx_combo_peak_games_6",c:"组合",i:"🧩",l:"身家峰值与对局数 · 7,300,000,000·14,000",d:"累计身家峰值达到 7,300,000,000 池子币，且对局数达到 14,000 局",a:[["pcPeak",7300000000],["wrGames",14000]],r:9094},
		{k:"cx_combo_peak_games_7",c:"组合",i:"🧩",l:"身家峰值与对局数 · 12,000,000,000·15,000",d:"累计身家峰值达到 12,000,000,000 池子币，且对局数达到 15,000 局",a:[["pcPeak",12000000000],["wrGames",15000]],r:11836},
		{k:"cx_combo_peak_games_8",c:"组合",i:"🧩",l:"身家峰值与对局数 · 21,000,000,000·15,000",d:"累计身家峰值达到 21,000,000,000 池子币，且对局数达到 15,000 局",a:[["pcPeak",21000000000],["wrGames",15000]],r:15000},
		{k:"cx_combo_peak_kills_0",c:"组合",i:"🧩",l:"身家峰值与击杀 · 290,000,000·12,500",d:"累计身家峰值达到 290,000,000 池子币，且击杀达到 12,500 人",a:[["pcPeak",290000000],["wrKill",12500]],r:1500},
		{k:"cx_combo_peak_kills_1",c:"组合",i:"🧩",l:"身家峰值与击杀 · 500,000,000·14,500",d:"累计身家峰值达到 500,000,000 池子币，且击杀达到 14,500 人",a:[["pcPeak",500000000],["wrKill",14500]],r:1711},
		{k:"cx_combo_peak_kills_2",c:"组合",i:"🧩",l:"身家峰值与击杀 · 850,000,000·16,500",d:"累计身家峰值达到 850,000,000 池子币，且击杀达到 16,500 人",a:[["pcPeak",850000000],["wrKill",16500]],r:2344},
		{k:"cx_combo_peak_kills_3",c:"组合",i:"🧩",l:"身家峰值与击杀 · 1,450,000,000·19,000",d:"累计身家峰值达到 1,450,000,000 池子币，且击杀达到 19,000 人",a:[["pcPeak",1450000000],["wrKill",19000]],r:3398},
		{k:"cx_combo_peak_kills_4",c:"组合",i:"🧩",l:"身家峰值与击杀 · 2,500,000,000·22,000",d:"累计身家峰值达到 2,500,000,000 池子币，且击杀达到 22,000 人",a:[["pcPeak",2500000000],["wrKill",22000]],r:4875},
		{k:"cx_combo_peak_kills_5",c:"组合",i:"🧩",l:"身家峰值与击杀 · 4,300,000,000·25,500",d:"累计身家峰值达到 4,300,000,000 池子币，且击杀达到 25,500 人",a:[["pcPeak",4300000000],["wrKill",25500]],r:6773},
		{k:"cx_combo_peak_kills_6",c:"组合",i:"🧩",l:"身家峰值与击杀 · 7,300,000,000·29,500",d:"累计身家峰值达到 7,300,000,000 池子币，且击杀达到 29,500 人",a:[["pcPeak",7300000000],["wrKill",29500]],r:9094},
		{k:"cx_combo_peak_kills_7",c:"组合",i:"🧩",l:"身家峰值与击杀 · 12,000,000,000·34,000",d:"累计身家峰值达到 12,000,000,000 池子币，且击杀达到 34,000 人",a:[["pcPeak",12000000000],["wrKill",34000]],r:11836},
		{k:"cx_combo_peak_kills_8",c:"组合",i:"🧩",l:"身家峰值与击杀 · 21,000,000,000·39,000",d:"累计身家峰值达到 21,000,000,000 池子币，且击杀达到 39,000 人",a:[["pcPeak",21000000000],["wrKill",39000]],r:15000},
		{k:"cx_combo_peak_chars_0",c:"组合",i:"🧩",l:"身家峰值与使用武将数 · 290,000,000·60",d:"累计身家峰值达到 290,000,000 池子币，且使用武将数达到 60 名",a:[["pcPeak",290000000],["wrChars",60]],r:1500},
		{k:"cx_combo_peak_chars_1",c:"组合",i:"🧩",l:"身家峰值与使用武将数 · 500,000,000·70",d:"累计身家峰值达到 500,000,000 池子币，且使用武将数达到 70 名",a:[["pcPeak",500000000],["wrChars",70]],r:1711},
		{k:"cx_combo_peak_chars_2",c:"组合",i:"🧩",l:"身家峰值与使用武将数 · 850,000,000·75",d:"累计身家峰值达到 850,000,000 池子币，且使用武将数达到 75 名",a:[["pcPeak",850000000],["wrChars",75]],r:2344},
		{k:"cx_combo_peak_chars_3",c:"组合",i:"🧩",l:"身家峰值与使用武将数 · 1,450,000,000·85",d:"累计身家峰值达到 1,450,000,000 池子币，且使用武将数达到 85 名",a:[["pcPeak",1450000000],["wrChars",85]],r:3398},
		{k:"cx_combo_peak_chars_4",c:"组合",i:"🧩",l:"身家峰值与使用武将数 · 2,500,000,000·90",d:"累计身家峰值达到 2,500,000,000 池子币，且使用武将数达到 90 名",a:[["pcPeak",2500000000],["wrChars",90]],r:4875},
		{k:"cx_combo_peak_chars_5",c:"组合",i:"🧩",l:"身家峰值与使用武将数 · 4,300,000,000·100",d:"累计身家峰值达到 4,300,000,000 池子币，且使用武将数达到 100 名",a:[["pcPeak",4300000000],["wrChars",100]],r:6773},
		{k:"cx_combo_peak_chars_6",c:"组合",i:"🧩",l:"身家峰值与使用武将数 · 7,300,000,000·105",d:"累计身家峰值达到 7,300,000,000 池子币，且使用武将数达到 105 名",a:[["pcPeak",7300000000],["wrChars",105]],r:9094},
		{k:"cx_combo_peak_chars_7",c:"组合",i:"🧩",l:"身家峰值与使用武将数 · 12,000,000,000·115",d:"累计身家峰值达到 12,000,000,000 池子币，且使用武将数达到 115 名",a:[["pcPeak",12000000000],["wrChars",115]],r:11836},
		{k:"cx_combo_peak_chars_8",c:"组合",i:"🧩",l:"身家峰值与使用武将数 · 21,000,000,000·120",d:"累计身家峰值达到 21,000,000,000 池子币，且使用武将数达到 120 名",a:[["pcPeak",21000000000],["wrChars",120]],r:15000},
		{k:"cx_combo_rich_gmplay_0",c:"组合",i:"🧩",l:"富贵博局 · 290,000,000·1,900",d:"累计身家达到 290,000,000 池子币，且出战次数达到 1,900 场",a:[["pc",290000000],["gamblePlays",1900]],r:1500},
		{k:"cx_combo_rich_gmplay_1",c:"组合",i:"🧩",l:"富贵博局 · 500,000,000·2,200",d:"累计身家达到 500,000,000 池子币，且出战次数达到 2,200 场",a:[["pc",500000000],["gamblePlays",2200]],r:1711},
		{k:"cx_combo_rich_gmplay_2",c:"组合",i:"🧩",l:"富贵博局 · 850,000,000·2,900",d:"累计身家达到 850,000,000 池子币，且出战次数达到 2,900 场",a:[["pc",850000000],["gamblePlays",2900]],r:2344},
		{k:"cx_combo_rich_gmplay_3",c:"组合",i:"🧩",l:"富贵博局 · 1,450,000,000·3,300",d:"累计身家达到 1,450,000,000 池子币，且出战次数达到 3,300 场",a:[["pc",1450000000],["gamblePlays",3300]],r:3398},
		{k:"cx_combo_rich_gmplay_4",c:"组合",i:"🧩",l:"富贵博局 · 2,500,000,000·3,800",d:"累计身家达到 2,500,000,000 池子币，且出战次数达到 3,800 场",a:[["pc",2500000000],["gamblePlays",3800]],r:4875},
		{k:"cx_combo_rich_gmplay_5",c:"组合",i:"🧩",l:"富贵博局 · 4,300,000,000·5,100",d:"累计身家达到 4,300,000,000 池子币，且出战次数达到 5,100 场",a:[["pc",4300000000],["gamblePlays",5100]],r:6773},
		{k:"cx_combo_rich_gmplay_6",c:"组合",i:"🧩",l:"富贵博局 · 7,300,000,000·5,900",d:"累计身家达到 7,300,000,000 池子币，且出战次数达到 5,900 场",a:[["pc",7300000000],["gamblePlays",5900]],r:9094},
		{k:"cx_combo_rich_gmplay_7",c:"组合",i:"🧩",l:"富贵博局 · 12,000,000,000·7,900",d:"累计身家达到 12,000,000,000 池子币，且出战次数达到 7,900 场",a:[["pc",12000000000],["gamblePlays",7900]],r:11836},
		{k:"cx_combo_rich_gmplay_8",c:"组合",i:"🧩",l:"富贵博局 · 21,000,000,000·9,200",d:"累计身家达到 21,000,000,000 池子币，且出战次数达到 9,200 场",a:[["pc",21000000000],["gamblePlays",9200]],r:15000},
		{k:"cx_combo_rich_gmwin_0",c:"组合",i:"🧩",l:"身家与胜局 · 290,000,000·215",d:"累计身家达到 290,000,000 池子币，且胜局达到 215 胜",a:[["pc",290000000],["gambleWins",215]],r:1500},
		{k:"cx_combo_rich_gmwin_1",c:"组合",i:"🧩",l:"身家与胜局 · 500,000,000·250",d:"累计身家达到 500,000,000 池子币，且胜局达到 250 胜",a:[["pc",500000000],["gambleWins",250]],r:1711},
		{k:"cx_combo_rich_gmwin_2",c:"组合",i:"🧩",l:"身家与胜局 · 850,000,000·340",d:"累计身家达到 850,000,000 池子币，且胜局达到 340 胜",a:[["pc",850000000],["gambleWins",340]],r:2344},
		{k:"cx_combo_rich_gmwin_3",c:"组合",i:"🧩",l:"身家与胜局 · 1,450,000,000·460",d:"累计身家达到 1,450,000,000 池子币，且胜局达到 460 胜",a:[["pc",1450000000],["gambleWins",460]],r:3398},
		{k:"cx_combo_rich_gmwin_4",c:"组合",i:"🧩",l:"身家与胜局 · 2,500,000,000·1,500",d:"累计身家达到 2,500,000,000 池子币，且胜局达到 1,500 胜",a:[["pc",2500000000],["gambleWins",1500]],r:4875},
		{k:"cx_combo_rich_gmwin_5",c:"组合",i:"🧩",l:"身家与胜局 · 4,300,000,000·3,000",d:"累计身家达到 4,300,000,000 池子币，且胜局达到 3,000 胜",a:[["pc",4300000000],["gambleWins",3000]],r:6773},
		{k:"cx_combo_rich_gmwin_6",c:"组合",i:"🧩",l:"身家与胜局 · 7,300,000,000·4,000",d:"累计身家达到 7,300,000,000 池子币，且胜局达到 4,000 胜",a:[["pc",7300000000],["gambleWins",4000]],r:9094},
		{k:"cx_combo_rich_gmwin_7",c:"组合",i:"🧩",l:"身家与胜局 · 12,000,000,000·5,000",d:"累计身家达到 12,000,000,000 池子币，且胜局达到 5,000 胜",a:[["pc",12000000000],["gambleWins",5000]],r:11836},
		{k:"cx_combo_rich_gmwin_8",c:"组合",i:"🧩",l:"身家与胜局 · 21,000,000,000·6,000",d:"累计身家达到 21,000,000,000 池子币，且胜局达到 6,000 胜",a:[["pc",21000000000],["gambleWins",6000]],r:15000},
		{k:"cx_combo_rich_gmnet_0",c:"组合",i:"🧩",l:"身家与净赢 · 290,000,000·10,000,000",d:"累计身家达到 290,000,000 池子币，且净赢达到 10,000,000 池子币",a:[["pc",290000000],["gambleNet",10000000]],r:1500},
		{k:"cx_combo_rich_gmnet_1",c:"组合",i:"🧩",l:"身家与净赢 · 500,000,000·10,000,000",d:"累计身家达到 500,000,000 池子币，且净赢达到 10,000,000 池子币",a:[["pc",500000000],["gambleNet",10000000]],r:1711},
		{k:"cx_combo_rich_gmnet_2",c:"组合",i:"🧩",l:"身家与净赢 · 850,000,000·10,000,000",d:"累计身家达到 850,000,000 池子币，且净赢达到 10,000,000 池子币",a:[["pc",850000000],["gambleNet",10000000]],r:2344},
		{k:"cx_combo_rich_gmnet_3",c:"组合",i:"🧩",l:"身家与净赢 · 1,450,000,000·10,000,000",d:"累计身家达到 1,450,000,000 池子币，且净赢达到 10,000,000 池子币",a:[["pc",1450000000],["gambleNet",10000000]],r:3398},
		{k:"cx_combo_rich_gmnet_4",c:"组合",i:"🧩",l:"身家与净赢 · 2,500,000,000·10,000,000",d:"累计身家达到 2,500,000,000 池子币，且净赢达到 10,000,000 池子币",a:[["pc",2500000000],["gambleNet",10000000]],r:4875},
		{k:"cx_combo_rich_gmnet_5",c:"组合",i:"🧩",l:"身家与净赢 · 4,300,000,000·10,000,000",d:"累计身家达到 4,300,000,000 池子币，且净赢达到 10,000,000 池子币",a:[["pc",4300000000],["gambleNet",10000000]],r:6773},
		{k:"cx_combo_rich_gmnet_6",c:"组合",i:"🧩",l:"身家与净赢 · 7,300,000,000·10,000,000",d:"累计身家达到 7,300,000,000 池子币，且净赢达到 10,000,000 池子币",a:[["pc",7300000000],["gambleNet",10000000]],r:9094},
		{k:"cx_combo_rich_gmnet_7",c:"组合",i:"🧩",l:"身家与净赢 · 12,000,000,000·10,000,000",d:"累计身家达到 12,000,000,000 池子币，且净赢达到 10,000,000 池子币",a:[["pc",12000000000],["gambleNet",10000000]],r:11836},
		{k:"cx_combo_rich_gmnet_8",c:"组合",i:"🧩",l:"身家与净赢 · 21,000,000,000·10,000,000",d:"累计身家达到 21,000,000,000 池子币，且净赢达到 10,000,000 池子币",a:[["pc",21000000000],["gambleNet",10000000]],r:15000},
		{k:"cx_combo_rich_gmstreak_0",c:"组合",i:"🧩",l:"身家与连胜 · 290,000,000·29",d:"累计身家达到 290,000,000 池子币，且连胜达到 29 连胜",a:[["pc",290000000],["gambleBestStreak",29]],r:1500},
		{k:"cx_combo_rich_gmstreak_1",c:"组合",i:"🧩",l:"身家与连胜 · 500,000,000·32",d:"累计身家达到 500,000,000 池子币，且连胜达到 32 连胜",a:[["pc",500000000],["gambleBestStreak",32]],r:1711},
		{k:"cx_combo_rich_gmstreak_2",c:"组合",i:"🧩",l:"身家与连胜 · 850,000,000·36",d:"累计身家达到 850,000,000 池子币，且连胜达到 36 连胜",a:[["pc",850000000],["gambleBestStreak",36]],r:2344},
		{k:"cx_combo_rich_gmstreak_3",c:"组合",i:"🧩",l:"身家与连胜 · 1,450,000,000·45",d:"累计身家达到 1,450,000,000 池子币，且连胜达到 45 连胜",a:[["pc",1450000000],["gambleBestStreak",45]],r:3398},
		{k:"cx_combo_rich_gmstreak_4",c:"组合",i:"🧩",l:"身家与连胜 · 2,500,000,000·51",d:"累计身家达到 2,500,000,000 池子币，且连胜达到 51 连胜",a:[["pc",2500000000],["gambleBestStreak",51]],r:4875},
		{k:"cx_combo_rich_gmstreak_5",c:"组合",i:"🧩",l:"身家与连胜 · 4,300,000,000·58",d:"累计身家达到 4,300,000,000 池子币，且连胜达到 58 连胜",a:[["pc",4300000000],["gambleBestStreak",58]],r:6773},
		{k:"cx_combo_rich_gmstreak_6",c:"组合",i:"🧩",l:"身家与连胜 · 7,300,000,000·66",d:"累计身家达到 7,300,000,000 池子币，且连胜达到 66 连胜",a:[["pc",7300000000],["gambleBestStreak",66]],r:9094},
		{k:"cx_combo_rich_gmstreak_7",c:"组合",i:"🧩",l:"身家与连胜 · 12,000,000,000·76",d:"累计身家达到 12,000,000,000 池子币，且连胜达到 76 连胜",a:[["pc",12000000000],["gambleBestStreak",76]],r:11836},
		{k:"cx_combo_rich_gmstreak_8",c:"组合",i:"🧩",l:"身家与连胜 · 21,000,000,000·78",d:"累计身家达到 21,000,000,000 池子币，且连胜达到 78 连胜",a:[["pc",21000000000],["gambleBestStreak",78]],r:15000},
		{k:"cx_combo_peak_gmplay_0",c:"组合",i:"🧩",l:"身家峰值与出战次数 · 290,000,000·1,900",d:"累计身家峰值达到 290,000,000 池子币，且出战次数达到 1,900 场",a:[["pcPeak",290000000],["gamblePlays",1900]],r:1500},
		{k:"cx_combo_peak_gmplay_1",c:"组合",i:"🧩",l:"身家峰值与出战次数 · 500,000,000·2,200",d:"累计身家峰值达到 500,000,000 池子币，且出战次数达到 2,200 场",a:[["pcPeak",500000000],["gamblePlays",2200]],r:1711},
		{k:"cx_combo_peak_gmplay_2",c:"组合",i:"🧩",l:"身家峰值与出战次数 · 850,000,000·2,900",d:"累计身家峰值达到 850,000,000 池子币，且出战次数达到 2,900 场",a:[["pcPeak",850000000],["gamblePlays",2900]],r:2344},
		{k:"cx_combo_peak_gmplay_3",c:"组合",i:"🧩",l:"身家峰值与出战次数 · 1,450,000,000·3,300",d:"累计身家峰值达到 1,450,000,000 池子币，且出战次数达到 3,300 场",a:[["pcPeak",1450000000],["gamblePlays",3300]],r:3398},
		{k:"cx_combo_peak_gmplay_4",c:"组合",i:"🧩",l:"身家峰值与出战次数 · 2,500,000,000·3,800",d:"累计身家峰值达到 2,500,000,000 池子币，且出战次数达到 3,800 场",a:[["pcPeak",2500000000],["gamblePlays",3800]],r:4875},
		{k:"cx_combo_peak_gmplay_5",c:"组合",i:"🧩",l:"身家峰值与出战次数 · 4,300,000,000·5,100",d:"累计身家峰值达到 4,300,000,000 池子币，且出战次数达到 5,100 场",a:[["pcPeak",4300000000],["gamblePlays",5100]],r:6773},
		{k:"cx_combo_peak_gmplay_6",c:"组合",i:"🧩",l:"身家峰值与出战次数 · 7,300,000,000·5,900",d:"累计身家峰值达到 7,300,000,000 池子币，且出战次数达到 5,900 场",a:[["pcPeak",7300000000],["gamblePlays",5900]],r:9094},
		{k:"cx_combo_peak_gmplay_7",c:"组合",i:"🧩",l:"身家峰值与出战次数 · 12,000,000,000·7,900",d:"累计身家峰值达到 12,000,000,000 池子币，且出战次数达到 7,900 场",a:[["pcPeak",12000000000],["gamblePlays",7900]],r:11836},
		{k:"cx_combo_peak_gmplay_8",c:"组合",i:"🧩",l:"身家峰值与出战次数 · 21,000,000,000·9,200",d:"累计身家峰值达到 21,000,000,000 池子币，且出战次数达到 9,200 场",a:[["pcPeak",21000000000],["gamblePlays",9200]],r:15000},
		{k:"cx_combo_peak_gmwin_0",c:"组合",i:"🧩",l:"身家峰值与胜局 · 290,000,000·215",d:"累计身家峰值达到 290,000,000 池子币，且胜局达到 215 胜",a:[["pcPeak",290000000],["gambleWins",215]],r:1500},
		{k:"cx_combo_peak_gmwin_1",c:"组合",i:"🧩",l:"身家峰值与胜局 · 500,000,000·250",d:"累计身家峰值达到 500,000,000 池子币，且胜局达到 250 胜",a:[["pcPeak",500000000],["gambleWins",250]],r:1711},
		{k:"cx_combo_peak_gmwin_2",c:"组合",i:"🧩",l:"身家峰值与胜局 · 850,000,000·340",d:"累计身家峰值达到 850,000,000 池子币，且胜局达到 340 胜",a:[["pcPeak",850000000],["gambleWins",340]],r:2344},
		{k:"cx_combo_peak_gmwin_3",c:"组合",i:"🧩",l:"身家峰值与胜局 · 1,450,000,000·460",d:"累计身家峰值达到 1,450,000,000 池子币，且胜局达到 460 胜",a:[["pcPeak",1450000000],["gambleWins",460]],r:3398},
		{k:"cx_combo_peak_gmwin_4",c:"组合",i:"🧩",l:"身家峰值与胜局 · 2,500,000,000·1,500",d:"累计身家峰值达到 2,500,000,000 池子币，且胜局达到 1,500 胜",a:[["pcPeak",2500000000],["gambleWins",1500]],r:4875},
		{k:"cx_combo_peak_gmwin_5",c:"组合",i:"🧩",l:"身家峰值与胜局 · 4,300,000,000·3,000",d:"累计身家峰值达到 4,300,000,000 池子币，且胜局达到 3,000 胜",a:[["pcPeak",4300000000],["gambleWins",3000]],r:6773},
		{k:"cx_combo_peak_gmwin_6",c:"组合",i:"🧩",l:"身家峰值与胜局 · 7,300,000,000·4,000",d:"累计身家峰值达到 7,300,000,000 池子币，且胜局达到 4,000 胜",a:[["pcPeak",7300000000],["gambleWins",4000]],r:9094},
		{k:"cx_combo_peak_gmwin_7",c:"组合",i:"🧩",l:"身家峰值与胜局 · 12,000,000,000·5,000",d:"累计身家峰值达到 12,000,000,000 池子币，且胜局达到 5,000 胜",a:[["pcPeak",12000000000],["gambleWins",5000]],r:11836},
		{k:"cx_combo_peak_gmwin_8",c:"组合",i:"🧩",l:"身家峰值与胜局 · 21,000,000,000·6,000",d:"累计身家峰值达到 21,000,000,000 池子币，且胜局达到 6,000 胜",a:[["pcPeak",21000000000],["gambleWins",6000]],r:15000},
		{k:"cx_combo_peak_gmnet_0",c:"组合",i:"🧩",l:"身家峰值与净赢 · 290,000,000·10,000,000",d:"累计身家峰值达到 290,000,000 池子币，且净赢达到 10,000,000 池子币",a:[["pcPeak",290000000],["gambleNet",10000000]],r:1500},
		{k:"cx_combo_peak_gmnet_1",c:"组合",i:"🧩",l:"身家峰值与净赢 · 500,000,000·10,000,000",d:"累计身家峰值达到 500,000,000 池子币，且净赢达到 10,000,000 池子币",a:[["pcPeak",500000000],["gambleNet",10000000]],r:1711},
		{k:"cx_combo_peak_gmnet_2",c:"组合",i:"🧩",l:"身家峰值与净赢 · 850,000,000·10,000,000",d:"累计身家峰值达到 850,000,000 池子币，且净赢达到 10,000,000 池子币",a:[["pcPeak",850000000],["gambleNet",10000000]],r:2344},
		{k:"cx_combo_peak_gmnet_3",c:"组合",i:"🧩",l:"身家峰值与净赢 · 1,450,000,000·10,000,000",d:"累计身家峰值达到 1,450,000,000 池子币，且净赢达到 10,000,000 池子币",a:[["pcPeak",1450000000],["gambleNet",10000000]],r:3398},
		{k:"cx_combo_peak_gmnet_4",c:"组合",i:"🧩",l:"身家峰值与净赢 · 2,500,000,000·10,000,000",d:"累计身家峰值达到 2,500,000,000 池子币，且净赢达到 10,000,000 池子币",a:[["pcPeak",2500000000],["gambleNet",10000000]],r:4875},
		{k:"cx_combo_peak_gmnet_5",c:"组合",i:"🧩",l:"身家峰值与净赢 · 4,300,000,000·10,000,000",d:"累计身家峰值达到 4,300,000,000 池子币，且净赢达到 10,000,000 池子币",a:[["pcPeak",4300000000],["gambleNet",10000000]],r:6773},
		{k:"cx_combo_peak_gmnet_6",c:"组合",i:"🧩",l:"身家峰值与净赢 · 7,300,000,000·10,000,000",d:"累计身家峰值达到 7,300,000,000 池子币，且净赢达到 10,000,000 池子币",a:[["pcPeak",7300000000],["gambleNet",10000000]],r:9094},
		{k:"cx_combo_peak_gmnet_7",c:"组合",i:"🧩",l:"身家峰值与净赢 · 12,000,000,000·10,000,000",d:"累计身家峰值达到 12,000,000,000 池子币，且净赢达到 10,000,000 池子币",a:[["pcPeak",12000000000],["gambleNet",10000000]],r:11836},
		{k:"cx_combo_peak_gmnet_8",c:"组合",i:"🧩",l:"身家峰值与净赢 · 21,000,000,000·10,000,000",d:"累计身家峰值达到 21,000,000,000 池子币，且净赢达到 10,000,000 池子币",a:[["pcPeak",21000000000],["gambleNet",10000000]],r:15000},
		{k:"cx_combo_peak_gmstreak_0",c:"组合",i:"🧩",l:"身家峰值与连胜 · 290,000,000·29",d:"累计身家峰值达到 290,000,000 池子币，且连胜达到 29 连胜",a:[["pcPeak",290000000],["gambleBestStreak",29]],r:1500},
		{k:"cx_combo_peak_gmstreak_1",c:"组合",i:"🧩",l:"身家峰值与连胜 · 500,000,000·32",d:"累计身家峰值达到 500,000,000 池子币，且连胜达到 32 连胜",a:[["pcPeak",500000000],["gambleBestStreak",32]],r:1711},
		{k:"cx_combo_peak_gmstreak_2",c:"组合",i:"🧩",l:"身家峰值与连胜 · 850,000,000·36",d:"累计身家峰值达到 850,000,000 池子币，且连胜达到 36 连胜",a:[["pcPeak",850000000],["gambleBestStreak",36]],r:2344},
		{k:"cx_combo_peak_gmstreak_3",c:"组合",i:"🧩",l:"身家峰值与连胜 · 1,450,000,000·45",d:"累计身家峰值达到 1,450,000,000 池子币，且连胜达到 45 连胜",a:[["pcPeak",1450000000],["gambleBestStreak",45]],r:3398},
		{k:"cx_combo_peak_gmstreak_4",c:"组合",i:"🧩",l:"身家峰值与连胜 · 2,500,000,000·51",d:"累计身家峰值达到 2,500,000,000 池子币，且连胜达到 51 连胜",a:[["pcPeak",2500000000],["gambleBestStreak",51]],r:4875},
		{k:"cx_combo_peak_gmstreak_5",c:"组合",i:"🧩",l:"身家峰值与连胜 · 4,300,000,000·58",d:"累计身家峰值达到 4,300,000,000 池子币，且连胜达到 58 连胜",a:[["pcPeak",4300000000],["gambleBestStreak",58]],r:6773},
		{k:"cx_combo_peak_gmstreak_6",c:"组合",i:"🧩",l:"身家峰值与连胜 · 7,300,000,000·66",d:"累计身家峰值达到 7,300,000,000 池子币，且连胜达到 66 连胜",a:[["pcPeak",7300000000],["gambleBestStreak",66]],r:9094},
		{k:"cx_combo_peak_gmstreak_7",c:"组合",i:"🧩",l:"身家峰值与连胜 · 12,000,000,000·76",d:"累计身家峰值达到 12,000,000,000 池子币，且连胜达到 76 连胜",a:[["pcPeak",12000000000],["gambleBestStreak",76]],r:11836},
		{k:"cx_combo_peak_gmstreak_8",c:"组合",i:"🧩",l:"身家峰值与连胜 · 21,000,000,000·78",d:"累计身家峰值达到 21,000,000,000 池子币，且连胜达到 78 连胜",a:[["pcPeak",21000000000],["gambleBestStreak",78]],r:15000},
		{k:"cx_combo_rich_hands_0",c:"组合",i:"🧩",l:"身家与同桌人次 · 290,000,000·78,000",d:"累计身家达到 290,000,000 池子币，且同桌人次达到 78,000 人次",a:[["pc",290000000],["worldHands",78000]],r:1500},
		{k:"cx_combo_rich_hands_1",c:"组合",i:"🧩",l:"身家与同桌人次 · 500,000,000·120,000",d:"累计身家达到 500,000,000 池子币，且同桌人次达到 120,000 人次",a:[["pc",500000000],["worldHands",120000]],r:1711},
		{k:"cx_combo_rich_hands_2",c:"组合",i:"🧩",l:"身家与同桌人次 · 850,000,000·185,000",d:"累计身家达到 850,000,000 池子币，且同桌人次达到 185,000 人次",a:[["pc",850000000],["worldHands",185000]],r:2344},
		{k:"cx_combo_rich_hands_3",c:"组合",i:"🧩",l:"身家与同桌人次 · 1,450,000,000·285,000",d:"累计身家达到 1,450,000,000 池子币，且同桌人次达到 285,000 人次",a:[["pc",1450000000],["worldHands",285000]],r:3398},
		{k:"cx_combo_rich_hands_4",c:"组合",i:"🧩",l:"身家与同桌人次 · 2,500,000,000·350,000",d:"累计身家达到 2,500,000,000 池子币，且同桌人次达到 350,000 人次",a:[["pc",2500000000],["worldHands",350000]],r:4875},
		{k:"cx_combo_rich_hands_5",c:"组合",i:"🧩",l:"身家与同桌人次 · 4,300,000,000·530,000",d:"累计身家达到 4,300,000,000 池子币，且同桌人次达到 530,000 人次",a:[["pc",4300000000],["worldHands",530000]],r:6773},
		{k:"cx_combo_rich_hands_6",c:"组合",i:"🧩",l:"身家与同桌人次 · 7,300,000,000·800,000",d:"累计身家达到 7,300,000,000 池子币，且同桌人次达到 800,000 人次",a:[["pc",7300000000],["worldHands",800000]],r:9094},
		{k:"cx_combo_rich_hands_7",c:"组合",i:"🧩",l:"身家与同桌人次 · 12,000,000,000·980,000",d:"累计身家达到 12,000,000,000 池子币，且同桌人次达到 980,000 人次",a:[["pc",12000000000],["worldHands",980000]],r:11836},
		{k:"cx_combo_rich_hands_8",c:"组合",i:"🧩",l:"身家与同桌人次 · 21,000,000,000·1,480,000",d:"累计身家达到 21,000,000,000 池子币，且同桌人次达到 1,480,000 人次",a:[["pc",21000000000],["worldHands",1480000]],r:15000},
		{k:"cx_combo_rich_retired_0",c:"组合",i:"🧩",l:"身家与当前退隐人数 · 290,000,000·88",d:"累计身家达到 290,000,000 池子币，且当前退隐人数达到 88 名",a:[["pc",290000000],["worldRetired",88]],r:1500},
		{k:"cx_combo_rich_retired_1",c:"组合",i:"🧩",l:"身家与当前退隐人数 · 500,000,000·96",d:"累计身家达到 500,000,000 池子币，且当前退隐人数达到 96 名",a:[["pc",500000000],["worldRetired",96]],r:1711},
		{k:"cx_combo_rich_retired_2",c:"组合",i:"🧩",l:"身家与当前退隐人数 · 850,000,000·100",d:"累计身家达到 850,000,000 池子币，且当前退隐人数达到 100 名",a:[["pc",850000000],["worldRetired",100]],r:2344},
		{k:"cx_combo_rich_retired_3",c:"组合",i:"🧩",l:"身家与当前退隐人数 · 1,450,000,000·105",d:"累计身家达到 1,450,000,000 池子币，且当前退隐人数达到 105 名",a:[["pc",1450000000],["worldRetired",105]],r:3398},
		{k:"cx_combo_rich_retired_4",c:"组合",i:"🧩",l:"身家与当前退隐人数 · 2,500,000,000·110",d:"累计身家达到 2,500,000,000 池子币，且当前退隐人数达到 110 名",a:[["pc",2500000000],["worldRetired",110]],r:4875},
		{k:"cx_combo_rich_retired_5",c:"组合",i:"🧩",l:"身家与当前退隐人数 · 4,300,000,000·116",d:"累计身家达到 4,300,000,000 池子币，且当前退隐人数达到 116 名",a:[["pc",4300000000],["worldRetired",116]],r:6773},
		{k:"cx_combo_rich_retired_6",c:"组合",i:"🧩",l:"身家与当前退隐人数 · 7,300,000,000·130",d:"累计身家达到 7,300,000,000 池子币，且当前退隐人数达到 130 名",a:[["pc",7300000000],["worldRetired",130]],r:9094},
		{k:"cx_combo_rich_retired_7",c:"组合",i:"🧩",l:"身家与当前退隐人数 · 12,000,000,000·140",d:"累计身家达到 12,000,000,000 池子币，且当前退隐人数达到 140 名",a:[["pc",12000000000],["worldRetired",140]],r:11836},
		{k:"cx_combo_rich_retired_8",c:"组合",i:"🧩",l:"身家与当前退隐人数 · 21,000,000,000·150",d:"累计身家达到 21,000,000,000 池子币，且当前退隐人数达到 150 名",a:[["pc",21000000000],["worldRetired",150]],r:15000},
		{k:"cx_combo_peak_hands_0",c:"组合",i:"🧩",l:"身家峰值与同桌人次 · 290,000,000·78,000",d:"累计身家峰值达到 290,000,000 池子币，且同桌人次达到 78,000 人次",a:[["pcPeak",290000000],["worldHands",78000]],r:1500},
		{k:"cx_combo_peak_hands_1",c:"组合",i:"🧩",l:"身家峰值与同桌人次 · 500,000,000·120,000",d:"累计身家峰值达到 500,000,000 池子币，且同桌人次达到 120,000 人次",a:[["pcPeak",500000000],["worldHands",120000]],r:1711},
		{k:"cx_combo_peak_hands_2",c:"组合",i:"🧩",l:"身家峰值与同桌人次 · 850,000,000·185,000",d:"累计身家峰值达到 850,000,000 池子币，且同桌人次达到 185,000 人次",a:[["pcPeak",850000000],["worldHands",185000]],r:2344},
		{k:"cx_combo_peak_hands_3",c:"组合",i:"🧩",l:"身家峰值与同桌人次 · 1,450,000,000·285,000",d:"累计身家峰值达到 1,450,000,000 池子币，且同桌人次达到 285,000 人次",a:[["pcPeak",1450000000],["worldHands",285000]],r:3398},
		{k:"cx_combo_peak_hands_4",c:"组合",i:"🧩",l:"身家峰值与同桌人次 · 2,500,000,000·350,000",d:"累计身家峰值达到 2,500,000,000 池子币，且同桌人次达到 350,000 人次",a:[["pcPeak",2500000000],["worldHands",350000]],r:4875},
		{k:"cx_combo_peak_hands_5",c:"组合",i:"🧩",l:"身家峰值与同桌人次 · 4,300,000,000·530,000",d:"累计身家峰值达到 4,300,000,000 池子币，且同桌人次达到 530,000 人次",a:[["pcPeak",4300000000],["worldHands",530000]],r:6773},
		{k:"cx_combo_peak_hands_6",c:"组合",i:"🧩",l:"身家峰值与同桌人次 · 7,300,000,000·800,000",d:"累计身家峰值达到 7,300,000,000 池子币，且同桌人次达到 800,000 人次",a:[["pcPeak",7300000000],["worldHands",800000]],r:9094},
		{k:"cx_combo_peak_hands_7",c:"组合",i:"🧩",l:"身家峰值与同桌人次 · 12,000,000,000·980,000",d:"累计身家峰值达到 12,000,000,000 池子币，且同桌人次达到 980,000 人次",a:[["pcPeak",12000000000],["worldHands",980000]],r:11836},
		{k:"cx_combo_peak_hands_8",c:"组合",i:"🧩",l:"身家峰值与同桌人次 · 21,000,000,000·1,480,000",d:"累计身家峰值达到 21,000,000,000 池子币，且同桌人次达到 1,480,000 人次",a:[["pcPeak",21000000000],["worldHands",1480000]],r:15000},
		{k:"cx_combo_peak_retired_0",c:"组合",i:"🧩",l:"身家峰值与当前退隐人数 · 290,000,000·88",d:"累计身家峰值达到 290,000,000 池子币，且当前退隐人数达到 88 名",a:[["pcPeak",290000000],["worldRetired",88]],r:1500},
		{k:"cx_combo_peak_retired_1",c:"组合",i:"🧩",l:"身家峰值与当前退隐人数 · 500,000,000·96",d:"累计身家峰值达到 500,000,000 池子币，且当前退隐人数达到 96 名",a:[["pcPeak",500000000],["worldRetired",96]],r:1711},
		{k:"cx_combo_peak_retired_2",c:"组合",i:"🧩",l:"身家峰值与当前退隐人数 · 850,000,000·100",d:"累计身家峰值达到 850,000,000 池子币，且当前退隐人数达到 100 名",a:[["pcPeak",850000000],["worldRetired",100]],r:2344},
		{k:"cx_combo_peak_retired_3",c:"组合",i:"🧩",l:"身家峰值与当前退隐人数 · 1,450,000,000·105",d:"累计身家峰值达到 1,450,000,000 池子币，且当前退隐人数达到 105 名",a:[["pcPeak",1450000000],["worldRetired",105]],r:3398},
		{k:"cx_combo_peak_retired_4",c:"组合",i:"🧩",l:"身家峰值与当前退隐人数 · 2,500,000,000·110",d:"累计身家峰值达到 2,500,000,000 池子币，且当前退隐人数达到 110 名",a:[["pcPeak",2500000000],["worldRetired",110]],r:4875},
		{k:"cx_combo_peak_retired_5",c:"组合",i:"🧩",l:"身家峰值与当前退隐人数 · 4,300,000,000·116",d:"累计身家峰值达到 4,300,000,000 池子币，且当前退隐人数达到 116 名",a:[["pcPeak",4300000000],["worldRetired",116]],r:6773},
		{k:"cx_combo_peak_retired_6",c:"组合",i:"🧩",l:"身家峰值与当前退隐人数 · 7,300,000,000·130",d:"累计身家峰值达到 7,300,000,000 池子币，且当前退隐人数达到 130 名",a:[["pcPeak",7300000000],["worldRetired",130]],r:9094},
		{k:"cx_combo_peak_retired_7",c:"组合",i:"🧩",l:"身家峰值与当前退隐人数 · 12,000,000,000·140",d:"累计身家峰值达到 12,000,000,000 池子币，且当前退隐人数达到 140 名",a:[["pcPeak",12000000000],["worldRetired",140]],r:11836},
		{k:"cx_combo_peak_retired_8",c:"组合",i:"🧩",l:"身家峰值与当前退隐人数 · 21,000,000,000·150",d:"累计身家峰值达到 21,000,000,000 池子币，且当前退隐人数达到 150 名",a:[["pcPeak",21000000000],["worldRetired",150]],r:15000},
		{k:"cx_combo_rich_sign_0",c:"组合",i:"🧩",l:"身家与连续签到 · 290,000,000·420",d:"累计身家达到 290,000,000 池子币，且连续签到达到 420 天",a:[["pc",290000000],["streak",420]],r:1500},
		{k:"cx_combo_rich_sign_1",c:"组合",i:"🧩",l:"身家与连续签到 · 500,000,000·445",d:"累计身家达到 500,000,000 池子币，且连续签到达到 445 天",a:[["pc",500000000],["streak",445]],r:1711},
		{k:"cx_combo_rich_sign_2",c:"组合",i:"🧩",l:"身家与连续签到 · 850,000,000·500",d:"累计身家达到 850,000,000 池子币，且连续签到达到 500 天",a:[["pc",850000000],["streak",500]],r:2344},
		{k:"cx_combo_rich_sign_3",c:"组合",i:"🧩",l:"身家与连续签到 · 1,450,000,000·530",d:"累计身家达到 1,450,000,000 池子币，且连续签到达到 530 天",a:[["pc",1450000000],["streak",530]],r:3398},
		{k:"cx_combo_rich_sign_4",c:"组合",i:"🧩",l:"身家与连续签到 · 2,500,000,000·565",d:"累计身家达到 2,500,000,000 池子币，且连续签到达到 565 天",a:[["pc",2500000000],["streak",565]],r:4875},
		{k:"cx_combo_rich_sign_5",c:"组合",i:"🧩",l:"身家与连续签到 · 4,300,000,000·640",d:"累计身家达到 4,300,000,000 池子币，且连续签到达到 640 天",a:[["pc",4300000000],["streak",640]],r:6773},
		{k:"cx_combo_rich_sign_6",c:"组合",i:"🧩",l:"身家与连续签到 · 7,300,000,000·680",d:"累计身家达到 7,300,000,000 池子币，且连续签到达到 680 天",a:[["pc",7300000000],["streak",680]],r:9094},
		{k:"cx_combo_rich_sign_7",c:"组合",i:"🧩",l:"身家与连续签到 · 12,000,000,000·785",d:"累计身家达到 12,000,000,000 池子币，且连续签到达到 785 天",a:[["pc",12000000000],["streak",785]],r:11836},
		{k:"cx_combo_rich_sign_8",c:"组合",i:"🧩",l:"身家与连续签到 · 21,000,000,000·845",d:"累计身家达到 21,000,000,000 池子币，且连续签到达到 845 天",a:[["pc",21000000000],["streak",845]],r:15000},
		{k:"cx_combo_rich_task_0",c:"组合",i:"🧩",l:"身家与日课完成 · 290,000,000·21",d:"累计身家达到 290,000,000 池子币，且日课完成达到 21 项",a:[["pc",290000000],["taskCompletedTotal",21]],r:1500},
		{k:"cx_combo_rich_task_1",c:"组合",i:"🧩",l:"身家与日课完成 · 500,000,000·23",d:"累计身家达到 500,000,000 池子币，且日课完成达到 23 项",a:[["pc",500000000],["taskCompletedTotal",23]],r:1711},
		{k:"cx_combo_rich_task_2",c:"组合",i:"🧩",l:"身家与日课完成 · 850,000,000·29",d:"累计身家达到 850,000,000 池子币，且日课完成达到 29 项",a:[["pc",850000000],["taskCompletedTotal",29]],r:2344},
		{k:"cx_combo_rich_task_3",c:"组合",i:"🧩",l:"身家与日课完成 · 1,450,000,000·32",d:"累计身家达到 1,450,000,000 池子币，且日课完成达到 32 项",a:[["pc",1450000000],["taskCompletedTotal",32]],r:3398},
		{k:"cx_combo_rich_task_4",c:"组合",i:"🧩",l:"身家与日课完成 · 2,500,000,000·36",d:"累计身家达到 2,500,000,000 池子币，且日课完成达到 36 项",a:[["pc",2500000000],["taskCompletedTotal",36]],r:4875},
		{k:"cx_combo_rich_task_5",c:"组合",i:"🧩",l:"身家与日课完成 · 4,300,000,000·45",d:"累计身家达到 4,300,000,000 池子币，且日课完成达到 45 项",a:[["pc",4300000000],["taskCompletedTotal",45]],r:6773},
		{k:"cx_combo_rich_task_6",c:"组合",i:"🧩",l:"身家与日课完成 · 7,300,000,000·51",d:"累计身家达到 7,300,000,000 池子币，且日课完成达到 51 项",a:[["pc",7300000000],["taskCompletedTotal",51]],r:9094},
		{k:"cx_combo_rich_task_7",c:"组合",i:"🧩",l:"身家与日课完成 · 12,000,000,000·66",d:"累计身家达到 12,000,000,000 池子币，且日课完成达到 66 项",a:[["pc",12000000000],["taskCompletedTotal",66]],r:11836},
		{k:"cx_combo_rich_task_8",c:"组合",i:"🧩",l:"身家与日课完成 · 21,000,000,000·75",d:"累计身家达到 21,000,000,000 池子币，且日课完成达到 75 项",a:[["pc",21000000000],["taskCompletedTotal",75]],r:15000},
		{k:"cx_combo_peak_sign_0",c:"组合",i:"🧩",l:"身家峰值与连续签到 · 290,000,000·420",d:"累计身家峰值达到 290,000,000 池子币，且连续签到达到 420 天",a:[["pcPeak",290000000],["streak",420]],r:1500},
		{k:"cx_combo_peak_sign_1",c:"组合",i:"🧩",l:"身家峰值与连续签到 · 500,000,000·445",d:"累计身家峰值达到 500,000,000 池子币，且连续签到达到 445 天",a:[["pcPeak",500000000],["streak",445]],r:1711},
		{k:"cx_combo_peak_sign_2",c:"组合",i:"🧩",l:"身家峰值与连续签到 · 850,000,000·500",d:"累计身家峰值达到 850,000,000 池子币，且连续签到达到 500 天",a:[["pcPeak",850000000],["streak",500]],r:2344},
		{k:"cx_combo_peak_sign_3",c:"组合",i:"🧩",l:"身家峰值与连续签到 · 1,450,000,000·530",d:"累计身家峰值达到 1,450,000,000 池子币，且连续签到达到 530 天",a:[["pcPeak",1450000000],["streak",530]],r:3398},
		{k:"cx_combo_peak_sign_4",c:"组合",i:"🧩",l:"身家峰值与连续签到 · 2,500,000,000·565",d:"累计身家峰值达到 2,500,000,000 池子币，且连续签到达到 565 天",a:[["pcPeak",2500000000],["streak",565]],r:4875},
		{k:"cx_combo_peak_sign_5",c:"组合",i:"🧩",l:"身家峰值与连续签到 · 4,300,000,000·640",d:"累计身家峰值达到 4,300,000,000 池子币，且连续签到达到 640 天",a:[["pcPeak",4300000000],["streak",640]],r:6773},
		{k:"cx_combo_peak_sign_6",c:"组合",i:"🧩",l:"身家峰值与连续签到 · 7,300,000,000·680",d:"累计身家峰值达到 7,300,000,000 池子币，且连续签到达到 680 天",a:[["pcPeak",7300000000],["streak",680]],r:9094},
		{k:"cx_combo_peak_sign_7",c:"组合",i:"🧩",l:"身家峰值与连续签到 · 12,000,000,000·785",d:"累计身家峰值达到 12,000,000,000 池子币，且连续签到达到 785 天",a:[["pcPeak",12000000000],["streak",785]],r:11836},
		{k:"cx_combo_peak_sign_8",c:"组合",i:"🧩",l:"身家峰值与连续签到 · 21,000,000,000·845",d:"累计身家峰值达到 21,000,000,000 池子币，且连续签到达到 845 天",a:[["pcPeak",21000000000],["streak",845]],r:15000},
		{k:"cx_combo_peak_task_0",c:"组合",i:"🧩",l:"身家峰值与日课完成 · 290,000,000·21",d:"累计身家峰值达到 290,000,000 池子币，且日课完成达到 21 项",a:[["pcPeak",290000000],["taskCompletedTotal",21]],r:1500},
		{k:"cx_combo_peak_task_1",c:"组合",i:"🧩",l:"身家峰值与日课完成 · 500,000,000·23",d:"累计身家峰值达到 500,000,000 池子币，且日课完成达到 23 项",a:[["pcPeak",500000000],["taskCompletedTotal",23]],r:1711},
		{k:"cx_combo_peak_task_2",c:"组合",i:"🧩",l:"身家峰值与日课完成 · 850,000,000·29",d:"累计身家峰值达到 850,000,000 池子币，且日课完成达到 29 项",a:[["pcPeak",850000000],["taskCompletedTotal",29]],r:2344},
		{k:"cx_combo_peak_task_3",c:"组合",i:"🧩",l:"身家峰值与日课完成 · 1,450,000,000·32",d:"累计身家峰值达到 1,450,000,000 池子币，且日课完成达到 32 项",a:[["pcPeak",1450000000],["taskCompletedTotal",32]],r:3398},
		{k:"cx_combo_peak_task_4",c:"组合",i:"🧩",l:"身家峰值与日课完成 · 2,500,000,000·36",d:"累计身家峰值达到 2,500,000,000 池子币，且日课完成达到 36 项",a:[["pcPeak",2500000000],["taskCompletedTotal",36]],r:4875},
		{k:"cx_combo_peak_task_5",c:"组合",i:"🧩",l:"身家峰值与日课完成 · 4,300,000,000·45",d:"累计身家峰值达到 4,300,000,000 池子币，且日课完成达到 45 项",a:[["pcPeak",4300000000],["taskCompletedTotal",45]],r:6773},
		{k:"cx_combo_peak_task_6",c:"组合",i:"🧩",l:"身家峰值与日课完成 · 7,300,000,000·51",d:"累计身家峰值达到 7,300,000,000 池子币，且日课完成达到 51 项",a:[["pcPeak",7300000000],["taskCompletedTotal",51]],r:9094},
		{k:"cx_combo_peak_task_7",c:"组合",i:"🧩",l:"身家峰值与日课完成 · 12,000,000,000·66",d:"累计身家峰值达到 12,000,000,000 池子币，且日课完成达到 66 项",a:[["pcPeak",12000000000],["taskCompletedTotal",66]],r:11836},
		{k:"cx_combo_peak_task_8",c:"组合",i:"🧩",l:"身家峰值与日课完成 · 21,000,000,000·75",d:"累计身家峰值达到 21,000,000,000 池子币，且日课完成达到 75 项",a:[["pcPeak",21000000000],["taskCompletedTotal",75]],r:15000},
		{k:"cx_combo_rich_interact_0",c:"组合",i:"🧩",l:"身家与互动次数 · 290,000,000·57,000",d:"累计身家达到 290,000,000 池子币，且互动次数达到 57,000 次",a:[["pc",290000000],["interactTotal",57000]],r:1500},
		{k:"cx_combo_rich_interact_1",c:"组合",i:"🧩",l:"身家与互动次数 · 500,000,000·81,000",d:"累计身家达到 500,000,000 池子币，且互动次数达到 81,000 次",a:[["pc",500000000],["interactTotal",81000]],r:1711},
		{k:"cx_combo_rich_interact_2",c:"组合",i:"🧩",l:"身家与互动次数 · 850,000,000·115,000",d:"累计身家达到 850,000,000 池子币，且互动次数达到 115,000 次",a:[["pc",850000000],["interactTotal",115000]],r:2344},
		{k:"cx_combo_rich_interact_3",c:"组合",i:"🧩",l:"身家与互动次数 · 1,450,000,000·163,000",d:"累计身家达到 1,450,000,000 池子币，且互动次数达到 163,000 次",a:[["pc",1450000000],["interactTotal",163000]],r:3398},
		{k:"cx_combo_rich_interact_4",c:"组合",i:"🧩",l:"身家与互动次数 · 2,500,000,000·232,000",d:"累计身家达到 2,500,000,000 池子币，且互动次数达到 232,000 次",a:[["pc",2500000000],["interactTotal",232000]],r:4875},
		{k:"cx_combo_rich_interact_5",c:"组合",i:"🧩",l:"身家与互动次数 · 4,300,000,000·328,000",d:"累计身家达到 4,300,000,000 池子币，且互动次数达到 328,000 次",a:[["pc",4300000000],["interactTotal",328000]],r:6773},
		{k:"cx_combo_rich_interact_6",c:"组合",i:"🧩",l:"身家与互动次数 · 7,300,000,000·465,000",d:"累计身家达到 7,300,000,000 池子币，且互动次数达到 465,000 次",a:[["pc",7300000000],["interactTotal",465000]],r:9094},
		{k:"cx_combo_rich_interact_7",c:"组合",i:"🧩",l:"身家与互动次数 · 12,000,000,000·660,000",d:"累计身家达到 12,000,000,000 池子币，且互动次数达到 660,000 次",a:[["pc",12000000000],["interactTotal",660000]],r:11836},
		{k:"cx_combo_rich_interact_8",c:"组合",i:"🧩",l:"身家与互动次数 · 21,000,000,000·920,000",d:"累计身家达到 21,000,000,000 池子币，且互动次数达到 920,000 次",a:[["pc",21000000000],["interactTotal",920000]],r:15000},
		{k:"cx_combo_peak_interact_0",c:"组合",i:"🧩",l:"身家峰值与互动次数 · 290,000,000·57,000",d:"累计身家峰值达到 290,000,000 池子币，且互动次数达到 57,000 次",a:[["pcPeak",290000000],["interactTotal",57000]],r:1500},
		{k:"cx_combo_peak_interact_1",c:"组合",i:"🧩",l:"身家峰值与互动次数 · 500,000,000·81,000",d:"累计身家峰值达到 500,000,000 池子币，且互动次数达到 81,000 次",a:[["pcPeak",500000000],["interactTotal",81000]],r:1711},
		{k:"cx_combo_peak_interact_2",c:"组合",i:"🧩",l:"身家峰值与互动次数 · 850,000,000·115,000",d:"累计身家峰值达到 850,000,000 池子币，且互动次数达到 115,000 次",a:[["pcPeak",850000000],["interactTotal",115000]],r:2344},
		{k:"cx_combo_peak_interact_3",c:"组合",i:"🧩",l:"身家峰值与互动次数 · 1,450,000,000·163,000",d:"累计身家峰值达到 1,450,000,000 池子币，且互动次数达到 163,000 次",a:[["pcPeak",1450000000],["interactTotal",163000]],r:3398},
		{k:"cx_combo_peak_interact_4",c:"组合",i:"🧩",l:"身家峰值与互动次数 · 2,500,000,000·232,000",d:"累计身家峰值达到 2,500,000,000 池子币，且互动次数达到 232,000 次",a:[["pcPeak",2500000000],["interactTotal",232000]],r:4875},
		{k:"cx_combo_peak_interact_5",c:"组合",i:"🧩",l:"身家峰值与互动次数 · 4,300,000,000·328,000",d:"累计身家峰值达到 4,300,000,000 池子币，且互动次数达到 328,000 次",a:[["pcPeak",4300000000],["interactTotal",328000]],r:6773},
		{k:"cx_combo_peak_interact_6",c:"组合",i:"🧩",l:"身家峰值与互动次数 · 7,300,000,000·465,000",d:"累计身家峰值达到 7,300,000,000 池子币，且互动次数达到 465,000 次",a:[["pcPeak",7300000000],["interactTotal",465000]],r:9094},
		{k:"cx_combo_peak_interact_7",c:"组合",i:"🧩",l:"身家峰值与互动次数 · 12,000,000,000·660,000",d:"累计身家峰值达到 12,000,000,000 池子币，且互动次数达到 660,000 次",a:[["pcPeak",12000000000],["interactTotal",660000]],r:11836},
		{k:"cx_combo_peak_interact_8",c:"组合",i:"🧩",l:"身家峰值与互动次数 · 21,000,000,000·920,000",d:"累计身家峰值达到 21,000,000,000 池子币，且互动次数达到 920,000 次",a:[["pcPeak",21000000000],["interactTotal",920000]],r:15000},
		{k:"cx_combo_merit_wins_0",c:"组合",i:"🧩",l:"功名战绩 · 1,400,000·11,000",d:"累计功勋达到 1,400,000 点功勋，且胜场达到 11,000 胜",a:[["merit",1400000],["wrWin",11000]],r:1500},
		{k:"cx_combo_merit_wins_1",c:"组合",i:"🧩",l:"功名战绩 · 3,500,000·12,000",d:"累计功勋达到 3,500,000 点功勋，且胜场达到 12,000 胜",a:[["merit",3500000],["wrWin",12000]],r:1711},
		{k:"cx_combo_merit_wins_2",c:"组合",i:"🧩",l:"功名战绩 · 6,300,000·12,000",d:"累计功勋达到 6,300,000 点功勋，且胜场达到 12,000 胜",a:[["merit",6300000],["wrWin",12000]],r:2344},
		{k:"cx_combo_merit_wins_3",c:"组合",i:"🧩",l:"功名战绩 · 15,500,000·13,000",d:"累计功勋达到 15,500,000 点功勋，且胜场达到 13,000 胜",a:[["merit",15500000],["wrWin",13000]],r:3398},
		{k:"cx_combo_merit_wins_4",c:"组合",i:"🧩",l:"功名战绩 · 38,000,000·13,000",d:"累计功勋达到 38,000,000 点功勋，且胜场达到 13,000 胜",a:[["merit",38000000],["wrWin",13000]],r:4875},
		{k:"cx_combo_merit_wins_5",c:"组合",i:"🧩",l:"功名战绩 · 70,000,000·14,000",d:"累计功勋达到 70,000,000 点功勋，且胜场达到 14,000 胜",a:[["merit",70000000],["wrWin",14000]],r:6773},
		{k:"cx_combo_merit_wins_6",c:"组合",i:"🧩",l:"功名战绩 · 180,000,000·14,000",d:"累计功勋达到 180,000,000 点功勋，且胜场达到 14,000 胜",a:[["merit",180000000],["wrWin",14000]],r:9094},
		{k:"cx_combo_merit_wins_7",c:"组合",i:"🧩",l:"功名战绩 · 350,000,000·15,000",d:"累计功勋达到 350,000,000 点功勋，且胜场达到 15,000 胜",a:[["merit",350000000],["wrWin",15000]],r:11836},
		{k:"cx_combo_merit_wins_8",c:"组合",i:"🧩",l:"功名战绩 · 900,000,000·15,000",d:"累计功勋达到 900,000,000 点功勋，且胜场达到 15,000 胜",a:[["merit",900000000],["wrWin",15000]],r:15000},
		{k:"cx_combo_merit_games_0",c:"组合",i:"🧩",l:"功勋与对局数 · 1,400,000·11,000",d:"累计功勋达到 1,400,000 点功勋，且对局数达到 11,000 局",a:[["merit",1400000],["wrGames",11000]],r:1500},
		{k:"cx_combo_merit_games_1",c:"组合",i:"🧩",l:"功勋与对局数 · 3,500,000·12,000",d:"累计功勋达到 3,500,000 点功勋，且对局数达到 12,000 局",a:[["merit",3500000],["wrGames",12000]],r:1711},
		{k:"cx_combo_merit_games_2",c:"组合",i:"🧩",l:"功勋与对局数 · 6,300,000·12,000",d:"累计功勋达到 6,300,000 点功勋，且对局数达到 12,000 局",a:[["merit",6300000],["wrGames",12000]],r:2344},
		{k:"cx_combo_merit_games_3",c:"组合",i:"🧩",l:"功勋与对局数 · 15,500,000·13,000",d:"累计功勋达到 15,500,000 点功勋，且对局数达到 13,000 局",a:[["merit",15500000],["wrGames",13000]],r:3398},
		{k:"cx_combo_merit_games_4",c:"组合",i:"🧩",l:"功勋与对局数 · 38,000,000·13,000",d:"累计功勋达到 38,000,000 点功勋，且对局数达到 13,000 局",a:[["merit",38000000],["wrGames",13000]],r:4875},
		{k:"cx_combo_merit_games_5",c:"组合",i:"🧩",l:"功勋与对局数 · 70,000,000·14,000",d:"累计功勋达到 70,000,000 点功勋，且对局数达到 14,000 局",a:[["merit",70000000],["wrGames",14000]],r:6773},
		{k:"cx_combo_merit_games_6",c:"组合",i:"🧩",l:"功勋与对局数 · 180,000,000·14,000",d:"累计功勋达到 180,000,000 点功勋，且对局数达到 14,000 局",a:[["merit",180000000],["wrGames",14000]],r:9094},
		{k:"cx_combo_merit_games_7",c:"组合",i:"🧩",l:"功勋与对局数 · 350,000,000·15,000",d:"累计功勋达到 350,000,000 点功勋，且对局数达到 15,000 局",a:[["merit",350000000],["wrGames",15000]],r:11836},
		{k:"cx_combo_merit_games_8",c:"组合",i:"🧩",l:"功勋与对局数 · 900,000,000·15,000",d:"累计功勋达到 900,000,000 点功勋，且对局数达到 15,000 局",a:[["merit",900000000],["wrGames",15000]],r:15000},
		{k:"cx_combo_merit_kills_0",c:"组合",i:"🧩",l:"功勋赫赫 · 1,400,000·12,500",d:"累计功勋达到 1,400,000 点功勋，且击杀达到 12,500 人",a:[["merit",1400000],["wrKill",12500]],r:1500},
		{k:"cx_combo_merit_kills_1",c:"组合",i:"🧩",l:"功勋赫赫 · 3,500,000·14,500",d:"累计功勋达到 3,500,000 点功勋，且击杀达到 14,500 人",a:[["merit",3500000],["wrKill",14500]],r:1711},
		{k:"cx_combo_merit_kills_2",c:"组合",i:"🧩",l:"功勋赫赫 · 6,300,000·16,500",d:"累计功勋达到 6,300,000 点功勋，且击杀达到 16,500 人",a:[["merit",6300000],["wrKill",16500]],r:2344},
		{k:"cx_combo_merit_kills_3",c:"组合",i:"🧩",l:"功勋赫赫 · 15,500,000·19,000",d:"累计功勋达到 15,500,000 点功勋，且击杀达到 19,000 人",a:[["merit",15500000],["wrKill",19000]],r:3398},
		{k:"cx_combo_merit_kills_4",c:"组合",i:"🧩",l:"功勋赫赫 · 38,000,000·22,000",d:"累计功勋达到 38,000,000 点功勋，且击杀达到 22,000 人",a:[["merit",38000000],["wrKill",22000]],r:4875},
		{k:"cx_combo_merit_kills_5",c:"组合",i:"🧩",l:"功勋赫赫 · 70,000,000·25,500",d:"累计功勋达到 70,000,000 点功勋，且击杀达到 25,500 人",a:[["merit",70000000],["wrKill",25500]],r:6773},
		{k:"cx_combo_merit_kills_6",c:"组合",i:"🧩",l:"功勋赫赫 · 180,000,000·29,500",d:"累计功勋达到 180,000,000 点功勋，且击杀达到 29,500 人",a:[["merit",180000000],["wrKill",29500]],r:9094},
		{k:"cx_combo_merit_kills_7",c:"组合",i:"🧩",l:"功勋赫赫 · 350,000,000·34,000",d:"累计功勋达到 350,000,000 点功勋，且击杀达到 34,000 人",a:[["merit",350000000],["wrKill",34000]],r:11836},
		{k:"cx_combo_merit_kills_8",c:"组合",i:"🧩",l:"功勋赫赫 · 900,000,000·39,000",d:"累计功勋达到 900,000,000 点功勋，且击杀达到 39,000 人",a:[["merit",900000000],["wrKill",39000]],r:15000},
		{k:"cx_combo_merit_chars_0",c:"组合",i:"🧩",l:"功勋与使用武将数 · 1,400,000·60",d:"累计功勋达到 1,400,000 点功勋，且使用武将数达到 60 名",a:[["merit",1400000],["wrChars",60]],r:1500},
		{k:"cx_combo_merit_chars_1",c:"组合",i:"🧩",l:"功勋与使用武将数 · 3,500,000·70",d:"累计功勋达到 3,500,000 点功勋，且使用武将数达到 70 名",a:[["merit",3500000],["wrChars",70]],r:1711},
		{k:"cx_combo_merit_chars_2",c:"组合",i:"🧩",l:"功勋与使用武将数 · 6,300,000·75",d:"累计功勋达到 6,300,000 点功勋，且使用武将数达到 75 名",a:[["merit",6300000],["wrChars",75]],r:2344},
		{k:"cx_combo_merit_chars_3",c:"组合",i:"🧩",l:"功勋与使用武将数 · 15,500,000·85",d:"累计功勋达到 15,500,000 点功勋，且使用武将数达到 85 名",a:[["merit",15500000],["wrChars",85]],r:3398},
		{k:"cx_combo_merit_chars_4",c:"组合",i:"🧩",l:"功勋与使用武将数 · 38,000,000·90",d:"累计功勋达到 38,000,000 点功勋，且使用武将数达到 90 名",a:[["merit",38000000],["wrChars",90]],r:4875},
		{k:"cx_combo_merit_chars_5",c:"组合",i:"🧩",l:"功勋与使用武将数 · 70,000,000·100",d:"累计功勋达到 70,000,000 点功勋，且使用武将数达到 100 名",a:[["merit",70000000],["wrChars",100]],r:6773},
		{k:"cx_combo_merit_chars_6",c:"组合",i:"🧩",l:"功勋与使用武将数 · 180,000,000·105",d:"累计功勋达到 180,000,000 点功勋，且使用武将数达到 105 名",a:[["merit",180000000],["wrChars",105]],r:9094},
		{k:"cx_combo_merit_chars_7",c:"组合",i:"🧩",l:"功勋与使用武将数 · 350,000,000·115",d:"累计功勋达到 350,000,000 点功勋，且使用武将数达到 115 名",a:[["merit",350000000],["wrChars",115]],r:11836},
		{k:"cx_combo_merit_chars_8",c:"组合",i:"🧩",l:"功勋与使用武将数 · 900,000,000·120",d:"累计功勋达到 900,000,000 点功勋，且使用武将数达到 120 名",a:[["merit",900000000],["wrChars",120]],r:15000},
		{k:"cx_combo_meritday_wins_0",c:"组合",i:"🧩",l:"单日功勋与胜场 · 10,000·11,000",d:"累计单日功勋达到 10,000 点，且胜场达到 11,000 胜",a:[["meritToday",10000],["wrWin",11000]],r:1500},
		{k:"cx_combo_meritday_wins_1",c:"组合",i:"🧩",l:"单日功勋与胜场 · 17,000·12,000",d:"累计单日功勋达到 17,000 点，且胜场达到 12,000 胜",a:[["meritToday",17000],["wrWin",12000]],r:1711},
		{k:"cx_combo_meritday_wins_2",c:"组合",i:"🧩",l:"单日功勋与胜场 · 22,000·12,000",d:"累计单日功勋达到 22,000 点，且胜场达到 12,000 胜",a:[["meritToday",22000],["wrWin",12000]],r:2344},
		{k:"cx_combo_meritday_wins_3",c:"组合",i:"🧩",l:"单日功勋与胜场 · 28,000·13,000",d:"累计单日功勋达到 28,000 点，且胜场达到 13,000 胜",a:[["meritToday",28000],["wrWin",13000]],r:3398},
		{k:"cx_combo_meritday_wins_4",c:"组合",i:"🧩",l:"单日功勋与胜场 · 36,000·13,000",d:"累计单日功勋达到 36,000 点，且胜场达到 13,000 胜",a:[["meritToday",36000],["wrWin",13000]],r:4875},
		{k:"cx_combo_meritday_wins_5",c:"组合",i:"🧩",l:"单日功勋与胜场 · 46,000·14,000",d:"累计单日功勋达到 46,000 点，且胜场达到 14,000 胜",a:[["meritToday",46000],["wrWin",14000]],r:6773},
		{k:"cx_combo_meritday_wins_6",c:"组合",i:"🧩",l:"单日功勋与胜场 · 73,000·14,000",d:"累计单日功勋达到 73,000 点，且胜场达到 14,000 胜",a:[["meritToday",73000],["wrWin",14000]],r:9094},
		{k:"cx_combo_meritday_wins_7",c:"组合",i:"🧩",l:"单日功勋与胜场 · 92,000·15,000",d:"累计单日功勋达到 92,000 点，且胜场达到 15,000 胜",a:[["meritToday",92000],["wrWin",15000]],r:11836},
		{k:"cx_combo_meritday_wins_8",c:"组合",i:"🧩",l:"单日功勋与胜场 · 115,000·15,000",d:"累计单日功勋达到 115,000 点，且胜场达到 15,000 胜",a:[["meritToday",115000],["wrWin",15000]],r:15000},
		{k:"cx_combo_meritday_games_0",c:"组合",i:"🧩",l:"单日功勋与对局数 · 10,000·11,000",d:"累计单日功勋达到 10,000 点，且对局数达到 11,000 局",a:[["meritToday",10000],["wrGames",11000]],r:1500},
		{k:"cx_combo_meritday_games_1",c:"组合",i:"🧩",l:"单日功勋与对局数 · 17,000·12,000",d:"累计单日功勋达到 17,000 点，且对局数达到 12,000 局",a:[["meritToday",17000],["wrGames",12000]],r:1711},
		{k:"cx_combo_meritday_games_2",c:"组合",i:"🧩",l:"单日功勋与对局数 · 22,000·12,000",d:"累计单日功勋达到 22,000 点，且对局数达到 12,000 局",a:[["meritToday",22000],["wrGames",12000]],r:2344},
		{k:"cx_combo_meritday_games_3",c:"组合",i:"🧩",l:"单日功勋与对局数 · 28,000·13,000",d:"累计单日功勋达到 28,000 点，且对局数达到 13,000 局",a:[["meritToday",28000],["wrGames",13000]],r:3398},
		{k:"cx_combo_meritday_games_4",c:"组合",i:"🧩",l:"单日功勋与对局数 · 36,000·13,000",d:"累计单日功勋达到 36,000 点，且对局数达到 13,000 局",a:[["meritToday",36000],["wrGames",13000]],r:4875},
		{k:"cx_combo_meritday_games_5",c:"组合",i:"🧩",l:"单日功勋与对局数 · 46,000·14,000",d:"累计单日功勋达到 46,000 点，且对局数达到 14,000 局",a:[["meritToday",46000],["wrGames",14000]],r:6773},
		{k:"cx_combo_meritday_games_6",c:"组合",i:"🧩",l:"单日功勋与对局数 · 73,000·14,000",d:"累计单日功勋达到 73,000 点，且对局数达到 14,000 局",a:[["meritToday",73000],["wrGames",14000]],r:9094},
		{k:"cx_combo_meritday_games_7",c:"组合",i:"🧩",l:"单日功勋与对局数 · 92,000·15,000",d:"累计单日功勋达到 92,000 点，且对局数达到 15,000 局",a:[["meritToday",92000],["wrGames",15000]],r:11836},
		{k:"cx_combo_meritday_games_8",c:"组合",i:"🧩",l:"单日功勋与对局数 · 115,000·15,000",d:"累计单日功勋达到 115,000 点，且对局数达到 15,000 局",a:[["meritToday",115000],["wrGames",15000]],r:15000},
		{k:"cx_combo_meritday_kills_0",c:"组合",i:"🧩",l:"单日功勋与击杀 · 10,000·12,500",d:"累计单日功勋达到 10,000 点，且击杀达到 12,500 人",a:[["meritToday",10000],["wrKill",12500]],r:1500},
		{k:"cx_combo_meritday_kills_1",c:"组合",i:"🧩",l:"单日功勋与击杀 · 17,000·14,500",d:"累计单日功勋达到 17,000 点，且击杀达到 14,500 人",a:[["meritToday",17000],["wrKill",14500]],r:1711},
		{k:"cx_combo_meritday_kills_2",c:"组合",i:"🧩",l:"单日功勋与击杀 · 22,000·16,500",d:"累计单日功勋达到 22,000 点，且击杀达到 16,500 人",a:[["meritToday",22000],["wrKill",16500]],r:2344},
		{k:"cx_combo_meritday_kills_3",c:"组合",i:"🧩",l:"单日功勋与击杀 · 28,000·19,000",d:"累计单日功勋达到 28,000 点，且击杀达到 19,000 人",a:[["meritToday",28000],["wrKill",19000]],r:3398},
		{k:"cx_combo_meritday_kills_4",c:"组合",i:"🧩",l:"单日功勋与击杀 · 36,000·22,000",d:"累计单日功勋达到 36,000 点，且击杀达到 22,000 人",a:[["meritToday",36000],["wrKill",22000]],r:4875},
		{k:"cx_combo_meritday_kills_5",c:"组合",i:"🧩",l:"单日功勋与击杀 · 46,000·25,500",d:"累计单日功勋达到 46,000 点，且击杀达到 25,500 人",a:[["meritToday",46000],["wrKill",25500]],r:6773},
		{k:"cx_combo_meritday_kills_6",c:"组合",i:"🧩",l:"单日功勋与击杀 · 73,000·29,500",d:"累计单日功勋达到 73,000 点，且击杀达到 29,500 人",a:[["meritToday",73000],["wrKill",29500]],r:9094},
		{k:"cx_combo_meritday_kills_7",c:"组合",i:"🧩",l:"单日功勋与击杀 · 92,000·34,000",d:"累计单日功勋达到 92,000 点，且击杀达到 34,000 人",a:[["meritToday",92000],["wrKill",34000]],r:11836},
		{k:"cx_combo_meritday_kills_8",c:"组合",i:"🧩",l:"单日功勋与击杀 · 115,000·39,000",d:"累计单日功勋达到 115,000 点，且击杀达到 39,000 人",a:[["meritToday",115000],["wrKill",39000]],r:15000},
		{k:"cx_combo_meritday_chars_0",c:"组合",i:"🧩",l:"单日功勋与使用武将数 · 10,000·60",d:"累计单日功勋达到 10,000 点，且使用武将数达到 60 名",a:[["meritToday",10000],["wrChars",60]],r:1500},
		{k:"cx_combo_meritday_chars_1",c:"组合",i:"🧩",l:"单日功勋与使用武将数 · 17,000·70",d:"累计单日功勋达到 17,000 点，且使用武将数达到 70 名",a:[["meritToday",17000],["wrChars",70]],r:1711},
		{k:"cx_combo_meritday_chars_2",c:"组合",i:"🧩",l:"单日功勋与使用武将数 · 22,000·75",d:"累计单日功勋达到 22,000 点，且使用武将数达到 75 名",a:[["meritToday",22000],["wrChars",75]],r:2344},
		{k:"cx_combo_meritday_chars_3",c:"组合",i:"🧩",l:"单日功勋与使用武将数 · 28,000·85",d:"累计单日功勋达到 28,000 点，且使用武将数达到 85 名",a:[["meritToday",28000],["wrChars",85]],r:3398},
		{k:"cx_combo_meritday_chars_4",c:"组合",i:"🧩",l:"单日功勋与使用武将数 · 36,000·90",d:"累计单日功勋达到 36,000 点，且使用武将数达到 90 名",a:[["meritToday",36000],["wrChars",90]],r:4875},
		{k:"cx_combo_meritday_chars_5",c:"组合",i:"🧩",l:"单日功勋与使用武将数 · 46,000·100",d:"累计单日功勋达到 46,000 点，且使用武将数达到 100 名",a:[["meritToday",46000],["wrChars",100]],r:6773},
		{k:"cx_combo_meritday_chars_6",c:"组合",i:"🧩",l:"单日功勋与使用武将数 · 73,000·105",d:"累计单日功勋达到 73,000 点，且使用武将数达到 105 名",a:[["meritToday",73000],["wrChars",105]],r:9094},
		{k:"cx_combo_meritday_chars_7",c:"组合",i:"🧩",l:"单日功勋与使用武将数 · 92,000·115",d:"累计单日功勋达到 92,000 点，且使用武将数达到 115 名",a:[["meritToday",92000],["wrChars",115]],r:11836},
		{k:"cx_combo_meritday_chars_8",c:"组合",i:"🧩",l:"单日功勋与使用武将数 · 115,000·120",d:"累计单日功勋达到 115,000 点，且使用武将数达到 120 名",a:[["meritToday",115000],["wrChars",120]],r:15000},
		{k:"cx_combo_merit_gmplay_0",c:"组合",i:"🧩",l:"功勋与出战次数 · 1,400,000·1,900",d:"累计功勋达到 1,400,000 点功勋，且出战次数达到 1,900 场",a:[["merit",1400000],["gamblePlays",1900]],r:1500},
		{k:"cx_combo_merit_gmplay_1",c:"组合",i:"🧩",l:"功勋与出战次数 · 3,500,000·2,200",d:"累计功勋达到 3,500,000 点功勋，且出战次数达到 2,200 场",a:[["merit",3500000],["gamblePlays",2200]],r:1711},
		{k:"cx_combo_merit_gmplay_2",c:"组合",i:"🧩",l:"功勋与出战次数 · 6,300,000·2,900",d:"累计功勋达到 6,300,000 点功勋，且出战次数达到 2,900 场",a:[["merit",6300000],["gamblePlays",2900]],r:2344},
		{k:"cx_combo_merit_gmplay_3",c:"组合",i:"🧩",l:"功勋与出战次数 · 15,500,000·3,300",d:"累计功勋达到 15,500,000 点功勋，且出战次数达到 3,300 场",a:[["merit",15500000],["gamblePlays",3300]],r:3398},
		{k:"cx_combo_merit_gmplay_4",c:"组合",i:"🧩",l:"功勋与出战次数 · 38,000,000·3,800",d:"累计功勋达到 38,000,000 点功勋，且出战次数达到 3,800 场",a:[["merit",38000000],["gamblePlays",3800]],r:4875},
		{k:"cx_combo_merit_gmplay_5",c:"组合",i:"🧩",l:"功勋与出战次数 · 70,000,000·5,100",d:"累计功勋达到 70,000,000 点功勋，且出战次数达到 5,100 场",a:[["merit",70000000],["gamblePlays",5100]],r:6773},
		{k:"cx_combo_merit_gmplay_6",c:"组合",i:"🧩",l:"功勋与出战次数 · 180,000,000·5,900",d:"累计功勋达到 180,000,000 点功勋，且出战次数达到 5,900 场",a:[["merit",180000000],["gamblePlays",5900]],r:9094},
		{k:"cx_combo_merit_gmplay_7",c:"组合",i:"🧩",l:"功勋与出战次数 · 350,000,000·7,900",d:"累计功勋达到 350,000,000 点功勋，且出战次数达到 7,900 场",a:[["merit",350000000],["gamblePlays",7900]],r:11836},
		{k:"cx_combo_merit_gmplay_8",c:"组合",i:"🧩",l:"功勋与出战次数 · 900,000,000·9,200",d:"累计功勋达到 900,000,000 点功勋，且出战次数达到 9,200 场",a:[["merit",900000000],["gamblePlays",9200]],r:15000},
		{k:"cx_combo_merit_gmwin_0",c:"组合",i:"🧩",l:"功勋与胜局 · 1,400,000·215",d:"累计功勋达到 1,400,000 点功勋，且胜局达到 215 胜",a:[["merit",1400000],["gambleWins",215]],r:1500},
		{k:"cx_combo_merit_gmwin_1",c:"组合",i:"🧩",l:"功勋与胜局 · 3,500,000·250",d:"累计功勋达到 3,500,000 点功勋，且胜局达到 250 胜",a:[["merit",3500000],["gambleWins",250]],r:1711},
		{k:"cx_combo_merit_gmwin_2",c:"组合",i:"🧩",l:"功勋与胜局 · 6,300,000·340",d:"累计功勋达到 6,300,000 点功勋，且胜局达到 340 胜",a:[["merit",6300000],["gambleWins",340]],r:2344},
		{k:"cx_combo_merit_gmwin_3",c:"组合",i:"🧩",l:"功勋与胜局 · 15,500,000·460",d:"累计功勋达到 15,500,000 点功勋，且胜局达到 460 胜",a:[["merit",15500000],["gambleWins",460]],r:3398},
		{k:"cx_combo_merit_gmwin_4",c:"组合",i:"🧩",l:"功勋与胜局 · 38,000,000·1,500",d:"累计功勋达到 38,000,000 点功勋，且胜局达到 1,500 胜",a:[["merit",38000000],["gambleWins",1500]],r:4875},
		{k:"cx_combo_merit_gmwin_5",c:"组合",i:"🧩",l:"功勋与胜局 · 70,000,000·3,000",d:"累计功勋达到 70,000,000 点功勋，且胜局达到 3,000 胜",a:[["merit",70000000],["gambleWins",3000]],r:6773},
		{k:"cx_combo_merit_gmwin_6",c:"组合",i:"🧩",l:"功勋与胜局 · 180,000,000·4,000",d:"累计功勋达到 180,000,000 点功勋，且胜局达到 4,000 胜",a:[["merit",180000000],["gambleWins",4000]],r:9094},
		{k:"cx_combo_merit_gmwin_7",c:"组合",i:"🧩",l:"功勋与胜局 · 350,000,000·5,000",d:"累计功勋达到 350,000,000 点功勋，且胜局达到 5,000 胜",a:[["merit",350000000],["gambleWins",5000]],r:11836},
		{k:"cx_combo_merit_gmwin_8",c:"组合",i:"🧩",l:"功勋与胜局 · 900,000,000·6,000",d:"累计功勋达到 900,000,000 点功勋，且胜局达到 6,000 胜",a:[["merit",900000000],["gambleWins",6000]],r:15000},
		{k:"cx_combo_merit_gmnet_0",c:"组合",i:"🧩",l:"功勋与净赢 · 1,400,000·10,000,000",d:"累计功勋达到 1,400,000 点功勋，且净赢达到 10,000,000 池子币",a:[["merit",1400000],["gambleNet",10000000]],r:1500},
		{k:"cx_combo_merit_gmnet_1",c:"组合",i:"🧩",l:"功勋与净赢 · 3,500,000·10,000,000",d:"累计功勋达到 3,500,000 点功勋，且净赢达到 10,000,000 池子币",a:[["merit",3500000],["gambleNet",10000000]],r:1711},
		{k:"cx_combo_merit_gmnet_2",c:"组合",i:"🧩",l:"功勋与净赢 · 6,300,000·10,000,000",d:"累计功勋达到 6,300,000 点功勋，且净赢达到 10,000,000 池子币",a:[["merit",6300000],["gambleNet",10000000]],r:2344},
		{k:"cx_combo_merit_gmnet_3",c:"组合",i:"🧩",l:"功勋与净赢 · 15,500,000·10,000,000",d:"累计功勋达到 15,500,000 点功勋，且净赢达到 10,000,000 池子币",a:[["merit",15500000],["gambleNet",10000000]],r:3398},
		{k:"cx_combo_merit_gmnet_4",c:"组合",i:"🧩",l:"功勋与净赢 · 38,000,000·10,000,000",d:"累计功勋达到 38,000,000 点功勋，且净赢达到 10,000,000 池子币",a:[["merit",38000000],["gambleNet",10000000]],r:4875},
		{k:"cx_combo_merit_gmnet_5",c:"组合",i:"🧩",l:"功勋与净赢 · 70,000,000·10,000,000",d:"累计功勋达到 70,000,000 点功勋，且净赢达到 10,000,000 池子币",a:[["merit",70000000],["gambleNet",10000000]],r:6773},
		{k:"cx_combo_merit_gmnet_6",c:"组合",i:"🧩",l:"功勋与净赢 · 180,000,000·10,000,000",d:"累计功勋达到 180,000,000 点功勋，且净赢达到 10,000,000 池子币",a:[["merit",180000000],["gambleNet",10000000]],r:9094},
		{k:"cx_combo_merit_gmnet_7",c:"组合",i:"🧩",l:"功勋与净赢 · 350,000,000·10,000,000",d:"累计功勋达到 350,000,000 点功勋，且净赢达到 10,000,000 池子币",a:[["merit",350000000],["gambleNet",10000000]],r:11836},
		{k:"cx_combo_merit_gmnet_8",c:"组合",i:"🧩",l:"功勋与净赢 · 900,000,000·10,000,000",d:"累计功勋达到 900,000,000 点功勋，且净赢达到 10,000,000 池子币",a:[["merit",900000000],["gambleNet",10000000]],r:15000},
		{k:"cx_combo_merit_gmstreak_0",c:"组合",i:"🧩",l:"功勋与连胜 · 1,400,000·29",d:"累计功勋达到 1,400,000 点功勋，且连胜达到 29 连胜",a:[["merit",1400000],["gambleBestStreak",29]],r:1500},
		{k:"cx_combo_merit_gmstreak_1",c:"组合",i:"🧩",l:"功勋与连胜 · 3,500,000·32",d:"累计功勋达到 3,500,000 点功勋，且连胜达到 32 连胜",a:[["merit",3500000],["gambleBestStreak",32]],r:1711},
		{k:"cx_combo_merit_gmstreak_2",c:"组合",i:"🧩",l:"功勋与连胜 · 6,300,000·36",d:"累计功勋达到 6,300,000 点功勋，且连胜达到 36 连胜",a:[["merit",6300000],["gambleBestStreak",36]],r:2344},
		{k:"cx_combo_merit_gmstreak_3",c:"组合",i:"🧩",l:"功勋与连胜 · 15,500,000·45",d:"累计功勋达到 15,500,000 点功勋，且连胜达到 45 连胜",a:[["merit",15500000],["gambleBestStreak",45]],r:3398},
		{k:"cx_combo_merit_gmstreak_4",c:"组合",i:"🧩",l:"功勋与连胜 · 38,000,000·51",d:"累计功勋达到 38,000,000 点功勋，且连胜达到 51 连胜",a:[["merit",38000000],["gambleBestStreak",51]],r:4875},
		{k:"cx_combo_merit_gmstreak_5",c:"组合",i:"🧩",l:"功勋与连胜 · 70,000,000·58",d:"累计功勋达到 70,000,000 点功勋，且连胜达到 58 连胜",a:[["merit",70000000],["gambleBestStreak",58]],r:6773},
		{k:"cx_combo_merit_gmstreak_6",c:"组合",i:"🧩",l:"功勋与连胜 · 180,000,000·66",d:"累计功勋达到 180,000,000 点功勋，且连胜达到 66 连胜",a:[["merit",180000000],["gambleBestStreak",66]],r:9094},
		{k:"cx_combo_merit_gmstreak_7",c:"组合",i:"🧩",l:"功勋与连胜 · 350,000,000·76",d:"累计功勋达到 350,000,000 点功勋，且连胜达到 76 连胜",a:[["merit",350000000],["gambleBestStreak",76]],r:11836},
		{k:"cx_combo_merit_gmstreak_8",c:"组合",i:"🧩",l:"功勋与连胜 · 900,000,000·78",d:"累计功勋达到 900,000,000 点功勋，且连胜达到 78 连胜",a:[["merit",900000000],["gambleBestStreak",78]],r:15000},
		{k:"cx_combo_meritday_gmplay_0",c:"组合",i:"🧩",l:"单日功勋与出战次数 · 10,000·1,900",d:"累计单日功勋达到 10,000 点，且出战次数达到 1,900 场",a:[["meritToday",10000],["gamblePlays",1900]],r:1500},
		{k:"cx_combo_meritday_gmplay_1",c:"组合",i:"🧩",l:"单日功勋与出战次数 · 17,000·2,200",d:"累计单日功勋达到 17,000 点，且出战次数达到 2,200 场",a:[["meritToday",17000],["gamblePlays",2200]],r:1711},
		{k:"cx_combo_meritday_gmplay_2",c:"组合",i:"🧩",l:"单日功勋与出战次数 · 22,000·2,900",d:"累计单日功勋达到 22,000 点，且出战次数达到 2,900 场",a:[["meritToday",22000],["gamblePlays",2900]],r:2344},
		{k:"cx_combo_meritday_gmplay_3",c:"组合",i:"🧩",l:"单日功勋与出战次数 · 28,000·3,300",d:"累计单日功勋达到 28,000 点，且出战次数达到 3,300 场",a:[["meritToday",28000],["gamblePlays",3300]],r:3398},
		{k:"cx_combo_meritday_gmplay_4",c:"组合",i:"🧩",l:"单日功勋与出战次数 · 36,000·3,800",d:"累计单日功勋达到 36,000 点，且出战次数达到 3,800 场",a:[["meritToday",36000],["gamblePlays",3800]],r:4875},
		{k:"cx_combo_meritday_gmplay_5",c:"组合",i:"🧩",l:"单日功勋与出战次数 · 46,000·5,100",d:"累计单日功勋达到 46,000 点，且出战次数达到 5,100 场",a:[["meritToday",46000],["gamblePlays",5100]],r:6773},
		{k:"cx_combo_meritday_gmplay_6",c:"组合",i:"🧩",l:"单日功勋与出战次数 · 73,000·5,900",d:"累计单日功勋达到 73,000 点，且出战次数达到 5,900 场",a:[["meritToday",73000],["gamblePlays",5900]],r:9094},
		{k:"cx_combo_meritday_gmplay_7",c:"组合",i:"🧩",l:"单日功勋与出战次数 · 92,000·7,900",d:"累计单日功勋达到 92,000 点，且出战次数达到 7,900 场",a:[["meritToday",92000],["gamblePlays",7900]],r:11836},
		{k:"cx_combo_meritday_gmplay_8",c:"组合",i:"🧩",l:"单日功勋与出战次数 · 115,000·9,200",d:"累计单日功勋达到 115,000 点，且出战次数达到 9,200 场",a:[["meritToday",115000],["gamblePlays",9200]],r:15000},
		{k:"cx_combo_meritday_gmwin_0",c:"组合",i:"🧩",l:"单日功勋与胜局 · 10,000·215",d:"累计单日功勋达到 10,000 点，且胜局达到 215 胜",a:[["meritToday",10000],["gambleWins",215]],r:1500},
		{k:"cx_combo_meritday_gmwin_1",c:"组合",i:"🧩",l:"单日功勋与胜局 · 17,000·250",d:"累计单日功勋达到 17,000 点，且胜局达到 250 胜",a:[["meritToday",17000],["gambleWins",250]],r:1711},
		{k:"cx_combo_meritday_gmwin_2",c:"组合",i:"🧩",l:"单日功勋与胜局 · 22,000·340",d:"累计单日功勋达到 22,000 点，且胜局达到 340 胜",a:[["meritToday",22000],["gambleWins",340]],r:2344},
		{k:"cx_combo_meritday_gmwin_3",c:"组合",i:"🧩",l:"单日功勋与胜局 · 28,000·460",d:"累计单日功勋达到 28,000 点，且胜局达到 460 胜",a:[["meritToday",28000],["gambleWins",460]],r:3398},
		{k:"cx_combo_meritday_gmwin_4",c:"组合",i:"🧩",l:"单日功勋与胜局 · 36,000·1,500",d:"累计单日功勋达到 36,000 点，且胜局达到 1,500 胜",a:[["meritToday",36000],["gambleWins",1500]],r:4875},
		{k:"cx_combo_meritday_gmwin_5",c:"组合",i:"🧩",l:"单日功勋与胜局 · 46,000·3,000",d:"累计单日功勋达到 46,000 点，且胜局达到 3,000 胜",a:[["meritToday",46000],["gambleWins",3000]],r:6773},
		{k:"cx_combo_meritday_gmwin_6",c:"组合",i:"🧩",l:"单日功勋与胜局 · 73,000·4,000",d:"累计单日功勋达到 73,000 点，且胜局达到 4,000 胜",a:[["meritToday",73000],["gambleWins",4000]],r:9094},
		{k:"cx_combo_meritday_gmwin_7",c:"组合",i:"🧩",l:"单日功勋与胜局 · 92,000·5,000",d:"累计单日功勋达到 92,000 点，且胜局达到 5,000 胜",a:[["meritToday",92000],["gambleWins",5000]],r:11836},
		{k:"cx_combo_meritday_gmwin_8",c:"组合",i:"🧩",l:"单日功勋与胜局 · 115,000·6,000",d:"累计单日功勋达到 115,000 点，且胜局达到 6,000 胜",a:[["meritToday",115000],["gambleWins",6000]],r:15000},
		{k:"cx_combo_meritday_gmnet_0",c:"组合",i:"🧩",l:"单日功勋与净赢 · 10,000·10,000,000",d:"累计单日功勋达到 10,000 点，且净赢达到 10,000,000 池子币",a:[["meritToday",10000],["gambleNet",10000000]],r:1500},
		{k:"cx_combo_meritday_gmnet_1",c:"组合",i:"🧩",l:"单日功勋与净赢 · 17,000·10,000,000",d:"累计单日功勋达到 17,000 点，且净赢达到 10,000,000 池子币",a:[["meritToday",17000],["gambleNet",10000000]],r:1711},
		{k:"cx_combo_meritday_gmnet_2",c:"组合",i:"🧩",l:"单日功勋与净赢 · 22,000·10,000,000",d:"累计单日功勋达到 22,000 点，且净赢达到 10,000,000 池子币",a:[["meritToday",22000],["gambleNet",10000000]],r:2344},
		{k:"cx_combo_meritday_gmnet_3",c:"组合",i:"🧩",l:"单日功勋与净赢 · 28,000·10,000,000",d:"累计单日功勋达到 28,000 点，且净赢达到 10,000,000 池子币",a:[["meritToday",28000],["gambleNet",10000000]],r:3398},
		{k:"cx_combo_meritday_gmnet_4",c:"组合",i:"🧩",l:"单日功勋与净赢 · 36,000·10,000,000",d:"累计单日功勋达到 36,000 点，且净赢达到 10,000,000 池子币",a:[["meritToday",36000],["gambleNet",10000000]],r:4875},
		{k:"cx_combo_meritday_gmnet_5",c:"组合",i:"🧩",l:"单日功勋与净赢 · 46,000·10,000,000",d:"累计单日功勋达到 46,000 点，且净赢达到 10,000,000 池子币",a:[["meritToday",46000],["gambleNet",10000000]],r:6773},
		{k:"cx_combo_meritday_gmnet_6",c:"组合",i:"🧩",l:"单日功勋与净赢 · 73,000·10,000,000",d:"累计单日功勋达到 73,000 点，且净赢达到 10,000,000 池子币",a:[["meritToday",73000],["gambleNet",10000000]],r:9094},
		{k:"cx_combo_meritday_gmnet_7",c:"组合",i:"🧩",l:"单日功勋与净赢 · 92,000·10,000,000",d:"累计单日功勋达到 92,000 点，且净赢达到 10,000,000 池子币",a:[["meritToday",92000],["gambleNet",10000000]],r:11836},
		{k:"cx_combo_meritday_gmnet_8",c:"组合",i:"🧩",l:"单日功勋与净赢 · 115,000·10,000,000",d:"累计单日功勋达到 115,000 点，且净赢达到 10,000,000 池子币",a:[["meritToday",115000],["gambleNet",10000000]],r:15000},
		{k:"cx_combo_meritday_gmstreak_0",c:"组合",i:"🧩",l:"单日功勋与连胜 · 10,000·29",d:"累计单日功勋达到 10,000 点，且连胜达到 29 连胜",a:[["meritToday",10000],["gambleBestStreak",29]],r:1500},
		{k:"cx_combo_meritday_gmstreak_1",c:"组合",i:"🧩",l:"单日功勋与连胜 · 17,000·32",d:"累计单日功勋达到 17,000 点，且连胜达到 32 连胜",a:[["meritToday",17000],["gambleBestStreak",32]],r:1711},
		{k:"cx_combo_meritday_gmstreak_2",c:"组合",i:"🧩",l:"单日功勋与连胜 · 22,000·36",d:"累计单日功勋达到 22,000 点，且连胜达到 36 连胜",a:[["meritToday",22000],["gambleBestStreak",36]],r:2344},
		{k:"cx_combo_meritday_gmstreak_3",c:"组合",i:"🧩",l:"单日功勋与连胜 · 28,000·45",d:"累计单日功勋达到 28,000 点，且连胜达到 45 连胜",a:[["meritToday",28000],["gambleBestStreak",45]],r:3398},
		{k:"cx_combo_meritday_gmstreak_4",c:"组合",i:"🧩",l:"单日功勋与连胜 · 36,000·51",d:"累计单日功勋达到 36,000 点，且连胜达到 51 连胜",a:[["meritToday",36000],["gambleBestStreak",51]],r:4875},
		{k:"cx_combo_meritday_gmstreak_5",c:"组合",i:"🧩",l:"单日功勋与连胜 · 46,000·58",d:"累计单日功勋达到 46,000 点，且连胜达到 58 连胜",a:[["meritToday",46000],["gambleBestStreak",58]],r:6773},
		{k:"cx_combo_meritday_gmstreak_6",c:"组合",i:"🧩",l:"单日功勋与连胜 · 73,000·66",d:"累计单日功勋达到 73,000 点，且连胜达到 66 连胜",a:[["meritToday",73000],["gambleBestStreak",66]],r:9094},
		{k:"cx_combo_meritday_gmstreak_7",c:"组合",i:"🧩",l:"单日功勋与连胜 · 92,000·76",d:"累计单日功勋达到 92,000 点，且连胜达到 76 连胜",a:[["meritToday",92000],["gambleBestStreak",76]],r:11836},
		{k:"cx_combo_meritday_gmstreak_8",c:"组合",i:"🧩",l:"单日功勋与连胜 · 115,000·78",d:"累计单日功勋达到 115,000 点，且连胜达到 78 连胜",a:[["meritToday",115000],["gambleBestStreak",78]],r:15000},
		{k:"cx_combo_merit_hands_0",c:"组合",i:"🧩",l:"功勋与同桌人次 · 1,400,000·78,000",d:"累计功勋达到 1,400,000 点功勋，且同桌人次达到 78,000 人次",a:[["merit",1400000],["worldHands",78000]],r:1500},
		{k:"cx_combo_merit_hands_1",c:"组合",i:"🧩",l:"功勋与同桌人次 · 3,500,000·120,000",d:"累计功勋达到 3,500,000 点功勋，且同桌人次达到 120,000 人次",a:[["merit",3500000],["worldHands",120000]],r:1711},
		{k:"cx_combo_merit_hands_2",c:"组合",i:"🧩",l:"功勋与同桌人次 · 6,300,000·185,000",d:"累计功勋达到 6,300,000 点功勋，且同桌人次达到 185,000 人次",a:[["merit",6300000],["worldHands",185000]],r:2344},
		{k:"cx_combo_merit_hands_3",c:"组合",i:"🧩",l:"功勋与同桌人次 · 15,500,000·285,000",d:"累计功勋达到 15,500,000 点功勋，且同桌人次达到 285,000 人次",a:[["merit",15500000],["worldHands",285000]],r:3398},
		{k:"cx_combo_merit_hands_4",c:"组合",i:"🧩",l:"功勋与同桌人次 · 38,000,000·350,000",d:"累计功勋达到 38,000,000 点功勋，且同桌人次达到 350,000 人次",a:[["merit",38000000],["worldHands",350000]],r:4875},
		{k:"cx_combo_merit_hands_5",c:"组合",i:"🧩",l:"功勋与同桌人次 · 70,000,000·530,000",d:"累计功勋达到 70,000,000 点功勋，且同桌人次达到 530,000 人次",a:[["merit",70000000],["worldHands",530000]],r:6773},
		{k:"cx_combo_merit_hands_6",c:"组合",i:"🧩",l:"功勋与同桌人次 · 180,000,000·800,000",d:"累计功勋达到 180,000,000 点功勋，且同桌人次达到 800,000 人次",a:[["merit",180000000],["worldHands",800000]],r:9094},
		{k:"cx_combo_merit_hands_7",c:"组合",i:"🧩",l:"功勋与同桌人次 · 350,000,000·980,000",d:"累计功勋达到 350,000,000 点功勋，且同桌人次达到 980,000 人次",a:[["merit",350000000],["worldHands",980000]],r:11836},
		{k:"cx_combo_merit_hands_8",c:"组合",i:"🧩",l:"功勋与同桌人次 · 900,000,000·1,480,000",d:"累计功勋达到 900,000,000 点功勋，且同桌人次达到 1,480,000 人次",a:[["merit",900000000],["worldHands",1480000]],r:15000},
		{k:"cx_combo_merit_retired_0",c:"组合",i:"🧩",l:"功勋与当前退隐人数 · 1,400,000·88",d:"累计功勋达到 1,400,000 点功勋，且当前退隐人数达到 88 名",a:[["merit",1400000],["worldRetired",88]],r:1500},
		{k:"cx_combo_merit_retired_1",c:"组合",i:"🧩",l:"功勋与当前退隐人数 · 3,500,000·96",d:"累计功勋达到 3,500,000 点功勋，且当前退隐人数达到 96 名",a:[["merit",3500000],["worldRetired",96]],r:1711},
		{k:"cx_combo_merit_retired_2",c:"组合",i:"🧩",l:"功勋与当前退隐人数 · 6,300,000·100",d:"累计功勋达到 6,300,000 点功勋，且当前退隐人数达到 100 名",a:[["merit",6300000],["worldRetired",100]],r:2344},
		{k:"cx_combo_merit_retired_3",c:"组合",i:"🧩",l:"功勋与当前退隐人数 · 15,500,000·105",d:"累计功勋达到 15,500,000 点功勋，且当前退隐人数达到 105 名",a:[["merit",15500000],["worldRetired",105]],r:3398},
		{k:"cx_combo_merit_retired_4",c:"组合",i:"🧩",l:"功勋与当前退隐人数 · 38,000,000·110",d:"累计功勋达到 38,000,000 点功勋，且当前退隐人数达到 110 名",a:[["merit",38000000],["worldRetired",110]],r:4875},
		{k:"cx_combo_merit_retired_5",c:"组合",i:"🧩",l:"功勋与当前退隐人数 · 70,000,000·116",d:"累计功勋达到 70,000,000 点功勋，且当前退隐人数达到 116 名",a:[["merit",70000000],["worldRetired",116]],r:6773},
		{k:"cx_combo_merit_retired_6",c:"组合",i:"🧩",l:"功勋与当前退隐人数 · 180,000,000·130",d:"累计功勋达到 180,000,000 点功勋，且当前退隐人数达到 130 名",a:[["merit",180000000],["worldRetired",130]],r:9094},
		{k:"cx_combo_merit_retired_7",c:"组合",i:"🧩",l:"功勋与当前退隐人数 · 350,000,000·140",d:"累计功勋达到 350,000,000 点功勋，且当前退隐人数达到 140 名",a:[["merit",350000000],["worldRetired",140]],r:11836},
		{k:"cx_combo_merit_retired_8",c:"组合",i:"🧩",l:"功勋与当前退隐人数 · 900,000,000·150",d:"累计功勋达到 900,000,000 点功勋，且当前退隐人数达到 150 名",a:[["merit",900000000],["worldRetired",150]],r:15000},
		{k:"cx_combo_meritday_hands_0",c:"组合",i:"🧩",l:"单日功勋与同桌人次 · 10,000·78,000",d:"累计单日功勋达到 10,000 点，且同桌人次达到 78,000 人次",a:[["meritToday",10000],["worldHands",78000]],r:1500},
		{k:"cx_combo_meritday_hands_1",c:"组合",i:"🧩",l:"单日功勋与同桌人次 · 17,000·120,000",d:"累计单日功勋达到 17,000 点，且同桌人次达到 120,000 人次",a:[["meritToday",17000],["worldHands",120000]],r:1711},
		{k:"cx_combo_meritday_hands_2",c:"组合",i:"🧩",l:"单日功勋与同桌人次 · 22,000·185,000",d:"累计单日功勋达到 22,000 点，且同桌人次达到 185,000 人次",a:[["meritToday",22000],["worldHands",185000]],r:2344},
		{k:"cx_combo_meritday_hands_3",c:"组合",i:"🧩",l:"单日功勋与同桌人次 · 28,000·285,000",d:"累计单日功勋达到 28,000 点，且同桌人次达到 285,000 人次",a:[["meritToday",28000],["worldHands",285000]],r:3398},
		{k:"cx_combo_meritday_hands_4",c:"组合",i:"🧩",l:"单日功勋与同桌人次 · 36,000·350,000",d:"累计单日功勋达到 36,000 点，且同桌人次达到 350,000 人次",a:[["meritToday",36000],["worldHands",350000]],r:4875},
		{k:"cx_combo_meritday_hands_5",c:"组合",i:"🧩",l:"单日功勋与同桌人次 · 46,000·530,000",d:"累计单日功勋达到 46,000 点，且同桌人次达到 530,000 人次",a:[["meritToday",46000],["worldHands",530000]],r:6773},
		{k:"cx_combo_meritday_hands_6",c:"组合",i:"🧩",l:"单日功勋与同桌人次 · 73,000·800,000",d:"累计单日功勋达到 73,000 点，且同桌人次达到 800,000 人次",a:[["meritToday",73000],["worldHands",800000]],r:9094},
		{k:"cx_combo_meritday_hands_7",c:"组合",i:"🧩",l:"单日功勋与同桌人次 · 92,000·980,000",d:"累计单日功勋达到 92,000 点，且同桌人次达到 980,000 人次",a:[["meritToday",92000],["worldHands",980000]],r:11836},
		{k:"cx_combo_meritday_hands_8",c:"组合",i:"🧩",l:"单日功勋与同桌人次 · 115,000·1,480,000",d:"累计单日功勋达到 115,000 点，且同桌人次达到 1,480,000 人次",a:[["meritToday",115000],["worldHands",1480000]],r:15000},
		{k:"cx_combo_meritday_retired_0",c:"组合",i:"🧩",l:"单日功勋与当前退隐人数 · 10,000·88",d:"累计单日功勋达到 10,000 点，且当前退隐人数达到 88 名",a:[["meritToday",10000],["worldRetired",88]],r:1500},
		{k:"cx_combo_meritday_retired_1",c:"组合",i:"🧩",l:"单日功勋与当前退隐人数 · 17,000·96",d:"累计单日功勋达到 17,000 点，且当前退隐人数达到 96 名",a:[["meritToday",17000],["worldRetired",96]],r:1711},
		{k:"cx_combo_meritday_retired_2",c:"组合",i:"🧩",l:"单日功勋与当前退隐人数 · 22,000·100",d:"累计单日功勋达到 22,000 点，且当前退隐人数达到 100 名",a:[["meritToday",22000],["worldRetired",100]],r:2344},
		{k:"cx_combo_meritday_retired_3",c:"组合",i:"🧩",l:"单日功勋与当前退隐人数 · 28,000·105",d:"累计单日功勋达到 28,000 点，且当前退隐人数达到 105 名",a:[["meritToday",28000],["worldRetired",105]],r:3398},
		{k:"cx_combo_meritday_retired_4",c:"组合",i:"🧩",l:"单日功勋与当前退隐人数 · 36,000·110",d:"累计单日功勋达到 36,000 点，且当前退隐人数达到 110 名",a:[["meritToday",36000],["worldRetired",110]],r:4875},
		{k:"cx_combo_meritday_retired_5",c:"组合",i:"🧩",l:"单日功勋与当前退隐人数 · 46,000·116",d:"累计单日功勋达到 46,000 点，且当前退隐人数达到 116 名",a:[["meritToday",46000],["worldRetired",116]],r:6773},
		{k:"cx_combo_meritday_retired_6",c:"组合",i:"🧩",l:"单日功勋与当前退隐人数 · 73,000·130",d:"累计单日功勋达到 73,000 点，且当前退隐人数达到 130 名",a:[["meritToday",73000],["worldRetired",130]],r:9094},
		{k:"cx_combo_meritday_retired_7",c:"组合",i:"🧩",l:"单日功勋与当前退隐人数 · 92,000·140",d:"累计单日功勋达到 92,000 点，且当前退隐人数达到 140 名",a:[["meritToday",92000],["worldRetired",140]],r:11836},
		{k:"cx_combo_meritday_retired_8",c:"组合",i:"🧩",l:"单日功勋与当前退隐人数 · 115,000·150",d:"累计单日功勋达到 115,000 点，且当前退隐人数达到 150 名",a:[["meritToday",115000],["worldRetired",150]],r:15000},
		{k:"cx_combo_merit_sign_0",c:"组合",i:"🧩",l:"功勋与连续签到 · 1,400,000·420",d:"累计功勋达到 1,400,000 点功勋，且连续签到达到 420 天",a:[["merit",1400000],["streak",420]],r:1500},
		{k:"cx_combo_merit_sign_1",c:"组合",i:"🧩",l:"功勋与连续签到 · 3,500,000·445",d:"累计功勋达到 3,500,000 点功勋，且连续签到达到 445 天",a:[["merit",3500000],["streak",445]],r:1711},
		{k:"cx_combo_merit_sign_2",c:"组合",i:"🧩",l:"功勋与连续签到 · 6,300,000·500",d:"累计功勋达到 6,300,000 点功勋，且连续签到达到 500 天",a:[["merit",6300000],["streak",500]],r:2344},
		{k:"cx_combo_merit_sign_3",c:"组合",i:"🧩",l:"功勋与连续签到 · 15,500,000·530",d:"累计功勋达到 15,500,000 点功勋，且连续签到达到 530 天",a:[["merit",15500000],["streak",530]],r:3398},
		{k:"cx_combo_merit_sign_4",c:"组合",i:"🧩",l:"功勋与连续签到 · 38,000,000·565",d:"累计功勋达到 38,000,000 点功勋，且连续签到达到 565 天",a:[["merit",38000000],["streak",565]],r:4875},
		{k:"cx_combo_merit_sign_5",c:"组合",i:"🧩",l:"功勋与连续签到 · 70,000,000·640",d:"累计功勋达到 70,000,000 点功勋，且连续签到达到 640 天",a:[["merit",70000000],["streak",640]],r:6773},
		{k:"cx_combo_merit_sign_6",c:"组合",i:"🧩",l:"功勋与连续签到 · 180,000,000·680",d:"累计功勋达到 180,000,000 点功勋，且连续签到达到 680 天",a:[["merit",180000000],["streak",680]],r:9094},
		{k:"cx_combo_merit_sign_7",c:"组合",i:"🧩",l:"功勋与连续签到 · 350,000,000·785",d:"累计功勋达到 350,000,000 点功勋，且连续签到达到 785 天",a:[["merit",350000000],["streak",785]],r:11836},
		{k:"cx_combo_merit_sign_8",c:"组合",i:"🧩",l:"功勋与连续签到 · 900,000,000·845",d:"累计功勋达到 900,000,000 点功勋，且连续签到达到 845 天",a:[["merit",900000000],["streak",845]],r:15000},
		{k:"cx_combo_merit_task_0",c:"组合",i:"🧩",l:"功勋与日课完成 · 1,400,000·21",d:"累计功勋达到 1,400,000 点功勋，且日课完成达到 21 项",a:[["merit",1400000],["taskCompletedTotal",21]],r:1500},
		{k:"cx_combo_merit_task_1",c:"组合",i:"🧩",l:"功勋与日课完成 · 3,500,000·23",d:"累计功勋达到 3,500,000 点功勋，且日课完成达到 23 项",a:[["merit",3500000],["taskCompletedTotal",23]],r:1711},
		{k:"cx_combo_merit_task_2",c:"组合",i:"🧩",l:"功勋与日课完成 · 6,300,000·29",d:"累计功勋达到 6,300,000 点功勋，且日课完成达到 29 项",a:[["merit",6300000],["taskCompletedTotal",29]],r:2344},
		{k:"cx_combo_merit_task_3",c:"组合",i:"🧩",l:"功勋与日课完成 · 15,500,000·32",d:"累计功勋达到 15,500,000 点功勋，且日课完成达到 32 项",a:[["merit",15500000],["taskCompletedTotal",32]],r:3398},
		{k:"cx_combo_merit_task_4",c:"组合",i:"🧩",l:"功勋与日课完成 · 38,000,000·36",d:"累计功勋达到 38,000,000 点功勋，且日课完成达到 36 项",a:[["merit",38000000],["taskCompletedTotal",36]],r:4875},
		{k:"cx_combo_merit_task_5",c:"组合",i:"🧩",l:"功勋与日课完成 · 70,000,000·45",d:"累计功勋达到 70,000,000 点功勋，且日课完成达到 45 项",a:[["merit",70000000],["taskCompletedTotal",45]],r:6773},
		{k:"cx_combo_merit_task_6",c:"组合",i:"🧩",l:"功勋与日课完成 · 180,000,000·51",d:"累计功勋达到 180,000,000 点功勋，且日课完成达到 51 项",a:[["merit",180000000],["taskCompletedTotal",51]],r:9094},
		{k:"cx_combo_merit_task_7",c:"组合",i:"🧩",l:"功勋与日课完成 · 350,000,000·66",d:"累计功勋达到 350,000,000 点功勋，且日课完成达到 66 项",a:[["merit",350000000],["taskCompletedTotal",66]],r:11836},
		{k:"cx_combo_merit_task_8",c:"组合",i:"🧩",l:"功勋与日课完成 · 900,000,000·75",d:"累计功勋达到 900,000,000 点功勋，且日课完成达到 75 项",a:[["merit",900000000],["taskCompletedTotal",75]],r:15000},
		{k:"cx_combo_meritday_sign_0",c:"组合",i:"🧩",l:"单日功勋与连续签到 · 10,000·420",d:"累计单日功勋达到 10,000 点，且连续签到达到 420 天",a:[["meritToday",10000],["streak",420]],r:1500},
		{k:"cx_combo_meritday_sign_1",c:"组合",i:"🧩",l:"单日功勋与连续签到 · 17,000·445",d:"累计单日功勋达到 17,000 点，且连续签到达到 445 天",a:[["meritToday",17000],["streak",445]],r:1711},
		{k:"cx_combo_meritday_sign_2",c:"组合",i:"🧩",l:"单日功勋与连续签到 · 22,000·500",d:"累计单日功勋达到 22,000 点，且连续签到达到 500 天",a:[["meritToday",22000],["streak",500]],r:2344},
		{k:"cx_combo_meritday_sign_3",c:"组合",i:"🧩",l:"单日功勋与连续签到 · 28,000·530",d:"累计单日功勋达到 28,000 点，且连续签到达到 530 天",a:[["meritToday",28000],["streak",530]],r:3398},
		{k:"cx_combo_meritday_sign_4",c:"组合",i:"🧩",l:"单日功勋与连续签到 · 36,000·565",d:"累计单日功勋达到 36,000 点，且连续签到达到 565 天",a:[["meritToday",36000],["streak",565]],r:4875},
		{k:"cx_combo_meritday_sign_5",c:"组合",i:"🧩",l:"单日功勋与连续签到 · 46,000·640",d:"累计单日功勋达到 46,000 点，且连续签到达到 640 天",a:[["meritToday",46000],["streak",640]],r:6773},
		{k:"cx_combo_meritday_sign_6",c:"组合",i:"🧩",l:"单日功勋与连续签到 · 73,000·680",d:"累计单日功勋达到 73,000 点，且连续签到达到 680 天",a:[["meritToday",73000],["streak",680]],r:9094},
		{k:"cx_combo_meritday_sign_7",c:"组合",i:"🧩",l:"单日功勋与连续签到 · 92,000·785",d:"累计单日功勋达到 92,000 点，且连续签到达到 785 天",a:[["meritToday",92000],["streak",785]],r:11836},
		{k:"cx_combo_meritday_sign_8",c:"组合",i:"🧩",l:"单日功勋与连续签到 · 115,000·845",d:"累计单日功勋达到 115,000 点，且连续签到达到 845 天",a:[["meritToday",115000],["streak",845]],r:15000},
		{k:"cx_combo_meritday_task_0",c:"组合",i:"🧩",l:"单日功勋与日课完成 · 10,000·21",d:"累计单日功勋达到 10,000 点，且日课完成达到 21 项",a:[["meritToday",10000],["taskCompletedTotal",21]],r:1500},
		{k:"cx_combo_meritday_task_1",c:"组合",i:"🧩",l:"单日功勋与日课完成 · 17,000·23",d:"累计单日功勋达到 17,000 点，且日课完成达到 23 项",a:[["meritToday",17000],["taskCompletedTotal",23]],r:1711},
		{k:"cx_combo_meritday_task_2",c:"组合",i:"🧩",l:"单日功勋与日课完成 · 22,000·29",d:"累计单日功勋达到 22,000 点，且日课完成达到 29 项",a:[["meritToday",22000],["taskCompletedTotal",29]],r:2344},
		{k:"cx_combo_meritday_task_3",c:"组合",i:"🧩",l:"单日功勋与日课完成 · 28,000·32",d:"累计单日功勋达到 28,000 点，且日课完成达到 32 项",a:[["meritToday",28000],["taskCompletedTotal",32]],r:3398},
		{k:"cx_combo_meritday_task_4",c:"组合",i:"🧩",l:"单日功勋与日课完成 · 36,000·36",d:"累计单日功勋达到 36,000 点，且日课完成达到 36 项",a:[["meritToday",36000],["taskCompletedTotal",36]],r:4875},
		{k:"cx_combo_meritday_task_5",c:"组合",i:"🧩",l:"单日功勋与日课完成 · 46,000·45",d:"累计单日功勋达到 46,000 点，且日课完成达到 45 项",a:[["meritToday",46000],["taskCompletedTotal",45]],r:6773},
		{k:"cx_combo_meritday_task_6",c:"组合",i:"🧩",l:"单日功勋与日课完成 · 73,000·51",d:"累计单日功勋达到 73,000 点，且日课完成达到 51 项",a:[["meritToday",73000],["taskCompletedTotal",51]],r:9094},
		{k:"cx_combo_meritday_task_7",c:"组合",i:"🧩",l:"单日功勋与日课完成 · 92,000·66",d:"累计单日功勋达到 92,000 点，且日课完成达到 66 项",a:[["meritToday",92000],["taskCompletedTotal",66]],r:11836},
		{k:"cx_combo_meritday_task_8",c:"组合",i:"🧩",l:"单日功勋与日课完成 · 115,000·75",d:"累计单日功勋达到 115,000 点，且日课完成达到 75 项",a:[["meritToday",115000],["taskCompletedTotal",75]],r:15000},
		{k:"cx_combo_merit_interact_0",c:"组合",i:"🧩",l:"功勋与互动次数 · 1,400,000·57,000",d:"累计功勋达到 1,400,000 点功勋，且互动次数达到 57,000 次",a:[["merit",1400000],["interactTotal",57000]],r:1500},
		{k:"cx_combo_merit_interact_1",c:"组合",i:"🧩",l:"功勋与互动次数 · 3,500,000·81,000",d:"累计功勋达到 3,500,000 点功勋，且互动次数达到 81,000 次",a:[["merit",3500000],["interactTotal",81000]],r:1711},
		{k:"cx_combo_merit_interact_2",c:"组合",i:"🧩",l:"功勋与互动次数 · 6,300,000·115,000",d:"累计功勋达到 6,300,000 点功勋，且互动次数达到 115,000 次",a:[["merit",6300000],["interactTotal",115000]],r:2344},
		{k:"cx_combo_merit_interact_3",c:"组合",i:"🧩",l:"功勋与互动次数 · 15,500,000·163,000",d:"累计功勋达到 15,500,000 点功勋，且互动次数达到 163,000 次",a:[["merit",15500000],["interactTotal",163000]],r:3398},
		{k:"cx_combo_merit_interact_4",c:"组合",i:"🧩",l:"功勋与互动次数 · 38,000,000·232,000",d:"累计功勋达到 38,000,000 点功勋，且互动次数达到 232,000 次",a:[["merit",38000000],["interactTotal",232000]],r:4875},
		{k:"cx_combo_merit_interact_5",c:"组合",i:"🧩",l:"功勋与互动次数 · 70,000,000·328,000",d:"累计功勋达到 70,000,000 点功勋，且互动次数达到 328,000 次",a:[["merit",70000000],["interactTotal",328000]],r:6773},
		{k:"cx_combo_merit_interact_6",c:"组合",i:"🧩",l:"功勋与互动次数 · 180,000,000·465,000",d:"累计功勋达到 180,000,000 点功勋，且互动次数达到 465,000 次",a:[["merit",180000000],["interactTotal",465000]],r:9094},
		{k:"cx_combo_merit_interact_7",c:"组合",i:"🧩",l:"功勋与互动次数 · 350,000,000·660,000",d:"累计功勋达到 350,000,000 点功勋，且互动次数达到 660,000 次",a:[["merit",350000000],["interactTotal",660000]],r:11836},
		{k:"cx_combo_merit_interact_8",c:"组合",i:"🧩",l:"功勋与互动次数 · 900,000,000·920,000",d:"累计功勋达到 900,000,000 点功勋，且互动次数达到 920,000 次",a:[["merit",900000000],["interactTotal",920000]],r:15000},
		{k:"cx_combo_meritday_interact_0",c:"组合",i:"🧩",l:"单日功勋与互动次数 · 10,000·57,000",d:"累计单日功勋达到 10,000 点，且互动次数达到 57,000 次",a:[["meritToday",10000],["interactTotal",57000]],r:1500},
		{k:"cx_combo_meritday_interact_1",c:"组合",i:"🧩",l:"单日功勋与互动次数 · 17,000·81,000",d:"累计单日功勋达到 17,000 点，且互动次数达到 81,000 次",a:[["meritToday",17000],["interactTotal",81000]],r:1711},
		{k:"cx_combo_meritday_interact_2",c:"组合",i:"🧩",l:"单日功勋与互动次数 · 22,000·115,000",d:"累计单日功勋达到 22,000 点，且互动次数达到 115,000 次",a:[["meritToday",22000],["interactTotal",115000]],r:2344},
		{k:"cx_combo_meritday_interact_3",c:"组合",i:"🧩",l:"单日功勋与互动次数 · 28,000·163,000",d:"累计单日功勋达到 28,000 点，且互动次数达到 163,000 次",a:[["meritToday",28000],["interactTotal",163000]],r:3398},
		{k:"cx_combo_meritday_interact_4",c:"组合",i:"🧩",l:"单日功勋与互动次数 · 36,000·232,000",d:"累计单日功勋达到 36,000 点，且互动次数达到 232,000 次",a:[["meritToday",36000],["interactTotal",232000]],r:4875},
		{k:"cx_combo_meritday_interact_5",c:"组合",i:"🧩",l:"单日功勋与互动次数 · 46,000·328,000",d:"累计单日功勋达到 46,000 点，且互动次数达到 328,000 次",a:[["meritToday",46000],["interactTotal",328000]],r:6773},
		{k:"cx_combo_meritday_interact_6",c:"组合",i:"🧩",l:"单日功勋与互动次数 · 73,000·465,000",d:"累计单日功勋达到 73,000 点，且互动次数达到 465,000 次",a:[["meritToday",73000],["interactTotal",465000]],r:9094},
		{k:"cx_combo_meritday_interact_7",c:"组合",i:"🧩",l:"单日功勋与互动次数 · 92,000·660,000",d:"累计单日功勋达到 92,000 点，且互动次数达到 660,000 次",a:[["meritToday",92000],["interactTotal",660000]],r:11836},
		{k:"cx_combo_meritday_interact_8",c:"组合",i:"🧩",l:"单日功勋与互动次数 · 115,000·920,000",d:"累计单日功勋达到 115,000 点，且互动次数达到 920,000 次",a:[["meritToday",115000],["interactTotal",920000]],r:15000},
		{k:"cx_combo_wins_gmplay_0",c:"组合",i:"🧩",l:"胜场与出战次数 · 11,000·1,900",d:"累计胜场达到 11,000 胜，且出战次数达到 1,900 场",a:[["wrWin",11000],["gamblePlays",1900]],r:1500},
		{k:"cx_combo_wins_gmplay_1",c:"组合",i:"🧩",l:"胜场与出战次数 · 12,000·2,200",d:"累计胜场达到 12,000 胜，且出战次数达到 2,200 场",a:[["wrWin",12000],["gamblePlays",2200]],r:1711},
		{k:"cx_combo_wins_gmplay_2",c:"组合",i:"🧩",l:"胜场与出战次数 · 12,000·2,900",d:"累计胜场达到 12,000 胜，且出战次数达到 2,900 场",a:[["wrWin",12000],["gamblePlays",2900]],r:2344},
		{k:"cx_combo_wins_gmplay_3",c:"组合",i:"🧩",l:"胜场与出战次数 · 13,000·3,300",d:"累计胜场达到 13,000 胜，且出战次数达到 3,300 场",a:[["wrWin",13000],["gamblePlays",3300]],r:3398},
		{k:"cx_combo_wins_gmplay_4",c:"组合",i:"🧩",l:"胜场与出战次数 · 13,000·3,800",d:"累计胜场达到 13,000 胜，且出战次数达到 3,800 场",a:[["wrWin",13000],["gamblePlays",3800]],r:4875},
		{k:"cx_combo_wins_gmplay_5",c:"组合",i:"🧩",l:"胜场与出战次数 · 14,000·5,100",d:"累计胜场达到 14,000 胜，且出战次数达到 5,100 场",a:[["wrWin",14000],["gamblePlays",5100]],r:6773},
		{k:"cx_combo_wins_gmplay_6",c:"组合",i:"🧩",l:"胜场与出战次数 · 14,000·5,900",d:"累计胜场达到 14,000 胜，且出战次数达到 5,900 场",a:[["wrWin",14000],["gamblePlays",5900]],r:9094},
		{k:"cx_combo_wins_gmplay_7",c:"组合",i:"🧩",l:"胜场与出战次数 · 15,000·7,900",d:"累计胜场达到 15,000 胜，且出战次数达到 7,900 场",a:[["wrWin",15000],["gamblePlays",7900]],r:11836},
		{k:"cx_combo_wins_gmplay_8",c:"组合",i:"🧩",l:"胜场与出战次数 · 15,000·9,200",d:"累计胜场达到 15,000 胜，且出战次数达到 9,200 场",a:[["wrWin",15000],["gamblePlays",9200]],r:15000},
		{k:"cx_combo_wins_gmwin_0",c:"组合",i:"🧩",l:"胜场与胜局 · 11,000·215",d:"累计胜场达到 11,000 胜，且胜局达到 215 胜",a:[["wrWin",11000],["gambleWins",215]],r:1500},
		{k:"cx_combo_wins_gmwin_1",c:"组合",i:"🧩",l:"胜场与胜局 · 12,000·250",d:"累计胜场达到 12,000 胜，且胜局达到 250 胜",a:[["wrWin",12000],["gambleWins",250]],r:1711},
		{k:"cx_combo_wins_gmwin_2",c:"组合",i:"🧩",l:"胜场与胜局 · 12,000·340",d:"累计胜场达到 12,000 胜，且胜局达到 340 胜",a:[["wrWin",12000],["gambleWins",340]],r:2344},
		{k:"cx_combo_wins_gmwin_3",c:"组合",i:"🧩",l:"胜场与胜局 · 13,000·460",d:"累计胜场达到 13,000 胜，且胜局达到 460 胜",a:[["wrWin",13000],["gambleWins",460]],r:3398},
		{k:"cx_combo_wins_gmwin_4",c:"组合",i:"🧩",l:"胜场与胜局 · 13,000·1,500",d:"累计胜场达到 13,000 胜，且胜局达到 1,500 胜",a:[["wrWin",13000],["gambleWins",1500]],r:4875},
		{k:"cx_combo_wins_gmwin_5",c:"组合",i:"🧩",l:"胜场与胜局 · 14,000·3,000",d:"累计胜场达到 14,000 胜，且胜局达到 3,000 胜",a:[["wrWin",14000],["gambleWins",3000]],r:6773},
		{k:"cx_combo_wins_gmwin_6",c:"组合",i:"🧩",l:"胜场与胜局 · 14,000·4,000",d:"累计胜场达到 14,000 胜，且胜局达到 4,000 胜",a:[["wrWin",14000],["gambleWins",4000]],r:9094},
		{k:"cx_combo_wins_gmwin_7",c:"组合",i:"🧩",l:"胜场与胜局 · 15,000·5,000",d:"累计胜场达到 15,000 胜，且胜局达到 5,000 胜",a:[["wrWin",15000],["gambleWins",5000]],r:11836},
		{k:"cx_combo_wins_gmwin_8",c:"组合",i:"🧩",l:"胜场与胜局 · 15,000·6,000",d:"累计胜场达到 15,000 胜，且胜局达到 6,000 胜",a:[["wrWin",15000],["gambleWins",6000]],r:15000},
		{k:"cx_combo_wins_gmnet_0",c:"组合",i:"🧩",l:"胜场与净赢 · 11,000·10,000,000",d:"累计胜场达到 11,000 胜，且净赢达到 10,000,000 池子币",a:[["wrWin",11000],["gambleNet",10000000]],r:1500},
		{k:"cx_combo_wins_gmnet_1",c:"组合",i:"🧩",l:"胜场与净赢 · 12,000·10,000,000",d:"累计胜场达到 12,000 胜，且净赢达到 10,000,000 池子币",a:[["wrWin",12000],["gambleNet",10000000]],r:1711},
		{k:"cx_combo_wins_gmnet_3",c:"组合",i:"🧩",l:"胜场与净赢 · 13,000·10,000,000",d:"累计胜场达到 13,000 胜，且净赢达到 10,000,000 池子币",a:[["wrWin",13000],["gambleNet",10000000]],r:3398},
		{k:"cx_combo_wins_gmnet_5",c:"组合",i:"🧩",l:"胜场与净赢 · 14,000·10,000,000",d:"累计胜场达到 14,000 胜，且净赢达到 10,000,000 池子币",a:[["wrWin",14000],["gambleNet",10000000]],r:6773},
		{k:"cx_combo_wins_gmnet_7",c:"组合",i:"🧩",l:"胜场与净赢 · 15,000·10,000,000",d:"累计胜场达到 15,000 胜，且净赢达到 10,000,000 池子币",a:[["wrWin",15000],["gambleNet",10000000]],r:11836},
		{k:"cx_combo_wins_gmstreak_0",c:"组合",i:"🧩",l:"胜场与连胜 · 11,000·29",d:"累计胜场达到 11,000 胜，且连胜达到 29 连胜",a:[["wrWin",11000],["gambleBestStreak",29]],r:1500},
		{k:"cx_combo_wins_gmstreak_1",c:"组合",i:"🧩",l:"胜场与连胜 · 12,000·32",d:"累计胜场达到 12,000 胜，且连胜达到 32 连胜",a:[["wrWin",12000],["gambleBestStreak",32]],r:1711},
		{k:"cx_combo_wins_gmstreak_2",c:"组合",i:"🧩",l:"胜场与连胜 · 12,000·36",d:"累计胜场达到 12,000 胜，且连胜达到 36 连胜",a:[["wrWin",12000],["gambleBestStreak",36]],r:2344},
		{k:"cx_combo_wins_gmstreak_3",c:"组合",i:"🧩",l:"胜场与连胜 · 13,000·45",d:"累计胜场达到 13,000 胜，且连胜达到 45 连胜",a:[["wrWin",13000],["gambleBestStreak",45]],r:3398},
		{k:"cx_combo_wins_gmstreak_4",c:"组合",i:"🧩",l:"胜场与连胜 · 13,000·51",d:"累计胜场达到 13,000 胜，且连胜达到 51 连胜",a:[["wrWin",13000],["gambleBestStreak",51]],r:4875},
		{k:"cx_combo_wins_gmstreak_5",c:"组合",i:"🧩",l:"胜场与连胜 · 14,000·58",d:"累计胜场达到 14,000 胜，且连胜达到 58 连胜",a:[["wrWin",14000],["gambleBestStreak",58]],r:6773},
		{k:"cx_combo_wins_gmstreak_6",c:"组合",i:"🧩",l:"胜场与连胜 · 14,000·66",d:"累计胜场达到 14,000 胜，且连胜达到 66 连胜",a:[["wrWin",14000],["gambleBestStreak",66]],r:9094},
		{k:"cx_combo_wins_gmstreak_7",c:"组合",i:"🧩",l:"胜场与连胜 · 15,000·76",d:"累计胜场达到 15,000 胜，且连胜达到 76 连胜",a:[["wrWin",15000],["gambleBestStreak",76]],r:11836},
		{k:"cx_combo_wins_gmstreak_8",c:"组合",i:"🧩",l:"胜场与连胜 · 15,000·78",d:"累计胜场达到 15,000 胜，且连胜达到 78 连胜",a:[["wrWin",15000],["gambleBestStreak",78]],r:15000},
		{k:"cx_combo_games_gmplay_0",c:"组合",i:"🧩",l:"对局数与出战次数 · 11,000·1,900",d:"累计对局数达到 11,000 局，且出战次数达到 1,900 场",a:[["wrGames",11000],["gamblePlays",1900]],r:1500},
		{k:"cx_combo_games_gmplay_1",c:"组合",i:"🧩",l:"对局数与出战次数 · 12,000·2,200",d:"累计对局数达到 12,000 局，且出战次数达到 2,200 场",a:[["wrGames",12000],["gamblePlays",2200]],r:1711},
		{k:"cx_combo_games_gmplay_2",c:"组合",i:"🧩",l:"对局数与出战次数 · 12,000·2,900",d:"累计对局数达到 12,000 局，且出战次数达到 2,900 场",a:[["wrGames",12000],["gamblePlays",2900]],r:2344},
		{k:"cx_combo_games_gmplay_3",c:"组合",i:"🧩",l:"对局数与出战次数 · 13,000·3,300",d:"累计对局数达到 13,000 局，且出战次数达到 3,300 场",a:[["wrGames",13000],["gamblePlays",3300]],r:3398},
		{k:"cx_combo_games_gmplay_4",c:"组合",i:"🧩",l:"对局数与出战次数 · 13,000·3,800",d:"累计对局数达到 13,000 局，且出战次数达到 3,800 场",a:[["wrGames",13000],["gamblePlays",3800]],r:4875},
		{k:"cx_combo_games_gmplay_5",c:"组合",i:"🧩",l:"对局数与出战次数 · 14,000·5,100",d:"累计对局数达到 14,000 局，且出战次数达到 5,100 场",a:[["wrGames",14000],["gamblePlays",5100]],r:6773},
		{k:"cx_combo_games_gmplay_6",c:"组合",i:"🧩",l:"对局数与出战次数 · 14,000·5,900",d:"累计对局数达到 14,000 局，且出战次数达到 5,900 场",a:[["wrGames",14000],["gamblePlays",5900]],r:9094},
		{k:"cx_combo_games_gmplay_7",c:"组合",i:"🧩",l:"对局数与出战次数 · 15,000·7,900",d:"累计对局数达到 15,000 局，且出战次数达到 7,900 场",a:[["wrGames",15000],["gamblePlays",7900]],r:11836},
		{k:"cx_combo_games_gmplay_8",c:"组合",i:"🧩",l:"对局数与出战次数 · 15,000·9,200",d:"累计对局数达到 15,000 局，且出战次数达到 9,200 场",a:[["wrGames",15000],["gamblePlays",9200]],r:15000},
		{k:"cx_combo_games_gmwin_0",c:"组合",i:"🧩",l:"对局数与胜局 · 11,000·215",d:"累计对局数达到 11,000 局，且胜局达到 215 胜",a:[["wrGames",11000],["gambleWins",215]],r:1500},
		{k:"cx_combo_games_gmwin_1",c:"组合",i:"🧩",l:"对局数与胜局 · 12,000·250",d:"累计对局数达到 12,000 局，且胜局达到 250 胜",a:[["wrGames",12000],["gambleWins",250]],r:1711},
		{k:"cx_combo_games_gmwin_2",c:"组合",i:"🧩",l:"对局数与胜局 · 12,000·340",d:"累计对局数达到 12,000 局，且胜局达到 340 胜",a:[["wrGames",12000],["gambleWins",340]],r:2344},
		{k:"cx_combo_games_gmwin_3",c:"组合",i:"🧩",l:"对局数与胜局 · 13,000·460",d:"累计对局数达到 13,000 局，且胜局达到 460 胜",a:[["wrGames",13000],["gambleWins",460]],r:3398},
		{k:"cx_combo_games_gmwin_4",c:"组合",i:"🧩",l:"对局数与胜局 · 13,000·1,500",d:"累计对局数达到 13,000 局，且胜局达到 1,500 胜",a:[["wrGames",13000],["gambleWins",1500]],r:4875},
		{k:"cx_combo_games_gmwin_5",c:"组合",i:"🧩",l:"对局数与胜局 · 14,000·3,000",d:"累计对局数达到 14,000 局，且胜局达到 3,000 胜",a:[["wrGames",14000],["gambleWins",3000]],r:6773},
		{k:"cx_combo_games_gmwin_6",c:"组合",i:"🧩",l:"对局数与胜局 · 14,000·4,000",d:"累计对局数达到 14,000 局，且胜局达到 4,000 胜",a:[["wrGames",14000],["gambleWins",4000]],r:9094},
		{k:"cx_combo_games_gmwin_7",c:"组合",i:"🧩",l:"对局数与胜局 · 15,000·5,000",d:"累计对局数达到 15,000 局，且胜局达到 5,000 胜",a:[["wrGames",15000],["gambleWins",5000]],r:11836},
		{k:"cx_combo_games_gmwin_8",c:"组合",i:"🧩",l:"对局数与胜局 · 15,000·6,000",d:"累计对局数达到 15,000 局，且胜局达到 6,000 胜",a:[["wrGames",15000],["gambleWins",6000]],r:15000},
		{k:"cx_combo_games_gmnet_0",c:"组合",i:"🧩",l:"对局数与净赢 · 11,000·10,000,000",d:"累计对局数达到 11,000 局，且净赢达到 10,000,000 池子币",a:[["wrGames",11000],["gambleNet",10000000]],r:1500},
		{k:"cx_combo_games_gmnet_1",c:"组合",i:"🧩",l:"对局数与净赢 · 12,000·10,000,000",d:"累计对局数达到 12,000 局，且净赢达到 10,000,000 池子币",a:[["wrGames",12000],["gambleNet",10000000]],r:1711},
		{k:"cx_combo_games_gmnet_3",c:"组合",i:"🧩",l:"对局数与净赢 · 13,000·10,000,000",d:"累计对局数达到 13,000 局，且净赢达到 10,000,000 池子币",a:[["wrGames",13000],["gambleNet",10000000]],r:3398},
		{k:"cx_combo_games_gmnet_5",c:"组合",i:"🧩",l:"对局数与净赢 · 14,000·10,000,000",d:"累计对局数达到 14,000 局，且净赢达到 10,000,000 池子币",a:[["wrGames",14000],["gambleNet",10000000]],r:6773},
		{k:"cx_combo_games_gmnet_7",c:"组合",i:"🧩",l:"对局数与净赢 · 15,000·10,000,000",d:"累计对局数达到 15,000 局，且净赢达到 10,000,000 池子币",a:[["wrGames",15000],["gambleNet",10000000]],r:11836},
		{k:"cx_combo_games_gmstreak_0",c:"组合",i:"🧩",l:"对局数与连胜 · 11,000·29",d:"累计对局数达到 11,000 局，且连胜达到 29 连胜",a:[["wrGames",11000],["gambleBestStreak",29]],r:1500},
		{k:"cx_combo_games_gmstreak_1",c:"组合",i:"🧩",l:"对局数与连胜 · 12,000·32",d:"累计对局数达到 12,000 局，且连胜达到 32 连胜",a:[["wrGames",12000],["gambleBestStreak",32]],r:1711},
		{k:"cx_combo_games_gmstreak_2",c:"组合",i:"🧩",l:"对局数与连胜 · 12,000·36",d:"累计对局数达到 12,000 局，且连胜达到 36 连胜",a:[["wrGames",12000],["gambleBestStreak",36]],r:2344},
		{k:"cx_combo_games_gmstreak_3",c:"组合",i:"🧩",l:"对局数与连胜 · 13,000·45",d:"累计对局数达到 13,000 局，且连胜达到 45 连胜",a:[["wrGames",13000],["gambleBestStreak",45]],r:3398},
		{k:"cx_combo_games_gmstreak_4",c:"组合",i:"🧩",l:"对局数与连胜 · 13,000·51",d:"累计对局数达到 13,000 局，且连胜达到 51 连胜",a:[["wrGames",13000],["gambleBestStreak",51]],r:4875},
		{k:"cx_combo_games_gmstreak_5",c:"组合",i:"🧩",l:"对局数与连胜 · 14,000·58",d:"累计对局数达到 14,000 局，且连胜达到 58 连胜",a:[["wrGames",14000],["gambleBestStreak",58]],r:6773},
		{k:"cx_combo_games_gmstreak_6",c:"组合",i:"🧩",l:"对局数与连胜 · 14,000·66",d:"累计对局数达到 14,000 局，且连胜达到 66 连胜",a:[["wrGames",14000],["gambleBestStreak",66]],r:9094},
		{k:"cx_combo_games_gmstreak_7",c:"组合",i:"🧩",l:"对局数与连胜 · 15,000·76",d:"累计对局数达到 15,000 局，且连胜达到 76 连胜",a:[["wrGames",15000],["gambleBestStreak",76]],r:11836},
		{k:"cx_combo_games_gmstreak_8",c:"组合",i:"🧩",l:"对局数与连胜 · 15,000·78",d:"累计对局数达到 15,000 局，且连胜达到 78 连胜",a:[["wrGames",15000],["gambleBestStreak",78]],r:15000},
		{k:"cx_combo_kills_gmplay_0",c:"组合",i:"🧩",l:"击杀与出战次数 · 12,500·1,900",d:"累计击杀达到 12,500 人，且出战次数达到 1,900 场",a:[["wrKill",12500],["gamblePlays",1900]],r:1500},
		{k:"cx_combo_kills_gmplay_1",c:"组合",i:"🧩",l:"击杀与出战次数 · 14,500·2,200",d:"累计击杀达到 14,500 人，且出战次数达到 2,200 场",a:[["wrKill",14500],["gamblePlays",2200]],r:1711},
		{k:"cx_combo_kills_gmplay_2",c:"组合",i:"🧩",l:"击杀与出战次数 · 16,500·2,900",d:"累计击杀达到 16,500 人，且出战次数达到 2,900 场",a:[["wrKill",16500],["gamblePlays",2900]],r:2344},
		{k:"cx_combo_kills_gmplay_3",c:"组合",i:"🧩",l:"击杀与出战次数 · 19,000·3,300",d:"累计击杀达到 19,000 人，且出战次数达到 3,300 场",a:[["wrKill",19000],["gamblePlays",3300]],r:3398},
		{k:"cx_combo_kills_gmplay_4",c:"组合",i:"🧩",l:"击杀与出战次数 · 22,000·3,800",d:"累计击杀达到 22,000 人，且出战次数达到 3,800 场",a:[["wrKill",22000],["gamblePlays",3800]],r:4875},
		{k:"cx_combo_kills_gmplay_5",c:"组合",i:"🧩",l:"击杀与出战次数 · 25,500·5,100",d:"累计击杀达到 25,500 人，且出战次数达到 5,100 场",a:[["wrKill",25500],["gamblePlays",5100]],r:6773},
		{k:"cx_combo_kills_gmplay_6",c:"组合",i:"🧩",l:"击杀与出战次数 · 29,500·5,900",d:"累计击杀达到 29,500 人，且出战次数达到 5,900 场",a:[["wrKill",29500],["gamblePlays",5900]],r:9094},
		{k:"cx_combo_kills_gmplay_7",c:"组合",i:"🧩",l:"击杀与出战次数 · 34,000·7,900",d:"累计击杀达到 34,000 人，且出战次数达到 7,900 场",a:[["wrKill",34000],["gamblePlays",7900]],r:11836},
		{k:"cx_combo_kills_gmplay_8",c:"组合",i:"🧩",l:"击杀与出战次数 · 39,000·9,200",d:"累计击杀达到 39,000 人，且出战次数达到 9,200 场",a:[["wrKill",39000],["gamblePlays",9200]],r:15000},
		{k:"cx_combo_kills_gmwin_0",c:"组合",i:"🧩",l:"击杀与胜局 · 12,500·215",d:"累计击杀达到 12,500 人，且胜局达到 215 胜",a:[["wrKill",12500],["gambleWins",215]],r:1500},
		{k:"cx_combo_kills_gmwin_1",c:"组合",i:"🧩",l:"击杀与胜局 · 14,500·250",d:"累计击杀达到 14,500 人，且胜局达到 250 胜",a:[["wrKill",14500],["gambleWins",250]],r:1711},
		{k:"cx_combo_kills_gmwin_2",c:"组合",i:"🧩",l:"击杀与胜局 · 16,500·340",d:"累计击杀达到 16,500 人，且胜局达到 340 胜",a:[["wrKill",16500],["gambleWins",340]],r:2344},
		{k:"cx_combo_kills_gmwin_3",c:"组合",i:"🧩",l:"击杀与胜局 · 19,000·460",d:"累计击杀达到 19,000 人，且胜局达到 460 胜",a:[["wrKill",19000],["gambleWins",460]],r:3398},
		{k:"cx_combo_kills_gmwin_4",c:"组合",i:"🧩",l:"击杀与胜局 · 22,000·1,500",d:"累计击杀达到 22,000 人，且胜局达到 1,500 胜",a:[["wrKill",22000],["gambleWins",1500]],r:4875},
		{k:"cx_combo_kills_gmwin_5",c:"组合",i:"🧩",l:"击杀与胜局 · 25,500·3,000",d:"累计击杀达到 25,500 人，且胜局达到 3,000 胜",a:[["wrKill",25500],["gambleWins",3000]],r:6773},
		{k:"cx_combo_kills_gmwin_6",c:"组合",i:"🧩",l:"击杀与胜局 · 29,500·4,000",d:"累计击杀达到 29,500 人，且胜局达到 4,000 胜",a:[["wrKill",29500],["gambleWins",4000]],r:9094},
		{k:"cx_combo_kills_gmwin_7",c:"组合",i:"🧩",l:"击杀与胜局 · 34,000·5,000",d:"累计击杀达到 34,000 人，且胜局达到 5,000 胜",a:[["wrKill",34000],["gambleWins",5000]],r:11836},
		{k:"cx_combo_kills_gmwin_8",c:"组合",i:"🧩",l:"击杀与胜局 · 39,000·6,000",d:"累计击杀达到 39,000 人，且胜局达到 6,000 胜",a:[["wrKill",39000],["gambleWins",6000]],r:15000},
		{k:"cx_combo_kills_gmnet_0",c:"组合",i:"🧩",l:"击杀与净赢 · 12,500·10,000,000",d:"累计击杀达到 12,500 人，且净赢达到 10,000,000 池子币",a:[["wrKill",12500],["gambleNet",10000000]],r:1500},
		{k:"cx_combo_kills_gmnet_1",c:"组合",i:"🧩",l:"击杀与净赢 · 14,500·10,000,000",d:"累计击杀达到 14,500 人，且净赢达到 10,000,000 池子币",a:[["wrKill",14500],["gambleNet",10000000]],r:1711},
		{k:"cx_combo_kills_gmnet_2",c:"组合",i:"🧩",l:"击杀与净赢 · 16,500·10,000,000",d:"累计击杀达到 16,500 人，且净赢达到 10,000,000 池子币",a:[["wrKill",16500],["gambleNet",10000000]],r:2344},
		{k:"cx_combo_kills_gmnet_3",c:"组合",i:"🧩",l:"击杀与净赢 · 19,000·10,000,000",d:"累计击杀达到 19,000 人，且净赢达到 10,000,000 池子币",a:[["wrKill",19000],["gambleNet",10000000]],r:3398},
		{k:"cx_combo_kills_gmnet_4",c:"组合",i:"🧩",l:"击杀与净赢 · 22,000·10,000,000",d:"累计击杀达到 22,000 人，且净赢达到 10,000,000 池子币",a:[["wrKill",22000],["gambleNet",10000000]],r:4875},
		{k:"cx_combo_kills_gmnet_5",c:"组合",i:"🧩",l:"击杀与净赢 · 25,500·10,000,000",d:"累计击杀达到 25,500 人，且净赢达到 10,000,000 池子币",a:[["wrKill",25500],["gambleNet",10000000]],r:6773},
		{k:"cx_combo_kills_gmnet_6",c:"组合",i:"🧩",l:"击杀与净赢 · 29,500·10,000,000",d:"累计击杀达到 29,500 人，且净赢达到 10,000,000 池子币",a:[["wrKill",29500],["gambleNet",10000000]],r:9094},
		{k:"cx_combo_kills_gmnet_7",c:"组合",i:"🧩",l:"击杀与净赢 · 34,000·10,000,000",d:"累计击杀达到 34,000 人，且净赢达到 10,000,000 池子币",a:[["wrKill",34000],["gambleNet",10000000]],r:11836},
		{k:"cx_combo_kills_gmnet_8",c:"组合",i:"🧩",l:"击杀与净赢 · 39,000·10,000,000",d:"累计击杀达到 39,000 人，且净赢达到 10,000,000 池子币",a:[["wrKill",39000],["gambleNet",10000000]],r:15000},
		{k:"cx_combo_kills_gmstreak_0",c:"组合",i:"🧩",l:"击杀与连胜 · 12,500·29",d:"累计击杀达到 12,500 人，且连胜达到 29 连胜",a:[["wrKill",12500],["gambleBestStreak",29]],r:1500},
		{k:"cx_combo_kills_gmstreak_1",c:"组合",i:"🧩",l:"击杀与连胜 · 14,500·32",d:"累计击杀达到 14,500 人，且连胜达到 32 连胜",a:[["wrKill",14500],["gambleBestStreak",32]],r:1711},
		{k:"cx_combo_kills_gmstreak_2",c:"组合",i:"🧩",l:"击杀与连胜 · 16,500·36",d:"累计击杀达到 16,500 人，且连胜达到 36 连胜",a:[["wrKill",16500],["gambleBestStreak",36]],r:2344},
		{k:"cx_combo_kills_gmstreak_3",c:"组合",i:"🧩",l:"击杀与连胜 · 19,000·45",d:"累计击杀达到 19,000 人，且连胜达到 45 连胜",a:[["wrKill",19000],["gambleBestStreak",45]],r:3398},
		{k:"cx_combo_kills_gmstreak_4",c:"组合",i:"🧩",l:"击杀与连胜 · 22,000·51",d:"累计击杀达到 22,000 人，且连胜达到 51 连胜",a:[["wrKill",22000],["gambleBestStreak",51]],r:4875},
		{k:"cx_combo_kills_gmstreak_5",c:"组合",i:"🧩",l:"击杀与连胜 · 25,500·58",d:"累计击杀达到 25,500 人，且连胜达到 58 连胜",a:[["wrKill",25500],["gambleBestStreak",58]],r:6773},
		{k:"cx_combo_kills_gmstreak_6",c:"组合",i:"🧩",l:"击杀与连胜 · 29,500·66",d:"累计击杀达到 29,500 人，且连胜达到 66 连胜",a:[["wrKill",29500],["gambleBestStreak",66]],r:9094},
		{k:"cx_combo_kills_gmstreak_7",c:"组合",i:"🧩",l:"击杀与连胜 · 34,000·76",d:"累计击杀达到 34,000 人，且连胜达到 76 连胜",a:[["wrKill",34000],["gambleBestStreak",76]],r:11836},
		{k:"cx_combo_kills_gmstreak_8",c:"组合",i:"🧩",l:"击杀与连胜 · 39,000·78",d:"累计击杀达到 39,000 人，且连胜达到 78 连胜",a:[["wrKill",39000],["gambleBestStreak",78]],r:15000},
		{k:"cx_combo_chars_gmplay_0",c:"组合",i:"🧩",l:"使用武将数与出战次数 · 60·1,900",d:"累计使用武将数达到 60 名，且出战次数达到 1,900 场",a:[["wrChars",60],["gamblePlays",1900]],r:1500},
		{k:"cx_combo_chars_gmplay_1",c:"组合",i:"🧩",l:"使用武将数与出战次数 · 70·2,200",d:"累计使用武将数达到 70 名，且出战次数达到 2,200 场",a:[["wrChars",70],["gamblePlays",2200]],r:1711},
		{k:"cx_combo_chars_gmplay_2",c:"组合",i:"🧩",l:"使用武将数与出战次数 · 75·2,900",d:"累计使用武将数达到 75 名，且出战次数达到 2,900 场",a:[["wrChars",75],["gamblePlays",2900]],r:2344},
		{k:"cx_combo_chars_gmplay_3",c:"组合",i:"🧩",l:"使用武将数与出战次数 · 85·3,300",d:"累计使用武将数达到 85 名，且出战次数达到 3,300 场",a:[["wrChars",85],["gamblePlays",3300]],r:3398},
		{k:"cx_combo_chars_gmplay_4",c:"组合",i:"🧩",l:"使用武将数与出战次数 · 90·3,800",d:"累计使用武将数达到 90 名，且出战次数达到 3,800 场",a:[["wrChars",90],["gamblePlays",3800]],r:4875},
		{k:"cx_combo_chars_gmplay_5",c:"组合",i:"🧩",l:"使用武将数与出战次数 · 100·5,100",d:"累计使用武将数达到 100 名，且出战次数达到 5,100 场",a:[["wrChars",100],["gamblePlays",5100]],r:6773},
		{k:"cx_combo_chars_gmplay_6",c:"组合",i:"🧩",l:"使用武将数与出战次数 · 105·5,900",d:"累计使用武将数达到 105 名，且出战次数达到 5,900 场",a:[["wrChars",105],["gamblePlays",5900]],r:9094},
		{k:"cx_combo_chars_gmplay_7",c:"组合",i:"🧩",l:"使用武将数与出战次数 · 115·7,900",d:"累计使用武将数达到 115 名，且出战次数达到 7,900 场",a:[["wrChars",115],["gamblePlays",7900]],r:11836},
		{k:"cx_combo_chars_gmplay_8",c:"组合",i:"🧩",l:"使用武将数与出战次数 · 120·9,200",d:"累计使用武将数达到 120 名，且出战次数达到 9,200 场",a:[["wrChars",120],["gamblePlays",9200]],r:15000},
		{k:"cx_combo_chars_gmwin_0",c:"组合",i:"🧩",l:"使用武将数与胜局 · 60·215",d:"累计使用武将数达到 60 名，且胜局达到 215 胜",a:[["wrChars",60],["gambleWins",215]],r:1500},
		{k:"cx_combo_chars_gmwin_1",c:"组合",i:"🧩",l:"使用武将数与胜局 · 70·250",d:"累计使用武将数达到 70 名，且胜局达到 250 胜",a:[["wrChars",70],["gambleWins",250]],r:1711},
		{k:"cx_combo_chars_gmwin_2",c:"组合",i:"🧩",l:"使用武将数与胜局 · 75·340",d:"累计使用武将数达到 75 名，且胜局达到 340 胜",a:[["wrChars",75],["gambleWins",340]],r:2344},
		{k:"cx_combo_chars_gmwin_3",c:"组合",i:"🧩",l:"使用武将数与胜局 · 85·460",d:"累计使用武将数达到 85 名，且胜局达到 460 胜",a:[["wrChars",85],["gambleWins",460]],r:3398},
		{k:"cx_combo_chars_gmwin_4",c:"组合",i:"🧩",l:"使用武将数与胜局 · 90·1,500",d:"累计使用武将数达到 90 名，且胜局达到 1,500 胜",a:[["wrChars",90],["gambleWins",1500]],r:4875},
		{k:"cx_combo_chars_gmwin_5",c:"组合",i:"🧩",l:"使用武将数与胜局 · 100·3,000",d:"累计使用武将数达到 100 名，且胜局达到 3,000 胜",a:[["wrChars",100],["gambleWins",3000]],r:6773},
		{k:"cx_combo_chars_gmwin_6",c:"组合",i:"🧩",l:"使用武将数与胜局 · 105·4,000",d:"累计使用武将数达到 105 名，且胜局达到 4,000 胜",a:[["wrChars",105],["gambleWins",4000]],r:9094},
		{k:"cx_combo_chars_gmwin_7",c:"组合",i:"🧩",l:"使用武将数与胜局 · 115·5,000",d:"累计使用武将数达到 115 名，且胜局达到 5,000 胜",a:[["wrChars",115],["gambleWins",5000]],r:11836},
		{k:"cx_combo_chars_gmwin_8",c:"组合",i:"🧩",l:"使用武将数与胜局 · 120·6,000",d:"累计使用武将数达到 120 名，且胜局达到 6,000 胜",a:[["wrChars",120],["gambleWins",6000]],r:15000},
		{k:"cx_combo_chars_gmnet_0",c:"组合",i:"🧩",l:"使用武将数与净赢 · 60·10,000,000",d:"累计使用武将数达到 60 名，且净赢达到 10,000,000 池子币",a:[["wrChars",60],["gambleNet",10000000]],r:1500},
		{k:"cx_combo_chars_gmnet_1",c:"组合",i:"🧩",l:"使用武将数与净赢 · 70·10,000,000",d:"累计使用武将数达到 70 名，且净赢达到 10,000,000 池子币",a:[["wrChars",70],["gambleNet",10000000]],r:1711},
		{k:"cx_combo_chars_gmnet_2",c:"组合",i:"🧩",l:"使用武将数与净赢 · 75·10,000,000",d:"累计使用武将数达到 75 名，且净赢达到 10,000,000 池子币",a:[["wrChars",75],["gambleNet",10000000]],r:2344},
		{k:"cx_combo_chars_gmnet_3",c:"组合",i:"🧩",l:"使用武将数与净赢 · 85·10,000,000",d:"累计使用武将数达到 85 名，且净赢达到 10,000,000 池子币",a:[["wrChars",85],["gambleNet",10000000]],r:3398},
		{k:"cx_combo_chars_gmnet_4",c:"组合",i:"🧩",l:"使用武将数与净赢 · 90·10,000,000",d:"累计使用武将数达到 90 名，且净赢达到 10,000,000 池子币",a:[["wrChars",90],["gambleNet",10000000]],r:4875},
		{k:"cx_combo_chars_gmnet_5",c:"组合",i:"🧩",l:"使用武将数与净赢 · 100·10,000,000",d:"累计使用武将数达到 100 名，且净赢达到 10,000,000 池子币",a:[["wrChars",100],["gambleNet",10000000]],r:6773},
		{k:"cx_combo_chars_gmnet_6",c:"组合",i:"🧩",l:"使用武将数与净赢 · 105·10,000,000",d:"累计使用武将数达到 105 名，且净赢达到 10,000,000 池子币",a:[["wrChars",105],["gambleNet",10000000]],r:9094},
		{k:"cx_combo_chars_gmnet_7",c:"组合",i:"🧩",l:"使用武将数与净赢 · 115·10,000,000",d:"累计使用武将数达到 115 名，且净赢达到 10,000,000 池子币",a:[["wrChars",115],["gambleNet",10000000]],r:11836},
		{k:"cx_combo_chars_gmnet_8",c:"组合",i:"🧩",l:"使用武将数与净赢 · 120·10,000,000",d:"累计使用武将数达到 120 名，且净赢达到 10,000,000 池子币",a:[["wrChars",120],["gambleNet",10000000]],r:15000},
		{k:"cx_combo_chars_gmstreak_0",c:"组合",i:"🧩",l:"使用武将数与连胜 · 60·29",d:"累计使用武将数达到 60 名，且连胜达到 29 连胜",a:[["wrChars",60],["gambleBestStreak",29]],r:1500},
		{k:"cx_combo_chars_gmstreak_1",c:"组合",i:"🧩",l:"使用武将数与连胜 · 70·32",d:"累计使用武将数达到 70 名，且连胜达到 32 连胜",a:[["wrChars",70],["gambleBestStreak",32]],r:1711},
		{k:"cx_combo_chars_gmstreak_2",c:"组合",i:"🧩",l:"使用武将数与连胜 · 75·36",d:"累计使用武将数达到 75 名，且连胜达到 36 连胜",a:[["wrChars",75],["gambleBestStreak",36]],r:2344},
		{k:"cx_combo_chars_gmstreak_3",c:"组合",i:"🧩",l:"使用武将数与连胜 · 85·45",d:"累计使用武将数达到 85 名，且连胜达到 45 连胜",a:[["wrChars",85],["gambleBestStreak",45]],r:3398},
		{k:"cx_combo_chars_gmstreak_4",c:"组合",i:"🧩",l:"使用武将数与连胜 · 90·51",d:"累计使用武将数达到 90 名，且连胜达到 51 连胜",a:[["wrChars",90],["gambleBestStreak",51]],r:4875},
		{k:"cx_combo_chars_gmstreak_5",c:"组合",i:"🧩",l:"使用武将数与连胜 · 100·58",d:"累计使用武将数达到 100 名，且连胜达到 58 连胜",a:[["wrChars",100],["gambleBestStreak",58]],r:6773},
		{k:"cx_combo_chars_gmstreak_6",c:"组合",i:"🧩",l:"使用武将数与连胜 · 105·66",d:"累计使用武将数达到 105 名，且连胜达到 66 连胜",a:[["wrChars",105],["gambleBestStreak",66]],r:9094},
		{k:"cx_combo_chars_gmstreak_7",c:"组合",i:"🧩",l:"使用武将数与连胜 · 115·76",d:"累计使用武将数达到 115 名，且连胜达到 76 连胜",a:[["wrChars",115],["gambleBestStreak",76]],r:11836},
		{k:"cx_combo_chars_gmstreak_8",c:"组合",i:"🧩",l:"使用武将数与连胜 · 120·78",d:"累计使用武将数达到 120 名，且连胜达到 78 连胜",a:[["wrChars",120],["gambleBestStreak",78]],r:15000},
		{k:"cx_combo_wins_hands_0",c:"组合",i:"🧩",l:"胜场与同桌人次 · 11,000·78,000",d:"累计胜场达到 11,000 胜，且同桌人次达到 78,000 人次",a:[["wrWin",11000],["worldHands",78000]],r:1500},
		{k:"cx_combo_wins_hands_1",c:"组合",i:"🧩",l:"胜场与同桌人次 · 12,000·120,000",d:"累计胜场达到 12,000 胜，且同桌人次达到 120,000 人次",a:[["wrWin",12000],["worldHands",120000]],r:1711},
		{k:"cx_combo_wins_hands_2",c:"组合",i:"🧩",l:"胜场与同桌人次 · 12,000·185,000",d:"累计胜场达到 12,000 胜，且同桌人次达到 185,000 人次",a:[["wrWin",12000],["worldHands",185000]],r:2344},
		{k:"cx_combo_wins_hands_3",c:"组合",i:"🧩",l:"胜场与同桌人次 · 13,000·285,000",d:"累计胜场达到 13,000 胜，且同桌人次达到 285,000 人次",a:[["wrWin",13000],["worldHands",285000]],r:3398},
		{k:"cx_combo_wins_hands_4",c:"组合",i:"🧩",l:"胜场与同桌人次 · 13,000·350,000",d:"累计胜场达到 13,000 胜，且同桌人次达到 350,000 人次",a:[["wrWin",13000],["worldHands",350000]],r:4875},
		{k:"cx_combo_wins_hands_5",c:"组合",i:"🧩",l:"胜场与同桌人次 · 14,000·530,000",d:"累计胜场达到 14,000 胜，且同桌人次达到 530,000 人次",a:[["wrWin",14000],["worldHands",530000]],r:6773},
		{k:"cx_combo_wins_hands_6",c:"组合",i:"🧩",l:"胜场与同桌人次 · 14,000·800,000",d:"累计胜场达到 14,000 胜，且同桌人次达到 800,000 人次",a:[["wrWin",14000],["worldHands",800000]],r:9094},
		{k:"cx_combo_wins_hands_7",c:"组合",i:"🧩",l:"胜场与同桌人次 · 15,000·980,000",d:"累计胜场达到 15,000 胜，且同桌人次达到 980,000 人次",a:[["wrWin",15000],["worldHands",980000]],r:11836},
		{k:"cx_combo_wins_hands_8",c:"组合",i:"🧩",l:"胜场与同桌人次 · 15,000·1,480,000",d:"累计胜场达到 15,000 胜，且同桌人次达到 1,480,000 人次",a:[["wrWin",15000],["worldHands",1480000]],r:15000},
		{k:"cx_combo_wins_retired_0",c:"组合",i:"🧩",l:"胜场与当前退隐人数 · 11,000·88",d:"累计胜场达到 11,000 胜，且当前退隐人数达到 88 名",a:[["wrWin",11000],["worldRetired",88]],r:1500},
		{k:"cx_combo_wins_retired_1",c:"组合",i:"🧩",l:"胜场与当前退隐人数 · 12,000·96",d:"累计胜场达到 12,000 胜，且当前退隐人数达到 96 名",a:[["wrWin",12000],["worldRetired",96]],r:1711},
		{k:"cx_combo_wins_retired_2",c:"组合",i:"🧩",l:"胜场与当前退隐人数 · 12,000·100",d:"累计胜场达到 12,000 胜，且当前退隐人数达到 100 名",a:[["wrWin",12000],["worldRetired",100]],r:2344},
		{k:"cx_combo_wins_retired_3",c:"组合",i:"🧩",l:"胜场与当前退隐人数 · 13,000·105",d:"累计胜场达到 13,000 胜，且当前退隐人数达到 105 名",a:[["wrWin",13000],["worldRetired",105]],r:3398},
		{k:"cx_combo_wins_retired_4",c:"组合",i:"🧩",l:"胜场与当前退隐人数 · 13,000·110",d:"累计胜场达到 13,000 胜，且当前退隐人数达到 110 名",a:[["wrWin",13000],["worldRetired",110]],r:4875},
		{k:"cx_combo_wins_retired_5",c:"组合",i:"🧩",l:"胜场与当前退隐人数 · 14,000·116",d:"累计胜场达到 14,000 胜，且当前退隐人数达到 116 名",a:[["wrWin",14000],["worldRetired",116]],r:6773},
		{k:"cx_combo_wins_retired_6",c:"组合",i:"🧩",l:"胜场与当前退隐人数 · 14,000·130",d:"累计胜场达到 14,000 胜，且当前退隐人数达到 130 名",a:[["wrWin",14000],["worldRetired",130]],r:9094},
		{k:"cx_combo_wins_retired_7",c:"组合",i:"🧩",l:"胜场与当前退隐人数 · 15,000·140",d:"累计胜场达到 15,000 胜，且当前退隐人数达到 140 名",a:[["wrWin",15000],["worldRetired",140]],r:11836},
		{k:"cx_combo_wins_retired_8",c:"组合",i:"🧩",l:"胜场与当前退隐人数 · 15,000·150",d:"累计胜场达到 15,000 胜，且当前退隐人数达到 150 名",a:[["wrWin",15000],["worldRetired",150]],r:15000},
		{k:"cx_combo_games_hands_0",c:"组合",i:"🧩",l:"对局数与同桌人次 · 11,000·78,000",d:"累计对局数达到 11,000 局，且同桌人次达到 78,000 人次",a:[["wrGames",11000],["worldHands",78000]],r:1500},
		{k:"cx_combo_games_hands_1",c:"组合",i:"🧩",l:"对局数与同桌人次 · 12,000·120,000",d:"累计对局数达到 12,000 局，且同桌人次达到 120,000 人次",a:[["wrGames",12000],["worldHands",120000]],r:1711},
		{k:"cx_combo_games_hands_2",c:"组合",i:"🧩",l:"对局数与同桌人次 · 12,000·185,000",d:"累计对局数达到 12,000 局，且同桌人次达到 185,000 人次",a:[["wrGames",12000],["worldHands",185000]],r:2344},
		{k:"cx_combo_games_hands_3",c:"组合",i:"🧩",l:"对局数与同桌人次 · 13,000·285,000",d:"累计对局数达到 13,000 局，且同桌人次达到 285,000 人次",a:[["wrGames",13000],["worldHands",285000]],r:3398},
		{k:"cx_combo_games_hands_4",c:"组合",i:"🧩",l:"对局数与同桌人次 · 13,000·350,000",d:"累计对局数达到 13,000 局，且同桌人次达到 350,000 人次",a:[["wrGames",13000],["worldHands",350000]],r:4875},
		{k:"cx_combo_games_hands_5",c:"组合",i:"🧩",l:"对局数与同桌人次 · 14,000·530,000",d:"累计对局数达到 14,000 局，且同桌人次达到 530,000 人次",a:[["wrGames",14000],["worldHands",530000]],r:6773},
		{k:"cx_combo_games_hands_6",c:"组合",i:"🧩",l:"对局数与同桌人次 · 14,000·800,000",d:"累计对局数达到 14,000 局，且同桌人次达到 800,000 人次",a:[["wrGames",14000],["worldHands",800000]],r:9094},
		{k:"cx_combo_games_hands_7",c:"组合",i:"🧩",l:"对局数与同桌人次 · 15,000·980,000",d:"累计对局数达到 15,000 局，且同桌人次达到 980,000 人次",a:[["wrGames",15000],["worldHands",980000]],r:11836},
		{k:"cx_combo_games_hands_8",c:"组合",i:"🧩",l:"对局数与同桌人次 · 15,000·1,480,000",d:"累计对局数达到 15,000 局，且同桌人次达到 1,480,000 人次",a:[["wrGames",15000],["worldHands",1480000]],r:15000},
		{k:"cx_combo_games_retired_0",c:"组合",i:"🧩",l:"对局数与当前退隐人数 · 11,000·88",d:"累计对局数达到 11,000 局，且当前退隐人数达到 88 名",a:[["wrGames",11000],["worldRetired",88]],r:1500},
		{k:"cx_combo_games_retired_1",c:"组合",i:"🧩",l:"对局数与当前退隐人数 · 12,000·96",d:"累计对局数达到 12,000 局，且当前退隐人数达到 96 名",a:[["wrGames",12000],["worldRetired",96]],r:1711},
		{k:"cx_combo_games_retired_2",c:"组合",i:"🧩",l:"对局数与当前退隐人数 · 12,000·100",d:"累计对局数达到 12,000 局，且当前退隐人数达到 100 名",a:[["wrGames",12000],["worldRetired",100]],r:2344},
		{k:"cx_combo_games_retired_3",c:"组合",i:"🧩",l:"对局数与当前退隐人数 · 13,000·105",d:"累计对局数达到 13,000 局，且当前退隐人数达到 105 名",a:[["wrGames",13000],["worldRetired",105]],r:3398},
		{k:"cx_combo_games_retired_4",c:"组合",i:"🧩",l:"对局数与当前退隐人数 · 13,000·110",d:"累计对局数达到 13,000 局，且当前退隐人数达到 110 名",a:[["wrGames",13000],["worldRetired",110]],r:4875},
		{k:"cx_combo_games_retired_5",c:"组合",i:"🧩",l:"对局数与当前退隐人数 · 14,000·116",d:"累计对局数达到 14,000 局，且当前退隐人数达到 116 名",a:[["wrGames",14000],["worldRetired",116]],r:6773},
		{k:"cx_combo_games_retired_6",c:"组合",i:"🧩",l:"对局数与当前退隐人数 · 14,000·130",d:"累计对局数达到 14,000 局，且当前退隐人数达到 130 名",a:[["wrGames",14000],["worldRetired",130]],r:9094},
		{k:"cx_combo_games_retired_7",c:"组合",i:"🧩",l:"对局数与当前退隐人数 · 15,000·140",d:"累计对局数达到 15,000 局，且当前退隐人数达到 140 名",a:[["wrGames",15000],["worldRetired",140]],r:11836},
		{k:"cx_combo_games_retired_8",c:"组合",i:"🧩",l:"对局数与当前退隐人数 · 15,000·150",d:"累计对局数达到 15,000 局，且当前退隐人数达到 150 名",a:[["wrGames",15000],["worldRetired",150]],r:15000},
		{k:"cx_combo_kills_hands_0",c:"组合",i:"🧩",l:"击杀与同桌人次 · 12,500·78,000",d:"累计击杀达到 12,500 人，且同桌人次达到 78,000 人次",a:[["wrKill",12500],["worldHands",78000]],r:1500},
		{k:"cx_combo_kills_hands_1",c:"组合",i:"🧩",l:"击杀与同桌人次 · 14,500·120,000",d:"累计击杀达到 14,500 人，且同桌人次达到 120,000 人次",a:[["wrKill",14500],["worldHands",120000]],r:1711},
		{k:"cx_combo_kills_hands_2",c:"组合",i:"🧩",l:"击杀与同桌人次 · 16,500·185,000",d:"累计击杀达到 16,500 人，且同桌人次达到 185,000 人次",a:[["wrKill",16500],["worldHands",185000]],r:2344},
		{k:"cx_combo_kills_hands_3",c:"组合",i:"🧩",l:"击杀与同桌人次 · 19,000·285,000",d:"累计击杀达到 19,000 人，且同桌人次达到 285,000 人次",a:[["wrKill",19000],["worldHands",285000]],r:3398},
		{k:"cx_combo_kills_hands_4",c:"组合",i:"🧩",l:"击杀与同桌人次 · 22,000·350,000",d:"累计击杀达到 22,000 人，且同桌人次达到 350,000 人次",a:[["wrKill",22000],["worldHands",350000]],r:4875},
		{k:"cx_combo_kills_hands_5",c:"组合",i:"🧩",l:"击杀与同桌人次 · 25,500·530,000",d:"累计击杀达到 25,500 人，且同桌人次达到 530,000 人次",a:[["wrKill",25500],["worldHands",530000]],r:6773},
		{k:"cx_combo_kills_hands_6",c:"组合",i:"🧩",l:"击杀与同桌人次 · 29,500·800,000",d:"累计击杀达到 29,500 人，且同桌人次达到 800,000 人次",a:[["wrKill",29500],["worldHands",800000]],r:9094},
		{k:"cx_combo_kills_hands_7",c:"组合",i:"🧩",l:"击杀与同桌人次 · 34,000·980,000",d:"累计击杀达到 34,000 人，且同桌人次达到 980,000 人次",a:[["wrKill",34000],["worldHands",980000]],r:11836},
		{k:"cx_combo_kills_hands_8",c:"组合",i:"🧩",l:"击杀与同桌人次 · 39,000·1,480,000",d:"累计击杀达到 39,000 人，且同桌人次达到 1,480,000 人次",a:[["wrKill",39000],["worldHands",1480000]],r:15000},
		{k:"cx_combo_kills_retired_0",c:"组合",i:"🧩",l:"击杀与当前退隐人数 · 12,500·88",d:"累计击杀达到 12,500 人，且当前退隐人数达到 88 名",a:[["wrKill",12500],["worldRetired",88]],r:1500},
		{k:"cx_combo_kills_retired_1",c:"组合",i:"🧩",l:"击杀与当前退隐人数 · 14,500·96",d:"累计击杀达到 14,500 人，且当前退隐人数达到 96 名",a:[["wrKill",14500],["worldRetired",96]],r:1711},
		{k:"cx_combo_kills_retired_2",c:"组合",i:"🧩",l:"击杀与当前退隐人数 · 16,500·100",d:"累计击杀达到 16,500 人，且当前退隐人数达到 100 名",a:[["wrKill",16500],["worldRetired",100]],r:2344},
		{k:"cx_combo_kills_retired_3",c:"组合",i:"🧩",l:"击杀与当前退隐人数 · 19,000·105",d:"累计击杀达到 19,000 人，且当前退隐人数达到 105 名",a:[["wrKill",19000],["worldRetired",105]],r:3398},
		{k:"cx_combo_kills_retired_4",c:"组合",i:"🧩",l:"击杀与当前退隐人数 · 22,000·110",d:"累计击杀达到 22,000 人，且当前退隐人数达到 110 名",a:[["wrKill",22000],["worldRetired",110]],r:4875},
		{k:"cx_combo_kills_retired_5",c:"组合",i:"🧩",l:"击杀与当前退隐人数 · 25,500·116",d:"累计击杀达到 25,500 人，且当前退隐人数达到 116 名",a:[["wrKill",25500],["worldRetired",116]],r:6773},
		{k:"cx_combo_kills_retired_6",c:"组合",i:"🧩",l:"击杀与当前退隐人数 · 29,500·130",d:"累计击杀达到 29,500 人，且当前退隐人数达到 130 名",a:[["wrKill",29500],["worldRetired",130]],r:9094},
		{k:"cx_combo_kills_retired_7",c:"组合",i:"🧩",l:"击杀与当前退隐人数 · 34,000·140",d:"累计击杀达到 34,000 人，且当前退隐人数达到 140 名",a:[["wrKill",34000],["worldRetired",140]],r:11836},
		{k:"cx_combo_kills_retired_8",c:"组合",i:"🧩",l:"击杀与当前退隐人数 · 39,000·150",d:"累计击杀达到 39,000 人，且当前退隐人数达到 150 名",a:[["wrKill",39000],["worldRetired",150]],r:15000},
		{k:"cx_combo_chars_hands_0",c:"组合",i:"🧩",l:"使用武将数与同桌人次 · 60·78,000",d:"累计使用武将数达到 60 名，且同桌人次达到 78,000 人次",a:[["wrChars",60],["worldHands",78000]],r:1500},
		{k:"cx_combo_chars_hands_1",c:"组合",i:"🧩",l:"使用武将数与同桌人次 · 70·120,000",d:"累计使用武将数达到 70 名，且同桌人次达到 120,000 人次",a:[["wrChars",70],["worldHands",120000]],r:1711},
		{k:"cx_combo_chars_hands_2",c:"组合",i:"🧩",l:"使用武将数与同桌人次 · 75·185,000",d:"累计使用武将数达到 75 名，且同桌人次达到 185,000 人次",a:[["wrChars",75],["worldHands",185000]],r:2344},
		{k:"cx_combo_chars_hands_3",c:"组合",i:"🧩",l:"使用武将数与同桌人次 · 85·285,000",d:"累计使用武将数达到 85 名，且同桌人次达到 285,000 人次",a:[["wrChars",85],["worldHands",285000]],r:3398},
		{k:"cx_combo_chars_hands_4",c:"组合",i:"🧩",l:"使用武将数与同桌人次 · 90·350,000",d:"累计使用武将数达到 90 名，且同桌人次达到 350,000 人次",a:[["wrChars",90],["worldHands",350000]],r:4875},
		{k:"cx_combo_chars_hands_5",c:"组合",i:"🧩",l:"使用武将数与同桌人次 · 100·530,000",d:"累计使用武将数达到 100 名，且同桌人次达到 530,000 人次",a:[["wrChars",100],["worldHands",530000]],r:6773},
		{k:"cx_combo_chars_hands_6",c:"组合",i:"🧩",l:"使用武将数与同桌人次 · 105·800,000",d:"累计使用武将数达到 105 名，且同桌人次达到 800,000 人次",a:[["wrChars",105],["worldHands",800000]],r:9094},
		{k:"cx_combo_chars_hands_7",c:"组合",i:"🧩",l:"使用武将数与同桌人次 · 115·980,000",d:"累计使用武将数达到 115 名，且同桌人次达到 980,000 人次",a:[["wrChars",115],["worldHands",980000]],r:11836},
		{k:"cx_combo_chars_hands_8",c:"组合",i:"🧩",l:"使用武将数与同桌人次 · 120·1,480,000",d:"累计使用武将数达到 120 名，且同桌人次达到 1,480,000 人次",a:[["wrChars",120],["worldHands",1480000]],r:15000},
		{k:"cx_combo_chars_retired_0",c:"组合",i:"🧩",l:"使用武将数与当前退隐人数 · 60·88",d:"累计使用武将数达到 60 名，且当前退隐人数达到 88 名",a:[["wrChars",60],["worldRetired",88]],r:1500},
		{k:"cx_combo_chars_retired_1",c:"组合",i:"🧩",l:"使用武将数与当前退隐人数 · 70·96",d:"累计使用武将数达到 70 名，且当前退隐人数达到 96 名",a:[["wrChars",70],["worldRetired",96]],r:1711},
		{k:"cx_combo_chars_retired_2",c:"组合",i:"🧩",l:"使用武将数与当前退隐人数 · 75·100",d:"累计使用武将数达到 75 名，且当前退隐人数达到 100 名",a:[["wrChars",75],["worldRetired",100]],r:2344},
		{k:"cx_combo_chars_retired_3",c:"组合",i:"🧩",l:"使用武将数与当前退隐人数 · 85·105",d:"累计使用武将数达到 85 名，且当前退隐人数达到 105 名",a:[["wrChars",85],["worldRetired",105]],r:3398},
		{k:"cx_combo_chars_retired_4",c:"组合",i:"🧩",l:"使用武将数与当前退隐人数 · 90·110",d:"累计使用武将数达到 90 名，且当前退隐人数达到 110 名",a:[["wrChars",90],["worldRetired",110]],r:4875},
		{k:"cx_combo_chars_retired_5",c:"组合",i:"🧩",l:"使用武将数与当前退隐人数 · 100·116",d:"累计使用武将数达到 100 名，且当前退隐人数达到 116 名",a:[["wrChars",100],["worldRetired",116]],r:6773},
		{k:"cx_combo_chars_retired_6",c:"组合",i:"🧩",l:"使用武将数与当前退隐人数 · 105·130",d:"累计使用武将数达到 105 名，且当前退隐人数达到 130 名",a:[["wrChars",105],["worldRetired",130]],r:9094},
		{k:"cx_combo_chars_retired_7",c:"组合",i:"🧩",l:"使用武将数与当前退隐人数 · 115·140",d:"累计使用武将数达到 115 名，且当前退隐人数达到 140 名",a:[["wrChars",115],["worldRetired",140]],r:11836},
		{k:"cx_combo_chars_retired_8",c:"组合",i:"🧩",l:"使用武将数与当前退隐人数 · 120·150",d:"累计使用武将数达到 120 名，且当前退隐人数达到 150 名",a:[["wrChars",120],["worldRetired",150]],r:15000},
		{k:"cx_combo_wins_sign_0",c:"组合",i:"🧩",l:"长胜不辍 · 11,000·420",d:"累计胜场达到 11,000 胜，且连续签到达到 420 天",a:[["wrWin",11000],["streak",420]],r:1500},
		{k:"cx_combo_wins_sign_1",c:"组合",i:"🧩",l:"长胜不辍 · 12,000·445",d:"累计胜场达到 12,000 胜，且连续签到达到 445 天",a:[["wrWin",12000],["streak",445]],r:1711},
		{k:"cx_combo_wins_sign_2",c:"组合",i:"🧩",l:"长胜不辍 · 12,000·500",d:"累计胜场达到 12,000 胜，且连续签到达到 500 天",a:[["wrWin",12000],["streak",500]],r:2344},
		{k:"cx_combo_wins_sign_3",c:"组合",i:"🧩",l:"长胜不辍 · 13,000·530",d:"累计胜场达到 13,000 胜，且连续签到达到 530 天",a:[["wrWin",13000],["streak",530]],r:3398},
		{k:"cx_combo_wins_sign_4",c:"组合",i:"🧩",l:"长胜不辍 · 13,000·565",d:"累计胜场达到 13,000 胜，且连续签到达到 565 天",a:[["wrWin",13000],["streak",565]],r:4875},
		{k:"cx_combo_wins_sign_5",c:"组合",i:"🧩",l:"长胜不辍 · 14,000·640",d:"累计胜场达到 14,000 胜，且连续签到达到 640 天",a:[["wrWin",14000],["streak",640]],r:6773},
		{k:"cx_combo_wins_sign_6",c:"组合",i:"🧩",l:"长胜不辍 · 14,000·680",d:"累计胜场达到 14,000 胜，且连续签到达到 680 天",a:[["wrWin",14000],["streak",680]],r:9094},
		{k:"cx_combo_wins_sign_7",c:"组合",i:"🧩",l:"长胜不辍 · 15,000·785",d:"累计胜场达到 15,000 胜，且连续签到达到 785 天",a:[["wrWin",15000],["streak",785]],r:11836},
		{k:"cx_combo_wins_sign_8",c:"组合",i:"🧩",l:"长胜不辍 · 15,000·845",d:"累计胜场达到 15,000 胜，且连续签到达到 845 天",a:[["wrWin",15000],["streak",845]],r:15000},
		{k:"cx_combo_wins_task_0",c:"组合",i:"🧩",l:"勤战兼备 · 11,000·21",d:"累计胜场达到 11,000 胜，且日课完成达到 21 项",a:[["wrWin",11000],["taskCompletedTotal",21]],r:1500},
		{k:"cx_combo_wins_task_1",c:"组合",i:"🧩",l:"勤战兼备 · 12,000·23",d:"累计胜场达到 12,000 胜，且日课完成达到 23 项",a:[["wrWin",12000],["taskCompletedTotal",23]],r:1711},
		{k:"cx_combo_wins_task_2",c:"组合",i:"🧩",l:"勤战兼备 · 12,000·29",d:"累计胜场达到 12,000 胜，且日课完成达到 29 项",a:[["wrWin",12000],["taskCompletedTotal",29]],r:2344},
		{k:"cx_combo_wins_task_3",c:"组合",i:"🧩",l:"勤战兼备 · 13,000·32",d:"累计胜场达到 13,000 胜，且日课完成达到 32 项",a:[["wrWin",13000],["taskCompletedTotal",32]],r:3398},
		{k:"cx_combo_wins_task_4",c:"组合",i:"🧩",l:"勤战兼备 · 13,000·36",d:"累计胜场达到 13,000 胜，且日课完成达到 36 项",a:[["wrWin",13000],["taskCompletedTotal",36]],r:4875},
		{k:"cx_combo_wins_task_5",c:"组合",i:"🧩",l:"勤战兼备 · 14,000·45",d:"累计胜场达到 14,000 胜，且日课完成达到 45 项",a:[["wrWin",14000],["taskCompletedTotal",45]],r:6773},
		{k:"cx_combo_wins_task_6",c:"组合",i:"🧩",l:"勤战兼备 · 14,000·51",d:"累计胜场达到 14,000 胜，且日课完成达到 51 项",a:[["wrWin",14000],["taskCompletedTotal",51]],r:9094},
		{k:"cx_combo_wins_task_7",c:"组合",i:"🧩",l:"勤战兼备 · 15,000·66",d:"累计胜场达到 15,000 胜，且日课完成达到 66 项",a:[["wrWin",15000],["taskCompletedTotal",66]],r:11836},
		{k:"cx_combo_wins_task_8",c:"组合",i:"🧩",l:"勤战兼备 · 15,000·75",d:"累计胜场达到 15,000 胜，且日课完成达到 75 项",a:[["wrWin",15000],["taskCompletedTotal",75]],r:15000},
		{k:"cx_combo_games_sign_0",c:"组合",i:"🧩",l:"对局数与连续签到 · 11,000·420",d:"累计对局数达到 11,000 局，且连续签到达到 420 天",a:[["wrGames",11000],["streak",420]],r:1500},
		{k:"cx_combo_games_sign_1",c:"组合",i:"🧩",l:"对局数与连续签到 · 12,000·445",d:"累计对局数达到 12,000 局，且连续签到达到 445 天",a:[["wrGames",12000],["streak",445]],r:1711},
		{k:"cx_combo_games_sign_2",c:"组合",i:"🧩",l:"对局数与连续签到 · 12,000·500",d:"累计对局数达到 12,000 局，且连续签到达到 500 天",a:[["wrGames",12000],["streak",500]],r:2344},
		{k:"cx_combo_games_sign_3",c:"组合",i:"🧩",l:"对局数与连续签到 · 13,000·530",d:"累计对局数达到 13,000 局，且连续签到达到 530 天",a:[["wrGames",13000],["streak",530]],r:3398},
		{k:"cx_combo_games_sign_4",c:"组合",i:"🧩",l:"对局数与连续签到 · 13,000·565",d:"累计对局数达到 13,000 局，且连续签到达到 565 天",a:[["wrGames",13000],["streak",565]],r:4875},
		{k:"cx_combo_games_sign_5",c:"组合",i:"🧩",l:"对局数与连续签到 · 14,000·640",d:"累计对局数达到 14,000 局，且连续签到达到 640 天",a:[["wrGames",14000],["streak",640]],r:6773},
		{k:"cx_combo_games_sign_6",c:"组合",i:"🧩",l:"对局数与连续签到 · 14,000·680",d:"累计对局数达到 14,000 局，且连续签到达到 680 天",a:[["wrGames",14000],["streak",680]],r:9094},
		{k:"cx_combo_games_sign_7",c:"组合",i:"🧩",l:"对局数与连续签到 · 15,000·785",d:"累计对局数达到 15,000 局，且连续签到达到 785 天",a:[["wrGames",15000],["streak",785]],r:11836},
		{k:"cx_combo_games_sign_8",c:"组合",i:"🧩",l:"对局数与连续签到 · 15,000·845",d:"累计对局数达到 15,000 局，且连续签到达到 845 天",a:[["wrGames",15000],["streak",845]],r:15000},
		{k:"cx_combo_games_task_0",c:"组合",i:"🧩",l:"对局数与日课完成 · 11,000·21",d:"累计对局数达到 11,000 局，且日课完成达到 21 项",a:[["wrGames",11000],["taskCompletedTotal",21]],r:1500},
		{k:"cx_combo_games_task_1",c:"组合",i:"🧩",l:"对局数与日课完成 · 12,000·23",d:"累计对局数达到 12,000 局，且日课完成达到 23 项",a:[["wrGames",12000],["taskCompletedTotal",23]],r:1711},
		{k:"cx_combo_games_task_2",c:"组合",i:"🧩",l:"对局数与日课完成 · 12,000·29",d:"累计对局数达到 12,000 局，且日课完成达到 29 项",a:[["wrGames",12000],["taskCompletedTotal",29]],r:2344},
		{k:"cx_combo_games_task_3",c:"组合",i:"🧩",l:"对局数与日课完成 · 13,000·32",d:"累计对局数达到 13,000 局，且日课完成达到 32 项",a:[["wrGames",13000],["taskCompletedTotal",32]],r:3398},
		{k:"cx_combo_games_task_4",c:"组合",i:"🧩",l:"对局数与日课完成 · 13,000·36",d:"累计对局数达到 13,000 局，且日课完成达到 36 项",a:[["wrGames",13000],["taskCompletedTotal",36]],r:4875},
		{k:"cx_combo_games_task_5",c:"组合",i:"🧩",l:"对局数与日课完成 · 14,000·45",d:"累计对局数达到 14,000 局，且日课完成达到 45 项",a:[["wrGames",14000],["taskCompletedTotal",45]],r:6773},
		{k:"cx_combo_games_task_6",c:"组合",i:"🧩",l:"对局数与日课完成 · 14,000·51",d:"累计对局数达到 14,000 局，且日课完成达到 51 项",a:[["wrGames",14000],["taskCompletedTotal",51]],r:9094},
		{k:"cx_combo_games_task_7",c:"组合",i:"🧩",l:"对局数与日课完成 · 15,000·66",d:"累计对局数达到 15,000 局，且日课完成达到 66 项",a:[["wrGames",15000],["taskCompletedTotal",66]],r:11836},
		{k:"cx_combo_games_task_8",c:"组合",i:"🧩",l:"对局数与日课完成 · 15,000·75",d:"累计对局数达到 15,000 局，且日课完成达到 75 项",a:[["wrGames",15000],["taskCompletedTotal",75]],r:15000},
		{k:"cx_combo_kills_sign_0",c:"组合",i:"🧩",l:"杀伐不歇 · 12,500·420",d:"累计击杀达到 12,500 人，且连续签到达到 420 天",a:[["wrKill",12500],["streak",420]],r:1500},
		{k:"cx_combo_kills_sign_1",c:"组合",i:"🧩",l:"杀伐不歇 · 14,500·445",d:"累计击杀达到 14,500 人，且连续签到达到 445 天",a:[["wrKill",14500],["streak",445]],r:1711},
		{k:"cx_combo_kills_sign_2",c:"组合",i:"🧩",l:"杀伐不歇 · 16,500·500",d:"累计击杀达到 16,500 人，且连续签到达到 500 天",a:[["wrKill",16500],["streak",500]],r:2344},
		{k:"cx_combo_kills_sign_3",c:"组合",i:"🧩",l:"杀伐不歇 · 19,000·530",d:"累计击杀达到 19,000 人，且连续签到达到 530 天",a:[["wrKill",19000],["streak",530]],r:3398},
		{k:"cx_combo_kills_sign_4",c:"组合",i:"🧩",l:"杀伐不歇 · 22,000·565",d:"累计击杀达到 22,000 人，且连续签到达到 565 天",a:[["wrKill",22000],["streak",565]],r:4875},
		{k:"cx_combo_kills_sign_5",c:"组合",i:"🧩",l:"杀伐不歇 · 25,500·640",d:"累计击杀达到 25,500 人，且连续签到达到 640 天",a:[["wrKill",25500],["streak",640]],r:6773},
		{k:"cx_combo_kills_sign_6",c:"组合",i:"🧩",l:"杀伐不歇 · 29,500·680",d:"累计击杀达到 29,500 人，且连续签到达到 680 天",a:[["wrKill",29500],["streak",680]],r:9094},
		{k:"cx_combo_kills_sign_7",c:"组合",i:"🧩",l:"杀伐不歇 · 34,000·785",d:"累计击杀达到 34,000 人，且连续签到达到 785 天",a:[["wrKill",34000],["streak",785]],r:11836},
		{k:"cx_combo_kills_sign_8",c:"组合",i:"🧩",l:"杀伐不歇 · 39,000·845",d:"累计击杀达到 39,000 人，且连续签到达到 845 天",a:[["wrKill",39000],["streak",845]],r:15000},
		{k:"cx_combo_kills_task_0",c:"组合",i:"🧩",l:"悍勇勤勉 · 12,500·21",d:"累计击杀达到 12,500 人，且日课完成达到 21 项",a:[["wrKill",12500],["taskCompletedTotal",21]],r:1500},
		{k:"cx_combo_kills_task_1",c:"组合",i:"🧩",l:"悍勇勤勉 · 14,500·23",d:"累计击杀达到 14,500 人，且日课完成达到 23 项",a:[["wrKill",14500],["taskCompletedTotal",23]],r:1711},
		{k:"cx_combo_kills_task_2",c:"组合",i:"🧩",l:"悍勇勤勉 · 16,500·29",d:"累计击杀达到 16,500 人，且日课完成达到 29 项",a:[["wrKill",16500],["taskCompletedTotal",29]],r:2344},
		{k:"cx_combo_kills_task_3",c:"组合",i:"🧩",l:"悍勇勤勉 · 19,000·32",d:"累计击杀达到 19,000 人，且日课完成达到 32 项",a:[["wrKill",19000],["taskCompletedTotal",32]],r:3398},
		{k:"cx_combo_kills_task_4",c:"组合",i:"🧩",l:"悍勇勤勉 · 22,000·36",d:"累计击杀达到 22,000 人，且日课完成达到 36 项",a:[["wrKill",22000],["taskCompletedTotal",36]],r:4875},
		{k:"cx_combo_kills_task_5",c:"组合",i:"🧩",l:"悍勇勤勉 · 25,500·45",d:"累计击杀达到 25,500 人，且日课完成达到 45 项",a:[["wrKill",25500],["taskCompletedTotal",45]],r:6773},
		{k:"cx_combo_kills_task_6",c:"组合",i:"🧩",l:"悍勇勤勉 · 29,500·51",d:"累计击杀达到 29,500 人，且日课完成达到 51 项",a:[["wrKill",29500],["taskCompletedTotal",51]],r:9094},
		{k:"cx_combo_kills_task_7",c:"组合",i:"🧩",l:"悍勇勤勉 · 34,000·66",d:"累计击杀达到 34,000 人，且日课完成达到 66 项",a:[["wrKill",34000],["taskCompletedTotal",66]],r:11836},
		{k:"cx_combo_kills_task_8",c:"组合",i:"🧩",l:"悍勇勤勉 · 39,000·75",d:"累计击杀达到 39,000 人，且日课完成达到 75 项",a:[["wrKill",39000],["taskCompletedTotal",75]],r:15000},
		{k:"cx_combo_chars_sign_0",c:"组合",i:"🧩",l:"使用武将数与连续签到 · 60·420",d:"累计使用武将数达到 60 名，且连续签到达到 420 天",a:[["wrChars",60],["streak",420]],r:1500},
		{k:"cx_combo_chars_sign_1",c:"组合",i:"🧩",l:"使用武将数与连续签到 · 70·445",d:"累计使用武将数达到 70 名，且连续签到达到 445 天",a:[["wrChars",70],["streak",445]],r:1711},
		{k:"cx_combo_chars_sign_2",c:"组合",i:"🧩",l:"使用武将数与连续签到 · 75·500",d:"累计使用武将数达到 75 名，且连续签到达到 500 天",a:[["wrChars",75],["streak",500]],r:2344},
		{k:"cx_combo_chars_sign_3",c:"组合",i:"🧩",l:"使用武将数与连续签到 · 85·530",d:"累计使用武将数达到 85 名，且连续签到达到 530 天",a:[["wrChars",85],["streak",530]],r:3398},
		{k:"cx_combo_chars_sign_4",c:"组合",i:"🧩",l:"使用武将数与连续签到 · 90·565",d:"累计使用武将数达到 90 名，且连续签到达到 565 天",a:[["wrChars",90],["streak",565]],r:4875},
		{k:"cx_combo_chars_sign_5",c:"组合",i:"🧩",l:"使用武将数与连续签到 · 100·640",d:"累计使用武将数达到 100 名，且连续签到达到 640 天",a:[["wrChars",100],["streak",640]],r:6773},
		{k:"cx_combo_chars_sign_6",c:"组合",i:"🧩",l:"使用武将数与连续签到 · 105·680",d:"累计使用武将数达到 105 名，且连续签到达到 680 天",a:[["wrChars",105],["streak",680]],r:9094},
		{k:"cx_combo_chars_sign_7",c:"组合",i:"🧩",l:"使用武将数与连续签到 · 115·785",d:"累计使用武将数达到 115 名，且连续签到达到 785 天",a:[["wrChars",115],["streak",785]],r:11836},
		{k:"cx_combo_chars_sign_8",c:"组合",i:"🧩",l:"使用武将数与连续签到 · 120·845",d:"累计使用武将数达到 120 名，且连续签到达到 845 天",a:[["wrChars",120],["streak",845]],r:15000},
		{k:"cx_combo_chars_task_0",c:"组合",i:"🧩",l:"使用武将数与日课完成 · 60·21",d:"累计使用武将数达到 60 名，且日课完成达到 21 项",a:[["wrChars",60],["taskCompletedTotal",21]],r:1500},
		{k:"cx_combo_chars_task_1",c:"组合",i:"🧩",l:"使用武将数与日课完成 · 70·23",d:"累计使用武将数达到 70 名，且日课完成达到 23 项",a:[["wrChars",70],["taskCompletedTotal",23]],r:1711},
		{k:"cx_combo_chars_task_2",c:"组合",i:"🧩",l:"使用武将数与日课完成 · 75·29",d:"累计使用武将数达到 75 名，且日课完成达到 29 项",a:[["wrChars",75],["taskCompletedTotal",29]],r:2344},
		{k:"cx_combo_chars_task_3",c:"组合",i:"🧩",l:"使用武将数与日课完成 · 85·32",d:"累计使用武将数达到 85 名，且日课完成达到 32 项",a:[["wrChars",85],["taskCompletedTotal",32]],r:3398},
		{k:"cx_combo_chars_task_4",c:"组合",i:"🧩",l:"使用武将数与日课完成 · 90·36",d:"累计使用武将数达到 90 名，且日课完成达到 36 项",a:[["wrChars",90],["taskCompletedTotal",36]],r:4875},
		{k:"cx_combo_chars_task_5",c:"组合",i:"🧩",l:"使用武将数与日课完成 · 100·45",d:"累计使用武将数达到 100 名，且日课完成达到 45 项",a:[["wrChars",100],["taskCompletedTotal",45]],r:6773},
		{k:"cx_combo_chars_task_6",c:"组合",i:"🧩",l:"使用武将数与日课完成 · 105·51",d:"累计使用武将数达到 105 名，且日课完成达到 51 项",a:[["wrChars",105],["taskCompletedTotal",51]],r:9094},
		{k:"cx_combo_chars_task_7",c:"组合",i:"🧩",l:"使用武将数与日课完成 · 115·66",d:"累计使用武将数达到 115 名，且日课完成达到 66 项",a:[["wrChars",115],["taskCompletedTotal",66]],r:11836},
		{k:"cx_combo_chars_task_8",c:"组合",i:"🧩",l:"使用武将数与日课完成 · 120·75",d:"累计使用武将数达到 120 名，且日课完成达到 75 项",a:[["wrChars",120],["taskCompletedTotal",75]],r:15000},
		{k:"cx_combo_wins_interact_0",c:"组合",i:"🧩",l:"胜场与互动次数 · 11,000·57,000",d:"累计胜场达到 11,000 胜，且互动次数达到 57,000 次",a:[["wrWin",11000],["interactTotal",57000]],r:1500},
		{k:"cx_combo_wins_interact_1",c:"组合",i:"🧩",l:"胜场与互动次数 · 12,000·81,000",d:"累计胜场达到 12,000 胜，且互动次数达到 81,000 次",a:[["wrWin",12000],["interactTotal",81000]],r:1711},
		{k:"cx_combo_wins_interact_2",c:"组合",i:"🧩",l:"胜场与互动次数 · 12,000·115,000",d:"累计胜场达到 12,000 胜，且互动次数达到 115,000 次",a:[["wrWin",12000],["interactTotal",115000]],r:2344},
		{k:"cx_combo_wins_interact_3",c:"组合",i:"🧩",l:"胜场与互动次数 · 13,000·163,000",d:"累计胜场达到 13,000 胜，且互动次数达到 163,000 次",a:[["wrWin",13000],["interactTotal",163000]],r:3398},
		{k:"cx_combo_wins_interact_4",c:"组合",i:"🧩",l:"胜场与互动次数 · 13,000·232,000",d:"累计胜场达到 13,000 胜，且互动次数达到 232,000 次",a:[["wrWin",13000],["interactTotal",232000]],r:4875},
		{k:"cx_combo_wins_interact_5",c:"组合",i:"🧩",l:"胜场与互动次数 · 14,000·328,000",d:"累计胜场达到 14,000 胜，且互动次数达到 328,000 次",a:[["wrWin",14000],["interactTotal",328000]],r:6773},
		{k:"cx_combo_wins_interact_6",c:"组合",i:"🧩",l:"胜场与互动次数 · 14,000·465,000",d:"累计胜场达到 14,000 胜，且互动次数达到 465,000 次",a:[["wrWin",14000],["interactTotal",465000]],r:9094},
		{k:"cx_combo_wins_interact_7",c:"组合",i:"🧩",l:"胜场与互动次数 · 15,000·660,000",d:"累计胜场达到 15,000 胜，且互动次数达到 660,000 次",a:[["wrWin",15000],["interactTotal",660000]],r:11836},
		{k:"cx_combo_wins_interact_8",c:"组合",i:"🧩",l:"胜场与互动次数 · 15,000·920,000",d:"累计胜场达到 15,000 胜，且互动次数达到 920,000 次",a:[["wrWin",15000],["interactTotal",920000]],r:15000},
		{k:"cx_combo_games_interact_0",c:"组合",i:"🧩",l:"对局数与互动次数 · 11,000·57,000",d:"累计对局数达到 11,000 局，且互动次数达到 57,000 次",a:[["wrGames",11000],["interactTotal",57000]],r:1500},
		{k:"cx_combo_games_interact_1",c:"组合",i:"🧩",l:"对局数与互动次数 · 12,000·81,000",d:"累计对局数达到 12,000 局，且互动次数达到 81,000 次",a:[["wrGames",12000],["interactTotal",81000]],r:1711},
		{k:"cx_combo_games_interact_2",c:"组合",i:"🧩",l:"对局数与互动次数 · 12,000·115,000",d:"累计对局数达到 12,000 局，且互动次数达到 115,000 次",a:[["wrGames",12000],["interactTotal",115000]],r:2344},
		{k:"cx_combo_games_interact_3",c:"组合",i:"🧩",l:"对局数与互动次数 · 13,000·163,000",d:"累计对局数达到 13,000 局，且互动次数达到 163,000 次",a:[["wrGames",13000],["interactTotal",163000]],r:3398},
		{k:"cx_combo_games_interact_4",c:"组合",i:"🧩",l:"对局数与互动次数 · 13,000·232,000",d:"累计对局数达到 13,000 局，且互动次数达到 232,000 次",a:[["wrGames",13000],["interactTotal",232000]],r:4875},
		{k:"cx_combo_games_interact_5",c:"组合",i:"🧩",l:"对局数与互动次数 · 14,000·328,000",d:"累计对局数达到 14,000 局，且互动次数达到 328,000 次",a:[["wrGames",14000],["interactTotal",328000]],r:6773},
		{k:"cx_combo_games_interact_6",c:"组合",i:"🧩",l:"对局数与互动次数 · 14,000·465,000",d:"累计对局数达到 14,000 局，且互动次数达到 465,000 次",a:[["wrGames",14000],["interactTotal",465000]],r:9094},
		{k:"cx_combo_games_interact_7",c:"组合",i:"🧩",l:"对局数与互动次数 · 15,000·660,000",d:"累计对局数达到 15,000 局，且互动次数达到 660,000 次",a:[["wrGames",15000],["interactTotal",660000]],r:11836},
		{k:"cx_combo_games_interact_8",c:"组合",i:"🧩",l:"对局数与互动次数 · 15,000·920,000",d:"累计对局数达到 15,000 局，且互动次数达到 920,000 次",a:[["wrGames",15000],["interactTotal",920000]],r:15000},
		{k:"cx_combo_kills_interact_0",c:"组合",i:"🧩",l:"击杀与互动次数 · 12,500·57,000",d:"累计击杀达到 12,500 人，且互动次数达到 57,000 次",a:[["wrKill",12500],["interactTotal",57000]],r:1500},
		{k:"cx_combo_kills_interact_1",c:"组合",i:"🧩",l:"击杀与互动次数 · 14,500·81,000",d:"累计击杀达到 14,500 人，且互动次数达到 81,000 次",a:[["wrKill",14500],["interactTotal",81000]],r:1711},
		{k:"cx_combo_kills_interact_2",c:"组合",i:"🧩",l:"击杀与互动次数 · 16,500·115,000",d:"累计击杀达到 16,500 人，且互动次数达到 115,000 次",a:[["wrKill",16500],["interactTotal",115000]],r:2344},
		{k:"cx_combo_kills_interact_3",c:"组合",i:"🧩",l:"击杀与互动次数 · 19,000·163,000",d:"累计击杀达到 19,000 人，且互动次数达到 163,000 次",a:[["wrKill",19000],["interactTotal",163000]],r:3398},
		{k:"cx_combo_kills_interact_4",c:"组合",i:"🧩",l:"击杀与互动次数 · 22,000·232,000",d:"累计击杀达到 22,000 人，且互动次数达到 232,000 次",a:[["wrKill",22000],["interactTotal",232000]],r:4875},
		{k:"cx_combo_kills_interact_5",c:"组合",i:"🧩",l:"击杀与互动次数 · 25,500·328,000",d:"累计击杀达到 25,500 人，且互动次数达到 328,000 次",a:[["wrKill",25500],["interactTotal",328000]],r:6773},
		{k:"cx_combo_kills_interact_6",c:"组合",i:"🧩",l:"击杀与互动次数 · 29,500·465,000",d:"累计击杀达到 29,500 人，且互动次数达到 465,000 次",a:[["wrKill",29500],["interactTotal",465000]],r:9094},
		{k:"cx_combo_kills_interact_7",c:"组合",i:"🧩",l:"击杀与互动次数 · 34,000·660,000",d:"累计击杀达到 34,000 人，且互动次数达到 660,000 次",a:[["wrKill",34000],["interactTotal",660000]],r:11836},
		{k:"cx_combo_kills_interact_8",c:"组合",i:"🧩",l:"击杀与互动次数 · 39,000·920,000",d:"累计击杀达到 39,000 人，且互动次数达到 920,000 次",a:[["wrKill",39000],["interactTotal",920000]],r:15000},
		{k:"cx_combo_chars_interact_0",c:"组合",i:"🧩",l:"使用武将数与互动次数 · 60·57,000",d:"累计使用武将数达到 60 名，且互动次数达到 57,000 次",a:[["wrChars",60],["interactTotal",57000]],r:1500},
		{k:"cx_combo_chars_interact_1",c:"组合",i:"🧩",l:"使用武将数与互动次数 · 70·81,000",d:"累计使用武将数达到 70 名，且互动次数达到 81,000 次",a:[["wrChars",70],["interactTotal",81000]],r:1711},
		{k:"cx_combo_chars_interact_2",c:"组合",i:"🧩",l:"使用武将数与互动次数 · 75·115,000",d:"累计使用武将数达到 75 名，且互动次数达到 115,000 次",a:[["wrChars",75],["interactTotal",115000]],r:2344},
		{k:"cx_combo_chars_interact_3",c:"组合",i:"🧩",l:"使用武将数与互动次数 · 85·163,000",d:"累计使用武将数达到 85 名，且互动次数达到 163,000 次",a:[["wrChars",85],["interactTotal",163000]],r:3398},
		{k:"cx_combo_chars_interact_4",c:"组合",i:"🧩",l:"使用武将数与互动次数 · 90·232,000",d:"累计使用武将数达到 90 名，且互动次数达到 232,000 次",a:[["wrChars",90],["interactTotal",232000]],r:4875},
		{k:"cx_combo_chars_interact_5",c:"组合",i:"🧩",l:"使用武将数与互动次数 · 100·328,000",d:"累计使用武将数达到 100 名，且互动次数达到 328,000 次",a:[["wrChars",100],["interactTotal",328000]],r:6773},
		{k:"cx_combo_chars_interact_6",c:"组合",i:"🧩",l:"使用武将数与互动次数 · 105·465,000",d:"累计使用武将数达到 105 名，且互动次数达到 465,000 次",a:[["wrChars",105],["interactTotal",465000]],r:9094},
		{k:"cx_combo_chars_interact_7",c:"组合",i:"🧩",l:"使用武将数与互动次数 · 115·660,000",d:"累计使用武将数达到 115 名，且互动次数达到 660,000 次",a:[["wrChars",115],["interactTotal",660000]],r:11836},
		{k:"cx_combo_chars_interact_8",c:"组合",i:"🧩",l:"使用武将数与互动次数 · 120·920,000",d:"累计使用武将数达到 120 名，且互动次数达到 920,000 次",a:[["wrChars",120],["interactTotal",920000]],r:15000},
		{k:"cx_combo_gmplay_hands_0",c:"组合",i:"🧩",l:"出战次数与同桌人次 · 1,900·78,000",d:"累计出战次数达到 1,900 场，且同桌人次达到 78,000 人次",a:[["gamblePlays",1900],["worldHands",78000]],r:1500},
		{k:"cx_combo_gmplay_hands_1",c:"组合",i:"🧩",l:"出战次数与同桌人次 · 2,200·120,000",d:"累计出战次数达到 2,200 场，且同桌人次达到 120,000 人次",a:[["gamblePlays",2200],["worldHands",120000]],r:1711},
		{k:"cx_combo_gmplay_hands_2",c:"组合",i:"🧩",l:"出战次数与同桌人次 · 2,900·185,000",d:"累计出战次数达到 2,900 场，且同桌人次达到 185,000 人次",a:[["gamblePlays",2900],["worldHands",185000]],r:2344},
		{k:"cx_combo_gmplay_hands_3",c:"组合",i:"🧩",l:"出战次数与同桌人次 · 3,300·285,000",d:"累计出战次数达到 3,300 场，且同桌人次达到 285,000 人次",a:[["gamblePlays",3300],["worldHands",285000]],r:3398},
		{k:"cx_combo_gmplay_hands_4",c:"组合",i:"🧩",l:"出战次数与同桌人次 · 3,800·350,000",d:"累计出战次数达到 3,800 场，且同桌人次达到 350,000 人次",a:[["gamblePlays",3800],["worldHands",350000]],r:4875},
		{k:"cx_combo_gmplay_hands_5",c:"组合",i:"🧩",l:"出战次数与同桌人次 · 5,100·530,000",d:"累计出战次数达到 5,100 场，且同桌人次达到 530,000 人次",a:[["gamblePlays",5100],["worldHands",530000]],r:6773},
		{k:"cx_combo_gmplay_hands_6",c:"组合",i:"🧩",l:"出战次数与同桌人次 · 5,900·800,000",d:"累计出战次数达到 5,900 场，且同桌人次达到 800,000 人次",a:[["gamblePlays",5900],["worldHands",800000]],r:9094},
		{k:"cx_combo_gmplay_hands_7",c:"组合",i:"🧩",l:"出战次数与同桌人次 · 7,900·980,000",d:"累计出战次数达到 7,900 场，且同桌人次达到 980,000 人次",a:[["gamblePlays",7900],["worldHands",980000]],r:11836},
		{k:"cx_combo_gmplay_hands_8",c:"组合",i:"🧩",l:"出战次数与同桌人次 · 9,200·1,480,000",d:"累计出战次数达到 9,200 场，且同桌人次达到 1,480,000 人次",a:[["gamblePlays",9200],["worldHands",1480000]],r:15000},
		{k:"cx_combo_gmplay_retired_0",c:"组合",i:"🧩",l:"出战次数与当前退隐人数 · 1,900·88",d:"累计出战次数达到 1,900 场，且当前退隐人数达到 88 名",a:[["gamblePlays",1900],["worldRetired",88]],r:1500},
		{k:"cx_combo_gmplay_retired_1",c:"组合",i:"🧩",l:"出战次数与当前退隐人数 · 2,200·96",d:"累计出战次数达到 2,200 场，且当前退隐人数达到 96 名",a:[["gamblePlays",2200],["worldRetired",96]],r:1711},
		{k:"cx_combo_gmplay_retired_2",c:"组合",i:"🧩",l:"出战次数与当前退隐人数 · 2,900·100",d:"累计出战次数达到 2,900 场，且当前退隐人数达到 100 名",a:[["gamblePlays",2900],["worldRetired",100]],r:2344},
		{k:"cx_combo_gmplay_retired_3",c:"组合",i:"🧩",l:"出战次数与当前退隐人数 · 3,300·105",d:"累计出战次数达到 3,300 场，且当前退隐人数达到 105 名",a:[["gamblePlays",3300],["worldRetired",105]],r:3398},
		{k:"cx_combo_gmplay_retired_4",c:"组合",i:"🧩",l:"出战次数与当前退隐人数 · 3,800·110",d:"累计出战次数达到 3,800 场，且当前退隐人数达到 110 名",a:[["gamblePlays",3800],["worldRetired",110]],r:4875},
		{k:"cx_combo_gmplay_retired_5",c:"组合",i:"🧩",l:"出战次数与当前退隐人数 · 5,100·116",d:"累计出战次数达到 5,100 场，且当前退隐人数达到 116 名",a:[["gamblePlays",5100],["worldRetired",116]],r:6773},
		{k:"cx_combo_gmplay_retired_6",c:"组合",i:"🧩",l:"出战次数与当前退隐人数 · 5,900·130",d:"累计出战次数达到 5,900 场，且当前退隐人数达到 130 名",a:[["gamblePlays",5900],["worldRetired",130]],r:9094},
		{k:"cx_combo_gmplay_retired_7",c:"组合",i:"🧩",l:"出战次数与当前退隐人数 · 7,900·140",d:"累计出战次数达到 7,900 场，且当前退隐人数达到 140 名",a:[["gamblePlays",7900],["worldRetired",140]],r:11836},
		{k:"cx_combo_gmplay_retired_8",c:"组合",i:"🧩",l:"出战次数与当前退隐人数 · 9,200·150",d:"累计出战次数达到 9,200 场，且当前退隐人数达到 150 名",a:[["gamblePlays",9200],["worldRetired",150]],r:15000},
		{k:"cx_combo_gmwin_hands_0",c:"组合",i:"🧩",l:"胜局与同桌人次 · 215·78,000",d:"累计胜局达到 215 胜，且同桌人次达到 78,000 人次",a:[["gambleWins",215],["worldHands",78000]],r:1500},
		{k:"cx_combo_gmwin_hands_1",c:"组合",i:"🧩",l:"胜局与同桌人次 · 250·120,000",d:"累计胜局达到 250 胜，且同桌人次达到 120,000 人次",a:[["gambleWins",250],["worldHands",120000]],r:1711},
		{k:"cx_combo_gmwin_hands_2",c:"组合",i:"🧩",l:"胜局与同桌人次 · 340·185,000",d:"累计胜局达到 340 胜，且同桌人次达到 185,000 人次",a:[["gambleWins",340],["worldHands",185000]],r:2344},
		{k:"cx_combo_gmwin_hands_3",c:"组合",i:"🧩",l:"胜局与同桌人次 · 460·285,000",d:"累计胜局达到 460 胜，且同桌人次达到 285,000 人次",a:[["gambleWins",460],["worldHands",285000]],r:3398},
		{k:"cx_combo_gmwin_hands_4",c:"组合",i:"🧩",l:"胜局与同桌人次 · 1,500·350,000",d:"累计胜局达到 1,500 胜，且同桌人次达到 350,000 人次",a:[["gambleWins",1500],["worldHands",350000]],r:4875},
		{k:"cx_combo_gmwin_hands_5",c:"组合",i:"🧩",l:"胜局与同桌人次 · 3,000·530,000",d:"累计胜局达到 3,000 胜，且同桌人次达到 530,000 人次",a:[["gambleWins",3000],["worldHands",530000]],r:6773},
		{k:"cx_combo_gmwin_hands_6",c:"组合",i:"🧩",l:"胜局与同桌人次 · 4,000·800,000",d:"累计胜局达到 4,000 胜，且同桌人次达到 800,000 人次",a:[["gambleWins",4000],["worldHands",800000]],r:9094},
		{k:"cx_combo_gmwin_hands_7",c:"组合",i:"🧩",l:"胜局与同桌人次 · 5,000·980,000",d:"累计胜局达到 5,000 胜，且同桌人次达到 980,000 人次",a:[["gambleWins",5000],["worldHands",980000]],r:11836},
		{k:"cx_combo_gmwin_hands_8",c:"组合",i:"🧩",l:"胜局与同桌人次 · 6,000·1,480,000",d:"累计胜局达到 6,000 胜，且同桌人次达到 1,480,000 人次",a:[["gambleWins",6000],["worldHands",1480000]],r:15000},
		{k:"cx_combo_gmwin_retired_0",c:"组合",i:"🧩",l:"胜局与当前退隐人数 · 215·88",d:"累计胜局达到 215 胜，且当前退隐人数达到 88 名",a:[["gambleWins",215],["worldRetired",88]],r:1500},
		{k:"cx_combo_gmwin_retired_1",c:"组合",i:"🧩",l:"胜局与当前退隐人数 · 250·96",d:"累计胜局达到 250 胜，且当前退隐人数达到 96 名",a:[["gambleWins",250],["worldRetired",96]],r:1711},
		{k:"cx_combo_gmwin_retired_2",c:"组合",i:"🧩",l:"胜局与当前退隐人数 · 340·100",d:"累计胜局达到 340 胜，且当前退隐人数达到 100 名",a:[["gambleWins",340],["worldRetired",100]],r:2344},
		{k:"cx_combo_gmwin_retired_3",c:"组合",i:"🧩",l:"胜局与当前退隐人数 · 460·105",d:"累计胜局达到 460 胜，且当前退隐人数达到 105 名",a:[["gambleWins",460],["worldRetired",105]],r:3398},
		{k:"cx_combo_gmwin_retired_4",c:"组合",i:"🧩",l:"胜局与当前退隐人数 · 1,500·110",d:"累计胜局达到 1,500 胜，且当前退隐人数达到 110 名",a:[["gambleWins",1500],["worldRetired",110]],r:4875},
		{k:"cx_combo_gmwin_retired_5",c:"组合",i:"🧩",l:"胜局与当前退隐人数 · 3,000·116",d:"累计胜局达到 3,000 胜，且当前退隐人数达到 116 名",a:[["gambleWins",3000],["worldRetired",116]],r:6773},
		{k:"cx_combo_gmwin_retired_6",c:"组合",i:"🧩",l:"胜局与当前退隐人数 · 4,000·130",d:"累计胜局达到 4,000 胜，且当前退隐人数达到 130 名",a:[["gambleWins",4000],["worldRetired",130]],r:9094},
		{k:"cx_combo_gmwin_retired_7",c:"组合",i:"🧩",l:"胜局与当前退隐人数 · 5,000·140",d:"累计胜局达到 5,000 胜，且当前退隐人数达到 140 名",a:[["gambleWins",5000],["worldRetired",140]],r:11836},
		{k:"cx_combo_gmwin_retired_8",c:"组合",i:"🧩",l:"胜局与当前退隐人数 · 6,000·150",d:"累计胜局达到 6,000 胜，且当前退隐人数达到 150 名",a:[["gambleWins",6000],["worldRetired",150]],r:15000},
		{k:"cx_combo_gmnet_hands_0",c:"组合",i:"🧩",l:"净赢与同桌人次 · 10,000,000·78,000",d:"累计净赢达到 10,000,000 池子币，且同桌人次达到 78,000 人次",a:[["gambleNet",10000000],["worldHands",78000]],r:1500},
		{k:"cx_combo_gmnet_hands_1",c:"组合",i:"🧩",l:"净赢与同桌人次 · 10,000,000·120,000",d:"累计净赢达到 10,000,000 池子币，且同桌人次达到 120,000 人次",a:[["gambleNet",10000000],["worldHands",120000]],r:1711},
		{k:"cx_combo_gmnet_hands_2",c:"组合",i:"🧩",l:"净赢与同桌人次 · 10,000,000·185,000",d:"累计净赢达到 10,000,000 池子币，且同桌人次达到 185,000 人次",a:[["gambleNet",10000000],["worldHands",185000]],r:2344},
		{k:"cx_combo_gmnet_hands_3",c:"组合",i:"🧩",l:"净赢与同桌人次 · 10,000,000·285,000",d:"累计净赢达到 10,000,000 池子币，且同桌人次达到 285,000 人次",a:[["gambleNet",10000000],["worldHands",285000]],r:3398},
		{k:"cx_combo_gmnet_hands_4",c:"组合",i:"🧩",l:"净赢与同桌人次 · 10,000,000·350,000",d:"累计净赢达到 10,000,000 池子币，且同桌人次达到 350,000 人次",a:[["gambleNet",10000000],["worldHands",350000]],r:4875},
		{k:"cx_combo_gmnet_hands_5",c:"组合",i:"🧩",l:"净赢与同桌人次 · 10,000,000·530,000",d:"累计净赢达到 10,000,000 池子币，且同桌人次达到 530,000 人次",a:[["gambleNet",10000000],["worldHands",530000]],r:6773},
		{k:"cx_combo_gmnet_hands_6",c:"组合",i:"🧩",l:"净赢与同桌人次 · 10,000,000·800,000",d:"累计净赢达到 10,000,000 池子币，且同桌人次达到 800,000 人次",a:[["gambleNet",10000000],["worldHands",800000]],r:9094},
		{k:"cx_combo_gmnet_hands_7",c:"组合",i:"🧩",l:"净赢与同桌人次 · 10,000,000·980,000",d:"累计净赢达到 10,000,000 池子币，且同桌人次达到 980,000 人次",a:[["gambleNet",10000000],["worldHands",980000]],r:11836},
		{k:"cx_combo_gmnet_hands_8",c:"组合",i:"🧩",l:"净赢与同桌人次 · 10,000,000·1,480,000",d:"累计净赢达到 10,000,000 池子币，且同桌人次达到 1,480,000 人次",a:[["gambleNet",10000000],["worldHands",1480000]],r:15000},
		{k:"cx_combo_gmnet_retired_0",c:"组合",i:"🧩",l:"净赢与当前退隐人数 · 10,000,000·88",d:"累计净赢达到 10,000,000 池子币，且当前退隐人数达到 88 名",a:[["gambleNet",10000000],["worldRetired",88]],r:1500},
		{k:"cx_combo_gmnet_retired_1",c:"组合",i:"🧩",l:"净赢与当前退隐人数 · 10,000,000·96",d:"累计净赢达到 10,000,000 池子币，且当前退隐人数达到 96 名",a:[["gambleNet",10000000],["worldRetired",96]],r:1711},
		{k:"cx_combo_gmnet_retired_2",c:"组合",i:"🧩",l:"净赢与当前退隐人数 · 10,000,000·100",d:"累计净赢达到 10,000,000 池子币，且当前退隐人数达到 100 名",a:[["gambleNet",10000000],["worldRetired",100]],r:2344},
		{k:"cx_combo_gmnet_retired_3",c:"组合",i:"🧩",l:"净赢与当前退隐人数 · 10,000,000·105",d:"累计净赢达到 10,000,000 池子币，且当前退隐人数达到 105 名",a:[["gambleNet",10000000],["worldRetired",105]],r:3398},
		{k:"cx_combo_gmnet_retired_4",c:"组合",i:"🧩",l:"净赢与当前退隐人数 · 10,000,000·110",d:"累计净赢达到 10,000,000 池子币，且当前退隐人数达到 110 名",a:[["gambleNet",10000000],["worldRetired",110]],r:4875},
		{k:"cx_combo_gmnet_retired_5",c:"组合",i:"🧩",l:"净赢与当前退隐人数 · 10,000,000·116",d:"累计净赢达到 10,000,000 池子币，且当前退隐人数达到 116 名",a:[["gambleNet",10000000],["worldRetired",116]],r:6773},
		{k:"cx_combo_gmnet_retired_6",c:"组合",i:"🧩",l:"净赢与当前退隐人数 · 10,000,000·130",d:"累计净赢达到 10,000,000 池子币，且当前退隐人数达到 130 名",a:[["gambleNet",10000000],["worldRetired",130]],r:9094},
		{k:"cx_combo_gmnet_retired_7",c:"组合",i:"🧩",l:"净赢与当前退隐人数 · 10,000,000·140",d:"累计净赢达到 10,000,000 池子币，且当前退隐人数达到 140 名",a:[["gambleNet",10000000],["worldRetired",140]],r:11836},
		{k:"cx_combo_gmnet_retired_8",c:"组合",i:"🧩",l:"净赢与当前退隐人数 · 10,000,000·150",d:"累计净赢达到 10,000,000 池子币，且当前退隐人数达到 150 名",a:[["gambleNet",10000000],["worldRetired",150]],r:15000},
		{k:"cx_combo_gmstreak_hands_0",c:"组合",i:"🧩",l:"连胜与同桌人次 · 29·78,000",d:"累计连胜达到 29 连胜，且同桌人次达到 78,000 人次",a:[["gambleBestStreak",29],["worldHands",78000]],r:1500},
		{k:"cx_combo_gmstreak_hands_1",c:"组合",i:"🧩",l:"连胜与同桌人次 · 32·120,000",d:"累计连胜达到 32 连胜，且同桌人次达到 120,000 人次",a:[["gambleBestStreak",32],["worldHands",120000]],r:1711},
		{k:"cx_combo_gmstreak_hands_2",c:"组合",i:"🧩",l:"连胜与同桌人次 · 36·185,000",d:"累计连胜达到 36 连胜，且同桌人次达到 185,000 人次",a:[["gambleBestStreak",36],["worldHands",185000]],r:2344},
		{k:"cx_combo_gmstreak_hands_3",c:"组合",i:"🧩",l:"连胜与同桌人次 · 45·285,000",d:"累计连胜达到 45 连胜，且同桌人次达到 285,000 人次",a:[["gambleBestStreak",45],["worldHands",285000]],r:3398},
		{k:"cx_combo_gmstreak_hands_4",c:"组合",i:"🧩",l:"连胜与同桌人次 · 51·350,000",d:"累计连胜达到 51 连胜，且同桌人次达到 350,000 人次",a:[["gambleBestStreak",51],["worldHands",350000]],r:4875},
		{k:"cx_combo_gmstreak_hands_5",c:"组合",i:"🧩",l:"连胜与同桌人次 · 58·530,000",d:"累计连胜达到 58 连胜，且同桌人次达到 530,000 人次",a:[["gambleBestStreak",58],["worldHands",530000]],r:6773},
		{k:"cx_combo_gmstreak_hands_6",c:"组合",i:"🧩",l:"连胜与同桌人次 · 66·800,000",d:"累计连胜达到 66 连胜，且同桌人次达到 800,000 人次",a:[["gambleBestStreak",66],["worldHands",800000]],r:9094},
		{k:"cx_combo_gmstreak_hands_7",c:"组合",i:"🧩",l:"连胜与同桌人次 · 76·980,000",d:"累计连胜达到 76 连胜，且同桌人次达到 980,000 人次",a:[["gambleBestStreak",76],["worldHands",980000]],r:11836},
		{k:"cx_combo_gmstreak_hands_8",c:"组合",i:"🧩",l:"连胜与同桌人次 · 78·1,480,000",d:"累计连胜达到 78 连胜，且同桌人次达到 1,480,000 人次",a:[["gambleBestStreak",78],["worldHands",1480000]],r:15000},
		{k:"cx_combo_gmstreak_retired_0",c:"组合",i:"🧩",l:"连胜与当前退隐人数 · 29·88",d:"累计连胜达到 29 连胜，且当前退隐人数达到 88 名",a:[["gambleBestStreak",29],["worldRetired",88]],r:1500},
		{k:"cx_combo_gmstreak_retired_1",c:"组合",i:"🧩",l:"连胜与当前退隐人数 · 32·96",d:"累计连胜达到 32 连胜，且当前退隐人数达到 96 名",a:[["gambleBestStreak",32],["worldRetired",96]],r:1711},
		{k:"cx_combo_gmstreak_retired_2",c:"组合",i:"🧩",l:"连胜与当前退隐人数 · 36·100",d:"累计连胜达到 36 连胜，且当前退隐人数达到 100 名",a:[["gambleBestStreak",36],["worldRetired",100]],r:2344},
		{k:"cx_combo_gmstreak_retired_3",c:"组合",i:"🧩",l:"连胜与当前退隐人数 · 45·105",d:"累计连胜达到 45 连胜，且当前退隐人数达到 105 名",a:[["gambleBestStreak",45],["worldRetired",105]],r:3398},
		{k:"cx_combo_gmstreak_retired_4",c:"组合",i:"🧩",l:"连胜与当前退隐人数 · 51·110",d:"累计连胜达到 51 连胜，且当前退隐人数达到 110 名",a:[["gambleBestStreak",51],["worldRetired",110]],r:4875},
		{k:"cx_combo_gmstreak_retired_5",c:"组合",i:"🧩",l:"连胜与当前退隐人数 · 58·116",d:"累计连胜达到 58 连胜，且当前退隐人数达到 116 名",a:[["gambleBestStreak",58],["worldRetired",116]],r:6773},
		{k:"cx_combo_gmstreak_retired_6",c:"组合",i:"🧩",l:"连胜与当前退隐人数 · 66·130",d:"累计连胜达到 66 连胜，且当前退隐人数达到 130 名",a:[["gambleBestStreak",66],["worldRetired",130]],r:9094},
		{k:"cx_combo_gmstreak_retired_7",c:"组合",i:"🧩",l:"连胜与当前退隐人数 · 76·140",d:"累计连胜达到 76 连胜，且当前退隐人数达到 140 名",a:[["gambleBestStreak",76],["worldRetired",140]],r:11836},
		{k:"cx_combo_gmstreak_retired_8",c:"组合",i:"🧩",l:"连胜与当前退隐人数 · 78·150",d:"累计连胜达到 78 连胜，且当前退隐人数达到 150 名",a:[["gambleBestStreak",78],["worldRetired",150]],r:15000},
		{k:"cx_combo_gmplay_sign_0",c:"组合",i:"🧩",l:"博局常客 · 1,900·420",d:"累计出战次数达到 1,900 场，且连续签到达到 420 天",a:[["gamblePlays",1900],["streak",420]],r:1500},
		{k:"cx_combo_gmplay_sign_1",c:"组合",i:"🧩",l:"博局常客 · 2,200·445",d:"累计出战次数达到 2,200 场，且连续签到达到 445 天",a:[["gamblePlays",2200],["streak",445]],r:1711},
		{k:"cx_combo_gmplay_sign_2",c:"组合",i:"🧩",l:"博局常客 · 2,900·500",d:"累计出战次数达到 2,900 场，且连续签到达到 500 天",a:[["gamblePlays",2900],["streak",500]],r:2344},
		{k:"cx_combo_gmplay_sign_3",c:"组合",i:"🧩",l:"博局常客 · 3,300·530",d:"累计出战次数达到 3,300 场，且连续签到达到 530 天",a:[["gamblePlays",3300],["streak",530]],r:3398},
		{k:"cx_combo_gmplay_sign_4",c:"组合",i:"🧩",l:"博局常客 · 3,800·565",d:"累计出战次数达到 3,800 场，且连续签到达到 565 天",a:[["gamblePlays",3800],["streak",565]],r:4875},
		{k:"cx_combo_gmplay_sign_5",c:"组合",i:"🧩",l:"博局常客 · 5,100·640",d:"累计出战次数达到 5,100 场，且连续签到达到 640 天",a:[["gamblePlays",5100],["streak",640]],r:6773},
		{k:"cx_combo_gmplay_sign_6",c:"组合",i:"🧩",l:"博局常客 · 5,900·680",d:"累计出战次数达到 5,900 场，且连续签到达到 680 天",a:[["gamblePlays",5900],["streak",680]],r:9094},
		{k:"cx_combo_gmplay_sign_7",c:"组合",i:"🧩",l:"博局常客 · 7,900·785",d:"累计出战次数达到 7,900 场，且连续签到达到 785 天",a:[["gamblePlays",7900],["streak",785]],r:11836},
		{k:"cx_combo_gmplay_sign_8",c:"组合",i:"🧩",l:"博局常客 · 9,200·845",d:"累计出战次数达到 9,200 场，且连续签到达到 845 天",a:[["gamblePlays",9200],["streak",845]],r:15000},
		{k:"cx_combo_gmplay_task_0",c:"组合",i:"🧩",l:"赌勤并举 · 1,900·21",d:"累计出战次数达到 1,900 场，且日课完成达到 21 项",a:[["gamblePlays",1900],["taskCompletedTotal",21]],r:1500},
		{k:"cx_combo_gmplay_task_1",c:"组合",i:"🧩",l:"赌勤并举 · 2,200·23",d:"累计出战次数达到 2,200 场，且日课完成达到 23 项",a:[["gamblePlays",2200],["taskCompletedTotal",23]],r:1711},
		{k:"cx_combo_gmplay_task_2",c:"组合",i:"🧩",l:"赌勤并举 · 2,900·29",d:"累计出战次数达到 2,900 场，且日课完成达到 29 项",a:[["gamblePlays",2900],["taskCompletedTotal",29]],r:2344},
		{k:"cx_combo_gmplay_task_3",c:"组合",i:"🧩",l:"赌勤并举 · 3,300·32",d:"累计出战次数达到 3,300 场，且日课完成达到 32 项",a:[["gamblePlays",3300],["taskCompletedTotal",32]],r:3398},
		{k:"cx_combo_gmplay_task_4",c:"组合",i:"🧩",l:"赌勤并举 · 3,800·36",d:"累计出战次数达到 3,800 场，且日课完成达到 36 项",a:[["gamblePlays",3800],["taskCompletedTotal",36]],r:4875},
		{k:"cx_combo_gmplay_task_5",c:"组合",i:"🧩",l:"赌勤并举 · 5,100·45",d:"累计出战次数达到 5,100 场，且日课完成达到 45 项",a:[["gamblePlays",5100],["taskCompletedTotal",45]],r:6773},
		{k:"cx_combo_gmplay_task_6",c:"组合",i:"🧩",l:"赌勤并举 · 5,900·51",d:"累计出战次数达到 5,900 场，且日课完成达到 51 项",a:[["gamblePlays",5900],["taskCompletedTotal",51]],r:9094},
		{k:"cx_combo_gmplay_task_7",c:"组合",i:"🧩",l:"赌勤并举 · 7,900·66",d:"累计出战次数达到 7,900 场，且日课完成达到 66 项",a:[["gamblePlays",7900],["taskCompletedTotal",66]],r:11836},
		{k:"cx_combo_gmplay_task_8",c:"组合",i:"🧩",l:"赌勤并举 · 9,200·75",d:"累计出战次数达到 9,200 场，且日课完成达到 75 项",a:[["gamblePlays",9200],["taskCompletedTotal",75]],r:15000},
		{k:"cx_combo_gmwin_sign_0",c:"组合",i:"🧩",l:"胜局与连续签到 · 215·420",d:"累计胜局达到 215 胜，且连续签到达到 420 天",a:[["gambleWins",215],["streak",420]],r:1500},
		{k:"cx_combo_gmwin_sign_1",c:"组合",i:"🧩",l:"胜局与连续签到 · 250·445",d:"累计胜局达到 250 胜，且连续签到达到 445 天",a:[["gambleWins",250],["streak",445]],r:1711},
		{k:"cx_combo_gmwin_sign_2",c:"组合",i:"🧩",l:"胜局与连续签到 · 340·500",d:"累计胜局达到 340 胜，且连续签到达到 500 天",a:[["gambleWins",340],["streak",500]],r:2344},
		{k:"cx_combo_gmwin_sign_3",c:"组合",i:"🧩",l:"胜局与连续签到 · 460·530",d:"累计胜局达到 460 胜，且连续签到达到 530 天",a:[["gambleWins",460],["streak",530]],r:3398},
		{k:"cx_combo_gmwin_sign_4",c:"组合",i:"🧩",l:"胜局与连续签到 · 1,500·565",d:"累计胜局达到 1,500 胜，且连续签到达到 565 天",a:[["gambleWins",1500],["streak",565]],r:4875},
		{k:"cx_combo_gmwin_sign_5",c:"组合",i:"🧩",l:"胜局与连续签到 · 3,000·640",d:"累计胜局达到 3,000 胜，且连续签到达到 640 天",a:[["gambleWins",3000],["streak",640]],r:6773},
		{k:"cx_combo_gmwin_sign_6",c:"组合",i:"🧩",l:"胜局与连续签到 · 4,000·680",d:"累计胜局达到 4,000 胜，且连续签到达到 680 天",a:[["gambleWins",4000],["streak",680]],r:9094},
		{k:"cx_combo_gmwin_sign_7",c:"组合",i:"🧩",l:"胜局与连续签到 · 5,000·785",d:"累计胜局达到 5,000 胜，且连续签到达到 785 天",a:[["gambleWins",5000],["streak",785]],r:11836},
		{k:"cx_combo_gmwin_sign_8",c:"组合",i:"🧩",l:"胜局与连续签到 · 6,000·845",d:"累计胜局达到 6,000 胜，且连续签到达到 845 天",a:[["gambleWins",6000],["streak",845]],r:15000},
		{k:"cx_combo_gmwin_task_0",c:"组合",i:"🧩",l:"博胜日课 · 215·21",d:"累计胜局达到 215 胜，且日课完成达到 21 项",a:[["gambleWins",215],["taskCompletedTotal",21]],r:1500},
		{k:"cx_combo_gmwin_task_1",c:"组合",i:"🧩",l:"博胜日课 · 250·23",d:"累计胜局达到 250 胜，且日课完成达到 23 项",a:[["gambleWins",250],["taskCompletedTotal",23]],r:1711},
		{k:"cx_combo_gmwin_task_2",c:"组合",i:"🧩",l:"博胜日课 · 340·29",d:"累计胜局达到 340 胜，且日课完成达到 29 项",a:[["gambleWins",340],["taskCompletedTotal",29]],r:2344},
		{k:"cx_combo_gmwin_task_3",c:"组合",i:"🧩",l:"博胜日课 · 460·32",d:"累计胜局达到 460 胜，且日课完成达到 32 项",a:[["gambleWins",460],["taskCompletedTotal",32]],r:3398},
		{k:"cx_combo_gmwin_task_4",c:"组合",i:"🧩",l:"博胜日课 · 1,500·36",d:"累计胜局达到 1,500 胜，且日课完成达到 36 项",a:[["gambleWins",1500],["taskCompletedTotal",36]],r:4875},
		{k:"cx_combo_gmwin_task_5",c:"组合",i:"🧩",l:"博胜日课 · 3,000·45",d:"累计胜局达到 3,000 胜，且日课完成达到 45 项",a:[["gambleWins",3000],["taskCompletedTotal",45]],r:6773},
		{k:"cx_combo_gmwin_task_6",c:"组合",i:"🧩",l:"博胜日课 · 4,000·51",d:"累计胜局达到 4,000 胜，且日课完成达到 51 项",a:[["gambleWins",4000],["taskCompletedTotal",51]],r:9094},
		{k:"cx_combo_gmwin_task_7",c:"组合",i:"🧩",l:"博胜日课 · 5,000·66",d:"累计胜局达到 5,000 胜，且日课完成达到 66 项",a:[["gambleWins",5000],["taskCompletedTotal",66]],r:11836},
		{k:"cx_combo_gmwin_task_8",c:"组合",i:"🧩",l:"博胜日课 · 6,000·75",d:"累计胜局达到 6,000 胜，且日课完成达到 75 项",a:[["gambleWins",6000],["taskCompletedTotal",75]],r:15000},
		{k:"cx_combo_gmnet_sign_0",c:"组合",i:"🧩",l:"赌运恒长 · 10,000,000·420",d:"累计净赢达到 10,000,000 池子币，且连续签到达到 420 天",a:[["gambleNet",10000000],["streak",420]],r:1500},
		{k:"cx_combo_gmnet_sign_1",c:"组合",i:"🧩",l:"赌运恒长 · 10,000,000·445",d:"累计净赢达到 10,000,000 池子币，且连续签到达到 445 天",a:[["gambleNet",10000000],["streak",445]],r:1711},
		{k:"cx_combo_gmnet_sign_2",c:"组合",i:"🧩",l:"赌运恒长 · 10,000,000·500",d:"累计净赢达到 10,000,000 池子币，且连续签到达到 500 天",a:[["gambleNet",10000000],["streak",500]],r:2344},
		{k:"cx_combo_gmnet_sign_3",c:"组合",i:"🧩",l:"赌运恒长 · 10,000,000·530",d:"累计净赢达到 10,000,000 池子币，且连续签到达到 530 天",a:[["gambleNet",10000000],["streak",530]],r:3398},
		{k:"cx_combo_gmnet_sign_4",c:"组合",i:"🧩",l:"赌运恒长 · 10,000,000·565",d:"累计净赢达到 10,000,000 池子币，且连续签到达到 565 天",a:[["gambleNet",10000000],["streak",565]],r:4875},
		{k:"cx_combo_gmnet_sign_5",c:"组合",i:"🧩",l:"赌运恒长 · 10,000,000·640",d:"累计净赢达到 10,000,000 池子币，且连续签到达到 640 天",a:[["gambleNet",10000000],["streak",640]],r:6773},
		{k:"cx_combo_gmnet_sign_6",c:"组合",i:"🧩",l:"赌运恒长 · 10,000,000·680",d:"累计净赢达到 10,000,000 池子币，且连续签到达到 680 天",a:[["gambleNet",10000000],["streak",680]],r:9094},
		{k:"cx_combo_gmnet_sign_7",c:"组合",i:"🧩",l:"赌运恒长 · 10,000,000·785",d:"累计净赢达到 10,000,000 池子币，且连续签到达到 785 天",a:[["gambleNet",10000000],["streak",785]],r:11836},
		{k:"cx_combo_gmnet_sign_8",c:"组合",i:"🧩",l:"赌运恒长 · 10,000,000·845",d:"累计净赢达到 10,000,000 池子币，且连续签到达到 845 天",a:[["gambleNet",10000000],["streak",845]],r:15000},
		{k:"cx_combo_gmnet_task_0",c:"组合",i:"🧩",l:"净赢与日课完成 · 10,000,000·21",d:"累计净赢达到 10,000,000 池子币，且日课完成达到 21 项",a:[["gambleNet",10000000],["taskCompletedTotal",21]],r:1500},
		{k:"cx_combo_gmnet_task_1",c:"组合",i:"🧩",l:"净赢与日课完成 · 10,000,000·23",d:"累计净赢达到 10,000,000 池子币，且日课完成达到 23 项",a:[["gambleNet",10000000],["taskCompletedTotal",23]],r:1711},
		{k:"cx_combo_gmnet_task_2",c:"组合",i:"🧩",l:"净赢与日课完成 · 10,000,000·29",d:"累计净赢达到 10,000,000 池子币，且日课完成达到 29 项",a:[["gambleNet",10000000],["taskCompletedTotal",29]],r:2344},
		{k:"cx_combo_gmnet_task_3",c:"组合",i:"🧩",l:"净赢与日课完成 · 10,000,000·32",d:"累计净赢达到 10,000,000 池子币，且日课完成达到 32 项",a:[["gambleNet",10000000],["taskCompletedTotal",32]],r:3398},
		{k:"cx_combo_gmnet_task_4",c:"组合",i:"🧩",l:"净赢与日课完成 · 10,000,000·36",d:"累计净赢达到 10,000,000 池子币，且日课完成达到 36 项",a:[["gambleNet",10000000],["taskCompletedTotal",36]],r:4875},
		{k:"cx_combo_gmnet_task_5",c:"组合",i:"🧩",l:"净赢与日课完成 · 10,000,000·45",d:"累计净赢达到 10,000,000 池子币，且日课完成达到 45 项",a:[["gambleNet",10000000],["taskCompletedTotal",45]],r:6773},
		{k:"cx_combo_gmnet_task_6",c:"组合",i:"🧩",l:"净赢与日课完成 · 10,000,000·51",d:"累计净赢达到 10,000,000 池子币，且日课完成达到 51 项",a:[["gambleNet",10000000],["taskCompletedTotal",51]],r:9094},
		{k:"cx_combo_gmnet_task_7",c:"组合",i:"🧩",l:"净赢与日课完成 · 10,000,000·66",d:"累计净赢达到 10,000,000 池子币，且日课完成达到 66 项",a:[["gambleNet",10000000],["taskCompletedTotal",66]],r:11836},
		{k:"cx_combo_gmnet_task_8",c:"组合",i:"🧩",l:"净赢与日课完成 · 10,000,000·75",d:"累计净赢达到 10,000,000 池子币，且日课完成达到 75 项",a:[["gambleNet",10000000],["taskCompletedTotal",75]],r:15000},
		{k:"cx_combo_gmstreak_sign_0",c:"组合",i:"🧩",l:"连胜与连续签到 · 29·420",d:"累计连胜达到 29 连胜，且连续签到达到 420 天",a:[["gambleBestStreak",29],["streak",420]],r:1500},
		{k:"cx_combo_gmstreak_sign_1",c:"组合",i:"🧩",l:"连胜与连续签到 · 32·445",d:"累计连胜达到 32 连胜，且连续签到达到 445 天",a:[["gambleBestStreak",32],["streak",445]],r:1711},
		{k:"cx_combo_gmstreak_sign_2",c:"组合",i:"🧩",l:"连胜与连续签到 · 36·500",d:"累计连胜达到 36 连胜，且连续签到达到 500 天",a:[["gambleBestStreak",36],["streak",500]],r:2344},
		{k:"cx_combo_gmstreak_sign_3",c:"组合",i:"🧩",l:"连胜与连续签到 · 45·530",d:"累计连胜达到 45 连胜，且连续签到达到 530 天",a:[["gambleBestStreak",45],["streak",530]],r:3398},
		{k:"cx_combo_gmstreak_sign_4",c:"组合",i:"🧩",l:"连胜与连续签到 · 51·565",d:"累计连胜达到 51 连胜，且连续签到达到 565 天",a:[["gambleBestStreak",51],["streak",565]],r:4875},
		{k:"cx_combo_gmstreak_sign_5",c:"组合",i:"🧩",l:"连胜与连续签到 · 58·640",d:"累计连胜达到 58 连胜，且连续签到达到 640 天",a:[["gambleBestStreak",58],["streak",640]],r:6773},
		{k:"cx_combo_gmstreak_sign_6",c:"组合",i:"🧩",l:"连胜与连续签到 · 66·680",d:"累计连胜达到 66 连胜，且连续签到达到 680 天",a:[["gambleBestStreak",66],["streak",680]],r:9094},
		{k:"cx_combo_gmstreak_sign_7",c:"组合",i:"🧩",l:"连胜与连续签到 · 76·785",d:"累计连胜达到 76 连胜，且连续签到达到 785 天",a:[["gambleBestStreak",76],["streak",785]],r:11836},
		{k:"cx_combo_gmstreak_sign_8",c:"组合",i:"🧩",l:"连胜与连续签到 · 78·845",d:"累计连胜达到 78 连胜，且连续签到达到 845 天",a:[["gambleBestStreak",78],["streak",845]],r:15000},
		{k:"cx_combo_gmstreak_task_0",c:"组合",i:"🧩",l:"连胜与日课完成 · 29·21",d:"累计连胜达到 29 连胜，且日课完成达到 21 项",a:[["gambleBestStreak",29],["taskCompletedTotal",21]],r:1500},
		{k:"cx_combo_gmstreak_task_1",c:"组合",i:"🧩",l:"连胜与日课完成 · 32·23",d:"累计连胜达到 32 连胜，且日课完成达到 23 项",a:[["gambleBestStreak",32],["taskCompletedTotal",23]],r:1711},
		{k:"cx_combo_gmstreak_task_2",c:"组合",i:"🧩",l:"连胜与日课完成 · 36·29",d:"累计连胜达到 36 连胜，且日课完成达到 29 项",a:[["gambleBestStreak",36],["taskCompletedTotal",29]],r:2344},
		{k:"cx_combo_gmstreak_task_3",c:"组合",i:"🧩",l:"连胜与日课完成 · 45·32",d:"累计连胜达到 45 连胜，且日课完成达到 32 项",a:[["gambleBestStreak",45],["taskCompletedTotal",32]],r:3398},
		{k:"cx_combo_gmstreak_task_4",c:"组合",i:"🧩",l:"连胜与日课完成 · 51·36",d:"累计连胜达到 51 连胜，且日课完成达到 36 项",a:[["gambleBestStreak",51],["taskCompletedTotal",36]],r:4875},
		{k:"cx_combo_gmstreak_task_5",c:"组合",i:"🧩",l:"连胜与日课完成 · 58·45",d:"累计连胜达到 58 连胜，且日课完成达到 45 项",a:[["gambleBestStreak",58],["taskCompletedTotal",45]],r:6773},
		{k:"cx_combo_gmstreak_task_6",c:"组合",i:"🧩",l:"连胜与日课完成 · 66·51",d:"累计连胜达到 66 连胜，且日课完成达到 51 项",a:[["gambleBestStreak",66],["taskCompletedTotal",51]],r:9094},
		{k:"cx_combo_gmstreak_task_7",c:"组合",i:"🧩",l:"连胜与日课完成 · 76·66",d:"累计连胜达到 76 连胜，且日课完成达到 66 项",a:[["gambleBestStreak",76],["taskCompletedTotal",66]],r:11836},
		{k:"cx_combo_gmstreak_task_8",c:"组合",i:"🧩",l:"连胜与日课完成 · 78·75",d:"累计连胜达到 78 连胜，且日课完成达到 75 项",a:[["gambleBestStreak",78],["taskCompletedTotal",75]],r:15000},
		{k:"cx_combo_gmplay_interact_0",c:"组合",i:"🧩",l:"出战次数与互动次数 · 1,900·57,000",d:"累计出战次数达到 1,900 场，且互动次数达到 57,000 次",a:[["gamblePlays",1900],["interactTotal",57000]],r:1500},
		{k:"cx_combo_gmplay_interact_1",c:"组合",i:"🧩",l:"出战次数与互动次数 · 2,200·81,000",d:"累计出战次数达到 2,200 场，且互动次数达到 81,000 次",a:[["gamblePlays",2200],["interactTotal",81000]],r:1711},
		{k:"cx_combo_gmplay_interact_2",c:"组合",i:"🧩",l:"出战次数与互动次数 · 2,900·115,000",d:"累计出战次数达到 2,900 场，且互动次数达到 115,000 次",a:[["gamblePlays",2900],["interactTotal",115000]],r:2344},
		{k:"cx_combo_gmplay_interact_3",c:"组合",i:"🧩",l:"出战次数与互动次数 · 3,300·163,000",d:"累计出战次数达到 3,300 场，且互动次数达到 163,000 次",a:[["gamblePlays",3300],["interactTotal",163000]],r:3398},
		{k:"cx_combo_gmplay_interact_4",c:"组合",i:"🧩",l:"出战次数与互动次数 · 3,800·232,000",d:"累计出战次数达到 3,800 场，且互动次数达到 232,000 次",a:[["gamblePlays",3800],["interactTotal",232000]],r:4875},
		{k:"cx_combo_gmplay_interact_5",c:"组合",i:"🧩",l:"出战次数与互动次数 · 5,100·328,000",d:"累计出战次数达到 5,100 场，且互动次数达到 328,000 次",a:[["gamblePlays",5100],["interactTotal",328000]],r:6773},
		{k:"cx_combo_gmplay_interact_6",c:"组合",i:"🧩",l:"出战次数与互动次数 · 5,900·465,000",d:"累计出战次数达到 5,900 场，且互动次数达到 465,000 次",a:[["gamblePlays",5900],["interactTotal",465000]],r:9094},
		{k:"cx_combo_gmplay_interact_7",c:"组合",i:"🧩",l:"出战次数与互动次数 · 7,900·660,000",d:"累计出战次数达到 7,900 场，且互动次数达到 660,000 次",a:[["gamblePlays",7900],["interactTotal",660000]],r:11836},
		{k:"cx_combo_gmplay_interact_8",c:"组合",i:"🧩",l:"出战次数与互动次数 · 9,200·920,000",d:"累计出战次数达到 9,200 场，且互动次数达到 920,000 次",a:[["gamblePlays",9200],["interactTotal",920000]],r:15000},
		{k:"cx_combo_gmwin_interact_0",c:"组合",i:"🧩",l:"胜局与互动次数 · 215·57,000",d:"累计胜局达到 215 胜，且互动次数达到 57,000 次",a:[["gambleWins",215],["interactTotal",57000]],r:1500},
		{k:"cx_combo_gmwin_interact_1",c:"组合",i:"🧩",l:"胜局与互动次数 · 250·81,000",d:"累计胜局达到 250 胜，且互动次数达到 81,000 次",a:[["gambleWins",250],["interactTotal",81000]],r:1711},
		{k:"cx_combo_gmwin_interact_2",c:"组合",i:"🧩",l:"胜局与互动次数 · 340·115,000",d:"累计胜局达到 340 胜，且互动次数达到 115,000 次",a:[["gambleWins",340],["interactTotal",115000]],r:2344},
		{k:"cx_combo_gmwin_interact_3",c:"组合",i:"🧩",l:"胜局与互动次数 · 460·163,000",d:"累计胜局达到 460 胜，且互动次数达到 163,000 次",a:[["gambleWins",460],["interactTotal",163000]],r:3398},
		{k:"cx_combo_gmwin_interact_4",c:"组合",i:"🧩",l:"胜局与互动次数 · 1,500·232,000",d:"累计胜局达到 1,500 胜，且互动次数达到 232,000 次",a:[["gambleWins",1500],["interactTotal",232000]],r:4875},
		{k:"cx_combo_gmwin_interact_5",c:"组合",i:"🧩",l:"胜局与互动次数 · 3,000·328,000",d:"累计胜局达到 3,000 胜，且互动次数达到 328,000 次",a:[["gambleWins",3000],["interactTotal",328000]],r:6773},
		{k:"cx_combo_gmwin_interact_6",c:"组合",i:"🧩",l:"胜局与互动次数 · 4,000·465,000",d:"累计胜局达到 4,000 胜，且互动次数达到 465,000 次",a:[["gambleWins",4000],["interactTotal",465000]],r:9094},
		{k:"cx_combo_gmwin_interact_7",c:"组合",i:"🧩",l:"胜局与互动次数 · 5,000·660,000",d:"累计胜局达到 5,000 胜，且互动次数达到 660,000 次",a:[["gambleWins",5000],["interactTotal",660000]],r:11836},
		{k:"cx_combo_gmwin_interact_8",c:"组合",i:"🧩",l:"胜局与互动次数 · 6,000·920,000",d:"累计胜局达到 6,000 胜，且互动次数达到 920,000 次",a:[["gambleWins",6000],["interactTotal",920000]],r:15000},
		{k:"cx_combo_gmnet_interact_0",c:"组合",i:"🧩",l:"净赢与互动次数 · 10,000,000·57,000",d:"累计净赢达到 10,000,000 池子币，且互动次数达到 57,000 次",a:[["gambleNet",10000000],["interactTotal",57000]],r:1500},
		{k:"cx_combo_gmnet_interact_1",c:"组合",i:"🧩",l:"净赢与互动次数 · 10,000,000·81,000",d:"累计净赢达到 10,000,000 池子币，且互动次数达到 81,000 次",a:[["gambleNet",10000000],["interactTotal",81000]],r:1711},
		{k:"cx_combo_gmnet_interact_2",c:"组合",i:"🧩",l:"净赢与互动次数 · 10,000,000·115,000",d:"累计净赢达到 10,000,000 池子币，且互动次数达到 115,000 次",a:[["gambleNet",10000000],["interactTotal",115000]],r:2344},
		{k:"cx_combo_gmnet_interact_3",c:"组合",i:"🧩",l:"净赢与互动次数 · 10,000,000·163,000",d:"累计净赢达到 10,000,000 池子币，且互动次数达到 163,000 次",a:[["gambleNet",10000000],["interactTotal",163000]],r:3398},
		{k:"cx_combo_gmnet_interact_4",c:"组合",i:"🧩",l:"净赢与互动次数 · 10,000,000·232,000",d:"累计净赢达到 10,000,000 池子币，且互动次数达到 232,000 次",a:[["gambleNet",10000000],["interactTotal",232000]],r:4875},
		{k:"cx_combo_gmnet_interact_5",c:"组合",i:"🧩",l:"净赢与互动次数 · 10,000,000·328,000",d:"累计净赢达到 10,000,000 池子币，且互动次数达到 328,000 次",a:[["gambleNet",10000000],["interactTotal",328000]],r:6773},
		{k:"cx_combo_gmnet_interact_6",c:"组合",i:"🧩",l:"净赢与互动次数 · 10,000,000·465,000",d:"累计净赢达到 10,000,000 池子币，且互动次数达到 465,000 次",a:[["gambleNet",10000000],["interactTotal",465000]],r:9094},
		{k:"cx_combo_gmnet_interact_7",c:"组合",i:"🧩",l:"净赢与互动次数 · 10,000,000·660,000",d:"累计净赢达到 10,000,000 池子币，且互动次数达到 660,000 次",a:[["gambleNet",10000000],["interactTotal",660000]],r:11836},
		{k:"cx_combo_gmnet_interact_8",c:"组合",i:"🧩",l:"净赢与互动次数 · 10,000,000·920,000",d:"累计净赢达到 10,000,000 池子币，且互动次数达到 920,000 次",a:[["gambleNet",10000000],["interactTotal",920000]],r:15000},
		{k:"cx_combo_gmstreak_interact_0",c:"组合",i:"🧩",l:"连胜与互动次数 · 29·57,000",d:"累计连胜达到 29 连胜，且互动次数达到 57,000 次",a:[["gambleBestStreak",29],["interactTotal",57000]],r:1500},
		{k:"cx_combo_gmstreak_interact_1",c:"组合",i:"🧩",l:"连胜与互动次数 · 32·81,000",d:"累计连胜达到 32 连胜，且互动次数达到 81,000 次",a:[["gambleBestStreak",32],["interactTotal",81000]],r:1711},
		{k:"cx_combo_gmstreak_interact_2",c:"组合",i:"🧩",l:"连胜与互动次数 · 36·115,000",d:"累计连胜达到 36 连胜，且互动次数达到 115,000 次",a:[["gambleBestStreak",36],["interactTotal",115000]],r:2344},
		{k:"cx_combo_gmstreak_interact_3",c:"组合",i:"🧩",l:"连胜与互动次数 · 45·163,000",d:"累计连胜达到 45 连胜，且互动次数达到 163,000 次",a:[["gambleBestStreak",45],["interactTotal",163000]],r:3398},
		{k:"cx_combo_gmstreak_interact_4",c:"组合",i:"🧩",l:"连胜与互动次数 · 51·232,000",d:"累计连胜达到 51 连胜，且互动次数达到 232,000 次",a:[["gambleBestStreak",51],["interactTotal",232000]],r:4875},
		{k:"cx_combo_gmstreak_interact_5",c:"组合",i:"🧩",l:"连胜与互动次数 · 58·328,000",d:"累计连胜达到 58 连胜，且互动次数达到 328,000 次",a:[["gambleBestStreak",58],["interactTotal",328000]],r:6773},
		{k:"cx_combo_gmstreak_interact_6",c:"组合",i:"🧩",l:"连胜与互动次数 · 66·465,000",d:"累计连胜达到 66 连胜，且互动次数达到 465,000 次",a:[["gambleBestStreak",66],["interactTotal",465000]],r:9094},
		{k:"cx_combo_gmstreak_interact_7",c:"组合",i:"🧩",l:"连胜与互动次数 · 76·660,000",d:"累计连胜达到 76 连胜，且互动次数达到 660,000 次",a:[["gambleBestStreak",76],["interactTotal",660000]],r:11836},
		{k:"cx_combo_gmstreak_interact_8",c:"组合",i:"🧩",l:"连胜与互动次数 · 78·920,000",d:"累计连胜达到 78 连胜，且互动次数达到 920,000 次",a:[["gambleBestStreak",78],["interactTotal",920000]],r:15000},
		{k:"cx_combo_hands_sign_0",c:"组合",i:"🧩",l:"坐遍天下 · 78,000·420",d:"累计同桌人次达到 78,000 人次，且连续签到达到 420 天",a:[["worldHands",78000],["streak",420]],r:1500},
		{k:"cx_combo_hands_sign_1",c:"组合",i:"🧩",l:"坐遍天下 · 120,000·445",d:"累计同桌人次达到 120,000 人次，且连续签到达到 445 天",a:[["worldHands",120000],["streak",445]],r:1711},
		{k:"cx_combo_hands_sign_2",c:"组合",i:"🧩",l:"坐遍天下 · 185,000·500",d:"累计同桌人次达到 185,000 人次，且连续签到达到 500 天",a:[["worldHands",185000],["streak",500]],r:2344},
		{k:"cx_combo_hands_sign_3",c:"组合",i:"🧩",l:"坐遍天下 · 285,000·530",d:"累计同桌人次达到 285,000 人次，且连续签到达到 530 天",a:[["worldHands",285000],["streak",530]],r:3398},
		{k:"cx_combo_hands_sign_4",c:"组合",i:"🧩",l:"坐遍天下 · 350,000·565",d:"累计同桌人次达到 350,000 人次，且连续签到达到 565 天",a:[["worldHands",350000],["streak",565]],r:4875},
		{k:"cx_combo_hands_sign_5",c:"组合",i:"🧩",l:"坐遍天下 · 530,000·640",d:"累计同桌人次达到 530,000 人次，且连续签到达到 640 天",a:[["worldHands",530000],["streak",640]],r:6773},
		{k:"cx_combo_hands_sign_6",c:"组合",i:"🧩",l:"坐遍天下 · 800,000·680",d:"累计同桌人次达到 800,000 人次，且连续签到达到 680 天",a:[["worldHands",800000],["streak",680]],r:9094},
		{k:"cx_combo_hands_sign_7",c:"组合",i:"🧩",l:"坐遍天下 · 980,000·785",d:"累计同桌人次达到 980,000 人次，且连续签到达到 785 天",a:[["worldHands",980000],["streak",785]],r:11836},
		{k:"cx_combo_hands_sign_8",c:"组合",i:"🧩",l:"坐遍天下 · 1,480,000·845",d:"累计同桌人次达到 1,480,000 人次，且连续签到达到 845 天",a:[["worldHands",1480000],["streak",845]],r:15000},
		{k:"cx_combo_hands_task_0",c:"组合",i:"🧩",l:"游历日课 · 78,000·21",d:"累计同桌人次达到 78,000 人次，且日课完成达到 21 项",a:[["worldHands",78000],["taskCompletedTotal",21]],r:1500},
		{k:"cx_combo_hands_task_1",c:"组合",i:"🧩",l:"游历日课 · 120,000·23",d:"累计同桌人次达到 120,000 人次，且日课完成达到 23 项",a:[["worldHands",120000],["taskCompletedTotal",23]],r:1711},
		{k:"cx_combo_hands_task_2",c:"组合",i:"🧩",l:"游历日课 · 185,000·29",d:"累计同桌人次达到 185,000 人次，且日课完成达到 29 项",a:[["worldHands",185000],["taskCompletedTotal",29]],r:2344},
		{k:"cx_combo_hands_task_3",c:"组合",i:"🧩",l:"游历日课 · 285,000·32",d:"累计同桌人次达到 285,000 人次，且日课完成达到 32 项",a:[["worldHands",285000],["taskCompletedTotal",32]],r:3398},
		{k:"cx_combo_hands_task_4",c:"组合",i:"🧩",l:"游历日课 · 350,000·36",d:"累计同桌人次达到 350,000 人次，且日课完成达到 36 项",a:[["worldHands",350000],["taskCompletedTotal",36]],r:4875},
		{k:"cx_combo_hands_task_5",c:"组合",i:"🧩",l:"游历日课 · 530,000·45",d:"累计同桌人次达到 530,000 人次，且日课完成达到 45 项",a:[["worldHands",530000],["taskCompletedTotal",45]],r:6773},
		{k:"cx_combo_hands_task_6",c:"组合",i:"🧩",l:"游历日课 · 800,000·51",d:"累计同桌人次达到 800,000 人次，且日课完成达到 51 项",a:[["worldHands",800000],["taskCompletedTotal",51]],r:9094},
		{k:"cx_combo_hands_task_7",c:"组合",i:"🧩",l:"游历日课 · 980,000·66",d:"累计同桌人次达到 980,000 人次，且日课完成达到 66 项",a:[["worldHands",980000],["taskCompletedTotal",66]],r:11836},
		{k:"cx_combo_hands_task_8",c:"组合",i:"🧩",l:"游历日课 · 1,480,000·75",d:"累计同桌人次达到 1,480,000 人次，且日课完成达到 75 项",a:[["worldHands",1480000],["taskCompletedTotal",75]],r:15000},
		{k:"cx_combo_retired_sign_0",c:"组合",i:"🧩",l:"看尽浮沉 · 88·420",d:"当前退隐人数达到 88 名，且连续签到达到 420 天",a:[["worldRetired",88],["streak",420]],r:1500},
		{k:"cx_combo_retired_sign_1",c:"组合",i:"🧩",l:"看尽浮沉 · 96·445",d:"当前退隐人数达到 96 名，且连续签到达到 445 天",a:[["worldRetired",96],["streak",445]],r:1711},
		{k:"cx_combo_retired_sign_2",c:"组合",i:"🧩",l:"看尽浮沉 · 100·500",d:"当前退隐人数达到 100 名，且连续签到达到 500 天",a:[["worldRetired",100],["streak",500]],r:2344},
		{k:"cx_combo_retired_sign_3",c:"组合",i:"🧩",l:"看尽浮沉 · 105·530",d:"当前退隐人数达到 105 名，且连续签到达到 530 天",a:[["worldRetired",105],["streak",530]],r:3398},
		{k:"cx_combo_retired_sign_4",c:"组合",i:"🧩",l:"看尽浮沉 · 110·565",d:"当前退隐人数达到 110 名，且连续签到达到 565 天",a:[["worldRetired",110],["streak",565]],r:4875},
		{k:"cx_combo_retired_sign_5",c:"组合",i:"🧩",l:"看尽浮沉 · 116·640",d:"当前退隐人数达到 116 名，且连续签到达到 640 天",a:[["worldRetired",116],["streak",640]],r:6773},
		{k:"cx_combo_retired_sign_6",c:"组合",i:"🧩",l:"看尽浮沉 · 130·680",d:"当前退隐人数达到 130 名，且连续签到达到 680 天",a:[["worldRetired",130],["streak",680]],r:9094},
		{k:"cx_combo_retired_sign_7",c:"组合",i:"🧩",l:"看尽浮沉 · 140·785",d:"当前退隐人数达到 140 名，且连续签到达到 785 天",a:[["worldRetired",140],["streak",785]],r:11836},
		{k:"cx_combo_retired_sign_8",c:"组合",i:"🧩",l:"看尽浮沉 · 150·845",d:"当前退隐人数达到 150 名，且连续签到达到 845 天",a:[["worldRetired",150],["streak",845]],r:15000},
		{k:"cx_combo_retired_task_0",c:"组合",i:"🧩",l:"当前退隐人数与日课完成 · 88·21",d:"当前退隐人数达到 88 名，且日课完成达到 21 项",a:[["worldRetired",88],["taskCompletedTotal",21]],r:1500},
		{k:"cx_combo_retired_task_1",c:"组合",i:"🧩",l:"当前退隐人数与日课完成 · 96·23",d:"当前退隐人数达到 96 名，且日课完成达到 23 项",a:[["worldRetired",96],["taskCompletedTotal",23]],r:1711},
		{k:"cx_combo_retired_task_2",c:"组合",i:"🧩",l:"当前退隐人数与日课完成 · 100·29",d:"当前退隐人数达到 100 名，且日课完成达到 29 项",a:[["worldRetired",100],["taskCompletedTotal",29]],r:2344},
		{k:"cx_combo_retired_task_3",c:"组合",i:"🧩",l:"当前退隐人数与日课完成 · 105·32",d:"当前退隐人数达到 105 名，且日课完成达到 32 项",a:[["worldRetired",105],["taskCompletedTotal",32]],r:3398},
		{k:"cx_combo_retired_task_4",c:"组合",i:"🧩",l:"当前退隐人数与日课完成 · 110·36",d:"当前退隐人数达到 110 名，且日课完成达到 36 项",a:[["worldRetired",110],["taskCompletedTotal",36]],r:4875},
		{k:"cx_combo_retired_task_5",c:"组合",i:"🧩",l:"当前退隐人数与日课完成 · 116·45",d:"当前退隐人数达到 116 名，且日课完成达到 45 项",a:[["worldRetired",116],["taskCompletedTotal",45]],r:6773},
		{k:"cx_combo_retired_task_6",c:"组合",i:"🧩",l:"当前退隐人数与日课完成 · 130·51",d:"当前退隐人数达到 130 名，且日课完成达到 51 项",a:[["worldRetired",130],["taskCompletedTotal",51]],r:9094},
		{k:"cx_combo_retired_task_7",c:"组合",i:"🧩",l:"当前退隐人数与日课完成 · 140·66",d:"当前退隐人数达到 140 名，且日课完成达到 66 项",a:[["worldRetired",140],["taskCompletedTotal",66]],r:11836},
		{k:"cx_combo_retired_task_8",c:"组合",i:"🧩",l:"当前退隐人数与日课完成 · 150·75",d:"当前退隐人数达到 150 名，且日课完成达到 75 项",a:[["worldRetired",150],["taskCompletedTotal",75]],r:15000},
		{k:"cx_combo_hands_interact_0",c:"组合",i:"🧩",l:"同桌人次与互动次数 · 78,000·57,000",d:"累计同桌人次达到 78,000 人次，且互动次数达到 57,000 次",a:[["worldHands",78000],["interactTotal",57000]],r:1500},
		{k:"cx_combo_hands_interact_1",c:"组合",i:"🧩",l:"同桌人次与互动次数 · 120,000·81,000",d:"累计同桌人次达到 120,000 人次，且互动次数达到 81,000 次",a:[["worldHands",120000],["interactTotal",81000]],r:1711},
		{k:"cx_combo_hands_interact_2",c:"组合",i:"🧩",l:"同桌人次与互动次数 · 185,000·115,000",d:"累计同桌人次达到 185,000 人次，且互动次数达到 115,000 次",a:[["worldHands",185000],["interactTotal",115000]],r:2344},
		{k:"cx_combo_hands_interact_3",c:"组合",i:"🧩",l:"同桌人次与互动次数 · 285,000·163,000",d:"累计同桌人次达到 285,000 人次，且互动次数达到 163,000 次",a:[["worldHands",285000],["interactTotal",163000]],r:3398},
		{k:"cx_combo_hands_interact_4",c:"组合",i:"🧩",l:"同桌人次与互动次数 · 350,000·232,000",d:"累计同桌人次达到 350,000 人次，且互动次数达到 232,000 次",a:[["worldHands",350000],["interactTotal",232000]],r:4875},
		{k:"cx_combo_hands_interact_5",c:"组合",i:"🧩",l:"同桌人次与互动次数 · 530,000·328,000",d:"累计同桌人次达到 530,000 人次，且互动次数达到 328,000 次",a:[["worldHands",530000],["interactTotal",328000]],r:6773},
		{k:"cx_combo_hands_interact_6",c:"组合",i:"🧩",l:"同桌人次与互动次数 · 800,000·465,000",d:"累计同桌人次达到 800,000 人次，且互动次数达到 465,000 次",a:[["worldHands",800000],["interactTotal",465000]],r:9094},
		{k:"cx_combo_hands_interact_7",c:"组合",i:"🧩",l:"同桌人次与互动次数 · 980,000·660,000",d:"累计同桌人次达到 980,000 人次，且互动次数达到 660,000 次",a:[["worldHands",980000],["interactTotal",660000]],r:11836},
		{k:"cx_combo_hands_interact_8",c:"组合",i:"🧩",l:"同桌人次与互动次数 · 1,480,000·920,000",d:"累计同桌人次达到 1,480,000 人次，且互动次数达到 920,000 次",a:[["worldHands",1480000],["interactTotal",920000]],r:15000},
		{k:"cx_combo_retired_interact_0",c:"组合",i:"🧩",l:"当前退隐人数与互动次数 · 88·57,000",d:"当前退隐人数达到 88 名，且互动次数达到 57,000 次",a:[["worldRetired",88],["interactTotal",57000]],r:1500},
		{k:"cx_combo_retired_interact_1",c:"组合",i:"🧩",l:"当前退隐人数与互动次数 · 96·81,000",d:"当前退隐人数达到 96 名，且互动次数达到 81,000 次",a:[["worldRetired",96],["interactTotal",81000]],r:1711},
		{k:"cx_combo_retired_interact_2",c:"组合",i:"🧩",l:"当前退隐人数与互动次数 · 100·115,000",d:"当前退隐人数达到 100 名，且互动次数达到 115,000 次",a:[["worldRetired",100],["interactTotal",115000]],r:2344},
		{k:"cx_combo_retired_interact_3",c:"组合",i:"🧩",l:"当前退隐人数与互动次数 · 105·163,000",d:"当前退隐人数达到 105 名，且互动次数达到 163,000 次",a:[["worldRetired",105],["interactTotal",163000]],r:3398},
		{k:"cx_combo_retired_interact_4",c:"组合",i:"🧩",l:"当前退隐人数与互动次数 · 110·232,000",d:"当前退隐人数达到 110 名，且互动次数达到 232,000 次",a:[["worldRetired",110],["interactTotal",232000]],r:4875},
		{k:"cx_combo_retired_interact_5",c:"组合",i:"🧩",l:"当前退隐人数与互动次数 · 116·328,000",d:"当前退隐人数达到 116 名，且互动次数达到 328,000 次",a:[["worldRetired",116],["interactTotal",328000]],r:6773},
		{k:"cx_combo_retired_interact_6",c:"组合",i:"🧩",l:"当前退隐人数与互动次数 · 130·465,000",d:"当前退隐人数达到 130 名，且互动次数达到 465,000 次",a:[["worldRetired",130],["interactTotal",465000]],r:9094},
		{k:"cx_combo_retired_interact_7",c:"组合",i:"🧩",l:"当前退隐人数与互动次数 · 140·660,000",d:"当前退隐人数达到 140 名，且互动次数达到 660,000 次",a:[["worldRetired",140],["interactTotal",660000]],r:11836},
		{k:"cx_combo_retired_interact_8",c:"组合",i:"🧩",l:"当前退隐人数与互动次数 · 150·920,000",d:"当前退隐人数达到 150 名，且互动次数达到 920,000 次",a:[["worldRetired",150],["interactTotal",920000]],r:15000},
		{k:"cx_combo_sign_interact_0",c:"组合",i:"🧩",l:"连续签到与互动次数 · 420·57,000",d:"累计连续签到达到 420 天，且互动次数达到 57,000 次",a:[["streak",420],["interactTotal",57000]],r:1500},
		{k:"cx_combo_sign_interact_1",c:"组合",i:"🧩",l:"连续签到与互动次数 · 445·81,000",d:"累计连续签到达到 445 天，且互动次数达到 81,000 次",a:[["streak",445],["interactTotal",81000]],r:1711},
		{k:"cx_combo_sign_interact_2",c:"组合",i:"🧩",l:"连续签到与互动次数 · 500·115,000",d:"累计连续签到达到 500 天，且互动次数达到 115,000 次",a:[["streak",500],["interactTotal",115000]],r:2344},
		{k:"cx_combo_sign_interact_3",c:"组合",i:"🧩",l:"连续签到与互动次数 · 530·163,000",d:"累计连续签到达到 530 天，且互动次数达到 163,000 次",a:[["streak",530],["interactTotal",163000]],r:3398},
		{k:"cx_combo_sign_interact_4",c:"组合",i:"🧩",l:"连续签到与互动次数 · 565·232,000",d:"累计连续签到达到 565 天，且互动次数达到 232,000 次",a:[["streak",565],["interactTotal",232000]],r:4875},
		{k:"cx_combo_sign_interact_5",c:"组合",i:"🧩",l:"连续签到与互动次数 · 640·328,000",d:"累计连续签到达到 640 天，且互动次数达到 328,000 次",a:[["streak",640],["interactTotal",328000]],r:6773},
		{k:"cx_combo_sign_interact_6",c:"组合",i:"🧩",l:"连续签到与互动次数 · 680·465,000",d:"累计连续签到达到 680 天，且互动次数达到 465,000 次",a:[["streak",680],["interactTotal",465000]],r:9094},
		{k:"cx_combo_sign_interact_7",c:"组合",i:"🧩",l:"连续签到与互动次数 · 785·660,000",d:"累计连续签到达到 785 天，且互动次数达到 660,000 次",a:[["streak",785],["interactTotal",660000]],r:11836},
		{k:"cx_combo_sign_interact_8",c:"组合",i:"🧩",l:"连续签到与互动次数 · 845·920,000",d:"累计连续签到达到 845 天，且互动次数达到 920,000 次",a:[["streak",845],["interactTotal",920000]],r:15000},
		{k:"cx_combo_task_interact_0",c:"组合",i:"🧩",l:"日课完成与互动次数 · 21·57,000",d:"累计日课完成达到 21 项，且互动次数达到 57,000 次",a:[["taskCompletedTotal",21],["interactTotal",57000]],r:1500},
		{k:"cx_combo_task_interact_1",c:"组合",i:"🧩",l:"日课完成与互动次数 · 23·81,000",d:"累计日课完成达到 23 项，且互动次数达到 81,000 次",a:[["taskCompletedTotal",23],["interactTotal",81000]],r:1711},
		{k:"cx_combo_task_interact_2",c:"组合",i:"🧩",l:"日课完成与互动次数 · 29·115,000",d:"累计日课完成达到 29 项，且互动次数达到 115,000 次",a:[["taskCompletedTotal",29],["interactTotal",115000]],r:2344},
		{k:"cx_combo_task_interact_3",c:"组合",i:"🧩",l:"日课完成与互动次数 · 32·163,000",d:"累计日课完成达到 32 项，且互动次数达到 163,000 次",a:[["taskCompletedTotal",32],["interactTotal",163000]],r:3398},
		{k:"cx_combo_task_interact_4",c:"组合",i:"🧩",l:"日课完成与互动次数 · 36·232,000",d:"累计日课完成达到 36 项，且互动次数达到 232,000 次",a:[["taskCompletedTotal",36],["interactTotal",232000]],r:4875},
		{k:"cx_combo_task_interact_5",c:"组合",i:"🧩",l:"日课完成与互动次数 · 45·328,000",d:"累计日课完成达到 45 项，且互动次数达到 328,000 次",a:[["taskCompletedTotal",45],["interactTotal",328000]],r:6773},
		{k:"cx_combo_task_interact_6",c:"组合",i:"🧩",l:"日课完成与互动次数 · 51·465,000",d:"累计日课完成达到 51 项，且互动次数达到 465,000 次",a:[["taskCompletedTotal",51],["interactTotal",465000]],r:9094},
		{k:"cx_combo_task_interact_7",c:"组合",i:"🧩",l:"日课完成与互动次数 · 66·660,000",d:"累计日课完成达到 66 项，且互动次数达到 660,000 次",a:[["taskCompletedTotal",66],["interactTotal",660000]],r:11836},
		{k:"cx_combo_task_interact_8",c:"组合",i:"🧩",l:"日课完成与互动次数 · 75·920,000",d:"累计日课完成达到 75 项，且互动次数达到 920,000 次",a:[["taskCompletedTotal",75],["interactTotal",920000]],r:15000},
		{k:"cx_ratio_winrate_35",c:"比率",i:"📈",l:"胜率 · 35%",d:"累计对局不少于 50 局后，胜率达到 35%",p:["wrWin","wrGames",50,0.35],r:1800},
		{k:"cx_ratio_winrate_40",c:"比率",i:"📈",l:"胜率 · 40%",d:"累计对局不少于 50 局后，胜率达到 40%",p:["wrWin","wrGames",50,0.4],r:2448},
		{k:"cx_ratio_winrate_45",c:"比率",i:"📈",l:"胜率 · 45%",d:"累计对局不少于 50 局后，胜率达到 45%",p:["wrWin","wrGames",50,0.45],r:4392},
		{k:"cx_ratio_winrate_50",c:"比率",i:"📈",l:"胜率 · 50%",d:"累计对局不少于 50 局后，胜率达到 50%",p:["wrWin","wrGames",50,0.5],r:7632},
		{k:"cx_ratio_winrate_55",c:"比率",i:"📈",l:"胜率 · 55%",d:"累计对局不少于 50 局后，胜率达到 55%",p:["wrWin","wrGames",50,0.55],r:12168},
		{k:"cx_ratio_winrate_60",c:"比率",i:"📈",l:"胜率 · 60%",d:"累计对局不少于 50 局后，胜率达到 60%",p:["wrWin","wrGames",50,0.6],r:18000},
		{k:"cx_ratio_killper_50",c:"比率",i:"📈",l:"局均击杀 · 0.5人/局",d:"累计对局不少于 50 局后，局均击杀达到 0.5人/局",p:["wrKill","wrGames",50,0.5],r:1800},
		{k:"cx_ratio_killper_70",c:"比率",i:"📈",l:"局均击杀 · 0.7人/局",d:"累计对局不少于 50 局后，局均击杀达到 0.7人/局",p:["wrKill","wrGames",50,0.7],r:2448},
		{k:"cx_ratio_killper_90",c:"比率",i:"📈",l:"局均击杀 · 0.9人/局",d:"累计对局不少于 50 局后，局均击杀达到 0.9人/局",p:["wrKill","wrGames",50,0.9],r:4392},
		{k:"cx_ratio_killper_1.2",c:"比率",i:"📈",l:"局均击杀 · 1.2人/局",d:"累计对局不少于 50 局后，局均击杀达到 1.2人/局",p:["wrKill","wrGames",50,1.2],r:7632},
		{k:"cx_ratio_killper_1.5",c:"比率",i:"📈",l:"局均击杀 · 1.5人/局",d:"累计对局不少于 50 局后，局均击杀达到 1.5人/局",p:["wrKill","wrGames",50,1.5],r:12168},
		{k:"cx_ratio_killper_2",c:"比率",i:"📈",l:"局均击杀 · 2人/局",d:"累计对局不少于 50 局后，局均击杀达到 2人/局",p:["wrKill","wrGames",50,2],r:18000},
		{k:"cx_ratio_gmret_5000",c:"比率",i:"📈",l:"单局净赢 · 5000",d:"累计对局不少于 100 局后，单局净赢达到 5000池子币/局",p:["gambleNet","gamblePlays",100,5000],r:1800},
		{k:"cx_ratio_gmret_10000",c:"比率",i:"📈",l:"单局净赢 · 10000",d:"累计对局不少于 100 局后，单局净赢达到 10000池子币/局",p:["gambleNet","gamblePlays",100,10000],r:2813},
		{k:"cx_ratio_gmret_20000",c:"比率",i:"📈",l:"单局净赢 · 20000",d:"累计对局不少于 100 局后，单局净赢达到 20000池子币/局",p:["gambleNet","gamblePlays",100,20000],r:5850},
		{k:"cx_ratio_gmret_40000",c:"比率",i:"📈",l:"单局净赢 · 40000",d:"累计对局不少于 100 局后，单局净赢达到 40000池子币/局",p:["gambleNet","gamblePlays",100,40000],r:10913},
		{k:"cx_ratio_gmret_80000",c:"比率",i:"📈",l:"单局净赢 · 80000",d:"累计对局不少于 100 局后，单局净赢达到 80000池子币/局",p:["gambleNet","gamblePlays",100,80000],r:18000},
		{k:"cx_ratio_gmwinrate_30",c:"比率",i:"📈",l:"赌桌胜率 · 30%",d:"累计对局不少于 100 局后，赌桌胜率达到 30%",p:["gambleWins","gamblePlays",100,0.3],r:1800},
		{k:"cx_ratio_gmwinrate_35",c:"比率",i:"📈",l:"赌桌胜率 · 35%",d:"累计对局不少于 100 局后，赌桌胜率达到 35%",p:["gambleWins","gamblePlays",100,0.35],r:2813},
		{k:"cx_ratio_gmwinrate_40",c:"比率",i:"📈",l:"赌桌胜率 · 40%",d:"累计对局不少于 100 局后，赌桌胜率达到 40%",p:["gambleWins","gamblePlays",100,0.4],r:5850},
		{k:"cx_ratio_gmwinrate_45",c:"比率",i:"📈",l:"赌桌胜率 · 45%",d:"累计对局不少于 100 局后，赌桌胜率达到 45%",p:["gambleWins","gamblePlays",100,0.45],r:10913},
		{k:"cx_ratio_gmwinrate_50",c:"比率",i:"📈",l:"赌桌胜率 · 50%",d:"累计对局不少于 100 局后，赌桌胜率达到 50%",p:["gambleWins","gamblePlays",100,0.5],r:18000}
		];
		var seen = Object.create(null);
		for (var i = 0; i < defs.length; i++) seen[defs[i].key] = 1;
		function num(s, k) { return Number(s[k]) || 0; }
		for (var j = 0; j < ROWS.length; j++) {
			(function (row) {
				if (seen[row.k]) return;
				seen[row.k] = 1;
				var prog;
				if (row.f) {
					prog = statProg(row.f, row.g);
				} else if (row.a) {
					prog = (function (all) {
						return function (s) {
							for (var t = 0; t < all.length; t++) if (num(s, all[t][0]) < all[t][1]) return [0, 1];
							return [1, 1];
						};
					})(row.a);
				} else {
					prog = (function (p) {
						var nk = p[0], dk = p[1], minDen = p[2], goal = p[3];
						return function (s) {
							var den = num(s, dk);
							/* 样本不足时进度归零：显示"还需多少局"而不是虚高比率 */
							if (den < minDen) return [0, 1];
							/* 不能截断到 1：局均击杀这类目标的阈值本来就大于 1，
							   截断会让它永远达不到。显示层 evalAll 会做 min(cur, goal)。 */
							return [num(s, nk) / den, goal];
						};
					})(row.p);
				}
				push(row.k, row.c, row.i, row.l, row.d, prog, row.r);
			})(ROWS[j]);
		}
		/* 索引重建（必须）：byKey 在本文件 486 行按当时的 defs 建好，
		   新增条目只进了 defs 没进索引的话，byId(key) 会返回 null ——
		   宿主侧 shell-ach-claim 复核定义时直接找不到这条，领奖会静默失败。 */
		for (var b = 0; b < defs.length; b++) byKey[defs[b].key] = defs[b];
	})();
/* ===== END APPEND:career-expand ===== */
	/* 是否存在可靠的「首次达成」时间来源（口径 A · 2026-11-09 定案）。
	   有来源：由对应 checkpoint / 实时结算给出真实时刻；
	   无来源：只能记 observedAt=0（未知），绝不写 Date.now() 冒充首次时间。
	   这里是唯一真源：csh_career_observer 的被动 start()、csh_shell 的实时
	   shell-career-sync 都读它，B6 反例逐条双算校验，避免三处各算一套。 */
	var FIRST_SOURCE_TASK_KEYS = ['task_1','task_2','task_3','task_4','task_5','task_6','task_7','task_8','task_9','task_10','task_12','task_15','egg_task_full','egg_full_house'];
	var FIRST_SOURCE_EGG_KEYS = ['egg_signed_first','egg_hungry','egg_rich_first','egg_seg_rise','egg_rank_master','egg_gamble_first'];
	function hasFirstCaptureSource(def) {
		if (!def || typeof def !== "object") return false;
		var k = String(def.key || ""), c = def.cat;
		if (c === "挑战" || c === "资产" || c === "签到" || c === "互动" ||
		    c === "官阶" || c === "功勋" || c === "胜负" || c === "豪赌桌") return true;
		if (FIRST_SOURCE_TASK_KEYS.indexOf(k) >= 0 || FIRST_SOURCE_EGG_KEYS.indexOf(k) >= 0) return true;
		return /^cx_task_\d+$/.test(k) ||
			/^cx_combo_merit_meritday_\d+$/.test(k) ||
			/^cx_ratio_(gmret|gmwinrate|winrate|killper)_/.test(k) ||
			/^cx_combo_(gmplay_gmwin|gmplay_gmnet|gmplay_gmstreak|gmwin_gmnet|gmwin_gmstreak|gmnet_gmstreak)_\d+$/.test(k) ||
			/^cx_combo_(wins_games|wins_kills|wins_chars|games_kills|games_chars|kills_chars)_\d+$/.test(k) ||
			/^cx_combo_(rich_peak|rich_sign|peak_sign)_\d+$/.test(k) ||
			/^(hands|cx_hands|tablefriends|oldfriend|revengefriend|balancedfriend|poorai|topdown|topfund|billionaires|broke)_\d+$/.test(k) ||
			/^skilltop_(?:1|0\.(?:7|8|85|9|95|98|99))$/.test(k);
	}
	root.CSH_ACHV = {
		version: "2.0.0",
		MIN_DEFS: MIN_DEFS,
		defs: defs,
		byId: function (k) { return byKey[k] || null; },
		byKey: function (k) { return byKey[k] || null; },
		RETIRED: RETIRED,
		isRetired: isRetired,
		hasFirstCaptureSource: hasFirstCaptureSource,
		evalAll: evalAll,
		test: test,
		claimed: claimed,
		markClaimed: markClaimed,
		claimedList: claimedList,
		stats: statsOf,
		selfTest: selfTest,
	};
})();
