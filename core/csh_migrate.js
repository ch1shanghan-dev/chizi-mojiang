import { lib } from "../../../noname.js";
/*
 * 池子魔将 · 数据迁移与存档（§J）
 * ---------------------------------------------------------------
 * 一份文件装全部生涯：战绩(winrate) + 钱包(wallet) + 官阶(rank) + AI世界(world) + CDK序号(cdkUsed)
 *
 * 对外接口（lib.cshMigrate / window.CSH.migrate）：
 *   CM.export()                  → "CSHMIG1.<base64url>" 字符串
 *   CM.inspect(code)             → { ok, err?, meta?, summary? } 只读解析
 *   CM.import(code, opts)        → { ok, err?, applied?, diff? } 执行覆盖（含自动备份）
 *   CM.backups()                 → 最近 3 份备份列表
 *   CM.rollback(stamp)           → 回滚到指定备份
 *   CM.selftest()                → 自检
 *
 * 规范要点：
 *   §J.3 前缀 CSHMIG1 + meta.sum = 全字段 SHA-256 前 8 字节 base64url
 *   §J.4 白名单 / 钳制 / 版本 / 二次确认(由调用方) / 自动备份 3 份 / CDK 只并集不覆盖
 */
(function () {
	var CSH = typeof window !== "undefined" ? window.CSH : null;

	var VERSION = 2;
	var PREFIX = "CSHMIG1.";
	var K_BACKUP_PREFIX = "csh_mig_backup_";
	var MAX_BACKUPS = 3;

	/* 白名单键（§J.2 / §J.4#3 · 2026-10-01 由 6 项扩到 19 项）
	   6 原有：winrate/wallet/rank/world/cdkUsed/meta
	   + 6 必须补：dailyTask/achv/texasBest/bjBest/sniperBest/cdkLifetime
	   + 7 建议补：panelSkin/bgmVolume/bgmOn/sfxVolume/texasSet/bjSet/dbgPresets */
	var WHITELIST = ["winrate", "wallet", "rank", "world", "cdkUsed", "meta",
		"dailyTask", "achv", "texasBest", "bjBest", "sniperBest", "cdkLifetime",
		"panelSkin", "bgmVolume", "bgmOn", "sfxVolume", "texasSet", "bjSet", "dbgPresets"];

	function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
	function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
	function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
	function lsJSON(k, d) {
		var s = lsGet(k);
		if (!s) return d;
		try { var o = JSON.parse(s); return (o == null) ? d : o; } catch (e) { return d; }
	}
	function lsPut(k, o) { try { lsSet(k, JSON.stringify(o)); } catch (e) {} }

	/* ---------- 存储键 ----------
	   键名真值从 lib.cshWallet.KEYS 取（2026-10-01 收敛，避免两处手写漂移）。
	   K_WORLD / K_WINRATE 归属 world / winrate 模块，非钱包域，此处保留字面量。 */
	function walletKey(name, fallback) {
		try {
			var K = (typeof lib !== "undefined" && lib.cshWallet && lib.cshWallet.KEYS)
				|| (CSH && CSH.wallet && CSH.wallet.KEYS);
			if (K && K[name]) return K[name];
		} catch (e) {}
		return fallback;
	}
	var K_WALLET = walletKey("wallet", "csh_wallet");
	var K_RANK = walletKey("rank", "csh_rank");
	var K_CDK = walletKey("used", "csh_cdk_used");
	var K_WORLD = "csh_world";
	var K_WINRATE = "extension_池子魔将_winrateData";

	/* 新增键（2026-10-01 导出范围 6→19） */
	var K_DAILY_TASK = walletKey("task", "csh_daily_task");
	var K_ACHV = "csh_career_achv";
	var K_TEXAS_BEST = "csh_texas_best";
	var K_BJ_BEST = "csh_bj_best";
	var K_SNIPER_BEST = "csh_sniper_best";
	var K_CDK_LIFETIME = "csh_wallet_cdk_lifetime";
	var K_PANEL_SKIN = "csh_panel_skin";
	var K_BGM_VOLUME = "csh_bgm_volume";
	var K_BGM_ON = "csh_bgm_on";
	var K_SFX_VOLUME = "csh_sfx_volume";
	var K_TEXAS_SET = "csh_texas_set";
	var K_BJ_SET = "csh_bj_set";
	var K_DBG_PRESETS = "csh_dbg_presets";

	/* ---------- 工具 ---------- */
	function toB64Url(str) {
		try {
			var b = btoa(unescape(encodeURIComponent(str)));
			return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
		} catch (e) { return ""; }
	}
	function fromB64Url(s) {
		try {
			s = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
			while (s.length % 4) s += "=";
			return decodeURIComponent(escape(atob(s)));
		} catch (e) { return null; }
	}
	/* SHA-256 前 8 字节 → base64url；无 crypto 时退化为 FNV 兜底（仍能拦手改） */
	function sumOf(objStr) {
		try {
			var subtle = (typeof crypto !== "undefined") && (crypto.subtle || crypto.webkitSubtle);
			if (subtle && crypto.subtle && crypto.subtle.digest) {
				/* 同步 API 不可用，标记待异步；导出走 async 版 */
				return null;
			}
		} catch (e) {}
		return fnv8(objStr);
	}
	function fnv8(str) {
		/* 64-bit FNV-1a（分高低 32 位），转 8 字节 → base64url */
		var h1 = 0x811c9dc5, h2 = 0x01000193;
		for (var i = 0; i < str.length; i++) {
			var c = str.charCodeAt(i);
			h1 ^= c; h1 = (h1 * 16777619) >>> 0;
			h2 ^= (c + i); h2 = (h2 * 16777619) >>> 0;
		}
		var bytes = [(h1 >>> 24) & 255, (h1 >>> 16) & 255, (h1 >>> 8) & 255, h1 & 255,
			(h2 >>> 24) & 255, (h2 >>> 16) & 255, (h2 >>> 8) & 255, h2 & 255];
		var bin = "";
		for (var j = 0; j < bytes.length; j++) bin += String.fromCharCode(bytes[j]);
		try { return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
		catch (e) { return String(h1 >>> 0); }
	}
	async function sha8(str) {
		try {
			if (typeof crypto !== "undefined" && crypto.subtle && crypto.subtle.digest) {
				var enc = new TextEncoder();
				var buf = await crypto.subtle.digest("SHA-256", enc.encode(str));
				var arr = new Uint8Array(buf).slice(0, 8);
				var bin = "";
				for (var i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
				return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
			}
		} catch (e) {}
		return fnv8(str);
	}

	/* ---------- 钳制（§J.4#4） ----------
	   2026-10-01 A3 修复：删除本地写死的 `var CAP = 100000000`。
	   原来「钱包币上限 1 亿」被错误地同时用在 AI 资金上，导致 97 人方案里
	   >1 亿的 AI 资金在导入导出往返后被削平。现拆为两个真值来源：
	   · 钱包币上限 = lib.cshWallet.const.PC_CAP（1000 亿，2026-10-01 由 1 亿上调）
	   · AI 资金上限 = lib.cshWorld.const.AI_FUND_CAP（5 亿） */
	function PC_CAP() {
		try {
			var W = (typeof lib !== "undefined" && lib.cshWallet && lib.cshWallet.const)
				|| (CSH && CSH.wallet && CSH.wallet.const);
			if (W && typeof W.PC_CAP === "number") return W.PC_CAP;
		} catch (e) {}
		return 100000000000;
	}
	function AI_FUND_CAP() {
		try {
			var W = (typeof lib !== "undefined" && lib.cshWorld && lib.cshWorld.const)
				|| (CSH && CSH.world && CSH.world.const);
			if (W && typeof W.AI_FUND_CAP === "number") return W.AI_FUND_CAP;
		} catch (e) {}
		return 500000000;
	}
	function AI_COUNT() {
		try {
			var W = (typeof lib !== "undefined" && lib.cshWorld && lib.cshWorld.const)
				|| (CSH && CSH.world && CSH.world.const);
			if (W && typeof W.AI_COUNT === "number") return W.AI_COUNT;
		} catch (e) {}
		return 97;
	}
	function clampNum(n, lo, hi) {
		n = Number(n);
		if (!isFinite(n)) return lo;
		return Math.max(lo, Math.min(hi, Math.floor(n)));
	}
	function clampStr(s, maxLen) {
		s = String(s == null ? "" : s);
		return s.length > (maxLen || 64) ? s.slice(0, maxLen || 64) : s;
	}
	/* 浮点钳制（**不 floor**）：拟真状态是小数（mood -1~1 / form 0~1 / fatigue 0~1 /
	   skillPlay ≥0），用 clampNum 会把 0.62 压成 0（同 csh_world 里 skill 内联保留的原因）。 */
	function clampF(v, lo, hi, def) {
		var n = Number(v);
		if (!isFinite(n)) return def;
		return n < lo ? lo : (n > hi ? hi : n);
	}
	/* 日期串（YYYY-MM-DD）。每日任务的 day 真值是 csh_wallet.today() 产出的字符串
	   （字典序比较，见 csh_wallet taskEnsureDay），不是数值 —— 详见 cleanDailyTask。 */
	function cleanDay(o) {
		if (typeof o !== "string") return "";
		return /^\d{4}-\d{2}-\d{2}$/.test(o) ? clampStr(o, 20) : "";
	}
	function isPastStamp(t) {
		var n = Number(t);
		if (!isFinite(n) || n < 0) return 0;
		var now = Date.now();
		return n > now ? now : n;
	}

	/* ---------- 单字段清洗 ---------- */
	function cleanWallet(o) {
		if (!o || typeof o !== "object") return null;
		/* 2026-09-29：删除 bank / quota / quotaDate（钱包里已不存在这三个死字段）。
		   新增 pcPeak：生涯峰值，真实可核，用于大厅与成就。 */
		return {
			pc: clampNum(o.pc, 0, PC_CAP()),
			pcPeak: clampNum(o.pcPeak == null ? o.pc : o.pcPeak, 0, PC_CAP()),
			lastSign: clampStr(o.lastSign, 20),
			streak: clampNum(o.streak, 0, 9999),
			reliefDate: clampStr(o.reliefDate, 20),
		};
	}
	function cleanRank(o) {
		if (!o || typeof o !== "object") return null;
		return {
			rank: clampNum(o.rank, 0, 50),
			merit: clampNum(o.merit, 0, 999999999),
			meritToday: clampNum(o.meritToday, 0, 999999999),
			meritDate: clampStr(o.meritDate, 20),
		};
	}
	/* A2：id 分类型清洗。字符串主键（97 人方案）走 clampStr，数字（旧档）走 clampNum。 */
	function cleanAIId(v) {
		return (typeof v === "number") ? clampNum(v, 0, 999999) : clampStr(v, 32);
	}
	function cleanGambles(g) {
		if (!g || typeof g !== "object") return null;
		return {
			plays: clampNum(g.plays, 0, 9999999),
			wins: clampNum(g.wins, 0, 9999999),
			net: clampNum(g.net, -99999999999, 99999999999),
			best: clampNum(g.best, 0, 99999999999),
			bust: clampNum(g.bust, 0, 9999999),
			push: clampNum(g.push, 0, 9999999),      // 平局（2026-10-03 三态化后新增）
			streak: clampNum(g.streak, 0, 999999),
			bestStreak: clampNum(g.bestStreak, 0, 999999),
		};
	}
	/* 成对仇恨表（2026-10-03，审计 P1-8）：{ 对象键: 仇恨值 }。"player" = 玩家本人，
	   键名从 csh_world 读同一个常量（避免两处手写漂移）。旧档的标量 grudge 是
	   "被玩家得罪的程度"，导出时按玩家键折算。 */
	function playerGrudgeKey() {
		try {
			if (typeof lib !== "undefined" && lib.cshWorld && lib.cshWorld.PLAYER_GRUDGE_KEY) return lib.cshWorld.PLAYER_GRUDGE_KEY;
			if (CSH && CSH.world && CSH.world.PLAYER_GRUDGE_KEY) return CSH.world.PLAYER_GRUDGE_KEY;
		} catch (e) {}
		return "player";
	}
	function cleanGrudges(g, legacyScalar) {
		var out = {}, n = 0;
		if (g && typeof g === "object" && !Array.isArray(g)) {
			var keys = Object.keys(g).slice(0, 16);
			for (var i = 0; i < keys.length; i++) {
				var k = clampStr(keys[i], 32);
				if (!k) continue;
				var v = clampNum(g[keys[i]], 0, 999);
				if (v > 0) { out[k] = v; n++; }
			}
		}
		if (!n) {
			var s = clampNum(legacyScalar, 0, 999);
			if (s > 0) out[playerGrudgeKey()] = s;
		}
		return out;
	}
	/* 成就计数（2026-10-03 新增）：纯数值小表，逐字段钳制即可 */
	function cleanFeats(f) {
		if (!f || typeof f !== "object" || Array.isArray(f)) return null;
		var out = {};
		var keys = Object.keys(f).slice(0, 32);
		for (var i = 0; i < keys.length; i++) out[clampStr(keys[i], 24)] = clampNum(f[keys[i]], 0, 9999999);
		return Object.keys(out).length ? out : null;
	}
	/* 世界动态事件环（2026-10-03 新增）：{kind, day, ...} 的小数组，最多 24 条。
	   只做"形状合法 + 限量"，不猜每种 kind 的字段（新增事件类型不必改这里）。 */
	function cleanHistory(h) {
		if (!Array.isArray(h) || !h.length) return null;
		var out = [];
		for (var i = 0; i < h.length && out.length < 24; i++) {
			var e = h[i];
			if (!e || typeof e !== "object" || typeof e.kind !== "string") continue;
			var o = { kind: clampStr(e.kind, 16), day: clampNum(e.day, 0, 999999) };
			/* 文本类字段统一限量（都是名字/短语，不是长文） */
			["n", "w", "l", "a", "b", "from", "to", "rec"].forEach(function (k) {
				if (e[k] === undefined) return;
				if (typeof e[k] === "number") o[k] = clampNum(e[k], 0, 99999999999);
				else if (typeof e[k] === "boolean") o[k] = e[k];
				else o[k] = clampStr(e[k], 24);
			});
			o.c = clampNum(e.c, 0, 9999);
			o.amt = clampNum(e.amt, 0, AI_FUND_CAP());
			o.f = clampNum(e.f, 0, AI_FUND_CAP());
			o.d = clampNum(e.d, 0, 9999);
			out.push(o);
		}
		return out.length ? out : null;
	}
	/* 关系网（宿敌）：{ rivalry: { id: { otherId: 热度 } } }。
	   上限与 csh_world.bumpRivalry 同口径（每人只留 8 名对手、热度 ≤999），
	   防止脏档把档案撑爆。 */
	function cleanRelations(r) {
		if (!r || typeof r !== "object" || Array.isArray(r)) return null;
		var src = (r.rivalry && typeof r.rivalry === "object" && !Array.isArray(r.rivalry)) ? r.rivalry : null;
		if (!src) return null;
		var out = { rivalry: {} };
		var ids = Object.keys(src).slice(0, 1000);
		for (var i = 0; i < ids.length; i++) {
			var k = cleanAIId(ids[i]);
			var m = src[ids[i]];
			if (!k || !m || typeof m !== "object" || Array.isArray(m)) continue;
			var others = Object.keys(m).slice(0, 8);
			var dst = {};
			for (var j = 0; j < others.length; j++) {
				var ok2 = cleanAIId(others[j]);
				if (ok2) dst[ok2] = clampNum(m[others[j]], 0, 999);
			}
			if (Object.keys(dst).length) out.rivalry[k] = dst;
		}
		return Object.keys(out.rivalry).length ? out : null;
	}
	/* 生涯纪录（csh_world.records，生涯面板"世界史"的数据源）：
	   此前完全不在导出范围内 ⇒ 每次导入都把世界纪录清零。
	   worstBust(BY) 已于 2026-10-03 从 schema 删除（零读取的死字段），这里不再导出。 */
	function cleanRecords(r) {
		if (!r || typeof r !== "object" || Array.isArray(r)) return null;
		return {
			bestPot: clampNum(r.bestPot, 0, AI_FUND_CAP()),
			bestPotBy: clampStr(r.bestPotBy, 16),
			longestStreak: clampNum(r.longestStreak, 0, 999999),
			longestStreakBy: clampStr(r.longestStreakBy, 16),
			matches: clampNum(r.matches, 0, 999999999),
		};
	}
	function cleanWorld(o) {
		if (!o || !Array.isArray(o.ai)) return null;
		var cap = AI_FUND_CAP();
		var out = {
			ai: [],
			/* lastTick 是世界日序（csh_world.dayIndex() 的**数值**），此前误用 clampStr
			   清洗成字符串：虽然 JS 减号会把数字串转回数值，但 csh_world 的规整按
			   typeof !== "number" 判定 ⇒ 下次载入判为非法并重置为"今天"，离线补算丢失。 */
			lastTick: clampNum(o.lastTick, 0, 999999),
			heartbeatDay: clampNum(o.heartbeatDay, 0, 999999),
			heartbeatMatches: clampNum(o.heartbeatMatches, 0, 999999),
			gambles: cleanGambles(o.gambles),
			relations: cleanRelations(o.relations),
			records: cleanRecords(o.records),
			history: cleanHistory(o.history),
			feats: cleanFeats(o.feats),
		};
		/* A1：上限由硬编码 64 改为按名册动态（AI_COUNT），并保留 200 安全上限防脏数据 */
		var limit = Math.max(AI_COUNT(), 200);
		for (var i = 0; i < o.ai.length && out.ai.length < limit; i++) {
			var a = o.ai[i];
			if (!a || typeof a !== "object") continue;
			/* A4/A5：字段集跟随 freshAI()（22 字段），不再手写旧清单。
			   skill 是浮点派生值（0.62~1.00），不能用 floor 的 clampNum，故内联保留。 */
			out.ai.push({
				id: cleanAIId(a.id),
				name: clampStr(a.name, 16),
				surname: clampStr(a.surname, 8),
				persona: clampStr(a.persona, 16),
				fund: clampNum(a.fund, 0, cap),
				skill: (typeof a.skill === "number" && isFinite(a.skill)) ? a.skill : 0,
				hands: clampNum(a.hands, 0, 9999999),
				wins: clampNum(a.wins, 0, 9999999),
				biggestPot: clampNum(a.biggestPot, 0, cap),
				streak: clampNum(a.streak, 0, 999999),
				bestStreak: clampNum(a.bestStreak, 0, 999999),
				grudges: cleanGrudges(a.grudges, a.grudge),   // 成对仇恨（旧档标量自动折算）
				retired: !!a.retired,
				retireDay: clampNum(a.retireDay, 0, 999999),
				retireCount: clampNum(a.retireCount, 0, 999999),
				last: clampNum(a.last, 0, 9999999999999),
				/* 拟真化五字段 + 豪赌席里程碑（2026-10-03 补全）：此前只跟到旧 16 字段，
			   	mood/form/fatigue/drew/skillPlay 与 everTier3 在导出时被丢掉 ⇒
			   	导入后心态/手感/实战经验全部归零（"软回档"）。 */
				mood: clampF(a.mood, -1, 1, 0),
				form: clampF(a.form, 0, 1, 0.5),        // 0 与 1 是合法边界，闭区间
				fatigue: clampF(a.fatigue, 0, 1, 0),
				drew: clampNum(a.drew, 0, 9999999),
				skillPlay: clampF(a.skillPlay, 0, 99999999, 0),
				everTier3: !!a.everTier3,
			});
		}
		return out;
	}
	function cleanCdk(o) {
		/* cdkUsed：只读携带的已核销序号集合 */
		var arr = [];
		if (Array.isArray(o)) arr = o;
		else if (o && typeof o === "object") arr = Object.keys(o);
		var out = [];
		for (var i = 0; i < arr.length && out.length < 5000; i++) {
			var s = clampStr(arr[i], 40);
			if (s) out.push(s);
		}
		return out;
	}
	/* winrate 8 字段（照 csh_winrate.js:55 抄） */
	var WR_FIELDS = ["games", "win", "lose", "damage", "damaged", "gain", "discard", "kill"];
	function cleanWinrateEntry(e) {
		if (!e || typeof e !== "object" || Array.isArray(e)) return null;
		var r = {};
		for (var i = 0; i < WR_FIELDS.length; i++) {
			r[WR_FIELDS[i]] = clampNum(e[WR_FIELDS[i]], 0, 999999999);
		}
		var results = (r.win || 0) + (r.lose || 0);
		if (r.games < results) r.games = results;   // 场次 >= 胜负合计（与主模块对账一致）
		return r;
	}
	function cleanWinrateBucket(map) {
		if (!map || typeof map !== "object" || Array.isArray(map)) return null;
		var out = {};
		var keys = Object.keys(map).slice(0, 500);
		for (var i = 0; i < keys.length; i++) {
			var k = clampStr(keys[i], 40);
			var v = map[keys[i]];
			if (v && typeof v === "object" && !Array.isArray(v)) {
				var e = cleanWinrateEntry(v);
				if (e) out[k] = e;
			}
		}
		return out;
	}
	function cleanWinrate(o) {
		if (!o || typeof o !== "object" || Array.isArray(o)) return null;
		/* 2026-10-01 加固（方案 8.1⑧）：此前是浅拷贝（全扩展唯一无逐字段钳制的清洗函数）。
		   现按主模块 csh_winrate.js:55 的 8 字段逐字段钳制。 */
		var out = {};
		var keys = Object.keys(o).slice(0, 32);
		for (var i = 0; i < keys.length; i++) {
			var k = keys[i];
			var v = o[k];
			if (!v || typeof v !== "object") continue;
			if (k === "me" && typeof v === "object") {
				// 玩家操控：{ chars: {name: entry}, camps: {camp: entry} }
				var me = {};
				var mk = Object.keys(v).slice(0, 16);
				for (var m = 0; m < mk.length; m++) {
					var sub = cleanWinrateBucket(v[mk[m]]);
					if (sub) me[clampStr(mk[m], 40)] = sub;
				}
				out[clampStr(k, 40)] = me;
			} else {
				var b = cleanWinrateBucket(v);
				if (b) out[clampStr(k, 40)] = b;
			}
		}
		return out;
	}

	/* ---------- 新增键清洗（2026-10-01 导出范围 6→19） ---------- */
	function cleanNum(o) {           // 数值键（最佳纪录 / CDK 终身计数 / 音量）
		var n = Number(o);
		if (!isFinite(n)) return null;
		return clampNum(n, 0, 10000000000);
	}
	function cleanStr(o) {           // 字符串键（面板皮肤）
		if (o == null || o === "") return null;
		return clampStr(o, 32);
	}
	function cleanObj(o) {           // 对象键（德州/21点设置 / 调试配置方案）
		if (!o || typeof o !== "object" || Array.isArray(o)) return null;
		var out = {};
		var keys = Object.keys(o).slice(0, 64);
		for (var i = 0; i < keys.length; i++) {
			var v = o[keys[i]];
			var k = clampStr(keys[i], 40);
			if (v && typeof v === "object" && !Array.isArray(v)) {
				try { out[k] = JSON.parse(JSON.stringify(v)); } catch (e) { out[k] = v; }
			} else if (v !== undefined) {
				out[k] = v;
			}
		}
		return out;
	}
	function cleanDailyTask(o) {
		if (!o || typeof o !== "object") return null;
		return {
			/* 字符串日期，不能走 clampNum：Number("2026-10-03") 是 NaN，clampNum 对
			   非法值返回下限 0 ⇒ 导出的存档里 day 恒为 0，导入后被 csh_wallet 的载入
			   检查抹成空串，连带让"时间回拨保护"失效（空串为假）⇒ 当天进度与已领奖
			   claimed 一起清零，同一天可以再把三条奖励刷一遍。 */
			day: cleanDay(o.day),
			hands: clampNum(o.hands, 0, 999999),
			wins: clampNum(o.wins, 0, 999999),
			bigPot: clampNum(o.bigPot, 0, 999999999),
			claimed: Array.isArray(o.claimed) ? o.claimed.slice(0, 100).map(function (x) { return clampStr(x, 40); }) : [],
		};
	}
	function cleanAchv(o) {
		if (!o || typeof o !== "object") return null;
		var out = {};
		var keys = Object.keys(o).slice(0, 1000);
		for (var i = 0; i < keys.length; i++) out[clampStr(keys[i], 60)] = 1;
		return out;
	}
	/* bgmOn 是「一主键 + N 后缀键」通配族（csh_bgm.js onKey()），导出合并为对象 */
	function collectBgmOn() {
		var out = {};
		try {
			for (var i = 0; i < localStorage.length; i++) {
				var k = localStorage.key(i);
				if (k && k.indexOf(K_BGM_ON) === 0) out[k] = lsGet(k);
			}
		} catch (e) {}
		return Object.keys(out).length ? out : null;
	}
	function cleanBgmOn(o) {
		if (!o || typeof o !== "object" || Array.isArray(o)) return null;
		var out = {};
		for (var k in o) {
			if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
			if (k.indexOf(K_BGM_ON) !== 0) continue;
			out[clampStr(k, 32)] = (o[k] === "0" || o[k] === "false") ? "0" : "1";
		}
		return Object.keys(out).length ? out : null;
	}
	function cleanLifetime(o) {        // csh_wallet_cdk_lifetime = {count, gained}
		if (!o || typeof o !== "object") return null;
		return { count: clampNum(o.count, 0, 999999), gained: clampNum(o.gained, 0, 10000000000) };
	}
	function cleanArr(o) {             // csh_dbg_presets = 数组
		if (!Array.isArray(o)) return null;
		var out = [];
		for (var i = 0; i < o.length && out.length < 200; i++) {
			var v = o[i];
			if (v && typeof v === "object") {
				try { out.push(JSON.parse(JSON.stringify(v))); } catch (e) { out.push(v); }
			} else if (v !== undefined) {
				out.push(v);
			}
		}
		return out;
	}

	/* ---------- 采集 / 应用 ---------- */
	/* 键注册表（逻辑名 → localStorage 键 + 清洗器 + 存储类型）。
	   存储类型：0 = JSON 对象/数字（lsPut）；1 = 字符串（lsSet）；2 = bgmOn 通配族。
	   顺序即导出顺序（6 原 + 6 必须 + 7 建议 = 19 项，meta 为虚拟键不在此表）。 */
	var KEY_DEFS = [
		["winrate", K_WINRATE, cleanWinrate, 0],
		["wallet", K_WALLET, cleanWallet, 0],
		["rank", K_RANK, cleanRank, 0],
		["world", K_WORLD, cleanWorld, 0],
		["cdkUsed", K_CDK, cleanCdk, 0],
		["dailyTask", K_DAILY_TASK, cleanDailyTask, 0],
		["achv", K_ACHV, cleanAchv, 0],
		["texasBest", K_TEXAS_BEST, cleanObj, 0],
		["bjBest", K_BJ_BEST, cleanObj, 0],
		["sniperBest", K_SNIPER_BEST, cleanObj, 0],
		["cdkLifetime", K_CDK_LIFETIME, cleanLifetime, 0],
		["panelSkin", K_PANEL_SKIN, cleanStr, 1],
		["bgmVolume", K_BGM_VOLUME, cleanNum, 0],
		["bgmOn", K_BGM_ON, cleanBgmOn, 2],
		["sfxVolume", K_SFX_VOLUME, cleanNum, 0],
		["texasSet", K_TEXAS_SET, cleanObj, 0],
		["bjSet", K_BJ_SET, cleanObj, 0],
		["dbgPresets", K_DBG_PRESETS, cleanArr, 0],
	];

	function collect() {
		var body = {};
		for (var i = 0; i < KEY_DEFS.length; i++) {
			var def = KEY_DEFS[i];
			var k = def[0], lsKey = def[1], store = def[3];
			if (k === "world") {
				/* world 优先取内存真值（CSH.world.raw()），避免读盘得到过期快照 */
				body[k] = (CSH && CSH.world && CSH.world.raw) ? CSH.world.raw() : lsJSON(lsKey, null);
			} else if (store === 2) {
				body[k] = collectBgmOn();
			} else {
				body[k] = lsJSON(lsKey, null);
			}
		}
		return body;
	}

	/* 备份：保留最近 MAX_BACKUPS 份 */
	function pushBackup() {
		var stamp = String(Date.now());
		lsPut(K_BACKUP_PREFIX + stamp, collect());
		pruneBackups();
		return stamp;
	}
	function backupKeys() {
		var out = [];
		try {
			for (var i = 0; i < localStorage.length; i++) {
				var k = localStorage.key(i);
				if (k && k.indexOf(K_BACKUP_PREFIX) === 0) out.push(k);
			}
		} catch (e) {}
		out.sort(function (a, b) {
			return Number(b.slice(K_BACKUP_PREFIX.length)) - Number(a.slice(K_BACKUP_PREFIX.length));
		});
		return out;
	}
	function pruneBackups() {
		var keys = backupKeys();
		for (var i = MAX_BACKUPS; i < keys.length; i++) lsDel(keys[i]);
	}
	function backups() {
		return backupKeys().map(function (k) {
			var stamp = k.slice(K_BACKUP_PREFIX.length);
			var d = lsJSON(k, null);
			var aiN = d && d.world && Array.isArray(d.world.ai) ? d.world.ai.length : 0;
			return { stamp: stamp, time: Number(stamp), ai: aiN, pc: d && d.wallet ? d.wallet.pc : 0 };
		});
	}
	function rollback(stamp) {
		var k = K_BACKUP_PREFIX + stamp;
		var d = lsJSON(k, null);
		if (!d) return { ok: false, err: "备份不存在" };
		applyAll(d, false);
		return { ok: true, stamp: stamp };
	}

	/* ---------- 重置存档（出厂初始态 · 分享前 / 推倒重来） ----------
	   清空全部进度键：钱包 / 官阶 / AI 世界 / 胜率 / 成就 / 每日任务 /
	   各游戏最佳纪录 / CDK 核销与设备绑定 / 旧键 / 迁移备份。
	   清空后由调用方刷新页面 —— 各模块用默认值重新初始化，即为初始态
	   （2000 CBY / 平民 0 功勋）。
	   ⚠ 注意：这也会清掉 CDK 核销记录（已兑换的 CDK 码需自行保存，
	   本地核销表清空后同一码可再次兑换，纯本地验证无服务端）。 */
	var RESET_KEYS = [
		K_WALLET, "csh_wallet_snap", "csh_wallet_hist", "csh_wallet_cdk_lifetime",
		K_RANK, K_WORLD, K_CDK, "csh_cdk_used_n", "csh_cdk_dev", "csh_cdk_devbind",
		"csh_daily_task", "csh_career_achv",
		"csh_texas_best", "csh_sniper_best", "csh_bj_best",
		"csh_texas_bank", "csh_texas_bank_legacy", "csh_wallet_migrated",
		K_WINRATE,
	];
	function reset() {
		var cleared = [];
		var i, k;
		for (i = 0; i < RESET_KEYS.length; i++) {
			k = RESET_KEYS[i];
			lsDel(k);
			cleared.push(k);
		}
		var bks = backupKeys();
		for (i = 0; i < bks.length; i++) {
			lsDel(bks[i]);
			cleared.push(bks[i]);
		}
		return { ok: true, cleared: cleared.length, keys: cleared.slice() };
	}

	/* 应用（覆盖）—— 备份开关由调用方决定 */
	function applyAll(body, doBackup) {
		if (doBackup !== false) pushBackup();
		for (var i = 0; i < KEY_DEFS.length; i++) {
			var def = KEY_DEFS[i];
			var k = def[0], lsKey = def[1], store = def[3];
			var v = body[k];
			if (k === "world") {
				if (v && CSH && CSH.world && CSH.world.importRaw) {
					try { CSH.world.importRaw(v); } catch (e) { lsPut(lsKey, v); }
				} else if (v) {
					lsPut(lsKey, v);
				}
			} else if (k === "cdkUsed") {
				/* §J.4#7 CDK 只并集，不覆盖 */
				if (v && v.length) {
					var cur = cleanCdk(lsJSON(K_CDK, null));
					var set = {};
					var j;
					for (j = 0; j < cur.length; j++) set[cur[j]] = 1;
					for (j = 0; j < v.length; j++) set[v[j]] = 1;
					lsPut(K_CDK, Object.keys(set));
				}
			} else if (store === 2) {
				/* bgmOn 通配族：逐个键写回 */
				if (v && typeof v === "object") {
					for (var wk in v) {
						if (Object.prototype.hasOwnProperty.call(v, wk)) lsSet(wk, v[wk]);
					}
				}
			} else if (store === 1) {
				if (v != null) lsSet(lsKey, v);
			} else if (v !== null && v !== undefined) {
				lsPut(lsKey, v);
			}
		}
	}

	/* ---------- 导出 ---------- */
	async function exportCode() {
		var raw = collect();
		/* 【2026-10-01 真机实测修复】此前 body 硬编码 5 键，批次 1 的 19 键扩展只接了
		   collect()/inspect()/applyAll()，唯独漏了这里 —— 导出的串实际永远只有 6 键，
		   语义门绿但功能是坏的（B15 教训第二次应验）。改为遍历 KEY_DEFS 全量导出，
		   clean 返回 null 的键（未使用过）跳过，与 inspect 的过滤语义一致。 */
		var body = { meta: { v: VERSION, t: Date.now(), build: buildVersion() } };
		for (var i = 0; i < KEY_DEFS.length; i++) {
			var def = KEY_DEFS[i];
			var cleaned = def[2](raw[def[0]]);
			if (cleaned !== null && cleaned !== undefined) body[def[0]] = cleaned;
		}
		var plain = JSON.stringify(body);
		body.meta.sum = await sha8(plain);
		return PREFIX + toB64Url(JSON.stringify(body));
	}
	function buildVersion() {
		/* 2026-09-29 修复（契约族实例 4）：此前写 `CSH.wallet.version`，
		   但当时 csh_wallet 用裸赋值 `window.CSH = CSH`，`window.CSH.wallet` 根本不存在
		   ⇒ 恒走兜底假版本 "4.0.4"。现在 csh_wallet 改为合并挂载，
		   `CSH.wallet.version` 真实存在；同时保留两条兜底路径。 */
		try {
			if (CSH && CSH.wallet && CSH.wallet.version) return CSH.wallet.version;
			if (CSH && CSH.version) return CSH.version;
		} catch (e) {}
		return "wallet-unreachable";
	}

	/* ---------- 解析（只读） ---------- */
	async function inspect(code) {
		code = String(code || "").trim();
		if (!code) return { ok: false, err: "内容为空" };
		if (code.indexOf(PREFIX) !== 0) return { ok: false, err: "格式不正确（缺少 " + PREFIX + " 前缀）" };
		var json = fromB64Url(code.slice(PREFIX.length));
		if (!json) return { ok: false, err: "内容已损坏（base64 解码失败）" };
		var obj;
		try { obj = JSON.parse(json); } catch (e) { return { ok: false, err: "文件已损坏或被修改（JSON 解析失败）" }; }
		if (!obj || typeof obj !== "object" || !obj.meta) return { ok: false, err: "文件结构不完整" };
		var v = Number(obj.meta.v || 0);
		if (v > VERSION) return { ok: false, err: "文件来自更新的版本（v" + v + "），请升级扩展" };
		/* 校验：meta.sum 对"去掉 sum 的 body"重算 */
		var copy = JSON.parse(JSON.stringify(obj));
		var want = copy.meta.sum;
		delete copy.meta.sum;
		var got = await sha8(JSON.stringify(copy));
		if (want && want !== got) return { ok: false, err: "文件已损坏或被修改（校验不符）" };
		/* 白名单过滤（2026-10-01：遍历 KEY_DEFS，19 键；v1 老档缺失新键 → clean 返回 null → 跳过） */
		var clean = { meta: obj.meta };
		for (var i = 0; i < KEY_DEFS.length; i++) {
			var def = KEY_DEFS[i];
			var cleaned = def[2](obj[def[0]]);
			if (cleaned !== null && cleaned !== undefined) clean[def[0]] = cleaned;
		}
		return { ok: true, meta: obj.meta, data: clean, summary: summaryOf(clean) };
	}

	function summaryOf(clean) {
		var s = { pc: 0, rank: 0, ai: 0, cdk: 0, hasWinrate: false };
		if (clean.wallet) s.pc = clean.wallet.pc || 0;
		if (clean.rank) s.rank = clean.rank.rank || 0;
		if (clean.world && clean.world.ai) s.ai = clean.world.ai.length;
		if (clean.cdkUsed) s.cdk = clean.cdkUsed.length;
		s.hasWinrate = !!clean.winrate;
		return s;
	}

	/* 差异摘要（§J.4#5） */
	function diffOf(clean) {
		var cur = collect();
		var cw = cleanWallet(cur.wallet) || { pc: 0, rank: 0 };
		var cr = cleanRank(cur.rank) || { rank: 0 };
		return {
			pc: { from: cw.pc, to: clean.wallet ? clean.wallet.pc : cw.pc },
			rank: { from: cr.rank, to: clean.rank ? clean.rank.rank : cr.rank },
		};
	}

	/* 2026-09-29 修复（契约族实例 4）：
	   此前 `CSH.wallet.integrity` 指向不存在的字段（当年 wallet 的 integrity 挂在 CSH 顶层，
	   而 window.CSH 又被裸赋值清空）⇒ 导入存档后**不做完整性校验、内存对象不重载**，
	   余额要重启才生效。现改为依次尝试 `CSH.wallet.integrity` → `CSH.integrity`。 */
	function reloadWallet() {
		try {
			var I = (CSH && CSH.wallet && CSH.wallet.integrity) || (CSH && CSH.integrity) || null;
			if (I && typeof I.check === "function") { I.check(); return true; }
		} catch (e) {}
		return false;
	}
	/* 迁移模块自身的日志出口：此前依赖 `CSH.__lib`（全仓无写入点 ⇒ 恒 null） */
	function logMsg(msg) {
		try {
			if (CSH && typeof CSH.log === "function") { CSH.log(msg); return; }
			if (typeof console !== "undefined" && console.log) console.log("[池子魔将·迁移] " + msg);
		} catch (e) {}
	}

	/* ---------- 导入（执行覆盖） ---------- */
	async function doImport(code, opts) {
		opts = opts || {};
		var ins = await inspect(code);
		if (!ins.ok) return ins;
		var diff = diffOf(ins.data);
		if (opts.dryRun) return { ok: true, dryRun: true, diff: diff, summary: ins.summary };
		var stamp = pushBackup();
		applyAll(ins.data, false);
		/* 通知各模块重载（2026-09-29：改走 reloadWallet，此前引用不存在的字段） */
		var reloaded = reloadWallet();
		logMsg("导入已应用（备份 " + stamp + "，钱包重载 " + (reloaded ? "成功" : "已跳过") + "）");
		return { ok: true, applied: true, backup: stamp, diff: diff, summary: ins.summary, reloaded: reloaded };
	}

	/* ---------- 自检 ---------- */
	async function selftest() {
		var out = [];
		function ok(n, c) { out.push({ n: n, p: !!c }); }

		var w = cleanWallet({ pc: 999999999999, rank: 1, streak: -5 });
		ok("钳制 pc 到上限", w.pc === PC_CAP());
		ok("钳制 streak ≥ 0", w.streak === 0);
		var r = cleanRank({ rank: 99, merit: -3 });
		ok("钳制 rank ≤ 50", r.rank === 50);
		ok("钳制 merit ≥ 0", r.merit === 0);
		var wd = cleanWorld({ ai: [{ id: 1, name: "x", fund: -1 }] });
		ok("world 清洗 AI 数组", wd && wd.ai.length === 1 && wd.ai[0].fund === 0);
		var cd = cleanCdk(["a", "b", "a"]);
		ok("cdk 去重后长度正确（保留重复由并集处理）", cd.length === 3);

		var body = {
			meta: { v: 1, t: Date.now(), build: "1.1.0" },
			wallet: { pc: 5000, pcPeak: 8800, lastSign: "2026-01-01", streak: 3 },
			rank: { rank: 12, merit: 3400, meritToday: 0, meritDate: "" },
			world: { ai: [], lastTick: "" },
			cdkUsed: ["1001", "1002"],
			winrate: { a: { b: 1 } },
		};
		var plain = JSON.stringify(body);
		body.meta.sum = await sha8(plain);
		var code = PREFIX + toB64Url(JSON.stringify(body));
		ok("导出的 code 带前缀", code.indexOf(PREFIX) === 0);

		/* 内部工具：以给定 body（不含 sum）生成合法 code */
		async function mkCode(b) {
			var p = JSON.stringify(b);
			b.meta.sum = await sha8(p);
			return PREFIX + toB64Url(JSON.stringify(b));
		}

		var ins = await inspect(code);
		ok("解析成功", ins.ok);
		ok("解析出 wallet.pc", ins.ok && ins.data.wallet.pc === 5000);
		ok("解析出 rank", ins.ok && ins.data.rank.rank === 12);
		ok("解析出 cdk 两条", ins.ok && ins.data.cdkUsed.length === 2);

		/* 篡改：改一个数字（保留旧 sum → 必失败） */
		var bad = JSON.parse(JSON.stringify(body));
		bad.wallet.pc = 999999;
		var badCode = PREFIX + toB64Url(JSON.stringify(bad));
		var insBad = await inspect(badCode);
		ok("篡改 pc 后校验失败", !insBad.ok && /损坏|修改/.test(insBad.err));

		/* 未知键丢弃（重新计算 sum，确保校验通过） */
		var withUnknown = JSON.parse(JSON.stringify(body));
		delete withUnknown.meta.sum;
		withUnknown.hacked = { evil: true };
		var insU = await inspect(await mkCode(withUnknown));
		ok("未知键被丢弃（不进入 data）", insU.ok && insU.data.hacked === undefined);

		/* 版本过高 */
		var vHigh = JSON.parse(JSON.stringify(body));
		delete vHigh.meta.sum;
		vHigh.meta.v = 99;
		var insV = await inspect(await mkCode(vHigh));
		ok("版本过高被拒绝", !insV.ok && /版本/.test(insV.err));

		/* 格式错误 */
		var insF = await inspect("随便一段文本");
		ok("格式错误被拒绝", !insF.ok);

		/* 边界钳制：pc 改 9990 亿（2026-10-01：上限升至 1000 亿，原测试值 999 亿已在新上限之内，不再触发钳制） */
		var huge = JSON.parse(JSON.stringify(body));
		delete huge.meta.sum;
		huge.wallet.pc = 999000000000;
		var insH = await inspect(await mkCode(huge));
		ok("导入 9990 亿钳制到上限", insH.ok && insH.data.wallet.pc === PC_CAP());

		var pass = out.filter(function (o) { return o.p; }).length;
		return { pass: pass, fail: out.length - pass, cases: out };
	}

	/* ---------- 导出接口 ---------- */
	var CM = {
		VERSION: VERSION, PREFIX: PREFIX, WHITELIST: WHITELIST,
		export: exportCode,
		inspect: inspect,
		import: doImport,
		backups: backups,
		rollback: rollback,
		reset: reset,
		summary: summaryOf,
		diff: diffOf,
		_collect: collect,
		_clean: {
			wallet: cleanWallet, rank: cleanRank, world: cleanWorld, cdk: cleanCdk, winrate: cleanWinrate,
			dailyTask: cleanDailyTask, achv: cleanAchv, obj: cleanObj, num: cleanNum, str: cleanStr,
			bgmOn: cleanBgmOn, lifetime: cleanLifetime, arr: cleanArr,
		},
		selftest: selftest,
	};

	try { if (CSH) CSH.migrate = CM; } catch (e) {}
	try { if (typeof window !== "undefined") { window.CSH = window.CSH || {}; window.CSH.migrate = CM; } } catch (e2) {}
	/* ★ 2026-09-29 R3-2 烟测抓出：本模块此前**只**挂 window.CSH.migrate，从不挂 lib.cshMigrate，
	   而 csh_shell 的 5 个迁移桥命令（export / import / backups / rollback / reset）读的全是
	   lib.cshMigrate ⇒ 运行时恒为空 ⇒ 大厅「重置存档」点了**静默失败**（数据没清，页面却刷新了，
	   用户以为清干净了）。此处补双挂载，与其余 core 模块（wallet/world/shell…）口径一致。
	   ⚠ 血泪重演：这已是第 N 次「挂载通道漂移」类缺陷，改挂载方式必须两侧同步验证。 */
	try { if (typeof lib !== "undefined" && lib) lib.cshMigrate = CM; } catch (e4) {}
	try { if (typeof module !== "undefined" && module.exports) module.exports = CM; } catch (e3) {}

	logMsg("数据迁移模块已加载（格式 v" + VERSION + " · 钱包版本 " + buildVersion() + "）");
})();
