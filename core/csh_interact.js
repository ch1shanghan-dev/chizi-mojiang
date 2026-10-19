import { lib, game, ui, get, _status } from "../../../noname.js";
import EXTRA_LINES from "./csh_interact_lines.js";
import GEN_LINES from "./csh_interact_lines_gen.js";
// 池子魔将 · 池子互动（AI 交互表情）
//
// 纯表现层子功能：AI 在特定时机对队友送鲜花或酒杯、对敌人砸鸡蛋或扔拖鞋。
// 发送方必须是 AI；接收方可以是 AI，也可以是玩家本人（AI 对玩家砸蛋、给玩家送花都支持）。
// 不摸牌、不掉血、不改 AI 决策、不写影响结算的 storage。
//
// ★ 表现层一律复用引擎既有实现，不自己造动画。
//   引擎已经有完整的一套：player.throwEmotion(target, name) —— 内部走 game.broadcastAll，
//   自动处理飞行弹道、旋转、命中图替换、节点销毁、录像回放、联机各端同步，
//   图片与音效也由引擎从主程序素材目录读取。
//   所以本文件只负责「什么时候、谁对谁、发哪一个」，表现层一行 player.throwEmotion 解决。
//
//   禁止以下写法（上一版实现踩过这个坑，务必不要重犯）：
//     × 用 CSS @keyframes / transform 自己写弹道动画
//     × 用 Web Audio / AudioContext 合成音效
//     × 自己写粒子效果、命中特效
//     × 自己 new Image() 加载外链图包
//     × 把表现层拆进 csh_emote.js 之类的独立表现模块
//
// 引擎约束（务必先读）：
// 1. 全局技能的 content 会被 StepCompiler 反编译后用 new Function 重建，
//    闭包变量、模块作用域变量全部失效。所以每个 content 只做一件事——转调 lib.cshInteract.*。
// 2. 同一个反编译过程还会往函数体注入这些变量名：
//    step / source / target / targets / card / cards / skill / forced / num / result。
//    content 内部不要再用这些名字声明局部变量，本文件统一用 from / to / tgt 之类。
// 3. filter 是直接调用（lib/index.js 11055），不受反编译限制，但仍统一转调，保持风格一致。
// 4. 本文件不自己写 game.broadcastAll —— 引擎的 throwEmotion 内部已经包好了，
//    联机各端同步、函数体闭包限制都由引擎处理，调用方不需要操心。
// 5. dieAfter 触发时角色已是 dead 状态，会被 lib/index.js 11018 的 isDead 判断拦下，
//    必须给技能加 forceDie: true；同处的 isOut 判断则用 forceOut: true 兜底。

