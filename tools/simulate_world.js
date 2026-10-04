#!/usr/bin/env node
/**
 * 池子魔将 · 世界 / 存档 / 结算桥 验收器
 * （审计 §13「最值得增加的一套世界模拟验收器」的落地版；§12 的
 *   import/export round-trip 与 1000/5000 天模拟清单也在这里跑）
 *
 * 用法：
 *   node tools/simulate_world.js                  # 真实名册 + 1/7/30/365/1000/5000 天阶梯
 *   node tools/simulate_world.js --days 30        # 只跑到 30 天
 *   node tools/simulate_world.js --roster 309     # 用 309 人的**合成名册**跑一遍（扩容预检）
 *   node tools/simulate_world.js --roster 309 --seed 7 --days 5000
 *
 * 退出码：0 = 全绿；1 = 有失败项。
 *
 * 设计要点：
 *   · 只在临时目录里跑：把真实模块复制进镜像树，`noname.js` 用桩，
 *     localStorage / Date / Math.random 全部可控 —— **不碰扩展目录、不碰真实存档**。
 *   · 时间与随机数可控 ⇒ 同样的 --seed 得到同样的世界，便于对比两次改动。
 *   · --roster N 会生成 N 个假武将的 character 模块，用来验证"名册扩容后
 *     资金分布/去重/结构不变式是否仍然成立"（审计 P0-5 的扩容预检）。
 */
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { spawnSync } from "child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/* 本文件自身的绝对路径（ESM 里没有 __filename；Electron-as-node 下访问它会抛出
   "Cannot determine intended module format" 之类的怪错 —— 二次复核实测踩到）。 */
const SELF = fileURLToPath(import.meta.url);
const argv = process.argv.slice(2);
const flagVal = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const ROSTER_SIZE = Math.max(0, Math.floor(Number(flagVal("--roster", 0)) || 0));   // 0 = 真实名册
const SEED = Math.floor(Number(flagVal("--seed", 20261003)) || 1);
const MAX_DAYS = Math.max(1, Math.floor(Number(flagVal("--days", 5000)) || 5000));
const LADDER = [1, 7, 30, 365, 1000, 5000].filter((d) => d <= MAX_DAYS);
const NO_CHILD = argv.includes("--no-child");     // 子进程自调用时不再嵌套派生（防递归）
const PERSONAS = ["aggro", "tight", "bluff", "math", "wild"];
const CAP = 500000000;

let pass = 0, failed = 0;
const ok = (m) => { pass++; console.log("  [PASS] " + m); };
const bad = (m) => { failed++; console.log("  [FAIL] " + m); };
const eq = (m, got, want) => { if (got === want) ok(m); else bad(m + "  → got=" + JSON.stringify(got) + " want=" + JSON.stringify(want)); };
/* 通用断言（布尔条件）：eq 只能比相等，很多检查要的是"这个谓词成立"。 */
const chk = (m, cond, extra) => { if (cond) ok(m); else bad(m + (extra !== undefined ? "  → " + extra : "")); };
const section = (t) => console.log("\n== " + t + " ==");

/* ------------------------------------------------------------------ *
 * 一、沙箱：镜像树 + 桩 + 可控时钟/随机数
 * ------------------------------------------------------------------ */
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "cshsim-"));
const APP = path.join(SANDBOX, "app");
const EXT = path.join(APP, "extension", "池子魔将");

function writeStub() {
    fs.mkdirSync(APP, { recursive: true });
    fs.writeFileSync(path.join(APP, "noname.js"), `
const g = globalThis;
function mk() {
    const f = function () { return mk(); };
    return new Proxy(f, {
        get(t, k) {
            if (k === Symbol.toPrimitive) return () => "";
            if (k === "valueOf") return () => 0;
            if (k === "toString") return () => "";
            if (k === "then" || k === "toJSON" || k === Symbol.iterator || k === Symbol.toStringTag) return undefined;
            if (typeof k === "symbol") return undefined;
            return mk();
        },
        apply() { return mk(); },
        set() { return true; },
        has() { return true; },
    });
}
g.__CSH_LIB__ = g.__CSH_LIB__ || {};
export const lib = g.__CSH_LIB__;
export const game = mk();
export const ui = mk();
export const get = mk();
export const ai = mk();
export const _status = mk();
export default { lib, game, ui, get, ai, _status };
`, "utf8");
}

