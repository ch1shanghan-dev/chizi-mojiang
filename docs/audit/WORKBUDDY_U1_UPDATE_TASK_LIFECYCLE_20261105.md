# WorkBuddy 接手第二轮 · U1 统一更新器任务生命周期

日期：2026-11-05。范围：交接第 4 节 U1。U0 已完成，U2—U5 未动。

## 玩家触发与结果

交接指出：`checkUpdate` 重复打开会先删旧弹窗 DOM；手动恢复只检查 `_cshUpdating`，自身不建立界面忙状态或当前任务引用；底层事务锁存在，但不能据此证明上层旧回调、关闭、重入安全。

本轮读源码后确认了五个具体缺口，其中第一个是硬伤：

1. **提交阶段守卫形同虚设。** `csh_update.js:79` 的 `phase` 由 `note()` 赋值，但 `recover`/`apply` 的 `finally` 都把它重置为 `'idle'`；旧 `kill()` 用 `updateTx.status().phase` 判断是否在 `committing`/`recovering`。更糟的是 `updateTx` 是**每个弹窗的局部变量**，重开弹窗后新实例是 `null`，守卫直接跳过。提交/恢复期间可关闭并 abort，随后可能误报「下载已取消，原安装未改动」。
2. **旧 `finally` 无条件 `_cshUpdating=false`。** 旧任务能解掉后来任务的锁。
3. **手动恢复不登记任务。** `L7837` 只 `if(_cshUpdating)return` 并禁用自己，恢复期间可启动更新、打开清理面板、甚至关闭弹窗。
4. **旧弹窗回包会改全局状态。** `cshProbeAll().then(renderSources)` 会写 `_cshUpdBase`，覆盖玩家在新弹窗里选的线路；目录/版本回包也写旧状态。
5. **Esc 监听泄漏。** 每次 `checkUpdate` 都 `addEventListener`，只有 `kill()` 才移除；重开后旧监听仍在。

## 改动范围

**`core/csh_debug.js`（唯一被改的运行源码，+154 / -22 行）**

- 新增跨弹窗共享状态 `window.CSHUpdate.__cshUpdateState`：`{task, panelSeq, taskSeq, refresh, setControls, esc}`。挂在 `CSHUpdate` 上而不是新增模块级变量，是为了让被 `tools/probe_update_transaction.mjs` **单独抽取、在 vm 里执行**的 `startUpdate` 也取到同一对象。
- 唯一任务对象 `{id, kind:'update'|'recover', phase, controller, tx, panelId, settled}`；`_cshUpdating` 保留为兼容镜像。
- 弹窗代次 `panelId` / `alive` / `current()`：旧回包不写新弹窗、不改 `_cshUpdBase`；重开前移除旧 Esc 监听。
- `kill()` 按**全局当前任务**判断：提交/恢复阶段拒绝关闭且不 abort；下载/核对阶段可取消；旧面板的任务不被新面板的关闭 abort；绝不提前清锁。
- `checkUpdate` 开头：提交/恢复期间若旧弹窗还在 DOM，拒绝替换，直接返回。
- `startUpdate` 重写为自包含（参数 + `window.CSHUpdate` + 局部函数）：捕获自己 panel 的控制器；`finally` 只在 `st.task===task` 时释放锁；按阶段给取消文案，提交/恢复阶段不误报「已取消」；`progress` 不写非当前 panel；任务结束后只让等待中的新 panel 刷新一次。
- 手动恢复：建立任务引用、`_cshUpdating`、全按钮忙状态；期间更新/清理/关闭/重开被挡。
- `backupBtn`：活跃任务期间拒绝打开清理面板。

**工具链（不在 `catalog.files` 内）**

- 新增 `tools/probe_update_lifecycle_20261105.mjs`：5 组交叉反例，29 项断言。
- `tools/check.js`：E46/E48 的源码形态断言随控制器重写更新为语义断言（兼容 `updateTx` 与 `task.tx`），并**新增**一条 U1 生命周期接线守卫（防止后来误删保护）；E53 沿用 U0 的发布字节对账。
- `tools/lib/audit_scratch.mjs`：临时目录清理遇到宿主批量删除保护 / Windows 文件占用时降级为警告，不再推翻已跑完的检查结论；路径越界校验仍照抛。
- `tools/lib/chromium_audit.mjs`：`DevToolsActivePort` 读取加重试，避开 Windows 上刚创建文件时的 EBUSY。
- `catalog.js` 重新生成：`csh_debug.js` 变了，旧清单立即失效。

