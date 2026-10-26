# 郝昭立绘按蚀心入魔重制 · 2026-10-23

按作者桌面《池子魔将_Codex短版工作指南》及随后“蚀心入魔”澄清执行。真实包是`sxrm`，27名成员/图片已核对，详见[完整资源和风格依据](RUMO_REFERENCE_20261023.md)。没有将名称相近的其他神魔系列混作参考，也没有对其他人物评级、生成或替换。

内置生图工具引用慢庞德、嗔曹仁、魔关羽、慢于禁四张真实本地原画，生成上半身近景、前臂透视、压住城防的郝昭。以眉眼、咬牙、斜向身体与碎裂木石表现陈仓守御；深蓝甲与火光辅助人物。当前替换上一版偏影视写实的本地稿，原发布图和上一版本地稿均保留扩展外备份。[实际完整提示](HAOZHAO_SXRM_PROMPT_20261023.md)。

- 运行路径：`image/csh_haozhao.jpg`，规格400×472，角色注册不变。
- 完整生成源：`<LOCAL_EVIDENCE>/20261023-haozhao-sxrm/generated-full.png`，实际1089×1444，SHA-256 `6c4229ed74c7888da555934c2afb85f22acdc7f67c1ce1f97add53ca66263ca2`。
- 运行JPEG SHA-256：`82e15f3920f4310ea5a654ad3a4cc0f54dd2dddaec11a3bf1c8a739e6a1f1c7c`；等比顶端裁切，不拉伸、不将插值伪称源分辨率。
- 原发布图SHA-256 `4fd2c96e1c283a45765ddaffacd13c36cb271b15a7dec8abe8a1c69f7bda9ac9`；上一版本地稿`9236afd6334d6a0c7e295e0c9ca2735343c0684a7057295c8a7e480006e7abdf`。备份及衍生元数据在上述外部目录。

[三版对比及小头像](ui/haozhao-sxrm/comparison.jpg)；[实际宿主CSS裁切总览](ui/haozhao-sxrm/runtime-dpr2.png)。脚本`prepare_haozhao_sxrm.py`只产出规格衍生与对比；`probe_haozhao_art.mjs`用实际角色注册、宿主setBackground源码和默认layout/menu样式，头像100/42、选将85×108、原画400尺寸与DPR1/2 **64/0**，26截图。面部区域按本图重新人工标注`120,108,125,132`，没有沿用旧图坐标冒充验收。角色/技能/记录观察器均与本批开始时备份保持完整源码及AST一致，文案精简属于此前已授权的独立批次。

复验命令：

```powershell
node tools/probe_haozhao_art.mjs --candidates <LOCAL_EVIDENCE>/20261023-haozhao-sxrm --baseline <LOCAL_EVIDENCE>/20261023-haozhao-sxrm --face-box 120,108,125,132 --selected-label 蚀心入魔画法 --out docs/audit/ui/haozhao-sxrm
```

实际未修改Noname宿主在一次性Chromium profile中加载扩展，原生角色卡正确读取新400×472图，截图`<LOCAL_EVIDENCE>/20261023-haozhao-sxrm/host-ui/haozhao-native-card.png`；世界/成就/行囊/市场打开、买入及整个host重载等合计 **22/0**。没有使用玩家profile，没有将图像夹具等同于真实牌局。

原生背水提示页面用新立绘重拍 **6/0**，见[技能文案报告](HAOZHAO_TEXT_20261023.md)。安卓、其他布局扩展、郝昭本人完整实际牌局仍待验证。武将AI没有恢复，版本未推进或发布。
