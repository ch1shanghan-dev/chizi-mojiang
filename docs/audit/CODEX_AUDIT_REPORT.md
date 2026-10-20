# 池子魔将审计与优化记录

2026-10-21，当前工作区版本 **4.0.9**。执行依据：[原始方案](CODEX_池子魔将优化方案.md)。保留本轮之前的全部未提交改动，不重置、不推送；不新增运行依赖，不改变武将机制、数值和触发条件。

GitHub 同步（同日后续授权）：作者已要求推送本轮改动，目标为 `ch1shanghan-dev/chizi-mojiang` 的 `main`。本次提交汇总以上初始化、审计、维护 skill、界面/统计/互动与技能 AI 修复；沿用 4.0.9，不打 tag 或创建 Release。下文“未推送/发布”均是各批次完成时的历史状态。同步前核对本地与远端基线树完全一致，仅提交本轮差异，保留本地备份并采用正常快进推送。

按作者后续“保持扩展根目录文件干净”的要求，本报告与原始方案归档到 `docs/audit/`，原方案中放置根目录的条款相应调整；原始方案内容保留。后续报告、清单及截图继续维护在本目录。

## 范围与证据

普通武将名册、技能与子技能、配置入口、核心模块、11 个页面纳入静态索引。结构扫描不等于语义审查，模拟通过不等于游戏实测。完整机器清单：[inventory.json](inventory.json)；可读技能索引：[技能清单](技能清单.md)。通过 `node tools/audit_inventory.mjs` 重建，复用宿主现有 ESLint 解析器，不执行技能、不读取玩家存档。

最终结构结果：51 个 JS 模块，99 位普通名册武将、93 位派生魔王、50 位妖灵；574 个顶层技能（含 BOSS/装备辅助），225 个子技能，13 个配置入口，135 处样式候选。普通名册有 235 条直接技能引用；派生列表由 `core/csh_bossdata.js::buildBossEntries` 的真实纯构造函数生成，和普通名册分列。字段缺少 `ai` 不直接判错；本项目实际字段是小写 `ai`，另检查 `check`、`ai1/ai2` 和 `.set("ai")`。清单亦包含 image/audio/font/effect 的 556 个资源路径。

## 功能契约与模块清单

本表按功能聚合；每一个 JS 文件的 import、公共状态写入、存储调用、监听/定时器源码位置均在 JSON 的 `modules` 中，13 项设置的原始名称、说明、默认值和 onclick 在 `settings` 中。

