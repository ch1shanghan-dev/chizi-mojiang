/* 池子成就引擎 · 探针（2026-10-20）
   ------------------------------------------------------------
   目的：在**没有真引擎**的情况下把判定跑穿 —— 喂假事件流，断言"该解锁的解锁、
         不该解锁的不动、同一条不重复、跨模式不串味"。
   跑法：node tools/probe_pool_achv.mjs
   为什么能这么做：csh_pool_achv.js 的判定层是纯函数（不读 DOM、不读 game），
   引擎耦合全在 install() 里，探针不碰 install。 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = fs.readFileSync(path.join(ROOT, "core", "csh_pool_achv.js"), "utf8");

/* ---------- 假宿主 ---------- */
function makeSandbox() {
	const store = new Map();
	const fakeWin = {};
	const ls = {
		getItem: (k) => (store.has(k) ? store.get(k) : null),
		setItem: (k, v) => store.set(k, String(v)),
		removeItem: (k) => store.delete(k),
	};
	const sandbox = { window: fakeWin, localStorage: ls, console, Date, JSON, Number, String, Object, Array, Math };
	fakeWin.localStorage = ls;
	vm.createContext(sandbox);
	vm.runInContext(SRC, sandbox);
	return { PA: fakeWin.CSH_POOL_ACHV, store, fakeWin };
}

const { PA, store } = makeSandbox();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
	if (cond) { pass++; console.log("  [PASS] " + name); }
	else { fail++; console.log("  [FAIL] " + name + (extra ? "  → " + extra : "")); }
}

/* 与 install() 里的 pump 同构：feed → judge → 记入 unlocked */
function pump(a, ev) {
	PA.feed(a, ev);
	const hit = PA.judge(a, ev);
	for (const r of hit) a.unlocked.push(r.id);
	return hit.map((r) => r.id);
}
function run(mode, opt) {
	return PA.newRun(Object.assign({ mode, meSeat: 0, meIdentity: "", seatCount: 3 }, opt || {}));
}

console.log("== 1. 规则表自检 ==");
const st = PA.selfTest();
ok("selfTest 通过", st.ok, st.errors.join("; "));
ok("保留通用80条，100位武将专属均在", PA.RULES.filter(r=>!r.hero&&!r.collection).length === 80 && PA.PROFILES.length===100 && st.total>=1080, "实际 " + st.total);
ok("事件白名单 9 个（含公开结果采集）", Object.keys(PA.EVENTS).length === 9);

console.log("\n== 2. 单条判定（正例 / 反例） ==");
{
	const a = run("identity");
	const hit = pump(a, { t: "damage", seat: 0, victimSeat: 1, num: 4 });
	ok("伤害 4 → 一刀两断", hit.includes("op_one_slash"), hit.join(","));
	ok("伤害 4 → 不触发雷霆一击", !hit.includes("op_thunder"));
}
{
	const a = run("identity");
	const hit = pump(a, { t: "damage", seat: 0, victimSeat: 1, num: 2 });
	ok("伤害 2 → 不解锁（反例）", hit.length === 0, hit.join(","));
}
{
	const a = run("identity");
	const hit = pump(a, { t: "damage", seat: 0, victimSeat: 1, num: 6 });
	ok("伤害 6 → 雷霆一击", hit.includes("op_thunder"));
}
{
	const a = run("identity");
	const hit = pump(a, { t: "useCard", seat: 0, name: "杀", targets: 3, handAfter: 2, before: 1 });
	ok("三目标牌 → 万箭齐发", hit.includes("op_multi_target"));
}
{
	const a = run("identity");
	const hit = pump(a, { t: "useCard", seat: 0, name: "闪", targets: 1, handAfter: 0, before: 1 });
	ok("空手打闪 → 空手夺刃", hit.includes("op_empty_dodge"));
}
{
	const a = run("doudizhu");
	const hit = pump(a, { t: "useCard", seat: 0, name: "顺子", targets: 0, handAfter: 0, before: 5 });
	ok("一手出完 → 一手清", hit.includes("md_one_hand"));
}

