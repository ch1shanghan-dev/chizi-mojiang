# 成就反馈恢复与反复开关生命周期（2026-10-29，第二循环）

本分支仅修改`core/csh_achievement_feedback.js`，新增`tools/probe_feedback_lifecycle.mjs`。最终源码已经封口；不改uikit/page/wallet/声音、武将/卡牌/图音、成就定义与奖励。版本4.1.0不变，未提交、推送或发布。主代理统一门禁、清单及共享文档。

## 已复现的旧问题

1. **恢复结束后反馈仍暂停。** 详情打开时进入存档恢复锁，scope会清掉旧记录并关闭详情；旧pause先拒绝范围再更新状态，关闭详情的pause(false)未生效，后续反馈可收录但不显示。使用真实共享UI、恢复凭据和新反馈在完整宿主复现。
2. **同一卡片元数据不随界面变化。** 同displayId的render直接返回，卡片显示后打开调试面板，compact仍false；减少动效偏好也无法刷新该卡片标签。
3. **后台守卫仍续排。** 后台显示计时已暂停，但反馈自身仍留一个每350ms续排的守卫；真实DOM仪表测得1个。
4. **初始化时已后台，首次显示没有暂停。** 创建模块时document.hidden已true且未再触发visibilitychange，旧默认paused=false，首条反馈会在不显示DOM时排显示计时。此项由另一代理独立真实DOM确认。

## 最终实现：四处局部变化

- **pause在scope执行或拒绝后落实本次暂停意图。** 范围不允许也更新paused并清理计时；scope允许则在其同步changed回调返回后重新落实外层value。这既让恢复中关闭详情能够解除暂停，也避免旧详情关闭时的嵌套pause(false)覆盖外层后台pause(true)。销毁后的pause仍拒绝。
- **同displayId仅刷新compact/reduced标签。** 保留同一显示实例，不重新入队或发声，不重复发奖；下次既有350ms可见守卫检查即可跟随面板变化。
- **后台不续排守卫。** 守卫只在文档可见且有卡片/详情时存在。后台显示和守卫计时都为0，前台visibility事件检查范围后恢复。
- **构造时同步visibility。** 四个监听注册完成后即读当前文档可见性，不依赖以后一定会出现的事件。后台创建的实例首条反馈保持排队、0计时；回前台后才显示。

所有CSS、每波3项动画预算、最多检查1000输入、200条本次记录、seen上限、去重/领奖口径及默认静音保留。`source-proof.json`通过逆向替换证明除了这四处变化，整文件逐字一致。

## 最终同组验收

| 检查 | 原始源码 | 最终源码 |
| --- | --- | --- |
| 正式新队列43项（原35不删+8新增） | 40通过/3失败 | 43通过/0失败 |
| 正式新完整宿主27项 | 21通过/6失败 | 27通过/0失败 |
| 原队列35项 | 历史通过 | 本轮35/0 |
| 原完整宿主31项 | 历史通过 | 本轮31/0 |
| 另一代理独立真实DOM26项 | 中间版25/1确认初始hidden | 最终26/0 |
| 另一代理独立重入2项 | 原始2/0、中间修复0/2 | 最终2/0 |

原始与最终完整宿主均无运行异常或未处理拒绝。中间版41项/23项验收先通过，但随后独立代理发现同步重入回归，不能据其宣称最终完成：最初将paused写在scope前，scope.changed关闭旧详情时嵌套pause(false)覆盖外层后台意图。该中间回归实际复现0/2，调整至scope返回后落实后2/0；两条队列和两条真实DOM用例均进入正式新探针。初始hidden另有实际25/1→26/0的独立证据。中间日志全部保留，最终比较使用`original-final`与`final-host/final-unit`。

## 100次循环与后台/卸载证据

真实浏览器DOM运行100次详情打开/替换/关闭与偏好切换，再运行100次实例创建/销毁：文档/窗口专属监听存活时保持4个；卡片/详情各最多1个；本模块计时器峰值2个，后台0个；关闭/卸载后0监听、0计时、0卡片或详情。主动调用已经取消的旧回调、重复destroy，均不能复活UI。同文档共享样式只有1份。

覆盖短/长后台（超过30秒）、往返缓存persisted pagehide/pageshow、正式pagehide、钱包代次、恢复中关闭详情、scope变更与后台同时发生、已经后台时创建、减少动效。完整宿主真实钱包字符串在全部显示压力前后逐字不变。所有合成成就均注明仅用于展示，不计真实解锁或领奖。

仪表只包装本模块自己的document/window事件及计时接口，没有全局替换引擎计时器。100次循环通过模块API和真实DOM checkbox.click/KeyboardEvent执行，不冒充100次真人/CDP原生点击。原完整宿主31项另保留原生点击、实际ACK/手动批领及布局。本轮没有测操作系统堆内存，不声称全宿主零监听，只验证本模块资源不增长。

测试使用临时Chrome profile、独立IDB/LS和localhost只读服务；无玩家存档访问。原始源码通过测试响应提供before.js，安装代码未倒退。少量宿主可选文件404保留在请求日志，不把零运行异常说成零失败HTTP请求。语法及限定文件diff检查通过，截图已查看。

## 复验与证据

```powershell
node tools/probe_feedback_lifecycle.mjs --out <扩展外目录>
node tools/probe_feedback_lifecycle.mjs --host --out <扩展外目录>
node tools/probe_feedback_lifecycle.mjs --host --source <本目录before.js> --out <扩展外目录>
```

新工具`--out`是目录，默认输出feedback-lifecycle.json；加--host输出host-smoke.json和feedback-dom-lifecycle.json。--root可指定根，默认从工具位置派生。

外部证据：`work/two-agent-cycle2-20261029/feedback/before.js`、`source-proof.json`、`original-final/`、`final-unit/`、`final-host/`、`original-unit-final/`、`original-host-final/`；独立交叉证据在另一代理`debug/feedback-cross-review.md`与相关JSON。中间重入回归备份`before-reentrant.js`、`reentrant-before.json`和`reentrant-after.json`保留。

Android/WebView/Electron真实后台策略、强杀后重启、长时间自然游玩与实体音频听感仍待平台验收，本分支没有新增跨进程房间恢复。当前源码不再扩大范围。
