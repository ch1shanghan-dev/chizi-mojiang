# B6 · 退隐 26 条与世界其余指标、跨来源组合的「可靠首次采集」反例（backlog 推进）

日期：2026-11-05。编制：WorkBuddy（并行子代理 B）。工作目录固定副本，未提交/推送/发版/升版本。

## 触发

交接列「当前退隐 26 条与世界其余指标、跨来源组合的可靠首次采集；旧日期未知留未知」为**仍待**。
`RETIRED_REACHABILITY_20261105.md` 剩余项、`VERSION_BACKLOG_REVIEW_20261105.md` 第 2/19 行确认：
2000 条生涯定义中 872 条静态接线，未匹配 1128 条 = 组合 1072 + AI世界 53 + 彩蛋 3；
其中「当前退隐 14 + 扩容退隐 12 = 26 条」(worldRetired) 未接可靠首次来源。
本轮目标：把这条边界做成**机器可复跑**的真实代码反例，区分「没有回归证据 / 真缺陷 / 探针过时」，宁可小不铺摊子。

## 只读调查结论（先跑既有专项，不改代码）

跑 6 个最相关既有专项（真实 VM 模块夹具），全部绿：

| 专项 | 结果 |
| --- | --- |
| `probe_career_world_hands_20261104.mjs` | 60/0 |
| `probe_career_world_current_funds_20261105.mjs` | 50/0 |
| `probe_career_world_friends_20261105.mjs` | 50/0 |
| `probe_career_world_funds_20261105.mjs` | 28/0 |
| `probe_career_world_skill_20261105.mjs` | 23/0 |
| `probe_career_same_source_combos_20261104.mjs` | 18/0 |

`audit_career_coverage_20261105.mjs` 实读：total 2000 / routed 872 / unrouted 1128（AI世界 53、彩蛋 3、组合 1072），world 111。

三分类判定：

1. **现状已有回归证据**：hands / friends / funds / skill / 当前资金 34 档 / 6 族同源组合的「严格牌桌首次结算时间同写、拒写/重试、回落保留、重启静默恢复、旧档无凭据留未知日期」已被上述 229/0 覆盖。三条性质对已接路由的代码成立。
2. **真缺陷（本轮未修，属 backlog 本体而非回归）**：26 条退隐与其余 1102 条未接路由**确实没有**可靠首次来源。实测：在非首次钱包、150 人当前退隐的旧世界上，通用被动 `start()` 给 `retired_1` 写入挂钟 `Date.now()`（本轮实测 `1793918714644`），既非来源精确时间、也非「未知」。这正是「未接可靠首次来源」的直接后果；真正修复=为 1128 条补来源与精确时间，是整条 backlog 的大改，不是单点回归修复，故不硬造改动、不降断言强度。首次采用（钱包尚无 careerUnlocks）时 26 条仍为 `observedAt===0`（未知），这部分是对的。
3. **探针过时**：`tools/probe_career_source_20261104.mjs` 把 `root` 写死为 `D:/noname/resources/app/extension/池子魔将`（旧安装 493 条定义）、`out` 写死、不支持 `--out`，实跑 10/0 测的是 493/285/208 旧基线，与当前 2000 条无关；`tools/diagnose_world_softsave_20261104.mjs` 是心跳软保存缺陷诊断、`out` 写死，属另一条 backlog。`probe_retired_reachability_20261105.mjs` 需 `--baseline-dir` 且要 `before-career-expand.json` 等改前基线，本副本 D 盘 work 目录下未找到，**未冒充通过**。以上三者本轮只判定、不改动。

## 做了什么（一个闭环点：补反例并接入既有验证入口）

新增 `tools/probe_career_world_first_capture_20261105.mjs`（107 行，**唯一改动文件**）。

- 测真实代码：用 `tools/lib/skill_audit.mjs` 的 AST `walk/parse` **从 `core/csh_career_observer.js` 抽取真实函数体**（`bossRule/taskRule/rankRule/gambleComboRule/gambleRule/playerRatioRule/playerComboRule/playerRule/worldHandsRule/walletComboRule` + `TASK_KEYS`），在 vm 里配合真实 `core/csh_achv.js`（2000 条）运行；这些谓词只依赖 `def`/`TASK_KEYS`，无外层闭包，避开「按函数名抽取被 catch 兜成假失败」的坑。
- 用既有 `fixture('probe_career_gamble_unlocks.mjs')` 真实 VM 夹具加载 `csh_world / csh_achv / csh_wallet / csh_migrate / csh_shell / csh_career_observer`，驱动真实 `commitTableResult`、`noteGamble`、`prepareWorldHands`、`prepareGamble`、`start/adopted`。这是 6 个同族世界/组合专项共用的**既有验证入口**；新探针沿用同一契约：`node tools/<probe>.mjs --out <目录>`、写 `results.json`(`passed/failed/checks`)、按 `failed` 设退出码，可被 `check.js` 的 `runProbeJson` 直接消费。
- **未改任何运行源码**，故无需重生成 catalog。
- 24 项反例分四组：
  - G1 边界（真实谓词）：2000 条；`worldHandsRule` 恰 111 条；退隐恰 26 条且**全部未接任一来源**；同源豪赌组合 54 条；真实谓词划分 872/1128；**1072 条跨来源组合未接路由**、其余 140 条组合仅同源族。把交接文档「仍待」变成可复跑断言。
  - G2 首次采集可靠：真实严格牌桌跨阈值，`hands_1` 在钱包聚合与 `csh_world` 持久来源都等于 `t.t`；重复回执不叠日期/不重复通知；冷启动静默保留原日期；该检查点不新增任何组合/退隐/豪赌定义。
  - G3 跨来源组合不串档：把亲历/豪赌/退隐/资金同时拉到高位（组合条件全满足的反例），`prepareWorldHands` 记录集合只含 worldOwned、`prepareGamble` 记录集合只含 gambleDefs，二者都**不含跨来源组合/退隐/对方来源族**；`noteGamble` 检查点不新增 worldOwned 定义或不新增组合。
  - G4 旧日期留未知：200 万手数的遗留高统计存档把 33 条手数里程碑全部初始化为 `observedAt===0` 且零通知；**真正首次采用** 150 人当前退隐旧世界时 26 条退隐定义全部 `observedAt===0`（未知、无伪日期、零通知）——现有专项未覆盖退隐定义的未知日期行为。
  - `observations` 如实记录非首次钱包上 `retired_1` 得到挂钟 `Date.now()` 的残余，**记录不冒充通过**。

