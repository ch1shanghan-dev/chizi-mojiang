import { lib, game, get } from "../../../noname.js";
/* ============================================================
   池子魔将 · 「神武将选择势力」—— 非身份模式的补位
   2026-10-18 第四版（前三次全部作废，理由写在下面，别再走回头路）
   ------------------------------------------------------------
   ■ 这个需求到底能不能"交给引擎"
   试过了，不行，两条路都是死路，都有铁证：

   死路 A：给角色补 `doubleGroup`（让 get.selectGroup 返回 "double"，
          从而让引擎的 `_doublegroup_choice` 接管）。
      · 确实能让斗地主/对决弹窗 —— 但 `doubleGroup` 是**双势力**语义，
        引擎在**选将界面**会把它逐个画出来：
        `noname/ui/create/index.js:3191-3197`
            var double2 = get.is.double(item2, true);
            node2.node.group.innerHTML = double2.reduce((s, g) =>
                s + `<div data-nature="${get.groupnature(g)}">${get.translation(g)}</div>`, "");
        神将本来没有 doubleGroup，补了 5~15 个之后，每张选将卡的右上角
        就多出一整列势力标记（`double2.length > 4` 时还会被压缩成小字）。
        作者实机截图确认：**势力越多越乱**。字段语义被滥用，UI 必然跟着错。

   死路 B：给技能加 `initGroup`（同样能让 selectGroup 返回 "double"）。
      · `initGroup` 是**技能**字段、且**一个技能只能一个势力**（`groups.add(skillInfo.initGroup)`），
        表达不了"可选 5 个"；而神将的技能往往与普通武将**共享**
        （神赵云的 `longdan` 就是普通赵云的龙胆）—— 改一个，普通赵云也跟着变成"双势力"。

   ⇒ 更准确的说法不是"引擎没有入口"，而是**引擎有零件、没有装配好的流程**：
     零件一：`get.selectGroup(name[, type])`（`get/index.js:6112`）—— 通用判定，任何模式都能调；
     零件二：`player.changeGroup(group, log, broadcast)`（`player.js:3197`）—— 通用改势力、自带联机广播；
     零件三：引擎的 `_doublegroup_choice`（`skill.js:1407`）—— 通用技能，但 filter 写死 `type=="double"`。
     流程：唯一完整的"弹窗让玩家选"写在 `mode/identity.js:2358-2372`，是**身份模式私有**代码；
     斗地主三处 `if (lib.selectGroup.includes(...)) ;` 是空语句；`mode/brawl.js:2733` 那个
     `choose_group` 只给 AI 随机赋势力、不弹窗。
     ⇒ 所以这一层补位只能由扩展自己写 —— 但这不是野路子：生态里最成熟的 UI 扩展
     （十周年UI 的 `_slyh`，`src/skills/sub-skills.js`）用的就是**同一个做法**（自写全局技
     + chooseButton(vcard) + 直接改 group）。差别只在 filter：它接的是"自定义势力"
     （`!lib.group.includes(player.group)`），本技能接的是 `shen`，两者不重叠。
     必须写得**可判定、可观测、不碰别人**，并且**能给玩家关掉**。

   ■ 这一版吸取的三条教训（前三次全栽在这里）
   ① 不用 `isUnseen` 当判定 —— 它的实现是 `classList.contains("unseen")`
      （`player.js:12893`），**DOM 状态**，斗地主 gameStart 时武将牌还没亮，恒 true。
   ② 不依赖 `get.selectGroup(name, true) === "kami"` —— 那个分支要求
      `get.config("choose_group")` 为真，而配置键在老存档里可能不存在（undefined 会让 && 短路）。
      三个条件在这里**显式写开**，并且只认**显式 false** 才算关闭。
   ③ 补 `_priority` —— 引擎 `finishSkill()`（`game/index.js:8332-8346`）会给每个技能算
      `info._priority = priority*100`，`get.priority()` 读它排序；本技能是运行时后加的，
      `finishCards()` 早跑完，不补就永远是 undefined。

   ■ 只处理 shen，不处理 devil
   本扩展的魔王与小怪**全部是 devil**（`csh_bossdata.js` 的 `BOSS_GROUP`，190+ 条）。
   只认 shen ⇒ BOSS 模式天然不受影响，**不需要模式白名单**（少一个会写错的地方）。
   国战单独排除（那里 shen 是"野心家"机制，engine 自己有安排）。
   ============================================================ */

var SKILL = "_csh_kami_choice";
var _installed = false;
var _kamiPending = new WeakMap();

/* 诊断：最后一次判定为什么没通过。挂在 lib 上，调试面板可读 ——
   前几版"弹不出来"时只能靠猜，这一版让原因自己说话。 */
