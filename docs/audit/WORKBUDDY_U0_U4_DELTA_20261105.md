# WorkBuddy 接手 U0—U4 · 面向提交的差异说明

日期：2026-11-05。编制方：WorkBuddy。用途：给作者/后续维护者一份可直接复核的改动清单。

**边界（2026-11-05 更新）**：作者已授权本地提交与后续自主维护。首个候选提交 **`7e009005bf5910f37cc7d5be72305fd087c866a3`**（50 文件，含交接前 Codex 成果与 WorkBuddy 六轮改动，不拆分），之后每轮收口继续提交，**当前候选以分支 HEAD 为准**；每次提交后跑 `catalog_git_bytes.mjs --rev HEAD` **0 错、build 一致**。**没有推送、合并 main、发 Release/ZIP、安装或覆盖正式安装，也没有升版本**；玩家在线更新源仍指 main `b169698`/4.0.14。发布前须对当前 HEAD 重新复核。

## 1. 版本与渠道事实（勿混用）

| 对象 | 状态 |
| --- | --- |
| 作者当前安卓 | 自述 4.0.15；精确 build / 宿主 / WebView 本机未读取 |
| 当前开发目录 | 本地 4.0.15，脏工作区，含交接前已有的未提交修复 |
| HEAD / 开发分支 | `5b266c6`（提交内为 4.0.14） |
| 远端 main | `b169698`（4.0.14），**玩家在线更新源仍指这里** |
| 本机另一份电脑安装 | 4.0.14，交接期间只读 |

`catalog.js`：版本 4.0.15，`build=c14441049cf149aa9d354f8afba87ccc815c2a21a65148dd8eb5d5d314b18a6b`，1035 文件，137.4MB，`limits={textBytes:524288,fileBytes:16777216,maxFileBytes:3141016}`。

## 2. 改动归属：`git diff` 里不全是 WorkBuddy 的

`git diff --stat` 当前显示 22 个已跟踪文件、约 +1039/−755 行，其中**大部分是交接前 Codex 的本地 4.0.15 成果**：`core/csh_achv.js`、`core/csh_world.js`、`core/csh_shell.js`、`core/csh_career_observer.js`、`info.json`、`package.js`、`docs/plan.md`、`docs/audit/GITHUB_DEV_SYNC_20261105.md`、`tools/achv_scale/*` 等。这些**必须原样保留**，不要当成可丢弃的脏改动。

同理，`docs/audit/ANDROID_UPDATE_REPAIR_20261105.md`、`RETIRED_REACHABILITY_20261105.md`、`VERSION_BACKLOG_REVIEW_20261105.md`、`docs/handoff/WORKBUDDY_CONTINUATION_20261105.md`、以及 `tools/probe_update_ui_20261105.mjs`、`probe_update_mobile_io_20261105.mjs` 等，都是交接自带的未跟踪文件。

WorkBuddy 本轮实际改动如下。

### 2.1 运行源码（会进发布清单）

| 文件 | 轮次 | 改动 |
| --- | --- | --- |
| `core/csh_debug.js` | U1/U2/U3/U4 | 唯一任务生命周期与弹窗代次；按同一 catalog 哈希逐源核验与坏响应拒绝；恢复状态提示；下载前按 `limits` 拒绝；备份面板空间说明 |
| `core/csh_update.js` | U3/U4 | 同步恢复标志 + `guardIO` 超时/迟到回调观察；失败暂存分类清理（下载副本可清、原文件保留、journal 引用全保护） |
| `extension.js` | U3 | 第一个业务 import 改为启动恢复模块；未决恢复时返回受保护包 |
| `core/csh_startup_recovery.js` | U3 **新增** | 启动期同步检查、受保护包、异步恢复、只提示重启 |
| `catalog.js` | U0—U4 | 每轮按 Git 发布字节重新生成；1034→1035 文件；新增 `limits` |

### 2.2 工具与门禁（不在发布清单）

