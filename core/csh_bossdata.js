/* ============================================================
   池子魔将 · BOSS 模式数据层（v4 · 2026-10-14）
   ------------------------------------------------------------
   ★ 本文件是 BOSS 模式的**唯一数据真源**：
     · 93 人档位分配表（究极 8 / 霸主 30 / 彩蛋 4 / 精英 51——v4：6 人移出魔王池、
       明日香升究极、张飞/关索降精英、烬火系全霸主、7 人升霸主；详见 ULTIMATE/LORD 注释）
     · 八系列 → 系列技映射、妖灵池（v5.1 · 20 只全美女立绘 = 六式 + 十二美 + 希里(游魂位) + 春野樱；随机搭配抽取）、lib.boss 配置模板
     · buildBossEntries()：纯构造函数——输入扩展包原始数据、输出魔王条目 / 配置 / 出场顺序
   ★ 零 import、零引擎全局引用（gameDraw 等由 main/bossmode.js 注入时补充）——
     可被 Node 直接 import 校验（tools/check.js runBossChecks · 含执行级门禁）。
   ★ 数值校准全部集中在本文件单点（实机后只改这里）。
   ============================================================ */

/* ---------- D5 开关：魔王势力（作者拍板：统一「魔」） ---------- */
export const BOSS_GROUP = "devil";

/* ---------- 四档模板 ---------- */
export const TIER_HP = { ultimate: 30, lord: 25, elite: 20 };            /* 完全体 X（解封上限） */
/* v4【醒魔】起点 = 完全体 40%（作者定案"起点挡位血量是百分之40，不至于太受挫"）：
   开局 8/10/12 血可战，每准备阶段 +1，12/15/18 回合长满；长不满是特性（全程在解封路上）。 */
export const TIER_HP_START = { ultimate: 12, lord: 10, elite: 8 };
/* ---------- v6 重整档位（2026-10-15 作者定案：精英2 / 霸主4 / 究极5 / 彩蛋0）----------
   ★ 机制语义提醒（上一轮审计实证）：重整对**所有非魔王**生效——挑战者与妖灵死后
     都会在计满 `chongzheng` 个循环后复活（mode/boss.js:460 非魔王清零计数、
     bossPhaseLoop 计满即 revive）。因此：
       · 对玩家 = 多一次"复活重来"的机会（更宽容）；
       · 对妖灵 = 会后复活 → 同局内同一只妖灵可被反复击破（每击破仍发妖灵讨伐收益）。
     精英档由 0 改 2，等于**打开了精英档的妖灵复活循环**（原先 0 = 一次性解决）。
     若要收口，最小改动是给 `recordMinion` 加"同局去重"（见 docs/boss-design.md §18）。 */
export const TIER_CHONGZHENG = { ultimate: 5, lord: 4, elite: 3, egg: 0 };
/* v4：50 血特例（作者定案：董卓/兀突骨开局即完全体，不装解封技） */
export const TIER_HP_OVERRIDE = { csh_dongzhuo: 50, csh_wn: 50 };
/* v4：解封技例外（张飞/关索技能与血量机制特殊，作者定案不装；彩蛋档一律不装） */
export const NO_AWAKEN = ["csh_ae", "csh_guansuo"];
/* 魔息（v3 · 摸牌阶段额外摸 X）：按档位分档 */
export const TIER_MOXI = { ultimate: 4, lord: 3, elite: 2, egg: 1 };

/* 妖灵挂接（键位对齐本体样例 {2:"boss_zhuyin"}）：v5 起不再固定配对——
   出场规则 = MINION_POOL 随机抽取（见下方妖灵池段；2026-10-14 作者定案
   "妖灵和魔王的搭配不是固定的"）。 */


/* ---------- 系统层技能（v4.2 五技 → v6 二技：作者 2026-10-15 定案） ----------
   作者定案：疯魔持续 1~2 轮（不得常驻）；反扑=首次濒死。
   ★ 2026-10-15 作者指令「移除久战、记仇、征税」——三技已删除（含 skills/boss.js
     定义、译名、MAIN_SKILLS 声明、门禁与文档）；系统层收敛为**疯魔 + 反扑**两技。 */
export const BOSS_SYSTEM_SKILLS = [
	"csh_boss_fengmo", "csh_boss_fanpu",
];

/* ---------- 档位名单（93 人真值 · v4 计数 8/30/4/51） ---------- */
export const ULTIMATE = [
	"csh_mlb", "csh_doudou", "csh_realityfanghao", "csh_lr", "csh_karl", "csh_kuisangti",
	"csh_yangjian",       /* 杨间（周天系） */
	"csh_mingrixiang",    /* v4：明日香升格究极（周天系） */
];
export const LORD = [
	/* 摧锋 4 */ "csh_jzh", "csh_bfsm", "csh_theshy", "csh_tongyuan",
	/* 周天 7（-张飞 -神诸葛果 +奶龙 +魔腾） */ "csh_sj", "csh_sq", "csh_msmy", "csh_szc", "csh_zuozhu",
	"csh_nailong_juexing", "csh_moteng",
	/* 覆澜 3（+徐荣；-貂蝉 -友哈巴赫） */ "csh_qw", "csh_zhangbao", "csh_xurong",
	/* 汇川 4（+孙鲁班） */ "csh_ngwt", "csh_feibijiubi", "csh_zhugeqing", "csh_vxs",
	/* 浮光 6（+李丰 +陆绩 +蔡琰 +曹昂） */ "csh_zhangning", "csh_shanyuezhiyin",
	"csh_lifeng", "csh_jieluji", "csh_caiyan", "csh_caoang",
	/* 烬火 5（全霸主：+高达姬 +拉莫斯） */ "csh_wn", "csh_dongzhuo", "csh_zhuzhi",
	"csh_gdsn", "csh_lamosi",
	/* 惊霆 1 */ "csh_maochao",
];
export const EGG = {
	csh_yuangubafei: { hp: 8, skill: "csh_boss_bachong" },   // 远古八废 · 八重
	csh_misida: { hp: 12, skill: "csh_boss_jinji" },         // 米斯达 · 禁忌
	csh_dz: { hp: 12, skill: "csh_boss_jianzhen" },          // 丁真 · 鉴真
	csh_dabing: { hp: 10, skill: "csh_boss_wobing" },        // 大冰 · 卧冰
};

