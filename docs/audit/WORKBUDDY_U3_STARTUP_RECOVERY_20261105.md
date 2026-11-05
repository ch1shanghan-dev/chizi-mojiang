# WorkBuddy 接手第四轮 · U3 进程中断与启动恢复

日期：2026-11-05。范围：交接第 4 节 U3。U0/U1/U2 已完成，U4/U5 未动。

## 玩家触发与结果

交接的判断属实：`recover()` 的调用点只有两个 —— `startUpdate` 开头（`csh_debug.js:7772`）和手动恢复按钮（`csh_debug.js:7970`），**都在玩家打开更新面板之后**。而 `extension.js` 是纯静态 import 入口，启动即求值 `bootstrap / character / card / skills` 等全部业务模块。若进程在逐文件提交或凭据清理时被终止，下一次启动会直接加载新旧混合的模块，没有任何早于业务的检查。

另外两点：

- 事务层没有同步可读的「未决恢复」状态，启动早期（异步文件 IO 之前）根本无法判断。
- 文件接口（`game.readFile/writeFile/removeFile` 回调）没有超时观察。交接明确警告：不能用 `Promise.race` 超时后宣布「未写入」并放行新任务，因为旧写入可能仍会发生。

## 改动范围

**`core/csh_update.js`（运行源码）**

- 新增同步标志 `localStorage['csh_update_recovery_pending_v1']`：`journal(state)` 在**写凭据之前**置位，`journal(null)` 在删除凭据成功后清除。导出 `isRecoveryPending()` / `clearRecoveryPending()`。
- 新增 `guardIO`：给 `create()` 的文件接口加 15s 观察层。超时**只置 `uncertain`**，reject 带 `uncertain:true` 的错误 —— 不宣布「未写入」、不清 journal、不回滚；迟到回调到达时忽略，但不改变结论。
- `apply` 的 catch 遇到 `uncertain` 直接抛 `recovery:true / uncertain:true` 错误，不做任何清理；`apply` 与 `recover` 的 finally 在 `uncertain` 时**不释放 busy 与底层锁**，由重启后的受保护恢复状态接管。
- 备份清理路径 `backups()` 未加此观察层（不涉及安装文件写入）。

**`core/csh_startup_recovery.js`（新增运行源码，已进发布清单）**

- 自己 `import "./csh_update.js"`，保证事务 IIFE 先挂好 `window.CSHUpdate`，因此能在**任何异步 IO 之前同步**读到恢复标志。
- `cshRecoveryPending()` 同步检查；`cshProtectedPackage(full)` 返回不启用 `character/card/skill/content/precontent` 的最小包，保留版本与 help/config，**不删行囊、资格、收据或用户素材**。
- `cshRecoverAtStartup(host)` 用真实事务 `recover()`：成功清除标志并记录 `needRestart`，**不自动重启、不写版本或成功标志**；失败保留标志，下次启动继续受保护。

**`extension.js`（运行源码）**

- 启动恢复模块放在**第一个业务 import**（在 `bootstrap / character / card / skills` 之前）。
- `export default function()` 在标志存在时触发异步恢复并返回受保护包。

**`core/csh_debug.js`（运行源码）**

- 更新面板在恢复状态（同步标志或 `__cshStartupRecovery`）时不继续普通版本检查，给出「请重启 / 使用恢复未完成更新」提示；手动恢复按钮仍可用。

**工具与门禁**

- 新增 `tools/probe_update_startup_recovery_20261105.mjs`：真实事务 + 启动恢复模块在隔离 vm，10 项反例。
- `tools/check.js` E41 存档覆盖度：新键加进**带理由的豁免表**，刻意不进 `csh_migrate` 键表 —— 它是设备本地瞬时状态，导入存档时不能把别的设备的「未决恢复」带过来。
- `catalog.js` 重生成：新增 core 文件 + 3 个运行源码变化，文件数 **1034 → 1035**。

## 验证