| 文件 | 轮次 | 改动 |
| --- | --- | --- |
| `tools/catalog_git_bytes.mjs` | U0 **新增** | `--rev` / `--tree` / `--worktree` 精确发布字节核对 |
| `tools/release.js` | U0 重写 / U4 | 按 Git blob 字节生成、内存自检后落盘、`--check` 只读、`--push` 提交后核对阻断；大小预检与 `limits` 写入 |
| `tools/lib/update_limits.mjs` | U4 **新增** | 512KiB / 16MiB 上限、预检纯函数、三条超限出路 |
| `tools/check_update_suite.mjs` | 本轮 **新增** | 一键只读验证入口（11 项） |
| `tools/check.js` | U0/U1/U3/U4 | E53 发布字节对账；E46/E48 断言按新控制器更新并补 U1 接线守卫；E41 新键豁免；U4 上限声明与防漂移必检 |
| `tools/lib/audit_scratch.mjs` | U1/U4 | 清理失败降级为警告，不推翻检查结论 |
| `tools/lib/chromium_audit.mjs` | U1 | `DevToolsActivePort` 读取加重试 |
| `tools/probe_backup_lifecycle_20261104.mjs` | U4 | 两条固化旧行为的断言改为更强的新规则检查 |
| `tools/probe_update_lifecycle_20261105.mjs` | U1 **新增** | 29 项任务生命周期反例 |
| `tools/probe_update_mirror_fallback_20261105.mjs` | U2 **新增** | 11 项多源回退反例 |
| `tools/probe_update_startup_recovery_20261105.mjs` | U3 **新增** | 10 项中断点/启动恢复反例 |
| `tools/probe_update_backup_capacity_20261105.mjs` | U4 **新增** | 10 项失败暂存/容量预检反例 |

### 2.3 文档

`AGENTS.md`、`docs/audit/CURRENT_WORK.md` 顶部与 P0 清单已按五轮更新；新增五份报告（U0 发布字节、U1 任务生命周期、U2 镜像缓存、U3 启动恢复、U4 失败暂存与容量）及本文。

## 3. 五轮逐轮结论

| 轮次 | 已确认问题 | 修正 | 反例 |
| --- | --- | --- | --- |
| U0 | 清单写工作目录 CRLF 字节、玩家下载 Git LF 字节；开发提交 17 个不符、当前候选 20 个 | 发布工具按 Git blob 字节生成 + 自检 + `--check` + `--push` 阻断；E53 全量对账 | 交接 python 脚本交叉复现 17/0 |
| U1 | 提交阶段守卫失效、旧 finally 解新锁、手动恢复不登记任务、旧回包改线路、Esc 监听泄漏 | 唯一任务 + 弹窗代次；提交/恢复拒绝关闭；旧 finally 条件释放 | 29/0 |
| U2 | 首源 HTTP 200 旧缓存直接返回、哈希在外层失败不换源；目录与文件可能不同构建 | 逐源按同一目录哈希核验、坏响应拒绝后继续；`candidateBase` 同源起步 | 11/0 |
| U3 | `recover()` 只在弹窗、启动无早于业务的恢复检查；文件接口无超时观察 | 同步 pending 标志 + 受保护包 + 启动恢复；超时只置 `uncertain`、不清凭据不释放锁 | 10/0 |
| U4 | 失败 staging/prepared 组长期不可清理；发布侧无大小预检；空间预估未说明不确定性 | 下载副本可单独清、原文件保留；发布预检 + catalog `limits` + 客户端提前拒绝 | 10/0 |

## 4. 验证矩阵（本轮实跑）

`node tools/check_update_suite.mjs --out D:/CodexWork/chizi-mojiang/workbuddy/outputs/wb-next-update/suite` → **11/11 全绿**（约 87 秒）：

- `release.js --check`、`catalog_git_bytes.mjs --worktree`
- 9 个专项：事务 24/0、安卓 IO 6/0、UI 33/0、生命周期 29/0、镜像 11/0、启动恢复 10/0、容量 10/0、备份生命周期 40/0、联网 76/0

完整 `node tools/check.js` → **exit=0**，E41/E46/E48/E53 全 OK，FAIL 0，告警 2 项（既有非阻断）。

发布字节：1035 文件，`--check` / `--worktree` / 隔离索引候选 tree 均 **0 不符**、build 一致，HEAD 未移动。

## 5. 发布硬步骤（手工路径没有硬阻断）

1. 改完任何运行源码后，必须重跑 `node tools/release.js`；`--check` 会精确报出失配（U1—U4 每轮都实测拦住）。
2. 形成**最终候选提交**后，对那个提交跑：
   `node tools/catalog_git_bytes.mjs --rev <最终提交> --out D:/.../git-bytes.json`，**0 错才可发布**。
   （对 `5b266c6` 返回 17 个不符是正确检测，不是要改成 PASS；`b169698` 为 0。）
3. 全套复核：`node tools/check_update_suite.mjs --out <目录> --rev <最终提交> --full`。
4. 只有 `tools/release.js --push` 路径内置了提交后字节阻断；手工 `git add/commit/push` 仍须人工执行第 2 步。
5. 不自动升版、不自动推送、不合并 main、不发 Release/ZIP。
6. **当前已对 `7e00900` 完成第 2 步（0 错）**，该提交是可发布候选；但它没有被推送，玩家更新源也未改变。后续任何新提交都必须重跑第 2 步。

## 6. 未完成与残余限制

