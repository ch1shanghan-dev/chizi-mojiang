# 神将补选势力与势力面板滚动审计

> 后续状态：作者决定从设置页隐藏并在运行时停用两项功能，将其责任留给相关扩展。本报告以下记录是历史调查结论，不代表当前版本启用这些功能；本轮不执行功能测试。

2026-10-21，实际安装目录 `D:/noname/resources/app/extension/池子魔将`，版本 **4.0.9**。
本轮修复已写入安装目录；未提交、推送或发布。未修改玩家配置或存档。

## 当前定位

这两项作为独立、默认关闭的兼容兜底保留。外部扩展只要使用引擎势力弹窗，就可单独使用面板自适应，不必开启本扩展的神将补选。

| 设置项 | 启用后做什么 | 何时适用 |
| --- | --- | --- |
| 神将补选势力 | 在 `gameStart` / `enterGame` 补问仍未选势力的神将 | 原流程漏选；只处理角色原始势力为 `shen`、当前势力未被别人改走的角色 |
| 势力面板尺寸自适应 | 势力弹窗限宽/限高，内容纵向滚动；势力控制条限宽并横向滚动 | 势力过多、面板截断或控制条滚不动；可以处理其他扩展触发的原生面板 |

两项均为 `init:false`，运行时要求配置显式 `true`；缺键也关闭。没有替玩家启用。
补选尊重引擎 `choose_group === false`；国战、devil、普通角色、双势力、initGroup 和隐藏技能均让开。
只调整显示不能修复外部扩展未注册势力、缺译名或错误候选列表。

## 来源调查：目前不能确认唯一责任扩展

本机引擎文件是本轮依据，未据旧文档猜测上游行为：

- `noname/get/index.js::selectGroup`：神将判定依赖引擎 `choose_group`；`noname/library/skill.js::_doublegroup_choice` 只补双势力。
- `mode/identity.js` 有选将期神将势力选择；因此身份场通常由原流程完成，本扩展只在仍未处理时兜底。
- `noname/library/element/player.js::changeGroup`：第三参数只有字符串 `"nobroadcast"` 才禁止广播，布尔 `false` **不会**禁止。本轮使用 `await player.changeGroup(group, false)`，第二参数只关闭日志，保留原生广播语义。这里不等于完成联机验证。
- 本机 `extension/十周年UI/src/skills/sub-skills.js::_slyh`：非国战、`player.group` 存在且未注册进 `lib.group` 才接管，候选为前五个势力。通常不会处理已注册的 `shen`，不能据其高优先级推断它必然先处理所有神将。
- 当前安装清单中没有旧记录提及的“综漫季刊八”。旧 CHANGELOG 的 `group_zm8*` 归因保留为历史记载，不能当作当前复核结果；“其他扩展增加 lib.group”本身也不等于证明其修改了窗口布局。

目前有证据的是：大量势力及宿主/UI 的宽度与缩放组合会触发边界问题；本扩展旧辅助层也有自己的生命周期缺陷。尚未复现到能够唯一指认某个外部扩展的现场。
后续若再遇到现场，应记录模式、已启用扩展、`lib.group` / `lib.translate`、`kamiStatus()` 和面板矩形，再隔离复现；不需要先找到原作者才能修好兜底层。

## 本轮确认并修复的问题

| 问题与触发 | 根因 | 当前行为 / 验收 |
| --- | --- | --- |
| filter 通过后别的扩展先改了势力；或等待选择期间关开关/换角色/换模式 | content 及 await 后未重新验证 | 三次判定；其他流程已接管就丢弃迟到选择；并发调用只开一个选择框 |
| 选择取消、chooseButton 或 changeGroup 报错后一直不能补选 | `_groupChosen` 提前写入后从不释放 | 预留有独立 WeakMap 令牌；失败只归还自己的标记，保留别人的已选状态；记录诊断原因 |
| 非候选返回值被采纳 | 只检查 `group_` 前缀 | 返回势力必须同时属于打开时和完成时的候选列表 |
| 关闭自适应后原样式丢失 | 直接清空一批属性，连本层从未写入的 width/padding 也清空 | 按属性记原值及 important；只撤回仍归本层持有的值，保留宿主后写值 |
| 包裹插入、面板复用、文本变化、后注册势力失效 | 只看新增节点/只加标记，名字集合缓存不更新 | 分帧处理变更、识别子树与祖先、重新判定并释放旧标记；现算势力译名 |
| “查看势力技能说明”“请选择魏势力武将”误命中 | 标题只要含“势力”就接管 | 标题须是势力选择语句；菜单明确排除，普通武将选择对照通过 |
| 缩放2/矮屏对话框及窄屏长控制条仍越界 | 最小宽高硬下限、控制条锚点偏移、padding 未计入封顶 | 真实矩形/offset 换算局部 px；撤销不合屏幕的硬下限；控制条 border-box 并钳制最终位置 |
| 窗口大小变化不更新、已移除面板留着补丁样式 | 缺 resize / 重验 / 释放路径 | resize 与 visualViewport resize 更新，移除/关闭恢复；无轮询 |

