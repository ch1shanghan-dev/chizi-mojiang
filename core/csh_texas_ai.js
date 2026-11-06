/* Offline Texas policy. Observation contains own cards and public facts only; no table/deck reference. */
(function (root) {
  'use strict';
  /* 第 4 款 trapper（陷阱型）：收紧开池、放慢强牌、极少诈唬。
     注意 style.open 在 decide() 里是「入池 / 后位偷池 / 便宜跟注」的 strength 门槛，
     数值越高越紧（tag .57 / bluff .47 / loose .40），不是「开放程度」。
     设计方案初稿曾写 .34，照抄会得到最松的一款；实施期按代码语义定案为 .62。 */
  var styles = {
    tag: { edge: .055, valueOpen: .59, open: .57, bluff: .045, size: .66 },
    loose: { edge: -.015, valueOpen: .65, open: .40, bluff: .025, size: .45 },
    bluff: { edge: .025, valueOpen: .56, open: .47, bluff: .13, size: .75 },
    trapper: { edge: .075, valueOpen: .68, open: .62, bluff: .020, size: .52 }
  };
  /* 只读副本，供门禁对账参数，外部改不动决策表。 */
  function personas() {
    var out = {};
    for (var k in styles) if (Object.prototype.hasOwnProperty.call(styles, k)) {
      var row = {}, s = styles[k];
      for (var f in s) if (Object.prototype.hasOwnProperty.call(s, f)) row[f] = s[f];
      out[k] = Object.freeze(row);
    }
    return Object.freeze(out);
  }
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
    if (tendency && (tendency.samples==null?tendency.hands>=12:tendency.samples>=12&&tendency.hands>=6) && call > 0) {
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
    /* Unknown players are neutral. At most +/-60% of a small base bluff rate;
       a short run never overrides value, pot odds or legal raising rights. */
    var fieldFactor=typeof o.fieldFoldRate==='number'&&isFinite(o.fieldFoldRate)?clamp(1+(o.fieldFoldRate-.4)*1.6,.55,1.6):1;
    var bluffChance = style.bluff * (.65 + skill * .35) * fieldFactor;
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
  root.CSHTexasAI = { decide: decide, personas: personas, version: 1 };
})(typeof window !== 'undefined' ? window : this);
