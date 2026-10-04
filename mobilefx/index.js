import { lib } from "../../../noname.js";
// 池子魔将 · 手游播报特效资源（ESM 入口）
//
// 为什么走 ESM 导入、不再注入 <script>：
//   扩展自身的导入链（extension.js → csh_voice.js / csh_debug.js …）在游戏里是确定可用的
//   —— 调试面板、悬浮球能出来就说明这条链通。而 <script> 注入要额外碰运气押三件事：
//   路径变异命中、onload 真的代表内容正确、宿主不拦脚本。任何一件不成立，
//   表现都只是「只有语音、没有画面」，且全程静默，查不出原因。
//   这里让清单与播放器共用已被验证的那条加载通道，把不确定性从链路上摘掉。
//
// manifest.js 与 cshMobileFx.js 保持原样（仍是经典脚本，探针页与预览工具照旧能用），
// 作为 ES 模块导入时它们会各自执行一次，把数据挂到 window.cshMobileFxData / window.cshMobileFx。
import "./manifest.js";
import "./cshMobileFx.js";

var REL = "extension/池子魔将/mobilefx/";

var mfxData = (typeof window !== "undefined" && window.cshMobileFxData) || null;
var mfxPlayer = (typeof window !== "undefined" && window.cshMobileFx) || null;

// 贴图根按引擎自己的规则拼：game.playAudio 把 "ext:XXX" 换成 "extension/XXX"，
// 再统一加 lib.assetURL 前缀（见 noname/game/index.js:2276-2282）。
// 贴图沿用同一条规则，不另创一套路径约定。
function baseList() {
	var a = (typeof lib !== "undefined" && typeof lib.assetURL === "string") ? lib.assetURL : "";
	var out = [];
	if (a) out.push(a + REL);
	out.push(REL);
	if (a && a.charAt(a.length - 1) !== "/") out.push(a + "/" + REL);
	return out.filter(function (v, i) { return v && out.indexOf(v) === i; });
}

// 用一张真实贴图探路，选第一个取得到的根。
// 引擎规则那个根先当成默认值用上，探路结果不同才改 —— 避免等探路期间播不出特效。
function pickBase(cb) {
	var list = baseList(), i = 0;
	var probe = "diankuang/dingguang.png";
	var next = function () {
		if (i >= list.length) return cb(list[0]);
		var base = list[i++];
		var img = new Image();
		img.onload = function () { cb(base); };
		img.onerror = function () { next(); };
		img.src = base + probe;
	};
	next();
}

function applyBase(base) {
	if (!mfxPlayer || !base || mfxPlayer._base === base) return;
	mfxPlayer._base = base;
	// 换根前把贴图缓存清干净：旧根下取到的（或取不到留下的）条目会挡住新根的重试
	mfxPlayer._tex = {};
	mfxPlayer._texOk = {};
	mfxPlayer._loading = {};
}

function setup() {
	if (!mfxPlayer || !mfxData) return false;
	mfxPlayer.configure(baseList()[0], mfxData);
	pickBase(applyBase);
	return true;
}

if (setup()) {
	try {
		if (!lib.cshMobileFx) lib.cshMobileFx = mfxPlayer;
		if (!lib.cshMobileFxData) lib.cshMobileFxData = mfxData;
	} catch (eAttach) {}
	// assetURL 在个别宿主下晚于扩展加载才就位，局内再校一次根
	try {
		if (lib.arenaReady && typeof lib.arenaReady.push === "function") {
			lib.arenaReady.push(function () { setup(); });
		}
	} catch (eReady) {}
	setTimeout(setup, 1200);
} else {
	try {
		console.error("[池子魔将] 手游播报特效资源未就绪："
			+ "manifest=" + !!mfxData + " / 播放器=" + !!mfxPlayer);
	} catch (eLog) {}
}

export { mfxData, mfxPlayer };
export default mfxPlayer;
