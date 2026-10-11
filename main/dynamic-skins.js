/* 池子魔将 · 动态皮肤注册数据 —— 自动生成，请勿手改。
 *
 * 【2026-10-10】唯一常驻版本 = 基础版，运行时**不再加载本文件**（不注册 decadeUI.dynamicSkin）。
 * 保留原因：它同时是动皮资源的清单，供 tools/check-dynamic-integrity.mjs 做完整性审计；
 * 骨骼母带若将来要重出资源，这张表仍然是取景参数的唯一真源。
 *
 * 生成脚本：_audit_tmp/gen_dynamic_skins3.py
 *   数据源：_audit_tmp/取景体检_v3.json（把动作真播到稳定帧/整周期采样后的包围盒）
 * 资源根：extension/池子魔将/image/dynamic/<武将key>/<皮肤目录>/
 *
 * 注册模型（重要）：
 *   · 每个武将只挂一个皮肤键「经典形象」= 千幻 DEFAULT_SKIN 名，也是本扩展角色的默认静态皮肤名。
 *     千幻皮肤面板按 Object.keys(decadeUI.dynamicSkin[武将]) 逐条列条目，
 *     「多挂键」= 面板里多出可切换的空条目（玩家看到两套动皮）→ 已改为单键。
 *   · 第二形态（觉醒形态）不进注册表，只放在主形态的 transform 里：
 *     千幻变身态（qhly_getPlayerStatus===2）会 eval(transform[k]) 取整个配置对象，
 *     面板不可见、无法手动切换 ⇒ 觉醒前第一形态，觉醒后自动第二形态。
 *
 * 定位参数（由真实动画帧包围盒反解，非手调）：
 *   播放器 APNode.update()：renderX = x[0]*dpr + x[1]*canvas.width（等效 x[0] + x[1]*W_css）
 *   renderY 自画布底部向上；renderScale = scale * dpr。
 *   .player/.primary-avatar = 120x180，静态立绘 background-size:cover → 
 *   动皮同名对齐：按高度铺满、水平居中、底部贴边：
 *     scale = 178/包围盒高；x[1] = 0.5 - 中心x*scale/120；y[1] = (1 - 底边y*scale)/180
 *   （v2 用 setup-pose 包围盒 → 中心偏移最大可达 8 设备像素，是「没对齐武将框」的根因）
 *
 * 为什么必须给 scale：千幻无编辑存档时执行 skinCopy.scale = skinCopy.scale * resizeRatio，
 *   缺省 undefined 会变 NaN，整个骨骼不渲染。height 只在千幻路径生效、
 *   十周年UI 独立路径 (playerApplyDynamicSkin) 组装描述符时会丢弃 → 统一用绝对 scale。
 *
 * 封面：每个皮肤目录内的「经典形象.jpg」——千幻面板静态预览按 <dir>/<skinName>.jpg 查找，
 *   background 指向同一张图作为动皮底图。
 */

const PREFIX = "../../../池子魔将/image/dynamic/";
const KEY = "经典形象";   // 千幻默认皮肤名；也是皮肤面板里唯一的可选条目
const COVER = "经典形象.jpg";

/** 组装单形态配置（dir 形如 csh_zhonghui/17306_1） */
function form(dir, main, xr, yr, scale, bgMain, bgeo) {
	const out = {
		name: PREFIX + dir + "/" + main,
		// 保留 dir/main 供 tools 校验与人工核对（decadeUI-compat 不会重复补 name）
		dir: dir,
		main: main,
		action: "DaiJi",
		speed: 1,
		skinName: KEY,                       // 选中时把静态皮肤名切到 KEY.jpg（与默认皮肤一致）
		background: PREFIX + dir + "/" + COVER,
		x: [0, xr],
		y: [0, yr],
		scale: scale,
	};
	// 攻击/技能动作：复用主骨骼自带的 GongJi/TeShu（十周年UI 出框/千幻动作调度读取）
	out.gongji = { name: out.name, dir: dir, main: main, action: "GongJi", x: out.x, y: out.y, scale: scale };
	out.teshu = { name: out.name, dir: dir, main: main, action: "TeShu", x: out.x, y: out.y, scale: scale };
	if (bgMain && bgeo) {
		out.beijing = {
			name: PREFIX + dir + "/" + bgMain,
			dir: dir,
			main: bgMain,
			x: [0, bgeo[0]],
			y: [0, bgeo[1]],
			scale: bgeo[2],
		};
	}
	return out;
}

