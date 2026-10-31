/* Normal host matches only. Zero-import factory; persistence belongs to the wallet. */
(function (root) {
	"use strict";
	var DEFAULTS = { identity: {win:300,lose:100}, versus: {win:250,lose:80}, doudizhu: {win:300,lose:100}, guozhan: {win:400,lose:120}, boss: {win:150,lose:50} };
	function amount(v) { return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1000; }
	function install(host) {
		if (!host || !host.lib || !host.game) return false;
		var lib = host.lib, game = host.game, status = host.status || {}, get = host.get || {};
		if (lib.cshMatchReward) return lib.cshMatchReward;
		var run = null, pending = [], disposed = false, panel = null, generation = 0, started = new WeakSet(), retryTimer = null;
		function wallet() { return lib.cshWallet && lib.cshWallet.wallet; }
		function toast(s) { try { if (lib.cshUI) lib.cshUI.toast(s, {merge:false}); } catch (e) {} }
		function invalidate() { if(retryTimer!==null){clearTimeout(retryTimer);retryTimer=null;}generation++; run = null; pending.length = 0; closePanel(); }
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
		function rates(m){var reg=root.CSH&&root.CSH.registry;return reg&&reg.matchRewards?reg.matchRewards(m):Object.assign({},DEFAULTS[m]||{win:250,lose:80});}
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
        function scheduleRetry(){if(retryTimer!==null||disposed||!pending.length||typeof setTimeout!=='function')return;var expected=generation;retryTimer=setTimeout(function(){retryTimer=null;if(expected===generation&&!disposed)void retryPending();},2000);}
        function pendingNotice(item,reason){if(item.notified)return;item.notified=true;toast("对局奖励待补领："+reason+"；存储恢复后自动重试，请勿重载");}
		async function pay(item) {
			if (item.busy || !allowed() || pending.indexOf(item) < 0) return {ok:false,reason:"当前无法补领"};
			item.busy = true;
			try {
				var W = wallet(); if (!W || typeof W.settleMatch !== "function") throw Error("钱包尚未就绪");
				var result = await W.settleMatch(item.id,item.mode,item.win,item.amount);
				if (item.generation !== generation) return {ok:false,reason:"原对局会话已结束"};
				if (!result || result.ok !== true) { pendingNotice(item,result && result.reason || "保存失败"); return result || {ok:false}; }
				var at = pending.indexOf(item); if (at >= 0) pending.splice(at,1);
				if (!result.already) toast(label(item.mode) + (item.win ? "胜利" : "落败") + "，获得 " + result.gained + " CBY");
				return result;
			} catch (e) { if (item.generation === generation) pendingNotice(item,e.message || "保存失败"); return {ok:false,reason:e.message}; }
			finally { item.busy = false;scheduleRetry(); }
		}
		function capture(result) {
			if (!allowed() || !run || run.ended) return;
			run.ended = true;
			if (status.over || typeof result !== "boolean" || !run.active || mode() !== run.mode || !game.me) return;
			var value = rates(run.mode)[result ? "win" : "lose"];
			if (!value) return;
			var item = {id:run.id,mode:run.mode,win:result,amount:value,busy:false,generation:generation};
			var Q=lib.cshWallet&&lib.cshWallet.pending;
            if(Q){var r=Q.put("match",item.id,{mode:item.mode,win:item.win,amount:item.amount});if(r.ok&&!r.already)toast(label(item.mode)+(item.win?"胜利":"落败")+"，获得 "+r.gained+" CBY");else if(!r.ok)toast(r.durable?"对局奖励已保留，存储恢复后自动补记；行囊可查看":"对局结果暂未写入本机，请保持页面打开并恢复存储");}
            else {pending.push(item);void pay(item);}
		}
		async function retryPending() { if(lib.cshWallet&&lib.cshWallet.pending)return {pending:lib.cshWallet.pending.retry().count};var list = pending.slice(); for (var i=0;i<list.length;i++) await pay(list[i]); return {pending:pending.length}; }
		function closePanel() { if (panel) panel.close(); }
		function openPanel(){toast("对局奖励由扩展统一设定；正常终局自动到账");return false;}
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
