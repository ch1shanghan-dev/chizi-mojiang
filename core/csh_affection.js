import "./csh_bond.js";
import { lib, game } from "../../../noname.js";
import { MINIONS } from "./csh_bossdata.js";
import { affOf as affLinesOf, AFF_SHAPE, FAV, OATH_LINES } from "./csh_aff_lines.js";
/* ============================================================
   池子魔将 · 妖灵好感度（v6.2 立 · v6.3 大扩）
   ------------------------------------------------------------
   一句话定位：**把「打招呼 / 说说话 / 摸摸头 / 送礼 / 讨伐 / 持股」六种互动
   折算成一条 0~88000 的亲密度**，再按五档解锁台词、视觉表现与经济回报。

   ★ 数据真源：`csh_affection`（localStorage）
       { id: { v, last, day:{hunt,hold,talk,head,gift}, cnt:{...}, got:{...} } }
   ★ 单一增长口径：所有增长都走 stAdd()（唯一的写入口）——
     六种互动只是"带冷却的一次 stAdd"，不存在第二条写路径。
   ★ 冷却粒度（防刷）：
       · 讨伐（hunt）+6 —— 同一只**每天一次**（与"妖灵收益"同源纪律）
       · 持股（hold）+2 —— 每个**交易日**一次（由金鳞市 ensureDay 调用）
       · 聊天（talk）+1 / 摸头（head）+1 —— 各**每天一次**（面板按钮）
       · 送礼（gift）+3/7/12/20 —— 每天一份，且**消耗池子币**（走钱包单一账本）
       · 打招呼（greet）—— 不计好感、无冷却（"只是想听她说话"）
   ★ 「疏远」不做惩罚：超过 COOL_DAYS 天没互动，只把**语气**降一档
     （moodOf → "cool"，说疏远台词），数值一点不掉。
   ★ 五档：D 陌路 / C 相识 / B 亲近 / A 信赖 / S 羁绊。
   ★ 台词：**950 句**来自 `core/csh_aff_lines.js`（每人 19 句，逐人考据手写、
     全库两两不同）。本模块只负责"什么时候说哪一句"。
   ★ v6.3 经济回报（作者："好感度经济回报需要，而且这个功能需要再丰富"）：
       四档特权（fee1 / tip / fee2 / div）+ 一条连续的基本面热度（0 ~ +1.2%）。
       **0 好感时全部为 0**——金鳞市原有 35 条断言因此不受影响。
   ============================================================ */

/* ---------- ★ 2026-10-16 深夜 · 雀魂（Majsoul）数值移植（作者："改成雀魂那种好感度模式数值的…直接套用"） ----------
   雀魂羁绊口径（已核研）：五段累计 **2000 / 8000 / 18000 / 38000 / 88000（满羁绊）**；
   礼物三档羁绊值 绿 200 / 蓝 1000 / 紫 5000，**偏好 ×1.5**；对局结算 四麻东风 +40 / 半庄 +60。
   移植映射：D 陌路 0~1999 / C 相识 2000~ / B 亲近 8000~ / A 信赖 18000~ / S 羁绊 38000~
   （满羁绊 88000 = 五心圆满）；礼物四档 200 / 1000 / 5000 / 12000（星砂为本土顶档）。
   日活来源按雀魂"对局"量级重定：讨伐 = 对局（+40）· 持股 +20 · 三互动 5/5/10。
   ★ 作者另定：**礼物不限次数**（雀魂有每日上限，此处放开——"礼物也不限次数购买"）。 */
const BOND = (typeof window !== "undefined" ? window : globalThis).CSHBond;
export const AFF_MAX = BOND.MAX;
export const AFF_LEVELS = BOND.LEVELS;
export function resolveBondProgress(total) { return BOND.resolveBondProgress(total); }
export const AFF_GAIN = { hunt: 40, hold: 20, talk: 5, head: 5, close: 10, play: 5,
	tea: 3, stars: 8, callname: 12 };   /* ★ 雀魂移植：讨伐=对局 +40；v6.9 三新互动 */
/* v6.9 三新互动的台词池映射（先复用既存池——"先复用再扩写"）：茶=闲聊 / 看星=私语 / 称呼=羁绊句 */
const ACT_POOL = { tea: "talk", stars: "close", callname: "top" };

/* 礼物四档（v6.3 涨价：作者「礼物的价格可以给的更高一些」）——
   金币要有去处，送礼要是**明显的消费决策**而不是顺手一点。
   价位锚定：烈酒 ≈ 讨伐妖灵的一半多一点；夜蔷薇 ≈ 讨伐三次；（★ 2026-10-16 起妖灵 CBY 已改 3000/1000（原 10000），此处价位锚定待好感度改版时一并复核）
   旧徽章 ≈ 讨伐十二次；星砂只在后期（几十万身家）才买得起。 */
export const AFF_GIFTS = [
	{ key: "wine", name: "一杯烈酒", cost: 6000, add: 200, hint: "她抿一口，看你的眼神松了一分。" },
	{ key: "rose", name: "一束夜蔷薇", cost: 28000, add: 1000, hint: "她把花收进怀里，耳根有点红。" },
	{ key: "relic", name: "一枚旧徽章", cost: 120000, add: 5000, hint: "她攥紧了徽章，很久没说话。" },
	{ key: "stardust", name: "一捧星砂", cost: 680000, add: 12000, hint: "整个房间都亮了一下——她把星砂倒进掌心，笑着看你。" },
];

