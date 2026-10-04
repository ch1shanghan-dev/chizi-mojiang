import { lib, game, _status } from "../../../noname.js";
// 池子魔将 · 统一语音播报（伤害 / 回复 / 击杀 / 特殊事件）
//
// 这一支是「播报」的唯一出口：语音（audio/effect/*.mp3）+ 手游位图特效
// （lib.cshShoushaFx，实际已转到 lib.cshMobileFx）成对播放，不再散落在各技能里。
//
// 资源映射表 TABLE 是唯一事实来源：
//   - file 命中 FILES 白名单才会播语音；缺文件自动跳过，只播特效，不产生 404。
//   - fx 走 lib.cshShoushaFx.play(type, data)（引擎内已被转接到手游位图播放器）。
//   - 未登记的 key 一律拒绝，避免拼错文件名后静默失败查不出原因。
//
// 与 csh_interact.js 同一套约束：全局技能的 content 会被 StepCompiler 反编译后
// 用 new Function 重建，闭包变量全部失效，所以 content 里只转调 lib.cshVoice.*，
// 并把该做的事塞进 lib.cshVoice 的方法里（方法体不参与反编译，闭包安全）。
//
// 触发门槛沿用原实现，不放大：
//   伤害 >=3 点；自己/助人单回合累计回复 >=3 点；击杀连杀 1~7（>7 记 7）。

