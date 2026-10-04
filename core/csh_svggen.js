/* 池子魔将 · 程序化 SVG 生成器（官阶徽章 + AI 头像 · §G.5 / §I.4）
   ============================================================
   为什么单独成文件（**零 import**）：
     §I.4 要求「同一套 SVG 生成器同时产出 36 个 AI 头像与 50 个官阶徽章 —— 一份代码，两处使用」。
     而 core/csh_badge.js 走 ESM（`import { lib } from "../../../noname.js"`），
     pages/games 下的 iframe **不可能**再 import 一次 noname（会在子文档里跑出第二份本体，灾难性）。
     故把**纯 SVG 生成逻辑**（不碰 lib、不碰 DOM）抽到本文件：
       · 主页面：extension.js / csh_badge.js 以 ESM `import` 引入（纯副作用）
       · 游戏 iframe：`<script src="../../core/csh_svggen.js"></script>` 经典脚本引入
       两个文档各自持有一份实例、互不干扰，但**源码只有这一份** → 满足 §I.4。

   调用方（两个入口，同一个对象）：
     · 主页面：window.CSH.svggen  /  lib.cshBadge（由 csh_badge.js 转发）
     · 子页面：window.CSH.svggen
     API：
       svggen.badge(段序号 0~4, 段内第几阶 1~10, 形态 'lg'|'md'|'sm')  → <svg> 字符串
       svggen.forRank(官阶级 0~50, 形态)                              → 便捷包装
       svggen.avatar(姓氏单字, 性格key, 尺寸px)                        → AI 头像 <svg>
       svggen.selfTest()                                             → 跑规格自检，返回报告

   核心原则（§G.5.1）：**徽章只回答"我在哪一档"，文字只回答"这一档叫什么"。**
     徽章内不放任何文字 / 数字 —— 段由"外框形状 + 段色 + 段意象符"表达，
     段内位次由"10 格刻度环"表达。这样徽章与旁边的全名文字**信息不重叠**。

   自检硬指标（§G.5.5）：
     ① 徽章内 <text> 数量 = 0
     ② 意象符最大半径 < 26
     ③ 点亮刻度数 = 段内阶数
     ④ 无坐标越出 0~100
   ============================================================ */
