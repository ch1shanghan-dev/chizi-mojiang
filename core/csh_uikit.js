import { lib, game } from "../../../noname.js";
/* ============================================================
   池子魔将 · 界面基座（2026-10-18 · 第十八批）
   ------------------------------------------------------------
   为什么要有这个文件（作者："不要只修一点尺寸，要从根源上解决"）：
   扩展里 7 处 toast 各自实现，其中 6 处直接调引擎 `ui.create.toast` —— 而引擎那个：
     ① 容器挂在 document.body 里，body 被 `transform:scale(documentZoom)` 整体缩放
        （引擎 ui/index.js:592 / 十周年UI overrides/ui/update.js）⇒ 手机（zoom≈0.4）上
        奖励提示只有四成大小，一闪就没，根本看不清；
     ② `white-space:nowrap` ⇒ 带武将名/结算尾注的长句直接横向溢出屏幕；
     ③ `innerHTML = message` ⇒ 文案里一旦有玩家昵称/技能名带尖括号，布局和语义一起坏；
     ④ 全局串行 1.5s/条、无合并、无优先级 ⇒ 连发 5 条奖励要等 7.5 秒，最后一条姗姗来迟；
     ⑤ z-index 9999 ⇒ 被本扩展任何面板（1000003）盖住，面板开着时奖励提示"看不见"。
   本文件把「提示」收敛成**唯一实现**：
     · 挂 documentElement（不参与 body 缩放）、真实 px、安全区避让；
     · 文本走 textContent（零注入）、自动换行、最大宽度；
     · 最多 4 条同屏 + 同键合并「×N」+ 超出排队（不丢消息）；
     · 两种皮肤：dark（对局/大厅默认）· paper（调试面板浅色）；
     · z-index 走统一档位表，永远在面板/弹窗之上。
   以后新增任何"获得 XX / 操作成功 / 失败提示"，一律 `lib.cshUI.toast(...)`，
   禁止再直接调 `ui.create.toast`（门禁 E48 会拦）。
   ============================================================ */

/* ---------- z-index 档位表（唯一真源） ----------
   历史问题：各面板各写各的（999 / 9999 / 999990 / 1000002 / 1000003 / 2147483000），
   谁压谁全靠运气。新增浮层一律从这里取档。 */
export const CSH_Z = {
    scene: 100,          /* 对局内演出（不接点击，游戏页 iframe 文档） */
    sceneTop: 999,       /* 对局内高优先级演出 */
    panel: 2147483000,   /* 扩展面板：商店 / 调试 / 生涯（= --csh-z-panel） */
    modal: 2147483040,   /* 模态框（确认框 / 导入导出）。2026-10-20 两修：
                           ① 旧值 1000010 低于商店暗幕 2147482999 → 确认框被压点不到；
                           ② 提至 3025 后仍低于游戏壳档 → 壳内页面（成就页重置）的确认框被壳盖住
                             （此坑从旧值 1000010<1000020 时代就有）。现 3040 高于 shell 3025。
                           本表与 csh_theme.js 层级表同值，新增档位只改那一处。 */
    toast: 2147483050,   /* 提示：永远在面板与模态之上 */
    top: 2147483080,     /* 最高优先：强制确认、全屏接管、系统级（更新面板 / 兑换）。
                           旧名 system 且与 panel 同档 2147483000，会与面板互压 */
};

var HOST_ID = "csh-ui-toast-root";
var CSS_ID = "csh-ui-css";
var CF_ID = "csh-ui-confirm";
var MAX_VISIBLE = 4;
var LIFE = { reward: 3000, info: 2400, warn: 3400 };
var _installed = false;
var _host = null;
var _visible = [];
var _pending = [];
var _recent = {};
var _seq = 0;

/* body 的实际缩放：优先实测（rect ÷ offset），拿不到退回 documentZoom。
   扩展里所有"要在引擎坐标系里算尺寸"的地方都该用这个，而不是 vh/vw。 */
