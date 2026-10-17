import { lib, game, ui, get, ai, _status } from "../../../noname.js";
import cshVoices from "../core/voices.js";
import { cshBossModeInstall } from "./bossmode.js";
import { installBossRecord } from "../core/csh_bossrecord.js";
import { installMarket } from "../core/csh_market.js";
import { installAffection } from "../core/csh_affection.js";
import { installUIKit } from "../core/csh_uikit.js";
import { installKamiChoice, kamiStatus } from "../core/csh_rules.js";
import { cshBossPackHide } from "../character/boss.js";

/* ============================================================
   ★ 本体兼容注入（engine-compat · 详见工作台《engine-compat清单.md》C4）
   ------------------------------------------------------------
   神/魔武将「选择势力」面板（引擎 `_doublegroup_choice` → chooseButton vcard）：
   DOM = `.dialog > .content-container > .content > .buttons`
   （dialog.js 为每组卡牌按钮各建一个 .buttons；.content-container 由引擎建）
   势力多时按钮墙溢出视口。
   ★ 2026-10-16 深夜七·实机重做（作者实机验收：旧实现「滚不动 / 范围固定」）：
      实机（开发版 · 十周年UI 环境）测得机制真相：
        ① 引擎原生滚动容器 = `.dialog > .content-container`（absolute / height:100% /
           overflow:scroll）—— 滚动范围 = 内容高 − 对话框高，这才是「原生有滚动」的来源；
        ② 对话框高度由 十周年UI 的 ui 覆盖内联写死 = min(45%屏高(桌面) / 75%屏高−80(手机),
           内容高)（normal 布局另加 350px 上限）；
        ③ 旧实现把 max-height:54vh 打在 .buttons 上 → 按钮盒子(54vh)反比对话框(45%)还高，
           内容高被截成 ~54vh → 外层滚动范围塌缩成一个**固定的 120px 小段**
           （作者所感「能滚动的范围是固定的」），且与外层双滚动条互相打架（「滚不动」）。
      重做方案（单条原生滚动条 · 一处封顶）：
        ④ 对话框本体封顶（2026-10-18 起改为**按真实缩放换算的 px**，不再用 70vh，
           也不用全局选择器；只作用于 JS 内容判定命中的 .csh-egdlg）——
           max-height 与内联 height 是两个属性，**无需 !important** 即可兜底；
           正常面板（十周年UI 45% / 引擎布局约 40vh）不触发，只在「内容撑满、比屏幕还高、
           尾部够不到」时兜底（手机端 75%屏高−80 超屏的场景即此类）；
        ⑤ 不再截断 .buttons，滚动整条交还原生 .content-container（滚动阴影 / 细滚动条
           样式随它走）—— 滚轮在卡片上与面板空白处行为一致，从头到尾一条滚动条。
   ★ 两个必须：① **在 content 加载时立即注入**（面板在开局选将时就出现，不能等任何懒加载）；
   ② 挂 class 门控（`html.csh-egsc`）→ 设置项 `csh_eg_group_scroll` 可即时开关。
   初版教训（2026-10-16 晚）：误注入到 cshShoushaFx 的懒注入块里 —— 要等第一次击杀
   特效播放才生效，等于没装。E45 门禁已锚定"两处不得混居"。 */
/* ★ 2026-10-17 · 势力面板「第二形态」识别（作者实机：斗地主也有势力面板，滚动条却没生效 = BUG）
   ----------------------------------------------------------------------------
   根因：旧选择器 `.dialog:has(.card.button)` 只认**卡牌形**势力按钮（神/魔「双势力」那种
         带立绘的 vcard）。而另一些模式（斗地主等）的「请选择…势力」面板用的是**普通按钮**，
         命中不到 ⇒ 面板一路溢出到屏幕外、没有滚动条。
   修法：不再猜 DOM 形态，改为**运行时按内容判定**（三条判据任一：标题含「势力」/ 按钮 link 是
         `group_*` / 按钮文字多数是 lib.group 的译名），命中后**直接写内联样式**并打 `.csh-egdlg`
         ⇒ 与按钮形态、DOM 层级、模式全部无关。
   ★ 2026-10-17 二次修正（作者：除身份模式外全失效）：观察器原本绑 `ui.arena` —— arena 元素
     会随开局重建，绑旧元素等于挂在已摘除的节点上、永不触发。现改绑 `document.documentElement`，
     并补「内联样式」兜底（不依赖 CSS 选择器深度 / 优先级）。
   ★ 2026-10-18 三次修正（作者实机：一开滚动条，选项→卡牌/扩展页被压成 70vh 还多一条滚动条；
     关掉后仍残留；手机端更明显）—— 根因两条，都是「用选择器猜形态」的债：
       ① 旧 CSS 的 `:has(.card.button)` 全局规则会命中引擎主菜单
          （`ui/create/menu/index.js:135` 造的 `.main.menu.dialog`）：切到卡牌/武将页即含
          `.card.button` ⇒ 整个选项菜单被 max-height 压扁、overflow:hidden 裁掉下半截。
       ② `70vh` 是局部视口单位，而对话框活在 `body{transform:scale(documentZoom)}` 里
          （引擎 ui/index.js:592；十周年UI overrides/ui/update.js 实测）⇒ 实际只有
          屏幕的 70%×zoom（手机 zoom≈0.4 时只剩 28%），所以手机端更夸张。
     修法：CSS 只认 JS 内容判定后打上的 `.csh-egdlg`（全局 `:has` 规则永久废弃）；
          打标器显式排除 `.menu` / `.menu-container`；封顶按「真实可视像素 ÷ 实际缩放」
          换算成局部 px；关开关或撤销标记时把内联样式一并还原。
   成本：只在新节点插入时做一次 closest('.dialog')，O(1)；没有全表轮询。 */
var _cshEgMO = null;
var _cshEgGroupNames = null;
/* 势力译名集（用 lib.group + lib.translate 现算，不抄第二份名单）——用于「按按钮文字判定」 */
function cshEgGroupNameSet() {
    if (_cshEgGroupNames) return _cshEgGroupNames;
    var set = {};
    try {
        var gs = (typeof lib !== "undefined" && lib.group) || [];
        for (var i = 0; i < gs.length; i++) {
            var g = gs[i];
            set[g] = 1;
            try { var tn = lib.translate && lib.translate[g]; if (tn) set[String(tn)] = 1; } catch (e1) {}
        }
    } catch (e0) {}
    _cshEgGroupNames = set;
    return set;
}
/* 主菜单 / 图鉴：引擎 createMenu 造的是 `.main.menu.dialog`（ui/create/menu/index.js:135），
   切到「卡牌 / 武将」页就含 `.card.button` —— 它不是「选势力」面板。
   只靠内容判据不足以 100% 排除（图鉴里也可能出现势力名），直接按容器排除。 */
function cshEgIsMenuDialog(dlg) {
    try {
        if (!dlg) return true;
        if (dlg.classList && dlg.classList.contains("menu")) return true;
        if (dlg.closest && dlg.closest(".menu-container")) return true;
    } catch (e) {}
    return false;
}
/* 是不是「选势力」面板：先排除菜单/图鉴，再用内容判据（覆盖不同内核/模式/按钮形态） */
function cshEgIsGroupDialog(dlg) {
    if (cshEgIsMenuDialog(dlg)) return false;
    var btns;
    try { btns = dlg.querySelectorAll(".buttons .button"); } catch (eB) { return false; }
    if (!btns || !btns.length) return false;
    var names = cshEgGroupNameSet(), hit = 0;
    for (var j = 0; j < btns.length; j++) {
        var lk = btns[j].link;
        if (lk && typeof lk[2] === "string" && lk[2].indexOf("group_") === 0) return true;
        var tx = (btns[j].textContent || "").trim();
        if (tx && (names[tx] || (tx.length <= 3 && names[tx.replace(/国$/, "")]))) hit++;
    }
    /* 标题可能落在 .caption（chooseButton）也可能落在 .prompt（chooseControl / 某些模式），
       两边都认；**只要标题提到「势力」就按势力面板处理**（菜单/图鉴已在上面排除）。
       2026-10-18 修复「只有身份场生效」：2v2 的冷/暖方势力走 chooseControl（控制条），
       身份场走 chooseButton（对话框）；另外部分模式只有 2 个势力按钮，旧的 hit>=3 会漏。 */
    var capHit = false;
    try {
        var caps = dlg.querySelectorAll(".caption,.prompt");
        for (var c = 0; c < caps.length; c++) {
            if ((caps[c].textContent || "").indexOf("势力") >= 0) { capHit = true; break; }
        }
    } catch (eC) {}
    if (capHit) return true;
    return hit >= 2 && hit * 2 >= btns.length;
}
/* 控制条形态（2v2 冷/暖方势力 = chooseControl → #control 里的一条 .control）。
   引擎的 .control 是 white-space:nowrap + overflow:hidden：按钮一多就被裁掉且无法滚。
   判据：条内 ≥2 个按钮，且过半是势力名。 */
function cshEgIsGroupControl(bar) {
    try {
        if (!bar || !bar.children) return false;
        var names = cshEgGroupNameSet(), total = 0, hit = 0;
        for (var i = 0; i < bar.children.length; i++) {
            var k = bar.children[i];
            if (!k || (k.classList && k.classList.contains("removing"))) continue;
            var tx = (k.textContent || "").trim();
            if (!tx) continue;
            total++;
            if (names[tx] || (tx.length <= 3 && names[tx.replace(/国$/, "")])) hit++;
        }
        return total >= 2 && hit >= 2 && hit * 2 >= total;
    } catch (e) { return false; }
}
/* 对话框实际缩放系数 = 屏幕像素 ÷ 局部像素。
   引擎把 body 整体缩放（素版 transform:scale(documentZoom) / 十周年UI style.zoom），
   vh 是「局部视口单位」⇒ 70vh 在手机（zoom≈0.4）只剩屏幕的 28%，这正是
   「手机端这个 BUG 更明显」的根因。取不到就退回 game.documentZoom。 */
function cshEgViewScale(dlg) {
    var z = 0;
    try {
        var oh = dlg ? dlg.offsetHeight : 0;
        var rh = dlg ? dlg.getBoundingClientRect().height : 0;
        if (oh > 0 && rh > 0) z = rh / oh;
    } catch (e) {}
    if (!(z > 0.05) || !isFinite(z)) {
        try { z = (typeof game !== "undefined" && game.documentZoom > 0) ? game.documentZoom : 1; } catch (e2) { z = 1; }
    }
    if (!(z > 0.05) || !isFinite(z)) z = 1;
    return z;
}
/* 封顶像素：把「屏幕还能用多少」换算回对话框的局部 px。
   max-height 只在内容真的超出时才生效，正常尺寸的面板一个像素都不动。 */
function cshEgCapPx(dlg) {
    var vh = 0;
    try { vh = window.innerHeight || document.documentElement.clientHeight || 0; } catch (e) {}
    if (!vh) return 0;
    var top = 0;
    try { top = Math.max(0, Math.min(dlg.getBoundingClientRect().top || 0, vh)); } catch (e2) {}
    var cap = Math.floor((vh - top - 8) / cshEgViewScale(dlg)); // 8px 呼吸位
    return Math.max(200, cap);
}
/* ★ 宽度上界（2026-10-18 第二修 · 作者提供的实机录像）
   ------------------------------------------------------------------
   录像里（一位装了很多扩展的用户）：势力 20+ 个，身份场/对决的势力面板是
   4 行 × 6 列，**最右一列被切在屏幕外**，中间还压着一条橙色横向滚动条。
   我用引擎真实的 layout.css 在 headless Chromium 里做了一次定量对照，
   把「父容器宽度」当自变量（376 = 引擎默认 / 849 = 十周年UI 96% / 1400 = 插件乱改）：

       父宽   .buttons 宽   每行个数   总高
       376      368          2        1260
       849      841          5         525
      1400     1392          9         315      ← 一行 9 个，最后一列在 x=1392，屏幕只有 884

   ⇒ 根因不是"内容太多"，是 **`.buttons` 的宽度跟着一个不受本扩展控制的父容器走**。
     引擎 `.buttons{width:100%}`（layout.css:1560），而父链上任何一环被 UI 插件
     /其它扩展改宽，按钮墙就跟着变宽 —— 换行在"错误的宽度"上发生，于是溢出到屏幕外。
    ⇒ 修法：**只封顶，不设宽**。宽度上界写在 dialog 自己的 `max-width`（被动属性，
      只在超屏时才生效）；`.buttons` 只留 `max-width:100%` 兜底，**绝不设 width**。
      ★ 为什么要强调"不设 width"（2026-10-18 第三修）：曾经写成
        `width: min(100%, 视口宽/缩放)`，它会覆盖引擎的 `calc(100% - 8px)`（layout.css:1857），
        等于**主动把按钮墙改宽 8px**；同一次处理里又给容器加 `padding-right:10px`（窄 10px）。
        两个方向一起动，列数就压在临界值上来回跳 —— 作者实机的"每次出现会自动一下"。
      纵向照旧靠 max-height + 滚动（行数变多是不可避免的，那不是 bug）。 */
function cshEgCapW(dlg) {
    var vw = 0;
    try { vw = window.innerWidth || document.documentElement.clientWidth || 0; } catch (e) {}
    if (!vw) return 0;
    return Math.max(220, Math.floor((vw - 16) / cshEgViewScale(dlg)));
}
/* ★ 直接写内联样式（不靠 CSS 选择器的 `>` / :has / 优先级）：结构怎么变都按得住。
   封顶值必须是 px（按真实缩放换算），不能写 vh —— 见 cshEgViewScale 注释。 */
function cshEgStyleGroupDialog(dlg) {
    try {
        var cap = cshEgCapPx(dlg);
        var capW = cshEgCapW(dlg);
        if (cap) dlg.style.maxHeight = cap + "px";
        /* 对话框本身也钳宽：插件把它拉到 96% 时，靠 maxWidth + 自身的居中 transform
           会重新回到屏幕中间（translateX(-50%) 按自身宽度算，宽度一变就自动重算）。 */
        if (capW) dlg.style.maxWidth = capW + "px";
        dlg.style.overflow = "hidden";
        dlg.style.overscrollBehavior = "contain";
        /* ★ 不再下发 --csh-egw（2026-10-18 第三修）：它唯一的消费者是
           `.buttons{width:min(100%,var(--csh-egw))}`，而那条规则已经因为"主动改布局"
           被删除。留着变量只会让下一个人以为还有东西在用它。 */
        var boxes = dlg.querySelectorAll(".content-container");
        if (!boxes.length) boxes = dlg.querySelectorAll(".content");
        for (var i = 0; i < boxes.length; i++) {
            var c = boxes[i];
            if (!c || !c.style) continue;
            /* 横向改 hidden：宽度已经靠 min() 钳住并换行了，不需要横向滚；
               留着 auto 只会多出一条压在按钮上的横条（录像里那条橙色线就是它）。 */
            c.style.overflowX = "hidden";
            c.style.overflowY = "auto";
            c.style.webkitOverflowScrolling = "touch";
            c.style.overscrollBehavior = "contain";
            c.style.scrollbarColor = "rgba(255,255,255,.45) rgba(0,0,0,.22)";
            /* ★ 不设 padding-right（2026-10-18 第三修）。
               旧实现为了给滚动条让位加 10px 内边距 —— 但这会让内容区**变窄**，
               与"绝不主动改布局"的纪律直接冲突（它正是列数跳变的另一半原因）。
               滚动条改窄到 8px + 半透明（见 CSS 的 ::-webkit-scrollbar），压在按钮边缘不碍事。
               box-sizing 保留：它不改变宽度，只是让 max-width 的算法与内边距一致。 */
            try { c.style.boxSizing = "border-box"; } catch (eB) {}
        }
        /* 按钮墙：**只封顶，绝不设 width**（见 cshEgScrollApply 里那条 CSS 的注释）。
           设 width 会覆盖引擎的 `calc(100% - 8px)` ⇒ 宽 8px ⇒ 按钮列数在临界值上跳变，
           那正是作者看到的"从图一变成图二"。压制插件用的 !important 只需要 max-width。 */
        var bars = dlg.querySelectorAll(".buttons");
        for (var j = 0; j < bars.length; j++) {
            var b = bars[j];
            if (!b || !b.style) continue;
            try {
                b.style.setProperty("max-width", "100%", "important");
                b.style.setProperty("box-sizing", "border-box", "important");
            } catch (eBs) {}
        }
        /* 实测纠偏：万一插件把 left 定死（不是居中），maxWidth 救不了右边界，这里再推回来。
           只在真溢出时动一次，不动就不碰 —— 避免和插件的定位/动画打架。 */
        try {
            var r = dlg.getBoundingClientRect();
            var vw = window.innerWidth || document.documentElement.clientWidth || 0;
            var z = cshEgViewScale(dlg) || 1;
            if (vw && r.right > vw - 4) {
                var dx = Math.ceil((r.right - (vw - 4)) / z);
                dlg.style.marginLeft = (-dx) + "px";
            } else if (vw && r.left < 4) {
                var dx2 = Math.ceil((4 - r.left) / z);
                dlg.style.marginLeft = dx2 + "px";
            }
        } catch (eSh) {}
    } catch (eS) {}
}
/* 控制条限宽 + 横向滚动（2v2 冷/暖方势力）：不裁按钮、可左右滑。
   注意：引擎在创建时按未限宽的 offsetWidth 设了 translateX(-w/2)，限宽后要重新居中。 */
function cshEgStyleGroupControl(bar) {
    try {
        var vw = window.innerWidth || document.documentElement.clientWidth || 0;
        if (!vw) return;
        bar.style.maxWidth = Math.max(180, Math.floor((vw - 16) / cshEgViewScale(bar))) + "px";
        bar.style.overflowX = "auto";
        bar.style.overflowY = "hidden";
        bar.style.webkitOverflowScrolling = "touch";
        bar.style.overscrollBehavior = "contain";
        bar.style.scrollbarWidth = "thin";
        try { bar.style.transform = "translateX(-" + Math.round(bar.offsetWidth / 2) + "px)"; } catch (e2) {}
    } catch (eC) {}
}
function cshEgUnstyleControl(bar) {
    try {
        if (!bar) return;
        bar.style.maxWidth = "";
        bar.style.overflowX = "";
        bar.style.overflowY = "";
        bar.style.webkitOverflowScrolling = "";
        bar.style.overscrollBehavior = "";
        bar.style.scrollbarWidth = "";
        bar.classList.remove("csh-egctrl");
        try { bar.style.transform = "translateX(-" + Math.round(bar.offsetWidth / 2) + "px)"; } catch (e2) {}
    } catch (e) {}
}
/* 还原：关开关 / 面板复用 / 误标时把内联样式与标记一起撤掉（旧实现只加不减，
   关掉开关后 70vh 与滚动条仍粘在菜单上 —— 作者实机「关闭之后」那张图的根因）。 */
