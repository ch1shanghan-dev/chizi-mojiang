# 验证：行为、界面与宿主

2026-10-26追加资料核查：本轮重新运行主门禁（通过，2项既有告警）、世界188/0、页面防护77/0、恢复67/0、生命周期67/0、迁移56/0、钱包52/0、BOSS实得18/0。日志在外部20261026-review-addenda目录；没有新功能/全平台/生产安全验收结论。武将AI继续暂停。

2026-10-26：新增`node tools/probe_page_save.mjs --browser`77/0，同组`--source <开工备份>/core/csh_page.js --shell-source <开工备份>/core/csh_shell.js --browser`36/41，JSON在外部20261026-recovery目录。原恢复67/0、生命周期67/0、迁移56/0、钱包52/0、市场38/0、主门禁通过、世界188/0。夹具等待市场初始化、保存桩返回与父窗隔离LS按真实接口补齐，未弱化断言；不是全平台实战。

2026-10-23短版指南验证：`probe_match_reward.mjs --browser`98/0（stub钱包+真实配置UI）；`probe_match_reward_wallet.mjs`51/0（实际钱包/迁移/模块+隔离事件）；`probe_host_smoke.mjs --match-until-over`自然身份终局14/0（外部20261023-match-reward/host-natural），胜利2000→2080及收据，成就实际领奖→3580/15后全host刷新保持；非所有模式自然实战。新郝昭按sxrm27真实原画重制，`probe_haozhao_art`需本批--candidates/--baseline/--face-box 120,108,125,132，64/0；真实宿主卡与模块链22/0，外部20261023-haozhao-sxrm/host-ui。技能43/0、Poptip6/0。见CODEX_SHORT_GUIDE_20261023/HAOZHAO_SXRM/MATCH_REWARD报告。主门禁/世界188/0/成就49/0等通过；未发布。

2026-10-23讨伐跨更新：`node tools/probe_bossrecord_upgrade.mjs --scope-before <LOCAL_EVIDENCE>/20261023-bossrecord-upgrade`41/0；同目录`--before`切换改前真实源13/28。原生Chromium IDB/LS+宿主真实清理函数，整个文档重载/迁移故障/观察器三分支/源码改动范围；非完整BOSS实战。外部before/after JSON，详见BOSSRECORD_UPGRADE_20261023.md。原恢复90/0、迁移56/0、市场38/0、主门禁与世界188/0通过；经济共同事务仍未完成。

2026-10-23讨伐恢复：`node tools/probe_bossrecord_recovery.mjs`90/0；`--source <LOCAL_EVIDENCE>/20261023-bossrecord-recovery/csh_bossrecord.js.before`同组7/83，JSON在该外部目录。实际记录/名册模块与隔离存储、配置/经济桩，非BOSS实战；原主门禁及世界188/0通过。未覆盖异步落盘失败/跨ZIP保全，见BOSSRECORD_RECOVERY_20261023.md。

2026-10-23最终增量：操作成就VM49/0（同组本次改前46/3）、页面92/0；完整宿主自然身份局11/0，真实出牌6/伤害累计4→累计出牌进度6/单次最高伤害2，自然解锁op_empty_dodge后实际领取500CBY/5功勋，整个host刷新保持且不重发。三模块艺术最终`--art --full-controls`172/0、188截图，外部20261023-art-final目录；coverage脚本新增--evidence参数，矩阵链接与截图存在均核对。主门禁与世界188/0通过；未据此宣称全部成就/所有平台已实战。

2026-10-22本地续修验收索引：市场升级 `probe_market_upgrade.mjs`38/0；操作成就 `probe_pool_achv_rebuild.mjs`40/0与`probe_pool_achv_browser.mjs`92/0；行囊`probe_bag_flow_rebuild.mjs`19/0；世界入口104/0/人物页80/0；胜率恢复`probe_winrate_recovery.mjs`127/0（改前8/119），原56/0、UI64/0；郝昭实际宿主CSS裁切`probe_haozhao_art.mjs`64/0；三模块艺术样板`probe_art_baseline.mjs --art`68/0，S4继续。互动原夹具已补提取真实世界saveBlocked与隔离LS，121/0。均保留隔离profile/fixture范围，不据此宣称完整游戏实机或所有写入口完成；未发布。报告在docs/audit/WORLD_SYSTEM_REBUILD_20261022.md、WINRATE_RECOVERY_20261022.md、ART_REBUILD_REPORT.md。