/* v6.3 互动动作（作者：「不仅可以对话，还有'摸头'之类的」） */
export const AFF_ACTS = [
	{ key: "greet", name: "打个招呼", gain: 0, hint: "不计好感、不冷却——只是想听她说话。" },
	{ key: "talk", name: "说说话", gain: 5, hint: "每天一次 +5。" },
	{ key: "head", name: "摸摸头", gain: 5, hint: "每天一次 +5。" },
	/* v6.4：亲近以上才解锁的**私语**——台词取自 close 段，语气最旖旎。 */
	{ key: "close", name: "贴近一点", gain: 10, need: "B", needV: 8000, hint: "亲近以上，每天一次 +10。" },
	/* ★ v6.9（作者："随好感解锁新互动"）：三档递进互动——**先复用既存台词池**，后续再扩写。 */
	{ key: "tea", name: "递杯茶", gain: 3, need: "C", needV: 2000, pool: "talk", hint: "相识以上，每天一次 +3。" },
	{ key: "stars", name: "并肩看星", gain: 8, need: "A", needV: 18000, pool: "close", hint: "信赖以上，每天一次 +8。" },
	{ key: "callname", name: "专属称呼", gain: 12, need: "S", needV: 38000, pool: "top", hint: "羁绊以上，每天一次 +12。" },
];

/* v6.3 好感回报（四档特权 + 一条连续热度），全部单点定义在这里，金鳞市只读不写。 */
export const AFF_PERKS = [
	{ level: "C", key: "fee1", tag: "相识", name: "挂单折扣", desc: "手续费 −0.3%" },
	{ level: "B", key: "tip", tag: "亲近", name: "她的消息", desc: "每交易日一条涨跌倾向" },
	{ level: "A", key: "fee2", tag: "信赖", name: "深度挂单", desc: "手续费再 −0.4%" },
	{ level: "S", key: "div", tag: "羁绊", name: "共担风险", desc: "日分红 +0.5%" },
];
export const AFF_ECON = { feeC: 0.003, feeA: 0.004, divS: 0.005, heatMax: 0.012 };

/* ---------- v6.5「她的回礼」（作者："不能全是我给她们送礼物，她们也有概率给一定随机数的 CBY"） ----------
   设计纪律：
     · 只有**陪伴类**互动会回礼（talk / head / close）——**送礼不回**（否则等于变相打折，
       会破坏"送礼是一笔消费决策"这件事）。
     · 概率与倍数都随好感档位上升 ⇒ "攻略"直接变现；这也是经济侧的第二条回路。
     · 金额 = rand(lo~hi) × (1 + 好感/100 × 2) × 档位倍数。
     · 入账一律走钱包单一账本（reason = "她的回礼:<名字>"），账本分类「她的回礼」。 */
export const AFF_GIVE = {
	prob: { D: 0.12, C: 0.25, B: 0.40, A: 0.55, S: 0.75 },   /* ★ 作者："回礼概率做高一些" */
	mul: { D: 1.0, C: 1.2, B: 1.5, A: 1.9, S: 2.4 },
	lo: 600, hi: 1800,
	acts: ["talk", "head", "close", "tea", "stars", "callname"],
};
export function giveRoll(levelKey, v) {
	var p = AFF_GIVE.prob[levelKey];
	if (typeof p !== "number" || Math.random() >= p) return 0;
	var mul = AFF_GIVE.mul[levelKey] || 1;
	var base = AFF_GIVE.lo + Math.floor(Math.random() * (AFF_GIVE.hi - AFF_GIVE.lo + 1));
	var amount = Math.round(base * (1 + Math.max(0, Math.min(AFF_MAX, Number(v) || 0)) / AFF_MAX * 2.0) * mul);
	return Math.max(1, amount);
}

const COOL_DAYS = 14;
const KEY = "csh_affection";
const DAILY_KEYS = ["hunt", "hold", "talk", "head", "close", "gift"];
const LEVEL_ORDER = ["D", "C", "B", "A", "S"];

// 同源页面可以直调本模块，不能只依赖壳消息的恢复守卫。
function saveBlocked() {
	try {
		const guard = lib.cshWallet && lib.cshWallet.saveGuard;
		if (guard && typeof guard.blocked === "function") return guard.blocked();
		// 钱包尚未安装时仍保留启动恢复保护；凭据无法读取也不放行写入。
		if (localStorage.getItem("csh_migrate_recovery") !== null) return true;
		const migrate = lib.cshMigrate;
		const state = migrate && typeof migrate.recoveryState === "function" ? migrate.recoveryState() : null;
		return !!(state && (state.pending || state.busy));
	} catch (e) { return true; }
}
function saveRefused() {
	return { ok: false, reason: "存档操作尚未完成，请先在行囊恢复后再继续", recovery: true };
}