/* ---------- 八系列 → 系列技（乱入技只属于平凡之人，通过系列池被随机引用） ---------- */
export const SERIES = {
	csh_cuifeng: [
		"csh_mlb", "csh_doudou", "csh_jzh", "csh_bfsm", "csh_theshy", "csh_tongyuan",
		"csh_jjxs", "csh_mmhz", "csh_wlk", "csh_sx", "csh_gy", "csh_chengpu", "csh_xuchu",
		"csh_handang", "csh_wenyang", "csh_caochun", "csh_lidian",
		"csh_wolongzhuge", "csh_chendao", "csh_lukang", "csh_zhugeke", "csh_guanyinping",
		"csh_zhangxingcai", "csh_zywoo",
	],
	csh_zhoutian: [
		"csh_realityfanghao", "csh_sj", "csh_sq", "csh_msmy", "csh_szc", "csh_ae", "csh_zuozhu",
		"csh_yuangubafei", "csh_misida", "csh_sunshangxiang", "csh_huaman", "csh_xingganning",
		"csh_liximing", "csh_mingrixiang", "csh_mlm", "csh_guohuai", "csh_zhonghui", "csh_bin",
		"csh_guansuo", "csh_zhaoxiang", "csh_dengai", "csh_lvlingqi", "csh_nailong_juexing",
		"csh_moteng", "csh_modekaisa", "csh_yangjian",
	],
	csh_fulan: [
		"csh_lr", "csh_qw", "csh_zhangbao", "csh_yy", "csh_wy", "csh_mzj",
		"csh_xushu", "csh_weizheng", "csh_xurong", "csh_chengyu",
	],
	csh_huichuan: [
		"csh_karl", "csh_ngwt", "csh_feibijiubi", "csh_zhugeqing", "csh_ls", "csh_vxs",
		"csh_bzt", "csh_yujin", "csh_shamoke", "csh_zhouchu",
	],
	csh_fuguang: [
		"csh_zhangning", "csh_shanyuezhiyin", "csh_huangyueying", "csh_caoang", "csh_caiyan",
		"csh_simahui", "csh_gaogan", "csh_lifeng", "csh_daaixianzun", "csh_jieluji",
	],
	csh_jinhuo: [
		"csh_kuisangti", "csh_wn", "csh_dongzhuo", "csh_dz", "csh_gdsn", "csh_zhuzhi", "csh_lamosi",
	],
	csh_jingting: [
		"csh_maochao", "csh_dabing", "csh_donk", "csh_sake", "csh_sailasi",
	],
	csh_qunyou_lunwai: ["csh_pingfan"],
};

export const SERIES_SKILL = {
	csh_cuifeng: "csh_boss_liezhen",
	csh_zhoutian: "csh_boss_xingjian",
	csh_fulan: "csh_boss_fushi",
	csh_huichuan: "csh_boss_huiliu",
	csh_fuguang: "csh_boss_fuying",
	csh_jinhuo: "csh_boss_liaoyuan",
	csh_jingting: "csh_boss_jingbian",
	csh_qunyou_lunwai: "csh_boss_luanru",
};
/* 系列中文名（乱入卷显示为外传）——bossbook 页与门禁共用 */
export const SERIES_NAME = {
	csh_cuifeng: "摧锋", csh_zhoutian: "周天", csh_fulan: "覆澜", csh_huichuan: "汇川",
	csh_fuguang: "浮光", csh_jinhuo: "烬火", csh_jingting: "惊霆", csh_qunyou_lunwai: "外传",
};
/* 「乱入」随机池（平凡之人开局从其余七系抽一；排除乱入自身） */
export const LUANRU_POOL = [
	"csh_boss_liezhen", "csh_boss_xingjian", "csh_boss_fushi", "csh_boss_huiliu",
	"csh_boss_fuying", "csh_boss_liaoyuan", "csh_boss_jingbian",
];

/* ---------- 妖灵（v6.1 · 50 只池 · 全员女性立绘统一 · 全员 3 血 · 全员随机出场） ----------
   ★ 四层构成（作者定案：立绘统一审美、名字按立绘原名、19 不好听改 20）：
     · 六式（增幅魔王向 · 技能效果沿用 v4 六老怪，名随立绘主人）：
       伊芙【剑刃】/ 艾达王【掩护】/ 天天【忍具】/ 女帝【魅惑】/ 特莉丝【烈焰】/ 吹雪【念动】
     · 十二美（压制挑战者向 · 机制覆盖矩阵）：矜持/冷眼/锈蚀/恩泽/百裂/支配/降灵/花缚/冰结/潜入/千年/七曜
     · 希里（v6.1 起与其余妖灵同等：3 血 · **不再固定给精英**）：【时痕】（原残念 · 死亡魔王摸 1）
     · 春野樱（第二十席）：【百豪】（每轮自愈）
   ★ v6.1（2026-10-15 作者定案）：**50 只统一 3 血**（原 4 血、希里 3 血）+
     **出场全随机化**（原精英固定希里）——见下方 MINION_POOL 段说明。
   ★ 每只妖灵 2 技：技1 = 专属；技2 = 统一【池悯】（纯击杀者福利，只给挑战者方）
     ——由 MINION_COMMON_SKILLS 统一追加，单点定义。
   ★ 立绘：img = 高清主图（csh_minion_<ascii>.webp）/ face = 人像半身图（csh_face_<ascii>.webp，
     供金鳞市卡面等场景）。**文件名一律 ASCII**（2026-10-15 改，见 CHANGELOG 八十八）：
     取本表的键去掉前缀 `csh_boss_minion_` 那一截（如 csh_boss_minion_eve → csh_minion_eve.webp）；
     中文显示名不靠文件名推导，唯一真源是下面的 name 字段。 */
