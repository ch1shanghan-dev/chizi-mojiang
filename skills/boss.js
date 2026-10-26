/* ★ 2026-10-15 修（真 BUG）：本文件**没有任何 import**，却在函数体里用了 160 次引擎全局
   （game. 138 / lib. 13 / get. 7 / ai. 2 / ui. 1 / _status. 2）。ESM 模块作用域里没有这些
   隐式全局 ⇒ 一旦某个技能的 filter/content 被引擎调到就抛 `game is not defined`
   （作者实机报错：本文件 787 行、arrangeTrigger 阶段崩）。静态门禁与模拟世界都抓不到
   —— 它们不真跑这条技能路径。必须显式 import（与 skills/index.js 同源同路径）。 */
import { lib, game, ui, get, ai, _status } from "../../../noname.js";
/* ============================================================
   池子魔将 · BOSS 模式技能包（v4 · 2026-10-14）
   ------------------------------------------------------------
   全量 132 条技能定义（主技 + silent 子技）：4 通用 + 1 解封【醒魔】+ 8 系列 + 4 彩蛋
   + 7 究极专属 + 妖灵技（六式/十二美/十卫/二十刑/游魂位/第二十席【百豪】/【池悯】）
   + 2 系统层【疯魔/反扑】+ 2 记录技（watch / watch_ext）。
   ★ 绝大多数锁定/强制触发；十二美含 3 个主动技（百裂/支配/七曜 · 配 ai.order 供 AI 自主发动）。
   ★ 主技能名一律 2 字（铁律）；子技 silent 不显示。
   ★ 究极专属实现锚点（引擎/本体原文）：
     锋芒 ← 本体无双 wushuang1（customArgs[id].shanRequired）
     天命 ← 本体鬼道/白羽等改判范式（**替换 judging[0]** + 弃旧牌；⚠ 不是 judge.directresult——
            该字段在 judge content 触发 judge 之前就被读取，事后赋值无效，2026-10-14 修）
     水月 ← 本体流离 liuli（targets.remove/add）；⚠ useCardToTarget 事件的来源字段是
            **player**（由 _triggerTo 构造，无 source），误用 trigger.source 会让
            lib.filter.targetEnabled 抛 TypeError（2026-10-14 修）
     换血 ← 本体 boss_lunhui（体力交换范式）
     冥瞳 ← 本体 boss_qiangzheng（全场抽手牌范式）
     奥术 ← 本体 boss_jicai（事件挂钩过牌范式）
   ★ 伤害改值统一 damageBegin 系列：加伤 damageBegin1 / 修值 damageBegin3 / 防免 damageBegin4。
   ★ 技能结算顺序（v4.1 · 作者实机反馈）：引擎在"同一玩家、同一事件、同优先级"
     出现多个可触发技能时会弹「选择下一个触发的技能」让玩家排序——而本模式技能多为
     数值叠加，让玩家选择毫无意义（还老是打断）。因此**每个非 silent 主技都显式声明
     `priority`**（见各技能块首行）：
       · 系统层统一排在角色原生技能之后（负值带 -1.1 ~ -3.7；本体/常见扩展技能集中在
         0 / ±1 / 5 / 10 / 15 等值域，负小数带不与任何已知技能撞值）；
       · 层内**逐技错开**（含惊变形态 天鼓 -1.2 与 魔威 -1.1、汇流 -2.5 与 魔息 -2.4
         这两组会同场共存的组合）——两两不同即永不为"选谁先触发"弹窗；
       · 唯一例外：【浮影】= priority 6（"取消杀"需要抢在其它 useCardToBefore 之前结算，
         保留原有设计值）。
     ★ 改技能/加技能时必须同步分配新值，tools/check.js 有断言守护（非 silent 触发技
       必须有 priority 且全体两两不同）。
   ============================================================ */

/* ---------- 模块级小工具（零 import · 纯数据模块内自持；须在 skill 定义之前） ----------
   【水月】用：安全的目标合法性判定。`lib.filter.targetEnabled(card, player, target)`
   内部走 `game.checkMod(...)`，若 player 为 undefined 会直接 TypeError
   （checkMod 取参数末位元素的 getModableSkills）——这里自兜一层：异常一律视为"合法"
   （宁可多一个候选目标，也不要因异常让整个 filter 崩掉）。 */
function targetOk(card, player, target) {
	try { return !!lib.filter.targetEnabled(card, player, target); } catch (e) { return true; }
}

