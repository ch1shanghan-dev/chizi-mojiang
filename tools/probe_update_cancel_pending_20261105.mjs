/* 取消待安装 · 反例（2026-11-05）
 *
 * 背景：4.0.16 允许局中先下载并核验、本局结束后自动安装。玩家需要能反悔：
 * 「我现在不想装了」不该只能等本局结束被动换文件。
 *
 * 这里测的是 csh_debug.js 里真实的 __cshCancelPending（从源码抽出来跑，不是复制品），
 * 配合真实 core/csh_update.js 与内存 IO。重点防三类错误：
 *   ① 界面说「已取消」，文件却照旧被换 —— 所以只有 abortPrepared 成功才清凭据；
 *   ② 提交阶段还能取消 —— 那时文件已在换，取消只会更糟，必须拒绝；
 *   ③ 取消后旧的 prepared 仍能被提交 —— 必须彻底失效。
 *
 * 用法：node tools/probe_update_cancel_pending_20261105.mjs [--out <dir>]
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const root = arg("--root", path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
const out = arg("--out", null);

const updateSrc = fs.readFileSync(path.join(root, "core", "csh_update.js"), "utf8");
const debugSrc = fs.readFileSync(path.join(root, "core", "csh_debug.js"), "utf8");

/* —— 从 csh_debug.js 抽出 __cshCancelPending 本体 —— */
const hStart = debugSrc.indexOf("if (!window.CSHUpdate.__cshCancelPending)");
const hEnd = debugSrc.indexOf("function updateBases() {", hStart);
if (hStart < 0 || hEnd <= hStart) {
	console.error("无法从 core/csh_debug.js 提取 __cshCancelPending（被改名或移动了？）");
	process.exit(2);
}
const helperSrc = debugSrc.slice(hStart, hEnd);

const ctx = vm.createContext({ crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, AbortController, console });
vm.runInContext(updateSrc, ctx);
const API = ctx.CSHUpdate;

const enc = s => new TextEncoder().encode(s);
const dec = x => x && new TextDecoder().decode(x);
const prefix = "extension/池子魔将/";
const journalPath = "extension/.csh-updates/chizi-mojiang/journal.json";

function memory() {
	const data = new Map([[prefix + "a.js", enc("old-long-a")]]);
	const io = {
		async read(f) { return data.has(f) ? data.get(f).slice() : null; },
		async write(f, v) { data.set(f, v.slice()); },
		async remove(f) { data.delete(f); },
	};
	return { data, io, value: r => dec(data.get(prefix + r)), phase() { try { return JSON.parse(dec(data.get(journalPath))).phase; } catch (_e) { return null; } } };
}

/* 把 hostIO 指到内存 IO：被测代码只认 window.CSHUpdate.hostIO + create */
function env() {
	const mem = memory();
	const orig = API.hostIO;
	API.hostIO = () => mem.io;
	const window = { CSHUpdate: API };
	const cancel = new Function("window", "lib", "game", helperSrc + "\n return window.CSHUpdate.__cshCancelPending;")(
		window, {}, {}
	);
	return {
		mem, cancel, api: API,
		restore() { API.hostIO = orig; API.__cshPendingInstall = null; API.__cshCancelInFlight = false; },
		tx: () => API.create(mem.io),
	};
}

const checks = [];
const check = async (name, fn) => {
	try { const r = await fn(); checks.push({ name, passed: r === true, ...(r === true ? {} : { detail: r }) }); }
	catch (e) { checks.push({ name, passed: false, error: String((e && e.stack) || e) }); }
};
const hash = await API.digest(enc("new"));

await check("1/cancel drops the pending install, clears the journal and keeps installed bytes", async () => {
	const e = env();
	const p = await e.tx().prepare(["a.js"], async () => enc("new"), { hashes: { "a.js": hash } });
	e.api.__cshPendingInstall = { prepared: p, remoteVer: "9.9.9", build: "b", at: Date.now() };
	const r = await e.cancel();
	const ok = r.cancelled === true && !e.api.__cshPendingInstall && !e.mem.data.has(journalPath)
		&& e.mem.value("a.js") === "old-long-a" && e.api.__cshCancelInFlight === false;
	e.restore();
	return ok ? true : { r, pending: !!e.api.__cshPendingInstall, hasJournal: e.mem.data.has(journalPath), value: e.mem.value("a.js"), inFlight: e.api.__cshCancelInFlight };
});