仍沿用引擎 `.content-container` 作为唯一纵向滚动容器；不截断 `.buttons`，不给按钮墙写 width 或额外 padding。
正常尺寸的 dialog/按钮宽度保持原值；超屏才触发 max-width/max-height。MutationObserver 的自身样式写入会被忽略，变更通过 requestAnimationFrame 合批。

修改位置：`core/csh_rules.js`、`main/content.js`、`main/config.js`；未改其他扩展或宿主源码。
本轮没有新增持久化字段。此前第三批市场检查点的存档契约另见 [第三批报告](THIRD_BATCH_20261021.md)。

## 验证

| 检查 | 改前 | 当前 | 范围 |
| --- | --- | --- | --- |
| `node tools/probe_kami.cjs` | **43/18** | **61/0** | 实际规则模块 + VM 宿主桩，原42项和19项异步生命周期断言 |
| `node tools/probe_eg_scroll.mjs` | **30/19** | **49/0** | 实际 content 辅助函数 + 本机引擎 layout.css + 隔离 Chromium |
| 旧宽度入口 `node tools/probe_egwidth.cjs 375 667 0.5 24 140` | — | **56/0** | 相同49项 + 指定尺寸下3档父宽、末项点击及正常宽度对照 |
| 旧 noflash 入口 `node tools/probe_egnoflash.cjs` | — | **49/0** | 已委托实际源码专项，正常窗口宽度对照仍在 |
| `node tools/check.js` | — | **通过，2项既有告警** | E45 按有归属的样式写入更新检查，继续禁止 width/padding 回归；E49 默认关闭等原约束保留 |
| `node tools/simulate_world.js` | — | **188/0** | 世界、存档、结算桥和11页内联脚本 |

Chromium 矩阵：1200×820/scale1、390×844/scale1、915×412/scale0.4、740×360/scale2、915×412/zoom0.6。
实际发送纵向/横向 mouseWheel，滚到底后通过 `elementFromPoint` 验证末项接收指针；不是只看 scrollHeight 或元素存在。
同时覆盖宿主样式还原、important、后来写入的样式、包裹插入、动态注册、文本变化、面板复用、移除及20次开关后不再接管。
对比采用同轮备份源文件与同一测试，而非复制旧算法。旧 `probe_egwidth` / `probe_egnoflash` 曾仍复制已废弃的主动 width/padding 方案，本轮已替换为真实源码入口；不再往 tools 目录生成测试 HTML。

机器证据：[改前滚动](eg-scroll-before.json)、[当前滚动](eg-scroll-after.json)、[附加尺寸](eg-scroll-custom.json)、[本轮汇总](kami-scroll-results.json)。
浏览器/VM 通过不等于无名杀完整对局、十周年UI全流程、安卓触摸或联机验收。
按此前“先不实机”的安排，游戏内验收继续保留：身份原流程不重复弹、斗地主/对决漏选时补选、他人原生弹窗仅开自适应、手机触摸滑动到末项、联机各端势力一致。

## 本地交付与备份

- 前一轮市场/恩怨/焦点补丁已于本轮开始写入实际安装目录，并同步本机 skill；应用脚本通过主门禁与世界188/0。此前“仅隔离副本”是交付时历史状态，已解除。
- 应用备份：`C:/Users/Chishanghan/AppData/Local/Temp/chizi-maintenance-20261021/deliverables/backups/20261021_172004_748224`。
- 本轮势力模块改前备份：`D:/noname/_backup/codex-20261021/kami-scroll-20261021`。另有 `池子魔将_20261021_172152_slim` 未完成的备份目录，不作完整回退依据。
- 版本仍4.0.9，本轮未自动提交、推送、打tag或发布。
