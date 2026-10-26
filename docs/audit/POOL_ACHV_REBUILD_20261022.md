# 池子成就重建与收尾验收（2026-10-22）

2026-10-23最终续修：已修开局0座位→首轮赋座导致的出牌/伤害漏记，采集层采用稳定角色对象标识；非调试父页也接实际CSH迁移busy。当前VM **49/0**，同组本次改前 **46/3**，四尺寸页面 **92/0**；真实宿主自然身份局、自然解锁/领奖/整页刷新禁重复 **11/0**。详见[角色标识报告](POOL_ACHV_ACTOR_20261023.md)。下文40/46为此前阶段结果，不能再作为当前最终覆盖数字；实际仅验自然达成的部分条件，不宣称全部80项实战。

最终集成补修：完整未修改宿主真实身份局发现 `videoInited` 是正常录像初始化标记，原守卫仍会挡正常对局；已仅移除这一误判，保留 `video`、旁观、联机与恢复限制。另核对实际API后，恢复保护由不存在的 `persistenceBlocked` 改为钱包共享守卫、持久凭据和真实 `recoveryState`，页面还检查同源父级守卫。补入三项真实录像/回放/旁观及三项实际恢复接口/页面/读取失败负例，当前新VM **46/0**（下文40/0为先前收尾阶段结果），原规则45/0；最终页面再次 **92/0**，结果位于`ui/pool-achv-final-20261022`。真实引擎生命周期/回合进度 **4/0**，模块及IDB/reload **20/0**，二者重复启动覆盖不简单相加。详见[宿主报告](HOST_SMOKE_20261022.md)。本地造成伤害的阈值、自然终局及真实领奖仍须分别验证，不能由回合进度通过推断。

本批完成操作成就的真实采集接线、历史进度、手动领奖与存档往返验证。80 条操作成就的原 ID、分类、条件与奖励保留，493 条生涯成就未减量；没有修改武将规则或 AI，没有升版、提交或发布。存档沿用原键，新增 progress 与钱包/官阶 poolClaims 收据；历史 seen/独立领奖台账继续承认，不补发历史已领的零金额记录。

## 问题与实现

| 触发路径 | 原因与改动 | 源码锚点 |
| --- | --- | --- |
| 开局后造成伤害、打出闪、发动技能、判定 | 原过滤器在 run 不存在时挡掉 gameStart，并把事件基础 name 当成触发时机。现用 filter 第三个参数与 event.triggername，全球观察只在本机玩家执行一次；联机、录像、旁观、恢复期间休眠。 | core/csh_pool_achv.js 的 install、taps、filter；main/content.js 注入 _status |
| 整局统计与最后一击 | 使用/响应分别采集，技能取真实 useSkill 历史并按对象去重；判定只认 result.bool；己方受伤与敌方造成伤害分开。个人回合末统计连击/空手连巡，结算补最后一回合最大值及已确认死亡的当前伤害/死亡事件。 | feed、endTurn、skills、game.over 包装 |
| 武将累计与历史最佳 | 个人回合与全场推进分开，双将分别计胜且去重；重复 over 不重复计胜。胜场与本次解锁同写一次成就存档；数字进度保存历史最佳，只有武将胜场/不同武将胜场显示“累计进度”，旧 chars 可直接显示已有累计。 | progress、updateProgress、pump、game.over |
| 本局暂时写盘失败 | 不发送解锁提示，不把未落盘的命中记成本局已完成；暂存命中并在下一个真实事件重试，避免单次高伤害因当时写失败永久漏解锁。坏 JSON 保留，不用空存档覆盖。 | load、save、pump 的 unsavedHits |
| 页面点击领奖 | 页面只发规则 ID，宿主重新查询真实规则、解锁记录与已付状态，并从规则计算金额。钱包余额与 CBY 收据同写，官阶功勋与功勋收据同写；功勋失败返回失败 ACK，保留部分收据，重试只补功勋。 | core/csh_shell.js 的 shell-pool-ach-claim；core/csh_wallet.js 的 claimPool |
| 流水/领奖镜像失败与刷新 | 待补流水留在钱包收据，流水按 poolTx 去重，清理失败可重开恢复。seen/独立台账镜像失效时，iframe 可直接用钱包和官阶持久收据对账；只有 CBY 收据时仍显示待补领。领取中收到跨文档 storage 事件仍保留按钮直到 ACK，失败释放按钮。 | isPaid、recordPaid、reconcile；games/achv.html 的 state、render、claim |
| 导出导入 | cleanWallet/cleanRank 保留双收据，cleanPoolAchv 保留 chars/progress/got/seen；待补流水导出时扁平化进 ledger。整份与部分领奖状态经过真实迁移接口往返，导入后内存采用新钱包，重领不重复 CBY。 | core/csh_migrate.js 的 cleanPoolClaims、cleanWallet、cleanRank、cleanPoolAchv、collect |

