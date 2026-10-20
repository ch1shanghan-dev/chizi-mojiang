# 上游研究：依据与适配

研究始于 2026-10-20，整理于 2026-10-21。以下是实际读取的一手源码/文档，
GitHub 固定到 commit；上游发现要回到本机 1.11.6 运行 JS 再核对。

## Noname 官方

[libnoname/noname](https://github.com/libnoname/noname) 研究 main 固定在 a15a1e4f0433cc4d46421530bfe93b7873f97dbd。
[v1.11.6 对应提交](https://github.com/libnoname/noname/commit/2367607e246d21aae168dba15c01151ee0651f30) 供版本对照；本机声明同版本不等于文件已逐字匹配。
已读：[启动主线](https://github.com/libnoname/noname/blob/a15a1e4f0433cc4d46421530bfe93b7873f97dbd/docs/game-startup-flow.md)、
[UI](https://github.com/libnoname/noname/blob/a15a1e4f0433cc4d46421530bfe93b7873f97dbd/apps/core/noname/ui/index.js)、
[game](https://github.com/libnoname/noname/blob/a15a1e4f0433cc4d46421530bfe93b7873f97dbd/apps/core/noname/game/index.js)、
[设置菜单](https://github.com/libnoname/noname/blob/a15a1e4f0433cc4d46421530bfe93b7873f97dbd/apps/core/noname/ui/create/menu/pages/optionsMenu.js)。

影响本项目决策的结论：

- import 与合并进 lib 不是同阶段，arenaReady 前后能力不同。入口需处理懒模块未到与失败，不能误判为功能不存在。
- ui.updatez 改 body 尺寸并使用 transform。documentElement 浮层按真实视口布局，不能再跟 body 缩放。
- game.over 内存在 lib.onover（上游约 7253 行，本机约 6799 行），**不是没有结束观察入口**。但它在后段，swap/over 状态可能已改变；需要结束前快照时不能机械替换 wrapper。
- game.saveConfig 使用异步 save(...).then(callback)，不返回该 Promise（上游约 9833 行，本机约 9301 行）。同步 try/catch 不能覆盖稍后的失败；即使改用 promises 包装，也须核对 reject/失败通道。
- 自定义设置 onclick 要自行落盘，init 不是每次强制复位旧档的默认值。UI、运行开关和已安装监听器要对应。

上游是 monorepo，TS 源与本机打包 JS 路径不同。本次 loading.js 返回 404 后核对目录，实际为 loading.ts。
先发现文件再引用，不因旧路径失效就断言接口不存在；不要求池子魔将迁入官方 monorepo。

## 十周年 UI

固定提交 693df2020dc717ed20636fd0170629df71fcee1e 的
[update.js](https://github.com/zziyoo/decadeUI/blob/693df2020dc717ed20636fd0170629df71fcee1e/src/overrides/ui/update.js) 与
[base.js](https://github.com/zziyoo/decadeUI/blob/693df2020dc717ed20636fd0170629df71fcee1e/src/overrides/ui/base.js)：

- uiUpdatez 使用 body.style.zoom 并清空 transform，不能只检测 transform。
- uiUpdate 分手机/桌面算高度，不假定原生固定高度或仅按 class 猜布局。
- base 保存上一层方法引用。借鉴保留上一层、原样透传和幂等安装，不覆盖其他扩展 wrapper。

落点：调试、胜率、互动和壳至少覆盖原生/十周年UI两种宿主；不复制整套样式，不把其内部函数当永久公共 API。

## AI 记忆：Generative Agents

固定提交 fe05a71d3e4ed7d10bf68aa4eda6dd995ec070f4 的
[retrieve.py](https://github.com/joonspk-research/generative_agents/blob/fe05a71d3e4ed7d10bf68aa4eda6dd995ec070f4/reverie/backend_server/persona/cognitive_modules/retrieve.py) 与
[reflect.py](https://github.com/joonspk-research/generative_agents/blob/fe05a71d3e4ed7d10bf68aa4eda6dd995ec070f4/reverie/backend_server/persona/cognitive_modules/reflect.py)：

- 检索候选记忆后分别归一化 recency/importance/relevance 再组合；反思结果保留证据节点引用。
- 借鉴“事件事实→检索→有证据的关系概括→表现”，不等于必须接 LLM/embedding。
- 池子固定分数/台词池是规则近似：relevance 恒为 1、recency 以配对次数代理，不宣称等价实现原模型。
- 先修事件时序、方向和生命周期，再调权重/加台词。结构化 actor/target/kind/turn/session 是候选设计，实施前控制规模和兼容。

落点：recordEvent/riposte/fire 与世界成对 grudge；冷启动没有旧账，旧局的延迟回嘴不应进入新局。

## 模态与可验证 UI

依据：[WAI 模态模式](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)、
[WCAG 目标尺寸](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)、
[Playwright actionability](https://playwright.dev/docs/actionability)、[设备模拟](https://playwright.dev/docs/emulation)。

- 模态需 dialog/label、进入焦点、Tab 范围、Esc 和退出焦点恢复；span.focus 不赋予按钮语义。
- 项目重要触摸按钮 ≥44px 是既有设计目标；WCAG 2.2 AA 2.5.8 通常最低 24×24 CSS px 且有例外，不能混说。
- 可见不等于能接收点击，验收实际事件和遮罩；不用 force click 掩盖层叠错误。
- 模拟覆盖可控视口/触摸条件，不代替安卓 WebView、软键盘和系统返回键实机。

落点：确认框、调试嵌套浮层、统计导入导出与行囊，同时验证生命周期和几何。

## 池子远端

[研究快照](https://github.com/ch1shanghan-dev/chizi-mojiang/tree/b71ccd484fcee48b17e4cf4ebd4dba3f7021a7fb) 经 Git tree 核对与本地 adcee8d 内容一致。
旧 external-research/tech-plan 用作线索，不自动承认其“已完成”状态。研究阶段仅建立 skill、证据和元数据；后续第一批已修复 UI-01/ST-01，当前状态与验证范围查 backlog。
