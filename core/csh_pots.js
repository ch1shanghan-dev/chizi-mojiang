/* ============================================================================
   池子魔将 · 德州扑克结算账本（csh_pots.js）
   ----------------------------------------------------------------------------
   依据：《德州扑克结算逻辑与结算 UI 重构方案 v1.0》

   这个文件存在的唯一理由：**结算金额只能有一个实现**（方案 §3）。
   此前德州把「牌力评估」与「底池分配」写在游戏页里，界面又各自从 awardPots 的
   返回值拼文案 —— 于是同一局在不同地方被"解释"了两次，玩家看到的是
   「你赢下底池 / 郭淮 赢 200 / 郭淮 赢 1320 / 郭淮 赢 1440 / 你 赢 1950」
   这种把「底池归属」和「本手净收益」混在一起的清单（方案 §1.B、§10）。
   现在：settle() 输出唯一账本，界面**只读**它，不再自己算一分钱。

   账本结构（方案 §3 / §9）：
     {
       pots: [ { id, amount, eligible:[id], winners:[id], payouts:{id:amt} } ],
       payouts: { id: 总获得 },
       ledger: [ { id, name, startStack, committed, won, net, endStack } ],
       startSum, endSum, conservation: 'PASS'|'FAIL', ok
     }

   算法要点（方案 §4/§5/§6/§7）：
     · 底池按「贡献分层」构造：把各家的本手总投入排序去重得到层级，
       每层金额 = Σ min(contrib_i, L) − Σ min(contrib_i, 上一层)。
     · eligible = 达到该层贡献额度**且未弃牌**的玩家（弃牌者的钱留在池里，
       但永远不能成为该池赢家）。
     · **每个底池独立比较牌力** —— 不存在"整手牌一个赢家通吃所有池"。
     · 平分余数：按「庄家左手位起的座位顺序」依次发 1 枚，**不用随机数**，
       同一局重算结果必须一致。

   零依赖、双载（与 core/csh_page.js 同款）：游戏页用 <script src> 引入，
   也测试页直接引入做 6 个场景 + 随机守恒回归。
   ============================================================================ */
