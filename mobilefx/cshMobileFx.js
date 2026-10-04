/* 手游播报特效播放器（Cocos Studio CSB 时间轴版）
 *
 * 作用：把「击杀 / 伤害 / 回复」播报换成三国杀移动版的位图特效。
 * 数据：manifest.js（把 特效清单.json 包成 lib.cshMobileFxData = [...]）
 * 贴图：<base>/<key>/*.png    base 默认 "extension/池子魔将/mobilefx/"
 *
 * 与池子魔将现有 lib.cshShoushaFx 的 play(type, data) 签名保持一致：
 *     play("diankuang")            伤害 3 点   -> 癫狂屠戮
 *     play("wanjun")               伤害 >=4 点 -> 无双·万军取首
 *     play("kill", {count:1..7})   连杀 1~7    -> 卧龙出山/一战成名/…/诛天灭地
 *     play("recover", {kind:"self"})  -> 医术高超（自己回血）
 *     play("recover", {kind:"other"}) -> 妙手回春（助人回血）
 *
 * 尺寸与位置（按手游原样）：
 *     缩放 = 视口宽 / _designW × _zoom。_designW 是手游的设计分辨率宽，
 *     按它把 CSB 坐标 1:1 映射到屏幕 —— 所以特效占屏幕的比例与手游一致，
 *     不为了「塞进屏幕」而缩小（放大时的画质损失是可接受的，不额外处理）。
 *     画布整幅居中显示；比屏幕大的部分（最宽的「妙手回春」约 119% 屏宽）
 *     照手游一样被屏幕边缘裁掉，裁到的只是墨迹飞溅，文字不受影响。
 *
 * 卡点（_holdOn，默认开）：
 *     CSB 时间轴比语音短得多（如「卧龙出山」动画 2.25s、语音 4.70s）。
 *     手游里时间轴跑完后画面停在最后一帧，直到语音播完才消失；这里照做，
 *     否则画面比语音先没，看着就是「不卡点」。末帧 alpha 已归零的特效
 *     （如「四连·天下无敌」）停住时本来就看不见，不会多出静止画面。
 *
 * 音频：播放器默认不发声（_audioOn = false）。游戏里语音由扩展自己的
 *     game.playAudio 播放（安装时那 11 个 mp3 已被替换成手游原声），
 *     两边同时起播即与手游一致；播放器再放一次会变成双份。
 *     预览页把 _audioOn 打开，用来核对「画面 + 语音」是否卡点。
 *
 * 状态全部挂在模块对象上、方法内不引用外部闭包变量，
 * 因此可以随 game.broadcastAll 安全下发到联机各端。
 */
