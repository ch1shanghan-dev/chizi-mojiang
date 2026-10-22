# AI 世界牌桌生命周期（2026-10-22）

本批应用在实际安装目录，版本仍为 4.0.9；未提交、发布或接触玩家存档。
用户已授权并行推进，本线程只改世界/牌桌分支；迁移线程另改同文件的存档分支。

## 已复核的问题与修复

| 真实触发 | 原行为 | 当前行为 / 源码 |
| --- | --- | --- |
| chips 会话中钱包封顶、按比例分摊取整为 0 或某席 stake 为 0 | 只在正 share 时调用世界接口，真实在座对手漏记亲历 | `core/csh_shell.js:settleSession` 为未分摊者调用 `settlePlay(id,false)`，仅记未定胜负相遇；正常正分摊继续使用原接口 |
| 同一 UNO 页重复上报结果 | 每次直接 `settleResult`，重复增加手数/胜负 | 宿主选座返回 table 身份；`cshWorldTableBegin/Result` 按桌、连续 round、在座 id 缓存成功结果并回放 |
| UNO 点击“再来一局” | 若只加一份 iframe 级守卫会阻止合法第二轮 | `Room.start` 成功后递增并登记 round，`viewFor` 带轮次，`reportBots` 如实带回；经济 GUARD 仍一次入场一次，不与世界轮次合并 |
| UNO 只选座、取消开局、预取座位后离场 | 单纯选座不应获得真实游玩记录 | 只有实际成功 start 登记过 round 才可回报/收尾，开局失败不登记；chips 未开局退款的 `seats:[]` 不从预取缓存补记 |
| 已开局 UNO 中途关闭、同帧换桌、开始下一轮 | 未分胜负的实际亲历丢失；直接壳关闭也可能漏发同桌好感，残留缓存可能在别页误发 | `cshWorldTableFinish` 只给当前轮尚无结果者记未定胜负相遇；同桌好感按既有一次性守卫收尾；`closeShell` 清除世界/好感缓存 |
| 换页后的旧 iframe 消息 / 换桌后的旧结果 / 不在座 id / 非法 won | 只检查当前帧，未区分桌和轮，任意非 bool 可被当成平局 | 继续使用来源校验，并严格检查当前桌轮、id 字符串及名单 own key、`won` 只能 true/false/null；非法载荷失败 ACK |
| UNO 结束回报失败后关页 | 结束动画旗标阻止再次上报 | `closePage` 在关闭消息前补报结束结果；成功重复消息由宿主回放，失败不会占用结果缓存 |
| UNO 开始按钮/返回开局页时选座回包迟到 | 旧回调可能操作新 room 或空 room，旧 table 可覆盖新 table | Bridge 忽略旧选座序号；`startGame` 复核 startingRoom 和页面存活 |
| 迁移恢复/重置删掉 csh_world 后旧内存仍在 | 后续世界写入可复活刚删掉的导入世界 | 新增 `world.reloadSave()`，采用当前 LS；缺失/坏 JSON 使用新世界；`normalizeWorld(false)` 只规整内存，不写盘、不 tick。读取失败返回 false，保留旧内存。可传严格预读的 parsed object/null，复制后采用、避免第二次读盘失败；迁移线程接入该接口 |

UNO 同牌数的方向未改：实际 `rankOf` 用座位序打破同分，真人固定先手 0 号，`left < myLeft` 与当前真实排名一致。没有把这个既有规则改成平局。

本批不改 registry、钱包金额公式、回收率、AI 资金上下限或自动互玩。新增亲历仍只来自玩家路径，不从 AI 全世界总手数回填。table/round/results 全在宿主内存，存档 schema 没有新增字段。

## 验证

- `node tools/probe_world_lifecycle.mjs`：**67 PASS / 0 FAIL**。真实世界模块 + AST 取出的真实壳消息/开关壳/结算函数 + 真实 UNO Bridge、Room.start/viewFor、reportBots/closePage；隔离 VM 存储，不打开真实存档。金额入口仅注入固定钱包响应以验证原宿主比例与世界资金结果，不能代替钱包专项。
- 同一探针对本批修改前的三份 TEMP 备份执行，**17 PASS / 50 FAIL**；包含新增协议缺失和上述行为缺陷，数字不代表 50 个独立缺陷。
- `node tools/probe_world_encounters.mjs`：**35/0**。配合迁移线程严格后端契约，只为 VM lib 增加 `configprefix:'probe_'`，仍使用真实模块。
- `node tools/check.js` 通过（既有 2 项告警）；`node tools/simulate_world.js` **188/0**；`git diff --check` 通过。

备份位于系统 TEMP 的 `chizi-world-lifecycle-20261022-003248`，没有写进扩展目录。复验历史基线可给工具传 `--shell`、`--uno`、`--world`；默认总是检查当前源码。

## 验收边界

- 未做无名杀实机、手机或完整真实浏览器牌局。上述是本机真实函数的隔离行为验证，不能声称所有游戏和失败后端均已验证。
- chips 继续按既有一次入场会话采集，不把多手牌伪称多个真实手数；本批未向德州/廿一点/斗地主增加逐手开局上报。
- 金额正分摊的世界调用抛错时，仍保留 `failed:true / delta:0` 和错误日志，不把名义金额冒充成功，也不在亲历兜底里重试该金额调用。
- 世界仍使用原来的软存储 `saveWorld/lsSet`，存储异常可能被吞；本批成功缓存针对世界函数返回，不是持久化 ACK。`Finish` 中显式失败会记错误，但关闭/换轮后旧轮内存身份释放，未补记结果不能保证再次重试。完整世界存储失败与跨重启事务恢复仍需后续单独处理，不能把本批视为该问题已解决。
- 迁移事务成功/补偿恢复的总体验收由迁移线程负责；这里仅验证 reload 接口遵循磁盘真值和无额外写入。
