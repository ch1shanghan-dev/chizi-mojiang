# 池子魔将 · 开发规范与路线图（v4.0.6）

> 本文只留**常读**内容：红线 · 判定口径 · 防回归清单 · 门禁 · 路线图。
> 细则与历史在 `docs/` 三件套（§8 索引，不随扩展打包）；更旧的 1832 行全文存档：
> `D:\Noname\SHIJIAN(联机测试)\_backup\README_完整版_2026-10-03.md`（代码注释里「README §中文数字」引用的都是它）。

---

## 0. 三十秒速览

| 项目 | 现值 |
| --- | --- |
| 这是什么 | 无名杀扩展：底座 = **武将 99 · 卡牌 24 · 技能**（联机可用）；衍生 = **池子休闲**（德州 / 廿一点 / 斗地主 / UNO / **金鳞市** / **妖灵图鉴** + 生涯大厅 + 讨伐录）+ **BOSS 挑战模式**（93 魔王 + 50 妖灵）+ **AI 世界** + 成就 / 官阶 / 经济（单机）。演进目标：**池子世界**（§1、§7） |
| 版本 | **4.0.6**（`package.js` / `info.json` / `extension.js` 三处含 intro 必须一致；**只有作者能定号**） |
| 三处真值 | 小游戏目录 = `core/csh_registry.js` · 钱包与经济 = `core/csh_wallet.js` · AI 世界 = `core/csh_world.js` · 名册 = `character/index.js` |
| 门禁 | `node tools/check.js`（语法 + 自由变量 + import 路径 + **技能/翻译/音频一致性** + 版本/files + BOSS 断言组 E1~E29）· `node tools/simulate_world.js`（世界/存档/结算桥 + 八页内联脚本验收）—— 跑法见 §6 |
| 实机 | 由作者测试；AI 只能声称「静态检查通过」 |
| 路线 | **M1 100 武将 + P3 拆包 → M2 表现层三招牌 → M3 池子世界**（§7） |

---

## 1. 愿景：从「池子魔将」到「池子世界」

**武将内容是别人点「安装」的理由，池子世界是别人每天打开的理由。**

**分层铁律：衍生层可以观察对局，对局内容永远不依赖衍生层。**

- ✅ 合法：钱包读胜负发 CBY、世界围观比赛写事件环、牌桌 AI 引用战绩。
- ❌ 禁止：技能结算查钱包、对局特效等经济系统初始化。
- 两条检验：**卸载测试** —— 删掉整个 `core/`，武将 / 卡牌 / 技能 / 立绘 / 语音 / 联机必须 100% 可玩；
  **联机测试** —— 联机房间内所有衍生功能静默休眠，武将本体完整可用。

**一个世界一种货币一本账**：对局收益与小游戏收益都走 `csh_wallet` 的 settle + 哈希链，永远不长出第二种货币。
依赖单向，意味着将来把池子休闲拆成独立扩展只是挪文件，不是重构。

**兼容性纪律**：prefix 隔离 · 联机禁用 · 禁万能 Hook（红线 #4）。新增全局性代码前先问一句：
**「我的代码有没有资格在一件与我无关的事情发生时执行？」** 没有，就用 trigger + filter 收窄到自己的东西上；
确需碰全局的，照逆流护体守卫（`main/content.js`）的样板：保留原函数、联机 no-op、注释写清缘由。

---

## 2. 红线（违反即打回）

1. **版本号只有作者能定**：三处（含各自 `intro`）必须一致；不许「顺手 +1」，不许自己发明号。
2. **改前必须备份**：`node tools/backup.js --slim`（用 Electron node 跑，见 §6）。
   备份、临时脚本、探针页、日志**一律留在扩展目录外** —— 安卓端无名杀会把扩展目录里每个文件都当扩展内容导入。
3. **最小修改**：「最小」约束的是**未经要求**的改动；作者要求「做完整」就做完整 ——
   **范围由作者定，AI 不得放大，也不得缩小**。
4. **禁止万能 Hook**：不得改写 `lib.skill.*` / `lib.filter.*` / `game.*` / `get.*` / `_status.*` 等全局对象来修单个技能。
   AI 问题修在技能自身（`ai.result` / `ai.order` / `filter` / `cost` / `content` / `choose*.set("ai")`）。
   只有「引擎行为 / 全局兼容 / 扩展加载机制」才可考虑全局修改，且须先写清：为什么技能级修不了、
   影响面、副作用、回滚方式、验证情况，**未获批准不得实施**。
5. **禁止吞异常**：核心结算不得 `try{...}catch(e){}`；不得「catch 住继续假装已结算」；
   不得「为了不报错」直接取消功能。允许范围仅：音频、CSS 注入、DOM 动画、非关键 UI、旧 API 探测。
6. **禁止无证据乱改**：`Math.random` / `storage` / `syncStorage` 的判定口径见 §3。
7. **禁止伪造验证**：没跑就说「仅静态检查」；不许写「实机测试通过 / 联机测试通过 / AI 已验证」除非真跑过。
8. **改动必须留痕**：报告（技能·位置·问题·修改·未修改·验证）+ `docs/CHANGELOG.md` 轮次记录。
9. **玩家文案不得出现开发视角**：禁「防刷」「经济修复」「设计意图」「PC」「回收率」「名次/计分制」等内部术语，
   只写「是什么、怎么用」；不加括号补丁（细则见 docs/dev-rules.md）。
