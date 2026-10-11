// 函数级抽取执行：从 career.html 抽出本会话改动过的渲染函数，真跑一遍
const fs = require("fs"), path = require("path"), vm = require("vm");
const page = process.argv[2];
const html = fs.readFileSync(page, "utf8");
const code = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(x => x[1]).join("\n");

function extract(name) {
  const at = code.indexOf("function " + name + "(");
  if (at < 0) return null;
  let i = code.indexOf("{", at), depth = 0;
  for (let j = i; j < code.length; j++) {
    const c = code[j];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return code.slice(at, j + 1); }
  }
  return null;
}

const calls = [];
function mkAny(tag) {
  return new Proxy(function () {}, {
    get(t, k) {
      if (k === Symbol.toPrimitive || k === "valueOf") return () => 0;
      if (k === "toString") return () => tag || "stub";
      if (k === "length") return 0;
      return mkAny((tag ? tag + "." : "") + String(k));
    },
    apply() { return mkAny(tag + "()"); },
    set() { return true; },
  });
}
const env = {
  State: new Proxy({ snap: null, world: null, ranks: null, tasks: null }, { get(t, k) { return t[k] !== undefined ? t[k] : mkAny("State." + String(k)); }, set(t, k, v) { t[k] = v; return true; } }),
  fmt: (n) => String(n), tr: (s) => String(s), esc: (s) => String(s),
  $: (sel) => mkAny("$" + sel),
  el: (t, c, x) => mkAny("el"),
  fillBoard: (sel, arr, v, s) => { calls.push({ sel, n: Array.isArray(arr) ? arr.length : -1 }); },
  /* renderOverview 会连带驱动这几个渲染器；单抽时它们不在作用域内（属抽取限制），
     给空实现即可 —— 本 harness 的目的是验 renderOverview 自身不抛错、调用链齐全。 */
  renderToday: () => {}, renderTasksInto: () => {}, renderQuick: () => {},
  renderNarrative: () => {}, minFund: () => 0, maxFund: () => 0, maxSkill: () => 1,
  document: { querySelector: () => mkAny("qs"), querySelectorAll: () => [], getElementById: () => mkAny("gid"), createElement: () => mkAny("ce") },
  window: {}, console,
  setTimeout: (f) => { try { f(); } catch (e) {} return 0; },
};
env.globalThis = env;
const ctx = vm.createContext(env);
let errN = 0;
/* 先注入同作用域兄弟函数（抽取执行时 renderOverview 会引用 segOfRank 等——
   完整脚本里同作用域可见，单抽时不可见，属于抽取限制而非真错）。
   2026-10-07 A1.5：新增 tiered / setTiered（两档文案生成器）供 renderOverview / renderToday 使用，
   抽取时同样不在作用域内 —— 今后每新增一个页面级小工具，来这里补一行。 */
for (const helper of ["segList", "segOfRank", "segColor", "perksOf", "nextThreshold", "tiered", "setTiered"]) {
  const hs = extract(helper);
  if (hs) { try { vm.runInContext(hs, ctx, { filename: page + ":" + helper }); } catch (e) {} }
}
for (const fn of ["renderBoard", "renderOverview"]) {
  const src = extract(fn);
  if (!src) { console.log("  [skip] 未找到", fn); continue; }
  try {
    vm.runInContext(src + "\n;globalThis.__f = " + fn + ";", ctx, { filename: page + ":" + fn });
    ctx.State.snap = { pc: 1234, pcPeak: 2000, streak: 5, meWrWin: 3, meWrGames: 5, meBigPot: 700, rank: { rank: 1 }, tasks: { defs: [1, 2, 3], claimed: [1] } };
    ctx.State.world = { ai: [{ name: "A", fund: 100, skill: 0.5, hands: 6, wins: 3, biggestPot: 50, retired: false }, { name: "B", fund: 200, skill: 0.6, hands: 8, wins: 2, biggestPot: 60 }] };
    ctx.__f();
    console.log("  [fn-ok]", fn, "执行无异常");
  } catch (e) {
    errN++;
    console.log("  [FN-FAIL]", fn, "->", e.name + ": " + e.message);
    console.log("     ", (e.stack || "").split("\n").slice(1, 3).join("\n      "));
  }
}
console.log("   fillBoard 调用：", JSON.stringify(calls));
process.exitCode = errN ? 1 : 0;
