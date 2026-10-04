/* 池子魔将 · 隐藏自检 `?selftest=1`
   ============================================================
   依据：第五部分·建议增补 #6「隐藏自检 `?selftest=1` —— 自动断言：
         不溢出、按钮 ≥44px、字号 ≥12px、无外部资源引用」（状态：本轮）
        + §12 验收清单 #1/#3/#4（不横向滚动 / 触摸目标 / 对比度）
        + §11.1 通用验收 #1 零外部请求 · #5 禁裸 vw·vh · #6 字号下限
          · #7 触摸目标（**不设 44px 硬门槛**：主按钮 clamp 下限 ≥38px、
            小按钮 ≥32px、次要胶囊 ≥26px）· #9 存储前缀

   为什么做「一份共用文件」：五个小游戏各写一套自检必然漂移；
   面板（注入 noname 页）与游戏（独立 iframe 文档）虽然跑在不同上下文，
   但**判据完全一样**，故判据集中在这里，只有「阈值」按 scope 分档。

   双载方式与 csh_sfx.js / csh_svggen.js / csh_cards.js 一致（零 import）：
     · 主页面：extension.js 里 `import "./core/csh_selftest.js";`
     · 游戏帧：<script src="../../core/csh_selftest.js"></script>
   本文件一加载即 auto()：URL 带 selftest=1 才跑，否则**零副作用**（隐藏自检）。

   对外 API（window.CSH.selftest）：
     run(root, opt)      → 报告 { ok, scope, checks[], fail, warn, pass, total }
     render(rep, opt)    → 悬浮结果面板（auto() 命中时自动调）
     auto(root)          → 读 location.search，命中则 run + render
     armed()             → 当前 URL 是否带 selftest=1
     TH                  → 阈值表（panel / game 两档）
     contrast(fg, bg)    → WCAG 对比度（1~21）
     parseColor(str)     → 'rgb()/rgba()/#hex' → {r,g,b,a}，失败返回 null
     CHECKS              → 检查项注册表（可外部追加）
   ============================================================ */
