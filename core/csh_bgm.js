/* 池子魔将 · BGM 音乐引擎（2026-09-30）
 * ============================================================================
 * 为什么需要它：
 *   此前只有 csh_sfx.js（短音效），用户反馈「音效始终没抓住需求」，
 *   并明确要求「要像一个独立游戏一样有完整的音乐」。游戏感的一半来自配乐，
 *   短促音效堆再多也填不满这个空洞。
 *
 * 设计约束（与全扩展一致）：
 *   · 零资源体积：不加载任何 mp3/ogg，全部用 Web Audio **实时合成**。
 *     扩展体积预算里「音效（Web Audio 实时合成）= 0」（统一方案 §5.5.8）。
 *   · 零 import：与 csh_sfx.js 同款双载设计 —— 主页面 ESM 转挂到 lib.cshBgm，
 *     games/ 下的 iframe 用经典 <script src=".../csh_bgm.js" data-game="xx"> 直接引。
 *
 * 与 csh_sfx.js 的分工（两条独立总线，互不干扰）：
 *   csh_sfx  → 一次性音效（击发/发牌/中奖），走 SFX 增益 → master
 *   csh_bgm  → 循环配乐（每款游戏一首主题曲），走 MUSIC 增益 → master
 *   两个增益各自有音量档与开关，用户可「只留音乐」「只留音效」。
 *
 * 音乐性怎么保证（避免「太电子」）：
 *   1. 音色不用裸方波：一律走自定义 PeriodicWave（谐波叠加）或「失谐双振荡器 +
 *      低通 + ADSR」，模拟拨弦 / 管乐 / 铃 / 铺底垫，显著削掉电子味。
 *   2. 加一条卷积混响（脉冲响应也是程序生成的），给声音空间感。
 *   3. 调式上主打**中式五声音阶**（宫商角徵羽）贴合三国题材，
 *      悬疑/紧张场景才用自然小调与多利亚。
 *   4. 音序器走标准 lookahead 调度（25ms 轮询 / 120ms 预排），
 *      不依赖 setTimeout 的抖动，节奏稳。
 * ========================================================================== */