(function () {
	if (lib.cshVoice) return;

	var CFG_KEY = "extension_池子魔将_csh_effect_announce";
	var BASE = "ext:池子魔将/audio/effect/";

	// audio/effect 目录实有文件（缺文件即跳过，不会 404）
	var FILES = {
		csh_damage3: 1,
		csh_damage4: 1,
		csh_kill1: 1,
		csh_kill2: 1,
		csh_kill3: 1,
		csh_kill4: 1,
		csh_kill5: 1,
		csh_kill6: 1,
		csh_kill7: 1,
		csh_recover_self: 1,
		csh_recover_other: 1,
	};

	// 播报表。cat: damage / recover / kill / special
	var TABLE = {
		damage_small: { cat: "damage", label: "重伤 3 点 · 癫狂屠戮", file: "csh_damage3", fx: "diankuang" },
		damage_big: { cat: "damage", label: "重创 4 点以上 · 万军取首", file: "csh_damage4", fx: "wanjun" },
		kill_1: { cat: "kill", label: "连杀 1 · 卧龙出山", file: "csh_kill1", fx: "kill", fxData: { count: 1 } },
		kill_2: { cat: "kill", label: "连杀 2 · 一战成名", file: "csh_kill2", fx: "kill", fxData: { count: 2 } },
		kill_3: { cat: "kill", label: "连杀 3 · 举世皆惊", file: "csh_kill3", fx: "kill", fxData: { count: 3 } },
		kill_4: { cat: "kill", label: "连杀 4 · 天下无敌", file: "csh_kill4", fx: "kill", fxData: { count: 4 } },
		kill_5: { cat: "kill", label: "连杀 5 · 诛天灭地", file: "csh_kill5", fx: "kill", fxData: { count: 5 } },
		kill_6: { cat: "kill", label: "连杀 6 · 诛天灭地", file: "csh_kill6", fx: "kill", fxData: { count: 6 } },
		kill_7: { cat: "kill", label: "连杀 7 · 诛天灭地", file: "csh_kill7", fx: "kill", fxData: { count: 7 } },
		recover_self: { cat: "recover", label: "自身回复 3 点 · 医术高超", file: "csh_recover_self", fx: "recover", fxData: { kind: "self" } },
		recover_other: { cat: "recover", label: "助人回复 3 点 · 妙手回春", file: "csh_recover_other", fx: "recover", fxData: { kind: "other" } },
		// 特殊事件：只有毛笔字特效，没有对应语音（跳过音频，不算缺失）
		special_quedi: { cat: "special", label: "却敌", file: null, fx: "quedi" },
		special_niliu: { cat: "special", label: "逆流", file: null, fx: "niliu" },
		special_guilai: { cat: "special", label: "归来", file: null, fx: "guilai" },
	};

	var played = 0;
	var lastKey = "";
	var warned = {};

	function cfgOff() {
		try {
			return lib.config && lib.config[CFG_KEY] === false;
		} catch (e) {
			return false;
		}
	}
	function enabled() {
		return !cfgOff();
	}
	function logInfo(msg, data) {
		try {
			if (lib.cshDebug && typeof lib.cshDebug.info === "function") {
				lib.cshDebug.info("voice: " + msg, data);
			} else {
				console.log("[池子魔将·播报] " + msg, data == null ? "" : data);
			}
		} catch (e) {}
	}
	function warnOnce(msg) {
		if (warned[msg]) return;
		warned[msg] = 1;
		try {
			if (lib.cshDebug && typeof lib.cshDebug.error === "function") {
				lib.cshDebug.error("voice: " + msg);
			} else {
				console.warn("[池子魔将·播报] " + msg);
			}
		} catch (e) {}
	}

	function audioPathOf(key) {
		var e = TABLE[key];
		if (!e || !e.file) return null;
		if (!FILES[e.file]) {
			warnOnce("语音资源未登记，已跳过: " + e.file);
			return null;
		}
		return BASE + e.file + ".mp3";
	}

	// 手游位图播放器：走 ESM 动态导入，由 mobilefx/index.js 把清单、播放器、贴图根接好，
	// 再补挂到 lib.cshMobileFx。
	// 这里刻意不用静态 import：静态导入一旦失败会把整个播报模块一起带走，连语音都没了；
	// 动态导入失败只降级成「只有语音」，并且留下可查的原因。
	// 扩展自身的导入链（csh_debug.js / csh_winrate.js …）在游戏里是确定可用的，
	// 所以这条通道不需要拿路径变异碰运气、onload 语义或宿主是否拦脚本。
	var _mfxLoading = false;
	var _mfxTries = 0;
	var _mfxError = "";
	function loadMfx() {
		if (lib.cshMobileFx) return true;
		if (_mfxLoading || _mfxTries >= 4) return false;
		_mfxLoading = true;
		_mfxTries++;
		try {
			/* 【2026-09-30 第六轮 · 修 404】原为 "./mobilefx/index.js" —— 但本文件在 core/ 下，
			   相对解析会得到 core/mobilefx/index.js（不存在），实机网络面板确认 404，
			   导致手游位图播放器（语音/特效）在移动端从未加载。mobilefx/ 在扩展根目录，应为 "../"。 */
			import("../mobilefx/index.js").then(function (mod) {
				_mfxLoading = false;
				if (mod && mod.mfxPlayer && !lib.cshMobileFx) lib.cshMobileFx = mod.mfxPlayer;
				if (!lib.cshMobileFx) _mfxError = "模块已加载，但播放器没挂到 lib";
			}).catch(function (e) {
				_mfxLoading = false;
				_mfxError = (e && e.message) || String(e);
				setTimeout(loadMfx, 600 * _mfxTries);
			});
		} catch (e) {
			_mfxLoading = false;
			_mfxError = (e && e.message) || String(e);
		}
		return false;
	}
	function ensureMfx() {
		loadMfx();
		return lib.cshMobileFx || null;
	}
	// 开局就发起：等第一次播报（伤害/连杀/回复）时早已就位
	loadMfx();

	// 播报的实际落地动作。必须是无闭包引用的纯函数：联机时它会被 toString 后
	// 发到其他端用 new Function 重建，闭包变量在那边一律取不到。
	// 所有取用一律走全局（lib / game / window），参数全部由实参传入。
	function localPlay(p, f, d) {
		if (p && lib.config && lib.config.background_audio) {
			try {
				game.playAudio(p);
			} catch (e1) {}
		}
		if (!f) return;
		var MFX = lib.cshMobileFx || (typeof window !== "undefined" ? window.cshMobileFx : null);
		if (MFX && typeof MFX.play === "function") {
			try {
				MFX.play(f, d || null);
				return;
			} catch (e2) {}
		}
		if (lib.cshShoushaFx && typeof lib.cshShoushaFx.play === "function") {
			try {
				lib.cshShoushaFx.play(f, d || null);
			} catch (e3) {}
		}
	}

	// 唯一播放出口。opts.force 用于技能内部调用（此时不再重复判开关，filter 已判过）。
	function play(key, opts) {
		var e = TABLE[key];
		if (!e) {
			warnOnce("未登记的播报 key: " + key);
			return false;
		}
		if (!(opts && opts.force) && !enabled()) {
			logInfo("跳过（扩展设置里的播报开关是关的）: " + key);
			return false;
		}
		if (typeof _status !== "undefined" && _status.video) return false;
		var path = audioPathOf(key);
		var fx = e.fx || null;
		var fxData = e.fxData || null;
		if (!path && !fx) return false;
		ensureMfx();
		try {
			// 本端必须先无条件直播。引擎的 game.broadcastAll 开头就是
			// `if (game.online) return` —— 联机客户端（以及部分宿主）会整体短路，
			// 只靠它会出现「主机有动静、客户端一点反应都没有」。
			// 所以本端直接播一次，再单独用 game.broadcast 把同一个函数推给其他端
			// （单机时 game.broadcast 是 no-op，不会重复播）。
			localPlay(path, fx, fxData);
			try {
				game.broadcast(localPlay, path, fx, fxData);
			} catch (eB) {}
		} catch (err) {
			warnOnce("播报下发失败: " + key + " / " + ((err && err.message) || err));
			return false;
		}
		played++;
		lastKey = key;
		// 每次播报都留一条：语音播没播、特效走的是哪个播放器、播放器自己有没有报错
		var mfxNow = lib.cshMobileFx || (typeof window !== "undefined" ? window.cshMobileFx : null);
		logInfo("已播 " + key, {
			语音: path || "无",
			特效: fx || "无",
			播放器: mfxNow ? "就位" : "缺失",
			播放器报错: (mfxNow && mfxNow._lastError) || "无",
		});
		return true;
	}

	lib.cshVoice = {
		enabled: enabled,
		has: function (key) {
			return !!TABLE[key];
		},
		hasAudio: function (key) {
			return !!audioPathOf(key);
		},
		play: play,
		// 按数值选条目：伤害 3 点 / 4 点以上
		damage: function (num) {
			return play(num === 3 ? "damage_small" : "damage_big");
		},
		// 连杀 1~7，超出按 7 计
		kill: function (count) {
			var n = count | 0;
			if (n < 1) return false;
			if (n > 7) n = 7;
			return play("kill_" + n);
		},
		// kind: self | other
		recover: function (kind) {
			return play(kind === "other" ? "recover_other" : "recover_self");
		},
		// 特殊事件（毛笔字特效，无语音）
		special: function (name) {
			return play("special_" + name);
		},
		// 调试面板用：播报表全量
		entries: function () {
			var out = [];
			for (var k in TABLE) {
				if (!Object.prototype.hasOwnProperty.call(TABLE, k)) continue;
				var e = TABLE[k];
				out.push({
					key: k,
					cat: e.cat,
					label: e.label,
					file: e.file || "",
					fx: e.fx || "",
					audio: !!audioPathOf(k),
				});
			}
			return out;
		},
		// 排查用：播报链路断在哪一环（脚本没到 / 清单没数据 / 贴图没取到）一眼可见
		// 注意：这里整体包了 try —— 自检本身绝不能抛错，否则点一下按钮什么都没发生，
		// 反而比不查更迷惑（旧版调了一个不存在的 mfxBase() 就是这个下场）。
		status: function () {
			var out = { enabled: enabled() };
			try {
				var mfx = ensureMfx();
				out.script = !!mfx;
				out.base = (mfx && mfx._base) || "(未设置)";
				out.error = _mfxError || "";
				if (mfx && typeof mfx.status === "function") out.mfx = mfx.status();
			} catch (e) {
				out.script = false;
				out.error = "自检异常: " + ((e && e.message) || e);
			}
			return out;
		},
		// 整条链一次性列出：开关 → 技能是否注册 → 触发钩子是否挂上 → 播放器状态。
		// 局内「播报不响」时先看这个，能直接指出断在哪一段。
		diag: function () {
			var SKILLS = [
				["_csh_effect_damage_announce", "player_damage", "damage"],
				["_csh_effect_kill_announce", "source_die", "die"],
				["_csh_effect_recover_announce", "player_changeHp", "changeHp"],
			];
			var out = {
				key: CFG_KEY,
				config: null,
				contentReached: !!lib.cshVoice.contentReached,
				installed: false,
				skills: {},
				hookmap: {},
				installLog: (lib.cshVoice._installLog || []).slice(-8).map(function (r) {
					return r.why + (r.ok ? "=OK" : "=FAIL") + (r.error ? " " + String(r.error).split("\n")[0] : "");
				}),
				mfx: null,
			};
			try {
				out.config = lib.config ? lib.config[CFG_KEY] : "(无 lib.config)";
			} catch (e0) {
				out.config = "(读取失败)";
			}
			out.configHint =
				out.config === false
					? "播报总开关为关：设置 → 池子魔将 → 伤害/击杀/回复播报 打开后才会播报"
					: "播报总开关为开";
			if (!out.contentReached) {
				out.contentReachedHint =
					"content 未走到播报安装处（中途抛错被引擎吞进 console）—— 播报靠模块加载自安装兜底";
			}
			var allIn = true;
			SKILLS.forEach(function (row) {
				var name = row[0], hookKey = row[1], evt = row[2];
				var info = null, inGlobal = false, hooked = null;
				try {
					info = (lib.skill && lib.skill[name]) || null;
					inGlobal = inGlobalTable(name);
					var arr = lib.hook && lib.hook.globalskill && lib.hook.globalskill[hookKey];
					if (!arr) hooked = null;
					else if (typeof arr.has === "function") hooked = arr.has(name);
					else if (typeof arr.indexOf === "function") hooked = arr.indexOf(name) >= 0;
					else hooked = false;
					out.hookmap[evt] = !!(lib.hookmap && lib.hookmap[evt]);
				} catch (e1) {}
				if (!info || !inGlobal) allIn = false;
				out.skills[name] = { defined: !!info, inGlobal: inGlobal, hooked: hooked };
			});
			out.installed = allIn;
			try {
				out.mfx = this.status();
			} catch (e2) {}
			return out;
		},
		stats: function () {
			return { played: played, last: lastKey };
		},
	};

	// ---------- 全局技能 ----------
	function define(name, skill) {
		if (lib.skill[name]) return false;
		skill.forced = true;
		skill.silent = true;
		skill.charlotte = true;
		skill.popup = false;
		skill.global = true;
		skill._csh_registered = true;
		lib.skill[name] = skill;
		return true;
	}
	function addGlobal(name) {
		try {
			if (lib.skill[name] && game && typeof game.addGlobalSkill === "function") {
				game.addGlobalSkill(name);
			}
		} catch (e) {
			warnOnce("addGlobalSkill " + name + " 失败");
		}
	}
	// 全局技能表在不同引擎里可能是 Set 也可能是数组，两种都认。
	// 判定「装没装上」只看这张表，不看 install 的返回值，避免自欺。
	function inGlobalTable(name) {
		try {
			var g = lib.skill && lib.skill.global;
			if (!g) return false;
			if (typeof g.has === "function") return g.has(name);
			if (typeof g.indexOf === "function") return g.indexOf(name) >= 0;
			return !!g[name];
		} catch (e) {
			return false;
		}
	}

	lib.cshVoice.install = function () {
		if (!lib.skill) return false;

		// 伤害：>=3 点。闪电延时锦囊的雷伤不播（与手游一致）。
		//
		// 挂 damage，不挂 damageEnd —— 这是「打进濒死 / 打死就不播报」的根因修复：
		//   引擎伤害事件的步骤顺序是「扣血 → 触发 damage → 才做濒死与求桃结算」。
		//   挂 damageEnd 时，最后一步是濒死结算，等它跑完角色往往已经 dead / out，
		//   lib.filter.filterTrigger 里 `!forceDie && player.isDead()`、
		//   `!forceOut && (player.isOut() || player.removed)` 两道门槛会把技能整条拦掉，
		//   表现就是「打不死才播报，打进濒死、直接打死都不播报」。
		//   挂 damage 发生在扣血之后、濒死之前，此时角色一定还活着，既绕开 dead/out
		//   门槛，也不会因为濒死中断或游戏结束而漏播。
		//   forceDie / forceOut 继续保留：代价为零，兜住个别顺序差异。
		define("_csh_effect_damage_announce", {
			trigger: { player: "damage" },
			forceDie: true,
			forceOut: true,
			filter: function (event) {
				if (lib.config["extension_池子魔将_csh_effect_announce"] === false) return false;
				if (!event || typeof event.num !== "number" || event.num < 3) return false;
				try {
					var sd = event.getParent && event.getParent("shandian");
					if (sd && sd.name === "shandian") return false;
				} catch (e) {}
				return true;
			},
			content: function () {
				if (lib.cshVoice && lib.cshVoice.damage) lib.cshVoice.damage(trigger.num);
			},
		});

		// 击杀：连杀计数挂在击杀者身上，阵亡者清零。
		//
		// 挂 source，不挂 player：这样技能所属者是「击杀者」，而击杀者必定活着，
		// 天然绕开 die 时阵亡者已 dead / out 的门槛 —— 这正是「最后一刀结束游戏时
		// 不播报」的根因。被触发的是 die 事件本身（trigger），阵亡者在 trigger.player。
		define("_csh_effect_kill_announce", {
			trigger: { source: "die" },
			forceDie: true,
			forceOut: true,
			filter: function () {
				return lib.config["extension_池子魔将_csh_effect_announce"] !== false;
			},
			content: function () {
				var dead = trigger.player;
				if (dead && dead.storage) {
					dead.storage.csh_total_kills = 0;
					if (typeof dead.syncStorage === "function") dead.syncStorage("csh_total_kills");
				}
				if (!player || player === dead || !player.storage) return;
				var n = (player.storage.csh_total_kills || 0) + 1;
				player.storage.csh_total_kills = n;
				if (typeof player.syncStorage === "function") player.syncStorage("csh_total_kills");
				if (lib.cshVoice && lib.cshVoice.kill) lib.cshVoice.kill(n);
			},
		});

		// 回复：自己单回合累计 >=3 记「医术高超」，助人单回合累计 >=3 记「妙手回春」。
		//
		// 挂 changeHp，不挂 recoverAfter：changeHp 是引擎在每次体力变动末尾
		// 无条件显式触发的时机（content.js 的 changeHp 末尾 `await event.trigger("changeHp")`），
		// 而 recoverAfter 属于「通用 After」那一层，会被 filterStop / `_triggered` 置空
		// 影响而漏触发。这里只在 num > 0（体力确实涨了）时处理，等于「发生了一次回复」。
		define("_csh_effect_recover_announce", {
			trigger: { player: "changeHp" },
			forceDie: true,
			forceOut: true,
			filter: function (event) {
				if (lib.config["extension_池子魔将_csh_effect_announce"] === false) return false;
				return !!(event && typeof event.num === "number" && event.num > 0);
			},
			content: function () {
				if (!lib.cshVoice || !lib.cshVoice.onRecover) return;
				var rec = null;
				try {
					rec = trigger.getParent && trigger.getParent("recover");
				} catch (e) {}
				var src = (rec && rec.source) || null;
				var num = rec && typeof rec.num === "number" ? rec.num : trigger.num;
				lib.cshVoice.onRecover(player, src, num);
			},
		});

		var names = ["_csh_effect_damage_announce", "_csh_effect_kill_announce", "_csh_effect_recover_announce"];
		names.forEach(addGlobal);
		// 装完立刻验一次：技能在不在 lib.skill、进没进全局表、触发钩子挂上没有。
		// 这三样任缺一个，局内都会「播报不响」；结果由 autoInstall 写进日志与导出。
		try {
			var probe = lib.cshVoice.diag();
			names.forEach(function (n) {
				var s = probe.skills[n] || {};
				if (!s.defined || !s.inGlobal || s.hooked === false) {
					warnOnce("播报技能未正确挂载: " + n + " " + JSON.stringify(s));
				}
			});
		} catch (eD) {}

		// 真正的成功判据：三个技能都在全局表里。addGlobalSkill 缺失或表被重置都会在这里现形。
		return names.every(inGlobalTable);
	};

	// ---------- 自安装：不再依赖 content 走到尾 ----------
	// content 有两千多行，中间任何一步抛错，行尾的安装就永远轮不到；而那个错误被引擎
	// 吞进 console，调试导出里一点痕迹都没有 —— 表现就是「语音特效全哑」，还查不出原因。
	// 所以播报改成模块加载即自装，再挂 arenaReady（每局全局表会重置）与两次延时重试兜底。
	// install 幂等（define 有存在性守卫、addGlobalSkill 可重复调用），多装几次无副作用。
	var _installLog = [];
	lib.cshVoice._installLog = _installLog;

	function autoInstall(why) {
		var rec = { why: why, at: Date.now(), ok: false, error: "" };
		try {
			lib.cshVoice.install();
		} catch (e) {
			rec.error = (e && e.stack) || (e && e.message) || String(e);
		}
		try {
			var d = lib.cshVoice.diag();
			rec.ok = d.installed;
			rec.skills = d.skills;
			rec.hookmap = d.hookmap;
			rec.config = d.config;
		} catch (e2) {
			rec.error = rec.error || (e2 && e2.message) || String(e2);
		}
		_installLog.push(rec);
		while (_installLog.length > 12) _installLog.shift();
		try {
			if (rec.ok) {
				// 开关为关时必须显式说出来：技能 filter 会在播报前就拦下，一点日志都不留，
				// 「装好了却一点动静都没有」多半就是这个开关。
				logInfo("播报安装成功（" + why + "）" + (enabled() ? "" : " · 播报总开关当前为关"), rec.skills);
			} else {
				warnOnce("播报安装未生效（" + why + "）" + (rec.error ? " " + rec.error.split("\n")[0] : ""));
			}
		} catch (e3) {}
		return rec.ok;
	}
	lib.cshVoice.autoInstall = autoInstall;

	// content 走到尾才打卡：导出里看不到这条，就说明 content 在中途断了。
	lib.cshVoice.contentReached = false;
	lib.cshVoice.markContent = function () {
		lib.cshVoice.contentReached = true;
		return autoInstall("content");
	};

	// 供 content 转调：闭包安全（方法体不参与技能反编译）
	lib.cshVoice.onRecover = function (target, source, num) {
		var n = Number(num) || 0;
		if (!(n > 0)) return false;
		if (source && source !== target && source.stat && source.stat.length > 0) {
			var st = source.stat[source.stat.length - 1];
			st._csh_rec_other = (st._csh_rec_other || 0) + n;
			if (st._csh_rec_other >= 3 && !st._csh_rec_other_done) {
				st._csh_rec_other_done = true;
				return play("recover_other", { force: true });
			}
			return false;
		}
		if (target && target.stat && target.stat.length > 0) {
			var ps = target.stat[target.stat.length - 1];
			ps._csh_rec_self = (ps._csh_rec_self || 0) + n;
			if (ps._csh_rec_self >= 3 && !ps._csh_rec_self_done) {
				ps._csh_rec_self_done = true;
				return play("recover_self", { force: true });
			}
		}
		return false;
	};

	// 供技能 content 转调（伤害 / 击杀走 lib.cshVoice.damage / kill，语义已足够清晰）
	logInfo("统一播报模块就绪", { entries: Object.keys(TABLE).length });

	// 自安装（模块加载即装，不等 content）：
	//   module   —— 页面上扩展一被 import 就装上，早于任何对局；
	//   arenaReady —— 每局全局技能表会重置，这里是重新挂回的正式时机；
	//   retry×2  —— 兜住 lib.skill / addGlobalSkill 晚于本模块就绪的宿主。
	autoInstall("module");
	try {
		if (lib.arenaReady && typeof lib.arenaReady.push === "function") {
			lib.arenaReady.push(function () { autoInstall("arenaReady"); });
		}
	} catch (eAR) {}
	[2500, 8000].forEach(function (ms) {
		setTimeout(function () { autoInstall("retry" + ms); }, ms);
	});
})();
