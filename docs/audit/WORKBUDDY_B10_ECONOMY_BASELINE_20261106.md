# B10 · `probe_4_0_12_economy.mjs` 15/1 失败项闭环：systemCollected 基线裁决

日期：2026-11-06。编制：WorkBuddy（并行子代理，第四轮）。工作目录固定副本
`D:/CodexWork/chizi-mojiang/workbuddy/ext/app/extension/池子魔将`。
产物落 `workbuddy/outputs/wb-public/parallel-b4/`，运行前 `export TEMP=".../workbuddy/temp" TMP="$TEMP"`。
上游：B9 报告 §三/§五.1 把该项判为「产品/基线变更，非探针夹具问题」并**只记录未修**，
留了「需产品负责人确认 100 是否预期」的悬问。本轮实跑取证、定位真实来源、自行裁决并闭环。

## 交付摘要

| 项 | 结论 / 数字 |
| --- | --- |
| **分类结论** | **B 基线变更**（产品有意把抽水默认费率从 1% 升级为 V2 的 0.5%+前注，探针写死旧值 200） |
| 改前实跑 | **exit=1 / 15 passed / 1 failed** |
| 改后实跑 | **exit=0 / 23 passed / 0 failed × 3 次**（run1/run2 带 `--out`/run3） |
| `node --check` | 通过 |
| 产品源码 | **一字未改**（`core/csh_registry.js`、`core/csh_pots.js` 均未动）→ catalog 无需重生成 |
| 改动文件 | 仅 `tools/probe_4_0_12_economy.mjs`（1 file, 18 insertions / 2 deletions）+ 本报告 |
| 建议注册行 | §七（本轮**不改** `tools/check.js`，主线程统一接入） |
| 版本号 | `4.0.16` 出现次数各文件与改前一致：2/2/1/2，一字未动 |

---

## 一、改前失败证据（实跑，非猜测）

命令（原始位置、`TEMP/TMP` 指向 D 盘）：

```bash
export TEMP="D:/CodexWork/chizi-mojiang/workbuddy/temp" TMP="$TEMP"
cd "D:/CodexWork/chizi-mojiang/workbuddy/ext/app/extension/池子魔将"
node tools/probe_4_0_12_economy.mjs
```

`outputs/wb-public/parallel-b4/runs/before.stdout`（stderr 为空，`EXIT=1`）：

```json
{
  "scope": "actual wallet/claim bridge/registry/pots in disposable stores",
  "passed": 15,
  "failed": 1,
  "failures": [
    { "name": "new registry fee has no twenty cap and conserves funds", "passed": false }
  ]
}
```

失败断言上下文 = 改前第 11 行（已从 `runs/probe_before.mjs` 留档）：

```js
{const ctx=vm.createContext({window:{CSH:{}}});
 vm.runInContext(fs.readFileSync(root+'/core/csh_registry.js','utf8'),ctx);
 vm.runInContext(fs.readFileSync(root+'/core/csh_pots.js','utf8'),ctx);
 const P=ctx.window.CSHPots,C=P.card,r=P.settle({
   players:[{id:0,contrib:10000,hole:[C(14,0),C(14,1)]},{id:1,contrib:10000,hole:[C(2,0),C(2,1)]}],
   community:[C(14,2),C(5,0),C(9,1),C(6,3),C(8,2)],
   rake:ctx.window.CSH.registry.texasRake(),   // ← 读产品当前默认抽水模型
   stacks:{0:10000,1:10000},dealerId:0});
 check('new registry fee has no twenty cap and conserves funds',
       r.systemCollected===200 && r.conservation==='PASS');}   // ← 失败点
```

注意 `rake` **不是探针自造的常量**，而是直接调用产品 `CSH.registry.texasRake()`，
所以「200」是探针编写年代（文件名 `probe_4_0_12_economy`，即 4.0.12 期）产品默认费率下的期望值。

---

