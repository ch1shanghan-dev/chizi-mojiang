/* 势力面板宽度修复 · 定量验证（2026-10-18 · 第三修：只封顶不设宽）
   ------------------------------------------------------------
   做什么：用**引擎真实的 layout.css** 搭出 dialog > content-container > content > buttons，
   把「父容器宽度」当自变量（376 / 849 / 1400，分别代表 引擎默认 / 十周年UI 96% / 插件乱改），
   逐字复刻 main/content.js 里 cshEgStyleGroupDialog 的动作，然后测量：
     · .buttons 的实际宽度有没有被钳到视口内
     · 最后一个按钮的右边界是否还在屏内（这才是"能不能点到"）
     · 纵向是否还能滚（行数变多是必然的，不是 bug）
   用法：node tools/probe_egwidth.cjs [winW] [winH] [zoom] [buttonCount] [buttonWidth]
   输出：每个场景一行 JSON。 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const W = Number(process.argv[2] || 900);
const H = Number(process.argv[3] || 600);
const ZOOM = Number(process.argv[4] || 1);
const N = Number(process.argv[5] || 24);
const BTNW = Number(process.argv[6] || 140);

const ENGINE_CSS = path.resolve(__dirname, "..", "..", "..", "layout", "default", "layout.css");
const css = fs.readFileSync(ENGINE_CSS, "utf8");
const G = ["魏", "蜀", "吴", "群", "晋", "秦", "客", "齐", "燕", "楚", "锦", "赵", "张楚", "西楚", "汉", "南", "东汉", "龙魂", "韩", "吴1", "蜀1", "魏1", "群1", "晋1", "秦1"];
const btns = G.slice(0, N).map((g) => `<div class="button card" style="width:${BTNW}px"><div class="name">${g}</div></div>`).join("");
const PARENT_W = [376, 849, 1400];

const mk = (w, i) => `<div class="stage"><div class="dialog d${i}" style="width:${w}px;left:50%;transform:translateX(-50%)">` +
  `<div class="caption"><div class="text">请选择你的势力</div></div>` +
  `<div class="content-container"><div class="content"><div class="buttons">${btns}</div></div></div></div></div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><title>PENDING</title><style>${css}</style>
<style>
body{margin:0;transform:scale(${ZOOM});transform-origin:top left;}
.stage{position:relative;height:${Math.round(H / ZOOM)}px;}
/* 与 content.js 的 cshEgScrollApply 完全一致 */
.csh-egsc .csh-egdlg{overflow:hidden;overscroll-behavior:contain}
.csh-egsc .csh-egdlg .content-container{overflow-y:auto;overflow-x:hidden;box-sizing:border-box}
/* 2026-10-18 第三修：只封顶，不设 width —— 设 width 会覆盖引擎的 calc(100% - 8px)，列数会跳 */
.csh-egsc .csh-egdlg .buttons{max-width:100%;box-sizing:border-box}
.csh-egsc .csh-egdlg .content-container .buttons>.card{max-width:100%;box-sizing:border-box}
</style></head><body class="csh-egsc">
${PARENT_W.map(mk).join("")}
<script>
window.addEventListener("load", function () {
  try {
    var vw = innerWidth, vh = innerHeight;
    var res = [];
    var PARENT_W = ${JSON.stringify(PARENT_W)};
    PARENT_W.forEach(function (pw, i) {
      var d = document.querySelector(".d" + i);
      var cc = d.querySelector(".content-container");
      var bs = d.querySelector(".buttons");

      /* ---- 修复前基线（只测量，不改样式）---- */
      var r0 = d.getBoundingClientRect();
      var basePerRow = 0, y0 = null, baseMaxRight = 0;
      bs.querySelectorAll(".button").forEach(function (b) {
        var bb = b.getBoundingClientRect();
        var yy = Math.round(bb.top);
        if (y0 === null) y0 = yy;
        if (yy === y0) basePerRow++;
        if (bb.right > baseMaxRight) baseMaxRight = bb.right;
      });
      var base = { btnW: bs.offsetWidth, perRow: basePerRow, maxRight: Math.round(baseMaxRight),
        outOfScreen: Math.round(baseMaxRight - vw) };

      /* ---- 逐字复刻 cshEgStyleGroupDialog ---- */
      var z = 1;
      try { var oh = d.offsetHeight, rh = d.getBoundingClientRect().height; if (oh > 0 && rh > 0) z = rh / oh; } catch (e) {}
      if (!(z > 0.05)) z = 1;
      var capW = Math.max(220, Math.floor((vw - 16) / z));
      var top = Math.max(0, Math.min(d.getBoundingClientRect().top || 0, vh));
      var capH = Math.max(200, Math.floor((vh - top - 8) / z));
      d.classList.add("csh-egdlg");
      d.style.maxHeight = capH + "px";
      d.style.maxWidth = capW + "px";
      d.style.overflow = "hidden";
      d.style.overscrollBehavior = "contain";
      d.style.setProperty("--csh-egw", capW + "px");
      cc.style.overflowX = "hidden";
      cc.style.overflowY = "auto";
      cc.style.boxSizing = "border-box";
      cc.style.paddingRight = Math.round(10 / z) + "px";
      bs.style.setProperty("width", "min(100%, " + capW + "px)", "important");
      bs.style.setProperty("max-width", "100%", "important");
      bs.style.setProperty("box-sizing", "border-box", "important");
      var r1 = d.getBoundingClientRect();
      if (r1.right > vw - 4) d.style.marginLeft = (-Math.ceil((r1.right - (vw - 4)) / z)) + "px";
      else if (r1.left < 4) d.style.marginLeft = Math.ceil((4 - r1.left) / z) + "px";

      /* ---- 修复后 ---- */
      var r = d.getBoundingClientRect();
      var perRow = 0, y1 = null, maxRight = 0;
      bs.querySelectorAll(".button").forEach(function (b) {
        var bb = b.getBoundingClientRect();
        var yy = Math.round(bb.top);
        if (y1 === null) y1 = yy;
        if (yy === y1) perRow++;
        if (bb.right > maxRight) maxRight = bb.right;
      });
      res.push({
        parentW: pw,
        before: base,
        after: {
          btnW: bs.offsetWidth, ccW: cc.clientWidth, perRow: perRow,
          maxRight: Math.round(maxRight), outOfScreen: Math.round(maxRight - vw),
          hOverflow: bs.scrollWidth > cc.clientWidth + 1,
          vScroll: cc.scrollHeight > cc.clientHeight + 1,
          dlgLeft: Math.round(r.left), dlgRight: Math.round(r.right),
          dlgInView: r.left >= -1 && r.right <= vw + 1,
          allBtnInView: maxRight <= vw + 1,
        },
      });
    });
    document.title = "PROBE" + JSON.stringify({ win: innerWidth + "x" + innerHeight, zoom: ${ZOOM}, res: res });
  } catch (E) {
    document.title = "ERR:" + E.message;
  }
});
</script></body></html>`;

const file = path.join(__dirname, "run4.html");
fs.writeFileSync(file, html, "utf8");

const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
let out = "";
try {
  out = execFileSync(chrome, ["--headless=new", "--disable-gpu", `--window-size=${W},${H}`,
    "--virtual-time-budget=3000", "--dump-dom", "file:///" + file.replace(/\\/g, "/")],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
} catch (e) {
  console.log("chrome 执行失败:", e.message);
  process.exit(1);
}
const m = out.match(/<title>([^<]*)<\/title>/);
if (!m) { console.log("没抓到 title"); process.exit(1); }
if (m[1].startsWith("ERR:")) { console.log(m[1]); process.exit(1); }
const data = JSON.parse(m[1].slice(5));
console.log(`窗口 ${data.win} · 缩放 ${data.zoom} · 按钮宽 ${BTNW} · 数量 ${N}`);
for (const r of data.res) {
  const b = r.before, a = r.after;
  console.log("");
  console.log(`父宽 ${r.parentW}`);
  console.log(`  修复前: .buttons=${b.btnW}  每行 ${b.perRow} 个  最右 ${b.maxRight}  出屏 ${b.outOfScreen}px`);
  console.log(`  修复后: .buttons=${a.btnW}  每行 ${a.perRow} 个  最右 ${a.maxRight}  出屏 ${a.outOfScreen}px` +
    `  横向溢出=${a.hOverflow}  纵向可滚=${a.vScroll}  对话框在屏内=${a.dlgInView}  全部按钮在屏内=${a.allBtnInView}`);
}
const bad = data.res.filter((r) => r.after.outOfScreen > 1 || r.after.hOverflow || !r.after.allBtnInView);
console.log("");
console.log(bad.length ? `❌ ${bad.length} 个场景仍有按钮出屏` : "✅ 三种父宽下，全部按钮都在屏内、无横向溢出（纵向可滚）");
process.exit(bad.length ? 1 : 0);
