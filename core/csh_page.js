/* 池子魔将 · 游戏页共享层（零 import · 双载）
   ============================================================
   为什么需要它（架构原因，2026-09-29）：
     六个游戏页（含生涯大厅）此前**各写一份**「桥传输核心」——
     ack 监听 + 请求序号 + 超时 + 结算幂等守卫，逐字复制了 5 份，
     还有 1 份（神弩手）连桥都没有、直接裸 postMessage。
     而这份「传输核心」正是 P0-0 桥缺陷（应答回显 req 不一致 → 全桥 100% 超时）
     的病灶所在：同一个坑要修 5 遍，漏一份就复发。

   收敛策略（只抽「真正逐字相同」的传输层，不碰各页游戏特有逻辑）：
     · CSHPage.transport(opts)  → { active, call, close, isSettled, claim, confirmClaim, releaseClaim }
       - active      是否运行在 Game Shell 的 iframe 内
       - call(name, payload, cb, timeoutMs)  带请求序号 + 超时 + 异常兜底
       - close()     发 "<key>-close" 关闭壳
       - claim()     会话级幂等守卫（结算只允许发生一次；返回 false = 已在途/已结算）
       - confirmClaim() / releaseClaim()  认领后的收尾：成功置 settled，失败释放以便重试
     · CSHPage.fmt / lsGet / lsSet / rnd / rndMs  通用小工具
     各页的 pull / seats / settle / settleSession / merit / taskAdd / tiers 等
     **仍留在各自页内**，因为它们的载荷形状、座位数、超时、买入兜底都不同——
     强抽只会制造一个更脆弱的「上帝对象」。

   双载方式与 csh_sfx.js / csh_svggen.js 一致（零 import）：
     · 游戏页在 <body> 内联脚本之前加 <script src="../../core/csh_page.js"></script>
     · 也可被宿主 import（纯副作用，幂等）
   ============================================================ */
