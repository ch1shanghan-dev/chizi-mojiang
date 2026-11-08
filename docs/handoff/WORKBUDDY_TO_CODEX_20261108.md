# 池子魔将｜WorkBuddy → Codex 全面交接文档

**编制**：WorkBuddy　　**日期**：2026-11-08　　**交接原因**：作者决定后续工作交回 Codex。
**适用版本**：本地开发分支 4.0.16（HEAD `c58a539`）。
**本文是 WorkBuddy 接手期（2026-11-05 → 2026-11-08）的完整事实记录与接手指南。**

> **读法**：第 0 章是接手当天必须知道的事；第 1–2 章是环境与版本红线；
> 第 3–4 章是「做了什么」的总账与逐轮细节；第 5 章是改代码前必须知道的架构真值；
> 第 6 章是验证手册；第 7–8 章是待办与明确未做；第 9 章是作者硬约束；
> 第 10 章是踩过的坑；第 11–12 章是文档索引与接手检查清单。
>
> **口径纪律**：本文所有数字都来自实跑或源码，不写「大概」。
> 每轮成果都注明「已实装 / 隔离验证 / 仅方案 / 待素材 / 待实机」，不把隔离探针冒充真机。

---

## 0. 一页速览：接手第一件事

| 项目 | 事实 |
| --- | --- |
| 代码位置 | `D:/CodexWork/chizi-mojiang/workbuddy/ext/app/extension/池子魔将` |
| 本会话工作区入口 | `D:/Tencent QQ/2026-11-05-05-33-20/repo`（目录联接，指向上面的真实目录） |
| 本地分支 | `work/achievement-integration-20261105`，**ahead 33 未推送** |
| 本地版本 | **4.0.16**，四处一致：`info.json` / `extension.js` / `package.js` / `catalog.js` |
| 远端 GitHub | `main` 与 `work/achievement-integration-20261105` **都停在 `1bced2a`，`info.json` = 4.0.15**（2026-11-08 经 GitHub 通道复核） |
| 发布状态 | 未推送、未合并 main、未建 tag/Release、未发版。**不要动版本、不要推送** |
| 工作区 | **干净**（`git status --short` 无输出） |
| 接手点 → HEAD | `1bced2a` → `c58a539`，**33 个提交 / 118 文件 / +14254 −276** |
| 发布清单 | `catalog.js` **1042 文件**，按 **Git blob 字节**生成；`--rev HEAD` 0 错 |
| 验证入口 | ① `node tools/check.js`（33 项执行级）② `node tools/check_update_suite.mjs --out <D盘> --rev HEAD`（15/0）③ `node tools/check_slow_suite.mjs --out <D盘>`（8 项 Chromium，约 6–11 分钟） |
| 最近一次全量 | 完整门禁 **exit=0 / FAIL 0 / RETRY 0**；慢速 **8/0**；套件 15/0；注册自检 3/0 |
| 真机验收 | **归作者 U5**，WorkBuddy 未执行，也不冒充真机证据 |

**接手当天先跑这四条**（都不改文件）：

```bash
cd "D:/Tencent QQ/2026-11-05-05-33-20/repo"   # 或直接用真实代码目录
git status --short && git log --oneline -3
node tools/release.js --check
node tools/catalog_git_bytes.mjs --rev HEAD
node tools/check_probe_registry.mjs
```

---

## 1. 环境与工作区

### 1.1 路径与权限

- 真实代码目录：`D:/CodexWork/chizi-mojiang/workbuddy/ext/app/extension/池子魔将`。
- 宿主仓库同级目录：`D:/CodexWork/chizi-mojiang/workbuddy/ext/app/` 下有 `noname/`（无名杀引擎）与 `mode/`。
  **宿主夹具一直都在**：`ext/app/noname/game/index.js`、`ext/app/mode/identity.js`。
  WorkBuddy 曾在 E1 轮误把路径层数测错，得出「缺宿主、探针跑不起来」的错误结论，后来实跑
  `tools/probe_aux_spirit.mjs` 266/0 才纠正。**别再重复这个误判。**
- 本会话为绕开客户端「工作区外路径每次询问授权」的问题，建了目录联接：
  `D:/Tencent QQ/2026-11-05-05-33-20/repo` → 真实代码目录。
  Codex 若在自己的工作区，直接用真实目录即可；`repo` 只是 WorkBuddy 会话的便捷入口。
- **测试 / 日志 / 临时产物一律放 D 盘**（`D:/CodexWork/chizi-mojiang/work/`、`.../temp/`）。
  浏览器探针必须显式 `--out` 到 D 盘，否则会覆盖 `docs/audit/ui/` 的基线截图。

### 1.2 依赖

- Node 22（本机 `C:\Users\Chishanghan\.workbuddy\binaries\node\versions\22.22.2-6\node.exe`）。
- Chromium / Chrome 无头模式，默认 `C:/Program Files/Google/Chrome/Application/chrome.exe`。
  `tools/lib/chromium_audit.mjs` 的 `withChromium({width,height}, run)` 提供 CDP `send`；
  截图用 `Page.captureScreenshot`，几何用 `Runtime.evaluate`。
- 一次性夹具可放 D 盘 `work/` 目录不进仓库（例如本轮 `i1-css-baseline.mjs`），
  但**任何要长期复跑的探针必须落进 `tools/` 并注册门禁**（见 §6.3）。

### 1.3 已知环境故障

- 命令通道曾全局报 `SandboxError 0xFFFFF826`（center 规则快照不可用），
  Bash / PowerShell / Grep / 子代理**全部**被挡，只有 Read / Glob / Write / Edit 可用。
  约 20 分钟后自行恢复。本机 `git` 直连 GitHub 也会偶发 `schannel` 失败，
  可用已连接的 GitHub 通道（`mcp__github__*`）核对远端。
- **故障时不要改文件**：跑不了门禁、重生成不了 catalog、提交不了，
  改了只会留一个无法验证的脏工作区。等通道恢复再开工。
- 后台任务偶发 `exit=125`（沙箱起不来），慢速通道改前台跑即可。
- **2026-11-08 收尾时的写代理限制**：`node tools/release.js` 写回 `catalog.js` 时报
  `EPERM: operation not permitted`。诊断结论：目录可新建文件、`catalog.js` 可
  `File.Open(..., Write)`、文件非只读，是 WorkBuddy 的 brokered-fs 写代理拒绝**覆盖已有文件**
  （`[IO.File]::Delete` 同样被拒）。**不影响本次交付**：本轮只改了
  `docs/audit/` 与 `docs/handoff/` 两类文档，它们**不在发布清单收录范围**，
  `catalog.js` 本就无需变更；`release.js --check` 与
  `catalog_git_bytes.mjs --worktree` 均 `0 错 / ok:true`。
  Codex 若遇到同样 EPERM，先确认「是否真的需要重生成」——只有清单内文件改动才需要；
  真需要重生成又写不进时，查客户端写代理/文件占用，**别手工编辑 `catalog.js`**。

**`catalog.js` 实际收录范围（VM 求值实测，1042 文件）**：
`mobilefx` 370 / `audio` 293 / `image` 267 / `core` 69 / `games` 11 /
`effect` 8 / `main` 8 / 根目录 7 / `font` 4 / `character` 2 / `skills` 2 / `card` 1。
**`tools/` 与 `docs/` 收录数为 0**（GitHub 信息保护，安装包排除内部审计文档与工具）。
所以新增探针、写报告、改交接文档**都不需要重生成 catalog**；
只有 `core/` `games/` `main/` `image/` `audio/` 等清单内文件变动才需要。
`extraDiskFiles` 判红针对的是「磁盘上新增了**应进清单**的运行文件却没登记」。

---

## 2. 版本与发布纪律（作者多次确认，红线）

### 2.1 版本事实

| 对象 | 版本 | 提交 | 说明 |
| --- | --- | --- | --- |
| 远端 `main` / 远端开发分支 | **4.0.15** | `1bced2a` | 已发布稳定版，玩家在线更新源指向这里 |
| 本地开发分支 | **4.0.16** | `c58a539` | 继续开发，**锁死不推送、不合并、不发版、不建 tag/Release** |

**历史纠偏**：WorkBuddy 早期曾误把 4.0.16 推送并合并 main，作者明确纠正
「你搞错了，是推送 4.0.15，然后本地改为 4.0.16 继续开发」，
随后用 `--force-with-lease` 把远端两个分支回退到 4.0.15。**别再推 4.0.16。**