(function (root) {
	if (!root) return;
	root.CSH = root.CSH || {};
	if (root.CSH.svggen) return;      // 幂等：重复引入直接返回

	/* 段色（§D 令牌表）：0=冷灰 1=钢青 2=冷金 */
	var SEG_COLOR = ["#8b93a0", "#6f8ba3", "#c9a86a"];
	/* 段形状（§G.1.1）：圆 / 六边 / 八边 / 盾 / 双环+角饰 */
	var SEG_SHAPE = ["circle", "hex", "oct", "shield", "double"];
	/* 段意象符（§G.5.3）：矛 / 令旗 / 垒墙 / 方位罗盘 / 钺 */
	var SEG_MOTIF = ["spear", "banner", "rampart", "compass", "axe"];

	var VIEW = 100;          // viewBox 0 0 100 100
	var CX = 50, CY = 50;    // 圆心
	var R_FRAME = 45;        // 外框半径
	var R_TICK = 28;         // 刻度环半径（点亮 2.6px 粗 / 未点亮 1.2px 细）
	var R_MOTIF_MAX = 25.5;  // 意象符半径上限（< 26 硬指标）

	/* ============================================================
	   0. 工具
	   ============================================================ */
	function n(v) { return Math.round(v * 100) / 100; }
	/* 极坐标 → 直角坐标（角度以 12 点方向为 0，顺时针） */
	function pt(cx, cy, r, deg) {
		var rad = (deg - 90) * Math.PI / 180;
		return [n(cx + r * Math.cos(rad)), n(cy + r * Math.sin(rad))];
	}
	/* 正多边形路径 */
	function polygon(cx, cy, r, sides, rot) {
		var d = "";
		for (var i = 0; i < sides; i++) {
			var p = pt(cx, cy, r, (360 / sides) * i + (rot || 0));
			d += (i === 0 ? "M" : "L") + p[0] + " " + p[1];
		}
		return d + "Z";
	}

	/* ============================================================
	   1. 外框（§G.5.2 段形双层描边；§G.5.4 上公专属双环+角饰）
	   ============================================================ */
	function framePath(shape) {
		switch (shape) {
			case "hex": return polygon(CX, CY, R_FRAME, 6, 0);
			case "oct": return polygon(CX, CY, R_FRAME, 8, 22.5);
			case "shield": {
				// 盾形：上宽下尖
				return "M50 6 L88 22 L88 52 Q88 82 50 95 Q12 82 12 52 L12 22 Z";
			}
			default: return null; // circle / double 用 <circle>
		}
	}
	function frame(shape, color, lvl) {
		var out = "";
		var inner = R_FRAME - 6;
		if (shape === "circle" || shape === "double") {
			out += '<circle cx="50" cy="50" r="' + R_FRAME + '" fill="none" stroke="' + color + '" stroke-width="2.6"/>';
			out += '<circle cx="50" cy="50" r="' + inner + '" fill="none" stroke="' + color + '" stroke-width="1.1" opacity="0.5"/>';
			if (shape === "double") {
				// 双环 + 四向角饰（上公专属）
				out += '<circle cx="50" cy="50" r="' + (R_FRAME - 3) + '" fill="none" stroke="' + color + '" stroke-width="1.2" opacity="0.75"/>';
				for (var i = 0; i < 4; i++) {
					var p1 = pt(CX, CY, R_FRAME - 1, 45 + i * 90);
					var p2 = pt(CX, CY, R_FRAME + 5, 45 + i * 90);
					out += '<line x1="' + p1[0] + '" y1="' + p1[1] + '" x2="' + p2[0] + '" y2="' + p2[1] +
						'" stroke="' + color + '" stroke-width="2" stroke-linecap="round"/>';
				}
			}
		} else {
			out += '<path d="' + framePath(shape) + '" fill="none" stroke="' + color + '" stroke-width="2.6"/>';
			var dp = "M" + pt(CX, CY, inner, 0)[0] + " " + pt(CX, CY, inner, 0)[1];
			out += '<path d="' + (shape === "shield"
				? "M50 13 L81 26 L81 51 Q81 76 50 87 Q19 76 19 51 L19 26 Z"
				: polygon(CX, CY, inner, shape === "hex" ? 6 : 8, shape === "hex" ? 0 : 22.5)) +
				'" fill="none" stroke="' + color + '" stroke-width="1.1" opacity="0.5"/>';
		}
		return out;
	}

	/* ============================================================
	   2. 刻度环（§G.5.2 大徽章 10 格刻度；中徽章进度弧）
	   ============================================================ */
	function tickRing(pos, color) {
		var out = "";
		var step = 360 / 10;                 // 每格 36°
		for (var i = 0; i < 10; i++) {
			var on = i < pos;                // 点亮格数 = 段内阶数
			var p1 = pt(CX, CY, R_TICK, i * step - 3.2);
			var p2 = pt(CX, CY, R_TICK, i * step + 3.2);
			out += '<line x1="' + p1[0] + '" y1="' + p1[1] + '" x2="' + p2[0] + '" y2="' + p2[1] +
				'" stroke="' + color + '" stroke-width="' + (on ? "2.6" : "1.2") +
				'" opacity="' + (on ? "1" : "0.22") + '" stroke-linecap="round"/>';
		}
		return out;
	}
	/* 中徽章：进度弧（N/10 圈）—— 小尺寸比刻度清楚（§G.5.2） */
	function progressArc(pos, color) {
		var frac = Math.max(0, Math.min(10, pos)) / 10;
		if (frac <= 0) {
			return '<circle cx="50" cy="50" r="' + R_TICK + '" fill="none" stroke="' + color + '" stroke-width="2" opacity="0.22"/>';
		}
		var r = R_TICK;
		var a0 = -90, a1 = -90 + 360 * frac;
		var p0 = pt(CX, CY, r, a0 + 90);
		var p1 = pt(CX, CY, r, a1 + 90);
		var large = frac > 0.5 ? 1 : 0;
		return '<circle cx="50" cy="50" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="2" opacity="0.22"/>' +
			'<path d="M' + p0[0] + ' ' + p0[1] + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p1[0] + ' ' + p1[1] +
			'" fill="none" stroke="' + color + '" stroke-width="2.6" stroke-linecap="round"/>';
	}

	/* ============================================================
	   3. 段意象符（§G.5.3）—— 最大半径 < 26（自检硬指标）
	   ============================================================ */
	function motifSpear(color, thin) {
		// 一 卒伍 · 矛：竖矛 + 菱形矛头 + 横格 + 矛镦（全部落在 r<26 内）
		var w = thin ? 1.8 : 2.2;
		var s = "";
		s += '<line x1="50" y1="25" x2="50" y2="75" stroke="' + color + '" stroke-width="' + w + '" stroke-linecap="round"/>';
		// 矛头菱形（顶端 y=25 → 半径 25）
		s += '<path d="M50 25 L56 34 L50 43 L44 34 Z" fill="' + color + '"/>';
		// 横格
		s += '<line x1="41" y1="43" x2="59" y2="43" stroke="' + color + '" stroke-width="' + w + '"/>';
		// 矛镦（底端 y=75 → 半径 25）
		s += '<path d="M46.5 70 L53.5 70 L50 75 Z" fill="' + color + '"/>';
		if (!thin) s += '<circle cx="50" cy="43" r="1.6" fill="' + color + '"/>';
		return s;
	}
	function motifBanner(color, thin) {
		// 二 杂号 · 令旗：旗杆 + 三角旗面 + 杆顶珠（全部落在 r<26 内）
		var w = thin ? 1.8 : 2.2;
		var s = "";
		// 旗杆：x=40，y 26~74 → 最远半径 √(100+576)=26.0 → 收到 y 27~73
		s += '<line x1="40" y1="27" x2="40" y2="73" stroke="' + color + '" stroke-width="' + w + '" stroke-linecap="round"/>';
		// 三角旗面（向右展开，最远点 x=68 → 半径 18）
		s += '<path d="M40 30 L68 39 L40 54 Z" fill="' + color + '" opacity="' + (thin ? 0.85 : 1) + '"/>';
		// 杆顶珠（x=40 y=28 → 半径 24.2）
		s += '<circle cx="40" cy="28" r="2.6" fill="' + color + '"/>';
		if (!thin) s += '<line x1="40" y1="62" x2="57" y2="62" stroke="' + color + '" stroke-width="1.4" opacity="0.7"/>';
		return s;
	}
	function motifRampart(color, thin) {
		// 三 中垒 · 垒墙：三段垛口 + 基座横线（全部落在 r<26 内）
		var w = thin ? 1.8 : 2.2;
		var s = "";
		// 垛口：x 32~68，y0=33 y1=49 → 最远角 (68,33) 半径 √(324+289)=24.76
		var y0 = 33, y1 = 49, xL = 32, xR = 68;
		s += '<path d="M' + xL + ' ' + y1 + ' L' + xL + ' ' + y0 + ' L38 ' + y0 + ' L38 ' + (y0 + 5.5) + ' L44.5 ' + (y0 + 5.5) +
			' L44.5 ' + y0 + ' L55.5 ' + y0 + ' L55.5 ' + (y0 + 5.5) + ' L62 ' + (y0 + 5.5) + ' L62 ' + y0 + ' L' + xR + ' ' + y0 +
			' L' + xR + ' ' + y1 + '" fill="none" stroke="' + color + '" stroke-width="' + w + '" stroke-linejoin="round"/>';
		// 基座横线
		s += '<line x1="' + xL + '" y1="' + (y1 + 4) + '" x2="' + xR + '" y2="' + (y1 + 4) + '" stroke="' + color + '" stroke-width="' + w + '"/>';
		s += '<line x1="35" y1="' + (y1 + 10) + '" x2="65" y2="' + (y1 + 10) + '" stroke="' + color + '" stroke-width="1.4" opacity="0.6"/>';
		if (!thin) s += '<line x1="50" y1="' + (y0 + 5.5) + '" x2="50" y2="' + y1 + '" stroke="' + color + '" stroke-width="1.2" opacity="0.55"/>';
		return s;
	}
	function motifCompass(color, thin) {
		// 四 方镇 · 方位罗盘：圆环 + 南北指针(实) + 东西指针(虚) + 圆心
		var w = thin ? 1.8 : 2.2;
		var s = "";
		s += '<circle cx="50" cy="50" r="22" fill="none" stroke="' + color + '" stroke-width="' + w + '"/>';
		// 南北实指针（最远 y=27 → 半径 23）
		s += '<path d="M50 27 L55 50 L50 73 L45 50 Z" fill="' + color + '"/>';
		// 东西虚指针
		var dash = thin ? "" : ' stroke-dasharray="3 3"';
		s += '<line x1="28" y1="50" x2="72" y2="50" stroke="' + color + '" stroke-width="1.4" opacity="0.7"' + dash + '/>';
		s += '<circle cx="50" cy="50" r="2.6" fill="' + color + '"/>';
		return s;
	}
	function motifAxe(color, thin) {
		// 五 上公 · 钺：竖柄 + 顶锋 + 左右对称双刃
		var w = thin ? 1.8 : 2.2;
		var s = "";
		s += '<line x1="50" y1="26" x2="50" y2="74" stroke="' + color + '" stroke-width="' + w + '" stroke-linecap="round"/>';
		// 顶锋（y=25 → 半径 25）
		s += '<path d="M50 25 L55 33 L50 39 L45 33 Z" fill="' + color + '"/>';
		// 左刃（最远 x=27 → 半径 23）
		s += '<path d="M50 38 L28 44 Q25 52 28 60 L50 56 Z" fill="' + color + '" opacity="' + (thin ? 0.85 : 1) + '"/>';
		// 右刃（对称）
		s += '<path d="M50 38 L72 44 Q75 52 72 60 L50 56 Z" fill="' + color + '" opacity="' + (thin ? 0.85 : 1) + '"/>';
		return s;
	}
	function motif(kind, color, thin) {
		switch (kind) {
			case "spear": return motifSpear(color, thin);
			case "banner": return motifBanner(color, thin);
			case "rampart": return motifRampart(color, thin);
			case "compass": return motifCompass(color, thin);
			case "axe": return motifAxe(color, thin);
			default: return "";
		}
	}

	/* ============================================================
	   4. 质感（§G.5.4）—— 底光 / 受光 / 背光，修复"太素"
	   ============================================================ */
	function texture(color) {
		return '<circle cx="50" cy="50" r="' + (R_FRAME - 8) + '" fill="' + color + '" opacity="0.10"/>' +
			'<ellipse cx="50" cy="30" rx="22" ry="12" fill="#ffffff" opacity="0.05"/>' +
			'<ellipse cx="50" cy="74" rx="24" ry="13" fill="#000000" opacity="0.16"/>';
	}

	/* ============================================================
	   5. 三形态主函数（§G.5.2）
	   ============================================================ */
	function badge(seg, pos, form) {
		seg = Math.max(0, Math.min(4, Math.floor(Number(seg) || 0)));
		pos = Math.max(1, Math.min(10, Math.floor(Number(pos) || 1)));
		form = form || "md";
		var color = SEG_COLOR[seg >= 4 ? 2 : (seg >= 2 ? 1 : 0)];
		var shape = SEG_SHAPE[seg];
		var kind = SEG_MOTIF[seg];

		var body = "";
		body += texture(color);
		body += frame(shape, color, seg);
		if (form === "lg") body += tickRing(pos, color);
		else if (form === "md") body += progressArc(pos, color);
		// sm 不表达段内位次（交给旁边全名文字）· §G.5.2
		body += motif(kind, color, form === "sm");

		var px = form === "lg" ? 104 : (form === "md" ? 40 : 24);
		return '<svg viewBox="0 0 100 100" width="' + px + '" height="' + px + '" ' +
			'xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true" class="csh-badge csh-badge-' + form + '">' +
			body + '</svg>';
	}
	/* 便捷：由全局官阶级（0~50）直接生成 */
	function forRank(rankLv, form) {
		rankLv = Math.max(0, Math.min(50, Math.floor(Number(rankLv) || 0)));
		var segDef = [
			{ from: 0, to: 9 }, { from: 10, to: 19 }, { from: 20, to: 29 },
			{ from: 30, to: 39 }, { from: 40, to: 50 },
		];
		var seg = 0;
		for (var i = segDef.length - 1; i >= 0; i--) {
			if (rankLv >= segDef[i].from && rankLv <= segDef[i].to) { seg = i; break; }
		}
		var pos = rankLv - segDef[seg].from + 1;
		return badge(seg, pos, form);
	}

	/* ============================================================
	   6. AI 头像（§I.4 方案 A）—— 同一套生成器，参数不同
	      姓氏单字 + 势力色底 + 几何纹样；有 seed 时按角色稳定 seed 取纹样与色号，
	      97 名互不重复（2026-10-01：原「3 版式 × 6 色 → 36 种」已失效，撞脸由 seed 解决）
	   ============================================================ */
	var AVATAR_COLORS = ["#c9a86a", "#8fa3b8", "#a88f6a", "#6a8fa8", "#b8926a", "#7a8fa8"];
	/* 性格 → 纹样版式（0/1/2 三种几何） */
	var PERSONA_PATTERN = { aggro: 0, bluff: 0, tight: 1, math: 1, wild: 2 };

	/* 由 seed 决定色号：6 基础色 × 12 明度档 = 72 变体。
	   实测 97 个 stableHash 的 `seed % 72` 在同姓组内（最多 6 人）零碰撞，
	   故可保证「97 个头像两两不重复」（§17.2 验收）。 */
	function seedColor(seed) {
		var idx = (Number(seed) >>> 0) % 72;
		var base = idx % 6;
		var shade = Math.floor(idx / 6);              // 0~11
		var c = AVATAR_COLORS[base];
		var r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
		var k = 0.80 + shade * (0.40 / 11);           // 明度系数 0.80 ~ 1.20
		r = Math.min(255, Math.round(r * k));
		g = Math.min(255, Math.round(g * k));
		b = Math.min(255, Math.round(b * k));
		return "rgb(" + r + "," + g + "," + b + ")";
	}

	function pattern(kind, color) {
		var s = "";
		if (kind === 0) {
			// 放射线
			for (var i = 0; i < 8; i++) {
				var p1 = pt(50, 50, 20, i * 45);
				var p2 = pt(50, 50, 44, i * 45);
				s += '<line x1="' + p1[0] + '" y1="' + p1[1] + '" x2="' + p2[0] + '" y2="' + p2[1] +
					'" stroke="' + color + '" stroke-width="1.2" opacity="0.30"/>';
			}
		} else if (kind === 1) {
			// 同心弧
			for (var r = 24; r <= 44; r += 7) {
				s += '<circle cx="50" cy="50" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="1" opacity="0.26"/>';
			}
		} else {
			// 斜格
			for (var x = -40; x <= 90; x += 16) {
				s += '<line x1="' + x + '" y1="0" x2="' + (x + 50) + '" y2="100" stroke="' + color +
					'" stroke-width="1" opacity="0.22"/>';
			}
		}
		return s;
	}

	function avatar(surname, persona, size, seed) {
		surname = String(surname || "").slice(0, 1);
		var pat = PERSONA_PATTERN[persona];
		if (pat == null) pat = 1;
		/* 有 seed（97 人角色传入 stableHash(id)）：纹样与色号改由 seed 决定，跨设备一致；
		   无 seed（官阶徽章 / 旧调用）：行为完全不变（向后兼容，§2.4）。 */
		var useSeed = (seed != null);
		var ci, color;
		if (useSeed) {
			var sd = Number(seed) >>> 0;
			ci = sd % AVATAR_COLORS.length;   // 仅 gid 用
			pat = sd % 3;
			color = seedColor(sd);
		} else {
			ci = 0;
			for (var i = 0; i < surname.length; i++) ci = (ci + surname.charCodeAt(i)) % AVATAR_COLORS.length;
			color = AVATAR_COLORS[ci];
		}
		var px = Number(size) || 40;
		var gid = "cshav" + ci + pat + (surname.charCodeAt(0) || 0) + (useSeed ? "s" + (Number(seed) >>> 0) : "");

		return '<svg viewBox="0 0 100 100" width="' + px + '" height="' + px + '" ' +
			'xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true" class="csh-avatar">' +
			'<defs><clipPath id="' + gid + '"><circle cx="50" cy="50" r="46"/></clipPath></defs>' +
			'<circle cx="50" cy="50" r="46" fill="' + color + '" opacity="0.20"/>' +
			'<g clip-path="url(#' + gid + ')">' + pattern(pat, color) + '</g>' +
			'<circle cx="50" cy="50" r="46" fill="none" stroke="' + color + '" stroke-width="2.4"/>' +
			'<text x="50" y="52" text-anchor="middle" dominant-baseline="central" ' +
			'font-family="Microsoft YaHei, PingFang SC, STHeiti, sans-serif" font-size="42" ' +
			'font-weight="500" fill="' + color + '">' + surname + '</text>' +
			'</svg>';
	}

	/* ============================================================
	   7. 自检（§G.5.5 四条硬指标）
	   ============================================================ */
	function selfTest() {
		var report = { pass: true, checks: [] };
		function chk(name, ok, detail) {
			report.checks.push({ name: name, ok: !!ok, detail: detail || "" });
			if (!ok) report.pass = false;
		}
		// ① 徽章内 <text> 数 = 0（全 5 段 × 10 阶 × 3 形态遍历）
		var textCount = 0;
		for (var s = 0; s < 5; s++) {
			for (var p = 1; p <= 10; p++) {
				["lg", "md", "sm"].forEach(function (f) {
					var svg = badge(s, p, f);
					var m = svg.match(/<text/g);
					if (m) textCount += m.length;
					// ④ 坐标越界检查
					var nums = svg.match(/(?:x|y|cx|cy|x1|x2|y1|y2|r)="(-?[\d.]+)"/g) || [];
					nums.forEach(function (attr) {
						var v = parseFloat(attr.split("=")[1].replace(/"/g, ""));
						if (v < -2 || v > 102) report._oob = (report._oob || 0) + 1;
					});
				});
			}
		}
		chk("徽章内 <text> 数 = 0", textCount === 0, "实测 " + textCount + " 个");
		chk("无坐标越出 0~100（容差2）", !report._oob, report._oob ? report._oob + " 处越界" : "全部在界内");

		// ② 意象符最大半径 < 26：只测 motif 自身（不含外框/刻度环）
		var maxR = 0, maxKind = "";
		function consider(x, y, kind) {
			var d = Math.sqrt(Math.pow(x - CX, 2) + Math.pow(y - CY, 2));
			if (d > maxR) { maxR = d; maxKind = kind; }
		}
		for (var i = 0; i < 5; i++) {
			var kind = SEG_MOTIF[i];
			["lg", "sm"].forEach(function (thinForm) {
				var msvg = motif(kind, "#000", thinForm === "sm");
				var mm;
				// 绝对坐标属性对（line / circle）
				var reA = /(?:x1|x2|cx)="(-?[\d.]+)"\s+(?:y1|y2|cy)="(-?[\d.]+)"/g;
				while ((mm = reA.exec(msvg))) consider(parseFloat(mm[1]), parseFloat(mm[2]), kind);
				// 路径命令坐标（M / L / Q 控制点与终点）
				var reP = /[MLQ]\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/g;
				while ((mm = reP.exec(msvg))) consider(parseFloat(mm[1]), parseFloat(mm[2]), kind);
			});
		}
		chk("意象符最大半径 < 26", maxR < 26, "实测 " + n(maxR) + (maxKind ? "（" + maxKind + "）" : ""));

		// ③ 点亮刻度数 = 段内阶数（解析 lg 徽章）
		var tickOk = true, tickDetail = "";
		for (var p2 = 1; p2 <= 10; p2++) {
			var svg2 = badge(2, p2, "lg");
			var lit = 0;
			// 数 stroke-width=2.6 且 opacity=1 的 line（刻度点亮格）
			var lines = svg2.match(/<line[^>]*>/g) || [];
			lines.forEach(function (ln) {
				if (/stroke-width="2\.6"/.test(ln) && /opacity="1"/.test(ln)) lit++;
			});
			if (lit !== p2) { tickOk = false; tickDetail = "阶" + p2 + " 点亮 " + lit + " 格"; break; }
		}
		chk("点亮刻度数 = 段内阶数（1~10 全覆盖）", tickOk, tickDetail || "1~10 全部匹配");

		// 额外：forRank 边界
		chk("forRank(0) 不报错", typeof forRank(0, "lg") === "string", "");
		chk("forRank(50) 不报错", typeof forRank(50, "lg") === "string", "");
		chk("avatar 生成正常", /<svg/.test(avatar("荀", "math", 40)), "");

		return report;
	}

	/* ============================================================
	   8. 对外导出
	   ============================================================ */
	var CSH = {
		SEG_COLOR: SEG_COLOR, SEG_SHAPE: SEG_SHAPE, SEG_MOTIF: SEG_MOTIF,
		badge: badge, forRank: forRank, avatar: avatar,
		selfTest: selfTest,
		/* 供调试面板/生涯大厅批量取用 */
		all: function (form) {
			var out = [];
			for (var lv = 0; lv <= 50; lv++) {
				out.push({ rank: lv, svg: forRank(lv, form || "md") });
			}
			return out;
		},
	};
	root.CSH.svggen = CSH;
	/* 兼容：非 ESM 环境（noname 本体把 lib 挂在全局，旧代码可直接用 lib.cshSvggen） */
	try { if (typeof lib !== "undefined" && lib && !lib.cshSvggen) lib.cshSvggen = CSH; } catch (e) {}
})(typeof window !== "undefined" ? window : this);
