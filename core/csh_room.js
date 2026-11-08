/* 池子魔将 · 进行中房间的跨进程快照与入场凭据（2026-11-09 · 工作包 B）
 *
 * 问题：入场扣款走 `csh_shell.doCharge → wallet.spend → spendPC → scheduleSave()`
 *   （250ms 防抖），**没有任何 journal**。扣款落盘后玩家在局中关闭宿主 / 被系统杀进程，
 *   钱已经从钱包扣掉，而世上没有任何记录能证明「这笔扣款属于哪一桌」——
 *   于是既不能续局，也不知道该退给谁。见 docs/audit/ROOM_RECOVERY_B1_STATE_TABLE_20261109.md。
 *
 * 本模块只解决「凭据 + 快照 + 恢复判定」这一层，不碰钱、不碰 UI、不读牌桌：
 *   prepare   扣款**之前**同步落盘并读回确认；写不进去就不许扣款、不许开桌。
 *   activate  扣款成功、首手发牌后进入 active，带上首份快照。
 *   save      局内每手 / 每条街结束时更新快照，saveSeq 单调 + expectSeq 乐观锁。
 *   beginSettle  调 settleSession 之前置位，说明「这局正在结算」。
 *   markSettled  settleRun 成功后置位（钱的真凭据在钱包 roomSettledId，与本键互为兜底）。
 *   decide    重启时的判定：none / discard / resume / settled / unknown / corrupt。
 *
 * ★ 头号不变量：只有 `pc === balanceBefore` 才说明「扣款根本没落盘」，此时可以安全丢弃；
 *   其余一律不许退钱 —— 退款必须由上层按真实结算结果执行，本模块绝不写钱。
 *
 * 纯逻辑 + 单本机键。storage / wallet 由调用方注入，便于反例隔离。
 * 篡改 / 损坏一律判 corrupt 并清键，不猜余额、不退款。
 */
