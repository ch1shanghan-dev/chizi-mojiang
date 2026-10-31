/* ============================================================
   池子魔将 · 池子成就（操作型成就引擎 · v1 · 2026-10-20）
   ------------------------------------------------------------
	   定位：生涯成就（core/csh_achv.js）回答「你积累了多少」，
         池子成就回答「你打出过什么」。两份数据源、两套判定、互不干涉。

   ★ 结构（为什么这么切）：
     · 规则表 RULES      —— 纯数据 + 纯函数 test(c, a)，不读 DOM、不读 game 全局；
     · 聚合器 newRun/feed —— 只做 O(1) 累加，任何规则都不在里面跑；
     · 判定器 judge       —— 按事件类型建索引，事件到来只跑相关规则；
     · install(host)      —— 唯一一处引擎耦合：注册全局技 + 包 game.over。
   这样 `tools/probe_pool_achv.mjs` 可以喂假事件流把判定跑穿，不需要真引擎。

   ★ 纪律（写死在这里，改动前先读）：
     1. **只统计 身份 / 斗地主 / 对决**；联机、旁观、调试局一律不计入。
     2. **局中绝不弹窗**：解锁只写存档 + 置「本局新解锁」列表，由宿主在结算后统一提示。
     3. **任何异常都不许影响牌局**：每个入口 try/catch，只打一条日志。
     4. **只观察事实**：_EVENTS 中含资源/技能完成的 mastery 事件；不修改技能或战斗决策。
     5. **零 import**：本文件被 extension.js 与成就页双载，靠 window 幂等。
   ============================================================ */
