# B11 · `probe_task_definitions.mjs` 救回为本副本独立回归证据

日期：2026-11-06。编制：WorkBuddy（并行子代理 B，第三轮）。工作目录固定副本
`D:/CodexWork/chizi-mojiang/workbuddy/ext/app/extension/池子魔将`。

未提交/推送/发版/升版本；`4.0.16` 一字未动；未跑 `node tools/check.js` 完整门禁；
未改 `tools/check.js`（注册行仅建议，主线程统一接入）。

触发：`WORKBUDDY_B9_ORPHAN_PROBES_20261106.md` §五.2 记录的明确未修缺口。
复用 `WORKBUDDY_B8_STALE_PROBES_20261106.md` 的静态基线双模式策略（先读该报告与
`probe_career_source_20261104.mjs` / `probe_retired_reachability_20261105.mjs` 两探针源码）。

---

## 一、先实跑确认「坏在哪」（别猜）

全程 `export TEMP="D:/CodexWork/chizi-mojiang/workbuddy/temp" TMP="$TEMP"`，D 盘。

| 运行 | 命令（节选） | 实测 |
| --- | --- | --- |
| A | `node tools/probe_task_definitions.mjs` | `Error: External --out and preserved --baseline required`（第 4 行），EXIT=1 |
| B | `... --out <dir>`（仅 --out） | 同上报错，EXIT=1 |
| C | `... --baseline <file>`（仅 --baseline） | 同上报错，EXIT=1 |
| D | `... --out <file> --baseline core/csh_achv.js`（把当前引擎当假基线） | stdout **46 passed / 1 failed**，EXIT=1；唯一失败项 `exactly the original 493 definitions and IDs remain` |

复现命令：

```bash
export TEMP="D:/CodexWork/chizi-mojiang/workbuddy/temp" TMP="$TEMP"
cd "D:/CodexWork/chizi-mojiang/workbuddy/ext/app/extension/池子魔将"
node tools/probe_task_definitions.mjs                                  # A: 抛错
node tools/probe_task_definitions.mjs --out "$B/scratch/out-only"       # B: 抛错
node tools/probe_task_definitions.mjs --baseline "$B/scratch/nope.js"   # C: 抛错
node tools/probe_task_definitions.mjs --out "$B/scratch/self-as-baseline.json" --baseline core/csh_achv.js
# D: 46/1
```

结论（与 B9 §五.2 一致，且补充了「给全参数」的实测）：
- 第 4 行把 `--out` 与 `--baseline` 同时设为必需，缺任一即抛错、探针根本起不来；
- 本副本树内确无任何改前 `before-csh_achv.js` / `.before` 基线（B9 已 `find` 确认）；
- 第 8 行 `A.defs.length===493` 是扩容前过时计数：当前运行时为 **2000** 条，该断言恒假（D 实测）；
- D 的 46/1 里其余 46 条能绿，只因 `old` 被指向当前引擎自身（比较断言实为恒真、假绿），并非真证据。

### 1.1 读源码搞清 `--baseline` 到底断言什么

`engine(source, claimed)` 在隔离 VM 里加载一份 `csh_achv.js`，返回 `window.CSH_ACHV`。
`old = engine(<--baseline 文件>)` 即「改前引擎」，`A = engine(core/csh_achv.js)` 即「当前引擎」。
涉及 `old` 的断言共 9 条，语义是 **旧键留存 / 定义不丢 / 奖励与文案保留**：

| 行 | 断言 | 语义 |
| --- | --- | --- |
| 8 | `A.defs.length===493 && old.defs.length===493 && A.defs.every((d,i)=>d.key===old.defs[i].key)` | 旧键按序逐一留存、定义总数不丢（写死 493） |
| 9 | `A.defs.every(d=>d.reward===old.byId(d.key).reward)` | 全量奖励保留 |
| 11 | `A.defs.filter(d=>!changed.has(d.key)).every(d=>metadata(d)===metadata(old.byId(d.key)))` | 9 个累计任务之外的 484 条标签/描述不变 |
| 18 | `task_1..3`：`metadata(d)===metadata(old.byId(d.key))` + 行为 | 日常任务文案/条件不变 |
| 19 | `egg_task_full` / `egg_full_house`：同上 | 彩蛋文案/条件不变 |
| 21 | `paidRow.reward===old.byId('task_15').reward` | 已领取 task_15 的奖励不变 |

