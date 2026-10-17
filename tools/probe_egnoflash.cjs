/* 势力面板「自适应跳变」定量验证（2026-10-18 · 第二十八批）
   ============================================================
   作者实机反馈：面板出现时「会这样一下」—— 图一是 4 列、贴着选将界面，
   图二变成 5 列、宽灰底。要回答"这是不是 BUG"，只能把两种实现放在
   引擎真实 layout.css 下量一遍。

   三个场景（同一窗口、同一组按钮、只改"我们做了什么"）：
     A  引擎原样        —— 什么都不加（对照组）
     B  只封顶          —— max-width / max-height / overflow（被动，只在超限时生效）
     C  当前实现        —— 在 B 之上还给 .buttons 设 width: min(100%, Npx)（主动参与布局）

   判断标准：
     · B 与 A 的列数/宽度**完全一致** ⇒ "正常面板零变化"，不会跳
     · C 与 A 不同                ⇒ 列数变化是**我们主动改布局**造成的，就是那个"一下"
   用法：node tools/probe_egnoflash.cjs [winW] [winH] [zoom] [buttonCount]
*/
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const W = Number(process.argv[2] || 984);
const H = Number(process.argv[3] || 784);
const ZOOM = Number(process.argv[4] || 1);
const N = Number(process.argv[5] || 10);

const ENGINE_CSS = path.resolve(__dirname, "..", "..", "..", "layout", "default", "layout.css");
const css = fs.readFileSync(ENGINE_CSS, "utf8");

/* 与截图一致：魏 蜀 吴 群 晋 佛 + 综漫季刊八那四个未翻译的 id */
const G = ["魏势力", "蜀势力", "吴势力", "群势力", "晋势力", "佛势力", "group_zm8ru", "group_zm8lin", "group_zm8do", "group_zm8ke"];
const btns = G.slice(0, N).map((g) => `<div class="button card"><div class="name">${g}</div></div>`).join("");

const mk = (cls) => `<div class="stage"><div class="dialog csh-scene ${cls}">` +
  `<div class="caption"><div class="text">请选择你的势力</div></div>` +
  `<div class="content-container"><div class="content"><div class="buttons">${btns}</div></div></div></div></div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><title>PENDING</title><style>${css}</style>
<style>
body{margin:0;transform:scale(${ZOOM});transform-origin:top left;width:${Math.round(W / ZOOM)}px;}
.stage{position:relative;height:${Math.round(H / ZOOM)}px;}
/* —— B / C 共用的规则（与 content.js 保持一致）—— */
.scene-b, .scene-c { max-width: ${Math.round((W - 16) / ZOOM)}px !important; }
.scene-b > .content-container, .scene-c > .content-container{
  overflow-y:auto !important; overflow-x:hidden !important;
  box-sizing:border-box !important; padding-right:${Math.round(10 / ZOOM)}px !important;
}
.scene-b .buttons, .scene-c .buttons{ max-width:100% !important; box-sizing:border-box !important; }
/* —— C 独有：主动给宽度 —— */
.scene-c .buttons{ width: min(100%, ${Math.round((W - 16) / ZOOM)}px) !important; }
</style></head><body>
${mk("scene-a")}${mk("scene-b")}${mk("scene-c")}
<script>
window.addEventListener("load", function () {
  var out = [];
  ["a", "b", "c"].forEach(function (k) {
    var d = document.querySelector(".scene-" + k);
    var bs = d.querySelector(".buttons");
    var cc = d.querySelector(".content-container");
    var perRow = 0, y0 = null, maxRight = 0;
    bs.querySelectorAll(".button").forEach(function (b) {
      var bb = b.getBoundingClientRect();
      var yy = Math.round(bb.top);
      if (y0 === null) y0 = yy;
      if (yy === y0) perRow++;
      if (bb.right > maxRight) maxRight = bb.right;
    });
    var r = d.getBoundingClientRect();
    out.push({
      scene: k,
      dlgW: Math.round(r.width),
      dlgH: Math.round(r.height),
      btnW: Math.round(bs.querySelector(".button").getBoundingClientRect().width),
      bsW: Math.round(bs.getBoundingClientRect().width),
      ccW: Math.round(cc.getBoundingClientRect().width),
      perRow: perRow,
      rows: Math.ceil(bs.querySelectorAll(".button").length / Math.max(1, perRow)),
      bsH: Math.round(bs.getBoundingClientRect().height),
      vScroll: cc.scrollHeight > cc.clientHeight + 1,
      dlgInView: r.left >= -1 && r.right <= innerWidth + 1,
      maxBtnRight: Math.round(maxRight),
      btnInView: maxRight <= innerWidth + 1,
    });
  });
  document.title = "PROBE" + JSON.stringify({ win: innerWidth + "x" + innerHeight, zoom: ${ZOOM}, res: out });
});
</script></body></html>`;

const tmp = path.join(__dirname, "_egnoflash.html");
fs.writeFileSync(tmp, html, "utf8");

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
].find((p) => fs.existsSync(p));
if (!CHROME) { console.log("找不到 Chrome，跳过（探针不阻断开发）"); process.exit(0); }

const dom = execFileSync(CHROME, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars",
  `--window-size=${W},${H}`, "--virtual-time-budget=3000", "--dump-dom",
  "file:///" + tmp.replace(/\\/g, "/"),
], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

const m = dom.match(/<title>PROBE(\{[\s\S]*?\})<\/title>/);
if (!m) { console.log("没抓到 PROBE 结果（页面脚本可能报错）"); process.exit(1); }
const data = JSON.parse(m[1]);
console.log(`窗口 ${data.win} · zoom ${data.zoom}`);
console.log("");
for (const r of data.res) {
  console.log(
    `  ${r.scene.toUpperCase()}  dialog ${r.dlgW}×${r.dlgH}  .buttons ${r.bsW}  ` +
    `按钮 ${r.btnW}×${r.perRow}列${r.rows}行  纵向滚动=${r.vScroll ? "有" : "无"}  ` +
    `全在屏内=${r.btnInView ? "是" : "否"}`
  );
}
const [a, b, c] = data.res;
console.log("");
const same = (x, y) => x.dlgW === y.dlgW && x.perRow === y.perRow && x.bsW === y.bsW;
console.log(`  B 与 A 是否一致（正常面板应零变化）：${same(a, b) ? "✅ 一致" : "❌ 不一致"}`);
console.log(`  C 与 A 是否一致（不一致 ⇒ 列数变化是我们造成的）：${same(a, c) ? "一致" : "❌ 不一致（这就是「会这样一下」的来源）"}`);
process.exit(same(a, b) ? 0 : 1);