4.0.10已发布；发布后affection恢复专项 `tools/probe_affection_recovery.mjs` 97/0（旧5/92），原恢复/生命周期各67/0、世界188/0及主检查通过。本地新补丁未覆盖已发布ZIP，后续审核仍逐模块进行。

2026-10-22郝昭新增：`tools/probe_haozhao.mjs` 执行隔离的本机GameEvent/编译器/用牌结算/changeHp，`tools/probe_haozhao_ui.mjs` 验证官方poptip与立绘预览。完整游戏、联机及真实选将UI仍待实机；不继续旧将AI优化。报告按本次任务书例外放根目录HAOZHAO_IMPLEMENTATION_REPORT.md。

## 门禁与探针

项目根运行 `node tools/check.js`；涉及世界、结算或 HTML 时运行 `node tools/simulate_world.js`。
按范围使用 pool-achv、fx-media、save-guards、rank、egwidth 等已有工具，先读依赖/用途。
势力兼容使用 `node tools/probe_kami.cjs` **61/0** 和 `node tools/probe_eg_scroll.mjs` **49/0**；二者支持 `--source <改前模块路径>`，本轮改前为43/18及30/19。旧egwidth/egnoflash已委托真实源码专项，位置参数转自定义case；覆盖transform/zoom五档、滚轮/末项点击、动态面板/关闭还原。使用临时profile，不接真实存档，不代替完整游戏/安卓触摸。来源归因须有当前本机证据。
门禁既有技能译名与开发资料未入分发两类告警，不为消告警改本轮无关技能。

本 skill 的 `scripts/probe_noncharacter.cjs --root <项目>` 初始 3 PASS/5 FAIL。
退出 1 是发现业务缺陷，定位或 harness 错误为 2；需保留正常对照，不将失败改为忽略。
最小桩跑真实函数的结果不代表 CSS 或真实引擎已经通过。

第一批修复后的诊断为 6 PASS/2 FAIL，保留两项未修的 AI 失败。
第二批修复后为 8/0；真实互动模块的 VM 专项 `node tools/probe_interact_audit.mjs` 99/0（改前 22/77），
统计真实模块的 Chromium 专项 `node tools/probe_winrate_ui.mjs` 64/0（改前 44/20），含四尺寸/body 缩放与开关页行为。
这些结果不能外推为无名杀实战或所有面板通过；项目内 `docs/audit/CODEX_AUDIT_REPORT.md` 为本轮完整证据与待验项。
项目正式专项 `node tools/probe_first_batch.mjs` 为 56 项 VM/内存配置测试；
带 `--browser "C:/Program Files/Google/Chrome/Application/chrome.exe"` 再加 15 项真实 Chromium DOM，合计 71/0。
`--root <改前备份>` 可验证同一套断言的负例（本次 47/24），不加载真实引擎或玩家存档。

## 与本次改动有关的行为

第三批补丁验证：`tools/probe_market_persistence.mjs` **52/0**，`probe_market_browser.mjs` **12/0**（真实隔离 Chromium 存储），`probe_interact_audit.mjs` **113/0**，`probe_confirm_focus.mjs` **35/0**。原确认链/战绩浏览器回归 **71/0**；受限 Windows 启动 Chromium 可显式加 `--no-browser-sandbox`。这些不等于无名杀/安卓实机，补丁安装状态见项目 `docs/audit/THIRD_BATCH_20261021.md`。

| 范围 | 输入/顺序 | 可观察结果 |
| --- | --- | --- |
| 模态 | A→B、连点、Enter/Space/Esc、销毁后按键 | 只执行当前动作、旧框不确认、至多回调一次、恢复焦点 |
| 统计 | 四模式、接管/双将/十常侍/平局 | 角色/个人/阵营口径正确，不猜未定胜负、不重复记账 |
| 记忆 | 无旧事/有旧事、两对角色、开新局 | 当前不伪造成旧事、方向隔离、旧记忆不串局 |
| 延迟表现 | 排队后死亡/关开关/切局/回放 | 旧 chat/表情不发，正常同局可发 |
| 结算桥 | 成功/迟到ACK/重复/超时重试/换iframe | 兑现一次、失败可恢复、旧来源不影响新会话 |
| 经济存档 | 写失败/重启/导入旧档/补偿失败 | 余额/持仓/流水对账，不以内存真值代替持久化 |
| 更新 | 离线/部分失败/取消/恢复/素材缺失 | 可辨状态、可重试、不错误成功、不意外重启 |

