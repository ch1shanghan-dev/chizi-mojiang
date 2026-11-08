# 工作包 B · 房间凭据的真实宿主验证

2026-11-09。基线 `e4fc323` 之后，版本 4.0.16。**15/0，0 运行错误，0 对话框。**

## 为什么要单独做这一批

前几批把 `csh_room.js`、`settleRun.settleId`、廿一点与德州页面都接通了，但证据全部来自
vm 反例和静态接线断言。按手册 §2「如实区分证据」，**那不算运行时验证**。
这一批不写业务代码，只在真实的无名杀宿主里把整条事务链跑一遍并做两次真实重载。

## 环境

| 项 | 值 |
| --- | --- |
| 宿主 | `D:/noname/resources/app`，未改动的 `index.html` + 真实引擎 |
| 扩展 | 通过 `--extension-source .` 覆盖服务端提供的扩展源码 |
| 浏览器 | 全新一次性 Chromium 档案（headless），不接触玩家浏览器 |
| 服务 | 本地只读 HTTP，`connect-src 'self'`，拒绝一切写文件请求 |
| 钱包 | 宿主里真实的 `lib.cshWallet`（不是 vm 桩） |
| 存储 | 宿主页面真实的 `localStorage`（不是注入的 Map） |
| 进程边界 | 用 CDP `Page.reload({ignoreCache:true})` 造出**新文档 + 钱包从磁盘重读** |

命令：

```bash
node tools/probe_host_smoke.mjs --host 'D:/noname/resources/app' --extension-source . \
  --out "D:/CodexWork/chizi-mojiang/work/room-host-20261109/host" --room-smoke
```

证据：`D:/CodexWork/chizi-mojiang/work/room-host-20261109/host/host-smoke.json`
（另有 `progress.jsonl` 逐阶段日志与启动截图）。

## 新增夹具模式

在既有 `probe_host_smoke.mjs` 里加了 `--room-smoke` 分支（`smokeRoomRecovery()`），
复用它的 HTTP 服务、CDP 连接和 `reloadHost()`，**没有另写一套浏览器引导层**。
现有其它探针用字符串替换该文件的模式分派行来派生自己的 runner，本次插入在
`--world-layout-410` 之后，链式 `else if` 仍然合法；整仓门禁已复跑通过。

## 15 项断言（全绿）

| # | 断言 | 结论 |
| --- | --- | --- |
| 1 | 真实宿主已加载 `window.CSHRoom` | ✅ 上一批「模块写了但从未加载」的修复在真实引擎里生效 |
| 2 | 真实钱包暴露 `roomReceipt()` | ✅ |
| 3 | 真实宿主已加载 `window.CSHTopUpJournal` | ✅ 补码事务不再是死代码 |
| 4 | 扣款前 `prepare` 在真实 localStorage 落盘并读回 | ✅ |
| 5 | 扣款成功、凭据进入 `active`、余额只减一次入场费 | ✅ |
| 6 | **真实重载后 `decide()` 判 `resume`，且 `charged===true`** | ✅ |
| 7 | **真实重载后余额仍只扣一次**（没有重复入场费） | ✅ |
| 8 | 真实重载后快照原样带回，牌靴未重抽 | ✅ |
| 9 | 真实 `settleRun` 把房间编号写进同一次余额写入 | ✅ |
| 10 | **结算凭据跨第二次重载仍在**（重启后能自证已付，不必重放结算） | ✅ |
| 11 | 结算收尾清凭据后判 `none` | ✅ |
| 12 | **只写凭据没扣款 → 判 `discard`，余额未动，绝不白送钱** | ✅ |
| 13–15 | 宿主启动与全过程无脚本错误、无未处理拒绝、无原生对话框 | ✅ |

## 明确边界（不许外推）

- **没有驱动牌桌 UI**。本批直接调用宿主的 `CSHRoom` / `wallet.settleRun`，
  验证的是事务层，不是「点收费屏 → 开 iframe → 打一手 → 关宿主 → 重进看到同一张桌」这条玩家路径。
  页面侧的两个往返测试（`E95AH` 117/0）覆盖了快照序列化，但两段证据之间仍缺一次真实开桌串起来。
- **不是断电时点覆盖**。用的是受控 `Page.reload`，不是提交中途杀进程。
- **不是安卓 / Electron / 懒人包 / 自然对局**。
- **没有碰玩家档案**。资金只在一次性 Chromium 档案里用 `add(...)` 合成。

## 下一批该做什么

把两段证据接起来：在真实宿主里走一次完整玩家路径——开廿一点收费屏、发一手牌、
`Page.reload`、重进同一桌、核对 `window.__BJ.getState()` 的牌靴/手牌/筹码与重载前一致、
确认钱包只扣一次。做完之后 P1「房间跨进程恢复」才算真正闭环。

整仓门禁 `node tools/check.js` 在本批改动后 **exit=0**（2 项既有告警）。