/* 主形态（30 套；马超/孙鲁班按用户要求移除，静态皮肤照旧） */
const MAIN = {
	csh_zhonghui: form("csh_zhonghui/17306_1", "XingXiang", 0.2346, 0.5531, 0.1537, "BeiJing", [0.0988, 0.6173, 0.1822]),   // 钟会
	csh_zhugeke: form("csh_zhugeke/11803_2", "XingXiang", 0.554, 0.5752, 0.1825, "BeiJing", [0.4865, 0.444, 0.2291]),   // 诸葛恪
	csh_zhuran: form("csh_zhuran/18208_1", "XingXiang", 0.4995, 0.6184, 0.1772, "BeiJing", [0.552, 0.5523, 0.13]),   // 朱然
	csh_bfsm: form("csh_bfsm/1205_2", "XingXiang", 1.0053, 0.5088, 0.1176, "BeiJing", [0.5293, 0.2436, 0.075]),   // 周瑜
	csh_mzj: form("csh_mzj/2109_1", "XingXiang", 0.652, 0.524, 0.1321, "BeiJing", [0.5966, 0.6424, 0.1189]),   // 甄宓
	csh_zhangxingcai: form("csh_zhangxingcai/12405_1", "XingXiang", 0.4803, 0.6634, 0.0756, "BeiJing", [0.5137, 0.4115, 0.1943]),   // 张星彩
	csh_ngwt: form("csh_ngwt/3205_2", "XingXiang", 0.6693, 0.5703, 0.1368, "BeiJing", [0.4087, 0.2105, 0.1002]),   // 张角
	csh_ae: form("csh_ae/304_1", "XingXiang", 0.4992, 0.4327, 0.2007, "BeiJing", [0.6177, 0.3967, 0.1616]),   // 张飞
	csh_zhangbao: form("csh_zhangbao/11903_2", "XingXiang", 0.4571, 0.592, 0.1676, "BeiJing", [0.5003, 0.5, 0.2358]),   // 张宝
	csh_yujin: form("csh_yujin/16002_1", "XingXiang", 0.7837, 0.6735, 0.0812, "BeiJing", [0.503, 0.5, 0.2076]),   // 于禁
	csh_xuchu: form("csh_xuchu/1903_1", "XingXiang", 0.7245, 0.5901, 0.0992, "BeiJing", [0.5003, 0.4302, 0.202]),   // 许褚
	csh_xingganning: form("csh_xingganning/904_2", "XingXiang", 0.3821, 0.5399, 0.2312, "BeiJing", [0.4889, 0.4306, 0.2032]),   // 星星甘宁
	csh_wolongzhuge: form("csh_wolongzhuge/3706_1", "XingXiang", 0.6594, 0.4366, 0.1416, "BeiJing", [0.7084, 0.5082, 0.1713]),   // 卧龙诸葛
	csh_sunshangxiang: form("csh_sunshangxiang/2510_1", "XingXiang", -0.1477, 0.666, 0.1729, "BeiJing", [0.5884, 0.431, 0.0921]),   // 孙尚香
	csh_sq: form("csh_sq/810_2", "XingXiang", 0.2076, 0.6635, 0.1223, "BeiJing", [0.4804, 0.4905, 0.1474]),   // 孙权
	csh_sj: form("csh_sj/4404_2", "XingXiang", 0.4701, 0.4553, 0.1343, "BeiJing", [0.639, 0.5529, 0.1514]),   // 孙坚
	csh_msmy: form("csh_msmy/1609_1", "XingXiang", 0.5653, 0.602, 0.121, "BeiJing", [0.4648, 0.6213, 0.1256]),   // 司马懿
	csh_mmhz: form("csh_mmhz/2606_1", "XingXiang", 0.6004, 0.4244, 0.2203, "BeiJing", [0.5617, 0.5359, 0.1816]),   // 谋谋黄忠
	csh_mlm: form("csh_mlm/1006_1", "XingXiang", 0.3404, 0.4755, 0.1461, "BeiJing", [0.563, 0.5176, 0.2278]),   // 吕蒙
	csh_mlb: form("csh_mlb/2303_2", "XingXiang", 0.4291, 0.4843, 0.1762, "BeiJing", [0.4959, 0.5366, 0.1672]),   // 吕布
	csh_ls: form("csh_ls/4909_1", "XingXiang", 0.6381, 0.5651, 0.114, "BeiJing", [0.6743, 0.4989, 0.1428]),   // 鲁肃
	csh_jjxs: form("csh_jjxs/15803_1", "XingXiang", 0.4433, 0.2906, 0.2716, "BeiJing", [0.599, 0.485, 0.1102]),   // 界界徐盛
	csh_qw: form("csh_qw/4808_1", "XingXiang", 0.4288, 0.6145, 0.158, "BeiJing", [0.3897, 0.5733, 0.1458]),   // 贾诩
	csh_jzh: form("csh_jzh/30706_1", "XingXiang", -0.99, 0.3665, 0.1557, "BeiJing", [0.4803, 0.2639, 0.126]),   // 黄盖
	csh_szc: form("csh_szc/30011_2", "XingXiang", 0.6782, 0.4966, 0.1324, "BeiJing", [0.4963, 0.3901, 0.1271]),   // 关羽
	csh_guanyinping: form("csh_guanyinping/11510_1", "XingXiang", 0.7379, 0.4556, 0.1715, "BeiJing", [0.487, 0.5034, 0.2275]),   // 关银屏
	csh_diaochan: form("csh_diaochan/10904_1", "XingXiang", 0.5061, 0.4505, 0.2071, "BeiJing", [0.5379, 0.5014, 0.2355]),   // 貂蝉
	csh_dengai: form("csh_dengai/5107_1", "XingXiang", 0.244, 0.5573, 0.1567, "BeiJing", [0.5898, 0.4311, 0.2035]),   // 邓艾
	csh_caoang: form("csh_caoang/12204_2", "XingXiang", 0.4283, 0.4231, 0.1422, "BeiJing", [0.5157, 0.4607, 0.2177]),   // 曹昂
	csh_caiyan: form("csh_caiyan/5710_2", "XingXiang", 0.4176, 0.3955, 0.1238, "BeiJing", [0.4642, 0.3633, 0.1025]),   // 蔡琰
};

