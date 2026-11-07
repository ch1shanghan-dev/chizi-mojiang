/* 池子魔将 · 妖灵特色增益运行态（2026-11-07 · 设计方案 S2）
 *
 * 来源：docs/WORKBUDDY_DESIGN_GAMEPLAY_NUMERIC_ART_20261107.md §2.4
 *       core/csh_spirit_buffs.js（S1 只读数据层，50 条 / 6 模板 / B 档单一解锁）
 *
 * 职责边界（改动前先读方案）：
 *   · 只管「本局这一只妖灵的增益消费状态」：解锁判定、每局一次计数、迟到回调、换档隔离。
 *   · 会话由助战模块的 run.id 建立，助战结束 / 进程中断由 end() 或 reset() 清掉。
 *   · 纯内存，不落盘、不碰经济、不改奖励、不改胜负、不读牌堆，也不挂战斗技能触发器。
 *     六类效果的引擎触发点属于后续接线，不在这里假装已生效。
 *   · 对 S1 数据层是**延迟读取**（begin/consume 时才取 window.CSHSpiritBuffs），
 *     因此两个文件的加载顺序不影响正确性；缺数据层时全部拒绝，不默认放行。
 *
 * 与 S1 同款：IIFE 挂 window，零 import、零加载时序依赖。
 */
