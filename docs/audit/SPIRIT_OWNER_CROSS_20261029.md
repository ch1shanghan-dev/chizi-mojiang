# 妖灵执行边界独立交叉复核（2026-10-29）

复核者blackjack_exit，只读复核spirit分支，未修改其源码或工具。当前`core/csh_aux_spirit.js` SHA256为`6c4b25c27d9bf2cfffb0a281662714f587007b8df192ca4a89053ce953e3839b`，与实施者source-proof一致。

未发现阻断问题。实际差异只在护主、助战、同契三个content执行入口：护主重查原filter（合法主人/存活/会话与存档代次/有效伤害/剩余次数），助战重取仍合法的主人并检查次数，小于3才标记再draw；同契重查原filter并再次取主人后才消费一次额度。所有配额和原效果仍为3次减1伤、3次摸1牌、1次回1血，复活不重置。

独立复验：

- 新实际模块/真实钱包隔离专项 **31/0**。
- 新完整真实宿主 **19/0**，0运行异常/未处理拒绝。原生die/revive、身份和swapControl链及排队content的故障注入均实际执行，钱包不变。宿主常见可选文件、普通牌面/语音资源404保留于请求日志，不能据此称零失败请求；本次无辅助妖灵别名语音新增请求。
- 额外独立反例 **14/0**：录像、status联机、config联机、辅助标记清除四状态×三技能；旧run恢复后旧妖灵引用不得支援；最后剩余一次时用Promise.all并行发起三种content各两次，次数严格保持3/3/1、只减1伤/摸1牌/回1血。

三种content在消耗次数前没有await，合法性复核与占额度在同一同步执行片段内，之后才进入draw/recover原生子事件，避免两个已经通过旧filter的执行同时越上限。未新增暗牌读取、AI决策或身份/胜负改动。

证据：`spirit-unit/spirit-owner-boundaries.json`、`spirit-host/host-smoke.json`、`spirit-host/native-owner-chain.json`、`spirit-extra/spirit-cross.json`。追加反例脚本`spirit-cross.mjs`复用原真实模块/钱包fixture，但用新的失效状态和并行执行断言。全部在隔离存储/临时profile/localhost只读服务，未接触玩家存档。

本结论限定本次执行入口、故障注入和原生受控死亡/复活链。完整自然战局、所有身份技能和实体设备仍待验；未把受控测试称为自然触发概率/全角色验证。