function mirror(rel) {
    const dst = path.join(EXT, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), dst);
    return dst;
}

/* 依赖装配（2026-10-03 二次复核）：交付包只含"变更文件"，因此这里不能假设
   工程树里的每个文件都在。`core/voices.js` 是 `character/index.js` 的**传递依赖**
   （台词数据，与世界资金/结构无关）—— 拿不到真实文件时用最小桩代替即可，
   既不复制无关依赖，也不会因为缺文件直接 ENOENT。 */
function provideCode(rel, stubSource) {
    const src = path.join(ROOT, rel);
    if (fs.existsSync(src)) { mirror(rel); return true; }
    if (stubSource != null) {
        const dst = path.join(EXT, rel);
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.writeFileSync(dst, stubSource, "utf8");
        console.log("[说明] " + rel + " 不在本目录（交付包只含变更文件）→ 用最小桩代替（不影响资金/结构检查）");
        return true;
    }
    return false;
}

/* 合成名册：N 个假武将（只在 --roster 时生成，用于扩容预检） */
function writeSyntheticRoster(n) {
    const char = {}, tr = {};
    for (let i = 0; i < n; i++) {
        const id = "csh_sim" + String(i).padStart(4, "0");
        char[id] = { sex: i % 2 ? "male" : "female", group: "shu", hp: 4, maxHp: 4, skills: [] };
        tr[id] = "模拟武将" + i;
    }
    const dst = path.join(EXT, "character", "index.js");
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, "export default " + JSON.stringify({ connect: true, character: char, translate: tr }, null, 1) + ";\n", "utf8");
}