## 验证数字（可复跑）

```
export TEMP="D:/CodexWork/chizi-mojiang/workbuddy/temp" TMP="$TEMP"
node --check tools/probe_career_world_first_capture_20261105.mjs
node tools/probe_career_world_first_capture_20261105.mjs --out D:/CodexWork/chizi-mojiang/workbuddy/outputs/wb-public/parallel-b/first-capture
```

| 项目 | 结果 |
| --- | --- |
| 新增反例专项 | **24 / 0** |
| 6 个既有世界/组合专项复跑（无回归） | 60+50+50+28+23+18 = **229 / 0** |
| `audit_career_coverage_20261105.mjs` | 2000 / 872 / 1128（AI世界 53、彩蛋 3、组合 1072）|
| 真实源码谓词分区 | worldOwned 111、retired 26（全未接）、gambleCombos 54、crossCombos 1072 |

过程如实记录：首版探针有一条断言因我把「跨来源组合」误定义成含 36 条 wallet 同源组合而 22/1（共 23 项）；**修的是探针自身集合定义**（改为 `cat==='组合' && !routed`，即交接文档的 1072 条），并把该条换成「1072 未接 / 140 同源」两条强度更高的计数断言，未删断言、未降低强度、未改产品代码，复跑 24/0。

## 改动文件清单

- 新增：`tools/probe_career_world_first_capture_20261105.mjs`
- 新增：`docs/audit/WORKBUDDY_B6_WORLD_FIRST_CAPTURE_20261105.md`（本报告）
- 测试产物：`D:/CodexWork/chizi-mojiang/workbuddy/outputs/wb-public/parallel-b/{baseline,first-capture,regression,coverage.json,scratch}`，全程 D 盘，`TEMP/TMP` 指向 D 盘 temp。

**未改运行源码 → catalog 无需重生成**；版本相关 `extension.js / info.json / package.js / README.md` 的 `4.0.16`、`catalog.js` 一字未动；未碰全部禁区文件；未跑 `node tools/check.js`、未跑 `release.js`、未 `git add/commit/push`、未建 tag/Release、未发远端请求。

## 明确未做与残余限制

- **结论**：对已接可靠首次来源的 111 条世界亲历、54 条同源组合，以及首次采用时的 26 条退隐旧事实，「首次采集可靠 / 跨来源组合不串档 / 旧日期留未知」**现状已有证据，无需改产品代码**；未硬造产品改动。
- **仍待（交接本体，未修）**：26 条退隐 + 其余 1102 条未接路由（1072 跨来源组合、其余 27 条 AI世界指标、3 彩蛋）仍无可靠首次来源。非首次钱包上通用被动路径给当前事实定义挂钟 `Date.now()`（实测 `1793918714644`），既非来源精确时间也非未知；补精确首次时间是整条 backlog 的大改，本轮刻意不做。
- **「接入既有验证入口」的边界**：新探针已按 6 个同族专项共用的真实 VM 夹具 + `--out`/`results.json`/退出码契约落地，可被门禁 `runProbeJson('probe_career_world_first_capture_20261105.mjs',['--out',<目录>],{timeout:20000})` 直接注册；但 `tools/check.js` 属禁区，本轮**未编辑**，完整门禁与注册由主线程统一完成。
- 纯隔离 VM 真实模块 + 受控存档/故障注入，**不**代表自然长期游玩、真机 WebView、实体 Android/Electron 或完整宿主链路；本副本缺 `ext/app/index.html`，真实宿主类探针起不来，属环境限制，未冒充通过。
- 3 个过时/缺基线探针（`probe_career_source_20261104`、`diagnose_world_softsave_20261104`、`probe_retired_reachability_20261105`）只判定不改动；`probe_retired_reachability` 未跑通是缺 `--baseline-dir` 改前基线，非产品结论。
- 静态路由覆盖（872/2000）不等于端到端自然采集；G1 计数断言绑定当前真实谓词，若将来新增来源路由会主动报数变化，需同步复核。
