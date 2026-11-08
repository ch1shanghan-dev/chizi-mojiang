/* 池子魔将 · 妖灵特色增益只读数据层（2026-11-07 · 设计方案 S1）
 *
 * 来源：docs/WORKBUDDY_DESIGN_GAMEPLAY_NUMERIC_ART_20261107.md
 *       docs/spirit-buff-draft.json（50 条数值草案，已通过自洽校验）
 *
 * 边界（改动前先读方案）：
 *   · 50 只妖灵已有的专属技能是讨伐模式里「打玩家」的敌方技能，这里是玩家侧助战效果；
 *   · 好感 B（亲近）单一档位解锁，A/S 不升级，避免 50×5 组合失衡；
 *   · magnitude=1 / perGame=1，每局最多一次，不叠、不跨局累积；
 *   · 不新增存档键、不产生 CBY、不改奖励/成就凭据、不改胜负判定、不读隐藏信息。
 *
 * 本模块是**纯只读数据 + 查询**，不写 localStorage、不挂战斗钩子。
 * 战斗接线（S2）与每局计数（运行态）另做，不要在这里加状态。
 * 用 IIFE 挂 window，零 import、零加载时序依赖，与 core/csh_texas_ai.js 同款。
 */
(function (root) {
  'use strict';
  var VERSION = 1;
  var LEVEL_ORDER = ['D', 'C', 'B', 'A', 'S'];
  var UNLOCK_LEVEL = 'B';
  var TEMPLATES = Object.freeze({
  "T1_guard_damage": {
    "name": "护主·减伤",
    "text": "本局首次受到伤害时，此伤害 -1"
  },
  "T2_draw_once": {
    "name": "助战·摸牌",
    "text": "本局首次用牌造成伤害，结算后摸 1 张牌"
  },
  "T3_hand_cap": {
    "name": "共谋·手牌",
    "text": "本局手牌上限 +1"
  },
  "T4_distance": {
    "name": "同行·距离",
    "text": "本局与其他角色的距离 -1"
  },
  "T5_response_once": {
    "name": "接应·响应",
    "text": "本局首次应对南蛮入侵、万箭齐发或决斗时，妖灵替你响应一次"
  },
  "T6_recover_once": {
    "name": "回护·回复",
    "text": "本局首次濒死时，回复 1 点体力"
  }
});
  var BUFFS = Object.freeze([
  {
    "id": "csh_boss_minion_eve",
    "name": "伊芙",
    "template": "T1_guard_damage",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "伊芙的护主·减伤：本局首次受到伤害时，此伤害 -1",
    "sourceSkill": "csh_boss_ying_hunshi"
  },
  {
    "id": "csh_boss_minion_ada",
    "name": "艾达王",
    "template": "T2_draw_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "艾达王的助战·摸牌：本局首次用牌造成伤害，结算后摸 1 张牌",
    "sourceSkill": "csh_boss_kan_guzao"
  },
  {
    "id": "csh_boss_minion_tenten",
    "name": "天天",
    "template": "T2_draw_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "天天的助战·摸牌：本局首次用牌造成伤害，结算后摸 1 张牌",
    "sourceSkill": "csh_boss_feng_fengshi"
  },
  {
    "id": "csh_boss_minion_empress",
    "name": "女帝",
    "template": "T2_draw_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "女帝的助战·摸牌：本局首次用牌造成伤害，结算后摸 1 张牌",
    "sourceSkill": "csh_boss_lang_nongchao"
  },
  {
    "id": "csh_boss_minion_triss",
    "name": "特莉丝",
    "template": "T1_guard_damage",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "特莉丝的护主·减伤：本局首次受到伤害时，此伤害 -1",
    "sourceSkill": "csh_boss_fen_yujin"
  },
  {
    "id": "csh_boss_minion_fubuki",
    "name": "吹雪",
    "template": "T5_response_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "吹雪的接应·响应：本局首次应对南蛮入侵、万箭齐发或决斗时，妖灵替你响应一次",
    "sourceSkill": "csh_boss_kui_qiansi"
  },
  {
    "id": "csh_boss_minion_ciri",
    "name": "希里",
    "template": "T2_draw_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "希里的助战·摸牌：本局首次用牌造成伤害，结算后摸 1 张牌",
    "sourceSkill": "csh_boss_you_cannian"
  },
  {
    "id": "csh_boss_minion_catherine",
    "name": "凯瑟琳",
    "template": "T4_distance",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "凯瑟琳的同行·距离：本局与其他角色的距离 -1",
    "sourceSkill": "csh_boss_jinchi"
  },
  {
    "id": "csh_boss_minion_kaguya",
    "name": "四宫辉夜",
    "template": "T3_hand_cap",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "四宫辉夜的共谋·手牌：本局手牌上限 +1",
    "sourceSkill": "csh_boss_lengyan"
  },
  {
    "id": "csh_boss_minion_zelda",
    "name": "塞尔达",
    "template": "T5_response_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "塞尔达的接应·响应：本局首次应对南蛮入侵、万箭齐发或决斗时，妖灵替你响应一次",
    "sourceSkill": "csh_boss_xiushi"
  },
  {
    "id": "csh_boss_minion_angel",
    "name": "天使",
    "template": "T6_recover_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "天使的回护·回复：本局首次濒死时，回复 1 点体力",
    "sourceSkill": "csh_boss_enze"
  },
  {
    "id": "csh_boss_minion_chunli",
    "name": "春丽",
    "template": "T1_guard_damage",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "春丽的护主·减伤：本局首次受到伤害时，此伤害 -1",
    "sourceSkill": "csh_boss_bailie"
  },
  {
    "id": "csh_boss_minion_makima",
    "name": "玛琪玛",
    "template": "T3_hand_cap",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "玛琪玛的共谋·手牌：本局手牌上限 +1",
    "sourceSkill": "csh_boss_zhipei"
  },
  {
    "id": "csh_boss_minion_ayasato",
    "name": "绫里姐妹",
    "template": "T5_response_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "绫里姐妹的接应·响应：本局首次应对南蛮入侵、万箭齐发或决斗时，妖灵替你响应一次",
    "sourceSkill": "csh_boss_jiangling"
  },
  {
    "id": "csh_boss_minion_robin",
    "name": "罗宾",
    "template": "T3_hand_cap",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "罗宾的共谋·手牌：本局手牌上限 +1",
    "sourceSkill": "csh_boss_huafu"
  },
  {
    "id": "csh_boss_minion_emilia",
    "name": "艾米莉亚",
    "template": "T5_response_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "艾米莉亚的接应·响应：本局首次应对南蛮入侵、万箭齐发或决斗时，妖灵替你响应一次",
    "sourceSkill": "csh_boss_bingjie"
  },
  {
    "id": "csh_boss_minion_ashe",
    "name": "艾什",
    "template": "T4_distance",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "艾什的同行·距离：本局与其他角色的距离 -1",
    "sourceSkill": "csh_boss_qianru"
  },
  {
    "id": "csh_boss_minion_frieren",
    "name": "芙莉莲",
    "template": "T6_recover_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "芙莉莲的回护·回复：本局首次濒死时，回复 1 点体力",
    "sourceSkill": "csh_boss_qiannian"
  },
  {
    "id": "csh_boss_minion_tifa",
    "name": "蒂法",
    "template": "T1_guard_damage",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "蒂法的护主·减伤：本局首次受到伤害时，此伤害 -1",
    "sourceSkill": "csh_boss_yaoqi"
  },
  {
    "id": "csh_boss_minion_sakura",
    "name": "春野樱",
    "template": "T6_recover_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "春野樱的回护·回复：本局首次濒死时，回复 1 点体力",
    "sourceSkill": "csh_boss_baihao"
  },
  {
    "id": "csh_boss_minion_mai",
    "name": "不知火舞",
    "template": "T6_recover_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "不知火舞的回护·回复：本局首次濒死时，回复 1 点体力",
    "sourceSkill": "csh_boss_renwu"
  },
  {
    "id": "csh_boss_minion_android",
    "name": "人造人",
    "template": "T2_draw_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "人造人的助战·摸牌：本局首次用牌造成伤害，结算后摸 1 张牌",
    "sourceSkill": "csh_boss_yongdong"
  },
  {
    "id": "csh_boss_minion_ishtar",
    "name": "伊什塔尔",
    "template": "T2_draw_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "伊什塔尔的助战·摸牌：本局首次用牌造成伤害，结算后摸 1 张牌",
    "sourceSkill": "csh_boss_tianzhou"
  },
  {
    "id": "csh_boss_minion_sarada",
    "name": "佐良娜",
    "template": "T1_guard_damage",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "佐良娜的护主·减伤：本局首次受到伤害时，此伤害 -1",
    "sourceSkill": "csh_boss_xuetong"
  },
  {
    "id": "csh_boss_minion_perona",
    "name": "佩罗娜",
    "template": "T6_recover_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "佩罗娜的回护·回复：本局首次濒死时，回复 1 点体力",
    "sourceSkill": "csh_boss_youling"
  },
  {
    "id": "csh_boss_minion_guangxi",
    "name": "光熙",
    "template": "T1_guard_damage",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "光熙的护主·减伤：本局首次受到伤害时，此伤害 -1",
    "sourceSkill": "csh_boss_guangyan"
  },
  {
    "id": "csh_boss_minion_hachikuji",
    "name": "八九寺真宵",
    "template": "T3_hand_cap",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "八九寺真宵的共谋·手牌：本局手牌上限 +1",
    "sourceSkill": "csh_boss_milu"
  },
  {
    "id": "csh_boss_minion_megumi",
    "name": "加藤惠",
    "template": "T1_guard_damage",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "加藤惠的护主·减伤：本局首次受到伤害时，此伤害 -1",
    "sourceSkill": "csh_boss_linzuo"
  },
  {
    "id": "csh_boss_minion_yoruichi",
    "name": "四枫院夜一",
    "template": "T4_distance",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "四枫院夜一的同行·距离：本局与其他角色的距离 -1",
    "sourceSkill": "csh_boss_shunbu"
  },
  {
    "id": "csh_boss_minion_fortune",
    "name": "好运姐",
    "template": "T1_guard_damage",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "好运姐的护主·减伤：本局首次受到伤害时，此伤害 -1",
    "sourceSkill": "csh_boss_shuangqiang"
  },
  {
    "id": "csh_boss_minion_nilou",
    "name": "妮露",
    "template": "T2_draw_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "妮露的助战·摸牌：本局首次用牌造成伤害，结算后摸 1 张牌",
    "sourceSkill": "csh_boss_wuqi"
  },
  {
    "id": "csh_boss_minion_nami",
    "name": "娜美",
    "template": "T4_distance",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "娜美的同行·距离：本局与其他角色的距离 -1",
    "sourceSkill": "csh_boss_tianhou"
  },
  {
    "id": "csh_boss_minion_konan",
    "name": "小南",
    "template": "T4_distance",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "小南的同行·距离：本局与其他角色的距离 -1",
    "sourceSkill": "csh_boss_zhiwu"
  },
  {
    "id": "csh_boss_minion_temari",
    "name": "手鞠",
    "template": "T1_guard_damage",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "手鞠的护主·减伤：本局首次受到伤害时，此伤害 -1",
    "sourceSkill": "csh_boss_lianyou"
  },
  {
    "id": "csh_boss_minion_tsukihi",
    "name": "月火",
    "template": "T5_response_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "月火的接应·响应：本局首次应对南蛮入侵、万箭齐发或决斗时，妖灵替你响应一次",
    "sourceSkill": "csh_boss_fenshen"
  },
  {
    "id": "csh_boss_minion_liulibei",
    "name": "柳离悲",
    "template": "T5_response_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "柳离悲的接应·响应：本局首次应对南蛮入侵、万箭齐发或决斗时，妖灵替你响应一次",
    "sourceSkill": "csh_boss_libei"
  },
  {
    "id": "csh_boss_minion_maisakura",
    "name": "樱岛麻衣",
    "template": "T4_distance",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "樱岛麻衣的同行·距离：本局与其他角色的距离 -1",
    "sourceSkill": "csh_boss_yinshen"
  },
  {
    "id": "csh_boss_minion_ran",
    "name": "毛利兰",
    "template": "T2_draw_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "毛利兰的助战·摸牌：本局首次用牌造成伤害，结算后摸 1 张牌",
    "sourceSkill": "csh_boss_kongshou"
  },
  {
    "id": "csh_boss_minion_mui",
    "name": "生志摩妄",
    "template": "T3_hand_cap",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "生志摩妄的共谋·手牌：本局手牌上限 +1",
    "sourceSkill": "csh_boss_wangzhi"
  },
  {
    "id": "csh_boss_minion_tayama",
    "name": "田山",
    "template": "T4_distance",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "田山的同行·距离：本局与其他角色的距离 -1",
    "sourceSkill": "csh_boss_shanwu"
  },
  {
    "id": "csh_boss_minion_wonder",
    "name": "神奇女侠",
    "template": "T5_response_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "神奇女侠的接应·响应：本局首次应对南蛮入侵、万箭齐发或决斗时，妖灵替你响应一次",
    "sourceSkill": "csh_boss_shendun"
  },
  {
    "id": "csh_boss_minion_yui",
    "name": "结衣",
    "template": "T2_draw_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "结衣的助战·摸牌：本局首次用牌造成伤害，结算后摸 1 张牌",
    "sourceSkill": "csh_boss_shuju"
  },
  {
    "id": "csh_boss_minion_momo",
    "name": "绫濑桃",
    "template": "T4_distance",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "绫濑桃的同行·距离：本局与其他角色的距离 -1",
    "sourceSkill": "csh_boss_taoyao"
  },
  {
    "id": "csh_boss_minion_fern",
    "name": "菲伦",
    "template": "T3_hand_cap",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "菲伦的共谋·手牌：本局手牌上限 +1",
    "sourceSkill": "csh_boss_bingshuang"
  },
  {
    "id": "csh_boss_minion_valentine",
    "name": "菲瓦伦汀",
    "template": "T3_hand_cap",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "菲瓦伦汀的共谋·手牌：本局手牌上限 +1",
    "sourceSkill": "csh_boss_lianfu"
  },
  {
    "id": "csh_boss_minion_shinobu",
    "name": "蝴蝶忍",
    "template": "T6_recover_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "蝴蝶忍的回护·回复：本局首次濒死时，回复 1 点体力",
    "sourceSkill": "csh_boss_dudie"
  },
  {
    "id": "csh_boss_minion_yukino",
    "name": "雪之下雪乃",
    "template": "T3_hand_cap",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "雪之下雪乃的共谋·手牌：本局手牌上限 +1",
    "sourceSkill": "csh_boss_fengyan"
  },
  {
    "id": "csh_boss_minion_luna",
    "name": "露娜",
    "template": "T6_recover_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "露娜的回护·回复：本局首次濒死时，回复 1 点体力",
    "sourceSkill": "csh_boss_yueying"
  },
  {
    "id": "csh_boss_minion_anne",
    "name": "高卷杏",
    "template": "T5_response_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "高卷杏的接应·响应：本局首次应对南蛮入侵、万箭齐发或决斗时，妖灵替你响应一次",
    "sourceSkill": "csh_boss_ranxin"
  },
  {
    "id": "csh_boss_minion_oniko",
    "name": "鬼の子",
    "template": "T6_recover_once",
    "unlockLevel": "B",
    "magnitude": 1,
    "perGame": 1,
    "playerText": "鬼の子的回护·回复：本局首次濒死时，回复 1 点体力",
    "sourceSkill": "csh_boss_guiku"
  }
].map(function (r) { return Object.freeze(r); }));
  var BY_ID = Object.create(null);
  for (var i = 0; i < BUFFS.length; i++) BY_ID[BUFFS[i].id] = BUFFS[i];

  function get(id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(BY_ID, id) ? BY_ID[id] : null;
  }
  function list() { return BUFFS.slice(); }
  function ids() { return BUFFS.map(function (r) { return r.id; }); }
  /* 未知档位 / 非字符串一律不解锁，不抛错、不默认放行 */
  function unlocked(levelKey, id) {
    var b = get(id);
    if (!b) return false;
    var li = LEVEL_ORDER.indexOf(levelKey);
    return li >= LEVEL_ORDER.indexOf(UNLOCK_LEVEL) && b.unlockLevel === UNLOCK_LEVEL;
  }
  function perGame(id) { var b = get(id); return b ? b.perGame : 0; }
  function templateOf(id) { var b = get(id); return b ? TEMPLATES[b.template] || null : null; }

  root.CSHSpiritBuffs = Object.freeze({
    VERSION: VERSION,
    LEVEL_ORDER: LEVEL_ORDER.slice(),
    UNLOCK_LEVEL: UNLOCK_LEVEL,
    TEMPLATES: TEMPLATES,
    get: get,
    list: list,
    ids: ids,
    unlocked: unlocked,
    perGame: perGame,
    templateOf: templateOf
  });
})(typeof window !== 'undefined' ? window : this);
