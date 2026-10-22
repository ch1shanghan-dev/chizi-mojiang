# 郝昭实现报告

> 后续发版：作者已授权4.0.10，发版前验证与导入包信息见 [发布记录](docs/audit/RELEASE_4_0_10.md)。下面“未发布、4.0.9”等为本实现批完成时的历史状态。

2026-10-22，按桌面《池子魔将新增武将「郝昭」.md》实施。报告按任务书指定放根目录；其他审计资料仍放 docs/audit。既有武将AI优化已暂停，新增武将所需基础AI保留。未提交、推送、发布或更新桌面ZIP；版本保持4.0.9。

## 已完成集成

- 武将 `csh_haozhao`，技能 `csh_juwei` / `csh_chonglei`。采用全包统一的 `csh_`，不占用本体 `haozhao`，也未引入另一套 `chizi_` 命名。
- 男、魏，直接注册 `hp:2 / maxHp:3 / hujia:1`；不是入场失去体力。称号“孤城不摧”，归入“烬火 · 防御”。名册现在100人。
- 稀有度沿用实际枚举 `lib.rank.rarity.legend`，由现有选将稀有度系统消费；未发明新字段。
- 立绘取自桌面 **郝昭.png**（876×632）。等比裁切源矩形 `(175,0,536,632)` 后缩放为400×472，JPEG质量92，目标 `image/csh_haozhao.jpg`，64,220字节；保留头盔、面部、躯干重心，无拉伸，原图未覆盖。此包普通武将使用同一主图注册，无独立缩略图清单。阵亡语音复用本体已存在的 `audio/die/haozhao.mp3`，未杜撰新技能语音。
- 图片已进入本地catalog；package目录清单本就包含image，已同步体积。生成catalog仅在本地运行工具，未执行 `--push`。
- 本次未设计郝昭魔王档位/专属技，明确列入 `BOSS_EXCLUDED`，保留原93魔王阵容；普通选将与挑战者使用不受影响。

## 拒围与重垒的真实路径

拒围在 `target:useCardToTargeted`、`lastDo:true` 检查原useCard的实际唯一目标，包含自己对自己用牌。用牌事件内按玩家去重，取消后也不会因同一张牌再次指定而反复弹窗；下一张牌重新判断，不设回合次数限制。

X在玩家storage中仅缺省初始化为1，选择①增加并同步storage；②读当前值摸牌，不改X。背水先封当前牌响应并令X+1，再按增长值摸牌，最后安排额外牌效果。标记实时显示X，不按阶段或轮次重置，不加数值上限。技能失去/重新挂载不主动清空已有X。

不可响应复用本体应变“hit”的做法：当前用牌的 `directHit` 加入在场及阵亡角色。它约束当前牌的【闪】与【无懈可击】响应，不将牌视为必然生效，不修改后续牌。选择框有①、②、背水及取消；不支持背水时没有可点击的背水控制项，并显示原因。

本机的 `effectCount` 是整组targets重复，直接加1会使后续追加目标也重复。实现改用原useCard的局部 `onUseCard` end处理器：原牌效果及子链结束后，在同一个useCard父事件下追加一次正常的牌效果子事件。复用原卡实体、来源、baseDamage、preResult及目标customArgs，强制目标为郝昭；保留默认Before/Begin/End/After及响应流程。不创建第二个useCard，不再指定目标、不消费第二张实体、不新增用牌次数。处理器仅执行一次；即使原牌效果被取消，也不会漏掉应有的额外效果；原用牌已全体无效、目标移除/转移/排除或死亡退场则按合法性跳过。

装备、延时锦囊，以及具有整组contentBefore/contentAfter、multitarget或附加目标流程、不能安全独立重放的特殊牌，禁用背水，①②仍可选。没有强行重复装备或挂判定牌。此限制基于本机能力；不承诺未知扩展自定义牌的特殊重放规则。

