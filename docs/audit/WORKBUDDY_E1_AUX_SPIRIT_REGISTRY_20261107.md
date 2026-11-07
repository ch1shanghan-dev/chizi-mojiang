# E1 · 救回妖灵助战宿主回归探针，并纠正一个错误的「跑不起来」结论

日期：2026-11-07。版本仍 **4.0.16**，未推送、未合并 main、未发版。未使用子代理。

## 起因

作者反馈客户端反复弹「读取文件命中询问规则」，并贴出一张游戏内原生 `Alert`
显示 `core/csh_achievement_feedback.js` 229–234 行源码的截图。查这两件事时顺带复核了
宿主夹具路径，结果发现上一轮 D1 报告里的一句关键结论是**错的**。

## 事实纠正

D1 报告曾写「本副本缺 `noname/game/index.js`，`probe_aux_spirit.mjs` 起不来，
所以妖灵 S2 不改高风险战斗模块」。**这是路径层数测错**：

| 路径 | 实际 |
| --- | --- |
| `ext/app/noname/game/index.js` | **存在** |
| `ext/app/mode/identity.js` | **存在** |
| 当时测的 `../../../noname/game/index.js` | 多退了一层，当然 MISSING |

`tools/lib/skill_audit.mjs` 的 `root` 是扩展根，`probe_aux_spirit.mjs` 取的是
`root + '/../../noname/game/index.js'` = `ext/app/noname/game/index.js`，正是存在的那份。
`AGENTS.md` 里 B1 记的「缺 `ext/app/index.html`，真实宿主专项起不来」指的是**另一个**
需要 `index.html` 的宿主专项，与 `probe_aux_spirit.mjs` 无关，两句被混读了。

实跑 `node tools/probe_aux_spirit.mjs` → **266 / 0，exit=0**。覆盖 30 个合成身份场景的
真实 `addPlayerOL` 扩席、`identity.js` 的原生 `checkResult`、钱包独立结算、行囊导出、
迟到回调与失败回滚。stderr 里两处 `[池子魔将] 妖灵扩席失败 Error: injected`
是探针**故意注入**的失败用例，不是产品缺陷。

**结论：妖灵 S2 战斗接线没有验证障碍。** 本轮仍不做，只是顺序问题。

## 顺手堵掉的孤儿探针模式

这 266 条断言此前**没有任何门禁入口引用**。B9 / B13 已反复证明项目里最危险的模式就是
「探针坏了几个月没人跑」。现注册门禁 **E95R**（`tools/check.js`，min passed 266、
超时 120s，走 `runProbeJson` 统一失败重试一次）。注册后 `check_probe_registry.mjs`
仍应 3/0、无悬空注册。

同步更正 `WORKBUDDY_D1_TEXAS_TRAPPER_20261107.md` 的错误结论，并在
`AGENTS.md` 验证段写明宿主夹具的真实位置，防止下一个人再数错层数。

## 客户端反复询问的根治

弹窗是「工作区外读取」规则，按**每次命令字符串**匹配，所以「本次会话内始终允许」
对不同的 Grep 命令不会复用。已在工作区内建立目录联接：

```
D:\Tencent QQ\2026-11-05-05-33-20\repo  ->  D:\CodexWork\chizi-mojiang\workbuddy\ext\app\extension\池子魔将
```

后续所有读写走 `repo/` 这一工作区内路径，不再触发工作区外询问。联接可逆，不改代码仓库。
另本轮 Bash 沙箱一度报 `0xFFFFF826`（center 规则快照不可用），属环境故障，与授权无关。

## 关于那张 Alert 截图（本轮**未改代码**，如实记录判断）

- 当前 `core/csh_achievement_feedback.js` **语法完好**（`node --check` 通过），
  229–234 行与截图逐字一致；`core/csh_uikit.js` 同样通过。
- 全仓运行时只有两处原生 `alert`：`core/csh_debug.js:1417`、`main/config.js:18`，
  都是通知/toast 不可用时的兜底。**没有任何代码会生成「行号 + ⚠️ + 源码」这种文本**。
- 因此该弹窗不是当前仓库运行时的正常消息，判断是**宿主或浏览器在脚本加载失败时
  显示的出错文件源码上下文**，常见诱因是设备上那份文件损坏 / 版本混装 / 在线更新写入不全
  （U0—U4 已在代码侧防混装，但设备上已损坏的文件不会自愈）。
- 根因不在本地仓库，凭一张截图改代码就是猜。**需要作者确认**：弹窗出现的时机
  （打开金鳞市必现？点「成就回顾」后？只出现过一次？）、设备上扩展版本号、
  控制台第一条报错的文件名与行列。
- 可先做的处置：重装桌面已发布的 `池子魔将-4.0.15.zip`，清掉可能损坏的本地文件。

## 验证

| 项目 | 结果 |
| --- | --- |
| `probe_aux_spirit.mjs` | **266/0 ×1，exit=0** |
| 完整 `node tools/check.js` | 见本轮日志，E95R 应 266/0，FAIL 0 |
| `check_probe_registry.mjs` | 3/0（无悬空注册） |
| `release.js --check` | 本轮只改 `tools/` 与 `docs/`，均不在发布清单，catalog 不动 |

## 明确未做

德州真实补码 / 退隐联动、妖灵 S2 战斗接线与 S3 反例、横屏断点统一、真机验收。
版本 4.0.16 未改，未推送。