| 项目 | 结果 |
| --- | --- |
| U3 启动恢复反例（新） | **10 / 0** |
| 既有：事务 / 镜像 / UI / 生命周期 | 24/0、11/0、33/0、29/0 |
| 既有：安卓 IO / 备份 / 联网策略 | 6/0、40/0、76/0 |
| 完整 `node tools/check.js` | **exit=0**，E41/E46/E48/E53 全 OK，FAIL 0，告警 2 项（既有非阻断） |
| 发布字节 | 修前 `--check` 报 **3 个不符 + 1 个新文件**，重生成后 1035 文件 `--check` / `--worktree` 均 **0 不符**、build 一致 |

反例覆盖（选代表性故障点，不堆重复模拟）：

1. 下载中断 → 无 journal、原文件完整、下次启动 `recover()` 返回 empty。
2. 备份中断 → 同上。
3. prepared 中断 → 下次启动判定 untouched、原文件不变。
4. 逐文件提交中断 → 事务回滚、下次启动原文件完整。
5. committed 后凭据清理失败 → 下次启动判定 committed，**保留已核验的新文件**并清除凭据。
6. 文件接口超时 → `uncertain`、保留凭据与锁、拒绝新任务；迟到回调到达不改变结论。
7. 恢复标志在异步 IO 之前同步可读。
8. 受保护包不启用业务内容、保留版本、不碰用户数据。
9. 启动恢复成功清标志 / 失败保留标志，且从不自动重启。
10. `extension.js` 的恢复接线早于所有业务 import。

**发布纪律第四轮实证**：改了 3 个运行源码并新增 1 个 core 文件后，`--check` 报 3 个不符，重跑 `release.js` 后 0 错，新文件自动进入清单。

产物在 `D:/CodexWork/chizi-mojiang/workbuddy/outputs/wb-next-update/u3/`：`baseline/`（接手时 git status、改前 `csh_update.js` 备份）、`startup/startup-recovery.json`、`transaction/`、`mirrors/`、`ui/`、`lifecycle/`、`mobile/`、`backup/`、`online/`、`verify-worktree.json`、`verify-candidate-tree.json`、`full-check.log`。

## 真正完成 / 未做

已完成：中断后的三种结局都有可核对路径（完整旧版 / 核验完整新版 / 明确受保护）；未决恢复不再默默进入业务；超时不误判、不放行；恢复期间不启用业务内容、不写版本、不自动重启、不删用户数据。

**明确未做，不要算进本轮：**

- **没有把 `extension.js` 改成动态 import + 顶层 await。** ESM 静态依赖图仍会先求值业务模块的顶层定义；本轮的「受保护」是**不启用业务 package**，不是**阻断模块求值**。这是为避免顶层 await 与引擎 `game.import` 的兼容风险做的工程取舍，不是等价实现。
- `guardIO` 只覆盖 `create()`（apply/recover），`backups()` 清理路径未加超时观察。
- **U4** 失败暂存与容量边界、**U5** 安卓 4.0.15 真机链路，全部未动。
- 没有连接安卓设备，没有真机断电/杀进程、WebView、存储权限或横屏证据；所有中断点都是隔离 vm 里的注入模拟。
- 没有新增提交、推送、合并 main、发 Release/ZIP、安装或覆盖正式安装。HEAD 仍 `5b266c6`，远端 main 仍 `b169698`（4.0.14），玩家在线更新源仍指 main。

## 残余限制

- 同步标志与 journal 文件不是原子操作：置位先于写凭据，可能出现「标志存在但 journal 不存在」的假阳性 → `recover()` 返回 empty 后清除，代价是多一次受保护启动，不破坏数据。
- 受保护包在**本次会话**不恢复业务功能，必须重启；这是刻意行为。若 `cshRecoverAtStartup` 失败，标志保留，下次启动继续受保护。
- 15s 超时阈值是经验值，真机慢存储可能需要调整；未做真机性能验证。
- `csh_startup_recovery.js` 在 `core/` 下，会随在线更新一起下载；旧版本客户端没有这个文件，但本轮没有跨版本升级验证（U5）。
- 探针用 vm + 可控定时器 + 内存磁盘，验证的是事务与恢复逻辑，不是真实 Cordova FileEntry / FileWriter 的迟到回调行为。
- 「恢复期间暂停业务写入」通过不启用业务 package 实现；若宿主在扩展 package 返回前就执行了某些引擎级写入，本轮没有覆盖。
