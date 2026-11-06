# B15 · `probe_world_entry` 92/12 真红灯的定位与修复（2026-11-06）

## 触发

B14 建立慢速验证通道时清点 22 个候选，发现 `tools/probe_world_entry.mjs`
实跑 **exit=1 / 92 passed / 12 failed / 49s**，浏览器正常起、stderr 空，
不是环境限制。12 条失败是 3 条断言 × 4 个 viewport：

- `Shift+Tab wraps to last playable entry`
- `Tab wraps to first world control`
- `all task groups survive refresh`

B14 如实排除、没有冒充通过。本轮查清并修掉。

## 结论：全是探针夹具过时，**不是产品缺陷**

### 1. 焦点首尾元素写死了旧 DOM

探针原来写：

```js
const first=panel.querySelector('#csh-dbg-bgm-rd'),
      last=cards.filter(b=>!b.disabled).at(-1);
```

但产品 `core/csh_debug.js:6699-6705` 用的是**所有可聚焦且可见元素的首尾**：

```js
var stops = Array.from(panel.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]'))
    .filter(node => !node.disabled && node.getClientRects().length);
var first = stops[0] || close, last = stops[stops.length - 1] || close;
```

世界视图重排后首尾已不是 BGM radio 和最后一个 gamebtn，于是环绕明明生效、断言却全假红。

修法：探针改用**与产品完全相同的 stops 选择器**，并**新增**一条
`focus ring has distinct reachable first and last controls`（首尾存在、不同、stops>2）。
断言强度只增不减：原来只验证两个特定元素，现在验证真实首尾 + 环绕 + 可达性。

### 2. `.csh-world-section` 根本没生成 —— 夹具漏加载模块

探针的 `modules` 只加载 `csh_theme / csh_uikit / csh_registry / csh_games` 四个文件，
**没有 `core/csh_world_view.js`**。而 `.csh-world-section` 分组标题正是它生成的
（`csh_world_view.js:228/313`），`csh_debug.js:3645` 也只在 `window.CSHWorldView` 存在时才 mount。

诊断出的真实数字：`beforeSections=0, afterSections=0, beforeCards=11, afterCards=11`。
即刷新**没有丢任何组**，只是容器压根没被渲染出来。原断言写死 `length===2 && ===11`，
把「夹具缺模块」误判成「产品刷新丢组」。

修法：
- `modules` 补上 `core/csh_world_view.js`（与 `probe_panel_window.mjs` 同款清单对齐）；
- 刷新存活断言改成**刷新前记基线、刷新后逐个相等**，并额外要求基线非零——
  防止 `0===0` 的假绿。

### 3. 诊断过程中顺手修的

内层 `check(name, passed)` 丢掉了 `detail`，导致失败项看不到诊断值。改成三参数，
诊断信息进失败记录。这不改变任何判定。

## 验证

| 阶段 | 结果 |
| --- | --- |
| 改前（B14 一手证据 + 本轮复跑） | **92 / 12**，exit=1 |
| 只修焦点环绕后 | 104 / 4（焦点 8 条归零，刷新存活仍红） |
| 补加载 `csh_world_view.js` + 动态基线后 | **108 / 0**，exit=0 |
| 慢速通道 `--only probe_world_entry.mjs` | **108 / 0**，42.1s，`via: json`，通道判 pass |

`node --check` 通过。实跑全部显式 `--out` 到 D 盘，没有覆盖仓库内
`docs/audit/ui/world-entry/` 的截图基线。

修好后重新纳入 `tools/check_slow_suite.mjs` 的 `SPEC`（第 8 项，`out:'dir'`、`timeout:180000`）。
B14 报告里「排除：真实断言失败」是当时的事实，保留不改，本文件是后续结论。

## 明确未做与残余限制

- **没有改任何产品源码**。焦点环绕逻辑本来就是对的。
- 探针**默认 `--out` 仍指向仓库内 `docs/audit/ui/world-entry/`**。这轮没改默认契约，
  但所有实跑都显式传了 D 盘目录；以后跑它必须带 `--out`，否则会覆盖界面基线截图。
- `*_host.mjs` 系列仍因缺 `ext/app/index.html` 起不来，未纳入慢速通道、未冒充通过。
- `probe_achievement_quality.mjs` 等 7 个慢探针本轮未重跑整条通道（B14 已跑两轮 7/0），
  只验证了新增项能被通道正确接住。
- 版本仍 4.0.16 未改；未推送、未合并 main、未发版。
