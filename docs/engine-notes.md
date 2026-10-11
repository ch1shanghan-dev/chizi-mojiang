# 无名杀本体精读笔记（2026-10-06）

> 对象：引擎 TS 源码 `resources/app/src/noname/`（构建产物 `noname/` 为运行时真身，index.html 实际加载）+ **官方文档 `resources/app/docs/`（16 篇，约 4200 行，此前无人提起）**。
> 本文 = 官方文档要点 + 源码一手验证，聚焦**扩展开发写法与注意事项**。官方文档是比外部扩展更高的"判定口径"来源，写技能/做系统前先查这里。
> 配套：`ui-panel-cookbook.md`（浮层 CSS）、`dev-rules.md`（技能规范）、`external-research.md`（第三方借鉴）。

---

## 0. 仓库结构与官方文档（先读文档再写代码）

- 两套目录：`src/noname/`（TS 源，可读可 grep）→ 编译为 `noname/`（运行时）。**读码看 src，排查线上行为以 noname/ 为准；引擎升级后两者可能不同步，要复核。**
- 核心体量：`game/index.js` 10916 行 · `get/index.js` 7841 · `library/element/player.js` 16545 · `library/element/content.ts` 13298 · `library/index.js` 14945。
- **官方文档清单**（`app/docs/`）：`lib-skill-format.md`（技能格式速查）、`game-event/`（trigger / lifecycle / content / chooseToUse / eventHandlers / relationships / interaction / cache / source-mapping / index 十篇）、`audio-guide.md`（音频全格式）、`skin-guide.md`（换肤）、`async-guide.md` + `step-to-async-guide.md`（异步）、`game-startup-flow.md`（启动主线）、`how-to-start.md`。
- 文档明确自称"根据源码整理"——引擎团队的注释文化与我们 CHANGELOG+postmortems 工作流同构；**官方文档就是我们规范体系的上一层锚点**。

## 1. 技能对象规范（lib-skill-format.md 摘要 + 验证）

- 六类字段组：触发（trigger/filter/check/cost/content）、主动（enable/filterCard/selectCard/filterTarget…）、视为（viewAs/viewAsFilter/position/prompt）、规则修改（mod）、组合（group/subSkill/sourceSkill）、展示与状态（audio/intro/mark/marktext/onremove/init）+ AI。
- **控制字段官方语义**（此前凭习惯用的，现在有定义）：
  - `forced: true` **默认 locked=true**；`frequent` 可自动发动；`direct` 减少确认流程；`silent` 静默触发；`popup: false` 不弹技能名。
  - `firstDo` / `lastDo`：同一时机中优先 / 延后处理（引擎级依据见 §2）。
  - `charlotte`：状态技/不可常规移除。
  - `limited: true` **自动补** mark/intro/skillAnimation/init 等默认字段——别重复手写。
  - `skillAnimation: true` + `animationColor`：引擎自带限定/觉醒全屏名演出（云中守望的 trySkillAnimate 即基于此）——我们的觉醒/限定技可以直接开这个，再叠自研演出。
  - `preHidden`：国战预亮。
- `cost` 把结果写 `event.result`（额外数据走 `event.result.cost_data`）；无 cost 且非 forced/direct 时引擎自动建确认框。
- `subSkill` 展开为 `主技能名_子技能名`，自动带 `sub: true` 与 `sourceSkill`。
- `mod` 六种：`maxHandcard / cardUsable / targetEnabled / targetInRange / aiValue / aiUseful`。
- **翻译键规则**：技能名即默认翻译键；`_info` 是描述渲染门槛（与 postmortem #14 的结论互为印证，这次有官方出处）。
- 官方推荐新代码一律 `async content(event, trigger, player)` + `.forResult()`。

## 2. 事件与触发系统（trigger.md / lifecycle.md + content.ts:3947 实证）

