# B14 · 独立慢速验证通道 `check_slow_suite.mjs`（2026-11-06）

日期：2026-11-06。编制：WorkBuddy（并行子代理）。工作目录固定副本
`D:/CodexWork/chizi-mojiang/workbuddy/ext/app/extension/池子魔将`。
产物落 `workbuddy/outputs/wb-public/parallel-b7/`，`TEMP/TMP` 指向 D 盘 temp。
**不进日常门禁**：本轮新增的是一条独立、可选、手动触发的慢速验证入口。

---

## 交付摘要

| 项 | 数字 |
| --- | --- |
| 清点实测候选探针 | **22** 个（串行，8m49s） |
| 纳入清单（实测 >30s 且能跑通、N/0） | **7** 个 |
| 新增文件（仓库内） | `tools/check_slow_suite.mjs`、本报告，共 **2** 个 |
| 整条通道实跑 | **2 次**，均 7/7 全绿、`exit=0`，见 §五 |
| `check.js` / `check_update_suite.mjs` | **未改**（主线程统一决定是否挂链接） |
| `4.0.16` / `catalog.js` / `core/` | **一字未动** |

---

## 一、为什么是独立通道

`WORKBUDDY_B9_ORPHAN_PROBES_20261106.md` §五.4 记下了一个明确待办：
`tools/probe_achievement_quality.mjs` 实跑 **78/0**，但耗时 **118–166 秒**，远超
`tools/check.js` 里 `runProbeJson` 默认 20s / E57—E94 段 30s 的超时预算；B9 建议
「走独立慢速通道，不塞进快速门禁」，当时没做。`WORKBUDDY_B13_REGISTRY_GUARD_20261106.md`
§明确未做 也再次确认 quality「没有塞进快速门禁，走独立慢速通道更合适」。

主线程此后把快速门禁扩到 **E95A–O**，其中 **E95O** 的 `probe_career_achievements.mjs`
（约 54s）显式给了 `timeout: 200000`。这已经是「给单个慢探针开口子」的极限：quality 单探针
就近 90–166s，再往快速门禁里塞 2 分钟级探针，会把**每次** `node tools/check.js` 拖到十几分钟，
而这类深度审计并非每次改动都需要。结论：

- 保留快速门禁的快；
- 把「能跑通但明显 >30s」的探针收进一条**独立、可选、手动**的慢速通道；
- 发布前或怀疑回归时手动跑一次，不进日常门禁、不由 CI 每次触发。

---

## 二、只读调查：quality 探针的参数契约 / 耗时 / stdout / exit（实测，不猜）

单跑命令（`TEMP/TMP` 指向 D 盘）：

```bash
node tools/probe_achievement_quality.mjs --out <D盘>/quality-result.json
```

实测结果（本副本，本轮）：

| 项 | 实测 |
| --- | --- |
| exit code | **0** |
| 耗时 | **88.7s**（单跑）/ 89.7s（清点串行里）/ B9 记录 118–166s，随机器负载波动 |
| stdout | **52 字节纯 JSON**：`{\n  "passed": 78,\n  "failed": 0,\n  "failures": []\n}` |
| stderr | 空 |
| `--out` | **可选，且必须是结果文件路径**（源码 `fs.writeFileSync(out, ...)`，非目录） |
| `--root` | 可选，默认副本根 |
| exit 判定 | `if (result.failed) process.exitCode = 1;`（`failed>0` → 1，否则 0） |

读源码（`tools/probe_achievement_quality.mjs:9-15,122-126`）确认慢因：对 ~40 个 mutation
逐个 `await loadModel(root)` 全量重载 2000 条成就模型，故耗时远超 20s 默认超时。
`runProbeJson` 的 `JSON.parse(stdout)` 能直接读它的纯 JSON 输出，问题**只在耗时、不在契约**。

---

## 三、清点：22 个候选的实测结果与纳入依据

