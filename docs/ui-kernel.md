# 界面与网络基座（2026-10-18 · 第十八批续）

> 起因：作者实机连续报了三个「看起来是尺寸问题」的 BUG（导入框装不下、势力面板压扁选项菜单、奖励提示一闪就没）。
> 结论：**它们不是三个尺寸问题，是同一类架构债** —— 扩展在引擎的「被缩放坐标系」里，用
> 全局选择器、原生弹窗、各写各的浮层、各写各的 toast 拼界面。本文把这类债一次讲清，
> 并给出唯一入口（`core/csh_uikit.js`）与门禁（E48）。
> 以后写面板/提示/联网前，先过本文。

---

## 1. 三个坐标系（90% 的「尺寸不对」都出在这里）

| 环境 | 谁在里面 | 尺寸单位 | 铁律 |
| --- | --- | --- | --- |
| **A. 引擎坐标系** | `body` 及 `#window` / `#arena` / 引擎 dialog | 局部 px（会被 `transform:scale(documentZoom)` / `style.zoom` 再缩一次） | 要"占屏幕多少"必须 **屏幕 px ÷ 实际缩放**；`vh/vw` 在这里是**局部单位**，不是屏幕单位 |
| **B. 顶层坐标系** | 挂在 `document.documentElement` 上的扩展浮层 | 真实 px / vw / vh | 扩展自己的面板、提示、确认框一律挂这里 |
| **C. iframe 页** | `games/*.html` | 页面自身 px | 禁 `vw/vh`（父页缩放过），用 `%` / `inset:0`（README 红线 #12） |

**实测数据**：手机 `documentZoom≈0.4`。在 A 里写 `70vh`，屏幕上只有 `70%×0.4=28%` 的高度；
引擎原生 toast 挂在 body 里，字号/内边距同样只剩四成 —— 这就是"手机端一闪就没、看不清"的真因。
反例（已修）：势力面板封顶 70vh → 选项菜单被压成 28% 屏高；正解：`(innerHeight - top - 8) / zoom`。

**工具**：`lib.cshUI.zoom(el)`、`lib.cshUI.fitPx(el, reserve)`。

---

## 2. 「同类困境」清单（全部真实踩过 · 规则即门禁）

| # | 困境 | 真实事故 | 现在的规则 | 门禁 |
| --- | --- | --- | --- | --- |
| 1 | A 坐标系里用 vh/vw 当屏幕单位 | 势力面板 70vh 在手机上只剩 28%；选项菜单被压扁 | 屏幕尺寸一律 `fitPx` / `÷zoom` | E45 / E48 |
| 2 | 全局选择器猜形态（`:has(.card.button)`） | 命中引擎主菜单 `.main.menu.dialog`，卡牌/武将页整块被裁 | 只认 JS 内容判定后打上的类（`.csh-egdlg`）；禁止全局 `:has` | E45 |
| 2b | **只认对话框，漏了控制条** | 2v2 冷/暖方势力走 `chooseControl` → `#control > .control`（不是 dialog）⇒ 只有身份场生效 | 控制条单独判据 + 限宽/横滚（`.csh-egctrl`） | E45 |
| 2c | 只认 `.caption`、且要求 ≥3 个势力按钮 | 有些模式标题在 `.prompt`、只有 2 个势力按钮 ⇒ 漏判 | `.caption,.prompt` + 对话框全文都认；阈值降到 2 | 目测 + 探针 |
| 3 | 内联样式只加不减 | 关掉滚动条开关后 70vh 仍粘在面板上 | 写样式的人负责 `unstyle`；开关关闭即还原 | E45 |
| 4 | `width:100%` + padding 不设 border-box | 导入浮层在竖屏右侧溢出 16px | 浮层根节点必须 `box-sizing:border-box` | 目测 + E48 |
| 5 | `#id div{display:block}` 压过组件 flex | 导入浮层按钮行失去 flex，窄屏挤成一团 | 组件选择器用双 id 提特异度；复位只复位 position/display 基线 | 代码注释 |
| 6 | 原生 `prompt` | Electron 直接抛 `prompt() is not supported.`，导入功能全废 | **全项目禁用**，用 `lib.cshUI.confirm` / 自绘浮层 | E48 |
| 7 | 原生 `confirm/alert` 样式与层级不可控 | 移动端白框、PC 端浏览器弹窗，和描金面板两个世界 | 统一 `lib.cshUI.confirm` | E48（confirmBox 在位） |
| 8 | 各写各的 toast（7 处） | 引擎 toast 挂在缩放 body 上 + `nowrap` + `innerHTML` + 串行 1.5s + z 9999 被面板盖住 | 唯一实现 `lib.cshUI.toast`，6 个模块必须优先走它 | E48 |
| 9 | 动态文案进 `innerHTML` | 昵称/技能名带尖括号会破版；引擎 toast 就是 `innerHTML` | 提示/确认框一律 `textContent` | E48 |
| 10 | z-index 各写各的（999/9999/999990/1000002/1000003/2147483000） | 奖励提示被胜负统计/调试面板盖住 | 统一档位表 `CSH_Z`（panel 1000003 / modal 1000010 / toast 1000090 / system 2147483000） | 代码评审 |
| 11 | 单源网络 + 无超时 | 检查更新停在「正在检查…」；天下榜白屏 8 秒 | 超时 + 缓存 + 镜像（更新）；缓存先上屏（榜单） | E48 |
| 12 | 断网 = 白屏 | 天下榜每次进页先清空榜单 | 缓存先渲染，网络回来再覆盖；失败保留缓存 + 标注时间 | E48 |

