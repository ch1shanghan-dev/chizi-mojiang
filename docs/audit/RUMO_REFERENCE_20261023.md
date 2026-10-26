# 蚀心入魔真实资源核对（2026-10-23）

## 定位结论与证据等级

作者已明确答复：短版指南所称线下包“入魔篇”就是 **「蚀心入魔」**。据此将目标确定为宿主原生武将包 **`sxrm`**。这个对应关系来自作者澄清；本地代码实际显示名称为“蚀心入魔”，并无字面“入魔篇”的包定义。

- `<NONAME_ROOT>/game/package.js:30-34`：线下系列中登记 `sxrm: "蚀心入魔"`。它与 `offline: "线下武将"` 是不同包，不是 offline 的子分包。
- `<NONAME_ROOT>/character/sxrm.js:4856-4864`：运行打包文件明确列出疑、慢、嗔三组，各9名，共27名；`4866-4881` 注册 `name: "sxrm"` 并将 characterSort 归属 sxrm。
- `<NONAME_ROOT>/src/character/sxrm/index.js:14-23`、`sort.js:1-13`：源模块同样注册 sxrm 与三组名单；`translate.js:4` 译名为蚀心入魔。清单每行保存人物定义、译名与分组源码行锚点。
- 已比对分组集合 = 源码 character 对象全体定义 = 27个唯一ID，且全部在当前运行文件存在。不是从“魔/疑/慢/嗔”前缀推断名单。
- 所有原画位于宿主 `image/character/<精确人物ID>.jpg`，27/27 文件存在、可解码、均为 **350×464 JPEG**；人物定义均无另行 img 覆盖。此处“原画”指本地随包静态原图，不声称是画师原始大图。

`onlyOL_demonized`（OL·魔）、`offline_piracyE_shenmo`（一念神魔）、`offline_piracyS_shenmo`（神魔传）是源码另行登记的系列，未混入此次参考。定位早期产生的 `UNCONFIRMED_*` 只保留为候选调查痕迹，现以 **SXRM_*** 文件为准。

## 完整名称、ID、图片路径

全部为350×464 JPEG，疑9、慢9、嗔9。完整字节数、SHA-256、定义/译名锚点与原图副本路径见外部 `SXRM_ALL_27.csv/json`。

| 分组 | 游戏内译名 | 精确ID | 本地图像 |
| --- | --- | --- | --- |
| 疑 | 魔曹操 | `sxrm_caocao` | `<NONAME_ROOT>/image/character/sxrm_caocao.jpg` |
| 疑 | 疑刘备 | `sxrm_liubei` | `<NONAME_ROOT>/image/character/sxrm_liubei.jpg` |
| 疑 | 疑蒋干 | `sxrm_jianggan` | `<NONAME_ROOT>/image/character/sxrm_jianggan.jpg` |
| 疑 | 疑华佗 | `sxrm_huatuo` | `<NONAME_ROOT>/image/character/sxrm_huatuo.jpg` |
| 疑 | 疑吕伯奢 | `sxrm_lvboshe` | `<NONAME_ROOT>/image/character/sxrm_lvboshe.jpg` |
| 疑 | 疑伏寿 | `sxrm_fuhuanghou` | `<NONAME_ROOT>/image/character/sxrm_fuhuanghou.jpg` |
| 疑 | 疑荀彧 | `sxrm_xunyu` | `<NONAME_ROOT>/image/character/sxrm_xunyu.jpg` |
| 疑 | 疑曹丕 | `sxrm_caopi` | `<NONAME_ROOT>/image/character/sxrm_caopi.jpg` |
| 疑 | 疑王垕 | `sxrm_wanghou` | `<NONAME_ROOT>/image/character/sxrm_wanghou.jpg` |
| 慢 | 魔关羽 | `sxrm_guanyu` | `<NONAME_ROOT>/image/character/sxrm_guanyu.jpg` |
| 慢 | 慢关银屏 | `sxrm_guanyinping` | `<NONAME_ROOT>/image/character/sxrm_guanyinping.jpg` |
| 慢 | 慢于禁 | `sxrm_yujin` | `<NONAME_ROOT>/image/character/sxrm_yujin.jpg` |
| 慢 | 慢糜芳 | `sxrm_mifang` | `<NONAME_ROOT>/image/character/sxrm_mifang.jpg` |
| 慢 | 慢寇封 | `sxrm_liufeng` | `<NONAME_ROOT>/image/character/sxrm_liufeng.jpg` |
| 慢 | 慢陆逊 | `sxrm_luxun` | `<NONAME_ROOT>/image/character/sxrm_luxun.jpg` |
| 慢 | 慢吕蒙 | `sxrm_lvmeng` | `<NONAME_ROOT>/image/character/sxrm_lvmeng.jpg` |
| 慢 | 慢庞德 | `sxrm_pangde` | `<NONAME_ROOT>/image/character/sxrm_pangde.jpg` |
| 慢 | 慢颜良文丑 | `sxrm_yanwen` | `<NONAME_ROOT>/image/character/sxrm_yanwen.jpg` |
| 嗔 | 魔周瑜 | `sxrm_zhouyu` | `<NONAME_ROOT>/image/character/sxrm_zhouyu.jpg` |
| 嗔 | 嗔孙尚香 | `sxrm_sunshangxiang` | `<NONAME_ROOT>/image/character/sxrm_sunshangxiang.jpg` |
| 嗔 | 嗔张昭 | `sxrm_zhangzhao` | `<NONAME_ROOT>/image/character/sxrm_zhangzhao.jpg` |
| 嗔 | 嗔鲁肃 | `sxrm_lusu` | `<NONAME_ROOT>/image/character/sxrm_lusu.jpg` |
| 嗔 | 嗔曹操 | `sxrm_chen_caocao` | `<NONAME_ROOT>/image/character/sxrm_chen_caocao.jpg` |
| 嗔 | 嗔诸葛亮 | `sxrm_zhugeliang` | `<NONAME_ROOT>/image/character/sxrm_zhugeliang.jpg` |
| 嗔 | 嗔贾华 | `sxrm_jiahua` | `<NONAME_ROOT>/image/character/sxrm_jiahua.jpg` |
| 嗔 | 嗔赵云 | `sxrm_zhaoyun` | `<NONAME_ROOT>/image/character/sxrm_zhaoyun.jpg` |
| 嗔 | 嗔曹仁 | `sxrm_caoren` | `<NONAME_ROOT>/image/character/sxrm_caoren.jpg` |

