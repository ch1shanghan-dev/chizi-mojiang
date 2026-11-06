# B12 · 两个孤儿探针纯 JSON 输出契约改造（2026-11-06）

> 承接 `WORKBUDDY_B9_ORPHAN_PROBES_20261106.md` §五.5 / §六.5：
> `probe_career_achievements.mjs`（142/0）与 `probe_first_batch.mjs`（56/0）全绿、很重要，
> 但 stdout 是**文本汇总**，门禁 `runProbeJson()` 内部 `JSON.parse(stdout)` 会抛错，至今无法注册。
> 本轮只补齐**输出契约**：stdout 改为纯 JSON，原文本汇总不丢，判定逻辑与断言一条不动。
> **本子代理不修改 `tools/check.js`**，注册行仅以建议形式给出，由主线程在 E95 注册区统一接入。

---

## 一、运行环境（复现前提）

```bash
export TEMP="D:/CodexWork/chizi-mojiang/workbuddy/temp" TMP="$TEMP"
cd "D:/CodexWork/chizi-mojiang/workbuddy/ext/app/extension/池子魔将"
node --version     # v22.22.2
```

- 默认浏览器 `C:/Program Files/Google/Chrome/Application/chrome.exe` **存在**（`withChromium` 默认路径）。
- `root`（`tools/lib/skill_audit.mjs:5`）= 副本根；`games/career.html`、`core/csh_uikit.js`、`core/csh_winrate.js` 均存在。
- 本副本确实缺 `ext/app/index.html`，但**这两个探针都不依赖它**（career 读 `games/career.html`，
  first_batch 读 `core/*.js`），故能正常起浏览器 / VM，**不是环境失败、未冒充通过**。
- 产物目录：`D:/CodexWork/chizi-mojiang/workbuddy/outputs/wb-public/parallel-b6/`（下称 `OUT`）。

---

## 二、改前实跑：原始 stdout 原文 + exit code（别猜，实测）

| 探针 | exit code | 耗时 | stdout 形态 | `JSON.parse(stdout)` |
| --- | --- | --- | --- | --- |
| `probe_career_achievements.mjs` | **0** | 54s | 单行文本 `Career achievement browser: 142 PASS / 0 FAIL` | 抛错（非 JSON） |
| `probe_first_batch.mjs` | **0** | 秒级 | 57 行文本（56×`[PASS]` + 1 行汇总） | 抛错（非 JSON） |

两者 stderr 均为空。

### 2.1 `probe_career_achievements.mjs` 改前 stdout 原文（全文，1 行）

```
Career achievement browser: 142 PASS / 0 FAIL
```

### 2.2 `probe_first_batch.mjs` 改前 stdout 原文（全文，57 行）

```
[PASS] DOM: replacement cancels old callback once
[PASS] DOM: replacement leaves one key handler
[PASS] DOM: stale handle cannot close new dialog
[PASS] DOM: Enter confirms only current dialog
[PASS] DOM: close after completion is idempotent
[PASS] DOM: Escape completes once and detaches
[PASS] DOM: background completes once and detaches
[PASS] DOM: cancel completes once and detaches
[PASS] DOM: ok completes once and detaches
[PASS] DOM: close completes once and detaches
[PASS] DOM: cancel callback may open a newer dialog
[PASS] DOM: reentrant cancellation cleans both older dialogs
[PASS] DOM: reentrant dialog owns next confirmation
[PASS] DOM: 20 replacement cycles leave no handlers or dialog
[PASS] DOM: throwing callback still cleans instance
[PASS] DOM: closed dialogs leave no focus timers
[PASS] identity: personal win
[PASS] identity: general stats unchanged true
[PASS] identity: camp scope unchanged true
[PASS] identity: personal loss
[PASS] identity: general stats unchanged false
[PASS] identity: camp scope unchanged false
[PASS] versus: personal win
[PASS] versus: general stats unchanged true
[PASS] versus: camp scope unchanged true
[PASS] versus: personal loss
[PASS] versus: general stats unchanged false
[PASS] versus: camp scope unchanged false
[PASS] guozhan: personal win
[PASS] guozhan: general stats unchanged true
[PASS] guozhan: camp scope unchanged true
[PASS] guozhan: personal loss
[PASS] guozhan: general stats unchanged false
[PASS] guozhan: camp scope unchanged false
[PASS] doudizhu: personal win
[PASS] doudizhu: general stats unchanged true
[PASS] doudizhu: camp scope unchanged true
[PASS] doudizhu: personal loss
[PASS] doudizhu: general stats unchanged false
[PASS] doudizhu: camp scope unchanged false
[PASS] two: mode alias still records personal hero
[PASS] 2v2: mode alias still records personal hero
[PASS] identity_normal: mode alias still records personal hero
[PASS] dual hero records each identity once
[PASS] shichangshi records body rather than avatars
[PASS] controlled viewpoint resolves true local player
[PASS] duplicate player arrays do not duplicate personal record
[PASS] already-over callback cannot duplicate records
[PASS] unknown opponent result is not guessed
[PASS] over: no records written
[PASS] video: no records written
[PASS] connectMode: no records written
[PASS] online: no records written
[PASS] draw is not recorded
[PASS] unsupported mode is not recorded
[PASS] existing personal history is incremented without backfill
First batch: PASS 56 / FAIL 0 (VM only)
```

