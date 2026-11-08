# 工作包 B · 首桌跨进程恢复：状态表与快照设计

2026-11-09 编制。基线 `689004e`，开发版 4.0.16，分支 `work/achievement-integration-20261105`。
本文是施工前的只读盘点，**不改产品代码**。行号对应当前工作树。

---

## 0. 结论摘要

1. **房间恢复不是“缺一个快照”，缺的是“扣款凭据”。** 入场扣款走 `spendPC → scheduleSave()` 250ms 防抖写盘，没有任何 journal（`csh_shell.js:811`、`csh_wallet.js:496-508`）。进程若在局中被杀，钱已经扣掉并落盘，但世上没有任何记录能证明“这笔扣款属于哪一桌”。恢复逻辑要能自证所有权，必须先补这张凭据。
2. **结算侧已经有“钱和世界意图同一次写入”的成熟做法**（`csh_wallet.js:1151` 注释与 `tableOutbox`）。房间恢复应当照抄这个模式，不要新造一套。
3. **建议先打廿一点，再落德州。** 理由见 §2。机制骨架在三态（未扣款 / 已扣款未开局 / 已结算未确认）上是对的，与牌桌复杂度无关；德州同时调试新机制和全仓最复杂的资金语义，是最容易写出吞钱 bug 的做法。
4. **桌面级数据全部在 iframe 内存里**：`games/texas/texas.html:1607` 的 `var G = null`，全文件无 `G` 的持久化，唯一一处 `localStorage` 是 `lsGet` 读设置。宿主侧 `TABLE_WORLD`（`csh_shell.js:244`）同样只在内存，重启即失效。

---

## 1. 首桌状态链（德州）

### 1.1 入场段

| # | 状态 | 代码位置 | 存放 | 已落盘 | 支付责任 |
| --- | --- | --- | --- | --- | --- |
| S1 | 玩家在收费屏选带入 | `csh_shell.js:768-773` | DOM | 否 | — |
| S2 | `spend(门票+带入, "入场:texas")` | `csh_shell.js:811` | 内存 `wallet.pc` | **否（防抖 250ms）** | 钱包（唯一） |
| S3 | `currentBuyIn` 赋值 / 开壳 | `csh_shell.js:816-818` | 内存 + `S` | 否 | 壳 |
| S4 | 子页面拉 `shell-seat` → 世界抽座 | `csh_shell.js:1787-1796` | `TABLE_WORLD`（内存） | 否 | 世界 |
| S5 | 页面 `makeSession()` 建 `G` | `texas.html:1611-1676` | iframe 内存 | 否 | 页面 |
| S6 | 首手发牌 | `texas.html:1750+` | iframe 内存 | 否 | 页面 |

**S2 是当前最大的单点风险。** 扣款成功后到落盘之间有最多 250ms；落盘之后到终局之间有整场牌局的时间。后者一旦中断，钱 100% 蒸发，且无凭据可退。

### 1.2 局内段

| # | 状态 | 存放 | 已落盘 |
| --- | --- | --- | --- |
| S7 | 每手牌：`G.deck` / `G.players[].hole` / `G.community` | iframe 内存 | 否 |
| S8 | 筹码与底池：`chips` / `bet` / `contrib` / `pot` / `currentBet` / `minRaise` | iframe 内存 | 否 |
| S9 | 行动权：`toAct` / `street` / `acted` / `allin` / `folded` / `out` | iframe 内存 | 否 |
| S10 | 盲注档位：`handNo` / `dealer` / `sb` / `bb` / `level` | iframe 内存 | 否 |
| S11 | 补码：`topUps` / `topUpTotal` | iframe 内存 + **`csh_topup_pending_v1`（真落盘）** | 部分 |
| S12 | 世界席位：`G.seats[]`（id + stake） | iframe 内存 | 否 |
| S13 | 每日任务：`hands/wins/bigPot` | `csh_daily_task` + `csh_pending_results_v1` | 是 |

S11 是全仓**唯一**已经做了跨进程事务的局内状态（`core/csh_topup_journal.js`），可作为直接样板。

### 1.3 终局段

| # | 状态 | 代码位置 | 存放 | 已落盘 | 支付责任 |
| --- | --- | --- | --- | --- | --- |
| S14 | `endSession(reason)`，`sessionOver=true` | `texas.html:2384-2386` | 内存 | 否 | 页面 |
| S15 | 页面本地算 `payout`（仅用于展示） | `texas.html:2391` | 内存 | 否 | — |
| S16 | `settleSession({buyIn, chips, seats, gamble})` | `texas.html:2414-2418` | 桥 | 否 | 壳 |
| S17 | `settleRun` 原子写：pc + 检查点 + `tableOutbox` | `csh_wallet.js:1209-1251` | 钱包 | **是（同步）** | 钱包（唯一） |
| S18 | `GUARD[guardKey] = r` 幂等标记 | `csh_shell.js:1815` | 内存 | 否 | 壳 |
| S19 | 回 ACK → `finish()` → `entryUsed = true` | `texas.html:2397-2400` | 内存 | 否 | 页面 |

