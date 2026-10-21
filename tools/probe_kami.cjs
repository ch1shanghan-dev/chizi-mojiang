/* 池子魔将 · 神武将选势力 探针（2026-10-18 · 第四版）
   ------------------------------------------------------------
   前三次探针都有一个共同的毛病：**验证的其实是"我以为的引擎"，不是引擎。**
   这一版把三件事分开验：
     A. 我们的 install 逻辑（注册 / 幂等 / _priority）
     B. 判定矩阵（八种玩家形态 × 六种模式）
     C. **诊断通道**（每次拒绝都要留下原因，出问题时能自证）

   其中 B 的门槛条件逐条对应引擎源码；`get.character` 的两种形态解析也照
   `character.js:196-207/288` 实现 —— 但**不再给角色补 doubleGroup**，
   因为那条路会被选将界面画出来（ui/create/index.js:3191-3197），已作废。

   用法：node tools/probe_kami.cjs */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const sourceAt = process.argv.indexOf("--source");
const SRC = sourceAt < 0 ? path.join(ROOT, "core", "csh_rules.js") : process.argv[sourceAt + 1];

let pass = 0, failCnt = 0;
const fails = [];
function ck(name, cond, extra) {
	if (cond) { pass++; console.log("  [PASS] " + name); }
	else { failCnt++; fails.push(name); console.log("  [FAIL] " + name + (extra !== undefined ? "  → " + JSON.stringify(extra) : "")); }
}

/* ---------- 载入真实源码 ---------- */
let code = fs.readFileSync(SRC, "utf8");
const importRe = /^import\s*\{([^}]*)\}\s*from\s*["'][^"']*["'];?/m;
if (!importRe.test(code)) { console.log("  [FAIL] 无法识别 import 头"); process.exit(1); }
code = code.replace(importRe, "const {$1} = __cshMock;");
code = code.replace(/export\s+function/g, "function");
code += "\n;({ installKamiChoice: installKamiChoice, kamiStatus: kamiStatus })";

/* ---------- 引擎 mock ---------- */
const lib = {
	group: ["wei", "shu", "wu", "qun", "jin", "shen"],
	selectGroup: ["shen", "devil"],
	character: {},
	skill: { global: [] },
	hook: { globalskill: {} },
	hookmap: {},
	config: {},                 /* 扩展配置：extension_池子魔将_csh_kami_group 读这里 */
};
lib.skill.global.add = function (s) { if (!this.includes(s)) this.push(s); };
lib.skill.global.remove = function (s) { const i = this.indexOf(s); if (i >= 0) this.splice(i, 1); };

/* 引擎 Character 的两条分支（对象 Object.assign / 数组按索引 + [5] 的 doublegroup 串） */
function toCharacter(data) {
	if (Array.isArray(data)) {
		const o = { group: data[1], hp: data[2], skills: data[3] || [], doubleGroup: [], hasHiddenSkill: false };
		for (const it of (data[5] || [])) {
			if (typeof it !== "string") continue;
			if (it.indexOf("doublegroup:") === 0) o.doubleGroup = it.slice(12).split(":");
			if (it === "hidden") o.hasHiddenSkill = true;
		}
		return o;
	}
	const o = Object.assign({ doubleGroup: [], hasHiddenSkill: false }, data);
	if (!Array.isArray(o.doubleGroup)) o.doubleGroup = [];
	return o;
}

const SKILLS = {
	csh_fake_double: { initGroup: "shu" },
	longdan: {},
	csh_bingxin: {},
};
let MODE = "doudizhu";
let CONFIG = { choose_group: true };

const get = {
	character(name) { return toCharacter(lib.character[name] || { isNull: true }); },
	info(skill) { return SKILLS[skill] || {}; },
	mode() { return MODE; },
	config(k) { return CONFIG[k]; },
};

const game = {
	addGlobalSkill(s) {
		if (!lib.skill[s]) return false;
		lib.skill.global.add(s);
		const info = lib.skill[s];
		if (info.trigger) {
			for (const role in info.trigger) {
				const evt = info.trigger[role];
				const key = role + "_" + evt;
				lib.hook.globalskill[key] = lib.hook.globalskill[key] || [];
				if (!lib.hook.globalskill[key].includes(s)) lib.hook.globalskill[key].push(s);
				lib.hookmap[evt] = true;
			}
		}
		return true;
	},
};