(function () {
	if (lib.cshInteract) return;

	// ---------- 配置键 ----------
	var KEY = {
		enable: "extension_池子魔将_csh_interact",
		rate: "extension_池子魔将_csh_interact_rate",
		chat: "extension_池子魔将_csh_interact_chat",
		online: "extension_池子魔将_csh_interact_online",
		custom: "extension_池子魔将_csh_interact_custom",
	};

	// ---------- 参数 ----------
	// 频率档位：phase 触发概率 / 其他触发器的基础概率系数
	var RATE = {
		low: { phase: 0.04, scale: 0.5 },
		normal: { phase: 0.08, scale: 1 },
		high: { phase: 0.15, scale: 1.6 },
	};
	// 各触发器基础概率。整体克制：8 人局 normal 档下平均每轮约 1-2 次。
	var BASE = { start: 0.12, damage: 0.18, recover: 0.25, allyDie: 0.2 };
	// 表情池，重复项即权重。只保留鲜花、酒杯、鸡蛋、拖鞋四种。
	var POOL = {
		ally: ["flower", "flower", "flower", "wine"],
		enemy: ["egg", "egg", "egg", "shoe"],
		neutral: ["flower", "wine"],
	};
	// 附带台词
	// 垃圾话词典总原则（2026-09-28 用户定的调）：
	//   · 参考「就这？」「急了」的网络对线味——短、快、有梗；
	//   · 不越界：零脏字、不涉人身/家人/外貌/地域、不阴阳过度，收得住；
	//   · 不真垃圾：每句都值得对面看完翻白眼，而不是尴尬。
	// 词典分类清单（单一来源）：customLines / getCustom / mergedLines 共用，
	// 新增分类只改这一处，避免三处硬编码数组走失。
	var CATS = ["flower", "wine", "egg", "shoe", "eggHard", "relentless", "lowHp", "hurtSelf", "ctrl", "rivalry", "memHit", "memSaved", "memHitBack", "assistHit", "assistPraise", "crowd", "hitBack", "win", "lose", "dying", "rescue", "judge", "equip", "grudge"];
	var LINES = {
		flower: [
			"多谢", "好兄弟", "干得漂亮", "这波稳", "军师厉害", "大腿抱紧了",
			"配合默契", "还得是你", "稳住别浪", "有内味了", "今天必赢", "这局稳了",
			"有你真好", "神队友", "带飞了", "这波给满分", "稳住我们能赢", "队友靠谱",
			"神仙操作", "学到了", "全靠你", "太稳了", "这把有你稳了", "配合绝了",
			"给你点个赞", "这局稳了兄弟", "大神带带我", "服了服了", "666", "漂亮",
			"这手我服", "真心佩服", "顶你", "好活", "关键先生", "节奏大师",
			"稳如泰山", "这波不亏", "打得漂亮", "心态真好", "向你学习",
			"有你在安心", "细节拉满", "教科书级", "神之一手", "服气",
			"跟你走", "听你的", "靠谱兄弟", "有排面",
		],
		wine: [
			"敬你一杯", "痛快", "先干为敬", "满饮此杯", "感情深一口闷", "以茶代酒也行",
			"胜似闲庭信步", "共图大业", "敬英雄", "为胜利干杯", "举杯同庆", "豪气干云",
			"这杯敬你", "干了这杯", "兄弟情谊深", "痛快痛快", "一醉方休", "酒逢知己",
			"先敬为敬", "不醉不归", "为这局干杯", "胜局当饮", "把酒言欢", "痛饮庆功酒",
			"这杯你得喝", "敬你的操作", "豪杰当饮", "为你满上", "同饮一杯",
			"胜者当饮", "快意恩仇", "痛快至极", "敬一杯好局", "酒逢对手",
			"好酒好局", "这一口干了", "敬这波配合", "一饮而尽", "杯莫停",
			"豪饮三百杯", "敬你三分", "这酒不烈", "共饮此杯", "对影成三人",
			"举杯邀明月", "痛饮三杯", "醉卧沙场君莫笑", "酒壮英雄胆", "再敬一杯",
			"愿你常胜",
		],
		egg: [
			/* 轻调侃档（2026-10-06 拆档）：第一次接触对方只用轻的——
			   此前"大意了吧/回去多练练"这类重话第一次就甩出去，就是"尬"的根源之一。 */
			"吃我一蛋", "给你加个蛋", "接稳了", "蛋到人到", "准头不错吧", "小场面",
			"手感不错啊", "这波不亏", "谢谢送分", "承让承让", "先来一发", "开胃菜",
			"预热一下", "友情投喂", "补补钙", "手滑了别介意", "试试手感", "量量距离",
			"抛物线不错吧", "白送一个", "别浪费", "加个餐", "热身运动", "签到成功",
			"日常投喂", "礼尚往来", "轻拿轻放", "新出炉的", "趁热", "接好咯",
			"免费试用", "先来后到", "例行公事", "常规输出",
		],
		// 重攻击档（2026-10-06 拆档）：对同一人砸到第 3~4 次才启用——
		// 恩怨 ≥8 之后由 grudge 狠话档接管，优先级更高。
		eggHard: [
			"就这？", "急了急了", "我笑了", "这也能中？", "回去多练练", "就这水平",
			"想什么呢", "还没睡醒吧", "你行你上", "认清差距", "再来一次", "就这点能耐",
			"我还没出力", "你认真的吗", "急了急了真急了", "操作变形了", "看好了我只示范一次",
			"血赚血赚", "这也叫操作？", "回去睡吧", "我先手了", "习惯就好", "这波记住了",
			"多喝热水", "我已经很客气了", "大意了吧", "下把见", "别太嚣张", "别浪了",
			"稳住别破防", "让你先手又如何",
		],
		shoe: [
			"拖鞋伺候", "送你一鞋", "服不服", "39 码合金款",
			"尺码合适吗", "免费抛光", "接鞋要稳", "不好意思手滑",
			"鞋底还挺干净", "回头记得还我", "这鞋有点沉", "新鞋开光",
			"试穿一下", "合脚不", "别躲", "拖鞋大法好",
			"接住别掉", "限量款", "尺码偏大", "加急配送",
			"鞋到了签收", "一脚定乾坤", "轻拿轻放", "包邮到家",
			"鞋已送达", "请签收", "43 码定制", "量个尺码",
			"这双有点新", "鞋跟朝上", "小心脚趾", "防滑款",
			"空运加急", "鞋到付款", "别嫌味大", "刚擦过的",
			"这鞋你见过", "认得出来吗", "鞋带没系", "当场验货",
			"鞋底有印章", "落款在此", "加厚款", "换季促销",
			"买一送一", "鞋比人快", "一脚到位", "签收不退",
			"查收快递", "鞋盒留个念",
		],
		// ---------- 以下为 2026-09-29 新增触发点词典 ----------
		// 终局：胜方发言（谁赢谁说话）
		win: [
			"承让了", "多谢指教", "这局我收下了", "经验到手",
			"下一局继续", "打得不错", "承蒙关照", "侥幸赢了",
			"状态在线", "节奏在我这边", "稳了", "这波不亏",
			"多练练就好", "记住这一局", "后会有期", "再战一局",
			"谢了兄弟", "运气也是实力", "不客气", "赢在细节",
		],
		// 终局：败方发言
		lose: [
			"再来一局", "这局是我的", "下次不会再输", "记下了",
			"运气差点", "手感不在", "让你一局", "下回见真章",
			"这波我认", "输得明白", "学到一手", "下次还你",
			"别高兴太早", "一局而已", "有来有回", "我还能打",
			"手滑了", "失误失误", "再来", "不甘心啊",
		],
		// 濒死：呼救（自己血量告急时朝场上喊）
		dying: [
			"救我一下", "来人啊", "要没了要没了", "撑不住了",
			"谁还有牌", "快拉我一把", "别看着啊", "血量告急",
			"医一下", "还有没有救", "我这就没了？", "快救我",
			"顶不住了", "招呼一声啊", "还有一口气",
		],
		// 获救：答谢（从濒死被拉回来后）
		rescue: [
			"多谢救命", "这条命记下了", "还好有你", "大恩不言谢",
			"来得真及时", "谢过", "欠你一次", "救命恩人",
			"多亏你", "记你一份人情",
		],
		// 判定：牌运吐槽
		judge: [
			"这判定？", "牌运不济", "算我倒霉", "天要亡我",
			"这都能翻车", "红桃在哪", "黑桃也行啊", "手气太差",
			"出人意料", "也算合理", "认命了", "再等机会",
			"就这么难吗", "牌面不给力", "运气差了点",
		],
		// 装备：被顺/被弃吐槽
		equip: [
			"我的装备", "这也要抢？", "还我装备", "装备没保住",
			"刚到手就没了", "顺走我的刀", "连装备都不放过", "太狠了吧",
			"装备告急", "赤手空拳了", "我的兵器", "拆我装备",
			"抢装备算什么本事", "留一件给我", "装备被顺走了",
		],
		// 狠话档（2026-10-01 恩怨接线）：恩怨 ≥ 8 时，砸蛋/砸鞋后的台词升级为狠话
		grudge: [
			"这次我们好好算账", "你等着，这仇我记下了", "新仇旧账一起算",
			"我忍你很久了", "今天非得收拾你", "让你嚣张了这么久",
			"迟早把你打服", "这梁子结下了", "别想就这么算了",
			"血债血偿", "旧账未清又添新账", "你逃不掉的",
			"看你能撑到几时", "这笔账迟早要还", "我会一直盯着你",
		],
		// ---------- 2026-10-06 情境词典（丰富化第一批）----------
		// relentless：对同一目标本局已砸 ≥3 次 —— 升级句（第 1~2 次走普通池，
		//   连着砸还一个说法就成了复读机；次数账在 pairTimes，见 situCat）。
		relentless: [
			"还接？那就再来", "今天跟你杠上了", "我这就没停过",
			"你躲一个试试", "别数了，数不过来", "专砸你一个",
			"这缘分，又见面了", "接着接着，管够",
		],
		// lowHp：挨了打，但出手的人自己也只剩 1 血站场 —— 补刀嘲讽。
		//   台词知道牌局事实，才算"真人吵起来"（引擎原句：就这？—— 得有语境才成立）。
		lowHp: [
			"就这？你自己也没血了", "一血的也好意思出手", "咱俩半斤八两",
			"你先担心担心自己", "一站一躺，谁也别笑谁", "这血量还挺横",
			"来啊，反正你也扛不住", "一换一我也不亏",
		],
		// hurtSelf（2026-10-09 语境化）：自己重伤时的自嘲/硬撑 —— 代替
		// 回合开始随机社交里的「得意闲聊」。血条见底还说"这局稳了"，出戏。
		hurtSelf: [
			"还剩一口气，继续", "这点血，够用", "血条红了而已，稳住",
			"别看我，我还站得住", "一血翻盘才是名场面", "扶我起来，还能打",
			"血少事多，都小心点", "疼，但是不慌", "这状态也敢横着走", "别送人头啊各位",
		],
		// ctrl（2026-10-09 语境化）：判定区挂着乐不思蜀/兵粮寸断/闪电时的吐槽 ——
		// 被控的回合轮不到行动，此前会说"大意了吧"一类得意话，非常出戏（作者 2026-10-06 反馈）。
		ctrl: [
			"乐不思蜀是吧，行", "兵粮寸断？我饱着呢", "闪电你劈准点",
			"判定区常驻嘉宾就是我", "又来？判定区包月了", "行，你们慢慢乐",
			"被控了，憋屈", "这回合做观众", "等我出去再算账", "锦囊是这么用的？学到了",
			"谁放的，站出来", "我记下了啊",
		],
		// rivalry：世界宿敌（交手 ≥25 局）同桌开场 —— 不用砸蛋，见面就有火气。
		rivalry: [
			"又是你，老对手", "今天分个高下", "交手这么多次，还没分出胜负",
			"老熟人了，手下不留情", "你我的账，牌桌上算", "可算又碰上了",
			"老规矩，谁怕谁", "这桌就属咱俩有故事",
		],
		// ---------- 2026-10-06 第二批：记忆 / 帮腔 / 围观 ----------
		// memHit：被这人砸过，这次轮到我出手 —— 引用旧账（记忆感的核心）。
		// {t} 会在发送时替换成对方名字；对面是玩家本人时替换成「你」。
		memHit: [
			"上次那颗蛋，现在还你了", "旧账，连本带利", "{t}，还记得刚才吗？这就叫礼尚往来",
			"先收利息", "那笔账清一点是一点", "你砸我的，我可记着呢",
			"一蛋一蛋还", "上回的账，今天算", "礼尚往来懂不懂",
			"这笔利息不低", "上次没躲开，这次你也别躲", "来而不往非礼也",
		],
		// memSaved：这人刚救过我 —— 再互动时先谢恩。
		memSaved: [
			"刚才那条命是你给的", "救命之恩，无以为报", "你救的我，记着呢",
			"刚拉了我一把，谢了", "这份情，牌桌上还", "刚捡回一条命，谢谢你",
			"还欠你一条命", "恩情记下了",
		],
		// memHitBack：我回过嘴，这人又砸 —— 记忆升级。
		memHitBack: [
			"还来？行，继续记", "又来，脸皮够厚", "记性不错啊你",
			"我说过会记着的", "越砸越来劲？", "行，旧账又厚一页",
			"接着记，我不嫌多", "你这是自投罗网",
		],
		// assistHit：队友/旁观者帮腔怼挑衅者 —— 冲突有了观众才像真的。
		assistHit: [
			"别欺负人", "{t}你过分了啊", "一群人打一个？", "{t}你收敛点",
			"欺负人还上瘾了？", "有点风度行吗", "{t}你手别这么脏",
			"过分了啊", "欺负老实人？", "都看着呢", "{t}你悠着点",
			"做人留一线", "别把人往死里得罪", "嚣张给谁看",
			"行了你", "{t}你差不多得了", "这么大怨气？", "有完没完",
		],
		// assistPraise：围观夸救场/配合。
		assistPraise: [
			"漂亮，就该这么救", "这波支援到位", "好兄弟，稳",
			"关键时刻还得是你", "这口奶讲究", "救场如救神",
			"功劳簿记你一笔", "团队之光", "这份情记下了", "配合满分",
		],
		// crowd：有人倒下时的看热闹旁白（不出手，只说话）。
		crowd: [
			"要出事了", "这波要凉", "快看快看", "有人要交代了",
			"牌桌要变天", "啧啧啧", "好戏来了", "这谁顶得住",
			"绷不住了", "名场面",
		],
	};

	/* 鞋类组合生成器（2026-10-06 → 2026-10-09 精简）：
	   v1 是 34~46 码全尺码 × 13 个配送话术 = 169 句的笛卡尔积 —— 尺码堆叠没有信息量，
	   同质化的主要来源之一。v2 改为**每个配送话术配 2 个确定性尺码**（26 句）：
	   话术梗才是笑点，尺码只是佐料；确定性哈希保证同版本下每次生成结果一致。
	   台词扩充的范式：往 CATS/LINES 里加就是纯数据，量再大也不动逻辑。 */
	(function () {
		var tails = ["加急配送", "包邮到家", "已发货", "请签收", "货到付款", "轻拿轻放",
			"当场验货", "先试后砸", "限量补货", "空运直达", "免运费", "七天无理由", "售后找我"];
		for (var j = 0; j < tails.length; j++) {
			var s1 = 35 + ((j * 7 + 3) % 12);
			var s2 = 35 + ((j * 5 + 8) % 12);
			LINES.shoe.push(s1 + " 码" + tails[j]);
			if (s2 !== s1) LINES.shoe.push(s2 + " 码" + tails[j]);
		}
	})();
	// 垃圾话回嘴词典（2026-09-28 新增）：被砸蛋/拖鞋的 AI 有概率当场回一句，
	// 形成「挑衅 → 回嘴」的对话感。回嘴走 player.chat，不抛表情、不升级冲突。
	var TRASH = {
		// 被砸后的回嘴：半开玩笑，不接火
		hitBack: [
			"就这？", "急了？", "就这点本事？", "谢谢啊",
			"力度不错", "收到收到", "下次用力点", "没吃饭吗",
			"行了行了给你", "这波我不接", "擦亮了再说", "小场面",
			"好疼好疼", "你可真会", "下回换我", "礼尚往来",
			"记下了", "有来有回", "就这力度", "回去加练",
			"我不生气", "你高兴就好", "让让你", "见笑了",
			"谢谢惠顾", "欢迎再来", "服务周到", "心意收到",
			"我还行", "你手酸吗", "歇会儿吧", "别累着",
			"准头还行", "下次瞄准点", "我躲得开", "再来",
			"这不算数", "这局你赢", "我认", "行行行你有理",
			"伤不到我", "痒痒的", "挠痒痒呢", "再来一下",
			"无所谓", "随便砸", "我不计较", "看你表演",
			"继续", "请便",
		],
	};
	// 官方表情专属台词（2026-09-29 新增）：发出某个表情包贴图时，配一句「对味」的台词，
	// 表情与台词同帧出，比通用台词更贴。键名 = 引擎 image/emotion/ 下的包名；
	// 未命中时回落到通用 LINES（按敌方/友方关系）。
	var EMO_LINES = {
		// 友方（萌系）
		xiaokuo_emotion: ["哈哈笑死", "这个梗我懂", "太真实了", "笑不活了"],
		xiaotao_emotion: ["桃子给你", "甜不甜", "吃个桃", "补补状态"],
		xiaowu_emotion: ["敬个礼", "跳一段给你看", "心情不错", "收到"],
		maoshu_emotion: ["猫鼠一窝", "别跑", "抓住你了", "一起玩"],
		mobile_emotion: ["这表情绝了", "通用款", "你懂的", "到位"],
		// 敌方（嘲讽系）
		wanglang_emotion: ["我从不退让", "还没完", "口才了得", "佩服佩服"],
		huangdou_emotion: ["滑稽一下", "你品你细品", "眼神到位", "会心一笑"],
		zhenji_emotion: ["落落大方", "你说什么", "我听着", "看好了"],
		biexiao_emotion: ["别笑", "严肃点", "有什么好笑", "我忍住了"],
		xiaosha_emotion: ["笑死我了", "这波笑倒", "笑不动了", "太逗了"],
		chaijun_emotion: ["拆个痛快", "这也能拆", "走一个", "拆得漂亮"],
	};
	/* 表情台词的性格分声（2026-10-09，README 排队优化配套）：
	   EMO_LINES 是各包的通用台词；本表给「人设反差最大」的包配人格变体 ——
	   数学家发王朗表情说"语言攻击，伤害为零"，比通用台词更活。
	   键 = 包名 → 人格 → 句池；未命中人格/包时回落 EMO_LINES 通用池。 */
	var EMO_PERSONA = {
		wanglang_emotion: {
			aggro: ["厚颜无耻？你也配说", "我从没见过这么菜的手"],
			math: ["语言攻击，伤害为零", "据统计，表情包不影响胜率"],
		},
		chaijun_emotion: {
			aggro: ["拆的就是你的心态", "拆迁世家，血统压制"],
			wild: ["哈哈哈全拆光", "拆迁！拆拆迁迁！"],
		},
		xiaokuo_emotion: {
			wild: ["笑死，必须发出来", "哈哈哈哈停不下来"],
			bluff: ["我笑，是在演戏", "笑里藏刀，懂"],
		},
		xiaotao_emotion: {
			tight: ["吃桃，养生局", "细水长流，先补状态"],
			math: ["回血期望值 +1", "桃的边际效益最高"],
		},
	};
	// 限流
	var GLOBAL_GAP = 3000;
	var PER_PLAYER_GAP = 20000;
	var PER_ROUND_MAX = 3;

	// ---------- 运行状态 ----------
	var lastGlobal = 0;
	var lastByPlayer = new Map();
	var roundState = { round: -1, count: 0 };
	var greetedPlayers = null; // 记录本局已发过开局问候的 game.players 引用
	var total = 0;
	var lastSticker = new Map();   // 每人最近一次发的贴图包（2026-10-06：连续不重包）

	// ---------- 工具 ----------
	function cfg(key, def) {
		var v = lib.config[key];
		return v === undefined ? def : v;
	}
	// 读取用户自定义台词池。格式：{ flower:[...], wine:[...], egg:[...], shoe:[...], hitBack:[...] }
	// 每个分类都是字符串数组；非法条目被静默丢弃。自定义与内置合并后随机取用。
	function customLines() {
		var c = lib.config[KEY.custom];
		if (!c || typeof c !== "object" || Array.isArray(c)) return {};
		var out = {};
		CATS.forEach(function (k) {
			var arr = c[k];
			if (!Array.isArray(arr)) return;
			var clean = [];
			for (var i = 0; i < arr.length; i++) {
				var s = arr[i];
				if (typeof s === "string" && s.trim()) clean.push(s.trim());
			}
			if (clean.length) out[k] = clean;
		});
		return out;
	}
	// 合并内置 + 自定义台词池，返回数组（供随机取用）
	/* ---------- 性格分声（2026-10-03）----------
	   同一场景，不同性格的人说法不同 —— 这是"拟人"最关键的最后一层。
	   此前所有 AI 共用一批台词（只有恩怨分档：≥5 改次数、≥8 换狠话），
	   于是"莽夫"和"数学家"被砸了鸡蛋，回嘴一模一样。
	   做法：按说话人的**世界人格**（world.byId(id).persona）优先取专属句子（约一半概率），
	   另一半仍走通用池（内置 + 玩家自定义，见 linesFor）—— 两种都保留，台词才不呆板。 */
	var PERSONA_LINES = {
		// 被砸蛋 / 拖鞋后的回嘴
		hitBack: {
			aggro: ["你这就没劲了", "来啊，接着来", "就这点能耐？", "别停啊", "再来，我等着", "就这？下一发呢"],
			tight: ["我不跟你一般见识", "记着你了", "不值当跟你计较", "消停会儿吧", "不接茬", "省省吧"],
			bluff: ["我早看见你抬手了", "吓我一跳，就这？", "演得不错，可惜我看穿了", "又演，累不累", "虚张声势十级"],
			math: ["力度和伤害没关系，你白费劲", "这个角度伤不到我", "你再来十次也一样", "伤害为零，纯浪费", "效率太低了"],
			wild: ["哈哈哈，挠痒痒呢", "再来！", "我皮糙肉厚，随你砸", "哈哈哈哈来来来", "越砸越高兴"],
		},
		// 赢下一局
		win: {
			aggro: ["这局本该是我的", "看见没，谁说了算", "承让，下一局还来", "横着走出去的", "就这阵容也挡我"],
			tight: ["稳一点，总能赢", "该我的一分不少", "这局我算到了", "稳稳拿下", "计划通"],
			bluff: ["我那是虚张声势，你还真信", "骗到了吧", "胆子大才吃得饱", "你们猜哪句是真的", "全程演技"],
			math: ["概率说话，不是运气", "该来的总会来", "数据不会撒谎", "胜率说了算", "这把是必然"],
			wild: ["赢了！痛快！", "哈哈，运气来了挡不住", "再战再战", "爽！", "下一桌更快"],
		},
		// 输掉一局
		lose: {
			aggro: ["这把不算，重来", "你等着，下一局我加倍", "别得意太早", "记住这局了", "迟早讨回来"],
			tight: ["亏了，收手", "稳住，不急这一局", "这把我不该跟", "止损，认", "复盘去了"],
			bluff: ["被你识破了", "下次我真有大牌", "演砸了，认", "演技过关，结果不过关", "差一张牌"],
			math: ["小概率事件，认了", "重新算一下", "样本太小，不算数", "方差而已", "下次期望更高"],
			wild: ["输了就输了，痛快", "钱没了手还在", "再来一局！", "再来就是", "输赢乃兵家常事"],
		},
		// 被记恨（恩怨 ≥8 时的狠话档）
		grudge: {
			aggro: ["你还敢来惹我？", "今天非得跟你算清楚", "等着，我记你很久了", "新账旧账一起清", "今天你别想走"],
			tight: ["我记账很清楚的", "一笔一笔来", "别急，跑不了", "账越记越厚了", "慢慢来，不急"],
			bluff: ["上次那笔我可没忘", "你猜我还记不记得", "欠着的，总要还", "你猜我忘了没", "最好祈祷别再遇到我"],
			math: ["账上还挂着你一笔", "这笔迟早清", "我从不漏记", "欠账计息，按局算", "账目清晰，迟早结清"],
			wild: ["你！来来来，算总账！", "记住你了！", "今天谁也别想走", "算总账的时候到了", "跑得了吗你"],
		},
	};
	function personaOf(player) {
		try {
			if (lib.cshWorld && lib.cshWorld.idOfPlayer && lib.cshWorld.byId) {
				var id = lib.cshWorld.idOfPlayer(player);
				if (id) {
					var a = lib.cshWorld.byId(id);
					if (a && a.persona) return a.persona;
				}
			}
			/* 【万物有声·2026-10-06 第三批】非池子名册的角色（本体武将 / 其他扩展武将）
			   按 id/name 稳定哈希派生人格 —— 全场每个 AI 都有性格声线与频率，
			   不再只有池子武将"活着"。哈希是确定性的：同一武将每局人格相同。 */
			var nm = (player && (player.name1 || player.name)) || "";
			if (nm) return PERSONA_KEYS[fnvHash(nm) % PERSONA_KEYS.length];
		} catch (e) {}
		return "";
	}
	/* FNV-1a（与 csh_world.stableHash 同款实现，本地复制避免跨模块依赖） */
	function fnvHash(str) {
		str = String(str == null ? "" : str);
		var h = 0x811c9dc5;
		for (var i = 0; i < str.length; i++) {
			h ^= str.charCodeAt(i);
			h = (h * 16777619) >>> 0;
		}
		return h >>> 0;
	}
	/* ---------- 状态感知（2026-10-09 语境化，作者 2026-10-06 反馈）----------
	   台词先看角色当前状态，再按性格分声 —— 被乐不思蜀控住时说"大意了吧"
	   一类得意话非常出戏。三态：
	     controlled —— 判定区挂着延时锦囊（乐不思蜀/兵粮寸断/闪电），本回合被压着；
	     hurt       —— 重伤（hp ≤ 1/3 上限），得意闲聊改自嘲硬撑；
	     normal     —— 其余。
	   判定区读 player.judge（引擎判定区卡片数组），零新增引擎依赖。 */
	function stateOf(player) {
		try {
			if (player.hp <= 0) return "dying";
			if (Array.isArray(player.judge) && player.judge.length) return "controlled";
			var third = Math.max(1, Math.ceil((player.maxHp || 3) / 3));
			if (player.hp <= third) return "hurt";
		} catch (e) {}
		return "normal";
	}
	/* 取台词：性格专属池（一半概率）或通用池（内置 + 玩家自定义） */
	function linesFor(speaker, cat) {
		try {
			var p = personaOf(speaker);
			var bank = PERSONA_LINES[cat];
			if (p && bank && bank[p] && bank[p].length && Math.random() < 0.5) return bank[p];
		} catch (e) {}
		return mergedLines(cat);
	}
	function mergedLines(name) {
		var base = (name === "hitBack" ? TRASH.hitBack : LINES[name]) || [];
		var extra = customLines()[name] || [];
		return base.concat(extra);
	}
	/* ---------- 2026-10-06 丰富化：防复读 / 人格频率 / 配对计数 / 情境选词 ---------- */
	/* 全场近期已说台词环：同句短时间内不重复（此前 randomGet 裸抽，
	   经常出现"全场轮流 666"的复读机观感）。只存最近 RECENT_MAX 句，一局一清。 */
	var RECENT = [];
	var RECENT_MAX = 6;
	/* 配对计数：本局 from → to 已互动几次，"连砸同一人"的升级档依据。
	   键 = 双方 playerid；跨局无意义，claimGameStart 时清。 */
	var pairTimes = new Map();
	function pairKey(from, to) { return (from && to) ? ((from.playerid || "") + "|" + (to.playerid || "")) : ""; }
	function pairCount(from, to) { return pairTimes.get(pairKey(from, to)) || 0; }
	/* 配对事件账本（2026-10-06 记忆感）：key = from→to，值 = from 对 to 的最近动作
	   （'hit' 被砸 / 'hitBack' 被回嘴 / 'saved' 被救 / 'killed' 队友被杀）。
	   互动时查"对方对**我**"的最近动作，命中就优先说引用旧账的台词——
	   「上次那颗蛋，现在还你了」。只记一局内，claimGameStart 清。 */
	var lastEvent = new Map();
	/* 检索打分账本（2026-10-06 第三批）：key = from→to，值 = {hit,hitBack,saved,killed} 计数 */
	var pairStats = new Map();
	/* 印象账本（2026-10-07 T1 二级反思）：key = from→to，值 = 重要度加权累计
	   （恩为正/怨为负），|累计| ≥16 固化印象（克星/恩人） */
	var pairImp = new Map();
	function recordEvent(from, to, kind) {
		if (!from || !to) return;
		lastEvent.set(pairKey(from, to), kind);
		/* 检索打分（2026-10-06 第三批·方案 §16-2）：事件不只记"最近一条"，
		   还按 (方向, 类别) 累计次数 —— memHit 的触发概率随被砸次数上升（检索加权），
		   累计 ≥3 次敌意事件触发**反思**：这对关系固化为"宿敌"（nemesis），
		   后续互动整体升级（即便世界恩怨值未到 8）。反思是 generative-agents
		   "记忆→反思→影响行为"的最小本地实现，全程规则化、零 LLM。 */
		var k = pairKey(from, to);
		var s = pairStats.get(k) || { hit: 0, hitBack: 0, saved: 0, killed: 0 };
		s[kind] = (s[kind] || 0) + 1;
		pairStats.set(k, s);
		/* 二级反思（2026-10-07 · T1）：按重要度表加权累计（reflect.py 的
		   importance_trigger 语义）——恩/怨各自累计，|累计| ≥ 16 固化"印象"
		   （怨 → 克星，恩 → 恩人）。权重：hit 3 / hitBack 2 / saved 8 / killed 10。 */
		var impW = { killed: 10, saved: 8, hit: 3, hitBack: 2 };
		if (impW[kind]) {
			var imp = pairImp.get(k) || 0;
			imp += (kind === "saved") ? impW[kind] : -impW[kind];   // 恩为正，怨为负
			pairImp.set(k, Math.max(-99, Math.min(99, imp)));
		}
	}
	function impressionOf(from, to) {
		var imp = pairImp.get(pairKey(from, to)) || 0;
		return imp <= -16 ? "克星" : (imp >= 16 ? "恩人" : "");
	}
	function statOf(from, to) {
		return pairStats.get(pairKey(from, to)) || { hit: 0, hitBack: 0, saved: 0, killed: 0 };
	}
	/* 反思判定：对方对"我"的敌意事件（砸+回嘴）累计 ≥3 → 固化宿敌 */
	function isNemesis(from, to) {
		var s = statOf(from, to);
		return (s.hit + s.hitBack) >= 3;
	}
	/* 世界宿敌快照：onGameStart 取一次（避免每次抛掷都 raw() 克隆全档），一局一换 */
	var RIVALRY = null;
	/* 人格频率系数：人格不只决定"说什么"，也决定"说多少"——
	   保守 / 数学家话少而干，激进 / 莽夫话密。乘在触发概率上；
	   canPlay 的硬限流（全局 3s / 单人 20s / 每轮 3 次）不变，这里只调软性倾向。 */
	var PERSONA_RATE = { aggro: 1.2, tight: 0.75, bluff: 1.05, math: 0.8, wild: 1.15 };
	function personaRate(player) {
		var p = personaOf(player);
		return (p && PERSONA_RATE[p]) || 1;
	}
	/* 情境选词：在"表情类别"之上叠加情境修正——
	   · 敌意抛掷且本局已对同一人砸 ≥3 次 → relentless（升级档：第 1~2 次走普通池，
	     连着砸还一个说法就成了复读机）
	   · 敌意抛掷且对象是宿敌（世界 rivalry ≥ 25 局）→ rivalry 池（一半概率）
	   其余回落原类别（性格分声 → 通用池的逻辑不变，在 linesFor 里）。 */
	function situCat(from, to, baseCat) {
		try {
			if (baseCat === "egg" || baseCat === "shoe") {
				/* 三档升级（2026-10-06 拆档）：1~2 次轻调侃（egg）/ 3~4 次重攻击
				   （eggHard）/ ≥5 次 relentlessly —— 重话用在重的时候，才不尬。
				   鞋子没有"重攻击"档（本来就是搞笑风），3 次起直接 relentless。 */
				var n = pairCount(from, to);
				if (n >= 5) return "relentless";
				if (n >= 3) return baseCat === "egg" ? "eggHard" : "relentless";
				/* 宿敌开场：rivalry 快照在 onGameStart 里取一次（避免每次抛掷都 raw() 克隆全档） */
				if (RIVALRY && lib.cshWorld && lib.cshWorld.idOfPlayer) {
					var id = lib.cshWorld.idOfPlayer(to);
					var rid = lib.cshWorld.idOfPlayer(from);
					if (id && rid && RIVALRY[rid] && (RIVALRY[rid][id] || 0) >= 25 && Math.random() < 0.5) {
						return "rivalry";
					}
				}
			}
		} catch (e) {}
		return baseCat;
	}
	/* 选句：过滤全场最近已说过的句子再抽，抽中后登记。
	   全被过滤时退回整池（宁可偶尔重复也不能哑火）。 */
	function pickLine(lines) {
		if (!lines || !lines.length) return null;
		var fresh = lines.filter(function (s) { return RECENT.indexOf(s) < 0; });
		var line = randomOne(fresh.length ? fresh : lines);
		if (line) { RECENT.push(line); if (RECENT.length > RECENT_MAX) RECENT.shift(); }
		return line;
	}
	function rate() {
		return RATE[lib.config[KEY.rate]] || RATE.normal;
	}
	/* ---------- 台词数据模块合并（2026-10-06 第三批）----------
	   csh_interact_lines.js（手写主题批）+ csh_interact_lines_gen.js（组合生成器）
	   两份纯数据在此并入 LINES / PERSONA_LINES / EMO_LINES：
	   · Set 去重：与内置重复的字符串直接丢弃 —— "重复度低"由合并层机检兜底；
	   · 新分类自动并入 CATS（调试面板自定义台词编辑器即刻可管理）；
	   · 以后扩台词 = 往那两份文件里加数据，本文件一行不改。 */
	function mergeExtra(mod, tag) {
		try {
			if (!mod) return 0;
			var n = 0;
			var seenCat = {};
			var ex = mod.lines || {};
			Object.keys(ex).forEach(function (k) {
				var base = LINES[k] || (LINES[k] = []);
				var seen = new Set(base);
				var arr = ex[k] || [];
				for (var i = 0; i < arr.length; i++) {
					var s = arr[i];
					if (typeof s === "string" && s.trim() && !seen.has(s)) { base.push(s); seen.add(s); n++; }
				}
				seenCat[k] = 1;
			});
			var px = mod.persona || {};
			Object.keys(px).forEach(function (cat) {
				var bank = PERSONA_LINES[cat] || (PERSONA_LINES[cat] = {});
				Object.keys(px[cat]).forEach(function (p) {
					var seen = bank[p] ? new Set(bank[p]) : new Set();
					var arr = px[cat][p] || [];
					for (var j = 0; j < arr.length; j++) {
						var s2 = arr[j];
						if (typeof s2 === "string" && s2.trim() && !seen.has(s2)) {
							(bank[p] = bank[p] || []).push(s2); seen.add(s2); n++;
						}
					}
				});
			});
			var exd = mod.emo || {};
			Object.keys(exd).forEach(function (k2) {
				var base2 = EMO_LINES[k2] || (EMO_LINES[k2] = []);
				var seen2 = new Set(base2);
				var arr2 = exd[k2] || [];
				for (var m = 0; m < arr2.length; m++) {
					var s3 = arr2[m];
					if (typeof s3 === "string" && s3.trim() && !seen2.has(s3)) { base2.push(s3); seen2.add(s3); n++; }
				}
			});
			/* 表情台词人格变体（2026-10-09）：结构与 persona 一致，二级合并 */
			var exp = mod.emoPersona || {};
			Object.keys(exp).forEach(function (pk) {
				var bank2 = EMO_PERSONA[pk] || (EMO_PERSONA[pk] = {});
				Object.keys(exp[pk]).forEach(function (p2) {
					var seen3 = bank2[p2] ? new Set(bank2[p2]) : new Set();
					var arr3 = exp[pk][p2] || [];
					for (var q = 0; q < arr3.length; q++) {
						var s4 = arr3[q];
						if (typeof s4 === "string" && s4.trim() && !seen3.has(s4)) {
							(bank2[p2] = bank2[p2] || []).push(s4); seen3.add(s4); n++;
						}
					}
				});
			});
			Object.keys(seenCat).forEach(function (k3) {
				if (CATS.indexOf(k3) < 0) CATS.push(k3);
			});
			return n;
		} catch (e) {
			logError("台词数据合并失败 " + (tag || ""), e);
			return 0;
		}
	}
	var MERGED = (mergeExtra(EXTRA_LINES, "hand") + mergeExtra(GEN_LINES, "gen")) || 0;
	function logError(msg, err) {
		try {
			if (lib.cshDebug && typeof lib.cshDebug.error === "function") {
				lib.cshDebug.error("interact: " + msg, err);
			} else {
				console.error("[池子魔将] interact: " + msg, err);
			}
		} catch (e) {}
	}
	function isEnabled() {
		if (cfg(KEY.enable, true) === false) return false;
		if (_status.video) return false;
		if (!game.players || !game.players.length) return false;
		// 联机一律禁用（与 debug / winrate 一致；不开放 online 开关）
		try {
			if (typeof game !== "undefined" && game.online) return false;
			if (typeof _status !== "undefined" && _status.connectMode) return false;
		} catch (e) {}
		return true;
	}
	// 发送方必须是 AI：排除玩家本人，也排除单机模式下被玩家接管的角色
	function isAI(player) {
		if (!usable(player)) return false;
		if (player === game.me) return false;
		if (typeof player.isUnderControl === "function" && player.isUnderControl()) return false;
		return true;
	}
	// 存活且 DOM 节点可用。接收方可以是 AI，也可以是玩家本人 —— 这里不做 AI 限制。
	function usable(player) {
		if (!player || typeof player.isIn !== "function" || !player.isIn()) return false;
		return !!(player.node && player.node.avatar);
	}
	function relation(from, to) {
		var att = get.attitude(from, to);
		if (att > 0) return "ally";
		if (att < 0) return "enemy";
		return "neutral";
	}
	function canPlay(player) {
		var now = Date.now();
		if (now - lastGlobal < GLOBAL_GAP) return false;
		var last = lastByPlayer.get(player);
		if (last && now - last < PER_PLAYER_GAP) return false;
		var round = game.roundNumber || 0;
		if (roundState.round !== round) {
			roundState.round = round;
			roundState.count = 0;
		}
		return roundState.count < PER_ROUND_MAX;
	}
	function mark(player) {
		lastGlobal = Date.now();
		lastByPlayer.set(player, lastGlobal);
		roundState.count++;
		total++;
	}
	function pickEmotion(kind) {
		if (kind === "ally") return POOL.ally.randomGet();
		if (kind === "enemy") return POOL.enemy.randomGet();
		return POOL.neutral.randomGet();
	}
	// 接收方包含玩家本人：只要存活且节点在，就可以被送花或被砸蛋
	function pickTarget(player, want) {
		var list = game.players.filter(function (p) {
			if (p === player || !usable(p)) return false;
			var r = relation(player, p);
			if (want === "ally") return r === "ally";
			if (want === "enemy") return r === "enemy";
			return r !== "neutral";
		});
		if (!list.length) return null;
		/* 恩怨 ≥ 5 的目标权重 ×3（§4.2）：被记恨的人更容易被 AI 盯上 */
		var weighted = [];
		for (var i = 0; i < list.length; i++) {
			var times = grudgeOf(list[i]) >= 5 ? 3 : 1;
			for (var t = 0; t < times; t++) weighted.push(list[i]);
		}
		return weighted.randomGet();
	}

	// 表现层：直接复用引擎的 player.throwEmotion。
	// 动画、音效、旋转、命中图、节点销毁、录像回放、联机广播全部由引擎负责。
	function playEmotion(from, to, name) {
		try {
			from.throwEmotion(to, name);
		} catch (e) {
			logError("throwEmotion " + name, e);
		}
	}
	/* 恩怨账本接线（2026-10-01）：把互动的「动作」接上世界的「记账」。
	   lib.cshWorld 不可用时静默跳过，二者互不阻塞。 */
	function addGrudge(target, n) {
		try {
			if (lib.cshWorld && lib.cshWorld.idOfPlayer && lib.cshWorld.addGrudge) {
				var id = lib.cshWorld.idOfPlayer(target);
				if (id) lib.cshWorld.addGrudge(id, n);
			}
		} catch (e) {}
	}
	function grudgeOf(target) {
		try {
			if (lib.cshWorld && lib.cshWorld.idOfPlayer && lib.cshWorld.grudge) {
				var id = lib.cshWorld.idOfPlayer(target);
				return id ? lib.cshWorld.grudge(id) : 0;
			}
		} catch (e) {}
		return 0;
	}
	// 被砸的 AI 有概率当场回一句嘴（TRASH.hitBack / memHitBack）：
	// 只说话、不抛表情、不计入限流，35% 概率 + 延时 0.6~1.4s 模拟「反应过来」，
	// 让挑衅有一来一往的对话感，同时火气可控（回嘴方不再升级）。
	// 【2026-10-06 第二批】记忆：若"我"此前砸过对方（lastEvent），改说 memHitBack
	// （"我说过会记着的"——回嘴也知道旧账）；回嘴后 35% 引来对方盟友帮腔（chorus）。
	function riposte(victim, name, attacker) {
		if (name !== "egg" && name !== "shoe") return;
		if (!isAI(victim)) return;               // 只有 AI 回嘴；玩家被砸不代答
		recordEvent(victim, attacker, "hitBack");
		if (Math.random() > 0.35) { chorus(victim, attacker, "assistHit"); return; }
		var prev = attacker ? lastEvent.get(pairKey(victim, attacker)) : null;
		var cat = (prev === "hit" || prev === "hitBack") ? "memHitBack" : "hitBack";
		var lines = mergedLines(cat);
		if (!lines || !lines.length) return;
		var line = pickLine(lines);
		if (!line) return;
		var tName = attacker ? (attacker === game.me ? "你" : tr(attacker)) : "";
		if (tName && line.indexOf("{t}") >= 0) line = line.replace(/\{t\}/g, tName);
		setTimeout(function () {
			try { victim.chat(line); } catch (e) { logError("riposte chat", e); }
			if (Math.random() < 0.35) chorus(victim, attacker, "assistHit");
		}, 600 + Math.random() * 800);
	}
	/* 第三方帮腔（2026-10-06 第二批）：subject 被挑衅/被救之后，subject 的盟友里
	   随机一人小概率隔空接一句（cat 决定怼人或夸人）——只 chat 不抛掷、不升级冲突、
	   独立 8s 全局限流（与互动主体的 3s 间隔分开，帮腔自带"隔一会儿才冒出来"的节奏）。 */
	var CHORUS_GAP = 8000;
	var lastChorus = 0;
	function chorus(subject, other, cat) {
		if (cfg(KEY.chat, true) === false) return;
		if (!isAI(subject) || !other) return;
		var now = Date.now();
		if (now - lastChorus < CHORUS_GAP) return;
		if (Math.random() > 0.3) return;
		var friends = game.players.filter(function (p) {
			return p !== subject && p !== other && isAI(p) && usable(p) && relation(p, subject) === "ally";
		});
		if (!friends.length) return;
		lastChorus = now;
		var who = randomOne(friends);
		var lines = mergedLines(cat);
		var line = pickLine(lines);
		if (!line) return;
		var tName = other === game.me ? "你" : tr(other);
		if (tName && line.indexOf("{t}") >= 0) line = line.replace(/\{t\}/g, tName);
		setTimeout(function () {
			try { who.chat(line); } catch (e) { logError("chorus chat", e); }
		}, 700 + Math.random() * 900);
	}
	// 连击（2026-09-28 用户需求 / 2026-09-29 升级）：鸡蛋连砸 / 鲜花连送，制造「气势」。
	// chance=进入连击的概率；weights=[[追加次数, 权重], ...]（权重和 100）；gap=[最小间隔ms, 最大间隔ms]。
	// 升级点：蛋由「追加 1-3」改为加权 0-4 ⇒ 总抛掷 1-5 次，其中 5 连恰为 8%。
	// 只补抛表情，不重复台词/回嘴/计数（一次互动算一次），开局问候与阶段触发都会自然带上。
	var BURST = {
		egg: { chance: 0.45, gap: [320, 700], weights: [[0, 20], [1, 32], [2, 28], [3, 12], [4, 8]] },
		flower: { chance: 0.4, gap: [380, 760], weights: [[0, 35], [1, 40], [2, 25]] },
		wine: { chance: 0.22, gap: [480, 900], weights: [[0, 60], [1, 40]] },
		shoe: { chance: 0.28, gap: [400, 820], weights: [[0, 40], [1, 35], [2, 25]] },
	};
	// 按权重掷出追加次数
	function rollWeighted(weights) {
		if (!weights || !weights.length) return 0;
		var total = 0, i;
		for (i = 0; i < weights.length; i++) total += weights[i][1];
		if (total <= 0) return 0;
		var r = Math.random() * total;
		for (i = 0; i < weights.length; i++) {
			r -= weights[i][1];
			if (r < 0) return weights[i][0];
		}
		return weights[weights.length - 1][0];
	}
	function queueBurst(from, to, name) {
		var b = BURST[name];
		if (!b || Math.random() > b.chance) return;
		var n = rollWeighted(b.weights);
		if (!n) return;
		var t = 0;
		for (var i = 0; i < n; i++) {
			t += b.gap[0] + Math.random() * (b.gap[1] - b.gap[0]);
			(function (delay) {
				setTimeout(function () {
					try {
						if (!usable(from) || !usable(to)) return;
						playEmotion(from, to, name);
					} catch (e) {
						logError("burst " + name, e);
					}
				}, delay);
			})(t);
		}
	}
	// ---------- 官方表情包（2026-09-28 用户需求） ----------
	// 直接引用引擎自带素材 image/emotion/<包>/N.gif，经 player.emotion(pack, id) 发出
	// （内部走 say() 气泡展示；联机走 broadcast，单机下 broadcast 是空操作，安全）。
	// ★ 零新增素材：包名与张数取自引擎 image/emotion/ 实盘（asset.json 对账），
	//   语义已人工抽图确认——王朗/滑稽黄豆/甄姬/别笑/笑杀/拆迁 = 嘲讽系；
	//   笑哭/粉发妹/小舞/猫鼠/手游通用 = 友好萌系。
	var EMO = {
		ally: [
			["xiaokuo_emotion", 8],
			["xiaotao_emotion", 20],
			["xiaowu_emotion", 14],
			["maoshu_emotion", 18],
			["mobile_emotion", 20],
		],
		enemy: [
			["wanglang_emotion", 20],
			["huangdou_emotion", 50],
			["zhenji_emotion", 20],
			["biexiao_emotion", 12],
			["xiaosha_emotion", 20],
			["chaijun_emotion", 43],
		],
	};
	// 发官方表情替代实体道具抛掷的概率
	var EMO_CHANCE = 0.22;
	// 表情三连发（2026-09-29 新增）：同一表情包、错开 id 追加两发，间隔 0.4s，做「刷屏级」气势。
	var EMO_TRIPLE_CHANCE = 0.06;
	function sendSticker(from, kind) {
		try {
			if (typeof from.emotion !== "function") return null;
			var pool = EMO[kind === "enemy" ? "enemy" : "ally"];
			if (!pool || !pool.length) return null;
			/* 【2026-10-06 优化】贴图也要"像人发"：
			   ① 人格口味——激进/莽夫的敌意贴图偏嘲讽系（剔除通用款）；
			   ② 保守/数学家贴图欲低（30% 改发实体道具）；
			   ③ 同一人连续两次不重包（lastSticker 记录，局内清）。 */
			var pr = personaOf(from);
			if ((pr === "math" || pr === "tight") && Math.random() < 0.3) return null;
			var pool2 = pool;
			if (kind === "enemy" && (pr === "aggro" || pr === "wild")) {
				pool2 = pool.filter(function (h) { return h[0] !== "mobile_emotion"; });
			}
			var lastPack = lastSticker.get(from);
			var cand = pool2.filter(function (h) { return h[0] !== lastPack; });
			if (!cand.length) cand = pool2;
			var hit = cand[Math.floor(Math.random() * cand.length)];
			var id = 1 + Math.floor(Math.random() * hit[1]);
			lastSticker.set(from, hit[0]);
			from.emotion(hit[0], id + ".gif");
			return { pack: hit[0], id: id, max: hit[1] };
		} catch (e) {
			logError("emotion sticker", e);
			return null;
		}
	}
	// 表情三连发：用取模保证 id 不越界（引擎对缺失 gif 会静默跳过，不会报错）
	function queueEmoTriple(from, info) {
		if (!info || Math.random() > EMO_TRIPLE_CHANCE) return;
		for (var i = 1; i <= 2; i++) {
			(function (n) {
				setTimeout(function () {
					try {
						if (typeof from.emotion !== "function") return;
						var id = ((info.id - 1 + n * 3) % info.max) + 1;
						from.emotion(info.pack, id + ".gif");
					} catch (e) {
						logError("emotion triple", e);
					}
				}, 400 * n);
			})(i);
		}
	}
	// 表情配套台词：优先用该表情包专属台词，再拼用户自定义（按敌/友映射到蛋/花类），
	// 让「表情与台词同帧出」，同时自定义台词管道继续生效。
	function sayForSticker(player, info, kind) {
		if (cfg(KEY.chat, true) === false) return;
		if (Math.random() > 0.5) return;
		/* 性格分声（2026-10-09）：先查该包的人格变体（40% 概率），未命中回落通用池 */
		var pool = [];
		try {
			var pr = personaOf(player);
			var pv = pr && EMO_PERSONA[info.pack] && EMO_PERSONA[info.pack][pr];
			if (pv && pv.length && Math.random() < 0.4) pool = pv.slice();
		} catch (eP) {}
		if (!pool.length) pool = (EMO_LINES[info.pack] || []).slice();
		pool = pool.concat(customLines()[kind === "enemy" ? "egg" : "flower"] || []);
		if (!pool.length) return;
		try {
			player.chat(randomOne(pool));
		} catch (e) {
			logError("chat sticker", e);
		}
	}
	function say(player, name, force, target) {
		if (cfg(KEY.chat, true) === false) return;
		if (!force && Math.random() > 0.5) return;
		var lines = linesFor(player, name);   // 性格分声（2026-10-03）：专属池 ↔ 通用池各半
		if (!lines || !lines.length) return;
		var line = pickLine(lines);           // 防复读（2026-10-06）：近期说过的不再抽
		if (!line) return;
		/* {t} 插名（2026-10-06 第二批）：台词点得到对方的名，才像冲着人说的——
		   对面是玩家本人时替换成「你」。 */
		if (target && line.indexOf("{t}") >= 0) {
			line = line.replace(/\{t\}/g, target === game.me ? "你" : tr(target));
		}
		try {
			player.chat(line);
		} catch (e) {
			logError("chat " + name, e);
		}
	}
	// 说话型触发点出口（2026-09-29 新增）：濒死呼救 / 获救答谢 / 终局发言这类「只出声不出手」的场合。
	// 与 fire() 共用同一套资格校验与限流（canPlay + mark），因此不会绕过防刷屏；
	// 区别仅在于不挑表情、不抛掷，只走 chat。force=true 时无视 50% 静默（终局一局一次，值得必发）。
	function speak(player, cat, baseChance, force) {
		if (!isEnabled()) return false;
		if (!isAI(player)) return false;
		if (baseChance <= 0 || Math.random() > baseChance * rate().scale * personaRate(player)) return false;
		if (!canPlay(player)) return false;
		mark(player);
		say(player, cat, !!force);
		return true;
	}
	// 统一出口：资格 → 关系 → 概率 → 限流 → 抛掷/发表情
	function fire(player, target, kind, baseChance) {
		if (!isEnabled()) return false;
		if (!isAI(player)) return false;
		if (!usable(target) || target === player) return false;
		var k = kind || relation(player, target);
		var chance = baseChance * rate().scale * (k === "neutral" ? 0.4 : 1) * personaRate(player);
		if (chance <= 0 || Math.random() > chance) return false;
		if (!canPlay(player)) return false;
		var name = pickEmotion(k);
		/* 情境选词（2026-10-06）：连砸升级 / 宿敌开场，先于恩怨狠话档计算；
		   恩怨 ≥ 8 仍最高优先（记仇压过一切场面话，§4.2 读取点不变） */
		var sayName = situCat(player, target, name);
		/* 记忆注入（2026-10-06 第二批）+ 三因子检索打分（2026-10-07 第四批·方案 §16-2 深读落地）：
		   源公式（generative_agents retrieve.py:247）：
		     score = recency_w*recency*gw[0] + relevance_w*relevance*gw[1] + importance_w*importance*gw[2]
		     生产权重 gw=[0.5, 3, 2]（相关性权重最高）；recency = decay^i 指数衰减。
		   本地化（零 LLM / 零 embedding）：
		     · recency    = 0.99 ^ 距上次事件的互动次数（配对计数近似衰减）
		     · importance = 固定重要度表（killed 10 / saved 8 / hit 3 / hitBack 2，替代 LLM 打分）
		     · relevance  = 正在互动的对手即检索目标 = 1.0（该场景恒定）
		   score 归一化后映射 memHit 触发概率 [0.2, 0.62]。 */
		var mem = lastEvent.get(pairKey(target, player));
		var memS = statOf(target, player);
		var recency = Math.pow(0.99, Math.min(50, pairCount(target, player)));
		var impT = { killed: 10, saved: 8, hit: 3, hitBack: 2 };
		var importance = (impT[mem] || 2) / 10;
		var score3 = 0.5 * recency + 3 * 1.0 + 2 * importance;   /* gw=[0.5,3,2]，relevance=1 */
		var memW = 0.2 + Math.min(0.42, (score3 / 7.5) * 0.42);
		if ((mem === "hit" || mem === "hitBack") && Math.random() < memW) sayName = "memHit";
		else if (mem === "saved" && Math.random() < 0.35 + importance * 0.3) sayName = "memSaved";
		/* 反思（第三批）+ 二级反思·印象（T1）：计数 ≥3 或 印象"克星"（重要度累计 ≤−16，
		   被救之恩的负向折算也计入）都算固化宿敌；世界恩怨 ≥8 仍最高优先 */
		if ((isNemesis(target, player) || impressionOf(target, player) === "克星") && LINES.grudge && LINES.grudge.length) sayName = "grudge";
		if (grudgeOf(target) >= 8 && LINES.grudge && LINES.grudge.length) sayName = "grudge";
		mark(player);
		pairTimes.set(pairKey(player, target), pairCount(player, target) + 1);
		var threwEntity = false;
		if (Math.random() < EMO_CHANCE) {
			/* 22%：改发官方表情包贴图（气泡），配专属台词，并可三连发 */
			var info = sendSticker(player, k);
			if (info) {
				sayForSticker(player, info, k);
				queueEmoTriple(player, info);
			} else {
				/* 表情素材不可用时回落实体道具，别让这次互动空转 */
				playEmotion(player, target, name);
				queueBurst(player, target, name);
				say(player, sayName, false, target);
				threwEntity = true;
			}
		} else {
			playEmotion(player, target, name);
			queueBurst(player, target, name);
			say(player, sayName, false, target);
			threwEntity = true;
		}
		/* 砸蛋/砸鞋命中 → 恩怨 +1（§4.2；连击追加抛掷在 queueBurst 内，不重复计数） */
		if (threwEntity && (name === "egg" || name === "shoe")) {
			addGrudge(target, 1);
			recordEvent(player, target, "hit");
		}
		riposte(target, name, player);
		/* 第三方帮腔（2026-10-06 第二批）：挑衅之后，被砸者的盟友小概率隔空接一句
		   —— 冲突有了观众才像真的。见 chorus()。 */
		if (threwEntity && (name === "egg" || name === "shoe")) chorus(target, player, "assistHit");
		return true;
	}

	// ---------- 对外接口 ----------
	lib.cshInteract = {
		isEnabled: isEnabled,
		isAI: isAI,
		relation: relation,
		pickTarget: pickTarget,
		// 自定义台词读写接口（供调试面板「互动」页签管理）
		getCustom: function () {
			var c = lib.config[KEY.custom];
			if (!c || typeof c !== "object" || Array.isArray(c)) return {};
			var out = {};
			CATS.forEach(function (k) {
				if (Array.isArray(c[k])) out[k] = c[k].slice();
			});
			return out;
		},
		setCustom: function (cat, lines) {
			var c = lib.config[KEY.custom];
			if (!c || typeof c !== "object" || Array.isArray(c)) c = {};
			var arr = [];
			if (Array.isArray(lines)) {
				for (var i = 0; i < lines.length; i++) {
					var s = lines[i];
					if (typeof s === "string" && s.trim()) arr.push(s.trim());
				}
			}
			if (arr.length) c[cat] = arr;
			else delete c[cat];
			if (!Object.keys(c).length) {
				if (lib.config[KEY.custom] !== undefined) delete lib.config[KEY.custom];
				game.saveConfig(KEY.custom, undefined);
			} else {
				game.saveConfig(KEY.custom, c);
			}
		},
		customCount: function () {
			var c = customLines();
			var n = 0;
			for (var k in c) n += c[k].length;
			return n;
		},
		// 手动抛一个，方便调试或在具体技能里调用
		throw: function (player, target, name) {
			if (!usable(player) || !usable(target)) return false;
			playEmotion(player, target, name || "egg");
			return true;
		},
		fire: fire,
		stats: function () {
			return { total: total, round: roundState.round, roundCount: roundState.count };
		},
		reset: function () {
			lastGlobal = 0;
			lastByPlayer.clear();
			roundState.round = -1;
			roundState.count = 0;
			greetedPlayers = null;
			total = 0;
			RECENT.length = 0;
			pairTimes.clear();
			lastEvent.clear();
			pairImp.clear();
			pairStats.clear();
			lastSticker.clear();
			RIVALRY = null;
		},
		// 开局问候只在本局第一次 gameStart 触发时执行
		claimGameStart: function () {
			if (greetedPlayers === game.players) return false;
			greetedPlayers = game.players;
			/* 一局一清（2026-10-06）：防复读环 / 配对计数 / 配对事件账本 / 宿敌快照
			   都是"局内记忆"，跨局要重置 */
			RECENT.length = 0;
			pairTimes.clear();
			lastEvent.clear();
			pairImp.clear();
			pairStats.clear();
			lastSticker.clear();
			RIVALRY = null;
			return true;
		},
		onGameStart: function () {
			/* 取本局宿敌快照（situCat 消费，避免逐次抛掷 raw() 克隆全档） */
			try {
				if (lib.cshWorld && lib.cshWorld.raw) {
					RIVALRY = ((lib.cshWorld.raw() || {}).relations || {}).rivalry || {};
				}
			} catch (eRv0) { RIVALRY = null; }
			/* 【2026-10-06 修】开局问候此前形同虚设：fire() 的 3s 全局间隔会让
			   同步遍历里只有第一个 AI 能开口，其余全被限流拦掉。
			   开局问候 / 宿敌开场都是"一局一次"的事件，改走专用通道：
			   跳过全局间隔与 canPlay，保留单人间隔与概率，连击/三连发照常。 */
			function openingFire(p, t, kind, chance) {
				if (!isEnabled() || !isAI(p) || !usable(t) || t === p) return;
				var last = lastByPlayer.get(p);
				if (last && Date.now() - last < PER_PLAYER_GAP) return;
				if (Math.random() > chance * rate().scale) return;
				lastByPlayer.set(p, Date.now());
				total++;
				var name = pickEmotion(kind);
				var sc = situCat(p, t, name);
				if (Math.random() < EMO_CHANCE) {
					var info = sendSticker(p, kind);
					if (info) { sayForSticker(p, info, kind); }
					else { playEmotion(p, t, name); say(p, sc); }
				} else {
					playEmotion(p, t, name);
					say(p, sc);
				}
			}
			game.players.forEach(function (p) {
				if (!isAI(p)) return;
				var t = pickTarget(p, "ally");
				if (t) openingFire(p, t, "ally", BASE.start);
			});
			/* 宿敌同桌开场（2026-10-06）：世界宿敌（交手 ≥25 局）同桌时互相点名——
			   世界的关系数据第一次接进对局互动。只加戏不加恨（不动恩怨账本）。 */
			try {
				if (RIVALRY && lib.cshWorld && lib.cshWorld.idOfPlayer) {
					game.players.forEach(function (p) {
						if (!isAI(p)) return;
						var pid = lib.cshWorld.idOfPlayer(p);
						var m = pid ? RIVALRY[pid] : null;
						if (!m) return;
						for (var k in m) {
							if (!Object.prototype.hasOwnProperty.call(m, k)) continue;
							if ((m[k] || 0) < 25) continue;
							var q = null;
							for (var gi = 0; gi < game.players.length; gi++) {
								var x = game.players[gi];
								if (x !== p && isAI(x) && lib.cshWorld.idOfPlayer(x) === k) { q = x; break; }
							}
							if (q) { openingFire(p, q, "enemy", 0.5); break; }
						}
					});
				}
			} catch (eRv) { logError("宿敌开场", eRv); }
		},
		onPhaseBegin: function (player) {
			/* 语境化（2026-10-09）：回合开始的随机社交先看状态 ——
			   · controlled：本回合被锦囊压着，不主动出手（被控者还活跃砸蛋很怪），
			     改 40% 概率吐槽自己的处境（ctrl 池）；
			   · hurt：重伤的"得意闲聊"换成自嘲/硬撑（hurtSelf 池，一半概率）；
			   · normal：原逻辑不动。 */
			var st = stateOf(player);
			if (st === "controlled") {
				if (Math.random() < 0.4) speak(player, "ctrl", 0.6, true);
				return;
			}
			if (st === "hurt" && Math.random() < 0.5) {
				if (speak(player, "hurtSelf", 0.6, true)) return;
			}
			var want = Math.random() < 0.6 ? "ally" : "enemy";
			var t = pickTarget(player, want) || pickTarget(player, "any");
			if (!t) return;
			fire(player, t, relation(player, t), rate().phase);
		},
		onDamageEnd: function (player, source) {
			if (!usable(source) || source === player) return;
			var k = relation(player, source);
			if (k === "ally") return; // 被友军误伤不还手
			fire(player, source, k === "neutral" ? "enemy" : k, BASE.damage);
			/* 情境补刀（2026-10-06）：挨了打，但出手的人自己也只剩 1 血站场 ——
			   台词知道牌局事实，嘲讽才成立。不走 canPlay（与上面的 fire 共享 3s
			   全局间隔会自相拦截），但保留单人间隔的一半做防连刷。 */
			try {
				if ((typeof player.hp === "number" && player.hp > 0) && source.hp === 1 && Math.random() < 0.3) {
					var lastT = lastByPlayer.get(player);
					if (!lastT || Date.now() - lastT > PER_PLAYER_GAP * 0.5) {
						lastByPlayer.set(player, Date.now());
						say(player, "lowHp", true);
					}
				}
			} catch (eLh) {}
		},
		onRecoverEnd: function (player, source) {
			if (!usable(source) || source === player) return;
			if (relation(player, source) !== "ally") return;
			fire(player, source, "ally", BASE.recover);
			/* 记忆记账（2026-10-06 第二批）：把"救"记进配对账本——被救者此后与救
			   自己的人互动会说 memSaved（"刚才那条命是你给的"）；围观者小概率夸一句。 */
			recordEvent(source, player, "saved");
			chorus(player, source, "assistPraise");
		},
		// 从 changeHp 事件反查「谁治的」。必须是 lib 上的方法：技能 filter/content
		// 会被 StepCompiler 反编译后重建，闭包函数在那边取不到。
		recoverSource: function (event) {
			try {
				var rec = event && event.getParent && event.getParent("recover");
				return (rec && rec.source) || null;
			} catch (e) {
				return null;
			}
		},
		onAllyDie: function (dead, killer) {
			if (!usable(killer) || killer === dead) return;
			addGrudge(killer, 2);   // 凶手恩怨 +2（§4.2 队友阵亡）
			recordEvent(killer, dead, "killed");   // 记忆记账（2026-10-06 第二批）
			var avenger = game.players
				.filter(function (p) {
					return p !== dead && usable(p) && isAI(p) && relation(p, dead) === "ally" && relation(p, killer) !== "ally";
				})
				.randomGet();
			if (!avenger) return;
			fire(avenger, killer, "enemy", BASE.allyDie);
			/* 帮腔（2026-10-06 第二批）：死者的另一位盟友再补一句，葬礼也有观众 */
			chorus(dead, killer, "assistHit");
		},
		// ---------- 2026-09-29 新增触发点（对话向） ----------
		// 濒死：血量归零时朝场上喊一句（呼救）。
		onDying: function (player) {
			speak(player, "dying", 0.5, true);
			/* 围观群众（2026-10-06 第二批）：有人倒下，牌桌上有人看热闹——
			   一句不出手的旁白（"好戏来了"）。低概率，走防复读环。 */
			try {
				var onlookers = game.players.filter(function (p) { return p !== player && isAI(p) && usable(p); });
				if (onlookers.length && Math.random() < 0.18) {
					var ln = pickLine(mergedLines("crowd"));
					if (ln) {
						var ol = randomOne(onlookers);
						setTimeout(function () {
							try { ol.chat(ln); } catch (eC) {}
						}, 500 + Math.random() * 700);
					}
				}
			} catch (eCd) {}
		},
		// 获救：从非正血量被拉回正血量（判定条件在技能 filter 里按 hp 前后值算出，无需额外状态）。
		onRescue: function (player) {
			speak(player, "rescue", 0.6, true);
		},
		// 判定：自己的判定牌结算完毕，吐一句牌运。
		onJudge: function (player) {
			speak(player, "judge", 0.22, false);
		},
		// 失去装备（被顺 / 被弃）：吐槽一句。
		onEquipLost: function (player) {
			speak(player, "equip", 0.3, false);
		},
		// 终局：全员各说一句。一局仅一次，故不走 canPlay（3s 全局间隔会拦掉大半人），
		// 直接 say(force) —— 靠「终局只发生一次」天然防刷屏。
		// 说话者不做 isAI 判定：终局时 isIn 可能已失效，改用「有渲染节点且非玩家本人」。
		onGameOver: function (win, meSide) {
			if (win === undefined) return;
			if (!isEnabled()) return;
			game.players.forEach(function (p) {
				if (!p || p === game.me) return;
				if (!p.node || !p.node.avatar) return;
				var sameSide = meSide !== undefined && p.side === meSide;
				var pWin = (win === true) === sameSide;
				say(p, pWin ? "win" : "lose", true);
			});
		},
	};

	// 终局发言（2026-09-29）：引擎没有 gameEnd 全局时机（实测只有 gameStart / gameDrawBegin / gameDrawAfter），
	// 改为幂等包装 game.over。包装前先取 meSide（over 内部会 swapPlayer，事后再读会变），
	// 原样透传 this 与返回值；已包装过则跳过，避免多次进游戏重复套娃。
	var overHooked = false;
	function hookGameOver() {
		if (overHooked || typeof game.over !== "function") return;
		var orig = game.over;
		game.over = function (result, bool) {
			var meSide = game.me && game.me.side;
			var ret = orig.apply(this, arguments);
			try {
				if (lib.cshInteract && typeof lib.cshInteract.onGameOver === "function") {
					lib.cshInteract.onGameOver(result, meSide);
				}
			} catch (e) {
				logError("game.over hook", e);
			}
			return ret;
		};
		overHooked = true;
	}

	// ---------- 全局技能注册 ----------
	// 沿用扩展内 _csh_effect_damage_announce 已验证的范式：
	// 写入 lib.skill._csh_xxx → 置 global = true → game.addGlobalSkill(name)。
	// 由 extension.js 的 content() 调用 install()，确保 lib.skill 已就绪。
	function define(name, skill) {
		if (lib.skill[name]) return;
		skill.forced = true;
		skill.silent = true;
		skill.charlotte = true;
		skill.popup = false;
		skill.global = true;
		lib.skill[name] = skill;
		try {
			if (typeof game.addGlobalSkill === "function") game.addGlobalSkill(name);
		} catch (e) {
			logError("addGlobalSkill " + name, e);
		}
	}
	lib.cshInteract.install = function () {
		if (!lib.skill) {
			logError("install 失败：lib.skill 尚未就绪");
			return false;
		}

		// 开局问候。global 触发器会对全桌每名角色各判一次，用 claimGameStart 保证只执行一轮。
		define("_csh_interact_start", {
			trigger: { global: "gameStart" },
			filter: function () {
				if (!lib.cshInteract.isEnabled()) return false;
				return lib.cshInteract.claimGameStart();
			},
			content: function () {
				lib.cshInteract.onGameStart();
			},
		});

		// 回合开始的随机社交。player 触发器只会对事件主角判定，天然一人一次。
		define("_csh_interact_phase", {
			trigger: { player: "phaseBegin" },
			filter: function (event, player) {
				return lib.cshInteract.isEnabled() && lib.cshInteract.isAI(player);
			},
			content: function () {
				lib.cshInteract.onPhaseBegin(player);
			},
		});

		// 挨打反击
		define("_csh_interact_damage", {
			trigger: { player: "damageEnd" },
			filter: function (event, player) {
				return lib.cshInteract.isEnabled() && lib.cshInteract.isAI(player) && !!event.source;
			},
			content: function () {
				lib.cshInteract.onDamageEnd(player, trigger.source);
			},
		});

		// 被友方治疗，致谢。
		// 挂 changeHp 而不是 recoverAfter：濒死被桃救回时，引擎会在 changeHp 里把
		// dying / _save 事件直接 finish()（content.js 的 changeHp 末尾），
		// recover 事件这一层的「通用 After」因此可能被跳过 —— 表现就是「被救不回谢」。
		// changeHp 是每次体力变动末尾无条件显式触发的时机，不会漏。
		// 2026-09-29：排除「本次回血跨越 0 点」（= 濒死获救）的情形，那段归 _csh_interact_rescue，
		// 两个 changeHp 触发器 filter 互斥，避免同一次回血说两遍。
		define("_csh_interact_recover", {
			trigger: { player: "changeHp" },
			filter: function (event, player) {
				if (!lib.cshInteract.isEnabled() || !lib.cshInteract.isAI(player)) return false;
				if (!event || typeof event.num !== "number" || event.num <= 0) return false;
				if (player.hp > 0 && player.hp - event.num <= 0) return false;
				return !!lib.cshInteract.recoverSource(event);
			},
			content: function () {
				lib.cshInteract.onRecoverEnd(player, lib.cshInteract.recoverSource(trigger));
			},
		});

		// 队友阵亡，替他对凶手出手。dieAfter 时 player 已是 dead，必须 forceDie / forceOut。
		define("_csh_interact_ally_die", {
			trigger: { player: "dieAfter" },
			forceDie: true,
			forceOut: true,
			filter: function (event, player) {
				return lib.cshInteract.isEnabled() && !!event.source && event.source !== player;
			},
			content: function () {
				lib.cshInteract.onAllyDie(player, trigger.source);
			},
		});

		// ---------- 2026-09-29 新增触发点 ----------
		// 濒死呼救
		define("_csh_interact_dying", {
			trigger: { player: "dying" },
			filter: function (event, player) {
				return lib.cshInteract.isEnabled() && lib.cshInteract.isAI(player);
			},
			content: function () {
				lib.cshInteract.onDying(player);
			},
		});

		// 获救答谢：hp 由 <=0 回到 >0（= 濒死被救回）。与 _csh_interact_recover 同为 changeHp，
		// 两者 filter 互斥（recover 侧已排除跨越 0 点），不会重复发言。
		define("_csh_interact_rescue", {
			trigger: { player: "changeHp" },
			filter: function (event, player) {
				if (!lib.cshInteract.isEnabled() || !lib.cshInteract.isAI(player)) return false;
				if (!event || typeof event.num !== "number" || event.num <= 0) return false;
				return player.hp > 0 && player.hp - event.num <= 0;
			},
			content: function () {
				lib.cshInteract.onRescue(player);
			},
		});

		// 判定吐槽
		define("_csh_interact_judge", {
			trigger: { player: "judgeEnd" },
			filter: function (event, player) {
				return lib.cshInteract.isEnabled() && lib.cshInteract.isAI(player);
			},
			content: function () {
				lib.cshInteract.onJudge(player);
			},
		});

		// 失去装备吐槽：loseEnd =「失去牌结算完毕」，filter 只放行「失去的牌里含装备牌」。
		// ★ 引擎没有 loseEquip 这个时机名 —— 它只是 content.js:10945 里的 event 标志位；
		//   判定「装备离场」只能从 loseEnd 的 event.cards 里筛 type === "equip"。
		define("_csh_interact_equip", {
			trigger: { player: "loseEnd" },
			filter: function (event, player) {
				if (!lib.cshInteract.isEnabled() || !lib.cshInteract.isAI(player)) return false;
				if (!event || !event.cards || !event.cards.length) return false;
				for (var i = 0; i < event.cards.length; i++) {
					var c = event.cards[i];
					if (!c) continue;
					var t = c.type;
					if (!t && typeof get !== "undefined" && get && typeof get.type === "function") {
						try { t = get.type(c); } catch (eT) {}
					}
					if (t === "equip") return true;
				}
				return false;
			},
			content: function () {
				lib.cshInteract.onEquipLost(player);
			},
		});

		// 终局发言：引擎无 gameEnd 全局时机，改为包装 game.over（幂等）
		hookGameOver();
	};

	// ---------- 设置面板（卡片式） ----------
	// 原先「总开关 / 频率 / 台词」三个配置项散在扩展设置里，信息密度低、重复说明多。
	// 这里收成一张卡片面板：一个总开关 + 一个频率分段控件 + 一个台词开关，
	// 写回的还是同一批键名（KEY.enable / KEY.rate / KEY.chat），老配置值继续生效。
	var CSS_ID = "csh-ia-css";
	var OV_ID = "csh-ia-overlay";
	var PANEL_ID = "csh-ia-panel";

	function uiHost() {
		return document.documentElement || document.body;
	}
	// 引擎 ui.create.toast 在部分壳/懒人包里不可用，这里做多级兜底，绝不抛错
	function toast(msg) {
		var text = String(msg == null ? "" : msg);
		try {
			/* 统一走界面基座（documentElement 挂载 · 不随 body 缩放 · 合并/排队/描金） */
			if (lib.cshUI && typeof lib.cshUI.toast === "function") { lib.cshUI.toast(text); return; }
		} catch (eU) {}
		try {
			if (typeof ui !== "undefined" && ui && ui.create && typeof ui.create.toast === "function") {
				ui.create.toast(text);
				return;
			}
		} catch (e0) {}
		try {
			if (lib.cshDebug && typeof lib.cshDebug.toast === "function") {
				lib.cshDebug.toast(text);
				return;
			}
		} catch (e1) {}
		try {
			if (typeof game !== "undefined" && typeof game.print === "function") game.print(text);
		} catch (e2) {}
	}
	function tr(x) {
		try {
			if (x == null) return "";
			if (typeof get !== "undefined" && get && typeof get.translation === "function") {
				return get.translation(x) || "";
			}
		} catch (e) {}
		return (x && x.name) || "";
	}
	function randomOne(arr) {
		if (!arr || !arr.length) return null;
		try {
			if (typeof arr.randomGet === "function") return arr.randomGet();
		} catch (e) {}
		return arr[Math.floor(Math.random() * arr.length)];
	}
	// 与 csh_debug.js / csh_winrate.js 保持一致：缩放系数恒为 1，面板不做任何 scale。
	// 历史 bug：这里曾把 --csh-ia-z 设成 game.documentZoom，手机端该值约 0.4，
	// 面板被缩到四成大小，看着就是「点不开 / 交互无响应」；PC 端（可达 2）又会整体溢出。
	// 尺寸一律交给 vw / vh / clamp 处理。
	function uiScale() {
		return 1;
	}
	function ensureStyle() {
		var old = document.getElementById(CSS_ID);
		if (old && old.parentNode) old.parentNode.removeChild(old);
		var st = document.createElement("style");
		st.id = CSS_ID;
		st.textContent = [
			"@keyframes cshIaFade{from{opacity:0;}to{opacity:1;}}",
			"@keyframes cshIaRise{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:translateY(0);}}",
			"#" + OV_ID + "{position:fixed!important;left:0!important;top:0!important;width:100%!important;height:100%!important;z-index:1000002!important;",
			"display:flex!important;align-items:center!important;justify-content:center!important;pointer-events:auto!important;",
			"background:rgba(var(--csh-bg-deep-rgb),.52)!important;",
			"-webkit-backdrop-filter:blur(10px) saturate(140%)!important;backdrop-filter:blur(10px) saturate(140%)!important;",
			"font-family:system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif!important;animation:cshIaFade .18s ease-out!important;}",
			"#" + PANEL_ID + "{position:relative!important;display:block!important;box-sizing:border-box!important;",
			"width:min(94vw,470px)!important;max-height:min(92vh,calc(100% - 16px))!important;overflow-y:auto!important;overflow-x:hidden!important;",
			"-webkit-overflow-scrolling:touch!important;overscroll-behavior:contain!important;",
			/* 【2026-09-30 空间修复】原 padding:24px 26px 22px 是三个面板里最大的横向内边距，
			   而本面板内容是「开关列表」，不需要这么宽的留白：26px×2 吃掉 52px，
			   实测内容宽仅 314.6px（屏宽 80.7%，比调试面板窄 43px）。
			   收紧到 14px 后内容宽回到约 338px（+7.6%）；max-height 也从 86vh 放宽到 92vh
			   （原本是三者中最保守的高度预算）。 */
			"padding:16px 14px 14px!important;border-radius:16px!important;",
			"color:var(--csh-bg)!important;background:var(--csh-fg)!important;",
			"border:1px solid rgba(var(--csh-bg-rgb),.10)!important;",
			"box-shadow:0 2px 6px rgba(var(--csh-bg-rgb),.06),0 24px 56px -20px rgba(var(--csh-bg-rgb),.30)!important;",
			"animation:cshIaRise .22s cubic-bezier(.2,.8,.2,1)!important;pointer-events:auto!important;}",
			"#" + PANEL_ID + " *{box-sizing:border-box!important;}",
			/* 引擎全局 div{position:absolute;display:inline-block} 必须显式复位 */
			"#" + PANEL_ID + " div,#" + PANEL_ID + " span{position:static!important;}",
			/* 标题：实心描金（不用 background-clip / text-stroke，避免缩放下发虚） */
			"#csh-ia-title{display:block!important;text-align:left!important;font-size:var(--csh-lfs-xl2,17px)!important;font-weight:600!important;letter-spacing:-.01em!important;",
			"line-height:1.35!important;font-family:system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif!important;margin:0 0 4px!important;",
			"color:var(--csh-bg)!important;-webkit-text-fill-color:var(--csh-bg)!important;background:none!important;",
			"-webkit-text-stroke:0!important;text-shadow:none!important;}",
			"#csh-ia-sub{display:block!important;position:relative!important;text-align:left!important;font-size:var(--csh-lfs-cap2,11.5px)!important;color:var(--csh-gray-soft)!important;",
			"letter-spacing:.01em!important;margin:0 0 18px!important;padding:0 0 16px!important;}",
			"#csh-ia-sub::after{content:'';position:absolute!important;left:0;right:0;bottom:0;height:1px;",
			"background:rgba(var(--csh-bg-rgb),.08);}",
			/* 卡片行 */
			".csh-ia-card{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px 14px!important;flex-wrap:wrap!important;",
			"width:100%!important;margin:0 0 10px!important;padding:14px 16px!important;border-radius:12px!important;",
			"background:var(--csh-light)!important;border:1px solid rgba(var(--csh-bg-rgb),.08)!important;}",
			".csh-ia-card .txt{display:block!important;flex:1 1 auto!important;min-width:0!important;text-align:left!important;}",
			".csh-ia-card .t{display:block!important;font-size:var(--csh-lfs-md2,13.5px)!important;font-weight:600!important;color:var(--csh-bg)!important;letter-spacing:-.005em!important;}",
			".csh-ia-card .d{display:block!important;margin-top:4px!important;font-size:var(--csh-lfs-cap2,11.5px)!important;line-height:1.55!important;color:var(--csh-gray-soft)!important;}",
			".csh-ia-card.dis{opacity:.5!important;}",
			/* 开关：纯 flex，不用绝对定位，避免被引擎样式污染 */
			".csh-ia-sw{display:inline-flex!important;align-items:center!important;flex:0 0 auto!important;width:50px!important;height:29px!important;",
			"border-radius:999px!important;padding:3px!important;background:rgba(var(--csh-bg-rgb),.14)!important;border:1px solid transparent!important;",
			"cursor:pointer!important;user-select:none!important;touch-action:manipulation!important;-webkit-tap-highlight-color:transparent!important;",
			"transition:background .18s ease,border-color .18s ease!important;}",
			".csh-ia-sw .knob{display:block!important;width:21px!important;height:21px!important;border-radius:50%!important;background:var(--csh-fg)!important;",
			"box-shadow:0 1px 3px rgba(var(--csh-bg-rgb),.28)!important;",
			"transition:transform .18s cubic-bezier(.22,.61,.36,1),background .18s ease!important;}",
			".csh-ia-sw.on{background:var(--csh-accent)!important;border-color:transparent!important;}",
			".csh-ia-sw.on .knob{transform:translateX(23px)!important;background:var(--csh-fg)!important;}",
			/* 频率：分段控件 */
			".csh-ia-seg{display:inline-flex!important;flex:0 0 auto!important;gap:3px!important;padding:3px!important;border-radius:999px!important;",
			"background:rgba(var(--csh-bg-rgb),.055)!important;border:1px solid transparent!important;}",
			/* 触摸目标对齐 44px（与关闭键/页签/兑换行/壳按钮一致）；原 padding:6px 实测约 31px */
			".csh-ia-seg .it{display:inline-block!important;cursor:pointer!important;padding:11px 16px!important;min-height:44px!important;border-radius:999px!important;",
			"font-size:var(--csh-lfs-sm2,12.5px)!important;color:var(--csh-gray)!important;font-weight:500!important;user-select:none!important;touch-action:manipulation!important;-webkit-tap-highlight-color:transparent!important;",
			"transition:color .16s ease,background .16s ease,box-shadow .16s ease!important;}",
			".csh-ia-seg .it:hover{color:var(--csh-bg)!important;background:rgba(var(--csh-bg-rgb),.055)!important;}",
			".csh-ia-seg .it.on{color:var(--csh-bg)!important;font-weight:600!important;background:var(--csh-fg)!important;box-shadow:0 1px 3px rgba(var(--csh-bg-rgb),.16)!important;}",
			/* 统计 / 说明 / 底部 */
			".csh-ia-stat{display:block!important;width:100%!important;margin:2px 0 14px!important;padding:11px 14px!important;border-radius:10px!important;",
			"font-size:var(--csh-lfs-sm,12px)!important;line-height:1.6!important;color:var(--csh-gray)!important;background:var(--csh-light)!important;",
			"border:1px solid rgba(var(--csh-bg-rgb),.06)!important;border-left:3px solid var(--csh-accent)!important;}",
			".csh-ia-stat b{color:var(--csh-bg)!important;font-weight:600!important;}",
			".csh-ia-foot{display:block!important;width:100%!important;margin-top:4px!important;text-align:center!important;}",
			".csh-ia-btn{display:inline-block!important;cursor:pointer!important;margin:0 4px!important;padding:10px 26px!important;border-radius:8px!important;",
			"font-size:var(--csh-lfs-md2,13.5px)!important;font-weight:500!important;letter-spacing:.01em!important;color:var(--csh-bg)!important;font-family:inherit!important;",
			"touch-action:manipulation!important;-webkit-tap-highlight-color:transparent!important;",
			"background:var(--csh-fg)!important;border:1px solid rgba(var(--csh-bg-rgb),.12)!important;box-shadow:0 1px 1px rgba(var(--csh-bg-rgb),.03)!important;",
			"transition:border-color .16s ease,background .16s ease,box-shadow .16s ease,transform .16s ease!important;}",
			".csh-ia-btn:hover{color:var(--csh-bg)!important;border-color:rgba(var(--csh-bg-rgb),.22)!important;background:var(--csh-paper2)!important;box-shadow:0 3px 10px -4px rgba(var(--csh-bg-rgb),.20)!important;transform:translateY(-1px)!important;}",
			".csh-ia-btn.good{color:var(--csh-bg)!important;border-color:var(--csh-accent)!important;background:var(--csh-accent)!important;font-weight:600!important;box-shadow:0 1px 2px rgba(var(--csh-accent-rgb),.38)!important;}",
			".csh-ia-btn.good:hover{color:var(--csh-bg)!important;border-color:var(--csh-accent-dark)!important;background:var(--csh-accent-dark)!important;box-shadow:0 4px 12px -4px rgba(var(--csh-accent-rgb),.55)!important;}",
			/* 无障碍：注入样式源序靠后，必须自己响应系统「减少动效」偏好（血泪 #9） */
			"@media (prefers-reduced-motion: reduce){#" + OV_ID + ",#" + PANEL_ID + ",#csh-ia-cust-ov{animation:none!important;transition:none!important;}}",
		].join("");
		(document.head || document.documentElement).appendChild(st);
	}

	function closePanel() {
		var el = document.getElementById(OV_ID);
		if (el && el.parentNode) el.parentNode.removeChild(el);
	}
	function bindEsc() {
		if (lib.__csh_ia_esc) return;
		lib.__csh_ia_esc = true;
		try {
			document.addEventListener("keydown", function (e) {
				if (e.key !== "Escape" && e.keyCode !== 27) return;
				if (!document.getElementById(OV_ID)) return;
				try { e.preventDefault(); e.stopPropagation(); } catch (_e) {}
				closePanel();
			}, true);
		} catch (_e2) {}
	}
	function saveCfg(key, val) {
		try {
			if (typeof game !== "undefined" && typeof game.saveConfig === "function") {
				game.saveConfig(key, val);
			} else if (lib.config) {
				lib.config[key] = val;
			}
		} catch (e) { logError("saveConfig " + key, e); }
	}
	function isOnlineNow() {
		try {
			if (typeof _status !== "undefined" && _status.connectMode) return true;
			if (typeof game !== "undefined" && game.online) return true;
		} catch (e) {}
		return false;
	}

	var RATE_LABEL = { low: "低", normal: "中", high: "高" };

	function openPanel() {
		closePanel();
		ensureStyle();
		bindEsc();

		var overlay = document.createElement("div");
		overlay.id = OV_ID;
		overlay.addEventListener("click", function (e) {
			if (e.target === overlay) closePanel();
		}, true);

		var panel = document.createElement("div");
		panel.id = PANEL_ID;
		panel.addEventListener("click", function (e) { e.stopPropagation(); }, false);

		var title = document.createElement("div");
		title.id = "csh-ia-title";
		title.textContent = "AI 局内互动";
		panel.appendChild(title);
		/* 【2026-10-03 去冗余】原副标题「池子魔将 · 表情互动设置」是标题的同义复述
		   （标题已写明是"AI 局内互动"），面板顶部因此多占一行。整行移除。 */

		var online = isOnlineNow();
		var on = cfg(KEY.enable, true) !== false;
		var chat = cfg(KEY.chat, true) !== false;
		var cur = RATE[lib.config[KEY.rate]] ? lib.config[KEY.rate] : "normal";

		// —— 总开关 ——
		function card(t, d, ctrl, disabled) {
			var row = document.createElement("div");
			row.className = "csh-ia-card" + (disabled ? " dis" : "");
			var txt = document.createElement("div");
			txt.className = "txt";
			var tt = document.createElement("div");
			tt.className = "t";
			tt.textContent = t;
			var dd = document.createElement("div");
			dd.className = "d";
			dd.textContent = d;
			txt.appendChild(tt);
			txt.appendChild(dd);
			row.appendChild(txt);
			row.appendChild(ctrl);
			panel.appendChild(row);
			return row;
		}

		var swEnable = document.createElement("div");
		swEnable.className = "csh-ia-sw" + (on ? " on" : "");
		swEnable.appendChild(document.createElement("div")).className = "knob";
		swEnable.addEventListener("click", function (e) {
			e.preventDefault();
			e.stopPropagation();
			on = !on;
			swEnable.className = "csh-ia-sw" + (on ? " on" : "");
			saveCfg(KEY.enable, on);
			refreshStat();
		}, false);
		card("总开关", "关闭后 AI 不再主动送花 / 敬酒 / 砸蛋 / 扔鞋", swEnable, online);

		// —— 频率 ——
		var seg = document.createElement("div");
		seg.className = "csh-ia-seg";
		["low", "normal", "high"].forEach(function (k) {
			var it = document.createElement("span");
			it.className = "it" + (k === cur ? " on" : "");
			it.textContent = RATE_LABEL[k];
			it.addEventListener("click", function (e) {
				e.preventDefault();
				e.stopPropagation();
				cur = k;
				for (var i = 0; i < seg.children.length; i++) seg.children[i].className = "it";
				it.className = "it on";
				saveCfg(KEY.rate, k);
				refreshStat();
			}, false);
			seg.appendChild(it);
		});
		card("互动频率", "低 ≈ 每轮 0-1 次 · 中 ≈ 每轮 1-2 次 · 高 ≈ 每轮 2-3 次", seg, online);

		// —— 台词 ——
		var swChat = document.createElement("div");
		swChat.className = "csh-ia-sw" + (chat ? " on" : "");
		swChat.appendChild(document.createElement("div")).className = "knob";
		swChat.addEventListener("click", function (e) {
			e.preventDefault();
			e.stopPropagation();
			chat = !chat;
			swChat.className = "csh-ia-sw" + (chat ? " on" : "");
			saveCfg(KEY.chat, chat);
			refreshStat();
		}, false);
		card("附带台词", "抛表情时约一半概率同时喊一句台词", swChat, online);

		// —— 自定义台词 ——
		var CAT_LABEL = { flower: "鲜花", wine: "敬酒", egg: "砸蛋", shoe: "扔鞋", hitBack: "回嘴" };
		var customCtrl = document.createElement("div");
		customCtrl.style.cssText = "flex:0 0 auto;";
		var openCustom = document.createElement("span");
		openCustom.className = "csh-ia-btn";
		openCustom.textContent = "管理自定义台词";
		openCustom.addEventListener("click", function (e) {
			e.preventDefault();
			e.stopPropagation();
			openCustomPanel();
		}, false);
		customCtrl.appendChild(openCustom);
		card("自定义台词", "可自行添加想要的台词，与内置台词随机混用（当前 " + lib.cshInteract.customCount() + " 条）", customCtrl, online);

		// —— 自定义台词管理浮层 ——
		var CATS = ["flower", "wine", "egg", "shoe", "hitBack"];
		function openCustomPanel() {
			var ov = document.createElement("div");
			ov.id = "csh-ia-cust-ov";
			ov.style.cssText = "position:fixed!important;left:0;top:0;width:100%;height:100%;z-index:1000004!important;"
				+ "display:flex;align-items:center;justify-content:center;background:rgba(var(--csh-bg-deep-rgb),.52)!important;"
				+ "backdrop-filter:blur(10px) saturate(140%);-webkit-backdrop-filter:blur(10px) saturate(140%);";
			ov.addEventListener("click", function (ev) { if (ev.target === ov) ov.parentNode.removeChild(ov); }, true);

			var box = document.createElement("div");
			box.style.cssText = "position:relative!important;box-sizing:border-box!important;width:min(92vw,560px)!important;"
				+ "max-height:min(86vh,calc(100% - 16px))!important;overflow-y:auto!important;padding:16px 14px 14px!important;"
				+ "border-radius:16px!important;color:var(--csh-bg)!important;font-family:system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif!important;"
				+ "background:var(--csh-fg)!important;border:1px solid rgba(var(--csh-bg-rgb),.10)!important;"
				+ "box-shadow:0 2px 6px rgba(var(--csh-bg-rgb),.06),0 24px 56px -20px rgba(var(--csh-bg-rgb),.30)!important;";
			box.addEventListener("click", function (ev) { ev.stopPropagation(); }, false);
			box.innerHTML = "";
			// 复位引擎 div 污染
			var reset = document.createElement("style");
			reset.textContent = "#csh-ia-cust-ov div{position:static!important;display:block!important;}#csh-ia-cust-ov span{position:static!important;display:inline-block!important;}"
				+ "#csh-ia-cust-ov .csh-cust-t{font-size:var(--csh-lfs-xl,16px);font-weight:600;color:var(--csh-bg);letter-spacing:-.01em;text-align:left;margin:0 0 4px;}"
				+ "#csh-ia-cust-ov .csh-cust-s{font-size:var(--csh-lfs-cap2,11.5px);color:var(--csh-gray-soft);text-align:left;margin:0 0 16px;}"
				+ "#csh-ia-cust-ov .csh-cust-seg{display:inline-flex;flex-wrap:wrap;gap:4px;padding:4px;border-radius:999px;background:rgba(var(--csh-bg-rgb),.055);border:1px solid transparent;margin:0 0 14px;}"
				+ "#csh-ia-cust-ov .csh-cust-seg .it{display:inline-block;cursor:pointer;padding:6px 15px;border-radius:999px;font-size:var(--csh-lfs-sm2,12.5px);color:var(--csh-gray);font-weight:500;}"
				+ "#csh-ia-cust-ov .csh-cust-seg .it.on{color:var(--csh-bg);font-weight:600;background:var(--csh-fg);box-shadow:0 1px 3px rgba(var(--csh-bg-rgb),.16);}"
				+ "#csh-ia-cust-ov .csh-cust-lines{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px;}"
				+ "#csh-ia-cust-ov .csh-cust-line{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;font-size:var(--csh-lfs-sm2,12.5px);color:var(--csh-bg);background:var(--csh-light);border:1px solid rgba(var(--csh-bg-rgb),.08);}"
				+ "#csh-ia-cust-ov .csh-cust-line .del{cursor:pointer;color:var(--csh-red);font-weight:600;padding:0;min-width:24px;min-height:24px;line-height:24px;text-align:center;font-size:var(--csh-lfs-lg,14px);}"
				+ "#csh-ia-cust-ov .csh-cust-add{display:flex;gap:8px;margin:0 0 16px;}"
				+ "#csh-ia-cust-ov .csh-cust-add input{flex:1 1 auto;min-width:0;padding:10px 12px;border-radius:8px;font-size:var(--csh-lfs-md,13px);color:var(--csh-bg);background:var(--csh-light);border:1px solid rgba(var(--csh-bg-rgb),.12);outline:none;box-sizing:border-box;font-family:inherit;}"
				+ "#csh-ia-cust-ov .csh-cust-add input:focus{background:var(--csh-fg);border-color:var(--csh-blue);box-shadow:0 0 0 3px rgba(var(--csh-blue-rgb),.14);}"
				+ "#csh-ia-cust-ov .csh-cust-add .b{display:inline-block;cursor:pointer;padding:10px 18px;border-radius:8px;font-size:var(--csh-lfs-md,13px);font-weight:600;color:var(--csh-bg);background:var(--csh-accent);border:1px solid var(--csh-accent);flex:0 0 auto;}"
				+ "#csh-ia-cust-ov .csh-cust-foot{text-align:center;margin-top:4px;}"
				+ "#csh-ia-cust-ov .csh-cust-btn{display:inline-block;cursor:pointer;margin:0 4px;padding:10px 26px;border-radius:8px;font-size:var(--csh-lfs-md2,13.5px);font-weight:600;color:var(--csh-bg);background:var(--csh-accent);border:1px solid var(--csh-accent);box-shadow:0 1px 2px rgba(var(--csh-accent-rgb),.38);}";
			box.appendChild(reset);

			var t = document.createElement("div");
			t.className = "csh-cust-t";
			t.textContent = "自定义台词";
			box.appendChild(t);
			var s = document.createElement("div");
			s.className = "csh-cust-s";
			s.textContent = "添加后与内置台词随机混用，仅在单机对局生效";
			box.appendChild(s);

			var seg = document.createElement("div");
			seg.className = "csh-cust-seg";
			var curCat = "egg";
			box.appendChild(seg);

			var linesBox = document.createElement("div");
			linesBox.className = "csh-cust-lines";
			box.appendChild(linesBox);

			var addRow = document.createElement("div");
			addRow.className = "csh-cust-add";
			var inp = document.createElement("input");
			inp.type = "text";
			inp.placeholder = "输入一句台词后回车或点添加";
			inp.maxLength = 30;
			var addBtn = document.createElement("span");
			addBtn.className = "b";
			addBtn.textContent = "添加";
			addRow.appendChild(inp);
			addRow.appendChild(addBtn);
			box.appendChild(addRow);

			var foot = document.createElement("div");
			foot.className = "csh-cust-foot";
			var closeBtn = document.createElement("span");
			closeBtn.className = "csh-cust-btn";
			closeBtn.textContent = "完 成";
			foot.appendChild(closeBtn);
			box.appendChild(foot);

			ov.appendChild(box);
			document.documentElement.appendChild(ov);

			function buildSeg() {
				seg.innerHTML = "";
				CATS.forEach(function (k) {
					var it = document.createElement("span");
					it.className = "it" + (k === curCat ? " on" : "");
					it.textContent = CAT_LABEL[k];
					it.addEventListener("click", function () {
						curCat = k;
						buildSeg();
						buildLines();
					}, false);
					seg.appendChild(it);
				});
			}
			function buildLines() {
				linesBox.innerHTML = "";
				var lines = (lib.cshInteract.getCustom()[curCat] || []).slice();
				if (!lines.length) {
					var empty = document.createElement("div");
					empty.style.cssText = "width:100%;text-align:center;color:var(--csh-gray);font-size:var(--csh-lfs-sm2,12.5px);padding:10px 0;";
					empty.textContent = "该分类暂无自定义台词";
					linesBox.appendChild(empty);
				}
				lines.forEach(function (ln, idx) {
					var chip = document.createElement("span");
					chip.className = "csh-cust-line";
					var txt = document.createElement("span");
					txt.textContent = ln;
					var del = document.createElement("span");
					del.className = "del";
					del.textContent = "✕";
					del.title = "删除";
					del.addEventListener("click", function () {
						lines.splice(idx, 1);
						lib.cshInteract.setCustom(curCat, lines);
						buildLines();
						refreshCustomCount();
					}, false);
					chip.appendChild(txt);
					chip.appendChild(del);
					linesBox.appendChild(chip);
				});
			}
			function doAdd() {
				var v = inp.value.trim();
				if (!v) { toast("台词不能为空"); return; }
				var lines = (lib.cshInteract.getCustom()[curCat] || []).slice();
				if (lines.indexOf(v) >= 0) { toast("已存在该台词"); return; }
				lines.push(v);
				lib.cshInteract.setCustom(curCat, lines);
				inp.value = "";
				buildLines();
				refreshCustomCount();
			}
			addBtn.addEventListener("click", function () { doAdd(); }, false);
			inp.addEventListener("keydown", function (e) { if (e.key === "Enter") doAdd(); }, false);
			closeBtn.addEventListener("click", function () { ov.parentNode.removeChild(ov); }, false);
			buildSeg();
			buildLines();
		}
		function refreshCustomCount() {
			if (customCtrl && customCtrl.parentNode) {
				var d = customCtrl.parentNode.querySelector(".d");
				if (d) d.textContent = "可自行添加想要的台词，与内置台词随机混用（当前 " + lib.cshInteract.customCount() + " 条）";
			}
		}

		var stat = document.createElement("div");
		stat.className = "csh-ia-stat";
		panel.appendChild(stat);
		function refreshStat() {
			var s = lib.cshInteract.stats();
			var head = online
				? "当前为<b>联机 / 观战</b>，互动一律禁用；以上设置仅对单机生效。"
				: "本局已发 <b>" + s.total + "</b> 次 · 本轮 <b>" + s.roundCount + "/" + PER_ROUND_MAX + "</b> 次";
			var tail = on
				? "限流：全局间隔 " + (GLOBAL_GAP / 1000) + "s，单角色冷却 " + (PER_PLAYER_GAP / 1000) + "s。"
				: "总开关已关闭。";
			stat.innerHTML = head + "<br>" + tail;
		}
		refreshStat();

		var foot = document.createElement("div");
		foot.className = "csh-ia-foot";
		var testBtn = document.createElement("span");
		testBtn.className = "csh-ia-btn good";
		testBtn.textContent = "试 发";
		testBtn.addEventListener("click", function (e) {
			e.preventDefault();
			e.stopPropagation();
			if (online) { toast("联机 / 观战下不可用"); return; }
			var list = (game.players || []).filter(function (p) { return isAI(p); });
			if (!list.length) { toast("场上没有 AI 角色"); return; }
			var from = randomOne(list);
			if (!from) { toast("找不到发送方"); return; }
			var to = pickTarget(from, "any") || pickTarget(from, "ally") || pickTarget(from, "enemy");
			if (!to) { toast("找不到可互动目标"); return; }
			var kind = relation(from, to);
			var emo = pickEmotion(kind === "neutral" ? "neutral" : kind);
			var stickerInfo = Math.random() < EMO_CHANCE ? sendSticker(from, kind) : null;
			if (stickerInfo) {
				sayForSticker(from, stickerInfo, kind);
				queueEmoTriple(from, stickerInfo);
			} else {
				playEmotion(from, to, emo);
				queueBurst(from, to, emo);
				say(from, emo);
			}
			riposte(to, emo);
			refreshStat();
			toast((tr(from) || from.name) + " → " + (tr(to) || to.name) + " · " + emo);
		}, false);
		var closeBtn = document.createElement("span");
		closeBtn.className = "csh-ia-btn";
		closeBtn.textContent = "关 闭";
		closeBtn.addEventListener("click", function (e) {
			e.preventDefault();
			e.stopPropagation();
			closePanel();
		}, false);
		foot.appendChild(testBtn);
		foot.appendChild(closeBtn);
		panel.appendChild(foot);

		overlay.appendChild(panel);
		uiHost().appendChild(overlay);
	}

	lib.cshInteract.openPanel = openPanel;
	lib.cshInteract.closePanel = closePanel;
})();
