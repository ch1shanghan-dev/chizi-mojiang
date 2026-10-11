# 池子魔将 · 外部项目深读技术方案（v1.0 · 2026-10-07）

> 本文 = 五个仓库源码级深读的结论 + 全部落地的技术设计。
> 深读方式：jsdelivr 镜像拉源码逐行读（方法论见 §0）；每个方案给「设计 / 涉及文件 / 验收 / 工作量 / 排期」。
> 排期标记：🔥 本周可做 · ⚙ 需立项（M1~M4 映射见 README §7）。

---

## 0. 深读档案（读了什么、读到了什么）

### 0.1 joonspk-research/generative_agents（斯坦福 Smallville）✅ 已消化并部分落地
- **retrieve.py:247 检索公式**：`score = recency_w·recency·0.5 + relevance_w·relevance·3 + importance_w·importance·2`（生产权重 gw=[0.5,3,2]，**相关性 > 重要度 > 新近度**）；recency = `recency_decay^i`（按记忆新旧指数衰减，i=第几条新记忆）。
- **importance**：原版 LLM 打 1~10 分；idle 事件恒为 1。
- **reflect.py**：触发 = 新事件 importance 累计 ≥ 阈值（经典值 150）→ 从最近 N 条记忆生成 3 个**焦点问题** → 按焦点检索 → 生成**洞察（thought）+ 证据（evidence 节点引用）** → 洞察作为新记忆回写（带自己的重要度与 30 天过期）。
- **已落地**（轮次二十七）：csh_interact 的 memHit 触发升级为三因子归一映射 [0.2, 0.62]；importance 本地化为固定表（killed 10 / saved 8 / hit 3 / hitBack 2）；isNemesis(≥3) = 粗粒度反思。

### 0.2 MrHakan/WorldForge ✅ 已消化
- 架构宣言：**"one causal simulation rather than a collection of disconnected generators"**——地理→资源→市场→制度→人口→稳定→外交→战争的单一因果模拟。
- 工程：**确定性**（同种子同结果，GitHub Pages 纯客户端）、**epoch rebasing + deep-history compaction**（纪元重定基 + 深历史压缩，长跑不爆档）、模拟引擎与 UI 完全解耦。
- 版本史即路线图模板：v0.1 地形 → v0.2 历史 → v0.3 社会 → … 每版一个因果层。

### 0.3 goldfire/pokersolver ✅ 已 vendor 并对拍
- 结构：**策略模式注册表**——每个牌型一个类（HighCard→…→RoyalFlush），`Hand.solve` 沿注册表逐个试 qualify（`new hands[i](cards, game, canDisqualify)`）；`Hand.winners([h1,h2])` 支持平分。
- 扩展点：变体玩法（短牌/奥马哈）= 注册新类，不动求解器。

