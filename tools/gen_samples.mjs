#!/usr/bin/env node
/* 一次性工具：生成「除客皆刀」标题样板页 + winrate 表格复刻探针页（用于本地无头截图验证）。用后可删。 */
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ---------- 1. 标题样板 ---------- */
const titles = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{margin:0;background:linear-gradient(160deg,#241c12,#151009 60%,#0c0906);color:#cbbf9f;
 font-family:'Microsoft YaHei',sans-serif;padding:20px 24px;}
.cell{padding:10px 0 2px;text-align:center;}
.cap{font-size:12px;letter-spacing:2px;color:#8f8468;margin-top:4px;}
.tt{display:flex;justify-content:center;align-items:center;height:118px;}
.tt span{display:inline-block;line-height:1;}

.v1 span{font-family:'STXingkai','KaiTi',serif;font-weight:700;font-size:60px;letter-spacing:8px;
 background:linear-gradient(180deg,#fff0b8 0%,#f3c94f 44%,#cf9a22 100%);
 -webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:1.5px #171006;
 filter:drop-shadow(0 0 16px rgba(242,203,92,.55)) drop-shadow(3px 5px 0 rgba(0,0,0,.5));}
.v1 span:nth-child(1){transform:rotate(-7deg) skew(-9deg);}
.v1 span:nth-child(2){transform:rotate(5deg) skew(-12deg) translateY(-7px);}
.v1 span:nth-child(3){transform:rotate(-4deg) skew(-7deg) translateY(5px);}
.v1 span:nth-child(4){transform:rotate(8deg) skew(-13deg);}

.v2 span{font-family:'SimHei','Microsoft YaHei',sans-serif;font-weight:900;font-size:56px;letter-spacing:14px;
 color:#f7d96b;transform:skew(-10deg);
 text-shadow:3px 4px 0 #221806,0 0 18px rgba(247,217,107,.55),0 0 52px rgba(247,217,107,.28);}

.v3 span{font-family:'STXingkai','KaiTi',serif;font-style:italic;font-weight:700;
 -webkit-background-clip:text;background-clip:text;color:transparent;
 background:linear-gradient(180deg,#fffbe8,#f6d87a 55%,#dcae3c);
 -webkit-text-stroke:1px #241a08;
 filter:drop-shadow(2px 4px 0 rgba(0,0,0,.55)) drop-shadow(0 0 14px rgba(246,216,122,.5));
 transform:skew(-14deg);}
.v3 span:nth-child(1){font-size:58px;}
.v3 span:nth-child(2){font-size:50px;translate:0 -6px;}
.v3 span:nth-child(3){font-size:58px;}
.v3 span:nth-child(4){font-size:50px;translate:0 6px;}

.v4 span{font-family:'LiSu','SimLi','KaiTi',serif;font-size:64px;letter-spacing:18px;color:#e8c35a;
 -webkit-text-stroke:1px #2a1e08;
 text-shadow:2px 3px 0 rgba(0,0,0,.62),0 0 22px rgba(232,195,90,.45);}
.v4 span:nth-child(1){transform:rotate(-3deg);}
.v4 span:nth-child(2){transform:rotate(2deg) translateY(3px);}
.v4 span:nth-child(3){transform:rotate(-2deg);}
.v4 span:nth-child(4){transform:rotate(3deg) translateY(-3px);}

.v5 span{font-family:'KaiTi',serif;font-weight:700;font-size:60px;letter-spacing:4px;color:#f5dc85;
 transform:skew(-17deg);
 text-shadow:-3px 0 0 rgba(214,78,58,.8),3px 0 0 rgba(255,244,196,.65),4px 5px 0 rgba(0,0,0,.6),0 0 20px rgba(245,220,133,.5);}
.v5 span:nth-child(2){translate:0 -8px;}
.v5 span:nth-child(3){translate:0 4px;}
.v5 span:nth-child(4){translate:0 -4px;}
</style></head><body>
<div class="cell"><div class="tt v1"><span>除</span><span>客</span><span>皆</span><span>刀</span></div><div class="cap">① 狂草斜锋 · 楷体金字 · 每字独立倾角（肆意错落）</div></div>
<div class="cell"><div class="tt v2"><span>除</span><span>客</span><span>皆</span><span>刀</span></div><div class="cap">② 金铁重击 · 黑体大字距 · 硬朗斜切</div></div>
<div class="cell"><div class="tt v3"><span>除</span><span>客</span><span>皆</span><span>刀</span></div><div class="cap">③ 行楷飞扬 · 斜体大小交替（有行楷字体则更狂）</div></div>
<div class="cell"><div class="tt v4"><span>除</span><span>客</span><span>皆</span><span>刀</span></div><div class="cap">④ 隶书古傲 · 隶书特大字距 · 微旋古意</div></div>
<div class="cell"><div class="tt v5"><span>除</span><span>客</span><span>皆</span><span>刀</span></div><div class="cap">⑤ 锋刃切割 · 金红错位影 · 强斜切阶梯</div></div>
</body></html>`;
fs.writeFileSync(path.join(root, "tools", "title_samples.html"), titles, "utf8");
console.log("[gen] title_samples.html ✓");

/* ---------- 2. winrate 复刻探针 ---------- */
const wr = fs.readFileSync(path.join(root, "core", "csh_winrate.js"), "utf8");
const start = wr.indexOf("st.textContent=[");
const arrStart = wr.indexOf("[", start);
const arrEnd = wr.indexOf("].join(\"\");", arrStart);
if (arrStart < 0 || arrEnd < 0) throw new Error("winrate CSS 数组定位失败");
const arrLit = wr.slice(arrStart, arrEnd + 1);
const cssArr = new Function("return " + arrLit)();
const css = cssArr.join("");

/* ---------- 3. 扩展设置页 CSS（precontent）---------- */
const pc = fs.readFileSync(path.join(root, "main", "precontent.js"), "utf8");
const s2 = pc.indexOf(".csh-cfg-btn{");
const a2 = pc.lastIndexOf("[", s2);
const b2 = pc.indexOf("].join", a2);
const pcCss = new Function("return " + pc.slice(a2, b2 + 1))().join("\n");

const rows = [
	["荀攸", 1, 1, 0, "100.0%", "3", "1", "2", "7", "1", false],
	["十常侍", 1, 1, 0, "100.0%", "4", "1", "0", "4", "2", false],
	["奥恩", 1, 1, 0, "100.0%", "4", "1", "1", "7", "4", true],
	["方圣帝君", 1, 1, 0, "100.0%", "3", "1", "1", "9", "1", true],
	["菲比", 1, 1, 0, "100.0%", "4", "1", "1", "16", "5", true],
	["花鬘", 1, 1, 0, "100.0%", "5", "1", "2", "18", "8", true],
	["界曹丕", 1, 1, 0, "100.0%", "3", "1", "3", "24", "7", false],
	["卡尔", 7, 6, 1, "85.7%", "4.29", "0.86", "1.71", "12.43", "4.43", true],
	["曹魏", 2, 0, 2, "0.0%", "1.5", "0", "3", "8.5", "7", true],
	["势杨弘", 1, 0, 1, "0.0%", "0", "0", "4", "0", "0", false],
];
function table(hoverRow) {
	const badge = (i) => {
		const cls = i === 0 ? "r1" : i === 1 ? "r2" : i === 2 ? "r3" : "";
		return `<span class="csh-wr-rank ${cls}">${i + 1}</span>`;
	};
	const bar = (r) => `<div class="rate"><span class="csh-wr-bar"><i class="mid" style="width:${r}"></i></span><span class="csh-wr-pct mid">${r}</span></div>`;
	let h = '<table id="csh-wr-table"><thead><tr>';
	h += '<th class="nosort">#</th><th>武将</th><th>场次</th><th>胜</th><th>负</th><th class="on">胜率 ▼</th><th>均伤</th><th>均杀</th><th>均受</th><th>均摸</th><th>均弃</th><th class="nosort"></th></tr></thead><tbody>';
	rows.forEach((r, i) => {
		const ext = r[10];
		const hov = hoverRow === r[0] ? ' class="myext hoverrow"' : (ext ? ' class="myext"' : "");
		h += `<tr${hov}>`;
		h += `<td>${badge(i)}</td><td class="wname${ext ? " ext" : ""}">${r[0]}${ext ? " ★" : ""}</td>`;
		h += `<td>${r[1]}</td><td class="win">${r[2]}</td><td class="lose">${r[3]}</td><td>${bar(r[4])}</td>`;
		h += `<td>${r[5]}</td><td>${r[6]}</td><td>${r[7]}</td><td>${r[8]}</td><td>${r[9]}</td>`;
		h += `<td><button class="csh-wr-del">×</button></td></tr>`;
	});
	h += "</tbody></table>";
	return h;
}
const probe = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0;background:#0d0a07;padding:16px;font-family:'Microsoft YaHei',sans-serif;}
#csh-wr-panel{max-height:none!important;overflow:visible!important;width:1060px!important;}
.probe-cap{color:#9d947e;font:12px 'Microsoft YaHei';letter-spacing:2px;margin:10px 2px 6px;}
/* 设置页模拟（近似引擎 .config 行外观） */
.mock-set{width:340px;background:#1c1915;border:1px solid #3a342a;border-radius:10px;padding:2px 14px 14px;}
.mock-set .config{padding:11px 4px;color:#e8e0cf;font-size:13px;border-bottom:1px solid rgba(255,255,255,.05);}
</style>
<style>${css}</style>
<style>${pcCss}</style>
<style>
/* hover 模拟：与桌面真实 :hover 完全同款选择器与数值 */
#csh-wr-panel tbody tr.hoverrow td{background:rgba(216,180,106,.055)!important;}
</style></head><body>
<div class="probe-cap">A · 静态（无悬停）</div>
<div id="csh-wr-panel">${table(null)}</div>
<div class="probe-cap">B · 卡尔行悬停模拟（鼠标停在卡尔行时的真实观感）</div>
<div id="csh-wr-panel">${table("卡尔")}</div>
<div class="probe-cap">C · 扩展设置页模拟（谨慎操作 / 其他扩展 / 删除此扩展）</div>
<div class="mock-set">
<div class="config"><span>启用池子调试（悬浮球）</span></div>
<div class="config"><span>联机手气卡　　　3次</span></div>
<div class="config"><span><span class="csh-cfg-sep">—— ⚠ 谨慎操作 ——</span></span></div>
<div class="config"><span><span class="csh-cfg-btn">其他扩展</span></span></div>
<div class="config"><span>删除此扩展</span></div>
</div>
</body></html>`;
fs.writeFileSync(path.join(root, "tools", "wr_probe.html"), probe, "utf8");
console.log("[gen] wr_probe.html ✓");
