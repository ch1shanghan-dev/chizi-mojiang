# R05 UNO：关闭确认期间的换局竞态

2026-10-29。所有项目改动仅限`games/uno/uno.html`及新增`tools/probe_uno_round_boundaries.mjs`。共享钱包/壳/世界、版本、门禁、文档和catalog未由本代理修改。项目原有未提交成果保留，不提交/发布。施工前UNO全文与SHA-256备份位于本目录`before/`。

## 已确认的问题

UNO终局点击关闭后，页面先等待同桌战果和名次结算ACK，`closePending=true`。但结果页“再来一局”直接调用`Room.start`，返回开局调用`showStart`，两者原先都没有关闭期间的守卫；`startGame`同样可以销毁/替换房间。异步关闭回调返回后，会按**此刻的**view/room继续收尾，导致新一轮或替换房间被意外关闭。

此外，页面teardown后迟到的世界/名次ACK仍可运行原`finish`并再次发`uno-close`；原关闭函数也未因`alive=false`拒绝重复调用。这是页面生命周期缺口，不涉及调整UNO牌规/收益政策。

## 实际修改

- `Room.start`、`startGame`、`showStart`在关闭确认期间拒绝推进/替换房间，显示简短等待提示。`Room.start`用`typeof closePending`兼容独立纯引擎环境。
- `closePage`在页面死亡或已有关闭请求时直接返回。每次关闭的`finish`一次性执行，`finish/settle`执行前复核alive；失败仍释放closePending并保留原房间，允许玩家重新关闭或继续下一轮。
- 没有强制关闭失败页面，没有修改同桌战果身份、牌堆/行动、计分/名次、Shared transport或钱包。已成功结算的会话仍沿用现有缓存，不多收门票、不再额外付款。

`source-proof.json`通过完整文本等价核对：相对本轮前，仅上述六处生命周期增量；其余页面源码逐字一致。

## 验证结果

| 验证 | 结果 | 范围 |
| --- | --- | --- |
| 新执行级边界 | 修前20/7，修后27/0 | 实际UNO Room/Bridge/LocalNet/生命周期函数+实际csh_page.transport，受控ACK/定时器；非自然完整局 |
| 新真实宿主 | 10/0，0运行异常 | 实际无名杀宿主、真实隔离钱包；原生开局后用合成终局牌面，实际完成结算，再延迟真实战果ACK，原生点再来/返回均未推进；释放ACK后才移除iframe，余额没有二次变化 |
| 原小游戏规划 | 42/0 | 原有公开信息策略、毁房/托管取消和相关规划边界 |
| 原玩家边界 | 27/0 | 原失败留页、实际结算/迁移等既有执行级回归 |
| 世界生命周期（主代理补夹具后） | 67/0 | 同样67个断言，当前UNO与施工前UNO分别通过，非本批新增覆盖 |
| 新工具项目路径运行 | 27/0 | 已安装正式工具，使用必需的扩展外`--out` |
| 语法与差异 | 通过 | 新工具node --check、UNO限定路径diff --check |

新27项具体覆盖：关闭等待时再来/返回/新开、重复关闭合并、世界失败/超时和旧ACK、名次失败/data.ok=false/超时及旧ACK、自动结算与关闭共用一笔在途请求、销毁后迟到ACK、正常同房间5轮、原会话已结算缓存、进行中关闭不凭空排名、战果table/round/seat身份、失败后可继续、毁房/跨轮/取消托管的旧AI计时器、旧选座回包。

真实宿主工具仅在只读测试服务器响应里注入诊断接口/ACK暂存，不写发布HTML。为避免Windows并行浏览器负载令1200ms世界ACK在原生点击过程中提前超时，测试器仅在暂存开关开启期间把该世界回执的超时延长到10000ms；正常共享transport/实际钱包路径保留。本批丢ACK/超时语义由执行级工具真实transport的原1200/4000ms计时回调另行覆盖。截图与原始结果在`host/`；源码`probe-host.mjs`可复现该限定测试。

## 旧世界生命周期探针的共同夹具失败

`tools/probe_world_lifecycle.mjs`当前运行0/67，所有条目在公共`ensureChrome`夹具初始化时就抛`ov.setAttribute is not a function`，未执行到UNO逻辑。使用`--uno before/uno.html`换回本轮前源码依然0/67同一错误，因此不能归因于本补丁，也不能伪报为67/0。该工具不在本代理获准修改的文件范围，已通知主代理统一适配。两次原始结果为`lifecycle.txt`和`lifecycle-before.txt`。

后续主代理只补了ov的setAttribute/getAttribute真实属性存储桩，未删改67个断言；本代理核实`lifecycle-fixed.txt`和`lifecycle-before-source.txt`均为67通过/0失败。前者跑当前UNO、后者跑施工前UNO，说明旧通用67项原先缺少本次关闭竞态断言；本批新增27项的修前7失败证据仍保留。

## 仍未覆盖与交接

- Android/WebView、Electron原生设备、自然完整UNO多轮和实体后台恢复尚未验收；本次真实宿主终局是合成牌面，不称自然胜出。
- 当前“同房间再来一局”按原实现只对世界战绩分轮，经济settled为入场会话级缓存；本批明确保留该政策。若未来要逐局重新收费/付奖，应另案一起设计registry/shell/wallet，不能在本页私自reset结算。
- 共享门禁/当前工作板/版本与catalog由主代理统一集成。本代理没有改普通武将AI、角色资源、其他小游戏或玩家存档。

复验：`node tools/probe_uno_round_boundaries.mjs --out <扩展外结果.json>`；修前可用`--source <before/uno.html>`。工具默认解析实际项目路径，输出严禁位于扩展内。