## UI 矩阵（选择相关档位）

- 桌面参考 1366×768；矮横屏 915×412、844×390；压力样本 740×360；有条件加竖屏与软键盘。
- 原生与十周年 UI；宿主 zoom 约 0.4/1/2 为压力样本，浏览器 DPR 不能替代 documentZoom。
- 长昵称、大余额、空数据、多扩展、加载/空/失败/重试/完成、深浅主题。
- 量矩形、滚动可达性、实际接收点击、遮罩、Tab 和最上层 Esc；截图附状态和尺寸。
- 浏览器自动化可用时走 actionability 检查，不以 force click 或删遮罩掩盖问题。

DOM/VM 不验证 CSS；独立 HTML 不完整覆盖 Noname 全局样式/缩放；桌面模拟不等于安卓实机。

## 经济/存档隔离

用临时镜像、内存存储或测试档副本注入故障，观察持久化与重启恢复，不只查回调/文案。
不接触真实钱包，不输出真实兑换码、凭据和玩家存档。改结构时核对旧档、清洗器/迁移表、幂等和恢复；
只改字号时不扩成存档测试项目。

## 版本交付

明确升版时同步三处 version 和当前展示，运行 `node tools/sync_size.js`、`node tools/release.js`（无 --push）再门禁。
这些工具写元数据，不用于只读研究。结果说明实际变更、验证层级、仍存缺陷及远端动作；本地准备好不等于已发布。

项目新增专项：`node tools/probe_player_interactions.mjs`（34/0，原生道具/累计/迁移）、`node tools/probe_world_entry.mjs`（84/0，真实世界入口）、`node tools/probe_career_achievements.mjs`（130/0，真实生涯成就HTML与引擎、隔离宿主传输）。页面领奖ACK桩不证明真实钱包持久化。

2026-10-22并行审核批：新增花鬘/星星甘宁/远古八废实际AI选择链，累计7/99、另8人部分结论，实战未做。三专项67/0、34/0、34/0；交叉审核补真实VCard/实体去重、不屈错误救援与公开不可获得牌。世界生命周期67/0，修UNO多轮去重/离场亲历/零分摊与只读快照采用；迁移故障56/0+Chromium存储9/0+恢复页3/0，严格后端确认、原始恢复凭据、真实卸载防旧钱包复活、跨iframe迟到回包隔离、严格备份读取、钱包/世界内存采用确认。主门禁、世界188/0和既有市场/领奖/互动链通过。原始成就保留、版本4.0.9未发布；世界软存储和迁移恢复期间全局写锁仍待继续。详情见项目docs/audit/HUAMAN_AI_20261022.md、AI审查记录.md、WORLD_LIFECYCLE_20261022.md、MIGRATION_FAILURES_20261022.md。

2026-10-22后续并行批：李曦明仙途→煌元/丹→谒天46/0，明日香22定义/实际形态链51/0，黄盖苦肉/诈降/恢复31/0，累计10/99源码选择链、另8人部分结论，89人及全部实战未完成。交叉审核补朗枪真实次数/距离窗口、黄盖禁止回复时假救援和多点致命失体力，AST签名允许纯AI新增且保留底层事件参数；丹全卡文件只豁免自身ai。恢复守卫67/0（改前9/58）已覆盖钱包/官阶/任务/领奖/市场/世界及壳变更消息，修改内存前拒绝、失败ACK不占GUARD、持久凭据读失败/启动/异步CDK/卸载/微任务均受保护；迁移自身只越busy不能越持久凭据。affection/interact/poolAchv/winrate/bossrecord及页面直接键族仍需后续接入，不称全扩展冻结。共享139/0、原技能45/0、领奖29/0、生命周期67/0、主门禁及世界188/0通过。专题见项目docs/audit/XIANTU_AI_20261022.md、TONGBU_AI_20261022.md、AI审查记录.md、RECOVERY_GUARD_20261022.md。版本4.0.9未发布，原成就/规则/存档结构保留。


2026-10-26正式实施4.0.11：页面保存77/0、迁移57/0及浏览器12/0、BOSS事务17/0与升级41/0、羁绊44/0、德州1013/0及UI7/0、妖灵261/0及自然宿主11/0、挑战100种子参数18608/0及宿主5/0、网络17/0。完成范围、尚待服务器/广泛设备/100局实战的边界见docs/audit/AUDIT_4_0_11.md。武将AI继续暂停。