清点脚本 `parallel-b7/investigate/measure.mjs`（**不在仓库内**）：串行 spawn、每个给独立超时、
按各探针源码确认的 `--out` 契约传参（dir / file / none），统一 `TEMP/TMP/CSH_AUDIT_TEMP` 指向
D 盘 temp，逐个记录 exit / 耗时 / passed / failed / 结果来源（via）。
候选覆盖：B9 §二/§六 的浏览器与慢速类、任务点名的 `probe_career_achievements.mjs` /
`probe_update_lifecycle_20261105.mjs` / `probe_update_ui_20261105.mjs`、
`check_update_suite.mjs` 的 12 个更新/备份专项、以及其它 `withChromium` 浏览器类。

| # | 探针 | exit | 耗时(ms) | passed/failed | 判定 |
| --- | --- | --- | --- | --- | --- |
| 1 | `probe_achievement_quality.mjs` | 0 | **89688** | **78/0** | **纳入** |
| 2 | `probe_career_achievements.mjs` | 0 | **77295** | **142/0** | **纳入** |
| 3 | `probe_update_lifecycle_20261105.mjs` | 0 | **66888** | **29/0** | **纳入** |
| 4 | `probe_world_ui_rebuild.mjs` | 0 | **48096** | **80/0** | **纳入**（本轮新发现的慢类） |
| 5 | `probe_art_baseline.mjs` | 0 | 47312 | `0 / []` | 排除：契约不符，见下 |
| 6 | `probe_world_entry.mjs` | **1** | 49063 | **92/12** | 排除：真实断言失败，见下 |
| 7 | `probe_world_memoir_ui.mjs` | 0 | **36865** | **92/0** | **纳入**（本轮新发现） |
| 8 | `probe_panel_window.mjs` | 0 | **33199** | **69/0** | **纳入**（本轮新发现） |
| 9 | `probe_update_ui_20261105.mjs` | 0 | **33069** | **33/0** | **纳入** |
| 10 | `probe_achievement_album.mjs` | 0 | 21378 | 40/0 | 排除：<30s |
| 11 | `probe_career_scale_20261105.mjs` | 0 | 20681 | 19/0 | 排除：<30s |
| 12 | `probe_update_mobile_io_20261105.mjs` | 0 | 2359 | 6/0 | 排除：秒级 |
| 13 | `probe_update_transaction.mjs` | 0 | 853 | 24/0 | 排除：秒级 |
| 14 | `probe_update_mirror_fallback_20261105.mjs` | 0 | 866 | 11/0 | 排除：秒级 |
| 15 | `probe_online_offline.mjs` | 0 | 563 | 76/0 | 排除：秒级 |
| 16 | `probe_backup_lifecycle_20261104.mjs` | 0 | 350 | 40/0 | 排除：秒级 |
| 17 | `probe_first_batch.mjs` | 0 | 166 | 56/0 | 排除：秒级 |
| 18 | `probe_update_bundle_cleanup_20261105.mjs` | 0 | 167 | 10/0 | 排除：秒级 |
| 19 | `probe_update_backup_capacity_20261105.mjs` | 0 | 164 | 10/0 | 排除：秒级 |
| 20 | `probe_update_startup_recovery_20261105.mjs` | 0 | 143 | 10/0 | 排除：秒级 |
| 21 | `probe_update_deferred_20261105.mjs` | 0 | 138 | 8/0 | 排除：秒级 |
| 22 | `probe_update_cancel_pending_20261105.mjs` | 0 | 134 | 7/0 | 排除：秒级 |

### 纳入清单（7 个，实测耗时降序）

`quality 89.7s` · `career_achievements 77.3s` · `update_lifecycle 66.9s` ·
`world_ui_rebuild 48.1s` · `world_memoir_ui 36.9s` · `update_ui 33.1s` · `panel_window 33.2s`。
全部 `exit=0 / failed=0`，全部输出**纯 JSON** `{passed:number, failed:number}`。
阈值取「明显 >30s」——30s 是 `check.js` E57—E94 段的单探针预算，超过它的不适合快速门禁。

> `probe_career_achievements.mjs` 已在快速门禁 **E95O**（200s 超时）。慢速通道重复纳入，
> 是为了「发布前一次性覆盖全部慢探针」，`--only` 也可单独跑；二者不冲突、不改变快速门禁。