const skill = {

	/* ============ 通用池（v3 构成表：究极 4 / 霸主 3 / 精英 2 / 彩蛋 1） ============ */

	/* ① 魔威：杀伤害 +1（全员骨架） */
	csh_boss_mowei: {
		priority: -1.1,
		audio: false,
		trigger: { source: "damageBegin1" },
		forced: true, locked: true,
		filter(event) {
			return event.card && event.card.name === "sha" && (!event.notLink || event.notLink());
		},
		content() { trigger.num++; },
	},

	/* ② 霸体：每轮限 X 次，>1 点伤害 -1（反拖慢）
	   ★ v6.6：X 改由档位次数表提供（game.bossinfo._csh_bati_lim = 究极 2 / 其余 1）；
	     疯魔期间 +1 次。旧实现把 lim 写死成 1，四技全员化之后档位就没有差异了。 */
	csh_boss_bati: {
		priority: -1.3,
		audio: false,
		trigger: { player: "damageBegin3" },
		forced: true, locked: true,
		filter(event, player) {
			if (event.num <= 1) return false;
			var base = (typeof game.bossinfo === "object" && game.bossinfo
				&& typeof game.bossinfo._csh_bati_lim === "number") ? game.bossinfo._csh_bati_lim : 1;
			var lim = base + ((player.storage.csh_boss_fengmo || 0) > 0 ? 1 : 0);
			return (player.storage.csh_boss_bati_n || 0) < lim;
		},
		content() {
			trigger.num--;
			player.storage.csh_boss_bati_n = (player.storage.csh_boss_bati_n || 0) + 1;
		},
		group: ["csh_boss_bati_round"],
	},
	csh_boss_bati_round: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return (player.storage.csh_boss_bati_n || 0) > 0; },
		content() { player.storage.csh_boss_bati_n = 0; },
	},

	/* ③ 魔怒 v2：每轮限 X 次，受到伤害后，来源流失等同伤害值的体力（流失无视减伤）
	   ★ v6.6：X 由档位次数表提供（game.bossinfo._csh_monu_lim = 究极 3 / 霸主 2 / 精英·彩蛋 1）；
	     疯魔期间 +1 次。**效果本身保持原味**（作者拍板：不改"等同伤害值"）——
	     低档靠"每轮 1 次"控强度，且挑战者可以选择"这轮少打一刀"来规避，属节奏决策。
	     手感备份旋钮：若低档仍过紧，把 content 的 loseHp(trigger.num) 改成 loseHp(1) 即可。 */
	csh_boss_monu: {
		priority: -1.8,
		audio: false,
		trigger: { player: "damageEnd" },
		forced: true, locked: true,
		filter(event, player) {
			var base = (typeof game.bossinfo === "object" && game.bossinfo
				&& typeof game.bossinfo._csh_monu_lim === "number") ? game.bossinfo._csh_monu_lim : 2;
			var lim = base + ((player.storage.csh_boss_fengmo || 0) > 0 ? 1 : 0);
			return event.source && event.source !== player && event.source.isIn()
				&& (player.storage.csh_boss_monu || 0) < lim;
		},
		content() {
			player.storage.csh_boss_monu = (player.storage.csh_boss_monu || 0) + 1;
			trigger.source.loseHp(trigger.num);
		},
		group: ["csh_boss_monu_round"],
	},
	csh_boss_monu_round: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return (player.storage.csh_boss_monu || 0) > 0; },
		content() { player.storage.csh_boss_monu = 0; },
	},

	/* ④ 魔息（v3 新增 · 分档摸牌）：摸牌阶段多摸 X 张（X = 档位：精英 1 / 霸主 2 / 究极 3，
	   由 bossmode 注入的 game.bossinfo._csh_moxi 提供） */
	csh_boss_moxi: {
		priority: -2.4,
		audio: false,
		trigger: { player: "phaseDrawBegin2" },
		forced: true, locked: true,
		/* numFixed 守卫：摸牌数已被"改为固定值"类技能锁定时不再叠加（本体英姿同款纪律） */
		filter(event) { return !event.numFixed; },
		content() {
			/* ★ v6.6 BUG 修：旧写法 `... && game.bossinfo._csh_moxi) || 1` 用了 `||` 兜底，
			   而档位表里**彩蛋的 _csh_moxi 是 0**——0 是假值 ⇒ 被静默替换成 1，
			   于是"彩蛋不给魔息"的设定从未生效（彩蛋魔王一直在多吃一张牌）。
			   改成显式类型判定：只有拿不到数字时才回落 1。 */
			var v = (typeof game.bossinfo === "object" && game.bossinfo
				&& typeof game.bossinfo._csh_moxi === "number") ? game.bossinfo._csh_moxi : 1;
			trigger.num += v;
		},
	},

	/* ============ 系列技（v2/v3 机制化强化） ============ */

	/* ⑤ 裂阵（摧锋）v2：命中拆牌；清空手牌追伤 2 —— "处决时刻" */
	csh_boss_liezhen: {
		priority: -2.1,
		audio: false,
		trigger: { source: "damageEnd" },
		forced: true, locked: true,
		filter(event) {
			/* v4.1：只对挑战者生效（原实现会弃自家妖灵的牌，观感如 bug） */
			return event.card && event.card.name === "sha" && event.player && event.player.isIn()
				&& event.player.side === false;
		},
		content() {
			trigger.player.randomDiscard();
			if (trigger.player.isIn() && trigger.player.countCards("h") === 0) {
				trigger.player.damage(2, player);
			}
		},
	},

	/* ⑥ 惊变（惊霆）：回合开始按序轮转三形态（游电 v2 加手牌上限 +3） */
	csh_boss_jingbian: {
		priority: -2.6,
		audio: false,
		trigger: { player: "phaseBegin" },
		forced: true, locked: true,
		content() {
			var FORMS = ["csh_boss_jingbian_lei", "csh_boss_jingbian_dian", "csh_boss_jingbian_gu"];
			var cur = typeof player.storage.csh_boss_jingbian === "number" ? player.storage.csh_boss_jingbian : -1;
			if (cur >= 0) player.removeSkill(FORMS[cur]);
			var next = (cur + 1) % 3;
			player.storage.csh_boss_jingbian = next;
			player.addSkill(FORMS[next]);
			player.popup(FORMS[next]);
		},
	},
	csh_boss_jingbian_lei: {
		audio: false,
		mod: {
			cardUsable(card) {
				if (card.name === "sha") return Infinity;
			},
		},
		mark: true, marktext: "雷",
		intro: { name: "惊雷", content: "锁定技：你使用【杀】无次数限制" },
	},
	csh_boss_jingbian_dian: {
		audio: false,
		mod: {
			globalTo(from, to, distance) { return distance + 1; },
			maxHandcard(player, num) { return num + 3; },
		},
		mark: true, marktext: "电",
		intro: { name: "游电", content: "锁定技：其他角色与你的距离+1，你的手牌上限+3" },
	},
	csh_boss_jingbian_gu: {
		priority: -1.2,
		audio: false,
		trigger: { source: "damageBegin1" },
		forced: true, locked: true,
		filter(event) { return event.card && event.card.name === "sha"; },
		content() { trigger.num++; },
		mark: true, marktext: "鼓",
		intro: { name: "天鼓", content: "锁定技：你使用【杀】造成的伤害+1" },
	},

	/* ⑦ 覆势（覆澜）v2：上轮未受伤 → 获得每名其他角色的一张牌（本体强征语言） */
	csh_boss_fushi: {
		priority: -2.9,
		audio: false,
		trigger: { global: "roundStart" },
		forced: true, locked: true,
		filter(event, player) {
			return (player.storage.csh_boss_fushi_dmg || 0) <= 1;
		},
		content() {
			var targets = game.filterPlayer(cur => cur !== player && cur.countCards("he"));
			for (var i = 0; i < targets.length; i++) {
				player.gain(targets[i].getCards("he").randomGet(), targets[i], "give");
			}
			player.storage.csh_boss_fushi_dmg = 0;
		},
		group: ["csh_boss_fushi_hit"],
	},
	csh_boss_fushi_hit: {
		audio: false, silent: true, forced: true,
		trigger: { player: "damageEnd" },
		content() { player.storage.csh_boss_fushi_dmg = (player.storage.csh_boss_fushi_dmg || 0) + trigger.num; },
	},

	/* ⑧ 汇流（汇川）：摸牌 +2、手牌上限 +2 */
	csh_boss_huiliu: {
		priority: -2.5,
		audio: false,
		trigger: { player: "phaseDrawBegin2" },
		forced: true, locked: true,
		filter(event) { return !event.numFixed; },   /* 同魔息：固定摸牌数时不叠加 */
		content() { trigger.num += 2; },
		mod: {
			maxHandcard(player, num) { return num + 2; },
		},
	},

	/* ⑨ 浮影（浮光）v2：每轮第一刀取消 + 摸 2 —— 蜃景（对照藤甲 tengjia1 范式） */
	csh_boss_fuying: {
		audio: false,
		trigger: { target: "useCardToBefore" },
		priority: 6,
		forced: true, locked: true,
		filter(event, player) {
			return event.card && event.card.name === "sha" && !player.storage.csh_boss_fuying;
		},
		content() {
			player.storage.csh_boss_fuying = true;
			trigger.cancel();
			player.draw(2);
		},
		group: ["csh_boss_fuying_round"],
	},
	csh_boss_fuying_round: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_fuying; },
		content() { player.storage.csh_boss_fuying = false; },
	},

	/* ⑩ 燎原（烬火 · v3 重做）：伤害叠「烬」（上限3 · 每人每轮至多1枚）；
	   有「烬」者回合开始流失等同标记数的体力 —— 先烧后炸（本体 boss_echou 累积标记范式；
	   轮次计数用自管 storage——引擎无公开 turnCount） */
	csh_boss_liaoyuan: {
		priority: -2.2,
		audio: false,
		trigger: { source: "damageEnd" },
		forced: true, locked: true,
		filter(event, player) {
			/* v4.1：只给挑战者挂「烬」（原实现会给自家妖灵挂，烧到自己人） */
			return event.player && event.player.isIn() && event.player.side === false;
		},
		content() {
			var t = trigger.player;
			if (t.storage.csh_boss_liao_mark_round === player.storage.csh_boss_liaoyuan_round) return;   /* 每轮至多 1 枚 */
			if (t.countMark("csh_boss_liaoyuan_y") >= 5) return;                  /* 上限 5（原烬引加成并入） */
			t.storage.csh_boss_liao_mark_round = player.storage.csh_boss_liaoyuan_round;
			t.addMark("csh_boss_liaoyuan_y", 1, false);
			game.log(t, "获得了一枚「烬」");
		},
		group: ["csh_boss_liaoyuan_burn", "csh_boss_liaoyuan_round"],
	},
	csh_boss_liaoyuan_round: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		content() { player.storage.csh_boss_liaoyuan_round = (player.storage.csh_boss_liaoyuan_round || 0) + 1; },
	},
	csh_boss_liaoyuan_burn: {
		priority: -2.3,
		audio: false, silent: true, forced: true, locked: true,
		trigger: { global: "phaseBegin" },
		filter(event, player) {
			return event.player !== player && event.player.isIn()
				&& event.player.countMark("csh_boss_liaoyuan_y") > 0;
		},
		content() {
			var t = trigger.player;
			var n = t.countMark("csh_boss_liaoyuan_y");
			t.removeMark("csh_boss_liaoyuan_y", n);
			t.loseHp(n);
			game.log(t, "被「烬」灼烧，流失了 " + n + " 点体力");
		},
	},

	/* ⑪ 行健（周天）v2：每轮自净判定区，弃几张摸几张 + 回 1 */
	csh_boss_xingjian: {
		priority: -3.1,
		audio: false,
		trigger: { global: "roundStart" },
		forced: true, locked: true,
		filter(event, player) {
			return player.getCards("j").length > 0 || player.hp < player.maxHp;
		},
		content() {
			var js = player.getCards("j");
			if (js.length) {
				player.discard(js);
				player.draw(js.length);
			}
			if (player.hp < player.maxHp) player.recover(1);
		},
	},

	/* ⑫ 乱入（群友乱入）：开局随机获得一个他系系列技 */
	csh_boss_luanru: {
		priority: -3.7,
		audio: false,
		/* ★ 2026-10-14 审计修复（真 BUG · 死技）：原为 `player: "gameStart"`——
		   引擎的 gameStart 是**全局事件**（mode/boss.js:450 `event.trigger("gameStart")`，
		   宿主事件不带 player），而 `player:` 角色要求 `event.player === 技能持有者`，
		   条件永不成立 ⇒ 【乱入】一次都不会发动。全仓（本体 library/skill.js:1452/1643、
		   collab/diy/sp…）的 gameStart 触发技**一律**写 `global:`。改 global 后 content 的
		   player = 技能持有者（正是原实现假定的语义）。 */
		trigger: { global: "gameStart" },
		forced: true, locked: true,
		content() {
			var pool = ["csh_boss_liezhen", "csh_boss_xingjian", "csh_boss_fushi", "csh_boss_huiliu",
				"csh_boss_fuying", "csh_boss_liaoyuan", "csh_boss_jingbian"];
			var pick = pool.filter(s => !player.hasSkill(s)).randomGet();
			if (pick) {
				player.addSkill(pick);
				player.popup(pick);
				game.log(player, "乱入登场，随机习得了一个系列技");
			}
		},
	},

	/* ============ 究极专属技（v3 · 7 份） ============ */

	/* ⑬ 锋芒（吕布）：锁定技，你使用的【杀】需要两张【闪】才能抵消
	   （本体无双 wushuang1 原文范式：customArgs[id].shanRequired） */
	csh_boss_fengmang: {
		priority: -3.4,
		audio: false,
		trigger: { player: "useCardToPlayered" },
		forced: true, locked: true,
		filter(event) {
			return event.card && event.card.name === "sha";
		},
		content() {
			var id = trigger.target.playerid;
			var map = trigger.getParent() && trigger.getParent().customArgs;
			if (id != null && map) {
				if (!map[id]) map[id] = {};
				map[id].shanRequired = 2;
			}
		},
	},

	/* ⑭ 躺赢（豆豆）：锁定技，每轮限一次，你受到会令你死亡的伤害时防止之，
	   你的体力变为 1，随机一名挑战者流失 2 点体力 */
	csh_boss_tangying: {
		priority: -1.7,
		audio: false,
		trigger: { player: "damageBegin4" },
		forced: true, locked: true,
		filter(event, player) {
			return event.num > 0 && player.hp <= event.num
				&& !player.storage.csh_boss_tangying;
		},
		content() {
			player.storage.csh_boss_tangying = true;
			trigger.num = 0;
			player.hp = 1;
			player.update();
			var foes = game.filterPlayer(cur => cur !== player && cur.side !== player.side && cur.isIn());
			var foe = foes.randomGet();
			if (foe) {
				foe.loseHp(2);
				game.log(player, "发动了【躺赢】，", foe, "流失了 2 点体力");
			}
		},
		group: ["csh_boss_tangying_round"],
	},
	csh_boss_tangying_round: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_tangying; },
		content() { player.storage.csh_boss_tangying = false; },
	},

	/* ⑮ 天命（方圣帝君）：锁定技，每轮限两次，你的判定牌生效前，你观看牌堆顶三张，
	   以其中判定结果对你最有利的一张代替判定牌（本体鬼道 guicai 的 directresult 范式；
	   引擎约定：judge() 返回值越大对判定者越有利） */
	csh_boss_tianming: {
		priority: -3.2,
		audio: false,
		trigger: { player: "judge" },
		forced: true, locked: true,
		filter(event, player) {
			return (player.storage.csh_boss_tianming || 0) < 2;
		},
		content() {
			"step 0"
			player.storage.csh_boss_tianming = (player.storage.csh_boss_tianming || 0) + 1;
			event.cards = get.cards(3);
			"step 1"
			var best = event.cards[0], bv = -Infinity;
			for (var i = 0; i < event.cards.length; i++) {
				var v = trigger.judge(event.cards[i]);
				if (v > bv) { bv = v; best = event.cards[i]; }
			}
			event.cards.remove(best);
			while (event.cards.length) ui.cardPile.insertBefore(event.cards.pop(), ui.cardPile.firstChild);
			/* ★ 2026-10-14 审计修复（真 BUG · 空转技）：改判必须替换 `judging[0]`
			   （本体范式：extras/skill.js:1671 / key/skill.js:6191 / diy/skill.js:3498）。
			   原实现写 `trigger.directresult` —— 那是 judge content **step1 开头**读的字段
			   （content.js:2983 `let cardj = event.directresult`），而本技能在**同一步尾部**的
			   `event.trigger("judge")`（content.js judge step1）才触发 ⇒ 判定牌早已选定并亮出，
			   赋值完全无效：白白摸 3 张、弃 2 张、计数 +1，判定结果不变。 */
			var tp = trigger.player;
			var old = (tp && tp.judging) ? tp.judging[0] : null;
			if (tp && tp.judging) tp.judging[0] = best;
			try { if (old && old !== best) game.cardsDiscard(old); } catch (eD) {}
			game.log(player, "发动了【天命】，", best, "成为判定牌");
		},
		group: ["csh_boss_tianming_round"],
	},
	csh_boss_tianming_round: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return (player.storage.csh_boss_tianming || 0) > 0; },
		content() { player.storage.csh_boss_tianming = 0; },
	},

	/* ⑯ 水月（蓝染）：锁定技，每轮限一次，你成为【杀】的目标后，
	   此【杀】转而指定使用者外的随机一名其他角色（本体流离 liuli 的 targets 改写范式；
	   与原技【镜花】成对——镜花水月） */
	csh_boss_shuiyue: {
		priority: -3.5,
		audio: false,
		trigger: { target: "useCardToTarget" },
		forced: true, locked: true,
		filter(event, player) {
			return event.card && event.card.name === "sha" && !player.storage.csh_boss_shuiyue;
		},
		content() {
			player.storage.csh_boss_shuiyue = true;
			/* v4.1：只转移给挑战者方（原实现会把【杀】随机甩到自家妖灵身上，观感如 bug）
			   ★ 2026-10-14 审计修复（真 BUG · 会抛异常）：useCardToTarget /
			     useCardToPlayer 系列事件由引擎 `event._triggerTo` 构造
			     （content.js:9352-9385），字段只有 **player/target/card/cards**——
			     **没有 source**！原写法 `trigger.source` 恒 undefined，传给
			     `lib.filter.targetEnabled(card, undefined, cur)` → 内部
			     `game.checkMod(...)` 取 `argumentArray[last].getModableSkills()` →
			     对 undefined 取属性 **TypeError** ⇒ 【水月】要么报错、要么整个 filter 失效。
			     改用 `trigger.player`（= 使用者，本体同名事件的标准字段）。 */
			var src = trigger.player;
			var candidates = game.filterPlayer(cur => cur !== player && cur !== src
				&& cur.side === false && cur.isIn() && targetOk(trigger.card, src, cur));
			var to = candidates.randomGet();
			if (to) {
				game.log(player, "发动了【水月】，目标转移给", to);
				var parent = trigger.getParent();
				parent.targets.remove(player);
				parent.targets.add(to);
			}
		},
		group: ["csh_boss_shuiyue_round"],
	},
	csh_boss_shuiyue_round: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_shuiyue; },
		content() { player.storage.csh_boss_shuiyue = false; },
	},

	/* ⑰ 奥术（卡尔）：锁定技，每轮限两次，任意角色使用非延时锦囊牌结算后，你摸一张牌
	   （本体 boss_jicai 事件挂钩过牌同族） */
	csh_boss_aoshu: {
		priority: -3.6,
		audio: false,
		trigger: { global: "useCardAfter" },
		forced: true, locked: true,
		filter(event, player) {
			return get.type(event.card) === "trick" && (player.storage.csh_boss_aoshu || 0) < 2;
		},
		content() {
			player.storage.csh_boss_aoshu = (player.storage.csh_boss_aoshu || 0) + 1;
			player.draw();
		},
		group: ["csh_boss_aoshu_round"],
	},
	csh_boss_aoshu_round: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return (player.storage.csh_boss_aoshu || 0) > 0; },
		content() { player.storage.csh_boss_aoshu = 0; },
	},

	/* ⑱ 换血（奎桑提）：锁定技，每轮限一次，你进入濒死状态时，
	   与体力值最高的一名其他角色交换体力值（本体 boss_lunhui 同款机制） */
	csh_boss_huanxue: {
		priority: -3.3,
		audio: false,
		trigger: { player: "dying" },
		forced: true, locked: true,
		filter(event, player) {
			return !player.storage.csh_boss_huanxue;
		},
		/* ★ v6.7 修（作者："方圣帝君作为 BOSS，也有濒死技能，感觉你没找全"——查全后发现
		   漏的就是这一处：究极专属【换血】。它挂在 `player: "dying"` 上，是**魔王侧的第二个
		   濒死技**，此前只列了【反扑】）：
		   旧实现直接改 `player.hp` / `best.hp` 两个字段 —— **绕过了引擎的体力状态机**：
		     对方拿到 ≤0 的体力之后仍是"活着"的：不进 dying、不进 _status.dying、
		     不问【桃】、对方的濒死技也不触发；要等到**下一次**对他结算伤害时引擎才发现
		     他 0 血并突然倒下 ⇒ 出现"0 血但还能行动"的不一致状态。
		   ★ 2026-10-15 再修（真 BUG 回访 · 作者授权"按最完美的节奏来"）：
		     上一次的修法只把 `player.hp`/`best.hp` 直改换成 `changeHp`，但**仍不够**——
		     引擎 `content.ts` 的 `changeHp`（content.ts:12322）只做 hp 加减与上限钳制，
		     **濒死判定只写在 `loseHp` 里**（content.ts:12275-12281：`changeHp(-num)` 后
		     再 `if (player.hp <= 0 && !event.nodying) await player.dying(event)`）。
		     所以"把对方血量换成 ≤0"若走 `changeHp`，对方依旧**不会进濒死**——
		     "0 血还能行动的活人"复现。本次把**掉血那一步改成 `loseHp`**：
		       · 我方抬血仍走 `changeHp`（顺带由引擎把我方移出濒死，content.ts:12356-12369）；
		       · 对方"降到 hp1"改用 `best.loseHp(hp2 - hp1)`（差额即为应流失的点数），
		         由引擎在 `loseHp` 内自己判定并走完 `dying` 链路（问【桃】/触发濒死技），
		         本技能不手动 `die()`、不吞掉任何结算。 */
		async content(event, trigger, player) {
			player.storage.csh_boss_huanxue = true;
			var best = null, bh = -Infinity;
			game.filterPlayer(function (cur) { return cur !== player && cur.isIn(); }).forEach(function (cur) {
				if (cur.hp > bh) { bh = cur.hp; best = cur; }
			});
			if (!best || bh <= player.hp) return;
			game.log(player, "发动了【换血】，与", best, "交换了体力值");
			var hp1 = player.hp, hp2 = best.hp;
			await player.changeHp(hp2 - hp1);
			await best.loseHp(hp2 - hp1);
		},
		group: ["csh_boss_huanxue_round"],
	},
	csh_boss_huanxue_round: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_huanxue; },
		content() { player.storage.csh_boss_huanxue = false; },
	},

	/* ⑲ 冥瞳（杨间）：锁定技，你的回合开始时，你获得每名其他角色的一张随机手牌
	   （本体 boss_qiangzheng 全场抽税同族；契合原技「鬼眼」，名字避开） */
	csh_boss_mingtong: {
		priority: -2.7,
		audio: false,
		trigger: { player: "phaseBegin" },
		forced: true, locked: true,
		content() {
			var foes = game.filterPlayer(cur => cur !== player && cur.isIn());
			for (var i = 0; i < foes.length; i++) {
				var cards = foes[i].getCards("h");
				if (cards.length) player.gain(cards.randomGet(), foes[i], "giveAuto");
			}
		},
	},

	/* ============ 彩蛋专属技（梗王规则，维持） ============ */

	/* ⑳ 鉴真（丁真）：伤害封顶 2 */
	csh_boss_jianzhen: {
		priority: -1.4,
		audio: false,
		trigger: { player: "damageBegin3" },
		forced: true, locked: true,
		filter(event) { return event.num > 2; },
		content() { trigger.num = 2; },
	},

	/* ㉑ 禁忌（米斯达）：本局第四次伤害被取消 */
	csh_boss_jinji: {
		priority: -1.5,
		audio: false,
		trigger: { player: "damageBegin3" },
		forced: true, locked: true,
		mark: true, marktext: "忌",
		intro: {
			name: "禁忌",
			content(storage, player) {
				var n = player.storage.csh_boss_jinji || 0;
				return "本局第 " + n + " 次伤害判定（第四次将被取消）";
			},
		},
		content() {
			player.storage.csh_boss_jinji = (player.storage.csh_boss_jinji || 0) + 1;
			if (player.storage.csh_boss_jinji === 4) trigger.cancel();
		},
	},

	/* ㉒ 卧冰（大冰）：每轮限一次，造成伤害后令受伤害角色翻面
	   ★ v4.1 修：触发方向原为 `player: "damageEnd"`（= 自己受伤时触发），
	   而 filter 又要求 `event.player !== player` —— 恒 false，技能**从未生效过**。
	   按说明文义改为 `source: "damageEnd"`（自己造成伤害后），并限挑战者方。 */
	csh_boss_wobing: {
		priority: -1.9,
		audio: false,
		trigger: { source: "damageEnd" },
		forced: true, locked: true,
		filter(event, player) {
			return event.player && event.player.isIn() && event.player.side === false
				&& !player.storage.csh_boss_wobing;
		},
		content() {
			player.storage.csh_boss_wobing = true;
			trigger.player.turnOver();
		},
		group: ["csh_boss_wobing_round"],
	},
	csh_boss_wobing_round: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_wobing; },
		content() { player.storage.csh_boss_wobing = false; },
	},

	/* ㉓ 八重（远古八废）：前八次伤害各 -1 */
	csh_boss_bachong: {
		priority: -1.6,
		audio: false,
		trigger: { player: "damageBegin3" },
		forced: true, locked: true,
		mark: true, marktext: "废",
		intro: {
			name: "八重",
			content(storage) { return "已挡 " + (storage || 0) + "/8 次伤害"; },
		},
		filter(event, player) { return (player.storage.csh_boss_bachong || 0) < 8; },
		content() {
			player.storage.csh_boss_bachong = (player.storage.csh_boss_bachong || 0) + 1;
			trigger.num--;
		},
	},

	/* ============ 妖灵技（v4 · B+C 混版：存活增益「共生」+ 每轮恶心「泛用」，全部锁定自动生效） ============ */

	/* ㉔ 剑刃（伊芙 · 六式① · 原魂噬）：魔王造成的伤害+1；死亡送魔王 2 张 —— 拆它=给魔王降输出 */
	csh_boss_ying_hunshi: {
		priority: -4.1,
		audio: false,
		trigger: { global: "damageBegin1" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && game.boss && event.source === game.boss && event.player !== game.boss;
		},
		content() { trigger.num++; },
	},

	/* ---------- ㉜ 掩护（艾达王 · 护主）：每轮限一次，魔王将受的伤害由她代受——她站的位置就是盾。 ---------- */
	csh_boss_kan_guzao: {
		priority: -4.2,
		audio: false,
		trigger: { global: "damageBegin4" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.player === game.boss && event.num > 0
				&& !player.storage.csh_boss_kan_guzao_round;
		},
		content() {
			player.storage.csh_boss_kan_guzao_round = true;
			var n = trigger.num;
			trigger.num = 0;
			player.damage(n, "nosource");
			game.log(player, "以【掩护】替魔王挡下了", n, "点伤害");
		},
		group: ["csh_boss_kan_guzao_clear"],
	},
	csh_boss_kan_guzao_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_kan_guzao_round; },
		content() { player.storage.csh_boss_kan_guzao_round = false; },
	},


	/* ---------- 缴械（天天）：暗器不出手，先废你的兵刃 ----------
	   ★ v6.6 重写原因：旧【忍具】与光熙【光焰】的 filter **逐字相同**（同时点、同条件、
	     同目标），只是一个弃随机牌、一个弃全部闪 ⇒ 同族重复。
	     新机制改奔"装备"这一无人占的口径，并且**把装备交到魔王手上**（而不是丢掉）。 */
	csh_boss_feng_fengshi: {
		priority: -11.2,
		audio: false,
		trigger: { global: "useCardToTarget" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && game.boss && event.player === game.boss && event.target !== player
				&& event.target.side === false && event.target.isIn() && event.target.countCards("e") > 0
				&& event.card && event.card.name === "sha" && !player.storage.csh_boss_feng_fengshi_round;
		},
		content() {
			player.storage.csh_boss_feng_fengshi_round = true;
			var t = trigger.target;
			var card = t.getCards("e").randomGet();
			if (card) {
				game.boss.gain(card, t, "give");
				game.log(player, "的【缴械】把", t, "的", card, "收进了魔王手里");
			}
		},
		group: ["csh_boss_feng_fengshi_clear", "csh_boss_feng_fengshi_die"],
	},
	csh_boss_feng_fengshi_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_feng_fengshi_round; },
		content() { player.storage.csh_boss_feng_fengshi_round = false; },
	},
	csh_boss_feng_fengshi_die: {
		audio: false, silent: true, forced: true, locked: true,
		forceDie: true, forceOut: true, // ★ 死时触发必需（filterTrigger 的 isDead/出局闸；2026-10-16 修）
		trigger: { player: "die" },
		filter() { return !!game.boss && game.boss.isIn(); },
		content() { game.boss.draw(); },
	},

	/* ---------- ⑥ 御前（女帝 · 六式④）：每轮开始时，**手牌最多的**挑战者弃置一张牌，魔王获得之。
	   —— 从"随机点名"改成"点名最贪的那个"：压力变成**可预判、可规避**的
	      （别囤牌就不会被点），而不是纯随机惩罚。 ---------- */
	csh_boss_lang_nongchao: {
		priority: -4.4,
		audio: false,
		trigger: { global: "roundStart" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && game.hasPlayer(cur => cur.side !== player.side && cur.countCards("he"));
		},
		content() {
			var foes = game.filterPlayer(cur => cur.side !== player.side && cur.countCards("he"));
			if (!foes.length) return;
			var best = foes[0];
			for (var i = 1; i < foes.length; i++) {
				if (foes[i].countCards("h") > best.countCards("h")) best = foes[i];
			}
			player.gain(best.getCards("he").randomGet(), best, "give");
			game.log(player, "的【御前】向", best, "索取了一张牌");
		},
	},
	/* ---------- ㉘ 烈焰（特莉丝 · 六式⑤）：魔王对**横置状态**的挑战者造成的伤害 +1。
	   —— 贴"火焰女术士"人设，并与【冰结】（艾米莉亚 · 每轮横置一人）形成**联动**：
	      究极档两只同时在场的概率不低，那时横置的挑战者会被双重惩罚（连环 + 火伤）。
	      玩家因此多了一层决策：要不要为了躲火而放弃横置收益。 ---------- */
	/* ---------- 附魔（特莉丝）：把自己的焰按进魔王的刃 ----------
	   ★ v6.6 重写原因：两条。①旧【烈焰】要求目标"处于横置"，而全扩展只有冰结/铁索能横置
	     ⇒ 单独出场时**一次都不触发**（实机≈白板）；②它同时被【剑刃】的无条件加伤覆盖。
	     新机制：加伤照旧由【剑刃】兜底，特莉丝改成**自损换火力**——每轮一次给魔王这一刀再 +1，
	     代价是她自己流失 1 点体力。她本来就只有 3 血，于是"什么时候点这一把火"成为妖灵自己的决策。 */
	csh_boss_fen_yujin: {
		priority: -11.5,
		audio: false,
		trigger: { global: "damageBegin2" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && game.boss && event.source === game.boss
				&& event.player !== game.boss && event.player.side === false && event.player.isIn()
				&& event.card && event.card.name === "sha" && !player.storage.csh_boss_fen_yujin_round;
		},
		content() {
			player.storage.csh_boss_fen_yujin_round = true;
			trigger.num++;
			player.loseHp(1);
			game.log(player, "的【附魔】烧旺了这一刀（自身流失 1 点体力）");
		},
		group: ["csh_boss_fen_yujin_clear"],
	},
	csh_boss_fen_yujin_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_fen_yujin_round; },
		content() { player.storage.csh_boss_fen_yujin_round = false; },
	},
	/* ㉙ 念动（吹雪 · 六式⑥ · 原牵丝）：每轮开始，随机一名挑战者随机弃置一张【闪】；
	   死亡后魔王回复 1 点体力 —— 拆闪配合魔王杀，"略微恶心"的定向版 */
	csh_boss_kui_qiansi: {
		priority: -4.6,
		audio: false,
		trigger: { global: "roundStart" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && game.hasPlayer(cur => cur.side !== player.side
				&& cur.countCards("h", c => c.name === "shan"));
		},
		content() {
			var foes = game.filterPlayer(cur => cur.side !== player.side
				&& cur.countCards("h", c => c.name === "shan"));
			var foe = foes.randomGet();
			if (foe) {
				var shan = foe.getCards("h", c => c.name === "shan").randomGet();
				if (shan) foe.discard(shan);
			}
		},
		group: ["csh_boss_kui_qiansi_die"],
	},
	csh_boss_kui_qiansi_die: {
		audio: false, silent: true, forced: true, locked: true,
		forceDie: true, forceOut: true, // ★ 死时触发必需（filterTrigger 的 isDead/出局闸；2026-10-16 修）
		trigger: { player: "die" },
		filter() { return !!game.boss && game.boss.isIn(); },
		content() { game.boss.recover(1); },
	},

	/* ㉚ 醒魔（v4 新通用技 · 逐步解封）：准备阶段，若体力上限 < X（档位血量，董卓/兀突骨 50 特例
	   不装配；张飞/关索/彩蛋档不装配），+1 上限并回复 1 点体力 —— 开局可战、全程解封成长 */
	csh_boss_xingmo: {
		priority: -2.8,
		audio: false,
		trigger: { player: "phaseZhunbeiBegin" },
		forced: true, locked: true,
		filter(event, player) {
			return game.bossinfo && typeof game.bossinfo._csh_x === "number"
				&& player.maxHp < game.bossinfo._csh_x;
		},
		content() {
			player.gainMaxHp(1);
			player.recover(1);
			game.log(player, "解封：" + player.maxHp + "/" + game.bossinfo._csh_x);
		},
	},

	/* ㉛ 池悯（v4 新妖灵统一技 · 击杀者福利）：妖灵死亡时，击杀者（仅挑战者方）+1 上限、
	   回复 1、获得 1 护甲、摸 2 —— 与魔王"解封"形成对称成长 */
	csh_boss_chi: {
		audio: false, silent: true, forced: true, locked: true,
		forceDie: true, forceOut: true, // ★ 死时触发必需（filterTrigger 的 isDead/出局闸；2026-10-16 修）
		trigger: { player: "dieAfter" },
		filter(event, player) {
			return event.source && event.source.side === false && event.source.isIn();
		},
		content() {
			var s = trigger.source;
			/* 保持 silent（无译名抢跑/排序自动胜出），但击杀奖励要"看得见"——
			   手动横幅 + 日志（v4.1：作者实机反馈奖励无感） */
			s.popup("池悯");
			game.log(s, "触发【池悯】，获得击杀奖励");
			s.gainMaxHp(1);
			s.recover(1);
			s.changeHujia(1);
			s.draw(2);
			/* v6.6（作者指令）：删除 v4.2 的"连破"段（同一局第 2 只妖灵起额外 +1 上限）。
			   理由：挑战者侧已有【解封】式的长期成长，再叠一层"多杀多得上限"会让后期挑战者
			   体力上限失控；且该段的描述写在【池悯】里，与本技"击杀即给一次固定回报"的
			   定位不符。现【池悯】= 恒定四件套（+1 上限 / 回 1 / +1 护甲 / 摸 2）。 */
		},
	},

	/* ============ 系统层（v4.2 立五技 · v6 收敛为二技：疯魔/反扑；久战/记仇/征税已按作者指令删除） ============ */

	/* ㉜ 疯魔（狂暴 · 作者定案：可以，但不能太强——只持续 1~2 轮，不得常驻）：
	   首次被打到半血（当前体力上限的一半）时进入疯魔 2 轮，期间【魔怒】与【霸体】各 +1 次。
	   ★ v6.6：四技全员化之后，这两技**每一位魔王都有** ⇒ 疯魔的"次数+1"对 93 位全部有效
	     （此前精英 51 + 彩蛋 4 缺技，疯魔只是个弹窗）。
	   ★ 判据用"当前上限的一半"（而非完全体的一半）——起点血量本就是完全体的 40%，
	   若按完全体半血判定会在开局第一次受伤就触发（与"打到半血才暴走"的体感不符）。 */
	csh_boss_fengmo: {
		priority: -5.1,
		audio: false,
		trigger: { player: "damageEnd" },
		forced: true, locked: true,
		filter(event, player) {
			if (player.storage.csh_boss_fengmo_used) return false;
			return player.maxHp > 0 && player.hp > 0 && player.hp * 2 <= player.maxHp;
		},
		content() {
			player.storage.csh_boss_fengmo_used = true;
			player.storage.csh_boss_fengmo = 2;              /* 持续 2 轮（每轮开始递减） */
			player.popup("疯魔");
			game.log(player, "跌至半血，陷入【疯魔】（2 轮内魔怒/霸体次数+1）");
		},
		group: ["csh_boss_fengmo_round"],
	},
	csh_boss_fengmo_round: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return (player.storage.csh_boss_fengmo || 0) > 0; },
		content() {
			player.storage.csh_boss_fengmo--;
			if (player.storage.csh_boss_fengmo <= 0) {
				player.storage.csh_boss_fengmo = 0;
				game.log(player, "【疯魔】平息");
			}
		},
	},

	/* ㉝ 反扑（作者定案：首次濒死）：首次进入濒死状态时，回复 3 点体力；**脱离濒死之后**
	   所有挑战者各流失 1 点体力。
	   ★ v6.6 拆分（作者："进入濒死触发技能的武将，会不会出现跟魔王技的冲突"）：
	     旧实现把"全体挑战者流失 1 点"写在 **dying 的 content 里** ⇒ 它会在**魔王自己的
	     濒死结算还没走完**时，把 1~4 名挑战者一起推进 `_status.dying` 队列。挑战者身上
	     名册的 22 个 `player:"dying"` 濒死技、以及功傲/刀锐这类 `global:"dying"` 观察技，
	     会在"魔王半死"的上下文里连环触发 —— 结算顺序与日志完全读不懂，还可能让挑战者
	     在被救的同时又被反复推进濒死。
	     改法：`recover(3)` 留在 dying（先把魔王救回来），**反噬挪到 dyingAfter**
	     （引擎自动末端阶段：dyingBefore → dyingBegin → content → dyingEnd → dyingAfter），
	     此时魔王已确认脱离濒死，逐个结算 + 逐个过滤"已退场/已濒死"者。 */
	csh_boss_fanpu: {
		priority: -5.2,
		audio: false,
		trigger: { player: "dying" },
		forced: true, locked: true,
		filter(event, player) { return !player.storage.csh_boss_fanpu; },
		content() {
			player.storage.csh_boss_fanpu = true;
			player.popup("反扑");
			player.recover(3);
			game.log(player, "临死【反扑】：回复 3 点体力");
		},
		group: ["csh_boss_fanpu_back"],
	},
	csh_boss_fanpu_back: {
		audio: false, silent: true, forced: true,
		trigger: { player: "dyingAfter" },
		filter(event, player) {
			return !!player.storage.csh_boss_fanpu && !player.storage.csh_boss_fanpu_back;
		},
		content() {
			player.storage.csh_boss_fanpu_back = true;
			var foes = game.filterPlayer(function (cur) {
				return cur.side === false && cur.isIn() && cur.hp > 1;
			});
			for (var i = 0; i < foes.length; i++) foes[i].loseHp(1);
			if (foes.length) game.log(player, "【反扑】余波：" + foes.length + " 名挑战者各流失 1 点体力");
		},
	},

	/* ㊲ 时痕（希里 · 游魂位专属 · 原残念）：你死亡后，魔王摸**两**张牌
	   （v6.6 作者实机反馈："希里的有点弱了，改为：你死亡后，魔王摸两张牌"） */
	csh_boss_you_cannian: {
		priority: -5.6,
		audio: false, forced: true, locked: true,
		forceDie: true, forceOut: true, // ★ 死时触发必需（filterTrigger 的 isDead/出局闸；2026-10-16 修）
		trigger: { player: "dieAfter" },
		filter(event, player) { return !!game.boss && game.boss.isIn(); },
		content() {
			game.boss.draw(2);
			game.log(player, "的【时痕】留痕：魔王摸两张牌");
		},
	},

	/* ============ v5 十二美（金鳞市上市妖灵 · 机制覆盖矩阵） ============
	   作者定案（2026-10-14）："妖灵的机制要覆盖无名杀的各种机制……妖灵自己也可以有
	   自己的主观能动性"、"妖灵和魔王的搭配不是固定的"（随机搭配见 bossdata MINION_POOL）。
	   12 只各覆盖一类机制：距离/手牌上限/响应/回复/出杀/挑拨/判定/弃牌/横置/装备/濒死/拼点。
	   主动技 3 只（百裂/支配/七曜）配 ai.order 供 AI 自主发动；其余全锁定自动。
	   强度纪律：单点温和（"略微恶心但不至于无解"）——所有目标限定挑战者方（side===false）。 */

	/* ㊳ 矜持（凯瑟琳 · 距离）：其他挑战者计算与你的距离+1——她自带一匹「+1 马」 */
	csh_boss_jinchi: {
		audio: false, forced: true, locked: true,
		mod: {
			globalTo(from, to, distance) {
				if (from.side === false) return distance + 1;
			},
		},
	},

	/* ㊴ 冷眼（四宫辉夜 · 手牌上限）：挑战者的手牌上限-1（她健在期间）
	   ★ 必须由 main/bossmode.js 登记 lib.skill.global——否则挑战者的
	     getModableSkills 遍历不到此 mod（checkMod 只走自己技能 + lib.skill.global）。 */
	csh_boss_lengyan: {
		audio: false, forced: true, locked: true,
		mod: {
			maxHandcard(player, num) {
				if (player.side !== false) return;
				if (game.hasPlayer(function (cur) {
					return cur.isIn() && cur !== player && cur.hasSkill("csh_boss_lengyan");
				})) return num - 1;
			},
		},
	},

	/* ㊵ 锈蚀（塞尔达 · 响应）：挑战者使用或打出【闪】后，其随机弃置一张牌——
	   "闪得掉但掉张牌"，响应有代价（引擎双时点 useCard/respond，与 rehujia 同款）。 */
	csh_boss_xiushi: {
		priority: -6.1,
		audio: false,
		trigger: { global: ["useCard", "respond"] },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.player.side === false && event.player.isIn()
				&& event.card && event.card.name === "shan";
		},
		content() {
			trigger.player.randomDiscard();
		},
	},

	/* ---------- 断桃（天使）：恩泽还没落到你头上 ----------
	   ★ v6.6 重写原因（白板）：旧【恩泽】的触发链太长（回复 → 打标 → 下一个摸牌阶段），
	     而收益只有"少摸一张牌"，实机里感觉不到。
	     新机制换到 phaseBegin + 挑【桃】这一无人占的口径：受伤的人，先交出一张急救。 */
	csh_boss_enze: {
		priority: -12.2,
		audio: false,
		trigger: { global: "phaseBegin" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.player && event.player.side === false && event.player.isIn()
				&& event.player.hp < event.player.maxHp && !player.storage.csh_boss_enze_round;
		},
		content() {
			player.storage.csh_boss_enze_round = true;
			var t = trigger.player;
			var pool = t.getCards("h").filter(function (c) { return c.name === "tao"; });
			if (pool.length) {
				player.discard(pool.randomGet());
				game.log(player, "的【断桃】收走了", t, "的一张急救");
			}
		},
		group: ["csh_boss_enze_clear"],
	},
	csh_boss_enze_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_enze_round; },
		content() { player.storage.csh_boss_enze_round = false; },
	},
	/* ㊷ 百裂（春丽 · 出杀 · 主观能动性①）：出牌阶段限一次，视为对攻击范围内
	   一名随机挑战者使用一张【杀】——妖灵也会主动进攻。 */
	csh_boss_bailie: {
		audio: false,
		enable: "phaseUse",
		filter(event, player) {
			return !player.storage.csh_boss_bailie_turn
				&& game.hasPlayer(function (cur) {
					return cur.side === false && cur.isIn() && player.inRange(cur);
				});
		},
		async content(event, trigger, player) {
			player.storage.csh_boss_bailie_turn = true;
			var t = game.filterPlayer(function (cur) {
				return cur.side === false && cur.isIn() && player.inRange(cur);
			}).randomGet();
			if (t) await player.useCard({ name: "sha", isCard: true }, t, false).set("addCount", false);
		},
		ai: {
			order: 6,
			result: {
				player(player) {
					var foes = game.filterPlayer(function (cur) {
						return cur.side === false && cur.isIn() && player.inRange(cur);
					});
					if (!foes.length) return 0;
					/* 目标由规则随机决定，按全部候选的平均收益判断是否发动。 */
					var value = 0;
					foes.forEach(function (cur) {
						value += get.effect(cur, { name: "sha", isCard: true }, player, player);
					});
					return value / foes.length;
				},
			},
		},
		group: ["csh_boss_bailie_clear"],
	},
	csh_boss_bailie_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "phaseEnd" },
		filter(event, player) { return event.player === player && !!player.storage.csh_boss_bailie_turn; },
		content() { player.storage.csh_boss_bailie_turn = false; },
	},

	/* ㊷ 支配（玛琪玛 · 挑拨 · 主观能动性②）：出牌阶段限一次，令一名随机挑战者
	   视为对其攻击范围内的另一名随机挑战者使用一张【杀】——"支配"之名的挑拨离间。 */
	csh_boss_zhipei: {
		audio: false,
		enable: "phaseUse",
		filter(event, player) {
			if (player.storage.csh_boss_zhipei_turn) return false;
			var foes = game.filterPlayer(function (cur) { return cur.side === false && cur.isIn(); });
			if (foes.length < 2) return true;   /* v6.6 保底：不足两人时改为单体压制 */
			return foes.some(function (a) {
				return foes.some(function (b) { return a !== b && a.inRange(b); });
			});
		},
		async content(event, trigger, player) {
			player.storage.csh_boss_zhipei_turn = true;
			var foes = game.filterPlayer(function (cur) { return cur.side === false && cur.isIn(); });
			/* v6.6 保底（作者：这类"配对"技在残局会变成白板）：
			   场上凑不出"互相在攻击范围内"的一对时，改为直接压一名挑战者。 */
			if (foes.length < 2) {
				var solo = foes.randomGet();
				if (solo) { solo.randomDiscard(); player.draw(); }
				game.log(player, "的【支配】找不到棋子，改而亲手压制", solo);
				return;
			}
			var pairs = [];
			foes.forEach(function (a) {
				foes.forEach(function (b) { if (a !== b && a.inRange(b)) pairs.push([a, b]); });
			});
			if (!pairs.length) return;
			var pr = pairs.randomGet();
			await pr[0].useCard({ name: "sha", isCard: true }, pr[1], false).set("addCount", false);
		},
		ai: {
			order: 6,
			result: {
				player(player) {
					var foes = game.filterPlayer(function (cur) { return cur.side === false && cur.isIn(); });
					if (!foes.length) return 0;
					if (foes.length === 1) return 1; /* 保留单体压制分支的原估值。 */
					var value = 0, count = 0;
					foes.forEach(function (from) {
						foes.forEach(function (to) {
							if (from === to || !from.inRange(to)) return;
							/* 出杀者是被支配的挑战者；收益观察者才是技能发动者。 */
							value += get.effect(to, { name: "sha", isCard: true }, from, player);
							count++;
						});
					});
					return count ? value / count : 0;
				},
			},
		},
		group: ["csh_boss_zhipei_clear"],
	},
	csh_boss_zhipei_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "phaseEnd" },
		filter(event, player) { return event.player === player && !!player.storage.csh_boss_zhipei_turn; },
		content() { player.storage.csh_boss_zhipei_turn = false; },
	},

	/* ㊸ 降灵（绫里姐妹 · 判定）：挑战者的判定牌生效前，翻转其花色（黑↔红）——
	   灵媒"逆转因果"；雷击/乐不思蜀/兵粮寸断的判定结果被打乱。 */
	csh_boss_jiangling: {
		priority: -6.3,
		audio: false,
		trigger: { global: "judge" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.player.side === false
				&& event.player.judging && event.player.judging[0];
		},
		content() {
			var p = trigger.player;
			var j = p.judging && p.judging[0];
			if (!j || !j.suit) return;
			var flip = { spade: "heart", heart: "spade", club: "diamond", diamond: "club" };
			var to = flip[j.suit];
			if (!to) return;
			try {
				p.judging[0] = game.createCard(j.name, to, j.number, j.nature);
				game.log(p, "的判定牌被【降灵】翻转为", get.translation(p.judging[0]));
			} catch (e) {}
		},
	},

	/* ---------- ㊹ 花缚（罗宾 · 秋后算账）：本回合动用过【杀】的挑战者，回合结束时被缚走一张牌。 ---------- */
	csh_boss_huafu: {
		priority: -6.4,
		audio: false,
		trigger: { global: "useCard" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.player.side === false && event.player.isIn()
				&& event.card && event.card.name === "sha";
		},
		content() { trigger.player.storage.csh_boss_huafu_hit = true; },
		group: ["csh_boss_huafu_end"],
	},
	csh_boss_huafu_end: {
		audio: false, silent: true, forced: true,
		trigger: { global: "phaseEnd" },
		filter(event, player) {
			return player.isIn() && event.player.side === false && event.player.isIn();
		},
		content() {
			var tp = trigger.player;
			if (tp.storage.csh_boss_huafu_hit) tp.randomDiscard();
			tp.storage.csh_boss_huafu_hit = false;
		},
	},
	csh_boss_bingjie: {
		priority: -6.5,
		audio: false,
		trigger: { global: "roundStart" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && game.hasPlayer(function (cur) {
				return cur.side === false && cur.isIn() && !cur.isLinked();
			});
		},
		content() {
			var t = game.filterPlayer(function (cur) {
				return cur.side === false && cur.isIn() && !cur.isLinked();
			}).randomGet();
			if (t) {
				t.link();
				game.log(t, "被【冰结】横置");
			}
		},
	},

	/* ---------- ㊻ 潜入（艾什 · 夺装）：每轮开始，从随机一名有装备的挑战者处取走一件装备，并直接穿戴。 ---------- */
	csh_boss_qianru: {
		priority: -6.6,
		audio: false,
		trigger: { global: "roundStart" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && game.hasPlayer(function (cur) {
				return cur.side === false && cur.isIn() && cur.countCards("e") > 0;
			});
		},
		content() {
			var pool = game.filterPlayer(function (cur) {
				return cur.side === false && cur.isIn() && cur.countCards("e") > 0;
			});
			if (!pool.length) return;
			var t = pool.randomGet();
			var es = t.getCards("e");
			if (!es.length) return;
			var card = es.randomGet();
			player.gain(card, t, "give");
			try { player.equip(card); } catch (eQ) {}
			game.log(player, "潜入了", t, "的行囊");
		},
	},
	csh_boss_qiannian: {
		priority: -6.7,
		audio: false,
		trigger: { player: "dying" },
		forced: true, locked: true,
		filter(event, player) {
			return !player.storage.csh_boss_qiannian_used;
		},
		content() {
			player.storage.csh_boss_qiannian_used = true;
			player.recoverTo(3);
			player.draw(2);
		},
	},

	/* ㊽ 七曜（蒂法 · 拼点 · 主观能动性③）：出牌阶段限一次，与一名随机挑战者拼点，
	   若你赢，对其造成1点伤害——拳法家的正面挑战（拼点消耗对方一张牌）。 */
	/* ---------- 七曜（蒂法）：赌一把，输了也有彩头 ----------
	   ★ v6.6 重写原因（白板）：旧【七曜】只有"拼点赢→1 伤"，而妖灵手牌通常偏少，
	     拼点常输 ⇒ 大概率什么也不发生（她自己还要弃光手牌才能一直拼）。
	     新机制保留"拼点"的设计感，但补上**输的保底**：赢取伤害、输取手牌。 */
	csh_boss_yaoqi: {
		audio: false,
		enable: "phaseUse",
		filter(event, player) {
			return !player.storage.csh_boss_yaoqi_turn && player.countCards("h") > 0
				&& game.hasPlayer(function (cur) {
					return cur.side === false && cur.isIn() && cur.countCards("h") > 0;
				});
		},
		async content(event, trigger, player) {
			player.storage.csh_boss_yaoqi_turn = true;
			var t = game.filterPlayer(function (cur) {
				return cur.side === false && cur.isIn() && cur.countCards("h") > 0;
			}).randomGet();
			if (!t) return;
			var res = await player.chooseToCompare(t).forResult();
			if (res && res.bool && !res.tie) {
				await t.damage(1, "normal", player);
			} else {
				player.draw(2);
				game.log(player, "的【七曜】没赌赢，但也摸到了两张牌");
			}
		},
		ai: { order: 5, result: { player: 1 } },
		group: ["csh_boss_yaoqi_clear"],
	},
	csh_boss_yaoqi_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_yaoqi_turn; },
		content() { player.storage.csh_boss_yaoqi_turn = false; },
	},
	/* ㊾ 百豪（春野樱 · 第二十席）：每轮开始时，你回复1点体力——医疗忍者的
	   自我修复：不处理她就一直磨人（拆怪优先级 +1），回复受体力上限自然截断。 */
	csh_boss_baihao: {
		priority: -6.8,
		audio: false,
		trigger: { global: "roundStart" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && player.hp < player.maxHp;
		},
		content() {
			player.recover(1);
		},
	},

	/* ============================================================
	   v6 新批次（2026-10-15 作者提供 30 张立绘）——分组：
	     · 十卫（10 只 · 魔王向）：为魔王供牌/护甲/回复/护佑，或反噬挑战者
	     · 二十刑（20 只 · 挑战者向）：摸牌/距离/判定区/回复/出牌 各面施压
	   强度纪律：单点温和、每轮限一次为主、目标一律 side===false（不打自家）；
	   全部为 global 触发（挂在妖灵身上、监听全场），不新增主动技（保持"零 AI 配置"）。
	   命名：2 字铁律；子技 silent。
	   ============================================================ */

	/* ---------- 十卫 ② 永动（人造人 · 扩容）：魔王手牌上限 +3（跨角色 mod · 须 bossmode 登记 lib.skill.global）。 ---------- */
	csh_boss_yongdong: {
		priority: -7.1,
		audio: false, silent: true, forced: true, locked: true,
		mod: {
			maxHandcard(player, num) {
				if (player !== game.boss) return;
				if (game.hasPlayer(function (cur) {
					return cur.isIn() && cur.hasSkill("csh_boss_yongdong");
				})) return num + 3;
			},
		},
	},
	csh_boss_tianzhou: {
		priority: -7.2,
		audio: false,
		trigger: { global: "roundStart" },
		forced: true, locked: true,
		filter(event, player) { return player.isIn() && !!game.boss && game.boss.isIn(); },
		content() {
			game.boss.changeHujia(1);
			game.log(player, "【天舟】赐予魔王", 1, "点护甲");
		},
	},

	/* ---------- 抄写（佐良娜）：写轮眼抄下这一刀 ----------
	   ★ v6.6 重写原因：旧【血瞳】（魔王对"手牌多于体力"者伤害 +1）被伊芙【剑刃】
	     （魔王造成的伤害**无条件** +1）覆盖——条件版永远弱于无条件版。
	     新机制走"镜像反击"这一无人占的口径：你对我方出刀，我也照抄一刀。 */
	csh_boss_xuetong: {
		priority: -11.4,
		audio: false,
		trigger: { global: "useCardToTarget" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && game.boss && event.player && event.player.side === false
				&& event.player.isIn() && event.target === game.boss
				&& event.card && event.card.name === "sha" && !player.storage.csh_boss_xuetong_round;
		},
		content() {
			player.storage.csh_boss_xuetong_round = true;
			var t = trigger.player;
			player.useCard({ name: "sha", isCard: true }, t, false).set("addCount", false);
			game.log(player, "的【抄写】把这一刀原样还给了", t);
		},
		group: ["csh_boss_xuetong_clear"],
	},
	csh_boss_xuetong_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_xuetong_round; },
		content() { player.storage.csh_boss_xuetong_round = false; },
	},
	/* ---------- 十卫 ⑧ 随和（加藤惠 · 爆发税）：魔王**单次受到 3 点或以上伤害**时，伤害来源失去 1 点体力上限。
	   —— v6.3 替换原「伤害减半」（作者："魔王受到的伤害减半 这个不好"）。
	      把"无差别减伤"换成对**大伤害**的定点惩罚：小刀磨血不吃亏，一波带走要付代价，
	      玩家的决策从"能不能打"变成"敢不敢打大的"；同时它退出了与【山雾】【神盾】同挤的"减伤"家族。 ---------- */
	/* ---------- 记恨（加藤惠）：邻座那本记名册 ----------
	   ★ v6.6 重写原因：旧【随和】（魔王单次受 ≥3 伤 → 来源 −1 上限）既被妮露【舞祈】
	     （同为 −1 上限，但条件是常见的"用【杀】伤到魔王"）覆盖，自己又是白板
	     ——挑战者常态一刀 1~2 点，单次 ≥3 伤很罕见。
	     新机制保留"重手才记"的入口（这是她的性格），但效果换成"抽牌 + 自补"这一无人占的口径。 */
	csh_boss_linzuo: {
		priority: -11.8,
		audio: false,
		trigger: { global: "damageEnd" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && game.boss && event.player === game.boss && event.num >= 3
				&& event.source && event.source.side === false && event.source.isIn()
				&& !player.storage.csh_boss_linzuo_round;
		},
		content() {
			player.storage.csh_boss_linzuo_round = true;
			trigger.source.randomDiscard();
			player.recover(1);
			game.log(player, "的【记恨】记下了", trigger.source, "这一记重手");
		},
		group: ["csh_boss_linzuo_clear"],
	},
	csh_boss_linzuo_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_linzuo_round; },
		content() { player.storage.csh_boss_linzuo_round = false; },
	},
	/* ---------- 十卫 ⑥ 光焰（光熙 · 熔盾）：每轮限一次，魔王的【杀】指定目标后，熔尽该目标所有的【闪】。 ---------- */
	csh_boss_guangyan: {
		priority: -7.5,
		audio: false,
		trigger: { global: "useCardToTarget" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.player === game.boss && event.target !== player
				&& event.target.side === false && event.target.isIn()
				&& event.card && event.card.name === "sha"
				&& !player.storage.csh_boss_guangyan_round;
		},
		content() {
			player.storage.csh_boss_guangyan_round = true;
			var t = trigger.target;
			var shans = t.getCards("h").filter(function (c) { return c.name === "shan"; });
			if (shans.length) {
				t.discard(shans);
				game.log(player, "的【光焰】熔尽了", t, "的【闪】");
			}
		},
		group: ["csh_boss_guangyan_clear"],
	},
	csh_boss_guangyan_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_guangyan_round; },
		content() { player.storage.csh_boss_guangyan_round = false; },
	},	/* ---------- 十卫 ⑥ 幽灵（佩罗娜）：魔王被【杀】打伤后，随机弃使用者一张牌（每轮一次） ---------- */
	/* ---------- 现身（佩罗娜）：鬼魂挑走你手里最要紧的那张 ----------
	   ★ v6.6 重写原因：旧【幽灵】与妮露【舞祈】的 filter **完全相同**（都是"魔王被【杀】伤"）
	     ⇒ 同一件事被两只妖灵罚两遍；且幽灵的"弃一张牌"明显弱于舞祈的"永久 −1 上限"。
	     新机制换到 phaseBegin + 挑牌这一无人占的口径：不惩罚打人，专抽急救。 */
	csh_boss_youling: {
		priority: -11.6,
		audio: false,
		trigger: { global: "phaseBegin" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.player && event.player.side === false && event.player.isIn()
				&& !player.storage.csh_boss_youling_round;
		},
		content() {
			player.storage.csh_boss_youling_round = true;
			var t = trigger.player;
			var pool = t.getCards("h").filter(function (c) { return c.name === "shan" || c.name === "tao"; });
			if (pool.length) {
				player.discard(pool.randomGet());
				game.log(player, "的【现身】抽走了", t, "手里的一样紧要东西");
			} else {
				player.draw();
				game.log(player, "的【现身】在", t, "身上什么也没找到");
			}
		},
		group: ["csh_boss_youling_clear"],
	},
	csh_boss_youling_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_youling_round; },
		content() { player.storage.csh_boss_youling_round = false; },
	},
	/* ---------- 十卫 ① 忍舞（不知火舞 · 追刀）：每轮限一次，魔王使用【杀】后立即再补一刀（视为再使用一张【杀】）。 ---------- */
	csh_boss_renwu: {
		priority: -7.7,
		audio: false,
		trigger: { global: "useCard" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.player === game.boss && !!game.boss
				&& !player.storage.csh_boss_renwu_round
				&& event.card && event.card.name === "sha"
				&& game.hasPlayer(function (cur) { return cur.side === false && cur.isIn(); });
		},
		async content(event, trigger, player) {
			player.storage.csh_boss_renwu_round = true;
			var t = game.filterPlayer(function (cur) { return cur.side === false && cur.isIn(); }).randomGet();
			if (!t) return;
			game.log(player, "的【忍舞】为魔王续上一刀");
			await game.boss.useCard({ name: "sha", isCard: true }, t, false).set("addCount", false);
		},
		group: ["csh_boss_renwu_clear"],
	},
	csh_boss_renwu_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_renwu_round; },
		content() { player.storage.csh_boss_renwu_round = false; },
	},
	csh_boss_shunbu: {
		priority: -7.8,
		audio: false,
		trigger: { global: "damageBegin3" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.player === game.boss && event.num > 0
				&& !player.storage.csh_boss_shunbu_round
				&& game.hasPlayer(function (cur) { return cur.side === false && cur.isIn(); });
		},
		content() {
			player.storage.csh_boss_shunbu_round = true;
			var n = trigger.num;
			trigger.num = 0;
			var t = game.filterPlayer(function (cur) { return cur.side === false && cur.isIn(); }).randomGet();
			if (t) {
				game.log(player, "的【瞬步】将这一击移给了", t);
				t.damage(n, "nosource");
			}
		},
		group: ["csh_boss_shunbu_clear"],
	},
	csh_boss_shunbu_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_shunbu_round; },
		content() { player.storage.csh_boss_shunbu_round = false; },
	},	/* ---------- 十卫 ⑨ 双枪（好运姐）：魔王【杀】伤害后再补 1 点（每轮一次） ---------- */
	csh_boss_shuangqiang: {
		priority: -7.9,
		audio: false,
		trigger: { global: "damageEnd" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && game.boss && event.source === game.boss && event.num > 0
				&& event.player && event.player.side === false && event.player.isIn()
				&& event.card && event.card.name === "sha" && !player.storage.csh_boss_shuangqiang_round;
		},
		content() {
			player.storage.csh_boss_shuangqiang_round = true;
			game.log(player, "【双枪】追了一发");
			trigger.player.damage(1, game.boss);
		},
		group: ["csh_boss_shuangqiang_clear"],
	},
	csh_boss_shuangqiang_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_shuangqiang_round; },
		content() { player.storage.csh_boss_shuangqiang_round = false; },
	},

	/* ---------- ㊾ 舞祈（妮露 · 削上限）：每轮限一次，挑战者用【杀】伤到魔王，便永久失去 1 点体力上限。 ---------- */
	csh_boss_wuqi: {
		priority: -8,
		audio: false,
		trigger: { global: "damageEnd" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.player === game.boss && event.num > 0
				&& event.source && event.source.side === false && event.source.isIn()
				&& event.card && event.card.name === "sha"
				&& !player.storage.csh_boss_wuqi_round;
		},
		async content(event, trigger, player) {
			player.storage.csh_boss_wuqi_round = true;
			var src = trigger.source;
			/* ★ 2026-10-16 晚修（技能审查批）：旧写法直改 `src.maxHp / src.hp` 两个字段，绕过
			   引擎体力状态机（与【换血】修过两次的同一类病）——"减少了X点体力上限"日志、
			   loseMaxHp 事件、依赖上限变动的技能/记录全部收不到。
			   改用引擎原生 `loseMaxHp`（content.ts loseMaxHp：改上限 + update + 事件全套）；
			   **下限仍守 1**（本技"夺上限"不杀生：maxHp≤1 时不再扣——引擎版 loseMaxHp 在
			   上限归 0 时会直接判死，那不是本技的设计）。
			   `getHp()` 不钳上限（引擎语义：hp 可暂超 maxHp）⇒ 沿用旧实现的收回动作，
			   在 await 事件落地后把 hp 降到新上限，保持与旧实现完全一致的面板状态。 */
			try {
				var d = Math.min(1, (Number(src.maxHp) || 1) - 1);
				if (d > 0) {
					await src.loseMaxHp(d);
					if (src.hp > src.maxHp) { src.hp = src.maxHp; src.update(); }
				} else {
					src.update();
				}
			} catch (e) {}
			game.log(player, "的【舞祈】夺去了", src, "一点体力上限");
		},
		group: ["csh_boss_wuqi_clear"],
	},
	csh_boss_wuqi_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_wuqi_round; },
		content() { player.storage.csh_boss_wuqi_round = false; },
	},	/* ---------- 二十刑 ① 天候（娜美）：挑战者摸牌阶段 -1 ---------- */
	csh_boss_tianhou: {
		priority: -8.1,
		audio: false,
		trigger: { global: "phaseDrawBegin2" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.player.side === false && !event.numFixed && event.num > 0;
		},
		content() { trigger.num--; },
	},

	/* ---------- 反剪（小南）：剪刀伸进装备区 ----------
	   ★ v6.6 重写原因：旧【纸舞】（每轮开始随机弃有装备者装备区一张）被艾什【潜入】
	     （同时机、同目标、同数量，**多一个"取走并穿戴"**）与菲伦【冰霜】（受伤后全弃）
	     双重覆盖，且触发条件与潜入**逐字相同**。
	     新机制换到 phaseEnd + 剪装备这一无人占的口径，并把纸屑回补自身（3 血妖灵正好差 1 点满）。 */
	csh_boss_zhiwu: {
		priority: -11.7,
		audio: false,
		trigger: { global: "phaseEnd" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.player && event.player.side === false && event.player.isIn()
				&& event.player.countCards("e") > 0 && !player.storage.csh_boss_zhiwu_round;
		},
		content() {
			player.storage.csh_boss_zhiwu_round = true;
			var t = trigger.player;
			var card = t.getCards("e").randomGet();
			if (card) {
				t.discard(card);
				player.recover(1);
				game.log(player, "的【反剪】剪断了", t, "的一件装备");
			}
		},
		group: ["csh_boss_zhiwu_clear"],
	},
	csh_boss_zhiwu_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_zhiwu_round; },
		content() { player.storage.csh_boss_zhiwu_round = false; },
	},
	csh_boss_lianyou: {
		priority: -8.3,
		audio: false,
		trigger: { global: "damageEnd" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.source && event.source.side === false && event.source.isIn();
		},
		content() { trigger.source.storage.csh_boss_lianyou_hit = true; },
		group: ["csh_boss_lianyou_end"],
	},
	csh_boss_lianyou_end: {
		audio: false, silent: true, forced: true,
		trigger: { global: "phaseEnd" },
		filter(event, player) {
			return player.isIn() && event.player.side === false && event.player.isIn();
		},
		content() {
			var tp = trigger.player;
			if (!tp.storage.csh_boss_lianyou_hit) tp.loseHp(1);
			tp.storage.csh_boss_lianyou_hit = false;
		},
	},
	csh_boss_fenshen: {
		priority: -8.4,
		audio: false,
		trigger: { global: "useCard" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.player.side === false && event.player.isIn()
				&& event.card && (event.card.name === "tao" || event.card.name === "jiu")
				&& !player.storage.csh_boss_fenshen_round;
		},
		content() {
			player.storage.csh_boss_fenshen_round = true;
			trigger.player.loseHp(1);
			game.log(player, "的【焚身】先在", trigger.player, "身上烧了一把");
		},
		group: ["csh_boss_fenshen_clear"],
	},
	csh_boss_fenshen_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_fenshen_round; },
		content() { player.storage.csh_boss_fenshen_round = false; },
	},

	/* ---------- 二十刑 ⑤ 离悲（柳离悲）：每轮限一次，挑战者使用【杀】后，弃置其一张【闪】。
	   —— v6.3 从"随机弃一张牌"改成**定向拆防御**（"出刀的人，退路也一并被带走"）：
	      它退出了【锈蚀】【花缚】【幽灵】【讽言】同挤的"随机弃置一张牌"家族，
	      换成与魔王的【杀】直接配合的拆【闪】。 ---------- */
	csh_boss_libei: {
		priority: -8.5,
		audio: false,
		trigger: { global: "useCard" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.player && event.player.side === false && event.player.isIn()
				&& event.card && event.card.name === "sha" && !player.storage.csh_boss_libei_round;
		},
		content() {
			player.storage.csh_boss_libei_round = true;
			var shans = trigger.player.getCards("h").filter(function (c) { return c.name === "shan"; });
			if (shans.length) {
				trigger.player.discard(shans.randomGet());
				game.log(player, "的【离悲】割断了", trigger.player, "的退路");
			}
		},
		group: ["csh_boss_libei_clear"],
	},
	csh_boss_libei_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_libei_round; },
		content() { player.storage.csh_boss_libei_round = false; },
	},

	/* ---------- 空振（樱岛麻衣）：打向空气的一击 ----------
	   她不需要"挡"下这一击——你打的是空气，手却先松了。
	   ★ v6.6 重写原因：旧【隐身】（每轮一次让指向她的【杀】无效）被露娜的【月影】
	     （每轮一次让指定她的**任意**牌无效）严格覆盖——同一时点、同一效果、月影范围更大。
	     新机制换成"反噬指定者"这一**没人占的维度**，与月影（纯防御）彻底分开。 */
	csh_boss_yinshen: {
		priority: -11.1,
		audio: false,
		trigger: { global: "useCardToTarget" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.player && event.player.side === false && event.player.isIn()
				&& event.target === player && !player.storage.csh_boss_yinshen_round;
		},
		content() {
			player.storage.csh_boss_yinshen_round = true;
			trigger.player.randomDiscard();
			player.draw();
			game.log(player, "【空振】：", trigger.player, "的一手打进了空气里");
		},
		group: ["csh_boss_yinshen_clear"],
	},
	csh_boss_yinshen_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_yinshen_round; },
		content() { player.storage.csh_boss_yinshen_round = false; },
	},
	/* ---------- 蓄执（生志摩妄）：攒着，等死的那一刻 ----------
	   ★ v6.6 重写原因（白板）：旧【妄执】要"有人打她"才触发，妖灵不是优先目标 ⇒ 常年不动。
	     新机制换到"跨轮积蓄 → 死亡兑现"这一无人占的口径：她活得越久、死得越值，
	     与妖灵的【重整】/【池悯】形成了一个正确的经济循环。 */
	csh_boss_wangzhi: {
		priority: -12.4,
		audio: false,
		trigger: { global: "roundStart" },
		forced: true, locked: true,
		filter(event, player) { return player.isIn() && (player.storage.csh_boss_wangzhi_n || 0) < 3; },
		content() {
			player.storage.csh_boss_wangzhi_n = (player.storage.csh_boss_wangzhi_n || 0) + 1;
			player.addMark("csh_boss_wangzhi", 1, false);
			game.log(player, "的【蓄执】又深了一层（" + player.storage.csh_boss_wangzhi_n + "/3）");
		},
		group: ["csh_boss_wangzhi_die"],
	},
	csh_boss_wangzhi_die: {
		audio: false, silent: true, forced: true,
		forceDie: true, forceOut: true, // ★ 死时触发必需（filterTrigger 的 isDead/出局闸；2026-10-16 修）
		trigger: { player: "dieAfter" },
		filter(event, player) { return !!game.boss && game.boss.isIn() && (player.storage.csh_boss_wangzhi_n || 0) > 0; },
		content() {
			var n = player.storage.csh_boss_wangzhi_n || 0;
			player.storage.csh_boss_wangzhi_n = 0;
			game.boss.draw(n);
			game.log(player, "的【蓄执】兑现了：魔王摸 " + n + " 张牌");
		},
	},
	/* ---------- ㊿ 山雾（田山 · 钝刀）：挑战者造成的伤害 −1——雾里看不清伤口。 ---------- */
	csh_boss_shanwu: {
		priority: -8.9,
		audio: false,
		trigger: { global: "damageBegin3" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.source && event.source.side === false && event.num > 0;
		},
		content() { trigger.num = Math.max(0, trigger.num - 1); },
	},


	/* ---------- ㊿ 空手（毛利兰 · 二十刑）：每轮限一次，挑战者使用【杀】指定魔王为目标后，该挑战者本回合**不能再使用【杀】**。
	   —— "空手夺白刃"。实现 = 主技打标 + 独立 silent mod（cardEnabled）拦牌，
	      与【冷眼】【永动】【燃心】同通路：mod 技必须登记 lib.skill.global（E12）。
	      v6.3 替换原「此【杀】伤害改为 0」（与【隐身】【月影】功能重叠）。 ---------- */
	csh_boss_kongshou: {
		priority: -8.7,
		audio: false,
		trigger: { global: "useCardToTarget" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && game.boss
				&& event.player && event.player.side === false && event.player.isIn()
				&& event.target === game.boss
				&& event.card && event.card.name === "sha"
				&& !player.storage.csh_boss_kongshou_round;
		},
		content() {
			player.storage.csh_boss_kongshou_round = true;
			try { trigger.player.storage.csh_boss_kongshou_seal = true; } catch (e) {}
			game.log(player, "的【空手】夺去了", trigger.player, "继续出刀的能力");
		},
		group: ["csh_boss_kongshou_clear"],
	},
	/* 空手的封杀段：独立 silent mod（必须登记 lib.skill.global）——拦"使用【杀】"本身。 */
	csh_boss_kongshou_lock: {
		audio: false, silent: true, forced: true, locked: true,
		mod: {
			cardEnabled(card, player) {
				if (card && card.name === "sha" && player.storage && player.storage.csh_boss_kongshou_seal) return false;
			},
		},
	},
	csh_boss_kongshou_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "phaseEnd" },
		filter(event, player) {
			return !!(event.player && event.player.storage && event.player.storage.csh_boss_kongshou_seal);
		},
		content() {
			trigger.player.storage.csh_boss_kongshou_seal = false;
			player.storage.csh_boss_kongshou_round = false;
		},
	},

	/* ---------- 套索（神奇女侠）：真言套索 ----------
	   ★ v6.6 重写原因：旧【神盾】（每轮一次、魔王受【杀】伤害 −1）被田山【山雾】
	     （挑战者造成的**任何**伤害 −1、无次数限制、无牌种限制）严格覆盖。
	     新机制走"借用"这一无人占的口径：不打你，但把你的底牌问出来。 */
	csh_boss_shendun: {
		priority: -11.3,
		audio: false,
		trigger: { global: "damageEnd" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && game.boss && event.player === game.boss && event.source
				&& event.source.side === false && event.source.isIn() && event.source.countCards("h") > 0
				&& !player.storage.csh_boss_shendun_round;
		},
		content() {
			player.storage.csh_boss_shendun_round = true;
			var src = trigger.source;
			var card = src.getCards("h").randomGet();
			if (card) {
				player.gain(card, src, "give");
				src.draw();
				game.log(player, "的【套索】从", src, "身上问出了一张牌");
			}
		},
		group: ["csh_boss_shendun_clear"],
	},
	csh_boss_shendun_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_shendun_round; },
		content() { player.storage.csh_boss_shendun_round = false; },
	},
	/* ---------- 五十 数据（结衣 · 回响）：每轮限一次，挑战者的锦囊结算后，她捞回一条数据（摸一张牌）。 ---------- */
	csh_boss_shuju: {
		priority: -9.1,
		audio: false,
		trigger: { global: "useCardAfter" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.player.side === false && event.player.isIn()
				&& event.card && get.type(event.card) === "trick"
				&& !player.storage.csh_boss_shuju_round;
		},
		content() {
			player.storage.csh_boss_shuju_round = true;
			player.draw();
			game.log(player, "从【数据】里捞回一张牌");
		},
		group: ["csh_boss_shuju_clear"],
	},
	csh_boss_shuju_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_shuju_round; },
		content() { player.storage.csh_boss_shuju_round = false; },
	},	/* ---------- 二十刑 ⑫ 桃夭（绫濑桃）：挑战者回复量减半（每轮一次） ---------- */
	/* ---------- 桃芳（绫濑桃）：每一口都只算一半 ----------
	   ★ v6.6 重写原因（白板）：旧【桃芳】要"单次回复 ≥2 点"才触发，而【桃】只回 1 点
	     ⇒ 正常对局里几乎不动。
	     新机制：放宽到**任何一次回复**都削（向上取整、至少 1 点），但守住一条底线——
	     **濒死自救不受影响**（救命的那一口不削，否则濒死技会被它直接废掉）。 */
	csh_boss_taoyao: {
		priority: -11.9,
		audio: false,
		trigger: { global: "recoverBegin" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.player && event.player.side === false && event.player.isIn()
				&& event.player.hp > 0 && event.num > 1 && !player.storage.csh_boss_taoyao_round;
		},
		content() {
			player.storage.csh_boss_taoyao_round = true;
			trigger.num = Math.ceil(trigger.num / 2);
			game.log(player, "的【桃芳】把这一口疗愈削去了一半");
		},
		group: ["csh_boss_taoyao_clear"],
	},
	csh_boss_taoyao_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_taoyao_round; },
		content() { player.storage.csh_boss_taoyao_round = false; },
	},
	/* ---------- 五十 冰霜（菲伦 · 冻装）：每轮限一次，挑战者伤到她，其装备区全面结冰（全数弃置）。 ---------- */
	csh_boss_bingshuang: {
		priority: -9.3,
		audio: false,
		trigger: { global: "damageEnd" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.player === player && event.num > 0
				&& event.source && event.source.side === false && event.source.isIn()
				&& !player.storage.csh_boss_bingshuang_round;
		},
		content() {
			player.storage.csh_boss_bingshuang_round = true;
			var es = trigger.source.getCards("e");
			if (es.length) {
				trigger.source.discard(es);
				game.log(player, "的【冰霜】冻裂了", trigger.source, "的装备");
			}
		},
		group: ["csh_boss_bingshuang_clear"],
	},
	csh_boss_bingshuang_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_bingshuang_round; },
		content() { player.storage.csh_boss_bingshuang_round = false; },
	},
	/* ---------- 恋缚（菲瓦伦汀）：你添一件装备，她就缠上来 ----------
	   ★ v6.6 重写原因（白板）：旧【恋缚】要"挑战者**对她**用牌"才触发，而妖灵从来不是
	     挑战者的优先目标 ⇒ 只有群体锦囊才偶尔带上她，常年不动。
	     新机制改盯"装备牌"这一她自己就能观察到的动作，并且**不需要别人针对她**。 */
	csh_boss_lianfu: {
		priority: -12.3,
		audio: false,
		trigger: { global: "useCard" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.player && event.player.side === false && event.player.isIn()
				&& event.card && get.type(event.card) === "equip" && !player.storage.csh_boss_lianfu_round;
		},
		content() {
			player.storage.csh_boss_lianfu_round = true;
			player.draw(2);
			trigger.player.randomDiscard();
			game.log(player, "的【恋缚】缠上了", trigger.player, "添置的新装备");
		},
		group: ["csh_boss_lianfu_clear"],
	},
	csh_boss_lianfu_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_lianfu_round; },
		content() { player.storage.csh_boss_lianfu_round = false; },
	},
	/* ---------- 二十刑 ⑮ 毒蝶（蝴蝶忍）：挑战者回合结束若已受伤则流失 1（每轮一次） ---------- */
	csh_boss_dudie: {
		priority: -9.5,
		audio: false,
		trigger: { global: "phaseEnd" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.player.side === false && event.player.isIn()
				&& event.player.hp < event.player.maxHp && !player.storage.csh_boss_dudie_round;
		},
		content() {
			player.storage.csh_boss_dudie_round = true;
			game.log(player, "【毒蝶】的毒发作了");
			trigger.player.loseHp(1);
		},
		group: ["csh_boss_dudie_clear"],
	},
	csh_boss_dudie_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_dudie_round; },
		content() { player.storage.csh_boss_dudie_round = false; },
	},

	/* ---------- 二十刑 ⑯ 讽言（雪之下雪乃）：挑战者使用锦囊后随机弃 1（每轮一次） ---------- */
	csh_boss_fengyan: {
		priority: -9.6,
		audio: false,
		trigger: { global: "useCard" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.player.side === false && event.player.isIn()
				&& event.card && get.type(event.card) === "trick" && !player.storage.csh_boss_fengyan_round;
		},
		content() {
			player.storage.csh_boss_fengyan_round = true;
			game.log(player, "【讽言】让", trigger.player, "的算计付出了代价");
			trigger.player.randomDiscard();
		},
		group: ["csh_boss_fengyan_clear"],
	},
	csh_boss_fengyan_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_fengyan_round; },
		content() { player.storage.csh_boss_fengyan_round = false; },
	},

	/* ---------- ㊿ 月影（露娜 · 折光）：每轮限一次，挑战者指向她的第一张牌落进月光里（无效）。 ---------- */
	csh_boss_yueying: {
		priority: -9.7,
		audio: false,
		trigger: { global: "useCardToTarget" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.target === player && event.player.side === false
				&& !player.storage.csh_boss_yueying_round;
		},
		content() {
			player.storage.csh_boss_yueying_round = true;
			trigger.cancel();
			game.log(player, "以【月影】折去了这一手");
		},
		group: ["csh_boss_yueying_clear"],
	},
	csh_boss_yueying_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "roundStart" },
		filter(event, player) { return !!player.storage.csh_boss_yueying_round; },
		content() { player.storage.csh_boss_yueying_round = false; },
	},
	csh_boss_ranxin: {
		priority: -9.8,
		audio: false,
		trigger: { global: "useCard" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && event.player.side === false && event.player.isIn()
				&& event.card && get.type(event.card) !== "equip";
		},
		content() {
			var tp = trigger.player;
			var n = tp.storage.csh_boss_ranxin_n || 0;
			tp.storage.csh_boss_ranxin_n = Math.min(3, n + 1);
		},
		group: ["csh_boss_ranxin_clear"],
	},
	csh_boss_ranxin_clear: {
		audio: false, silent: true, forced: true,
		trigger: { global: "phaseEnd" },
		filter(event, player) { return !!event.player.storage.csh_boss_ranxin_n; },
		content() { trigger.player.storage.csh_boss_ranxin_n = 0; },
	},
	/* 燃心的上限部分：独立 silent mod（需 lib.skill.global 登记——
	   与【冷眼】同通路；带触发器的技能不能进 global，否则每个角色都会触发一次）。 */
	csh_boss_ranxin_mod: {
		audio: false, silent: true, forced: true, locked: true,
		mod: {
			maxHandcard(player, num) {
				var n = player.storage && player.storage.csh_boss_ranxin_n;
				if (n > 0) return num - n;
			},
		},
	},	/* ---------- 二十刑 ⑲ 鬼哭（鬼の子）：挑战者被从濒死救回后流失 1（每轮一次） ---------- */
	/* ---------- 哀鸣（鬼の子）：哭声落地，人人自危 ----------
	   ★ v6.6 重写原因（白板）：旧【鬼哭】要"挑战者本回合进入过濒死**且被救回**"才触发
	     ——链路太长，正常对局里根本不出现。
	     新机制换到"死亡后给全场留一张符"这一无人占的口径（与六式的"死亡段给魔王收拢"
	     方向相反：那批是给魔王，这只是给挑战者留痛）。 */
	csh_boss_guiku: {
		priority: -12.1,
		audio: false,
		forceDie: true, forceOut: true, // ★ 死时触发必需（filterTrigger 的 isDead/出局闸；2026-10-16 修）
		trigger: { player: "dieAfter" },
		forced: true, locked: true,
		filter(event, player) {
			return game.hasPlayer(function (cur) { return cur.side === false && cur.isIn() && cur.countCards("j") === 0; });
		},
		content() {
			var foes = game.filterPlayer(function (cur) {
				return cur.side === false && cur.isIn() && cur.countCards("j") === 0;
			});
			for (var i = 0; i < foes.length; i++) {
				try { foes[i].addJudge(game.createCard("lebu")); } catch (e) {}
			}
			if (foes.length) game.log(player, "的【哀鸣】留在了每个人心里");
		},
	},



	/* ---------- 二十刑 ⑳ 迷路（八九寺真宵）：每轮开始，一名随机挑战者获得【乐不思蜀】 ---------- */
	csh_boss_milu: {
		priority: -10,
		audio: false,
		trigger: { global: "roundStart" },
		forced: true, locked: true,
		filter(event, player) {
			return player.isIn() && game.hasPlayer(function (cur) {
				return cur.side === false && cur.isIn() && cur.countCards("j") === 0;
			});
		},
		content() {
			var t = game.filterPlayer(function (cur) {
				return cur.side === false && cur.isIn() && cur.countCards("j") === 0;
			}).randomGet();
			if (!t) return;
			try {
				t.addJudge(game.createCard("lebu"));
				game.log(player, "【迷路】让", t, "迷失了方向");
			} catch (e) {}
		},
	},

	/* ============ 记录技 ============ */

	/* ㊳ csh_boss_watch：对局收尾记录（静默 · 双向）
	   · 玩家为挑战者方：魔王阵亡 → 记一条击破（附速通轮数 v4.2）；
	   · 玩家即魔王（应战模式 v4.2）：魔王死 = 负；最后一名挑战者倒下 = 胜 —— 记入"魔王方战绩" */
	csh_boss_watch: {
		audio: false, silent: true, forced: true, locked: true,
		/* ★★ 2026-10-16 修（关键）：本技挂在魔王身上、global:dieAfter 域——挑战者击破魔王 /
		   应战判负时，「技能持有者（魔王）自己就是死者」，此前无 forceDie 会被
		   lib.filter.filterTrigger 的 `!info.forceDie && player.isDead()` 拦截 ⇒
		   主讨伐记录 / 应战负场 从未写入（"讨伐录全 0 / 亲征 0 胜 0 负"根因）。
		   同款修复先例见 core/csh_interact.js（"dieAfter 时 player 已是 dead"）。 */
		forceDie: true, forceOut: true,
		trigger: { global: "dieAfter" },
		filter(event) {
			if (!game.me || !game.boss) return false;
			/* v5.3 妖灵讨伐：妖灵阵亡也走本监听（击破即时结算 · 不管输赢 · 重复可得） */
			if (String((event.player && event.player.name) || "").indexOf("csh_boss_minion_") === 0) return true;
			return game.me === game.boss || event.player === game.boss;
		},
		content() {
			try {
				var rec = lib.cshBossRecord;
				/* ★ 2026-10-16 晚（第四批根因修复后）——讨伐链"故障自曝"诊断行：
				   根因已查明：dieAfter（die 事件的 After 阶段）在"对局收尾型死亡"里推进不到
				   （同一死亡事件更早步骤就 game.checkResult()→game.over()）——三种结局改由
				   game.over 收尾通道补记（csh_bossrecord.recordOnOver，见该函数头注）。
				   本行为 **dieAfter 通道**的自曝：妖灵阵亡/非收尾时序会打出来；
				   「击破魔王 / 应战胜负」结算时看收尾通道的［讨伐-诊断］行与「新的讨伐记录」。 */
				try {
					var dbg = "[池子魔将][讨伐-诊断] dieAfter 通道 · 死者=" +
						((trigger.player && trigger.player.name) || "?") +
						" · 玩家=" + (game.me === game.boss ? "魔王（应战）" : "挑战者") +
						" · record 模块=" + (rec ? "在位" : "缺失");
					if (typeof console !== "undefined" && console.log) console.log(dbg);
					if (lib.cshDebug && typeof lib.cshDebug.info === "function") lib.cshDebug.info(dbg);
				} catch (eDbg) {}
				if (!rec) return;
				/* 妖灵讨伐收益分支（挑战者 3000 / 应战 1000 + 功勋 + 金鳞市热度 · 单点常量在 bossrecord）
				   v6.2：取消同局去重（作者："妖灵收益不再去重"）→ 每次击破都结算；**2026-10-16 三轮修正：两场景两值**（挑战者 3000 / 应战 1000，asBoss 由本处按 game.me === game.boss 判定传入）。 */
				if (String((trigger.player && trigger.player.name) || "").indexOf("csh_boss_minion_") === 0) {
					if (typeof rec.recordMinion === "function") rec.recordMinion(trigger.player.name, { asBoss: game.me === game.boss, event: trigger });
					return;
				}
				/* ★ 2026-10-16 晚根因修复：与 game.over 收尾通道（csh_bossrecord.recordOnOver）互斥。
				   实战上「击破魔王 / 应战胜负」都由**收尾通道**记——这类死亡在同一死亡事件的更早
				   步骤里就 game.checkResult()→game.over() 收尾，推进不到 dieAfter 的 After 阶段。
				   本分支保留为非收尾时序的兜底；两路共用 boss._cshBossRecorded 哨兵（一局一记）。 */
				if (game.boss && game.boss._cshBossRecorded) return;
				if (game.me === game.boss) {
					if (typeof rec.recordAsBoss !== "function") return;
					if (trigger.player === game.boss) {
						if (rec.recordAsBoss(false) && game.boss) game.boss._cshBossRecorded = true;
					} else if (!game.hasPlayer(function (cur) { return cur.side === false && cur.isIn(); })) {
						if (rec.recordAsBoss(true) && game.boss) game.boss._cshBossRecorded = true;
					}
				} else if (typeof rec.record === "function") {
					if (rec.record(trigger.player.name, { round: game.roundNumber, event: game.boss }) && game.boss) game.boss._cshBossRecorded = true;
				}
			} catch (e) {}
		},
	},

	/* 外传记录（批次 A）：本体/他扩展的 BOSS 被玩家（挑战者）击破 → 记入外传段。
	   本体 BOSS 条目上没有我们的技能，只能靠 lib.skill.global 全局登记（见 main/bossmode.js）。 */
	csh_boss_watch_ext: {
		audio: false, silent: true, forced: true, locked: true,
		forceDie: true, forceOut: true, // ★ 死时触发保险（全局登记技；2026-10-16 与 watch 同批）
		trigger: { global: "dieAfter" },
		filter(event) {
			return !!game.boss && !!game.me && game.me !== game.boss
				&& event.player === game.boss
				&& String((event.player && event.player.name) || "").indexOf("csh_boss_") !== 0;
		},
		content() {
			try {
				var rec = lib.cshBossRecord;
				if (rec && typeof rec.recordExt === "function") {
					rec.recordExt(trigger.player.name, { round: game.roundNumber });
				}
			} catch (e) {}
		},
	},
};

