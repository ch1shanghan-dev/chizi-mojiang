# 池子魔将 · 开发接手指南

> 2026-10-26正式实施4.0.11：作者授权除武将AI优化之外的维护与追加需求实施，并在完成、验证和隐私审查后推送GitHub。武将AI保持暂停；服务器后端由作者另行提供，当前不连接生产服务器。保留旧档、现有规则和已有成果，当前版本目标4.0.11。

> 2026-10-26后续指令：作者明确“仍然暂停武将AI优化”，覆盖本日先前按接手描述恢复AI的排期。武将10/99及8人部分结论保留，不继续修改武将AI。追加两份MD目前按本次“查看/核查/追加资料”请求归档与审阅；其中直接实施、分提交、新功能和生产安全部署的措辞不自动成为本次执行指令。

追加资料索引：[UI/UX术语与规范](docs/UI_UX_GUIDELINES.md)、追加需求原文（本地保留）、[本次核查与分批计划](docs/audit/ADDENDA_REVIEW_20261026.md)。后续UI任务参考新规范并复用现有token；示例token、目录和数值不可直接覆盖已有实现。

本仓库是无名杀扩展，仓库根目录就是安装目录。初始化阅读记录见
[docs/初始化说明.md](docs/初始化说明.md)（2026-10-20，基线 `adcee8d`）。
本文汇总现有源码与开发文档的约定；具体功能以当前源码为准。

非武将系统的维护、评审与更新计划使用项目专用
[chizi-mojiang-maintenance](docs/skills/chizi-mojiang-maintenance/SKILL.md)。
技能源码保存在仓库 docs/skills/，本机可发现副本在用户 `.codex/skills/` 同名目录；维护后同步副本。
其中缺陷快照需先复核，研究结论不代表已经修复或完成实机验证。

## 根目录整洁

- 根目录保留运行/发布文件、README、LICENSE、Git 配置与本指南；不新增方案、报告、日志、截图、备份或临时文件。
- 开发文档放 `docs/`，本轮方案、审计报告、清单与截图统一放 `docs/audit/`，脚本放 `tools/`；临时产物和备份放扩展目录之外。
- 当前审计入口：[docs/audit/CODEX_AUDIT_REPORT.md](docs/audit/CODEX_AUDIT_REPORT.md)。原始优化方案中的“报告放根目录”已由作者后续的整洁要求调整；后续继续在此归档位置维护。
- 移动文档须同步修正 README、计划、skill 等引用，不移动运行/发布必需文件。

## 开始工作

当前优先级（作者2026-10-22最新调整）：世界系统、金鳞市存档、成就与行囊修复继续推进，同时按桌面《池子魔将：立绘与游戏 UI 美术重制任务书.md》开展美术审计与分阶段实装。武将AI全部暂停，只有作者再次明确提及才恢复；不得在其他任务完成后自动恢复。郝昭现有机制、AI、2/3体力与1护甲保持。普通名册现为100人。避免全历史上下文并行、反复全文读取或无变化重复回归，按本次变更运行必要检查。

1. 先看 `git status --short`，保留已有改动。
2. 阅读 `README.md`、`docs/dev-rules.md`、`docs/first-principles.md`。
3. 查当前任务对应模块，再读对应专题文档。计划看 `docs/plan.md`，历史看 `docs/CHANGELOG.md`、`docs/postmortems.md`。
4. 以实际代码、引擎运行实现和检查结果复核旧文档，尤其注意历史版本号、注释中的默认值、已废弃的动皮方案。

这是已有 Git 工程，不需要重新 `git init` 或 `npm init`。扩展自身没有 `package.json`，
`.js` 的 ESM 语义来自上层 `resources/app/package.json` 的 `"type":"module"`。
业务模块依赖上层 `noname.js`，不要直接用 Node 导入整个扩展来代替游戏验证。

## 修改位置

