# B8 · 两个过时回归探针修复（本副本独立跑通，断言强度只增不减）

日期：2026-11-06。编制：WorkBuddy（并行子代理 B，第二轮）。工作目录固定副本。
未提交/推送/发版/升版本；`4.0.16` 一字未动；未跑 `node tools/check.js` 完整门禁。

## 触发

B6 报告 `WORKBUDDY_B6_WORLD_FIRST_CAPTURE_20261105.md` 第 32、79 行判定两个既有回归探针「已经过时、等于没有证据」，本轮把它们修成可在本副本独立跑通、可归档的回归证据。

## 一、只读调查：先跑出「坏」的证据（别猜）

### 1.1 `probe_career_source_20261104.mjs`：10/0 是假绿，不是通过

实跑（不带参数）：

```
node tools/probe_career_source_20261104.mjs
→ stdout 纯 JSON，passed:10 failed:0，EXIT=0
```

它没有报错，但四个输入全在本副本之外，测的是**旧安装**：

| 依赖 | 写死值 | 实测 |
| --- | --- | --- |
| `root` | `D:/noname/resources/app/extension/池子魔将` | 其 `core/csh_achv.js` 为 **493 条**定义 |
| `out` | `D:/CodexWork/chizi-mojiang/work/career-source-20261104` | 读 `before-csh_shell.js` / `before-csh_winrate.js` |
| 第 38 行 | `D:/CodexWork/chizi-mojiang/work/achievement-secrets-20261103/results.json` | 63/0 历史浏览器产物 |
| `--out` | 不支持 | 结果写死到 work 目录 `source-evidence.json`，`runProbeJson` 无法归档 |

本副本 `core/csh_achv.js` 实测 **2000 条**。**过时硬证据**：把旧探针写死的四个计数断言套到当前 2000 条运行时，全部为 false（命令见 §四）：

| 原断言 | 旧值 | 当前运行时 | 结果 |
| --- | --- | --- | --- |
| `defs.length===493` | 493 | **2000** | false |
| `covered===285` | 285 | **475** | false |
| `remaining===208` | 208 | **1525** | false |
| 胜负组 `===70` | 70 | **110** | false |

即旧探针一旦指向真实运行时就会 4 红；它能「绿」只因指向旧安装。这正是 B6 所说「实跑 10/0 测的是 493/285/208 旧基线，与当前 2000 条无关」。

### 1.2 `probe_retired_reachability_20261105.mjs`：起不来

- 不带参数：`Error: --out required`（第 3 行）。
- 只带 `--out`、不带 `--baseline-dir`：`Error: --baseline-dir with pre-change source/data required`（第 6 行）。
- 本副本树内 `find` 确认**没有** `before-career-expand.json` / `before-csh_achv.js` / `regenerated.json`，也没有自洽默认值或降级路径，探针无法启动。
- 补充事实：这三个基线文件其实存在于 `workbuddy/outputs/gpt-retired-reachability-20261105/` 与 `workbuddy/outputs/WorkBuddy交接_20261105/evidence/retirement-baseline/`（B6 当时只搜了 `work/` 故记「未找到」），但都在本副本之外、探针也没有默认路径。用前者原样跑，旧探针是 **28/0** —— 说明严格比对逻辑本身没坏，坏的是「没有外部目录就起不来」。未冒充通过。

## 二、怎么修

### 2.1 `probe_career_source_20261104.mjs`

- 消除全部外部路径：`here` 由 `import.meta.url` 推导为本副本根，`core/csh_achv.js` 取当前 **2000 条**运行时。
- `--out <dir>` 必需，写 `results.json`；新增可选 `--baseline-dir` 覆盖静态基线目录；stdout 纯 JSON `{passed,failed,...}` + 按 `failed` 设退出码（与 `probe_career_world_first_capture_20261105.mjs` 同契约，`runProbeJson` 直接可读）。
- 改前基线内置到本副本 `tools/fixtures/career-source-baseline/`（2 个小文件，共 9835 字节）：
  - `winrate-aggregation-before.js`（897 B）：从改前 `before-csh_shell.js` 抽出的整桌聚合片段。**当前 `core/csh_shell.js` 已无该锚点**（实测 `begin=-1`，bug 代码已重构），故这段反例必须冻结为静态快照，无法从当前源码自洽构造。
  - `pool-page-results.json`（8938 B）：冻结的 63/0 浏览器专项产物。