10. **经济守恒**：任何提高胜率/收益的开关，接入前先算期望 —— **期望 > 0 且可无限重复 = 刷钱漏洞**。
    现行解法：斗地主好牌模式 = 练习局不计输赢（精确归零）；`practice` 标记必须在开局快照进 game 对象。
11. **只走一套账**：结算唯一实现是 `csh_wallet`；localStorage 键名（`csh_*`）不得改，只改导出范围。
12. **小游戏铁律**：单文件自包含 / 零外链 / 禁用 `vw·vh` / 三条关闭链路齐全（见 docs/dev-rules.md）。

---

## 3. 判定口径（这些地方不轻易下结论）

- **`Math.random()`**：只有「影响确定性的 AI 决策 / 联机同步的游戏规则 / 需要复现的核心状态」值得查；
  动画、粒子、UI 装饰、严格同分 tie-break、规则本身要随机 —— 不动。
- **`storage`**：看到没 `delete` 不等于内存泄漏。先确认生命周期、是否长期存在、是否被 `mark`/`intro` 读取。
- **`syncStorage`**：看到缺 `syncStorage()` 不等于联机 Bug。先确认该数据是否需要远端可见、是否由事件本身同步。
- **Bug 分级**：A 确定性错误（→可直接修）· B 高概率逻辑缺陷（→修但要写证据）·
  C 策略问题（→不许冒充 Bug，只能建议）· D 纯风格（→不与功能修复混批）。
- **AI 策略争议 ≠ Bug**；证据不足时写「不确定」，不硬改。

---

## 4. 防回归清单（改代码前过一遍）

- 版本三处一致（含 intro）；localStorage 键名不改。
- 新增存储键 → 同步四处：collect / cleanXxx / applyAll / inspect；
  `cleanXxx` 字段集**从主模块抄**，不手写。
- **字符串日期字段**（`dailyTask.day` / `lastSign` / `reliefDate` / `meritDate`）**不得走 clampNum**（`Number("2026-10-03")` = NaN ⇒ 被钳成 0）；
  **世界数值字段**（`lastTick`）不得走 clampStr。
- 新增渲染点必须 `esc()`；键名只从 `charNames()` 取，不用 `characterTitle`（含 HTML）。
- 离线对局（`playOne`）必须与 `settleWin/settleLose` 同口径维护个人战绩；里程碑用专用字段（如 `everTier3`），不借 `retireCount`。
- 手机横屏：真正的紧凑断点是 `max-height` 系（不是宽度）；HUD/浮层必须显式 `z-index`；
  手势期间创建的浮层必须做 `armClose`（松手 click 会把它关掉）。
- toast 必须设同屏上限；`100vw/100vh` 硬失败。
- 技能 ↔ 译文 ↔ 立绘 ↔ 语音 四向一致；资源引用只用扩展内路径；禁止重命名/删除既有资源。
- 拆包/改结构：不改键名、不顺手优化、一批一备份、每批过门禁。
- **同一触发点的多技能错峰：用 priority 数值排序，不改触发阶段**（2026-10-06 作者定则）。
  改阶段会改变技能语义，只该调执行顺序。参考写法：沙摩柯【陷阵蛮勇】30 / 【铁蒺藜骨朵】装备技 31
  （一对固定先后，整对早于默认优先级的常规技能），【跋扈】62+lastDo 在准备阶段开始收尾。
- **新增浮层/面板/CSS 改动 → 动手前过 `docs/ui-panel-cookbook.md`，发版前过其 §9 十条自检**（2026-10-06 作者要求：面板问题反复出现，守则沉淀成文）。
- **钱包/货币读写必须"存/显分离"**：业务值永远用原始数值，格式化（"1.23w"）只在渲染层 —— 外部实证：一将成名 BackpackManager 格式化串混进业务值导致资产清零（docs/external-research.md §1.1）。
- **子技能必须补译名**：引擎把"无译名"视为 silent 自动抢跑（docs/engine-notes.md §9-1，content.ts:3969 实证）——新增 subSkill/group 展开件时同步补 `lib.translate[名]`。
- **复用引擎 CSS 动画名 / API 前先 grep 确认存在**（player-died keyframes 全仓不存在的实锤，engine-notes §7）。
- **UI 类问题必须先在真实浏览器取证再改**（本地 `python -m http.server` + Chromium 实测；本轮三个根因——页 id 写错/`!important` 压制行内/旧布局 padding 残留——静态检查与冒烟执行均无法发现，见 postmortems #17/#18/#19）。
- **HTML 禁止尾部 append；批量插码必须锚定语句完整边界**（跨行表达式中间插入会切断语法，postmortems #14/#16 同源）；改完必须跑 `tools/page_smoke.cjs` 冒烟。
- **`display` 等会被程序动态覆盖的属性，样式中禁止加 `!important`**（postmortems #18）。
- **字号只用标尺 token、紧凑断点只用 `max-height`**（2026-10-07 A1 实测）：字号七档全部由 `--fs-base` 派生
  （mobile-first，禁止裸字号与第二套断点数值）；**手机横屏 915×412 比 900px 桌面断点更宽**，
  按宽度写移动端规则会被整体绕过 —— 紧凑判定用 `max-height`（`csh_layout.css` L-SHORT 同口径）。
  规范与迁移清单见 `docs/art-direction.md` §四；可视参照页 `tools/font_scale.html`。
