# 当前工作板

更新：2026-11-05。**后续更新维护由WorkBuddy接手；Codex本轮只做交接收尾。** [最新交接](../handoff/WORKBUDDY_CONTINUATION_20261105.md)是当前入口，旧报告按发生时间理解。WorkBuddy已完成U0—U4发布可靠性五轮（发布字节 / 任务生命周期 / 镜像完整性 / 启动恢复 / 失败暂存与容量），逐轮报告见「已完成证据与历史」，改动归属与发布硬步骤见[差异说明](WORKBUDDY_U0_U4_DELTA_20261105.md)。**U5真机链路改由作者本人届时测试，WorkBuddy不执行。** 作者已授权一次性提交并把后续工作交由WorkBuddy自主推进；**4.0.16 已推送并合并 main**（`f8f802d`，`--rev` 0错，玩家更新源已实测生效）；未创建 tag/Release。后续每次新提交仍须重新跑 `--rev` 后再推送。backlog本轮推进成就通知常驻未读与跨重启归档，见[B1报告](WORKBUDDY_B1_FEEDBACK_ARCHIVE_20261105.md)。

## 版本与位置

- 当前工作目录：D:/CodexWork/chizi-mojiang/workbuddy/ext/app/extension/池子魔将；本地**4.0.16**（2026-11-05 升版，按作者要求），未提交修改必须保留。
- **4.0.16 已发布（2026-11-05，作者授权推送并合并 main）**：开发分支与远端 main 均为 `f8f802d`，提交级 `--rev HEAD` **0错、build一致**，完整门禁通过；玩家在线更新源 `raw.../main/` 已实测返回 4.0.16。此前首个本地候选为 `7e00900`（4.0.15）。安装包 `池子魔将-4.0.16.zip` 按 catalog.files + `catalog.js` 共 1036 条目导出，抽检哈希与清单一致。未创建 tag/Release。后续新提交须重新跑 `--rev`。
- 作者报告安卓现用4.0.15，精确build未核对；电脑另一份正式安装info=4.0.14，不能用它否定安卓报告。
- 定义12042=生涯2000+池子10042；规模已足够，继续质量/可靠来源/体验，不为数量新增模板。
- 静态采集路由872/2000；未匹配1128=1072组合+53世界+3彩蛋，不等于项目未完成百分比。

## P0：当前与未来更新可靠性

4.0.13事故用于回归，不再安排旧端专案。开发副本已修安卓目录竞态、错误后截断、可读错误和横屏布局；179/0及集成门禁是隔离证据，不是真机后续全部升级保证。

1. **发布字节一致性（本轮已修生成侧与门禁侧）**：历史核对main b169698的1033文件全匹配、开发5b266c6的1034文件中17个不匹配；当前4.0.15工作区候选修前实测**20**个不匹配（20个CRLF文件），修后0。已重生成catalog.js、新增`tools/catalog_git_bytes.mjs`、重写`tools/release.js`（含`--check`只读与`--push`提交后阻断）、`tools/check.js` E53加入全量字节对账；隔离索引候选tree 0错。仍未提交/推送，最终候选提交后必须再跑`--rev <commit>` 0错才可发布；手工commit/push路径无硬阻断。详见[U0报告](WORKBUDDY_U0_RELEASE_BYTES_20261105.md)。不得把旧开发分支直接发给玩家。
2. **统一任务生命周期（本轮已修控制器与门禁）**：`checkUpdate`/`kill`/`startUpdate`/手动恢复改为同一页面唯一任务 + 弹窗代次；提交/恢复阶段拒绝关闭与重开、不误报取消，下载阶段可取消，旧 finally 不解新锁，旧回包不写新弹窗；恢复建立与安装相同的忙状态与任务引用。新增`tools/probe_update_lifecycle_20261105.mjs`反例29/0，既有事务24/0、UI33/0、安卓IO6/0、备份40/0、联网0失败，完整门禁通过；E46/E48断言随重写更新并新增U1接线守卫。`csh_debug.js`已改，catalog.js已按发布字节重生成、0不符。详见[U1报告](WORKBUDDY_U1_UPDATE_TASK_LIFECYCLE_20261105.md)。跨窗口并发仍靠底层LOCKS，U3迟到回调/超时未做。
3. **镜像/缓存/完整性（本轮已修）**：`fetchFile` 改为按本次目录同一预期SHA-256逐源核验，旧缓存/HTML错误页/空/截断(Content-Length)/404/5xx/跳转全部拒绝并继续可信源，全源失败给可读聚合原因；事务层哈希校验保留不降级。`updateBases` 优先本次目录实际来源`st.candidateBase`，目录与文件同源起步、去重；`cshFetchText`加`redirect:'error'`与HTML拒绝。新增`tools/probe_update_mirror_fallback_20261105.mjs`反例11/0，既有专项全通过、完整门禁通过；catalog.js已按发布字节重生成、0不符。详见[U2报告](WORKBUDDY_U2_MIRROR_CACHE_INTEGRITY_20261105.md)。未做服务端不可变build URL，靠同一目录哈希+全量校验防混装。
4. **进程中断与启动恢复（本轮已修控制器侧）**：`csh_update.js`加同步pending标志（journal写入前置位、删除成功后清除）与`guardIO`超时观察层（超时只置uncertain，不清凭据、不宣布未写入、不释放锁；迟到回调不改结论）；新增`core/csh_startup_recovery.js`作为`extension.js`第一个业务import，未决恢复时返回不启用角色/卡牌/技能的最小受保护包并异步恢复，成功清标志且只提示重启（不自动重启、不写版本）。`csh_debug.js`更新面板在恢复状态不继续普通检查。新增`tools/probe_update_startup_recovery_20261105.mjs`反例10/0（5个中断点的下次启动结局、超时/迟到回调、受保护包、恢复标志、入口接线）；既有专项全通过、完整门禁通过；catalog.js重生成后**1035文件**、0不符。详见[U3报告](WORKBUDDY_U3_STARTUP_RECOVERY_20261105.md)。**未做**动态import+顶层await，ESM静态依赖仍会求值业务模块定义，受保护是「不启用package」而非「阻断模块求值」；U4/U5与真机未动。
5. **失败暂存与容量（本轮已修）**：`csh_update.js`把「整组保护」与「下载副本可清理」解耦，无journal的失败staging/prepared组可只清`next/`、`before/`与说明保留，bundle整组仍拒绝、journal引用时全保护，保留metadata写失败重试入口；新增`tools/lib/update_limits.mjs`（512KiB文本/16MiB文件，真源csh_online.js），`tools/release.js`生成前预检超限即拒并给分块/完整包/提高上限三条出路，catalog写入`limits`；`csh_debug.js`下载前按`limits`拒绝、备份面板说明设备空间不可知不虚报；`check.js` E53把上限声明与三处数字防漂移列为必检。新增`tools/probe_update_backup_capacity_20261105.mjs` 10/0，既有专项全通过、完整门禁通过，catalog 1035文件0不符。详见[U4报告](WORKBUDDY_U4_STAGING_CAPACITY_20261105.md)。**未做**：失败组整组清理（保守保留before/）、分块下载实现、设备空间读取；U5真机未动。
6. 作者当前安卓4.0.15+真实升级/同版修复、失败恢复、横屏缩放及存储权限验证。**作者已明确不需要WorkBuddy做真机链路验收，由作者本人届时测试**；本地不推进，也不拿隔离探针冒充真机证据。代码侧 U0—U4 已完成，一键只读复核用 `node tools/check_update_suite.mjs --out <D盘目录> [--rev <提交>] [--full]`（实跑11/11），改动归属与发布硬步骤见[差异说明](WORKBUDDY_U0_U4_DELTA_20261105.md)。