---

## 3. 提示（toast）—— 唯一实现

```js
lib.cshUI.toast("成就达成「十三连」 +300 CBY");                 // 自动识别"获得"→ 描金
lib.cshUI.toast("金鳞市已收盘", { kind: "info" });              // 普通
lib.cshUI.toast("存档异常，已回滚", { kind: "warn" });          // 警示
lib.cshUI.toast("下载中 3/8", { key: "dl", merge: false });     // 同键替换（不累计 ×N）
lib.cshUI.toast("...", { theme: "paper" });                     // 调试面板浅色皮肤
```

行为保证：
- 挂 `documentElement`，**不随 body 缩放**；真实 14px；安全区避让；`z-index 1000090`。
- `textContent` + `white-space:normal` + `max-width:min(92vw,560px)`：长文案换行、零注入。
- 最多 4 条同屏；同键合并「×N」；超出**排队不丢**；单条 2.4~3.4s。
- 引擎 `ui.create.toast` 只作为基座缺席时的最后兜底（6 个模块里都保留，但永远不会先走）。

### 3.1 池子币 / 奖励类「一闪而过」清单（现状）

| 场景 | 发放入口 | 玩家看到什么 | 走的通道 |
| --- | --- | --- | --- |
| 小游戏自动结算（德州/斗地主/UNO/廿一点） | `csh_shell.js` `autoSettleText` | 「本局已自动结算 · 净赢/净输 N CBY · 回账 … · 余额 …」 | toast（reward） |
| 成就达成 | `csh_shell.js:1418` | 「成就达成「X」 +N CBY」 | toast（reward） |
| CDK 兑换 | `csh_wallet.js:1360` | 「兑换成功 +N 池子币（余额 …）」 | toast（reward） |
| 德州每日任务 | `texas.html:1409` | 「任务完成：… +N CBY」 | 页面 toast |
| 生涯大厅签到 / 连签 7 天 | `career.html:1607` | 「签到成功 · 连签 N 天 +N CBY」 | 页面 toast |
| 破产救济 | `career.html:1619` | 「救济已到账 +N CBY」 | 页面 toast |
| 讨伐首杀 / 每日首战 | `csh_bossrecord.js:192/199` | **只有对局日志**（game.log），无浮层 | 无 |
| 讨伐妖灵奖励 | `csh_bossrecord.js:275` | **只有对局日志**，无浮层 | 无 |
| 她的回礼（陪伴互动概率给 CBY） | `csh_affection.js` `rollGive` | 页面台词里带一句，局内只有余额胶囊变化 | 页面 |
| 金鳞市体验金 / 日分红 | `csh_market.js` `pay` | 页面净值变化，无独立提示 | 页面 |
| 天下榜缠头（别人给你打赏） | `rank.html` | 页面状态行 | 页面 |

