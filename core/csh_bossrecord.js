/* ============================================================
   池子魔将 · 讨伐记录层（批次 4a/4d · 2026-10-13）
   ------------------------------------------------------------
   唯一数据源（三处共用，防两套口径 · 设计定稿 §6.4）：
     · 对局侧写入：skills/boss.js 的 csh_boss_watch（魔王阵亡 → record）
     · 快照聚合：  core/csh_shell.js buildStats → summary()
     · 讨伐录展示：games/bossbook.html（桥 shell-stats + 父窗兜底 summary）
   ★ 存储 = lib.config["extension_池子魔将_bossKill"]（game.saveConfig 范式
     同 winrateData，随无名杀存档持久化）——无新增 localStorage / 无新桥命令。
   ★ 经济层（4d）天然幂等：首杀 = n===1 一生只发生一次；每日 = 按日键一天一笔
     ——重复击破只增计数不发钱。入账走 csh_wallet 单一账本。
   ★ 数值单点（§6.7）：REWARD_FIRST / REWARD_DAILY 实机校准只改这里。
   ============================================================ */
import { lib, game, _status } from "../../../noname.js";
import { allBossIds, allMinionIds, tierOf, seriesOf, SERIES, MINIONS, MINION_NAMES,
	difficultyOf, diffBandOf, difficultyOfForeign } from "./csh_bossdata.js";

const KEY = "extension_池子魔将_bossKill";
/* v4.2：扮演魔王（应战模式）战绩单点 */
const KEY_ASBOSS = "extension_池子魔将_bossAsBoss";

/* 奖励数值单点（CBY）：首杀一次性 / 每日首战（一天一笔） */
export const REWARD_FIRST = { elite: 500, lord: 1200, ultimate: 3000, egg: 800 };
export const REWARD_DAILY = { elite: 200, lord: 400, ultimate: 800, egg: 300 };

/* ---------- v6.2【妖灵讨伐收益】（作者定案：2026-10-14 立 · 2026-10-15 二轮修正 · 2026-10-16 三轮修正）
   "讨伐妖灵也应有收益——结算时不管输赢，按被讨伐次数给、重复挑战也能给；
   CBY + 功勋 + 永久加成（加成给少一点）"（原始语录中"CBY 普遍五位数"一句已被三轮修正作废）。
   ★ v6.2 修正（作者 2026-10-15）：① 金额 15000 → 10000；
     ② **取消同局去重** —— "妖灵收益不再去重"（v6.1 曾按本局魔王对象去重）。
     语义回到"每击破一只就结算一次"。
   ★ 三轮修正（作者 2026-10-16 · 两场景两值）：**挑战者击破 = MINION_CBY 3000**；
     **作为 BOSS 应战（game.me === game.boss，自家妖灵被挑战者击破）= MINION_CBY_ASBOSS 1000**。
     术语同步统一「妖灵」（旧称弃用，见 CHANGELOG 九十五）。
   ★ 四轮修正（作者 2026-10-16 晚 · CHANGELOG 九十六）：**两值统一 800**
     （作者原话："3000 和 1000 有点多，统一改成 800"）——两场景的分流结构与日志标注保留
     （挑战者/应战仍分开记），数值单点仍是这两个常量。 */
export const MINION_CBY = 800;                   /* 挑战者击破妖灵的 CBY（2026-10-16 四改：10000 → 3000 → 800 · 单点可调） */
export const MINION_CBY_ASBOSS = 800;            /* 作为 BOSS 应战时（自家妖灵被击破）的 CBY（2026-10-16 四改：1000 → 800） */

/* ---------- 指定讨伐令（2026-10-17 · 作者拍板 A 方案：1000 CBY 指定一只未讨伐妖灵出战） ----------
   存档键 = lib.config 的 extension_池子魔将_csh_bounty（**玩家数据** → 已入 csh_migrate 键表 / 行囊）。
   ★ 三条纪律（作者担心「强制出战出 BUG」，故把风险关在最小范围）：
     · 读侧一律经 bountyGet()：**池外 id 或已讨伐 → 一律视为「没有悬赏」**（脏数据绝不改变出怪）；
     · 写侧 bountySet() 只接受**池内 + 未讨伐**的 id（非法直接拒，钱不会白扣）；
     · 达成即消费：recordMinion 里发现命中的就是悬赏目标 → 立即清空标记（不会粘住下一次）。
   注意：判定"已讨伐"用的是 summary().minions[id].n，与讨伐录同源，不另立一份账。 */
const KEY_BOUNTY = "extension_池子魔将_csh_bounty";
export const BOUNTY_COST = 1000;                 /* 单点价格（作者定：1000 CBY 一次） */
function bountyRaw() {
	try { return String((lib.config && lib.config[KEY_BOUNTY]) || ""); } catch (e) { return ""; }
}
export function bountyCheck(id) {
	id = String(id || "");
	if (allMinionIds().indexOf(id) < 0) return { ok: false, reason: "unknown" };
	try {
		const sm = summary();
		if (sm && sm.minions && sm.minions[id] && sm.minions[id].n > 0) return { ok: false, reason: "hunted" };
	} catch (e) { /* 读取异常按"可下单"处理，由 bountySet 再兜一次 */ }
	return { ok: true, id: id };
}
export function bountyGet() {
	const id = bountyRaw();
	if (!id) return "";
	return bountyCheck(id).ok ? id : "";
}
export function bountySet(id) {
	const chk = bountyCheck(id);
	if (!chk.ok) return chk;
	try { game.saveConfig(KEY_BOUNTY, chk.id); return { ok: true, id: chk.id }; }
	catch (e) { return { ok: false, reason: "error" }; }
}
export function bountyClear() {
	try { game.saveConfig(KEY_BOUNTY, ""); return true; } catch (e) { return false; }
}
export const MINION_MERIT = 25;                  /* 每只妖灵的功勋（官阶线 · 日软上限内自然衰减） */
export const MINION_HEAT = { first: 1.5, repeat: 0.3, cap: 50 };  /* 金鳞市基本面加成（%）：
                                                    首次 +1.5% / 重复 +0.3% 每次 / 软上限 +50% */

