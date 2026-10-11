/**
 * decadeUI-compat.js — 池子魔将 × 十周年UI 接入兼容模块
 *
 * 作用：让"池子魔将"在不合并任何十周年UI代码的前提下，自动检测玩家是否
 *       安装并启用了"十周年UI"扩展，并调用其官方对外 API 完成接入：
 *         1. 卡牌皮肤注册      —— window.registerDecadeCardSkin（官方自带排队机制）
 *         2. 武将前缀角标注册  —— window.decadeModule.prefixMark.registerPrefixes
 *         3. 动态皮肤注册      —— decadeUI.dynamicSkin[武将key][皮肤名]，资源可留在本扩展
 *                                   image/dynamic/ 下（相对路径逃逸），不依赖千幻聆音
 *       未安装十周年UI时一切静默跳过，对游戏零影响。
 *
 * 兼容：单机、联机均可使用。注册发生在扩展 precontent 阶段（联机同样执行），
 *       且接入内容均为纯客户端视觉表现，服务器与房主无需安装十周年UI。
 *
 * 用法（三步，详见同目录《接入说明.md》）：
 *   1. 将本文件放入池子魔将扩展根目录；
 *   2. 在池子魔将 extension.js 顶部执行 import "./decadeUI-compat.js";
 *      （旧式非模块写法的扩展，改用 lib.init.js 加载本文件，见说明文档）
 *   3. 在 precontent 中调用：
 *        window.setupDecadeUICompat({
 *            extensionName: "池子魔将",                    // 必须与扩展文件夹名完全一致
 *            cardSkins: [{ skinKey: "decade", cardNames: ["卡牌id1", "卡牌id2"] }],
 *            prefixMarks: { "魔": "mojiang" },             // 前缀 → 角标样式名
 *            markStyles: { mojiang: "mark_mojiang.png" },  // 可选：自定义角标图片
 *            debug: true,                                  // 调试期打开，控制台查看接入日志
 *        });
 *
 * 依据十周年UI官方对外 API 文档编写（v1.3.1 起提供，v1.5.0 验证），文档位于
 * 十周年UI扩展目录 docs/ 下：card-skin-api.md、prefix-mark-api.md。
 */
