# WorkBuddy 接手第三轮 · U2 镜像、缓存与完整性

日期：2026-11-05。范围：交接第 4 节 U2。U0/U1 已完成，U3—U5 未动。

## 玩家触发与结果

交接写的是「首源返回缓存旧内容而哈希不符时，不会再试其他镜像」。读源码确认属实，且还有一处同源风险：

1. `startUpdate.fetchFile` 在 `response.ok` 后**立即** `return new Uint8Array(await response.arrayBuffer())`。SHA-256 校验在更外层的 `csh_update.js:apply` worker 里（`hashes[rel] && hash !== hashes[rel]`）。所以 HTTP 200 的旧缓存内容会被当成"这个源可用"，随后事务层抛「文件摘要不符」，**整个任务失败，其余镜像一次都不试**。版本探测（`info.json` 可达、面板线路绿色）不能证明文件可用。
2. `_cshUpdBase` 会被 `cshFetchVer()` 覆盖，而 `cshFetchManifest()` 与 `updateBases()` 各自取它做首选。目录可能来自镜像 A、文件从镜像 B 起步 —— 不同构建的目录与文件混用。
3. `cshFetchText` 没有 `redirect:'error'` 也不看 content-type，代理返回的 HTML 错误页会被当文本取回（后续 JSON 解析会挡，但失败原因不可读）。

## 改动范围

**`core/csh_debug.js`（唯一被改的运行源码）**

- `fetchFile` 重写：对**同一个文件、同一个来自本次 catalog 的预期 SHA-256**，逐源核验后才返回。每个源依次拒绝：
  - `!response.ok`（404/5xx）、`response.redirected`、`redirect:'error'` 触发的跳转异常；
  - `content-type: text/html`（错误页 / 代理拦截）；
  - 空响应；
  - 源明确给出 `Content-Length` 且与实际字节数不符（截断）；
  - `await engine.digest(data) !== expected`（旧缓存或不同构建）。
  任一失败都记录可读原因并**继续尝试下一个可信源**；全部失败抛聚合错误，含文件名、已核验的源数与每个源的原因。任务 signal 已取消时立即抛出，不再请求其他源。
- **不降级**：`csh_update.js:apply` 的哈希校验一行未动。下载层先筛源、事务层再独立核验，属于有意的双保险。
- `cshFetchText` 增加 `redirect:'error'`、拒绝 `redirected` 与 HTML 响应，让目录/小包失败原因可读。
- `updateBases()` 优先 `st.candidateBase`（本次目录实际来源），其后才是 `_cshUpdBase`、官方 raw、各镜像，全部去重。`applyCatalog` 新增 `fromBase` 参数记录来源，`loadCatalogOnce` 传 `m.base`。
- 整次任务内 `bases` 与 `info`/`hashes` 都是开始时的快照，中途不换清单、不按版本字符串判断文件是否可用。成功只代表本次目录的全部期望文件通过哈希。

**新增 `tools/probe_update_mirror_fallback_20261105.mjs`**：把**真实的 `startUpdate`** 与**真实的 `csh_update.js` 事务**放进隔离 vm，用可控多源响应做 11 项反例。不模拟下载器、不替换事务。

**`catalog.js` 重新生成**：`csh_debug.js` 是运行源码，改后旧清单立即失效。

## 验证

| 项目 | 结果 |
| --- | --- |
| U2 多源回退反例（新） | **11 / 0** |
| 既有：事务 / UI / U1 生命周期 | 24/0、33/0、29/0 |
| 既有：安卓 IO / 备份 / 联网策略 | 6/0、40/0、76/0 |
| 完整 `node tools/check.js` | **exit=0**，E46/E48/E53 全 OK，FAIL 0，告警 2 项（既有非阻断） |
| 发布字节 | 改后 `--check` 报 **1 个不符**（`csh_debug.js`），重跑 `release.js` 后 `--check` / `--worktree` 均 **0 不符**、build 一致 |

反例覆盖：首源旧缓存换源成功、HTML 错误页、空响应、404+503、Content-Length 截断、跳转、全源旧缓存不写入不写版本不重启、全源失败列出可读原因、事务层哈希未被降级、`updateBases` 同源起步与去重、`cshFetchText` 拒绝 HTML/跳转。

**又一次实证发布纪律**：改完运行源码后 `node tools/release.js --check` 精确报出 1 个不符，重跑生成后归零。U0 建立的门禁在连续两轮业务改动中都拦住了清单失效。

产物在 `D:/CodexWork/chizi-mojiang/workbuddy/outputs/wb-next-update/u2/`：`baseline/`（接手时 git status 与改前 `csh_debug.js` 备份）、`mirrors/mirrors.json`、`transaction/`、`ui/`、`lifecycle/`、`mobile/`、`backup/`、`online/`、`verify-worktree.json`、`verify-candidate-tree.json`、`full-check.log`。

## 真正完成 / 未做

已完成：HTTP 200 不再等于文件可用；旧缓存会换源；坏响应会被明确拒绝并给出可读原因；目录与文件同源起步；全源失败不会部分写入、不会写版本或重启。

未做，不要算进本轮：

- 交接给的另一个选项「固定候选 build / 不可变版本来源（服务端按 build 提供不可变 URL）」**没有实现**。本轮选的是「校验失败后对同一预期哈希继续尝试可信源」，靠同一目录哈希 + 全量校验防混装；若所有源只有旧构建文件，结果是明确失败，不是混装或降级。
- **U3** 进程中断与启动早期恢复、文件接口超时/迟到回调，**U4** 失败暂存与容量边界，**U5** 安卓 4.0.15 真机链路，全部未动。
- 没有连接安卓设备，没有真实 CDN / WebView 证据，没有真机升级、断网、空间不足或权限验证。
- 没有新增提交、推送、合并 main、发 Release/ZIP、安装或覆盖正式安装。HEAD 仍 `5b266c6`，远端 main 仍 `b169698`（4.0.14），玩家在线更新源仍指 main。

## 残余限制

- 下载层每个源多做一次 SHA-256，与事务层重复。137MB 总量下有额外开销，未做真机性能验证；这是换取"在能换源的位置就发现坏源"的代价。
- `Content-Length` 只在源明确给出时校验；chunked / 不返回该头时依赖哈希兜底。HTML 检查依赖 content-type；错误页若伪装成 `text/plain`，仍会被哈希拒绝并换源。
- `st.candidateBase` 只在本次页面会话有效，扩展重载后重新从缓存 base 起步。跨窗口并发仍靠底层 `LOCKS`（U1 已说明）。
- 「取消后不继续请求其他源」由 `fetchFile` 的 `signal.aborted` 检查保证，U2 探针**没有单独构造取消场景**；下载阶段取消由 U1 生命周期探针覆盖。
- 探针是 vm 里的可控响应 + 内存磁盘，不是真实 CDN 缓存行为或安卓 WebView。
- 成功仍只代表本次目录的全部期望文件通过哈希，不代表运行环境、存储权限或重启链路正确 —— 那是 U5。