console.log("\n== 3. 同一条不重复解锁 ==");
{
	const a = run("identity");
	const h1 = pump(a, { t: "damage", seat: 0, victimSeat: 1, num: 5 });
	const h2 = pump(a, { t: "damage", seat: 0, victimSeat: 2, num: 5 });
	ok("第一次命中", h1.includes("op_one_slash"));
	ok("第二次不重复命中", !h2.includes("op_one_slash"), h2.join(","));
}

console.log("\n== 4. 模式白名单 ==");
{
	const a = run("guozhan");
	const hit = pump(a, { t: "damage", seat: 0, victimSeat: 1, num: 8 });
	ok("国战不统计（反例）", hit.length === 0, hit.join(","));
}
{
	const a = run("identity");
	const hit = pump(a, { t: "over", win: true, turns: 1, survivors: 3, ident: { 0: "zhu", 1: "fan", 2: "zhong" } });
	ok("身份场判定正常", Array.isArray(hit));
}

console.log("\n== 5. 模式专属：斗地主春天 ==");
{
	const a = run("doudizhu", { meSeat: 0, meIdentity: "dizhu", seatCount: 3 });
	pump(a, { t: "useCard", seat: 0, name: "顺子", targets: 0, handAfter: 3, before: 5 });
	pump(a, { t: "useCard", seat: 0, name: "对子", targets: 0, handAfter: 0, before: 3 });
	const hit = pump(a, { t: "over", win: true, turns: 4, survivors: 1, ident: { 0: "dizhu", 1: "nongmin", 2: "nongmin" }, landlordSeat: 0 });
	ok("地主赢且农民没出牌 → 春天", hit.includes("md_spring"), hit.join(","));
}
{
	const a = run("doudizhu", { meSeat: 0, meIdentity: "dizhu", seatCount: 3 });
	pump(a, { t: "useCard", seat: 1, name: "单张", targets: 0, handAfter: 5, before: 1 });   /* 农民出过牌 */
	pump(a, { t: "useCard", seat: 0, name: "顺子", targets: 0, handAfter: 0, before: 5 });
	const hit = pump(a, { t: "over", win: true, turns: 5, survivors: 1, ident: { 0: "dizhu", 1: "nongmin", 2: "nongmin" }, landlordSeat: 0 });
	ok("农民出过牌 → 不判春天（反例）", !hit.includes("md_spring"), hit.join(","));
}
{
	const a = run("doudizhu", { meSeat: 1, meIdentity: "nongmin", seatCount: 3 });
	pump(a, { t: "useCard", seat: 0, name: "单张", targets: 0, handAfter: 4, before: 1 });   /* 地主只出 1 次 */
	pump(a, { t: "useCard", seat: 1, name: "顺子", targets: 0, handAfter: 0, before: 5 });
	const hit = pump(a, { t: "over", win: true, turns: 6, survivors: 2, ident: { 0: "dizhu", 1: "nongmin", 2: "nongmin" }, landlordSeat: 0 });
	ok("农民赢且地主只出一次 → 反春天", hit.includes("md_reverse_spring"), hit.join(","));
}

console.log("\n== 6. 身份场角色成就 ==");
{
	const a = run("identity", { meIdentity: "zhong" });
	pump(a, { t: "die", seat: 0, victimSeat: 1, victimRole: "fan" });
	const hit = pump(a, { t: "die", seat: 0, victimSeat: 2, victimRole: "fan" });
	ok("忠臣亲手击破 2 反贼 → 忠臣之刃", hit.includes("md_loyal_blade"), hit.join(","));
}
{
	const a = run("identity", { meIdentity: "zhu" });
	pump(a, { t: "die", seat: 0, victimSeat: 1, victimRole: "fan" });
	pump(a, { t: "die", seat: 0, victimSeat: 2, victimRole: "fan" });
	const hit = pump(a, { t: "over", win: true, turns: 8, survivors: 2, ident: { 0: "zhu", 1: "fan", 2: "fan" } });
	ok("主公击破全部反贼 → 主公亲征", hit.includes("md_lord_alone"), hit.join(","));
}
{
	const a = run("identity", { meIdentity: "nei" });
	const hit = pump(a, { t: "over", win: true, turns: 9, survivors: 1, ident: { 0: "nei", 1: "zhu" } });
	ok("内奸单挑主公获胜 → 内奸独舞", hit.includes("md_spy_duel"), hit.join(","));
}

