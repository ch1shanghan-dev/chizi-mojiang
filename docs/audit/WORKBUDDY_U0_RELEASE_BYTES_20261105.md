# WorkBuddy 接手第一轮 · U0 发布字节一致性

日期：2026-11-05。范围：交接第 4 节 U0（发布清单必须匹配实际发布字节）。U1—U5 未动。

## 玩家触发与结果

`.gitattributes` 是 `* text=auto eol=lf`，Windows 工作目录里的 CRLF 文本文件在 `git add` 时被转成 LF。旧 `tools/release.js` 用 `fs.readFileSync` 按**工作目录字节**生成 `catalog.hashes`，而玩家从 GitHub raw 下载的是 **Git blob 字节**。更新器在 `csh_update.js:98` 和 `csh_debug.js:7731` 用 `hashes[rel]` 逐文件校验下载内容与本机文件，于是「开发者本地对账全绿、玩家下载后报文件摘要不符」。这不是网络或权限问题，是清单本身写错了值。

实证（同一文件 `core/csh_achv.js`）：

| 来源 | SHA256 |
| --- | --- |
| `git cat-file blob 5b266c6:core/csh_achv.js` | `5a0dfa88…` |
| 当时工作目录 / catalog 里写的值 | `d9763d4d…`（4.0.14）/ `584b5b56…`（4.0.15） |

`tools/check.js` 的 E53 原来只查三处版本号和 files 清单与磁盘一一对应，**不查哈希**，所以完整门禁放行了 5b266c6。

## 本轮核对数据

| 对象 | 修前不符 | 修后不符 |
| --- | ---: | ---: |
| main `b169698`（1033 文件，提交自带 catalog） | 0 | 0（未涉及） |
| 开发提交 `5b266c6`（1034 文件，提交自带 catalog） | **17** | 17（历史提交，未改） |
| 当前 4.0.15 工作区候选 | **20** | **0** |
| 隔离索引候选 tree（若此刻提交；tree oid 见 `verify-candidate-tree.json`，文档改动会使其变化） | — | **0**，build 一致 |

交接明确写过「脏工作区 4.0.15 不能沿用 17 作为最终数量」——实测是 **20**，与 20 个 CRLF 文本文件一一对应。两个数字都不要混用。

Node 工具与交接自带的 `checks/check_catalog_git_bytes.py` 对 `5b266c6` / `b169698` 结果完全一致（17 / 0），是独立交叉复核。

## 改动范围

- **新增 `tools/catalog_git_bytes.mjs`**：统一算「精确发布字节」。
  - `--rev <commit>` 读该提交自带的 `catalog.js` 与同代 blob，用于最终候选核对；
  - `--tree <tree-oid>` 读候选 tree，配合隔离索引 `git write-tree`，不移动 HEAD、不建引用；
  - 默认 / `--worktree` 用隔离 `GIT_INDEX_FILE` 让 `git add` 应用 `.gitattributes` 的 clean filter，得到「若此刻提交会发布的字节」。
  - 换行与二进制判定全交给 Git，不自行猜测文本规则；同时核对 `hashes` 键集合与 `files`、以及 `build = SHA256(files.map(f => f + ':' + hashes[f]).join('\n'))`。
- **重写 `tools/release.js`**：`hashes` 与展示体积改按 Git blob 字节生成；生成后先在内存自检通过才写盘；新增 `--check` 纯只读模式（不写任何文件、不改版本）；`--push` 在 commit 之后、push 之前对 HEAD 做提交字节复核，不通过就拒绝推送。
- **`tools/check.js` E53**：加入全量发布字节对账。此后只要改了运行源码却没重跑 `tools/release.js`，门禁就会红；之前抓不到。
- **重新生成 `catalog.js`**：4.0.15、1034 文件，`hashes`/`build`/`date`/`size` 更新，`files` 清单与 `version` 不变。修前原件备份在 `D:/CodexWork/chizi-mojiang/workbuddy/outputs/wb-next-update/backup/catalog.js.before-U0`（SHA256 `9d029698…`）。