(function (root) {
  'use strict';

  var KEY = 'csh_room_v1';
  var VERSION = 1;
  var ID_RE = /^[a-zA-Z0-9_-]{10,100}$/;
  var TABLE_RE = /^[a-z]{3,20}$/;
  var SHOT_MAX = 48 * 1024;          // 快照 JSON 上限；德州 ~60 字段实测 < 4KB
  var DECK_MAX = 52;
  var CARD_MAX = 51;

  function fail(reason, extra) {
    var out = { ok: false, reason: reason };
    if (extra) { for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k]; }
    return out;
  }
  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
  function isSafe(v) { return typeof v === 'number' && Number.isSafeInteger(v); }

  /* ---------- 快照校验 ---------- */
  /* 只做「安全与形态」：尺寸、原型污染、牌值域与去重。
     具体牌桌的语义（谁该行动、底池是否等于各家投入之和）属于牌桌自己的不变量，
     放在页面侧与后续专项里，不在这里假装通用。 */
  function badKey(k) { return k === '__proto__' || k === 'constructor' || k === 'prototype'; }

  function scan(obj, depth) {
    if (depth > 6) return '快照层级过深';
    if (obj === null || typeof obj !== 'object') return '';
    if (Object.prototype.toString.call(obj) === '[object Array]') {
      if (obj.length > 64) return '快照数组过长';
      for (var i = 0; i < obj.length; i++) {
        var e = scan(obj[i], depth + 1);
        if (e) return e;
      }
      return '';
    }
    var keys = Object.keys(obj);
    if (keys.length > 64) return '快照字段过多';
    for (var j = 0; j < keys.length; j++) {
      if (badKey(keys[j])) return '快照含非法键名';
      var v = obj[keys[j]], t = typeof v;
      if (t === 'function' || t === 'symbol' || t === 'bigint') return '快照含非法值类型';
      if (t === 'object') { var sub = scan(v, depth + 1); if (sub) return sub; }
    }
    return '';
  }
  function cardArray(v, maxLen, label, seen) {
    if (v == null) return '';
    if (Object.prototype.toString.call(v) !== '[object Array]') return label + '不是数组';
    if (v.length > maxLen) return label + '过长';
    for (var i = 0; i < v.length; i++) {
      if (!isInt(v[i]) || v[i] < 0 || v[i] > CARD_MAX) return label + '牌值非法';
      if (seen) { if (seen[v[i]]) return label + '有重复牌'; seen[v[i]] = 1; }
    }
    return '';
  }
  function validateShot(shot) {
    if (shot == null) return '';
    if (typeof shot !== 'object' || Object.prototype.toString.call(shot) === '[object Array]') return '快照不是对象';
    var err = scan(shot, 0);
    if (err) return err;
    var text;
    try { text = JSON.stringify(shot); } catch (e) { return '快照无法序列化'; }
    if (typeof text !== 'string') return '快照无法序列化';
    if (text.length > SHOT_MAX) return '快照过大';
    var seen = Object.create(null);
    err = cardArray(shot.deck, DECK_MAX, '牌堆', seen);
    if (err) return err;
    err = cardArray(shot.community, 5, '公共牌', seen);
    if (err) return err;
    /* 选手手牌：德州多人 / 廿一点若干手，统一按 {holes:[[a,b],...]} 或 [[a,b],...] 两种形态收 */
    var holes = shot.holes;
    if (holes != null) {
      if (Object.prototype.toString.call(holes) !== '[object Array]') return '手牌记录不是数组';
      if (holes.length > 9) return '手牌记录过长';
      for (var i = 0; i < holes.length; i++) {
        err = cardArray(holes[i], 2, '手牌', null);
        if (err) return err;
      }
    }
    return '';
  }

  /* ---------- 存储 ---------- */
  function rawRead(storage) {
    var raw;
    try { raw = storage.getItem(KEY); } catch (e) { throw new Error('房间凭据读取失败'); }
    if (raw == null || raw === '') return null;
    var d;
    try { d = JSON.parse(raw); } catch (e) { throw new Error('房间凭据损坏'); }
    if (!d || typeof d !== 'object' || Object.prototype.toString.call(d) === '[object Array]') throw new Error('房间凭据损坏');
    if (d.v !== VERSION) throw new Error('房间凭据版本不支持');
    if (d.phase !== 'preparing' && d.phase !== 'active' && d.phase !== 'settling' && d.phase !== 'settled') throw new Error('房间凭据阶段非法');
    if (typeof d.id !== 'string' || !ID_RE.test(d.id)) throw new Error('房间凭据编号非法');
    if (typeof d.table !== 'string' || !TABLE_RE.test(d.table)) throw new Error('房间凭据牌桌非法');
    if (!isSafe(d.amount) || d.amount <= 0) throw new Error('房间凭据金额非法');
    if (!isSafe(d.balanceBefore) || d.balanceBefore < d.amount) throw new Error('房间凭据余额非法');
    if (!isSafe(d.saveSeq) || d.saveSeq < 0) throw new Error('房间凭据序号非法');
    if (!isSafe(d.t) || d.t < 0) throw new Error('房间凭据时间非法');
    if (d.phase === 'settled') {
      if (!isSafe(d.credit) || d.credit < 0) throw new Error('房间结算凭据非法');
    } else {
      var shotErr = validateShot(d.shot);
      if (shotErr) throw new Error('房间快照非法：' + shotErr);
    }
    return d;
  }
  function read(storage) {
    var d = rawRead(storage);
    return d ? JSON.parse(JSON.stringify(d)) : null;
  }
  function rawWrite(storage, entry) {
    var text = JSON.stringify(entry);
    storage.setItem(KEY, text);
    if (storage.getItem(KEY) !== text) throw new Error('房间凭据写回不一致');
  }
  function clear(storage) {
    try { storage.removeItem(KEY); } catch (e) { throw new Error('房间凭据清除失败'); }
    if (storage.getItem(KEY) != null) throw new Error('房间凭据清除失败');
    return { ok: true };
  }
  function clearQuiet(storage) { try { clear(storage); } catch (e) { /* 只用于损坏/已完成条目 */ } }

  /* ---------- 事务 ---------- */
  /* 扣款前调用。已有别的未决房间则拒绝——同一时刻只允许一桌。 */
  function prepare(storage, opts) {
    opts = opts || {};
    if (typeof opts.id !== 'string' || !ID_RE.test(opts.id)) return fail('房间凭据编号无效');
    if (typeof opts.table !== 'string' || !TABLE_RE.test(opts.table)) return fail('房间牌桌无效');
    if (!isSafe(opts.amount) || opts.amount <= 0) return fail('房间扣款金额无效');
    if (!isSafe(opts.balanceBefore) || opts.balanceBefore < opts.amount) return fail('房间余额基线无效');
    var old;
    try { old = rawRead(storage); } catch (e) {
      /* 损坏的旧条目不该阻塞玩家入场，但也不能假装它是好的：清掉再建。 */
      clearQuiet(storage);
      old = null;
    }
    if (old) {
      if (old.id === opts.id) return { ok: true, already: true };
      return fail('存在另一局未完成的牌桌');
    }
    var shotErr = validateShot(opts.shot);
    if (shotErr) return fail('房间快照非法：' + shotErr);
    try {
      rawWrite(storage, {
        v: VERSION, phase: 'preparing', id: opts.id, table: opts.table,
        amount: opts.amount, balanceBefore: opts.balanceBefore,
        saveSeq: 0, t: Math.max(0, Math.floor(Number(opts.t) || 0)),
        shot: opts.shot ? JSON.parse(JSON.stringify(opts.shot)) : null,
      });
      return { ok: true, already: false };
    } catch (e) { return fail(e.message); }
  }

  /* 扣款成功、首手发牌后调用：preparing → active。 */
  function activate(storage, id, shot) {
    var d;
    try { d = rawRead(storage); } catch (e) { return fail(e.message); }
    if (!d) return fail('房间凭据不存在');
    if (d.id !== id) return fail('房间凭据编号不符');
    if (d.phase === 'active' || d.phase === 'settling' || d.phase === 'settled') return { ok: true, already: true, phase: d.phase };
    if (d.phase !== 'preparing') return fail('房间阶段不允许开桌');
    var shotErr = validateShot(shot);
    if (shotErr) return fail('房间快照非法：' + shotErr);
    try {
      rawWrite(storage, Object.assign({}, d, {
        phase: 'active', saveSeq: d.saveSeq + 1,
        shot: shot ? JSON.parse(JSON.stringify(shot)) : null,
      }));
      return { ok: true, already: false };
    } catch (e) { return fail(e.message); }
  }

  /* 局内更新快照。expectSeq 给了就必须与当前一致（防旧页面实例覆盖新档）。 */
  function save(storage, id, shot, expectSeq) {
    var d;
    try { d = rawRead(storage); } catch (e) { return fail(e.message); }
    if (!d) return fail('房间凭据不存在');
    if (d.id !== id) return fail('房间凭据编号不符');
    if (d.phase === 'settled') return fail('房间已结算');
    if (d.phase === 'settling') return { ok: true, skipped: 'settling' };
    if (d.phase !== 'active') return fail('房间尚未开桌');
    if (expectSeq != null) {
      if (!isSafe(expectSeq)) return fail('快照序号无效');
      if (expectSeq !== d.saveSeq) return fail('快照已被更新');
    }
    var shotErr = validateShot(shot);
    if (shotErr) return fail('房间快照非法：' + shotErr);
    try {
      rawWrite(storage, Object.assign({}, d, {
        saveSeq: d.saveSeq + 1,
        shot: shot ? JSON.parse(JSON.stringify(shot)) : null,
      }));
      return { ok: true, saveSeq: d.saveSeq + 1 };
    } catch (e) { return fail(e.message); }
  }

  /* 调 settleSession 之前：置位，之后不再接受快照更新。 */
  function beginSettle(storage, id) {
    var d;
    try { d = rawRead(storage); } catch (e) { return fail(e.message); }
    if (!d) return fail('房间凭据不存在');
    if (d.id !== id) return fail('房间凭据编号不符');
    if (d.phase === 'settling' || d.phase === 'settled') return { ok: true, already: true };
    if (d.phase !== 'active') return fail('房间尚未开桌');
    try {
      /* 不递增 saveSeq：阶段推进不是一次快照更新，别让乐观锁误判。 */
      rawWrite(storage, Object.assign({}, d, { phase: 'settling' }));
      return { ok: true, already: false };
    } catch (e) { return fail(e.message); }
  }

  /* 钱包结算成功（同一笔 durable 写入已含 roomSettledId）之后调用。 */
  function markSettled(storage, id, credit) {
    var d;
    try { d = rawRead(storage); } catch (e) { return fail(e.message); }
    if (!d) return { ok: true, already: true };
    if (d.id !== id) return fail('房间凭据编号不符');
    if (d.phase === 'settled') return { ok: true, already: true };
    if (!isSafe(credit) || credit < 0) return fail('结算金额无效');
    try {
      rawWrite(storage, {
        v: VERSION, phase: 'settled', id: d.id, table: d.table,
        amount: d.amount, balanceBefore: d.balanceBefore,
        saveSeq: d.saveSeq, t: d.t, credit: credit, shot: null,
      });
      return { ok: true, already: false };
    } catch (e) { return fail(e.message); }
  }

  /* ---------- 恢复判定 ---------- */
  /* wallet = { pc():number, settledId():string }。
     只回答「该做什么」，不动钱、不清键（清键由调用方在展示后执行）。 */
  function decide(storage, wallet) {
    var d;
    try { d = rawRead(storage); } catch (e) {
      return { action: 'corrupt', reason: e.message };
    }
    if (!d) return { action: 'none' };
    var sid = '';
    try { sid = String((wallet && typeof wallet.settledId === 'function' ? wallet.settledId() : '') || ''); } catch (eS) { sid = ''; }
    if (sid && sid === d.id) return { action: 'settled', entry: d, credit: d.phase === 'settled' ? d.credit : null };
    if (d.phase === 'settled') return { action: 'settled', entry: d, credit: d.credit };
    var pc = NaN;
    try { pc = Number(wallet && typeof wallet.pc === 'function' ? wallet.pc() : NaN); } catch (eP) { pc = NaN; }
    if (!isFinite(pc)) return { action: 'unknown', entry: d, reason: '钱包余额不可读' };
    /* ★ 唯一可以安全丢弃的情形：余额与扣款前完全一致 ⇒ 扣款根本没落盘。
       其余一律不许退钱，也不许当成没扣过 —— 退回给玩家或重开一局都可能是造钱。 */
    if (pc === d.balanceBefore) return { action: 'discard', entry: d, reason: '扣款未持久化' };
    return {
      action: 'resume', entry: d,
      charged: pc === d.balanceBefore - d.amount,
      reason: pc === d.balanceBefore - d.amount ? '' : '余额已变动（可能含补码），按已扣款处理',
    };
  }

  root.CSHRoom = Object.freeze({
    KEY: KEY, VERSION: VERSION, SHOT_MAX: SHOT_MAX,
    read: read, prepare: prepare, activate: activate, save: save,
    beginSettle: beginSettle, markSettled: markSettled,
    clear: clear, decide: decide, validateShot: validateShot,
  });
})(typeof window !== 'undefined' ? window : this);