原文文件：`OUT/before_career.stdout.txt`、`OUT/before_first_batch.stdout.txt`。

---

## 三、源码结论：改前的结果写出方式（读源码所得，非推断）

| 项 | `probe_career_achievements.mjs` | `probe_first_batch.mjs` |
| --- | --- | --- |
| `--out` | **已有**，`option('--out', root/docs/audit/ui/career-achievements)`（`:13`），并 `mkdirSync` | **没有**，`option` 仅支持 `--root` / `--browser`（`:14-17`） |
| 结果文件 | **已有** `out/results.json`（`all` 明细，`:120`）+ 4 张 `*.png`（`:115`） | **没有**任何结果文件 |
| stdout 文本 | FAIL 逐条 `console.log`（`:121`）+ 汇总 `console.log`（`:122`） | 逐条 `[PASS]/[FAIL]`（`:211`）+ 汇总（`:213`）；带 `--browser` 时另有 `Browser artifact:`（`:209`） |
| exit 判定 | `process.exitCode=failed.length?1:0;`（`:123`） | `process.exitCode = fail ? 1 : 0;`（`:214`）；`catch` 为 `stderr` + `exitCode=2`（`:215-218`） |

结论：career 是「**已有 `--out` + results.json，缺纯 JSON stdout**」；first_batch 是「**无 `--out`、无结果文件、纯文本 stdout**」。
两者 exit 判定逻辑本来就正确，本轮**不改**。

---

## 四、改后契约（`JSON.parse(stdout)` 必成功）

两探针 stdout 均为**单行纯 JSON**，顶层至少 `{passed:number, failed:number}`，另带 `scope / total / summary / failures / text` 等。
`runProbeJson` 只看 `failed` / `passed`；`result.failed!==0 || result.passed<min` 即判失败（B9 §六语义）。

| 项 | `probe_career_achievements.mjs` | `probe_first_batch.mjs` |
| --- | --- | --- |
| `--out` 契约 | **保持原样**：默认目录不变，仍写 `results.json`（明细）+ 4 张 png；**追加** `summary.txt` | **新增可选 `--out <dir>`**：写 `results.json`（56 条明细）+ `summary.txt`，payload 带 `out` 字段 |
| 不带参数 | 默认 `--out` 仍生效，stdout 纯 JSON | **不写任何文件**，仍能跑并输出纯 JSON（已实测） |
| stdout | 单行 JSON：`{scope,passed,failed,total,summary,failures,text,out}` | 单行 JSON：`{scope,passed,failed,total,summary,failures,checks,text}`；带 `--browser` 时加 `browserArtifact` |
| 原文本汇总 | `Career achievement browser: N PASS / M FAIL` 进 `summary` + `text`，并写 `out/summary.txt`；FAIL 明细进 `failures` | `First batch: PASS N / FAIL M (…)` 进 `summary` + `text`；56 条 `[PASS]/[FAIL]` 逐条进 `checks` + `text`；带 `--out` 时写 `summary.txt` |
| `catch`（HARNESS_ERROR） | 顶层 `await` 无 try/catch，保持原样 | 保留 `console.error`（stderr）与 `exitCode=2`，**额外**向 stdout 输出纯 JSON `{passed:0,failed:0,harnessError:true,…}`，保证异常路径也不污染 `JSON.parse` |
| exit 契约 | `failed>0 → 1`，`failed=0 → 0`（原行不动） | 同左（原行不动）；HARNESS_ERROR 仍为 `2` |

