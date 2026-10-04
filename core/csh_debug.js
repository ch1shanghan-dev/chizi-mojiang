import { lib, game, ui, get, ai, _status } from "../../../noname.js";
// 池子魔将 · 池子调试（从 extension.js 拆出）
// ========== Phase 2：Debug Core + Logger + Error Collector（旁路）==========
(function () {
    if (lib.__csh_debug_core_inited) return;
    lib.__csh_debug_core_inited = true;

    var MAX_LOG = 800;
    var MAX_ERR = 200;
    var MAX_DEPTH = 4;
    var MAX_STR = 400;
    var MAX_KEYS = 40;
    var _logging = false; // 防 error→logger→error 递归

    function now() {
        try {
            return Date.now();
        } catch (e) {
            return 0;
        }
    }

    function playerTag(p) {
        try {
            if (!p) return null;
            if (typeof p === "string") return p;
            return p.name || p.name1 || p.playerid || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * 安全序列化：防循环、截断深度/长度、跳过 DOM/函数/复杂引擎对象
     */
    function safeSerialize(value, depth, seen) {
        if (depth == null) depth = 0;
        if (!seen) seen = [];
        try {
            if (value === null || value === undefined) return value;
            var t = typeof value;
            if (t === "string") {
                if (value.length > MAX_STR) return value.slice(0, MAX_STR) + "…(len=" + value.length + ")";
                return value;
            }
            if (t === "number" || t === "boolean") return value;
            if (t === "function") return "[Function]";
            if (t === "symbol") return "[Symbol]";
            if (t !== "object") return String(value);

            // DOM / Event
            if (typeof Node !== "undefined" && value instanceof Node) {
                return "[Node:" + (value.nodeName || "?") + "]";
            }
            if (typeof HTMLElement !== "undefined" && value instanceof HTMLElement) {
                return "[HTMLElement]";
            }
            if (typeof Event !== "undefined" && value instanceof Event) {
                return "[Event:" + (value.type || "?") + "]";
            }

            // 无名杀常见复杂对象：只留摘要
            if (value.cardid != null && value.name != null && value.suit != null) {
                return {
                    _type: "Card",
                    name: String(value.name),
                    suit: value.suit != null ? String(value.suit) : undefined,
                    number: value.number,
                };
            }
            if (value.playerid != null || (value.name && value.hp != null && typeof value.draw === "function")) {
                return {
                    _type: "Player",
                    name: value.name || value.name1 || undefined,
                    hp: value.hp,
                    maxHp: value.maxHp,
                    playerid: value.playerid,
                };
            }
            if (value.name && value.step !== undefined && typeof value.finish === "function") {
                return {
                    _type: "GameEvent",
                    name: String(value.name),
                    step: value.step,
                };
            }

            // 循环引用
            for (var i = 0; i < seen.length; i++) {
                if (seen[i] === value) return "[Circular]";
            }
            if (depth >= MAX_DEPTH) return "[MaxDepth]";

            seen.push(value);

            if (Array.isArray(value)) {
                var arr = [];
                var lim = Math.min(value.length, MAX_KEYS);
                for (var j = 0; j < lim; j++) {
                    arr.push(safeSerialize(value[j], depth + 1, seen));
                }
                if (value.length > lim) arr.push("…(+" + (value.length - lim) + ")");
                seen.pop();
                return arr;
            }

            var out = {};
            var keys = [];
            try {
                keys = Object.keys(value);
            } catch (eKeys) {
                seen.pop();
                return "[Unenumerable]";
            }
            var klim = Math.min(keys.length, MAX_KEYS);
            for (var k = 0; k < klim; k++) {
                var key = keys[k];
                try {
                    out[key] = safeSerialize(value[key], depth + 1, seen);
                } catch (eVal) {
                    out[key] = "[Throw]";
                }
            }
            if (keys.length > klim) out["…"] = "+" + (keys.length - klim) + " keys";
            seen.pop();
            return out;
        } catch (e) {
            return "[SerializeError]";
        }
    }

    function safeStringify(value) {
        try {
            return JSON.stringify(safeSerialize(value));
        } catch (e) {
            return '"[stringify failed]"';
        }
    }

    function pushRing(arr, item, max) {
        try {
            arr.push(item);
            while (arr.length > max) arr.shift();
        } catch (e) {
            // 写入失败不得影响游戏；也不再走 error 通道
            try {
                console.error("[cshDebug] ring push failed", e);
            } catch (e2) {}
        }
    }

    function makeEntry(level, category, message, data, extra) {
        extra = extra || {};
        var entry = {
            timestamp: now(),
            level: level || "log",
            category: category || "general",
            message: message == null ? "" : String(message),
            data: data === undefined ? null : safeSerialize(data),
            player: extra.player != null ? playerTag(extra.player) : null,
            skill: extra.skill != null ? String(extra.skill) : null,
            event: extra.event != null ? safeSerialize(extra.event) : null,
        };
        return entry;
    }

    function writeLog(level, category, message, data, extra) {
        if (_logging) {
            try {
                console.error("[cshDebug] reentrant log suppressed", category, message);
            } catch (e) {}
            return null;
        }
        _logging = true;
        try {
            var entry = makeEntry(level, category, message, data, extra);
            pushRing(lib.cshDebug._logs, entry, MAX_LOG);
            try {
                if (level === "error" || level === "warn") {
                    console[level === "error" ? "error" : "warn"](
                        "[cshDebug:" + entry.category + "]",
                        entry.message,
                        entry.data
                    );
                }
            } catch (eCon) {}
            return entry;
        } catch (e) {
            try {
                console.error("[cshDebug] writeLog failed", e);
            } catch (e2) {}
            return null;
        } finally {
            _logging = false;
        }
    }

    function collectError(message, data, extra) {
        if (_logging) {
            try {
                console.error("[cshDebug] reentrant error suppressed", message);
            } catch (e) {}
            return null;
        }
        _logging = true;
        try {
            extra = extra || {};
            var errMsg = message;
            var stack = null;
            if (message && typeof message === "object" && message.message) {
                errMsg = message.message;
                stack = message.stack || null;
            }
            if (data && data.stack && !stack) stack = data.stack;
            if (extra.error && extra.error.stack && !stack) stack = extra.error.stack;
            if (extra.error && extra.error.message && !errMsg) errMsg = extra.error.message;

            var entry = {
                timestamp: now(),
                category: (extra && extra.category) || "error",
                message: errMsg == null ? "unknown" : String(errMsg),
                stack: stack ? String(stack).slice(0, 2000) : null,
                player: extra.player != null ? playerTag(extra.player) : null,
                skill: extra.skill != null ? String(extra.skill) : null,
                event: extra.event != null ? safeSerialize(extra.event) : null,
                data: data === undefined ? null : safeSerialize(data),
            };
            pushRing(lib.cshDebug._errors, entry, MAX_ERR);
            pushRing(
                lib.cshDebug._logs,
                makeEntry("error", entry.category, entry.message, { stack: entry.stack, data: entry.data }, extra),
                MAX_LOG
            );
            try {
                console.error("[cshDebug:error]", entry.message, entry.stack || "");
            } catch (eCon) {}
            return entry;
        } catch (e) {
            try {
                console.error("[cshDebug] collectError failed", e);
            } catch (e2) {}
            return null;
        } finally {
            _logging = false;
        }
    }

    lib.cshDebug = {
        version: "2.0-phase2",
        maxLog: MAX_LOG,
        maxError: MAX_ERR,
        _logs: [],
        _errors: [],

        safeSerialize: safeSerialize,
        safeStringify: safeStringify,

        /* CDK 兑换面板（§4.5.7）入口。⚠ openRedeem 的真实函数体在本文件下方的
           「池子调试 UI」**第二个 IIFE** 里——两个 IIFE 作用域隔离，函数声明不会
           跨 IIFE 提升，**绝不能**在这里直接写 openRedeem: openRedeem
           （2026-09-28 血泪教训：曾这么写 → 模块加载即 ReferenceError，
             整个扩展「加载失败」且报错栈只指向本行，极难排查）。
           此处先置 null，由第二个 IIFE 装载时回填真实函数。 */
        openRedeem: null,

        /* 【2026-10-02】自绘 toast 的对外出口。
           背景：csh_interact.js 的面板提示走「引擎 ui.create.toast → lib.cshDebug.toast → game.print」
           三级兜底。引擎 toast 的层级很低（本文件 1580 行、csh_shell.js 1467 行两处都注明
           「会被面板遮罩压在底下看不见」），而第二级 lib.cshDebug.toast **此前并不存在** ——
           于是 AI 互动面板里所有反馈（「台词不能为空」「场上没有 AI 角色」「试发结果」…）
           全都不可见，用户体感就是「点了没反应」。
           本文件的 toast() 挂在 documentElement、z-index 1000090，天然高于各面板，
           正是需要的那一层。与 openRedeem 同理：真实函数在第二个 IIFE 里，
           此处只能先置 null，由第二个 IIFE 装载时回填。 */
        toast: null,

        log: function (category, message, data, extra) {
            return writeLog("log", category, message, data, extra);
        },
        info: function (message, data, extra) {
            return writeLog("info", "info", message, data, extra);
        },
        warn: function (message, data, extra) {
            return writeLog("warn", "warn", message, data, extra);
        },
        error: function (message, data, extra) {
            // 统一错误入口：写入 Error Collector + 日志环
            return collectError(message, data, extra || {});
        },
        state: function (message, data, extra) {
            return writeLog("state", "state", message, data, extra);
        },
        skill: function (message, data, extra) {
            return writeLog("skill", "skill", message, data, extra);
        },
        event: function (message, data, extra) {
            return writeLog("event", "event", message, data, extra);
        },
        sync: function (message, data, extra) {
            return writeLog("sync", "sync", message, data, extra);
        },
        action: function (message, data, extra) {
            return writeLog("action", "action", message, data, extra);
        },

        getLogs: function (n) {
            try {
                var arr = lib.cshDebug._logs || [];
                if (n == null || n >= arr.length) return arr.slice();
                return arr.slice(Math.max(0, arr.length - n));
            } catch (e) {
                return [];
            }
        },
        getErrors: function (n) {
            try {
                var arr = lib.cshDebug._errors || [];
                if (n == null || n >= arr.length) return arr.slice();
                return arr.slice(Math.max(0, arr.length - n));
            } catch (e) {
                return [];
            }
        },
        clearLogs: function () {
            try {
                lib.cshDebug._logs.length = 0;
            } catch (e) {
                try {
                    lib.cshDebug._logs = [];
                } catch (e2) {}
            }
        },
        clearErrors: function () {
            try {
                lib.cshDebug._errors.length = 0;
            } catch (e) {
                try {
                    lib.cshDebug._errors = [];
                } catch (e2) {}
            }
        },
        clearAll: function () {
            lib.cshDebug.clearLogs();
            lib.cshDebug.clearErrors();
        },
        /** 纯文本导出，供复制 / 后续 BUG 报告 */
        exportText: function () {
            try {
                var lines = [];
                lines.push("=== cshDebug export v" + lib.cshDebug.version + " ===");
                lines.push("time: " + new Date().toISOString());
                lines.push("--- errors (" + (lib.cshDebug._errors || []).length + ") ---");
                (lib.cshDebug._errors || []).forEach(function (e, i) {
                    lines.push(
                        "[" +
                            i +
                            "] " +
                            e.timestamp +
                            " | " +
                            e.category +
                            " | " +
                            e.message +
                            (e.player ? " | player=" + e.player : "") +
                            (e.skill ? " | skill=" + e.skill : "")
                    );
                    if (e.stack) lines.push(String(e.stack).split("\n").slice(0, 8).join("\n"));
                });
                lines.push("--- logs (" + (lib.cshDebug._logs || []).length + ") ---");
                (lib.cshDebug._logs || []).forEach(function (e, i) {
                    lines.push(
                        "[" +
                            i +
                            "] " +
                            e.timestamp +
                            " | " +
                            e.level +
                            "/" +
                            e.category +
                            " | " +
                            e.message +
                            (e.player ? " | p=" + e.player : "") +
                            (e.skill ? " | sk=" + e.skill : "")
                    );
                });
                return lines.join("\n");
            } catch (e) {
                try {
                    return "export failed: " + (e && e.message);
                } catch (e2) {
                    return "export failed";
                }
            }
        },
    };

    try {

    // ========== Phase 3：Inspector / Trackers（旁路，默认不改结算）==========
    var MAX_ACTION = 200;
    var MAX_STORAGE_CH = 200;
    var MAX_EVENT = 300;
    var MAX_SKILL_OBS = 100;

    lib.cshDebug._actions = [];
    lib.cshDebug._storageChanges = [];
    lib.cshDebug._events = [];
    lib.cshDebug._skillObs = []; // 只读观察缓存
    lib.cshDebug._eventTrackingOn = false;
    lib.cshDebug._storageWatchOn = false;
    lib.cshDebug._storageWatchTimer = null;
    lib.cshDebug._storageSnap = null; // { playerKey: { key: serialized } }
    lib.cshDebug._eventTrackerAvailable = null; // null=未探测, true/false
    lib.cshDebug._skillTriggerCount = {}; // skillId -> number（仅当 Event 记录到时累加，不保证完整）

    /** 3A：只读状态快照 */
    lib.cshDebug.inspectPlayer = function (player) {
        try {
            if (!player) return { error: "no player" };
            var skills = [];
            try {
                skills = (player.skills || []).slice();
            } catch (e) {
                skills = ["不可用"];
            }
            var skillsTemp = [];
            try {
                if (player.skills && player.tempSkills) {
                    for (var ts in player.tempSkills) {
                        if (Object.prototype.hasOwnProperty.call(player.tempSkills, ts)) skillsTemp.push(ts);
                    }
                } else if (player.getSkills) {
                    // 无稳定 temp API 时标记
                    skillsTemp = [];
                }
            } catch (e2) {
                skillsTemp = [];
            }
            var equips = [];
            try {
                var es = player.getCards ? player.getCards("e") : [];
                for (var i = 0; i < (es || []).length; i++) {
                    equips.push(safeSerialize(es[i]));
                }
            } catch (e3) {
                equips = ["不可用"];
            }
            var judges = [];
            try {
                var js = player.getCards ? player.getCards("j") : [];
                for (var j = 0; j < (js || []).length; j++) {
                    judges.push(safeSerialize(js[j]));
                }
            } catch (e4) {
                judges = ["不可用"];
            }
            var handCount = null;
            try {
                handCount = player.countCards ? player.countCards("h") : null;
            } catch (e5) {
                handCount = null;
            }
            var marks = {};
            try {
                if (player.marks && typeof player.marks === "object") {
                    var mk = Object.keys(player.marks);
                    var mlim = Math.min(mk.length, MAX_KEYS);
                    for (var m = 0; m < mlim; m++) {
                        marks[mk[m]] = safeSerialize(player.marks[mk[m]]);
                    }
                }
            } catch (e6) {}
            var storage = null;
            try {
                storage = safeSerialize(player.storage);
            } catch (e7) {
                storage = "[不可用]";
            }
            return {
                player: playerTag(player),
                name: player.name || null,
                name1: player.name1 || null,
                name2: player.name2 || null,
                group: player.group || null,
                identity: player.identity || null,
                hp: player.hp,
                maxHp: player.maxHp,
                hujia: player.hujia || 0,
                skills: skills,
                skillsTemp: skillsTemp,
                equips: equips,
                judges: judges,
                handCount: handCount,
                marks: marks,
                linked: typeof player.isLinked === "function" ? !!player.isLinked() : null,
                turnedOver: typeof player.isTurnedOver === "function" ? !!player.isTurnedOver() : null,
                storage: storage,
            };
        } catch (e) {
            try {
                collectError(e, null, { category: "inspect" });
            } catch (e2) {}
            return { error: "inspect failed" };
        }
    };

    /** 3B：storage 快照与 diff（只读） */
    lib.cshDebug.snapshotStorage = function (player) {
        try {
            if (!player || !player.storage) return {};
            return safeSerialize(player.storage) || {};
        } catch (e) {
            return {};
        }
    };

    lib.cshDebug.diffStorage = function (before, after, meta) {
        meta = meta || {};
        try {
            before = before || {};
            after = after || {};
            var keys = {};
            var k;
            if (before && typeof before === "object" && !Array.isArray(before)) {
                for (k in before) if (Object.prototype.hasOwnProperty.call(before, k)) keys[k] = 1;
            }
            if (after && typeof after === "object" && !Array.isArray(after)) {
                for (k in after) if (Object.prototype.hasOwnProperty.call(after, k)) keys[k] = 1;
            }
            var changes = [];
            for (k in keys) {
                var b = before ? before[k] : undefined;
                var a = after ? after[k] : undefined;
                var bs = safeStringify(b);
                var as = safeStringify(a);
                if (bs !== as) {
                    var ch = {
                        timestamp: now(),
                        player: meta.player || null,
                        key: k,
                        oldValue: b,
                        newValue: a,
                        reason: meta.reason || "unknown",
                    };
                    changes.push(ch);
                    pushRing(lib.cshDebug._storageChanges, ch, MAX_STORAGE_CH);
                }
            }
            return changes;
        } catch (e) {
            return [];
        }
    };

    /**
     * 开启 storage 轮询观察（仅比较序列化摘要，不 hook 赋值）。
     * 无法捕获“谁改的”；reason 恒为 poll / action。
     */
    lib.cshDebug.setStorageWatch = function (on) {
        lib.cshDebug._storageWatchOn = !!on;
        try {
            if (lib.cshDebug._storageWatchTimer) {
                clearInterval(lib.cshDebug._storageWatchTimer);
                lib.cshDebug._storageWatchTimer = null;
            }
        } catch (e) {}
        if (!lib.cshDebug._storageWatchOn) return;
        lib.cshDebug._storageSnap = {};
        lib.cshDebug._storageWatchTimer = setInterval(function () {
            if (!lib.cshDebug._storageWatchOn) return;
            try {
                var list = (game && game.players) || [];
                for (var i = 0; i < list.length; i++) {
                    var p = list[i];
                    if (!p || !(p.name || p.name1)) continue;
                    var id = String(p.playerid || p.name || i);
                    var cur = lib.cshDebug.snapshotStorage(p);
                    var prev = lib.cshDebug._storageSnap[id];
                    if (prev) {
                        lib.cshDebug.diffStorage(prev, cur, {
                            player: playerTag(p),
                            reason: "poll",
                        });
                    }
                    lib.cshDebug._storageSnap[id] = cur;
                }
            } catch (e) {
                /* 轮询失败不影响游戏 */
            }
        }, 1500);
    };

    /** 3C：Action 记录 */
    lib.cshDebug.recordAction = function (rec) {
        try {
            var entry = {
                timestamp: now(),
                action: rec && rec.action ? String(rec.action) : "unknown",
                target: rec && rec.target != null ? playerTag(rec.target) : null,
                before: rec && rec.before !== undefined ? safeSerialize(rec.before) : null,
                requested: rec && rec.requested !== undefined ? safeSerialize(rec.requested) : null,
                after: rec && rec.after !== undefined ? safeSerialize(rec.after) : null,
                // submitted | completed | failed | unknown
                status: rec && rec.status ? String(rec.status) : "unknown",
                error: rec && rec.error ? String(rec.error) : null,
            };
            pushRing(lib.cshDebug._actions, entry, MAX_ACTION);
            writeLog("action", "action", entry.action + " [" + entry.status + "]", entry, {
                player: entry.target,
            });
            return entry;
        } catch (e) {
            return null;
        }
    };

    /** 3D：Event Tracker（可开关、幂等 hook） */
    lib.cshDebug._recordEvent = function (name, evt) {
        if (!lib.cshDebug._eventTrackingOn) return;
        try {
            var n = name != null ? String(name) : "";
            // 白名单：避免全量事件刷爆
            var allow =
                n === "phase" ||
                n.indexOf("phase") === 0 ||
                n === "damage" ||
                n.indexOf("damage") === 0 ||
                n === "dying" ||
                n === "die" ||
                n === "gain" ||
                n === "lose" ||
                n === "discard" ||
                n === "useCard" ||
                n === "respond" ||
                n === "judge" ||
                n.indexOf("Skill") >= 0 ||
                n.indexOf("skill") >= 0;
            if (!allow) return;
            var entry = {
                timestamp: now(),
                name: n,
                player: null,
                skill: null,
                summary: null,
            };
            try {
                if (evt) {
                    if (evt.player) entry.player = playerTag(evt.player);
                    if (evt.source) entry.source = playerTag(evt.source);
                    if (evt.skill) entry.skill = String(evt.skill);
                    if (evt.name && !entry.skill && typeof evt.name === "string" && evt.name.indexOf("_") > 0) {
                        /* 部分 trigger 名含技能 */
                    }
                    entry.summary = safeSerialize({
                        name: evt.name,
                        step: evt.step,
                        num: evt.num,
                        card: evt.card ? safeSerialize(evt.card) : undefined,
                    });
                    if (entry.skill) {
                        var c = lib.cshDebug._skillTriggerCount[entry.skill] || 0;
                        lib.cshDebug._skillTriggerCount[entry.skill] = c + 1;
                    }
                }
            } catch (eSum) {}
            pushRing(lib.cshDebug._events, entry, MAX_EVENT);
            writeLog("event", "event", n, entry, { player: entry.player, skill: entry.skill, event: entry.summary });
        } catch (e) {}
    };

    lib.cshDebug.installEventTracker = function () {
        if (lib.__csh_dbg_evt_installed) {
            return lib.cshDebug._eventTrackerAvailable;
        }
        lib.__csh_dbg_evt_installed = true;
        try {
            var proto = lib.element && lib.element.GameEvent && lib.element.GameEvent.prototype;
            if (!proto || typeof proto.trigger !== "function") {
                lib.cshDebug._eventTrackerAvailable = false;
                writeLog("warn", "event", "GameEvent.prototype.trigger 不可用，Event Tracker 无法安装", null);
                return false;
            }
            if (!lib.__csh_dbg_evt_orig_trigger) {
                lib.__csh_dbg_evt_orig_trigger = proto.trigger;
            }
            var orig = lib.__csh_dbg_evt_orig_trigger;
            proto.trigger = function (name) {
                try {
                    if (lib.cshDebug && lib.cshDebug._eventTrackingOn) {
                        lib.cshDebug._recordEvent(name, this);
                    }
                } catch (eHook) {
                    /* 记录失败不得影响 trigger */
                }
                return orig.apply(this, arguments);
            };
            lib.cshDebug._eventTrackerAvailable = true;
            writeLog("info", "event", "Event Tracker hook installed (default OFF)", null);
            return true;
        } catch (e) {
            lib.cshDebug._eventTrackerAvailable = false;
            try {
                collectError(e, null, { category: "event_hook" });
            } catch (e2) {}
            return false;
        }
    };

    lib.cshDebug.setEventTracking = function (on) {
        lib.cshDebug._eventTrackingOn = !!on;
        if (on) {
            lib.cshDebug.installEventTracker();
            if (!lib.cshDebug._eventTrackerAvailable) {
                writeLog("warn", "event", "开启失败：当前环境无法可靠 hook GameEvent.trigger", null);
            }
        }
        writeLog("info", "event", "Event tracking " + (on ? "ON" : "OFF"), {
            available: lib.cshDebug._eventTrackerAvailable,
        });
    };

    lib.cshDebug.uninstallEventTracker = function () {
        try {
            var proto = lib.element && lib.element.GameEvent && lib.element.GameEvent.prototype;
            if (proto && lib.__csh_dbg_evt_orig_trigger) {
                proto.trigger = lib.__csh_dbg_evt_orig_trigger;
            }
            lib.__csh_dbg_evt_installed = false;
            lib.cshDebug._eventTrackingOn = false;
            writeLog("info", "event", "Event Tracker uninstalled", null);
        } catch (e) {}
    };

    /** 3E：Skill 只读检查 */
    lib.cshDebug.inspectSkill = function (skillId, player) {
        try {
            skillId = skillId != null ? String(skillId) : "";
            var info = {
                id: skillId,
                name: null,
                exists: false,
                trigger: "不可用",
                filter: "不可用",
                content: "不可用",
                group: "不可用",
                subSkill: "不可用",
                mod: "不可用",
                ai: "不可用",
                owned: null,
                enabled: null,
                recentTriggerCount: null,
                lastFilterResult: "当前无法可靠追踪",
                lastContentStatus: "当前无法可靠追踪",
            };
            try {
                if (lib.translate && typeof lib.translate[skillId] === "string") {
                    info.name = lib.translate[skillId].replace(/<[^>]+>/g, "").slice(0, 40);
                }
            } catch (eN) {}
            var sk = null;
            try {
                sk = lib.skill && lib.skill[skillId];
            } catch (eS) {}
            if (!sk || typeof sk !== "object") {
                info.exists = false;
                return info;
            }
            info.exists = true;
            try {
                info.trigger = sk.trigger != null ? safeSerialize(sk.trigger) : null;
            } catch (e) {
                info.trigger = "不可用";
            }
            try {
                info.filter = typeof sk.filter === "function" ? "[Function]" : sk.filter != null ? safeSerialize(sk.filter) : null;
            } catch (e) {
                info.filter = "不可用";
            }
            try {
                info.content =
                    typeof sk.content === "function"
                        ? "[Function]"
                        : typeof sk.content === "string"
                          ? "[ContentString]"
                          : sk.content != null
                            ? safeSerialize(sk.content)
                            : null;
            } catch (e) {
                info.content = "不可用";
            }
            try {
                info.group = sk.group != null ? safeSerialize(sk.group) : null;
            } catch (e) {
                info.group = "不可用";
            }
            try {
                info.subSkill = sk.subSkill != null ? "[Object keys:" + Object.keys(sk.subSkill).slice(0, 20).join(",") + "]" : null;
            } catch (e) {
                info.subSkill = "不可用";
            }
            try {
                info.mod = sk.mod != null ? "[Object]" : null;
            } catch (e) {
                info.mod = "不可用";
            }
            try {
                info.ai = sk.ai != null ? "[Object]" : null;
            } catch (e) {
                info.ai = "不可用";
            }
            if (player) {
                try {
                    info.owned = typeof player.hasSkill === "function" ? !!player.hasSkill(skillId) : null;
                } catch (e) {
                    info.owned = null;
                }
                try {
                    // 有效性：无统一 API 时仅能做弱判断
                    if (typeof player.hasSkill === "function" && player.hasSkill(skillId)) {
                        info.enabled = true;
                    } else {
                        info.enabled = false;
                    }
                } catch (e) {
                    info.enabled = null;
                }
            }
            info.recentTriggerCount =
                lib.cshDebug._skillTriggerCount[skillId] != null
                    ? lib.cshDebug._skillTriggerCount[skillId]
                    : "当前无法可靠追踪（需开启 Event Tracker 且 trigger 名含 skill）";
            return info;
        } catch (e) {
            return { id: skillId, error: "inspect failed" };
        }
    };

    lib.cshDebug.getActions = function (n) {
        try {
            var a = lib.cshDebug._actions || [];
            return n == null ? a.slice() : a.slice(Math.max(0, a.length - n));
        } catch (e) {
            return [];
        }
    };
    lib.cshDebug.getStorageChanges = function (n) {
        try {
            var a = lib.cshDebug._storageChanges || [];
            return n == null ? a.slice() : a.slice(Math.max(0, a.length - n));
        } catch (e) {
            return [];
        }
    };
    lib.cshDebug.getEvents = function (n) {
        try {
            var a = lib.cshDebug._events || [];
            return n == null ? a.slice() : a.slice(Math.max(0, a.length - n));
        } catch (e) {
            return [];
        }
    };
    lib.cshDebug.clearActions = function () {
        try {
            lib.cshDebug._actions.length = 0;
        } catch (e) {
            lib.cshDebug._actions = [];
        }
    };
    lib.cshDebug.clearStorageChanges = function () {
        try {
            lib.cshDebug._storageChanges.length = 0;
        } catch (e) {
            lib.cshDebug._storageChanges = [];
        }
    };
    lib.cshDebug.clearEvents = function () {
        try {
            lib.cshDebug._events.length = 0;
        } catch (e) {
            lib.cshDebug._events = [];
        }
    };

    // 扩展 exportText
    var _oldExport = lib.cshDebug.exportText;
    lib.cshDebug.exportText = function () {
        var base = "";
        try {
            base = _oldExport ? _oldExport.call(lib.cshDebug) : "";
        } catch (e) {
            base = "";
        }
        try {
            var lines = [base, "", "--- actions ---"];
            (lib.cshDebug._actions || []).slice(-30).forEach(function (a, i) {
                lines.push("[" + i + "] " + a.timestamp + " " + a.action + " " + a.status + " target=" + a.target);
            });
            lines.push("--- storage changes ---");
            (lib.cshDebug._storageChanges || []).slice(-30).forEach(function (c, i) {
                lines.push("[" + i + "] " + c.timestamp + " " + c.player + " " + c.key + " reason=" + c.reason);
            });
            lines.push("--- events (tracking=" + !!lib.cshDebug._eventTrackingOn + ") ---");
            (lib.cshDebug._events || []).slice(-40).forEach(function (e, i) {
                lines.push("[" + i + "] " + e.timestamp + " " + e.name + " p=" + e.player + " sk=" + e.skill);
            });
            // 播报链路自检随导出一起走：以前要看这些得手动敲 lib.cshVoice.status()，
            // 现在导出即带，省掉一轮来回。
            lines.push("--- voice ---");
            try {
                if (lib.cshVoice && typeof lib.cshVoice.diag === "function") {
                    lines.push(safeStringify(lib.cshVoice.diag()));
                    lines.push("stats=" + safeStringify(lib.cshVoice.stats()));
                } else {
                    lines.push("lib.cshVoice 不存在（csh_voice.js 未加载或 import 失败）");
                }
            } catch (eV) {
                lines.push("voice diag failed: " + ((eV && eV.message) || eV));
            }
            return lines.join("\n");
        } catch (e2) {
            return base || "export failed";
        }
    };


    // ========== Phase 4：Assertion + Snapshot + BUG Report ==========
    var MAX_SNAP = 20;
    var MAX_ASSERT = 100;
    lib.cshDebug._snapshots = [];
    lib.cshDebug._assertions = [];

    lib.cshDebug.runAssertions = function (player) {
        var results = [];
        function add(ok, assertion, detail) {
            var r = {
                timestamp: now(),
                player: playerTag(player),
                assertion: assertion,
                ok: ok,
                detail: detail != null ? safeSerialize(detail) : null,
                skill: null,
                event: null,
            };
            results.push(r);
            if (!ok) pushRing(lib.cshDebug._assertions, r, MAX_ASSERT);
            return r;
        }
        try {
            if (!player) {
                add(false, "player_exists", "no player");
                return results;
            }
            // HP / MaxHP
            try {
                var hp = player.hp;
                var maxHp = player.maxHp;
                if (typeof hp === "number" && typeof maxHp === "number") {
                    if (maxHp < 1) add(false, "maxHp_range", { maxHp: maxHp });
                    else if (hp > maxHp) add(false, "hp_gt_maxHp", { hp: hp, maxHp: maxHp });
                    else add(true, "hp_maxHp", { hp: hp, maxHp: maxHp });
                    // 濒死流程可能 hp<=0，不把 hp<0 当硬错误；仅极异常
                    if (hp < -20) add(false, "hp_extreme_low", { hp: hp });
                } else {
                    add(null, "hp_maxHp", "无法可靠判断");
                }
            } catch (e) {
                add(null, "hp_maxHp", "无法可靠判断");
            }
            // 同步值 csh_tb（明日香等）范围
            try {
                if (player.storage && player.storage.csh_tb != null) {
                    var tb = player.storage.csh_tb;
                    if (typeof tb === "number" && (tb < 0 || tb > 100)) {
                        add(false, "csh_tb_range", { csh_tb: tb });
                    } else if (typeof tb === "number") {
                        add(true, "csh_tb_range", { csh_tb: tb });
                    } else {
                        add(false, "csh_tb_type", { type: typeof tb });
                    }
                }
            } catch (e2) {}
            // 技能存在性：拥有的技能应在 lib.skill 中（部分动态技可能没有）
            try {
                var sks = player.skills || [];
                for (var i = 0; i < sks.length; i++) {
                    var sid = sks[i];
                    if (!sid || sid.charAt(0) === "_") continue;
                    if (!lib.skill || !lib.skill[sid]) {
                        add(false, "skill_missing_def", { skill: sid });
                    }
                }
            } catch (e3) {}
            // Debug 记录与状态：若最近 addSkill submitted 但 hasSkill 仍 false — 仅提示 unknown/矛盾，不武断
            try {
                var acts = lib.cshDebug._actions || [];
                if (acts.length) {
                    var last = acts[acts.length - 1];
                    if (last && last.action === "addSkill" && last.status === "submitted" && last.requested && last.requested.skill) {
                        var sid2 = last.requested.skill;
                        if (typeof player.hasSkill === "function") {
                            if (!player.hasSkill(sid2)) {
                                add(false, "action_skill_not_owned_yet", {
                                    note: "addSkill submitted 但 hasSkill 仍为 false（可能事件未完成）",
                                    skill: sid2,
                                });
                            }
                        } else {
                            add(null, "action_skill_owned", "无法可靠判断");
                        }
                    }
                }
            } catch (e4) {}
        } catch (eAll) {
            add(null, "assertion_runner", "无法可靠判断");
        }
        writeLog("state", "assert", "assertions run", { count: results.length, fails: results.filter(function (x) { return x.ok === false; }).length }, { player: player });
        return results;
    };

    lib.cshDebug.saveSnapshot = function (player, label) {
        try {
            var snap = {
                id: "snap_" + now() + "_" + Math.floor(Math.random() * 1000),
                timestamp: now(),
                label: label ? String(label).slice(0, 40) : "",
                state: lib.cshDebug.inspectPlayer(player),
            };
            pushRing(lib.cshDebug._snapshots, snap, MAX_SNAP);
            writeLog("state", "snapshot", "saved " + snap.id, { label: snap.label }, { player: player });
            return snap;
        } catch (e) {
            return null;
        }
    };

    lib.cshDebug.listSnapshots = function () {
        try {
            return (lib.cshDebug._snapshots || []).map(function (s) {
                return { id: s.id, timestamp: s.timestamp, label: s.label, player: s.state && s.state.player };
            });
        } catch (e) {
            return [];
        }
    };

    lib.cshDebug.getSnapshot = function (id) {
        try {
            var arr = lib.cshDebug._snapshots || [];
            for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
            return null;
        } catch (e) {
            return null;
        }
    };

    lib.cshDebug.deleteSnapshot = function (id) {
        try {
            lib.cshDebug._snapshots = (lib.cshDebug._snapshots || []).filter(function (s) {
                return s.id !== id;
            });
        } catch (e) {
            lib.cshDebug._snapshots = [];
        }
    };

    lib.cshDebug.diffSnapshots = function (idA, idB) {
        var a = lib.cshDebug.getSnapshot(idA);
        var b = lib.cshDebug.getSnapshot(idB);
        if (!a || !b) return { error: "snapshot not found" };
        return lib.cshDebug._diffStates(a.state, b.state);
    };

    lib.cshDebug._diffStates = function (sa, sb) {
        var added = [];
        var removed = [];
        var changed = [];
        function path(p, k) {
            return p ? p + "." + k : k;
        }
        function walk(x, y, prefix) {
            if (x === y) return;
            var tx = typeof x;
            var ty = typeof y;
            if (x == null && y != null) {
                added.push({ path: prefix || "(root)", value: safeSerialize(y) });
                return;
            }
            if (y == null && x != null) {
                removed.push({ path: prefix || "(root)", value: safeSerialize(x) });
                return;
            }
            if (tx !== "object" || ty !== "object" || x === null || y === null) {
                if (safeStringify(x) !== safeStringify(y)) {
                    changed.push({ path: prefix || "(root)", from: safeSerialize(x), to: safeSerialize(y) });
                }
                return;
            }
            if (Array.isArray(x) || Array.isArray(y)) {
                if (safeStringify(x) !== safeStringify(y)) {
                    changed.push({ path: prefix || "(root)", from: safeSerialize(x), to: safeSerialize(y) });
                }
                return;
            }
            var keys = {};
            var k;
            for (k in x) if (Object.prototype.hasOwnProperty.call(x, k)) keys[k] = 1;
            for (k in y) if (Object.prototype.hasOwnProperty.call(y, k)) keys[k] = 1;
            for (k in keys) {
                if (!(k in x)) added.push({ path: path(prefix, k), value: safeSerialize(y[k]) });
                else if (!(k in y)) removed.push({ path: path(prefix, k), value: safeSerialize(x[k]) });
                else walk(x[k], y[k], path(prefix, k));
            }
        }
        try {
            walk(sa || {}, sb || {}, "");
        } catch (e) {
            return { error: "diff failed", added: added, removed: removed, changed: changed };
        }
        return { added: added, removed: removed, changed: changed };
    };

    lib.cshDebug.KNOWN_LIMITS = [
        "Action Tracker 无法可靠确认后续 Event 是否完成（多为 status=submitted）。",
        "Storage Tracker 无法捕获所有直接赋值；轮询有间隔；reason 常为 unknown/poll。",
        "Event Tracker 仅追踪白名单事件，且依赖 GameEvent.prototype.trigger。",
        "filter 是否通过、content 是否执行完毕：当前无法可靠判定（unknown）。",
        "safeSerialize 非零触碰，可能触发对象 getter（有 try 保护）。",
        "Assertion 不自动修复；部分规则无法可靠判断时不报警。",
    ];

    lib.cshDebug.generateBugReport = function (player, opts) {
        opts = opts || {};
        var lines = [];
        function L(s) {
            lines.push(s == null ? "" : String(s));
        }
        try {
            L("====================");
            L("池子魔将 Debug Report");
            L("====================");
            L("");
            var ver = "unknown";
            try {
                ver = (lib.version || lib.VERSION || (lib.config && lib.config.version) || "unknown") + "";
            } catch (e) {}
            L("无名杀版本：" + ver);
            var mode = "unknown";
            try {
                mode = (get && get.mode && get.mode()) || (lib.config && lib.config.mode) || "unknown";
            } catch (e) {}
            L("游戏模式：" + mode);
            var online = "单机";
            try {
                if ((typeof _status !== "undefined" && _status.connectMode) || (game && game.online)) online = "联机";
            } catch (e) {}
            L("单机/联机：" + online);
            L("时间：" + new Date().toISOString());
            L("Debug Core：" + (lib.cshDebug.version || ""));
            L("");
            var st = null;
            try {
                st = player ? lib.cshDebug.inspectPlayer(player) : null;
            } catch (e) {}
            L("当前玩家：" + (st && st.player ? st.player : "unknown"));
            L("武将：" + (st ? [st.name, st.name1, st.name2].filter(Boolean).join(" / ") : "unknown"));
            L("");
            L("HP：" + (st && st.hp != null ? st.hp : "unknown"));
            L("MaxHP：" + (st && st.maxHp != null ? st.maxHp : "unknown"));
            L("护甲：" + (st && st.hujia != null ? st.hujia : "unknown"));
            L("身份/势力：" + (st ? (st.identity || "?") + " / " + (st.group || "?") : "unknown"));
            L("横置/翻面：" + (st ? st.linked + " / " + st.turnedOver : "unknown"));
            L("");
            L("技能：" + (st && st.skills ? st.skills.join(", ") : "unknown"));
            L("临时技能：" + (st && st.skillsTemp && st.skillsTemp.length ? st.skillsTemp.join(", ") : "(无或无法可靠获取)"));
            L("手牌数：" + (st && st.handCount != null ? st.handCount : "unknown"));
            L("装备：" + (st ? safeStringify(st.equips) : "unknown"));
            L("判定区：" + (st ? safeStringify(st.judges) : "unknown"));
            L("");
            L("Storage：");
            L(st ? safeStringify(st.storage) : "unknown");
            L("");
            L("最近 Debug Action（注意 status 多为 submitted，非 completed）：");
            (lib.cshDebug.getActions(20) || []).forEach(function (a, i) {
                L(
                    "  [" +
                        i +
                        "] " +
                        a.timestamp +
                        " action=" +
                        a.action +
                        " status=" +
                        a.status +
                        " target=" +
                        a.target +
                        (a.error ? " error=" + a.error : "")
                );
            });
            L("");
            L("最近 Event（若未开启 Tracker 则可能为空；仅白名单）：");
            L("  tracking=" + !!lib.cshDebug._eventTrackingOn + " available=" + lib.cshDebug._eventTrackerAvailable);
            (lib.cshDebug.getEvents(30) || []).forEach(function (e, i) {
                L("  [" + i + "] " + e.timestamp + " name=" + e.name + " player=" + e.player + " skill=" + e.skill + " (trigger observed)");
            });
            L("");
            L("最近 Storage Changes：");
            (lib.cshDebug.getStorageChanges(20) || []).forEach(function (c, i) {
                L("  [" + i + "] " + c.timestamp + " player=" + c.player + " key=" + c.key + " reason=" + c.reason);
                L("       old=" + safeStringify(c.oldValue) + " new=" + safeStringify(c.newValue));
            });
            L("");
            L("Skill 抽检（filter/content 执行态为 unknown）：");
            try {
                var sample = (st && st.skills && st.skills[0]) || opts.skillId || null;
                if (sample) {
                    var si = lib.cshDebug.inspectSkill(sample, player);
                    L("  id=" + si.id + " name=" + si.name + " exists=" + si.exists + " owned=" + si.owned);
                    L("  trigger=" + safeStringify(si.trigger));
                    L("  filter=" + safeStringify(si.filter) + " | filter result: unknown");
                    L("  content=" + safeStringify(si.content) + " | content status: unknown");
                    L("  group=" + safeStringify(si.group));
                    L("  subSkill=" + safeStringify(si.subSkill));
                    L("  ai=" + safeStringify(si.ai));
                    L("  recentTriggerCount=" + safeStringify(si.recentTriggerCount));
                } else {
                    L("  (无技能可抽检)");
                }
            } catch (eSk) {
                L("  skill inspect failed");
            }
            L("");
            L("最近 Error：");
            (lib.cshDebug.getErrors(15) || []).forEach(function (e, i) {
                L("  [" + i + "] " + e.timestamp + " " + e.category + " " + e.message);
            });
            L("");
            L("Assertion：");
            try {
                var ar = player ? lib.cshDebug.runAssertions(player) : [];
                ar.forEach(function (r, i) {
                    L(
                        "  [" +
                            i +
                            "] ok=" +
                            r.ok +
                            " assertion=" +
                            r.assertion +
                            " detail=" +
                            safeStringify(r.detail)
                    );
                });
            } catch (eA) {
                L("  assertion failed to run");
            }
            L("");
            L("Snapshot Diff：");
            if (opts.snapA && opts.snapB) {
                L(safeStringify(lib.cshDebug.diffSnapshots(opts.snapA, opts.snapB)));
            } else {
                var snaps = lib.cshDebug.listSnapshots();
                if (snaps.length >= 2) {
                    var sA = snaps[snaps.length - 2].id;
                    var sB = snaps[snaps.length - 1].id;
                    L("  (自动比较最近两次 " + sA + " → " + sB + ")");
                    L(safeStringify(lib.cshDebug.diffSnapshots(sA, sB)));
                } else {
                    L("  (快照不足 2 个，跳过)");
                }
            }
            L("");
            L("已知技术限制：");
            (lib.cshDebug.KNOWN_LIMITS || []).forEach(function (t, i) {
                L("  " + (i + 1) + ". " + t);
            });
            L("");
            L("==================== END ====================");
        } catch (e) {
            L("generateBugReport failed: " + ((e && e.message) || e));
        }
        return lines.join("\n");
    };

    lib.cshDebug.copyText = function (txt, onOk, onFail) {
        txt = txt == null ? "" : String(txt);
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(txt).then(
                    function () {
                        if (onOk) onOk();
                    },
                    function () {
                        lib.cshDebug._fallbackCopy(txt, onOk, onFail);
                    }
                );
                return;
            }
        } catch (e) {}
        lib.cshDebug._fallbackCopy(txt, onOk, onFail);
    };

    lib.cshDebug._fallbackCopy = function (txt, onOk, onFail) {
        try {
            var ta = document.createElement("textarea");
            ta.value = txt;
            ta.style.cssText = "position:fixed;left:0;top:0;width:90%;height:60%;z-index:1000002;opacity:0.95;";
            /* 【2026-09-30 第六轮】原先挂 document.body —— 引擎在手机端给 body 加
               transform:scale(0.4)，body 因而自成层叠上下文，ta 被囚在 body 内，
               无论 z-index 写多大都压在挂 documentElement 的 #csh-dbg-overlay(1000001) 之下：
               即「复制失败 → 提示手动复制」的文本框反而被调试面板盖住、根本看不见。
               挂 documentElement 与面板同级，z-index 1000002 才能真正压在其上。 */
            var taHost = document.documentElement || document.body;
            taHost.appendChild(ta);
            ta.focus();
            ta.select();
            var ok = false;
            try {
                ok = document.execCommand("copy");
            } catch (e2) {}
            if (ok) {
                try {
                    taHost.removeChild(ta);
                } catch (e3) {}
                if (onOk) onOk();
            } else {
                // 留在页面上手动复制
                if (onFail) onFail(ta);
            }
        } catch (e) {
            try {
                console.log(txt);
            } catch (e4) {}
            if (onFail) onFail(null);
        }
    };

    lib.cshDebug.version = "2.0-phase4";


        lib.cshDebug.info("Debug Core initialized", { maxLog: MAX_LOG, maxError: MAX_ERR, phase: 3 });
    } catch (e) {}
})();

