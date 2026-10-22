import { lib, game } from "../../../noname.js";
/*
 * 池子魔将 · 数据迁移与存档（§J）
 * ---------------------------------------------------------------
 * 一份文件装全部生涯（v3 · 2026-10-15：由 19 键扩到「全部玩家数据」）
 *
 * 对外接口（lib.cshMigrate / window.CSH.migrate）：
 *   CM.export()                  → "CSHMIG1.<base64url>" 字符串
 *   CM.inspect(code)             → { ok, err?, meta?, data?, summary? } 只读解析
 *   CM.import(code, opts)        → Promise<{ ok, err?, applied?, diff? }> 执行覆盖（含自动备份）
 *   CM.backups()                 → 最近 3 份备份列表
 *   CM.rollback(stamp)           → Promise<结果> 回滚到指定备份（busy 可同步拒绝）
 *   CM.reset() / CM.recover()    → Promise<结果> 清空 / 恢复未完成操作
 *   CM.inventory()               → 家当清点（每域"有没有 / 多少"），给「行囊」页展示
 *   CM.selftest()                → 自检
 *
 * 规范要点：
 *   §J.3 前缀 CSHMIG1 + meta.sum = 全字段 SHA-256 前 8 字节 base64url
 *   §J.4 白名单 / 钳制 / 版本 / 二次确认(由调用方) / 自动备份 3 份 / CDK 只并集不覆盖
 *
 * ★ v3 三处结构性修正（2026-10-15 作者：「导入导出要涵盖全部的玩家数据」）：
 *   ① **存储后端不再只有 localStorage**：讨伐录 / 扮演魔王 / 胜负统计 / 金鳞市
 *      四份存档的真值在 `lib.config[...]`（game.saveConfig 范式），旧版 migrate 一律
 *      按 localStorage 读 ⇒ **战绩从来就没有被导出过**（读到的恒是 null，功能是坏的
 *      却没人发现）。现有 store 类型：0=localStorage JSON / 1=localStorage 字符串 /
 *      2=通配族 / **3=lib.config（读时 localStorage 兜底）** / **4=多键合成一族**。
 *   ② **键数与代码里的真实持久化键对齐**，并新增门禁（E41）扫源码比对
 *      —— 以后再加键忘了登记，门禁直接红。
 *   ③ **边界显式**：本机身份类键（设备 ID / 设备绑定表 / 天下榜 uid / 悬浮球坐标 /
 *      按日免缠头日键 / 内部迁移标记）**故意不带**，理由逐条写在 EXCLUDED 里，
 *      页面也会如实告诉玩家"哪些不随行囊走"。
 */
