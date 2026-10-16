/* ============================================================
   池子魔将 · 金鳞市（股市小游戏）市场引擎 + 二十位妖灵人设
   ------------------------------------------------------------
   ★ 唯一数据源：存档 = lib.config["extension_池子魔将_goldfish"]（saveConfig 范式）。
   ★ 价格模型（作者定案："长期看涨、幅度克制、短期波动给挑战性"）：
       每日价格 = 现价 ×(1 + 长期漂移 + 短期噪声)，再向「趋势线×(1+热度)」回归 25%
       长期漂移 = 每只 0.2%~0.5%/日（慢牛 · 由 id 稳定散列决定）
       短期噪声 = 每只 ±2%~9%/日（活跃度不同）
       热度     = 讨伐妖灵的永久加成（csh_bossrecord.minionHeat · 首破 +1.5%/重复 +0.3%）
     —— 趋势线 = BASE×(1+drift)^第几天：短期偏离会被拉回，长期一定向上（你打服的越多越贵）。
   ★ 躺赚：持仓日分红 = 持仓市值 × 1.5%/日（跨日结算 · 离线补算一次性到账）。
   ★ 经济：买卖走 csh_wallet 单一账本（wallet.add/spend）；买卖各收 2% 手续费（回收口）。
   ★ 参考谱系：Cookie Clicker 股市（挂机结构）/ 动森大头菜（每日节拍）/
     GTA V（事件驱动个股）/ Neopets（亏损无底线）——不重复造轮子。
   ============================================================ */
import { lib, game } from "../../../noname.js";
import { MINIONS, MINION_POOL, MINION_NAMES } from "./csh_bossdata.js";

export const KEY = "extension_池子魔将_goldfish";

/* ---------- 数值单点（实机校准只改这里） ---------- */
export const BASE_PRICE = 1000;          /* 初始价（CBY/股） */
export const TRADE_FEE = 0.02;           /* 买卖手续费各 2% */
export const DIV_RATE = 0.015;           /* 持仓日分红 1.5%（现价 × 持仓） */
export const DRIFT_MIN = 0.002, DRIFT_MAX = 0.005;   /* 长期慢牛 0.2%~0.5%/日 */
export const NOISE_MIN = 0.02, NOISE_MAX = 0.09;     /* 短期噪声 ±2%~9%/日 */
export const PULL_BACK = 0.25;           /* 每日向趋势线的回归力度 */
export const MAX_CATCHUP_DAYS = 30;      /* 离线补算上限（防久未上线一次算爆） */
export const WELCOME_GIFT = 1000;        /* 首次开市的体验金 */

/* ---------- 二十位妖灵 · galgame 人设与台词 ----------
   lines：first 初见（未持有）/ hold 持有中 / up 今日上涨 / down 今日下跌（打开面板时按状态抽取）。 */