function dayKey() {
	try {
		var d = new Date();
		var m = d.getMonth() + 1, dd = d.getDate();
		return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (dd < 10 ? "0" : "") + dd;
	} catch (e) { return ""; }
}
/* 日键差（b - a，单位天）；任一非法返回 null —— 疏远一律走这里，不用毫秒除法 */
function dayGap(a, b) {
	try {
		var pa = String(a || "").split("-"), pb = String(b || "").split("-");
		if (pa.length !== 3 || pb.length !== 3) return null;
		var ta = Date.UTC(+pa[0], +pa[1] - 1, +pa[2]), tb = Date.UTC(+pb[0], +pb[1] - 1, +pb[2]);
		if (!isFinite(ta) || !isFinite(tb)) return null;
		return Math.round((tb - ta) / 86400000);
	} catch (e) { return null; }
}
function dayKeyOf(ts) {
	try {
		var d = new Date(Number(ts));
		if (isNaN(d.getTime())) return "";
		var m = d.getMonth() + 1, dd = d.getDate();
		return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (dd < 10 ? "0" : "") + dd;
	} catch (e) { return ""; }
}
/* ★ 迁移/守卫：老档只有 last（毫秒时间戳）。只有当它落在一段**合理区间**内
   （过去 0~COOL_DAYS 天）才回填 saw；否则留空 = "未知" ⇒ 绝不据此报疏远。
   这一条同时挡住"系统时间被改过导致 last 落在十几年前"的脏数据。 */
function backfillSaw(e) {
	try {
		if (typeof e.last !== "number" || !isFinite(e.last) || e.last <= 0) return "";
		var days = (Date.now() - e.last) / 86400000;
		if (days < -1 || days > COOL_DAYS) return "";
		return dayKeyOf(e.last);
	} catch (err) { return ""; }
}
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsPut(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

function readStore() {
	var s = null;
	try { s = JSON.parse(lsGet(KEY) || "null"); } catch (e0) { s = null; }
	if (!s || typeof s !== "object" || Array.isArray(s)) s = {};
	for (const k of Object.keys(s)) {
		const e = s[k];
		if (!e || typeof e !== "object" || Array.isArray(e)) { delete s[k]; continue; }
		if (!(typeof e.v === "number" && isFinite(e.v))) e.v = 0;
		e.v = Math.max(0, Math.min(AFF_MAX, Math.round(e.v)));
		if (typeof e.last !== "number" || !isFinite(e.last) || e.last < 0) e.last = 0;
		/* v6.5：疏远只看 saw（日键）；非法/缺失 → 迁移回填，仍拿不到就留空 = 未知 */
		if (typeof e.saw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.saw)) e.saw = backfillSaw(e);
		if (typeof e.giveSum !== "number" || !isFinite(e.giveSum) || e.giveSum < 0) e.giveSum = 0;
		if (typeof e.giveN !== "number" || !isFinite(e.giveN) || e.giveN < 0) e.giveN = 0;
		if (!e.day || typeof e.day !== "object") e.day = {};
		for (const dk of DAILY_KEYS) if (typeof e.day[dk] !== "string") e.day[dk] = "";
		if (!e.cnt || typeof e.cnt !== "object") e.cnt = {};
		for (const ck of Object.keys(e.cnt)) {
			if (typeof e.cnt[ck] !== "number" || !isFinite(e.cnt[ck]) || e.cnt[ck] < 0) delete e.cnt[ck];
		}
	}
	return s;
}
function writeStore(s) { lsPut(KEY, s); }

export function levelOf(v) {
	v = Math.max(0, Math.min(AFF_MAX, Math.round(Number(v) || 0)));
	for (const L of AFF_LEVELS) if (v >= L.min) return L;
	return AFF_LEVELS[AFF_LEVELS.length - 1];
}
export function nextLevelOf(v) {
	var cur = levelOf(v);
	if (cur.key === "S") return null;
	var idx = AFF_LEVELS.indexOf(cur);
	return AFF_LEVELS[idx - 1] || null;
}
export function toNext(v) {
	var n = nextLevelOf(v);
	return n ? Math.max(0, n.min - Math.round(Number(v) || 0)) : 0;
}

export function get(id) {
	if (!id) return null;
	var s = readStore();
	var e = s[id] || { v: 0, last: 0, day: {}, cnt: {} };
	var progress = resolveBondProgress(e.v);
	var L = progress.level;
	return {
		id: id, v: e.v, level: L.key, levelName: L.name, color: L.color,
		next: nextLevelOf(e.v) ? nextLevelOf(e.v).key : null,
		toNext: toNext(e.v),
		last: e.last, saw: e.saw || "", cnt: e.cnt || {},
		oath: e.oath || 0,                               /* ★ v6.9：契约时间戳（0 = 未结契） */
		giveSum: e.giveSum || 0, giveN: e.giveN || 0,
		mood: moodOf(e),
		/* v6.5：按钮锁定态（页面直接照这个画，不再"点了才被拒"） */
		acts: (function () {
			var lvl = L.key;
			var canClose = LEVEL_ORDER.indexOf(lvl) >= 2;
			return {
				greet: { ok: true, today: false },
				talk: { ok: dailyOk(e, "talk"), today: !dailyOk(e, "talk") },
				head: { ok: dailyOk(e, "head"), today: !dailyOk(e, "head") },
				close: {
					ok: canClose && dailyOk(e, "close"), today: !dailyOk(e, "close"),
					need: (AFF_LEVELS.filter(function (x) { return x.key === "B"; })[0] || { min: 45 }).min,
					locked: !canClose,
				},
				gift: { ok: true, today: false },                 /* ★ 礼物不限次数（作者定案） */
				/* ★ v6.9：三档递进互动（按档位解锁 + 每日冷却） */
				tea: { ok: LEVEL_ORDER.indexOf(lvl) >= 1 && dailyOk(e, "tea"), today: !dailyOk(e, "tea"),
					need: 2000, locked: LEVEL_ORDER.indexOf(lvl) < 1 },
				stars: { ok: LEVEL_ORDER.indexOf(lvl) >= 3 && dailyOk(e, "stars"), today: !dailyOk(e, "stars"),
					need: 18000, locked: LEVEL_ORDER.indexOf(lvl) < 3 },
				callname: { ok: LEVEL_ORDER.indexOf(lvl) >= 4 && dailyOk(e, "callname"), today: !dailyOk(e, "callname"),
					need: 38000, locked: LEVEL_ORDER.indexOf(lvl) < 4 },
			};
		})(),
		pct: progress.percent, progress: progress,
		perks: perkKeysFor(L.key),                       /* ★ 内联算：perkKeys(id) 会再走 get() → 递归 */
		heat: Math.round((e.v / AFF_MAX * AFF_ECON.heatMax) * 10000) / 100,
	};
}
export function list() {
	var s = readStore();
	var out = [];
	for (const id in s) out.push(get(id));
	return out;
}
/* v6.5 重写：三态 cold（从没互动过）/ warm / cool（真疏远）。
   ★ 只用 **saw 日键差**，且：
     · saw 缺失或非法 → cold（**绝不**因为一个可疑的时间戳就报疏远）
     · 差值 ≤ 0（日期在未来）→ warm（时钟被调过，宁可宽松）
     · 差值 > COOL_DAYS → cool
   旧实现用 (Date.now() - last)/86400000，既无合法性检查、又受改系统时间影响，
   于是"第一天实装就报 14 天没来"（作者实机）。 */