### 0.4 Aya1302/playing-cards-game ⚠ 降级
- 实为 Django 托管项目，CSS 深读性价比不足。牌面视觉改用：ui-panel-cookbook §5 既有配方 + [card-ui topic](https://github.com/topics/card-ui) 组件模式（3D 翻转/辉光描边/动效渐变）。

### 0.5 possibly-wrong/blackjack ✅ 已消化
- 基本策略表 = f(规则变体) 的纯计算器（牌副数 / 庄家软 17 / 加倍规则 → 全表 + 庄家爆牌概率）。

---

## 1. 技术方案 T1：互动记忆流 v2（检索三因子 + 两级反思）🔥

**目标**：把 csh_interact 的"最近事件 + 计数"升级为 Smallville 完整记忆语义（本地规则化）。

**设计**：
1. **记忆节点**：pairEvent 升级为 `{kind, day, importance(按 §0.1 表), lastIdx}`；importance 表 = killed 10 / saved 8 / hit 3 / hitBack 2。
2. **三因子检索**（已落地，本轮）：`score = 0.5·recency + 3·relevance + 2·importance`，memW = score 归一映射 [0.2, 0.62]。
3. **两级反思**：
   - 一级（已有）：敌意事件 ≥3 → isNemesis 固化。
   - 二级（新增）：**importance 累计 ≥ 20**（替代计数——被救 2 次(16)与被砸 6 次(18)同样触发）→ 生成**印象结论**：`impressions[key] = {label, since}`，label ∈ {克星, 恩人, 老对手}；印象影响：memHit/memSaved 概率再 +0.1、开场白优先、终局发言引用印象。
4. **验收**：simulate 扩 3 断言（importance 累计触发反思 / 印象影响选词 / 一局一清）；实机 = 连续交互观察话术升级。
5. **工作量**：~1.5 小时；涉及 `core/csh_interact.js`（recordEvent/statOf/fire 三处）+ `tools/simulate_world.js`（断言）。

## 2. 技术方案 T2：csh_theme 三层 token 架构 🔥

**目标**：单层 CSS 变量 → primitive（原料：色板/字号阶）→ semantic（语义：`--csh-bg`/`--csh-good`）→ component（组件：`--csh-panel-pad`）三层，为资料卡双风格 / 未来商店皮肤打地基。

**设计**：`csh_theme.js` 注入时先声明 primitive 层（`:root` 色板常量），semantic 层 `var()` 引用 primitive，现有消费方（semantic 名）**零改动**；资料卡双风格 = 换 primitive 层前缀作用域（`.csh-style-a/.csh-style-b` 覆写 primitive）。
**验收**：ui-panel-cookbook §9 十条 + 双风格切换截图；工作量 ~2 小时；涉及 `core/csh_theme.js` + `core/csh_layout.css`（只加不改）。

## 3. 技术方案 T3：结算画面（M2 招牌③）⚙

**设计**：三段式——① rAF 数字滚动（**原生实现 20 行**，不引 GSAP，守零外链）：净赢 CBY 从 0 滚到终值，easeOut，600ms；② 徽章带（点绛唇式现算：最大单笔/最长连胜/最佳救援，从对局统计直接出）；③ 世界反馈一句（读 `csh_world.news(1)` 或结算事件的措辞）。样式全走 T2 的 semantic token。
**验收**：实机截图过 cookbook §9；工作量 ~3 小时；涉及 `core/csh_shell.js`（结算层）或各游戏页结算段。

## 4. 技术方案 T4：世界推演确定性契约 ⚙（M1）

**设计**（WorldForge 模式）：`csh_world.playRounds/tick` 拆为**纯函数**——`(worldState, seed, days) → (newState, events)`，随机源全部走种子化 LCG（handeval_audit.js 已有同款实现可复用）；simulate_world 新增断言：**同存档+同种子推演两次 → raw() 深相等**。
**附带**：epoch rebase（日序超阈值后整体平移重定基）+ history 压缩上限（已有 24 条环，够用）。
**工作量**：~3 小时；涉及 `core/csh_world.js` + `tools/simulate_world.js`。**前置**：P3 拆包或至少 csh_world 独立批（避免与功能改动混批）。

## 5. 技术方案 T5：廿一点策略引擎 ⚙（待作者拍板产品形态）

**设计**（possibly-wrong 模式）：内置**硬编码基本策略表**（硬牌/软牌/对子三张表，按"多副牌·庄家软 17 停牌"主流规则），两个消费方向：①玩家提示器（设置开关，决策时高亮推荐动作）；②AI 难度分级（新手=表+错误率 15%，老手=表，专家=表+偏差）。**零依赖自实现**（表是纯数据，~80 行）。
**验收**：对拍公开策略表全集（约 300 格）零差异。**准入**：作者确认做"提示器"还是"分级庄家"。

## 6. 技术方案 T6：德州 equity 接入 ⚙（D2 主菜）

**设计**：vendor [cookpete/poker-odds](https://github.com/cookpete/poker-odds) 的蒙特卡洛核心（MIT，~200 行）或自实现（HandEval 已有，补随机补牌采样即可）；AI 决策的 `eq` 从"启发式+误差"升级为"采样 equity ± skill 误差"（误差幅度不变，信息公平不变）；对手三统计量（已落地）在此基础上加"应对偏离"。
**工作量**：~4 小时（含 1 万手对拍 pokersolver/已知解）；**前置**：T1 验收 + 性能实测（150 iters×多 AI 是否卡顿，需压到单次 <8ms）。

## 7. 排期总表

| 方案 | 轨道 | 工作量 | 前置 | 状态 |
| --- | --- | --- | --- | --- |
| T1 记忆流 v2 | C3/D3 | 1.5h | 无（本轮已落三因子） | 🔥 |
| T2 三层 token | M2 基建 | 2h | 无 | 🔥 |
| T3 结算画面 | M2 | 3h | T2 | 🔥 |
| T4 确定性推演 | M1 | 3h | 独立批 | ⚙ |
| T5 廿一点策略 | 休闲 | 2h | 作者拍板形态 | ⚙ |
| T6 equity 接入 | D2 | 4h | T1+性能实测 | ⚙ |

## 8. 参考仓库映射（2026-10-07 全轮汇总）

| 项目 | 参考仓库 | 状态 |
| --- | --- | --- |
| T1 记忆流 | generative_agents（三因子/反思） · ai-town（架构） | ✅ 三因子已落地 |
| T2 三层 token | Harry Roberts CSS Guidelines · Cascade Layers 实践 | ✅ scopeStyle 已落地 |
| T3 结算画面 | three.ws ui-juice（count-up/ripple 模式） | ✅ 首版已落地 |
| T4 确定性推演 | WorldForge（同种子同结果/纪元重定基） | ⚙ M1 |
| T5 廿一点 | possibly-wrong/blackjack（策略表） | ✅ 分级庄家已落地 |
| T6 equity | node-poker-odds-calculator · poker-odds | ⚙ D2 |
| A1 字体 / A2 材质 | interestingCSS · Afif13/CSS-Collection · Animate.css | 📋 探索中 |
| A3 动效语汇 | ui-juice · Juice it or Lose it · PrimeTween | 📋 探索中 |
| A4 卡牌升级 | card-ui 主题页 · 一将成名 CharacterDetail | 📋 排队 |
| 对手建模 | pluribus-poker-AI（统计量思想） | ✅ 最小版已落地 |

**学习铁律**（本轮教训转化）：参考"解决方式"不抄"保险层"——三行保险不如一个根因；UI 类改动先浏览器实测（tools/page_smoke 冒烟 + 实机截图）再动手。

## 9. 红线自查

零外链（全部 vendor/自实现，GSAP 明确不引）· 联机禁用（互动/建模均单机路径）· 不读牌（equity/建模只看公开信息）· 版本号不动 · 数据文件进 files 清单核查（`core/` 目录级声明自动覆盖新增文件，check.js 已验证）。