**结论**：真正"局内一闪而过"的是前三条（结算/成就/CDK）。它们现在走同一套基座：
不被缩放、可读 2.4~3s、连发不丢。讨伐首杀/妖灵奖励目前**没有浮层**——这是产品选择，
若要补，直接在 `wallet.add` 成功处调 `lib.cshUI.toast(..., {kind:"reward"})` 即可（一行）。

---

## 4. 确认框

```js
lib.cshUI.confirm({
  title: "删除武将战绩",
  message: "确定删除【曹操】在「身份场」的战绩吗？\n删除后不可恢复。",
  ok: "删除", cancel: "取消", danger: true,
}, function (ok) { if (!ok) return; /* ... */ });
```

- 自绘、挂 `documentElement`、`z-index` 走 `CSH_Z.modal`；Esc 取消 / Enter 确定 / 点遮罩取消。
- 已替换：胜负统计的删除/重置阵营/清空本模式。原生 `confirm` 只作为基座缺席时的兜底。
- 2026-10-21 第一批：替换确认框必须走实例的幂等取消入口（返回值 close / layer.__cshClose），旧回调只返回一次 false；不得只移除 DOM 留下 keydown。新实例先具备完整关闭入口，再取消旧实例，允许取消回调同步新开弹窗；只有当前实例消费按键，关闭时清理焦点定时器。`tools/probe_first_batch.mjs --browser <Chrome路径>` 已验证生命周期，不代表完整焦点/读屏或游戏实机已验收。

---

确认框 2026-10-21 第三批补丁：原生 button、命名 dialog，Tab/Shift+Tab 循环，Enter/Space 激活当前按钮；危险操作初始聚焦取消。关闭恢复原入口，替换/回调重入共享背景 inert 锁且保留宿主原值。高层系统浮层可拥有焦点和 Esc，下层程序关闭不抢焦点。`tools/probe_confirm_focus.mjs` 真实 Chromium 35/0，游戏实机仍待验；证据与交付状态见 [第三批记录](audit/THIRD_BATCH_20261021.md)。

## 5. 网络容灾（两个"鸡肋"功能的解法）

### 5.1 检查更新（2026-10-18 起：小包优先 + 逐文件回退）
```
阶段一 · 只问"有没有新版"（240B info.json，官方 2.4s → 失败并发三个镜像 3.0s）
        │
        ├─ 版本相同 ──▶ 收工（不碰 35KB 的 catalog.js）        ← 省 99.3%
        │
        └─ 版本不同 ──▶ 阶段二：拉 catalog.js 取 files 清单 → 逐文件下载
                           │
                           └─ 每个文件独立回退：已验证基址 → 官方 → 三个镜像
                              （单文件 12s 超时，上次成功的源下次优先）
                              3 路并发；**全部成功才重启**
                              失败 → 列清单 + 留按钮；已下的保留，重试只补缺
```
- **为什么小包优先不只是省流量**：`info.json` 通了就等于**确认这个基址真能提供本扩展的文件**，
  这个 base 直接交给后续下载用 —— 不用再猜"哪个镜像能下载"。
- 阶段一整体失败（老仓库没有 info.json / 全源不通）→ 自动退回 catalog 直拉，行为同旧版。
- 缓存两件：`csh_update_manifest_v1`（整份目录，~35KB）· `csh_update_ver_v1`（版本小包），
  都已登记 csh_migrate 的 EXCLUDED。全失败时的兜底顺序：目录缓存 → 版本缓存 → 中性失败。