// ========== 池子调试 UI（既有菜单，Phase 2 仅轻量接入 Core）==========
    (function () {
        if (lib.__csh_debug_menu_inited) return;
        lib.__csh_debug_menu_inited = true;
        var CFG_KEY = "extension_池子魔将_csh_debug_menu";
        var TAB = "res";

        function isEnabled() {
            // clear:true 的配置项不一定写入 lib.config；仅当明确为 false 时关闭
            try {
                if (!lib.config) return true;
                if (lib.config[CFG_KEY] === false) return false;
                return true;
            } catch (e) { return true; }
        }
        function canShow() {
            try {
                if (typeof _status !== "undefined" && (_status.video || _status.connectMode)) return false;
                if (typeof game !== "undefined" && game.online) return false;
                if (typeof get !== "undefined" && get.is && typeof get.is.online === "function" && get.is.online()) return false;
            } catch (e) {}
            return isEnabled();
        }
        /* 音效（§4.7.1 统一总线）。拿不到总线就静默：音效永远不是功能依赖。 */
        function sfx(name, opt) {
            try {
                var S = lib.cshSfx || (typeof window !== "undefined" ? window.CSH_SFX : null);
                if (S && typeof S.play === "function") S.play(name, opt);
            } catch (e) {}
        }
        function toast(msg, key) {
            msg = String(msg == null ? "" : msg);            /* 自绘顶层提示：面板关掉、遮罩盖住时也仍然可见。
                带 key 时复用同键元素（不堆叠）——彩蛋连点提示逐条累积太吵，2026-09-28 改单条刷新。 */
            try {
                ensureToastStyle();
                var host = ensureToastHost();
                var item = null;
                if (key) {
                    for (var iT = 0; iT < host.children.length; iT++) {
                        if (host.children[iT].__cshKey === key) { item = host.children[iT]; break; }
                    }
                }
                if (!item) {
                    item = document.createElement("div");
                    item.className = "csh-dbg-toast";
                    host.appendChild(item);
                    if (key) item.__cshKey = key;
                }
                item.textContent = msg;
                while (host.children.length > 4) host.removeChild(host.firstChild);
                if (item.__t1) clearTimeout(item.__t1);
                if (item.__t2) clearTimeout(item.__t2);
                /* 重放入场动画（复用元素时动画已播过，需强制重启动） */
                item.className = "csh-dbg-toast";
                try { item.style.animation = "none"; void item.offsetWidth; item.style.animation = ""; } catch (eAni) {}
                item.__t1 = setTimeout(function () { item.className = "csh-dbg-toast out"; }, 2000);
                item.__t2 = setTimeout(function () { if (item.parentNode) item.parentNode.removeChild(item); }, 2500);
                return;
            } catch (eSelf) {}
            try {
                if (ui && ui.create && typeof ui.create.toast === "function") {
                    ui.create.toast(msg);
                    return;
                }
            } catch (e) {}
            try { alert(msg); } catch (e2) {}
        }
        function safeStr(x) {
            try {
                if (x == null) return "";
                if (typeof x === "string") return x.replace(/<[^>]+>/g, "").trim();
                if (typeof x === "number" || typeof x === "boolean") return String(x);
                if (typeof x === "object") {
                    if (x.nodeType) return String(x.textContent || "").trim();
                    if (typeof x.name === "string") return safeStr(x.name);
                }
                return "";
            } catch (e) { return ""; }
        }
        function tr(x) {
            try {
                if (x == null) return "";
                if (typeof x === "string") {
                    var t = (lib.translate && lib.translate[x]) || "";
                    if (typeof t === "string" && t) return safeStr(t) || x;
                    try {
                        var g = get.translation(x);
                        if (typeof g === "string" && g) return safeStr(g) || x;
                    } catch (e0) {}
                    return x;
                }
                if (typeof x === "object") {
                    var key = x.name || x.name1 || "";
                    if (typeof key === "string" && key) return tr(key) || key;
                }
                return safeStr(x) || "?";
            } catch (e) { return "?"; }
        }
        function me() {
            try {
                var p = game && game.me;
                if (p && (p.name || p.name1)) return p;
                // 无 me 时兜底场上第一名存活角色（方便单机旁观/部分壳）
                var list = allPlayers();
                return list.length ? list[0] : null;
            } catch (e) { return null; }
        }
        function needMe() {
            var p = me();
            if (!p) {
                toast("请先进入对局后再使用修改功能");
                return null;
            }
            try {
                if (typeof p.isIn === "function" && !p.isIn()) {
                    toast("角色不在场");
                    return null;
                }
            } catch (e) {}
            return p;
        }
        function allPlayers() {
            try {
                return (game.players || []).filter(function (p) {
                    return p && (p.name || p.name1) && (!p.isIn || p.isIn());
                });
            } catch (e) { return []; }
        }

        /** 当前操作目标：优先面板选择，否则自己 */
        function resolveActTarget(state) {
            try {
                if (state && state.targetIdx != null && state.targetIdx !== "") {
                    var list = allPlayers();
                    var i = parseInt(state.targetIdx, 10);
                    if (!isNaN(i) && list[i]) return list[i];
                }
            } catch (e) {}
            return needMe();
        }
        /* 【2026-10-03 用户实机反馈】目标选择器：原生 <select> → chip 组（与皮肤选择器同款）。
           用户反馈「一打开池子调试就会弹下拉，属于多余步骤」：悬浮球开面板后，球所在位置
           常被资源页签顶部的这个 select 接管，紧接着的点击落在 select 上就弹系统弹层 ——
           原生 select 的系统弹层无法从代码侧拦截，唯有不用它（皮肤选择器 2026-09-30 已因
           「一点即弹全屏滚轮 + 紧贴关闭键易误触」改过一轮，同病同治）。
           名单 = 场上玩家（通常 2~8 人），chip 一行放得下；点选即生效，无系统弹层。 */
        function buildTargetSelect(state) {
            var row = document.createElement("div");
            row.className = "csh-dbg-row";
            var list = allPlayers();
            var meP = me();
            var def = 0;
            for (var i = 0; i < list.length; i++) {
                if (meP && list[i] === meP) def = i;
            }
            state.targetIdx = list.length ? String(def) : "";
            if (!list.length) {
                var only = document.createElement("div");
                only.className = "csh-dbg-chip on";
                only.textContent = "自己";
                row.appendChild(only);
                return row;
            }
            var chips = document.createElement("div");
            /* 不用 .csh-dbg-chips：它自带 margin-bottom，放进 .csh-dbg-row 会双倍间距 */
            chips.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;width:100%;min-width:0;";
            list.forEach(function (p, idx) {
                var nm = tr(p) || p.name || ("#" + idx);
                // 玩家本人只标一个「自己」，名字原样显示（与旧下拉一致）
                var ch = document.createElement("div");
                ch.className = "csh-dbg-chip" + (idx === def ? " on" : "");
                ch.textContent = (meP && p === meP) ? (nm + "（自己）") : nm;
                ch.addEventListener("click", function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    state.targetIdx = String(idx);
                    for (var c = 0; c < chips.children.length; c++) {
                        chips.children[c].className = "csh-dbg-chip" + (c === idx ? " on" : "");
                    }
                }, false);
                chips.appendChild(ch);
            });
            row.appendChild(chips);
            return row;
        }

        function playerLine(p) {
            if (!p) return "未入局 · 仅单机";
            return (tr(p) || p.name) + "  " + (p.hp != null ? p.hp : "?") + "/" + (p.maxHp != null ? p.maxHp : "?") + "  甲" + (p.hujia || 0) + " · 仅单机";
        }
        /* ==================== 无名杀本体 BGM 让位（2026-09-30） ====================
           用户反馈：「打开池子休闲的时候，无名杀自带的背景音乐仍然在响」。
           无名杀的音乐是 ui.backgroundMusic（HTMLAudioElement，game.playBackgroundMusic()
           只负责给它设 src），与池子的 csh_bgm 是**两条完全独立的音源** ——
           池子休闲有自己的配乐，两者同响就是叠播。
           原则（用户明确要求）：**无名杀主体的归无名杀，池子休闲是额外附带的功能**。
           所以：进入池子休闲功能域时暂停本体音乐，离开时还原 ——
           且只还原「这一次是我们暂停的」（hostMusicPaused），不去动玩家自己关掉的情况。 */
        var hostMusicPaused = false;
        function pauseHostMusic() {
            try {
                var m = ui && ui.backgroundMusic;
                if (m && !m.paused) { hostMusicPaused = true; m.pause(); }
            } catch (eHm) {}
        }
        function resumeHostMusic() {
            try {
                var m = ui && ui.backgroundMusic;
                if (hostMusicPaused && m && m.src) {
                    var pr = m.play();
                    if (pr && pr.catch) pr.catch(function () {});   /* 自动播放策略可能拒绝，忽略 */
                }
            } catch (eHm2) {}
            hostMusicPaused = false;
        }

        function closePanel() {
            try { console.log("[池子调试] closePanel"); } catch (e0) {}
            /* 面板关闭 → 池子配乐停、无名杀本体音乐还原（2026-09-30） */
            try { if (lib.cshBgm) lib.cshBgm.stop(); } catch (eBgm) {}
            resumeHostMusic();
            /* 【2026-10-02 生命周期修复 ①】停掉 Storage 轮询。
               此前只有「追踪」页的手动关停按钮能停它：一旦开过，关面板 / 换局 /
               重开新局都继续每 1.5s 对每个玩家做 snapshotStorage + diffStorage，
               安卓 WebView 上持续耗电抖动，_storageChanges 也一直在滚动写入。 */
            try { if (lib.cshDebug && lib.cshDebug.setStorageWatch) lib.cshDebug.setStorageWatch(false); } catch (eSw) {}
            /* 【2026-10-02 生命周期修复 ②】关闭卡牌检索器并摘掉它的 document 级 keydown。
               检索器把 onKey 挂在 document 上、只在 closePick() 里摘；而直接点面板 ✕
               走的是 closePanel()，**不经过 closePick()** —— 于是监听器 + 整棵卡片 DOM
               （最多 150 张卡）被闭包永久持有，每开一次多泄漏一份，之后每次 Esc 都会
               依次执行 N 个僵尸 handler。这里统一走它自己的关闭入口。 */
            try {
                var pick = document.getElementById("csh-pick-ov");
                if (pick && typeof pick.__close === "function") pick.__close();
            } catch (ePick) {}
            var el = document.getElementById("csh-dbg-overlay");
            if (el && el.parentNode) el.parentNode.removeChild(el);
            try {
                if (typeof _status !== "undefined") {
                    _status.cshDebugPanel = null;
                }
            } catch (e1) {}
        }
        /** 引擎把 document.body 整体缩放（素版 transform:scale(documentZoom)，
         *  十周年UI 走 body.style.zoom）；而面板与悬浮球挂在 documentElement 上，
         *  **不参与 body 的缩放**，所以必须用真实 CSS 像素布局。
         *  历史 bug：这里曾按 documentZoom 乘 --csh-z，导致手机端（deviceZoom≈0.4）
         *  悬浮球缩成 16px 点不中、面板只剩四成且文字发虚，PC 端（deviceZoom 可达 2）
         *  面板又溢出屏幕。故 --csh-z 恒为 1，尺寸一律交给 clamp()/vw 处理。 */
        function uiScale() {
            return 1;
        }
        function syncUiScale() {
            try {
                var root = document.documentElement;
                if (root && root.style && root.style.setProperty) {
                    root.style.setProperty("--csh-z", "1");
                }
            } catch (e) {}
        }
        function bindZoomSync() {
            if (lib.__csh_dbg_zoomsync) return;
            lib.__csh_dbg_zoomsync = true;
            try {
                window.addEventListener("resize", syncUiScale, true);
            } catch (e0) {}
            try {
                if (lib.onresize && typeof lib.onresize.push === "function") {
                    lib.onresize.push(function () { syncUiScale(); });
                }
            } catch (e1) {}
        }
        /** 面板与悬浮球的挂载宿主：必须是 body 之外，否则被 body 的 scale 二次缩放 */
        function uiHost() {
            return document.documentElement || document.body;
        }
        /* ---------- 顶层提示条 ----------
         * 引擎自带的 ui.create.toast 层很低，关掉调试面板后提示就跟着被盖住，
         * 所以这里自绘一条挂在 documentElement 上的提示层（z-index 高于面板与遮罩）。 */
        var TOAST_HOST_ID = "csh-dbg-toast-host";
        var TOAST_CSS_ID = "csh-dbg-toast-css";
        function ensureToastStyle() {
            if (document.getElementById(TOAST_CSS_ID)) return;
            var st = document.createElement("style");
            st.id = TOAST_CSS_ID;
            st.textContent = [
                "@keyframes cshDbgToastIn{from{opacity:0;transform:translateY(-10px);}to{opacity:1;transform:translateY(0);}}",
                "#" + TOAST_HOST_ID + "{position:fixed!important;left:50%!important;top:11%!important;transform:translateX(-50%)!important;",
                "z-index:1000090!important;display:flex!important;flex-direction:column!important;align-items:center!important;gap:8px!important;",
                "pointer-events:none!important;width:max-content!important;max-width:86%!important;",
                "font-family:system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif!important;}",
                "#" + TOAST_HOST_ID + " .csh-dbg-toast{position:static!important;display:block!important;box-sizing:border-box!important;",
                "padding:11px 20px!important;border-radius:12px!important;font-size:13.5px!important;font-weight:500!important;letter-spacing:.01em!important;",
                "color:var(--csh-bg)!important;text-align:center!important;white-space:normal!important;word-break:break-word!important;",
                "background:var(--csh-fg)!important;",
                "border:1px solid rgba(var(--csh-bg-rgb),.10)!important;",
                "box-shadow:inset 3px 0 0 var(--csh-accent),0 2px 6px rgba(var(--csh-bg-rgb),.06),0 16px 40px -16px rgba(var(--csh-bg-rgb),.28)!important;",
                "animation:cshDbgToastIn .2s cubic-bezier(.22,.61,.36,1)!important;transition:opacity .45s ease,transform .45s ease!important;}",
                "#" + TOAST_HOST_ID + " .csh-dbg-toast.out{opacity:0!important;transform:translateY(-8px)!important;}",
            ].join("");
            (document.head || document.documentElement).appendChild(st);
        }
        function ensureToastHost() {
            var el = document.getElementById(TOAST_HOST_ID);
            if (el && el.parentNode) return el;
            el = document.createElement("div");
            el.id = TOAST_HOST_ID;
            uiHost().appendChild(el);
            return el;
        }
        function ensureStyle() {
            var old = document.getElementById("csh-dbg-css3");
            if (old) old.parentNode.removeChild(old);
            syncUiScale();
            bindZoomSync();
            var st = document.createElement("style");
            st.id = "csh-dbg-css3";
            st.textContent = [
                /* ---------- 动效 ---------- */
                "@keyframes cshDbgFade{from{opacity:0;}to{opacity:1;}}",
                "@keyframes cshDbgRise{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}",
                "@keyframes cshDbgBreath{0%,100%{filter:brightness(1);}50%{filter:brightness(1.14);}}",
                /* ---------- 遮罩：全屏铺满（§E.1） ----------
                 * inset:0 + var(--csh-paper)，**不加模糊**（手机 GPU 吃不住，且模糊对纯色底无收益） */
                "#csh-dbg-overlay{position:fixed!important;left:0!important;top:0!important;right:0!important;bottom:0!important;",
                "width:100%!important;height:100%!important;height:100dvh!important;z-index:1000001!important;",
                "display:block!important;pointer-events:auto!important;box-sizing:border-box!important;",
                "background:var(--csh-paper)!important;",
                "font-family:system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif!important;animation:cshDbgFade .18s ease-out!important;",
                /* 字体渲染（2026-09-29 用户反馈「字体有点散光」）：Windows 下默认次像素渲染
                   在浅底细体上会出现彩色边缘（俗称散光/彩边）。统一灰度抗锯齿 +
                   优化字距，中英文笔画都更干净。 */
                "-webkit-font-smoothing:antialiased!important;-moz-osx-font-smoothing:grayscale!important;",
                "text-rendering:optimizeLegibility!important;}",
                /* ---------- 面板：全屏沉浸（§E.1）
                 * 「相当于跳转到一个新程序」：容器铺满、无圆角、无最大宽高。
                 * 内部用 flex 三段：头（固定） / 主体（滚动） / 页签容器（手机在底部）。 */
                "#csh-dbg-panel{position:relative!important;display:flex!important;flex-direction:column!important;",
                "box-sizing:border-box!important;margin:0!important;padding:0!important;",
                "width:100%!important;height:100%!important;height:100dvh!important;max-width:none!important;max-height:none!important;",
                "border-radius:0!important;overflow:hidden!important;",
                "padding-top:env(safe-area-inset-top,0px)!important;",
                "padding-bottom:env(safe-area-inset-bottom,0px)!important;",
                "padding-left:env(safe-area-inset-left,0px)!important;",
                "padding-right:env(safe-area-inset-right,0px)!important;",
                "color:var(--csh-bg)!important;background:var(--csh-paper)!important;",
                "border:none!important;box-shadow:none!important;",
                "animation:cshDbgPanelIn .18s cubic-bezier(.2,.8,.2,1)!important;pointer-events:auto!important;}",
                "@keyframes cshDbgPanelIn{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}",
                "#csh-dbg-panel::-webkit-scrollbar{width:10px;}",
                "#csh-dbg-panel::-webkit-scrollbar-track{background:transparent!important;}",
                "#csh-dbg-panel::-webkit-scrollbar-thumb{background:rgba(var(--csh-bg-rgb),.16)!important;border-radius:999px!important;border:3px solid transparent!important;background-clip:content-box!important;}",
                "#csh-dbg-panel::-webkit-scrollbar-thumb:hover{background:rgba(var(--csh-bg-rgb),.30)!important;background-clip:content-box!important;}",
                "#csh-dbg-panel *{box-sizing:border-box!important;pointer-events:auto!important;}",
                /* 引擎全局 div{position:absolute;display:inline-block} 必须显式复位 */
                /* 注意：不要把这个复位清单扩大到 #csh-dbg-overlay / #csh-dbg-panel / #csh-dbg-head /
                   #csh-dbg-main / #csh-dbg-tabs / #csh-dbg-body —— 它们的 position 是刻意设置的
                   （fixed / relative / flex 布局），一旦被 static!important 覆盖，全屏面板会当场塌掉。
                   这张表只放「纯内容容器」。 */
                "#csh-dbg-title,#csh-dbg-sub,#csh-dbg-close,#csh-dbg-skill-list,#csh-dbg-head .csh-dbg-head-main,.csh-dbg-tab,.csh-dbg-btn,.csh-dbg-grid,.csh-dbg-hint,.csh-dbg-row,.csh-dbg-tool,.csh-dbg-count,.csh-dbg-sk,.csh-dbg-sk-info,.csh-dbg-sk-acts,.csh-dbg-gamelist,.csh-dbg-gamebtn,.gb-top,.gb-name,.gb-desc,.csh-dbg-detail,.csh-dbg-dt-tags,.csh-dbg-dt-entries,.csh-dbg-preset,.ps-main,.ps-acts,.csh-dbg-psfb,.csh-dbg-json,.csh-dbg-grp,.csh-dbg-ch,.csh-dbg-ch-skills{position:static!important;}",
                /* ---------- 头部：固定 56px（§E.1），不随内容滚动 ---------- */
                "#csh-dbg-head{display:flex!important;flex-wrap:wrap!important;align-items:center!important;gap:10px!important;",
                "flex:0 0 auto!important;min-height:56px!important;padding:8px 14px!important;",
                "background:var(--csh-paper)!important;",
                "border-bottom:1px solid rgba(var(--csh-bg-rgb),.10)!important;",
                "position:relative!important;z-index:3!important;}",
                "#csh-dbg-head .csh-dbg-head-main{flex:1 1 auto!important;min-width:0!important;display:block!important;}",
                /* ---------- 标题：字重 600 + 轻微负字距（现代紧凑，不用宽字距复古排印） ---------- */
                "#csh-dbg-title{display:flex!important;align-items:center!important;gap:9px!important;text-align:left!important;font-size:16px!important;font-weight:600!important;letter-spacing:-.01em!important;",
                "line-height:1.3!important;margin:0!important;padding:0!important;",
                "font-family:system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif!important;",
                "color:var(--csh-bg)!important;-webkit-text-fill-color:var(--csh-bg)!important;background:none!important;",
                "-webkit-text-stroke:0!important;text-shadow:none!important;}",
                /* ---------- 品牌标：墨底 + CBY 黄内方块的几何母题（与标题 chip 同一套「墨底黄」语言）。
                   纯色无渐变——包豪斯不用渐变，渐变是廉价的「加深度」手段；
                   圆角走分级白名单的 8px；伪元素不增 DOM，故面板几何断言不受影响。 ---------- */
                "#csh-dbg-title::before{content:''!important;flex:0 0 auto!important;width:20px!important;height:20px!important;border-radius:8px!important;",
                "background:var(--csh-bg)!important;box-shadow:inset 0 0 0 6px var(--csh-accent)!important;}",
                /* ---------- 状态行：单行省略，避免撑高头部 ---------- */
                /* 左缩进 = 品牌标宽 20 + 间距 9：状态行必须与标题**文字**对齐，
                   否则标题被标推右、状态行贴边，左缘参差（放大 6 倍才看得出的低级错位）。 */
                "#csh-dbg-sub{display:block!important;position:static!important;text-align:left!important;font-size:12px!important;color:var(--csh-gray)!important;",
                "letter-spacing:.01em!important;margin:3px 0 0!important;padding:0 0 0 29px!important;",
                "overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;}",
                "#csh-dbg-sub::after{content:none!important;}",
                /* 关闭键：44×44（§E.1 触摸热区） */
                /* 皮肤切换（2026-09-29 第四轮）：真机反馈「白色太耀眼 / 不够护眼 / 字晕」。
                   真值在 core/csh_theme.js 的 SKINS；这里只做选择器，切的是 :root 上的
                   --csh-* 变量（CSS 变量惰性解析，下一次绘制即生效，无需重建 DOM）。 */
                /* ---------- 皮肤切换（2026-09-30 第六轮 · 用户实测「每次弹窗选皮肤」）----------
                   原来是原生 <select>：手机上一点即弹**全屏滚轮**（被用户称为「弹窗」），
                   且它 150px 宽、紧贴关闭键左侧，瞄准 ✕ 时偏左就会误触。
                   改为「紧凑按钮 + 行内 chip 组」：点按钮在头部**下方换行**展开一行皮肤 chip
                   （flex-wrap + position:static，无系统弹层、无绝对定位风险），点 chip 直接生效；
                   按钮只显示当前皮肤的短名 + ▾，宽度收窄到 96px，远离误触。 */
                "#csh-dbg-skin{flex:0 0 auto!important;height:44px!important;max-width:120px!important;padding:0 10px!important;",
                "border-radius:10px!important;font-size:12px!important;font-family:inherit!important;cursor:pointer!important;",
                "white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;",
                "color:var(--csh-bg)!important;background:var(--csh-fg)!important;",
                "border:1px solid rgba(var(--csh-bg-rgb),.18)!important;",
                "-webkit-appearance:none!important;appearance:none!important;",
                "transition:border-color .16s ease,background .16s ease!important;}",
                "#csh-dbg-skin:hover{border-color:rgba(var(--csh-bg-rgb),.34)!important;background:var(--csh-paper2)!important;}",
                /* 皮肤 chip 行：默认隐藏，点按钮展开；basis:100% 让它换到头部第二行 */
                "#csh-dbg-skin-row{flex:0 0 100%!important;display:none!important;flex-wrap:wrap!important;gap:6px!important;",
                "width:100%!important;margin:2px 0 0!important;padding:0!important;position:static!important;box-sizing:border-box!important;}",
                "#csh-dbg-skin-row.open{display:flex!important;}",
                "#csh-dbg-close{flex:0 0 auto!important;display:flex!important;align-items:center!important;justify-content:center!important;",
                "width:44px!important;height:44px!important;min-width:44px!important;padding:0!important;border-radius:10px!important;",
                "cursor:pointer!important;font-size:0!important;",
                "color:var(--csh-bg)!important;background:var(--csh-fg)!important;",
                "border:1px solid rgba(var(--csh-bg-rgb),.12)!important;box-shadow:0 1px 1px rgba(var(--csh-bg-rgb),.03)!important;",
                "transition:border-color .16s ease,background .16s ease,color .16s ease,transform .16s ease!important;}",
                "#csh-dbg-close::before{content:'\\2715'!important;font-size:15px!important;line-height:1!important;letter-spacing:0!important;}",
                "#csh-dbg-close:hover{border-color:rgba(var(--csh-bg-rgb),.22)!important;background:var(--csh-paper2)!important;color:var(--csh-bg)!important;transform:rotate(90deg)!important;}",
                /* ---------- 主区：两栏（桌面） / 单栏（手机） ---------- */
                "#csh-dbg-main{display:flex!important;flex-direction:column!important;flex:1 1 auto!important;min-height:0!important;position:static!important;}",
                /* 页签容器：手机放底部（拇指热区，§E.1）
                   flex-flow 而非 grid：页签数会随功能增长（现 12 个），写死列数必然被挤爆。
                   宽度不足时按 min-width 自动折行，永不溢出。 */
                /* 【2026-10-03 重做 · 所见即所得】手机端页签条**全部可见、不再横滚**。
                   旧实现是 flex-flow:row nowrap + overflow-x:auto（一条 56px 高的横滚底栏）：
                   12 枚页签 × min-width 70px ≈ 870px，而手机首屏只有 360~430px ——
                   玩家一次只看得见 4~5 枚，其余要横向滑动才知道存在；
                   正因为如此，「池子休闲」当年才被迫从最后提到首位（见 tabDefs 注释）。
                   用户要的是所见即所得：**打开面板就该看见全部页签**。
                   现在改成 `repeat(auto-fit, minmax(56px, 1fr))` 的网格：
                     · 360px 宽 → 6 列 × 2 行（12 枚两行排完，条高约 96px，仍远小于原来折 3~4 行）
                     · 430px 宽 → 7 列 × 2 行
                     · 平板横屏（≤900px 档）→ 更多列，一行排完
                   每个页签不再设 min-width（由网格均分），两字标签在任何列宽下都不会折行。
                   代价只是条高从 56px 变成 ~96px：换来"没有隐藏页签"，
                   这比省 40px 高度重要 —— 看不见的入口等于没有入口。 */
                "#csh-dbg-tabs{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(56px,1fr))!important;",
                "position:static!important;",
                "gap:6px!important;",
                "flex:0 0 auto!important;order:2!important;margin:0!important;padding:8px 10px calc(8px + env(safe-area-inset-bottom,0px))!important;",
                "background:var(--csh-paper)!important;",
                "border-top:1px solid rgba(var(--csh-bg-rgb),.09)!important;position:relative!important;z-index:3!important;",
                "max-height:none!important;overflow:visible!important;}",
                ".csh-dbg-tab{display:flex!important;align-items:center!important;justify-content:center!important;cursor:pointer!important;",
                "min-width:0!important;width:100%!important;",
                "min-height:40px!important;padding:6px 4px!important;border-radius:999px!important;font-size:13px!important;white-space:nowrap!important;",
                "letter-spacing:.5px!important;color:var(--csh-bg)!important;background:transparent!important;border:1px solid transparent!important;user-select:none!important;",
                "transition:color .18s ease,background .18s ease,border-color .18s ease!important;}",
                ".csh-dbg-tab:hover{color:var(--csh-bg)!important;background:rgba(var(--csh-bg-rgb),.055)!important;}",
                ".csh-dbg-tab.on{color:var(--csh-accent-ink)!important;font-weight:600!important;border-color:transparent!important;",
                "background:var(--csh-accent)!important;box-shadow:none!important;}",
                /* 池子休闲页签：信息蓝＝「游戏区」语义（与内容页签的 CBY 黄区分）。
                   手机档它是网格里的一枚普通格子（width:100% 跟随网格列宽）；
                   桌面档（≥901px）在下面的媒体查询里按左导航整行块排到最后。 */
                ".csh-dbg-tab.game{width:100%!important;color:var(--csh-blue)!important;border-color:transparent!important;background:rgba(var(--csh-blue-rgb),.10)!important;font-weight:500!important;border-radius:8px!important;}",
                ".csh-dbg-tab.game:hover{color:var(--csh-blue)!important;background:rgba(var(--csh-blue-rgb),.17)!important;border-color:transparent!important;}",
                ".csh-dbg-tab.game.on{color:var(--csh-color-ink)!important;font-weight:600!important;border-color:transparent!important;",
                "background:var(--csh-blue)!important;box-shadow:0 1px 2px rgba(var(--csh-blue-rgb),.35)!important;}",
                /* 内容区：独立滚动（§E.1 主体独立滚动 + overscroll-behavior:contain） */
                "#csh-dbg-body{display:block!important;flex:1 1 auto!important;min-height:0!important;width:100%!important;position:static!important;",
                "order:1!important;overflow-y:auto!important;overflow-x:hidden!important;",
                "-webkit-overflow-scrolling:touch!important;overscroll-behavior:contain!important;",
                /* 底部 26px 是死空间（下方页签条自身已带 8px 上边距，两者叠加成 34px 空白）→ 收到 10px */
                "padding:16px 16px 10px!important;margin:0!important;}",
                "#csh-dbg-body::-webkit-scrollbar{width:10px;}",
                "#csh-dbg-body::-webkit-scrollbar-thumb{background:rgba(var(--csh-bg-rgb),.16)!important;border-radius:999px!important;border:3px solid transparent!important;background-clip:content-box!important;}",
                "#csh-dbg-body::-webkit-scrollbar-thumb:hover{background:rgba(var(--csh-bg-rgb),.30)!important;background-clip:content-box!important;}",
                "#csh-dbg-body::-webkit-scrollbar-track{background:transparent!important;}",
                /* ============================================================
                   【2026-10-03 统一结构】PC 与安卓共用**一套**面板布局
                   ------------------------------------------------------------
                   此前这里是 `@media (min-width:901px){ … }`：宽屏切成
                   「左侧 168px 竖排导航 + 右侧内容」两栏，窄屏又是「底部横滚条」——
                   同一份 DOM 被两套完全不同的结构渲染，改一处必须记得同步另一处，
                   这正是用户反复说的「PC 和安卓分开搞」。已整块删除。
                   现在全尺寸共用一套结构（移动端应用壳的经典三段）：
                       头部（标题/皮肤/关闭，固定）
                       内容区（独立滚动，#csh-dbg-page 在宽屏居中、限宽 1080）
                       底部导航（换行网格，**全部页签始终可见**）
                   宽屏与窄屏的差别只剩「尺寸变量」：
                     · 导航网格列数由 minmax(56px,1fr) 自动决定
                       （360px→5 列 3 行；915px→一行排完；1280px→12 列一行）
                     · 内容外边距随宽度加大 —— 纯留白，不改结构
                   ============================================================ */
                /* 导航网格：所有尺寸共用（原先只在窄屏生效，宽屏被 flex 列覆盖） */
                ".csh-dbg-tab.on{box-shadow:0 1px 2px rgba(var(--csh-accent-rgb),.35)!important;}",
                /* 内容限宽居中：宽屏下正文不铺满 1900px（否则一行 200 字没法读） */
                "#csh-dbg-body>.csh-dbg-page{max-width:1080px!important;margin:0 auto!important;}",
                /* 宽屏只加留白，不动结构 */
                "@media (min-width:901px){#csh-dbg-body{padding:24px 28px 28px!important;}}",
                /* 超宽（>1440px）：内容区居中留白加大，不做三栏（§E.1） */
                "@media (min-width:1441px){#csh-dbg-body{padding:34px 56px 56px!important;}}",
                /* 手机：页签 5 列仍放得下（都是 2 字），只收紧字距与内边距 */
                "@media (max-width:430px){.csh-dbg-tab{font-size:12px!important;letter-spacing:0!important;padding:7px 2px!important;}}",
                /* ---------- 池子休闲：等大按钮网格（2026-10-03 重做） ----------
                   旧版是「一行一款」的卡片列表：名字在左、「开始」按钮在右，中间一片空白。
                   手机上一屏放不下（6 项 ≈ 600px+，要上下滑），桌面上也显得空。
                   现在每张卡**本身就是按钮**：整块可点、无独立「开始」、全部同尺寸。
                   auto-fill + minmax(230px,1fr)：列数由宽度自己算 ——
                   桌面 3~4 列、手机 1~2 列，一套规则两端成立（无需断点媒体查询）。 */
                ".csh-dbg-gamelist{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))!important;gap:12px!important;width:100%!important;align-items:stretch!important;}",
                "button.csh-dbg-gamebtn{display:flex!important;flex-direction:column!important;align-items:stretch!important;justify-content:space-between!important;gap:9px!important;",
                "min-height:92px!important;padding:14px 16px!important;border-radius:14px!important;cursor:pointer!important;text-align:left!important;font-family:inherit!important;",
                "background:var(--csh-fg)!important;border:1px solid rgba(var(--csh-bg-rgb),.10)!important;",
                "box-shadow:0 1px 2px rgba(var(--csh-bg-rgb),.04)!important;margin:0!important;",
                "transition:border-color .16s ease,background .16s ease,box-shadow .18s ease,transform .16s ease!important;}",
                "button.csh-dbg-gamebtn:hover{border-color:rgba(var(--csh-accent-rgb),.55)!important;background:var(--csh-paper2)!important;",
                "transform:translateY(-1px)!important;box-shadow:0 8px 20px -12px rgba(var(--csh-bg-rgb),.40)!important;}",
                "button.csh-dbg-gamebtn:active{transform:translateY(0)!important;}",
                "button.csh-dbg-gamebtn .gb-top{display:flex!important;align-items:center!important;gap:8px!important;width:100%!important;}",
                "button.csh-dbg-gamebtn .gb-name{flex:0 1 auto!important;font-size:15px!important;font-weight:600!important;color:var(--csh-bg)!important;line-height:1.3!important;",
                "white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;}",
                "button.csh-dbg-gamebtn .gb-tag{flex:0 0 auto!important;font-style:normal!important;font-size:10.5px!important;font-weight:600!important;letter-spacing:.06em!important;",
                "color:var(--csh-blue)!important;padding:1px 9px!important;border-radius:999px!important;background:rgba(var(--csh-blue-rgb),.10)!important;}",
                "button.csh-dbg-gamebtn .gb-desc{display:-webkit-box!important;-webkit-line-clamp:2!important;-webkit-box-orient:vertical!important;",
                "font-size:12px!important;line-height:1.55!important;color:var(--csh-gray)!important;overflow:hidden!important;}",
                /* 筹备中：虚线边 + 降透明度，与可玩按钮一眼区分 */
                "button.csh-dbg-gamebtn.locked{opacity:.5!important;border-style:dashed!important;background:var(--csh-light)!important;box-shadow:none!important;cursor:default!important;}",
                "button.csh-dbg-gamebtn.locked:hover{border-color:rgba(var(--csh-bg-rgb),.14)!important;transform:none!important;",
                "background:var(--csh-light)!important;box-shadow:none!important;}",
                /* ---------- 池子休闲标题：已删除（2026-10-03） ----------
                 * 内容区原来有一行居中的「池 子 休 闲」纯展示标题，和左侧页签上的同名文字重复，
                 * 用户反馈「两个池子休闲，一个位置不对，一个多余」⇒ 统一只留页签一处（导航即标题）。
                 * CDK 彩蛋仍在「池子休闲」页签上（见 tabDefs 处），与这行标题无关。 */
                /* ---------- CDK 兑换面板（唤起后才存在） ----------
                 * 【2026-09-28】z-index 10050 → 2147483000：旧值低于无名杀游戏 UI
                 * （牌堆/记牌器/对话层等普遍上万甚至几十万），对局中被压在下面；
                 * 现在与技能代码查看器同级（全局最高档），并加全屏暗幕变成真模态。 */
                "#csh-redeem-bg{position:fixed!important;left:0!important;top:0!important;width:100%!important;height:100%!important;",
                "z-index:2147482999!important;background:rgba(var(--csh-bg-deep-rgb),.52)!important;animation:cshDbgFade .18s ease-out!important;",
                "-webkit-backdrop-filter:blur(12px) saturate(130%)!important;backdrop-filter:blur(12px) saturate(130%)!important;}",
                "#csh-redeem{display:block!important;position:fixed!important;left:50%!important;top:50%!important;",
                "transform:translate(-50%,-50%)!important;z-index:2147483000!important;width:min(360px,86vw)!important;",
                /* 手机横屏：限高 + 卡内自滚，防整卡超出视口两头被裁（2026-09-30） */
                "max-height:calc(100dvh - 24px)!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;",
                "padding:24px 22px 20px!important;border-radius:16px!important;box-sizing:border-box!important;",
                "background:var(--csh-fg)!important;",
                "border:1px solid rgba(var(--csh-bg-rgb),.10)!important;box-shadow:0 2px 6px rgba(var(--csh-bg-rgb),.06),0 24px 56px -20px rgba(var(--csh-bg-rgb),.30)!important;",
                "animation:cshRdmIn .22s ease-out!important;}",
                "@keyframes cshRdmIn{0%{opacity:0;transform:translate(-50%,-46%) scale(.96);}100%{opacity:1;transform:translate(-50%,-50%) scale(1);}}",
                "#csh-redeem *{position:static!important;box-sizing:border-box!important;}",
                "#csh-redeem .csh-rdm-title{display:block!important;text-align:center!important;font-size:15px!important;",
                "font-weight:600!important;letter-spacing:.01em!important;color:var(--csh-bg)!important;margin-bottom:16px!important;}",
                "#csh-redeem .csh-rdm-inputwrap{display:block!important;position:relative!important;width:100%!important;}",
                "#csh-redeem .csh-rdm-mirror{position:absolute!important;left:0!important;top:0!important;right:0!important;bottom:0!important;",
                "pointer-events:none!important;overflow:hidden!important;border-radius:10px!important;",
                "background:var(--csh-light)!important;border:1px solid rgba(var(--csh-bg-rgb),.14)!important;",
                "transition:border-color .16s ease,box-shadow .16s ease,background .16s ease!important;}",
                "#csh-redeem .csh-rdm-mirror-in{padding:13px 12px!important;font-family:ui-monospace,'Cascadia Mono','SF Mono',Consolas,monospace!important;",
                "font-size:15px!important;letter-spacing:.09em!important;color:var(--csh-bg)!important;white-space:nowrap!important;",
                "overflow:hidden!important;line-height:1.2!important;}",
                "#csh-redeem .csh-rdm-mirror-in i.bad{font-style:normal!important;color:var(--csh-red)!important;background:rgba(var(--csh-red-rgb),.12)!important;}",
                "#csh-redeem .csh-rdm-inp{display:block!important;width:100%!important;padding:13px 12px!important;border-radius:10px!important;",
                "font-family:ui-monospace,'Cascadia Mono','SF Mono',Consolas,monospace!important;font-size:15px!important;letter-spacing:.09em!important;",
                "background:transparent!important;color:transparent!important;caret-color:var(--csh-bg)!important;",
                "border:1px solid transparent!important;outline:none!important;text-align:center!important;}",
                "#csh-redeem .csh-rdm-inp::placeholder{color:transparent!important;}",
                "#csh-redeem .csh-rdm-inputwrap:focus-within .csh-rdm-mirror{border-color:var(--csh-blue)!important;background:var(--csh-fg)!important;box-shadow:0 0 0 3px rgba(var(--csh-blue-rgb),.14)!important;}",
                "#csh-redeem .csh-rdm-msg{display:block!important;min-height:18px!important;margin-top:8px!important;",
                "font-size:12.5px!important;text-align:center!important;color:var(--csh-gray)!important;line-height:1.45!important;}",
                "#csh-redeem .csh-rdm-msg.ok{color:var(--csh-green)!important;}",
                "#csh-redeem .csh-rdm-msg.err{color:var(--csh-red)!important;}",
                /* 余额行（§4.5.7）：等宽数字，兑换后 300ms 滚动不跳动 */
                "#csh-redeem .csh-rdm-bal{display:block!important;margin-top:8px!important;text-align:center!important;",
                "font-size:13px!important;color:var(--csh-bg)!important;font-variant-numeric:tabular-nums!important;",
                "font-family:ui-monospace,'Cascadia Mono','SF Mono',Consolas,monospace!important;letter-spacing:.5px!important;}",
                "#csh-redeem .csh-rdm-row{display:flex!important;gap:10px!important;margin-top:12px!important;}",
                "#csh-redeem .csh-rdm-row .csh-dbg-btn{flex:1 1 0!important;min-height:44px!important;}",
                "#csh-redeem .csh-rdm-hist{display:block!important;margin-top:12px!important;}",
                "#csh-redeem .csh-rdm-sub{display:block!important;font-size:10.5px!important;color:var(--csh-gray-soft)!important;",
                "font-weight:600!important;letter-spacing:.09em!important;margin-bottom:7px!important;}",
                "#csh-redeem .csh-rdm-histrow{display:block!important;font-size:12px!important;color:var(--csh-gray)!important;",
                "font-variant-numeric:tabular-nums!important;padding:6px 0!important;border-bottom:1px solid rgba(var(--csh-bg-rgb),.06)!important;}",
                "#csh-redeem .csh-rdm-histrow:last-child{border-bottom:none!important;}",
                /* 手机短视口/窄屏：兑换框紧凑化 + 收窄码字字号——
                   30+ 字符长码在 15px 宽字距下超出输入框宽度，尾部永远看不见（2026-09-30 手机反馈） */
                "@media (max-width:480px),(max-height:600px){",
                "#csh-redeem{padding:16px 16px 14px!important;}",
                "#csh-redeem .csh-rdm-title{margin-bottom:10px!important;font-size:14px!important;}",
                "#csh-redeem .csh-rdm-mirror-in,#csh-redeem .csh-rdm-inp{font-size:12px!important;letter-spacing:.03em!important;}",
                "}",
                /* ---------- 内容区（body 本体规则见上方 §E.1 段） ---------- */
                /* 每个页签的内容都应包一层 .csh-dbg-page，桌面端才限宽居中 */
                ".csh-dbg-page{display:block!important;width:100%!important;position:static!important;}",
                /* 【2026-10-03 精炼】等宽网格：一份规则同时服务桌面与手机 ——
                   auto-fill + minmax(150px,1fr)：宽度自己算列数，**所有按钮同宽**、
                   行首行尾对齐、末行不会只剩一个孤零零的按钮，也不必再写断点媒体查询。 */
                ".csh-dbg-grid{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(150px,1fr))!important;gap:10px!important;width:100%!important;align-items:stretch!important;}",
                /* 顶层功能组＝白卡：给内容区建立「标签在上 / 控件成卡」的结构层次。
                   只吃 .csh-dbg-page 的直接子级——嵌在详情层、预设卡内部的 grid 保持无壳内联，
                   否则会出现卡中卡的套娃。 */
                "#csh-dbg-body .csh-dbg-page>.csh-dbg-grid{background:var(--csh-fg)!important;",
                "border:1px solid rgba(var(--csh-bg-rgb),.10)!important;border-radius:12px!important;padding:12px!important;",
                "box-shadow:0 1px 2px rgba(var(--csh-bg-rgb),.04),0 8px 24px -16px rgba(var(--csh-bg-rgb),.20)!important;}",
                /* 网格内的按钮一律撑满单元格（宽度由网格决定，按钮不再各行其是）。
                   grid-4 / grid-5 与基础网格同款 —— 保留类名只为兼容既有调用点。 */
                ".csh-dbg-grid>button,.csh-dbg-grid-4>button,.csh-dbg-grid-5>button{width:100%!important;text-align:center!important;overflow:hidden!important;text-overflow:ellipsis!important;}",
                ".csh-dbg-grid-4,.csh-dbg-grid-5{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(150px,1fr))!important;gap:10px!important;width:100%!important;}",
                /* ---------- 按钮 ---------- */
                /* 【2026-10-01 触摸目标对齐】本项目其余交互件一律 44px：关闭键(1712) / 页签(1739) /
                   游戏卡开始键(1801) / 兑换行按钮(1855) / 壳各按钮(csh_shell 257·293·353)。
                   唯独 .csh-dbg-btn 是 padding:9px ⇒ 实测高 36px（<44），横跨 8 个页签共 60+ 个按钮。
                   padding 9→13px 使其达到 44px，与其同目录邻居保持一致。 */
                "button.csh-dbg-btn{display:inline-block!important;cursor:pointer!important;padding:13px 14px!important;min-height:44px!important;border-radius:8px!important;font-size:13px!important;",
                "color:var(--csh-bg)!important;background:var(--csh-fg)!important;font-weight:500!important;",
                "border:1px solid rgba(var(--csh-bg-rgb),.12)!important;white-space:nowrap!important;font-family:inherit!important;line-height:1.25!important;margin:0!important;",
                "box-shadow:0 1px 1px rgba(var(--csh-bg-rgb),.03)!important;",
                "transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease,background .16s ease!important;}",
                "button.csh-dbg-btn:hover{border-color:rgba(var(--csh-bg-rgb),.22)!important;transform:translateY(-1px)!important;",
                "color:var(--csh-bg)!important;background:var(--csh-paper2)!important;box-shadow:0 3px 10px -4px rgba(var(--csh-bg-rgb),.20)!important;}",
                "button.csh-dbg-btn:active{transform:translateY(0)!important;}",
                /* 主按钮（确定/开始/兑换/读取）：CBY 黄实底 + 墨字（黄只作底，绝不作纸白上的文字，对比度 1.6:1 不可读） */
                "button.csh-dbg-btn.good{color:var(--csh-accent-ink)!important;border-color:var(--csh-accent)!important;background:var(--csh-accent)!important;font-weight:600!important;box-shadow:0 1px 2px rgba(var(--csh-accent-rgb),.38)!important;}",
                "button.csh-dbg-btn.good:hover{color:var(--csh-accent-ink)!important;border-color:var(--csh-accent-dark)!important;background:var(--csh-accent-dark)!important;box-shadow:0 4px 12px -4px rgba(var(--csh-accent-rgb),.55)!important;transform:translateY(-1px)!important;}",
                "button.csh-dbg-btn.warn{color:var(--csh-red)!important;border-color:rgba(var(--csh-red-rgb),.45)!important;background:var(--csh-fg)!important;}",
                "button.csh-dbg-btn.warn:hover{color:var(--csh-color-ink)!important;border-color:var(--csh-red)!important;background:var(--csh-red)!important;box-shadow:0 4px 12px -4px rgba(var(--csh-red-rgb),.45)!important;transform:translateY(-1px)!important;}",
                /* 【2026-10-03 精炼】语义色收敛：**实底只留给主操作**（.good / 危险 .warn）。
                   牌面/效果本身「有益 / 有害」这类语义改用**淡着色描边**（.pos / .neg）——
                   一整排金色实底块会跟真正的主操作抢注意力，视觉重量失衡。 */
                "button.csh-dbg-btn.pos{color:var(--csh-accent)!important;border-color:rgba(var(--csh-accent-rgb),.42)!important;background:rgba(var(--csh-accent-rgb),.07)!important;}",
                "button.csh-dbg-btn.pos:hover{border-color:var(--csh-accent)!important;background:rgba(var(--csh-accent-rgb),.16)!important;}",
                "button.csh-dbg-btn.neg{color:var(--csh-red)!important;border-color:rgba(var(--csh-red-rgb),.38)!important;background:rgba(var(--csh-red-rgb),.06)!important;}",
                "button.csh-dbg-btn.neg:hover{border-color:var(--csh-red)!important;background:rgba(var(--csh-red-rgb),.16)!important;}",
                /* ---------- 说明条：统一一种样式，避免重复提示 ----------
                   【2026-10-03 精炼】原先每页都挂一条带金色粗左条的白底块，七页下来非常吵。
                   现在只保一根细左条（金 55%）+ 近透明底：**是提示，不是警报**。 */
                ".csh-dbg-hint{display:block!important;margin-top:12px!important;padding:9px 12px!important;font-size:11.5px!important;line-height:1.6!important;",
                "color:var(--csh-gray)!important;background:rgba(var(--csh-bg-rgb),.025)!important;border-radius:8px!important;",
                "border:1px solid rgba(var(--csh-bg-rgb),.05)!important;border-left:2px solid rgba(var(--csh-accent-rgb),.55)!important;}",
                /* ---------- 输入 ---------- */
                ".csh-dbg-row{display:block!important;width:100%!important;margin:0 0 9px!important;}",
                /* 目标 + 搜索同排；窄屏自动换行 */
                ".csh-dbg-tool{display:flex!important;flex-wrap:wrap!important;gap:9px!important;width:100%!important;margin:0 0 8px!important;align-items:stretch!important;}",
                /* 【2026-09-30 空间修复】原 flex-basis 240 + input 220 + gap 9 = 469 > 手机可用 358px
                   ⇒ 工具行被迫换行，右侧留 118px 横向空洞并多占 51px 高度。
                   收紧到 150 / 170 后单行放下（329px），更窄的屏幕仍会正常换行。 */
                ".csh-dbg-tool select{flex:1 1 150px!important;min-width:0!important;display:block!important;padding:10px 12px!important;border-radius:8px!important;",
                "border:1px solid rgba(var(--csh-bg-rgb),.12)!important;background:var(--csh-fg)!important;color:var(--csh-bg)!important;font-size:13px!important;",
                "font-family:inherit!important;position:static!important;outline:none!important;transition:border-color .16s ease,box-shadow .16s ease!important;}",
                ".csh-dbg-tool input{flex:1 1 170px!important;min-width:0!important;display:block!important;padding:13px 12px!important;min-height:44px!important;border-radius:8px!important;",
                "border:1px solid rgba(var(--csh-bg-rgb),.12)!important;background:var(--csh-fg)!important;color:var(--csh-bg)!important;font-size:13px!important;",
                "font-family:inherit!important;position:static!important;outline:none!important;transition:border-color .16s ease,box-shadow .16s ease!important;}",
                ".csh-dbg-tool input::placeholder{color:var(--csh-gray-soft)!important;}",
                ".csh-dbg-tool input:focus,.csh-dbg-tool select:focus{border-color:var(--csh-blue)!important;box-shadow:0 0 0 3px rgba(var(--csh-blue-rgb),.14)!important;}",
                /* 计数条：与输入区上下分离，避免与占位文字视觉重叠 */
                ".csh-dbg-count{display:block!important;width:100%!important;margin:0 0 8px!important;padding:0 2px!important;font-size:11.5px!important;",
                "line-height:1.6!important;color:var(--csh-gray-soft)!important;letter-spacing:.01em!important;font-variant-numeric:tabular-nums!important;}",
                ".csh-dbg-row input,.csh-dbg-row select{display:block!important;width:100%!important;padding:10px 12px!important;border-radius:8px!important;",
                "border:1px solid rgba(var(--csh-bg-rgb),.12)!important;background:var(--csh-fg)!important;color:var(--csh-bg)!important;font-size:13px!important;",
                "font-family:inherit!important;position:static!important;outline:none!important;transition:border-color .16s ease,box-shadow .16s ease!important;}",
                ".csh-dbg-row input::placeholder{color:var(--csh-gray-soft)!important;}",
                ".csh-dbg-row input:focus,.csh-dbg-row select:focus{border-color:var(--csh-blue)!important;box-shadow:0 0 0 3px rgba(var(--csh-blue-rgb),.14)!important;}",
                /* ---------- 技能列表 ---------- */
                /* 【2026-09-30 空间修复】去掉 max-height:44vh —— 它把技能列表锁死在 371px，
                   而外层 #csh-dbg-body 本来就在滚，于是形成「双层滚动」且一次少显示约 2.4 行
                   （实测浪费约 31% 可视高度）。改为不限高、列表随内容撑开，滚动统一交给 body。 */
                "#csh-dbg-skill-list{display:block!important;overflow:visible!important;width:100%!important;",
                "border:1px solid rgba(var(--csh-bg-rgb),.12)!important;border-radius:10px!important;background:var(--csh-fg)!important;margin-top:9px!important;",
                "box-shadow:0 1px 2px rgba(var(--csh-bg-rgb),.04),0 8px 20px -14px rgba(var(--csh-bg-rgb),.16)!important;}",
                "#csh-dbg-skill-list::-webkit-scrollbar{width:10px;}",
                "#csh-dbg-skill-list::-webkit-scrollbar-thumb{background:rgba(var(--csh-bg-rgb),.16)!important;border-radius:999px!important;border:3px solid transparent!important;background-clip:content-box!important;}",
                /* 【2026-10-03 精炼】列表**空**时不留空壳框：一个 100px 高的空盒子 + 一行提示
                   就是纯噪音。空态由 .csh-dbg-empty 一行文字表达，框与底全部撤掉。 */
                "#csh-dbg-skill-list.is-empty{border:none!important;background:transparent!important;box-shadow:none!important;margin-top:6px!important;}",
                ".csh-dbg-sk{display:table!important;width:100%!important;table-layout:fixed!important;border-collapse:collapse!important;position:static!important;",
                "min-height:48px!important;cursor:pointer!important;",
                "border-bottom:1px solid rgba(var(--csh-bg-rgb),.06)!important;transition:background .15s ease!important;}",
                ".csh-dbg-sk:last-child{border-bottom:none!important;}",
                ".csh-dbg-sk:hover{background:rgba(var(--csh-bg-rgb),.035)!important;}",
                ".csh-dbg-sk:focus-visible{outline:2px solid var(--csh-blue)!important;outline-offset:-2px!important;}",
                ".csh-dbg-sk .csh-dbg-sk-info{display:table-cell!important;vertical-align:middle!important;padding:10px 12px!important;width:auto!important;position:static!important;}",
                ".csh-dbg-sk .csh-dbg-sk-info .n{display:block!important;font-size:13.5px!important;color:var(--csh-bg)!important;font-weight:600!important;position:static!important;letter-spacing:-.005em!important;",
                "overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;}",
                ".csh-dbg-sk .csh-dbg-sk-info .id{display:block!important;margin-top:2px!important;font-size:11px!important;color:var(--csh-gray)!important;position:static!important;",
                "font-family:ui-monospace,'Cascadia Mono','SF Mono',Consolas,monospace!important;letter-spacing:.2px!important;",
                "overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;}",
                /* 来源包 + 势力：同名技能消歧（§4.6.2），单行省略 */
                ".csh-dbg-sk .csh-dbg-sk-info .src{display:block!important;margin-top:3px!important;font-size:11px!important;color:var(--csh-gray)!important;",
                "position:static!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;}",
                ".csh-dbg-sk .csh-dbg-sk-info .src b{display:inline!important;position:static!important;font-weight:600!important;color:var(--csh-blue)!important;}",
                ".csh-dbg-sk .csh-dbg-sk-info .src i{display:inline!important;position:static!important;font-style:normal!important;color:var(--csh-gray)!important;}",
                ".csh-dbg-sk .csh-dbg-sk-acts{display:table-cell!important;vertical-align:middle!important;width:134px!important;text-align:right!important;",
                "padding:10px 12px!important;white-space:nowrap!important;position:static!important;}",
                ".csh-dbg-sk .csh-dbg-sk-acts button{display:inline-block!important;cursor:pointer!important;padding:6px 13px!important;margin-left:6px!important;",
                "border-radius:8px!important;font-size:12px!important;font-weight:500!important;border:1px solid transparent!important;color:var(--csh-fg)!important;font-family:inherit!important;",
                "position:static!important;box-shadow:0 1px 2px rgba(var(--csh-bg-rgb),.10)!important;",
                "transition:filter .16s ease,transform .16s ease,box-shadow .16s ease!important;}",
                ".csh-dbg-sk .csh-dbg-sk-acts button:hover{filter:brightness(1.06)!important;transform:translateY(-1px)!important;box-shadow:0 4px 10px -4px rgba(var(--csh-bg-rgb),.28)!important;}",
                ".csh-dbg-sk .csh-dbg-sk-acts button.add{color:var(--csh-color-ink)!important;background:var(--csh-blue)!important;border-color:var(--csh-blue)!important;}",
                ".csh-dbg-sk .csh-dbg-sk-acts button.rm{color:var(--csh-color-ink)!important;background:var(--csh-red)!important;border-color:var(--csh-red)!important;}",
                /* 窄屏：操作列收窄，按钮更紧凑 */
                "@media (max-width:520px){.csh-dbg-sk .csh-dbg-sk-acts{width:112px!important;padding:10px 8px!important;}",
                ".csh-dbg-sk .csh-dbg-sk-acts button{padding:6px 9px!important;margin-left:4px!important;font-size:11.5px!important;}}",
                /* ---------- 技能详情层（§4.6.2）：同层替换，不弹窗套弹窗 ---------- */
                ".csh-dbg-detail{display:block!important;width:100%!important;padding:2px 2px 6px!important;position:static!important;}",
                ".csh-dbg-detail .csh-dbg-dt-back{display:inline-flex!important;align-items:center!important;gap:6px!important;cursor:pointer!important;",
                "min-height:40px!important;padding:6px 14px!important;margin:0 0 16px!important;border-radius:999px!important;",
                "font-size:12.5px!important;font-weight:500!important;color:var(--csh-bg)!important;background:var(--csh-fg)!important;",
                "border:1px solid rgba(var(--csh-bg-rgb),.12)!important;font-family:inherit!important;position:static!important;",
                "box-shadow:0 1px 1px rgba(var(--csh-bg-rgb),.03)!important;",
                "transition:border-color .16s ease,background .16s ease,box-shadow .16s ease,transform .16s ease!important;}",
                ".csh-dbg-detail .csh-dbg-dt-back:hover{border-color:rgba(var(--csh-bg-rgb),.22)!important;color:var(--csh-bg)!important;background:var(--csh-paper2)!important;transform:translateY(-1px)!important;}",
                /* ① 技能名（§4.6.2） */
                ".csh-dbg-detail .csh-dbg-dt-name{display:block!important;font-size:17px!important;font-weight:600!important;line-height:1.4!important;",
                "color:var(--csh-bg)!important;position:static!important;letter-spacing:-.01em!important;}",
                /* ② 标签行：ID / 来源包 / 势力 */
                ".csh-dbg-detail .csh-dbg-dt-tags{display:flex!important;flex-wrap:wrap!important;gap:6px 8px!important;margin:10px 0 0!important;",
                "position:static!important;}",
                ".csh-dbg-detail .csh-dbg-dt-tag{display:inline-block!important;flex:0 0 auto!important;padding:3px 10px!important;border-radius:999px!important;",
                "font-size:11.5px!important;font-weight:500!important;line-height:1.5!important;color:var(--csh-gray)!important;position:static!important;",
                "background:rgba(var(--csh-bg-rgb),.045)!important;border:1px solid transparent!important;",
                "max-width:100%!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;}",
                ".csh-dbg-detail .csh-dbg-dt-tag.mono{font-family:ui-monospace,'Cascadia Mono','SF Mono',Consolas,monospace!important;letter-spacing:.02em!important;}",
                ".csh-dbg-detail .csh-dbg-dt-tag.k-src{color:var(--csh-blue)!important;border-color:transparent!important;background:rgba(var(--csh-blue-rgb),.10)!important;}",
                ".csh-dbg-detail .csh-dbg-dt-tag.k-camp{color:var(--csh-gray)!important;border-color:transparent!important;background:rgba(var(--csh-bg-rgb),.055)!important;}",
                /* ③ 正文块 / 行高 1.7 / max-width:64ch */
                ".csh-dbg-detail .csh-dbg-dt-body{display:block!important;margin:16px 0 0!important;padding:15px 17px!important;",
                "border-radius:10px!important;background:var(--csh-light)!important;border:1px solid rgba(var(--csh-bg-rgb),.06)!important;",
                "border-left:3px solid var(--csh-accent)!important;",
                "font-size:13.5px!important;line-height:1.75!important;color:var(--csh-bg)!important;position:static!important;",
                "max-width:64ch!important;white-space:pre-wrap!important;word-break:break-word!important;}",
                ".csh-dbg-detail .csh-dbg-dt-body.none{color:var(--csh-gray-soft)!important;font-style:normal!important;border-left-color:rgba(var(--csh-bg-rgb),.14)!important;}",
                ".csh-dbg-detail .csh-dbg-dt-h{display:block!important;margin:20px 0 9px!important;font-size:11.5px!important;font-weight:600!important;",
                "color:var(--csh-gray-soft)!important;letter-spacing:.09em!important;position:static!important;}",
                /* 相关词条 */
                ".csh-dbg-detail .csh-dbg-dt-entries{display:flex!important;flex-wrap:wrap!important;gap:6px!important;position:static!important;}",
                ".csh-dbg-detail .csh-dbg-dt-entry{display:inline-block!important;flex:0 0 auto!important;padding:5px 11px!important;border-radius:999px!important;",
                "font-size:11.5px!important;font-weight:500!important;line-height:1.5!important;color:var(--csh-gray)!important;position:static!important;cursor:default!important;",
                "background:var(--csh-light)!important;border:1px solid rgba(var(--csh-bg-rgb),.08)!important;}",
                ".csh-dbg-detail .csh-dbg-dt-entry b{display:inline!important;position:static!important;font-weight:600!important;color:var(--csh-bg)!important;}",
                /* 列表内的空态/占位（脚本里用内联样式创建，这里统一收敛） */
                ".csh-dbg-empty{padding:8px 4px!important;text-align:left!important;color:var(--csh-gray)!important;font-size:12px!important;line-height:1.7!important;}",
                /* ---------- D1：搜索结果的「武将」分组条 / 武将行 ---------- */
                ".csh-dbg-grp{display:block!important;margin:14px 0 6px!important;padding:0 4px!important;position:static!important;",
                "font-size:11px!important;font-weight:600!important;letter-spacing:.09em!important;color:var(--csh-gray-soft)!important;}",
                ".csh-dbg-grp:first-child{margin-top:2px!important;}",
                ".csh-dbg-sk.csh-dbg-ch{border-left:3px solid var(--csh-accent)!important;}",
                ".csh-dbg-sk.csh-dbg-ch .csh-dbg-sk-info .n{color:var(--csh-bg)!important;}",
                ".csh-dbg-ch-skills{display:block!important;margin:8px 0 0!important;position:static!important;}",
                ".csh-dbg-detail .csh-dbg-dt-tag.k-skill{color:var(--csh-blue)!important;border-color:transparent!important;background:rgba(var(--csh-blue-rgb),.10)!important;}",
                /* ---------- 关闭（样式在 §E.1 头部段，此处仅保留兜底） ---------- */
                /* ---------- 配置方案（§4.6.3） ---------- */
                ".csh-dbg-preset{display:flex!important;align-items:center!important;gap:14px!important;min-height:60px!important;",
                /* 方案卡容器：单列堆叠（与池子休闲的按钮网格区分，2026-10-03） */
                ".csh-dbg-pslist{display:flex!important;flex-direction:column!important;gap:10px!important;width:100%!important;margin-top:10px!important;}",
                "padding:16px 18px!important;border-radius:12px!important;margin:0 0 10px!important;position:static!important;",
                "background:var(--csh-fg)!important;",
                "border:1px solid rgba(var(--csh-bg-rgb),.10)!important;box-shadow:0 1px 2px rgba(var(--csh-bg-rgb),.04)!important;",
                "transition:border-color .18s ease,box-shadow .18s ease!important;}",
                ".csh-dbg-preset:hover{border-color:rgba(var(--csh-bg-rgb),.22)!important;box-shadow:0 4px 14px -6px rgba(var(--csh-bg-rgb),.18)!important;}",
                ".csh-dbg-preset .ps-main{flex:1 1 auto!important;min-width:0!important;display:block!important;position:static!important;}",
                ".csh-dbg-preset .ps-name{display:block!important;font-size:15px!important;font-weight:600!important;color:var(--csh-bg)!important;",
                "line-height:1.3!important;position:static!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;}",
                ".csh-dbg-preset .ps-meta{display:block!important;margin-top:5px!important;font-size:12px!important;color:var(--csh-gray)!important;",
                "line-height:1.55!important;position:static!important;font-variant-numeric:tabular-nums!important;}",
                ".csh-dbg-preset .ps-acts{flex:0 0 auto!important;display:flex!important;flex-wrap:wrap!important;gap:6px!important;",
                "justify-content:flex-end!important;max-width:52%!important;position:static!important;}",
                ".csh-dbg-preset .ps-acts button{min-height:36px!important;padding:6px 12px!important;}",
                "@media (max-width:560px){.csh-dbg-preset{flex-direction:column!important;align-items:stretch!important;}",
                ".csh-dbg-preset .ps-acts{max-width:none!important;justify-content:flex-start!important;}}",
                /* 加载反馈三态（§4.6.3）：加载中 / 成功 / 部分失败 */
                ".csh-dbg-psfb{display:block!important;margin:12px 0 0!important;padding:12px 14px!important;border-radius:10px!important;",
                "font-size:12.5px!important;line-height:1.65!important;position:static!important;",
                "background:var(--csh-light)!important;border:1px solid rgba(var(--csh-bg-rgb),.06)!important;border-left:3px solid rgba(var(--csh-bg-rgb),.14)!important;}",
                ".csh-dbg-psfb.loading{color:var(--csh-bg)!important;border-left-color:var(--csh-blue)!important;}",
                ".csh-dbg-psfb.ok{color:var(--csh-green)!important;border-left-color:var(--csh-green)!important;background:rgba(var(--csh-green-rgb),.06)!important;}",
                ".csh-dbg-psfb.warn{color:var(--csh-red)!important;border-left-color:var(--csh-red)!important;background:rgba(var(--csh-red-rgb),.06)!important;}",
                ".csh-dbg-psfb .fb-toggle{display:inline-block!important;margin-left:8px!important;cursor:pointer!important;",
                "color:var(--csh-green)!important;font-weight:500!important;text-decoration:underline!important;position:static!important;user-select:none!important;}",
                ".csh-dbg-psfb .fb-list{display:block!important;margin:10px 0 0!important;padding:10px 12px!important;border-radius:8px!important;",
                "background:var(--csh-fg)!important;border:1px solid rgba(var(--csh-bg-rgb),.06)!important;font-family:ui-monospace,'Cascadia Mono','SF Mono',Consolas,monospace!important;font-size:11.5px!important;",
                "line-height:1.7!important;color:var(--csh-bg)!important;position:static!important;max-height:190px!important;overflow-y:auto!important;",
                "white-space:pre-wrap!important;word-break:break-all!important;}",
                /* 导入导出：一行紧凑 JSON（§4.6.3） */
                ".csh-dbg-json{display:block!important;width:100%!important;margin:10px 0 0!important;padding:11px 13px!important;",
                "border-radius:10px!important;background:var(--csh-light)!important;border:1px solid rgba(var(--csh-bg-rgb),.06)!important;",
                "color:var(--csh-bg)!important;font-family:ui-monospace,'Cascadia Mono','SF Mono',Consolas,monospace!important;font-size:11.5px!important;",
                "line-height:1.6!important;position:static!important;outline:none!important;resize:vertical!important;",
                "min-height:52px!important;box-sizing:border-box!important;}",
                ".csh-dbg-json:focus{border-color:var(--csh-accent)!important;box-shadow:0 0 0 3px rgba(var(--csh-blue-rgb),.16)!important;}",
                /* ---------- 内容区通用复位：引擎全局 div{position:absolute;display:inline-block} ---------- */
                "#csh-dbg-body div,#csh-dbg-body span{position:static!important;}",
                /* ---------- 分组小标题 ---------- */
                /* 分组小标题：只做「小型大写标签」。分隔交给下面的白卡去表达，
                   不必再画一条贯通全宽的横线——横线＋卡片＝双重分隔，是廉价的表格感。 */
                ".csh-dbg-sec{display:block!important;position:static!important;width:100%!important;margin:20px 0 10px!important;padding:0 2px!important;",
                "font-size:11.5px!important;font-weight:600!important;color:var(--csh-gray-soft)!important;letter-spacing:.09em!important;text-align:left!important;}",
                "#csh-dbg-body .csh-dbg-page>.csh-dbg-sec:first-child{margin-top:0!important;}",
                ".csh-dbg-sec .cnt{display:inline-block!important;position:static!important;margin-left:8px!important;font-size:11px!important;font-weight:500!important;",
                "color:var(--csh-gray-soft)!important;letter-spacing:.02em!important;}",
                /* ---------- 分类 chips ---------- */
                ".csh-dbg-chips{display:flex!important;position:static!important;flex-wrap:wrap!important;gap:6px!important;width:100%!important;margin:0 0 9px!important;}",
                ".csh-dbg-chip{display:inline-block!important;position:static!important;cursor:pointer!important;padding:5px 13px!important;border-radius:8px!important;",
                "font-size:12px!important;color:var(--csh-bg)!important;background:var(--csh-fg)!important;border:1px solid rgba(var(--csh-bg-rgb),.12)!important;",
                "user-select:none!important;transition:color .16s ease,background .16s ease,border-color .16s ease!important;}",
                ".csh-dbg-chip:hover{color:var(--csh-bg)!important;background:rgba(var(--csh-bg-rgb),.055)!important;}",
                ".csh-dbg-chip.on{color:var(--csh-accent-ink)!important;font-weight:600!important;border-color:transparent!important;background:var(--csh-accent)!important;}",
                /* ---------- 二级弹窗：卡牌选择器（挂在 #csh-dbg-panel 内，覆盖整块面板） ---------- */
                "#csh-pick-ov{position:absolute!important;left:0!important;top:0!important;width:100%!important;height:100%!important;z-index:30!important;",
                "display:flex!important;align-items:center!important;justify-content:center!important;background:rgba(var(--csh-bg-deep-rgb),.52)!important;border-radius:8px!important;",
                "-webkit-backdrop-filter:blur(10px) saturate(140%)!important;backdrop-filter:blur(10px) saturate(140%)!important;animation:cshDbgFade .16s ease-out!important;}",
                "#csh-pick-panel{position:relative!important;display:flex!important;flex-direction:column!important;box-sizing:border-box!important;",
                "width:min(96%,700px)!important;max-height:min(92%,calc(100dvh - 24px))!important;min-height:0!important;padding:20px 22px 18px!important;border-radius:14px!important;",
                "background:var(--csh-fg)!important;border:1px solid rgba(var(--csh-bg-rgb),.10)!important;",
                "box-shadow:0 2px 6px rgba(var(--csh-bg-rgb),.06),0 24px 56px -20px rgba(var(--csh-bg-rgb),.30)!important;color:var(--csh-bg)!important;",
                /* 【2026-09-30 修复】原为 overflow:hidden —— 内容超过 max-height 时底部
                   （提示文字 + 关闭按钮）被直接裁掉且无法滚动救回，实机「底部关闭被盖住」。
                   这是全扩展唯一违反 README 第二十五章「所有弹窗卡片一律 max-height + overflow-y:auto」
                   的弹窗（对比 #csh-redeem 用的是 overflow-y:auto）。 */
                "overflow-y:auto!important;overflow-x:hidden!important;-webkit-overflow-scrolling:touch!important;}",
                "#csh-pick-panel div,#csh-pick-panel span,#csh-pick-panel input{position:static!important;}",
                "#csh-pick-title{display:block!important;text-align:center!important;font-size:14px!important;font-weight:600!important;color:var(--csh-bg)!important;",
                "letter-spacing:.01em!important;margin:0 0 14px!important;}",
                "#csh-pick-bar{display:flex!important;flex-wrap:wrap!important;gap:8px!important;align-items:center!important;width:100%!important;margin:0 0 9px!important;}",
                "#csh-pick-bar input{flex:1 1 200px!important;min-width:130px!important;display:block!important;padding:9px 12px!important;border-radius:8px!important;",
                "border:1px solid rgba(var(--csh-bg-rgb),.12)!important;background:var(--csh-fg)!important;color:var(--csh-bg)!important;font-size:13px!important;",
                "font-family:inherit!important;outline:none!important;}",
                "#csh-pick-bar input::placeholder{color:var(--csh-gray-soft)!important;}",
                "#csh-pick-bar input:focus{border-color:var(--csh-blue)!important;box-shadow:0 0 0 3px rgba(var(--csh-blue-rgb),.14)!important;}",
                "#csh-pick-count{display:flex!important;align-items:center!important;gap:6px!important;font-size:12px!important;color:var(--csh-gray)!important;white-space:nowrap!important;}",
                "#csh-pick-count input{flex:0 0 auto!important;width:64px!important;display:block!important;padding:8px!important;border-radius:8px!important;text-align:center!important;",
                "border:1px solid rgba(var(--csh-bg-rgb),.12)!important;background:var(--csh-fg)!important;color:var(--csh-bg)!important;font-size:13px!important;",
                "font-family:inherit!important;outline:none!important;}",
                "#csh-pick-list{display:block!important;flex:1 1 auto!important;min-height:170px!important;max-height:48vh!important;overflow-y:auto!important;",
                "overflow-x:hidden!important;width:100%!important;border:1px solid rgba(var(--csh-bg-rgb),.12)!important;border-radius:10px!important;",
                "background:var(--csh-fg)!important;padding:9px!important;}",
                "#csh-pick-list::-webkit-scrollbar{width:10px;}",
                "#csh-pick-list::-webkit-scrollbar-thumb{background:rgba(var(--csh-bg-rgb),.16)!important;border-radius:999px!important;border:3px solid transparent!important;background-clip:content-box!important;}",
                "#csh-pick-grid{display:flex!important;flex-wrap:wrap!important;gap:6px!important;width:100%!important;}",
                /* 【2026-09-30】补手势保护：卡牌是 550ms 长按的目标，须告知浏览器
                   「本元素上的手势由 JS 处理」，否则外层滚动容器会判定为滚动并派发
                   pointercancel 把长按掐掉（移动端「长按无反应」的根因之二）。
                   注意只作用于卡牌本身：遮罩 #csh-pick-ov 绝不能加 touch-action:none，
                   否则会把列表滚动一起掐死（README 第二十五章已有此约束）。 */
                ".csh-pick-card{display:block!important;flex:0 0 auto!important;width:106px!important;cursor:pointer!important;user-select:none!important;-webkit-user-select:none!important;touch-action:none!important;-webkit-touch-callout:none!important;",
                "padding:9px 10px!important;border-radius:10px!important;text-align:center!important;",
                "background:var(--csh-fg)!important;border:1px solid rgba(var(--csh-bg-rgb),.12)!important;",
                "transition:border-color .15s ease,background .15s ease,transform .15s ease,box-shadow .15s ease!important;}",
                ".csh-pick-card:hover{border-color:rgba(var(--csh-accent-rgb),.55)!important;background:rgba(var(--csh-accent-rgb),.10)!important;transform:translateY(-1px)!important;box-shadow:0 4px 12px -6px rgba(var(--csh-accent-rgb),.45)!important;}",
                ".csh-pick-card .n{display:block!important;font-size:13px!important;font-weight:600!important;color:var(--csh-bg)!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;}",
                ".csh-pick-card .t{display:block!important;margin-top:3px!important;font-size:10.5px!important;color:var(--csh-gray)!important;}",
                ".csh-pick-card .i{display:block!important;margin-top:1px!important;font-size:10px!important;color:var(--csh-gray)!important;font-family:ui-monospace,'Cascadia Mono','SF Mono',Consolas,monospace!important;overflow:hidden!important;text-overflow:ellipsis!important;}",
                /* 【2026-09-30 修复】补 flex:0 0 auto —— foot 是列的最后一个子元素，
                   原先可被压缩，容器吃紧时第一个被牺牲（配合上面的 overflow 修复双重保障）。 */
                "#csh-pick-foot{display:flex!important;flex:0 0 auto!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;width:100%!important;margin-top:10px!important;}",
                "#csh-pick-tip{font-size:11.5px!important;color:var(--csh-gray)!important;line-height:1.5!important;text-align:left!important;}",
                /* ---------- 输入 / 选择弹窗 ----------
                 * 关键：引擎全局 div{position:absolute;display:inline-block} 会让标签脱离文档流，
                 * 直接压在输入框上（历史 bug）。这里逐层显式复位，并统一用类名接管排版。 */
                "#csh-dbg-ask{position:absolute!important;left:50%!important;top:50%!important;transform:translate(-50%,-50%)!important;",
                "z-index:40!important;box-sizing:border-box!important;width:min(94%,400px)!important;",
                /* 【2026-09-30 第六轮】补 max-height + overflow-y —— 这是全扩展**唯一**
                   还违反 README 第二十五章「弹窗一律 max-height + 可滚动」的浮层
                   （#csh-pick-panel / #csh-redeem 早已合规）。横屏短视口下标签多行 +
                   52vh 列表 + 底部按钮会超出宿主 #csh-dbg-panel{overflow:hidden}，
                   「确定/取消」被静默裁掉且无法滚动救回。 */
                "max-height:calc(100dvh - 24px)!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;",
                "padding:22px 22px 18px!important;border-radius:14px!important;",
                "background:var(--csh-fg)!important;border:1px solid rgba(var(--csh-bg-rgb),.10)!important;",
                "box-shadow:0 2px 6px rgba(var(--csh-bg-rgb),.06),0 24px 56px -20px rgba(var(--csh-bg-rgb),.30)!important;color:var(--csh-bg)!important;}",
                "#csh-dbg-ask div,#csh-dbg-ask span,#csh-dbg-ask input,#csh-dbg-ask button{position:static!important;}",
                "#csh-dbg-ask .csh-ask-lab{display:block!important;width:100%!important;margin:0 0 10px!important;padding:0!important;",
                "font-size:13px!important;line-height:1.6!important;color:var(--csh-bg)!important;letter-spacing:.01em!important;word-break:break-all!important;}",
                "#csh-dbg-ask .csh-ask-inp{display:block!important;width:100%!important;box-sizing:border-box!important;padding:10px 12px!important;",
                "border-radius:8px!important;border:1px solid rgba(var(--csh-bg-rgb),.12)!important;background:var(--csh-fg)!important;",
                "color:var(--csh-bg)!important;font-size:14px!important;outline:none!important;font-family:inherit!important;line-height:1.4!important;}",
                "#csh-dbg-ask .csh-ask-inp:focus{border-color:var(--csh-blue)!important;box-shadow:0 0 0 3px rgba(var(--csh-blue-rgb),.14)!important;}",
                "#csh-dbg-ask .csh-ask-row{display:flex!important;width:100%!important;margin:12px 0 0!important;padding:0!important;",
                "gap:8px!important;justify-content:flex-end!important;align-items:center!important;}",
                "#csh-dbg-ask .csh-ask-list{display:block!important;width:100%!important;margin:0!important;padding:0!important;",
                "max-height:52vh!important;overflow-y:auto!important;}",
                "#csh-dbg-ask .csh-ask-list::-webkit-scrollbar{width:10px;}",
                "#csh-dbg-ask .csh-ask-list::-webkit-scrollbar-thumb{background:rgba(var(--csh-bg-rgb),.16)!important;border-radius:999px!important;border:3px solid transparent!important;background-clip:content-box!important;}",
                "#csh-dbg-ask .csh-ask-item{display:block!important;width:100%!important;margin:0 0 6px!important;text-align:left!important;}",
                /* 无障碍（血泪 #9）：注入样式源序靠后，必须自己响应系统「减少动效」偏好，
                   否则会反压引擎/系统的 reduced-motion 处理。这里把面板与各浮层的
                   动画/过渡一并关掉，纯静态呈现。 */
                /* ---------- 精工层：统一焦点环 + 数字对齐（包豪斯＝功能可见性） ---------- */
                "#csh-dbg-panel :focus-visible,#csh-redeem :focus-visible,#csh-pick-panel :focus-visible,#csh-dbg-ask :focus-visible,#csh-skillcode :focus-visible,#csh-cardinfo :focus-visible{outline:2px solid rgba(var(--csh-blue-rgb),.55)!important;outline-offset:2px!important;}",
                "#csh-dbg-panel input,#csh-dbg-panel select,#csh-dbg-panel textarea,#csh-redeem input{font-variant-numeric:tabular-nums!important;}",
                "@media (prefers-reduced-motion: reduce){#csh-dbg-overlay,#csh-dbg-panel,#csh-redeem,#csh-redeem-bg,#csh-skillcode,#csh-cardinfo,#csh-pick-ov,#csh-dbg-ask,#csh-dbg-float-btn,#csh-dbg-toast-host .csh-dbg-toast,[id^='csh-ia']{animation:none!important;transition:none!important;}}",
            ].join("");
            (document.head || document.documentElement).appendChild(st);
        }
        function runAct(fn, actionMeta) {
            // actionMeta: { action, target, before, requested }
            // 仅能确认同步抛错=failed；无异常=submitted（不能证明事件完成）
            var meta = actionMeta || null;
            var beforeStorage = null;
            try {
                if (meta && meta.target && lib.cshDebug && lib.cshDebug.snapshotStorage) {
                    beforeStorage = lib.cshDebug.snapshotStorage(meta.target);
                }
            } catch (e0) {}
            try {
                fn();
                if (meta && lib.cshDebug && lib.cshDebug.recordAction) {
                    var afterStorage = null;
                    try {
                        if (meta.target) afterStorage = lib.cshDebug.snapshotStorage(meta.target);
                    } catch (e1) {}
                    try {
                        if (beforeStorage && afterStorage) {
                            lib.cshDebug.diffStorage(beforeStorage, afterStorage, {
                                player: meta.target,
                                reason: "debug_action:" + (meta.action || ""),
                            });
                        }
                    } catch (e2) {}
                    lib.cshDebug.recordAction({
                        action: meta.action || "debug_action",
                        target: meta.target || null,
                        before: meta.before != null ? meta.before : beforeStorage,
                        requested: meta.requested,
                        after: meta.after != null ? meta.after : afterStorage,
                        status: "submitted",
                        error: null,
                    });
                }
            } catch (err) {
                try {
                    if (lib.cshDebug && typeof lib.cshDebug.error === "function") {
                        lib.cshDebug.error(err, null, { category: "debug_action" });
                    } else {
                        console.error("[池子调试]", err);
                    }
                } catch (e2) {
                    try { console.error("[池子调试]", err); } catch (e3) {}
                }
                if (meta && lib.cshDebug && lib.cshDebug.recordAction) {
                    try {
                        lib.cshDebug.recordAction({
                            action: meta.action || "debug_action",
                            target: meta.target || null,
                            before: meta.before,
                            requested: meta.requested,
                            after: null,
                            status: "failed",
                            error: (err && err.message) || String(err),
                        });
                    } catch (e4) {}
                }
                toast("失败: " + ((err && err.message) || err));
            }
        }
        function mkBtn(label, fn, cls) {
            var b = document.createElement("button");
            b.type = "button";
            b.className = "csh-dbg-btn" + (cls ? " " + cls : "");
            b.textContent = label;
            b.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                try { console.log("[池子调试] 按钮点击:", label); } catch (e0) {}
                try {
                    if (typeof game !== "undefined" && game.print) game.print("池子调试:" + label);
                } catch (e1) {}
                runAct(fn);
            }, false);
            return b;
        }
        /** 按钮网格。cols 给定列数时改用等宽网格，避免 flex 换行把末一个按钮挤成孤行 */
        function grid(parent, items, cols) {
            var g = document.createElement("div");
            g.className = "csh-dbg-grid" + (cols ? " csh-dbg-grid-" + cols : "");
            items.forEach(function (el) { g.appendChild(el); });
            parent.appendChild(g);
        }
        function hint(parent, t) {
            var h = document.createElement("div");
            h.className = "csh-dbg-hint";
            h.textContent = t;
            parent.appendChild(h);
        }
        /** 分组小标题：把一大片按钮按用途分块，避免按钮墙 */
        function sec(parent, t, cnt) {
            var d = document.createElement("div");
            d.className = "csh-dbg-sec";
            d.textContent = t;
            if (cnt != null && cnt !== "") {
                var c = document.createElement("span");
                c.className = "cnt";
                c.textContent = cnt;
                d.appendChild(c);
            }
            parent.appendChild(d);
        }
        /** 弹窗宿主：面板内绝对定位，面板滚到底部时会把弹窗顶出可视区，先归零 */
        function askHost() {
            var host = document.getElementById("csh-dbg-panel") || document.getElementById("csh-dbg-overlay") || document.body;
            try { if (host.scrollTop) host.scrollTop = 0; } catch (e) {}
            return host;
        }
        function askClear() {
            var old = document.getElementById("csh-dbg-ask");
            if (old && old.parentNode) old.parentNode.removeChild(old);
        }
        /** 壳环境常无 window.prompt：用面板内输入框代替。排版全部交给 #csh-dbg-ask 的 CSS 类 */
        function askText(title, defVal, cb) {
            var host = askHost();
            askClear();
            var box = document.createElement("div");
            box.id = "csh-dbg-ask";
            var lab = document.createElement("div");
            lab.className = "csh-ask-lab";
            lab.textContent = title || "请输入";
            var inp = document.createElement("input");
            inp.type = "text";
            inp.className = "csh-ask-inp";
            inp.value = defVal != null ? String(defVal) : "";
            var row = document.createElement("div");
            row.className = "csh-ask-row";
            var ok = document.createElement("button");
            ok.type = "button";
            ok.textContent = "确定";
            ok.className = "csh-dbg-btn good";
            var cancel = document.createElement("button");
            cancel.type = "button";
            cancel.textContent = "取消";
            cancel.className = "csh-dbg-btn";
            function finish(val) {
                if (box.parentNode) box.parentNode.removeChild(box);
                if (val != null && typeof cb === "function") cb(val);
            }
            ok.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                finish(inp.value);
            }, false);
            cancel.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                finish(null);
            }, false);
            inp.addEventListener("keydown", function (e) {
                if (e.key === "Enter") {
                    e.preventDefault();
                    finish(inp.value);
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    finish(null);
                }
            }, false);
            row.appendChild(cancel);
            row.appendChild(ok);
            box.appendChild(lab);
            box.appendChild(inp);
            box.appendChild(row);
            host.appendChild(box);
            setTimeout(function () { try { inp.focus(); inp.select(); } catch (eF) {} }, 30);
        }

        function askPick(title, labels, cb) {
            var host = askHost();
            askClear();
            var box = document.createElement("div");
            box.id = "csh-dbg-ask";
            var lab = document.createElement("div");
            lab.className = "csh-ask-lab";
            lab.textContent = title || "请选择";
            box.appendChild(lab);
            var list = document.createElement("div");
            list.className = "csh-ask-list";
            (labels || []).forEach(function (name, i) {
                var b = document.createElement("button");
                b.type = "button";
                b.className = "csh-dbg-btn csh-ask-item";
                b.textContent = (i + 1) + ". " + name;
                b.addEventListener("click", function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (box.parentNode) box.parentNode.removeChild(box);
                    if (typeof cb === "function") cb(i);
                }, false);
                list.appendChild(b);
            });
            box.appendChild(list);
            var row = document.createElement("div");
            row.className = "csh-ask-row";
            var cancel = document.createElement("button");
            cancel.type = "button";
            cancel.className = "csh-dbg-btn";
            cancel.textContent = "取消";
            cancel.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (box.parentNode) box.parentNode.removeChild(box);
            }, false);
            row.appendChild(cancel);
            box.appendChild(row);
            host.appendChild(box);
        }

        function pickPlayer(cb) {
            var list = allPlayers();
            if (!list.length) return toast("场上无角色");
            if (list.length === 1) return cb(list[0]);
            var labels = list.map(function (p) { return tr(p) || p.name || "?"; });
            askPick("选择目标", labels, function (i) {
                if (i >= 0 && i < list.length) cb(list[i]);
            });
        }

        function addSkillTo(p, sid) {
            if (!p || !sid) return;
            sid = String(sid).trim();
            if (!lib.skill || !lib.skill[sid]) return toast("技能不存在: " + sid);
            runAct(function () {
                if (typeof p.addSkillLog === "function") p.addSkillLog(sid);
                else if (typeof p.addSkills === "function") p.addSkills(sid);
                else if (typeof p.addSkill === "function") p.addSkill(sid);
                else throw new Error("无法添加");
                toast((tr(p) || p.name) + " 获得 " + (tr(sid) || sid) + "（已提交）");
            }, { action: "addSkill", target: p, requested: { skill: sid }, before: { skills: (p.skills || []).slice() } });
        }
        function safeGain(names, targetPlayer) {
            var p = targetPlayer || needMe();
            if (!p) return;
            var list = [];
            for (var i = 0; i < names.length; i++) {
                var n = names[i];
                if (!lib.card || !lib.card[n]) continue;
                try {
                    var c = game.createCard2
                        ? game.createCard2(n, ["spade", "heart", "club", "diamond"][i % 4], 1 + (i % 13))
                        : game.createCard(n);
                    if (c) list.push(c);
                } catch (e) {}
            }
            if (!list.length) return toast("无法生成");
            try {
                p.gain(list, "gain2");
                toast((tr(p) || p.name) + " +" + list.length + " 张牌（已提交，结算未确认）");
            } catch (e2) {
                toast("获得失败");
            }
        }
        /** 技能索引：全库只建一次并缓存（1 万+ 条，每次重建太慢） */
        var _skillIdxCache = null;
        var _skillIdxStats = "";
        function buildSkillIndex() {
            if (_skillIdxCache) return _skillIdxCache;
            var arr = [];
            var skills = lib.skill || {};
            /* 用 getOwnPropertyNames 而非 for...in：引擎有一部分技能是用 Object.defineProperty
               挂上去的（可枚举位默认 false），for...in 会把它们整批漏掉，表现就是技能总数莫名缩水。
               这里只读不写，取全部自有键。 */
            var ids = [];
            try { ids = Object.getOwnPropertyNames(skills); } catch (eIds) { ids = []; }
            var rawN = 0, objN = 0, enumN = 0;
            for (var i = 0; i < ids.length; i++) {
                var id = ids[i];
                rawN++;
                if (!id || id.charAt(0) === "_") continue;
                var info = skills[id];
                if (!info || typeof info !== "object") continue;
                objN++;
                try { if (Object.prototype.propertyIsEnumerable.call(skills, id)) enumN++; } catch (eEnum) {}
                var name = "";
                try {
                    if (lib.translate && typeof lib.translate[id] === "string") name = lib.translate[id];
                } catch (e) {}
                name = safeStr(name);
                if (!name || name.indexOf("[object") === 0) name = id;
                arr.push({ id: id, name: name, hasCn: name !== id && /[\u4e00-\u9fff]/.test(name) });
            }
            _skillIdxCache = arr;
            _skillIdxStats = "原始键 " + rawN + " · 对象 " + objN + " · 可枚举 " + enumN;
            return arr;
        }
        /** 诊断：技能库规模取决于「已启用武将包」，数量对不上时先看这一行 */
        function skillEnvStats() {
            try {
                var cfg = lib.config || {};
                var on = cfg.characters || [];
                var all = (cfg.all && cfg.all.characters) || [];
                var names = on.length > 8 ? on.slice(0, 8).join(",") + ",…" : on.join(",");
                var sl = lib.skilllist;
                var slN = sl ? (typeof sl.size === "number" ? sl.size : (sl.length || 0)) : 0;
                return "模式 " + (cfg.mode || "?") + " · 已启用武将包 " + on.length + "/" + all.length +
                    (names ? " [" + names + "]" : "") + " · 技能表 " + slN + " · " + _skillIdxStats;
            } catch (e) { return _skillIdxStats; }
        }
        /** 搜索驱动：空关键词返回空列表，绝不默认铺一屏 */
        function searchSkills(q) {
            q = String(q || "").trim().toLowerCase();
            if (!q) return [];
            var idx = buildSkillIndex();
            var exact = [], head = [], mid = [];
            for (var i = 0; i < idx.length; i++) {
                var it = idx[i];
                var id = it.id.toLowerCase();
                var nm = (it.name || "").toLowerCase();
                var at = -1;
                if (id === q || nm === q) at = 0;
                else if (id.indexOf(q) === 0 || nm.indexOf(q) === 0) at = 1;
                else if (id.indexOf(q) !== -1 || nm.indexOf(q) !== -1) at = 2;
                if (at === -1) continue;
                if (at === 0) exact.push(it);
                else if (at === 1) head.push(it);
                else mid.push(it);
            }
            // 同档内：有中文名的优先
            function cnFirst(a, b) {
                if (a.hasCn !== b.hasCn) return a.hasCn ? -1 : 1;
                return (a.name || a.id).localeCompare(b.name || b.id, "zh");
            }
            exact.sort(cnFirst); head.sort(cnFirst); mid.sort(cnFirst);
            return exact.concat(head, mid).slice(0, 120);
        }

        /* ==================== 技能元数据（来源包 / 势力）· §4.6.2 ====================
           同名技能在库里不止一条（如「咆哮」既有标准版也有 SP 版），只看名字无法消歧。
           引擎没有现成的「技能 → 武将 → 势力」反查表，只能从 lib.characterPack 反推：
             lib.characterPack[包名] = { 武将名: [性别, 势力, 体力, [技能id...], ...] }
           反向建一次索引并缓存（建索引本身要扫全库武将，约几万次属性读取）。 */
        var _skillMetaCache = null;
        function buildSkillMetaIndex() {
            if (_skillMetaCache) return _skillMetaCache;
            var map = {};
            function addOne(cid, sid, pack) {
                if (!sid) return;
                var e = map[sid];
                if (!e) e = map[sid] = { chars: [], packs: [] };
                if (cid && e.chars.indexOf(cid) === -1) e.chars.push(cid);
                if (pack && e.packs.indexOf(pack) === -1) e.packs.push(pack);
            }
            /** 从一条武将定义里取出技能 id 列表。位置随版本不同（3 或 4 位），
               所以不写死下标，逐项挑出「字符串且在 lib.skill 里存在」的项。
               留在本函数内（不提到外层）：面板自检按「单函数源码抽取」运行，函数必须自包含。
               【2026-09-30 修复】与 skillsOfEntry 同源：必须兼容对象形态，
               否则 map 恒为空 ⇒ 技能详情页的「持有武将」区块永不显示。 */
            function skillsOf(entry) {
                var out = [];
                if (!entry) return out;
                var raw = null;
                if (Object.prototype.toString.call(entry) === "[object Array]") raw = entry;
                else raw = entry.skills || entry[3];
                if (!raw) return out;
                if (Object.prototype.toString.call(raw) !== "[object Array]") raw = [raw];
                for (var i = 0; i < raw.length && i < 12; i++) {
                    var v = raw[i];
                    if (typeof v === "string" && v && lib.skill && lib.skill[v]) out.push(v);
                    else if (Object.prototype.toString.call(v) === "[object Array]") {
                        for (var j = 0; j < v.length; j++) {
                            if (typeof v[j] === "string" && v[j] && lib.skill && lib.skill[v[j]]) out.push(v[j]);
                        }
                    }
                }
                return out;
            }
            try {
                var packs = lib.characterPack || {};
                for (var pk in packs) {
                    if (!Object.prototype.hasOwnProperty.call(packs, pk)) continue;
                    var group = packs[pk];
                    if (!group || typeof group !== "object") continue;
                    for (var cn in group) {
                        if (!Object.prototype.hasOwnProperty.call(group, cn)) continue;
                        if (!cn || cn.charAt(0) === "_") continue;
                        var entry = group[cn];
                        if (!entry) continue;
                        var sids = skillsOf(entry);
                        for (var k = 0; k < sids.length; k++) addOne(cn, sids[k], pk);
                    }
                }
            } catch (ePk) {}
            _skillMetaCache = map;
            return map;
        }
        /** 势力：lib.character[武将名][1] 为势力键（wei/shu/wu/qun/shen…），无键时退回原字符串 */
        var CAMP_ORDER = { wei: 0, shu: 1, wu: 2, qun: 3, shen: 4 };
        function campTextOf(charName) {
            var raw = "";
            try {
                var c = lib.character && lib.character[charName];
                if (c && typeof c[1] === "string") raw = c[1];
                else if (c && typeof c.group === "string") raw = c.group;
            } catch (e) {}
            if (!raw) return "";
            try {
                var t = lib.translate && lib.translate["group_" + raw];
                if (typeof t === "string" && t) return safeStr(t) || t;
            } catch (e2) {}
            return tr(raw) || raw;
        }
        /** 技能详情所需的一切：来源包、势力、代表武将。查不到就留空，由渲染层显示「未知」 */
        function skillMetaOf(sid) {
            var out = { packs: [], camps: [], chars: [] };
            var idx = buildSkillMetaIndex();
            var e = idx[sid];
            if (!e) return out;
            out.chars = e.chars.slice(0, 8);
            out.packs = e.packs.slice(0, 4);
            var seen = {};
            for (var i = 0; i < e.chars.length && out.camps.length < 4; i++) {
                var c = campTextOf(e.chars[i]);
                if (c && !seen[c]) { seen[c] = 1; out.camps.push(c); }
            }
            out.camps.sort(function (a, b) {
                var ra = "", rb = "";
                try {
                    var ca = lib.character && lib.character[e.chars[0]];
                    if (ca) ra = ca[1] || "";
                } catch (eA) {}
                var ia = CAMP_ORDER[ra] == null ? 9 : CAMP_ORDER[ra];
                var ib = CAMP_ORDER[rb] == null ? 9 : CAMP_ORDER[rb];
                return ia - ib;
            });
            return out;
        }

        /* ==================== 武将索引 · §4.6.2（D1：技能搜索的「武将维度」） ====================
           此前技能搜索只能按技能名 / 技能 ID 找；但使用者常常只记得「武将叫什么」。
           lib.characterPack 天然是「包 → 武将 → 技能列表」，故正向建一次索引：
             cid → { id, name, pack, skills[] }
           同名武将（标准版 / SP 版…）靠 pack 字段消歧。 */
        var _charIdxCache = null;
        function buildCharacterIndex() {
            if (_charIdxCache) return _charIdxCache;
            var out = [];
            /** 自包含的技能提取（与 buildSkillMetaIndex.skillsOf 同逻辑；面板自检按单函数源码抽取执行，
                故此处不引用外部函数，保证独立可测） */
            function skillsOfEntry(entry) {
                var outS = [];
                if (!entry) return outS;
                /* 【2026-09-30 修复】兼容数组与对象两种武将定义形态。
                   旧写法只认数组（遍历 entry.length 逐下标取），而现役
                   lib.characterPack[id] 是对象 {sex,group,hp,skills:[...]}——
                   对象没有 length，`0 < undefined` 为 false ⇒ 循环零执行
                   ⇒ 全库所有武将都显示「0 个技能 · 该武将在库中未登记技能」。
                   Character 实例另提供废弃的 [3] 数字 getter 指向 skills，一并兼容。 */
                var raw = null;
                if (Object.prototype.toString.call(entry) === "[object Array]") raw = entry;
                else raw = entry.skills || entry[3];
                if (!raw) return outS;
                if (Object.prototype.toString.call(raw) !== "[object Array]") raw = [raw];
                for (var i = 0; i < raw.length && i < 12; i++) {
                    var v = raw[i];
                    if (typeof v === "string" && v && lib.skill && lib.skill[v]) outS.push(v);
                    else if (Object.prototype.toString.call(v) === "[object Array]") {
                        for (var j = 0; j < v.length; j++) {
                            if (typeof v[j] === "string" && v[j] && lib.skill && lib.skill[v[j]]) outS.push(v[j]);
                        }
                    }
                }
                return outS;
            }
            try {
                var packs = lib.characterPack || {};
                for (var pk in packs) {
                    if (!Object.prototype.hasOwnProperty.call(packs, pk)) continue;
                    var group = packs[pk];
                    if (!group || typeof group !== "object") continue;
                    for (var cn in group) {
                        if (!Object.prototype.hasOwnProperty.call(group, cn)) continue;
                        if (!cn || cn.charAt(0) === "_") continue;
                        var entry = group[cn];
                        if (!entry) continue;
                        var nm = "";
                        try {
                            if (lib.translate && typeof lib.translate[cn] === "string") nm = lib.translate[cn];
                        } catch (eN) {}
                        nm = safeStr(nm);
                        if (!nm || nm.indexOf("[object") === 0) nm = cn;
                        out.push({
                            id: cn,
                            name: nm,
                            pack: pk,
                            skills: skillsOfEntry(entry),
                            hasCn: /[\u4e00-\u9fff]/.test(nm),
                        });
                    }
                }
            } catch (eB) {}
            _charIdxCache = out;
            return out;
        }
        /** 武将名匹配：与技能搜索同档位（exact 0 / 名前缀 1 / 含于名 2） */
        function searchCharacters(q) {
            q = String(q || "").trim().toLowerCase();
            if (!q) return [];
            var idx = buildCharacterIndex();
            var exact = [], head = [], mid = [];
            for (var i = 0; i < idx.length; i++) {
                var it = idx[i];
                var id = it.id.toLowerCase();
                var nm = (it.name || "").toLowerCase();
                var at = -1;
                if (id === q || nm === q) at = 0;
                else if (id.indexOf(q) === 0 || nm.indexOf(q) === 0) at = 1;
                else if (id.indexOf(q) !== -1 || nm.indexOf(q) !== -1) at = 2;
                if (at === -1) continue;
                if (at === 0) exact.push(it);
                else if (at === 1) head.push(it);
                else mid.push(it);
            }
            function cnFirst(a, b) {
                if (a.hasCn !== b.hasCn) return a.hasCn ? -1 : 1;
                return (a.name || a.id).localeCompare(b.name || b.id, "zh");
            }
            exact.sort(cnFirst); head.sort(cnFirst); mid.sort(cnFirst);
            return exact.concat(head, mid).slice(0, 60);
        }

        /* ==================== 配置方案存储 · §4.6.3 ====================
           落盘走 localStorage（前缀 csh_ 属约定红线 §5.5.6 第 4 条）；
           同时镜像一份到 game.saveConfig，避免换壳后 localStorage 被清。 */
        var PS_KEY = "csh_dbg_presets";
        function psRead() {
            var raw = null;
            try {
                if (typeof localStorage !== "undefined") raw = localStorage.getItem(PS_KEY);
            } catch (eLs) {}
            if (!raw) {
                try {
                    if (lib.config && lib.config[PS_KEY]) raw = lib.config[PS_KEY];
                } catch (eCfg) {}
            }
            var list = [];
            if (raw) {
                try {
                    var data = typeof raw === "string" ? JSON.parse(raw) : raw;
                    if (Object.prototype.toString.call(data) === "[object Array]") list = data;
                } catch (eP) { list = []; }
            }
            /* 清洗：坏条目直接丢弃，绝不把脏数据塞回界面 */
            var out = [];
            for (var i = 0; i < list.length; i++) {
                var it = list[i];
                if (!it || typeof it !== "object") continue;
                if (typeof it.name !== "string" || !it.name) continue;
                if (Object.prototype.toString.call(it.skills) !== "[object Array]") continue;
                out.push({
                    name: it.name,
                    skills: it.skills.filter(function (s) { return typeof s === "string" && s; }),
                    ts: typeof it.ts === "number" ? it.ts : 0,
                });
            }
            return out;
        }
        function psWrite(list) {
            var json = JSON.stringify(list || []);
            var ok = false;
            try {
                if (typeof localStorage !== "undefined") { localStorage.setItem(PS_KEY, json); ok = true; }
            } catch (eLs) {}
            try {
                if (typeof game !== "undefined" && typeof game.saveConfig === "function") {
                    game.saveConfig(PS_KEY, json); ok = true;
                } else if (lib.config) {
                    lib.config[PS_KEY] = json; ok = true;
                }
            } catch (eCfg) {}
            return ok;
        }
        function psStamp(ts) {
            if (!ts) return "未知时间";
            try {
                var d = new Date(ts);
                function p2(n) { return n < 10 ? "0" + n : String(n); }
                return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) +
                    " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
            } catch (e) { return "未知时间"; }
        }
        function psFind(list, name) {
            for (var i = 0; i < list.length; i++) if (list[i].name === name) return i;
            return -1;
        }
        /** 从当前目标身上取技能列表（§4.6.3「从当前选择新建」） */
        function psSkillsOf(p) {
            var out = [], seen = {};
            if (!p) return out;
            var src = [];
            try { if (p.skills && p.skills.length) src = p.skills; } catch (e) {}
            if (!src.length) {
                /* 有些引擎把技能摊在 player 自身上（skill1/skill2…），兜底捞一遍 */
                try {
                    for (var i = 1; i <= 12; i++) {
                        var v = p["skill" + i];
                        if (typeof v === "string" && v) src.push(v);
                        else if (v && typeof v === "object" && typeof v.name === "string") src.push(v.name);
                    }
                } catch (e2) {}
            }
            for (var j = 0; j < src.length; j++) {
                var s = src[j];
                if (typeof s !== "string") s = (s && s.name) || "";
                s = String(s || "").trim();
                if (!s || seen[s]) continue;
                seen[s] = 1;
                out.push(s);
            }
            return out;
        }

        /** 卡牌索引：全库只建一次并缓存 */
        var _cardIdxCache = null;
        var CARD_CATS = [
            { key: "all", name: "全部" },
            { key: "basic", name: "基本牌" },
            { key: "trick", name: "锦囊牌" },
            { key: "equip", name: "装备牌" },
            { key: "other", name: "其他" },
        ];
        function buildCardIndex() {
            if (_cardIdxCache) return _cardIdxCache;
            var arr = [];
            var cards = lib.card || {};
            for (var id in cards) {
                if (!Object.prototype.hasOwnProperty.call(cards, id)) continue;
                if (!id || id.charAt(0) === "_") continue;
                if (!cards[id] || typeof cards[id] !== "object") continue;
                var name = "";
                try {
                    if (lib.translate && typeof lib.translate[id] === "string") name = lib.translate[id];
                } catch (e) {}
                name = safeStr(name);
                if (!name || name.indexOf("[object") === 0) name = id;
                var type = "other";
                try {
                    var t = get.type ? get.type(id) : "";
                    if (t === "basic" || t === "trick" || t === "equip") type = t;
                } catch (e2) {}
                arr.push({ id: id, name: name, type: type, hasCn: /[\u4e00-\u9fff]/.test(name) });
            }
            arr.sort(function (a, b) {
                if (a.hasCn !== b.hasCn) return a.hasCn ? -1 : 1;
                return (a.name || a.id).localeCompare(b.name || b.id, "zh");
            });
            _cardIdxCache = arr;
            return arr;
        }
        function searchCards(q, cat) {
            var idx = buildCardIndex();
            q = String(q || "").trim().toLowerCase();
            var out = [];
            for (var i = 0; i < idx.length; i++) {
                var it = idx[i];
                if (cat && cat !== "all" && it.type !== cat) continue;
                if (q) {
                    var id = it.id.toLowerCase();
                    var nm = (it.name || "").toLowerCase();
                    if (id.indexOf(q) === -1 && nm.indexOf(q) === -1) continue;
                } else if (cat === "all" || !cat) {
                    // 无关键词且不限分类：只给中文名卡牌，避免一屏英文 ID
                    if (!it.hasCn) continue;
                }
                out.push(it);
                if (out.length >= 150) break;
            }
            return out;
        }
        function makeCardOf(name) {
            try {
                if (game.createCard2) {
                    var suits = ["spade", "heart", "club", "diamond"];
                    return game.createCard2(name, suits[Math.floor(Math.random() * 4)], 1 + Math.floor(Math.random() * 13));
                }
                return game.createCard(name);
            } catch (e) { return null; }
        }
        /** 二级弹窗：搜索生成牌。targetProvider() 每次调用时取当前目标，面板不关可连续生成 */
        function openCardPicker(targetProvider) {
            var host = document.getElementById("csh-dbg-panel") || document.getElementById("csh-dbg-overlay") || document.body;
            var old = document.getElementById("csh-pick-ov");
            if (old && old.parentNode) old.parentNode.removeChild(old);

            var ov = document.createElement("div");
            ov.id = "csh-pick-ov";
            var panel = document.createElement("div");
            panel.id = "csh-pick-panel";
            panel.addEventListener("click", function (e) { e.stopPropagation(); }, false);

            var title = document.createElement("div");
            title.id = "csh-pick-title";
            function targetLabel() {
                var p = targetProvider && targetProvider();
                return p ? (tr(p) || p.name || "?") : "未选目标";
            }
            title.textContent = "搜索生成牌 · 目标：" + targetLabel();
            panel.appendChild(title);

            // 固定搜索栏（不随列表滚动）
            var bar = document.createElement("div");
            bar.id = "csh-pick-bar";
            var inp = document.createElement("input");
            inp.type = "text";
            inp.placeholder = "搜索卡牌 · 中文名或 ID（如 杀 / sha / 桃）";
            var cnt = document.createElement("div");
            cnt.id = "csh-pick-count";
            var cntLab = document.createElement("span");
            cntLab.textContent = "数量";
            var cntInp = document.createElement("input");
            cntInp.type = "text";
            cntInp.value = "1";
            cnt.appendChild(cntLab);
            cnt.appendChild(cntInp);
            bar.appendChild(inp);
            bar.appendChild(cnt);
            panel.appendChild(bar);

            // 分类 chips
            var chips = document.createElement("div");
            chips.className = "csh-dbg-chips";
            var cat = "all";
            CARD_CATS.forEach(function (c) {
                var ch = document.createElement("div");
                ch.className = "csh-dbg-chip" + (c.key === cat ? " on" : "");
                ch.textContent = c.name;
                ch.setAttribute("data-cat", c.key);
                ch.addEventListener("click", function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    cat = c.key;
                    for (var i = 0; i < chips.children.length; i++) {
                        chips.children[i].className = "csh-dbg-chip" + (chips.children[i].getAttribute("data-cat") === cat ? " on" : "");
                    }
                    render();
                }, false);
                chips.appendChild(ch);
            });
            panel.appendChild(chips);

            var list = document.createElement("div");
            list.id = "csh-pick-list";
            var gridEl = document.createElement("div");
            gridEl.id = "csh-pick-grid";
            list.appendChild(gridEl);
            panel.appendChild(list);

            var foot = document.createElement("div");
            foot.id = "csh-pick-foot";
            var tip = document.createElement("div");
            tip.id = "csh-pick-tip";
            var closeBtn = document.createElement("button");
            closeBtn.type = "button";
            closeBtn.className = "csh-dbg-btn";
            closeBtn.textContent = "关闭";
            closeBtn.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                closePick();
            }, false);
            foot.appendChild(tip);
            foot.appendChild(closeBtn);
            panel.appendChild(foot);

            ov.appendChild(panel);
            if (host.id === "csh-dbg-panel") {
                host.style.position = "relative";
                // 弹窗是 panel 的绝对定位子元素：面板滚下去时会被滚出可视区，先回顶
                try { host.scrollTop = 0; } catch (eS) {}
            }
            host.appendChild(ov);

            function closePick() {
                if (ov.parentNode) ov.parentNode.removeChild(ov);
                document.removeEventListener("keydown", onKey, true);
            }
            /* 【2026-10-02】把关闭入口暴露到节点上：closePanel() 直接点 ✕ 关面板时
               不经过 closePick()，会让 document 级 keydown 与整棵卡片 DOM 永久泄漏。
               有了 __close，closePanel() 就能统一走这里销毁（同 csh_interact 的
               box.__esc 写法）。 */
            ov.__close = closePick;
            function onKey(e) {
                if (e.key !== "Escape" && e.keyCode !== 27) return;
                e.preventDefault();
                e.stopPropagation();
                closePick();
            }
            document.addEventListener("keydown", onKey, true);
            ov.addEventListener("click", function (e) { if (e.target === ov) closePick(); }, true);

            function gen(name) {
                var p = targetProvider && targetProvider();
                if (!p) return toast("请先在上方选择目标");
                var n = parseInt(String(cntInp.value).trim(), 10);
                if (isNaN(n) || n < 1) n = 1;
                if (n > 200) n = 200;
                var list2 = [];
                for (var i = 0; i < n; i++) {
                    var c = makeCardOf(name);
                    if (c) list2.push(c);
                }
                if (!list2.length) return toast("生成失败");
                runAct(function () {
                    p.gain(list2, "gain2");
                    toast("已给 " + (tr(p) || p.name) + " 生成 " + list2.length + " 张 " + (tr(name) || name));
                }, { action: "createCard", target: p, requested: { name: name, n: n } });
            }

            function render() {
                while (gridEl.firstChild) gridEl.removeChild(gridEl.firstChild);
                var res = searchCards(inp.value, cat);
                tip.textContent = res.length
                    ? ("共 " + res.length + " 张" + (res.length >= 150 ? "（只显示前 150 张，请细化关键词）" : "") + " · 点卡片即按上方数量生成")
                    : "没有匹配的卡牌";
                res.forEach(function (it) {
                    var d = document.createElement("div");
                    d.className = "csh-pick-card";
                    d.title = it.name + " · " + it.id + "（右键 / 长按查看详情）";
                    var nEl = document.createElement("div");
                    nEl.className = "n";
                    nEl.textContent = it.name;
                    var tEl = document.createElement("div");
                    tEl.className = "t";
                    tEl.textContent = (CARD_CATS.filter(function (c) { return c.key === it.type; })[0] || { name: "其他" }).name;
                    var iEl = document.createElement("div");
                    iEl.className = "i";
                    iEl.textContent = it.id;
                    d.appendChild(nEl);
                    d.appendChild(tEl);
                    d.appendChild(iEl);

                    /* D3：右键（PC）或长按 550ms（PC + 手机）→ 卡牌详情浮层；单击仍是「生成」，互不干扰。
                       长按带位移 >14px 取消。阈值与悬浮球 DRAG_THRESHOLD(14px) 对齐：
                       手机点按抖动普遍 5~12px（见本文件悬浮球注释），旧值 10px 会把
                       「长按」误判成「拖动」直接取消 —— 这是 2026-09-30 实机
                       「长按卡牌名不弹详情」的根因之一。 */
                    var holdTimer = null, holdFrom = null, holdFired = false;
                    function cancelHold() {
                        if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
                        holdFrom = null;
                    }
                    d.addEventListener("contextmenu", function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        cancelHold();
                        showCardInfo(it.id);
                    }, false);
                    d.addEventListener("pointerdown", function (e) {
                        holdFired = false;
                        holdFrom = { x: e.clientX, y: e.clientY };
                        /* 2026-09-30：指针捕获，让后续 move/up 一定回到本元素。
                           否则外层 #csh-pick-list 一旦判定为滚动手势，会直接派发
                           pointercancel 把长按掐掉（移动端「长按没反应」的另一半根因）。 */
                        try { if (d.setPointerCapture && e.pointerId != null) d.setPointerCapture(e.pointerId); } catch (eCap) {}
                        if (holdTimer) clearTimeout(holdTimer);
                        holdTimer = setTimeout(function () {
                            holdTimer = null;
                            holdFired = true;
                            showCardInfo(it.id);
                        }, 550);
                    }, false);
                    d.addEventListener("pointermove", function (e) {
                        if (!holdFrom || !holdTimer) return;
                        if (Math.abs(e.clientX - holdFrom.x) > 14 || Math.abs(e.clientY - holdFrom.y) > 14) cancelHold();
                    }, false);
                    d.addEventListener("pointerup", cancelHold, false);
                    d.addEventListener("pointercancel", cancelHold, false);
                    /* 2026-09-30 移除 pointerleave 取消：触摸在隐式捕获下会偶发 leave，
                       把还没到 550ms 的长按误杀；PC 端靠上面的 move 阈值已足够判定。 */

                    d.addEventListener("click", function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (holdFired) { holdFired = false; return; }
                        gen(it.id);
                    }, false);
                    gridEl.appendChild(d);
                });
            }
            var timer = null;
            inp.addEventListener("input", function () {
                if (timer) clearTimeout(timer);
                timer = setTimeout(render, 80);
            }, false);
            render();
            /* 【2026-09-30 修复】移动端不再自动聚焦搜索框：强弹软键盘会把弹窗底部
               （提示文字 + 关闭按钮）顶出可视区，也让手指更易抖动触发滚动接管而掐掉长按。
               桌面端（>=901px）保持原行为，输入即搜更顺手。 */
            var _wideView = false;
            try { _wideView = !window.matchMedia || window.matchMedia("(min-width: 901px)").matches; } catch (eW) { _wideView = true; }
            if (_wideView) setTimeout(function () { try { inp.focus(); } catch (eF) {} }, 30);
        }

        /** 开局：统一走 lib.cshGames（全屏 iframe）。模块缺失时给出可操作提示。 */
        function openGame(key) {
            try {
                if (lib.cshGames && lib.cshGames.has && lib.cshGames.has(key)) {
                    lib.cshGames.open(key);
                    return true;
                }
            } catch (e) {}
            toast("小游戏模块未加载（csh_games.js）");
            return false;
        }

        /** 池子休闲：一级＝页签，二级＝这里的卡片列表。点「开始」即开局（1 步）。 */
        function renderLobby(body) {
            var games = [];
            var planned = [];
            try { if (lib.cshGames && lib.cshGames.list) games = lib.cshGames.list() || []; } catch (eG) { games = []; }
            try { if (lib.cshGames && lib.cshGames.planned) planned = lib.cshGames.planned() || []; } catch (eP) { planned = []; }

            if (!games.length) {
                hint(body, "小游戏模块未加载（csh_games.js）。请确认扩展文件完整后重开面板。");
                return;
            }

            /* —— 内容区标题已删除（2026-10-03）。
               原来这里渲染一行居中的「池 子 休 闲」纯展示标题，与左侧页签重名 ——
               用户反馈「两个池子休闲，一个位置不对，一个多余」，统一只保留页签一处。
               CDK 彩蛋不受影响：触发器在「池子休闲」页签上（2.5 秒内连点 10 次），
               从来不在标题上（见 tabDefs 处与 config.js 说明）。 —— */

            /* 【2026-10-03 用户决定】「一行一款 + 右侧「开始」按钮」→ **等大按钮网格**。
               旧卡片是两段式（左侧名字、中间大片空白、右侧开始），既费纵向空间，
               又要求玩家先读卡、再瞄准那颗按钮 —— 手机上还得上下滑才能看全。
               成熟做法：**这张卡本身就是按钮**（整块可点、无独立「开始」、大小一致）。
               生涯大厅与四款游戏同格并列（它同样是入口），用胶囊标签区分类型。
               网格 auto-fill + minmax：列数由可用宽度自己算 —— 一套布局同时服务桌面与手机。 */
            function gameButton(title, desc, tag, onClick, locked) {
                var b = document.createElement("button");
                b.type = "button";
                b.className = "csh-dbg-gamebtn" + (locked ? " locked" : "");
                var top = document.createElement("span");
                top.className = "gb-top";
                var nm = document.createElement("b");
                nm.className = "gb-name";
                nm.textContent = title;
                top.appendChild(nm);
                if (tag) {
                    var tg = document.createElement("i");
                    tg.className = "gb-tag";
                    tg.textContent = tag;
                    top.appendChild(tg);
                }
                var d = document.createElement("span");
                d.className = "gb-desc";
                d.textContent = desc;
                b.appendChild(top);
                b.appendChild(d);
                if (!locked) {
                    b.addEventListener("click", function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        onClick();
                    }, false);
                }
                return b;
            }

            var list = document.createElement("div");
            list.className = "csh-dbg-gamelist";

            /* 生涯大厅（§4.1.6）：总览入口，非游戏、免门票、不开收费屏。
               文案读 registry 单源（与 registry 的 career.desc 一致，不抄第二份）。 */
            (function () {
                var careerDesc = "战绩 / 官阶 / 成就 / AI 世界";
                try {
                    var rg = (typeof window !== "undefined" && window.CSH && window.CSH.registry) || null;
                    var c0 = rg && typeof rg.get === "function" ? rg.get("career") : null;
                    if (c0 && c0.desc) careerDesc = String(c0.desc);
                } catch (eR) {}
                list.appendChild(gameButton("生涯大厅", careerDesc, "总览", function () {
                    try {
                        if (lib.cshGames && lib.cshGames.openLobby) { lib.cshGames.openLobby(); return; }
                    } catch (eL) {}
                    toast("生涯大厅模块未加载（csh_games.js）");
                }, false));
            })();

            games.forEach(function (g) {
                list.appendChild(gameButton(
                    g.title,
                    g.stat ? (g.stat + " · " + g.desc) : g.desc,
                    g.tag,
                    function () { openGame(g.key); },
                    false
                ));
            });
            planned.forEach(function (p) {
                list.appendChild(gameButton(p.title, p.desc + "（筹备中）", p.tag, null, true));
            });
            body.appendChild(list);

            /* —— 音效档位块已删（2026-09-28 用户反馈「音效选项这里多余了，描述也多余」）：
               音量是全扩展共用一个值（csh_sfx 内部状态），各游戏开屏页已有各自的开关，
               这里的档位按钮与长描述属于重复入口。仍保留「音效」提示一行方便排障。 —— */
            (function () {
                var S = lib.cshSfx || (typeof window !== "undefined" ? window.CSH_SFX : null);
                if (!S) hint(body, "音效总线未加载（core/csh_sfx.js）。小游戏照常运行，只是没有声音。");
            })();

            /* 【2026-10-01】原文提「按 Esc」——手机没有 Esc 键；「面板保持在后台/回到面板」表述绕。
               精简为一句全平台都成立的话。【2026-10-03】按钮已并入卡片，文案同步。 */
            hint(body, "点卡片即开局；游戏内右上角 ✕ 随时返回。");
        }

        /** CDK 兑换面板（§4.5.7）——仅在唤起后构建 DOM，关闭即移除。
            输入体验：自动大写、忽略分隔符与空格、非法字符高亮（§4.5.4）。 */
        function openRedeem() {
            /* 【2026-09-30 修复】必须挂 uiHost()（documentElement），不能挂 document.body。
               原注释以为「挂 body 就能避开面板的 transform」，但真正的 transform 恰在 body 上：
               引擎在手机端给 body 设 transform:scale(deviceZoom)（390 宽时约 0.4，
               见 noname/ui/index.js 的 updatez/updated），body 由此建立**独立层叠上下文**。
               挂在 body 上的浮层无论 z-index 多大，都只能在该上下文内部比较，
               整体绘制在挂于 documentElement 的 #csh-dbg-overlay（z-index 1000001）之下
               ⇒ 表现为「必须关掉池子调试才能看见兑换面板」。
               同文件 ensureToastHost 用的正是 uiHost()，所以 toast 能盖住面板而兑换面板不能。 */
            var host = uiHost();
            var old = document.getElementById("csh-redeem");
            if (old && old.parentNode) old.parentNode.removeChild(old);
            var oldBg = document.getElementById("csh-redeem-bg");
            if (oldBg && oldBg.parentNode) oldBg.parentNode.removeChild(oldBg);

            /* 全屏暗幕：兑换面板成为真模态（点击暗幕/Esc 关闭） */
            var bg = document.createElement("div");
            bg.id = "csh-redeem-bg";
            host.appendChild(bg);

            var box = document.createElement("div");
            box.id = "csh-redeem";

            function kill() {
                if (box.parentNode) box.parentNode.removeChild(box);
                if (bg.parentNode) bg.parentNode.removeChild(bg);
                try { document.removeEventListener("keydown", box.__esc, true); } catch (eEsc) {}
            }
            box.__esc = function (e) {
                if (e.key !== "Escape" && e.keyCode !== 27) return;
                try { e.preventDefault(); e.stopPropagation(); } catch (_e) {}
                kill();
            };
            document.addEventListener("keydown", box.__esc, true);
            bg.addEventListener("click", function () { kill(); }, false);

            var t = document.createElement("div");
            t.className = "csh-rdm-title";
            t.textContent = "兑换码";

            var inp = document.createElement("input");
            inp.type = "text";
            inp.className = "csh-rdm-inp";
            inp.placeholder = "CSH1.xxxx… 或 CSH1-XXXXX-…";
            inp.autocomplete = "off";
            inp.spellcheck = false;

            var msg = document.createElement("div");
            msg.className = "csh-rdm-msg";

            var row = document.createElement("div");
            row.className = "csh-rdm-row";
            var go = document.createElement("button");
            go.type = "button";
            go.className = "csh-dbg-btn good";
            go.textContent = "兑换";
            var closeB = document.createElement("button");
            closeB.type = "button";
            closeB.className = "csh-dbg-btn";
            closeB.textContent = "关闭";
            row.appendChild(go);
            row.appendChild(closeB);

            /* 最近兑换记录（5 条） */
            var hist = document.createElement("div");
            hist.className = "csh-rdm-hist";

            /* 余额行（§4.5.7：面额 + 当前余额；兑换成功后 300ms 滚动到新余额） */
            var bal = document.createElement("div");
            bal.className = "csh-rdm-bal";

            /* 非法字符高亮：用只读镜像层叠加，真实 input 透明文字 */
            var mirrorWrap = document.createElement("div");
            mirrorWrap.className = "csh-rdm-mirror";
            var mirror = document.createElement("div");
            mirror.className = "csh-rdm-mirror-in";
            mirrorWrap.appendChild(mirror);

            var inputWrap = document.createElement("div");
            inputWrap.className = "csh-rdm-inputwrap";
            inputWrap.appendChild(mirrorWrap);
            inputWrap.appendChild(inp);

            /* 【2026-09-28 关键修复】旧版 norm 会 toUpperCase 并删掉所有 - 和 _：
               新码（Base64url 点号分隔）大小写敏感且段内含 - _，直接被毁；
               旧码（Base32 横杠分隔）分隔符被删后落入无分隔兜底，贪婪切分必错位。
               现在只做无害清洗：去空白/零宽字符 + 全角标点归一，其余原样保留。 */
            function norm(s) {
                return String(s || "")
                    .replace(/[\u200b-\u200f\u2028\u2029\uFEFF]/g, "")   /* 零宽/不可见 */
                    .replace(/[\s\u00a0\u3000]/g, "")                     /* 空白 */
                    .replace(/\uFF0D/g, "-")                              /* 全角 - */
                    .replace(/\uFF0E/g, ".")                              /* 全角 . */
                    .replace(/\u3002/g, ".");                             /* 中文句号 */
            }
            function highlight() {
                var raw = String(inp.value || "").toUpperCase();
                var html = "";
                for (var i = 0; i < raw.length; i++) {
                    var c = raw.charAt(i);
                    var good = /[A-Z0-9\-]/.test(c);
                    html += good ? escHtml(c) : '<i class="bad">' + escHtml(c) + "</i>";
                }
                mirror.innerHTML = html || "&nbsp;";
            }
            function escHtml(s) {
                return String(s).replace(/[&<>"]/g, function (m) {
                    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m];
                });
            }
            function setMsg(text, ok) {
                msg.textContent = text || "";
                msg.className = "csh-rdm-msg" + (ok === true ? " ok" : (ok === false ? " err" : ""));
            }
            function renderHist() {
                hist.innerHTML = "";
                var list = [];
                try { if (lib.cshWallet && lib.cshWallet.cdk) list = lib.cshWallet.cdk.recent() || []; } catch (e) { list = []; }
                var title = document.createElement("div");
                title.className = "csh-rdm-sub";
                title.textContent = list.length ? "最近兑换" : "";
                if (list.length) hist.appendChild(title);
                list.slice(0, 5).forEach(function (h) {
                    var li = document.createElement("div");
                    li.className = "csh-rdm-histrow";
                    var d = new Date(h.t || Date.now());
                    li.textContent = (d.getMonth() + 1) + "/" + d.getDate() + " " +
                        (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" +
                        (d.getMinutes() < 10 ? "0" : "") + d.getMinutes() +
                        "  +" + num(h.gained || h.amount || 0) + (h.capped ? "（已封顶）" : "");
                    hist.appendChild(li);
                });
            }
            function num(n) {
                return String(Math.floor(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            }
            /* 余额数字 300ms 滚动（§4.5.7）。用 rAF 缓动，不用 CSS transition —— 
               数字是文本内容，transition 不生效，只能逐帧写 textContent。 */
            function rollNum(el, to) {
                if (!el) return;
                var from = el.__cshFrom == null ? (Number(el.__cshVal) || 0) : el.__cshFrom;
                to = Math.floor(Number(to) || 0);
                el.__cshFrom = null;
                el.__cshVal = to;
                if (typeof requestAnimationFrame !== "function") { el.textContent = "余额 " + num(to); return; }
                var t0 = 0, DUR = 300;
                var step = function (now) {
                    if (!t0) t0 = now;
                    var k = Math.min(1, (now - t0) / DUR);
                    var e = 1 - Math.pow(1 - k, 3);            // easeOutCubic
                    el.textContent = "余额 " + num(from + (to - from) * e);
                    if (k < 1) requestAnimationFrame(step);
                    else el.textContent = "余额 " + num(to);
                };
                requestAnimationFrame(step);
            }
            function paintBal() {
                var v = 0;
                try { if (lib.cshWallet && lib.cshWallet.wallet) v = lib.cshWallet.wallet.pc() || 0; } catch (e) { v = 0; }
                bal.__cshVal = Math.floor(v);
                bal.textContent = "余额 " + num(v);
            }
            function doRedeem() {
                var code = norm(inp.value);
                if (!code) { setMsg("请输入兑换码", false); return; }
                var CDK = lib.cshWallet && lib.cshWallet.cdk;
                if (!CDK || typeof CDK.redeem !== "function") { setMsg("钱包模块未加载", false); return; }
                go.disabled = true;
                setMsg("校验中…", null);
                Promise.resolve(CDK.redeem(code)).then(function (r) {
                    go.disabled = false;
                    if (r && r.ok) {
                        setMsg("兑换成功 +" + num(r.gained) + "（余额 " + num(r.balance) + "）" +
                            (r.capped ? " · 受钱包上限钳制" : ""), true);
                        inp.value = "";
                        highlight();
                        renderHist();
                        try { if (lib.cshVoice && lib.cshVoice.play) lib.cshVoice.play("coin"); } catch (eV) {}
                        /* §4.5.7：兑换成功音效 + toast（面额 + 当前余额）+ 数字滚动 300ms */
                        sfx("redeem");
                        rollNum(bal, r.balance);
                    } else {
                        setMsg((r && r.reason) || "兑换失败", false);
                        sfx("ui.error");
                        renderHist();
                    }
                }, function (e) {
                    go.disabled = false;
                    setMsg("兑换失败：" + (e && e.message ? e.message : "未知错误"), false);
                    sfx("ui.error");
                });
            }

            inp.addEventListener("input", highlight, false);
            /* 镜像层跟随输入横向滚动：长码溢出后 mirror 恒显头部，尾部不可见（2026-09-30） */
            function syncMirrorScroll() {
                try { mirror.scrollLeft = inp.scrollLeft; } catch (eS) {}
            }
            inp.addEventListener("scroll", syncMirrorScroll, false);
            inp.addEventListener("input", syncMirrorScroll, false);
            inp.addEventListener("keydown", function (e) {
                if (e.key === "Enter") { e.preventDefault(); doRedeem(); }
            }, false);
            go.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); doRedeem(); }, false);
            closeB.addEventListener("click", function (e) {
                e.preventDefault(); e.stopPropagation();
                kill();
            }, false);

            box.appendChild(t);
            box.appendChild(inputWrap);
            box.appendChild(msg);
            box.appendChild(bal);
            box.appendChild(row);
            box.appendChild(hist);
            host.appendChild(box);
            renderHist();
            paintBal();
            setTimeout(function () { try { inp.focus(); } catch (eF) {} }, 30);
            /* 手机 webview：弹窗入场动画(.22s)期间的首聚焦会被吞掉——键盘迟迟不弹，
               等用户退出面板才冒出来（2026-09-30 反馈「退出池子调试才能出现这个框框」）。
               动画结束后补一次聚焦；仅当用户没在别处聚焦时才抢，避免打断手动操作。 */
            setTimeout(function () {
                try {
                    var ae = document.activeElement;
                    if (ae === document.body || ae == null) {
                        inp.focus();
                        if (inp.scrollIntoView) inp.scrollIntoView({ block: "center", behavior: "smooth" });
                    }
                } catch (eF2) {}
            }, 320);
        }

        /* 回填公开入口：本 IIFE 与上方 Debug Core 是**两个** IIFE，作用域互不可见。
           本 IIFE 装载时（页面加载即执行）把真实函数挂回 lib.cshDebug.openRedeem
           （上方字面量里初始为 null）。 */
        try { lib.cshDebug.openRedeem = openRedeem; } catch (eRdmExp) {}
        /* 同理回填 toast（见上方 lib.cshDebug 字面量里的注释）：
           AI 互动面板等模块靠 lib.cshDebug.toast 才能在面板之上显示提示。 */
        try { if (typeof toast === "function") lib.cshDebug.toast = toast; } catch (eTstExp) {}

        /* ==================== 技能代码查看器 · 2026-09-28 ====================
           只读浮层：把 lib.skill[id] 的定义序列化成类源码文本（函数保真 toString，
           其余 JSON 化），供「查看技能代码」入口弹出。关闭即销毁。 */
        function skillCodeText(id) {
            var def = null;
            try { def = (lib.skill || {})[id] || null; } catch (e0) { def = null; }
            if (!def) return "// lib.skill." + id + " 不存在（可能是动态技能或已被移除）";
            function ser(v, depth) {
                var pad = "";
                for (var i = 0; i < depth; i++) pad += "    ";
                if (typeof v === "function") {
                    var src = String(v);
                    return src.split("\n").map(function (l, li) {
                        return li === 0 ? l : pad + l;
                    }).join("\n");
                }
                if (v === null || v === undefined) return String(v);
                var vt = typeof v;
                if (vt === "object") {
                    if (depth >= 3) return Array.isArray(v) ? "[…]" : "{…}";
                    if (Array.isArray(v)) {
                        return "[\n" + v.map(function (x) {
                            return pad + "    " + ser(x, depth + 1);
                        }).join(",\n") + "\n" + pad + "]";
                    }
                    var inner = [];
                    try {
                        for (var k in v) {
                            if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
                            inner.push(pad + "    " + JSON.stringify(k) + ": " + ser(v[k], depth + 1));
                        }
                    } catch (e1) { return "{…}"; }
                    return "{\n" + inner.join(",\n") + "\n" + pad + "}";
                }
                try { return JSON.stringify(v); } catch (e2) { return String(v); }
            }
            var out = ["// 技能 id: " + id, "lib.skill[" + JSON.stringify(id) + "] = {"];
            try {
                for (var key in def) {
                    if (!Object.prototype.hasOwnProperty.call(def, key)) continue;
                    out.push("    " + JSON.stringify(key) + ": " + ser(def[key], 1) + ",");
                }
            } catch (e3) {}
            out.push("};");
            return out.join("\n");
        }
        /** 浮层通用样式（技能代码查看器 / 卡牌详情共用），幂等注入一次 */
        function ensureFloatStyle() {
            if (document.getElementById("csh-skc-style")) return;
            var st = document.createElement("style");
            st.id = "csh-skc-style";
            st.textContent = [
                "#csh-skillcode .csh-skc-btn,#csh-cardinfo .csh-skc-btn{padding:5px 12px;border-radius:8px;border:1px solid rgba(var(--csh-bg-rgb),.12);",
                "background:var(--csh-fg);color:var(--csh-bg);font-size:12.5px;font-weight:500;cursor:pointer;line-height:1.4;font-family:inherit;",
                "box-shadow:0 1px 1px rgba(var(--csh-bg-rgb),.03);",
                "transition:background .16s ease,color .16s ease,border-color .16s ease,box-shadow .16s ease;}",
                "#csh-skillcode .csh-skc-btn:hover,#csh-cardinfo .csh-skc-btn:hover{background:var(--csh-accent);color:var(--csh-accent-ink);border-color:var(--csh-accent);}",
                "#csh-cardinfo .csh-ci-row{display:flex!important;gap:8px!important;align-items:flex-start!important;margin:6px 0!important;",
                "font-size:12.5px!important;line-height:1.6!important;position:static!important;}",
                "#csh-cardinfo .csh-ci-k{flex:0 0 62px!important;color:var(--csh-gray)!important;position:static!important;}",
                "#csh-cardinfo .csh-ci-v{flex:1 1 auto!important;min-width:0!important;color:var(--csh-bg)!important;position:static!important;word-break:break-word!important;}",
                "#csh-cardinfo .csh-ci-desc{display:block!important;margin:12px 0 0!important;padding:13px 15px!important;border-radius:10px!important;",
                "background:var(--csh-light)!important;border:1px solid rgba(var(--csh-bg-rgb),.08)!important;border-left:3px solid var(--csh-accent)!important;",
                "color:var(--csh-bg)!important;font-size:13px!important;line-height:1.7!important;white-space:pre-wrap!important;position:static!important;}",
                "#csh-cardinfo .csh-ci-img{display:block!important;margin:0 auto 14px!important;max-width:100%!important;border-radius:10px!important;",
                "border:1px solid rgba(var(--csh-bg-rgb),.12)!important;position:static!important;}",
                /* ---------- 浮层骨架：单一真值来源 ----------
                 * 技能代码 / 卡牌详情的外观全部由此处 CSS 接管（覆盖内联 cssText），
                 * 这样「渲染截图 harness」只需捕获本函数即可，永不再手抄样式副本
                 * （血泪 #25：手抄副本漂移 → 截图排版散架 → 差点误判成产品 bug）。 */
                "#csh-skillcode,#csh-cardinfo{position:fixed!important;left:0!important;top:0!important;width:100%!important;height:100%!important;",
                "display:flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;",
                "z-index:2147483000!important;padding:18px!important;",
                "background:rgba(var(--csh-bg-deep-rgb),.52)!important;",
                "-webkit-backdrop-filter:blur(12px) saturate(130%)!important;backdrop-filter:blur(12px) saturate(130%)!important;}",
                "#csh-skillcode>div,#csh-cardinfo>div{box-sizing:border-box!important;max-height:88%!important;",
                "background:var(--csh-fg)!important;border:1px solid rgba(var(--csh-bg-rgb),.10)!important;border-radius:14px!important;",
                "box-shadow:0 2px 6px rgba(var(--csh-bg-rgb),.06),0 24px 56px -20px rgba(var(--csh-bg-rgb),.30)!important;",
                "font-family:system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif!important;}",
                "#csh-skillcode>div{width:min(780px,96%)!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;}",
                "#csh-cardinfo>div{width:min(500px,96%)!important;display:block!important;overflow:auto!important;padding:20px!important;}",
                "#csh-skillcode>div>div>div>button,#csh-skillcode>div>div>button,#csh-cardinfo>div>div>button{position:static!important;}",
                "#csh-skillcode>div>div>b,#csh-cardinfo>div>div>b{color:var(--csh-accent)!important;background:var(--csh-ink-plate)!important;border:1px solid var(--csh-ink-plate)!important;",
                "border-radius:8px!important;font-weight:600!important;line-height:1.4!important;overflow:hidden!important;",
                "text-overflow:ellipsis!important;white-space:nowrap!important;box-sizing:border-box!important;flex:0 0 auto!important;}",
                "#csh-skillcode>div>div>b{font-size:12px!important;padding:5px 11px!important;max-width:190px!important;}",
                "#csh-cardinfo>div>div>b{font-size:14px!important;padding:7px 11px!important;flex:0 0 auto!important;max-width:58%!important;}",
                "#csh-skillcode>div>div{position:absolute!important;right:10px!important;top:10px!important;z-index:2!important;",
                "display:flex!important;align-items:center!important;gap:8px!important;}",
                "#csh-cardinfo>div>div{position:static!important;display:flex!important;align-items:center!important;gap:10px!important;margin:0 0 16px!important;}",
                /* chip 自适应宽（不拉成长条），按钮组自动靠右：标题左·操作右的经典模态头 */
                "#csh-cardinfo>div>div>b+button{margin-left:auto!important;}",
                "#csh-skillcode>div>pre{flex:1 1 auto!important;overflow:auto!important;margin:0!important;padding:46px 18px 16px!important;",
                "background:var(--csh-light)!important;color:var(--csh-bg)!important;font-variant-numeric:tabular-nums!important;",
                "font-family:ui-monospace,'Cascadia Mono','SF Mono',Consolas,monospace!important;",
                "font-size:12px!important;line-height:1.55!important;white-space:pre!important;text-align:left!important;}",
            ].join("");
            (document.head || document.documentElement).appendChild(st);
        }

        function showSkillCode(id) {
            /* 同 openRedeem：必须挂 uiHost()，挂 body 会被 body 的 transform 层叠上下文压制 */
            var host = uiHost();
            var old = document.getElementById("csh-skillcode");
            if (old && old.parentNode) old.parentNode.removeChild(old);

            var box = document.createElement("div");
            box.id = "csh-skillcode";
            box.style.cssText = "position:fixed;left:0;top:0;width:100%;height:100%;z-index:2147483000;" +
                "background:rgba(var(--csh-bg-deep-rgb),.52);-webkit-backdrop-filter:blur(12px) saturate(130%);backdrop-filter:blur(12px) saturate(130%);" +
                "display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;";

            /* D2：操作条（标题 + 复制全部 + 关闭）悬浮在代码区右上角。
               仅改定位，DOM 层级与关闭逻辑完全不变；pre 预留顶部内边距，代码首行不再与标题贴挤。 */
            ensureFloatStyle();

            var inner = document.createElement("div");
            inner.style.cssText = "position:relative;width:min(780px,96%);max-height:88%;display:flex;flex-direction:column;" +
                "background:var(--csh-fg);border:1px solid rgba(var(--csh-bg-rgb),.10);border-radius:14px;overflow:hidden;" +
                "box-shadow:0 2px 6px rgba(var(--csh-bg-rgb),.06),0 24px 56px -20px rgba(var(--csh-bg-rgb),.30);font-family:system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;";

            var head = document.createElement("div");
            head.style.cssText = "position:absolute;right:10px;top:10px;z-index:2;display:flex;align-items:center;gap:8px;";
            var title = document.createElement("b");
            title.style.cssText = "color:var(--csh-accent);font-size:12px;font-weight:600;line-height:1.4;padding:5px 11px;border-radius:8px;" +
                "background:var(--csh-ink-plate);border:1px solid var(--csh-ink-plate);max-width:190px;" +
                "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
            title.textContent = "技能代码 · " + id;
            var copyB = document.createElement("button");
            copyB.type = "button";
            copyB.className = "csh-skc-btn";
            copyB.textContent = "复制全部";
            var closeB = document.createElement("button");
            closeB.type = "button";
            closeB.className = "csh-skc-btn";
            closeB.textContent = "关闭";
            head.appendChild(title); head.appendChild(copyB); head.appendChild(closeB);

            var pre = document.createElement("pre");
            pre.style.cssText = "flex:1 1 auto;overflow:auto;margin:0;padding:46px 18px 16px;background:var(--csh-light);color:var(--csh-bg);font-variant-numeric:tabular-nums;" +
                "font-family:ui-monospace,'Cascadia Mono','SF Mono',Consolas,monospace;font-size:12px;line-height:1.55;white-space:pre;text-align:left;";
            pre.textContent = skillCodeText(id);

            inner.appendChild(head); inner.appendChild(pre);
            box.appendChild(inner);
            host.appendChild(box);

            function shut() { if (box.parentNode) box.parentNode.removeChild(box); }
            closeB.addEventListener("click", function (e) { e.preventDefault(); shut(); }, false);
            copyB.addEventListener("click", function (e) {
                e.preventDefault();
                try {
                    var txt = pre.textContent;
                    var ta = document.createElement("textarea");
                    ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
                    document.body.appendChild(ta); ta.select();
                    document.execCommand("copy");
                    document.body.removeChild(ta);
                    copyB.textContent = "已复制";
                    setTimeout(function () { copyB.textContent = "复制全部"; }, 1200);
                } catch (eC) {}
            }, false);
            box.addEventListener("click", function (e) {
                if (e.target === box) shut();
            }, false);
        }

        /* ==================== 卡牌详情浮层 · §4.6.4（D3） ====================
           单例、不堆叠：进入先移除旧节点，连点不同卡＝原地替换内容（界面同步）。
           入口：卡牌列表项右键（PC）/ 长按 550ms（PC + 手机）。 */
        function showCardInfo(id) {
            var prev = document.getElementById("csh-cardinfo");
            if (prev && prev.parentNode) prev.parentNode.removeChild(prev);

            var cardDef = null;
            try { cardDef = lib.card && lib.card[id]; } catch (e0) {}

            function tName(t) {
                var m = { basic: "基本牌", trick: "锦囊牌", equip: "装备牌", delay: "延时锦囊牌" };
                return m[t] || t || "未知";
            }
            function sName(s) {
                if (!s) return "";
                var m = { equip1: "武器", equip2: "防具", equip3: "坐骑（+1）", equip4: "坐骑（-1）", equip5: "宝物" };
                if (m[s]) return m[s];
                var t2 = tr(s);
                return (t2 && t2 !== s) ? t2 : s;
            }
            function cName(s) {
                var m = { spade: "♠ 黑桃", heart: "♥ 红桃", club: "♣ 梅花", diamond: "♦ 方块" };
                return m[s] || "无花色";
            }

            var name = tr(id) || id;
            var typeTxt = "未知", subTxt = "", colorTxt = "无花色";
            try { typeTxt = tName(get.type(id)); } catch (e1) {}
            try { subTxt = sName(cardDef && cardDef.subtype); } catch (e2) {}
            try { colorTxt = cName(cardDef && cardDef.cardcolor); } catch (e3) {}

            var desc = "";
            try {
                var raw = lib.translate && lib.translate[id + "_info"];
                if (typeof raw === "string" && raw) desc = raw;
            } catch (e4) {}
            if (!desc && cardDef && typeof cardDef.info === "string") desc = cardDef.info;

            /* 【2026-10-03 用户实机反馈｜「来源包」恒显「未收录」】
               lib.cardPack[包] 是**卡牌 id 数组**：noname/init/loading.js（.add）、
               library/element/content.js（.push）、game/index.js（.push ×2）四处都是往数组里塞，
               引擎自带的卡包菜单也按 `info.length` / `info[i]` 读（cardPackMenu.js）。
               旧代码却用 Object.prototype.hasOwnProperty.call(g, id) 按「对象键」查 ——
               在数组上恒为 false ⇒ 任何卡牌都显示「未收录」。
               修法：按成员判断（数组 indexOf；Set.has、对象键查作为防御性兼容），
               显示名与引擎同源取 lib.translate[包名 + "_card_config"]（standard → 标准、
               mode_boss → 挑战卡牌、扩展包 → 扩展名），没有译文才退回原始包名。 */
            var packs = [];
            try {
                var cp = lib.cardPack || {};
                for (var pk in cp) {
                    if (!Object.prototype.hasOwnProperty.call(cp, pk)) continue;
                    var g = cp[pk];
                    var hit = false;
                    if (typeof g === "string") hit = g === id;
                    else if (Object.prototype.toString.call(g) === "[object Array]") hit = g.indexOf(id) !== -1;
                    else if (typeof Set !== "undefined" && g instanceof Set) hit = g.has(id);
                    else if (g && typeof g === "object") hit = Object.prototype.hasOwnProperty.call(g, id);
                    if (!hit) continue;
                    var pn = "";
                    try {
                        var pt = lib.translate && lib.translate[pk + "_card_config"];
                        if (typeof pt === "string" && pt) pn = safeStr(pt) || pk;
                    } catch (eT) {}
                    if (!pn) pn = pk;
                    if (packs.indexOf(pn) === -1) packs.push(pn);
                }
            } catch (e5) {}

            ensureFloatStyle();

            var box = document.createElement("div");
            box.id = "csh-cardinfo";
            box.style.cssText = "position:fixed;left:0;top:0;width:100%;height:100%;z-index:2147483000;" +
                "background:rgba(var(--csh-bg-deep-rgb),.52);-webkit-backdrop-filter:blur(12px) saturate(130%);backdrop-filter:blur(12px) saturate(130%);" +
                "display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;";

            var inner = document.createElement("div");
            inner.style.cssText = "position:relative;width:min(500px,96%);max-height:88%;overflow:auto;box-sizing:border-box;" +
                "background:var(--csh-fg);border:1px solid rgba(var(--csh-bg-rgb),.10);border-radius:14px;padding:20px;" +
                "box-shadow:0 2px 6px rgba(var(--csh-bg-rgb),.06),0 24px 56px -20px rgba(var(--csh-bg-rgb),.30);font-family:system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;";
            inner.addEventListener("click", function (e) { e.stopPropagation(); }, false);

            var headRow = document.createElement("div");
            headRow.style.cssText = "position:static;display:flex;align-items:center;gap:10px;margin:0 0 16px;";
            var title = document.createElement("b");
            /* 标题墨底黄字 chip：与技能代码查看器同款（黄字在纸白上仅 1.6:1，必须给深底）。
               宽度随内容自适应（绝不用 flex:1 拉成长条——单字卡名会撑成黑杠，重心失衡）。 */
            title.style.cssText = "color:var(--csh-accent);font-size:14px;font-weight:600;flex:0 0 auto;max-width:58%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" +
                "background:var(--csh-ink-plate);border:1px solid var(--csh-ink-plate);border-radius:8px;padding:7px 11px;box-sizing:border-box;";
            title.textContent = name;
            headRow.appendChild(title);
            var copyB = document.createElement("button");
            copyB.type = "button";
            copyB.className = "csh-skc-btn";
            copyB.textContent = "复制 ID";   /* 靠右对齐由 ensureFloatStyle 的 `b+button{margin-left:auto}` 负责（单一真值） */
            var closeB = document.createElement("button");
            closeB.type = "button";
            closeB.className = "csh-skc-btn";
            closeB.textContent = "关闭";
            headRow.appendChild(copyB);
            headRow.appendChild(closeB);
            inner.appendChild(headRow);

            /* 卡面图：取 lib.card[id].image；加载失败即自移除，绝不留破图 */
            try {
                var imgPath = "";
                if (cardDef && typeof cardDef.image === "string" && cardDef.image.indexOf(".") !== -1) imgPath = cardDef.image;
                else if (cardDef && typeof cardDef.image2 === "string" && cardDef.image2.indexOf(".") !== -1) imgPath = cardDef.image2;
                if (imgPath) {
                    var img = document.createElement("img");
                    img.className = "csh-ci-img";
                    img.src = imgPath;
                    img.addEventListener("error", function () { if (img.parentNode) img.parentNode.removeChild(img); }, false);
                    inner.appendChild(img);
                }
            } catch (e6) {}

            function row(k, v) {
                if (!v) return;
                var r = document.createElement("div");
                r.className = "csh-ci-row";
                var kEl = document.createElement("div");
                kEl.className = "csh-ci-k";
                kEl.textContent = k;
                var vEl = document.createElement("div");
                vEl.className = "csh-ci-v";
                vEl.textContent = v;
                r.appendChild(kEl);
                r.appendChild(vEl);
                inner.appendChild(r);
            }
            row("ID", id);
            row("类别", typeTxt + (subTxt ? " · " + subTxt : ""));
            row("花色", colorTxt);
            row("来源包", packs.length ? packs.join(" / ") : "未收录");

            var dEl = document.createElement("div");
            dEl.className = "csh-ci-desc";
            dEl.textContent = desc || "（库中无描述）";
            inner.appendChild(dEl);

            box.appendChild(inner);
            /* 同 openRedeem：挂 uiHost()，挂 body 会被 body 的 transform 层叠上下文压制 */
            uiHost().appendChild(box);

            function shut() { if (box.parentNode) box.parentNode.removeChild(box); }
            closeB.addEventListener("click", function (e) { e.preventDefault(); shut(); }, false);
            copyB.addEventListener("click", function (e) {
                e.preventDefault();
                try {
                    var ta = document.createElement("textarea");
                    ta.value = id; ta.style.position = "fixed"; ta.style.opacity = "0";
                    document.body.appendChild(ta); ta.select();
                    document.execCommand("copy");
                    document.body.removeChild(ta);
                    copyB.textContent = "已复制";
                    setTimeout(function () { copyB.textContent = "复制 ID"; }, 1200);
                } catch (eC) {}
            }, false);
            /* 【2026-10-01 真机修复｜问题 2 的真正根因】本浮层常由「长按卡牌」在**手指仍按着**时创建
               （550ms 定时器），而 box 是全屏遮罩 —— 手指一松开，这次触摸的 click 会命中
               刚刚出现的遮罩本身，于是立刻撞上「点背景关闭」。
               真机实测：`+csh-cardinfo@1118ms` 出现、`-csh-cardinfo@1475ms` 消失，
               即**弹出后 357ms 就被同一次手势的松手关掉**，用户根本来不及看
               —— 表现为「长按没有弹出信息」（问题 2 报的就是这个）。
               修法：只认「浮层出现之后再按过一次」背景关闭，创建它的那一次手势不算。 */
            var armClose = false;
            box.addEventListener("pointerdown", function () { armClose = true; }, false);
            box.addEventListener("click", function (e) { if (e.target === box && armClose) shut(); }, false);
        }

        /* ==================== 技能详情层 · §4.6.2 ====================
           同层替换（不是再叠一个弹窗）：进入详情时把列表区整体换成详情，
           返回时重画列表。状态（搜索词、目标）留在闭包里，返回后原样恢复。 */
        function renderSkillDetail(box, it, onBack) {
            while (box.firstChild) box.removeChild(box.firstChild);

            var wrap = document.createElement("div");
            wrap.className = "csh-dbg-detail";

            var back = document.createElement("button");
            back.type = "button";
            back.className = "csh-dbg-dt-back";
            back.textContent = "\u2039 返回列表";
            back.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof onBack === "function") onBack();
            }, false);
            wrap.appendChild(back);

            /* ① 技能名：优先中文名，无中文名时退 id */
            var nm = document.createElement("div");
            nm.className = "csh-dbg-dt-name";
            nm.textContent = it.name || it.id;
            wrap.appendChild(nm);

            /* ② 标签行：ID / 来源包 / 势力 */
            var meta = skillMetaOf(it.id);
            var tags = document.createElement("div");
            tags.className = "csh-dbg-dt-tags";
            function tag(text, cls) {
                var t = document.createElement("span");
                t.className = "csh-dbg-dt-tag" + (cls ? " " + cls : "");
                t.textContent = text;
                tags.appendChild(t);
            }
            tag("ID " + it.id, "mono");
            if (meta.packs.length) tag("来源包 " + meta.packs.join(" / "), "k-src");
            else tag("来源包 未收录", "k-src");
            if (meta.camps.length) tag("势力 " + meta.camps.join(" / "), "k-camp");
            else tag("势力 未知", "k-camp");
            wrap.appendChild(tags);

            /* ③ 官方技能描述：lib.translate[id + "_info"]；缺失时显式说明，绝不显示空白 */
            var text = "";
            try {
                var raw = lib.translate && lib.translate[it.id + "_info"];
                if (typeof raw === "string") text = String(raw).trim();
            } catch (eInfo) {}
            if (!text) {
                try {
                    var raw2 = lib.translate && lib.translate[it.id];
                    /* 名字本身不等于描述：只有当它明显长于名字时才当描述用 */
                    if (typeof raw2 === "string" && raw2.length > (it.name || "").length + 4) text = String(raw2).trim();
                } catch (eInfo2) {}
            }
            var bodyEl = document.createElement("div");
            bodyEl.className = "csh-dbg-dt-body" + (text ? "" : " none");
            bodyEl.textContent = text || "（库中无描述）";
            wrap.appendChild(bodyEl);

            /* ④ 相关词条：该技能的额外字段（如 selectTarget/usable/source…）摘要 */
            var entries = [];
            try {
                var info = lib.skill && lib.skill[it.id];
                if (info && typeof info === "object") {
                    var keys = Object.getOwnPropertyNames(info);
                    for (var i = 0; i < keys.length && entries.length < 12; i++) {
                        var k = keys[i];
                        if (k === "name" || k === "info" || k.charAt(0) === "_") continue;
                        var v = info[k];
                        var vt = typeof v;
                        if (vt === "function") entries.push([k, "函数"]);
                        else if (vt === "string") entries.push([k, v.length > 26 ? v.slice(0, 26) + "…" : v]);
                        else if (vt === "number" || vt === "boolean") entries.push([k, String(v)]);
                        else if (Object.prototype.toString.call(v) === "[object Array]") entries.push([k, "[" + v.length + " 项]"]);
                        else if (v && vt === "object") entries.push([k, "{对象}"]);
                    }
                }
            } catch (eKeys) {}
            if (entries.length) {
                var h = document.createElement("div");
                h.className = "csh-dbg-dt-h";
                h.textContent = "相关词条";
                wrap.appendChild(h);
                var list = document.createElement("div");
                list.className = "csh-dbg-dt-entries";
                entries.forEach(function (pair) {
                    var e = document.createElement("span");
                    e.className = "csh-dbg-dt-entry";
                    var b = document.createElement("b");
                    b.textContent = pair[0] + " ";
                    e.appendChild(b);
                    e.appendChild(document.createTextNode(pair[1]));
                    list.appendChild(e);
                });
                wrap.appendChild(list);
            }

            /* ④′ 查看技能代码（2026-09-28 用户要求）：弹出只读源码浮层 */
            (function () {
                var codeBtn = document.createElement("button");
                codeBtn.type = "button";
                codeBtn.className = "csh-dbg-btn";
                codeBtn.textContent = "查看技能代码";
                codeBtn.style.cssText = "margin-top:10px;width:100%;";
                codeBtn.addEventListener("click", function (ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    showSkillCode(it.id);
                }, false);
                wrap.appendChild(codeBtn);
            })();

            /* ⑤ 代表武将：帮玩家确认到底是哪个版本的技能 */
            if (meta.chars.length) {
                var h2 = document.createElement("div");
                h2.className = "csh-dbg-dt-h";
                h2.textContent = "持有武将";
                wrap.appendChild(h2);
                var cl = document.createElement("div");
                cl.className = "csh-dbg-dt-entries";
                meta.chars.forEach(function (cid) {
                    var e2 = document.createElement("span");
                    e2.className = "csh-dbg-dt-entry";
                    var b2 = document.createElement("b");
                    b2.textContent = tr(cid) || cid;
                    e2.appendChild(b2);
                    var camp = campTextOf(cid);
                    if (camp) e2.appendChild(document.createTextNode(" " + camp));
                    cl.appendChild(e2);
                });
                wrap.appendChild(cl);
            }

            box.appendChild(wrap);
        }

        /* ==================== 武将详情层 · §4.6.2（D1） ====================
           与 renderSkillDetail 同一套「同层替换」模式：进入武将详情 → 列出该武将全部技能；
           点某项再进技能详情，返回时回到本武将详情（链路：列表 ⇄ 武将 ⇄ 技能）。 */
        function renderCharacterDetail(box, ch, onBack) {
            while (box.firstChild) box.removeChild(box.firstChild);

            var wrap = document.createElement("div");
            wrap.className = "csh-dbg-detail";

            var back = document.createElement("button");
            back.type = "button";
            back.className = "csh-dbg-dt-back";
            back.textContent = "\u2039 返回列表";
            back.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof onBack === "function") onBack();
            }, false);
            wrap.appendChild(back);

            var nm = document.createElement("div");
            nm.className = "csh-dbg-dt-name";
            nm.textContent = ch.name || ch.id;
            wrap.appendChild(nm);

            var tags = document.createElement("div");
            tags.className = "csh-dbg-dt-tags";
            function tag(text, cls) {
                var t = document.createElement("span");
                t.className = "csh-dbg-dt-tag" + (cls ? " " + cls : "");
                t.textContent = text;
                tags.appendChild(t);
            }
            tag("ID " + ch.id, "mono");
            tag("来源包 " + (ch.pack || "未收录"), "k-src");
            tag("势力 " + (campTextOf(ch.id) || "未知"), "k-camp");
            tag(ch.skills.length + " 个技能", "k-skill");
            wrap.appendChild(tags);

            var skillsWrap = document.createElement("div");
            skillsWrap.className = "csh-dbg-ch-skills";
            if (!ch.skills.length) {
                var none = document.createElement("div");
                none.className = "csh-dbg-empty";
                none.textContent = "该武将在库中未登记技能";
                skillsWrap.appendChild(none);
            } else {
                ch.skills.forEach(function (sid) {
                    var name = sid;
                    try {
                        if (lib.translate && typeof lib.translate[sid] === "string") name = lib.translate[sid];
                    } catch (eT) {}
                    name = safeStr(name) || sid;

                    var row = document.createElement("div");
                    row.className = "csh-dbg-sk";
                    row.setAttribute("role", "button");
                    row.setAttribute("tabindex", "0");
                    row.setAttribute("title", "点击查看技能详情");

                    var info = document.createElement("div");
                    info.className = "csh-dbg-sk-info";
                    var nEl = document.createElement("div");
                    nEl.className = "n";
                    nEl.textContent = name;
                    var idEl = document.createElement("div");
                    idEl.className = "id";
                    idEl.textContent = sid;
                    info.appendChild(nEl);
                    info.appendChild(idEl);
                    row.appendChild(info);

                    var acts = document.createElement("div");
                    acts.className = "csh-dbg-sk-acts";
                    var vb = document.createElement("button");
                    vb.type = "button";
                    vb.className = "add";
                    vb.textContent = "详情";
                    var open = function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        renderSkillDetail(box, { id: sid, name: name }, function () {
                            renderCharacterDetail(box, ch, onBack);
                        });
                    };
                    vb.addEventListener("click", open, true);
                    acts.appendChild(vb);
                    row.appendChild(acts);
                    row.addEventListener("click", open, false);
                    row.addEventListener("keydown", function (e) {
                        if (e.key === "Enter" || e.key === " ") open(e);
                    }, false);
                    skillsWrap.appendChild(row);
                });
            }
            wrap.appendChild(skillsWrap);

            box.appendChild(wrap);
        }

        /* ==================== 配置方案 · §4.6.3 ==================== */
        var PS_FB_HOME = null;
        /* 【2026-09-30 修复】技能页的「目标」此前被渲染了两份（顶部工具行 + 下方配置方案区），
           各自持有独立闭包 state、互不同步 —— 在顶部选了玩家 3，下面点「一键装载」仍装给自己。
           这属于数据正确性问题，不只是视觉冗余。这里收敛为单一共享 state：
           两处读写同一份，选一次两边都跟着变，文案也统一为共享函数的「名字（自己）」形式。 */
        var skillTargetShared = { target: null };
        /* 【2026-10-03 用户反馈「冗余多余描述」】原「一键装载作用于：自己（目标改在页面顶部）」
           只读提示已删除 —— 目标就在页面顶部的选择器里，玩家改那里就生效；
           再复述一遍等于把同一件事说两次（且占了一整行高度）。
           技能页顶部与「配置方案」区共用 skillTargetShared，选一次两边同步。 */

        function renderPresets(body) {
            var list = psRead();

            /* —— 反馈条：加载中 / 成功 / 部分失败 三态，可展开失败明细（§4.6.3）—— */
            function feedback(state, text, fails) {
                var old = PS_FB_HOME;
                if (old && old.parentNode) old.parentNode.removeChild(old);
                var fb = document.createElement("div");
                fb.className = "csh-dbg-psfb " + state;
                var line = document.createElement("span");
                line.textContent = text;
                fb.appendChild(line);
                if (fails && fails.length) {
                    var tg = document.createElement("span");
                    tg.className = "fb-toggle";
                    tg.textContent = "查看明细";
                    line.appendChild(tg);
                    var fl = document.createElement("div");
                    fl.className = "fb-list";
                    fl.style.display = "none";
                    fl.textContent = fails.join("\n");
                    tg.addEventListener("click", function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        fl.style.display = fl.style.display === "none" ? "block" : "none";
                        tg.textContent = fl.style.display === "none" ? "查看明细" : "收起明细";
                    }, false);
                    fb.appendChild(fl);
                }
                /* 插在标题下方：找不到就退到 body 末尾 */
                var anchor = body.querySelector(".csh-dbg-psfb-anchor");
                if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(fb, anchor.nextSibling);
                else body.appendChild(fb);
                PS_FB_HOME = fb;
            }

            /* —— 目标：**不再重复渲染下拉**，改为只读提示（2026-09-30 第六轮）——
               技能页顶部已有同一个目标选择器（共用 skillTargetShared）。此处原先再渲染一个 select，
               实机截图里就出现「两个『目标：自己』」。状态仍共用，这里只显示当前生效目标。 */
            var state = skillTargetShared;
            var plist = allPlayers();
            var meP = me();
            var defIdx = 0;
            for (var di = 0; di < plist.length; di++) if (meP && plist[di] === meP) defIdx = di;
            if (state.target == null) state.target = plist.length ? String(defIdx) : "me";
            var tool = document.createElement("div");
            tool.className = "csh-dbg-tool";
            body.appendChild(tool);

            var anchor = document.createElement("div");
            anchor.className = "csh-dbg-psfb-anchor";
            body.appendChild(anchor);

            function resolveTarget() {
                if (state.target === "me") return needMe();
                var i = parseInt(state.target, 10);
                var l = allPlayers();
                return l[i] || needMe();
            }

            sec(body, "方案列表", list.length + " 套");
            var newBtn = mkBtn("从当前选择新建", function () {
                var t = resolveTarget();
                if (!t) return;
                var cur = psSkillsOf(t);
                if (!cur.length) return toast("目标当前没有技能，无法新建方案");
                var arr = psRead();
                var defName = "方案 " + (arr.length + 1);
                askText("新方案名称", defName, function (name) {
                    if (name == null) return;
                    name = String(name).trim();
                    if (!name) return toast("名称不能为空");
                    if (psFind(arr, name) !== -1) return toast("同名方案已存在");
                    arr.push({ name: name, skills: cur, ts: Date.now() });
                    if (!psWrite(arr)) return toast("保存失败（存储不可用）");
                    toast("已新建「" + name + "」· " + cur.length + " 个技能");
                    renderBody(body, "preset");
                });
            }, "good");
            newBtn.style.cssText += "min-height:44px;";
            body.appendChild(newBtn);

            if (!list.length) {
                hint(body, "还没有方案。选中一个角色后点「从当前选择新建」，即可把它的技能存成一套方案。");
            }

                var box = document.createElement("div");
                /* 【2026-10-03】不用 .csh-dbg-gamelist —— 它现在是池子休闲的按钮网格；
                   方案卡是横向条目，用独立容器类保持单列堆叠。 */
                box.className = "csh-dbg-pslist";
                list.forEach(function (ps) {
                var card = document.createElement("div");
                card.className = "csh-dbg-preset";

                var mainEl = document.createElement("div");
                mainEl.className = "ps-main";
                var nEl = document.createElement("div");
                nEl.className = "ps-name";
                nEl.textContent = ps.name;
                var mEl = document.createElement("div");
                mEl.className = "ps-meta";
                mEl.textContent = ps.skills.length + " 个技能 · 更新于 " + psStamp(ps.ts);
                mainEl.appendChild(nEl);
                mainEl.appendChild(mEl);
                card.appendChild(mainEl);

                var acts = document.createElement("div");
                acts.className = "ps-acts";

                /* 一键装载（§4.6.3，红线 #12：动数据前必须先确认） */
                var load = document.createElement("button");
                load.type = "button";
                load.className = "csh-dbg-btn good";
                load.textContent = "一键装载";
                load.addEventListener("click", function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    var t = resolveTarget();
                    if (!t) return;
                    askPick("装载「" + ps.name + "」到 " + (tr(t) || t.name) + "？\n将替换其全部技能", ["确认装载", "取消"], function (i) {
                        if (i !== 0) return;
                        doLoad(t, ps);
                    });
                }, false);
                acts.appendChild(load);

                var ov = document.createElement("button");
                ov.type = "button";
                ov.className = "csh-dbg-btn";
                ov.textContent = "覆盖";
                ov.addEventListener("click", function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    var t = resolveTarget();
                    if (!t) return;
                    var cur = psSkillsOf(t);
                    if (!cur.length) return toast("目标当前没有技能");
                    askPick("用当前选择覆盖「" + ps.name + "」？", ["确认覆盖", "取消"], function (i) {
                        if (i !== 0) return;
                        var arr = psRead();
                        var k = psFind(arr, ps.name);
                        if (k === -1) return toast("方案已不存在");
                        arr[k].skills = cur;
                        arr[k].ts = Date.now();
                        if (!psWrite(arr)) return toast("保存失败");
                        toast("已覆盖「" + ps.name + "」· " + cur.length + " 个技能");
                        renderBody(body, "preset");
                    });
                }, false);
                acts.appendChild(ov);

                var rn = document.createElement("button");
                rn.type = "button";
                rn.className = "csh-dbg-btn";
                rn.textContent = "重命名";
                rn.addEventListener("click", function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    askText("重命名为", ps.name, function (name) {
                        if (name == null) return;
                        name = String(name).trim();
                        if (!name) return toast("名称不能为空");
                        if (name === ps.name) return;
                        var arr = psRead();
                        if (psFind(arr, name) !== -1) return toast("同名方案已存在");
                        var k = psFind(arr, ps.name);
                        if (k === -1) return toast("方案已不存在");
                        arr[k].name = name;
                        arr[k].ts = Date.now();
                        if (!psWrite(arr)) return toast("保存失败");
                        toast("已重命名");
                        renderBody(body, "preset");
                    });
                }, false);
                acts.appendChild(rn);

                var del = document.createElement("button");
                del.type = "button";
                del.className = "csh-dbg-btn warn";
                del.textContent = "删除";
                del.addEventListener("click", function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    askPick("删除方案「" + ps.name + "」？此操作不可撤销", ["确认删除", "取消"], function (i) {
                        if (i !== 0) return;
                        var arr = psRead();
                        var k = psFind(arr, ps.name);
                        if (k === -1) return toast("方案已不存在");
                        arr.splice(k, 1);
                        if (!psWrite(arr)) return toast("保存失败");
                        toast("已删除「" + ps.name + "」");
                        renderBody(body, "preset");
                    });
                }, false);
                acts.appendChild(del);

                card.appendChild(acts);
                box.appendChild(card);
            });
            body.appendChild(box);

            /* —— 导入 / 导出：一行紧凑 JSON（§4.6.3）—— */
            sec(body, "导入 / 导出");
            var io = document.createElement("textarea");
            io.className = "csh-dbg-json";
            io.placeholder = "点「导出」把全部方案写入这里；粘贴别人给的 JSON 后点「导入」";
            body.appendChild(io);
            grid(body, [
                mkBtn("导出全部", function () {
                    var arr = psRead();
                    if (!arr.length) return toast("没有可导出的方案");
                    io.value = JSON.stringify(arr);
                    try { io.focus(); io.select(); } catch (eS) {}
                    toast("已导出 " + arr.length + " 套方案（请自行复制）");
                }),
                mkBtn("导入（合并）", function () {
                    var raw = (io.value || "").trim();
                    if (!raw) return toast("请先粘贴 JSON");
                    var data = null;
                    try { data = JSON.parse(raw); } catch (eP) { return toast("JSON 解析失败，请检查格式"); }
                    /* 兼容单个对象与数组两种写法：{name,skills} → [..] */
                    if (data && typeof data === "object" &&
                        Object.prototype.toString.call(data) === "[object Object]" &&
                        typeof data.name === "string" && data.skills) {
                        data = [data];
                    }
                    if (Object.prototype.toString.call(data) !== "[object Array]") return toast("格式不对：应为方案数组");
                    var arr = psRead();
                    var added = 0, skipped = [];
                    data.forEach(function (it) {
                        if (!it || typeof it !== "object" || typeof it.name !== "string" || !it.name) return;
                        if (Object.prototype.toString.call(it.skills) !== "[object Array]") return;
                        if (psFind(arr, it.name) !== -1) { skipped.push(it.name); return; }
                        arr.push({
                            name: it.name,
                            skills: it.skills.filter(function (s) { return typeof s === "string" && s; }),
                            ts: typeof it.ts === "number" ? it.ts : Date.now(),
                        });
                        added++;
                    });
                    if (!added && !skipped.length) return toast("没有可导入的有效方案");
                    if (!psWrite(arr)) return toast("保存失败");
                    var fails = skipped.length ? skipped.map(function (n) { return "已跳过（同名已存在）：" + n; }) : null;
                    renderBody(body, "preset");
                    if (skipped.length) feedback("warn", "导入完成：新增 " + added + " 套，跳过 " + skipped.length + " 套同名方案", fails);
                    else feedback("ok", "导入完成：新增 " + added + " 套方案", null);
                }),
            ]);

            /* —— 装载实现：先声明后使用（函数提升，但保持与调用点顺序一致便于阅读）—— */
            function doLoad(t, ps) {
                var want = ps.skills;
                var missing = [], existing = [], toAdd = [];
                for (var i = 0; i < want.length; i++) {
                    var sid = want[i];
                    if (!lib.skill || !lib.skill[sid]) { missing.push(sid); continue; }
                    var has = false;
                    try { has = !!(t.hasSkill && t.hasSkill(sid)); } catch (eH) {}
                    if (has) existing.push(sid); else toAdd.push(sid);
                }

                feedback("loading", "正在装载「" + ps.name + "」…", null);
                runAct(function () {
                    /* 【2026-10-02 数据破坏修复】原实现是「先卸掉目标身上**全部**技能，再逐个装上」，
                       但 toAdd 只包含「目标当前没有的技能」——于是目标**原本就会**的那些技能
                       被卸掉后再也没装回来：
                         · 第一次装载：方案里的已有技能全部消失（只补上了缺的那几个）
                         · 重复装载同一方案：toAdd 为空 ⇒ 目标技能被**清空**
                       而提示还写着「目标原本已持有（已重装）」，与实际结果相反。
                       现改为「幂等对齐」：只卸掉**不在方案里**的技能，方案内的技能原样保留。
                       这样无论执行多少次，结果都等于「目标技能 == 方案技能」，且不产生多余增删。 */
                    var old = [];
                    try { old = (t.skills || []).slice(); } catch (eO) {}
                    for (var j = 0; j < old.length; j++) {
                        if (want.indexOf(old[j]) !== -1) continue;   // 方案内技能保留，无需重装
                        try { if (t.removeSkill) t.removeSkill(old[j]); } catch (eRm) {}
                    }
                    for (var k = 0; k < toAdd.length; k++) {
                        try {
                            if (typeof t.addSkillLog === "function") t.addSkillLog(toAdd[k]);
                            else if (typeof t.addSkills === "function") t.addSkills(toAdd[k]);
                            else if (typeof t.addSkill === "function") t.addSkill(toAdd[k]);
                        } catch (eAdd) {}
                    }
                    var fails = [];
                    missing.forEach(function (m) { fails.push("库中不存在，已跳过：" + m); });
                    var kept = existing.filter(function (m) { return old.indexOf(m) !== -1; });
                    var reinstalled = existing.filter(function (m) { return old.indexOf(m) === -1; });
                    kept.forEach(function (m) { fails.push("目标原本已持有（保留）：" + m); });
                    reinstalled.forEach(function (m) { fails.push("目标已失去（已补装）：" + m); });
                    if (fails.length) {
                        feedback("warn", "装载完成：已装 " + toAdd.length + " 个 · 保留 " + kept.length +
                            " 个，异常 " + fails.length + " 项", fails);
                        toast("「" + ps.name + "」部分装载");
                    } else {
                        feedback("ok", "装载完成：「" + ps.name + "」共 " + toAdd.length + " 个技能已作用于 " + (tr(t) || t.name), null);
                        toast("「" + ps.name + "」装载完成");
                    }
                }, {
                    action: "loadPreset",
                    target: t,
                    requested: { preset: ps.name, skills: want },
                    before: { skills: (t.skills || []).slice() },
                });
            }
        }

        function renderBody(body, tab) {
            while (body.firstChild) body.removeChild(body.firstChild);
            /* 桌面端内容限宽居中（§E.1）：所有页签内容统一包一层 .csh-dbg-page，
               避免桌面全屏下正文行宽超 100 字符。手机端 .csh-dbg-page 无约束。 */
            var page = document.createElement("div");
            page.className = "csh-dbg-page";
            body.appendChild(page);
            renderBodyInto(page, tab);
        }

        function renderBodyInto(body, tab) {
            /* 「配置方案」已并入技能页（2026-09-28）：旧 tab 值与 renderPresets 内部
               的自刷新调用（renderBody(body,"preset")）统一映射到合并后的技能页。 */
            if (tab === "preset") tab = "skill";
            /* 【2026-09-30 修复】配乐**只在「池子休闲」页签里响**。
               此前 csh_bgm.js 会在主页面手势解锁时自动起播 lobby，导致玩家在无名杀
               模式选择界面就听到池子休闲的曲子（用户实机反馈）。现在改为显式控制：
               进入本页签起播，切到任何别的页签立即停。 */
            if (tab === "games") {
                pauseHostMusic();      /* 无名杀本体音乐让位（2026-09-30） */
                try { if (lib.cshBgm) lib.cshBgm.play("lobby"); } catch (eBgmOn) {}
                renderLobby(body);
                return;
            }
            try { if (lib.cshBgm) lib.cshBgm.stop(); } catch (eBgmOff) {}
            resumeHostMusic();          /* 离开池子休闲 → 无名杀本体音乐还原 */
            if (tab === "res") {
                var resState = { targetIdx: "0" };
                body.appendChild(buildTargetSelect(resState));
                function resAct(name, requested, fn) {
                    return function () {
                        var p = resolveActTarget(resState);
                        if (!p) return;
                        runAct(function () {
                            fn(p);
                            toast(name + " → " + (tr(p) || p.name) + "（已提交，结算未确认）");
                        }, {
                            action: name,
                            target: p,
                            before: { hp: p.hp, maxHp: p.maxHp, hujia: p.hujia || 0 },
                            requested: requested,
                        });
                    };
                }
                /** 数值自由输入：创造模式不设上限，只校验是整数 */
                function askNum(title, def, min, cb) {
                    askText(title, def, function (val) {
                        if (val == null) return;
                        var v = parseInt(String(val).trim(), 10);
                        if (isNaN(v)) return toast("请输入整数");
                        if (min != null && v < min) return toast("不能小于 " + min);
                        cb(v);
                    });
                }
                /** 弹数值 → 执行 */
                function numAct(title, def, min, name, fn) {
                    return function () {
                        askNum(title, def, min, function (v) {
                            resAct(name + " " + v, { n: v }, function (p) { fn(p, v); })();
                        });
                    };
                }

                sec(body, "体力", "全部支持任意数值");
                grid(body, [
                    mkBtn("造成伤害…", numAct("造成伤害点数", "1", 1, "damage", function (p, v) {
                        p.damage(v);
                    }), "neg"),
                    mkBtn("回复生命…", numAct("回复点数", "1", 1, "recover", function (p, v) {
                        if (p.hp >= p.maxHp) return toast("已满血");
                        p.recover(v);
                    }), "pos"),
                    mkBtn("回满血", resAct("recover", { full: true }, function (p) {
                        if (p.hp < p.maxHp) p.recover(p.maxHp - p.hp); else toast("已满血");
                    }), "pos"),
                    mkBtn("设置体力…", function () {
                        askNum("设置当前体力（可超过上限，会同步抬高上限）", "4", 0, function (v) {
                            resAct("setHp " + v, { hp: v }, function (p) {
                                if (v > p.maxHp) p.maxHp = v;
                                p.hp = v;
                                if (typeof p.update === "function") p.update();
                            })();
                        });
                    }),
                    mkBtn("增加体力上限…", numAct("增加上限点数", "1", 1, "gainMaxHp", function (p, v) {
                        if (typeof p.gainMaxHp === "function") p.gainMaxHp(v);
                        else { p.maxHp += v; if (typeof p.update === "function") p.update(); }
                    }), "pos"),
                    mkBtn("减少体力上限…", numAct("减少上限点数", "1", 1, "loseMaxHp", function (p, v) {
                        if (typeof p.loseMaxHp === "function") p.loseMaxHp(v);
                        else { p.maxHp = Math.max(1, p.maxHp - v); if (typeof p.update === "function") p.update(); }
                    })),
                    mkBtn("设置体力上限…", function () {
                        askNum("设置体力上限", "4", 1, function (v) {
                            resAct("setMaxHp " + v, { maxHp: v }, function (p) {
                                p.maxHp = v;
                                if (p.hp > v) p.hp = v;
                                if (typeof p.update === "function") p.update();
                            })();
                        });
                    }),
                ]);

                sec(body, "护甲");
                grid(body, [
                    mkBtn("增加护甲…", numAct("增加护甲点数", "1", 1, "changeHujia", function (p, v) {
                        p.changeHujia(v);
                    }), "pos"),
                    mkBtn("减少护甲…", numAct("减少护甲点数", "1", 1, "changeHujia", function (p, v) {
                        p.changeHujia(-v);
                    })),
                    mkBtn("清空护甲", resAct("changeHujia", { n: 0 }, function (p) {
                        p.changeHujia(-(p.hujia || 0));
                    })),
                ]);

                sec(body, "手牌");
                grid(body, [
                    mkBtn("摸牌…", numAct("摸牌张数", "2", 1, "draw", function (p, v) {
                        p.draw(v);
                    }), "good"),
                    mkBtn("弃牌…", numAct("弃牌张数（从手牌随机弃）", "1", 1, "discard", function (p, v) {
                        var hs = p.getCards("h") || [];
                        if (!hs.length) return toast("无手牌");
                        var n = Math.min(v, hs.length);
                        var out = [];
                        for (var i = 0; i < n; i++) out.push(hs[Math.floor(Math.random() * hs.length)]);
                        var uniq = [];
                        out.forEach(function (c) { if (uniq.indexOf(c) === -1) uniq.push(c); });
                        p.discard(uniq);
                    })),
                    mkBtn("清空手牌", resAct("clearHand", {}, function (p) {
                        var hs = p.getCards("h");
                        if (!hs.length) return toast("无手牌");
                        p.discard(hs);
                    }), "warn"),
                ]);

                sec(body, "状态");
                grid(body, [
                    mkBtn("翻面", resAct("turnOver", {}, function (p) { p.turnOver(); })),
                    mkBtn("横置 / 重置", resAct("link", {}, function (p) {
                        if (p.isLinked && p.isLinked()) p.link(false); else p.link();
                    })),
                ]);

                // 标记即 storage 里的数值/数组项，走引擎 setMark / addMark，不直接改 storage
                function markName(cb) {
                    askText("标记名（技能自定义名，如 csh_tb）", "csh_tb", function (name) {
                        if (name == null) return;
                        var mk = String(name).trim();
                        if (!mk) return toast("标记名不能为空");
                        cb(mk);
                    });
                }
                sec(body, "标记", "读写 storage 数值项，供技能 countMark 读取");
                grid(body, [
                    mkBtn("设置标记…", function () {
                        var p = resolveActTarget(resState);
                        if (!p) return toast("请先在上方选择目标");
                        markName(function (mk) {
                            var cur = typeof p.countMark === "function" ? p.countMark(mk) : 0;
                            askText("「" + mk + "」设为（整数，可负）", String(cur), function (val) {
                                if (val == null) return;
                                var v = parseInt(String(val).trim(), 10);
                                if (isNaN(v)) return toast("请输入整数");
                                runAct(function () {
                                    p.setMark(mk, v);
                                    toast("标记 " + mk + " = " + v);
                                }, { action: "setMark", target: p, requested: { mark: mk, n: v } });
                            });
                        });
                    }, "good"),
                    mkBtn("增减标记…", function () {
                        var p = resolveActTarget(resState);
                        if (!p) return toast("请先在上方选择目标");
                        markName(function (mk) {
                            askText("「" + mk + "」增减量（负数即扣减）", "1", function (val) {
                                if (val == null) return;
                                var v = parseInt(String(val).trim(), 10);
                                if (isNaN(v) || !v) return toast("请输入非零整数");
                                runAct(function () {
                                    p.addMark(mk, v);
                                    toast("标记 " + mk + " → " + p.countMark(mk));
                                }, { action: "addMark", target: p, requested: { mark: mk, n: v } });
                            });
                        });
                    }),
                    mkBtn("查看标记", function () {
                        var p = resolveActTarget(resState);
                        if (!p) return toast("请先在上方选择目标");
                        var st = p.storage || {};
                        var out = [];
                        for (var k in st) {
                            if (!Object.prototype.hasOwnProperty.call(st, k)) continue;
                            var v = st[k];
                            if (typeof v !== "number" && !Array.isArray(v)) continue;
                            out.push(k + "=" + (typeof v === "number" ? v : v.length));
                        }
                        toast(out.length ? out.join(" · ") : "无标记");
                    }),
                ]);
                hint(body, "先选目标，再点操作。带「…」的按钮会弹输入框。");
            } else if (tab === "card") {
                var cardState = { targetIdx: "0" };
                body.appendChild(buildTargetSelect(cardState));
                function tg() { return resolveActTarget(cardState); }
                function quick(name, cls) {
                    // 一个按钮 = 一张牌；要几张就点几下，不再写「杀 ×2」这类计数
                    return mkBtn(tr(name) || name, function () {
                        safeGain([name], tg());
                    }, cls);
                }
                sec(body, "搜索生成");
                grid(body, [
                    mkBtn("打开卡牌检索器…", function () {
                        if (!tg()) return toast("请先在上方选择目标");
                        openCardPicker(tg);
                    }, "good"),
                    mkBtn("清空手牌", function () {
                        var p = tg(); if (!p) return;
                        var hs = p.getCards("h");
                        if (!hs.length) return toast("无手牌");
                        runAct(function () { p.discard(hs); toast("已弃手牌 " + hs.length); }, { action: "clearHand", target: p });
                    }, "warn"),
                ]);

                sec(body, "常用基本牌");
                grid(body, [
                    quick("sha", "neg"),
                    quick("shan"),
                    quick("tao", "pos"),
                    quick("jiu"),
                ], 4);

                sec(body, "常用锦囊");
                grid(body, [
                    quick("wuxie"),
                    quick("nanman", "neg"),
                    quick("wanjian", "neg"),
                    quick("wuzhong", "pos"),
                    quick("shunshou"),
                    quick("guohe"),
                    quick("juedou"),
                    quick("huogong"),
                    quick("tiesuo"),
                    quick("wugu", "pos"),
                ], 5);

                sec(body, "常用装备");
                grid(body, [
                    quick("zhuge"),
                    quick("qinggang"),
                    quick("bagua"),
                    quick("renwang"),
                    quick("tengjia"),
                    quick("jueying"),
                    quick("chitu"),
                    quick("dilu"),
                ], 4);
                hint(body, "支持中文名 / ID / 类型检索，可批量生成。");
            } else if (tab === "skill") {
                var plist = allPlayers();
                var meP = me();
                var defaultIdx = 0;
                for (var di = 0; di < plist.length; di++) {
                    if (meP && plist[di] === meP) { defaultIdx = di; break; }
                }
                /* 与下方「配置方案」区共用同一 state（skillTargetShared，2026-09-30 修复）：
                   此前两处各持一份 state，在顶部选了玩家 3、下面一键装载仍装给自己。 */
                var state = skillTargetShared;
                if (state.target == null) state.target = plist.length ? String(defaultIdx) : "me";
                var tool = document.createElement("div");
                tool.className = "csh-dbg-tool";
                var sel = document.createElement("select");
                plist.forEach(function (p, idx) {
                    var o = document.createElement("option");
                    o.value = String(idx);
                    var nm = tr(p) || p.name || ("玩家" + idx);
                    // 每人只一项；自己标注为「自己（武将名）」避免与列表重复
                    if (meP && p === meP) o.textContent = "目标：自己（" + nm + "）";
                    else o.textContent = "目标：" + nm;
                    if (String(idx) === state.target) o.selected = true;
                    sel.appendChild(o);
                });
                if (!plist.length) {
                    var oEmpty = document.createElement("option");
                    oEmpty.value = "me";
                    oEmpty.textContent = "目标：自己";
                    sel.appendChild(oEmpty);
                    state.target = "me";
                }
                sel.addEventListener("change", function () { state.target = sel.value; }, false);
                var inp = document.createElement("input");
                inp.type = "text";
                inp.placeholder = "搜索技能 · 中文名或 id";
                tool.appendChild(sel);
                tool.appendChild(inp);
                body.appendChild(tool);

                var countBar = document.createElement("div");
                countBar.className = "csh-dbg-count";
                body.appendChild(countBar);

                var listBox = document.createElement("div");
                listBox.id = "csh-dbg-skill-list";
                body.appendChild(listBox);

                var skillTotal = 0;
                try {
                    /* 缓存会把「打开面板那一刻的库」锁死：若库明显比缓存大，说明当时还没加载完，重建 */
                    try {
                        var _rawNow = Object.getOwnPropertyNames(lib.skill || {}).length;
                        if (_skillIdxCache && _rawNow > _skillIdxCache.length * 2 + 50) _skillIdxCache = null;
                    } catch (eChk) {}
                    skillTotal = buildSkillIndex().length;
                } catch (eTotal) { skillTotal = 0; }
                /* skillEnvStats() 的诊断数字已从界面文案移除（2026-10-03 精炼）；
                   函数保留（诊断页/排障时仍可手动调用）。 */

                function resolveTarget() {
                    if (state.target === "me") return needMe();
                    var i = parseInt(state.target, 10);
                    var list = allPlayers();
                    return list[i] || needMe();
                }
                /* D1：武将维度的一行（包名消歧同名武将；点行进该武将技能清单） */
                function buildCharRow(ch) {
                    var row = document.createElement("div");
                    row.className = "csh-dbg-sk csh-dbg-ch";
                    row.setAttribute("role", "button");
                    row.setAttribute("tabindex", "0");
                    row.setAttribute("title", "点击查看该武将的全部技能");

                    var info = document.createElement("div");
                    info.className = "csh-dbg-sk-info";
                    var nEl = document.createElement("div");
                    nEl.className = "n";
                    nEl.textContent = ch.name || ch.id;
                    var idEl = document.createElement("div");
                    idEl.className = "id";
                    idEl.textContent = ch.id;
                    info.appendChild(nEl);
                    info.appendChild(idEl);
                    var srcEl = document.createElement("div");
                    srcEl.className = "src";
                    var bSrc = document.createElement("b");
                    bSrc.textContent = ch.pack || "未收录来源包";
                    srcEl.appendChild(bSrc);
                    var iN = document.createElement("i");
                    iN.textContent = " · " + ch.skills.length + " 个技能";
                    srcEl.appendChild(iN);
                    info.appendChild(srcEl);
                    row.appendChild(info);

                    var acts = document.createElement("div");
                    acts.className = "csh-dbg-sk-acts";
                    var vb = document.createElement("button");
                    vb.type = "button";
                    vb.className = "add";
                    vb.textContent = "查看";
                    var open = function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        renderCharacterDetail(listBox, ch, renderList);
                    };
                    vb.addEventListener("click", open, true);
                    acts.appendChild(vb);
                    row.appendChild(acts);
                    row.addEventListener("click", open, false);
                    row.addEventListener("keydown", function (e) {
                        if (e.key === "Enter" || e.key === " ") open(e);
                    }, false);
                    return row;
                }
                function renderList() {
                    while (listBox.firstChild) listBox.removeChild(listBox.firstChild);
                    listBox.className = "";   /* 有内容 = 显示白卡框（空态见下，撤框） */
                    var q = (inp.value || "").trim();
                    var list = searchSkills(inp.value);
                    /* D1：同一关键词同时搜「武将」，结果置顶分组，方便按武将找技能 */
                    var chars = q ? searchCharacters(inp.value) : [];
                    if (!q) {
                        /* 【2026-10-03 精炼】原文案带 skillEnvStats 的四项诊断数字
                           （技能表 / 原始键 / 对象 / 可枚举）—— 那是开发者排障信息，
                           对使用者是噪音（§玩家文案规范）。只留一句有用的。 */
                        countBar.textContent = "库内共 " + skillTotal + " 个技能 · 支持中文名 / ID / 武将名搜索";
                    } else {
                        countBar.textContent = "匹配 " + list.length + " 个技能" +
                            (chars.length ? " · " + chars.length + " 名武将" : "") +
                            (list.length >= 120 ? "（技能只显示前 120 条，请细化关键词）" : "") +
                            " · 点右侧「添加 / 移除」作用于上方目标";
                    }
                    if (!list.length && !chars.length) {
                        var empty = document.createElement("div");
                        empty.className = "csh-dbg-empty";
                        empty.textContent = q ? "没有匹配的技能或武将" : "输入关键词开始搜索 · 支持技能中文名 / 技能 ID / 武将名";
                        listBox.appendChild(empty);
                        listBox.className = "is-empty";   /* 空态撤框（2026-10-03 精炼） */
                        return;
                    }
                    if (chars.length) {
                        var cHead = document.createElement("div");
                        cHead.className = "csh-dbg-grp";
                        cHead.textContent = "武将 · " + chars.length;
                        listBox.appendChild(cHead);
                        chars.forEach(function (ch) { listBox.appendChild(buildCharRow(ch)); });
                    }
                    if (list.length) {
                        var sHead = document.createElement("div");
                        sHead.className = "csh-dbg-grp";
                        sHead.textContent = "技能 · " + list.length;
                        listBox.appendChild(sHead);
                    }
                    list.forEach(function (it) {
                        var row = document.createElement("div");
                        row.className = "csh-dbg-sk";
                        /* 行可点：进入详情（§4.6.2）。整行 48px 高，命中面积够手指点 */
                        row.setAttribute("role", "button");
                        row.setAttribute("tabindex", "0");
                        row.setAttribute("title", "点击查看详情");

                        var info = document.createElement("div");
                        info.className = "csh-dbg-sk-info";
                        var nEl = document.createElement("div");
                        nEl.className = "n";
                        nEl.textContent = it.name || it.id;
                        var idEl = document.createElement("div");
                        idEl.className = "id";
                        idEl.textContent = it.id;
                        info.appendChild(nEl);
                        info.appendChild(idEl);
                        /* 来源包 + 势力：同名技能一眼消歧（§4.6.2 标签行同源） */
                        var meta = skillMetaOf(it.id);
                        var srcEl = document.createElement("div");
                        srcEl.className = "src";
                        var bSrc = document.createElement("b");
                        bSrc.textContent = meta.packs.length ? meta.packs.join(" / ") : "未收录来源包";
                        srcEl.appendChild(bSrc);
                        if (meta.camps.length) {
                            var iCamp = document.createElement("i");
                            iCamp.textContent = " · " + meta.camps.join(" / ");
                            srcEl.appendChild(iCamp);
                        }
                        info.appendChild(srcEl);

                        var openDetail = function (e) {
                            e.preventDefault();
                            e.stopPropagation();
                            renderSkillDetail(listBox, it, renderList);
                        };
                        row.addEventListener("click", openDetail, false);
                        row.addEventListener("keydown", function (e) {
                            if (e.key === "Enter" || e.key === " ") openDetail(e);
                        }, false);

                        var acts = document.createElement("div");
                        acts.className = "csh-dbg-sk-acts";
                        var add = document.createElement("button");
                        add.type = "button";
                        add.className = "add";
                        add.textContent = "添加";
                        add.addEventListener("click", function (e) {
                            e.preventDefault();
                            e.stopPropagation();
                            runAct(function () { addSkillTo(resolveTarget(), it.id); });
                        }, true);
                        var rm = document.createElement("button");
                        rm.type = "button";
                        rm.className = "rm";
                        rm.textContent = "移除";
                        rm.addEventListener("click", function (e) {
                            e.preventDefault();
                            e.stopPropagation();
                            var t = resolveTarget();
                            if (!t) return;
                            runAct(function () {
                                if (!t.hasSkill || !t.hasSkill(it.id)) throw new Error("没有该技能");
                                t.removeSkill(it.id);
                                toast("已移除 " + (it.name || it.id) + "（已提交）");
                            }, {
                                action: "removeSkill",
                                target: t,
                                requested: { skill: it.id },
                                before: { skills: (t.skills || []).slice() },
                            });
                        }, true);
                        acts.appendChild(add);
                        acts.appendChild(rm);

                        row.appendChild(info);
                        row.appendChild(acts);
                        listBox.appendChild(row);
                    });
                }
                var timer = null;
                inp.addEventListener("input", function () {
                    if (timer) clearTimeout(timer);
                    timer = setTimeout(renderList, 60);
                }, true);
                renderList();
                /* —— 配置方案并入技能页（2026-09-28 用户要求：少一个页签）——
                   原「配置方案」独立页签撤销，整个方案区追加在技能列表下方。 */
                renderPresets(body);
            } else if (tab === "scene") {
                function othersOf(p) {
                    return game.filterPlayer(function (c) { return c !== p && c.isIn && c.isIn(); });
                }
                function useAoE(cardName, includeSelf) {
                    var p = needMe();
                    if (!p) return;
                    var targets = includeSelf
                        ? game.filterPlayer(function (c) { return c.isIn && c.isIn(); })
                        : othersOf(p);
                    if (!targets.length) return toast("无目标");
                    runAct(function () {
                        p.useCard({ name: cardName }, targets, false);
                        toast("【" + (tr(cardName) || cardName) + "】→ " + targets.length + " 人（已提交）");
                    }, {
                        action: "useCard:" + cardName,
                        target: p,
                        requested: { card: cardName, targetCount: targets.length },
                    });
                }
                function useOnPick(cardName) {
                    pickPlayer(function (t) {
                        var p = needMe();
                        if (!p) return;
                        p.useCard({ name: cardName }, t, false);
                        toast("对 " + tr(t) + " 使用【" + (tr(cardName) || cardName) + "】");
                    });
                }
                sec(body, "回合 / 生死");
                grid(body, [
                    mkBtn("复活自己", function () {
                        var p = me();
                        if (!p) return toast("请先进入对局");
                        runAct(function () {
                            if (p.isAlive && p.isAlive()) return toast("已存活");
                            if (typeof p.revive === "function") p.revive(p.maxHp || 1);
                            else toast("当前引擎无 revive");
                        }, { action: "revive", target: p });
                    }, "good"),
                    mkBtn("复活选目标", function () {
                        var dead = [];
                        try {
                            dead = (game.dead || []).filter(Boolean);
                        } catch (e) {}
                        if (!dead.length) return toast("无死亡角色");
                        var labels = dead.map(function (p) { return tr(p) || p.name || "?"; });
                        askPick("选择复活目标", labels, function (i) {
                            var t = dead[i];
                            if (!t) return;
                            runAct(function () {
                                if (typeof t.revive === "function") t.revive(t.maxHp || 1);
                                toast("已尝试复活 " + (tr(t) || t.name));
                            }, { action: "revive", target: t });
                        });
                    }, "good"),
                    mkBtn("跳过出牌阶段", function () {
                        var p = needMe(); if (!p) return;
                        runAct(function () {
                            if (typeof p.skip === "function") p.skip("phaseUse");
                            toast("已请求跳过出牌阶段");
                        }, { action: "skipPhaseUse", target: p });
                    }),
                ]);

                sec(body, "群体锦囊");
                grid(body, [
                    mkBtn("全场南蛮(除己)", function () { useAoE("nanman", false); }, "neg"),
                    mkBtn("全场南蛮(含己)", function () { useAoE("nanman", true); }, "neg"),
                    mkBtn("全场万箭(除己)", function () { useAoE("wanjian", false); }, "neg"),
                    mkBtn("全场万箭(含己)", function () { useAoE("wanjian", true); }, "neg"),
                    mkBtn("全场桃园", function () { useAoE("taoyuan", true); }, "pos"),
                    mkBtn("全场五谷", function () { useAoE("wugu", true); }, "pos"),
                    mkBtn("全场铁索", function () { useAoE("tiesuo", true); }),
                ]);

                sec(body, "单体锦囊", "点按钮后选目标");
                grid(body, [
                    mkBtn("对目标杀", function () { useOnPick("sha"); }, "neg"),
                    mkBtn("对目标决斗", function () { useOnPick("juedou"); }),
                    mkBtn("对目标过河", function () { useOnPick("guohe"); }),
                ]);

                sec(body, "批量数值", "全部支持任意数值");
                grid(body, [
                    mkBtn("全场各伤…", function () {
                        var p = needMe(); if (!p) return;
                        askText("其他人各受多少点伤害", "1", function (v) {
                            var n = parseInt(String(v).trim(), 10);
                            if (isNaN(n) || n < 1) return toast("请输入正整数");
                            runAct(function () {
                                othersOf(p).forEach(function (t) { t.damage(n, p); });
                                toast("其他人各 " + n + " 伤（已提交）");
                            }, { action: "aoeDamage", target: p, requested: { n: n } });
                        });
                    }, "neg"),
                    mkBtn("全场各摸…", function () {
                        var p = needMe(); if (!p) return;
                        askText("全场每人摸多少张", "1", function (v) {
                            var n = parseInt(String(v).trim(), 10);
                            if (isNaN(n) || n < 1) return toast("请输入正整数");
                            runAct(function () {
                                allPlayers().forEach(function (t) { t.draw(n); });
                                toast("全场各摸 " + n + "（已提交）");
                            }, { action: "aoeDraw", target: p, requested: { n: n } });
                        });
                    }, "pos"),
                ]);

                sec(body, "装备");
                grid(body, [
                    mkBtn("弃光自己装备", function () {
                        var p = needMe(); if (!p) return;
                        var es = p.getCards("e");
                        if (es && es.length) { p.discard(es); toast("弃装备"); }
                        else toast("无装备");
                    }),
                    mkBtn("清空他人装备", function () {
                        var p = needMe(); if (!p) return;
                        othersOf(p).forEach(function (t) {
                            var es = t.getCards("e");
                            if (es && es.length) t.discard(es);
                        });
                        toast("已清空他人装备");
                    }),
                ]);
                hint(body, "群体锦囊以自己为使用者。仅影响单机对局。");
            } else if (tab === "state") {
                var pre = document.createElement("pre");
                pre.style.cssText = "display:block!important;position:static!important;max-height:360px!important;overflow:auto!important;font-size:11px!important;line-height:1.4!important;background:var(--csh-paper)!important;padding:10px!important;border-radius:8px!important;color:var(--csh-bg)!important;white-space:pre-wrap!important;word-break:break-all!important;width:100%!important;";
                function refreshState() {
                    var p = needMe();
                    if (!p) {
                        pre.textContent = "无角色";
                        return;
                    }
                    if (!lib.cshDebug || !lib.cshDebug.inspectPlayer) {
                        pre.textContent = "Core 无 inspectPlayer";
                        return;
                    }
                    try {
                        pre.textContent = lib.cshDebug.safeStringify(lib.cshDebug.inspectPlayer(p));
                    } catch (e) {
                        pre.textContent = "inspect failed";
                    }
                }
                grid(body, [
                    mkBtn("刷新状态", function () { refreshState(); toast("已刷新"); }, "good"),
                    mkBtn("复制状态", function () {
                        try {
                            var t = pre.textContent || "";
                            if (navigator.clipboard && navigator.clipboard.writeText) {
                                navigator.clipboard.writeText(t).then(function () { toast("已复制"); });
                            } else {
                                console.log(t);
                                toast("已 console");
                            }
                        } catch (e) { toast("复制失败"); }
                    }),
                ]);
                body.appendChild(pre);
                refreshState();
                hint(body, "只读快照。");
            } else if (tab === "track") {
                var pre2 = document.createElement("pre");
                pre2.style.cssText = "display:block!important;position:static!important;max-height:280px!important;overflow:auto!important;font-size:11px!important;line-height:1.35!important;background:var(--csh-paper)!important;padding:10px!important;border-radius:8px!important;color:var(--csh-bg)!important;white-space:pre-wrap!important;word-break:break-all!important;width:100%!important;";
                function refreshTrack() {
                    if (!lib.cshDebug) {
                        pre2.textContent = "无 Core";
                        return;
                    }
                    var o = {
                        eventTracking: !!lib.cshDebug._eventTrackingOn,
                        eventAvailable: lib.cshDebug._eventTrackerAvailable,
                        storageWatch: !!lib.cshDebug._storageWatchOn,
                        actions: lib.cshDebug.getActions ? lib.cshDebug.getActions(15) : [],
                        storageChanges: lib.cshDebug.getStorageChanges ? lib.cshDebug.getStorageChanges(15) : [],
                        events: lib.cshDebug.getEvents ? lib.cshDebug.getEvents(20) : [],
                    };
                    try {
                        pre2.textContent = lib.cshDebug.safeStringify(o);
                    } catch (e) {
                        pre2.textContent = "refresh failed";
                    }
                }
                grid(body, [
                    mkBtn("开Event", function () {
                        if (!lib.cshDebug) return toast("无 Core");
                        lib.cshDebug.setEventTracking(true);
                        toast(lib.cshDebug._eventTrackerAvailable ? "Event ON" : "无法可靠安装 hook");
                        refreshTrack();
                    }, "good"),
                    mkBtn("关Event", function () {
                        if (!lib.cshDebug) return;
                        lib.cshDebug.setEventTracking(false);
                        toast("Event OFF");
                        refreshTrack();
                    }),
                    mkBtn("卸EventHook", function () {
                        if (lib.cshDebug && lib.cshDebug.uninstallEventTracker) lib.cshDebug.uninstallEventTracker();
                        toast("已尝试恢复原 trigger");
                        refreshTrack();
                    }, "warn"),
                    mkBtn("开Storage轮询", function () {
                        if (!lib.cshDebug) return;
                        lib.cshDebug.setStorageWatch(true);
                        toast("Storage 轮询 ON（reason=poll，非赋值hook）");
                        refreshTrack();
                    }),
                    mkBtn("关Storage轮询", function () {
                        if (!lib.cshDebug) return;
                        lib.cshDebug.setStorageWatch(false);
                        toast("Storage 轮询 OFF");
                        refreshTrack();
                    }),
                    mkBtn("刷新追踪", function () { refreshTrack(); }, "good"),
                    mkBtn("清空追踪", function () {
                        if (!lib.cshDebug) return;
                        lib.cshDebug.clearActions();
                        lib.cshDebug.clearStorageChanges();
                        lib.cshDebug.clearEvents();
                        toast("已清空");
                        refreshTrack();
                    }, "warn"),
                    mkBtn("查技能奇才", function () {
                        var p = needMe();
                        if (!lib.cshDebug || !lib.cshDebug.inspectSkill) return toast("无 API");
                        var info = lib.cshDebug.inspectSkill("csh_hyy_qicai", p);
                        pre2.textContent = lib.cshDebug.safeStringify(info);
                        toast("已显示奇才检查");
                    }),
                    mkBtn("断言检查", function () {
                        var p = needMe(); if (!p || !lib.cshDebug) return;
                        var r = lib.cshDebug.runAssertions(p);
                        pre2.textContent = lib.cshDebug.safeStringify(r);
                        toast("断言失败数=" + r.filter(function (x) { return x.ok === false; }).length);
                    }),
                    mkBtn("保存快照", function () {
                        var p = needMe(); if (!p || !lib.cshDebug) return;
                        var s = lib.cshDebug.saveSnapshot(p, "manual");
                        toast(s ? "快照 " + s.id : "失败");
                        refreshTrack();
                    }, "good"),
                    mkBtn("比较最近二快照", function () {
                        if (!lib.cshDebug) return;
                        var list = lib.cshDebug.listSnapshots();
                        if (list.length < 2) return toast("需要≥2快照");
                        pre2.textContent = lib.cshDebug.safeStringify(
                            lib.cshDebug.diffSnapshots(list[list.length - 2].id, list[list.length - 1].id)
                        );
                        toast("已比较");
                    }),
                    mkBtn("生成BUG报告", function () {
                        var p = needMe(); if (!lib.cshDebug) return toast("无 Core");
                        pre2.textContent = lib.cshDebug.generateBugReport(p);
                        toast("报告已生成");
                    }, "good"),
                    mkBtn("复制BUG报告", function () {
                        var p = needMe(); if (!lib.cshDebug) return;
                        var report = lib.cshDebug.generateBugReport(p);
                        pre2.textContent = report;
                        lib.cshDebug.copyText(report, function () { toast("已复制"); }, function (ta) {
                            toast(ta ? "请手动复制文本框" : "已 console");
                        });
                    }, "good"),
                ]);
                body.appendChild(pre2);
                refreshTrack();
                hint(body, "只读报告：动作已提交 ≠ 已完成，未覆盖项会如实标注。");
            } else if (tab === "char") {
                grid(body, [
                    mkBtn("同步+10", function () {
                        var p = needMe(); if (!p || !lib.cshAsukaSync) return toast("无接口");
                        lib.cshAsukaSync(p, 10, "调试"); toast("→" + p.storage.csh_tb);
                    }),
                    mkBtn("同步→0", function () {
                        var p = needMe(); if (!p || !lib.cshAsukaSync) return toast("无接口");
                        lib.cshAsukaSync(p, -(p.storage.csh_tb || 0), "调试"); toast("→" + p.storage.csh_tb);
                    }),
                    mkBtn("同步→100", function () {
                        var p = needMe(); if (!p || !lib.cshAsukaSync) return toast("无接口");
                        lib.cshAsukaSync(p, 100 - (p.storage.csh_tb || 0), "调试"); toast("→" + p.storage.csh_tb);
                    }, "good"),
                    mkBtn("鬼眼+1", function () {
                        var p = needMe(); if (!p) return;
                        var layer = Math.min(10, (p.storage.csh_guiyan_layer || 0) + 1);
                        p.storage.csh_guiyan_layer = layer;
                        if (p.syncStorage) p.syncStorage("csh_guiyan_layer");
                        try { if (p.changeSkin) p.changeSkin({ characterName: "csh_yangjian" }, "csh_yangjian_" + layer); } catch (e) {}
                        toast("鬼眼→" + layer);
                    }),
                    mkBtn("鬼眼=10", function () {
                        var p = needMe(); if (!p) return;
                        p.storage.csh_guiyan_layer = 10;
                        if (p.syncStorage) p.syncStorage("csh_guiyan_layer");
                        try { if (p.changeSkin) p.changeSkin({ characterName: "csh_yangjian" }, "csh_yangjian_10"); } catch (e) {}
                        toast("鬼眼→10");
                    }, "warn"),
                ]);
            } else if (tab === "fx") {
                function playFx(name, data) {
                    if (lib.cshShoushaFx) lib.cshShoushaFx.play(name, data);
                    else toast("无特效模块");
                }
                /** 走统一播报模块：语音 + 位图特效成对，等同局内真实触发 */
                function playVoice(key) {
                    if (lib.cshVoice && typeof lib.cshVoice.play === "function") {
                        if (lib.cshVoice.play(key, { force: true })) return true;
                        toast("播报失败: " + key);
                        return false;
                    }
                    toast("播报模块未加载（csh_voice.js）");
                    return false;
                }
                sec(body, "毛笔字特效");
                grid(body, [
                    mkBtn("却敌", function () { playFx("quedi"); }),
                    mkBtn("逆流", function () { playFx("niliu"); }),
                    mkBtn("归来", function () { playFx("guilai"); }),
                ]);
                sec(body, "伤害播报", "语音 + 位图");
                grid(body, [
                    mkBtn("重伤 3 点", function () { playVoice("damage_small"); }, "warn"),
                    mkBtn("重创 4 点", function () { playVoice("damage_big"); }, "warn"),
                    mkBtn("按数值播放…", function () {
                        askText("输入伤害点数（≥3 才播报）", "3", function (v) {
                            var n = parseInt(String(v).trim(), 10);
                            if (isNaN(n)) return toast("请输入整数");
                            if (n < 3) return toast("低于 3 点不播报");
                            playVoice(n === 3 ? "damage_small" : "damage_big");
                        });
                    }, "good"),
                ]);
                sec(body, "连杀播报");
                grid(body, [
                    mkBtn("连杀 1", function () { playVoice("kill_1"); }, "warn"),
                    mkBtn("连杀 3", function () { playVoice("kill_3"); }, "warn"),
                    mkBtn("连杀 7", function () { playVoice("kill_7"); }, "warn"),
                    mkBtn("按连杀数播放…", function () {
                        askText("输入连杀数（1~7，超出按 7 计）", "1", function (v) {
                            var n = parseInt(String(v).trim(), 10);
                            if (isNaN(n) || n < 1) return toast("请输入 1~7 的整数");
                            if (n > 7) n = 7;
                            playVoice("kill_" + n);
                        });
                    }, "good"),
                ]);
                sec(body, "回复播报");
                grid(body, [
                    mkBtn("自身回复（医术高超）", function () { playVoice("recover_self"); }, "good"),
                    mkBtn("助人回复（妙手回春）", function () { playVoice("recover_other"); }, "good"),
                ]);
                sec(body, "链路自检");
                grid(body, [
                    mkBtn("播报链路自检", function () {
                        var V = lib.cshVoice;
                        if (!V || typeof V.diag !== "function") return toast("播报模块未加载（csh_voice.js）");
                        var d = V.diag();
                        var sk = d.skills || {}, okCount = 0, bad = [];
                        for (var k in sk) {
                            var s = sk[k] || {};
                            if (s.defined && s.inGlobal && s.hooked !== false) okCount++;
                            else bad.push(String(k).replace("_csh_effect_", "").replace("_announce", ""));
                        }
                        var m = d.mfx || {}, mf = m.mfx || {};
                        var cfg = d.config;
                        var cfgTxt = cfg === false ? "关" : (cfg === true ? "开" : String(cfg));
                        var line = "开关:" + cfgTxt
                            + " · 技能:" + okCount + "/3"
                            + " · content:" + (d.contentReached ? "到达" : "未到达")
                            + " · 播放器:" + (m.script ? "就位" : "缺失")
                            + " · 清单:" + (mf.data ? (mf.keys + "项") : "无")
                            + " · 贴图:" + (mf.texReady || 0);
                        if (bad.length) line += " · 未挂载:" + bad.join("/");
                        if (m.error) line += " · 加载错误:" + m.error;
                        if (mf.lastError) line += " · 播放错误:" + mf.lastError;
                        toast(line);
                        try {
                            if (lib.cshDebug && typeof lib.cshDebug.info === "function") lib.cshDebug.info("播报自检 " + line, d);
                            else console.log("[池子魔将·播报自检]", JSON.stringify(d));
                        } catch (eLg) {}
                    }, "good"),
                ]);
                hint(body, "播报不响先点这里；总开关在扩展设置「伤害/击杀/回复播报」。");
            } else if (tab === "emote") {
                var emState = { targetIdx: "0" };
                body.appendChild(buildTargetSelect(emState));
                function playEmote(kind) {
                    // kind: flower / wine / egg / shoe —— 引擎 throwEmotion 原名
                    var tgt = resolveActTarget(emState);
                    if (!tgt) return;
                    var from = me();
                    if (!from) return;
                    var labels = { shoe: "拖鞋", egg: "鸡蛋", flower: "鲜花", wine: "酒杯" };
                    runAct(function () {
                        try {
                            if (typeof from.throwEmotion === "function") {
                                from.throwEmotion(tgt, kind);
                            } else if (lib.cshInteract && typeof lib.cshInteract.fire === "function") {
                                lib.cshInteract.fire(from, tgt, kind === "flower" || kind === "wine" ? "ally" : "enemy", 1);
                            } else {
                                toast("引擎不支持 throwEmotion");
                                return;
                            }
                            toast((labels[kind] || kind) + " → " + (tr(tgt) || tgt.name));
                        } catch (e) {
                            console.error(e);
                            toast("互动失败: " + ((e && e.message) || e));
                        }
                    }, { action: "emote:" + kind, target: tgt });
                }
                grid(body, [
                    mkBtn("送花", function () { playEmote("flower"); }, "good"),
                    mkBtn("敬酒", function () { playEmote("wine"); }, "good"),
                    mkBtn("砸鸡蛋", function () { playEmote("egg"); }, "warn"),
                    mkBtn("扔拖鞋", function () { playEmote("shoe"); }, "warn"),
                ]);
                hint(body, "使用主程序自带的贴图与音效。联机禁用。");
            } else if (tab === "diag") {
                grid(body, [
                    mkBtn("Core自检", function () {
                        if (!lib.cshDebug) return toast("cshDebug 未加载");
                        lib.cshDebug.info("self-check", { logs: lib.cshDebug._logs.length, errors: lib.cshDebug._errors.length });
                        toast("Core OK v" + lib.cshDebug.version + " logs=" + lib.cshDebug._logs.length);
                    }, "good"),
                    mkBtn("导出日志", function () {
                        if (!lib.cshDebug) return toast("无 Core");
                        var txt = lib.cshDebug.exportText();
                        try {
                            if (navigator.clipboard && navigator.clipboard.writeText) {
                                navigator.clipboard.writeText(txt).then(function () { toast("已复制到剪贴板"); }).catch(function () {
                                    console.log(txt); toast("已输出 console（剪贴板失败）");
                                });
                            } else {
                                console.log(txt); toast("已输出 console");
                            }
                        } catch (e) {
                            console.log(txt); toast("已输出 console");
                        }
                    }),
                    mkBtn("清空日志", function () {
                        if (!lib.cshDebug) return toast("无 Core");
                        lib.cshDebug.clearAll();
                        toast("日志已清空");
                    }),
                    mkBtn("打印storage", function () {
                        var p = needMe(); if (!p) return;
                        console.log("[池子调试]", p.name, p.storage);
                        if (lib.cshDebug) lib.cshDebug.state("storage dump", p.storage, { player: p });
                        toast("已输出 console");
                    }),
                    mkBtn("场上角色", function () {
                        var arr = allPlayers().map(function (c) { return (tr(c) || c.name) + " " + c.hp + "/" + c.maxHp; });
                        toast(arr.join(" · ") || "无");
                    }),
                    mkBtn("我的技能", function () {
                        var p = needMe(); if (!p) return;
                        toast((p.skills || []).join(", ") || "无");
                    }),
                    mkBtn("清skill次数", function () {
                        var p = needMe(); if (!p || !p.getStat) return;
                        var st = p.getStat("skill") || {};
                        for (var k in st) if (Object.prototype.hasOwnProperty.call(st, k)) st[k] = 0;
                        toast("已清");
                    }),
                    mkBtn("目标伤1", function () {
                        pickPlayer(function (t) {
                            var p = needMe();
                            if (p) t.damage(1, p); else t.damage(1);
                            toast("对 " + tr(t) + " 伤害");
                        });
                    }, "warn"),
                    mkBtn("目标摸2", function () {
                        pickPlayer(function (t) { t.draw(2); toast(tr(t) + " 摸2"); });
                    }, "good"),
                ]);
            }
        }

        lib.cshDebugMenu = {
            open: function () {
                try {
                    console.log("[池子调试] open() 被调用");
                    if (typeof game !== "undefined" && game.print) game.print("池子调试：打开面板");
                } catch (eLog) {}
                if (!canShow()) {
                    var reason = "仅限单机可用";
                    try {
                        if (typeof _status !== "undefined" && _status.connectMode) reason = "联机模式已禁用池子调试";
                        else if (typeof game !== "undefined" && game.online) reason = "联机状态已禁用池子调试";
                        else if (isEnabled() === false) reason = "池子调试已在设置中关闭";
                    } catch (eR) {}
                    toast(reason);
                    try { console.warn("[池子调试] open 被拒绝:", reason); } catch (e2) {}
                    return;
                }
                // 分段执行：任一步抛异常时，日志会精确指出停在哪一环
                function step(name, fn) {
                    try { return fn(); }
                    catch (e) {
                        try { console.error("[池子调试] open 失败于:", name, e); } catch (e2) {}
                        throw e;
                    }
                }
                step("closePanel", closePanel);
                step("ensureStyle", ensureStyle);
                var overlay = document.createElement("div");
                overlay.id = "csh-dbg-overlay";
                overlay.addEventListener("click", function (e) {
                    if (e.target === overlay) closePanel();
                }, true);

                var panel = document.createElement("div");
                panel.id = "csh-dbg-panel";
                // 禁止在捕获阶段 stopPropagation：否则子按钮永远收不到 click（面板全失效的根因）
                // 仅阻止冒泡到 overlay，避免点面板空白处被当成点遮罩关闭
                panel.addEventListener("click", function (e) {
                    e.stopPropagation();
                }, false);
                /* 全屏沉浸（§E.1）：遮罩层 touchmove 阻止冒泡到父页面，避免滚动穿透 */
                panel.addEventListener("touchmove", function (e) {
                    e.stopPropagation();
                }, { passive: true });

                var title = document.createElement("div");
                title.id = "csh-dbg-title";
                title.textContent = "池子调试";

                var sub = document.createElement("div");
                sub.id = "csh-dbg-sub";
                sub.textContent = step("playerLine", function () { return playerLine(me()); });

                var head = document.createElement("div");
                head.id = "csh-dbg-head";
                var headMain = document.createElement("div");
                headMain.className = "csh-dbg-head-main";
                headMain.appendChild(title);
                headMain.appendChild(sub);
                head.appendChild(headMain);

                /* 皮肤选择器（2026-09-30 第六轮 · chip 化，修「每次弹窗选皮肤」）：
                   原生 <select> 在手机上一点即弹全屏滚轮（用户称之为「弹窗」），
                   且紧贴关闭键易误触。现改为「紧凑按钮 + 行内 chip 组」——无系统弹层。
                   ⚠ 列表与当前值都取自 lib.cshTheme（唯一真值），不在这里抄第二份。 */
                try {
                    var TH = (typeof lib !== "undefined" && lib.cshTheme) ? lib.cshTheme : null;
                    if (TH && typeof TH.skinList === "function") {
                        var skinList = TH.skinList() || [];
                        var curSkin = TH.currentSkin ? TH.currentSkin() : "";
                        /* 短名：取 " · " 前的部分（"三国杀 · 木纹鎏金" → "三国杀"），chip 才放得下 */
                        var shortOf = function (s) {
                            var t = String(s || "");
                            var i = t.indexOf("·");
                            return (i > 0 ? t.slice(0, i) : t).trim() || t;
                        };
                        var skinRow = document.createElement("div");
                        skinRow.id = "csh-dbg-skin-row";
                        var skinBtn = document.createElement("button");
                        skinBtn.type = "button";
                        skinBtn.id = "csh-dbg-skin";
                        skinBtn.setAttribute("aria-label", "面板皮肤");
                        /* currentSkin() 返回的是 **key**（如 "sgs"）而非 label —— 必须经 skinList 反查 label 再取短名，
                           否则按钮会显示成 "sgs"（2026-09-30 模拟器实机验证发现）。 */
                        var labelOfKey = function (key) {
                            for (var q = 0; q < skinList.length; q++) if (skinList[q].key === key) return shortOf(skinList[q].label);
                            return "皮肤";
                        };
                        skinBtn.textContent = labelOfKey(curSkin) + " ▾";
                        skinBtn.addEventListener("click", function (e) {
                            e.preventDefault();
                            e.stopPropagation();
                            skinRow.className = (skinRow.className.indexOf("open") >= 0) ? "csh-dbg-skin-row" : "csh-dbg-skin-row open";
                        }, false);
                        /* chip 组：一格一套皮肤，点选直接生效（无系统弹层） */
                        for (var si = 0; si < skinList.length; si++) {
                            (function (sk) {
                                var ch = document.createElement("div");
                                ch.className = "csh-dbg-chip" + (sk.key === curSkin ? " on" : "");
                                ch.textContent = shortOf(sk.label);
                                ch.setAttribute("data-skin", sk.key);
                                ch.addEventListener("click", function (e) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    try { TH.setSkin(sk.key); } catch (eS) {}
                                    skinBtn.textContent = shortOf(sk.label) + " ▾";
                                    var kids = skinRow.children;
                                    for (var c = 0; c < kids.length; c++) {
                                        kids[c].className = "csh-dbg-chip" + (kids[c].getAttribute("data-skin") === sk.key ? " on" : "");
                                    }
                                    skinRow.className = "csh-dbg-skin-row";
                                }, false);
                                skinRow.appendChild(ch);
                            })(skinList[si]);
                        }
                        head.appendChild(skinBtn);
                        /* skinRow 不在此追加 —— 必须晚于 close（见下方 head.appendChild(close) 之后），
                           否则 flex-wrap 会把 close 挤到第三行（2026-09-30 模拟器实机验证发现）。 */
                    }
                } catch (eSkin) {}

                var close = document.createElement("button");
                close.type = "button";
                close.id = "csh-dbg-close";
                close.setAttribute("aria-label", "关闭");
                close.textContent = "关闭";
                close.addEventListener("click", function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    try { console.log("[池子调试] 关闭按钮点击"); } catch (e0) {}
                    closePanel();
                }, false);
                head.appendChild(close);
                /* 皮肤 chip 行放在 close **之后**：header 是 flex-wrap，skinRow 的 flex-basis:100%
                   会换到第二行；若插在 close 之前，close 会被挤到第三行（2026-09-30 模拟器实机验证）。 */
                if (typeof skinRow !== "undefined" && skinRow) head.appendChild(skinRow);
                panel.appendChild(head);

                var main = document.createElement("div");
                main.id = "csh-dbg-main";

                var tabs = document.createElement("div");
                tabs.id = "csh-dbg-tabs";
                var body = document.createElement("div");
                body.id = "csh-dbg-body";
                var tabDefs = [
                    /* 【2026-10-03 位置回退 · 用户设计拍板】「池子休闲」放**最后**。
                       历史：它原本就在最后；2026-10-02 因为「#csh-dbg-tabs 是 nowrap 横滚条，
                       11 枚页签总宽约 830px，排在最后时在 360px 手机上根本看不到」，
                       被提到首位。但用户明确要求：**设计上它就该在最后**
                       （它是休闲小游戏区／彩蛋性质，不属于调试页签序列的前排）。
                       所以这次不是简单改回去，而是先把那个"藏起来"的根因解决掉：
                       手机端页签条已改为**整行换行、全部可见**（见 #csh-dbg-tabs 的 CSS），
                       不再需要靠"提到首位"来保证可达性；玩家侧入口也早就有
                       main/config.js 的「池子休闲」按钮 → lib.cshDebug.openLobby()，
                       一步直达该页签，不依赖它在列表中的位置。 */
                    { id: "res", name: "资源" },
                    { id: "card", name: "卡牌" },
                    { id: "skill", name: "技能" },
                    /* 「配置方案」页签已并入技能页（2026-09-28） */
                    { id: "scene", name: "场景" },
                    { id: "state", name: "状态" },
                    { id: "fx", name: "特效" },
                    { id: "emote", name: "互动" },
                    { id: "char", name: "池子" },
                    { id: "track", name: "追踪" },
                    { id: "diag", name: "诊断" },
                    { id: "games", name: "池子休闲", cls: "game" },
                ];
                function setTab(id) {
                    TAB = id;
                    for (var i = 0; i < tabs.children.length; i++) {
                        var el = tabs.children[i];
                        var cls = el.getAttribute("data-cls");
                        var isOn = (el.getAttribute("data-tab") === id);
                        el.className = "csh-dbg-tab" + (cls ? " " + cls : "") + (isOn ? " on" : "");
                        /* 【2026-09-30 第六轮】#csh-dbg-tabs 是可横滚条（11 个页签总宽约 830px）。
                           切到屏幕外的页签后需把它滚回可视区，否则用户看不到「已切换」的反馈。 */
                        if (isOn && el.scrollIntoView) {
                            try { el.scrollIntoView({ inline: "nearest", block: "nearest" }); } catch (eSc) {}
                        }
                    }
                    try { renderBody(body, id); } catch (e) {
                        body.textContent = "渲染失败: " + ((e && e.message) || e);
                        console.error(e);
                    }
                    // 刷新状态行
                    sub.textContent = playerLine(me());
                }
                /* —— 彩蛋（§4.5.7）：2.5 秒内连续点「池子休闲」页签满 10 次 → CDK 兑换面板。
                      计数器闭包在此，不碰任何全局；点其他页签或停顿超时即清零。
                      openRedeem 与本代码同属一个 IIFE，词法可见，可直接调用。
                      2026-09-28 加强：每次点击（第 3 次起）toast 反馈剩余次数——
                      用户反馈「狂点没弹出来」时无法区分是没数上还是根本没触发，给自证。 —— */
                var eggCount = 0, eggTimer = null;
                tabDefs.forEach(function (td) {
                    var t = document.createElement("div");
                    t.className = "csh-dbg-tab" + (td.cls ? " " + td.cls : "") + (td.id === TAB ? " on" : "");
                    t.setAttribute("data-tab", td.id);
                    t.setAttribute("data-cls", td.cls || "");
                    t.textContent = td.name;
                    t.addEventListener("click", function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (td.id === "games") {
                            eggCount++;
                            if (eggTimer) clearTimeout(eggTimer);
                            eggTimer = setTimeout(function () { eggCount = 0; eggTimer = null; }, 2500);
                            if (eggCount >= 10) {
                                eggCount = 0;
                                if (eggTimer) { clearTimeout(eggTimer); eggTimer = null; }
                                if (typeof openRedeem === "function") {
                                    try { openRedeem(); } catch (eEgg) {
                                        console.error(eEgg);
                                        toast("兑换面板打开失败：" + (eEgg && eEgg.message || eEgg));
                                    }
                                } else {
                                    toast("兑换面板未就绪（openRedeem 缺失）");
                                }
                                return; /* 彩蛋触发这一次不切页签 */
                            }
                            /* 带 key="egg"：复用同一条 toast 只刷新文字，连点不再堆叠 4 条 */
                            if (eggCount >= 3) toast("再点 " + (10 - eggCount) + " 次解锁兑换（2.5 秒内）", "egg");
                        } else if (eggCount) {
                            eggCount = 0;
                            if (eggTimer) { clearTimeout(eggTimer); eggTimer = null; }
                        }
                        setTab(td.id);
                    }, true);
                    tabs.appendChild(t);
                });
                main.appendChild(tabs);
                main.appendChild(body);
                panel.appendChild(main);
                step("setTab", function () { setTab(TAB); });
                /* 【2026-10-02】兜底：把「池子休闲」页签滚进可视区。
                   它现在已是首位（见 tabDefs 注释），正常情况下必然可见；
                   但若将来有人把它挪回后面，或者窄屏下前面的项被撑宽，
                   这一行能保证玩家仍然看得到入口。
                   用 setTimeout(0) 是因为刚 append 的元素此刻还没完成布局，
                   scrollIntoView 在未布局时会算错位置。 */
                step("scrollGameTab", function () {
                    setTimeout(function () {
                        try {
                            var gt = tabs.querySelector('.csh-dbg-tab.game');
                            if (gt && gt.scrollIntoView) gt.scrollIntoView({ inline: "nearest", block: "nearest" });
                        } catch (eSc2) {}
                    }, 0);
                });

                overlay.appendChild(panel);
                step("appendChild", function () { uiHost().appendChild(overlay); });
                /* 隐藏自检（?selftest=1 · §12#1/#3/#4）：面板已进 DOM 后再扫，
                   且**只扫 #csh-dbg-overlay**——扫 document.body 会把 noname 本体页面
                   当成被检对象，必然满屏误报。自检自身异常一律吞掉，绝不影响面板。 */
                step("selftest", function () {
                    try {
                        var ST = (typeof window !== "undefined" && window.CSH && window.CSH.selftest) || lib.cshSelftest;
                        /* 【2026-10-02】把本面板里**用 div/span 实现、不带 role** 的可点元素
                           登记给自检的触摸目标检查。不登记的话它们永远逃检，
                           「自检全绿」就成了假保证（实测逃检的有 27px 的 chip、
                           20.6px 的失败项开关等）。谁实现谁登记，选择器随本模块演进。 */
                        try {
                            if (ST && typeof ST.addTapSelectors === "function") {
                                ST.addTapSelectors([
                                    ".csh-dbg-chip",                  // 皮肤 / 分类 chip（div，实测 27px）
                                    ".csh-dbg-psfb .fb-toggle",       // 失败项开关（div，实测 20.6px）
                                    ".csh-dbg-sk .csh-dbg-sk-acts button",
                                    ".csh-dbg-preset .ps-acts button",
                                    ".csh-dbg-detail .csh-dbg-dt-back",
                                ]);
                            }
                        } catch (eTap) {}
                        if (ST && typeof ST.armed === "function" && ST.armed()) {
                            var rep = ST.auto(overlay);
                            if (rep) {
                                try {
                                    console.log("[池子调试·自检] " + (rep.ok ? "通过" : "存在失败")
                                        + " ✓" + rep.pass + " !" + rep.warn + " ✗" + rep.fail);
                                    for (var qi = 0; qi < rep.checks.length; qi++) {
                                        var ck = rep.checks[qi];
                                        if (!ck.ok) console.warn("[池子调试·自检] " + ck.name + " → " + ck.detail);
                                    }
                                } catch (eQ) {}
                            }
                        }
                    } catch (eST) {}
                });
                try {
                    if (typeof _status !== "undefined") _status.cshDebugPanel = overlay;
                } catch (eSt) {}
                try { console.log("[池子调试] 面板已挂到 DOM"); } catch (eL) {}
            },
        };

        function openSafe() {
            try {
                lib.cshDebugMenu.open();
            } catch (e) {
                try { console.error("[池子调试] 打开失败", e); } catch (e2) {}
                try { toast("打开失败: " + ((e && e.message) || e)); } catch (e3) {}
            }
        }

        /* 【2026-10-02】玩家侧入口：直接打开面板并落在「池子休闲」页签。
           存在的意义：休闲功能域此前**只能**从调试面板进入，而调试面板是个开发者工具，
           入口藏在横滚页签条里（360px 首屏看不到）→ 玩家找不到游戏。
           现在 main/config.js 里加了「池子休闲」按钮调用本函数，
           玩家从扩展设置一步进入游戏列表，不必知道调试面板的存在。
           TAB 是本 IIFE 的模块级变量，setTab 会在面板构建时按其值选中页签，
           所以只需在 open() 之前把它设好。 */
        lib.cshDebug.openLobby = function () {
            try {
                TAB = "games";
                var existing = document.getElementById("csh-dbg-overlay");
                if (existing) closePanel();      // 先关掉旧实例，保证按新 TAB 重建
                lib.cshDebugMenu.open();
                return true;
            } catch (e) {
                try { console.error("[池子休闲] 打开失败", e); } catch (e2) {}
                try { toast("打开失败: " + ((e && e.message) || e)); } catch (e3) {}
                return false;
            }
        };

        var FLOAT_POS_KEY = "extension_池子魔将_csh_debug_float_pos";

        function loadFloatPos() {
            try {
                var raw = null;
                if (lib.config && lib.config[FLOAT_POS_KEY]) raw = lib.config[FLOAT_POS_KEY];
                if (!raw && typeof localStorage !== "undefined") raw = localStorage.getItem(FLOAT_POS_KEY);
                if (!raw) return null;
                if (typeof raw === "string") raw = JSON.parse(raw);
                if (raw && typeof raw.x === "number" && typeof raw.y === "number") return raw;
            } catch (e) {}
            return null;
        }
        function saveFloatPos(x, y) {
            var data = { x: Math.round(x), y: Math.round(y) };
            try {
                if (typeof game !== "undefined" && typeof game.saveConfig === "function") {
                    game.saveConfig(FLOAT_POS_KEY, data);
                } else if (lib.config) {
                    lib.config[FLOAT_POS_KEY] = data;
                }
            } catch (e0) {}
            try {
                if (typeof localStorage !== "undefined") localStorage.setItem(FLOAT_POS_KEY, JSON.stringify(data));
            } catch (e1) {}
        }

        /** 对局内唯一入口：悬浮球（已删除 system 工具栏按钮） */
        function mountFloatBtn() {
            try {
                if (typeof document === "undefined") return false;
                if (!canShow()) {
                    var dead = document.getElementById("csh-dbg-float-btn");
                    if (dead && dead.parentNode) dead.parentNode.removeChild(dead);
                    return false;
                }
                var old = document.getElementById("csh-dbg-float-btn");
                if (old && old.parentNode) return true;
                if (old) {
                    try { old.parentNode.removeChild(old); } catch (e0) {}
                }

                syncUiScale();
                // 注入悬浮球样式（黄铜印章 · 呼吸微光）；每次挂载重建，避免热更新后样式残留
                var oldFloatCss = document.getElementById("csh-dbg-float-css");
                if (oldFloatCss && oldFloatCss.parentNode) oldFloatCss.parentNode.removeChild(oldFloatCss);
                {
                    var st = document.createElement("style");
                    st.id = "csh-dbg-float-css";
                    st.textContent = [
                        "@keyframes cshDbgBreath{0%,100%{filter:drop-shadow(0 0 0 rgba(var(--csh-accent-rgb),0));}50%{filter:drop-shadow(0 0 9px rgba(var(--csh-accent-rgb),.45));}}",
                        /* 悬浮球挂在 documentElement（不随 body 缩放），所以用真实像素：
                         * 手机端 clamp 到 44px 以上才点得中；touch-action:none 阻止 WebView 抢手势 */
                        "#csh-dbg-float-btn{position:fixed!important;z-index:999990!important;box-sizing:border-box!important;",
                        "width:clamp(44px,12vmin,56px)!important;height:clamp(44px,12vmin,56px)!important;border-radius:16px!important;",
                        "display:flex!important;align-items:center!important;justify-content:center!important;flex-direction:column!important;",
                        "padding:0!important;margin:0!important;overflow:hidden!important;",
                        "background:var(--csh-fg)!important;",
                        "border:1px solid rgba(var(--csh-bg-rgb),.10)!important;color:var(--csh-bg)!important;",
                        "font-family:system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif!important;font-weight:600!important;line-height:1!important;",
                        "cursor:grab!important;user-select:none!important;pointer-events:auto!important;",
                        "touch-action:none!important;-webkit-tap-highlight-color:transparent!important;",
                        "box-shadow:0 2px 6px rgba(var(--csh-bg-rgb),.06),0 16px 40px -16px rgba(var(--csh-bg-rgb),.28)!important;",
                        "transition:transform .18s cubic-bezier(.22,.61,.36,1),box-shadow .24s ease,background .18s ease,border-color .18s ease!important;",
                        "animation:cshDbgBreath 3.6s ease-in-out infinite!important;}",
                        "#csh-dbg-float-btn:hover{transform:scale(1.08)!important;color:var(--csh-accent-ink)!important;background:var(--csh-accent)!important;border-color:var(--csh-accent)!important;box-shadow:0 6px 20px -6px rgba(var(--csh-accent-rgb),.60)!important;}",
                        "#csh-dbg-float-btn.csh-dragging{cursor:grabbing!important;animation:none!important;transform:scale(1.04)!important;}",
                        /* 单字「池」：字号占满圆球，居中对齐 */
                        "#csh-dbg-float-btn .csh-dbg-fb-main{display:block!important;position:static!important;",
                        "font-size:clamp(22px,6.2vmin,29px)!important;line-height:1!important;",
                        "letter-spacing:0!important;text-align:center!important;",
                        "text-shadow:none!important;}",
                    ].join("");
                    (document.head || document.documentElement).appendChild(st);
                }

                var btn = document.createElement("div");
                btn.id = "csh-dbg-float-btn";
                btn.innerHTML = "<span class='csh-dbg-fb-main'>池</span>";
                btn.title = "短按打开 · 拖动移动 · F1";

                var pos = loadFloatPos();
                if (pos) {
                    btn.style.left = pos.x + "px";
                    btn.style.top = pos.y + "px";
                    btn.style.right = "auto";
                    btn.style.bottom = "auto";
                } else {
                    btn.style.right = "16px";
                    btn.style.bottom = "88px";
                }

                // 短按打开 / 拖动移动。阈值 14px：手机点按抖动普遍 5~12px，
                // 老阈值 6px 会把「点」误判成「拖」，表现为「悬浮球点不开」
                var ptr = { id: null, x: 0, y: 0, sx: 0, sy: 0, moved: false, follow: false, startTime: 0 };
                // 双阈值：FOLLOW 只管「球跟不跟手」，DRAG 才决定「这次算拖还是算点」。
                // 用一个 14px 阈值同时干两件事的后果是拖动发滞（手指走了 1cm 球才动）。
                var FOLLOW_THRESHOLD = 4;
                var DRAG_THRESHOLD = 14;
                // 「打开/关闭」由原生 click 与 pointerup 两条独立链路共同驱动：
                // 任一被游戏或 WebView 吞掉时另一条仍可用。300ms 内只认一次，避免双开双关；
                // 拖动结束时也用它吞掉紧跟的 click，防止「拖完误触打开」。
                var lastToggle = 0;
                function togglePanel() {
                    var now = Date.now();
                    if (now - lastToggle < 300) return;
                    lastToggle = now;
                    var existing = document.getElementById("csh-dbg-overlay");
                    if (existing) closePanel();
                    else openSafe();
                }

                function onDown(e) {
                    // 自愈：若上一次手势没能收尾（pointerup 被游戏或 WebView 吞掉、指针在球外抬起等），
                    // ptr.id 会一直不复位、悬浮球彻底失去响应。正常手势间隔远小于 1.2s，
                    // 一旦超时就说明上一条手势已经丢了，立刻强制复位，不再让球「装死」10 秒。
                    if (ptr.id != null && Date.now() - ptr.startTime > 1200) {
                        try { btn.classList.remove("csh-dragging"); } catch (eStale) {}
                        ptr.id = null;
                    }
                    if (ptr.id != null) return;
                    ptr.id = e.pointerId != null ? e.pointerId : 1;
                    ptr.x = e.clientX;
                    ptr.y = e.clientY;
                    ptr.moved = false;
                    ptr.follow = false;
                    // 短按时长基准。此前从未赋值，held 恒等于 Date.now()（远大于 800），
                    // 「短按打开」分支因此成了死代码 —— 这是悬浮球点不开的根因
                    ptr.startTime = Date.now();
                    var r = btn.getBoundingClientRect();
                    ptr.sx = r.left;
                    ptr.sy = r.top;
                    btn.classList.add("csh-dragging");
                    try { btn.setPointerCapture && btn.setPointerCapture(ptr.id); } catch (eC) {}
                    // 这里不 preventDefault：个别 Android WebView 会因此吞掉后续 pointerup，导致短按失效；
                    // 阻止滚动交给 CSS 的 touch-action:none
                    try { e.stopPropagation(); } catch (eS) {}
                }
                function onMove(e) {
                    if (ptr.id == null) return;
                    if (e.pointerId != null && e.pointerId !== ptr.id) return;
                    var dx = e.clientX - ptr.x;
                    var dy = e.clientY - ptr.y;
                    var d2 = dx * dx + dy * dy;
                    // 双阈值各司其职：≥FOLLOW 才让球跟手（否则手指走了 1cm 球才动），
                    // ≥DRAG 才把这次手势判成「拖动」而不是「点击」。
                    if (!ptr.follow && d2 >= FOLLOW_THRESHOLD * FOLLOW_THRESHOLD) ptr.follow = true;
                    if (!ptr.moved && d2 >= DRAG_THRESHOLD * DRAG_THRESHOLD) ptr.moved = true;
                    if (!ptr.follow) return;
                    var nx = ptr.sx + dx;
                    var ny = ptr.sy + dy;
                    var maxX = (window.innerWidth || 800) - btn.offsetWidth;
                    var maxY = (window.innerHeight || 600) - btn.offsetHeight;
                    nx = Math.max(0, Math.min(maxX, nx));
                    ny = Math.max(0, Math.min(maxY, ny));
                    btn.style.left = nx + "px";
                    btn.style.top = ny + "px";
                    btn.style.right = "auto";
                    btn.style.bottom = "auto";
                    try { e.preventDefault(); } catch (eP) {}
                }
                function onUp(e) {
                    if (ptr.id == null) return;
                    if (e.pointerId != null && e.pointerId !== ptr.id) return;
                    btn.classList.remove("csh-dragging");
                    try { btn.releasePointerCapture && btn.releasePointerCapture(ptr.id); } catch (eR) {}
                    var wasDrag = ptr.moved;
                    var held = Date.now() - ptr.startTime;
                    var left = parseFloat(btn.style.left);
                    var top = parseFloat(btn.style.top);
                    ptr.id = null;
                    if (wasDrag) {
                        if (!isNaN(left) && !isNaN(top)) saveFloatPos(left, top);
                        // 拖动后浏览器仍会补一个 click，这里把它吞掉，避免拖完误触打开
                        lastToggle = Date.now();
                        try { console.log("[池子调试] 悬浮球拖动结束", left, top); } catch (e1) {}
                    } else if (held <= 800) {
                        // 短按：打开/关闭面板（>800ms 视为长按误触，不响应）
                        try { console.log("[池子调试] 悬浮球短按"); } catch (e2) {}
                        togglePanel();
                    }
                    try { e.preventDefault(); e.stopPropagation(); } catch (eP) {}
                }
                // 手势被系统打断（来电、多指、滚动接管）时只复位，不能当成一次点击。
                // cancel 现在挂在 document 上，必须校验 pointerId，否则第二根手指的取消会误杀正在进行的拖动。
                function onCancel(e) {
                    if (ptr.id == null) return;
                    if (e && e.pointerId != null && e.pointerId !== ptr.id) return;
                    btn.classList.remove("csh-dragging");
                    ptr.id = null;
                }

                if (window.PointerEvent) {
                    // 只有 pointerdown 挂在球上（要取起点）；move/up/cancel 一律挂 document，
                    // 与下面 mouse/touch 分支对齐 —— 不再依赖 setPointerCapture 是否成功。
                    // capture 失败时旧写法收不到 move/up：球不跟手，且 ptr.id 卡死导致彻底没反应。
                    btn.addEventListener("pointerdown", onDown, true);
                    document.addEventListener("pointermove", onMove, true);
                    document.addEventListener("pointerup", onUp, true);
                    document.addEventListener("pointercancel", onCancel, true);
                } else {
                    btn.addEventListener("mousedown", onDown, true);
                    document.addEventListener("mousemove", onMove, true);
                    document.addEventListener("mouseup", onUp, true);
                    btn.addEventListener("touchstart", function (e) {
                        var t = e.changedTouches[0];
                        onDown({ pointerId: 1, clientX: t.clientX, clientY: t.clientY, stopPropagation: function () { e.stopPropagation(); } });
                    }, { capture: true, passive: false });
                    document.addEventListener("touchmove", function (e) {
                        var t = e.changedTouches[0];
                        onMove({ pointerId: 1, clientX: t.clientX, clientY: t.clientY, preventDefault: function () { e.preventDefault(); } });
                    }, { capture: true, passive: false });
                    document.addEventListener("touchend", function (e) {
                        var t = e.changedTouches[0];
                        onUp({ pointerId: 1, clientX: t.clientX, clientY: t.clientY, preventDefault: function () { e.preventDefault(); }, stopPropagation: function () { e.stopPropagation(); } });
                    }, { capture: true, passive: false });
                    document.addEventListener("touchcancel", function () { onCancel(); }, true);
                }

                // 原生 click 兜底：与 pointer 是两条独立链路，任一条被吞掉另一条仍能打开。
                // 此 handler 在 click 已产生之后才执行，preventDefault 仅用于阻止继续冒泡到游戏层。
                btn.addEventListener("click", function (e) {
                    try { e.preventDefault(); e.stopPropagation(); } catch (eP) {}
                    togglePanel();
                }, false);

                var parent = uiHost();
                parent.appendChild(btn);
                // 分辨率/缩放变化后旧坐标可能越界，挂载时先钳制回可视区
                try {
                    var r0 = btn.getBoundingClientRect();
                    var maxX0 = (window.innerWidth || 800) - r0.width;
                    var maxY0 = (window.innerHeight || 600) - r0.height;
                    if (r0.left > maxX0 || r0.top > maxY0 || r0.left < 0 || r0.top < 0) {
                        var cx = Math.max(0, Math.min(maxX0, r0.left));
                        var cy = Math.max(0, Math.min(maxY0, r0.top));
                        btn.style.left = cx + "px";
                        btn.style.top = cy + "px";
                        btn.style.right = "auto";
                        btn.style.bottom = "auto";
                        saveFloatPos(cx, cy);
                    }
                } catch (eClamp) {}
                try { console.log("[池子调试] 悬浮球已挂载"); } catch (e1) {}
                return true;
            } catch (e) {
                try { console.error("[池子调试] mountFloatBtn", e); } catch (e2) {}
                return false;
            }
        }

        function bindHotkey() {
            if (lib.__csh_debug_hotkey) return;
            lib.__csh_debug_hotkey = true;
            try {
                document.addEventListener("keydown", function (e) {
                    try {
                        if (e.key !== "F1" && e.keyCode !== 112) return;
                        var tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
                        if (tag === "input" || tag === "textarea" || (e.target && e.target.isContentEditable)) return;
                        e.preventDefault();
                        e.stopPropagation();
                        var existing = document.getElementById("csh-dbg-overlay");
                        if (existing) closePanel();
                        else openSafe();
                    } catch (err) {
                        try { console.error("[池子调试] hotkey", err); } catch (e2) {}
                    }
                }, true);
                try { console.log("[池子调试] F1 热键已绑定"); } catch (e0) {}
            } catch (e) {
                try { console.error("[池子调试] bindHotkey", e); } catch (e2) {}
            }
        }

        function mountAll(reason) {
            try { console.log("[池子调试] mountAll:", reason || ""); } catch (eLog) {}
            if (!canShow()) {
                try { console.log("[池子调试] 当前不可用，跳过挂载"); } catch (e1) {}
                var dead = document.getElementById("csh-dbg-float-btn");
                if (dead && dead.parentNode) try { dead.parentNode.removeChild(dead); } catch (e3) {}
                // 移除可能残留的 system 按钮
                try {
                    if (ui && ui.csh_debug_btn && ui.csh_debug_btn.parentNode) {
                        ui.csh_debug_btn.parentNode.removeChild(ui.csh_debug_btn);
                    }
                    if (ui) ui.csh_debug_btn = null;
                } catch (e4) {}
                return;
            }
            bindHotkey();
            mountFloatBtn();
            // 主动移除旧 system 按钮（若有）
            try {
                if (ui && ui.csh_debug_btn) {
                    if (ui.csh_debug_btn.parentNode) ui.csh_debug_btn.parentNode.removeChild(ui.csh_debug_btn);
                    ui.csh_debug_btn = null;
                }
            } catch (e5) {}
        }

        try {
            if (lib.arenaReady && typeof lib.arenaReady.push === "function") {
                lib.arenaReady.push(function () { mountAll("arenaReady"); });
            }
        } catch (e1) {
            try { console.error("[池子调试] arenaReady push 失败", e1); } catch (e2) {}
        }
        bindHotkey();
        [300, 1000, 2500, 5000, 10000].forEach(function (ms) {
            setTimeout(function () { mountAll("timeout:" + ms); }, ms);
        });
        var tries = 0;
        var timer = setInterval(function () {
            tries++;
            try {
                if (!canShow()) return;
                if (!document.getElementById("csh-dbg-float-btn")) mountFloatBtn();
            } catch (e) {}
            if (tries >= 120) clearInterval(timer);
        }, 1000);

        try { console.log("[池子调试] UI 模块初始化完成（仅悬浮球入口）"); } catch (eInit) {}
    })();

export default null;
