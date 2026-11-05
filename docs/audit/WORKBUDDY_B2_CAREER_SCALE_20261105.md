# B2 · 生涯页 2000 条规模交互检查（backlog 推进）

日期：2026-11-05。编制：WorkBuddy。性质：交接第 7 节「成就UI/通知」中「2000 条生涯页规模交互仍需完整检查」；在最终候选提交 `7e00900` 之后继续推进的 backlog 项。

## 缺口实证

- `core/csh_achv.js` 的 `BEGIN APPEND:career-expand` 块已把生涯定义扩容到 **2000 条**（493 基线 + 1507 扩容，`tools/achv_scale/data/career-expand.json`），VM 实读 `CSH_ACHV.defs.length===2000`。
- 但既有浏览器专项 `tools/probe_career_achievements.mjs` 仍断言 `493`，且「继续查看」循环写死 `guard++<10` —— 每批 60 条，最多只走 660/2000 条。类别「互动」也从 20 条变成 40 条。
- **实跑基线：126 PASS / 16 FAIL**（4 种尺寸 × 4 条固化旧事实的断言）。扩容之后这套回归一直没走完过，既会误导后来人以为功能坏了，也让「全部定义可达」形同虚设。

## 做了什么

- **新增 `tools/probe_career_scale_20261105.mjs`**：真实 `games/career.html` + 真实 2000 条定义引擎在 headless Chromium，只模拟宿主传输。19 项检查覆盖：
  - 初始 60 张、剩余计数「还有 1940 枚」与「全部 2000 枚」如实；
  - 33 个批次走完 2000 条，无丢失/重复、与引擎 key 集合一致、「继续查看」耗尽后隐藏、每批焦点落在首张新卡片；
  - 重置回 60；`claimed` / `ready` 筛选在 2000 行下逐条正确；`catalog` 排序与引擎顺序一致；搜索命中数与引擎过滤一致；空结果有恢复提示；详情展开与原生按钮；
  - 640×286 / 915×412 / 1365×768 三种横屏不横向溢出、控件 ≥44px。
  - 记录性能：33 批次、**单次最大重绘 278ms**、累计 4.56s。
- **修 `tools/probe_career_achievements.mjs` 的过时断言**（强度只增不减）：493 → 2000；循环上限 10 → 40（够走完 33 批）；类别「互动」改为按引擎实际条数动态断言（现为 40），并逐条验证类别归属，不再写死 20。
- **没有改任何运行源码**。`paintAchGrid()` 仍是「每批 +60、全量重绘」的实现，本轮只验证它在 2000 条规模下是否正确。

## 为什么不做增量渲染优化

278ms 是 headless Chromium 下最后一次重绘 2000 张卡片的峰值，累计 4.56s 是 33 次点击的总和（玩家是分批点的）。功能全部正确、布局无溢出。把全量重绘改成增量 append 要动筛选/排序/详情状态/焦点复位的公共路径，风险明显高于这点收益；真机 WebView 的性能证据属于作者自行验收的 U5 范围。**刻意不改产品代码**。

## 验证

| 项目 | 结果 |
| --- | --- |
| 新增 2000 条规模专项 | **19 / 0** |
| 既有 `probe_career_achievements.mjs`（4 尺寸） | 修前 126/16 FAIL → **142 / 0** |
| 复用同一夹具的 `probe_career_inline_detail_20261103.mjs` | **129 / 0** |
| 完整 `node tools/check.js` | 见 `outputs/wb-next-update/b2/full-check.log` |
| 发布清单 | 只改 `tools/` 与 `docs/`，不在 `catalog.files` 内；`release.js --check` 仍 0 不符 |

## 明确未做 / 残余限制

- 渐进加载在 2000 条下需要 **33 次「继续查看」** 才能看完全部；这是既有设计，本轮只确认可达与正确，没有改成数字分页。若作者认为体验不可接受，另开一轮。
- 其他探针（`probe_career_rewards.mjs`、`probe_career_source_20261104.mjs`、`probe_goal_recommendations_host.mjs`、`probe_task_definitions.mjs`、`probe_world_encounters.mjs`）里也出现 `493` 字样，多为历史基线或迁移兼容性引用，**本轮未逐一核查**，避免把不相干批次拉进来。
- 278ms / 4.56s 是隔离 Chromium 数字，不是真机 WebView 性能；慢存储、低端机、缩放下的体感由作者真机测试补齐。
- 其余 backlog（妖灵 50 名增益、德州桌级/补码、跨页美术、2000 条常驻未读 UI 等）仍需作者素材或玩法数值方向，未动。

## 边界

本轮没有改运行源码，也没有改 `catalog.js`。提交动作与 `--rev` 复核见工作板；**未推送、未合并 main、未发版**，玩家在线更新源仍指 main 4.0.14。