- **触发流程**：`event.trigger(name)` → 按**座位顺序**遍历玩家（起始角色取 `_status.currentPhase > event.source > event.player > game.me > players[0]`）收集技能 → 建 `arrangeTrigger` 子事件统一执行。
- **桶结构**：每个玩家一个桶，桶内分 `firstDo 桶 → 普通桶 → lastDo 桶`；**桶内按 priority 降序**。
- **优先级剪枝（content.ts:3960 一手确认）**：每轮 `todoList.filter(i => i.priority <= usableSkills[0].priority)` —— **只执行当前最高 priority 的那一组**；同组多技能弹 `chooseControl`（"选择下一个触发的技能"）交给玩家；同组中**有 silent 或无译名者自动跳过询问直接执行**（3967-3970：`skillInfo.silent || !lib.translate[item.skill]`）。
- **firstDo/lastDo 桶不参与优先级选择**（3961-3963 直接取 usableSkills[0]）——「跋扈 62+lastDo 收尾」「陷阵蛮勇30/骨朵31 错峰」的引擎级依据，README priority 定则完全成立。
- **`_triggered` 状态机**：0→触发 Before，1→Begin，2→content，3→After，4→收尾；已 finish 的事件走 Omitted→End→After 分支。**`finish()` 不会中断正在执行的 content**——长流程 content 要自查 `event.finished` 提前返回；`cancel() = untrigger + finish`。
- **因果链**：`_trigger`（原始事件）/ `triggername` / `getTrigger()` 沿 parent 链回溯——千幻聆音的 resolveSkillContext、我们的 getParent 判断都建立在这条链上。
- `cancelled` 结果会把该技能剩余触发条目全部跳过（3998）。
- `notrigger` / `_notrigger`：事件级 / 指定角色的"不触发"通道（防连锁的官方工具）。
- ⚠ lifecycle.md 原文：`new GameEvent` 构造里"联机模式下 `_triggered` 设为 null"——**联机客户端的事件不在本地走技能时机**（由主机结算后同步）。这正是我们"联机 no-op"红线的引擎层原因，写联机敏感功能时以此为据。

## 3. 启动主线与扩展生命周期（game-startup-flow.md）

```text
index.html → entry.ts → boot()（polyfill/配置/兼容层/沙盒）
  → importMode / importCharacterPack / importCardPack / importExtension（只装进 lib.imported）
  → loadCharacter → loadCardPile → loadCard → loadPlay → loadExtension（此刻才合并进 lib.*）
  → startBefore → ui.create.arena() → game.createEvent("game", false).setContent(模式start) → game.loop()
  → 模式start：prepareArena → chooseCharacter → gameStart → gameDraw → phaseLoop
```

- **动态 import 只是暂存 `lib.imported`，不等于已合并**——扩展合并发生在 loadExtension；这就是"precontent 阶段 lib 不完整、content 才能放心改 lib、arenaReady 才有 ui.arena"的官方时序依据。
- **模式会 mixin 覆盖全局**：`mixinGeneral(mode, "game"/"ui"/"get"/"ai")` —— 模式可能重写 `game.chooseCharacter` 等方法；扩展包装全局函数前要确认当前模式是否已覆盖（取原函数再包）。
- `gameStart` 触发时才置 `_status.gameStarted = true`——挂 gameStart 的全局技此时集中跑（我们世界的初始化在这里是对的）。
- `phase` 事件 `trigger=false`，**阶段名时机由 phase content 内部手动触发**——phaseZhunbei/phaseDraw 等触发名的来源；阶段顺序固定：Zhunbei→Judge→Draw→Use→Discard→Jieshu。
- `phaseLoop` 是 while(true) 推进座次；回合开始处理翻面跳过、`_status.currentPhase` 设置、roundStart。

## 4. 扩展加载与配置键（源码实证）