| 模块 / 路径 | 入口与依赖 | 状态与预期结果 / 失败边界 | 初步风险 / 验证 |
| --- | --- | --- | --- |
| 扩展装配 `extension.js`、`main/{bootstrap,precontent,content}.js` | Noname 扩展生命周期；导入角色/技能/卡牌；按序安装 registry、钱包、世界、壳等 | 幂等安装，debug/winrate 懒加载失败应提示；配置按钮支持尚未加载的情况 | 中：时序与宿主兼容；静态、check、实机重启 |
| 设置 `main/config.js` | 胜负统计、池子世界、局内互动及开关；调用 lib 公共接口 | 自定义 onclick 自行持久化；保存与读取键一致；联机守卫 | 中：菜单可见不保证生效；逐项重启/切换待实机 |
| 普通武将/技能 `character/index.js`、`skills/index.js` | 扩展 package；get/lib/game API | 合法目标和代价，AI 预测与 content 一致；临时/组合/响应技能需联动 | 高：规则复杂；AST 完整索引，逐项语义复核进行中 |
| BOSS `character/boss.js`、`skills/boss.js`、`main/bossmode.js`、`core/csh_bossdata.js` | 原生角色包注册与 boss 模式装配 | 名册派生条目须被宿主加载；模式清理、强制技能、召唤物 | 高：不同宿主版本；静态与专用探针，挑战模式待实机 |
| 卡牌 `card/index.js`、`core/csh_cards.js` | 衍生装备与手气牌通道 | 使用合法性、装备技能、配置隔离、联机专用通道 | 中：AI/装备关联；静态与实机 |
| 调试/世界入口 `core/csh_debug.js` | F1、悬浮球、池子世界按钮；registry/theme/UI | 单机才显示；页签重开、窄屏、连续打开、关闭监听清理 | 高：主要界面；静态、simulate、布局实机待验 |
| UI 基础 `core/csh_uikit.js`、`csh_theme.js`、`csh_layout.css` | 各面板和 iframe 消费 token/确认框 | 可见实例独占键盘；取消、重入、销毁均只完成一次；不污染宿主 | 高：误确认；第一批 VM/Chromium 已复现并验证修复，焦点陷阱待补 |
| 胜负统计 `core/csh_winrate.js` | arenaReady 安装终局采集；设置按钮 | 四模式个人角色账与身份账分开；双将/十常侍/平局/录像/联机守卫；不猜测回填 | 高：历史漏账；第一批 VM 已验证修复，实际终局与本轮视觉待验 |
| 局内互动 `core/csh_interact*.js` | 全局规则技转调 lib.cshInteract；原生表情 API | AI 发起，公开信息；旧局/关闭/失效角色停止延迟表现；终局专用台词保留 | 中：两项已修，VM 99/0，游戏中待验 |
| AI 世界/好感 `core/csh_world.js`、`csh_affection.js`、`csh_aff_lines.js` | 名册、日期、互动、游戏结算、图鉴 | 成对关系；叙述只读派生；日界与钱包一致，缺档可初始化 | 高：跨模块状态；simulate 覆盖部分，互动 actor→target 恩怨方向待核查 |
| 目录/钱包 `core/csh_registry.js`、`csh_wallet.js`、`csh_pots.js` | shell/pages/world 共同消费 | 单一目录与账本；上限、非法输入、重复结算、资金门槛 | 高：经济；simulate/save guard，真实重启持久化待实机 |
| 壳与页面桥 `core/csh_shell.js`、`csh_page.js`、`csh_games.js` | registry → iframe；message/ACK | 成功 ACK 后落位，共享会话防重；失败释放；关闭先 about:blank | 高：迟到 ACK/重复入账；save guards 和模拟；真实关闭重开待验 |
| 存档/市场 `core/csh_migrate.js`、`csh_market.js` | 保存大厅、背包、交易；钱包与 config 后端 | 各键走真实后端；失败不宣称成功、导入清洗；异步写盘错误通道仍待核实 | 高：存档；已有探针覆盖部分，宿主异步失败注入待验 |
| 成就/生涯/讨伐 `core/csh_achv.js`、`csh_pool_achv.js`、`csh_bossrecord.js`、`csh_badge.js` | 结算、规则技、讨伐录/成就页 | 一次发奖、条件准确、重开状态一致、边界不会重复累计 | 高：奖励；simulate/pool_achv 专用探针与实机 |
| 规则/语音/特效 `core/csh_rules.js`、`voices.js`、`csh_voice.js`、`csh_sfx.js`、`csh_bgm.js`、`csh_titles_style.js`、`csh_svggen.js`、`main/help.js` | content 安装；技能事件、面板/页面 | 遵守开关、恢复宿主音乐、素材不存在可降级、正文不继承装饰 | 中：宿主干扰；静态/fx_media，资源效果待实机 |
| 十周年兼容/演出 `decadeUI-compat.js`、`mobilefx/{index,cshMobileFx,manifest}.js` | precontent/动态脚本安装、演出注册表 | 本体容器接管须守开关、补载幂等；演出查 manifest，素材缺失可降级 | 高：影响宿主 DOM；主门禁覆盖契约，原生/十周年实际共存待验 |
| 诊断/构建 `core/csh_selftest.js`、`core/_census.mjs`、`main/build-flags.js`、`main/dynamic-skins.js`、`package.js` | 开发诊断、发布清单 | 当前静态基础版；不误启动态分档；目录与实际资源一致 | 中：发布遗漏；check/release（无 push） |
| 11 个 `games/*/*.html` | registry/shell：blackjack、texas、doudizhu、uno、goldfish、codex、career、bossbook、rank、achv、save | 正常/缺档/非法输入/重复结算/切换状态/关闭重开；顶栏避让与横竖屏 | 高：页面脚本与布局；simulate 覆盖内联脚本，逐页实机待验 |