## 二、`systemCollected` 的真实来源（代码证据）

**产生位置**：`core/csh_pots.js` 的 `finish()`（结算账本唯一实现，见文件头 L6「结算金额只能有一个实现」）。

```
core/csh_pots.js:257  var rake=hand.rake||{},rate=rake.rateBps||0,
                          cap=rake.cap==null?Number.MAX_SAFE_INTEGER:rake.cap,systemCollected=0,rakePaid={};
core/csh_pots.js:259  var canRake=rate>0 && (!rake.noFlopNoDrop || (hand.community||[]).length>=3);
core/csh_pots.js:263      var fee=Math.min(cap-systemCollected,Math.floor(pt.amount*rate/10000));
core/csh_pots.js:269      pt.rake=fee;systemCollected+=fee;
core/csh_pots.js:295  var conserved = (gained + systemCollected === totalPot) && (startSum === 0 || endSum + systemCollected === startSum);
core/csh_pots.js:298      systemCollected: systemCollected,
core/csh_pots.js:300      conservation: conserved ? 'PASS' : 'FAIL',
```

即 `systemCollected` = 对每个底池按 `floor(池额 × rateBps / 10000)` 抽水、受 `cap` 截断后的累加；
语义是**系统（庄家）从底池抽走的场供总额**；`conservation` 是「发放 + 抽水 = 底池总额」的资金守恒校验。

**费率来源**：`core/csh_registry.js:242-246`

```js
function texasRake(value) {
    var rate = Number(value);
    if ([0,50,100,200].indexOf(rate) < 0 || value == null) rate = 50;
    return { modelVersion: 2, anteBbBps: 1000, rateBps: rate, cap: null, noFlopNoDrop: true };
}
```

默认 `rateBps:50`（0.5%）、`cap:null`（无上限）、`modelVersion:2`、`anteBbBps:1000`（10% 大盲前注）、`noFlopNoDrop:true`（未翻牌不抽）。

**本场景算式**：两家各 `contrib:10000` → `totalPot/pt.amount = 20000`；`community` 5 张 ≥3 → `canRake=true`；
`cap=null` → 不截断。

- 当前 V2 默认：`floor(20000 × 50 / 10000) = 100` → `systemCollected=100`，`gained=19900`，`19900+100=20000` → `conservation='PASS'`。
- 4.0.12 期旧默认（1% = 100bps）：`floor(20000 × 100 / 10000) = 200` → 正是旧断言写死的 `200`。

`200` 与 `100` 的差**完全由 `rateBps` 一个产品常量解释**，`settle()` 算法与守恒逻辑没有任何异常。

---

## 三、分类裁决：**B 基线变更**（不是 A，不是 C）

### 3.1 为什么是 B：产品有意改版，七处协同证据

1. **设计文档给出决策记录**（决定性）：`docs/audit/TEXAS_EXPERIENCE_20261028.md`
   - L10：「**新默认翻牌后场供 0.5%，无金额上限**……原先明确保存的 **0/0.5%/1%/2%** 设置按原值保留：**旧用户保存 1% 时，新桌仍用 1%** 且开局前如实显示。」
   - L20–22：「**A：无前注+1% 翻牌后场供；B：每档大盲 10% 前注+0.5% 场供；C：……**三组各 10000 手」——1% 是**被比较的旧方案 A**，0.5%+前注是**选定实施的方案 B**。
   - L11：「旧无 `modelVersion`/`anteBbBps` 局仍无前注，旧金额重放保留」解释了 `modelVersion:2` 的来历与向后兼容策略。
   即：产品**明确地、有对比数据地**把默认从 1% 改成了 0.5%。
