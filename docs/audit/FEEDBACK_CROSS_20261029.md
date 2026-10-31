# 成就反馈生命周期独立交叉复核（2026-10-29，第二循环）

复核者debug分支，未修改反馈模块或其正式工具。最终模块SHA256：`ebdd9d4163648a8848940b3cc64dbbb4fff92b166221bb217c9db1e42d09f32a`。

最终无阻断问题。原修复的同卡compact/reduced同步保持同一displayId，不重复发声/领奖；后台守卫停止且visibility返回后重新核对范围；destroy清理本模块资源。钱包与奖励逻辑未触及。

## 交叉发现并由实施者封口的两组缺口

第一组是本轮最初pause改法引入的重入回归。pause(true)先写paused，scope触发changed→render后，关闭旧review会同步嵌套pause(false)，覆盖外层后台暂停。独立队列两情形（恢复锁/存档代次）旧源码2/0、初稿0/2；实际DOM也独立复现完整宿主23/2，两个失败都表现为后台接收新反馈时paused=false/current有记录/排1个显示计时器，无运行异常。实施者调整为scope判断及其嵌套回调完成后落实本次pause意图，最终独立原队列2/0。

第二组是原已有的初始隐藏缺口：创建反馈实例时文档已hidden，没有后续visibilitychange，队列仍默认未暂停。独立真实DOM追加后，重入修复版25/1，唯一失败为初始hidden仍排显示计时。实施者在四个全局监听安装完成后同步visibility()，最终原组26/0。此缺口与第一组新增回归分开记录，没有把旧回归失败改断言为通过。

## 最终独立验收

- 正式队列工具 **43/0**，包含原35与实施者追加的边界，未删旧断言。
- 独立队列重入反例 **2/0**，恢复锁/存档代次中的外层后台暂停均保留，当前卡为空、0计时器。
- 独立完整宿主+真实DOM **26/0**、0运行异常/未处理拒绝。该组在原23项上加入两组重入与初始hidden，共26项；不能与实施者正式27项互换计数。
- 实际DOM的100次详情开关/偏好切换与100次实例创建销毁后，模块专属监听/计时器/卡片/详情均归零；显示阶段峰值计时器2、卡片1、详情1，样式定义保持1份。后台/往返缓存/卸载/销毁后主动触发取消回调均未复活显示。实际钱包原文始终不变。

循环用真实浏览器DOM和模块API/checkbox/KeyboardEvent，未称100次真人或原生CDP操作，未测操作系统堆内存。根页面完整启动、原反馈共用UI实际恢复流程仍真实执行。浏览器使用临时profile/IDB/LS、localhost只读服务，未读玩家存档。

证据目录（均为本目录相对）：

- `feedback-host/`：初次正式23/0独立复跑。
- `feedback-reentrant-before.json`、`feedback-reentrant-current.json`：旧2/0、初稿0/2；`feedback-reentrant-final.json`最终2/0。
- `feedback-reentrant-bad.js`：初稿只读快照SHA6346c72…249df，安装代码未倒退。
- `feedback-dom-bad/`：真实DOM重入23/2。
- `feedback-dom-reentrant-fixed/`：重入已修、初始隐藏25/1。
- `feedback-dom-final/host-smoke.json`、`feedback-dom-lifecycle.json`：最终26/0。
- `feedback-unit-final/feedback-lifecycle.json`：正式43/0独立复跑。

最初生成独立host脚本时一次相对cwd指错外部工作区导致未启动，改为绝对路径后才获得上述实际宿主结果；该环境错误不计作业务通过或业务失败。

本次交叉范围已封口；Android/WebView/Electron后台策略、强杀/进程恢复和真实长时间游玩仍待验。主代理统一接入门禁、文档和清单。
