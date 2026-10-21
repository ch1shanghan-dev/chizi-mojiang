# 本地工程与非武将模块

## 定位

本机基线：`D:\noname\resources\app\extension\池子魔将`，宿主 package 1.11.6。
在其他电脑先定位实际根目录，以下路径均相对扩展根。

2026-10-20 研究时：本地 adcee8d，GitHub b71ccd484fcee48b17e4cf4ebd4dba3f7021a7fb。
两者 Git tree 同为 226834c16caa428d5485212f1a1e549d5a260650，差别在历史，不是文件内容。
这只是该时点结果，后续重新读工作区，不自动同步或重置。
扩展没有独立 npm 工程；ESM 由上层 package 决定，模块依赖上层 noname.js。

## 用户动作对应调用链

| 用户动作 | 入口 → 实现 | 数据/副作用 |
| --- | --- | --- |
| 设置或 F1 打开调试/世界 | config/bootstrap 懒加载 → csh_debug 的 open/openGames | 开发工具能改变对局，玩家入口与调试动作应明确区分 |
| 打开胜负统计 | config/bootstrap → csh_winrate | extension_池子魔将_winrateData，实际在 lib.config |
| 一局结束 | 多模块包装 game.over，胜率在原函数前捕获 | 引擎结算可能 swap 角色；重复安装或重复 over 不应重复记账 |
| 查看世界/入座 | csh_world 的 tick/seat/record、csh_games | 99 武将 + 50 妖灵，本地日序、资金、关系、事件环 |
| 局内互动 | csh_interact 的 fire/riposte/chorus/queueBurst | 局内 Map、世界恩怨、延迟 chat/表情，不改变战斗决策 |
| 打开游戏/功能页 | registry → csh_shell → games HTML | iframe 生命周期、买入、关闭确认、音乐和余额控件 |
| 游戏结算 | csh_page transport → shell-settle* → wallet | request/claim/ACK、共享 GUARD、流水与幂等 |
| 市场买卖/分红 | csh_market → wallet + game.saveConfig | 钱包和持仓分属存储路径，跨后端不天然原子 |
| 好感/礼物/契约 | csh_affection + shell | 妖灵身份、日限额、钱包与台词 |
| 成就领奖 | csh_achv / csh_pool_achv → shell/wallet | 两种口径，池子成就另有 pay 台账与流水复核 |
| 行囊导入/回滚 | save.html → shell-mig-* → csh_migrate | 预检、真实后端、内存重载、确认链 |
| 更新/安装扩展 | csh_debug + catalog/store | 网络、磁盘、取消/续传；研究中不实际安装更新 |

文件通常位于 core/，启动接线位于 main/。`character/`、`skills/`、`card/` 是本轮保护边界。

## 数据契约锚点

- csh_registry：CATALOG/ORDER/settlePlan，11 页中只有 4 个牌桌游戏。
- csh_wallet：KEYS、scheduleSave/flushSave、流水；不增加页面私有余额。
- 市场第三批补丁：commitMarket 将余额、持仓检查点和待补流水共同保存；marketPending 未完成时市场读检查点，config 同步确认后 completeMarket 清理。迁移 collect 扁平化检查点，未同步时不覆盖导入/回滚/重置；交付安装状态见第三批报告。
- 势力兼容：`core/csh_rules.js` 注册可选神将补选技；`main/content.js` 的cshEg*处理其他来源的势力面板与控制条；分别由config.js开关，缺键关闭。实际源码探针为probe_kami.cjs/probe_eg_scroll.mjs，旧宽度工具仅保留入口。当前未定位唯一外部责任扩展。
- csh_migrate：KEY_DEFS、clean*、cfgGet/cfgPut、导入内存重载；不能一律扫 localStorage 替代。
- csh_world：grudge(id,targetKey)/addGrudge(id,n,targetKey) 缺省目标为玩家。AI↔AI 调用需核对方向与 ID。
- csh_interact：pairKey、recordEvent、lastEvent、pairStats、pairImp 是局内记忆，不等于永久世界档案。
- csh_uikit：confirmBox/toast；csh_theme：层级/颜色/字号；跨文件常量保持一致。
  confirm 返回的 close 与 layer.__cshClose 共用幂等取消入口，替换实例也走它；取消回调可同步再打开弹窗。
- csh_shell：isGameSource/GUARD/ackToGame/closeShell；来源认证核对实际 contentWindow。

## 仓库文档

基础约定读 AGENTS、dev-rules、first-principles；UI 查 ui-kernel/ui-panel-cookbook，
引擎查 engine-notes，事故查 postmortems，排期以 plan 为入口（均在 docs/，AGENTS 在根）。
旧文档中“删 core 仍完整加载”“页面无本地 JS 依赖”、默认开关和动皮等口径要用源码复核。
