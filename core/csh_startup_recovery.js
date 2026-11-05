/* 池子魔将 · U3 启动恢复（2026-11-05）
 *
 * 必须是 extension.js 的**第一个业务 import**：ESM 静态依赖图会先执行它，
 * 才轮到 bootstrap / character / card / skills 等模块。
 * import "./csh_update.js" 保证事务 IIFE 已把 window.CSHUpdate 挂好，
 * 因此这里可以在任何异步 IO 之前**同步**读到恢复标志。
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
			intro: "<font color=#c9a84c>更新恢复中</font> 暂不启用扩展内容，请重启游戏后继续；本机存档、资格、收据与素材未改动。",
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
