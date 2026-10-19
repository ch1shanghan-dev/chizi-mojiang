import { lib, game, ui, get, ai, _status } from "../../../noname.js";
import { injectCshTitlesStyle } from "../core/csh_titles_style.js";

export function cshPrecontent() {
    // 称号版式系统 CSS（2026-10-08）：characterTitle 已改为 class 化短标签，样式全部由本表提供。
    try { injectCshTitlesStyle(); } catch (eTitlesCss) {}
    // 【2026-10-05】「开发者日志」设置项已按需求移除；历史上开启过的存档一并复位，
    // 相关 console 守卫（main/content.js 等）读不到该键后自然静默。
    try { if (lib.config.extension_池子魔将_csh_dev_log) game.saveConfig("extension_池子魔将_csh_dev_log", false); } catch (eDevLogReset) {}
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
            /* 童：童渊（2026-10-08 并入自独立扩展 extension/童渊）。必须显式注册——
               下面的 ensure 循环只补缺失的 csh_*_prefix 且一律填「池」，
               不先注册的话 csh_tongyuan_prefix 会被改成「池」。 */
            setPrefix("童", { showName: "童", color: "#c9a84c", nature: "soil" });
            if (!lib.translate.csh_tongyuan_prefix) lib.translate.csh_tongyuan_prefix = "童";
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
            // CSS 前缀样式（单点真源：池/星/昭/界/童；content.js 的同名副本 2026-10-08 已收敛到这里）
            if (typeof document !== "undefined" && !document.getElementById("csh-prefix-style")) {
                var st = document.createElement("style");
                st.id = "csh-prefix-style";
                st.textContent = [
                    '.player .name .prefix, .character .name .prefix, .character.showplayer .name span.prefix, div.prefix',
                    '{ font-family: "STKaiti","KaiTi","楷体",serif !important; font-weight: bold !important; letter-spacing: 1px !important; }',
                    '.prefix[data-prefix="池"], .name span[data-prefix="池"], span.prefix-池',
                    '{ color: #6ec9b8 !important; text-shadow: 0 0 6px rgba(80,200,180,.55), 0 1px 2px #000 !important; }',
                    '.prefix[data-prefix="星"], span.prefix-星',
                    '{ color: #7ec8e3 !important; text-shadow: 0 0 6px rgba(100,180,255,.5), 0 1px 2px #000 !important; }',
                    '.prefix[data-prefix="昭"], span.prefix-昭',
                    '{ color: #e8d5a3 !important; text-shadow: 0 0 6px rgba(220,190,100,.45), 0 1px 2px #000 !important; }',
                    '.prefix[data-prefix="界"], span.prefix-界',
                    '{ color: #c9a0e8 !important; text-shadow: 0 0 6px rgba(180,120,220,.5), 0 1px 2px #000 !important; }',
                    /* 童：鎏金楷体印字（并入自独立扩展童渊，样式原样保留） */
                    '.prefix[data-prefix="童"], .name span[data-prefix="童"], span.prefix-童, .player .name .prefix[data-prefix="童"]',
                    '{ font-family: "STKaiti","KaiTi","楷体","SimKai",serif !important; font-weight: 900 !important; letter-spacing: 2px !important;',
                    'background: linear-gradient(165deg, #e8d48b 0%, #c9a84c 40%, #8b6914 100%); -webkit-background-clip: text; background-clip: text;',
                    '-webkit-text-fill-color: transparent; color: transparent !important;',
                    'filter: drop-shadow(0 0 5px rgba(201,168,76,0.55)) drop-shadow(0 1px 1px rgba(0,0,0,0.9)); }',
                ].join("\n");
                (document.head || document.documentElement).appendChild(st);
            }
            /* 童渊专用表现（并入自独立扩展）：称号「蓬莱散人」呼吸 keyframes + 枪神装填光晕。
               原扩展里那两条 .markitem 选择器已删——该类名在本体/十周年UI 全仓不存在（死选择器）。 */
            if (typeof document !== "undefined" && !document.getElementById("csh-tongyuan-style")) {
                var stTy = document.createElement("style");
                stTy.id = "csh-tongyuan-style";
                stTy.textContent = [
                    "@keyframes cshPenglaiBreath {",
                    "0%,100% { box-shadow: 0 0 8px rgba(201,168,76,0.35), inset 0 0 12px rgba(255,240,200,0.08); }",
                    "50% { box-shadow: 0 0 16px rgba(201,168,76,0.6), inset 0 0 18px rgba(255,240,200,0.15); }",
                    "}",
                    "@keyframes cshTyCardGlow {",
                    "0% { box-shadow: 0 0 0 rgba(201,168,76,0); }",
                    "30% { box-shadow: 0 0 20px rgba(201,168,76,0.7), 0 0 40px rgba(180,140,40,0.3); }",
                    "100% { box-shadow: 0 0 0 rgba(201,168,76,0); }",
                    "}",
                    ".player.csh-tongyuan-glow .avatar,",
                    ".player.csh-tongyuan-glow .avatar2 {",
                    "animation: cshTyCardGlow 0.85s ease-out forwards;",
                    "}",
                ].join("\n");
                (document.head || document.documentElement).appendChild(stTy);
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
                    'color:#ffeec2!important;font-size:var(--csh-lfs-xl,16px)!important;font-weight:bold!important;',
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
                    '.csh-cfg-sep{display:block!important;height:22px!important;line-height:22px!important;text-align:center!important;',
                    'color:#e9b949!important;font-size:var(--csh-lfs-sm2,12.5px)!important;font-weight:700!important;letter-spacing:3px!important;',
                    'text-shadow:0 0 10px rgba(233,185,73,.4)!important;}',
                    // 引擎的 nopointer 只去掉鼠标手型，仍会给 clear 项挂 clickToggle（menu/index.js:207、:292）。
                    // 分隔条本身不该有点击态，这里直接断掉指针事件；不支持 :has() 的宿主会忽略该条，行为退回原样。
                    '.config:has(>span>.csh-cfg-sep){pointer-events:none!important;}',
                    /* 「删除此扩展」（引擎自绘，分隔条之后的最后一行）= 危险操作按钮化：
                       红框红字居中胶囊，悬停加深。分隔条之后仅此一行带纯文本 span
                       （「其他扩展」有自己的 .csh-cfg-btn 样式，不受影响）。 */
                    '.config:has(>span>.csh-cfg-sep)~.config:last-child>span{display:block!important;box-sizing:border-box!important;',
                    'width:min(74%,260px)!important;margin:6px auto 12px!important;padding:8px 0!important;text-align:center!important;',
                    'border-radius:9px!important;border:1px solid rgba(216,106,120,.45)!important;background:rgba(216,106,120,.10)!important;',
                    'color:#f2a9b4!important;font-size:var(--csh-lfs-sm2,12.5px)!important;font-weight:600!important;letter-spacing:2px!important;',
                    'transition:background .16s ease,color .16s ease,border-color .16s ease!important;}',
                    '.config:has(>span>.csh-cfg-sep)~.config:last-child:hover>span{background:rgba(216,106,120,.24)!important;',
                    'color:#ffd9df!important;border-color:rgba(230,120,140,.85)!important;}',
                ].join("\n");
                (document.head || document.documentElement).appendChild(st2);
            }
        } catch (ePrefix) {
            try { console.log("[池前缀-precontent]", ePrefix); } catch (e2) {}
        }
    })();
    // —— 十周年UI接入兼容：装了十周年UI就注册「池」前缀角标，没装则静默跳过（单机联机均生效）——
    // 角标样式 chi 的图片在 image/mark_chi.png（31x48，官方十周年UI 同规格，CSS 再缩到 22x34）；
    // 要换成别的字或重新生成：python tools/gen-mark.py 池 mark_chi.png
    // （该脚本从十周年UI 官方角标重建无字底版，用楷体按官方实测标尺合成字形）；
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
                    // —— 动态皮肤 ——
                    // 唯一常驻版本（基础版）不带动皮资源，一律传 null：
                    // 这里的 decadeUI 兼容层本身保留（前缀角标还要用），只是不注册 dynamicSkin。
                    // （历史：曾经三档分发，动皮档才把 main/dynamic-skins.js 的表传进来；
                    //   现在只保留那张表供 tools/check-dynamic-integrity.mjs 做资源审计。）
                    dynamicSkins: null,
                    debug: false,
                });
            }
        } catch (eDui) {
            try { console.log("[池子魔将] 十周年UI接入异常", eDui); } catch (e2) {}
        }
    })();
    // —— 【2026-10-05】联机手气卡：联机开局允许玩家更换初始手牌（设置里可选 1/2/3/5/7/10 次或关闭）——
    // 方案移植自懒人包（云中守望扩展）：不覆盖 gameDraw，而是注册全局规则技 _csh_swReplaceHandCards，
    // 在 gameDrawAfter 之后逐人并发询问“是否更换初始手牌”；换牌为整手替换并同步 _start_cards，
    // 联机时远端玩家经 player.send/wait 同步，AI 一律不换。
    // 优先级（按需求：本功能为最高）：
    //   · 十周年UI 的手气卡只在单机生效（其 gameDraw 覆写在 connectMode 下自行禁用），与联机互不重叠；
    //   · 懒人包/云中守望的 _swReplaceHandCards 与本功能同台时会双重询问，这里在其注册后
    //     改写其 filter 使其停用（precontent 立即改写一次 + arenaReady 兜底一次，覆盖任意加载顺序）；
    //     本功能在设置里选「关闭」时不抢优先级，对方的照常生效。
    //   · 事件与内容用 cshSwReplaceHandcards 独立命名，不与懒人包的 game.swReplaceHandcards 撞名。
    (function () {
        try {
            const disableRivalSwReplace = function () {
                try {
                    if (lib.config.extension_池子魔将_csh_lucky_card === "off") return;
                    const rival = lib.skill._swReplaceHandCards;
                    if (rival && !rival._csh_disabledByMojiang) {
                        rival._csh_disabledByMojiang = true;
                        rival.filter = function () { return false; };
                    }
                } catch (eRival) {}
            };
            disableRivalSwReplace();
            // arenaReady 在首个对局创建时执行，此时所有扩展模块都已加载完毕，可兜底覆盖任意加载顺序
            if (lib.arenaReady && typeof lib.arenaReady.push === "function") lib.arenaReady.push(disableRivalSwReplace);
            if (lib.skill._csh_swReplaceHandCards) return;
            game.cshSwReplaceHandcards = function (...args) {
                const next = game.createEvent("cshSwReplaceHandcards");
                for (let i = 0; i < args.length; i++) {
                    if (Array.isArray(args[i])) next.players = args[i];
                    else if (typeof args[i] === "number") next.num = args[i];
                }
                if (!next.num) next.num = 1;
                next.setContent("cshSwReplaceHandcards");
                return next;
            };
            lib.element.content.cshSwReplaceHandcards = async function (event, trigger, player) {
                const players = event.players;
                const prompt = "是否更换初始手牌？";
                const singlePromise = function (player) {
                    const choose = function (player) {
                        return player.chooseBool().set("ai", () => false).set("prompt", prompt).set("prompt2", `剩余${player.swReplaceHandcards || 0}次更换机会`);
                    };
                    const send = function (player, prompt2) {
                        player.chooseBool().set("ai", () => false).set("prompt", prompt).set("prompt2", prompt2);
                        game.resume();
                    };
                    const sendback = function (result, player) {
                        if (result && result.bool) {
                            /* otherPile：专属牌堆角色（如陈寿）的定制摸牌/弃牌入口，普通对局为空。
                               gaintag：开局带标记摸牌的同步口，函数或 [[cards, tag], ...]。 */
                            const hs = player.getCards("h"), cards = [];
                            const otherGetCards = event.otherPile?.[player.playerid]?.getCards;
                            const otherDiscard = event.otherPile?.[player.playerid]?.discard;
                            game.broadcastAll(function (player, hs, otherDiscard) {
                                game.addVideo("lose", player, [get.cardsInfo(hs), [], [], []]);
                                for (let i = 0; i < hs.length; i++) {
                                    hs[i].removeGaintag(true);
                                    if (otherDiscard) otherDiscard(hs[i]);
                                    else hs[i].discard(false);
                                }
                            }, player, hs, otherDiscard);
                            if (otherGetCards) cards.addArray(otherGetCards(hs.length));
                            else cards.addArray(get.cards(hs.length));
                            if (event.gaintag?.[player.playerid]) {
                                const gaintag = event.gaintag[player.playerid];
                                const list = typeof gaintag == "function" ? gaintag(hs.length, cards) : [[cards, gaintag]];
                                game.broadcastAll(function (player, list) {
                                    for (let i = list.length - 1; i >= 0; i--) player.directgain(list[i][0], null, list[i][1]);
                                }, player, list);
                            } else {
                                player.directgain(cards);
                            }
                            player._start_cards = cards;
                        }
                    };
                    const { promise, resolve } = Promise.withResolvers();
                    if (player.isOnline()) {
                        player.send(send, player, `剩余${player.swReplaceHandcards || 0}次更换机会`);
                        player.wait(function (result, player) { sendback(result, player); resolve(result?.bool); });
                    } else if (player.isMine()) {
                        const next = choose(player);
                        const solver = function (result, player) { sendback(result, player); resolve(result?.bool); };
                        if (_status.connectMode) game.me.wait(solver);
                        next.forResult().then(function (result) {
                            if (_status.connectMode) game.me.unwait(result, player);
                            else solver(result, player);
                        });
                    } else {
                        const next = choose(player);
                        next.forResult().then(function (result) { sendback(result, player); resolve(result?.bool); });
                    }
                    return promise;
                };
                const num = event.num;
                players.forEach(function (p) { p.swReplaceHandcards = num; });
                let active = players.map(function (p) { return { player: p, promise: singlePromise(p) }; });
                while (active.length > 0) {
                    const { result, current, index } = await Promise.race(
                        active.map(function (t, i) { return t.promise.then(function (bool) { return { result: bool, current: t.player, index: i }; }); })
                    );
                    active.splice(index, 1);
                    if (result && current.swReplaceHandcards > 1) {
                        current.swReplaceHandcards--;
                        active.push({ player: current, promise: singlePromise(current) });
                    }
                }
                players.forEach(function (p) { delete p.swReplaceHandcards; });
            };
            lib.skill._csh_swReplaceHandCards = {
                ruleSkill: true,
                direct: true,
                lastDo: true,
                priority: -99999,
                superCharlotte: true,
                trigger: { player: "gameDrawAfter" },
                filter(event, player, name) {
                    return _status.connectMode
                        && lib.config.extension_池子魔将_csh_lucky_card !== "off";
                },
                async content(event, trigger, player) {
                    // 全局规则技会按人数派发多个触发条目，同一局 gameDraw 只允许跑一轮询问
                    if (trigger._csh_swHandled) return;
                    trigger._csh_swHandled = true;
                    if (get.event()?.getParent("game")?.next?.lastItem?.name === "replaceHandcards") {
                        get.event().getParent("game").next.lastItem.finish();
                    }
                    const num = Math.max(1, parseInt(lib.config.extension_池子魔将_csh_lucky_card) || 3);
                    await game.cshSwReplaceHandcards(game.filterPlayer(), num);
                },
            };
        } catch (eLucky) {
            try { console.log("[池子魔将] 联机手气卡初始化异常", eLucky); } catch (e2) {}
        }
    })();
    // —— 拆包加载：胜负统计 / 池子调试 ——
    // csh_winrate / csh_debug 已改为 ES Module + arenaReady 懒加载（见 main/bootstrap.js），
    // 入口挂载仍在 csh_debug.js 内部（arenaReady + 浮动按钮 + F1），主菜单经懒加载桩唤起。
    // 此处仅做「懒加载桩存活」检测与提示（开发者日志开关打开时才输出）。
    (function () {
        // 就绪检测日志仅开发者开关打开时输出（普通玩家控制台保持干净）；
        // 模块本体 arenaReady 时才加载，这里只验证 bootstrap.js 留下的加载桩。
        try { if (!lib.config.extension_池子魔将_csh_dev_log) return; } catch (eDevLog) { return; }
        [500, 2000, 5000].forEach(function (ms) {
            setTimeout(function () {
                try {
                    if (typeof lib.__cshLoadDebug === "function") {
                        console.log("[池子魔将] 池子调试懒加载桩已就绪 t=" + ms + "（模块于进局时加载）");
                    } else {
                        console.warn("[池子魔将] 池子调试懒加载桩未就绪 t=" + ms + "（检查 bootstrap.js 是否执行）");
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