### 排除项与依据（不凭感觉，全部有实测）

- **<30s（快速门禁预算内）**：`achievement_album 21.4s / 40/0`、`career_scale 20.7s / 19/0`。
- **秒级 VM 类（0.13–2.4s）**：`first_batch` 及 10 个更新/备份/联网专项
  （`update_transaction` / `deferred` / `cancel_pending` / `mobile_io` / `mirror_fallback` /
  `startup_recovery` / `backup_capacity` / `bundle_cleanup` / `backup_lifecycle` / `online_offline`）。
  实测 `update_lifecycle` / `update_ui` 是其中仅有的两个浏览器慢类，其余全是秒级，
  **不因文件名像「更新链路」就凭感觉列为慢探针**。
- **stdout 契约不符、0 条断言**：`probe_art_baseline.mjs` 47.3s，`exit=0`，但 stdout 是
  `{"screenshots":88,"missing":[],"passed":0,"failed":[],"out":...}`——`passed` 恒为 **0**、
  `failed` 是**数组**（非 number），探针是截图基线、不产生 `{passed,failed}` 断言汇总。
  按任务要求「跳过并如实标注」，**不纳入**；把它算作「通过」等于用 0 条断言冒充通过。
- **真实断言失败**：`probe_world_entry.mjs` 49.1s，`exit=1 / 92/12`，12 条失败是
  「Shift+Tab / Tab 焦点环绕」「任务组刷新后存活」× 4 个 viewport，stderr 空、浏览器正常起，
  属真实失败而非环境限制，**不纳入**（不能跑通）。
- **环境限制（未纳入、未冒充通过）**：`*_host.mjs` 系列及 `probe_minigame_active.mjs` 本副本
  缺 `ext/app/index.html`，`probe_host_smoke.mjs` 的 `GET /index.html` 404 起不来（B9 §五.3）。
  本轮另跑一次 `probe_minigame_active.mjs` 取一手证据，见 §六。这类探针**一个都没塞进清单**，
  因此不存在「把环境失败冒充通过、或据此把整条通道判绿」的情形。

---

## 四、实现：`tools/check_slow_suite.mjs`

接口：

```bash
node tools/check_slow_suite.mjs --out <D盘目录> [--only <探针名>]
```

- **逐个跑、独立超时**：SPEC 7 条各带 `timeout`，`quality` 给 **240000ms**（≥ 任务要求），
  其余 180000–200000ms，留足机器负载余量。
- **每个探针显式传 `--out` 到 `--out` 目录下的子路径**：`dir` 类 → `<out>/<探针名>/`，
  `file` 类（quality）→ `<out>/<探针名>.json`。这样覆盖了 `career_achievements` /
  `world_entry` 等探针**默认写在仓库内 `docs/audit/ui/` 的目录**，保证产物不写仓库内文件。
  `--out` 缺失或不在 D 盘直接报配置错误（stdout 仍是纯 JSON，`exit=1`）。
- **记录字段**：`probe / out / timeout / exit / ms / passed / failed / via / timedOut / status / reason`。
  `passed`/`failed` 是**探针自报的断言计数（N/0）**；顶层 `passed`/`failed` 是**探针级计数**。
- **汇总契约**（与 `check_update_suite.mjs` 的 `suite.json` 一致）：
  - 写 `<out>/slow-suite.json`（含 `scope/at/repo/out/only/total/passed/failed/results`）；
  - stdout **纯 JSON** `{passed, failed, results:[...]}`（单行，`JSON.parse` 必成功）；
  - 每个探针 stdout/stderr 另存 `<out>/logs/<探针名>.{stdout,stderr}.log`。
- **单个探针失败不中断其余**：`for` 循环不 break；整体 `failed>0` 时 `process.exitCode=1`。
- **stdout 非纯 JSON 的处理**（不修改任何探针文件）：
  1. 先试纯 JSON：逐行 `{...}` → 再试「首个 `{` 到末个 `}`」整块（覆盖 pretty 多行）；
  2. 再试文本汇总正则：`Career achievement browser: N PASS / M FAIL`、
     `First batch: PASS N / FAIL M`、通用 `PASS N / FAIL M`；
  3. 仍拿不到 `passed/failed` → 标 `unparsed` 并如实说明，**计入 failed，不冒充通过**。