/* ---------- 存储读写（winrateData 范式：读即清洗，写走 saveConfig） ---------- */
function readStore() {
	let s = null;
	try { s = lib.config[KEY]; } catch (e0) {}
	if (!s || typeof s !== "object") s = {};
	if (!s.map || typeof s.map !== "object") s.map = {};
	for (const k of Object.keys(s.map)) {
		const e = s.map[k];
		if (!e || typeof e !== "object" || typeof e.n !== "number" || !isFinite(e.n) || e.n <= 0) {
			delete s.map[k]; continue;
		}
		if (!e.first) e.first = e.last || 0;
		if (!e.last) e.last = e.first;
		/* v4.2 速通：best = 最快击破轮数（负数/非数清洗掉） */
		if (e.best != null && (typeof e.best !== "number" || !isFinite(e.best) || e.best <= 0)) delete e.best;
	}
	/* 外传段（批次 A · 2026-10-14）：非池子魔将的 isBoss 击破，独立于 s.map，
	   与魔王进度互不污染——清洗范式与 map 完全一致（n 非法则删 / first/last 补全 / best 非法则删）。 */
	if (!s.ext || typeof s.ext !== "object") s.ext = {};
	for (const k of Object.keys(s.ext)) {
		const e = s.ext[k];
		if (!e || typeof e !== "object" || typeof e.n !== "number" || !isFinite(e.n) || e.n <= 0) {
			delete s.ext[k]; continue;
		}
		if (!e.first) e.first = e.last || 0;
		if (!e.last) e.last = e.first;
		if (e.best != null && (typeof e.best !== "number" || !isFinite(e.best) || e.best <= 0)) delete e.best;
	}
	/* 外传名册快照段（批次 A · 池子休闲里 lib.character 不含本体 BOSS，必须靠 boss 局内快照兜底） */
	if (!s.extPool || typeof s.extPool !== "object") s.extPool = {};
	for (const k of Object.keys(s.extPool)) {
		const e = s.extPool[k];
		if (!e || typeof e !== "object") { delete s.extPool[k]; continue; }
		e.img = typeof e.img === "string" ? e.img : "";
		e.name = typeof e.name === "string" ? e.name : "";
		e.title = typeof e.title === "string" ? e.title : "";
		if (typeof e.skillCount !== "number" || !isFinite(e.skillCount) || e.skillCount < 0) e.skillCount = 0;
		/* v6.1：体力（难度打分输入）——旧档没有就补 0（读取侧按 4 估算兜底） */
		if (typeof e.hp !== "number" || !isFinite(e.hp) || e.hp < 0) e.hp = 0;
	}
	if (s.lastDaily != null && typeof s.lastDaily !== "string") delete s.lastDaily;
	/* v5.3 妖灵讨伐段（独立于魔王 map · 不污染 summary 的 93 进度） */
	if (!s.minions || typeof s.minions !== "object") s.minions = {};
	for (const k of Object.keys(s.minions)) {
		const e = s.minions[k];
		if (!e || typeof e !== "object" || typeof e.n !== "number" || !isFinite(e.n) || e.n <= 0) {
			delete s.minions[k]; continue;
		}
		if (!e.first) e.first = e.last || 0;
		if (!e.last) e.last = e.first;
	}
	return s;
}

function writeStore(s) {
	try {
		lib.config[KEY] = s;
		if (game && typeof game.saveConfig === "function") game.saveConfig(KEY, s);
	} catch (eW) {
		console.warn("[池子魔将] 讨伐存档写入异常", eW);
	}
}

function killCount(s) {
	let n = 0;
	for (const k in s.map) if (s.map[k] && s.map[k].n > 0) n++;
	return n;
}

