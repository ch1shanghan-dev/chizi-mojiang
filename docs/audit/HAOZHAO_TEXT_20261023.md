# 郝昭技能文字精简与 Poptip 核验 · 2026-10-23

## 变更与边界

已读取扩展 `AGENTS.md`、README、`docs/dev-rules.md`、`docs/first-principles.md` 及桌面 `池子魔将_Codex短版工作指南.md`，按指南第 2 项实施。

运行文件仅改 `skills/index.js:31877` 的 `csh_juwei_info`，最终显示：

> 当你成为牌的唯一目标时，你可以选择一项：①令此牌不可响应，X+1；②摸X张牌；背水：令此牌额外结算一次。（X初始为1）

“背水”仍由真实 `get.poptip("rule_beishui")` 生成，不以普通文字或自造链接替代。正文不重复解释背水内含的依次执行其他选项及后果可执行条件。选项面板保留现有实时 X 数值与背水不可选原因，规则实现不变。

本轮未改技能规则、武将 AI、2/3 体力与 1 护甲、其他武将、立绘或经济模块。未提交、未发布、未导入或读取玩家 profile。开始前已记录未提交状态，保留既有工作区改动。

修改前备份在扩展外：`<LOCAL_EVIDENCE>/20261023-haozhao-text/`，包含 `skills-index.before.js`、`probe_haozhao.before.mjs`、`probe_haozhao_ui.before.mjs`。

## 真实机制与宿主 API

| 核对项 | 当前实现证据与结论 |
| --- | --- |
| X 初始与保留 | `skills/index.js:441`，仅非数字 storage 初始化为 1；再次初始化保留既有数字。没有回合重置。 |
| 增长与读取 | `skills/index.js:487`，选项一使整张牌对存活/已死角色均 directHit，X++ 并同步；选项二读取当前 storage。背水先 X++，再摸增长后的 X。 |
| 唯一目标与自身 | `skills/index.js:451`，按真实 useCard 父事件的唯一目标判断，不排除使用者本人；排除已取消目标与本次已询问目标。 |
| 背水可选性 | `skills/index.js:457`，排除装备、延时、需要整组前后处理/复合目标的牌；父事件必须支持处理器，当前仍是有效唯一目标。content 在确认后再次核验。 |
| 额外结算 | `skills/index.js:500`，原目标首个原生 card 子事件结束后，追加恰好一个同一 useCard 父事件下的 card 子事件，保留原卡、牌实体、来源、伤害/目标参数及 directHit，不重新使用牌或重新指定目标。目标离场/被移除/被排除时不追加。 |
| Poptip 生成 | 宿主 `noname/get/index.js:7187` 的 `get.poptip` 调用 `lib.poptip.getElement`；`noname/library/poptip.js:140` 返回 `<noname-poptip poptip = rule_beishui>` 元素。 |
| Poptip 词条与交互 | 宿主 `noname/library/poptip.js:14` 确有 `rule_beishui` 官方词条，含“依次执行其余选项，再执行后果”及无法执行后果不可选；同文件注册真实自定义元素，点击调用真实 `get.poptipIntro`。 |

本次核对和针对性探针未发现必须修改规则的缺陷，故仅改说明，不扩大到机制修复。

## 已执行验证

| 命令/检查 | 结果 | 实际覆盖范围 |
| --- | --- | --- |
| `node tools/probe_haozhao.mjs` | **43 通过 / 0 失败** | 实际技能及已安装宿主 GameEvent、事件编译器、useCard 目标结算步骤、原生牌 content；玩家动作/技能分发为隔离夹具。 |
| `node tools/probe_haozhao_ui.mjs --out docs/audit/ui/haozhao-text-20261023` | **6 通过 / 0 失败** | 全新临时 Chromium profile；真实 PoptipManager/HTMLPoptipElement/Get.poptipIntro；DOM 对话框工厂为适配器，非完整游戏界面。 |
| `node tools/check.js` | **通过** | 60 文件语法、自由变量、import、技能/翻译、既有门禁及版本一致性；2 类原有非阻断告警（部分子技能缺译名、未列入发布 files 的目录/开发文件）。 |
| 修改保护 | **通过** | 用 AST 定位并剔除唯一 `csh_juwei_info` 表达式后，当前 `skills/index.js` 与修改前备份逐字符完全一致；CRLF 数均为 32814。规则、AI 与其他说明保持原字节。 |

规则探针具体覆盖：X 初始 1、保留旧值、①增长不摸、②读当前值不增长、背水先增再摸；杀的闪响应开关与两次原生结算；无中生有自身唯一目标（技能摸 2 + 原牌两次共摸 4）；原生桃自身唯一目标的两次回复 content（含首次已回满时再次执行）；原生决斗两次伤害 content；装备/延时仍可选①②但禁背水；复合目标、目标转移/追加、取消、排除、离场、重复触发、首效果取消、原参数保留、当前牌不可无懈及下一张牌恢复独立响应。既有护甲与只读 AI 断言沿用，未新增或改写 AI。

本轮给 `tools/probe_haozhao.mjs` 增加三项桃/决斗断言，给 UI 探针增加精简正文完整匹配、输出目录参数与关闭后的文案截图，避免覆盖旧审计图片。

截图位于：

- [精简正文](ui/haozhao-text-20261023/concise-description.png)
- [真实背水词条点击展开](ui/haozhao-text-20261023/portrait-and-poptip.png)

已目视检查隔离浏览器截图：背水显示正确词条名称，弹窗包含依次执行和后果限制。截图中的立绘仅为当时磁盘现有图，不构成本轮立绘验收。

## 仍需真实游戏验收

以上属于可运行的宿主源码级事件探针与隔离浏览器交互验证，不能写成完成无名杀实战。尚未执行完整客户端对局、联机、手机触摸、其他扩展覆盖的真实界面验收；实际伤害/回复动作由夹具记录，不代表真实濒死、死亡、护甲与其他武将技能全部交互均已实战通过。

真实游戏建议按①/②/背水各选一次，检查 X 标记与先增后摸；用他人对郝昭的杀/决斗、自身无中/桃确认额外结算；用装备/延时确认背水不可选；点击背水展开/关闭并检查触摸端。发现规则交互问题后，应另行提交证据和最小修复范围，不借文字任务修改机制。
