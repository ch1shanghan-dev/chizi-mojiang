import { lib, game, ui, get, ai, _status } from "../../../noname.js";
// 池子魔将 · 公共经济模块（池子币 / 官阶 / 签到 / 门票 / 封顶 / CDK / 存档完整性）
//
// 定位：全扩展**唯一**的钱包与官阶数据源（方案 §G.6.1）。
//   各小游戏禁止自存货币或官阶（不允许出现 csh_texas_rank / csh_sniper_rank）。
//
// 对外接口（挂在 lib.cshWallet，并同时导出 CSH 便于子页面/调试引用）：
//   CSH.wallet.get() / add(n,reason) / spend(n,reason) / payTicket(key) / ticketOf(key)
//                sign() / canSign() / relief() / capOf(buyIn,gameKey) / settle(gameKey,buyIn,net)
//   CSH.rank.get() / addMerit(n,reason) / unlockedStakes() / of(merit) / next(rank)
//   CSH.cdk.verify(code) / redeem(code) / usedCount() / recent()
//   CSH.migrate.legacy()      —— 旧键一次性迁移（§G.6.1）
//   CSH.integrity.check()     —— 手改检测 + 快照回滚（§4.5.6）
//
// 数据契约（§5.5.3，键名不得随意新增或改名）：
//   csh_wallet       { pc, pcPeak, lastSign, streak, reliefDate }
//   csh_rank         { rank, merit, meritToday, meritDate }
//   csh_cdk_used     { <seqHash>: ts }
//   csh_wallet_snap  最近合法快照
//   csh_cdk_dev      本机 UUID（CDK 设备绑定）
//   csh_wallet_hist  最近兑换记录（CDK 台账可视化，保留 5 条）
//   csh_daily_task   { day, hands, wins, bigPot, claimed[] }  每日任务唯一真值
//
// ⚠ 2026-09-29 重构：删除 `bank` / `quota` / `quotaDate` 三个**死字段**。
//   · bank  全仓无写入点 → 玩家截图「生涯本金 0 / 100,000,000」的根因
//   · quota 全仓无写入点 → 桥路径恒 0、兜底路径恒 1200，同一 UI 两个答案
//   取代者：`pcPeak`（生涯池子币峰值，真实可核，addPC 内维护）
//           + 每日任务真值 `csh_daily_task`（五游戏共用一个状态机）
//
// 红线遵守：零外链、零外部图片、无 100vw/100vh、前缀 csh_、node --check 通过。

