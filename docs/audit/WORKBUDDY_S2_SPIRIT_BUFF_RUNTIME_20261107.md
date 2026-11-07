# S2/S3 · 妖灵增益运行态落地与助战接线

日期：2026-11-07。按 `docs/WORKBUDDY_DESIGN_GAMEPLAY_NUMERIC_ART_20261107.md` §2.4 推进一个待办。
**未使用子代理**；版本仍 **4.0.16**，未推送、未合并 main、未发版。

## 为什么这轮能做

E1 刚纠正了一个错误结论：`ext/app/noname/game/index.js` 与 `ext/app/mode/identity.js` 都在，
`tools/probe_aux_spirit.mjs` 实跑 **266/0** 并已注册 E95R。改 `core/csh_aux_spirit.js`
不再是没有回归网的盲改。C1 的 S1 只读数据层（50 条 / 6 模板 / B 档解锁）已就位。

## 按方案 §2.4 的定义，S2 与 S3 做完的是什么

方案写得很明确，S2 是「接助战运行态」五条，S3 是五类反例。**本轮按这个定义全部落地**：

| 方案要求 | 实现 |
| --- | --- |
| 好感 B 解锁 | `begin()` 读 `csh_affection.get(妖灵id).level`，交 S1 的 `unlocked()` 判定；D/C、未知档位、未知 ID、数据层缺失一律不解锁 |
| 每局一次计数 | `consume()` 按模板计 `used`，上限取 S1 的 `perGame`（=1）；错模板 / 未知模板拒绝 |
| 迟到回调不改已消耗次数 | token 幂等：同一 token 返回首次结论、`repeated:true`、不增 `used`；旧 sessionId 与错 epoch 的回包直接拒绝 |
| 关闭 / 重开不重置 | 同 `sessionId` 重复 `begin()` 返回已有会话，状态面板关了再开不重新发次数 |
| 换档隔离 | `switchEpoch()` 清掉非当前存档代次的会话，`consume()` 另做 epoch 校验 |
| S3 反例 | 六类各一条「首触成功 / 再触拒绝 / 计数恒 1」、好感 C 不解锁、旧档无新增键、不发 CBY 不写钱包、助战结束与进程中断后计数不残留 |

## 改了什么

| 文件 | 改动 |
| --- | --- |
| `core/csh_spirit_buff_runtime.js`（新） | IIFE 挂 `window.CSHSpiritBuffRuntime`，纯内存会话表；`begin/consume/end/switchEpoch/reset/count/snapshot/activeTemplate`，导出冻结、快照冻结。**延迟读取** S1 数据层，两个文件加载顺序无关 |
| `core/csh_aux_spirit.js` | 新增可选 `buffRuntime()` 取用器；`start()` 召唤成功后用真实 `spirit._cshAuxSource` + `run.id` + `saveEpoch()` 建立会话；`restore()` 结束会话；`arm()` 换档清旧会话。**全部包 try，模块缺失时静默跳过，既有助战流程一行不变** |
| `tools/probe_spirit_buff_runtime_20261107.mjs`（新） | 46 条反例，vm 内加载三个真实模块；存储与钱包用可计数 stub 证明全程零调用；内置改前基线（去掉迟到防护与重开复用）**3 条红** |
| `tools/check.js` | 注册门禁 **E95S**（min passed 46） |
| `catalog.js` | 新增 core 文件 + 改接线文件，按发布字节重生成：**1036 → 1037** |

## 明确没做：S4（新增待办，不冒充完成）

**玩家侧现在还看不到任何增益效果。** 六类效果的**引擎技能触发点**没接：
`T1` 减伤 / `T6` 回复可复用现有 `damageBegin4` / `dying` 触发点，
但 `T2` 出牌命中摸牌、`T3` 手牌上限、`T4` 距离、`T5` 响应都要 hook 引擎方法，
风险高、需要单独的真实宿主反例。方案 §2.4 的 S2 只定到运行态，没有这一阶段，
本轮不假装它已生效。同理，状态面板的增益文案、图鉴展示也归 S4。

**S4 验收线**：六类各接一个真实触发点并用宿主探针证明生效一次、第二次不生效；
`probe_aux_spirit.mjs` 266/0 不退；完整门禁通过；仍不新增存档键、不发 CBY。

## 验证

| 项目 | 结果 |
| --- | --- |
| 新专项 `probe_spirit_buff_runtime_20261107.mjs` | **46/0 ×2**；改前基线 3 红；`storageCalls=0 / walletCalls=0` |
| 助战宿主回归 `probe_aux_spirit.mjs` | **266/0**（接线后无回归） |
| S1 数据层 `probe_spirit_buffs_20261107.mjs` | **17/0** |
| 完整 `node tools/check.js` | **exit=0，FAIL 0，RETRY 0**；E95S 46/0、E95R 266/0、E95P 17/0；2 项既有告警不阻断 |
| `release.js --check` 生成前反证 | `mismatchCount:1 / extraDiskFiles:1 / ok:false`，如实列出漏登记的 `core/csh_spirit_buff_runtime.js` |
| 生成后 `--check` / `--worktree` | 0 不符、0 漏登记；1037 文件、版本 4.0.16、build 一致 |

## 其余未做

德州真实补码 / 退隐联动、横屏断点统一、人物事件呈现、真机验收。
版本 4.0.16 未改；未推送、未合并 main、未发版、未创建 tag/Release。