**S19 的 `entryUsed = true` 与结算成败无关**（`texas.html:2399-2400` 注释明确“结算成功与否都一样”）。所以结算失败时玩家既拿不到钱、也不能免费重开——这条是当前唯一的止损设计，但它对“进程被杀”无效。

### 1.4 断点窗口

| 窗口 | 现象 | 当前结局 | 严重度 |
| --- | --- | --- | --- |
| W1 S2 后 ≤250ms | 钱包未落盘 | 重启后余额未减，牌局消失（无损失） | 无 |
| W2 S2 已落盘 → S19 前 | 钱扣了、局没了 | **带入全损，无凭据可退** | **吞钱** |
| W3 S16 调用超时（桥 4000ms） | `finish(0)` + `entryUsed=true`，横幅写“未入账” | 同一壳内重发被 `GUARD` 幂等挡住，不会二次付款；但页面已置 `entryUsed`、无重试入口，玩家实际结局是全损 | 高 |
| W4 S17 成功 → S19 前 | 钱已入账、页面未收 ACK | 页面 `finish(0)` 但钱实际到账，提示“未入账” | 提示错，钱不丢 |
| W5 重复 ACK | 页面重发 settle | `GUARD` 挡（内存），重启后失效 | 低 |

W2 是本次要修的主症状。W3 是它的小号版本。

---

## 2. 首桌选择：建议廿一点，不是德州

| 维度 | 廿一点 | 德州 |
| --- | --- | --- |
| 资金语义 | 带入制，`settle:"chips"`，decay 0.95 | 带入制，decay 1.0，另加补码、豪赌倍数、自然封顶 |
| 状态机 | 一个对手（庄）+ 若干手牌决策（分牌/保险/投降） | 6 人 × 4 条街 × 边池 × 全下 × 补码 |
| 快照字段 | 约 20 个 | 约 60 个 |
| 已有事务基建 | 无 | 补码 journal（可抄） |
| 单次中断损失 | 一次带入 | 一次带入，可能叠加补码 |
| 恢复价值 | 中（会话短，被杀概率低） | 高（会话长，几乎每次杀进程都在局中） |

**判断**：恢复价值德州更高，但**先做的应该是廿一点**。要修的是“三态凭据 + 快照 + 恢复判定”这套骨架；骨架的 bug 全在时序和幂等上，跟牌桌复杂度无关。在廿一点上把骨架跑通并证明“不多给钱、不少给钱”，再往德州搬时只剩快照字段的搬运工作。反过来先做德州，等于同时调试新机制和全仓最复杂的资金路径，一旦出错无法区分是哪边的问题。

**给作者的两个选项**：
- A（推荐）：廿一点打通机制 → 下一批德州。代价是德州玩家要多等一批。
- B：直接德州。省一批时间，但首批出问题的定位成本更高。

不改这个判断也可以——只要是钱，就按最坏情况设计。

---

## 3. 快照设计

### 3.1 存储载体

新增单键 `csh_room_v1`，登记进 `core/csh_migrate.js` 的 `EXCLUDED`（本机未决事务，不随行囊导入，与 `csh_topup_pending_v1`、`csh_pending_results_v1` 同类）。

**唯一写者是宿主**。页面不直接写这个键。页面通过新桥命令 `shell-room-save` 上报纯数据，宿主校验后落盘。理由：钱的真值在宿主，两个进程各写一份必然出现撕裂态；现有 `tableOutbox` 也是这个所有权模型。

### 3.2 状态机

```
        ┌──────────── 无键（干净）
        │
   prepare：扣款前同步写 {phase:'preparing', id, amount, balanceBefore}
        │        写不进去 → 不扣款、不开桌（照抄 topup prepare）
        ▼
   charge 成功 → {phase:'active', ...}
        │        页面每接受一次动作 / 每条街结束时更新快照
        ▼
   settle 前 → {phase:'settling', ...}
        │
   settleRun 返回 ok → 同一次钱包写入落 {phase:'settled', credited}
        │
   ACK → 页面收 ACK → 清键
```

### 3.3 字段

```jsonc
{
  "v": 1,
  "phase": "preparing|active|settling|settled",
  "id": "room-<timestamp36>-<rand>",   // 会话键，兼凭据键
  "table": "blackjack|texas",
  "t": 1762646400000,                  // 创建时刻
  "saveSeq": 17,                        // 单调递增，防旧快照覆盖新档
  "balanceBefore": 200000,              // 扣款前余额（幂等判定的锚）
  "amount": 50000,                      // 本次入场实际扣款
  "credit": 0,                          // phase=settled 时的实际入账
  // ---- 以下仅 phase=active/settling ----
  "shot": {
    "buyIn": 50000,
    "seats": [{ "id": "csh_xxx", "stake": 75000 }],   // 世界席位，重建 AI 身份
    "player": { "chips": 43000, "hole": [12, 34], "street": 2, ... },
    "opponents": [{ "id": "csh_yyy", "chips": 61000, "hand": [7, 19], "folded": false, ... }],
    "deck": [3, 41, 18, ...],           // 剩余牌堆，禁重抽
    "community": [5, 22, 47],
    "pot": 12000, "currentBet": 4000, "minRaise": 2000,
    "toAct": 0, "dealer": 2, "handNo": 13, "sb": 200, "bb": 400, "level": 0
  }
}
```