export const MINIONS = {
	/* ---------- 六式（增幅魔王向 · v5.1 立绘焕新：池影→伊芙 / 看客→艾达王 / 锋卒→天天 /
	   浪童→女帝 / 焚俑→特莉丝 / 傀儡→吹雪——技能效果不变，名随立绘主人）
	   ★ v5.2 勘误（作者澄清）：第一轮那张"艾达"实为**艾什**（作者打错名）——"艾什"归十二美
	     （原"艾达"位 · 潜入）；"艾达王"是**新加**的另一角色，归本六式位（掩护）。 */
	csh_boss_minion_eve: {
		name: "伊芙", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_ying_hunshi"],                  /* 魂矢 · 魔王杀伤+1 */
		img: "extension/池子魔将/image/csh_minion_eve.webp",
		face: "extension/池子魔将/image/csh_face_eve.webp",
	},
	csh_boss_minion_ada: {
		name: "艾达王", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_kan_guzao"],                     /* 掩护（原鼓噪）· 魔王摸牌+1 */
		img: "extension/池子魔将/image/csh_minion_ada.webp",
		face: "extension/池子魔将/image/csh_face_ada.webp",
	},
	csh_boss_minion_tenten: {
		name: "天天", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_feng_fengshi"],                  /* 忍具（原锋势）· 杀命中摸1 */
		img: "extension/池子魔将/image/csh_minion_tenten.webp",
		face: "extension/池子魔将/image/csh_face_tenten.webp",
	},
	csh_boss_minion_empress: {
		name: "女帝", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_lang_nongchao"],                 /* 御前 · 点名手牌最多者夺牌 */
		img: "extension/池子魔将/image/csh_minion_empress.webp",
		face: "extension/池子魔将/image/csh_face_empress.webp",
	},
	csh_boss_minion_triss: {
		name: "特莉丝", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_fen_yujin"],                     /* 烈焰 · 对横置者增伤 */
		img: "extension/池子魔将/image/csh_minion_triss.webp",
		face: "extension/池子魔将/image/csh_face_triss.webp",
	},
	csh_boss_minion_fubuki: {
		name: "吹雪", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_kui_qiansi"],                    /* 念动（原牵丝）· 拆闪 */
		img: "extension/池子魔将/image/csh_minion_fubuki.webp",
		face: "extension/池子魔将/image/csh_face_fubuki.webp",
	},
	/* ---------- 游魂位（v6.1：血量与出场规则与其余妖灵完全一致——3 血 · 入随机池） ---------- */
	csh_boss_minion_ciri: {
		name: "希里", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_you_cannian"],                   /* 时痕（原残念）· 死亡魔王摸1 */
		img: "extension/池子魔将/image/csh_minion_ciri.webp",
		face: "extension/池子魔将/image/csh_face_ciri.webp",
	},
	/* ---------- 十二美（压制挑战者向 · v5 · 机制覆盖矩阵） ---------- */
	csh_boss_minion_catherine: {
		name: "凯瑟琳", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_jinchi"],                       /* 矜持 · 距离 */
		img: "extension/池子魔将/image/csh_minion_catherine.webp",
		face: "extension/池子魔将/image/csh_face_catherine.webp",
	},
	csh_boss_minion_kaguya: {
		name: "四宫辉夜", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_lengyan"],                      /* 冷眼 · 手牌上限 */
		img: "extension/池子魔将/image/csh_minion_kaguya.webp",
		face: "extension/池子魔将/image/csh_face_kaguya.webp",
	},
	csh_boss_minion_zelda: {
		name: "塞尔达", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_xiushi"],                       /* 锈蚀 · 响应 */
		img: "extension/池子魔将/image/csh_minion_zelda.webp",
		face: "extension/池子魔将/image/csh_face_zelda.webp",
	},
	csh_boss_minion_angel: {
		name: "天使", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_enze"],                         /* 恩泽 · 回复 */
		img: "extension/池子魔将/image/csh_minion_angel.webp",
		face: "extension/池子魔将/image/csh_face_angel.webp",
	},
	csh_boss_minion_chunli: {
		name: "春丽", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_bailie"],                       /* 百裂 · 主动出杀 */
		img: "extension/池子魔将/image/csh_minion_chunli.webp",
		face: "extension/池子魔将/image/csh_face_chunli.webp",
	},
	csh_boss_minion_makima: {
		name: "玛琪玛", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_zhipei"],                       /* 支配 · 主动挑拨 */
		img: "extension/池子魔将/image/csh_minion_makima.webp",
		face: "extension/池子魔将/image/csh_face_makima.webp",
	},
	csh_boss_minion_ayasato: {
		name: "绫里姐妹", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_jiangling"],                    /* 降灵 · 判定 */
		img: "extension/池子魔将/image/csh_minion_ayasato.webp",
		face: "extension/池子魔将/image/csh_face_ayasato.webp",
	},
	csh_boss_minion_robin: {
		name: "罗宾", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_huafu"],                        /* 花缚 · 弃牌 */
		img: "extension/池子魔将/image/csh_minion_robin.webp",
		face: "extension/池子魔将/image/csh_face_robin.webp",
	},
	csh_boss_minion_emilia: {
		name: "艾米莉亚", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_bingjie"],                      /* 冰结 · 横置 */
		img: "extension/池子魔将/image/csh_minion_emilia.webp",
		face: "extension/池子魔将/image/csh_face_emilia.webp",
	},
	csh_boss_minion_ashe: {
		name: "艾什", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_qianru"],                       /* 潜入 · 装备区（原"艾达"位） */
		img: "extension/池子魔将/image/csh_minion_ashe.webp",
		face: "extension/池子魔将/image/csh_face_ashe.webp",
	},
	csh_boss_minion_frieren: {
		name: "芙莉莲", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_qiannian"],                     /* 千年 · 濒死自救 */
		img: "extension/池子魔将/image/csh_minion_frieren.webp",
		face: "extension/池子魔将/image/csh_face_frieren.webp",
	},
	csh_boss_minion_tifa: {
		name: "蒂法", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_yaoqi"],                        /* 七曜 · 主动拼点 */
		img: "extension/池子魔将/image/csh_minion_tifa.webp",
		face: "extension/池子魔将/image/csh_face_tifa.webp",
	},
	/* ---------- 第二十席（v5.1 新增 · 春野樱 · 医疗忍者的百豪） ---------- */
	csh_boss_minion_sakura: {
		name: "春野樱", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_baihao"],                       /* 百豪 · 每轮自愈 */
		img: "extension/池子魔将/image/csh_minion_sakura.webp",
		face: "extension/池子魔将/image/csh_face_sakura.webp",
	},
	/* ---------- v6 十卫（10 只 · 魔王向 · 2026-10-15 作者新批次）---------- */
	csh_boss_minion_mai: {
		name: "不知火舞", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_renwu"],                  /* 忍舞 */
		img: "extension/池子魔将/image/csh_minion_mai.webp",
		face: "extension/池子魔将/image/csh_face_mai.webp",
	},
	csh_boss_minion_android: {
		name: "人造人", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_yongdong"],                  /* 永动 */
		img: "extension/池子魔将/image/csh_minion_android.webp",
		face: "extension/池子魔将/image/csh_face_android.webp",
	},
	csh_boss_minion_ishtar: {
		name: "伊什塔尔", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_tianzhou"],                  /* 天舟 */
		img: "extension/池子魔将/image/csh_minion_ishtar.webp",
		face: "extension/池子魔将/image/csh_face_ishtar.webp",
	},
	csh_boss_minion_sarada: {
		name: "佐良娜", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_xuetong"],                  /* 血瞳 */
		img: "extension/池子魔将/image/csh_minion_sarada.webp",
		face: "extension/池子魔将/image/csh_face_sarada.webp",
	},
	csh_boss_minion_perona: {
		name: "佩罗娜", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_youling"],                  /* 幽灵 */
		img: "extension/池子魔将/image/csh_minion_perona.webp",
		face: "extension/池子魔将/image/csh_face_perona.webp",
	},
	csh_boss_minion_guangxi: {
		name: "光熙", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_guangyan"],                  /* 光焰 */
		img: "extension/池子魔将/image/csh_minion_guangxi.webp",
		face: "extension/池子魔将/image/csh_face_guangxi.webp",
	},
	csh_boss_minion_hachikuji: {
		name: "八九寺真宵", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_milu"],                  /* 迷路 */
		img: "extension/池子魔将/image/csh_minion_hachikuji.webp",
		face: "extension/池子魔将/image/csh_face_hachikuji.webp",
	},
	csh_boss_minion_megumi: {
		name: "加藤惠", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_linzuo"],                  /* 随和 · 单次重伤害收税 */
		img: "extension/池子魔将/image/csh_minion_megumi.webp",
		face: "extension/池子魔将/image/csh_face_megumi.webp",
	},
	csh_boss_minion_yoruichi: {
		name: "四枫院夜一", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_shunbu"],                  /* 瞬步 */
		img: "extension/池子魔将/image/csh_minion_yoruichi.webp",
		face: "extension/池子魔将/image/csh_face_yoruichi.webp",
	},
	csh_boss_minion_fortune: {
		name: "好运姐", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_shuangqiang"],                  /* 双枪 */
		img: "extension/池子魔将/image/csh_minion_fortune.webp",
		face: "extension/池子魔将/image/csh_face_fortune.webp",
	},
	/* ---------- v6 二十刑（20 只 · 挑战者向）---------- */
	csh_boss_minion_nilou: {
		name: "妮露", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_wuqi"],                  /* 舞祈 */
		img: "extension/池子魔将/image/csh_minion_nilou.webp",
		face: "extension/池子魔将/image/csh_face_nilou.webp",
	},
	csh_boss_minion_nami: {
		name: "娜美", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_tianhou"],                  /* 天候 */
		img: "extension/池子魔将/image/csh_minion_nami.webp",
		face: "extension/池子魔将/image/csh_face_nami.webp",
	},
	csh_boss_minion_konan: {
		name: "小南", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_zhiwu"],                  /* 纸舞 */
		img: "extension/池子魔将/image/csh_minion_konan.webp",
		face: "extension/池子魔将/image/csh_face_konan.webp",
	},
	csh_boss_minion_temari: {
		name: "手鞠", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_lianyou"],                  /* 镰风 */
		img: "extension/池子魔将/image/csh_minion_temari.webp",
		face: "extension/池子魔将/image/csh_face_temari.webp",
	},
	csh_boss_minion_tsukihi: {
		name: "月火", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_fenshen"],                  /* 焚身 */
		img: "extension/池子魔将/image/csh_minion_tsukihi.webp",
		face: "extension/池子魔将/image/csh_face_tsukihi.webp",
	},
	csh_boss_minion_liulibei: {
		name: "柳离悲", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_libei"],                  /* 离悲 · 拆【闪】 */
		img: "extension/池子魔将/image/csh_minion_liulibei.webp",
		face: "extension/池子魔将/image/csh_face_liulibei.webp",
	},
	csh_boss_minion_maisakura: {
		name: "樱岛麻衣", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_yinshen"],                  /* 隐身 */
		img: "extension/池子魔将/image/csh_minion_maisakura.webp",
		face: "extension/池子魔将/image/csh_face_maisakura.webp",
	},
	csh_boss_minion_ran: {
		name: "毛利兰", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_kongshou"],                  /* 空手 · 缴械封杀 */
		img: "extension/池子魔将/image/csh_minion_ran.webp",
		face: "extension/池子魔将/image/csh_face_ran.webp",
	},
	csh_boss_minion_mui: {
		name: "生志摩妄", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_wangzhi"],                  /* 妄执 */
		img: "extension/池子魔将/image/csh_minion_mui.webp",
		face: "extension/池子魔将/image/csh_face_mui.webp",
	},
	csh_boss_minion_tayama: {
		name: "田山", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_shanwu"],                  /* 山雾 */
		img: "extension/池子魔将/image/csh_minion_tayama.webp",
		face: "extension/池子魔将/image/csh_face_tayama.webp",
	},
	csh_boss_minion_wonder: {
		name: "神奇女侠", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_shendun"],                  /* 神盾 */
		img: "extension/池子魔将/image/csh_minion_wonder.webp",
		face: "extension/池子魔将/image/csh_face_wonder.webp",
	},
	csh_boss_minion_yui: {
		name: "结衣", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_shuju"],                  /* 数据 */
		img: "extension/池子魔将/image/csh_minion_yui.webp",
		face: "extension/池子魔将/image/csh_face_yui.webp",
	},
	csh_boss_minion_momo: {
		name: "绫濑桃", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_taoyao"],                  /* 桃芳 */
		img: "extension/池子魔将/image/csh_minion_momo.webp",
		face: "extension/池子魔将/image/csh_face_momo.webp",
	},
	csh_boss_minion_fern: {
		name: "菲伦", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_bingshuang"],                  /* 冰霜 */
		img: "extension/池子魔将/image/csh_minion_fern.webp",
		face: "extension/池子魔将/image/csh_face_fern.webp",
	},
	csh_boss_minion_valentine: {
		name: "菲瓦伦汀", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_lianfu"],                  /* 恋缚 */
		img: "extension/池子魔将/image/csh_minion_valentine.webp",
		face: "extension/池子魔将/image/csh_face_valentine.webp",
	},
	csh_boss_minion_shinobu: {
		name: "蝴蝶忍", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_dudie"],                  /* 毒蝶 */
		img: "extension/池子魔将/image/csh_minion_shinobu.webp",
		face: "extension/池子魔将/image/csh_face_shinobu.webp",
	},
	csh_boss_minion_yukino: {
		name: "雪之下雪乃", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_fengyan"],                  /* 讽言 */
		img: "extension/池子魔将/image/csh_minion_yukino.webp",
		face: "extension/池子魔将/image/csh_face_yukino.webp",
	},
	csh_boss_minion_luna: {
		name: "露娜", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_yueying"],                  /* 月影 */
		img: "extension/池子魔将/image/csh_minion_luna.webp",
		face: "extension/池子魔将/image/csh_face_luna.webp",
	},
	csh_boss_minion_anne: {
		name: "高卷杏", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_ranxin"],                  /* 燃心 */
		img: "extension/池子魔将/image/csh_minion_anne.webp",
		face: "extension/池子魔将/image/csh_face_anne.webp",
	},
	csh_boss_minion_oniko: {
		name: "鬼の子", sex: "female", hp: 3, maxHp: 3, hujia: 1, group: "devil",
		skills: ["csh_boss_guiku"],                  /* 鬼哭 */
		img: "extension/池子魔将/image/csh_minion_oniko.webp",
		face: "extension/池子魔将/image/csh_face_oniko.webp",
	},
};
/* ---------- 妖灵名：数据层唯一真源（v6.7 · 2026-10-15） ----------
   ★ 起因（真 BUG · 作者实机）：妖灵图鉴把 50 位妖灵显示成原始 id
     （如 csh_boss_minion_eve）。根因 = 名字的读取点只有 lib.translate，
     而它要等「boss 角色包被引擎 loadCharacter 处理」才落地（character/boss.js:57）；
     懒人包 / 旧版客户端不走这一步 ⇒ 全体回退成 id。
   ★ 定案：名字的唯一真源 = **MINIONS[id].name**（本文件静态数据，零加载时序依赖）。
     lib.translate 降为兜底。对外只暴露这一份 MINION_NAMES ——
     页面 / 讨伐统计 / 好感度 / 金鳞市全部读它，杜绝"同一份名字分成两条来源"。
   ★ 读取侧请写 `MINION_NAMES[id] || (lib.translate && lib.translate[id]) || id`。 */
