# F1：人物回应生命周期缺陷修复 + 图鉴助战增益展示（2026-11-07）

作者要求「继续，一次多做一些任务」。本轮在同一套门禁纪律下推进两个待办，并修掉反例抓出的一个真缺陷。
版本仍 **4.0.16**、未推送、未合并 main、未发版；真机验收归作者 U5。

## 一、§4.3 人物事件回应：独立反例 + 真缺陷修复

方案 §4.3 要求「一次一条、可关闭、不挡主操作、切换人物/关闭页面销毁旧处理器，迟到回调不能把上一条回应写进新面板」，并明确**复用既有 `manualReplyJob` 队列、不加模型**。此前这条只有 `probe_interact_audit.mjs` / `probe_interact_recovery.mjs` 间接覆盖，没有针对性反例。

新增 `tools/probe_interact_reply_20261107.mjs`：把真实 `core/csh_interact.js` 去掉 import 后在隔离 VM 里执行，注入闭包内 API，可控时钟 / 计时器 / 存档 epoch / 玩家数组 / 开关；断言覆盖基本呈现、6 秒节流、11 类关闭条件、8 类迟到场景、静态接线与零写入。

**反例首跑 59/4，其中 3 条是同一个产品真缺陷**：`queueScene()` 的前置守卫（换局 `players !== game.players`、终局 `_status.over`、角色离桌 `!usable(other)`、开关变化等）直接 `return`，而释放 `manualReplyJob` 的代码写在 `callback()` 里，**根本执行不到**。结果：回调不会发声（这一半是对的），但 job 一直悬挂，`manualInvolves()` 持续返回 true，`manualReplyAt` 还白占 6 秒节流，直到下一次 `clearManualProps()`。这与 U1/B1 建立的任务生命周期纪律不一致。

修复方式（改产品，不放宽断言）：`queueScene(callback, delay, speaker, other, chat, onDrop)` 增加**可选** `onDrop`，所有提前 `return` 的分支统一 `return drop()`；`replyToManualBatch` 传入释放回调 `if(manualReplyJob===job){manualReplyJob=null;manualReplyAt=0;}`。其余 8 处 `queueScene` 调用不传该参数，行为完全不变。`clearSceneTasks()` 走 `clearTimeout` 的路径本就会调 `clearManualProps()`，不受影响。

验证：**63/0 ×2**；内置改前基线两处（去掉 job 身份守卫 / 去掉 `saveEpoch` 校验）都能被检出；既有 `probe_interact_audit.mjs` 124/0、`probe_interact_recovery.mjs`、`probe_player_interactions.mjs` 全部 0 失败。注册门禁 **E95Y**（min 63）。

## 二、S4 收尾：图鉴助战增益展示

S4 接线报告里明确留了「图鉴展示未做」。现在玩家在 `games/codex.html` 能看到每只妖灵的助战增益。

- 页面引入只读 `<script src="../core/csh_spirit_buffs.js"></script>`（该模块本就在发布清单内，零 import、数据冻结）。
- 新增折叠面板 `#spirit-buff`（默认 `hidden`），沿用 `collection-details` 样式，只加 6 条局部 CSS 规则，**不改任何 `@media` 数值**，E95X 的 24 种断点基线不受影响。
- 新增 `buffApi()` / `renderSpiritBuff(it)`：按 `CSHSpiritBuffs.get(id)` 显示 6 类模板名、该只妖灵的 `playerText`、好感 B 解锁条件（用真实 `unlocked(level,id)` 判定）、每局 1 次不累积、当前好感档位；数据层缺失或未知 id 时整块隐藏，不编造增益。
- 接线放在 `renderAff(it)` 末尾，好感变化的所有重绘路径（送礼、互动、结契、刷新、切人）都会同步更新解锁态。
- **只读边界**：不写 localStorage、不调钱包/桥、不产生 CBY、不改讨伐/好感数据；文案全部走 `textContent`，`innerHTML` 仅用于清空自己的容器。

新增 `tools/probe_codex_spirit_buff_20261107.mjs`：真实数据层 + AST 抽取页面真实函数，在最小 DOM 夹具里跑。断言包含 50 条逐只展示、6 类模板覆盖、D/C 未解锁与 B/A/S 已解锁、7 类非法档位不默认放行、未知 id / 空档案 / 数据层缺失、恶意 HTML 文案按纯文本写入、切换妖灵无残留、零写入，以及 3 处改前基线。

验证：**35/0 ×2**，注册门禁 **E95Z**（min 35）；既有浏览器探针 `probe_codex_selection_20261103.mjs` **60/0**、`probe_spirit_skin_entry_20261104.mjs` **55/0** 无回归。

## 三、查过但没改的（不硬造工作）

- **那张游戏内 Alert 截图**：`core/csh_achievement_feedback.js:231` 的 `archive=readArchive();renderInbox();` 位于 `createAchievementQueue()` 内，`readArchive()` 已有 try/catch 把损坏存档降级为 `{v:1,rows:[],damaged:true}`，`renderInbox()` 只操作已注入的 `env.document`。**没找到可复现的无保护抛错路径**，不凭截图加代码。仍等作者提供出现时机 / 设备版本 / 控制台首条报错。
- **`csh_viewport.js` 运行时接线**：E2 报告已定义它是「文档 + 门禁的唯一真值」（media query 不能用 `var()`）。给 11 个页面加 script 只为打一个 `data-*` 属性，属过度工作，本轮不做。
- **24 种断点逐值收敛**：仍需按 §4.4 逐页比 `docs/audit/ui/` 基线截图，风险大于本轮收益，保持 E95X 基线锁定，未动任何 CSS 数值。

## 四、验证汇总

| 项目 | 结果 |
| --- | --- |
| 新专项 | E95Y 63/0 ×2（改前 2 红）、E95Z 35/0 ×2（改前 3 红） |
| 既有回归 | 互动 3 套 0 失败、图鉴选择 60/0、装扮 55/0 |
| 完整 `node tools/check.js` | **exit=0 / FAIL 0 / RETRY 0**（E95A–Z 26 项）；2 项历史已知告警（技能译名、非发布磁盘文件） |
| 发布字节 | 生成前 `--check` 如实报 `mismatchCount:2`；重生成后 1042 文件 0 不符；提交级 `--rev HEAD` 见本轮最终复核 |
| 注册自检 | 3/0（注册行无悬空、6 个关键专项仍覆盖） |
| 一键更新套件 `--rev HEAD` | **15/0** |
| 慢速通道（改动后整条） | **8/0 一次性跑完**（9m51s，无超时）：78 / 142 / 29 / 80 / 92 / 33 / 69 / 108 全部 0 失败，无 `docs/audit/ui/` 基线污染 |
| 提交级 `--rev HEAD` | 0 错（本轮提交后单独复核，见最终回复） |

## 五、明确未做

24 种断点逐值收敛与逐页截图、图鉴外装扮覆盖（等素材）、离线调试补码、真机 U5（作者）、桌面 `池子魔将-4.0.15.zip` 是否重建、Alert 三项信息。
S4 六类效果仍是**隔离验证**，不是真实引擎事件循环验收；图鉴只做展示，不改变战斗行为。