(function () {
	var CSH = typeof window !== "undefined" ? window.CSH : null;

	var VERSION = 3;
	var PREFIX = "CSHMIG1.";
	var K_BACKUP_PREFIX = "csh_mig_backup_";
	var K_RECOVERY = "csh_migrate_recovery";
	var MAX_BACKUPS = 3;

	/* ---------- 本机身份类键（**故意不带** 的边界） ----------
	   放在最前，因为"排除清单"与"重置清单"都要引用它们 —— 两边共用同一份键名，
	   免得各写一份字面量然后漂移（本项目反复栽在"同一事实多份副本"上）。 */
	var K_DEVICE_ID = "csh_cdk_dev";                          /* 本机设备 ID（CDK 设备绑定凭据） */
	var K_DEV_BIND = "csh_cdk_devbind";                       /* CDK 序号 ↔ 设备 ID 绑定表 */
	var K_NET_UID = "csh_net_uid";                            /* 天下榜本机身份 */
	var K_FLOAT_POS = "extension_池子魔将_csh_debug_float_pos";/* 调试悬浮球坐标 */
	var K_CHEER_DAY = "csh_rank_cheer_day";                   /* 每日首次免缠头日键 */
	var K_MIG_FLAG = "csh_wallet_migrated";                   /* 内部迁移标记 */
	var K_UPDATE_CACHE = "csh_update_manifest_v1";            /* 更新目录缓存（2026-10-18） */
	var K_UPDATE_VER = "csh_update_ver_v1";                   /* 更新版本小包缓存（2026-10-18） */
	var K_RANK_CACHE = "csh_rank_cache_v1";                   /* 天下榜榜单快照（2026-10-18） */
	var K_RANK_PEND = "csh_rank_submit_pending";              /* 天下榜「最高值待送达」标记（2026-10-18） */

	/* 白名单稍后从实际 KEY_DEFS 生成，导出/解析/家当清点共用同一份域注册。 */
	var WHITELIST = [];

	/* 故意不带（边界清单 · 页面会如实展示给玩家）：
	     · 键名             —— 为什么 */
	var EXCLUDED = [
		[K_RECOVERY, "本机未完成的存档恢复凭据（恢复完成前保留，不随行囊迁移）"],
		[K_DEVICE_ID, "本机设备 ID（CDK 设备绑定的凭据，跨设备带走等于两台机器共用一个身份）"],
		[K_DEV_BIND, "CDK 序号 ↔ 设备 ID 绑定表（同上，属安全边界，不是玩家资产）"],
		[K_NET_UID, "天下榜本机身份（换机后由服务端按机器指纹/网络重新认领，带过去会撞号）"],
		[K_FLOAT_POS, "调试悬浮球坐标（跟着屏幕大小走，换设备会落在奇怪的位置）"],
		[K_CHEER_DAY, "每日首次免缠头的日键（按机器按天，跨设备带过去会白送/吞掉一次）"],
		[K_MIG_FLAG, "内部迁移标记（本机一次性开关，与新机器无关）"],
		[K_UPDATE_CACHE, "更新目录缓存（网络环境的产物；换机后重新拉一次才是真实的远端版本）"],
		[K_UPDATE_VER, "更新版本小包缓存（同上 —— 它是「上次检查到哪个版本」的时效性记录，换机后必然过期）"],
		[K_RANK_CACHE, "天下榜榜单快照（离线时撑门面的缓存，不是玩家资产；旧快照带过去只会骗自己）"],
		[K_RANK_PEND, "天下榜「最高值待送达」标记（一次性补报意图，换机后由新机器的 csh_rank_high 重新产生）"],
	];


	function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
	function lsJSON(k, d) {
		var s = lsGet(k);
		if (!s) return d;
		try { var o = JSON.parse(s); return (o == null) ? d : o; } catch (e) { return d; }
	}
	/* ---------- lib.config 后端（v3 新增） ----------
	   `lib.config[X]` 存的是**对象真值**（noname 的 game.saveConfig 范式），
	   不是 JSON 文本 —— 所以这里不能借用 lsJSON。
	   读取：lib.config 优先（真值），localStorage 兜底（兼容 v1/v2 老串与将来的镜像）。
	   写入：确认宿主真实配置后端后更新 lib.config，**不写 localStorage 镜像**
	   —— 两份副本必然漂移，本项目已经在"同一事实多份副本"上反复栽跟头。 */
	function cfgGet(key, strict) {
		var v = null;
		try { if (lib && lib.config && lib.config[key] !== undefined) v = lib.config[key]; } catch (e0) { if (strict) throw e0; }
		if (v === undefined || v === null) {
			var s = collectJSON(key, strict);    /* 兜底：任何把同键写进 localStorage 的旧实现 */
			if (s !== null) return s;
		}
		return (v === undefined) ? null : v;
	}
	/* 不使用 saveConfig 的返回值判断完成：本机宿主返回 undefined，且 putDB
	   的 request success 早于事务 complete。下面的迁移事务直接确认真实后端。 */
	function copyValue(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
	function strictSet(key, value) {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
		if (localStorage.getItem(key) !== value) throw new Error("存档写入未确认：" + key);
	}
	var activeConfigTransactions = 0;
	function configTransaction(entries, read) {
		if (!entries.length) return Promise.resolve([]);
		return new Promise(function (resolve, reject) {
			var tx, timer, settled = false, terminal = false, values = [];
			function finish(error) {
				if (settled) return;
				settled = true; clearTimeout(timer);
				if (error) reject(error); else resolve(values);
			}
			function ended(error) {
				if (!terminal) { terminal = true; activeConfigTransactions--; }
				finish(error);
			}
			try {
				tx = lib.db.transaction(["config"], read ? "readonly" : "readwrite");
				activeConfigTransactions++;
				tx.oncomplete = function () { ended(); };
				tx.onabort = function () { ended(tx.error || new Error("宿主配置事务中止")); };
				tx.onerror = function () { /* 默认错误会中止整批事务；等待 onabort。 */ };
				var store = tx.objectStore("config");
				entries.forEach(function (entry, i) {
					if (read) {
						var req = store.get(entry.key);
						req.onsuccess = function () {
							values[i] = { key: entry.key, exists: req.result !== undefined, value: copyValue(req.result) };
						};
					} else if (entry.exists) store.put(copyValue(entry.value), entry.key);
					else store.delete(entry.key);
				});
				timer = setTimeout(function () {
					/* abort 可能尚未送达，也可能已经无法取消。没有终态之前保持
					   active 锁和恢复凭据，不能拿超时当作“事务没有写入”。 */
					try { tx.abort(); } catch (abortError) {}
					finish(new Error("暂未确认宿主配置结果，请稍后重试恢复"));
				}, 5000);
			} catch (error) {
				if (tx) { try { tx.abort(); } catch (abortError2) {} }
				finish(error);
			}
		});
	}


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
	/* 2026-10-20 · 池子成就（操作型成就）。与生涯成就分开存：一份是"领奖集合"，
	   一份是"达成记录 + 次数 + 模式"，清洗规则也不一样。 */
	var K_POOL_ACHV = "csh_pool_achv";
	/* 2026-10-20 · 池子成就发奖台账：只增不删，页面级「重置成就进度」不清它，
	   防清档刷奖（见 core/csh_pool_achv.js §5b）。全部重置时随钱包一起清。 */
	var K_POOL_ACHV_PAY = "csh_pool_achv_pay";
	var K_PLAYER_INTERACT = "csh_player_interact";
	var K_RANK_HIGH = "csh_rank_high";
	/* 2026-10-20 · 其他扩展下载断点（csh_debug.js 续传清单）。
	   跨机导入无意义（半成品 buffer 不随存档走），导入后由 resumeLoad 的
	   name/repo/dir 三重校验自然失效；登记只为满足 E41 全键覆盖纪律。 */
	var K_STORE_RESUME = "csh_store_resume";
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

	/* ---------- v3 新增键（2026-10-15） ----------
	   ★ 命名规则：`K_CFG_*` 前缀 = 真值在 lib.config（game.saveConfig 范式），
	     其余 = localStorage。这个区分是本轮最要紧的一处：
	     旧版把 winrate 当 localStorage 读，于是**战绩一直没被导出过**。 */
	var K_AFFECTION = "csh_affection";                 /* 好感度（羁绊/档位/收集册/回礼） */
	var K_LEDGER = "csh_ledger";                       /* 账本（给人看的一本账） */
	var K_WALLET_HIST = "csh_wallet_hist";             /* 兑换台账（最近 5 条） */
	var K_WALLET_SNAP = "csh_wallet_snap";             /* 余额快照（防篡改对账用） */
	var K_CFG_BOSSKILL = "extension_池子魔将_bossKill";       /* 讨伐录（lib.config） */
	var K_CFG_BOSSASBOSS = "extension_池子魔将_bossAsBoss";   /* 扮演魔王战绩（lib.config） */
	var K_CFG_GOLDFISH = "extension_池子魔将_goldfish";       /* 金鳞市（lib.config） */
	var K_CFG_BOUNTY = "extension_池子魔将_csh_bounty";       /* 指定讨伐令目标（lib.config · 2026-10-17） */
	/* 键族（多键合成一个逻辑域）：UI 已阅类 / 玩家在各处留的名字 */
	var GROUP_UI_SEEN = [["bossbookSeen", "csh_bossbook_seen"], ["bossHideKilled", "csh_boss_hide_killed"]];
	var GROUP_NAMES = [["ddz", "csh_ddz_name"], ["uno", "csh_uno_name"],
		["netName", "csh_net_name"], ["netSig", "csh_net_sig"]];


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
			careerClaims: cleanAchv(o.careerClaims) || {},
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
				withPlayer: cleanPlayerTable(a.withPlayer),
			});
		}
		return out;
	}
	function cleanPlayerTable(raw) {
		if (!raw || typeof raw !== "object") return null;
		var p = { hands: clampNum(raw.hands, 0, 9999999), wins: clampNum(raw.wins, 0, 9999999),
			losses: clampNum(raw.losses, 0, 9999999), draws: clampNum(raw.draws, 0, 9999999),
			skillTop: clampF(raw.skillTop, 0, 1, 0), revenge: !!raw.revenge };
		p.wins = Math.min(p.wins, p.hands); p.losses = Math.min(p.losses, p.hands - p.wins); p.draws = Math.min(p.draws, p.hands - p.wins - p.losses);
		p.revenge = p.revenge && p.wins > 0 && p.losses > 0;
		p.lowestFund = p.wins > 0 && typeof raw.lowestFund === "number" && isFinite(raw.lowestFund) && raw.lowestFund >= 0
			? clampNum(raw.lowestFund, 0, AI_FUND_CAP()) : null;
		return p;
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
	function cleanPlayerInteract(o) {
		if (!o || typeof o !== "object" || Array.isArray(o)) return null;
		return { v: 1, total: clampNum(o.total, 0, 1000000000) };
	}
	function cleanRankHigh(o) {
		if (!o || typeof o !== "object" || Array.isArray(o)) return null;
		return { cby: clampNum(o.cby, 0, PC_CAP()), merit: clampNum(o.merit, 0, 1000000000),
			seg: clampStr(o.seg, 12), t: isPastStamp(o.t) };
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
	/* 池子成就存档：{v, got:{id:{t,m,n}}, seen:{id:1}}。
	   只做形状校验与截断 —— 不因为某条 id 不认识就整体丢弃（旧存档遇到新版本规则表时，
	   认不出的 id 留着无副作用，丢掉反而会把玩家进度吃回去）。 */
	function cleanPoolAchv(o) {
		if (!o || typeof o !== "object") return null;
		var out = { v: 1, got: {}, seen: {} };
		var src = (o.got && typeof o.got === "object") ? o.got : {};
		var keys = Object.keys(src).slice(0, 800);
		for (var i = 0; i < keys.length; i++) {
			var id = clampStr(keys[i], 48);
			var rec = src[keys[i]];
			if (!rec || typeof rec !== "object") continue;
			out.got[id] = {
				t: Number(rec.t) || 0,
				m: clampStr(String(rec.m || ""), 16),
				n: Math.max(1, Math.min(999999, Number(rec.n) || 1)),
			};
		}
		var seen = (o.seen && typeof o.seen === "object") ? o.seen : {};
		var sk = Object.keys(seen).slice(0, 800);
		for (var j = 0; j < sk.length; j++) out.seen[clampStr(sk[j], 48)] = 1;
		return out;
	}
	/* 池子成就发奖台账：{v, paid:{id:{t,pc,merit}}}。形状校验 + 截断，与主存档同纪律。 */
	function cleanPoolAchvPay(o) {
		if (!o || typeof o !== "object") return null;
		var out = { v: 1, paid: {} };
		var src = (o.paid && typeof o.paid === "object") ? o.paid : {};
		var keys = Object.keys(src).slice(0, 800);
		for (var i = 0; i < keys.length; i++) {
			var id = clampStr(keys[i], 48);
			var rec = src[keys[i]];
			if (!rec || typeof rec !== "object") continue;
			out.paid[id] = {
				t: Number(rec.t) || 0,
				pc: Math.max(0, Math.min(99999999, Number(rec.pc) || 0)),
				merit: Math.max(0, Math.min(999999, Number(rec.merit) || 0)),
			};
		}
		return out;
	}
	/* 其他扩展下载断点：{name, repo, dir, branch, done:[rel], t}。
	   done 数组截断到 5000（大合集上限）；name/repo/dir 不匹配的脏记录直接丢。 */
	function cleanStoreResume(o) {
		if (!o || typeof o !== "object" || typeof o.name !== "string" || !o.name.trim()) return null;
		if (typeof o.repo !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(o.repo)) return null;
		var out = {
			name: clampStr(o.name, 60),
			repo: o.repo,
			dir: typeof o.dir === "string" ? clampStr(o.dir, 120) : "",
			branch: clampStr(String(o.branch || "main"), 40),
			done: [],
			t: Number(o.t) || 0,
		};
		var d = Array.isArray(o.done) ? o.done.slice(0, 5000) : [];
		for (var i = 0; i < d.length; i++) out.done.push(clampStr(String(d[i] || ""), 200));
		return out;
	}
	/* bgmOn 是「一主键 + N 后缀键」通配族（csh_bgm.js onKey()），导出合并为对象 */	function collectBgmOn(strict) {
		var out = {};
		try {
			for (var i = 0; i < localStorage.length; i++) {
				var k = localStorage.key(i);
				if (k && k.indexOf(K_BGM_ON) === 0) out[k] = strict ? localStorage.getItem(k) : lsGet(k);
			}
		} catch (e) { if (strict) throw e; }
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

	/* ============================================================
	   v3 新增清洗器（2026-10-15）
	   ------------------------------------------------------------
	   设计口径（与 §J.4#4 一致）：**宁可少留，不可留毒**。
	   · 每个域都有明确上限（键数 / 条数 / 数值区间），防"导入一份巨物把游戏拖死"；
	   · 形状不认识就整键丢掉，绝不透传未知字段（未知字段 = 未来版本的注入面）；
	   · 上限尽量取自模块自己的常量（AFF_MAX / AI_FUND_CAP / PC_CAP），
	     取不到才用字面量兜底 —— 避免"同一事实两处手写"再度漂移。
	   ============================================================ */
	function affMax() {
		try {
			var A = (lib && lib.cshAffection && lib.cshAffection.AFF_MAX);
			if (typeof A === "number" && A > 0) return A;
		} catch (e) {}
		return 100;
	}
	/* 通用：字符串键 → 数值（限量 + 钳制）。用于"id → 数字"类表。 */
	function numMap(o, maxKeys, lo, hi, floorIt) {
		if (!o || typeof o !== "object" || Array.isArray(o)) return null;
		var out = {}, n = 0, keys = Object.keys(o);
		for (var i = 0; i < keys.length && n < maxKeys; i++) {
			var k = clampStr(keys[i], 48);
			if (!k) continue;
			var v = floorIt === false ? clampF(o[keys[i]], lo, hi, 0) : clampNum(o[keys[i]], lo, hi);
			out[k] = v; n++;
		}
		return n ? out : null;
	}
	/* 通用：字符串键 → 短字符串（限量 + 截断）。用于"ID → 名字"类表。 */
	function strMap(o, maxKeys, maxLen) {
		if (!o || typeof o !== "object" || Array.isArray(o)) return null;
		var out = {}, n = 0, keys = Object.keys(o);
		for (var i = 0; i < keys.length && n < maxKeys; i++) {
			var k = clampStr(keys[i], 48);
			if (!k) continue;
			if (typeof o[keys[i]] !== "string") continue;
			out[k] = clampStr(o[keys[i]], maxLen || 64); n++;
		}
		return n ? out : null;
	}
	/* 通用：只保留"原始值"字段的小对象（形状不认识的存档用它兜底，
	   例如 walletSnap / 兑换台账条目：只留 number / string / boolean，其余一律丢）。 */
	function flat(o, maxKeys, maxLen) {
		if (!o || typeof o !== "object" || Array.isArray(o)) return null;
		var out = {}, n = 0, keys = Object.keys(o);
		for (var i = 0; i < keys.length && n < maxKeys; i++) {
			var k = clampStr(keys[i], 32);
			if (!k) continue;
			var v = o[keys[i]], t = typeof v;
			if (t === "number") out[k] = (isFinite(v) ? v : 0);
			else if (t === "string") out[k] = clampStr(v, maxLen || 40);
			else if (t === "boolean") out[k] = v;
			else continue;
			n++;
		}
		return n ? out : null;
	}

	/* ① 好感度（csh_affection）：{ id: { v, last, saw, giveSum, giveN, day:{}, cnt:{} } }
	   字段集与 csh_affection.readStore 的清洗口径**逐项对齐**（6 个日键 / 计数表限量）。 */
	var AFF_DAILY_KEYS = ["hunt", "hold", "talk", "head", "close", "gift", "tea", "stars", "callname"];   /* v6.9 三新互动 */
	function cleanAffection(o) {
		if (!o || typeof o !== "object" || Array.isArray(o)) return null;
		var MAXV = affMax(), out = {}, n = 0, keys = Object.keys(o);
		for (var i = 0; i < keys.length && n < 128; i++) {
			var id = clampStr(keys[i], 48);
			var e = o[keys[i]];
			if (!id || !e || typeof e !== "object" || Array.isArray(e)) continue;
			var rec = {
				v: clampNum(e.v, 0, MAXV),
				last: isPastStamp(e.last),
				saw: /^\d{4}-\d{2}-\d{2}$/.test(String(e.saw || "")) ? String(e.saw) : "",
				giveSum: clampNum(e.giveSum, 0, PC_CAP()),
				giveN: clampNum(e.giveN, 0, 999999),
				oath: isPastStamp(e.oath),            /* ★ v6.9：契约时间戳（导入导出必须带） */
			};
			var day = {}, dn = 0;
			if (e.day && typeof e.day === "object") {
				for (var j = 0; j < AFF_DAILY_KEYS.length; j++) {
					var dk = AFF_DAILY_KEYS[j];
					if (typeof e.day[dk] === "string" && e.day[dk]) { day[dk] = clampStr(e.day[dk], 20); dn++; }
				}
			}
			if (dn) rec.day = day;
			var cnt = numMap(e.cnt, 24, 0, 999999);
			if (cnt) rec.cnt = cnt;
			out[id] = rec; n++;
		}
		return n ? out : null;
	}

	/* ② 讨伐录（lib.config · extension_池子魔将_bossKill）
	   { map:{id:{n,first,last,best}} , ext:{同 map} , extPool:{id:{...}}, minions:{id:{n,first,last}}, lastDaily } */
	function cleanFightMap(o, withBest) {
		if (!o || typeof o !== "object" || Array.isArray(o)) return null;
		var out = {}, n = 0, keys = Object.keys(o);
		for (var i = 0; i < keys.length && n < 256; i++) {
			var id = clampStr(keys[i], 64);
			var e = o[keys[i]];
			if (!id || !e || typeof e !== "object" || Array.isArray(e)) continue;
			var cnt = clampNum(e.n, 0, 999999);
			if (cnt <= 0) continue;
			var rec = { n: cnt, first: isPastStamp(e.first), last: isPastStamp(e.last || e.first) };
			if (!rec.first) rec.first = rec.last;
			if (withBest && typeof e.best === "number" && isFinite(e.best) && e.best > 0) rec.best = clampNum(e.best, 1, 9999);
			out[id] = rec; n++;
		}
		return n ? out : null;
	}
	function cleanBossKill(o) {
		if (!o || typeof o !== "object" || Array.isArray(o)) return null;
		var out = {};
		var m = cleanFightMap(o.map, true); if (m) out.map = m;
		var x = cleanFightMap(o.ext, true); if (x) out.ext = x;
		var mn = cleanFightMap(o.minions, false); if (mn) out.minions = mn;
		/* 外传名册快照：{id:{name,title,img,skillCount,hp,...}} —— 是"名册缓存"不是战绩，
		   但它是外传卷能显示的前提，必须一起带走（否则换机后外传卷全是空态）。 */
		if (o.extPool && typeof o.extPool === "object" && !Array.isArray(o.extPool)) {
			var pool = {}, pn = 0, pkeys = Object.keys(o.extPool);
			for (var i = 0; i < pkeys.length && pn < 256; i++) {
				var pid = clampStr(pkeys[i], 64), pe = o.extPool[pkeys[i]];
				if (!pid || !pe || typeof pe !== "object") continue;
				pool[pid] = {
					name: clampStr(pe.name, 32), title: clampStr(pe.title, 32), img: clampStr(pe.img, 160),
					skillCount: clampNum(pe.skillCount, 0, 99), hp: clampNum(pe.hp, 0, 999),
				};
				pn++;
			}
			if (pn) out.extPool = pool;
		}
		if (typeof o.lastDaily === "string") out.lastDaily = clampStr(o.lastDaily, 20);
		return Object.keys(out).length ? out : null;
	}
	/* ③ 扮演魔王战绩：{ win, lose, last } */
	function cleanBossAsBoss(o) {
		if (!o || typeof o !== "object" || Array.isArray(o)) return null;
		return { win: clampNum(o.win, 0, 999999), lose: clampNum(o.lose, 0, 999999), last: isPastStamp(o.last) };
	}
	/* ④ 金鳞市（lib.config · extension_池子魔将_goldfish）
	   ★ 价格不带走：价格是每日漂移的市场行情，跨设备/跨时间带过去等于开天眼
	     （导入一份旧价 → 立刻按旧价买、按新价卖）。持仓与成本带（那是玩家真金白银）。 */
	function cleanGoldfish(o) {
		if (!o || typeof o !== "object" || Array.isArray(o)) return null;
		var out = {
			dayNo: clampNum(o.dayNo, 0, 999999),
			day: typeof o.day === "string" ? clampStr(o.day, 20) : "",
			hold: numMap(o.hold, 64, 0, 999999999),
			cost: numMap(o.cost, 64, 0, PC_CAP()),
			gift: !!o.gift,
			earned: clampNum(o.earned, 0, 999999999999),
			pendingDiv: clampNum(o.pendingDiv, 0, PC_CAP()),
		};
		var tips = cleanArr(o.tips);
		if (tips) out.tips = tips.slice(0, 24);
		return out;
	}
	/* ⑤ 账本 / 兑换台账 / 余额快照 */
	function cleanLedger(o) {
		if (!Array.isArray(o) || !o.length) return null;
		var out = [];
		for (var i = 0; i < o.length && out.length < 400; i++) {
			var e = o[i];
			if (!e || typeof e !== "object") continue;
			var d = clampNum(e.d, -PC_CAP(), PC_CAP());
			if (!d) continue;
			out.push({
				t: isPastStamp(e.t), d: d,
				r: clampStr(e.r, 40), c: clampStr(e.c, 16),
				b: clampNum(e.b, 0, PC_CAP()),
			});
		}
		return out.length ? out : null;
	}
	function cleanHist(o) {
		if (!Array.isArray(o) || !o.length) return null;
		var out = [];
		for (var i = 0; i < o.length && out.length < 5; i++) {
			var f = flat(o[i], 16, 40);
			if (f) out.push(f);
		}
		return out.length ? out : null;
	}
	function cleanSnap(o) { return flat(o, 24, 40); }

	/* ⑥ 键族：UI 已阅 / 各游戏玩家名（统一走 strMap） */
	function cleanUiSeen(o) { return strMap(o, 8, 32); }
	function cleanNames(o) {
		var m = strMap(o, 8, 24);      /* 名字最长 5 字、题壁 10 字，24 足够且留余量 */
		return m;
	}

	/* ---------- 采集 / 应用 ---------- */
	/* 键注册表（逻辑名 → localStorage 键 + 清洗器 + 存储类型）。
	   存储类型：0 = localStorage JSON
	             1 = localStorage 字符串
	             2 = 通配族（bgmOn：一主键 + N 后缀键）
	             3 = **lib.config**（game.saveConfig 范式 · v3 新增 · 读时 localStorage 兜底）
	             4 = **多键合成一族**（v3 新增 · 表的取值见 GROUP_*）
	   顺序即导出顺序（6 原 + 6 必须 + 7 建议 + 9 新增 = 28 项，meta 为虚拟键不在此表）。 */
	var KEY_DEFS = [
		["winrate", K_WINRATE, cleanWinrate, 3],
		["wallet", K_WALLET, cleanWallet, 0],
		["rank", K_RANK, cleanRank, 0],
		["world", K_WORLD, cleanWorld, 0],
		["cdkUsed", K_CDK, cleanCdk, 0],
		["dailyTask", K_DAILY_TASK, cleanDailyTask, 0],
		["achv", K_ACHV, cleanAchv, 0],
		["poolAchv", K_POOL_ACHV, cleanPoolAchv, 0],
		["poolAchvPay", K_POOL_ACHV_PAY, cleanPoolAchvPay, 0],
		["playerInteract", K_PLAYER_INTERACT, cleanPlayerInteract, 0],
		["rankHigh", K_RANK_HIGH, cleanRankHigh, 0],
		["storeResume", K_STORE_RESUME, cleanStoreResume, 0],
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
		/* ---- v3 新增 9 项（2026-10-15 · 覆盖全部玩家数据） ---- */
		["affection", K_AFFECTION, cleanAffection, 0],
		["bossKill", K_CFG_BOSSKILL, cleanBossKill, 3],
		["bossAsBoss", K_CFG_BOSSASBOSS, cleanBossAsBoss, 3],
		["goldfish", K_CFG_GOLDFISH, cleanGoldfish, 3],
		/* 指定讨伐令（2026-10-17）：只允许是合法妖灵 id，其余一律清空（脏数据不随行囊走） */
		["bounty", K_CFG_BOUNTY, function (v) {
			try { return (typeof v === "string" && /^csh_boss_minion_[a-z0-9_]+$/.test(v)) ? v : ""; } catch (e) { return ""; }
		}, 3],
		["ledger", K_LEDGER, cleanLedger, 0],
		["walletHist", K_WALLET_HIST, cleanHist, 0],
		["walletSnap", K_WALLET_SNAP, cleanSnap, 0],
		["uiSeen", "uiSeen", cleanUiSeen, 4],
		["names", "names", cleanNames, 4],
	];
	/* 导出、解析、重置和显示共用实际键表，不能只在说明白名单里登记。 */
	WHITELIST = KEY_DEFS.map(function (def) { return def[0]; }).concat(["meta"]);
	/* 键族成员（类型 4）：[逻辑子键, localStorage 键] */
	var GROUP_MEMBERS = { uiSeen: GROUP_UI_SEEN, names: GROUP_NAMES };
	function groupCollect(name, strict) {
		var mem = GROUP_MEMBERS[name] || [], out = {}, n = 0;
		for (var i = 0; i < mem.length; i++) {
			var v = strict ? localStorage.getItem(mem[i][1]) : lsGet(mem[i][1]);
			if (v === null || v === "") continue;
			out[mem[i][0]] = v; n++;
		}
		return n ? out : null;
	}
	function collectJSON(key, strict) {
		if (!strict) return lsJSON(key, null);
		var raw = localStorage.getItem(key);
		return raw === null ? null : JSON.parse(raw);
	}
	function collect(strict) {
		var body = {};
		for (var i = 0; i < KEY_DEFS.length; i++) {
			var def = KEY_DEFS[i];
			var k = def[0], lsKey = def[1], store = def[3];
			if (k === "world") {
				/* world 优先取内存真值（CSH.world.raw()），避免读盘得到过期快照 */
				body[k] = (CSH && CSH.world && CSH.world.raw) ? CSH.world.raw() : collectJSON(lsKey, strict);
			} else if (store === 2) {
				body[k] = collectBgmOn(strict);
			} else if (store === 3) {
				body[k] = cfgGet(lsKey, strict);
			} else if (store === 4) {
				body[k] = groupCollect(k, strict);
			} else if (store === 1) {
				body[k] = strict ? localStorage.getItem(lsKey) : lsGet(lsKey);
			} else {
				body[k] = collectJSON(lsKey, strict);
			}
		}
		/* 市场检查点已经与余额共同落盘，不能导出仍旧的 config 持仓。
		   迁移文件扁平化成原有 wallet/goldfish/ledger 三域，不携带本机同步任务。 */
		var pending = body.wallet && body.wallet.marketPending;
		if (pending && pending.state) {
			body.goldfish = pending.state;
			if (pending.entry) {
				var list = Array.isArray(body.ledger) ? body.ledger.slice() : [];
				if (!list.some(function (e) { return e && e.marketTx === pending.id; })) list.unshift(pending.entry);
				body.ledger = list;
			}
		}
		/* 生涯奖励原子凭据随余额迁移，并并入旧版领奖集合；待补流水扁平化。
		   导入不带本机待执行任务，旧版本也能识别已经兑现的奖励。 */
		var career = body.wallet && body.wallet.careerClaims;
		if (career && typeof career === "object") body.achv = Object.assign({}, body.achv || {}, career);
		var careerPending = body.wallet && body.wallet.careerPending;
		if (careerPending && careerPending.entry) {
			var careerList = Array.isArray(body.ledger) ? body.ledger.slice() : [];
			if (!careerList.some(function (e) { return e && e.careerTx === careerPending.key; })) careerList.unshift(careerPending.entry);
			body.ledger = careerList;
		}
		return body;
	}

	/* 备份：保留最近 MAX_BACKUPS 份 */
	function pushBackup() {
		flushForMigration();
		var stamp = String(Date.now());
		while (localStorage.getItem(K_BACKUP_PREFIX + stamp) !== null) stamp = String(Number(stamp) + 1);
		strictSet(K_BACKUP_PREFIX + stamp, JSON.stringify(collect(true)));
		pruneBackups();
		return stamp;
	}
	function backupKeys(strict) {
		var out = [];
		try {
			for (var i = 0; i < localStorage.length; i++) {
				var k = localStorage.key(i);
				if (k && k.indexOf(K_BACKUP_PREFIX) === 0) out.push(k);
			}
		} catch (e) { if (strict) throw e; }
		out.sort(function (a, b) {
			return Number(b.slice(K_BACKUP_PREFIX.length)) - Number(a.slice(K_BACKUP_PREFIX.length));
		});
		return out;
	}
	function pruneBackups() {
		var keys = backupKeys(true);
		for (var i = MAX_BACKUPS; i < keys.length; i++) strictSet(keys[i], null);
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
		if (marketBusy()) return { ok: false, err: "市场存档正在同步，请稍后重试" };
		return mutation(async function () {
			var d = lsJSON(K_BACKUP_PREFIX + stamp, null);
			if (!d) return { ok: false, err: "备份不存在" };
			await applyAll(d, true);
			return { ok: true, stamp: stamp };
		});
	}

	/* ---------- 重置存档（出厂初始态 · 分享前 / 推倒重来） ----------
	   清空全部进度键：钱包 / 官阶 / AI 世界 / 胜率 / 成就 / 每日任务 /
	   各游戏最佳纪录 / CDK 核销与设备绑定 / 旧键 / 迁移备份。
	   清空后由调用方刷新页面 —— 各模块用默认值重新初始化，即为初始态
	   （2000 CBY / 平民 0 功勋）。
	   ⚠ 注意：这也会清掉 CDK 核销记录（已兑换的 CDK 码需自行保存，
	   本地核销表清空后同一码可再次兑换，纯本地验证无服务端）。 */
	/* ★ v3（2026-10-15）：「重置」必须与「导出」覆盖面**一致**，否则会出现
	   "重置了但战绩还在""导出了但重置不掉"两头的口径分裂（本轮作者问的正是
	   导入导出要不要涵盖全部数据 —— 涵盖之后，重置也必须跟上）。 */
	var RESET_KEYS = [
		K_WALLET, K_WALLET_SNAP, K_WALLET_HIST, K_CDK_LIFETIME,
		K_RANK, K_WORLD, K_CDK, "csh_cdk_used_n", K_DEVICE_ID, K_DEV_BIND,
		K_DAILY_TASK, K_ACHV, K_POOL_ACHV, K_POOL_ACHV_PAY, K_STORE_RESUME, K_PLAYER_INTERACT, K_RANK_HIGH,
		K_TEXAS_BEST, K_SNIPER_BEST, K_BJ_BEST,
		"csh_texas_bank", "csh_texas_bank_legacy", K_MIG_FLAG,
		K_WINRATE,
		/* v3 新增：好感度 / 账本 / 讨伐录 / 扮演魔王 / 金鳞市 / UI 已阅 / 各处名字 */
		K_AFFECTION, K_LEDGER,
		K_CFG_BOSSKILL, K_CFG_BOSSASBOSS, K_CFG_GOLDFISH, K_CFG_BOUNTY,
		"csh_bossbook_seen", "csh_boss_hide_killed",
		"csh_ddz_name", "csh_uno_name", "csh_net_name", "csh_net_sig",
	];
	function reset() {
		if (marketBusy()) return { ok: false, err: "市场存档正在同步，请稍后重试" };
		return mutation(async function () {
			var plan = { local: {}, config: [] }, keys = RESET_KEYS.slice();
			/* 重置与导出共用注册表，包含以前漏掉的设置、通配族与 bounty。 */
			KEY_DEFS.forEach(function (def) {
				if (def[3] === 3) plan.config.push({ key: def[1], exists: false });
				else if (def[3] === 4) (GROUP_MEMBERS[def[0]] || []).forEach(function (m) { keys.push(m[1]); });
				else if (def[3] !== 2) keys.push(def[1]);
			});
			keys = keys.concat(Object.keys(collectBgmOn(true) || {}), backupKeys(true));
			keys.forEach(function (key) { plan.local[key] = null; });
			await commitPlan(plan);
			return { ok: true, cleared: Object.keys(plan.local).length + plan.config.length, keys: Object.keys(plan.local).concat(plan.config.map(function (e) { return e.key; })) };
		});
	}

	/* 先构造写入计划，不调用可能吞掉落盘失败的 world.importRaw。 */
	async function applyAll(body, replaceMissing) {
		var plan = { local: {}, config: [] };
		for (var i = 0; i < KEY_DEFS.length; i++) {
			var def = KEY_DEFS[i];
			var k = def[0], lsKey = def[1], store = def[3];
			var v = body[k];
			if (k === "cdkUsed") {
				/* §J.4#7 CDK 只并集，不覆盖 */
				if (v && v.length) {
					var cur = cleanCdk(lsJSON(K_CDK, null));
					var set = {};
					var j;
					for (j = 0; j < cur.length; j++) set[cur[j]] = 1;
					for (j = 0; j < v.length; j++) set[v[j]] = 1;
					plan.local[K_CDK] = JSON.stringify(Object.keys(set));
				}
			} else if (store === 2) {
				if (replaceMissing) Object.keys(collectBgmOn(true) || {}).forEach(function (key) { plan.local[key] = null; });
				if (v && typeof v === "object") {
					for (var wk in v) {
						if (Object.prototype.hasOwnProperty.call(v, wk)) plan.local[wk] = String(v[wk]);
					}
				}
			} else if (store === 3) {
				if (v != null || replaceMissing) {
					plan.config.push({ key: lsKey, exists: v != null, value: copyValue(v) });
					/* 去掉旧实现同键 LS 镜像，防止删除 config 后又被 cfgGet 复活。 */
					plan.local[lsKey] = null;
				}
			} else if (store === 4) {
				(GROUP_MEMBERS[k] || []).forEach(function (m) {
					if (v && Object.prototype.hasOwnProperty.call(v, m[0])) plan.local[m[1]] = clampStr(v[m[0]], 40);
					else if (replaceMissing) plan.local[m[1]] = null;
				});
			} else if (store === 1) {
				if (v != null || replaceMissing) plan.local[lsKey] = v == null ? null : String(v);
			} else if (v != null || replaceMissing) {
				plan.local[lsKey] = v == null ? null : JSON.stringify(v);
			}
		}
		await commitPlan(plan);
	}

	/* LS 多键与宿主 config 无法组成同一数据库事务。写前保存原始值（包括
	   “不存在”），确认两边完成后才删除凭据；任何失败都恢复原值。恢复本身
	   失败时留下凭据，下一次恢复先完成，禁止继续覆盖半套存档。 */
	function flushForMigration() {
		if (lib.cshWallet && lib.cshWallet.flushSave && lib.cshWallet.flushSave({ migration: true }) === false) {
			throw new Error("钱包尚未保存，请先恢复未完成操作或腾出存储空间后重试");
		}
		var W = lib.cshWallet && lib.cshWallet.wallet;
		if (W && typeof W.pc === "function") {
			var raw = JSON.parse(localStorage.getItem(K_WALLET) || "null");
			if (!raw || raw.pc !== W.pc()) throw new Error("钱包尚未保存，请腾出存储空间后重试");
		}
	}
	function configMemory(entries) {
		return entries.map(function (entry) {
			return { key: entry.key, exists: Object.prototype.hasOwnProperty.call(lib.config, entry.key), value: copyValue(lib.config[entry.key]) };
		});
	}
	function applyConfigMemory(entries) {
		entries.forEach(function (entry) {
			if (entry.exists) lib.config[entry.key] = copyValue(entry.value);
			else delete lib.config[entry.key];
		});
	}
	function configFallback(plan) {
		if (!plan.config.length) return;
		if (typeof lib.configprefix !== "string") throw new Error("宿主存储未就绪");
		var key = lib.configprefix + "config";
		var raw = localStorage.getItem(key);
		var config = raw === null ? {} : JSON.parse(raw);
		if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("宿主配置格式异常");
		plan.config.forEach(function (entry) {
			if (entry.exists) config[entry.key] = copyValue(entry.value);
			else delete config[entry.key];
		});
		plan.local[key] = JSON.stringify(config);
	}
	async function restoreJournal(journal) {
		if (activeConfigTransactions) throw new Error("宿主配置结果尚未确认，请稍后重试恢复");
		if (!journal || journal.v !== 1 || !journal.local || !Array.isArray(journal.config) || !Array.isArray(journal.memory)) throw new Error("存档恢复凭据损坏，请保留本机数据并从备份恢复");
		var errors = [];
		if (journal.config.length) {
			try {
				if (!lib.db) throw new Error("原宿主配置后端尚未就绪，请稍后重试恢复");
				await configTransaction(journal.config, false);
			} catch (configError) { errors.push(configError); }
		}
		Object.keys(journal.local).forEach(function (key) {
			try { strictSet(key, journal.local[key]); } catch (error) { errors.push(error); }
		});
		if (errors.length) throw errors[0];
		applyConfigMemory(journal.memory);
		reloadModules();
		strictSet(K_RECOVERY, null);
	}
	async function recoverPending() {
		var raw = localStorage.getItem(K_RECOVERY);
		if (raw === null) return false;
		var journal = JSON.parse(raw);
		await restoreJournal(journal);
		return true;
	}
	async function commitPlan(plan) {
		flushForMigration();
		if (activeConfigTransactions) throw new Error("宿主配置结果尚未确认，请稍后重试恢复");
		var journal = { v: 1, local: {}, config: [], memory: configMemory(plan.config) };
		if (lib.db) journal.config = await configTransaction(plan.config, true);
		else configFallback(plan);
		Object.keys(plan.local).forEach(function (key) { journal.local[key] = localStorage.getItem(key); });
		strictSet(K_RECOVERY, JSON.stringify(journal));
		try {
			Object.keys(plan.local).forEach(function (key) { strictSet(key, plan.local[key]); });
			if (lib.db) await configTransaction(plan.config, false);
			applyConfigMemory(plan.config);
			reloadModules();
			strictSet(K_RECOVERY, null);
		} catch (error) {
			try {
				await restoreJournal(journal);
				throw Object.assign(new Error("存档未应用，已恢复原存档：" + String(error && error.message || error)), { restored: true });
			} catch (recoveryError) {
				if (recoveryError.restored) throw recoveryError;
				throw new Error("存档恢复尚未完成，请点击“恢复未完成操作”重试：" + String(recoveryError && recoveryError.message || recoveryError));
			}
		}
	}
	function reloadModules() {
		/* 先严格读齐必要域，再采用同一批对象。任何读失败都不能留下成功
		   ACK 和旧内存，也不能由 reload 内部容错把“读失败”当新装默认。 */
		var snapshot = { wallet: collectJSON(K_WALLET, true), rank: collectJSON(K_RANK, true), dailyTask: collectJSON(K_DAILY_TASK, true) };
		var worldValue = collectJSON(K_WORLD, true), W = lib.cshWallet;
		var world = lib.cshWorld || (CSH && CSH.world);
		if (W && typeof W.reloadSave === "function") {
			var result = W.reloadSave(snapshot, { memoryOnly: true });
			if (!result || !result.ok) throw new Error("钱包未能采用新存档");
		}
		if (world) {
			if (typeof world.reloadSave !== "function" || !world.reloadSave(worldValue)) throw new Error("AI 世界未能采用新存档");
		}
	}
	var mutating = false;
	function redemptionBusy() {
		return !!(lib.cshWallet && lib.cshWallet.cdk && lib.cshWallet.cdk.busy && lib.cshWallet.cdk.busy());
	}
	async function mutation(work) {
		if (mutating) return { ok: false, err: "存档操作正在进行，请稍后重试" };
		/* CDK 验签跨异步边界；等其完成后再取快照，避免旧回调核销到新存档。 */
		if (redemptionBusy()) {
			return { ok: false, err: "兑换码正在验证，请完成后再操作存档" };
		}
		mutating = true;
		try {
			await recoverPending();
			if (marketBusy()) return { ok: false, err: "市场存档正在同步，请稍后重试" };
			return await work();
		} catch (error) {
			var pending = true;
			try { pending = localStorage.getItem(K_RECOVERY) !== null; } catch (readError) {}
			logMsg("存档操作失败：" + String(error && error.message || error));
			return { ok: false, err: String(error && error.message || error), recovery: pending };
		} finally { mutating = false; }
	}
	function recover() {
		return mutation(async function () { return { ok: true, recovered: true }; });
	}
	function recoveryState() {
		try { return { pending: localStorage.getItem(K_RECOVERY) !== null, busy: mutating || activeConfigTransactions > 0 }; }
		catch (error) { return { pending: true, busy: mutating, err: "暂时无法读取存档恢复凭据" }; }
	}

	/* ---------- 导出 ---------- */
	async function exportCode() {
		if (mutating || localStorage.getItem(K_RECOVERY) !== null) throw new Error("请先完成未完成的存档恢复，再导出");
		if (redemptionBusy()) throw new Error("兑换码正在验证，请完成后再导出存档");
		flushForMigration();
		var raw = collect(true);
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
		var s = { pc: 0, rank: 0, ai: 0, cdk: 0, hasWinrate: false, matches: 0, kills: 0, girls: 0 };
		if (clean.wallet) s.pc = clean.wallet.pc || 0;
		if (clean.rank) s.rank = clean.rank.rank || 0;
		if (clean.world && clean.world.ai) s.ai = clean.world.ai.length;
		if (clean.cdkUsed) s.cdk = clean.cdkUsed.length;
		s.hasWinrate = !!clean.winrate;          /* ★ v3：winrate 现在真的读得到了（原来恒 false） */
		s.matches = wrTotals(clean.winrate).games;
		s.kills = clean.bossKill && clean.bossKill.map ? Object.keys(clean.bossKill.map).length : 0;
		s.girls = clean.affection ? Object.keys(clean.affection).length : 0;
		return s;
	}
	/* 胜负统计总场次。
	   ★ 真实形状（csh_winrate.readData）：顶层是**模式键**
	     `{ identity:{角色:entry}, versus:{…}, doudizhu:{…}, guozhan:{…}, camps:{…}, me:{chars:{…},camps:{…}} }`
	   ★ 口径必须与唯一的历史实现（csh_shell.buildStats）一致：它只读 `me.chars` ——
	     因为 `me` 是"玩家亲自操控"的那一份，而模式桶是**全体（含 AI）**的汇总，
	     两处都加会把玩家自己的对局数算两遍。故：
	       有 me.chars → 只算它；没有（极老档）→ 退回累加四个模式桶。
	     `camps` 是按阵营统计，与角色维度重叠，一律不计。 */
	function wrTotals(w) {
		var games = 0, win = 0, lose = 0;
		if (!w || typeof w !== "object") return { games: games, win: win, lose: lose, push: 0 };
		function absorb(bucket) {
			if (!bucket || typeof bucket !== "object") return;
			for (var ck in bucket) {
				if (!Object.prototype.hasOwnProperty.call(bucket, ck)) continue;
				var c = bucket[ck];
				if (!c || typeof c !== "object" || typeof c.games !== "number") continue;
				games += clampNum(c.games, 0, 9999999);
				win += clampNum(c.win, 0, 9999999);
				lose += clampNum(c.lose, 0, 9999999);
			}
		}
		try {
			if (w.me && typeof w.me === "object" && w.me.chars && typeof w.me.chars === "object") {
				absorb(w.me.chars);
			} else {
				var MODES = ["identity", "versus", "doudizhu", "guozhan"];
				for (var i = 0; i < MODES.length; i++) absorb(w[MODES[i]]);
			}
		} catch (e) {}
		return { games: games, win: win, lose: lose, push: Math.max(0, games - win - lose) };
	}

	/* ---------- 家当清点（v3 · 「行囊」页的数据源） ----------
	   返回**纯数据**（键名 + 有没有 + 数量 + 少量明细），一个中文字都没有 ——
	   对外可见的文案一律由页面（games/save.html 的文案表 T）负责，
	   与天下榜页同一条纪律：「页面上一切对外可见的字只从文案表里取」。
	   顺序 = 玩家最关心的顺序（钱 → 位分 → 战绩 → 妖灵 → 市集 → 设置）。 */
	function inventory(body) {
		body = body || collect();
		var rows = [];
		function add(key, has, n, extra) {
			rows.push({ key: key, has: !!has, n: n || 0, extra: extra || null });
		}
		var w = cleanWallet(body.wallet);
		add("wallet", !!w, w ? w.pc : 0, w ? { peak: w.pcPeak, streak: w.streak } : null);
		var r = cleanRank(body.rank);
		add("rank", !!r, r ? r.merit : 0, r ? { rank: r.rank } : null);
		var wr = cleanWinrate(body.winrate);
		var wt = wrTotals(wr);
		add("winrate", !!wr, wt.games, { win: wt.win, lose: wt.lose, push: wt.push });
		var wld = cleanWorld(body.world);
		add("world", !!(wld && wld.ai && wld.ai.length), wld && wld.ai ? wld.ai.length : 0, null);
		var bk = cleanBossKill(body.bossKill);
		add("bossKill", !!(bk && bk.map), bk && bk.map ? Object.keys(bk.map).length : 0,
			{ minions: bk && bk.minions ? Object.keys(bk.minions).length : 0,
			  ext: bk && bk.ext ? Object.keys(bk.ext).length : 0 });
		var ab = cleanBossAsBoss(body.bossAsBoss);
		add("bossAsBoss", !!(ab && (ab.win || ab.lose)), ab ? (ab.win + ab.lose) : 0,
			ab ? { win: ab.win, lose: ab.lose } : null);
		var af = cleanAffection(body.affection);
		var afSum = 0, afTop = 0, afN = 0;
		if (af) {
			for (var id in af) {
				if (!Object.prototype.hasOwnProperty.call(af, id)) continue;
				var v = af[id].v || 0;
				afSum += v; afN++;
				if (v >= affMax()) afTop++;
			}
		}
		add("affection", afN > 0, afN, afN ? { sum: afSum, full: afTop } : null);
		var gf = cleanGoldfish(body.goldfish);
		var gHold = gf && gf.hold ? Object.keys(gf.hold).length : 0;
		var gCost = 0;
		if (gf && gf.cost) for (var gk in gf.cost) if (Object.prototype.hasOwnProperty.call(gf.cost, gk)) gCost += gf.cost[gk] || 0;
		add("goldfish", gHold > 0, gHold, gHold ? { cost: gCost } : null);
		var tg = cleanDailyTask(body.dailyTask);
		add("dailyTask", !!tg, tg ? countTrue(tg) : 0, null);
		var ac = cleanAchv(body.achv);
		add("achv", !!ac, ac ? countTrue(ac) : 0, null);
		var cd = cleanCdk(body.cdkUsed);
		add("cdkUsed", !!(cd && cd.length), cd ? cd.length : 0, null);
		var lf = cleanLifetime(body.cdkLifetime);
		add("cdkLifetime", !!(lf && (lf.count || lf.gained)), lf ? lf.count : 0, lf ? { gained: lf.gained } : null);
		var lg = cleanLedger(body.ledger);
		add("ledger", !!(lg && lg.length), lg ? lg.length : 0, null);
		var hs = cleanHist(body.walletHist);
		add("walletHist", !!(hs && hs.length), hs ? hs.length : 0, null);
		add("walletSnap", !!body.walletSnap, 0, null);
		/* 历史最佳：三款游戏各一条纪录 */
		add("texasBest", !!body.texasBest, 0, null);
		add("bjBest", !!body.bjBest, 0, null);
		add("sniperBest", !!body.sniperBest, 0, null);
		var nm = cleanNames(body.names);
		add("names", !!nm, nm ? Object.keys(nm).length : 0, null);
		/* 设置类（跟着走，但不必计数） */
		add("panelSkin", body.panelSkin != null && body.panelSkin !== "", 0, null);
		add("bgmVolume", body.bgmVolume != null, 0, null);
		add("bgmOn", !!body.bgmOn, 0, null);
		add("sfxVolume", body.sfxVolume != null, 0, null);
		add("texasSet", !!body.texasSet, 0, null);
		add("bjSet", !!body.bjSet, 0, null);
		add("dbgPresets", !!(body.dbgPresets && body.dbgPresets.length), body.dbgPresets ? body.dbgPresets.length : 0, null);
		add("uiSeen", !!body.uiSeen, 0, null);
		var playerInteract = cleanPlayerInteract(body.playerInteract);
		add("playerInteract", !!playerInteract, playerInteract ? playerInteract.total : 0, null);
		var high = cleanRankHigh(body.rankHigh);
		add("rankHigh", !!high, high ? high.cby : 0, high ? { merit: high.merit } : null);
		var pool = cleanPoolAchv(body.poolAchv);
		add("poolAchv", !!pool, pool ? Object.keys(pool.got).length : 0, null);
		var pay = cleanPoolAchvPay(body.poolAchvPay);
		add("poolAchvPay", !!pay, pay ? Object.keys(pay.paid).length : 0, null);
		var resume = cleanStoreResume(body.storeResume);
		add("storeResume", !!resume, resume ? resume.done.length : 0, null);
		add("bounty", !!body.bounty, body.bounty ? 1 : 0, null);
		return rows;
	}
	/* 计数：清洗后的对象里"真值"的个数（每日任务用 {done:true} 之类，
	   成就用计数；两种口径都按"值不是 0/false/空"来数） */
	function countTrue(o) {
		var n = 0;
		if (!o || typeof o !== "object") return 0;
		for (var k in o) {
			if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
			var v = o[k];
			if (v === true || (typeof v === "number" && v > 0) || (typeof v === "string" && v)) n++;
		}
		return n;
	}

	/* 差异摘要（§J.4#5）—— v3 加了战绩/讨伐/羁绊三行，**只给"变了"的行**，
	   免得确认框上列 28 行让人直接点确定。 */
	function diffOf(clean) {
		var cur = collect();
		var cw = cleanWallet(cur.wallet) || { pc: 0 };
		var cr = cleanRank(cur.rank) || { rank: 0, merit: 0 };
		var out = {
			pc: { from: cw.pc, to: clean.wallet ? clean.wallet.pc : cw.pc },
			rank: { from: cr.rank, to: clean.rank ? clean.rank.rank : cr.rank },
			merit: { from: cr.merit, to: clean.rank ? clean.rank.merit : cr.merit },
		};
		var curWr = wrTotals(cleanWinrate(cur.winrate));
		var newWr = wrTotals(clean.winrate);
		if (newWr.games !== curWr.games) out.matches = { from: curWr.games, to: newWr.games };
		var curK = cleanFightMap((cleanBossKill(cur.bossKill) || {}).map, true);
		var newK = cleanFightMap((clean.bossKill || {}).map, true);
		var ckn = curK ? Object.keys(curK).length : 0, nkn = newK ? Object.keys(newK).length : 0;
		if (nkn !== ckn) out.kills = { from: ckn, to: nkn };
		var curG = cleanAffection(cur.affection), newG = clean.affection;
		var cgn = curG ? Object.keys(curG).length : 0, ngn = newG ? Object.keys(newG).length : 0;
		if (ngn !== cgn) out.girls = { from: cgn, to: ngn };
		return out;
	}

	/* 2026-09-29 修复（契约族实例 4）：
	   此前 `CSH.wallet.integrity` 指向不存在的字段（当年 wallet 的 integrity 挂在 CSH 顶层，
	   而 window.CSH 又被裸赋值清空）⇒ 导入存档后**不做完整性校验、内存对象不重载**，
	   余额要重启才生效。现改为依次尝试 `CSH.wallet.integrity` → `CSH.integrity`。 */
	function reloadWallet() {
		try {
			if (lib.cshWallet && typeof lib.cshWallet.reloadSave === "function") {
				lib.cshWallet.reloadSave(); return true;
			}
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
		if (marketBusy()) return { ok: false, err: "市场存档正在同步，请稍后重试" };
		return mutation(async function () {
			var stamp = pushBackup();
			await applyAll(ins.data, false);
			var reloaded = true; // commitPlan 已确认必要模块采用同一批存档。
			logMsg("导入已应用（备份 " + stamp + "，钱包重载 " + (reloaded ? "成功" : "已跳过") + "）");
			return { ok: true, applied: true, backup: stamp, diff: diff, summary: ins.summary, reloaded: reloaded };
		});
	}
	function marketBusy() {
		var market = lib.cshMarket;
		var W = lib.cshWallet && lib.cshWallet.wallet;
		return !!((market && market.pending && market.pending()) || (W && W.marketPending && W.marketPending()));
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

		/* ============================================================
		   v3（2026-10-15）新增用例：新键的清洗 / 后端 / 覆盖度
		   ============================================================ */
		/* ① 好感度：值钳到 AFF_MAX · 非法 saw 清空 · 非法记录丢弃 */
		var af = cleanAffection({
			a: { v: 9999, last: Date.now() + 86400000 * 30, saw: "乱码", giveSum: -5, giveN: 1e9, day: { talk: "2026-01-01" }, cnt: { x: 3 } },
			b: "not-an-object",
		});
		ok("好感度：值钳到 AFF_MAX", af && af.a.v === affMax());
		ok("好感度：非法 saw 清空", af && af.a.saw === "");
		ok("好感度：未来的 last 压回当下", af && af.a.last <= Date.now() + 1);
		ok("好感度：giveSum 钳到 ≥0", af && af.a.giveSum === 0);
		ok("好感度：非对象记录被丢", af && af.b === undefined);
		ok("好感度：只留 6 个日键", af && af.a.day && Object.keys(af.a.day).length === 1);

		/* ② 讨伐录：n≤0 丢弃 · best 保留 · ext/minions/extPool 分节 */
		var bk = cleanBossKill({
			map: { m1: { n: 3, first: 1, last: 2, best: 5 }, bad: { n: 0 }, bad2: "x" },
			ext: { e1: { n: 1 } },
			minions: { mn1: { n: 7, first: 1 } },
			extPool: { e1: { name: "甲", title: "", img: "a.webp", skillCount: 4, hp: 6, evil: "x" } },
			lastDaily: "2026-10-15",
		});
		ok("讨伐录：n≤0 被丢", bk && bk.map && !bk.map.bad && !bk.map.bad2);
		ok("讨伐录：best 保留", bk && bk.map.m1.best === 5);
		ok("讨伐录：ext 段保留", bk && bk.ext && bk.ext.e1.n === 1);
		ok("讨伐录：minions 段保留", bk && bk.minions && bk.minions.mn1.n === 7);
		ok("讨伐录：extPool 未知字段被剥", bk && bk.extPool && bk.extPool.e1.evil === undefined);

		/* ③ 扮演魔王：只 3 个字段 */
		var ab = cleanBossAsBoss({ win: -1, lose: 4, last: 1, x: 1 });
		ok("扮演魔王：win 钳到 0 · 只留 3 键", ab && ab.win === 0 && ab.lose === 4 && Object.keys(ab).length === 3);

		/* ④ 金鳞市：**价格不带走**（否则等于开天眼），持仓与成本带走 */
		var gf = cleanGoldfish({ dayNo: 3, prices: { a: 100 }, hold: { a: 2 }, cost: { a: 50 }, earned: -1, pendingDiv: -1 });
		ok("金鳞市：价格不带（防开天眼）", gf && gf.prices === undefined);
		ok("金鳞市：持仓与成本带", gf && gf.hold.a === 2 && gf.cost.a === 50);
		ok("金鳞市：负数收益钳到 0", gf && gf.earned === 0 && gf.pendingDiv === 0);

		/* ⑤ 账本：d=0 丢弃 · 条数上限 · 快照/台账走扁平清洗 */
		var lg = cleanLedger([{ t: 1, d: 0, r: "x" }, { t: 2, d: -5, r: "y", c: "c", b: 9 }, "bad"]);
		ok("账本：d=0 与非法条目被丢", lg && lg.length === 1 && lg[0].d === -5);
		ok("余额快照：只留原始值字段", (function () {
			var s = cleanSnap({ a: 1, b: "x", c: true, d: { deep: 1 } });
			return s && s.a === 1 && s.b === "x" && s.c === true && s.d === undefined;
		})());

		/* ⑥ 键族：UI 已阅 / 各处名字 */
		ok("UI 已阅：短字符串表", (function () { var m = cleanUiSeen({ bossbookSeen: "1" }); return m && m.bossbookSeen === "1"; })());
		ok("名字表：超长截断", (function () { var m = cleanNames({ netSig: new Array(80).join("字") }); return m && m.netSig.length <= 24; })());

		/* ⑦ 仅验证内存映射，不向真实宿主写自检临时数据。后端失败另有隔离探针。 */
		var TMP = "csh_mig_selftest_tmp";
		var beforeTmp = configMemory([{ key: TMP }]);
		applyConfigMemory([{ key: TMP, exists: true, value: { hello: 1 } }]);
		ok("lib.config 后端：写入后读取一致", (function () { var v = cfgGet(TMP); return v && v.hello === 1; })());
		applyConfigMemory(beforeTmp);

		/* ⑧ 覆盖度：白名单 = KEY_DEFS + meta（导出/解析同表，不可能一边多一边少）
		   ★ 数数：6 原 + 6 必须 + 7 建议 = 19 项（含 meta）⇒ KEY_DEFS 18 条；
		     v3 再补 9 条 ⇒ KEY_DEFS 27 条 / 白名单 28 项。 */
		ok("键表无重复逻辑域", new Set(KEY_DEFS.map(function (d) { return d[0]; })).size === KEY_DEFS.length);
		ok("白名单与键表一致（+meta）", WHITELIST.length === KEY_DEFS.length + 1 &&
			KEY_DEFS.every(function (d) { return WHITELIST.indexOf(d[0]) >= 0; }));

		/* ⑨ 家当清点：每域都有 key/has/n，顺序稳定 */
		var inv = inventory({
			wallet: { pc: 1234 }, rank: { rank: 3, merit: 99 },
			/* 真实形状：顶层是模式键，玩家自己那份在 me.chars */
			winrate: { identity: { 甲: { games: 20, win: 12, lose: 8 } }, me: { chars: { 甲: { games: 4, win: 3, lose: 1 } } } },
			affection: { g1: { v: 100 }, g2: { v: 0 } },
			bossKill: { map: { m1: { n: 1 } }, minions: { a: { n: 2 }, b: { n: 1 } } },
			goldfish: { hold: { x: 1 }, cost: { x: 20 } },
			names: { netName: "甲乙" },
		});
		var invMap = {};
		for (var q = 0; q < inv.length; q++) invMap[inv[q].key] = inv[q];
		ok("家当：钱包余额", invMap.wallet && invMap.wallet.has && invMap.wallet.n === 1234);
		ok("家当：官阶功勋", invMap.rank && invMap.rank.n === 99 && invMap.rank.extra.rank === 3);
		ok("家当：战绩场次（v3 修好后才非 0）", invMap.winrate && invMap.winrate.n === 4 && invMap.winrate.extra.win === 3);
		ok("家当：羁绊只数 + 满档数", invMap.affection && invMap.affection.n === 2 && invMap.affection.extra.full === 1);
		ok("家当：讨伐数 + 妖灵分节", invMap.bossKill && invMap.bossKill.n === 1 && invMap.bossKill.extra.minions === 2);
		ok("家当：持仓只数 + 成本", invMap.goldfish && invMap.goldfish.n === 1 && invMap.goldfish.extra.cost === 20);
		ok("家当：没数据的域 has=false", invMap.ledger && invMap.ledger.has === false);
		ok("家当：清点行数 = 全部域", inv.length === WHITELIST.length - 1);
		ok("家当：一个中文字都没有（文案归页面）", inv.every(function (r) { return /^[a-zA-Z]+$/.test(r.key); }));

		/* ⑩ 差异：只列"变了"的行，没变的不出现 */
		var dOnly = diffOf({ wallet: { pc: 5 } });
		ok("差异：有变化的给出 from/to", dOnly.pc && dOnly.pc.to === 5);

		var pass = out.filter(function (o) { return o.p; }).length;
		return { pass: pass, fail: out.length - pass, cases: out };
	}

	/* ---------- 导出接口 ---------- */
	var CM = {
		VERSION: VERSION, PREFIX: PREFIX, WHITELIST: WHITELIST, EXCLUDED: EXCLUDED,
		export: exportCode,
		inspect: inspect,
		import: doImport,
		backups: backups,
		rollback: rollback,
		reset: reset,
		recover: recover,
		recoveryState: recoveryState,
		summary: summaryOf,
		diff: diffOf,
		inventory: inventory,
		_collect: collect,
		_clean: {
			wallet: cleanWallet, rank: cleanRank, world: cleanWorld, cdk: cleanCdk, winrate: cleanWinrate,
			dailyTask: cleanDailyTask, achv: cleanAchv, obj: cleanObj, num: cleanNum, str: cleanStr,
			bgmOn: cleanBgmOn, lifetime: cleanLifetime, arr: cleanArr,
			affection: cleanAffection, bossKill: cleanBossKill, bossAsBoss: cleanBossAsBoss,
			goldfish: cleanGoldfish, ledger: cleanLedger, hist: cleanHist, snap: cleanSnap,
			uiSeen: cleanUiSeen, names: cleanNames,
		},
		_wrTotals: wrTotals,
		_countTrue: countTrue,
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