- ⚠ **不能用引擎的批量下载原语**（三条硬伤，E48 会拦）：
  ① 它的 `onfinish` **无条件触发** —— 部分文件失败也回调"完成"，旧代码于是照样重启，
     重启后缺文件的扩展直接坏掉；
  ② 只有一个基址前缀，单源挂 = 整批挂；
  ③ `game.download` 的 node 实现**不看 HTTP 状态码**，`response.pipe(file)` 直接落盘 ——
     远端 404 的正文（raw 是 `404: Not Found`，jsDelivr 是整页 HTML）会被当成文件内容
     写进 `.js`，**静默写坏、下次启动才炸**。
  ⇒ 自建下载器：PC 走 `fetch → 校验 r.ok → fs 写入`；手机退回 `game.download`（无状态码可查，只能换源）。

### 5.2 天下榜
- 进页**先用上次成功的榜单渲染**（标注「x 分钟前」），网络结果回来再覆盖。
- `navigator.onLine === false` 时**直接跳过请求**（不再白等 4.5s），只吃缓存。
- 超时 8s → 4.5s；失败保留缓存，状态行变「未连接 · 显示 x 分钟前的榜单」。
- `<link rel="preconnect"> + dns-prefetch`：进页即预热 DNS/TLS，把首包 0.8s 藏到渲染之后。
- 只有从未成功过（无缓存）才显示空榜。
- 缓存键 `csh_rank_cache_v1`（同样不随行囊走）。
- ⚠ **不能再加「明文 http 直连 IP」兜底**：安卓页面 origin 是 `https://localhost`，
  明文 http 会被混合内容直接拦掉（E38 就是为这个事故立的）。要真正解决 DuckDNS 单点，
  只有两条路：**再挂一个 https 域名**（同一台服务器，改 `NET_BASE` 一处），
  或把服务迁到自带域名/CDN 的托管上。代码已按「单基址」留好接口，换域名只改一行。

#### 5.2.1 上报口径：历史最高，不是当前余额（2026-10-18）
服务端 `/submit` 取 max（"花掉也不会掉榜"），但客户端原来上报的是**当前余额**
（`csh_wallet.pc`）。于是「打出新高 → 那次没传上去 → 花掉一部分 → 再传更低的值」
会让那一笔最高值**永久丢失**。现在：
- `csh_rank_high`：本地历史最高，只增不减；每次上报都用它。
- `csh_rank_submit_pending`：记「有一笔还没送达」；进页自动补报并提示"正在补送"。
- 不做成多条队列：服务端是 max 语义，重复提交不会刷高，
  所以「最高值 + 一次待送达标记」比排队更准，也不会互相覆盖。
- `csh_rank_high` 在存档迁移 **WHITELIST** 里（玩家挣到过的成绩，换机必须带走）。

#### 5.2.2 版本不同能不能上榜
**能。** 服务端只校验 uid/名字/数值范围，不认版本。上报载荷带 `ver` 只是让服务端
**记下来**（`board.py` 用"键在才写"，老客户端不带也不报错），便于识别"这条是旧口径"。
不设版本门槛 —— 那会把人挡在门外。

---

## 5.3 神将补选与势力面板自适应（2026-10-21 复核）

### 先回答一个容易被说错的问题：引擎到底有没有"入口"

**有零件，没有装配好的流程。** 三样零件都是通用的：

| 零件 | 位置 | 说明 |
| --- | --- | --- |
| `get.selectGroup(name[, type])` | `get/index.js:6112` | 通用判定，任何模式都能调 |
| `player.changeGroup(group, log, broadcast)` | `player.js:3197` | 通用改势力，**自带联机广播** |
| `lib.skill._doublegroup_choice` | `skill.js:1407` | 通用技能，但 filter 写死 `type === "double"` |

本机引擎的身份场选将流程在 `mode/identity.js:2358-2372` 使用这些零件让玩家选择：

