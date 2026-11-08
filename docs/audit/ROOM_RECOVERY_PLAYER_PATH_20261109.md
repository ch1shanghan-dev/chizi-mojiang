# 工作包 B · 完整玩家路径的真实宿主验证

2026-11-09。接续 `ROOM_RECOVERY_HOST_VERIFY_20261109.md`。**13/0，0 错误，0 对话框。**
这一批把「事务层已验证」和「页面快照往返已验证」两段证据串成一条真实玩家路径。

## 命令与证据

```bash
node tools/probe_host_smoke.mjs --host 'D:/noname/resources/app' --extension-source . \
  --out "D:/CodexWork/chizi-mojiang/work/room-path-20261109/host5" --room-player-path
```

结果：`D:/CodexWork/chizi-mojiang/work/room-path-20261109/host5/host-smoke.json`

新增夹具模式 `--room-player-path`（`smokeRoomPlayerPath()`），仍复用既有宿主引导层：
真实引擎、真实 `lib.cshShell` / `lib.cshWallet`、真实 iframe、真实 localStorage、
一次性 Chromium 档案，进程边界用 `Page.reload({ignoreCache:true})`。

## 走过的路径

1. 宿主里给隔离档案注资 → `lib.cshShell.charge("blackjack", 20000)` 走真实入场收费
2. iframe 真开出一桌廿一点 → 调用页面 `__BJ.startHand()` 发一手牌
3. 记录 `__BJ.roomShot()` 与钱包余额
4. **宿主整体重载**（iframe 一并销毁，钱包从磁盘重读）
5. 玩家重进同一张桌（同一个 `charge` 入口）
6. 页面自己通过 `shell-room-state` 拿到 `mode=resume` → `applyRoomShot` → 回到牌桌
7. 比对重载前后 `__BJ.roomShot()` 全等，且钱包余额未变

## 13 项断言（全绿）

关键几条：

- 入场只扣一次带入
- **开局后快照确实落盘**（宿主侧 `csh_room_v1` 为 `active` 且 `shot.s.shoe` 非空）
- 重载后余额未被二次扣款，凭据仍在
- **重进不二次扣款**
- **续局后页面状态与重载前完全一致**（牌靴 / 手牌 / 筹码 / 阶段逐字段相等）
- 恢复进的是 `view-game` 而不是开局页
- 全过程宿主无脚本错误与对话框

## 这一批抓到的两个真 bug

### ① 牌值域写错：0..51 当成真值

`csh_room.validateShot` 原来把牌值域定成 0..51（按数组下标想当然）。
两桌的 `newDeck()` 都是 `(rank << 2) | suit`，rank=2..14，**真值域是 8..59**。
结果真实牌局里的牌（如 56、59）整批被判「牌值非法」，快照永远写不进去。

之前 E95AH 的往返测试用的是我自己造的 0..51 假数据，**所以全绿而功能是死的**——
和上一批「探针只测模块、测不到加载图」是同一类错误，这次是「测试数据的域和真实数据不一致」。

### ② 对多副牌的牌靴做去重

廿一点是 4~8 副牌，同一个牌值在 `shoe` 里出现多次完全正常。
原校验给 `cardArray(s.shoe, ..., seen)` 传了去重表，于是报「牌靴有重复牌」。
真实宿主第一次跑就是死在这两句上：

```
pageDiag: {"seq":1,"known":true,"error":"房间快照非法：牌靴有重复牌"}
```

修复：牌靴只校验数量与值域，不做去重；德州的单副 `deck` 仍保留去重。
同时把 E95AH 的往返样本改成真实域（8..59，含重复），并新增 4 条断言锁死这两个口径。

### 顺带修的一处韧性问题

`roomSeq` 在启动问宿主失败时保持 0，而 `activate` 已经把宿主的 `saveSeq` 推到 1，
`expectSeq=0` 会被乐观锁拒收。现在加 `roomSeqKnown`：序号未知时**不传** `expectSeq`，
宿主自己的单调序号本身就是防旧实例的锁。两个牌桌都改了。

## 现在可以说的 / 仍然不能说的

**可以说**：在真实无名杀宿主 + 真实钱包 + 真实 iframe + 真实重载下，
廿一点的跨进程续局已经跑通，钱没有重复扣，牌局状态逐字段一致。
P1「进行中房间跨进程恢复」的**首个可结算闭环**成立。

**仍不能说**：

- 德州走了同样的代码路径，但完整玩家路径夹具只跑了廿一点；德州只有 vm 往返与静态接线证据。
- 不是提交/恢复中途断电的时点覆盖，是受控 `Page.reload`。
- 不是安卓 / Electron / 懒人包，也不是自然长局（这里只发了一手）。
- U5 安卓实机仍由作者验收。

## 门禁

E95AH 117 → **124/0**；整仓 `node tools/check.js` **exit=0**；
`release --check` 0 不符；`catalog_git_bytes --rev HEAD` 1044 文件 0 错。

---

## 追加：两桌拉平（2026-11-09 同日）

`--room-player-path` 已参数化为 `--room-table blackjack|texas`，德州补上与 `__BJ`
同口径的 `window.__TX` 取证面（`getG / roomShot / startGame / getRoomDiag`）。

| 桌 | 结果 | 证据 |
| --- | --- | --- |
| 廿一点 | **13/0** | `D:/CodexWork/chizi-mojiang/work/room-both-20261109/blackjack-final/host-smoke.json` |
| 德州 | **13/0** | `D:/CodexWork/chizi-mojiang/work/room-both-20261109/texas-final/host-smoke.json` |

德州首跑 12/1，差异字段是 `sessionOver`（实时 `true`、恢复后 `false`）。定位后确认
**不是产品缺陷，是探针抢跑**：德州 `Bridge.pull` 的回调是异步的，夹具在 `roomResume`
完成之前就调了 `startGame()`，随后 `showStart()` 又把 `G.sessionOver` 置回 `true`，
于是「实时读到的状态」和「先前已落盘的快照」不是同一帧。

修法：两桌各加 `bootDone` 闸门，只在启动回调真正收尾后置位；宿主夹具的
`frameReady` 必须等到 `getRoomDiag().bootDone === true` 才允许开一手。
E95AH 新增 3 条静态断言锁住 `__TX` 面与两桌的 `bootDone`。

至此 P1「进行中房间跨进程恢复」在两张真钱牌桌上都有完整玩家路径闭环。
仍未覆盖：斗地主 / UNO 未接 room、提交中途断电时点、安卓 U5 实机、自然长局。
