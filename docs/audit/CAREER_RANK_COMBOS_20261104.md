# 功勋同源组合首次资格（子任务）

2026-11-04。仅WorkBuddy独立副本。用户授权一名子代理同步，主代理处理个人对局组合；本子任务只处理功勋组合。不修改正式安装、版本、定义、条件、奖励或其他来源事务，不提交推送。

## 完成范围

9条cx_combo_merit_meritday_*同时依赖累计功勋与当日功勋，来源均为同一rank严格检查点。原分类“组合”未被rankRule覆盖，导致没有随实际功勋入账保存首次资格。本轮只在core/csh_career_observer.js的rankRule增加该族精确前缀识别，复用prepareRank、来源保存、聚合和通知路径。

每日功勋跨日重置后，已达标资格和原日期仍保留；来源写拒绝不改功勋、不通知，显式重试按真正接受时刻记录资格。来源接受而钱包聚合失败时保留来源证明，导出屏障拒绝遗漏，恢复聚合或冷启动后使用原日期。旧档已满足的组合以未知日期静默保留，不伪造本轮时间。手动领奖、防重、导入导出及受限模式保护保持。

## 文件

- core/csh_career_observer.js：仅rankRule局部一行增加 /^cx_combo_merit_meritday_\d+$/，保留主代理同时新增的playerComboRule。
- tools/probe_career_rank_combos_20261104.mjs：专属隔离专项。
- docs/audit/CAREER_RANK_COMBOS_20261104.md：本报告。

未修改AGENTS或CURRENT_WORK，由主代理统一整合。

## 验证

原实现专项21项为6通过/15失败；修复后21/0。原功勋来源探针32/0。结果JSON在D:/CodexWork/chizi-mojiang/workbuddy/outputs/gpt-rank-combos-20261104/。

专项从真实核心ROWS字段独立提取所有“merit+meritToday”组合，确认为9条。第一档使用真实rank.addMerit跨阈值并检查首次实际rank写入；高档矩阵通过真实addMerit受控大额输入，9条均在来源检查点持久化，不仅调用prog合成判定。高档输入是隔离验证，不宣称人类自然长期达成，也不改变游戏实际可获得收益。

包含首次来源和聚合日期一致、无自动付钱、Date构造时钟推进两日后的真实日切、重复保存无重复通知、手动一次领奖、完整重启、导出与导入、源失败与显式重试、聚合失败导出拒绝/恢复、源单独接受后重启静默恢复、旧档未知日期和联机/录像不采集。测试开发中仅改Date.now未影响new Date()日切，已改为隔离Date构造器推进，最终真正断言meritToday低于目标。

跨来源组合没有纳入rank检查点。全部测试在D盘隔离VM，无浏览器或C盘临时产物，不重复完整项目门禁。
