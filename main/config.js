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
            "winrateStats":{"name":"<span class=\"csh-cfg-btn\">胜负统计</span>","intro":"打开胜负统计面板：身份场 / 对决 / 斗地主 / 国战 的武将、阵营与个人战绩。","clear":true,"onclick":function(){
                /* csh_winrate 已懒加载（arenaReady 时自动拉起，先于任何终局安装统计钩子）。
                   主菜单点按钮时若尚未加载，这里现场拉起再打开；失败才回落到提示。 */
                if(lib.csh_winrate && typeof lib.csh_winrate.open==="function"){ lib.csh_winrate.open(); return false; }
                if(typeof lib.__cshLoadWinrate==="function"){
                    lib.__cshLoadWinrate().then(function(){ try{ lib.csh_winrate.open(); }catch(e){ alert("胜负统计打开失败："+((e&&e.message)||e)); } }).catch(function(e){ alert("胜负统计未初始化：csh_winrate.js 加载失败 "+((e&&e.message)||e)); });
                    return false;
                }
                alert("胜负统计未初始化：请确认 csh_winrate.js 已随扩展加载，然后重启游戏"); return false;
            }},
            /* 【2026-10-02】玩家侧休闲入口。此前 5 个小游戏**只能**从调试面板的
               「池子休闲」页签进入，而那是开发者工具、入口又在横滚页签条第 11 枚，
               360px 宽的安卓机首屏根本看不到 —— 玩家找不到游戏。
               这里给出与「胜负统计 / 局内互动」同级的一步入口。 */
            "csh_lobby":{"name":"<span class=\"csh-cfg-btn\">池子休闲</span>","intro":"打开小游戏列表：德州扑克 / 斗地主 / 廿一点 / UNO。与 AI 世界同桌，赢取池子币（CBY）。","clear":true,"onclick":function(){
                /* csh_debug 已懒加载：主菜单点按钮时现场拉起模块再落「池子休闲」页签；
                   注意先查 openLobby（懒加载桩阶段 lib.cshDebug 只有诊断转发桩）。 */
                if(lib.cshDebug && typeof lib.cshDebug.openLobby==="function"){ lib.cshDebug.openLobby(); return false; }
                if(typeof lib.__cshLoadDebug==="function"){
                    lib.__cshLoadDebug().then(function(){ try{ lib.cshDebug.openLobby(); }catch(e){ alert("池子休闲打开失败："+((e&&e.message)||e)); } }).catch(function(e){ alert("池子休闲未初始化：csh_debug.js 加载失败 "+((e&&e.message)||e)); });
                    return false;
                }
                alert("池子休闲未初始化：请确认 csh_debug.js 已随扩展加载，然后重启游戏"); return false;
            }},
            "csh_interact_panel":{"name":"<span class=\"csh-cfg-btn\">局内互动</span>","intro":"打开互动设置卡片：总开关 / 互动频率 / 附带台词。联机一律禁用。","clear":true,"onclick":function(){ if(!lib.cshInteract||typeof lib.cshInteract.openPanel!=="function"){ alert("AI 互动未初始化：请确认 csh_interact.js 已随扩展加载，然后重启游戏"); return false; } lib.cshInteract.openPanel(); return false; }},
            /* ===== 功能开关 ===== */
            "csh_effect_announce":{"name":"伤害/击杀/回复播报","intro":"默认关闭。开启后播放伤害/连杀/回复播报（手游位图特效 + 手游原声）。逆流/却敌/归来仍为毛笔字特效。与其他扩展effect冲突时请关闭。","init":false},
            /* 【2026-10-05】默认关闭化：调试悬浮球默认不再开启（老玩家已保存的选择不受影响）。 */
            "csh_debug_menu":{"name":"启用池子调试（悬浮球）","intro":"默认关闭。联机一律禁用。单机对局显示悬浮球，短按打开调试面板，F1 同效。","init":false},
            /* 【2026-10-05】「开发者日志」设置项按需求移除；precontent 会把历史开启的存档一并复位。 */
            /* 【2026-10-05】联机手气卡：仅联机（connectMode）生效；实现见 main/precontent.js 的
               _csh_swReplaceHandCards 全局规则技。本功能为最高优先级：与懒人包/云中守望同类开局
               换牌同时安装时对方自动停用；十周年UI的手气卡仅单机生效，与联机互不重叠。 */
            "csh_lucky_card":{"name":"联机手气卡","intro":"联机开局每人最多可免费更换初始手牌若干次（AI不更换，换的是整手牌）。与懒人包/云中守望等同类开局换牌功能同时安装时，以本设置为准（对方自动停用）；十周年UI的手气卡仅单机生效，互不影响。","init":"3","item":{"off":"关闭","1":"1次","2":"2次","3":"3次","5":"5次","7":"7次","10":"10次"}},
            /* ===== 武将相关 ===== */
            "csh_enable_pingxing":{"name":"启用平行时空武将","intro":"默认关闭。开启后注册平行时空·上/下/阴间镜像武将。","init":false},
            "disEnableCharacter":{"name":"禁选其他扩展武将","intro":"开启后，禁止AI选择其他扩展的武将。","init":false},
            /* CDK 兑换入口（§4.5.7）：2026-09-28 二次改版——设置里的按钮已撤下，
               改为彩蛋：调试面板内 2.5 秒内连点「池子休闲」页签 10 次唤起兑换面板。
               （曾改挂设置按钮，但 lib.cshDebug.openRedeem 的懒回填方案落地前按钮先
                 引用了跨 IIFE 不可见函数，导致整扩展加载失败，故回归彩蛋方案。） */
            /* 分隔条：把下方扩展安装 / 引擎自带的「编辑此扩展 / 删除此扩展」与上方功能项隔开，避免误触。
             * clear:true + nopointer：纯占位不响应点击；内容长度 >= 15 使引擎把该行高度置为 auto。 */
            "csh_danger_sep":{"name":"<span class=\"csh-cfg-sep\">—— ⚠ 谨慎操作 ——</span>","clear":true,"nopointer":true,"intro":"以下为扩展安装、编辑与删除操作","onclick":function(){ return false; }},
            "csh_extstore":{"name":"<span class=\"csh-cfg-btn\">其他扩展</span>","intro":"从 GitHub 在线安装精选扩展（武将包 / 功能扩展，清单由池子魔将维护，随版本更新上架新货）。","clear":true,"onclick":function(){
                if(lib.cshDebug && typeof lib.cshDebug.openExtStore==="function"){ lib.cshDebug.openExtStore(); return false; }
                if(typeof lib.__cshLoadDebug==="function"){
                    lib.__cshLoadDebug().then(function(){ try{ lib.cshDebug.openExtStore(); }catch(e){ alert("其他扩展打开失败："+((e&&e.message)||e)); } }).catch(function(e){ alert("其他扩展未初始化："+((e&&e.message)||e)); });
                    return false;
                }
                alert("其他扩展未初始化：请确认 csh_debug.js 已随扩展加载，然后重启游戏"); return false;
            }}
        };