- 采集链路改用本副本当前 `core/csh_winrate.js`；实跑验证与原 4 条 capture 断言完全等价（`saves=8`、双将 `games=1`、无 `kill`、`aggregate(captured).wrGames===3`）。
- 写死 `493` → **动态定义数** `dynamicCount = E.stats().total`（引擎公开统计 API，当前 2000），断言 `defs.length===dynamicCount`。
- 分类计数 `285/208/70` → 当前运行时真值 `475/1525/110`（冻结当前谓词，同 B6 计数断言风格：数变了主动报数、需同步复核）；并新增「`covered+remaining===defs.length`」划分完备检查、「胜负定义全部在被动覆盖之外」语义加强。
- **新增断言**：动态数确实等于运行时 `defs.length` —— `E.stats()` / `E.selfTest()` / `E.evalAll({})` / `E.defs` 四条独立路径互证，并把 `defs.length>=E.MIN_DEFS(420)` 纳入。
- **新增断言**：冻结片段完整性（锚点 + `s.wrGames += e2.games` / `s.wrKill += e2.kill` 整桌累加特征），防基线被改动造成假绿。
- 断言 **10 → 12** 条，只增不减；原 10 条语义全部保留。

### 2.2 `probe_retired_reachability_20261105.mjs`：双模式、明确区分、不互相冒充

- **默认（无 `--baseline-dir`）= `self-consistency`**：用当前源码自身构造可复现基线（当前 `core/csh_achv.js` / `tools/achv_scale/data/career-expand.json` / 真实 VM 夹具），**无需任何外部目录即可跑通**；跑 28 条等价强度的自洽断言。结果标注 `mode=self-consistency`、`baselineSource=synthesized-from-current-source`、`strictComparison=false`，并在 `limitations` 明确声明「未做改前/改后严格比对，不冒充证明严格基线等价」。
- **有 `--baseline-dir <目录>` 且含 3 个基线文件 = `strict`**：原有 **28 条严格比对断言原样运行**（断言名逐条核对一致，见 §四）。
- **传了 `--baseline-dir` 但缺任一文件**：直接抛错，绝不静默降级成自洽模式来骗绿（已实测报错退出）。
- 两模式断言数均 **28**，不删、不减弱；每条 `check` 带 `kind`（`strict` / `self-consistency` / `shared`），结果带 `assertionCount` 与 `kindCounts` 供机器核查。
- 自洽模式的 21 条替换断言都是对**当前真实源码/引擎/数据**的非恒真断言（预验证均成立）：
  - 引擎 2000 条 + `byId` 索引自洽 + `selfTest/stats/evalAll` 四路一致；
  - 17 条「改前 152」目标现已全部为 150、当前数据无任何 152 残留；
  - 17 条逐 key：当前引擎 150 达标 / 149 不达标 + 目标 `===150`（实测 17/17）；
  - 1507 行结构完整、key 唯一、无 152；
  - 1507 个 shipped ID 都能在引擎按 key 找到、cat 对齐、`prog` 可求值（实测 1507/1507）。
  - 另 7 条共享断言（描述文案 / 目标上限 / 150 人世界 / 钱包资格与收据 / 导出导入）两模式原样。
- 同样加 `--out` + `results.json` + stdout 纯 JSON 契约。

> 注：`reward` 未用于 shipped-ID 对齐断言，因引擎 `push` 对 reward 做了 `Math.max(500,Math.ceil(reward*5/50)*50)` 变换（实测 `A.byId().reward !== r.reward` 对全部 1507 行成立），故改用 key/cat/prog 三者对齐，避免把产品公式复制进探针。