function moodOf(e) {
	if (!e || typeof e.saw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.saw)) return "cold";
	var d = dayGap(e.saw, dayKey());
	if (d == null || d <= 0) return "warm";
	return d > COOL_DAYS ? "cool" : "warm";
}

/* ---------- 唯一的增长入口 ---------- */
function stAdd(id, n, src) {
	try {
		if (saveBlocked()) return null;
		if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(MINIONS, id)) return null;
		n = Math.round(Number(n) || 0);
		if (n <= 0) return null;
		const s = readStore();
		const e = s[id] || (s[id] = { v: 0, last: 0, day: {}, cnt: {} });
		/* 已满档：直接返回 null（"什么都没发生"）——否则调用方会收到 gain:0 的假成功，
		   送礼那条路还会白白扣钱。 */
		if (e.v >= AFF_MAX) return null;
		const before = e.v;
		e.v = Math.max(0, Math.min(AFF_MAX, e.v + n));
		const got = e.v - before;
		if (got <= 0) return null;
		e.last = Date.now();
		e.saw = dayKey();
		if (src) {
			e.day[src] = dayKey();
			e.cnt[src] = (e.cnt[src] || 0) + 1;
		}
		writeStore(s);
		return { id: id, gain: got, value: e.v, level: levelOf(e.v), leveledUp: levelOf(e.v) !== levelOf(before) };
	} catch (e2) { return null; }
}
/* 只记「今天已互动」，不改数值——满档（羁绊 100）时仍然能按下按钮。 */
function stDay(id, src) {
	try {
		if (saveBlocked()) return;
		if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(MINIONS, id)) return;
		var s = readStore();
		var e = s[id] || (s[id] = { v: 0, last: 0, day: {}, cnt: {} });
		e.last = Date.now();
		e.saw = dayKey();
		if (src) { e.day[src] = dayKey(); e.cnt[src] = (e.cnt[src] || 0) + 1; }
		writeStore(s);
	} catch (e2) {}
}
function dailyOk(e, src) {
	if (!e || !e.day || typeof e.day[src] !== "string") return true;
	return e.day[src] !== dayKey();
}
export function canGain(id, src) {
	try {
		if (saveBlocked()) return false;
		if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(MINIONS, id)) return false;
		var s = readStore();
		return dailyOk(s[id], src);
	} catch (e) { return false; }
}

/* ---------- 台词选取（把"什么时候说哪一句"收在这里，页面只负责显示） ---------- */
/* 「她说过的每一句都会被记住」——v6.4 台词收集册。
   ★ 选句策略：**优先说没听过的那几句**，全部听过之后才随机重复
     （作者：台词全列出来会减少新鲜度；这里连"听"都做成收集）。
   ★ 记录粒度：听过的**下标**（数组类台词）/ **键**（礼物四档、升档四档）。 */
var LINE_KINDS = ["greet", "talk", "head", "close", "give"];