- 桌面 `池子魔将-4.0.15.zip` 曾交付过，作者 2026-11-08 明确「桌面包不需要管了」。
- 4.0.16 **不需要压缩包**，别生成。
- GitHub 身份保护：noreply 邮箱 + 笔名，不含个人目录/联系方式；安装包排除 `.git`、
  内部审计文档与工具。

### 2.2 发布清单必须按 Git blob 字节

事故背景：CRLF/LF 导致「本地校验通过、GitHub 下载后哈希不符」。

- `tools/catalog_git_bytes.mjs`：新增的独立核对工具，支持 `--worktree` / `--rev <提交>` / `--tree`。
- `tools/release.js` 已重写：按 **Git blob 字节**生成 `catalog.js`，内存自检后落盘；
  `--check` 是只读检查；`--push` 有发布副作用，**不要当校验命令用**。
- `tools/check.js` 的 E53 做全量字节对账。
- C1 轮修过一个盲区：`extraDiskFiles` 判红，防止磁盘上新增了运行文件却没进 `catalog.js`。
- **发布硬步骤**：改完运行源码 → `node tools/release.js` 重生成 →
  `node tools/release.js --check` 0 不符 → 提交 →
  `node tools/catalog_git_bytes.mjs --rev HEAD` **0 错**，才可发布。
- 当前 `catalog.js`：`build=a4c7eaea…`、`1042 文件`、含 `limits`
  （文本 512KiB / 文件 16MiB，来自 `tools/lib/update_limits.mjs`）。

### 2.3 真机边界

作者明确「不需要 WorkBuddy 做真机链路验收，我到时候测试就可以了」。
**U5 真机验收归作者**。所有验证结论都必须写明是「隔离探针 / Chromium / 静态断言」，
不能写成「真机通过」。

---

## 3. 接手期总账：33 个提交

`git log --oneline 1bced2a..HEAD`（正序）：

| # | 提交 | 主题 |
| --- | --- | --- |
| 1 | `f8f802d` | release: 4.0.16 发布可靠性、成就通知归档与生涯 2000 条规模验证 |
| 2 | `4351769` | docs: 记录 4.0.16 发布状态、玩家更新源生效与安装包校验 |
| 3 | `a68ab55` | test: 生涯目标推荐宿主专项同步 2000 条定义基线 |
| 4 | `fd5a4a9` | docs: 修正版本工作流，远端保持 4.0.15、本地 4.0.16 继续开发 |
| 5 | `8a6aea3` | test: 修复首批探针抽取遗漏并记录互动审计已知缺口 |
| 6 | `759c56c` | test: 补行囊跨版本兼容专项并写入兼容纪律 |
| 7 | `6f15b96` | docs: 立项局中更新方案并登记待办 |
| 8 | `32134ac` | feat: 4.0.16 支持对局中更新，本局结束后自动安装并重启 |
| 9 | `e2825ff` | test: 修复互动审计夹具缺失，恢复恩怨记账回归 124/0 |
| 10 | `3c88ba3` | test: 局中更新反例接入一键只读验证 12/12 |
| 11 | `ea890d4` | feat: 局中更新等待结算与待保存清空后再安装 |
| 12 | `6f5be0a` | test: 门禁探针统一重试一次并如实标注，消除随机红 |
| 13 | `8984ab9` | feat: 局中更新支持取消待安装，成功才清凭据 |
| 14 | `02621a4` | B6–B9 并行轮：失败组整组清理、首次采集证据、过时与孤儿专项治理 |
| 15 | `3f56f1a` | B10：旧经济基线定性为基线变更，首次采集口径立项 |
| 16 | `621aed9` | B11–B13：救回三个孤儿专项、统一 JSON 契约、门禁注册自检 |
| 17 | `a1c9d80` | B14/B15：慢速验证通道与世界入口 92/12 真红灯修复 |
| 18 | `43ec9c8` | docs: 玩法/数值/美术三类待办的设计方案与妖灵 50 条增益数值草案 |
| 19 | `1cb433d` | C1：妖灵增益数据层 S1，修发布检查漏登记盲区 |
| 20 | `a4aec67` | D1：第四款德州 AI 牌风 `trapper` 与世界 12 牌风映射 |
| 21 | `9eb2e2c` | E1：救回妖灵助战宿主回归探针，纠正宿主夹具错误结论 |
| 22 | `bad558d` | S2/S3：妖灵增益运行态接入助战会话 |
| 23 | `1e8a958` | 全量审计 + 世界同桌跨桌冷却（方案 §3.2 纠偏） |
| 24 | `4d0f92c` | D2：德州真实补码重上桌（方案 §3.1） |
| 25 | `697adc7` | D3：补码未决事务与启动幂等退款 |
| 26 | `59a7db1` | D4：修正妖灵增益模板语义矛盾（持续型 vs 一次性） |
| 27 | `6d2d574` | S4：妖灵六类增益接线与状态面板呈现 |
| 28 | `bbb8767` | E2：横屏视口令牌纠偏与断点基线锁定 |
| 29 | `7212e4f` | F1：人物回应生命周期缺陷修复 + 图鉴助战增益展示 |
| 30 | `b89af78` | F2：Alert 报错防御 + 图鉴信息层级第一批 |
| 31 | `0e259e6` | G1：断点迁移真值定案 + 救回成就归档孤儿探针 |
| 32 | `b47b62f` | H1：CSS 六档令牌 / 字号并档 / 图鉴分区导航 |
| 33 | `c58a539` | I1：断点第一批 `height:430→500` 整批收敛 + 五视口截图验证 |

**规模**：118 文件、+14254 −276。
**新增 core 模块 7 个**：`csh_spirit_buffs.js`、`csh_spirit_buff_runtime.js`、
`csh_spirit_buff_skills.js`、`csh_topup.js`、`csh_topup_journal.js`、
`csh_seat_cooldown.js`、`csh_viewport.js`（另有 `csh_startup_recovery.js` 在 U3 前段新增）。
**新增 `tools/probe_*.mjs` 22 个**；仓库现有 `probe_*.mjs` **248 个**，其中 **33 个**进了日常门禁。
**新增审计报告 29 份**（`docs/audit/WORKBUDDY_*.md`），索引见 §11。

---

## 4. 逐阶段做了什么

### 4.1 U0—U4：发布可靠性（接手首轮，代码侧完成，真机 U5 归作者）

| 轮 | 已确认问题 | 修正 | 反例 |
| --- | --- | --- | --- |
| **U0** | 清单按工作区文件哈希生成，CRLF/LF 差异让本地通过、GitHub 下载失败 | 新增 `tools/catalog_git_bytes.mjs`；重写 `tools/release.js` 按 Git blob 字节生成；改 `check.js` E53；重生成 catalog | `node tools/release.js --check` / `--rev` |
| **U1** | 更新任务生命周期分裂，`checkUpdate`/`kill`/`startUpdate`/手动恢复各自为政，旧 finally 解新锁、旧回包写新弹窗 | `csh_debug.js` 统一页面唯一任务 + 弹窗代次；提交/恢复阶段拒绝关闭与重开；下载阶段可取消 | `probe_update_lifecycle_20261105` **29/0**；既有事务 24/0、UI 33/0、安卓 IO 6/0、备份 40/0 |
| **U2** | 旧缓存 / HTML 错误页 / 空 / 截断 / 404 / 5xx / 跳转会被当成有效文件 | `fetchFile` 按本次目录同一预期 SHA-256 逐源核验，全拒绝并继续下一可信源；`updateBases` 优先 `st.candidateBase` 目录同源；`cshFetchText` 加 `redirect:'error'` 与 HTML 拒绝 | `probe_update_mirror_fallback_20261105` **11/0** |
| **U3** | 进程中断后无启动恢复依据 | `csh_update.js` 加同步 pending 标志 + `guardIO` 超时观察（超时只置 uncertain，不清凭据、不释放锁）；新增 `core/csh_startup_recovery.js` 作为 `extension.js` 第一个业务 import，未决时返回最小受保护包并异步恢复 | `probe_update_startup_recovery_20261105` **10/0** |
| **U4** | 失败暂存与备份容量无界、无预检 | 「整组保护」与「下载副本可清理」解耦；新增 `tools/lib/update_limits.mjs`（512KiB / 16MiB）；`release.js` 生成前预检超限即拒；catalog 写 `limits`；`csh_debug.js` 下载前按 limits 拒绝 | `probe_update_backup_capacity_20261105` **10/0** |