- **blocked 判定**：`envReason()` 只认明确的宿主起不来标志（`index.html` + `404/Not found`、
  `extensionLoaded` 为 `false`，正则兼容 JSON 带引号格式），`exit≠0` 且命中即标 `blocked`、写明原因，并计入 failed，
  **因此通道不会因为有探针环境起不来而判绿**。真实断言失败带 stderr 不含这些标志，不会被误标。
- `status` 取值：`pass` / `fail` / `blocked` / `unparsed` / `timeout` / `error`（配置）。

全程只读业务文件；`TEMP/TMP/CSH_AUDIT_TEMP` 指向 D 盘 temp（与 `audit_scratch.mjs` 契约一致）。

---

## 五、整条通道实跑

实跑 **2 次**（整条通道，非 `--only`）。命令（`TEMP/TMP/CSH_AUDIT_TEMP` 指向 D 盘 temp，
脚本内部亦硬编码，双保险）：

```bash
node tools/check_slow_suite.mjs --out D:/CodexWork/chizi-mojiang/workbuddy/outputs/wb-public/parallel-b7/slow-run1
node tools/check_slow_suite.mjs --out D:/CodexWork/chizi-mojiang/workbuddy/outputs/wb-public/parallel-b7/slow-run2
```

| 探针 | run1 exit | run1 耗时 | run1 N/0 | run2 exit | run2 耗时 | run2 N/0 | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `probe_achievement_quality.mjs` | 0 | 91.6s | **78/0** | 0 | 90.7s | **78/0** | pass |
| `probe_career_achievements.mjs` | 0 | 75.4s | **142/0** | 0 | 83.8s | **142/0** | pass |
| `probe_update_lifecycle_20261105.mjs` | 0 | 80.2s | **29/0** | 0 | 89.4s | **29/0** | pass |
| `probe_world_ui_rebuild.mjs` | 0 | 58.7s | **80/0** | 0 | 72.8s | **80/0** | pass |
| `probe_world_memoir_ui.mjs` | 0 | 43.0s | **92/0** | 0 | 62.9s | **92/0** | pass |
| `probe_update_ui_20261105.mjs` | 0 | 51.3s | **33/0** | 0 | 54.5s | **33/0** | pass |
| `probe_panel_window.mjs` | 0 | 45.0s | **69/0** | 0 | 46.9s | **69/0** | pass |

- **整体结论（两轮）**：`passed=7 / failed=0 / exit=0`，`process.exitCode=0`。
  stdout 均为**单行纯 JSON** `{passed, failed, results:[...]}`（`json.load` 校验通过），
  `slow-suite.json` 字段 `total=7 / passed=7 / failed=0`。
- **通道总耗时**：run1 约 **7m26s**（7 探针合计 445.2s）、run2 约 **8m22s**（合计 500.8s），
  约 7–8.5 分钟（run2 8m22s 略超 8 分钟）；run2 略慢属机器负载波动，各探针独立 timeout（180–240s）均有
  充足余量（最大单探针 89.4s < 180s）。
- **稳定性**：两轮 7 个探针的 `N/0` **逐个完全一致**，无偶发失败、无 timeout、无 blocked。
- **代码版本**：run1 跑在 `envReason` 正则放宽之前，run2 跑在**最终交付代码**上。
  该改动只影响 `exit≠0` 时的 `blocked` 判定，两轮 7 个探针 `exit=0`，不经过该分支，
  故两轮结论一致、pass 路径未变。
- **产物路径**：全部落 `--out`（D 盘）目录：`slow-suite.json`、`stdout.json`、`stderr.log`、
  `logs/<探针>.{stdout,stderr}.log`、各探针 `--out` 子目录/结果文件。
  `git status --short` 只有本代理新增的 2 个仓库内文件，**探针未写任何仓库内文件**
  （显式 `--out` 覆盖了 `career_achievements` / `world_entry` 等默认写在 `docs/audit/ui/` 的目录）。

