/* ============================================================
   池子魔将 · 魔王角色注册（v4 · 参照原生 API）
   ------------------------------------------------------------
   ★ 原生路径：game.import("character", factory) —— 引擎在启动时
     （noname/init/index.js:465）对所有 lib.imported.character 执行
     **loadCharacter()**：与扩展角色完全同一条流程（合并 lib.character /
     skilllist / forbidai / characterPack / translate 一并处理）。
     也是其它扩展（杀海拾遗 / 3D精选）注册角色的官方做法。
   ★ v3 曾手工往 lib.character 塞条目 —— 绕过引擎原生处理，导致条目形态
     与引擎正规条目不一致（optionsMenu.js:203 等 [N] 索引读取报错的根源）。
     本模块彻底改回原生注册，**注入模块只保留 lib.boss 配置**（模式配置无包路径）。
   ★ 数据源 = 本扩展名册包（character/index.js 的导出），不依赖 lib.character
     的加载时序（引擎 loadExtension 先 content、后 loadCharacter 的坑一并规避）。
   ★ 魔王条目不进 character/index.js 的 character 对象 —— 不污染 AI 世界名册。
   ============================================================ */
import { lib, game, ui, get, ai, _status } from "../../../noname.js";
import cshCharacter from "./index.js";
import { buildBossEntries, tierOf, origIdOf } from "../core/csh_bossdata.js";

/* 档位前缀（档位识别）：究·/霸·/彩·——精英不加 */
const TIER_PREFIX = { ultimate: "究·", lord: "霸·", egg: "彩·" };

/* ★原生前置（关键）：角色包必须在"已启用角色包"列表内，否则 loadCharacter 会**跳过处理**
   （noname/init/loading.js:110：包不在 lib.config.characters 且非联机 →
   非"boss 模式专属包"时 break）。扩展主包由 loadExtension 自动 add
   （loading.js:287），**动态注册的包必须自行加入**——否则魔王一个都不会进 lib.character。 */
const NAME = "池子魔将_boss";

/* ---------- 登记诊断（2026-10-15 · 懒人包「看不到魔王且零提示」事故） ----------
   魔王进列表的唯一通路：NAME ∈ lib.config.characters → 引擎 loadCharacter 写进
   lib.character → 引擎 mode/boss.js 只枚举 lib.character 且只认 isBoss。
   链上第一环（登记）在 v4 里是 try/catch + 一句 console.warn —— **失败即是静默**：
   懒人包（作者报 1.11.51）模块求值时 lib.config.characters 可能尚不可用，登记失败
   → loadCharacter 在 loading.js:119 直接 break → 挑战模式一个数都没有、界面零提示。
   → 两件事：① 失败改成 **可 grep 的醒目诊断行**（前缀 [池子魔将][BOSS-诊断]，
     并附带当时的环境事实，作者可整段复制粘贴）；② 记录待办，稍后**幂等补登记**。 */
function cshBossEnvFact() {
	try {
		const cfgOk = !!lib.config && typeof lib.config === "object";
		const list = cfgOk ? lib.config.characters : undefined;
		const listDesc = Array.isArray(list)
			? ("存在·数组，长度=" + list.length)
			: (list === undefined ? "不存在(undefined)" : ("存在但非数组，typeof=" + typeof list));
		return "环境事实：typeof lib.config=" + (typeof lib.config) + "，lib.config.characters " + listDesc;
	} catch (eF) {
		return "环境事实：读取失败（" + eF + "）";
	}
}

/* 幂等登记：已在列表里就不重复 add。返回 true = 现在确实在列表内。
   when = 调用时点，进诊断文案，便于作者区分是"第一次就没成"还是"补登也没成"。 */
function cshEnsureBossPack(when) {
	try {
		if (!lib.config || !lib.config.characters || typeof lib.config.characters.add !== "function") {
			console.error("[池子魔将][BOSS-诊断] " + when + "：boss: 角色包启用登记失败 —— 目标包 " +
				NAME + "；" + cshBossEnvFact() + "；原因=lib.config.characters 当时不可用或无 add 方法");
			return false;
		}
		if (!lib.config.characters.includes(NAME)) lib.config.characters.add(NAME);
		return true;
	} catch (eC) {
		console.error("[池子魔将][BOSS-诊断] " + when + "：boss: 角色包启用登记失败 —— 目标包 " +
			NAME + "；" + cshBossEnvFact() + "；异常=" + (eC && eC.message ? eC.message : eC));
		return false;
	}
}

