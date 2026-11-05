# WorkBuddy 接手第五轮 · U4 失败暂存与容量

日期：2026-11-05。范围：交接第 4 节 U4。U0—U3 已完成，U5 未动。

## 玩家触发与结果

**失败暂存**：`protect()` 把 `staging`/`prepared` 组无条件设为 `protected`，`plan()` 又直接拒绝这两个状态，`publicRow.downloadsCleanable` 同样把它们排除。结果是无 journal、实际已失败的更新组**长期不可清理**，连「清理下载副本」按钮都不出现。占用来自 `before/`（原文件副本）、`next/`（下载副本）和 `backup.json`。

**容量**：在线读取上限在 `core/csh_online.js` —— `.arrayBuffer()` 16MiB（逐文件下载器走这条）、`.text()` 512KiB（`cshFetchText` 拉 catalog.js）。但 `tools/release.js` **完全没有大小预检**，未来加一段大音频/美术，只有玩家下载到一半才会撞上「联网文件超出大小限制」。当前发布字节最大 3,141,016 字节（约 3.00MiB），远低于 16MiB。

**空间预估**：备份面板只说「预算只生成清理建议」，既没虚报设备空间充足，也没说明预算是玩家自设上限、设备剩余空间其实读不到。

## 改动范围

**`core/csh_update.js`（运行源码）**

- 给每行加 `recovering` 标记（`state.blocked` 或 journal 指向该组）。
- `downloadsCleanable` 与「整组保护」解耦：无 journal、确有下载副本、且未标记 `nextRemoved` 时，失败组也允许**只清 `next/`**；同时保留「清理中断后重写 metadata」的重试入口。
- `plan()` 按 kind 区分：`bundle`（含 `before/` 与说明）仍拒绝 staging/prepared/aborted/rolledback 和任何 protected 组；`next` 只拒绝正在恢复、已清过或无副本的组。
- `cleanup()` 在重新扫描后再次拒绝 `recovering` 组；删每个文件前仍检查 journal。
- 失败组的理由改为「更新未完成：原文件副本保留，下载副本可单独清理」。
- **修了一处自己引入的回归**：初版把「无 next/ 文件但 metadata 写失败待重试」的路径误拒，既有专项 37/40 立刻抓到，已恢复该重试入口。

**`tools/lib/update_limits.mjs`（新增，纯函数）**

`TEXT_LIMIT=512KiB`、`FILE_LIMIT=16MiB`（真源 `csh_online.js`）、`classify` / `checkLimits` / `limitsBlock` / `REMEDY`。`REMEDY` 明写三条出路：分块、改走完整安装包、同步提高 `csh_online.js` 上限并验证宿主能力。

**`tools/release.js`（发布工具）**

- 生成前逐文件核对发布字节上限；`catalog.js` 文本自身核对 512KiB。任一超限**抛错、不写 catalog.js**，错误信息列出文件/大小/上限和三条出路。
- catalog 写入 `limits:{textBytes,fileBytes,maxFileBytes}`，让客户端能在下载前判断。
- `--check` 只读模式同样跑预检。

**`core/csh_debug.js`（运行源码）**

- `applyCatalog` 在下载前检查 `info.limits.maxFileBytes > 16MiB` → 明确提示「请使用完整安装包，没有下载或改动本机文件」，不创建更新按钮。
- 备份面板说明「预算是你设定的占用上限，不是设备可用空间；设备剩余空间无法可靠读取，不据此判断充足」。**不虚报充足**。

**门禁与工具**

- `tools/check.js` E53 新增：catalog 必须带 `limits` 且与在线读取能力一致；`release.js` 预检接线在位；`csh_online.js` 与 `update_limits.mjs` 三处上限数字不漂移。
- `tools/probe_backup_lifecycle_20261104.mjs`：两条固化旧行为的断言改为**更强**的新规则检查（整组仍拒绝 + 下载副本可清 + 清理后 `before/` 保留）。
- `tools/lib/audit_scratch.mjs`：环境 trash 清理失败的新错误形态纳入降级白名单，避免清理异常推翻检查结论。
- 新增 `tools/probe_update_backup_capacity_20261105.mjs`（10 项反例）。
- `catalog.js` 重生成：1035 文件，新增 `limits`，最大文件 3,141,016 字节。

