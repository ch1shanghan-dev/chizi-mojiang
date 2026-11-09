import { lib, game, _status } from "../../../noname.js";
import "./csh_achv.js";
import { careerSnapshot as projectBossCareer } from "./csh_bossrecord.js";

/* Passive career collection. Wallet qualifications share economic checkpoints;
   rank qualifications share their own rank checkpoint and aggregate by exact date.
   This module neither pays rewards nor installs battle hooks. */
(function () {
    if (lib.cshCareerObserver) return;
    var readyEpoch = -1, observedEpoch = -1, starting = false, queued = false;
    var pending = Object.create(null), definitions = null, rankDefinitions = null, gambleDefinitions = null, interactionDefinitions = null, historicalWallet = null, historicalTaskReliable = false, historicalBossReliable = false;
    var bossCacheSource, bossCacheProvider, bossCache;
    var rankCacheEpoch=-1,rankCacheRevision=-1,rankCache=null;
    var gambleCacheEpoch=-1,gambleCacheRevision=-1,gambleCache=null;
    var interactionCacheEpoch=-1,interactionCacheRevision=-1,interactionCache=null;
    var TASK_KEYS = ['task_1','task_2','task_3','task_4','task_5','task_6','task_7','task_8','task_9','task_10','task_12','task_15','egg_task_full','egg_full_house'];
    function bossRule(def) { return def.cat === "挑战"; }
    function rankRule(def) { return def.cat === "官阶" || def.cat === "功勋" || def.key === "egg_seg_rise" || def.key === "egg_rank_master" || /^cx_combo_merit_meritday_\d+$/.test(def.key); }
    function rankDefs() { return rankDefinitions || (rankDefinitions = engine().defs.filter(rankRule)); }
    function rankStats(value) { return {rank:value.rank,merit:value.merit,meritToday:value.meritToday,segIdx:bank().rank.segOf(value.rank).seg}; }
    /* The rank checkpoint owns exact observations, including a prior day's merit. */
    function rankRecord(value) {
        var cached=!value,revision=bank().rank.revision();
        if(cached&&rankCacheEpoch===epoch()&&rankCacheRevision===revision&&rankCache)return rankCache;
        value=value||bank().rank.saved();
        var record=bank().validateCareerUnlocks(value.careerUnlocks)||{v:1,baseline:true,entries:{}};
        var stats=rankStats(value);
        rankDefs().forEach(function(def){if(!record.entries[def.key]&&met(def,stats))record.entries[def.key]={observedAt:0};});
        if(cached){rankCache=record;rankCacheEpoch=epoch();rankCacheRevision=revision;}
        return record;
    }
    function prepareRank(value, before) {
        if(!enabled())return null;
        resetIfNeeded();
        var record=rankRecord(before),stats=rankStats(value),fresh=[],stamp=Date.now();
        rankDefs().forEach(function(def){if(!record.entries[def.key]&&met(def,stats)){record.entries[def.key]={observedAt:stamp};fresh.push(def.key);}});
        return {record:bank().validateCareerUnlocks(record),fresh:fresh,epoch:epoch()};
    }
    function rankCommitted(value, prepared) {
        if(!prepared||prepared.epoch!==epoch()||!enabled())return;
        var existing=bank().wallet.careerUnlocks();
        prepared.fresh.filter(function(key){return !existing||!existing.entries[key];}).forEach(function(key){pending[key]={stamp:prepared.record.entries[key].observedAt,kind:"rank",key:key,acceptedEpoch:epoch()};});
        var stamp=epoch();
        Promise.resolve().then(function(){if(stamp!==epoch()||!enabled())return;if(start())bank().flushSave();});
    }
    /* These six generated families use only the accepted gamble checkpoint.
       Mixed world/wallet/rank combinations must not qualify from partial stats. */
    function gambleComboRule(def){return /^cx_combo_(gmplay_gmwin|gmplay_gmnet|gmplay_gmstreak|gmwin_gmnet|gmwin_gmstreak|gmnet_gmstreak)_\d+$/.test(def.key);}
    function gambleRule(def) { return def.cat === "豪赌桌" || def.key === "egg_gamble_first" || /^cx_ratio_(gmret|gmwinrate)_/.test(def.key) || gambleComboRule(def); }
    function gambleDefs() { return gambleDefinitions || (gambleDefinitions = engine().defs.filter(gambleRule)); }
    function gambleStats(value) { var g=value.gambles||{};return {gamblePlays:g.plays||0,gambleWins:g.wins||0,gambleNet:g.net||0,gambleBest:g.best||0,gambleBust:g.bust||0,gambleBestStreak:g.bestStreak||0}; }
    /* The accepted gamble checkpoint owns its observations and queue receipt. */
    function gambleRecord(value) {
        if(!value&&(!lib.cshWorld||!lib.cshWorld.gambleSaved))return {v:1,baseline:true,entries:{}};
        var cached=!value,revision=lib.cshWorld&&lib.cshWorld.gambleRevision?lib.cshWorld.gambleRevision():0;
        if(cached&&gambleCacheEpoch===epoch()&&gambleCacheRevision===revision&&gambleCache)return gambleCache;
        value=value||lib.cshWorld.gambleSaved();
        var record=bank().validateCareerUnlocks(value.careerUnlocks)||{v:1,baseline:true,entries:{}};
        var stats=gambleStats(value);
        gambleDefs().forEach(function(def){if(!record.entries[def.key]&&met(def,stats))record.entries[def.key]={observedAt:0};});
        if(cached){gambleCache=record;gambleCacheEpoch=epoch();gambleCacheRevision=revision;}
        return record;
    }
    function prepareGamble(value, before, observedAt) {
        if(!enabled())return null;
        resetIfNeeded();
        var record=gambleRecord(before),stats=gambleStats(value),fresh=[],stamp=Number.isSafeInteger(observedAt)&&observedAt>=0?observedAt:Date.now();
        gambleDefs().forEach(function(def){if(!record.entries[def.key]&&met(def,stats)){record.entries[def.key]={observedAt:stamp};fresh.push(def.key);}});
        return {record:bank().validateCareerUnlocks(record),fresh:fresh,epoch:epoch()};
    }
    function gambleCommitted(value, prepared) {
        if(!prepared||prepared.epoch!==epoch()||!enabled())return;
        var existing=bank().wallet.careerUnlocks();
        prepared.fresh.filter(function(key){return !existing||!existing.entries[key];}).forEach(function(key){pending[key]={stamp:prepared.record.entries[key].observedAt,kind:"gamble",key:key,acceptedEpoch:epoch()};});
        var stamp=epoch();
        Promise.resolve().then(function(){if(stamp!==epoch()||!enabled())return;if(start())bank().flushSave();});
    }
    function interactionDefs(){return interactionDefinitions||(interactionDefinitions=engine().defs.filter(function(def){return def.cat==="互动";}));}
    function interactionRecord(value){
        var I=lib.cshInteract;
        if(!value&&(!I||!I.careerSaved))return {v:1,baseline:true,entries:{}};
        var cached=!value,revision=I&&I.careerRevision?I.careerRevision():0;
        if(cached&&interactionCacheEpoch===epoch()&&interactionCacheRevision===revision&&interactionCache)return interactionCache;
        value=value||I.careerSaved();
        var record=bank().validateCareerUnlocks(value.careerUnlocks)||{v:1,baseline:true,entries:{}};
        interactionDefs().forEach(function(def){if(!record.entries[def.key]&&met(def,{interactTotal:value.total}))record.entries[def.key]={observedAt:0};});
        if(cached){interactionCache=record;interactionCacheEpoch=epoch();interactionCacheRevision=revision;}
        return record;
    }
    function prepareInteraction(value,before,observedAt){
        if(!enabled())return null;
        resetIfNeeded();
        var record=interactionRecord(before),fresh=[],stamp=Number.isSafeInteger(observedAt)&&observedAt>=0?observedAt:Date.now();
        interactionDefs().forEach(function(def){if(!record.entries[def.key]&&met(def,{interactTotal:value.total})){record.entries[def.key]={observedAt:stamp};fresh.push(def.key);}});
        return {record:bank().validateCareerUnlocks(record),fresh:fresh,epoch:epoch()};
    }
    function interactionCommitted(value,prepared){
        if(!prepared||prepared.epoch!==epoch()||!enabled())return;
        var existing=bank().wallet.careerUnlocks();
        prepared.fresh.filter(function(key){return !existing||!existing.entries[key];}).forEach(function(key){pending[key]={stamp:prepared.record.entries[key].observedAt,kind:"interaction",key:key,acceptedEpoch:epoch()};});
        var stamp=epoch();
        Promise.resolve().then(function(){if(stamp!==epoch()||!enabled())return;if(start())bank().flushSave();});
    }
    function playerRatioRule(def){return /^cx_ratio_(winrate|killper)_/.test(def.key);}
    // Only these families depend entirely on the accepted personal match history.
    function playerComboRule(def){return /^cx_combo_(wins_games|wins_kills|wins_chars|games_kills|games_chars|kills_chars)_\d+$/.test(def.key);}
    function playerRule(def){return def.cat==="胜负"||playerRatioRule(def)||playerComboRule(def);}
    function playerDefs(){return engine().defs.filter(playerRule);}
    function personalStats(state, oldNames){
        var stats={wrGames:0,wrWin:0,wrLose:0,wrKill:0,wrChars:0,wrModes:0},names=new Set(oldNames||[]);
        if(state){["identity","versus","doudizhu","guozhan"].forEach(function(mode){var m=state.modes[mode];if(m){stats.wrGames+=m.games;stats.wrWin+=m.win;stats.wrLose+=m.lose;stats.wrKill+=m.kill;if(m.games>0)stats.wrModes++;}});state.chars.forEach(function(id){names.add(id);});}
        stats.wrChars=names.size;return stats;
    }
    function historicalPersonalNames(){
        var d=lib.config["extension_池子魔将_winrateData"],chars=d&&d.me&&d.me.chars;
        if(!chars||typeof chars!=="object"||Array.isArray(chars))return [];
        return Object.keys(chars).filter(function(id){return chars[id]&&Number.isSafeInteger(chars[id].games)&&chars[id].games>0;});
    }
    /* Only source receipts can date earlier matches. Character appearance history
       proves a lower bound of used names, never a number of matches or its date. */
    function playerRecord(value){
        var W=bank(),state=value?W.validatePlayerMatches(value.playerMatches):W.playerMatches(),global=value?W.validateCareerUnlocks(value.careerUnlocks):W.wallet.careerUnlocks(),defs=playerDefs(),record={v:1,baseline:true,entries:{}},oldNames=historicalPersonalNames();
        defs.forEach(function(def){if(global&&global.entries[def.key])record.entries[def.key]={observedAt:global.entries[def.key].observedAt};});
        var oldStats=personalStats(null,oldNames);defs.forEach(function(def){if(!record.entries[def.key]&&met(def,oldStats))record.entries[def.key]={observedAt:0};});
        if(!state)return record;
        var actual=personalStats(state,oldNames),missing=defs.filter(function(def){return !record.entries[def.key]&&(playerRatioRule(def)||met(def,actual));});
        if(!missing.length)return record;
        var replay={modes:{},chars:[]},names=new Set(oldNames);
        state.receipts.slice().sort(function(a,b){return a.t-b.t;}).some(function(receipt){
            var input=JSON.parse(receipt.payload),m=replay.modes[input.mode]||(replay.modes[input.mode]={games:0,win:0,lose:0,kill:0});m.games++;m[input.win?"win":"lose"]++;m.kill+=input.kills;input.chars.forEach(function(id){names.add(id);});replay.chars=Array.from(names);
            var stats=personalStats(replay);missing=missing.filter(function(def){if(!met(def,stats))return true;record.entries[def.key]={observedAt:input.observedAt};return false;});return !missing.length;
        });
        // A future compacted source can prove eligibility without retaining a first date.
        missing.forEach(function(def){if(met(def,actual))record.entries[def.key]={observedAt:0};});
        return W.validateCareerUnlocks(record);
    }
    function preparePlayerMatch(value,before,observedAt){
        if(!enabled())throw Error("个人生涯采集当前不可用");
        resetIfNeeded();
        if(!Number.isSafeInteger(observedAt)||observedAt<0)throw Error("个人生涯日期无效");
        var state=bank().validatePlayerMatches(value.playerMatches);if(!state)throw Error("个人对局来源未就绪");
        var record=playerRecord(before),stats=personalStats(state,historicalPersonalNames()),fresh=[];
        playerDefs().forEach(function(def){if(record.entries[def.key]||!met(def,stats))return;record.entries[def.key]={observedAt:observedAt};if(observedAt>0)fresh.push(def.key);});
        return {record:bank().validateCareerUnlocks(record),fresh:fresh,epoch:epoch()};
    }
    function worldHandsRule(def){return /^(hands|cx_hands|tablefriends|oldfriend|revengefriend|balancedfriend|poorai|topdown|topfund|billionaires|broke)_\d+$/.test(def.key) || /^skilltop_(?:1|0\.(?:7|8|85|9|95|98|99))$/.test(def.key);}
    function worldHandsDefs(){return engine().defs.filter(worldHandsRule);}
    function worldHandsRecord(){
        var G=lib.cshWorld;
        if(!G||typeof G.worldCareerSaved!=="function")return {v:1,baseline:true,entries:{}};
        var data=G.worldCareerSaved(),record=bank().validateCareerUnlocks(data.careerUnlocks)||{v:1,baseline:true,entries:{}};
        worldHandsDefs().forEach(function(def){if(!record.entries[def.key]&&met(def,data))record.entries[def.key]={observedAt:0};});
        return record;
    }
    function prepareWorldHands(value,observedAt){
        if(!enabled())return null;
        resetIfNeeded();
        if(!Number.isSafeInteger(observedAt)||observedAt<0)throw Error("世界亲历日期无效");
        var record=worldHandsRecord(),data=lib.cshWorld.worldCareerSnapshot(value),candidate=bank().validateCareerUnlocks(data.careerUnlocks),fresh=[];
        // A table can also settle a gamble: retain both qualifications in the same source write.
        if(candidate)Object.keys(candidate.entries).forEach(function(key){record.entries[key]=candidate.entries[key];});
        worldHandsDefs().forEach(function(def){if(record.entries[def.key]||!met(def,data))return;record.entries[def.key]={observedAt:observedAt};if(observedAt>0)fresh.push(def.key);});
        return {record:bank().validateCareerUnlocks(record),fresh:fresh,epoch:epoch()};
    }
    function worldHandsCommitted(value,prepared){
        if(!prepared||prepared.epoch!==epoch()||!enabled())return;
        var existing=bank().wallet.careerUnlocks();
        prepared.fresh.filter(function(key){return !existing||!existing.entries[key];}).forEach(function(key){pending[key]={stamp:prepared.record.entries[key].observedAt,kind:"worldHands",key:key,acceptedEpoch:epoch()};});
        var stamp=epoch();Promise.resolve().then(function(){if(stamp!==epoch()||!enabled())return;if(start())bank().flushSave();});
    }
    function sourceRecord(){var record=rankRecord(),gamble=gambleRecord(),interaction=interactionRecord(),player=playerRecord(),worldHands=worldHandsRecord();return {v:1,baseline:true,entries:Object.assign({},record.entries,gamble.entries,interaction.entries,player.entries,worldHands.entries)};}

    function taskRule(def) { return TASK_KEYS.indexOf(def.key) >= 0 || /^cx_task_\d+$/.test(def.key); }

    function bank() { return lib.cshWallet; }
    function epoch() { return bank().saveEpoch(); }
    function enabled() {
        var W = bank();
        return !!(W && !W.saveGuard.blocked() && !_status.connectMode &&
            !_status.video && !game.online && !game.observe);
    }
    function engine() { return typeof window !== "undefined" && window.CSH_ACHV; }
    /* Capture the adopted save before any newly observed wallet action. */
    function adopted() {
        observedEpoch = epoch(); readyEpoch = -1; pending = Object.create(null);
        historicalWallet = Object.create(null);
        var stats = snapshot(bank().wallet.get(), true);
        historicalTaskReliable = stats.taskSourceReliable; historicalBossReliable = stats.bossSourceReliable;
        walletDefs().forEach(function (def) { if (met(def, stats)) historicalWallet[def.key] = true; });
    }
    function resetIfNeeded() {
        var current = epoch();
        if (observedEpoch !== current) {
            adopted();
        }
        return readyEpoch === current;
    }
    // These families use only the candidate wallet checkpoint and its chain witness.
    function walletComboRule(def){return /^cx_combo_(rich_peak|rich_sign|peak_sign)_\d+$/.test(def.key);}
    function walletDefs() {
        if (!definitions) definitions = engine().defs.filter(function (d) {
            return bossRule(d) || taskRule(d) || walletComboRule(d) || d.cat === "资产" || d.cat === "签到" ||
                ["egg_signed_first", "egg_hungry", "egg_rich_first"].indexOf(d.key) >= 0;
        });
        return definitions;
    }
    function snapshot(value, fromAdopted) {
        var stats = { pc: value.pc, pcPeak: Math.max(value.pcPeak, value.pc), streak: value.streak, taskSourceReliable: false, bossSourceReliable: false };
        try {
            /* Read the actual candidate checkpoint, never the previous task mirror.
               A prior day can prove eligibility; it cannot fabricate its old date. */
            var task = fromAdopted ? bank().task.origin() : bank().task.peek(value, true);
            stats.taskDone = task.defs.filter(function (d) { return d.done || d.claimed; }).length;
            stats.taskTotal = task.defs.length; stats.taskCompletedTotal=task.lifetime.completed;stats.taskFullDays=task.lifetime.fullDays; stats.taskSourceReliable = true;
        } catch (error) { /* Unknown task origin remains historical until a reliable read. */ }
        try {
            var R=lib.cshBossRecord, projector=R&&R.careerSnapshot||projectBossCareer;
            var saved=fromAdopted?bank().wallet.bossSaved():value.bossSaved;
            if(fromAdopted&&epoch()===0){
                saved=saved||{};
                [["bossKill","extension_池子魔将_bossKill"],["bossAsBoss","extension_池子魔将_bossAsBoss"]].forEach(function(pair){
                    if(Object.prototype.hasOwnProperty.call(saved,pair[0]))return;
                    var old=lib.config[pair[1]];
                    if(old==null){var raw=localStorage.getItem(pair[1]);old=raw==null?{}:JSON.parse(raw);}
                    saved[pair[0]]=old;
                });
            }
            saved=saved||null;
            if(typeof projector!=="function")throw Error("讨伐来源尚未就绪");
            if(saved!==bossCacheSource||projector!==bossCacheProvider||!bossCache){bossCache=projector(saved||{});bossCacheSource=saved;bossCacheProvider=projector;}
            Object.assign(stats,bossCache);stats.bossSourceReliable=true;
        } catch(error){ /* Unreadable records never become an empty successful source. */ }
        return stats;
    }
    function met(def, stats) {
        if (taskRule(def) && stats.taskSourceReliable !== true || bossRule(def) && stats.bossSourceReliable !== true) return false;
        var p = def.prog(stats);
        return Number(p[0]) >= Number(p[1]);
    }
    function deferStart() {
        if (starting || queued) return;
        queued = true;
        Promise.resolve().then(function () { queued = false; start(); });
    }
    function start() {
        if (starting || !enabled()) return false;
        if (resetIfNeeded()) return true;
        var W = bank(), A = engine(), S = lib.cshShell;
        if (!A || !S || !S.stats) return false;
        starting = true;
        try {
            if (!W.flushSave()) return false;
            var stamp = epoch(), stats = S.stats({ readOnly: true });
            var durable = JSON.parse(localStorage.getItem(W.KEYS.wallet));
            if (stats.careerStatsReliable !== true || epoch() !== stamp || !enabled()) return false;
            // Opening a game at night does not satisfy "open the career hall".
            stats.nightOwl = false;
            var keys = A.evalAll(stats).filter(function (r) { return r.conditionMet&&!playerRule(r)&&!worldHandsRule(r); })
                .map(function (r) { return r.key; });
            if (!historicalTaskReliable) {
                var recovered = snapshot(durable);
                if (recovered.taskSourceReliable) {
                    historicalTaskReliable = true;
                    walletDefs().forEach(function (def) { if (taskRule(def) && met(def, recovered)) historicalWallet[def.key] = true; });
                }
            }
            if(!historicalBossReliable){
                var recoveredBoss=snapshot(durable);
                if(recoveredBoss.bossSourceReliable){historicalBossReliable=true;walletDefs().forEach(function(def){if(bossRule(def)&&met(def,recoveredBoss))historicalWallet[def.key]=true;});}
            }
            var ranks=sourceRecord();
            Object.keys(ranks.entries).forEach(function(key){if(keys.indexOf(key)<0)keys.push(key);});
            Object.keys(historicalWallet || {}).forEach(function (key) { if (keys.indexOf(key) < 0) keys.push(key); });
            keys = keys.filter(function (key) { return !pending[key] || !witnessed(durable, pending[key]); });
            /* 无可靠首次来源的定义（1128 条）在被动采集里只能记未知 0，
               否则会被写成「第一次打开生涯页」的挂钟时间。分区真源在 csh_achv。 */
            var unknownKeys = (A && typeof A.byId === "function" && typeof A.hasFirstCaptureSource === "function")
                ? keys.filter(function(key){var def=A.byId(key);return !def||!A.hasFirstCaptureSource(def);}) : [];
            var result = W.wallet.syncCareerUnlocks(keys, {historicalKeys:Object.keys(historicalWallet||{}).filter(function(key){return keys.indexOf(key)>=0;}), sourceRecord:ranks, unknownKeys:unknownKeys});
            if (!result.ok || epoch() !== stamp) return false;
            readyEpoch = stamp;
            Object.keys(pending).forEach(function (key) { if (result.record.entries[key]) delete pending[key]; });
            walletDefs();
            if (Object.keys(pending).length) W.flushSave();
            return true;
        } catch (error) {
            try { if (lib.cshDebug && lib.cshDebug.error) lib.cshDebug.error("生涯采集初始化待重试", error); } catch (ignored) {}
            return false;
        } finally { starting = false; }
    }
    function ready() {
        if (!enabled()) return false;
        if (!resetIfNeeded()) { deferStart(); return false; }
        return true;
    }
    function witness(value) {
        var chain = value.chain, last = chain && chain[chain.length - 1];
        return last && { seq: last.s, hash: last.h };
    }
    function witnessed(value, item) {
        if(item.kind==="boss")return item.acceptedEpoch===epoch();
        if(item.kind==="interaction"){var prop=interactionRecord().entries[item.key];return item.acceptedEpoch===epoch()&&prop&&prop.observedAt===item.stamp;}
        if(item.kind==="worldHands"){var source=worldHandsRecord().entries[item.key];return item.acceptedEpoch===epoch()&&source&&source.observedAt===item.stamp;}
        if(item.kind==="gamble"){var source=gambleRecord().entries[item.key];return item.acceptedEpoch===epoch()&&source&&source.observedAt===item.stamp;}
        if(item.kind==="rank"){var actual=rankRecord().entries[item.key];return item.acceptedEpoch===epoch()&&actual&&actual.observedAt===item.stamp;}
        var chain = value.chain || [];
        return chain.some(function (e) { return e.s === item.seq && e.h === item.hash; }) ||
            !!(chain.length && chain[0].s === item.seq + 1 && value.chainBase === item.hash);
    }
    function stageWallet(value, accepted) {
        if (!enabled()) return;
        if (!resetIfNeeded()) deferStart();
        var record = bank().validateCareerUnlocks(value.careerUnlocks) || { entries: {} }, proof = witness(value);
        if (!proof && !accepted) return;
        // Carry a valid witness forward before the bounded chain evicts it.
        Object.keys(pending).forEach(function (key) {
            var item = pending[key];
            if (!item.kind && proof && witnessed(value, item)) { item.seq = proof.seq; item.hash = proof.hash; }
        });
        var stats = snapshot(value), stamp = Date.now();
        walletDefs().forEach(function (def) {
            if ((taskRule(def) && !historicalTaskReliable) || (bossRule(def) && !historicalBossReliable) || record.entries[def.key] || (readyEpoch !== observedEpoch && historicalWallet && historicalWallet[def.key]) || !met(def, stats)) return;
            var old = pending[def.key];
            if(bossRule(def)){if(accepted&&(!old||!witnessed(value,old)))pending[def.key]={stamp:stamp,kind:"boss",acceptedEpoch:epoch()};return;}
            if (proof && (!old || !witnessed(value, old))) pending[def.key] = { stamp: stamp, seq: proof.seq, hash: proof.hash };
        });
    }
    function prepareWallet(value) {
        if (!ready()) return null;
        var record = bank().validateCareerUnlocks(value.careerUnlocks);
        if (!record) return null;
        var stats = snapshot(value), stamp = Date.now(), fresh = [], changed = false;
        walletDefs().forEach(function (def) {
            if ((taskRule(def) && !historicalTaskReliable) || record.entries[def.key]) return;
            var item = pending[def.key], valid = item && witnessed(value, item);
            if (!valid && !met(def, stats)) return;
            record.entries[def.key] = { observedAt: valid ? item.stamp : stamp };
            fresh.push(def.key);
        });
        var ranks=sourceRecord();
        Object.keys(ranks.entries).forEach(function(key){if(record.entries[key])return;record.entries[key]={observedAt:ranks.entries[key].observedAt};changed=true;if(ranks.entries[key].observedAt>0)fresh.push(key);});
        return fresh.length || changed ? { record: bank().validateCareerUnlocks(record), fresh: fresh, epoch: readyEpoch } : null;
    }
    function committed(value, prepared) {
        Object.keys(pending).forEach(function(key){if(value.careerUnlocks&&value.careerUnlocks.entries[key])delete pending[key];});
        if (!prepared) { if (!starting && enabled() && !resetIfNeeded()) { stageWallet(value, true); deferStart(); } return; }
        prepared.fresh.forEach(function (key) { delete pending[key]; });
        var stamp = prepared.epoch;
        Promise.resolve().then(function () {
            if (!enabled() || epoch() !== stamp) return;
            var A = engine(), actual = bank().wallet.careerUnlocks();
            var rows = prepared.fresh.filter(function (key) {
                return actual && actual.entries[key] && actual.entries[key].observedAt === prepared.record.entries[key].observedAt;
            }).map(function (key) {
                var d = A.byId(key);
                return { id: key, source: "career", title: d.label, description: d.desc, pc: d.reward };
            });
            if (rows.length && lib.cshUI && lib.cshUI.achievement) lib.cshUI.achievement(rows, { kind: "unlock" });
        }).catch(function () { /* Presentation cannot change a committed wallet. */ });
    }
    /* A backup must never silently omit an accepted transient qualification. */
    function flushForSnapshot() {
        resetIfNeeded();
        if (!Object.keys(pending).length) return true;
        if (!start() || !bank().flushSave()) return false;
        return Object.keys(pending).length === 0;
    }
    lib.cshCareerObserver = { start: start, stageWallet: stageWallet, prepareWallet: prepareWallet, preparePlayerMatch:preparePlayerMatch, prepareWorldHands:prepareWorldHands,worldHandsCommitted:worldHandsCommitted, prepareRank: prepareRank, rankCommitted: rankCommitted, prepareGamble:prepareGamble,gambleCommitted:gambleCommitted, prepareInteraction:prepareInteraction,interactionCommitted:interactionCommitted, committed: committed, adopted: adopted, flushForSnapshot: flushForSnapshot };
    adopted();
})();