(function () {
	"use strict";
	var root = (typeof window !== "undefined") ? window : (typeof globalThis !== "undefined" ? globalThis : this);
	if (!root || root.CSH_BGM) return;

	/* ============================================================
	   一、常量
	   ------------------------------------------------------------ */
	var LEVELS = [0, 30, 60, 100];       // 音量档位（与 csh_sfx 共用同一套档位语义）
	var K_VOL = "csh_bgm_volume";        // 音乐音量（全扩展一个值）
	var K_ON = "csh_bgm_on";             // 音乐总开关（每游戏独立，下同 → csh_bgm_on_<game>）
	var DEFAULT_VOL = 45;                // 音乐比音效轻：铺底不抢戏
	var LOOKAHEAD_S = 0.16;              // 预排窗口（秒）
	var TICK_MS = 25;                    // 轮询间隔
	var FADE_S = 1.2;                    // 切曲淡入淡出（秒）

	/* 音名 → MIDI（C4 = 60）。只列常用的，够写五声音阶与小调。 */
	var NOTE = {
		C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6,
		G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
	};
	/** "D4" / "F#5" / "A3" → MIDI 数字；null/"" 视为休止（返回 null） */
	function nid(s) {
		if (!s) return null;
		var m = /^([A-G][#b]?)(-?\d)$/.exec(s);
		if (!m) return null;
		return NOTE[m[1]] + (parseInt(m[2], 10) + 1) * 12;
	}
	function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

	/* ============================================================
	   二、曲库
	   ------------------------------------------------------------
	   每首曲子 = 和弦进行（每小节一个根音 + 三度/五度性质）+ 旋律线 + 低音型 + 鼓型。
	   旋律/低音/鼓都写成「步序列」字符串，`.` 是延长音（sustain），`-` 是休止。
	   一小节 16 步；steps 为总步数（须是 16 的整数倍）。
	   ------------------------------------------------------------ */
	var TRACKS = {
		/* ── 大厅 / 调试面板：悠远的中式五声，古筝拨弦 + 竹笛长音 ── */
		lobby: {
			bpm: 66, steps: 64, root: "D4",
			/* 五声调式：宫(D) 商(E) 角(F#) 徵(A) 羽(B) */
			chords: [
				{ s: "D4", t: [0, 4, 7] }, { s: "B3", t: [0, 3, 7] },
				{ s: "G3", t: [0, 4, 7] }, { s: "A3", t: [0, 4, 7] },
			],
			/* 主旋律：起-承-转-合，第 3 小节拉到高音做一次呼吸 */
			lead: "A4 . D5 . . B4 . A4 . F#4 . A4 . . . .",
			leadAlt: "F#5 . E5 . D5 . B4 . A4 . B4 . D5 . . . .",
			pluck: "D4 . . A3 . . F#4 . . . A4 . . D4 . . .",
			bass: "D2 . . . . . D2 . B1 . . . . . B1 .",
			drums: "- . - . - . - . - . - . - . - .",
		},
		/* ── 德州扑克：小调 + 切分，克制的紧张（牌桌心理战） ── */
		texas: {
			bpm: 84, steps: 64, root: "A3",
			chords: [
				{ s: "A3", t: [0, 3, 7] }, { s: "F3", t: [0, 4, 7] },
				{ s: "C4", t: [0, 4, 7] }, { s: "E4", t: [0, 4, 7] },
			],
			lead: "A4 . . C5 . B4 . A4 . . G4 . A4 . . . .",
			leadAlt: "E5 . D5 . C5 . B4 . A4 . G4 . A4 . . . .",
			pluck: "A3 . E4 . . C4 . . G3 . D4 . . A3 . . .",
			bass: "A1 . . . E1 . . . F1 . . . C2 . . .",
			drums: "K . . . S . . . K . K . S . . .",
		},
		/* ── 斗地主：欢快五声，快节奏，带锣鼓点 ── */
		doudizhu: {
			bpm: 104, steps: 64, root: "G4",
			chords: [
				{ s: "G3", t: [0, 4, 7] }, { s: "D4", t: [0, 4, 7] },
				{ s: "E4", t: [0, 3, 7] }, { s: "C4", t: [0, 4, 7] },
			],
			lead: "G4 . A4 B4 . D5 . B4 . A4 . G4 . A4 . . .",
			leadAlt: "D5 . E5 . G5 . E5 . D5 . B4 . A4 . . . .",
			pluck: "G3 . D4 . . B3 . . G3 . D4 . . G3 . . .",
			bass: "G1 . G1 . D2 . . . E2 . . . C2 . . .",
			drums: "K . H . S . H . K . K H S . H .",
		},
		/* ── UNO：轻快明亮，四四拍摇摆 ── */
		uno: {
			bpm: 112, steps: 64, root: "F4",
			chords: [
				{ s: "F3", t: [0, 4, 7] }, { s: "C4", t: [0, 4, 7] },
				{ s: "G3", t: [0, 4, 7] }, { s: "A3", t: [0, 3, 7] },
			],
			lead: "F4 . A4 . C5 . A4 . G4 . B4 . D5 . . . .",
			leadAlt: "C5 . D5 . F5 . D5 . C5 . A4 . G4 . . . .",
			pluck: "F3 . C4 . . A3 . . C4 . G3 . . F3 . . .",
			bass: "F1 . . . C2 . . . G1 . . . A1 . . .",
			drums: "K . H . S . H . K . H . S . H H",
		},
		/* ── 廿一点：沉稳赌场，慢三拍圆舞曲感 ── */
		blackjack: {
			bpm: 78, steps: 48, root: "E3",
			chords: [
				{ s: "E3", t: [0, 3, 7] }, { s: "A3", t: [0, 3, 7] },
				{ s: "D4", t: [0, 4, 7] },
			],
			lead: "E4 . . G4 . B4 . . A4 . . G4 . E4 . .",
			leadAlt: "B4 . . A4 . G4 . . E4 . . G4 . B4 . .",
			pluck: "E3 . B3 . . G3 . . A3 . E4 . . D4 . .",
			bass: "E1 . . . . . A1 . . . . . D2 . . .",
			drums: "K . . H . . S . . H . . K . H .",
		},
	};

	/* ============================================================
	   三、状态
	   ------------------------------------------------------------ */
	var AC = null, master = null, musicGain = null, reverb = null, wetGain = null;
	var unlocked = false, unlockBound = false;
	var cfg = { game: "" };
	var cur = null;              // 当前曲目
	var timer = null, step = 0, nextTime = 0;
	var lastError = "";

	function lsGet(k, d) {
		try {
			var v = root.localStorage ? root.localStorage.getItem(k) : null;
			return v == null ? d : v;
		} catch (e) { return d; }
	}
	function lsSet(k, v) {
		try { if (root.localStorage) root.localStorage.setItem(k, String(v)); } catch (e) {}
	}
	function onKey() { return K_ON + (cfg.game ? "_" + cfg.game : ""); }
	function enabled() {
		var v = lsGet(onKey(), null);
		if (v == null) v = lsGet(K_ON, "1");     // 兜底：全局键
		return v !== "0" && v !== "false";
	}
	function volume() {
		var v = parseInt(lsGet(K_VOL, String(DEFAULT_VOL)), 10);
		return LEVELS.indexOf(v) >= 0 ? v : DEFAULT_VOL;
	}

	/* 自动识别当前游戏：<script src=".../csh_bgm.js" data-game="texas"> */
	try {
		var cs = root.document && root.document.currentScript;
		if (cs && cs.getAttribute) {
			var dg = cs.getAttribute("data-game");
			if (dg) cfg.game = dg;
		}
	} catch (e) {}

	/* ============================================================
	   四、音频图：master ← musicGain ← (dry + reverb)
	   ------------------------------------------------------------ */
	function ensureCtx() {
		if (AC) return AC;
		try {
			var Ctor = root.AudioContext || root.webkitAudioContext;
			if (!Ctor) { lastError = "no AudioContext"; return null; }
			AC = new Ctor();

			master = AC.createGain();
			master.gain.value = 1;
			master.connect(AC.destination);

			musicGain = AC.createGain();
			musicGain.gain.value = 0;            // 由 fadeIn 拉起
			musicGain.connect(master);

			/* 程序生成脉冲响应 → 卷积混响，给合成音一点「房间」 */
			try {
				reverb = AC.createConvolver();
				reverb.buffer = makeIR(1.9, 3.0);
				wetGain = AC.createGain();
				wetGain.gain.value = 0.26;
				musicGain.connect(reverb);
				reverb.connect(wetGain);
				wetGain.connect(master);
			} catch (eRev) { reverb = null; }
		} catch (e) { lastError = String(e); AC = null; }
		return AC;
	}

	/** 合成一段噪声脉冲响应（不加载任何音频文件） */
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

	function targetGain() {
		var v = volume();
		return v <= 0 ? 0 : (v / 100) * 0.5;   // 音乐整体压到 0.5，避免抢音效
	}

	/* ============================================================
	   五、音色（谐波叠加 / 失谐双振荡器，尽量远离「裸方波」的电子味）
	   ------------------------------------------------------------ */
	var waveCache = {};
	/** 用谐波振幅表建 PeriodicWave（缓存）。amps[0] 是基频。 */
	function wave(name, amps, real) {
		if (waveCache[name]) return waveCache[name];
		var r = new Float32Array(amps.length), im = new Float32Array(amps.length);
		for (var i = 0; i < amps.length; i++) {
			/* 三角波相位：奇次谐波交替或用实部相位 */
			r[i] = (real && real[i]) || 0;
			im[i] = amps[i];
		}
		var w = AC.createPeriodicWave(r, im, { disableNormalization: false });
		waveCache[name] = w;
		return w;
	}

	/** 通用发声：osc(s) → lowpass → gain(ADSR) → musicGain */
	function voice(t, midi, dur, opt) {
		opt = opt || {};
		var g = AC.createGain();
		var pk = (opt.gain == null ? 0.12 : opt.gain);

		/* 失谐双振荡器：轻微失谐 = 厚实、不刺耳 */
		var detune = opt.detune == null ? 6 : opt.detune;
		var srcs = [];
		var nMul = opt.oct || 1;
		for (var k = 0; k < (opt.voices || 1); k++) {
			var o = AC.createOscillator();
			if (opt.wave) { try { o.setPeriodicWave(opt.wave); } catch (e) { o.type = opt.type || "triangle"; } }
			else o.type = opt.type || "triangle";
			o.frequency.value = mtof(midi) * nMul;
			if (detune) o.detune.value = (k === 0 ? -detune : detune);
			srcs.push(o);
		}

		var node = srcs[0];
		if (srcs.length > 1) {
			var mix = AC.createGain(); mix.gain.value = 1 / srcs.length;
			for (var s = 0; s < srcs.length; s++) srcs[s].connect(mix);
			node = mix;
		}

		var lp = null;
		if (opt.cutoff) {
			lp = AC.createBiquadFilter();
			lp.type = opt.filterType || "lowpass";
			lp.frequency.value = opt.cutoff;
			lp.Q.value = opt.q == null ? 0.7 : opt.q;
			node.connect(lp); node = lp;
		}

		node.connect(g);
		g.connect(musicGain);

		/* ADSR */
		var a = opt.a == null ? 0.012 : opt.a;
		var d = opt.d == null ? 0.10 : opt.d;
		var sus = opt.s == null ? 0.55 : opt.s;
		var rel = opt.r == null ? 0.28 : opt.r;
		var t0 = t;
		g.gain.cancelScheduledValues(t0);
		g.gain.setValueAtTime(0.0001, t0);
		g.gain.exponentialRampToValueAtTime(Math.max(0.0002, pk), t0 + a);
		g.gain.exponentialRampToValueAtTime(Math.max(0.0002, pk * sus), t0 + a + d);
		var tEnd = t0 + Math.max(dur, a + d + 0.02);
		g.gain.setValueAtTime(Math.max(0.0002, pk * sus), tEnd);
		g.gain.exponentialRampToValueAtTime(0.0001, tEnd + rel);

		var stopAt = tEnd + rel + 0.05;
		for (var q = 0; q < srcs.length; q++) {
			srcs[q].start(t0);
			srcs[q].stop(stopAt);
		}
		/* 自动回收 */
		for (var w2 = 0; w2 < srcs.length; w2++) { try { srcs[w2].onended = null; } catch (e2) {} }
		return g;
	}

	/* 乐器预设（音色差异全部收敛在这里） */
	var INST = {
		/* 拨弦/古筝：奇次谐波偏多 + 快衰减 */
		pluck: function (t, m, dur, g) {
			voice(t, m, dur, {
				wave: wave("pluck", [0, 1, 0.06, 0.42, 0.03, 0.22, 0.02, 0.13], null),
				gain: g == null ? 0.10 : g, a: 0.004, d: 0.16, s: 0.10, r: 0.42,
				cutoff: 4200, voices: 2, detune: 4,
			});
		},
		/* 主旋律/竹笛：偶次谐波少、气声感，靠失谐与低通柔化 */
		lead: function (t, m, dur, g) {
			voice(t, m, dur, {
				wave: wave("lead", [0, 1, 0.30, 0.12, 0.18, 0.05, 0.08], null),
				gain: g == null ? 0.095 : g, a: 0.045, d: 0.12, s: 0.72, r: 0.30,
				cutoff: 3000, q: 0.9, voices: 2, detune: 7,
			});
		},
		/* 铺底垫：三重失谐三角波 + 低通，有厚度但不抢 */
		pad: function (t, m, dur, g) {
			voice(t, m, dur, {
				type: "triangle", gain: g == null ? 0.055 : g,
				a: 0.5, d: 0.4, s: 0.8, r: 0.9, cutoff: 1500, voices: 3, detune: 9,
			});
		},
		/* 低音：正弦为主 + 少量二次谐波，圆润不糊 */
		bass: function (t, m, dur, g) {
			voice(t, m, dur, {
				wave: wave("bass", [0, 1, 0.22, 0.05], null),
				gain: g == null ? 0.20 : g, a: 0.008, d: 0.14, s: 0.62, r: 0.20,
				cutoff: 900, voices: 2, detune: 3,
			});
		},
		/* 铃：非谐泛音，带金属余韵（高光提示用） */
		bell: function (t, m, dur, g) {
			voice(t, m, dur, {
				wave: wave("bell", [0, 1, 0.5, 0.32, 0.22, 0.14, 0.10], null),
				gain: g == null ? 0.075 : g, a: 0.006, d: 0.9, s: 0.02, r: 1.1,
				cutoff: 6200, voices: 1,
			});
		},
	};

	/* 打击乐（噪声/正弦瞬态，走同一 musicGain） */
	function drum(t, kind, g) {
		var amp = g == null ? 0.16 : g;
		if (kind === "K") {                     /* 底鼓：正弦下滑 */
			var o = AC.createOscillator(), gn = AC.createGain();
			o.type = "sine";
			o.frequency.setValueAtTime(140, t);
			o.frequency.exponentialRampToValueAtTime(46, t + 0.13);
			gn.gain.setValueAtTime(amp, t);
			gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
			o.connect(gn); gn.connect(musicGain);
			o.start(t); o.stop(t + 0.24);
			return;
		}
		/* S=军鼓 / H=踩镲：噪声 + 带通 */
		var len = Math.max(1, Math.floor(AC.sampleRate * (kind === "S" ? 0.16 : 0.05)));
		var buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0);
		for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, kind === "S" ? 2.2 : 5);
		var src = AC.createBufferSource(); src.buffer = buf;
		var f = AC.createBiquadFilter();
		f.type = kind === "S" ? "bandpass" : "highpass";
		f.frequency.value = kind === "S" ? 1700 : 7000;
		f.Q.value = kind === "S" ? 0.9 : 0.7;
		var g2 = AC.createGain();
		g2.gain.value = kind === "S" ? amp * 0.62 : amp * 0.30;
		src.connect(f); f.connect(g2); g2.connect(musicGain);
		src.start(t); src.stop(t + 0.2);
	}

	/* ============================================================
	   六、音序器（lookahead 调度，节奏稳）
	   ------------------------------------------------------------ */
	function packPattern(str) {
		var out = [];
		var toks = String(str || "").trim().split(/\s+/);
		for (var i = 0; i < toks.length; i++) out.push(toks[i]);
		return out;
	}
	function stepDuration() { return (60 / cur.bpm) / 4; }   /* 16 分音符 */

	/** 把一步上的 token 解析为「是否发声 + 时值「（`.`/`-` 由调用方处理） */
	function at(pat, s) { return pat[s % pat.length]; }

	function scheduleStep(s, t) {
		var bar = Math.floor(s / 16);
		var ch = cur.chords[bar % cur.chords.length];
		var dur = stepDuration();

		/* ① 铺底：每小节头起一个和弦垫，持续整小节 */
		if (s % 16 === 0 && cur.pad !== false) {
			var root3 = nid(ch.s);
			for (var ci = 0; ci < ch.t.length; ci++) {
				INST.pad(t, root3 + ch.t[ci], dur * 16 * 0.92, 0.050);
			}
		}

		/* ② 低音 */
		var b = at(cur._bass, s);
		if (b && b !== "." && b !== "-") INST.bass(t, nid(b), dur * 1.8, 0.20);

		/* ③ 拨弦伴奏 */
		var p = at(cur._pluck, s);
		if (p && p !== "." && p !== "-") INST.pluck(t, nid(p), dur * 1.2, 0.085);

		/* ④ 主旋律（第 2 遍用小节交替的 leadAlt 做变化，避免死循环听腻） */
		var leadPat = (Math.floor(s / cur.steps) % 2 === 1 && cur._leadAlt) ? cur._leadAlt : cur._lead;
		var l = at(leadPat, s);
		if (l && l !== "." && l !== "-") {
			var deg = nid(l);
			/* 后半拍起音的旋律稍轻，做出强弱 */
			INST.lead(t, deg, dur * 2.4, (s % 4 === 0 ? 0.100 : 0.082));
			/* 高音点加一颗铃，提升"游戏感" */
			if (deg >= 81) INST.bell(t, deg + 12, dur * 3, 0.045);
		}

		/* ⑤ 鼓 */
		var dr = at(cur._drums, s);
		if (dr && dr !== "." && dr !== "-") {
			for (var k = 0; k < dr.length; k++) drum(t, dr.charAt(k));
		}
	}

	function tick() {
		if (!AC || !cur) return;
		try {
			while (nextTime < AC.currentTime + LOOKAHEAD_S) {
				scheduleStep(step, nextTime);
				nextTime += stepDuration();
				step++;
				if (step >= cur.steps * 2) step = 0;   /* 两遍（含 leadAlt）为一个完整循环 */
			}
		} catch (e) { lastError = String(e); }
	}

	/* ============================================================
	   七、公共 API
	   ------------------------------------------------------------ */
	function fadeTo(g, v, sec) {
		try {
			var t = AC.currentTime;
			g.gain.cancelScheduledValues(t);
			g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
			g.gain.linearRampToValueAtTime(Math.max(0.0001, v), t + (sec || FADE_S));
		} catch (e) {}
	}

	/** 播放某首。name 省略时取本页 data-game；**两者都没有就不播**（不回落 lobby）。
	 *
	 *  【2026-09-30 修复 · 主界面误响配乐】
	 *  上一版写成 `name || cfg.game || "lobby"`，于是主页面也会响配乐：
	 *  csh_bgm.js 被 main/bootstrap.js 以 ESM 方式 import 进无名杀本体时，
	 *  document.currentScript 为空 ⇒ cfg.game = "" ⇒ 而 bindUnlock 的手势回调
	 *  会调 play() ⇒ 无 key ⇒ 回落 "lobby" ⇒ 玩家在模式选择界面就听见了「池子休闲」的曲子。
	 *  现在无曲目直接不播：主页面必须由「池子休闲」面板显式调用 play("lobby") 才发声。 */
	function play(name) {
		var key = name || cfg.game;
		if (!key) return false;
		var trk = TRACKS[key];
		if (!trk) return false;
		if (!ensureCtx()) return false;
		if (!enabled()) return false;
		if (cur && cur._key === key && timer) return true;   /* 已在放同一首 */
		stop(true);

		cur = trk;
		cur._key = key;
		cur._lead = packPattern(trk.lead);
		cur._leadAlt = trk.leadAlt ? packPattern(trk.leadAlt) : null;
		cur._pluck = packPattern(trk.pluck);
		cur._bass = packPattern(trk.bass);
		cur._drums = packPattern(trk.drums);
		step = 0;
		nextTime = AC.currentTime + 0.06;
		fadeTo(musicGain, targetGain(), FADE_S);
		if (timer) clearInterval(timer);
		timer = setInterval(tick, TICK_MS);
		tick();
		return true;
	}

	function stop(immediate) {
		if (timer) { clearInterval(timer); timer = null; }
		if (immediate) { cur = null; }
		if (AC && musicGain) fadeTo(musicGain, 0, immediate ? 0.25 : FADE_S);
	}

	function setVolume(v) {
		if (LEVELS.indexOf(v) < 0) return false;
		lsSet(K_VOL, v);
		if (AC && musicGain && timer) fadeTo(musicGain, targetGain(), 0.3);
		return true;
	}
	function setEnabled(on) {
		lsSet(onKey(), on ? "1" : "0");
		if (on) play(cur && cur._key);
		else stop(false);
		return true;
	}
	/** 切换当前游戏（切曲不打断同曲） */
	function setGame(g) { cfg.game = g || ""; if (timer) play(g); }

	/** 首次用户交互解锁（移动端自动播放策略）。
	 *
	 *  【2026-09-30 修复】自动起播必须带条件：**只有本页声明了 data-game 才自动播**。
	 *  即只有 games/*.html 里 `<script src=".../csh_bgm.js" data-game="texas">` 这种
	 *  「游戏页自载」场景才自动出声；主页面（ESM import）data-game 为空，一律不自动播，
	 *  交给「池子休闲」面板显式调用。
	 *
	 *  【2026-10-03 收紧 · 用户要求「背景音乐只应该在点进池子休闲出现，其他任何时候都
	 *  不要有」】自动起播改为**显式开关制**：只有玩家真的开过**这款游戏**的音乐
	 *  （localStorage `csh_bgm_on_<game>` === "1"）才自动播。
	 *  原因：游戏页里只有「音效」开关，根本没有音乐开关 —— 自动起播等于"关不掉"，
	 *  玩家一进牌桌就被动听曲子。现在默认静音；要游戏主题曲时把对应键设为 "1"
	 *  （曲库与引擎原样保留，tools/audio_preview.html 照常可试听）。
	 *  ⚠ enabled() 的口径（"没被显式关掉"）**保持不变** —— 那是给显式调用用的：
	 *  「池子休闲」面板里 play("lobby") 不受本次收紧影响，照旧出声。 */
	function explicitOn() {
		try {
			return !!(root.localStorage && root.localStorage.getItem(onKey()) === "1");
		} catch (e) { return false; }
	}
	function bindUnlock() {
		if (unlockBound) return;
		unlockBound = true;
		var handler = function () {
			unlocked = true;
			try {
				if (ensureCtx() && AC.state === "suspended") AC.resume();
			} catch (e) {}
			if (cfg.game && explicitOn() && !timer) play();
			var evs = ["pointerdown", "touchstart", "keydown"];
			for (var i = 0; i < evs.length; i++) {
				try { root.removeEventListener(evs[i], handler, true); } catch (e2) {}
			}
		};
		var evs2 = ["pointerdown", "touchstart", "keydown"];
		for (var j = 0; j < evs2.length; j++) {
			try { root.addEventListener(evs2[j], handler, true); } catch (e3) {}
		}
	}
	bindUnlock();

	root.CSH_BGM = {
		TRACKS: TRACKS,
		play: play,
		stop: stop,
		setVolume: setVolume,
		setEnabled: setEnabled,
		setGame: setGame,
		volume: volume,
		enabled: enabled,
		isPlaying: function () { return !!timer; },
		current: function () { return cur ? cur._key : null; },
		DEFAULT_VOL: DEFAULT_VOL,
		LEVELS: LEVELS,
		lastError: function () { return lastError; },
		_context: function () { return AC; },
	};
})();