`changed` = 9 个累计任务键 `task_4,5,6,7,8,9,10,12,15`。
另有一个致命方向问题：行 9/11/18/19 是**遍历「当前」defs 去 `old.byId` 查**。
扩容后当前 2000 条、改前 493 条，1507 个新键 `old.byId(newKey)` 为 `undefined`，
`.reward` / `metadata(...)` 会直接抛 TypeError —— 即原探针即便补齐 493 基线，接上 2000 运行时
也会崩。故新探针在严格模式把比较方向改为 **遍历「改前」defs 到「当前」按 key 查**（天然兼容扩容）。

### 1.2 运行时与「改前引擎」调查（实测，非推测）

- 本副本 `core/csh_achv.js`：`defs.length=2000`、`stats().total=2000`、
  `selfTest()={ok:true,count:2000}`、`MIN_DEFS=420`；def 字段 `{key,cat,ico,label,desc,prog,reward}`。
- 9 个累计键全部存在，`task_4` 文案已为「日课 · 累计 4 项 / 跨日累计完成 4 项每日任务」。
- 全量元数据体积：对象式 367297 B、数组式 283297 B —— 直接塞进仓库做「可读基线」偏冗余，
  故改用「有序键集合 + sha256 结构指纹」的紧凑表示。
- 仓库外可用作**严格模式测试输入**（探针本身不依赖它们）：
  - `D:/noname/resources/app/extension/池子魔将/core/csh_achv.js`：**493 条扩容前引擎**，
    实测其 493 键全为当前 2000 的子集（0 缺失）、0 奖励差异、0 非任务文案差异；
    但它**已含累计修复**（`task_4` 也是累计文案）。
  - `outputs/gpt-task-expansion-20261104/before-csh_achv.js` 等 2000 条引擎：
    实测有 305 条 `desc`「达到 N 天 → 达到 N 项」的真实文案漂移。
  - 本副本**没有**「累计任务修复前」的单日引擎 —— 这是 B9 判定「造 493 改前快照超范围」的
    真实原因。因此严格模式不声称证明累计修复本身的改前/改后 diff；
    累计语义由 9×4=36 条行为断言直接对当前引擎验证（在单日改前引擎上会失败）。

---

## 二、怎么修（复用 B8 双模式，断言强度只增不减）

### 2.1 新增本副本自洽静态基线（写进仓库，不依赖仓库外路径）

`tools/fixtures/task-definitions-baseline/`（合计 ~55 KB，可读可复核）：

| 文件 | 大小 | 内容 |
| --- | --- | --- |
| `keys.json` | 49292 B | 当前 2000 条运行时的**有序键集合**（首 `rank_1` … 末 `cx_ratio_gmwinrate_50`），可读、可逐键复核 |
| `manifest.json` | 823 B | `capturedDefCount=2000`、`dynamicCount=2000`、`minDefs=420`、`legacyPreExpansionDefCount=493`、`metaFingerprint{algo:'sha256',recipe,value}`、`notes` |
| `canonical.mjs` | 1108 B | 共享 `metadata(d)` / `canonical(defs)` / `fingerprint(defs)`（sha256 over `[key,cat,ico,label,desc,reward]`），探针与复核脚本共用，防口径漂移 |
| `verify-baseline.mjs` | 3743 B | **默认只读复核**：重算当前运行时键集合+指纹，与仓库内基线比对并打印 `MATCH`/`DRIFT`；`--write` 才重建（且注释明确「仅合法变更且人工复核后可用，不得用于掩盖非预期变更骗绿」） |