- `game.import("extension")` → `game.loadExtension(object)`：**`extensionName = \`extension_${name}\``**（game/index.js:2987 起）。
- **扩展配置项真实存储键 = `extension_扩展名_键名`**（如 `extension_池子魔将_debug_menu`）；开关 = `extension_扩展名_enable`（importExtension，3346）。之前我们只凭外部扩展行为推断，这次从 loadExtension 源码坐实；千幻聆音"双写两套键"对引擎而言只有 `extension_` 前缀那套生效。
- 配置项 `init` 值只在**首次导入且键不存在**时落盘（3106 附近 `filter(key => !(`${extensionName}_${key}` in lib.config))`）——改 init 默认值对老用户无效，需迁移逻辑。
- `lib.extensionMenu[名]` 挂设置菜单；卸载有 `onremove` 钩子；安装态走 `_status.importingExtension / game.importedPack` 特殊路径（在线安装的"对象形态"由此而来）。

## 5. 音频系统（audio-guide.md 全文要点 + playAudio 源码）

- **audio 字段官方全格式**：`false` / `true`（默认路径同名）/ 数字 N（同名+N 后缀）/ 字符串引用其他技能 / `"ext:包名/路径:N"`（**冒号分隔，不是斜杠**）/ 数组组合。默认值是 `[true, 2]`（同名 + 1/2 两句）。
- **audioname**（按角色名加后缀数组）与 **audioname2**（按角色 id 换 audio 源映射）——共享技能按角色配音的官方通道。
- **台词配对官方格式**：`lib.translate` 里以 `#` 开头的键，格式 **`#音频地址[:后缀]`**（die 类用 `:die` 后缀，如 `#guanyu1:die`）。**这就是"语音↔字幕"的官方通道**——我们的 `core/voices.js` 字幕表迁到 `#csh_技能名1` 格式后，引擎的台词气泡展示白得，不必自绘。
- 阵亡语音：`dieAudios` 实例属性或 character 数组第五格 `"die:xxx"` 标签（我们已在用 ✓，官方背书）。
- `game.playAudio` 实现（game/index.js:2461-2510 一手核对）：参数支持对象或位置参数 join("/")；路径解析 `ext:`→`extension/`、`db:` 特殊处理、其余默认加 `audio/` 前缀；**`lib.config.repeat_audio` 未开时同路径去重（`_status.skillaudio`）**；音量 = `volumn_audio / 8`；**每次新建 `<audio autoplay>`**，oncanplay 里补 `play()` 兜移动端 autoplay 限制。
  - ⚠ 两个推论：①做"同技能多句连播"会遇到全局去重，需评估 repeat_audio 或错开路径；②自研播放器（资料卡试听用 `new Audio()`）要自己处理首次手势限制（一将成名链式 onerror 已示范）。

## 6. 皮肤与立绘（skin-guide.md 全文）

- **官方换肤 = `lib.characterSubstitute`**（我们已在用，格式获官方背书）：每项 `["皮肤id", [信息格]]`，信息格等同 character 第五格，支持 `"character:武将"`（借别人原画）/ `"ext:扩展/路径.jpg"` / `"die:..."` 阵亡语音标签。
- **运行时换肤官方 API = `player.changeSkin(map, character)`**：map 四种定位 `{skill}` / `{characterName}` / `{characterSkinName}` / `{source:"name1"|"name2"}`——**双将精确定位、与语音联动官方已处理**。我们 `main/content.js` 的 `cshPlaySkin`（明日香事件换肤）目前自行实现，应迁移到 changeSkin（转换技按状态换原画的官方示例 skin-guide.md:130-139 与我们的场景一模一样）。
- **本体 skin 文件夹换肤"兼容性较低，处于半废弃状态，慎用"**（官方原话）——`skinPath` 属性存在但别把功能押在它上面；我们的动态皮肤方向走 characterSubstitute + changeSkin + 自研帧序列，不碰本体 skin 文件夹。
- 立绘判序 polyfill（init/polyfill.js:204-219）：img → trashBin 的 `img:/ext:/character:`（别名再解）→ 默认路径——一将成名 `resolveOriginSrc` 照抄对象，资料卡读立绘必须过这条链（external-research §1.1-3 已收录）。

## 7. UI 与 CSS（引擎实证）