function cshEgUnstyle(dlg) {
    try {
        if (!dlg) return;
        dlg.style.maxHeight = "";
        dlg.style.maxWidth = "";
        dlg.style.overflow = "";
        dlg.style.overscrollBehavior = "";
        dlg.style.marginLeft = "";
        try { dlg.style.removeProperty("--csh-egw"); } catch (eV) {}
        var boxes = dlg.querySelectorAll(".content-container");
        if (!boxes.length) boxes = dlg.querySelectorAll(".content");
        for (var i = 0; i < boxes.length; i++) {
            var c = boxes[i];
            if (!c || !c.style) continue;
            c.style.overflowY = "";
            c.style.overflowX = "";
            c.style.webkitOverflowScrolling = "";
            c.style.overscrollBehavior = "";
            c.style.scrollbarColor = "";
            c.style.paddingRight = "";
            c.style.boxSizing = "";
        }
        var bars = dlg.querySelectorAll(".buttons");
        for (var j = 0; j < bars.length; j++) {
            var b = bars[j];
            if (!b || !b.style) continue;
            try {
                b.style.removeProperty("width");
                b.style.removeProperty("max-width");
                b.style.removeProperty("box-sizing");
            } catch (eB) {}
        }
        dlg.classList.remove("csh-egdlg");
    } catch (eU) {}
}
function cshEgClearAll() {
    try {
        var list = document.querySelectorAll(".csh-egdlg");
        for (var i = 0; i < list.length; i++) cshEgUnstyle(list[i]);
        var bars = document.querySelectorAll(".csh-egctrl");
        for (var j = 0; j < bars.length; j++) cshEgUnstyleControl(bars[j]);
    } catch (eC) {}
}
function cshEgTryTag(el) {
    try {
        if (!el || el.nodeType !== 1) return;
        /* ① 控制条形态（2v2 冷/暖方势力 = chooseControl → .control，不在 dialog 里） */
        var bar = (el.classList && el.classList.contains("control")) ? el
            : (el.closest ? el.closest(".control") : null);
        if (bar && !bar.classList.contains("csh-egctrl") && !(bar.closest && bar.closest(".dialog"))) {
            if (cshEgIsGroupControl(bar)) {
                bar.classList.add("csh-egctrl");
                cshEgStyleGroupControl(bar);
                try {
                    if (lib.cshDebug && typeof lib.cshDebug.info === "function")
                        lib.cshDebug.info("eg-scroll 命中势力控制条 · 按钮数=" + bar.children.length);
                } catch (eD0) {}
            }
        }
        /* ② 对话框形态 */
        var dlg = (el.classList && el.classList.contains("dialog")) ? el
            : (el.closest ? el.closest(".dialog") : null);
        if (!dlg || dlg.classList.contains("csh-egdlg")) return;
        if (!cshEgIsGroupDialog(dlg)) return;
        dlg.classList.add("csh-egdlg");
        cshEgStyleGroupDialog(dlg);
        try {
            if (lib.cshDebug && typeof lib.cshDebug.info === "function")
                lib.cshDebug.info("eg-scroll 命中势力面板 · dialog=[" + dlg.className + "] 挂点=[" +
                    ((dlg.parentNode && dlg.parentNode.className) || "?") + "] content-container=" +
                    (dlg.querySelector(".content-container") ? "有" : "无") + " 按钮数=" +
                    dlg.querySelectorAll(".buttons .button").length);
        } catch (eD) {}
    } catch (eT) {}
}
function cshEgGroupObserve(on) {
    try {
        if (_cshEgMO) { _cshEgMO.disconnect(); _cshEgMO = null; }
        if (!on) { cshEgClearAll(); return; }
        if (typeof window === "undefined" || !window.MutationObserver) return;
        /* ★ 监听 documentElement 而不是 ui.arena：arena 元素可能随开局被重建，
           若绑在旧元素上，观察器等于挂在一个已摘除的节点上、永不触发
           （这正是「身份模式生效、其他模式全失效」的最强嫌疑）。 */
        _cshEgMO = new MutationObserver(function (muts) {
            for (var i = 0; i < muts.length; i++) {
                var added = muts[i].addedNodes;
                for (var j = 0; j < added.length; j++) cshEgTryTag(added[j]);
            }
        });
        _cshEgMO.observe(document.documentElement, { childList: true, subtree: true });
        /* 首扫一次（进入本局前可能已有面板/控制条在场） */
        var ds = document.querySelectorAll(".dialog");
        for (var k = 0; k < ds.length; k++) cshEgTryTag(ds[k]);
        var cs = document.querySelectorAll("#control .control");
        for (var m = 0; m < cs.length; m++) cshEgTryTag(cs[m]);
    } catch (eO) {}
}
function cshEgScrollApply(force) {
    try {
        /* 2026-10-18 第二十二批：默认值改为**关闭**（作者定案）。
           旧判断 `!== false` 在「从未设置过」（undefined）时会判定为开启 —— 那正是默认开启。
           现在要求显式 === true 才生效：没配置过 = 关，玩家主动打开才算数。
           同时注意：本开关只影响「本扩展额外加的滚动条与限宽限高」，
           引擎自己的 `.content-container{overflow:scroll}` 始终在（我们关掉的是**我们在上面加的**那层样式）。 */
        var on = (force === undefined)
            ? (lib.config["extension_池子魔将_csh_eg_group_scroll"] === true)
            : !!force;
        if (!document.getElementById("csh_eg_scroll_css")) {
            var st = document.createElement("style");
            st.id = "csh_eg_scroll_css";
            /* 滚动阴影（local 随内容滚 + scroll 固定两层）：随 .content-container 走 */
            var scbg = "background:linear-gradient(rgba(0,0,0,.22),rgba(0,0,0,0)) 0 0/100% 14px no-repeat local,"
                + "linear-gradient(rgba(0,0,0,0),rgba(0,0,0,.22)) 0 100%/100% 14px no-repeat local,"
                + "radial-gradient(farthest-side at 50% 0,rgba(0,0,0,.30),rgba(0,0,0,0)) 0 0/100% 7px no-repeat scroll,"
                + "radial-gradient(farthest-side at 50% 100%,rgba(0,0,0,.30),rgba(0,0,0,0)) 0 100%/100% 7px no-repeat scroll";
            st.textContent = [
                /* ★ 唯一选择器 = JS 内容判定后打上的 .csh-egdlg。
                   【2026-10-18 事故】旧规则用 `.dialog:not(.fullheight)` 加 `:has(.card.button)`，
                   而引擎主菜单本身就是 `.main.menu.dialog`（ui/create/menu/index.js:135），
                   切到「卡牌 / 武将」页即含 .card.button ⇒ 整个选项菜单被压成 70vh、
                   overflow:hidden 裁掉下半截，还多出一条滚动条。`:has()` 区分不了
                   「选势力」和「看图鉴」，这条全局规则永久废弃，禁止回归。
                   max-height 由图内联写入 px（按 body 真实缩放换算），CSS 不再写 vh。 */
                ".csh-egsc .csh-egdlg{overflow:hidden;overscroll-behavior:contain}",
                /* 原生滚动容器接管：**只留纵向一条**。
                   2026-10-18 第二修：横向改成 hidden —— 宽度已由下面的 min() 钳住并换行，
                   再留 auto 只会多出一条压在按钮中间的横条（录像里那条橙色线就是它）。 */
                ".csh-egsc .csh-egdlg .content-container{overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;box-sizing:border-box;"
                + "scrollbar-color:rgba(255,255,255,.45) rgba(0,0,0,.22);" + scbg + "}",
                /* ★ 按钮墙：**只封顶，不设宽**（2026-10-18 第三修 · 作者："每次出现会自动一下"）
                   ------------------------------------------------------------------
                   第二修写的是 `width: min(100%, --csh-egw)`，那是**主动参与布局**：
                   引擎本来给 `.buttons` 的是 `.content > div:not(.pointerdiv){width:calc(100% - 8px)}`
                   （layout.css:1857-1860），被覆盖成 `100%` ⇒ **宽了 8px**；
                   同一次处理里又给 `.content-container` 加了 `padding-right:10px` ⇒ **窄了 10px**。
                   两个方向同时动，按钮列数就落在临界值上来回跳（实机：4 列 → 5 列）。
                   ⇒ 现在的纪律：**任何"会让布局变化的属性"都不许主动写**。
                     宽度上界只靠 dialog 自己的 `max-width`（被动，只在超屏时生效），
                     `.buttons` 只留 `max-width:100%` 兜底 —— 父宽正常时**一个像素都不动**。 */
                ".csh-egsc .csh-egdlg .buttons{max-width:100%;box-sizing:border-box}",
                /* 右缘防裁：卡牌按钮宽度不得超出容器（窄屏把右侧势力裁掉的根因之一） */
                ".csh-egsc .csh-egdlg .content-container .buttons>.card{max-width:100%;box-sizing:border-box}",
                ".csh-egsc .csh-egdlg .content-container::-webkit-scrollbar{width:8px;height:0}",
                ".csh-egsc .csh-egdlg .content-container::-webkit-scrollbar-track{background:rgba(0,0,0,.22);border-radius:5px}",
                ".csh-egsc .csh-egdlg .content-container::-webkit-scrollbar-thumb{background:rgba(255,255,255,.45);border-radius:5px}",
                ".csh-egsc .csh-egdlg .content-container::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.68)}",
                /* 控制条形态（2v2 冷/暖方势力）：限宽是内联 px（JS 按缩放算），这里只画滚动条 */
                ".csh-egsc .csh-egctrl::-webkit-scrollbar{height:8px}",
                ".csh-egsc .csh-egctrl::-webkit-scrollbar-track{background:rgba(0,0,0,.18);border-radius:4px}",
                ".csh-egsc .csh-egctrl::-webkit-scrollbar-thumb{background:rgba(255,255,255,.42);border-radius:4px}",
                ".csh-egsc .csh-egctrl::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.66)}",
            ].join("");
            document.head.appendChild(st);
        }
        document.documentElement.classList.toggle("csh-egsc", on);
        cshEgGroupObserve(on);
        try { lib.__cshEgScrollApply = cshEgScrollApply; } catch (eL) {}
    } catch (e) { /* 兼容注入失败绝不阻断 content */ }
}