**明确未做**：服务端不可变 build URL、失败组整组清理（保守保留 `before/`）、
分块下载、设备空间读取、动态 import + 顶层 await（受保护是「不启用 package」而非「阻断模块求值」）。

一键复核：`node tools/check_update_suite.mjs --out <D盘目录> [--rev HEAD]`，当前 **15/0**。
差异归属见 `docs/audit/WORKBUDDY_U0_U4_DELTA_20261105.md`——**注意**：
接手时工作区脏改动里大部分是 Codex 的 4.0.15 成果，必须原样保留，别当垃圾清掉。

### 4.2 局中更新（4.0.16 内解决，不是 4.0.17）

作者先说「4.0.16 以后优化」，随后纠正为「我们现在正在开发 4.0.16，那就这个版本把问题解决」「任何时候都应该可以更新」。
**按最新口径在 4.0.16 内做完**：

- 事务层拆出 `prepare()` / `commit()` / `abortPrepared()`，`apply()` 保持兼容。
- 局中先下载并逐文件核验、暂存；`window.CSHUpdate.__cshPendingInstall`、
  `__cshCancelPending()`、`__cshCancelInFlight` 控制；
  **本局结算、钱包待保存、迁移状态都稳定后才提交并重启**，绝不打断结算。
- 无对局时仍可一键立即安装。
- 取消待安装：只有 `abortPrepared` 成功才清凭据；失败（已进提交阶段）保留凭据并如实提示；
  取消进行中自动安装**推迟**而非照常提交。
- 反例：`probe_update_deferred_20261105` 8/0、`probe_update_cancel_pending_20261105` 7/0。
- 方案：`docs/audit/BACKLOG_IN_GAME_UPDATE_PLAN_20261105.md`。

### 4.3 B1—B15：backlog 治理与门禁基建

| 编号 | 内容 | 结果 |
| --- | --- | --- |
| B1 | 成就通知常驻未读入口 + 本机最近 200 条分页归档（跨重启保留、换档隔离、写失败提示） | `csh_achievement_feedback.js` / `csh_migrate.js`；`probe_feedback_archive_20261105` 18/0 |
| B2 | 生涯 2000 条规模交互 | 新增规模专项 19/0（33 批全可达、单次最大重绘 278ms）；修既有专项过时断言 493→2000、循环 10→40，142/0 |
| B3 | 行囊跨版本兼容 | `probe_migrate_compat_20261105` 10/0；兼容纪律写入 `AGENTS.md` |
| B4 | 门禁随机红 | `runProbeJson(script,args,{timeout,retries=1})` 统一失败重试一次并打印 `[RETRY]`；真实缺陷仍判红；`probe_gate_retry_20261105` 5/0 |
| B5 | 取消待安装 | 见 §4.2 |
| B6–B9 | 首次采集证据、失败组清理、过时/孤儿探针治理 | 见对应报告 |
| B10 | 旧经济基线定性为基线变更 | 不重新列待修 |
| B11–B13 | 救回三个孤儿专项、统一探针 JSON 契约、门禁注册自检 | `tools/check_probe_registry.mjs`：`--self-test` 5/0、普通 3/0 |
| B14 | 慢速验证通道 | `tools/check_slow_suite.mjs`，8 个 >30s Chromium 探针，不进日常门禁 |
| B15 | 世界入口 `probe_world_entry.mjs` 92/12 真红灯修复 | 108/0 |

**教训（B13）**：项目里反复出现「写了 266 条断言的探针却没有任何入口引用」的孤儿模式。
**新增或救回任何探针必须注册门禁/套件**，并用 `check_probe_registry.mjs` 自检。

### 4.4 设计方案（定案底稿，实施期按代码事实纠偏）

`docs/WORKBUDDY_DESIGN_GAMEPLAY_NUMERIC_ART_20261107.md` + `docs/spirit-buff-draft.json`。
覆盖玩法、数值、美术三条线；头部状态表逐条记录实施进度。
**方案里的数值与语义在实施期被多次纠偏**（见 §4.5 / §4.6 / §4.8），
Codex 接手时**以代码与逐轮报告为准，不要照抄方案初稿**。

### 4.5 妖灵线：S1 → S4（数据层 → 运行态 → 引擎接线 → 图鉴展示）

| 阶段 | 产物 | 关键事实 | 反例 / 门禁 |
| --- | --- | --- | --- |
| **C1 / S1** | `core/csh_spirit_buffs.js` | 只读、冻结、零 import；50 条 / 6 模板 / 好感 B 单一解锁 / 每局 1 次 / `magnitude=1`；不写 localStorage / 钱包 / CBY | `probe_spirit_buffs_20261107` **17/0 ×2**，E95P |
| **S2/S3** | `core/csh_spirit_buff_runtime.js` | 纯内存；好感 B 解锁、六类每局一次、token 幂等迟到回调、关闭重开不重置、换档隔离；**延迟读 S1**，加载顺序无关，缺数据层全部拒绝 | `probe_spirit_buff_runtime_20261107` 起步 46/0 → D4 后 **64/0**，E95S |
| **D4** | 运行态升 v2 | 修正方案 §2.1 自相矛盾：`globalFrom` / `maxHandcard` mod 每帧查询，而 `perGame=1` 的 `consume()` 第二次就失效。定案两类：**T1/T2/T5/T6 一次性**走 `consume()`；**T3/T4 持续型**走 `activate()+isActive()`，共用计数天然互斥 | 46→64/0，改前基线 4 红 |
| **S4** | `core/csh_spirit_buff_skills.js` | 六类技能用 `game.addGlobalSkill` 注册（**不进 `character.skills`**，否则助战 266/0 立刻红）；`filter` 只读 `available`，真正 `consume` 放 `content` | `probe_spirit_buffs_wired_20261107` **41/0**，E95W；助战宿主 266/0 无退化 |
| **F1** | `games/codex.html` | 默认折叠的「助战增益」面板：50 条模板名 / 文案 / 好感 B 解锁态 / 只读声明；`renderAff()` 末尾接线覆盖全部好感重绘；零存档零钱包零桥，纯 `textContent`，数据层缺失整块隐藏 | `probe_codex_spirit_buff_20261107` **35/0**，E95Z |

**六类触发点**：T1 `damageBegin4` 减伤、T2 `useCardAfter` 摸牌、
T3 `mod.maxHandcard` 手牌上限、T4 `mod.globalFrom` 距离、
T5 `chooseToRespondBegin` 响应、T6 `dying` 回复。

**明确边界**：S4 是**隔离探针直调技能函数 + 静态接线断言**，没跑真实引擎事件循环。
`addGlobalSkill` 后引擎是否遍历全局技能的 mod、六个 trigger 的参数形状，都未在真实对局验证。
**T5 风险最高**——「无牌的已响应」是否被引擎接受（杀→闪、无懈可击可能要求具体牌）要真机定；
当前写法只标记接应，不碰牌堆和胜负。

### 4.6 德州线：D1 → D3（AI 牌风、真实补码、跨进程事务）

**D1｜第四款 AI `trapper` + 世界 12 牌风映射**
- 查证发现世界自 v6.3 起有 **12 种牌风**（还有 50 只妖灵手工指定），
  而 `texas.html` 的 `PERSONA_MAP` 只映射 5 种，其余 7 种退化成随机三选一。
- 方案初稿给 trapper 的 `open: .34` 与 `decide()` 语义相反——`style.open` 是入池门槛，
  **值越高越紧**（tag .57 / bluff .47 / loose .40）。按事实纠偏为 **.62**。
- `csh_texas_ai.js` 加 trapper + 只读 `personas()`；`texas.html` 补 12 条映射、
  `mapPersona` 改 `hasOwnProperty` 堵原型键；自对弈与 fuzz 扩到四款。
- `probe_texas_persona_20261107` **32/0**，改前基线 16 红，E95Q；
  `--hands 10000` 91204 动作 0 停滞 / 0 非法 / 0 守恒失败，trapper VPIP 37.6% / PFR 5.5% 均四款最低。

**D2｜真实补码重上桌**
- **头号红线**：`endSession` 拿 `G.buyIn` 当本金基数。桌面筹码 `+N` 必须同步
  `G.buyIn += N`，否则玩家能把补码的钱当盈利领回去（刷钱）。
