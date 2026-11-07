# D4 · 妖灵 S4 前置：修正增益模板语义矛盾（持续型 vs 一次性）

日期：2026-11-07。版本仍 **4.0.16**，未推送、未合并 main、未发版。未使用子代理。

## 为什么这轮没直接接引擎

按上轮计划推进 S4（六类效果的引擎触发点）。侦察宿主引擎后发现**方案 §2.1 自相矛盾**，
照它接线必定出错，所以先定案、再落地语义，不把错的东西接进战斗。

事实链：

1. `noname/library/skill.js` 提供 `globalFrom(from,to,distance)` 与 `zf_maxHandcard` 的
   `mod` 系统，T4 距离、T3 手牌上限要靠它实现。这类 **mod 函数每帧 / 每次查询都会被引擎调用**。
2. 方案 §2.1 写「所有效果 `magnitude=1`、`perGame=1`，每局最多触发一次」，
   S2 运行态 `consume()` 正是按「消耗一次机会」实现的。
3. 若 T3/T4 的 mod 每次查询都调 `consume`，**第二次查询就会被判 `exhausted`**，
   手牌上限 / 距离只在第一帧生效，随后失效。这不是实现 bug，是语义定义缺失。
4. 扩展 `core/`、`main/` 里没有任何 `mod: {` 用法，也就是说这条路径在本扩展是第一次走，
   更需要先把运行态契约定死并做成可验证的纯逻辑。

## 定案（写回方案 §2.1）

| 类型 | 模板 | 运行态入口 | 语义 |
| --- | --- | --- | --- |
| 一次性触发 | `T1` 减伤 / `T2` 摸牌 / `T5` 响应 / `T6` 回复 | `consume()` | 首次事件触发一次，之后不再触发 |
| 持续型常驻 | `T3` 手牌上限 / `T4` 距离 | `activate()` + `isActive()` | 本局**激活一次**后常驻到助战结束；重复查询不消耗次数 |

`perGame=1` 对持续型指「激活一次」，不是「每次查询消耗一次」。两类共用同一份计数，
**天然互斥**：先 `consume` 再 `activate`（或反过来）都会被拒，一只妖灵不会既触发一次性又常驻。

## 改了什么

| 文件 | 改动 |
| --- | --- |
| `core/csh_spirit_buff_runtime.js` | 版本 1 → **2**；新增 `PERSISTENT`（冻结，仅 T3/T4）、`isPersistent()`、`activate()`、`isActive()`；会话加 `activated` 表；`snapshot()` 增只读 `activated` 字段 |
| `tools/probe_spirit_buff_runtime_20261107.mjs` | 46 → **64/0 ×2**；改前基线 3 → **4 红** |
| `tools/check.js` | E95S 门槛 46 → **64** |
| `docs/WORKBUDDY_DESIGN_GAMEPLAY_NUMERIC_ART_20261107.md` | §2.1 补两类语义表；头部状态表标注 S4 前置已定案 |
| `catalog.js` | 按发布字节重生成（改了 core 运行源码） |

`activate()` 的行为：校验解锁 / 模板 / epoch 后，首次调用走一次 `consume` 并置
`activated[template]`，返回 `first:true`；之后引擎每帧重复查询直接返回
`ok:true, active:true, first:false, repeated:true`，**绝不再动 `used`**。
`isActive()` 供 mod 函数只读轮询，会话结束 / 换档 / 未激活一律 false。
错 epoch、未解锁、错模板、对一次性模板误用 `activate` 全部拒绝且不计次。

## 验证

| 项目 | 结果 |
| --- | --- |
| 运行态反例 | **64/0 ×2**；改前基线（去掉迟到防护、重开复用、持续型短路）**4 红** |
| 新增覆盖 | 持续型恰为 T3/T4；两类模板首次激活 / 每帧重复查询不消耗 / isActive 常驻 / 与 consume 互斥 / 错 epoch 隔离 / 结束后失效 / 换档失效 / 快照 activated 冻结 |
| S1 数据层 | **17/0** 无回归 |
| 助战宿主 `probe_aux_spirit.mjs` | **266/0** 无回归（运行态版本升级未破坏接线） |
| 完整 `node tools/check.js` | **exit=0，FAIL 0**（E95S 64/0、E95R 266/0、E95P 17/0）；出现 **1 次 `[RETRY]`**（`probe_achievement_expansion_20261101.mjs` 环境抖动，重试通过）。B4 已定性为探针自身时序敏感、非产品缺陷，按纪律不阻断、不计告警 |
| 发布字节 | `--check` 与 `--rev HEAD` 0 不符 |

## S4 接线方案（本轮研究结论，供下一轮直接执行）

- **注册方式**：用 `game.addGlobalSkill(...)`（与 `csh_aux_start` 同款），
  **不要**加进 `lib.character[alias].skills` —— `probe_aux_spirit.mjs` 断言助战妖灵恰好 4 个技能，
  加进去会立刻红，而且会让 50 只妖灵各自多 6 个技能。
- **filter 统一守卫**：`active(p)` + `RT.activeTemplate(run.id) === 目标模板` +
  `RT.consume/activate(run.id, template, token, run.epoch)`，迟到回包按 `run.id` 与 epoch 隔离。
- 各模板触发点：
  | 模板 | 触发点 / mod | 效果 |
  | --- | --- | --- |
  | T1 | `trigger:{global:'damageBegin4'}` | `trigger.num -= 1`（与现有 `csh_aux_guard` 同点，独立计数） |
  | T2 | `trigger:{global:'useCardAfter'}` | 命中后 `owner.draw(1)` |
  | T3 | `mod.maxHandcard` | `activate()` 后 `+1` |
  | T4 | `mod.globalFrom` | `activate()` 后 `distance - 1` |
  | T5 | `chooseToRespond` 事件族 | **仍需查引擎事件结构**，风险最高 |
  | T6 | `trigger:{global:'dying'}` | `owner.recover(1)`（与 `csh_aux_rescue` 同点，独立计数） |
- **验收线**：新探针直调 6 个技能的 `filter/content/mod`（与 `probe_aux_spirit.mjs` 同款简化夹具），
  六类各证「首触生效、二触不生效」；`probe_aux_spirit.mjs` 266/0 不退；完整门禁通过；
  仍不新增存档键、不发 CBY、不写钱包。

## 明确未做

- **六类效果的引擎触发点一个都没接**，玩家侧仍看不到增益。本轮只把语义契约定死并落地，
  不冒充 S4 完成。
- T5 的响应事件结构尚未查清；状态面板 / 图鉴的增益文案与展示也未做。
- 真机 / 实体设备未验，U5 归作者。
- 德州补码线（D2+D3）已收口，本轮未动。

版本 4.0.16 未改；未推送、未合并 main、未发版、未创建 tag/Release。