export const MINION_NAMES = Object.freeze(
	Object.keys(MINIONS).reduce(function (acc, mid) {
		const n = MINIONS[mid] && MINIONS[mid].name;
		if (typeof n === "string" && n.trim()) acc[mid] = n;
		return acc;
	}, {})
);
/* 妖灵统一技（每只妖灵都带）：池悯（击杀者福利 · 仅挑战者方） */
export const MINION_COMMON_SKILLS = ["csh_boss_chi"];
/* ---------- 妖灵出场池（v6.1 · 50 只全随机 · 2026-10-15 作者定案） ----------
   ★ 作者指令原文：「精英不再只由希里担任妖灵，全部随机化」。
     于是游魂位（希里）的特殊地位**取消**：
       · 出场池 = MINIONS 全部 50 只（原 49 只随机池 + 希里的二分法作废）；
       · 三档抽取规则统一为「从全池随机、互不重复」——
         究极 2 只（座位 2/8）/ 霸主 1 只（座位 2）/ **精英 1 只（座位 2）**。
   ★ 抽取时机 = buildBossConfig() 每次调用（每次进入挑战模式重新洗牌）——
     同一会话内对局稳定，重进即换新组合。
   ★ 血量（同日作者定案）：**50 只统一 3 血**（含希里）——「难度可能过高」，
     妖灵从 4 血降到 3 血，单只存活轮数下降约 25%，直接降低清场压力。 */