function zoomOf(el) {
    var z = 0;
    try {
        var node = el || document.body;
        var oh = node ? node.offsetHeight : 0;
        var rh = node ? node.getBoundingClientRect().height : 0;
        if (oh > 0 && rh > 0) z = rh / oh;
    } catch (e) {}
    if (!(z > 0.05) || !isFinite(z)) {
        try { z = (game && game.documentZoom > 0) ? game.documentZoom : 1; } catch (e2) { z = 1; }
    }
    if (!(z > 0.05) || !isFinite(z)) z = 1;
    return z;
}

/* 把「屏幕上还能用多少 px」换算回元素所在的局部坐标（max-height 用）。
   reserve = 上下至少留多少屏幕像素。 */
function fitPx(el, reserve) {
    var vh = 0;
    try { vh = window.innerHeight || document.documentElement.clientHeight || 0; } catch (e) {}
    if (!vh) return 0;
    var top = 0;
    try { top = Math.max(0, Math.min((el && el.getBoundingClientRect().top) || 0, vh)); } catch (e2) {}
    var px = Math.floor((vh - top - (reserve == null ? 8 : reserve)) / zoomOf(el));
    return Math.max(160, px);
}

function ensureStyle() {
    if (document.getElementById(CSS_ID)) return;
    var st = document.createElement("style");
    st.id = CSS_ID;
    st.textContent = [
        "@keyframes cshUiIn{from{opacity:0;transform:translateY(-10px);}to{opacity:1;transform:translateY(0);}}",
        "@keyframes cshUiOut{from{opacity:1;transform:translateY(0);}to{opacity:0;transform:translateY(-8px);}}",
        "@keyframes cshUiFade{from{opacity:0;}to{opacity:1;}}",

        /* ---------- 提示容器：documentElement 直属，不参与 body 缩放 ---------- */
        "#" + HOST_ID + "{position:fixed!important;left:50%!important;top:calc(env(safe-area-inset-top,0px) + 10%)!important;",
        "transform:translateX(-50%)!important;z-index:" + CSH_Z.toast + "!important;",
        "display:flex!important;flex-direction:column!important;align-items:center!important;gap:8px!important;",
        "width:max-content!important;max-width:min(92vw,560px)!important;pointer-events:none!important;",
        "font-family:'Microsoft YaHei','PingFang SC','Noto Sans SC',system-ui,sans-serif!important;}",
        "#" + HOST_ID + " .csh-ui-toast{position:static!important;display:block!important;box-sizing:border-box!important;",
        "max-width:min(92vw,560px)!important;padding:10px 18px!important;border-radius:12px!important;",
        "font-size:var(--csh-lfs-lg,14px)!important;line-height:1.55!important;font-weight:600!important;letter-spacing:.4px!important;",
        "text-align:center!important;white-space:normal!important;word-break:break-word!important;overflow-wrap:anywhere!important;",
        "animation:cshUiIn .18s cubic-bezier(.22,.61,.36,1)!important;transition:opacity .26s ease,transform .26s ease!important;}",
        "#" + HOST_ID + " .csh-ui-toast.out{animation:cshUiOut .26s ease forwards!important;}",
        /* dark = 对局/大厅：深底描金，与胜负统计同一套色 */
        "#" + HOST_ID + " .csh-ui-toast.dark{color:#f4e8c8!important;",
        "background:linear-gradient(180deg,rgba(34,27,19,.97),rgba(14,11,8,.97))!important;",
        "border:1px solid rgba(216,180,106,.5)!important;",
        "box-shadow:inset 3px 0 0 rgba(216,180,106,.85),0 10px 30px rgba(0,0,0,.55)!important;}",
        "#" + HOST_ID + " .csh-ui-toast.dark.reward{color:#ffe9ae!important;border-color:rgba(216,180,106,.78)!important;",
        "box-shadow:inset 3px 0 0 #f4dfa8,0 0 24px rgba(216,180,106,.18),0 10px 30px rgba(0,0,0,.55)!important;}",
        "#" + HOST_ID + " .csh-ui-toast.dark.warn{color:#ffc9cf!important;border-color:rgba(230,120,130,.7)!important;",
        "box-shadow:inset 3px 0 0 #e6808c,0 10px 30px rgba(0,0,0,.55)!important;}",
        /* paper = 调试面板：浅纸底，与面板同肤色 */
        "#" + HOST_ID + " .csh-ui-toast.paper{color:#2a2118!important;background:#f6f1e4!important;",
        "border:1px solid rgba(60,48,28,.22)!important;",
        "box-shadow:inset 3px 0 0 #c9a84c,0 12px 34px -14px rgba(0,0,0,.42)!important;}",
        "#" + HOST_ID + " .csh-ui-toast.paper.reward{color:#6b4f10!important;border-color:rgba(201,168,76,.75)!important;}",
        "#" + HOST_ID + " .csh-ui-toast.paper.warn{color:#8d2f3a!important;border-color:rgba(200,90,105,.55)!important;",
        "box-shadow:inset 3px 0 0 #c85a69,0 12px 34px -14px rgba(0,0,0,.42)!important;}",

        /* ---------- 确认框（替代 window.confirm） ---------- */
        "#" + CF_ID + "{position:fixed!important;left:0!important;top:0!important;width:100%!important;height:100%!important;",
        "z-index:" + CSH_Z.modal + "!important;display:flex!important;align-items:center!important;justify-content:center!important;",
        "padding:16px!important;box-sizing:border-box!important;background:rgba(5,4,3,.62)!important;",
        "-webkit-backdrop-filter:blur(2px)!important;backdrop-filter:blur(2px)!important;animation:cshUiFade .16s ease-out!important;",
        "font-family:'Microsoft YaHei','PingFang SC','Noto Sans SC',system-ui,sans-serif!important;}",
        "#" + CF_ID + " *{box-sizing:border-box!important;}",
        "#" + CF_ID + " div{position:static!important;display:block!important;}",
        "#" + CF_ID + " span{position:static!important;display:inline-block!important;}",
        "#" + CF_ID + " .csh-ui-cf-card{width:min(420px,92vw)!important;padding:18px 18px 14px!important;border-radius:16px!important;",
        "background:linear-gradient(168deg,#1e1811,#120f0a 70%)!important;border:1px solid rgba(216,180,106,.55)!important;",
        "box-shadow:0 26px 70px rgba(0,0,0,.8)!important;color:#ece5d6!important;}",
        "#" + CF_ID + " .csh-ui-cf-title{font-size:var(--csh-lfs-xl,16px)!important;font-weight:700!important;letter-spacing:1.5px!important;color:#f6e5b6!important;margin:0 0 8px!important;}",
        "#" + CF_ID + " .csh-ui-cf-card.danger .csh-ui-cf-title{color:#f2b9c2!important;}",
        "#" + CF_ID + " .csh-ui-cf-msg{font-size:var(--csh-lfs-md,13px)!important;line-height:1.8!important;color:#c9c0ab!important;",
        "white-space:pre-line!important;word-break:break-word!important;margin:0 0 14px!important;}",
        "#" + CF_ID + " .csh-ui-cf-acts{display:flex!important;flex-wrap:wrap!important;justify-content:flex-end!important;gap:10px!important;}",
        "#" + CF_ID + " .csh-ui-cf-btn{display:inline-block!important;cursor:pointer!important;padding:11px 20px!important;min-height:44px!important;",
        "border-radius:999px!important;border:1px solid rgba(216,180,106,.32)!important;color:#e3d6b2!important;font-size:var(--csh-lfs-md2,13.5px)!important;",
        "background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.015))!important;}",
        "#" + CF_ID + " .csh-ui-cf-btn.ok{color:#221a0c!important;font-weight:700!important;border-color:rgba(216,180,106,.85)!important;",
        "background:linear-gradient(180deg,#f4dfa8,#cfa958)!important;}",
        "#" + CF_ID + " .csh-ui-cf-card.danger .csh-ui-cf-btn.ok{color:#2a1013!important;border-color:rgba(230,130,144,.85)!important;",
        "background:linear-gradient(180deg,#f0a3b0,#d66e7c)!important;}",
    ].join("");
    (document.head || document.documentElement).appendChild(st);
}

