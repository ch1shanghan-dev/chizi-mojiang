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
    "sgs": {
        "label": "三国杀 · 木纹鎏金",
        "colors": {
            "bg": {
                "hex": "#F1E6D1",
                "rgb": "241,230,209"
            },
            "bgDeep": {
                "hex": "#0B0805",
                "rgb": "11,8,5"
            },
            "inkPlate": {
                "hex": "#0E0B07",
                "rgb": "13,11,7"
            },
            "accentInk": {
                "hex": "#141008",
                "rgb": "20,16,8"
            },
            "colorInk": {
                "hex": "#141008",
                "rgb": "20,16,8"
            },
            "fg": {
                "hex": "#30281F",
                "rgb": "48,40,31"
            },
            "accent": {
                "hex": "#E0A93B",
                "rgb": "224,169,59"
            },
            "accentDark": {
                "hex": "#C08A24",
                "rgb": "192,138,36"
            },
            "gray": {
                "hex": "#D2C4AC",
                "rgb": "210,196,172"
            },
            "graySoft": {
                "hex": "#BAAB92",
                "rgb": "186,171,146"
            },
            "blue": {
                "hex": "#A7C9E1",
                "rgb": "167,201,225"
            },
            "light": {
                "hex": "#3B3125",
                "rgb": "59,49,37"
            },
            "paper": {
                "hex": "#221D17",
                "rgb": "34,29,23"
            },
            "paper2": {
                "hex": "#191511",
                "rgb": "25,21,17"
            },
            "red": {
                "hex": "#FFB2A5",
                "rgb": "255,178,165"
            },
            "green": {
                "hex": "#B7D4A3",
                "rgb": "183,212,163"
            }
        }
    },
    "warm": {
        "label": "暖宣 · 护眼",
        "colors": {
            "bg": {
                "hex": "#302B24",
                "rgb": "48,43,36"
            },
            "bgDeep": {
                "hex": "#100E0B",
                "rgb": "16,14,11"
            },
            "inkPlate": {
                "hex": "#18181B",
                "rgb": "24,24,27"
            },
            "accentInk": {
                "hex": "#18181B",
                "rgb": "24,24,27"
            },
            "colorInk": {
                "hex": "#FFFFFF",
                "rgb": "255,255,255"
            },
            "fg": {
                "hex": "#F8F2E8",
                "rgb": "248,242,232"
            },
            "accent": {
                "hex": "#D8B76C",
                "rgb": "216,183,108"
            },
            "accentDark": {
                "hex": "#B38F43",
                "rgb": "179,143,67"
            },
            "gray": {
                "hex": "#5F584D",
                "rgb": "95,88,77"
            },
            "graySoft": {
                "hex": "#655B4A",
                "rgb": "101,91,74"
            },
            "blue": {
                "hex": "#2F5C8F",
                "rgb": "47,92,143"
            },
            "light": {
                "hex": "#F3EADC",
                "rgb": "243,234,220"
            },
            "paper": {
                "hex": "#EDE4D4",
                "rgb": "237,228,212"
            },
            "paper2": {
                "hex": "#E4D8C5",
                "rgb": "228,216,197"
            },
            "red": {
                "hex": "#AB382C",
                "rgb": "171,56,44"
            },
            "green": {
                "hex": "#2F6B52",
                "rgb": "47,107,82"
            }
        }
    },
    "paper": {
        "label": "纸白 · 原版",
        "colors": {
            "bg": {
                "hex": "#26322D",
                "rgb": "38,50,45"
            },
            "bgDeep": {
                "hex": "#101012",
                "rgb": "16,16,18"
            },
            "inkPlate": {
                "hex": "#18181B",
                "rgb": "24,24,27"
            },
            "accentInk": {
                "hex": "#18181B",
                "rgb": "24,24,27"
            },
            "colorInk": {
                "hex": "#FFFFFF",
                "rgb": "255,255,255"
            },
            "fg": {
                "hex": "#FAF8F2",
                "rgb": "250,248,242"
            },
            "accent": {
                "hex": "#D1AB5D",
                "rgb": "209,171,93"
            },
            "accentDark": {
                "hex": "#AF873D",
                "rgb": "175,135,61"
            },
            "gray": {
                "hex": "#515E5A",
                "rgb": "81,94,90"
            },
            "graySoft": {
                "hex": "#5E6965",
                "rgb": "94,105,101"
            },
            "blue": {
                "hex": "#2255B8",
                "rgb": "34,85,184"
            },
            "light": {
                "hex": "#F5F1E8",
                "rgb": "245,241,232"
            },
            "paper": {
                "hex": "#EFEAE0",
                "rgb": "239,234,224"
            },
            "paper2": {
                "hex": "#E5E0D5",
                "rgb": "229,224,213"
            },
            "red": {
                "hex": "#CC3A2E",
                "rgb": "204,58,46"
            },
            "green": {
                "hex": "#1B6B4F",
                "rgb": "27,107,79"
            }
        }
    },
    "night": {
        "label": "夜间 · 低亮",
        "colors": {
            "bg": {
                "hex": "#E5EBF4",
                "rgb": "229,235,244"
            },
            "bgDeep": {
                "hex": "#080A0D",
                "rgb": "8,10,13"
            },
            "inkPlate": {
                "hex": "#0A0C10",
                "rgb": "10,12,16"
            },
            "accentInk": {
                "hex": "#0E1116",
                "rgb": "14,17,22"
            },
            "colorInk": {
                "hex": "#0E1116",
                "rgb": "14,17,22"
            },
            "fg": {
                "hex": "#222C3A",
                "rgb": "34,44,58"
            },
            "accent": {
                "hex": "#DFBD7B",
                "rgb": "223,189,123"
            },
            "accentDark": {
                "hex": "#C6A25D",
                "rgb": "198,162,93"
            },
            "gray": {
                "hex": "#C6D2E2",
                "rgb": "198,210,226"
            },
            "graySoft": {
                "hex": "#ACBDD4",
                "rgb": "172,189,212"
            },
            "blue": {
                "hex": "#B0D1FF",
                "rgb": "176,209,255"
            },
            "light": {
                "hex": "#2B3645",
                "rgb": "43,54,69"
            },
            "paper": {
                "hex": "#151E2B",
                "rgb": "21,30,43"
            },
            "paper2": {
                "hex": "#101825",
                "rgb": "16,24,37"
            },
            "red": {
                "hex": "#FFB4A8",
                "rgb": "255,180,168"
            },
            "green": {
                "hex": "#A4D3BC",
                "rgb": "164,211,188"
            }
        }
    },
    "celadon": {
        "label": "青瓷 · 水墨",
        "colors": {
            "bg": {
                "hex": "#213C34",
                "rgb": "33,60,52"
            },
            "bgDeep": {
                "hex": "#0D1412",
                "rgb": "13,20,18"
            },
            "inkPlate": {
                "hex": "#0A1210",
                "rgb": "10,18,16"
            },
            "accentInk": {
                "hex": "#14201D",
                "rgb": "20,32,29"
            },
            "colorInk": {
                "hex": "#FFFFFF",
                "rgb": "255,255,255"
            },
            "fg": {
                "hex": "#EFF5F0",
                "rgb": "239,245,240"
            },
            "accent": {
                "hex": "#76A795",
                "rgb": "118,167,149"
            },
            "accentDark": {
                "hex": "#598C78",
                "rgb": "89,140,120"
            },
            "gray": {
                "hex": "#496258",
                "rgb": "73,98,88"
            },
            "graySoft": {
                "hex": "#526E63",
                "rgb": "82,110,99"
            },
            "blue": {
                "hex": "#2F5D7A",
                "rgb": "47,93,122"
            },
            "light": {
                "hex": "#E6F0E9",
                "rgb": "230,240,233"
            },
            "paper": {
                "hex": "#DDE9E1",
                "rgb": "221,233,225"
            },
            "paper2": {
                "hex": "#D1DED5",
                "rgb": "209,222,213"
            },
            "red": {
                "hex": "#A14037",
                "rgb": "161,64,55"
            },
            "green": {
                "hex": "#2F6B52",
                "rgb": "47,107,82"
            }
        }
    },
    "gold": {
        "label": "鎏金黑 · 同游戏",
        "colors": {
            "bg": {
                "hex": "#F6EDDA",
                "rgb": "246,237,218"
            },
            "bgDeep": {
                "hex": "#060504",
                "rgb": "6,5,4"
            },
            "inkPlate": {
                "hex": "#080604",
                "rgb": "8,6,4"
            },
            "accentInk": {
                "hex": "#120E06",
                "rgb": "18,14,6"
            },
            "colorInk": {
                "hex": "#120E06",
                "rgb": "18,14,6"
            },
            "fg": {
                "hex": "#2A261E",
                "rgb": "42,38,30"
            },
            "accent": {
                "hex": "#D8B46A",
                "rgb": "216,180,106"
            },
            "accentDark": {
                "hex": "#C29A4E",
                "rgb": "194,154,78"
            },
            "gray": {
                "hex": "#D8CFB8",
                "rgb": "216,207,184"
            },
            "graySoft": {
                "hex": "#C1B79B",
                "rgb": "193,183,155"
            },
            "blue": {
                "hex": "#AACBE5",
                "rgb": "170,203,229"
            },
            "light": {
                "hex": "#343026",
                "rgb": "52,48,38"
            },
            "paper": {
                "hex": "#181711",
                "rgb": "24,23,17"
            },
            "paper2": {
                "hex": "#12120E",
                "rgb": "18,18,14"
            },
            "red": {
                "hex": "#FFAAA0",
                "rgb": "255,170,160"
            },
            "green": {
                "hex": "#AED7BA",
                "rgb": "174,215,186"
            }
        }
    }
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
        /* 【2026-10-20 · 字号标尺】宿主文档 UI 的唯一字号真源。
           --csh-lfs-* 是历史收编档：与旧裸字号同值（渲染零变化），
           同档多值待实机测量后并档，并档只改这里一处。
           用法一律 var(--csh-lfs-md,13px) 带同值兜底——即便注入失败也不变形。
           门禁 E54 拦新增裸 font-size:px。
           注意：不要进 gameChrome——游戏页用自己的 --pfs-* 页内标尺，互不污染。 */
        var LFS = [
            ["micro", "10px"], ["micro2", "10.5px"],
            ["cap", "11px"], ["cap2", "11.5px"],
            ["sm", "12px"], ["sm2", "12.5px"],
            ["md", "13px"], ["md2", "13.5px"],
            ["lg", "14px"], ["lg2", "15px"],
            ["xl", "16px"], ["xl2", "17px"], ["xl3", "18px"], ["xl4", "19px"],
            ["title", "20px"], ["2xl", "22px"], ["display", "24px"], ["lead", "26px"], ["3xl", "28px"], ["3xl2", "30px"], ["4xl", "34px"]
        ];
        for (var fi = 0; fi < LFS.length; fi++) lines.push("    --csh-lfs-" + LFS[fi][0] + ": " + LFS[fi][1] + ";");
        /* 【2026-10-20 · 层级表】与皮肤无关，是全扩展**唯一**的浮层层级真值。
           以前 22 处裸魔数（2147483000/2999/3050…）散在 7 个文件里，
           两个浮层同时打开时谁盖谁纯看数字大小和书写顺序 —— 叠层错乱的根源。
           现在只允许 var(--csh-z-*)，门禁会拦住新写的裸 2147xxxx。 */
        var Z = [
            ["dock", 25],          /* 壳的悬浮控制组（游戏页内） */
            ["sheet", 200],        /* 页面内的详情层 */
            ["tip", 2147482000],   /* 引用气泡 / 轻提示（低于一切遮罩） */
            ["ssfx", 1000],        /* 对局内技能特效层（刻意高于 sceneTop 的雾效） */
            ["overlay", 2147482100], /* 轻量全屏浮层（互动层，旧 1000002/1000004 档） */
            ["winrate", 2147482150], /* 胜负统计浮层（旧 1000003 档） */
            ["float", 2147482250],   /* 调试悬浮球（旧 999990 档；面板/壳开着时隐藏） */
            ["backdrop", 2147482999], /* 大面板暗幕（调试面板遮罩） */
            ["panel", 2147483000],  /* 面板主体（商店/兑换暗幕+面板——暗幕用此档以显式压过调试遮罩） */
            ["shell", 2147483025],  /* 游戏壳（2026-10-20 下午修：旧 1000020 档 → 收编时误设 2200，
                                      低于调试遮罩 2999，从池子世界点生涯大厅会被调试面板盖住；
                                      壳从调试面板内打开，必须显式高于 backdrop/panel） */
            ["modal", 2147483040],  /* 确认框：必须高于 shell（壳内页面——成就页重置——的确认框
                                      历史上一直被壳盖住，旧值 1000010<1000020 即如此，本轮同修） */
            ["toast", 2147483050],  /* 提示必须在任何面板与壳之上 */
            ["top", 2147483080]     /* 最高优先（强制确认、全屏接管、系统级） */
        ];
        for (var zi = 0; zi < Z.length; zi++) lines.push("    --csh-z-" + Z[zi][0] + ": " + Z[zi][1] + ";");
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
        function luminance(hex) { var a = hex.replace("#", "").match(/../g).map(function(v){var n=parseInt(v,16)/255;return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4);});return a[0]*.2126+a[1]*.7152+a[2]*.0722; }
        function contrast(a,b) { var x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
        var light = luminance(h("paper")) > .4;
        var accent = h("accent");
        if (contrast(accent,h("paper2")) < 4.5) accent = contrast(h("accentDark"),h("paper2")) >= 4.5 ? h("accentDark") : h("bg");
        var chrome = [
            "--ink-0:"+h("paper")+";", "--ink-1:"+h("paper2")+";", "--ink-2:"+h("fg")+";", "--ink-3:"+h("light")+";",
            "--gold:"+accent+";", "--gold-hi:"+accent+";", "--gold-soft:rgba("+g("accent")+",.55);", "--gold-line:rgba("+g("bg")+",.24);", "--gold-fill:rgba("+g("accent")+",.10);",
            "--text:"+h("bg")+";", "--text-dim:"+h("gray")+";", "--danger:"+h("red")+";", "--ok:"+h("green")+";", "--warn:"+h("red")+";", "--line:rgba("+g("bg")+",.20);"
        ];
        var portrait = [
            "--bg:"+h("paper2")+";", "--bg2:"+h("paper")+";", "--panel:"+h("fg")+";", "--panel2:"+h("light")+";",
            "--ink:"+h("bg")+";", "--ink-dim:"+h("gray")+";", "--ink-faint:"+h("graySoft")+";", "--gold:"+accent+";", "--gold-2:"+h("accentDark")+";",
            "--line:rgba("+g("bg")+",.24);", "--line-2:rgba("+g("bg")+",.16);", "--ok:"+h("green")+";", "--warn:"+h("red")+";", "--danger:"+h("red")+";"
        ];
        var lines = ["--csh-page-accent:"+h("accent")+";", "--csh-page-accent-ink:"+h("accentInk")+";"];
        var Z = [
            ["dock", 25],          /* 壳的悬浮控制组（游戏页内） */
            ["sheet", 200],        /* 页面内的详情层 */
            ["tip", 2147482000],   /* 引用气泡 / 轻提示（低于一切遮罩） */
            ["ssfx", 1000],        /* 对局内技能特效层（刻意高于 sceneTop 的雾效） */
            ["overlay", 2147482100], /* 轻量全屏浮层（互动层，旧 1000002/1000004 档） */
            ["winrate", 2147482150], /* 胜负统计浮层（旧 1000003 档） */
            ["float", 2147482250],   /* 调试悬浮球（旧 999990 档；面板/壳开着时隐藏） */
            ["backdrop", 2147482999], /* 大面板暗幕（调试面板遮罩） */
            ["panel", 2147483000],  /* 面板主体（商店/兑换暗幕+面板——暗幕用此档以显式压过调试遮罩） */
            ["shell", 2147483025],  /* 游戏壳（2026-10-20 下午修：旧 1000020 档 → 收编时误设 2200，
                                      低于调试遮罩 2999，从池子世界点生涯大厅会被调试面板盖住；
                                      壳从调试面板内打开，必须显式高于 backdrop/panel） */
            ["modal", 2147483040],  /* 确认框：必须高于 shell（壳内页面——成就页重置——的确认框
                                      历史上一直被壳盖住，旧值 1000010<1000020 即如此，本轮同修） */
            ["toast", 2147483050],  /* 提示必须在任何面板与壳之上 */
            ["top", 2147483080]     /* 最高优先（强制确认、全屏接管、系统级） */
        ];
        for (var zi = 0; zi < Z.length; zi++) lines.push("--csh-z-" + Z[zi][0] + ":" + Z[zi][1] + ";");
        var chromeScope=':root[data-csh-palette="chrome"]', portraitScope=':root[data-csh-palette="portrait"]';
        return ":root{"+lines.join("\n")+"}\n"
            +chromeScope+","+chromeScope+" body{"+chrome.join("\n")+"}\n"
            +portraitScope+","+portraitScope+" body{"+portrait.join("\n")+"}\n"
            +":root[data-csh-palette]{color-scheme:"+(light?"light":"dark")+";}\n"
            +chromeScope+" #view-game{--ink-0:#0B0A08;--ink-1:#15110C;--ink-2:#1E1811;--ink-3:#282219;--text:#ECE5D6;--text-dim:#C8BEA9;--gold:#D8B46A;--gold-hi:#F4DFA8;--gold-soft:rgba(216,180,106,.55);--gold-line:rgba(216,180,106,.28);--gold-fill:rgba(216,180,106,.07);--danger:#D66E7C;--ok:#7FD8C4;color:var(--text);}\n"
            +portraitScope+" .affbtn{color:var(--ink);}"+portraitScope+" .affbtn.gold{color:var(--gold);}\n"
            +(light?portraitScope+" .afftitle{background:none;-webkit-text-fill-color:currentColor;color:var(--ink);}\n":"")
            +chromeScope+" .felt{--text:#F1EBDD;--text-dim:#CFD5CF;--gold:#D8BD7A;--gold-hi:#ECD394;color:var(--text);}\n"
            +chromeScope+" .ach .aclaim:not(.got),"+portraitScope+" .primary,"+portraitScope+" .pinbtn.on{background:var(--csh-page-accent);color:var(--csh-page-accent-ink);}\n"
            +chromeScope+" .hint-tag,"+chromeScope+" .sdot.done{background:var(--csh-page-accent);color:var(--csh-page-accent-ink);}";
    }

    /* —— 作用域皮肤覆写（2026-10-07 · T2）：为单个浮层/页面提供「局部皮肤」——
       输出 `selector { --csh-*: ...; }` 覆写块，挂独立 style 节点（幂等，可指定 id）。
       用途：资料卡双风格（Dossier 两套外观**并存于同一全局皮肤下**）——
       消费方照常 var(--csh-*) 引用，覆写后该作用域内自动换装，全局不动。
       注意与 setSkin 的区别：setSkin 是全局换肤（:root），本函数只覆写选择器作用域。 */
    function scopeStyle(name, scopeSelector, styleId) {
        try {
            if (typeof document === "undefined" || !has(name) || !scopeSelector) return false;
            var set = SKINS[name].colors;
            var lines = [];
            for (var k in set) {
                if (!set.hasOwnProperty(k)) continue;
                var c = set[k];
                lines.push("  --csh-" + toKebab(k) + ": " + c.hex + ";");
                lines.push("  --csh-" + toKebab(k) + "-rgb: " + c.rgb + ";");
            }
            var id = styleId || ("csh-theme-scope-" + name);
            var el = document.getElementById(id);
            if (!el) {
                el = document.createElement("style");
                el.id = id;
                el.setAttribute("data-csh", "theme-scope");
                (document.head || document.documentElement).appendChild(el);
            }
            el.textContent = scopeSelector + " {\n" + lines.join("\n") + "\n}";
            return true;
        } catch (e) {
            return false;
        }
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
        try { var frame=document.getElementById("csh-shell-frame");if(frame&&frame.contentWindow)frame.contentWindow.postMessage({__csh:"csh-skin-change",skin:name},"*"); } catch (eFrame) {}
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
        scopeStyle: scopeStyle,
        setSkin: setSkin,
        currentSkin: currentSkin,
        skinList: skinList,
        gameChrome: gameChrome,
        hex: function (name) { var c = COLORS[name]; return c ? c.hex : null; },
        rgb: function (name) { var c = COLORS[name]; return c ? c.rgb : null; },
    };
})();