(function () {
	"use strict";

	const DECUI_NAME = "十周年UI";
	const LOG_TAG = "[池子魔将×十周年UI]";

	/** 十周年UI是否已安装并启用 */
	function isInstalled() {
		return window.decadeUIName === DECUI_NAME || !!window.decadeUI;
	}

	/** 读取十周年UI版本信息（调试用） */
	function getInfo() {
		if (!isInstalled()) return { installed: false };
		let version = "未知";
		try {
			version = (window.lib && lib.extensionPack && lib.extensionPack[DECUI_NAME])?.version || version;
		} catch (e) { /* ignore */ }
		return { installed: true, version, path: window.decadeUIPath || "" };
	}

	function log() {
		if (!setup._debug) return;
		const args = [LOG_TAG].concat([].slice.call(arguments));
		console.log.apply(console, args);
	}

	/**
	 * 等待 getter 返回真值后执行 onReady；调用当下已就绪则同步执行，
	 * 超时后静默放弃（仅在 debug 下提示），保证未装十周年UI时零副作用。
	 */
	function whenReady(getter, onReady, timeout, interval) {
		let ready = null;
		try { ready = getter(); } catch (e) { ready = null; }
		if (ready) {
			onReady(ready);
			return;
		}

		const started = Date.now();
		timeout = timeout || 20000;
		interval = interval || 250;
		const timer = setInterval(function () {
			let value = null;
			try { value = getter(); } catch (e) { value = null; }
			if (value) {
				clearInterval(timer);
				onReady(value);
			} else if (Date.now() - started > timeout) {
				clearInterval(timer);
				log("等待十周年UI初始化超时（20秒），本次接入已跳过");
			}
		}, interval);
	}

	/**
	 * 注入自定义角标样式。
	 * 十周年UI通过 `.player > .{样式名}-mark` 类名渲染角标，样式需在其自身样式
	 * 加载完成后注入，以覆盖内置规则（与官方文档示例保持一致的定位参数）。
	 */
	function injectMarkStyles(extensionName, markStyles) {
		const rules = [];
		for (const styleName in markStyles) {
			const image = String(markStyles[styleName] || "");
			if (!image) continue;
			// 值里含 "/" 视为完整相对路径，否则视为放在扩展 image/ 目录下的文件名
			const url = image.indexOf("/") >= 0 ? image : `extension/${extensionName}/image/${image}`;
			rules.push(
				`.player > .${styleName}-mark{` +
					"position:absolute;top:100px;left:-11px;width:22px;height:34px;" +
					"background-size:100% 100%;pointer-events:none;z-index:87;" +
					`background-image:url("${url}");}`
			);
		}
		if (!rules.length) return;
		const style = document.createElement("style");
		style.setAttribute("data-from", "decadeUI-compat");
		style.textContent = rules.join("\n");
		document.head.appendChild(style);
		log("已注入自定义角标样式：", Object.keys(markStyles).join(", "));
	}

	/** 接入卡牌皮肤：官方函数自带排队；若连排队函数都未出现，先存本地队列再转发 */
	function setupCardSkins(extensionName, cardSkins) {
		const pending = [];
		const send = function (payload, fn) {
			try {
				fn(payload);
				return true;
			} catch (e) {
				log("卡牌皮肤注册失败：", e);
				return false;
			}
		};

		cardSkins.forEach(function (cfg) {
			const payload = Object.assign({ extensionName }, cfg || {});
			if (typeof window.registerDecadeCardSkin === "function") {
				send(payload, window.registerDecadeCardSkin);
			} else {
				pending.push(payload);
			}
		});

		if (pending.length) {
			log(`registerDecadeCardSkin 尚未就绪，${pending.length} 条注册转入本地排队`);
			whenReady(
				() => (typeof window.registerDecadeCardSkin === "function" ? window.registerDecadeCardSkin : null),
				fn => {
					log("registerDecadeCardSkin 已就绪，转发排队的注册请求");
					pending.forEach(p => send(p, fn));
				}
			);
		} else {
			log(`已提交 ${cardSkins.length} 组卡牌皮肤注册`);
		}
	}

	/** 接入前缀角标：等待 window.decadeModule（十周年UI precontent 中创建）就绪 */
	function setupPrefixMarks(extensionName, prefixMarks, markStyles) {
		const hasPrefix = Object.keys(prefixMarks || {}).length > 0;
		const hasStyle = !!(markStyles && Object.keys(markStyles).length);
		if (!hasPrefix && !hasStyle) return;

		whenReady(
			() => (window.decadeModule && window.decadeModule.prefixMark) || null,
			prefixMark => {
				if (hasPrefix) {
					try {
						const ok = prefixMark.registerPrefixes(prefixMarks);
						log("前缀角标注册完成：", Array.isArray(ok) ? ok.join(", ") : Object.keys(prefixMarks).join(", "));
					} catch (e) {
						log("前缀角标注册失败：", e);
					}
				}
				if (hasStyle) injectMarkStyles(extensionName, markStyles);
			}
		);
	}

	/**
	 * 接入主入口。建议在扩展的 precontent 中调用（最早且单机联机都执行），
	 * 在 content 中调用同样有效。
	 *
	 * @param {Object} options
	 * @param {string} options.extensionName 扩展文件夹名（皮肤图片路径依赖它，必填）
	 * @param {Array<{skinKey?:string, cardNames?:string[], extension?:string}>} [options.cardSkins]
	 *        每项对应一次官方注册调用；cardNames 省略时十周年UI会自动扫描
	 *        extension/<extensionName>/image/card-skins/<skinKey>/ 目录（仅建议调试用）
	 * @param {Object<string,string>} [options.prefixMarks] 前缀 → 角标样式名
	 *        样式名可用十周年UI内置：jie/shen/sp/ol/tw/sb/dc/mb/lao/pot/wu/clan，
	 *        或自定义样式名（配合 options.markStyles 提供图片）
	 * @param {Object<string,string>} [options.markStyles] 样式名 → 角标图片
	 *        值为图片文件名（默认取 extension/<extensionName>/image/ 下）或含 "/" 的路径
	 * @param {boolean} [options.debug] 控制台输出接入日志
	 */
	/**
	 * 接入动态皮肤（Spine 骨骼立绘 + 攻击/技能动作）。
	 * 资源仍放在本扩展 image/dynamic/<dir>/ 下；描述符的 name 用相对路径
	 *   "../../../<extensionName>/image/dynamic/<dir>/<main>"
	 * 从十周年UI的 assets/dynamic/ 逃逸回本扩展目录，播放器即可加载——
	 * 无需把资源搬进十周年UI，也不依赖千幻聆音（千幻只是增强层）。
	 *
	 * 描述符写法（dir/main 为本扩展 image/dynamic 下的子目录与骨骼名，不含扩展名）：
	 *   dynamicSkins: {
	 *     "csh_ae": {                                   // lib 武将 key
	 *       "默认": { dir:"305_1", main:"XingXiang",      // 主立绘骨骼
	 *                 action:"DaiJi", scale:0.95, y:[0,0.45],
	 *                 gongji:{action:"GongJi"},          // 攻击动作（复用主骨骼）
	 *                 teshu:{action:"TeShu"} }           // 技能动作（复用主骨骼）
	 *     }
	 *   }
	 * gongji/teshu/chuchang/beijing 可只写 {action}（复用主立绘骨骼），
	 * 也可写 {dir,main,action}（独立骨骼）。x/y/scale 需按角色在游戏内目测微调。
	 *
	 * @param {string} extensionName 扩展文件夹名
	 * @param {Object} dynamicSkins 见上
	 */
	function setupDynamicSkins(extensionName, dynamicSkins) {
		if (!dynamicSkins || !Object.keys(dynamicSkins).length) return;
		const prefix = `../../../${extensionName}/image/dynamic/`;

		function buildName(ref) {
			if (typeof ref === "string") return prefix + ref;
			if (ref && ref.dir && ref.main) return prefix + ref.dir + "/" + ref.main;
			return null;
		}
		function process(cfg) {
			const out = Object.assign({}, cfg);
			if (!out.name && out.dir && out.main) out.name = buildName(out);
			["gongji", "teshu", "chuchang", "beijing"].forEach(function (k) {
				const sub = out[k];
				if (sub && typeof sub === "object") {
					// 注意：这里不能覆盖 sub.main —— 背景骨骼名（BeiJing）与主骨骼不同名，
					// 所以 sub 必须自带 dir（生成数据里已写全 dir/main）。
					if (!sub.dir && !sub.name) { sub.dir = out.dir; sub.main = out.main; }
					sub.name = buildName(sub);
				}
			});
			// 第二形态：千幻变身态会 eval(transform[k]) 取整个配置对象，
			// 所以 transform 里的每一项同样要补好逃逸 name，否则换形态后资源找不到。
			if (out.transform && typeof out.transform === "object") {
				const t = {};
				for (const tk in out.transform) t[tk] = process(out.transform[tk]);
				out.transform = t;
			}
			return out;
		}

		// 等十周年UI 把 decadeUI.dynamicSkin 真正填充好（首启/加载顺序不可控时靠轮询兜底），
		// 并要求其非空，规避千幻聆音首启时短暂置空 registry 的竞态。
		whenReady(
			function () {
				const d = window.decadeUI && window.decadeUI.dynamicSkin;
				return (d && Object.keys(d).length) ? d : null;
			},
			function (dsReg) {
				let count = 0;
				for (const libKey in dynamicSkins) {
					const skins = dynamicSkins[libKey];
					if (!dsReg[libKey]) dsReg[libKey] = {};
					for (const skinName in skins) {
						dsReg[libKey][skinName] = process(skins[skinName]);
						count++;
					}
				}
				log(`已注册 ${count} 套动态皮肤到 decadeUI.dynamicSkin（资源前缀 ${prefix}）`);
			}
		);
	}

	function setup(options) {
		options = options || {};
		setup._debug = !!options.debug;

		const extensionName = options.extensionName || "池子魔将";
		if (window.__decadeUICompatDone === extensionName) return;
		window.__decadeUICompatDone = extensionName;

		const cardSkins = options.cardSkins || [];
		const prefixMarks = options.prefixMarks || {};
		const markStyles = options.markStyles || null;
		const dynamicSkins = options.dynamicSkins || null;

		const hasAny =
			cardSkins.length > 0 ||
			Object.keys(prefixMarks).length > 0 ||
			!!(markStyles && Object.keys(markStyles).length) ||
			!!(dynamicSkins && Object.keys(dynamicSkins).length);
		if (!hasAny) {
			log("未配置任何接入项（cardSkins/prefixMarks/markStyles 均为空），跳过");
			return;
		}

		if (isInstalled()) {
			log("已检测到十周年UI：", JSON.stringify(getInfo()));
		} else {
			// 不直接放弃：扩展加载顺序不可控，玩家也可能稍后才启用十周年UI；
			// 交给 whenReady 排队等待，始终未出现则超时静默放弃。
			log("尚未检测到十周年UI，注册请求转入排队（超时自动放弃，不影响游戏）");
		}

		if (cardSkins.length) setupCardSkins(extensionName, cardSkins);
		setupPrefixMarks(extensionName, prefixMarks, markStyles);
		if (dynamicSkins) setupDynamicSkins(extensionName, dynamicSkins);
	}

	setup._debug = false;
	setup.getInfo = getInfo;

	// 挂载到全局：无论池子魔将是 ESM 写法还是旧式写法，都可以直接调用
	window.setupDecadeUICompat = setup;
})();