2. **registry 默认值**：`csh_registry.js:242-246` 默认 `rateBps:50`、`modelVersion:2`、`anteBbBps:1000`、`cap:null`，与文档方案 B 一一对应。
3. **玩家可见 UI 文案**：`games/texas/texas.html:3276`
   `'翻牌后场供 '+(fee.rateBps/100)+'%（无上限）'` —— 用 `fee.rateBps` **动态渲染 0.5%**；
   `:2910` 结算页显示 `'系统共收 ' + fmt(led.systemCollected)`。若是数值写错，UI 会跟着一起错，不可能单独只错 registry。
4. **费率是可迁移的用户配置**：`core/csh_migrate.js:1050` 把 `texasRake` 列入存档键，合法值 `[0,50,100,200]`、非法/空回退 `100`（保留旧值）；`core/csh_shell.js:815` 把 `lib.config["extension_池子魔将_csh_texas_rake"]` 传入 `texasRake(value)`。50 是「无配置时的新默认」，不是硬编码错值。
5. **产品侧已有 V2 权威回归探针**：`tools/probe_texas_rules.mjs:40`
   `check('new default has 10% BB ante and 0.5% postflop rake', fees.rateBps===50 && ...)` 名字直呼 **"new default"**；
   `:42` `check('explicit old user rake preference preserved', registry.texasRake('100').rateBps===100 ...)` 验证旧 1% 偏好保留；
   `:62` 把 `{modelVersion:2,anteBbBps:1000,rateBps:50,cap:null,noFlopNoDrop:true}` 标为 `'current'` 模型跑连续对局。B9 实跑该探针 33/0。
6. **`settle()` 算法本身没错**：`tools/probe_texas_fees.mjs` 用**显式传入的旧 rake 对象** `{rateBps:100,cap:20,noFlopNoDrop:true}`（`L4`）做算法单测，`L9` 断言 `systemCollected===20` 等仍全绿——证明抽水/守恒实现稳定，变的只是 registry 默认值。
7. **探针自身即旧基线快照**：文件名 `probe_4_0_12_economy.mjs` 说明它是 4.0.12 期产物，断言名 `no twenty cap` 指相对更早的 `cap:20`（见 `probe_texas_fees.mjs:4`）去掉封顶后能收满 1% 的 200。

### 3.2 为什么不是 A（真产品缺陷）

- 0.5% 是三方案各 10000 手对比后**明确选定**的新默认，有设计文档、UI 文案、迁移白名单、新探针四重佐证，不是手滑数值。
- 全部费率档位 `conservation` 均为 `PASS`（见 §3.4 诊断），不存在「数值或逻辑错」。
- 若强行把产品默认改回 1% 去凑 `===200`，会同时打翻 `probe_texas_rules.mjs:40`、`:62` 的 `'current'` 模型、`texas.html:3276` 文案、`csh_migrate.js` 白名单语义与 2026-10-28 设计决策——没有证据支持这种回退。

### 3.3 为什么不是 C（探针夹具坏）

- VM 正确加载 `csh_registry.js` + `csh_pots.js`，`settle()` 正常返回 `systemCollected=100` / `conservation='PASS'`；
- stdout 为纯 JSON、`exitCode` 按 `failed` 正确置 1；夹具齐全、无缺失文件、无环境依赖（对比 B9 的 `probe_minigame_active.mjs` 缺 `index.html` 才是 C）。
- 事实是「断言写死了旧基线的数字」，不是「跑不起来」。

### 3.4 独立诊断 + 「先失败后通过」反例（硬证据）

只读脚本 `outputs/wb-public/parallel-b4/diag_economy.mjs`（独立 VM 复算，不依赖探针 harness），
输出 `runs/diag.stdout`。对同一 20000 底池：

| 费率来源 | `rateBps` | `systemCollected` | `conservation` | 旧断言 `===200` |
| --- | --- | --- | --- | --- |
| 当前默认 `texasRake()` | 50 | **100** | PASS | **false ← 改前 15/1 的根因** |
| 旧 1% 用户配置 `texasRake('100')` | 100 | **200** | PASS | **true ← 反例：旧断言在旧费率下仍成立** |
| 显式关闭 `texasRake('0')` | 0 | 0 | PASS | false |
| 显式 2% `texasRake('200')` | 200 | 400 | PASS | false |