- **`layout/default/layout.css:31` 的 `div { display:inline-block; position:absolute }` 全局规则实锤**（行号与 postmortem #15 一致）——浮层复位守则见 ui-panel-cookbook §2。
- keyframes 清单（layout/default）：card / cardeffect / cardflip / dialog / flash / flip / zoom / splash / drawing… —— ⚠ **`player-died` 在全仓不存在**（grep layout/、noname/、src/ 零命中）；观星美化引用它 = **动画静默失效实锤**。教训已回写 ui-panel-cookbook §5：**复用引擎动画名前先 grep 确认存在**。
- `ui.create.div(类名, 父节点, 样式对象/文本)` 多参工厂是引擎 UI 的统一入口——扩展自建 DOM 尽量走它，保持与引擎主题/缩放（`game.documentZoom` 系）兼容。

## 8. 值得学的引擎写法（代码风格层）

1. **单例 + setter 导出模式**：`lib/game/ui/get/ai/_status` 各自有 `setXxx`——模块解耦、可替换、可测试（`noname.js` 统一 re-export）。
2. **参数双兼容 API 设计**：`playAudio(...args)` 单对象或位置参数；`args.find(arg => typeof arg === "function")` 抽回调——一份 API 两种手感，我们的工具函数可学。
3. **getter 常量单点**：引擎内部 + 云中守望 `get URL()` 不谋而合——防字符串手滑的共识做法。
4. **文档由源码注释整理**（docs 各篇开头都注明出处文件）——"写码即写文档"的工作流范本；我们的 CHANGELOG 轮次记录同构。
5. **路径协议集中解析**：`ext:`/`db:`/默认前缀在 playAudio 入口一处换算——我们处理扩展内路径引用时也应收口到单点 helper。

## 9. 注意事项（扩展开发者视角的红线外补充）

1. **无译名技能 = 自动 silent 抢跑**（content.ts:3969）：新增子技能（尤其 group/subSkill 展开件）必须补 `lib.translate[名]`，否则触发时既不询问也不弹名，AI/玩家都失去选择权，表现为"莫名自动发动"。
2. `finish()` 不打断 content：限时/可中断的流程要自查 `event.finished`。
3. 引擎只认 `extension_名_key` 配置键；自家 localStorage `csh_*` 键引擎不管，但**不要以 `extension_` 开头**以免撞配置体系。
4. `repeat_audio` 全局去重影响连播；`volumn_audio/8` 是官方音量换算（自研音量条用它对齐）。
5. 模式 mixin 可能覆盖 `game/ui/get` 方法——包装前取原函数（我们的"保留原函数"红线在引擎层也有对应物：十周年UI 的 `_overrideRestoreFns` 同思路）。
6. 动画名/keyframes 先 grep 再引用；立绘路径必过 polyfill 判序；官方文档描述的是 src 源码行为，**运行时构建产物可能滞后**——升级引擎后抽查关键行为。
7. 联机：客户端事件 `_triggered=null` 不本地触发——一切"联机 no-op"决策的引擎依据，写进联机敏感功能的注释里可查证。

## 10. 对池子魔将的行动项（按优先级）

1. **`voices.js` 字幕迁移 `#` 台词键**（§5）——删自绘字幕逻辑，白得引擎气泡与 audio 联动；M2 语音导演的地基。
2. **`cshPlaySkin` 迁移 `player.changeSkin`**（§6）——删自研换肤定位逻辑，双将/联机正确性交给引擎。
3. **盘点无译名的子技能**（§9-1）——grep skills/index.js 中 `subSkill`/group 展开件与 translate 缺失项，一次性补齐（可进 tools/check.js 门禁：子技能键 ↔ translate 键 diff）。
4. **觉醒/限定技统一开 `skillAnimation`**（§1）再叠自研演出，避免重复实现引擎已有的全屏名演出。
5. **资料卡试听/音量条**：音量换算对齐 `volumn_audio/8`；连播需求评估 `repeat_audio`（§5）。
6. ui-panel-cookbook §5 的 player-died 条目已按本笔记修正（复用动画名先 grep）。
