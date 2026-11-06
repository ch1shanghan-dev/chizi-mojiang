# D1 · 第四款德州 AI 牌风 trapper 与世界 12 牌风映射

日期：2026-11-07。按 `docs/WORKBUDDY_DESIGN_GAMEPLAY_NUMERIC_ART_20261107.md` §5 实施顺序推进一个待办
（妖灵数据层 S1 已完成；德州补码碰钱包、风险最高，留到门禁更完备时做）。
**未使用子代理**；版本仍 **4.0.16**，未推送、未合并 main、未发版、未创建 tag/Release。

## 为什么选这一项

作者要求「玩法/数值/美术先研究设计方案」，方案已定案第四款 AI 的全部参数。
但实施前复核真源码，发现两个必须一起处理的事实——**只加一行参数会做出死代码或反向效果**：

1. **世界 12 牌风在德州桌上被丢掉 7 个。** `core/csh_world.js` 自 v6.3 起有 12 种牌风
   （`PERSONA_KEYS`，每种带 `raiseThreshold / bluffRate / skillShift / 人设`），50 只妖灵还有手工指定的
   `MINION_PERSONA`。而 `games/texas/texas.html:1575` 的 `PERSONA_MAP` 从 2026-09-29 起只写了
   5 个 key（aggro/tight/math/bluff/wild），其余 7 个
   （chaser/trapper/grinder/bull/maniac/reader/lucky）**全部落进 `pickPersona()` 随机三选一**。
   世界系统精心设计的牌风与牌技，在豪赌桌上没有传达到决策层。
2. **方案参数表里 `trapper.open = .34` 与代码语义相反。** `core/csh_texas_ai.js:decide()` 里
   `style.open` 是「翻前后位偷池 / 便宜跟注」的 `strength` 门槛，**值越高越紧**
   （tag .57 / bluff .47 / loose .40），不是「开放程度」。照抄 .34 会得到四款里**最松**的一款，
   与「收紧开池」的定案直接矛盾。已在方案 §3.3 就地纠偏为 **.62** 并写明理由。

另顺手堵住一个旧边界：`mapPersona` 原用 `PERSONA_MAP[wp] || pickPersona()`，
传 `toString` / `__proto__` 会返回 `Object.prototype.toString` 之类的对象而非牌风字符串，
后续 `PERSONAS[pk].label` 直接炸。现改 `hasOwnProperty` 判定。

## 改了什么

| 文件 | 改动 |
| --- | --- |
| `core/csh_texas_ai.js` | `styles` 加 `trapper`（edge .075 / valueOpen .68 / **open .62** / bluff .020 / size .52）；新增只读 `personas()` 返回冻结副本供门禁对账，未知 persona 仍回退 tag，`version` 不变 |
| `games/texas/texas.html` | `PERSONAS` 加 trapper 文案「埋伏」、`PERSONA_KEYS` 扩到 4 款；`PERSONA_MAP` 补齐 12 个世界牌风；`mapPersona` 改 `hasOwnProperty` |
| `tools/probe_texas_rules.mjs` | 自对弈 `table()` 与 500 样本 fuzz 的 persona 数组由 3 款扩到 4 款，让 trapper 进入既有守恒回归；33 条业务断言一条未删 |
| `tools/probe_texas_persona_20261107.mjs` | 新增专项反例（详见下） |
| `tools/check.js` | 注册门禁 **E95Q**（min passed 32） |
| `docs/WORKBUDDY_DESIGN_GAMEPLAY_NUMERIC_ART_20261107.md` | §3.3 参数表纠偏 + 补记映射缺陷的发现与定案；**其余定案未改** |
| `catalog.js` | 两个运行源码改后按发布字节纪律重生成，1036 文件、0 不符 |

**映射规则（新增 7 条，机械推导、不按角色意象拍脑袋）**，依据 `csh_world` 的
`raiseThreshold / bluffRate`，顺序即优先级：

| 条件 | 映射 | 命中 |
| --- | --- | --- |
| `bluffRate >= .30` | `bluff` | maniac .26/.36 |
| `raiseThreshold >= .60` | `trapper` | trapper .64/.28、bull .80/.02、reader .60/.16 |
| `raiseThreshold <= .44` | `loose` | chaser .38/.10 |
| 其余 | `tag` | grinder .55/.03、lucky .48/.12 |

既有 5 条（aggro .42/.20 → tag、tight .72/.04 → tag 等）有两条不符合该规则，
**为不改变既有对局行为特意保留**；探针分别按「既有 5 条不变」与「新增 7 条可复算」两套口径锁住。

## 验证

专项 `tools/probe_texas_persona_20261107.mjs` 加载三个真值（`csh_texas_ai.js` /
`csh_world.js` 的 `PERSONAS` 声明 / `texas.html` 内联脚本声明与函数），**32/0 ×2**。
内置改前基线（3 款 + 5 映射）跑同一断言集 → **16 条红**，证明断言集能检出旧缺陷而不是永远绿。

覆盖：4 款参数逐字段与定案一致、`open > tag.open` 的纠偏证据、四款极值关系、
`personas()` 冻结防篡改、未知 persona 回退；12 个世界牌风 0 遗漏 / 0 多余 /
映射值合法 / 结果确定不随机 / 原型键与空键不污染 / 既有 5 条不变 /
新增 7 条按参数重算逐条一致 / 四款文案与随机可达；策略层隐藏字段 getter 抛错仍可决策、
锁定加注权不非法加注、4 款 × 600 样本 0 非法动作与 0 越界加注、trapper 入池率低于 loose、
诈唬率不高于 tag 与 bluff。观察层的暗牌/牌堆隔离仍由 E95K 覆盖，本探针不重复实现。

| 项目 | 结果 |
| --- | --- |
| 新专项 | **32/0 ×2**；改前基线 16 红 |
| 既有 `probe_texas_rules.mjs`（默认） | **33/0** |
| 既有 `probe_texas_rules.mjs --hands 10000` | **34/0**，10000 手 / **91204 动作** / 0 停滞 / 0 非法 / 0 筹码守恒失败 |
| 四款 VPIP / PFR（同一万手） | tag 42.8% / 9.3%、loose 59.1% / 9.2%、bluff 53.6% / 14.4%、**trapper 37.6% / 5.5%（均最低）** —— 与「收紧开池、放慢强牌」定案一致 |
| 完整 `node tools/check.js` | **exit=0，FAIL 0，`[RETRY]` 0**，E95Q 32/0、E95K 33/0、E95P 17/0；2 项既有告警不阻断 |
| 门禁注册自检 | 3/0（无悬空注册） |
| `release.js --check` / `--worktree` | 0 不符、0 漏登记；catalog 1036 文件、版本 4.0.16、build 一致 |
| 生成前 `--check` 反证 | 改了两个运行源码时如实报 `mismatchCount: 2 / ok:false`，重生成后 0 |

## 明确未做

- 德州**真实补码 / 桌级退隐联动**（方案 §3.1—3.2，碰钱包与 `shell-seat`，风险最高，未动）。
- 妖灵增益 **S2 战斗接线与 S3 反例**（本副本缺 `noname/game/index.js`，`probe_aux_spirit.mjs`
  起不来，不在本轮改高风险战斗模块）。
- 横屏断点统一、人物事件回应；皮肤/立绘素材与音效主观听感（作者决定）。
- 第四款 AI 的**台词/牌风话术**未新增；诈唬不泄漏到台词沿用既有机制，未做听感验收。
- 自对弈是隔离的合成牌桌，**不是真机、不是自然对局**，不冒充实战结论。

版本 4.0.16 未改；未推送、未合并 main、未发版、未覆盖正式安装。
