# S4 · 妖灵六类特色增益接线与状态呈现

日期：2026-11-07。按 D4 清单把 S4 做完。版本仍 **4.0.16**，未推送、未合并 main、未发版。
未使用子代理。

## 落地内容

新增 `core/csh_spirit_buff_skills.js`：只产出技能对象，`host` 由 `csh_aux_spirit.js` 注入，
反例可直接注入假 host + 真实运行态逐类验证，不依赖完整引擎事件循环。

`csh_aux_spirit.js` 用 `SBM.create({...})` 创建六类技能，逐个写入 `lib.skill` 并
**`game.addGlobalSkill` 注册**——不进 `character.skills`（`probe_aux_spirit.mjs` 断言助战妖灵
恰好 4 个技能，加进去会立刻红，也会让 50 只妖灵各多 6 技）。模块缺失时整段跳过，
既有助战流程一行不变。

状态面板 `describe()` 增加 `buffText()`：从运行态读当前妖灵模板，展示
「本局特色增益：…（本局仅生效一次，不叠加、不跨局）」。

| 模板 | 触发点 / mod | 效果 | 语义 |
| --- | --- | --- | --- |
| T1 护主·减伤 | `trigger:{global:'damageBegin4'}` | `trigger.num -= 1` | 一次性 `consume` |
| T2 助战·摸牌 | `trigger:{global:'useCardAfter'}` | 命中后 `owner.draw(1)` | 一次性 `consume` |
| T3 共谋·手牌 | `mod.maxHandcard(player,num)` | `num + 1` | 持续型 `activate` + `isActive` |
| T4 同行·距离 | `mod.globalFrom(from,to,distance)` | `max(1, distance-1)` | 持续型 `activate` + `isActive` |
| T5 接应·响应 | `trigger:{player:'chooseToRespondBegin'}` | 标记 `result={bool:true,cards:[]}` 并 `finish()` | 一次性 `consume` |
| T6 回护·回复 | `trigger:{global:'dying'}` | `owner.recover(1)` | 一次性 `consume` |

**filter 绝不调用 `consume`**：引擎会多次调用 filter，提前消耗次数会让效果第一次就失效。
filter 只做只读 `available(template)` 判定（解锁 + 模板匹配 + `used < perGame`），
真正占次数一律放在 content 的 `take()` 里。持续型 T3/T4 走 `activate()`，
首次激活后每帧重复查询常驻、不再消耗。所有技能共用 `sessionOK(p)` 守卫：
`run.spirit` 处于 active、`p === game.me`、epoch 未变，迟到回包自然被隔离。

## 改动文件

| 文件 | 改动 |
| --- | --- |
| `core/csh_spirit_buff_skills.js`（新） | 六类技能工厂 `create(host)`，`ONCE`/`PERSIST` 冻结表 |
| `core/csh_aux_spirit.js` | 注入 host、注册 6 个全局技能、`describe()` 增益文案 |
| `tools/probe_spirit_buffs_wired_20261107.mjs`（新） | **41/0 ×2**，改前基线 1 红 |
| `tools/check.js` | 注册门禁 **E95W**（min 41） |
| `catalog.js` | 1040 → **1041**，0 不符 |

## 验证

| 项目 | 结果 |
| --- | --- |
| 六类接线反例 | **41/0 ×2**；改前基线（去掉 `take` 的 consume）**1 红** |
| 逐类覆盖 | 六类各证「首触生效、二触拒绝」；效果数值 1（减伤/摸牌/回复/上限/距离）；非本人、未命中、未濒死、num≤0 不触发；T3/T4 每帧重复查询常驻且只消耗 1 次；T5 不伪造具体牌 |
| 边界 | 好感 C 不解锁、模板不符不触发、换档迟到回包失效、助战结束后全失效、全程零钱包/零存储/零 CBY |
| 静态接线 | `addGlobalSkill` 注册 6 类、不进 `character.skills`、`describe` 呈现增益、filter 里无 consume |
| 助战宿主 `probe_aux_spirit.mjs` | **266/0 无退化**（注册方式没破坏 4 技能断言） |
| S1 数据层 / S2 运行态 | **17/0**、**64/0** 无退化 |
| 完整 `node tools/check.js` | **exit=0，FAIL 0，RETRY 0**；E95W 41/0、E95S 64/0、E95R 266/0、E95P 17/0、E30 通过 |
| `release.js --check` | 1041 文件、0 不符、0 漏登记 |

## 明确未验证的边界（不冒充实战验收）

1. **这是隔离探针 + 静态接线断言**，与项目既有 `probe_aux_spirit.mjs` 同款做法：
   直接调技能 `filter/content/mod`，**没有跑真实引擎事件循环**。
   `addGlobalSkill` 注册后引擎是否对全局技能遍历 `mod.maxHandcard` / `mod.globalFrom`、
   六个 trigger 的事件名与参数形状是否与实际引擎完全一致，**都还没在真实对局里验证**。
2. **T5 风险最高**：`chooseToRespondBegin` 触发点确实存在（引擎 `skill.js:1527` 的
   事件白名单），但 `trigger.result={bool:true,cards:[]}` + `finish()` 是否被引擎接受为
   「已响应 1 次」，不同响应场景（杀→闪、无懈可击）可能要求具体牌。
   当前实现**只标记接应、不伪造牌、不改牌堆不碰胜负**，是保守写法；
   真机上若发现该响应未被采纳，需按具体事件结构单独修 T5。
3. 六类效果与既有三个通用技（`csh_aux_guard` / `csh_aux_aid` / `csh_aux_rescue`）
   使用相同触发点但**独立计数**，不是覆盖；是否叠加符合作者预期需实战确认。
4. **真机 / 实体设备 / 自然对局未验**，U5 归作者。

## 其余

德州补码线（D2+D3）已收口，本轮未动。方案 §2.1 两类语义、头部状态表、
`CURRENT_WORK.md`、`AGENTS.md` 已同步。
版本 4.0.16 未改；未推送、未合并 main、未发版、未创建 tag/Release。
