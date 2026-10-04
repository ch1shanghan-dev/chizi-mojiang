/* 【2026-09-30 修复】配置项里的 onclick 回调引用 lib
   （打开「胜负统计」/「局内互动」面板）。原在 extension.js 作用域内可见，
   拆出后必须自带 import，否则点这两个按钮会抛 ReferenceError: lib is not defined。 */
import { lib } from "../../../noname.js";

export const cshConfig = {
            /* ===== 顶部：仅次于版本号的两个面板入口 ===== 
             * 顺序即渲染顺序。两项都是 clear:true 的纯按钮，不占配置值。
             * AI 互动的三个开关（总开关 / 频率 / 台词）已收进卡片面板，
             * 键名仍是 extension_池子魔将_csh_interact / _rate / _chat，老配置值继续生效。
             * 排版约定：不用 ◆ 之类的装饰符，也不加副标题，就一行金色按钮。 */
            "winrateStats":{"name":"<span class=\"csh-cfg-btn\">胜负统计</span>","intro":"打开胜负统计面板：身份场 / 对决 / 斗地主 / 国战 的武将、阵营与个人战绩。","clear":true,"onclick":function(){ if(!lib.csh_winrate){ alert("胜负统计未初始化：请确认 csh_winrate.js 已随扩展加载，然后重启游戏"); return false; } lib.csh_winrate.open(); return false; }},
            /* 【2026-10-02】玩家侧休闲入口。此前 5 个小游戏**只能**从调试面板的
               「池子休闲」页签进入，而那是开发者工具、入口又在横滚页签条第 11 枚，
               360px 宽的安卓机首屏根本看不到 —— 玩家找不到游戏。
               这里给出与「胜负统计 / 局内互动」同级的一步入口。 */
            "csh_lobby":{"name":"<span class=\"csh-cfg-btn\">池子休闲</span>","intro":"打开小游戏列表：德州扑克 / 斗地主 / 廿一点 / UNO。与 AI 世界同桌，赢取池子币（CBY）。","clear":true,"onclick":function(){ if(!lib.cshDebug||typeof lib.cshDebug.openLobby!=="function"){ alert("池子休闲未初始化：请确认 csh_debug.js 已随扩展加载，然后重启游戏"); return false; } lib.cshDebug.openLobby(); return false; }},
            "csh_interact_panel":{"name":"<span class=\"csh-cfg-btn\">局内互动</span>","intro":"打开互动设置卡片：总开关 / 互动频率 / 附带台词。联机一律禁用。","clear":true,"onclick":function(){ if(!lib.cshInteract||typeof lib.cshInteract.openPanel!=="function"){ alert("AI 互动未初始化：请确认 csh_interact.js 已随扩展加载，然后重启游戏"); return false; } lib.cshInteract.openPanel(); return false; }},
            /* ===== 功能开关 ===== */
            "csh_effect_announce":{"name":"伤害/击杀/回复播报","intro":"默认关闭。开启后播放伤害/连杀/回复播报（手游位图特效 + 手游原声）。逆流/却敌/归来仍为毛笔字特效。与其他扩展effect冲突时请关闭。","init":false},
            "csh_debug_menu":{"name":"启用池子调试（悬浮球）","intro":"默认开启。联机一律禁用。单机对局显示悬浮球，短按打开调试面板，F1 同效。","init":true},
            /* ===== 武将相关 ===== */
            "csh_enable_pingxing":{"name":"启用平行时空武将","intro":"默认关闭。开启后注册平行时空·上/下/阴间镜像武将。","init":false},
            "disEnableCharacter":{"name":"禁选其他扩展武将","intro":"开启后，禁止AI选择其他扩展的武将。","init":false},
            /* CDK 兑换入口（§4.5.7）：2026-09-28 二次改版——设置里的按钮已撤下，
               改为彩蛋：调试面板内 2.5 秒内连点「池子休闲」页签 10 次唤起兑换面板。
               （曾改挂设置按钮，但 lib.cshDebug.openRedeem 的懒回填方案落地前按钮先
                 引用了跨 IIFE 不可见函数，导致整扩展加载失败，故回归彩蛋方案。） */
            /* 分隔条：把下方引擎自带的「编辑此扩展 / 删除此扩展」与上方功能项隔开，避免误触。
             * clear:true + nopointer：纯占位不响应点击；内容长度 >= 15 使引擎把该行高度置为 auto。 */
            "csh_danger_sep":{"name":"<span class=\"csh-cfg-sep\">—— 危险操作 ——</span>","clear":true,"nopointer":true,"intro":"以下为扩展编辑与删除操作","onclick":function(){ return false; }}
        };
