import { lib, game, ui, get, ai, _status } from "../../../noname.js";

export function cshPrecontent() {
    // 联机兼容：扩展声明 connect:true + package.character.connect:true
    // 由引擎在 connect 模式下正常加载 content 与武将包，并注册进 lib.connectCharacterPack
    // —— 前缀「池」：precontent 尽早注册，避免选将界面读不到 namePrefix / _prefix ——
    (function () {
        try {
            if (!lib.translate) lib.translate = {};
            // namePrefix 样式（兼容 Map / 普通对象 / set 方法）
            if (!lib.namePrefix) {
                try { lib.namePrefix = new Map(); } catch (e0) { lib.namePrefix = {}; }
            }
            var setPrefix = function (key, info) {
                try {
                    if (typeof lib.namePrefix.set === "function") lib.namePrefix.set(key, info);
                    else if (lib.namePrefix instanceof Map) lib.namePrefix.set(key, info);
                    else lib.namePrefix[key] = info;
                } catch (e1) {}
            };
            setPrefix("池", { color: "#6ec9b8", nature: "watermm", showName: "池" });
            // 从已合并的 translate / character 表补全 csh_*_prefix
            var ensure = function (id) {
                if (!id || id.indexOf("csh_") !== 0) return;
                var pk = id + "_prefix";
                if (!lib.translate[pk]) lib.translate[pk] = "池";
            };
            if (lib.character) {
                for (var cid in lib.character) ensure(cid);
            }
            if (lib.characterPack) {
                for (var packName in lib.characterPack) {
                    var pack = lib.characterPack[packName];
                    if (!pack) continue;
                    for (var cid2 in pack) ensure(cid2);
                }
            }
            for (var k in lib.translate) {
                if (k.indexOf("csh_") === 0 && k.length > 7 && k.slice(-7) === "_prefix") {
                    if (!lib.translate[k]) lib.translate[k] = "池";
                } else if (k.indexOf("csh_") === 0 && k.indexOf("_") > 3 && !/_info$|_prefix$|_ab$/.test(k)) {
                    // 武将名 translate 键本身：确保对应 _prefix 存在
                    if (lib.character && lib.character[k]) ensure(k);
                }
            }
            // CSS 前缀样式
            if (typeof document !== "undefined" && !document.getElementById("csh-prefix-style")) {
                var st = document.createElement("style");
                st.id = "csh-prefix-style";
                st.textContent = [
                    '.player .name .prefix, .character .name .prefix, .character.showplayer .name span.prefix, div.prefix',
                    '{ font-family: "STKaiti","KaiTi","楷体",serif !important; font-weight: bold !important; letter-spacing: 1px !important; }',
                    '.prefix[data-prefix="池"], .name span[data-prefix="池"], span.prefix-池',
                    '{ color: #6ec9b8 !important; text-shadow: 0 0 6px rgba(80,200,180,.55), 0 1px 2px #000 !important; }',
                ].join("\n");
                (document.head || document.documentElement).appendChild(st);
            }
            // 扩展设置里两个面板入口：做成「可按的金色按钮」，而不是一行普通文字。
            // 引擎对 clear:true 的条目渲染为 .config.pointerspan > span，这里把内层做成居中的胶囊按钮；
            // 内容长度 >= 15 时引擎会把该行 height 置为 auto，所以胶囊不会被 20px 行高裁掉。
            if (typeof document !== "undefined" && !document.getElementById("csh-cfgbtn-style")) {
                var st2 = document.createElement("style");
                st2.id = "csh-cfgbtn-style";
                st2.textContent = [
                    // 铜金浮雕按钮：底两层渐变（顶部受光 + 竖向铜金），四角用 background 画中式角饰，
                    // 而不是 ◆ 之类的符号图标（用户明确不要菱形）。角饰走伪元素，不参与排版、不挡字。
                    '.csh-cfg-btn{position:relative!important;display:block!important;',
                    'width:-moz-fit-content!important;width:fit-content!important;',
                    'max-width:100%!important;box-sizing:border-box!important;',
                    'margin:6px auto!important;padding:9px 28px!important;',
                    'border:1px solid #c9a24a!important;border-radius:7px!important;',
                    'background:linear-gradient(180deg,rgba(255,240,200,.26),rgba(255,240,200,0) 44%),',
                    'linear-gradient(180deg,#5d4a22 0%,#3b3014 50%,#231b0b 100%)!important;',
                    'box-shadow:inset 0 0 0 1px rgba(255,226,160,.16),inset 0 1px 0 rgba(255,244,214,.3),',
                    'inset 0 -1px 0 rgba(0,0,0,.55),0 2px 7px rgba(0,0,0,.6),0 0 0 1px rgba(0,0,0,.5)!important;',
                    'color:#ffeec2!important;font-size:16px!important;font-weight:bold!important;',
                    'letter-spacing:2px!important;text-indent:2px!important;line-height:1.25!important;',
                    'text-align:center!important;',
                    'text-shadow:0 1px 2px rgba(0,0,0,.9),0 0 9px rgba(255,203,110,.4)!important;',
                    'transition:background .18s ease,border-color .18s ease,box-shadow .18s ease,transform .08s ease,color .18s ease!important;}',
                    '.csh-cfg-btn::before,.csh-cfg-btn::after{content:""!important;position:absolute!important;',
                    'left:5px!important;right:5px!important;height:7px!important;pointer-events:none!important;opacity:.75!important;',
                    'background-image:linear-gradient(#f0d99a,#f0d99a),linear-gradient(#f0d99a,#f0d99a),',
                    'linear-gradient(#f0d99a,#f0d99a),linear-gradient(#f0d99a,#f0d99a)!important;',
                    'background-size:8px 1px,1px 8px,8px 1px,1px 8px!important;background-repeat:no-repeat!important;}',
                    '.csh-cfg-btn::before{top:4px!important;background-position:left top,left top,right top,right top!important;}',
                    '.csh-cfg-btn::after{bottom:4px!important;background-position:left bottom,left bottom,right bottom,right bottom!important;}',
                    '.config.pointerspan:hover .csh-cfg-btn{border-color:#f4dfa8!important;color:#fff8e0!important;',
                    'background:linear-gradient(180deg,rgba(255,244,214,.34),rgba(255,244,214,0) 46%),',
                    'linear-gradient(180deg,#6f5a2a 0%,#483a1a 50%,#2b2210 100%)!important;',
                    'box-shadow:inset 0 0 0 1px rgba(255,236,180,.26),inset 0 1px 0 rgba(255,248,224,.38),',
                    'inset 0 -1px 0 rgba(0,0,0,.55),0 3px 10px rgba(0,0,0,.62),0 0 12px rgba(240,212,136,.42)!important;',
                    'transform:translateY(-1px)!important;}',
                    '.config.pointerspan:active .csh-cfg-btn{transform:translateY(1px)!important;',
                    'box-shadow:inset 0 0 0 1px rgba(255,226,160,.16),0 1px 3px rgba(0,0,0,.6)!important;}',
                    '.csh-cfg-sep{display:block!important;height:20px!important;line-height:20px!important;text-align:center!important;',
                    'color:#6f6757!important;font-size:11px!important;letter-spacing:3px!important;}',
                    // 引擎的 nopointer 只去掉鼠标手型，仍会给 clear 项挂 clickToggle（menu/index.js:207、:292）。
                    // 分隔条本身不该有点击态，这里直接断掉指针事件；不支持 :has() 的宿主会忽略该条，行为退回原样。
                    '.config:has(>span>.csh-cfg-sep){pointer-events:none!important;}',
                ].join("\n");
                (document.head || document.documentElement).appendChild(st2);
            }
        } catch (ePrefix) {
            try { console.log("[池前缀-precontent]", ePrefix); } catch (e2) {}
        }
    })();
    // —— 十周年UI接入兼容：装了十周年UI就注册「池」前缀角标，没装则静默跳过（单机联机均生效）——
    // 角标样式 chi 的图片在 image/mark_chi.png（22x34，可自行替换美术）；
    // 卡牌皮肤待 image/card-skins/<风格>/ 资源就绪后，在 cardSkins 里按官方API补充即可。
    (function () {
        try {
            if (typeof window !== "undefined" && typeof window.setupDecadeUICompat === "function") {
                window.setupDecadeUICompat({
                    extensionName: "池子魔将",
                    prefixMarks: { "池": "chi" },
                    markStyles: { chi: "mark_chi.png" },
                    // cardSkins: [{ skinKey: "decade", cardNames: ["csh_qiangbao"] }],
                    cardSkins: [],
                    debug: false,
                });
            }
        } catch (eDui) {
            try { console.log("[池子魔将] 十周年UI接入异常", eDui); } catch (e2) {}
        }
    })();
    // —— 拆包加载：胜负统计 / 池子调试（减小 extension.js）——
    // csh_winrate / csh_debug 已改为 ES Module，由顶部 import 加载。
    // 入口挂载在 csh_debug.js 内部（arenaReady + 浮动按钮 + F1）。
    // 此处仅做存活检测与提示，避免“完全无反应”时无法判断是否加载成功。
    (function () {
        // 就绪检测日志仅开发者开关打开时输出（普通玩家控制台保持干净）；
        // lib.cshDebugMenu 由 csh_debug.js 在启动时挂载，缺失时经 arenaReady 兜底，不影响功能。
        try { if (!lib.config.extension_池子魔将_csh_dev_log) return; } catch (eDevLog) { return; }
        [500, 2000, 5000].forEach(function (ms) {
            setTimeout(function () {
                try {
                    if (lib.cshDebugMenu && typeof lib.cshDebugMenu.open === "function") {
                        console.log("[池子魔将] 池子调试模块已就绪 t=" + ms);
                    } else {
                        console.warn("[池子魔将] 池子调试模块未就绪 t=" + ms + "（检查 csh_debug.js 是否加载失败）");
                    }
                } catch (e) {
                    console.error("[池子魔将] 调试模块检测异常", e);
                }
            }, ms);
        });
    })();

    // === 手游播报特效引擎（直接顶掉原毛笔字播报；资源随扩展一起加载）===
    // ★ 执行时序（踩过坑，务必注意）：
    //   precontent 先于 content 运行，而 lib.cshShoushaFx 是在 content 里才建立的。
    //   早期版本在这里直接改 lib.cshShoushaFx.play，运行时 cshShoushaFx 还是 undefined，
    //   钩子被静默跳过且再也不会重试 —— 表现就是「播报只有语音、没有任何特效」。
    //   现在改成：这里只安装「钩子安装器」（幂等，可重复调用），
    //   由 content 末尾调用一次，再用 arenaReady + 定时重试兜底。
    (function () {
        try {
            // 手游位图资源根。声明在最前：下面的钩子安装器会用到，而它在 content 之前就会被调用。
            // 候选根：宿主把扩展放在别的根下时（懒人包 / 十周年 UI 改过 assetURL），
            // 第一个 404 会自动退到下一个候选；脚本与贴图共用最终命中的那个根。
            function _cshMfxBaseList() {
                var a = (typeof lib !== "undefined" && lib.assetURL) ? String(lib.assetURL) : "";
                var rel = "extension/池子魔将/mobilefx/";
                var out = [];
                if (lib._cshMfxBaseUsed) out.push(lib._cshMfxBaseUsed);
                if (a) out.push(a + rel);
                out.push(rel);
                if (a && a.charAt(a.length - 1) !== "/") out.push(a + "/" + rel);
                return out.filter(function (v, i) { return v && out.indexOf(v) === i; });
            }
            function _cshMfxBase() {
                return _cshMfxBaseList()[0];
            }
            lib._cshMfxBaseList = _cshMfxBaseList;
            if (!lib._cshMobileFxInstallHook) {
                lib._cshMobileFxInstallHook = function () {
                    try {
                        // 脚本还没到就现场补一次（自愈）：precontent 注入的 <script> 若被
                        // 宿主拦掉 / 加载慢，这里能再拉一次，不至于整局都没有画面。
                        if (!lib.cshMobileFx && typeof lib._cshMobileFxLoad === "function") {
                            try { lib._cshMobileFxLoad(); } catch (eLd) {}
                        }
                        // ★ 关键：cshMobileFx.js 是经典脚本，看不到模块作用域的 lib
                        // （window.lib 只在开发者模式下由 lib.cheat.i() 挂上），
                        // 它只能把自己挂到 window.cshMobileFx。这里补挂到真正的 lib 上，
                        // 否则 lib.cshMobileFx 永远是 undefined —— 表现就是
                        // 「播报只有语音、没有任何位图特效」。同时补一次 configure 拿贴图根。
                        if (!lib.cshMobileFx && typeof window !== "undefined" && window.cshMobileFx) {
                            lib.cshMobileFx = window.cshMobileFx;
                        }
                        if (lib.cshMobileFx && !lib.cshMobileFx._byKey
                            && typeof lib.cshMobileFx.configure === "function") {
                            try {
                                lib.cshMobileFx.configure(_cshMfxBase(),
                                    (typeof window !== "undefined" ? window.cshMobileFxData : null));
                            } catch (eCfg) {}
                        }
                        if (!lib.cshShoushaFx || typeof lib.cshShoushaFx.play !== "function") return false;
                        if (lib.cshShoushaFx._csh_mobile_hooked) return true;
                        var origPlay = lib.cshShoushaFx.play;
                        lib.cshShoushaFx._csh_mobile_hooked = true;
                        lib.cshShoushaFx.play = function (type, data) {
                            if (type === "diankuang" || type === "wanjun"
                                || type === "kill" || type === "recover") {
                                try {
                                    if (lib.cshMobileFx && typeof lib.cshMobileFx.play === "function") {
                                        lib.cshMobileFx.play(type, data);
                                    } else {
                                        console.log("[池子魔将] 手游播报特效未就绪，本次跳过"
                                            + "（检查 mobilefx 目录与 package.js 的 files 登记）");
                                    }
                                } catch (eMfxPlay) {
                                    console.log("[池子魔将] 手游播报特效异常", eMfxPlay);
                                }
                                return;
                            }
                            return origPlay.apply(this, arguments);
                        };
                        return true;
                    } catch (eHook) {
                        try { console.log("[池子魔将] 手游播报钩子安装失败", eHook); } catch (e5) {}
                        return false;
                    }
                };
            }
            lib._cshMobileFxInstallHook();

            // 加载位图资源：先数据（manifest.js）后引擎（cshMobileFx.js）。
            // 不用 lib.init.js：各版本签名不一致（1.11 是 (path, file, onLoad, onError)，
            // 旧版 / 懒人包 / 十周年 UI 是 (path, onLoad)），照旧写法会把回调当文件名拼进 URL，
            // 结果 404 静默失败。直接插 script 标签在各版本行为一致，最稳。
            // 幂等、可重复调用：钩子安装器发现脚本缺席时会再调一次来自愈。
            var _mfxBusy = false;
            lib._cshMobileFxLoad = function () {
                if (typeof window === "undefined") return false;
                if (window.cshMobileFx) {                        // 已就绪：只补挂 + 配置
                    if (!lib.cshMobileFx) lib.cshMobileFx = window.cshMobileFx;
                    try {
                        if (lib.cshMobileFx && !lib.cshMobileFx._byKey
                            && typeof lib.cshMobileFx.configure === "function") {
                            lib.cshMobileFx.configure(_cshMfxBase(), window.cshMobileFxData);
                        }
                    } catch (eC0) {}
                    return true;
                }
                if (_mfxBusy) return false;
                _mfxBusy = true;
                var _mfxLoad = function (file, done) {
                    var bases = _cshMfxBaseList(), bi = 0;
                    var tryNext = function () {
                        if (bi >= bases.length) {
                            console.log("[池子魔将] 手游特效资源加载失败: " + file
                                + "（已尝试 " + bases.join(" / ") + "）");
                            if (typeof done === "function") done(false);
                            return;
                        }
                        var url = bases[bi++] + file;
                        try {
                            var s = document.createElement("script");
                            s.src = url;
                            s.async = false;
                            s.onload = function () {
                                // 记住真正命中的根，贴图也用它，避免脚本与图片各走一条路
                                lib._cshMfxBaseUsed = url.slice(0, url.length - file.length);
                                if (typeof done === "function") done(true);
                            };
                            s.onerror = function () {
                                try { if (s.parentNode) s.parentNode.removeChild(s); } catch (eR) {}
                                tryNext();
                            };
                            (document.head || document.documentElement).appendChild(s);
                        } catch (e2) { tryNext(); }
                    };
                    tryNext();
                };
                _mfxLoad("manifest.js", function (okData) {           // 先有数据
                    if (!okData) { _mfxBusy = false; return; }
                    _mfxLoad("cshMobileFx.js", function (okEngine) {  // 再有引擎
                        _mfxBusy = false;
                        if (!okEngine) return;
                        try {
                            // 引擎是经典脚本，只能挂到 window；这里（ESM）补挂到 lib 并喂资源根
                            if (!lib.cshMobileFx && window.cshMobileFx) lib.cshMobileFx = window.cshMobileFx;
                            if (lib.cshMobileFx) {
                                lib.cshMobileFx.configure(_cshMfxBase(), window.cshMobileFxData);
                            }
                            // 资源到位后立刻再试一次钩子（content 可能已经跑过了）
                            if (typeof lib._cshMobileFxInstallHook === "function") lib._cshMobileFxInstallHook();
                        } catch (e3) {}
                    });
                });
                return true;
            };
            if (!lib._csh_mobilefx_ready) {
                lib._csh_mobilefx_ready = true;
                lib._cshMobileFxLoad();
            }
            // 兜底重试：content 建立的 cshShoushaFx 时机随加载路径而变
            [0, 1500, 4000].forEach(function (ms) {
                setTimeout(function () {
                    try { lib._cshMobileFxInstallHook(); } catch (e7) {}
                }, ms);
            });
            try {
                if (lib.arenaReady && typeof lib.arenaReady.push === "function") {
                    lib.arenaReady.push(function () {
                        try { lib._cshMobileFxInstallHook(); } catch (e8) {}
                    });
                }
            } catch (e9) {}
        } catch (eMfxInit) {
            try { console.log("[池子魔将] 手游特效初始化异常", eMfxInit); } catch (e4) {}
        }
    })();

}
