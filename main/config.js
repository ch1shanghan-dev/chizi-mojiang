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
            /* 【2026-10-15 作者指令】改回**默认开启**（调试期需要随时看状态；联机仍一律禁用，
               见 csh_debug.js 的 canShow）。老存档若手动关过，仍以玩家保存值为准。 */
            "csh_debug_menu":{"name":"启用池子调试（悬浮球）","intro":"默认开启。联机一律禁用。单机对局显示悬浮球，短按打开调试面板，F1 同效。","init":true},
            /* ★ 2026-10-18 · 作者：非身份场选势力要单独一个开关（怕和别的扩展/美化冲突）。
               这里必须把两件事分清楚，否则设置页看名字会以为是一个功能：
                 · csh_kami_group        = 「弹不弹」（本项，上游）
                 · csh_eg_group_scroll   = 「弹出来之后，势力太多放不下时尺寸怎么管」（下游）
               本项只被规则技的 filter 读一次（纯 early return），**不产生任何 DOM、不改样式**，
               所以与美化类扩展没有可冲突的面；真正会打架的是「别的扩展也做同一件事 ⇒ 弹两次」，
               那种情况由 csh_rules.js 的让位守卫兜住（player.group 已经不是 shen 就自动放弃）。
               建议：**同步关掉引擎的「选择势力」也能达到同样效果**（本项尊重引擎那一项，任一关闭即不弹）。 */
            "csh_kami_group":{"name":"神将选势力（斗地主 / 对决等）","intro":"默认关闭（2026-10-18 作者定案：别人已经有选势力，我们不再重复弹）。身份场弹「请选择你的势力」是引擎自己做的，本项不参与；但斗地主、对决等模式引擎留了空实现（斗地主源码里三处判断的语句体是空的），神势力武将会以「神」开局。开启本项后由本扩展补一个全局规则技，让这些模式也能选势力。只处理「神」势力武将（池子魔将里有 11 位）；魔王与小怪是 devil，不受影响，国战也不参与。本项不产生任何界面元素、不改样式，不会与美化扩展冲突；需要本扩展补这个功能时再打开；若你另装了做同一件事的扩展、出现重复弹窗，保持关闭即可。改动立即生效。","init":false,"onclick":function(bool){ try{ game.saveExtensionConfig("池子魔将","csh_kami_group",bool); }catch(e){} }},
            /* ★ 2026-10-16 深夜四（作者：给滚动条「在扩展设置里加一个开关」）：
               本体兼容注入 C4 的开关。改动即时生效（onclick 传新状态给注入器），无需重启。
               ★ 2026-10-16 深夜八·修「关了他又自动打开」：引擎（optionsMenu.js:305 /
               exetensionMenu.js:135）对**有自定义 onclick 的选项不代存**（默认保存回调只在
               `if (!cfg.onclick)` 时装），而本项 onclick 当时只调了注入器 —— 存值永远缺失 →
               每次重开设置页/重启都回落到默认 init:true。修法 = onclick 里自行落盘（与引擎
               默认回调同键同法：extension_池子魔将_csh_eg_group_scroll）。E45 已加断言防回退。 */
            "csh_eg_group_scroll":{"name":"势力面板尺寸自适应（限宽 / 纵向滚动）","intro":"【这是「弹出来之后尺寸怎么管」，不是「弹不弹」】弹不弹由上面那一项「神将选势力」决定（身份场则由引擎决定）。本项只管一件事：势力很多、面板放不下时，要不要由本扩展接管尺寸（宽度锁到屏幕内 + 纵向滚动 + 滚动条让位）。默认关闭 = 完全交给引擎原画；只有装了很多加势力的扩展、面板右侧被切掉或滚不动时才需要打开。改动即时生效。","init":false,"onclick":function(bool){ try{ game.saveExtensionConfig("池子魔将","csh_eg_group_scroll",bool); }catch(e){} try{ if(typeof lib.__cshEgScrollApply==="function") lib.__cshEgScrollApply(bool); }catch(e){} }},
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
            /* 【2026-10-17 作者指令】「检查更新」与「其他扩展」同在「谨慎操作」分隔条之下；
               因引擎设置页是**逐项一行**（无法横向并排），按作者要求把「其他扩展」放到最下面。 */
            "csh_check_update":{"name":"<span class=\"csh-cfg-btn\">检查更新</span>","intro":"检查池子魔将是否有新版本；有则一键在线更新（源已内置，无需手动填写更新地址。更新完成后自动重启）。","clear":true,"onclick":function(){
                if(lib.cshDebug && typeof lib.cshDebug.checkUpdate==="function"){ lib.cshDebug.checkUpdate(); return false; }
                if(typeof lib.__cshLoadDebug==="function"){
                    lib.__cshLoadDebug().then(function(){ try{ lib.cshDebug.checkUpdate(); }catch(e){ alert("检查更新打开失败："+((e&&e.message)||e)); } }).catch(function(e){ alert("检查更新未初始化：csh_debug.js 加载失败 "+((e&&e.message)||e)); });
                    return false;
                }
                alert("检查更新未初始化：请确认 csh_debug.js 已随扩展加载，然后重启游戏"); return false;
            }},
            "csh_extstore":{"name":"<span class=\"csh-cfg-btn\">其他扩展</span>","intro":"从 GitHub 在线安装精选扩展（武将包 / 功能扩展，清单由池子魔将维护，随版本更新上架新货）。","clear":true,"onclick":function(){
                if(lib.cshDebug && typeof lib.cshDebug.openExtStore==="function"){ lib.cshDebug.openExtStore(); return false; }
                if(typeof lib.__cshLoadDebug==="function"){
                    lib.__cshLoadDebug().then(function(){ try{ lib.cshDebug.openExtStore(); }catch(e){ alert("其他扩展打开失败："+((e&&e.message)||e)); } }).catch(function(e){ alert("其他扩展未初始化："+((e&&e.message)||e)); });
                    return false;
                }
                alert("其他扩展未初始化：请确认 csh_debug.js 已随扩展加载，然后重启游戏"); return false;
            }}
        };