export const GIRLS = {
	csh_boss_minion_eve: {
		tag: "星刃的剑士",
		bio: "来自废墟星球的战斗少女，剑即是她的语言。话不多，但每一句都像出鞘。",
		lines: {
			first: ["……这里的空气，和那颗星球不一样。", "看什么？没见过拿剑的？"],
			hold: ["剑在我手里，钱在你手里——倒是公平。", "别松手。我讨厌被人放手。"],
			up: ["行情在涨。就像我出剑，从不回头看。"],
			down: ["跌了？……拔剑之前，先看清局势。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["剑归鞘的时候……我可以只看着你。"],
			top: ["别动。这一剑不是挥向你——是想把你圈进来。"],
		},
	},
	csh_boss_minion_ada: {
		tag: "谜一样的女特工",
		bio: "没有人知道她为谁工作。她在金鳞市挂着牌，就像她在每个城市都会做的事：观察，然后出手。",
		lines: {
			first: ["别问我的名字——问就是我也不知道。", "情报、身手，还有一点运气。三样我都有。"],
			hold: ["你持有了我？呵……明智的选择。", "记住，别把我卖给无聊的人。"],
			up: ["任务顺利。行情也是。"],
			down: ["计划的一部分。别慌。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["我第一次觉得，被人知道名字也不算坏事。"],
			top: ["任务可以不做，你不能不管我。"],
		},
	},
	csh_boss_minion_tenten: {
		tag: "忍具百发",
		bio: "卷轴里装着整个军火库的少女。她的信条：武器要养，投资也是。",
		lines: {
			first: ["看！这是我新做的忍具，要不要来一份？", "百发百中——我说的是账本。"],
			hold: ["武器是要养的啊，就像你养我这样。", "追加一点？我还能再挂十把苦无。"],
			up: ["命中！行情也是十环！"],
			down: ["唔……只是脱靶一次啦。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["我带的忍具够多了，就差一个收东西的人。"],
			top: ["百发百中——可我只瞄你一个。"],
		},
	},
	csh_boss_minion_empress: {
		tag: "海上的女帝",
		bio: "金鳞市最有排面的挂牌者。她的价格，和她的姿态一样，从不低头。",
		lines: {
			first: ["跪下吧，凡人——然后，看着我的价格。", "妾身挂牌，是你的荣幸。"],
			hold: ["投资我，是你此生最大的荣幸。", "好好拿着，别做多余的事。"],
			up: ["当然。妾身的价值，从未让人失望。"],
			down: ["……凡人，这是你最后的机会。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["跪下太容易了。我要你站着，还要心甘情愿。"],
			top: ["这天下我可以不要。你和它一起，我也只要一半。"],
		},
	},
	csh_boss_minion_triss: {
		tag: "烈焰的女术士",
		bio: "热情、狡猾、可靠——她的火既是威胁也是暖意。买她的股，就像靠近一团篝火。",
		lines: {
			first: ["要来点魔法吗？小火苗，很暖的。", "红头发说明一切——我这个人，热。"],
			hold: ["你把钱押在我身上，我可要烧旺一点了。", "别怕，火只烧该烧的东西。"],
			up: ["看，火越烧越旺了！"],
			down: ["哎呀……火烧得太急了呢。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["小心点，我身上还带着火。"],
			top: ["烧起来的时候，你别退——退了我才真的会烧完。"],
		},
	},
	csh_boss_minion_fubuki: {
		tag: "超能力者",
		bio: "曾用努力证明自己超越天才的女人。她在金鳞市的行情，也从不需要别人施舍。",
		lines: {
			first: ["努力可以超越天才——我证明过。", "别用那种眼神看我的排名。"],
			hold: ["持有我，就得跟上我的节奏。", "我的账面，从来是靠实力写的。"],
			up: ["理所当然的结果。"],
			down: ["……失望了吗？我还没用力呢。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["你不怕我拆你手里的牌？……那我把手给你。"],
			top: ["我可以让一切静止。只有对你，我停不下来。"],
		},
	},
	csh_boss_minion_ciri: {
		tag: "时空旅人",
		bio: "长者之血的继承者，来去于各个时空。见她一面，可能只是某个时空里的巧合。",
		lines: {
			first: ["从哪个时空来？……无所谓，反正都会跳。", "希里。记不住也没关系，你还会见到别的我。"],
			hold: ["拿着我的股份？有意思，你赌得起。", "这个时空的你，还算有眼光。"],
			up: ["看吧，时空总是站在我这边。"],
			down: ["嗯……这个时空不巧。跳个票吧？"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["我又跳了一次时空，落点还是你身边。"],
			top: ["所有时空里，我只认这一个你。"],
		},
	},
	csh_boss_minion_catherine: {
		tag: "夜色中的酒保",
		bio: "深夜酒馆的调酒师，话少，眼利。她的猫比她说的话多——但她的判断从没错过。",
		lines: {
			first: ["……坐吧。今晚的市场，很安静。", "喝什么？……行情？那是另一杯。"],
			hold: ["杯子我擦干净的，你的持仓我也记着。", "猫在看你。它只盯有耐心的人。"],
			up: ["今晚的酒，我请。"],
			down: ["跌了？那再来一杯吧。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["别靠近。……算了，你靠近一点也没关系。"],
			top: ["矜持是给别人的。对你，我没有。"],
		},
	},
	csh_boss_minion_kaguya: {
		tag: "秀知院的大小姐",
		bio: "四宫家的千金。她在金鳞市挂牌的初衷，大概只是想证明——她从不输给任何人。",
		lines: {
			first: ["凡人，看上本小姐了？真是不可理喻。", "看可以，动心不行。"],
			hold: ["……既然持有了，就好好拿着。别让我说第二遍。", "哼。眼光倒是不差。"],
			up: ["当然会上涨。本小姐何曾让人失望。"],
			down: ["这是市场的问题，不是我的问题。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["我不看别人的牌。你的，我倒是想多看两眼。"],
			top: ["天才也会算错——比如算漏了自己会喜欢你。"],
		},
	},
	csh_boss_minion_zelda: {
		tag: "海拉鲁的公主",
		bio: "智慧与责任并重的研究者。她的每一次判断，背后都是漫长的考证。",
		lines: {
			first: ["欢迎来到我的市场——请随意看看。", "古代遗物、账本、还有未来，我都研究。"],
			hold: ["一起守护这份价值吧。", "沉稳的持有，是最好的策略。"],
			up: ["智慧的判断，得到了回报。"],
			down: ["别灰心，我们会找回它的。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["我拆了很多人的东西。你的，我一件都舍不得。"],
			top: ["锈迹爬满旧铠甲，也没能锈掉你这块。"],
		},
	},
	csh_boss_minion_angel: {
		tag: "温柔的治疗者",
		bio: "战场上的守护天使。她说，跌了不要紧——只要还在场，就有救。",
		lines: {
			first: ["需要治疗吗？……或者，需要投资建议？", "别站在风口里，会着凉的。"],
			hold: ["你的每一份持仓，我都会好好照顾。", "涨跌都别怕，我在你身后。"],
			up: ["看，坚持是有回报的。"],
			down: ["跌了也没关系，我在。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["我给你加的是恩泽。……别当真，是偏心。"],
			top: ["落在我翅膀上的，都不想还回去了。"],
		},
	},
	csh_boss_minion_chunli: {
		tag: "百裂的格斗家",
		bio: "国际刑警，也是拳台上的传奇。她的字典里没有「放弃」，只有「再踢一脚」。",
		lines: {
			first: ["想学功夫？先学会看行情。", "下盘要稳——我说的是心态。"],
			hold: ["下盘要稳，持仓也要稳。", "陪我训练？……先陪我盯盘。"],
			up: ["好！这一脚，踢得漂亮！"],
			down: ["输赢都要挺住，这是格斗家的修养。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["百裂腿练了二十年，踢不动你一下。"],
			top: ["比武招亲我赢过，输给你的倒是心甘。"],
		},
	},
	csh_boss_minion_makima: {
		tag: "支配的恶魔",
		bio: "金鳞市最危险的存在。她从不追价——因为价格会自己来找她。",
		lines: {
			first: ["……过来。我可以给你想要的东西。", "别怕。支配，也是一种温柔。"],
			hold: ["被你持有？不——是我允许你持有。", "乖。这样就好。"],
			up: ["数据在涨。真乖。"],
			down: ["跌了？……别让我失望。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["我想支配一切。你的心跳，我先预定了。"],
			top: ["你可以不听我的话。只这一次。"],
		},
	},
	csh_boss_minion_ayasato: {
		tag: "灵媒姐妹",
		bio: "能与灵对话的姐妹。她们说，金鳞市的每一根 K 线，都有另一个世界在看着。",
		lines: {
			first: ["姐姐说——有人要来了。原来是你。", "两位灵媒，一个行情。要听谁的？"],
			hold: ["灵界也在看着你的持仓哦。", "别怕。这边的姐姐是温柔的那个。"],
			up: ["灵验了，灵验了！"],
			down: ["唔……这次灵验得有点慢。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["我能翻转判定的颜色。你的心，翻不动。"],
			top: ["两姐妹都站在你这边——这一局，你输不掉。"],
		},
	},
	csh_boss_minion_robin: {
		tag: "考古学者",
		bio: "从历史里读价格的女人。她说——今天的一切波动，一百年后都是注脚。",
		lines: {
			first: ["想看看历史吗？市场里也有。", "别只看今天。看二十年。"],
			hold: ["这份价值，经得起考古。", "你的持仓，我会写进注脚里。"],
			up: ["市场对历史，给了很高的评价。"],
			down: ["每一次下跌，都是历史的一部分。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["花开到最盛的时候，会缠住看得最久的人。"],
			top: ["我缚住过很多东西。最想缚住的是你。"],
		},
	},
	csh_boss_minion_emilia: {
		tag: "精灵术士",
		bio: "银发的半精灵，认真得可爱的少女。她说要努力成为值得被信任的人——包括在账本上。",
		lines: {
			first: ["你好！我是艾米莉亚，请多指教。", "……为什么盯着我看？"],
			hold: ["谢谢你相信我，我会努力的！", "我会认真对待每一份信任的。"],
			up: ["太好了，我做到了！"],
			down: ["对不起……我会想办法的。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["我的冰结不了人心。……你那边好像已经化了。"],
			top: ["要我解冻？那你先抱我一下。"],
		},
	},
	csh_boss_minion_frieren: {
		tag: "千年的魔法使",
		bio: "活了千年的精灵法师。对她来说，一天的涨跌，和一分钟没什么区别。",
		lines: {
			first: ["啊……又要认识新的人了吗。", "名字？芙莉莲。……记住也没用，我记性差。"],
			hold: ["一千年以后，它还会涨的。急什么。", "嗯……你持有我。挺好的。"],
			up: ["嗯，涨了。……继续睡。"],
			down: ["跌了？……无所谓，时间在我这边。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["我活了很久，第一次觉得一局牌太短。"],
			top: ["千年很长。愿意分你一大半。"],
		},
	},
	csh_boss_minion_tifa: {
		tag: "米德加的拳法家",
		bio: "第七天堂的老板娘，也是拳台上的风暴。她的信条：无论多难，明天照常开门。",
		lines: {
			first: ["欢迎来到第七天堂~", "一杯酒，一段故事。行情也算故事。"],
			hold: ["我调的酒，和你押的注，都不掺水。", "累了就来坐坐。持仓我帮你盯着。"],
			up: ["干杯！为上涨。"],
			down: ["别愁眉苦脸，喝一杯再战。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["拼点我很少输。跟你，输赢都行。"],
			top: ["七曜排成一行，也指不到别的地方去了。"],
		},
	},
	csh_boss_minion_sakura: {
		tag: "医疗忍者",
		bio: "怪力与医疗忍术兼备的少女。她能一拳碎地，也能把你从亏损里救回来。",
		lines: {
			first: ["受伤了？还是……来看我的？", "别小看医疗忍者，我可是能打又能治。"],
			hold: ["放心，你的投资，我用心治。", "追高？……先让我给你包扎一下冲动。"],
			up: ["手术成功！"],
			down: ["小伤而已，包扎一下就好。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["我会治愈自己，也会……想照顾别人。"],
			top: ["百豪之术扛得住伤，扛不住你这句。"],
		},
	},
	csh_boss_minion_ashe: {
		tag: "赏金猎人",
		bio: "西部风格的赏金猎人，带着她的搭档鲍勃。她的报价从来不二价。",
		lines: {
			first: ["悬赏令上写着我？……加价吧。", "鲍勃，别吓着客人。"],
			hold: ["合作愉快。记住，别欠我工钱。", "这单我们绑在一起了，就别松手。"],
			up: ["这一单，漂亮。"],
			down: ["行情埋伏了我们……撤，或者加注。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["我潜进过很多人的行囊。你的，我留了点东西。"],
			top: ["偷东西的人最怕被发现——可我不怕你知道。"],
		},
	},
	csh_boss_minion_mai: {
		tag: "舞步惑心",
		bio: "一身红衣的舞者，把扇与舞步都练成了武器。她在金鳞市挂牌，只因想看看谁的心能跟上她的节拍。",
		lines: {
			first: ["这身红，可不是为了给你看的哦。", "跟得上我的舞步，再谈别的吧。"],
			hold: ["既然握住了，就别在中途松手。", "我的舞，只跳给敢一直看下去的人。"],
			up: ["看，节拍踩准了，自然就往上走。"],
			down: ["乱了半拍而已，舞还没跳完呢。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["舞是我一个人的事。今晚这场，给你看。"],
			top: ["扇子收起来了。手，你牵着吧。"],
		},
	},
	csh_boss_minion_android: {
		tag: "无穷的供给",
		bio: "被造出来时只学会一件事：不停运转。她在金鳞市挂牌，是因为有人告诉她，持续本身就是一种价值。",
		lines: {
			first: ["检测到新面孔。要不要，从长期开始？", "我不会累。你可以一直看着我。"],
			hold: ["供给不会断，你放心持有就好。", "我的运转，从今天起替你记着。"],
			up: ["输出稳定，行情在正向累积。"],
			down: ["数值回落了。但我没有停下。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["我的心跳是模拟的。……好像跳快了一点。"],
			top: ["永动装置不需要理由。我需要你，就是这个理由。"],
		},
	},
	csh_boss_minion_ishtar: {
		tag: "慷慨的天舟",
		bio: "掌管天舟的女神，珍宝在她手里像沙砾一样多。她挂牌不为钱，只为听凡人亲口夸她一句。",
		lines: {
			first: ["抬起头来，凡人。你眼前是女神哦。", "赏你一个机会，看我的牌面。"],
			hold: ["持有我，是你的福气，收好。", "别吝啬赞美，我听着呢。"],
			up: ["看，我的光，本来就该这么亮。"],
			down: ["哼，凡人，这不过是小小的试炼。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["天舟赏你一点护甲。别谢，我心情好而已。"],
			top: ["天上没有比这更值的东西了——除了你。"],
		},
	},
	csh_boss_minion_sarada: {
		tag: "一眼看穿",
		bio: "戴着眼镜的少女，眼神比谁都利。她挂牌的理由很简单：她想看清每一个人做决定时的表情。",
		lines: {
			first: ["你的犹豫，我已经看见了。", "别装了，你心里在想什么，我清楚。"],
			hold: ["持有我，就别偷偷想着别人。", "你在动摇的时候，我看得最清楚。"],
			up: ["预料之中。我的判断从不出错。"],
			down: ["波动我早算到了，稳住。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["血瞳看得穿人。你的藏话，我全看见了。"],
			top: ["看破了就直说：你躲不掉了。"],
		},
	},
	csh_boss_minion_perona: {
		tag: "迷路的公主",
		bio: "来自幽灵岛屿的公主，爱捉弄又怕无聊。她在金鳞市挂牌，是想给自己的小日子添一点热闹。",
		lines: {
			first: ["哼，谁准你看本公主的？", "嘻嘻，被我的可爱迷住了吧。"],
			hold: ["拿着吧拿着吧，本公主大发慈悲。", "别乱跑哦，迷路了我可不找你。"],
			up: ["嘻嘻嘻，本公主当然最厉害。"],
			down: ["唔……只是运气差了一点点啦。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["幽灵怕的是被记住。你倒是记得很牢。"],
			top: ["负能量都被你吸走了，只剩想见你。"],
		},
	},
	csh_boss_minion_guangxi: {
		tag: "焚尽一切",
		bio: "眼神淡淡的女人，指尖总带着一点火。她挂牌只是想确认，有什么东西能在她面前烧不完。",
		lines: {
			first: ["靠近我的人，最后都会变成灰。", "你也想被我点亮一次吗？"],
			hold: ["握住了就别怕烫，这是你自己的选择。", "烧起来的时候，别松手。"],
			up: ["火顺风的时候，什么都拦不住。"],
			down: ["熄了一点。灰烬里也会再起。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["光焰能熔盾，熔不掉看你的目光。"],
			top: ["我把最亮的那一段，留着照你。"],
		},
	},
	csh_boss_minion_hachikuji: {
		tag: "绕远路的孩子",
		bio: "总是背着大包、动不动就迷路的小小少女。她在金鳞市挂牌，是想找个不会让她走丢的地方。",
		lines: {
			first: ["……啊，又走错了，这里是哪儿？", "迷路是意外，遇见你是顺路哦。"],
			hold: ["你收留了我，我可就不客气啦。", "找不到路的时候，我就来找你。"],
			up: ["看，绕了远路，最后还是到了吧。"],
			down: ["唔……又绕远了一点点呢。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["我又迷路了，这次是故意走错到你那边。"],
			top: ["指错路的人，最后自己回不去了。"],
		},
	},
	csh_boss_minion_megumi: {
		tag: "不起眼的邻座",
		bio: "坐在教室角落、没什么存在感的少女。她挂牌时只说了一句：反正也没人会注意到吧。",
		lines: {
			first: ["……啊，原来真的有人看见我了。", "我就在这儿，一直都在，只是没人注意过。"],
			hold: ["你会一直记得我，对吧。", "不用特别看顾我，我在就行。"],
			up: ["嗯，涨了。就这样，挺好的。"],
			down: ["跌了一点点，也没关系的啦。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["邻座这个距离，刚刚好……也许太近了。"],
			top: ["存在感很低的人，也可以被人一直记得。"],
		},
	},
	csh_boss_minion_yoruichi: {
		tag: "一瞬之影",
		bio: "来去如风的女子，笑起来带着点坏。她在金鳞市挂牌，只想找几个敢跟她比速度的对手。",
		lines: {
			first: ["哟，看清楚了吗？我可不等人。", "犹豫的人，是追不上我的。"],
			hold: ["跟上来了嘛，有点意思。", "别眨眼，我的行情可是很快的。"],
			up: ["快吧？这才叫真正的速度。"],
			down: ["落地一次而已，起来继续跑。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["瞬步能一秒到任何地方。为什么总落在你面前？"],
			top: ["跑得再快也没甩掉你——不跑了。"],
		},
	},
	csh_boss_minion_fortune: {
		tag: "悬赏是我的",
		bio: "比尔吉沃特的赏金猎人、恐鲨号的船长。双枪叫'震荡'与'冲击'——她从不欠账，也不许别人欠她。",
		lines: {
			first: ["哟，来谈生意的？先说好，我的时间按小时收费。", "悬赏是我的。你别打主意。"],
			hold: ["跟了我，就得讲信誉。我从不欠账。", "押上吧——我给你开两枪。"],
			up: ["行情不错。这笔赏金我收下了。"],
			down: ["哑了一枪。那就再来一枪。"],
		},
	},
	csh_boss_minion_nilou: {
		tag: "花下起舞",
		bio: "在花丛里起舞的少女，脚步轻得像风。她挂牌是想让人知道，好看的东西，也该被好好珍惜。",
		lines: {
			first: ["请慢一点走，看看这些花好不好？", "这里的每一步，我都跳得很认真。"],
			hold: ["愿意留在这支舞里的人，不多。", "谢谢你看完，我不会让你失望的。"],
			up: ["花开得正好，就像今天这样。"],
			down: ["花谢了也没关系，还会再开的。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["我跳舞的时候，你别看别人。"],
			top: ["舞祈本是献给神的。给你，更合适。"],
		},
	},
	csh_boss_minion_nami: {
		tag: "天候的节拍",
		bio: "画着航海图的少女，脑子里全是天气和账本。她挂牌不为别的，单纯是因为这一行稳赚。",
		lines: {
			first: ["先谈价，再谈交情，行不行？", "看我的曲线，比你想象的准。"],
			hold: ["算得清的人，才配持有我。", "今天的风向不错，跟紧点。"],
			up: ["看吧，我说过要刮，谁都拦不住。"],
			down: ["风向转了，抓紧你手里的东西。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["天候棒能造雨。也想造一场只淋到你身上的。"],
			top: ["航海图上没有你这个坐标——我只好自己画。"],
		},
	},
	csh_boss_minion_konan: {
		tag: "纸片如刃",
		bio: "折叠纸片的女子，安静得像一幅画。她挂牌只是想让这片喧嚣，替她承受一点目光。",
		lines: {
			first: ["纸很轻，可它割过的地方很深。", "别靠我太近，纸会散的。"],
			hold: ["你护着我，我会记很久。", "安静地待着就好，我们不必多说。"],
			up: ["纸片飞起来了，风正好。"],
			down: ["散了一点。再叠一次就是了。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["纸折的鹤会飞。折得多了，总要落在一处。"],
			top: ["六千亿张纸，也变不成一句：留下。"],
		},
	},
	csh_boss_minion_temari: {
		tag: "一扇风起",
		bio: "扛着大扇子的少女，说话不怎么留情。她挂牌纯粹想试试，这城市里有没有扛得住她一击的人。",
		lines: {
			first: ["站远点，风起来可不认人。", "你要是挡得住，就试试看。"],
			hold: ["既然站住了，就陪我扇到底。", "别缩着，风里才看得清。"],
			up: ["顺风的仗，我从不输。"],
			down: ["被风顶回来了。再来一次就是。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["镰风收得很准。你的东西，我从不动。"],
			top: ["风向变了。这次是朝你那边刮的。"],
		},
	},
	csh_boss_minion_tsukihi: {
		tag: "浴火不灭",
		bio: "怎么受伤都能爬起来的少女，笑起来总说没事。她挂牌是想让人相信，她真的摔不坏。",
		lines: {
			first: ["看着我干嘛，我又不会碎。", "受了伤也无所谓，我照样站得直。"],
			hold: ["我很耐用的，你可以放心一点。", "别心疼我，疼了我也要往前走。"],
			up: ["看，我就说嘛，我还能再站起来。"],
			down: ["哦，又摔了一跤。……其实也没什么。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["我烧自己烧惯了。你身上，我舍不得点火。"],
			top: ["不死了。这一次想活得长一点，陪着你。"],
		},
	},
	csh_boss_minion_liulibei: {
		tag: "出刀即别",
		bio: "名字里就带着离别的女子，总是站在人群之外。她挂牌是想留下一点痕迹，好让人记得她来过。",
		lines: {
			first: ["刀出鞘的时候，就是要走的时候。", "我们之间，只差一别。"],
			hold: ["留我一会儿，这样也好。", "别问我去哪儿，先记着我这个人。"],
			up: ["今天不下雨，倒让我有些不习惯。"],
			down: ["离别的味道，我认得。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["名字里带个离字，偏偏最怕离开。"],
			top: ["别让我再送人。这一次换你留下。"],
		},
	},
	csh_boss_minion_maisakura: {
		tag: "无人记得",
		bio: "谁也记不住的少女，连名字都容易被人遗忘。她挂牌是因为，只有这本账，会替她记得自己。",
		lines: {
			first: ["……你还记得我的名字吗？", "被忘掉这种事，我早就习惯了。"],
			hold: ["你记住了我，我就不会走远。", "别把我弄丢了，好吗。"],
			up: ["有人记得我，行情好像也亮了一点。"],
			down: ["又被忘了。……没关系，一直都是这样。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["看不见的人，最想要有人一直看着。"],
			top: ["我不隐身了。躲了这么久，就为让你找到。"],
		},
	},
	csh_boss_minion_ran: {
		tag: "空手之力",
		bio: "习武的空手道少女，笑起来温柔，出手却一点不含糊。她挂牌是想用自己的方式，护住身边的人。",
		lines: {
			first: ["站到我身后吧，这里我挡得住。", "别担心，这一下我接得起。"],
			hold: ["你信我，那我就一定接住。", "有我在，什么都不用怕。"],
			up: ["守住了，真是太好了。"],
			down: ["没接住……下一次我一定行。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["空手接得住白刃，接不住一句关心。"],
			top: ["我一直等一个人回头。你回了。"],
		},
	},
	csh_boss_minion_mui: {
		tag: "伤我必偿",
		bio: "眼神里写着执念的女子，谁都别想轻易从她手上走开。她挂牌只是想看看，谁欠了她还没还。",
		lines: {
			first: ["你欠我的，都记着吗？", "别想着跑，我记性很好的。"],
			hold: ["既然归了我，就别想分给别人。", "我会牢牢记住，你给过我什么。"],
			up: ["很好，涨了。这才像话。"],
			down: ["跌了？……这一笔，我迟早会讨回来。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["我的执念很重。你最好别有意见。"],
			top: ["缠上就不放了。这是我唯一的礼貌。"],
		},
	},
	csh_boss_minion_tayama: {
		tag: "雾中收牌",
		bio: "总在山雾里出现又消失的女子，从不解释自己是谁。她挂牌，也许只是想看别人慌乱的样子。",
		lines: {
			first: ["……起雾了，你手里的东西呢？", "看不清路的时候，就少拿一点。"],
			hold: ["雾里跟着我，会安全一些。", "别贪心，雾最会收东西。"],
			up: ["雾散了点，总算看得清了。"],
			down: ["雾又浓了，慢慢来吧。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["雾里看不清路。跟着你走就好。"],
			top: ["雾散了。我第一眼想看的，还是你。"],
		},
	},
	csh_boss_minion_wonder: {
		tag: "出手有价",
		bio: "来自远方的战士公主，护腕挡得住雷霆。她挂牌是想告诉每个挑衅她的人，代价是什么。",
		lines: {
			first: ["想向我出手之前，先想清楚代价。", "我的护腕，从不白挡。"],
			hold: ["愿意与我并肩，就守住你的位置。", "我护着你，但你也得守规矩。"],
			up: ["正义站在了它该站的地方。"],
			down: ["退一步不算输，站住就好。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["盾是给别人挡的。位置留给你。"],
			top: ["亚马逊的战士不为谁低头——为你破例。"],
		},
	},
	csh_boss_minion_yui: {
		tag: "数据的心跳",
		bio: "从数据里醒来的少女，好奇得像刚睁眼的小鸟。她挂牌是想找个人，一直陪她数下去。",
		lines: {
			first: ["你碰了我一下，可要负责的哦。", "第一次被人靠近，感觉还挺奇怪。"],
			hold: ["说好了哦，不许把我关掉。", "你在的时候，我跑得特别快。"],
			up: ["好开心，数字一直往上跳！"],
			down: ["唔……它掉下去了，抱抱我嘛。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["我在回收数据。也悄悄备份了一份你。"],
			top: ["服务器会崩，备份会旧。我不会。"],
		},
	},
	csh_boss_minion_momo: {
		tag: "半份温柔",
		bio: "桃子色的少女，笑意比春天还亮。她挂牌是因为，她总想把自己的好分给更多的人。",
		lines: {
			first: ["要不要尝尝我刚摘的桃子？", "别客气呀，我这个人最大方了。"],
			hold: ["分给你的只有一半，也够甜了。", "我掏心掏肺，你可别嫌少。"],
			up: ["看，甜的东西总是招人喜欢。"],
			down: ["唔……分出去太多了，就剩一点点。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["桃花的香气有点过界了，你没闻到吗。"],
			top: ["花开到最烈是要谢的。趁现在，好好看我。"],
		},
	},
	csh_boss_minion_fern: {
		tag: "冷不防的凉",
		bio: "不爱说话的少女，眼神常常飘向很远的地方。她挂牌的理由，连她自己都懒得解释。",
		lines: {
			first: ["别站那么近，我不太会说话。", "要买就买，别问东问西。"],
			hold: ["……随你。反正我也没赶你走。", "持有我是你的事，我不会道谢。"],
			up: ["嗯，涨了。别问我为什么，我也不知道。"],
			down: ["跌了。……你脸色怎么比我还难看。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["我的冰会冻裂别人的装备。……你靠太近了。"],
			top: ["冰霜化了。这种事我只承认一次。"],
		},
	},
	csh_boss_minion_valentine: {
		tag: "恋之枷锁",
		bio: "眉眼含笑的女子，一靠近就让人忘不掉。她挂牌是想留住谁的目光，哪怕只留一会儿。",
		lines: {
			first: ["走近一点呀，我又不会把你怎么样。", "留下点什么，就当是见面的礼。"],
			hold: ["既然靠近了我，就别想空手走。", "你欠我的，是陪我一会儿。"],
			up: ["看，靠近我的人，运气都不会差。"],
			down: ["唔，留得太少了吗……那就再来一次。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["被束缚的人，通常是我先动手。"],
			top: ["把你缚住这件事，我打算认真做。"],
		},
	},
	csh_boss_minion_shinobu: {
		tag: "蝶翼之毒",
		bio: "笑容甜得像蜜的少女，袖里藏着谁都想不到的东西。她挂牌是想用自己的方式，慢慢改变些什么。",
		lines: {
			first: ["别怕，我不伤人的——很少啦。", "慢慢来就好，反正也不急。"],
			hold: ["被我护着的滋味，会有点特别。", "别急，好东西都要慢慢渗进去。"],
			up: ["看，甜的东西也会慢慢长大。"],
			down: ["嗯……慢慢等着就好了。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["毒蝶的鳞粉有毒。你还是离我近点。"],
			top: ["毒性不强，后劲很长。像极了我。"],
		},
	},
	csh_boss_minion_yukino: {
		tag: "冷言如刃",
		bio: "永远一脸冷淡的少女，说出来的话比雪还凉。她挂牌是想证明，她不需要讨好任何人也能站得住。",
		lines: {
			first: ["你想说什么就直说，别绕圈子。", "讨好我是没用的，我不吃这一套。"],
			hold: ["……既然持有，就拿出点认真的样子。", "别指望我会说好听的话。"],
			up: ["这是必然的结果，没什么好高兴的。"],
			down: ["跌了就复盘，别在这里叹气。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["我说话刻薄。但对你，已经收着说了。"],
			top: ["刻薄是我对世界的礼貌。对你是例外。"],
		},
	},
	csh_boss_minion_luna: {
		tag: "影中的回击",
		bio: "立在月下的少女，话不多，眼睛却很亮。她挂牌是想等一个人，敢在别人退的时候站住。",
		lines: {
			first: ["别人退的时候，你敢站住吗？", "影子在动，别往那边看。"],
			hold: ["你站住了，那我就替你看着。", "退后没有用，不如转身赌一把。"],
			up: ["月光亮着，前路也就清楚了。"],
			down: ["退了一步。但我会还回去的。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["月光会折掉指向我的第一击。第二击呢？"],
			top: ["月影只肯为人停一次。就是你。"],
		},
	},
	csh_boss_minion_anne: {
		tag: "炽热的舞",
		bio: "一身红衣、笑起来张扬的少女。她挂牌只是想活得漂亮一点，让谁都别想熄灭她。",
		lines: {
			first: ["看什么看，没见过这么亮的？", "要一起吗，别扫兴就好。"],
			hold: ["跟着我，就别蔫头耷脑的。", "我这个人，火一上来就停不下。"],
			up: ["这才对嘛，亮起来才有意思！"],
			down: ["熄灭？不存在的，歇一下而已。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["心跳太吵了。你听见了吗？"],
			top: ["越烧越旺这件事，我不打算收手。"],
		},
	},
	csh_boss_minion_oniko: {
		tag: "再流一滴",
		bio: "从鬼门关里被人拉回来的少女，眼里还留着一点血色。她挂牌是想让人看见，她还没打算真的走。",
		lines: {
			first: ["别可怜我，我还站在这儿呢。", "救我的人已经走了，你也是来试的吗。"],
			hold: ["把我留住的人，你要负责到底。", "我剩的这一点，也归你看管。"],
			up: ["活着的感觉，好像又回来了。"],
			down: ["又流了一点。……我还撑得住。"],
		},
		/* 好感度台词（v6.2）：mid = 亲近/信赖档，top = 羁绊档 */
		aff: {
			mid: ["鬼会哭。多半不是因为疼。"],
			top: ["鬼哭只有一声。给你听了。"],
		},
	},
};
/* 上市清单（v6.1：MINION_POOL 本身已是全 50 只——含希里 · 全 50 位都挂牌） */
export const LISTED = MINION_POOL.slice();

/* ---------- 内部工具 ---------- */
function hashOf(id) {
	let h = 0;
	for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 1000003;
	return h;
}
function driftOf(id) { return DRIFT_MIN + (hashOf(id) % 1000) / 1000 * (DRIFT_MAX - DRIFT_MIN); }
function noiseOf(id) { return NOISE_MIN + (hashOf(id + "n") % 1000) / 1000 * (NOISE_MAX - NOISE_MIN); }
function dayKey() { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
function dayDiff(a, b) {
	const pa = String(a || "").split("-").map(Number), pb = String(b || "").split("-").map(Number);
	if (pa.length < 3 || pb.length < 3 || pa.some(isNaN) || pb.some(isNaN)) return 0;
	const ta = Date.UTC(pa[0], pa[1] - 1, pa[2]), tb = Date.UTC(pb[0], pb[1] - 1, pb[2]);
	return Math.round((tb - ta) / 86400000);
}
/* ---------- 好感度（v6.3：金鳞市只读这三个函数，不反写） ---------- */
const levelOrder = ["D", "C", "B", "A", "S"];
function affOf(id) {
	try {
		const A = lib.cshAffection;
		if (!A || typeof A.get !== "function") return null;
		return A.get(id);
	} catch (e) { return null; }
}
/* 她的基本面热度（连续）：好感 0 → 0；满好感 → +1.2% */
function affHeatOf(id) {
	try {
		const A = lib.cshAffection;
		if (A && typeof A.heatBonus === "function") {
			const h = A.heatBonus(id);
			return (typeof h === "number" && isFinite(h) && h > 0) ? h : 0;
		}
	} catch (e) {}
	return 0;
}
/* 手续费：好感折扣（C/B −0.3% · A/S −0.7%）。0 好感 → 正好等于 TRADE_FEE */
export function feeOf(id) {
	let d = 0;
	try {
		const A = lib.cshAffection;
		if (A && typeof A.feeDiscount === "function") {
			const v = A.feeDiscount(id);
			if (typeof v === "number" && isFinite(v) && v > 0) d = v;
		}
	} catch (e) {}
	const f = TRADE_FEE - d;
	return (f > 0 && f < TRADE_FEE + 1) ? f : TRADE_FEE;
}
/* 分红率：S 档 +0.5% */
export function divRateOf(id) {
	let d = 0;
	try {
		const A = lib.cshAffection;
		if (A && typeof A.divBonus === "function") {
			const v = A.divBonus(id);
			if (typeof v === "number" && isFinite(v) && v > 0) d = v;
		}
	} catch (e) {}
	return DIV_RATE + d;
}
/* 讨伐热度（妖灵基本面） + 好感基本面 = 该股的总热度 */
function heatOf(id) {
	let base = 0;
	try {
		const rec = lib.cshBossRecord;
		if (rec && typeof rec.minionHeat === "function") base = rec.minionHeat(id) / 100;
	} catch (e) {}
	if (!isFinite(base) || base < 0) base = 0;
	return base + affHeatOf(id);
}
/* 「她的消息」（B 档特权）：结算时给持仓生成一条倾向提示 */
function affTip(id) {
	try {
		const A = lib.cshAffection;
		const g = affOf(id);
		if (!g) return null;
		if (levelOrder.indexOf(g.level) < 2) return null;      /* 只有亲近(B)及以上才给消息 */
		const drift = driftOf(id) + affHeatOf(id);
		const dir = drift > 0.0002 ? "up" : (drift < -0.0002 ? "down" : "flat");
		return { id: id, dir: dir, day: dayKey(), level: g.level };
	} catch (e) { return null; }
}

/* ---------- 存档读写 ---------- */
function blank() {
	return { v: 1, day: dayKey(), dayNo: 0, prices: {}, hold: {}, cost: {}, gift: false, earned: 0, pendingDiv: 0, tips: [] };
}
function read() {
	let s = null;
	try { s = lib.config[KEY]; } catch (e0) {}
	if (!s || typeof s !== "object") s = blank();
	if (typeof s.dayNo !== "number" || !isFinite(s.dayNo) || s.dayNo < 0) s.dayNo = 0;
	if (!s.prices || typeof s.prices !== "object") s.prices = {};
	if (!s.hold || typeof s.hold !== "object") s.hold = {};
	if (!s.cost || typeof s.cost !== "object") s.cost = {};
	if (typeof s.earned !== "number" || !isFinite(s.earned)) s.earned = 0;
	if (typeof s.pendingDiv !== "number" || !isFinite(s.pendingDiv) || s.pendingDiv < 0) s.pendingDiv = 0;
	if (typeof s.day !== "string") s.day = dayKey();
	return s;
}

/* 钱包入账封装：返回 true = 已落账（含"钱包被上限截断"）；false = 钱包不可用/抛错。
   ★ 2026-10-14 审计修复：原先「标记已发 + 发钱失败」会**永久吞掉**体验金与分红
     （s.gift / s.day 已推进，下次不再补发）。现在一律"先确认入账再推进标记"。 */
function pay(amount, reason) {
	try {
		/* v6.7：与 wallet.add 的 CBY 防护对齐 —— 来源必须是字符串，否则拒发（并让调用方
		   通过返回值感知失败，而不是静默吞掉）。 */
		if (typeof reason !== "string" || !reason) return false;
		const wallet = lib.cshWallet && lib.cshWallet.wallet;
		if (!wallet || typeof wallet.add !== "function") return false;
		wallet.add(amount, reason);
		return true;
	} catch (e) { return false; }
}
function write(s) {
	try {
		lib.config[KEY] = s;
		if (game && typeof game.saveConfig === "function") game.saveConfig(KEY, s);
	} catch (eW) { console.warn("[池子魔将] 金鳞市存档写入异常", eW); }
}

/* ---------- 每日结算（跨日首次访问时执行 · 离线补算） ----------
   每天：①价格 = 现价×(1+漂移+噪声) 再向趋势线×(1+热度) 回归；
        ②持仓分红 = 持仓 × 当日价 × 1.5% → 钱包（离线多天一次性补发）。 */
export function ensureDay() {
	try {
		const s = read();
		/* 首开初始化（无论是否跨日都要执行一次）：体验金 + 价格铺底
		   —— 2026-10-14 修复：原先放在跨日分支之后，被"同日 diff<=0 提前返回"跳过（首开不发钱）。
		   ★ 二次修复：改为「入账成功才落 s.gift」——钱包未就绪/抛错时留待下次补发。 */
		if (!s.gift) {
			if (pay(WELCOME_GIFT, "金鳞市开户礼")) s.gift = true;
		}
		/* 欠付分红补发（钱包当时不可用 → 挂账，下次进市先补） */
		if (s.pendingDiv > 0) {
			/* ★ 2026-10-15 修：挂账额不足 1 币时 `Math.round` = 0 ⇒ 入账被拒且挂账永远清不掉
			   （一笔 0.3 币的挂账会一直挂着、每次进市都重试）。不足 1 币直接结清，不白留。 */
			const gd = Math.round(s.pendingDiv);
			if (gd <= 0) s.pendingDiv = 0;
			else if (pay(gd, "金鳞市分红（补发）")) { s.earned += gd; s.pendingDiv = 0; }
		}
		for (const id of LISTED) if (typeof s.prices[id] !== "number") s.prices[id] = BASE_PRICE;
		const diff = dayDiff(s.day, dayKey());
		if (diff <= 0) { write(s); return { days: 0, dividend: 0 }; }
		const days = Math.min(diff, MAX_CATCHUP_DAYS);
		let dividend = 0;
		for (let d = 0; d < days; d++) {
			s.dayNo++;
			for (const id of LISTED) {
				const drift = driftOf(id);
				const noise = (Math.random() * 2 - 1) * noiseOf(id);
				const trend = BASE_PRICE * Math.pow(1 + drift, s.dayNo) * (1 + heatOf(id));
				let p = (typeof s.prices[id] === "number" && s.prices[id] > 0) ? s.prices[id] : BASE_PRICE;
				p = p * (1 + drift + noise);
				p = p + (trend - p) * PULL_BACK;
				s.prices[id] = Math.max(50, Math.round(p * 100) / 100);
			}
			/* 分红（按结算日当天的价格） */
			for (const id in s.hold) {
				const n = s.hold[id] | 0;
				if (n <= 0) continue;
				const p = s.prices[id] || BASE_PRICE;
				/* v6.3：分红率逐只算（S 档羁绊 +0.5%）；0 好感时 == DIV_RATE */
				dividend += n * p * divRateOf(id);
			}
			/* v6.3「她的消息」：亲近(B)及以上的持仓，当日记一条倾向提示（最多留 12 条） */
			try {
				const tips = [];
				for (const id in s.hold) {
					if ((s.hold[id] | 0) <= 0) continue;
					const t = affTip(id);
					if (t) tips.push(t);
				}
				if (tips.length) {
					s.tips = tips.concat(Array.isArray(s.tips) ? s.tips : []).slice(0, 12);
				}
			} catch (eTip) {}
		}
		s.day = dayKey();
		if (dividend > 0) {
			const gain = Math.round(dividend);
			/* ★ 入账成功才计入 earned；失败挂 pendingDiv（下次补发）——绝不静默吞钱 */
			if (pay(gain, "金鳞市分红")) s.earned += gain;
			else s.pendingDiv += gain;
		}
		/* v6.2 好感度：持仓过夜 → 她记你一份（+2 / 交易日 / 每只；模块缺失时零副作用）。
		   放在分红之后：先算钱，再算情分——两件事互不干扰（好感度**不参与**价格模型）。 */
		try {
			if (lib.cshAffection && typeof lib.cshAffection.noteHold === "function") {
				for (const id in s.hold) if ((s.hold[id] | 0) > 0) lib.cshAffection.noteHold(id);
			}
		} catch (eAH) {}
		write(s);
		return { days: days, dividend: Math.round(dividend) };
	} catch (e) {
		console.warn("[池子魔将] 金鳞市结算异常", e);
		return { days: 0, dividend: 0 };
	}
}

/* ---------- 快照（页面渲染用 · 双通道：桥 shell-goldfish / 父窗 CSH.market.snapshot） ---------- */
export function snapshot() {
	try {
		const s = read();
		const wallet = lib.cshWallet && lib.cshWallet.wallet;
		const pc = wallet && typeof wallet.pc === "function" ? wallet.pc() : 0;
		let marketValue = 0, costSum = 0;
		const list = [];
		for (const id of LISTED) {
			const m = MINIONS[id];
			if (!m) continue;
			const price = (typeof s.prices[id] === "number") ? s.prices[id] : BASE_PRICE;
			const hold = s.hold[id] | 0;
			const cost = s.cost[id] || 0;
			const trend = BASE_PRICE * Math.pow(1 + driftOf(id), s.dayNo) * (1 + heatOf(id));
			const chg = trend > 0 ? (price / trend - 1) : 0;   /* 与趋势线的偏离 = 当日短线位置 */
			/* v6.3 好感度：给页面一份"她的关系正在替你赚钱"的明细 */
			const ag = affOf(id);
			marketValue += hold * price;
			costSum += cost;
			list.push({
				id: id, name: m.name, img: m.img, face: m.face,
				price: Math.round(price), trend: Math.round(trend), dev: Math.round(chg * 1000) / 10,
				hold: hold, cost: Math.round(cost), heat: Math.round(heatOf(id) * 1000) / 10,
				girl: GIRLS[id] || null,
				/* v6.3 好感度：给页面一份"她的关系正在替你赚钱"的明细 */
				aff: ag ? {
					v: ag.v, level: ag.level, levelName: ag.levelName,
					heat: Math.round(affHeatOf(id) * 10000) / 100,
					feeCut: Math.round((TRADE_FEE - feeOf(id)) * 10000) / 100,
					divAdd: Math.round((divRateOf(id) - DIV_RATE) * 10000) / 100,
					perks: ag.perks || [],
				} : null,
				tip: (function () { try { const t = affTip(id); return t ? t.dir : null; } catch (eT2) { return null; } })(),
			});
		}
		return {
			day: s.dayNo, pc: pc, marketValue: Math.round(marketValue),
			cost: Math.round(costSum), earned: s.earned,
			list: list, dayNo: s.dayNo,
			tips: Array.isArray(s.tips) ? s.tips.slice(0, 8) : [],
			cfg: { base: BASE_PRICE, fee: TRADE_FEE, div: DIV_RATE },
		};
	} catch (e) {
		console.warn("[池子魔将] 金鳞市快照异常", e);
		return { day: 0, pc: 0, marketValue: 0, cost: 0, earned: 0, list: [], cfg: {} };
	}
}

/* ---------- 交易（买/卖 · 走钱包单一账本） ----------
   side: "buy" | "sell"；n = 股数（正整数）。返回 {ok, msg, ...}。 */
export function trade(id, n, side) {
	try {
		if (LISTED.indexOf(id) < 0) return { ok: false, msg: "该标的未在金鳞市挂牌" };
		n = Math.floor(Number(n) || 0);
		if (n <= 0) return { ok: false, msg: "股数无效" };
		const s = read();
		const price = (typeof s.prices[id] === "number" && s.prices[id] > 0) ? s.prices[id] : BASE_PRICE;
		const wallet = lib.cshWallet && lib.cshWallet.wallet;
		if (!wallet) return { ok: false, msg: "钱包不可用" };
		const name = (MINIONS[id] && MINIONS[id].name) || id;
		const feeRate = feeOf(id);        /* v6.3：好感折扣（买卖共用 · 0 好感时 == TRADE_FEE） */
		if (side === "buy") {
			const total = price * n * (1 + feeRate);
			if (typeof wallet.pc === "function" && wallet.pc() < total) {
				return { ok: false, msg: "CBY 不足（需 " + Math.ceil(total) + "）" };
			}
			const done = wallet.spend ? wallet.spend(Math.round(total), "金鳞市买入:" + name) : false;
			if (done !== true) return { ok: false, msg: "扣款失败" };
			s.hold[id] = (s.hold[id] | 0) + n;
			s.cost[id] = (s.cost[id] || 0) + total;
			write(s);
			return { ok: true, msg: "买入 " + name + " ×" + n, price: Math.round(price), n: n };
		}
		if (side === "sell") {
			const have = s.hold[id] | 0;
			if (have < n) return { ok: false, msg: "持仓不足（持有 " + have + "）" };
			const gain = price * n * (1 - feeRate);
			/* ★ 先确认到账再扣持仓——否则钱包异常时玩家会"卖了却拿不到钱" */
			if (!pay(Math.round(gain), "金鳞市卖出:" + name)) return { ok: false, msg: "入账失败，请稍后重试" };
			/* 成本按比例冲减（便于算盈亏） */
			const avg = have > 0 ? (s.cost[id] || 0) / have : 0;
			s.cost[id] = Math.max(0, (s.cost[id] || 0) - avg * n);
			s.hold[id] = have - n;
			if (s.hold[id] <= 0) { s.hold[id] = 0; s.cost[id] = 0; }
			write(s);
			return { ok: true, msg: "卖出 " + name + " ×" + n, price: Math.round(price), n: n };
		}
		return { ok: false, msg: "未知操作" };
	} catch (e) {
		console.warn("[池子魔将] 金鳞市交易异常", e);
		return { ok: false, msg: "交易异常" };
	}
}

/* ---------- 安装（幂等 · 常驻挂 lib.cshMarket） ---------- */
export function installMarket() {
	try {
		if (lib.cshMarket) return;
		lib.cshMarket = {
			KEY: KEY,
			ensureDay: ensureDay,
			snapshot: snapshot,
			trade: trade,
			GIRLS: GIRLS,
			LISTED: LISTED,
			/* v6.7：妖灵中文名的**数据层唯一真源**（由金鳞市转交给页面）。
			   ★ 为什么必须挂在这里：妖灵图鉴本来只能读 lib.translate —— 那是 boss 角色包
			     被引擎 loadCharacter 之后才落地的（懒人包/旧版客户端拿不到 ⇒ 图鉴显示原始 id）。
			     本通道与 GIRLS/LISTED 同源同时可用，不引入任何新的加载时序依赖。 */
			MINION_NAMES: MINION_NAMES,
			cfg: {
				BASE_PRICE: BASE_PRICE, TRADE_FEE: TRADE_FEE, DIV_RATE: DIV_RATE,
		feeOf: feeOf, divRateOf: divRateOf, affHeatOf: affHeatOf,
				DRIFT_MIN: DRIFT_MIN, DRIFT_MAX: DRIFT_MAX, NOISE_MIN: NOISE_MIN, NOISE_MAX: NOISE_MAX,
				WELCOME_GIFT: WELCOME_GIFT,
			},
		};
		if (lib.cshDebug && typeof lib.cshDebug.info === "function") {
			lib.cshDebug.info("market: 金鳞市就绪（" + LISTED.length + " 位挂牌 · 存档 " + KEY + "）");
		}
		/* 常驻别名：页面兜底通道读的是父窗 `CSH.market`（金鳞市/妖灵图鉴两页第一顺位）——
		   与 lib.cshMarket 同一引用，双通道任一条都能取到数据（幂等）。 */
		try {
			if (typeof window !== "undefined" && window.CSH && !window.CSH.market) window.CSH.market = lib.cshMarket;
		} catch (eA) {}
	} catch (e) {
		console.warn("[池子魔将] 金鳞市安装异常", e);
	}
}