export function cshContent(config, pack) { try {
    /* ★ 界面基座（2026-10-18）：提示/确认框的唯一实现，必须在任何会弹提示的模块之前装好
       （小游戏结算、成就、签到、讨伐奖励都在 content 之后才可能触发）。
       非关键 UI：装不上也不能拖垮 content 的其它注入（与红线的"非关键 UI 允许兜底"一致）。 */
    try { installUIKit(); } catch (eUI) {}
    /* ★ 神武将选势力（2026-10-18 · 第四版）
       前三次全部作废：补 doubleGroup 会被选将界面逐个画出来（ui/create/index.js:3191-3197），
       补 initGroup 会污染共享技能；而引擎**没有**为非身份场提供标准入口
       （identity.js:1505 那套是模式私有的）。所以只能自写，但这次写对了三处判定。
       详见 core/csh_rules.js 文件头。 */
    try {
        var _kamiOk = installKamiChoice();
        if (_kamiOk && lib.config && lib.config.extension_池子魔将_csh_dev_log) {
            var _ks = kamiStatus();
            console.log("[池子魔将] 神将选势力已装：" + (_ks.enabled ? "开关=开" : "开关=关（设置页「神将选势力」）")
                + " · 可选 " + _ks.choices.join("/")
                + " · _priority=" + _ks.priority
                + (_ks.peerSlyh ? " · 检测到十周年UI 的 _slyh（接自定义势力，与 shen 不重叠）" : ""));
        }
    } catch (eRule) {}
    /* 讨伐记录层（2026-10-13 · 批次 4a）：常驻挂 lib.cshBossRecord（对局写入/快照聚合/
       bossbook 展示三处共用；install 幂等） */
    installBossRecord();
    /* 金鳞市市场层（2026-10-14 · 批次 B）：常驻挂 lib.cshMarket（快照/交易/每日结算三处共用；
       与讨伐记录层配合：csh_bossrecord.minionHeat → 标的永久基本面加成；install 幂等）。 */
    installMarket();
    /* 妖灵好感度层（v6.2）：常驻挂 lib.cshAffection（讨伐/持股/聊天/送礼 四来源 + 五档台词；
       与金鳞市同源同一份 50 位；install 幂等）。 */
    installAffection();
    /* 魔王包级隐藏（v4）：引擎 loadCharacter（init/index.js:465）已在 content（521）之前
       跑完——此刻把"池子魔将_boss"包从 lib.characterPack 移除，武将设置页不再出现该包节点；
       魔王本体已在 lib.character（get.character 首选），一切读取不受影响。 */
    cshBossPackHide();
    /* BOSS 模式注入（v4 · 精简版）：判 mode==="boss" 后仅注入 lib.boss 模式配置
       （chongzheng / minion / gameDraw / _csh_x）+ 首进焦点——角色本体与译名一律由
       character/boss.js 的 game.import("character") 原生注册（引擎 loadCharacter 处理）。
       其它模式此调用零执行（§4 零污染）；内部自带幂等守卫与异常兜底。
       ★pack（扩展包原始对象）随参数保留（bossdata 的纯构造入口同签名，便于未来扩展）。 */
    cshBossModeInstall(config, pack);
    /* ★ 本体兼容：选将势力面板滚动条（engine-compat C4）——必须在此即执行（不能等任何懒加载）。
       开关 = 设置项 csh_eg_group_scroll（默认开 · 改动即时生效，见 config.js 的 onclick）。 */
    cshEgScrollApply();
    if (typeof cshVoices === "object" && cshVoices) Object.assign(lib.translate, cshVoices);
    try {
        if (lib.cshInteract && typeof lib.cshInteract.install === "function") {
            lib.cshInteract.install();
            if (lib.config.extension_池子魔将_csh_dev_log) console.log("[池子魔将] 互动子模块 install 完成");
        }
    } catch (eInteract) {
        console.warn("[池子魔将] 互动 install 失败", eInteract);
    }


    try {
        /* 启动诊断日志统一走开发者开关：普通玩家控制台保持干净。
           【2026-10-04】csh_debug / csh_winrate 已改为 arenaReady 懒加载，
           content 时点 cshDebugMenu 尚未挂载属预期，改查懒加载桩是否就位。 */
        if (lib.config.extension_池子魔将_csh_dev_log) {
            console.log("[池子魔将] content 执行, 懒加载桩=", typeof lib.__cshLoadDebug, typeof lib.__cshLoadWinrate);
            if (typeof lib.__cshLoadDebug === "function") {
                console.log("[池子魔将] 池子调试/胜负统计为进局时懒加载：主菜单可按 F1 或用设置页按钮唤起");
            } else {
                console.warn("[池子魔将] 懒加载桩缺失：bootstrap.js 未正确执行");
            }
        }
    } catch (eCshLog) {}

    // 【逆流护体全局防护】包装 lib.filter.all / lib.filter.notMe：
    // 持有逆流护体状态技能的角色不能被其他角色的牌/技能指定为目标；
    // 不拦截该角色对自己的使用。带幂等守卫，防止重复包装。
    // 仅按护体技能存在与否拦截，不用 isOut 判定，以免绕过引擎 includeOut 豁免契约。
    (function () {
        if (lib.__csh_niliu_guard_installed) return;
        lib.__csh_niliu_guard_installed = true;
        // 联机安全约束：lib.filter.all / notMe 会作为默认 filterCard/filterTarget
        // 随 chooseCardOL 等事件被序列化发送到客户端执行（Function.toString + eval），
        // 包装函数体内严禁引用闭包变量，否则客户端报 ReferenceError，拼点/选牌等全部失效。
        // 原始引用挂到 lib 属性上；未安装本扩展的联机客户端回退到本端原生函数。
        if (!lib._csh_filter_all) lib._csh_filter_all = lib.filter.all;
        if (!lib._csh_filter_notMe) lib._csh_filter_notMe = lib.filter.notMe;
        lib.filter.all = function () {
            var orig = typeof lib._csh_filter_all == "function" ? lib._csh_filter_all : lib.filter.all;
            var res = orig.apply(this, arguments);
            // 仅在三参签名 (card, player, target) 下检查目标；兼容原函数行为
            if (res && arguments.length >= 3) {
                var player2 = arguments[1], target2 = arguments[2];
                if (player2 !== target2 && target2 && typeof target2.hasSkill == "function" && target2.hasSkill("csh_fangyuan_niliu_state")) return false;
            }
            return res;
        };
        lib.filter.notMe = function () {
            var orig = typeof lib._csh_filter_notMe == "function" ? lib._csh_filter_notMe : lib.filter.notMe;
            var res = orig.apply(this, arguments);
            // 与 all 包装一致：仅三参签名下检查目标，否则透传原返回值
            if (res && arguments.length >= 3) {
                var player2 = arguments[1], target2 = arguments[2];
                if (player2 !== target2 && target2 && typeof target2.hasSkill == "function" && target2.hasSkill("csh_fangyuan_niliu_state")) return false;
            }
            return res;
        };
    })();

    // —— 扩展维护约定（帕累托：少规则、高收益）——
    // 1. 结算（loseHp/damage/gain/discard/revive/syncStorage）禁止空 catch 吞错
    // 2. 改 player.storage.xxx 后调用 lib.cshSyncStorage 或 player.syncStorage
    // 3. catch 仅用于：语音、换肤、DOM/特效、明确 API 降级
    // 4. 注释只写「为何」；过时注释直接删，勿与代码矛盾

    // —— 兼容工具（参考天庭：版本门闩 / 规范造牌，不改全局原型）——
    if (typeof lib.cshCompareVersion !== "function") {
        lib.cshCompareVersion = function (a, b) {
            if (!a) a = "0";
            if (!b) b = (lib && lib.version) || "0";
            var arr1 = String(a).split(".");
            var arr2 = String(b).split(".");
            for (var i = 0; i < Math.min(arr1.length, arr2.length); i++) {
                var n1 = parseInt(arr1[i], 10) || 0;
                var n2 = parseInt(arr2[i], 10) || 0;
                if (n1 > n2) return 1;
                if (n1 < n2) return -1;
            }
            if (arr1.length > arr2.length) return 1;
            if (arr1.length < arr2.length) return -1;
            return 0;
        };
    }
    // 规范实体衍生牌：必须带花色点数，避免无花色/undefined 显示
    if (typeof lib.cshCreateCard !== "function") {
        lib.cshCreateCard = function (name, suit, number, nature) {
            var suits = ["heart", "diamond", "club", "spade"];
            var s = suit;
            if (!s || suits.indexOf(s) < 0) s = suits[Math.floor(Math.random() * 4)];
            var n = number;
            if (typeof n !== "number" || n < 1 || n > 13) n = 1 + Math.floor(Math.random() * 13);
            var card;
            try {
                if (nature) card = game.createCard(name, s, n, nature);
                else card = game.createCard(name, s, n);
            } catch (e1) {
                try { card = game.createCard(name, s, n); } catch (e2) { card = null; }
            }
            return card;
        };
    }

    // 蛊惑/道转临时记录技能的动态描述：技能列表弹窗走 skillInfoTranslation→lib.dynamicTranslate，
    // 引擎不会替换 translate._info 里的 $ 占位符（$ 仅在标记点击的 storageintro 路径生效），
    // 不注册会在技能列表里原样显示“$”。storage 均经 syncStorage/markAuto 全端同步，联机安全。
    lib.dynamicTranslate.csh_guhuo_used = function (player) {
        var used = player.getStorage("csh_guhuo_used");
        if (!used.length) return "本回合尚未转化过牌";
        return "已转化过<span class=thundertext>" + get.translation(used) + "牌</span>";
    };
    lib.dynamicTranslate.csh_daozhuan_used = function (player) {
        var used = player.getStorage("csh_daozhuan_used");
        return "本轮已使用牌名：" + (used.length ? get.translation(used) : "无");
    };
    // 李曦明·仙途：按境界切换描述（skillInfoTranslation → lib.dynamicTranslate）
    lib.dynamicTranslate.csh_xiantu = function (player) {
        var stage = (player && player.storage && player.storage.csh_xiantu_stage) || "taixi";
        var qi = (player && player.storage && player.storage.csh_qi) || 0;
        if (stage === "lianqi") {
            return "修炼技。练气境·真元自气海而生（「炁」" + qi + "/10）。<br>①当你不因本技能摸牌时，每摸一张牌，你摸一张与之类型不同的牌并获得1点「炁」（至多10点）。<br>②当你造成<span style='color:#e74c3c'>伤害</span>时，你可以消耗2点「炁」令此<span style='color:#e74c3c'>伤害</span>+1。<br>③结束阶段，若「炁」为10点，你可以选择一种类型并判定：若判定牌类型与所选相同，你散尽「炁」铸就仙基，进入〖筑基〗；若不同，你折损5点「炁」，失去1点<span style='color:#eb7a33'>体力</span>并摸四张牌。";
        }
        if (stage === "zhuji") {
            return "修炼技。筑基境·仙基煌元关（「炁」" + qi + "/20）。<br>①当你不因本技能摸牌时，每摸一张牌，你摸一张与之类型不同的牌并获得1点「炁」（至多20点）。<br>②结束阶段，若「炁」为20点，你可以选择一种牌名并判定：若判定牌牌名与所选相同，你散尽「炁」进入〖紫府〗；若不同，你死亡。";
        }
        if (stage === "zifu") {
            return "修炼技。紫府境。你拥有〖谒天〗。";
        }
        // 胎息：六轮之基
        return "修炼技。胎息境·凝聚六轮（玄景、承明、周行、青元、玉京、灵初）（「炁」" + qi + "/6）。<br>①当你不因本技能摸牌时，每摸一张牌，你摸一张与之类型不同的牌并获得1点「炁」（至多6点，六轮各成一点）。<br>②结束阶段，若「炁」为6点，你可以选择一种颜色并判定：若判定牌颜色与所选相同，六轮圆成，你散尽「炁」进入〖练气〗；若不同，你折损3点「炁」并摸三张牌。";
    };

    // 双将基础兼容：判断玩家是否拥有指定武将（name / name1 / name2）
    lib.cshHasCharacter = function (player, name) {
        if (!player || !name) return false;
        return player.name === name || player.name1 === name || player.name2 === name;
    };
    // 双将：返回玩家身上的武将名列表（去重）
    lib.cshGetCharacterNames = function (player) {
        if (!player) return [];
        var arr = [];
        if (player.name1) arr.push(player.name1);
        if (player.name2 && player.name2 !== player.name1) arr.push(player.name2);
        if (!arr.length && player.name) arr.push(player.name);
        return arr;
    };
    // 模式兼容：身份场（含部分变体）
    lib.cshIsIdentityMode = function () {
        try {
            var m = typeof get !== "undefined" && get.mode ? get.mode() : (_status && _status.mode);
            return m === "identity" || m === "identity_old" || m === "identity2";
        } catch (e) {
            return false;
        }
    };
    // 斗地主
    lib.cshIsDoudizhuMode = function () {
        try {
            var m = typeof get !== "undefined" && get.mode ? get.mode() : (_status && _status.mode);
            return m === "doudizhu" || m === "ddz";
        } catch (e) {
            return false;
        }
    };
    // 2v2 / 对阵
    lib.cshIsVersusMode = function () {
        try {
            var m = typeof get !== "undefined" && get.mode ? get.mode() : (_status && _status.mode);
            return m === "versus" || m === "two" || m === "2v2";
        } catch (e) {
            return false;
        }
    };
    // 是否存在可用的身份体系（身份场/斗地主等有 identity 字段的模式）
    lib.cshHasIdentitySystem = function () {
        try {
            if (lib.cshIsIdentityMode() || lib.cshIsDoudizhuMode()) return true;
            if (game && game.players && game.players.some(function (p) {
                return p && typeof p.identity === "string" && p.identity !== "";
            })) return true;
        } catch (e) {}
        return false;
    };
    // 主公/地主类身份
    lib.cshIsLordIdentity = function (player) {
        if (!player || typeof player.identity !== "string") return false;
        return player.identity === "zhu" || player.isZhu === true;
    };
    // 安全回复：统一入口，避免 recover(n, true) 等在旧整合包触发 num is not defined
    lib.cshSafeRecover = function (player, num, source) {
        if (!player || typeof player.recover !== "function") return null;
        var n = typeof num === "number" && num > 0 ? num : 1;
        try {
            if (source && get.itemtype && get.itemtype(source) === "player") {
                return player.recover(n, source);
            }
            return player.recover(n);
        } catch (e) {
            try {
                return player.recover();
            } catch (e2) {
                return null;
            }
        }
    };
    // 偏助：当前可用转换面蓝色高亮（storage 为 false/空=阳，true=阴）
    lib.dynamicTranslate.csh_ssx_pianzhu = function (player) {
        var yang = "阳：你可以获得一名其他角色的一张手牌，然后视为使用一张基本牌。";
        var yin = "阴：你可以弃置一张手牌，获得场上的一张装备牌。";
        if (player.storage.csh_ssx_pianzhu) {
            return "转换技，出牌阶段限一次。" + yang + "<span class='bluetext'>" + yin + "</span>";
        }
        return "转换技，出牌阶段限一次。<span class='bluetext'>" + yang + "</span>" + yin;
    };

    // —— 前缀「池」样式：墨金印鉴风，避免与 SP/界/神 撞款 ——
    (function () {
        try {
            if (!lib.namePrefix) return;
            var set = function (key, info) {
                if (typeof lib.namePrefix.set === "function") lib.namePrefix.set(key, info);
                else if (lib.namePrefix instanceof Map) lib.namePrefix.set(key, info);
                else lib.namePrefix[key] = info;
            };
            // 池：深潭青金 + 楷体印感
            set("池", {
                color: "#6ec9b8",
                nature: "watermm",
                showName: "池",
            });
        } catch (e) {}
        /* 【2026-10-08 修复】此处原有第二份 csh-prefix-style 注入，实际从未生效：
           ①precontent 已先注入同名 id，getElementById 守卫直接 return；
           ②join("\\n") 是字面反斜杠+n、不是换行，拼出的 CSS 规则本就无效。
           现收敛为单点真源——全部前缀规则（池/星/昭/界/童）都在 main/precontent.js 的
           csh-prefix-style 里；这里保留上方 namePrefix 注册（幂等，兜底 precontent 未跑到的宿主）。 */
    })();


    // 强制注册武将前缀到 lib.translate（懒人包/部分加载路径下 package.translate 可能未完整合并）
    (function () {
        try {
            if (!lib.translate) lib.translate = {};
            if (!lib.namePrefix) {
                try { lib.namePrefix = new Map(); } catch (e0) { lib.namePrefix = {}; }
            }
            var set = function (key, info) {
                try {
                    if (typeof lib.namePrefix.set === "function") lib.namePrefix.set(key, info);
                    else if (lib.namePrefix instanceof Map) lib.namePrefix.set(key, info);
                    else lib.namePrefix[key] = info;
                } catch (e1) {}
            };
            set("池", { color: "#6ec9b8", nature: "watermm", showName: "池" });
            // 扫所有可能的武将包键名
            var packKeys = ["mode_extension_池子魔将", "池子魔将", "mode_extension_csh", "extension_池子魔将"];
            var seen = {};
            if (lib.characterPack) {
                for (var i = 0; i < packKeys.length; i++) {
                    var chars = lib.characterPack[packKeys[i]];
                    if (!chars) continue;
                    for (var id in chars) {
                        if (!id || id.indexOf("csh_") !== 0) continue;
                        seen[id] = 1;
                        if (!lib.translate[id + "_prefix"]) lib.translate[id + "_prefix"] = "池";
                    }
                }
                // 兜底：任意 pack 内 csh_ 武将
                for (var pn in lib.characterPack) {
                    var pack = lib.characterPack[pn];
                    if (!pack) continue;
                    for (var id2 in pack) {
                        if (!id2 || id2.indexOf("csh_") !== 0) continue;
                        if (!lib.translate[id2 + "_prefix"]) lib.translate[id2 + "_prefix"] = "池";
                    }
                }
            }
            if (lib.character) {
                for (var id3 in lib.character) {
                    if (!id3 || id3.indexOf("csh_") !== 0) continue;
                    if (!lib.translate[id3 + "_prefix"]) lib.translate[id3 + "_prefix"] = "池";
                }
            }
        } catch (e) {
            console.log("[池前缀]", e);
        }
    })();

    /* 【2026-10-08 清理】原「皮肤切换」死代码块（if(false) 包裹，约 120 行）已删除——
       内含 game.callHook 覆写与 HTMLDivElement.prototype.setBackground 猴补，从未执行过；
       留着既误导读码、又常被误认成卡顿嫌疑。玩法核心换皮见 lib.cshPlaySkin（本文件下方）。 */
    // 杨间·鬼眼升层、钟会觉醒、马超神势力：换肤注册与升层特效独立于皮肤开关（玩法核心表现，始终启用）

            // 蓝染等角色卡面兜底：部分PC端/十周年UI会丢自定义img
            try {
                if (lib.character && lib.character.csh_lr) {
                    var _lr = lib.character.csh_lr;
                    if (Array.isArray(_lr)) {
                        // 旧数组格式不强制改
                    } else if (_lr && !_lr.img) {
                        _lr.img = "extension/池子魔将/image/csh_lr.jpg";
                    }
                }
            } catch (eLr) {}

    if (pack.characterSubstitute) {
        ["csh_yangjian", "csh_guansuo", "csh_szc", "csh_mlb", "csh_lvlingqi", "csh_zhonghui", "csh_mlm", "csh_maochao", "csh_zuozhu", "csh_bin", "csh_liximing", "csh_mingrixiang"].forEach(function (key) {
            if (pack.characterSubstitute[key] && !lib.characterSubstitute[key]) {
                lib.characterSubstitute[key] = pack.characterSubstitute[key];
            }
        });
        // 玩法换皮助手：联机/单机统一改头像（不依赖皮肤开关）
        lib.cshPlaySkin = function (player, characterName, skinName) {
            var imgPath = null;
            try {
                if (lib.characterSubstitute && lib.characterSubstitute[characterName]) {
                    var skinList = lib.characterSubstitute[characterName];
                    for (var i = 0; i < skinList.length; i++) {
                        if (skinList[i][0] === skinName) {
                            var skinData = skinList[i][1] || [];
                            for (var j = 0; j < skinData.length; j++) {
                                if (typeof skinData[j] === "string" && skinData[j].indexOf("img:") === 0) {
                                    imgPath = skinData[j].slice(4);
                                    break;
                                }
                            }
                            break;
                        }
                    }
                }
            } catch (e0) {}
            // 回初始立绘：优先角色定义的 img，再试 jpg/gif
            if (!imgPath && skinName === characterName) {
                try {
                    var ch = lib.character && lib.character[characterName];
                    if (ch) {
                        var defImg = ch.img || (Array.isArray(ch) && ch[4] && ch[4][0]) || null;
                        if (typeof defImg === "string") {
                            if (defImg.indexOf("ext:") === 0) imgPath = defImg.slice(4);
                            else if (defImg.indexOf("extension/") === 0) imgPath = defImg;
                            else imgPath = defImg;
                        }
                    }
                } catch (e1) {}
            }
            if (!imgPath && skinName) {
                // 先 jpg 再 gif（明日香等静态立绘是 jpg，硬写 gif 会换肤失败）
                imgPath = "extension/池子魔将/image/" + skinName + ".jpg";
            }
            game.broadcastAll(function (p, cn, sn, path) {
                if (!p) return;
                // 回默认皮时 skinName===characterName，部分端 changeSkin 无此皮肤会抛错，先尝试再强制刷图
                try {
                    if (p.changeSkin && sn && sn !== cn) p.changeSkin({ characterName: cn }, sn);
                    else if (p.changeSkin && sn === cn) {
                        // 回到默认：尽量还原
                        try { p.changeSkin({ characterName: cn }, cn); } catch (eBack) {}
                    }
                } catch (e1) {}
                var url = path ? ((lib.assetURL || "") + path) : null;
                var apply = function (node) {
                    if (!node) return;
                    if (url) {
                        node.style.backgroundImage = 'url("' + url + '")';
                        node.style.backgroundSize = "cover";
                        node.style.backgroundPosition = "center top";
                    }
                };
                try {
                    if (p.name === cn || p.name1 === cn) apply(p.node && p.node.avatar);
                    if (p.name2 === cn) apply(p.node && p.node.avatar2);
                    if (p.name === cn || p.name1 === cn || (p.name2 && p.name2 === cn)) {
                        apply(p.node && p.node.avatar);
                    }
                } catch (e2) {}
            }, player, characterName, skinName, imgPath);
        };
    }
    // 鬼眼升层恐怖特效：全屏红雾渐入渐出 + 场地轻微抖动（broadcastAll 联机同步，两端扩展均已定义）
    lib.cshGuiyanFx = (function () {
        var cssInjected = false;
        function injectCSS() {
            if (cssInjected || document.getElementById("csh_guiyan_css")) {
                cssInjected = true;
                return;
            }
            var style = document.createElement("style");
            style.id = "csh_guiyan_css";
            style.textContent = [
                "@keyframes csh_guiyan_shake{",
                "0%,100%{transform:translate(0,0);}",
                "10%{transform:translate(-9px,5px);}20%{transform:translate(8px,-6px);}",
                "30%{transform:translate(-7px,-4px);}40%{transform:translate(6px,6px);}",
                "50%{transform:translate(-5px,3px);}60%{transform:translate(4px,-4px);}",
                "70%{transform:translate(-3px,2px);}80%{transform:translate(2px,-2px);}",
                "90%{transform:translate(-1px,1px);}",
                "}",
                ".csh_guiyan_shake{animation:csh_guiyan_shake .7s ease-in-out;}",
                ".csh_guiyan_shake_big{animation:csh_guiyan_shake 1.1s ease-in-out;}",
                ".csh_guiyan_mist{position:fixed;inset:0;z-index:9999;pointer-events:none;opacity:0;",
                "transition:opacity 1.2s ease-in-out;",
                "background:radial-gradient(ellipse at center,rgba(90,0,0,.22) 0%,rgba(55,0,0,.5) 55%,rgba(16,0,0,.88) 100%);}",
                ".csh_guiyan_mist_big{background:radial-gradient(ellipse at center,rgba(140,0,0,.3) 0%,rgba(80,0,0,.62) 50%,rgba(20,0,0,.95) 100%);}",
            ].join("");
            document.head.appendChild(style);
            cssInjected = true;
        }
        return function (level) {
            try {
                injectCSS();
                var big = level >= 2;
                var mist = document.createElement("div");
                mist.className = "csh_guiyan_mist" + (big ? " csh_guiyan_mist_big" : "");
                // 挂到 documentElement：body 会被引擎按 ui_zoom 施加 transform:scale，
                // fixed 元素若挂在 body 内会随缩放整体偏移（表现为偏右下角），挂 html 层则始终对齐真实视口
                document.documentElement.appendChild(mist);
                requestAnimationFrame(function () {
                    mist.style.opacity = "1";
                });
                setTimeout(function () {
                    mist.style.opacity = "0";
                    setTimeout(function () {
                        mist.remove();
                    }, 1400);
                }, big ? 2800 : 1600);
                var arena = document.getElementById("arena");
                if (arena) {
                    var cls = big ? "csh_guiyan_shake_big" : "csh_guiyan_shake";
                    arena.classList.add(cls);
                    setTimeout(function () {
                        arena.classList.remove(cls);
                    }, big ? 1200 : 750);
                }
            } catch (e) { }
        };
    })();
    // 马超·神势力浮动金芒：环绕光环旋转 + 金粒上浮 + 流光束 + 头像呼吸金晕（broadcastAll 联机同步，两端扩展均已定义）
    lib.cshMcShenAura = (function () {
        var cssInjected = false;
        function injectCSS() {
            if (cssInjected || document.getElementById("csh_mcshen_css")) {
                cssInjected = true;
                return;
            }
            var style = document.createElement("style");
            style.id = "csh_mcshen_css";
            style.textContent = [
                ".csh-mc-aura{position:absolute;inset:0;pointer-events:none;z-index:5;overflow:hidden;border-radius:8px;}",
                // 头像呼吸金晕：高级感的核心
                ".csh-mc-shen .avatar,.csh-mc-shen>.avatar{animation:csh_mc_pulse 2.2s ease-in-out infinite;}",
                "@keyframes csh_mc_pulse{0%,100%{box-shadow:0 0 14px rgba(255,205,80,.75),0 0 30px rgba(255,160,20,.45);}50%{box-shadow:0 0 26px rgba(255,225,120,.98),0 0 52px rgba(255,175,35,.72);}}",
                // 浮动金芒粒子：自下而上冉冉升腾
                ".csh-mc-p{position:absolute;bottom:2%;border-radius:50%;background:radial-gradient(circle,#fff8dc 0%,#ffd76a 45%,rgba(255,180,40,.25) 75%,transparent 100%);box-shadow:0 0 8px rgba(255,200,80,.95);filter:blur(.3px);animation:csh_mc_rise linear infinite;}",
                "@keyframes csh_mc_rise{0%{transform:translateY(4%) scale(.5);opacity:0;}18%{opacity:.95;}100%{transform:translateY(-130%) scale(1.15);opacity:0;}}",
                // 流光束：斜向光带周期性掠过武将牌
                ".csh-mc-beam{position:absolute;top:-12%;width:15%;height:74%;border-radius:50%;background:linear-gradient(180deg,transparent 0%,rgba(255,225,140,.32) 35%,rgba(255,244,200,.55) 50%,rgba(255,225,140,.32) 65%,transparent 100%);filter:blur(3px);mix-blend-mode:screen;animation:csh_mc_beam ease-in-out infinite;}",
                "@keyframes csh_mc_beam{0%{transform:translateY(112%) skewX(-16deg);opacity:0;}25%{opacity:.9;}60%{opacity:.4;}100%{transform:translateY(-135%) skewX(-16deg);opacity:0;}}",
                // 旋转环绕光环：conic金环缓转，力量感
                ".csh-mc-ring{position:absolute;left:50%;top:36%;width:80%;height:54%;margin:-27% 0 0 -40%;border-radius:50%;background:conic-gradient(from 0deg,rgba(255,215,90,0) 0deg,rgba(255,225,120,.75) 60deg,rgba(255,246,200,.95) 120deg,rgba(255,215,90,.25) 200deg,rgba(255,230,150,.6) 290deg,rgba(255,215,90,0) 360deg);-webkit-mask-image:radial-gradient(circle,transparent 62%,#000 74%,#000 88%,transparent 100%);mask-image:radial-gradient(circle,transparent 62%,#000 74%,#000 88%,transparent 100%);filter:blur(1.5px);opacity:.9;animation:csh_mc_spin 7s linear infinite;}",
                "@keyframes csh_mc_spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}",
                // 底部金色基座辉光
                ".csh-mc-base{position:absolute;left:6%;right:6%;bottom:1%;height:16%;border-radius:50%;background:radial-gradient(ellipse at center,rgba(255,214,110,.5) 0%,rgba(255,170,40,.22) 45%,transparent 72%);filter:blur(2px);animation:csh_mc_base 2.6s ease-in-out infinite;}",
                "@keyframes csh_mc_base{0%,100%{opacity:.55;transform:scaleX(1);}50%{opacity:.95;transform:scaleX(1.06);}}",
            ].join("");
            document.head.appendChild(style);
            cssInjected = true;
        }
        return function (player, on) {
            try {
                if (!player) return;
                injectCSS();
                var old = player.querySelector(":scope > .csh-mc-aura");
                if (old) old.remove();
                player.classList.remove("csh-mc-shen");
                if (!on) return;
                player.classList.add("csh-mc-shen");
                var aura = document.createElement("div");
                aura.className = "csh-mc-aura";
                var ring = document.createElement("div");
                ring.className = "csh-mc-ring";
                aura.appendChild(ring);
                var base = document.createElement("div");
                base.className = "csh-mc-base";
                aura.appendChild(base);
                for (var b = 0; b < 3; b++) {
                    var beam = document.createElement("div");
                    beam.className = "csh-mc-beam";
                    beam.style.left = (10 + b * 30 + Math.random() * 9) + "%";
                    beam.style.animationDuration = (3.2 + b * 0.8) + "s";
                    beam.style.animationDelay = (b * 0.9) + "s";
                    aura.appendChild(beam);
                }
                for (var i = 0; i < 14; i++) {
                    var s = document.createElement("div");
                    s.className = "csh-mc-p";
                    s.style.left = (4 + Math.random() * 92) + "%";
                    var sz = 2 + Math.random() * 4;
                    s.style.width = sz + "px";
                    s.style.height = sz + "px";
                    s.style.animationDuration = (2.4 + Math.random() * 2.8) + "s";
                    s.style.animationDelay = (Math.random() * 3) + "s";
                    aura.appendChild(s);
                }
                player.appendChild(aura);
            } catch (e) { }
        };
    })();
    // 觉醒光晕：包装引擎 awakenSkill 统一挂点——任何觉醒技触发后，武将牌常驻对应色光晕
    // 单机/联机兼容：觉醒content在各端均执行awakenSkill，本地挂载即全端同步生效
    lib.cshAwakenHaloMap = {
        csh_feisheng: 0, // 飞升·鎏金
        csh_pt: 35, // 暖橙
        csh_yn: 300, // 品红
        csh_chengce: 220, // 承策·御嶂蓝
        csh_jianwu: 160, // 青碧
        csh_tuofan: 45, // 脱凡·琥珀
        csh_qianxin: 200, // 潜心·静蓝
        csh_hunying: 190, // 魂影·靛蓝
        csh_niming: 340, // 逆命·赤红
        csh_guanyu_wusheng: 120, // 武圣·翠绿
        csh_zhugefuhun: 170, // 魂·青蓝
        csh_zili: 265, // 自立·权谋紫
        csh_zaoxian: 20, // 橙金
        csh_qijing22: 25, // 七进·炽橙
        csh_zhuangrong12: 55, // 庄容·黄天金
        csh_maojiang: 90, // 黄绿
        csh_sbhunzi: 210, // 魂姿·湛蓝
        csh_sbaiyin: 285, // 拜印·紫金
        csh_lunjing: 350, // 轮境·暗红
        csh_lvbu_baonu_mofen: 355, // 魔愤·赤
        csh_fuji223: 230, // 父志·蓝紫
        csh_chuhai: 45, // 除害·琥珀
        csh_zhiba: 15, // 制霸·暖金
        csh_zhansong: 100, // 战颂·翠
        csh_dabing_fenchao: 15, // 焚潮·炽橙（火伤限定技）
        csh_qiangu: 210, // 千古·静蓝（使命技）
        csh_youhabahe_shengbie: 0, // 圣别·鎏金（神圣）
        csh_xuzuo: 275, // 须佐·紫雷（弑兄觉醒）
    };
    // 佐助阵营判定（写轮/须佐共用）：身份场主忠合并/反贼/内奸独立；2v2按side；斗地主农/地
    // 联机安全：仅引用全局 lib/get，无闭包；死亡瞬间身份已翻开，无泄密
    lib.cshSameCamp = function (a, b) {
        if (!a || !b || a === b) return false;
        if (typeof a.side === "number" || typeof b.side === "number") {
            return a.side === b.side;
        }
        var ia = a.identity, ib = b.identity;
        if (!ia || !ib) return false;
        if (ia === "zhong" || ia === "zhu") ia = "zhongzhu";
        if (ib === "zhong" || ib === "zhu") ib = "zhongzhu";
        if (ia === "nei" || ib === "nei") return false;
        return ia === ib;
    };
    // 佐助·咒印摸牌数X：场上存活角色的势力（group）去重数；无势力时兜底1
    lib.cshCampCount = function () {
        var camps = [];
        for (var i = 0; i < game.players.length; i++) {
            var p = game.players[i];
            if (!p.isIn()) continue;
            var camp = p.group || null;
            if (camp && camps.indexOf(camp) === -1) camps.push(camp);
        }
        return Math.max(camps.length, 1);
    };
    // 佐助·麒麟：千鸟×2 兑换的虚拟锦囊（两连判闪电，命中3雷伤，两判皆空则销毁不流转）
    if (!lib.card.csh_qilin) {
        lib.card.csh_qilin = {
            fullskin: true,
            image: "ext:池子魔将/image/csh_qilin_soft.png",
            type: "trick",
            enable: true,
            // 虚拟锦囊：无固定花色/点数
            cardcolor: false,
            selectTarget: 1,
            filterTarget: lib.filter.notMe,
            discard: true,
            lose: true,
            content: function () {
                "step 0";
                game.broadcastAll(function () {
                    if (lib.config.background_audio) {
                        game.playAudio("ext:池子魔将/audio/skill/csh_qilin.mp3");
                    }
                });
                "step 1";
                var next = target.judge(function (card) {
                    return get.suit(card) === "spade" && get.number(card) >= 2 && get.number(card) <= 9 ? 1 : -1;
                });
                next.judge2 = function (result) {
                    return result.judge > 0;
                };
                "step 2";
                if (result.judge > 0) {
                    target.damage(player, 2, "thunder");
                    event.finish();
                } else {
                    game.log("麒麟未中，再度引雷！");
                    var next = target.judge(function (card) {
                        return get.suit(card) === "spade" && get.number(card) >= 2 && get.number(card) <= 9 ? 1 : -1;
                    });
                    next.judge2 = function (result) {
                        return result.judge > 0;
                    };
                }
                "step 3";
                if (result.judge > 0) {
                    target.damage(player, 2, "thunder");
                }
            },
            ai: {
                order: 4.5,
                result: {
                    player: 1,
                    target: function (player, target) {
                        if (get.attitude(player, target) < 0) return -1.8;
                        return -2;
                    },
                },
                tag: {
                    damage: 1,
                    natureDamage: 1,
                    thunderDamage: 1,
                },
            },
        };
        lib.translate.csh_qilin = "麒麟";
        lib.translate.csh_qilin_info = "出牌阶段，对一名其他角色使用。其进行判定：若判定牌为黑桃2~9，其受到你造成的2点雷电伤害；否则再进行一次判定。";
    }
    lib.cshAwakenHalo = (function () {
        var cssInjected = false;
        function injectCSS() {
            if (cssInjected || document.getElementById("csh_awakhalo_css")) {
                cssInjected = true;
                return;
            }
            var style = document.createElement("style");
            style.id = "csh_awakhalo_css";
            style.textContent = [
                ".csh-awk-aura{position:absolute;inset:0;pointer-events:none;z-index:6;overflow:hidden;border-radius:8px;}",
                // 卡面内缘金晕（呼吸）
                ".csh-awk-frame{position:absolute;inset:0;border-radius:8px;border:1px solid rgba(255,215,120,.55);box-shadow:inset 0 0 12px 2px rgba(255,200,90,.5),inset 0 0 34px rgba(255,170,40,.22);animation:csh_awk_frame 2.4s ease-in-out infinite;}",
                "@keyframes csh_awk_frame{0%,100%{box-shadow:inset 0 0 10px 2px rgba(255,200,90,.42),inset 0 0 26px rgba(255,170,40,.16);}50%{box-shadow:inset 0 0 18px 3px rgba(255,220,120,.68),inset 0 0 44px rgba(255,180,50,.32);}}",
                // 旋转光环
                ".csh-awk-ring{position:absolute;left:50%;top:36%;width:82%;height:56%;margin:-28% 0 0 -41%;border-radius:50%;background:conic-gradient(from 0deg,rgba(255,215,90,0) 0deg,rgba(255,228,130,.7) 55deg,rgba(255,247,205,.92) 115deg,rgba(255,215,90,.22) 195deg,rgba(255,232,155,.55) 285deg,rgba(255,215,90,0) 360deg);-webkit-mask-image:radial-gradient(circle,transparent 60%,#000 73%,#000 87%,transparent 100%);mask-image:radial-gradient(circle,transparent 60%,#000 73%,#000 87%,transparent 100%);filter:blur(1.6px);opacity:.85;animation:csh_awk_spin 8s linear infinite;}",
                "@keyframes csh_awk_spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}",
                // 浮升光尘
                ".csh-awk-p{position:absolute;bottom:2%;border-radius:50%;background:radial-gradient(circle,#fff8dc 0%,#ffd76a 45%,rgba(255,180,40,.22) 72%,transparent 100%);box-shadow:0 0 7px rgba(255,200,80,.9);filter:blur(.3px);animation:csh_awk_rise linear infinite;}",
                "@keyframes csh_awk_rise{0%{transform:translateY(4%) scale(.5);opacity:0;}18%{opacity:.9;}100%{transform:translateY(-128%) scale(1.1);opacity:0;}}",
                // 底部辉光
                ".csh-awk-base{position:absolute;left:8%;right:8%;bottom:1%;height:14%;border-radius:50%;background:radial-gradient(ellipse at center,rgba(255,214,110,.42) 0%,rgba(255,170,40,.18) 45%,transparent 72%);filter:blur(2px);animation:csh_awk_base 2.8s ease-in-out infinite;}",
                "@keyframes csh_awk_base{0%,100%{opacity:.5;transform:scaleX(1);}50%{opacity:.9;transform:scaleX(1.05);}}",
            ].join("");
            document.head.appendChild(style);
            cssInjected = true;
        }
        return function (player, hue) {
            try {
                if (!player || !player.appendChild) return;
                injectCSS();
                var old = player.querySelector(":scope > .csh-awk-aura");
                if (old) old.remove();
                var aura = document.createElement("div");
                aura.className = "csh-awk-aura";
                if (hue) aura.style.filter = "hue-rotate(" + hue + "deg) saturate(1.12)";
                var frame = document.createElement("div");
                frame.className = "csh-awk-frame";
                aura.appendChild(frame);
                var ring = document.createElement("div");
                ring.className = "csh-awk-ring";
                aura.appendChild(ring);
                var base = document.createElement("div");
                base.className = "csh-awk-base";
                aura.appendChild(base);
                for (var i = 0; i < 10; i++) {
                    var s = document.createElement("div");
                    s.className = "csh-awk-p";
                    s.style.left = (5 + Math.random() * 90) + "%";
                    var sz = 2 + Math.random() * 3.5;
                    s.style.width = sz + "px";
                    s.style.height = sz + "px";
                    s.style.animationDuration = (2.6 + Math.random() * 2.6) + "s";
                    s.style.animationDelay = (Math.random() * 3) + "s";
                    aura.appendChild(s);
                }
                player.appendChild(aura);
            } catch (e) { }
        };
    })();
    if (typeof lib.element.player.awakenSkill == "function" && !lib.element.player._csh_awakenhalo_orig) {
        lib.element.player._csh_awakenhalo_orig = lib.element.player.awakenSkill;
        lib.element.player.awakenSkill = function (skill) {
            var ret = lib.element.player._csh_awakenhalo_orig.apply(this, arguments);
            try {
                var hue = lib.cshAwakenHaloMap && lib.cshAwakenHaloMap[skill];
                if (lib.cshAwakenHalo) lib.cshAwakenHalo(this, typeof hue == "number" ? hue : 0);
            } catch (e) { }
            return ret;
        };
    }
    // 轮数冷却标记工厂：round技能（如披袍每三轮一次）发动时引擎logSkill会写入
    // storage[技能_roundcount]=当前轮数并markSkill，此标记按技能round值实时显示剩余冷却轮数
    lib.cshRoundCountMark = function (skillName, label) {
        return {
            charlotte: true,
            onremove: true,
            intro: {
                name: label,
                content: function (storage) {
                    if (typeof storage != "number") return "未发动";
                    var round = (lib.skill[skillName] && lib.skill[skillName].round) || 1;
                    var remain = round - (game.roundNumber - storage);
                    if (remain <= 0) return "已冷却完毕，可再次发动";
                    return "冷却中：还需" + remain + "轮（第" + (storage + round) + "轮可再次发动）";
                },
                markcount: function (storage) {
                    if (typeof storage != "number") return 0;
                    var round = (lib.skill[skillName] && lib.skill[skillName].round) || 1;
                    return Math.max(0, round - (game.roundNumber - storage));
                },
            },
        };
    };
    // 长文本播报助手：按字数自适应缩小字号，保证在武将牌宽度内完整显示
    // 引擎 .damage.normal-font 固定30px+nowrap，超5字即溢出被裁；>5字按 base*5/len 等比缩放（下限14px）
    // 仅本扩展的长文本播报走此助手；引擎原生播报（伤害数字、杀/闪/桃等卡牌名）不经此路径，完全不受影响
    // broadcastAll 统一下发：本地执行+广播各端，popup 第三参 nobroadcast=true 防止各端重复广播
    lib.cshPopup = function (player, text, nature) {
        game.broadcastAll(function (player2, text2, nature2) {
            player2.popup(text2, nature2, true);
            var q = player2.damagepopups;
            if (!q || !q.length) return;
            var node = q[q.length - 1];
            var len = String(text2).replace(/\s/g, "").length;
            var base = player2.classList.contains("minskin") ? 24 : 30;
            var fs = len > 5 ? Math.max(14, Math.round((base * 5) / len)) : base;
            node.style.fontSize = fs + "px";
            node.style.top = "calc(50% - " + Math.round(fs / 2) + "px)";
        }, player, text, nature);
    };
    // 陀斧·饮血：无法回复的体力统一计数，每累计满2点转化1点护甲
    // 供 陀斧②（使用杀造成伤害后的回复）、饮血拦截（外来回复：桃/桃园/队友治疗）两处共用
    // 内部走引擎 addMark/removeMark：storage 同步、标记渲染、联机广播、角标计数全部由引擎托管
    lib.cshYinxue = {
        gain: async function (player, num) {
            if (!player || !player.isIn() || !(num > 0)) return;
            player.addMark("csh_tuofu_yinxue", num);
            const total = player.countMark("csh_tuofu_yinxue");
            const armorGain = Math.floor(total / 2);
            if (armorGain > 0) {
                player.removeMark("csh_tuofu_yinxue", armorGain * 2);
                await player.changeHujia(armorGain);
                game.log(player, "的", "#g【饮血】", "转化为了", "#g" + armorGain + "点护甲");
                lib.cshPopup(player, "饮血·护甲+" + armorGain);
            } else {
                lib.cshPopup(player, "饮血·" + total + "/2");
            }
        },
    };
    // 新技能请优先使用 async content + await，避免 step 与 async 混用难维护。
    // —— 联机安全：storage 写入后统一同步（有则调用引擎 syncStorage + 可选 broadcast）——
    
    // 刺属性：仅保证 nature/译名存在（结算完全交给本体官方刺【杀】）
    try {
        if (lib.nature && !lib.nature.get("stab") && typeof lib.nature.set === "function") {
            lib.nature.set("stab", "stab");
        }
    } catch (e) {}
    if (lib.translate && !lib.translate.stab) lib.translate.stab = "刺";

    // 注册round技能冷却可见标记（披袍/七哀/焰女/春秋）：
    // 引擎round机制限制生效但markSkill找不到技能定义时不显示标记，玩家无法感知冷却进度
    if (lib.cshRoundCountMark) {
        [["csh_rongbei", "披袍"], ["csh_qiai", "七哀", ["csh_hyy_qicai", "奇才"]], ["csh_yannv1", "焰女"], ["csh_chunqiu", "春秋"]].forEach(function (pair) {
            if (!lib.skill[pair[0] + "_roundcount"]) lib.skill[pair[0] + "_roundcount"] = lib.cshRoundCountMark(pair[0], pair[1]);
        });
    }


    // 扩展内语音：缺文件/无 API 时静默跳过（符合 catch 白名单）
    lib.cshPlayExt = function (path) {
        if (!path || typeof game === "undefined" || typeof game.playAudio !== "function") return;
        try {
            game.playAudio(path);
        } catch (e) {}
    };

    // 卸标记：无标记时部分壳会抛错，装饰向可忽略
    lib.cshUnmark = function (player, skill) {
        if (!player || !skill || typeof player.unmarkSkill !== "function") return;
        try {
            player.unmarkSkill(skill);
        } catch (e) {}
    };

    // 明日香同步率标记文案：marktext 是技能级静态字段（引擎只写入 lib.translate[skill+"_bg"]），
    // 故动态化走「改写翻译键 + 直接重绘本玩家 mark 文本节点」，逐玩家设置，避免多人局串扰
    lib.cshUpdateTongbuMark = function (player, text) {
        try {
            if (!text) text = "同步";
            if (typeof lib.translate === "object" && lib.translate) lib.translate.csh_tongbu_bg = text;
            var mark = player && player.marks ? player.marks.csh_tongbu : null;
            if (mark) {
                var bg = mark.querySelector(".background.skillmark") || mark.querySelector(".background");
                if (bg) bg.innerHTML = text;
            }
        } catch (e) {}
    };



    // 明日香同步率：delta 为 5 的倍数，夹取 [0,100]，并刷新形态
    // 明日香：同步率变更（5 的倍数，夹取 0~100），刷新形态/技能/立绘
    lib.cshAsukaSync = function (player, delta, reason) {
        if (!player || typeof player.isIn !== "function" || !player.isIn()) return;
        var v = typeof player.storage.csh_tb === "number" ? player.storage.csh_tb : 60;
        var old = v;
        v = Math.max(0, Math.min(100, v + (Number(delta) || 0)));
        v = Math.floor(v / 5) * 5;
        player.storage.csh_tb = v;
        if (typeof lib.cshSyncStorage === "function") lib.cshSyncStorage(player, "csh_tb");
        if (typeof player.markSkill === "function") player.markSkill("csh_tongbu");
        if (reason) game.log(player, "同步率", (delta > 0 ? "+" : "") + delta, "→", v + "%", reason ? "（" + reason + "）" : "");

        var hit = player.storage.csh_tb_hit || (player.storage.csh_tb_hit = {});
        var tiers = [[40, "22"], [50, "23"], [60, "24"], [70, "25"], [90, "26"], [100, "27"]];
        for (var ti = 0; ti < tiers.length; ti++) {
            var thr = tiers[ti][0], vo = tiers[ti][1];
            if (old < thr && v >= thr) {
                if (!hit[thr]) {
                    hit[thr] = true;
                    lib.cshPlayExt("ext:池子魔将/audio/skill/csh_asuka_" + vo + ".mp3");
                    if (thr === 100) {
                        player.storage.csh_tb_need100 = true;
                        if (typeof lib.cshSyncStorage === "function") lib.cshSyncStorage(player, "csh_tb_need100");
                    }
                }
            }
            if (v < thr) hit[thr] = false;
        }

        // 二号机
        if (v >= 80) {
            if (!player.storage.csh_eva_on) {
                player.storage.csh_eva_on = true;
                player.storage.csh_xinmo_on = false;
                if (player.hasSkill("csh_xinmo")) player.removeSkill("csh_xinmo");
                if (!player.hasSkill("csh_lichang")) player.addSkill("csh_lichang");
                if (!player.hasSkill("csh_langqiang")) player.addSkill("csh_langqiang");
                // 二号机：体力上限固定为 4（当前体力不变，超出则夹取）
                if (player.maxHp < 4) {
                    player.gainMaxHp(4 - player.maxHp);
                } else if (player.maxHp > 4) {
                    player.loseMaxHp(player.maxHp - 4);
                }
                if (player.hp > player.maxHp) player.hp = player.maxHp;
                if (typeof player.update === "function") player.update();
                if (typeof lib.cshPlaySkin === "function") lib.cshPlaySkin(player, "csh_mingrixiang", "csh_mingrixiang_eva");
                lib.cshPlayExt("ext:池子魔将/audio/skill/csh_asuka_15.mp3");
                game.log(player, "进入", "#g二号机");
            }
        } else if (player.storage.csh_eva_on) {
            player.storage.csh_eva_on = false;
            if (player.hasSkill("csh_lichang")) player.removeSkill("csh_lichang");
            if (player.hasSkill("csh_langqiang")) player.removeSkill("csh_langqiang");
            delete player.storage.csh_langqiang_suit;
            delete player.storage.csh_langqiang_armed;
            // 退出二号机：上限回到 3（主公身份由引擎已含的加成在开局写入；此处按设计回 3 再补主公）
            var backMax = 3;
            if (player.identity === "zhu" || player.isZhu === true) backMax = 4;
            if (player.maxHp > backMax) player.loseMaxHp(player.maxHp - backMax);
            else if (player.maxHp < backMax) player.gainMaxHp(backMax - player.maxHp);
            if (player.hp > player.maxHp) player.hp = player.maxHp;
            if (typeof player.update === "function") player.update();
            if (typeof lib.cshPlaySkin === "function") lib.cshPlaySkin(player, "csh_mingrixiang", "csh_mingrixiang");
            lib.cshPlayExt("ext:池子魔将/audio/skill/csh_asuka_16.mp3");
            game.log(player, "退出二号机");
        }

        // 心魔磁滞：<40 进入；≥60 脱离（二号机期间不进心魔）
        if (!player.storage.csh_eva_on) {
            if (v < 40 && !player.storage.csh_xinmo_on) {
                player.storage.csh_xinmo_on = true;
                if (!player.hasSkill("csh_xinmo")) player.addSkill("csh_xinmo");
                if (typeof lib.cshPlaySkin === "function") lib.cshPlaySkin(player, "csh_mingrixiang", "csh_mingrixiang_xinmo");
                lib.cshPlayExt("ext:池子魔将/audio/skill/csh_asuka_17.mp3");
                game.log(player, "堕入", "#r心魔");
            } else if (v >= 60 && player.storage.csh_xinmo_on) {
                player.storage.csh_xinmo_on = false;
                if (player.hasSkill("csh_xinmo")) player.removeSkill("csh_xinmo");
                if (typeof lib.cshPlaySkin === "function") lib.cshPlaySkin(player, "csh_mingrixiang", "csh_mingrixiang");
                lib.cshPlayExt("ext:池子魔将/audio/skill/csh_asuka_18.mp3");
                game.log(player, "脱离心魔");
            }
        }

        // 【70 同步：杀伤害+1】此处不得动态增删技能。
        // csh_tongbu_shaDmg 已是 csh_tongbu.group 成员，随主技能永久持有，
        // 是否生效完全由它自己的 filter（storage.csh_tb >= 70）判定。
        //
        // ⚠ 血泪教训（曾导致该效果永久静默）：对 group 成员调用 removeSkill 时，
        // removeSkillTrigger 会把它从 lib.hook[playerid_role_evt] 里摘掉触发注册；
        // 而 player.hasSkill() 内部走 game.expandSkills（含 group 展开），摘掉之后
        // 依然返回 true —— 于是「!hasSkill 才 addSkill」的守卫永远不成立，
        // 触发再也不会被重新注册，【杀】伤害+1 从开局起就是死的。
        // 正解：group 成员只保留在 group 里，靠 filter 做阈值门控
        // （同 csh_tongbu_mod 的 40/50、csh_tongbu_extraSha 的 60）。

        if (typeof lib.cshSyncStorage === "function") {
            lib.cshSyncStorage(player, "csh_eva_on");
            lib.cshSyncStorage(player, "csh_xinmo_on");
            lib.cshSyncStorage(player, "csh_tb_hit");
        }

        // 标记文案：二号机形态显示「二号机」，否则「同步」（每次同步结束刷新，保证与本玩家状态一致）
        if (typeof lib.cshUpdateTongbuMark === "function") {
            lib.cshUpdateTongbuMark(player, player.storage.csh_eva_on ? "二号机" : "同步");
        }
    };

// storage 变更同步（优先原生 player.syncStorage）
    lib.cshSyncStorage = function (player, key) {
        if (!player || !key) return;
        if (typeof player.syncStorage === "function") {
            player.syncStorage(key);
            return;
        }
        if (typeof game !== "undefined" && game.addVideo) {
            try {
                game.addVideo("storage", player, [key, JSON.parse(JSON.stringify(player.storage[key]))]);
            } catch (e) {
                if (typeof console !== "undefined" && console.warn) {
                    console.warn("[池子魔将] cshSyncStorage video fallback", key, e);
                }
            }
        }
    };
    // —— 统一卖血/自残 AI 安全阈值：返回对 target 受到 card 伤害时的 AI 修正值 ——
    // 规则：致死拒绝；低血降权；友军伤害降权；仍允许合理卖血成长
    
    lib.cshMaixieEffect = function (card, player, target, opt) {
        opt = opt || {};
        if (!get.tag(card, "damage")) return;
        var dmg = get.tag(card, "damage") || 1;
        var hujia = target.hujia || 0;
        var realLoss = Math.max(0, dmg - hujia);
        if (realLoss >= target.hp) return "zeroplayertarget";
        var num = typeof opt.base === "number" ? opt.base : 1.0;
        if (typeof opt.bonus === "function") num += opt.bonus(target) || 0;
        if (target.hp <= 2) num -= 1.0;
        if (target.hp <= 1) num -= 1.5;
        if (dmg >= 2) num -= 0.4 * (dmg - 1);
        if (player && player !== target && get.attitude(player, target) > 0) num *= 0.5;
        if (opt.maxHpCap && target.maxHp >= opt.maxHpCap) return 0;
        return num;
    };
    // 惊吓魔盒炸开特效（整蛊向）：诡计礼盒滴答作响→盖子弹飞、弹簧小丑弹出、☠⚡?乱喷、头像惊吓红闪
    // 整体约束在武将牌矩形内：盒底贴牌底、"嘭"字顶贴牌顶、碎片与小丑均不出牌界（窄屏/边缘座位不出屏）
    // 方法内不引用外部闭包，可随 game.broadcastAll 安全下发到联机各端（联机时所有人同看）
    lib.cshZhaLiFx = function (target) {
        game.broadcastAll(function (target) {
            if (!target || !target.node || !target.node.avatar || !ui.arena) return;
            if (!document.getElementById("csh_zhali_fx_css")) {
                var style = document.createElement("style");
                style.id = "csh_zhali_fx_css";
                style.innerHTML = [
                    "@keyframes cshZhaliIn{0%{transform:scale(0) rotate(-25deg)}60%{transform:scale(1.18) rotate(8deg)}100%{transform:scale(1) rotate(0)}}",
                    "@keyframes cshZhaliTick{0%,100%{transform:translate(0,0)}6%{transform:translate(-2px,1px)}12%{transform:translate(2px,-1px)}18%{transform:translate(-3px,0)}24%{transform:translate(3px,1px)}30%{transform:translate(-4px,-1px)}36%{transform:translate(4px,1px)}44%{transform:translate(-5px,0)}50%{transform:translate(5px,-1px)}58%{transform:translate(-6px,1px)}64%{transform:translate(6px,0)}72%{transform:translate(-7px,-1px)}78%{transform:translate(7px,1px)}86%{transform:translate(-8px,0)}93%{transform:translate(8px,0)}}",
                    "@keyframes cshZhaliBoom{0%{transform:scale(1)}30%{transform:scale(1.35)}100%{transform:scale(.1);opacity:0}}",
                    "@keyframes cshZhaliSmoke{0%{transform:scale(.3);opacity:.85}100%{transform:scale(2);opacity:0}}",
                    "@keyframes cshZhaliLid{0%{transform:translate(0,0) rotate(0)}100%{transform:translate(38px,-90px) rotate(460deg);opacity:0}}",
                    "@keyframes cshZhaliQ{0%,100%{transform:scale(1)}50%{transform:scale(1.3)}}",
                    "@keyframes cshZhaliPop{0%{transform:translateY(4px) scale(.1)}55%{transform:translateY(var(--pop)) scale(1.18)}75%{transform:translateY(calc(var(--pop) + 3px)) scale(.94)}100%{transform:translateY(var(--pop)) scale(1)}}",
                    "@keyframes cshZhaliSway{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}",
                    "@keyframes cshZhaliOut{0%{opacity:1}100%{opacity:0;transform:translateY(var(--pop)) scale(.35) rotate(35deg)}}",
                    "@keyframes cshZhaliFly{0%{transform:translate(0,0) scale(.5) rotate(0);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(1.25) rotate(var(--dr));opacity:0}}",
                    "@keyframes cshZhaliBang{0%{opacity:0;transform:translateX(-50%) scale(.3)}18%{opacity:1;transform:translateX(-50%) scale(1.3)}32%{transform:translateX(-50%) scale(1)}75%{opacity:1;transform:translateX(-50%) translateY(-3px)}100%{opacity:0;transform:translateX(-50%) translateY(-8px)}}",
                    "@keyframes cshZhaliShake{0%,100%{transform:translate(0,0)}12%{transform:translate(-7px,3px)}25%{transform:translate(6px,-4px)}38%{transform:translate(-5px,-3px)}50%{transform:translate(5px,3px)}62%{transform:translate(-4px,2px)}75%{transform:translate(3px,-2px)}88%{transform:translate(-2px,1px)}}",
                    "@keyframes cshZhaliScare{0%,100%{filter:none}15%{filter:drop-shadow(0 0 9px #ff2626) saturate(1.7)}30%{filter:none}45%{filter:drop-shadow(0 0 11px #ff1414) saturate(1.9)}60%{filter:none}75%{filter:drop-shadow(0 0 7px #ff2626) saturate(1.5)}}",
                ].join("");
                document.head.appendChild(style);
            }
            var av = target.node.avatar;
            var rect = av.getBoundingClientRect();
            // 盒子尺寸随武将牌自适应；盒底贴牌底，整个特效约束在牌矩形内
            var size = Math.max(22, Math.min(44, Math.min(rect.width, rect.height) * 0.46));
            var clownW = Math.round(Math.max(20, Math.min(36, size * 0.82)));
            var hatH = Math.round(clownW * 0.34);
            var cx = rect.left + rect.width / 2;
            var boxTop = rect.bottom - size - 2;
            var boxX = cx - size / 2;
            var pop = Math.max(6, Math.round(rect.top + hatH - (boxTop - clownW / 2))); // 弹出后帽尖恰至牌顶
            // 盒身（诡计紫黑礼盒，盒面"?"滴答跳动）
            var box = document.createElement("div");
            box.style.cssText = [
                "position:fixed",
                "z-index:997",
                "width:" + size + "px",
                "height:" + size + "px",
                "left:" + boxX + "px",
                "top:" + boxTop + "px",
                "background:linear-gradient(135deg,#3b2a55,#1d1230)",
                "border:2px solid #86f04e",
                "border-radius:6px",
                "box-shadow:0 0 10px rgba(80,220,60,.4),0 3px 8px rgba(0,0,0,.6)",
                "animation:cshZhaliIn .45s ease-out both,cshZhaliTick .55s linear .5s both,cshZhaliBoom .3s ease-in 1.05s both",
                "pointer-events:none",
            ].join(";");
            var q = document.createElement("div");
            q.textContent = "?";
            q.style.cssText = [
                "position:absolute",
                "left:0",
                "top:0",
                "width:100%",
                "height:100%",
                "display:flex",
                "align-items:center",
                "justify-content:center",
                "font-weight:bold",
                "color:#a3ff3c",
                "text-shadow:0 0 7px rgba(110,255,70,.85)",
                "font-size:" + Math.round(size * 0.52) + "px",
                "animation:cshZhaliQ .5s ease-in-out infinite",
            ].join(";");
            box.appendChild(q);
            ui.arena.appendChild(box);
            // 盒盖（滴答同步抖，爆炸时弹飞）
            var lid = document.createElement("div");
            lid.style.cssText = [
                "position:fixed",
                "z-index:998",
                "width:" + (size + 8) + "px",
                "height:" + (Math.round(size * 0.24) + 4) + "px",
                "left:" + (boxX - 4) + "px",
                "top:" + (boxTop - Math.round(size * 0.24) - 6) + "px",
                "background:linear-gradient(135deg,#4a3668,#241538)",
                "border:2px solid #86f04e",
                "border-radius:4px",
                "animation:cshZhaliIn .45s ease-out both,cshZhaliTick .55s linear .5s both,cshZhaliLid .9s ease-in 1.05s both",
                "pointer-events:none",
            ].join(";");
            ui.arena.appendChild(lid);
            // 弹簧小丑（外层定位弹出，内层摇摆做鬼脸）
            var clown = document.createElement("div");
            clown.style.cssText = [
                "position:fixed",
                "z-index:999",
                "width:" + clownW + "px",
                "height:" + clownW + "px",
                "left:" + (cx - clownW / 2) + "px",
                "top:" + (boxTop - clownW / 2) + "px",
                "--pop:-" + pop + "px",
                "animation:cshZhaliPop .5s cubic-bezier(.25,1.5,.45,1) 1.05s both,cshZhaliOut .4s ease-in 2s both",
                "pointer-events:none",
            ].join(";");
            var hw = clownW / 2;
            var inner = document.createElement("div");
            inner.style.cssText = "position:relative;width:100%;height:100%;animation:cshZhaliSway .5s ease-in-out 1.55s 2;";
            inner.innerHTML =
                '<div style="position:absolute;top:' + (-hatH + 2) + 'px;left:50%;margin-left:' + (-hw / 2) + 'px;width:0;height:0;border-left:' + (hw / 2) + 'px solid transparent;border-right:' + (hw / 2) + 'px solid transparent;border-bottom:' + hatH + 'px solid #d42a2a"></div>' +
                '<div style="position:absolute;top:' + (-hatH - 3) + 'px;left:50%;margin-left:-3px;width:6px;height:6px;border-radius:50%;background:#ffd52e"></div>' +
                '<div style="position:absolute;top:0;left:0;width:' + clownW + 'px;height:' + clownW + 'px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff6ea,#e0c4a0);border:1px solid #7a5a3a"></div>' +
                '<div style="position:absolute;top:' + Math.round(clownW * 0.3) + 'px;left:' + Math.round(clownW * 0.2) + 'px;width:' + Math.round(clownW * 0.15) + 'px;height:' + Math.round(clownW * 0.22) + 'px;border-radius:50%;background:#101010"></div>' +
                '<div style="position:absolute;top:' + Math.round(clownW * 0.3) + 'px;right:' + Math.round(clownW * 0.2) + 'px;width:' + Math.round(clownW * 0.15) + 'px;height:' + Math.round(clownW * 0.22) + 'px;border-radius:50%;background:#101010"></div>' +
                '<div style="position:absolute;top:' + Math.round(clownW * 0.55) + 'px;left:50%;margin-left:' + (-Math.round(clownW * 0.26)) + 'px;width:' + Math.round(clownW * 0.52) + 'px;height:' + Math.round(clownW * 0.24) + 'px;border-radius:0 0 ' + Math.round(clownW * 0.52) + 'px ' + Math.round(clownW * 0.52) + 'px;background:#c81e1e"></div>';
            clown.appendChild(inner);
            ui.arena.appendChild(clown);
            // 爆炸紫烟
            var smoke = document.createElement("div");
            smoke.style.cssText = [
                "position:fixed",
                "z-index:996",
                "width:" + Math.round(size * 1.6) + "px",
                "height:" + Math.round(size * 1.6) + "px",
                "left:" + Math.round(cx - size * 0.8) + "px",
                "top:" + Math.round(boxTop + size / 2 - size * 0.8) + "px",
                "border-radius:50%",
                "background:radial-gradient(circle,rgba(160,90,255,.5),rgba(90,40,160,.32) 55%,transparent 70%)",
                "animation:cshZhaliSmoke .55s ease-out 1.05s both",
                "pointer-events:none",
            ].join(";");
            ui.arena.appendChild(smoke);
            // 整蛊碎片：☠⚡?!✖♠ 乱喷（向上扇形为主，飞行范围约束在牌矩形内）
            var symbols = ["☠", "?", "⚡", "!", "✖", "♠", "?", "☠", "!", "⚡", "?", "✖"];
            var colors = ["#ff4040", "#a3ff3c", "#ffd52e", "#8a5cff", "#ff8a3c", "#e8e8e8"];
            var startX = cx;
            var startY = boxTop + 2;
            var maxUp = Math.max(12, startY - rect.top - 12);
            var maxSide = Math.max(16, rect.width / 2 - 10);
            var maxDown = Math.max(4, rect.bottom - startY - 4);
            var pieces = [];
            for (var i = 0; i < 12; i++) {
                var p = document.createElement("div");
                var spread = (i % 6 - 2.5) / 2.5;
                var dx = Math.round(spread * maxSide * (0.4 + Math.random() * 0.6));
                var dy = i >= 9 ? Math.round(Math.min(maxDown * 0.6, 4 + Math.random() * 8)) : -Math.round(Math.min(maxUp * (0.5 + Math.random() * 0.5), 20 + Math.random() * 90));
                p.textContent = symbols[i % symbols.length];
                p.style.cssText = [
                    "position:fixed",
                    "z-index:1000",
                    "left:" + Math.round(startX) + "px",
                    "top:" + Math.round(startY) + "px",
                    "font-size:" + (11 + Math.round(Math.random() * 9)) + "px",
                    "font-weight:bold",
                    "color:" + colors[i % colors.length],
                    "text-shadow:0 1px 3px rgba(0,0,0,.8)",
                    "--dx:" + dx + "px",
                    "--dy:" + dy + "px",
                    "--dr:" + Math.round((Math.random() - 0.5) * 900) + "deg",
                    "animation:cshZhaliFly " + (0.75 + Math.random() * 0.45).toFixed(2) + "s ease-out 1.05s both",
                    "pointer-events:none",
                ].join(";");
                ui.arena.appendChild(p);
                pieces.push(p);
            }
            // "嘭！！"：顶边对齐武将牌顶边（自建弹字，不依赖引擎popup的居中位置）
            var bang = document.createElement("div");
            bang.textContent = "嘭！！";
            bang.style.cssText = [
                "position:fixed",
                "z-index:1001",
                "left:" + Math.round(cx) + "px",
                "top:" + Math.round(rect.top - 1) + "px",
                "transform:translateX(-50%)",
                "font-size:" + Math.max(18, Math.min(26, Math.round(rect.width * 0.17))) + "px",
                "font-weight:bold",
                "font-family:STKaiti,KaiTi,serif",
                "color:#ff3525",
                "text-shadow:0 0 10px rgba(255,40,20,.9),0 2px 3px #000",
                "white-space:nowrap",
                "animation:cshZhaliBang 1.05s ease-out 1.05s both",
                "pointer-events:none",
            ].join(";");
            ui.arena.appendChild(bang);
            // 头像惊吓：剧烈抖动 + 红色闪烁
            av.style.animation = "cshZhaliShake .8s ease 1.05s,cshZhaliScare .9s ease 1.05s";
            setTimeout(function () {
                av.style.animation = "";
            }, 2100);
            setTimeout(function () {
                box.remove();
                lid.remove();
                clown.remove();
                smoke.remove();
                bang.remove();
                for (var j = 0; j < pieces.length; j++) pieces[j].remove();
            }, 2600);
        }, target);
    };
    // 手杀风特效引擎 V3（毛笔字体版）
    // 连杀系列大字=志莽行书(ZMX)；癫狂屠戮/无双·万军取首/医术高超/妙手回春=龙藏体(LC)；连杀徽标(一破~七连)=华文琥珀
    // 字体子集(woff2/base64)已内嵌，联机各端免装字体；特效时长按语音MP3定档：≤2.5s→2.5s，2.5~3s→3s，3s以上→3.5s
    // 全部挂在 lib.cshShoushaFx 属性上，方法内不引用外部闭包，可随 game.broadcastAll 安全下发到联机各端
    lib.cshShoushaFx = {
        _cssOk: false,
        // paiyi 3100：素材裁掉头尾静止段后 91 帧 / 3.033s，留 ~70ms 余量
        // 技能横幅时长：必须 ≥ 素材真实时长，否则 game.pause 会在视频播完前就放开
        // （尾巴被下一段结算压掉）。quedi 69帧/2.300s、paiyi 91帧/3.033s、
        // liegong 90帧/3.000s、luanwu 111帧/3.700s，各留 30~90ms 余量。
        _dur: { diankuang: 2500, wanjun: 3600, kill: { 1: 3500, 2: 3000, 3: 3500, 4: 3500, 5: 3500, 6: 3500, 7: 3500 }, recover: 2500, niliu: 23300, guilai: 3000, quedi: 2800, paiyi: 3100, liegong: 3060, luanwu: 3760, duwu: 2060, pojun: 2060, yannv1: 1860 },
        _inject: function () {
            if (this._cssOk || document.getElementById("csh_shousha_css")) {
                this._cssOk = true;
                return;
            }
            var style = document.createElement("style");
            style.id = "csh_shousha_css";
            // 字体外置为 woff2 文件：减小 extension.js 解析体积，仅在首次播报特效时加载字体（不影响技能与联机逻辑）
            var _fontBase = ((typeof lib !== "undefined" && lib.assetURL) ? lib.assetURL : "") + "extension/池子魔将/font/";
            style.textContent = [
                "@font-face{font-family:'ZMX';src:url(" + _fontBase + "csh_fx_font_1.woff2) format('woff2');font-display:swap;}",
                "@font-face{font-family:'LC';src:url(" + _fontBase + "csh_fx_font_2.woff2) format('woff2');font-display:swap;}",
                /* 2026-10-15：ZMX3 = 全覆盖子集（4058 字，开源 Zhi Mang Xing）。
                   原 LC/ZMX 子集仅 78/84 字（专供早期技能名），新批次技能名几乎全不在表内 →
                   横幅会逐字回退宋体。故在 LC 之后补 ZMX3 作为书法体兜底（老横幅仍走 LC，观感不变）。 */
                "@font-face{font-family:'ZMX3';src:url(" + _fontBase + "csh_fx_font_3.woff2) format('woff2');font-display:swap;}",
                /* 注：神/魔选势力面板滚动条（engine-compat C4）**不在这里**——
                   本块是击杀特效的懒注入（要等第一次特效才跑），而选将面板开局就出现。
                   正确落点 = cshEgScrollApply()（content 加载即执行）。此处曾误挂，已迁出。 */
                ".csh_ssfx_layer{position:fixed;inset:0;z-index:10000;pointer-events:none;overflow:hidden;}",
                ".csh_ssfx_bgfade{animation:csh_ssfx_bgfade 2.4s ease-in-out forwards;}",
                "@keyframes csh_ssfx_bgfade{0%{opacity:0;}12%{opacity:1;}78%{opacity:1;}100%{opacity:0;}}",
                "@keyframes csh_ssfx_shake_x{0%,100%{transform:translate(0,0);}10%{transform:translate(-10px,6px);}20%{transform:translate(9px,-7px);}30%{transform:translate(-8px,-5px);}40%{transform:translate(7px,7px);}50%{transform:translate(-6px,4px);}60%{transform:translate(5px,-5px);}70%{transform:translate(-4px,3px);}80%{transform:translate(3px,-3px);}90%{transform:translate(-2px,2px);}}",
                ".csh_ssfx_shake{animation:csh_ssfx_shake_x .7s ease-in-out;}",
                ".csh_ssfx_shake_big{animation:csh_ssfx_shake_x 1.2s ease-in-out;}",
                "@keyframes csh_ssfx_shake_x2{0%,100%{transform:translate(0,0) rotate(0deg);}8%{transform:translate(-17px,10px) rotate(-.7deg);}18%{transform:translate(15px,-12px) rotate(.6deg);}28%{transform:translate(-13px,-8px) rotate(-.4deg);}38%{transform:translate(12px,12px) rotate(.5deg);}48%{transform:translate(-9px,6px) rotate(-.3deg);}58%{transform:translate(8px,-8px) rotate(.3deg);}68%{transform:translate(-6px,5px) rotate(-.2deg);}78%{transform:translate(5px,-5px);}88%{transform:translate(-3px,3px);}}",
                ".csh_ssfx_shake_huge{animation:csh_ssfx_shake_x2 1.3s ease-in-out;}",
                ".csh_ssfx_dtext{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-family:\"STHupo\",\"华文琥珀\",\"Microsoft YaHei\",\"SimHei\",sans-serif;font-weight:900;white-space:nowrap;opacity:0;}",
                ".csh_ssfx_dstack{display:grid;transform:skewX(-8deg);}",
                ".csh_ssfx_dstack>*{grid-area:1/1;}",
                ".csh_ssfx_dcopy{color:transparent;opacity:0;}",
                ".csh_ssfx_dfill{background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent;color:transparent;}",
                ".csh_ssfx_dtin{animation:csh_ssfx_dtin .5s cubic-bezier(.15,1.35,.35,1) forwards;}",
                "@keyframes csh_ssfx_dtin{0%{opacity:0;transform:translate(-50%,-50%) skewX(-8deg) scale(3.4) rotate(-4deg);filter:blur(13px);}40%{opacity:1;filter:blur(0);}55%{transform:translate(-50%,-50%) skewX(-8deg) scale(.92);}72%{transform:translate(-50%,-50%) skewX(-8deg) scale(1.07);}100%{opacity:1;transform:translate(-50%,-50%) skewX(-8deg) scale(1);filter:blur(0);}}",
                ".csh_ssfx_dtout{animation:csh_ssfx_dtout .42s ease-in forwards;}",
                "@keyframes csh_ssfx_dtout{0%{opacity:1;}100%{opacity:0;transform:translate(-50%,-50%) skewX(-8deg) scale(1.5);filter:blur(9px);}}",
                ".csh_ssfx_dtin .csh_ssfx_dcr{animation:csh_ssfx_chr .5s ease-out forwards;}",
                "@keyframes csh_ssfx_chr{0%{opacity:.95;transform:translateX(-18px);}55%{opacity:.45;}100%{opacity:0;transform:translateX(-2px);}}",
                ".csh_ssfx_dtin .csh_ssfx_dcc{animation:csh_ssfx_chc .5s ease-out forwards;}",
                "@keyframes csh_ssfx_chc{0%{opacity:.95;transform:translateX(18px);}55%{opacity:.45;}100%{opacity:0;transform:translateX(2px);}}",
                ".csh_ssfx_badge{position:absolute;font-size:4vmin;font-family:\"STHupo\",\"华文琥珀\",\"Microsoft YaHei\",\"SimHei\",sans-serif;font-weight:900;letter-spacing:.25em;padding:.22em .45em .22em .8em;color:#fff;background:linear-gradient(160deg,#e53935 0%,#8e0000 100%);border:2px solid rgba(255,255,255,.92);border-radius:.16em;box-shadow:0 0 16px rgba(255,50,50,.85),0 4px 10px rgba(0,0,0,.8);z-index:2;transform:rotate(-32deg) scale(0);opacity:0;white-space:nowrap;}",
                ".csh_ssfx_badgein{animation:csh_ssfx_badgein .45s cubic-bezier(.2,1.6,.4,1) forwards;}",
                "@keyframes csh_ssfx_badgein{0%{opacity:0;transform:rotate(-32deg) scale(0);}100%{opacity:1;transform:rotate(-9deg) scale(1);}}",
                ".csh_ssfx_badgeout{animation:csh_ssfx_badgeout .4s ease-in forwards;}",
                "@keyframes csh_ssfx_badgeout{0%{opacity:1;}100%{opacity:0;transform:rotate(-9deg) scale(1.3);}}",
                ".csh_ssfx_ctext{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-weight:400;white-space:nowrap;letter-spacing:.18em;opacity:0;}",
                ".csh_ssfx_ctin{animation:csh_ssfx_ctin .7s ease-out forwards;}",
                "@keyframes csh_ssfx_ctin{0%{opacity:0;transform:translate(-50%,-46%);}100%{opacity:1;transform:translate(-50%,-50%);}}",
                ".csh_ssfx_ctout{animation:csh_ssfx_ctout .6s ease-in forwards;}",
                "@keyframes csh_ssfx_ctout{0%{opacity:1;}100%{opacity:0;transform:translate(-50%,-55%);}}"
            ].join("");
            document.head.appendChild(style);
            this._cssOk = true;
        },
        play: function (type, data) {
            try {
                // 录像回放不叠特效层，避免重复 canvas（参考 coin arenaReady 早退）
                if (typeof _status !== "undefined" && _status.video) return;
                this._inject();
                // 同类型特效运行中不重入
                this._running = this._running || {};
                if (this._running[type]) return;
                this._running[type] = true;
                var self = this;
                var clear = function () {
                    try { self._running[type] = false; } catch (e0) {}
                };
                setTimeout(clear, (this._dur && (this._dur[type] || (type === "kill" ? 3500 : 3000))) || 3500);
                if (type === "niliu") this._niliuVideo();
                else if (type === "quedi") this._quediVideo();
                else if (type === "paiyi") this._paiyiVideo();
                else if (type === "liegong") this._liegongVideo();
                else if (type === "luanwu") this._luanwuVideo();
                else if (type === "duwu") this._duwuVideo();
                else if (type === "pojun") this._pojunVideo();
                else if (type === "yannv1") this._yannv1Video();
                else if (type === "guilai") this._guilai();
                else clear();
            } catch (e) { }
        },
        _shake: function (level) {
            var arena = document.getElementById("arena");
            if (!arena) return;
            var cls = level >= 3 ? "csh_ssfx_shake_huge" : (level === 2 ? "csh_ssfx_shake_big" : "csh_ssfx_shake");
            arena.classList.add(cls);
            setTimeout(function () { arena.classList.remove(cls); }, level >= 3 ? 1350 : (level === 2 ? 1250 : 750));
        },
        _layer: function () {
            var layer = document.createElement("div");
            layer.className = "csh_ssfx_layer";
            // 挂到 documentElement 而非 body：引擎缩放时 body 带 transform:scale，
            // 其内部的 fixed 层会随之整体偏移（右下角），挂 html 层则永远铺满真实视口、文字真正居中
            document.documentElement.appendChild(layer);
            return layer;
        },
        _bg: function (layer, background, dur) {
            var bg = document.createElement("div");
            bg.className = "csh_ssfx_bgfade";
            bg.style.cssText = "position:absolute;inset:0;background:" + background + ";";
            if (dur) bg.style.animationDuration = dur + "ms";
            layer.appendChild(bg);
            return bg;
        },
        // 横幅四边羽化：把 video 元素缩到「contain 之后的实际绘制区」，遮罩挂在 video 自身。
        //
        // 为什么不能挂在铺满容器的 vbox 上（这是「只有上下羽化、左右没有」的根因）：
        //   遮罩的百分比是按**元素盒子**算的。横幅容器是 16/7（2.286），素材是 1158x576（2.010），
        //   object-fit:contain 会按高度贴合、左右各留约 6% 黑边；
        //   挂在 vbox 时那 5% 的横向羽化整段落在黑边里，画面左右两边根本没被羽化。
        //   纵向因为视频本来就填满高度，所以看得出羽化 —— 于是表现为「只有上下」。
        // 把 video 按 contain 的实际绘制尺寸定死，再把遮罩挂上去，四边羽化才都落在画面上。
        //
        // fx / fy：左右 / 上下的羽化宽度，按**画面自身**的百分比给。
        /**
         * 羽化 v2 —— 三层 mask 叠加（intersect），替代旧版单层线性渐变。
         *
         * 旧版（fx=5, fy=8）：linear 两层、纯线性过渡，边缘生硬且力度偏弱 → 用户反馈「中庸」。
         * 新版设计：
         *   ① 横向 ease 多档过渡 —— 先急后缓的 S 曲线，边缘不再是一条死线；
         *   ② 纵向同款，且**底部比顶部略重**（横幅下方更贴近结算信息，收得干净些）；
         *   ③ 径向暗角层 —— 四角比边中点收得更狠，形成椭圆视场，把视线压向人物，
         *      与影片黑边(letterbox)的柔和过渡是同一种语言。
         * fx/fy 语义不变（开始羽化的百分比），调用方已加大到 13/18。
         * 注意：大爱仙尊(niliu)走自己的内联代码，不经过本函数，不受影响。
         */
        _feather: function (video, box, fx, fy) {
            var f = Math.max(0, Math.min(40, fx || 13));
            var t = Math.max(0, Math.min(40, fy || 18));       // 顶部带宽
            var b = Math.min(40, t * 1.2);                     // 底部比顶部重 20%
            var pct = function (v) { return (+v).toFixed(2) + "%"; };
            // 横向：0 →透明 / .12 / .45 / 1.0（fx% 处全实）→ …对称回收
            var horiz = "linear-gradient(to right," +
                "transparent 0%,rgba(0,0,0,.12) " + pct(f * .25) + "," +
                "rgba(0,0,0,.45) " + pct(f * .6) + ",#000 " + pct(f) + "," +
                "#000 " + pct(100 - f) + ",rgba(0,0,0,.45) " + pct(100 - f * .6) + "," +
                "rgba(0,0,0,.12) " + pct(100 - f * .25) + ",transparent 100%)";
            // 纵向：上 t 下 b
            var vert = "linear-gradient(to bottom," +
                "transparent 0%,rgba(0,0,0,.12) " + pct(t * .3) + "," +
                "rgba(0,0,0,.5) " + pct(t * .65) + ",#000 " + pct(t) + "," +
                "#000 " + pct(100 - b) + ",rgba(0,0,0,.5) " + pct(100 - b * .35) + "," +
                "rgba(0,0,0,.12) " + pct(100 - b * .3) + ",transparent 100%)";
            // 径向暗角：中段全实，四角渐进收黑
            var radial = "radial-gradient(ellipse 80% 92% at 50% 50%," +
                "#000 58%,rgba(0,0,0,.75) 76%,rgba(0,0,0,.32) 92%,transparent 100%)";
            var mask = [horiz, vert, radial].join(",");
            var apply = function () {
                var vw = video.videoWidth, vh = video.videoHeight;
                var cw = box.clientWidth, ch = box.clientHeight;
                if (!vw || !vh || !cw || !ch) return false;
                var s = Math.min(cw / vw, ch / vh);
                video.style.width = Math.max(1, Math.round(vw * s)) + "px";
                video.style.height = Math.max(1, Math.round(vh * s)) + "px";
                video.style.objectFit = "fill";   // 尺寸已按 contain 算好，不再需要 contain
                video.style.webkitMaskImage = mask;
                video.style.maskImage = mask;
                video.style.webkitMaskComposite = "source-in";
                video.style.maskComposite = "intersect";
                video.style.webkitMaskSize = "100% 100%";
                video.style.maskSize = "100% 100%";
                video.style.webkitMaskRepeat = "no-repeat";
                video.style.maskRepeat = "no-repeat";
                return true;
            };
            // 元数据没到 / 布局还没稳定时重试几帧；拿不到就保持原样（contain 铺满），不会更糟
            var tries = 0;
            var attempt = function () {
                if (apply()) return;
                if (++tries < 20) requestAnimationFrame(attempt);
            };
            try {
                video.addEventListener("loadedmetadata", attempt);
            } catch (e0) {}
            attempt();
        },
        // 横幅淡入 + 收尾淡出，返回可直接挂到 "playing" 的处理器。
        //
        // 为什么结尾要淡出：横幅素材基本都不带自然衰减（文鸯那支亮度一路 ~70 到底，
        // 末帧原本还是一帧硬切黑 —— 已在 effect 文件里裁掉）。若播完直接 remove，
        // 会在亮帧上"啪"地消失。这里在结束前 lead 秒把**透明度**线性渐到 0，
        // 注意不是渐到黑 —— 渐到黑等于把刚修掉的黑屏又换回来。
        // 逆流护身印不需要这个：它的素材自带衰减（亮度从峰值 115 降到 31）。
        _reveal: function (video, fallbackDur) {
            return function () {
                video.style.opacity = "1";
                try {
                    var lead = 0.22;
                    var dur = (typeof video.duration === "number" && isFinite(video.duration) && video.duration > lead + 0.1)
                        ? video.duration : fallbackDur;
                    setTimeout(function () {
                        video.style.transition = "opacity 220ms linear";
                        video.style.opacity = "0";
                    }, Math.max(0, (dur - lead) * 1000));
                } catch (e) {}
            };
        },
        _flash: function (layer, color, delay, dur) {
            var f = document.createElement("div");
            f.style.cssText = "position:absolute;inset:0;background:" + (color || "#fff") + ";opacity:0;";
            layer.appendChild(f);
            setTimeout(function () {
                f.animate([{ opacity: .95 }, { opacity: 0 }], { duration: dur || 220, easing: "ease-out", fill: "forwards" });
            }, delay);
        },
        _focus: function (layer, delay, dur, color) {
            var d = document.createElement("div");
            d.style.cssText = "position:absolute;left:50%;top:50%;width:200vmax;height:200vmax;margin:-100vmax 0 0 -100vmax;opacity:0;background:repeating-conic-gradient(" + (color || "rgba(0,0,0,.6)") + " 0deg .7deg,transparent .7deg 4.6deg);-webkit-mask-image:radial-gradient(circle,transparent 16%,#000 30%,#000 68%,transparent 90%);mask-image:radial-gradient(circle,transparent 16%,#000 30%,#000 68%,transparent 90%);";
            layer.appendChild(d);
            setTimeout(function () {
                d.animate([
                    { opacity: 0, transform: "rotate(0deg) scale(.7)" },
                    { opacity: .85, transform: "rotate(6deg) scale(1)", offset: .2 },
                    { opacity: .5, transform: "rotate(14deg) scale(1.15)", offset: .7 },
                    { opacity: 0, transform: "rotate(20deg) scale(1.3)" }
                ], { duration: dur || 1400, easing: "ease-out", fill: "forwards" });
            }, delay);
        },
        _shock: function (layer, delay, color, cxPct, cyPct) {
            var r = document.createElement("div");
            r.style.cssText = "position:absolute;left:" + (cxPct || 50) + "%;top:" + (cyPct || 50) + "%;width:8vmin;height:8vmin;margin:-4vmin 0 0 -4vmin;border:3px solid " + (color || "rgba(255,255,255,.9)") + ";border-radius:50%;opacity:0;";
            layer.appendChild(r);
            setTimeout(function () {
                r.animate([
                    { opacity: 1, transform: "scale(.2)" },
                    { opacity: 0, transform: "scale(9)" }
                ], { duration: 800, easing: "cubic-bezier(.1,.7,.3,1)", fill: "forwards" });
            }, delay);
        },
        _particles: function (layer, n, c1, c2, cxPct, cyPct, dist, dur) {
            for (var i = 0; i < n; i++) {
                var p = document.createElement("div");
                var size = 5 + Math.random() * 9;
                p.style.cssText = "position:absolute;left:" + cxPct + "%;top:" + cyPct + "%;width:" + size + "px;height:" + size + "px;border-radius:50%;background:radial-gradient(" + c1 + "," + c2 + ");opacity:0;";
                layer.appendChild(p);
                (function (el) {
                    var ang = Math.random() * Math.PI * 2;
                    var d = dist * (0.5 + Math.random() * 0.8);
                    setTimeout(function () {
                        el.animate([
                            { opacity: 0, transform: "translate(-50%,-50%) scale(1.3)" },
                            { opacity: 1, offset: .18 },
                            { opacity: 0, transform: "translate(" + (Math.cos(ang) * d - 25) + "px," + (Math.sin(ang) * d - 25) + "px) scale(.25)" }
                        ], { duration: dur, easing: "cubic-bezier(.1,.7,.4,1)", fill: "forwards" });
                    }, 150 + Math.random() * 500);
                })(p);
            }
        },
        _niliuVideo: function (onDone) {
            var D = this._dur.niliu || 23300;
            var layer = this._layer();
            this._bg(layer, "radial-gradient(ellipse at 50% 50%,rgba(8,18,32,.18) 0%,rgba(3,8,16,.28) 100%)", Math.min(D, 1800));
            var wrap = document.createElement("div");
            wrap.className = "csh-niliu-banner";
            wrap.style.cssText = [
                "position:absolute",
                "left:0",
                "right:0",
                "top:50%",
                "transform:translateY(-50%)",
                "width:100%",
                "aspect-ratio:1280/400",
                "max-height:42vh",
                "z-index:20",
                "overflow:hidden",
                "background:transparent",
                "pointer-events:none"
            ].join(";") + ";";
            var vbox = document.createElement("div");
            // 四边适度羽化（均匀柔和，不啃边）
            var waveMask = [
                "linear-gradient(to right, transparent 0%, #000 5%, #000 95%, transparent 100%)",
                "linear-gradient(to bottom, transparent 0%, #000 8%, #000 92%, transparent 100%)"
            ].join(",");
            vbox.style.cssText = [
                "position:absolute",
                "inset:0",
                "overflow:hidden",
                "z-index:2",
                "-webkit-mask-image:" + waveMask,
                "mask-image:" + waveMask,
                "-webkit-mask-composite:source-in",
                "mask-composite:intersect",
                "-webkit-mask-size:100% 100%",
                "mask-size:100% 100%",
                "-webkit-mask-repeat:no-repeat",
                "mask-repeat:no-repeat"
            ].join(";") + ";";
            var video = document.createElement("video");
            var base = (typeof lib !== "undefined" && lib.assetURL) ? lib.assetURL : "";
            video.src = base + "extension/池子魔将/effect/csh_daaixianzun_niliuhushenyin_banner.mp4";
            video.muted = true;
            video.defaultMuted = true;
            video.autoplay = true;
            video.playsInline = true;
            video.controls = false;
            video.loop = false;
            // auto：尽快缓冲，保证特效连贯；metadata 在手机端易因缓冲不足弹出原生播放三角
            video.preload = "auto";
            video.disablePictureInPicture = true;
            video.setAttribute("muted", "");
            video.setAttribute("autoplay", "");
            video.setAttribute("playsinline", "true");
            video.setAttribute("webkit-playsinline", "true");
            video.setAttribute("x5-playsinline", "true");
            video.setAttribute("x5-video-player-type", "h5");
            video.setAttribute("x5-video-player-fullscreen", "false");
            video.setAttribute("controlslist", "nodownload nofullscreen noremoteplayback noplaybackrate");
            video.setAttribute("disablePictureInPicture", "true");
            try { video.controls = false; video.removeAttribute("controls"); } catch (eCtrl) {}
            // 隐藏 iOS/安卓 WebView 中央播放键与原生控件条
            if (!document.getElementById("csh_niliu_video_css")) {
                var vs = document.createElement("style");
                vs.id = "csh_niliu_video_css";
                vs.textContent = [
                    "video.csh-niliu-banner::-webkit-media-controls,",
                    "video.csh-niliu-banner::-webkit-media-controls-enclosure,",
                    "video.csh-niliu-banner::-webkit-media-controls-panel,",
                    "video.csh-niliu-banner::-webkit-media-controls-start-playback-button,",
                    "video.csh-niliu-banner::-webkit-media-controls-overlay-play-button{",
                    "display:none!important;-webkit-appearance:none!important;opacity:0!important;pointer-events:none!important;",
                    "}"
                ].join("");
                document.head.appendChild(vs);
            }
            video.className = "csh-niliu-banner";
            video.style.cssText = [
                "width:100%",
                "height:100%",
                "object-fit:contain",
                "object-position:center center",
                "background:transparent",
                "display:block",
                "opacity:0",
                "transition:opacity .2s linear",
                "pointer-events:none",
                "-webkit-appearance:none",
                "appearance:none"
            ].join(";") + ";";
            vbox.appendChild(video);
            wrap.appendChild(vbox);
            layer.appendChild(wrap);
            var shakeTimer = null;
            var startShake = function () {
                var t0 = performance.now();
                var tick = function (now) {
                    if (done) return;
                    var t = (now - t0) / 1000;
                    var amp = t < 1.2 ? 1.2 : (t < 4 ? 0.75 : 0.4);
                    var x = Math.sin(t * 11.2) * amp * 0.3 + Math.sin(t * 7.1) * amp * 0.18;
                    var y = Math.cos(t * 9.4) * amp * 0.22;
                    wrap.style.transform = "translateY(calc(-50% + " + y.toFixed(2) + "px)) translateX(" + x.toFixed(2) + "px)";
                    shakeTimer = requestAnimationFrame(tick);
                };
                shakeTimer = requestAnimationFrame(tick);
            };
            var done = false;
            var finish = function () {
                if (done) return;
                done = true;
                if (shakeTimer) try { cancelAnimationFrame(shakeTimer); } catch (e) {}
                try { layer.remove(); } catch (e) {}
                if (typeof onDone === "function") {
                    try { onDone(); } catch (e2) {}
                }
            };
            var reveal = function () {
                video.style.opacity = "1";
                startShake();
            };
            video.addEventListener("playing", reveal);
            video.addEventListener("ended", finish);
            var self = this;
            video.addEventListener("error", function () {
                try { layer.remove(); } catch (e) {}
                try { self._niliu(); } catch (e2) {}
                if (typeof onDone === "function") {
                    try { onDone(); } catch (e3) {}
                }
            });
            try { video.load(); } catch (e0) {}
            var p = video.play();
            if (p && typeof p.then === "function") {
                p.then(reveal).catch(function () {
                    video.muted = true;
                    var p2 = video.play();
                    if (p2 && typeof p2.then === "function") {
                        p2.then(reveal).catch(function () { reveal(); });
                    } else {
                        reveal();
                    }
                });
            }
            setTimeout(finish, D + 500);
            return D;
        },
        _niliu: function () {
            var D = 4200;
            var layer = this._layer();
            // 宣纸墨底：低饱和墨青，缓慢沉入
            this._bg(layer, "radial-gradient(ellipse at 50% 78%,rgba(16,34,52,.9) 0%,rgba(7,16,28,.95) 52%,rgba(2,5,10,.98) 100%)", D - 60);
            // 留白雾带：横向淡墨气韵缓慢漂移（水墨画的呼吸感）
            for (var m = 0; m < 3; m++) {
                (function (layer, idx) {
                    var mist = document.createElement("div");
                    mist.style.cssText = "position:absolute;left:-20%;width:140%;top:" + (26 + idx * 17) + "%;height:" + (9 + idx * 4) + "vh;opacity:0;mix-blend-mode:screen;background:linear-gradient(90deg,transparent 0%,rgba(150,185,205,.13) 18%,rgba(190,220,235,.18) 50%,rgba(150,185,205,.13) 82%,transparent 100%);filter:blur(" + (10 + idx * 6) + "px);";
                    layer.appendChild(mist);
                    setTimeout(function () {
                        mist.animate([
                            { opacity: 0, transform: "translateX(" + (idx % 2 ? 6 : -6) + "%)" },
                            { opacity: .8, transform: "translateX(" + (idx % 2 ? -2 : 2) + "%)", offset: .5 },
                            { opacity: 0, transform: "translateX(" + (idx % 2 ? -8 : 8) + "%)" }
                        ], { duration: 3400 + idx * 400, easing: "ease-in-out", fill: "forwards" });
                    }, 120 + idx * 260);
                })(layer, m);
            }
            // 墨浪笔意路径：连绵弧线（逆笔勾勒，非锯齿泡沫）
            function ink(seed) {
                var pts = [], n = 30;
                for (var i = 0; i <= n; i++) {
                    var x = (i / n) * 100;
                    var y = 15
                        + Math.sin(i * 0.85 + seed) * 5
                        + Math.sin(i * 2.15 + seed * 1.6) * 3
                        + Math.sin(i * 0.32 + seed * 0.6) * 4.5;
                    pts.push(x.toFixed(2) + "% " + Math.max(2.5, y).toFixed(2) + "%");
                }
                pts.push("100% 100%", "0% 100%");
                return "polygon(" + pts.join(",") + ")";
            }
            // 三叠墨浪：焦墨先行 → 重墨主体 → 淡墨罩染，浪脊一线冰蓝、枯笔飞白
            var tides = [
                { fill: "rgba(9,20,36,.82)", rim: "rgba(126,178,205,.55)", h: 84, delay: 0, rise: 3000, sway: 2.6, z: 1 },
                { fill: "rgba(20,44,70,.6)", rim: "rgba(158,210,235,.6)", h: 76, delay: 400, rise: 2800, sway: -3.6, z: 2 },
                { fill: "rgba(46,92,126,.34)", rim: "rgba(196,236,252,.7)", h: 66, delay: 800, rise: 2600, sway: 4.6, z: 3 }
            ];
            for (var i = 0; i < 3; i++) {
                (function (layer, idx, conf) {
                    var wrap = document.createElement("div");
                    wrap.style.cssText = "position:absolute;left:-16%;width:132%;height:" + conf.h + "vh;bottom:-" + (conf.h + 14) + "vh;opacity:0;will-change:transform,opacity;z-index:" + (10 + conf.z) + ";";
                    var body = document.createElement("div");
                    var clip = ink(idx * 2.2 + 0.4);
                    // 墨分五色：浪脊淡 → 浪心重 → 浪底近焦墨
                    body.style.cssText = "position:absolute;inset:0;background:linear-gradient(180deg," + conf.rim + " 0%,rgba(70,112,142,.32) 9%,rgba(30,58,88,.5) 26%," + conf.fill + " 55%,rgba(5,12,24,.28) 100%);clip-path:" + clip + ";-webkit-clip-path:" + clip + ";";
                    wrap.appendChild(body);
                    // 干笔飞白：浪脊处的枯笔丝络
                    var dry = document.createElement("div");
                    dry.style.cssText = "position:absolute;left:0;right:0;top:0;height:16%;opacity:.5;mix-blend-mode:screen;background:repeating-linear-gradient(93deg,transparent 0 3px," + conf.rim + " 3px 4px,transparent 4px 11px);clip-path:" + clip + ";-webkit-clip-path:" + clip + ";filter:blur(.7px);";
                    wrap.appendChild(dry);
                    // 浪脊冰蓝一线：仅一笔提亮，不铺白沫
                    var ridge = document.createElement("div");
                    ridge.style.cssText = "position:absolute;left:0;right:0;top:0;height:2.4%;opacity:.9;background:linear-gradient(90deg,transparent 0%," + conf.rim + " 22%,rgba(214,242,253,.85) 50%," + conf.rim + " 78%,transparent 100%);clip-path:" + clip + ";-webkit-clip-path:" + clip + ";filter:blur(1px);mix-blend-mode:screen;";
                    wrap.appendChild(ridge);
                    layer.appendChild(wrap);
                    // 上行笔势：自画底逆势而上，行至中途力竭淡出（逆流之意）
                    setTimeout(function () {
                        var riseY = -(conf.h + 52);
                        wrap.animate([
                            { opacity: 0, transform: "translateY(0) translateX(0) scaleY(.92)" },
                            { opacity: .6, transform: "translateY(" + (riseY * 0.3) + "vh) translateX(" + (conf.sway * 0.4) + "%) scaleY(.97)", offset: .22 },
                            { opacity: 1, transform: "translateY(" + (riseY * 0.62) + "vh) translateX(" + (-conf.sway * 0.5) + "%) scaleY(1)", offset: .5 },
                            { opacity: .72, transform: "translateY(" + (riseY + 6) + "vh) translateX(" + (conf.sway * 0.3) + "%) scaleY(1.01)", offset: .8 },
                            { opacity: 0, transform: "translateY(" + (riseY - 14) + "vh) translateX(0) scaleY(.96)" }
                        ], { duration: conf.rise + 500, easing: "cubic-bezier(.3,.55,.3,1)", fill: "forwards" });
                    }, conf.delay);
                })(layer, i, tides[i]);
            }
            // 远山淡影：两抹远墨，拉开留白纵深
            for (var fw = 0; fw < 2; fw++) {
                (function (layer, idx) {
                    var far = document.createElement("div");
                    var fc = ink(6.6 + idx * 3.4);
                    far.style.cssText = "position:absolute;left:-14%;width:128%;height:12vh;top:" + (36 + idx * 9) + "%;opacity:0;background:linear-gradient(180deg,rgba(120,168,196,.26) 0%,rgba(30,60,90,.2) 60%,transparent 100%);clip-path:" + fc + ";-webkit-clip-path:" + fc + ";filter:blur(" + (3 + idx * 2) + "px);z-index:" + (7 - idx) + ";";
                    layer.appendChild(far);
                    setTimeout(function () {
                        far.animate([
                            { opacity: 0, transform: "translateY(3vh)" },
                            { opacity: .75, transform: "translateY(0)", offset: .35 },
                            { opacity: .45, transform: "translateY(-1.5vh)", offset: .75 },
                            { opacity: 0, transform: "translateY(-4vh)" }
                        ], { duration: 3000 - idx * 350, easing: "ease-in-out", fill: "forwards" });
                    }, 240 + idx * 300);
                })(layer, fw);
            }
            // 体积光：三束清冷天光斜穿墨浪，透纸而过
            for (var gr = 0; gr < 3; gr++) {
                (function (layer, idx) {
                    var ray = document.createElement("div");
                    ray.style.cssText = "position:absolute;top:-12%;left:" + (16 + idx * 28 + Math.random() * 6) + "%;width:" + (6 + idx * 2) + "vw;height:132%;opacity:0;background:linear-gradient(180deg,rgba(198,232,250,.34) 0%,rgba(150,206,236,.14) 48%,transparent 86%);transform:skewX(" + (-16 + idx * 10) + "deg);filter:blur(9px);mix-blend-mode:screen;pointer-events:none;";
                    layer.appendChild(ray);
                    setTimeout(function () {
                        ray.animate([
                            { opacity: 0 },
                            { opacity: .5, offset: .35 },
                            { opacity: .28, offset: .72 },
                            { opacity: 0 }
                        ], { duration: 2800 + idx * 300, easing: "ease-in-out", fill: "forwards" });
                    }, 320 + idx * 200);
                })(layer, gr);
            }
            // 冰蓝能量环：主环绽开 + 刻度法环逆转（护身印法阵之意）
            var ring = document.createElement("div");
            ring.style.cssText = "position:absolute;left:50%;top:52%;width:88vmin;height:88vmin;margin:-44vmin 0 0 -44vmin;opacity:0;border-radius:50%;border:2px solid rgba(158,226,252,.8);box-shadow:0 0 34px rgba(120,200,245,.55),inset 0 0 26px rgba(120,200,245,.3);";
            layer.appendChild(ring);
            setTimeout(function () {
                ring.animate([
                    { opacity: 0, transform: "scale(.28)" },
                    { opacity: .85, transform: "scale(1)", offset: .45 },
                    { opacity: .5, transform: "scale(1.18)", offset: .8 },
                    { opacity: 0, transform: "scale(1.42)" }
                ], { duration: 1900, easing: "cubic-bezier(.2,.6,.3,1)", fill: "forwards" });
            }, 1450);
            var dashring = document.createElement("div");
            dashring.style.cssText = "position:absolute;left:50%;top:52%;width:104vmin;height:104vmin;margin:-52vmin 0 0 -52vmin;opacity:0;border-radius:50%;background:conic-gradient(rgba(168,232,255,.85) 0deg 5deg,transparent 5deg 24deg,rgba(140,214,248,.5) 24deg 29deg,transparent 29deg 58deg,rgba(190,240,255,.7) 58deg 62deg,transparent 62deg 360deg);-webkit-mask-image:radial-gradient(circle,transparent 47.6%,#000 48%,#000 49.2%,transparent 49.6%);mask-image:radial-gradient(circle,transparent 47.6%,#000 48%,#000 49.2%,transparent 49.6%);filter:blur(.4px);";
            layer.appendChild(dashring);
            setTimeout(function () {
                dashring.animate([
                    { opacity: 0, transform: "rotate(24deg) scale(.5)" },
                    { opacity: .8, transform: "rotate(-96deg) scale(1)", offset: .5 },
                    { opacity: 0, transform: "rotate(-210deg) scale(1.22)" }
                ], { duration: 2100, easing: "ease-out", fill: "forwards" });
            }, 1350);
            // 雷光折线生成（确定性正弦抖动，clip-path 多边形雷道）
            function bolt(seed, w) {
                var n = 8, xs = [], pts = [];
                for (var i = 0; i <= n; i++) {
                    xs.push(50 + Math.sin(seed * 3.3 + i * 1.42) * 10 + Math.sin(seed * 8.1 + i * 2.7) * 5.5 + (i % 3 === 0 ? 5 : 0) - (i % 4 === 0 ? 4 : 0));
                }
                for (var a = 0; a <= n; a++) pts.push((xs[a] - w).toFixed(2) + "% " + (a / n * 100).toFixed(2) + "%");
                for (var b = n; b >= 0; b--) pts.push((xs[b] + w).toFixed(2) + "% " + (b / n * 100).toFixed(2) + "%");
                return "polygon(" + pts.join(",") + ")";
            }
            function strike(delay, seed, leftPct, heightVh, dur) {
                var cp1 = bolt(seed, 1.1);
                var main = document.createElement("div");
                main.style.cssText = "position:absolute;left:" + leftPct + "%;top:-4%;width:26vmin;height:" + heightVh + "vh;opacity:0;background:linear-gradient(180deg,rgba(226,246,255,.98) 0%,rgba(168,228,252,.8) 34%,rgba(120,200,245,.42) 72%,transparent 100%);clip-path:" + cp1 + ";-webkit-clip-path:" + cp1 + ";filter:drop-shadow(0 0 16px rgba(150,225,255,.9));mix-blend-mode:screen;z-index:30;";
                layer.appendChild(main);
                var cp2 = bolt(seed * 1.7 + 2, 1.5);
                var sub = document.createElement("div");
                sub.style.cssText = "position:absolute;left:" + (leftPct + 3) + "%;top:" + Math.round(heightVh * 0.24) + "%;width:14vmin;height:" + Math.round(heightVh * 0.5) + "vh;opacity:0;background:linear-gradient(180deg,rgba(210,242,255,.9) 0%,rgba(150,220,248,.5) 60%,transparent 100%);clip-path:" + cp2 + ";-webkit-clip-path:" + cp2 + ";filter:drop-shadow(0 0 10px rgba(140,220,250,.8));mix-blend-mode:screen;z-index:30;";
                layer.appendChild(sub);
                setTimeout(function () {
                    main.animate([
                        { opacity: 0 }, { opacity: 1, offset: .08 }, { opacity: .15, offset: .18 }, { opacity: .95, offset: .3 },
                        { opacity: .3, offset: .55 }, { opacity: .7, offset: .7 }, { opacity: 0 }
                    ], { duration: dur, easing: "linear", fill: "forwards" });
                    sub.animate([
                        { opacity: 0 }, { opacity: .9, offset: .12 }, { opacity: .1, offset: .3 }, { opacity: .6, offset: .5 }, { opacity: 0 }
                    ], { duration: dur, easing: "linear", fill: "forwards" });
                }, delay);
            }
            strike(2650, 3.7, 37, 74, 760);
            strike(3120, 6.9, 55, 62, 520);
            // 雷起墨溅：闪电落下时墨点逆势上抛（笔锋弹墨）+ 枯笔横扫一笔
            setTimeout(function () {
                for (var dj = 0; dj < 15; dj++) {
                    (function (layer, k) {
                        var d = document.createElement("div");
                        var dz = 2 + Math.random() * 5;
                        var inkDrop = k % 3 === 0;
                        var ang = -78 + k * 11 + (Math.random() * 8 - 4);
                        var dist = 40 + Math.random() * 110;
                        d.style.cssText = "position:absolute;left:" + (12 + Math.random() * 76) + "%;top:46%;width:" + dz + "px;height:" + dz + "px;border-radius:50%;background:" + (inkDrop ? "rgba(14,30,48,.9)" : "rgba(178,230,252,.95)") + ";opacity:0;" + (inkDrop ? "" : "box-shadow:0 0 8px rgba(150,222,250,.95);");
                        layer.appendChild(d);
                        var rad = (ang * Math.PI) / 180;
                        d.animate([
                            { opacity: 0, transform: "translate(0,0) scale(1)" },
                            { opacity: .9, offset: .16 },
                            { opacity: 0, transform: "translate(" + (Math.cos(rad) * dist).toFixed(1) + "px," + (Math.sin(rad) * dist).toFixed(1) + "px) scale(.3)" }
                        ], { duration: 640 + Math.random() * 420, easing: "cubic-bezier(.15,.6,.4,1)", fill: "forwards" });
                    })(layer, dj);
                }
                var stroke = document.createElement("div");
                stroke.style.cssText = "position:absolute;left:-10%;width:120%;top:46%;height:2px;opacity:0;background:linear-gradient(90deg,transparent 0%,rgba(150,196,222,.4) 20%,rgba(226,246,255,.85) 50%,rgba(150,196,222,.4) 80%,transparent 100%);filter:blur(1.6px);mix-blend-mode:screen;";
                layer.appendChild(stroke);
                stroke.animate([
                    { opacity: 0, transform: "scaleX(.12)" },
                    { opacity: .8, transform: "scaleX(1)", offset: .3 },
                    { opacity: 0, transform: "scaleX(1.2)" }
                ], { duration: 700, easing: "ease-out", fill: "forwards" });
            }, 2650);
            // 飞白升腾：细墨丝自底逆上（气韵生动）
            for (var fs = 0; fs < 8; fs++) {
                (function (layer) {
                    var s = document.createElement("div");
                    var sw = 1 + Math.random() * 2;
                    s.style.cssText = "position:absolute;left:" + (6 + Math.random() * 88) + "%;bottom:-4%;width:" + sw + "px;height:" + (10 + Math.random() * 16) + "vh;opacity:0;background:linear-gradient(180deg,rgba(178,222,246,.55) 0%,transparent 100%);filter:blur(.8px);";
                    layer.appendChild(s);
                    setTimeout(function () {
                        s.animate([
                            { opacity: 0, transform: "translateY(0)" },
                            { opacity: .6, offset: .3 },
                            { opacity: 0, transform: "translateY(-" + (46 + Math.random() * 30) + "vh)" }
                        ], { duration: 2300 + Math.random() * 1200, easing: "ease-out", fill: "forwards" });
                    }, 500 + Math.random() * 1500);
                })(layer, fs);
            }
            // 退墨湿痕：墨浪退去后纸上余渍缓缓下沉
            var wash = document.createElement("div");
            wash.style.cssText = "position:absolute;left:-8%;width:116%;top:0;height:96%;opacity:0;mix-blend-mode:screen;background-image:repeating-linear-gradient(90deg,rgba(140,190,220,.14) 0 2px,transparent 2px 19px),linear-gradient(180deg,rgba(170,214,240,.22) 0%,rgba(110,170,205,.08) 40%,transparent 82%);-webkit-mask-image:radial-gradient(ellipse at 50% 30%,rgba(0,0,0,.9) 0%,transparent 74%);mask-image:radial-gradient(ellipse at 50% 30%,rgba(0,0,0,.9) 0%,transparent 74%);filter:blur(2px);";
            layer.appendChild(wash);
            setTimeout(function () {
                wash.animate([
                    { opacity: 0, transform: "translateY(-5vh) scaleY(1.05)" },
                    { opacity: .6, transform: "translateY(2vh) scaleY(1)", offset: .32 },
                    { opacity: .22, transform: "translateY(14vh) scaleY(.93)", offset: .74 },
                    { opacity: 0, transform: "translateY(26vh) scaleY(.86)" }
                ], { duration: 1500, easing: "cubic-bezier(.4,0,.5,1)", fill: "forwards" });
            }, 2850);
            // 雷光对应的两闪与震波
            this._flash(layer, "rgba(178,228,252,.3)", 2680, 300);
            this._flash(layer, "rgba(210,244,255,.24)", 3120, 220);
            this._shock(layer, 2700, "rgba(150,225,255,.85)");
            // 「逆流河」——墨字如印，随墨浪托出
            var box = document.createElement("div");
            box.className = "csh_ssfx_dtext";
            box.style.cssText = "font-size:15.5vmin;font-family:'ZMX3','LC','LongCang','STXingkai','KaiTi',serif;font-weight:800;top:50%;letter-spacing:.04em;";
            box.innerHTML = '<div class="csh_ssfx_dstack"><div class="csh_ssfx_dglow" style="color:#bfe6f8;-webkit-text-stroke:4px #08131f;text-shadow:0 0 22px rgba(120,200,240,.85),0 0 54px rgba(70,150,210,.7),0 7px 16px rgba(0,0,0,.95);">逆流河</div><div class="csh_ssfx_dfill" style="background-image:linear-gradient(180deg,#f6fcff 0%,#cfeaf8 34%,#6fb4d8 66%,#1d4a6b 100%);">逆流河</div></div>';
            layer.appendChild(box);
            setTimeout(function () {
                box.animate([
                    { opacity: 0, transform: "translate(-50%,-50%) skewX(-8deg) translateY(34vmin) scale(0.45)", filter: "blur(16px)" },
                    { opacity: 1, transform: "translate(-50%,-50%) skewX(-8deg) translateY(-2vmin) scale(1.06)", filter: "blur(0)", offset: 0.55 },
                    { opacity: 1, transform: "translate(-50%,-50%) skewX(-8deg) translateY(0) scale(1)", offset: 0.78 },
                    { opacity: 1, transform: "translate(-50%,-50%) skewX(-8deg) translateY(0) scale(1)" }
                ], { duration: 900, easing: "cubic-bezier(.18,.85,.3,1)", fill: "forwards" });
            }, 1500);
            setTimeout(function () {
                box.animate([
                    { opacity: 1, transform: "translate(-50%,-50%) skewX(-8deg) scale(1)" },
                    { opacity: 0, transform: "translate(-50%,-50%) skewX(-8deg) scale(1.35)", filter: "blur(8px)" }
                ], { duration: 500, easing: "ease-in", fill: "forwards" });
            }, D - 600);
            this._shake(2);
            setTimeout(function () { layer.remove(); }, D);
        },
        // 方源归来（3s档）—— 命海破晓：寒风褪去、金光柱升起、浪花向两侧分开、「方源归来」逐字砸出
        // 定场诗：春秋蝉鸣少年归 / 仙尊悔而我不悔 —— 归来与坚持
        
        /* ============ 技能横幅视频（全屏演出）============
         * 文鸯却敌 / 钟会排异 / 谋谋黄忠烈弓 / 贾诩乱武 共用这一条管线。
         *
         * 历史：_quediVideo 与 _paiyiVideo 曾是两份 60 行的复制粘贴，加第三、四条时
         * 必然继续复制——这里收敛成「一个通用播放器 + 若干一行包装」。
         * 新加横幅：把 MP4 放进 effect/，在 _dur 里登记时长，再加一行包装函数即可。
         *
         * 联机：调用点在技能侧，走 game.broadcastAll + game.pause/resume 等放完再结算
         * （见 skills/index.js 的 csh_xinpaiyi / csh_lieqiong 等）。
         */
        _bannerVideo: function (opts, onDone) {
            var o = opts || {};
            var D = (this._dur && o.durKey && this._dur[o.durKey]) || o.fallbackDur || 3000;
            try {
                var layer = this._layer();
                this._bg(layer, "radial-gradient(ellipse at 50% 50%,rgba(8,18,32,.18) 0%,rgba(3,8,16,.28) 100%)", Math.min(D, 1200));
                // 懒人包视口较矮：加高横幅 + contain 完整显示，避免 cover 裁切
                var wrap = document.createElement("div");
                wrap.className = "csh-niliu-banner " + (o.wrapClass || "");
                wrap.style.cssText = [
                    "position:absolute","left:4%","right:4%","top:50%","transform:translateY(-50%)",
                    "width:92%","aspect-ratio:16/7","max-height:58vh","z-index:20",
                    "overflow:hidden","background:transparent","pointer-events:none"
                ].join(";") + ";";
                var vbox = document.createElement("div");
                vbox.style.cssText = [
                    "position:absolute","inset:0","overflow:hidden","z-index:2"
                ].join(";") + ";";
                var video = document.createElement("video");
                var base = (typeof lib !== "undefined" && lib.assetURL) ? lib.assetURL : "";
                video.src = base + "extension/池子魔将/effect/" + o.file;
                video.muted = true;
                video.defaultMuted = true;
                video.autoplay = true;
                video.playsInline = true;
                video.controls = false;
                video.loop = false;
                video.preload = "auto";
                try { video.disablePictureInPicture = true; } catch (e0) {}
                video.setAttribute("muted", "");
                video.setAttribute("autoplay", "");
                video.setAttribute("playsinline", "");
                video.className = "csh-niliu-banner";
                // 完整显示、不裁切；透明底避免额外黑边。
                // 初始铺满 + contain 作兜底，_feather 拿到元数据后会改成真实画面尺寸并挂四边羽化。
                video.style.cssText = "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:100%;height:100%;object-fit:contain;object-position:center;opacity:0;transition:opacity .25s ease;background:transparent;";
                // 羽化 v2：横向 13% / 纵向 18%（顶部）·21.6%（底部）+ 径向暗角，力度比旧版 5/8 明显加强
                this._feather(video, vbox, 13, 18);
                var finish = function () {
                    try { layer.remove(); } catch (e1) {}
                    if (typeof onDone === "function") onDone();
                };
                video.addEventListener("playing", this._reveal(video, o.revealDur || D / 1000));
                video.addEventListener("ended", finish);
                video.addEventListener("error", finish);
                vbox.appendChild(video);
                wrap.appendChild(vbox);
                layer.appendChild(wrap);
                try { video.load(); } catch (e2) {}
                var p = video.play();
                if (p && typeof p.then === "function") {
                    p.catch(function () {
                        video.muted = true;
                        var p2 = video.play();
                        if (p2 && typeof p2.then === "function") p2.catch(finish);
                    });
                }
                setTimeout(finish, D + 400);
            } catch (e) {
                if (typeof onDone === "function") onDone();
            }
        },

        // 文鸯·却敌：69 帧 / 2.300s（源片尾帧是硬切黑帧，已裁掉，见 tools/check_blackframe.py）
        _quediVideo: function (onDone) {
            this._bannerVideo({
                file: "csh_wenyang_quedi_banner.mp4", durKey: "quedi",
                fallbackDur: 2800, revealDur: 2.3, wrapClass: "csh-quedi-banner"
            }, onDone);
        },

        // 钟会·排异：91 帧 / 3.033s（裁掉头 0~15 与尾 107~112 的静止段）
        _paiyiVideo: function (onDone) {
            this._bannerVideo({
                file: "csh_zhonghui_paiyi_banner.mp4", durKey: "paiyi",
                fallbackDur: 3100, revealDur: 3.03, wrapClass: "csh-paiyi-banner"
            }, onDone);
        },

        // 谋谋黄忠·烈弓：90 帧 / 3.000s（完整动作循环）
        _liegongVideo: function (onDone) {
            this._bannerVideo({
                file: "csh_mmhz_liegong_banner.mp4", durKey: "liegong",
                fallbackDur: 3000, revealDur: 3.0, wrapClass: "csh-liegong-banner"
            }, onDone);
        },

        // 贾诩·乱武：111 帧 / 3.700s（完整动作循环）
        _luanwuVideo: function (onDone) {
            this._bannerVideo({
                file: "csh_qw_luanwu_banner.mp4", durKey: "luanwu",
                fallbackDur: 3700, revealDur: 3.7, wrapClass: "csh-luanwu-banner"
            }, onDone);
        },

        // 诸葛恪·黩武：60 帧 / 2.000s（Spine 11803_2 GongJi 渲染，1158x576 与既有横幅同规格）
        _duwuVideo: function (onDone) {
            this._bannerVideo({
                file: "csh_zhugeke_duwu_banner.mp4", durKey: "duwu",
                fallbackDur: 2000, revealDur: 2.0, wrapClass: "csh-duwu-banner"
            }, onDone);
        },

        // 界界徐盛·破军：Spine 15803_1 GongJi 骨骼动作渲染（角色+自身BeiJing背景），1158x576 / 2.000s / 30fps，与黩武同规格
        _pojunVideo: function (onDone) {
            this._bannerVideo({
                file: "csh_jjxs_pojun_banner.mp4", durKey: "pojun",
                fallbackDur: 2000, revealDur: 2.0, wrapClass: "csh-pojun-banner"
            }, onDone);
        },

        // 吕玲绮·焰女：源 GIF 438x316 原生分辨率/帧时长直转（60帧 1.80s），contain 展示
        _yannv1Video: function (onDone) {
            this._bannerVideo({
                file: "csh_lvlingqi_yannv_banner.mp4", durKey: "yannv1",
                fallbackDur: 1800, revealDur: 1.8, wrapClass: "csh-yannv1-banner"
            }, onDone);
        },

        _guilai: function () {
            var D = this._dur.guilai;
            var layer = this._layer();
            this._bg(layer, "linear-gradient(180deg,#04101f 0%,#0a2038 42%,#123a52 74%,#0a1a28 100%)", D - 100);
            var dawn = document.createElement("div");
            dawn.style.cssText = "position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at 50% 62%,rgba(255,226,150,.5) 0%,rgba(120,200,190,.24) 38%,transparent 72%);";
            layer.appendChild(dawn);
            setTimeout(function () {
                dawn.animate([{ opacity: 0 }, { opacity: 1, offset: .5 }, { opacity: .85 }], { duration: 1600, easing: "ease-out", fill: "forwards" });
            }, 300);
            // 金光柱自命海升起
            var pillar = document.createElement("div");
            pillar.style.cssText = "position:absolute;bottom:12%;left:50%;width:30vmin;height:0;margin-left:-15vmin;background:linear-gradient(180deg,rgba(255,240,190,0) 0%,rgba(255,235,170,.45) 55%,rgba(255,250,225,.95) 100%);filter:blur(4px);opacity:0;border-radius:40% 40% 0 0;";
            layer.appendChild(pillar);
            setTimeout(function () {
                pillar.animate([
                    { opacity: 0, height: "0vmin" },
                    { opacity: .95, height: "62vmin", offset: .5 },
                    { opacity: .5, height: "70vmin" }
                ], { duration: 1400, easing: "ease-out", fill: "forwards" });
            }, 180);
            // 浪花向两侧分开（自命海归来）
            for (var i = 0; i < 2; i++) {
                (function (layer, idx) {
                    var bar = document.createElement("div");
                    bar.style.cssText = "position:absolute;left:50%;top:56%;width:8vmin;height:5vmin;margin:-2.5vmin 0 0 -4vmin;opacity:0;border-radius:50%;background:linear-gradient(90deg,rgba(200,245,255,.65),rgba(255,240,200,.35));filter:blur(3px);";
                    layer.appendChild(bar);
                    setTimeout(function () {
                        bar.animate([
                            { opacity: 0, transform: "scaleX(.3)" },
                            { opacity: .95, transform: "scaleX(" + (idx ? 9 : -9) + ")", offset: .55 },
                            { opacity: 0, transform: "scaleX(" + (idx ? 14 : -14) + ")" }
                        ], { duration: 1200, easing: "ease-out", fill: "forwards" });
                    }, 680);
                })(layer, i);
            }
            this._focus(layer, 300, 1800, "rgba(255,240,190,.35)");
            this._particles(layer, 16, "#ffe9a8", "#2fae9f", 50, 58, 240, 1200);
            this._flash(layer, "#fff3d6", 850, 300);
            this._shock(layer, 900, "rgba(255,226,140,.95)");
            // 「方源归来」逐字砸出（金色，对齐光柱升起后的节奏）
            var chars = "方源归来";
            var csize = 11.5, cgap = 12.8;
            for (var k = 0; k < chars.length; k++) {
                (function (layer, ch, idx) {
                    var w = document.createElement("div");
                    w.style.cssText = "position:absolute;left:50%;top:50%;width:0;height:0;opacity:0;";
                    var st = document.createElement("div");
                    st.className = "csh_ssfx_dstack";
                    st.style.cssText = "position:absolute;left:" + ((idx - 1.5) * cgap - csize / 2) + "vmin;top:" + (-csize / 2) + "vmin;font-size:" + csize + "vmin;font-family:'ZMX3','LC','LongCang','STXingkai','KaiTi',serif;font-weight:400;white-space:nowrap;";
                    st.innerHTML = '<div class="csh_ssfx_dglow" style="color:#ffe9a8;-webkit-text-stroke:3px #3a2a00;text-shadow:0 0 24px rgba(255,215,110,.95),0 0 60px rgba(255,200,80,.85),0 7px 16px rgba(0,0,0,.95);">' + ch + '</div><div class="csh_ssfx_dfill" style="background-image:linear-gradient(180deg,#fffdf2 0%,#ffefb8 30%,#ffc233 62%,#b57a00 100%);">' + ch + '</div>';
                    w.appendChild(st);
                    layer.appendChild(w);
                    setTimeout(function () {
                        w.animate([
                            { opacity: 0, transform: "scale(2.2)", filter: "blur(8px)" },
                            { opacity: 1, transform: "scale(1)", filter: "blur(0)" }
                        ], { duration: 300, easing: "cubic-bezier(.15,1.2,.3,1)", fill: "forwards" });
                    }, 880 + idx * 300);
                    setTimeout(function () {
                        w.animate([
                            { opacity: 1, transform: "scale(1)" },
                            { opacity: 0, transform: "scale(1.28)", filter: "blur(6px)" }
                        ], { duration: 380, easing: "ease-in", fill: "forwards" });
                    }, D - 400);
                })(layer, chars[k], k);
            }
            this._shake(1);
            setTimeout(function () { layer.remove(); }, D);
        },
        // 逆流护体状态样式（逆流命海环+光尘+消耗标记特效），供护体挂载与 niluTick 共用
        _niliuCss: function () {
            if (document.getElementById("csh-nilu-style")) return;
            var st = document.createElement("style");
            st.id = "csh-nilu-style";
            st.textContent = [
                ".csh-nilu-shield{position:relative !important;}",
                ".csh-nilu-shield::after{content:'';position:absolute;left:-4px;top:-4px;right:-4px;bottom:-4px;border-radius:12px;pointer-events:none;z-index:25;background:linear-gradient(160deg,rgba(30,95,175,.34) 0%,rgba(90,205,255,.16) 100%);border:2px solid rgba(115,215,255,.78);box-shadow:0 0 22px rgba(70,180,255,.8),inset 0 0 26px rgba(60,160,255,.5),0 0 46px rgba(35,110,210,.45);animation:cshNiluBreathe 2.4s ease-in-out infinite;}",
                "@keyframes cshNiluBreathe{0%,100%{opacity:.6;transform:scale(1)}50%{opacity:1;transform:scale(1.02)}}",
                ".csh-nilu-shield::before{content:'';position:absolute;left:-8px;top:-8px;right:-8px;bottom:-8px;border-radius:14px;pointer-events:none;z-index:24;padding:3px;background:conic-gradient(from 0deg,transparent 0deg,rgba(140,235,255,.85) 18deg,transparent 50deg,transparent 170deg,rgba(205,245,255,.6) 200deg,transparent 240deg);-webkit-mask:linear-gradient(#000,#000) content-box,linear-gradient(#000,#000);-webkit-mask-composite:xor;mask:linear-gradient(#000,#000) content-box,linear-gradient(#000,#000);mask-composite:exclude;animation:cshNiluSpin 4.5s linear infinite reverse;}",
                "@keyframes cshNiluSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}",
                ".csh-nilu-dust{position:absolute;inset:0;pointer-events:none;z-index:26;overflow:visible;}",
                ".csh-nilu-dust-p{position:absolute;bottom:2%;border-radius:50%;opacity:0;background:radial-gradient(rgba(225,248,255,.95),rgba(120,210,255,.25));box-shadow:0 0 7px rgba(140,225,255,.85);animation:cshNiluDust linear infinite;}",
                "@keyframes cshNiluDust{0%{opacity:0;transform:translateY(0) scale(1);}18%{opacity:.9;}55%{opacity:.5;}100%{opacity:0;transform:translateY(-9vmin) scale(.45);}}",
                ".csh-nilu-tick{position:absolute;inset:0;pointer-events:none;z-index:28;overflow:visible;}",
                ".csh-nilu-tick-ring{position:absolute;left:50%;bottom:-4%;width:9vmin;height:9vmin;margin-left:-4.5vmin;border:2px solid rgba(120,225,255,.9);border-radius:50%;opacity:0;animation:cshNiluTickRing .95s cubic-bezier(.15,.7,.3,1) forwards;}",
                "@keyframes cshNiluTickRing{0%{opacity:.95;transform:translateY(0) scale(.3);}100%{opacity:0;transform:translateY(-15vmin) scale(1.6);}}",
                ".csh-nilu-tick-glow{position:absolute;inset:-4px;border-radius:12px;opacity:0;background:radial-gradient(ellipse at 50% 70%,rgba(255,225,140,.42),transparent 70%);animation:cshNiluTickGlow 1s ease-out forwards;}",
                "@keyframes cshNiluTickGlow{0%{opacity:0;}25%{opacity:.95;}100%{opacity:0;}}",
                ".csh-nilu-tick-p{position:absolute;bottom:8%;width:5px;height:5px;border-radius:50%;background:radial-gradient(#fff6d8,#ffc233);box-shadow:0 0 9px rgba(255,205,90,.95);opacity:0;animation:cshNiluTickP 1.05s ease-out forwards;}",
                "@keyframes cshNiluTickP{0%{opacity:0;transform:translateY(0);}22%{opacity:1;}100%{opacity:0;transform:translateY(-10vmin);}}",
            ].join("");
            document.head.appendChild(st);
        },
        // 消耗『逆』标记（跳过回合）：头像处逆流波纹上涌+金色回血光效
        niluTick: function (player) {
            try {
                if (!player || !player.appendChild) return;
                this._niliuCss();
                var w = document.createElement("div");
                w.className = "csh-nilu-tick";
                var ring = document.createElement("div");
                ring.className = "csh-nilu-tick-ring";
                w.appendChild(ring);
                var glow = document.createElement("div");
                glow.className = "csh-nilu-tick-glow";
                w.appendChild(glow);
                for (var i = 0; i < 3; i++) {
                    var p = document.createElement("div");
                    p.className = "csh-nilu-tick-p";
                    p.style.left = (26 + i * 22 + Math.random() * 8) + "%";
                    p.style.animationDelay = (i * 0.12) + "s";
                    w.appendChild(p);
                }
                player.appendChild(w);
                setTimeout(function () { if (w.parentNode) w.remove(); }, 1200);
            } catch (e) { }
        },
    };
    // [Grok修改] 条件执行 rarity 添加，避免 lib.rank 不存在时报错
    if(lib.rank && lib.rank.rarity){
//精品
if(lib.rank.rarity.rare) lib.rank.rarity.rare.addArray(["csh_yuangubafei","csh_guanyinping","csh_ae","csh_misida","csh_wlk","csh_zhangbao","csh_zhuzhi","csh_handang","csh_lidian","csh_weizheng","csh_ngwt","csh_caiyan","csh_zhaoxiang","csh_lukang","csh_lifeng","csh_pingfan"]);
//史诗
if(lib.rank.rarity.epic) lib.rank.rarity.epic.addArray(["csh_xingganning","csh_moteng","csh_huangyueying","csh_shanyuezhiyin","csh_chengyu","csh_zhugeke","csh_mzj","csh_gaogan","csh_shamoke","csh_yujin","csh_zhangning","csh_dongzhuo","csh_mmhz","csh_simahui","csh_bzt","csh_dz","csh_jjxs","csh_ls","csh_mlb","csh_mlm","csh_qw","csh_sj","csh_sq","csh_vxs","csh_wy","csh_xuchu","csh_yy","csh_zhuran","csh_wenyang","csh_guansuo","csh_lvlingqi","csh_gy","csh_chengpu","csh_bfsm","csh_chendao","csh_jzh","csh_guohuai","csh_sx","csh_nailong_juexing","csh_gdsn","csh_jieluji","csh_lamosi","csh_zhouchu","csh_sunshangxiang","csh_diaochan","csh_huaman","csh_tongyuan"]);
//传说
if(lib.rank.rarity.legend) lib.rank.rarity.legend.addArray(["csh_mingrixiang","csh_liximing","csh_bin","csh_zywoo","csh_zhugeqing","csh_feibijiubi","csh_realityfanghao","csh_doudou","csh_xurong","csh_gjs","csh_msmy","csh_szc","csh_wn","csh_dengai","csh_caoang","csh_lr","csh_wolongzhuge","csh_zhonghui","csh_caochun","csh_youhabahe","csh_daaixianzun","csh_maochao","csh_xushu","csh_shenzhugeguo","csh_shencaozhi","csh_dabing","csh_zhangxingcai","csh_modekaisa","csh_donk","csh_yangjian","csh_sake","csh_kuisangti","csh_sailasi","csh_zuozhu","csh_karl"])
}

  

	if (config.disEnableCharacter) {
		// 联机安全：filter 函数可能被序列化发送到客户端，包装体内不引用闭包变量
		if (!lib._csh_characterDisabled) lib._csh_characterDisabled = lib.filter.characterDisabled;
		lib.filter.characterDisabled = function (i, libCharacter) {
			if (i && i.indexOf('csh_') != 0) {
				return true;
			}
			// 平凡之人：国战禁用；仅点将可用（禁随机将池/AI点将池）
			if (i === "csh_pingfan") {
				try {
					if (typeof get !== "undefined" && typeof get.mode === "function" && get.mode() === "guozhan") return true;
				} catch (e) {}
				try {
					if (typeof _status !== "undefined" && _status.event && _status.event.name === "chooseCharacter" && !_status.event.fixed && !_status.event.choosing) {
						// 保留点将：若为系统随机禁选则禁用——点将界面仍可通过全列表选取
					}
				} catch (e) {}
			}
			var orig = typeof lib._csh_characterDisabled == "function" ? lib._csh_characterDisabled : lib.filter.characterDisabled;
			return orig.apply(this, arguments);
		};
		if (lib.config && Array.isArray(lib.config.forbidai)) {
			lib.config.forbidai.add("csh_pingfan");
		} else if (lib.config) {
			lib.config.forbidai = ["csh_pingfan"];
		}
	}

	// 友哈巴赫：仅身份场可选（非身份场从选将界面/随机将池隐去）
	// 走引擎原生 lib.characterFilter（characterDisabled / characterDisabled2 / 选将界面三处均消费），
	// 不删 lib.character，联机下双端各自本地生效，不涉及网络同步字段
	(function () {
		try {
			if (typeof lib === "undefined") return;
			if (!lib.characterFilter) lib.characterFilter = {};
			var allowModes = ["identity", "identity_old", "identity2"];
			lib.characterFilter.csh_youhabahe = function (mode) {
				try {
					if (typeof mode === "undefined" || mode === null) {
						mode = (typeof get !== "undefined" && typeof get.mode === "function")
							? get.mode()
							: (typeof _status !== "undefined" ? _status.mode : null);
					}
					return allowModes.indexOf(mode) >= 0;
				} catch (e) {
					return true; // 无法判定模式时保守放行，避免误伤身份场
				}
			};
		} catch (e) {
			console.log("[池子魔将] 友哈巴赫模式限制注册失败", e);
		}
	})();




	// [平行时空] A方案·镜像注册本体武将：技能/图片/语音/介绍/稀有度全部引用本体，无需任何额外文件
		// 生成"csh_m_武将ID"镜像并归入"平行时空·上/下"（下=限定专属+乐+武+江山如画+魔/疑/慢）；对应本体武将包未开启时自动跳过并打印日志
		(function(){
		var MIRROR_LIST = [
			// —— 神将 ——
			"shen_jiangwei",  // 神姜维（限定专属）
			"shen_caopi",     // 神曹丕（OL专属）
			"shen_xunyu",     // 神荀彧（手杀）
			"shen_dengai",    // 神邓艾（限定专属）
			"shen_xuzhu",     // 神许褚（限定专属）
			"shen_zhangfei",  // 神张飞（限定专属）
			// —— 曹髦双版本 ——
			"mb_caomao",      // 曹髦（移动版）
			"caomao",         // 曹髦（限定专属）
			// —— 兵势篇·势 ——
			"pot_dongzhao",   // 势董昭
			"pot_yuji",       // 势于吉
			"pot_weiyan",     // 势魏延
			"pot_taishici",   // 势太史慈
			// —— 其余系列 ——
			"peixiu",         // 裴秀（移动版）
			"star_dongzhuo",  // 星董卓
			"wu_zhugeliang",  // 武诸葛亮
			"wu_huangfusong", // 武皇甫嵩
			"liuhui",         // 刘徽（限定专属）
			"zhouyi",         // 周夷（限定专属）
			"caojinyu",       // 曹金玉（限定专属）
			"yangbiao",       // 杨彪（移动版）
			"chenshi",        // 陈式（好果子神将）
			"sb_diaochan",    // 谋貂蝉（手杀）
			"sb_liubei",      // 谋刘备（手杀）
			"yue_caiwenji",   // 乐蔡琰
			"ol_sb_jiangwei", // 谋姜维（OL）
			// —— 第二批·神将追加 ——
			"shen_sunce",     // 神孙策（世积/手杀）
			"shen_guojia",    // 神郭嘉（世积）
			"shen_ganning",   // 神甘宁（extra）
			"shen_lusu",      // 神鲁肃（世积）
			"shen_pangtong",  // 神庞统（限定专属）
			// —— 第二批·谋攻篇追加 ——
			"sb_fazheng",     // 谋法正（手杀）
			"sb_caocao",      // 谋曹操（手杀）
			// —— 第二批·星火燎原追加 ——
			"star_zhangchunhua", // 星张春华
			"star_sunjian",   // 星孙坚
			"star_fazheng",   // 星法正
			// —— 第二批·兵势篇追加 ——
			"pot_zhouyu",     // 势周瑜
			"pot_xinxianying",// 势辛宪英
			// —— 第二批·乐系列追加 ——
			"yue_zhouyu",     // 乐周瑜
			"yue_daqiao",     // 乐大乔
			"yue_caozhi",     // 乐曹植
			// —— 第二批·移动版追加 ——
			"mb_simazhao",    // 司马昭（移动版）
			// —— 第三批·手杀/新杀系列 ——
			"sunsháo",        // 势孙韶（兵势篇）
			"sp_duyu",        // 杜预（手杀）
			"shen_taishici",  // 神太史慈（手杀）
			"shen_huatuo",    // 神华佗（手杀）
			"dc_sb_huanggai", // 谋黄盖（新杀）
			"sb_huanggai",    // 谋黄盖（手杀）
			"sb_yuanshao",    // 谋袁绍（手杀）
			"clan_zhonghui",  // 族钟会（族包）
			// —— 第三批·限定专属追加 ——
			"zhaozhi",        // 赵直（限定专属）
			"re_sunyi",       // 孙翊（限定专属）
			// —— 第三批·魔将系列 ——
			"sxrm_caocao",    // 魔曹操（手杀同人）
			"sxrm_guanyu",    // 魔关羽（手杀同人）
			"sxrm_zhouyu",    // 魔周瑜（手杀同人）
			// —— 第三批·江山如画追加 ——
			"jsrg_liubei",    // 起刘备（江山如画）
			"jsrg_zhangju",   // 衰张举（江山如画）
			"jsrg_wenyang",   // 兴文鸯（江山如画）
			// —— 第四批·手杀系列 ——
			"mb_shen_jiangwei", // 手杀神姜维（世积）
			"liuyan",           // 手杀刘焉（SP）
			"guoyuan",          // 手杀势国渊（兵势篇）
			"cy_lingju",        // 手杀灵雎（old_mobile）
			// —— 第五批·界限突破系列 ——
			"re_xiahoudun",     // 界夏侯惇（界限突破）
			// —— 第六批·手杀克隆系列 ——
			"shichangshi",       // 十常侍（手杀）
			"xizhicai",          // 戏志才（SP）
			"sb_caopi",          // 谋曹丕（手杀谋攻篇）
			"zhanglu",           // 张鲁（SP）
			"mb_zhangfen",       // 张奋（手杀）
			"yanghuiyu",         // 羊徽瑜（手杀）
			"sp_caosong",        // 曹嵩（手杀）
			"fuqian",            // 傅佥（手杀）
			"yanxiang",          // 阎象（手杀/SP）
			"sp_yanxiang",       // 阎象（SP备选ID）
			"zhugejing",         // 诸葛京
			"mb_sp_guanqiujian", // 玄毌丘俭（手杀）
			// —— 第七批·限定/星火/OL系列 ——
			"sxrm_huatuo",      // 疑华佗（限定·星火燎原）
			"sxrm_xunyu",       // 疑荀彧（限定·星火燎原）
			"yanghong",         // 杨弘（限定·手杀）
			"ol_guanhai",       // OL管亥（SP）
			"sxrm_luxun",       // 慢陆逊（限定·星火燎原）
			"dc_sunhuan",       // 孙桓（兵临城下·逆击）
			"ol_puyuan",        // OL蒲元
			"tw_wenyang",       // 手杀文鸯（同人/手杀）
			"mb_wenyang",       // 手杀文鸯（移动备选）
			"puyuan",           // 蒲元（本体备选）
		];
		if(!MIRROR_LIST.length) return;
		// 默认关闭平行时空：扩展设置「启用平行时空武将」为关时不注册镜像
		try {
			if (!(lib.config && lib.config["extension_池子魔将_csh_enable_pingxing"])) {
				return;
			}
		} catch (ePx) {
			console.warn("[池子魔将] 平行时空配置读取失败，镜像武将未注册", ePx);
			return;
		}
		var packName = "池子魔将";
		// 武将包由引擎按 mode_extension_扩展名 自动注册，勿在 content 里 delete/改写 characterPack 或 config.characters
		// （此前去重逻辑会导致包从列表消失，已移除）
		// 平行时空拆成上/下：上=非限定，下=限定专属
		var LIMITED_ORIG = {
			// 原限定专属（仍归「下」，阴间单独列出）
			caomao:1, liuhui:1, zhouyi:1,
			zhaozhi:1, re_sunyi:1,
			yanghong:1,
			// 乐（群英荟萃）
			yue_zhouyu:1, yue_daqiao:1,
			// 乐蔡琰/乐曹植/武皇甫嵩 → 阴间（见 YINJIAN_ORIG）
			// 江山如画
			jsrg_liubei:1, jsrg_zhangju:1, jsrg_wenyang:1,
			// 魔将里非阴间的（魔曹操/魔周瑜回「下」）
			sxrm_huatuo:1, sxrm_xunyu:1, sxrm_luxun:1, sxrm_caocao:1, sxrm_zhouyu:1
		};
		// 阴间：过强/常用禁用名单（从「下」拆出）
		var YINJIAN_ORIG = {
			yue_caiwenji:1, yue_caozhi:1, wu_huangfusong:1,
			shen_jiangwei:1, shen_dengai:1, shen_xuzhu:1, shen_zhangfei:1,
			caojinyu:1, shen_pangtong:1, wu_zhugeliang:1,
			sxrm_guanyu:1
		};
		var _cshIsPingxingYinjian = function(orig){
			if(YINJIAN_ORIG[orig]) return true;
			return false;
		};
		// 前缀兜底：乐/江山如画/部分sxrm 进「下」；阴间优先
		var _cshIsPingxingXia = function(orig){
			if(_cshIsPingxingYinjian(orig)) return false;
			if(LIMITED_ORIG[orig]) return true;
			if(orig.indexOf("yue_")==0 || orig.indexOf("jsrg_")==0) return true;
			if(orig.indexOf("sxrm_")==0 && !YINJIAN_ORIG[orig]) return true;
			if(orig.indexOf("wu_")==0 && !YINJIAN_ORIG[orig]) return true;
			return false;
		};
		// 不直接创建 lib.characterPack[packName]——提前写入会触发 Proxy 微任务，
		// 导致联机时 connectCharacterPack 被重复注册（Proxy 的 .add() + loadCharacter 的 .push()）。
		// 改为将镜像武将写入 pack.character.character，由 loadCharacter 统一注册。
		var charObj = (pack && pack.character && pack.character.character) ? pack.character.character : {};
		var sortShang = null, sortXia = null, sortYinjian = null;
		if(pack && pack.character && pack.character.characterSort && (pack.character.characterSort["mode_extension_"+packName]||pack.character.characterSort[packName])){
			sortShang = (pack.character.characterSort["mode_extension_"+packName]||pack.character.characterSort[packName])["csh_pingxing_shang"] || null;
			sortXia = (pack.character.characterSort["mode_extension_"+packName]||pack.character.characterSort[packName])["csh_pingxing_xia"] || null;
			sortYinjian = (pack.character.characterSort["mode_extension_"+packName]||pack.character.characterSort[packName])["csh_pingxing_yinjian"] || null;
		}
		for(var i = 0; i < MIRROR_LIST.length; i++){
			var orig = MIRROR_LIST[i];
			var info = lib.character[orig];
			var mirror = "csh_m_" + orig;
			if(lib.character[mirror]) continue;
			if(!info){
				console.log("[池子魔将] 镜像注册跳过：本体武将 " + orig + " 未加载（对应武将包可能未开启）");
				continue;
			}
			var hpVal = (typeof info.hp == "number") ? info.hp : (parseInt(info.hp) || 3);
			var data = {
				sex: info.sex,
				group: info.group,
				hp: hpVal,
				maxHp: (typeof info.maxHp == "number") ? info.maxHp : hpVal,
				skills: (info.skills || []).slice(0),
				img: info.img || ("image/character/" + orig + ".jpg"),
				dieAudios: [orig],
			};
			if(info.hujia) data.hujia = info.hujia;
			if(info.isZhugong) data.isZhugong = true;
			if(info.names) data.names = info.names;
			if(info.groupInGuozhan) data.groupInGuozhan = info.groupInGuozhan;
			if(info.groupBorder) data.groupBorder = info.groupBorder;
			if(info.clans) data.clans = info.clans.slice(0);
			if(info.trashBin) data.trashBin = info.trashBin.slice(0);
			lib.character[mirror] = data;
			charObj[mirror] = data;
			lib.translate[mirror] = lib.translate[orig] || orig;
			if(lib.translate[orig + "_ab"]) lib.translate[mirror + "_ab"] = lib.translate[orig + "_ab"];
			if(lib.characterIntro && lib.characterIntro[orig]) lib.characterIntro[mirror] = lib.characterIntro[orig];
			if(lib.characterTitle && lib.characterTitle[orig]) lib.characterTitle[mirror] = lib.characterTitle[orig];
			// 稀有度跟随本体（选将界面边框样式一致）
			if(lib.rank && lib.rank.rarity){
				for(var rarityKey in lib.rank.rarity){
					var rarityArr = lib.rank.rarity[rarityKey];
					if(rarityArr && rarityArr.indexOf && rarityArr.indexOf(orig) != -1 && rarityArr.add){
						rarityArr.add(mirror);
						break;
					}
				}
			}
			var sortYinjian = (pack && pack.character && pack.character.characterSort && (pack.character.characterSort["mode_extension_"+packName]||pack.character.characterSort[packName]))
				? ((pack.character.characterSort["mode_extension_"+packName]||pack.character.characterSort[packName])["csh_pingxing_yinjian"] || null) : null;
			var sortArr = _cshIsPingxingYinjian(orig) ? sortYinjian : (_cshIsPingxingXia(orig) ? sortXia : sortShang);
			if(sortArr && sortArr.indexOf(mirror) == -1) sortArr.push(mirror);
			}
		})();

		// === 伤害/击杀/回复播报 ===
		// 语音与手游位图特效成对播出的唯一出口，实现在 csh_voice.js：
		// 资源映射表、缺文件跳过、连杀计数、回复累计判定都在那边。
		// 播报的自安装已在 csh_voice.js 模块加载时完成（本 content 有两千多行，
		// 中间任何一步抛错都会让行尾的安装轮不到）；这里只打卡 + 兜底重装一次，
		// 并把失败原因写进调试导出 —— 旧版这里静默，播报不响时无从判断断在哪。
		try {
			if (lib.cshVoice && typeof lib.cshVoice.markContent === "function") {
				lib.cshVoice.markContent();
			} else if (lib.cshVoice && typeof lib.cshVoice.install === "function") {
				lib.cshVoice.install();
			} else if (lib.cshDebug && typeof lib.cshDebug.error === "function") {
				lib.cshDebug.error("voice: csh_voice.js 未加载，伤害/击杀/回复播报不可用");
			} else {
				console.warn("[池子魔将] csh_voice.js 未加载，伤害/击杀/回复播报不可用");
			}
		} catch (eVoice) {
			try {
				if (lib.cshDebug && typeof lib.cshDebug.error === "function") {
					lib.cshDebug.error("voice: content 安装播报失败", { error: eVoice });
				}
			} catch (eVR) {}
		}
		// 手游播报特效：分发钩子必须等 lib.cshShoushaFx 建立之后才能装。
		// 安装器在 precontent 注册（那时 cshShoushaFx 还没建立），这里时机正好。
		try {
			if (typeof lib._cshMobileFxInstallHook === "function") lib._cshMobileFxInstallHook();
		} catch (eMfxHook) {}

    // 不使用全局 AI result Hook：各技能 AI 保持局部、可验证、可维护。


		// [界陆绩] 浑天仪已改为扩展内置衍生卡 csh_huntianyi（见 package.card），不依赖族包

		// 索引兼容（v4 · 最小改动）：引擎多处按**数组索引**读取角色条目
		// （optionsMenu.js:203 取 [3] 技能表、boss.js:109 列表血条取 [2]、player.init:2628…）。
		// 本体角色是数组字面量（天然具备 [N]），扩展角色是对象形式——
		// 给**本扩展自己的条目**（csh_* 键）补数字索引，让 [N] 与 .属性 双通道可读。
		try {
			for (const ck in lib.character) {
				if (ck.indexOf("csh_") !== 0) continue;
				const ci = lib.character[ck];
				if (!ci || typeof ci !== "object" || Array.isArray(ci)) continue;
				if (ci.skills !== undefined && ci[3] === undefined) ci[3] = ci.skills;
				if (ci.sex !== undefined) ci[0] = ci.sex;
				if (ci.group !== undefined) ci[1] = ci.group;
				if (ci.hp !== undefined) ci[2] = ci.hp;
				if (ci.extraModeData !== undefined) ci[5] = ci.extraModeData;
			}
		} catch (eIdx) {}
	} catch (eCshContent) {
		// 引擎把 content 的异常吞进 console（loading.js 的 try/catch），调试导出里一点痕迹都没有。
		// 这里自己兜住并写进错误收集器：以后再出现「某段功能莫名不生效」，导出里能直接看到断在哪一行。
		try {
			if (lib.cshDebug && typeof lib.cshDebug.error === "function") {
				lib.cshDebug.error("content: 扩展 content 执行中断，其后注册全部未生效", { error: eCshContent });
			} else {
				console.error("[池子魔将] content 执行中断", eCshContent);
			}
		} catch (eCL) {}
	} }