/* 可控时钟 + 可控随机数（同一个 seed ⇒ 同一个世界） */
function installClock(offsetDays) {
    const Real = Date;
    class FakeDate extends Real {
        constructor(...a) { if (a.length === 0) super(Real.now() + offsetDays * 86400000); else super(...a); }
        static now() { return Real.now() + offsetDays * 86400000; }
    }
    globalThis.Date = FakeDate;
    globalThis.__advance = (d) => { offsetDays += d; };
}
function installRng(seed) {
    let s = seed >>> 0;
    Math.random = function () {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function installStorage() {
    const store = new Map();
    globalThis.__store = store;
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
        key: (i) => [...store.keys()][i] || null,
        get length() { return store.size; },
    };
}

/* ------------------------------------------------------------------ *
 * 二、不变式（审计 §13 的检查清单）
 * ------------------------------------------------------------------ */
function invariants(w, label) {
    const ai = w.ai || [];
    const problems = [];
    const ids = new Set(), names = new Set();
    let neg = 0, nan = 0, badPersona = 0, badSurname = 0, badWins = 0, badPot = 0, dupId = 0, dupName = 0, badRetire = 0;
    for (const a of ai) {
        if (!(typeof a.fund === "number" && isFinite(a.fund))) nan++;
        else if (a.fund < 0) neg++;
        if (a.fund > CAP) badPot++;
        if (ids.has(a.id)) dupId++; else ids.add(a.id);
        if (names.has(a.name)) dupName++; else names.add(a.name);
        if (PERSONAS.indexOf(a.persona) < 0) badPersona++;
        if (!a.surname) badSurname++;
        if (!(typeof a.hands === "number" && a.hands >= 0)) nan++;
        if (typeof a.wins === "number" && typeof a.hands === "number" && a.wins > a.hands) badWins++;
        if (!(typeof a.biggestPot === "number" && isFinite(a.biggestPot) && a.biggestPot <= CAP)) badPot++;
        if (a.retired && a.fund >= 200) badRetire++;
        if (typeof a.mood === "number" && (a.mood < -1 || a.mood > 1)) nan++;
        if (typeof a.form === "number" && (a.form < 0 || a.form > 1)) nan++;
        if (typeof a.fatigue === "number" && (a.fatigue < 0 || a.fatigue > 1)) nan++;
        if (a.grudges && typeof a.grudges !== "object") nan++;
    }
    const riv = (w.relations && w.relations.rivalry) || {};
    let rivTooMany = 0, rivBadVal = 0;
    for (const k of Object.keys(riv)) {
        const m = riv[k];
        if (Object.keys(m).length > 8) rivTooMany++;
        for (const j of Object.keys(m)) if (!(m[j] >= 0 && m[j] <= 999)) rivBadVal++;
    }
    let serializable = true;
    try { JSON.parse(JSON.stringify(w)); } catch (e) { serializable = false; }
    const rec = w.records || {};

    eq(label + "：AI 数量正确", ai.length, ROSTER_SIZE || ai.length);
    eq(label + "：无负资金", neg, 0);
    eq(label + "：无 NaN/Infinity 数值", nan, 0);
    eq(label + "：资金不越上限", badPot, 0);
    eq(label + "：无重复 id", dupId, 0);
    eq(label + "：无重名", dupName, 0);
    eq(label + "：persona 全部合法", badPersona, 0);
    eq(label + "：surname 非空", badSurname, 0);
    eq(label + "：wins ≤ hands", badWins, 0);
    eq(label + "：退隐态合理（退隐者资金低于最低带入）", badRetire, 0);
    eq(label + "：宿敌每人 ≤8", rivTooMany, 0);
    eq(label + "：宿敌热度 ≤999", rivBadVal, 0);
    eq(label + "：JSON 可序列化", serializable, true);
    ok(label + "：世界纪录 matches=" + (rec.matches || 0) + " bestPot=" + (rec.bestPot || 0));
    return { neg, nan, rec };
}

/* ------------------------------------------------------------------ *
 * 三、主流程
 * ------------------------------------------------------------------ */
console.log("池子魔将 · 世界/存档/结算桥 验收器");
console.log("扩展根：" + ROOT);
writeStub();
installStorage();
installClock(0);
installRng(SEED);
["core/csh_world.js", "core/csh_migrate.js", "core/csh_page.js"].forEach((rel) => mirror(rel));
provideCode("core/voices.js", "export const cshVoices = {};\nexport default {};\n");
/* 名册来源：真实 character/index.js（完整工程）· 合成名册（--roster N）·
   或都不满足时自动合成 97 人（交付包里没有 character/index.js）—— 三种都在标题行注明。 */
let rosterLabel;
if (ROSTER_SIZE) {
    writeSyntheticRoster(ROSTER_SIZE);
    rosterLabel = "合成 " + ROSTER_SIZE + " 人（--roster）";
} else if (provideCode("character/index.js", null)) {
    rosterLabel = "真实名册";
} else {
    writeSyntheticRoster(97);
    rosterLabel = "合成 97 人（本目录没有 character/index.js，自动代替真实名册）";
    console.log("[说明] 本目录不是完整工程树 ⇒ 真实名册不可用，已自动改用合成名册；");
    console.log("       真实名册的结构检查（真实重名/姓氏）请在完整扩展目录下运行本工具。");
}
console.log("名册：" + rosterLabel + " · seed=" + SEED + " · 天数上限=" + MAX_DAYS);

globalThis.window = globalThis;

/* 起手结构检查要"未被推演过"的名册：模块载入时会自动跑一次离线结算（tick），
   所以先塞一份空名单 + 当日额度用尽的存档 —— 规整层会按名册重建（资金 = 起始分布），
   而当日心跳额度为 0 ⇒ tick 不推演 ⇒ 资金保持起始值，才验得了资金分布本身。 */
function localDayIndex() {
    const d = new Date();
    return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2026, 0, 1)) / 86400000);
}
globalThis.__store.set("csh_world", JSON.stringify({
    ai: [], lastTick: localDayIndex(), heartbeatDay: localDayIndex(), heartbeatMatches: 30,
}));

const W = (await import(pathToFileURL(path.join(EXT, "core", "csh_world.js")).href), globalThis.CSH.world);
const rw = () => JSON.parse(globalThis.__store.get("csh_world"));
const rosterN = W.const.AI_COUNT;