(function (global) {
	"use strict";

	var M = {
		_base: "",          // 资源根；贴图实际取 <base><key>/<文件名>.png
		_data: null,        // 时间轴数组
		_byKey: null,       // key -> 时间轴
		_tex: null,         // key -> {文件名: Image}（只有真正加载成功的 key 才会在这里）
		_texOk: null,       // key -> true：贴图已完整就绪（判定缓存的唯一依据）
		_loading: null,     // key -> true（贴图加载中）
		_slots: null,       // 并发槽位（击杀/伤害/回复可能同帧叠播）
		_slotMax: 3,
		_designW: 1280,     // 手游设计分辨率宽；CSB 坐标按此 1:1 映射到视口
		_zoom: 1,           // 1 = 原大小；>1 放大，<1 缩小
		_oyShift: 0,        // 垂直微调（视口高度比例，正值下移）；0 = 正中心
		_holdOn: true,      // 时间轴跑完后停末帧、等语音播完再收（手游行为）
		_shake: false,      // 播报时场地轻微抖动（手游没有，默认关；想加再开）
		_audioBase: "",     // 预览用：语音目录，如 "../02_素材/音频/"
		_audioOn: false,    // 游戏里由扩展播语音，这里默认关，避免双份
		_debug: false,
		_lastError: "",     // 最近一次播不出来的原因（status() 会上报，排查用）

		/* ---------- 初始化 ---------- */

		// 播放是「尽力而为」的：任何一环不成立都不能打断对局，但也绝不能静默 ——
		// 以前 play 的 try/catch 把原因全吞了，表现就只是「只有声音、没有画面」。
		_fail: function (msg) {
			this._lastError = String(msg == null ? "" : msg);
			try { console.error("[池子魔将·手游特效] " + this._lastError); } catch (e) {}
			return false;
		},

		configure: function (base, data) {
			if (base != null && String(base) !== "") this._base = String(base);
			// 兜底默认根：即使没人调用 configure（例如宿主只挂了 window.cshMobileFx），
			// 贴图也能按相对路径找到，不会静默画出一张空画布。
			if (!this._base) this._base = "extension/池子魔将/mobilefx/";
			var d = data || global.cshMobileFxData ||
				(typeof lib !== "undefined" && lib.cshMobileFxData) || null;
			if (d) {
				this._data = d;
				this._byKey = {};
				for (var i = 0; i < d.length; i++) this._byKey[d[i].key] = d[i];
			}
			if (!this._tex) this._tex = {};
			if (!this._texOk) this._texOk = {};
			if (!this._loading) this._loading = {};
			if (!this._slots) this._slots = [];
			return this;
		},

		/* ---------- 对外接口 ---------- */

		play: function (type, data) {
			try {
				if (typeof _status !== "undefined" && _status.video) return;   // 录像回放不叠特效
				if (!this._data) this.configure();
				if (!this._byKey) return this._fail("清单未配置：configure 没拿到数据（manifest 未加载？）");
				var key = this._resolve(type, data);
				var eff = key && this._byKey[key];
				if (!eff) return this._fail("清单里没有该特效: " + key);
				if (this._isRunning(key)) return;                              // 同特效运行中不重入
				var self = this;
				this._preload(eff, function () { self._start(eff); });
			} catch (e) { this._fail("播放异常: " + ((e && e.message) || e)); }
		},

	stop: function () {
		if (!this._slots) return;
		for (var i = 0; i < this._slots.length; i++) {
			var s = this._slots[i];
			if (s && s.raf) { try { cancelAnimationFrame(s.raf); } catch (e) { } s.raf = 0; }
			/* 2026-10-02：兜底定时器也要一并清掉。否则 stop 后它到点仍会触发 _end，
			   若此时槽位已被新特效复用，会把新特效中途掐掉（画面突然消失）。 */
			if (s && s.timer) { try { clearTimeout(s.timer); } catch (eT) { } s.timer = 0; }
			if (s && s.audio) { try { s.audio.pause(); } catch (e2) { } s.audio = null; }
			if (s) { s.key = null; s.eff = null; s.t0 = 0; s.total = 0; }
			if (s && s.canvas) s.canvas.style.display = "none";
		}
	},

		/* ---------- 自检 ---------- */

		// 播报特效排查用：一眼看出是「脚本没加载」「清单没数据」还是「贴图没取到」
		status: function () {
			var keys = 0, i;
			if (this._byKey) for (i in this._byKey) if (this._byKey[i]) keys++;
			var tex = 0;
			if (this._texOk) for (i in this._texOk) if (this._texOk[i]) tex++;
			var loading = 0;
			if (this._loading) for (i in this._loading) if (this._loading[i]) loading++;
			return {
				base: this._base || "(未设置)",
				data: !!this._data,
				keys: keys,
				texReady: tex,
				loading: loading,
				slots: this._slots ? this._slots.length : 0,
				lastError: this._lastError || "",
			};
		},

		/* ---------- 内部 ---------- */

		// 池子魔将的 (type, data) 语义 -> 素材 key
		_resolve: function (type, data) {
			if (type === "kill") {
				var n = (data && data.count) || 1;
				n = n < 1 ? 1 : (n > 7 ? 7 : n);
				return "kill" + n;
			}
			if (type === "recover") {
				// 池子魔将 _recover(kind)：self = 医术高超，other = 妙手回春
				return (data && data.kind === "other") ? "recover_other" : "recover_self";
			}
			return type;                                       // diankuang / wanjun 同名
		},

		_isRunning: function (key) {
			if (!this._slots) return false;
			var now = (global.performance && performance.now()) || Date.now();
			for (var i = 0; i < this._slots.length; i++) {
				var s = this._slots[i];
				if (!s || s.key !== key) continue;
				// 卡死的槽位会让这个特效再也播不出来（rAF 在后台标签页 / 加载屏会被暂停，
				// step 不再回调，_end 永不执行，slot.key 就永远占着）。按寿命超时回收。
				var life = (s.total || 0) * 1000 + 4000;
				if (s.t0 && now - s.t0 > life) { this._end(s); continue; }
				return true;
			}
			return false;
		},

		_freeSlot: function () {
			if (!this._slots) this._slots = [];
			for (var i = 0; i < this._slots.length; i++) {
				if (this._slots[i] && !this._slots[i].key) return this._slots[i];
			}
			if (this._slots.length >= this._slotMax) return null;
			var s = { canvas: null, ctx: null, key: null, eff: null, t0: 0, total: 0, raf: 0, timer: 0, audio: null };
			this._slots.push(s);
			return s;
		},

		_ensure: function (slot) {
			if (slot.canvas) return;
			var c = document.createElement("canvas");
			c.style.cssText = "position:fixed;left:0;top:0;width:100%;height:100%;" +
				"z-index:10000;pointer-events:none;display:none;";
			// 挂到 documentElement：引擎缩放时 body 带 transform:scale，
			// 其内部 fixed 层会整体偏移，挂 html 层才真正铺满视口
			document.documentElement.appendChild(c);
			slot.canvas = c;
			slot.ctx = c.getContext("2d");
		},

		_texFor: function (key, name) {
			// 注意：这里不能顺手建空表。否则一次加载失败留下的空表会被
			// _preload 当成「已加载」，之后永远走缓存、画空画布、也不再重试。
			var m = this._tex && this._tex[key];
			if (!m) return null;
			return m[name] || null;
		},

		_preload: function (eff, cb) {
			if (!this._tex) this._tex = {};
			if (!this._texOk) this._texOk = {};
			if (!this._loading) this._loading = {};
			var key = eff.key;
			if (this._texOk[key]) return cb();                         // 只有完整就绪才算命中缓存
			if (this._loading[key]) {                                  // 已在加载：轮询等待
				var self = this, n = 0;
				var timer = setInterval(function () {
					if (self._texOk[key] || ++n > 200) { clearInterval(timer); cb(); }
				}, 30);
				return;
			}
			this._loading[key] = true;
			var names = {}, nodes = eff.nodes || [], i, j;
			for (i = 0; i < nodes.length; i++) {
				if (!nodes[i]) continue;
				if (nodes[i].tex0) names[nodes[i].tex0] = 1;
				// tex 可能缺省，直接取 .length 会抛异常并被 play 的 try 吞掉 —— 表现就是「只出声、没画面」
				if (!Array.isArray(nodes[i].tex)) continue;
				for (j = 0; j < nodes[i].tex.length; j++) {
					if (nodes[i].tex[j] && nodes[i].tex[j][1]) names[nodes[i].tex[j][1]] = 1;
				}
			}
			var list = [], k;
			for (k in names) if (names[k]) list.push(k);
			var store = {};
			var left = list.length, failed = 0, failNames = [], self2 = this;
			if (!left) { this._tex[key] = store; this._texOk[key] = true; return cb(); }
			var done = function () {
				if (--left > 0) return;
				delete self2._loading[key];
				if (failed) {
					// 贴图没取到就别标成就绪：下次播放会重新拉一次，
					// 不会像以前那样被一次失败永久钉成空画布。
					delete self2._tex[key];
					delete self2._texOk[key];
					self2._fail("贴图未取到（" + failed + "/" + list.length + "）根=" + self2._base
						+ " 例=" + failNames.slice(0, 2).join(","));
				} else {
					self2._tex[key] = store;
					self2._texOk[key] = true;
				}
				cb();
			};
			for (i = 0; i < list.length; i++) {
				(function (nm) {
					var img = new Image();
					img.onload = function () { done(); };
					img.onerror = function () { failed++; if (failNames.length < 4) failNames.push(key + "/" + nm); done(); };
					img.src = self2._base + key + "/" + nm;
					store[nm] = img;
				})(list[i]);
			}
		},

		// 语音与画面同时起播（预览用；游戏里由扩展 playAudio 负责）
		_playAudio: function (slot, eff) {
			if (!this._audioOn || !this._audioBase || !eff.audio || !eff.audio.file) return;
			try {
				var a = new Audio(this._audioBase + eff.audio.file);
				a.volume = 1;
				slot.audio = a;
				var pr = a.play();
				if (pr && pr.catch) pr.catch(function () { });
			} catch (e) { }
		},

		_start: function (eff) {
			var slot = this._freeSlot();
			if (!slot) return;
			this._ensure(slot);
			var cw = eff.canvas[0], ch = eff.canvas[1];
			var dpr = Math.min(global.devicePixelRatio || 1, 2);
			var vw = global.innerWidth || 1920, vh = global.innerHeight || 1080;
			// 原大小：CSB 坐标按手游设计分辨率映射到视口，不为了塞进屏幕而缩小
			var scale = (vw / (this._designW || 1280)) * this._zoom;
			slot.canvas.width = Math.round(vw * dpr);
			slot.canvas.height = Math.round(vh * dpr);
			slot.canvas.style.display = "block";
			slot.key = eff.key;
			slot.eff = eff;
			slot.dpr = dpr;
			slot.scale = scale;
			slot.dx = (vw - cw * scale) / 2;                                  // 整幅居中
			slot.dy = (vh - ch * scale) / 2 + (this._oyShift || 0) * vh;
			slot.ox = eff.origin[0];
			slot.oy = eff.origin[1];
			slot.t0 = (global.performance && performance.now()) || Date.now();
			// 卡点：时间轴跑完后停在末帧，等语音播完才收（手游就是这个行为）
			var animSec = eff.duration / (eff.fps || 60);
			var audioSec = (this._holdOn && eff.audio && eff.audio.dur) ? eff.audio.dur : 0;
			slot.total = Math.max(animSec, audioSec);
			if (this._shake) this._doShake(eff);
			this._playAudio(slot, eff);
			var self = this;
			var step = function () {
				if (!slot.key) return;
				var now = (global.performance && performance.now()) || Date.now();
				var sec = (now - slot.t0) / 1000;
				if (sec >= slot.total) {
					self._draw(slot, eff.duration);
					self._end(slot);
					return;
				}
				// 超过时间轴长度就夹在末帧上（画面静止，等语音）
				self._draw(slot, Math.min(sec * eff.fps, eff.duration));
				slot.raf = requestAnimationFrame(step);
			};
			slot.raf = requestAnimationFrame(step);
			// 兜底收尾：rAF 被挂起（后台标签页 / 加载屏）时 step 不再回调，槽位会永久占用，
			// 这个特效以后就再也播不出来。用定时器保底把槽位放掉。
			if (slot.timer) { try { clearTimeout(slot.timer); } catch (eT) { } }
			slot.timer = setTimeout(function () { self._end(slot); }, slot.total * 1000 + 2500);
		},

		_end: function (slot) {
			if (slot.raf) { try { cancelAnimationFrame(slot.raf); } catch (e) { } slot.raf = 0; }
			if (slot.timer) { try { clearTimeout(slot.timer); } catch (eT2) { } slot.timer = 0; }
			if (slot.audio) { try { slot.audio.pause(); } catch (e2) { } slot.audio = null; }
			if (slot.ctx) slot.ctx.clearRect(0, 0, slot.canvas.width, slot.canvas.height);
			if (slot.canvas) slot.canvas.style.display = "none";
			slot.key = null; slot.eff = null; slot.t0 = 0; slot.total = 0;
		},

		_doShake: function (eff) {
			var arena = document.getElementById("arena");
			if (!arena) return;
			var cls = "csh_mfx_shake";
			var st = document.getElementById("csh_mfx_shake_css");
			if (!st) {
				st = document.createElement("style");
				st.id = "csh_mfx_shake_css";
				st.textContent =
					"@keyframes csh_mfx_shake_x{0%,100%{transform:translate(0,0);}" +
					"10%{transform:translate(-10px,6px);}20%{transform:translate(9px,-7px);}" +
					"30%{transform:translate(-8px,-5px);}40%{transform:translate(7px,7px);}" +
					"50%{transform:translate(-6px,4px);}60%{transform:translate(5px,-5px);}" +
					"70%{transform:translate(-4px,3px);}80%{transform:translate(3px,-3px);}" +
					"90%{transform:translate(-2px,2px);}}" +
					".csh_mfx_shake{animation:csh_mfx_shake_x .7s ease-in-out;}";
				document.head.appendChild(st);
			}
			arena.classList.add(cls);
			setTimeout(function () { arena.classList.remove(cls); }, 750);
		},

		/* ---------- 采样 ---------- */

		_lerp: function (a, b, k) { return a + (b - a) * k; },

		_sample: function (track, t, def) {
			if (!track || !track.length) return def.slice ? def.slice() : [def];
			if (t <= track[0][0]) return track[0].slice(1);
			if (t >= track[track.length - 1][0]) return track[track.length - 1].slice(1);
			for (var i = 0; i < track.length - 1; i++) {
				var t0 = track[i][0], t1 = track[i + 1][0];
				if (t0 <= t && t <= t1) {
					var k = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
					var a = track[i], b = track[i + 1], out = [];
					for (var j = 1; j < a.length; j++) out.push(this._lerp(a[j], b[j], k));
					return out;
				}
			}
			return track[track.length - 1].slice(1);
		},

		_texAt: function (node, t) {
			if (!node.tex || !node.tex.length) return node.tex0;
			if (t <= node.tex[0][0]) return node.tex[0][1];
			for (var i = 0; i < node.tex.length - 1; i++) {
				if (node.tex[i][0] <= t && t < node.tex[i + 1][0]) return node.tex[i][1];
			}
			return node.tex[node.tex.length - 1][1];
		},

		/* ---------- 绘制 ---------- */

		_draw: function (slot, t) {
			var eff = slot.eff, ctx = slot.ctx;
			if (!eff || !ctx) return;
			var W = slot.canvas.width, H = slot.canvas.height;
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.clearRect(0, 0, W, H);
			var k = slot.scale * slot.dpr;      // Cocos 单位 -> 设备像素
			// dx/dy 把整幅摆到屏幕正中心；之后一律用 Cocos 坐标作图
			ctx.setTransform(k, 0, 0, k, (slot.dx || 0) * slot.dpr, (slot.dy || 0) * slot.dpr);
			var nodes = eff.nodes, ox = slot.ox, oy = slot.oy;
			for (var i = 0; i < nodes.length; i++) {   // 数组顺序即绘制顺序（靠后覆盖）
				var n = nodes[i];
				if (n.vis.length && !this._sample(n.vis, t, [1])[0]) continue;
				var alpha = this._sample(n.alpha, t, [255])[0] / 255;
				if (alpha <= 0.004) continue;
				var nm = this._texAt(n, t);
				if (!nm) continue;
				var img = this._texFor(eff.key, nm);
				if (!img || !img.complete || !img.naturalWidth) continue;
				var p = this._sample(n.pos, t, n.pos0);
				var s = this._sample(n.scale, t, n.scale0);
				var rot = this._sample(n.rot, t, [n.rot0])[0];
				var w = n.size[0] * s[0], h = n.size[1] * s[1];
				if (!(w > 0) || !(h > 0)) continue;
				var ax = n.anchor[0], ay = n.anchor[1];
				ctx.save();
				ctx.globalAlpha = alpha > 1 ? 1 : alpha;
				ctx.translate(p[0] - ox, oy - p[1]);
				if (rot) ctx.rotate(-rot * Math.PI / 180);   // Cocos 逆时针为正，屏幕 y 翻转后取负
				ctx.drawImage(img, -ax * w, -(1 - ay) * h, w, h);
				ctx.restore();
			}
			ctx.setTransform(1, 0, 0, 1, 0, 0);
		}
	};

	// 本文件是被 <script src> 注入的经典脚本，作用域里只有 window：
	// 引擎的 lib 是模块作用域变量，只有「开发者模式」才会挂到 window.lib
	// （见 noname/library/index.js 的 setLibrary / lib.cheat.i）。
	// 所以正常模式下 typeof lib === "undefined"，只能挂到 window；
	// 由 extension.js（ESM，拿得到真正的 lib）把它补挂到 lib.cshMobileFx 上。
	global.cshMobileFx = M;
	try { if (global.lib) global.lib.cshMobileFx = M; } catch (eAttach) {}
})(typeof window !== "undefined" ? window : this);