---

## 六、环境限制一手证据与「不判绿」说明

为确认「本副本环境起不来」不是照抄 B9、而是本轮一手实测，单独实跑了一个宿主类代表
`probe_minigame_active.mjs`（B9 §五.3 已判为环境限制，`--out <dir>` 必需）：

| 项 | 实测 |
| --- | --- |
| 命令 | `node tools/probe_minigame_active.mjs --out <D盘目录>` |
| exit | **1** |
| 耗时 | **80.3s** |
| stdout | `passed:0, failed:2, errors:[]`，`boot.url = http://127.0.0.1:60775/index.html`，`boot.globals = {lib:false, game:false, CSH:false}`，`boot.extensionLoaded = false`，`boot.body = {"success":false,"errorMsg":"Not found"}` |
| `failedRequests` | `GET /favicon.ico → 404`、`GET /index.html → 404` |
| stderr | 空 |

即本副本缺 `ext/app/index.html`，宿主页面起不来、`globals` 全 false，与 B9 §五.3 完全一致。
**stderr 为空、是宿主/boot 层失败，不是断言失败**，故如实归为环境限制。

> 一次失败尝试的如实记录：首次跑时用了 `export TEMP="D:/..." TMP="$TEMP" CSH_AUDIT_TEMP="$TEMP"`
> 同一行赋值，bash 在同一 `export` 里展开的是**赋值前**的 `$TEMP`（C 盘系统 temp），
> 导致 `auditTempRoot()` 抛 `CSH_AUDIT_TEMP must be outside C:`（422ms 即失败）。
> 这是我命令写法的赋值陷阱，**不是探针的环境限制**，不作为结论；
> 改为逐行赋值后重跑（上表，80.3s）才是真实证据。`check_slow_suite.mjs` 内部把
> `TEMP/TMP/CSH_AUDIT_TEMP` 硬编码为 D 盘 temp，不依赖外层 export，故 7 个探针不受影响。

**为什么这不会「把整条通道判绿」**：这类环境限制探针**一个都没塞进清单**（§三），
所以不存在冒充通过。`check_slow_suite.mjs` 的 `envReason()` 对上表真实日志文本验证：
`index.html+404` 分支命中、`extensionLoaded:false` 分支（已放宽以兼容 JSON 带引号格式）
也命中，整体返回非 null —— 若把它们纳入，`classify()` 会标 `blocked`、写明原因并计入
`failed`，使 stdout `failed>0`、`process.exitCode=1`，**通道不会判绿**。
本次整条通道 7/7 全绿，是因为清单内 7 个探针在本副本都能跑通，而非掩盖了环境失败。

---

## 七、用法

```bash
TEMP="D:/CodexWork/chizi-mojiang/workbuddy/temp"
TMP="$TEMP"
CSH_AUDIT_TEMP="$TEMP"
export TEMP TMP CSH_AUDIT_TEMP
cd "D:/CodexWork/chizi-mojiang/workbuddy/ext/app/extension/池子魔将"

# 发布前 / 怀疑回归时，跑整条慢速通道（约 7–9 分钟）
node tools/check_slow_suite.mjs --out D:/CodexWork/chizi-mojiang/workbuddy/outputs/wb-public/parallel-b7/slow-run

# 只跑某一个慢探针（完整名或去前缀/后缀的简称都可）
node tools/check_slow_suite.mjs --out <D盘目录> --only probe_achievement_quality.mjs
node tools/check_slow_suite.mjs --out <D盘目录> --only achievement_quality

# 判定：stdout 纯 JSON {passed, failed, results:[...]}；exit=0 表示全部通过，exit=1 表示有失败/blocked
# 明细：<out>/slow-suite.json 与 <out>/logs/
```

`export` 请逐行赋值：同一 `export` 行里的 `$TEMP` 会展开为**赋值前**的旧值（§六记录的
赋值陷阱，会把 `TMP/CSH_AUDIT_TEMP` 带到 C 盘系统 temp）。`check_slow_suite.mjs` 内部已把
`TEMP/TMP/CSH_AUDIT_TEMP` 硬编码为 D 盘 temp，外层 export 只是双保险。

