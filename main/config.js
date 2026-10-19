/* 【2026-09-30 修复】配置项里的 onclick 回调引用 lib
   （打开「胜负统计」/「局内互动」面板）。原在 extension.js 作用域内可见，
   拆出后必须自带 import，否则点这两个按钮会抛 ReferenceError: lib is not defined。
   【2026-10-16 深夜八】游戏类补 game（滚动条开关 onclick 落盘用 game.saveExtensionConfig）——
   同一条红线：本文件用到的 noname 绑定必须在本文件 import。 */
import { lib, game } from "../../../noname.js";

export const cshConfig = {
            /* ===== 顶部：仅次于版本号的两个面板入口 ===== 
             * 顺序即渲染顺序。两项都是 clear:true 的纯按钮，不占配置值。
             * AI 互动的三个开关（总开关 / 频率 / 台词）已收进卡片面板，
             * 键名仍是 extension_池子魔将_csh_interact / _rate / _chat，老配置值继续生效。
             * 排版约定：不用 ◆ 之类的装饰符，也不加副标题，就一行金色按钮。 */
            "winrateStats":{"name":"<span class=\"csh-cfg-btn\">胜负统计</span>","intro":"查看各模式的武将战绩、阵营统计与个人胜率。","clear":true,"onclick":function(){
                /* csh_winrate 已懒加载（arenaReady 时自动拉起，先于任何终局安装统计钩子）。
                   主菜单点按钮时若尚未加载，这里现场拉起再打开；失败才回落到提示。 */
                if(lib.csh_winrate && typeof lib.csh_winrate.open==="function"){ lib.csh_winrate.open(); return false; }
                if(typeof lib.__cshLoadWinrate==="function"){
                    lib.__cshLoadWinrate().then(function(){ try{ lib.csh_winrate.open(); }catch(e){ console.error(e); alert("胜负统计打开失败，请重启游戏后再试"); } }).catch(function(e){ console.error(e); alert("胜负统计没能打开，请重启游戏后再试"); });
                    return false;
                }
                alert("胜负统计没能打开，请重启游戏后再试"); return false;
            }},
            /* 【2026-10-02】玩家侧休闲入口。此前 5 个小游戏**只能**从调试面板的
               「池子休闲」页签进入，而那是开发者工具、入口又在横滚页签条第 11 枚，
               360px 宽的安卓机首屏根本看不到 —— 玩家找不到游戏。
               这里给出与「胜负统计 / 局内互动」同级的一步入口。 */
            "csh_lobby":{"name":"<span class=\"csh-cfg-btn\">池子休闲</span>","intro":"打开小游戏：德州扑克 / 斗地主 / 廿一点 / UNO。与 AI 同桌，赢池子币。","clear":true,"onclick":function(){
                /* csh_debug 已懒加载：主菜单点按钮时现场拉起模块再落「池子休闲」页签；
                   注意先查 openLobby（懒加载桩阶段 lib.cshDebug 只有诊断转发桩）。 */
                if(lib.cshDebug && typeof lib.cshDebug.openLobby==="function"){ lib.cshDebug.openLobby(); return false; }
                if(typeof lib.__cshLoadDebug==="function"){
                    lib.__cshLoadDebug().then(function(){ try{ lib.cshDebug.openLobby(); }catch(e){ console.error(e); alert("池子休闲打开失败，请重启游戏后再试"); } }).catch(function(e){ console.error(e); alert("池子休闲没能打开，请重启游戏后再试"); });
                    return false;
                }
                alert("池子休闲没能打开，请重启游戏后再试"); return false;
            }},
            "csh_interact_panel":{"name":"<span class=\"csh-cfg-btn\">局内互动</span>","intro":"设置局内互动：总开关、互动频率、附带台词。联机不可用。","clear":true,"onclick":function(){ if(!lib.cshInteract||typeof lib.cshInteract.openPanel!=="function"){ alert("局内互动没能打开，请重启游戏后再试"); return false; } lib.cshInteract.openPanel(); return false; }},
            /* ===== 功能开关 ===== */
            "csh_effect_announce":{"name":"伤害/击杀/回复播报","intro":"开启后播放伤害、连杀、回复的播报与音效。与其他特效扩展冲突时关掉。","init":false},
            /* 【2026-10-05】默认关闭化：调试悬浮球默认不再开启（老玩家已保存的选择不受影响）。 */
            /* 【2026-10-15 作者指令】改回**默认开启**（调试期需要随时看状态；联机仍一律禁用，
               见 csh_debug.js 的 canShow）。老存档若手动关过，仍以玩家保存值为准。 */
            "csh_debug_menu":{"name":"启用池子调试（悬浮球）","intro":"单机对局显示悬浮球，短按打开调试面板（F1 同效）。联机不可用。","init":true},
            /* ★ 2026-10-18 · 作者：非身份场选势力要单独一个开关（怕和别的扩展/美化冲突）。
               这里必须把两件事分清楚，否则设置页看名字会以为是一个功能：
                 · csh_kami_group        = 「弹不弹」（本项，上游）
                 · csh_eg_group_scroll   = 「弹出来之后，势力太多放不下时尺寸怎么管」（下游）
               本项只被规则技的 filter 读一次（纯 early return），**不产生任何 DOM、不改样式**，
               所以与美化类扩展没有可冲突的面；真正会打架的是「别的扩展也做同一件事 ⇒ 弹两次」，
               那种情况由 csh_rules.js 的让位守卫兜住（player.group 已经不是 shen 就自动放弃）。
               建议：**同步关掉引擎的「选择势力」也能达到同样效果**（本项尊重引擎那一项，任一关闭即不弹）。 */
            "csh_kami_group":{"name":"神将补选势力","intro":"让神将在斗地主、对决等模式也能选势力；不开则以「神」开局。身份场由引擎自己弹，不受本项影响。","init":false,"onclick":function(bool){ try{ game.saveExtensionConfig("池子魔将","csh_kami_group",bool); }catch(e){} }},
            /* ★ 2026-10-16 深夜四（作者：给滚动条「在扩展设置里加一个开关」）：
               本体兼容注入 C4 的开关。改动即时生效（onclick 传新状态给注入器），无需重启。
               ★ 2026-10-16 深夜八·修「关了他又自动打开」：引擎（optionsMenu.js:305 /
               exetensionMenu.js:135）对**有自定义 onclick 的选项不代存**（默认保存回调只在
               `if (!cfg.onclick)` 时装），而本项 onclick 当时只调了注入器 —— 存值永远缺失 →
               每次重开设置页/重启都回落到默认 init:true。修法 = onclick 里自行落盘（与引擎
               默认回调同键同法：extension_池子魔将_csh_eg_group_scroll）。E45 已加断言防回退。 */
            "csh_eg_group_scroll":{"name":"势力面板自适应","intro":"势力太多、面板放不下时，把宽度锁在屏幕内并纵向滚动。面板被切掉或滚不动才需要开。","init":false,"onclick":function(bool){ try{ game.saveExtensionConfig("池子魔将","csh_eg_group_scroll",bool); }catch(e){} try{ if(typeof lib.__cshEgScrollApply==="function") lib.__cshEgScrollApply(bool); }catch(e){} }},
            /* 【2026-10-05】「开发者日志」设置项按需求移除；precontent 会把历史开启的存档一并复位。 */
            /* 【2026-10-05】联机手气卡：仅联机（connectMode）生效；实现见 main/precontent.js 的
               _csh_swReplaceHandCards 全局规则技。本功能为最高优先级：与懒人包/云中守望同类开局
               换牌同时安装时对方自动停用；十周年UI的手气卡仅单机生效，与联机互不重叠。 */
            "csh_lucky_card":{"name":"联机手气卡","intro":"联机开局可免费重换整手牌，AI 不换。与同类换牌扩展同时装时以本项为准。","init":"3","item":{"off":"关闭","1":"1次","2":"2次","3":"3次","5":"5次","7":"7次","10":"10次"}},
            /* ===== 武将相关 ===== */
            "csh_enable_pingxing":{"name":"启用平行时空武将","intro":"注册平行时空·上 / 下 / 阴间镜像武将。","init":false},
            "disEnableCharacter":{"name":"禁选其他扩展武将","intro":"禁止 AI 选其他扩展的武将。","init":false},
            /* CDK 兑换入口（§4.5.7）：2026-09-28 二次改版——设置里的按钮已撤下，
               改为彩蛋：调试面板内 2.5 秒内连点「池子休闲」页签 10 次唤起兑换面板。
               （曾改挂设置按钮，但 lib.cshDebug.openRedeem 的懒回填方案落地前按钮先
                 引用了跨 IIFE 不可见函数，导致整扩展加载失败，故回归彩蛋方案。） */
            /* 分隔条：把下方扩展安装 / 引擎自带的「编辑此扩展 / 删除此扩展」与上方功能项隔开，避免误触。
             * clear:true + nopointer：纯占位不响应点击；内容长度 >= 15 使引擎把该行高度置为 auto。 */
            "csh_danger_sep":{"name":"<span class=\"csh-cfg-sep\">—— ⚠ 谨慎操作 ——</span>","clear":true,"nopointer":true,"intro":"以下为扩展安装、编辑与删除操作","onclick":function(){ return false; }},
            /* 【2026-10-17 作者指令】「检查更新」与「其他扩展」同在「谨慎操作」分隔条之下；
               因引擎设置页是**逐项一行**（无法横向并排），按作者要求把「其他扩展」放到最下面。 */
            "csh_check_update":{"name":"<span class=\"csh-cfg-btn\">检查更新</span>","intro":"检查并在线更新到最新版，完成后自动重启。","clear":true,"onclick":function(){
                if(lib.cshDebug && typeof lib.cshDebug.checkUpdate==="function"){ lib.cshDebug.checkUpdate(); return false; }
                if(typeof lib.__cshLoadDebug==="function"){
                    lib.__cshLoadDebug().then(function(){ try{ lib.cshDebug.checkUpdate(); }catch(e){ console.error(e); alert("检查更新打开失败，请重启游戏后再试"); } }).catch(function(e){ console.error(e); alert("检查更新没能打开，请重启游戏后再试"); });
                    return false;
                }
                alert("检查更新没能打开，请重启游戏后再试"); return false;
            }},
            "csh_extstore":{"name":"<span class=\"csh-cfg-btn\">其他扩展</span>","intro":"安装精选的其他扩展（武将包 / 功能扩展）。","clear":true,"onclick":function(){
                if(lib.cshDebug && typeof lib.cshDebug.openExtStore==="function"){ lib.cshDebug.openExtStore(); return false; }
                if(typeof lib.__cshLoadDebug==="function"){
                    lib.__cshLoadDebug().then(function(){ try{ lib.cshDebug.openExtStore(); }catch(e){ console.error(e); alert("其他扩展打开失败，请重启游戏后再试"); } }).catch(function(e){ console.error(e); alert("其他扩展没能打开，请重启游戏后再试"); });
                    return false;
                }
                alert("其他扩展没能打开，请重启游戏后再试"); return false;
            }}
        };