(function () {
	if (lib.cshWallet) return;

	/* ============================================================
	   0. 常量（数值唯一来源 · §5.5.4 禁止散落魔法数字）
	   ============================================================ */
	var K_WALLET = "csh_wallet";
	var K_RANK = "csh_rank";
	var K_USED = "csh_cdk_used";
	var K_SNAP = "csh_wallet_snap";
	var K_DEV = "csh_cdk_dev";
	var K_DEVBIND = "csh_cdk_devbind";
	var K_HIST = "csh_wallet_hist";
	var K_TASK = "csh_daily_task";     // 每日任务唯一真值（2026-09-29 新增）
	// 旧键：迁移后只读备份，不再写入
	var K_LEGACY_BANK = "csh_texas_bank";

	var PC_START = 2000;            // 初始池子币（§F.2）
	var PC_CAP = 100000000000;      // 上限 1000 亿（2026-10-01 用户指定：由 1 亿上调；仍防溢出，2^53 内安全）
	var RELIEF_AMOUNT = 800;        // 破产救济（§F.4）
	var SIGN_BASE = 1200;           // 签到基础（§F.4）
	var SIGN_STEP = 200;            // 每连签 +200
	var SIGN_STREAK_CAP = 15;       // 连签加成封顶 15 天
	var SIGN_MAX = 4200;            // 签到上限（§F.4）
	var SIGN_7DAY_BONUS = 3000;     // 连签满 7 天额外奖励（§F.4）
	var MERIT_SOFT_BASE = 300;      // 每日功勋软上限基数（§G.2.1）
	var MERIT_SOFT_PER = 10;        // 每级 +10
	var MERIT_OVERFLOW_RATE = 0.5;  // 超软上限部分按 50% 计（§G.2.1）
	var HIGH_RANK_DECAY = 0.6;      // 官阶 ≥40 后功勋 ×0.6（§G.2.1）
	var HIGH_RANK_FROM = 40;

	/* 门票（§F.3）——**数值真值已上移到 core/csh_registry.js 的游戏目录**。
	   2026-09-29 收敛：此前门票表 / 回收率 / 目录分散在 shell、games、career 四处各写一份，
	   已漂移出「德州每日上限」「廿一点门票 300」等过时文案。
	   现在本模块只在 registry 不可用时（纯 Node 单测）退回内置副本，保证可独立运行；
	   副本数值必须与 registry 完全一致，_开发自检/registry 一致性用例会交叉核对。

	   门票口径（2026-09-29 统一）：
	     · 牌桌类（德州 / 斗地主 / 廿一点）门票 0 —— 它们是**带入制**：
	       本金会随结算返还，收门票等于双重抽水。真实成本是带入本身。
	     · 名次类（UNO）门票不返还，是真正的入场费。 */
	var REG = null;
	try { REG = (typeof window !== "undefined" && window.CSH && window.CSH.registry) || null; } catch (eReg) {}
	var TICKET = (REG && typeof REG.tickets === "function")
		? REG.tickets()
		: { uno: 150, doudizhu: 0, blackjack: 0, texas: 0 };
	var TICKET_MIN = (REG && typeof REG.minTicket === "function") ? REG.minTicket() : 150;
	/* 救济门槛 = 最低非零门票（§F.4）。此前这里另写一个字面量 150（TICKET_MIN 也写 150），
	   同一事实三份副本 —— 现在只有一个来源。 */
	var RELIEF_THRESHOLD = TICKET_MIN;

	/* 带入档位（2026-09-29 新增 · 全扩展唯一一份，来源用户在 2026-09-29 拍板）。
	   四档在对数尺度上均匀：200 → 2,000 → 20,000 → 200,000。
	   最后一档是「豪赌桌」，AI 携带资金为玩家的 2~5 倍（见 csh_world.GAMBLE）。 */
	var BUYIN_TIERS = [200, 2000, 20000, 200000];
	/* 豪赌桌门槛：带入 ≥ 此值即视为豪赌桌（AI 倍数带入 + 世界顶级牌技） */
	var GAMBLE_FROM = 200000;
	function isGamble(buyIn) { return Math.floor(Number(buyIn) || 0) >= GAMBLE_FROM; }

	/* 资产里程碑阶梯（2026-09-29 第四轮新增 · 全扩展唯一一份）
	   为什么需要它：德州开局页那条「池子币余额」进度条此前口径是
	     min(100, bank / GAMBLE_FROM × 100)
	   余额一过 200,000 就恒等于 100% —— 一手钳死、再无信息量（用户真机反馈
	   「这个余额进度条是不是不太对」）。而局内 HUD 又用另一个标尺（/1 亿本金上限），
	   同一个数字两套刻度，一个恒满一个恒空。
	   现改为**阶梯**：进度条永远表示「距下一档还差多少」，跨过一档自动换到下一段。
	   含豪赌桌(200,000) 与本金上限(1000 亿)，首档 2,000 = 初始本金（0→2,000 开局即达成）。
	   2026-10-01：上限 1 亿 → 1000 亿，阶梯同步上探四档（5 亿/20 亿/100 亿/1000 亿），
	   否则余额过 1 亿后进度条恒满、再次失去信息量（与当初修复的问题同构）。 */
	var BANK_STEPS = [2000, 20000, 200000, 1000000, 5000000, 20000000, 100000000, 500000000, 2000000000, 10000000000, 100000000000];
	function bankSteps() { return BANK_STEPS.slice(); }
	/* 由余额求「当前档 / 下一档 / 区间进度」。纯函数，便于自检直接覆盖边界。 */
	function bankLadder(pc) {
		var bank = Math.max(0, Math.floor(Number(pc) || 0));
		var steps = BANK_STEPS;
		var from = 0, to = 0, maxed = false, i;
		for (i = 0; i < steps.length; i++) {
			if (bank >= steps[i]) from = steps[i];
			else { to = steps[i]; break; }
		}
		if (!to) { maxed = true; to = steps[steps.length - 1]; }
		var span = Math.max(1, to - from);
		/* 未到档时上限钳在 99：否则 99.66% 会被四舍五入成"满格"，
		   而文案还写着"距 1,000,000 还差 2,681" —— 满格与差额自相矛盾
		   （自检 §11 就是靠这条边界把它照出来的）。
		   于是「100% = 真的到了这一档 / 已封顶」成为唯一含义。 */
		var pct = maxed ? 100 : Math.max(0, Math.min(99, Math.round((bank - from) / span * 100)));
		return { bank: bank, from: from, to: to, next: maxed ? 0 : to, remain: maxed ? 0 : to - bank, pct: pct, maxed: maxed };
	}

	/* 官阶加成表（按段给，段内不涨 —— §G.3）
	   stakes = 该段解锁的带入档位（与 BUYIN_TIERS 同源，不再各写一套） */
	var SEG_BONUS = [
		/* 2026-09-29 用户反馈「带入只能选 200」：0 段就给到 2,000 档，
		   解锁节奏整体前移一档 —— 段位奖励重心放在折扣 / 签到加成上，
		   别让「升官」在几十小时里摸不到手感。 */
		{ sign: 0, stakes: [200, 2000], discount: 0 },
		{ sign: 300, stakes: [200, 2000, 20000], discount: 0.05 },
		{ sign: 800, stakes: [200, 2000, 20000, 200000], discount: 0.08 },
		{ sign: 1500, stakes: [200, 2000, 20000, 200000], discount: 0.12 },
		{ sign: 2500, stakes: [200, 2000, 20000, 200000], discount: 0.15 },
	];

	/* 五段衔级（§G.1.1）：等级区间 / 段名 / 段徽形状 / 段色档(0=冷灰 1=钢青 2=冷金) */
	var SEGMENTS = [
		{ seg: 0, from: 0, to: 9, name: "卒伍", shape: "circle", color: 0 },
		{ seg: 1, from: 10, to: 19, name: "杂号", shape: "hex", color: 0 },
		{ seg: 2, from: 20, to: 29, name: "中垒", shape: "oct", color: 1 },
		{ seg: 3, from: 30, to: 39, name: "方镇", shape: "shield", color: 1 },
		{ seg: 4, from: 40, to: 50, name: "上公", shape: "double", color: 2 },
	];

	/* 官阶全表 50 级（§G.1 忠实采用，功勋门槛为唯一数值来源） */
	var RANKS = [
		{ lv: 0, merit: 0, name: "平民" },
		{ lv: 1, merit: 100, name: "兵卒" },
		{ lv: 2, merit: 300, name: "屯长" },
		{ lv: 3, merit: 600, name: "军侯" },
		{ lv: 4, merit: 1000, name: "军司马" },
		{ lv: 5, merit: 1500, name: "都尉" },
		{ lv: 6, merit: 2100, name: "校尉" },
		{ lv: 7, merit: 2800, name: "中郎将" },
		{ lv: 8, merit: 3600, name: "裨将军" },
		{ lv: 9, merit: 4500, name: "偏将军" },
		{ lv: 10, merit: 5500, name: "牙门将军" },
		{ lv: 11, merit: 6600, name: "伏波将军" },
		{ lv: 12, merit: 7800, name: "翊武将军" },
		{ lv: 13, merit: 9100, name: "翊师将军" },
		{ lv: 14, merit: 10500, name: "建威将军" },
		{ lv: 15, merit: 12000, name: "建武将军" },
		{ lv: 16, merit: 13600, name: "振威将军" },
		{ lv: 17, merit: 15300, name: "振武将军" },
		{ lv: 18, merit: 17100, name: "领军将军" },
		{ lv: 19, merit: 19000, name: "护军将军" },
		{ lv: 20, merit: 21000, name: "武卫将军" },
		{ lv: 21, merit: 23100, name: "中垒将军" },
		{ lv: 22, merit: 25300, name: "镇军将军" },
		{ lv: 23, merit: 27600, name: "抚军将军" },
		{ lv: 24, merit: 30000, name: "镇国将军" },
		{ lv: 25, merit: 32500, name: "龙骧将军" },
		{ lv: 26, merit: 35100, name: "平东将军" },
		{ lv: 27, merit: 37800, name: "平南将军" },
		{ lv: 28, merit: 40600, name: "平西将军" },
		{ lv: 29, merit: 43500, name: "平北将军" },
		{ lv: 30, merit: 46500, name: "安东将军" },
		{ lv: 31, merit: 49600, name: "安南将军" },
		{ lv: 32, merit: 52800, name: "安西将军" },
		{ lv: 33, merit: 56100, name: "安北将军" },
		{ lv: 34, merit: 59500, name: "镇东将军" },
		{ lv: 35, merit: 63000, name: "镇南将军" },
		{ lv: 36, merit: 66600, name: "镇西将军" },
		{ lv: 37, merit: 70300, name: "镇北将军" },
		{ lv: 38, merit: 74100, name: "征东将军" },
		{ lv: 39, merit: 78000, name: "征南将军" },
		{ lv: 40, merit: 82000, name: "征西将军" },
		{ lv: 41, merit: 86100, name: "征北将军" },
		{ lv: 42, merit: 90300, name: "前将军" },
		{ lv: 43, merit: 94600, name: "后将军" },
		{ lv: 44, merit: 99000, name: "左将军" },
		{ lv: 45, merit: 103500, name: "右将军" },
		{ lv: 46, merit: 108100, name: "骠骑将军" },
		{ lv: 47, merit: 112800, name: "车骑将军" },
		{ lv: 48, merit: 117600, name: "卫将军" },
		{ lv: 49, merit: 122500, name: "安国将军" },
		{ lv: 50, merit: 127500, name: "大将军" },
	];

	/* ============================================================
	   1. 通用工具
	   ============================================================ */
	function clampNum(n, lo, hi) {
		n = Number(n);
		if (!isFinite(n)) return lo;
		if (n < lo) return lo;
		if (n > hi) return hi;
		return n;
	}
	function today() {
		try {
			var d = new Date();
			var m = d.getMonth() + 1, dd = d.getDate();
			return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (dd < 10 ? "0" : "") + dd;
		} catch (e) { return "1970-01-01"; }
	}
	/* 日期差（天）：用于断签判断 */
	function dayDiff(a, b) {
		try {
			var pa = String(a).split("-"), pb = String(b).split("-");
			var da = Date.UTC(+pa[0], +pa[1] - 1, +pa[2]);
			var db = Date.UTC(+pb[0], +pb[1] - 1, +pb[2]);
			return Math.round((db - da) / 86400000);
		} catch (e) { return 0; }
	}
	function isYesterday(last, t) { return dayDiff(last, t) === 1; }

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
	function lsPut(k, o) { try { lsSet(k, JSON.stringify(o)); } catch (e) {} }

	function toast(msg) {
		msg = String(msg == null ? "" : msg);
		try {
			if (typeof ui !== "undefined" && ui && ui.create && typeof ui.create.toast === "function") {
				ui.create.toast(msg);
				return;
			}
		} catch (e) {}
		try { console.log("[池子魔将·钱包] " + msg); } catch (e2) {}
	}
	function logInfo(msg) {
		try { if (lib.cshDebug && typeof lib.cshDebug.info === "function") lib.cshDebug.info("wallet: " + msg); } catch (e) {}
	}
	function logError(msg, err) {
		try {
			if (lib.cshDebug && typeof lib.cshDebug.error === "function") lib.cshDebug.error("wallet: " + msg, err);
			else console.error("[池子魔将·钱包] " + msg, err);
		} catch (e) {}
	}
	/* 音效（§4.7.1 统一总线）。音效**永远不是功能依赖**：拿不到总线就静默，
	   不能因为没声音而让钱包流程出错或抛异常。 */
	function sfx(name, opt) {
		try {
			var S = lib.cshSfx || (typeof window !== "undefined" ? window.CSH_SFX : null);
			if (S && typeof S.play === "function") S.play(name, opt);
		} catch (e) {}
	}

	/* ============================================================
	   2. 完整性校验（§4.5.6 · HMAC 轻量实现）
	   诚实边界：只防"手改 / 损坏"，不防"会算的人"（源码可读）。
	   ============================================================ */
	var HMAC_SALT = "CSH-WALLET-V1-池子魔将"; // 非密钥，仅用于加盐混淆
	function fnv1a(str) {
		var h = 2166136261;
		str = String(str);
		for (var i = 0; i < str.length; i++) {
			h ^= str.charCodeAt(i);
			h = (h * 16777619) >>> 0;
		}
		return ("00000000" + h.toString(16)).slice(-8);
	}
	/* 对 payload 生成校验签名：字段(不含 _sig) + 盐 → 双轮 fnv1a
	   命名注意：不能叫 sign()，否则与"每日签到 sign()"重名互相覆盖 */
	function sigOf(obj) {
		try {
			var keys = Object.keys(obj).filter(function (k) { return k !== "_sig"; }).sort();
			var s = "";
			for (var i = 0; i < keys.length; i++) s += keys[i] + "=" + String(obj[keys[i]]) + ";";
			var a = fnv1a(HMAC_SALT + "|" + s);
			var b = fnv1a(a + "|" + HMAC_SALT + "|" + s.length);
			return a + b;
		} catch (e) { return ""; }
	}
	function verifySig(obj) {
		if (!obj || typeof obj !== "object") return false;
		if (!obj._sig) return false;
		return obj._sig === sigOf(obj);
	}

	/* ============================================================
	   3. 钱包（§F.2 / §F.4 / §F.5）
	   ============================================================ */
	var walletDef = function () {
		return { pc: PC_START, pcPeak: PC_START, lastSign: "", streak: 0, reliefDate: "", _sig: "" };
	};

	var wallet = lsJSON(K_WALLET, null);
	if (!wallet || typeof wallet !== "object") wallet = walletDef();
	// 字段校验与钳制（防手改 / 老版本字段缺失）
	wallet.pc = clampNum(wallet.pc, 0, PC_CAP);
	if (typeof wallet.pcPeak !== "number" || !isFinite(wallet.pcPeak)) wallet.pcPeak = wallet.pc;
	wallet.pcPeak = clampNum(Math.max(wallet.pcPeak, wallet.pc), 0, PC_CAP);
	if (typeof wallet.lastSign !== "string") wallet.lastSign = "";
	if (typeof wallet.streak !== "number") wallet.streak = 0;
	if (typeof wallet.reliefDate !== "string") wallet.reliefDate = "";
	/* 死字段清理（2026-09-29）：老存档里残留的 bank/quota/quotaDate 直接删除，
	   避免它们继续被误读为真值。 */
	delete wallet.bank; delete wallet.quota; delete wallet.quotaDate;

	/* 写盘合并（2026-09-29 优化）：热点路径 addPC/spendPC 在实时游戏里每帧触发，
	   若每次都同步全量 JSON.stringify×2 写 localStorage，低端设备会可感知卡顿。
	   改为在 I/O 节拍（SAVE_DEBOUNCE_MS）内至多落盘一次：内存钱包始终即时更新（业务零延迟），
	   localStorage 仅用于跨会话持久化。正确性不受影响——所有读余额走内存对象；
	   关键边界（签到/带入/结算终态/完整性回滚/关壳/页面卸载）仍走 saveWallet 即时落盘。 */
	var SAVE_DEBOUNCE_MS = 250;
	var _saveTimer = 0;
	/* 即时落盘：低频/关键边界，保持原语义 */
	function saveWallet() { syncSave(); }
	/* 合并落盘：热点路径调用，至多每 SAVE_DEBOUNCE_MS 落盘一次 */
	function scheduleSave() {
		if (typeof setTimeout !== "function") { syncSave(); return; }
		if (_saveTimer) return;                 // 已有待落盘的批次，复用即可
		_saveTimer = setTimeout(function () {
			_saveTimer = 0;
			syncSave();
		}, SAVE_DEBOUNCE_MS);
	}
	/* 强制落盘：关壳/页面卸载时调用，确保最后一拍不丢 */
	function flushSave() {
		if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = 0; }
		syncSave();
	}
	function syncSave() {
		try {
			wallet.pc = clampNum(wallet.pc, 0, PC_CAP);
			/* 生涯峰值：只增不减（真实可核，成就/大厅用它替代已删除的死字段 bank） */
			if (!(wallet.pcPeak >= wallet.pc)) wallet.pcPeak = wallet.pc;
			wallet._sig = sigOf(wallet);
			lsPut(K_WALLET, wallet);
			snapshot();
		} catch (e) { logError("saveWallet 失败", e); }
	}
	function snapshot() {
		try {
			var s = { pc: wallet.pc, streak: wallet.streak, lastSign: wallet.lastSign, t: today() };
			s._sig = sigOf(s);
			lsPut(K_SNAP, s);
		} catch (e) {}
	}

	/* 入账：受 PC_CAP 上限钳制（§4.5.3），返回实得 */
	function addPC(n, reason) {
		n = Math.floor(Number(n) || 0);
		if (n <= 0) return 0;
		var before = wallet.pc;
		wallet.pc = clampNum(before + n, 0, PC_CAP);
		var got = wallet.pc - before;
		scheduleSave();
		logInfo("入账 " + got + " CBY（" + (reason || "") + "）→ " + wallet.pc);
		return got;
	}
	/* 出账：不足则拒绝 */
	function spendPC(n, reason) {
		n = Math.floor(Number(n) || 0);
		if (n <= 0) return true;
		if (wallet.pc < n) return false;
		wallet.pc -= n;
		scheduleSave();
		logInfo("出账 " + n + " CBY（" + (reason || "") + "）→ " + wallet.pc);
		return true;
	}

	/* 门票折扣（§G.3）：按段给 */
	function discountOf(rankLv) {
		var seg = segOfRank(rankLv).seg;
		return SEG_BONUS[seg].discount;
	}
	function ticketOf(gameKey) {
		var base = TICKET[gameKey];
		if (base == null) base = 0;
		if (base === 0) return 0;
		var r = rankData.rank;
		var d = discountOf(r);
		return Math.max(0, Math.round(base * (1 - d)));
	}
	/* 支付门票：内部按官阶打折（§G.6.4） */
	function payTicket(gameKey) {
		var price = ticketOf(gameKey);
		if (price === 0) return { ok: true, paid: 0, price: 0 };
		if (wallet.pc < price) return { ok: false, paid: 0, price: price, reason: "余额不足" };
		spendPC(price, "门票/" + gameKey);
		return { ok: true, paid: price, price: price };
	}

	/* 封顶（§H.1 · 2026-09-29 重定）：
	     名次 / 计分类 = 门票 × 系数（参数来自 registry 目录）
	     牌桌类       = **同桌 AI 实际带入总额**（自然封顶，不引入"每日额度"）
	   自然封顶的经济学意义：你只能赢走桌上真有的钱。
	   豪赌桌 AI 带入是玩家的 2~5 倍 → 上限很高，但 AI 牌技 0.95~1.00，
	   玩家期望收益为负（用户 2026-09-29 明确要求：允许负期望，刻意极端化）。
	   aiStakeTotal 缺省时退回旧口径 min(带入, PC×25%)，保证独立调试可用。 */
	function capOf(buyIn, gameKey, aiStakeTotal) {
		buyIn = Math.max(0, Math.floor(Number(buyIn) || 0));
		var plan0 = planOf(gameKey);
		/* 非牌桌类（名次 / 计分）的封顶 = 门票×系数，参数来自 registry 目录 */
		if (plan0 && plan0.mode !== "chips") {
			return Math.max(0, Math.round((plan0.ticket || 0) * (plan0.capMult || 0)));
		}
		var nat = Math.floor(Number(aiStakeTotal));
		if (isFinite(nat) && nat > 0) return nat;
		return Math.max(0, Math.min(buyIn, Math.floor(wallet.pc * 0.25)));
	}
	/* 结算参数查表：registry 优先；不可用时按内置口径兜底（保证纯 Node 单测可跑）。
	   这样「回收率 / 名次系数」全项目只有 registry 一份真值。 */
	function planOf(gameKey) {
		if (REG && typeof REG.settlePlan === "function") {
			try { var p = REG.settlePlan(gameKey); if (p) return p; } catch (eP) {}
		}
		if (gameKey === "uno") return { key: "uno", mode: "rank", ticket: TICKET.uno, perBeat: 0.6, capMult: 2 };
		if (gameKey === "blackjack") return { key: gameKey, mode: "chips", ticket: 0, decay: 0.95 };
		return { key: gameKey, mode: "chips", ticket: 0, decay: 0.90 };
	}

	/* 结算（§F.5 + §H.1 · 2026-09-29 唯一定义）：返回 { gross, cap, applied, capped, payout, discarded }
	   aiStakeTotal（第 4 参）= 本局台上可赢总额；牌桌类由调用方传入同桌 AI 带入合计。
	   players（第 5 参）= 名次类总人数（UNO 用；缺省 4，与历史口径一致）。
	   ⚠ 本函数是全扩展**唯一**结算实现：csh_shell.settle / settleSession 均为薄包装委托此处。

	   ⚠ 2026-09-29 经济修正（本轮抓出的两个「正期望刷钱」缺陷）：
	     · UNO 原为固定名次表 {1:300, 2:180, 3:90}，与人数脱钩；
	       2 人局成本 150、输了也算"第 2 名"拿 180 ⇒ **期望恒为正**（240），
	       与「允许负期望」的设计前提直接冲突。
	       现改为「门票 × 0.6 × 击败对手数」：4 人局 270/180/90/0，
	       任意人数（2/3/4）下期望均 < 门票。
	     · 神弩手原为「门票 + 得分×0.35」⇒ 门票被原样返还，且任何得分都净赚
	       （0 分也拿回 200）⇒ 零风险抽水机。
	       现改为「得分 × 0.35」（门票不返还）：200/0.35 ≈ 572 分回本。 */
	function settle(gameKey, buyIn, netWin, aiStakeTotal, players) {
		buyIn = Math.max(0, Math.floor(Number(buyIn) || 0));
		netWin = Math.floor(Number(netWin) || 0);
		var plan = planOf(gameKey);

		// 名次类（UNO）：门票不返还，按「击败对手数」计奖
		if (plan.mode === "rank") {
			var n = Math.floor(Number(players) || 0);
			if (!(n >= 2)) n = 4;                       // 缺省按 4 人局（历史口径）
			var place = clampNum(netWin, 1, n);
			var beat = n - place;                       // 击败了多少对手
			var per = (plan.perBeat == null ? 0.6 : plan.perBeat);
			var reward = beat <= 0 ? 0 : Math.round((plan.ticket || 0) * per * beat);
			var rankCap = Math.round((plan.ticket || 0) * (plan.capMult || 2));
			var rankApplied = Math.min(reward, rankCap);
			return {
				gross: reward, cap: rankCap, applied: rankApplied, capped: reward > rankCap,
				payout: rankApplied, discarded: Math.max(0, reward - rankCap),
				place: place, players: n, beat: beat, fixed: true, mode: "rank",
			};
		}
		// 牌桌类（德州 / 斗地主 / 廿一点）
		var rate = plan.decay == null ? 0.90 : plan.decay;
		/* 输局（净赢 < 0）：只带回桌上的剩余筹码 = 带入 + 净赢。
		   此前这段口径写在 csh_shell.settle 里，而 settleSession 又写了第三遍
		   （净赢被 max(0,…) 钳平后仍走"正收益"分支 ⇒ 输光也满额返还，输钱不亏）。
		   现在负净赢是 settle 的本征分支，任何调用方都不可能再绕开。 */
		if (netWin < 0) {
			var remain = Math.max(0, buyIn + netWin);
			return {
				gross: remain, cap: 0, applied: 0, capped: false, payout: remain,
				discarded: 0, rate: rate, fixed: false, natural: true, mode: "chips", loss: true,
			};
		}
		var cap = capOf(buyIn, gameKey, aiStakeTotal);
		var applied = Math.min(netWin, cap);
		var payout = buyIn + Math.floor(applied * rate);
		return {
			gross: buyIn + netWin, cap: cap, applied: applied,
			capped: netWin > cap, payout: payout, discarded: Math.max(0, netWin - cap),
			rate: rate, fixed: false, natural: true, mode: "chips",
		};
	}
	/* 结算并执行（唯一入口 · 2026-09-29 新增）：
	   算 payout → 写回钱包 → 返回含 credited 的完整结果。
	   钱只在这里动 —— csh_shell 退化为纯展示层（文案 / 提示音 / 事件），
	   不再自己 addPC，也就不可能再出现「同一局两条路径入账金额不同」。 */
	function settleRun(gameKey, opts) {
		opts = opts || {};
		var r = settle(gameKey, opts.buyIn, opts.netWin, opts.aiStakeTotal, opts.players);
		var credited = r.payout > 0 ? addPC(r.payout, "结算/" + gameKey) : 0;
		r.credited = credited;
		if (typeof credited === "number" && credited < r.payout) r.clamped = true;
		r.balance = wallet.pc;
		return r;
	}

	/* ============================================================
	   3.5 每日任务（2026-09-29 新增）—— 全扩展**唯一**任务真值
	   ------------------------------------------------------------
	   取代 career.html 的 seedTasks()（硬编码 3 条、进度恒 0/10，纯假数据）。
	   德州与生涯大厅现在读写同一份状态：
	     · 德州开局每手 → shell-task-add 上报 hands/wins/bigPot；
	     · 生涯大厅 shell-tasks 只读渲染，领奖也走这里（宿主侧复核）。
	   日期串字典序比较；系统时间回拨不会重置进度、不会重复领奖。
	   ============================================================ */
	var DEFAULT_TASK = function () { return { day: "", hands: 0, wins: 0, bigPot: 0, claimed: [] }; };
	var taskData = lsJSON(K_TASK, null);
	if (!taskData || typeof taskData !== "object") taskData = DEFAULT_TASK();
	if (typeof taskData.day !== "string") taskData.day = "";
	taskData.hands = Math.max(0, Math.floor(taskData.hands || 0));
	taskData.wins = Math.max(0, Math.floor(taskData.wins || 0));
	taskData.bigPot = Math.max(0, Math.floor(taskData.bigPot || 0));
	if (!Array.isArray(taskData.claimed)) taskData.claimed = [];

	function saveTask() { try { lsPut(K_TASK, taskData); } catch (e) {} }
	function taskTier() { return rankData.rank >= 30 ? 2 : (rankData.rank >= 10 ? 1 : 0); }
	function taskDefs() {
		var t = taskTier();
		return [
			{ key: "hands", label: "打满手数", goal: [10, 20, 30][t], reward: [300, 500, 800][t], unit: "手" },
			{ key: "wins", label: "赢下手数", goal: [3, 5, 8][t], reward: [500, 800, 1200][t], unit: "胜" },
			{ key: "bigPot", label: "赢下大池", goal: [2000, 20000, 200000][t], reward: [800, 1500, 3000][t], unit: "CBY" },
		];
	}
	/* 日刷新：跨天清零（回拨时 today < day → 不重置，防刷） */
	function taskEnsureDay(t) {
		t = t || today();
		if (taskData.day === t) return false;
		if (taskData.day && t < taskData.day) return false;   // 时间被回拨
		taskData = DEFAULT_TASK();
		taskData.day = t;
		saveTask();
		return true;
	}
	function taskProgressOf(key) {
		if (key === "hands") return taskData.hands;
		if (key === "wins") return taskData.wins;
		if (key === "bigPot") return taskData.bigPot;
		return 0;
	}
	/* 上报进度：返回本次新完成（并已入账）的任务列表 */
	function taskAdd(kind, n) {
		taskEnsureDay();
		n = Math.floor(Number(n) || 0);
		if (n <= 0) return [];
		if (kind === "hands") taskData.hands += n;
		else if (kind === "wins") taskData.wins += n;
		else if (kind === "bigPot") taskData.bigPot = Math.max(taskData.bigPot, n);
		else return [];
		var done = [], defs = taskDefs();
		for (var i = 0; i < defs.length; i++) {
			var d = defs[i];
			if (taskProgressOf(d.key) >= d.goal && taskData.claimed.indexOf(d.key) < 0) {
				taskData.claimed.push(d.key);
				var got = addPC(d.reward, "每日任务/" + d.label);
				done.push({ key: d.key, label: d.label, reward: d.reward, gained: got });
			}
		}
		saveTask();
		return done;
	}
	function taskState() {
		taskEnsureDay();
		var defs = taskDefs(), out = [];
		for (var i = 0; i < defs.length; i++) {
			var d = defs[i];
			out.push({
				key: d.key, label: d.label, goal: d.goal, reward: d.reward, unit: d.unit,
				cur: Math.min(taskProgressOf(d.key), d.goal),
				done: taskProgressOf(d.key) >= d.goal,
				claimed: taskData.claimed.indexOf(d.key) >= 0,
			});
		}
		return { day: taskData.day || today(), tier: taskTier(), defs: out };
	}

	/* ============================================================
	   4. 签到（§F.4）
	   ============================================================ */
	/* 签到额度（§F.4）：1200 + 200 × min(streak-1, 15)，上限 4200（+ 官阶段加成）
	   注意：夹的是 (streak-1)，不是 streak —— 否则最高只能拿到 1200+200×14=4000 */
	function signAmount(streak) {
		var s = Math.max(1, Number(streak) || 1);
		var bonusSeg = SEG_BONUS[segOfRank(rankData.rank).seg].sign;
		var amt = SIGN_BASE + SIGN_STEP * Math.min(s - 1, SIGN_STREAK_CAP);
		return Math.min(amt, SIGN_MAX) + bonusSeg;
	}
	function canSign() {
		var t = today();
		return !wallet.lastSign || t > wallet.lastSign;
	}
	/* 签到：一天一次，全扩展共用（§G.6.4） */
	function sign() {
		var t = today();
		if (!canSign()) return { ok: false, reason: "今日已签到" };
		var last = wallet.lastSign;
		var diff = last ? dayDiff(last, t) : 999;

		// 断签保护（§F.4）：断 1 天内归来 → streak 只降一半；更久 → 归 1
		if (!last) wallet.streak = 1;
		else if (diff === 1) wallet.streak = wallet.streak + 1;
		else if (diff === 2) wallet.streak = Math.max(1, Math.floor(wallet.streak / 2));
		else wallet.streak = 1;

		wallet.lastSign = t;
		var amt = signAmount(wallet.streak);
		var gained = addPC(amt, "签到");

		// 连签满 7 天：额外 +3000（每 7 天一次）
		var bonus = 0;
		if (wallet.streak > 0 && wallet.streak % 7 === 0) {
			bonus = addPC(SIGN_7DAY_BONUS, "连签7天");
		}
		return { ok: true, streak: wallet.streak, amount: amt, gained: gained, bonus: bonus, total: gained + bonus };
	}
	/* 破产救济（§F.4）：每日 1 次，仅当 PC < 最低门票 */
	function relief() {
		var t = today();
		if (wallet.pc >= RELIEF_THRESHOLD) return { ok: false, reason: "余额充足，无需救济" };
		if (wallet.reliefDate === t) return { ok: false, reason: "今日已领取救济" };
		wallet.reliefDate = t;
		var got = addPC(RELIEF_AMOUNT, "破产救济");
		return { ok: true, gained: got };
	}

	/* ============================================================
	   5. 官阶（§G）
	   ============================================================ */
	var rankDef = function () { return { rank: 0, merit: 0, meritToday: 0, meritDate: "" }; };
	var rankData = lsJSON(K_RANK, null);
	if (!rankData || typeof rankData !== "object") rankData = rankDef();
	rankData.rank = clampNum(Math.floor(rankData.rank || 0), 0, 50);
	rankData.merit = Math.max(0, Math.floor(rankData.merit || 0));
	rankData.meritToday = Math.max(0, Math.floor(rankData.meritToday || 0));
	if (typeof rankData.meritDate !== "string") rankData.meritDate = "";

	/* 官阶定义查找：功勋 → 等级（§G.1） */
	function rankOfMerit(merit) {
		merit = Math.max(0, Math.floor(Number(merit) || 0));
		var lv = 0;
		for (var i = RANKS.length - 1; i >= 0; i--) {
			if (merit >= RANKS[i].merit) { lv = RANKS[i].lv; break; }
		}
		return lv;
	}
	function rankInfo(lv) {
		lv = clampNum(Math.floor(lv || 0), 0, 50);
		return RANKS[lv];
	}
	/* 段查找（§G.1.1） */
	function segOfRank(lv) {
		lv = clampNum(Math.floor(lv || 0), 0, 50);
		for (var i = SEGMENTS.length - 1; i >= 0; i--) {
			if (lv >= SEGMENTS[i].from && lv <= SEGMENTS[i].to) return SEGMENTS[i];
		}
		return SEGMENTS[0];
	}
	/* 段内第几阶（1~10，用于徽章刻度环） */
	function segPos(lv) {
		var s = segOfRank(lv);
		return clampNum(lv - s.from + 1, 1, 10);
	}

	function saveRank() {
		try {
			rankData.rank = rankOfMerit(rankData.merit);
			lsPut(K_RANK, rankData);
		} catch (e) { logError("saveRank 失败", e); }
	}

	/* 每日功勋软上限（§G.2.1）：300 + 官阶×10 */
	function softCap() {
		return MERIT_SOFT_BASE + rankData.rank * MERIT_SOFT_PER;
	}
	/* 加功勋（统一入口 · §G.6.2）：软上限 + 40级后×0.6 + 不可购买，全部内部实现 */
	function addMerit(n, reason) {
		n = Number(n) || 0;
		if (n <= 0) return { ok: false, gained: 0 };

		var t = today();
		if (rankData.meritDate !== t) { rankData.meritDate = t; rankData.meritToday = 0; }

		var gain = n;
		// 高段位衰减（§G.2.1）
		if (rankData.rank >= HIGH_RANK_FROM) gain = gain * HIGH_RANK_DECAY;

		// 每日软上限：超出部分按 50% 计
		var room = Math.max(0, softCap() - rankData.meritToday);
		var effective;
		if (gain <= room) effective = gain;
		else effective = room + (gain - room) * MERIT_OVERFLOW_RATE;

		effective = Math.floor(effective);
		if (effective <= 0 && gain > 0) effective = 0;

		var beforeRank = rankData.rank;
		// 软上限按"实际入账功勋"累计；超出软上限的部分按 50% 折后入账。
		// ★ 2026-09-29 修复：此前 meritToday 被硬钳在 softCap()，
		//   「超出半价」机制失效，且成就「单日功勋」阶梯（最高 6,000）
		//   在钳制下永远不可能达成 —— 单日入账封死在 300。
		//   现在 meritToday 记录真实入账（含半价溢出），软上限只影响折价率。
		rankData.meritToday += effective;
		rankData.merit += effective;
		saveRank();

		var leveled = rankData.rank > beforeRank;
		var crossedSeg = leveled && segOfRank(rankData.rank).seg > segOfRank(beforeRank).seg;
		if (leveled) {
			var info = rankInfo(rankData.rank);
			if (crossedSeg) {
				toast("已晋入 · " + segOfRank(rankData.rank).name + "：" + info.name);
				/* §G.3：跨段升阶播「鼓 + 号角」组合音（段内升阶只播普通升阶音） */
				sfx("rank.seg");
			} else {
				toast("晋升：" + info.name + "（第 " + rankData.rank + " 阶）");
				sfx("rank.up");
			}
			logInfo("升阶 → " + info.name + "（第 " + rankData.rank + " 阶）");
		}
		return {
			ok: true, gained: effective, raw: gain, merit: rankData.merit,
			rank: rankData.rank, leveled: leveled, crossedSeg: crossedSeg,
			softCap: softCap(), today: rankData.meritToday,
		};
	}
	/* 带入档位解锁（§G.3 / §G.6.4） */
	function unlockedStakes() {
		var seg = segOfRank(rankData.rank).seg;
		return SEG_BONUS[seg].stakes.slice();
	}
	/* 段加成真值（2026-09-29 新增）：官阶图鉴 / 生涯大厅读它，
	   取代 career.html 里那套与之冲突的本地 perksOf()。 */
	function segPerks(lv) {
		lv = lv == null ? rankData.rank : clampNum(Math.floor(lv) || 0, 0, 50);
		var s = segOfRank(lv), b = SEG_BONUS[s.seg];
		return {
			seg: s.seg, name: s.name, shape: s.shape, color: s.color,
			from: s.from, to: s.to, pos: clampNum(lv - s.from + 1, 1, 10),
			sign: b.sign, discount: b.discount,
			stakes: b.stakes.slice(), maxStake: b.stakes[b.stakes.length - 1],
		};
	}
	/* 距下一阶还需多少功勋 */
	function toNext(lv) {
		lv = lv == null ? rankData.rank : clampNum(lv, 0, 50);
		if (lv >= 50) return { next: null, need: 0, done: true };
		var nx = RANKS[lv + 1];
		return { next: nx, need: Math.max(0, nx.merit - rankData.merit), done: false };
	}
	/* 段进度：距下一段还需几阶 */
	function segProgress() {
		var s = segOfRank(rankData.rank);
		var nextSeg = s.seg < 4 ? SEGMENTS[s.seg + 1] : null;
		return {
			seg: s.seg, name: s.name, shape: s.shape, color: s.color,
			pos: segPos(rankData.rank),
			base: s.from, to: s.to,
			next: nextSeg,
			needLevels: nextSeg ? Math.max(0, nextSeg.from - rankData.rank) : 0,
			isLast: !nextSeg,
		};
	}

	/* ============================================================
	   6. CDK（§4.5）
	   ============================================================ */
	/* 多公钥列表（§4.5.5）：换密钥时只需追加，历史码继续有效。
	   公钥为 JWK（n/e）。验签只认这里的公钥，私钥永远只在生成器里。

	   ✅ 2026-09-28 起：公钥已【出厂内置】——就是下方这把。
	   扩展直接打包分发即可，玩家只需要输入 CDK，
	   谁都不用再打开源码粘贴任何东西。
	   （已用 ledger.csv 真码做过字节级验签回归：_开发自检/cdk_factory_key_check.cjs）

	   以后换密钥时（生成器菜单 → 生成新密钥对）：
	   把新公钥【追加】到数组里，旧公钥保留——
	   这样已发出的旧码和新码都能兑换（§4.5.5）。 */
	var CSH_PUBKEYS = [
		/* 出厂公钥（取自 生成器 keys\public.jwk.txt，2026-09-28 嵌入） */
		{"kty":"RSA","n":"w4DOn8XiDLYqrDCnJY-r28gviE6-IWx6p-dZI4baDHu9SXpi2veMFHZX7yavRH3ab8L2O9isBqdTKYr4pWc9PrMOrOr7l5VyjjviDEmRJwotPW1hPbS_IP7bgykdRnOK_NGF60pakY4AE7g4Mc8sOFQY_TVzUVT8VNRrjK4MB_N6P6zMA0UcG2XYkAhZchvlysg1h52RVwICc1xe-LlEkwz6VvyjlFKefgs6LLgQKvnxWjZstq_GYF2x84jMw84ZnuqVkm6hfFlmpMGzwZ_tcaC3X-ZfeaK7FIMu2XaM9D7BLJfxWaK2C8NzkAWkZ67vQs-emYZZyJr1KJZotarN2Q","e":"AQAB","alg":"RS256","ext":true}
	];

	function b32decode(s) {
		var AL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
		s = String(s || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
		var bits = 0, val = 0, out = [];
		for (var i = 0; i < s.length; i++) {
			var idx = AL.indexOf(s.charAt(i));
			if (idx < 0) continue;
			val = (val << 5) | idx; bits += 5;
			if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
		}
		return out;
	}
	function b64urlToBytes(str) {
		try {
			str = String(str).replace(/-/g, "+").replace(/_/g, "/");
			while (str.length % 4) str += "=";
			var raw = atob(str), out = [];
			for (var i = 0; i < raw.length; i++) out.push(raw.charCodeAt(i));
			return out;
		} catch (e) { return null; }
	}
	/* 解析码格式：CSH1<payload><sig>；返回 { ver, body[], sig[] }
	   2026-09-28 起双格式兼容：
	   · 新码（短）：payload/sig 用 Base64url（无填充），更紧凑（约省 16% 长度）；
	     分隔符统一用 '.'（Base64url 的 '-' 与旧 '-' 分隔符会冲突）。
	   · 旧码（长）：payload/sig 用 Base32，分隔符 '-'。两段编码由字符集自动判定。
	   解析器兼容三种写法：CSH1.p.b（新）、CSH1-p-b（旧）、CSH1pb（无分隔）。 */
	function parseCode(code) {
		var raw = String(code || "").replace(/\s/g, "");
		// 新格式：点号分隔，Base64url（大小写敏感，不能 toUpperCase）
		var mDot = raw.match(/^CSH(\d)\.([A-Za-z0-9\-_]+)\.([A-Za-z0-9\-_]+)$/);
		if (mDot) {
			return { ver: +mDot[1], body: b64urlToBytes(mDot[2]), sig: b64urlToBytes(mDot[3]) };
		}
		// 旧格式：横杠分隔，Base32（纯大写 A-Z2-7）
		var up = raw.toUpperCase();
		var m = up.match(/^CSH(\d)-([A-Z2-7]+)-([A-Z2-7]+)$/);
		if (m) {
			return { ver: +m[1], body: b32decode(m[2]), sig: b32decode(m[3]) };
		}
		// 兜底：无分隔符（面板已不再删分隔符，这条只处理手动抠掉分隔的极端输入）。
		// payload 长度是固定的：Base32 14 字节 → 23 字符；Base64url 14 字节 → 19 字符。
		// 按字符集判定后确定性切分，绝不能用贪婪正则（会把 sig 切错位）。
		// 注意：判定与切分全程用原始大小写（toUpperCase 会毁 Base64url 的 a-f）。
		var core2 = raw.match(/^CSH(\d)([A-Za-z0-9\-_.]+)$/);
		if (!core2) return null;
		var seg = core2[2];
		var isB32 = /^[A-Z2-7]+$/.test(seg);
		var cut = isB32 ? 23 : 19;
		if (seg.length < cut + 64) return null;
		return {
			ver: +core2[1],
			body: isB32 ? b32decode(seg.slice(0, cut)) : b64urlToBytes(seg.slice(0, cut)),
			sig: isB32 ? b32decode(seg.slice(cut)) : b64urlToBytes(seg.slice(cut)),
		};
	}
	/* 解析 payload：ver(4) kind(4) amount(32) expDay(16) seq(32) note(24) = 14 bytes */
	function parsePayload(bytes) {
		if (!bytes || bytes.length < 14) return null;
		function u32(o) { return ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0; }
		function u16(o) { return ((bytes[o] << 8) | bytes[o + 1]) >>> 0; }
		function u24(o) { return ((bytes[o] << 16) | (bytes[o + 1] << 8) | bytes[o + 2]) >>> 0; }
		var b0 = bytes[0];
		return {
			ver: (b0 >> 4) & 0x0f,
			kind: b0 & 0x0f,
			amount: u32(1),
			expDay: u16(5),
			seq: u32(7),
			note: u24(11),
		};
	}
	/* 有效期：自 2026-01-01 起的天数，0=永久 */
	function expDateOf(expDay) {
		if (!expDay) return null;
		return new Date(Date.UTC(2026, 0, 1) + expDay * 86400000);
	}
	function isExpired(expDay) {
		var d = expDateOf(expDay);
		if (!d) return false;
		return Date.now() > d.getTime();
	}
	/* 序号哈希（§4.5.6 只存 seq 的哈希） */
	function seqHash(seq) { return fnv1a("CSH-SEQ|" + seq); }
	function usedTable() {
		var t = lsJSON(K_USED, {});
		return (t && typeof t === "object" && !Array.isArray(t)) ? t : {};
	}
	function isUsed(seq) { return !!usedTable()[seqHash(seq)]; }
	function markUsed(seq) {
		var t = usedTable();
		t[seqHash(seq)] = Date.now();
		lsPut(K_USED, t);
	}
	function usedCount() { return Object.keys(usedTable()).length; }

	/* 并发占位（§4.5.6）：以 -1 标记"验签中"，避免同码并发双入账。
	   验签失败时 releaseSeq 回滚，不污染已用表。 */
	function claimSeq(seq) {
		var k = seqHash(seq);
		var t = usedTable();
		if (t[k]) return false;
		t[k] = -1;
		lsPut(K_USED, t);
		return true;
	}
	function releaseSeq(seq) {
		var k = seqHash(seq);
		var t = usedTable();
		if (t[k] === -1) { delete t[k]; lsPut(K_USED, t); }
	}

	/* 设备绑定表（独立键，§4.5.6）：
	   与已用表分开放，避免 dev_ 行污染 usedCount / 交叉校验。 */
	function devTable() {
		var t = lsJSON(K_DEVBIND, {});
		return (t && typeof t === "object" && !Array.isArray(t)) ? t : {};
	}
	function devBoundTo(seq) { return devTable()[seqHash(seq)] || ""; }
	function bindDev(seq) {
		var t = devTable();
		t[seqHash(seq)] = deviceId();
		lsPut(K_DEVBIND, t);
	}
	function pendingCount() {
		var t = usedTable(), n = 0;
		for (var k in t) if (Object.prototype.hasOwnProperty.call(t, k) && t[k] === -1) n++;
		return n;
	}

	/* 设备绑定（§4.5.6 默认开） */
	function deviceId() {
		var d = lsGet(K_DEV);
		if (d) return d;
		var uid = "dev-" + fnv1a(String(Date.now()) + "-" + String(Math.random())) + fnv1a(String(Math.random()));
		lsSet(K_DEV, uid);
		return uid;
	}
	function deviceBindingOn() {
		// 默认开；可在设置里关（§4.5.6）
		try {
			if (lib.cshWalletSet && typeof lib.cshWalletSet.deviceBind === "boolean") return lib.cshWalletSet.deviceBind;
		} catch (e) {}
		return true;
	}

	/* 验签：优先 WebCrypto RSA；无 WebCrypto 时降级为"结构性校验"并如实标注 */
	function verifySignature(parsed) {
		if (!parsed) return { ok: false, reason: "格式错误" };
		if (parsed.ver !== 1) return { ok: false, reason: "码版本不支持" };
		if (!CSH_PUBKEYS.length) return { ok: false, reason: "扩展未配置公钥（请粘贴生成器导出的公钥）", noKey: true };

		// WebCrypto 路径（异步）；此处同步返回"待验"，由 redeemAsync 处理
		if (typeof crypto !== "undefined" && crypto.subtle && crypto.subtle.importKey) {
			return { ok: true, pending: true, parsed: parsed, reason: "" };
		}
		// 降级：无 WebCrypto → 至少做长度与结构校验，并如实提示
		return { ok: false, reason: "当前环境不支持验签（需 WebCrypto）", noCrypto: true };
	}
	/* 真实异步验签（RSA-2048 + SHA-256 + PKCS#1 v1.5） */
	function verifyAsync(parsed, pubkeys) {
		if (!parsed) return Promise.resolve({ ok: false, reason: "格式错误" });
		var body = parsed.body, sig = parsed.sig;
		if (!body || !body.length || !sig || !sig.length) return Promise.resolve({ ok: false, reason: "数据不完整" });
		var data = new Uint8Array(body);
		var sigArr = new Uint8Array(sig);
		var keys = pubkeys && pubkeys.length ? pubkeys : CSH_PUBKEYS;
		if (!keys.length) return Promise.resolve({ ok: false, reason: "扩展未配置公钥" });

		/* WebCrypto 不可用 → 走纯 JS BigInt 兜底（§4.5.2），依然不含私钥，安全性不降级 */
		var hasSub = (typeof crypto !== "undefined" && crypto.subtle && crypto.subtle.importKey);
		if (!hasSub) {
			var okFb = keys.some(function (jwk) {
				try { return verifyPKCS1v15(jwk, data, sigArr); } catch (e) { return false; }
			});
			return Promise.resolve(okFb
				? { ok: true, reason: "", fallback: true }
				: { ok: false, reason: "签名校验失败" });
		}

		var chain = Promise.resolve(false);
		keys.forEach(function (jwk) {
			chain = chain.then(function (done) {
				if (done) return true;
				return crypto.subtle.importKey(
					"jwk", jwk,
					{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
					false, ["verify"]
				).then(function (key) {
					return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sigArr, data);
				}).catch(function () { return false; });
			});
		});
		return chain.then(function (ok) {
			if (ok) return { ok: true, reason: "" };
			/* WebCrypto 失败也可能是公钥格式问题 → 再试一次纯 JS 兜底 */
			var okFb2 = keys.some(function (jwk) {
				try { return verifyPKCS1v15(jwk, data, sigArr); } catch (e) { return false; }
			});
			return okFb2 ? { ok: true, reason: "", fallback: true } : { ok: false, reason: "签名校验失败" };
		});
	}

	/* ============================================================
	   纯 JS BigInt 实现 PKCS#1 v1.5 验签（§4.5.2 兜底）
	   —— 仅在 WebCrypto 缺失或失败时启用；只含公钥，无任何私钥信息。
	   C# 生成器用 SHA-256 + PKCS#1 v1.5，故此处算法一致。
	   ============================================================ */
	var _B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
	function _b64uToBig(s) {
		s = String(s).replace(/-/g, "+").replace(/_/g, "/");
		var pad = (4 - (s.length % 4)) % 4;
		while (pad--) s += "=";
		var bin = atob(s);
		var hex = "";
		for (var i = 0; i < bin.length; i++) {
			var h = bin.charCodeAt(i).toString(16);
			hex += h.length < 2 ? "0" + h : h;
		}
		return BigInt("0x" + (hex || "0"));
	}
	function _bytesToBig(bytes) {
		var hex = "";
		for (var i = 0; i < bytes.length; i++) {
			var h = bytes[i].toString(16);
			hex += h.length < 2 ? "0" + h : h;
		}
		return BigInt("0x" + (hex || "0"));
	}
	function _bigToBytes(n, len) {
		var hex = n.toString(16);
		if (hex.length % 2) hex = "0" + hex;
		var out = [];
		for (var i = 0; i < hex.length; i += 2) out.push(parseInt(hex.substr(i, 2), 16));
		while (len && out.length < len) out.unshift(0);
		return out;
	}
	function _modpow(base, exp, mod) {
		var result = 1n, b = base % mod, e = exp;
		while (e > 0n) {
			if (e & 1n) result = (result * b) % mod;
			b = (b * b) % mod;
			e >>= 1n;
		}
		return result;
	}
	/* SHA-256（纯 JS；无 WebCrypto 时用于兜底验签） */
	function _sha256(bytes) {
		function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
		var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
		var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
			0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
			0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
			0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
			0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
			0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
			0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
			0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
		/* 入参可能是 Uint8Array（无 push/slice 语义）或普通数组 —— 统一拷成普通数组 */
		var msg = [];
		for (var z = 0; z < bytes.length; z++) msg.push(bytes[z] & 0xff);
		var l = msg.length * 8;
		msg.push(0x80);
		while ((msg.length % 64) !== 56) msg.push(0);
		for (var i = 7; i >= 0; i--) msg.push((l / Math.pow(2, i * 8)) & 0xff);
		var w = new Array(64);
		for (var off = 0; off < msg.length; off += 64) {
			for (var t = 0; t < 16; t++) {
				w[t] = (msg[off + t * 4] << 24) | (msg[off + t * 4 + 1] << 16) | (msg[off + t * 4 + 2] << 8) | msg[off + t * 4 + 3];
			}
			for (t = 16; t < 64; t++) {
				var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
				var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
				w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
			}
			var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
			for (t = 0; t < 64; t++) {
				var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
				var ch = (e & f) ^ ((~e) & g);
				var t1 = (h + S1 + ch + K[t] + w[t]) | 0;
				var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
				var maj = (a & b) ^ (a & c) ^ (b & c);
				var t2 = (S0 + maj) | 0;
				h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
			}
			H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
			H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
		}
		var out = [];
		for (i = 0; i < 8; i++) {
			out.push((H[i] >>> 24) & 0xff, (H[i] >>> 16) & 0xff, (H[i] >>> 8) & 0xff, H[i] & 0xff);
		}
		return out;
	}
	/* PKCS#1 v1.5 验签：sig^e mod n → 解析 EM → 比对 DigestInfo(SHA-256) + H(data) */
	function verifyPKCS1v15(jwk, data, sigBytes) {
		if (!jwk || !jwk.n || !jwk.e) return false;
		var n = _b64uToBig(jwk.n), e = _b64uToBig(jwk.e);
		var s = _bytesToBig(sigBytes);
		if (s >= n) return false;
		var m = _modpow(s, e, n);
		var k = (n.toString(16).length + 1) >> 1;   /* 模长字节数 */
		var em = _bigToBytes(m, k);
		/* EM = 0x00 || 0x01 || PS(0xFF…) || 0x00 || DigestInfo */
		if (em[0] !== 0x00 || em[1] !== 0x01) return false;
		var i2 = 2;
		while (i2 < em.length && em[i2] === 0xff) i2++;
		if (i2 < 10 || em[i2] !== 0x00) return false;
		/* SHA-256 DigestInfo 前缀（19 字节：ASN.1 SEQUENCE 头 + OID + NULL） */
		var PREFIX = [0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20];
		var di = em.slice(i2 + 1);
		if (di.length !== PREFIX.length + 32) return false;
		for (var j = 0; j < PREFIX.length; j++) if (di[j] !== PREFIX[j]) return false;
		var digest = di.slice(PREFIX.length);
		var h = _sha256(data);
		for (var q = 0; q < 32; q++) if (h[q] !== digest[q]) return false;
		return true;
	}

	/* 兑换记录（台账可视化，保留 5 条 · §5.1 #11） */
	function pushHist(item) {
		var h = lsJSON(K_HIST, []);
		if (!Array.isArray(h)) h = [];
		h.unshift(item);
		lsPut(K_HIST, h.slice(0, 5));
	}
	function recent() {
		var h = lsJSON(K_HIST, []);
		return Array.isArray(h) ? h : [];
	}

	/* 兑换（同步前置检查 + 异步验签）→ Promise<{ok,...}> */
	/* CDK 终身兑换计数（2026-09-28 成就系统数据源）：
	   recent() 是截断列表，数不了总量；这里单独存一份 {count, gained}。
	   首次使用时用现值初始化（不追溯历史差额，够成就用途）。 */
	var K_LIFETIME = "csh_wallet_cdk_lifetime";
	function bumpLifetime(gained) {
		var t = lsJSON(K_LIFETIME, null);
		if (!t || typeof t !== "object") t = { count: 0, gained: 0 };
		t.count = (t.count || 0) + 1;
		t.gained = (t.gained || 0) + (gained || 0);
		lsPut(K_LIFETIME, t);
	}
	function cdkLifetime() {
		var t = lsJSON(K_LIFETIME, null);
		if (t && typeof t === "object") return { count: t.count || 0, gained: t.gained || 0 };
		return { count: 0, gained: 0 };
	}

	function redeem(code) {
		return new Promise(function (resolve) {
			var parsed = parseCode(code);
			if (!parsed) { resolve({ ok: false, reason: "格式错误" }); return; }

			var payload = parsePayload(parsed.body);
			if (!payload) { resolve({ ok: false, reason: "数据不完整" }); return; }
			if (payload.ver !== 1) { resolve({ ok: false, reason: "码版本不支持" }); return; }

			// 有效期
			if (isExpired(payload.expDay)) { resolve({ ok: false, reason: "已过期" }); return; }
			// 一次性核销
			if (isUsed(payload.seq)) { resolve({ ok: false, reason: "此码已使用" }); return; }
			// 设备绑定交叉校验：该 seq 曾在本机兑换过？（防清表重兑）
			if (deviceBindingOn()) {
				var bound = devBoundTo(payload.seq);
				if (bound && bound !== deviceId()) {
					resolve({ ok: false, reason: "此码已绑定其他设备" });
					return;
				}
			}

			/* 并发防重（§4.5.6）：先原子占位，再异步验签。
			   否则两次同码并发兑换都会通过上面的 isUsed 预检。 */
			var claimed = claimSeq(payload.seq);
			if (!claimed) { resolve({ ok: false, reason: "此码已使用" }); return; }

			verifyAsync(parsed, CSH_PUBKEYS).then(function (v) {
				if (!v.ok) { releaseSeq(payload.seq); resolve({ ok: false, reason: v.reason }); return; }

			// 核销 + 入账（占位已写在 claimSeq，这里补设备绑定）
			markUsed(payload.seq);
			if (deviceBindingOn()) bindDev(payload.seq);
			var gained = addPC(payload.amount, "CDK");
			var capped = gained < payload.amount;
			pushHist({ t: Date.now(), amount: payload.amount, kind: payload.kind, gained: gained, capped: capped });
			bumpLifetime(gained);

			toast("兑换成功 +" + gained + " 池子币（余额 " + wallet.pc + "）");
				logInfo("CDK 核销 seq=" + payload.seq + " 面额=" + payload.amount + " 实得=" + gained);
				resolve({
					ok: true, amount: payload.amount, gained: gained,
					capped: capped, balance: wallet.pc, kind: payload.kind,
					exp: expDateOf(payload.expDay), seq: payload.seq,
				});
			});
		});
	}
	/* 自查用：只验签不核销 */
	function verifyOnly(code) {
		return new Promise(function (resolve) {
			var parsed = parseCode(code);
			if (!parsed) { resolve({ ok: false, reason: "格式错误" }); return; }
			var payload = parsePayload(parsed.body);
			if (!payload) { resolve({ ok: false, reason: "数据不完整" }); return; }
			if (isExpired(payload.expDay)) { resolve({ ok: false, reason: "已过期", payload: payload }); return; }
			if (isUsed(payload.seq)) { resolve({ ok: false, reason: "此码已使用", payload: payload }); return; }
			verifyAsync(parsed, CSH_PUBKEYS).then(function (v) {
				resolve({ ok: v.ok, reason: v.reason, payload: payload });
			});
		});
	}

	/* ============================================================
	   7. 存档完整性检查与回滚（§4.5.6）
	   ============================================================ */
	function integrityCheck() {
		var raw = lsJSON(K_WALLET, null);
		if (!raw) return { ok: true, action: "none" };
		// 首次升级 / 老版本写入：无 _sig 视为"未签名"，直接采纳并补签名，
		// 不能当作"被篡改"回滚 —— 否则老玩家存档会被误杀。
		if (!raw._sig) {
			saveWallet();
			return { ok: true, action: "adopt", pc: wallet.pc };
		}
		if (!verifySig(raw)) {
			// 手改检测 → 从最近合法快照回滚
			var snap = lsJSON(K_SNAP, null);
			if (snap && verifySig(snap)) {
				wallet.pc = clampNum(snap.pc, 0, PC_CAP);
				wallet.streak = clampNum(snap.streak, 0, 9999);
				wallet.lastSign = snap.lastSign || "";
				saveWallet();
				logError("钱包完整性校验失败 → 已从快照回滚至 " + wallet.pc + " CBY");
				toast("检测到存档异常，已恢复至最近合法状态");
				return { ok: false, action: "rollback", pc: wallet.pc };
			}
			// 无合法快照 → 钳制到安全值
			wallet.pc = clampNum(wallet.pc, 0, PC_CAP);
			saveWallet();
			logError("钱包完整性校验失败且无快照 → 已钳制");
			return { ok: false, action: "clamp", pc: wallet.pc };
		}
		return { ok: true, action: "none" };
	}
	/* 交叉校验（§4.5.10 #5）：已用表"凭空变少"而余额异常增长 → 判定异常 */
	function crossCheck() {
		var n = usedCount();
		var lastN = clampNum(lsJSON("csh_cdk_used_n", { n: n }).n, 0, 999999);
		if (n < lastN) {
			// 已用表被清掉过
			if (wallet.pc > PC_START * 50) {
				logError("交叉校验异常：已用表 " + lastN + " → " + n + "，余额 " + wallet.pc);
				integrityCheck();
				return { ok: false, action: "rollback", reason: "已用表被清空而余额异常" };
			}
		}
		lsPut("csh_cdk_used_n", { n: n });
		return { ok: true, action: "none" };
	}

	/* ============================================================
	   8. 旧键迁移（§G.6.1 / §5.1 #4）
	   ============================================================ */
	function legacyMigrate() {
		var flag = lsGet("csh_wallet_migrated");
		if (flag === "1") return { ok: true, already: true };

		var old = lsJSON(K_LEGACY_BANK, null);
		var moved = 0;
		if (old && typeof old === "object") {
			// 旧 csh_texas_bank: { bank, cap, lastDay, streak, lastSignDay }
			var ob = Number(old.bank);
			if (isFinite(ob) && ob > 0) {
				wallet.pc = clampNum(ob, 0, PC_CAP);   // 旧本金 → 统一钱包
				moved = wallet.pc;
			}
			if (typeof old.streak === "number") wallet.streak = clampNum(old.streak, 0, 9999);
			if (typeof old.lastSignDay === "string") wallet.lastSign = old.lastSignDay;
			saveWallet();
			// 旧键保留为只读备份，不再写入
			try { lsSet("csh_texas_bank_legacy", JSON.stringify(old)); } catch (e) {}
		}
		lsSet("csh_wallet_migrated", "1");
		if (moved) logInfo("旧档案迁移：csh_texas_bank → csh_wallet（" + moved + " CBY）");
		// 旧版曾把设备绑定行存在 csh_cdk_used 的 dev_ 前缀键里 → 搬到独立表
		splitLegacyDeviceRows();
		return { ok: true, moved: moved };
	}
	/* 已用表里历史遗留的 dev_ 前缀行 → 迁到 csh_cdk_devbind 并从已用表剔除
	   （用于修正旧版 usedCount 被设备行虚增的问题） */
	function splitLegacyDeviceRows() {
		var t = usedTable(), moved = 0, hit = false;
		var dt = devTable();
		for (var k in t) {
			if (!Object.prototype.hasOwnProperty.call(t, k)) continue;
			if (k.indexOf("dev_") === 0) {
				if (!dt[k.slice(4)]) dt[k.slice(4)] = t[k];
				delete t[k]; moved++; hit = true;
			}
		}
		if (hit) { lsPut(K_USED, t); lsPut(K_DEVBIND, dt); }
		return moved;
	}

	/* ============================================================
	   9. 对外导出
	   ============================================================ */
	var CSH = {
		version: "1.1.0",
		/* 存储键名唯一真值（§5.5.3）。csh_migrate 的导入导出由此取键名，
		   不再各自另写一份（2026-10-01 收敛）。 */
		KEYS: {
			wallet: K_WALLET, rank: K_RANK, used: K_USED, snap: K_SNAP,
			dev: K_DEV, devbind: K_DEVBIND, hist: K_HIST, task: K_TASK,
			legacyBank: K_LEGACY_BANK,
		},
		const: {
			PC_START: PC_START, PC_CAP: PC_CAP, TICKET: TICKET,
			RELIEF_AMOUNT: RELIEF_AMOUNT, SIGN_MAX: SIGN_MAX,
			SEGMENTS: SEGMENTS, SEG_BONUS: SEG_BONUS,
			BUYIN_TIERS: BUYIN_TIERS, GAMBLE_FROM: GAMBLE_FROM,
			BANK_STEPS: BANK_STEPS,
		},
		RANKS: RANKS,
		tiers: function () { return BUYIN_TIERS.slice(); },
		/* 资产里程碑（第四轮）：阶梯与求值同在钱包，游戏页只消费不重算 */
		bankSteps: bankSteps,
		bankLadder: bankLadder,
		isGamble: isGamble,
		wallet: {
			/* get() 只返回**真实存在**的字段（2026-09-29 删除 bank/quota 两个死字段） */
			get: function () {
				return {
					pc: wallet.pc, pcPeak: wallet.pcPeak, streak: wallet.streak,
					lastSign: wallet.lastSign, signedToday: !canSign(),
				};
			},
			pc: function () { return wallet.pc; },
			peak: function () { return wallet.pcPeak; },
			add: addPC, spend: spendPC,
			ticketOf: ticketOf, payTicket: payTicket,
			capOf: capOf, settle: settle, settleRun: settleRun, planOf: planOf,
			sign: sign, canSign: canSign, signAmount: signAmount,
			relief: relief,
			today: today,
		},
		/* 每日任务（唯一真值）：五游戏共用同一个状态机 */
		task: {
			state: taskState, add: taskAdd, ensureDay: taskEnsureDay,
			defs: taskDefs, progressOf: taskProgressOf,
		},
		rank: {
			get: function () {
				var info = rankInfo(rankData.rank);
				return {
					rank: rankData.rank, merit: rankData.merit,
					meritToday: rankData.meritToday, meritDate: rankData.meritDate,
					name: info.name, threshold: info.merit,
					seg: segProgress(), softCap: softCap(),
					next: toNext(),
				};
			},
			addMerit: addMerit,
			unlockedStakes: unlockedStakes,
			of: rankOfMerit, info: rankInfo, segOf: segOfRank, segPos: segPos,
			perks: segPerks, segList: function () { return SEGMENTS.slice(); },
			perksAll: function () { return SEGMENTS.map(function (s) { return segPerks(s.from); }); },
			toNext: toNext, softCap: softCap,
			allRanks: function () { return RANKS.slice(); },
		},
		cdk: {
			redeem: redeem, verify: verifyOnly, parse: parseCode,
			usedCount: usedCount, recent: recent,
			pendingCount: pendingCount, claimSeq: claimSeq, releaseSeq: releaseSeq,
			devBoundTo: devBoundTo, devCount: function () { return Object.keys(devTable()).length; },
			pubkeys: function () { return CSH_PUBKEYS.slice(); },
			setPubkeys: function (arr) { CSH_PUBKEYS = Array.isArray(arr) ? arr : []; },
		},
	sign, flushSave,
	integrity: { check: integrityCheck, crossCheck: crossCheck },
		migrate: { legacy: legacyMigrate },
	_sig: { sign: sigOf, verify: verifySig, fnv1a: fnv1a, verifyRSA: verifyPKCS1v15, sha256: _sha256 },
};

/* 卸载兜底：标签页关闭/刷新时强制落盘最后一拍（合并写盘不会丢跨会话状态） */
try {
	if (typeof window !== "undefined" && window && typeof window.addEventListener === "function") {
		var _cshFlush = function () { try { flushSave(); } catch (eFlush) {} };
		window.addEventListener("pagehide", _cshFlush, false);
		window.addEventListener("beforeunload", _cshFlush, false);
	}
} catch (eFlushInit) {}

lib.cshWallet = CSH;
	/* ⚠ 2026-09-29 修复（契约族实例 3）：此处原为裸赋值 `window.CSH = CSH`，
	   会**清空**此前挂载的 `window.CSH.svggen` / `window.CSH.selftest`
	   （import 序：svggen(6) → selftest(11) → **wallet(13)** → world → badge → shell）。
	   此前未爆纯靠 csh_badge.js 的 lib.cshSvggen 兜底接住 —— 一个兜底之隔。
	   改为与其余模块一致的合并写法。 */
	try {
		if (typeof window !== "undefined") {
			window.CSH = window.CSH || {};
			window.CSH.wallet = CSH;
		}
	} catch (e) {}

	/* 启动即做一次迁移、完整性检查与任务日刷新 */
	try {
		legacyMigrate();
		integrityCheck();
		crossCheck();
		taskEnsureDay();
	} catch (e) { logError("启动自检失败", e); }

	logInfo("钱包模块已加载：PC=" + wallet.pc + " 峰值=" + wallet.pcPeak +
		" 官阶=" + rankData.rank + "（" + rankInfo(rankData.rank).name + "）" +
		" 今日任务 " + taskState().defs.length + " 条");
})();
