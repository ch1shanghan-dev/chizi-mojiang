# 第三批：市场持久化、成对恩怨与确认框焦点

2026-10-21，基于 `8b2a76d` / **4.0.9**。作者要求按市场→恩怨→焦点依次推进。
本批在隔离副本实现并验证；交付时沙箱只能写临时目录，安装目录 `D:/noname/resources/app/extension/池子魔将` 未改动。
补丁保持 4.0.9，无提交、推送、tag 或 Release。以上是初次交付时状态。

**本轮应用更新（同日17:20）**：作者开放权限后，应用脚本已验证基线、备份并将补丁写入上述实际安装目录，同步本机skill。应用时主门禁通过（2项既有告警）、世界188/0。备份位于 `C:/Users/Chishanghan/AppData/Local/Temp/chizi-maintenance-20261021/deliverables/backups/20261021_172004_748224`。当前已安装，未发布、未做游戏实机。后续势力兼容工作见[专项记录](KAMI_SCROLL_AUDIT_20261021.md)。

## EC-01：市场持久化（已复现并修复）

触发：交易扣款后，宿主异步配置写入失败，再重新加载存档。旧实现会返回成功；同一隔离重启断言对改前源码失败，持仓丢失而钱包已扣款。
这证明故障条件下的缺口，不代表玩家真实存档已经发生过损失。

本机宿主 `noname/game/index.js::saveConfig` 调 `save(...).then(callback)` 而不返回 Promise；
`putDB` 在 request success 时兑现，仍早于整个事务 complete。故本批没有 await 这两个返回值。

改动：

- `csh_wallet::commitMarket` 在同一次严格 `localStorage.setItem(csh_wallet)` 中保存余额、哈希链、持仓检查点和待补流水。失败恢复内存，交易返回失败；普通钱包 add/spend 的防抖保持原状。
- `csh_market::read` 优先读取未同步检查点，返回副本；买卖、开户礼、分红和日期标记共同提交，避免先扣款后补偿。交易成功表示这份联合状态已保存，配置镜像允许稍后同步。
- `persistMarket/syncPending` 串行同步宿主 config，等待 IndexedDB transaction complete/abort；无 IDB 时按宿主 `configprefix + config` 后端合并写入。中止、超时、迟到完成、清理失败都保留检查点并重试，不再兑现资金。
- 流水带稳定交易 ID；流水写入失败把凭据留在钱包中，恢复完成前拒绝覆盖旧凭据。新交易可接续尚未完成的配置同步，旧完成事件不能清掉新检查点。
- `csh_migrate::collect` 把未同步持仓/流水扁平化导出到原有域；导入、回滚、重置在市场同步未完成时返回可重试状态。便携钱包不导出内部检查点。没有新增 localStorage 键，旧档仍可直接读取。
- 金鳞市保留宿主失败文案；超时只说“暂未收到结果”，避免误称交易已放弃。日结写入失败在快照/页面提示。

存档新增内部字段 `wallet.marketPending={id,state,entry}`；正常同步后删除。回退旧代码前须完成同步，旧代码不认识此字段。迁移文件继续使用原有 wallet/goldfish/ledger 结构。

验收：钱包失败不动余额/持仓/流水；配置失败后重建模块仍可读取已购持仓；重试只同步、不重扣；开户礼/跨日分红/欠付分红不重复；清理失败不丢检查点；其他钱包收入在同步期间保留。

## AI-03：恩怨方向（已复现并修复）

`csh_interact::addGrudge/grudgeOf` 显式传 owner→opponent。实际砸蛋/砸鞋记“被砸者→出手者”，队友阵亡记“复仇者→凶手”；目标权重与台词读取“当前行动者→目标”。
AI 对手使用世界名册 ID，玩家和接管角色使用原有 PLAYER_GRUDGE_KEY；未知角色、同一名册身份和玩家本人的 NPC 副本跳过。
世界双参 API 与已有对玩家旧账不变，不推测修正历史错误方向。没有调整对局技能或战斗 AI。

验收执行实际互动模块与实际世界 API 函数，检查逆向、第三人、玩家、接管、未知目标、实际抛掷、选人读取和复仇路径。

## UI-02：键盘、语义与焦点（补丁完成）

`csh_uikit::confirmBox` 使用原生 button、命名 dialog 和说明；Tab/Shift+Tab 在按钮间循环，Enter/Space 激活当前按钮，危险操作初始聚焦取消。
背景 inert 状态在替换/重入间共享并按原值恢复；关闭后恢复原入口，回调再开框也保留入口。高层系统窗口可拥有焦点和 Esc，下层关闭不抢焦点。
窗口捕获阶段消费确认框按键，避免先注册的宿主 document 监听跟着处理 Esc。清理 document/window/focusin 监听和定时器；长说明在卡片内滚动。

## 验证记录

| 检查 | 结果 | 范围 |
| --- | --- | --- |
| `node tools/probe_market_persistence.mjs` | **52/0** | 真实函数，隔离持久化后端与故障；含迁移、重启和金额/来源守卫 |
| 同脚本 `--root <改前源码> --baseline-only` | **2/1** | 同一断言能发现旧实现重启丢持仓 |
| `node tools/probe_market_browser.mjs` | **12/0** | 真实 Chromium localStorage/IndexedDB；request success 后主动 abort，重新装载模块恢复 |
| `node tools/probe_interact_audit.mjs` | **113/0** | 保留原 99 场景，新增方向及真实调用路径；同组对改前为 **101/12** |
| `node tools/probe_confirm_focus.mjs` | **35/0** | 原生键盘输入、焦点、遮挡命中、AX 树、四尺寸/缩放、重入/清理 |
| 焦点脚本 `--source <改前源码> --baseline-only` | **0/7** | 原生按钮/焦点/背景输入缺口对照 |
| `probe_first_batch.mjs --browser <Chrome> --no-browser-sandbox` | **71/0** | 保留确认链与统计回归；受限 Windows 启动 Chrome 需显式额外参数 |
| skill `probe_noncharacter.cjs --root .` | **8/0** | 最小桩适配属性 API 和共享关闭状态，保留原断言 |
| `node tools/probe_save_guards.mjs` | **12/0** | 行囊确认回调/取消守卫 |
| `node tools/simulate_world.js` | **188/0** | 世界、存档与桥；含 11 页内联脚本 |
| `node tools/check.js` | 通过，2 类既有告警 | E18 改为执行市场故障行为回归；E30 核对新的钱包提交来源守卫 |

焦点截图：[confirm-focus.png](ui/confirm-focus.png)，已人工查看。
浏览器仅使用新建临时 profile 和测试数据；没有读取玩家钱包。以上不代表无名杀、安卓、旧 Chromium、十周年 UI 共存或真实异常断电已经验收。
UI-04 的其他页面安全区/遮挡仍待专项，UI-03 入口分层与其余技能/BOSS 语义检查不在本批完成范围。

交付应用时应先对目标工作区运行 `git apply --check`，保留改前文件，再应用补丁与同步仓库内维护 skill 到本机副本。