## 原画总览与技术采集

外部目录：`<LOCAL_EVIDENCE>/20261023-rumo-reference/`。

- [全部27名总览](../../../../../../../noname-audit-backups/chizi-mojiang/20261023-rumo-reference/SXRM_ALL_27_OVERVIEW.jpg)（1170×1590）：全体等比缩图、准确译名与ID。
- `SXRM_shixinrumo_yi.jpg`、`SXRM_shixinrumo_man.jpg`、`SXRM_shixinrumo_chen.jpg`：每组9名，900×1280。
- `originals/`：27张本地原图的逐字节副本，复制后SHA-256与来源逐项一致。
- `SXRM_ALL_27.csv`、`SXRM_ALL_27.json`：27行完整技术清单。
- `index.html`：已确认包的可浏览全图预览入口。

总览只做等比缩放、排版与文字标注，无补画、改色、裁改人物。未联网寻找或替换高清图。

## 基于真实27图的风格提炼

以下是对本地原图与总览的视觉观察，不是对人物质量的评级，也不构成其他人物重绘建议。

1. **人物占比与构图**：350×464竖幅普遍以头、肩、胸和手臂占据主要画面，人物贴近观者，头饰、肩甲、飘发、衣袖常贴边或出画；下肢多被截去。人物常转身、俯身或斜向压入画面，脸、手与道具构成紧密的三角或斜线关系。并非一律正面全身站立。
2. **动作与情绪**：多靠眼神、嘴角、皱眉、低头和手势推动戏剧，而非只堆砌战斗烟火。疑王垕的惊惧与伸手、慢庞德迎面冲击、慢颜良文丑两张脸的惊恐、魔周瑜凝视与衣发翻动，表现方式各异；疑荀彧的执笔、疑华佗靠近观者、慢糜芳握持金色器物等则借日常动作埋入心理叙事。
3. **笔触与材质**：属于具象数字绘画的三国卡牌插画，脸部体积经过提炼，轮廓、头发、胡须、布料褶皱与金属边缘有明确笔绘组织。金属用硬亮边与成块反射，布料用大明暗折面，发丝与胡须随动作展开；不应把它转译成摄影棚人像或影视剧照。
4. **光影**：人脸、手、胸甲等叙事重点明亮，周边衣发、远景和背光处压暗，常用侧光、暖色反光或冷色轮廓光增强前后层次。疑荀彧的脸隐藏在帽沿阴影中、手与桌面突出，是叙事选择；慢刘封的暖色火光与受压背景形成戏剧感。不是所有图都高黑位，也不是全包同一套照明。
5. **配色**：全包存在墨黑、冷蓝、青绿、赭色与金属金，也有嗔孙尚香的明亮暖橙、嗔曹操的紫金、嗔鲁肃的青绿与金、嗔赵云的红黑等。需要从人物服装、材质和局部光源组织有限主色，不能统一覆盖成“暗黑三国”滤镜。
6. **背景叙事**：背景可出现屋内梁柱、桌案、建筑、烟尘、火光或景深化色块，通常服务视线与动作；情绪、手势和道具比远处宏大场景更早被看见。人物与背景有重叠遮挡和冷暖分离，画面信息集中在近景人物。

## 对郝昭后续生成的可执行约束

仅供获授权的郝昭使用：以上半身为主要画幅，采用三分之二侧身、前压/格挡/发令等清楚动作；脸、手和防御兵器形成紧密斜线关系，表现陈仓守将临战的坚守与压迫。用克制的城垣、箭矢/尘屑与局部火光交代守城，人物头肩胸臂优先，背景不抢主体。金属、衣褶、发须保持卡牌笔绘质感，避免正面证件照、摄影棚灯光和泛化写实海报。具体颜色与动作仍应在查看真实参考与郝昭既有服装后确定，不从单个前缀推导。

本次只读采集宿主资源并新增本事实报告；没有生成或替换任何武将图，没有改运行源码、AI、存档、版本或发布。技术校验为27张原图可解码、完整成员集合一致、复制哈希一致；不是游戏内裁切验收。后续郝昭生成与宿主实际裁切由主任务处理。
