/* Offline Texas policy. Observation contains own cards and public facts only; no table/deck reference. */
(function (root) {
  'use strict';
  var styles = {
    tag: { edge: .055, valueOpen: .59, open: .57, bluff: .045, size: .66 },
    loose: { edge: -.015, valueOpen: .65, open: .40, bluff: .025, size: .45 },
    bluff: { edge: .025, valueOpen: .56, open: .47, bluff: .13, size: .75 }
  };
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function decide(o, random) {
    random = random || Math.random;
    var style = styles[o.persona] || styles.tag;
    var world = o.worldState || {};
    var skill = clamp((Number(o.skill) || .75) - clamp(Number(world.fatigue) || 0, 0, 1) * .08
      + clamp(Number(world.mood) || 0, -1, 1) * .025 + (clamp(world.form == null ? .5 : Number(world.form), 0, 1) - .5) * .04, .35, 1);
    var eq = clamp(o.equity + (random() * 2 - 1) * (1 - skill) * .22, .01, .99);
    var call = Math.min(o.toCall, o.chips);
    var odds = call > 0 ? call / (o.contestablePot + call) : 0;
    var pressure = call / Math.max(o.bb, o.contestablePot);
    var edge = style.edge + (o.board.length ? .025 : .045) + Math.min(.09, pressure * .05);
    var tendency = o.aggressorStats;
    if (tendency && tendency.hands >= 12 && call > 0) {
      if (tendency.vpip / tendency.hands < .25 && tendency.raises / tendency.hands < .2) edge += .035;
      if (tendency.vpip / tendency.hands > .7) edge -= .025;
    }
    var reason, bluff = false, act, amount;
    var pre = o.board.length === 0;
    var opening = o.currentBet <= o.bb;
    var value = pre ? o.strength >= (opening ? style.valueOpen - (o.latePosition ? .025 : 0) : .72 + Math.min(.10, pressure * .10)) : eq >= Math.min(.79, 1 / (o.opponents + 1) + .30);
    var cheap = call <= Math.max(o.bb, o.chips * .08);
    var canBluff = o.canRaise && o.opponents <= 2 && o.chips > Math.max(o.bb * 4, call * 3) && pressure < .35;
    var opportunity = (o.latePosition || o.hasDraw || o.scaryBoard) && (!pre || o.strength > .32);
    var bluffChance = style.bluff * (.65 + skill * .35);
    if (call === 0) {
      if (o.canRaise && (value || (pre && o.latePosition && o.strength > style.open + .08 && random() < .40))) { act = 'raise'; reason = '价值下注'; }
      else if (canBluff && opportunity && random() < bluffChance) { act = 'raise'; reason = o.hasDraw ? '听牌半诈唬' : '位置施压'; bluff = true; }
      else { act = 'check'; reason = '免费观察'; }
    } else if (o.canRaise && value && random() < (.45 + skill * .25)) { act = 'raise'; reason = '强牌加注'; }
    else if (eq >= odds + edge || (cheap && pre && o.strength > style.open + (o.latePosition ? -.04 : .04))) { act = 'call'; reason = '赔率允许跟注'; }
    else if (canBluff && opportunity && random() < bluffChance * .45) { act = 'raise'; reason = '有限反击'; bluff = true; }
    else { act = 'fold'; reason = '投入超过估计收益'; }
    if (act === 'raise') {
      var fraction = style.size + (random() - .5) * .2;
      amount = Math.min(o.maxTo, Math.max(o.minTo, o.currentBet + Math.round((o.pot + call) * fraction)));
    }
    return { act: act, amount: amount, reason: reason, bluff: bluff,
      features: { estimatedEquity: eq, potOdds: odds, callCost: call, contestablePot: o.contestablePot, opponents: o.opponents, skill: skill } };
  }
  root.CSHTexasAI = { decide: decide, version: 1 };
})(typeof window !== 'undefined' ? window : this);
