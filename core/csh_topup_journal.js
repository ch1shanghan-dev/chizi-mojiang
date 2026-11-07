/* 池子魔将 · 德州补码未决事务凭据（2026-11-07 · D2 后续）
 *
 * 问题：`csh_wallet.spendPC` 用 scheduleSave() 异步写盘。D2 只做到「内存读回确认」：
 *   扣款成功 → ACK → 页面上桌；若此时进程中断且钱包写盘失败，桌面筹码没了但钱扣了
 *   （或反过来：写盘成功、页面没上桌，玩家平白损失）。方案 §3.1 要求两条都不许出现。
 *
 * 事务（照 U0—U4 的 prepare / commit / 启动恢复纪律）：
 *   prepare  扣款**之前**同步写 prepared 凭据并读回确认；写不进去就不扣款、不上桌。
 *   spend    宿主走同一条 wallet.spend 出账路径。
 *   commit   页面确认筹码已上桌后清除凭据。
 *   recover  重启发现未决凭据 → 按 balanceBefore 判断扣款是否已持久化，幂等退款。
 *
 * ★ 关键：不能无条件退款。若钱包写盘根本没成功（重启后 pc === balanceBefore），
 *   退款等于凭空送钱。只有 pc === balanceBefore - amount 才说明扣款已持久化、需要退回。
 *
 * 纯逻辑 + 单本机键，不进存档迁移（EXCLUDED 已登记），不碰 CBY 账本真相，不读牌桌。
 * storage 与 wallet 由调用方注入，便于反例隔离；篡改 / 损坏一律清键并如实报错，不退款。
 */
(function (root) {
  'use strict';
  var KEY = 'csh_topup_pending_v1';
  var VERSION = 1;
  var ID_RE = /^[a-zA-Z0-9_-]{10,100}$/;

  function read(storage) {
    var raw;
    try { raw = storage.getItem(KEY); } catch (e) { throw new Error('补码凭据读取失败'); }
    if (raw == null || raw === '') return null;
    var d = JSON.parse(raw);
    if (!d || d.v !== VERSION || (d.phase !== 'prepared' && d.phase !== 'refunding') ||
        typeof d.id !== 'string' || !ID_RE.test(d.id) ||
        !Number.isSafeInteger(d.amount) || d.amount <= 0 ||
        !Number.isSafeInteger(d.balanceBefore) || d.balanceBefore < d.amount ||
        !Number.isSafeInteger(d.t) || d.t < 0) throw new Error('补码凭据损坏');
    return d;
  }
  function write(storage, entry) {
    var text = JSON.stringify(entry);
    storage.setItem(KEY, text);
    if (storage.getItem(KEY) !== text) throw new Error('补码凭据写回不一致');
  }
  function clear(storage) {
    storage.removeItem(KEY);
    if (storage.getItem(KEY) != null) throw new Error('补码凭据清除失败');
  }
  function fail(reason) { return { ok: false, reason: reason }; }

  /* 扣款前调用。同一 id 幂等；已有别的未决事务则拒绝，不覆盖。 */
  function prepare(storage, entry) {
    entry = entry || {};
    if (typeof entry.id !== 'string' || !ID_RE.test(entry.id) ||
        !Number.isSafeInteger(entry.amount) || entry.amount <= 0 ||
        !Number.isSafeInteger(entry.balanceBefore) || entry.balanceBefore < entry.amount) return fail('补码凭据参数无效');
    var old;
    try { old = read(storage); } catch (e) { return fail(e.message); }
    if (old) return old.id === entry.id ? { ok: true, already: true } : fail('存在另一笔未决补码');
    try {
      write(storage, { v: VERSION, phase: 'prepared', id: entry.id, amount: entry.amount,
        balanceBefore: entry.balanceBefore, t: Math.max(0, Math.floor(Number(entry.t) || 0)) });
      return { ok: true, already: false };
    } catch (e) { return fail(e.message); }
  }

  /* 页面上桌成功后调用。id 不符绝不清别人的凭据。 */
  function commit(storage, id) {
    var old;
    try { old = read(storage); } catch (e) { return fail(e.message); }
    if (!old) return { ok: true, already: true };
    if (old.id !== id) return fail('补码凭据编号不符');
    try { clear(storage); return { ok: true, already: false }; } catch (e) { return fail(e.message); }
  }

  /* 扣款失败 / 未发出 ACK 时回滚：只清自己的凭据，不动钱。 */
  function abort(storage, id) {
    var old;
    try { old = read(storage); } catch (e) { return fail(e.message); }
    if (!old) return { ok: true, already: true };
    if (old.id !== id) return fail('补码凭据编号不符');
    try { clear(storage); return { ok: true, already: false }; } catch (e) { return fail(e.message); }
  }

  /* 启动 / 惰性恢复。wallet = {pc():number, add(n,reason):boolean|number}。
     返回 {refunded, reason}；任何异常都不重复退款、不吞钱。 */
  function recover(storage, wallet) {
    var d;
    try { d = read(storage); } catch (e) {
      try { clear(storage); } catch (_e) {}
      return { refunded: 0, reason: e.message + '，已清除损坏凭据' };
    }
    if (!d) return { refunded: 0, reason: '' };
    var pc = Number(wallet && typeof wallet.pc === 'function' ? wallet.pc() : NaN);
    var wasCharged = pc === d.balanceBefore - d.amount;
    var alreadyRefunded = pc === d.balanceBefore;
    if (!wasCharged && !alreadyRefunded) {
      try { clear(storage); } catch (_e) {}
      return { refunded: 0, reason: '余额已变化，保守不退款并清除凭据' };
    }
    if (alreadyRefunded) {
      try { clear(storage); } catch (_e) {}
      return { refunded: 0, reason: d.phase === 'refunding' ? '上次退款已完成' : '扣款未持久化，无需退款' };
    }
    /* 先把凭据推进到 refunding 再动钱：中途崩溃重跑也知道钱可能已退。 */
    try {
      write(storage, { v: VERSION, phase: 'refunding', id: d.id, amount: d.amount,
        balanceBefore: d.balanceBefore, t: d.t });
    } catch (e) { return { refunded: 0, reason: e.message }; }
    var added = wallet.add(d.amount, "德州补码未决退款");   /* E30：双引号字面量来源 */
    if (added === false || Number(wallet.pc()) !== d.balanceBefore) {
      return { refunded: 0, reason: '退款未确认，凭据保留待重试' };  /* 保留 refunding 凭据 */
    }
    try { clear(storage); } catch (e) { return { refunded: d.amount, reason: '退款成功但凭据清除失败' }; }
    return { refunded: d.amount, reason: '' };
  }

  root.CSHTopUpJournal = Object.freeze({
    KEY: KEY, VERSION: VERSION,
    read: read, prepare: prepare, commit: commit, abort: abort, recover: recover
  });
})(typeof window !== 'undefined' ? window : this);
