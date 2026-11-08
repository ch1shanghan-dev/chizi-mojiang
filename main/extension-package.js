/* 正常启动时才装载完整业务包。恢复中的启动由扩展入口单独处理。 */
import "../decadeUI-compat.js";
import "./bootstrap.js";
import { cshContent } from "./content.js";
import { cshPrecontent } from "./precontent.js";
import { cshConfig } from "./config.js";
import { cshHelp } from "./help.js";
import cshCharacter from "../character/index.js";
import "../character/boss.js";
import cshCard from "../card/index.js";
import cshSkillPack from "../skills/index.js";

export function createPackage(metadata){
	return {name:"池子魔将",editable:false,connect:true,content:cshContent,precontent:cshPrecontent,help:cshHelp,config:cshConfig,package:{
    character: cshCharacter,
    characterSubstitute: {
        "csh_mingrixiang": [
            ["csh_mingrixiang_eva", ["img:extension/池子魔将/image/csh_mingrixiang_eva.jpg"]],
            ["csh_mingrixiang_xinmo", ["img:extension/池子魔将/image/csh_mingrixiang_xinmo.jpg"]],
        ],
        // 仅玩法改立绘（换肤UI已关；image/skin 资源已无）
        "csh_liximing": [
            ["csh_liximing_zifu", ["img:extension/池子魔将/image/csh_liximing_zifu.jpg"]],
        ],
        "csh_bin": [
            ["csh_bin_qinggangying", ["img:extension/池子魔将/image/csh_bin_qinggangying.jpg"]],
            ["csh_bin_wuqidashi", ["img:extension/池子魔将/image/csh_bin_wuqidashi.jpg"]],
            ["csh_bin_mishizhiya", ["img:extension/池子魔将/image/csh_bin_mishizhiya.jpg"]],
            ["csh_bin_wushuangjianji", ["img:extension/池子魔将/image/csh_bin_wushuangjianji.jpg"]],
            ["csh_bin_anyijianmo", ["img:extension/池子魔将/image/csh_bin_anyijianmo.jpg"]],
            ["csh_bin_tiexuelangmu", ["img:extension/池子魔将/image/csh_bin_tiexuelangmu.jpg"]],
        ],
        "csh_zuozhu": [
            ["csh_zuozhu_qianniao", ["img:extension/池子魔将/image/csh_zuozhu_qianniao.jpg"]],
            ["csh_zuozhu_zhouyin", ["img:extension/池子魔将/image/csh_zuozhu_zhouyin.jpg"]],
            ["csh_zuozhu_xuzuo", ["img:extension/池子魔将/image/csh_zuozhu_xuzuo.jpg"]],
        ],
        "csh_zhonghui": [
            ["csh_zhonghui_2", ["img:extension/池子魔将/image/csh_zhonghui_2.webp", "die:ext:池子魔将/audio/die/csh_zhonghui.mp3"]],
        ],
        "csh_mlm": [
            ["csh_mlm_2", ["img:extension/池子魔将/image/csh_mlm_2.webp", "die:ext:池子魔将/audio/die/csh_mlm.mp3"]],
        ],
        "csh_maochao": [
            ["csh_maochao_shen", ["img:extension/池子魔将/image/csh_maochao.webp", "die:ext:池子魔将/audio/die/csh_maochao.mp3"]],
        ],
        "csh_yangjian": [
            ["csh_yangjian_1", ["img:extension/池子魔将/image/csh_yangjian_1.jpg", "die:ext:池子魔将/audio/die/csh_yangjian.mp3"]],
            ["csh_yangjian_2", ["img:extension/池子魔将/image/csh_yangjian_2.jpg", "die:ext:池子魔将/audio/die/csh_yangjian.mp3"]],
            ["csh_yangjian_3", ["img:extension/池子魔将/image/csh_yangjian_3.jpg", "die:ext:池子魔将/audio/die/csh_yangjian.mp3"]],
            ["csh_yangjian_4", ["img:extension/池子魔将/image/csh_yangjian_4.jpg", "die:ext:池子魔将/audio/die/csh_yangjian.mp3"]],
            ["csh_yangjian_5", ["img:extension/池子魔将/image/csh_yangjian_5.jpg", "die:ext:池子魔将/audio/die/csh_yangjian.mp3"]],
            ["csh_yangjian_6", ["img:extension/池子魔将/image/csh_yangjian_6.jpg", "die:ext:池子魔将/audio/die/csh_yangjian.mp3"]],
            ["csh_yangjian_7", ["img:extension/池子魔将/image/csh_yangjian_7.jpg", "die:ext:池子魔将/audio/die/csh_yangjian.mp3"]],
            ["csh_yangjian_8", ["img:extension/池子魔将/image/csh_yangjian_8.jpg", "die:ext:池子魔将/audio/die/csh_yangjian.mp3"]],
            ["csh_yangjian_9", ["img:extension/池子魔将/image/csh_yangjian_9.jpg", "die:ext:池子魔将/audio/die/csh_yangjian.mp3"]],
            ["csh_yangjian_10", ["img:extension/池子魔将/image/csh_yangjian_10.jpg", "die:ext:池子魔将/audio/die/csh_yangjian.mp3"]],
        ],
    },
    card: cshCard,
    skill: cshSkillPack,
    ...metadata,
  }};
}