function heardOfRaw(id) {
	try {
		var e = readStore()[id];
		if (!e || !e.heard || typeof e.heard !== "object") return {};
		return e.heard;
	} catch (err) { return {}; }
}
function markHeard(id, kind, key) {
	try {
		if (saveBlocked()) return;
		var st = readStore();
		var e = st[id];
		if (!e) return;
		if (!e.heard || typeof e.heard !== "object") e.heard = {};
		var h = e.heard;
		if (kind === "top" || kind === "cool") { h[kind] = 1; }
		else {
			if (!Array.isArray(h[kind])) h[kind] = [];
			if (h[kind].indexOf(key) < 0) h[kind].push(key);
		}
		writeStore(st);
	} catch (err) {}
}
function pickFresh(id, kind, arr) {
	try {
		if (!arr || !arr.length) return "";
		var h = heardOfRaw(id);
		var seen = Array.isArray(h[kind]) ? h[kind] : [];
		var fresh = [];
		for (var i = 0; i < arr.length; i++) if (seen.indexOf(i) < 0) fresh.push(i);
		var idx = fresh.length ? fresh[Math.floor(Math.random() * fresh.length)]
			: Math.floor(Math.random() * arr.length);
		markHeard(id, kind, idx);
		return arr[idx] || "";
	} catch (e) { return ""; }
}
export function line(id, kind, key) {
	var L = affLinesOf(id);
	if (!L) return "";
	if (LINE_KINDS.indexOf(kind) >= 0) return pickFresh(id, kind, L[kind]);
	if (kind === "top") { markHeard(id, "top", 0); return L.top || ""; }
	if (kind === "cool") { markHeard(id, "cool", 0); return L.cool || ""; }
	if (kind === "up") { markHeard(id, "up", key); return (L.up && L.up[key]) || ""; }
	if (kind === "gift") { markHeard(id, "gift", key); return (L.gift && L.gift[key]) || ""; }
	return "";
}
/* 台词收集进度（图鉴的收集册用）：每段已听 / 总句数 */
export function heardOf(id) {
	var L = affLinesOf(id), h = heardOfRaw(id), out = { list: [], got: 0, all: 0 };
	if (!L) return out;
	function sec(kind, name, total, need) {
		var got = (kind === "top" || kind === "cool")
			? (h[kind] ? 1 : 0)
			: (Array.isArray(h[kind]) ? h[kind].length : 0);
		out.list.push({ kind: kind, name: name, got: Math.min(got, total), all: total, need: need || 0 });
		out.got += Math.min(got, total); out.all += total;
	}
	sec("greet", "打招呼", (L.greet || []).length, 0);
	sec("talk", "闲聊", (L.talk || []).length, 0);
	sec("head", "摸头", (L.head || []).length, 0);
	sec("close", "贴近", (L.close || []).length, 45);
	sec("give", "回礼", (L.give || []).length, 0);
	sec("gift", "礼物", Object.keys(L.gift || {}).length, 0);
	sec("up", "升档", Object.keys(L.up || {}).length, 20);
	sec("top", "羁绊", 1, 90);
	sec("cool", "疏远", 1, 0);
	return out;
}
/* 已听过的原句（收集册展开时按段列出；没听过的留空位） */
export function heardLines(id) {
	var L = affLinesOf(id), h = heardOfRaw(id), out = {};
	if (!L) return out;
	function arr(kind) {
		var all = L[kind] || [], seen = Array.isArray(h[kind]) ? h[kind] : [];
		return all.map(function (t, i) { return seen.indexOf(i) >= 0 ? t : ""; });
	}
	["greet", "talk", "head", "close", "give"].forEach(function (k) { out[k] = arr(k); });
	out.gift = {};
	for (const gk in (L.gift || {})) out.gift[gk] = (Array.isArray(h.gift) && h.gift.indexOf(gk) >= 0) ? L.gift[gk] : "";
	out.up = {};
	for (const uk in (L.up || {})) out.up[uk] = (Array.isArray(h.up) && h.up.indexOf(uk) >= 0) ? L.up[uk] : "";
	out.top = h.top ? L.top : "";
	out.cool = h.cool ? L.cool : "";
	return out;
}
/* 整份台词（页面要逐条列出并画"未解锁"占位时用；line() 只给随机一句） */
export function linesOf(id) { return affLinesOf(id); }
/* 页面画"未解锁占位"用的句数表（各处不许硬编码） */
export function shape() { return AFF_SHAPE; }

/* ---------- 四个来源 ---------- */
export function noteHunt(id) {
	try {
		if (!canGain(id, "hunt")) return null;
		var r = stAdd(id, AFF_GAIN.hunt, "hunt");
		if (r) { try { game.log("【羁绊】" + nameOf(id) + " 记住了你这一战（好感 +" + r.gain + "）"); } catch (eL) {} }
		return r;
	} catch (e) { return null; }
}
export function noteHold(id) {
	try {
		if (!canGain(id, "hold")) return null;
		return stAdd(id, AFF_GAIN.hold, "hold");
	} catch (e) { return null; }
}
export function noteTalk(id) {
	try {
		if (!canGain(id, "talk")) return null;
		return stAdd(id, AFF_GAIN.talk, "talk");
	} catch (e) { return null; }
}

/* ---------- v6.5「她的回礼」单点实现 ----------
   ★ 只有**陪伴类**动作（talk / head / close）会回礼；送礼不回（否则等于变相打折，
     会破坏"送礼是一笔消费决策"这件事）。
   ★ 入账一律走钱包单一账本（reason = "她的回礼:<名字>"）；入账成功后才累计入档
     giveSum / giveN（图鉴里可以知道"她一共塞给你多少"）。
   ★ 对 add() 的返回值宽容：真钱包返回"实得数字"（受 PC_CAP 钳制），测试桩可能只返回
     true——非数字一律按我们自己掷出的 roll 计，金额口径始终以本模块为准。 */
function rollGive(id, levelKey, v, act) {
	try {
		if (saveBlocked()) return { give: 0, line: "" };
		if (AFF_GIVE.acts.indexOf(act) < 0) return { give: 0, line: "" };
		var roll = giveRoll(levelKey, v);
		if (!(roll > 0)) return { give: 0, line: "" };
		var W = lib.cshWallet && lib.cshWallet.wallet;
		if (!W || typeof W.add !== "function") return { give: 0, line: "" };
		var res = W.add(roll, "她的回礼:" + nameOf(id));
		if (res === false) return { give: 0, line: "" };
		var credited = (typeof res === "number" && isFinite(res)) ? Math.max(0, Math.floor(res)) : roll;
		if (!(credited > 0)) return { give: 0, line: "" };
		var st2 = readStore(), e2 = st2[id];
		if (e2) {
			e2.giveSum = (e2.giveSum || 0) + credited;
			e2.giveN = (e2.giveN || 0) + 1;
			writeStore(st2);
		}
		return { give: credited, line: line(id, "give") };
	} catch (e) { return { give: 0, line: "" }; }
}

