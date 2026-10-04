/* 池子魔将 · 纸牌游戏共用视觉层（§4.7.2 纸牌部分 ①②③④⑤）
   ============================================================
   为什么是「一份共用文件」而不是各游戏自己写：
     规格原文是「**牌面光影统一** / 动效曲线**统一** / 结算横幅层级**重排**」——
     统一的东西散在 4 个页面里复制粘贴，必然随时间漂移。
     故把 ①牌面高光 ②动效曲线 ④层级梯 做成**注入式 CSS**（一处定义，四处生效），
     ③底池滚动 ⑤AI 头像 做成共用函数。

   双载方式与 csh_sfx.js / csh_svggen.js 一致（零 import）：
     · 主页面：无需引入（纸牌游戏全在 iframe 里）
     · 游戏帧：<script src="../../core/csh_cards.js"></script>
   本文件一加载就自动注入样式表（各游戏不必再手动调 ensureStyle）。

   对外 API（window.CSH.cards）：
     BEZIER                     统一缓动曲线字符串 cubic-bezier(.22,.61,.36,1)
     Z                          ④ 层级梯 { close:200, panel:70, banner:60, toast:40 }
     ensureStyle()              幂等注入；返回是否就绪
     rollNum(el, to, ms, fmt)   ③ 数值 300ms 滚动（easeOutCubic + rAF）
     rollEase(t)                ③ 纯函数缓动（自检可直接断言）
     avatar(姓氏, 性格, px)      ⑤ 委托 csh_svggen 生成头像；缺失时降级为首字圆章
     personaOf(name)            ⑤ 无世界档案的名字（UNO 对手）→ 姓名哈希派生性格
     anim(el, 'deal'|'flip')    ② 给元素挂一次统一曲线的发牌/翻牌动画
     potCollect(el)             ② 收池脉冲
   ============================================================ */