## 三、验证数字（可复跑）

| 探针 | 模式 | 次数 | 结果 |
| --- | --- | --- | --- |
| `probe_career_source_20261104.mjs` | 默认（独立） | **3** | **12 / 0** |
| `probe_retired_reachability_20261105.mjs` | 自洽（默认，独立） | **2** | **28 / 0** |
| `probe_retired_reachability_20261105.mjs` | 严格（两处不同基线目录各 1） | **2** | **28 / 0** |
| `probe_career_source_20261104.mjs` | 负向：篡改静态基线 | 1 | **8 / 4**（预期报红） |
| `probe_retired_reachability_20261105.mjs` | 负向：`--baseline-dir` 缺文件 | 1 | 抛错退出（不降级） |

三次 career_source 断言集合完全一致；自洽两次、严格两次各自断言集合完全一致。`node --check` 两文件均通过。

复现命令（全程 D 盘，`TEMP/TMP` 指向 D 盘 temp）：

```bash
export TEMP="D:/CodexWork/chizi-mojiang/workbuddy/temp" TMP="$TEMP"
cd "D:/CodexWork/chizi-mojiang/workbuddy/ext/app/extension/池子魔将"
B="D:/CodexWork/chizi-mojiang/workbuddy/outputs/wb-public/parallel-b2"
node --check tools/probe_career_source_20261104.mjs
node --check tools/probe_retired_reachability_20261105.mjs

# 探针 1：默认，无需任何外部目录
node tools/probe_career_source_20261104.mjs --out "$B/career-source-run1"          # 12/0

# 探针 2：默认自洽，无需任何外部目录
node tools/probe_retired_reachability_20261105.mjs --out "$B/retired-self-run1"    # 28/0

# 探针 2：严格（可选，指向已有改前基线目录）
node tools/probe_retired_reachability_20261105.mjs --out "$B/retired-strict-run1" \
  --baseline-dir "D:/CodexWork/chizi-mojiang/workbuddy/outputs/gpt-retired-reachability-20261105"   # 28/0
node tools/probe_retired_reachability_20261105.mjs --out "$B/retired-strict-run2" \
  --baseline-dir "D:/CodexWork/chizi-mojiang/workbuddy/outputs/WorkBuddy交接_20261105/evidence/retirement-baseline"  # 28/0
```

## 四、命令与证据

```bash
# 过时硬证据：旧探针 4 个写死计数断言套到当前 2000 条运行时 → 全 false
# 实测：493→2000、285→475、208→1525、70→110（详见 §1.1 表）

# 严格模式 28 条断言名逐条核对（与原探针一致）
python3 -c "import json;d=json.load(open('.../retired-strict-run1/results.json',encoding='utf-8'));print(len(d['checks']),d['kindCounts'],d['strictComparison'])"
# → 28  {'strict': 21, 'shared': 7}  True
# 11 条固定断言名逐字一致 + 17 条 '150 reachable and 149 insufficient, legacy impossible at 150: <key>'

# 负向：篡改静态基线后应报红（证明断言非恒真、非骗绿）
# 把片段 's.wrGames += e2.games' 改成 's.wrGames += 0'、pool passed 改成 62：
node tools/probe_career_source_20261104.mjs --out "$B/scratch/negative-run" \
  --baseline-dir "$B/scratch/negative-baseline"     # 8/4
# 失败项恰为：片段完整性、整桌对局重复、3 局聚合、63/0 产物 共 4 条

# 负向：传了 --baseline-dir 但缺文件 → 直接抛错，不静默降级
node tools/probe_retired_reachability_20261105.mjs --out "$B/retired-missing" \
  --baseline-dir "$B/scratch"    # Error: --baseline-dir missing before-career-expand.json ...
```

## 五、改动文件清单