export const MINION_POOL = [
	/* 六式（增幅魔王向） */
	"csh_boss_minion_eve", "csh_boss_minion_ada", "csh_boss_minion_tenten",
	"csh_boss_minion_empress", "csh_boss_minion_triss", "csh_boss_minion_fubuki",
	/* 十二美（压制挑战者向 · v5） */
	"csh_boss_minion_catherine", "csh_boss_minion_kaguya", "csh_boss_minion_zelda",
	"csh_boss_minion_angel", "csh_boss_minion_chunli", "csh_boss_minion_makima",
	"csh_boss_minion_ayasato", "csh_boss_minion_robin", "csh_boss_minion_emilia",
	"csh_boss_minion_ashe", "csh_boss_minion_frieren", "csh_boss_minion_tifa",
	/* 游魂位（v6.1 起并入随机池，不再固定给精英） */
	"csh_boss_minion_ciri",
	/* 第二十席 */
	"csh_boss_minion_sakura",
	/* v6 新批次（十卫 10 + 二十刑 20） */
	"csh_boss_minion_mai",
	"csh_boss_minion_android",
	"csh_boss_minion_ishtar",
	"csh_boss_minion_sarada",
	"csh_boss_minion_perona",
	"csh_boss_minion_guangxi",
	"csh_boss_minion_hachikuji",
	"csh_boss_minion_megumi",
	"csh_boss_minion_yoruichi",
	"csh_boss_minion_fortune",
	"csh_boss_minion_nilou",
	"csh_boss_minion_nami",
	"csh_boss_minion_konan",
	"csh_boss_minion_temari",
	"csh_boss_minion_tsukihi",
	"csh_boss_minion_liulibei",
	"csh_boss_minion_maisakura",
	"csh_boss_minion_ran",
	"csh_boss_minion_mui",
	"csh_boss_minion_tayama",
	"csh_boss_minion_wonder",
	"csh_boss_minion_yui",
	"csh_boss_minion_momo",
	"csh_boss_minion_fern",
	"csh_boss_minion_valentine",
	"csh_boss_minion_shinobu",
	"csh_boss_minion_yukino",
	"csh_boss_minion_luna",
	"csh_boss_minion_anne",
	"csh_boss_minion_oniko",
];
/* 全池 = MINIONS 键（顺序与 MINION_POOL 一致，门禁断言两者逐项相同） */
export function allMinionIds() { return MINION_POOL.slice(); }
export function pickMinions(tier, bounty) {
	/* v6.1：三档统一「全池随机、互不重复」。任何档位都可能抽到任意妖灵，
	   包括原先被锁死给精英的希里（作者指令：全部随机化）。
	   ★ 2026-10-17【指定讨伐令】（作者拍板 A 方案 · 1000 CBY）：第 2 参 bounty = 玩家悬赏的妖灵 id。
	     三重守卫，**随机逻辑本身一行未改**，只在入口加一条有守卫的分支：
	       ① 必须是池内合法 id（否则当没给，直接走原随机）；
	       ② 「未讨伐」由调用方（csh_bossrecord.bountyGet）判定后才传进来；
	       ③ 只影响「第一只」，究极档的第二只仍随机（不破坏搭配感）。 */
	const want = (typeof bounty === "string" && MINION_POOL.indexOf(bounty) >= 0) ? bounty : "";
	if (tier === "ultimate") {
		const pool = MINION_POOL.slice();
		let a;
		if (want) a = pool.splice(pool.indexOf(want), 1)[0];
		else a = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
		const b = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
		return { 2: a, 8: b };
	}
	if (tier === "lord" || tier === "elite") {
		if (want) return { 2: want };
		return { 2: MINION_POOL[Math.floor(Math.random() * MINION_POOL.length)] };
	}
	return null;
}

/* ---------- 通用技装配（v6.6 重构：四技**全员**，档位改由「每轮次数」表达） ----------
   ★ 为什么改（作者 2026-10-15 实机反馈：「常态没有魔怒和霸体，导致疯魔也没有正确发挥作用」）：
     旧构成表 = 究极 4 / 霸主 3（缺魔怒）/ 精英 2（缺霸体+魔怒）/ 彩蛋 1 —— 而【疯魔】
     装配在**全部 93 位**、文案却是"期间【魔怒】3 次 /【霸体】2 次" ⇒ 精英 51 + 彩蛋 4
     的【疯魔】是**只弹窗不做事的空技**，霸主只吃得到霸体那半。
   ★ 修法：四技全员装配，**强度阶梯移进次数表**（TIER_BATI_LIM / TIER_MONU_LIM）。
     这样【疯魔】那句"次数 +1"对 93 位**全部有效**，不再需要任何补偿机制。
   ★ 究极/霸主的手感保持不变（霸体 2/1 次、魔怒 3/2 次、魔息 4/3），只有精英与彩蛋是新增。 */
export const TIER_COMMON_SKILLS = {
	ultimate: ["csh_boss_mowei", "csh_boss_bati", "csh_boss_monu", "csh_boss_moxi"],
	lord: ["csh_boss_mowei", "csh_boss_bati", "csh_boss_monu", "csh_boss_moxi"],
	elite: ["csh_boss_mowei", "csh_boss_bati", "csh_boss_monu", "csh_boss_moxi"],
	egg: ["csh_boss_mowei", "csh_boss_bati", "csh_boss_monu", "csh_boss_moxi"],
};
/* ---------- 霸体 / 魔怒 的「每轮可用次数」（v6.6 新增 · 档位唯一强度旋钮） ----------
   · 霸体：每轮限 X 次，受到的 >1 点伤害 −1；
   · 魔怒：每轮限 X 次，受到伤害后来源流失**等同该伤害值**的体力（作者拍板：保原味，不降档）；
   · 疯魔：进入后两技各 +1 次（**全员都有技，所以对 93 位全部有效**）。
   ★ 手感备份旋钮：若低档实机过紧，把【魔怒】的 content 从"流失伤害值"改成"流失 1 点"即可，
     次数表不用动（此旋钮写在这里备查，不实装）。 */