- **改页面必跑浏览器实测三档**（桌面 1000×756 / 手机横屏 915×412 / 竖屏 412×915），逐页报「内容高/可视高」；
  脱离无名杀的环境用 `tools/career_preview.html`（假宿主，按 shell 真实载荷应答桥协议）取真实数据渲染。
- **根因优先，禁止保险层（2026-10-07 作者定则）**：发现要叠第二层"兜底/双保险"时，**停下**——多层保险是没找到根因的证据。先做对照实验找到一击解决的真因（如 `!important` 压制行内的浏览器实验），**然后删掉所有保险，收敛为单一实现**。保险本身是债：它掩盖根因、干扰排查、每次改动都要维护 N 份。

### 4.1 「静默永不发动」五类判据（2026-10-14 · 4.0.5→4.0.6 回归审计沉淀）

这一类 bug 的共性：**静态检查全绿、运行时不报错、就是没效果**。改技能/页面/经济前逐条对一次：

| 类 | 症状 | 判据（必须回引擎源码确认） |
| --- | --- | --- |
| **触发角色写错** | 技能一次都不发动 | `player:` 要求 `event.player === 持有者`；**全局事件必须写 `global:`**。gameStart 是全局事件（本体一律 `global: "gameStart"`）；反之 `enterGame` 带 player。查法：grep 本体同事件怎么写。 |
| **时点写错** | 技能发动了但无效果 | 改判/改值要看清引擎**读取目标的时刻**：`judge.directresult` 在 judge content 开头就被读走并亮牌，事后写它=没写——**改判必须替换 `player.judging[0]`**（本体 guidao/key/diy 范式：替换 + 弃旧牌）。 |
| **事件字段写错** | 报错或 filter 崩 | 事件字段因事件而异：`useCardToTarget`/`useCardToPlayer`/`useCardToPlayered`/`useCardToTargeted` 由 `_triggerTo` 构造，**只有 player/target/card/cards，没有 source**；`damageEnd` 有 source；`die`/`dieAfter` 的 source 来自 reason。把 undefined 传给 `game.checkMod` 会 TypeError（末位参数要 `.getModableSkills()`）。 |
| **键系不一致** | 计数/进度恒 0 | 生产者与消费者的键必须逐字对齐：`summary().series/seriesTotal` 的键**无 `csh_` 前缀**（与讨伐录系列表同契约）。跨模块消费一律容错双查（`pickSeries()` 范式），并把契约写成门禁断言。 |
| **校验是死代码** | 脏数据能进存档 | 先确认判据**真的可能为假**：`tierOf()` 是 `ID2TIER[id] \|\| "elite"`，恒真 → `if (!tierOf(id))` 永不触发。校验要用白名单（`allBossIds()` / `MINIONS`），不要用"带兜底默认值的查询函数"。 |

配套三条**副作用纪律**（钱/状态类，改前必对）：
- **先入账再推进标记**：`写标记 → 发钱` 的顺序一旦发钱失败就**永久吞账**；一律 `if (pay(...)) 标记 = 完成`，失败挂 pending 下次补。
- **桥超时 ≠ 失败**：`CSHPage.transport.call` 超时也回调 `(false,null)`，而宿主可能只是慢——**金额/持仓类命令绝不在超时后走本地重放**（会双花），只报错让玩家自查；本地兜底只留给"非桥环境"。
- **空态必须单一出口**：空态写在启动回调里、后续又无条件调用"清屏+渲染"函数 → 空态被立刻抹掉（整页空白）。空态由渲染函数统一出口处理。

### 4.2 字体纪律（2026-10-15 定案 · 照 `docs/art-direction.md` §4.1 扩充为四档）

字体只有四个 token，**禁止裸写 font-family**（书法体除外，见下）：

| token | 字体栈 | 用在哪 |
| --- | --- | --- |
| `--ff-title` | `Noto Serif SC / Source Han Serif SC / Songti SC / STSong / SimSun / serif` | 角色名 / 区块标题 / 官阶名 / 大数字 |
| `--ff-body` | `Noto Sans SC / PingFang SC / Microsoft YaHei / system-ui / sans-serif` | 正文 / 台词 / 说明 / 按钮 |
| `--ff-num` | `ui-monospace / Cascadia Mono / Consolas / SF Mono / Menlo / monospace` + `font-variant-numeric:tabular-nums` | 金额 / 价格 / 计数 |
| `--ff-callig` | **`ZMX3`**（`font/csh_fx_font_3.woff2`，4058 字全覆盖子集）+ `Zhi Mang Xing / Kaiti SC / STKaiti / KaiTi` + `--ff-title` | **仅装饰性短词**：页面招牌字 / 封面书名 / 卷号 / 序跋大字 |