(function (root) {
	if (!root) return;
	root.CSH = root.CSH || {};
	if (root.CSH.selftest) return;               // 幂等

	var doc = root.document || null;

	/* ---------- 阈值（§12#3 面板 44px；§11.1#7 小游戏不设 44 硬门槛） ----------
	   fontFloor = 全局硬下限；font = 正文档下限（11~12 之间的记为「元信息档」不判失败） */
	var TH = {
		panel: { tap: 44, tapSmall: 44, tapCapsule: 44, font: 12, fontFloor: 12, contrast: 4.5, contrastMeta: 3 },
		game: { tap: 38, tapSmall: 32, tapCapsule: 26, font: 12, fontFloor: 11, contrast: 4.5, contrastMeta: 3 },
	};

	/* ---------- 颜色 / 对比度 ---------- */
	function clamp255(n) { n = Math.round(Number(n) || 0); return n < 0 ? 0 : (n > 255 ? 255 : n); }
	function parseColor(str) {
		if (!str) return null;
		str = String(str).trim().toLowerCase();
		if (str === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
		var m = str.match(/^#([0-9a-f]{3,8})$/);
		if (m) {
			var h = m[1];
			if (h.length === 3 || h.length === 4) h = h.split("").map(function (c) { return c + c; }).join("");
			if (h.length !== 6 && h.length !== 8) return null;
			return {
				r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16),
				a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
			};
		}
		m = str.match(/^rgba?\(([^)]+)\)$/);
		if (m) {
			var p = m[1].split(/[,\s\/]+/).filter(function (x) { return x !== ""; });
			if (p.length < 3) return null;
			return { r: clamp255(p[0]), g: clamp255(p[1]), b: clamp255(p[2]), a: p.length > 3 ? Math.max(0, Math.min(1, parseFloat(p[3]) || 0)) : 1 };
		}
		return null;
	}
	function lum(c) {
		var ch = [c.r, c.g, c.b].map(function (v) {
			v = v / 255;
			return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
		});
		return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
	}
	/* 把带 alpha 的前景/背景合成为不透明（近似：白底优先，若有实底则用实底） */
	function flat(c, base) {
		if (!c) return null;
		if (c.a >= 1) return c;
		base = base || { r: 255, g: 255, b: 255, a: 1 };
		return {
			r: c.r * c.a + base.r * (1 - c.a),
			g: c.g * c.a + base.g * (1 - c.a),
			b: c.b * c.a + base.b * (1 - c.a),
			a: 1,
		};
	}
	function contrast(fg, bg) {
		var a = parseColor(fg), b = parseColor(bg);
		if (!a || !b) return null;
		var F = flat(a, b), B = flat(b, null);
		var l1 = lum(F), l2 = lum(B);
		var hi = Math.max(l1, l2), lo = Math.min(l1, l2);
		return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
	}

	/* ---------- 小工具 ---------- */
	/* 扫 CSS 文本前必须剥注释：注释里的「禁用 100vw/100vh」说明会被误判为脏用法 */
	function stripCssComments(s) { return String(s == null ? "" : s).replace(/\/\*[\s\S]*?\*\//g, ""); }
	function win() { return root; }
	function docEl() { return (doc && (doc.documentElement || doc.body)) || null; }
	function innerW() { return win().innerWidth || (docEl() && docEl().clientWidth) || 0; }
	function css(el, prop) { try { return win().getComputedStyle ? win().getComputedStyle(el)[prop] : ""; } catch (e) { return ""; } }
	function px(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
	/* 根字号归一化标定：
	   headless/嵌入式 WebView 会因视口缩放把 html{font-size:16px} 实际算成
	   12.62px 或 19.09px（rem 值随之线性缩放），但真实浏览器恒为声明的 16px。
	   自检关心的是「设计上的字号/尺寸是否够大」，故把所有 px 值换算回
	   「声明根字号 16px」的标尺再比阈值，消除测试环境缩放怪癖。
	   scale = 16 / 实际根字号px；归一化值 = 实测 px × scale。
	   ⚠ 必须**惰性求值**：本文件经 <script> 在 <head> 加载时样式表尚未应用，
	   若在顶层立即读根字号会拿到默认 16px（scale=1，归一化失效），
	   故 normPx 每次调用时现读。 */
	function normPx(realPx) {
		var rf = 16;
		try { rf = px(css(docEl(), "fontSize")) || 16; } catch (e) {}
		if (rf <= 0 || Math.abs(rf - 16) < 0.5) return realPx;   // 已是标准根字号
		return realPx * (16 / rf);
	}
	function visible(el, rc) {
		if (!el || !rc) return false;
		if (rc.width <= 0 || rc.height <= 0) return false;
		if (css(el, "display") === "none") return false;
		if (css(el, "visibility") === "hidden") return false;
		if (px(css(el, "opacity")) === 0) return false;
		return true;
	}
	function rectOf(el) {
		try { return el.getBoundingClientRect(); } catch (e) { return null; }
	}
	function txtOf(el) {
		/* 只取「直接文本子节点」（避免把容器算成文字元素） */
		var s = "";
		try {
			for (var i = 0; i < el.childNodes.length; i++) {
				var n = el.childNodes[i];
				if (n && n.nodeType === 3) s += n.nodeValue;
			}
		} catch (e) {}
		return s.replace(/\s+/g, " ").trim();
	}
	function hasNonVisibleOverflowX(el) {
		var cur = el && el.parentNode, hop = 0;
		while (cur && cur.nodeType === 1 && hop++ < 40) {
			var ox = css(cur, "overflowX");
			if (ox && ox !== "visible" && ox !== "clip") return true;
			cur = cur.parentNode;
		}
		return false;
	}
	function metaish(el) {
		/* 元信息类（§11.1#6：--fs-xs 标签类下限 11px）——只按显式类判定，不猜 */
		try {
			if (!el.classList) return false;
			return el.classList.contains("csh-meta") || el.classList.contains("meta") ||
				el.classList.contains("csh-tag") || el.classList.contains("tag") ||
				el.classList.contains("hint") || el.classList.contains("sub") ||
				el.classList.contains("csh-xs");
		} catch (e) { return false; }
	}

	function mk(id, name, ok, sev, detail, more) {
		return { id: id, name: name, ok: !!ok, sev: sev || "fail", detail: String(detail == null ? "" : detail), more: more || null };
	}

	/* ---------- 各检查项（每项独立 try，单项炸不影响整体） ---------- */
	var CHECKS = [];

	/* ① 不溢出（§12#1 / §11.1#4） */
	CHECKS.push({
		id: "overflow", name: "不横向滚动 / 无出界元素", sev: "fail",
		run: function (ctx) {
			var de = docEl(), W = innerW();
			var sw = 0;
			try { sw = Math.max(de.scrollWidth, (doc.body && doc.body.scrollWidth) || 0); } catch (e) {}
			var cw = (de && de.clientWidth) || W;
			var bad = [];
			if (sw > cw + 1) bad.push("文档可滚宽 " + sw + " > 视口宽 " + cw);
			/* 逐元素出界扫描（跳过 fixed 与横向滚动容器内的子元素） */
			var all = ctx.root && ctx.root.querySelectorAll ? ctx.root.querySelectorAll("*") : [];
			var n = 0;
			for (var i = 0; i < all.length && n < 4000; i++) {
				var el = all[i]; n++;
				var rc = rectOf(el);
				if (!visible(el, rc)) continue;
				var pos = css(el, "position");
				if (pos === "fixed") continue;
				if (rc.right <= W + 2 && rc.left >= -2) continue;
				if (hasNonVisibleOverflowX(el)) continue;
				var tag = (el.tagName || "?").toLowerCase();
				var cls = "";
				try { cls = el.className ? ("" + el.className).split(" ")[0] : ""; } catch (e2) {}
				bad.push("<" + tag + (cls ? "." + cls : "") + "> 出界 → L" + Math.round(rc.left) + " R" + Math.round(rc.right) + "（视口 " + W + "）");
				if (bad.length > 8) { bad.push("…（更多已省略）"); break; }
			}
			return mk("overflow", "不横向滚动 / 无出界元素", bad.length === 0, "fail",
				bad.length === 0 ? ("视口 " + W + "px · 可滚宽 " + sw + "px · 扫描 " + n + " 元素") : bad.join(" ｜ "), bad);
		},
	});

	/* ② 触摸目标（§12#3 面板 ≥44px / §11.1#7 游戏：主按钮·筹码 ≥38px、
	   小按钮 ≥32px、次要胶囊 ≥26px，且**不设 44px 硬门槛**）
	   判据：只用**级联后的实际渲染尺寸**对比硬底线（游戏 26px / 面板 44px）。
	   级联、媒体查询、CSS 变量都由浏览器算好，自检不再去「猜」元素自己声明的
	   clamp 下限（旧做法用 max 取法 + el.matches，会误读媒体查询里的更小值，
	   把「矮屏下 40px 的 .opt」误判成「未达默认 44px」）。
	   落在 26~38 的档内只记数（壳内小按钮/胶囊的正常档位）。 */
	var TAP_SEL = "button,a[href],[role=button],input[type=button],input[type=submit],.btn,.csh-btn,[data-tap],[data-csh-tap]";
	/* 【2026-10-02 自检盲区修复】
	   上面的 TAP_SEL 只认标签/role/约定类。本扩展里有一批**用 div/span 实现、且不带 role**
	   的可点元素（面板 chip、开关、分段控件…），它们永远不会进入这条检查 ——
	   于是「自检全绿」并不能证明触摸目标达标，历次移动端修复就是这样被漏掉的
	   （实测：.csh-dbg-chip 27px、.csh-dbg-psfb .fb-toggle 20.6px、.csh-ia-sw 29px 全部逃检）。
	   现在提供注册口：各模块把自己那批 role-less 可点元素的选择器登记进来
	   （保持「谁实现谁登记」，不在此处硬编码别人的 DOM 结构）。 */
	var EXTRA_TAP = [];
	function tapSelector() {
		return EXTRA_TAP.length ? (TAP_SEL + "," + EXTRA_TAP.join(",")) : TAP_SEL;
	}
	function addTapSelectors(sel) {
		try {
			var arr = Array.isArray(sel) ? sel : [sel];
			for (var i = 0; i < arr.length; i++) {
				var s = String(arr[i] || "").trim();
				if (s && EXTRA_TAP.indexOf(s) < 0) EXTRA_TAP.push(s);
			}
		} catch (e) {}
		return EXTRA_TAP.slice();
	}
	CHECKS.push({
		id: "tap", name: "触摸目标尺寸", sev: "fail",
		run: function (ctx) {
			var T = ctx.th, hard = [], small = [], n = 0, mid = 0;
			var list = ctx.root && ctx.root.querySelectorAll ? ctx.root.querySelectorAll(tapSelector()) : [];
			for (var i = 0; i < list.length; i++) {
				var el = list[i], rc = rectOf(el);
				if (!visible(el, rc)) continue;
				n++;
				var lab = "";
				try {
					lab = "<" + (el.tagName || "?").toLowerCase() + (el.id ? "#" + el.id : "")
						+ (el.className ? "." + ("" + el.className).split(" ").slice(0, 1).join(".") : "") + ">";
				} catch (e0) { lab = "<?"; }
				var size = Math.min(normPx(rc.width), normPx(rc.height));
				if (size + 0.6 < T.tapCapsule) {
					hard.push(lab + " " + Math.round(normPx(rc.width)) + "×" + Math.round(normPx(rc.height)) + " < 硬底线 " + T.tapCapsule + "px");
				} else if (size + 0.6 < T.tapSmall) {
					if (small.length < 6) small.push(lab + " " + Math.round(normPx(rc.width)) + "×" + Math.round(normPx(rc.height)));
					mid++;
				} else if (size + 0.6 < T.tap) {
					mid++;
				}
			}
			var dstr = "检查 " + n + " 个可点元素 · 硬底线 " + T.tapCapsule + "px · 小按钮档 " + T.tapSmall + "px · 主按钮档 " + T.tap + "px";
			if (mid) dstr += " · " + mid + " 个落在小按钮/胶囊档（" + (small.length ? small.join(" / ") : "合规") + "）";
			return mk("tap", "触摸目标尺寸", hard.length === 0, "fail", hard.length === 0 ? dstr : hard.join(" ｜ "), hard);
		},
	});

	/* ③ 字号下限（§12#1 面板最小 12px / §11.1#6 游戏：正文与按钮 ≥12px、元信息下限 11px）
	   判据：只用级联后的实际字号对比全局硬下限（面板 12 / 游戏 11）。
	   低于硬下限＝失败；11~12px 之间＝元信息档（--fs-xs 标签类），只记数不判失败。
	   装饰性微徽章（签到日历圆点 .sdot 等：容器宽高都 < 30px 的小圆点/角标，
	   带 clamp 小字号）放行——它们是刻意的小号微元素，非正文。 */
	function microBadge(el) {
		try {
			var rc = rectOf(el);
			if (!rc) return false;
			return normPx(rc.width) < 30 && normPx(rc.height) < 30;
		} catch (e) { return false; }
	}
	CHECKS.push({
		id: "font", name: "字号下限", sev: "fail",
		run: function (ctx) {
			var T = ctx.th, hard = [], seen = 0, metaN = 0, microN = 0;
			var all = ctx.root && ctx.root.querySelectorAll ? ctx.root.querySelectorAll("*") : [];
			for (var i = 0; i < all.length && seen < 4000; i++) {
				var el = all[i]; seen++;
				if (!visible(el, rectOf(el))) continue;
				var t = txtOf(el);
				if (!t) continue;
				var f = normPx(px(css(el, "fontSize")));
				if (f <= 0) continue;
				if (microBadge(el)) { microN++; continue; }
				if (f + 0.05 < T.fontFloor) {
					var tag = (el.tagName || "?").toLowerCase();
					var cls = "";
					try { cls = el.className ? "." + ("" + el.className).split(" ")[0] : ""; } catch (e0) {}
					hard.push("<" + tag + cls + "> " + (Math.round(f * 100) / 100) + "px < 硬下限 " + T.fontFloor + "px  «" + t.slice(0, 14) + "»");
					if (hard.length > 8) break;
				} else if (f + 0.05 < T.font) {
					metaN++;
				}
			}
			var d = "全局硬下限 " + T.fontFloor + "px · 正文档 " + T.font + "px · 扫描 " + seen + " 元素";
			if (metaN) d += " · " + metaN + " 处属元信息档（" + T.fontFloor + "~" + T.font + "px，§11.1#6 放行）";
			if (microN) d += " · " + microN + " 处为装饰微徽章（<30px 圆点/角标，放行）";
			return mk("font", "字号下限", hard.length === 0, "fail", hard.length === 0 ? d : hard.join(" ｜ "), hard);
		},
	});

	/* ④ 无外部资源引用（§12#6 / §11.1#1 · 离线铁律） */
	var EXT_RE = /^\s*(?:https?:)?\/\//i;
	CHECKS.push({
		id: "external", name: "零外部资源引用", sev: "fail",
		run: function (ctx) {
			var bad = [];
			var sel = "[src],[href],[poster],[data-src]";
			var list = ctx.root && ctx.root.querySelectorAll ? ctx.root.querySelectorAll(sel) : [];
			for (var i = 0; i < list.length; i++) {
				var el = list[i];
				var vs = ["src", "href", "poster", "data-src"];
				for (var j = 0; j < vs.length; j++) {
					var v = null;
					try { v = el.getAttribute && el.getAttribute(vs[j]); } catch (e) { v = null; }
					if (v && EXT_RE.test(v)) {
						bad.push("<" + (el.tagName || "?").toLowerCase() + " " + vs[j] + "=\"" + String(v).slice(0, 48) + "\">");
						break;
					}
				}
				if (bad.length > 8) break;
			}
			/* CSS 里的 url(http…) */
			if (bad.length <= 8) {
				var styles = [];
				try {
					styles = ctx.root && ctx.root.querySelectorAll ? ctx.root.querySelectorAll("style") : [];
				} catch (e3) { styles = []; }
				for (var k = 0; k < styles.length; k++) {
					var cssText = "";
					try { cssText = stripCssComments(styles[k].textContent || ""); } catch (e4) {}
					var mm = cssText.match(/url\(\s*['"]?\s*(?:https?:)?\/\/[^)]*/gi);
					if (mm) { bad.push("<style> 内含外部 url：" + mm[0].slice(0, 48)); break; }
				}
			}
			/* 实际发生的资源请求（若浏览器给了 performance） */
			if (bad.length <= 8) {
				try {
					var perf = win().performance;
					if (perf && perf.getEntriesByType) {
						var res = perf.getEntriesByType("resource") || [];
						for (var r = 0; r < res.length; r++) {
							var u = String(res[r].name || "");
							if (!u) continue;
							if (/^(file:|data:|blob:|about:|chrome-extension:|ext:)/i.test(u)) continue;
							if (EXT_RE.test(u)) { bad.push("实际请求：" + u.slice(0, 56)); break; }
						}
					}
				} catch (e5) {}
			}
			return mk("external", "零外部资源引用", bad.length === 0, "fail",
				bad.length === 0 ? "DOM 属性 / <style> / 实际请求 三层均无外部引用" : bad.join(" ｜ "), bad);
		},
	});

	/* ⑤ 对比度（§12#4）——只能靠计算样式**估算**（拿不到真实渲染像素），故标 warn 级。
	   背景必须**逐层向上合成**到不透明：只取单个半透明层（旧写法）会把
	   「金色字 on rgba(0,0,0,.32) 的筹码」误算成 1.13:1 这种假低值。 */
	CHECKS.push({
		id: "contrast", name: "正文对比度（估算）", sev: "warn",
		run: function (ctx) {
			var T = ctx.th, worst = null, n = 0;
			var all = ctx.root && ctx.root.querySelectorAll ? ctx.root.querySelectorAll("*") : [];
			for (var i = 0; i < all.length && n < 1200; i++) {
				var el = all[i];
				if (!visible(el, rectOf(el))) continue;
				var t = txtOf(el);
				if (!t || t.length < 2) continue;
				n++;
				var isMeta = metaish(el);
				var need = isMeta ? T.contrastMeta : T.contrast;
				var fg = css(el, "color");
				var bg = bgOf(el);
				var ratio = contrast(fg, bg);
				if (ratio == null) continue;
				if (!worst || ratio < worst.ratio) {
					worst = { ratio: ratio, need: need, fg: fg, bg: bg, t: t.slice(0, 16), meta: isMeta };
				}
			}
			var ok = !worst || worst.ratio >= worst.need;
			return mk("contrast", "正文对比度（估算）", ok, "warn",
				!worst ? "无可取样文本"
					: ("最低 " + worst.ratio + ":1（需 " + worst.need + ":1）· " + worst.fg + " on " + worst.bg + " «" + worst.t + "»"
						+ (worst.meta ? " [元信息]" : "") + " · 取样 " + n + " 处 · 估算值，非像素实测"),
				null);
		},
	});
	/* 把透明/半透明背景沿祖先链合成为不透明色；都没有就用根元素底色兜底 */
	function bgOf(el) {
		var stack = [], cur = el, hop = 0;
		while (cur && cur.nodeType === 1 && hop++ < 40) {
			var c = parseColor(css(cur, "backgroundColor"));
			if (c && c.a > 0.03) stack.push(c);
			if (c && c.a >= 0.97) break;
			cur = cur.parentNode;
		}
		var base = parseColor(css(docEl(), "backgroundColor"));
		if (!base || base.a < 0.97) base = { r: 255, g: 255, b: 255, a: 1 };
		for (var i = stack.length - 1; i >= 0; i--) {
			var c2 = stack[i];
			base = {
				r: c2.r * c2.a + base.r * (1 - c2.a),
				g: c2.g * c2.a + base.g * (1 - c2.a),
				b: c2.b * c2.a + base.b * (1 - c2.a), a: 1,
			};
		}
		return "rgb(" + Math.round(base.r) + "," + Math.round(base.g) + "," + Math.round(base.b) + ")";
	}

	/* ⑥ localStorage 前缀（§11.1#9 / 红线 #4） */
	var STORE_ALLOW = /^(csh_|noname|config|vite|webpack|HBuilder|__)/i;
	CHECKS.push({
		id: "storage", name: "存储键前缀合规", sev: "fail",
		run: function () {
			var bad = [], keys = [];
			try {
				var ls = win().localStorage;
				if (ls && ls.length != null) {
					for (var i = 0; i < ls.length; i++) {
						var k = ls.key(i);
						if (k == null) continue;
						keys.push(k);
						if (!STORE_ALLOW.test(k)) bad.push("localStorage「" + k + "」");
					}
				}
			} catch (e) { return mk("storage", "存储键前缀合规", true, "fail", "localStorage 不可用，跳过"); }
			return mk("storage", "存储键前缀合规", bad.length === 0, "fail",
				bad.length === 0 ? ("检查 " + keys.length + " 个键 · 均以 csh_ 开头或属引擎保留") : bad.join(" ｜ "), bad);
		},
	});

	/* ⑦ 禁裸 vw / vh（§11.1#5 / 红线 #3：小游戏禁用 100vw·100vh） */
	CHECKS.push({
		id: "vhvw", name: "无裸 vw / vh 用法", sev: "warn",
		run: function (ctx) {
			var blob = "";
			try {
				var st = ctx.root && ctx.root.querySelectorAll ? ctx.root.querySelectorAll("style") : [];
				for (var i = 0; i < st.length; i++) blob += stripCssComments(st[i].textContent || "") + ";\n";
			} catch (e) {}
			if (ctx.cssText) blob += stripCssComments(ctx.cssText);

			var hard = [], soft = [], seen = {};
			var decls = blob.split(";");
			for (var d = 0; d < decls.length; d++) {
				var one = decls[d];
				if (!/v[wh]\b/i.test(one)) continue;
				var tag = one.replace(/\s+/g, " ").trim();
				if (!tag) continue;
				if (/100\s*v[wh]\b/i.test(one)) {                 /* 红线：100vw / 100vh 硬失败 */
					if (hard.length < 6 && !seen["H" + tag]) { seen["H" + tag] = 1; hard.push(tag.slice(0, 64)); }
					continue;
				}
				if (/clamp\s*\(/i.test(one)) continue;            /* §11.1#5：clamp 内的 vh 允许 */
				if (!/\d{1,4}(?:\.\d+)?\s*v[wh]\b/i.test(one)) continue;
				if (soft.length < 6 && !seen["S" + tag]) { seen["S" + tag] = 1; soft.push(tag.slice(0, 64)); }
			}
			var ok = hard.length === 0;
			var dstr = hard.length ? ("违规 100vw/100vh：" + hard.join(" ｜ ")) : "无 100vw/100vh（红线）";
			if (soft.length) dstr += " · 提示：非 clamp 裸用 → " + soft.join(" ｜ ");
			return mk("vhvw", "无裸 vw / vh 用法", ok, "warn", dstr, hard);
		},
	});

	/* ---------- 运行器 ---------- */
	function scopeOf(rootEl, opt) {
		if (opt && opt.scope) return opt.scope;
		try { if (doc && doc.getElementById("csh-dbg-overlay")) return "panel"; } catch (e) {}
		return "game";
	}
	function run(rootEl, opt) {
		opt = opt || {};
		var r = rootEl || (doc && (doc.body || doc.documentElement)) || null;
		var scope = scopeOf(r, opt);
		var ctx = {
			root: r, th: TH[scope] || TH.game, opt: opt,
			cssText: opt.cssText || "",
		};
		var out = [];
		for (var i = 0; i < CHECKS.length; i++) {
			var c = CHECKS[i], res;
			try { res = c.run(ctx); } catch (e) {
				res = mk(c.id, c.name, false, "warn", "检查项自身异常：" + (e && e.message));
			}
			if (!res.sev) res.sev = c.sev || "fail";
			out.push(res);
		}
		var fail = 0, warn = 0, pass = 0;
		for (var j = 0; j < out.length; j++) {
			if (out[j].ok) pass++;
			else if (out[j].sev === "fail") fail++;
			else warn++;
		}
		return {
			ok: fail === 0, scope: scope, at: Date.now(),
			innerW: innerW(),
			checks: out, pass: pass, fail: fail, warn: warn, total: out.length,
			selector: "?selftest=1",
		};
	}

	/* ---------- 渲染（悬浮结果面板；只到 document.body，避开面板复位域） ---------- */
	var OV = "csh-st-res";
	function esc(s) {
		return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	}
	function render(rep, opt) {
		if (!doc || !doc.createElement) return null;
		opt = opt || {};
		var old = doc.getElementById(OV);
		if (old && old.parentNode) old.parentNode.removeChild(old);
		var box = doc.createElement("div");
		box.id = OV;
		/* 内联样式：即使被 noname 全局 div 规则命中，inline 也胜（非 !important 部分） */
		box.style.cssText = [
			"position:fixed", "left:12px", "top:12px", "z-index:2147483000",
			"max-width:min(560px,92vw)", "max-height:70vh", "overflow:auto",
			"background:rgba(18,16,13,.96)", "color:#f2e8d5",
			"border:1px solid rgba(214,181,110,.5)", "border-radius:10px",
			"padding:10px 12px", "font:12px/1.5 system-ui,-apple-system,'Microsoft YaHei',sans-serif",
			"box-shadow:0 8px 30px rgba(0,0,0,.55)", "text-align:left", "white-space:normal",
		].join(";");
		var head = "";
		var tone = rep.ok ? (rep.warn ? "#d8b26a" : "#7fd18b") : "#e2705f";
		head += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
			+ '<b style="font-size:13px">池子魔将 · 自检 <span style="color:' + tone + '">'
			+ (rep.ok ? (rep.warn ? "通过（含警告）" : "全部通过") : "存在失败") + "</span></b>"
			+ '<span style="opacity:.7">' + esc(rep.scope) + " · " + esc(rep.selector) + "</span>"
			+ '<span style="margin-left:auto;opacity:.8">✓' + rep.pass + " !" + rep.warn + " ✗" + rep.fail + "</span>"
			+ '<button data-csh-st-close="1" style="min-width:24px;min-height:24px;background:transparent;color:#f2e8d5;border:1px solid rgba(214,181,110,.5);border-radius:6px;cursor:pointer">×</button>'
			+ "</div>";
		var rows = "";
		for (var i = 0; i < rep.checks.length; i++) {
			var c = rep.checks[i];
			var mark = c.ok ? "✓" : (c.sev === "warn" ? "!" : "✗");
			var col = c.ok ? "#7fd18b" : (c.sev === "warn" ? "#d8b26a" : "#e2705f");
			rows += '<div style="padding:3px 0;border-top:1px solid rgba(255,255,255,.07)">'
				+ '<span style="color:' + col + ';font-weight:700">' + mark + "</span> "
				+ "<b>" + esc(c.name) + "</b>"
				+ '<div style="opacity:.82;margin-left:14px;word-break:break-word">' + esc(c.detail) + "</div>"
				+ "</div>";
		}
		box.innerHTML = head + rows;
		(doc.body || doc.documentElement).appendChild(box);
		var btn = box.querySelector ? box.querySelector("[data-csh-st-close]") : null;
		if (btn) {
			var close = function () { try { if (box.parentNode) box.parentNode.removeChild(box); } catch (e) {} };
			if (btn.addEventListener) btn.addEventListener("click", close);
		}
		return box;
	}

	/* ---------- 自动触发（隐藏：URL 无 selftest=1 时零副作用） ---------- */
	function armed() {
		try {
			var q = (win().location && win().location.search) || "";
			return /(?:^|[?&])selftest=1(?:&|$)/.test(q);
		} catch (e) { return false; }
	}
	/* rootEl 缺省 = document.body（游戏独立文档的正确范围）。
	   面板上下文必须显式传 `#csh-dbg-overlay` —— 否则会把 noname 本体页面
	   当成被检对象，必然满屏误报（见下方 AUTO 的 opt-in 设计）。 */
	function auto(rootEl) {
		if (!armed()) return null;
		var r = rootEl || (doc && (doc.body || doc.documentElement)) || null;
		var rep = run(r, {});
		try { render(rep, {}); } catch (e) {}
		try { console.log("[池子魔将·自检]", rep); } catch (e2) {}
		return rep;
	}

	var API = {
		run: run, render: render, auto: auto, armed: armed,
		TH: TH, CHECKS: CHECKS,
		parseColor: parseColor, contrast: contrast,
		OV_ID: OV,
		/* 触摸目标检查的扩展选择器注册口（见 EXTRA_TAP 注释） */
		addTapSelectors: addTapSelectors,
		tapSelector: tapSelector,
	};
	root.CSH.selftest = API;

	/* ---------- opt-in 自动跑 ----------
	   只有在**自己的 <script> 标签**上写了 data-csh-selftest="auto" 才自动跑。
	   · 游戏帧（经典脚本）：<script src="../../core/csh_selftest.js" data-csh-selftest="auto">
	     → DOM 就绪后扫 document.body（独立文档，范围正确）。
	   · 主页面（ESM import，document.currentScript 为 null）：不自动跑，
	     由 csh_debug.js 在面板渲染完后调 `CSH.selftest.auto(overlayEl)`。 */
	var SELF = null;
	try { SELF = doc && doc.currentScript; } catch (e0) { SELF = null; }
	var AUTO = false;
	try { AUTO = !!(SELF && SELF.getAttribute && SELF.getAttribute("data-csh-selftest") === "auto"); } catch (e1) { AUTO = false; }
	if (AUTO) {
		var ran = false;
		var go = function () {
			if (ran) return;                  // DOMContentLoaded 与 load 都会到，只跑一次
			ran = true;
			try { auto(doc && (doc.body || doc.documentElement)); } catch (e) {}
		};
		try {
			if (doc && doc.body) go();
			else if (doc && doc.addEventListener) {
				doc.addEventListener("DOMContentLoaded", go);
				if (win().addEventListener) win().addEventListener("load", go);
			}
		} catch (e2) {}
	}
})(typeof window !== "undefined" ? window : this);
