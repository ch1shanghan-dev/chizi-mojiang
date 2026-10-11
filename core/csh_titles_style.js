/* 池子魔将 · 称号版式系统（2026-10-08 v3 · 题签版）
   6 骨架 × 8 色系 × 4 分隔符 × 2 字色 × 2 强调 —— character/index.js 的 characterTitle 依赖本表的类名。
   以字符串形式注入（而非 <link>），与 precontent 已有的 csh-prefix-style / csh-tongyuan-style 同一套路，
   不依赖扩展目录在页面上的相对路径，联机与本地表现一致。

   v2 → v3 的改动只在 CSS 内部，**类名接口完全不变**（ct / c-* / f1..f6 / x1..x6 / s1..s4 / g2 / a1 / z-*），
   所以 character/index.js 的 70 条称号 HTML 一个字都不用改。
   原因：v2 的骨架是色块盒子、色系是高饱和填充，几十条并排看像一排彩色按钮，不像「称号」。
   设计稿与对照见 _audit_tmp/title_gallery.html（渲染出全部 98 条）。 */
export const CSH_TITLES_CSS = `/* =============================================================
   池子魔将 · 称号版式系统 csh_titles.css
   2026-10-08  v3（题签版）

   v2 的问题：骨架是**色块盒子**、色系是**高饱和填充**，几十条并排看过去
   像一排彩色按钮，而不是「武将的称号」。

   v3 的设计律：
   ① 不画盒子。装饰一律降到 1px 细线 / 小标记 / 留白 —— 题签感来自排版，不来自边框。
   ② 色系只提供 --ac（强调色），且**只用于小面积**（细线、小菱形、首字、次句）。
      正文永远是纸墨色 ⇒ 并排也不会花。
   ③ 字距拉开（2.5~4px）做题签的呼吸；两段之间用居中细标，不用粗符号。
   ④ 立体感只靠 1px 暗影（保证在任何底图上可读），不做大 box-shadow / 大发光。

   用法（与 v2 完全一致，数据无需重生成）：
     <b class="ct c-zt f1 s2 g2 a1"><i>深耕陇亩</i><i>偷渡阴平</i></b>
   ============================================================= */

.ct {
    /* 兜底：CSS 未注入时也不至于裸字 */
    font-family: "FZKai-Z03S", KaiTi, STKaiti, SimKai, "楷体", "Songti SC", serif;
    font-weight: 600;
    font-size: 17px;
    line-height: 1.35;
    letter-spacing: 3px;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    vertical-align: middle;
    /* 调色板默认值（被色系覆盖） */
    --ink: #f4ecdc;     /* 主句：纸墨 */
    --ink2: #cdbfa2;    /* 次句：淡墨 */
    --ac: #d8b45a;      /* 强调色（细线 / 小标 / 首字） */
    color: var(--ink);
    text-shadow: 0 1px 0 rgba(0, 0, 0, .9), 0 0 14px rgba(0, 0, 0, .55);
}

.ct > i {
    font-style: normal;
    display: inline-block;
}

.ct > i + i { margin-left: .42em; }

/* ---------- 字号档（按字数恒定视觉重量） ---------- */
.ct.z-l { font-size: 19px; letter-spacing: 4px; }   /* ≤4 字 */
.ct.z-s { font-size: 14px; letter-spacing: 2.2px; } /* ≥10 字 */

/* ---------- 分隔符（4 种，全部降到细标级别） ---------- */
.ct.s1 > i + i::before {
    content: ""; display: inline-block; width: 3px; height: 3px; border-radius: 50%;
    background: var(--ac); opacity: .75; vertical-align: .3em; margin-right: .42em;
}
.ct.s2 > i + i::before {
    content: ""; display: inline-block; width: 5px; height: 5px;
    background: var(--ac); opacity: .8; transform: rotate(45deg);
    vertical-align: .12em; margin-right: .42em;
}
.ct.s3 > i + i::before {
    content: ""; display: inline-block; width: 1px; height: .92em;
    background: linear-gradient(180deg, transparent, var(--ac) 22%, var(--ac) 78%, transparent);
    opacity: .8; vertical-align: -.08em; margin-right: .5em;
}
.ct.s4 > i + i { margin-left: .95em; }   /* 无符号，靠留白断句 */

/* ---------- 字色策略：次句走强调色，但仍压暗 ---------- */
.ct.g2 > i:last-child { color: var(--ac); opacity: .92; }

/* ---------- 强调：首字异色放大 ---------- */
.ct.a1 > i:first-child::first-letter {
    font-size: 1.3em;
    color: var(--ac);
    letter-spacing: 0;
}

/* =============================================================
   骨架 · 八字典（6 式）—— 全部是细线级装饰
   ============================================================= */

/* f1 碑 —— 上下各一条居中渐隐细线，端方 */
.ct.f1 {
    position: relative;
    padding: 7px 8px 8px;
}
.ct.f1::before,
.ct.f1::after {
    content: ""; position: absolute; left: 50%; transform: translateX(-50%);
    width: 34px; height: 1px;
    background: linear-gradient(90deg, transparent, var(--ac), transparent);
    opacity: .75;
}
.ct.f1::before { top: 0; }
.ct.f1::after  { bottom: 0; width: 62px; opacity: .5; }

/* f2 阙 —— 左侧一根短竖线，像门阙 */
.ct.f2 {
    position: relative;
    padding: 3px 6px 3px 15px;
}
.ct.f2::before {
    content: ""; position: absolute; left: 4px; top: 50%; transform: translateY(-50%);
    width: 2px; height: 1.05em; border-radius: 1px;
    background: linear-gradient(180deg, transparent, var(--ac) 18%, var(--ac) 82%, transparent);
    opacity: .9;
}

/* f3 旗 —— 底部一条细线，右端渐隐（旗杆意象） */
.ct.f3 {
    position: relative;
    padding: 5px 10px 9px;
}
.ct.f3::after {
    content: ""; position: absolute; left: 4px; right: 4px; bottom: 3px; height: 1px;
    background: linear-gradient(90deg, var(--ac), rgba(255, 255, 255, 0));
    opacity: .6;
}

/* f4 印 —— 左侧一枚小菱形（朱印意象） */
.ct.f4 {
    position: relative;
    padding: 5px 6px 5px 16px;
}
.ct.f4::before {
    content: ""; position: absolute; left: 3px; top: 50%;
    width: 6px; height: 6px; margin-top: -3px;
    background: var(--ac); transform: rotate(45deg); opacity: .85;
    box-shadow: 0 0 8px var(--ac);
}

/* f5 卷 —— 两端各一条渐隐细线，书卷气 */
.ct.f5 {
    position: relative;
    padding: 6px 16px;
}
.ct.f5::before,
.ct.f5::after {
    content: ""; position: absolute; top: 50%; width: 14px; height: 1px;
    background: var(--ac); opacity: .55;
}
.ct.f5::before { left: 0; background: linear-gradient(90deg, transparent, var(--ac)); }
.ct.f5::after  { right: 0; background: linear-gradient(90deg, var(--ac), transparent); }

/* f6 珏 —— 两段之间的分隔本身就是装饰（双联玉） */
.ct.f6 { padding: 5px 2px; }
.ct.f6 > i + i::before {
    content: ""; display: inline-block; width: 6px; height: 6px;
    border: 1px solid var(--ac); transform: rotate(45deg);
    vertical-align: .1em; margin-right: .5em; opacity: .85;
}

/* =============================================================
   小品 · 非八字典（6 式）—— 供短/长杂长度称号使用，更轻
   ============================================================= */

/* x1 素 —— 仅字 + 细下划线 */
.ct.x1 { position: relative; padding: 3px 4px 8px; }
.ct.x1::after {
    content: ""; position: absolute; left: 8%; right: 8%; bottom: 3px; height: 1px;
    background: linear-gradient(90deg, transparent, var(--ac) 20%, var(--ac) 80%, transparent);
    opacity: .45;
}

/* x2 点 —— 首字下方一点 */
.ct.x2 { padding: 3px 4px; }
.ct.x2 > i:first-child::after {
    content: ""; display: block; width: 4px; height: 4px; margin: 3px auto 0;
    background: var(--ac); transform: rotate(45deg); opacity: .7;
}

/* x3 括 —— 两侧细角标 */
.ct.x3::before,
.ct.x3::after { color: var(--ac); opacity: .55; font-size: .8em; }
.ct.x3::before { content: "「"; margin-right: .2em; }
.ct.x3::after  { content: "」"; margin-left: .2em; }

/* x4 柱 —— 两侧各一根细竖线 */
.ct.x4 { padding: 3px 12px; position: relative; }
.ct.x4::before,
.ct.x4::after {
    content: ""; position: absolute; top: 50%; transform: translateY(-50%);
    width: 1px; height: 1em; background: var(--ac); opacity: .5;
}
.ct.x4::before { left: 0; }
.ct.x4::after  { right: 0; }

/* x5 双 —— 上下细线夹住 */
.ct.x5 { position: relative; padding: 8px 6px; }
.ct.x5::before,
.ct.x5::after {
    content: ""; position: absolute; left: 12%; right: 12%; height: 1px;
    background: linear-gradient(90deg, transparent, var(--ac), transparent);
    opacity: .5;
}
.ct.x5::before { top: 3px; }
.ct.x5::after  { bottom: 3px; }

/* x6 空 —— 仅字，字距最大 */
.ct.x6 { letter-spacing: 6px; padding: 3px 2px 3px 6px; }

/* --- 两处定制（保持原语义） --- */
/* 弓腰姬：弓弧 */
.ct.x-bow { position: relative; padding: 2px 10px 8px; }
.ct.x-bow::before,
.ct.x-bow::after {
    content: ""; position: absolute; left: 4px; right: 4px; height: 1px;
    border-radius: 50%; opacity: .6;
}
.ct.x-bow::before { bottom: 2px; background: radial-gradient(60% 100% at 50% 100%, var(--ac), transparent); }
.ct.x-bow::after  { display: none; }

/* 巧施连环计：双环 */
.ct.x-chain > i:first-child::before,
.ct.x-chain > i:last-child::after {
    content: ""; display: inline-block; width: 7px; height: 7px; border-radius: 50%;
    border: 1px solid var(--ac); opacity: .6; vertical-align: .12em;
}
.ct.x-chain > i:first-child::before { margin-right: .38em; }
.ct.x-chain > i:last-child::after   { margin-left: .38em; }

/* =============================================================
   色系（7 色 + 备用）—— 只给「强调色」，不碰正文
   ============================================================= */
.ct.c-zt { --ac: #d8b45a; }   /* 周天 · 金 */
.ct.c-cf { --ac: #e0574a; }   /* 摧锋 · 朱 */
.ct.c-jt { --ac: #6fd0e8; }   /* 惊霆 · 电青 */
.ct.c-fl { --ac: #7aa8f0; }   /* 覆澜 · 靛 */
.ct.c-hc { --ac: #4ec9a0; }   /* 汇川 · 碧 */
.ct.c-fg { --ac: #e8cf8a; }   /* 浮光 · 淡金 */
.ct.c-jh { --ac: #f08a3c; }   /* 烬火 · 炎 */
.ct.c-qy { --ac: #9fb4d8; }   /* 青翼 · 苍 */`;

export function injectCshTitlesStyle() {
    if (typeof document === "undefined") return;
    if (document.getElementById("csh-titles-style")) return;
    var st = document.createElement("style");
    st.id = "csh-titles-style";
    st.textContent = CSH_TITLES_CSS;
    (document.head || document.documentElement).appendChild(st);
}
