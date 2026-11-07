# F2：Alert 报错防御 + 图鉴信息层级第一批（2026-11-08）

作者纠正方向：**「高级审美」指 UI / 界面 / 互动设计，人物图像不用 WorkBuddy 操心；桌面包不用管；Alert 报错修好；继续推进。**
本轮一度误入「生成装扮人物插画」，三张生成图与错误设计文档**全部撤回、未进入仓库**，方案里 6 处基于错误理解的改动已 `git restore` 回滚。
重新查交接主文档 §7 与 `FOLLOWUP_PLAN §3`、`PLAYER_FEEDBACK_REDESIGN §5.2/PF-08` 后，按界面与互动方向落地两件。

版本仍 **4.0.16**、未推送、未合并 main、未发版；真机验收归作者 U5。

---

## 一、Alert 报错：从代码侧掐断「宿主弹源码上下文」

`@image` 截图里的原生 Alert 显示的是 `core/csh_achievement_feedback.js` 带行号的源码。
项目里没有代码会拼这种文本（全仓只有两处短文本 `alert` 兜底），所以判断为**脚本执行抛错时宿主显示出错文件源码**。
查真实源码找到可复现的无保护路径：

- `createAchievementFeedback()` 里 `archive=readArchive();renderInbox();` 是裸调用。
  `readArchive()` 自己有 try/catch，但 `renderInbox()` 会 `style()` / `createElement` /
  `documentElement.appendChild`，DOM 或存储异常会一路冒到宿主。
- 四个页面事件回调（`keydown` / `visibilitychange` / `pagehide` / `pageshow`）与
  `guarding()` 的 350ms 定时器回调同样没有边界。
- `core/csh_uikit.js` 的 `achievementUI()` 构造无 try/catch；
  `achievementState` / `achievementHold` / `achievementSkip` 三个出口也没包 try。

### 修复（双层，纯表现层降级）

1. `core/csh_achievement_feedback.js` 增 `report / safely / safeHandler`：
   - 初始化改 `bootArchive()`，损坏存档给可读提示、DOM 异常降级为空归档并移除半成品入口；
   - 四个事件回调与 `guarding` 定时器统一包装；
   - **公开方法统一 `guarded` 包装**，异常时返回同类型安全值
     （`archiveStatus` 仍返回对象、`show` 返回 0、`setPreferences` 返回 `{ok:false}` 等），
     正常路径行为一行不变。
   - 全程不弹原生 `alert`，不写奖励/成就进度。
2. `core/csh_uikit.js`：`achievementUI()` 用 try/catch 包住构造，失败返回 `inertAchievementUI()`
   （形状与真实实现一致的安全空表现层）；另三个出口补兜底。

`main/config.js` 的 `notice()` 仍是短文本 `window.alert` 兜底，不生成源码，未改。

### 反例

`tools/probe_feedback_error_boundary_20261108.mjs`：真实模块在隔离 VM 里，
注入 **15 类故障**（getItem / setItem / removeItem / createElement / createElementNS /
getElementById / appendChild / addEventListener / removeEventListener / matchMedia /
setTimeout / scope / sound / hidden 读取等）与 **7 类损坏存档**，逐类调用全部公开方法、
触发事件回调与定时器。

- **125/0 ×2**；改前基线（去掉 `bootArchive` 与 `guarded` 包装）在同一 DOM 异常场景下确实抛错，被检出。
- 断言「零原生 alert」「返回值形状正确」「原型未被污染」「结构合法不误报损坏」。
- 回归：既有 Chromium 归档探针 **18/0**、互动两套 0 失败。

三条中途红灯都是探针夹具：`scope()` 每次返回新 owner 造成无限递归、把结构合法的脏数据误判损坏、
`show()` 重写了预置存档。都修在探针侧，产品未放水。

注册门禁 **E95AA**（min 125）。

---

## 二、PF-08 第一批：图鉴人物整页信息层级

依据 `PLAYER_FEEDBACK_REDESIGN_20261104.md §5.2`：左紧凑名录、当前关系与可行动项直接可读、
完整经历按需展开、不把低频内容堆在立绘下形成超长页面；
`FOLLOWUP_PLAN §3.2`：艺术品质靠构图、字阶、材质、留白，不堆金边发光；
`art-direction §4.6`：材质只走 `border/background/box-shadow`，不碰布局尺寸。