- **U5 安卓 4.0.15+ 真机链路验收：作者明确由本人届时测试，WorkBuddy 不执行。** WorkBuddy 侧没有精确 build / 宿主 / WebView，也没有真机升级/同版修复/断网/空间不足/恢复后重启/三种横屏与缩放证据；电脑 Chromium 不是真机证明，不得冒充。
- U3 没有改成动态 import + 顶层 await：ESM 静态依赖仍会求值业务模块定义，受保护是「不启用 package」而非「阻断模块求值」。
- U4 没有实现失败组的整组清理（`before/` 与说明仍保留）、分块下载、设备空间读取；都是刻意的保守取舍。
- 跨窗口并发仍靠底层 `LOCKS`；`backups()` 清理路径未加超时观察；15s 超时阈值是经验值。
- 全部探针是隔离 vm / 内存磁盘 / Chromium，不是真实 Cordova FileEntry 或 CDN 缓存行为。
- 交接前 Codex 的 4.0.15 本地改动与五轮改动混在同一脏工作区，提交前需作者确认如何分批；本文不代做决定。

## 7. 一句话结论

代码侧 U0—U4 已完成且可复现验证；**最终候选提交 `7e00900` 已形成且 `--rev` 0 错**，发布字节证明已补齐。仍缺的是发布动作本身（推送 / 合并 main / 发版，须作者单独授权）与 U5 真机链路（改由作者本人验收，WorkBuddy 不提供该证据）。

## 8. 追加（同日）：B1 成就通知常驻未读与跨重启归档

作者新指示：真机验收由本人届时测试、WorkBuddy 自主决定后续工作、backlog 需要推进、不做无用功与过度工作。据此选交接第 7 节「成就UI/通知」中边界最清楚、不依赖外部素材或玩法数值的 PF-01 未完成项落地；**没有**开 U3 动态 import 重构、分块下载、设备空间读取或 pre-push 钩子等高风险可选项。

| 文件 | 改动 |
| --- | --- |
| `core/csh_achievement_feedback.js`（运行源码） | 新增本机键 `csh_achievement_archive_v1`：最近 200 条展示记录、按 `source:kind:id` 去重、逐条/全部标记已读、每页 20 条分页回顾、换档（scope generation 变化）清空、写入 readback 校验与失败提示；右下角常驻「成就回顾 · 新 N」入口，重启初始化即恢复。原「本次运行最多 200 项」回顾与动画队列行为不变；不写钱包、不改成就条件/奖励/领取凭据 |
| `core/csh_migrate.js`（运行源码） | 新键按项目约定登记进 `EXCLUDED`：本机展示记录，不随他人存档导入；E41 由该字面量自动满足 |
| `tools/probe_feedback_archive_20261105.mjs` | 新增，18 项反例（跨重启、已读持久、分页、容量、去重、换档、写失败、键隔离、三横屏、销毁） |
| `catalog.js` | 两个运行源码变化后重生成；修前 `--check` 报 2 不符、修后 0，1035 文件 build 一致 |

验证：新反例 **18/0**；既有反馈专项 39/0、47/0、39/0；完整 `check.js` 见本轮日志；`release.js --check` / `--worktree` 0 不符。**真实宿主专项 `probe_achievement_feedback_host.mjs` 在本副本无法启动**（缺 `ext/app/index.html`，服务返回 404、`lib/game/CSH` 未加载），属环境缺失，与本次改动无关，不计入通过。

**刻意未做**：长期无限通知归档与历史全文检索（只做有界 200 条）、失败组整组清理、分块下载、设备空间读取。发布硬步骤不变：最终候选提交后仍须 `--rev <提交>` 0 错才可发布。

## 9. 追加（同日）：B2 生涯 2000 条规模交互检查

`7e00900` 之后继续推进的 backlog 项，**只改 `tools/` 与 `docs/`，没有改运行源码、没有改 catalog**。

| 文件 | 改动 |
| --- | --- |
| `tools/probe_career_scale_20261105.mjs` | 新增，真实 career.html + 真实 2000 条定义，19/0；记录 33 批次、单次最大重绘 278ms、累计 4.56s |
| `tools/probe_career_achievements.mjs` | 固化扩容前事实的断言修正：493→2000、循环上限 10→40、类别「互动」20→按引擎动态计数（现 40）；修前 126/16 FAIL，修后 142/0 |
| `docs/audit/WORKBUDDY_B2_CAREER_SCALE_20261105.md` | 新增报告 |

复用同一夹具的 `probe_career_inline_detail_20261103.mjs` 129/0。**刻意不改 `paintAchGrid()`**：每批 +60 全量重绘在 2000 条下功能正确、峰值 278ms 可接受；改增量 append 要动筛选/排序/详情/焦点公共路径，真机性能证据归作者 U5。残余：渐进加载需 33 次「继续查看」；其他探针里的 `493` 多为历史基线引用，本轮未逐一核查。