**`catalog.files` 里的运行源码一个字节都没改**。本轮只动 `tools/` 与 `catalog.js` 本身，以及 `docs/` 文档；因此不存在「改了运行源码让清单失效」的问题。

## 真正完成 / 未做

已完成：发布侧的生成、生成自检、日常门禁、最终候选只读核对四道衔接，且当前 4.0.15 工作区候选与候选 tree 均为 0 不符。完整门禁 `node tools/check.js` 本轮**通过**（`exit=0`）：E53 显示「版本 4.0.15 三处一致 · catalog 1034 文件与磁盘一一对应 · 发布字节全匹配」，FAIL 0，告警 2 项为既有非阻断项。

未做，不要算进本轮：

- U1 更新器任务生命周期、U2 镜像旧缓存回退、U3 中断与启动恢复、U4 失败暂存与容量、U5 目标安卓真机链路，**全部未动**。
- 没有连接安卓设备，没有取得用户手机精确 build / 宿主 / WebView，没有真机升级、同版修复、失败恢复、横屏缩放或存储权限证据。
- 没有新增提交、推送、合并 main、发 Release/ZIP、安装或覆盖正式安装。HEAD 仍是 `5b266c6`，远端 main 仍是 `b169698`（4.0.14），玩家在线更新源仍指 main。

## 必要检查与产物

```powershell
$env:TEMP='D:\CodexWork\chizi-mojiang\workbuddy\temp'; $env:TMP=$env:TEMP
node tools/release.js --check                        # 只读，0 错
node tools/catalog_git_bytes.mjs --worktree         # 0 错
node tools/catalog_git_bytes.mjs --rev 5b266c6      # 应返回 1 / 17（已知历史失败，不是要改成 PASS）
node tools/catalog_git_bytes.mjs --rev b169698      # 0 错
node tools/check.js                                 # 完整门禁，E53 含发布字节对账
```

产物在 `D:/CodexWork/chizi-mojiang/workbuddy/outputs/wb-next-update/`：`baseline/git-status-20261105.txt`（接手时工作区指纹）、`verify-dev-5b266c6.json`、`verify-main-b169698.json`、`verify-worktree-before.json`、`verify-worktree-after.json`、`verify-candidate-tree.json`、`release-check-before.log`、`full-check.log`、`backup/catalog.js.before-U0`。

**每次发布的硬步骤**：候选提交之后，对那个提交跑 `node tools/catalog_git_bytes.mjs --rev <最终提交>`，0 错才可发布。手工 `git add/commit/push` 路径没有硬阻断，只有 `tools/release.js --push` 有；提交后若再改运行源码，旧清单立即失效，必须重跑 `node tools/release.js`。

## 残余限制

- 工具依赖本机 `git` 可用；核对只用一个临时 `GIT_INDEX_FILE` 文件，不建目录、不递归删除（环境的批量删除保护会把递归清理误判成核对失败），用完即删；临时位置走系统 TEMP，建议按交接把 TEMP 指向 D 盘。E53 每次完整门禁会多跑一次全量 blob 哈希，属于必要的发布保护，不是重复审查。
- 没有把核对接到任何 CI；「已自动保障未来发布」这句话仍然不成立，只有 `release.js` 生成路径与 `--push` 路径被保护。
- `.gitattributes` 未改，工作区 CRLF 仍是常态。刻意不重写全仓文件来消告警——那会改动 1034 个运行文件的发布字节，风险更大。
- 本轮只解决「清单写的哈希 ≠ 玩家下载的字节」。清单内容正确之后，U2 的坏镜像、U3 的中断恢复、U4 的容量边界仍是已确认缺口。
- 交接 179/0 是隔离证据，本轮 0 不符是**字节静态核对**，两者都不能代替安卓真机成功更新。