- 改：`tools/probe_career_source_20261104.mjs`
- 改：`tools/probe_retired_reachability_20261105.mjs`
- 新增：`tools/fixtures/career-source-baseline/winrate-aggregation-before.js`（897 B）
- 新增：`tools/fixtures/career-source-baseline/pool-page-results.json`（8938 B）
- 新增：`docs/audit/WORKBUDDY_B8_STALE_PROBES_20261106.md`（本报告）
- 测试产物：`D:/CodexWork/chizi-mojiang/workbuddy/outputs/wb-public/parallel-b2/{career-source-run1..3, retired-self-run1..2, retired-strict-run1..2, scratch/...}`

`git status --short` 中另有 `catalog.js`、`core/csh_update.js`、`tools/check.js`、`tools/check_update_suite.mjs` 的改动，来自**主线程并行**，本子代理未触碰。版本相关 `extension.js / info.json / package.js / README.md` 的 `4.0.16` 经 grep 复核均完好；`catalog.js` 与其余禁区文件一字未动；未改运行源码 → catalog 无需重生成。

未跑 `node tools/check.js` 完整门禁、未运行生成模式的 `tools/release.js`、未 `git add/commit/push`、未切分支/reset/clean、未改 git 配置、未发远端请求。

## 六、建议的门禁注册行（本轮**不改** `tools/check.js`，主线程统一接入）

`runProbeJson` 读 stdout 纯 JSON（只看 `failed` / `passed`），两探针 stdout 已符合契约。建议 min passed：**12**（career_source）、**28**（retired）。

```js
const rB8a = runProbeJson('probe_career_source_20261104.mjs', ['--out', path.join(tmpB8,'career-source')], {timeout:20000});
if(rB8a.failed!==0||rB8a.passed<12) eB8.push('生涯来源探针（2000 条运行时）未通过');

const rB8b = runProbeJson('probe_retired_reachability_20261105.mjs', ['--out', path.join(tmpB8,'retired-reachability')], {timeout:20000});
if(rB8b.failed!==0||rB8b.passed<28) eB8.push('退隐可达性探针（自洽 28 条）未通过');
```

可选：若主线程希望默认也跑「改前严格比对」，再加一行（需提供 `baselineDirB8`；不提供时请勿传 `--baseline-dir`，否则探针会按设计报错而非降级）：

```js
const rB8bStrict = runProbeJson('probe_retired_reachability_20261105.mjs', ['--out', path.join(tmpB8,'retired-strict'), '--baseline-dir', baselineDirB8], {timeout:20000});
if(rB8bStrict.failed!==0||rB8bStrict.passed<28) eB8.push('退隐可达性探针（严格改前比对）未通过');
```

## 七、明确未做与残余限制

- **默认自洽模式不做改前/改后严格比对**，已在 `mode` / `strictComparison` / `limitations` 中明确标注，绝不冒充严格证据；若需严格比对须显式传 `--baseline-dir`（已实测两处基线目录 28/0）。
- 改前片段与 63/0 产物是**冻结静态快照**；片段完整性已有断言兜住，但基线内容一旦合法更新仍需同步复核该断言。
- 计数 `475/1525/110` 与严格模式的 `2000/17/156/1507` 均绑定当前真实谓词，将来定义数/分类变化会主动报数，需同步复核（同 B6 报告第 80 行的边界）。
- 纯隔离 VM 真实模块 + 受控存档/故障注入，**不代表**自然长期游玩、真机 WebView、实体 Android/Electron 或完整宿主链路；本副本缺 `ext/app/index.html`，真实宿主类探针起不来，属环境限制，未冒充通过（本轮两探针均为 VM 隔离型，不依赖宿主）。
- B6 报告所述 26 条退隐 + 其余 1102 条未接路由仍无可靠首次来源，属产品 backlog 本体，本轮未修（只修回归证据）。
- 本轮只修探针与新增静态基线/报告，未改任何产品代码，未降低任何断言强度。