/* ---------- v6.7 同桌游玩（小游戏）----------
   作者：「池子休闲的小游戏，如果跟 50 个美女角色同桌游玩，也应该加 1 点好感度，
   无论输赢。可以反复刷。」
   ⇒ 这是**唯一一个没有冷却的来源**：`stAdd(id, 1, null)` 不传 src，于是不会写每日标记，
     想刷多少次就多少次。写入口仍然是 stAdd（全项目唯一增长口径）。
   调用方在壳层（core/csh_shell.js）：`shell-seat` 记座位 → 结算/关壳时给同桌妖灵各 +1。 */
export function notePlay(id) {
	try {
		if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(MINIONS, id)) return null;
		return stAdd(id, AFF_GAIN.play, null);
	} catch (e) { return null; }
}

/* ---------- 统一互动入口（v6.3）----------
   返回 { ok, act, gain, line, upLine?, value, level, leveledUp, reason }
   规则：
     · 疏远（>14 天）→ 一律只给"疏远台词"，不加好感（关系需要维护，但不掉分）
     · 每天一次的动作第二次点 → ok:false / reason:"daily"，但仍然给一句台词（不冷场）
     · 羁绊档聊天有 45% 概率触发"羁绊专属台词"
     · 升档时附带 upLine（"她刚跨过了一道门槛"） */
/* ★ 2026-10-16 晚（作者："未讨伐的妖灵不能进行互动；金鳞市仍可购买"）：
   未讨伐 = 与她没有任何交集——**一切互动（打招呼/说话/摸头/贴近/送礼）一律拒绝**。
   这是"单一出口"门禁：图鉴页会画锁定态、桥与同源直调都走下面这两个函数，不存在旁路。
   数据源 = 讨伐记录（lib.cshBossRecord.summary().minions[id].n > 0）。
   ★ 金鳞市买卖不经本模块（市场自管账），不受影响——挂牌/持仓/分红照旧。 */
function huntedNow(id) {
	try {
		var R = lib.cshBossRecord;
		if (!R || typeof R.summary !== "function") return true;   /* 记录层异常时不反向锁死（宁可漏锁，不误锁） */
		var m = (R.summary() || {}).minions || {};
		return !!(m[id] && m[id].n > 0);
	} catch (e) { return true; }
}
export function interact(id, act) {
	try {
		if (saveBlocked()) return saveRefused();
		if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(MINIONS, id)) return { ok: false, reason: "bad-id" };
		if (!huntedNow(id)) return { ok: false, reason: "need-hunt" };   /* ★ 未讨伐：互动全锁 */
		var cur = get(id);
		if (act === "greet") {
			return {
				ok: true, act: "greet", gain: 0, line: cur.mood === "cool" ? line(id, "cool") : line(id, "greet"),
				value: cur.v, level: cur.level, levelName: cur.levelName,
			};
		}
		var ACT_REQ = { close: 2, tea: 1, stars: 3, callname: 4 };   /* 档位序门槛（C=1/B=2/A=3/S=4） */
		if (act !== "talk" && act !== "head" && ACT_REQ[act] === undefined) return { ok: false, reason: "bad-act" };
		if (ACT_REQ[act] !== undefined && LEVEL_ORDER.indexOf(cur.level) < ACT_REQ[act]) {
			/* 档位不足：她还不会让你靠那么近——不给台词，只给提示 */
			var needKey = LEVEL_ORDER[ACT_REQ[act]];
			var needV = (AFF_LEVELS.filter(function (x) { return x.key === needKey; })[0] || { min: 0 }).min;
			return { ok: false, reason: "need-level", need: needV, value: cur.v, level: cur.level, levelName: cur.levelName };
		}
		if (cur.mood === "cool") {
			return { ok: false, reason: "cool", line: line(id, "cool"), value: cur.v, level: cur.level, levelName: cur.levelName };
		}
		var lkind = ACT_POOL[act] || act;                /* v6.9：新互动复用既存台词池 */
		if (!canGain(id, act)) {
			return {
				ok: false, reason: "daily",
				line: cur.level === "S" ? line(id, "top") : line(id, lkind),
				value: cur.v, level: cur.level, levelName: cur.levelName,
			};
		}
		/* 已满档（羁绊 100）：**仍然能互动**——给台词、保留回礼机会，只是不再加好感。
		   否则 stAdd 在满档时返回 null，"说说话"会变成死按钮（点击毫无反馈）。 */
		if (cur.v >= AFF_MAX) {
			stDay(id, act);
			var gM = rollGive(id, cur.level, cur.v, act);
			return {
				ok: true, act: act, gain: 0, maxed: true, value: cur.v,
				level: cur.level, levelName: cur.levelName, leveledUp: false,
				line: line(id, lkind), give: gM.give, giveLine: gM.line,
			};
		}
		var r = stAdd(id, (AFF_GAIN[act] != null ? AFF_GAIN[act] : AFF_GAIN.talk), act);
		if (!r) return { ok: false, reason: "fail", value: cur.v, level: cur.level, levelName: cur.levelName };
		/* v6.5 她的回礼：陪伴类互动有概率给 CBY（送礼不回） */
		var gv = rollGive(id, r.level.key, r.value, act);
		var out = {
			ok: true, act: act, gain: r.gain, value: r.value, level: r.level.key,
			levelName: r.level.name, leveledUp: r.leveledUp,
			line: (lkind === "talk" && r.level.key === "S" && Math.random() < 0.45) ? line(id, "top") : line(id, lkind),
			give: gv.give,
			giveLine: gv.line,
		};
		if (r.leveledUp) { out.upLine = line(id, "up", r.level.key); out.upLevel = r.level.name; }
		return out;
	} catch (e) { return { ok: false, reason: "error" }; }
}