function ensureHost() {
    if (_host && _host.parentNode) return _host;
    _host = document.getElementById(HOST_ID);
    if (!_host) {
        _host = document.createElement("div");
        _host.id = HOST_ID;
        (document.documentElement || document.body).appendChild(_host);
    }
    return _host;
}

function stopTimer(el) {
    if (el.__cshT1) { clearTimeout(el.__cshT1); el.__cshT1 = 0; }
    if (el.__cshT2) { clearTimeout(el.__cshT2); el.__cshT2 = 0; }
}
function drop(el) {
    stopTimer(el);
    var i = _visible.indexOf(el);
    if (i >= 0) _visible.splice(i, 1);
    try { if (el.parentNode) el.parentNode.removeChild(el); } catch (e) {}
    pump();
}
function retire(el) {
    if (el.__cshOut) return;
    el.__cshOut = true;
    try { el.classList.add("out"); } catch (e) {}
    el.__cshT2 = setTimeout(function () { drop(el); }, 280);
}
function arm(el, ms) {
    stopTimer(el);
    el.__cshOut = false;
    try { el.classList.remove("out"); } catch (e) {}
    el.__cshT1 = setTimeout(function () { retire(el); }, ms);
}
function show(item) {
    ensureHost();
    var el = document.createElement("div");
    el.className = "csh-ui-toast " + (item.theme || "dark") + (item.kind && item.kind !== "info" ? " " + item.kind : "");
    el.textContent = item.text;
    el.__cshItem = item;
    _host.appendChild(el);
    _visible.push(el);
    arm(el, item.duration);
    return el;
}
function pump() {
    while (_visible.length < MAX_VISIBLE && _pending.length) show(_pending.shift());
}