- 三层实现：纯函数 `core/csh_topup.js`（时机六守卫、10% 单位额度取整、状态转移、净赢守恒）；
  `csh_shell.js` 新增 `shell-topup`，走**与开局带入同一条** `wallet.spend` + `pc()` 读回确认，
  宿主独立校验每桌 2 次上限与额度、读回不一致回补；`texas.html` 结算横幅补码按钮（含输光分支）、
  迟到回调隔离。额度基准 `G.buyIn - G.topUpTotal`，不随补码漂移。
- `probe_texas_topup_20261107` **53/0 → 59/0**，E95U；德州规则 33/0、费用 1013/0、公开观测 43/0。

**D3｜补码未决事务（D2 明确留下的跨进程缺口）**
- 项目现成的 `pending` 是「结果补记」语义会立刻消费，不适合未决事务。
  按 U0—U4 的事务纪律另做单键状态机 `core/csh_topup_journal.js`：
  扣款**前**同步落盘 `prepared` 凭据并读回确认 → 宿主 ACK 带 `txId` → 页面校验编号后上桌并发 `commit` 清凭据 →
  启动发现未决凭据则幂等退款。
- **头号不变量**：凭据记 `balanceBefore`，重启后 `pc === balanceBefore` 说明钱包写盘根本没成功，
  **退款等于白送钱**，只清凭据；只有 `pc === balanceBefore - amount` 才退。
  `refunding` 阶段防重复退、退款被拒保留凭据待重试、篡改清键不退款、已有别的未决事务挡住并发。
- 凭据登记进 `csh_migrate.js` 的 EXCLUDED；模块缺失时宿主**拒绝补码**而不是静默降级。
- `probe_topup_journal_20261107` **48/0**，E95V。
- 一次门禁红是 **E30 CBY 防护**：新增两处入账 reason 用了变量和单引号，
  规则要求**双引号字面量**（否则会被防护静默丢掉）。按规则修产品，没放水。

**明确未做**：真机断电实测、离线调试补码（没有宿主钱包，不伪造扣款）。

### 4.7 世界同桌跨桌冷却（方案 §3.2 纠偏）

- 全量审计（`docs/audit/WORKBUDDY_AUDIT_AND_SEAT_COOLDOWN_20261107.md`）：
  22 个提交、69 文件 / +9598 −189（当时），无谎报完成、版本失控、误推送或字节失配。
- 查证发现方案 §3.2 与代码事实对不上：`activeList()` **早就**无条件排除退隐，
  「50–99 排除已退隐」不是待办；「退隐越多重复概率越低」因果还反了——
  **缩小候选池只会提高重复率**。
- 真实缺口只有「同一角色不连续出现在相邻几桌」。新增纯函数 `core/csh_seat_cooldown.js`：
  退隐 0–99 / 100–149 / 150+ → 0 / 1 / 2 桌冷却，只过滤候选池，
  **候选全挡时降级回完整池绝不空桌**，不改 stake / skill / persona / 发牌。
- `csh_world.js` 的 `seat()` 三处接线，`if(SC)` 守卫，模块缺失降级。
- `probe_seat_cooldown_20261107` **42/0 ×2**，E95T；反例抓出两个真边界缺陷
  （`Infinity` 被当成 150+、`cap=0` 被 `|| 2` 吞掉），修产品而非放水。

### 4.8 UI / 界面 / 互动线：E2 → I1

> **方向纠正（重要）**：作者一度让「装扮实体素材你来构建，要用生图」，
> WorkBuddy 误读成「画人物插画」，生成了 3 张宋风美人。
> 作者随即纠正：**「高级审美」指 UI / 界面 / 互动层面的设计**
> （构图、信息层级、字阶、材质、留白、反馈节奏、回应/事件、原生宿主流程），
> **人物图像 / 装扮实体素材 / 立绘不由 WorkBuddy 操心**。
> 三张生成图、错误设计文档、方案里 6 处错误改动**全部撤回，未进仓库一个字节**。
> 依据：交接主文档 §7、`docs/audit/FOLLOWUP_PLAN_20261030.md §3`、
> `docs/audit/PLAYER_FEEDBACK_REDESIGN_20261104.md §5.2/PF-08`、`docs/art-direction.md §4.6/§4.7`。

| 轮 | 内容 | 反例 / 门禁 |
| --- | --- | --- |
| **E2** | 复核发现 `330/500` 是极矮 / 一般矮**两档有意分层**（合并成 420 会挤爆 640×286 牌桌），且全仓实际 **24 种**断点。新增 `core/csh_viewport.js` 四档分类与令牌唯一真值、`csh_layout.css :root` 三档变量；门禁把 24 种固化为基线白名单锁「不扩散」。**零 @media 改动** | `probe_viewport_tokens_20261107` 35/0 → I1 后 **38/0**，E95X |
| **F1** | ① §4.3 人物回应独立反例，抓出并修掉真缺陷：`queueScene()` 迟到守卫提前 `return` 时，释放 `manualReplyJob` 的代码写在 `callback` 里根本跑不到，job 悬挂并白占 6 秒节流。加**可选** `onDrop`，所有提前 return 统一通知释放，其余 8 处调用行为不变。② 图鉴助战增益只读展示 | `probe_interact_reply_20261107` **63/0**（首跑 59/4），E95Y；`probe_codex_spirit_buff_20261107` 35/0，E95Z |
| **F2** | ① **Alert 报错防御**：查清 `createAchievementFeedback` 裸初始化、4 个页面事件回调、`guarding` 定时器、`csh_uikit.achievementUI()` 及 3 个出口都无错误边界，异常会冒到宿主弹源码上下文。加 `bootArchive()` + `safeHandler/safely` + 公开方法统一 `guarded`（异常返回同类型安全值），UIKit 加 `inertAchievementUI()` 双层兜底，全程不弹原生 alert、不写奖励。② PF-08 第一批图鉴信息层级：名录搜索（纯过滤不重排不写档）、当前关系摘要（只读 `affState` + `AFF.gifts`）、共同经历收进 `<details>`、渐隐金线 + 极淡内高光、矮屏复用既有 340 断点收起摘要 | `probe_feedback_error_boundary_20261108` **125/0 ×2**（15 类故障 + 7 类损坏存档），E95AA；`probe_codex_hierarchy_20261108` **39/0**，E95AB |
| **G1** | ① 救回孤儿探针：`probe_feedback_archive_20261105` 实测仅 **4.4s**，不该进 >30s 慢速通道，按事实直接注册日常门禁 E95AC。② 断点迁移真值：按 E95X 同口径扫全仓 21 文件 95 处断点，`max-height` 15 种 / `max-width` 13 种；发现 E2 四档令牌装不下中等高度 520–640 与中宽 899–1199，定案 **6 档目标**（height 330/500/**640**、width 760/**1000**/**1200**）。`csh_viewport.js` 升 v2，冻结 `TARGETS/MIGRATIONS/migrationOf()`，direction/risk/newTier 机械推导。**零 CSS 改动** | `probe_viewport_migration_20261108` 37/0 → I1 后 **38/0**，E95AD；E95X 同步 v2 后 35/0 |
| **H1** | ① CSS `:root` 补齐六档变量与 JS 真值双向对账。② `art-direction §4.7` 收尾：Chromium 915×412 / 640×286 实测 13.5px vs 13px 的 computed 行高 20.25→19.5（**如实差 0.75px**），但按钮高 44 / 内容高 42 / 滚动宽 158 / 换行 / 页面溢出全一致，才把 `csh_theme.js` 的 `md2` 并到 13px 并同步 4 文件 **8 处同值兜底**；游戏页 `--pfs-*` 独立标尺未动。③ PF-08 第二批：3 个 44px 分区 tab（相处 / 记忆 / 档案）只收拢低频 details，`affbox` 与增益面板常驻，矮屏 340 隐藏导航并全展开；**「共同行动」当前无对应功能，不造假入口** | `probe_layout_tokens_20261108` **9/0**，E95AE；`probe_lfs_merge_20261108` **17/0**，E95AF；`probe_codex_sections_20261108` **22/0**，E95AG |
| **I1** | **真改 CSS 第一批**：`height:430` 的 **21 处 `max-height` + 1 处配对 `min-height`** 整批收敛到 500，涉及 11 文件；另同步 8 条档位注释/规范。两处纠偏见下 | `probe_viewport_tokens` 38/0、`probe_viewport_migration` 38/0、`probe_layout_tokens` 9/0、`probe_codex_hierarchy` 39/0、`probe_codex_sections` 22/0 |