- ★**书法体只用于"字表内确定有字形"的短词**：`csh_fx_font_1/2.woff2` 是 **78/84 字的游戏内技能横幅专用子集**，
  **绝不可放进通用标题栈**——表外字会**逐字符回退系统字体**，同一个人名/标题里混排两种字体
  （2026-10-15 作者实机截图确认的"字体不统一"根因，详见 `boss-design.md` §19.4）。
- **人名、称号、台词一律走 `--ff-title` / `--ff-body`**，不做书法体（动态文本无法保证字表覆盖）。
- 新增会以书法体呈现的文本（技能名/人名）→ **必须过门禁 E20**；字表在 `tools/font_charset.json`，
  由 `python tools/make_font_subset.py <ZhiMangXing-Regular.ttf> --ext-root .` 重新生成
  （字体为 SIL OFL 1.1 开源，许可随 `font/OFL-ZhiMangXing.txt` 打包）。

---

## 5. 结构与现状

| 部分 | 内容 |
| --- | --- |
| `extension.js` | 入口（75 行）：noname import + 生命周期模块挂载 + `characterSubstitute` 皮肤表 |
| `character/` · `card/` · `skills/` | 武将 99 · 卡牌 24 · 技能单文件 ~33878 行（名册/卡册唯一真值；P3 拆包见 §7 M1） |
| `core/` | 26 个 `csh_*.js` 子模块 + `voices.js`（钱包/世界/壳/调试面板/目录/胜负/成就/官阶/CDK/音效/配乐/迁移/主题/BOSS 数据·记录·金鳞市…） |
| `main/` | 8 个生命周期模块（bootstrap / config / content / precontent / help / bossmode…） |
| `games/` · `mobilefx/` | 6 款小游戏（德州/斗地主/廿一点/UNO/金鳞市/妖灵图鉴）+ 4 张 iframe 页（career 生涯大厅 / bossbook 讨伐录 / goldfish 金鳞市 / codex 妖灵图鉴）；手游位图特效播放器（M2 将泛化为动态立绘引擎） |
| `tools/` · `docs/` | 门禁 / 验收 / 备份 / 体检；开发文档三件套 —— **两者均不进 package.js files 清单，不随扩展打包** |
| `image/` · `audio/` · `font/` | 立绘·卡图 / 技能·阵亡·卡牌语音·特效横幅 / 毛笔字特效字体 |

**目标架构**：`extension.js（入口）→ main/（生命周期）→ character/ card/ skill/（分包）→ core/（模块）→ games/ mobilefx/`。
**拆的是文件，不是键**：无名杀按对象键名注册，搬运期间禁止「顺手优化」内容。
分期：P0 工程基建 ✅ · P1 初始化与设置区 ✅ · P2 武将卡牌区 ✅ · **P3 技能区分包（未做）** · P4 质量治理（可并行）。
已知坑：core 的 import 路径是 `../../../noname.js`；`package` 是行内写法；部分环境禁 spawn（check 自动降级）。

---

## 6. 门禁与命令

```bash
# 用 Electron 的 node 模式跑（本机没有独立 node）
set ELECTRON_RUN_AS_NODE=1
"D:\Noname\SHIJIAN(联机测试)\noname.exe" tools/check.js             # 语法 + 自由变量 + 版本三处一致 + files + BOSS 断言组 E1~E29
"D:\Noname\SHIJIAN(联机测试)\noname.exe" tools/simulate_world.js    # 世界/存档/结算桥 + 八页内联脚本（断言数以脚本实际输出为准，现 169/0）
"D:\Noname\SHIJIAN(联机测试)\noname.exe" tools/inventory.js         # 结构体检
"D:\Noname\SHIJIAN(联机测试)\noname.exe" tools/backup.js --slim     # 改前备份（写到 _backup/）
```

**BOSS 模式专项验证**（工作台 `D:/Noname/池子魔将-工作台/探针/_probe_v4/`，**必须 `node --preserve-symlinks`**——否则 junction 会解析到扩展真身、
相对 import 逃进真 noname 而报 `Cannot find package 'vue'`）：

```bash
node --preserve-symlinks _probe_v4/probe.mjs                 # 真实数据端到端探针 39/0（角色注册/血量/醒魔/池悯/随机池/精英随机）
node tools/simulate_world.js                                # 世界模拟 188/0（含 §1c 牌技：两榜不同序 98% / 12 牌风全覆盖）
node --preserve-symlinks _probe_v4/verify_affection.mjs      # 好感度系统 130/0（五档/七互动含贴近/1600 句两两不同/疏远日键守卫/她的回礼/收集册/四档特权）
node --preserve-symlinks _probe_v4/verify_minion_reward.mjs  # 妖灵讨伐收益 25/0（CBY/功勋/热度/幂等/通道纪律）
node --preserve-symlinks _probe_v4/verify_goldfish.mjs       # 金鳞市 35/0（体验金/分红/手续费/长期看涨/边界）
node --preserve-symlinks _probe_v4/verify_ext.mjs            # 外传卷 52/0（动态枚举/清洗/跨模式快照/键系）
node --preserve-symlinks _probe_v4/verify_boss_over.mjs      # 讨伐收尾记录通道 19/0（game.over 包装 · 三结局+外传）
# 渲染级（须先 cd 到扩展根再跑：脚本读 process.cwd()/games/bossbook.html）
node "<工作区>/_probe_v4/verify_ext_page.cjs"         # 异界来客渲染 9/0
node "<工作区>/_probe_v4/verify_ext_page.cjs" --empty # 异界来客空态 6/0
```