console.log("\n== 7. 同回合双杀 / 技能收网 ==");
{
	const a = run("identity");
	pump(a, { t: "turn", seat: 0 });
	pump(a, { t: "die", seat: 0, victimSeat: 1, victimRole: "fan" });
	const hit = pump(a, { t: "die", seat: 0, victimSeat: 2, victimRole: "fan" });
	ok("一回合击破 2 人 → 斩草除根", hit.includes("op_kill2turn"), hit.join(","));
}
{
	const a = run("identity");
	pump(a, { t: "damage", seat: 0, victimSeat: 3, num: 2, bySkill: true });
	const hit = pump(a, { t: "die", seat: 0, victimSeat: 3, victimRole: "fan" });
	ok("技能击杀 → 收网", hit.includes("cb_last_skill"), hit.join(","));
}
{
	const a = run("identity");
	pump(a, { t: "damage", seat: 0, victimSeat: 3, num: 2, bySkill: false });
	const hit = pump(a, { t: "die", seat: 0, victimSeat: 3, victimRole: "fan" });
	ok("非技能击杀 → 不解锁收网（反例）", !hit.includes("cb_last_skill"));
}

console.log("\n== 8. 逆境：1 血获胜 ==");
{
	const a = run("identity");
	pump(a, { t: "hp", seat: 0, hp: 4, maxHp: 4 });
	pump(a, { t: "hp", seat: 0, hp: 1, maxHp: 4 });
	const hit = pump(a, { t: "over", win: true, turns: 10, survivors: 2, ident: { 0: "zhu", 1: "fan" } });
	ok("1 血获胜 → 绝地反击", hit.includes("ad_last_hp"), hit.join(","));
}

console.log("\n== 9. 存档 ==");
{
	store.clear();
	PA.unlock("op_one_slash", "doudizhu");
	const o = PA.load();
	ok("解锁写进存档", !!o.got["op_one_slash"]);
	ok("记录模式", o.got["op_one_slash"].m === "doudizhu");
	PA.unlock("op_one_slash", "identity");
	ok("再次达成累加次数", PA.load().got["op_one_slash"].n === 2);
	const cs = PA.claimState();
	ok("claimState 计数", cs.got === 1 && cs.total === PA.RULES.length, JSON.stringify(cs));
	ok("未读计数", cs.unread === 1);
}

console.log("\n== 10. 跨局累计与技能成就 ==");
{
	const a = run("identity", { meChars: ["测试武将"] });
	a.charWins = 19;
	const neg = pump(a, { t: "over", win: true, turns: 5, survivors: 2, ident: { 0: "zhu", 1: "fan" } });
	ok("19 胜不判本命（反例）", !neg.includes("gen_main"), neg.join(","));
	const b = run("identity", { meChars: ["测试武将"] });
	b.charWins = 20;
	const pos = pump(b, { t: "over", win: true, turns: 5, survivors: 2, ident: { 0: "zhu", 1: "fan" } });
	ok("20 胜 → 本命", pos.includes("gen_main"), pos.join(","));
}
{
	const a = run("identity", { meChars: ["某将"] });
	a.distinctWins = 50;
	const hit = pump(a, { t: "over", win: true, turns: 5, survivors: 2, ident: { 0: "zhu", 1: "fan" } });
	ok("50 名武将 → 百将", hit.includes("gen_hundred"), hit.join(","));
}
{
	const a = run("identity");
	pump(a, { t: "useSkill", seat: 0, skill: "wusheng" });
	pump(a, { t: "useSkill", seat: 0, skill: "wusheng" });
	const hit = pump(a, { t: "useSkill", seat: 0, skill: "wusheng" });
	a.turn = 3;
	const over = pump(a, { t: "over", win: true, turns: 3, survivors: 2, ident: { 0: "zhu", 1: "fan" } });
	ok("同一技能发动 3 次 → 熟极而流", over.includes("gen_all_skills"), over.join(","));
}
{
	const a = run("identity", { meChars: ["x"] });
	const hit = pump(a, { t: "over", win: false, turns: 5, survivors: 3, ident: { 0: "zhu", 1: "fan" } });
	ok("输了不判本命（反例）", !hit.includes("gen_main"), hit.join(","));
}