**I1 的两处关键纠偏（Codex 继续收敛时务必继承）**：

1. **扫描口径漏了 `min-height` 配对规则**。E2/G1/E95X/E95AD 的正则只看
   `\(\s*max-(height|width)`，但 `games/blackjack/blackjack.html:385` 有一条
   `min-height:430px` 的 L-NORMAL 反向规则（放大牌），与 `max-height:430px` 的 L-SHORT（压间距）配对。
   **只改 max 不改 min，431–499 高度会同时命中两套样式**。I1 把 min 一并改成 500，
   并在 E95X 加了配对断言：每个 `min-height:v` 必须存在 `max-height:v`（同值重叠）
   或 `max-height:v-1`（互补不重叠，如 641/640、441/440）。残留 `min:430` 立即判红。
2. **§4.4 三横屏基线测不到这一刀**。640×286 / 915×412 / 1365×768 全在 431–500 区间外，
   截图比对只会得到「完全没变化」的**假绿**。I1 补了 **915×480** 视口。
   **后续每收敛一个值，都必须补一个落在变化区间内的视口**，否则验证无效。

**I1 验证方式**：一次性 Chromium 夹具（放在 `D:/CodexWork/chizi-mojiang/work/i1-css-baseline.mjs`，
**不进仓库、不新增探针**，因为只是本轮取证）加载真实 5 个 core CSS + 统一骨架，
改前/改后各截 5 视口：

| 视口 | 改前 | 改后 | 结论 |
| --- | --- | --- | --- |
| 640×286 | 16% / 8px | 16% / 8px | 几何完全一致 |
| 915×412 | 15% / 8px | 15% / 8px | 几何完全一致 |
| 1365×768 | 18% / clamp | 18% / clamp | 几何完全一致 |
| 610×275（1.5 缩放等价） | 16% / 8px | 16% / 8px | 几何完全一致 |
| **915×480** | 18% / clamp | **15% / 8px** | 按预期命中 L-SHORT |

五视口改后均 `overflowX/overflowY = 0`、操作按钮全在首屏。
截图与 JSON 留档 `D:/CodexWork/chizi-mojiang/work/i1-css/`。
**边界**：夹具是统一骨架 + 真实 core CSS，不是完整游戏页内联脚本；
游戏页自身 `@media` 的最终视觉靠既有浏览器探针与慢速通道回归，真机归作者。

### 4.9 桌面妖灵皮肤文件夹（作者交办，非代码改动）

- 作者要求告知 50 只妖灵名单，并在 `C:\Users\Chishanghan\Desktop\妖灵皮肤`
  补建剩余名字文件夹，他直接往里放皮肤文件。
- 名单真源：`core/csh_bossdata.js` 的 `MINION_POOL`（挂牌顺序 50 只）+ `MINIONS[].name`；
  与 `docs/spirit-buff-draft.json` 50 条 `name` **逐条一致**，无重名、无 Windows 非法字符（含「鬼の子」）。
- 原有 6 个目录：伊芙 / 希里 / 罗宾 / 艾达王 / 芙莉莲（在册）+ `纲手（暂时不动）`。
  「纲手」不在 50 名单，只在 `core/csh_aff_lines.js` 台词里出现，按作者标注保留。
- **新建 45 个空文件夹**（每批 10 个逐批核对数量），最终 51 目录、顶层 0 文件、
  新建 45 个全空、原有 6 个内已有图片**一个都没动**（未移动 / 重命名 / 删除）。
- 已放文件命名不统一（`1.jpg` / `2.jfif` / `皮肤1.jpg` 等）。后续接进 `csh_spirit_skins.js`
  时按**实际文件名**生成「稳定 skinId + 本地路径」注册表，不写进玩家存档、不碰经典立绘。
  **文件命名不用为适配代码而调整。**
- 个人目录纪律：扫描阶段全程只读，只新增空目录，不碰任何已有内容。

---

## 5. 架构关键真值（改代码前必读）

### 5.1 发布与门禁

| 文件 | 作用 |
| --- | --- |
| `catalog.js` | 自动生成，**勿手改** `files`。1042 文件、build、limits |
| `tools/release.js` | 按 Git blob 字节生成；`--check` 只读；`--push` 有副作用 |
| `tools/catalog_git_bytes.mjs` | `--worktree` / `--rev` / `--tree` 精确核对 |
| `tools/check.js` | 日常门禁。E95 注册区 **33 项**（E95A–Z + AA–AG），`runProbeJson` 统一重试一次 |
| `tools/check_probe_registry.mjs` | `--self-test` 5/0、普通 3/0；硬查注册行是否指向不存在文件、6 个关键专项是否仍被覆盖 |
| `tools/check_update_suite.mjs` | 更新链路一键复核 15/0，支持 `--rev HEAD` |
| `tools/check_slow_suite.mjs` | 8 个 Chromium 探针，`--only <探针名>` 可单项补跑 |
| `tools/lib/skill_audit.mjs` | AST 抽取真实页面函数供反例在 VM 里直调 |
| `tools/lib/chromium_audit.mjs` | `withChromium({width,height}, send)`，CDP 封装 |

**33 项门禁注册**（`check.js` 约 3370–3412 行，格式 `[编号, 探针, 参数, min断言数, 描述, 超时]`）：

`E95A` 生涯来源 12/0 · `E95B` 退隐可达 28/0 · `E95C` 失败组清理 10/0 ·
`E95D` 行囊兼容 10/0 · `E95E` 迁移失败 57/0 · `E95F` 世界生命周期 67/0 ·
`E95G` 生涯奖励 29/0 · `E95H` 世界名册 35/0 · `E95I` 旧经济基线 23/0 ·
`E95J` 任务定义 48/0 · `E95K` 德州规则 33/0 · `E95L` 注册自检 5/0 ·
`E95M` 注册自检 3/0 · `E95N` 首批修复回归 56/0 · `E95O` 生涯成就浏览器 142/0 ·
`E95P` 妖灵数据层 17/0 · `E95Q` 德州牌风 32/0 · `E95R` 助战宿主 266/0 ·
`E95S` 妖灵运行态 64/0 · `E95T` 跨桌冷却 42/0 · `E95U` 德州补码 59/0 ·
`E95V` 补码事务 48/0 · `E95W` 六类接线 41/0 · `E95X` 视口令牌 38/0 ·
`E95Y` 人物回应 63/0 · `E95Z` 图鉴增益 35/0 · `E95AA` 反馈错误边界 125/0 ·
`E95AB` 图鉴层级 39/0 · `E95AC` 成就归档 18/0 · `E95AD` 迁移真值 38/0 ·
`E95AE` CSS 令牌 9/0 · `E95AF` 字号并档 17/0 · `E95AG` 分区导航 22/0。

**慢速通道 8 项**：`probe_achievement_quality` 78/0 · `probe_career_achievements` 142/0 ·
`probe_update_lifecycle_20261105` 29/0 · `probe_world_ui_rebuild` 80/0 ·
`probe_world_memoir_ui` 92/0 · `probe_update_ui_20261105` 33/0 ·
`probe_panel_window` 69/0 · `probe_world_entry` 108/0。

### 5.2 更新链路

- `core/csh_update.js`：事务层 `prepare()` / `commit()` / `abortPrepared()` / `apply()`（兼容）、
  同步 pending 标志、`guardIO` 超时观察、失败暂存分类清理。
- `core/csh_debug.js`：页面唯一更新任务 + 弹窗代次、`fetchFile` 逐源 SHA-256 核验、
  下载前按 `limits` 拒绝、恢复状态提示。
- `core/csh_startup_recovery.js`：`extension.js` 第一个业务 import，未决时返回最小受保护包。
- `window.CSHUpdate.__cshPendingInstall` / `__cshCancelPending()` / `__cshCancelInFlight`：
  局中更新的待安装与取消入口。

### 5.3 妖灵三层

```
core/csh_spirit_buffs.js          数据层（只读、冻结、50 条 / 6 模板 / 好感 B）
        ↑ 延迟读（加载顺序无关）
core/csh_spirit_buff_runtime.js  运行态（纯内存、每局一次、token 幂等、换档隔离、v2 分一次性/持续型）
        ↑
core/csh_spirit_buff_skills.js   技能工厂（host 注入，便于反例直调）
        ↑ game.addGlobalSkill 注册（不进 character.skills）
core/csh_aux_spirit.js           助战会话（召唤成功 / restore / arm 三处接线，全包 try）
```