`tools/check.js` 的 BOSS 断言组（**E1~E27**）覆盖：键系统一 / 模拟引擎可达 / 无散落键转换 / 零手工写 lib.character /
原生注册 / filter 参数纪律 / 包级隐藏 / 优先级两两不同 / 冷眼 global 装配 / 妖灵讨伐收益 / 金鳞市接线 /
外传卷（含**立绘前缀三层**与跨模式快照）/ 妖灵图鉴 / **成就键系（vm 真跑引擎）** / **经济安全（扣款·入账·不重放）** /
**三例「静默永不发动」回归守卫** / **书法体字表覆盖（E20）** / **人设↔挂牌一致（E21）** /
**妖灵 50 技零重复 + 家族封顶（E22）** / **账本接线·入口只走左侧页签（E23）** /
**好感度系统（E24：五档 · 七互动 · 送礼扣款 · 她的回礼 · 日键疏远守卫 · 收集册）** /
**难度评分（E25）** / **台词库 1600 句 · 每人 32 句 · 全库两两不同（E26）** / **好感经济回报（E27）** /
**成品页面卫生（E28）** / **濒死链路隔离（E29：功傲/刀锐不被魔王方濒死白嫖 · 反扑拆到 dyingAfter）**。

失败判定：`✗[^0]|失败 [1-9]`；**不要拿 "error" 字样当失败**（`sfx("ui.error")` 会误报）。

---

## 7. 路线图（目标：池子世界）

### M1 地基收敛（进行中）
- **冲刺 100 武将**（现 99）：机器侧全就绪，写进 `character/index.js` 即自动收录世界与统计。
- **P3 技能拆包**：skills/index.js → `skill/batch_*.js`（单文件 <2000 行，先机械切分后语义归组）。
  **美化开工前必须完成** —— 表现阶段要高频往技能挂演出钩子，三万行单文件是合并事故最高发地带。
- 拆分红线不变：不改版本号 / 不改技能逻辑 / 不改键名 / 一批一备份 / 每批过门禁。

### M2 表现层冲刺（100 武将后启动）
三个招牌瞬间，全部走 `csh_theme` 鎏金深底，风格统一本身就是记忆点：
1. **资料卡**：武将介绍页双击弹全屏档案 —— 立绘大图 + 属性/评级面板 + 技能试听 + 战绩 + 收藏。
   数据全现成（`characterIntro` / `csh_winrate` / `audio/skill/*.mp3`），只缺 UI 层（拟新建 `core/csh_dossier.js`）。
2. **大招演出**：限定技 / 觉醒技触发时全屏暂停过场（`game.pause` + 定时恢复）；
   mobilefx 帧序列播放器泛化为**动态立绘引擎** —— 无损帧序列替代 GIF/WebP（画质上限更高），帧率 ≤24fps。
3. **结算画面**：对局结束 CBY 入账动画 + 音效 + 世界反馈 —— 钱进账的时刻最有记忆点。

配套决策（**实现前先精读 `docs/external-research.md` 对应章节**，配方与协议都在里面）：
- **高清资源按曝光尺寸分配**：全屏场景（资料卡 / 演出 / 结算）给最高规格；局内头像显示尺寸小，中等即可 ——
  内存不设限，但手机端解码 CPU 要掂量（外部硬数据：动皮 mp4 ≤1MB/≤1080p/H.264/DPR 限 1，external-research §1.3）。
- **语音导演**：`csh_voice.js` 增加语境选词层（来源 / 目标 / 剧情关系 / 资源状态），先复用现有 189 条 mp3；
  条数探测/防叠加/轮换计数三件基础设施照 external-research §1.2/§3 的现成实现。
- **共存冒烟测试**：selftest 增加「开十周年 UI / 常见美化扩展后关键节点不被覆盖」的断言组；
  演出降级链（swTool → decadeUI.animation → 自研 mobilefx）按 external-research §2-P0 落地。

### M3 池子世界
- **对局 → CBY**：入口挂 `csh_winrate` 已有的 game.over 包装，结算走 `csh_wallet` settle + 哈希链；
  防刷用每日上限 / 衰减（参照负期望守护思路）；联机 no-op。
- **AI 名将上牌桌**：`csh_world` 的性格 / 资金直接复用为德州 / 廿一点 AI —— 对局里的对手、牌桌上的同席、世界里的排行，同一个活的世界。
- **小游戏格局（2026-10-14 更新）**：现役 **6 款** = 德州 / 斗地主 / 廿一点 / UNO + **金鳞市**（galgame 股市 · 经济自管、不走牌桌结算）+ **妖灵图鉴**（纯档案展示）；
  非游戏页 2 张 = 生涯大厅 / 讨伐录（registry `lobby:true` 免收费屏）。目录真值永远是 `core/csh_registry.js`（ORDER / CATALOG / LOBBY），
  新增一款只改一处 + 补 `csh_games.js` 卡片文案（`selfTest()` 会核对一一对应）。