指纹值：`341b842c66ef9640ba356fa8ff3579f7221258394cb56ab63fa980955d374b14`。
生成一次后 `node tools/fixtures/task-definitions-baseline/verify-baseline.mjs` 实测报 `MATCH`。
另实测「改一条 def 的 desc → 指纹由 `341b842c…` 变为 `e88dc361…`（changed=true）」，
证明指纹确实派生自真实运行时数据，而非常量。
冻结只含稳定元数据字段（不含 `prog`/`test` 函数），行为语义由 `A.test/evalAll` 断言直接验证。

### 2.2 两种模式，明确区分、不互相冒充

- **默认（无 `--baseline`）= `self-consistency`**：读仓库内静态基线，
  `strictComparison=false`、`mode='self-consistency'`、
  `baselineSource='frozen-in-repo-snapshot (tools/fixtures/task-definitions-baseline)'`，
  `limitations` 明确声明「未做改前/改后严格 diff，不冒充证明严格基线等价」。
  跑 **48** 条断言（`kindCounts={shared:45, self-consistency:3}`）。
- **`--baseline <dir>` = `strict`**：dir 内必须含 `before-csh_achv.js`（改前引擎快照）。
  加载为 `old`，逐键改前/改后比对。`strictComparison=true`、
  `baselineSource='external-pre-change-engine (--baseline)'`。跑 **51** 条断言
  （`kindCounts={shared:45, strict:6}`）。
  **缺 `before-csh_achv.js` 直接抛错**（`--baseline missing before-csh_achv.js ... refusing to silently
  downgrade to self-consistency`），绝不静默降级成自洽模式来骗绿；引擎加载不出 `defs/byId` 也抛错。
- `--fixture <dir>`（可选）：覆盖默认自洽基线目录，供负向验证 / 合法换基线复核用；默认仍是仓库内目录。
- `--out <dir>`（必需，B8 同契约）：`mkdir -p` 后写 `<dir>/results.json`（含全量 checks / coverage /
  limitations / mode / strictComparison / kindCounts）；**stdout 纯 JSON**
  `{passed,failed,mode,strictComparison,assertionCount,kindCounts,coverage,checks:failures}`，
  按 `failed` 设退出码。实测 `JSON.parse(stdout)` 成功（模拟 `runProbeJson`），
  `check.js:73` 的 `JSON.parse(execFileSync(...))` 可直接读。

### 2.3 写死 493 → 动态取数 + 互证；原语义保留

- `dynamicCount = A.stats().total`（真实运行时，当前 2000），替换 `A.defs.length===493`。
- **新增 1 条互证断言**（`shared`）：
  `dynamicCount===A.defs.length && A.stats().total===dynamicCount && A.selfTest().ok &&
  A.selfTest().count===dynamicCount && A.evalAll({}).length===dynamicCount &&
  A.defs.length>=A.MIN_DEFS(420) && A.defs.length>=493`。
  四条独立路径互证 + 下界。`493` 仅作**扩容前历史下界**（兜住「缩水」），不是当前计数目标，
  与 B9「493 作下界保留」一致。
- 原行 8 的「恰好 493 条且顺序逐一相等」在 2000 条运行时不可能成立（D 实测恒假），
  属**过时事实**，按任务要求「说明原因再替换成等价或更强的断言」：
  - 严格模式 → `old.defs.length===old.stats().total && A.defs.length>=old.defs.length &&
    A.defs.length===dynamicCount && old.defs.every(d=>A.byId(d.key)&&A.byId(d.key).key===d.key)`
    （旧键全部留存的子集 + 当前数 ≥ 改前数 + 等于动态数），语义「旧键不丢、定义不丢」保留且更强。
  - 自洽模式 → `A.defs.length===frozenKeys.length && A.defs.every((d,i)=>d.key===frozenKeys[i])`
    （有序键集合全等）。
