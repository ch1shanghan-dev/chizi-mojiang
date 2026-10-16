/* ============================================================
   池子魔将 · BOSS 模式注入器（v4 · 精简版 · 参照原生 API）
   ------------------------------------------------------------
   ★ 职责收缩：本模块**只注入 lib.boss 模式配置**（chongzheng / minion / gameDraw / _csh_x）
     + 首进焦点 + v4.2「隐藏已讨伐魔王」（读讨伐录页写入的 localStorage 开关，
     把已讨伐者从 lib.character 摘除）——因为模式配置没有"扩展包"路径
     （本体是 mode 导出对象的 boss 字段）。
   ★ 角色本体（魔王全量 + 妖灵）与译名/称号一律交给
     `character/boss.js` 的 **game.import("character", …)** —— 引擎启动时
     （noname/init/index.js:465）用 loadCharacter 原生处理：合并 lib.character、
     skilllist、forbidai（isBoss 自动）、characterPack、translate 全套。
     v3 手工塞 lib.character 的做法（绕过引擎 → 条自形态不一致 → optionsMenu.js:203
     等 [N] 索引读取报错）已废弃。
   ★ 只在挑战模式执行（其它模式零操作）。
   ============================================================ */
import { lib, game } from "../../../noname.js";
import { buildBossConfig, allBossIds } from "../core/csh_bossdata.js";
import { cshBossSelfLoad } from "../character/boss.js";   /* ★ 懒人包兼容：自愈补载 */

/* ---------- v4.2 隐藏已讨伐魔王（作者定案：开关做在池子休闲·讨伐录里） ----------
   开关存 localStorage["csh_boss_hide_killed"]（讨伐录页写入，与页面同源）；
   开启时把已讨伐的魔王从 lib.character 摘除——挑战列表（mode/boss.js:83 只枚举 isBoss）
   自然不再显示。★ 守卫：若摘除后一位可挑战者都不剩（全讨伐完），则整体跳过，
   避免"没有可挑战的BOSS"死路；换页重载后 lib.character 重建、content 重新计算。 */
function cshBossHideKilled() {
	try {
		let on = null;
		try { on = window.localStorage.getItem("csh_boss_hide_killed"); } catch (e0) {}
		if (on !== "1" && on !== "true") return 0;
		const rec = lib.cshBossRecord;
		if (!rec || typeof rec.summary !== "function") return 0;
		const sum = rec.summary();
		const map = (sum && sum.map) || {};
		const order = allBossIds();
		const killedSet = {};
		for (const bid in map) if (map[bid] && map[bid].n > 0) killedSet[bid] = true;
		const remain = order.filter(bid => !killedSet[bid]);
		if (!remain.length) return 0;                             /* 全讨伐完 → 不隐藏，保底可玩 */
		let n = 0;
		for (const bid of order) {
			if (!killedSet[bid]) continue;
			if (lib.character && lib.character[bid]) { delete lib.character[bid]; n++; }
		}
		/* 首进焦点修正：高亮位若被隐藏 → 落到首位仍可见者 */
		try {
			if (lib.storage && lib.storage.current && (!lib.character || !lib.character[lib.storage.current])) {
				lib.storage.current = remain[0];
			}
		} catch (eF) {}
		return n;
	} catch (e) {
		console.warn("[池子魔将] boss: 隐藏已讨伐失败", e);
		return 0;
	}
}

