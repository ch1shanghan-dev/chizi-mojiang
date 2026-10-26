# 三模块 UI 美术样板：S3 本地验证

后续状态：S4已使用12张真实资源扩展到已知主/子层，见 `ART_S4_UI_REPORT.md`。下文68/0和4资产是S3当时记录；旧互动夹具已由后续修正并通过121/0，catalog及当前门禁也已通过。

2026-10-22。S0证据见 `ART_AUDIT.md`；已生成4张素材及来源哈希见 `ART_GENERATED_ASSETS.json`；真实集成映射见 `ART_UI_INTEGRATION.csv`。本批是三个代表页样板，**S4全量替换尚未完成**。武将资源由独立人物任务负责，当前只获准处理郝昭。

## 变更与作用域

- 新增 `core/csh_art.js`，由 `main/bootstrap.js` 显式导入。样式选择器均限定 `#csh-dbg-panel.csh-art-sample`、`#csh-wr-panel.csh-art-sample` 或 `#csh-ia-panel.csh-art-sample`；没有给全局button/span/dialog套图。
- 三个真实主标题添加44×44装饰图，空alt、aria-hidden、pointer-events:none。图像失败移除装饰，原标题/文字及旧几何母题可用。
- 底板样板仅接调试「回满血/摸牌」、统计「导出」、互动「管理自定义台词/试发」。统计导出改为原生button并保留data-act原委托；互动两个直接监听节点改原生button并保留原监听。联机台词管理保持native disabled。
- 底板源图实测1024×205，端盖约150px；`border-image-slice:22 150 28 150 fill`，显示边8px/30px，按钮最小108×44、左右38px文字安全区。字号不缩小，绘图不包含文字。仅图片预加载成功才套艺术class，缺图保留原可读按钮。
- hover/pressed/focus-visible/disabled/reduced-motion由局部CSS控制，真实按压下沉2px；世界玩家视图不接本批调试标题/资源按钮装饰，已有世界重建代码保持。

运行代码仅增加上述美术接线与明确原生按钮变更；对照扩展外 `runtime-before-art` 备份，剔除这些新增行与两处标签替换后，四个已有文件逐字一致（换行统一后比较）。未修改统计记录/导入合并格式、互动概率/对象/冷却、武将AI、钱包或真实存档。

## 真实浏览器证据

`node tools/probe_art_baseline.mjs --art --out <LOCAL_EVIDENCE>/20261022-art-rebuild/s3-after`

四视口1200×820、720×600（body1.5）、390×844、915×412（body0.6）；真实Chrome、实际三模块与艺术层、独立内存宿主/存档夹具，非无名杀实机。**68项通过/0失败，108张截图/0缺目标面板**。检查涵盖：三图实际加载、原资源回调、真实CDP Enter只触发一次、实际指针按压2px、原生disabled不执行、样板有效44px目标、宿主按钮未受影响、reduced-motion、统计data-act原委托与重渲染只一图、互动管理原编辑器/无AI反馈，以及模块图/底板失败回退。截图前清理夹具Toast并冻结动画，操作反馈另有行为断言，不把过渡帧当坏图。

另补2张竖向页脚截图，滚动后统计导出/互动试发中心均由elementFromPoint命中其真实按钮。证据均在上述扩展外目录：

| 模块 | Before（S0） | After（S3） |
| --- | --- | --- |
| 调试资源 | `../portrait-debug-res.png` | `portrait-s3-debug.png`、`portrait-s3-debug-pressed.png` |
| 胜负统计 | `../portrait-winrate-list.png` | `portrait-s3-winrate.png`、`portrait-s3-winrate-footer.png` |
| 局内互动 | `../portrait-interact-main.png` | `portrait-s3-interact.png`、`portrait-s3-interact-footer.png` |
| 缺图回退 | 原DOM按钮 | `portrait-s3-missing-assets.png` |

上述相对路径均相对 `<LOCAL_EVIDENCE>/20261022-art-rebuild/s3-after/`。桌面/窄窗/横屏另有相同前缀的主样板、按压、缺图截图。手动查看竖向三页及统计页脚、横向互动后，端盖、文字与图标清晰，横向互动按原滚动容器可达；没有把全部原小控件44px问题宣称修完。

已有探针：统计UI **64/0**；世界入口 **104/0**。`tools/check.js --syntax` 语法/自由变量/import通过。完整门禁当前只剩E53（catalog未收新艺术层及4图），等待本轮统一重新生成catalog；新文件均在package.js已声明的core/image目录。

`tools/probe_interact_audit.mjs` 在现有csh_world提取夹具中抛 `ReferenceError: saveBlocked is not defined`；同命令对本批改前互动备份也抛相同异常，故不写成美术回归或通过。本批未改该旁支工具/业务；互动设置/原按钮路径由本次68项真实Chrome断言覆盖，完整互动行为仍需修正其独立夹具后回归。

## 未完成与后续

S4需要按 `ART_UI_ASSET_GROUPS.md` 合并语义组继续：次级、危险、页签底板优先；复制/转入/转出/检索/刷新/删除等少量通用物件按需生成。290个定位条目保持待审/待生成状态，独立集成表只标4个实际资产和具体样板位置完成。

未覆盖无名杀游戏实机、真实设备软键盘/触摸长按、联机共存、网络安装/更新、全部二级浮层和任意主题/扩展的极端长内容。当前没有性能提升百分比或加载时延结论。运行改动备份在扩展外 `runtime-before-art`；回退应只撤新增美术接线/文件与本批图像，不回退先前存档/世界修复。