(function (root) {
	if (!root) return;
	if (root.CSHPage) return;               /* 幂等：重复引入直接返回 */

	function fmt(n) {
		return String(Math.floor(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	}
	function lsGet(k) {
		try { return (typeof localStorage !== "undefined" && localStorage) ? localStorage.getItem(k) : null; }
		catch (e) { return null; }
	}
	function lsSet(k, v) {
		try { if (typeof localStorage !== "undefined" && localStorage) localStorage.setItem(k, v); }
		catch (e) {}
	}
	function rnd(n) { return Math.floor(Math.random() * n); }
	function rndMs(a, b) { return a + Math.random() * (b - a); }

	/* 游戏页皮肤化（2026-09-30 帕累托）：读取宿主 cshTheme 的当前皮肤，把 chrome 变量
	   映射到游戏页 :root，让切皮肤时整页 chrome 随宿主翻面。监听由 transport 的 message
	   通道统一处理（不另起常驻监听器，避免抢占桥的 ack 监听顺序）；初始化注入在 IIFE 末尾调用一次。 */
	function applyGameSkin() {
		try {
			var pt = root.parent && root.parent.lib && root.parent.lib.cshTheme;
			if (!pt || typeof pt.gameChrome !== "function" || typeof pt.currentSkin !== "function") return;
			var css = pt.gameChrome(pt.currentSkin());
			if (!css || !root.document) return;
			var doc = root.document;
			var el = doc.getElementById("csh-game-chrome");
			if (!el) {
				el = doc.createElement("style");
				el.id = "csh-game-chrome";
				(doc.head || doc.documentElement).appendChild(el);
			}
			el.textContent = css;
		} catch (e) {}
	}

	/* 桥传输核心：唯一实现（2026-09-29）。协议：
	   请求 { __csh:name, req:"name#seq", ...payload }
	   应答 { __csh:"name-ack", req, ok, data }
	   客户端按 `req`（真实请求 ID）配对 waiter —— 这正是 P0-0 的修法，
	   现在只有这一份，不会再漂移。 */
	function transport(opts) {
		opts = opts || {};
		var hasParent = false;
		try { hasParent = !!(root.parent && root.parent !== root); } catch (e) { hasParent = false; }
		var seq = {}, waiters = {};
		/* 结算守卫三态：idle → inFlight（已认领、请求在途）→ settled（收到成功应答）。
		   ★ 2026-10-03 修（P0-2）：此前只有一个布尔 settled，claim() 当场置位，
		   **与请求结果无关** —— 壳端 ACK 因临时卡顿/消息丢失而超时后，本地以为
		   "已结算"：doudizhu / uno / blackjack 三页 closePage 里都写着
		   "若对局已结束但尚未结算就补一次"的兜底意图，全被这个布尔挡死，
		   带入已扣、钱永不回账。现在失败只回 idle，允许安全重试 ——
		   壳侧对同一会话的重复结算请求是幂等的（csh_shell 的 GUARD 会回放上次结果），
		   所以重试不会造成重复入账。 */
		var settled = false, inFlight = false;
		var closeSelfHook = null;      /* 壳委托关窗时要跑的本页收尾流程（见下） */

		root.addEventListener("message", function (ev) {
			var d = ev && ev.data;
			if (!d || typeof d !== "object") return;
			/* 宿主皮肤变更广播：重注入 chrome 变量（帕累托皮肤化，2026-09-30）。
			   合并进本通道，不另起常驻监听器，避免抢占桥的 ack 监听顺序。 */
			if (d.__csh === "csh-skin-change") { applyGameSkin(); return; }
			/* 壳「关闭」委托（2026-09-30 用户拍板：离开自动结算，别再二次确认）：
			   壳不再自己弹「离开将损失带入」，而是发本命令，由游戏页跑**自己的**
			   closePage —— 那里面已经写着「未开局全额退回带入 / 途中按手上筹码结算」
			   的幂等收尾，跑完自然会回发 <key>-close，壳再关。
			   未注册钩子的页面（如生涯大厅）直接回发关闭，行为与旧版一致。 */
			if (d.__csh === "shell-close-self") {
				if (typeof closeSelfHook === "function") { try { closeSelfHook(); } catch (e) { try { close(); } catch (e2) {} } }
				else { try { close(); } catch (e3) {} }
				return;
			}
			var cmd = d.__csh;
			if (typeof cmd !== "string" || !/-ack$/.test(cmd)) return;
			var req = d.req;
			if (!req || !waiters[req]) return;
			var w = waiters[req]; delete waiters[req];
			try { w(d.ok, d.data); } catch (e) {}
		}, false);

		function call(name, payload, cb, timeoutMs) {
			if (!hasParent) { if (cb) cb(false, null); return; }
			var req = name + "#" + (seq[name] = (seq[name] || 0) + 1);
			waiters[req] = cb || function () {};
			var msg = { __csh: name, req: req };
			if (payload) for (var k in payload) if (payload.hasOwnProperty(k)) msg[k] = payload[k];
			try { root.parent.postMessage(msg, "*"); }
			catch (e) { delete waiters[req]; if (cb) cb(false, null); }
			setTimeout(function () {
				if (waiters[req]) { delete waiters[req]; if (cb) cb(false, null); }
			}, timeoutMs || (opts.timeout || 1200));
		}

		function close() {
			if (opts.closeName) {
				try { root.parent.postMessage({ __csh: opts.closeName }, "*"); } catch (e) {}
			}
		}

		/* ---------- 结算守卫（三态）与结算通道 ----------
		   认领只代表"在途"，**成功应答之前不置 settled**：超时/异常只回 idle。
		   这样各页 closePage 里"若已结束但尚未结算就补一次"的兜底才真正可达 ——
		   此前布尔一次性烧掉，兜底形同虚设，失败即永久丢账。
		   壳侧对同一会话的重复结算请求是幂等的（csh_shell GUARD 回放上次结果），
		   所以这里的重试不会重复入账。 */
		function claim() { if (settled || inFlight) return false; inFlight = true; return true; }
		function confirmClaim() { inFlight = false; settled = true; }
		function releaseClaim() { inFlight = false; }
		function settleOnce(name, payload, cb, timeoutMs) {
			if (!hasParent || !claim()) { if (cb) cb(false, null); return false; }
			call(name, payload, function (ok, data) {
				if (ok) confirmClaim(); else releaseClaim();
				if (cb) cb(ok, data);
			}, timeoutMs);
			return true;
		}

		return {
			active: hasParent,
			call: call,
			close: close,
			/* 注册「壳委托关窗」的收尾流程：游戏页传自己的 closePage（含幂等结算）。
			   一次注册即可，壳每次关窗只发一条命令，本页跑完回发 close。 */
			onCloseSelf: function (fn) { if (typeof fn === "function") closeSelfHook = fn; return true; },
			isSettled: function () { return settled; },
			claim: claim,
			confirmClaim: confirmClaim,
			releaseClaim: releaseClaim,
			/* 结算专用通道：认领 → 发起 → 按应答确认/释放，一步到位（推荐用法）。
			   返回 false = 未认领成功（未在壳内 / 已在途 / 已结算）。 */
			settle: settleOnce,
		};
	}

	try { applyGameSkin(); } catch (e) {}

	/* ============================================================
	   牌桌拟人：状态口吻 + 说话气泡（2026-10-03 新增）
	   ------------------------------------------------------------
	   为什么：世界给每个 AI 算了一堆"人"的字段（性格 / 心态 / 手感 / 疲劳 /
	   实战经验 / 宿敌 / 恩怨），但牌桌上一个都没露过面 —— 同桌像三个只会算概率的木桩。
	   这里给游戏页一套**共享**的说话层（零依赖、与 transport 同款双载）：

	     · statusOf(seat)  → 一行状态口吻（手感火热 / 心态崩了 / 连轴转 / 老江湖 / 拉着仇）
	     · say(el, seat, scene) → 在锚点上方弹一句话（同一时刻只留一条，4.2 秒自散）
	     · QUIPS        → 台词池：**按性格分声** × 按场景分句。
	       同一个人在不同场景说法不同，不同性格的人面对同一场景说法也不同 ——
	       这是"拟人"的核心，不是随机从一个大池子里抓句子。

	   台词口径：短句、口语、有脾气；不写系统口吻，不解释机制（README §二十六）。
	   数据全部来自 seat()（宿主下发），本层不读世界、不写任何状态。
	   ============================================================ */
	var PERSONA_TONE = { aggro: "aggro", tight: "tight", bluff: "bluff", math: "math", wild: "wild" };
	var QUIPS = {
		greet: {
			aggro: ["坐稳了，我今天手热得很", "钱带够了吗？不够趁早说", "别磨蹭，开局", "这桌我熟，你们小心点"],
			tight: ["我打得慢，多担待", "稳着来，能赢就行", "先说好，我不乱跟", "牌不好我就走，别嫌我怂"],
			bluff: ["今天我可是带着好牌来的", "别看我脸，看牌", "猜猜我手里是什么", "信不信随你"],
			math: ["打两把看看路数，我记性不错", "牌是牌，人是人，慢慢来", "开局吧，我不误事", "你们的下注习惯，我大概摸清了"],
			wild: ["哈哈来了来了，先热热手", "这场面我喜欢，够热闹", "输了不哭，赢了不笑，来", "管他呢，打了再说"],
		},
		win: {
			aggro: ["早说了，跟我打要出血", "就这？", "收了，下一个", "别急，这才刚开始"],
			tight: ["运气好，运气好", "这把该赢", "按计划走的", "稳一点总是对的"],
			bluff: ["看见没，我说有大牌吧", "哎，可惜你们不信我", "骗到了骗到了", "这波演技还行"],
			math: ["概率站我这边", "意料之中", "该来的总会来", "这手牌值这个价"],
			wild: ["哈哈痛快！", "来啊，继续", "这波赚了！", "手感来了挡不住"],
		},
		lose: {
			aggro: ["行，你厉害，记着", "别得意，还没完", "这把不算，再来", "下一把我加回来"],
			tight: ["不该跟的", "算了，下一手", "这把亏得冤", "稳一点，别上头"],
			bluff: ["哎呀被你看穿了", "我那是吓唬你的，你还真跟", "下把来真的", "演技退步了"],
			math: ["小概率事件", "这把在我预期之外", "重新算一下", "数据不够，多打几把"],
			wild: ["嚯！这么狠？", "钱没了手还在", "再来！不信邪", "输就输了，痛快"],
		},
		allin: {
			aggro: ["豪赌桌好啊 —— 我带的比你想的多", "敢坐这儿，就别喊疼", "这桌才有意思"],
			tight: ["这儿我从不乱来，你看清楚再下", "大钱面前，我比谁都稳", "别吓唬我，我只看牌"],
			bluff: ["我带的钱？够你把裤子留下", "这桌的规矩：信我你就输", "面不改色，我最会"],
			math: ["这桌子算下来，我赢面大", "带入翻几倍，风险也是", "别凭感觉下注，不值"],
			wild: ["嚯！这场面我喜欢！", "梭他！", "大钱才有大乐子"],
		},
		/* 恩怨场景（seat.grudge ≥ 5 才会用到）：记着玩家干过的事，但不说教 */
		grudge: {
			aggro: ["哟，是你啊 —— 上次那一下我还记着", "今天你要是输了，别怪我不客气"],
			tight: ["你上次砸我那下，我记着呢", "我不记仇，但我记账"],
			bluff: ["你还敢坐过来？", "上次那笔，我等着呢"],
			math: ["账上还有你一笔没清", "见面三分情，可惜你不在这三分里"],
			wild: ["你！好家伙，还真敢来", "来来来，今天算总账"],
		},
	};
	/* 状态口吻：从世界下发的字段里挑一句人话。没有可说的时候返回 ""。 */
	function statusOf(seat) {
		try {
			if (!seat) return "";
			var bits = [];
			var md = seat.mood;
			if (typeof md === "number") {
				if (md >= 0.45) bits.push("手感火热");
				else if (md <= -0.45) bits.push("心态崩了");
			}
			if (typeof seat.fatigue === "number" && seat.fatigue >= 0.6) bits.push("连轴转，累了");
			if (typeof seat.skillPlay === "number" && seat.skillPlay >= 40) bits.push("老江湖");
			if (typeof seat.grudge === "number" && seat.grudge >= 5) bits.push("账还记着你");
			else if (seat.rival) bits.push("老对手是" + seat.rival);
			return bits.slice(0, 2).join(" · ");
		} catch (e) { return ""; }
	}
	function pickLine(seat, scene) {
		try {
			var tone = PERSONA_TONE[seat && seat.persona] || "math";
			var bank = (QUIPS[scene] || QUIPS.greet);
			var pool = bank[tone] || bank.math || bank.tight;
			if (seat && scene === "greet" && typeof seat.grudge === "number" && seat.grudge >= 5) {
				pool = (QUIPS.grudge[tone] || QUIPS.grudge.math).concat(pool);
			}
			return pool[rnd(pool.length)];
		} catch (e) { return ""; }
	}
	var QUIP_CSS_ID = "csh-quip-css";
	function ensureQuipCss() {
		try {
			var doc = root.document;
			if (!doc || doc.getElementById(QUIP_CSS_ID)) return;
			var st = doc.createElement("style");
			st.id = QUIP_CSS_ID;
			st.textContent =
				".csh-quip{position:fixed;z-index:2147482000;max-width:16em;padding:7px 10px;border-radius:10px;" +
				"background:rgba(22,18,13,.95);border:1px solid rgba(201,168,106,.45);color:#f0e6cf;" +
				"font-size:13px;line-height:1.45;pointer-events:none;transform:translateY(-100%);" +
				"box-shadow:0 6px 18px rgba(0,0,0,.45);animation:cshQuipIn .18s ease-out;}" +
			".csh-quip::after{content:'';position:absolute;left:18px;bottom:-6px;width:10px;height:10px;" +
			"background:inherit;border-right:1px solid rgba(201,168,106,.45);border-bottom:1px solid rgba(201,168,106,.45);" +
			"transform:rotate(45deg);}" +
			/* 【2026-10-03】座位上方放不下时翻到座位下方，尾巴同步翻到上边 */
			".csh-quip.below::after{left:18px;bottom:auto;top:-6px;transform:rotate(225deg);}" +
			"@keyframes cshQuipIn{from{opacity:0;}to{opacity:1;}}";
			(doc.head || doc.documentElement).appendChild(st);
		} catch (e) {}
	}
	/* 在锚点上方说一句话。text 省略时按 seat 的性格+场景取一句。
	   同一时刻只留一条气泡；4.2 秒自散；锚点取不到就不说话（静默降级）。 */
	function say(anchor, seat, scene, text) {
		try {
			var doc = root.document;
			if (!doc || !seat || !anchor) return "";
			var line = text || pickLine(seat, scene);
			if (!line) return "";
			var prev = doc.querySelectorAll(".csh-quip");
			for (var i = 0; i < prev.length; i++) { try { prev[i].parentNode.removeChild(prev[i]); } catch (eR) {} }
			ensureQuipCss();
			var r = null;
			try { r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null; } catch (eG) {}
			if (!r || (!r.width && !r.height)) return "";
			var b = doc.createElement("div");
			b.className = "csh-quip";
			b.textContent = line;
			doc.body.appendChild(b);
			var bw = b.offsetWidth || 140, bh = b.offsetHeight || 34;
			var vw = root.innerWidth || 360;
			var vh = root.innerHeight || 640;
			var x = Math.max(8, Math.min(vw - 8 - bw, Math.round(r.left + r.width / 2 - bw * 0.35)));
			/* 【2026-10-03 用户实机质问「你确定没有气泡被遮蔽风险吗」】
			   此前只留屏幕顶 8px 的边距 —— 但游戏页顶部还有一行菜单/状态条
			   （.csh-topbar：街道 / 盲注 / 筹码），上家座位的气泡"翻上去"时
			   正好压在它身上。现在安全线取**该条的底边 + 6px**（找不到才退回 44px 估值），
			   气泡要么完整落在它下面，要么翻到座位下方 —— 永不与菜单同层。 */
			var safeTop = 44;
			try {
				var bar = doc.querySelector(".csh-topbar");
				if (bar && bar.getBoundingClientRect) {
					safeTop = Math.max(8, Math.round(bar.getBoundingClientRect().bottom) + 6);
				}
			} catch (eBar) {}
			var above = (r.top - 6 - bh) >= safeTop;
			var y = above ? Math.round(r.top - 6) : Math.round(Math.min(vh - 8, r.bottom + 6 + bh));
			if (!above) b.className = "csh-quip below";
			b.style.left = x + "px";
			b.style.top = y + "px";
			setTimeout(function () { try { if (b.parentNode) b.parentNode.removeChild(b); } catch (e2) {} }, 4200);
			return line;
		} catch (e) { return ""; }
	}
	/* 按名字找座位元素当锚点：各页座位卡的类名不一（.seat / .opp / .seat-box），
	   但都会把名字渲染在卡上 —— 找到含这个名字的最小卡片即可（找不到就不说）。 */
	function seatAnchor(name) {
		try {
			if (!name) return null;
			var els = root.document.querySelectorAll(".seat, .opp, .seat-box");
			for (var i = 0; i < els.length; i++) {
				var t = els[i].textContent || "";
				if (t.indexOf(name) >= 0) return els[i];
			}
		} catch (e) {}
		return null;
	}
	/* 说话节流：整页 6 秒内最多一条（避免一局里人人抢话） */
	var lastSayAt = 0;
	function sayThrottled(anchor, seat, scene, text) {
		var now = Date.now();
		if (now - lastSayAt < 6000) return "";
		lastSayAt = now;
		return say(anchor, seat, scene, text);
	}

root.CSHPage = {
		fmt: fmt, lsGet: lsGet, lsSet: lsSet, rnd: rnd, rndMs: rndMs, transport: transport,
		statusOf: statusOf, say: say, sayThrottled: sayThrottled, QUIPS: QUIPS, seatAnchor: seatAnchor,
	};
})(typeof window !== "undefined" ? window : this);