await check("2/cancelling twice is a no-op the second time", async () => {
	const e = env();
	const p = await e.tx().prepare(["a.js"], async () => enc("new"), { hashes: { "a.js": hash } });
	e.api.__cshPendingInstall = { prepared: p, remoteVer: "9.9.9" };
	await e.cancel();
	const second = await e.cancel();
	e.restore();
	return second && second.empty === true ? true : second;
});

await check("3/once committed the cancel is refused and the pending install is kept", async () => {
	const e = env();
	const p = await e.tx().prepare(["a.js"], async () => enc("new"), { hashes: { "a.js": hash } });
	/* 手工把 journal 推进到提交阶段，模拟「已经开装」 */
	const j = JSON.parse(dec(e.mem.data.get(journalPath)));
	j.phase = "committing";
	e.mem.data.set(journalPath, enc(JSON.stringify(j)));
	e.api.__cshPendingInstall = { prepared: p, remoteVer: "9.9.9" };
	const r = await e.cancel();
	const ok = r.cancelled === false && !!r.refused && !!e.api.__cshPendingInstall
		&& e.api.__cshCancelInFlight === false && e.mem.value("a.js") === "old-long-a";
	e.restore();
	return ok ? true : { r, pending: !!e.api.__cshPendingInstall, value: e.mem.value("a.js") };
});

await check("4/a cancelled prepared credential can never be committed afterwards", async () => {
	const e = env();
	const p = await e.tx().prepare(["a.js"], async () => enc("new"), { hashes: { "a.js": hash } });
	e.api.__cshPendingInstall = { prepared: p, remoteVer: "9.9.9" };
	await e.cancel();
	let err = null;
	try { await e.tx().commit(p); } catch (x) { err = x; }
	const ok = !!err && e.mem.value("a.js") === "old-long-a";
	e.restore();
	return ok ? true : { message: err && err.message, value: e.mem.value("a.js") };
});

await check("5/a concurrent cancel is reported busy instead of racing", async () => {
	const e = env();
	const p = await e.tx().prepare(["a.js"], async () => enc("new"), { hashes: { "a.js": hash } });
	e.api.__cshPendingInstall = { prepared: p, remoteVer: "9.9.9" };
	e.api.__cshCancelInFlight = true;
	const r = await e.cancel();
	/* busy 时不能动凭据，也不能把标志留在 true 上（否则自动安装会被永久推迟） */
	const ok = r.busy === true && !!e.api.__cshPendingInstall && e.api.__cshCancelInFlight === true;
	e.restore();
	return ok ? true : { r, pending: !!e.api.__cshPendingInstall, inFlight: e.api.__cshCancelInFlight };
});

await check("6/pending without a journal still cancels cleanly", async () => {
	const e = env();
	e.api.__cshPendingInstall = { prepared: { ok: true, id: "update-x", files: [], hashes: {} }, remoteVer: "9.9.9" };
	const r = await e.cancel();
	const ok = r.cancelled === true && !e.api.__cshPendingInstall && e.mem.value("a.js") === "old-long-a";
	e.restore();
	return ok ? true : { r, pending: !!e.api.__cshPendingInstall };
});

await check("7/no pending install means nothing is touched", async () => {
	const e = env();
	let err = null;
	let r = null;
	try { r = await e.cancel(); } catch (x) { err = x; }
	e.restore();
	return (!err && r && r.empty === true) ? true : { message: err && err.message, r };
});

const result = {
	scope: "Actual csh_debug.__cshCancelPending + actual csh_update transaction on in-memory IO. No network, no installed profile.",
	passed: checks.filter(c => c.passed).length,
	failed: checks.filter(c => !c.passed).length,
	checks,
};
if (out) { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, "cancel-pending.json"), JSON.stringify(result, null, 2)); }
console.log(JSON.stringify({ passed: result.passed, failed: result.failed, checks: checks.filter(c => !c.passed) }, null, 2));
if (result.failed) process.exitCode = 1;
