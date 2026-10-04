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
        官阶 55 / 功勋 26 / 资产 40 / 签到 16 / CDK 30 / 胜负 70 /
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
		try {
			if (typeof localStorage === "undefined") return memClaim;
			var raw = localStorage.getItem(CLAIM_KEY);
			if (!raw) return memClaim;
			var v = JSON.parse(raw);
			return (v && typeof v === "object") ? v : memClaim;
		} catch (e) { return memClaim; }
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
		defs.push({ key: key, cat: cat, ico: ico, label: label, desc: desc, prog: prog, reward: reward });
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
		[10, "一段登顶", "官阶达到 10 阶，跻身一段「杂号」之巅"],
		[20, "二段登顶", "官阶达到 20 阶，二段「中垒」称雄"],
		[30, "三段登顶", "官阶达到 30 阶，三段「方镇」之才"],
		[40, "四段登顶", "官阶达到 40 阶，四段「上公」之姿"],
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
	   5. CDK（张数 14 + 金额 10 + 单笔大额 6 = 30）
	   ============================================================ */
	tier({ key: "cdkcnt", cat: "CDK", ico: "🎟" }, "CDK · {n} 张", "累计兑换 CDK {n} 张",
		[1, 2, 3, 5, 8, 12, 20, 35, 60, 100, 160, 250, 400, 600],
		function (v) { return statProg("cdkCount", v); },
		function (v) { return 80 + v * 12; });
	tier({ key: "cdkgain", cat: "CDK", ico: "🧾" }, "CDK · 入账 {n}", "CDK 累计兑换入账 {n} 池子币",
		[1000, 5000, 20000, 100000, 500000, 1000000, 5000000, 10000000, 30000000, 60000000],
		function (v) { return statProg("cdkGained", v); },
		function (v) { return Math.max(100, Math.round(v / 500)); });
	tier({ key: "cdkbig", cat: "CDK", ico: "💥" }, "CDK · 单笔 {n}", "单张 CDK 面额达到 {n}",
		[10000, 100000, 1000000, 10000000, 50000000, 100000000],
		function (v) { return statProg("cdkMax", v); },
		function (v) { return Math.max(150, Math.round(v / 400)); });

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
	tier({ key: "hands", cat: "AI世界", ico: "🀄" }, "同桌 · {n} 手", "与 AI 世界同桌对局达到 {n} 手",
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
		function (v) { return atMostAfter("worldFundMin", v, "worldHands", 1); },
		function (v) { return Math.max(120, Math.round(20000 / v)); });
	/* 「打穿首富」：世界最高资金被压到某个量级以下 —— 标志着你把金字塔尖拽下来了 */
	tier({ key: "topdown", cat: "AI世界", ico: "⛏" }, "打穿首富 · {n}", "世界最高资金被压到 {n} 以下（把首富拉下马）",
		[10000000, 5000000, 2000000, 1000000, 500000, 200000, 100000, 50000, 20000, 5000],
		function (v) { return atMostAfter("worldTopFund", v, "worldHands", 1); },
		function (v) { return Math.max(150, Math.round(5000000 / v)); });
	/* 「世界首富身家」：另一个方向 —— 看着塔尖一路长高（玩家输 = 世界回血），极端且真实 */
	tier({ key: "topfund", cat: "AI世界", ico: "🏰" }, "首富身家 · {n}", "世界首富身家达到 {n} CBY（你每一次失手，都在把他喂得更大）",
		[10000000, 20000000, 35000000, 50000000, 92600000, 150000000, 300000000, 500000000],
		function (v) { return statProg("worldFundMax", v); },
		function (v) { return Math.max(400, Math.round(v / 50000)); });
	tier({ key: "billionaires", cat: "AI世界", ico: "💎" }, "豪赌席 · {n} 人", "当前有 {n} 名 AI 身家达到 2,000 万以上（豪赌席规模）",
		/* 2026-10-01：豪赌席 8 人，补 8 档（顶格 6 到不了满席）。 */
		[1, 2, 3, 4, 6, 8],
		function (v) { return statProg("billionaires", v); },
		function (v) { return 300 + v * 150; });
	tier({ key: "broke", cat: "AI世界", ico: "🔻" }, "首富落难 · {n} 人", "有 {n} 位曾经的豪赌席 AI 被打到跌出豪赌席",
		/* 2026-10-01：世界扩到 97 人，可上探至 ~48（穷桌 30 + 富桌 18）。 */
		[1, 2, 3, 5, 8, 12, 18, 25, 34, 48],
		function (v) { return statProg("billionaireBroke", v); },
		function (v) { return 500 + v * 200; });
	tier({ key: "skilltop", cat: "AI世界", ico: "🧠" }, "牌技上限 · {n}", "与牌技达到 {n} 的 AI 同桌过",
		[0.70, 0.80, 0.85, 0.90, 0.95, 0.98, 0.99, 1.00],
		function (v) { return statProg("worldSkillTop", v); },
		function (v) { return Math.round(100 + v * 800); });
	/* ---------- 世界动态成就（2026-10-03 新增） ----------
	   数据来自 csh_world 的成就计数（world.feats）→ shell buildStats → 这里 statProg。
	   这批成就的共同点：**奖励"看见世界在动"**，而不是"刷数值" —— 纪录被破、有人破产、
	   有人复出、宿敌交手、你把人打落档、你被记恨，都是世界真实发生的事。
	   阈值与奖励参照同分类既有档位，避免出现"最难的那条给的钱最少"这种倒挂。 */
	tier({ key: "worldrec", cat: "AI世界", ico: "📈" }, "世界纪录 · 亲历 {n} 次", "亲眼见证世界纪录被打破 {n} 次",
		[1, 3, 8, 15, 25],
		function (v) { return statProg("recordsSeen", v); },
		function (v) { return Math.round(200 + v * 150); });
	tier({ key: "tierdown", cat: "AI世界", ico: "⚔" }, "打落一档 · {n} 人", "把 {n} 位 AI 从更高的档位打落到下一档",
		[1, 2, 5, 10, 20],
		function (v) { return statProg("tierDown", v); },
		function (v) { return Math.round(300 + v * 200); });
	tier({ key: "comebacksee", cat: "AI世界", ico: "🌱" }, "见证复出 · {n} 人", "看着 {n} 位输光退隐的牌手重新坐回牌桌",
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
	tier({ key: "gstreak2", cat: "豪赌桌", ico: "🎲" }, "豪赌连胜 · {n} 局", "在豪赌桌连赢 {n} 局",
		[2, 3, 5, 8],
		function (v) { return statProg("gambleBestStreak", v); },
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
	/* 豪赌失血：净额为负的方向（豪赌桌期望收益为负，这是必修的学费）—— 真实净额 <= -阈值 */
	(function () {
		var mags = [100000, 500000, 2000000, 10000000, 30000000, 80000000];
		for (var i = 0; i < mags.length; i++) {
			(function (m) {
				push("gmloss_" + m, "豪赌桌", "🩸", "豪赌失血 · " + fmt(m),
					"豪赌桌生涯净输累计达到 " + fmt(m) + " CBY（期望为负的牌局，输得起才赢得起）",
					function (s) { var n = Number(s.gambleNet) || 0; return [n <= -m ? 1 : 0, 1]; },
					200 + Math.round(m / 5000));
			})(mags[i]);
		}
	})();

	/* ============================================================
	   9. 每日任务（完成 12）
	   ============================================================ */
	tier({ key: "task", cat: "任务", ico: "📋" }, "任务 · {n} 项", "单日完成 {n} 项每日任务",
		[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15],
		function (v) { return statProg("taskDone", v); },
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
	push("egg_gamble_first", "彩蛋", "🎲", "初入豪赌", "第一次坐进豪赌桌（带入 200,000）",
		function (s) { return [(Number(s.gamblePlays) || 0) >= 1 ? 1 : 0, 1]; }, 300);
	push("egg_hungry", "彩蛋", "🥣", "一贫如洗", "先有过四位数的身家，再跌回 0（然后你还会回来的）",
		function (s) { return [((Number(s.pcPeak) || 0) >= 1000 && (Number(s.pc) || 0) <= 0) ? 1 : 0, 1]; }, 200);
	push("egg_rich_first", "彩蛋", "🤑", "百万身家", "池子币首次突破 100 万",
		function (s) { return [Number(s.pcPeak) || 0, 1000000]; }, 1000);
	push("egg_rank_master", "彩蛋", "🏅", "登峰造极", "官阶达到 50 阶（大将军）",
		function (s) { return [Number(s.rank) || 0, 50]; }, 5000);
	push("egg_world_tour", "彩蛋", "🗺", "巡场", "AI 世界所有角色都至少与你同桌过一次（世界手数 ≥ 角色数 × 10）",
		function (s) {
			var need = Math.max(1, (Number(s.worldChars) || 0)) * 10;
			return [Number(s.worldHands) || 0, need];
		}, 800);
	push("egg_billion_killer", "彩蛋", "⚰", "屠龙者", "把一位豪赌席 AI 打到跌出豪赌席（世界最高资金 < 3,000 万）",
		function (s) { return [(Number(s.billionaireBroke) || 0) >= 1 ? 1 : 0, 1]; }, 2000);
	push("egg_full_house", "彩蛋", "🎯", "满堂彩", "单日把三项每日任务全部完成（任务完成数 ≥ 3）",
		function (s) { return [Number(s.taskDone) || 0, 3]; }, 400);
	push("egg_cdk_first", "彩蛋", "🎫", "第一张券", "兑换第一张 CDK",
		function (s) { return [Number(s.cdkCount) || 0, 1]; }, 60);

	/* ============================================================
	   引擎 API
	   ============================================================ */
	var byKey = {};
	for (var d = 0; d < defs.length; d++) byKey[defs[d].key] = defs[d];

	function evalAll(stats) {
		stats = stats || {};
		var claimedMap = lsGet(), out = [];
		for (var i = 0; i < defs.length; i++) {
			var df = defs[i], cur = 0, goal = 1;
			try { var pr = df.prog(stats); cur = Number(pr[0]) || 0; goal = Number(pr[1]) || 1; }
			catch (e) {}
			var done = cur >= goal;
			out.push({
				key: df.key, cat: df.cat, ico: df.ico, label: df.label, desc: df.desc,
				reward: df.reward, cur: Math.min(cur, goal), goal: goal,
				done: done, claimed: !!claimedMap[df.key],
			});
		}
		return out;
	}
	function test(def, stats) {
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

	root.CSH_ACHV = {
		version: "2.0.0",
		MIN_DEFS: MIN_DEFS,
		defs: defs,
		byId: function (k) { return byKey[k] || null; },
		byKey: function (k) { return byKey[k] || null; },
		evalAll: evalAll,
		test: test,
		claimed: claimed,
		markClaimed: markClaimed,
		claimedList: claimedList,
		stats: statsOf,
		selfTest: selfTest,
	};
})();