## 验证

| 项目 | 结果 |
| --- | --- |
| U4 失败暂存/容量反例（新） | **10 / 0** |
| 既有：事务 / 镜像 / 启动恢复 | 24/0、11/0、10/0 |
| 既有：UI / 生命周期 / 备份生命周期 | 33/0、29/0、40/0 |
| 既有：安卓 IO / 联网策略 | 6/0、76/0 |
| 完整 `node tools/check.js` | **exit=0**，E41/E46/E48/E53 全 OK，FAIL 0，告警 2 项（既有非阻断） |
| 发布字节 | 重生成后 1035 文件，`--check` / `--worktree` 均 **0 不符**、build 一致 |

反例覆盖：失败 staging 组的 `downloadsCleanable`、只清 `next/` 且保留 `before/` 与说明、整组 bundle 仍被拒、journal 引用时全保护、清理后状态正确；上限常量与分类、当前最大文件通过、超限给出三条出路、坏尺寸被拒、发布预检与诚实文案的接线。

**发布纪律第五轮实证**：`release.js` 预检输出「1035 文件，最大 3.00MB ≤ 16MiB」，catalog 写入 `limits`；门禁 E53 直接把「目录缺上限声明」列为必检失败项。

产物在 `D:/CodexWork/chizi-mojiang/workbuddy/outputs/wb-next-update/u4/`：`baseline/`（接手时 git status、改前 `csh_update.js` 备份）、`capacity/capacity.json`、各专项目录、`verify-worktree.json`、`verify-candidate-tree.json`、`full-check.log`。

## 真正完成 / 未做

已完成：失败组的**下载缓存**可单独清理，原文件副本与说明保留；发布侧在生成清单时就拦住已知超限文件并给出三条明确出路；客户端在下载前能判断是否支持；空间预估不再含糊。

**未做，不要算进本轮：**

- **没有实现失败组的整组清理**：`staging`/`prepared` 的 `before/` 与 `backup.json` 仍保留。这是刻意的保守取舍 —— 无法在不检查 journal 与回退价值的前提下证明这些原文件副本「一定没用」，交接也要求「不为腾空间解除全部保护或删唯一可校验回退」。本轮只把三类资料区分开，开放了可证明安全的那一类。
- **没有实现分块下载**，也没有实现替代完整安装包的自动路径；只是在发布预检拒绝时给出这三条决策出路。当前清单最大 3.00MiB，远未触及上限。
- 设备剩余空间依旧**读不到**；本轮只是把不确定性写明，没有新增任何读取设备容量的 API，也没有虚报充足。
- **U5** 安卓 4.0.15 真机链路未动；没有真机慢存储、大素材下载或空间不足证据。
- 没有新增提交、推送、合并 main、发 Release/ZIP、安装或覆盖正式安装。HEAD 仍 `5b266c6`，远端 main 仍 `b169698`（4.0.14），玩家在线更新源仍指 main。

## 残余限制

- 失败组的 `before/` 会一直占空间，直到玩家手动处理或后续版本提供更明确的整组判定；本轮没有这个判定。
- 16MiB / 512KiB 是**客户端 `csh_online.js` 的当前能力**，不是宿主 WebView 的普遍上限；提高上限必须真机验证。三处数字由 E53 静态校验防漂移，但运行时未做能力探测。
- `classify()` 只用于说明文件类型与错误信息；发布预检对**所有**文件一律按 `arrayBuffer` 的 16MiB 判定，因为 `fetchFile` 就是这么消费的。
- 备份面板的预算仍是玩家自设的占用上限（256/512/1024MB），不代表设备可用空间。
- 探针是内存文件系统 + 纯函数，验证的是管理器与预检逻辑，不是真实 Cordova 容量/配额行为。
- 环境 safe-delete 清理失败会留下 Chromium profile 临时目录；不影响检查结论，也不碰用户资料。