### 4.1 改后 `probe_career_achievements.mjs` stdout 样例（真实单行，344 字节）

```json
{"scope":"career achievements browser (headless Chromium)","passed":142,"failed":0,"total":142,"summary":"Career achievement browser: 142 PASS / 0 FAIL","failures":[],"text":"Career achievement browser: 142 PASS / 0 FAIL","out":"D:\\CodexWork\\chizi-mojiang\\workbuddy\\ext\\app\\extension\\池子魔将\\docs\\audit\\ui\\career-achievements"}
```

### 4.2 改后 `probe_first_batch.mjs` stdout 样例（真实单行 5397 字节，字段结构示意，省略数组中部）

```json
{
  "scope": "first batch (confirm box lifecycle + personal winrate)",
  "passed": 56,
  "failed": 0,
  "total": 56,
  "summary": "First batch: PASS 56 / FAIL 0 (VM only)",
  "failures": [],
  "checks": [
    "[PASS] DOM: replacement cancels old callback once",
    "[PASS] DOM: replacement leaves one key handler",
    "…（其余 54 条 [PASS]，共 56 项）…"
  ],
  "text": "[PASS] DOM: replacement cancels old callback once\n[PASS] DOM: replacement leaves one key handler\n…（共 57 行，末行为汇总）…\nFirst batch: PASS 56 / FAIL 0 (VM only)"
}
```

真实**未被截断**的 stdout 单行原文与 pretty 版：
`OUT/after_first_batch.run1.stdout.txt`、`OUT/after_first_batch.pretty.json`；career 对应
`OUT/after_career.run1.stdout.txt`、`OUT/after_career.pretty.json`。
三者均已由 `json.loads` / `JSON.parse` 验证可解析，且 `stdout` 只有 1 行。

---

## 五、改动范围：证明「只动输出段，断言一条没删」

`git diff -- tools/probe_career_achievements.mjs tools/probe_first_batch.mjs` →
**2 文件、28 插入 / 6 删除**（存档 `OUT/b12_probe_diff.txt`，71 行）。

- 被删除的 6 行**全部是 `console.log` 输出语句**（FAIL 逐条、汇总、`Browser artifact`、逐条 PASS/FAIL），
  **没有任何 `check(...)` / `test(...)` 断言行**。
- 断言行 career `:44-109`、first_batch `:45-187` 在 diff 中**零出现**（完全未改）。
- `process.exitCode=failed.length?1:0;` / `process.exitCode = fail ? 1 : 0;` / `exitCode=2` 原样保留。
- `--source` / `--browser` / `--root` 契约不变；`results.json` 明细写出不变；png 截图不变。
- `node --check` 两文件均 `rc=0`。

版本号红线复核（`4.0.16` 逐字符完好，未动）：
`extension.js` 2 处、`info.json` 2 处、`package.js` 1 处、`README.md` 2 处。

> `git status --short` 中另有 `tools/check.js`、`tools/probe_task_definitions.mjs`、
> `WORKBUDDY_B11_*`、`tools/check_probe_registry.mjs`、`tools/fixtures/task-definitions-baseline/`、
> 以及 `docs/audit/ui/career-achievements/{4 png, results.json}` 等变更：
> 前一组是**主线程 / 其它子代理并行产物，本子代理未触碰**；后一组是 career 探针**既有 `--out`
> 实跑**写入（截图与明细），非人工编辑。本子代理仅改两个探针自身文件 + 新增本报告与 `OUT` 证据。

