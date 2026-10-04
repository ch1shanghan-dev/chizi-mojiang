import { lib, game, ui, get, ai, _status } from "../../../noname.js";
import cshCharacter from "../character/index.js";
// 池子魔将 · AI 角色世界（§I · 2026-09-29 重构版）
//
// 定位：名册规模（真值 = character/index.js，当前 97 人）的「真实世界」——
//   名字、性格、**资金**与**牌技**会随输赢演化，离线也在动。
//   存储 `csh_world`：{ ai:[n], lastTick, gambles, relations, records,
//                       heartbeatDay, heartbeatMatches }，只存当前状态，不存牌局历史（§I.2）。
//
// ★ 2026-09-29 重构要点（用户 2026-09-29 需求）：
//   1. **新增 `skill` 字段**（此前完全不存在，B10 六条要求有五条无法满足）
//      skill = 0.62 ~ 1.00，由资金对数映射而来：越有钱越聪明，
//      但**穷 AI 永不被降智**（下限 0.62，不是 0）。
//      关键纪律：skill **只影响决策质量**（赔率估计精度 / 阈值纪律 / 诈唬选择），
//      **绝不读牌堆**——发牌函数与 skill 零耦合（有断言守护）。
//   2. **资金分层重建**：穷桌 5万~10万 / 中桌 11万~78万 / 富桌 210万~1380万 / 豪赌席 2450万~9260万。
//      36 名资金**两两不等**（B10 #1）。AI_FUND_CAP 由 1 亿 → **5 亿**。
//   3. **豪赌桌（buyIn ≥ 200,000）**：AI 携带资金 = **玩家的 2~5 倍**，
//      倍数由该 AI 的世界资金平滑映射（越有钱带得越多）。
//      这是刻意的极端化设计：**期望收益为负**，但单次上限极高（可以打穿世界首富）。
//   4. **零和世界**：玩家赢 → 按带入比例从各 AI 真实扣除；玩家输 → 按比例真实记入各 AI。
//      双向结算（settleLose / settleWin）此前只有前者可达，世界只减不增、长期枯竭。
//   5. **归零刷新 + 有上限**（B10 #3/#4）：资金触底 → 退隐，3 天后带 1,000~3,000 复出重爬。
//
// 对外接口（lib.cshWorld / window.CSH.world）：
//   CSH.world.list() / active() / byId(id) / stats()
//   CSH.world.seat(n, buyIn, {tier})       组局（含豪赌桌倍数带入）
//   CSH.world.gambleInfo(buyIn)            豪赌桌如实标注（倍数区间 / 牌技区间 / 带入区间）
//   CSH.world.settleWin(id, n) / settleLose(id, n) / settlePlay(id, isDraw)
//   CSH.world.gambleStats()                玩家在豪赌桌的战绩（成就数据源）
//   CSH.world.noteGamble(profit)           记录一次豪赌桌出战结果（玩家侧）
//   CSH.world.tick()                       离线结算
//   CSH.world.leaderboard(key)             资金榜 / 胜率榜 / 最大底池榜
//   CSH.world.avatar(id, size)             程序化 SVG 头像（委托 csh_badge.js）
//   CSH.world.worldStory()                 世界史叙述（最火/最崩/最老练/最沉迷 + 纪录）
//   CSH.world.news(n)                      世界动态（流言）：最近 n 条值得说的事，人物化叙事
//   CSH.world.grudge(id[, target]) / addGrudge(id, n[, target])   成对恩怨（缺省 target = 玩家）
//
// 红线：零外链、零外部图片；localStorage 前缀 csh_；node --check 通过。