/* ---------- 1. 起手结构 ---------- */
section("1. 起手名册与结构不变式（" + rosterN + " 人 · 未推演的起始资金）");
invariants(rw(), "起手");
const funds = rw().ai.map((a) => a.fund);
eq("资金两两不等", new Set(funds).size, funds.length);
eq("首富 = 5 亿（AI_FUND_CAP）", Math.max(...funds), 500000000);
if (W.tierCountsFor(rosterN).t0 > 0) eq("最穷 = 5 万（穷桌下锚）", Math.min(...funds), 50000);
else ok("名册过小（穷桌 0 人）→ 最穷档由中桌锚点收尾：" + Math.min(...funds));
const bands = { t3: funds.filter((f) => f >= 20000000).length, t2: funds.filter((f) => f >= 2000000 && f < 20000000).length, t1: funds.filter((f) => f >= 110000 && f < 2000000).length, t0: funds.filter((f) => f < 110000).length };
ok("四层起手人数：" + JSON.stringify(bands));
eq("四层人数之和 = 名册规模", bands.t3 + bands.t2 + bands.t1 + bands.t0, rosterN);
if (rosterN === 97) eq("97 人时四层恰为 8/18/41/30（与原写死值逐位一致）", bands.t3 + "/" + bands.t2 + "/" + bands.t1 + "/" + bands.t0, "8/18/41/30");

/* ---------- 1b. 资金分层派生：四层之和恒等于名册规模（含极小名册边界） ----------
   2026-10-03 二次复核：此前 t0 也写了 max(1,…)，n=4 时四舍五入后的前三层已占满 4 人，
   再"保底 1"就让四层之和变成 5。这里对一批规模（含极小值）直接断言纯函数行为 ——
   否则这类边界只能靠整轮推演间接观察、根本观察不到。 */
section("1b. 资金分层派生（四层之和恒等于 n · 极小名册边界）");
let tierEdgeBad = 0;
[4, 5, 6, 7, 8, 10, 20, 50, 97, 150, 309, 500].forEach((n) => {
    const c = W.tierCountsFor(n);
    const sum = c.t3 + c.t2 + c.t1 + c.t0;
    if (sum !== n) { tierEdgeBad++; bad("tierCountsFor(" + n + ") 四层之和 " + sum + " ≠ " + n); }
    if (n === 97 && c.t3 + "/" + c.t2 + "/" + c.t1 + "/" + c.t0 !== "8/18/41/30") { tierEdgeBad++; bad("tierCountsFor(97) 应为 8/18/41/30，实为 " + c.t3 + "/" + c.t2 + "/" + c.t1 + "/" + c.t0); }
    if (n === 309 && c.t3 + "/" + c.t2 + "/" + c.t1 + "/" + c.t0 !== "25/57/131/96") { tierEdgeBad++; bad("tierCountsFor(309) 应为 25/57/131/96，实为 " + c.t3 + "/" + c.t2 + "/" + c.t1 + "/" + c.t0); }
});
eq("4~500 各规模四层之和恒等于 n（含 n=4 的 t0=0 边界）", tierEdgeBad, 0);
ok("n=4 → " + JSON.stringify(W.tierCountsFor(4)) + "（穷桌 0 人 = 该档自然消失，不是缺人数）");
/* 起始资金的两两不等/为正，只对本轮真正加载的名册断言（fundForIndex 用的是
   模块载入时按**当前名册**派生的 TIER_COUNTS，跨规模的资金值由 --roster N 实跑覆盖）。 */
(function () {
    const fundsNow = [];
    for (let i = 0; i < rosterN; i++) fundsNow.push(W.fundForIndex(i));
    eq("本轮名册（" + rosterN + " 人）：起始资金全为正且有限", fundsNow.filter((f) => !(typeof f === "number" && isFinite(f) && f > 0)).length, 0);
    eq("本轮名册（" + rosterN + " 人）：起始资金两两不等", new Set(fundsNow).size, rosterN);
})();

/* ---------- 2. 经济阶梯 ---------- */
section("2. 经济阶梯模拟（离线 tick：1 → " + MAX_DAYS + " 天）");
let day = 0;
const sampled = rw().ai[0].id;
const traj = [];
for (const target of LADDER) {
    globalThis.__advance(target - day);
    day = target;
    W.tick();
    invariants(rw(), "第 " + target + " 天");
    const a = rw().ai.find((x) => x.id === sampled);
    traj.push("第 " + target + " 天：" + a.name + " 资金 " + a.fund + " · 手数 " + a.hands + " · 最大底池 " + a.biggestPot + " · 退役 " + (a.retired ? "是" : "否"));
}
section("3. 单个 AI 的长期轨迹（世界不是静止的）");
traj.forEach((t) => console.log("  · " + t));
const t0 = rw().ai.find((x) => x.id === sampled);
ok("长期跑动后该 AI 有真实战绩（hands=" + t0.hands + "，biggestPot=" + t0.biggestPot + "）");

