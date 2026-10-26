/* 第一批非武将修复：确认框生命周期 + 个人战绩。只使用临时 DOM/内存配置。
   node tools/probe_first_batch.mjs
   node tools/probe_first_batch.mjs --browser "C:/Program Files/Google/Chrome/Application/chrome.exe"
   --root 可指向改前备份，用同一组行为断言验证负例。 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const root = path.resolve(option("--root", path.join(path.dirname(fileURLToPath(import.meta.url)), "..")));
const uiSource = fs.readFileSync(path.join(root, "core/csh_uikit.js"), "utf8");
const wrSource = fs.readFileSync(path.join(root, "core/csh_winrate.js"), "utf8");
const uiScript = uiSource.replace(/^import[^\n]*\n/gm, "").replace(/^export (const|function) /gm, "$1 ").replace(/^export default null;[^\n]*/gm, "");
const results = [];
const check = (name, passed) => results.push({ name, passed: !!passed });

function extract(source, name) {
    const start = new RegExp("function\\s+" + name + "\\s*\\(").exec(source);
    if (!start) throw new Error("Missing function: " + name);
    let end = source.indexOf("\n", start.index);
    while (end >= 0) {
        const candidate = source.slice(start.index, end);
        try { new vm.Script("(" + candidate + "\n)"); return candidate; }
        catch (error) { if (!(error instanceof SyntaxError)) throw error; }
        end = source.indexOf("\n", end + 1);
    }
    throw new Error("Function changed; update harness: " + name);
}

// One suite runs against both the minimal DOM and real Chromium DOM.
function uiCases(confirmBox, doc, key, click, listenerCount) {
    const out = [];
    const test = (name, ok) => out.push({ name, passed: !!ok });
    let calls = [];
    const a = confirmBox("A", value => calls.push(["A", value]));
    const b = confirmBox("B", value => calls.push(["B", value]));
    test("replacement cancels old callback once", JSON.stringify(calls) === '[["A",false]]');
    test("replacement leaves one key handler", listenerCount() === 1);
    a.close();
    test("stale handle cannot close new dialog", doc.getElementById("csh-ui-confirm") === b.el);
    key("Enter");
    test("Enter confirms only current dialog", JSON.stringify(calls) === '[["A",false],["B",true]]');
    b.close();
    test("close after completion is idempotent", calls.length === 2 && listenerCount() === 0);

    for (const action of ["Escape", "background", "cancel", "ok", "close"]) {
        calls = [];
        const h = confirmBox(action, value => calls.push(value));
        const acts = h.el.children[0].children[2];
        const target = action === "background" ? h.el : action === "cancel" ? acts.children[0] : acts.children[1];
        if (action === "Escape") key("Escape");
        else if (action === "close") h.close();
        else { click(target); click(target); }
        h.close(); key("Enter");
        test(action + " completes once and detaches", calls.length === 1 && calls[0] === (action === "ok") && listenerCount() === 0 && !h.el.parentNode);
    }

    calls = [];
    confirmBox("A", value => {
        calls.push(["A", value]);
        if (!value) confirmBox("C", accepted => calls.push(["C", accepted]));
    });
    const reentered = confirmBox("B", value => calls.push(["B", value]));
    const newest = doc.getElementById("csh-ui-confirm");
    test("cancel callback may open a newer dialog", newest && newest !== reentered.el && newest.children[0].children[1].textContent === "C");
    test("reentrant cancellation cleans both older dialogs", JSON.stringify(calls) === '[["A",false],["B",false]]' && listenerCount() === 1);
    key("Enter");
    test("reentrant dialog owns next confirmation", JSON.stringify(calls) === '[["A",false],["B",false],["C",true]]' && listenerCount() === 0);

    let count = 0;
    for (let i = 0; i < 20; i++) {
        confirmBox("cycle A", () => count++);
        const h = confirmBox("cycle B", () => count++);
        h.close(); h.close();
    }
    test("20 replacement cycles leave no handlers or dialog", count === 40 && listenerCount() === 0 && !doc.getElementById("csh-ui-confirm"));
    const throwing = confirmBox("throws", () => { throw new Error("callback failure"); });
    throwing.close();
    test("throwing callback still cleans instance", listenerCount() === 0 && !throwing.el.parentNode);
    return out;
}

