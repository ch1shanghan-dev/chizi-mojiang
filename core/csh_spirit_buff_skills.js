/* 池子魔将 · 妖灵特色增益六类技能（2026-11-07 · 设计方案 S4）
 *
 * D4 语义定案：T1/T2/T5/T6 是一次性触发（consume），T3/T4 是持续型常驻（activate + isActive）。
 * 本模块只产出技能对象，不直接碰 lib / game —— host 由 csh_aux_spirit.js 注入，
 * 反例可直接注入假 host 与真实运行态，逐类验证 filter / content / mod，不需要完整引擎。
 *
 * 红线：filter 里**绝不调用 consume**（引擎会多次调用 filter，会提前耗掉次数），
 * 只做只读的 available 判定；真正占次数一律放在 content 的 take() 里。
 * 不改胜负判定、不读隐藏牌、不发 CBY、不写钱包、不改已入座者 stake/skill。
 */
(function (root) {
  'use strict';
  var VERSION = 1;
  var ONCE = Object.freeze({ t1: 'T1_guard_damage', t2: 'T2_draw_once', t5: 'T5_response_once', t6: 'T6_recover_once' });
  var PERSIST = Object.freeze({ t3: 'T3_hand_cap', t4: 'T4_distance' });

  function create(host) {
    var seq = 0;
    function RT() { try { return host.runtime() || null; } catch (e) { return null; } }
    function SES() { try { return host.session() || null; } catch (e) { return null; } }
    function sessionOK(p) {
      var r = SES(), rt = RT();
      try { return !!(rt && r && r.spirit && host.active(r.spirit) && p === host.me()); }
      catch (e) { return false; }
    }
    /* 只读：能否触发。引擎每次 filter 都会调，绝不消耗次数。 */
    function available(template) {
      var r = SES(), rt = RT();
      if (!rt || !r) return false;
      var s = rt.snapshot(r.id);
      return !!(s && s.active && s.template === template && (s.used[template] || 0) < s.perGame);
    }
    /* 真正占掉本局唯一一次机会；失败不执行效果。 */
    function take(p, template) {
      var r = SES(), rt = RT();
      if (!rt || !r || !sessionOK(p)) return null;
      var token = r.id + ':' + template + ':' + (++seq);
      return rt.consume(r.id, template, token, r.epoch).ok ? rt : null;
    }
    /* 持续型：首次激活后每帧常驻，重复查询不再消耗。 */
    function modReady(player, template) {
      var r = SES(), rt = RT();
      if (!rt || !r || !sessionOK(player) || rt.activeTemplate(r.id) !== template) return false;
      var x = rt.activate(r.id, template, r.id + ':' + template + ':mod', r.epoch);
      return !!(x && x.ok && x.active);
    }
    function note(text) { try { host.log(text); } catch (e) {} }
    function refresh() { try { host.refresh(); } catch (e) {} }

    return {
      /* T1 护主·减伤：本局首次受到伤害时，此伤害 -1 */
      t1: {
        charlotte: true, forced: true, popup: false, trigger: { global: 'damageBegin4' },
        filter: function (e, p) {
          return sessionOK(p) && e.player === p && e.num > 0 && available(ONCE.t1);
        },
        content: async function (event, trigger, player) {
          if (!take(player, ONCE.t1)) return;
          trigger.num -= 1;
          refresh();
          note('妖灵增益 · 护主减伤：本局首次伤害 -1');
          return true;
        }
      },
      /* T2 助战·摸牌：本局首次出牌命中后，摸 1 张牌 */
      t2: {
        charlotte: true, forced: true, popup: false, trigger: { global: 'useCardAfter' },
        filter: function (e, p) {
          return sessionOK(p) && e.player === p && !!(e.targets && e.targets.length) && available(ONCE.t2);
        },
        content: async function (event, trigger, player) {
          if (!take(player, ONCE.t2)) return;
          await host.draw(1);
          refresh();
          note('妖灵增益 · 助战摸牌：本局首次命中后摸 1 张');
          return true;
        }
      },
      /* T3 共谋·手牌：本局手牌上限 +1（持续型，每帧查询常驻） */
      t3: {
        charlotte: true,
        mod: {
          maxHandcard: function (player, num) {
            return modReady(player, PERSIST.t3) ? num + 1 : num;
          }
        }
      },
      /* T4 同行·距离：本局与其他角色距离 -1（持续型） */
      t4: {
        charlotte: true,
        mod: {
          globalFrom: function (from, to, distance) {
            return modReady(from, PERSIST.t4) ? Math.max(1, distance - 1) : distance;
          }
        }
      },
      /* T5 接应·响应：本局首次需要响应时，视为已响应 1 次 */
      t5: {
        charlotte: true, forced: true, popup: false, trigger: { player: 'chooseToRespondBegin' },
        filter: function (e, p) {
          return sessionOK(p) && !!e && available(ONCE.t5);
        },
        content: async function (event, trigger, player) {
          if (!take(player, ONCE.t5)) return;
          /* 只标记本次响应已由妖灵接应，不伪造具体牌、不改牌堆、不改胜负。 */
          trigger.result = { bool: true, cards: [] };
          if (typeof trigger.finish === 'function') trigger.finish();
          refresh();
          note('妖灵增益 · 接应响应：本局首次需要响应时视为已响应 1 次');
          return true;
        }
      },
      /* T6 回护·回复：本局首次濒死时，回复 1 点体力 */
      t6: {
        charlotte: true, forced: true, popup: false, trigger: { global: 'dying' },
        filter: function (e, p) {
          return sessionOK(p) && e.player === p && e.player.hp <= 0 && available(ONCE.t6);
        },
        content: async function (event, trigger, player) {
          if (!take(player, ONCE.t6)) return;
          await host.recover(1);
          refresh();
          note('妖灵增益 · 回护回复：本局首次濒死回复 1 点体力');
          return true;
        }
      }
    };
  }

  root.CSHSpiritBuffSkills = Object.freeze({ VERSION: VERSION, ONCE: ONCE, PERSIST: PERSIST, create: create });
})(typeof window !== 'undefined' ? window : this);