/* ---------- 数据：八种形态 ---------- */
lib.character = {
	shen_zhaoyun: ["male", "shen", 4, ["longdan"], null, []],          /* 数组·神·无 doubleGroup */
	csh_shencaozhi: { group: "shen", hp: 3, skills: ["csh_bingxin"] },  /* 对象·神（扩展包内） */
	csh_boss_minion_temari: { group: "devil", hp: 3, skills: [] },      /* devil（BOSS 全家） */
	csh_boss_king: ["female", "devil", 30, [], null, []],
	re_liubei: ["male", "shu", 4, [], null, []],                        /* 普通 */
	shen_owned: { group: "shen", hp: 4, skills: [], doubleGroup: ["wei", "shu"] },  /* 已有双势力 */
	shen_hidden: { group: "shen", hp: 4, skills: [], hasHiddenSkill: true },
	wenyang: { group: "wei", hp: 4, skills: ["csh_fake_double"] },      /* 普通势力 + initGroup */
	shen_double: { group: "shen", hp: 4, skills: ["csh_fake_double"] }, /* 神 + initGroup：该让给引擎 */
};

const sandbox = { __cshMock: { lib, game, get }, console };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const { installKamiChoice, kamiStatus } = sandbox;

/* ---------- A. 安装 ---------- */
console.log("== A. 安装 ==");
ck("installKamiChoice() 返回 true", installKamiChoice() === true);
ck("技能写进了 lib.skill", !!lib.skill._csh_kami_choice);
ck("进了 lib.skill.global", lib.skill.global.includes("_csh_kami_choice"));
ck("注册了 global_gameStart hook", (lib.hook.globalskill["global_gameStart"] || []).includes("_csh_kami_choice"), lib.hook.globalskill);
ck("注册了 player_enterGame hook", (lib.hook.globalskill["player_enterGame"] || []).includes("_csh_kami_choice"));
ck("hookmap.gameStart 被点亮", lib.hookmap.gameStart === true);
ck("补了 _priority = 25×100", lib.skill._csh_kami_choice._priority === 2500, lib.skill._csh_kami_choice._priority);
ck("补了 skill_id", lib.skill._csh_kami_choice.skill_id === "_csh_kami_choice");
ck("幂等（第二次仍 true、global 不重复）", installKamiChoice() === true && lib.skill.global.filter((s) => s === "_csh_kami_choice").length === 1);

/* ---------- B. 判定矩阵 ---------- */
function groupOf(name) {
	const d = lib.character[name];
	if (!d) return "";
	return Array.isArray(d) ? d[1] : d.group;
}
function mk(name, opt) {
	opt = opt || {};
	/* player.group 是**运行时**状态：init 后等于角色势力，被别人改过就不是了。
	   默认按角色势力填，这样"让位守卫"在正常场景下不会误伤。 */
	const p = { name1: name, name: name, _pick: opt.pick || "shu", group: groupOf(name) };
	if (opt.playerGroup) p.group = opt.playerGroup;
	if (opt.chosen) p._groupChosen = opt.chosen;
	p.chooseButton = function (dlg) {
		p.asked = (p.asked || 0) + 1; p.dialog = dlg;
		return { set() { return this; }, forResult() { return Promise.resolve({ bool: true, links: [["", "", "group_" + p._pick]] }); } };
	};
	p.changeGroup = function (g, log, bc) { p.changed = { group: g, log, bc }; return Promise.resolve(); };
	return p;
}
const F = (p) => lib.skill._csh_kami_choice.filter({ name: "gameStart" }, p);
const C = (p) => lib.skill._csh_kami_choice.content({ name: "gameStart" }, {}, p);