---

## 六、验证数字（脚本 `OUT/verify_contract.py`，实跑捕获 stdout/stderr/rc 后 `json.loads` 校验）

| 用例 | `probe_career_achievements.mjs` | `probe_first_batch.mjs` |
| --- | --- | --- |
| run1 | `142/0`，rc=0，单行 JSON，`summary` 原文在 `text` | `56/0`，rc=0，单行 JSON，`checks`=56，`text`=57 行 |
| run2 | `142/0`，rc=0 | `56/0`，rc=0 |
| run3 | `142/0`，rc=0 | `56/0`，rc=0 |
| `--out` 契约 | 默认目录：`results.json` 142 条 + 4 png + `summary.txt` ✔ | `--out`：rc=0，`results.json` 56 条（全 passed）+ `summary.txt` ✔ |
| 负向 | rc=1，`passed=142 / failed=1` | rc=1，`passed=56 / failed=1` |

- 每次正向均断言：`JSON.parse(stdout)` 成功、`passed`/`failed` 为 number、
  `failed=0 ↔ rc=0`、`passed>=min`、`stdout` 单行、`text` 含原文本汇总。
- 记录存档：`OUT/verify_career.json`、`OUT/verify_first_batch.json`（各 5 cases，全部通过）。

---

## 七、负向验证证据（证明不是「永远输出 0」的假绿）

**方法**：在 `tools/` 下创建**临时副本**
`__neg_career.mjs` / `__neg_first_batch.mjs`（与探针同目录以保证 `./lib/` 与 `root` 解析正确），
注入一条必然失败的哨兵断言，实跑，校验 `failed>0 且 exit=1`，`finally` 删除副本。

- career 注入点：`const all=[];` 后追加
  `all.push({viewport:'__neg__',name:'__NEG_SENTINEL__',passed:false,detail:'injected'});`
- first_batch 注入点：`const fail = …` 前追加
  `results.push({ name: "__NEG_SENTINEL__", passed: false });`

**实跑结果**：

| 探针 | rc | passed | failed | sentinel 出现 | 结论 |
| --- | --- | --- | --- | --- | --- |
| career NEGATIVE | **1** | 142 | **1** | true | failed>0 → exit=1；passed 仍为 142（非清零假绿） |
| first_batch NEGATIVE | **1** | 56 | **1** | true | 同上 |

**源码级证据**（无需运行即可确认）：两探针的退出行
`process.exitCode=failed.length?1:0;` / `process.exitCode = fail ? 1 : 0;`
在本轮 diff 中**未被修改**，而 `failed`/`fail` 直接来自 `!r.passed` 过滤计数，故
`failed>0` 必然 `exitCode=1`。负向实跑与之完全吻合。

**残留检查（负向验证不得留在最终文件里）**：

```
grep -n "__NEG_SENTINEL__|__neg__|injected" tools/probe_career_achievements.mjs tools/probe_first_batch.mjs  → 无残留
ls tools/__neg_*                                                                                          → 无副本
```

两个最终探针源码中**没有**任何哨兵字符串、注入痕迹或负向专用分支。

---

## 八、已知环境细节（如实记录）

- career **run1 的 stderr** 出现一行
  `[audit-scratch] 临时目录未能删除（不影响检查结论）：… [safe-delete] … Some operations were aborted`，
  来自 `tools/lib/audit_scratch.mjs` 的批量删除保护（D 盘 Chrome profile 清理被 trash 拒绝）。
  这是 **stderr**（`console.warn`），**不进入 stdout**，`JSON.parse(stdout)` 不受影响；run2 / run3 stderr 为空。
  未做任何递归删除操作来绕过保护。
- first_batch 全程 stderr 为空。
- 未运行 `node tools/check.js` 完整门禁，未运行生成模式 `node tools/release.js`。

---

## 九、建议的 `runProbeJson(...)` 注册行与 min passed（**本子代理不改 `check.js`**）

