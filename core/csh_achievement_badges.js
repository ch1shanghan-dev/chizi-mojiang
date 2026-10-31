/* Local decorative achievement seals. No storage, timers, imports or rule writes. */
(function (root) {
    "use strict";
    if (!root || root.CSHAchievementBadges) return;
    var NS = "http://www.w3.org/2000/svg";
    var LABELS = { feat: "同局挑战", wins: "胜场里程碑", blade: "伤害与操作", shield: "坚守与峰值",
        chain: "连击", banner: "模式挑战", skill: "技能功业", cards: "牌张运用", heal: "恢复", judge: "判定与拼点" };
    var PATHS = {
        feat: ["M30 12 42 31 30 52 18 31Z", "M22 31h16M30 22v18"],
        wins: ["M18 24h24v9c0 15-24 15-24 0zM30 43v9m-8 0h16M18 27H12v6l8 6m22-12h6v6l-8 6"],
        blade: ["m39 15 4 4-17 23-6-6zM19 36l8 8M22 40l-7 10m-2-3 6 5"],
        shield: ["m30 14 15 6-2 21-13 12-13-12-2-21zM30 20v25M22 28h16"],
        chain: ["m24 39-4 4c-8 5-15-4-10-10l12-12c7-6 15 3 10 9m4-1 4-4c8-5 15 4 10 10L38 47c-7 6-15-3-10-9M21 39l18-12"],
        banner: ["M18 53V14m1 3h24l-5 9 5 9H19m-5 18h13"],
        skill: ["M17 17h26v34H17zM22 24h16m-16 7h16m-16 7h10M14 17v34m29-34h3v34h-3"],
        cards: ["m16 23 22-6 10 32-22 6zM13 40l-5-22 22-5 2 5m-3 17 4-7 7 4-4 7z"],
        heal: ["M15 46c2-20 12-28 30-28-1 20-10 30-27 30M16 50l21-24m-13 3v12h11"],
        judge: ["M30 16v35m-11 0h22M14 24h32m-26 0-7 15h14zm20 0-7 15h14z"]
    };
    function read(rule, key) {
        try { return rule && typeof rule === "object" && !Array.isArray(rule) ? rule[key] : undefined; }
        catch (e) { return undefined; }
    }
    function family(rule) {
        var scope = read(rule, "scope"), cat = read(rule, "cat"), metric = read(rule, "metric");
        if (scope === "feat" || read(rule, "tactic")) return "feat";
        if (scope === "wins") return "wins";
        if (cat === "逆境") return "shield";
        if (cat === "连击") return "chain";
        if (cat === "模式") return "banner";
        if (typeof metric === "string") {
            if (metric.indexOf("s:") === 0) return "skill";
            if (metric.indexOf("d:") === 0) return "blade";
            if (metric.indexOf("r:") === 0) return "heal";
            if (metric.indexOf("p:") === 0) return "shield";
            if (metric.indexOf("q:") === 0) return "judge";
            if (/^[gcl]:/.test(metric)) return "cards";
        }
        return cat === "武将" ? "skill" : "blade";
    }
    function title(rule) { return LABELS[family(rule)]; }
    function create(rule, doc) {
        if (!doc || typeof doc.createElementNS !== "function") return null;
        var kind = family(rule), rare = read(rule, "rare");
        if (rare !== 2 && rare !== 3) rare = 1;
        function node(tag, attrs) {
            var result = doc.createElementNS(NS, tag);
            Object.keys(attrs).forEach(function (key) { result.setAttribute(key, attrs[key]); });
            return result;
        }
        var svg = node("svg", { "class": "csh-achv-badge csh-achv-badge--rare-" + rare, "data-family": kind,
            viewBox: "0 0 60 68", width: "32", height: "36", "aria-hidden": "true", focusable: "false" });
        svg.appendChild(node("path", { "class": "csh-achv-badge__plate", d: "M30 2 54 14v34L30 65 6 48V14Z", fill: "none", stroke: "currentColor", "stroke-width": "1.4" }));
        svg.appendChild(node("path", { "class": "csh-achv-badge__rim", d: "M30 7 49 17v28L30 59 11 45V17Z", fill: "none", stroke: "currentColor", "stroke-width": "1" }));
        var symbol = node("g", { "class": "csh-achv-badge__symbol", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linejoin": "round", "stroke-linecap": "round" });
        PATHS[kind].forEach(function (d) { symbol.appendChild(node("path", { d: d })); });
        svg.appendChild(symbol);
        if (rare > 1) svg.appendChild(node("path", { "class": "csh-achv-badge__grade", d: rare === 3 ? "M19 8v6M30 3v7M41 8v6" : "M23 6v6M37 6v6", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" }));
        return svg;
    }
    root.CSHAchievementBadges = Object.freeze({ family: family, create: create, title: title });
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : null);
