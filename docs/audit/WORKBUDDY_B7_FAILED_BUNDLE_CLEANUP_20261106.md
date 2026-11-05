# B7 · 失败更新资料的整组清理（U4 残余收口，2026-11-06）

## 触发

U4 报告把「失败组整组清理」明确列为**刻意未做**：当时只开放了「无 journal 的失败组可只清 `next/`」，
`before/` 与 `backup.json` 仍会一直占空间。理由是「不为腾空间解除全部保护或删唯一可校验回退」。

这个保守是对的，但结论不该是「永远不清理」。只要能证明安全，失败组的原文件副本也该能腾出来。

## 根因（代码事实）

`core/csh_update.js` 的 `protect()` 把 `staging/prepared` **无条件** `protected=true`；
`plan()` 的 bundle 分支又把 `staging/prepared/aborted/rolledback` 一律硬拒：

```js
row.protected = !!state.blocked || ['staging','prepared'].includes(row.state) || ...
if (kind==='bundle' && (row.protected || row.recovering ||
    ['staging','prepared','aborted','rolledback'].includes(row.state))) throw ...
```

而 U4 加的 `kind:'next'` 清理只删下载副本。结果：`before/` 永远留着，清理建议永远不算它。

## 改了什么（只动 `core/csh_update.js`）

新增 `row.failedBundle` —— **可整组清理的失败组**判定，必须同时满足：

1. 无 journal 阻塞，且本组不是 `journalId`；
2. `row.trusted === true`（说明文件与内容逐项可核对）；
3. 状态是明确失败 `aborted` / `rolledback`；
   或者 `staging` / `prepared` 但**无 journal**（进程被杀留下的孤儿）且 `created` 早于 **24 小时**冷静期；
4. 不是 `recovering`，不是 `latest`；
5. **存在另一个可校验回退**：`latest` 的选取现在排除 `failedBundle` 组，
   若排除后没有任何可校验回退，`!latest && beforeBytes>0` 会把所有含原文件的组全部保住。

其余改动：

- `protect()` 的 `i<keep`（按保留组数）不再保护 `failedBundle` 组——否则最新的失败组永远在 keep 内、清不掉。
  但 `row.id===latest`、journal 阻塞、无回退这三条硬保护**一条没松**。
- `plan()` 的 bundle 分支改为：只有 `failedBundle && !protected && !recovering` 才放行；
  并显式拒绝 `row.id===retained`。`kind:'next'` 分支一字未动。
- `publicRow` 暴露 `bundleCleanable`，供界面与反例读取。
- 整组清理中断（`cleaning.kind==='bundle'`，部分文件已删）的组**也算 `failedBundle`**：
  它必须能重试收尾，否则半清理状态会永久卡住。

`cleanup()` 原有保护全部保留：逐文件校验哈希、每个文件前查 journal、
`plan.kind==='bundle' && row.beforeBytes>0` 时再次确认 retained 仍 `recoverable`、
目录出现新内容即中止。

## 界面无需改动（刻意不做）

备份面板 `paint()` 既有按钮条件是 `row.trusted && !row.protected`（「清理此组」）。
新判定下可清理的失败组正好满足，按钮自动出现，`row.reason` 会写明「已确认失败的更新资料」。
「清理建议项」按钮的条件 `rows.some(r=>r.trusted&&!r.protected)` 同样自动覆盖。
**没有新增界面代码**——加一个多余的按钮才是无用功。

## 验证

新增 `tools/probe_update_bundle_cleanup_20261105.mjs`：真实 `backups` 管理器 + 内存文件系统。**10/0**：

| 断言 | 结果 |
| --- | --- |
| aborted 组 + 另一个可校验回退 → `bundleCleanable` 为真、回退仍受保护 | PASS |
| 整组清理删掉 before/next/说明，回退组完好 | PASS |
| 没有另一个可校验回退 → 整组拒绝 | PASS |
| 2 小时前的孤儿 staging 组仍在冷静期，整组拒绝但下载副本可清 | PASS |
| 72 小时前的孤儿 prepared 组 → 整组可清 | PASS |
| 有 journal → 全保护，整组拒绝 | PASS |
| 元数据损坏 → 永不整组清理 | PASS |
| 自动超预算选择只删失败组、绝不删 retained | PASS |
| plan 与 cleanup 之间回退被篡改 → 清理中止 | PASS |
| 整组清理中断的组仍可重试，不永久卡住 | PASS |

既有回归：`probe_backup_lifecycle_20261104` **40/0**、`probe_update_backup_capacity_20261105` **10/0**，
两者都没因为新语义变红（U4 那条「整组仍拒」用例用的是刚创建的组，仍在 24h 冷静期内，结论依然成立）。

新探针已接入 `tools/check_update_suite.mjs` 与门禁 E95C。

## 明确未做与残余限制

- **24 小时冷静期是经验值**，不是产品配置。刚中断的孤儿组仍只能清下载副本；要立刻整组腾空间得等。
- 26 条退隐与其余未接路由的首次采集缺口（B6 报告）与本项无关，本轮未碰。
- 没有真机 FileEntry 上的清理耗时/空间回收证据，全部是隔离内存文件系统。
- `cleanup()` 本身仍没有超时观察层（U3 残余），卡住的 IO 会一直占用锁。下一轮再处理。
- 未改版本号，未推送，未合并 main。