(function () {
	if (lib.cshWorld) return;

	var K_WORLD = "csh_world";
	var AI_MIN_STAKE = 200;          // 最低带入（§I.2 退隐线）
	var AI_FUND_CAP = 500000000;     // AI 资金上限 5 亿（2026-09-29：由 1 亿上调，容纳豪赌席）
	var AI_WIN_RATE = 0.95;          // AI 赢下底池的留存率（§I.2）
	var RETIRE_DAYS = 3;             // 退隐 3 天后复出（§I.2）
	var COMEBACK_MIN = 1000;         // 复出补资下限（§I.2）
	var COMEBACK_MAX = 3000;         // 复出补资上限（§I.2）
	var OFFLINE_PER_DAY = 1;         // 离线每天模拟 1 轮（§I.2）

	/* 牌技区间（2026-09-29 新增）：BASE 是硬下限——**穷 AI 不许是傻子**（B10 #6） */
	var SKILL_BASE = 0.62;
	var SKILL_TOP = 1.00;
	var SKILL_CURVE = 0.70;          // 对数映射的幂次：>0 保证单调递增
	var FUND_LO = 50000;             // skill 映射下锚（穷桌起点）
	var FUND_HI = 500000000;         // skill 映射上锚（世界首富 · 97 人 5 亿）

	/* 豪赌桌（2026-09-29）：玩家买入 ≥ 门槛 → AI 携带 = 玩家带入 × [2,5] */
	var GAMBLE_FROM = 200000;
	var MULT_LO = 2, MULT_HI = 5;
	var MULT_FUND_LO = 2000000;      // 倍率映射下锚（富桌起点）
	var MULT_FUND_HI = 500000000;    // 倍率映射上锚（世界首富 · 97 人 5 亿）
	var GAMBLE_MIN_FUND = 2000000;   // 有资格坐豪赌桌的最低资金
	/* 成对仇恨表里"玩家本人"的键：人类没有世界 id，用哨兵键表示"恨玩家"
	   （csh_migrate 清洗时读同一个常量，避免两处手写字符串漂移）。 */
	var PLAYER_GRUDGE_KEY = "player";

	/* 五种性格（§I.1）：影响 AI 打法参数（§I.5 性格参数化） */
	var PERSONAS = {
		aggro: { key: "aggro", name: "激进", raiseThreshold: 0.42, bluffRate: 0.18, variance: 0.20 },
		tight: { key: "tight", name: "保守", raiseThreshold: 0.70, bluffRate: 0.05, variance: 0.10 },
		bluff: { key: "bluff", name: "诈唬", raiseThreshold: 0.52, bluffRate: 0.38, variance: 0.26 },
		math: { key: "math", name: "数学家", raiseThreshold: 0.58, bluffRate: 0.06, variance: 0.06 },
		wild: { key: "wild", name: "莽夫", raiseThreshold: 0.46, bluffRate: 0.24, variance: 0.40 },
	};
	var PERSONA_KEYS = ["aggro", "tight", "bluff", "math", "wild"];

	/* ============================================================
	   名册（单一真值 · 2026-10-01 由 36 人硬编码 → 派生）
	   ------------------------------------------------------------
	   真值来自 character/index.js 的 character 对象（字符串主键）。
	   加武将只改 character/index.js，世界下次载入自动收录（扩展性验收点）。
	   派生规则：persona = stableHash(id)%5；fund = 按 id 稳定排序后的四层等差；
	   surname = 前缀剥离 + 复姓表 + 首字。
	   四层资金（97 人时）：豪赌席 8 / 富桌 18 / 中桌 41 / 穷桌 30 = 97，
	   资金两两不等；首富 = AI_FUND_CAP（5 亿），最穷 = 5 万。
	   ★ 2026-10-03：四层人数改为**按名册规模等比派生**（见 tierCountsFor）——
	   此前写死 8/18/41/30，而 fundForIndex 只按这四个数字分段：名册一旦扩容
	   （如计划中的 309 人），最后一段会继续往下滑出负数（309 人时 188 人为负，
	   首个负值出现在第 122 人），资金分布必须先于名册扩容变成规模无关的。 */
	var ROSTER_ENTRY_IDS = Object.keys((cshCharacter && cshCharacter.character) || {}).sort();
	/* 前三层各至少 1 人，**余额全部给穷桌（可以为 0）**，从而恒有 t3+t2+t1+t0 === n。
	   ⚠ 不要给 t0 加 max(1,…)：n = 4 时前三层四舍五入后已占满 4 人，
	   再"保底 1 人"会让四层之和变成 5（2026-10-03 二次复核发现的边界缺陷）。
	   极小名册下 t0 = 0（"四层"自然退化成三层）是允许的；fundForIndex
	   对任一档人数 ≤1 都直接返回该档锚点，不会出现除零。 */
	function tierCountsFor(n) {
		n = Math.max(4, Math.floor(Number(n) || 0));
		var t3 = Math.max(1, Math.round(n * 8 / 97));
		var t2 = Math.max(1, Math.round(n * 18 / 97));
		var t1 = Math.max(1, Math.round(n * 41 / 97));
		var t0 = Math.max(0, n - t3 - t2 - t1);
		return { t3: t3, t2: t2, t1: t1, t0: t0 };
	}
	var TIER_COUNTS = tierCountsFor(ROSTER_ENTRY_IDS.length);
	function stableHash(str) {
		str = String(str == null ? "" : str);
		var h = 0x811c9dc5;
		for (var i = 0; i < str.length; i++) {
			h ^= str.charCodeAt(i);
			h = (h * 16777619) >>> 0;
		}
		return h >>> 0;
	}
	var SURNAME_PREFIXES = ["界界", "谋谋", "星星", "远古", "卧龙", "大爱", "平凡", "方圣", "神", "界", "谋", "星"];
	var SURNAME_COMPOUND = ["司马", "诸葛", "夏侯", "公孙", "太史", "皇甫", "上官", "欧阳", "慕容", "独孤", "东方", "长孙"];
	function surnameOf(name) {
		name = String(name || "");
		for (var p = 0; p < SURNAME_PREFIXES.length; p++) {
			if (name.indexOf(SURNAME_PREFIXES[p]) === 0) { name = name.slice(SURNAME_PREFIXES[p].length); break; }
		}
		for (var c = 0; c < SURNAME_COMPOUND.length; c++) {
			if (name.indexOf(SURNAME_COMPOUND[c]) === 0) return SURNAME_COMPOUND[c];
		}
		return name.charAt(0);
	}
	/* 四层等差资金（按排序后 index，从富到穷），保证两两不等且 tierOfFund 判定一致。
	   人数由 tierCountsFor 按名册规模派生 —— 见上方名册段落说明。
	   单层只有 1 人时（只可能出现在极小的测试名册上）直接取该层锚点，避免除以 0。 */
	function fundForIndex(idx) {
		var t3 = TIER_COUNTS.t3, t2 = TIER_COUNTS.t2, t1 = TIER_COUNTS.t1, t0 = TIER_COUNTS.t0;
		if (idx < t3) return t3 <= 1 ? AI_FUND_CAP : AI_FUND_CAP - Math.floor((AI_FUND_CAP - 20000000) * idx / (t3 - 1));
		if (idx < t3 + t2) return t2 <= 1 ? 19999999 : 19999999 - Math.floor(17999999 * (idx - t3) / (t2 - 1));
		if (idx < t3 + t2 + t1) return t1 <= 1 ? 1999999 : 1999999 - Math.floor(1889999 * (idx - t3 - t2) / (t1 - 1));
		return t0 <= 1 ? 109999 : 109999 - Math.floor(59999 * (idx - t3 - t2 - t1) / (t0 - 1));
	}
	function buildRoster() {
		var ids = ROSTER_ENTRY_IDS;
		var tr = (cshCharacter && cshCharacter.translate) || {};
		var out = [];
		for (var i = 0; i < ids.length; i++) {
			var id = ids[i];
			var name = tr[id] || id;
			out.push({
				id: id, name: name,
				surname: surnameOf(name),
				persona: PERSONA_KEYS[stableHash(id) % PERSONA_KEYS.length],
				fund: fundForIndex(i),
			});
		}
		return out;
	}
	var ROSTER = buildRoster();
	var AI_COUNT = ROSTER.length;
	var ROSTER_IDS = {};
	for (var ri = 0; ri < ROSTER.length; ri++) ROSTER_IDS[ROSTER[ri].id] = 1;
	function idInRoster(id) { return !!ROSTER_IDS[id]; }
	var TIER_NAMES = ["穷桌", "中桌", "富桌", "豪赌席"];
	/* 豪赌席门槛：tierOfFund 与「曾经坐过豪赌席」里程碑（everTier3）共用同一个数 ——
	   两处各写一份迟早漂移，而这个数同时决定成就口径与破产统计。 */
	var TIER3_FUND = 20000000;
	function tierOfFund(fund) {
		if (fund >= TIER3_FUND) return 3;
		if (fund >= 2000000) return 2;
		if (fund >= 110000) return 1;
		return 0;
	}

	/* ============================================================
	   0. 工具
	   ============================================================ */
	function clampNum(n, lo, hi) {
		n = Number(n);
		if (!isFinite(n)) return lo;
		if (n < lo) return lo;
		if (n > hi) return hi;
		return n;
	}
	function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
	function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
	function round05(v) { return Math.round(v * 2) / 2; }

	/* 牌技：资金的对数映射（单调递增，穷 AI 不降智）
	   fund = 50,000   → 0.62（下限）
	   fund = 784,000  → ≈ 0.81
	   fund = 2,100,000→ ≈ 0.87
	   fund = 92,600,000→ 1.00（上限） */
	function skillOf(fund) {
		fund = Math.max(1, Number(fund) || 0);
		var lo = Math.log(FUND_LO), hi = Math.log(FUND_HI);
		var x = clampNum((Math.log(fund) - lo) / (hi - lo), 0, 1);
		return SKILL_BASE + (SKILL_TOP - SKILL_BASE) * Math.pow(x, SKILL_CURVE);
	}
	/* 豪赌桌带入倍数：资金的对数映射到 [2, 5]，越有钱带得越多（用户需求原文） */
	function multOf(fund) {
		fund = Math.max(1, Number(fund) || 0);
		var lo = Math.log(MULT_FUND_LO), hi = Math.log(MULT_FUND_HI);
		var x = clampNum((Math.log(fund) - lo) / (hi - lo), 0, 1);
		return round05(MULT_LO + (MULT_HI - MULT_LO) * x);
	}

	/* 世界日序：以**本地日历** 2026-01-01 为 0 的天序号。
	   ★ 2026-10-03 修（口径统一，审计 P2-12）：此前是 `Date.now() - Date.UTC(2026,0,1)`，
	   日界落在 UTC 零点 —— 东八区即每天早上 08:00 才跨日，而钱包的 today()（每日任务 /
	   签到 / 门禁）用的是**本地**日期。于是每天 00:00~08:00 这个世界已跨日、任务侧还没跨，
	   边界现象无法解释。改为先取本地 Y/M/D 再用 Date.UTC 做差：两侧同一个日界，
	   且不引入 DST 误差（用日历差而非毫秒差）。
	   兼容性：旧档的 lastTick / retireDay 是 UTC 口径，切换后最多相差 1 天，
	   只会让某一次离线结算少算/多算一天，不会产生越界值。 */
	function dayIndex() {
		try {
			var d = new Date();
			return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2026, 0, 1)) / 86400000);
		} catch (e) { return 0; }
	}
	function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
	function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
	function lsJSON(k, def) {
		try {
			var s = lsGet(k);
			if (!s) return def;
			var o = JSON.parse(s);
			return (o && typeof o === "object") ? o : def;
		} catch (e) { return def; }
	}
	function toast(msg) {
		msg = String(msg == null ? "" : msg);
		try {
			if (typeof ui !== "undefined" && ui && ui.create && typeof ui.create.toast === "function") {
				ui.create.toast(msg); return;
			}
		} catch (e) {}
		try { console.log("[池子魔将·世界] " + msg); } catch (e2) {}
	}
	function logInfo(msg) {
		try { if (lib.cshDebug && typeof lib.cshDebug.info === "function") lib.cshDebug.info("world: " + msg); } catch (e) {}
	}
	function logError(msg, err) {
		try {
			if (lib.cshDebug && typeof lib.cshDebug.error === "function") lib.cshDebug.error("world: " + msg, err);
			else console.error("[池子魔将·世界] " + msg, err);
		} catch (e) {}
	}

	/* ============================================================
	   1. 状态载入与规整
	   ============================================================ */
	function freshAI(r) {
		return {
			id: r.id, name: r.name, surname: r.surname, persona: r.persona,
			fund: r.fund,
			skill: skillOf(r.fund),            // 牌技随资金（2026-09-29 新增）
			hands: 0, wins: 0, biggestPot: 0, streak: 0, bestStreak: 0,
			grudges: {},                       // 成对仇恨表（§5.1 #12 · 2026-10-03 由标量改表）
			retired: false, retireDay: 0,      // 退隐态
			retireCount: 0,                    // 生涯退隐次数（成就「打穷它」用）
			last: 0,                           // 上次参与时间戳
			/* ---------- 拟真化新增（2026-10-02） ----------
			   目的：让 AI 不再是「一条 skill 公式驱动的资金容器」，而像个牌手。
			   · mood 心态：连败会 tilt（打得松、更容易输），连胜会涨信心。
			   · form 状态：近期手感 0~1，缓慢回归中值，造成"某段时间特别顺/背"。
			   · fatigue 疲劳：连续出场累积，影响状态恢复速度。
			   · drew 平局：牌桌本来就有和局，计入 hands 但不计胜负。
			   · skillPlay 实战牌技：由**对局结果**缓慢成长，与"有钱才变强"解耦，
			     让长期打牌的穷人也能靠经验变强（原实现里穷人永远没机会成长）。 */
			mood: 0,                           // -1 ~ +1（负=tilt，正=自信）
			form: 0.5,                         // 0 ~ 1
			fatigue: 0,                        // 0 ~ 1
			drew: 0,
			skillPlay: 0,
			/* 豪赌席里程碑（2026-10-03 新增）：资金**曾经**达到过 TIER3_FUND 就永久置位。
			   「打穿世界首富」统计（stats.billionaireBroke）此前借用 retireCount（退隐次数），
			   口径完全不对 —— 详见 stats() 处说明。 */
			everTier3: r.fund >= TIER3_FUND,
		};
	}
	/* 关系网：rivalry[id][otherId] = 竞争热度（0~N）。
	   与原 grudge 的区别：grudge 记录「被谁打穷过」的仇恨；
	   rivalry 记录**长期对抗关系**，双方都会累积，用于：
	     · 同席时更可能互相加注（故事性）
	     · 胜率微调（熟悉的对手更容易读到对方）
	   只保留每人的前若干名，避免档案无限膨胀。 */
	function freshRelations() { return { rivalry: {} }; }
	/* 豪赌桌战绩的唯一形状（此前同一段字面量在 defaultWorld / 载入兜底 / noteGamble /
	   importRaw 抄了四份，加一个 push 要改四处 —— 2026-10-03 收敛为单一定义）。 */
	function freshGambles() {
		return { plays: 0, wins: 0, net: 0, best: 0, bust: 0, push: 0, streak: 0, bestStreak: 0 };
	}
	function defaultWorld() {
		var ai = ROSTER.map(freshAI);
		return {
			ai: ai, lastTick: dayIndex(), gambles: freshGambles(),
			heartbeatDay: dayIndex(), heartbeatMatches: 0,
			history: [],
		};
	}

	var world = lsJSON(K_WORLD, null);
	if (!world || typeof world !== "object" || !Array.isArray(world.ai)) world = defaultWorld();
	if (!world.gambles || typeof world.gambles !== "object") world.gambles = freshGambles();

	/* 旧档迁移（2026-10-01）：36 人数字主键 → 97 人字符串主键。
	   旧档整批作废（保留 gambles 豪赌桌战绩），重建 97 条。
	   判定为白名单式：只有「命中名册的字符串 id」才视为合法新档，其余（数字 id /
	   脏字符串 id）一律重建，避免误把导入的 0 号 id 当合法档。 */
	function migrateLegacyWorld() {
		if (!world || !Array.isArray(world.ai) || !world.ai.length) return false;
		var firstId = world.ai[0].id;
		if (typeof firstId === "string" && idInRoster(firstId)) return false;
		var gambles = world.gambles;
		logInfo("检测到旧版/脏世界档案（首 id=" + firstId + "）→ 重建为 " + AI_COUNT + " 人");
		world = defaultWorld();
		if (gambles) world.gambles = gambles;
		saveWorld();
		return true;
	}
	migrateLegacyWorld();

	/* 规整：补齐缺失角色 / 修正越界资金 / 修复字段类型 / 重算 skill。
	   ★ 2026-10-03：从"只在载入时跑一次的 IIFE"提为具名函数 —— 存档导入
	   （importRaw）此前是裸 `world = obj` 就落盘，完全绕过这一层，于是
	   未知 id / 非法 persona / 缺 relations·records 的档能直接进运行态
	   （publicOf 里 PERSONAS[a.persona].name 会当场抛异常，面板整个渲染不出来）。
	   现在三条入口（启动读取 / 存档导入 / 旧档迁移）共用同一条真值链。
	   返回是否发生过修正（便于调用方决定是否回写）。 */
	function normalizeWorld() {
		var _normChanged = false;
		/* 统一写法：**只有真的发生变更才置位**（2026-10-03 二次复核）。
		   此前一部分 clamp（fund / mood / fatigue / retireDay / last / 心跳字段）
		   只改内存不置位 ⇒ 内存已修正、localStorage 仍是脏值，下次启动再修一遍
		   （自愈不落地）。现在所有实际修正都会触发一次回写，做到"一次性自愈"。 */
		function setIf(o, k, v) { if (o[k] !== v) { o[k] = v; _normChanged = true; } }
		var byId = {};
		for (var i = 0; i < world.ai.length; i++) {
			var a = world.ai[i];
			if (a && a.id != null) byId[a.id] = a;   // 字符串主键（97 人）；旧档数字 id 查不到 → 自动重建
		}
		var out = [];
		for (var r = 0; r < ROSTER.length; r++) {
			var meta = ROSTER[r];
			var cur = byId[meta.id];
			if (!cur) { out.push(freshAI(meta)); _normChanged = true; continue; }
			setIf(cur, "name", meta.name);              // 名字以代码为准（防改名）
			setIf(cur, "surname", meta.surname);
			if (PERSONA_KEYS.indexOf(cur.persona) < 0) setIf(cur, "persona", meta.persona);
			setIf(cur, "fund", clampNum(cur.fund, 0, AI_FUND_CAP));
			["hands", "wins", "biggestPot", "streak", "bestStreak", "retireCount", "drew"].forEach(function (k) {
				if (typeof cur[k] !== "number" || !isFinite(cur[k]) || cur[k] < 0) setIf(cur, k, 0);
			});
			/* 成对仇恨（2026-10-03）：旧档的标量 grudge = "被玩家得罪的程度" →
			   迁到 grudges[PLAYER_GRUDGE_KEY] 后删除旧字段（同一事实不留两份）。 */
			if (typeof cur.grudge === "number" && (!cur.grudges || typeof cur.grudges !== "object")) {
				cur.grudges = {};
				if (cur.grudge > 0) cur.grudges[PLAYER_GRUDGE_KEY] = clampNum(cur.grudge, 0, 999);
				_normChanged = true;
			}
			if (cur.grudge !== undefined) { delete cur.grudge; _normChanged = true; }
			if (!cur.grudges || typeof cur.grudges !== "object") { cur.grudges = {}; _normChanged = true; }
			else {
				for (var gk in cur.grudges) {
					if (!Object.prototype.hasOwnProperty.call(cur.grudges, gk)) continue;
					var gv = cur.grudges[gk];
					if (typeof gv !== "number" || !isFinite(gv) || gv < 0) { cur.grudges[gk] = 0; _normChanged = true; }
				}
			}
			if (typeof cur.retired !== "boolean") setIf(cur, "retired", false);
			if (typeof cur.retireDay !== "number") setIf(cur, "retireDay", 0);
			if (typeof cur.last !== "number") setIf(cur, "last", 0);
			/* ---------- 拟真化字段补全（2026-10-02）----------
			   老档案没有 mood/form/fatigue/skillPlay：这里补默认值，并把变更落盘一次
			   （见 setIf 的说明），避免每次载入都判为缺失。
			   form 中值 0.5 = 手感普通；mood 0 = 心态平稳；fatigue 0 = 不累。 */
			if (typeof cur.mood !== "number" || !isFinite(cur.mood)) setIf(cur, "mood", 0);
			else setIf(cur, "mood", Math.max(-1, Math.min(1, cur.mood)));
			/* form 的 **0 与 1 都是合法边界**（advanceState 用 Math.min(1,…)/Math.max(0,…)
			   明确产出这两个值），此前判 `<= 0 || >= 1` 为非法 ⇒ 打到边界的 AI 一存档
			   就被打回 0.5（"状态持久化不稳定"）。 */
			if (typeof cur.form !== "number" || !isFinite(cur.form) || cur.form < 0 || cur.form > 1) setIf(cur, "form", 0.5);
			if (typeof cur.fatigue !== "number" || !isFinite(cur.fatigue)) setIf(cur, "fatigue", 0);
			else setIf(cur, "fatigue", Math.max(0, Math.min(1, cur.fatigue)));
			if (typeof cur.skillPlay !== "number" || !isFinite(cur.skillPlay) || cur.skillPlay < 0) setIf(cur, "skillPlay", 0);
			if (typeof cur.everTier3 !== "boolean") setIf(cur, "everTier3", false);
			/* skill 是**派生值**：每次载入按当前资金重算，永远与资金一致，不会漂移。
			   另加 skillPlay（实战经验）作为独立加成，封顶 +0.15，见 effectiveSkill()。
			   refreshSkill 顺带维护 everTier3 里程碑，故这里不再直接写 cur.skill；
			   但派生值/里程碑若与存档不同（例如公式改过），同样要落盘一次。 */
			var skBefore = cur.skill, evBefore = cur.everTier3;
			refreshSkill(cur);
			if (cur.skill !== skBefore || cur.everTier3 !== evBefore) _normChanged = true;
			out.push(cur);
		}
		world.ai = out;
		if (typeof world.lastTick !== "number") setIf(world, "lastTick", dayIndex());
		/* 同日心跳额度（tick 内读写）：缺字段时按"今天未用额度"起步，
		   与 tick 里 `heartbeatDay !== today` 的判定等价，不会多送额度。 */
		if (typeof world.heartbeatDay !== "number") setIf(world, "heartbeatDay", dayIndex());
		if (typeof world.heartbeatMatches !== "number") setIf(world, "heartbeatMatches", 0);
		/* 死字段清理（2026-10-03，审计 P3-13）：lastSeenDay / seeded / worstBust(BY)
		   已核实**零读取**（全仓只有写入点）。留着就是"看起来像核心字段、其实不参与
		   任何决策"的陷阱 —— 审计建议二选一，这里按"删除"处理。 */
		if (world.lastSeenDay !== undefined) { delete world.lastSeenDay; _normChanged = true; }
		if (world.seeded !== undefined) { delete world.seeded; _normChanged = true; }
		/* 关系网容器 */
		if (!world.relations || typeof world.relations !== "object") { world.relations = freshRelations(); _normChanged = true; }
		if (!world.relations.rivalry || typeof world.relations.rivalry !== "object") { world.relations.rivalry = {}; _normChanged = true; }
		/* 生涯纪录：供 UI 叙述世界史（最高单局、最长连胜） */
		if (!world.records || typeof world.records !== "object") {
			world.records = { bestPot: 0, bestPotBy: "", longestStreak: 0, longestStreakBy: "", matches: 0 };
			_normChanged = true;
		}
		if (world.records && world.records.worstBust !== undefined) { delete world.records.worstBust; _normChanged = true; }
		if (world.records && world.records.worstBustBy !== undefined) { delete world.records.worstBustBy; _normChanged = true; }
		if (!world.gambles || typeof world.gambles !== "object") { world.gambles = freshGambles(); _normChanged = true; }
		/* 成就计数（2026-10-03）：旧档补空壳；逐字段校验为有限非负数（防手改存档把成就算崩） */
		if (!world.feats || typeof world.feats !== "object") { world.feats = freshFeats(); _normChanged = true; }
		else {
			var FEAT_KEYS = ["records", "tierDown", "tierUp", "retires", "comebacks", "rivals", "grudge", "tier3up", "gstreaks"];
			for (var fi = 0; fi < FEAT_KEYS.length; fi++) {
				var fk = FEAT_KEYS[fi], fv = world.feats[fk];
				if (typeof fv !== "number" || !isFinite(fv) || fv < 0) { world.feats[fk] = 0; _normChanged = true; }
			}
		}
		/* 世界动态事件环（2026-10-03 新增字段）：旧档补空环；只留最近 HISTORY_MAX 条、
		   丢掉没有 kind 的脏条目（防手改存档把渲染搞崩）。 */
		if (!Array.isArray(world.history)) { world.history = []; _normChanged = true; }
		else {
			if (world.history.length > HISTORY_MAX) { world.history = world.history.slice(-HISTORY_MAX); _normChanged = true; }
			var kept = [];
			for (var hi = 0; hi < world.history.length; hi++) {
				var he = world.history[hi];
				if (he && typeof he === "object" && typeof he.kind === "string") kept.push(he);
				else _normChanged = true;
			}
			if (kept.length !== world.history.length) world.history = kept;
		}
		if (_normChanged) saveWorld();
		return _normChanged;
	}
	normalizeWorld();
	/* 有效牌技：资金派生的 skill + 实战经验（最多 +0.15）。
	   这样「打了很久的穷牌手」也能慢慢变强，世界不再只由资金决定强弱。 */
	function effectiveSkill(a) {
		var base = (a && typeof a.skill === "number") ? a.skill : 0;
		var exp = (a && typeof a.skillPlay === "number") ? a.skillPlay : 0;
		return Math.min(1, base + Math.min(0.15, exp * 0.0015));
	}
	/* 心理系数：心态与手感共同决定「今天发挥几成」。
	   范围约 0.9 ~ 1.1 —— 足够让状态可见地影响胜负，又不会让实力失去意义。
	   疲劳会压低上限：连轴转的牌手即使自信也打不出最好水平。 */
	function mentalFactor(a) {
		var mood = (a && typeof a.mood === "number") ? a.mood : 0;
		var form = (a && typeof a.form === "number") ? a.form : 0.5;
		var fat = (a && typeof a.fatigue === "number") ? a.fatigue : 0;
		var f = 1 + mood * 0.06 + (form - 0.5) * 0.08;
		f *= (1 - fat * 0.05);
		return Math.max(0.9, Math.min(1.1, f));
	}
	/* 关系网：记一笔对抗。每人只留前 8 名对手，防止档案无限膨胀。 */
	function bumpRivalry(idA, idB) {
		if (!idA || !idB || idA === idB) return;
		try {
			var R = world.relations.rivalry;
			if (!R[idA]) R[idA] = {};
			if (!R[idB]) R[idB] = {};
			R[idA][idB] = Math.min(999, (R[idA][idB] || 0) + 1);
			R[idB][idA] = Math.min(999, (R[idB][idA] || 0) + 1);
			/* 宿敌里程碑进世界动态（10/25/50/100/200 次交手各记一次，不刷屏） */
			var meet = R[idA][idB];
			if (meet === 10 || meet === 25 || meet === 50 || meet === 100 || meet === 200) {
				pushHistory({ kind: "rival", a: nameOf(idA), b: nameOf(idB), c: meet });
			}
			[ [idA, R[idA]], [idB, R[idB]] ].forEach(function (pair) {
				var keys = Object.keys(pair[1]);
				if (keys.length <= 8) return;
				keys.sort(function (x, y) { return pair[1][x] - pair[1][y]; });   // 热度低的先淘汰
				while (keys.length > 8) { delete pair[1][keys.shift()]; }
			});
		} catch (e) {}
	}
	/* 状态推进：每打一局更新心态 / 手感 / 疲劳。
	   won: true 胜 / false 负 / null 和局。 */
	function advanceState(a, won, stake) {
		if (!a) return;
		var P = PERSONAS[a.persona] || { variance: 0.2 };
		a.hands = (a.hands || 0) + 1;
		if (won === true) {
			a.wins = (a.wins || 0) + 1;
			a.streak = (a.streak || 0) + 1;
			if (a.streak > (a.bestStreak || 0)) a.bestStreak = a.streak;
			a.mood = Math.min(1, (a.mood || 0) + 0.14 + P.variance * 0.1);
			a.form = Math.min(1, (a.form == null ? 0.5 : a.form) + 0.05);
			a.fatigue = Math.max(0, (a.fatigue || 0) - 0.02);       // 赢牌提神
			a.skillPlay = (a.skillPlay || 0) + 1;                    // 赢局经验全额
		} else if (won === false) {
			a.streak = 0;
			/* tilt：连败越久越明显。方差大的性格（莽夫/诈唬）更容易崩。 */
			var tilt = 0.10 + P.variance * 0.25;
			a.mood = Math.max(-1, (a.mood || 0) - tilt);
			a.form = Math.max(0, (a.form == null ? 0.5 : a.form) - 0.06);
			a.fatigue = Math.min(1, (a.fatigue || 0) + 0.05);
			a.skillPlay = (a.skillPlay || 0) + 0.35;                 // 输局也长经验，但少
		} else {
			a.drew = (a.drew || 0) + 1;
			a.form = (a.form == null ? 0.5 : a.form) * 0.5 + 0.25;   // 和局→向中值回归
			a.skillPlay = (a.skillPlay || 0) + 0.35;
		}
	}


	function saveWorld() {
		try { lsSet(K_WORLD, JSON.stringify(world)); }
		catch (e) { logError("saveWorld 失败", e); }
	}
	function byId(id) {
		for (var i = 0; i < world.ai.length; i++) if (world.ai[i].id === id) return world.ai[i];
		return null;
	}
	/* 由场上 player 反查世界 id（2026-10-01 恩怨接线）：player.name1 是 translate 名，
	   与名册 name 同源（§1.2 已证纯文本）。兜底：player.name 若直接命中名册字符串主键亦可。 */
	function idOfPlayer(player) {
		try {
			var n1 = player && player.name1;
			if (n1) {
				for (var i = 0; i < world.ai.length; i++) {
					if (world.ai[i].name === n1) return world.ai[i].id;
				}
			}
			var nm = player && player.name;
			if (nm && idInRoster(nm)) return nm;
		} catch (e) {}
		return null;
	}
	function activeList() {
		var out = [];
		for (var i = 0; i < world.ai.length; i++) {
			var a = world.ai[i];
			if (!a.retired && a.fund >= AI_MIN_STAKE) out.push(a);
		}
		return out;
	}
	/* skill 重算 —— 所有资金变动的必经点（settle* / playOne / 复出 / 导入 都走这里）。
	   顺带维护 everTier3 里程碑：资金曾达到豪赌席门槛就永久置位，
	   供「打穿世界首富」统计使用（此前那项统计借用 retireCount，口径完全不对）。 */
	function refreshSkill(a) {
		if (!a) return;
		a.skill = skillOf(a.fund);
		/* 里程碑置位只在**首次**发生：顺手写一条世界动态（旧档已富的不补记，避免刷屏） */
		if (a.fund >= TIER3_FUND && !a.everTier3) {
			a.everTier3 = true;
			pushHistory({ kind: "tier3", n: a.name });
		}
	}

	/* ============================================================
	   2. 资金演化（§I.2）—— 严格零和（除复出补资与台费蒸发）
	   ============================================================ */
	/* 由**玩家的牌桌**造成的档位变化 → 一条世界动态（同档位不记）。
	   2026-10-03：玩家最容易有实感的一条叙事 —— "我把他打出豪赌席了"。 */
	function noteTierShift(a, fundBefore) {
		try {
			var t0 = tierOfFund(fundBefore), t1 = tierOfFund(a.fund);
			if (t1 === t0) return;
			if (t1 < t0) pushHistory({ kind: "tierdown", n: a.name, from: TIER_NAMES[t0], to: TIER_NAMES[t1] });
			else pushHistory({ kind: "tierup", n: a.name, from: TIER_NAMES[t0], to: TIER_NAMES[t1] });
		} catch (eTS) {}
	}
	/* AI 赢下底池：资金 +（净赢 × 0.95） */
	function settleWin(id, netWin) {
		var a = byId(id);
		if (!a) return null;
		netWin = Math.max(0, Math.floor(Number(netWin) || 0));
		var before = a.fund;
		var gain = Math.floor(netWin * AI_WIN_RATE);
		a.fund = clampNum(a.fund + gain, 0, AI_FUND_CAP);
		a.hands += 1;
		a.wins += 1;
		a.streak += 1;
		if (a.streak > a.bestStreak) a.bestStreak = a.streak;
		if (netWin > a.biggestPot) a.biggestPot = netWin;
		a.last = Date.now();
		refreshSkill(a);
		noteTierShift(a, before);
		checkRetire(a);
		saveWorld();
		var out = publicOf(a);
		/* 真实资金变动（= 名义额扣掉台费、并受资金上限钳制后的值）。
		   调用方（shell 的会话结算）用它记账，避免"报 1500、实到 1425"的账面不符。 */
		out._delta = a.fund - before;
		return out;
	}
	/* AI 输掉底池：资金 −（净输） */
	function settleLose(id, netLoss) {
		var a = byId(id);
		if (!a) return null;
		netLoss = Math.max(0, Math.floor(Number(netLoss) || 0));
		var before = a.fund;
		a.fund = clampNum(a.fund - netLoss, 0, AI_FUND_CAP);
		a.hands += 1;
		a.streak = 0;
		a.last = Date.now();
		refreshSkill(a);
		noteTierShift(a, before);
		checkRetire(a);
		saveWorld();
		var out = publicOf(a);
		out._delta = a.fund - before;      // 负数；触及 0 下限时会小于名义扣款
		return out;
	}
	/* 只记战果、不动钱（2026-10-03）：给"名次制 / 计分制"牌桌用 ——
	   UNO 这类不与世界对赌资金的游戏，同桌 AI 的手数 / 胜负 / 心态也应随对局演化，
	   否则同一个"张飞"在德州里会破产、在 UNO 桌上却是木头人（同一世界两套人格）。
	   won: true 胜 / false 负 / null 和局（三分支都走 advanceState）。 */
	function settleResult(id, won) {
		var a = byId(id);
		if (!a) return null;
		advanceState(a, (won === true) ? true : (won === false ? false : null), 0);
		a.last = Date.now();
		saveWorld();
		return publicOf(a);
	}
	/* 仅记一手（未分胜负，如弃牌）。isDraw = 真平局：同时走 advanceState 的和局分支 ——
	   否则 drew（平局数）恒为 0、advanceState 的和局分支是死代码。
	   壳的会话结算在 profit === 0 时传 true（"平局补记"，见 csh_shell）——
	   在此之前那条路径只加 hands，"平局数"这个对外字段永远显示 0。 */
	function settlePlay(id, isDraw) {
		var a = byId(id);
		if (!a) return null;
		if (isDraw) {
			advanceState(a, null, 0);       // 和局：hands+1 / drew+1 / form 向中值回归 / 经验 +0.35
		} else {
			a.hands += 1;
		}
		a.last = Date.now();
		saveWorld();
		return publicOf(a);
	}
	/* 退隐判定（§I.2）：资金 < 最低带入 → 退隐 */
	function checkRetire(a) {
		if (!a.retired && a.fund < AI_MIN_STAKE) {
			a.retired = true;
			a.retireDay = dayIndex();
			a.retireCount = (a.retireCount || 0) + 1;
			pushHistory({ kind: "retire", n: a.name, c: a.retireCount });
			logInfo(a.name + " 资金耗尽（" + a.fund + "）→ 退隐（第 " + a.retireCount + " 次）");
		}
	}
	/* 复出（§I.2 归零刷新）：退隐满 3 天 → 补 1,000~3,000 回归重爬 */
	function tryComeback(a, today) {
		if (!a.retired) return false;
		if (today - a.retireDay < RETIRE_DAYS) return false;
		var goneDays = today - a.retireDay;
		a.retired = false;
		a.fund = randInt(COMEBACK_MIN, COMEBACK_MAX);
		a.retireDay = 0;
		refreshSkill(a);
		pushHistory({ kind: "comeback", n: a.name, f: a.fund, d: goneDays });
		logInfo(a.name + " 复出，补资 " + a.fund);
		return true;
	}

	/* ============================================================
	   3. 离线结算（§I.2 最后一条 / §5.1 #13）
	   每次进入池子休闲时，按"离线天数"模拟 AI 互相输赢。
	   ★ 2026-09-29：胜负概率改为**受 skill 影响**（越聪明赢面越大），
	     使"钱往聪明人手里集中"成为世界的自然规律 —— 这也是豪赌席能长期存在的机制解释。
	   ============================================================ */
	function tick() {
		var today = dayIndex();
		var days = today - world.lastTick;
		if (days <= 0) {
			/* 【2026-10-02 拟真化】同一天内的"轻量心跳"原来只做复出判定 —— 于是
			   一天之内无论进出休闲页多少次，世界都纹丝不动（牌桌看起来是死的）。
			   现在每次心跳也推进若干桌对局，让世界"活着"。
			   ⚠ 配额单位是**桌数（matches）而不是轮数**：playRounds(n) 每轮最多开
			     10 桌，若按"轮"计数会一次吃掉整天额度（实测 playRounds(3) = 30 桌，
			     第一版就踩了这个坑，导致同一天后续心跳全部 0 局）。
			   HEARTBEAT_MATCH_MAX 为单日上限，跨天自动重置，避免反复进出把一天刷爆。 */
			if (world.heartbeatDay !== today) { world.heartbeatDay = today; world.heartbeatMatches = 0; }
			var leftMatches = HEARTBEAT_MATCH_MAX - (world.heartbeatMatches || 0);
			if (leftMatches > 0) {
				var roundsWanted = Math.max(1, Math.ceil(leftMatches / 10));
				var r2 = playRounds(roundsWanted);
				world.heartbeatMatches = (world.heartbeatMatches || 0) + r2.rounds;
				if (r2.rounds > 0) saveWorld();
			/* 日报（2026-10-03）：同日心跳也记一条（pushHistory 会与今天那条合并），
			   这样"世界动态"永远不会因为阈值太高而空着。 */
			if (r2.rounds > 0) { pushHistory({ kind: "day", m: r2.rounds, pot: batchMaxPot, d: 0 }); batchMaxPot = 0; }
				var woke0 = false;
				for (var k0 = 0; k0 < world.ai.length; k0++) if (tryComeback(world.ai[k0], today)) woke0 = true;
				if (woke0) saveWorld();
				if (r2.rounds > 0) logInfo("同日心跳：" + r2.rounds + " 桌（今日累计 " + world.heartbeatMatches + "/" + HEARTBEAT_MATCH_MAX + "）");
				return { days: 0, rounds: r2.rounds, changed: r2.rounds > 0 || woke0 };
			}
			// 今日心跳额度用完：只做复出判定（保持原行为）
			var woke = false;
			for (var k = 0; k < world.ai.length; k++) if (tryComeback(world.ai[k], today)) woke = true;
			if (woke) saveWorld();
			return { days: 0, rounds: 0, changed: woke };
		}
		days = Math.min(days, 3650);   // 防御：极端回拨/长期未开
		var res = playRounds(days * OFFLINE_PER_DAY);
		world.lastTick = today;
		world.heartbeatDay = today;            // 跨天后同日额度重新开始
		world.heartbeatMatches = 0;
		saveWorld();
		if (res.rounds > 0) {
			logInfo("离线结算 " + days + " 天：" + res.rounds + " 笔资金转移，世界已变化");
			/* 日报（2026-10-03）：先记"离开期间发生了什么"，再让破纪录/退隐/复出等事件覆盖在上层 */
			pushHistory({ kind: "day", m: res.rounds, pot: batchMaxPot, d: days });
			batchMaxPot = 0;
		}
		return { days: days, rounds: res.rounds, changed: res.rounds > 0 };
	}
	/* 把"打若干轮"抽出来，供离线结算与同日心跳共用。
	   rounds: 轮数（每轮最多 10 桌对局）。返回 {rounds, bust}。 */
	function playRounds(roundsWanted) {
		var rounds = 0, bust = 0;
		var today = dayIndex();
		for (var d = 0; d < roundsWanted; d++) {
			var pool = activeList();
			if (pool.length < 2) break;
			/* ★ 2026-10-03 修（审计 P2-10，"轮"的真实语义）：此前每桌都各自 randInt 抽两人
			   （**有放回**），于是同一轮里 A 可能连打 2~3 桌、B 一次没上 —— 与"轮"的字面
			   含义（每人最多一局）不符，也让 fatigue / mood / rivalry 的每轮增量分布不均。
			   现改为"洗牌后依次两两配对"：同一轮内每人至多出现一次；桌数上限 10 与
			   其决定的每日心跳额度（HEARTBEAT_MATCH_MAX）语义不变。 */
			var deck = pool.slice();
			for (var sf = deck.length - 1; sf > 0; sf--) {
				var jj = randInt(0, sf);
				var tmp = deck[sf]; deck[sf] = deck[jj]; deck[jj] = tmp;
			}
			var pairs = Math.min(Math.floor(deck.length / 2), 10);
			for (var p = 0; p < pairs; p++) {
				var A = deck[p * 2], B = deck[p * 2 + 1];
				if (!A || !B || A === B) continue;
				if (playOne(A, B)) rounds++;
			}
			for (var q = 0; q < world.ai.length; q++) {
				checkRetire(world.ai[q]);
				if (tryComeback(world.ai[q], today)) bust++;
			}
		}
		return { rounds: rounds, bust: bust };
	}
	/* 单桌对局：完整包含"谁赢（skill+心态+宿敌+恩怨）→ 资金转移 → 状态推进 → 关系累积"。
	   返回是否真的打了一局。 */
	function playOne(A, B) {
		// 转移额：取较弱一方资金的 2%~12%
		var base = Math.min(A.fund, B.fund);
		var amt = Math.floor(base * (0.02 + Math.random() * 0.10));
		if (amt < 1) return false;
		/* 谁赢（2026-10-02 拟真化）：
		   原来只看 skill + 性格方差。现在叠加三项"人"的因素：
		     · effectiveSkill —— 资金牌技 + 实战经验（穷人也能靠经验成长）
		     · mentalFactor  —— 心态/手感/疲劳带来的 ±10% 发挥浮动
		     · 恩怨与宿敌     —— 面对打穷过自己的人会打得凶（也更冒进），
		                         面对老对手则互相熟悉、胜率向 50% 回归
		   同时保留性格方差，保证弱者仍有翻身机会、世界不板结。 */
		var pa = PERSONAS[A.persona], pb = PERSONAS[B.persona];
		var sA = effectiveSkill(A) * mentalFactor(A);
		var sB = effectiveSkill(B) * mentalFactor(B);
		var pA = 0.5 + (sA - sB) * 0.35 + (Math.random() - 0.5) * 0.1;
		pA += (pa.variance - pb.variance) * 0.1;
		/* 宿敌效应：交手次数越多，胜负越接近五五开（彼此太熟） */
		var riv = 0;
		try {
			var RA = world.relations.rivalry[A.id];
			if (RA && RA[B.id]) riv = RA[B.id];
		} catch (eRv) {}
		if (riv > 0) pA = pA + (0.5 - pA) * Math.min(0.35, riv * 0.02);
		/* 恩怨效应（2026-10-03 改为**成对**）：只有"A 恨 B"才影响 A 与 B 这一桌；
		   双方互相有仇时相互抵消（保留原"两个都带火气 → 净效果为零"的口径）。 */
		var gAB = grudgeValue(A, B.id), gBA = grudgeValue(B, A.id);
		if (gAB > 0 && gBA <= 0) pA += 0.03;
		else if (gBA > 0 && gAB <= 0) pA -= 0.03;
		pA = Math.max(0.05, Math.min(0.95, pA));
		var winner = Math.random() < pA ? A : B;
		var loser = winner === A ? B : A;
		var real = Math.min(amt, loser.fund);
		winner.fund = clampNum(winner.fund + Math.floor(real * AI_WIN_RATE), 0, AI_FUND_CAP);
		loser.fund = clampNum(loser.fund - real, 0, AI_FUND_CAP);
		/* 状态推进（心态/手感/疲劳/实战经验），并记一笔对抗关系 */
		advanceState(winner, true, real);
		advanceState(loser, false, real);
		bumpRivalry(A.id, B.id);
		/* 个人战绩（2026-10-03 补）：与 settleWin/settleLose 同口径 ——
		   最大底池记**名义**转移额（real），last 记参与时间。
		   此前离线对局只推进状态与关系，不更新这两项，于是
		   世界纪录 bestPot 已刷新、个人 biggestPot 还停在旧值
		   （生涯面板的「最大底池」榜因此长期不动），last 也永远偏旧。 */
		if (real > (winner.biggestPot || 0)) winner.biggestPot = real;
		winner.last = Date.now();
		loser.last = Date.now();
		/* 生涯纪录：供生涯面板叙述世界史 + 世界动态（2026-10-03 起同时进事件环） */
		try {
			var prevPot = world.records.bestPot || 0;
			if (real > prevPot) {
				world.records.bestPot = real; world.records.bestPotBy = winner.name;
				pushHistory({ kind: "pot", w: winner.name, l: loser.name, amt: real, rec: true });
			} else if (real >= Math.max(100000, prevPot * 0.15)) {
				/* 没破纪录但够大（现有纪录的 15%，或起步 10 万）才值得单独写一条。
				   【2026-10-03 调低】原阈值 max(100万, 25%)：AI 对局的底池是"两人中较穷者资金的
				   2%~12%"，穷桌之间往往只有几千 —— 阈值过高会让动态长期空着（用户实机看到
				   "牌桌上最近很安静"而其实已打了 70 局）。现在阈值可触达，且每天还有日报兜底。 */
				pushHistory({ kind: "pot", w: winner.name, l: loser.name, amt: real, rec: false });
			}
			if (real > batchMaxPot) batchMaxPot = real;   /* 供本轮日报汇总"最大一笔" */
			if ((winner.bestStreak || 0) > (world.records.longestStreak || 0)) {
				world.records.longestStreak = winner.bestStreak; world.records.longestStreakBy = winner.name;
				pushHistory({ kind: "streak", n: winner.name, c: winner.bestStreak });
			}
			world.records.matches = (world.records.matches || 0) + 1;
		} catch (eRec) {}
		refreshSkill(winner); refreshSkill(loser);
		return true;
	}
	/* 同日心跳额度：每天最多额外打这么多**桌**（matches），跨天自动重置（tick 内）。
	   ⚠ 单位是桌数不是轮数——playRounds 返回的 rounds 即桌数；旧版 HEARTBEAT_MAX=3 按
	   轮计（≈30 桌）是本机制第一版残留，2026-10-02 拟真化改按桌计时曾因引用未定义的
	   HEARTBEAT_MATCH_MAX 每次心跳抛 ReferenceError（实机 2026-10-03 抓到），此处一并修复。 */
	var HEARTBEAT_MATCH_MAX = 30;

	/* ============================================================
	   4. 牌桌组局（§I.3 · 2026-09-29 增加豪赌桌）
	   ============================================================ */
	/* 有资格坐豪赌桌的 AI（富桌 + 豪赌席） */
	function gamblePool() {
		return activeList().filter(function (a) { return a.fund >= GAMBLE_MIN_FUND; });
	}
	/* 豪赌桌为某个带入额抽一位 AI 时的带入（= 玩家带入 × 2~5，受其资金 60% 约束）
	   ★ 硬约束：AI 带入**永不超过它自己的资金**（否则就是无中生有）。
	     豪赌席准入资金 ≥ 200 万 ⇒ 60% ≥ 120 万 > 最低带入，故实际总能凑够 2~5 倍。 */
	function gambleStakeOf(a, buyIn) {
		var mult = multOf(a.fund);
		var want = Math.floor(buyIn * mult);
		var afford = Math.floor(a.fund * 0.6);
		var stake = Math.min(want, afford);
		if (stake < AI_MIN_STAKE) stake = AI_MIN_STAKE;
		return { mult: mult, stake: stake, capped: want > afford };
	}
	/* 豪赌桌如实标注：不隐藏、不粉饰（用户要求"可信度极高"） */
	function gambleInfo(buyIn) {
		buyIn = Math.max(1, Math.floor(Number(buyIn) || GAMBLE_FROM));
		var pool = gamblePool();
		var mults = [], stakes = [], skills = [];
		for (var i = 0; i < pool.length; i++) {
			var g = gambleStakeOf(pool[i], buyIn);
			mults.push(g.mult); stakes.push(g.stake); skills.push(pool[i].skill);
		}
		mults.sort(function (x, y) { return x - y; });
		stakes.sort(function (x, y) { return x - y; });
		skills.sort(function (x, y) { return x - y; });
		var count = function (arr, idx) { return arr.length ? arr[idx] : 0; };
		return {
			buyIn: buyIn, gamble: true,
			poolSize: pool.length,
			multMin: count(mults, 0), multMax: count(mults, mults.length - 1),
			stakeMin: count(stakes, 0), stakeMax: count(stakes, stakes.length - 1),
			skillMin: count(skills, 0), skillMax: count(skills, skills.length - 1),
			/* 桌上所有 AI 的带入总额 = 本局玩家理论上能赢的上限（自然封顶） */
			tableTotal: stakes.reduce(function (s, v) { return s + v; }, 0),
		};
	}
	/* 宿敌：与该 AI 交手次数最多的对手名字（无则空串）。
	   供游戏页台词与生涯面板叙述"谁和谁有仇"。 */
	function topRivalName(a) {
		try {
			if (!a || !world.relations || !world.relations.rivalry) return "";
			var m = world.relations.rivalry[a.id];
			if (!m) return "";
			var bestId = "", bestV = 0;
			for (var k in m) { if (m[k] > bestV) { bestV = m[k]; bestId = k; } }
			if (!bestId) return "";
			var other = byId(bestId);
			return other ? (other.name || "") : "";
		} catch (e) { return ""; }
	}
	/* 成对仇恨（2026-10-03，审计 P1-8）：A 对 B 的仇恨只影响 A 与 B 这一桌。
	   在此之前仇怨是**标量** a.grudge —— 那其实是"被**玩家**得罪的程度"（唯一写入方是
	   互动桥：砸鸡蛋 +1 / 队友阵亡 +2），却被 playOne 拿去调整 A 与任意对手的胜率：
	   A 被玩家砸过鸡蛋，就会在与 C 的牌桌上莫名更凶。
	   现在：grudges = { 对象键: 仇恨值 }，玩家用 PLAYER_GRUDGE_KEY；
	   AI 之间的键位已就绪（宿敌 / 借贷 / 复仇 等后续玩法的地基），今日无写入方即为空表。 */
	function grudgeValue(a, targetKey) {
		if (!a || !a.grudges || typeof a.grudges !== "object") return 0;
		var v = a.grudges[targetKey];
		return (typeof v === "number" && isFinite(v) && v > 0) ? v : 0;
	}
	function grudgeToPlayer(a) { return grudgeValue(a, PLAYER_GRUDGE_KEY); }

	/* ============================================================
	   世界动态（流言）—— 事件环 + 人物化叙事（2026-10-03 新增）
	   ------------------------------------------------------------
	   为什么加：世界的输赢 / 退隐 / 复出 / 宿敌原本只落进调试日志，玩家侧只有一句
	   笼统 toast（"你离开的这 N 天…"），于是"97 个人在打牌"在体验上等于不存在 ——
	   生涯面板的排行榜只是**一张静态快照**，看不到昨天谁破产、谁又回来了、谁跟谁杠上了。

	   做法：只记**值得说的**事（破纪录 / 退隐 / 复出 / 首进豪赌席 / 宿敌里程碑 /
	   玩家与谁结仇 / 你把人打落档 / 豪赌桌连胜），存成有上限的事件环。
	   叙述时按事件类型取句子模板，模板由**事件自身稳定哈希**选中 ——
	   同一条事件每次读到的措辞都一样，像"记录在案"，而不是每次刷新换一句话的复读机。

	   边界：**纯只读派生**，不进任何经济与演化计算；旧档由 normalizeWorld 补空环。
	   ============================================================ */
	var HISTORY_MAX = 24;
	/* 本轮推演的"最大一笔"（3000 天长跑时也只用两个数字，代价可忽略），供日报汇总 */
	var batchMaxPot = 0;
	/* 成就计数（2026-10-03）：事件环只留最近 24 条（会被顶掉），而成就问的是"累计发生过几次"，
	   所以在这一层单独累加，随存档持久化。全部是**只读统计**，不参与任何经济计算。 */
	function freshFeats() {
		return { records: 0, tierDown: 0, tierUp: 0, retires: 0, comebacks: 0, rivals: 0, grudge: 0, tier3up: 0, gstreaks: 0 };
	}
	function bumpFeat(k) {
		try {
			if (!world.feats || typeof world.feats !== "object") world.feats = freshFeats();
			world.feats[k] = clampNum((world.feats[k] || 0) + 1, 0, 9999999);
		} catch (e) {}
	}
	function pushHistory(ev) {
		try {
			if (!ev || !ev.kind) return;
			if (!world.history || !Array.isArray(world.history)) world.history = [];
			ev.day = dayIndex();
			/* 日报合并（2026-10-03）：同一天的 kind="day" 只保留一条 —— 反复进出休闲页会
			   触发多次心跳，每次都往环里塞一条"今天打了 N 桌"会把有意义的事件挤掉。
			   合并后它长这样：今天打了 12 桌，最大一笔 34 万。 */
			if (ev.kind === "day") {
				var last = world.history.length ? world.history[world.history.length - 1] : null;
				if (last && last.kind === "day" && last.day === ev.day) {
					last.m = (last.m || 0) + (ev.m || 0);
					if ((ev.pot || 0) > (last.pot || 0)) last.pot = ev.pot || 0;
					return;
				}
			}
			world.history.push(ev);
			if (world.history.length > HISTORY_MAX) world.history = world.history.slice(-HISTORY_MAX);
			/* 顺手累加成就计数（kind → 计数字段）；未登记的类型不计数 */
			var k = ev.kind === "pot" ? (ev.rec ? "records" : "")
				: ev.kind === "retire" ? "retires"
				: ev.kind === "comeback" ? "comebacks"
				: ev.kind === "tier3" ? "tier3up"
				: ev.kind === "tierdown" ? "tierDown"
				: ev.kind === "tierup" ? "tierUp"
				: ev.kind === "rival" ? "rivals"
				: ev.kind === "grudge" ? "grudge"
				: ev.kind === "gstreak" ? "gstreaks" : "";
			if (k) bumpFeat(k);
		} catch (e) {}
	}
	/* 天序 → 人话 */
	function whenText(day, today) {
		var d = today - (typeof day === "number" ? day : today);
		if (d <= 0) return "今天";
		if (d === 1) return "昨天";
		if (d < 7) return d + " 天前";
		if (d < 14) return "上周";
		if (d < 45) return "前些日子";
		return "很久以前";
	}
	/* 用事件本身当种子挑措辞：同一条事件措辞固定（不是每次刷新都换说法） */
	function pickBy(seed, arr) { return arr[Math.abs(stableHash(String(seed))) % arr.length]; }
	function nameOf(id) { var a = byId(id); return a ? a.name : String(id || "某人"); }

	/* 事件 → 一句人话。返回 null = 这条不值得说（兼容老环里的未知类型）。 */
	function describeEvent(ev, today) {
		if (!ev || !ev.kind) return null;
		var seed = ev.kind + "|" + (ev.day || 0) + "|" + (ev.n || ev.w || "") + "|" + (ev.amt || ev.c || 0);
		if (ev.kind === "pot") {
			return ev.rec
				? pickBy(seed, [
					ev.w + " 从 " + ev.l + " 手里赢走 " + fmtMoney(ev.amt) + "，世界纪录又往上顶了一截",
					"最大的一笔： " + ev.w + " 赢了 " + ev.l + " 的 " + fmtMoney(ev.amt) + "，牌桌上没人见过这么多",
					ev.w + " 打穿了 " + ev.l + " 的底池（" + fmtMoney(ev.amt) + "），这个数字挂在那儿，一时半会没人碰得到",
				])
				: pickBy(seed, [
					ev.w + " 一局从 " + ev.l + " 那里端走 " + fmtMoney(ev.amt),
					ev.l + " 手气不好，" + ev.w + " 顺势收下 " + fmtMoney(ev.amt),
				]);
		}
		if (ev.kind === "retire") {
			return (ev.c > 1)
				? pickBy(seed, [
					ev.n + " 又输光了下桌 —— 生涯第 " + ev.c + " 次退隐，熟悉的味道",
					ev.n + " 的筹码见了底，第 " + ev.c + " 次收摊。有人说他该换个玩法了",
				])
				: pickBy(seed, [
					ev.n + " 输光了家底，收摊走人",
					ev.n + " 的筹码见了底，今天不打了",
				]);
		}
		if (ev.kind === "comeback") {
			return pickBy(seed, [
				"歇了 " + (ev.d || RETIRE_DAYS) + " 天，" + ev.n + " 又坐回来了，兜里揣着 " + fmtMoney(ev.f),
				ev.n + " 复出了 —— 带 " + fmtMoney(ev.f) + " 回来重头爬",
				"以为 " + ev.n + " 不来了，结果他今天又出现在牌桌上，本钱 " + fmtMoney(ev.f),
			]);
		}
		if (ev.kind === "tier3") {
			return pickBy(seed, [
				ev.n + " 挤进了豪赌席 —— 从今往后同桌的都是狠人",
				ev.n + " 打上豪赌席了，身家过了两千万这条线",
				"豪赌席又添一位：" + ev.n + "。前阵子他还坐中桌",
			]);
		}
		if (ev.kind === "rival") {
			return pickBy(seed, [
				ev.a + " 和 " + ev.b + " 又碰上了，这已经是第 " + ev.c + " 次",
				"第 " + ev.c + " 次交手：" + ev.a + " 与 " + ev.b + "，谁也不服谁",
				ev.a + " 一见 " + ev.b + " 就来劲 —— 两人已经打了 " + ev.c + " 局",
			]);
		}
		if (ev.kind === "grudge") {
			return pickBy(seed, [
				ev.n + " 还记着你那一手，账又添了一笔（欠你 " + ev.c + " 次）",
				"你把 " + ev.n + " 得罪得不轻，他现在的账本上写着你",
			]);
		}
		if (ev.kind === "tierdown") {
			return pickBy(seed, [
				ev.n + " 掉出了 " + ev.from + "，这一下是坐在你对面输的",
				ev.n + " 被你打落一档 —— 从 " + ev.from + " 掉到了 " + ev.to,
			]);
		}
		if (ev.kind === "tierup") {
			return pickBy(seed, [
				ev.n + " 在你对面赢了一票，坐上了 " + ev.to,
				ev.n + " 靠你这一局升了档：" + ev.from + " → " + ev.to,
			]);
		}
		if (ev.kind === "day") {
			var mTxt = (ev.m || 0) + " 桌";
			var pTxt = ev.pot ? ("，最大一笔 " + fmtMoney(ev.pot)) : "";
			if (ev.d > 0) {
				/* 前缀由 UI 补（"今天 / N 天前"），所以这里不写"今天" —— 写"这 N 天"才通顺 */
				return pickBy(seed, [
					"这 " + ev.d + " 天里牌桌没停：共 " + mTxt + pTxt,
					"你不在的这些天，牌桌上打了 " + mTxt + pTxt,
				]);
			}
			return pickBy(seed, [
				"今天牌桌上打了 " + mTxt + pTxt,
				"今天又开了 " + mTxt + pTxt,
				"牌桌今天很热闹：" + mTxt + pTxt,
			]);
		}
		if (ev.kind === "streak") {
			return pickBy(seed, [
				ev.n + " 连赢 " + ev.c + " 局，手风顺得不像话",
				ev.n + " 已经连下 " + ev.c + " 城，对面几个脸色不太好看",
			]);
		}
		if (ev.kind === "gstreak") {
			return pickBy(seed, [
				"你在豪赌桌连赢 " + ev.c + " 局，这事在牌桌上已经传开了",
				"豪赌桌的记录本上多了一行：你连吃 " + ev.c + " 局",
			]);
		}
		return null;
	}
	/* 供 UI 读取：最近 n 条，新的在前。每条带 when（今天/昨天/N 天前）。 */
	function news(n) {
		var out = [], lim = clampNum(n == null ? 8 : n, 1, 20);
		var arr = Array.isArray(world.history) ? world.history : [];
		var today = dayIndex();
		for (var i = arr.length - 1; i >= 0 && out.length < lim; i--) {
			var text = describeEvent(arr[i], today);
			if (text) out.push({ day: arr[i].day || today, when: whenText(arr[i].day, today), text: text });
		}
		return out;
	}
	/* 金额人话化：12345678 → 1234 万（超过 1 亿用亿），保留一位小数 */
	function fmtMoney(v) {
		var n = Math.max(0, Math.floor(Number(v) || 0));
		if (n >= 100000000) return (Math.round(n / 1000000) / 100) + " 亿";
		if (n >= 10000) return Math.round(n / 10000) + " 万";
		return String(n);
	}
	/* 世界史：给生涯面板用的叙述性统计（全部只读派生）。 */
	function worldStory() {
		var rec = world.records || {};
		var hottest = null, coldest = null, mostExp = null, mostTilted = null;
		for (var i = 0; i < world.ai.length; i++) {
			var a = world.ai[i];
			if (a.retired) continue;
			if (!hottest || (a.mood || 0) > (hottest.mood || 0)) hottest = a;
			if (!coldest || (a.mood || 0) < (coldest.mood || 0)) coldest = a;
			if (!mostExp || (a.skillPlay || 0) > (mostExp.skillPlay || 0)) mostExp = a;
			if (!mostTilted || tiltScore(a) > tiltScore(mostTilted)) mostTilted = a;
		}
		function brief(x) {
			return x ? { name: x.name, mood: x.mood || 0, form: x.form == null ? 0.5 : x.form,
				fatigue: x.fatigue || 0, skillPlay: x.skillPlay || 0,
				effSkill: effectiveSkill(x), rival: topRivalName(x), fund: x.fund } : null;
		}
		return {
			matches: rec.matches || 0,
			bestPot: rec.bestPot || 0, bestPotBy: rec.bestPotBy || "",
			longestStreak: rec.longestStreak || 0, longestStreakBy: rec.longestStreakBy || "",
			hottest: brief(hottest), coldest: brief(coldest),
			mostExperienced: brief(mostExp), mostTilted: brief(mostTilted),
		};
	}
	function tiltScore(a) {
		return (a && typeof a.mood === "number" ? -a.mood : 0) * 2 +
			(a && typeof a.fatigue === "number" ? a.fatigue : 0);
	}

	/* 抽取 n 个对手：性格混合（不出现全员同一性格）、同桌不同名、资金足够 */
	function seat(n, buyIn, opts) {		opts = opts || {};
		n = clampNum(Math.floor(Number(n) || 0), 0, 5);
		buyIn = Math.max(AI_MIN_STAKE, Math.floor(Number(buyIn) || 1000));
		var gamble = buyIn >= GAMBLE_FROM;

		var pool = gamble
			? gamblePool()
			: activeList().filter(function (a) {
				return Math.min(buyIn, Math.floor(a.fund * 0.3)) >= AI_MIN_STAKE;
			});
		if (!pool.length) return [];

		var chosen = [];
		var usedPersona = {};
		var guard = 0;
		while (chosen.length < n && guard < 400) {
			guard++;
			var cand = pick(pool);
			if (chosen.indexOf(cand) >= 0) continue;
			// 性格混合：已选满 2 人后，尽量不选重复性格（前 2 位允许）
			if (chosen.length >= 2 && usedPersona[cand.persona] && Object.keys(usedPersona).length < PERSONA_KEYS.length) {
				var hasOther = pool.some(function (x) {
					return chosen.indexOf(x) < 0 && !usedPersona[x.persona];
				});
				if (hasOther) continue;
			}
			// 同桌不同名（§I.3）
			var dup = chosen.some(function (x) { return x.name === cand.name; });
			if (dup) continue;
			chosen.push(cand);
			usedPersona[cand.persona] = 1;
		}

		return chosen.map(function (a) {
			var g = gamble ? gambleStakeOf(a, buyIn) : null;
			var stake = gamble ? g.stake : Math.min(buyIn, Math.floor(a.fund * 0.3));
			return {
				id: a.id, name: a.name, surname: a.surname,
				/* 头像 seed（2026-10-01）：97 人下同姓 6 人，游戏页头像必须带 seed 才不撞脸
				   （与 avatar() 同款 stableHash，§9.5 五处复用）。 */
				seed: stableHash(String(a.id)),
				persona: a.persona, personaName: PERSONAS[a.persona].name,
				personaParams: PERSONAS[a.persona],
				fund: a.fund,
				skill: a.skill,                       // 牌技 0.62~1.00（只影响决策质量）
				/* ---------- 拟真化新增（2026-10-02）----------
				   把"人"的一面透给游戏页与生涯面板：心态 / 手感 / 疲劳 / 实战经验 /
				   宿敌名字。games 用它做台词与头像状态，career 用它叙述世界史。
				   全部只读派生，不改动原字段语义（老调用方不受影响）。 */
				effSkill: effectiveSkill(a),          // 资金牌技 + 实战经验（封顶 +0.15）
				mood: a.mood || 0,                    // -1 tilt ~ +1 自信
				moodName: (a.mood || 0) >= 0.45 ? "手感火热" : (a.mood || 0) <= -0.45 ? "心态崩了"
					: (a.mood || 0) >= 0.12 ? "状态不错" : (a.mood || 0) <= -0.12 ? "有点闷" : "心态平稳",
				form: a.form == null ? 0.5 : a.form,   // 0~1 近期手感
				fatigue: a.fatigue || 0,               // 0~1 疲劳
				drew: a.drew || 0,                     // 平局数（牌桌本来就有和局）
				skillPlay: a.skillPlay || 0,           // 实战经验累计
				rival: topRivalName(a),                // 交手最多的对手（宿敌）
				winRate: (a.hands || 0) ? (a.wins || 0) / a.hands : 0,
				tier: tierOfFund(a.fund), tierName: TIER_NAMES[tierOfFund(a.fund)],
				/* 真实战绩：UI 用它替代"牌技"这类在庄家制游戏里不成立的描述
				   （廿一点的庄家按固定规则要牌，牌技无意义，战绩才是真的） */
				hands: a.hands || 0, wins: a.wins || 0, bestStreak: a.bestStreak || 0,
				/* 对玩家的恩怨（2026-10-03）：给牌桌拟人用 —— 恩怨 ≥ 5 的同桌会记着旧账说话 */
				grudge: grudgeToPlayer(a),
				gamble: gamble,
				mult: g ? g.mult : 1,                 // 豪赌桌带入倍数 2~5
				multCapped: g ? g.capped : false,
				stake: stake,                          // §I.3 带入公式 / 豪赌桌倍数带入
			};
		});
	}

	/* ============================================================
	   4.5 豪赌桌战绩（2026-09-29 新增 · 成就与大厅的真实数据源）
	   ============================================================ */
	function gambleStats() {
		var g = world.gambles || {};
		return {
			plays: g.plays || 0, wins: g.wins || 0, net: g.net || 0,
			best: g.best || 0, bust: g.bust || 0, push: g.push || 0,
			streak: g.streak || 0, bestStreak: g.bestStreak || 0,
			winrate: g.plays ? (g.wins / g.plays) : 0,
		};
	}
	/* 记录一次豪赌桌出战（玩家视角）：profit 为玩家本局净收益（可为负） */
	function noteGamble(profit) {
		if (!world.gambles) world.gambles = freshGambles();
		var g = world.gambles;
		profit = Math.floor(Number(profit) || 0);
		g.plays += 1;
		g.net += profit;
		/* 三态：>0 赢 / <0 输 / =0 平。平局此前落进 else 分支被记成 bust、还清零连胜 ——
		   而平局是真实存在的（壳的会话结算里 profit === 0 走"平局补记"分支）。
		   平局不计胜负，也不中断连胜（连胜只被"输"中断）。 */
		if (profit > 0) { g.wins += 1; g.streak += 1; if (g.streak > g.bestStreak) { g.bestStreak = g.streak; pushHistory({ kind: "gstreak", c: g.bestStreak }); } }
		else if (profit < 0) { g.streak = 0; g.bust += 1; }
		else g.push = (g.push || 0) + 1;
		if (profit > g.best) g.best = profit;
		saveWorld();
		return gambleStats();
	}

	/* ============================================================
	   5. 排行榜（§I.3）
	   ============================================================ */
	function leaderboard(key) {
		key = key || "fund";
		var arr = world.ai.slice();
		if (key === "fund") arr.sort(function (a, b) { return b.fund - a.fund; });
		else if (key === "winrate") {
			arr = arr.filter(function (a) { return a.hands >= 5; });
			arr.sort(function (a, b) { return (b.wins / b.hands) - (a.wins / a.hands); });
		} else if (key === "pot") arr.sort(function (a, b) { return b.biggestPot - a.biggestPot; });
		else if (key === "skill") arr.sort(function (a, b) { return b.skill - a.skill; });
		return arr.slice(0, 10).map(function (a) { return publicOf(a, true); });
	}

	function publicOf(a, full) {
		var o = {
			id: a.id, name: a.name, surname: a.surname, persona: a.persona,
			personaName: PERSONAS[a.persona].name,
			fund: a.fund, skill: a.skill,
			tier: tierOfFund(a.fund), tierName: TIER_NAMES[tierOfFund(a.fund)],
			hands: a.hands, wins: a.wins,
			winrate: a.hands ? (a.wins / a.hands) : 0,
			biggestPot: a.biggestPot, bestStreak: a.bestStreak,
			retired: a.retired, grudge: grudgeToPlayer(a),
		};
		if (full) o.mult = multOf(a.fund);
		return o;
	}

	/* ============================================================
	   5.5 世界聚合统计（生涯大厅 / 成就引擎的真实数据源）
	   ============================================================ */
	function stats() {
		var out = {
			chars: 0, hands: 0, wins: 0, retired: 0,
			fundMin: 0, fundMax: 0, fundSum: 0, skillTop: 0, skillAvg: 0,
			richestId: 0, richestName: "", richestFund: 0,
			poorestFund: 0, tier3: 0, tier2: 0, billionaireBroke: 0,
		};
		var minF = Infinity, maxF = 0, sum = 0, sumSk = 0, broke = 0;
		for (var i = 0; i < world.ai.length; i++) {
			var a = world.ai[i];
			out.chars++;
			out.hands += a.hands || 0;
			out.wins += a.wins || 0;
			if (a.retired) out.retired++;
			sum += a.fund || 0; sumSk += a.skill || 0;
			if ((a.fund || 0) < minF) minF = a.fund || 0;
			if ((a.fund || 0) > maxF) { maxF = a.fund || 0; out.richestId = a.id; out.richestName = a.name; }
			if ((a.skill || 0) > out.skillTop) out.skillTop = a.skill || 0;
			var t = tierOfFund(a.fund || 0);
			if (t === 3) out.tier3++;
			else if (t === 2) out.tier2++;
			/* 「打穿世界首富」= 曾经坐过豪赌席（everTier3）的 AI 已跌出豪赌席。
			   此前判据是 `retireCount > 0` —— 那是"生涯退隐次数"（资金 < 最低带入即计数，
			   见 checkRetire），于是任何打穷过一次的 AI 都满足 ⇒ 成就「打穿世界首富」
			   （2000 CBY，csh_achv.js）等于白送。everTier3 由 refreshSkill 在资金
			   达到豪赌席门槛时永久置位，语义与文案终于一致。 */
			if (a.everTier3 && t < 3) broke++;
		}
		out.fundMin = minF === Infinity ? 0 : minF;
		out.fundMax = maxF;
		out.richestFund = maxF;
		out.poorestFund = out.fundMin;
		out.fundSum = sum;
		out.skillAvg = out.chars ? (sumSk / out.chars) : 0;
		out.billionaireBroke = broke;
		/* 成就计数（2026-10-03 新增）：世界动态的累计值，供成就引擎读取 */
		var ft = (world.feats && typeof world.feats === "object") ? world.feats : {};
		out.recordsSeen = ft.records || 0;      // 亲历世界纪录被打破
		out.tierDown = ft.tierDown || 0;        // 把 AI 打落档（坐在你对面掉下去）
		out.comebacks = ft.comebacks || 0;      // 见证破产者复出
		out.rivals = ft.rivals || 0;            // 见证宿敌交手破 50 局
		out.grudge8 = ft.grudge || 0;           // 让人记恨到 8 级
		return out;
	}

	/* ============================================================
	   6. 恩怨值（§5.1 #12）—— 成对模型（2026-10-03）
	   ------------------------------------------------------------
	   入参 targetKey 缺省 = 玩家本人（历史上唯一的写入方就是玩家互动）。
	   API 形状保持 addGrudge(id, n) / grudge(id) 不变，互动桥无需改动。 */
	function addGrudge(id, n, targetKey) {
		var a = byId(id);
		if (!a) return null;
		if (!a.grudges || typeof a.grudges !== "object") a.grudges = {};
		var key = targetKey || PLAYER_GRUDGE_KEY;
		var before = a.grudges[key] || 0;
		a.grudges[key] = clampNum(before + (Number(n) || 0), 0, 999);
		/* 对玩家的仇怨跨过 5 / 8（互动台词换档的阈值）时记一条世界动态 */
		if (key === PLAYER_GRUDGE_KEY && before < 8 && a.grudges[key] >= 8) {
			pushHistory({ kind: "grudge", n: a.name, c: a.grudges[key] });
		} else if (key === PLAYER_GRUDGE_KEY && before < 5 && a.grudges[key] >= 5) {
			pushHistory({ kind: "grudge", n: a.name, c: a.grudges[key] });
		}
		saveWorld();
		return a.grudges[key];
	}
	function grudge(id, targetKey) {
		var a = byId(id);
		return a ? grudgeValue(a, targetKey || PLAYER_GRUDGE_KEY) : 0;
	}

	/* ============================================================
	   7. 头像（§I.4 方案 A）—— 委托 csh_badge.js 的同一套生成器
	   ============================================================ */
	function avatar(id, size) {
		var a = byId(id);
		if (!a) return "";
		var seed = stableHash(String(a.id));       // 头像 seed（§9.5 同一 stableHash 五处复用）
		try {
			if (lib.cshBadge && typeof lib.cshBadge.avatar === "function") {
				return lib.cshBadge.avatar(a.surname, a.persona, size || 40, seed);
			}
		} catch (e) { logError("头像生成失败", e); }
		// 兜底：极简圆底 + 姓氏（不依赖 badge 模块时也能显示）
		// A6 修复：字符串主键下 a.id % 6 = NaN → fill="undefined"；改用 stableHash 取色
		var hex = ["#c9a86a", "#8fa3b8", "#a88f6a", "#6a8fa8", "#b8926a", "#7a8fa8"][seed % 6];
		var s = Number(size) || 40;
		return '<svg viewBox="0 0 100 100" width="' + s + '" height="' + s + '" xmlns="http://www.w3.org/2000/svg">' +
			'<circle cx="50" cy="50" r="46" fill="' + hex + '" opacity="0.22"/>' +
			'<circle cx="50" cy="50" r="46" fill="none" stroke="' + hex + '" stroke-width="3"/>' +
			'<text x="50" y="50" text-anchor="middle" dominant-baseline="central" font-size="44" fill="' + hex + '">' + a.surname + '</text></svg>';
	}

	/* ============================================================
	   8. 对外导出
	   ============================================================ */
	var CSH = {
		PERSONAS: PERSONAS,
		TIERS: TIER_NAMES,
		/* 成对仇恨表里"玩家本人"的键（csh_migrate 清洗旧档时读它，避免两处手写） */
		PLAYER_GRUDGE_KEY: PLAYER_GRUDGE_KEY,
		const: {
			AI_COUNT: AI_COUNT, AI_MIN_STAKE: AI_MIN_STAKE, AI_FUND_CAP: AI_FUND_CAP,
			SKILL_BASE: SKILL_BASE, SKILL_TOP: SKILL_TOP,
			FUND_LO: FUND_LO, FUND_HI: FUND_HI,
			GAMBLE_FROM: GAMBLE_FROM, MULT_LO: MULT_LO, MULT_HI: MULT_HI,
		},
		skillOf: skillOf,
		multOf: multOf,
		tierOf: tierOfFund,
		/* 资金分层的纯函数出口（2026-10-03）：供验收器直接断言
		   "四层之和 === 名册规模"与"极小名册下资金仍为正且两两不等"，
		   否则这两条只能靠整轮世界推演间接观察。 */
		tierCountsFor: tierCountsFor,
		fundForIndex: fundForIndex,
		list: function () { return world.ai.map(function (a) { return publicOf(a); }); },
		active: function () { return activeList().map(function (a) { return a.id; }); },
		byId: function (id) { var a = byId(id); return a ? JSON.parse(JSON.stringify(a)) : null; },
		seat: seat,
		gambleInfo: gambleInfo,
		gamblePoolSize: function () { return gamblePool().length; },
		settleWin: settleWin, settleLose: settleLose, settlePlay: settlePlay,
		/* 只记战果不动钱：名次制牌桌（UNO）让同桌 AI 也长战绩与心态（2026-10-03） */
		settleResult: settleResult,
		gambleStats: gambleStats, noteGamble: noteGamble,
		stats: stats,
		tick: tick,
		leaderboard: leaderboard,
		addGrudge: addGrudge, grudge: grudge, idOfPlayer: idOfPlayer,
		avatar: avatar,
		raw: function () { return JSON.parse(JSON.stringify(world)); },
		importRaw: function (obj) {
			if (!obj || !Array.isArray(obj.ai)) return false;
			world = obj;
			/* ★ 2026-10-03：与启动读取走**同一条**规整链（补缺角色 / 清非法 persona /
			   丢弃名册外 id / 补 relations·records·心跳字段 / 重算 skill·里程碑）。
			   此前这里只 refreshSkill 一下就落盘，等于把"清洗"全部押在调用方
			   （csh_migrate.cleanWorld）身上 —— 而那一层对世界 schema 是滞后的一份
			   字段清单，于是坏档（未知 persona / 缺 relations）能直接进运行态，
			   publicOf 当场抛异常、面板渲染不出来。 */
			normalizeWorld();
			saveWorld();
			return true;
		},
		invite: function () { toast("AI 世界：" + activeList().length + " 名角色在场"); },
		/* ---------- 拟真化对外出口（2026-10-02）----------
		   worldStory  —— 生涯面板用它叙述世界史（最火/最崩/最老练/宿敌/纪录）
		   heartbeat   —— 轻量心跳：把"离开的天数"补算掉，并推进状态。
		                  此前 tick() 只在模块加载时跑一次，长期不刷新的 WebView 里
		                  世界完全静止（注释承诺的"每次进入池子休闲按离线天数模拟"
		                  从未兑现）。现在由 csh_debug 在进入休闲页时调用。
		   effectiveSkill / mentalFactor —— 供游戏页展示"真实发挥水平"。 */
		worldStory: worldStory,
		/* 世界动态（流言）：最近 n 条值得说的事，人物化措辞，只读派生（2026-10-03 新增） */
		news: news,
		effectiveSkill: effectiveSkill,
		mentalFactor: mentalFactor,
		advanceState: advanceState,
		heartbeat: function () {
			try { return tick(); }
			catch (e) { logError("heartbeat 失败", e); return { days: 0, rounds: 0, changed: false }; }
		},
	};

	lib.cshWorld = CSH;
	try {
		if (typeof window !== "undefined") { window.CSH = window.CSH || {}; window.CSH.world = CSH; }
	} catch (e) {}

	/* 启动即做一次离线结算（§I.2） */
	try {
		var res = tick();
		if (res.changed) toast("你离开的这 " + res.days + " 天，牌桌上又有了新的输赢");
	} catch (e) { logError("启动离线结算失败", e); }

	var st = stats();
	logInfo("AI 世界已加载：" + st.chars + " 名角色，在场 " + activeList().length +
		" 名；资金 " + st.fundMin + " ~ " + st.fundMax + "；牌技上限 " + st.skillTop.toFixed(3));
})();