function dayKey() {
	const d = new Date();
	return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

/* ---------- 核心：记录一次击破（由 csh_boss_watch 在对局侧调用） ----------
   阵营判定已在 watch.filter 完成（魔王阵亡 + 玩家为挑战者方）——本函数不重复判。 */
export function record(bossId, opts) {
	try {
		if (typeof bossId !== "string" || bossId.indexOf("csh_boss_") !== 0) return null;
		const orig = "csh_" + bossId.slice(9);
		/* ★ 2026-10-14 审计修复（真 BUG）：原写法 `const tier = tierOf(orig); if (!tierOf(orig)) return null;`
		   —— `tierOf()` 内部是 `ID2TIER[id] || "elite"`，**恒返回真值**（精英兜底），
		   所以这行校验是**死代码**：任何 `csh_boss_*` 形状的字符串（哪怕不在名册里）
		   都能写进存档并拿到精英档奖励。改为对名册真值白名单校验。 */
		if (allBossIds().indexOf(bossId) < 0) return null;
		const tier = tierOf(orig);
		if (!tier) return null;

		const s = readStore();
		const e = s.map[bossId] || (s.map[bossId] = { n: 0 });
		e.n++;
		e.last = Date.now();
		if (!e.first) e.first = e.last;
		/* v4.2 速通排行：记录最快击破轮数（讨伐录展示 + 速通成就） */
		if (opts && typeof opts.round === "number" && opts.round > 0) {
			if (typeof e.best !== "number" || opts.round < e.best) e.best = opts.round;
		}
		writeStore(s);

		const total = killCount(s);
		const name = (lib.translate && (lib.translate[bossId] || lib.translate[orig])) || orig;
		try {
			const rTxt = (typeof e.best === "number") ? " · 最快 " + e.best + " 轮" : "";
			if (e.n === 1) game.log("新的讨伐记录：" + name + "！讨伐录已更新 · 第 " + total + " / " + allBossIds().length + " 位" + rTxt);
			else game.log("讨伐录已更新 · 第 " + total + " / " + allBossIds().length + " 位（" + name + " · " + e.n + " 讨）" + rTxt);
		} catch (eL) {}

		/* ---------- 经济层（4d）：首杀一次性 + 每日首战（天然幂等） ---------- */
		try {
			const wallet = lib.cshWallet && lib.cshWallet.wallet;
			if (wallet && typeof wallet.add === "function") {
				if (e.n === 1 && REWARD_FIRST[tier]) {
					wallet.add(REWARD_FIRST[tier], "讨伐首杀:" + name);
					game.log("首杀奖励 +" + REWARD_FIRST[tier] + " CBY");
				}
				const day = dayKey();
				if (s.lastDaily !== day && REWARD_DAILY[tier]) {
					s.lastDaily = day;
					writeStore(s);
					wallet.add(REWARD_DAILY[tier], "每日首战:" + name);
					game.log("每日首战奖励 +" + REWARD_DAILY[tier] + " CBY");
				}
			}
		} catch (ePay) {
			console.warn("[池子魔将] 讨伐奖励入账异常", ePay);
		}
		return { total: total, entry: e, tier: tier };
	} catch (eR) {
		console.warn("[池子魔将] 讨伐记录异常", eR);
		return null;
	}
}

/* ---------- v4.2：扮演魔王（应战模式）战绩 ----------
   作者定案："趣味性的操纵魔王的战绩也可以挂上去"。
   判负 = 玩家即魔王且魔王死亡；判胜 = 玩家即魔王且最后一名挑战者倒下。
   由 skills/boss.js 的 csh_boss_watch / csh_boss_watch2 在 dieAfter 时机调用。 */
function readAsBoss() {
	let o = null;
	try { o = lib.config[KEY_ASBOSS]; } catch (e0) {}
	if (!o || typeof o !== "object") o = {};
	if (typeof o.win !== "number" || !isFinite(o.win) || o.win < 0) o.win = 0;
	if (typeof o.lose !== "number" || !isFinite(o.lose) || o.lose < 0) o.lose = 0;
	return o;
}
export function recordAsBoss(win) {
	try {
		const o = readAsBoss();
		if (win) o.win++; else o.lose++;
		o.last = Date.now();
		try {
			lib.config[KEY_ASBOSS] = o;
			if (game && typeof game.saveConfig === "function") game.saveConfig(KEY_ASBOSS, o);
		} catch (eW) {
			console.warn("[池子魔将] 应战战绩写入异常", eW);
		}
		return o;
	} catch (e) {
		console.warn("[池子魔将] 应战战绩异常", e);
		return null;
	}
}

/* ---------- 妖灵讨伐（击破即时结算 · 不管输赢 · 重复可得） ----------
   由 csh_boss_watch 在 dieAfter 分支调用（妖灵阵亡即结算——不必等对局结束，
   输了也留住已得收益）。三重发放全部走既有单一账本：
     CBY  → lib.cshWallet.wallet.add（钱包 · 与魔王讨伐同通路；金额按场景二分）
     功勋 → lib.cshWallet.rank.addMerit（官阶线 · 其内置日软上限自动保护）
     加成 → 不发放，记次数 n；金鳞市批次用 minionHeat() 读基本面。
   ★ v6.2：**不做同局去重**（作者："妖灵收益不再去重"）——
     每次击破都结算；妖灵随【重整】复活后再次击破同样计收益。
   ★ 2026-10-16 三轮修正（作者拍板 · 两场景两值）；四轮修正（当晚）**两值统一 800**：
     · 玩家为**挑战者**（game.me !== game.boss）→ MINION_CBY（800）；
     · 玩家为**魔王**（应战模式，game.me === game.boss，自家妖灵被挑战者击破）
       → MINION_CBY_ASBOSS（800）。场景由调用方经 opts.asBoss 传入（日志据此标注）。 */
export function recordMinion(minionId, opts) {
	try {
		if (typeof minionId !== "string" || minionId.indexOf("csh_boss_minion_") !== 0) return null;
		/* 白名单校验（同上：前缀判断不足以防脏数据/伪造 id 进存档） */
		if (!Object.prototype.hasOwnProperty.call(MINIONS, minionId)) return null;
		const asBoss = !!(opts && opts.asBoss);          /* 应战场景标记（由 csh_boss_watch 判定传入） */
		const amt = asBoss ? MINION_CBY_ASBOSS : MINION_CBY;
		const s = readStore();
		const e = s.minions[minionId] || (s.minions[minionId] = { n: 0 });
		e.n++;
		e.last = Date.now();
		if (!e.first) e.first = e.last;
		writeStore(s);

		/* v6.7：数据层真源优先（MINION_NAMES 零时序依赖）→ lib.translate 兜底。
		   旧写法把 lib.translate 放在第一顺位 ⇒ 角色包未加载时日志/结算显示原始 id。 */
		const name = MINION_NAMES[minionId] || (lib.translate && lib.translate[minionId]) || minionId;
		const heatAdd = e.n === 1 ? MINION_HEAT.first : MINION_HEAT.repeat;
		try {
			const wallet = lib.cshWallet && lib.cshWallet.wallet;
			if (wallet && typeof wallet.add === "function") wallet.add(amt, "讨伐妖灵:" + name);
		} catch (eW) {}
		try {
			const rank = lib.cshWallet && lib.cshWallet.rank;
			if (rank && typeof rank.addMerit === "function") rank.addMerit(MINION_MERIT, "讨伐妖灵");
		} catch (eM) {}
		try {
			game.log("妖灵讨伐" + (asBoss ? "（应战）" : "") + "：" + name + " ×" + e.n + " —— CBY +" + amt +
				" · 功勋 +" + MINION_MERIT + " · 金鳞市热度 +" + heatAdd + "%");
		} catch (eL) {}
		/* v6.2 好感度：讨伐她 → 她记住你这一战（+6，同一只每天一次；模块缺失时零副作用） */
		try {
			if (lib.cshAffection && typeof lib.cshAffection.noteHunt === "function") {
				lib.cshAffection.noteHunt(minionId);
			}
		} catch (eA) {}
		/* 指定讨伐令：目标达成即消费（清空悬赏标记 —— 用**原始存档值**比对，不能用 bountyGet，
		   因为此时 e.n 刚 ++，bountyGet 已把"已讨伐"目标过滤成空串了） */
		try { if (bountyRaw() === minionId) bountyClear(); } catch (eBO) {}
		return { n: e.n, cby: amt, merit: MINION_MERIT, heat: heatAdd, asBoss: asBoss };
	} catch (e) {
		console.warn("[池子魔将] 妖灵讨伐收益异常", e);
		return null;
	}
}
/* 金鳞市基本面加成（%，批次 B 读取）：0 = 无记录；由 n 推算（首破 first + 重复 repeat×次数） */
export function minionHeat(minionId) {
	try {
		const s = readStore();
		const e = s.minions && s.minions[minionId];
		const n = (e && e.n > 0) ? e.n : 0;
		if (!n) return 0;
		return Math.min(MINION_HEAT.cap, MINION_HEAT.first + (n - 1) * MINION_HEAT.repeat);
	} catch (e) { return 0; }
}

/* ---------- 外传（批次 A · 2026-10-14） ----------
   「讨伐录 · 外传卷」收录**非池子魔将**的 BOSS 级角色：lib.character 中 isBoss === true
   且 id 不以 csh_ 开头的条目（本体挑战模式 BOSS 如 boss_* 系列 + 他扩展注册的 isBoss）。
   ★ 动态枚举（零硬编码）+ 独立存储段 s.ext（不并入 93 位主进度）。
   ★ 收录通道：本体 BOSS 条目上没有我们的技能，其阵亡只能靠全局技
     skills/boss.js 的 csh_boss_watch_ext（lib.skill.global 登记）捕获 → recordExt。 */

/* 称号清洗（引擎/十周年UI 风格 HTML → 纯文本）：与 bossbook.html 的 cleanTitle 同范式。
   为什么在本模块也要有一份：extRoster 是数据层，页面（iframe 内）无法 import 模块，
   经桥透传的 roster.title 若带源码标签会污染页面渲染——在源头清洗最稳。 */
function cleanTitleHtml(s) {
	return String(s == null ? "" : s)
		.replace(/<br\s*\/?>/gi, " ")
		.replace(/<\/(i|b|span|em|strong)>/gi, " ")
		.replace(/<[^>]*>/g, "")
		.replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
		.replace(/\s+/g, " ")
		.trim();
}

/* isBoss 判定（对象形态直读；数组形态读 ch[4] 标签数组——引擎 loading.js:251 /
   character.js:385 setPropertiesFromTrash 的 `boss` / `hiddenboss` 约定）。 */
function isBossChar(ch) {
	if (!ch) return false;
	if (ch.isBoss === true || ch.isHiddenBoss === true) return true;
	const a4 = ch[4];
	if (Array.isArray(a4)) return a4.includes("boss") || a4.includes("hiddenboss");
	return false;
}

/* 立绘路径推导（无名杀**根相对**，页面负责加 ../../../ 前缀）。
   引擎约定（init/loading.js + init/polyfill.js）：
     · 对象形态角色：`ch.img` 由引擎/扩展写入（他扩展 → extension/<ext>/<id>.jpg）
     · 数组形态角色：`ch[4]` 存图（字符串主名，或 ["img:..."] 标签数组）
     · mode 包角色（本体挑战 BOSS = mode_boss）：条目**无 img 字段**，由模式推导
       image/mode/<mode>/character/<id>.jpg。 */
function deriveImg(id, ch) {
	try {
		if (ch && typeof ch.img === "string" && ch.img) return ch.img;
		var a4 = ch && ch[4];
		if (typeof a4 === "string" && a4) return a4;
		if (Array.isArray(a4)) {
			for (var i = 0; i < a4.length; i++) {
				var it = a4[i];
				if (typeof it !== "string") continue;
				if (it.indexOf("img:") === 0) return it.slice(4);
				if (/^(?:ext|extension|db):/.test(it)) return it;
			}
		}
		var packs = (lib && lib.characterPack) || null;
		if (packs) {
			if (packs.mode_boss && packs.mode_boss[id]) return "image/mode/boss/character/" + id + ".jpg";
			for (var pk in packs) {
				if (packs[pk] && packs[pk][id]) {
					if (/^mode_/.test(pk)) return "image/mode/" + pk.slice(5) + "/character/" + id + ".jpg";
					return "extension/" + pk + "/" + id + ".jpg";
				}
			}
		}
	} catch (eD) {}
	return "";
}

/* 动态枚举外传名册：isBoss 且 id 非 csh_ 前缀；按 id 升序（稳定）。 */
export function extRoster() {
	try {
		const map = (lib && lib.character) || null;
		if (!map) return [];
		const out = [];
		for (const id of Object.keys(map)) {
			const ch = map[id];
			if (!isBossChar(ch)) continue;
			if (/^csh_/.test(id)) continue;                       /* 池子魔将自家魔王 / 妖灵 → 走主进度 */
			const skN = ((ch && ch.skills) || (Array.isArray(ch && ch[3]) ? ch[3] : [])).length;
			/* v6.1：体力（对象形态 ch.hp / 数组形态 ch[2]；本体挑战 BOSS 多为模式内赋值，
			   拿不到就按 4 估算）——供难度打分使用。 */
			let hp = 0;
			if (ch && typeof ch.hp === "number" && ch.hp > 0) hp = ch.hp;
			else if (Array.isArray(ch) && typeof ch[2] === "number" && ch[2] > 0) hp = ch[2];
			const diff = difficultyOfForeign(hp, skN);
			out.push({
				id: id,
				name: (lib.translate && lib.translate[id]) || (ch && ch.name) || id,
				title: cleanTitleHtml((lib.characterTitle && lib.characterTitle[id]) || ""),
				img: deriveImg(id, ch),                            /* 根相对（页面加 ../../../ 前缀） */
				skillCount: skN,
				hp: hp,
				diff: diff, diffKey: diffBandOf(diff).key, diffName: diffBandOf(diff).name,
			});
		}
		out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
		return out;
	} catch (e) {
		return [];
	}
}

/* 记录一次外传击破（由 csh_boss_watch_ext 在对局侧调用）。
   ★ 拒绝 csh_boss_ 前缀——那是池子魔将魔王通道（record()），两条通道互斥不串味。 */export function recordExt(id, opts) {
	try {
		if (typeof id !== "string" || id.length === 0 || id.length >= 64) return null;
		if (id.indexOf("csh_boss_") === 0) return null;          /* 魔王通道，不走外传 */
		const s = readStore();
		const e = s.ext[id] || (s.ext[id] = { n: 0 });
		e.n++;
		e.last = Date.now();
		if (!e.first) e.first = e.last;
		/* 速通：最快击破轮数（取更小） */
		if (opts && typeof opts.round === "number" && opts.round > 0) {
			if (typeof e.best !== "number" || opts.round < e.best) e.best = opts.round;
		}
		writeStore(s);
		const name = (lib.translate && lib.translate[id]) || id;
		try {
			const rTxt = (typeof e.best === "number") ? " · 最快 " + e.best + " 轮" : "";
			game.log("外传记录：" + name + " · 第 " + e.n + " 次击破" + rTxt);
		} catch (eL) {}
		return { n: e.n, entry: e };
	} catch (eR) {
		console.warn("[池子魔将] 外传记录异常", eR);
		return null;
	}
}

/* ---------- 外传名册快照 + 跨模式合并（批次 A · QA 补） ----------
   ★ 为什么需要：`lib.character` 里含本体挑战 BOSS 的**唯一时刻是 boss 模式内**
     （mode/boss.js start(): `lib.character[i] = lib.characterPack.mode_boss[i]`；
     本体"把挑战武将加入其它模式"选项默认关闭 time out 后不常驻）。
     而讨伐录是在**池子休闲**里打开的 → 当场动态枚举恒为空 → 外传卷永远显示空态
     （即使刚刚击破过本体 BOSS）。故：boss 局内快照名册落 s.extPool，页面侧合并三源。 */

/* 在 boss 模式内快照外传名册（幂等覆盖 · 由 lib.cshBossRecord.snapshotExt 调用）。 */
export function snapshotExt() {
	try {
		const list = extRoster();
		if (!list.length) return 0;
		const s = readStore();
		for (const r of list) {
			s.extPool[r.id] = {
				name: r.name, title: r.title, img: r.img, skillCount: r.skillCount,
				hp: r.hp, diff: r.diff, diffKey: r.diffKey, diffName: r.diffName,
			};
		}
		writeStore(s);
		return list.length;
	} catch (eS) {
		return 0;
	}
}

/* 跨模式外传名册：三源合并（后写覆盖前写）
     ① s.extPool —— boss 局内快照（含 name/title/img，跨模式常驻）
     ② 当场动态枚举 extRoster()（boss 模式下含最新数据；非 boss 模式通常为空）
     ③ s.ext 已记录 id（历史战绩兜底——即便上面两源都没有也要显示"我讨伐过谁"）
   按 id 升序输出（与 extRoster 同口径）。 */
export function extRosterAll() {
	const s = readStore();
	var map = {};
	for (var pid in s.extPool) {
		var p = s.extPool[pid];
		if (!p) continue;
		var pd = (typeof p.diff === "number") ? p.diff : difficultyOfForeign(p.hp, p.skillCount);
		map[pid] = {
			id: pid, name: p.name || pid, title: p.title || "", img: p.img || "",
			skillCount: p.skillCount || 0, hp: p.hp || 0,
			diff: pd, diffKey: diffBandOf(pd).key, diffName: diffBandOf(pd).name,
		};
	}
	try {
		for (const r of extRoster()) map[r.id] = r;
	} catch (eE) {}
	for (const rid in s.ext) {
		if (map[rid]) continue;
		var rhp = 0, rskN = 0;
		var rch = (lib.character && lib.character[rid]) || null;
		if (rch && typeof rch.hp === "number" && rch.hp > 0) rhp = rch.hp;
		else if (Array.isArray(rch) && typeof rch[2] === "number" && rch[2] > 0) rhp = rch[2];
		rskN = ((rch && rch.skills) || (Array.isArray(rch && rch[3]) ? rch[3] : [])).length;
		var rd = difficultyOfForeign(rhp, rskN);
		map[rid] = {
			id: rid,
			name: (lib.translate && lib.translate[rid]) || rid,
			title: cleanTitleHtml((lib.characterTitle && lib.characterTitle[rid]) || ""),
			img: deriveImg(rid, rch),
			skillCount: rskN, hp: rhp,
			diff: rd, diffKey: diffBandOf(rd).key, diffName: diffBandOf(rd).name,
		};
	}
	const out = [];
	for (const k2 in map) out.push(map[k2]);
	out.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
	return out;
}

/* ---------- 聚合：summary（buildStats / bossbook 页共用） ----------
   roster 全量目录（含立绘名/档位/系列/技能数）+ 击破明细 map + 各层计数。
   ★ series 键输出**无 csh_ 前缀**（cuifeng/zhoutian/…）——与 bossbook 页的系列表契约对齐；
     name 优先原角色译名（干净名，不带档位前缀——档位由 tier 字段驱动页面角标）。
   ★ v4：同时输出 total / totalUlt / totalLord / totalEgg / totalElite / seriesTotal
     （档位与系列总量，动态随 allBossIds 变化）——供成就阈值与页面文案读取，
     避免"99 位"之类硬编码在名单变动后失真（成就从此数学上恒可达）。 */
export function summary() {
	const s = readStore();
	const map = s.map;
	let kill = 0, killUlt = 0, killLord = 0, killEgg = 0, killElite = 0;
	let total = 0, totalUlt = 0, totalLord = 0, totalEgg = 0, totalElite = 0;
	const series = {};
	const seriesTotal = {};
	for (const sk in SERIES) {
		const key = sk.replace(/^csh_/, "");
		series[key] = 0;
		seriesTotal[key] = 0;
	}
	const roster = [];
	for (const bid of allBossIds()) {
		const orig = "csh_" + bid.slice(9);
		const tier = tierOf(orig);
		const skRaw = seriesOf(orig);
		const sk = skRaw ? skRaw.replace(/^csh_/, "") : null;
		/* 总量（无论是否已讨） */
		total++;
		if (sk && seriesTotal[sk] != null) seriesTotal[sk]++;
		if (tier === "ultimate") totalUlt++;
		else if (tier === "lord") totalLord++;
		else if (tier === "egg") totalEgg++;
		else totalElite++;
		const e = map[bid];
		if (e && e.n > 0) {
			kill++;
			if (sk && series[sk] != null) series[sk]++;
			if (tier === "ultimate") killUlt++;
			else if (tier === "lord") killLord++;
			else if (tier === "egg") killEgg++;
			else killElite++;
		}
		const ch = (lib.character && lib.character[orig]) || null;
		/* v6.1 难度分（百分制）：纯函数派生自档位/血量/重整/妖灵/技数，
		   页面只读不重算。base = 原角色基础技数（拿不到就取经验中位数 4）。 */
		const baseSk = (ch && Array.isArray(ch.skills)) ? ch.skills.length : null;
		const diff = difficultyOf(orig, baseSk);
		/* name/title 兜底走原角色键：非 boss 模式下 bossmode 未注入 csh_boss_* 键，
		   但原角色名/称号常驻（lib.translate[csh_x] 来自扩展包 translate，恒可用）。
		   img 取**文件主名**（csh_ae）——bossbook 按 ../image/<主名>.webp 拼接。 */
		const fullName = (ch && ch.img) || "";
		roster.push({
			id: bid,
			img: fullName ? fullName.replace(/^.*\//, "").replace(/\.(webp|jpg|jpeg|png|svg)$/i, "") : orig,
			name: (lib.translate && (lib.translate[orig] || lib.translate[bid])) || orig,
			title: (lib.characterTitle && (lib.characterTitle[orig] || lib.characterTitle[bid])) || "",
			tier: tier,
			series: sk,
			skillCount: (ch && Array.isArray(ch.skills)) ? ch.skills.length : 0,
			/* v6.1 难度（百分制 + 分档文案） */
			diff: diff, diffKey: diffBandOf(diff).key, diffName: diffBandOf(diff).name,
			/* v4.2 速通：最快击破轮数（未讨/无记录 = null） */
			best: (e && typeof e.best === "number") ? e.best : null,
			/* v4.2：讨伐次数（页面"n 讨"与排行可用） */
			n: (e && e.n > 0) ? e.n : 0,
		});
	}
	/* v4.2 速通：各档最快击破轮数（含只统计已讨伐且有记录的） */
	const speed = { ultimate: null, lord: null, egg: null, elite: null, all: null };
	for (const r of roster) {
		if (typeof r.best !== "number") continue;
		if (speed[r.tier] == null || r.best < speed[r.tier]) speed[r.tier] = r.best;
		if (speed.all == null || r.best < speed.all) speed.all = r.best;
	}
	/* v5.3 妖灵讨伐统计（总次数 + 逐只次数/热度/名） */
	let minionKill = 0;
	const minionMap = {};
	for (const mid in s.minions) {
		const e3 = s.minions[mid];
		if (e3 && e3.n > 0) {
			minionKill += e3.n;
			minionMap[mid] = {
				n: e3.n,
				heat: minionHeat(mid),
				/* v6.7：数据层真源优先 —— summary().minions[id].name 是页面的第一顺位，
				   这里漏写 ⇒ 图鉴整页回退成 id（见 core/csh_bossdata.js MINION_NAMES 注释）。 */
				name: MINION_NAMES[mid] || (lib.translate && lib.translate[mid]) || mid,
			};
		}
	}
	/* 外传击破计数（n>0 的外传数 · 与主进度 kill 完全独立） */
	let extKill = 0;
	for (const eid in s.ext) {
		const e4 = s.ext[eid];
		if (e4 && e4.n > 0) extKill++;
	}
	/* ★ 2026-10-16 深夜（作者实机："外传里面有很多本体BOSS，但是外传显示 0/1"）：
	   外传系列 = 名册乱入者（平凡之人）+ **异界来客（动态名册）**。此前 series/seriesTotal
	   只数名册里的 1 位 ⇒ 序页"外传 0/1"、成就"外传全讨"分母=1，与卷八的 78 位完全不匹配。 */
	if (seriesTotal["qunyou_lunwai"] != null) {
		series["qunyou_lunwai"] += extKill;
		seriesTotal["qunyou_lunwai"] += extRosterAll().length;
	}
	return {
		kill: kill, killUlt: killUlt, killLord: killLord, killEgg: killEgg, killElite: killElite,
		total: total, totalUlt: totalUlt, totalLord: totalLord, totalEgg: totalEgg, totalElite: totalElite,
		series: series, seriesTotal: seriesTotal,
		roster: roster,
		map: JSON.parse(JSON.stringify(map)),
		speed: speed,
		asBoss: readAsBoss(),
		/* v5.3 妖灵讨伐统计（总次数 + 逐只次数/热度）——讨伐录妖灵段与调试面板共用 */
		minionKill: minionKill,
		minions: minionMap,
		minionHeatCfg: MINION_HEAT,
		lastDaily: s.lastDaily || null,
		/* 外传（批次 A）：击破明细深拷贝 + 已讨外传数 + 外传总量（动态枚举） */
		ext: JSON.parse(JSON.stringify(s.ext)),
		extKill: extKill,
		extTotal: extRosterAll().length,
	};
}

/* ---------- 安装（main/content.js 调用；幂等） ---------- */
/* ---------- ★★ 对局收尾记录（2026-10-16 晚 · 第四批根因修复） ----------
   根因（引擎级逐环复核 + 作者实机"BOSS 仍然不计入统计"复现）：
     讨伐记录挂在 dieAfter —— 它是 die 事件的 **After 阶段**
     （引擎 `gameEvent.js` 的 `loop()`：`trigger("After", 4)` → `this.trigger(this.name + "After")`）。
     而"击破魔王 / 应战负 / 应战胜"这三种**该记录**的死亡，都会在**同一死亡事件的更早步骤**里
     触发模式结算：`mode/boss.js` 的 `element.player.dieAfter`（die content step 2）
     → `game.checkResult()` → `game.over(...)`（boss.js:463 / 471-472，1718-1724）。
     对局一收尾，该死亡事件的后续阶段（含 After → dieAfter）不再推进 ⇒
     **dieAfter 触发永远没有机会发生** ⇒ 讨伐录恒 0 / 亲征恒 0 胜 0 负。
     佐证：① 项目既有结论「魔王一死即 game.checkResult() → 一局只可能"被讨伐"一次」；
     ② 妖灵阵亡**不**触发收尾 ⇒ After 正常推进 ⇒ 妖灵收益一直工作（实测吻合）。
   修法（沿用本项目 csh_winrate 的 game.over 包装先例与**联机安全红线**
   "包装体内不引用闭包变量"）：在对局收尾口补记三种结局；
   与 dieAfter 通道用 **boss 对象上的哨兵 `_cshBossRecorded`** 互斥
   （boss 是每局新对象：一局只记一次、不跨局泄漏）。 */
function recordOnOver() {
	try {
		if (!lib.config || lib.config.mode !== "boss") return;
		const boss = game && game.boss;
		if (!boss || !game.bossinfo) return;
		if (boss._cshBossRecorded) return;                       /* 与 dieAfter 通道互斥 */
		const dead = !boss.isAlive();
		try {
			const dbg = "[池子魔将][讨伐-诊断] 收尾通道 · 魔王=" + (boss.name || "?") +
				" · 玩家=" + (game.me === boss ? "魔王" : "挑战者") + " · 魔王存活=" + (!dead);
			if (typeof console !== "undefined" && console.log) console.log(dbg);
			if (lib.cshDebug && typeof lib.cshDebug.info === "function") lib.cshDebug.info(dbg);
		} catch (eDbg) {}
		if (game.me === boss) {
			/* 应战（玩家即魔王）：魔王死 = 负；场上再无挑战者 = 胜（与 mode/boss.js 同判据） */
			if (dead) { boss._cshBossRecorded = true; recordAsBoss(false); }
			else if (!game.hasPlayer(function (cur) { return !cur.side; }, true)) {
				boss._cshBossRecorded = true; recordAsBoss(true);
			}
			return;
		}
		if (!dead) return;                                       /* 挑战者视角：只有魔王死才算击破 */
		boss._cshBossRecorded = true;
		const nm = String(boss.name || "");
		if (nm.indexOf("csh_boss_") === 0) record(nm, { round: game.roundNumber });
		else recordExt(nm, { round: game.roundNumber });         /* 外传：非池子魔将 BOSS 被击破 */
	} catch (e) { console.warn("[池子魔将] 收尾讨伐记录异常", e); }
}

export function installBossRecord() {
	try {
		const api = {
			record: record,
			recordAsBoss: recordAsBoss,
			recordMinion: recordMinion,
			minionHeat: minionHeat,
			/* 外传（批次 A）：记录 + 动态枚举 + 跨模式合并/快照（页面父窗兜底 / buildStats 透传共用） */
			recordExt: recordExt,
			extRoster: extRoster,
			extRosterAll: extRosterAll,
			snapshotExt: snapshotExt,
			read: readStore,
			summary: summary,
			REWARD_FIRST: REWARD_FIRST,
			REWARD_DAILY: REWARD_DAILY,
			MINION_CBY: MINION_CBY,
			MINION_MERIT: MINION_MERIT,
			MINION_HEAT: MINION_HEAT,
			/* 2026-10-17 指定讨伐令：读 / 校验 / 下单 / 清空 + 价格（单一真源；宿主桥与出怪入口都从这里取） */
			BOUNTY_COST: BOUNTY_COST,
			bountyGet: bountyGet,
			bountyCheck: bountyCheck,
			bountySet: bountySet,
			bountyClear: bountyClear,
		};
		if (lib.cshBossRecord) {
			/* 已安装（老实例）：把**本次新增**的能力补挂上去 —— 幂等。
			   ★ 踩坑实录（2026-10-17 作者实机「悬赏失败 · 明明有 CBY」）：
			     旧写法是 `if (lib.cshBossRecord) return;` + 一份手写白名单 —— 新函数只要漏进白名单，
			     宿主桥就取不到（返回 nomodule），玩家侧表现就是「点了没用」。现改为「白名单 + 缺失补挂」。 */
			for (const k in api) if (lib.cshBossRecord[k] === undefined) lib.cshBossRecord[k] = api[k];
			return;
		}
		lib.cshBossRecord = api;
		try {
			if (lib.cshDebug && typeof lib.cshDebug.info === "function") {
				lib.cshDebug.info("bossrecord: 讨伐记录层就绪（存储 " + KEY + "）");
			}
		} catch (eI) {}
		/* ★ 对局收尾记录通道接线（根因修复 · 见 recordOnOver 头注）。
		   纪律沿用 csh_winrate 的包装先例：
		     · 幂等安装（_csh_bossOverInstalled 哨兵）；
		     · 上一层 game.over 存到 game 属性（_csh_bossOverOriginal），禁止调 game.over 自身；
		     · **包装体内不引用闭包变量**（联机时引擎会序列化 game.over 分发到各客户端执行，
		       未装本扩展的客户端靠属性缺失自然 no-op）；入口挂 game._csh_bossOverCapture；
		     · 单机专用（联机/connectMode 不记——讨伐录是本地生涯数据）。 */
		try {
			if (game && typeof game.over === "function" && !game._csh_bossOverInstalled) {
				game._csh_bossOverCapture = recordOnOver;
				game._csh_bossOverOriginal = game.over;
				game.over = function () {
					try {
						if (!game.online && !_status.connectMode && typeof game._csh_bossOverCapture === "function") {
							game._csh_bossOverCapture();
						}
					} catch (eOv) {}
					return game._csh_bossOverOriginal.apply(this, arguments);
				};
				game._csh_bossOverInstalled = true;
			}
		} catch (eW3) { console.warn("[池子魔将] 收尾记录接线异常", eW3); }
	} catch (eInst) {
		console.warn("[池子魔将] bossrecord 安装异常", eInst);
	}
}
