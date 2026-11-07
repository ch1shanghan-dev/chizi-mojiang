/* 池子魔将 · 横屏视口令牌单一真值（2026-11-07 · 设计方案 §4.1 实施期纠偏）
 *
 * 方案原写「16 个文件断点 330/500/760 混用 → 统一 --csh-vp-short:420px」。
 * 复核源码后按事实纠偏：
 *   · 330 与 500 **不是混用**，是有意的两档 —— 330 = 极矮横屏（640×286）额外收缩，
 *     500 = 一般矮横屏（915×412 / 844×390）常规收缩。合并成 420 会让 640×286
 *     拿不到额外收缩，牌桌首屏被挤出（违反 §4.2「不挤牌桌」）。
 *   · 760 是窄屏宽度档，按 art-direction.md §4.3「手机横屏常比桌面断点宽」，
 *     **不能**因为 width>760 就套桌面布局；桌面档必须同时满足 1365×768。
 *
 * 所以本模块统一的是**口径与唯一真值**，不改任何现有 @media 数值（零布局风险）。
 * CSS 侧同名变量写在 csh_layout.css 的 :root（media query 不能用 var()，仅作文档与
 * 未来 @custom-media 迁移的单一来源）；JS 侧分类以本模块为准。
 * IIFE 挂 window，零 import、零加载时序依赖。
 */
(function (root) {
  'use strict';
  var VERSION = 1;
  var TOKENS = Object.freeze({
    tinyMaxHeight: 330,      /* --csh-vp-tiny-h  极矮横屏 640×286 */
    shortMaxHeight: 500,     /* --csh-vp-short-h 一般矮横屏 915×412 / 844×390 */
    narrowMaxWidth: 760,     /* --csh-vp-narrow-w 窄屏宽度档 */
    desktopMinWidth: 1365,   /* vp-desktop 下限 */
    desktopMinHeight: 768
  });
  var PROFILES = Object.freeze([
    Object.freeze({ key: 'vp-desktop', w: 1365, h: 768, note: '完整布局、头像与牌面并存' }),
    Object.freeze({ key: 'vp-wide', w: 915, h: 412, note: '手机横屏主战场' }),
    Object.freeze({ key: 'vp-tiny', w: 640, h: 286, note: '主操作 + 公共牌优先' }),
    Object.freeze({ key: 'vp-portrait', w: 390, h: 844, note: '竖屏，纵向列表' })
  ]);

  /* classify(w,h) -> 'vp-desktop' | 'vp-wide' | 'vp-tiny' | 'vp-portrait' | null
     非法输入返回 null，不默认放行成桌面。 */
  function classify(w, h) {
    w = Number(w); h = Number(h);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    if (w >= TOKENS.desktopMinWidth && h >= TOKENS.desktopMinHeight) return 'vp-desktop';
    if (h > w * 1.1) return 'vp-portrait';
    if (h <= TOKENS.tinyMaxHeight) return 'vp-tiny';
    return 'vp-wide';
  }
  function profile(key) {
    for (var i = 0; i < PROFILES.length; i++) if (PROFILES[i].key === key) return PROFILES[i];
    return null;
  }
  /* §4.3 定则：只有真正达到桌面尺寸才允许桌面布局。 */
  function isDesktopLayout(w, h) { return classify(w, h) === 'vp-desktop'; }
  function isLandscapePhone(w, h) {
    var c = classify(w, h);
    return c === 'vp-wide' || c === 'vp-tiny';
  }

  root.CSHViewport = Object.freeze({
    VERSION: VERSION, TOKENS: TOKENS, PROFILES: PROFILES,
    classify: classify, profile: profile, isDesktopLayout: isDesktopLayout, isLandscapePhone: isLandscapePhone
  });
})(typeof window !== 'undefined' ? window : this);