- 原行 9/11 的奖励/文案比对在自洽模式若把 `old` 指向当前引擎会变成**恒真（无关事实/假绿）**，
  故替换为更强的全量结构指纹断言 `fingerprint(A.defs)===manifest.metaFingerprint.value`
  （覆盖全部 2000 条而非原 484 条），并新增「定义结构完整」断言
  （每 def 的 key/cat/ico/label/desc 非空字符串、reward 有限数、prog 函数、byId 自洽、键唯一）。
- 原行 18/19/21 的**行为半部**原样保留为 `shared`；**文案/奖励比对半部**在严格模式原样保留为
  T4/T5/T6，在自洽模式由上述全量指纹（更强）覆盖。**原 47 条语义全部保留，无一条删除或降门槛**；
  净新增「动态数互证」「结构完整」两类断言。

### 2.4 断言清单（两模式，逐条可核对）

- `shared`（45，两模式完全一致）：9×4=36 条累计语义（跨日累计文案 / 3 项当日不解锁 /
  不读膨胀单日数 / 真实累计阈值） + 3 条 `task_1..3` 日常条件 + 2 条彩蛋条件 +
  1 条 `task_15` 已领取资格 + 1 条旧永久资格与历史日期 + 1 条反伪造自检 +
  1 条动态数互证。
- `self-consistency`（3，仅自洽）：`exactly the dynamic N definitions and all frozen IDs remain`、
  `all career rewards and definition metadata preserved (frozen structure fingerprint)`、
  `every definition is structurally complete with unique keys`。
- `strict`（6，仅严格）：`all original definitions and IDs remain (no key lost, no shrink, dynamic current count)`、
  `all original career rewards are preserved`、
  `all non-changed original definition labels and descriptions are unchanged`、
  `daily task_1..3 keep their original metadata`、`egg keys keep their original metadata`、
  `old claimed task_15 keeps its original reward (pre-change engine)`。
- 每条 check 带 `kind`；结果带 `assertionCount` 与 `kindCounts` 供机器核查（B8 风格）。

---

## 三、改前 / 改后数字对照

| 项 | 改前 | 改后 |
| --- | --- | --- |
| 无参数启动 | 抛错 `External --out and preserved --baseline required`，EXIT=1 | `--out <dir>` 即可跑（自洽），无需任何仓库外路径 |
| 改前基线 | 仓库外 `before-csh_achv.js`，本副本树内无 | 仓库内 `tools/fixtures/task-definitions-baseline/`（4 文件 ~55 KB） |
| 定义数断言 | 写死 `===493`（2000 运行时恒假） | 动态 `A.stats().total=2000` + 四路互证 + `>=493` 下界 |
| `--out` | 文件参数、与 `--baseline` 绑定必需 | 目录，写 `results.json`，stdout 纯 JSON |
| `strictComparison` | 无该概念 | 自洽 `false` / 严格 `true`，明确标注 |
| 断言数 | 47（含 1 条恒假的 493） | 自洽 **48**（45+3）/ 严格 **51**（45+6），只增不减 |
| `defs.length` | 493（旧安装） | 2000（本副本运行时） |
| `minDefs` | — | 420 |

---

## 四、验证数字（可复跑，全部 D 盘 TEMP/TMP）

| 场景 | 次数 | 结果 |
| --- | --- | --- |
| `node --check tools/probe_task_definitions.mjs` | 1 | 通过 |
| 自洽默认（`--out` only） | **3** | **48 / 0 ×3**，3 次断言名集合完全一致 |
| 严格（`--baseline` 指向 493 扩容前引擎） | **3** | **51 / 0 ×3**，3 次断言名集合完全一致 |
| 严格（`--baseline` 指向 2000 条 `gpt-task-expansion` 引擎） | 1 | **50 / 1**（如实检出 305 条真实文案漂移，不假绿） |
| 负向 A：`--fixture` 删 1 个键（`cx_combo_peak_kills_4`） | 1 | **47 / 1**，`[self] ...all frozen IDs remain` 报红，EXIT=1 |
| 负向 B：`--fixture` 篡改冻结指纹为全 0 | 1 | **47 / 1**，`[self] ...frozen structure fingerprint` 报红，EXIT=1 |
| 负向 C：`--baseline` 空目录缺 `before-csh_achv.js` | 1 | 抛错退出，**不降级**成自洽 |
| 负向 D：严格模式改前引擎追加「幽灵键」`ghost_deleted_key` | 1 | **48 / 3**，T1/T2/T3 三条整集比对报红，EXIT=1 |
| 指纹数据依赖性（改 1 条 desc） | 1 | 指纹 `341b842c… → e88dc361…`，changed=true |
| stdout `JSON.parse`（模拟 `runProbeJson`） | 1 | OK，`failed=0 passed=48 mode=self-consistency` |
| `verify-baseline.mjs` 只读复核 | 1 | `MATCH` |

