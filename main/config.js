/* 【2026-09-30 修复】配置项里的 onclick 回调引用 lib
   （打开「胜负统计」/「局内互动」面板）。原在 extension.js 作用域内可见，
   拆出后必须自带 import，否则点这两个按钮会抛 ReferenceError: lib is not defined。
   【2026-10-16 深夜八】游戏类补 game（滚动条开关 onclick 落盘用 game.saveExtensionConfig）——
   同一条红线：本文件用到的 noname 绑定必须在本文件 import。 */
import { lib, game } from "../../../noname.js";


/* 【2026-10-20】玩家可见提示统一走自绘 toast（E48 禁原生弹窗）。
   设置页里弹系统级 alert 会压住整个游戏窗口，且与本扩展的视觉完全脱节。
   toast 不可用时才回退原生 —— 兜底用 window.alert 明确写死，避免下面的全局替换回头命中自己。 */
function notice(msg) {
    try {
        if (lib.cshUI && typeof lib.cshUI.toast === "function") { lib.cshUI.toast(msg, { skin: "paper" }); return; }
    } catch (eT) {}
    try { window.alert(msg); } catch (eA) {}
}

function artConfigLabel(label, icon, action) {
    const url = ((lib.assetURL || "") + "extension/池子魔将/image/ui/art-v1/" + icon).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    return '<span class="' + (action === false ? 'csh-art-cfg-label' : 'csh-cfg-btn') + '"><img src="' + url + '" alt="" aria-hidden="true" onerror="this.remove()" style="width:24px;height:24px;object-fit:contain;vertical-align:middle;margin-right:7px;pointer-events:none">' + label + '</span>';
}