对齐 B9 §六 风格。`min passed` 取 3 次实测稳定值；语义 `failed!==0 || passed<min` 即失败。
`eB12` / `tmpB12` 仅为示意命名，主线程按 E95 注册区实际变量调整。

```js
// 首批修复（确认框生命周期 + 个人战绩，56/0，VM 秒级，不需 --out）
const rB12_first = runProbeJson('probe_first_batch.mjs', [], {timeout:20000});
if(rB12_first.failed!==0||rB12_first.passed<56) eB12.push('首批修复回归未通过');

// 生涯成就浏览器（142/0，Chromium 实测约 54s，--out 可缺省；需显式超时）
const rB12_career = runProbeJson('probe_career_achievements.mjs', [], {timeout:200000});
if(rB12_career.failed!==0||rB12_career.passed<142) eB12.push('生涯成就浏览器回归未通过');
```

说明：
- **min passed：`probe_first_batch.mjs` = 56，`probe_career_achievements.mjs` = 142**（各 3 次实测稳定）。
- career 属浏览器 / 慢速类，实测 54s；`timeout:200000` 与 B9 §六.3 对慢速类的建议一致并留足余量，
  **不可省略**（`runProbeJson` 默认 20s / E57–E94 段 30s 会误判超时）。
- career 若想把产物落到临时目录，可传 `['--out', path.join(tmpB12,'career-achievements')]`；
  但**不带 `--out` 已实测可跑并输出纯 JSON**（默认目录契约保持），故注册行给空数组即可。
- first_batch 的 `--out` 为**可选**，注册行不传即可；需要明细文件时再传 `['--out', <dir>]`。

---

## 十、交付物清单

**改动文件（仅两个）**
- `tools/probe_career_achievements.mjs`（保持已有 `--out`，追加纯 JSON stdout + `summary.txt`）
- `tools/probe_first_batch.mjs`（新增可选 `--out`，追加纯 JSON stdout，`checks/text` 保留原文本）

**报告**
- `docs/audit/WORKBUDDY_B12_PROBE_JSON_CONTRACT_20261106.md`（本文件）

**证据（`D:/CodexWork/chizi-mojiang/workbuddy/outputs/wb-public/parallel-b6/`）**
- `before_career.stdout.txt` / `before_first_batch.stdout.txt`：改前 stdout 原文
- `after_career.run1.stdout.txt` / `after_first_batch.run1.stdout.txt`：改后真实单行纯 JSON
- `after_career.pretty.json` / `after_first_batch.pretty.json`：改后 JSON pretty 版
- `before_career.stderr.txt` / `before_first_batch.stderr.txt`：改前 stderr
- `verify_contract.py`：验证脚本（正向 ×3 + `--out` 契约 + 负向注入，副本即删）
- `verify_career.json` / `verify_first_batch.json`：逐用例验证记录（各 5 cases）
- `b12_probe_diff.txt`：两探针 `git diff` 全文（证明只动输出段）
- `first-batch-out/`（first_batch `--out` 产物）、`neg-career-out/` / `neg-first-batch-out/`（负向运行产物）

---

## 十一、红线复核清单

| 红线 | 状态 |
| --- | --- |
| `extension.js` / `info.json` / `package.js` / `README.md` 的 `4.0.16` 一个字符不动 | ✔ 逐字符复核完好 |
| 不改 `catalog.js`、不跑生成模式 `node tools/release.js` | ✔ 未触碰 |
| 不碰 `core/`、`tools/check.js`、`check_update_suite.mjs`、`check_probe_registry.mjs`、`AGENTS.md`、`CURRENT_WORK.md`、`README.md`、前几轮探针与报告 | ✔ 未触碰（仅实跑读取 `core/*.js`） |
| 不 `git add/commit/push`、切分支 / reset / clean、改 git 配置 | ✔ 仅只读 `git status` / `git diff` |
| 不跑 `node tools/check.js` 完整门禁、不发远端请求 | ✔ |
| 一条业务断言不删、门槛不降、判定逻辑不改 | ✔ diff 证明，且 142/0、56/0 不变 |
| 负向验证不留在最终文件里 | ✔ 哨兵与临时副本均无残留 |