宿主依据：`noname/library/element/content.js::useCard` 的目标事件、牌效果构造与整组effectCount循环；`GameEvent/compilers/ArrayCompiler.js` 的waitNext/end顺序；`game/index.js::createEvent` 的指定父事件；`card/standard.js::_wuxie`。额外事件的trigger参数使用默认值，不能传false，否则会跳过原生响应时序。

重垒监听实际 `changeHp`，以 `player.hp !== event.originalHp` 过滤。只扣护甲、满血无效回复、只变上限而HP不变都不发甲；一次变化2点仍只加1甲，负体力区间变化也能识别。初始化直接赋值不触发changeHp；不自定义护甲上限，不把护甲当濒死回复。

“背水”描述使用加载时执行的 `get.poptip("rule_beishui")`。这是本机官方词条ID，原生noname-poptip元素能点击打开完整规则，未把模板表达式当纯文本。

新增基础AI按当前牌的真实effect、伤害/失体力/回复标签、X、自身血量、手牌及背水合法性选择：正收益无中生有允许背水，伤害牌默认②保留响应，缺血不足时不为重复回复盲目背水，X较大时不会继续无意义增长。没有读取对方暗手牌；不改任何旧武将的AI。

## 验证结果与界限

- `node tools/probe_haozhao.mjs --baseline D:/noname-audit-backups/chizi-mojiang/20261022-haozhao/skills_index.js.before`：**41/0**。专项执行本机真实GameEvent、ArrayCompiler、用牌目标/结算步骤、无中生有/杀、Wuxie候选过滤与changeHp；触发技能分发和玩家输入使用隔离桩，未接触真实存档。
- 覆盖初始注册/native Character转换、稀有度、X=3三项选择、无中生有总6张、取消、多目标/加目标/移除/转移/死亡、首效果取消、实体/父事件保持、目标customArgs、杀闪与无懈、下一张牌响应恢复、千点X增长、护甲抵伤和真实HP变化、基础AI。完整AST比较剔除新增两技及其翻译后，**已有技能（含旧AI）保持一致**。
- `node tools/probe_haozhao_ui.mjs`：真实Chromium **5/0**。使用官方PoptipManager、HTMLPoptipElement和Get.poptipIntro，验证官方解释可打开/关闭、无残留层、图片正确解码；dialog工厂为DOM适配器，是隔离预览，**不是完整宿主选将界面验收**。截图：`docs/audit/ui/haozhao/portrait-and-poptip.png`。
- `node tools/check.js`：通过，2项既有告警（旧技能译名、开发目录未打包），没有新增失败。
- `node tools/simulate_world.js`：**188/0**，新名册进入世界，12人小名册回归保持。
- 静态索引：100普通武将、576顶层技能、225子技能、93魔王、50妖灵。结构完整不等于全技能语义或实战验证。

**待实机验证**：完整无名杀中的选将/详情/对局头像、真实选择框键鼠操作、自动对局、联机/断线重连、回放、关闭扩展后重新开启、多扩展同时修改目标及未知自定义牌交互。这些没有冒充通过；本轮未启动或修改用户真实对局与存档。

## 变更文件与后续顺序

运行文件：`character/index.js`、`skills/index.js`、`main/content.js`、`core/csh_bossdata.js`、`image/csh_haozhao.jpg`、`package.js`、`catalog.js`、`README.md`。

验证/记录：`tools/probe_haozhao.mjs`、`tools/probe_haozhao_ui.mjs`、`docs/audit/inventory.json`、`docs/audit/技能清单.md`、截图、本报告、AGENTS.md、docs/plan.md、CODEX_AUDIT_REPORT及维护skill的优先级记录；skill同步本机可发现副本。原有未提交改动保留，没有重置工作树。

后续先完善其他系统：恢复期间其余模块/页面的直接写入守卫、世界存储失败恢复、AI世界动态与有意义的成就、实际UI问题。既有武将AI优化继续暂停，不以新增武将基础AI为由恢复全名册扩审。