即：`200` 不是「产品算错」，而是「旧 1% 基线下的正确值」；产品把默认切到 0.5% 后它变成 100。
这一对 `false/true` 就是「先失败后通过」的反例证据链，也把 B9 遗留的「100 是否预期」
裁决为：**预期，且是 2026-10-28 方案 B 的明确设计值**。

---

## 四、改了什么（仅探针；断言强度只增不减）

**未改任何产品源码**：`core/csh_registry.js`、`core/csh_pots.js`、`core/csh_migrate.js`、
`games/texas/texas.html` 一字未动。因此**不需要主线程重生成 catalog，也不因本轮改动触发完整门禁**。

### 4.1 第 11 行：1 条写死断言 → 8 条动态/语义断言

原断言仅 2 个条件（`systemCollected===200`、`conservation==='PASS'`）。新逻辑从产品公开 API
`R.texasRake()` / `P.settle()` 动态取值，**零写死费率**，期望值统一由
`expected = floor(pot × rateBps / 10000)`（`pot` 由 `players[].contrib` 动态求和）复算：

| # | 新断言 | 语义 |
| --- | --- | --- |
| 1 | `registry default rake read dynamically: fee equals its published rate with no hidden cap` | `systemCollected===expected` + `cap==null 或 cap>=expected` + `conservation==='PASS'`（金额断言升级为动态；原 conservation 保留） |
| 2 | `no twenty cap: proportional fee above the old 20 ceiling is not truncated` | `expected<=20 \|\| systemCollected>20`：把断言名里隐含的「无 20 封顶」变成显式不变式；**若产品偷偷加回 cap=20，本条会红** |
| 3 | `default settlement conserves funds ...` | 新增守恒双路互证：`gained+collected===potTotal`、`nets+collected===0`、`potTotal===pot` |
| 4–7 | `registry rate tier 0/50/100/200 bps ...` | 遍历 `csh_migrate.js:1050` 的合法档位白名单，逐档验证 `texasRake(v).rateBps===v && cap==null`、实收按比例无截断、守恒 PASS（覆盖率大增） |
| 8 | `legacy 1% user preference (string config) still reproduces the pre-V2 fee` | 走真实用户配置路径 `texasRake('100')`（字符串入参，对应 `csh_shell.js:815`），验证旧基线金额仍可复现 |

**「只增不减」论证**：
- 原 `conservation==='PASS'` 从第 1 条到每一档位**反复保留**；
- 原金额断言 `===200` 的字面值被移除，但它表达的「旧 1% 基线金额」语义**没有删除**，而是被**纠正到正确位置**（第 8 条「显式旧偏好」）继续验证；当前默认的金额正确性由第 1/4–7 条以更强、更动态的方式覆盖；
- 新增 no-cap 不变式、守恒双路互证、4 档位遍历、registry 费率契约；
- check 总数 **16 → 23**（+7），passed **15 → 23**，failed **1 → 0**；无任何断言被删、无任何门槛被降低。

### 4.2 第 13 行：补 `--out` 与 stdout 纯 JSON 契约

```js
const result={scope:'...; registry rake baseline read dynamically (no hard-coded 200)',
              passed:...,failed:...,failures:...,rows};       // rows = 每条 check 明细
const oi=process.argv.indexOf('--out');
if(oi>=0&&process.argv[oi+1]){const out=process.argv[oi+1];
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,JSON.stringify(result,null,2));}      // --out 写完整结果（含 rows）
console.log(JSON.stringify({scope,passed,failed,failures},null,2)); // stdout 恒为纯 JSON 汇总
if(result.failed)process.exitCode=1;                          // exit 按 failed 设定
```

