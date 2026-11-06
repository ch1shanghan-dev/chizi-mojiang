# B13 · 门禁注册自检（防止「修好了又没人跑」，2026-11-06）

## 触发

前五轮反复出现同一种事故：**探针坏了几个月没人发现，因为没有任何验证入口引用它**。
`probe_first_batch` HARNESS_ERROR、`probe_career_achievements` 固化扩容前 493、
`probe_career_source` 指向旧安装 493、`probe_task_definitions` 缺改前基线——全是同一个根因。

E95 注册区把关键专项接进了门禁，但**注册行本身也会失效**：文件被删、改名、
或者新探针只写进 suite 没写进 `check.js`，照样没人发现。需要一个守注册表的东西。

## 做法：`tools/check_probe_registry.mjs`

只读分析，不写业务文件。三种硬检查：

1. 枚举 `tools/probe_*.mjs`，从 `tools/check.js` 与 `tools/check_update_suite.mjs`
   全文提取被引用的探针名；**引用到的每个名字必须真的存在对应文件**（防注册行指空）。
2. 两个入口都必须存在且各自至少引用一个探针。
3. `check.js` 必须仍覆盖前几轮救回来的 6 个关键专项（B6/B7/B8/B9/B10 的产物），
   防止有人「清理旧探针」时把刚接上的又删掉。

**差集只报告、不判失败。** 当前真实仓库：232 个 `probe_*.mjs`、76 个已注册、
156 个孤儿、0 个悬空注册（这是 B13 落地当时只统计 `check.js` + `check_update_suite.mjs` 两个入口的数字）。
B14 建立慢速通道后，`tools/check_slow_suite.mjs` 已作为**第三个入口**纳入同一个自检，
实时数字变为 232 / 85 已注册 / 147 孤儿 / 0 悬空——**以脚本实时输出为准，不要引用本文的旧数字**。
`ext/app/index.html`，起不来属环境限制。拿差集当失败只会天天误报，那是另一种噪音。
真正致命的是「注册行指向不存在的文件」，那会让门禁静默少跑一整套检查。

`--self-test` 在隔离假仓库里构造反例，**5/0**：

| 断言 | 结果 |
| --- | --- |
| 注册行指向被删的探针 → 报 missing 且 `ok=false` | PASS |
| 把文件补回来 → 自检转绿 | PASS |
| 存在孤儿探针时只计数、不误判失败 | PASS |
| suite 独有的探针也被算进注册表（不能只看 check.js） | PASS |
| 真实仓库无悬空注册 | PASS |

真实仓库普通模式 **3/0**，规模信息进 `--out` 的 JSON，stdout 保持纯 JSON 供 `runProbeJson` 读。

## 本轮注册区扩展

| 标签 | 专项 | 数字 |
| --- | --- | --- |
| E95J | `probe_task_definitions.mjs`（B11，自洽基线 2000 条） | 48/0 |
| E95K | `probe_texas_rules.mjs`（B9 遗留，`--out` 须为结果文件） | 33/0 |
| E95L | `check_probe_registry.mjs --self-test` | 5/0 |
| E95M | `check_probe_registry.mjs` 真实仓库 | 3/0 |
| E95N | `probe_first_batch.mjs`（B12 统一 JSON 契约后） | 56/0 |
| E95O | `probe_career_achievements.mjs`（B12，Chromium 约 54s） | 142/0 |

E95O 显式给 `timeout: 200000`。B9 早就指出它有 142/0 但 stdout 是文本汇总、
且 `probe_achievement_quality.mjs` 要 118–166s；把快探针塞进 20s 默认超时会被误杀，
慢的留给独立通道。这是对既有证据的尊重，不是新发现。

## 明确未做

- `probe_achievement_quality.mjs`（78/0，118–166s）**没有**塞进快速门禁，走独立慢速通道更合适。
- `*_host.mjs` 系列仍是环境限制，未逐个实跑、未冒充通过。
- 156 个孤儿没有强行全部注册——里面有大量一次性诊断脚本与历史基线探针，
  全接进去只会把门禁拖到十几分钟。清单在 B9 报告里，按价值逐个补。
- 没改版本号，没推送、没合并 main、没发版。