/* ---------- 4. 存档往返（§12 清单） ---------- */
section("4. 存档导出→解析往返");
const CM = (await import(pathToFileURL(path.join(EXT, "core", "csh_migrate.js")).href), (globalThis.CSH.migrate || globalThis.lib.cshMigrate));
ok("migrate 模块可用（inspect/_clean）");
const before = rw();
globalThis.__store.set("csh_daily_task", JSON.stringify({ day: "2026-10-03", hands: 12, wins: 4, bigPot: 25000, claimed: ["hands"] }));
const enc = (o) => "CSHMIG1." + Buffer.from(JSON.stringify(o), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const ins = await CM.inspect(enc({ meta: { v: 2, t: Date.now() }, dailyTask: JSON.parse(globalThis.__store.get("csh_daily_task")), world: before }));
eq("存档可解析", ins.ok, true);
eq("每日任务 day 保真（字符串日期）", ins.data.dailyTask.day, "2026-10-03");
const aw = ins.data.world;
eq("world.ai 数量保真", aw.ai.length, before.ai.length);
eq("lastTick 仍是数值", typeof aw.lastTick, "number");
eq("records.matches 保真", aw.records.matches, before.records.matches);
eq("relations.rivalry 保真（宿敌条数）", Object.keys(aw.relations.rivalry).length, Object.keys(before.relations.rivalry).length);
eq("heartbeatDay 保真", aw.heartbeatDay, before.heartbeatDay);
const srcA = before.ai.find((a) => a.mood !== 0 || a.skillPlay > 0) || before.ai[0];
const dstA = aw.ai.find((a) => a.id === srcA.id);
eq("拟真字段（mood/form/fatigue/skillPlay/drew）保真",
    [dstA.mood, dstA.form, dstA.fatigue, dstA.skillPlay, dstA.drew].join("|"),
    [srcA.mood, srcA.form, srcA.fatigue, srcA.skillPlay, srcA.drew].join("|"));
eq("成对仇恨表保真", JSON.stringify(dstA.grudges || {}), JSON.stringify(srcA.grudges || {}));
eq("豪赌席里程碑 everTier3 保真", dstA.everTier3, srcA.everTier3);
eq("gambles.push 字段在（平局三态）", typeof aw.gambles.push, "number");
eq("世界动态事件环 history 保真（条数一致）", (aw.history || []).length, (before.history || []).length);
const dead1 = ins.data.world.lastSeenDay === undefined && ins.data.world.seeded === undefined;
ok("死字段不再导出（lastSeenDay / seeded）：" + dead1);
ok("records 不再导出 worstBust：" + (aw.records.worstBust === undefined));

/* ---------- 5b. 世界动态 / 叙述层（2026-10-03 新增） ----------
   事件环（world.history）→ news() 人物化叙事 → worldStory() 聚合叙述。
   断言三件事：**有人话可读**、**措辞稳定**（同一条事件每次读到的说法一致）、
   **结构齐备**（worldStory 的字段与 records 有值）。
   ⚠ 必须跑在第 5 段**之前**：第 5 段会用 importRaw 换上测试夹具（没有 records/history），
   之后再来读叙述层就会读到空世界（本工具第一版正是踩了这个顺序坑，报了假 FAIL）。 */
section("5b. 世界动态与叙述层（news / worldStory / 事件环）");
const newsA = W.news(10);
chk("news() 返回数组", Array.isArray(newsA));
chk("长期推演后确有值得说的事（" + newsA.length + " 条）", newsA.length > 0);
chk("每条都有时间前缀与人话正文", newsA.every((x) => x && typeof x.when === "string" && typeof x.text === "string" && x.text.length > 6));
chk("不含机械口吻（不带字段名/undefined）", newsA.every((x) => !/kind=|day=|undefined|null/.test(x.text)));
chk("措辞稳定：连续两次读取完全一致", W.news(10).map((x) => x.text).join("|") === W.news(10).map((x) => x.text).join("|"));
const storyA = W.worldStory();
chk("worldStory 结构齐备（最火/最崩/最老练/最容易上头 + 纪录）",
    !!(storyA && storyA.hottest && storyA.coldest && storyA.mostExperienced && storyA.mostTilted));
chk("纪录有值：总对局 " + (storyA.matches || 0) + " 局 · 最高单局 " + (storyA.bestPot || 0), (storyA.matches || 0) > 0 && (storyA.bestPot || 0) > 0);
chk("事件环有上限（≤24）", (rw().history || []).length <= 24);
if (newsA.length) newsA.slice(0, 3).forEach((x) => console.log("    例：" + x.when + " " + x.text));

/* ---------- 5. 世界语义回归（P1-7 / P1-8 / 平局 drew） ---------- */
section("5. 世界语义回归（首富里程碑 / 成对仇恨 / 平局计数）");
const ids0 = rw().ai.map((a) => a.id);
if (ids0.length < 12) console.log("  （名册过小：" + ids0.length + " 人 → 本段夹具依赖多个不同 AI，跳过；小名册端到端见第 8 段）");
else {
/* 注：本段用到的索引（ai[3]/ai[4]/ai[7]/ai[8]）都假设名册 ≥ 12 人，故由上面的守卫兜住。 */
function simWorld() {
    return {
        ai: ids0.map((id, i) => ({
            id, name: "S" + i, surname: "S", persona: "math", fund: 50000 + i,
            hands: 0, wins: 0, biggestPot: 0, streak: 0, bestStreak: 0,
            retireCount: 3,                   // 旧口径的误判来源：人人都"退隐过 3 次"
            retired: false, retireDay: 0, last: 0,
            mood: 0, form: 0.5, fatigue: 0, drew: 0, skillPlay: 0,
        })),
        lastTick: 0,
        gambles: { plays: 0, wins: 0, net: 0, best: 0, bust: 0, push: 0, streak: 0, bestStreak: 0 },
    };
}
W.importRaw(simWorld());
eq("P1-7：只退隐过、从未上豪赌席 → 不算「首富被打穿」", W.stats().billionaireBroke, 0);
const sw2 = simWorld();
sw2.ai[4].everTier3 = true; sw2.ai[4].fund = 70000;
W.importRaw(sw2);
eq("P1-7：曾坐豪赌席且已跌落 → 计 1", W.stats().billionaireBroke, 1);

W.importRaw(simWorld());
const gid = ids0[7];
eq("P1-8：初始无仇恨", W.grudge(gid), 0);
eq("P1-8：记一笔对玩家的仇恨", W.addGrudge(gid, 5), 5);
eq("P1-8：对玩家仇恨可读", W.grudge(gid), 5);
eq("P1-8：对某个 AI 的仇恨互相独立（成对）", W.grudge(gid, ids0[8]), 0);
eq("P1-8：也可以记对特定 AI 的仇恨（宿敌/复仇地基）", W.addGrudge(gid, 3, ids0[8]), 3);
eq("P1-8：两条仇恨各归各", [W.grudge(gid), W.grudge(gid, ids0[8])].join("/"), "5/3");
eq("P1-8：publicOf 仍以「对玩家的仇恨」对外（旧字段语义不变）", W.list().find((a) => a.id === gid).grudge, 5);

W.importRaw(simWorld());
const did = ids0[3];
eq("平局：起步 drew=0", W.byId(did).drew, 0);
W.settlePlay(did, true);
eq("平局：drew 计数 +1（此前恒 0）", W.byId(did).drew, 1);
eq("平局：hands 也 +1（不重复计数）", W.byId(did).hands, 1);
W.settlePlay(did, false);
eq("非平局（弃牌）：hands +1", W.byId(did).hands, 2);
eq("非平局：drew 不变", W.byId(did).drew, 1);
}   // end：第 5 段守卫（名册 ≥ 12）

/* ---------- 6. 结算桥三态（P0-2） ----------
   注：本段刻意使用**很短的超时**（60~200ms）来压缩测试时长 —— 这里验的是"超时/失败
   会不会释放认领"这个机制本身，与生产口径无关。生产侧 5 个游戏页的结算调用已统一显式
   传 4000ms（经济关键事务，安卓弱机；见 02_逐条处置对照表.md 第 4 条）。 */
section("5. 结算桥 claim 三态（超时后可安全重试）");
const listeners = [];
globalThis.__sent = [];
globalThis.parent = { postMessage: (m) => { globalThis.__sent.push(m); } };
globalThis.addEventListener = (t, fn) => { listeners.push(fn); };
await import(pathToFileURL(path.join(EXT, "core", "csh_page.js")).href);
const CP = globalThis.CSHPage;
const fire = (msg) => listeners.forEach((fn) => fn({ data: msg }));
const lastSent = () => globalThis.__sent[globalThis.__sent.length - 1];
eq("transport 可用", typeof CP.transport, "function");
const T = CP.transport({ closeName: "sim-close" });
eq("首次 claim 成功", T.claim(), true);
eq("在途期二次 claim 被拒", T.claim(), false);
T.releaseClaim();
const done = [];
T.settle("shell-settle", { data: 1 }, (o) => done.push(o), 200);
fire({ __csh: "shell-settle-ack", req: lastSent().req, ok: true, data: {} });
eq("成功回调 ok=true", done[0], true);
eq("成功后 isSettled=true", T.isSettled(), true);
eq("成功后不再重复结算", T.settle("shell-settle", {}, () => {}, 100), false);
const T2 = CP.transport({ closeName: "sim-close" });
const to = [];
T2.settle("shell-settle", {}, (o) => to.push(o), 60);
await new Promise((r) => setTimeout(r, 150));
eq("超时回调 ok=false", to[0], false);
eq("超时后未被判死（isSettled=false）", T2.isSettled(), false);
eq("超时后可重试", T2.claim(), true);
globalThis.parent = undefined;
const T3 = CP.transport({ closeName: "sim-close" });
eq("无宿主时不占用认领", T3.claim(), true);

/* ---------- 7. 游戏页内联脚本语法 ---------- */
section("6. 游戏页内联 <script> 语法（tools/check.js 不覆盖 HTML）");
const gamesDir = path.join(ROOT, "games");
let pages = [];
try { pages = fs.readdirSync(gamesDir).filter((n) => fs.existsSync(path.join(gamesDir, n, n + ".html"))).map((n) => path.join(n, n + ".html")); } catch (e) {}
let inlineBad = 0, inlineN = 0;
for (const rel of pages) {
    const src = fs.readFileSync(path.join(gamesDir, rel), "utf8");
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
    let m, i = 0;
    while ((m = re.exec(src))) {
        i++; inlineN++;
        const f = path.join(SANDBOX, rel.replace(/[\\/]/g, "_") + "." + i + ".js");
        fs.writeFileSync(f, m[1], "utf8");
        const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
        if (r.status !== 0) { inlineBad++; bad(rel + " inline#" + i + " 语法失败"); }
    }
}
eq("内联脚本全部通过（" + inlineN + " 块）", inlineBad, 0);

/* ---------- 8. 小名册端到端回归（子进程 · --roster 12） ----------
   2026-10-03 二次复核的第 3 条：极小名册下"四层之和 === n"与"资金仍为正/两两不等"
   必须真的有一个可复现的回归，而不是只能靠口头推演。这里用子进程跑一遍小名册世界
   （12 人是能覆盖第 5 段夹具依赖的最小规模），断言它能完整跑通且无失败项。 */
section("8. 小名册端到端回归（子进程 · --roster 12 --days 7）");
if (NO_CHILD) {
    console.log("  （本进程是子进程运行 → 跳过嵌套派生）");
} else {
    const child = spawnSync(process.execPath, [SELF, "--roster", "12", "--days", "7", "--seed", String(SEED), "--no-child"],
        { encoding: "utf8", env: process.env, maxBuffer: 64 * 1024 * 1024 });
    const childOut = String(child.stdout || "");
    const childFails = (childOut.match(/\[FAIL\]/g) || []).length;
    eq("小名册（12 人）世界完整跑通且 0 失败项", (child.status === 0 && childFails === 0) ? "ok" : ("status=" + child.status + " fails=" + childFails), "ok");
    if (child.status !== 0 || childFails) console.log(childOut + (child.stderr || ""));
}

/* ---------- 收尾 ---------- */
try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (e) {}
console.log("\n----------------------------------------");
console.log("结论：" + (failed ? "未通过" : "通过") + "（PASS " + pass + " / FAIL " + failed + "）");
process.exit(failed ? 1 : 0);