function why(reason, player) {
    try {
        lib.__cshKamiWhy = {
            at: Date.now(),
            mode: (function () { try { return get.mode(); } catch (e) { return "?"; } })(),
            name: (player && (player.name1 || player.name)) || "",
            reason: reason,
        };
    } catch (eWhy) {}
    return reason;
}

/* 本扩展的独立开关（设置页「神将补选势力」）。
   ★ 只认**显式 true** 才算开 —— 注意这跟「引擎 choose_group」的方向**相反**，
     因为两者的默认值不同，不能照抄：
       · 引擎 choose_group 默认开（init:true），所以"缺键按开"才是尊重引擎；
       · 本项默认**关**（2026-10-18 作者定案：别人已经有选势力，我们不再重复弹）。
         设置页的 `init:false` 只在**打开过设置页**时才写进 lib.config，
         老存档 / 刚装都没这个键 ⇒ 若写成"只认显式 false 才关"，缺键会被判成开，
         等于"名义上默认关、实际默认开"。所以必须反过来：缺键 = 关。
   filter、content 入口及选择完成后都检查开关和宿主状态；关闭时不进入补选流程。
   补选与面板滚动独立，兼容性以实际触发条件和异步让位守卫判断。 */
function kamiEnabled() {
    /* 作者决定将该兼容功能停用并从设置页隐藏；忽略旧存档中的 true。 */
    return false;
}

/* 该不该问这个玩家选势力。返回 "" = 不问；"shen" = 要问。
   判定条件与引擎 kami 分支等价，但：显式、缺键按开、只认 shen。 */
function verdict(player, ownPending) {
    if (!player) return why("no-player", player);
    /* ① 扩展开关（最便宜，关掉就完全不参与，连 character 都不用查） */
    if (!kamiEnabled()) return why("ext-config-off", player);
    var pending = _kamiPending.get(player);
    if (pending && pending !== ownPending) return why("choice-pending", player);
    if (player._groupChosen && !(pending === ownPending && ownPending && player._groupChosen === "shen")) return why("already-chosen", player);
    var name = player.name1 || player.name || "";
    if (!name) return why("no-name", player);
    var info = null;
    try { info = get.character(name); } catch (e0) { return why("character-throw", player); }
    if (!info || !info.group) return why("no-character", player);
    /* ② 只认 shen —— devil 是本扩展的魔王/小怪全家，碰了 BOSS 模式就废 */
    if (info.group !== "shen") return why("group-not-shen:" + info.group, player);
    /* ③ 让位守卫：势力已经不是 shen，说明**别人已经处理过了**
       （例如先执行的其他扩展；本机十周年UI 的 _slyh 只接未注册势力，通常不处理 shen）。
       这是防"弹两次"的：谁先改成功就归谁，后来者自动放弃。
       放在 shen 判定之后 —— 只有"本来该问的角色"才需要检查这个问题，
       也让 devil/shu 的拒绝原因码保持原样（不然它们会变成 player-group-changed）。 */
    try {
        if (player.group && player.group !== "shen") return why("player-group-changed:" + player.group, player);
    } catch (eG) {}
    /* ④ 双势力（initGroup / doubleGroup）让给引擎的 _doublegroup_choice */
    try {
        if (Array.isArray(info.doubleGroup) && info.doubleGroup.length) return why("is-double-group", player);
        if (info.skills && info.skills.length) {
            for (var i = 0; i < info.skills.length; i++) {
                var si = get.info(info.skills[i]);
                if (si && typeof si.initGroup === "string") return why("has-initgroup", player);
            }
        }
    } catch (e1) { return why("skill-throw", player); }
    /* ⑤ 隐藏技能不问 */
    if (info.hasHiddenSkill) return why("hidden-skill", player);
    /* ⑥ 引擎的「选择势力」也尊重：它关了就一并不弹（只认显式 false） */
    try {
        if (get.config("choose_group") === false) return why("config-off", player);
    } catch (e2) {}
    try { if (get.mode() === "guozhan") return why("guozhan", player); } catch (eMode) {}
    why("eligible", player);
    return "shen";
}

/* 可选势力：与引擎 kami 分支同一个算式（lib.group 去掉 shen/devil） */
function choices() {
    try {
        return lib.group.filter(function (g) { return !lib.selectGroup.includes(g); });
    } catch (e) { return []; }
}