/* ---------- ★ 契约/誓约（v6.9 · 2026-10-16 深夜三 · 作者拍板方案） ----------
   满羁绊（88000）解锁「结契」：耗 **星砂 ×2 + 她的偏好礼物 ×3**（按当下单点价格）。
   完成后：契约台词 + 图鉴专属称号/立绘框/横幅（页面负责）；数据层只落 e.oath 时间戳。
   纪律：逐笔扣款皆带 reason；任一笔失败**全数回滚**；未讨伐/未满/已结契各自有明确 reason。 */
export const OATH_COST = { stardust: 2, fav: 3 };
export function oath(id) {
	try {
		if (saveBlocked()) return saveRefused();
		if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(MINIONS, id)) return { ok: false, reason: "bad-id" };
		if (!huntedNow(id)) return { ok: false, reason: "need-hunt" };
		var cur = get(id);
		if (cur.v < AFF_MAX) return { ok: false, reason: "need-max", value: cur.v, need: AFF_MAX };
		var e0 = readStore()[id] || null;
		if (e0 && e0.oath) return { ok: false, reason: "already" };
		var W = lib.cshWallet && lib.cshWallet.wallet;
		if (!W || typeof W.spend !== "function") return { ok: false, reason: "no-wallet" };
		var name = nameOf(id);
		var fav = favOf(id);
		var star = null, fg = null;
		for (const it of AFF_GIFTS) { if (it.key === "stardust") star = it; if (it.key === fav) fg = it; }
		if (!star || !fg) return { ok: false, reason: "fail" };
		var cost = star.cost * OATH_COST.stardust + fg.cost * OATH_COST.fav;
		var paid = [];
		var pay = function (amt, why) { if (W.spend(amt, why)) { paid.push([amt, why]); return true; } return false; };
		if (!pay(star.cost * OATH_COST.stardust, "结契·星砂×" + OATH_COST.stardust + ":" + name) ||
			!pay(fg.cost * OATH_COST.fav, "结契·" + fg.name + "×" + OATH_COST.fav + ":" + name)) {
			for (const p of paid) { try { W.add(p[0], p[1] + "（回滚）"); } catch (eR) {} }
			return { ok: false, reason: "poor", cost: cost };
		}
		var s = readStore();
		var e = s[id] || (s[id] = { v: 0, last: 0, day: {}, cnt: {} });
		e.oath = Date.now();
		writeStore(s);
		return {
			ok: true, act: "oath", cost: cost, fav: fav, favName: fg.name, oathT: e.oath,
			line: OATH_LINES[id] || line(id, "top"), value: cur.v,
		};
	} catch (e2) { return { ok: false, reason: "error" }; }
}
/* 同桌对局内互动（v6.9 · 作者："同桌游戏中小概率触发她的一句话"）：
   返回一句闲聊（未听过的优先 · 落 heard 收集册），调用方（壳）负责显示。 */
export function tableQuip(id) {
	try {
		if (!id || !Object.prototype.hasOwnProperty.call(MINIONS, id)) return null;
		if (!huntedNow(id)) return null;
		var l = line(id, "talk");
		return l ? { id: id, name: nameOf(id), line: l } : null;
	} catch (e) { return null; }
}

/* 送礼：先扣钱（走钱包单一账本），扣款成功才加好感 —— 顺序不可颠倒 */
export function gift(id, giftKey) {
	try {
		if (saveBlocked()) return saveRefused();
		var g = null;
		for (const it of AFF_GIFTS) if (it.key === giftKey) g = it;
		if (!g) return { ok: false, reason: "no-gift" };
		if (!huntedNow(id)) return { ok: false, reason: "need-hunt" };   /* ★ 未讨伐：送礼也锁（同上） */
		/* ★ 雀魂移植后：礼物**不限次数**（不再查日键；冷却语义取消——作者："礼物也不限次数购买"）。
		   ★ 偏好 ×1.5：她偏爱的那一档礼物羁绊值 ×1.5（雀魂同款设计，参照人设手工指定）。 */
		var cur = get(id);
		if (cur && cur.v >= AFF_MAX) return { ok: false, reason: "max" };
		var W = lib.cshWallet && lib.cshWallet.wallet;
		if (!W || typeof W.spend !== "function") return { ok: false, reason: "no-wallet" };
		var name = nameOf(id);
		var isFav = (favOf(id) === g.key);
		var addV = isFav ? Math.round(g.add * 1.5) : g.add;      /* 偏好 ×1.5（雀魂口径） */
		if (!W.spend(g.cost, "送礼:" + name)) return { ok: false, reason: "poor" };
		var r = stAdd(id, addV, "gift");
		if (!r) { try { W.add(g.cost, "送礼回滚:" + name); } catch (eR) {} return { ok: false, reason: "fail" }; }
		return {
			ok: true, act: "gift", gift: g.key, giftName: g.name, gain: r.gain, value: r.value,
			level: r.level.key, levelName: r.level.name, leveledUp: r.leveledUp,
			cost: g.cost, hint: g.hint, fav: isFav, addBase: g.add,
			line: (isFav && FAV[id] && FAV[id][1]) ? FAV[id][1] : line(id, "gift", g.key),
			upLine: r.leveledUp ? line(id, "up", r.level.key) : "",
		};
	} catch (e) { return { ok: false, reason: "error" }; }
}
/* 偏好礼物（雀魂 ×1.5 的口径）：真源在 csh_aff_lines 的 FAV 表（逐人考据 · 单一出处） */
export function favOf(id) {
	try {
		var f = FAV[id];
		return f ? f[0] : "";
	} catch (e) { return ""; }
}
function nameOf(id) {
	try {
		const m = MINIONS[id];
		if (m && m.name) return m.name;
		return (lib.translate && lib.translate[id]) || id;
	} catch (e) { return id; }
}