| 任务 | 主要文件 |
| --- | --- |
| 扩展入口与版本 | `extension.js`、`info.json`、`package.js` |
| 启动与配置 | `main/bootstrap.js`、`main/precontent.js`、`main/content.js`、`main/config.js` |
| 武将 / 卡牌 / 技能 | `character/index.js`、`card/index.js`、`skills/index.js` |
| BOSS | `core/csh_bossdata.js`、`character/boss.js`、`skills/boss.js`、`main/bossmode.js` |
| 游戏清单与结算参数 | `core/csh_registry.js`（唯一真源） |
| 钱包 / 结算桥 / 存档 | `core/csh_wallet.js`、`core/csh_shell.js`、`core/csh_page.js`、`core/csh_migrate.js` |
| 生涯 / 操作型成就 | `core/csh_achv.js` / `core/csh_pool_achv.js` |
| 面板 / UI 基座 | `core/csh_debug.js`、`core/csh_uikit.js`、`core/csh_theme.js`、`core/csh_layout.css` |
| 游戏和功能页面 | `games/` 下 11 个 HTML 页面 |

## 已有约定

- 2026-10-22作者最新限定：是否更换某名武将立绘由作者决定。当前仅授权郝昭；不得对其他武将评级、自动安排重绘、生成或替换。资源尺寸/路径清点不构成替换授权。三模块UI美术与非武将功能修复继续。

- 技能先核对描述、触发、filter/cost/content/mod、AI、storage 和联动；新增异步逻辑优先 `async content`。技能 ID、武将引用、译名与 `_info` 一起核对。
- AI 只使用公开信息；决策留在技能自身，不用全局 Hook 代替技能 AI。
- 作者最新方向：AI 审查主线为99普通武将及其实际获得/派生/响应技能；妖灵不计覆盖。UI 必要时可重塑；AI 世界持续推进。成就要有意义且量大管饱，不按旧R1提案减量或批量退休。
- 跨模块搬代码必须补齐本模块自己的 import；不要依赖另一个模块的局部变量。保留 ESM 与零 import 双载脚本的边界。
- 游戏清单、门票和回收率从 registry 派生；经济写入走钱包。结算成功 ACK 后才标记完成，失败释放认领；宿主共享会话守卫防重复结算。
- 新持久化字段核对 `csh_migrate.js` 的键表、清洗器和真实存储后端。`localStorage` 与 `lib.config/game.saveConfig` 不能混为一谈。
- 衍生功能按各模块的联机守卫休眠，保留武将本体的联机支持及专用联机手气卡行为。
- 宿主提示/确认框使用 `lib.cshUI`，浮层使用已有层级与字号 token；处理 body 缩放、右上角壳控件安全区和矮屏。细节见 `docs/ui-kernel.md`。
- 页面复用现有 `core/` 本地共享脚本与 CSS，不新增远程 UI 依赖；榜单等云功能沿用现有专门网络通道。
- 当前构建仅基础版静态立绘，`main/build-flags.js` 是标识，不是分档开关；动皮提案不代表已启用。
- 仅内容批次升版本，普通修复随下次内容发；版本三处保持一致。发布清单由工具生成，具体发布纪律见现有计划和脚本。
- 按已有备份约定处理业务改动，避免无关重构；不要将历史计划中的一次性 Git 重置命令当作初始化步骤。

## 验证命令

在扩展根目录运行：

```powershell
node tools/check.js
node tools/simulate_world.js
```

按变更范围补充已有探针：

```powershell
node tools/probe_pool_achv.mjs
node tools/probe_fx_media.mjs
node tools/probe_save_guards.mjs
node tools/probe_market_persistence.mjs
node tools/probe_market_browser.mjs
node tools/probe_confirm_focus.mjs
node tools/probe_kami.cjs
node tools/probe_eg_scroll.mjs
node tools/probe_first_batch.mjs
node tools/probe_interact_audit.mjs
node tools/probe_world_encounters.mjs
node tools/probe_career_rewards.mjs
node tools/probe_player_interactions.mjs
node tools/probe_career_achievements.mjs
node tools/probe_world_entry.mjs
node tools/probe_skill_ai.mjs
node tools/probe_skill_ai_decisions.mjs
node tools/probe_boss_ai.mjs
node tools/probe_winrate_ui.mjs
```

`check.js` 不直接覆盖 HTML 内联脚本；`simulate_world.js` 会检查 11 页内联脚本，
但这些检查不能代替无名杀实机、手机布局或联机验证。纯文档修改核对路径、事实和 diff 即可。