详细证据、动作和完成条件见[WorkBuddy交接](../handoff/WORKBUDDY_CONTINUATION_20261105.md)。没有“永远零BUG”证明；关键保护和必检不过不交付，不增加无必要审查。

## 后续其他待办

- 当前退隐26条与世界其余指标、跨来源组合的可靠首次采集；旧日期未知留未知。
- 武将泛化指标、重复/蕴含条件、长期成本；17个退隐152条件及156条文案已修，不重新列待修。
- **生涯2000条规模交互本轮已完整检查**：运行时确为2000条，新增规模专项19/0（33批全部可达、筛选/排序/焦点/三横屏、单次最大重绘278ms），并把既有专项固化493与循环上限10的过时断言修成2000与动态类别计数（142/0），见[B2报告](WORKBUDDY_B2_CAREER_SCALE_20261105.md)。池子80条分页、通知逐条阅读首批已做；成就通知常驻未读入口与本机最近200条分页归档（跨重启保留、换档隔离、写失败提示）已补，见[B1报告](WORKBUDDY_B1_FEEDBACK_ARCHIVE_20261105.md)。仍未做：长期全部通知无限保留与历史全文检索、数字分页替代33次「继续查看」，属刻意取舍。
- 妖灵50名特色增益/不挤牌桌布局、图鉴外装扮覆盖；奖励/装扮入口首批已做，皮肤素材作者提供。
- 德州桌级/真实补码重上桌/退隐联动，四款AI托管与音效整体升级；不做玩家难度设置。
- 横屏美术跨页、人物事件/回应和原生宿主体验；主体优先、低频按需、立绘更换由作者决定。
- 房间跨进程恢复、其他软保存、平台/自然终局/长期离线、国内受控服务和正式交付。
- SLG×GAL仍暂不开展；普通武将技能平衡/已暂停武将AI不自动恢复，小游戏AI按既有授权范围。

## 已完成证据与历史

[B1成就通知常驻未读与归档](WORKBUDDY_B1_FEEDBACK_ARCHIVE_20261105.md)、[U0—U4 面向提交的差异说明](WORKBUDDY_U0_U4_DELTA_20261105.md)、[U4失败暂存与容量](WORKBUDDY_U4_STAGING_CAPACITY_20261105.md)、[U3启动恢复](WORKBUDDY_U3_STARTUP_RECOVERY_20261105.md)、[U2镜像缓存完整性](WORKBUDDY_U2_MIRROR_CACHE_INTEGRITY_20261105.md)、[U1更新器任务生命周期](WORKBUDDY_U1_UPDATE_TASK_LIFECYCLE_20261105.md)、[U0发布字节修正](WORKBUDDY_U0_RELEASE_BYTES_20261105.md)、[退隐可达性](RETIRED_REACHABILITY_20261105.md)、[世界资金与路由复核](VERSION_BACKLOG_REVIEW_20261105.md)、[安卓更新事故](ANDROID_UPDATE_REPAIR_20261105.md)、[此前GitHub集成](GITHUB_DEV_SYNC_20261105.md)。更多按交接第8节定位，不全文重读所有历史。

## 执行边界

2026-11-05作者已授权本地提交、推送并合并main（4.0.16 已执行为`f8f802d`），并把后续工作决策交WorkBuddy。**仍不自动创建 tag/Release、不部署、不覆盖正式安装、不擅自再次升版**；后续每次推送前必须重跑`--rev` 0错。先保存git状态，不reset/clean现有工作。每轮做必要关键验证，文档不跑游戏，小UI不全仓审查；有修改/失败才定向补查。测试及原始输出全部D盘，清理自己的冗余，不删用户资料或唯一回退。交接后不自动循环或新增代理。
