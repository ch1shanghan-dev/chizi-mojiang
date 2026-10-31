# 廿一点剩余基础提示矩阵（2026-10-29）

本节点修复玩家实际会看到的桌规提示差异。版本4.1.0不变；未提交、推送或发布。仅修改games/blackjack/blackjack.html中的bjBasic、renderHint和一处说明注释，新增tools/probe_blackjack_strategy_matrix.mjs。牌组、庄家动作、按钮合法性、资金、分牌上限、投降和赔付规则均未变；source-proof.json验证这两个函数和注释之外源码完全相同。

## 已复现与修复

| 触发局面 | 原提示 | 修后基础提示 |
| --- | --- | --- |
| 2或3对子，对庄家2/3，可分牌 | 分牌 | 要牌（NDAS） |
| 标准/豪赌庄S17，软18对2，可加倍 | 加倍 | 停牌 |
| 标准/豪赌庄S17，硬11对A，可加倍 | 加倍 | 要牌 |
| 新手庄H17，软19对6，可加倍 | 停牌 | 加倍 |
| 新手庄H17，硬15或17对A，可投降 | 要牌或停牌 | 投降 |
| 新手庄H17，8对子对A，可投降 | 分牌 | 投降 |

bjBasic新增可选rules参数，renderHint传入当前state.tier；未提供规则时兼容原S17基础默认。H17软18对2和硬11对A仍加倍，S17软19仍停牌。不可加倍时软18/19停牌、硬11要牌；不可投降时硬17停牌、硬15要牌、可分的8对子继续分牌。手动按钮仍允许玩家选择其他合法动作。

## 一手依据与适用范围

依据作者Michael Shackleford的[4–8副牌基础策略文字版](https://wizardofodds.com/games/blackjack/strategy/4-decks/)：NDAS例外及全部四项H17调整均有明确说明。用[4副S17](https://wizardofodds.com/games/blackjack/appendix/9/4ds17r4/)、[6副S17](https://wizardofodds.com/games/blackjack/appendix/9/6ds17r4/)与[8副H17](https://wizardofodds.com/games/blackjack/appendix/9/8dh17r4/)组合枚举表交叉核对改变分支，H17晚投降以半注损失比较。源表是假定庄家已排除廿一点；本页afterInsurance确实先检查庄家廿一点再进入play。

以上是总点数基础建议。本扩展另有连胜倍率、庄家资金约束、三手分牌上限及真实牌靴消耗；本轮没有求解这些自定义条件的最优EV，不宣称每手精确最优或实测胜率提高。

## 同组改前/改后与回归

- 新矩阵修前24213通过/152失败，修后24365通过/0失败。13200项基础表对照、10920项实际renderActions→renderHint与按钮可执行对照、240项三张牌降级、5项非行动阶段隐藏。用明确静态参考表作对照，没有照抄实现判断树充当独立答案。
- 原NDAS6探针1653/0、原4对子探针14/0。
- 隔离完整宿主16/0：11组桌规真实提示、原生点击2对子手动分牌、原生点击H17软19加倍和无异常；实际宿主启动校验另包含在16项内。915×412与640×286截图已查看，提示和按钮可见。局面通过测试夹具设定，不冒充自然牌局。
- git diff --check目标文件通过；Git仅提示原文件既有混合行尾将来归一化，不存在空格错误。
- 首次受限环境运行宿主探针出现localhost fetch failed、未启动浏览器且0项断言；使用正常本地受控运行权限重跑后16/0。该次不是业务失败，未掩盖改前152项策略失败。

## 证据与复验

仓库外工作目录：work/multibatch-20261029/blackjack。

- before/games/blackjack/blackjack.html、before-hash.json、before.json。
- after.json、ndas6.json、pair4.json、source-proof.json。
- host/host-smoke.json、host/blackjack-h17-915.png、host/blackjack-h17-640.png。
- host.mjs只给只读测试响应添加夹具；玩家安装HTML没有新加测试入口。

复验：node tools/probe_blackjack_strategy_matrix.mjs --out <仓库外结果.json>。增加--source <before目录>可运行同一改前用例。该探针只在隔离VM中执行真实函数，无网络或玩家存档访问；宿主脚本使用一次性Chromium配置、独立IDB和本地只读服务器。

实体Android/Electron、自然连续对局、牌靴组成策略及自定义倍率最优策略仍未验收。主代理负责共享门禁、清单、交接文档与正式报告归档，本代理未修改这些共享文件。