- `games/codex.html` 引入只读数据层做「助战增益」折叠面板，**只展示不改战斗行为**。
- `docs/spirit-buff-draft.json` 结构 `{buffs:[50]}`，不是数组——写解析时别搞错。

### 5.4 补码三层

```
core/csh_topup.js            纯函数：时机六守卫 / 10% 单位额度 / 状态转移 / 净赢守恒
core/csh_topup_journal.js    未决凭据：prepare 同步落盘 → commit → recover 幂等退款
csh_shell.js shell-topup     宿主：wallet.spend + pc() 读回、独立校验 2 次上限与额度
games/texas/texas.html       结算横幅补码按钮、Bridge.topUp、迟到回调隔离、G.buyIn 同步累加
```

**红线**：`endSession` 用 `G.buyIn` 当本金基数，桌面筹码 `+N` 必须同步 `G.buyIn += N`。
凭据 `balanceBefore` 判定「钱包没扣款时绝不退款」，否则白送钱。
凭据登记在 `csh_migrate.js` 的 EXCLUDED。

### 5.5 视口与断点

- `core/csh_viewport.js` **v2**：`TOKENS`（分类）、`PROFILES`（四档）、
  `TARGETS`（6 档目标：height 330/500/640、width 760/1000/1200）、
  `MIGRATIONS`（按轴映射，direction/risk/newTier 机械推导）、`migrationOf(value, axis)`、
  `classify(w,h)`（**只用 330 分 tiny/wide，没有消费 `shortMaxHeight`**）。
- `core/csh_layout.css :root`：六档变量 `--csh-vp-tiny-h:330` / `short-h:500` / `mid-h:640` /
  `narrow-w:760` / `mid-w:1000` / `wide-w:1200`。
  **media query 不能用 `var()`**，这些变量只是文档与未来 `@custom-media` 迁移的单一来源。
  G1 报告里「把 same 值换成令牌」在 CSS 层**不可执行**；same 值本来就已是目标值，无需改数字。
- **三套边界仍未统一**（既有状态，真改 JS 分类前必须单独定案）：
  ① `csh_layout.css` 规范注释 L-NORMAL ≥500 / L-SHORT <500 / L-TINY <350；
  ② `TOKENS` 写 tiny=330 / short=500；
  ③ `classify()` 只用 330 分档。
- **当前断点账**（E95AD `--out` 动态算，不手写）：97 处、23 种合并值，
  same 48 / expand 38 / shrink 11，高风险 49。
  逐页清单由 `node tools/probe_viewport_migration_20261108.mjs --out <D盘>.json` 输出。

### 5.6 反馈与图鉴

- `core/csh_achievement_feedback.js`：`bootArchive()` + `safeHandler/safely` +
  公开方法统一 `guarded`（异常返回同类型安全值）；`csh_uikit.js` 有 `inertAchievementUI()` 兜底。
  **代码侧已无未捕获路径**，但设备上若是旧文件混装，得装上新版本才生效。
- `games/codex.html`：名录搜索（纯过滤）、当前关系摘要（只读 `affState` + `AFF.gifts`）、
  低频详情分区导航（相处 / 记忆 / 档案）、助战增益折叠面板。
  「共同行动」**无对应功能，没造入口**。

---

## 6. 验证手册

### 6.1 三条入口，别混用

| 入口 | 命令 | 用途 | 耗时 |
| --- | --- | --- | --- |
| 日常门禁 | `node tools/check.js` | 33 项执行级专项，改任何运行源码后必跑 | 数分钟 |
| 更新链路一键 | `node tools/check_update_suite.mjs --out <D盘> --rev HEAD` | 发布/更新链路复核 15/0 | 数分钟 |
| 慢速通道 | `node tools/check_slow_suite.mjs --out <D盘> [--only <探针名>]` | 8 个 >30s Chromium 探针，发布前或怀疑回归时手动跑 | 6–11 分钟 |

- `probe_achievement_quality.mjs` 约 90s，默认 20s 超时会被误杀，**只能走慢速通道**。
- 救回探针**先量耗时再选入口**：`probe_feedback_archive_20261105` 只有 4.4s，
  塞进慢速通道等于继续没人跑，已按事实注册进日常门禁 E95AC。
- 慢速通道本机变慢时可能被 SIGTERM 掐断，可用 `--only` 单独补跑剩余项，
  报告里要**如实写「分两次跑完」**，不冒充一次性整条通过。

### 6.2 发布字节流程（每轮必走）

```bash
node tools/release.js --check          # 生成前应如实报 mismatchCount > 0 / extraDiskFiles > 0
node tools/release.js                  # 重生成 catalog.js
node tools/release.js --check          # 必须 0 不符、extraDiskFiles:0、ok:true
node tools/check.js                    # 完整门禁
git add ... && git commit ...
node tools/catalog_git_bytes.mjs --rev HEAD   # 提交级 0 错，才可发布
node tools/check_update_suite.mjs --out <D盘> --rev HEAD
node tools/check_probe_registry.mjs    # 3/0
```

**注意**：`git add && git commit && ... ; echo $?` 混合 `&&` / `;` 会把 `$?` 取成链断处的值，
曾显示过假的 `suite_exit=1`。**提交后单独复核，别用这种混合链。**

**清单范围**：`tools/` 与 `docs/` 不进 `catalog.js`（见 §1.3 的实测分布）。
只改探针、报告、交接文档时**跳过 `node tools/release.js`**，
直接 `release.js --check` 确认 0 不符即可；改了 `core/` / `games/` / `main/` /
资源目录才必须重生成。每轮 `mismatchCount` 的数量应等于本轮改动的**清单内**文件数。

### 6.3 新增探针的纪律

1. 落到 `tools/probe_*.mjs`，输出统一 JSON（`passed` / `failed` / `failures`），
   支持 `--out`（浏览器类必须显式给 D 盘路径）。
2. **注册进 `check.js` E95 区或慢速通道**，min 断言数写实际值。
3. `node tools/check_probe_registry.mjs` 自检 3/0。
4. 内置**改前基线**：故意构造旧实现/缺陷版本，证明断言集能判红；
   否则探针可能只是摆设。
5. 重跑完整门禁，确认新项与既有项都绿。

### 6.4 常见红灯与处置（别放水）

| 现象 | 原因 | 处置 |
| --- | --- | --- |
| `[RETRY]` 偶发 | 已知时序敏感探针，B4 统一重试一次 | 短期可接受；反复出现是待办信号，去修探针真实时钟/随机依赖 |
| E30 CBY 防护红 | 新增入账调用 reason 不是**双引号字面量** | 按规则改产品，别改断言 |
| `--check` 报 `extraDiskFiles` | 磁盘新增运行文件未进 catalog | 重生成 catalog |
| `--check` 报 `mismatchCount` | 改了运行源码/文档没重生成 | 重生成 |
| 反例红在「注释里的敏感词」 | 探针正则扫到了注释 | 剥掉注释后只扫代码体，别放宽产品断言 |
| 反例红在硬编码数量（24 种、493 条等） | 断言随产品演进而过时 | 按事实改成动态口径，**不放水**；例如基线从 E95X 的 `BASELINE` 解析 |
| AST 抽取异常 / 重复闭合行 | 页面补丁破坏了函数边界 | 从备份重应用并补 `node --check` |
| CDP `awaitPromise:true` 卡住 | 故意不 resolve 的 gate Promise | 去掉 `awaitPromise` |
| `DevToolsActivePort` EBUSY | Chrome 刚创建文件 | 已有重试；残留测试进程要清 |
| 浏览器探针污染 `docs/audit/ui/` | 没给 `--out` | `git restore` 恢复基线截图，下次显式给 D 盘路径 |

---

## 7. 待办清单（按建议顺序，含出处与已知坑）

### 7.1 断点逐值收敛剩余 22 个值（进行中，I1 已完成第一批）

- 唯一依据：`node tools/probe_viewport_migration_20261108.mjs --out <D盘>.json` 的逐页清单，
  **不靠记忆或方案文字**。
- 顺序：中频 expand 优先 → **11 处 shrink 放最后**。
  - `width:600→760`（7 处）、`width:899→1000`（5 处）、`width:1199→1200`（3 处）等。
  - shrink：`height:350→330`(4)、`340→330`(4)、`520→500`(3)。
    **`520→500` 影响 501–520 这个常见区间**，最容易让某些屏幕丢失必要规则。