**校验口径**（照 `csh_topup_journal.read`）：
- `id` 匹配 `/^[a-zA-Z0-9_-]{10,100}$/`
- `amount` / `balanceBefore` 都是安全整数且 `balanceBefore >= amount`
- `deck` 长度 ≤ 52、元素 ∈ [0,51] 且无重复
- `hole`/`hand` 长度 ≤ 2、元素 ∈ [0,51]
- `community` 长度 ≤ 5、元素 ∈ deck 之外且无重复
- `chips/pot/bet/contrib` 均为非负安全整数
- 任一不符 → 判损坏，**不退款、不清余额、只清键并如实提示**（照 topup 的“篡改不退款”）

### 3.4 写入时点

只在这几个点写，不做逐帧：

1. `prepare`：扣款前（宿主，同步）
2. `active`：首手发牌后（页面 → `shell-room-save`）
3. `active`：每手结束时
4. `active`：每条街结束时（德州）
5. `settling`：调 `settleSession` 前
6. `settled`：`settleRun` 成功后，与钱包同一次写入

普通界面刷新不写。金额和“已接受的动作”必须落在明确边界上。

### 3.5 恢复判定

启动时读 `csh_room_v1`：

| phase | 判定 | 动作 |
| --- | --- | --- |
| 无键 | — | 正常启动 |
| `preparing` | `pc === balanceBefore` → 扣款未落盘 | 清键，无需退款 |
| `preparing` | `pc === balanceBefore - amount` → 扣款已落盘 | 按 `active` 处理 |
| `active` / `settling` | `pc` 与二者都不符 | 保守：不清钱、不退款、提示「有一局未能恢复，到行囊查看」，保留键 |
| `active` | 钱包一致 | 提供「继续本局」（重建 `G`，用快照的 `deck`/`hole`，不重新发牌） |
| `settled` | — | 提示「上一局已结算 +N」，清键 |

**绝不允许**：按快照重算一遍 `settle()` 补发钱；用 `settle` 的纯函数结果当权威（rate/cap 会随官阶和桌规变化，重算可能多给）。

---

## 4. 必须先解决的前置件

`settled` 这个 phase 要能证明“钱确实结算过”。现在的钱包写入里没有任何按会话 ID 索引的结算凭据：

- `GUARD`（`csh_shell.js:1815`）是内存的，重启即失。
- `checkpointPending` 有金额和 reason，但没有 `sessionId`。
- `tableReceipts` 是世界回执，不是钱的回执。

**方案**：给 `settleRun` 增加可选 `settleId`，把 `wallet.roomSettled = {id, credited, t}` 放进**同一次** `persistWallet` 写入。这正是 `tableOutbox` 现在的做法（`csh_wallet.js:1151` 注释 “Wallet-owned world intents travel in the same durable balance write”），不新造模式。

不改这一步，恢复逻辑在 W4 窗口无法区分“已结算”和“未结算”，只能重放结算 → 重复付款。

---

## 5. 施工顺序（下一批）

| 步 | 内容 | 完成判据 |
| --- | --- | --- |
| 1 | `core/csh_room.js` 纯逻辑模块（prepare/active/settling/settled/read/clear/validate），零 DOM、零钱包依赖，storage 注入 | 反例探针覆盖五态转移、损坏、篡改、旧 `saveSeq` 覆盖 |
| 2 | `settleRun` 加 `settleId` → 同写 `wallet.roomSettled` | 既有结算反例全绿，新增“同一次写入”断言 |
| 3 | `csh_shell` 的 `doCharge` 前置 prepared、开桌后置 active、`shell-room-save` 校验并落盘 | 断点注入：S2/S3/S4 之间杀进程各跑一次 |
| 4 | `csh_migrate` 登记 `csh_room_v1` 到 EXCLUDED | 迁移反例断言不随行囊走 |
| 5 | 廿一点页面接快照与“继续本局” | 一局跨重启续局、牌与筹码一致、只扣一次钱、只结一次算 |
| 6 | 整仓门禁 + 生成前 `--check` + catalog 重生成 | exit=0 / 0 不符 |

德州留给下一批：快照字段从 §3.3 扩到含 `topUps`/`seats`/`gamble`，其余骨架复用。

---

## 6. 待作者决策

1. **首桌选廿一点还是德州**（§2）。我建议廿一点。
2. **不支持恢复的模式**（UNO 名次制无带入、无钱）是否需要给“安全退出”入口，还是维持现状不动。
3. 恢复入口放哪：开壳前弹窗，还是世界入口给一个「上次未完成」卡片。后者更显眼但不打断开局。

---

## 7. 本次未做

- 一个 `@media` 数值没改、一行产品代码没改。
- 未运行任何门禁：本文是只读盘点交付。
- 未验证安卓实机、未验证自然对局；所有结论来自当前源码阅读与既有文档。