/* ============ 译名（主技 2 字铁律；子技 silent；_info 一句式描述） ============ */

const translate = {
	csh_boss_mowei: "魔威",
	csh_boss_bati: "霸体",
	csh_boss_monu: "魔怒",
	csh_boss_moxi: "魔息",
	csh_boss_liezhen: "裂阵",
	csh_boss_jingbian: "惊变",
	csh_boss_jingbian_lei: "惊雷",
	csh_boss_jingbian_dian: "游电",
	csh_boss_jingbian_gu: "天鼓",
	csh_boss_fushi: "覆势",
	csh_boss_huiliu: "汇流",
	csh_boss_fuying: "浮影",
	csh_boss_liaoyuan: "燎原",
	csh_boss_liaoyuan_y: "烬",
	csh_boss_xingjian: "行健",
	csh_boss_luanru: "乱入",
	csh_boss_fengmang: "锋芒",
	csh_boss_tangying: "躺赢",
	csh_boss_tianming: "天命",
	csh_boss_shuiyue: "水月",
	csh_boss_aoshu: "奥术",
	csh_boss_huanxue: "换血",
	csh_boss_mingtong: "冥瞳",
	csh_boss_jianzhen: "鉴真",
	csh_boss_jinji: "禁忌",
	csh_boss_wobing: "卧冰",
	csh_boss_bachong: "八重",
	csh_boss_ying_hunshi: "剑刃",
	csh_boss_kan_guzao: "掩护",
	csh_boss_feng_fengshi: "缴械",
	csh_boss_lang_nongchao: "魅惑",
	csh_boss_fen_yujin: "附魔",
	csh_boss_kui_qiansi: "念动",
	csh_boss_xingmo: "醒魔",
	csh_boss_chi: "池悯",
	csh_boss_fengmo: "疯魔",
	csh_boss_fanpu: "反扑",
	csh_boss_you_cannian: "时痕",
	csh_boss_baihao: "百豪",
	csh_boss_jinchi: "矜持",
	csh_boss_lengyan: "冷眼",
	csh_boss_xiushi: "锈蚀",
	csh_boss_enze: "断桃",
	csh_boss_bailie: "百裂",
	csh_boss_zhipei: "支配",
	csh_boss_jiangling: "降灵",
	csh_boss_huafu: "花缚",
	csh_boss_bingjie: "冰结",
	csh_boss_qianru: "潜入",
	csh_boss_qiannian: "千年",
	csh_boss_yaoqi: "七曜",

	csh_boss_mowei_info: "锁定技：你使用【杀】造成的伤害+1。",
	csh_boss_bati_info: "锁定技：每轮限一次，你受到的大于1点的伤害-1。",
	csh_boss_monu_info: "锁定技：每轮限两次，你受到伤害后，伤害来源流失等同伤害值的体力。",
	csh_boss_moxi_info: "锁定技：你的摸牌阶段额外摸牌（精英+1 / 霸主+2 / 究极+3）。",
	csh_boss_liezhen_info: "锁定技：你使用【杀】造成伤害后，弃置其一张牌；若其因此失去最后的手牌，你对其造成2点伤害。",
	csh_boss_jingbian_info: "锁定技：回合开始时，你按序切换形态——「惊雷」你使用【杀】无次数限制；「游电」其他角色与你的距离+1且你的手牌上限+3；「天鼓」你使用【杀】造成的伤害+1。",
	csh_boss_jingbian_lei_info: "惊雷形态：锁定技，你使用【杀】无次数限制。",
	csh_boss_jingbian_dian_info: "游电形态：锁定技，其他角色与你的距离+1，你的手牌上限+3。",
	csh_boss_jingbian_gu_info: "天鼓形态：锁定技，你使用【杀】造成的伤害+1。",
	csh_boss_fushi_info: "锁定技：每轮开始时，若你上轮受到的伤害不大于1点，你获得每名其他角色的一张牌。",
	csh_boss_huiliu_info: "锁定技：你的摸牌阶段多摸两张牌，且你的手牌上限+2。",
	csh_boss_fuying_info: "锁定技：每轮第一次有角色对你使用【杀】时，取消之，然后你摸两张牌。",
	csh_boss_liaoyuan_info: "锁定技：你对一名角色造成伤害后，其获得一枚「烬」标记（上限5，每人每轮至多获得1枚）；有「烬」的角色于其回合开始时流失等同「烬」数的体力，然后移去全部「烬」。",
	csh_boss_xingjian_info: "锁定技：每轮开始时，你弃置自己判定区里的所有牌，弃置几张便摸几张牌，然后回复1点体力。",
	csh_boss_luanru_info: "锁定技：游戏开始时，你随机获得一个其他系列的系列技。",
	csh_boss_fengmang_info: "锁定技：你使用的【杀】需要两张【闪】才能抵消。",
	csh_boss_tangying_info: "锁定技：每轮限一次，你受到会令你死亡的伤害时，防止之，你的体力变为1点，然后随机一名挑战者流失2点体力。",
	csh_boss_tianming_info: "锁定技：每轮限两次，你的判定牌生效前，你观看牌堆顶的三张牌，以其中判定结果对你最有利的一张作为判定牌。",
	csh_boss_shuiyue_info: "锁定技：每轮限一次，你成为【杀】的目标后，此【杀】转而指定使用者以外的随机一名其他角色。",
	csh_boss_aoshu_info: "锁定技：每轮限两次，任意角色使用非延时锦囊牌结算后，你摸一张牌。",
	csh_boss_huanxue_info: "锁定技：每轮限一次，你进入濒死状态时，你与体力值最高的一名其他角色交换体力值。",
	csh_boss_mingtong_info: "锁定技：回合开始时，你获得每名其他角色的一张随机手牌。",
	csh_boss_jianzhen_info: "锁定技：当你受到的伤害大于2点时，此伤害改为2点。",
	csh_boss_jinji_info: "锁定技：你本局受到的第四次伤害被取消。",
	csh_boss_wobing_info: "锁定技：每轮限一次，你造成伤害后，令受伤害角色翻面。",
	csh_boss_bachong_info: "锁定技：你受到的前八次伤害各-1。",
	csh_boss_ying_hunshi_info: "锁定技：魔王对其他角色造成伤害时，此伤害+1。",
	csh_boss_kan_guzao_info: "锁定技，魔王受到伤害时，此伤害改由你承受。",
	csh_boss_feng_fengshi_info: "锁定技，每轮限一次：魔王使用【杀】指定一名有装备的挑战者为目标后，其装备区里的一张牌被交给魔王。",
	csh_boss_lang_nongchao_info: "锁定技：每轮开始时，手牌数最多的挑战者弃置一张牌，魔王获得之。",
	csh_boss_fen_yujin_info: "锁定技，每轮限一次：魔王对挑战者使用【杀】造成伤害时，此伤害+1，然后你流失1点体力。",
	csh_boss_kui_qiansi_info: "锁定技：每轮开始，随机一名有【闪】的挑战者随机弃置一张【闪】；你死亡后，魔王回复1点体力。",
	csh_boss_xingmo_info: "锁定技：准备阶段，若你的体力上限小于本魔王档位体力，你增加1点体力上限并回复1点体力（魔王逐步解封）。",
	csh_boss_chi_info: "锁定技：你死亡时，若杀死你的角色为挑战者方，其增加1点体力上限、回复1点体力、获得1点护甲并摸两张牌。",
	csh_boss_fengmo_info: "锁定技：你首次被打到半血时，进入【疯魔】状态2轮——期间【魔怒】与【霸体】的每轮可用次数各+1（狂暴不常驻）。",
	csh_boss_fanpu_info: "锁定技：你首次进入濒死状态时，回复3点体力，然后所有挑战者各流失1点体力。",
	csh_boss_you_cannian_info: "锁定技：你死亡后，魔王摸两张牌。",
	csh_boss_jinchi_info: "锁定技：其他挑战者计算与你的距离+1。",
	csh_boss_lengyan_info: "锁定技：挑战者的手牌上限-1。",
	csh_boss_xiushi_info: "锁定技，挑战者使用或打出【闪】后，随机弃置一张牌。",
	csh_boss_enze_info: "锁定技，每轮限一次：挑战者的回合开始时，若其已受伤，你弃置其一张【桃】。",
	csh_boss_bailie_info: "出牌阶段限一次，你可以视为对攻击范围内的一名随机挑战者使用一张【杀】。",
	csh_boss_zhipei_info: "出牌阶段限一次：你可以令一名随机挑战者视为对其攻击范围内的另一名随机挑战者使用一张【杀】；若场上凑不出一对，改为令一名随机挑战者随机弃置一张手牌，你摸一张牌。",
	csh_boss_jiangling_info: "锁定技，挑战者的判定牌生效前，你将其花色翻转为另一颜色。",
	csh_boss_huafu_info: "锁定技，挑战者本回合使用过【杀】，其回合结束时随机弃置一张牌。",
	csh_boss_bingjie_info: "锁定技：每轮开始时，随机一名未横置的挑战者横置。",
	csh_boss_qianru_info: "锁定技，每轮开始时，你从随机一名有装备的挑战者处取走一件装备。",
	csh_boss_qiannian_info: "锁定技，你首次进入濒死状态时，回复至3点体力并摸两张牌。",
	csh_boss_yaoqi_info: "出牌阶段限一次：你可以与一名随机挑战者拼点；若你赢，对其造成1点伤害；若你没赢，你摸两张牌。",
	csh_boss_baihao_info: "锁定技：每轮开始时，你回复1点体力。",

	csh_boss_renwu: "忍舞",
	csh_boss_yongdong: "永动",
	csh_boss_tianzhou: "天舟",
	csh_boss_xuetong: "抄写",
	csh_boss_youling: "现身",
	csh_boss_guangyan: "光焰",
	csh_boss_milu: "迷路",
	csh_boss_linzuo: "记恨",
	csh_boss_shunbu: "瞬步",
	csh_boss_shuangqiang: "双枪",
	csh_boss_wuqi: "舞祈",
	csh_boss_tianhou: "天候",
	csh_boss_zhiwu: "反剪",
	csh_boss_lianyou: "镰风",
	csh_boss_fenshen: "焚身",
	csh_boss_libei: "离悲",
	csh_boss_yinshen: "空振",
	csh_boss_kongshou: "空手",
	csh_boss_wangzhi: "蓄执",
	csh_boss_shanwu: "山雾",
	csh_boss_shendun: "套索",
	csh_boss_shuju: "数据",
	csh_boss_taoyao: "桃芳",
	csh_boss_bingshuang: "冰霜",
	csh_boss_lianfu: "恋缚",
	csh_boss_dudie: "毒蝶",
	csh_boss_fengyan: "讽言",
	csh_boss_yueying: "月影",
	csh_boss_ranxin: "燃心",
	csh_boss_guiku: "哀鸣",

	csh_boss_renwu_info: "锁定技，每轮限一次，魔王使用【杀】后，立即再对随机一名挑战者使用一张【杀】。",
	csh_boss_yongdong_info: "锁定技，魔王的手牌上限+3。",
	csh_boss_tianzhou_info: "锁定技：每轮开始时，魔王获得1点护甲。",
	csh_boss_xuetong_info: "锁定技，每轮限一次：挑战者使用【杀】指定魔王为目标后，你视为对该挑战者使用一张【杀】。",
	csh_boss_youling_info: "锁定技，每轮限一次：挑战者的回合开始时，你弃置其一张【闪】或【桃】；若都没有，你摸一张牌。",
	csh_boss_guangyan_info: "锁定技，每轮限一次，魔王使用【杀】指定目标后，弃置该目标所有的【闪】。",
	csh_boss_milu_info: "锁定技：每轮开始时，随机一名没有判定牌的挑战者获得一张【乐不思蜀】。",
	csh_boss_linzuo_info: "锁定技，每轮限一次：魔王单次受到3点或以上伤害时，伤害来源随机弃置一张手牌，你回复1点体力。",
	csh_boss_shunbu_info: "锁定技，每轮限一次，魔王受到伤害时，将此伤害转移给随机一名挑战者。",
	csh_boss_shuangqiang_info: "锁定技：每轮限一次，魔王使用【杀】造成伤害后，对同一目标再造成1点伤害。",
	csh_boss_wuqi_info: "锁定技，每轮限一次，挑战者使用【杀】对魔王造成伤害后，其失去1点体力上限。",
	csh_boss_tianhou_info: "锁定技：挑战者的摸牌阶段少摸一张牌。",
	csh_boss_zhiwu_info: "锁定技，每轮限一次：挑战者的回合结束时，若其装备区有牌，你弃置其中一张，然后你回复1点体力。",
	csh_boss_lianyou_info: "锁定技，挑战者的回合结束时，若其本回合未造成过伤害，其流失1点体力。",
	csh_boss_fenshen_info: "锁定技，每轮限一次，挑战者使用【桃】或【酒】时，需先流失1点体力。",
	csh_boss_libei_info: "锁定技：每轮限一次，挑战者使用【杀】后，弃置其一张【闪】。",
	csh_boss_yinshen_info: "锁定技，每轮限一次：挑战者使用牌指定你为唯一目标后，其随机弃置一张手牌，你摸一张牌。",
	csh_boss_kongshou_info: "锁定技：每轮限一次，挑战者使用【杀】指定魔王为目标后，其本回合不能再使用【杀】。",
	csh_boss_wangzhi_info: "锁定技：每轮开始时你获得1枚「执」（最多3枚）；你死亡后，每枚「执」让魔王摸一张牌。",
	csh_boss_shanwu_info: "锁定技，挑战者造成的伤害-1。",
	csh_boss_shendun_info: "锁定技，每轮限一次：魔王受到挑战者的伤害后，你获得该挑战者一张手牌，然后其摸一张牌。",
	csh_boss_shuju_info: "锁定技，每轮限一次，挑战者使用锦囊牌结算后，你摸一张牌。",
	csh_boss_taoyao_info: "锁定技，每轮限一次：挑战者回复体力时，其回复量减半（向上取整）；濒死自救不受影响。",
	csh_boss_bingshuang_info: "锁定技，每轮限一次，挑战者对你造成伤害后，弃置其装备区里所有的牌。",
	csh_boss_lianfu_info: "锁定技，每轮限一次：挑战者使用装备牌后，你摸两张牌，然后该挑战者随机弃置一张手牌。",
	csh_boss_dudie_info: "锁定技：每轮限一次，挑战者回合结束时若其已受伤，其流失1点体力。",
	csh_boss_fengyan_info: "锁定技：每轮限一次，挑战者使用锦囊牌后随机弃置一张牌。",
	csh_boss_yueying_info: "锁定技，每轮限一次，挑战者使用的第一张指定你的牌对你无效。",
	csh_boss_ranxin_info: "锁定技，挑战者每使用一张牌，其本回合的手牌上限-1（最多-3）。",
	csh_boss_guiku_info: "锁定技：你死亡后，每名判定区为空的挑战者获得一张【乐不思蜀】。",
};

export default { skill: skill, translate: translate };