(function (root) {
	if (!root) return;
	if (root.CSHPots) return;                 /* 幂等 */

	/* ============================================================
	   1. 牌型评估（7 选 5，C(7,5)=21）
	   等级 0..9：高牌<一对<两对<三条<顺子<同花<葫芦<四条<同花顺<皇家同花顺
	   score = rank * 1e10 + 踢脚加权 —— 直接比大小即可。
	   这份实现从 games/texas/texas.html 原样搬入：现在它是**唯一实现**，
	   德州页的 heBest7/heNameOf 全部委托到这里，避免两份评估器给出不同答案。
	   ============================================================ */
	var RANK_LABEL = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
	var HE_RANK_NAME = ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺', '皇家同花顺'];
	var HE_RC = new Int32Array(15);
	var HE_RS = new Int32Array(5);
	var HE_K = new Int32Array(3);

	function heEval5(c0, c1, c2, c3, c4) {
		var i;
		for (i = 2; i <= 14; i++) HE_RC[i] = 0;
		HE_RC[c0 >> 2]++; HE_RC[c1 >> 2]++; HE_RC[c2 >> 2]++; HE_RC[c3 >> 2]++; HE_RC[c4 >> 2]++;
		var su = c0 & 3;
		var flush = ((c1 & 3) === su) && ((c2 & 3) === su) && ((c3 & 3) === su) && ((c4 & 3) === su);
		var n = 0, r;
		for (r = 14; r >= 2; r--) if (HE_RC[r]) HE_RS[n++] = r;
		var straight = false, sHigh = 0;
		if (n === 5) {
			if (HE_RS[0] - HE_RS[4] === 4) { straight = true; sHigh = HE_RS[0]; }
			else if (HE_RS[0] === 14 && HE_RS[1] === 5) { straight = true; sHigh = 5; }   /* A2345 轮子 */
		}
		if (straight && flush) return (sHigh === 14 ? 9 : 8) * 1e10 + sHigh * 38416;
		if (flush) return 5e10 + HE_RS[0] * 38416 + HE_RS[1] * 2744 + HE_RS[2] * 196 + HE_RS[3] * 14 + HE_RS[4];
		if (straight) return 4e10 + sHigh * 38416;
		var maxN = 0;
		for (i = 0; i < n; i++) if (HE_RC[HE_RS[i]] > maxN) maxN = HE_RC[HE_RS[i]];
		if (maxN === 4) {
			var q = 0, kk = 0;
			for (i = 0; i < n; i++) { if (HE_RC[HE_RS[i]] === 4) q = HE_RS[i]; else kk = HE_RS[i]; }
			return 7e10 + q * 38416 + kk * 2744;
		}
		if (maxN === 3) {
			var t3 = 0, p3 = 0, kn = 0;
			for (i = 0; i < n; i++) {
				if (HE_RC[HE_RS[i]] === 3) t3 = HE_RS[i];
				else if (HE_RC[HE_RS[i]] === 2) p3 = HE_RS[i];
				else HE_K[kn++] = HE_RS[i];
			}
			if (p3) return 6e10 + t3 * 38416 + p3 * 2744;
			return 3e10 + t3 * 38416 + HE_K[0] * 2744 + HE_K[1] * 196;
		}
		if (maxN === 2) {
			var p1 = 0, p2 = 0, k2 = 0;
			for (i = 0; i < n; i++) {
				if (HE_RC[HE_RS[i]] === 2) { if (!p1) p1 = HE_RS[i]; else p2 = HE_RS[i]; }
				else HE_K[k2++] = HE_RS[i];
			}
			if (p2) return 2e10 + p1 * 38416 + p2 * 2744 + HE_K[0] * 196;
			return 1e10 + p1 * 38416 + HE_K[0] * 2744 + HE_K[1] * 196 + HE_K[2] * 14;
		}
		return HE_RS[0] * 38416 + HE_RS[1] * 2744 + HE_RS[2] * 196 + HE_RS[3] * 14 + HE_RS[4];
	}
	function heCombos(n, k) {
		var out = [], cur = [];
		(function rec(start) {
			if (cur.length === k) { out.push(cur.slice()); return; }
			for (var i = start; i < n; i++) { cur.push(i); rec(i + 1); cur.pop(); }
		})(0);
		return out;
	}
	var COMBOS5OF7 = heCombos(7, 5);            /* 常量表，避免每次重算 */
	function heBest7(cards) {
		var best = 0;
		for (var i = 0; i < COMBOS5OF7.length; i++) {
			var c = COMBOS5OF7[i];
			var s = heEval5(cards[c[0]], cards[c[1]], cards[c[2]], cards[c[3]], cards[c[4]]);
			if (s > best) best = s;
		}
		return best;
	}
	function heRankOf(score) { return Math.floor(score / 1e10); }
	function heNameOf(score) { return HE_RANK_NAME[heRankOf(score)] || '高牌'; }

	/* ============================================================
	   2. 结算（方案 §3：唯一入口）
	   ------------------------------------------------------------
	   hand = {
	     players: [{ id, name, contrib, folded, out, hole:[c,c] }],
	     community: [c,c,c,c,c],
	     stacks:    { id: 本手开始时的筹码 }   ← 由调用方提供，本模块不猜
	     dealerId:  庄家座位 id（决定平分余数的发放顺序）
	   }
	   ============================================================ */
	function orderFromDealerLeft(ids, dealerId, allIds) {
		/* 方案 §7：余数从庄家左手位开始依次分配，顺序稳定可复现，不用随机数。 */
		var n = allIds.length;
		var pos = {};
		for (var i = 0; i < n; i++) pos[allIds[i]] = i;
		var d = (pos[dealerId] == null) ? -1 : pos[dealerId];
		return ids.slice().sort(function (a, b) {
			var da = (pos[a] - d - 1 + n * 2) % n;
			var db = (pos[b] - d - 1 + n * 2) % n;
			return da - db;
		});
	}

	function settle(hand) {
		hand = hand || {};
		var players = Array.isArray(hand.players) ? hand.players : [];
		var community = hand.community || [];
		var stacks = hand.stacks || {};
		var dealerId = hand.dealerId;
		var ids = [];
		var i, j;
		for (i = 0; i < players.length; i++) ids.push(players[i].id);

		var payouts = {};
		for (i = 0; i < players.length; i++) payouts[players[i].id] = 0;

		/* 2.1 只有未弃牌且未出局的玩家能争池；其余人的钱照样留在池里（§5） */
		var live = [];
		for (i = 0; i < players.length; i++) {
			var p = players[i];
			if (p.out || p.folded) continue;
			live.push({
				id: p.id, name: p.name, contrib: Math.max(0, Math.floor(p.contrib || 0)),
				score: (p.hole && p.hole.length === 2 && community.length >= 5)
					? heBest7(p.hole.concat(community)) : 0,
			});
		}

		var pots = [];
		var totalPot = 0;
		for (i = 0; i < players.length; i++) totalPot += Math.max(0, Math.floor(players[i].contrib || 0));

		if (live.length <= 0) {
			/* 全部出局/弃牌而池里有钱：不猜归属，如实标记为未分配，交给上层的兜底逻辑处理 */
			return finish(hand, players, stacks, pots, payouts, totalPot, false);
		}

		if (live.length === 1) {
			/* 只剩一人：全部底池归他（含其他人弃掉的筹码），单池单赢家 */
			var w0 = live[0];
			payouts[w0.id] += totalPot;
			pots.push({
				id: 'main', amount: totalPot, eligible: live.map(function (x) { return x.id; }),
				winners: [w0.id], byFold: true,
				payouts: (function () { var o = {}; o[w0.id] = totalPot; return o; })(),
			});
			return finish(hand, players, stacks, pots, payouts, totalPot, true);
		}

		/* 2.2 贡献分层（§4）：层级 = 各家本手投入的去重升序 */
		var levels = [];
		for (i = 0; i < players.length; i++) {
			var c = Math.max(0, Math.floor(players[i].contrib || 0));
			if (c > 0 && levels.indexOf(c) < 0) levels.push(c);
		}
		levels.sort(function (a, b) { return a - b; });

		var prev = 0, sideNo = 0;
		for (var li = 0; li < levels.length; li++) {
			var L = levels[li], amount = 0;
			for (i = 0; i < players.length; i++) {
				var ci = Math.max(0, Math.floor(players[i].contrib || 0));
				amount += Math.max(0, Math.min(ci, L) - prev);
			}
			if (amount > 0) {
				/* eligible = 达到该层额度且未弃牌（§5/§6） */
				var elig = [];
				for (i = 0; i < live.length; i++) if (live[i].contrib >= L) elig.push(live[i]);
				if (elig.length) {
					var best = -Infinity;
					for (i = 0; i < elig.length; i++) if (elig[i].score > best) best = elig[i].score;
					var ws = [];
					for (i = 0; i < elig.length; i++) if (elig[i].score === best) ws.push(elig[i]);
					var share = Math.floor(amount / ws.length);
					var rem = amount - share * ws.length;
					var ordered = orderFromDealerLeft(ws.map(function (x) { return x.id; }), dealerId, ids);
					var pay = {};
					for (i = 0; i < ordered.length; i++) {
						var got = share + (i < rem ? 1 : 0);
						payouts[ordered[i]] += got;
						pay[ordered[i]] = got;
					}
					pots.push({
						id: sideNo === 0 ? 'main' : ('side' + sideNo),
						amount: amount, eligible: elig.map(function (x) { return x.id; }),
						winners: ordered, score: best, payouts: pay,
					});
					sideNo++;
				} else {
					/* 该层无人有资格（正常牌局不会出现）：退回该层投入最多者，
					   保证筹码不凭空消失；标记 refund 让界面如实呈现。 */
					var back = null;
					for (i = 0; i < players.length; i++) {
						var bp = players[i], bpc = Math.max(0, Math.floor(bp.contrib || 0));
						if (bpc >= L && (!back || bpc > Math.max(0, Math.floor(back.contrib || 0)))) back = bp;
					}
					if (back) {
						payouts[back.id] += amount;
						var pr = {}; pr[back.id] = amount;
						pots.push({ id: 'refund' + li, amount: amount, eligible: [back.id], winners: [back.id], refund: true, payouts: pr });
					}
				}
			}
			prev = L;
		}
		return finish(hand, players, stacks, pots, payouts, totalPot, true);
	}

	/* 2.3 玩家账本 + 守恒校验（§8 / §9）
	   net = 从底池获得 − 本手投入
	   end = 本手开始筹码 + net
	   本游戏结算层无抽水（台费由钱包侧按回收率另计），故守恒要求严格相等。 */
	function finish(hand, players, stacks, pots, payouts, totalPot, settled) {
		var ledger = [], startSum = 0, endSum = 0, i;
		for (i = 0; i < players.length; i++) {
			var p = players[i];
			var st = (typeof stacks[p.id] === 'number') ? stacks[p.id] : null;
			var committed = Math.max(0, Math.floor(p.contrib || 0));
			var won = payouts[p.id] || 0;
			var net = won - committed;
			var end = (st == null) ? null : st + net;
			if (st != null) { startSum += st; endSum += end; }
			ledger.push({
				id: p.id, name: p.name, isHuman: !!p.isHuman,
				startStack: st, committed: committed, won: won, net: net, endStack: end,
				folded: !!p.folded, out: !!p.out,
			});
		}
		var gained = 0;
		for (i = 0; i < ledger.length; i++) gained += ledger[i].won;
		/* 守恒：发放总额必须等于池内总额（守恒失败说明有筹码被凭空造出或吞掉） */
		var conserved = (gained === totalPot) && (startSum === 0 || endSum === startSum);
		return {
			pots: pots, payouts: payouts, ledger: ledger, potTotal: totalPot,
			startSum: startSum, endSum: endSum,
			conservation: conserved ? 'PASS' : 'FAIL',
			ok: !!settled && conserved,
			settled: !!settled,
		};
	}

	/* ============================================================
	   3. 调试结算日志（方案 §16）
	   ============================================================ */
	function fmtLog(r) {
		var L = [], i, j;
		L.push('[TEXAS SETTLE]');
		L.push('START STACKS');
		for (i = 0; i < r.ledger.length; i++) {
			var g = r.ledger[i];
			L.push('  ' + g.name + ': ' + (g.startStack == null ? '?' : g.startStack));
		}
		L.push('CONTRIBUTIONS');
		for (i = 0; i < r.ledger.length; i++) L.push('  ' + r.ledger[i].name + ': ' + r.ledger[i].committed);
		L.push('POTS');
		for (i = 0; i < r.pots.length; i++) {
			var p = r.pots[i];
			var nm = function (id) {
				for (var k = 0; k < r.ledger.length; k++) if (r.ledger[k].id === id) return r.ledger[k].name;
				return String(id);
			};
			L.push('  ' + p.id + ': ' + p.amount);
			L.push('    eligible: ' + p.eligible.map(nm).join(', '));
			L.push('    winner: ' + p.winners.map(nm).join(', '));
			var ps = [];
			for (var id in p.payouts) if (p.payouts.hasOwnProperty(id)) ps.push(nm(id) + ' +' + p.payouts[id]);
			L.push('    payout: ' + ps.join(' / '));
		}
		L.push('PLAYER LEDGER');
		for (i = 0; i < r.ledger.length; i++) {
			var q = r.ledger[i];
			L.push('  ' + q.name + ': start=' + (q.startStack == null ? '?' : q.startStack) +
				' commit=' + q.committed + ' won=' + q.won + ' net=' + (q.net >= 0 ? '+' : '') + q.net +
				' end=' + (q.endStack == null ? '?' : q.endStack));
		}
		L.push('CONSERVATION');
		L.push('  potTotal=' + r.potTotal + ' startSum=' + r.startSum + ' endSum=' + r.endSum);
		L.push('  status=' + r.conservation);
		return L.join('\n');
	}

	/* ============================================================
	   4. 自检（方案 §17 六个场景）
	   ============================================================ */
	function card(r, s) { return (r << 2) | s; }     /* s: 0♠ 1♥ 2♣ 3♦ */
	var C = card;

	/* 构造一副确定性的牌：用于让"谁该赢"完全可预期 */
	function handOf(rankA, suitA, rankB, suitB) { return [C(rankA, suitA), C(rankB, suitB)]; }

	function selftest() {
		var out = [], pass = 0, fail = 0;
		function chk(name, cond, detail) {
			if (cond) { pass++; out.push('PASS  ' + name); }
			else { fail++; out.push('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
		}

		/* 公共牌：A♠ K♦ 9♥ 9♦ 5♣ */
		var board = [C(14, 0), C(13, 3), C(9, 1), C(9, 3), C(5, 2)];

		/* Case 1 普通单池：三家投入相同、无人弃牌 → 牌力最高者赢全部
		   丁真 K♠K♣ = KKK99 葫芦；你 A♥Q♣ = AA99 两对；胡车儿 T♦9♣ = 999 三条 */
		var r1 = settle({
			players: [
				{ id: 0, name: '你', contrib: 2000, folded: false, out: false, hole: handOf(14, 1, 12, 2) },
				{ id: 1, name: '丁真', contrib: 2000, folded: false, out: false, hole: handOf(13, 0, 13, 2) },
				{ id: 2, name: '胡车儿', contrib: 2000, folded: false, out: false, hole: handOf(10, 3, 9, 2) },
			],
			community: board, stacks: { 0: 2000, 1: 2000, 2: 2000 }, dealerId: 0,
		});
		chk('Case1 单池·最高牌力全取', r1.pots.length === 1 && r1.pots[0].amount === 6000 && r1.pots[0].winners.length === 1 && r1.pots[0].winners[0] === 1,
			JSON.stringify(r1.pots.map(function (p) { return [p.id, p.amount, p.winners]; })));
		chk('Case1 守恒', r1.conservation === 'PASS', r1.conservation);

		/* Case 2 两级边池：A 全下 500、B/C 各 2000 → 主池 1500 三家争，边池 3000 B/C 争 */
		var r2 = settle({
			players: [
				{ id: 0, name: 'A', contrib: 500, folded: false, out: false, hole: handOf(14, 1, 14, 2) },   /* AAA99 葫芦 */
				{ id: 1, name: 'B', contrib: 2000, folded: false, out: false, hole: handOf(13, 0, 13, 2) }, /* KKK99 葫芦 */
				{ id: 2, name: 'C', contrib: 2000, folded: false, out: false, hole: handOf(10, 3, 9, 2) },
			],
			community: board, stacks: { 0: 500, 1: 2000, 2: 2000 }, dealerId: 0,
		});
		var main2 = null, side2 = null, i;
		for (i = 0; i < r2.pots.length; i++) { if (r2.pots[i].id === 'main') main2 = r2.pots[i]; else side2 = r2.pots[i]; }
		chk('Case2 主池 1500（三家都可争）', !!main2 && main2.amount === 1500 && main2.eligible.length === 3, main2 && String(main2.amount));
		chk('Case2 边池 3000（只有 B/C 可争）', !!side2 && side2.amount === 3000 && side2.eligible.length === 2 && side2.eligible.indexOf(0) < 0,
			side2 && JSON.stringify(side2.eligible));
		chk('Case2 A 只能拿主池（A 的葫芦最大）', r2.payouts[0] === 1500, String(r2.payouts[0]));
		chk('Case2 B 拿边池', r2.payouts[1] === 3000, String(r2.payouts[1]));
		chk('Case2 守恒', r2.conservation === 'PASS', r2.conservation);

		/* Case 3 弃牌玩家：投入 1000 后弃牌，钱留在池里但永远不能赢 */
		var r3 = settle({
			players: [
				{ id: 0, name: 'A弃牌', contrib: 1000, folded: true, out: false, hole: handOf(14, 1, 14, 2) },
				{ id: 1, name: 'B', contrib: 1000, folded: false, out: false, hole: handOf(13, 0, 13, 2) },
				{ id: 2, name: 'C', contrib: 500, folded: false, out: false, hole: handOf(10, 3, 9, 2) },
			],
			community: board, stacks: { 0: 2000, 1: 2000, 2: 2000 }, dealerId: 0,
		});
		chk('Case3 弃牌者零获得', r3.payouts[0] === 0, String(r3.payouts[0]));
		chk('Case3 弃牌者的钱仍进池', r3.potTotal === 2500, String(r3.potTotal));
		chk('Case3 无人可争的层不回给弃牌者', (function () {
			for (var k = 0; k < r3.pots.length; k++) if (r3.pots[k].refund && r3.pots[k].winners[0] === 0) return false;
			return true;
		})());
		chk('Case3 守恒', r3.conservation === 'PASS', r3.conservation);

		/* Case 4 多人平局：两人牌力完全相同 → 平分底池
		   公共牌 2♠3♦4♥5♣7♦，你 A♠8♥ 与 丁真 A♥8♣ 都是 A 高（踢脚同为 8/7/5），
		   胡车儿 K♠Q♥ 只是 K 高 → 主池由你与丁真平分 */
		var flat = [C(2, 0), C(3, 3), C(4, 1), C(5, 2), C(7, 3)];
		var r4 = settle({
			players: [
				{ id: 0, name: '你', contrib: 1000, folded: false, out: false, hole: handOf(14, 0, 8, 1) },
				{ id: 1, name: '丁真', contrib: 1000, folded: false, out: false, hole: handOf(14, 1, 8, 2) },
				{ id: 2, name: '胡车儿', contrib: 1001, folded: false, out: false, hole: handOf(13, 2, 12, 1) },
			],
			community: flat, stacks: { 0: 1000, 1: 1000, 2: 1001 }, dealerId: 0,
		});
		chk('Case4 平局平分主池', r4.payouts[0] === 1500 && r4.payouts[1] === 1500 && r4.payouts[2] === 1,
			JSON.stringify(r4.payouts));
		chk('Case4 守恒', r4.conservation === 'PASS', r4.conservation);

		/* Case 4b 余数必须按「庄家左手位」发放且可复现（方案 §7：不许用随机数）
		   四家各投 250（池 1000），其中三家牌力完全相同争这个池 → 1000/3 = 333 余 1。
		   庄家 id=3 时左手位依次是 0,1,2 → 多出的 1 枚给 id 0；
		   庄家换成 id=1 时左手位依次是 2,3(不在赢家内),0,1 → 多出的 1 枚给 id 2。 */
		var tie4 = [
			{ id: 0, name: 'A', contrib: 250, folded: false, out: false, hole: handOf(14, 0, 8, 1) },
			{ id: 1, name: 'B', contrib: 250, folded: false, out: false, hole: handOf(14, 1, 8, 2) },
			{ id: 2, name: 'C', contrib: 250, folded: false, out: false, hole: handOf(14, 2, 8, 3) },
			{ id: 3, name: 'D', contrib: 250, folded: false, out: false, hole: handOf(13, 0, 12, 1) },
		];
		var ra = settle({ players: tie4, community: flat, stacks: { 0: 250, 1: 250, 2: 250, 3: 250 }, dealerId: 3 });
		var rb = settle({ players: tie4, community: flat, stacks: { 0: 250, 1: 250, 2: 250, 3: 250 }, dealerId: 1 });
		chk('Case4b 余数按庄家左手位（庄=3 → 给 id0）', ra.payouts[0] === 334 && ra.payouts[1] === 333 && ra.payouts[2] === 333 && ra.payouts[3] === 0,
			JSON.stringify(ra.payouts));
		chk('Case4b 换庄家后余数改给 id2（顺序稳定可复现）', rb.payouts[2] === 334 && rb.payouts[0] === 333 && rb.payouts[1] === 333,
			JSON.stringify(rb.payouts));
		chk('Case4b 守恒', ra.conservation === 'PASS' && rb.conservation === 'PASS');

		/* Case 5 「赢了底池但本手亏损」（方案 §10 的核心场景）
		   你全下 2000，B/C/D 各只跟 500。
		   分层：500 层 = 500×4 = 2000（四家都可争，主池）
		         2000 层 = 1500×1（只有你，等于是你那笔没人跟的 1500 退回）
		   B 手里 9♣9♠ 配公共牌 A♠K♦9♥9♦5♣ = 四条 9，是全场最大 → B 拿走主池 2000；
		   你只拿回自己那层 1500。
		   → 你的账本：投入 2000、获得 1500、**净变化 -500**。
		   这正是玩家最容易误解的情形：明细里明明有"你赢 1500"，整手却是亏的。
		   界面必须把「底池获得」与「本手净变化」分开显示，不能用"你赢"当结论。 */
		var r5 = settle({
			players: [
				{ id: 0, name: '你', contrib: 2000, folded: false, out: false, hole: handOf(14, 1, 14, 2) },  /* AAA99 葫芦 */
				{ id: 1, name: 'B', contrib: 500, folded: false, out: false, hole: handOf(9, 2, 9, 0) },     /* 9999 四条 */
				{ id: 2, name: 'C', contrib: 500, folded: false, out: false, hole: handOf(13, 0, 13, 2) },
				{ id: 3, name: 'D', contrib: 500, folded: false, out: false, hole: handOf(10, 3, 8, 1) },
			],
			community: board, stacks: { 0: 2000, 1: 500, 2: 500, 3: 500 }, dealerId: 0,
		});
		chk('Case5 四条赢主池、你只拿回未被跟的那层', (function () {
			var mn = null, top = null;
			for (var k = 0; k < r5.pots.length; k++) {
				if (r5.pots[k].id === 'main') mn = r5.pots[k];
				else if (!top) top = r5.pots[k];
			}
			return mn && mn.amount === 2000 && mn.winners[0] === 1 &&
				top && top.amount === 1500 && top.winners[0] === 0;
		})(), JSON.stringify(r5.pots.map(function (p) { return [p.id, p.amount, p.winners, p.eligible]; })));
		var me5 = null;
		for (i = 0; i < r5.ledger.length; i++) if (r5.ledger[i].id === 0) me5 = r5.ledger[i];
		chk('Case5 账本：获得 1500 / 投入 2000 / 净 -500（两者必须分开）',
			me5 && me5.won === 1500 && me5.committed === 2000 && me5.net === -500 && me5.endStack === 1500,
			me5 && ('won=' + me5.won + ' commit=' + me5.committed + ' net=' + me5.net + ' end=' + me5.endStack));
		chk('Case5 守恒', r5.conservation === 'PASS', r5.conservation);

		/* Case 6 随机守恒回归：2000 手随机局面，逐手校验筹码守恒 */
		var bad = 0, hands = 2000;
		for (var t = 0; t < hands; t++) {
			var n = 2 + Math.floor(Math.random() * 4);            /* 2~5 人 */
			var deck = [], rr2, ss;
			for (rr2 = 2; rr2 <= 14; rr2++) for (ss = 0; ss < 4; ss++) deck.push(C(rr2, ss));
			for (i = deck.length - 1; i > 0; i--) { var jj = Math.floor(Math.random() * (i + 1)); var tt = deck[i]; deck[i] = deck[jj]; deck[jj] = tt; }
			var com = deck.slice(0, 5);
			var pls = [], stacks2 = {}, at = 5;
			for (i = 0; i < n; i++) {
				var allinAt = Math.floor(Math.random() * 4000);
				var folded = (i > 0) && Math.random() < 0.25;
				var contrib = folded ? Math.floor(Math.random() * allinAt + 1) : allinAt;
				pls.push({ id: i, name: 'P' + i, contrib: contrib, folded: folded, out: false, hole: [deck[at++], deck[at++]] });
				stacks2[i] = 4000 + Math.floor(Math.random() * 4000);
			}
			var r6 = settle({ players: pls, community: com, stacks: stacks2, dealerId: Math.floor(Math.random() * n) });
			if (r6.conservation !== 'PASS') bad++;
		}
		chk('Case6 随机 ' + hands + ' 手筹码守恒', bad === 0, bad + ' 手不守恒');

		out.push('');
		out.push('结果：' + pass + ' 通过 / ' + fail + ' 失败');
		return { pass: pass, fail: fail, lines: out, ok: fail === 0 };
	}

	root.CSHPots = {
		settle: settle,
		heBest7: heBest7,
		heEval5: heEval5,
		heRankOf: heRankOf,
		heNameOf: heNameOf,
		RANK_LABEL: RANK_LABEL,
		HE_RANK_NAME: HE_RANK_NAME,
		logLedger: fmtLog,
		selftest: selftest,
		card: card,
		_version: '2026-10-03',
	};
})(typeof window !== 'undefined' ? window : this);