function makeDOM() {
    const handlers = new Set(), timers = new Map();
    let nextTimer = 0;
    function element(tagName) {
        const events = {};
        return {
            tagName, children: [], parentNode: null, style: {}, textContent: "",
            setAttribute(name, value) { this[name] = String(value); },
            appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
            removeChild(child) { this.children = this.children.filter(x => x !== child); child.parentNode = null; },
            addEventListener(type, fn) { (events[type] ||= []).push(fn); },
            dispatchEvent(event) { event.target ||= this; for (const fn of events[event.type] || []) fn(event); },
            focus() {},
        };
    }
    const html = element("html"), head = element("head"), body = element("body");
    html.appendChild(head); html.appendChild(body);
    function find(node, id) {
        if (node.id === id) return node;
        for (const child of node.children) { const match = find(child, id); if (match) return match; }
        return null;
    }
    const document = {
        documentElement: html, head, body, createElement: element,
        getElementById: id => find(html, id),
        addEventListener(type, fn) { if (type === "keydown") handlers.add(fn); },
        removeEventListener(type, fn) { if (type === "keydown") handlers.delete(fn); },
    };
    const event = (type, key) => ({ type, key, preventDefault() {}, stopPropagation() {} });
    return {
        document,
        setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; },
        clearTimeout(id) { timers.delete(id); },
        key(key) { for (const fn of [...handlers]) fn(event("keydown", key)); },
        click(el) { el.dispatchEvent(event("click")); },
        listenerCount: () => handlers.size, timerCount: () => timers.size,
    };
}