(function (root) {
	if (!root) return;
	if (root.CSH_POOL_ACHV) return;                 /* 幂等：重复引入直接返回 */

	var KEY = "csh_pool_achv";                      /* localStorage 存档键（须登记 csh_migrate） */
	var VER = 2;
	var MODES = { identity: 1, doudizhu: 1, versus: 1 };   /* 白名单：身份 / 斗地主 / 对决 */

	/* 事件白名单。改动这里等于改动"成就系统能看到什么"，必须同步门禁 E52。 */
	var _EVENTS = { turn: 1, useCard: 1, useSkill: 1, damage: 1, die: 1, judge: 1, hp: 1, over: 1, mastery: 1 };

	/* ============================================================
	   1. 原有通用规则表（80 条；下接 100 位武将的 1300 条专属规则）
	   ------------------------------------------------------------
	   cat  ：操作 / 连击 / 逆境 / 模式 / 武将
	   rare ：1 普通 · 2 稀有 · 3 史诗（只影响奖励与色条）
	   modes：空 = 三个模式都可；否则白名单
	   on   ：只在哪些事件上判定（建索引用）
	   test(c, a)：c = 本次事件，a = 本局聚合器（见 newRun）
	   ============================================================ */
	var RULES = [
		/* ---------- 操作 12 ---------- */
		{ id: "op_one_slash", name: "一刀两断", cat: "操作", rare: 2, modes: [], on: ["damage"],
			desc: "单次造成 4 点或以上伤害", hint: "高伤害武将 + 铁索连环一类叠加",
			test: function (c) { return c.num >= 4; } },
		{ id: "op_thunder", name: "雷霆一击", cat: "操作", rare: 3, modes: [], on: ["damage"],
			desc: "单次造成 6 点或以上伤害", hint: "需要多张加伤牌叠在同一击上",
			test: function (c) { return c.num >= 6; } },
		{ id: "op_empty_win", name: "从容不迫", cat: "操作", rare: 2, modes: [], on: ["over"],
			desc: "以空手牌的状态赢下这一局",
			test: function (c, a) { return c.win && a.handAtWin === 0; } },
		{ id: "op_five_cards", name: "一气呵成", cat: "操作", rare: 2, modes: [], on: ["over"],
			desc: "单回合使用 5 张或更多牌",
			test: function (c, a) { return a.cardsTurnMax >= 5; } },
		{ id: "op_untouched", name: "不动如山", cat: "操作", rare: 3, modes: [], on: ["over"],
			desc: "整局未受到任何伤害并获胜",
			test: function (c, a) { return c.win && a.hurt === 0; } },
		{ id: "op_judge3", name: "判若神明", cat: "操作", rare: 1, modes: [], on: ["over"],
			desc: "单局判定命中 3 次",
			test: function (c, a) { return a.judgeHit >= 3; } },
		{ id: "op_multi_target", name: "万箭齐发", cat: "操作", rare: 1, modes: [], on: ["useCard"],
			desc: "一张牌指定 3 个或更多目标",
			test: function (c) { return c.targets >= 3; } },
		{ id: "op_empty_dodge", name: "空手夺刃", cat: "操作", rare: 1, modes: [], on: ["useCard"],
			desc: "没有手牌时打出闪",
			test: function (c) { return (c.name === "shan" || c.name === "闪") && c.handAfter === 0; } },
		{ id: "op_dodge3", name: "铁壁", cat: "操作", rare: 1, modes: [], on: ["over"],
			desc: "单局连续闪避 3 次",
			test: function (c, a) { return a.dodgeStreakMax >= 3; } },
		{ id: "op_back_full", name: "逆流而上", cat: "操作", rare: 2, modes: [], on: ["over"],
			desc: "单局从 1 点体力回到满体力",
			test: function (c, a) { return a.recoveredFull; } },
		{ id: "op_kill2turn", name: "斩草除根", cat: "操作", rare: 3, modes: [], on: ["die"],
			desc: "同一回合内击破 2 名角色",
			test: function (c, a) { return a.killsTurn >= 2; } },
		{ id: "op_long_win", name: "长驱直入", cat: "操作", rare: 1, modes: [], on: ["over"],
			desc: "打满 20 回合以上并获胜",
			test: function (c, a) { return c.win && a.turn >= 20; } },

		/* ---------- 连击 8 ---------- */
		{ id: "cb_double", name: "双杀", cat: "连击", rare: 2, modes: [], on: ["die"],
			desc: "连续两个回合都有击破",
			test: function (c, a) { return Math.max(a.killTurnsInRowMax, a.killTurnsInRow + (a.killsTurn > 0 ? 1 : 0)) >= 2; } },
		{ id: "cb_triple", name: "三连斩", cat: "连击", rare: 3, modes: [], on: ["over"],
			desc: "单局击破 3 名角色",
			test: function (c, a) { return a.kills >= 3; } },
		{ id: "cb_skill_chain", name: "连环计", cat: "连击", rare: 1, modes: [], on: ["over"],
			desc: "连续 3 个回合都发动过技能",
			test: function (c, a) { return a.skillChainMax >= 3; } },
		{ id: "cb_dmg_chain", name: "势如破竹", cat: "连击", rare: 2, modes: [], on: ["over"],
			desc: "连续 4 个回合造成伤害",
			test: function (c, a) { return a.dmgTurnsInRowMax >= 4; } },
		{ id: "cb_skill3turn", name: "一气通贯", cat: "连击", rare: 3, modes: [], on: ["over"],
			desc: "单回合发动 3 个技能",
			test: function (c, a) { return a.skillTurnMax >= 3; } },
		{ id: "cb_hand_up", name: "步步紧逼", cat: "连击", rare: 1, modes: [], on: ["over"],
			desc: "连续 3 个回合结束时手牌增多",
			test: function (c, a) { return a.handUpMax >= 3; } },
		{ id: "cb_no_break", name: "无间", cat: "连击", rare: 3, modes: [], on: ["over"],
			desc: "连续 5 个回合造成伤害，中间不断",
			test: function (c, a) { return a.dmgTurnsInRowMax >= 5; } },
		{ id: "cb_last_skill", name: "收网", cat: "连击", rare: 1, modes: [], on: ["die"],
			desc: "用技能完成一次击破",
			test: function (c, a) { return !!(a.lastDmgBySkill && a.lastDmgBySkill[c.victimSeat]); } },

		/* ---------- 逆境 8 ---------- */
		{ id: "ad_last_hp", name: "绝地反击", cat: "逆境", rare: 2, modes: [], on: ["over"],
			desc: "只剩 1 点体力时赢下这一局",
			test: function (c, a) { return c.win && a.hpNow === 1; } },
		{ id: "ad_alone", name: "孤军奋战", cat: "逆境", rare: 3, modes: ["identity", "versus"], on: ["over"],
			desc: "队友全部阵亡后独自获胜",
			test: function (c, a) { return c.win && a.allyDead; } },
		{ id: "ad_one_card", name: "背水一战", cat: "逆境", rare: 1, modes: [], on: ["over"],
			desc: "获胜时手牌不超过 1 张",
			test: function (c, a) { return c.win && a.handAtWin >= 0 && a.handAtWin <= 1; } },
		{ id: "ad_near_death2", name: "死里逃生", cat: "逆境", rare: 3, modes: [], on: ["over"],
			desc: "单局两次从濒死状态恢复",
			test: function (c, a) { return a.rescued >= 2; } },
		{ id: "ad_low_long", name: "血战到底", cat: "逆境", rare: 3, modes: [], on: ["over"],
			desc: "体力不超过 1 且打满 15 回合后获胜",
			test: function (c, a) { return c.win && a.hpNow <= 1 && a.turn >= 15; } },
		{ id: "ad_no_card3", name: "空城计", cat: "逆境", rare: 2, modes: [], on: ["over"],
			desc: "连续 3 个回合结束时没有手牌",
			test: function (c, a) { return a.emptyHandTurnsMax >= 3; } },
		{ id: "ad_outnumbered", name: "以寡敌众", cat: "逆境", rare: 2, modes: [], on: ["over"],
			desc: "己方人数比对方少 2 人以上仍获胜",
			test: function (c, a) { return c.win && a.allyGap >= 2; } },
		{ id: "ad_comeback", name: "绝境翻盘", cat: "逆境", rare: 2, modes: [], on: ["over"],
			desc: "自己曾低于 2 点体力，对手曾满血，最终获胜",
			test: function (c, a) { return c.win && a.hpMin <= 1 && a.foeFullHpSeen; } },

		/* ---------- 模式 8 ---------- */
		{ id: "md_spring", name: "春天", cat: "模式", rare: 3, modes: ["doudizhu"], on: ["over"],
			desc: "作为地主获胜，且两个农民一张牌都没出",
			test: function (c, a) { return c.win && a.isLandlord === true && a.farmerPlays === 0; } },
		{ id: "md_reverse_spring", name: "反春天", cat: "模式", rare: 3, modes: ["doudizhu"], on: ["over"],
			desc: "作为农民获胜，且地主只出过一次牌",
			test: function (c, a) { return c.win && a.isLandlord === false && a.landlordPlays <= 1; } },
		{ id: "md_one_hand", name: "一手清", cat: "模式", rare: 1, modes: ["doudizhu"], on: ["useCard"],
			desc: "一次出完全部手牌",
			test: function (c) { return c.handAfter === 0 && c.before > 0; } },
		{ id: "md_loyal_blade", name: "忠臣之刃", cat: "模式", rare: 2, modes: ["identity"], on: ["die"],
			desc: "以忠臣身份亲手击破 2 名反贼",
			test: function (c, a) { return a.meIdentity === "zhong" && a.killByRole.fan >= 2; } },
		{ id: "md_lord_alone", name: "主公亲征", cat: "模式", rare: 3, modes: ["identity"], on: ["over"],
			desc: "以主公身份亲手击破全部反贼",
			test: function (c, a) { return c.win && a.meIdentity === "zhu" && a.fanTotal > 0 && a.killByRole.fan >= a.fanTotal; } },
		{ id: "md_spy_duel", name: "内奸独舞", cat: "模式", rare: 3, modes: ["identity"], on: ["over"],
			desc: "以內奸身份，在只剩自己与主公时获胜",
			test: function (c, a) { return c.win && a.meIdentity === "nei" && a.survivors === 1; } },
		{ id: "md_first_round", name: "首轮定胜", cat: "模式", rare: 2, modes: ["versus"], on: ["over"],
			desc: "对决模式第 1 轮结束战斗并获胜",
			test: function (c, a) { return c.win && a.round <= 1; } },
		{ id: "md_three_round", name: "三回合", cat: "模式", rare: 3, modes: ["versus"], on: ["over"],
			desc: "对决模式 3 轮内获胜",
			test: function (c, a) { return c.win && a.round <= 3; } },

		/* ---------- 武将 4 ---------- */
		{ id: "gen_main", name: "本命", cat: "武将", rare: 2, modes: [], on: ["over"],
			desc: "用同一名武将累计获胜 20 次", hint: "跨对局累计，不需要一局打完",
			test: function (c, a) { return c.win && a.charWins >= 20; } },
		{ id: "gen_hundred", name: "百将", cat: "武将", rare: 3, modes: [], on: ["over"],
			desc: "用 50 名不同武将各赢过至少 1 局", hint: "跨对局累计",
			test: function (c, a) { return c.win && a.distinctWins >= 50; } },
		{ id: "gen_all_skills", name: "熟极而流", cat: "武将", rare: 2, modes: [], on: ["over"],
			/* 原条件是「把武将技能全发动一遍」—— 锁定技/触发技需要从完整 useSkill 历史采集，
			   那条永远达不成。改成「同一个技能单局发动 3 次」，可达成且有意义。 */
			desc: "同一个技能单局发动 3 次",
			test: function (c, a) {
				var m = 0, k;
				for (k in (a.skillUseCount || {})) if (a.skillUseCount[k] > m) m = a.skillUseCount[k];
				return m >= 3;
			} },
		{ id: "gen_niliu", name: "逆流", cat: "武将", rare: 3, modes: [], on: ["over"],
			desc: "单局把「逆流」类技能触发 3 次以上",
			test: function (c, a) { return Object.keys(a.skillUseCount).reduce(function (n, k) { return /niliu/.test(k) ? n + a.skillUseCount[k] : n; }, 0) >= 3; } },

		/* ---------- 扩展 20 条（2026-10-20 · 作者「还可以更加丰富」） ----------
		   全部只读已有聚合量，不新增采集点 —— 加内容不加成本。 */
		{ id: "op_hit3", name: "重手", cat: "操作", rare: 1, modes: [], on: ["damage"],
			desc: "单次造成 3 点或以上伤害", test: function (c) { return c.num >= 3; } },
		{ id: "op_cards6", name: "牌海", cat: "操作", rare: 2, modes: [], on: ["over"],
			desc: "单回合使用 6 张或更多牌", test: function (c, a) { return a.cardsTurnMax >= 6; } },
		{ id: "op_cards_total", name: "用牌如流水", cat: "操作", rare: 1, modes: [], on: ["over"],
			desc: "单局累计使用 30 张牌", test: function (c, a) { return (a.cardsTotal || 0) >= 30; } },
		{ id: "op_judge_all", name: "全凭天意", cat: "操作", rare: 2, modes: [], on: ["over"],
			desc: "单局判定 5 次以上", test: function (c, a) { return a.judgeTotal >= 5; } },
		{ id: "op_empty_hand", name: "空空如也", cat: "操作", rare: 1, modes: [], on: ["over"],
			desc: "单局中途把手牌打到过 0 张", test: function (c, a) { return a.handMin === 0; } },
		{ id: "op_full_win", name: "全身而退", cat: "操作", rare: 2, modes: [], on: ["over"],
			desc: "以满体力获胜", test: function (c, a) { return c.win && a.hpNow >= a.hpMax && a.hpMax > 0; } },
		{ id: "op_fast", name: "速战速决", cat: "操作", rare: 2, modes: [], on: ["over"],
			desc: "5 个回合内获胜", test: function (c, a) { return c.win && a.turn <= 5; } },
		{ id: "op_marathon", name: "持久战", cat: "操作", rare: 2, modes: [], on: ["over"],
			desc: "单局打满 25 个回合", test: function (c, a) { return a.turn >= 25; } },
		{ id: "cb_skill2", name: "技近乎道", cat: "连击", rare: 1, modes: [], on: ["over"],
			desc: "单回合发动 2 个技能", test: function (c, a) { return a.skillTurnMax >= 2; } },
		{ id: "cb_kinds3", name: "多面手", cat: "连击", rare: 2, modes: [], on: ["over"],
			desc: "单局发动 3 个不同技能",
			test: function (c, a) { return Object.keys(a.skillUseCount || {}).length >= 3; } },
		{ id: "cb_dodge2", name: "轻身", cat: "连击", rare: 1, modes: [], on: ["over"],
			desc: "单局连续闪避 2 次", test: function (c, a) { return a.dodgeStreakMax >= 2; } },
		{ id: "cb_judge2", name: "连判", cat: "连击", rare: 1, modes: [], on: ["over"],
			desc: "单局判定命中 2 次", test: function (c, a) { return a.judgeHit >= 2; } },
		{ id: "cb_kill_turn3", name: "一回合三杀", cat: "连击", rare: 3, modes: [], on: ["die"],
			desc: "同一回合内击破 3 名角色",
			test: function (c, a) { return a.killsTurn >= 3; } },
		{ id: "ad_near_death", name: "九死一生", cat: "逆境", rare: 2, modes: [], on: ["over"],
			desc: "单局经历过一次濒死", test: function (c, a) { return a.nearDeath >= 1; } },
		{ id: "ad_one_vs_many", name: "一骑当千", cat: "逆境", rare: 3, modes: [], on: ["over"],
			desc: "体力降到过 2 以下，仍击破 3 人",
			test: function (c, a) { return a.hpMin <= 2 && a.kills >= 3; } },
		{ id: "ad_no_hurt_kill", name: "毫发无伤", cat: "逆境", rare: 3, modes: [], on: ["over"],
			desc: "未受到任何伤害并击破 2 人",
			test: function (c, a) { return a.hurt === 0 && a.kills >= 2; } },
		{ id: "ad_double_kill", name: "双杀时刻", cat: "逆境", rare: 1, modes: [], on: ["over"],
			desc: "单局击破 2 名角色", test: function (c, a) { return a.kills >= 2; } },
		{ id: "ad_low_double", name: "残血双杀", cat: "逆境", rare: 3, modes: [], on: ["over"],
			desc: "体力降到过 1 点，仍击破 2 人",
			test: function (c, a) { return a.hpMin <= 1 && a.kills >= 2; } },
		{ id: "md_empty_three", name: "空手三巡", cat: "逆境", rare: 2, modes: [], on: ["over"],
			desc: "连续 2 个回合结束时没有手牌",
			test: function (c, a) { return a.emptyHandTurnsMax >= 2; } },
		{ id: "md_butcher", name: "屠戮", cat: "操作", rare: 3, modes: [], on: ["over"],
			desc: "单局击破 4 名角色", test: function (c, a) { return a.kills >= 4; } },

		/* ---------- 扩展第二批 20 条（2026-10-20 · 作者：成就再尽可能多做点） ---------- */
		{ id: "op_hit5", name: "一击定音", cat: "操作", rare: 2, modes: [], on: ["damage"],
			desc: "单次造成 5 点或以上伤害", test: function (c) { return c.num >= 5; } },
		{ id: "op_cards4", name: "连珠", cat: "操作", rare: 1, modes: [], on: ["over"],
			desc: "单回合使用 4 张或更多牌", test: function (c, a) { return a.cardsTurnMax >= 4; } },
		{ id: "op_cards50", name: "千锤百炼", cat: "操作", rare: 2, modes: [], on: ["over"],
			desc: "单局累计使用 50 张牌", test: function (c, a) { return (a.cardsTotal || 0) >= 50; } },
		{ id: "op_judge8", name: "判官", cat: "操作", rare: 3, modes: [], on: ["over"],
			desc: "单局判定 8 次以上", test: function (c, a) { return a.judgeTotal >= 8; } },
		{ id: "op_veteran", name: "老练", cat: "操作", rare: 1, modes: [], on: ["over"],
			desc: "单局打到第 15 个回合", test: function (c, a) { return a.turn >= 15; } },
		{ id: "cb_kill1", name: "杀伐果断", cat: "连击", rare: 1, modes: [], on: ["die"],
			desc: "完成一次击破", test: function (c, a) { return a.kills >= 1; } },
		{ id: "cb_kill5", name: "五连斩", cat: "连击", rare: 3, modes: [], on: ["over"],
			desc: "单局击破 5 名角色", test: function (c, a) { return a.kills >= 5; } },
		{ id: "cb_dmg6", name: "四进四出", cat: "连击", rare: 3, modes: [], on: ["over"],
			desc: "连续 6 个回合造成伤害", test: function (c, a) { return a.dmgTurnsInRowMax >= 6; } },
		{ id: "cb_kinds4", name: "三技同辉", cat: "连击", rare: 3, modes: [], on: ["over"],
			desc: "单局发动 4 个不同技能",
			test: function (c, a) { return Object.keys(a.skillUseCount || {}).length >= 4; } },
		{ id: "ad_bloody", name: "血染战袍", cat: "逆境", rare: 2, modes: [], on: ["over"],
			desc: "整局累计受伤 10 点以上仍获胜",
			test: function (c, a) { return c.win && a.hurt >= 10; } },
		{ id: "ad_endure", name: "苟活", cat: "逆境", rare: 2, modes: [], on: ["over"],
			desc: "体力降到过 2 以下，仍打满 20 个回合",
			test: function (c, a) { return a.hpMin <= 2 && a.turn >= 20; } },
		{ id: "md_landlord_win", name: "地主威武", cat: "模式", rare: 1, modes: ["doudizhu"], on: ["over"],
			desc: "以地主身份获胜",
			test: function (c, a) { return c.win && a.isLandlord === true; } },
		{ id: "md_farmer_win", name: "农民起义", cat: "模式", rare: 1, modes: ["doudizhu"], on: ["over"],
			desc: "以农民身份获胜",
			test: function (c, a) { return c.win && a.isLandlord === false; } },
		{ id: "md_fan_slayer", name: "反贼克星", cat: "模式", rare: 1, modes: ["identity"], on: ["die"],
			desc: "击破一名反贼",
			test: function (c, a) { return (a.killByRole.fan || 0) >= 1; } },
		{ id: "md_spy_win", name: "内奸之谋", cat: "模式", rare: 2, modes: ["identity"], on: ["over"],
			desc: "以內奸身份获胜",
			test: function (c, a) { return c.win && a.meIdentity === "nei"; } },
		{ id: "md_versus_king", name: "对决之王", cat: "模式", rare: 2, modes: ["versus"], on: ["over"],
			desc: "对决模式获胜并击破 2 人",
			test: function (c, a) { return c.win && a.kills >= 2; } },
		{ id: "gen_hundred_win", name: "百战", cat: "武将", rare: 3, modes: [], on: ["over"],
			desc: "同一名武将累计获胜 50 次",
			test: function (c, a) { return c.win && a.charWins >= 50; } },
		{ id: "gen_twenty_chars", name: "二十将", cat: "武将", rare: 2, modes: [], on: ["over"],
			desc: "用 20 名不同武将各赢过至少 1 局",
			test: function (c, a) { return c.win && a.distinctWins >= 20; } },
		{ id: "op_skill_master", name: "炉火纯青", cat: "武将", rare: 3, modes: [], on: ["over"],
			desc: "同一个技能单局发动 4 次",
			test: function (c, a) {
				var m = 0, k;
				for (k in (a.skillUseCount || {})) if (a.skillUseCount[k] > m) m = a.skillUseCount[k];
				return m >= 4;
			} },
		{ id: "ad_clutch", name: "险胜", cat: "逆境", rare: 3, modes: [], on: ["over"],
			desc: "获胜时只剩 1 名对手存活",
			test: function (c, a) { return c.win && c.survivors === 2; } },
	];

    // 100 curated character paths; stable IDs preserve the original 80 rules.
    var CHARACTER_PROFILES = [
{"id":"csh_dz","name":"丁真","title":"理塘留名","paths":[{"metric":"s:csh_yiwu","title":"十五取舍","goals":[1,30,200],"scope":"total","description":"累计发动〖一五〗及其后续效果{n}次"},{"metric":"s:csh_douyan","title":"测码争锋","goals":[1,20,100],"scope":"total","description":"累计发动〖测码〗及其后续效果{n}次"},{"metric":"r:recover","title":"一息再起","goals":[5,50,300],"scope":"total","description":"累计回复{n}点体力"}],"signature":{"title":"烟起理塘","requires":[["s:csh_douyan",2],["r:recover",2]],"description":"发动〖测码〗及其后续效果2次，且回复2点体力"}},
{"id":"csh_wn","name":"兀突骨","title":"藤甲不灭","paths":[{"metric":"s:csh_ranshang","title":"燃尽重铸","goals":[5,100,500],"scope":"total","description":"累计发动〖燃殇〗及其后续效果{n}次"},{"metric":"s:csh_duolve","title":"悍勇追牌","goals":[5,100,600],"scope":"total","description":"累计发动〖悍勇〗及其后续效果{n}次"},{"metric":"p:armor","title":"燃甲成城","goals":[3,6,10],"scope":"peak","description":"护甲曾达到{n}点"}],"signature":{"title":"烈火余生","requires":[["p:armor",4],["p:hand",8]],"description":"护甲曾达到4点，且手牌数曾达到8张"}},
{"id":"csh_sunshangxiang","name":"孙尚香","title":"江东弓姬","paths":[{"metric":"s:csh_ssx_xiaoji","title":"枭姬折甲","goals":[5,100,600],"scope":"total","description":"累计发动〖枭姬〗及其后续效果{n}次"},{"metric":"s:csh_ssx_pianzhu","title":"阴阳偏助","goals":[5,60,300],"scope":"total","description":"累计发动〖偏助〗及其后续效果{n}次"},{"metric":"s:csh_ssx_jiaozong","title":"骄纵新生","goals":[1,10,50],"scope":"total","description":"累计发动〖骄纵〗及其后续效果{n}次"}],"signature":{"title":"觉醒双璧","requires":[["s:csh_ssx_jiaozong",1],["s:csh_ssx_pianzhu",2]],"description":"发动〖骄纵〗及其后续效果1次，且发动〖偏助〗及其后续效果2次"}},
{"id":"csh_huangyueying","name":"黄月英","title":"机关千重","paths":[{"metric":"s:csh_hyy_jizhi","title":"集智成卷","goals":[10,200,1000],"scope":"total","description":"累计发动〖集智〗及其后续效果{n}次"},{"metric":"s:csh_hyy_linglong","title":"玲珑妙用","goals":[3,40,200],"scope":"total","description":"累计发动〖玲珑〗及其后续效果{n}次"},{"metric":"s:csh_hyy_qicai","title":"奇才布阵","goals":[1,20,100],"scope":"total","description":"累计发动〖奇才〗及其后续效果{n}次"}],"signature":{"title":"智巧连环","requires":[["s:csh_hyy_jizhi",5],["s:csh_hyy_linglong",2],["s:csh_hyy_qicai",1]],"description":"发动〖集智〗及其后续效果5次，且发动〖玲珑〗及其后续效果2次，且发动〖奇才〗及其后续效果1次"}},
{"id":"csh_huaman","name":"花鬘","title":"南疆象阵","paths":[{"metric":"s:csh_xiangzhen","title":"象阵变式","goals":[3,60,300],"scope":"total","description":"累计发动〖象阵〗及其后续效果{n}次"},{"metric":"c:nanman","title":"南蛮长歌","goals":[5,100,500],"scope":"total","description":"累计使用或打出{n}张【南蛮入侵】"},{"metric":"d:fire","title":"烈火余响","goals":[5,100,600],"scope":"total","description":"累计造成{n}点火焰伤害"}],"signature":{"title":"象踏南疆","requires":[["s:csh_xiangzhen",2],["c:nanman",2]],"description":"发动〖象阵〗及其后续效果2次，且使用或打出2张【南蛮入侵】"}},
{"id":"csh_yuangubafei","name":"远古八废","title":"八神轮转","paths":[{"metric":"s:csh_bashen","title":"八神择道","goals":[5,80,400],"scope":"total","description":"累计发动〖八神〗及其后续效果{n}次"},{"metric":"q:judge","title":"雷机问卜","goals":[5,60,300],"scope":"total","description":"累计进行{n}次判定"},{"metric":"r:recover","title":"狂骨回生","goals":[5,80,400],"scope":"total","description":"累计回复{n}点体力"}],"signature":{"title":"八法随身","requires":[["s:csh_bashen",4],["r:recover",2]],"description":"发动〖八神〗及其后续效果4次，且回复2点体力"}},
{"id":"csh_xingganning","name":"星星甘宁","title":"锦帆破浪","paths":[{"metric":"s:csh_jinfan","title":"铃动锦帆","goals":[5,100,600],"scope":"total","description":"累计发动〖锦帆〗及其后续效果{n}次"},{"metric":"s:csh_sheque","title":"射却夺先","goals":[3,60,300],"scope":"total","description":"累计发动〖射却〗及其后续效果{n}次"},{"metric":"c:sha","title":"帆影连射","goals":[10,200,1000],"scope":"total","description":"累计使用或打出{n}张【杀】"}],"signature":{"title":"铃弦齐鸣","requires":[["s:csh_jinfan",2],["s:csh_sheque",2]],"description":"发动〖锦帆〗及其后续效果2次，且发动〖射却〗及其后续效果2次"}},
{"id":"csh_liximing","name":"李曦明","title":"仙途问道","paths":[{"metric":"s:csh_xiantu","title":"炁行周天","goals":[10,200,1000],"scope":"total","description":"累计发动〖仙途〗及其后续效果{n}次"},{"metric":"p:stage.xiantu","title":"境界攀升","goals":[1,2,3],"scope":"peak","description":"境界曾达到第{n}次突破（练气/筑基/紫府）"},{"metric":"g:cards","title":"吐纳百川","goals":[50,1000,10000],"scope":"total","description":"累计获得{n}张牌"}],"signature":{"title":"问道有成","requires":[["p:stage.xiantu",2],["g:cards",30]],"description":"境界曾达到第2次突破（练气/筑基/紫府），且获得30张牌"}},
{"id":"csh_mingrixiang","name":"明日香","title":"赤色同步","paths":[{"metric":"p:storage.csh_tb","title":"同步突破","goals":[80,90,100],"scope":"peak","description":"同步率曾达到{n}"},{"metric":"d:all","title":"二号机战绩","goals":[20,300,2000],"scope":"total","description":"累计造成{n}点伤害"},{"metric":"g:cards","title":"同步补给","goals":[30,600,5000],"scope":"total","description":"累计获得{n}张牌"}],"signature":{"title":"极限同步战","requires":[["p:storage.csh_tb",100],["d:all",8]],"description":"同步率曾达到100，且造成8点伤害"}},
{"id":"csh_jzh","name":"黄盖","title":"赤壁苦肉","paths":[{"metric":"s:csh_kurou","title":"苦肉筹策","goals":[5,100,500],"scope":"total","description":"累计发动〖苦肉〗及其后续效果{n}次"},{"metric":"s:csh_zhaxiang","title":"诈降不屈","goals":[10,200,1000],"scope":"total","description":"累计发动〖诈降〗及其后续效果{n}次"},{"metric":"p:armor","title":"血铸护甲","goals":[3,6,10],"scope":"peak","description":"护甲曾达到{n}点"}],"signature":{"title":"苦尽甲来","requires":[["s:csh_kurou",3],["p:armor",4]],"description":"发动〖苦肉〗及其后续效果3次，且护甲曾达到4点"}},
{"id":"csh_qw","name":"贾诩","title":"帷幕之谋","paths":[{"metric":"s:csh_wuzhen","title":"乱武天下","goals":[3,50,250],"scope":"total","description":"累计发动〖乱武〗及其后续效果{n}次"},{"metric":"s:csh_qiai","title":"七哀求生","goals":[1,20,100],"scope":"total","description":"累计发动〖七哀〗及其后续效果{n}次"},{"metric":"s:csh_sbweimu","title":"帷幕流转","goals":[5,100,500],"scope":"total","description":"累计发动〖帷幕〗及其后续效果{n}次"}],"signature":{"title":"帷中乱世","requires":[["s:csh_wuzhen",2],["s:csh_sbweimu",2]],"description":"发动〖乱武〗及其后续效果2次，且发动〖帷幕〗及其后续效果2次"}},
{"id":"csh_jjxs","name":"界界徐盛","title":"江表破军","paths":[{"metric":"s:csh_pojun12","title":"破军藏锋","goals":[5,100,600],"scope":"total","description":"累计发动〖破军〗及其后续效果{n}次"},{"metric":"s:csh_yingzipojun","title":"英姿荡敌","goals":[10,200,1000],"scope":"total","description":"累计发动〖英姿〗及其后续效果{n}次"},{"metric":"d:sha","title":"一击摧军","goals":[20,400,2000],"scope":"total","description":"累计以【杀】造成{n}点伤害"}],"signature":{"title":"江表虎臣","requires":[["s:csh_pojun12",3],["d:sha",8]],"description":"发动〖破军〗及其后续效果3次，且以【杀】造成8点伤害"}},
{"id":"csh_mmhz","name":"谋谋黄忠","title":"百弦穿云","paths":[{"metric":"s:csh_liegong","title":"弦响烈弓","goals":[5,100,500],"scope":"total","description":"累计发动〖烈弓〗及其后续效果{n}次"},{"metric":"p:storage.csh_liegong_xian","title":"蓄弦待发","goals":[30,60,100],"scope":"peak","description":"弦曾积累到{n}点"},{"metric":"d:sha","title":"箭落千钧","goals":[20,400,2000],"scope":"total","description":"累计以【杀】造成{n}点伤害"}],"signature":{"title":"满弦之战","requires":[["p:storage.csh_liegong_xian",100],["d:sha",6]],"description":"弦曾积累到100点，且以【杀】造成6点伤害"}},
{"id":"csh_wlk","name":"沃里克","title":"祖安猎影","paths":[{"metric":"s:csh_kuanggu","title":"狂骨续猎","goals":[10,200,1000],"scope":"total","description":"累计发动〖狂骨〗及其后续效果{n}次"},{"metric":"s:csh_langxi1x","title":"狼袭夜行","goals":[5,100,500],"scope":"total","description":"累计发动〖狼袭〗及其后续效果{n}次"},{"metric":"r:recover","title":"嗜血追生","goals":[10,200,1000],"scope":"total","description":"累计回复{n}点体力"}],"signature":{"title":"长夜不息","requires":[["s:csh_langxi1x",3],["r:recover",5]],"description":"发动〖狼袭〗及其后续效果3次，且回复5点体力"}},
{"id":"csh_sx","name":"张绣","title":"北地枪乱","paths":[{"metric":"s:csh_xiongluan","title":"雄乱连锋","goals":[5,100,500],"scope":"total","description":"累计发动〖雄乱〗及其后续效果{n}次"},{"metric":"s:csh_junchi","title":"义举驰援","goals":[5,100,500],"scope":"total","description":"累计发动〖义举〗及其后续效果{n}次"},{"metric":"s:csh_zhansong","title":"斩曹绝响","goals":[1,10,50],"scope":"total","description":"累计发动〖斩曹〗及其后续效果{n}次"}],"signature":{"title":"枪出绝境","requires":[["s:csh_zhansong",1],["c:sha",3]],"description":"发动〖斩曹〗及其后续效果1次，且使用或打出3张【杀】"}},
{"id":"csh_gdsn","name":"高达姬","title":"龙魂四象","paths":[{"metric":"s:csh_longhun","title":"四象龙魂","goals":[10,200,1000],"scope":"total","description":"累计发动〖龙魂〗及其后续效果{n}次"},{"metric":"s:csh_yajiao","title":"涯角拾遗","goals":[10,200,1000],"scope":"total","description":"累计发动〖涯角〗及其后续效果{n}次"},{"metric":"c:wuxie","title":"玄龙止策","goals":[5,80,400],"scope":"total","description":"累计使用或打出{n}张【无懈可击】"}],"signature":{"title":"四象守望","requires":[["c:tao",1],["c:shan",1],["c:sha",1],["c:wuxie",1]],"description":"使用或打出1张【桃】，且使用或打出1张【闪】，且使用或打出1张【杀】，且使用或打出1张【无懈可击】"}},
{"id":"csh_gjs","name":"鬼剑士","title":"鬼剑归鞘","paths":[{"metric":"s:csh_xiangbin","title":"香槟开刃","goals":[10,200,1000],"scope":"total","description":"累计发动〖香槟〗及其后续效果{n}次"},{"metric":"s:csh_daorui","title":"盗叡逆生","goals":[10,200,1000],"scope":"total","description":"累计发动〖盗叡〗及其后续效果{n}次"},{"metric":"p:maxhp","title":"剑魄生长","goals":[4,8,13],"scope":"peak","description":"体力上限曾达到{n}点"}],"signature":{"title":"杯酒剑心","requires":[["c:jiu",2],["c:sha",2],["p:maxhp",4]],"description":"使用或打出2张【酒】，且使用或打出2张【杀】，且体力上限曾达到4点"}},
{"id":"csh_gy","name":"廖英","title":"芳剑无前","paths":[{"metric":"s:csh_fangjian123","title":"芳剑回响","goals":[10,200,1000],"scope":"total","description":"累计发动〖芳剑〗及其后续效果{n}次"},{"metric":"c:sha","title":"剑出晨昏","goals":[20,400,2000],"scope":"total","description":"累计使用或打出{n}张【杀】"},{"metric":"d:sha","title":"芳华破阵","goals":[20,400,2000],"scope":"total","description":"累计以【杀】造成{n}点伤害"}],"signature":{"title":"晨剑破敌","requires":[["c:sha",4],["d:sha",6]],"description":"使用或打出4张【杀】，且以【杀】造成6点伤害"}},
{"id":"csh_bfsm","name":"周瑜","title":"江上焰歌","paths":[{"metric":"s:csh_dcjianying","title":"同点连营","goals":[10,200,1000],"scope":"total","description":"累计发动〖连营〗及其后续效果{n}次"},{"metric":"s:csh_xielei","title":"挟焰旁击","goals":[5,100,500],"scope":"total","description":"累计发动〖挟焰〗及其后续效果{n}次"},{"metric":"d:fire","title":"赤焰江流","goals":[10,200,1000],"scope":"total","description":"累计造成{n}点火焰伤害"}],"signature":{"title":"弦焰相生","requires":[["s:csh_dcjianying",3],["s:csh_xielei",2]],"description":"发动〖连营〗及其后续效果3次，且发动〖挟焰〗及其后续效果2次"}},
{"id":"csh_ls","name":"鲁肃","title":"江东交盟","paths":[{"metric":"s:csh_jiaomeng","title":"交盟易手","goals":[10,200,1000],"scope":"total","description":"累计发动〖交盟〗及其后续效果{n}次"},{"metric":"s:csh_jiejian","title":"借火筹箭","goals":[10,200,1000],"scope":"total","description":"累计发动〖借箭〗及其后续效果{n}次"},{"metric":"s:csh_jiangxian","title":"江险退敌","goals":[5,100,500],"scope":"total","description":"累计发动〖江险〗及其后续效果{n}次"}],"signature":{"title":"合纵连横","requires":[["s:csh_jiaomeng",3],["s:csh_jiejian",2]],"description":"发动〖交盟〗及其后续效果3次，且发动〖借箭〗及其后续效果2次"}},
{"id":"csh_sj","name":"孙坚","title":"江东魂英","paths":[{"metric":"s:csh_jsrgpingtao","title":"平讨拓境","goals":[5,100,500],"scope":"total","description":"累计发动〖平讨〗及其后续效果{n}次"},{"metric":"s:csh_hunying","title":"魂英再起","goals":[1,10,50],"scope":"total","description":"累计发动〖魂英〗及其后续效果{n}次"},{"metric":"d:sha","title":"猛虎挥刃","goals":[20,400,2000],"scope":"total","description":"累计以【杀】造成{n}点伤害"}],"signature":{"title":"虎魂出关","requires":[["s:csh_hunying",1],["d:sha",4]],"description":"发动〖魂英〗及其后续效果1次，且以【杀】造成4点伤害"}},
{"id":"csh_sq","name":"孙权","title":"江东王剑","paths":[{"metric":"s:csh_zhiheng","title":"制衡万机","goals":[10,200,1000],"scope":"total","description":"累计发动〖制衡〗及其后续效果{n}次"},{"metric":"s:csh_hsshezuo","title":"设座论势","goals":[5,100,500],"scope":"total","description":"累计发动〖设座〗及其后续效果{n}次"},{"metric":"s:csh_jianwu","title":"王剑初成","goals":[1,10,50],"scope":"total","description":"累计发动〖王剑〗及其后续效果{n}次"}],"signature":{"title":"王剑制衡","requires":[["s:csh_jianwu",1],["s:csh_zhiheng",3]],"description":"发动〖王剑〗及其后续效果1次，且发动〖制衡〗及其后续效果3次"}},
{"id":"csh_vxs","name":"孙鲁班","title":"宫阙谮谋","paths":[{"metric":"s:csh_liangge","title":"骄矜拾判","goals":[10,200,1000],"scope":"total","description":"累计发动〖骄矜〗及其后续效果{n}次"},{"metric":"s:csh_guimou","title":"谮毁夺心","goals":[5,100,500],"scope":"total","description":"累计发动〖谮毁〗及其后续效果{n}次"},{"metric":"g:cards","title":"宫中藏锋","goals":[50,1000,10000],"scope":"total","description":"累计获得{n}张牌"}],"signature":{"title":"谮言成局","requires":[["s:csh_guimou",3],["s:csh_liangge",2]],"description":"发动〖谮毁〗及其后续效果3次，且发动〖骄矜〗及其后续效果2次"}},
{"id":"csh_karl","name":"卡尔","title":"秘仪万象","paths":[{"metric":"s:csh_karl_miyihuan","title":"秘仪流转","goals":[10,200,1000],"scope":"total","description":"累计发动〖秘仪〗及其后续效果{n}次"},{"metric":"c:type.trick","title":"术式编织","goals":[20,400,2000],"scope":"total","description":"累计使用或打出{n}张锦囊牌"},{"metric":"e:equip","title":"秘环铸器","goals":[10,200,1000],"scope":"total","description":"累计完成{n}次装备"}],"signature":{"title":"三相秘环","requires":[["c:type.basic",2],["c:type.trick",2],["c:type.equip",2]],"description":"使用或打出2张基本牌，且使用或打出2张锦囊牌，且使用2张装备牌"}},
{"id":"csh_msmy","name":"司马懿","title":"忍极天破","paths":[{"metric":"s:csh_renshen","title":"忍神蓄势","goals":[10,200,1000],"scope":"total","description":"累计发动〖忍神〗及其后续效果{n}次"},{"metric":"s:csh_jikui","title":"反馈藏锋","goals":[5,100,500],"scope":"total","description":"累计发动〖反馈〗及其后续效果{n}次"},{"metric":"s:csh_pt","title":"廿破天门","goals":[1,10,50],"scope":"total","description":"累计发动〖廿破〗及其后续效果{n}次"}],"signature":{"title":"忍尽天开","requires":[["s:csh_pt",1],["s:csh_jikui",2]],"description":"发动〖廿破〗及其后续效果1次，且发动〖反馈〗及其后续效果2次"}},
{"id":"csh_mlb","name":"吕布","title":"天下无双","paths":[{"metric":"s:csh_sbwushuang","title":"无双锋芒","goals":[10,200,1000],"scope":"total","description":"累计发动〖无双〗及其后续效果{n}次"},{"metric":"p:mark.csh_lvbu_baonu","title":"暴怒满溢","goals":[5,8,12],"scope":"peak","description":"暴怒标记曾达到{n}枚"},{"metric":"d:sha","title":"赤兔踏阵","goals":[20,400,2000],"scope":"total","description":"累计以【杀】造成{n}点伤害"}],"signature":{"title":"怒骑无双","requires":[["p:mark.csh_lvbu_baonu",5],["d:sha",8]],"description":"暴怒标记曾达到5枚，且以【杀】造成8点伤害"}},
{"id":"csh_yy","name":"卑弥呼","title":"卜国巫仪","paths":[{"metric":"s:csh_fengyan","title":"丰艳取判","goals":[5,100,500],"scope":"total","description":"累计发动〖丰艳〗及其后续效果{n}次"},{"metric":"s:csh_renfa23","title":"忍法回生","goals":[10,200,1000],"scope":"total","description":"累计发动〖忍法〗及其后续效果{n}次"},{"metric":"s:csh_yaoji","title":"妖姬留咒","goals":[5,100,500],"scope":"total","description":"累计发动〖妖姬〗及其后续效果{n}次"}],"signature":{"title":"巫仪回环","requires":[["s:csh_renfa23",3],["s:csh_yaoji",2]],"description":"发动〖忍法〗及其后续效果3次，且发动〖妖姬〗及其后续效果2次"}},
{"id":"csh_bzt","name":"胡车儿","title":"空空妙手","paths":[{"metric":"s:csh_shentou234","title":"妙手神偷","goals":[10,200,1000],"scope":"total","description":"累计发动〖神偷〗及其后续效果{n}次"},{"metric":"p:hand","title":"囊中乾坤","goals":[8,15,25],"scope":"peak","description":"手牌数曾达到{n}张"},{"metric":"g:cards","title":"不战而取","goals":[50,1000,10000],"scope":"total","description":"累计获得{n}张牌"}],"signature":{"title":"神偷满载","requires":[["p:hand",12],["s:csh_shentou234",5]],"description":"手牌数曾达到12张，且发动〖神偷〗及其后续效果5次"}},
{"id":"csh_lr","name":"蓝染","title":"镜花无月","paths":[{"metric":"s:csh_jinghua","title":"镜花布幻","goals":[10,200,1000],"scope":"total","description":"累计发动〖镜花〗及其后续效果{n}次"},{"metric":"q:judge","title":"神运问天","goals":[5,100,500],"scope":"total","description":"累计进行{n}次判定"},{"metric":"p:armor","title":"镜中铁壁","goals":[2,4,7],"scope":"peak","description":"护甲曾达到{n}点"}],"signature":{"title":"幻境从容","requires":[["s:csh_jinghua",4],["p:armor",2]],"description":"发动〖镜花〗及其后续效果4次，且护甲曾达到2点"}},
{"id":"csh_szc","name":"关羽","title":"军神临世","paths":[{"metric":"s:csh_wuwei","title":"武威震阵","goals":[10,200,1000],"scope":"total","description":"累计发动〖武威〗及其后续效果{n}次"},{"metric":"s:csh_huishi","title":"挥誓增命","goals":[5,100,500],"scope":"total","description":"累计发动〖挥誓〗及其后续效果{n}次"},{"metric":"s:csh_guanyu_wusheng","title":"军神觉醒","goals":[1,10,50],"scope":"total","description":"累计发动〖军神〗及其后续效果{n}次"}],"signature":{"title":"誓成军神","requires":[["s:csh_guanyu_wusheng",1],["d:all",6]],"description":"发动〖军神〗及其后续效果1次，且造成6点伤害"}},
{"id":"csh_mlm","name":"吕蒙","title":"白衣逆命","paths":[{"metric":"s:csh_keji","title":"克己藏锋","goals":[5,100,500],"scope":"total","description":"累计发动〖克己〗及其后续效果{n}次"},{"metric":"s:csh_keji1","title":"卷奋蓄粮","goals":[5,100,500],"scope":"total","description":"累计发动〖卷奋〗及其后续效果{n}次"},{"metric":"s:csh_niming","title":"逆命再生","goals":[1,10,50],"scope":"total","description":"累计发动〖逆命〗及其后续效果{n}次"}],"signature":{"title":"白衣再起","requires":[["s:csh_niming",1],["g:cards",20]],"description":"发动〖逆命〗及其后续效果1次，且获得20张牌"}},
{"id":"csh_wy","name":"王也","title":"风后问道","paths":[{"metric":"s:csh_leitong","title":"道法布灾","goals":[5,100,500],"scope":"total","description":"累计发动〖道法〗及其后续效果{n}次"},{"metric":"s:csh_yiyuan","title":"一亓护身","goals":[5,100,500],"scope":"total","description":"累计发动〖一亓〗及其后续效果{n}次"},{"metric":"s:csh_buhei","title":"卜黑取机","goals":[5,100,500],"scope":"total","description":"累计发动〖卜黑〗及其后续效果{n}次"}],"signature":{"title":"三法相济","requires":[["s:csh_leitong",2],["s:csh_yiyuan",1],["s:csh_buhei",2]],"description":"发动〖道法〗及其后续效果2次，且发动〖一亓〗及其后续效果1次，且发动〖卜黑〗及其后续效果2次"}},
{"id":"csh_ae","name":"张飞","title":"燕人飞怒","paths":[{"metric":"s:csh_ss","title":"战神养锋","goals":[10,200,1000],"scope":"total","description":"累计发动〖战神〗及其后续效果{n}次"},{"metric":"s:csh_yn","title":"飞怒觉醒","goals":[1,10,50],"scope":"total","description":"累计发动〖飞怒〗及其后续效果{n}次"},{"metric":"p:maxhp","title":"十三重战意","goals":[9,11,13],"scope":"peak","description":"体力上限曾达到{n}点"}],"signature":{"title":"飞怒破阵","requires":[["s:csh_yn",1],["d:sha",6]],"description":"发动〖飞怒〗及其后续效果1次，且以【杀】造成6点伤害"}},
{"id":"csh_mzj","name":"甄宓","title":"洛水惊鸿","paths":[{"metric":"s:csh_reluoshen","title":"洛神连判","goals":[10,200,1000],"scope":"total","description":"累计发动〖洛神〗及其后续效果{n}次"},{"metric":"s:csh_guidao129","title":"鬼道移星","goals":[5,100,500],"scope":"total","description":"累计发动〖鬼道〗及其后续效果{n}次"},{"metric":"s:csh_reqiuyuan","title":"求援转锋","goals":[5,100,500],"scope":"total","description":"累计发动〖求援〗及其后续效果{n}次"}],"signature":{"title":"洛水三章","requires":[["s:csh_reluoshen",3],["s:csh_guidao129",2],["s:csh_reqiuyuan",1]],"description":"发动〖洛神〗及其后续效果3次，且发动〖鬼道〗及其后续效果2次，且发动〖求援〗及其后续效果1次"}},
{"id":"csh_chengpu","name":"程普","title":"醇酒烈火","paths":[{"metric":"s:csh_rechunlao","title":"醇醪济危","goals":[5,100,500],"scope":"total","description":"累计发动〖醇醪〗及其后续效果{n}次"},{"metric":"s:csh_jishe","title":"极奢运筹","goals":[10,200,1000],"scope":"total","description":"累计发动〖极奢〗及其后续效果{n}次"},{"metric":"d:fire","title":"疠火燎阵","goals":[20,400,2000],"scope":"total","description":"累计造成{n}点火焰伤害"}],"signature":{"title":"烈火藏醇","requires":[["d:fire",6],["s:csh_rechunlao",1]],"description":"造成6点火焰伤害，且发动〖醇醪〗及其后续效果1次"}},
{"id":"csh_zhangbao","name":"张宝","title":"黄巾咒缚","paths":[{"metric":"s:csh_rezhoufu","title":"咒缚成阵","goals":[10,200,1000],"scope":"total","description":"累计发动〖咒缚〗及其后续效果{n}次"},{"metric":"g:cards","title":"符咒馈赠","goals":[50,1000,10000],"scope":"total","description":"累计获得{n}张牌"},{"metric":"d:sha","title":"无斧亦锋","goals":[10,200,1000],"scope":"total","description":"累计以【杀】造成{n}点伤害"}],"signature":{"title":"咒锋双行","requires":[["s:csh_rezhoufu",3],["d:sha",3]],"description":"发动〖咒缚〗及其后续效果3次，且以【杀】造成3点伤害"}},
{"id":"csh_caoang","name":"曹昂","title":"慷忾守义","paths":[{"metric":"s:csh_kaiqi","title":"慷忾援手","goals":[10,200,1000],"scope":"total","description":"累计发动〖慷忾〗及其后续效果{n}次"},{"metric":"s:csh_tuofan","title":"脱樊新生","goals":[1,10,50],"scope":"total","description":"累计发动〖脱樊〗及其后续效果{n}次"},{"metric":"g:cards","title":"军中济急","goals":[50,1000,10000],"scope":"total","description":"累计获得{n}张牌"}],"signature":{"title":"脱樊有义","requires":[["s:csh_tuofan",1],["s:csh_kaiqi",2]],"description":"发动〖脱樊〗及其后续效果1次，且发动〖慷忾〗及其后续效果2次"}},
{"id":"csh_guohuai","name":"郭淮","title":"精策成章","paths":[{"metric":"s:csh_twjingce","title":"精策得时","goals":[10,200,1000],"scope":"total","description":"累计发动〖精策〗及其后续效果{n}次"},{"metric":"s:csh_chengce","title":"成策觉醒","goals":[1,10,50],"scope":"total","description":"累计发动〖成策〗及其后续效果{n}次"},{"metric":"p:armor","title":"策定坚甲","goals":[3,6,10],"scope":"peak","description":"护甲曾达到{n}点"}],"signature":{"title":"策甲两全","requires":[["s:csh_chengce",1],["p:armor",4]],"description":"发动〖成策〗及其后续效果1次，且护甲曾达到4点"}},
{"id":"csh_xushu","name":"徐庶","title":"潜心破局","paths":[{"metric":"s:csh_rezhuhai","title":"诛害追锋","goals":[5,100,500],"scope":"total","description":"累计发动〖诛害〗及其后续效果{n}次"},{"metric":"s:csh_qianxin","title":"潜心转道","goals":[1,10,50],"scope":"total","description":"累计发动〖潜心〗及其后续效果{n}次"},{"metric":"s:csh_zhichi","title":"智迟存身","goals":[10,200,1000],"scope":"total","description":"累计发动〖智迟〗及其后续效果{n}次"}],"signature":{"title":"进退有度","requires":[["s:csh_qianxin",1],["s:csh_rezhuhai",2]],"description":"发动〖潜心〗及其后续效果1次，且发动〖诛害〗及其后续效果2次"}},
{"id":"csh_zhonghui","name":"钟会","title":"权起淮南","paths":[{"metric":"s:csh_quanji","title":"权计积势","goals":[10,200,1000],"scope":"total","description":"累计发动〖权计〗及其后续效果{n}次"},{"metric":"s:csh_zili","title":"自立开局","goals":[1,10,50],"scope":"total","description":"累计发动〖自立〗及其后续效果{n}次"},{"metric":"s:csh_zhonghui_tiaoxin","title":"挑衅取权","goals":[5,100,500],"scope":"total","description":"累计发动〖挑衅〗及其后续效果{n}次"}],"signature":{"title":"权足自立","requires":[["s:csh_zili",1],["s:csh_quanji",4]],"description":"发动〖自立〗及其后续效果1次，且发动〖权计〗及其后续效果4次"}},
{"id":"csh_xuchu","name":"许褚","title":"虎痴战来","paths":[{"metric":"s:csh_zhanlai","title":"战来邀斗","goals":[10,200,1000],"scope":"total","description":"累计发动〖战来〗及其后续效果{n}次"},{"metric":"s:csh_luoyi","title":"裸衣搏命","goals":[10,200,1000],"scope":"total","description":"累计发动〖裸衣〗及其后续效果{n}次"},{"metric":"c:juedou","title":"决斗不休","goals":[10,200,1000],"scope":"total","description":"累计使用或打出{n}张【决斗】"}],"signature":{"title":"虎痴连斗","requires":[["s:csh_zhanlai",2],["s:csh_luoyi",3]],"description":"发动〖战来〗及其后续效果2次，且发动〖裸衣〗及其后续效果3次"}},
{"id":"csh_weizheng","name":"魏征","title":"直谏千秋","paths":[{"metric":"s:csh_zhijian","title":"直谏争锋","goals":[5,100,500],"scope":"total","description":"累计发动〖直谏〗及其后续效果{n}次"},{"metric":"s:csh_shuaiyan","title":"率言得益","goals":[10,200,1000],"scope":"total","description":"累计发动〖率言〗及其后续效果{n}次"},{"metric":"q:compare","title":"殿前争胜","goals":[5,100,500],"scope":"total","description":"累计参与{n}次拼点"}],"signature":{"title":"谏臣不屈","requires":[["s:csh_zhijian",3],["q:compare",2]],"description":"发动〖直谏〗及其后续效果3次，且参与2次拼点"}},
{"id":"csh_zhuzhi","name":"加里奥","title":"巨像护国","paths":[{"metric":"s:csh_chengqiang1","title":"杜朗筑壁","goals":[5,100,500],"scope":"total","description":"累计发动〖杜朗〗及其后续效果{n}次"},{"metric":"s:csh_kuiwei","title":"英登护友","goals":[10,200,1000],"scope":"total","description":"累计发动〖英登〗及其后续效果{n}次"},{"metric":"s:csh_zhangang","title":"战罡移装","goals":[5,100,500],"scope":"total","description":"累计发动〖战罡〗及其后续效果{n}次"}],"signature":{"title":"巨像援军","requires":[["s:csh_chengqiang1",2],["s:csh_kuiwei",3]],"description":"发动〖杜朗〗及其后续效果2次，且发动〖英登〗及其后续效果3次"}},
{"id":"csh_ngwt","name":"张角","title":"苍天雷鸣","paths":[{"metric":"s:csh_tianjing","title":"霆刀出世","goals":[5,100,500],"scope":"total","description":"累计发动〖霆刀〗及其后续效果{n}次"},{"metric":"s:csh_zidian","title":"紫雷降世","goals":[5,100,500],"scope":"total","description":"累计发动〖紫雷〗及其后续效果{n}次"},{"metric":"d:thunder","title":"驭雳万钧","goals":[20,400,2000],"scope":"total","description":"累计造成{n}点雷电伤害"}],"signature":{"title":"天雷交织","requires":[["s:csh_zidian",2],["d:thunder",6]],"description":"发动〖紫雷〗及其后续效果2次，且造成6点雷电伤害"}},
{"id":"csh_misida","name":"米斯达","title":"六枪换弹","paths":[{"metric":"s:csh_daoyan1","title":"弹仓百变","goals":[10,200,1000],"scope":"total","description":"累计发动〖换弹〗及其后续效果{n}次"},{"metric":"c:type.trick","title":"异技战术","goals":[20,400,2000],"scope":"total","description":"累计使用或打出{n}张锦囊牌"},{"metric":"d:all","title":"枪响不息","goals":[20,400,2000],"scope":"total","description":"累计造成{n}点伤害"}],"signature":{"title":"四次换弹","requires":[["s:csh_daoyan1",4],["d:all",6]],"description":"发动〖换弹〗及其后续效果4次，且造成6点伤害"}},
{"id":"csh_zuozhu","name":"佐助","title":"写轮之影","paths":[{"metric":"s:csh_renjin","title":"忍禁轮转","goals":[10,200,1000],"scope":"total","description":"累计发动〖忍禁〗及其后续效果{n}次"},{"metric":"s:csh_xielun","title":"写轮封技","goals":[10,200,1000],"scope":"total","description":"累计发动〖写轮〗及其后续效果{n}次"},{"metric":"d:thunder","title":"千鸟雷切","goals":[10,200,1000],"scope":"total","description":"累计造成{n}点雷电伤害"}],"signature":{"title":"雷光写轮","requires":[["s:csh_renjin",3],["d:thunder",3]],"description":"发动〖忍禁〗及其后续效果3次，且造成3点雷电伤害"}},
{"id":"csh_bin","name":"彬","title":"世一不败","paths":[{"metric":"s:csh_gangbei","title":"钢背虚实","goals":[10,200,1000],"scope":"total","description":"累计发动〖钢背〗及其后续效果{n}次"},{"metric":"s:csh_shiyi","title":"化身万变","goals":[10,200,1000],"scope":"total","description":"累计发动〖世一〗及其后续效果{n}次"},{"metric":"c:respond","title":"绝境应对","goals":[20,400,2000],"scope":"total","description":"累计打出{n}张响应牌"}],"signature":{"title":"钢背英雄","requires":[["s:csh_gangbei",3],["s:csh_shiyi",3]],"description":"发动〖钢背〗及其后续效果3次，且发动〖世一〗及其后续效果3次"}},
{"id":"csh_maochao","name":"马超","title":"凉州神骑","paths":[{"metric":"s:csh_shuzhan","title":"术战应变","goals":[10,200,1000],"scope":"total","description":"累计发动〖术战〗及其后续效果{n}次"},{"metric":"s:csh_liangwang","title":"凉奔易势","goals":[10,200,1000],"scope":"total","description":"累计发动〖凉奔〗及其后续效果{n}次"},{"metric":"s:csh_qingzi","title":"青姿连征","goals":[5,100,500],"scope":"total","description":"累计发动〖青姿〗及其后续效果{n}次"}],"signature":{"title":"铁骑再征","requires":[["s:csh_qingzi",2],["d:sha",6]],"description":"发动〖青姿〗及其后续效果2次，且以【杀】造成6点伤害"}},
{"id":"csh_guansuo","name":"关索","title":"父魂承志","paths":[{"metric":"s:csh_gongao","title":"功獒生威","goals":[10,200,1000],"scope":"total","description":"累计发动〖功獒〗及其后续效果{n}次"},{"metric":"s:csh_zhugefuhun","title":"父魂归来","goals":[1,10,50],"scope":"total","description":"累计发动〖父魂〗及其后续效果{n}次"},{"metric":"d:fire","title":"制蛮焚阵","goals":[20,400,2000],"scope":"total","description":"累计造成{n}点火焰伤害"}],"signature":{"title":"炎魂相继","requires":[["s:csh_zhugefuhun",1],["d:fire",4]],"description":"发动〖父魂〗及其后续效果1次，且造成4点火焰伤害"}},
{"id":"csh_zhaoxiang","name":"赵襄","title":"梅影传薪","paths":[{"metric":"s:csh_fanghun","title":"芳魂化刃","goals":[10,200,1000],"scope":"total","description":"累计发动〖芳魂〗及其后续效果{n}次"},{"metric":"s:csh_rongbei","title":"披袍授甲","goals":[5,100,500],"scope":"total","description":"累计发动〖披袍〗及其后续效果{n}次"},{"metric":"s:csh_fuji223","title":"父志承续","goals":[1,10,50],"scope":"total","description":"累计发动〖父志〗及其后续效果{n}次"}],"signature":{"title":"梅影披袍","requires":[["s:csh_fuji223",1],["s:csh_rongbei",1],["s:csh_fanghun",3]],"description":"发动〖父志〗及其后续效果1次，且发动〖披袍〗及其后续效果1次，且发动〖芳魂〗及其后续效果3次"}},
{"id":"csh_zhuran","name":"朱然","title":"胆守江陵","paths":[{"metric":"s:csh_danshou","title":"胆守进退","goals":[10,200,1000],"scope":"total","description":"累计发动〖胆守〗及其后续效果{n}次"},{"metric":"g:cards","title":"静待粮至","goals":[50,1000,10000],"scope":"total","description":"累计获得{n}张牌"},{"metric":"d:all","title":"胆气反击","goals":[10,200,1000],"scope":"total","description":"累计造成{n}点伤害"}],"signature":{"title":"静守有锋","requires":[["s:csh_danshou",4],["d:all",4]],"description":"发动〖胆守〗及其后续效果4次，且造成4点伤害"}},
{"id":"csh_yujin","name":"于禁","title":"节钺如山","paths":[{"metric":"s:csh_jieyue","title":"节钺分赏","goals":[10,200,1000],"scope":"total","description":"累计发动〖节钺〗及其后续效果{n}次"},{"metric":"g:cards","title":"军令取资","goals":[50,1000,10000],"scope":"total","description":"累计获得{n}张牌"},{"metric":"l:discard","title":"整军弃冗","goals":[10,200,1000],"scope":"total","description":"累计弃置{n}张牌"}],"signature":{"title":"军令四传","requires":[["s:csh_jieyue",4],["g:cards",15]],"description":"发动〖节钺〗及其后续效果4次，且获得15张牌"}},
{"id":"csh_handang","name":"韩当","title":"江东老将","paths":[{"metric":"s:csh_niluan","title":"逆乱追击","goals":[5,100,500],"scope":"total","description":"累计发动〖逆乱〗及其后续效果{n}次"},{"metric":"s:csh_spweiwu","title":"违忤夺资","goals":[5,100,500],"scope":"total","description":"累计发动〖违忤〗及其后续效果{n}次"},{"metric":"c:sha","title":"骁袭连锋","goals":[20,400,2000],"scope":"total","description":"累计使用或打出{n}张【杀】"}],"signature":{"title":"逆乱骁袭","requires":[["s:csh_niluan",2],["s:csh_spweiwu",2]],"description":"发动〖逆乱〗及其后续效果2次，且发动〖违忤〗及其后续效果2次"}},
{"id":"csh_caiyan","name":"蔡琰","title":"笳音四时","paths":[{"metric":"s:csh_qiege","title":"笳歌四调","goals":[10,200,1000],"scope":"total","description":"累计发动〖笳歌〗及其后续效果{n}次"},{"metric":"s:csh_yusuo","title":"珏锁连环","goals":[5,100,500],"scope":"total","description":"累计发动〖珏锁〗及其后续效果{n}次"},{"metric":"c:tiesuo","title":"铁索和鸣","goals":[10,200,1000],"scope":"total","description":"累计使用或打出{n}张【铁索连环】"}],"signature":{"title":"笳锁相和","requires":[["s:csh_qiege",3],["s:csh_yusuo",2]],"description":"发动〖笳歌〗及其后续效果3次，且发动〖珏锁〗及其后续效果2次"}},
{"id":"csh_simahui","name":"司马徽","title":"水镜传道","paths":[{"metric":"s:csh_shuijing","title":"镜学百家","goals":[10,200,1000],"scope":"total","description":"累计发动〖镜学〗及其后续效果{n}次"},{"metric":"s:csh_jingfu","title":"幻镜济众","goals":[5,100,500],"scope":"total","description":"累计发动〖幻镜〗及其后续效果{n}次"},{"metric":"s:csh_zhiyin","title":"拙守成甲","goals":[5,100,500],"scope":"total","description":"累计发动〖拙守〗及其后续效果{n}次"}],"signature":{"title":"镜中藏甲","requires":[["s:csh_jingfu",2],["s:csh_zhiyin",2]],"description":"发动〖幻镜〗及其后续效果2次，且发动〖拙守〗及其后续效果2次"}},
{"id":"csh_wenyang","name":"文鸯","title":"孤骑冲坚","paths":[{"metric":"s:csh_poyin","title":"却敌千变","goals":[10,200,1000],"scope":"total","description":"累计发动〖却敌〗及其后续效果{n}次"},{"metric":"s:csh_chuanfa","title":"冲坚运筹","goals":[5,100,500],"scope":"total","description":"累计发动〖冲坚〗及其后续效果{n}次"},{"metric":"d:thunder","title":"雷破敌阵","goals":[10,200,1000],"scope":"total","description":"累计造成{n}点雷电伤害"}],"signature":{"title":"孤骑雷动","requires":[["s:csh_poyin",3],["d:thunder",2]],"description":"发动〖却敌〗及其后续效果3次，且造成2点雷电伤害"}},
{"id":"csh_dengai","name":"邓艾","title":"阴平凿险","paths":[{"metric":"s:csh_retuntian","title":"屯田积势","goals":[10,200,1000],"scope":"total","description":"累计发动〖屯田〗及其后续效果{n}次"},{"metric":"s:csh_zishu","title":"耒耜丰收","goals":[10,200,1000],"scope":"total","description":"累计发动〖耒耜〗及其后续效果{n}次"},{"metric":"s:csh_zaoxian","title":"凿险开道","goals":[1,10,50],"scope":"total","description":"累计发动〖凿险〗及其后续效果{n}次"}],"signature":{"title":"耕战成道","requires":[["s:csh_zaoxian",1],["s:csh_retuntian",3]],"description":"发动〖凿险〗及其后续效果1次，且发动〖屯田〗及其后续效果3次"}},
{"id":"csh_gaogan","name":"清河公主","title":"清河谮影","paths":[{"metric":"s:csh_juguan","title":"谮构借锋","goals":[5,100,500],"scope":"total","description":"累计发动〖谮构〗及其后续效果{n}次"},{"metric":"s:csh_manyujinsuwu","title":"诽离取势","goals":[5,100,500],"scope":"total","description":"累计发动〖诽离〗及其后续效果{n}次"},{"metric":"p:hand","title":"八策满囊","goals":[10,16,24],"scope":"peak","description":"手牌数曾达到{n}张"}],"signature":{"title":"清河藏策","requires":[["s:csh_juguan",2],["p:hand",12]],"description":"发动〖谮构〗及其后续效果2次，且手牌数曾达到12张"}},
{"id":"csh_lifeng","name":"李丰","title":"蜀道输粮","paths":[{"metric":"s:csh_lifeng_shuliang","title":"流马运粮","goals":[5,100,500],"scope":"total","description":"累计发动〖输粮〗及其后续效果{n}次"},{"metric":"p:hand","title":"屯粮如山","goals":[15,30,50],"scope":"peak","description":"手牌数曾达到{n}张"},{"metric":"g:cards","title":"粮秣万石","goals":[100,2000,10000],"scope":"total","description":"累计获得{n}张牌"}],"signature":{"title":"粮车再起","requires":[["s:csh_lifeng_shuliang",2],["p:hand",20]],"description":"发动〖输粮〗及其后续效果2次，且手牌数曾达到20张"}},
{"id":"csh_caochun","name":"曹纯","title":"虎豹缮甲","paths":[{"metric":"s:csh_xinshanjia","title":"缮甲整军","goals":[10,200,1000],"scope":"total","description":"累计发动〖缮甲〗及其后续效果{n}次"},{"metric":"e:equip","title":"虎骑易装","goals":[10,200,1000],"scope":"total","description":"累计完成{n}次装备"},{"metric":"d:sha","title":"青锋破阵","goals":[20,400,2000],"scope":"total","description":"累计以【杀】造成{n}点伤害"}],"signature":{"title":"缮甲驰锋","requires":[["s:csh_xinshanjia",3],["d:sha",6]],"description":"发动〖缮甲〗及其后续效果3次，且以【杀】造成6点伤害"}},
{"id":"csh_shamoke","name":"沙摩柯","title":"蒺藜蛮王","paths":[{"metric":"s:csh_gzjili","title":"蒺藜连动","goals":[10,200,1000],"scope":"total","description":"累计发动〖蒺藜〗及其后续效果{n}次"},{"metric":"s:csh_xianxiamanyong","title":"蛮勇执兵","goals":[5,100,500],"scope":"total","description":"累计发动〖蛮勇〗及其后续效果{n}次"},{"metric":"c:shunshou","title":"巧取蛮资","goals":[10,200,1000],"scope":"total","description":"累计使用或打出{n}张【顺手牵羊】"}],"signature":{"title":"蛮勇有谋","requires":[["s:csh_gzjili",3],["c:shunshou",2]],"description":"发动〖蒺藜〗及其后续效果3次，且使用或打出2张【顺手牵羊】"}},
{"id":"csh_zhangning","name":"张宁","title":"黄天地法","paths":[{"metric":"s:csh_huangtian1","title":"黄天择色","goals":[5,100,500],"scope":"total","description":"累计发动〖黄天〗及其后续效果{n}次"},{"metric":"s:csh_difa12","title":"地法授牌","goals":[5,100,500],"scope":"total","description":"累计发动〖地法〗及其后续效果{n}次"},{"metric":"g:cards","title":"黄天赐予","goals":[50,1000,10000],"scope":"total","description":"累计获得{n}张牌"}],"signature":{"title":"天地相济","requires":[["s:csh_huangtian1",3],["s:csh_difa12",2]],"description":"发动〖黄天〗及其后续效果3次，且发动〖地法〗及其后续效果2次"}},
{"id":"csh_lidian","name":"李典","title":"恂恂忘隙","paths":[{"metric":"s:csh_xunxun","title":"恂恂布牌","goals":[5,100,500],"scope":"total","description":"累计发动〖恂恂〗及其后续效果{n}次"},{"metric":"s:csh_xinwangxi","title":"忘隙往来","goals":[10,200,1000],"scope":"total","description":"累计发动〖忘隙〗及其后续效果{n}次"},{"metric":"g:cards","title":"惠取有度","goals":[50,1000,10000],"scope":"total","description":"累计获得{n}张牌"}],"signature":{"title":"忘隙成章","requires":[["s:csh_xunxun",3],["s:csh_xinwangxi",4]],"description":"发动〖恂恂〗及其后续效果3次，且发动〖忘隙〗及其后续效果4次"}},
{"id":"csh_lvlingqi","name":"吕玲绮","title":"妆戎焰舞","paths":[{"metric":"s:csh_yannv1","title":"焰女追火","goals":[5,100,500],"scope":"total","description":"累计发动〖焰女〗及其后续效果{n}次"},{"metric":"s:csh_zhuangrong12","title":"妆戎重生","goals":[1,10,50],"scope":"total","description":"累计发动〖妆戎〗及其后续效果{n}次"},{"metric":"d:fire","title":"红妆烈焰","goals":[10,200,1000],"scope":"total","description":"累计造成{n}点火焰伤害"}],"signature":{"title":"烈焰新妆","requires":[["s:csh_zhuangrong12",1],["d:fire",3]],"description":"发动〖妆戎〗及其后续效果1次，且造成3点火焰伤害"}},
{"id":"csh_wolongzhuge","name":"卧龙诸葛","title":"卧龙星火","paths":[{"metric":"s:csh_huoji","title":"火计连营","goals":[10,200,1000],"scope":"total","description":"累计发动〖火计〗及其后续效果{n}次"},{"metric":"s:csh_kanpo","title":"看破奇策","goals":[10,200,1000],"scope":"total","description":"累计发动〖看破〗及其后续效果{n}次"},{"metric":"s:csh_xingyou","title":"星佑回响","goals":[10,200,1000],"scope":"total","description":"累计发动〖星佑〗及其后续效果{n}次"}],"signature":{"title":"星火同辉","requires":[["s:csh_huoji",2],["s:csh_kanpo",2],["s:csh_xingyou",3]],"description":"发动〖火计〗及其后续效果2次，且发动〖看破〗及其后续效果2次，且发动〖星佑〗及其后续效果3次"}},
{"id":"csh_dongzhuo","name":"董卓","title":"暴威长存","paths":[{"metric":"s:csh_baowei","title":"暴威三相","goals":[10,200,1000],"scope":"total","description":"累计发动〖暴威〗及其后续效果{n}次"},{"metric":"c:tao","title":"鞭短续命","goals":[10,200,1000],"scope":"total","description":"累计使用或打出{n}张【桃】"},{"metric":"r:recover","title":"暴君回生","goals":[20,400,2000],"scope":"total","description":"累计回复{n}点体力"}],"signature":{"title":"暴威不息","requires":[["s:csh_baowei",5],["r:recover",6]],"description":"发动〖暴威〗及其后续效果5次，且回复6点体力"}},
{"id":"csh_chendao","name":"陈到","title":"白毦往烈","paths":[{"metric":"s:csh_wanglie","title":"往烈尽色","goals":[10,200,1000],"scope":"total","description":"累计发动〖往烈〗及其后续效果{n}次"},{"metric":"s:csh_maojiang","title":"毦兵绝境","goals":[1,10,50],"scope":"total","description":"累计发动〖毦兵〗及其后续效果{n}次"},{"metric":"g:cards","title":"白毦收阵","goals":[50,1000,10000],"scope":"total","description":"累计获得{n}张牌"}],"signature":{"title":"绝境往烈","requires":[["s:csh_maojiang",1],["s:csh_wanglie",3]],"description":"发动〖毦兵〗及其后续效果1次，且发动〖往烈〗及其后续效果3次"}},
{"id":"csh_lukang","name":"陆抗","title":"西陵抗力","paths":[{"metric":"s:csh_kangli","title":"抗力交锋","goals":[10,200,1000],"scope":"total","description":"累计发动〖抗力〗及其后续效果{n}次"},{"metric":"r:recover","title":"刚毅回生","goals":[10,200,1000],"scope":"total","description":"累计回复{n}点体力"},{"metric":"g:cards","title":"筹策再整","goals":[50,1000,10000],"scope":"total","description":"累计获得{n}张牌"}],"signature":{"title":"刚毅不折","requires":[["s:csh_kangli",5],["r:recover",3]],"description":"发动〖抗力〗及其后续效果5次，且回复3点体力"}},
{"id":"csh_xurong","name":"徐荣","title":"凶镬余烬","paths":[{"metric":"s:csh_xionghuo","title":"凶镬布戾","goals":[10,200,1000],"scope":"total","description":"累计发动〖凶镬〗及其后续效果{n}次"},{"metric":"s:csh_sxrmzhaduo","title":"杀绝双锋","goals":[5,100,500],"scope":"total","description":"累计发动〖杀绝〗及其后续效果{n}次"},{"metric":"d:fire","title":"暴戾烈焰","goals":[10,200,1000],"scope":"total","description":"累计造成{n}点火焰伤害"}],"signature":{"title":"凶镬杀绝","requires":[["s:csh_xionghuo",3],["s:csh_sxrmzhaduo",2]],"description":"发动〖凶镬〗及其后续效果3次，且发动〖杀绝〗及其后续效果2次"}},
{"id":"csh_doudou","name":"豆豆","title":"千古我斩","paths":[{"metric":"s:csh_wozhan","title":"空刃重斩","goals":[10,200,1000],"scope":"total","description":"累计发动〖我斩〗及其后续效果{n}次"},{"metric":"s:csh_qiangu","title":"千古散印","goals":[10,200,1000],"scope":"total","description":"累计发动〖千古〗及其后续效果{n}次"},{"metric":"d:sha","title":"无械亦锋","goals":[20,400,2000],"scope":"total","description":"累计以【杀】造成{n}点伤害"}],"signature":{"title":"千古一斩","requires":[["s:csh_wozhan",3],["d:sha",6]],"description":"发动〖我斩〗及其后续效果3次，且以【杀】造成6点伤害"}},
{"id":"csh_zhugeke","name":"诸葛恪","title":"傲才黩武","paths":[{"metric":"s:csh_aocai","title":"傲才寻机","goals":[10,200,1000],"scope":"total","description":"累计发动〖傲才〗及其后续效果{n}次"},{"metric":"s:csh_duwu","title":"黩武破阵","goals":[10,200,1000],"scope":"total","description":"累计发动〖黩武〗及其后续效果{n}次"},{"metric":"d:all","title":"筹牌为锋","goals":[20,400,2000],"scope":"total","description":"累计造成{n}点伤害"}],"signature":{"title":"才武并进","requires":[["s:csh_aocai",2],["s:csh_duwu",3]],"description":"发动〖傲才〗及其后续效果2次，且发动〖黩武〗及其后续效果3次"}},
{"id":"csh_nailong_juexing","name":"奶龙","title":"笑对风波","paths":[{"metric":"s:csh_nailongjuexing","title":"捧腹脱险","goals":[10,200,1000],"scope":"total","description":"累计发动〖捧腹〗及其后续效果{n}次"},{"metric":"s:csh_daxiao","title":"大笑留印","goals":[5,100,500],"scope":"total","description":"累计发动〖大笑〗及其后续效果{n}次"},{"metric":"r:recover","title":"笑而复起","goals":[10,200,1000],"scope":"total","description":"累计回复{n}点体力"}],"signature":{"title":"笑声回环","requires":[["s:csh_nailongjuexing",3],["s:csh_daxiao",2]],"description":"发动〖捧腹〗及其后续效果3次，且发动〖大笑〗及其后续效果2次"}},
{"id":"csh_chengyu","name":"程昱","title":"伏兵十面","paths":[{"metric":"s:csh_shefu666","title":"设伏藏机","goals":[10,200,1000],"scope":"total","description":"累计发动〖设伏〗及其后续效果{n}次"},{"metric":"s:csh_benyu","title":"贲育还锋","goals":[10,200,1000],"scope":"total","description":"累计发动〖贲育〗及其后续效果{n}次"},{"metric":"p:armor","title":"谋臣铁衣","goals":[2,4,7],"scope":"peak","description":"护甲曾达到{n}点"}],"signature":{"title":"伏中有勇","requires":[["s:csh_shefu666",3],["s:csh_benyu",2]],"description":"发动〖设伏〗及其后续效果3次，且发动〖贲育〗及其后续效果2次"}},
{"id":"csh_shanyuezhiyin","name":"奥恩","title":"山隐铸炉","paths":[{"metric":"s:csh_aoenduandao","title":"锻刀四式","goals":[10,200,1000],"scope":"total","description":"累计发动〖锻刀〗及其后续效果{n}次"},{"metric":"s:csh_aoenyidao","title":"献装援阵","goals":[10,200,1000],"scope":"total","description":"累计发动〖献装〗及其后续效果{n}次"},{"metric":"d:fire","title":"驭焰熔铸","goals":[20,400,2000],"scope":"total","description":"累计造成{n}点火焰伤害"}],"signature":{"title":"炉火赠兵","requires":[["s:csh_aoenduandao",3],["s:csh_aoenyidao",2]],"description":"发动〖锻刀〗及其后续效果3次，且发动〖献装〗及其后续效果2次"}},
{"id":"csh_guanyinping","name":"关银屏","title":"姻谋血祭","paths":[{"metric":"s:csh_sxrmyinmou","title":"姻谋结缘","goals":[10,200,1000],"scope":"total","description":"累计发动〖姻谋〗及其后续效果{n}次"},{"metric":"s:csh_dragxueji","title":"血祭燎野","goals":[10,200,1000],"scope":"total","description":"累计发动〖血祭〗及其后续效果{n}次"},{"metric":"d:fire","title":"赤焰银屏","goals":[20,400,2000],"scope":"total","description":"累计造成{n}点火焰伤害"}],"signature":{"title":"血祭连环","requires":[["s:csh_dragxueji",3],["d:fire",6]],"description":"发动〖血祭〗及其后续效果3次，且造成6点火焰伤害"}},
{"id":"csh_realityfanghao","name":"方圣帝君","title":"袭虚圣途","paths":[{"metric":"s:csh_fanghaoqibing","title":"袭虚出奇","goals":[10,200,1000],"scope":"total","description":"累计发动〖袭虚〗及其后续效果{n}次"},{"metric":"s:csh_sbhunzi","title":"魂姿重生","goals":[1,10,50],"scope":"total","description":"累计发动〖魂姿〗及其后续效果{n}次"},{"metric":"g:cards","title":"奇策再续","goals":[50,1000,10000],"scope":"total","description":"累计获得{n}张牌"}],"signature":{"title":"圣途新生","requires":[["s:csh_sbhunzi",1],["s:csh_fanghaoqibing",3]],"description":"发动〖魂姿〗及其后续效果1次，且发动〖袭虚〗及其后续效果3次"}},
{"id":"csh_feibijiubi","name":"菲比","title":"圣祈凝辉","paths":[{"metric":"s:csh_xinfu_duanfa","title":"圣祈净牌","goals":[10,200,1000],"scope":"total","description":"累计发动〖圣祈〗及其后续效果{n}次"},{"metric":"s:csh_feibininghui","title":"凝辉争胜","goals":[10,200,1000],"scope":"total","description":"累计发动〖凝辉〗及其后续效果{n}次"},{"metric":"q:compare","title":"辉光论点","goals":[10,200,1000],"scope":"total","description":"累计参与{n}次拼点"}],"signature":{"title":"双辉照阵","requires":[["s:csh_xinfu_duanfa",3],["s:csh_feibininghui",2]],"description":"发动〖圣祈〗及其后续效果3次，且发动〖凝辉〗及其后续效果2次"}},
{"id":"csh_zhugeqing","name":"诸葛青","title":"八门巽离","paths":[{"metric":"s:csh_qimen","title":"奇门换势","goals":[10,200,1000],"scope":"total","description":"累计发动〖奇门〗及其后续效果{n}次"},{"metric":"s:csh_zhugefencheng","title":"巽离驱阵","goals":[5,100,500],"scope":"total","description":"累计发动〖巽离〗及其后续效果{n}次"},{"metric":"c:type.trick","title":"八门奇策","goals":[20,400,2000],"scope":"total","description":"累计使用或打出{n}张锦囊牌"}],"signature":{"title":"巽离成局","requires":[["s:csh_zhugefencheng",2],["c:type.trick",5]],"description":"发动〖巽离〗及其后续效果2次，且使用或打出5张锦囊牌"}},
{"id":"csh_moteng","name":"魔腾","title":"永恒梦魇","paths":[{"metric":"s:csh_xumeng","title":"虚梦赠影","goals":[5,100,500],"scope":"total","description":"累计发动〖虚梦〗及其后续效果{n}次"},{"metric":"s:csh_pinju","title":"品惧收噩","goals":[10,200,1000],"scope":"total","description":"累计发动〖品惧〗及其后续效果{n}次"},{"metric":"s:csh_shie","title":"释噩决胜","goals":[5,100,500],"scope":"total","description":"累计发动〖释噩〗及其后续效果{n}次"}],"signature":{"title":"梦魇三重","requires":[["s:csh_xumeng",2],["s:csh_pinju",3],["s:csh_shie",2]],"description":"发动〖虚梦〗及其后续效果2次，且发动〖品惧〗及其后续效果3次，且发动〖释噩〗及其后续效果2次"}},
{"id":"csh_daaixianzun","name":"大爱仙尊","title":"春秋逆流","paths":[{"metric":"s:csh_chunqiu","title":"春秋回溯","goals":[5,100,500],"scope":"total","description":"累计发动〖春秋〗及其后续效果{n}次"},{"metric":"s:csh_xiansha","title":"仙杀问道","goals":[5,100,500],"scope":"total","description":"累计发动〖仙杀〗及其后续效果{n}次"},{"metric":"s:csh_fangyuan_hengshou","title":"恒守逆流","goals":[1,10,50],"scope":"total","description":"累计发动〖恒守〗及其后续效果{n}次"}],"signature":{"title":"春秋仙杀","requires":[["s:csh_chunqiu",2],["s:csh_xiansha",3]],"description":"发动〖春秋〗及其后续效果2次，且发动〖仙杀〗及其后续效果3次"}},
{"id":"csh_zhangxingcai","name":"张星彩","title":"将门枪舞","paths":[{"metric":"s:csh_zhangxingcai_shenxian","title":"甚贤承志","goals":[10,200,1000],"scope":"total","description":"累计发动〖甚贤〗及其后续效果{n}次"},{"metric":"c:sha","title":"红黑枪舞","goals":[20,400,2000],"scope":"total","description":"累计使用或打出{n}张【杀】"},{"metric":"d:sha","title":"将门破阵","goals":[20,400,2000],"scope":"total","description":"累计以【杀】造成{n}点伤害"}],"signature":{"title":"枪舞不息","requires":[["c:sha",5],["d:sha",8]],"description":"使用或打出5张【杀】，且以【杀】造成8点伤害"}},
{"id":"csh_jieluji","name":"陆绩","title":"浑天奋驽","paths":[{"metric":"s:csh_jieluji_gailan","title":"该览布仪","goals":[5,100,500],"scope":"total","description":"累计发动〖该览〗及其后续效果{n}次"},{"metric":"s:csh_jieluji_fennu","title":"奋驽蓄逸","goals":[10,200,1000],"scope":"total","description":"累计发动〖奋驽〗及其后续效果{n}次"},{"metric":"e:equip","title":"浑仪入阵","goals":[10,200,1000],"scope":"total","description":"累计完成{n}次装备"}],"signature":{"title":"仪逸两全","requires":[["s:csh_jieluji_gailan",3],["s:csh_jieluji_fennu",2]],"description":"发动〖该览〗及其后续效果3次，且发动〖奋驽〗及其后续效果2次"}},
{"id":"csh_youhabahe","name":"友哈巴赫","title":"圣别长夜","paths":[{"metric":"s:csh_youhabahe_shengbie","title":"圣别盟约","goals":[1,10,50],"scope":"total","description":"累计发动〖圣别〗及其后续效果{n}次"},{"metric":"g:cards","title":"圣别馈赠","goals":[50,1000,10000],"scope":"total","description":"累计获得{n}张牌"},{"metric":"d:all","title":"帝国征途","goals":[20,400,2000],"scope":"total","description":"累计造成{n}点伤害"}],"signature":{"title":"圣别远征","requires":[["s:csh_youhabahe_shengbie",1],["d:all",6]],"description":"发动〖圣别〗及其后续效果1次，且造成6点伤害"}},
{"id":"csh_shencaozhi","name":"神曹植","title":"七步成诗","paths":[{"metric":"s:csh_qibu","title":"七步题诗","goals":[10,200,1000],"scope":"total","description":"累计发动〖七步〗及其后续效果{n}次"},{"metric":"c:all","title":"挥毫行牌","goals":[50,1000,5000],"scope":"total","description":"累计使用或打出{n}张牌"},{"metric":"p:hand","title":"诗卷盈箧","goals":[8,14,20],"scope":"peak","description":"手牌数曾达到{n}张"}],"signature":{"title":"七步长歌","requires":[["s:csh_qibu",4],["c:all",12]],"description":"发动〖七步〗及其后续效果4次，且使用或打出12张牌"}},
{"id":"csh_shenzhugeguo","name":"神诸葛果","title":"羽化仙途","paths":[{"metric":"s:csh_xiudao","title":"修道积功","goals":[10,200,1000],"scope":"total","description":"累计发动〖修道〗及其后续效果{n}次"},{"metric":"s:csh_feisheng","title":"飞升问仙","goals":[1,10,50],"scope":"total","description":"累计发动〖飞升〗及其后续效果{n}次"},{"metric":"p:hand","title":"仙卷盈箧","goals":[7,12,18],"scope":"peak","description":"手牌数曾达到{n}张"}],"signature":{"title":"羽化有成","requires":[["s:csh_feisheng",1],["s:csh_xiudao",4]],"description":"发动〖飞升〗及其后续效果1次，且发动〖修道〗及其后续效果4次"}},
{"id":"csh_dabing","name":"大冰","title":"奇瑞恃才","paths":[{"metric":"s:csh_dabing_qirui","title":"奇瑞换势","goals":[10,200,1000],"scope":"total","description":"累计发动〖奇瑞〗及其后续效果{n}次"},{"metric":"s:csh_dabing_shicai","title":"恃才取顶","goals":[10,200,1000],"scope":"total","description":"累计发动〖恃才〗及其后续效果{n}次"},{"metric":"s:csh_dabing_fenchao","title":"焚巢授锋","goals":[1,10,50],"scope":"total","description":"累计发动〖焚巢〗及其后续效果{n}次"}],"signature":{"title":"奇才连动","requires":[["s:csh_dabing_qirui",3],["s:csh_dabing_shicai",3]],"description":"发动〖奇瑞〗及其后续效果3次，且发动〖恃才〗及其后续效果3次"}},
{"id":"csh_modekaisa","name":"莫德凯撒","title":"轮回铁铠","paths":[{"metric":"s:csh_mingdun","title":"冥盾铸城","goals":[10,200,1000],"scope":"total","description":"累计发动〖冥盾〗及其后续效果{n}次"},{"metric":"s:csh_lunjing","title":"轮境决斗","goals":[1,20,100],"scope":"total","description":"累计发动〖轮境〗及其后续效果{n}次"},{"metric":"p:armor","title":"不朽铁铠","goals":[4,8,15],"scope":"peak","description":"护甲曾达到{n}点"}],"signature":{"title":"轮回冥盾","requires":[["s:csh_lunjing",1],["p:armor",6]],"description":"发动〖轮境〗及其后续效果1次，且护甲曾达到6点"}},
{"id":"csh_donk","name":"洞克","title":"预瞄扫转","paths":[{"metric":"s:csh_yaqiang","title":"压枪判势","goals":[10,200,1000],"scope":"total","description":"累计发动〖压枪〗及其后续效果{n}次"},{"metric":"s:csh_saozhuan","title":"扫转再战","goals":[5,100,500],"scope":"total","description":"累计发动〖扫转〗及其后续效果{n}次"},{"metric":"p:mark.csh_yumiao","title":"预瞄蓄势","goals":[3,5,8],"scope":"peak","description":"预标记曾达到{n}枚"}],"signature":{"title":"扫转压枪","requires":[["s:csh_saozhuan",1],["s:csh_yaqiang",3]],"description":"发动〖扫转〗及其后续效果1次，且发动〖压枪〗及其后续效果3次"}},
{"id":"csh_lamosi","name":"拉莫斯","title":"披甲龙龟","paths":[{"metric":"s:csh_cijia","title":"刺甲回锋","goals":[10,200,1000],"scope":"total","description":"累计发动〖刺甲〗及其后续效果{n}次"},{"metric":"s:csh_chaogong","title":"嘲攻引战","goals":[5,100,500],"scope":"total","description":"累计发动〖嘲攻〗及其后续效果{n}次"},{"metric":"q:judge","title":"甲上问判","goals":[10,200,1000],"scope":"total","description":"累计进行{n}次判定"}],"signature":{"title":"嘲阵反击","requires":[["s:csh_chaogong",2],["s:csh_cijia",3]],"description":"发动〖嘲攻〗及其后续效果2次，且发动〖刺甲〗及其后续效果3次"}},
{"id":"csh_zhouchu","name":"周处","title":"除害新生","paths":[{"metric":"s:csh_chuhai","title":"除害争锋","goals":[10,200,1000],"scope":"total","description":"累计发动〖除害〗及其后续效果{n}次"},{"metric":"s:csh_xianghai","title":"乡害余势","goals":[10,200,1000],"scope":"total","description":"累计发动〖乡害〗及其后续效果{n}次"},{"metric":"p:equip","title":"披挂成行","goals":[3,4,5],"scope":"peak","description":"装备区曾同时拥有{n}张牌"}],"signature":{"title":"除害披甲","requires":[["s:csh_chuhai",2],["p:equip",3]],"description":"发动〖除害〗及其后续效果2次，且装备区曾同时拥有3张牌"}},
{"id":"csh_yangjian","name":"杨间","title":"十目归一","paths":[{"metric":"s:csh_yangzhi","title":"羊纸取类","goals":[10,200,1000],"scope":"total","description":"累计发动〖羊纸〗及其后续效果{n}次"},{"metric":"p:storage.csh_guiyan_layer","title":"鬼眼解封","goals":[3,6,10],"scope":"peak","description":"鬼眼曾解封到第{n}层"},{"metric":"g:cards","title":"鬼眼阅世","goals":[50,1000,10000],"scope":"total","description":"累计获得{n}张牌"}],"signature":{"title":"十目之战","requires":[["p:storage.csh_guiyan_layer",10],["s:csh_yangzhi",3]],"description":"鬼眼曾解封到第10层，且发动〖羊纸〗及其后续效果3次"}},
{"id":"csh_sake","name":"萨科","title":"真幻诡礼","paths":[{"metric":"s:csh_huanxiang","title":"幻像易身","goals":[10,200,1000],"scope":"total","description":"累计发动〖幻像〗及其后续效果{n}次"},{"metric":"s:csh_zhali","title":"诈礼藏盒","goals":[10,200,1000],"scope":"total","description":"累计发动〖诈礼〗及其后续效果{n}次"},{"metric":"d:ice","title":"假身寒锋","goals":[5,100,500],"scope":"total","description":"累计造成{n}点冰属性伤害"}],"signature":{"title":"真假礼局","requires":[["s:csh_huanxiang",2],["s:csh_zhali",3]],"description":"发动〖幻像〗及其后续效果2次，且发动〖诈礼〗及其后续效果3次"}},
{"id":"csh_kuisangti","name":"奎桑提","title":"纳祖芒之盾","paths":[{"metric":"s:csh_anzi","title":"岸姿双形","goals":[10,200,1000],"scope":"total","description":"累计发动〖岸姿〗及其后续效果{n}次"},{"metric":"s:csh_tuofu","title":"陀斧护阵","goals":[10,200,1000],"scope":"total","description":"累计发动〖陀斧〗及其后续效果{n}次"},{"metric":"p:armor","title":"饮血成盾","goals":[3,6,10],"scope":"peak","description":"护甲曾达到{n}点"}],"signature":{"title":"双形不破","requires":[["s:csh_anzi",3],["s:csh_tuofu",3]],"description":"发动〖岸姿〗及其后续效果3次，且发动〖陀斧〗及其后续效果3次"}},
{"id":"csh_sailasi","name":"塞拉斯","title":"破链盗道","paths":[{"metric":"s:csh_daodao","title":"盗道百家","goals":[10,200,1000],"scope":"total","description":"累计发动〖盗道〗及其后续效果{n}次"},{"metric":"s:csh_yongshuang","title":"永霜寒锋","goals":[10,200,1000],"scope":"total","description":"累计发动〖永霜〗及其后续效果{n}次"},{"metric":"d:ice","title":"冰链破阵","goals":[20,400,2000],"scope":"total","description":"累计造成{n}点冰属性伤害"}],"signature":{"title":"霜道并进","requires":[["s:csh_daodao",3],["d:ice",6]],"description":"发动〖盗道〗及其后续效果3次，且造成6点冰属性伤害"}},
{"id":"csh_theshy","name":"姜大哥","title":"血刃长锋","paths":[{"metric":"s:csh_theshy_biechi","title":"别吃断粮","goals":[10,200,1000],"scope":"total","description":"累计发动〖别吃〗及其后续效果{n}次"},{"metric":"s:csh_theshy_xueren","title":"血刃接势","goals":[10,200,1000],"scope":"total","description":"累计发动〖血刃〗及其后续效果{n}次"},{"metric":"d:sha","title":"长锋破阵","goals":[20,400,2000],"scope":"total","description":"累计以【杀】造成{n}点伤害"}],"signature":{"title":"血刃截粮","requires":[["s:csh_theshy_biechi",2],["d:sha",6]],"description":"发动〖别吃〗及其后续效果2次，且以【杀】造成6点伤害"}},
{"id":"csh_diaochan","name":"貂蝉","title":"允命连环","paths":[{"metric":"s:csh_yunming","title":"允命起局","goals":[1,20,100],"scope":"total","description":"累计发动〖允命〗及其后续效果{n}次"},{"metric":"s:csh_ziyan","title":"姿颜借锋","goals":[10,200,1000],"scope":"total","description":"累计发动〖姿颜〗及其后续效果{n}次"},{"metric":"c:jiedao","title":"借刀连环","goals":[5,100,500],"scope":"total","description":"累计使用或打出{n}张【借刀杀人】"}],"signature":{"title":"连环借刃","requires":[["s:csh_yunming",1],["c:jiedao",2]],"description":"发动〖允命〗及其后续效果1次，且使用或打出2张【借刀杀人】"}},
{"id":"csh_zywoo","name":"载物","title":"构特架枪","paths":[{"metric":"s:csh_jiagiang","title":"架枪择势","goals":[10,200,1000],"scope":"total","description":"累计发动〖架枪〗及其后续效果{n}次"},{"metric":"s:csh_goute","title":"构特换械","goals":[10,200,1000],"scope":"total","description":"累计发动〖构特〗及其后续效果{n}次"},{"metric":"d:sha","title":"枪响破阵","goals":[20,400,2000],"scope":"total","description":"累计以【杀】造成{n}点伤害"}],"signature":{"title":"换枪架势","requires":[["s:csh_goute",3],["s:csh_jiagiang",3]],"description":"发动〖构特〗及其后续效果3次，且发动〖架枪〗及其后续效果3次"}},
{"id":"csh_haozhao","name":"郝昭","title":"陈仓坚守","paths":[{"metric":"s:csh_juwei","title":"拒围筹策","goals":[10,200,1000],"scope":"total","description":"累计发动〖拒围〗及其后续效果{n}次"},{"metric":"s:csh_chonglei","title":"重垒成城","goals":[10,200,1000],"scope":"total","description":"累计发动〖重垒〗及其后续效果{n}次"},{"metric":"p:armor","title":"陈仓壁垒","goals":[4,8,15],"scope":"peak","description":"护甲曾达到{n}点"}],"signature":{"title":"孤城不破","requires":[["s:csh_juwei",4],["p:armor",6]],"description":"发动〖拒围〗及其后续效果4次，且护甲曾达到6点"}},
{"id":"csh_pingfan","name":"平凡之人","title":"平凡有成","paths":[{"metric":"s:csh_jilei","title":"积累成川","goals":[10,200,1000],"scope":"total","description":"累计发动〖积累〗及其后续效果{n}次"},{"metric":"p:mark.csh_jilei","title":"滴水穿石","goals":[3,6,10],"scope":"peak","description":"积标记曾达到{n}枚"},{"metric":"g:cards","title":"岁月馈赠","goals":[50,1000,10000],"scope":"total","description":"累计获得{n}张牌"}],"signature":{"title":"积沙成塔","requires":[["p:mark.csh_jilei",6],["g:cards",30]],"description":"积标记曾达到6枚，且获得30张牌"}},
{"id":"csh_tongyuan","name":"童渊","title":"百鸟朝凤","paths":[{"metric":"s:csh_santu","title":"三徒传薪","goals":[10,200,1000],"scope":"total","description":"累计发动〖三徒〗及其后续效果{n}次"},{"metric":"q:compare","title":"公义争锋","goals":[10,200,1000],"scope":"total","description":"累计参与{n}次拼点"},{"metric":"c:respond","title":"子龙应变","goals":[20,400,2000],"scope":"total","description":"累计打出{n}张响应牌"}],"signature":{"title":"枪宗授业","requires":[["s:csh_santu",5],["q:compare",2],["c:respond",2]],"description":"发动〖三徒〗及其后续效果5次，且参与2次拼点，且打出2张响应牌"}}
];
    // Character mastery observes public results and the local player's own skill state.
    var HERO_INDEX = {}, PROFILE_BY_ID = {};
    CHARACTER_PROFILES.forEach(function(p){PROFILE_BY_ID[p.id]=p;});
    function masteryMetric(a,key){return Math.max(0,Number((key.indexOf('p:')===0?a.masteryPeaks:a.masteryCounts)[key])||0);}
    function masteryFeed(a,ev){
        a.masteryCounts=a.masteryCounts||{};a.masteryPeaks=a.masteryPeaks||{};
        if(ev.publicState)Object.keys(ev.publicState).forEach(function(k){var n=ev.publicState[k];if(Number.isFinite(n)&&n>=0)a.masteryPeaks[k]=Math.max(a.masteryPeaks[k]||0,n);});
        if(ev.seat!==a.meSeat)return;
        function add(key,n){if(n>0)a.masteryCounts[key]=Math.min(1000000000,(a.masteryCounts[key]||0)+n);}
        if(ev.t==='useSkill'&&!ev.masteryObserved){var rootSkill=ev.rootSkill||ev.skill;if(rootSkill)add('s:'+rootSkill,1);if(ev.skill&&ev.skill!==rootSkill)add('s:'+ev.skill,1);}
        if(ev.t==='useCard'){
            add('c:all',1);add('c:'+ev.name,1);if(ev.cardType)add('c:type.'+ev.cardType,1);if(ev.respond)add('c:respond',1);
        }
        if(ev.t==='damage'){add('d:all',ev.num);if(ev.cardName==='sha')add('d:sha',ev.num);(ev.natures||[]).forEach(function(n){add('d:'+n,ev.num);});}
        if(ev.t==='judge')add('q:judge',1);
        if(ev.t==='mastery'&&ev.metric)add(ev.metric,ev.num||0);
    }
    function masteryProgress(r,state){
        var rec=(state.mastery||{})[r.hero]||{},current=r.scope==='wins'?Number((state.chars||{})[r.hero])||0:Number((r.scope==='peak'?rec.peaks:rec.totals||{})?.[r.metric])||0;
        if(r.scope==='feat')return {value:state.got[r.id]?1:0,target:1,label:'同局完成全部条件',done:!!state.got[r.id]};
        return {value:state.got[r.id]?r.goal:Math.min(r.goal,current),target:r.goal,label:r.scope==='peak'?'历史峰值':'累计进度',done:!!state.got[r.id]};
    }
    function prepareMastery(st,a){
        st.mastery=st.mastery||{};a.masteryAccounted=a.masteryAccounted||{};
        (a.meChars||[]).forEach(function(id){var p=PROFILE_BY_ID[id];if(!p)return;var rec=st.mastery[id]||{totals:{},peaks:{}},paid=a.masteryAccounted[id]||{};
            rec.totals=rec.totals||{};rec.peaks=rec.peaks||{};
            p.paths.forEach(function(f){var key=f.metric,n=masteryMetric(a,key);if(f.scope==='peak')rec.peaks[key]=Math.max(rec.peaks[key]||0,n);else rec.totals[key]=Math.min(1000000000,(rec.totals[key]||0)+Math.max(0,n-(paid[key]||0)));});
            st.mastery[id]=rec;
        });
        a.masteryState=st;
    }
    function acceptMastery(a){
        (a.meChars||[]).forEach(function(id){var p=PROFILE_BY_ID[id];if(!p)return;var o=a.masteryAccounted[id]||(a.masteryAccounted[id]={});p.paths.forEach(function(f){o[f.metric]=masteryMetric(a,f.metric);});});
    }
    function appendMasteryRules(){
        CHARACTER_PROFILES.forEach(function(p){
            function append(r){r.hero=p.id;r.heroName=p.name;r.cat='专属';r.modes=[];r.on=['turn','useCard','useSkill','damage','judge','hp','over','mastery'];r.test=function(ev,a){
                if((a.meChars||[]).indexOf(p.id)<0)return false;
                if(r.scope==='feat')return r.requires.every(function(q){return masteryMetric(a,q[0])>=q[1];});
                var state=a.masteryState||{got:{},chars:{},mastery:{}};return masteryProgress(r,state).value>=r.goal;
            };RULES.push(r);}
            p.paths.forEach(function(f,i){f.goals.forEach(function(goal,t){append({id:'ca_'+p.id.slice(4)+'_'+i+'_'+t,name:p.name+' · '+f.title+' · '+['初成','精修','化境'][t],rare:t+1,metric:f.metric,scope:f.scope,goal:goal,desc:'使用'+p.name+'，'+f.description.replace('{n}',goal),hint:'单机身份、斗地主、对决中，以该武将本人出战时记录；不追溯没有保存的旧操作。'});});});
            [10,50,200].forEach(function(n,i){append({id:'ca_'+p.id.slice(4)+'_win_'+i,name:p.name+' · '+p.title+' · '+['十胜','五十胜','二百胜'][i],scope:'wins',metric:'wins',goal:n,rare:i+1,desc:'使用'+p.name+'累计赢得'+n+'局普通单机对局',hint:'双将分别记入实际出战武将；妖灵辅助局独立记录。'});});
            append({id:'ca_'+p.id.slice(4)+'_signature',name:p.name+' · '+p.signature.title,scope:'feat',goal:1,requires:p.signature.requires,rare:3,desc:'使用'+p.name+'，在同一局内'+p.signature.description,hint:'全部条件必须在同一局完成；不同对局的操作不能拼成这项挑战。'});
        });
    }
    appendMasteryRules();
    /* 同局组合挑战：只读现有本人事件计数；不新增采集点或持久化字段。
       追加在既有1380条之后，旧ID、顺序、判定和奖励原样保留。 */
    var TACTICAL_CHALLENGES = [
  {
    "id": "tc_three_basics",
    "name": "攻守有方",
    "cat": "操作",
    "rare": 1,
    "needs": [
      [
        "c:sha",
        1
      ],
      [
        "c:shan",
        1
      ],
      [
        "c:tao",
        1
      ]
    ],
    "desc": "同一局使用或打出过【杀】【闪】【桃】各至少1张"
  },
  {
    "id": "tc_guard_answers",
    "name": "有备无患",
    "cat": "操作",
    "rare": 1,
    "needs": [
      [
        "c:shan",
        2
      ],
      [
        "c:wuxie",
        1
      ]
    ],
    "desc": "同一局使用或打出至少2张【闪】与1张【无懈可击】"
  },
  {
    "id": "tc_three_types",
    "name": "三才成阵",
    "cat": "操作",
    "rare": 2,
    "win": true,
    "needs": [
      [
        "c:type.basic",
        1
      ],
      [
        "c:type.trick",
        1
      ],
      [
        "c:type.equip",
        1
      ]
    ],
    "desc": "同一局使用或打出过基本牌、锦囊牌和装备牌各至少1张，并获胜"
  },
  {
    "id": "tc_judge_trick",
    "name": "审势而动",
    "cat": "连击",
    "rare": 2,
    "needs": [
      [
        "q:judge",
        2
      ],
      [
        "c:type.trick",
        2
      ]
    ],
    "desc": "同一局本人完成至少2次判定，且使用或打出至少2张锦囊牌"
  },
  {
    "id": "tc_discard_gain",
    "name": "去芜存菁",
    "cat": "操作",
    "rare": 1,
    "needs": [
      [
        "l:discard",
        5
      ],
      [
        "g:cards",
        10
      ]
    ],
    "desc": "同一局本人累计弃置至少5张牌、获得至少10张牌"
  },
  {
    "id": "tc_equip_recover",
    "name": "整甲重来",
    "cat": "逆境",
    "rare": 2,
    "needs": [
      [
        "e:equip",
        2
      ],
      [
        "r:recover",
        1
      ]
    ],
    "desc": "同一局本人完成至少2次装备事件，且实际回复至少1点体力"
  },
  {
    "id": "tc_fire_thunder",
    "name": "风雷助焰",
    "cat": "连击",
    "rare": 3,
    "needs": [
      [
        "d:fire",
        2
      ],
      [
        "d:thunder",
        2
      ]
    ],
    "desc": "同一局本人累计造成至少2点火焰伤害与2点雷电伤害"
  },
  {
    "id": "tc_ice_blade",
    "name": "霜锋并进",
    "cat": "连击",
    "rare": 3,
    "needs": [
      [
        "d:ice",
        2
      ],
      [
        "d:sha",
        2
      ]
    ],
    "desc": "同一局本人累计造成至少2点冰属性伤害，且以【杀】造成至少2点伤害"
  },
  {
    "id": "tc_chain_fire",
    "name": "铁索映火",
    "cat": "连击",
    "rare": 2,
    "needs": [
      [
        "c:tiesuo",
        1
      ],
      [
        "d:fire",
        2
      ]
    ],
    "desc": "同一局使用或打出至少1张【铁索连环】，且本人累计造成至少2点火焰伤害"
  },
  {
    "id": "tc_damage_recover",
    "name": "鏖战自持",
    "cat": "逆境",
    "rare": 2,
    "needs": [
      [
        "d:all",
        6
      ],
      [
        "r:recover",
        3
      ]
    ],
    "desc": "同一局本人累计造成至少6点伤害、实际回复至少3点体力"
  },
  {
    "id": "tc_gain_respond",
    "name": "藏锋应势",
    "cat": "操作",
    "rare": 2,
    "needs": [
      [
        "g:cards",
        12
      ],
      [
        "c:respond",
        3
      ]
    ],
    "desc": "同一局本人获得至少12张牌，且在响应事件中打出至少3张牌"
  },
  {
    "id": "tc_trick_wuxie",
    "name": "谋定有守",
    "cat": "连击",
    "rare": 2,
    "win": true,
    "needs": [
      [
        "c:type.trick",
        3
      ],
      [
        "c:wuxie",
        1
      ]
    ],
    "desc": "同一局使用或打出至少3张锦囊牌（其中包括至少1张【无懈可击】），并获胜"
  },
  {
    "id": "tc_peach_blade",
    "name": "桃后犹锋",
    "cat": "逆境",
    "rare": 2,
    "win": true,
    "needs": [
      [
        "c:tao",
        1
      ],
      [
        "d:sha",
        3
      ]
    ],
    "desc": "同一局使用或打出至少1张【桃】，且以【杀】累计造成至少3点伤害，并获胜（不要求先后顺序）"
  },
  {
    "id": "tc_equip_basics",
    "name": "披坚执锐",
    "cat": "操作",
    "rare": 2,
    "win": true,
    "needs": [
      [
        "c:type.basic",
        4
      ],
      [
        "c:type.equip",
        1
      ]
    ],
    "desc": "同一局使用或打出至少4张基本牌与1张装备牌，并获胜"
  },
  {
    "id": "tc_respond_tricks",
    "name": "静待破局",
    "cat": "连击",
    "rare": 3,
    "win": true,
    "needs": [
      [
        "c:respond",
        4
      ],
      [
        "c:type.trick",
        3
      ]
    ],
    "desc": "同一局在响应事件中打出至少4张牌，且使用或打出至少3张锦囊牌，并获胜"
  },
  {
    "id": "tc_equip_tricks",
    "name": "器谋相济",
    "cat": "连击",
    "rare": 2,
    "win": true,
    "needs": [
      [
        "c:type.equip",
        2
      ],
      [
        "c:type.trick",
        2
      ],
      [
        "d:sha",
        2
      ]
    ],
    "desc": "同一局使用或打出至少2张装备牌、2张锦囊牌，且以【杀】造成至少2点伤害，并获胜"
  },
  {
    "id": "tc_compare_blade",
    "name": "论锋定局",
    "cat": "连击",
    "rare": 2,
    "win": true,
    "needs": [
      [
        "q:compare",
        2
      ],
      [
        "c:sha",
        2
      ]
    ],
    "desc": "同一局本人实际参与至少2次拼点（输赢均可），且使用或打出至少2张【杀】，并获胜"
  },
  {
    "id": "tc_recover_answers",
    "name": "回春固守",
    "cat": "逆境",
    "rare": 2,
    "win": true,
    "needs": [
      [
        "r:recover",
        3
      ],
      [
        "c:shan",
        2
      ],
      [
        "c:wuxie",
        1
      ]
    ],
    "desc": "同一局本人实际回复至少3点体力，使用或打出至少2张【闪】与1张【无懈可击】，并获胜"
  },
  {
    "id": "tc_lord_stand",
    "name": "主阵不坠",
    "cat": "模式",
    "rare": 2,
    "win": true,
    "modes": [
      "identity"
    ],
    "identity": "zhu",
    "needs": [
      [
        "d:sha",
        3
      ],
      [
        "r:recover",
        2
      ]
    ],
    "desc": "身份模式以主公出战，同局以【杀】造成至少3点伤害、实际回复至少2点体力，并获胜"
  },
  {
    "id": "tc_loyal_guard",
    "name": "丹心有守",
    "cat": "模式",
    "rare": 3,
    "win": true,
    "modes": [
      "identity"
    ],
    "identity": "zhong",
    "needs": [
      [
        "c:wuxie",
        2
      ],
      [
        "r:recover",
        2
      ]
    ],
    "desc": "身份模式以忠臣出战，同局使用或打出至少2张【无懈可击】、本人实际回复至少2点体力，并获胜"
  },
  {
    "id": "tc_rebel_scheme",
    "name": "破阵成谋",
    "cat": "模式",
    "rare": 2,
    "win": true,
    "modes": [
      "identity"
    ],
    "identity": "fan",
    "needs": [
      [
        "c:type.trick",
        3
      ],
      [
        "d:sha",
        3
      ]
    ],
    "desc": "身份模式以反贼出战，同局使用或打出至少3张锦囊牌、以【杀】造成至少3点伤害，并获胜"
  },
  {
    "id": "tc_spy_answers",
    "name": "藏谋待时",
    "cat": "模式",
    "rare": 3,
    "win": true,
    "modes": [
      "identity"
    ],
    "identity": "nei",
    "needs": [
      [
        "c:respond",
        3
      ],
      [
        "c:wuxie",
        1
      ]
    ],
    "desc": "身份模式以内奸出战，同局响应至少3张牌、使用或打出至少1张【无懈可击】，并获胜"
  },
  {
    "id": "tc_landlord_pressure",
    "name": "独镇一桌",
    "cat": "模式",
    "rare": 2,
    "win": true,
    "modes": [
      "doudizhu"
    ],
    "landlord": true,
    "needs": [
      [
        "c:sha",
        3
      ],
      [
        "c:type.trick",
        2
      ]
    ],
    "desc": "无名杀斗地主模式以地主出战，同局使用或打出至少3张【杀】与2张锦囊牌，并获胜"
  },
  {
    "id": "tc_farmer_endure",
    "name": "田间韧骨",
    "cat": "模式",
    "rare": 2,
    "win": true,
    "modes": [
      "doudizhu"
    ],
    "landlord": false,
    "needs": [
      [
        "r:recover",
        2
      ],
      [
        "c:respond",
        2
      ]
    ],
    "desc": "无名杀斗地主模式以农民出战，同局本人实际回复至少2点体力、响应至少2张牌，并获胜"
  },
  {
    "id": "tc_versus_exchange",
    "name": "对垒从容",
    "cat": "模式",
    "rare": 2,
    "win": true,
    "modes": [
      "versus"
    ],
    "needs": [
      [
        "d:sha",
        3
      ],
      [
        "c:respond",
        2
      ]
    ],
    "desc": "无名杀对决模式同局以【杀】造成至少3点伤害、响应至少2张牌，并获胜"
  },
  {
    "id": "tc_versus_judgment",
    "name": "判势决锋",
    "cat": "模式",
    "rare": 2,
    "win": true,
    "modes": [
      "versus"
    ],
    "needs": [
      [
        "q:judge",
        2
      ],
      [
        "d:all",
        5
      ]
    ],
    "desc": "无名杀对决模式同局本人完成至少2次判定、累计造成至少5点伤害，并获胜"
  },
  {
    "id": "tc_versus_supply",
    "name": "整军再战",
    "cat": "模式",
    "rare": 2,
    "win": true,
    "modes": [
      "versus"
    ],
    "needs": [
      [
        "g:cards",
        10
      ],
      [
        "e:equip",
        2
      ]
    ],
    "desc": "无名杀对决模式同局本人获得至少10张牌、完成至少2次装备事件，并获胜"
  },
  {
    "id": "tc_versus_fire",
    "name": "焰起对垒",
    "cat": "模式",
    "rare": 3,
    "win": true,
    "modes": [
      "versus"
    ],
    "needs": [
      [
        "d:fire",
        3
      ],
      [
        "c:type.trick",
        2
      ]
    ],
    "desc": "无名杀对决模式同局本人造成至少3点火焰伤害、使用或打出至少2张锦囊牌，并获胜"
  }
];
    TACTICAL_CHALLENGES.forEach(function(spec){
        RULES.push({id:spec.id,name:spec.name,cat:spec.cat,rare:spec.rare,
            modes:spec.modes||[],on:['over'],collection:'tactics-20261030',tactic:spec,
            desc:spec.desc,hint:'全部操作在同一局由本人完成；只记录普通单机身份、斗地主、对决。此处斗地主不是休闲小游戏。',
            test:function(ev,a){
                if(spec.win&&!ev.win)return false;
                if(spec.identity&&a.meIdentity!==spec.identity)return false;
                if(typeof spec.landlord==='boolean'&&a.isLandlord!==spec.landlord)return false;
                return spec.needs.every(function(pair){return masteryMetric(a,pair[0])>=pair[1];});
            }
        });
    });


	/* 索引：事件 → 规则（只跑相关规则，别让每次事件都扫全表） */
	var INDEX = {};
	for (var i = 0; i < RULES.length; i++) {
		var r = RULES[i];
		for (var j = 0; j < r.on.length; j++) {
			var k = r.on[j], index = r.hero ? (HERO_INDEX[r.hero] || (HERO_INDEX[r.hero] = {})) : INDEX;
			(index[k] = index[k] || []).push(r);
		}
	}

	/* ============================================================
	   2. 聚合器
	   ------------------------------------------------------------
	   全部字段都在这里初始化 —— 规则只读不写，避免"谁改了什么"说不清。
	   ============================================================ */
	function newRun(meta) {
		meta = meta || {};
		return {
			mode: meta.mode || "", round: 0, masteryCounts: {}, masteryPeaks: {}, masteryAccounted: {},
			meSeat: meta.meSeat == null ? -1 : meta.meSeat,
			meIdentity: meta.meIdentity || "",
			meChars: meta.meChars || [],
			seatCount: meta.seatCount || 0,
			/* 回合与出牌 */
			turn: 0, cardsTurn: 0, cardsTurnMax: 0, cardsTotal: 0,
			handAtWin: -1, handMin: 99, lastHandPrev: null,
			emptyHandTurns: 0, emptyHandTurnsMax: 0,
			handUp: 0, handUpMax: 0, lastHandEnd: -1,
			/* 伤害与击破 */
			dmgMax: 0, dmgTurn: 0, dmgTurnMax: 0,
			hurt: 0, hpMax: 0, hpNow: 0, hpMin: 99, nearDeath: 0, rescued: 0, inDying: false, recoveredFull: false, turnOpen: false, ownTurn: false, ended: false,
			kills: 0, killsTurn: 0, killsTurnMax: 0, killTurnsInRow: 0, killTurnsInRowMax: 0,
			killByRole: {}, killTurns: {},
			dmgTurnsInRow: 0, dmgTurnsInRowMax: 0, dmgTurns: {},
			/* 技能 */
			skillTurn: 0, skillTurnMax: 0, skillChain: 0, skillChainMax: 0,
			skillUseCount: {}, skillUsedAll: false,
			/* 闪避与判定 */
			dodgeStreak: 0, dodgeStreakMax: 0,
			judgeHit: 0, judgeTotal: 0,
			/* 局面 */
			playsBySeat: {}, played: {},
			allyDead: false, allyGap: 0, foeFullHpSeen: false,
			isLandlord: null, farmerPlays: 0, landlordPlays: 0,
			/* 跨局累计（由宿主在 over 前注入） */
			charWins: 0, distinctWins: 0,
			/* 本局新解锁 */
			unlocked: [],
		};
	}

	function maxima(a) {
		["cards", "dmg", "skill", "kills"].forEach(function (k) { a[k + "TurnMax"] = Math.max(a[k + "TurnMax"], a[k + "Turn"]); });
	}
	function endTurn(a, hand) {
		if (!a.turnOpen) return;
		maxima(a);
		if (a.ownTurn) {
			[["killsTurn", "killTurnsInRow"], ["dmgTurn", "dmgTurnsInRow"], ["skillTurn", "skillChain"]].forEach(function (p) {
				a[p[1]] = a[p[0]] > 0 ? a[p[1]] + 1 : 0;
				a[p[1] + "Max"] = Math.max(a[p[1] + "Max"], a[p[1]]);
			});
			if (typeof hand === "number") {
				a.emptyHandTurns = hand === 0 ? a.emptyHandTurns + 1 : 0;
				a.emptyHandTurnsMax = Math.max(a.emptyHandTurnsMax, a.emptyHandTurns);
				a.handUp = a.lastHandEnd >= 0 && hand > a.lastHandEnd ? a.handUp + 1 : 0;
				a.handUpMax = Math.max(a.handUpMax, a.handUp); a.lastHandEnd = hand;
			}
		}
		a.turnOpen = false;
	}
	function feed(a, ev) {
		if (!a || !ev || a.ended) return;
		masteryFeed(a,ev);
		var mine = ev.seat === a.meSeat;
		switch (ev.t) {
			case "turn":
				if (ev.end) { endTurn(a, ev.hand); break; }
				endTurn(a, ev.hand); a.turn++; a.ownTurn = mine; a.turnOpen = true;
				a.cardsTurn = a.dmgTurn = a.skillTurn = a.killsTurn = 0; break;
			case "useCard":
				if (!ev.respond) a.playsBySeat[ev.seat] = (a.playsBySeat[ev.seat] || 0) + 1;
				if (!mine) break;
				if (!ev.respond) { a.cardsTurn++; a.cardsTotal++; }
				a.played[ev.name] = 1;
				if (typeof ev.handAfter === "number") a.handMin = Math.min(a.handMin, ev.handAfter);
				if (ev.name === "shan" || ev.name === "闪") { a.dodgeStreak++; a.dodgeStreakMax = Math.max(a.dodgeStreakMax, a.dodgeStreak); }
				break;
			case "useSkill":
				if (mine && ev.skill) { a.skillTurn++; a.skillUseCount[ev.skill] = (a.skillUseCount[ev.skill] || 0) + 1; } break;
			case "damage":
				if (ev.victimSeat === a.meSeat) { a.hurt += ev.num || 0; a.dodgeStreak = 0; }
				if (mine) { a.dmgTurn += ev.num || 0; a.dmgMax = Math.max(a.dmgMax, ev.num || 0); }
				if (!a.lastDmgBySkill) a.lastDmgBySkill = {};
				a.lastDmgBySkill[ev.victimSeat] = mine && !!ev.bySkill; break;
			case "die":
				if (mine && ev.victimSeat !== a.meSeat) { a.kills++; a.killsTurn++; a.killByRole[ev.victimRole] = (a.killByRole[ev.victimRole] || 0) + 1; } break;
			case "judge": if (mine) { a.judgeTotal++; if (ev.hit) a.judgeHit++; } break;
			case "hp":
				if (!mine) break;
				if (ev.hp <= 0 && !a.inDying) { a.nearDeath++; a.inDying = true; }
				if (ev.hp > 0 && a.inDying) { a.rescued++; a.inDying = false; }
				a.hpNow = ev.hp; a.hpMax = ev.maxHp || a.hpMax; a.hpMin = Math.min(a.hpMin, ev.hp);
				if (a.hpMin <= 1 && a.hpNow >= a.hpMax && a.hpMax > 1) a.recoveredFull = true; break;
			case "over": endTurn(a, ev.hand); break;
		}
		maxima(a);
	}

	/* ============================================================
	   4. 判定（只跑与本事件相关的规则）
	   ============================================================ */
	function judge(a, ev, modes) {
		var out = [];
		/* 模式白名单在判定层再挡一次：万一将来有人绕过 install 直接调 judge，
		   也不能让国战/联机之类的对局写进池子成就。 */
		if (!a || !MODES[a.mode]) return out;
		var list = (INDEX[ev.t] || []).slice();
        (a.meChars||[]).forEach(function(id){if(HERO_INDEX[id]&&HERO_INDEX[id][ev.t])list=list.concat(HERO_INDEX[id][ev.t]);});
		if (!list.length) return out;
		if (ev.t === "over") finalize(a, ev);
		for (var i = 0; i < list.length; i++) {
			var r = list[i];
			if (r.modes && r.modes.length && r.modes.indexOf(a.mode) < 0) continue;
			if ((ev.t === "damage" || ev.t === "useCard" || ev.t === "die") && ev.seat !== a.meSeat) continue;
			if (a.unlocked.indexOf(r.id) >= 0) continue;       /* 本局已解锁，不重复 */
			var ok = false;
			try { ok = !!r.test(ev, a); } catch (e) { ok = false; }
			if (ok) out.push(r);
		}
		return out;
	}

	/* 结算前把派生量算出来（都是纯算术，无副作用） */
	function finalize(a, ev) {
		a.survivors = ev.survivors == null ? 0 : ev.survivors;
		/* 优先用引擎给的真实手牌数；拿不到才回落到"最后一次出牌后"的记录 */
		a.handAtWin = (ev.hand != null) ? ev.hand : a.lastHandEnd;
		if (ev.ident) {
			var landlord = ev.landlordSeat;
			a.isLandlord = (landlord == null) ? null : (landlord === a.meSeat);
			a.farmerPlays = 0; a.landlordPlays = 0;
			for (var s in a.playsBySeat) {
				var seat = Number(s);
				if (seat === landlord) a.landlordPlays += a.playsBySeat[s];
				else a.farmerPlays += a.playsBySeat[s];
			}
		}
		/* 反贼总数：身份场固定 4 反（人数少时按实际） */
		a.fanTotal = 0;
		if (ev.ident) for (var sid in ev.ident) if (ev.ident[sid] === "fan") a.fanTotal++;
	}

	var PROGRESS = {};
	PROGRESS["op_hit3"] = { field: "dmgMax", goal: 3 };
	PROGRESS["op_one_slash"] = { field: "dmgMax", goal: 4 };
	PROGRESS["op_hit5"] = { field: "dmgMax", goal: 5 };
	PROGRESS["op_thunder"] = { field: "dmgMax", goal: 6 };
	PROGRESS["op_cards4"] = { field: "cardsTurnMax", goal: 4 };
	PROGRESS["op_five_cards"] = { field: "cardsTurnMax", goal: 5 };
	PROGRESS["op_cards6"] = { field: "cardsTurnMax", goal: 6 };
	PROGRESS["op_cards_total"] = { field: "cardsTotal", goal: 30 };
	PROGRESS["op_cards50"] = { field: "cardsTotal", goal: 50 };
	PROGRESS["cb_judge2"] = { field: "judgeHit", goal: 2 };
	PROGRESS["op_judge3"] = { field: "judgeHit", goal: 3 };
	PROGRESS["op_judge_all"] = { field: "judgeTotal", goal: 5 };
	PROGRESS["op_judge8"] = { field: "judgeTotal", goal: 8 };
	PROGRESS["op_kill2turn"] = { field: "killsTurnMax", goal: 2 };
	PROGRESS["cb_kill_turn3"] = { field: "killsTurnMax", goal: 3 };
	PROGRESS["cb_kill1"] = { field: "kills", goal: 1 };
	PROGRESS["ad_double_kill"] = { field: "kills", goal: 2 };
	PROGRESS["ad_no_hurt_kill"] = { field: "kills", goal: 2 };
	PROGRESS["ad_low_double"] = { field: "kills", goal: 2 };
	PROGRESS["md_versus_king"] = { field: "kills", goal: 2 };
	PROGRESS["cb_triple"] = { field: "kills", goal: 3 };
	PROGRESS["ad_one_vs_many"] = { field: "kills", goal: 3 };
	PROGRESS["md_butcher"] = { field: "kills", goal: 4 };
	PROGRESS["cb_kill5"] = { field: "kills", goal: 5 };
	PROGRESS["cb_double"] = { field: "killTurnsInRowMax", goal: 2 };
	PROGRESS["cb_skill_chain"] = { field: "skillChainMax", goal: 3 };
	PROGRESS["cb_dmg_chain"] = { field: "dmgTurnsInRowMax", goal: 4 };
	PROGRESS["cb_no_break"] = { field: "dmgTurnsInRowMax", goal: 5 };
	PROGRESS["cb_dmg6"] = { field: "dmgTurnsInRowMax", goal: 6 };
	PROGRESS["cb_skill2"] = { field: "skillTurnMax", goal: 2 };
	PROGRESS["cb_skill3turn"] = { field: "skillTurnMax", goal: 3 };
	PROGRESS["cb_hand_up"] = { field: "handUpMax", goal: 3 };
	PROGRESS["md_empty_three"] = { field: "emptyHandTurnsMax", goal: 2 };
	PROGRESS["ad_no_card3"] = { field: "emptyHandTurnsMax", goal: 3 };
	PROGRESS["cb_dodge2"] = { field: "dodgeStreakMax", goal: 2 };
	PROGRESS["op_dodge3"] = { field: "dodgeStreakMax", goal: 3 };
	PROGRESS["ad_near_death"] = { field: "nearDeath", goal: 1 };
	PROGRESS["ad_near_death2"] = { field: "rescued", goal: 2 };
	PROGRESS["op_veteran"] = { field: "turn", goal: 15 };
	PROGRESS["op_long_win"] = { field: "turn", goal: 20 };
	PROGRESS["op_marathon"] = { field: "turn", goal: 25 };
	PROGRESS["gen_main"] = { field: "charWins", goal: 20 };
	PROGRESS["gen_hundred_win"] = { field: "charWins", goal: 50 };
	PROGRESS["gen_twenty_chars"] = { field: "distinctWins", goal: 20 };
	PROGRESS["gen_hundred"] = { field: "distinctWins", goal: 50 };
	PROGRESS["md_fan_slayer"] = { field: "fanKills", goal: 1 };
	PROGRESS["md_loyal_blade"] = { field: "fanKills", goal: 2 };
	PROGRESS["gen_all_skills"] = { field: "skillMax", goal: 3 };
	PROGRESS["op_skill_master"] = { field: "skillMax", goal: 4 };
	PROGRESS["gen_niliu"] = { field: "niliuUses", goal: 3 };
	PROGRESS["cb_kinds3"] = { field: "skillKinds", goal: 3 };
	PROGRESS["cb_kinds4"] = { field: "skillKinds", goal: 4 };
	function progress(r, state) {
		state = state || load(); if(r.hero)return masteryProgress(r,state); var m = PROGRESS[r.id], done = !!state.got[r.id];
		var cumulative = m && (m.field === "charWins" || m.field === "distinctWins"), value = Number((state.progress || {})[r.id]) || 0;
		if (cumulative) { var wins = Object.keys(state.chars || {}).map(function(k){return Number(state.chars[k]) || 0;}); value = Math.max(value, m.field === "charWins" ? Math.max.apply(null,[0].concat(wins)) : wins.filter(function(n){return n>0;}).length); }
		return { value: done ? (m ? m.goal : 1) : Math.min(m ? m.goal : 1, value),
			target: m ? m.goal : 1, label: m ? (cumulative ? "累计进度" : "历史最佳") : "满足全部条件", done: done };
	}
	function updateProgress(o, a) {
		a.fanKills = a.killByRole.fan || 0; a.skillKinds = Object.keys(a.skillUseCount).length;
		a.skillMax = Math.max.apply(null, [0].concat(Object.keys(a.skillUseCount).map(function (k) { return a.skillUseCount[k]; })));
		a.niliuUses = Object.keys(a.skillUseCount).reduce(function (n, k) { return /niliu/.test(k) ? n + a.skillUseCount[k] : n; }, 0);
		o.progress = o.progress || {};
		RULES.forEach(function (r) { var m = PROGRESS[r.id]; if (m && (!r.modes.length || r.modes.indexOf(a.mode) >= 0)) o.progress[r.id] = Math.max(o.progress[r.id] || 0, Math.min(m.goal, Number(a[m.field]) || 0)); });
	}

	/* ============================================================
	   5. 存档（localStorage；保留历史最佳与已解锁记录）
	   ============================================================ */
	var memStore = null, storageError = "", runtimeLib = null;
	function blocked() {
		try {
			var shared = runtimeLib || root.lib;
			if (!shared && root.parent && root.parent !== root) shared = root.parent.lib;
			var wallet = shared && shared.cshWallet;
			if (wallet && wallet.saveGuard && typeof wallet.saveGuard.blocked === "function") return wallet.saveGuard.blocked();
			if (localStorage.getItem("csh_migrate_recovery") !== null) return true;
			var migrate = shared && shared.cshMigrate || root.CSH && root.CSH.migrate;
			if (!migrate && root.parent && root.parent !== root) migrate = root.parent.CSH && root.parent.CSH.migrate;
			var state = migrate && typeof migrate.recoveryState === "function" && migrate.recoveryState();
			return !!(state && (state.pending || state.busy));
		} catch (e) { return true; }
	}
	function load() {
		try {
			if (typeof localStorage === "undefined") return memStore || (memStore = { v: VER, got: {}, seen: {}, chars: {} });
			var raw = localStorage.getItem(KEY);
			if (!raw) { storageError = ""; return { v: VER, got: {}, seen: {}, chars: {}, progress: {} }; }
			var o = JSON.parse(raw);
			if (!o || typeof o !== "object" || Array.isArray(o)) throw Error("成就存档格式异常");
			o.got = o.got || {}; o.seen = o.seen || {}; o.chars = o.chars || {}; o.progress = o.progress || {}; storageError = "";
			return o;
		} catch (e) { storageError = "成就存档暂不可读，请重试"; return { v: VER, got: {}, seen: {}, chars: {}, progress: {} }; }
	}
	function save(o) {
		if (blocked() || storageError) return false;
		try { if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(o)); memStore = o; return true; }
		catch (e) { return false; }
	}
	function unlock(id, mode) {
		var o = load();
		var now = Date.now();
		if (o.got[id]) { o.got[id].n = (o.got[id].n || 1) + 1; }
		else { o.got[id] = { t: now, m: mode || "", n: 1 }; }
		return save(o) ? o.got[id] : null;
	}
	function claimState() {
		reconcile();
		var o = load();
		var got = 0, seen = 0, byRare = { 1: 0, 2: 0, 3: 0 };
		for (var i = 0; i < RULES.length; i++) {
			var id = RULES[i].id;
			if (o.got[id]) { got++; byRare[RULES[i].rare]++; if (o.seen[id]) seen++; }
		}
		return { got: got, total: RULES.length, seen: seen, byRare: byRare, unread: got - seen };
	}

	/* ------------------------------------------------------------
	   5b. 发奖对账（2026-10-20 · 防重复领取）
	   ------------------------------------------------------------
	   漏洞：成就页「重新开始」或单清 csh_pool_achv 会把 seen 抹掉，
	   已领过的奖励就能再领一遍（CBY/功勋无限刷）。
	   三层防线，任一命中即视为「已付」——只补 seen，不发钱：
	     ① 主存档 seen（原逻辑）；
	     ② 独立发奖台账 csh_pool_achv_pay：只增不删，页面级重置不清它。
	        （save.html 的「全部重置」会连同钱包/流水一起清——
	         那种情况经济已归零，重领不算刷，语义一致）；
	     ③ 钱包流水反推：扫 CSH.wallet.ledger 里 reason="池子成就/<名>"
	        的入账记录——台账也被误删时的兜底。
	   ------------------------------------------------------------ */
	var K_PAY = "csh_pool_achv_pay";
	var memPay = null;
	function loadPay() {
		try {
			if (typeof localStorage === "undefined") return memPay || (memPay = { v: 1, paid: {} });
			var raw = localStorage.getItem(K_PAY);
			if (!raw) return { v: 1, paid: {} };
			var o = JSON.parse(raw);
			if (!o || typeof o !== "object" || !o.paid || typeof o.paid !== "object") return { v: 1, paid: {} };
			return o;
		} catch (e) { return { v: 1, paid: {} }; }
	}
	function savePay(o) {
		if (blocked()) return;
		memPay = o;
		try {
			if (typeof localStorage !== "undefined") localStorage.setItem(K_PAY, JSON.stringify(o));
		} catch (e) {}
	}
	var _ruleNameMap = null;
	function ruleName(id) {
		if (!_ruleNameMap) {
			_ruleNameMap = {};
			for (var i = 0; i < RULES.length; i++) _ruleNameMap[RULES[i].id] = RULES[i].name;
		}
		return _ruleNameMap[id] || "";
	}
	/* 钱包流水里的「池子成就/<名>」入账 → 已付名单（结果缓存，recordPaid 后失效重扫） */
	var _walletPaidCache = null;
	function walletPaidNames() {
		if (_walletPaidCache) return _walletPaidCache;
		var names = {};
		try {
			var W = (runtimeLib && runtimeLib.cshWallet && runtimeLib.cshWallet.wallet) || (root.CSH && root.CSH.wallet);
			if (W && typeof W.ledger === "function") {
				var list = W.ledger({ kind: "in" });
				for (var i = 0; i < list.length; i++) {
					var r = String(list[i].r || "");
					if (r.indexOf("池子成就/") === 0) names[r.slice(5)] = 1;
				}
			}
		} catch (e) {}
		_walletPaidCache = names;
		return names;
	}
	/* 领取闸门：true=已付过（调用方补 seen、不发钱）；false=可以发钱 */
	function isPaid(id) {
		try { var w = (runtimeLib || root.lib) && (runtimeLib || root.lib).cshWallet; if (w && w.wallet.poolPending && w.wallet.poolPending(id)) return false; if (w && w.wallet.poolClaimed && w.wallet.poolClaimed(id)) return true; } catch (e) {}
		/* iframe 未加载钱包模块，仍须以钱包/官阶各自的持久收据对账。
		   只有池子币收据时留待补领功勋，不能把部分提交显示成已领取。 */
		try { if (typeof localStorage !== "undefined") {
			var durableWallet = JSON.parse(localStorage.getItem("csh_wallet") || "{}");
			if (durableWallet.poolClaims && durableWallet.poolClaims[id]) {
				var durableRank = JSON.parse(localStorage.getItem("csh_rank") || "{}");
				return !!(durableRank.poolClaims && Object.prototype.hasOwnProperty.call(durableRank.poolClaims,id));
			}
		} } catch (e) {}
		var o = load();
		if (o.seen[id]) return true;
		var p = loadPay();
		if (p.paid[id]) return true;
		var nm = ruleName(id);
		if (nm && walletPaidNames()[nm]) return true;
		return false;
	}
	/* 发钱成功后记账：写台账 + 补 seen + 流水缓存失效（下次重扫） */
	function recordPaid(id, pc, merit) {
		if (blocked()) return false;
		var p = loadPay();
		if (!p.paid[id] && !isPaid(id)) {
			p.paid[id] = { t: Date.now(), pc: Math.floor(Number(pc) || 0), merit: Math.floor(Number(merit) || 0) };
			savePay(p);
		}
		var o = load();
		if (o.got[id] && !o.seen[id]) { o.seen[id] = 1; save(o); }
		_walletPaidCache = null;
	}
	/* 对账自愈：台账/流水显示已付、但 seen 丢了的，补回 seen（不发钱）。
	   成就页加载时跑一次。返回补回条数。 */
	function reconcile() {
		var o = load(), p = loadPay(), wn = null, n = 0;
		for (var i = 0; i < RULES.length; i++) {
			var id = RULES[i].id;
			if (!o.got[id] || o.seen[id]) continue;
			if (!p.paid[id] && !isPaid(id)) {
				if (wn === null) wn = walletPaidNames();
				if (!wn[ruleName(id)]) continue;
			}
			o.seen[id] = 1; n++;
		}
		if (n) save(o);
		return n;
	}

	/* ============================================================
	   6. 引擎适配层（唯一耦合点）
	   ------------------------------------------------------------
	   host 由调用方注入，避免本文件 import 任何东西：
	     { game, lib, getMode(), getMe(), toast(), grant(rewards), log() }
	   宁可这层保守一点，也不要让成就去猜引擎细节。
	   ============================================================ */
	function install(host) {
		if (!host || !host.game || !host.lib) return false;
		var game = host.game, lib = host.lib, status = host.status || {}; runtimeLib = lib;
        function commitPoolResult(d,id){
            if(blocked())return {ok:false,reason:'成就存档暂不可写'};var st=load();if(storageError)return {ok:false,reason:storageError};
            st.results=Array.isArray(st.results)?st.results:[];if(st.results.indexOf(id)>=0)return {ok:true,already:true};
            if(!d||!d.chars||!d.mastery||!d.got||!d.progress)return {ok:false,reason:'成就结果无效'};
            Object.keys(d.chars).forEach(function(k){var n=d.chars[k];if(PROFILE_BY_ID[k]||k.indexOf('csh_')===0||k.length<=80)if(Number.isSafeInteger(n)&&n>=0&&n<=1)st.chars[k]=(Number(st.chars[k])||0)+n;});
            st.mastery=st.mastery||{};Object.keys(d.mastery).forEach(function(k){if(!PROFILE_BY_ID[k])return;var a=st.mastery[k]||(st.mastery[k]={totals:{},peaks:{}}),b=d.mastery[k];a.totals=a.totals||{};a.peaks=a.peaks||{};
                ['totals','peaks'].forEach(function(type){Object.keys(b[type]||{}).forEach(function(key){var n=b[type][key];if(Number.isSafeInteger(n)&&n>=0)a[type][key]=Math.min(1000000000,type==='totals'?(a[type][key]||0)+n:Math.max(a[type][key]||0,n));});});});
            Object.keys(d.got).forEach(function(k){if(RULES.some(function(r){return r.id===k;})&&!st.got[k])st.got[k]=d.got[k];});Object.keys(d.progress).forEach(function(k){var n=d.progress[k];if(Number.isFinite(n)&&n>=0)st.progress[k]=Math.max(st.progress[k]||0,n);});
            st.results=st.results.slice(-63).concat(id);return save(st)?{ok:true}:{ok:false,reason:'成就结果正在等待保存'};
        }
        if(lib.cshWallet&&lib.cshWallet.pending)lib.cshWallet.pending.register('pool',commitPoolResult);
        root.CSH_POOL_ACHV.live=function(id){if(!run||!allowed()||game.me!==run.owner||lib.cshWallet&&lib.cshWallet.saveEpoch()!==run.saveEpoch||(run.meChars||[]).indexOf(id)<0)return null;var p=PROFILE_BY_ID[id];if(!p)return null;return {ended:run.ended,steps:p.signature.requires.map(function(q,i){return {label:p.signature.description.split('，且')[i]||('条件'+(i+1)),current:masteryMetric(run,q[0]),target:q[1]};})};};

		if (lib.__cshPoolAchvInstalled) return true;
		        var masterySeen=new WeakMap(),skillRoots={},skillAfter={};
        var wantedSkills={};CHARACTER_PROFILES.forEach(function(p){p.paths.forEach(function(f){if(f.metric.indexOf('s:')===0)wantedSkills[f.metric.slice(2)]=1;});});
        Object.keys(wantedSkills).forEach(function(id){skillRoots[id]=id;skillAfter[id+'After']=id;});
        Object.keys(lib.skill||{}).forEach(function(id){Object.keys(wantedSkills).some(function(base){
            var info=lib.skill[id];if(id.indexOf(base+'_')!==0||!info||!info.content||/_(clear|cleanup|reset|mark|mod|count|used|limit|ai)$/.test(id))return false;
            skillRoots[id]=base;skillAfter[id+'After']=base;return true;
        });});
        function observedSkill(id,ev){
            if(!run||!ev||typeof ev!=='object')return;var base=skillRoots[id];if(!base)return;
            var actor=ev.player||(ev.event&&ev.event.player);if(actor&&actor!==game.me)return;
            var key=ev;if(ev.name===id&&ev.getParent)key=ev.getParent()||ev;
            var seen=masterySeen.get(key);if(!seen){seen={};masterySeen.set(key,seen);}if(seen[base])return;seen[base]=1;
            masteryFeed(run,{t:'mastery',seat:run.meSeat,metric:'s:'+base,num:1});
        }
        function publicMastery(){
            var me=game.me,values={'p:hand':me.countCards('h'),'p:armor':Number(me.hujia)||0,'p:maxhp':Number(me.maxHp)||0,'p:equip':me.countCards('e')};
            (run.meChars||[]).forEach(function(id){var p=PROFILE_BY_ID[id];if(!p)return;var keys=p.paths.map(function(f){return f.metric;}).concat(p.signature.requires.map(function(q){return q[0];}));
                keys.forEach(function(k){if(k.indexOf('p:storage.')===0)values[k]=Number((me.storage||{})[k.slice(10)])||0;else if(k.indexOf('p:mark.')===0)values[k]=me.countMark?me.countMark(k.slice(7)):0;else if(k==='p:stage.xiantu')values[k]=({taixi:0,lianqi:1,zhuji:2,zifu:3})[(me.storage||{}).csh_xiantu_stage]||0;});
            });return values;
        }
        function currentRun(){return !!(run&&!run.ended&&allowed()&&game.me===run.owner&&(!lib.cshWallet||typeof lib.cshWallet.saveEpoch!=='function'||lib.cshWallet.saveEpoch()===run.saveEpoch));}
        var seenResources=new WeakSet(), equipBefore=new WeakMap();
        function equippedCards(player){
            try { return player&&typeof player.getVCards==='function'?Array.prototype.slice.call(player.getVCards('e')):null; }
            catch(e){return null;}
        }
        function rememberEquip(ev){
            if(!ev||ev.player!==game.me||equipBefore.has(ev))return;
            var cards=equippedCards(game.me);if(cards)equipBefore.set(ev,{run:run,owner:game.me,cards:cards});
        }
        function completedEquip(ev){
            var before=equipBefore.get(ev);equipBefore.delete(ev);
            if(!before||before.run!==run||before.owner!==game.me||ev.cancelled||ev.isSkipped||ev.result&&ev.result.cancelled)return false;
            var after=equippedCards(game.me);if(!after)return false;
            var candidates=[ev.card].concat(ev.vcards||[]).filter(function(c){return c&&typeof c==='object';});
            return after.some(function(card){
                if(before.cards.indexOf(card)>=0)return false;
                return candidates.some(function(candidate){
                    if(candidate===card)return true;
                    if(candidate.cardSymbol&&candidate[candidate.cardSymbol]===card)return true;
                    return Array.isArray(card.cards)&&card.cards.indexOf(candidate)>=0;
                });
            });
        }
        function completedJudge(ev){
            if(!ev||ev.player!==game.me||seenResources.has(ev)||ev.cancelled||ev.isSkipped||!ev.result||ev.result.cancelled||!ev.result.card||typeof ev.result.card!=='object')return;
            seenResources.add(ev);pump({t:'judge',seat:seatOf(ev.player),hit:ev.result.bool===true});
        }
        function masteryEvent(ev,t){
            if(!ev||seenResources.has(ev)||ev.player!==game.me)return;
            if(t==='equipAfter'&&!completedEquip(ev))return;
            seenResources.add(ev);var metric='',n=0;
            if(t==='gainAfter'){metric='g:cards';n=(ev.cards||[]).length;}
            else if(t==='loseAfter'&&ev.type==='discard'){metric='l:discard';n=(ev.cards2||ev.cards||[]).length;}
            else if(t==='recoverEnd'){metric='r:recover';n=Number(ev.num)||0;}
            else if(t==='equipAfter'){metric='e:equip';n=1;}
            pump({t:'mastery',seat:run.meSeat,metric:metric,num:n});
        }

		var run = null, seenSkills = new WeakSet(), seenDeaths = new WeakSet(), seenDamage = new WeakSet(), seenCards = new WeakSet(), pendingHits = [], unsavedHits = [];
		var actorSeats = new WeakMap(), nextActorSeat = 1;
		// videoInited marks normal recording initialization in the host, not replay mode.
		function allowed() { return !status.cshAssistedMatch && !status.connectMode && !(lib.config && lib.config.connectMode) && !status.importingExtension && !status.video && !game.observe && !blocked(); }
		function seatOf(p) {
			if (!p) return -1;
			// Host seats can be zero at gameStart and can change during play. These IDs
			// belong only to this run's event accounting, and follow the player object.
			if (!actorSeats.has(p)) actorSeats.set(p, nextActorSeat++);
			return actorSeats.get(p);
		}
		function all() { return (game.players || []).concat(game.dead || []).filter(function (p, i, a) { return a.indexOf(p) === i; }); }
		function friends(p, q) {
			if (p === q) return true;
			if (run.mode === "identity") return (p.identity === "zhu" || p.identity === "zhong" || p.identity === "mingzhong") && (q.identity === "zhu" || q.identity === "zhong" || q.identity === "mingzhong") || p.identity === "fan" && q.identity === "fan";
			if (run.mode === "doudizhu") return (p === game.zhu) === (q === game.zhu);
			try { return !!p.isFriendOf(q); } catch (e) { return false; }
		}
		function scene() {
			var me = game.me, living = game.players || [], allies = 0, foes = 0, lostAllies = 0;
			all().forEach(function (p) { if (p === me) return; var alive = living.indexOf(p) >= 0;
				if (friends(me, p)) { if (!alive) lostAllies++; else allies++; }
				else if (alive) { foes++; if (p.hp >= p.maxHp && p.maxHp > 0) run.foeFullHpSeen = true; }
			});
			run.allyDead = lostAllies > 0 && allies === 0;
			run.allyGap = Math.max(run.allyGap, foes - (allies + 1));
		}
		function start() {
			var m; try { m = host.getMode ? host.getMode() : lib.config.mode; } catch (e) {}
			if (!MODES[m] || !allowed() || !game.me) { run = null; return; }
			var me = game.me, chars = [me.name1 || me.name, me.name2].filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i; });
			actorSeats = new WeakMap(); nextActorSeat = 1; all().forEach(seatOf);
			run = newRun({ mode: m, meSeat: seatOf(me), meIdentity: me.identity || "", meChars: chars, seatCount: all().length });
			run.resultId='pool-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);run.owner=me;run.saveEpoch=lib.cshWallet&&typeof lib.cshWallet.saveEpoch==='function'?lib.cshWallet.saveEpoch():null;masterySeen=new WeakMap();seenResources=new WeakSet();equipBefore=new WeakMap();
			run.hpNow = run.hpMin = me.hp; run.hpMax = me.maxHp; run.handMin = me.countCards("h");
			seenSkills = new WeakSet(); seenDeaths = new WeakSet(); seenDamage = new WeakSet(); seenCards = new WeakSet(); pendingHits = []; unsavedHits = []; scene();
		}
		function skills() {
			try { game.me.getAllHistory("useSkill").forEach(function (h) { if (!h || seenSkills.has(h)) return; seenSkills.add(h);
				if (h.skill && h.skill !== "csh_pool_achv_tap" && h.skill.indexOf("csh_pool_") !== 0) { observedSkill(h.sourceSkill&&skillRoots[h.sourceSkill]?h.sourceSkill:h.skill,h.event||h); feed(run, { t: "useSkill", seat: run.meSeat, skill: h.skill, masteryObserved:true }); }
			}); } catch (e) {}
		}
        function pump(ev, chars) {
            if (!currentRun()) return;
            run.round=Math.max(run.round,Number(game.roundNumber)||1);skills();scene();ev.publicState=publicMastery();feed(run,ev);
            var st=load(),before=JSON.parse(JSON.stringify(st));if(chars)st.chars=chars;prepareMastery(st,run);
            var hit=unsavedHits.concat(judge(run,ev)).filter(function(r,i,all){return all.findIndex(function(v){return v.id===r.id;})===i;}),fresh=[];updateProgress(st,run);
            hit.forEach(function(r){if(st.got[r.id])return;st.got[r.id]={t:Date.now(),m:run.mode,n:1};fresh.push(r);});
            var written;
            if(ev.t==='over'&&lib.cshWallet&&lib.cshWallet.pending){var delta={chars:{},mastery:{},got:{},progress:st.progress||{}};
                run.meChars.forEach(function(id){delta.chars[id]=Math.max(0,(st.chars[id]||0)-((before.chars||{})[id]||0));var a=(st.mastery||{})[id],b=(before.mastery||{})[id]||{};if(a){delta.mastery[id]={totals:{},peaks:a.peaks||{}};Object.keys(a.totals||{}).forEach(function(k){delta.mastery[id].totals[k]=Math.max(0,a.totals[k]-((b.totals||{})[k]||0));});}});
                Object.keys(st.got).forEach(function(id){if(!(before.got||{})[id])delta.got[id]=st.got[id];});var result=lib.cshWallet.pending.put('pool',run.resultId,delta);written=result.ok;
                if(!written&&lib.cshUI)lib.cshUI.toast(result.durable?'成就结果已保留，恢复存储后自动补记':'成就结果暂未写入本机，请保持页面打开并恢复存储');
            }else written=save(st);
            if(written){acceptMastery(run);unsavedHits=[];hit.forEach(function(r){if(run.unlocked.indexOf(r.id)<0)run.unlocked.push(r.id);});pendingHits=pendingHits.concat(fresh);if(pendingHits.length&&host.onUnlock){try{host.onUnlock(pendingHits.slice(),run);pendingHits=[];}catch(noticeError){if(host.log)host.log("成就反馈暂未显示");}}}else unsavedHits=hit;
        }
		function cardEvent(ev, respond) { if (!ev || !ev.player || seenCards.has(ev)) return; seenCards.add(ev);
			pump({t:"useCard",seat:seatOf(ev.player),name:ev.card && ev.card.name,cardType:host.get&&host.get.type2?host.get.type2(ev.card):ev.card&&ev.card.type,targets:(ev.targets||[]).length,handAfter:ev.player.countCards("h"),before:(ev.cards||[]).length,respond:respond});
		}
		function damageEvent(ev) { if (!ev || !ev.player || seenDamage.has(ev)) return; seenDamage.add(ev);
			pump({t:"damage",seat:seatOf(ev.source),victimSeat:seatOf(ev.player),num:ev.num||0,cardName:ev.card&&ev.card.name,natures:Array.isArray(ev.nature)?ev.nature:typeof ev.nature==='string'?ev.nature.split(/[|,]/):[],bySkill:!!ev.skill || !!(ev.getParent && ev.getParent().skill)});
		}

		function death(ev) { if (!ev || !ev.player || seenDeaths.has(ev)) return;
			seenDeaths.add(ev); pump({t:"die",seat:seatOf(ev.source),victimSeat:seatOf(ev.player),victimRole:ev.player.identity || ""});
		}

		var taps = ["gameStart", "phaseBefore", "phaseAfter", "useCardAfter", "respondAfter", "useSkill", "logSkillBegin", "damageEnd", "die", "dieAfter", "judgeEnd", "changeHp", "gainAfter", "loseAfter", "recoverEnd", "equipBefore", "equipAfter", "changeHujiaAfter", "chooseToCompareAfter", "chooseToCompareMultipleAfter", "chooseToCompareMeanwhileAfter", "useSkillAfter"].concat(Object.keys(skillAfter));
		lib.skill.csh_pool_achv_tap = {
			trigger: { global: taps }, forced: true, silent: true, popup: false, forceDie: true, priority: -100, _priority: -10000,
			filter: function (ev, p, name) { return p === game.me && allowed() && (name === "gameStart" || currentRun()); },
			async content(event, trigger) {
				try {
					var t = event.triggername, p = trigger.player;
					if (t === "gameStart") { start(); return; }
					if (!currentRun()) return;
                    if(skillAfter[t]&&p===game.me){observedSkill(t.slice(0,-5),trigger);pump({t:'mastery',seat:run.meSeat});return;}
                    if(t==='useSkillAfter'&&p===game.me){observedSkill(trigger.skill,trigger);pump({t:'mastery',seat:run.meSeat});return;}
                    if(t==='equipBefore'){rememberEquip(trigger);return;}
                    if(['gainAfter','loseAfter','recoverEnd','equipAfter'].indexOf(t)>=0){masteryEvent(trigger,t);return;}
                    if(t==='changeHujiaAfter'){pump({t:'mastery',seat:seatOf(p)});return;}
                    if(['chooseToCompareAfter','chooseToCompareMultipleAfter','chooseToCompareMeanwhileAfter'].indexOf(t)>=0){if((p===game.me||trigger.target===game.me||(trigger.targets||[]).indexOf(game.me)>=0)&&trigger.card1&&!(trigger.result&&trigger.result.cancelled)&&!seenResources.has(trigger)){seenResources.add(trigger);pump({t:'mastery',seat:run.meSeat,metric:'q:compare',num:1});}return;}
					if (t === "phaseBefore" || t === "phaseAfter") { pump({ t: "turn", seat: seatOf(p), end: t === "phaseAfter", hand: p === game.me ? p.countCards("h") : undefined }); return; }
					if (t === "useCardAfter" || t === "respondAfter") { cardEvent(trigger, t === "respondAfter"); return; }
					if (t === "damageEnd") { damageEvent(trigger); return; }
					if (t === "die" || t === "dieAfter") { death(trigger); return; }
					if (t === "judgeEnd") { completedJudge(trigger); return; }
					if (t === "changeHp") {
                        var recovery=trigger.getParent&&trigger.getParent('recover');
                        if(p===game.me&&trigger.num>0&&recovery&&recovery.name==='recover'&&!seenResources.has(recovery)){seenResources.add(recovery);masteryFeed(run,{t:'mastery',seat:run.meSeat,metric:'r:recover',num:trigger.num});}
                        pump({ t: "hp", seat: seatOf(p), hp: p.hp, maxHp: p.maxHp }); return; }
					skills();
				} catch (e) { if (host.log) host.log("事件采集失败：" + e); }
			},
		};
		if (game.addGlobalSkill) game.addGlobalSkill("csh_pool_achv_tap");
		var orig = game.over;
		if (typeof orig === "function") game.over = function () {
			try {
				if (currentRun()) {
					/* 模式 dieAfter 可在 die 触发前调用 over；补采当前已确认死亡事件。 */
					var current = status.event;
					function ancestor(name) { return current && (current.name === name ? current : current.getParent && current.getParent(name)); }
					var card = ancestor("useCard"), damage = ancestor("damage");
					if (card && card.name === "useCard") cardEvent(card,false);
					if (damage && damage.name === "damage" && (damage.num || 0) > 0) damageEvent(damage);
					var dyingEvent = status.event;
					if (dyingEvent && dyingEvent.name !== "die" && dyingEvent.getParent) dyingEvent = dyingEvent.getParent("die");
					if (dyingEvent && dyingEvent.name === "die" && (game.dead || []).indexOf(dyingEvent.player) >= 0) death(dyingEvent);
					var winner = arguments[0], me = game.me, win = winner === true || winner === me || Array.isArray(winner) && winner.indexOf(me) >= 0;
					var st = load(), chars = Object.assign({}, st.chars);
					if (win) run.meChars.forEach(function (n) { chars[n] = (chars[n] || 0) + 1; });
					run.charWins = Math.max.apply(null, [0].concat(run.meChars.map(function (n) { return chars[n] || 0; })));
					run.distinctWins = Object.keys(chars).filter(function (n) { return chars[n] > 0; }).length;
					var ident = {}; all().forEach(function (p) { ident[seatOf(p)] = p.identity || ""; });
					pump({ t: "over", win: win, survivors: (game.players || []).length, ident: ident, landlordSeat: game.zhu ? seatOf(game.zhu) : null, hand: me.countCards("h") }, chars);
					run.ended = true;
					if (pendingHits.length && host.onUnlock) host.onUnlock(pendingHits, run);
					pendingHits = [];
				}
			} catch (e) { if (host.log) host.log("结算记录失败：" + e); }
			return orig.apply(this, arguments);
		};
		lib.__cshPoolAchvInstalled = true;
		return true;
	}

	/* ============================================================
	   7. 自检（探针直接用；也供页面"成就系统自检"按钮）
	   ============================================================ */
	function selfTest() {
		var errs = [];
		var seen = {};
		for (var i = 0; i < RULES.length; i++) {
			var r = RULES[i];
			if (seen[r.id]) errs.push("重复 id：" + r.id);
			seen[r.id] = 1;
			if (["操作", "连击", "逆境", "模式", "武将", "专属"].indexOf(r.cat) < 0) errs.push(r.id + " 分类非法：" + r.cat);
			if ([1, 2, 3].indexOf(r.rare) < 0) errs.push(r.id + " 稀有度非法");
			if (!r.desc) errs.push(r.id + " 缺 desc");
			if (!r.on || !r.on.length) errs.push(r.id + " 缺 on");
			for (var j = 0; j < (r.on || []).length; j++) if (!_EVENTS[r.on[j]]) errs.push(r.id + " 事件越界：" + r.on[j]);
			if (typeof r.test !== "function") errs.push(r.id + " 缺 test");
			for (var m = 0; m < (r.modes || []).length; m++) if (!MODES[r.modes[m]]) errs.push(r.id + " 模式越界：" + r.modes[m]);
		}
		return { ok: errs.length === 0, errors: errs, total: RULES.length };
	}

	root.CSH_POOL_ACHV = {
		VER: VER, KEY: KEY, MODES: MODES, EVENTS: _EVENTS,
		RULES: RULES, INDEX: INDEX, PROFILES: CHARACTER_PROFILES, HERO_INDEX:HERO_INDEX, prepareMastery:prepareMastery, acceptMastery:acceptMastery,
		newRun: newRun, feed: feed, judge: judge, install: install, progress: progress, updateProgress: updateProgress,
		reward: function (r) { return [{pc:0,merit:0},{pc:500,merit:5},{pc:1500,merit:15},{pc:5000,merit:40}][r.rare]; },
		load: load, save: save, unlock: unlock, claimState: claimState, storageError: function () { return storageError; },
		PAY_KEY: K_PAY, isPaid: isPaid, recordPaid: recordPaid, reconcile: reconcile,
		selfTest: selfTest,
	};
})(typeof window !== "undefined" ? window : globalThis);