(function (root) {
	if (!root) return;
	root.CSH = root.CSH || {};
	if (root.CSH.cards) return;          // 幂等

	var BEZIER = "cubic-bezier(.22,.61,.36,1)";

	/* ④ 结算横幅层级梯（唯一一份）。
	   改前的实际值：德州 close200/toast90/banner60；廿一点 200/120/80/90；
	   斗地主 200/90/60；UNO 200/80/50。toast 普遍高于结算横幅 →
	   会出现「一句提示压住结算横幅」。统一为：
	     牌面与座位(1~10) < toast(40) < 结算横幅(60) < 二级面板(70) < 关闭按钮(200) */
	var Z = { table: 1, toast: 40, banner: 60, panel: 70, close: 200 };

	var STYLE_ID = "csh-cards-style";
	var CSS = [
		"/* ===== 池子魔将 §4.7.2 纸牌统一视觉层（core/csh_cards.js 注入） ===== */",
		":root{ --csh-ease: " + BEZIER + "; }",

		"/* ① 牌面光影统一：每张牌只有「一处」高光 —— 左上 28° 斜向柔光。",
		"   德州/廿一点/斗地主用 .pcard，UNO 用 .card，同一条规则覆盖两者（UNO 原有高光本就是这一形态）。 */",
		".pcard::before,.card::before{",
		"  content:\"\"; position:absolute; left:11%; top:-26%; width:78%; height:150%;",
		"  border-radius:50%; transform:rotate(-28deg); pointer-events:none;",
		"  background:rgba(255,255,255,.22);",
		"}",

		"/* ② 发牌 / 翻牌 / 收池：曲线统一为 cubic-bezier(.22,.61,.36,1)。",
		"   包在 prefers-reduced-motion: no-preference 里 —— 各游戏都有",
		"   「减少动态效果 → animation:none」的一段，注入的样式在源序上更靠后，",
		"   若不设这个媒体条件会把它们的无障碍降级反过来盖掉。 */",
		"@media (prefers-reduced-motion: no-preference){",
		"  .pcard.deal,.hand .pcard.in{ animation: cardIn .22s var(--csh-ease) both; }",
		"  .pcard.flip{ animation: cardFlip .24s var(--csh-ease) both; }",
		"  .play-zone .pcard{ animation: cardFly .24s var(--csh-ease) both; }",
		"  .csh-deal{ animation: cshCardIn .22s var(--csh-ease) both; }",
		"  .csh-flip{ animation: cshCardFlip .24s var(--csh-ease) both; }",
		"  /* csh-soft：给「内联 transform 已被占用于定位」的元素用（如 UNO 弃牌堆顶牌",
		"     transform: translate(-50%,-50%) rotate(3deg)）。关键帧一旦动 transform 就会把",
		"     定位一起顶掉、牌会瞬移，所以这一支只动 opacity/filter，缓动曲线仍然统一。 */",
		"  .csh-soft{ animation: cshCardSoft .24s var(--csh-ease) both; }",
		"  .pot.csh-collect,.csh-pool.csh-collect{ animation: cshPotCollect .30s var(--csh-ease) both; }",
		"}",
		"@keyframes cshCardIn{ from{ transform:translateY(22px) scale(.90); opacity:0; } }",
		"@keyframes cshCardFlip{ from{ transform:rotateY(90deg); } to{ transform:rotateY(0); } }",
		"@keyframes cshCardSoft{ from{ opacity:0; filter:brightness(1.9) saturate(.35); } }",
		"@keyframes cshPotCollect{",
		"  0%{ transform:scale(1); }",
		"  38%{ transform:scale(1.14); box-shadow:0 0 0 1px var(--gold-hi,#f4dfa8),0 0 22px rgba(216,180,106,.55); }",
		"  100%{ transform:scale(1); }",
		"}",

		"/* ④ 结算横幅层级重排：toast 永远在结算横幅与二级面板之下 */",
		"#toasts{ z-index:" + Z.toast + "; }",
		".banner-mask{ z-index:" + Z.banner + "; }",
		".sign-mask,.ins-mask,.rules-mask,.modal-mask{ z-index:" + Z.panel + "; }",
		"/* 横幅内容必须盖在遮罩之上（否则被 .banner-mask 自己的背景压住） */",
		".banner-mask>*{ position:relative; z-index:" + Z.table + "; }",

		"/* ⑤ AI 头像容器：SVG 铺满圆形容器，不撑破座位卡 */",
		".seat-av,.avatar,.opp-av{ overflow:hidden; }",
		".seat-av svg,.avatar svg,.opp-av svg{ width:100%; height:100%; display:block; border-radius:50%; }",
		".opp-av{",
		"  width:clamp(22px,3.1vh,34px); height:clamp(22px,3.1vh,34px); border-radius:50%;",
		"  display:flex; align-items:center; justify-content:center; flex-shrink:0;",
		"  background:linear-gradient(160deg,#3a3225,#241d14); border:1px solid var(--gold-line,#6d5a30);",
		"}",
		".csh-av-fallback{ display:flex; align-items:center; justify-content:center; width:100%; height:100%;",
		"  font-weight:900; color:var(--gold,#d8b46a); font-size:1.1em; }",
	].join("\n");

	function doc() { return root.document || null; }

	/* 幂等注入。返回 true 表示样式已在文档里。 */
	function ensureStyle() {
		var d = doc();
		if (!d || !d.createElement) return false;
		try {
			if (d.getElementById(STYLE_ID)) return true;
			var st = d.createElement("style");
			st.id = STYLE_ID;
			st.type = "text/css";
			if (st.styleSheet) { st.styleSheet.cssText = CSS; }     // 老 IE 兜底
			else { st.appendChild(d.createTextNode(CSS)); }
			var host = d.head || d.documentElement || d.body;
			if (!host || !host.appendChild) return false;
			host.appendChild(st);
			return true;
		} catch (e) { return false; }
	}

	/* ---------- ③ 底池数值 300ms 滚动 ---------- */
	/* 纯缓动函数（easeOutCubic）：自检可直接断言，不必等 rAF */
	function rollEase(t) {
		t = t < 0 ? 0 : (t > 1 ? 1 : t);
		var u = 1 - t;
		return 1 - u * u * u;
	}
	function rollValue(from, to, t) { return from + (to - from) * rollEase(t); }

	/* rollNum(el, to, 300, fmtFn)
	   · 起点从元素当前文本里抠数字（"×3" / "注 50" / "1,250" 都能抠）
	   · 同一元素上新的滚动会作废旧的那次（_cshRollId 令牌），避免两段 rAF 打架
	   · 无 rAF 或 ms<=0 → 直接落终值（自检/降级路径） */
	function rollNum(el, to, ms, fmt) {
		if (!el) return false;
		var tgt = Number(to);
		if (!isFinite(tgt)) return false;
		var txt = el.textContent == null ? "" : String(el.textContent);
		var from = parseFloat(txt.replace(/[^\d.\-]/g, ""));
		if (!isFinite(from)) from = 0;
		if (ms == null) ms = 300;
		function put(v) {
			el.textContent = (typeof fmt === "function") ? fmt(v) : String(Math.round(v));
		}
		if (!root.requestAnimationFrame || !(ms > 0)) { put(tgt); return true; }
		if (from === tgt) { put(tgt); return true; }
		var id = (el._cshRollId || 0) + 1;
		el._cshRollId = id;
		var started = false, st = 0;
		root.requestAnimationFrame(function step(now) {
			if (el._cshRollId !== id) return;                 // 已被更新的滚动取代
			if (!started) { started = true; st = (typeof now === "number" ? now : 0); }
			var nowv = (typeof now === "number" ? now : st);
			var t = (nowv - st) / ms;
			if (t >= 1) { put(tgt); return; }
			put(rollValue(from, tgt, t));
			root.requestAnimationFrame(step);
		});
		return true;
	}

	/* ---------- ⑤ AI 头像 ---------- */
	/* UNO 的对手没有 §I 世界档案（§I.3 组局只在德州/斗地主走 cshWorld.seat），
	   故用姓名哈希派生性格 —— 同名永远同纹样，且不重复造一份发型表。 */
	var PERSONAS = ["aggro", "tight", "bluff", "math", "wild"];
	function personaOf(name) {
		var s = String(name == null ? "" : name);
		var h = 0;
		for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
		return PERSONAS[h % PERSONAS.length];
	}
	/* 返回 <svg> 字符串（由 csh_svggen.js 生成）；生成器缺失时降级为首字圆章。
	   seed（2026-10-01）：97 人下同姓 6 人，透传 stableHash(seed) 让 svggen 走 seed 色板，
	   否则同姓 + 同性格头像完全一样。缺省时行为与旧版一致。 */
	function avatar(surname, persona, px, seed) {
		var g = root.CSH && root.CSH.svggen;
		if (g && typeof g.avatar === "function") {
			try { return (seed != null) ? g.avatar(surname, persona, px, seed) : g.avatar(surname, persona, px); } catch (e) {}
		}
		var s = String(surname == null ? "?" : surname).slice(0, 1);
		return '<span class="csh-av-fallback">' + s.replace(/[<>&]/g, "") + "</span>";
	}
	function hasGenerator() {
		var g = root.CSH && root.CSH.svggen;
		return !!(g && typeof g.avatar === "function");
	}

	/* ---------- ② 动画挂钩 ---------- */
	/* 给元素挂一次统一曲线的动画：先摘类 → 强制回流 → 再挂，保证重复触发也重播。
	   kind = 'deal'（上浮入场，动 transform）| 'flip'（翻面，动 transform）|
	          'soft'（只动 opacity/filter —— 元素自身的内联 transform 要留给定位时用这支） */
	var KINDS = { deal: "csh-deal", flip: "csh-flip", soft: "csh-soft" };
	function anim(el, kind) {
		if (!el || !el.classList) return false;
		var cls = KINDS[kind] || KINDS.deal;
		el.classList.remove(KINDS.deal, KINDS.flip, KINDS.soft);
		void (el.offsetWidth || 0);
		el.classList.add(cls);
		return true;
	}
	/* 收池脉冲（②收池）：给底池胶囊挂一下 cshPotCollect 动画 */
	function potCollect(el) {
		if (!el || !el.classList) return false;
		el.classList.remove("csh-collect");
		void (el.offsetWidth || 0);
		el.classList.add("csh-collect");
		if (root.setTimeout) root.setTimeout(function () { try { el.classList.remove("csh-collect"); } catch (e) {} }, 340);
		return true;
	}

	var API = {
		BEZIER: BEZIER, Z: Z, CSS: CSS, STYLE_ID: STYLE_ID, PERSONAS: PERSONAS,
		ensureStyle: ensureStyle,
		rollNum: rollNum, rollEase: rollEase, rollValue: rollValue,
		avatar: avatar, personaOf: personaOf, hasGenerator: hasGenerator,
		anim: anim, potCollect: potCollect,
	};
	root.CSH.cards = API;

	/* 一引入就注入：各游戏无需手动调用 */
	ensureStyle();
})(typeof window !== "undefined" ? window : this);