let bossPackPending = !cshEnsureBossPack("第 1 次登记（character/boss.js 模块求值时）");

const bossImportPromise = game.import("character", function () {
	try {
		const pkg = cshCharacter || {};
		const src = (pkg.character && typeof pkg.character === "object") ? pkg.character : null;
		if (!src || !Object.keys(src).length) return { name: NAME };

		const built = buildBossEntries(src, pkg.translate, pkg.characterTitle, (typeof lib !== "undefined" && lib.cshBossRecord && typeof lib.cshBossRecord.bountyGet === "function") ? lib.cshBossRecord.bountyGet() : "");
		if (!built || !built.entryCount) return { name: NAME };

		/* character：魔王全量 + 妖灵（纯对象格式，与 character/index.js 的条目同形态） */
		const character = {};
		for (const bid of built.order) if (built.entries[bid]) character[bid] = built.entries[bid];
		for (const mid in built.minionEntries) character[mid] = built.minionEntries[mid];

		/* translate：魔王名（带档位前缀）+ 妖灵名 */
		const translate = {};
		for (const bid of built.order) {
			if (!built.names[bid]) continue;
			translate[bid] = (TIER_PREFIX[tierOf(origIdOf(bid))] || "") + built.names[bid];
		}
		for (const mid in built.minionNames) translate[mid] = built.minionNames[mid];

		const result = {
			name: NAME,
			character: character,
			translate: translate,
		};
		if (built.titlesMap && Object.keys(built.titlesMap).length) result.characterTitle = built.titlesMap;

		try {
			if (lib.cshDebug && typeof lib.cshDebug.info === "function") {
				lib.cshDebug.info("boss: 原生注册魔王 " + built.entryCount + " + 妖灵 " +
					Object.keys(built.minionEntries).length + "（game.import → loadCharacter）");
			}
		} catch (eL) {}
		return result;
	} catch (eB) {
		console.warn("[池子魔将] 魔王原生注册异常", eB);
		return { name: NAME };
	}
});

/* ---------- 自愈补登记（幂等 · 不新增全局 Hook、不改写引擎行为） ----------
   若模块求值时 lib.config.characters 还没就绪（懒人包场景），登记会被记成待办。
   game.import 返回的 promise 在 lib.imported.character[NAME] 落地之后、
   引擎 index.js:465 的 loadCharacter 之前兑现 —— 正好是补登记的最后一个窗口。
   补登记走同一个 cshEnsureBossPack（includes 幂等），成功或失败都留下可搜的记录。 */
if (bossPackPending) {
	try {
		Promise.resolve(bossImportPromise).then(function () {
			if (cshEnsureBossPack("第 2 次补登记（game.import 落地后）")) bossPackPending = false;
		}, function () {
			/* game.import 本身失败时也要留痕，否则又是静默 */
			cshEnsureBossPack("第 2 次补登记（game.import 落地失败）");
		});
	} catch (eR) {
		console.error("[池子魔将][BOSS-诊断] 第 2 次补登记未能排入：" + (eR && eR.message ? eR.message : eR));
	}
}

/* ---------- ★ 懒人包兼容：自愈补载（2026-10-16 深夜四 · 作者实机「懒人包 BOSS 不出现」） ----------
   背景：魔王条目由引擎 loadCharacter 在启动时灌入 lib.character，前提是那一刻
   「池子魔将_boss」已在 lib.config.characters。若宿主（懒人包等第三方打包）的加载时点
   晚于 loadCharacter、或包登记在求值期落空 → 引擎整包跳过 → 挑战模式零魔王。
   既有防线只覆盖「补登记」（下一次启动生效，当前会话仍无魔王）。本函数救**当前会话**：
   条目缺失时用游戏包原始数据做一次**形状完全对齐**的手工合并（对象条目 + [N] 数值索引
   双通道——与 main/content.js 索引兼容段同一契约），幂等、只在缺失时并入、每次留诊断记录。
   标准宿主里条目本就齐全 ⇒ merged=0，零副作用。 */