`games/codex.html` 落地：

| 改动 | 内容 |
| --- | --- |
| 名录搜索 | `#codex-roster-search`（44px、可见焦点、sr-only 标签），`applyRosterFilter()` 只按 `.gname` 过滤可见行；**不重排 `Data.items`、不改选中索引、不写存档**；`renderList()` 重建后重新应用过滤；无匹配给空态 |
| 当前关系摘要 | `#bond-brief` 一行：阶段 · 档位 · 距下一阶 / 羁绊圆满 · 可行动项 · 简明成本（`AFF.gifts` 唯一真值），随 `renderAff()` 的所有好感重绘路径刷新，纯 `textContent` |
| 低频内容收纳 | 「共同经历与回响」收进 `<details>`（保留 `#dlines` id），人物小传 / 增益 / 讨伐记录仍是各自折叠区 |
| 材质 | 一条渐隐金线 + 极淡内高光 + 1px 弱描边，无发光、无动效、无 `!important` |
| 矮屏 | `@media(max-height:340px)` 收起摘要，**复用既有断点值，不新增任何 `@media` 数值** |

### 反例

`tools/probe_codex_hierarchy_20261108.mjs`：AST 抽真实三个函数在最小 DOM 里跑。
断言搜索的中英文/大小写/子串/空态/清空恢复/不重排/零写入，摘要的五档位、满档、
缺数据降级、XSS 纯文本、零钱包零桥、不含调试信息，以及材质与断点约束
（断点集合直接解析 E95X 的 `BASELINE`，确保 24 种白名单不被撑开）。

- **39/0 ×2**，3 处改前基线（不过滤 / 去掉重建接线 / 去掉矮屏收起）都能被检出。
- 回归：F1 图鉴增益 **35/0**、图鉴选择 **60/0**、装扮浏览器探针 **55/0**。

注册门禁 **E95AB**（min 39）。

---

## 三、验证汇总

| 项目 | 结果 |
| --- | --- |
| 新专项 | E95AA **125/0 ×2**、E95AB **39/0 ×2** |
| 完整 `node tools/check.js` | **exit=0 / FAIL 0 / RETRY 0**（E95A–Z + AA/AB 共 28 项）；2 项历史已知告警 |
| 发布字节 | 生成前 `--check` 如实报 `mismatchCount:3`；重生成后 1042 文件 0 不符 |
| 注册自检 | 3/0 |
| 一键更新套件 `--rev HEAD` | **15/0** |
| 慢速通道（改动后整条） | **8/0 一次性跑完**（11m6s，无超时）：78 / 142 / 29 / 80 / 92 / 33 / 69 / 108 全部 0 失败，无 `docs/audit/ui/` 基线污染 |
| 提交级 `--rev HEAD` | 0 错（本轮提交后单独复核，见最终回复） |

---

## 四、明确未做 / 剩余顺序

本轮**只做界面与互动**，没有生成或替换任何人物图像、装扮素材、立绘。

仍按上轮清单推进，顺序不变：

1. 跨页断点逐值收敛（24 种 → 四档令牌，须按 §4.4 逐页比三横屏 + 1.5 缩放基线截图；本轮只复用既有 340 值，未动数值）。
2. PF-08 剩余：主入口「相处 / 共同行动 / 记忆 / 档案」、右侧独立关系栏、未相识线索不剧透；
   本轮只完成名录搜索 + 摘要 + 低频收纳，不冒充整页改造完成。
3. PF-03 / §3.3 助战牌桌呈现（常驻 1~3 图标、短横向抽屉、被动触发合并、额度耗尽收起）。
4. 事件与关系回应扩展、动效语汇 A3、牌面 A4、同档字号并档、官阶短颁授。
5. 音效与托管整体提升、房间跨进程恢复、非牌桌软保存、国内服务只读核实。

**归作者 / 不做**：真机 U5、桌面 4.0.15 包（作者明确不用管）、人物立绘与装扮实体素材、
皮肤/音效主观听感、SLG×GAL、武将技能平衡与已暂停 AI。
S4 六类效果仍是隔离验证，不是真实引擎事件循环验收。