console.log("\n== 11. 两个已修的计数口径 ==");
{
	const a = run("identity");
	pump(a, { t: "turn", seat: 0 });
	pump(a, { t: "turn", seat: 1 });
	pump(a, { t: "turn", seat: 2 });
	ok("回合数按全场推进（3 人各 1 回合 = 3）", a.turn === 3, "实际 " + a.turn);
}
{
	const a = run("identity");
	pump(a, { t: "useCard", seat: 0, name: "杀", targets: 1, handAfter: 5, before: 1 });
	const hit = pump(a, { t: "over", win: true, turns: 4, survivors: 3, hand: 0, ident: { 0: "zhu", 1: "fan" } });
	ok("获胜手牌以 over.hand 为准（0 张）", hit.includes("op_empty_win"), hit.join(","));
}

console.log("\n== 12. 发奖对账（防重复领取 · 2026-10-20） ==");
{
	store.clear();
	const name = PA.RULES.find((r) => r.id === "op_one_slash").name;
	PA.unlock("op_one_slash", "identity");
	ok("未领取时 isPaid=false", PA.isPaid("op_one_slash") === false);
	PA.recordPaid("op_one_slash", 500, 5);
	ok("recordPaid 后 isPaid=true", PA.isPaid("op_one_slash") === true);
	ok("recordPaid 顺手补 seen", PA.load().seen["op_one_slash"] === 1);
	/* 台账幂等：再记一次金额不翻倍 */
	const before = store.get(PA.PAY_KEY);
	PA.recordPaid("op_one_slash", 500, 5);
	ok("recordPaid 幂等（台账不重复写）", store.get(PA.PAY_KEY) === before);

	/* 场景①：成就页「重置成就进度」只清主存档，台账还在 → 重新达成也领不到第二次 */
	PA.save({ v: PA.VER, got: {}, seen: {}, chars: {} });
	PA.unlock("op_one_slash", "identity");
	ok("页面级重置后重新达成，台账兜底 isPaid=true", PA.isPaid("op_one_slash") === true);
	const n1 = PA.reconcile();
	ok("reconcile 补回 seen（≥1 条）", n1 >= 1 && PA.load().seen["op_one_slash"] === 1, "补回 " + n1);
}
{
	/* 场景②：主存档 + 台账都被清（极端），钱包流水里还有「池子成就/<名>」→ 兜底 */
	const sb2 = makeSandbox();
	const PA2 = sb2.PA;
	const name2 = PA2.RULES.find((r) => r.id === "op_thunder").name;
	sb2.fakeWin.CSH = { wallet: { ledger: () => [{ t: 1, d: 1500, r: "池子成就/" + name2, c: "成就", b: 1500 }] } };
	PA2.unlock("op_thunder", "identity");
	ok("台账已清，钱包流水兜底 isPaid=true", PA2.isPaid("op_thunder") === true);
	const n2 = PA2.reconcile();
	ok("reconcile 用流水补回 seen", n2 === 1 && PA2.load().seen["op_thunder"] === 1, "补回 " + n2);
	/* 反例：流水里没有的成就不该被误标 */
	PA2.unlock("op_one_slash", "identity");
	ok("流水里没有的成就不误标（反例）", PA2.isPaid("op_one_slash") === false);
}

console.log("\n----------------------------------------");
console.log(fail ? "结论：未通过（PASS " + pass + " / FAIL " + fail + "）" : "结论：通过（PASS " + pass + " / FAIL " + fail + "）");
process.exit(fail ? 1 : 0);
