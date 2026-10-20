# 非武将缺陷与后续批次

研究业务基线为 4.0.8；2026-10-21 建立 skill 时升至 4.0.9。后续第一批已修复 UI-01/ST-01，其他条目仍待处理。
证据：R=隔离执行真实函数复现，S=源码确认但未做真实宿主故障实验，H=待实机假设，D=设计建议。
行号会变，优先按函数名定位。初始 8 场景中 3 PASS/5 FAIL，对应 4 类缺陷。
第一批后原诊断为 6 PASS/2 FAIL（两项 AI 失败）；专项回归 71/0，含 15 项 Chromium DOM。
同一专项对改前备份为 47/24，作为负例证明断言能够发现旧缺陷。未做无名杀或安卓实机。
第二批后诊断 **8/0**；AI 五类延迟路径专项 **99/0**（改前 22/77）；统计文字 Chromium 四档专项 **64/0**（改前 44/20）。统一记录在项目内 `docs/audit/CODEX_AUDIT_REPORT.md`。

## 第一批：确认链与漏记

### UI-01 确认框替换留下旧回调（R，P0；本地已修复）

- [confirmBox](https://github.com/ch1shanghan-dev/chizi-mojiang/blob/b71ccd484fcee48b17e4cf4ebd4dba3f7021a7fb/core/csh_uikit.js#L248)：新框只移除旧 DOM，旧 document keydown 等 fin 才解绑。
- 重现：依次开 A/B，只按一次 Enter，得到 A=true、B=true；按键前有 2 个监听器。
- 后果：不可见旧动作被新弹窗确认；这里只证明回调误执行，不声称实机已发生清档。
- 方案：持有实例结束入口，替换明确 cancel/dispose 或排队，同一 once 路径清理事件、焦点与 DOM。
- 验收：A 被替换不能被 B 的按键确认，Esc/背景/close/连点至多回调一次，20 次开关无监听器增长；焦点和语义另做浏览器验证。
- 当前实现：新实例先建立完整关闭入口，再通过旧 layer.__cshClose 取消旧实例；fin 清理事件/定时器/DOM 后一次性回调 false。旧取消回调同步新开弹窗时，最后打开者保留。生命周期已通过 Chromium，完整焦点圈定仍归 UI-02。

### ST-01 对决/国战漏记个人武将（R，P1；本地已修复）

- [capture](https://github.com/ch1shanghan-dev/chizi-mojiang/blob/b71ccd484fcee48b17e4cf4ebd4dba3f7021a7fb/core/csh_winrate.js#L233)：recordMe("chars") 在身份白名单条件内部。
- 重现：versus 无身份标签、guozhan 为 wei/shu 时，总角色表有写入，个人角色表为 0；身份和斗地主对照正常。
- 方案：个人角色入账与身份阵营拆开，保留真实玩家、双将、十常侍、接管视角与终局幂等口径。
- 验收：四模式都记个人角色，平局/重放/联机按原规则不记；双将角色出场可各一条，“玩家一局”不能变两局；不伪造不可恢复历史漏账。
- 当前实现：capture 的个人 chars 记录已移出身份条件；camps 保留原判断，存档结构与历史数据不回填。真实读写函数在内存配置中验证了四模式胜败、双将、十常侍、接管、重复玩家和禁用场景。

## 第二批：AI 因果与生命周期

### AI-01 首次回嘴误用旧账（R，建议 P1；本地已修复）

- [riposte](https://github.com/ch1shanghan-dev/chizi-mojiang/blob/b71ccd484fcee48b17e4cf4ebd4dba3f7021a7fb/core/csh_interact.js#L755)：先 recordEvent(victim,attacker,"hitBack") 再读同 pairKey 的 prev。
- 重现：空 Map 首次 egg 回嘴选 memHitBack，和热记忆对照相同。
- 方案：先读旧事件再写当前事实，核对其他消费者的方向，不能只按注释交换两行。
- 验收：首次普通 hitBack，真实旧 hit/hitBack 才引用旧账，saved 不误触发，两对隔离、开新局清理。
- 当前实现：读取 prev 后再 recordEvent；实际模块 VM 覆盖冷、hit、hitBack、saved，原概率/记录口径不变，游戏中待验。

### AI-02 延迟回嘴不复核对象/局状态（R，建议 P1；本地已修复）

- riposte 的 setTimeout 直接 victim.chat。chorus/burst 需单独查，不推定都已复现。
- 重现：排队后使 isAI(victim)=false，再执行任务，仍 chat 一次。
- 方案：本局 token/可清理任务队列，执行前复核会话、对象、开关、回放/联机；不能因过滤表现丢掉真实经济事件。
- 验收：对象失效、关开关、切新局、进回放后旧表现不发，正常同局仍发，定时器可回收。
- 当前实现：queueScene 统一检查 epoch、players 引用、角色在场/控制权/节点、总开关、台词开关、over/video/联机；reset/新局/终局清任务；关后再开不复活旧台词。覆盖回嘴、帮腔、连击、三连表情、濒死旁白，保留终局同步发言；99/0。

## 第三批：经济持久化

### EC-01 市场同步 write 不代表落盘成功（S，建议优先核查；确认坏账后按 P0）

- [market write](https://github.com/ch1shanghan-dev/chizi-mojiang/blob/b71ccd484fcee48b17e4cf4ebd4dba3f7021a7fb/core/csh_market.js#L902) 调 saveConfig 后直接 true；本机 game/index.js:9301 和上游同为异步 save(...).then(callback)，不返回其 Promise。
- 确认：同步回滚覆盖不到稍后的写盘失败。尚未在真实后端故障条件下重现最终坏账。
- 下一步：测试档隔离拒绝/超时/重启，查可靠的完成与失败接口，再设计异步交易、事务日志/补偿和待提交状态。钱包与持仓跨后端不因两次赋值变原子。
- 验收：失败及重启后扣款/持仓/流水可对账，取消重试不重复支付，不以 await undefined 当修复。

## UI 与结构候选（不是已复现视觉 BUG）

| 编号 | 依据与等级 | 方向 | 验收 |
| --- | --- | --- | --- |
| UI-02 | confirmBox 使用 span，无 tabindex/role/完整焦点圈定（S） | 原生按钮、dialog label、焦点进出/圈定 | Tab/Shift+Tab/Space/Esc、读屏和背景输入符合选定交互 |
| UI-03 | 世界是 debug 的 games 页签，设置另可 openGames（S）；混乱为体验判断（D） | 玩家世界与开发调试入口/文案分层，保留快捷路径 | 常用任务不增点击，危险调试不误触；先任务导航再视觉稿 |
| UI-04 | 多浮层/壳与两种缩放并存（S），具体遮挡待复现（H） | 焦点所有权、最上层Esc、壳安全区、复用tokens | 原生/十周年、矮屏/长昵称实际点击通过，无重复关闭 |
| UI-05 | 统计 KPI/选中页签/排序头光晕、辅助字 10.5px/对比不足（R；本地已修复） | 信息文字局部无光晕/描边，辅助字 ≥12px，局部 muted 色；保留标题/背景效果 | 真 Chromium 64/0，body scale .6/1/1.5 与四尺寸、外部样式不变；游戏中待验 |
| AI-03 | grudgeOf/addGrudge 省略目标，world API 默认玩家（S） | 核查实际谁对谁，显式方向 | A→B 不改 C→B 或 B→玩家，保留旧玩家账 |
| AI-04 | recency 以配对次数代替年龄（S）；体验需验证（D） | 先定义事件时序/候选再调权重 | 固定种子可解释、存档有界、展示不写经济 |

UI-01/ST-01 与 AI-01/02 已完成本地前两批，统计文字 UI-05 亦完成浏览器验证；EC-01 与 AI-03 的契约复核及其他界面专项待继续。
视觉改造围绕已复现任务，先不重写整个调试模块；纯搬文件不自动改善体验。
依赖包括浏览器/实机、玩家入口分层取舍、宿主真实存储错误通道。
每批在 docs/plan.md 记证据、改动、测试、存档影响和未覆盖项。研究完成、脚本通过、浏览器通过、实机通过、已发布是不同状态。