## 已定位问题与修复清单

| 编号 / 优先级 | 当前行为与证据 | 最小修复与影响 | 验证状态 |
| --- | --- | --- | --- |
| UI-01 / P1 | 确认框只移除旧 DOM，旧 Enter 监听仍可确认旧操作；`csh_uikit.js::confirmBox` | 第一批已统一结束旧实例、取消计时与监听，防重入；不变存档 | VM+Chromium 通过，实际宿主缩放待验 |
| ST-01 / P1 | 个人武将账在身份白名单内，versus/国战漏记；`csh_winrate.js::capture` | 第一批已把个人角色记账移出身份分支；不回填历史、不改身份账 | VM 四模式通过，真实终局待验 |
| AI-01 / P2 | `riposte` 先写 hitBack 再读旧事件，第一次也说“旧账” | **已修复**：先读取再写入；保持原概率和记录口径 | VM 冷/热/saved 对照通过；游戏中待验 |
| AI-02 / P2 | 回嘴、帮腔、连击、三连表情、濒死旁白只在安排时检查，执行前角色/会话/开关可能改变 | **已修复**：共享 queueScene 守卫，重置/新局/终局清理任务；开关关闭后再开不复活旧表现，台词开关不打断表情 | 实际模块 VM 99/0；改前 22/77；终局同步台词保留，游戏中待验 |
| UI-05 / P2 | 统计 KPI/选中页签/排序头使用 12–16px 发光，辅助字较暗且窄屏 10.5px；`csh_winrate.js::ensureStyle` | **已修复**：局部清除信息文字光晕/描边，辅助字至少 12px，复用字体 token 并加局部 muted 色；标题轻阴影和背景模糊保留 | Chromium 64/0，改前 44/20；对保守面板色样本 #2b261f，辅助字对比约 3.38→6.32；实际主题待验 |
| SK-AI-01～05 / P2 | 平讨两形态、笳歌、未羊、违忤、黩武共 6 定义的 result.target 收益方向有误；见下方专题 | **已修复**：仅改 ai 内的视角/正负号，规则代码逐字对比不变 | 实际引擎 get.effect + 真实技能回调 VM 45/0；改前行为 17/27；实战待验 |
| SK-AI-06～08 / P2 | 交盟暗手牌估值/队友收益、峻刑分支/免翻面、扞难免伤/输拼点代价；见 AI 专题第二批 | **已修复 AI**：只用已知牌/公开牌数，调整分支和风险估计；不改实际结算 | 新专项 38/0，改前行为 13/24；规则 AST 对比不变；策略质量仍待实战 |
| EC-01 / P1（风险） | 市场 write 用同步 try/catch 包住 `game.saveConfig`；宿主写库内部异步且函数不返回 Promise | 必须找到可靠完成/失败通道后再改；不能用 await undefined 假修复 | 源码确认契约缺口；未复现真实坏账，待故障注入 |
| AI-03 / P2（候选） | 世界恩怨 API 默认对玩家；互动存在 AI→AI 事件，调用未传对方键 | 核对调用方与世界契约，确认后按成对对象接线 | 静态复核中，不先改规则 |

## UI 分类与技能复核方法

135 处匹配保存在 `effects`，包括注释/动态字符串，不能等同 135 个缺陷。区分信息文字、标题、SVG/卡牌装饰、backdrop 背景模糊和图鉴锁定内容；后两类不按正文模糊删除。本轮处理统计面板的数字、操作状态与辅助字，同时更正个人统计空状态仅说“身份场”的旧文案。其余调试/互动、图鉴/小游戏、宿主技能描述以及浅深主题分别保留实机验收项。