/* 第二形态 XingXiang#1：只作为 transform 载荷（面板不可见、不可手动切换） */
const FORM2 = {
	csh_zhonghui: form("csh_zhonghui/17306_1", "XingXiang#1", 0.5014, 0.7051, 0.12, "BeiJing#1", [0.4823, 0.5958, 0.1013]),
	csh_szc: form("csh_szc/30011_2", "XingXiang#1", 0.1521, 0.3265, 0.0919, "BeiJing#1", [0.477, 0.4718, 0.1393]),
};

/* 注册数据：每个武将 = 单一键「经典形象」 */
export const cshDynamicSkins = (function () {
	const out = {};
	for (const key in MAIN) {
		const base = MAIN[key];
		if (FORM2[key]) {
			// 变身态（觉醒后）：千幻 eval(transform.cshForm2) 直接拿到配置对象
			base.transform = { cshForm2: FORM2[key] };
		}
		out[key] = {};
		out[key][KEY] = base;
	}
	return out;
})();

/* 觉醒形态映射：武将 → { skills:[觉醒技], staticSkin:觉醒立绘, dynamic2:有无第二形态动皮 } */
export const cshAwakenForms = {
	csh_zhonghui: { name: "钟会", skills: ["csh_zili"], staticSkin: "csh_zhonghui_2", dynamic2: true },
	csh_ae: { name: "张飞", skills: ["csh_yn"], staticSkin: null, dynamic2: false },
	csh_sunshangxiang: { name: "孙尚香", skills: ["csh_ssx_jiaozong"], staticSkin: null, dynamic2: false },
	csh_sq: { name: "孙权", skills: ["csh_jianwu"], staticSkin: null, dynamic2: false },
	csh_sj: { name: "孙坚", skills: ["csh_hunying"], staticSkin: null, dynamic2: false },
	csh_msmy: { name: "司马懿", skills: ["csh_sbaiyin", "csh_pt"], staticSkin: null, dynamic2: false },
	csh_mlm: { name: "吕蒙", skills: ["csh_niming"], staticSkin: "csh_mlm_2", dynamic2: false },
	csh_szc: { name: "关羽", skills: ["csh_guanyu_wusheng"], staticSkin: null, dynamic2: true },
	csh_dengai: { name: "邓艾", skills: ["csh_zaoxian"], staticSkin: null, dynamic2: false },
	csh_caoang: { name: "曹昂", skills: ["csh_tuofan"], staticSkin: null, dynamic2: false },
};

/* 仅供 tools 校核：动皮素材清单（key → 皮肤目录） */
export const cshDynamicDirs = {"csh_zhonghui": "csh_zhonghui/17306_1", "csh_zhugeke": "csh_zhugeke/11803_2", "csh_zhuran": "csh_zhuran/18208_1", "csh_bfsm": "csh_bfsm/1205_2", "csh_mzj": "csh_mzj/2109_1", "csh_zhangxingcai": "csh_zhangxingcai/12405_1", "csh_ngwt": "csh_ngwt/3205_2", "csh_ae": "csh_ae/304_1", "csh_zhangbao": "csh_zhangbao/11903_2", "csh_yujin": "csh_yujin/16002_1", "csh_xuchu": "csh_xuchu/1903_1", "csh_xingganning": "csh_xingganning/904_2", "csh_wolongzhuge": "csh_wolongzhuge/3706_1", "csh_sunshangxiang": "csh_sunshangxiang/2510_1", "csh_sq": "csh_sq/810_2", "csh_sj": "csh_sj/4404_2", "csh_msmy": "csh_msmy/1609_1", "csh_mmhz": "csh_mmhz/2606_1", "csh_mlm": "csh_mlm/1006_1", "csh_mlb": "csh_mlb/2303_2", "csh_ls": "csh_ls/4909_1", "csh_jjxs": "csh_jjxs/15803_1", "csh_qw": "csh_qw/4808_1", "csh_jzh": "csh_jzh/30706_1", "csh_szc": "csh_szc/30011_2", "csh_guanyinping": "csh_guanyinping/11510_1", "csh_diaochan": "csh_diaochan/10904_1", "csh_dengai": "csh_dengai/5107_1", "csh_caoang": "csh_caoang/12204_2", "csh_caiyan": "csh_caiyan/5710_2"};