(function (root) {
  'use strict';
  var VERSION = 2;
  var sessions = Object.create(null);
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  /* 持续型模板（S4 语义定案）：本局**激活一次**后常驻，直到助战结束。
     设计方案 §2.1 的 perGame=1 对它们指「激活一次」，不是「每次查询消耗一次」——
     手牌上限 / 距离每帧都会被引擎查询，若走 consume 会在第二次被判 exhausted。
     其余四类仍是一次性触发，走 consume。两类共用同一份 perGame 计数，天然互斥。 */
  var PERSISTENT = Object.freeze({ T3_hand_cap: 1, T4_distance: 1 });
  function isPersistent(template) { return has(PERSISTENT, template); }

  function table() { return root && root.CSHSpiritBuffs ? root.CSHSpiritBuffs : null; }
  function deny(reason, used) { return { ok: false, reason: reason, repeated: false, used: used || 0 }; }

  /* 只读快照：外部改不动内部状态，也看不到内部可变对象。 */
  function snapshot(id) {
    var s = has(sessions, id) ? sessions[id] : null;
    if (!s) return null;
    var used = {}, tokens = {}, activated = {}, k;
    for (k in s.used) if (has(s.used, k)) used[k] = s.used[k];
    for (k in s.tokens) if (has(s.tokens, k)) tokens[k] = s.tokens[k].ok;
    for (k in s.activated) if (has(s.activated, k)) activated[k] = true;
    return Object.freeze({
      sessionId: s.id, epoch: s.epoch, spiritId: s.spiritId, level: s.level,
      active: s.active, template: s.template, perGame: s.perGame,
      used: Object.freeze(used), tokens: Object.freeze(tokens),
      activated: Object.freeze(activated), ended: s.ended
    });
  }

  /* 同一 sessionId 重复 begin 直接返回已有会话 —— 关掉状态面板再打开不重置已消耗次数。 */
  function begin(opt) {
    opt = opt || {};
    var id = opt.sessionId;
    if (typeof id !== 'string' || !id) return null;
    if (has(sessions, id)) return snapshot(id);
    var t = table(), buff = t ? t.get(opt.spiritId) : null;
    var level = typeof opt.level === 'string' ? opt.level : '';
    var active = !!(buff && t.unlocked(level, opt.spiritId));
    sessions[id] = {
      id: id, epoch: opt.epoch, spiritId: opt.spiritId, level: level,
      active: active, template: buff ? buff.template : null,
      perGame: buff ? buff.perGame : 0,
      used: Object.create(null), tokens: Object.create(null),
      activated: Object.create(null), ended: false
    };
    return snapshot(id);
  }

  /* consume(sessionId, template, token, epoch)
     token 是本次触发的唯一标识：同一 token 的迟到回调返回第一次的结论，不再改 used。
     epoch 不一致（换档 / 旧局回包）直接拒绝，且不计入次数。 */
  function consume(id, template, token, epoch) {
    var s = has(sessions, id) ? sessions[id] : null;
    if (!s || s.ended) return deny('no-session', 0);
    if (epoch !== undefined && epoch !== s.epoch) return deny('epoch-changed', s.used[template] || 0);
    if (!s.active) return deny('locked', 0);
    var t = table();
    if (!t || !has(t.TEMPLATES, template)) return deny('bad-template', 0);
    if (template !== s.template) return deny('wrong-template', 0);
    var used = s.used[template] || 0;
    var tk = token == null ? null : String(token);
    if (tk && has(s.tokens, tk)) {
      var c = s.tokens[tk];
      return { ok: c.ok, reason: c.reason, repeated: true, used: used };
    }
    var res;
    if (used >= s.perGame) res = deny('exhausted', used);
    else { s.used[template] = used + 1; res = { ok: true, reason: '', repeated: false, used: used + 1 }; }
    if (tk) s.tokens[tk] = { ok: res.ok, reason: res.reason, template: template };
    return res;
  }

  /* 持续型增益：首次调用占掉 perGame=1 的机会并置 activated，之后每次查询直接返回常驻。
     引擎会反复调用 mod 函数，所以重复调用绝不能再消耗次数。 */
  function activate(id, template, token, epoch) {
    var s = has(sessions, id) ? sessions[id] : null;
    if (!s || s.ended) return { ok: false, reason: 'no-session', active: false, first: false };
    if (epoch !== undefined && epoch !== s.epoch) return { ok: false, reason: 'epoch-changed', active: false, first: false };
    if (!s.active || template !== s.template || !isPersistent(template))
      return { ok: false, reason: 'not-persistent', active: false, first: false };
    if (s.activated[template]) return { ok: true, reason: '', active: true, first: false, repeated: true };
    var r = consume(id, template, token, epoch);
    if (!r.ok) return { ok: false, reason: r.reason, active: false, first: false };
    s.activated[template] = true;
    return { ok: true, reason: '', active: true, first: true, repeated: !!r.repeated };
  }
  /* 供 mod 函数每帧只读查询：会话结束 / 换档 / 未激活一律 false。 */
  function isActive(id, template, epoch) {
    var s = has(sessions, id) ? sessions[id] : null;
    if (!s || s.ended || !s.active) return false;
    if (epoch !== undefined && epoch !== s.epoch) return false;
    return !!s.activated[template];
  }

  function end(id) {
    if (typeof id === 'string' && has(sessions, id)) { delete sessions[id]; return true; }
    return false;
  }
  /* 换档：清掉所有不属于当前存档代次的会话，旧局回包连会话都找不到。 */
  function switchEpoch(epoch) {
    var n = 0;
    for (var id in sessions) if (has(sessions, id) && sessions[id].epoch !== epoch) { delete sessions[id]; n++; }
    return n;
  }
  function reset() { for (var id in sessions) if (has(sessions, id)) delete sessions[id]; }
  function count() { var n = 0; for (var id in sessions) if (has(sessions, id)) n++; return n; }
  function activeTemplate(id) { var s = snapshot(id); return s && s.active ? s.template : null; }

  root.CSHSpiritBuffRuntime = Object.freeze({
    VERSION: VERSION, PERSISTENT: PERSISTENT,
    begin: begin, consume: consume, activate: activate, isActive: isActive,
    isPersistent: isPersistent, end: end, switchEpoch: switchEpoch,
    reset: reset, count: count, snapshot: snapshot, activeTemplate: activeTemplate
  });
})(typeof window !== 'undefined' ? window : this);