契约：`--out <结果文件 JSON 路径>` **可选**（不传也能跑，保持向后兼容）；stdout 恒为纯 JSON
`{scope,passed,failed,failures}`，与 `runProbeJson`（`check.js:73` 严格 `JSON.parse(stdout)`、只看 `failed`）匹配；
`--out` 文件是含 `rows` 明细的完整结果，便于失败时定位到具体断言名。

---

## 五、改动文件清单 / 禁区合规

**仓库内改动（本子代理，仅 2 个）：**

- 改：`tools/probe_4_0_12_economy.mjs`（§四；`git diff --stat` = `1 file changed, 18 insertions(+), 2 deletions(-)`）
- 新增：`docs/audit/WORKBUDDY_B10_ECONOMY_BASELINE_20261106.md`（本报告）

**产物（仓库外 `workbuddy/outputs/wb-public/parallel-b4/`，不在仓库内）：**
`diag_economy.mjs`；
`runs/before.stdout` / `before.stderr`（改前原始位置实跑证据）、`runs/probe_before.mjs`（改前代码快照）、
`runs/probe_before.stdout` / `.stderr`（备份复跑留档）、`runs/diag.stdout` / `diag.stderr`（诊断/反例）、
`runs/after-run1.stdout` / `.stderr`、`runs/after-run2.json`（`--out` 产物）/ `.stdout` / `.stderr`、
`runs/after-run3.stdout` / `.stderr`。

**合规复核（实跑）：**

- `git status --short` 仅 ` M tools/probe_4_0_12_economy.mjs`；`git diff --stat` 仅该文件。
- `4.0.16` 出现次数与改前一致：`extension.js` 2、`info.json` 2、`package.js` 1、`README.md` 2，一字未动。
- 未碰：`core/csh_update.js`、任何 `core/` 产品源码、`tools/check.js`（仅只读 L60–88）、
  `tools/check_update_suite.mjs`、`tools/release.js`、`catalog.js`、`AGENTS.md`、
  `docs/audit/CURRENT_WORK.md`、`README.md`、前几轮已改的所有 `probe_*` 与报告。
- 未 `git add/commit/push`、未切分支 / reset / clean、未改 git 配置、未跑 `node tools/check.js` 完整门禁、
  未运行生成模式的 `node tools/release.js`、未发远端请求、未递归删除临时目录。

---

## 六、验证数字

| 项 | 命令 / 证据 | 结果 |
| --- | --- | --- |
| 改前（原位置实跑） | `node tools/probe_4_0_12_economy.mjs` → `runs/before.stdout` | **exit=1 / 15 passed / 1 failed** |
| 改前失败根因 | `runs/diag.stdout` 当前默认档 `oldProbeAssertion_systemCollectedEquals200=false` | 100 ≠ 200 |
| 反例 | `runs/diag.stdout` 旧 1% 档 `=true`（systemCollected=200） | 旧断言在旧费率下仍成立 |
| `node --check` | `node --check tools/probe_4_0_12_economy.mjs` | **SYNTAX OK** |
| 改后 run1（不带 `--out`） | `runs/after-run1.stdout` | **exit=0 / 23 / 0**，stderr 空 |
| 改后 run2（带 `--out`） | `runs/after-run2.stdout` + `after-run2.json` | **exit=0 / 23 / 0**；文件纯 JSON、`rows` 23 条全 PASS |
| 改后 run3（不带 `--out`） | `runs/after-run3.stdout` | **exit=0 / 23 / 0**，stderr 空 |
| JSON 契约 | Python `json.loads` 三个 stdout + `--out` 文件 | 4/4 解析成功，`failed=0` |
| `runProbeJson` 契约 | 只读 `tools/check.js:66-88` | stdout 有 `failed`/`passed` 数字字段，匹配 |
| 版本号 | `grep -c 4\.0\.16` 四文件 | 2/2/1/2，与改前一致 |

复现命令：

