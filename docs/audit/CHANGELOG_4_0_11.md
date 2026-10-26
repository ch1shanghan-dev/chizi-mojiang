# 4.0.11 追加维护记录

2026-10-26。恢复此前未提交成果并继续实施；武将AI优化暂停。版本同步extension.js、info.json、package.js和README，catalog含1011个运行文件。

- 羁绊统一累计阈值与档内进度，修复超过分母与错误品级显示。
- 德州增加透明手内场供、未跟注退款和整数事件账本，取消同场双重折扣。
- BOSS击破记录与实得共同保存，官阶/流水可恢复；重复死亡回调不重复发奖。
- 池子挑战增加爽快默认和原味困难，普通武将、其他模式与AI不变。
- 增加默认关闭的妖灵乱入：独立下家AI、有限真人辅助、辅助战绩隔离、满席/特殊局安全跳过。
- 完成旧页/迟到回包保护，保留市场、成就、世界、原档和已完成界面美术成果。
- 云端客户端统一HTTPS限时限量传输，修复榜单名次HTML编码，停止硬件指纹采集；公开文档路径脱敏。

验证结论与实机边界详见 AUDIT_4_0_11.md。服务器由作者稍后提供，本次没有生产部署。没有100局挑战实战胜率结论。

复现（扩展根目录）：

~~~powershell
node tools/check.js
node tools/simulate_world.js
node tools/probe_bond_progress.mjs
node tools/probe_affection_recovery.mjs
node tools/probe_texas_fees.mjs
node tools/probe_fee_ui.mjs
node tools/probe_boss_transactions.mjs
node tools/probe_bossrecord_upgrade.mjs
node tools/probe_bossrecord_recovery.mjs
node tools/probe_boss_reward_actual.mjs
node tools/probe_migration_failures.mjs
node tools/probe_page_save.mjs --browser
node tools/probe_market_upgrade.mjs
node tools/probe_world_lifecycle.mjs
node tools/probe_pool_achv_rebuild.mjs
node tools/probe_match_reward_wallet.mjs
node tools/probe_challenge_profiles.mjs
node tools/probe_aux_spirit.mjs
node tools/probe_net_security.mjs
node tools/probe_host_smoke.mjs --challenge-smoke --out <仓库外证据目录>
node tools/probe_host_smoke.mjs --match-until-over --spirit --out <仓库外证据目录>
~~~

宿主脚本使用本机当前无名杀源码、只读localhost服务、新Chromium配置；不会载入真人便携配置。图鉴/德州页面脚本用隔离固定数据。可通过--browser/--host/--out选择环境；UI动效不计入虚构业务验收。