(async function main() {
	console.log("== B. 判定矩阵 ==");
	/* 前提：本项**默认关闭**（2026-10-18 作者定案），所以判定矩阵要先显式打开，
	   否则所有"该出手"的用例都会被 ext-config-off 挡掉。开关本身的用例在 B3 单独测。 */
	lib.config["extension_池子魔将_csh_kami_group"] = true;
	MODE = "doudizhu";
	ck("斗地主 · 神赵云（数组形态）→ 出手", F(mk("shen_zhaoyun")) === true, kamiStatus().lastWhy);
	ck("斗地主 · 扩展神将（对象形态）→ 出手", F(mk("csh_shencaozhi")) === true, kamiStatus().lastWhy);
	MODE = "versus";
	ck("对决 · 神赵云 → 出手", F(mk("shen_zhaoyun")) === true);
	MODE = "identity";
	ck("身份场 · 未选过 → 兜底出手", F(mk("shen_zhaoyun")) === true);
	ck("身份场 · 已选过 → 静默", F(mk("shen_zhaoyun", { chosen: "shen" })) === false && kamiStatus().lastWhy.reason === "already-chosen");
	MODE = "guozhan";
	ck("国战 → 排除", F(mk("shen_zhaoyun")) === false && kamiStatus().lastWhy.reason === "guozhan");
	MODE = "doudizhu";
	ck("devil 小怪 → 不碰（BOSS 模式安全）", F(mk("csh_boss_minion_temari")) === false && kamiStatus().lastWhy.reason === "group-not-shen:devil", kamiStatus().lastWhy);
	ck("devil 魔王（数组）→ 不碰", F(mk("csh_boss_king")) === false);
	ck("普通蜀将 → 不碰", F(mk("re_liubei")) === false && kamiStatus().lastWhy.reason === "group-not-shen:shu");
	ck("已有 doubleGroup → 让给引擎", F(mk("shen_owned")) === false && kamiStatus().lastWhy.reason === "is-double-group");
	ck("隐藏技能 → 不碰", F(mk("shen_hidden")) === false && kamiStatus().lastWhy.reason === "hidden-skill");
	ck("普通势力 + initGroup（文鸯）→ 不碰", F(mk("wenyang")) === false && kamiStatus().lastWhy.reason === "group-not-shen:wei");
	ck("神 + initGroup → 让给引擎 _doublegroup_choice", F(mk("shen_double")) === false && kamiStatus().lastWhy.reason === "has-initgroup", kamiStatus().lastWhy);

	console.log("== B2. choose_group 开关（含老存档缺键）==");
	{
		const orig = get.config;
		get.config = () => undefined;
		ck("缺键（老存档）→ 仍出手（按引擎默认「开」）", F(mk("shen_zhaoyun")) === true, kamiStatus().lastWhy);
		get.config = (k) => (k === "choose_group" ? false : undefined);
		ck("显式 false → 静默", F(mk("shen_zhaoyun")) === false && kamiStatus().lastWhy.reason === "config-off");
		get.config = orig;
		ck("显式 true → 出手", F(mk("shen_zhaoyun")) === true);
	}

	console.log("== B3. 扩展开关（设置页「神将选势力」· 默认关闭）==");
	{
		delete lib.config["extension_池子魔将_csh_kami_group"];
		ck("缺键（老存档 / 刚装）→ **关**（默认关闭，不是「缺键按开」）",
			F(mk("shen_zhaoyun")) === false && kamiStatus().lastWhy.reason === "ext-config-off", kamiStatus().lastWhy);
		ck("status.enabled 同步为 false", kamiStatus().enabled === false);
		lib.config["extension_池子魔将_csh_kami_group"] = false;
		ck("显式 false → 关（连角色都不查）", F(mk("shen_zhaoyun")) === false && kamiStatus().lastWhy.reason === "ext-config-off");
		lib.config["extension_池子魔将_csh_kami_group"] = true;
		ck("显式 true → 出手", F(mk("shen_zhaoyun")) === true);
	}

	console.log("== B4. 让位守卫（别的扩展先改过势力就放弃）==");
	{
		ck("player.group 已被改成 wei → 让位", F(mk("shen_zhaoyun", { playerGroup: "wei" })) === false
			&& kamiStatus().lastWhy.reason === "player-group-changed:wei", kamiStatus().lastWhy);
		ck("player.group 仍是 shen → 正常出手", F(mk("shen_zhaoyun", { playerGroup: "shen" })) === true);
		ck("player.group 为空（未 init）→ 不因此拒绝", F(mk("shen_zhaoyun", { playerGroup: "" })) === true);
		/* 关键：devil/shu 的拒绝原因不能被让位守卫抢走（顺序问题） */
		ck("devil 仍报 group-not-shen（不是 player-group-changed）",
			F(mk("csh_boss_minion_temari")) === false && kamiStatus().lastWhy.reason === "group-not-shen:devil");
		ck("普通蜀将仍报 group-not-shen:shu",
			F(mk("re_liubei")) === false && kamiStatus().lastWhy.reason === "group-not-shen:shu");
	}

	console.log("== C. content 执行 ==");
	{
		const p = mk("shen_zhaoyun", { pick: "wu" });
		await C(p);
		ck("弹了一次", p.asked === 1);
		ck("文案「请选择你的势力」", p.dialog && p.dialog[0] === "请选择你的势力");
		const btns = p.dialog && p.dialog[1] && p.dialog[1][0];
		ck("vcard 三元组 + group_ 前缀", Array.isArray(btns) && btns[0].length === 3 && String(btns[0][2]).indexOf("group_") === 0);
		ck("候选不含 shen/devil", !btns.some((b) => /group_(shen|devil)$/.test(b[2])), btns.map((b) => b[2]));
		ck("changeGroup 落地 wu 且不打日志", p.changed && p.changed.group === "wu" && p.changed.log === false);
		ck("_groupChosen = shen（防重入）", p._groupChosen === "shen");
	}
	{
		const p = mk("shen_zhaoyun");
		p.chooseButton = () => ({ set() { return this; }, forResult() { return Promise.resolve({ bool: false }); } });
		let err = null;
		try { await C(p); } catch (e) { err = e; }
		ck("取消选择不抛错、不改势力", err === null && !p.changed, p.changed);
	}
	{
		const p = mk("shen_zhaoyun");
		p.chooseButton = () => { throw new Error("boom"); };
		let err = null;
		try { await C(p); } catch (e) { err = e; }
		ck("chooseButton 抛错被吞（不阻断开局）", err === null);
	}

	console.log("== D. 异步生命周期与兼容接管 ==");
	{
		const p = mk("shen_zhaoyun", { playerGroup: "wei" });
		await C(p);
		ck("content 入口重查：其他扩展已接管就不再弹", !p.asked && !p.changed);
	}
	{
		const p = mk("shen_zhaoyun");
		p.chooseButton = () => { throw new Error("fixture error"); };
		await C(p);
		ck("选择抛错留下可诊断的原因", kamiStatus().lastWhy && /choice-error/.test(kamiStatus().lastWhy.reason));
		ck("选择抛错释放已选标记，允许重新触发", !p._groupChosen && F(p));
	}
	{
		const p = mk("shen_zhaoyun");
		p.chooseButton = () => ({ set(){return this;}, forResult:async()=>({bool:false}) });
		await C(p);ck("取消选择释放标记", !p._groupChosen);
	}
	{
		const p = mk("shen_zhaoyun", {pick:"not_registered"});await C(p);
		ck("拒绝不在候选列表中的返回势力", !p.changed && !p._groupChosen);
	}
	{
		const p = mk("shen_zhaoyun");p.changeGroup = async()=>{throw new Error("change fixture");};await C(p);
		ck("changeGroup 失败释放标记", !p._groupChosen);
	}
	for (const type of ["external-group", "extension-off", "engine-off", "mode-change", "character-change", "external-marker"]) {
		const p=mk("shen_zhaoyun");let resolve;
		const promise=new Promise(r=>{resolve=r;});
		p.chooseButton=()=>{p.asked=(p.asked||0)+1;return{set(){return this;},forResult(){return promise;}};};
		const pending=C(p);
		if(type==="external-group")p.group="wei";
		if(type==="extension-off")lib.config["extension_池子魔将_csh_kami_group"]=false;
		if(type==="engine-off")CONFIG.choose_group=false;
		if(type==="mode-change")MODE="guozhan";
		if(type==="character-change")p.name1=p.name="re_liubei";
		if(type==="external-marker")p._groupChosen="double";
		resolve({bool:true,links:[["","","group_wu"]]});await pending;
		ck("等待中状态改变后丢弃旧选择: "+type,!p.changed);
		ck("等待中取消只释放自己的标记: "+type,type==="external-marker"?p._groupChosen==="double":!p._groupChosen);
		lib.config["extension_池子魔将_csh_kami_group"]=true;CONFIG.choose_group=true;MODE="doudizhu";
	}
	{
		const p=mk("shen_zhaoyun");let resolve;
		const promise=new Promise(r=>{resolve=r;});
		p.chooseButton=()=>{p.asked=(p.asked||0)+1;return{set(){return this;},forResult(){return promise;}};};
		const first=C(p),second=C(p);resolve({bool:true,links:[["","","group_shu"]]});await Promise.all([first,second]);
		ck("异步重入只打开一次选择框",p.asked===1);
	}
	console.log("");
	console.log("----------------------------------------");
	if (failCnt) { console.log("结论：未通过，" + failCnt + " 项失败：" + fails.join(" / ")); process.exit(1); }
	console.log("结论：通过（" + pass + " 项断言）。");
	process.exit(0);
})();
