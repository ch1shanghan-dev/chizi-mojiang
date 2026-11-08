/* 池子魔将 · U3 启动恢复（2026-11-05）
 *
 * 这是扩展入口唯一的项目内静态依赖。入口先同步读取恢复标志，
 * 正常启动才动态载入 bootstrap、武将、卡牌和技能。
 * csh_update.js 提供恢复事务，读取标志不依赖任何文件 IO。
 *
 * 中断后的三种结局，本模块负责第三种：
 *   ① 完整旧版（journal=prepared，recover 判定 untouched）；
 *   ② 核验完整新版（journal=committed，recover 判定 committed）；
 *   ③ 明确进入受保护恢复状态 —— 本轮不启用角色/卡牌/技能/内容，
 *      不写版本与成功标志、不自动重启，异步恢复后提示重启。
 *
 * 不删行囊、资格、收据或用户素材；受保护包只是不挂载业务内容。
 */
import "./csh_update.js";

const RECOVERY_KEY = "csh_update_recovery_pending_v1";

function hostRoot() {
	return typeof window !== "undefined" ? window : globalThis;
}

/** 同步检查：绝不依赖异步文件接口，因此能在业务模块求值阶段就拦住。 */
export function cshRecoveryPending() {
	try {
		const w = hostRoot();
		if (w.CSHUpdate && typeof w.CSHUpdate.isRecoveryPending === "function") return !!w.CSHUpdate.isRecoveryPending();
		return !!(w.localStorage && w.localStorage.getItem(RECOVERY_KEY));
	} catch (e) {
		return false;
	}
}

export function cshClearRecoveryPending() {
	try {
		const w = hostRoot();
		if (w.CSHUpdate && typeof w.CSHUpdate.clearRecoveryPending === "function") {
			w.CSHUpdate.clearRecoveryPending();
			return;
		}
		if (w.localStorage) w.localStorage.removeItem(RECOVERY_KEY);
	} catch (e) {}
}

/**
 * 受保护包：不启用 character / card / skill / content / precontent，
 * 避免「新旧混合模块」进入对局或触发业务写入。只保留引擎需要的最小结构。
 */
export function cshProtectedPackage(full) {
	const pkg = full && full.package ? full.package : {};
	return {
		name: full && full.name ? full.name : "池子魔将",
		editable: false,
		connect: true,
		content: function () {},
		precontent: function () {},
		help: full && full.help,
		config: full && full.config,
		package: {
			character: {},
			characterSubstitute: {},
			card: {},
			skill: {},
			get intro() {
				const result = hostRoot().__cshStartupRecovery;
				if (result?.ok) return "扩展文件已恢复，请重启游戏后继续。";
				if (result?.ok === false) return "扩展文件恢复未完成，请重启游戏后重试。";
				return "正在恢复扩展文件，完成后请重启游戏。";
			},
			author: pkg.author || "",
			diskURL: "",
			forumURL: "",
			version: pkg.version || "",
		},
	};
}

/**
 * 启动期恢复：成功后清除同步标志并标记「需要重启」，
 * 但**不自动重启、不写版本/成功标志**；失败保留标志，继续受保护。
 * 只使用事务模块自己的 recover，不碰用户数据。
 */
export async function cshRecoverAtStartup(host) {
	const w = hostRoot();
	const API = w.CSHUpdate;
	if (!API || typeof API.hostIO !== "function" || typeof API.create !== "function") {
		w.__cshStartupRecovery = { ok: false, needRestart: true, reason: "更新模块未就绪" };
		return w.__cshStartupRecovery;
	}
	try {
		const io = API.hostIO(host || {});
		const result = await API.create(io).recover();
		cshClearRecoveryPending();
		w.__cshStartupRecovery = { ok: true, needRestart: true, result: result };
		return w.__cshStartupRecovery;
	} catch (e) {
		w.__cshStartupRecovery = {
			ok: false,
			needRestart: true,
			reason: (e && e.message) || String(e),
		};
		return w.__cshStartupRecovery;   /* 标志保留，下次启动继续受保护 */
	}
}