- **309 名册**：持续推进（212 个真实武将设计，内容创作单独立项）。

### 排队优化（下一批一起做）
- ~~**AI 世界台词语境化**~~（✅ 2026-10-09 完成，作者 2026-10-06 反馈）：`csh_interact.js` 新增
  `stateOf()` 状态门（controlled / hurt / normal）—— 被乐不思蜀等延时锦囊控住的回合不再说
  得意话，40% 概率走新增 `ctrl` 吐槽池且不主动出手；重伤（hp ≤ 1/3）改走新增 `hurtSelf`
  自嘲池；表情台词补 `EMO_PERSONA` 人格变体（4 包）。垃圾话同期精简 10,837 → 1,680 句
  （组合生成器笛卡尔积退役，见 `core/csh_interact_lines_gen.js` v2 注释）。

### 里程碑纪律
一批一备份一过门禁；M2 起新特效必须过「联机 no-op + 不污染全局」两道关；版本号仍只有作者能定。

### 联动无名杀内置 BOSS 模式（魔王挑战）· **已落地（2026-10-13，版本 4.0.6）**

> 目标：让池子魔将武将能作为**魔王 / 妖灵**进入无名杀**内置** BOSS 模式，且**只改本扩展、不改无名杀本体**。

**结论：已落地。** **93 位魔王**（四档：究极 8 / 霸主 30 / 彩蛋 4 / 精英 51；另 6 人移出为可挑战者）+ **50 只妖灵**（六式 6 + 十二美 12 + 希里 + 春野樱 + **十卫 10 + 二十刑 20**；**全员 3 血 · 全员随机出场 · 50 技零重复、每只一个独立机制**）+ **80 个魔王主技 + 51 个 silent 挂靠子技**（`skills/boss.js` 共 131 条 · 系统层**疯魔/反扑**二技；全量清单见工作区 `池子魔将_BOSS模式技能总表.xlsx`）+ **魔王难度评分**（百分制 · `difficultyOf`）+ **讨伐录**（速通榜 / 亲征战绩 / 外传卷·异界来客）+ **成就「挑战」22 条** + CBY 首杀/每日/妖灵讨伐奖励（妖灵 **统一 800 CBY**（2026-10-16 晚四轮修正；挑战者/应战仍分流记录）+ 功勋 + 金鳞市热度）+ **池子币账本**（生涯大厅「账本」页 · 42 日收支热力格 · 逐笔流水 · 分类汇总）+ **金鳞市**（galgame 股市 · 五十位妖灵挂牌）+ **妖灵图鉴**（galgame 档案 · 五十位）+ **好感度系统**（五档 · **七种互动：打招呼/说说话/摸摸头/贴近/送礼×4/讨伐/持股** · **1600 句台词（每人 32 句、全库两两不同 · 收集册机制）** · **她的回礼**（陪伴类互动按概率回赠随机 CBY，S 档均值 ≈ 8400） · SVG 心跳爱心 · **四档经济回报**） + **AI 世界 149 人**（99 武将 + 50 妖灵，德州/斗地主/UNO 同桌 · **12 种牌风 · 牌技榜 ≠ 资金榜**）。设计全案见 **`docs/boss-design.md`**（§18 全量回归审计 / §19 v6 新批次与字体统一 / §20 v6.1 数值收束与妖灵入世 / §21 v6.2 技能去重·账本·好感度·立绘重构 / **§22 v6.3 技能二轮优化 · 难度正名 · 好感度大扩 · 牌技重设计 / §23 v6.4 功能去重（图鉴只管关系 · 金鳞市只管钱）· 台词收集册 · 黑心修复 / §24 v6.5 疏远误报修复 · 双向经济（她的回礼）· 台词 1600 句 / §25 v6.5.1 成品卫生 · 疯魔构成问题定位 / §26 v6.6 通用技重做 · 妖灵技重写 15 只 · 濒死链路隔离**），门禁 = `tools/check.js` 的 **runBossChecks 断言组（E1~E43）**。

**注入机制（2026-10-13 源码级复核，修正本节 2026-10-11 旧调研）**：
- **旧调研的"模式导出单例"（`lib.mode.boss` / `lib.imported.mode` 缓存）未复现**——实际加载链：`loadMode`（`noname/init/index.js:462`，`characterPack` 整体替换进 `lib.characterPack`）→ **扩展 `content`（:521-522，注入黄金位）** → `mode.start()`。模式导出对象是**每次 import 工厂新建**的，改单例的思路作废。
- **实际注入（`main/bossmode.js`，`main/content.js` 挂载）**：判 `lib.config.mode === "boss"` 后——① 构造（`core/csh_bossdata.js` 纯数据单源）→ `lib.characterPack.mode_boss` **前插重建**（键序=列表顺序）+ **同步 `lib.character`**（loadMode 合并早已发生，改 pack 不进 character——漏这步开局 init 直接抛"武将不存在"）；② `lib.boss` 配置（chongzheng/minion/gameDraw）；③ `lib.translate` 名称；④ `forbidai.add` 加固；⑤ `lib.storage.current` 首进焦点。
- **零污染实证**：挑战者选将排除 isBoss（`ui/create/index.js:1029`）；随机获技跳过（`get/index.js:4177`）；其它模式注入不执行。全套锚点见 `docs/boss-design.md` 附 C。