```js
const groups = get.selectGroup(name);
const type2  = get.selectGroup(name, true);
if (type2 !== "default") game.me._groupChosen = type2;
if (groups.length) {
  const r = await game.me.chooseButton(["请选择你的势力", [groups.map(...), "vcard"]], true)
                             .set("direct", true).forResult();
}
```

其余模式：

| 模式 | 有没有 | 证据 |
| --- | --- | --- |
| 身份 | ✅ 引擎弹 | `identity.js:2358`（选将期）+ `1712`（随机赋势力兜底） |
| 斗地主 | ❌ **空语句** | `doudizhu.js:1225 / 1235 / 1238`：`if (lib.selectGroup.includes(...)) ;` |
| 对决 | ❌ 无 | `versus.js` 里没有任何 `selectGroup` / `choose_group` |
| 同将（brawl） | ❌ 只给 AI | `brawl.js:2733` 的 `choose_group` 是随机赋势力，不弹窗 |
| 国战 | 另一套 | `guozhan/src/patch/content.js` 的 `chooseGroupResult`（野心家机制） |

本扩展以可选规则技补齐未处理的流程。本机十周年UI的 `_slyh`（`src/skills/sub-skills.js`）也用全局技、原生选择框及改势力，但它只接**存在且未注册进lib.group的当前势力**，并排除国战，候选只有前五个势力。
本技能接角色原始势力`shen`；通常`shen`已注册，两者条件不重叠。不能因为_slyh优先级高，就推断它必定处理了所有神将或是面板问题来源。

> 曾经试过"交给引擎"，两条路都死：
> **A 补 `doubleGroup`** —— 能弹，但选将界面会把它逐个画到立绘右上角
> （`ui/create/index.js:3191-3197`），势力越多越乱，实机截图已确认；
> **B 补 `initGroup`** —— 一个技能只能一个势力，且神将技能常与普通武将共享（`longdan`），改一个波及一片。
> 教训：**字段语义被滥用，UI 必然跟着错。**

### 现在的实现

```js
lib.skill._csh_kami_choice = {
  trigger: { global: "gameStart", player: "enterGame" },   // 与 _doublegroup_choice 同构
  firstDo: true, forced: true, popup: false, priority: 25, charlotte: true, global: true,
  filter: 逐条显式判定（见下）
  content: 重查判定 → WeakMap令牌及_groupChosen临时预留
        → chooseButton(["请选择你的势力", [vcard...]], true).set("direct", true)
        → 重查令牌/角色/模式/开关/势力及候选
        → await player.changeGroup(g, false)
        → 失败/取消只释放自己的预留，不覆盖别人的标记
}
```

`changeGroup`第二参数false只关日志；本机第三参数只有字符串`"nobroadcast"`才禁止广播，布尔false不会禁止。沿用原生广播不代表已完成联机验收。

**filter 的判定顺序**（顺序本身是设计，不是随便排的）：

| # | 条件 | 拒因码 | 为什么在这个位置 |
| --- | --- | --- | --- |
| 1 | 扩展开关（设置页「神将补选势力」） | `ext-config-off` | 最便宜；关掉后连 character 都不查 |
| 2 | 本层进行中的令牌 / `player._groupChosen` | `choice-pending` / `already-chosen` | 防重入，完成时只允许自己的预留通过 |
| 3 | 角色 `info.group === "shen"` | `group-not-shen:xxx` | **devil 是魔王/小怪全家**（190+ 条），只认 shen ⇒ BOSS 模式天然安全，连模式白名单都不用 |
| 4 | `player.group` 仍是 `"shen"` 或未赋值 | `player-group-changed:xxx` | **让位守卫**：别人已经改过就放弃（防弹两次） |
| 5 | 无 `doubleGroup` / `initGroup` | `is-double-group` / `has-initgroup` | 双势力归引擎那个技能 |
| 6 | 无 `hasHiddenSkill` | `hidden-skill` | 与引擎 kami 分支同口径 |
| 7 | 引擎 `choose_group` 不是显式 `false` | `config-off` | 尊重引擎开关，缺键按开 |
| 8 | 非国战 | `guozhan` | 那里 shen 是野心家机制 |

