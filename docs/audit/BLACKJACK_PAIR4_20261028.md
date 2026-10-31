# 小节点：廿一点4对提示匹配NDAS桌规

日期2026-10-28。本地4.1.0不变、未提交/推送/发布。本节点只改一行业务分支，保留其他策略、发牌、赔付、余额、分牌按钮和普通武将AI。施工前1384文件备份在扩展外work/bj-small，564项受保护规则与图音未变。

复现：玩家两张4，庄家明牌5或6、当前可分牌时，bjBasic和实际renderHint返回“分牌”；而canDoubleNow明确禁止fromSplit手牌加倍。旧建议套用了允许分牌后加倍（DAS）的分支。

修复：按本扩展现有禁止分牌后加倍（NDAS）的条件，4对统一走“要牌”。只有庄家5/6且可分牌的两种组合改变结果，玩家仍可手动选择分牌，规则与资金逻辑均未改变。

依据核对：[Wizard of Odds六副牌S17分项表](https://wizardofodds.com/games/blackjack/appendix/9/6ds17r4/)及[H17分项表](https://wizardofodds.com/games/blackjack/appendix/9/6dh17r4/)的4,4对5/6行，分别区分DAS=No/Yes；NDAS要牌值高于分牌值。这里用于校准本地提示，不复制网站代码，也不宣称整套提示已最优。本扩展还有自定义赔付/连胜机制，其他策略与桌规差异另开节点核对。

验证：真实函数/渲染器隔离探针，修前8通过/6失败，修后14通过/0失败；覆盖5/6、加倍/分牌开关组合、A/8/10对原建议保留、实际fromSplit加倍禁止及提示文字。新增tools/probe_blackjack_hint.mjs，并接入主门禁E57B。没有重新做实体手机或完整自然对局验收，界面布局未改。

文件：games/blackjack/blackjack.html、tools/probe_blackjack_hint.mjs、tools/check.js；最终验收：主检查通过（0失败、2项既有告警），E57B为14/0；世界模拟188/0；git diff --check通过。日志在工作区work/bj-small。业务改动一行，辅助探针和接手记录同步。
