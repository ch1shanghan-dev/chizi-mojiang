// 顶层冒烟执行 harness：真 DOM stub + 真实依赖文件 + 页面内联脚本
const fs = require("fs");
const vm = require("vm");

function mkEl() {
  const el = {
    style: {}, dataset: {}, children: [], childNodes: [],
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    appendChild(c){ this.children.push(c); return c; },
    insertBefore(c){ this.children.push(c); return c; },
    removeChild(){}, remove(){}, setAttribute(){}, getAttribute(){ return null; },
    addEventListener(){}, removeEventListener(){}, contains(){ return false; },
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    closest(){ return null; }, focus(){}, select(){}, scrollIntoView(){},
    getBoundingClientRect(){ return {top:0,left:0,width:0,height:0}; },
    get firstChild(){ return this.childNodes[0] || null; },
    get parentNode(){ if (!this._pn) this._pn = mkEl(); return this._pn; }, textContent: "", innerHTML: "", value: "",
  };
  return el;
}
const elCache = new Map();
const doc = {
  querySelector(sel){ if (!elCache.has(sel)) elCache.set(sel, mkEl()); return elCache.get(sel); },
  querySelectorAll(){ return []; },
  getElementById(id){ if (!elCache.has("#" + id)) elCache.set("#" + id, mkEl()); return elCache.get("#" + id); },
  createElement(){ return mkEl(); },
  createTextNode(t){ return { textContent: t }; },
  addEventListener(){}, removeEventListener(){},
  documentElement: mkEl(), head: mkEl(), body: mkEl(),
  readyState: "complete", hidden: false, currentScript: null,
};
global.document = doc;
global.window = global;
global.localStorage = { getItem(){ return null; }, setItem(){}, removeItem(){} };
global.sessionStorage = global.localStorage;
global.navigator = { userAgent: "harness" };
global.postMessage = function(){};
global.addEventListener = function(){};
global.removeEventListener = function(){};
global.requestAnimationFrame = function(cb){ try { cb(0); } catch(e){} };
global.setInterval = function(){ return 0; };
global.clearInterval = function(){};
global.performance = { now(){ return 0; } };

const EXT = process.argv[2];
const page = process.argv[3];
// 1) 先执行页面依赖的真实文件（按 src 顺序）
const deps = [];
const html = fs.readFileSync(page, "utf8");
const srcRe = /<script[^>]+src="([^"]+)"[^>]*>/g;
let m;
while ((m = srcRe.exec(html))) deps.push(m[1]);
for (const d of deps) {
  if (!/csh_/.test(d)) continue;                    // 只跑扩展自己的依赖
  const p = require("path").resolve(require("path").dirname(page), d);
  if (!fs.existsSync(p)) { console.log("  [skip] 依赖缺失:", d); continue; }
  try {
    vm.runInThisContext(fs.readFileSync(p, "utf8"), { filename: p });
  } catch (e) { console.log("  [dep-fail]", d, "->", e.message); }
}
// 2) 执行页面内联脚本（顶层冒烟：捕获 ReferenceError/TypeError）
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(x => x[1]);
let errN = 0;
blocks.forEach((b, i) => {
  try {
    vm.runInThisContext(b, { filename: page + "#block" + i });
    console.log("  [smoke-ok] 内联块", i, "顶层执行无异常");
  } catch (e) {
    errN++;
    console.log("  [SMOKE-FAIL] 内联块", i, "->", e.name + ": " + e.message);
    console.log("     ", (e.stack || "").split("\n").slice(1, 4).join("\n      "));
  }
});
process.exitCode = errN ? 1 : 0;
