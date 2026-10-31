# G01小节点：6对子对庄家2的NDAS基础提示

2026-10-29。按主代理分工，实际只修改games/blackjack/blackjack.html的一行提示分支，新增tools/probe_blackjack_rules_hint.mjs。未改共享文档/门禁/catalog/版本、发牌/牌靴/庄家行为/赔付/收费/钱包，不提交或发布。其他脏工作树不处理。

## 问题与证据

实际canDoubleNow禁止fromSplit手牌加倍（NDAS）；bjBasic却对6+6、庄家2、允许分牌时推荐split。标准、豪赌、新手三档分别为6副S17、4副S17、8副H17。策略函数输入未区分档位，但这一NDAS分支三个实际档位均不应借用DAS的“对2分牌”。

核对数学作者本人组合枚举表的配对手牌行。列顺序为Stand、Hit、Double、Split(DAS=No)、Split(DAS=Yes)，不是误读允许DAS的列：

| 当前档位 | Hit | Split，DAS=No | 原始依据 |
| --- | --- | --- | --- |
| 6副S17 | -0.253323 | -0.274276 | [Wizard of Odds 6ds17r4](https://wizardofodds.com/games/blackjack/appendix/9/6ds17r4/)，Dealer2/Player6,6 |
| 4副S17 | -0.253283 | -0.268028 | [4ds17r4](https://wizardofodds.com/games/blackjack/appendix/9/4ds17r4/)，同一行 |
| 8副H17 | -0.253650 | -0.270820 | [8dh17r4](https://wizardofodds.com/games/blackjack/appendix/9/8dh17r4/)，同一行 |

原始表是组合枚举基础收益，不是本扩展实测胜率。该证据校准的是基础提示：本扩展有连胜加成、庄家资金限制、分牌最多三手（表中允许最多四手）等自定义条件，未做全牌靴/各倍率的最优策略求解，不据上述表宣称所有局面最优。此次不改变任何桌规或自定义收益。

## 唯一业务修改

原：if (pv === 6) return dv <= 6 ? 'split' : 'hit';

现：if (pv === 6) return (dv >= 3 && dv <= 6) ? 'split' : 'hit';

因此只在6对子对庄家2且可分牌时从“分牌”改成“要牌”。对3—6保留分牌，对7—A保留要牌；不可分牌时原先已按硬12处理，不变。实际分牌按钮仍可用，玩家手动选择不受限制。

## 实施前后验证

- 新探针：修前1639通过/14失败；修后1653通过/0失败。失败均属本问题：三档×加倍/投降开关的可分牌建议12项，以及真实renderActions→renderHint两种有效手牌状态2项。
- 1560项对子族×庄家明牌×三档×是否来自分牌×余额组合：推荐动作都对应真实renderActions启用的按钮；该矩阵证明动作合法，不证明每一个动作策略最优。
- 真实bjDealerPlay软17：新手H17要牌、其他S17停牌保留；NDAS double守卫、投降按钮首两张/单手限制、不可投降时硬16提示、非play隐藏提示均覆盖。
- 原4对独立探针probe_blackjack_hint.mjs仍14/0，未改其源码。
- git diff --check（仅两个目标文件）通过。主代理统一做全局主检查/世界/清单和共享文档；本代理未执行这些共享收尾，也不把VM验证说成完整宿主或自然对局。

备份：before/games/blackjack/blackjack.html，施工前SHA-256=41bc9dc71fa0c02136ca22b1ff7af5540752d163d25ea9308baa846065c70d5b。before.json/after.json为独立探针结果，pair4.json为原14项结果。原HTML与当前HTML除上述一行完全相同（后续验证见change-verification.json）。

复验：node tools/probe_blackjack_rules_hint.mjs --out <仓库外结果.json>；--source <备份根目录>可检验修前同一组断言。脚本仅读真实函数、隔离VM/最小控件对象，不访问网络或玩家存档。

## 只记录、未改动的后续审计范围

- 2/3对子对庄家2/3仍沿用统一分牌范围，需另按NDAS列与本扩展条件核对，不能因为1560项合法按钮通过就宣称策略正确。
- bjBasic未读取h17档位；H17相关软牌、对A硬牌与晚投降分支需要下一节点单独核对，不能把实际庄家H17动作测试当作玩家全套H17策略完成。
- 投降按钮限制已测试合法性，未做所有H17/S17/牌副数/保险窥牌路径下投降EV最优审查。
- 连胜倍率、牌靴消耗与庄家资金封顶对基础提示的影响，仍属以后专门策略设计，不在本轮顺手调整。
