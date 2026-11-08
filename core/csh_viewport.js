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
  var VERSION = 2;   /* v2：增加断点逐值收敛的迁移真值（只给依据，不改任何 @media） */
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

  /* ------------------------------------------------------------------
     断点逐值收敛的迁移真值（2026-11-08）
     I1 已按本表把 height:430 的 21 处 max-height 与 1 处配对 min-height
     整批收敛到 500（三横屏 + 1.5 缩放几何零变化，480 视口按预期命中），
     报告见 docs/audit/WORKBUDDY_I1_VIEWPORT_430_CONVERGENCE_20261108.md。
     430 保留在本表作为历史依据；已收敛的值不再出现在全仓扫描中。
     定表时全仓实测 max-height 15 种 / max-width 13 种，合并 24 种。E2 的四档分类
     装不下中等高度（520–640）与中宽（899–1199），所以目标定为 6 档：
       height 330(tiny) / 500(short) / 640(mid-h，新增档)
       width  760(narrow) / 1000(mid-w，新增档) / 1200(wide-w，新增档)
     max-* 断点改大 = 扩大触发范围，改小 = 缩小；两者都必须逐页比三横屏截图，
     不能只按数字替换。direction / risk / newTier 由代码算，不手写第二份事实。
     ------------------------------------------------------------------ */
  var TARGETS = Object.freeze({
    height: Object.freeze([330, 500, 640]),
    width: Object.freeze([760, 1000, 1200])
  });
  var MIGRATIONS = Object.freeze({
    height: Object.freeze({
      330: [330, 'vp-tiny'], 340: [330, 'vp-tiny'], 350: [330, 'vp-tiny'],
      400: [500, 'vp-wide'], 430: [500, 'vp-wide'], 440: [500, 'vp-wide'],
      450: [500, 'vp-wide'], 480: [500, 'vp-wide'], 500: [500, 'vp-wide'],
      520: [500, 'vp-wide'], 560: [640, 'vp-mid-h'], 599: [640, 'vp-mid-h'],
      600: [640, 'vp-mid-h'], 620: [640, 'vp-mid-h'], 640: [640, 'vp-mid-h']
    }),
    width: Object.freeze({
      420: [760, 'vp-narrow'], 480: [760, 'vp-narrow'], 540: [760, 'vp-narrow'],
      559: [760, 'vp-narrow'], 600: [760, 'vp-narrow'], 620: [760, 'vp-narrow'],
      640: [760, 'vp-narrow'], 720: [760, 'vp-narrow'], 750: [760, 'vp-narrow'],
      760: [760, 'vp-narrow'], 899: [1000, 'vp-mid-w'], 1000: [1000, 'vp-mid-w'],
      1199: [1200, 'vp-wide-w']
    })
  });
  /* 冻结每一行，避免外部改写迁移表绕过门禁 */
  Object.keys(MIGRATIONS).forEach(function (a) {
    Object.keys(MIGRATIONS[a]).forEach(function (k) { Object.freeze(MIGRATIONS[a][k]); });
  });
  function migrationOf(value, axis) {
    var a = axis === 'max-height' ? 'height' : (axis === 'max-width' ? 'width' : axis);
    var v = Number(value);
    if ((a !== 'height' && a !== 'width') || !Number.isFinite(v)) return null;
    var table = MIGRATIONS[a];
    if (!Object.prototype.hasOwnProperty.call(table, v)) return null;
    var row = table[v], to = row[0];
    var direction = to > v ? 'expand' : (to < v ? 'shrink' : 'same');
    return Object.freeze({
      from: v, to: to, axis: a, token: row[1], direction: direction,
      risk: direction === 'same' ? 'low' : 'high',
      newTier: a === 'height' ? to === 640 : (to === 1000 || to === 1200)
    });
  }

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
    TARGETS: TARGETS, MIGRATIONS: MIGRATIONS, migrationOf: migrationOf,
    classify: classify, profile: profile, isDesktopLayout: isDesktopLayout, isLandscapePhone: isLandscapePhone
  });
})(typeof window !== 'undefined' ? window : this);
