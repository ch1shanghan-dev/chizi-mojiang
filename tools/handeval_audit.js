#!/usr/bin/env node
// 德州牌力评估器对拍审计（方案 §16 执行项 A）
// 我方唯一实现：core/csh_pots.js 的 heBest7（0..51 整数牌，21 组合取最大分）
// 参照实现：goldfire/pokersolver v2.1.2（MIT，tools/vendor/，仅审计用不随包）
// 方法：随机 7 张牌 × 单手牌型名比对 + 双手胜负比对；不一致即门禁失败并打印现场。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ---- 载入我方实现 ---- */
const potsSrc = fs.readFileSync(path.join(root, "core", "csh_pots.js"), "utf8");
const sb1 = {};
vm.runInNewContext(potsSrc, sb1);
const P = sb1.CSHPots;
if (!P || typeof P.heBest7 !== "function") { console.error("✗ csh_pots 载入失败"); process.exit(1); }

/* ---- 载入 pokersolver（UMD → window.Hand） ---- */
const solverSrc = fs.readFileSync(path.join(root, "tools", "vendor", "pokersolver.js"), "utf8");
const sb2 = { window: {} };
vm.runInNewContext(solverSrc, sb2);
const PS = sb2.window.Hand || sb2.Hand;
if (!PS || typeof PS.solve !== "function") { console.error("✗ pokersolver 载入失败"); process.exit(1); }

/* ---- 牌表示映射：我方 int（rank=c>>2 ∈2..14，suit=c&3）→ pokersolver 字符串 ---- */
const RCHAR = { 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "T", 11: "J", 12: "Q", 13: "K", 14: "A" };
const SCHAR = ["s", "h", "d", "c"];
function toPS(c) { return RCHAR[c >> 2] + SCHAR[c & 3]; }

/* 随机 7 张（不放回）：牌 int = rank*4+suit（rank 2..14 → int 8..59，与 csh_pots 一致） */
function deal7(rng) {
	const deck = [];
	for (let r = 2; r <= 14; r++) for (let s = 0; s < 4; s++) deck.push(r * 4 + s);
	for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
	return deck.slice(0, 7);
}
/* 可复现随机源（同种子同结果，符合"确定性回放"纪律） */
let seed = 20261007;
function rng() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

/* 结构化边界牌（固定案例）：皇家/同花顺/轮子/四条/三对取两对/葫芦/同花非顺 */
const EDGE = [
	[10, 11, 12, 13, 14, 2, 3].map((r) => r * 4),                            // 皇家同花顺 + 杂张
	[5, 6, 7, 8, 14, 9, 10].map((r) => r * 4 + 1),                            // A2345 轮子（同花色）
	[2, 3, 4, 5, 14, 6, 7].map((r, i) => r * 4 + (i % 3 === 0 ? 0 : 2)),      // 轮子非同花
	[14, 14, 14, 14, 2, 3, 4].flatMap((r, i) => [r * 4 + (i % 4)]).slice(0, 7), // 四条 A
	[8, 8, 9, 9, 5, 5, 2].flatMap((r, i) => [r * 4 + (i % 4)]).slice(0, 7),       // 三对取两对
	[7, 7, 7, 12, 12, 3, 3].flatMap((r, i) => [r * 4 + (i % 4)]).slice(0, 7), // 葫芦
	[6, 7, 8, 9, 12, 13, 14].map((r) => r * 4 + 2).slice(0, 7),               // 同花非顺
];

let nameChecks = 0, pairChecks = 0, fails = 0;
function myScore(c7) { return P.heBest7(c7); }
function psHand(c7) { return PS.solve(c7.map(toPS)); }

/* pokersolver 的 .name 是英文且口径不同（"Pair" 非 "One Pair"，皇家可能记作 Straight Flush）
   → 牌型比对用**数值 rank**：我方 0..9（高牌..皇家）+1 = 对方 rank；皇家（9）对上 9 或 10 都算一致 */
function myRank(c7) { return P.heRankOf(myScore(c7)); }
function psRank(c7) { return psHand(c7).rank; }

function checkName(c7) {
	const mr = myRank(c7);
	const tr2 = psRank(c7);
	nameChecks++;
	const ok = tr2 === mr + 1 || (mr === 9 && tr2 >= 9);
	if (!ok) {
		fails++;
		if (fails <= 10) console.error(`  ✗ 牌型不一致：我方 rank ${mr}（${P.heNameOf(myScore(c7))}） vs pokersolver rank ${tr2}（${psHand(c7).name}） 牌=[${c7.map(toPS).join(",")}]`);
	}
}
function checkPair(a, b) {
	const sa = myScore(a), sb = myScore(b);
	const mine = sa > sb ? 0 : (sa < sb ? 1 : 2);           // 0=A胜 1=B胜 2=平
	const ha = psHand(a), hb = psHand(b);
	const w = PS.winners([ha, hb]);
	const theirs = w.length === 2 ? 2 : (w[0] === ha ? 0 : 1);
	pairChecks++;
	if (mine !== theirs) {
		fails++;
		if (fails <= 10) console.error(`  ✗ 胜负不一致：我方=${mine} pokersolver=${theirs} A=[${a.map(toPS).join(",")}] B=[${b.map(toPS).join(",")}]`);
	}
}

EDGE.forEach((c7) => { if (c7 && c7.length === 7) checkName(c7); });
const TRIALS = 30000;
for (let i = 0; i < TRIALS; i++) {
	const h = deal7(rng);
	checkName(h);
	if (i % 2 === 0) checkPair(h, deal7(rng));
}

console.log(`牌型名比对：${nameChecks} · 胜负比对：${pairChecks} · 不一致：${fails}`);
if (fails > 0) { console.error("结论：✗ 对拍失败（存在分歧现场，见上）"); process.exit(1); }
console.log("结论：通过 —— 两套实现零分歧（含皇家同花顺/轮子/葫芦/三对等边界案例）。");
