# P2 · height:340 → 330 逐值收敛（含可复用几何夹具）

2026-11-09。基线 `7bae35f`，版本 4.0.16。
承接 `VIEWPORT_PAIRED_BOUNDARY_20261109.md`：先补夹具，再改 CSS。

## 先补夹具

I1（2026-11-08）那次用的是一次性 D 盘 Chromium 夹具，没进仓库，之后每批收敛都在裸改。
本批新增 **`tools/probe_viewport_340_convergence_20261109.mjs`**，复用已提交的
`tools/lib/chromium_audit.mjs` 的 `withChromium()`：

- 夹具加载的是 `games/codex.html` 里**真实的 `<style>` 块**，不是复制出来的假 CSS
- 5 个横屏视口：`640×286`、`915×412`、`1365×768`、`915×335`（331–340 变化区间）、`915×330`（边界）
- 每个视口测：横向溢出、`#bond-brief` / `.dnav` 显示、`skin-panel` padding、主按钮 44px 且首屏可见
- 改前实测几何冻结成内嵌 `BASELINE`，日常门禁直接跑，不依赖外部旧文件
- 新增门禁 **E95AJ（17/0，实测 13s）**

## 改前 / 改后几何

| 视口 | 改前 | 改后 | 结论 |
| --- | --- | --- | --- |
| 640×286 | `none/none/10px` | `none/none/10px` | 完全一致（低于 330，紧凑规则仍生效） |
| 915×412 | `flex/flex/14px` | `flex/flex/14px` | 完全一致 |
| 1365×768 | `flex/flex/14px` | `flex/flex/14px` | 完全一致 |
| 915×330 | `none/none/10px` | `none/none/10px` | 完全一致（边界仍紧凑） |
| **915×335** | `none/none/10px` | **`flex/flex/14px`** | **本次唯一预期变化**：331–340 不再套用 330 档紧凑规则 |

五个视口全部：零横向溢出、主按钮 ≥44px 且首屏可见。
证据 `D:/CodexWork/chizi-mojiang/work/viewport-20261109/{before340b,after340}.json`。

## 改了什么

`games/codex.html` 里 `max-height:340px` → `330px`，**5 处一起改**：

- 3 条 CSS：`#codex-skin-dialog .skin-panel/.skin-body`、`#bond-brief`、`.dnav`
- 2 条 JS `matchMedia`：`compact`（761 行）、`compactSections`（1422 行）

CSS 与脚本必须同步，否则 JS 判 compact 而 CSS 不判（或反过来）。
E95AJ 有静态断言锁住「3 条 CSS + 2 条 matchMedia 一起收敛」。

## 同步的门禁口径

| 门禁 | 变化 |
| --- | --- |
| E95X 视口令牌 | BASELINE 22 → **21 种**（移除已收敛的 340），39/0 |
| E95AD 迁移真值 | height 14 → 13、union 22 → 21、基线 22 → 21，44/0 |
| E95AB 图鉴层级 | 硬编码的 `340px` 断言同步为 `330px`（含改前基线锚点），39/0 |
| E95AG 分区导航 | 同上，并把 `3(?!40)` 负向断言改成 `3(?!30)`，22/0 |
| E95AJ 新增 | 17/0 |

第一次跑整仓门禁在 E95AB 判红——两支图鉴探针把「复用既有 340px 断点」写死在断言里。
这是逐值收敛必须做的对账：**改 CSS 只是其中一步，所有引用该数值的断言和规范都要跟着走**。

风险账收敛后：`highRisk 34 → 29`、`same 59 → 64`，总处数 93 不变。

## 验证

整仓 `node tools/check.js` **exit=0**（2 项既有告警）；
E95X 39/0、E95AD 44/0、E95AB 39/0、E95AG 22/0、E95AJ 17/0；
`release --check` 0 不符；catalog 提交级字节 0 错。

## 边界

- 夹具用的是真实 `<style>` + 代表性骨架，**不是完整无名杀宿主**。宿主缩放、第三方 UI
  皮肤、真机触控仍需作者实机看。
- 只处理了 340 这一个家族。剩余 29 处高风险按手册 §8 逐值推进，每批都要重扫真值、
  查配对 `min-*` / `matchMedia`、补变化区间视口。