export function installKamiChoice() {
    if (!lib || !lib.skill) return false;
    if (_installed && lib.skill[SKILL]) {
        try {
            if (lib.skill.global && !lib.skill.global.includes(SKILL) && typeof game.addGlobalSkill === "function") {
                game.addGlobalSkill(SKILL);
            }
        } catch (eRe) {}
        return true;
    }
    if (!lib.skill[SKILL]) {
        lib.skill[SKILL] = {
            /* 与引擎 _doublegroup_choice 同构的触发点与优先级 —— 这套组合已经在真实对局里
               跑了很久（文鸯每天在用），照抄它的属性集比自己发明一套可靠。 */
            trigger: { global: "gameStart", player: "enterGame" },
            firstDo: true,
            forced: true,
            popup: false,
            priority: 25,
            charlotte: true,
            global: true,
            filter: function (event, player) {
                var v = "";
                try { v = verdict(player); } catch (eF) { v = "filter-throw"; }
                if (v !== "shen") return false;
                if (player._groupChosen) return false;
                var mode = "";
                try { mode = get.mode(); } catch (eM) {}
                if (mode === "guozhan") { why("guozhan", player); return false; }
                return true;
            },
            content: async function (event, trigger, player) {
                /* filter 之后到实际执行、以及 await 期间都可能被别的扩展接管。 */
                if (verdict(player) !== "shen") return;
                var gs = [];
                try { gs = choices(); } catch (e0) { gs = []; }
                if (!gs || !gs.length) return;
                var hadChosen = Object.prototype.hasOwnProperty.call(player, "_groupChosen");
                var previousChosen = player._groupChosen;
                var pending = { name: player.name1 || player.name || "" };
                var committed = false;
                _kamiPending.set(player, pending);
                player._groupChosen = "shen"; // 只在本次选择进行中预留，失败/取消须释放。
                try {
                    var result = await player
                        .chooseButton(["请选择你的势力", [gs.map(function (g) { return ["", "", "group_" + g]; }), "vcard"]], true)
                        .set("direct", true)
                        .forResult();
                    if (!result || !result.bool || !result.links || !result.links.length) { why("choice-cancelled", player); return; }
                    if (_kamiPending.get(player) !== pending || player._groupChosen !== "shen" ||
                        (player.name1 || player.name || "") !== pending.name) { why("choice-superseded", player); return; }
                    if (verdict(player, pending) !== "shen") return;
                    var link = result.links[0];
                    var gid = String(link && link[2] != null ? link[2] : "");
                    if (gid.indexOf("group_") !== 0 || !gs.includes(gid.slice(6)) || !choices().includes(gid.slice(6))) {
                        why("choice-invalid", player); return;
                    }
                    await player.changeGroup(gid.slice(6), false);
                    committed = true;
                    why("chosen:" + gid.slice(6), player);
                } catch (eC) {
                    why("choice-error", player);
                    try { if (lib.cshDebug && typeof lib.cshDebug.error === "function") lib.cshDebug.error("kami: 补选未完成", eC); } catch (eLog) {}
                } finally {
                    if (_kamiPending.get(player) === pending) _kamiPending.delete(player);
                    if (!committed && player._groupChosen === "shen") {
                        if (hadChosen) player._groupChosen = previousChosen;
                        else delete player._groupChosen;
                    }
                }
            },
        };
    }
    try {
        if (typeof game.addGlobalSkill === "function") game.addGlobalSkill(SKILL);
    } catch (eAdd) { return false; }
    /* 补 _priority（见文件头 ③） */
    try {
        var inf = lib.skill[SKILL];
        if (inf && !("_priority" in inf)) {
            var pr = inf.priority ? inf.priority * 100 : 0;
            if (inf.silent) pr++;
            if (inf.equipSkill) pr -= 25;
            if (inf.cardSkill) pr -= 50;
            if (inf.ruleSkill) pr -= 75;
            inf._priority = pr;
        }
        if (inf && inf.skill_id == null) inf.skill_id = SKILL;
    } catch (ePr) {}
    _installed = true;
    return true;
}

/* 自检 / 调试面板用 */
export function kamiStatus() {
    var why0 = null;
    try { why0 = lib.__cshKamiWhy || null; } catch (e) {}
    var peer = null;
    /* 顺手看一眼生态里那个同做的技能还在不在（十周年UI 的 _slyh）。
       它接"自定义势力"、本技能接 shen，两者条件不重叠；列出来只是为了排查时少绕路。 */
    try { peer = !!(lib.skill && lib.skill._slyh); } catch (eP) {}
    return {
        skill: SKILL,
        installed: _installed,
        enabled: kamiEnabled(),
        present: !!(lib && lib.skill && lib.skill[SKILL]),
        inGlobal: !!(lib && lib.skill && lib.skill.global && lib.skill.global.includes(SKILL)),
        priority: (lib && lib.skill && lib.skill[SKILL] && lib.skill[SKILL]._priority) || null,
        choices: choices(),
        peerSlyh: peer,
        lastWhy: why0,
    };
}