**配套与红线**：① 魔王形态独立前缀 `csh_boss_`（普通形态不动）；② 势力统一「魔」（引擎原生 `devil`），列表身份牌保留出身色（`BOSS_GROUP` 开关一行回退）；③ 主公技在挑战模式被引擎整体剥离（`player.init` 过滤，属全局规则）；④ 门禁 = `node tools/check.js`（含 runBossChecks）。

**注意事项**：十周年 UI 的「设置→选项→官方势力」（choose_group）开启时，神/魔势力角色开局会弹"请选择你的势力"（引擎神魔换势力机制，与本扩展无关）——魔王扮演者建议关闭该设置，即可正常显示并保持「魔」势力。

**状态**：**已落地**（4.0.6，v4 平衡迭代见 CHANGELOG 五十九~六十一）。实机验收清单见工作区定稿 §8；数值校准全部集中 `core/csh_bossdata.js` / `core/csh_bossrecord.js` 单点。

---

## 8. 外部参考仓库索引（2026-10-07 · 全轮沉淀）

> 用途：未来迭代的"武器库"。改哪块先来这里找对应参考；详细笔记见 docs/external-research.md 与 docs/tech-plan.md。
> 学习铁律（本轮教训）：**参考其"解决方式"，不抄其"保险层"** —— 三行保险不如一个根因；UI 类先浏览器实测。