export function cshBossSelfLoad() {
	try {
		const pkg = cshCharacter || {};
		const src = (pkg.character && typeof pkg.character === "object") ? pkg.character : null;
		if (!src || !Object.keys(src).length) return 0;
		const built = buildBossEntries(src, pkg.translate, pkg.characterTitle, (typeof lib !== "undefined" && lib.cshBossRecord && typeof lib.cshBossRecord.bountyGet === "function") ? lib.cshBossRecord.bountyGet() : "");
		if (!built || !built.entryCount) return 0;
		cshEnsureBossPack("懒人包自愈（cshBossSelfLoad）");
		if (!lib.character) lib.character = {};
		if (!lib.characterPack) lib.characterPack = {};
		const pack = lib.characterPack[NAME] || (lib.characterPack[NAME] = {});
		let merged = 0;
		const put = function (id, entry) {
			if (!id || !entry) return;
			pack[id] = entry;
			if (!lib.character[id]) { lib.character[id] = entry; merged++; }
			/* [N] 数值索引双通道（与引擎正规条目同形；main/content.js 的索引兼容段同一契约） */
			try {
				if (entry.skills !== undefined && entry[3] === undefined) entry[3] = entry.skills;
				if (entry.sex !== undefined) entry[0] = entry.sex;
				if (entry.group !== undefined) entry[1] = entry.group;
				if (entry.hp !== undefined) entry[2] = entry.hp;
				if (entry.extraModeData !== undefined) entry[5] = entry.extraModeData;
			} catch (eX) {}
		};
		for (const bid of built.order) {
			put(bid, built.entries[bid]);
			if (built.names[bid] && lib.translate && !lib.translate[bid]) {
				lib.translate[bid] = (TIER_PREFIX[tierOf(origIdOf(bid))] || "") + built.names[bid];
			}
		}
		for (const mid in built.minionEntries) {
			put(mid, built.minionEntries[mid]);
			if (built.minionNames[mid] && lib.translate && !lib.translate[mid]) lib.translate[mid] = built.minionNames[mid];
		}
		try {
			if (built.titlesMap) {
				if (!lib.characterTitle) lib.characterTitle = {};
				for (const k in built.titlesMap) if (!lib.characterTitle[k]) lib.characterTitle[k] = built.titlesMap[k];
			}
		} catch (eT) {}
		console.error("[池子魔将][BOSS-诊断] 懒人包兼容：自愈补载完成 —— 新并入 " + merged +
			" 个条目（包=" + NAME + "）；下次启动将走原生 loadCharacter");
		try {
			if (lib.cshDebug && typeof lib.cshDebug.info === "function") {
				lib.cshDebug.info("boss: 自愈补载 " + merged + " 条目（懒人包/异常宿主兼容路径）");
			}
		} catch (eL2) {}
		return merged;
	} catch (eS) {
		console.error("[池子魔将][BOSS-诊断] 懒人包兼容：自愈补载异常 —— " + (eS && eS.message ? eS.message : eS));
		return 0;
	}
}

/* ============================================================
   包级隐藏（v4 · 作者定案"在武将设置里不可见"）
   ------------------------------------------------------------
   武将设置页的包节点枚举 = lib.config.all.characters（本体静态包列表，不含我方）
   + **lib.characterPack 的全部键兜底补建**（characterPackMenu.js:424-430）——
   所以仅凭"条目级 isUnseen"只能隐藏包内条目、节点仍在。
   → 在引擎 loadCharacter 处理完成之后（即 main/content.js 时点，init/index.js
     465 → 521 顺序保证），把本包从 lib.characterPack 中移除，节点自然消失；
   `get.character()` 先查 lib.character（我们已由原生流程写入）→ 魔王一切读取不受影响。
   ★ 安全守卫：仅当魔王确实已进入 lib.character 才移除；换模式/重载后模块会重新
     add + game.import，循环成立（loadCharacter 每页只跑一次）。 */
const HIDE_GUARD = "csh_boss_";
export function cshBossPackHide() {
	try {
		const pack = lib.characterPack && lib.characterPack[NAME];
		if (!pack) return false;
		let loaded = 0;
		for (const k in pack) if (k.indexOf(HIDE_GUARD) === 0 && lib.character && lib.character[k]) loaded++;
		if (!loaded) return false;                    /* 未加载成功 → 不做移除，保底可恢复 */
		delete lib.characterPack[NAME];
		try {
			if (lib.cshDebug && typeof lib.cshDebug.info === "function") {
				lib.cshDebug.info("boss: 包级隐藏完成（lib.characterPack." + NAME + " 已移除，武将设置页不再出现）");
			}
		} catch (eL) {}
		return true;
	} catch (eH) {
		console.warn("[池子魔将] boss: 包级隐藏异常", eH);
		return false;
	}
}
