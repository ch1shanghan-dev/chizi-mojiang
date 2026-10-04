/* 池子魔将 · 统一音效总线 SfxBus（§4.7.1）
   ============================================================
   规格要点（逐条对应 §4.7.1）：
     · 引擎   —— 全部 Web Audio 实时合成，零资源体积（不加任何 mp3/wav 文件）
     · 总线   —— 统一 SfxBus：play(name, opt) / 音量 / 静音
     · 持久化 —— 每游戏独立开关 csh_<game>_sfx；共用同一套音量档位 0/30/60/100
     · 解锁   —— 首次用户交互解锁 AudioContext（移动端必须）
     · 参数   —— 沿用《小游戏设计方案》附录 C；新增音效补进同一张表
   本文件是**唯一一份**合成实现：此前 5 款游戏各自复制了一份 AC/env/tone/noise，
   且开关键统一写成 csh_sfx（互相串味，违背「每游戏独立开关」），本轮全部收编到此处。

   ★ 本文件零 import / 零 export，必须同时满足两种加载方式：
       ① 主页面：extension.js `import "./core/csh_sfx.js"` → 纯副作用，挂到 window.CSH_SFX，
          再由 extension.js 转挂 lib.cshSfx（这样 csh_sfx.js 不必依赖 noname 的 lib）；
       ② 游戏 iframe：<script src="../../core/csh_sfx.js" data-game="texas"> 经典脚本加载。
     iframe 与主页面是两个文档、两个 window，各挂各的，互不影响。
     之所以不用 <script> 注入主页面：见 mobilefx/index.js 顶部注释（宿主拦脚本、路径变异，
     故障表现静默且查不出原因）——主页面走已被验证的 ESM 导入链，iframe 才用经典脚本。

   ★ 缺文件不致命：各游戏一律通过本文件末尾的 sandbox() 取总线，
     拿不到时返回 no-op 代理，游戏照常运行，只是没声音。
*/
(function (root) {
	"use strict";
	if (!root || root.CSH_SFX) return;

	/* ---------- 常量 ---------- */
	var LEVELS = [0, 30, 60, 100];      // 音量档位（§4.7.1 共用同一套）
	var K_VOL = "csh_sfx_volume";       // 共用音量键（全扩展一个值）
	var DEFAULT_VOL = 60;
	var DEFAULT_TIER = 60;
	var MASTER_K = 0.6;                 // 附录 C 实现约定：全局音量 0.6
	var MAX_LAYERS = 6;                 // 单次 play 最多叠加的层数（防脏表炸掉耳朵）
	var GESTURES = ["pointerdown", "touchstart", "mousedown", "keydown"];

	/* ============================================================
	   一、配方表（附录 C + §4.7.1 补全清单）
	   两层构造器，让表保持纯数据 —— 自检可以直接遍历断言，不必跑音频。
	     T(f0, type, dur, peak, delay, f1)                → 振荡器层
	     N(dur, hz, q, peak, delay, hz1, filter)          → 噪声层
	   可选字段：
	     pn  音高随连击上升的步进（1.06 = 每次 +6%，见 hit.head）
	     when(opt) 条件层（同一名字按参数走不同材质，见 hit.*）
	   ------------------------------------------------------------ */
	function T(f0, type, dur, peak, delay, f1) {
		return { k: 1, f0: f0, type: type, dur: dur, peak: peak, delay: delay || 0, f1: f1 || 0 };
	}
	function N(dur, hz, q, peak, delay, hz1, filter) {
		return { k: 2, dur: dur, hz: hz, q: q, peak: peak, delay: delay || 0, hz1: hz1 || 0, filter: filter || "bandpass" };
	}

	var RECIPES = {
		/* ===== 通用 UI（面板 / 结算屏 / 弹窗） ===== */
		"ui.tap": [T(680, "triangle", 0.05, 0.07, 0, 900)],
		"ui.back": [T(520, "triangle", 0.06, 0.06, 0, 380)],
		"ui.warn": [T(330, "square", 0.10, 0.07), T(330, "square", 0.10, 0.07, 0.14)],
		"ui.error": [T(210, "sawtooth", 0.18, 0.10, 0, 140), T(160, "square", 0.20, 0.06, 0.05, 110)],

		/* ===== 纸牌公共（德州 / 廿一点 / 斗地主 / UNO） ===== */
		"card.deal": [N(0.06, 2600, 1.0, 0.10, 0, 0, "highpass")],
		"card.hit": [N(0.06, 2600, 1.0, 0.10, 0, 0, "highpass"), N(0.05, 2000, 1.0, 0.07, 0.05, 0, "highpass")],
		"card.flip": [N(0.05, 2200, 1.0, 0.09, 0, 0, "highpass")],
		"card.play": [N(0.07, 1600, 1.0, 0.13), T(540, "triangle", 0.08, 0.09, 0, 420)],
		"card.draw": [N(0.09, 2100, 1.0, 0.11)],
		"card.pass": [T(320, "sine", 0.16, 0.12, 0, 210)],
		"card.fold": [T(300, "sine", 0.18, 0.10, 0, 190)],
		"card.check": [T(600, "triangle", 0.07, 0.08, 0, 720)],
		"card.raise": [T(520, "square", 0.08, 0.07, 0, 690), T(690, "square", 0.10, 0.07, 0.09, 920), T(140, "sine", 0.10, 0.12, 0, 90)], // 加码（双升+鼓点）
		"card.show": [T(880, "triangle", 0.10, 0.10, 0, 1047), T(1319, "triangle", 0.14, 0.08, 0.09), N(0.10, 6000, 1.2, 0.04, 0.09, 0, "highpass")], // 亮牌星芒
		"chip.bet": [
			N(0.045, 1500, 1.0, 0.13, 0, 0, "bandpass"), N(0.045, 1700, 1.0, 0.11, 0.04, 0, "bandpass"),
			N(0.045, 1450, 1.0, 0.10, 0.085, 0, "bandpass"), N(0.05, 1900, 1.0, 0.09, 0.13, 0, "bandpass"),
			T(2600, "triangle", 0.05, 0.045, 0.16, 2100),
		],                                                                                            // 筹码瀑布（四连密磕+滑石音）
		"bomb": [
			T(170, "square", 0.55, 0.20, 0, 36),
			N(0.55, 800, 0.7, 0.28, 0, 110, "lowpass"),
			N(0.18, 4200, 1.0, 0.10, 0.02, 800, "highpass"),
		],                                                                                            // 炸弹（低频boom+爆体+碎裂高频）
		"uno": [T(660, "square", 0.08, 0.10), T(880, "square", 0.12, 0.10, 0.09), T(880, "triangle", 0.10, 0.06, 0.20, 830)], // 喊UNO（弹跳双音+回声）
		"win": [
			T(140, "sine", 0.16, 0.18, 0, 70),             // 低鼓
			T(523, "square", 0.09, 0.07, 0.03),            // do
			T(659, "square", 0.09, 0.07, 0.12),            // mi
			T(784, "square", 0.09, 0.07, 0.21),            // so
			T(1047, "triangle", 0.40, 0.14, 0.30, 1319),   // do′ 长音上扬（洗脑尾巴）
			N(0.16, 6500, 1.1, 0.05, 0.30, 0, "highpass"), // 镲花
		],                                                                                            // 胜利凯歌（咚-哒-哒-哒~↑）
		"lose": [
			T(233, "sawtooth", 0.20, 0.11, 0, 220),        // womp ①
			T(196, "sawtooth", 0.34, 0.12, 0.22, 150),     // womp ② 下坠
			T(98, "sine", 0.40, 0.13, 0.22, 62),           // 低音垫
		],                                                                                            // 失败（womp womp 滑落）
		"badge": [T(660, "triangle", 0.12, 0.11, 0, 880), T(990, "triangle", 0.16, 0.10, 0.10, 1320)],
		"sign": [T(659, "triangle", 0.10, 0.10), T(880, "triangle", 0.10, 0.10, 0.09), T(1319, "triangle", 0.22, 0.10, 0.18)], // 签到叮咚（三连上行）
		"quota": [T(200, "square", 0.16, 0.10, 0, 150), T(160, "square", 0.18, 0.08, 0.14, 120)],
		"stone.place": [N(0.08, 1200, 1.0, 0.10, 0, 0, "lowpass"), T(250, "sine", 0.08, 0.10, 0, 180)],

		/* ===== 廿一点专项（§4.7.1：发牌/要牌/爆牌/二十一点/结算） ===== */
		"bust": [T(180, "sawtooth", 0.32, 0.12, 0, 90), T(120, "square", 0.30, 0.06, 0, 84), N(0.14, 3000, 1.0, 0.07, 0.16, 700, "highpass")], // 爆牌（下坠+碎裂）
		"bj": [T(150, "sine", 0.12, 0.14, 0, 90), T(523, "square", 0.08, 0.06), T(659, "square", 0.08, 0.06, 0.075),
			T(784, "square", 0.08, 0.06, 0.15), T(988, "triangle", 0.20, 0.10, 0.225, 1245)],         // 天然21点（低鼓+五连arp）
		"ins": [T(520, "triangle", 0.09, 0.09, 0, 680)],
		"streak": [withPn(T(660, "triangle", 0.12, 0.10, 0, 940), 1.06)],   // 连胜（音高随连胜数，opt.n）

		/* ===== 主页面（§F.3 上限保护 / §4.5.7 兑换 / §G 升阶） ===== */
		"cap.warn": [T(240, "square", 0.14, 0.09), T(240, "square", 0.14, 0.09, 0.16)],
		"redeem": [T(659, "triangle", 0.14, 0.12), T(988, "triangle", 0.16, 0.11, 0.10), T(1319, "triangle", 0.22, 0.10, 0.20)],
		"rank.up": [T(523, "triangle", 0.16, 0.12), T(784, "triangle", 0.24, 0.12, 0.12, 1047)],
		/* 跨段升阶（§G.3）：鼓 + 号角组合音 */
		"rank.seg": [
			N(0.16, 180, 1.0, 0.24, 0.00, 0, "lowpass"), T(70, "sine", 0.20, 0.20, 0, 46),
			N(0.16, 180, 1.0, 0.20, 0.22, 0, "lowpass"), T(70, "sine", 0.20, 0.18, 0.22, 46),
			T(392, "triangle", 0.30, 0.13, 0.46), T(523, "triangle", 0.30, 0.13, 0.56),
			T(659, "triangle", 0.46, 0.14, 0.66, 784),
		],
		/* ===== 高光时刻专项（2026-09-30 音效增强轮新增） ===== */
		"allin": [
			N(0.40, 300, 1.0, 0.10, 0, 1400, "bandpass"),  // 鼓滚上升
			T(220, "sawtooth", 0.44, 0.10, 0.05, 660),     // 滑升
			T(140, "sine", 0.16, 0.18, 0.50, 70),          // 落锤
			T(880, "square", 0.10, 0.07, 0.52),            // 亮音定格
		],                                                                                             // 全下（riser+落锤）
		"lord": [
			T(140, "sine", 0.14, 0.16, 0, 80),
			T(587, "square", 0.09, 0.08, 0.02),
			T(587, "square", 0.09, 0.08, 0.13),
			T(784, "square", 0.24, 0.09, 0.24, 880),
		],                                                                                             // 斗地主·地主定了（当-当-当~）
		"spring": [
			T(523, "square", 0.07, 0.07), T(659, "square", 0.07, 0.07, 0.08), T(784, "square", 0.07, 0.07, 0.16),
			T(1047, "square", 0.07, 0.07, 0.24), T(1319, "triangle", 0.34, 0.12, 0.32, 1568),
			N(0.14, 6500, 1.1, 0.05, 0.32, 0, "highpass"),
		],                                                                                             // 春天/反春天（快速上行+长尾）
		"jackpot": [
			T(160, "sine", 0.14, 0.14, 0, 85),
			T(1047, "triangle", 0.08, 0.09), T(1319, "triangle", 0.08, 0.09, 0.08), T(1568, "triangle", 0.08, 0.09, 0.16),
			T(2093, "triangle", 0.30, 0.10, 0.24), N(0.20, 6500, 1.1, 0.05, 0.24, 0, "highpass"),
		],                                                                                             // 头奖（低鼓+老虎机arp+镲）
	};

	/* 连击音高：把 pn 拍到该层上（表里写成数据，play 时按 opt.n 取值） */
	function withPn(layer, pn) { layer.pn = pn; return layer; }

	/* 材质别名（§4.7.1「命中（分材质）」）：play('hit',{mat:'metal'}) → hit.cover.metal */
	var MAT_ALIAS = {
		flesh: "hit.body", body: "hit.body", head: "hit.head",
		shield: "hit.shield", armor: "hit.shield", metal: "hit.cover.metal",
		sand: "hit.cover.sand", sandbag: "hit.cover.sand", wood: "hit.cover.metal",
	};

	/* 旧名 → 新名（各游戏原来的短名，避免一次性改动过大出错；新代码请用点号名） */
	var ALIAS = {
		shot: "bow.fire", flight: "arrow.fly", body: "hit.body", head: "hit.head",
		shield: "hit.shield", reload: "bow.nock", friendly: "friendly.hit",
		miss: "miss.warn", wave: "wave.start", slow: "slowmo", breath: "breath.hold",
		coverHit: "hit.cover.metal", enemyShot: "enemy.fire", hide: "enemy.hide",
		peek: "enemy.peek", dodge: "enemy.dodge", leak: "leak",
		ui: "ui.tap", deal: "card.deal", flip: "card.flip", play: "card.play",
		draw: "card.draw", pass: "card.pass", fold: "card.fold", check: "card.check",
		raise: "card.raise", show: "card.show", chip: "chip.bet", penal: "badge",
		skip: "card.pass", bust: "bust", bj: "bj", ins: "ins", streak: "streak",
	};

	/* ============================================================
	   二、状态
	   ------------------------------------------------------------ */
	var cfg = { game: "", key: "" };     // game 决定开关键名
	var AC = null, master = null, comp = null, reverb = null, wet = null;
	var unlockBound = false;
	var lastError = "";

	/* 自动识别：<script src=".../csh_sfx.js" data-game="texas"> */
	try {
		var cur = root.document && root.document.currentScript;
		if (cur && cur.getAttribute) {
			var dg = cur.getAttribute("data-game");
			if (dg) cfg.game = String(dg);
		}
	} catch (e0) { /* 作为 ES 模块加载时 currentScript 为 null，属正常 */ }

	/* ---------- 存储（失败静默，不因隐私模式炸掉游戏） ---------- */
	function lsGet(k, d) {
		try {
			var v = root.localStorage.getItem(k);
			return v == null ? d : v;
		} catch (e) { return d; }
	}
	function lsSet(k, v) { try { root.localStorage.setItem(k, v); } catch (e) {} }

	function swKey() { return cfg.key || ("csh_" + (cfg.game || "ext") + "_sfx"); }

	/* ---------- 开关 / 音量（§4.7.1 持久化） ---------- */
	function enabled() { return lsGet(swKey(), "1") !== "0"; }
	function setEnabled(b) {
		lsSet(swKey(), b ? "1" : "0");
		if (b) unlock();
		return !!b;
	}
	function volume() {
		var v = parseInt(lsGet(K_VOL, String(DEFAULT_VOL)), 10);
		if (isNaN(v) || LEVELS.indexOf(v) < 0) v = DEFAULT_VOL;
		return v;
	}
	function setVolume(v) {
		v = parseInt(v, 10);
		if (LEVELS.indexOf(v) < 0) v = DEFAULT_VOL;
		lsSet(K_VOL, String(v));
		applyGain();
		if (v > 0) setEnabled(true);
		return v;
	}
	/* 组合档（各游戏设置面板只暴露这一个）：0 = 关，30/60/100 = 低/中/高 */
	function tier() { return enabled() ? volume() : 0; }
	function setTier(v) {
		v = parseInt(v, 10);
		if (LEVELS.indexOf(v) < 0) v = DEFAULT_TIER;
		if (v === 0) { setEnabled(false); return 0; }
		lsSet(K_VOL, String(v));
		setEnabled(true);
		applyGain();
		return v;
	}
	function mute(b) { return setEnabled(!b); }
	function isMuted() { return !enabled() || volume() === 0; }

	function applyGain() {
		if (!master) return;
		try { master.gain.value = (volume() / 100) * MASTER_K; } catch (e) {}
	}

	/** 程序生成脉冲响应（噪声 × 指数衰减），供卷积混响使用 —— 不加载任何音频文件。
	    与 csh_bgm.js 里的同名函数是同一套做法，两边各自持有（两者都要能独立零 import 加载）。 */
	function makeIR(seconds, decay) {
		var rate = AC.sampleRate, len = Math.max(1, Math.floor(rate * seconds));
		var buf = AC.createBuffer(2, len, rate);
		for (var ch = 0; ch < 2; ch++) {
			var d = buf.getChannelData(ch);
			for (var i = 0; i < len; i++) {
				d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
			}
		}
		return buf;
	}

	/* ---------- AudioContext（§4.7.1「首次用户交互解锁」，移动端必须） ---------- */
	function ctx() {
		if (AC) {
			if (AC.state === "suspended") { try { AC.resume(); } catch (e) {} }
			return AC;
		}
		try {
			var C = root.AudioContext || root.webkitAudioContext;
			if (!C) { lastError = "no-audiocontext"; return null; }
			AC = new C();
			master = AC.createGain();
			master.gain.value = (volume() / 100) * MASTER_K;

			/* 【2026-09-30 音色改进】两处全局链路升级，目的是去掉「干巴的电子味」与「太吵」：
			   ① 软限幅（DynamicsCompressor）：高光时刻常有多层同时发声，直接相加会削波发破，
			      听感就是「吵」。压缩器把峰值收住，响度更稳。
			   ② 卷积混响（Convolver + 程序生成脉冲响应）：合成音最大的问题是「没有空间」，
			      干声贴脸 = 廉价电子感。挂一条 18% 湿声的短混响，立刻有厅堂感，
			      与 csh_bgm.js 用的是同一手法。 */
			try {
				comp = AC.createDynamicsCompressor();
				comp.threshold.value = -14;
				comp.knee.value = 8;
				comp.ratio.value = 3.5;
				comp.attack.value = 0.003;
				comp.release.value = 0.14;
			} catch (eC) { comp = null; }
			try {
				reverb = AC.createConvolver();
				reverb.buffer = makeIR(1.15, 2.6);
				wet = AC.createGain();
				wet.gain.value = 0.18;
			} catch (eR) { reverb = null; wet = null; }

			var tail = comp || AC.destination;
			master.connect(tail);
			if (comp) comp.connect(AC.destination);
			if (reverb) { master.connect(reverb); reverb.connect(wet); wet.connect(tail); }
		} catch (e) { AC = null; master = null; lastError = "ctx-fail:" + (e && e.message); }
		return AC;
	}
	function unlock() {
		var c = ctx();
		if (!c) return false;
		if (c.state === "suspended") { try { c.resume(); } catch (e) {} }
		if (c.state === "running") unbindUnlock();
		return c.state === "running";
	}
	function onGesture() { unlock(); }
	function bindUnlock() {
		if (unlockBound) return;
		if (!root.addEventListener) return;
		unlockBound = true;
		for (var i = 0; i < GESTURES.length; i++) {
			try { root.addEventListener(GESTURES[i], onGesture, true); } catch (e) { /* 忽略 */ }
		}
	}
	function unbindUnlock() {
		if (!unlockBound) return;
		unlockBound = false;
		for (var i = 0; i < GESTURES.length; i++) {
			try { root.removeEventListener(GESTURES[i], onGesture, true); } catch (e) { /* 忽略 */ }
		}
	}

	/* ---------- 合成原语 ---------- */
	function envOf(g, t0, dur, peak, atk) {
		var a = atk || 0.008;
		g.gain.setValueAtTime(0.0001, t0);
		g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
		g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
	}
	function playLayer(c, L, t0, mul, vol) {
		var peak = (L.peak == null ? 0.16 : L.peak) * vol;
		if (L.k === 1) {
			var f0 = L.f0 * mul, f1 = L.f1 ? L.f1 * mul : 0;
			var o = c.createOscillator(), g = c.createGain();
			o.type = L.type || "sine";
			o.frequency.setValueAtTime(Math.max(20, f0), t0);
			if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + L.dur);
			envOf(g, t0, L.dur, peak);
			o.connect(g); g.connect(master);
			o.start(t0); o.stop(t0 + L.dur + 0.02);
			return;
		}
		/* 噪声层：一次生成一段白噪，走带通 / 低通 / 高通 */
		var n = Math.max(1, Math.floor(c.sampleRate * L.dur));
		var buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
		for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
		var s = c.createBufferSource(); s.buffer = buf;
		var f = c.createBiquadFilter();
		f.type = L.filter || "bandpass";
		f.frequency.setValueAtTime(Math.max(20, L.hz * mul), t0);
		if (f.Q) f.Q.value = L.q || 1;
		if (L.hz1) f.frequency.exponentialRampToValueAtTime(Math.max(20, L.hz1 * mul), t0 + L.dur);
		var g2 = c.createGain(); envOf(g2, t0, L.dur, peak);
		s.connect(f); f.connect(g2); g2.connect(master);
		s.start(t0); s.stop(t0 + L.dur + 0.02);
	}

	/* ---------- 播放 ---------- */
	function resolveName(name, opt) {
		var n = String(name == null ? "" : name);
		if (n === "hit" && opt && opt.mat) return MAT_ALIAS[String(opt.mat)] || "hit.body";
		if (RECIPES[n]) return n;
		if (ALIAS[n]) return ALIAS[n];
		return "";
	}
	function list() {
		var out = [];
		for (var k in RECIPES) if (Object.prototype.hasOwnProperty.call(RECIPES, k)) out.push(k);
		return out.sort();
	}
	function has(name) { return !!resolveName(name, null) || !!ALIAS[name]; }
	/* 总开关关闭 / 音量 0 时直接 return，不建 AudioContext（附录 C 实现约定） */
	function play(name, opt) {
		if (!enabled()) return false;
		if (volume() === 0) return false;
		var key = resolveName(name, opt);
		if (!key) { lastError = "unknown:" + name; return false; }
		var layers = RECIPES[key];
		if (!layers || !layers.length) return false;
		var c = ctx();
		if (!c) return false;
		if (c.state === "suspended") { try { c.resume(); } catch (e) {} }
		if (c.state !== "running") return false;   // 未解锁先静默，不做伪播放
		var o = opt || {};
		var vol = o.vol == null ? 1 : Math.max(0, Math.min(2, Number(o.vol) || 0));
		var t0 = c.currentTime + (o.delay || 0) + 0.002;
		var n = Math.max(0, Math.floor(Number(o.n) || 0));
		var cnt = Math.min(layers.length, MAX_LAYERS);
		for (var i = 0; i < cnt; i++) {
			var L = layers[i];
			var mul = L.pn ? Math.pow(L.pn, Math.min(24, n)) : 1;
			playLayer(c, L, t0 + (L.delay || 0), mul, vol);
		}
		return true;
	}

	/* ============================================================
	   三、对外接口
	   ------------------------------------------------------------ */
	var bus = {
		/* 配置：game 决定开关键（csh_<game>_sfx）；key 可整键覆盖 */
		init: function (o) {
			o = o || {};
			if (o.game) cfg.game = String(o.game);
			if (o.key) cfg.key = String(o.key);
			bindUnlock();
			return { game: cfg.game, key: swKey() };
		},
		play: play,
		unlock: unlock,
		enabled: enabled,
		setEnabled: setEnabled,
		mute: mute,
		isMuted: isMuted,
		volume: volume,
		setVolume: setVolume,
		tier: tier,
		setTier: setTier,
		levels: function () { return LEVELS.slice(); },
		has: has,
		list: list,
		key: swKey,
		volumeKey: K_VOL,
		ready: function () { return !!(AC && AC.state === "running"); },
		state: function () { return AC ? AC.state : "none"; },
		lastError: function () { return lastError; },
		/* 自检用：不改状态、不建上下文 */
		recipe: function (name) {
			var k = resolveName(name, null);
			return k ? RECIPES[k].slice() : null;
		},
	};

	/* ============================================================
	   四、no-op 代理 —— 缺文件时代替总线，保证游戏照常跑
	   ------------------------------------------------------------ */
	function noop() {
		var o = {
			init: function () { return { game: "", key: "" }; },
			play: function () { return false; },
			unlock: function () { return false; },
			enabled: function () { return false; },
			setEnabled: function () { return false; },
			mute: function () { return false; },
			isMuted: function () { return true; },
			volume: function () { return 0; },
			setVolume: function () { return 0; },
			tier: function () { return 0; },
			setTier: function () { return 0; },
			levels: function () { return LEVELS.slice(); },
			has: function () { return false; },
			list: function () { return []; },
			key: function () { return ""; },
			volumeKey: K_VOL,
			ready: function () { return false; },
			state: function () { return "missing"; },
			lastError: function () { return "sfx-missing"; },
			recipe: function () { return null; },
			MISSING: true,
		};
		return o;
	}

	root.CSH_SFX = bus;
	root.CSH_SFX_SANDBOX = function () { return root.CSH_SFX || noop(); };
	root.CSH_SFX_LEVELS = LEVELS.slice();
	/* 自动挂手势解锁：即使游戏忘了 init()，也能在首次点击时解锁（移动端必须） */
	bindUnlock();
})(typeof window !== "undefined" ? window : this);