拒绝原因全记进 `lib.__cshKamiWhy`，调试面板可读 —— **弹不出来时能自证，不用猜**。

### 两个开关，别搞混（2026-10-18 作者要求拆分）

| 设置项 | 默认 | 管什么 | 不管什么 |
| --- | --- | --- | --- |
| **神将补选势力** | **关** | 原有流程漏掉时补问 | 不管面板尺寸；身份场通常由引擎完成，未处理时也可兜底；适用于斗地主/对决等 |
| 势力面板自适应 | 关 | 「**弹出来之后，势力太多放不下时尺寸怎么管**」—— 下游 | **完全不影响弹不弹**；关掉也照样弹 |

两者是**上下游**关系，不是同一件事。之前只有一个开关（下游那个），名字叫「选将势力面板滚动条」，
听起来像"选势力功能的开关"，作者因此困惑过 —— 现在拆开并在文案里写明。

两个功能均按作者要求默认关闭，运行时必须配置显式true才启用。原流程已经能选，就保持补选关闭；仅有势力面板截断/滚不动时，可以只开尺寸自适应。

旧记录曾根据`group_zm8*`归因“综漫季刊八”；本轮安装清单没有该扩展，未能唯一复现外部责任来源。注册势力、触发选择和修改面板布局是三件事，不能互相代证。本轮也修复了辅助层自身的问题，当前证据见[专项报告](audit/KAMI_SCROLL_AUDIT_20261021.md)。

### 与别的扩展会不会冲突

| 冲突面 | 有没有 | 兜底 |
| --- | --- | --- |
| **样式 / 美化** | 依赖宿主布局 | 补选使用原生chooseButton；滚动层按属性保存/归还原样式和important，保留宿主后写值；不再清空从未写过的width/padding |
| **重复弹窗/迟到覆盖** | 有接管守卫 | content入口及await后重查；其他扩展已改势力/标记就让位；无法阻止不遵守相同约定的外部代码主动再弹 |
| **BOSS模式与普通角色** | 范围守卫 | 仅原始shen，devil/普通势力不补选；不修改doubleGroup/initGroup或角色定义 |

关闭补选后新流程不再进入，已经打开的原生选择框返回时会丢弃旧结果，不强制关闭宿主弹窗。关闭自适应则立即停止观察并归还本层样式。

### 滚动层的当前实现与验收

- 内容判定命中势力dialog后才打`.csh-egdlg`，明确排除菜单，标题须为选择势力语句；普通武将选择对照不接管。
- 按实际矩形/offset换算缩放后的局部px封顶；原生`.content-container`纵滚，`.buttons`仅max-width，不写width/padding。
- `#control .control`势力条横滚，封顶包含padding，并修正窄屏/放大时偏离视口的锚点。
- 变更节点分帧重验，支持包裹插入、面板复用、文本变化、后注册势力；resize/visualViewport resize更新，移除及关闭释放，无轮询。
- `probe_kami.cjs`实际模块VM **61/0**（改前43/18）；`probe_eg_scroll.mjs`真实源码+原生CSS的Chromium **49/0**（改前30/19），覆盖五档scale/zoom、实际滚轮和末项指针命中。旧宽度/noflash入口已委托此专项，不再复制旧实现。游戏、十周年UI完整流程、安卓触摸与联机待验。

---

## 6. 新增东西时照抄这四行

1. **放哪**：扩展自己的浮层 → `document.documentElement`；要跟对局淡出的演出 → `ui.window`。
2. **多大**：屏幕尺寸用 `lib.cshUI.fitPx(el)`；`vh/vw` 只在 B/C 坐标系可用。
3. **说什么**：`lib.cshUI.toast(...)`；要用户做决定 → `lib.cshUI.confirm(...)`；禁止 prompt。
4. **联网**：先读缓存渲染 → 带超时请求 → 失败保留缓存并标注时间；新缓存键登记 `csh_migrate`。