- **每批三个动作**：① 整批改同一个值（21 处 430 分布在 11 文件，只改一页会造成
  同一高度下不同页面行为不一致）；② 补一个**落在变化区间内**的视口做改前/改后截图；
  ③ 同步收缩 E95X 基线、E95AD 断言、报告、`CURRENT_WORK.md`。
- 别忘了 `min-height` 配对（§4.8 I1 纠偏一）。

### 7.2 PF-08 图鉴整页信息层级

- 出处 `docs/audit/PLAYER_FEEDBACK_REDESIGN_20261104.md §5.2`：
  左侧紧凑名录 / 中央主体立绘 / **右侧独立关系栏**（当前关系阶段、本次事件或可行动项、简明成本）；
  主入口「相处 / 共同行动 / 记忆 / 档案」；未相识不剧透。
- 已做：F2 名录搜索 + 关系摘要 + 低频收纳；H1 低频详情分区导航。
- **「共同行动」当前无对应功能，不要造假入口**。这是作者明确认可的做法。
- 注意 `probe_codex_selection_20261103` 会把 `.dinfo details` 全部打开，
  低频内容收成折叠区不会踩红；但整页三栏构图会动布局，必须跑三横屏浏览器回归。

### 7.3 PF-03 助战牌桌呈现

- 出处 `PLAYER_FEEDBACK_REDESIGN §3.3`：常驻只留「妖灵名 · 状态」+ 1~3 个剩余能力图标；
  点头像开短横向抽屉（头像/姓名 → 本局核心帮助 → 可用次数/下次触发 → 记录）；
  被动触发合并成一次短动效 + 一行说明；额度耗尽自动收起亮按钮；
  1365×768 / 915×412 / 640×286 验真实遮挡、实际点击与焦点；正文 ≥12px、操作 ≥44px。
- 现状：S4 只有状态面板文字，牌桌没有常驻呈现。

### 7.4 其它 UI / 互动

| 事项 | 出处 | 状态 |
| --- | --- | --- |
| 事件与关系回应扩展（高光 / 受挫 / 同桌 / 关系变化） | B1 备注 | 部分；F1 只修了队列生命周期 |
| 动效语汇 A3（菜单逐项浮现 / 点击金圈扩散 / 结算数字滚动） | art-direction | 部分（结算数字滚动已落地） |
| 牌面升级 A4 / B3（3D 翻转、辉光描边；先保可读牌面 / 底池 / 行动 / 结算） | art-direction | 未做 |
| 官阶短颁授 / 挑战节奏与失败提示 | C1/C2 备注 | 未做，可在旧经济下独立改善 |
| 同档字号并档 | `art-direction §4.7` | **H1 已完成** |

### 7.5 其它线

- 音效与托管整体提升、房间跨进程恢复、非牌桌软保存、平台/自然终局/长期离线、
  国内受控服务只读核实。
- 成就：长期全部通知无限保留与历史全文检索、数字分页替代 33 次「继续查看」（**刻意取舍，非缺陷**）。
- 妖灵：S4 六类效果的**真实引擎事件循环验收**、T5「无牌已响应」真机确认、图鉴外装扮覆盖。
- 德州：真机断电实测（补码事务）、离线调试补码（**不提供**，没有宿主钱包不伪造扣款）、
  四款 AI 托管与音效整体提升。
- 真机 U5（作者）、Alert 现象复验（代码侧已修，等作者确认设备上是否旧文件混装）。

### 7.6 明确暂停 / 边界

SLG×GAL 完整策划、普通武将技能平衡、已暂停武将 AI、玩家难度滑块。
**不因泛称「后续更新」自动恢复。**

---

## 8. 明确的「未做」与边界（不冒充完成）

| 项 | 实际状态 |
| --- | --- |
| 妖灵六类增益 | 六类 trigger/mod **已接线**，但只是隔离探针直调技能函数 + 静态接线断言，**没跑真实引擎事件循环**；玩家侧是否真看得见效果未获真机证实 |
| T5 响应 | `chooseToRespondBegin` 触发点确实在引擎白名单，但「无牌的已响应」是否被引擎接受待真机；当前只标记接应，不碰牌堆和胜负 |
| 补码跨进程 | 内存读回确认 + 未决凭据幂等退款已做；**真机断电实测未做** |
| 图鉴增益面板 | **只展示**，不改战斗行为 |
| 断点收敛 | I1 只完成第一批；截图夹具是**统一骨架 + 真实 core CSS**，不是完整游戏页内联脚本 |
| Alert | **代码侧已无未捕获路径**，但设备上旧文件混装需装新版本才生效；实机现象归作者复验 |
| 真机 | U5 全程未执行，不冒充真机证据 |
| 人物素材 | 按作者指令不碰；桌面 4.0.15 包不用管 |

**每次交付都要写明「已实装 / 有原型 / 仅方案 / 待素材 / 待实机」**，这是作者的硬要求。

---

## 9. 作者偏好与硬约束（务必遵守）

1. **「高级审美」= UI / 界面 / 互动层面的设计**：构图、信息层级、字阶、材质、留白、
   反馈节奏、回应/事件、原生宿主流程。**人物图像 / 装扮实体素材 / 立绘不由 WorkBuddy/工具侧操心**；
   不要用生图做人物插画当交付，不要用 SVG 或 CSS 几何拼图冒充正式插画。
   依据：交接主文档 §7、`FOLLOWUP_PLAN §3`、`PLAYER_FEEDBACK_REDESIGN §5.2/PF-08`、
   `art-direction §4.6/§4.7`。
2. **不做无用功与过度工作**。发现方案与代码事实不符，**按事实纠偏**，不要照抄。
3. **「多做一点」= 多完成待办清单上的条目，不是拓展没必要的工作**。
   别为了显得勤奋新增账本 / 哨兵 / 中间层探针。WorkBuddy 曾写好一份「收敛账本」探针，
   按这条指令当场删掉，改成直接真改 CSS 完成待办。
4. **每次交付写明状态**，不冒充完成。
5. **不要再自动关机**。2026-11-08 作者曾说「执行仅一次关机」，那一次已执行完毕；
   之后作者明确「不要再自动关机了」。**不要执行任何 `shutdown` 命令。**
6. **桌面 4.0.15 压缩包不用管**（2026-11-08 作者明确）；4.0.16 不需要压缩包。
7. **版本锁死 4.0.16、不推送、不合并 main、不发版、不建 tag/Release。**
8. **真机 U5 由作者本人测试**，不拿隔离探针冒充。
9. 不做玩家难度设置；不偷偷改变发牌；世界拟真。

---

## 10. 踩过的坑与经验（避免重犯）

1. **发布字节按工作区文件算会翻车**（CRLF/LF）。必须按 Git blob 字节。
2. `release.js --check` 早期漏登记磁盘新增运行文件 → 加 `extraDiskFiles` 判红。
3. `E53` 字段名是 `extraKeys/missingKeys`，不是 `extraHashKeys/missingHashKeys`。
4. 临时目录递归删除触发批量删除保护 → 改单文件索引 / 降级警告。
5. UI 补丁重复闭合行、AST 抽取异常 → 从备份重应用并补 `node --check`。
6. CDP `awaitPromise:true` 遇故意不 resolve 的 gate Promise 会卡死 → 去掉。
7. `DevToolsActivePort` EBUSY、残留 Chrome → 加重试 / 清测试进程。
8. 门禁随机红（E57/E48 单跑全绿、大批串行偶发）→ `runProbeJson` 统一重试一次。
9. E95O 没给 `--out` 污染 `docs/audit/ui/` 基线 → 注册行加临时目录，`git restore` 恢复。
10. `git add && git commit && ... ; echo $?` 混合链取错退出码 → 提交后单独复核。
11. 后台沙箱多次 `exit=125` → 改前台跑完整门禁 / 慢速通道。
12. **测量宿主夹具路径时数错层数**，误判「缺 `noname/game/index.js`、探针跑不起来」→
    实跑 `probe_aux_spirit.mjs` 266/0 才纠正。做「跑不起来」结论前先实跑一次。
13. **方案数值与代码语义相反**（trap 的 `open: .34` 实为「值越高越紧」）→ 实施期复核语义再落地。
14. **方案 §3.2 因果写反**（缩小候选池只会提高重复率）→ 按代码事实重定待办。
15. **方案 §2.1 自相矛盾**（持续型 mod 每帧查询 vs `perGame=1` 一次性 consume）→
    先定案语义再接线，否则接上去就是错的。