### 牌桌 AI 与玩法（D2/D3）
- [goldfire/pokersolver](https://github.com/goldfire/pokersolver)（已 vendor 对拍）· [rundef/node-poker-odds-calculator](https://github.com/rundef/node-poker-odds-calculator)（equity 计算，T6）· [cookpete/poker-odds](https://github.com/cookpete/poker-odds)
- [deremios/pluribus-poker-AI](https://github.com/deremios/pluribus-poker-AI)（对手建模思想·已落地最小版）· [possibly-wrong/blackjack](https://github.com/possibly-wrong/blackjack)（策略表，T5 已落地分级庄家）

### AI 记忆与互动（C3）
- [joonspk-research/generative_agents](https://github.com/joonspk-research/generative_agents)（三因子检索公式·已落地）· [a16z-infra/ai-town](https://github.com/a16z-infra/ai-town)（架构简化版，仅借鉴不引 LLM）

### 世界模拟（D3）
- [MrHakan/WorldForge](https://github.com/MrHakan/WorldForge)（确定性推演+纪元重定基，T4）· [Dozed12/df-style-worldgen](https://github.com/Dozed12/df-style-worldgen) · [RyanBabij/WorldSim](https://github.com/RyanBabij/WorldSim)（事件因果链）

### 表现层 · Game Feel / Juice（美术探索 A3）
- [three.ws `ui-juice`](https://github.com/nirholas/three.ws)（**Web 端 juice 库**：count-up/ripple/FLIP/状态点，token 驱动时长与缓动、reduced-motion 安全——与我们动效语汇目标同构）· "Juice it or Lose it" 演讲（业界经典）
- CodeCrunch C11 Week 06 课程（缓动曲线/挤压拉伸/屏幕震动**理论+实现**）· [KyryloKuzyk/PrimeTween](https://github.com/KyryloKuzyk/PrimeTween)（tween 模式参考）

### 表现层 · CSS（美术探索 A1/A2）
- [Animate.css](https://github.com/animate-css/animate.css)（按键帧素材库）· [IanLunn/Hover](https://github.com/IanLunn/Hover)（hover 效果集）· [shuirongshuifu/interestingCSS](https://github.com/shuirongshuifu/interestingCSS)（70+ 中文 CSS 效果，抄写友好）· [Afif13/CSS-Collection](https://github.com/Afif13/CSS-Collection)（conic 渐变/clip-path/reveal）
- **方法论**：Harry Roberts《CSS Guidelines》（避免限定选择器/OOCSS 结构-皮肤分离）· Cascade Layers 实践（@layer 顺序替代特异性战争）· Defensive CSS（防依赖 DOM 顺序的脆弱写法）——**与本项目 postmortems #16-#19 互证**

### 无名杀生态
- [libnoname/noname](https://github.com/libnoname/noname)（watch release，升级后跑 engine-notes 复核）· [nonameShijian/noname](https://github.com/nonameShijian/noname)（诗笺版）· [lieren2023/noname-for-dummies](https://github.com/lieren2023/noname-for-dummies)（懒人包=兼容验收基准环境）
- 外部扩展样板（一将成名/千幻聆音/云中守望/点绛唇/十周年UI/幻梦等 10 个）：docs/external-research.md

## 9. 三国杀移动版客户端挖掘（2026-10-08）

> 详细笔记见 `docs/client-mining.md`；完整报告（含逐条证据）`[已移除]/骨骼提取/客户端挖掘/客户端挖掘报告.html`。
> 原始产物（数据库 / 清单 / 可读 Lua / 解开的动皮包）`[已移除]/`。

从[已移除] root 进了 `[已移除]` 私有目录。**逻辑层没有可读源码**（Unity + IL2CPP），
但拿到了 7 份可读 Lua UI 源码、3 套资源清单、以及结构完整的官方动皮包。三条最值钱的：

- **官方动皮包内就是「背景 + 形象」两副独立骨骼**（`BeiJing` / `XingXiang`，各带多图集页），
  包内目录 `<皮肤ID>_<序号>` —— 与本扩展 `main` / `bg` 分层同构，**架构方向被官方验证**。
- **官方把资源清单写成可直接 `dofile` 的 Lua 表**（`[已移除]`：4084 条、每条带 `name`/`code`(md5)/`size`）——
  「清单自带 md5 + size」这条已落地为本扩展的 `tools/check-dynamic-integrity.mjs` + 锁定表。
- **官方自己留了 TODO**：`lobbyFactory.lua` 注释原文「这里后面应该要改为读文件配置，这样才能使得新增主题不需要改动代码」——
  说明「配置驱动」是官方想去而没去的位置；本扩展动皮数据已是「标定脚本 → 生成器 → 独立数据文件」，
  所以后续只在**链路完整性**上投入，不改架构。

其它可复用的事实速查（详见 `docs/client-mining.md`）：

| 项 | 结论 |
| --- | --- |
| 大图纹理 | 是 **ASTC 6×6**（魔数 `13 AB A1 5C`），字节数 = `⌈w/6⌉×⌈h/6⌉×16+16`；**小图标才是真 PNG**。我们继续用 PNG/WebP 是对的（ASTC 定长、网络体积更大） |
| 动皮包 | `cloud/ui/face/skin/dynamicSkin/<md5>.zip`，**文件名 = 真实 md5**（内容寻址） |
| 清单 | `[已移除]`(Lua 表) / `DownLoadUrlConfig.json`(1915 键) / `upd/flists/flist0..7`(分片) |
| 加密载荷 | `.lib` 与 `config*.zip` = **32 字节固定 ASCII 头** + 密文；[已移除] / RC4 / AES-ECB-CBC / AES-256 / XOR 全部失败，判为非标准方案，不再深挖 |
| 角标 | `skinGrade{2,3,4}` + `skinFestivalIcon{1..54}`，**独立散图、不打图集、文件名纯数字**；31×48 角旗同主题底色完全一致（`tools/gen-mark.py` 的底版重建就靠这条） |
| Lua UI 手法 | zOrder 常量表 / 覆写→默认二级回退 / 配置可含屏幕尺寸表达式 / `cc.ClippingNode` 逐像素裁剪 / 音效挂骨骼事件帧 / 下载完成标记 `FlgFinsh_*` |

**复现时两个坑**：Git Bash 下 `adb shell` 传 Android 绝对路径必须加 `MSYS_NO_PATHCONV=1`；
`su` 命令写成 `shell "su -c '...'"`（外层双引号、内层单引号）。

## 8. 文档索引

| 文档 | 内容 | 原位置 |
| --- | --- | --- |
| `docs/dev-rules.md` | 技能与 AI · 小游戏与页面 · UI/布局 · 经济与统计口径 | 原 §3 / §4 / §5 / §7 |
| `docs/postmortems.md` | 合并与外接复盘 15 条（新事故追加到表尾） | 原 §8.5 |
| `docs/CHANGELOG.md` | 版本表 + 轮次留痕（新轮次追加到这里） | 原 §10 |
| `docs/external-research.md` | **外部扩展研究与借鉴手册**（2026-10-06 精读 10 个第三方扩展）：可学机制、联动钩子、资源协议速查、路线图映射 | 新建 |
| `docs/ui-panel-cookbook.md` | **浮层与面板 CSS 实战守则**：三种宿主环境 / z-index 档位 / 注入纪律 / 配方库 / 性能预算 / 手势 / 共存 / 发布前十条自检 | 新建 |
| `docs/engine-notes.md` | **无名杀本体精读笔记**（2026-10-06，含官方 docs/ 16 篇摘要 + 源码验证）：技能格式 / 触发排序与剪枝 / 启动主线 / 配置键真格式 / 音频与台词 `#` 键 / changeSkin / 引擎级注意事项与行动项 | 新建 |
| `docs/client-mining.md` | **三国杀移动版客户端挖掘笔记**（2026-10-08）：root 复现步骤 / 目录结构 / 三套资源清单 / ASTC 公式 / 官方动皮包结构 / Lua UI 手法 / 角标体系 / 加密载荷结论 | 新建 |
| `docs/dynamic-skin-webp-proposal.md` | **动皮「去骨骼化」可行性评估**（2026-10-09，实测数据）：骨骼版显存 130MB/套 → WebP 0.7MB；格式选型（WebP 而非 GIF/MP4 的原因）/ 混合架构 / 代价清单 / 三步迁移路线 | 新建 |
| `docs/tts-plan.md` | **AI 语音（TTS）方案**（2026-10-09 定稿，待拍板）：垃圾话精简后 1,680 句的合成预算 / 引擎对比（P0 Edge-TTS 免费打底 + P1 CosyVoice 人格音色）/ 5 人格音色映射 / `audio/interact/` 缓存键设计 / 接入点与风险 | 新建 |