export const TIER_BATI_LIM = { ultimate: 2, lord: 1, elite: 1, egg: 1 };
export const TIER_MONU_LIM = { ultimate: 3, lord: 2, elite: 1, egg: 1 };
/* 解封技例外（不装解封的档位/角色在 buildBossEntries 内判定） */
export const AWAKEN_SKILL = "csh_boss_xingmo";

/* ---------- 究极专属技（v3 · 7 份，名字全部避开原技能） ---------- */
export const ULTIMATE_SKILL = {
	csh_mlb: "csh_boss_fengmang",          // 吕布 · 锋芒（杀需双闪）
	csh_doudou: "csh_boss_tangying",       // 豆豆 · 躺赢（免死+随机敌方流失2）
	csh_realityfanghao: "csh_boss_tianming", // 方圣帝君 · 天命（判定三选一）
	csh_lr: "csh_boss_shuiyue",            // 蓝染 · 水月（杀目标随机转移；原技镜花+水月成对）
	csh_karl: "csh_boss_aoshu",            // 卡尔 · 奥术（全场锦囊→摸牌）
	csh_kuisangti: "csh_boss_huanxue",     // 奎桑提 · 换血（濒死与最高体力者换血）
	csh_yangjian: "csh_boss_mingtong",     // 杨间 · 冥瞳（回合开始获得每名角色一张随机手牌）
};

/* ---------- 角色元数据查询 ---------- */
const ID2SERIES = {};
for (const sk in SERIES) SERIES[sk].forEach(id => { ID2SERIES[id] = sk; });
const ID2TIER = {};
ULTIMATE.forEach(id => { ID2TIER[id] = "ultimate"; });
LORD.forEach(id => { ID2TIER[id] = "lord"; });
Object.keys(EGG).forEach(id => { ID2TIER[id] = "egg"; });

export function tierOf(id) { return ID2TIER[id] || "elite"; }
export function seriesOf(id) { return ID2SERIES[id] || null; }
export function seriesSkillOf(id) {
	const sk = seriesOf(id);
	return sk ? SERIES_SKILL[sk] : null;
}
/* 原角色 ID → 魔王 ID */
export function bossIdOf(id) { return "csh_boss_" + id.replace(/^csh_/, ""); }
/* 魔王 ID → 原角色 ID */
export function origIdOf(bid) { return "csh_" + bid.replace(/^csh_boss_/, ""); }

/* ---------- 血量三段口径（单点真值，检查器/构造器共用） ---------- */
/* 完全体 X：档位值（override / 彩蛋各自取值） */
export function fullHpOf(id) {
	const tier = tierOf(id);
	return TIER_HP_OVERRIDE[id] || (tier === "egg" ? EGG[id].hp : TIER_HP[tier]);
}
/* 是否装【醒魔】（逐步解封） */
export function growsOf(id) {
	const tier = tierOf(id);
	return !NO_AWAKEN.includes(id) && tier !== "egg" && !TIER_HP_OVERRIDE[id];
}
/* 开局血量：装解封者 = 40% 起点；不装者 = 完全体 X */
export function startHpOf(id) {
	return growsOf(id) ? TIER_HP_START[tierOf(id)] : fullHpOf(id);
}

/* ---------- 难度评分（v6.1 · 2026-10-15 作者需求：「可以给魔王的难度打分吗？百分制，
   无名杀本体的魔王也可以打分」） ----------
   ★ 纯函数、单点可调：输入只依赖本文件的数据表 + 一个可选的原角色基础技数。
   ★ 打分维度（全部来自已有的数据真值，不引入第二份手工评级）：
       · 档位基准（四档定位差）
       · 完全体血量 X（上限 32 —— 董卓/兀突骨 50 血属"厚"而非"强"，不无限放大）
       · 开局血量（40% 起点 → 前几轮的实际压力；上限 20 同理）
       · 重整次数（复活次数 = 变相血量）
       · 妖灵数量（究极 2 / 霸主 1 / 精英 1（v6.1） / 彩蛋 0）
       · 装配技数（原角色基础技 + 通用 + 系列/专属 + 醒魔 + 系统 + watch）
   ★ 分档（DIFF_BANDS）只用于展示文案；面板/页面一律显示原始分数，分数才是真值。
   ★ 校准锚点（v6.1 实测值）：究极 ≈ 94（S）· 霸主 ≈ 72（B）· 精英 ≈ 49（C）·
     彩蛋 ≈ 38（D）· 50 血特例（董卓/兀突骨）≈ 78（A）。 */
export const DIFF_BASE = { ultimate: 54, lord: 42, egg: 32, elite: 26 };
export const DIFF_BANDS = [
	{ min: 90, key: "S", name: "极难" },
	{ min: 75, key: "A", name: "难" },
	{ min: 58, key: "B", name: "适中" },
	{ min: 40, key: "C", name: "偏易" },
	{ min: 0, key: "D", name: "极易" },
];
export function diffBandOf(score) {
	for (const b of DIFF_BANDS) if (score >= b.min) return b;
	return DIFF_BANDS[DIFF_BANDS.length - 1];
}
/* 装配技数估算：base 缺省 4（原角色基础技的经验中位数） */
export function assembledSkillCount(id, base) {
	const tier = tierOf(id);
	let n = TIER_COMMON_SKILLS[tier].length + BOSS_SYSTEM_SKILLS.length + 1;   /* + csh_boss_watch */
	n += (typeof base === "number" && base >= 0) ? base : 4;
	if (tier === "ultimate" && ULTIMATE_SKILL[id]) n += 1;
	else if (tier === "egg") n += 1;
	else if (seriesSkillOf(id)) n += 1;
	if (growsOf(id)) n += 1;
	return n;
}
/* 魔王难度分（0~99 · 百分制口径） */
export function difficultyOf(id, baseSkillCount) {
	if (!id) return 0;
	const tier = tierOf(id);
	const X = Math.min(fullHpOf(id), 32);
	const start = Math.min(startHpOf(id), 20);
	const cz = TIER_CHONGZHENG[tier] || 0;
	const mn = tier === "ultimate" ? 2 : (tier === "egg" ? 0 : 1);
	const sk = assembledSkillCount(id, baseSkillCount);
	const raw = DIFF_BASE[tier] + (X - 8) * 0.55 + start * 0.25 + cz * 1.8 + mn * 4.5 + sk * 0.5;
	return Math.max(5, Math.min(99, Math.round(raw)));
}
/* 本体 / 他扩展 BOSS 的难度分（只有体力与技数两个可读量）——
   20 分底 + 体力 ×1.6 + 技数 ×3.2（两者都封顶，避免个别超模数据把分数拉到 99）。
   例：体力 5 / 6 技 ≈ 44（C）；体力 8 / 6 技 ≈ 52（C）；体力 10 / 7 技 ≈ 58（B）。 */