export function cshBossModeInstall() {
	if (lib.config.mode !== "boss") return;                       /* 只在挑战模式生效 */
	try {
		/* ---------- 角色条目存在性守卫（2026-10-14 审计补） ----------
		   魔王条目由 character/boss.js 的 game.import → 引擎 loadCharacter 落地，前提是
		   "池子魔将_boss" 在 lib.config.characters（loading.js:110）。正常路径下模块加载时
		   已自行 add；但若用户先在「武将设置」里全不选（该包节点在 content 才隐藏，
		   存在同会话被清掉的窗口），loadCharacter 会跳过 → lib.character 无魔王条目
		   → 注入 lib.boss 后开局会直接抛"武将不存在"。此处做成 fail-loud：
		   过滤掉缺失条目；全缺则中止注入（宁可挑战模式退回本体，也不要开局崩）。 */
		const all = allBossIds();
		let order = all.filter(bid => lib.character && lib.character[bid]);
		if (order.length < all.length) {
			/* ★ 2026-10-16 深夜四（懒人包实机：BOSS 不出现）：先尝试**自愈补载**——
			   把当前会话缺的条目按原生同形手工并入（幂等 · 只补缺 · 全程留 BOSS-诊断 记录）；
			   补载后仍缺才降级为「按现存条目注入」，并把三层自检打印出来。 */
			const healed = (typeof cshBossSelfLoad === "function") ? cshBossSelfLoad() : 0;
			if (healed) order = all.filter(bid => lib.character && lib.character[bid]);
			if (order.length < all.length) {
				console.warn("[池子魔将] boss: lib.character 缺 " + (all.length - order.length) +
					" 个魔王条目（自愈补载 " + healed + " 个后仍缺；已按现存条目注入）");
			}
		}
		if (!order.length) {
			console.warn("[池子魔将] boss: 魔王条目全缺（角色包未登记/未加载），注入中止");
			/* ★fail-loud（2026-10-15 懒人包事故）：这一分支原本只一句 warn，作者在懒人包
			   里看到的是"挑战模式没魔王、控制台也没话"。改成一条**醒目且可整条搜索**的诊断
			   行——控制台搜 "[池子魔将][BOSS-诊断]" 必然命中，三段自检项可照着逐一核对。 */
			console.error("[池子魔将][BOSS-诊断] 魔王条目全缺 —— 请检查：① lib.config.characters 是否含 池子魔将_boss；" +
				"② 角色包是否被 loadCharacter 处理；③ 控制台是否有 boss: 角色包启用登记失败");
			try {
				if (lib.cshDebug && typeof lib.cshDebug.error === "function") {
					lib.cshDebug.error("boss: 魔王条目全缺，注入中止（检查「武将设置」是否取消了 池子魔将_boss）");
				}
			} catch (eW0) {}
			return;
		}
		/* 纯静态：无需角色条目 · 2026-10-17 带上「指定讨伐令」目标
		   （未悬赏 / 目标非法 / 模块缺失时 bountyGet 返回空串 ⇒ 出怪与从前**完全一致**） */
		const cfg = buildBossConfig((lib.cshBossRecord && typeof lib.cshBossRecord.bountyGet === "function") ? lib.cshBossRecord.bountyGet() : "");
		/* ---------- v5：全局 mod 技登记（【冷眼】· 挑战者手牌上限-1） ----------
		   checkMod 的遍历范围 = 自身技能 + lib.skill.global（game/index.js checkMod →
		   getModableSkills 内 concat）。妖灵要让挑战者的手牌上限-1，必须把该 mod 技
		   登记进 global；技能 mod 内部自带「持有者存活 + 仅挑战者 side===false」双守卫，
		   非挑战对局 / 妖灵阵亡后零副作用（对阵亡者 isIn() 为 false）。
		   ★ v6.2 追加两个 mod 技（同样只登记 mod 部分，触发器留在各自技能里）：
		     · csh_boss_yongdong    —— 人造人【永动】：魔王手牌上限 +3
		     · csh_boss_ranxin_mod  —— 高卷杏【燃心】：挑战者本轮手牌上限 -N
		       （燃心的触发器写在 csh_boss_ranxin 上；**带触发器的技能绝不能进 global**，
		        否则每个角色都会各触发一次 → 拆成独立 silent mod 技能。）
		   ★ v6.3 追加一个（毛利兰【空手】的封杀段）：
		     · csh_boss_kongshou_lock —— 拦住被【空手】缴械者**使用【杀】**
		       （cardEnabled mod；打标在 csh_boss_kongshou 主技里做） */
		try {
			if (!Array.isArray(lib.skill.global)) lib.skill.global = [];
			["csh_boss_lengyan", "csh_boss_yongdong", "csh_boss_ranxin_mod", "csh_boss_kongshou_lock"].forEach(function (gk) {
				if (!lib.skill.global.includes(gk)) lib.skill.global.push(gk);
			});
		} catch (eG) {}
		/* ---------- v4.1：外传记录技全局登记（批次 A · 讨伐录外传卷） ----------
		   本体/他扩展的 BOSS 条目上**没有**我们的技能，无法像池子魔将那样直接装配，
		   csh_boss_watch_ext 只能靠 lib.skill.global 参与 dieAfter 全局触发——否则玩家
		   击破本体 BOSS 时不会记入外传段（技能静默失效）。幂等 includes 检查。 */
		try {
			if (!Array.isArray(lib.skill.global)) lib.skill.global = [];
			if (!lib.skill.global.includes("csh_boss_watch_ext")) lib.skill.global.push("csh_boss_watch_ext");
		} catch (eG2) {}
		/* ---------- 外传名册快照（批次 A） ----------
		   boss 模式是 `lib.character` 含本体挑战 BOSS 的**唯一时刻**（mode/boss.js start()
		   把 lib.characterPack.mode_boss 整体灌进 lib.character）；讨伐录却在池子休闲里打开，
		   那时当场枚举为空 → 外传卷恒空态。故此刻快照落 s.extPool，页面侧跨模式读取。 */
		try {
			var RBX = lib.cshBossRecord;
			if (RBX && typeof RBX.snapshotExt === "function") RBX.snapshotExt();
		} catch (eSX) {}
		/* gameDraw（函数型配置在此补齐；本体标准：魔王 8 张 / 挑战者 4 张） */
		const gameDraw = player => (player === game.boss ? 8 : 4);

		/* ---------- lib.boss 配置（逐键写入；global 等他方键保留） ---------- */
		if (!lib.boss) lib.boss = {};
		for (const bid of order) {
			const c = cfg[bid];
			if (!c) continue;
			c.gameDraw = gameDraw;
			lib.boss[bid] = c;
		}

		/* ---------- v4.2：按开关隐藏已讨伐魔王（在焦点判定之前执行） ---------- */
		const hiddenN = cshBossHideKilled();

		/* ---------- 首进焦点：空值时落我方首位（若被隐藏则取首位仍可见者） ---------- */
		try {
			if (!lib.storage) lib.storage = {};
			if (!lib.storage.current || !lib.character || !lib.character[lib.storage.current]) {
				lib.storage.current = order.find(bid => lib.character && lib.character[bid]) || order[0];
			}
		} catch (eS) {}

		try {
			if (lib.cshDebug && typeof lib.cshDebug.info === "function") {
				lib.cshDebug.info("boss: 已注入模式配置 " + order.length + " 份（chongzheng / minion / gameDraw / _csh_x）" +
					(hiddenN ? "；已按开关隐藏已讨伐 " + hiddenN + " 位" : ""));
			}
			if (lib.config.extension_池子魔将_csh_dev_log) {
				console.log("[池子魔将] boss: 模式配置注入完成 " + order.length + " 份" + (hiddenN ? "，隐藏已讨伐 " + hiddenN : ""));
			}
		} catch (eL) {}
	} catch (eBoss) {
		console.warn("[池子魔将] BOSS 模式注入异常", eBoss);
		try {
			if (lib.cshDebug && typeof lib.cshDebug.error === "function") lib.cshDebug.error("boss: 注入异常", eBoss);
		} catch (eE) {}
	}
}
