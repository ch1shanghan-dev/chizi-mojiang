/* 【2026-09-30 修复】noname 绑定必须在本文件再 import 一次。
   P1 拆分时把第 1 行的 import 一并搬进了 main/bootstrap.js，却漏了本文件自己也需要：
   package.skill 区块引用了 get.(1788) / game.(839) / lib.(523) / _status.(357) / ui.(170) / ai.(19)
   共约 3700 处，缺 import 会让**所有技能**在运行时抛 ReferenceError。
   【2026-10-04】skill 区块已整体拆到 ./skills/index.js（自带同一组 import），
   本文件的 noname import 保留——门禁 tools/check.js 会同时盯两个文件。
   教训：node --check 只查语法，查不出未定义变量；已把自由变量扫描并入 tools/check.js 常驻门禁。 */
import { lib, game, ui, get, ai, _status } from "../../noname.js";
import "./decadeUI-compat.js"; // 十周年UI接入兼容（全局暴露 setupDecadeUICompat），未装十周年UI时静默跳过
import "./main/bootstrap.js";
import { cshContent } from "./main/content.js";
import { cshPrecontent } from "./main/precontent.js";
import { cshConfig } from "./main/config.js";
import { cshHelp } from "./main/help.js";
import cshCharacter from "./character/index.js";
import cshCard from "./card/index.js";
import cshSkillPack from "./skills/index.js";

export const type = "extension";
export default function(){
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
            ["csh_maochao_shen", ["img:extension/池子魔将/image/csh_maochao_shen.jpg", "die:ext:池子魔将/audio/die/csh_maochao.mp3"]],
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
    intro: "<font color=#c9a84c>版本</font> <font color=#00FFFF>4.0.5</font>",
    author: "池上寒",
    diskURL: "",
    forumURL: "",
    version: "4.0.5"
}}
}
