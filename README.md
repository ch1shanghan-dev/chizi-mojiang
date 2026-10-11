# 池子魔将 · 开发规范与路线图（v4.0.5）

> 本文只留**常读**内容：红线 · 判定口径 · 防回归清单 · 门禁 · 路线图。
> 细则与历史在 `docs/` 三件套（§8 索引，不随扩展打包）；更旧的 1832 行全文存档：
> `D:\Noname\SHIJIAN(联机测试)\_backup\README_完整版_2026-10-03.md`（代码注释里「README §中文数字」引用的都是它）。

---

## 0. 三十秒速览

| 项目 | 现值 |
| --- | --- |
| 这是什么 | 无名杀扩展：底座 = **武将 99 · 卡牌 24 · 技能**（联机可用）；衍生 = **池子休闲**（廿一点 / 德州为主）+ **AI 世界** + 成就 / 官阶 / 经济（单机）。演进目标：**池子世界**（§1、§7） |
| 版本 | **4.0.5**（`package.js` / `info.json` / `extension.js` 三处含 intro 必须一致；**只有作者能定号**） |
| 三处真值 | 小游戏目录 = `core/csh_registry.js` · 钱包与经济 = `core/csh_wallet.js` · AI 世界 = `core/csh_world.js` · 名册 = `character/index.js` |
| 门禁 | `node tools/check.js`（语法 + 自由变量 + import 路径 + **技能/翻译/音频一致性** + 版本/files）· `node tools/simulate_world.js`（世界/存档/结算桥 + 五页内联脚本验收）—— 跑法见 §6 |
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

---

## 5. 结构与现状

| 部分 | 内容 |
| --- | --- |
| `extension.js` | 入口（75 行）：noname import + 生命周期模块挂载 + `characterSubstitute` 皮肤表 |
| `character/` · `card/` · `skills/` | 武将 99 · 卡牌 24 · 技能单文件 32332 行（名册/卡册唯一真值；P3 拆包见 §7 M1） |
| `core/` | 19 个 `csh_*.js` 子模块 + `voices.js`（钱包/世界/壳/调试面板/目录/胜负/成就/官阶/CDK/音效/配乐/迁移/主题…） |
| `main/` | 5 个生命周期模块（bootstrap / config / content / precontent / help） |
| `games/` · `mobilefx/` | 4 款小游戏 + `career.html`（iframe 页）；手游位图特效播放器（M2 将泛化为动态立绘引擎） |
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
"D:\Noname\SHIJIAN(联机测试)\noname.exe" tools/check.js             # 语法 + 自由变量 + 版本三处一致 + files
"D:\Noname\SHIJIAN(联机测试)\noname.exe" tools/simulate_world.js    # 世界/存档/结算桥 + 五页内联脚本（断言数以脚本实际输出为准）
"D:\Noname\SHIJIAN(联机测试)\noname.exe" tools/inventory.js         # 结构体检
"D:\Noname\SHIJIAN(联机测试)\noname.exe" tools/backup.js --slim     # 改前备份（写到 _backup/）
```
失败判定：`✗[^0]|失败 [1-9]`；**不要拿 "error" 字样当失败**（`sfx("ui.error")` 会误报）。

---

## 7. 路线图（目标：池子世界）

### M1 地基收敛（进行中）
- **冲刺 100 武将**（现 98）：机器侧全就绪，写进 `character/index.js` 即自动收录世界与统计。
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
- **小游戏收敛**：专耕 **廿一点 + 德州**；斗地主 / UNO **藏而不删**（摘入口、catalog 默认关、代码休眠，
  成就与生涯历史数据不受影响）—— 待作者最终确认后执行。
- **309 名册**：持续推进（212 个真实武将设计，内容创作单独立项）。

### 排队优化（下一批一起做）
- ~~**AI 世界台词语境化**~~（✅ 2026-10-09 完成，作者 2026-10-06 反馈）：`csh_interact.js` 新增
  `stateOf()` 状态门（controlled / hurt / normal）—— 被乐不思蜀等延时锦囊控住的回合不再说
  得意话，40% 概率走新增 `ctrl` 吐槽池且不主动出手；重伤（hp ≤ 1/3）改走新增 `hurtSelf`
  自嘲池；表情台词补 `EMO_PERSONA` 人格变体（4 包）。垃圾话同期精简 10,837 → 1,680 句
  （组合生成器笛卡尔积退役，见 `core/csh_interact_lines_gen.js` v2 注释）。

### 里程碑纪律
一批一备份一过门禁；M2 起新特效必须过「联机 no-op + 不污染全局」两道关；版本号仍只有作者能定。

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