`--out` 必须是 D 盘目录；产物（含每个探针的 `--out` 子目录、日志、汇总）全部落在该目录内，
不写仓库内文件。**不由 `node tools/check.js` 调用**，也不改它。

---

## 八、明确未做与残余限制

- **未改** `tools/check.js`、`tools/check_update_suite.mjs`：本轮不在这两个入口挂链接/注册，
  由主线程统一决定（任务约定）。慢速通道默认是「手动、可选」，不是 CI 步骤。
- **未设 `min passed` 下界**：判定按 `exit===0 && failed===0 && passed!==null`；只防「解析不出
  结果」的假绿，不校验断言数是否缩水。若需更强防退化，可按 §三 实测 N 值给 SPEC 加下界。
- **清单不是全库穷举**：232 个 `probe_*.mjs` 里本轮实测 22 个候选（重点覆盖浏览器/更新/慢速类）。
  其余（尤其大量 `*_host.mjs`、`*_ai.mjs`）未逐个实跑，不能断言其快慢或全绿；未纳入不等于坏。
- **耗时随机器负载波动**：quality 本副本实测 88.7–89.7s，B9 记录 118–166s；`career_achievements`
  本副本 77.3s，B12 记录 54s。所有 timeout 已留余量，但极端负载下仍可能触发 `timeout`（会如实标注、
  不判绿），重跑即可。
- **环境限制类未纳入**：本副本缺 `ext/app/index.html`，`*_host.mjs` / `probe_minigame_active.mjs`
  等起不来（§六）。它们**没有被冒充通过、也没有据此把通道判绿**；若将来环境补齐，可再评估纳入。
  `check_slow_suite.mjs` 内建 `blocked` 分支，实跑中任一探针因环境起不来会标 blocked 且 `exit=1`。
- **`art_baseline` / `world_entry` 未纳入**：前者 0 条断言且契约不符，后者 92/12 真实失败（§三）。
  二者的修复/契约改造不在本轮文件域。
- 全绿判定基于本副本、D 盘 temp、隔离 VM / disposable Chromium profile，不代表真机 WebView、
  Electron / Android 实体设备或完整宿主链路。
- 未 `git add/commit/push`，未切分支 / reset / clean、未改 git 配置，未发远端请求，
  未跑 `node tools/check.js` 完整门禁，未运行生成模式 `node tools/release.js`，
  未递归删除大批临时目录。

---

## 九、改动文件清单 / 红线复核

**新增（仓库内，仅 2 个）**
- `tools/check_slow_suite.mjs`
- `docs/audit/WORKBUDDY_B14_SLOW_SUITE_20261106.md`（本报告）

**辅助脚本 / 产物（均在 `workbuddy/outputs/wb-public/parallel-b7/`，不在仓库内）**
`investigate/measure.mjs`、`investigate/measure/measure.json`、`investigate/measure/<探针>/_stdout.log`
与 `_stderr.log`、`investigate/quality.*`、`investigate/cfg/*`、
`slow-run1/{slow-suite.json,stdout.json,stderr.log,logs/*,env-demo/*,env-demo2/*}`、
`slow-run2/{slow-suite.json,stdout.json,stderr.log,logs/*}` 等。

**红线复核（只读）**
- `git status --short`：仅 `?? tools/check_slow_suite.mjs`（+ 本报告），无其它本代理改动。
- `4.0.16`：`extension.js` 2 处、`info.json` 2 处、`package.js` 1 处、`README.md` 2 处，逐字符完好。
- 未碰：`core/` 下任何文件、`tools/check.js`、`tools/check_update_suite.mjs`、
  `tools/check_probe_registry.mjs`、`tools/release.js`、`catalog.js`、`AGENTS.md`、
  `docs/audit/CURRENT_WORK.md`、`README.md`、所有已有 `probe_*.mjs`、所有已有报告。
- 未改版本号、未运行生成模式 `node tools/release.js`。