/* ---------- 经济回报（金鳞市只读这三个函数） ---------- */
/* ★ 按"档位键"算特权，是本模块内部唯一的特权口径（get / perkKeys 共用）。
   绝不能写成 perkKeys(id) → get(id) → perkKeys(id)：那会无限递归（已踩过）。 */
function perkKeysFor(levelKey) {
	var idx = LEVEL_ORDER.indexOf(levelKey), out = [];
	if (idx >= 1) out.push("fee1");
	if (idx >= 2) out.push("tip");
	if (idx >= 3) out.push("fee2");
	if (idx >= 4) out.push("div");
	return out;
}
export function perkKeys(id) {
	try {
		var e = readStore()[id];
		return perkKeysFor(e ? levelOf(e.v).key : "D");
	} catch (err) { return []; }
}
function affV(id) {
	try {
		var e = readStore()[id];
		if (!e || typeof e.v !== "number" || !isFinite(e.v)) return null;
		return Math.max(0, Math.min(AFF_MAX, Math.round(e.v)));
	} catch (err) { return null; }
}
export function feeDiscount(id) {
	var v = affV(id); if (v == null) return 0;
	var k = levelOf(v).key;
	if (k === "A" || k === "S") return AFF_ECON.feeC + AFF_ECON.feeA;
	if (k === "B" || k === "C") return AFF_ECON.feeC;
	return 0;
}
export function divBonus(id) {
	var v = affV(id); if (v == null) return 0;
	return levelOf(v).key === "S" ? AFF_ECON.divS : 0;
}
export function heatBonus(id) {
	var v = affV(id); if (v == null) return 0;
	return v / AFF_MAX * AFF_ECON.heatMax;
}

/* ---------- 聚合（页面用一份数据画完整界面） ---------- */
export function summary() {
	var s = readStore();
	var out = [];
	for (const id in s) {
		var g = get(id);
		g.name = nameOf(id);
		g.img = (MINIONS[id] && MINIONS[id].face) || "";
		out.push(g);
	}
	out.sort(function (a, b) { return b.v - a.v; });
	var buckets = { S: 0, A: 0, B: 0, C: 0, D: 0 };
	out.forEach(function (g) { buckets[g.level] = (buckets[g.level] || 0) + 1; });
	return {
		list: out, n: out.length, buckets: buckets,
		levels: AFF_LEVELS, gifts: AFF_GIFTS, gain: AFF_GAIN, acts: AFF_ACTS, perks: AFF_PERKS,
	};
}
export function reset(id) {
	try {
		if (saveBlocked()) return false;
		var s = readStore();
		if (id) delete s[id]; else s = {};
		writeStore(s);
		return true;
	} catch (e) { return false; }
}

export function installAffection() {
	try {
		if (lib.cshAffection) return;
		lib.cshAffection = {
			AFF_MAX: AFF_MAX, AFF_LEVELS: AFF_LEVELS, AFF_GAIN: AFF_GAIN,
			AFF_GIFTS: AFF_GIFTS, AFF_ACTS: AFF_ACTS, AFF_PERKS: AFF_PERKS, AFF_ECON: AFF_ECON, AFF_GIVE: AFF_GIVE,
			giveRoll: giveRoll,
			levelOf: levelOf, toNext: toNext, nextLevelOf: nextLevelOf, resolveBondProgress: resolveBondProgress,
			get: get, list: list, summary: summary,
			noteHunt: noteHunt, noteHold: noteHold, noteTalk: noteTalk, notePlay: notePlay,
			gift: gift, interact: interact, line: line, shape: shape, linesOf: linesOf,
			heardOf: heardOf, heardLines: heardLines,
			perkKeys: perkKeys, feeDiscount: feeDiscount, divBonus: divBonus, heatBonus: heatBonus,
			reset: reset, canGain: canGain, nameOf: nameOf,
			favOf: favOf, FAV: FAV,
			oath: oath, OATH_COST: OATH_COST, OATH_LINES: OATH_LINES, tableQuip: tableQuip,
		};
		try {
			if (lib.cshDebug && typeof lib.cshDebug.info === "function") {
				lib.cshDebug.info("affection: 好感度层就绪（存储 " + KEY + " · 950 句台词库）");
			}
		} catch (eI) {}
		/* 全局别名（照金鳞市同款）：游戏页 iframe 兜底第一顺位读 window.CSH.affection */
		try {
			if (typeof window !== "undefined" && window) {
				window.CSH = window.CSH || {};
				window.CSH.affection = lib.cshAffection;
			}
		} catch (eW) {}
	} catch (e) {
		console.warn("[池子魔将] affection 安装异常", e);
	}
}