try {
    const dom = makeDOM();
    const ctx = vm.createContext({ lib: {}, game: {}, ...dom });
    vm.runInContext(uiScript, ctx, { timeout: 1000 });
    results.push(...uiCases(ctx.confirmBox, dom.document, dom.key, dom.click, dom.listenerCount).map(r => ({ ...r, name: "DOM: " + r.name })));
    check("DOM: closed dialogs leave no focus timers", dom.timerCount() === 0);

    const names = ["saveBlocked", "readData", "modeKey", "collect", "charNames", "record", "recordCamp", "recordMe", "capture"];
    const statsCode = names.map(name => extract(wrSource, name)).join("\n");
    const modeNames = JSON.parse(wrSource.match(/var MODE_NAMES=(\{[^\n]*?\});/)[1].replace(/([{,])(\w+):/g, '$1"$2":'));
    function stats(mode = "identity", outcome = true, overrides = {}) {
        const me = { playerid: "me", name: "hero", name1: "hero", identity: mode === "versus" ? undefined : mode === "guozhan" ? "wei" : "zhu", side: true, stat: [{ damage: 3, damaged: 1, gain: 2, kill: 1 }] };
        const enemy = { playerid: "enemy", name: "enemy", name1: "enemy", identity: mode === "versus" ? undefined : mode === "guozhan" ? "shu" : "fan", side: false };
        const lib = { config: { stat: overrides.data || {} } };
        let saves = 0;
        const game = { me, players: [me, enemy], dead: [], checkOnlineResult: p => p.side === me.side ? outcome : !outcome,
            saveConfig(key, data) { lib.config[key] = data; saves++; } };
        const status = {};
        if (overrides.setup) overrides.setup({ me, enemy, game, status });
        const sb = vm.createContext({ lib, game, _status: status, get: { mode: () => mode }, localStorage: { getItem() { return null; } }, STAT_KEY: "stat", MODE_NAMES: modeNames, dbgError() {} });
        vm.runInContext(statsCode, sb, { timeout: 1000 });
        sb.capture(outcome);
        return { data: lib.config.stat, game, status, capture: sb.capture, saves: () => saves };
    }
    for (const mode of ["identity", "versus", "guozhan", "doudizhu"]) {
        for (const outcome of [true, false]) {
            const { data } = stats(mode, outcome);
            const mine = data.me?.chars?.hero;
            check(mode + ": personal " + (outcome ? "win" : "loss"), mine?.games === 1 && mine.win === Number(outcome) && mine.lose === Number(!outcome));
            check(mode + ": general stats unchanged " + outcome, data[mode]?.hero?.damage === 3 && data[mode].hero.games === 1 && data[mode].enemy.games === 1);
            check(mode + ": camp scope unchanged " + outcome, mode === "guozhan" || mode === "versus" ? !data.camps && !data.me?.camps : data.camps?.zhu?.games === 1 && data.me?.camps?.zhu?.games === 1);
        }
    }
    for (const mode of ["two", "2v2", "identity_normal"]) {
        const { data } = stats(mode);
        check(mode + ": mode alias still records personal hero", data.me?.chars?.hero?.games === 1);
    }
    const dual = stats("guozhan", true, { setup({ me }) { me.name2 = "second"; } });
    check("dual hero records each identity once", dual.data.me?.chars?.hero?.games === 1 && dual.data.me.chars.second?.games === 1 && !dual.data.me.camps);
    const scs = stats("identity", true, { setup({ me }) { me.name = "shichangshi"; me.name1 = "scs_bilan"; me.name2 = "scs_zhaozhong"; } });
    check("shichangshi records body rather than avatars", scs.data.me?.chars?.shichangshi?.games === 1 && !scs.data.me.chars.scs_bilan && !scs.data.me.chars.scs_zhaozhong);
    const controlled = stats("versus", true, { setup({ game, me }) { game.me = { _trueMe: me }; } });
    check("controlled viewpoint resolves true local player", controlled.data.me?.chars?.hero?.games === 1);
    const duplicate = stats("versus", true, { setup({ game, me }) { game.dead = [me]; game.additionaldead = [me]; } });
    check("duplicate player arrays do not duplicate personal record", duplicate.data.me?.chars?.hero?.games === 1);
    duplicate.status.over = true; duplicate.capture(true);
    check("already-over callback cannot duplicate records", duplicate.data.me?.chars?.hero?.games === 1);
    const undecided = stats("identity", true, { setup({ game }) { game.checkOnlineResult = () => undefined; } });
    check("unknown opponent result is not guessed", undecided.data.me?.chars?.hero?.games === 1 && !undecided.data.identity.enemy);
    for (const key of ["over", "video", "connectMode", "online"]) {
        const blocked = stats("versus", true, { setup({ game, status }) { (key === "online" ? game : status)[key] = true; } });
        check(key + ": no records written", blocked.saves() === 0 && !blocked.data.me);
    }
    check("draw is not recorded", stats("identity", "平局").saves() === 0);
    check("unsupported mode is not recorded", stats("chess").saves() === 0);
    const historical = { versus: { hero: { games: 2, win: 1, lose: 1, damage: 4, damaged: 0, gain: 0, discard: 0, kill: 0 } }, me: { chars: { hero: { games: 1, win: 0, lose: 1 } } } };
    const resumed = stats("versus", true, { data: historical });
    check("existing personal history is incremented without backfill", resumed.data.me.chars.hero.games === 2 && resumed.data.me.chars.hero.win === 1 && resumed.data.versus.hero.games === 3);

    const browser = option("--browser", "");
    if (browser) {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "csh-first-batch-browser-"));
        const file = path.join(dir, "confirm.html");
        const browserCode = `var lib={},game={};
const handlers=new Set(),add=document.addEventListener.bind(document),remove=document.removeEventListener.bind(document);
document.addEventListener=function(type,fn,opt){if(type==='keydown')handlers.add(fn);return add(type,fn,opt);};
document.removeEventListener=function(type,fn,opt){if(type==='keydown')handlers.delete(fn);return remove(type,fn,opt);};
${uiScript}
${uiCases.toString()}
try{const result=uiCases(confirmBox,document,key=>document.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true})),el=>el.click(),()=>handlers.size);document.getElementById('results').textContent=JSON.stringify(result);}
catch(error){document.getElementById('results').textContent=JSON.stringify({error:String(error.stack)});}`;
        fs.writeFileSync(file, '<!doctype html><html><head><meta charset="utf-8"></head><body><pre id="results"></pre><script>' + browserCode.replace(/<\/script/gi, "<\\/script") + '</script></body></html>');
        const html = execFileSync(browser, ["--headless=new", ...(args.includes("--no-browser-sandbox") ? ["--no-sandbox"] : []), "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--user-data-dir=" + path.join(dir, "profile"), "--dump-dom", pathToFileURL(file).href], { encoding: "utf8", timeout: 30000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 2 * 1024 * 1024 });
        const match = html.match(/<pre id="results">([\s\S]*?)<\/pre>/);
        if (!match) throw new Error("Browser produced no report: " + dir);
        const report = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
        if (!Array.isArray(report)) throw new Error(JSON.stringify(report));
        results.push(...report.map(r => ({ ...r, name: "Chromium: " + r.name })));
        console.log("Browser artifact: " + file);
    }
    for (const result of results) console.log((result.passed ? "[PASS] " : "[FAIL] ") + result.name);
    const fail = results.filter(r => !r.passed).length;
    console.log(`First batch: PASS ${results.length - fail} / FAIL ${fail}${browser ? " (includes real Chromium DOM)" : " (VM only)"}`);
    process.exitCode = fail ? 1 : 0;
} catch (error) {
    console.error("HARNESS_ERROR: " + error.stack);
    process.exitCode = 2;
}
