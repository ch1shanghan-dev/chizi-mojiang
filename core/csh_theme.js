import { lib } from "../../../noname.js";
// 池子魔将 · 面板样式 token 层（阶段 4 · 单一真值）+ 皮肤系统（2026-09-29 第四轮）
// ============================================================================
// 为什么需要它（2026-09-29）：
//   调试面板（csh_debug.js）与局内互动面板（csh_interact.js）共享同一套
//   深底 + 鎏金 视觉语言，但此前颜色是**逐字硬编码**散落在两处：
//     深底 #18181B ×78、白字 #FFFFFF ×40、鎏金 #F5B301 ×26、灰 #5C5C60 ×22、
//     蓝 #2255B8 ×18、浅底 #F7F7F4 ×15、中灰 #8C8C90 ×14、红 #CC3A2E ×10、
//     纸白 #F6F6F3 ×10、绿 #1B6B4F ×4、纸白2 #F2F2EF ×4、深金 #EBA600 ×4，
//   另有 rgba() 形态 ~152 处（同几个基色 + 不同透明度）。
//   「改一个主色」要动几百处、且两面板极易漂移出两种深浅 —— 正是要根治的
//   「同一事实多份副本」问题。
//
// 收敛策略：
//   · 颜色**唯一真值**集中在 SKINS（每套皮肤一份 hex + rgb 三通道成对给出）。
//   · 启动即把 `:root` 注入 host 文档，各面板用 `var(--csh-*)` 引用；
//     rgba 形态用 `rgba(var(--csh-*-rgb), a)` 引用。
//   · lib.cshTheme 暴露 SKINS + 注入函数 + 切皮肤函数，供调试面板自查/展示。
//
// 只覆盖「宿主侧面板」，不碰各游戏 iframe（它们各自自包含样式）。
//
// ── 皮肤系统（2026-09-29 第四轮 · 真机反馈「白色太耀眼、不够护眼、字晕」）──
//   实测依据（WCAG 相对亮度）：原纸白底 #F6F6F3 的 L=92%，卡片纯白 L=100%，
//   而墨字 #18181B 仅 0.9% ⇒ 对比 16~18:1 的**极值反差**叠加大面积高亮底面，
//   细笔画（12~13.5px / 字重 400）在纯白上会产生 halation（字晕）；
//   弱化灰 #8C8C90 在纸白上只有 3.09:1，又反过来**看不清**。
//   ⇒ 结论不是"再白一点"或"再黑一点"，而是"整块近白底 + 极值对比 + 细字"三件事叠加。
//
//   token 的**语义**（每套皮肤都必须遵守，否则深浅一换就出现白底白字）：
//     paper / paper2 / fg / light = 四个表面层级（paper 最底 → light 最亮/最浮）
//     bg           = 「墨」：浅色皮肤里是深色正文；深色皮肤里**必须是浅色正文**
//     bgDeep       = 恒为暗（只作遮罩 rgba 的基色，任何皮肤下都不能变浅）
//     gray / graySoft = 次级 / 弱化文字（深色皮肤里必须是浅色）
//   因此 `color:var(--csh-bg)` 这类"墨字"写法在两套深浅皮肤下都成立，
//   rgba(var(--csh-bg-rgb), .12) 这类"墨色描边"也会自动跟着翻面。
// ============================================================================
(function () {
    if (lib.__csh_theme_inited) return;
    lib.__csh_theme_inited = true;

    /* —— 唯一真值：皮肤表 ——
       新增皮肤只改这里；两套 Node 工具（csh_debug_panel_selftest.cjs /
       csh_panel_shots.cjs）都从本文件解析 SKINS，不手抄第二份。 */
    var SKINS = {
        /* ① 三国杀 · 木纹鎏金（默认）：贴合宿主氛围的深棕木 + 米黄纸 + 朱金，
              顺带把"大面积近白眩光"整个拿掉 */
        sgs: {
            label: "三国杀 · 木纹鎏金",
            colors: {
                bg:          { hex: "#E8D9B8", rgb: "232,217,184" },  // 米黄墨（深底上的正文字）
                bgDeep:      { hex: "#0B0805", rgb: "11,8,5" },       // 遮罩基色（恒暗）
                inkPlate:     { hex: "#0E0B07", rgb: "13,11,7" },   // 恒暗墨底（「黄字压墨底」chip 专用，深色皮肤下也不能翻面）
                accentInk:    { hex: "#141008", rgb: "20,16,8" },   // 彩色底（金/蓝/红/绿）上压的深字
                colorInk:     { hex: "#141008", rgb: "20,16,8" },   // 蓝/红/绿底上的字（浅皮肤=白，深皮肤=深）
                fg:          { hex: "#2E2418", rgb: "46,36,24" },     // 卡片面
                accent:      { hex: "#E0A93B", rgb: "224,169,59" },   // 鎏金
                accentDark:  { hex: "#C08A24", rgb: "192,138,36" },   // 深金
                gray: { hex: "#C3A782", rgb: "195,167,130" },  // 次级文字/描边
                graySoft: { hex: "#9F8B6B", rgb: "159,139,107" },   // 弱化文字
                blue: { hex: "#6399C2", rgb: "99,153,194" },   // 魏蓝
                light:       { hex: "#372B1D", rgb: "55,43,29" },     // 浮起表面
                paper:       { hex: "#241B12", rgb: "36,27,18" },     // 面板底
                paper2:      { hex: "#1B140D", rgb: "27,20,13" },     // 下沉表面
                red: { hex: "#FC5F50", rgb: "252,95,80" },    // 蜀红
                green: { hex: "#6BA06F", rgb: "107,160,111" },    // 吴绿
            },
        },
        /* ② 暖宣 · 护眼：仍然是浅色，但把底降到 L≈80% 的暖灰、墨字提亮到 #26241F，
              弱化灰提到 ≥4.5:1 —— 保留"纸感"又不刺眼 */
        warm: {
            label: "暖宣 · 护眼",
            colors: {
                bg:          { hex: "#26241F", rgb: "38,36,31" },
                bgDeep:      { hex: "#100E0B", rgb: "16,14,11" },
                inkPlate:     { hex: "#18181B", rgb: "24,24,27" },   // 恒暗墨底（「黄字压墨底」chip 专用，深色皮肤下也不能翻面）
                accentInk:    { hex: "#18181B", rgb: "24,24,27" },   // 彩色底（金/蓝/红/绿）上压的深字
                colorInk:     { hex: "#FFFFFF", rgb: "255,255,255" },   // 蓝/红/绿底上的字（浅皮肤=白，深皮肤=深）
                fg:          { hex: "#F5F2EA", rgb: "245,242,234" },
                accent:      { hex: "#F5B301", rgb: "245,179,1" },
                accentDark:  { hex: "#EBA600", rgb: "235,166,0" },
                gray: { hex: "#57544C", rgb: "87,84,76" },
                graySoft: { hex: "#69655C", rgb: "105,101,92" },
                blue: { hex: "#2F5C8F", rgb: "47,92,143" },
                light:       { hex: "#F0ECE2", rgb: "240,236,226" },
                paper:       { hex: "#E9E5DA", rgb: "233,229,218" },
                paper2:      { hex: "#DFDACE", rgb: "223,218,206" },
                red: { hex: "#AB382C", rgb: "171,56,44" },
                green: { hex: "#2F6B52", rgb: "47,107,82" },
            },
        },
        /* ③ 纸白 · 原版（2026-09-29 之前的外观，原样保留供对比/回滚） */
        paper: {
            label: "纸白 · 原版",
            colors: {
                bg:          { hex: "#18181B", rgb: "24,24,27" },
                bgDeep:      { hex: "#101012", rgb: "16,16,18" },
                inkPlate:     { hex: "#18181B", rgb: "24,24,27" },   // 恒暗墨底（「黄字压墨底」chip 专用，深色皮肤下也不能翻面）
                accentInk:    { hex: "#18181B", rgb: "24,24,27" },   // 彩色底（金/蓝/红/绿）上压的深字
                colorInk:     { hex: "#FFFFFF", rgb: "255,255,255" },   // 蓝/红/绿底上的字（浅皮肤=白，深皮肤=深）
                fg:          { hex: "#FFFFFF", rgb: "255,255,255" },
                accent:      { hex: "#F5B301", rgb: "245,179,1" },
                accentDark:  { hex: "#EBA600", rgb: "235,166,0" },
                gray:        { hex: "#5C5C60", rgb: "92,92,96" },
                graySoft:    { hex: "#8C8C90", rgb: "140,140,144" },
                blue:        { hex: "#2255B8", rgb: "34,85,184" },
                light:       { hex: "#F7F7F4", rgb: "247,247,244" },
                paper:       { hex: "#F6F6F3", rgb: "246,246,243" },
                paper2:      { hex: "#F2F2EF", rgb: "242,242,239" },
                red:         { hex: "#CC3A2E", rgb: "204,58,46" },
                green:       { hex: "#1B6B4F", rgb: "27,107,79" },
            },
        },
        /* ④ 夜间：低亮度、无纯白（正文字压到 L≈40% 的冷灰蓝），适合暗环境长看 */
        night: {
            label: "夜间 · 低亮",
            colors: {
                bg:          { hex: "#AAB2BF", rgb: "170,178,191" },
                bgDeep:      { hex: "#080A0D", rgb: "8,10,13" },
                inkPlate:     { hex: "#0A0C10", rgb: "10,12,16" },   // 恒暗墨底（「黄字压墨底」chip 专用，深色皮肤下也不能翻面）
                accentInk:    { hex: "#0E1116", rgb: "14,17,22" },   // 彩色底（金/蓝/红/绿）上压的深字
                colorInk:     { hex: "#0E1116", rgb: "14,17,22" },   // 蓝/红/绿底上的字（浅皮肤=白，深皮肤=深）
                fg:          { hex: "#1F232A", rgb: "31,35,42" },
                accent:      { hex: "#C79A3C", rgb: "199,154,60" },
                accentDark:  { hex: "#A87F28", rgb: "168,127,40" },
                gray: { hex: "#A2ACC2", rgb: "162,172,194" },
                graySoft: { hex: "#828B9D", rgb: "130,139,157" },
                blue: { hex: "#6594CB", rgb: "101,148,203" },
                light:       { hex: "#262B33", rgb: "38,43,51" },
                paper:       { hex: "#171A1F", rgb: "23,26,31" },
                paper2:      { hex: "#12151A", rgb: "18,21,26" },
                red: { hex: "#EA685B", rgb: "234,104,91" },
                green: { hex: "#5B9F77", rgb: "91,159,119" },
            },
        },
        /* ⑤ 青瓷 · 水墨：青灰纸面 + 墨青正文 + 青瓷绿强调（中式素雅） */
        celadon: {
            label: "青瓷 · 水墨",
            colors: {
                bg:          { hex: "#1F2B28", rgb: "31,43,40" },
                bgDeep:      { hex: "#0D1412", rgb: "13,20,18" },
                inkPlate:     { hex: "#0A1210", rgb: "10,18,16" },   // 恒暗墨底（「黄字压墨底」chip 专用，深色皮肤下也不能翻面）
                accentInk:    { hex: "#14201D", rgb: "20,32,29" },   // 彩色底（金/蓝/红/绿）上压的深字
                colorInk:     { hex: "#FFFFFF", rgb: "255,255,255" },   // 蓝/红/绿底上的字（浅皮肤=白，深皮肤=深）
                fg:          { hex: "#EDF2EF", rgb: "237,242,239" },
                accent:      { hex: "#3F7F6D", rgb: "63,127,109" },
                accentDark: { hex: "#3A7A63", rgb: "58,122,99" },
                gray: { hex: "#495654", rgb: "73,86,84" },
                graySoft: { hex: "#596865", rgb: "89,104,101" },
                blue: { hex: "#2F5D7A", rgb: "47,93,122" },
                light:       { hex: "#E7EDE9", rgb: "231,237,233" },
                paper:       { hex: "#DFE6E2", rgb: "223,230,226" },
                paper2:      { hex: "#D3DBD6", rgb: "211,219,214" },
                red: { hex: "#A14037", rgb: "161,64,55" },
                green: { hex: "#2F6B52", rgb: "47,107,82" },
            },
        },
        /* ⑥ 鎏金黑：与五个小游戏自己的「深底 + 鎏金」完全一致（面板与游戏同语汇） */
        gold: {
            label: "鎏金黑 · 同游戏",
            colors: {
                bg:          { hex: "#F0E0B4", rgb: "240,224,180" },
                bgDeep:      { hex: "#060504", rgb: "6,5,4" },
                inkPlate:     { hex: "#080604", rgb: "8,6,4" },   // 恒暗墨底（「黄字压墨底」chip 专用，深色皮肤下也不能翻面）
                accentInk:    { hex: "#120E06", rgb: "18,14,6" },   // 彩色底（金/蓝/红/绿）上压的深字
                colorInk:     { hex: "#120E06", rgb: "18,14,6" },   // 蓝/红/绿底上的字（浅皮肤=白，深皮肤=深）
                fg:          { hex: "#1E1A12", rgb: "30,26,18" },
                accent:      { hex: "#D8B46A", rgb: "216,180,106" },
                accentDark:  { hex: "#C29A4E", rgb: "194,154,78" },
                gray: { hex: "#B19F78", rgb: "177,159,120" },
                graySoft: { hex: "#92825E", rgb: "146,130,94" },
                blue: { hex: "#5F8EB9", rgb: "95,142,185" },
                light:       { hex: "#282319", rgb: "40,35,25" },
                paper:       { hex: "#14110C", rgb: "20,17,12" },
                paper2:      { hex: "#100D08", rgb: "16,13,8" },
                red: { hex: "#E85B4B", rgb: "232,91,75" },
                green: { hex: "#61956A", rgb: "97,149,106" },
            },
        },
    };

    var K_SKIN = "csh_panel_skin";
    var DEFAULT_SKIN = "sgs";
    var active = DEFAULT_SKIN;

    /* 兼容出口：COLORS 恒指向「当前默认皮肤」的真值。
       老代码 / Node 工具若只读一份，读到的就是默认皮肤，不会读到半套。 */
    var COLORS = SKINS[DEFAULT_SKIN].colors;

    function has(name) { return !!(name && Object.prototype.hasOwnProperty.call(SKINS, name)); }

    /* —— 由某套皮肤的 COLORS 派生 CSS 变量文本（不再手写第二份）。
          JS 键名用驼峰（bgDeep），CSS 变量统一 kebab（--csh-bg-deep），
          避免两套命名漂移。 —— */
    function toKebab(k) {
        return k.replace(/([A-Z])/g, function (m) { return "-" + m.toLowerCase(); });
    }
    function cssText(name) {
        var set = (has(name) ? SKINS[name] : SKINS[DEFAULT_SKIN]).colors;
        var lines = [];
        for (var k in set) {
            if (!set.hasOwnProperty(k)) continue;
            var c = set[k];
            var nm = toKebab(k);
            lines.push("    --csh-" + nm + ": " + c.hex + ";");
            lines.push("    --csh-" + nm + "-rgb: " + c.rgb + ";");
        }
        return ":root {\n" + lines.join("\n") + "\n}";
    }

    /* —— 注入 host 文档 :root（幂等：固定 id，重复调用只刷新一次）—— */
    function inject(name) {
        try {
            if (typeof document === "undefined" || !document.documentElement) return false;
            var el = document.getElementById("csh-theme-tokens");
            if (!el) {
                el = document.createElement("style");
                el.id = "csh-theme-tokens";
                el.setAttribute("data-csh", "theme");
                (document.head || document.documentElement).appendChild(el);
            }
            el.textContent = cssText(name);
            return true;
        } catch (e) {
            return false;
        }
    }

    /* 游戏页 chrome 变量映射（2026-09-30 帕累托皮肤化）：
       六个游戏页各自定义了一套高度统一的本地 :root 变量（--ink-* / --gold-* / --text-* / --danger / --ok），
       仅用于 chrome（背景/外框/按钮/标题/HUD），牌面红黑与 --felt-* 绿绒是独立功能链、不受影响。
       这里把 chrome 变量映射到当前皮肤的 token 具体色值，由 csh_page.js 注入各 iframe 的 :root，
       实现「切皮肤时整页 chrome 翻面」而零改动游戏页内部逻辑。 */
    function gameChrome(name) {
        var set = (has(name) ? SKINS[name] : SKINS[DEFAULT_SKIN]).colors;
        function h(k) { return set[k] ? set[k].hex : "#000000"; }
        function g(k) { return set[k] ? set[k].rgb : "0,0,0"; }
        var lines = [
            "  --ink-0: " + h("bgDeep") + ";",            /* 背景渐变外圈（恒暗） */
            "  --ink-1: " + h("paper2") + ";",            /* 背景中圈（下沉表面） */
            "  --ink-2: " + h("paper") + ";",             /* 背景中心（主表面） */
            "  --gold: " + h("accent") + ";",             /* 金调主色 → 皮肤强调色 */
            "  --gold-hi: " + h("accent") + ";",          /* 亮金高光 → 强调色 */
            "  --gold-soft: rgba(" + g("accent") + ", .55);",
            "  --gold-line: rgba(" + g("accent") + ", .28);",
            "  --gold-fill: rgba(" + g("accent") + ", .07);",
            "  --text: " + h("bg") + ";",                 /* 墨字：浅皮肤深 / 深皮肤浅 */
            "  --text-dim: " + h("graySoft") + ";",
            "  --danger: " + h("red") + ";",
            "  --ok: " + h("green") + ";"
        ];
        return ":root {\n" + lines.join("\n") + "\n}";
    }

    /* 记忆选择（宿主 localStorage；读不到就用默认皮肤） */
    function load() {
        try {
            var v = typeof localStorage !== "undefined" ? localStorage.getItem(K_SKIN) : null;
            return has(v) ? v : DEFAULT_SKIN;
        } catch (e) { return DEFAULT_SKIN; }
    }
    function save(name) {
        try { if (typeof localStorage !== "undefined") localStorage.setItem(K_SKIN, name); } catch (e) {}
    }

    /* 切皮肤：重注入 :root 即可——CSS 变量是惰性解析的，
       所有 var(--csh-*) 引用会在下一次绘制自动重算，无需重建 DOM。 */
    function setSkin(name) {
        if (!has(name)) return false;
        active = name;
        inject(name);
        save(name);
        try { document.documentElement.setAttribute("data-csh-skin", name); } catch (e) {}
        /* 广播皮肤变更给所有游戏 iframe（csh_page.js 监听后重注入 chrome 变量） */
        try { if (typeof window !== "undefined" && window.postMessage) window.postMessage({ __csh: "csh-skin-change", skin: name }, "*"); } catch (e) {}
        return true;
    }
    function currentSkin() { return active; }
    function skinList() {
        var out = [];
        for (var k in SKINS) if (SKINS.hasOwnProperty(k)) out.push({ key: k, label: SKINS[k].label });
        return out;
    }

    active = load();
    inject(active);
    try { document.documentElement.setAttribute("data-csh-skin", active); } catch (e0) {}

    /* 兜底：若 import 过早（document.head 尚未就绪），DOM 就绪后再补一次。
       CSS 变量是惰性解析的，补注入后所有 var(--csh-*) 引用会自动重算。 */
    try {
        if (typeof document !== "undefined" && document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", function () {
                if (!document.getElementById("csh-theme-tokens")) inject(active);
            }, false);
        }
    } catch (e) {}

    lib.cshTheme = {
        SKINS: SKINS,
        COLORS: COLORS,
        DEFAULT_SKIN: DEFAULT_SKIN,
        cssText: cssText,
        inject: inject,
        setSkin: setSkin,
        currentSkin: currentSkin,
        skinList: skinList,
        gameChrome: gameChrome,
        hex: function (name) { var c = COLORS[name]; return c ? c.hex : null; },
        rgb: function (name) { var c = COLORS[name]; return c ? c.rgb : null; },
    };
})();
