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
     4. **不做万能 Hook**：只认 _EVENTS 里那 8 个事件，别的事件不接。
     5. **零 import**：本文件被 extension.js 与成就页双载，靠 window 幂等。
   ============================================================ */
(function (root) {
	if (!root) return;
	if (root.CSH_POOL_ACHV) return;                 /* 幂等：重复引入直接返回 */

	var KEY = "csh_pool_achv";                      /* localStorage 存档键（须登记 csh_migrate） */
	var VER = 2;
	var MODES = { identity: 1, doudizhu: 1, versus: 1 };   /* 白名单：身份 / 斗地主 / 对决 */

	/* 事件白名单。改动这里等于改动"成就系统能看到什么"，必须同步门禁 E52。 */
	var _EVENTS = { turn: 1, useCard: 1, useSkill: 1, damage: 1, die: 1, judge: 1, hp: 1, over: 1 };

	/* ============================================================
	   1. 规则表（80 条）
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

	/* 索引：事件 → 规则（只跑相关规则，别让每次事件都扫全表） */
	var INDEX = {};
	for (var i = 0; i < RULES.length; i++) {
		var r = RULES[i];
		for (var j = 0; j < r.on.length; j++) {
			var k = r.on[j];
			(INDEX[k] = INDEX[k] || []).push(r);
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
			mode: meta.mode || "", round: 0,
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
		var list = INDEX[ev.t];
		if (!list) return out;
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
		state = state || load(); var m = PROGRESS[r.id], done = !!state.got[r.id];
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
		if (lib.__cshPoolAchvInstalled) return true;
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
			run.hpNow = run.hpMin = me.hp; run.hpMax = me.maxHp; run.handMin = me.countCards("h");
			seenSkills = new WeakSet(); seenDeaths = new WeakSet(); seenDamage = new WeakSet(); seenCards = new WeakSet(); pendingHits = []; unsavedHits = []; scene();
		}
		function skills() {
			try { game.me.getAllHistory("useSkill").forEach(function (h) { if (!h || seenSkills.has(h)) return; seenSkills.add(h);
				if (h.skill && h.skill !== "csh_pool_achv_tap" && h.skill.indexOf("csh_pool_") !== 0) feed(run, { t: "useSkill", seat: run.meSeat, skill: h.skill });
			}); } catch (e) {}
		}
		function pump(ev, chars) {
			if (!run || !allowed() || run.ended) return;
			run.round = Math.max(run.round, Number(game.roundNumber) || 1); skills(); scene(); feed(run, ev);
			var hit = unsavedHits.concat(judge(run, ev)).filter(function(r,i,all){return all.findIndex(function(v){return v.id===r.id;})===i;}), st = load(); if (chars) st.chars = chars; updateProgress(st, run); var fresh = [];
			hit.forEach(function (r) { if (st.got[r.id]) return; st.got[r.id] = { t: Date.now(), m: run.mode, n: 1 }; fresh.push(r); });
			if (save(st)) { unsavedHits = []; hit.forEach(function (r) { if (run.unlocked.indexOf(r.id) < 0) run.unlocked.push(r.id); }); pendingHits = pendingHits.concat(fresh); }
			else unsavedHits = hit;
		}
		function cardEvent(ev, respond) { if (!ev || !ev.player || seenCards.has(ev)) return; seenCards.add(ev);
			pump({t:"useCard",seat:seatOf(ev.player),name:ev.card && ev.card.name,targets:(ev.targets||[]).length,handAfter:ev.player.countCards("h"),before:(ev.cards||[]).length,respond:respond});
		}
		function damageEvent(ev) { if (!ev || !ev.player || seenDamage.has(ev)) return; seenDamage.add(ev);
			pump({t:"damage",seat:seatOf(ev.source),victimSeat:seatOf(ev.player),num:ev.num||0,bySkill:!!ev.skill || !!(ev.getParent && ev.getParent().skill)});
		}

		function death(ev) { if (!ev || !ev.player || seenDeaths.has(ev)) return;
			seenDeaths.add(ev); pump({t:"die",seat:seatOf(ev.source),victimSeat:seatOf(ev.player),victimRole:ev.player.identity || ""});
		}

		var taps = ["gameStart", "phaseBefore", "phaseAfter", "useCardAfter", "respondAfter", "useSkill", "logSkillBegin", "damageEnd", "die", "dieAfter", "judgeEnd", "changeHp"];
		lib.skill.csh_pool_achv_tap = {
			trigger: { global: taps }, forced: true, silent: true, popup: false, forceDie: true, priority: -100, _priority: -10000,
			filter: function (ev, p, name) { return p === game.me && allowed() && (name === "gameStart" || !!run && !run.ended); },
			async content(event, trigger) {
				try {
					var t = event.triggername, p = trigger.player;
					if (t === "gameStart") { start(); return; }
					if (!run) return;
					if (t === "phaseBefore" || t === "phaseAfter") { pump({ t: "turn", seat: seatOf(p), end: t === "phaseAfter", hand: p === game.me ? p.countCards("h") : undefined }); return; }
					if (t === "useCardAfter" || t === "respondAfter") { cardEvent(trigger, t === "respondAfter"); return; }
					if (t === "damageEnd") { damageEvent(trigger); return; }
					if (t === "die" || t === "dieAfter") { death(trigger); return; }
					if (t === "judgeEnd") { pump({ t: "judge", seat: seatOf(p), hit: !!(trigger.result && trigger.result.bool) }); return; }
					if (t === "changeHp") { pump({ t: "hp", seat: seatOf(p), hp: p.hp, maxHp: p.maxHp }); return; }
					skills();
				} catch (e) { if (host.log) host.log("事件采集失败：" + e); }
			},
		};
		if (game.addGlobalSkill) game.addGlobalSkill("csh_pool_achv_tap");
		var orig = game.over;
		if (typeof orig === "function") game.over = function () {
			try {
				if (run && !run.ended && allowed()) {
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
			if (["操作", "连击", "逆境", "模式", "武将"].indexOf(r.cat) < 0) errs.push(r.id + " 分类非法：" + r.cat);
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
		RULES: RULES, INDEX: INDEX,
		newRun: newRun, feed: feed, judge: judge, install: install, progress: progress, updateProgress: updateProgress,
		reward: function (r) { return [{pc:0,merit:0},{pc:500,merit:5},{pc:1500,merit:15},{pc:5000,merit:40}][r.rare]; },
		load: load, save: save, unlock: unlock, claimState: claimState, storageError: function () { return storageError; },
		PAY_KEY: K_PAY, isPaid: isPaid, recordPaid: recordPaid, reconcile: reconcile,
		selfTest: selfTest,
	};
})(typeof window !== "undefined" ? window : globalThis);
