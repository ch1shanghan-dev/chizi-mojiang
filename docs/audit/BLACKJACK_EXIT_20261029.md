# 廿一点退出、重入与失败续局（2026-10-29）

本分支仅修改 `games/blackjack/blackjack.html`，新增 `tools/probe_blackjack_exit_boundaries.mjs`。版本4.1.0不变，未提交、推送、发布。所有测试只用隔离存储/临时Chromium与localhost只读服务器，不接触玩家存档。主代理负责门禁/清单/正式文档。

## 复现与实现

旧关闭流程没有退出互斥或销毁标记。等待结果时`showStart`可重设alive，直接手牌动作与保险未检查alive；“收工”独立调用结算，等待中仍可“再一手”。同一ACK可同时走多次关窗，销毁后的失败ACK会恢复alive。关闭开始就清空定时任务，若在发牌/庄家阶段结算失败，原续步已丢失，页面不能自然继续。

现将收工统一到`closePage`，等待期间阻止开局/下一手、下注/保险和设置操作；成功只关闭一次，销毁后迟到成功/失败不再关闭另一页或恢复旧局。失败恢复当前牌局并发送既有`shell-close-cancelled`，释放壳的等待状态。传输异常也保留页面，不再直接隐藏。

旧任务在关闭等待期间暂停；到期回调进入本页内存暂停队列，失败后只恢复一次，未到期的原任务继续等待；成功/卸载统一清理。原`laterHand`的会话/手数隔离保留。初始钱包/抽庄家迟到回调复用同一执行门，避免关闭中替换桌面或销毁后创建新状态。

`source-proof.json`验证94个原函数中仅既定生命周期函数有变化，新增`runSceneTask/finish`；下注动作只多了一条退出守卫，内部规则逐字一致。BJ核心整块、`bjBasic/renderHint`、`newState/newShoe/draw`、分牌/加倍合法性、庄家/结算函数以及CSS/HTML全部保持。单次收费/回收、庄家资金、牌靴/发牌、桌规/奖励/策略均未改。

## 验收

- 同一真实函数/Bridge/共享transport专项：**修前11/25 → 修后36/0**。覆盖重复收工/关窗/重开、data.ok=false/超时/旧ACK、异常失败、原任务续步、销毁/抽庄家回包、原下注保险、正常下一手与原payload。
- 完整隔离宿主 **10/0**：原生收工后暂存真实成功ACK，原生再一手/Enter均不变更筹码或发牌，放行后才关闭；第二桌控制失败ACK验证发牌续步恢复一次与保留原局，修复通道后收工成功。第一次是实际宿主/钱包结算后延迟成功回包，第二次是桥边界显式拒绝注入，二者口径分开。两组无运行异常/拒绝；915/640横屏截图已查看。
- 旧廿一点策略矩阵 **24365/0**、原小游戏规划 **42/0**、原小游戏AI专项 **23/0**。
- 新探针可移植默认根 **36/0**，目标文件语法与diff空白检查通过。主检查/全页仍由主代理统一运行。

首个开发探针遗漏共享transport的`requireSave`夹具，出现环境错误；补齐后才形成上述同组改前11/25数据。首个源码保护脚本误写BJ核心注释标记，修成实际标记后核对通过。原日志保留，均不算业务验收通过或业务缺陷。

复验：`node tools/probe_blackjack_exit_boundaries.mjs --out <扩展外结果.json>`；改前增加 `--source <本目录/before.html>`。工具`--root`可指定安装根。专项不操作真实钱包；完整宿主的合成终局不是自然牌局。Android/WebView/Electron实体平台与完整自然局仍待验，未建立跨进程恢复。

证据：`before.html`、`before-hash.json`、`before-final.json`、`final.json`、`portable.json`、`source-proof.json`、`matrix.json`、`planning.json`、`ai.json`、`host/host-smoke.json`与`host/blackjack-exit-pending-915.png`、`host/blackjack-exit-pending-640.png`。测试诊断只注入服务响应，产品没有新增测试入口。