export function difficultyOfForeign(hp, skillCount) {
	const h = (typeof hp === "number" && hp > 0) ? Math.min(hp, 30) : 5;
	const sk = (typeof skillCount === "number" && skillCount > 0) ? Math.min(skillCount, 12) : 3;
	return Math.max(5, Math.min(99, Math.round(20 + h * 1.6 + sk * 3.2)));
}

/* ---------- 出场顺序（★键系统一：返回【魔王 ID】，与 entries/cfg/names 同键系 ----------
   v4.0.6 键系错配的根因修复：此前本函数返回原 ID（csh_mlb），而产物键为 boss ID
   （csh_boss_mlb）——bossmode 按原 ID 取 cfg 全部 miss → lib.boss 从未注入 →
   0 妖灵（4 人局）+ 魔王摸 8 / 称号 / 焦点 / forbidai 全部静默丢失。
   顺序 = 列表键序（前插）：究极 → 霸主 → 彩蛋 → 精英（各档内按系列序）。 ---------- */
export function allBossIds() {
	const bySeries = (list) => {
		const out = [];
		for (const sk in SERIES) out.push(...list.filter(id => seriesOf(id) === sk));
		return out;
	};
	return [
		...bySeries(ULTIMATE), ...bySeries(LORD), ...bySeries(Object.keys(EGG)), ...bySeries(idsOfTier("elite")),
	].map(bossIdOf);
}
function idsOfTier(t) {
	const out = [];
	for (const sk in SERIES) out.push(...SERIES[sk].filter(id => tierOf(id) === t));
	return out;
}
/* 名册全部原 ID（供隔离断言） */
export function allRosterIds() {
	return Object.keys(ID2TIER).concat(idsOfTier("elite")).filter((x, i, a) => a.indexOf(x) === i);
}
/* 魔王技主技 ID 总表（含妖灵技、专属技与 watch；子技由 boss.js 自带，门禁一并核对） */
export const MAIN_SKILLS = [
	/* 通用 */ "csh_boss_mowei", "csh_boss_bati", "csh_boss_monu", "csh_boss_moxi",
	/* 系列 */ "csh_boss_liezhen", "csh_boss_jingbian", "csh_boss_fushi", "csh_boss_huiliu",
	"csh_boss_fuying", "csh_boss_liaoyuan", "csh_boss_xingjian", "csh_boss_luanru",
	/* 彩蛋 */ "csh_boss_jianzhen", "csh_boss_jinji", "csh_boss_wobing", "csh_boss_bachong",
	/* 究极专属 */ "csh_boss_fengmang", "csh_boss_tangying", "csh_boss_tianming",
	"csh_boss_shuiyue", "csh_boss_aoshu", "csh_boss_huanxue", "csh_boss_mingtong",
	/* 妖灵 */ "csh_boss_ying_hunshi", "csh_boss_kan_guzao",
	"csh_boss_feng_fengshi", "csh_boss_lang_nongchao", "csh_boss_fen_yujin", "csh_boss_kui_qiansi",
	/* 通用-解封 */ "csh_boss_xingmo",
	/* 系统层（v4.2 → v6 收敛为 2 技，2026-10-15 作者指令删久战/记仇/征税） */
	"csh_boss_fengmo", "csh_boss_fanpu",
	/* 妖灵-池悯 */ "csh_boss_chi",
	/* 妖灵-游魂·残念 */ "csh_boss_you_cannian",
	/* 妖灵-十二美（v5 · 机制覆盖矩阵） */ "csh_boss_jinchi", "csh_boss_lengyan", "csh_boss_xiushi",
	"csh_boss_enze", "csh_boss_bailie", "csh_boss_zhipei", "csh_boss_jiangling", "csh_boss_huafu",
	"csh_boss_bingjie", "csh_boss_qianru", "csh_boss_qiannian", "csh_boss_yaoqi",
	/* 妖灵-第二十席（v5.1） */ "csh_boss_baihao",
	/* 记录 */ "csh_boss_watch",
	/* 记录-外传（批次 A · lib.skill.global 登记，捕获本体/他扩展 BOSS 阵亡） */ "csh_boss_watch_ext",
];

/* ---------- 索引兼容（v4 · 最小改动原则） ----------
   引擎多处按**数组索引**读取角色条目（optionsMenu.js:203 取 [3] 技能表、
   boss.js:109 列表血条取 [2]、player.init:2628、game/index.js:7758 势力标 [1]…）。
   本体角色定义为数组字面量（天然具备 [N]）；扩展角色（含本扩展）是对象形式——
   补上数字索引即可让 [N] 与 .属性 双通道可读，**不改变条目形态**。
   ★ 只对本扩展自己的条目生效，不触碰任何他方数据。 */
export function ensureIndex(info) {
	if (!info || typeof info !== "object" || Array.isArray(info)) return info;
	if (info.skills !== undefined && info[3] === undefined) info[3] = info.skills;
	if (info.sex !== undefined) info[0] = info.sex;
	if (info.group !== undefined) info[1] = info.group;
	/* ★ v6.6：info[2] 是"老式复合串"位，引擎的 get.infoHp / infoMaxHp / infoHujia 都从这里解析。
	   旧实现写的是**一个数字**（info.hp）⇒ 会把 maxHp、hujia 一并丢掉。
	   妖灵改成 3血/4上限/1甲 之后，这里必须写出 "3/3/1"，
	   否则所有走 [2] 的读取路径会把它当成 3/3/0（护甲凭空消失）。 */
	if (info.hp !== undefined) {
		const _mx = (typeof info.maxHp === "number") ? info.maxHp : info.hp;
		const _hj = (typeof info.hujia === "number") ? info.hujia : 0;
		info[2] = (_hj > 0 || _mx !== info.hp)
			? (info.hp + "/" + _mx + (_hj > 0 ? "/" + _hj : ""))
			: info.hp;
	}
	if (info.extraModeData !== undefined) info[5] = info.extraModeData;
	return info;
}

/* ---------- 模式配置（lib.boss）——纯静态，不依赖角色条目 ----------
   由 main/bossmode.js 在挑战模式注入；角色/译名/称号一律走
   character/boss.js 的原生 game.import 注册（引擎 loadCharacter 处理）。 */
export function buildBossConfig(bounty) {
	const cfg = {};
	for (const bid of allBossIds()) {
		const id = origIdOf(bid);
		const tier = tierOf(id);
		const c = { chongzheng: TIER_CHONGZHENG[tier], _csh_moxi: TIER_MOXI[tier], _csh_x: fullHpOf(id),
			_csh_bati_lim: TIER_BATI_LIM[tier], _csh_monu_lim: TIER_MONU_LIM[tier] };
		const minion = pickMinions(tier, bounty);        /* v5：随机搭配（每次生成重新洗牌）· 2026-10-17 带指定讨伐令 */
		if (minion) c.minion = minion;
		cfg[bid] = c;
	}
	return cfg;
}