## 验证

| 项目 | 结果 |
| --- | --- |
| U1 生命周期反例（新） | **29 / 0** |
| 更新事务与控制器专项（既有） | **24 / 0** |
| 更新 UI / 三横屏专项（既有） | **33 / 0** |
| 安卓 IO 专项（既有） | **6 / 0** |
| 备份生命周期专项（既有） | **40 / 0** |
| 联网/离线策略专项（既有） | **0 失败** |
| 完整 `node tools/check.js` | 通过，FAIL 0，告警 2 项（既有非阻断） |

反例覆盖（不只检查按钮 disabled）：

1. 连点 + 任务进行中重开 → 始终只有一个任务。
2. 下载阶段关闭 → 重开：旧进度回包不写新弹窗、新动作被挡、锁在旧任务真正结束前不释放、结束后等待中的弹窗刷新。
3. 提交阶段：所有动作禁用、Esc 与重开都拒绝、signal 不 abort、不出现「已取消」、成功后才写版本。
4. 手动恢复：建立任务与忙状态，期间更新/清理/关闭/重开全被挡，结束释放并如实报告结果。
5. 旧任务的迟到 `progress` 不能解除新任务锁、不能把新弹窗翻成提交保护态。

**发布字节纪律实证**：改完 `csh_debug.js` 后 `node tools/release.js --check` 精确报出 **1 个不符**（正是该文件），重跑 `node tools/release.js` 后 `--check` 与 `--worktree` 均 **0 不符**、build 一致。U0 的门禁确实拦住了这次运行源码改动。

产物在 `D:/CodexWork/chizi-mojiang/workbuddy/outputs/wb-next-update/u1/`：`baseline/`（接手时 git status 与改前 `csh_debug.js` 备份）、`lifecycle.json`、`transaction.log`、`ui.log`、`mobile/`、`backup/`、`online/`、`verify-worktree.json`、`verify-candidate-tree.json`（隔离索引候选 tree，0 不符、build 一致，HEAD 未移动）、`full-check.log`。

## 真正完成 / 未做

已完成：同一页面上下文内，更新 / 恢复 / 清理入口互斥，关闭与重开的代次隔离，提交与恢复阶段不可误取消，旧 finally 不解新锁，失败文案按阶段区分。

未做，不要算进本轮：

- **U2** 镜像旧缓存哈希不符后的可信源回退、**U3** 进程中断与启动早期恢复及文件接口迟到回调、**U4** 失败暂存与容量边界、**U5** 安卓 4.0.15 真机链路，全部未动。
- 没有连接安卓设备，没有精确 build / 宿主 / WebView，没有真机升级、同版修复、断网、空间不足、横屏缩放或权限证据。
- 没有新增提交、推送、合并 main、发 Release/ZIP、安装或覆盖正式安装。HEAD 仍 `5b266c6`，远端 main 仍 `b169698`（4.0.14），玩家在线更新源仍指 main。

## 残余限制

- 共享状态在**同一页面 JS 上下文**内有效。多窗口各有独立上下文，跨窗口并发仍只靠 `csh_update.js` 的底层 `LOCKS`（`hostIO.scope` 为固定字符串，确实共享）兜底；本轮没有做跨窗口验收。
- `openUpdateBackups` 的清理任务生命周期仍由备份面板自身 `busy` + 底层锁管理；本轮只在 `backupBtn` 入口加互斥，未重构该面板。
- 提交/恢复阶段**拒绝关闭**，若底层 IO 卡死用户暂时没有出口。这是「不误报取消、不偷偷写入」的取舍；文件接口超时与迟到回调属于 U3，尚未处理。
- 探针用可控事务 mock 与内存磁盘，验证的是控制器生命周期，不是真机 IO 或真实网络。
- `st.refresh` 只在有新弹窗等待时触发；没有新弹窗时任务结果留在原弹窗，不自动重跑检查。
- 工具链的清理降级会让 Chromium profile 临时目录残留在 `D:/CodexWork/chizi-mojiang/temp`；不影响检查结论，也不碰用户资料。