复现命令（`B=D:/CodexWork/chizi-mojiang/workbuddy/outputs/wb-public/parallel-b5`）：

```bash
export TEMP="D:/CodexWork/chizi-mojiang/workbuddy/temp" TMP="$TEMP"
cd "D:/CodexWork/chizi-mojiang/workbuddy/ext/app/extension/池子魔将"
node --check tools/probe_task_definitions.mjs
# 自洽 ×3（无需任何外部目录）
node tools/probe_task_definitions.mjs --out "$B/self-run1"
node tools/probe_task_definitions.mjs --out "$B/self-run2"
node tools/probe_task_definitions.mjs --out "$B/self-run3"
# 严格 ×3：先把真实扩容前 493 引擎复制成基线目录
cp "D:/noname/resources/app/extension/池子魔将/core/csh_achv.js" "$B/strict-baseline-493/before-csh_achv.js"
node tools/probe_task_definitions.mjs --out "$B/strict-493-run1" --baseline "$B/strict-baseline-493"
# ... run2 / run3 同上
# 负向夹具由脚本生成：python3 "$B/scratch/make_negatives.py"
node tools/probe_task_definitions.mjs --out "$B/neg-del-run"   --fixture "$B/neg-del"       # 47/1
node tools/probe_task_definitions.mjs --out "$B/neg-fp-run"    --fixture "$B/neg-fp"        # 47/1
node tools/probe_task_definitions.mjs --out "$B/neg-missing-run" --baseline "$B/empty-baseline"  # 抛错
node tools/probe_task_definitions.mjs --out "$B/neg-ghost-run"   --baseline "$B/strict-baseline-ghost"  # 48/3
node tools/fixtures/task-definitions-baseline/verify-baseline.mjs   # MATCH
```

测试产物目录：`D:/CodexWork/chizi-mojiang/workbuddy/outputs/wb-public/parallel-b5/`
（`self-run1..3`、`strict-493-run1..3`、`strict-2000-run1`、`strict-baseline-493/2000/ghost/`、
`neg-del/ neg-fp/ empty-baseline/`、`neg-*-run/`、`parse-run`、`scratch/make_negatives.py` 等）。

---

## 五、建议的门禁注册行（本轮**不改** `tools/check.js`，主线程统一接入）

`runProbeJson`（`check.js:66`）执行 `JSON.parse(execFileSync(...))`，只认 `failed` / `passed`；
两探针 stdout 已是纯 JSON。默认走自洽模式，**min passed = 48**：

```js
const rB11 = runProbeJson('probe_task_definitions.mjs', ['--out', path.join(tmpB11,'task-definitions')], {timeout:20000});
if(rB11.failed!==0||rB11.passed<48) eB11.push('任务定义/累计语义探针（自洽 48 条）未通过');
```

可选：若主线程希望额外跑严格改前比对，需提供 `baselineDirB11`（目录内含 `before-csh_achv.js`）。
**不提供时请勿传 `--baseline`**，否则探针按设计报错而非降级；min passed = 51：

```js
const rB11Strict = runProbeJson('probe_task_definitions.mjs',
  ['--out', path.join(tmpB11,'task-definitions-strict'), '--baseline', baselineDirB11], {timeout:20000});
if(rB11Strict.failed!==0||rB11Strict.passed<51) eB11.push('任务定义严格改前比对（51 条）未通过');
```

