/* 池子魔将 · 天下榜「历史最高」口径探针（2026-10-18）
   ------------------------------------------------------------
   为什么要单独测：这是**玩家成绩的账本**，改错了比 UI 崩了更难发现 ——
   服务端取 max、客户端上报什么值，两边一对不上就是"悄悄少了几万池子币"。
   本探针从 games/rank.html 里**原样抠出** rankHigh* / pend* 三组函数，
   套一个假的 localStorage 跑场景，不重写一份逻辑来对答案。

   用法：node tools/probe_rank_high.cjs
   退出码 0 = 全过；1 = 有断言失败。 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const HTML = path.join(ROOT, "games", "rank.html");

let pass = 0, failCnt = 0;
const fails = [];
function ck(name, cond, extra) {
	if (cond) { pass++; console.log("  [PASS] " + name); }
	else { failCnt++; fails.push(name); console.log("  [FAIL] " + name + (extra !== undefined ? "  → " + JSON.stringify(extra) : "")); }
}

/* ---------- 1. 从真实页面里抠出目标函数 ---------- */
const html = fs.readFileSync(HTML, "utf8");
function cut(startMark, endMark) {
	const i = html.indexOf(startMark);
	if (i < 0) return "";
	const j = html.indexOf(endMark, i);
	return j < 0 ? "" : html.slice(i, j);
}
const keysSrc = cut("var HIGH_KEY", "function rankHighRead");
const highSrc = cut("function rankHighRead", "/* 本扩展版本");
if (!keysSrc || !highSrc) {
	console.log("  [FAIL] 无法从 rank.html 抠出 rankHigh 段（探针与源码不同步）");
	process.exit(1);
}
const lsSrc = cut("function ls(k, v)", "function el(id)");
if (!lsSrc) {
	console.log("  [FAIL] 无法从 rank.html 抠出 ls()");
	process.exit(1);
}

/* ---------- 2. 假 localStorage ---------- */
function mkStore() {
	const m = new Map();
	return {
		getItem(k) { return m.has(k) ? m.get(k) : null; },
		setItem(k, v) { m.set(k, String(v)); },
		removeItem(k) { m.delete(k); },
		_raw: m,
	};
}
function load(store) {
	const code = lsSrc + "\n" + keysSrc + "\n" + highSrc +
		"\n;({rankHighRead, rankHighMerge, pendRead, pendSet, pendClear, HIGH_KEY, PEND_KEY})";
	const sandbox = { localStorage: store, console };
	vm.createContext(sandbox);
	return vm.runInContext(code, sandbox);
}

/* ---------- 3. 场景断言 ---------- */
console.log("== 历史最高：只增不减 ==");
{
	const store = mkStore();
	const A = load(store);
	ck("没有任何记录时返回 0", A.rankHighRead().cby === 0 && A.rankHighRead().merit === 0);
	let h = A.rankHighMerge({ cby: 12000, merit: 30, seg: "三品" });
	ck("第一次上报写入最高值", h.cby === 12000 && h.merit === 30);
	/* 关键场景：打出一笔新高后花掉一部分，余额变低 —— 最高值必须还在 */
	h = A.rankHighMerge({ cby: 5000, merit: 30, seg: "三品" });
	ck("余额变低时最高值不被覆盖（这就是修复前会丢的那一笔）", h.cby === 12000, h.cby);
	ck("读回来仍是 12000（真落盘了，不是只在内存）", A.rankHighRead().cby === 12000);
	h = A.rankHighMerge({ cby: 20000, merit: 10, seg: "" });
	ck("创新高时正常抬高", h.cby === 20000);
	ck("merit 各自独立取大（不会被 10 拉低到 10）", h.merit === 30, h.merit);
	ck("seg 为空串时不抹掉已有值", A.rankHighRead().seg === "三品");
	ck("换一台机器（新 store）从 0 开始 —— 说明这东西靠存档迁移带走", load(mkStore()).rankHighRead().cby === 0);
}

console.log("== 待送达标记 ==");
{
	const store = mkStore();
	const A = load(store);
	ck("初始没有待送达", A.pendRead() === null);
	A.pendSet(8000, 12);
	const p = A.pendRead();
	ck("写入后能读回数值", p && p.cby === 8000 && p.merit === 12);
	ck("带时间戳（页面要按它说『上次』）", p && typeof p.t === "number" && p.t > 0);
	A.pendClear();
	ck("清除后读回 null", A.pendRead() === null);
	/* 脏数据不能把页面搞崩 */
	store.setItem("csh_rank_submit_pending", "{坏 JSON");
	ck("坏 JSON 安全返回 null", A.pendRead() === null);
	store.setItem("csh_rank_high", "[1,2,3]");
	ck("类型不对的 high 安全回落 0", A.rankHighRead().cby === 0);
	store.setItem("csh_rank_high", '{"cby":"很多人","merit":-5}');
	const weird = A.rankHighRead();
	ck("非数字 cby 归 0、负数 merit 被夹到 0", weird.cby === 0 && weird.merit === 0, weird);
}

console.log("== 与页面接线一致性 ==");
{
	ck("netPush 上报的是 upCby（最高值）而不是 v.cby（余额）", /cby:\s*upCby,\s*merit:\s*upMerit/.test(html));
	ck("netPush 上报前先 rankHighMerge", /var high = rankHighMerge\(v\)/.test(html));
	ck("网络失败时落 pending", /pendSet\(upCby, upMerit\)/.test(html));
	ck("上传成功时清 pending", /pendClear\(\)/.test(html));
	ck("载荷带版本字段 ver", /ver:\s*NET\.ver/.test(html));
	ck("进页先看 pending 并提示", /pendRead\(\)/.test(html) && /pendingUp/.test(html));
	ck("历史最高键已登记存档迁移（rankHigh 进 WHITELIST）",
		fs.readFileSync(path.join(ROOT, "core", "csh_migrate.js"), "utf8").indexOf('"rankHigh"') >= 0);
}

console.log("");
console.log("----------------------------------------");
if (failCnt) { console.log("结论：未通过，" + failCnt + " 项失败：" + fails.join(" / ")); process.exit(1); }
console.log("结论：通过（" + pass + " 项断言）。");
process.exit(0);