/* 文本启发式：带 CBY / 池子币 / 入账 / +N 的都按「获得」描金显示。
   调用方也可以显式传 { kind:"reward" } 覆盖。 */
function kindOf(text, opt) {
    if (opt && opt.kind) return opt.kind;
    if (/CBY|池子币|入账|获得|达成|[+＋]\s*[\d,]+/.test(text)) return "reward";
    return "info";
}

function toast(msg, opt) {
    opt = opt || {};
    var text = String(msg == null ? "" : msg).replace(/^\s+|\s+$/g, "");
    if (!text) return null;
    ensureStyle();
    ensureHost();
    var kind = kindOf(text, opt);
    var theme = opt.theme === "paper" ? "paper" : "dark";
    var key = opt.key ? String(opt.key) : "";
    var now = Date.now();
    if (opt.once) {
        if (_recent[text] && now - _recent[text] < opt.once) return null;
    }
    for (var k in _recent) { if (now - _recent[k] > 10000) delete _recent[k]; }
    _recent[text] = now;
    /* 同键合并：连点/连发同一类提示时只刷新同一条，并标「×N」
       （opt.merge === false 时只换文案、不计数 —— 调试面板的输入校验提示用这种） */
    if (key) {
        for (var i = 0; i < _visible.length; i++) {
            var el = _visible[i];
            if (el.__cshItem && el.__cshItem.key === key) {
                el.__cshItem.count++;
                el.__cshItem.text = text;
                el.textContent = (opt.merge === false) ? text : (text + " ×" + el.__cshItem.count);
                arm(el, opt.duration || LIFE[kind] || 2400);
                return el;
            }
        }
    }
    var item = {
        id: ++_seq, text: text, kind: kind, theme: theme, key: key, count: 1,
        duration: Math.max(1200, Number(opt.duration) || LIFE[kind] || 2400),
    };
    if (_visible.length >= MAX_VISIBLE) {
        _pending.push(item);
        /* 排队上限：极端刷屏只保留最近的 8 条，避免延迟越滚越大 */
        while (_pending.length > 8) _pending.shift();
        return null;
    }
    return show(item);
}