> 失败时探针 `process.exitCode=1`，`execFileSync` 抛错被 `runProbeJson` 捕获后按既有语义上抛
> （与 B8 两探针一致）；通过时退出码 0、stdout 纯 JSON 被正常解析。

---

## 六、残余限制 / 明确未做

- **默认自洽模式不做改前/改后严格 diff**，已在 `mode` / `strictComparison` / `limitations` 明确标注，
  绝不冒充严格证据；需严格比对须显式 `--baseline <dir>`（已实测 493 引擎 51/0 ×3）。
- **冻结指纹绑定当前 2000 条运行时**：任何合法定义变更（键/文案/奖励）都会使 C1/C2 主动报红、需人工
  复核后用 `verify-baseline.mjs --write` 重建（默认只读，防滥用）。同 B8/B6「计数绑定当前谓词」边界。
- **本副本无「累计任务修复前」的单日引擎**：严格模式用扩容前 493 引擎证明「旧键/奖励/非任务文案
  在扩容中未丢」，不声称证明累计修复本身的改前 diff；累计语义由 36 条行为断言直接验证当前引擎。
  提供带真实漂移的 2000 引擎时严格模式如实 50/1，不假绿。
- 严格模式基线由调用方提供；探针只校验 `before-csh_achv.js` 存在且可加载出 `defs/byId`，
  **不校验其「确为改前」的历史真伪**（该责任在基线提供方）。
- 隔离 VM 真实模块 + 受控存档/故障注入，**不代表**自然长期游玩、真机 WebView、实体宿主链路；
  本副本缺宿主类条件，属环境限制，未冒充通过。
- B9 §五.2 所述「造 493 改前引擎快照」本轮**未**制造产品级改前引擎；只造了仓库内自洽静态基线，
  并复用了仓库外真实 493 引擎作严格模式测试输入（探针本身不依赖仓库外路径）。
- 本轮只改探针 + 新增静态基线/辅助脚本 + 报告，**未改任何产品代码**，未降低任何断言强度。

---

## 七、改动文件清单 / 禁区合规声明

- 改：`tools/probe_task_definitions.mjs`
- 新增：`tools/fixtures/task-definitions-baseline/keys.json`、`manifest.json`、`canonical.mjs`、
  `verify-baseline.mjs`
- 新增：`docs/audit/WORKBUDDY_B11_TASK_DEFINITIONS_20261106.md`（本报告）
- 测试产物：`D:/CodexWork/chizi-mojiang/workbuddy/outputs/wb-public/parallel-b5/...`（见 §四）

`git status --short` 仅：`M tools/probe_task_definitions.mjs`、
`?? tools/fixtures/task-definitions-baseline/`（及本报告）。
版本相关 `extension.js / info.json / package.js / README.md` 的 `4.0.16` 经 grep 复核均完好
（分别 2/2/1/2 处）；`catalog.js`、`core/`、`tools/check.js`、`tools/check_update_suite.mjs`、
`tools/release.js`、`AGENTS.md`、`docs/audit/CURRENT_WORK.md`、`README.md` 及前几轮已交付的
探针/报告（`probe_career_source_20261104.mjs`、`probe_retired_reachability_20261105.mjs`、
`probe_4_0_12_economy.mjs`、`probe_update_bundle_cleanup_20261105.mjs` 等）**一字未动**。
主线程并行曾在 08:02–08:06 更新 `tools/check.js` / `docs/audit/CURRENT_WORK.md` /
`tools/probe_4_0_12_economy.mjs` 的 mtime，经 `git diff --quiet HEAD` 复核相对 HEAD **无 diff**、
且早于本子代理 08:27 起始时间，非本代理改动（同 B8 §五说明）。

未 `git add/commit/push`、未切分支/reset/clean、未改 git 配置；未跑 `node tools/check.js` 完整门禁；
未运行生成模式的 `tools/release.js`；未发远端请求。
