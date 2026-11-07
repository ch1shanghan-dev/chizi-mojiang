/* 池子魔将 · 世界同桌 AI 跨桌冷却（2026-11-07 · 设计方案 §3.2 实施期纠偏）
 *
 * 方案原文写「退隐 0–49 全池 / 50–99 排除已退隐角色」，但 core/csh_world.js 的
 * activeList() 早就无条件 `!a.retired && fund >= AI_MIN_STAKE`，排除退隐不是新增能力。
 * 方案里「退隐越多，跨桌重复概率越低」的因果也是反的：**缩小候选池只会提高重复率**。
 * 真正缺的是「同一角色不连续出现在相邻几桌」的冷却。本模块只做这一件事。
 *
 * 边界（改动前先读方案 §3.2）：
 *   · 只过滤**候选池**，不改已入座者的 stake / skill / persona / 发牌，不改桌级四档。
 *   · 冷却桌数只由当前退隐人数分档：0–99 → 0 桌、100–149 → 1 桌、150+ → 2 桌。
 *   · 过滤后候选为空时**降级回完整池**，绝不空桌、绝不改变能否开局。
 *   · 纯函数 + 纯内存历史，不落盘、不写钱包、不碰世界存档结构；历史由调用方持有。
 *
 * IIFE 挂 window，零 import、零加载时序依赖，与 csh_texas_ai.js / csh_spirit_buffs.js 同款。
 */
(function (root) {
  'use strict';
  var VERSION = 1;

  function cooldownTables(retiredCount) {
    var raw = Number(retiredCount);
    if (!Number.isFinite(raw)) return 0;   /* NaN / Infinity / 非数值一律 0 冷却，不放大 */
    var n = Math.max(0, Math.floor(raw));
    if (n >= 150) return 2;
    if (n >= 100) return 1;
    return 0;
  }

  /* filter(pool, history, tables) -> { pool, blocked, degraded }
     history 是最近若干桌的角色 id 数组（旧 -> 新），只取末尾 tables 桌。
     入参一律不改，返回新的池数组，调用方可放心继续用原池。 */
  function filter(pool, history, tables) {
    var rows = Array.isArray(pool) ? pool : [];
    if (!rows.length) return { pool: [], blocked: [], degraded: false };  /* 空池不算「降级」 */
    var n = Math.max(0, Math.floor(Number(tables) || 0));
    if (!n) return { pool: rows.slice(), blocked: [], degraded: false };
    var h = Array.isArray(history) ? history : [];
    var seen = Object.create(null), blocked = [], i, j, k;
    for (i = Math.max(0, h.length - n); i < h.length; i++) {
      var ids = Array.isArray(h[i]) ? h[i] : [];
      for (j = 0; j < ids.length; j++) {
        k = String(ids[j]);
        if (!seen[k]) { seen[k] = 1; blocked.push(k); }
      }
    }
    var kept = rows.filter(function (a) { return a && !seen[String(a.id)]; });
    return kept.length
      ? { pool: kept, blocked: blocked, degraded: false }
      : { pool: rows.slice(), blocked: blocked, degraded: true };
  }

  /* 有界历史：只保留最近 cap 桌，返回新数组（不修改入参）。 */
  function push(history, ids, cap) {
    var h = Array.isArray(history) ? history.slice() : [];
    h.push((Array.isArray(ids) ? ids : []).map(String));
    var capNum = cap == null ? 2 : Number(cap);   /* 0 是合法值，不能被 || 2 吞掉 */
    var limit = Math.max(1, Math.floor(Number.isFinite(capNum) ? capNum : 2));
    while (h.length > limit) h.shift();
    return h;
  }

  root.CSHSeatCooldown = Object.freeze({
    VERSION: VERSION,
    cooldownTables: cooldownTables,
    filter: filter,
    push: push
  });
})(typeof window !== 'undefined' ? window : this);