799 个技能/子技能均建立类型、触发/filter/cost、选牌选人、AI/check/set 回调、组合/全局/辅助关系及源码位置；86 个顶层主动技能均有 ai 字段，此事实不代表 AI 完善。[AI 语义审查记录](AI审查记录.md) 现包含两批共 9 个定义的修复与待验条件。机器索引新增 `aiHelpers`，将对象外的估值 helper 纳入回调与未定义标识符检查。静态未解析标识符扫描不替代引擎 StepCompiler 上下文检查；其余行仍为待语义核查，不能把完整索引当成全部通过。

浏览器使用真实统计模块、真实 DOM/CSS 和测试数据，未启动 Noname；覆盖 1200×820、390×844、915×412（body scale .6）、720×600（scale 1.5），检查排序/切页/关闭/重开/Esc、外部文字未污染和面板矩形。截图：[桌面](ui/winrate-desktop.png)、[竖屏](ui/winrate-portrait.png)、[矮横屏](ui/winrate-landscape.png)、[缩放](ui/winrate-zoom.png)；[逐项结果](ui/results.json)。已人工检查桌面、竖屏和横屏截图；滚动区域在窄/矮屏保留，没有用隐藏内容“解决”溢出。

## 验证记录与后续验收

前一批重新执行结果（保留历史范围）：

| 检查 | 结果 | 实际范围 |
| --- | --- | --- |
| `node tools/check.js` | 通过，2 类既有告警 | 语法/import/名册/资源/56 项门禁；36 个缺技能译名候选及开发文档未入分发保留 |
| `node tools/simulate_world.js` | 188/0 | 世界/存档/桥与 11 页内联脚本；模拟不替代真实写盘 |
| `node tools/probe_save_guards.mjs` | 12/0 | 行囊确认与失败守卫 |
| `node tools/probe_first_batch.mjs --browser <Chrome>` | 71/0 | 确认框 VM+真实 DOM、个人战绩；本轮再跑通过 |
| 维护 skill `probe_noncharacter.cjs --root .` | 8/0（第一批为 6/2） | 原有断言完整保留，适配共享延迟守卫的测试上下文 |
| `node tools/probe_interact_audit.mjs` | 99/0 | 五种延迟路径、角色/开关/局/录像/联机/终局；改前同组 22/77 |
| `node tools/probe_skill_ai.mjs --baseline <本批前源码>` | 45/0 | 六定义、引擎收益乘算、非 ai 源码逐字不变；改前行为 17/27 |
| `node tools/probe_winrate_ui.mjs` | 64/0 | 真 Chromium 四档 viewport 与交互、CSS、矩形；改前 44/20 |

本次继续批次（同为 2026-10-21 / 4.0.9）：新 `probe_skill_ai_decisions.mjs` **38/0**（含规则 AST 保护和故意改 usable 的对照）；改前行为 **13/24**。原技能 AI 专项复跑 **45/0**，主门禁通过（2 类原有告警），世界回归 **188/0**。交盟还移除了 get.value(card,target) 通过同名暗牌数量间接估值的路径；峻刑用 losehp 区分伤害免疫；扞难估计默认选牌及失败风险。启发式权重和特殊技能干预的实际质量待游戏验证；未新增依赖、未改结算、未升版或推送。

下一批顺序：① 其余主动/响应技能及 BOSS 逐项语义场景；② 市场异步错误通道与交互恩怨方向；③ 其他主要界面的清晰度/焦点/入口专项；④ 将本批三项的特殊联动纳入游戏实测。各项继续按已复现/源码确认/待实机区分，不自动归为通过。

实机验收：四模式终局个人账、确认框宿主缩放/键盘焦点、互动关闭/角色死亡/切局、11 页面横竖屏与关闭重开、浅深主题技能描述、市场真实写库失败与重启、BOSS 挑战加载、联机禁用和语音效果。未执行的保持“待实机验证”。