/* 确认框：替代 window.confirm（原生弹窗在 Electron / 安卓 WebView 上样式与层级都不可控）。
   用法：lib.cshUI.confirm({title, message, ok, cancel, danger}, function(ok){ ... }) */
function confirmBox(opts, cb) {
    opts = (typeof opts === "string") ? { message: opts } : (opts || {});
    ensureStyle();
    try {
        var old = document.getElementById(CF_ID);
        if (old && old.parentNode) old.parentNode.removeChild(old);
    } catch (e0) {}
    var layer = document.createElement("div");
    layer.id = CF_ID;
    var card = document.createElement("div");
    card.className = "csh-ui-cf-card" + (opts.danger ? " danger" : "");
    var title = document.createElement("div");
    title.className = "csh-ui-cf-title";
    title.textContent = String(opts.title || "请确认");
    var msg = document.createElement("div");
    msg.className = "csh-ui-cf-msg";
    msg.textContent = String(opts.message == null ? "" : opts.message);
    var acts = document.createElement("div");
    acts.className = "csh-ui-cf-acts";
    var cancel = document.createElement("span");
    cancel.className = "csh-ui-cf-btn";
    cancel.textContent = String(opts.cancel || "取消");
    var ok = document.createElement("span");
    ok.className = "csh-ui-cf-btn ok";
    ok.textContent = String(opts.ok || "确定");
    acts.appendChild(cancel);
    acts.appendChild(ok);
    card.appendChild(title);
    card.appendChild(msg);
    card.appendChild(acts);
    layer.appendChild(card);
    (document.documentElement || document.body).appendChild(layer);

    var done = false;
    function fin(v) {
        if (done) return;
        done = true;
        try { document.removeEventListener("keydown", onKey, true); } catch (eK) {}
        try { if (layer.parentNode) layer.parentNode.removeChild(layer); } catch (eR) {}
        try { if (typeof cb === "function") cb(!!v); } catch (eC) {}
    }
    function onKey(e) {
        if (e.key === "Escape" || e.keyCode === 27) { try { e.preventDefault(); e.stopPropagation(); } catch (eP) {} fin(false); }
        else if (e.key === "Enter" || e.keyCode === 13) { try { e.preventDefault(); e.stopPropagation(); } catch (eP2) {} fin(true); }
    }
    document.addEventListener("keydown", onKey, true);
    layer.addEventListener("click", function (e) { if (e.target === layer) fin(false); }, false);
    cancel.addEventListener("click", function (e) { try { e.stopPropagation(); } catch (eS) {} fin(false); }, false);
    ok.addEventListener("click", function (e) { try { e.stopPropagation(); } catch (eS) {} fin(true); }, false);
    setTimeout(function () { try { ok.focus(); } catch (eF) {} }, 30);
    return { el: layer, close: function () { fin(false); } };
}

export function installUIKit() {
    if (_installed && lib.cshUI) return lib.cshUI;
    _installed = true;
    try { ensureStyle(); } catch (e) {}
    var api = {
        version: 1,
        Z: CSH_Z,
        zoom: zoomOf,
        fitPx: fitPx,
        toast: toast,
        confirm: confirmBox,
    };
    lib.cshUI = api;
    try { if (typeof window !== "undefined") { window.CSH = window.CSH || {}; window.CSH.ui = api; } } catch (eW) {}
    return api;
}

export default null;