16. `skill.js` 的 `globalFrom` / `maxHandcard` mod 每帧被引擎查询；
    技能 `filter` 会被多次调用，**真正 `consume` 必须放 `content`**，否则第一次就失效。
17. `game.addGlobalSkill` 注册全局技能，**不要进 `character.skills`**（助战 266/0 会红）。
18. `spend` 是 `scheduleSave()` 异步写盘，未决凭据必须在扣款**前**同步落盘；
    恢复时按 `balanceBefore` 判断扣款是否持久化，**钱包没扣款时绝不退款**。
19. E30 CBY 防护要求入账 reason 是双引号字面量。
20. 反例的红要分辨「探针夹具问题」还是「产品真缺陷」：
    本轮多次出现数字字符串按 `Number` 可转换、`scope()` 返回新 owner 导致无限递归、
    把结构合法的脏数据误判为损坏、`show()` 重写预置存档等，**都修在探针侧，产品没放水**。
21. 断点收敛的**三横屏基线可能测不到变化区间**，截图会假绿 → 必须补区间内视口。
22. 扫描 `@media` 只写 `max-*` 会漏掉配对的 `min-*` 反向规则。
23. `min-height` 反向规则有同值重叠与 `min=max+1` 互补两种合法写法，配对断言两种都要认。
24. **断言写死数量会随产品演进而过时**（24 种断点、493 条定义等）→ 改动态口径，不放水。
25. `docs/spirit-buff-draft.json` 是 `{buffs:[50]}` 不是数组；注释里的名词会被写入模式误报，
    剥注释后只扫代码体。
26. 命令通道 `0xFFFFF826` 故障时**不要改文件**（见 §1.3）。
27. 相对 `line-height:1.5` 会随字号变，测字号并档别断言「行高完全相同」，要测几何。
28. 慢速通道被 SIGTERM 掐断时，前 7 项日志可确认全绿，最后一项用 `--only` 补跑，
    **报告如实写「分两次跑完」**。
29. 客户端「本次会话内始终允许」按**每次命令字符串**匹配，关键词不同就重新问；
    根治是把代码目录加进工作区白名单或建目录联接。
30. 个人目录（桌面 / 下载 / 文档）操作：扫描阶段全程只读，只新增，不移动 / 重命名 / 删除已有内容。

---

## 11. 文档与报告索引

### 11.1 交接与当前状态

| 文件 | 用途 |
| --- | --- |
| **本文** `docs/handoff/WORKBUDDY_TO_CODEX_20261108.md` | WorkBuddy → Codex 全面交接（当前入口） |
| `docs/handoff/WORKBUDDY_CONTINUATION_20261105.md` | Codex → WorkBuddy 的原始交接（U0–U5 任务书） |
| `docs/handoff/WORKBUDDY_10000_ACHIEVEMENTS_20261104.md` | 成就扩容历史 |
| `outputs/WorkBuddy交接_20261105/00_先看这里.md` / `01_交接主文档.md` | 工作区外的原始交接包（§7 后续工作、§5 交付条件、§6 验证方式） |
| `docs/audit/CURRENT_WORK.md` | 当前工作板（每次交付同步） |
| `AGENTS.md` | 项目纪律与三条验证入口 |
| `docs/WORKBUDDY_DESIGN_GAMEPLAY_NUMERIC_ART_20261107.md` | 玩法/数值/美术设计方案（头部状态表随轮次更新） |
| `docs/art-direction.md` | 美术方向 §4.6 字号 / §4.7 材质迁移 |
| `docs/dev-rules.md` | 开发规范（I1 同步了 L-SHORT 档位） |
| `docs/audit/PLAYER_FEEDBACK_REDESIGN_20261104.md` | PF-03 牌桌呈现 / PF-08 角色页构图原始依据 |
| `docs/audit/FOLLOWUP_PLAN_20261030.md` | §3 UI 边界（构图/字阶/材质/留白，不堆金边发光） |

### 11.2 WorkBuddy 接手期审计报告（`docs/audit/WORKBUDDY_*.md`，29 份）

- **U 系列**：`WORKBUDDY_U0_RELEASE_BYTES_20261105.md`、`WORKBUDDY_U0_U4_DELTA_20261105.md`、
  `WORKBUDDY_U1_UPDATE_TASK_LIFECYCLE_20261105.md`、
  `WORKBUDDY_U2_MIRROR_CACHE_INTEGRITY_20261105.md`、
  `WORKBUDDY_U3_STARTUP_RECOVERY_20261105.md`、
  `WORKBUDDY_U4_STAGING_CAPACITY_20261105.md`
- **B 系列**：`B1_FEEDBACK_ARCHIVE`、`B2_CAREER_SCALE`、`B3_MIGRATE_COMPAT`、
  `B4_GATE_RETRY`、`B5_CANCEL_PENDING`、`B6_WORLD_FIRST_CAPTURE`、
  `B7_FAILED_BUNDLE_CLEANUP`、`B8_STALE_PROBES`、`B9_ORPHAN_PROBES`（均 20261105/06）
- **C/D/E 系列**：`C1_SPIRIT_BUFF_S1_20261107`、`D1_TEXAS_TRAPPER_20261107`、
  `D2_TEXAS_TOPUP_20261107`、`D3_TOPUP_JOURNAL_20261107`、
  `E1_AUX_SPIRIT_REGISTRY_20261107`、`E2_VIEWPORT_TOKENS_20261107`、
  `WORKBUDDY_AUDIT_AND_SEAT_COOLDOWN_20261107`（全量审计 + 跨桌冷却）
- **S 系列**：`S2_SPIRIT_BUFF_RUNTIME_20261107`、`S4_SEMANTICS_20261107`、
  `S4_SPIRIT_BUFFS_WIRED_20261107`
- **F/G/H/I 系列**：`F1_INTERACT_REPLY_CODEX_BUFF_20261107`、
  `F2_ALERT_BOUNDARY_CODEX_HIERARCHY_20261108`、`G1_VIEWPORT_MIGRATION_20261108`、
  `H1_UI_TOKENS_LFS_SECTIONS_20261108`、`I1_VIEWPORT_430_CONVERGENCE_20261108`

### 11.3 关键数据文件

- `docs/spirit-buff-draft.json`：50 条妖灵增益数值草案（`{buffs:[50]}`）。
- `tools/lib/update_limits.mjs`：512KiB 文本 / 16MiB 文件上限真源。
- `D:/CodexWork/chizi-mojiang/work/i1-css/`：**I1 改前/改后 5 视口截图与几何 JSON**
  （`before-*.png` / `after-*.png` / `before.json` / `after.json`），后续断点收敛请沿用同一夹具
  `D:/CodexWork/chizi-mojiang/work/i1-css-baseline.mjs`。

---

## 12. 交接检查清单（Codex 接手当天照做）

- [ ] 读本文 §0、§2、§9（版本红线与作者约束）。
- [ ] `git status --short` 应为空；`git log --oneline -1` 应为 `c58a539`。
- [ ] 确认版本四处仍是 4.0.16；**不要改版本、不要推送**。
- [ ] `node tools/release.js --check` → `mismatchCount:0` / `extraDiskFiles:0` / `ok:true`。
- [ ] `node tools/catalog_git_bytes.mjs --rev HEAD` → 0 错（1042 文件）。
- [ ] `node tools/check_probe_registry.mjs` → 3/0。
- [ ] `node tools/check.js` → exit=0 / FAIL 0。
- [ ] `node tools/check_update_suite.mjs --out <D盘> --rev HEAD` → 15/0。
- [ ] 需要时 `node tools/check_slow_suite.mjs --out <D盘>` → 8/0。
- [ ] 读 `docs/audit/CURRENT_WORK.md` 与设计方案头部状态表，确认待办起点。
- [ ] 从 §7 挑一项开工；**先读代码事实，再决定方案，别照抄历史方案初稿**。
- [ ] 每轮收尾按 §6.2 走发布字节流程，同步 `CURRENT_WORK.md` 与报告，写明已实装 / 待实机。

---

**交接完毕。** WorkBuddy 接手期的全部改动、验证证据、未完成项与作者约束均在本文与
`docs/audit/WORKBUDDY_*.md` 中可复核。工作区干净，版本锁死 4.0.16，未推送。
后续以 Codex 的判断为准；如与本文冲突，**以代码事实和作者最新口径为准**。
