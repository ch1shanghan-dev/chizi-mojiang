# 隔离完整宿主冒烟（2026-10-22）

2026-10-23短版指南集成：新郝昭原生角色卡及模块打开/交易/重载链 **22/0**（外部20261023-haozhao-sxrm/host-ui）；新增CBY实际自然身份局 **14/0**（外部20261023-match-reward/host-natural），自然胜利2000→2080，重复终局不重付，后续真实成就领奖→3580/15功勋，整个host重载保持。见[MATCH_REWARD](MATCH_REWARD_20261023.md)。均一次性Chromium/真实未修改宿主，不是Electron玩家profile或全模式/安卓验收。

2026-10-23续验：新增一次真正自然终局/自然解锁/实际点击领奖/整宿主重载不重领流程，最终 **11/0**，证据在`host-smoke-2026-10-22T17-15-24-426Z`（UTC目录时间）。实际本地出牌6次、造成伤害累计4，成就出牌进度6、单次最高伤害进度2；自然领取`op_empty_dodge`使余额2000→2500、功勋0→5，重载仍保持且按钮禁用。详见[角色标识修复](POOL_ACHV_ACTOR_20261023.md)。这覆盖了下文原列为待验的自然终局和一次真实领奖；不代表全部80项阈值或全部模式已实战完成。

## 验证边界

`tools/probe_host_smoke.mjs` 从实际 `<NONAME_ROOT>/index.html` 启动安装中的无名杀 1.11.6，使用实际 service worker、ESM 引擎、扩展入口和原生 UI。Chrome 单独生成临时 profile；测试 origin 的 IndexedDB 只预置扩展启用、身份模式和调试全局等配置。首次 GPL 提示的已阅标记也只写该临时 origin。没有复制、读取或导入玩家 profile/旧存档，没有修改宿主、武将机制或 AI。

这是**真实引擎的隔离浏览器集成测试**，比单页 Chromium/VM 夹具覆盖更深入；它仍不等于 Electron、真实玩家存档、手机设备、其他扩展组合或全部模式的人工实机验收。

测试 HTTP 服务仅绑定 `127.0.0.1`，仅允许 GET/HEAD；BrowserAdapter 的 `/checkFile`、`/readFile`、`/getFileList` 是按本机 `noname/init/browser.js` 契约实现的只读兼容端点。写文件接口返回 405，`Home`、`UserData`、`User Data`、`.git` 和 `noname.config.txt` 不可读取。页面 CSP 的 `connect-src 'self'` 阻止外连。原生 alert 仅记录，confirm 默认拒绝，prompt 默认取消；扩展的 `cshUI` 确认窗保留真实 DOM/指针流程。

## 已确认的行为

外部证据目录：`<LOCAL_EVIDENCE>/20261022-art-rebuild/`。每次独立运行保存 `host-smoke.json`、逐条落盘的 `progress.jsonl` 和截图，异常时保留 failure 截图；所有 CDP 命令及浏览器启动/关闭均有超时，观察超时不会被解释成浏览器死亡。

| 路径 | 实际覆盖 |
| --- | --- |
| 宿主启动 | 未修改 index → 实际 service worker 激活/控制 → arena → lib/game/CSH → 扩展钱包及郝昭注册 |
| 池子世界 | 实际懒加载模块、玩家视图入口、150 人真实世界数据；卡片使用 CDP 指针点入 |
| 池子成就 | 实际壳 iframe 展示 80 条规则，新 profile 未解锁 0；关闭及重开；1365×900 和 844×390 截图 |
| 行囊 | 实际宿主桥清点 33 类；点击“一键打包”得到非空 v3 导出；关闭及重开；两档截图 |
| 金鳞市 | 实际入场确认 → iframe → 50 位挂牌 → 点击选 1 股 → 购买；旧余额 3000，成交后余额 1980，持仓 1，成本 1020；关闭及重开快照一致 |
| 实际存储 | `game.getDB('config','extension_池子魔将_goldfish')` 确认持仓/成本；整个宿主 reload 后余额 1980、持仓 1、成本 1020 仍保持 |
| 郝昭 | 实际 `ui.click.charactercard` → 原生 setBackground → 安装中的 400×472 图；原生卡展示 2/3 体力与 1 护甲；没有创建替身角色注册 |
| 身份对局 | 原生选将/托管流程进入真实对局，采集真实玩家 action history，不调用成就 `feed/unlock/save`、不伪造事件或改档制造解锁 |