## 7. 未尽事项（已知债，下一批可做）

- 设置页的「加载失败 / 未初始化」提示（`main/config.js`）仍是 `alert` —— 阻塞式报错，可接受，但未并入基座。
- 天下榜的「榜单」缓存只有一个槽位（切换 CBY/功勋会互相覆盖）——按 kind 分槽更稳。
- 更新镜像的完整性只有 HTTPS 保证，没有签名校验（供应链边界，需作者拍板是否加）。
- 游戏页的 toast 是 iframe 内独立实现（环境 C，互不影响）。2026-10-18 只统一了**同屏条数上限**
  （`CSHPage.toastCap()`）；各页的视觉（牌桌绿/红、goldfish 单条替换）刻意保留 ——
  硬套宿主基座会盖住牌桌中心，那是退步而不是统一。
- 控制条形态（`#control > .control`）的势力面板目前是"按内容识别 + 内联限宽"，
  通用化为 `csh_uikit` 的一个组件还没做（作者本轮明确排除）。

## 右上安全区（2026-10-20 · 重叠事故后立的规矩）

壳在页面右上角浮着一组控件：**池子币胶囊 + 关闭按钮**（`#csh-shell-dock`，`right:8px/top:6px`，
宽随余额位数变化，实测上限约 190px）。**任何在顶部右布局内容的页面都必须为它让位。**

二选一（不许有第三种）：

1. **页面让位**（推荐，改页面即可）：`padding-right: var(--csh-dock-safe, clamp(150px,20vw,200px))`
   —— 变量由 `core/csh_shell.js` 注入，单一真源；独立打开页面时回退同值。
2. **壳右移**（页面版式动不了时）：在 `core/csh_shell.js` 加
   `body.csh-shell-<页面key> #csh-shell-dock{right:104px!important;}`。
   已有：`career` / `bossbook` / `rank`。

**为什么这条必须自动化**：这套安全区此前是"每页各写一套 px"（122/178/190/200/268），
新页面忘了写就会被胶囊压住 —— 成就页的进度环就是这么被盖住的。现在 **门禁 E50 会对
`games/` 下七个非牌桌页面逐个检查**：没有 `--csh-dock-safe`、没有 ≥120px 的 `padding-right`、
壳里也没有该页的右移分支 ⇒ 直接失败。

牌桌四页（texas / doudizhu / blackjack / uno）是整屏 grid、顶部条由骨架 `.csh-topbar` 预留，
不在此列（`.csh-topbar` 自己带 `padding-right:clamp(148px,19vw,186px)`）。

## 浮层层级表（2026-10-20）

全扩展**只有一份**层级真值，在 `core/csh_theme.js` 运行时注入 `:root`：

| 变量 | 值 | 用途 |
|---|---|---|
| `--csh-z-dock` | 25 | 壳的悬浮控制组 |
| `--csh-z-sheet` | 200 | 页面内详情层（如成就详情） |
| `--csh-z-tip` | 2147482000 | 引用气泡 / 轻提示（低于遮罩） |
| `--csh-z-backdrop` | 2147482999 | 全屏遮罩 |
| `--csh-z-panel` | 2147483000 | 面板主体 |
| `--csh-z-toast` | 2147483050 | 提示（必须盖住一切面板） |
| `--csh-z-top` | 2147483080 | 强制确认 / 全屏接管 |

写法：`z-index: var(--csh-z-panel, 2147483000)`（回退值保留，独立打开页面也成立）。

**为什么**：此前 22 处裸魔数散在 7 个文件，两个浮层同时打开时谁盖谁纯看数字大小和书写顺序，
叠层错乱找不到责任人。现在**门禁 E50 扫描 `core/` 与 `games/` 所有文件，出现裸的
`z-index: 2147xxxx` 直接失败**。
