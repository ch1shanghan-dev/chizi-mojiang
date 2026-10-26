/* Normal host matches only. Zero-import factory; persistence belongs to the wallet. */
(function (root) {
	"use strict";
	var DEFAULTS = { identity: {win:80,lose:20}, versus: {win:60,lose:15}, doudizhu: {win:80,lose:20}, guozhan: {win:100,lose:25}, boss: {win:50,lose:15} };
	function amount(v) { return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1000; }
	function install(host) {
		if (!host || !host.lib || !host.game) return false;
		var lib = host.lib, game = host.game, status = host.status || {}, get = host.get || {};
		if (lib.cshMatchReward) return lib.cshMatchReward;
		var run = null, pending = [], disposed = false, panel = null, generation = 0, started = new WeakSet();
		function wallet() { return lib.cshWallet && lib.cshWallet.wallet; }
		function toast(s) { try { if (lib.cshUI) lib.cshUI.toast(s, {merge:false}); } catch (e) {} }
		function invalidate() { generation++; run = null; pending.length = 0; closePanel(); }
		function endSession() { disposed = true; invalidate(); }
		function allowed() {
			try {
				var W = lib.cshWallet, M = lib.cshMigrate || root.CSH && root.CSH.migrate;
				var recovery = M && typeof M.recoveryState === "function" && M.recoveryState();
				if (status.cshAssistedMatch || disposed || status.reloading || status.video || status.connectMode || status.importingExtension || game.online || game.observe || lib.config && lib.config.connectMode || W && W.saveGuard && W.saveGuard.blocked() || recovery && (recovery.busy || recovery.pending) || root.localStorage && root.localStorage.getItem("csh_migrate_recovery") !== null) { if (run) invalidate(); return false; }
				return true;
			} catch (e) { if (run) invalidate(); return false; }
		}
		function mode() { return String(typeof get.mode === "function" ? get.mode() : lib.config && lib.config.mode || ""); }
		function rates(m) {
			var fallback = DEFAULTS[m] || {win:60,lose:15}, config = wallet() && wallet().matchRewardConfig();
			var saved = config && Object.prototype.hasOwnProperty.call(config,m) && config[m];
			return { win: saved && amount(saved.win) ? saved.win : fallback.win, lose: saved && amount(saved.lose) ? saved.lose : fallback.lose };
		}
		function modes() {
			return Object.keys(Object.assign({}, DEFAULTS, lib.mode || {})).filter(function (m) { return m !== "connect"; });
		}
		function label(m) { return String(lib.translate && (lib.translate[m] || lib.translate[m+"_mode"]) || m); }
		function newId() {
			var bytes = new Uint32Array(4);
			if (!root.crypto || typeof root.crypto.getRandomValues !== "function") return null;
			root.crypto.getRandomValues(bytes);
			return "match-" + Date.now().toString(36) + "-" + Array.prototype.map.call(bytes,function(n){return n.toString(36);}).join("-");
		}
		function tap(name, ev) {
			if (!allowed()) return;
			if (name === "gameStart") {
				if (!ev || typeof ev !== "object" || started.has(ev)) return;
				started.add(ev);
				if (run || status.over || !game.me || !mode() || mode() === "connect") return;
				var id = newId(); if (!id) return;
				run = {id:id, mode:mode(), active:false, ended:false}; return;
			}
			if (!run || run.ended || status.over || mode() !== run.mode) return;
			if (ev && ev.player && (game.players || []).concat(game.dead || []).indexOf(ev.player) >= 0) run.active = true;
		}
		async function pay(item) {
			if (item.busy || !allowed() || pending.indexOf(item) < 0) return {ok:false,reason:"当前无法补领"};
			item.busy = true;
			try {
				var W = wallet(); if (!W || typeof W.settleMatch !== "function") throw Error("钱包尚未就绪");
				var result = await W.settleMatch(item.id,item.mode,item.win,item.amount);
				if (item.generation !== generation) return {ok:false,reason:"原对局会话已结束"};
				if (!result || result.ok !== true) { toast("对局奖励待补领：" + (result && result.reason || "保存失败")); return result || {ok:false}; }
				var at = pending.indexOf(item); if (at >= 0) pending.splice(at,1);
				if (!result.already) toast(label(item.mode) + (item.win ? "胜利" : "落败") + "，获得 " + result.gained + " CBY");
				return result;
			} catch (e) { if (item.generation === generation) toast("对局奖励待补领：" + (e.message || "保存失败")); return {ok:false,reason:e.message}; }
			finally { item.busy = false; }
		}
		function capture(result) {
			if (!allowed() || !run || run.ended) return;
			run.ended = true;
			if (status.over || typeof result !== "boolean" || !run.active || mode() !== run.mode || !game.me) return;
			var value = rates(run.mode)[result ? "win" : "lose"];
			if (!value) return;
			var item = {id:run.id,mode:run.mode,win:result,amount:value,busy:false,generation:generation};
			pending.push(item); void pay(item);
		}
		async function retryPending() { var list = pending.slice(); for (var i=0;i<list.length;i++) await pay(list[i]); return {pending:pending.length}; }
		function closePanel() { if (panel) panel.close(); }
		function openPanel() {
			closePanel();
			if (host.ensureUI) host.ensureUI();
			if (!allowed()) { toast("当前无法设置对局奖励，请先完成存档操作或返回单机模式"); return false; }
			var doc = root.document, previous = doc.activeElement, overlay = doc.createElement("div"), box = doc.createElement("form"), style = doc.createElement("style");
			overlay.id = "csh-match-reward"; box.setAttribute("role","dialog"); box.setAttribute("aria-modal","true"); box.setAttribute("aria-labelledby","csh-match-title");
			style.textContent = '#csh-match-reward{position:fixed!important;inset:0!important;display:flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;padding:8px!important;z-index:var(--csh-z-modal,2147483040)!important;background:#0009!important;color:var(--csh-fg,#eee)!important;font:14px/1.5 system-ui!important}#csh-match-reward *{box-sizing:border-box!important}#csh-match-reward form{position:relative!important;display:flex!important;flex-direction:column!important;width:min(100%,480px)!important;max-height:100%!important;margin:0!important;padding:16px!important;background:var(--csh-bg,#17201f)!important;border:1px solid var(--csh-gold,#b69a60)!important;border-radius:12px!important;min-height:0!important}#csh-match-reward div,#csh-match-reward p,#csh-match-reward h2,#csh-match-reward label,#csh-match-reward span{position:static!important;display:block!important;margin:0!important}#csh-match-reward h2{font-size:var(--csh-lfs-xl,18px)!important}#csh-match-reward .rows{overflow:auto!important;min-height:0!important;margin:10px 0!important}#csh-match-reward .row{display:grid!important;grid-template-columns:minmax(0,1fr) 76px 76px!important;gap:8px!important;align-items:center!important;margin:4px 0!important}#csh-match-reward .row span{overflow-wrap:anywhere!important}#csh-match-reward input{position:static!important;width:100%!important;min-width:0!important;min-height:44px!important;padding:7px!important;font:inherit!important;color:inherit!important;background:var(--csh-bg-deep,#111)!important;border:1px solid #777!important;border-radius:5px!important}#csh-match-reward button{position:static!important;min-height:44px!important;padding:8px 14px!important;font:inherit!important;color:inherit!important;background:var(--csh-bg-soft,#303b38)!important;border:1px solid #888!important;border-radius:6px!important;cursor:pointer!important}#csh-match-reward .actions{display:flex!important;flex-wrap:wrap!important;gap:8px!important;justify-content:flex-end!important}#csh-match-reward :focus-visible{outline:2px solid var(--csh-gold,#e5c77c)!important;outline-offset:2px!important}#csh-match-reward .message{min-height:21px!important;overflow-wrap:anywhere!important;color:#efd89d!important}';
			overlay.appendChild(style); overlay.appendChild(box);
			function el(tag,text,parent,cls) { var n=doc.createElement(tag); n.textContent=text||""; if(cls)n.className=cls; (parent||box).appendChild(n); return n; }
			el("h2","对局 CBY 奖励").id="csh-match-title";
			el("p","单机正常结算后发放；每项 0–1000，填 0 关闭。BOSS 特殊奖励另计。");
			var rows = el("div","",box,"rows"), head = el("div","",rows,"row"); ["模式","胜利","失败"].forEach(function(t){el("span",t,head);});
			var inputs = [], allModes = modes(), original;
			try { original = wallet().matchRewardConfig(); allModes = allModes.concat(Object.keys(original || {})).filter(function(m,i,a){return a.indexOf(m)===i;});
				allModes.forEach(function(m){var row=el("div","",rows,"row"),rate=rates(m);el("span",label(m),row);["win","lose"].forEach(function(kind){var input=el("input","",row);input.type="number";input.min="0";input.max="1000";input.step="1";input.required=true;input.value=String(rate[kind]);input.setAttribute("aria-label",label(m)+(kind==="win"?"胜利":"失败")+"奖励");inputs.push({mode:m,kind:kind,node:input});});});
			} catch(e) { toast("奖励设置读取失败，请稍后重试"); return false; }
			var message=el("p","",box,"message"); message.setAttribute("role","status");
			var actions=el("div","",box,"actions"), retry=el("button","补领本次奖励",actions), back=el("button","返回",actions), save=el("button","保存",actions);
			retry.type=back.type="button"; save.type="submit"; retry.hidden=!pending.length;
			var closed=false, saving=false;
			function close(){if(closed)return;closed=true;doc.removeEventListener("keydown",key,true);overlay.remove();if(panel&&panel.overlay===overlay)panel=null;try{if(previous&&previous.isConnected)previous.focus();}catch(e){}}
			function key(e){if(closed || doc.getElementById("csh-ui-confirm"))return;if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();close();return;}if(e.key!=="Tab")return;var nodes=Array.prototype.filter.call(box.querySelectorAll("input,button"),function(n){return !n.disabled&&!n.hidden;});if(!nodes.length)return;var first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&doc.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&doc.activeElement===last){e.preventDefault();first.focus();}}
			back.onclick=close; retry.onclick=async function(){retry.disabled=true;await retryPending();if(!closed){retry.disabled=false;retry.hidden=!pending.length;message.textContent=pending.length?"仍有奖励待补领，请稍后重试":"本次奖励已处理";}};
			box.onsubmit=async function(e){e.preventDefault();if(saving)return;if(!allowed()){message.textContent="当前无法保存，请先完成存档操作";return;}var map=Object.create(null),bad=null;inputs.forEach(function(item){var raw=item.node.value.trim(),n=Number(raw);if(!/^\d+$/.test(raw)||!amount(n)){bad=bad||item.node;return;}if(!map[item.mode])map[item.mode]={};map[item.mode][item.kind]=n;});if(bad){message.textContent="请输入 0–1000 的整数";bad.focus();return;}saving=true;save.disabled=true;try{var result=await wallet().setMatchRewardConfig(map);if(!closed){if(result&&result.ok===true){message.textContent="奖励设置已保存";toast("对局奖励设置已保存");}else message.textContent="保存失败："+(result&&result.reason||"请稍后重试");}}catch(err){if(!closed)message.textContent="保存失败："+(err.message||"请稍后重试");}finally{saving=false;if(!closed)save.disabled=false;}};
			doc.documentElement.appendChild(overlay); doc.addEventListener("keydown",key,true);panel={overlay:overlay,close:close}; if(inputs.length)inputs[0].node.focus(); return true;
		}
		lib.skill.csh_match_reward_tap = {trigger:{global:["gameStart","phaseBefore","useCardAfter","respondAfter","damageEnd"]},forced:true,silent:true,popup:false,forceDie:true,priority:-101,filter:function(ev,p){if(!allowed())return false;return p===game.me;},async content(event,trigger){tap(event.triggername,trigger);}};
		if (typeof game.addGlobalSkill === "function") game.addGlobalSkill("csh_match_reward_tap");
		game._cshMatchRewardCapture=capture;
		if (!game._cshMatchRewardOverInstalled && typeof game.over === "function") {
			game._cshMatchRewardPreviousOver=game.over;
			game.over=function cshMatchRewardOver(){
				try { if(typeof game._cshMatchRewardCapture === "function")game._cshMatchRewardCapture(arguments[0]); }catch(e){try{console.warn("[池子魔将] 对局奖励捕获失败",e);}catch(ignored){}}
				var previous=game._cshMatchRewardPreviousOver;
				if(typeof previous === "function")return previous.apply(this,arguments);
				if(typeof game.over === "function" && game.over !== cshMatchRewardOver)return game.over.apply(this,arguments);
			};
			game._cshMatchRewardOverInstalled=true;
		}
		if(root.addEventListener){root.addEventListener("pagehide",endSession);root.addEventListener("beforeunload",endSession);}
		return lib.cshMatchReward={openPanel:openPanel,closePanel:closePanel,retryPending:retryPending,invalidate:invalidate,defaults:function(){return JSON.parse(JSON.stringify(DEFAULTS));},rates:rates};
	}
	root.CSH_MATCH_REWARD={install:install};
})(typeof window !== "undefined" ? window : globalThis);