最终模块/持久化验收为 **20 PASS / 0 FAIL**，目录 `host-smoke-2026-10-22T15-08-36-527Z`，覆盖上表全部模块、原生卡关闭、真实 IndexedDB 和整个宿主 reload。该轮局内状态附加诊断因探针读取不存在的方法而记为未验证；已修正只读诊断，并用独立 `--match-only` 补验，不重复模块轮。最终身份对局为 **4 PASS / 0 FAIL**，目录 `host-smoke-2026-10-22T15-10-28-713Z`；二者含重复启动断言，不能简单相加宣称 24 项独立覆盖。

较早的 `host-smoke-2026-10-22T15-01-28-020Z` 完整模块轮为 17/0。`host-smoke-2026-10-22T15-03-29-730Z` 已确认真实 IndexedDB/reload 和身份局伤害，但原生卡关闭断言有两处探针问题：只等待 350ms（宿主 `noname/init/polyfill.js:47` 的 `delete` 默认 500ms），以及把宿主常驻 `.popup-container` 也当成临时原生卡。failure 截图实际显示卡片已关闭。最终探针定位 `.charactercard` 所属层、点击其边角、等待卡片 DOM 真正移除，20/0 轮已通过。

## 真实集成发现

1. 最初启动夹具将首次 GPL confirm 默认拒绝，`noname/entry.js` 因而调用 `game.exit()`，不会执行 `boot()`。已修正为临时测试 origin 的已阅状态，不能将该次未启动归咎于扩展。
2. 初次在途浏览器的 Browser 级 CDP 正常、页面级命令不响应，renderer CPU 累计约 2.54 秒；单凭超时不能断言死循环或扩展错误。已将证据保存到 `host-smoke-2026-10-22T14-44-26-927Z/external-diagnostic.txt`，仅明确终止该隔离 Chrome/探针后重跑。
3. 修复前实际身份局到 round 1、`gameStarted=true` 且已出现伤害记录时，操作成就 `progress` 仍为空。已确认根因为 `core/csh_pool_achv.js` 的 `allowed()` 把 `status.videoInited` 当成回放禁止条件；本机正常模式源码 `mode/identity.js:413`、`mode/doudizhu.js:159`、`mode/versus.js:402` 都会为正常录像采集设置它。`noname/game/index.js:4645` 也以它判断正常录像是否就绪。主维护任务已窄修移除该条件，保留真实回放、旁观、联机及恢复守卫，相关隔离专项 43/0。
4. 修复后真实身份局采样为 `videoInited=true`、`video=false`，`gameStartFilter=true`、`phaseFilter=true`，`round=1`、`gameStarted=true`。实际 `progress` 已产生 `op_long_win/op_marathon/op_veteran=2`；真实玩家 `dc_wuzhi` 体力 3→2，damage history 为 1。局内无 Runtime 异常和 console error。此时本地玩家尚未出牌，因此这里验证了生命周期/回合进度接线和引擎真实伤害事件存在，**没有验证本地造成伤害的阈值成就解锁或领奖**。
5. 一次直接首次启动选将期间，`Runtime.evaluate` 超过 8s 观察上限，未据此判定业务故障。将命令上限设为 20s 后成功完成上述真实对局；默认已采用有界 20s，启动/关闭也有独立上限。

`/preload.js` 的 404 会走宿主 BrowserAdapter 回退，`/vue` 初始探测、favicon、可选皮肤目录等也可能出现 404；不能把这些请求一概算作扩展启动失败。首个 `.ts` 原始 MIME 探测随后由真实 service worker 的转译/重载完成，最终 `ts文件导入成功`。同时不能用“启动成功”消除尚未验证的页面/持久化路径。

## 后续验收状态

成就正常录像标识守卫及稳定角色标识均已修；真实身份局自然终局、出牌/伤害进度、自然解锁和一次实际领奖已验。仍未覆盖全部伤害阈值、全部成就、斗地主/对决实战、真实档导入或故障恢复；这些项目不能由身份局通过推断。

复跑命令（均生成新临时 profile，不复用真实 profile）：

```powershell
node tools/probe_host_smoke.mjs
node tools/probe_host_smoke.mjs --match-only --command-timeout-ms 20000
```