/* ---------- 纯构造：魔王条目 + lib.boss 配置 + 出场顺序 ----------
   chars  = { 原id -> 原始角色条目 }——★必须传**扩展包原始数据**（pack.character.character），
            而不是 lib.character：引擎 loadExtension 时序 =【先 content、后 loadCharacter】，
            content 时点 lib.character 里还没有扩展角色。
   trans  = { 原id -> 中文名 }（pack.character.translate）
   titles = { 原id -> 称号 }（pack.character.characterTitle，可选）
   返回 { entries, cfg, order, names, titlesMap, entryCount, minionEntries, minionNames, minionImg }
   —— order 与 entries/cfg/names 全部为【魔王 ID】键系。 */
export function buildBossEntries(chars, trans, titles, bounty) {
	const entries = {};
	const cfg = {};
	const names = {};
	const titlesMap = {};
	const order = allBossIds();
	let entryCount = 0;
	for (const bid of order) {
		const id = origIdOf(bid);
		const src = chars && chars[id];
		if (!src) continue;                      /* 名册缺失由门禁兜底断言，构造侧跳过 */
		const tier = tierOf(id);
		/* v4 血量三段口径（单点函数 fullHpOf/growsOf/startHpOf）：
		   · X（完全体）= 档位值（override / 彩蛋各自取值）；
		   · 装【醒魔】者 → 以 40% 起点（TIER_HP_START）开局，每准备阶段 +1 至 X；
		   · 不装者（NO_AWAKEN 张飞/关索 · 彩蛋档 · 50 血特例）→ 直接以完全体 X 开局
		     （与董卓/兀突骨口径一致，避免"永不长大的 8 血残废"）。 */
		const grow = growsOf(id);
		const hp = startHpOf(id);
		const skills = (Array.isArray(src.skills) ? src.skills.slice() : []).concat(TIER_COMMON_SKILLS[tier]);
		const sSkill = seriesSkillOf(id);
		if (tier === "ultimate" && ULTIMATE_SKILL[id]) skills.push(ULTIMATE_SKILL[id]);
		else if (tier === "egg") skills.push(EGG[id].skill);
		else if (sSkill) skills.push(sSkill);
		if (grow) skills.push(AWAKEN_SKILL);
		skills.push(...BOSS_SYSTEM_SKILLS);            /* 系统层二技：疯魔/反扑（久战/记仇/征税已按作者指令删除 · 见文件头注释） */
		skills.push("csh_boss_watch");
		const group = BOSS_GROUP === "devil" ? "devil" : src.group;
		const entry = {
			sex: src.sex, group: group, groupInGuozhan: src.group,
			img: src.img || id, hp: hp, maxHp: hp,
			skills: skills,
			isBoss: true,
			/* v4 条目级隐藏：武将设置页（characterPackMenu.js:144）与选将池
			   （ui/create/index.js:1201）原生按 isUnseen 过滤——魔王不可作为普通武将出现；
			   ★ 选魔列表（boss.js 只认 isBoss）不受影响。 */
			isUnseen: true,
			extraModeData: src.group,
		};
		if (src.dieAudios) entry.dieAudios = src.dieAudios;
		entries[bid] = ensureIndex(entry);
		entryCount++;
		names[bid] = (trans && trans[id]) || id;
		const t0 = titles && titles[id];
		if (t0) titlesMap[bid] = t0;
		const c = { chongzheng: TIER_CHONGZHENG[tier], _csh_moxi: TIER_MOXI[tier], _csh_x: fullHpOf(id),
		_csh_bati_lim: TIER_BATI_LIM[tier], _csh_monu_lim: TIER_MONU_LIM[tier] };
		const minion = pickMinions(tier, bounty);        /* v5：随机搭配（每次生成重新洗牌）· 2026-10-17 带指定讨伐令 */
		if (minion) c.minion = minion;
		cfg[bid] = c;
	}
	const minionEntries = {};
	const minionNames = {};
	const minionImg = {};
	for (const mid in MINIONS) {
		const m = MINIONS[mid];
		/* ★ v6.7：补写 name —— 旧实现只把名字写进 translate（要等 loadCharacter），
		   导致 lib.character[妖灵].name 恒空（页面的第三级回退是死代码）。
		   引擎读不到的场景（懒人包/旧版）由此也能拿到中文名。 */
		minionEntries[mid] = ensureIndex({
			name: MINION_NAMES[mid] || mid,
			sex: m.sex, group: m.group, hp: m.hp, maxHp: (typeof m.maxHp === "number" ? m.maxHp : m.hp),
			hujia: (typeof m.hujia === "number" ? m.hujia : 0),
			skills: m.skills.concat(MINION_COMMON_SKILLS), isUnseen: true,
			img: m.img, face: m.face,
		});
		minionNames[mid] = MINION_NAMES[mid] || m.name;   /* 同源：character/boss.js 写进 lib.translate 的那份 */
		if (m.img) minionImg[mid] = m.img;
	}
	return {
		entries: entries, cfg: cfg, order: order, names: names, titlesMap: titlesMap,
		entryCount: entryCount, minionEntries: minionEntries, minionNames: minionNames, minionImg: minionImg,
	};
}

/* ---------- Node 侧自检（tools/check.js runBossChecks 直接调用） ---------- */
/* v4：作者定案移出魔王池的武将（仍在名册，可当挑战者） */
export const BOSS_EXCLUDED = ["csh_diaochan", "csh_youhabahe", "csh_gjs", "csh_shencaozhi", "csh_shenzhugeguo", "csh_zhuran"];

export function selfCheck(rosterIds) {
	const errs = [];
	const mine = allRosterIds();
	if (mine.length !== 93) errs.push("分配表总数 " + mine.length + " ≠ 93");
	const dup = mine.filter((x, i) => mine.indexOf(x) !== i);
	if (dup.length) errs.push("分配表重复: " + dup.join(","));
	const missing = rosterIds.filter(id => !mine.includes(id) && !BOSS_EXCLUDED.includes(id));
	if (missing.length) errs.push("名册有而分配表无: " + missing.join(","));
	const extra = mine.filter(id => !rosterIds.includes(id));
	if (extra.length) errs.push("分配表有而名册无: " + extra.join(","));
	const t = { ultimate: 0, lord: 0, egg: 0, elite: 0 };
	mine.forEach(id => t[tierOf(id)]++);
	if (t.ultimate !== 8 || t.lord !== 30 || t.egg !== 4 || t.elite !== 51) {
		errs.push("档位计数异常 " + JSON.stringify(t));
	}
	/* 键系统一断言：order 全部为 boss ID 且与 entries 构造循环同键 */
	const o = allBossIds();
	if (o.some(bid => !/^csh_boss_/.test(bid))) errs.push("allBossIds 存在非 boss ID 键");
	return errs;
}