页面以可搜索的完整条件列表为主体，提供分类、状态和排序；每项显示条件、数字进度、池子币/基础功勋和领取状态，取消页内清档入口。列表独立滚动，按钮不少于 44px，保留壳右上安全区。

## 已执行验证

- `node tools/probe_pool_achv.mjs`：**45 PASS / 0 FAIL**，保留原判定与历史台账断言。
- `node tools/probe_pool_achv_rebuild.mjs --out docs/audit/POOL_ACHV_VM_20261022.json`：**40 PASS / 0 FAIL**。真实安装源码在隔离 VM 执行，含 gameStart、triggername、对手负例、响应、判定、终局击杀、双将与重复结算、跨局最佳、写故障后重试、恢复锁、锁定/未知 ID、重复领取、钱包/官阶/流水/镜像故障、余额满、旧零金额已领，以及完整/部分收据迁移往返。重建初始同一组 31 断言对改前结果为 **10 PASS / 21 FAIL**，原结果保留在 POOL_ACHV_VM_BEFORE_20261022.json；新增断言不与该旧数字混比。
- `node tools/probe_pool_achv_browser.mjs --out docs/audit/ui/pool-achv-finish-20261022`：**92 PASS / 0 FAIL**。真实 Chromium、真实页面/钱包/宿主领奖分支、真实 localStorage，使用独立临时浏览器资料及合成宿主；尺寸为 **1200×820、390×844、915×412、720×350**，deviceScaleFactor 为 1、1、0.6、1.5。
- 四尺寸均以真实鼠标点击领取，验证落盘后延迟 ACK 时仍显示“领取中…”，ACK 后更新筛选；刷新重开保留已领与部分进度。再注入官阶写失败，验证失败提示与按钮释放，刷新重开后真实点击补功勋，CBY 不重复。搜索、状态筛选、末项可滚达、横向无溢出和壳控件避让均通过；四张截图已逐张查看。
- `node tools/check.js`：本次 E52 已通过。E52 改为检查宿主领奖复核、双收据、页面 ID 请求/对账与实际列表滚动结构，规则数量下限由 40 提升为 80，未删除原保护；本次执行时唯一失败为另行收尾中的 E50 行囊 ask 静态结构，交父任务统一复验。其他门禁与发布项不在本子任务改动范围。

浏览器结果与截图见 [独立验收目录](ui/pool-achv-finish-20261022/)，VM 逐项结果见 [JSON](POOL_ACHV_VM_20261022.json)。浏览器探针修复了模板字符串中正则转义和刷新后旧文档竞态，未修改其他探针的结果/截图。

## 证据边界

本机引擎源码已核对：noname/library/element/gameEvent.js 的 triggername 传递与 Begin/End/After 调度、content.js 的 emptyEvent 原名触发和判定 bool、player.js 的 logSkill 历史先写后触发。VM 与 Chromium 验证使用真实扩展源码和合成玩家/宿主，未打开玩家真实存档，也不等同于无名杀完整对局、安卓或联机实战验收。完整三模式实战仍按作者此前“先不实机”的决定保留为待验，不据本报告宣称全部实机完成。
