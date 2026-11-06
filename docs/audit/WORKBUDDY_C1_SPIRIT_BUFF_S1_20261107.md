# C1 · 妖灵增益数据层（设计方案 S1 落地）与发布清单盲区修复

日期：2026-11-07。按 `docs/WORKBUDDY_DESIGN_GAMEPLAY_NUMERIC_ART_20261107.md` 的实施顺序第 1 步执行。
**未使用子代理**；版本 4.0.16 未改；未推送、未合并 main、未发版。

## 做了什么

### 1. 运行时只读数据层 `core/csh_spirit_buffs.js`

把 `docs/spirit-buff-draft.json` 的 50 条草案转成运行时表，去掉设计期考据字段
（`sourceNote` / `basis` / `semanticSuggestion` 不进玩家包），只留 `id / name / template /
unlockLevel / magnitude / perGame / playerText / sourceSkill`。

- IIFE 挂 `window.CSHSpiritBuffs`，零 import、零加载时序依赖，与 `core/csh_texas_ai.js` 同款。
- 接口全只读：`get / list / ids / unlocked / perGame / templateOf`。
  `unlocked(level, id)` 只对 B/A/S 放行，未知档位 / 未知 ID / 非字符串 / 原型键一律 false。
- `list()` 返回副本；行与导出对象 `Object.freeze`，篡改不改表。
- **S1 到此为止**：不写 localStorage、不挂战斗钩子、不发 CBY、不碰钱包、不改胜负。
  每局计数与助战接线是 S2，不在这轮做。

新文件被 `package.js` 的 `files` 清单覆盖，发布清单 **1035 → 1036 文件**，已按纪律重生成 catalog。

### 2. 反例 `tools/probe_spirit_buffs_20261107.mjs` —— 17/0（连跑两次稳定）

真实模块在 vm 里加载，与两个真值双向对账：
- `core/csh_bossdata.js` 的 `MINIONS`：50 个 ID 一一对应、名字不虚构、`sourceSkill` 等于该妖灵唯一专属技能；
- `docs/spirit-buff-draft.json`：7 个字段逐条一致，防运行时表与草案漂移。

其余断言：6 模板合法且每类 8–9 均衡、50 条文案唯一、`magnitude=1 / perGame=1 / unlockLevel=B`
全条成立、D/C 不解锁而 B/A/S 解锁、未知输入不放行、`templateOf` 正确解析、
冻结生效、`list()` 副本不能改内部表、源码里无 `localStorage/saveConfig/sessionStorage/indexedDB`
与 `cshWallet/claim/settle/reward/CBY` 调用、公开 API 无写方法、版本与档位顺序稳定。

已接入门禁 **E95P**（min passed 17）。

### 3. 顺手补掉一个真盲区：`release.js --check` 看不见「磁盘多出来的文件」

现象：新增 `core/csh_spirit_buffs.js` 之后，重生成清单**之前**跑 `node tools/release.js --check`
仍报 `mismatchCount: 0 / ok: true`。原因：`verifyCatalog()` 只遍历 `cat.files`，
磁盘上存在却没登记进清单的文件完全不在它的视野里。

这比哈希不符更危险：玩家在线更新不会下载该文件，代码一旦引用就是缺文件。
E53 有 `expect53` 磁盘对账能兜住，但发布前最常用的那条快速只读检查不该瞎。

修法：`--check` 增加 `extraDiskFiles`（磁盘扫描 `files` 中不在 `cat.files` 的项），
计入 `issues`、写进 JSON、并在 stderr 列出前 8 个与修复命令。

**反证（不是看代码推出来的）**：

| 步骤 | `extraDiskFiles` | `ok` |
| --- | ---: | --- |
| A 清单已收录 | 0 | true |
| B 临时造 `core/csh_probe_extra_tmp.js` | **1** | **false**（exit=1，列出文件名） |
| C 删除临时文件 | 0 | true |

临时文件已删除，工作区无残留。生成模式与 `--worktree` 模式不受影响（前者自检时两者天然一致）。

## 验证

| 项目 | 结果 |
| --- | --- |
| 反例（新） | 17/0 ×2 |
| `release.js --check` / `--worktree` | 0 不符、0 漏登记 |
| catalog | 1036 文件、build 一致、版本 4.0.16 |
| 完整 `check.js` | 见本轮日志（E53 / E95P） |
| 一键套件 | 见本轮日志 |

## 明确未做

- **S2 战斗接线**：好感 B 解锁的运行时读取、每局一次计数、迟到回调、关闭/重开不重置、换档隔离。
- **S3 反例**：6 类各一条「触发一次后不再触发」、旧档无新增键、不发 CBY 等，需接了战斗路径才能测。
- 图鉴外装扮、随行标记、动态皮肤/语音（等素材）；德州补码、第四款 AI、横屏令牌（方案已定案，按实施顺序后做）。
- 未改版本号，未改任何既有运行源码，未推送。