export const cshConfig = {
            /* ===== 顶部：仅次于版本号的两个面板入口 ===== 
             * 顺序即渲染顺序。两项都是 clear:true 的纯按钮，不占配置值。
             * AI 互动的三个开关（总开关 / 频率 / 台词）已收进卡片面板，
             * 键名仍是 extension_池子魔将_csh_interact / _rate / _chat，老配置值继续生效。
             * 排版约定：不用 ◆ 之类的装饰符，也不加副标题，就一行金色按钮。 */
            "winrateStats":{"name":artConfigLabel("胜负统计","war-record.png"),"intro":"查看各模式的武将战绩、阵营统计与个人胜率。","clear":true,"onclick":function(){
                /* csh_winrate 已懒加载（arenaReady 时自动拉起，先于任何终局安装统计钩子）。
                   主菜单点按钮时若尚未加载，这里现场拉起再打开；失败才回落到提示。 */
                if(lib.csh_winrate && typeof lib.csh_winrate.open==="function"){ lib.csh_winrate.open(); return false; }
                if(typeof lib.__cshLoadWinrate==="function"){
                    lib.__cshLoadWinrate().then(function(){ try{ lib.csh_winrate.open(); }catch(e){ console.error(e); notice("胜负统计打开失败，请重启游戏后再试"); } }).catch(function(e){ console.error(e); notice("胜负统计没能打开，请重启游戏后再试"); });
                    return false;
                }
                notice("胜负统计没能打开，请重启游戏后再试"); return false;
            }},
            /* 【2026-10-02】玩家侧休闲入口。此前 5 个小游戏**只能**从调试面板的
               「池子休闲」页签进入，而那是开发者工具、入口又在横滚页签条第 11 枚，
               360px 宽的安卓机首屏根本看不到 —— 玩家找不到游戏。
               这里给出与「胜负统计 / 局内互动」同级的一步入口。 */
            "csh_lobby":{"name":artConfigLabel("池子世界","target-banner.png"),"intro":"打开池子世界：小游戏、生涯大厅、讨伐录、池子成就。与 AI 同桌，赢池子币。","clear":true,"onclick":function(){
                /* csh_debug 已懒加载：主菜单点按钮时现场拉起模块再落「池子休闲」页签；
                   注意先查 openLobby（懒加载桩阶段 lib.cshDebug 只有诊断转发桩）。 */
                if(lib.cshDebug && typeof lib.cshDebug.openLobby==="function"){ lib.cshDebug.openLobby(); return false; }
                if(typeof lib.__cshLoadDebug==="function"){
                    lib.__cshLoadDebug().then(function(){ try{ lib.cshDebug.openLobby(); }catch(e){ console.error(e); notice("池子世界打开失败，请重启游戏后再试"); } }).catch(function(e){ console.error(e); notice("池子世界没能打开，请重启游戏后再试"); });
                    return false;
                }
                notice("池子世界没能打开，请重启游戏后再试"); return false;
            }},
            "csh_interact_panel":{"name":artConfigLabel("局内互动","interaction-strategy.png"),"intro":"设置局内互动：总开关、互动频率、附带台词。联机不可用。","clear":true,"onclick":function(){ if(!lib.cshInteract||typeof lib.cshInteract.openPanel!=="function"){ notice("局内互动没能打开，请重启游戏后再试"); return false; } lib.cshInteract.openPanel(); return false; }},
            "csh_match_rewards":{"name":artConfigLabel("对局 CBY 奖励","transfer-chest.png"),"intro":"独立设置各模式胜利与失败的 CBY 奖励；0 可关闭。仅单机正常终局生效，BOSS 特殊奖励另计。","clear":true,"onclick":function(){ if(lib.cshMatchReward&&typeof lib.cshMatchReward.openPanel==="function")lib.cshMatchReward.openPanel();else notice("对局奖励设置尚未就绪，请重启游戏后再试");return false;}},
            "csh_texas_rake":{"name":"德州场供","intro":"只从已见翻牌、实际争夺的底池收取；每手最高20 CBY。未跟注返还不收费，整场收工不再另扣净赢回收差额。","init":"100","item":{"0":"关闭","50":"0.5% · 每手最高20","100":"1% · 每手最高20","200":"2% · 每手最高20"}},
            "csh_challenge_profile":{"name":"池子挑战难度","intro":"仅池子魔王。爽快档减血减压，挑战者起手6张与1护甲；困难档保留原参数。下局生效，奖励不加倍。","init":"normal","item":{"normal":"爽快 · 推荐","hard":"原味困难"}},
            "csh_aux_spirit":{"name":"妖灵乱入（实验）","intro":"下局生效。仅单机标准身份场2–7人，内奸不召唤。下家独立AI友军，辅助有限；战绩独立，无普通奖励。","init":false},
            "csh_aux_stats":{"name":"妖灵辅助战绩","clear":true,"onclick":function(){try{const s=lib.cshWallet.wallet.assistedStats();notice("辅助身份场："+s.wins+"胜 "+s.losses+"负；不计普通身份战绩，无常规奖励");}catch(e){notice("辅助战绩不可读取，请先备份并恢复存档");}return false;}},
            /* ===== 功能开关 ===== */
            "csh_effect_announce":{"name":"伤害/击杀/回复播报","intro":"开启后播放伤害、连杀、回复的播报与音效。与其他特效扩展冲突时关掉。","init":false},
            /* 【2026-10-05】默认关闭化：调试悬浮球默认不再开启（老玩家已保存的选择不受影响）。 */
            /* 【2026-10-15 作者指令】改回**默认开启**（调试期需要随时看状态；联机仍一律禁用，
               见 csh_debug.js 的 canShow）。老存档若手动关过，仍以玩家保存值为准。 */
            "csh_debug_menu":{"name":artConfigLabel("启用池子调试（悬浮球）","debug-workshop.png",false),"intro":"单机对局显示悬浮球，短按打开调试面板（F1 同效）。联机不可用。","init":true},
            /* Retired by author: faction compatibility options are hidden and disabled. */
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
            "csh_check_update":{"name":artConfigLabel("检查更新","inspect-compass.png"),"intro":"检查并在线更新到最新版，完成后自动重启。","clear":true,"onclick":function(){
                if(lib.cshDebug && typeof lib.cshDebug.checkUpdate==="function"){ lib.cshDebug.checkUpdate(); return false; }
                if(typeof lib.__cshLoadDebug==="function"){
                    lib.__cshLoadDebug().then(function(){ try{ lib.cshDebug.checkUpdate(); }catch(e){ console.error(e); notice("检查更新打开失败，请重启游戏后再试"); } }).catch(function(e){ console.error(e); notice("检查更新没能打开，请重启游戏后再试"); });
                    return false;
                }
                notice("检查更新没能打开，请重启游戏后再试"); return false;
            }},
            "csh_extstore":{"name":artConfigLabel("其他扩展","transfer-chest.png"),"intro":"安装精选的其他扩展（武将包 / 功能扩展）。","clear":true,"onclick":function(){
                if(lib.cshDebug && typeof lib.cshDebug.openExtStore==="function"){ lib.cshDebug.openExtStore(); return false; }
                if(typeof lib.__cshLoadDebug==="function"){
                    lib.__cshLoadDebug().then(function(){ try{ lib.cshDebug.openExtStore(); }catch(e){ console.error(e); notice("其他扩展打开失败，请重启游戏后再试"); } }).catch(function(e){ console.error(e); notice("其他扩展没能打开，请重启游戏后再试"); });
                    return false;
                }
                notice("其他扩展没能打开，请重启游戏后再试"); return false;
            }}
        };
