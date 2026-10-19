/* ============================================================
   池子魔将 · 池子成就（操作型成就引擎 · v1 · 2026-10-20）
   ------------------------------------------------------------
   定位：生涯成就（core/csh_achv.js，434 条）回答「你积累了多少」，
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
	var VER = 1;
	var MODES = { identity: 1, doudizhu: 1, versus: 1 };   /* 白名单：身份 / 斗地主 / 对决 */

	/* 事件白名单。改动这里等于改动"成就系统能看到什么"，必须同步门禁 E52。 */
	var _EVENTS = { turn: 1, useCard: 1, useSkill: 1, damage: 1, die: 1, judge: 1, hp: 1, over: 1 };

	/* ============================================================
	   1. 规则表（40 条）
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
			test: function (c) { return c.name === "闪" && c.handAfter === 0; } },
		{ id: "op_dodge3", name: "铁壁", cat: "操作", rare: 1, modes: [], on: ["over"],
			desc: "单局连续闪避 3 次",
			test: function (c, a) { return a.dodgeStreakMax >= 3; } },
		{ id: "op_back_full", name: "逆流而上", cat: "操作", rare: 2, modes: [], on: ["over"],
			desc: "单局从 1 点体力回到满体力",
			test: function (c, a) { return a.hpMin === 1 && a.hpNow >= a.hpMax && a.hpMax > 1; } },
		{ id: "op_kill2turn", name: "斩草除根", cat: "操作", rare: 3, modes: [], on: ["die"],
			desc: "同一回合内击破 2 名角色",
			test: function (c, a) { return a.killsTurn >= 2; } },
		{ id: "op_long_win", name: "长驱直入", cat: "操作", rare: 1, modes: [], on: ["over"],
			desc: "打满 20 回合以上并获胜",
			test: function (c, a) { return c.win && a.turn >= 20; } },

		/* ---------- 连击 8 ---------- */
		{ id: "cb_double", name: "双杀", cat: "连击", rare: 2, modes: [], on: ["die"],
			desc: "连续两个回合都有击破",
			test: function (c, a) { return a.killTurnsInRow >= 2; } },
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
			test: function (c, a) { return c.win && a.allyDead && a.survivors <= 2; } },
		{ id: "ad_one_card", name: "背水一战", cat: "逆境", rare: 1, modes: [], on: ["over"],
			desc: "获胜时手牌不超过 1 张",
			test: function (c, a) { return c.win && a.handAtWin <= 1; } },
		{ id: "ad_near_death2", name: "死里逃生", cat: "逆境", rare: 3, modes: [], on: ["over"],
			desc: "单局两次从濒死状态恢复",
			test: function (c, a) { return a.nearDeath >= 2; } },
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
			test: function (c, a) { return c.win && a.turn <= 1; } },
		{ id: "md_three_round", name: "三回合", cat: "模式", rare: 3, modes: ["versus"], on: ["over"],
			desc: "对决模式 3 轮内获胜",
			test: function (c, a) { return c.win && a.turn <= 3; } },

		/* ---------- 武将 4 ---------- */
		{ id: "gen_main", name: "本命", cat: "武将", rare: 2, modes: [], on: ["over"],
			desc: "用同一名武将累计获胜 20 次", hint: "跨对局累计，不需要一局打完",
			test: function (c, a) { return c.win && a.charWins >= 20; } },
		{ id: "gen_hundred", name: "百将", cat: "武将", rare: 3, modes: [], on: ["over"],
			desc: "用 50 名不同武将各赢过至少 1 局", hint: "跨对局累计",
			test: function (c, a) { return c.win && a.distinctWins >= 50; } },
		{ id: "gen_all_skills", name: "熟极而流", cat: "武将", rare: 2, modes: [], on: ["over"],
			/* 原条件是「把武将技能全发动一遍」—— 锁定技/触发技根本不会走 useSkill，
			   那条永远达不成。改成「同一个技能单局发动 3 次」，可达成且有意义。 */
			desc: "同一个技能单局发动 3 次",
			test: function (c, a) {
				var m = 0, k;
				for (k in (a.skillUseCount || {})) if (a.skillUseCount[k] > m) m = a.skillUseCount[k];
				return m >= 3;
			} },
		{ id: "gen_niliu", name: "逆流", cat: "武将", rare: 3, modes: [], on: ["over"],
			desc: "单局把「逆流」类技能触发 3 次以上",
			test: function (c, a) { return (a.skillUseCount["niliu"] || 0) >= 3; } },

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
			mode: meta.mode || "",
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
			hurt: 0, hpMax: 0, hpNow: 0, hpMin: 99, nearDeath: 0,
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

	function bumpTurn(a) {
		/* 回合边界：把"本回合量"结算进 Max，再清零 */
		if (a.cardsTurn > a.cardsTurnMax) a.cardsTurnMax = a.cardsTurn;
		if (a.dmgTurn > a.dmgTurnMax) a.dmgTurnMax = a.dmgTurn;
		if (a.skillTurn > a.skillTurnMax) a.skillTurnMax = a.skillTurn;
		if (a.killsTurn > a.killsTurnMax) a.killsTurnMax = a.killsTurn;
		if (a.emptyHandTurns > a.emptyHandTurnsMax) a.emptyHandTurnsMax = a.emptyHandTurns;
		if (a.handUp > a.handUpMax) a.handUpMax = a.handUp;
		/* 连续回合类：本回合有没有发生 */
		if (a.killsTurn > 0) a.killTurnsInRow++; else a.killTurnsInRow = 0;
		if (a.killTurnsInRow > a.killTurnsInRowMax) a.killTurnsInRowMax = a.killTurnsInRow;
		if (a.dmgTurn > 0) a.dmgTurnsInRow++; else a.dmgTurnsInRow = 0;
		if (a.dmgTurnsInRow > a.dmgTurnsInRowMax) a.dmgTurnsInRowMax = a.dmgTurnsInRow;
		if (a.skillTurn > 0) a.skillChain++; else a.skillChain = 0;
		if (a.skillChain > a.skillChainMax) a.skillChainMax = a.skillChain;
		a.cardsTurn = 0; a.dmgTurn = 0; a.skillTurn = 0; a.killsTurn = 0;
		a.emptyHandTurns = 0; a.handUp = 0;
		a.turn++;
	}

	/* ============================================================
	   3. 事件喂入（只累加，不判定）
	   ------------------------------------------------------------
	   ev 是**归一化后**的事件，宿主负责把引擎事件翻译成这个形状：
	     { t:"turn",  seat }                                    我的回合开始
	     { t:"useCard", seat, name, targets, handAfter, before }
	     { t:"useSkill", seat, skill }
	     { t:"damage", seat, victimSeat, num, bySkill }
	     { t:"die", seat, victimSeat, bySkill, victimRole }
	     { t:"judge", seat, hit }
	     { t:"hp", seat, hp, maxHp }
	     { t:"over", win, turns, survivors, ident, landlordSeat }
	   ============================================================ */
	function feed(a, ev) {
		if (!a || !ev) return;
		switch (ev.t) {
			case "turn":
				/* 【2026-10-20 修】原来只在"我的回合"才推进 ⇒ a.turn 实际是"我行动过几次"，
				   一局通常 5~10 次，「打满 20 回合」永远达不成。回合是全场节拍，谁开始都算。 */
				bumpTurn(a);
				break;
			case "useCard":
				if (ev.seat === a.meSeat) {
					a.cardsTurn++;
					a.cardsTotal = (a.cardsTotal || 0) + 1;
					a.played[ev.name] = 1;
					if (typeof ev.handAfter === "number") {
						a.lastHandEnd = ev.handAfter;
						if (ev.handAfter < a.handMin) a.handMin = ev.handAfter;
						if (ev.handAfter === 0) a.emptyHandTurns++;
						if (a.lastHandPrev != null && ev.handAfter > a.lastHandPrev) a.handUp++;
						a.lastHandPrev = ev.handAfter;
					}
				}
				a.playsBySeat[ev.seat] = (a.playsBySeat[ev.seat] || 0) + 1;
				break;
			case "useSkill":
				if (ev.seat === a.meSeat) {
					a.skillTurn++;
					a.skillUseCount[ev.skill] = (a.skillUseCount[ev.skill] || 0) + 1;
				}
				break;
			case "damage":
				if (ev.victimSeat === a.meSeat) {
					a.hurt += ev.num || 0;
					var left = a.hpNow - (ev.num || 0);
					if (left <= 0 && a.hpNow > 0) a.nearDeath++;
				}
				if (ev.seat === a.meSeat) {
					a.dmgTurn += ev.num || 0;
					if ((ev.num || 0) > a.dmgMax) a.dmgMax = ev.num;
				}
				/* 记下"这一下是不是技能造成的"，供「收网」在 die 时回读 */
				if (!a.lastDmgBySkill) a.lastDmgBySkill = {};
				a.lastDmgBySkill[ev.victimSeat] = !!ev.bySkill;
				break;
			case "die":
				if (ev.seat === a.meSeat && ev.victimSeat !== a.meSeat) {
					a.kills++;
					a.killsTurn++;
					if (ev.victimRole) a.killByRole[ev.victimRole] = (a.killByRole[ev.victimRole] || 0) + 1;
				}
				break;
			case "judge":
				a.judgeTotal++;
				if (ev.hit) a.judgeHit++;
				break;
			case "hp":
				if (ev.seat === a.meSeat) {
					a.hpNow = ev.hp;
					if (ev.maxHp && (!a.hpMax || ev.maxHp > a.hpMax)) a.hpMax = ev.maxHp;
					if (ev.hp < a.hpMin) a.hpMin = ev.hp;
					if (ev.hp === 0 && a.hpMin > 0) a.nearDeath++;
				}
				break;
			default:
				break;
		}
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

	/* ============================================================
	   5. 存档（localStorage；只在解锁时写）
	   ============================================================ */
	var memStore = null;
	function load() {
		try {
			if (typeof localStorage === "undefined") return memStore || (memStore = { v: VER, got: {}, seen: {}, chars: {} });
			var raw = localStorage.getItem(KEY);
			if (!raw) return { v: VER, got: {}, seen: {}, chars: {} };
			var o = JSON.parse(raw);
			if (!o || typeof o !== "object") return { v: VER, got: {}, seen: {}, chars: {} };
			o.got = o.got || {}; o.seen = o.seen || {}; o.chars = o.chars || {};
			return o;
		} catch (e) { return { v: VER, got: {}, seen: {}, chars: {} }; }
	}
	function save(o) {
		memStore = o;
		try {
			if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(o));
		} catch (e) {}
	}
	function unlock(id, mode) {
		var o = load();
		var now = Date.now();
		if (o.got[id]) { o.got[id].n = (o.got[id].n || 1) + 1; }
		else { o.got[id] = { t: now, m: mode || "", n: 1 }; }
		save(o);
		return o.got[id];
	}
	function claimState() {
		var o = load();
		var got = 0, seen = 0, byRare = { 1: 0, 2: 0, 3: 0 };
		for (var i = 0; i < RULES.length; i++) {
			var id = RULES[i].id;
			if (o.got[id]) { got++; byRare[RULES[i].rare]++; if (o.seen[id]) seen++; }
		}
		return { got: got, total: RULES.length, seen: seen, byRare: byRare, unread: got - seen };
	}

	/* ============================================================
	   6. 引擎适配层（唯一耦合点）
	   ------------------------------------------------------------
	   host 由调用方注入，避免本文件 import 任何东西：
	     { game, lib, getMode(), getMe(), toast(), grant(rewards), log() }
	   宁可这层保守一点，也不要让成就去猜引擎细节。
	   ============================================================ */
	function install(host) {
		try {
			if (!host || !host.game || !host.lib) return false;
			var game = host.game, lib = host.lib;
			if (lib.__cshPoolAchvInstalled) return true;
			lib.__cshPoolAchvInstalled = true;

			var run = null;
			function mode() {
				try { return String((lib.config && lib.config.mode) || ""); } catch (e) { return ""; }
			}
			function allowed() {
				/* 联机 / 旁观 / 调试局 / 导入过程 一律不计 */
				try {
					if (lib.config && lib.config.connectMode) return false;
					if (lib.config && lib.config.dev) return false;
					if (typeof _status !== "undefined" && (_status.importingExtension || _status.videoInited)) return false;
					if (typeof game !== "undefined" && game.observe) return false;
				} catch (e) {}
				return true;
			}
			function active() {
				return run && allowed() && MODES[run.mode] === 1;
			}

			/* 事件翻译：引擎 → 归一化事件（拿不准的字段一律给安全默认值） */
			function onGameStart() {
				var m = mode();
				if (!MODES[m] || !allowed()) { run = null; return; }
				var me = null;
				try { me = game.me || (game.players && game.players[0]); } catch (e) {}
				run = newRun({
					mode: m,
					meSeat: me && typeof me.seatNum === "number" ? me.seatNum : -1,
					meIdentity: (me && me.identity) || "",
					meChars: me && me.name ? [String(me.name)] : [],
					seatCount: (game.players && game.players.length) || 0,
				});
				try {
					run.hpNow = me ? me.hp : 0;
					run.hpMax = me ? me.maxHp : 0;
					run.hpMin = me ? me.hp : 99;
				} catch (e2) {}
			}
			function seatOf(p) {
				try { return p && typeof p.seatNum === "number" ? p.seatNum : -1; } catch (e) { return -1; }
			}
			function pump(ev) {
				if (!active()) return;
				feed(run, ev);
				var hit = judge(run, ev);
				if (!hit.length) return;
				for (var i = 0; i < hit.length; i++) {
					run.unlocked.push(hit[i].id);
					unlock(hit[i].id, run.mode);
				}
				try { host.onUnlock && host.onUnlock(hit, run); } catch (e) {}
			}

			/* 全局技：只挂白名单里的引擎事件，全部 silent，不影响牌局 */
			var SKILL = "csh_pool_achv_tap";
			lib.skill[SKILL] = {
				trigger: {
					global: ["gameStart"],
					player: ["phaseUseBegin", "useCard", "useSkill", "damageEnd", "die", "judgeEnd", "changeHp"],
				},
				forced: true,
				silent: true,
				popup: false,
				priority: 100,
				filter: function () { return active(); },
				content: function () {
					try {
						var t = trigger.name;
						if (t === "gameStart") { onGameStart(); return; }
						if (t === "phaseUseBegin") { pump({ t: "turn", seat: seatOf(player) }); return; }
						if (t === "useCard") {
							pump({
								t: "useCard", seat: seatOf(player), name: trigger.card && trigger.card.name,
								targets: (trigger.targets && trigger.targets.length) || 0,
								handAfter: player ? player.countCards("h") : 0,
								before: (trigger.card && trigger.card.cards && trigger.card.cards.length) || 0,
							});
							return;
						}
						if (t === "useSkill") { pump({ t: "useSkill", seat: seatOf(player), skill: trigger.skill }); return; }
						if (t === "damageEnd") {
							pump({
								t: "damage", seat: seatOf(trigger.source), victimSeat: seatOf(player),
								num: trigger.num || 0, bySkill: !!trigger.skill,
							});
							return;
						}
						if (t === "die") {
							/* die 事件的 player 是**死者**，击杀者要从 trigger.source 取；
							   引擎没给 source 时（毒/判定致死等）不记在任何人头上。 */
							pump({
								t: "die", seat: seatOf(trigger.source), victimSeat: seatOf(player),
								bySkill: false, victimRole: (player && player.identity) || "",
							});
							return;
						}
						if (t === "judgeEnd") { pump({ t: "judge", seat: seatOf(player), hit: !!trigger.result }); return; }
						if (t === "changeHp") {
							pump({ t: "hp", seat: seatOf(player), hp: player.hp, maxHp: player.maxHp });
							return;
						}
					} catch (e) { try { host.log && host.log("feed 异常：" + e); } catch (e2) {} }
				},
			};
			if (game.addGlobalSkill) game.addGlobalSkill(SKILL);

			/* 结算：包 game.over（与 csh_bossrecord 同一先例）。
			   ★ 包装体里不引用闭包变量，防联机序列化带走 —— 所以先取局部引用。 */
			var orig = game.over;
			if (typeof orig === "function" && !orig.__cshPoolAchv) {
				var wrapped = function () {
					try { window.__cshPoolAchvOver && window.__cshPoolAchvOver(arguments[0]); } catch (e) {}
					return orig.apply(this, arguments);
				};
				wrapped.__cshPoolAchv = true;
				game.over = wrapped;
			}
			root.__cshPoolAchvOver = function (winner) {
				try {
					if (!active()) return;
					var me = game.me || {};
					/* 胜负口径：以 game.over(winner) 的实参为准（true / 玩家对象 / 玩家数组）。
					   拿不准就算"没赢"——宁可漏记一条成就，也不给错的。 */
					var win = false;
					try {
						if (winner === true) win = true;
						else if (Array.isArray(winner)) win = winner.indexOf(me) >= 0;
						else if (winner === me) win = true;
					} catch (eW) { win = false; }

					/* 跨局累计（本命 / 百将）：先读存档里的历史，再判本局，最后统一落盘。
					   ★ 用"判之前的值 + 本局"注入，避免"本局赢了但本命不吃这局"。 */
					var cross = { chars: 0, distinct: 0 };
					try {
						var st0 = load();
						var nm0 = (run.meChars && run.meChars[0]) || "";
						var prev0 = (st0.chars && st0.chars[nm0]) || 0;
						cross.chars = prev0 + (win ? 1 : 0);
						cross.distinct = Object.keys(st0.chars || {}).length + ((win && !prev0) ? 1 : 0);
					} catch (eC) {}
					run.charWins = cross.chars;
					run.distinctWins = cross.distinct;
					var ident = {};
					try {
						for (var i = 0; i < game.players.length; i++) ident[game.players[i].seatNum] = game.players[i].identity || "";
					} catch (e2) {}
					var landlord = null;
					try {
						if (run.mode === "doudizhu" && game.zhu) landlord = game.zhu.seatNum;
					} catch (e3) {}
					pump({
						t: "over", win: win, turns: run.turn,
						survivors: (game.players || []).filter(function (p) { try { return p.isAlive(); } catch (e) { return false; } }).length,
						ident: ident, landlordSeat: landlord,
						hand: (function () { try { return me.countCards("h"); } catch (eH) { return null; } })(),
					});
					/* 落盘跨局累计（只记胜场；赢了才 +1） */
					try {
						if (win) {
							var st1 = load();
							var nm1 = (run.meChars && run.meChars[0]) || "";
							if (nm1) {
								st1.chars = st1.chars || {};
								st1.chars[nm1] = (st1.chars[nm1] || 0) + 1;
								save(st1);
							}
						}
					} catch (eP) {}
					run = null;
				} catch (e) { try { host.log && host.log("over 异常：" + e); } catch (e2) {} }
			};
			return true;
		} catch (e) {
			try { host && host.log && host.log("install 失败：" + e); } catch (e2) {}
			return false;
		}
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
		newRun: newRun, feed: feed, judge: judge, install: install,
		load: load, save: save, unlock: unlock, claimState: claimState,
		selfTest: selfTest,
	};
})(typeof window !== "undefined" ? window : globalThis);
