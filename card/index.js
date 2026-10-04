import { lib, game, ui, get, ai, _status } from "../../../noname.js";
/* 卡牌分包：由 extension.js 的 package.card 机械拆出（P2，2026-09-30）。
   内容一字未改；原作用域内用到 get/lib/game/ai/_status/ui，拆出后须自带 import。 */
export default {
        card: {

            // ----- 载物专属衍生武器 -----
            
            "csh_qiangbao": {
                fullskin: true,
                type: "equip",
                subtype: "equip5",
                image: "ext:池子魔将/image/card/csh_qiangbao.png",
                skills: ["csh_qiangbao_skill"],
                destroy: true,
                ai: {
                    basic: { equipValue: 0 },
                    order: 1,
                },
            },
"csh_daju": {
                fullskin: true,
                derivation: "csh_zywoo",
                type: "equip",
                subtype: "equip1",
                distance: { attackFrom: -8 },
                skills: ["csh_daju_skill"],
                image: "ext:池子魔将/image/card/csh_daju.png",

                destroy: true,
                ai: { basic: { equipValue: 8 } },
            },
            "csh_shaying": {
                fullskin: true,
                derivation: "csh_zywoo",
                type: "equip",
                subtype: "equip1",
                cardcolor: "heart",
                distance: { attackFrom: -8 },
                skills: ["csh_shaying_skill"],
                image: "ext:池子魔将/image/card/csh_shaying.png",

                destroy: true,
                ai: { basic: { equipValue: 7 } },
            },
            "csh_ak47": {
                fullskin: true,
                derivation: "csh_zywoo",
                type: "equip",
                subtype: "equip1",
                cardcolor: "club",
                distance: { attackFrom: -8 },
                skills: ["csh_ak47_skill"],
                image: "ext:池子魔将/image/card/csh_ak47.png",

                destroy: true,
                ai: { basic: { equipValue: 6 } },
            },
            // 仅用于技能描述弹窗的虚拟冰【杀】（不进牌堆）
            "csh_ice_sha": {
                type: "basic",
                cardcolor: "black",
                cardnature: "ice",
                enable: false,
                fullskin: true,
                image: "image/card/sha.png",
                ai: {
                    basic: { useful: 4, value: 4 },
                    tag: { respond: 1, respondSha: 1, damage: 1 },
                },
            },
            "csh_huoshan": {
                fullskin: true,
                type: "delay",
                cardcolor: "red",
                cardnature: "fire",
                toself: true,
                modTarget: function (card, player, target) {
                    return lib.filter.judge(card, player, target);
                },
                enable: function (card, player) {
                    return player.canAddJudge(card);
                },
                filterTarget: function (card, player, target) {
                    return lib.filter.judge(card, player, target) && player == target;
                },
                selectTarget: [-1,-1],
                judge: function (card) {
                    if (get.suit(card) == "heart") return -6;
                    return 1;
                },
                "judge2": function (result) {
                    if (result.bool == false) return true;
                    return false;
                },
                effect: function () {
                    if (result.bool == false) {
                        player.damage(2, "fire", "nosource");
                        var players = game.filterPlayer(function (current) {
                            return get.distance(player, current) <= 1 && player != current;
                        });
                        players.sort(lib.sort.seat);
                        for (var i = 0; i < players.length; i++) {
                            players[i].damage(1, "fire", "nosource");
                        }
                    } else {
                        player.addJudgeNext(card);
                    }
                },
                cancel: function () {
                    player.addJudgeNext(card);
                },
                ai: {
                    basic: {
                        useful: 0,
                        value: 0,
                    },
                    order: 1,
                    result: {
                        target: function (player, target) {
                            return lib.card.shandian.ai.result.target(player, target);
                        },
                    },
                    tag: {
                        damage: 0.15,
                        natureDamage: 0.15,
                        fireDamage: 0.15,
                    },
                },
                content: function () {
                    if (lib.filter.judge(card, player, target) && cards.length && get.position(cards[0], true) == "o")
                        target.addJudge(card, cards);
                },
                allowMultiple: false,
                image: "ext:池子魔将/image/csh_huoshan_soft.png",
            },
            "csh_hongshui": {
                type: "delay",
                toself: true,
                enable: function (card, player) {
                    return player.canAddJudge(card);
                },
                modTarget: function (card, player, target) {
                    return lib.filter.judge(card, player, target);
                },
                filterTarget: function (card, player, target) {
                    return lib.filter.judge(card, player, target) && player == target;
                },
                selectTarget: [-1,-1],
                judge: function (card) {
                    if (get.suit(card) == "club") return -3;
                    return 1;
                },
                "judge2": function (result) {
                    if (result.bool == false) return true;
                    return false;
                },
                fullskin: true,
                effect: function () {
                    if (result.bool == false) {
                        if (player.countCards("he") == 0) player.loseHp();
                        else {
                            player.discard(player.getCards("he").randomGets(3));
                        }
                        var players = get.players();
                        for (var i = 0; i < players.length; i++) {
                            var dist = get.distance(player, players[i]);
                            if (dist <= 2 && player != players[i]) {
                                var cs = players[i].getCards("he");
                                if (cs.length == 0) players[i].loseHp();
                                else {
                                    players[i].discard(cs.randomGets(3 - Math.max(1, dist)));
                                }
                            }
                        }
                    } else {
                        player.addJudgeNext(card);
                    }
                },
                cancel: function () {
                    player.addJudgeNext(card);
                },
                ai: {
                    basic: {
                        useful: 0,
                        value: 0,
                    },
                    order: 1,
                    result: {
                        target: function (player, target) {
                            return lib.card.shandian.ai.result.target(player, target);
                        },
                    },
                },
                content: function () {
                    if (lib.filter.judge(card, player, target) && cards.length && get.position(cards[0], true) == "o")
                        target.addJudge(card, cards);
                },
                allowMultiple: false,
                image: "ext:池子魔将/image/csh_hongshui_soft.png",
            },
            "csh_tuojia": {
                fullskin: true,
                derivation: "csh_kuisangti",
                cardcolor: "spade",
                type: "equip",
                subtype: "equip1",
                distance: { attackFrom: -1 },
                skills: ["csh_tuojia_skill"],
                image: "ext:池子魔将/image/card/csh_tuojia.png",

                audio: "ext:池子魔将/audio/card",
                cardPrompt(card) {
                    const naijiu = card && card.storage ? card.storage.naijiu : null;
                    const str = typeof naijiu === "number" ? naijiu : 3;
                    return "①此牌初始拥有" + str + "点耐久度，归0销毁。②此牌进入装备区时，弃置装备区其他牌。③其他装备牌将进入装备区时，改为弃置之，然后摸一张牌。④你受到伤害时，耐久度-X且此伤害-X（X为伤害值且至多为耐久度）。⑤因〖岸姿〗以外的方式离开装备区时，防止之，然后耐久度-1。";
                },
                destroy: true,
                ai: {
                    basic: {
                        equipValue: 6,
                    },
                },
            },
            "csh_pifeng": {
                fullskin: true,
                derivation: "csh_kuisangti",
                cardcolor: "spade",
                type: "equip",
                subtype: "equip1",
                distance: { attackFrom: -2 },
                skills: ["csh_pifeng_skill"],
                image: "ext:池子魔将/image/card/csh_pifeng.png",

                audio: "ext:池子魔将/audio/card",
                cardPrompt(card) {
                    const naijiu = card && card.storage ? card.storage.naijiu : null;
                    const str = typeof naijiu === "number" ? `<span style='color:#e07e41'>${naijiu}</span>` : "<span style='color:#e07e41'>3</span>";
                    return `此牌拥有${str}点耐久度（由【陀甲】切换而来时原样继承，上限3），耐久度归0时销毁此牌。<br>①此牌进入你的装备区时，弃置你装备区里的其他牌，且废除你的判定区（此牌离开你的装备区时恢复）。<br>②你的额定摸牌数+1，出杀次数+1，手牌上限+1。<br>③当你使用【杀】造成伤害时，此伤害+1，然后此牌耐久度-1。<br>④你使用的【杀】只能被实体牌【闪】响应（转化或视为使用的【闪】无效）。<br>⑤你的体力值至多回复至2点。<br>⑥此牌不因〖岸姿〗离开你的装备区时，减少1点此牌的耐久度，并防止之。<br>⑦其他装备牌进入你的装备区前，改为将这些牌弃置，然后你摸一张牌。`;
                },
                destroy: true,
                ai: {
                    basic: {
                        equipValue: 6,
                    },
                },
            },
            "csh_xiandaoshazhao": {
                audio: "ext:池子魔将/audio/card",
                enable: true,
                type: "trick",
                selectTarget: 1,
                filterTarget: function (card, player, target) {
                    return player !== target;
                },
                content: async function (event, trigger, player) {
                    const target = event.target;
                    if (!player.isIn() || !target.isIn()) {
                        event.finish();
                        return;
                    }
            
                    // 亮出牌堆顶五张牌
                    event.showCards = get.cards(5, true);
                    await game.cardsGotoOrdering(event.showCards);
            
                    // 亮牌（联机同步）
                    await player.showCards(
                        event.showCards,
                        `${get.translation(player)}发动了「仙道杀招」`,
                        true
                    ).set("clearArena", false);
            
                    // 依次使用其中所有【杀】
                    if (player.isIn() && target.isIn() && event.showCards.length) {
                        for (const card of event.showCards.slice()) {
                            if (get.name(card) === "sha" && player.canUse(card, target, false)) {
                                event.showCards.remove(card);
                                await player.useCard(card, target, false);
                            }
                        }
                    }
            
                    // 联机强制清理亮牌界面
                    game.broadcastAll(ui.clear);
            
                    // 剩余牌置于牌堆底（联机稳定写法）
                    if (event.showCards.length) {
                        await game.cardsGotoPile(event.showCards);
                    }
                },
                ai: {
                    basic: {
                        useful: 4.5,
                        value: 3.5,
                    },
                    order: 4,
                    result: {
                        target: function (player, target) {
                            if (get.effect(target, { name: "sha" }, player, target) === 0) return 0;
                            return -2.6;
                        },
                    },
                    tag: {
                        respond: 1,
                        respondShan: 1,
                        damage: 1,
                    },
                },
                fullskin: true,
                image: "ext:池子魔将/image/csh_xiandaoshazhao_soft.png",
            },
            "csh_fangyuan_niliuhushenyin": {
                audio: "ext:池子魔将/audio/card",
                derivation: "csh_fangyuan_hengshou",
                enable: true,
                type: "trick",
                toself: true,
                selectTarget: [-1, -1],
                modTarget: function (card, player, target) {
                    return player === target;
                },
                filterTarget: function (card, player, target) {
                    return player === target;
                },
                // 逆流护身印不可被无懈：onuse 在无懈询问之前执行（contentBefore 过晚，会被无懈）
                // nowuxie + directHit 双保险，兼容不同引擎分支（单机/联机一致）
                onuse: function (result, player) {
                    if (!result) return;
                    result.nowuxie = true;
                    if (!Array.isArray(result.directHit)) result.directHit = [];
                    var ts = result.targets || [];
                    if (ts.length) result.directHit.addArray(ts);
                    else if (player) result.directHit.add(player);
                },
                contentBefore: function () {
                    var evt = event.getParent("useCard") || event.getParent();
                    if (!evt) return;
                    evt.nowuxie = true;
                    var ts = event.targets || evt.targets || [];
                    if (!Array.isArray(evt.directHit)) evt.directHit = [];
                    if (ts.length) evt.directHit.addArray(ts);
                },
                content: async function (event, trigger, player) {
                    const target = event.targets[0] || player;
                    target.storage.csh_fangyuan_niliu_state = 2;
                    target.syncStorage("csh_fangyuan_niliu_state");
                    target.addSkill("csh_fangyuan_niliu_state");
                    target.markSkill("csh_fangyuan_niliu_state");
                    // 进入离场：引擎 isOut 统一拦截选目标/部分结算；比纯 mod 更完整
                    if (!target.isOut() && typeof target.out === "function") {
                        target.out("csh_fangyuan_niliu_state");
                    }
                    game.broadcastAll(function (p) {
                        if (!p) return;
                        try {
                            p.storage.csh_fangyuan_niliu_state = 2;
                            if (typeof p.syncStorage === "function") p.syncStorage("csh_fangyuan_niliu_state");
                            if (!p.hasSkill("csh_fangyuan_niliu_state")) {
                                p.addSkill("csh_fangyuan_niliu_state");
                            }
                            p.markSkill("csh_fangyuan_niliu_state");
                            if (!p.isOut() && typeof p.out === "function") {
                                p.out("csh_fangyuan_niliu_state");
                            }
                            if (typeof p.updateMarks === "function") p.updateMarks();
                        } catch (e) {
                            console.warn("[池子魔将] 逆流护体联机同步失败", e);
                        }
                    }, target);
                    // 逆流命海环挂载 + 护体光尘（不含视频，视频单独 await）
                    game.broadcastAll(function (player) {
                        if (!player) return;
                        try {
                            player.classList.add("csh-nilu-shield");
                            if (player.node && player.node.avatar) {
                                player.node.avatar.classList.add("csh-nilu-shield");
                            }
                            if (lib.cshShoushaFx && lib.cshShoushaFx._niliuCss) {
                                lib.cshShoushaFx._niliuCss();
                            }
                            if (!player.querySelector(".csh-nilu-dust")) {
                                var dust = document.createElement("div");
                                dust.className = "csh-nilu-dust";
                                for (var i = 0; i < 7; i++) {
                                    var p = document.createElement("div");
                                    p.className = "csh-nilu-dust-p";
                                    p.style.left = (8 + Math.random() * 84) + "%";
                                    var sz = 3 + Math.random() * 4;
                                    p.style.width = sz + "px";
                                    p.style.height = sz + "px";
                                    p.style.animationDuration = (2.2 + Math.random() * 2.2) + "s";
                                    p.style.animationDelay = (Math.random() * 2.4) + "s";
                                    dust.appendChild(p);
                                }
                                player.appendChild(dust);
                            }
                        } catch (e) {}
                    }, target);
                    // 横幅视频：各端同步播放；content 侧 await 播完再继续（单机/联机一致）
                    game.broadcastAll(function () {
                        try {
                            if (lib.cshShoushaFx) lib.cshShoushaFx.play("niliu", null);
                        } catch (e) {}
                    });
                    var waitMs = (lib.cshShoushaFx && lib.cshShoushaFx._dur && lib.cshShoushaFx._dur.niliu) || 23300;
                    await new Promise(function (resolve) {
                        setTimeout(resolve, waitMs);
                    });
                    game.log(target, "获得了2枚", "#g『逆』", "标记，进入逆流护体状态");
                },
                ai: {
                    basic: {
                        useful: 0,
                        value: 0,
                    },
                    order: 1,
                    result: {
                        target: 1,
                    },
                },
                fullskin: true,
                image: "ext:池子魔将/image/csh_fangyuan_niliuhushenyin_soft.png",
            },
            "csh_aoenwu_heart": {
                fullskin: true,
                derivation: "csh_shanyuezhiyin",
                cardcolor: "heart",
                image: "ext:池子魔将/image/card/pyzhuren_heart.png",
                type: "equip",
                subtype: "equip1",
                distance: {
                    attackFrom: -2,
                },
                skills: ["csh_aoenwu_heart"],
                ai: {
                    basic: {
                        equipValue: 4,
                        order: (card2, player) => {
                          const equipValue = get.equipValue(card2, player) / 20;
                          return player && player.hasSkillTag("reverseEquip") ? 8.5 - equipValue : 8 + equipValue;
                        },
                        useful: 2,
                        value: (card2, player, index, method) => {
                          if (!player.getCards("e").includes(card2) && !player.canEquip(card2, true)) {
                            return 0.01;
                          }
                          const info2 = get.info(card2), current = player.getEquip(info2.subtype), value = current && card2 != current && get.value(current, player);
                          let equipValue = info2.ai.equipValue || info2.ai.basic.equipValue;
                          if (typeof equipValue == "function") {
                            if (method == "raw") {
                              return equipValue(card2, player);
                            }
                            if (method == "raw2") {
                              return equipValue(card2, player) - value;
                            }
                            return Math.max(0.1, equipValue(card2, player) - value);
                          }
                          if (typeof equipValue != "number") {
                            equipValue = 0;
                          }
                          if (method == "raw") {
                            return equipValue;
                          }
                          if (method == "raw2") {
                            return equipValue - value;
                          }
                          return Math.max(0.1, equipValue - value);
                        },
                    },
                    result: {
                        target: (player, target, card2) => get.equipResult(player, target, card2),
                    },
                },
                onLose: function () {
                    if (player.storage.counttrigger && player.storage.counttrigger.csh_aoenwu_heart > 0) {
                        delete player.storage.counttrigger.csh_aoenwu_heart;
                    }
                },
                enable: true,
                selectTarget: -1,
                filterTarget: (card2, player, target) => player == target && target.canEquip(card2, true),
                modTarget: true,
                allowMultiple: false,
                content: async function(event) {
                    const { card, target } = event;
                    if (!card?.cards.some((card2) => get.position(card2, true) !== "o")) {
                      await target.equip(card);
                    }
                  },
                toself: true,
            },
            "csh_aoenwu_diamond": {
                fullskin: true,
                derivation: "csh_shanyuezhiyin",
                cardcolor: "diamond",
                image: "ext:池子魔将/image/card/pyzhuren_diamond.png",
                type: "equip",
                subtype: "equip1",
                distance: {
                    attackFrom: -1,
                },
                skills: ["csh_aoenwu_diamond"],
                ai: {
                    basic: {
                        equipValue: 3,
                        order: (card2, player) => {
                          const equipValue = get.equipValue(card2, player) / 20;
                          return player && player.hasSkillTag("reverseEquip") ? 8.5 - equipValue : 8 + equipValue;
                        },
                        useful: 2,
                        value: (card2, player, index, method) => {
                          if (!player.getCards("e").includes(card2) && !player.canEquip(card2, true)) {
                            return 0.01;
                          }
                          const info2 = get.info(card2), current = player.getEquip(info2.subtype), value = current && card2 != current && get.value(current, player);
                          let equipValue = info2.ai.equipValue || info2.ai.basic.equipValue;
                          if (typeof equipValue == "function") {
                            if (method == "raw") {
                              return equipValue(card2, player);
                            }
                            if (method == "raw2") {
                              return equipValue(card2, player) - value;
                            }
                            return Math.max(0.1, equipValue(card2, player) - value);
                          }
                          if (typeof equipValue != "number") {
                            equipValue = 0;
                          }
                          if (method == "raw") {
                            return equipValue;
                          }
                          if (method == "raw2") {
                            return equipValue - value;
                          }
                          return Math.max(0.1, equipValue - value);
                        },
                    },
                    result: {
                        target: (player, target, card2) => get.equipResult(player, target, card2),
                    },
                },
                onLose: function () {
                    if (player.storage.counttrigger && player.storage.counttrigger.csh_aoenwu_diamond > 0) {
                        delete player.storage.counttrigger.csh_aoenwu_diamond;
                    }
                },
                enable: true,
                selectTarget: -1,
                filterTarget: (card2, player, target) => player == target && target.canEquip(card2, true),
                modTarget: true,
                allowMultiple: false,
                content: async function(event) {
                    const { card, target } = event;
                    if (!card?.cards.some((card2) => get.position(card2, true) !== "o")) {
                      await target.equip(card);
                    }
                  },
                toself: true,
            },
            "csh_aoenwu_club": {
                fullskin: true,
                derivation: "csh_shanyuezhiyin",
                cardcolor: "club",
                image: "ext:池子魔将/image/card/pyzhuren_club.png",
                type: "equip",
                subtype: "equip1",
                distance: {
                    attackFrom: -1,
                },
                skills: ["csh_aoenwu_club"],
                ai: {
                    basic: {
                        equipValue: 5,
                        order: (card2, player) => {
                          const equipValue = get.equipValue(card2, player) / 20;
                          return player && player.hasSkillTag("reverseEquip") ? 8.5 - equipValue : 8 + equipValue;
                        },
                        useful: 2,
                        value: (card2, player, index, method) => {
                          if (!player.getCards("e").includes(card2) && !player.canEquip(card2, true)) {
                            return 0.01;
                          }
                          const info2 = get.info(card2), current = player.getEquip(info2.subtype), value = current && card2 != current && get.value(current, player);
                          let equipValue = info2.ai.equipValue || info2.ai.basic.equipValue;
                          if (typeof equipValue == "function") {
                            if (method == "raw") {
                              return equipValue(card2, player);
                            }
                            if (method == "raw2") {
                              return equipValue(card2, player) - value;
                            }
                            return Math.max(0.1, equipValue(card2, player) - value);
                          }
                          if (typeof equipValue != "number") {
                            equipValue = 0;
                          }
                          if (method == "raw") {
                            return equipValue;
                          }
                          if (method == "raw2") {
                            return equipValue - value;
                          }
                          return Math.max(0.1, equipValue - value);
                        },
                    },
                    result: {
                        target: (player, target, card2) => get.equipResult(player, target, card2),
                    },
                },
                loseDelay: false,
                onLose: function () {
                    if (player.storage.counttrigger && player.storage.counttrigger.csh_aoenwu_club > 0) {
                        delete player.storage.counttrigger.csh_aoenwu_club;
                    }
                    player.addTempSkill("csh_aoenwu_club_lose");
                },
                enable: true,
                selectTarget: -1,
                filterTarget: (card2, player, target) => player == target && target.canEquip(card2, true),
                modTarget: true,
                allowMultiple: false,
                content: async function(event) {
                    const { card, target } = event;
                    if (!card?.cards.some((card2) => get.position(card2, true) !== "o")) {
                      await target.equip(card);
                    }
                  },
                toself: true,
            },
            "csh_aoenwu_spade": {
                fullskin: true,
                derivation: "csh_shanyuezhiyin",
                cardcolor: "spade",
                image: "ext:池子魔将/image/card/pyzhuren_spade.png",
                type: "equip",
                subtype: "equip1",
                skills: ["csh_aoenwu_spade"],
                ai: {
                    basic: {
                        equipValue: 3,
                        order: (card2, player) => {
                          const equipValue = get.equipValue(card2, player) / 20;
                          return player && player.hasSkillTag("reverseEquip") ? 8.5 - equipValue : 8 + equipValue;
                        },
                        useful: 2,
                        value: (card2, player, index, method) => {
                          if (!player.getCards("e").includes(card2) && !player.canEquip(card2, true)) {
                            return 0.01;
                          }
                          const info2 = get.info(card2), current = player.getEquip(info2.subtype), value = current && card2 != current && get.value(current, player);
                          let equipValue = info2.ai.equipValue || info2.ai.basic.equipValue;
                          if (typeof equipValue == "function") {
                            if (method == "raw") {
                              return equipValue(card2, player);
                            }
                            if (method == "raw2") {
                              return equipValue(card2, player) - value;
                            }
                            return Math.max(0.1, equipValue(card2, player) - value);
                          }
                          if (typeof equipValue != "number") {
                            equipValue = 0;
                          }
                          if (method == "raw") {
                            return equipValue;
                          }
                          if (method == "raw2") {
                            return equipValue - value;
                          }
                          return Math.max(0.1, equipValue - value);
                        },
                    },
                    result: {
                        target: (player, target, card2) => get.equipResult(player, target, card2),
                    },
                },
                enable: true,
                selectTarget: -1,
                filterTarget: (card2, player, target) => player == target && target.canEquip(card2, true),
                modTarget: true,
                allowMultiple: false,
                content: async function(event) {
                    const { card, target } = event;
                    if (!card?.cards.some((card2) => get.position(card2, true) !== "o")) {
                      await target.equip(card);
                    }
                  },
                toself: true,
            },
            "csh_chuqibuyi": {
                audio: "chuqibuyi",
                enable: true,
                type: "trick",
                fullskin: true,
                image: "image/card/chuqibuyi.png",
                derivation: "csh_fanghaoqibing",
                filterTarget: function (card, player, target) {
                    return target !== player && target.countCards("h") > 0;
                },
                defaultYingbianEffect: "add",
                async content(event, trigger, player) {
                    const { target, card } = event;
                    if (player.isDead() || !target.hasCards("h")) {
                        return;
                    }
                    const result = await player.choosePlayerCard(target, "h", true).forResult();
                    if (!result.bool) {
                        return;
                    }
                    await target.showCards(result.cards);
                    if (get.suit(card) !== get.suit(result.cards[0])) {
                        await target.damage();
                    }
                },
                ai: {
                    basic: {
                        order: 5,
                        useful: 2,
                        value: 6,
                    },
                    yingbian: function (card, player, targets, viewer) {
                        if (get.attitude(viewer, player) <= 0) return 0;
                        if (game.hasPlayer(function (current) {
                            return !targets.includes(current) && lib.filter.targetEnabled2(card, player, current) && get.effect(current, card, player, player) > 0;
                        })) return 6;
                        return 0;
                    },
                    result: {
                        target: function (player, target, card) {
                            const suit = get.suit(card);
                            // 花色随机未确定时按 3/4 差异概率估值（不按无色必中估值）
                            const undetermined = suit !== "spade" && suit !== "heart" && suit !== "club" && suit !== "diamond";
                            const view = player.hasSkillTag("viewHandcard", null, target, true);
                            let fz = 0, fm = 0;
                            target.getCards("h", function (i) {
                                if (undetermined) {
                                    fz += 0.75; fm++;
                                    return;
                                }
                                if (i.isKnownBy(player)) {
                                    if (suit !== get.suit(i)) {
                                        if (view || get.is.shownCard(i)) return;
                                        fz++; fm++;
                                    } else if (!view && !get.is.shownCard(i)) fm++;
                                } else {
                                    fz += 0.75; fm++;
                                }
                            });
                            if (!fm) return 0;
                            return -2 * fz / fm;
                        },
                    },
                    tag: {
                        damage: 1,
                    },
                },
                selectTarget: 1,
            },
            "csh_suijiyingbian": {
                audio: "suijiyingbian",
                global: "csh_suijiyingbian_skill",
                fullskin: true,
                image: "image/card/suijiyingbian.png",
                derivation: "csh_fanghaoqibing",
                notarget: true,
                type: "trick",
            },
            "csh_huntianyi": {
                fullskin: true,
                image: "ext:池子魔将/image/card/huntianyi.png",
                derivation: "csh_jieluji_gailan",
                type: "equip",
                subtype: "equip5",
                cardcolor: "diamond",
                ai: {
                    order: 9.5,
                    equipValue: function (card, player) {
                        if (player.hp == 1) return 5;
                        return 0;
                    },
                    basic: {
                        equipValue: 2,
                        order: (card2, player) => {
                          const equipValue = get.equipValue(card2, player) / 20;
                          return player && player.hasSkillTag("reverseEquip") ? 8.5 - equipValue : 8 + equipValue;
                        },
                        useful: 2,
                        value: (card2, player, index, method) => {
                          if (!player.getCards("e").includes(card2) && !player.canEquip(card2, true)) {
                            return 0.01;
                          }
                          const info2 = get.info(card2), current = player.getEquip(info2.subtype), value = current && card2 != current && get.value(current, player);
                          let equipValue = info2.ai.equipValue || info2.ai.basic.equipValue;
                          if (typeof equipValue == "function") {
                            if (method == "raw") {
                              return equipValue(card2, player);
                            }
                            if (method == "raw2") {
                              return equipValue(card2, player) - value;
                            }
                            return Math.max(0.1, equipValue(card2, player) - value);
                          }
                          if (typeof equipValue != "number") {
                            equipValue = 0;
                          }
                          if (method == "raw") {
                            return equipValue;
                          }
                          if (method == "raw2") {
                            return equipValue - value;
                          }
                          return Math.max(0.1, equipValue - value);
                        },
                    },
                    result: {
                        target: (player, target, card2) => get.equipResult(player, target, card2),
                    },
                },
                onLose: function () {
                    player.addTempSkill("csh_huntianyi_skill_lose");
                    if (event.getParent(2) && event.getParent(2).name == "csh_huntianyi_skill") {
                        cards.forEach(function (card) {
                            card.fix();
                            card.remove();
                            card.destroyed = true;
                            game.log(card, "被销毁了");
                        });
                    }
                },
                skills: ["csh_huntianyi_skill"],
                enable: true,
                selectTarget: -1,
                filterTarget: (card2, player, target) => player == target && target.canEquip(card2, true),
                modTarget: true,
                allowMultiple: false,
                content: async function(event) {
                    const { card, target } = event;
                    if (!card?.cards.some((card2) => get.position(card2, true) !== "o")) {
                      await target.equip(card);
                    }
                  },
                toself: true,
            },
            "csh_muniu": {
                fullskin: true,
                image: "image/card/muniu.png",
                derivation: "csh_lifeng_shuliang",
                type: "equip",
                subtype: "equip5",
                nomod: true,
                async onEquip(event, trigger, player) {
                    const { card } = event;
                    if (card && card.storages?.length) {
                        player.directgains(card.storages, null, "muniu");
                    }
                    player.markSkill("csh_muniu_skill");
                },
                forceDie: true,
                async onLose(event, trigger, player) {
                    const { card } = event;
                    if (card?.storage?.used) {
                        card.storage.used = 0;
                    }
                    if (!player.countVCards("e", (i) => i.name === "csh_muniu")) {
                        player.unmarkSkill("csh_muniu_skill");
                    } else {
                        player.markSkill("csh_muniu_skill");
                    }
                    if (!card || !card.storages || !card.storages.length) {
                        return;
                    }
                    if ((!event.getParent(3) || event.getParent(3).name !== "swapEquip") && (event.getParent().type !== "equip" || event.getParent().swapEquip)) {
                        player.lose(card.storages, ui.discardPile);
                        player.$throw(card.storages, 1e3);
                        player.popup("muniu");
                        game.log(card, "掉落了", card.storages);
                        card.storages.length = 0;
                    } else {
                        player.lose(card.storages, ui.special);
                    }
                },
                clearLose: true,
                equipDelay: false,
                loseDelay: false,
                skills: ["csh_muniu_skill", "csh_muniu_skill7"],
                ai: {
                    equipValue(card) {
                        if (card.storages) {
                            return 7 + card.storages.length;
                        }
                        return 7;
                    },
                    basic: {
                        equipValue: 7
                    }
                }
            },
            "csh_pyzhuren_shandian": {
                fullskin: true,
                // 扩展内置天雷刃卡图
                image: "ext:池子魔将/image/card/pyzhuren_shandian.png",
                derivation: "csh_tianjing",
                cardcolor: "spade",
                type: "equip",
                subtype: "equip1",
                distance: {
                    attackFrom: -3,
                },
                skills: ["csh_pyzhuren_shandian_skill"],
                onDestroy: function (card) {
                    if (_status.pyzhuren && _status.pyzhuren[card.name]) {
                        delete _status.pyzhuren[card.name];
                    }
                },
                ai: {
                    basic: {
                        equipValue: 3,
                        order: (card2, player) => {
                          const equipValue = get.equipValue(card2, player) / 20;
                          return player && player.hasSkillTag("reverseEquip") ? 8.5 - equipValue : 8 + equipValue;
                        },
                        useful: 2,
                        value: (card2, player, index, method) => {
                          if (!player.getCards("e").includes(card2) && !player.canEquip(card2, true)) {
                            return 0.01;
                          }
                          const info2 = get.info(card2), current = player.getEquip(info2.subtype), value = current && card2 != current && get.value(current, player);
                          let equipValue = info2.ai.equipValue || info2.ai.basic.equipValue;
                          if (typeof equipValue == "function") {
                            if (method == "raw") {
                              return equipValue(card2, player);
                            }
                            if (method == "raw2") {
                              return equipValue(card2, player) - value;
                            }
                            return Math.max(0.1, equipValue(card2, player) - value);
                          }
                          if (typeof equipValue != "number") {
                            equipValue = 0;
                          }
                          if (method == "raw") {
                            return equipValue;
                          }
                          if (method == "raw2") {
                            return equipValue - value;
                          }
                          return Math.max(0.1, equipValue - value);
                        },
                    },
                    result: {
                        target: (player, target, card2) => get.equipResult(player, target, card2),
                    },
                },
                enable: true,
                selectTarget: -1,
                filterTarget: (card2, player, target) => player == target && target.canEquip(card2, true),
                modTarget: true,
                allowMultiple: false,
                content: async function(event) {
                    const { card, target } = event;
                    if (!card?.cards.some((card2) => get.position(card2, true) !== "o")) {
                      await target.equip(card);
                    }
                  },
                toself: true,
            },
            "csh_tiejiliguduo": {
                fullskin: true,
                image: "ext:池子魔将/image/card/tiejili.png",
                derivation: "csh_xianxiamanyong",
                type: "equip",
                subtype: "equip1",
                cardcolor: "spade",
                loseDelay: false,
                distance: {
                    attackRange: function (card, player) {
                        return player.storage.csh_tiejiliguduo_skill || 2;
                    },
                    attackFrom: -1,
                },
                ai: {
                    basic: {
                        equipValue: 2,
                        order: (card2, player) => {
                          const equipValue = get.equipValue(card2, player) / 20;
                          return player && player.hasSkillTag("reverseEquip") ? 8.5 - equipValue : 8 + equipValue;
                        },
                        useful: 2,
                        value: (card2, player, index, method) => {
                          if (!player.getCards("e").includes(card2) && !player.canEquip(card2, true)) {
                            return 0.01;
                          }
                          const info2 = get.info(card2), current = player.getEquip(info2.subtype), value = current && card2 != current && get.value(current, player);
                          let equipValue = info2.ai.equipValue || info2.ai.basic.equipValue;
                          if (typeof equipValue == "function") {
                            if (method == "raw") {
                              return equipValue(card2, player);
                            }
                            if (method == "raw2") {
                              return equipValue(card2, player) - value;
                            }
                            return Math.max(0.1, equipValue(card2, player) - value);
                          }
                          if (typeof equipValue != "number") {
                            equipValue = 0;
                          }
                          if (method == "raw") {
                            return equipValue;
                          }
                          if (method == "raw2") {
                            return equipValue - value;
                          }
                          return Math.max(0.1, equipValue - value);
                        },
                    },
                    result: {
                        target: (player, target, card2) => get.equipResult(player, target, card2),
                    },
                },
                skills: ["csh_tiejiliguduo_skill"],
                async onLose(event, trigger, player) {
                    delete player.storage.csh_tiejiliguduo_skill;
                    player.unmarkSkill("csh_tiejiliguduo_skill");
                },
                destroy: true,
                async onEquip({ player, card }) {
                    if (!card.storage.csh_tiejiliguduo_skill) {
                        card.storage.csh_tiejiliguduo_skill = 2;
                    }
                    player.storage.csh_tiejiliguduo_skill = card.storage.csh_tiejiliguduo_skill;
                    if (typeof lib.cshSyncStorage === "function") lib.cshSyncStorage(player, "csh_tiejiliguduo_skill");
                },
                enable: true,
                selectTarget: -1,
                filterTarget: (card2, player, target) => player == target && target.canEquip(card2, true),
                modTarget: true,
                allowMultiple: false,
                content: async function(event) {
                    const { card, target } = event;
                    if (!card?.cards.some((card2) => get.position(card2, true) !== "o")) {
                      await target.equip(card);
                    }
                  },
                toself: true,
            },
            "csh_tuixinzhifu": {
                audio: "tuixinzhifu",
                type: "trick",
                fullskin: true,
                image: "image/card/tuixinzhifu.png",
                derivation: "csh_dabing_shicai",
                enable: true,
                filterTarget(card, player, target) {
                    return target !== player && target.countGainableCards(player, "hej") > 0;
                },
                range: {
                    global: 1,
                },
                async content(event, trigger, player) {
                    const { target } = event;
                    if (!target.hasGainableCards(player, "hej")) {
                        return;
                    }
                    const result = await player.gainPlayerCard(target, "hej", true, [1, 2]).forResult();
                    if (result?.bool && result?.cards?.length && target.isIn()) {
                        const num = result.cards.length;
                        const he = player.getCards("he");
                        if (!he.length) {
                            return;
                        }
                        await player.chooseToGive(target, Math.min(he.length, num), `交给${get.translation(target)}${get.cnNumber(num)}张牌`, "he", true);
                    }
                },
                ai: {
                    order: 5,
                    tag: {
                        loseCard: 1,
                        gain: 0.5,
                    },
                    wuxie(target, card, player, viewer) {
                        if (get.attitude(player, target) > 0 && get.attitude(viewer, player) > 0) {
                            return 0;
                        }
                    },
                    result: {
                        target(player, target) {
                            if (get.attitude(player, target) <= 0) {
                                return (target.hasCards("he", (card) => {
                                    return get.value(card, target) > 0 && card !== target.getEquip("jinhe");
                                }) ? -0.3 : 0.3) * Math.sqrt(player.countCards("h"));
                            }
                            return (target.hasCards("ej", (card) => {
                                if (get.position(card) === "e") {
                                    return get.value(card, target) <= 0;
                                }
                                const cardj = card.viewAs ? { name: card.viewAs } : card;
                                return get.effect(target, cardj, target, player) < 0;
                            }) ? 1.5 : -0.3) * Math.sqrt(player.countCards("h"));
                        },
                    },
                },
                selectTarget: 1,
            },
            "csh_dan": {
                // 设计：不挂 recover（满血可自用）；不引入 nature；转交时清空 event.cards 以免进弃牌堆
                // 包内无「视为丹」；content 不做 isCard 强拦（避免实体牌标记差异误杀）
                audio: true,
                fullskin: true,
                image: "ext:池子魔将/image/card/csh_dan.png",
                type: "basic",
                enable: true,
                savable: true,
                deadTarget: true,
                selectTarget: 1,
                filterTarget(card, player, target) {
                    if (!target) return false;
                    const evt = _status.event;
                    // 濒死：濒死角色
                    if (evt && (evt.type === "dying" || (typeof evt.getParent === "function" && evt.getParent("dying")))) {
                        const dying = evt.dying || (evt.getParent && evt.getParent("dying") && evt.getParent("dying").player);
                        if (dying) return target === dying;
                        return target.isIn() && target.hp <= 0;
                    }
                    // 复活
                    if (typeof target.isDead === "function" && target.isDead()) {
                        return target !== player;
                    }
                    // 出牌：自己（含满血）或其它存活（转交）
                    if (target === player) return true;
                    return typeof target.isIn === "function" && target.isIn();
                },
                modTarget(card, player, target) {
                    if (!target) return false;
                    if (typeof target.isDead === "function" && target.isDead()) return target !== player;
                    if (target === player) return true;
                    return !!(target.isIn && target.isIn());
                },
                async content(event, trigger, player) {
                    const cards = (event.cards || []).filter(c => c && get.itemtype(c) === "card");
                    const target = event.target || player;
                    if (!target) return;

                    // ④ 复活
                    if (typeof target.isDead === "function" && target.isDead()) {
                        const newMax = Math.max(1, (target.maxHp || 1) - 1);
                        if (typeof target.reviveEvent === "function") await target.reviveEvent(1);
                        else await target.revive(1);
                        if (target.maxHp > newMax) await target.loseMaxHp(target.maxHp - newMax);
                        if (target.hp !== 1) {
                            if (typeof target.changeHp === "function") {
                                target.changeHp(1 - target.hp);
                            } else if (target.hp < 1) {
                                await target.recover(1 - target.hp);
                            } else if (target.hp > 1) {
                                await target.loseHp(target.hp - 1);
                            }
                        }
                        game.log(target, "因", "#y【丹】", "复活");
                        return;
                    }

                    // ② 转交
                    if (target !== player && target.isIn()) {
                        const giveCards = cards.length ? cards.slice() : [];
                        event.cards = [];
                        if (giveCards.length) {
                            if (typeof player.give === "function") {
                                await player.give(giveCards, target);
                            } else {
                                await target.gain(giveCards, player, "give");
                            }
                            game.log(player, "将", "#y【丹】", "交给了", target);
                        }
                        await player.draw();
                        return;
                    }

                    // ① / ③ 服用：先上限再回血（满血可）
                    await target.gainMaxHp(1);
                    await target.recover(1);
                },
                ai: {
                    basic: {
                        order(card, player) {
                            if (!player) player = _status.event && _status.event.player;
                            if (player && game.dead && game.dead.some(d => get.attitude(player, d) > 2)) return 9;
                            if (player && player.hasSkillTag && player.hasSkillTag("pretao")) return 8;
                            return 10;
                        },
                        useful: [11, 10, 9],
                        value: [11, 10, 9],
                    },
                    result: {
                        target(player, target) {
                            if (!target) return 0;
                            const att = get.attitude(player, target);
                            if (typeof target.isDead === "function" && target.isDead()) {
                                if (att <= 0) return -15;
                                if (target.identity === "nei") return 0.5;
                                return 6 + (target.isZhu || target.identity === "zhu" ? 4 : 0);
                            }
                            if (target !== player) {
                                if (att <= 0) return -6;
                                let v = 1.5;
                                if (target.hp <= 1) v += 2.5;
                                if (target.hp < target.maxHp) v += 1;
                                return v;
                            }
                            let v = 3.2;
                            if (target.hp < target.maxHp) v += 3;
                            if (target.hp <= 1) v += 5;
                            return v;
                        },
                        player(player, target) {
                            if (target && target !== player && target.isIn()) return 1.2;
                            return 0;
                        },
                    },
                    tag: {
                        save: 1,
                    },
                },
            },
            "csh_quanjiu": {
                type: "trick",
                enable: true,
                fullskin: true,
                image: "ext:池子魔将/image/csh_quanjiu.png",
                audio: "mpmaotao",
                selectTarget: -1,
                filterTarget: true,
                reverseOrder: true,
                async content(event, trigger, player) {
                    const { target } = event;
                    const next = target.chooseToUse("劝酒：使用一张【酒】或点数为9的牌，否则受到你造成的1点伤害", (...args) => {
                        const card = args[0];
                        if (get.name(card) !== "jiu" && get.number(card) !== "unsure" && get.number(card) !== 9) {
                            return false;
                        }
                        return lib.filter.filterCard(...args);
                    });
                    next.set("ai1", (card) => {
                        if (typeof card != "object" || !card) return 0;
                        const player = _status.event.player;
                        let val = get.value(card, player);
                        // 视为【酒】的【杀】【闪】按低价值估算；濒死时任何牌都值得用
                        if (card.name == "sha" || card.name == "shan" || player.hp <= 1) val = Math.min(val, 2);
                        return -_status.event.effect - val;
                    }).set("ai2", (...args) => get.effect_use(...args) - _status.event.effect).set("effect", get.effect(target, { name: "damage" }, player, target)).set("addCount", false);
                    const result = await next.forResult();
                    if (!result.bool) {
                        // 受到你造成的1点伤害（联机/单机同源）
                        await target.damage(player, 1);
                    }
                },
                ai: {
                    wuxie(target, card, player, viewer, status) {
                        const att = get.attitude(viewer, target);
                        const eff = get.effect(target, card, player, target);
                        if (Math.abs(att) < 1 || status * eff * att >= 0) {
                            return 0;
                        }
                        return 1;
                    },
                    basic: {
                        order(item, player) {
                            if (!player) player = _status.event && _status.event.player;
                            if (!player) return 7.2;
                            // 场上敌人多、敌方缺酒/9点时更想打劝酒
                            let enemies = 0, weak = 0;
                            game.filterPlayer(t => t !== player && t.isIn()).forEach(t => {
                                const att = get.attitude(player, t);
                                if (att >= 0) return;
                                enemies++;
                                if (!t.hasCard(c => get.name(c) === "jiu" || get.number(c) === 9, "hs")) weak++;
                            });
                            if (enemies >= 2 && weak >= 1) return 9.2;
                            if (enemies >= 1) return 8.0;
                            return 3.5;
                        },
                        useful: [5, 1],
                        value: 5,
                    },
                    result: {
                        player(player, target) {
                            let res = 0;
                            const att = get.sgnAttitude(player, target);
                            // 对敌：期望造成伤害；对己/友：尽量不劝
                            const dmgEff = get.damageEffect(target, player, player) || get.effect(target, { name: "damage" }, player, player);
                            if (att < 0) {
                                res += Math.max(0.5, -dmgEff * 0.15);
                                // 手牌少更难出酒，更易受伤
                                if (target.countCards("hs") <= 1) res += 1.2;
                                if (target.hp === 1) res += 1.5;
                            } else if (att > 0) {
                                res -= 2.5 + target.hp * 0.3;
                            }
                            res -= att * (0.3 * target.countCards("hs") + 0.2 * target.countCards("e"));
                            return res;
                        },
                        target(player, target) {
                            const att = get.attitude(player, target);
                            if (att > 0) return -1.5;
                            // 敌方：血少/牌少更差
                            let r = -1.2;
                            if (target.hp <= 1) r -= 1.2;
                            if (target.countCards("hs") <= 1) r -= 0.8;
                            return r;
                        },
                    },
                    tag: {
                        respond: 1,
                        multitarget: 1,
                        multineg: 1,
                    },
                },
            },
        },
        translate: {
            "csh_huoshan": "火山",
            "csh_huoshan_info": "出牌阶段，对自己使用。若判定结果为红桃，则目标角色受到2点火焰<span style='color:#e74c3c'>伤害</span>，距离目标1以内的其他角色受到1点火焰<span style='color:#e74c3c'>伤害</span>。若判定结果不为红桃，将此牌移至下家的判定区。",
            "csh_hongshui": "洪水",
            "csh_hongshui_info": "出牌阶段，对自己使用。若判定结果为梅花，该角色随机<span style='color:#bd7ce0'>弃置</span>三张牌，距离其为X的角色随机<span style='color:#bd7ce0'>弃置</span>3-X张牌（无牌则失去1点<span style='color:#eb7a33'>体力</span>）；若判定结果不为梅花，将此牌移至下家的判定区。",
            "池子魔将": "池子魔将",
            "csh_xiandaoshazhao": "仙道杀招",
            "csh_xiandaoshazhao_info": "出牌阶段，对一名其他角色使用。你亮出牌堆顶的五张牌，依次对其使用其中所有的【杀】，然后将剩余的牌置于牌堆底。",
            "csh_fangyuan_niliuhushenyin": "逆流护身印",
            "csh_fangyuan_niliuhushenyin_info": "出牌阶段，对你使用。你获得2枚『逆』标记并进入逆流护体状态；你的回合开始前，若你有『逆』标记，你移去1枚『逆』标记、<span style='color:#34d17b'>回复</span>1点<span style='color:#eb7a33'>体力</span>并跳过此回合；当你没有『逆』标记的回合开始前，你结束逆流护体并正常进行此回合。逆流护体期间，你不能成为牌和技能的目标，受到的<span style='color:#e74c3c'>伤害</span>防止，且【春秋】与【仙杀】不能发动。此牌不可被【无懈可击】响应。",
            "csh_chuqibuyi": "出其不意",
            "csh_chuqibuyi_info": "出牌阶段，对一名有手牌的其他角色使用。你展示其一张手牌，若此牌与此牌花色不同，其受到1点<span style='color:#e74c3c'>伤害</span>。",
            "csh_suijiyingbian": "随机应变",
            "csh_suijiyingbian_info": "此牌的牌名视为你本回合内使用或打出的上一张基本牌或普通锦囊牌。",
            "csh_huntianyi": "浑天仪",
            "csh_huntianyi_info": "锁定技，当你受到<span style='color:#e74c3c'>伤害</span>时，你失去装备区里的【浑天仪】，防止此<span style='color:#e74c3c'>伤害</span>。当你失去装备区里的【浑天仪】后，你从牌堆摸两张与此牌点数相同的普通锦囊牌（不足则尽量摸）。",
            "csh_muniu": "木牛流马",
            "csh_muniu_info": "①出牌阶段限一次，你可以将一张手牌扣置于你装备区里的【木牛流马】下，然后你可以将【木牛流马】移动到一名其他角色的装备区里。②你可以将【木牛流马】下的牌如手牌般使用或打出。③当你失去装备区的【木牛流马】后，你刷新〖木牛流马①〗的使用次数限制。若此牌不是因置入其他角色的装备区而失去的，则你将【木牛流马】下的所有牌置入弃牌堆。此牌由〖输粮〗生成，进入弃牌堆后被销毁。",
            "csh_pyzhuren_shandian": "天雷刃",
            "csh_pyzhuren_shandian_info": "当你使用【杀】指定目标后，可令其进行判定，若结果为：黑桃，其受到1点雷属性<span style='color:#e74c3c'>伤害</span>；梅花，其弃置两张牌；方片，你摸三张牌；红桃，你<span style='color:#34d17b'>回复</span>1点<span style='color:#eb7a33'>体力</span>。",
            "csh_tiejiliguduo": "铁蒺藜骨朵",
            "csh_tiejiliguduo_info": "准备阶段，你可以将此牌的攻击范围改为x，直到回合结束或此牌离开你的装备区（x为你的<span style='color:#eb7a33'>体力</span>值）。当此牌离开你的装备区后，销毁之。",
            "csh_tuixinzhifu": "推心置腹",
            "csh_tuixinzhifu_info": "出牌阶段，对一名距离为1的其他角色使用。你获得其区域内的至多两张牌，然后交给其等量的牌。",
            "csh_aoenwu_heart": "红缎枪",
            "csh_aoenwu_heart_info": "每回合限一次，当你使用【杀】造成<span style='color:#e74c3c'>伤害</span>后，你进行判定：若结果为红色，你<span style='color:#34d17b'>回复</span>1点<span style='color:#eb7a33'>体力</span>；若结果为黑色，你摸两张牌。",
            "csh_aoenwu_diamond": "烈淬刀",
            "csh_aoenwu_diamond_info": "每回合限两次，当你使用【杀】对目标角色造成<span style='color:#e74c3c'>伤害</span>时，你可以<span style='color:#bd7ce0'>弃置</span>一张牌，令此<span style='color:#e74c3c'>伤害</span>+1。你使用【杀】的次数上限+1。",
            "csh_aoenwu_club": "水波剑",
            "csh_aoenwu_club_info": "每回合限两次，当你使用普通锦囊牌或【杀】时，你可以为此牌增加一个目标。当你失去装备区里的【水波剑】后，你<span style='color:#34d17b'>回复</span>1点<span style='color:#eb7a33'>体力</span>。",
            "csh_aoenwu_spade": "混毒弯匕",
            "csh_aoenwu_spade_info": "当你使用【杀】指定目标后，你可令其失去X点<span style='color:#eb7a33'>体力</span>（X为此技能本回合内发动过的次数且至多为5）。",
            "csh_dan": "丹",
            "csh_dan_info": "①出牌阶段，对你使用：你增加1点<span style='color:#c27a30'>体力上限</span>并<span style='color:#34d17b'>回复</span>1点<span style='color:#eb7a33'>体力</span>。<br>②出牌阶段，你可将此牌交给一名其他角色，然后你摸一张牌。<br>③当一名角色濒死时，可对该角色使用：其增加1点<span style='color:#c27a30'>体力上限</span>并<span style='color:#34d17b'>回复</span>1点<span style='color:#eb7a33'>体力</span>。<br>④对一名已阵亡的其他角色使用：令其复活（<span style='color:#c27a30'>体力上限</span>-1且至少为1，<span style='color:#eb7a33'>体力</span>为1）。",
            "csh_quanjiu": "劝酒",
            "csh_quanjiu_bg": "劝",
            "csh_quanjiu_info": "出牌阶段，对所有角色使用。令目标角色使用一张【酒】或点数为9的牌，否则其受到你造成的1点<span style='color:#e74c3c'>伤害</span>。",
        },
        list: [],
    };
