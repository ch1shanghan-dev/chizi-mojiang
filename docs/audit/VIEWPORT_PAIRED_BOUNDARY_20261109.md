# P2 · 断点迁移真值纠偏：1199 / 599 是配对边界，不是待收敛旧值

2026-11-09。基线 `a58acf1`，版本 4.0.16。**本批不改任何 `@media` 数值。**

## 为什么先停下来

按手册 §8 D1 的要求，本批开工先重跑 `probe_viewport_migration_20261108.mjs`
重新扫描真值（不许拿旧账本当依据）。当前实测：

```
21 文件 / 93 处断点 / 40 高风险 / 28 expand / 12 shrink / 53 same
```

逐值清单里排在最前的两个「可收敛」家族是 `width:1199→1200`（3 处，3 文件）和
`height:599→640`（3 处，3 文件）。照迁移表直接改，会出事。

## 真问题：这两个值已经和 min-* 成对

| 边界 | 现存的配对规则 |
| --- | --- |
| `max-width:1199px` | `core/csh_journal.css:156` 的 `@media(min-width:1200px)`；`games/achv.html:228` 的 `matchMedia("(min-width:1200px) and (min-height:600px)")` |
| `max-height:599px` | 同一个 `matchMedia` 里的 `(min-height:600px)` |

`@media(max-width:1199px)` 与 `min-width:1200px` 本来就是 **1200 档位的正确写法**——
两者把整数像素严格切成 `≤1199` / `≥1200`，没有空洞也没有重叠。

迁移表却把 1199 判成 `expand→1200`。真把 CSS 改成 `max-width:1200px`，
**恰好 1200px 会同时命中两套规则**。同理把 `max-height:599px` 改成 640，
600–639px 会同时命中 `max-height:640` 和 `matchMedia` 的 `min-height:600px`。

这和 I1（2026-11-08）那次 blackjack `min-height:430` 配对漏改是同一类事故：
只看 `max-*`，漏看配对的 `min-*` 和脚本 `matchMedia`。

## 改了什么

`core/csh_viewport.js`：

- `MIGRATIONS.height[599]`：`640` → `599`（same / low）
- `MIGRATIONS.width[1199]`：`1200` → `1199`（same / low）
- 新增并导出 `PAIRED = { height:[599], width:[1199] }`，
  `migrationOf()` 返回 `paired` 标记
- 注释写清这两个值为什么**不需要**迁移，以及机械收敛前必须检查什么

`tools/probe_viewport_migration_20261108.mjs`（门禁 E95AD）：

- 「目标都在 TARGETS 内」改为：非配对行必须在集合内，**配对行必须保持自身且 same/low**
- 「to 单调不逆序」排除配对行（它们不是迁移目标，不参与机械推导）
- 新增 5 条断言：PAIRED 表冻结、两个值判为 same/low、静态接线里
  `min-width:1200px` / `min-height:600px` 确实存在、改前基线（放宽 599）能被自检检出
- 改前基线自检的锚点同步更新
- E95AD 39 → **44/0**

重扫后风险账：

```
40 高风险 → 34      expand 28 → 22      same 53 → 59      总处数 93 不变
```

少掉的 6 处不是「改好了」，是**本来就不该被算成待办**。

## 验证

| 项 | 结果 |
| --- | --- |
| E95AD | **44/0** |
| E95X 横屏令牌 | **39/0** |
| 整仓 `check.js` | **exit=0** |
| `release --check` / 提交级字节 | 0 不符 / 1044 文件 0 错 |

证据：`D:/CodexWork/chizi-mojiang/work/viewport-20261109/migration2.json`（含逐页清单）
与 `gate.log`。

## 本批没做，以及下一批该怎么做

**没有动任何 CSS。** 没有复现截图就改 `@media` 数值，正是手册 §8 明确禁止的。

下一批做真正收敛时，按以下顺序：

1. 从重扫后的 34 处高风险里挑**一个家族**（建议 `height:340→330`，5 处且集中在 1 个文件，
   是收窄，影响面最小）
2. 先查同值跨页、配对 `min-*`、脚本 `matchMedia`、宿主缩放与兜底层
3. 补变化区间内的真实横屏视口（例如 340 家族要测 331–350 之间的高度）
4. 改前 / 改后各截同一组视口，几何比对，零溢出、按钮首屏可达才算过
5. 同步 E95X 基线与 E95AD 扫描结果，别拿旧数量当真值