```bash
export TEMP="D:/CodexWork/chizi-mojiang/workbuddy/temp" TMP="$TEMP"
cd "D:/CodexWork/chizi-mojiang/workbuddy/ext/app/extension/池子魔将"
node tools/probe_4_0_12_economy.mjs                                   # 23/0
node tools/probe_4_0_12_economy.mjs --out <某目录>/economy.json      # 23/0 + 结果文件
```

---

## 七、建议注册行（本轮**不改** `tools/check.js`，主线程统一接入）

`runProbeJson(script,args,{timeout})` 严格 `JSON.parse(stdout)`、只看 `failed`/`passed`（`check.js:66-88`）。
本探针 stdout 已是纯 JSON、不需 `--out`、VM 隔离秒级、3 轮稳定 23/0，可直接注册。
`min passed` 取 3 轮实测稳定值 **23**。

```js
// 4.0.12 经济/抽水基线（23/0；B10 修：写死 200 → 读 registry 动态费率 + 多档位/守恒/no-cap 语义断言）
const rB10_econ = runProbeJson('probe_4_0_12_economy.mjs', [], {timeout:20000});
if(rB10_econ.failed!==0||rB10_econ.passed<23) eB10.push('4.0.12 经济/抽水基线回归未通过');
```

若主线程希望同时留档 `--out` 明细（`tmpB10` 按 `check.js` 既有写法构造在 D 盘）：

```js
const rB10_econ = runProbeJson('probe_4_0_12_economy.mjs', ['--out', path.join(tmpB10,'economy-baseline.json')], {timeout:20000});
if(rB10_econ.failed!==0||rB10_econ.passed<23) eB10.push('4.0.12 经济/抽水基线回归未通过');
```

> 该探针原先在 B9 差集内（B9 §一 清单第 1 个），已复核 `check.js` / `check_update_suite.mjs`
> 均无 `probe_4_0_12_economy` 引用（无重复注册风险）。B9 §六.5 曾「不给注册行」，理由是
> 「产品/基线变更未裁决」；本轮已裁决为 B 并修复，故改为**建议接入**，否则修了仍没人跑。
> 变量名 / 数组名按主线程既有命名习惯调整即可。

---

## 八、残余限制

- **动态断言绑定产品公开 API**：期望值随 `texasRake().rateBps` 与 `settle()` 真实行为自动跟随，
  这正是修复目的（下次再改默认费率不会再次变红）。但档位白名单 `[0,50,100,200]` 取自
  `csh_migrate.js:1050`；若产品将来改白名单，第 4–7 条的 `texasRake(v).rateBps===v` 会红并提示需同步探针——
  属预期的「随基线维护」，不是骗绿；第 4–7 条 `f.cap==null` 同时兜住「悄悄加回金额上限」。
- `no twenty cap` 不变式写成条件式（`expected<=20 || systemCollected>20`）：当按比例应收 ≤20 时
  vacuously true（不误判），但也不再能检验 cap；当前默认应收 100>20，该条实际生效。属设计取舍。
- **未改产品源码 → 不需要主线程重生成 catalog，也不因本轮改动触发完整门禁**；但注册行接入
  `check.js` 属于主线程操作，接入后仍需在目标环境自行复跑确认。
- 全绿判定基于本副本、D 盘 temp、隔离 VM / disposable store，不代表真机 WebView、
  Electron / Android 实体设备或完整宿主链路。
- 备份 `runs/probe_before.mjs` 因 `root` 相对探针文件位置，从 `outputs/` 直接 `node` 会
  `ERR_MODULE_NOT_FOUND: lib/skill_audit.mjs`（`runs/probe_before.stderr` 已留档）——**仅作改前代码快照**；
  改前失败证据以原始位置实跑的 `runs/before.stdout` 为准。
- B9 差集 164 个孤儿本轮只闭环这 1 个；其余未逐个复跑，不能断言全绿或全坏。
