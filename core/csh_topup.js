/* 池子魔将 · 德州真实补码（2026-11-07 · 设计方案 §3.1）
 *
 * 规则定案（改动前先读方案 §3.1 / §3.5）：
 *   · 时机：只在一手结算完成、下一手发牌前。手牌进行中、结算未落盘、守恒校验失败一律拒绝。
 *   · 额度：min( ceilToUnit(minBuyIn - tableChips), walletBalance )；
 *           unit = 该档带入的 10% 向上取整（200 档 = 20），低于一个 unit 不提供。
 *   · 次数：每桌上限 2 次。补码不重置前注 / 场供 / 已结算手数，不改已入座者 stake / skill。
 *   · 守恒：钱包支出 = 桌面筹码 + 系统场供 + 已结算派彩；补码只是钱从钱包移到桌面，
 *           不产生也不销毁 CBY。因此 **buyIn（本金基数）必须与桌面筹码同步累加**，
 *           否则 endSession 会把补码的钱算成盈利发回钱包 —— 这是本功能的头号红线。
 *
 * 本模块只做「能不能补 / 补多少 / 状态怎么变」的纯计算，不碰 DOM、不落盘、不碰钱包。
 * 扣款与读回确认在宿主 csh_shell.js 的 shell-topup 命令里；页面只做胶水。
 * IIFE 挂 window，零 import、零加载时序依赖。
 */
(function (root) {
  'use strict';
  var VERSION = 1;
  var MAX_PER_TABLE = 2;

  function unitOf(minBuyIn) {
    var n = Math.max(0, Math.floor(Number(minBuyIn) || 0));
    return Math.max(1, Math.ceil(n / 10));
  }
  function deny(reason) { return { ok: false, amount: 0, reason: reason }; }

  /* quote({minBuyIn, tableChips, walletBalance, used, handOver, sessionOver,
             settled, conservationFailed, pending, maxPerTable}) -> {ok, amount, unit, reason} */
  function quote(o) {
    o = o || {};
    if (o.sessionOver) return deny('本场已结束');
    if (!o.handOver) return deny('本手进行中');
    if (!o.settled) return deny('结算未落盘');
    if (o.conservationFailed) return deny('结算校验未通过');
    if (o.pending) return deny('正在处理上一次补码');
    var used = Math.max(0, Math.floor(Number(o.used) || 0));
    var max = Math.max(0, Math.floor(Number(o.maxPerTable == null ? MAX_PER_TABLE : o.maxPerTable)));
    if (used >= max) return deny('本桌补码已达上限');
    var minBuyIn = Math.max(0, Math.floor(Number(o.minBuyIn) || 0));
    var chips = Math.max(0, Math.floor(Number(o.tableChips) || 0));
    var unit = unitOf(minBuyIn);
    var gap = minBuyIn - chips;
    if (gap < unit) return deny('当前筹码高于补码线');
    var want = Math.ceil(gap / unit) * unit;
    var bal = Math.max(0, Math.floor(Number(o.walletBalance) || 0));
    var amount = Math.floor(Math.min(want, bal) / unit) * unit;
    if (amount < unit) return deny('钱包余额不足');
    return { ok: true, amount: amount, unit: unit, reason: '' };
  }

  /* apply(state, amount, minBuyIn) -> 新的 {chips, buyIn, topUpTotal, topUps} 或 null。
     纯函数，不改入参；金额必须是 unit 的正整数倍且次数未超上限。 */
  function apply(state, amount, minBuyIn) {
    var s = state || {}, unit = unitOf(minBuyIn);
    var n = Math.floor(Number(amount) || 0);
    var used = Math.max(0, Math.floor(Number(s.topUps) || 0));
    if (!Number.isSafeInteger(n) || n <= 0 || n % unit !== 0 || used >= MAX_PER_TABLE) return null;
    return Object.freeze({
      chips: Math.max(0, Math.floor(Number(s.chips) || 0)) + n,
      buyIn: Math.max(0, Math.floor(Number(s.buyIn) || 0)) + n,
      topUpTotal: Math.max(0, Math.floor(Number(s.topUpTotal) || 0)) + n,
      topUps: used + 1
    });
  }

  /* 结算口径自检：补码不该改变「净赢」，即 chips - buyIn 在补码前后恒定。 */
  function netOf(chips, buyIn) {
    return Math.max(0, Math.floor(Number(chips) || 0)) - Math.max(0, Math.floor(Number(buyIn) || 0));
  }

  root.CSHTexasTopUp = Object.freeze({
    VERSION: VERSION, MAX_PER_TABLE: MAX_PER_TABLE,
    unitOf: unitOf, quote: quote, apply: apply, netOf: netOf
  });
})(typeof window !== 'undefined' ? window : this);
