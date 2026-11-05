# B1 · 成就通知常驻未读与跨重启归档（backlog 推进）

日期：2026-11-05。编制：WorkBuddy。性质：交接第 7 节「成就UI/通知」中 PF-01 的后半项；**不是**发布可靠性 U0—U4 的续修。

## 触发与选择

作者指示：不需要 WorkBuddy 做真机链路验收（本人届时测试）、由 WorkBuddy 决定后续工作、只提供方向、不做无用功与过度工作、backlog 也需要推进。

据此没有开高风险可选项（U3 动态 import / 顶层 await、分块下载、设备空间读取、pre-push 钩子、2000 条生涯页全量审查），而是选了 backlog 里**边界最清楚、不依赖作者素材或玩法数值、能被门禁与反例闭环验证**的一条：交接明确写着「常驻未读和跨重启归档仍待」，`docs/audit/FEEDBACK_READING_20261104.md` 也把 PF-01 标为部分完成，「常驻未读入口、跨重启未读/分页归档与历史索引尚未实施」。

## 缺口实证

`core/csh_achievement_feedback.js` 的 `createAchievementQueue` 只在内存里留 `history`（本次运行最多 200 项），`reset()` 在存档代次变化时清空；`createAchievementFeedback` 的 `storage` 只写显示偏好 `csh_achievement_ui_v1`。因此：进程/页面一重启，通知记录与「有没有看过」全部消失；玩家没有任何全局入口回看，也没有未读提示。

## 改动（2 个运行源码 + 1 个探针）

- **`core/csh_achievement_feedback.js`**
  - 新增本机键 `csh_achievement_archive_v1`：`{v:1,rows:[...]}`，每条含标题/描述/稀有度/奖励展示/时间与 `read` 标记。按 `source:kind:id` 去重，最多 **200 条**（沿用原上限），淘汰最旧并在界面如实写明「仅保留本机最近 200 条展示记录」；写入做 `setItem` 后 readback 校验，失败给可见提示，不谎报已保存、不抛未处理异常。
  - 右下角常驻入口「成就回顾 · 新 N」（无未读时弱化显示），**实例初始化即恢复**，不等下一次通知；44px 触控目标、避开安全区、三横屏不溢出。
  - 归档回顾：每页 20 条、上一页/下一页与页码、逐条「标记已读」、顶部「全部标记已读」，已读状态跨重启保持。
  - 换档隔离：`scope()` 的 generation 变化即清空归档并删键，不把上一档的通知带到新档。
  - 原「本次运行最多保留 200 项」回顾、动画队列、暂停/悬停/触摸阅读、显示设置全部保持原样，只是 `show` 走归档包装。
  - **不写钱包、不改成就条件/定义/奖励/领取凭据**；模块仍是纯展示层。
- **`core/csh_migrate.js`**：新键登记进 `EXCLUDED`，理由「本机展示记录，不随他人存档导入」。按项目约定走豁免表而非键表，避免把别的设备的通知历史带进行囊；E41 由该字面量自动满足。
- **`tools/probe_feedback_archive_20261105.mjs`**（新增）：真实模块在 Chromium，可控 storage / 时钟 / 存档代次夹具，18 项反例。
- **`catalog.js`**：两个运行源码变化后按 Git 发布字节重生成。修前 `release.js --check` 精确报 **2 个不符**，修后 **0**。

## 验证

| 项目 | 结果 |
| --- | --- |
| 新增归档反例 | **18 / 0** |
| 既有 `probe_achievement_feedback.mjs` | 39 / 0 |
| 既有 `probe_feedback_lifecycle.mjs` | 47 / 0 |
| 既有 `probe_feedback_reading_20261104.mjs`（真实 Chromium 三横屏） | 39 / 0 |
| `release.js --check` / `catalog_git_bytes.mjs --worktree` | 1035 文件，**0 不符**，build 一致 |
| 完整 `node tools/check.js` | 见 `outputs/wb-next-update/b1/full-check.log` |

反例覆盖：首次归档与未读角标、重启后记录与入口恢复、分页回顾、逐条与全部已读的持久化、每页 20 条与前后翻页、200 条上限且最新保留、重复通知不增行、换档清档、写入失败提示且无未处理异常、偏好与归档键隔离且不写奖励存储、原回顾未变、44px 触控与 640×286 / 915×412 / 1365×768 不溢出、销毁清理。

**真实宿主专项 `probe_achievement_feedback_host.mjs` 本次无法启动**：本副本缺 `ext/app/index.html`，只读服务返回 404，`serviceWorker / lib / game / CSH` 均为 false，是宿主文件缺失的环境限制，**不是本轮改动导致，也不计入通过**。既有三个反馈专项已覆盖队列、生命周期与真实浏览器三横屏显示。

过程中一处探针自身竞态：`Emulation.setDeviceMetricsOverride` 后需等待一帧再读布局，否则三个横屏断言会误报失败；已加等待，18/0。

## 明确未做 / 残余限制

- **只做有界 200 条本机归档**，没有实现「长期全部通知无限保留」与历史全文检索；这是刻意的保守取舍，界面文案不承诺长期全量。
- 归档是**展示记录**，不是成就进度或领奖凭据；真值仍在成就页/钱包。它不随存档迁移，换设备后本机归档为空。
- 换档检测依赖 `scope()` 的 generation；同一设备换档后重启，因 `adoptedSaveEpoch` 从 0 重算，归档会被判为过期而清空 —— 结果是**少留记录**，不会串档，属可接受的保守行为。
- 未做 2000 条生涯页规模交互的完整检查、妖灵 50 名特色增益与布局、德州桌级/补码、跨页美术等其他 backlog 项；它们需要作者素材或玩法数值方向。
- 隔离 Chromium 与合成 storage 不能替代真实 Android/宿主 WebView 的 localStorage 配额与持久化行为；该证据由作者真机测试补齐。

## 边界

没有提交、推送、合并 main、升版本、安装或发版。HEAD 仍 `5b266c6`，远端 main 仍 `b169698`（4.0.14）。发布硬步骤不变：形成最终候选提交后必须跑 `node tools/catalog_git_bytes.mjs --rev <提交>` 且 0 错才可发布。
