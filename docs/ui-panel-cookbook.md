# 浮层与面板 CSS 实战守则（2026-10-06）

> 起因：面板/浮层问题反复出现（postmortems #4 / #10 / #11 / #12 / #15），且外部扩展样本里能找到每一类问题的正反实例。
> 本文 = **写任何浮层/面板/弹窗前过一遍**的守则 + 可直接抄的配方。配方全部来自 2026-10-06 精读的实战代码，出处见 `external-research.md` §1 与文内标注。
> 适用范围：扩展自身的 DOM 浮层（资料卡、调试面板、兑换面板、演出层）。**池子休闲 iframe 游戏页另有铁律（README 红线 #12），两套规则不要串用。**

---

## 1. 先认清战场：三种宿主环境，规则不同

| 环境 | 典型 | 挂载点 | 尺寸单位 | 特别注意 |
| --- | --- | --- | --- | --- |
| A. 对局内浮层 | 资料卡、技能弹窗、演出层 | `ui.window`（对局内元素随后续淡出需跟随）或 `document.body` | 可用 `vw/vh/%/px` | **引擎全局样式会作用于你的一切 div**（见 §2）；演出层 `pointer-events:none` |
| B. 菜单/大厅浮层 | 调试面板、兑换面板 | `document.documentElement`（层级档 2147483000，postmortem #4/#10） | 可用 `vw/vh`（一将成名用 `--u: min(0.0625vw, 0.138889vh, 1.2px)` 做设计稿单位） | 可能从**多个入口**打开 → 注入必须幂等 + 清残留实例（#10） |
| C. 池子休闲 iframe 游戏页 | 德州/廿一点页面 | 页面自身 body | **禁 `vw/vh`**（父页 body 被 `transform:scale`），用 `%`/`inset:0` | README 红线 #12；`100vw/100vh` 硬失败 |

**最容易犯的错就是把 A/B 的习惯带进 C，或反之。** 动手前先回答"这块 UI 活在哪个环境里"。

## 2. 引擎全局样式现实（#15 的完整解法）

引擎 `layout/default/layout.css:31` 有一条全局规则：

```css
div { display: inline-block; position: absolute; }   /* 无 !important */
```

它作用于你的浮层里**所有 div**。只复位 position 不够——行内元素仍会挤成一行。标准复位块（浮层根节点内）：

```css
#csh-panel-root, #csh-panel-root * {
    position: static !important;
    box-sizing: border-box;
}
/* display 逐类显式给：通配 block 会把按钮拉成全宽 */
#csh-panel-root .row   { display: flex; }
#csh-panel-root .btn   { display: inline-block; }
#csh-panel-root .text  { display: block; }
```

要点：
- `position:static !important` 是**必要的**（引擎这条无 `!important`，但你的目标可能嵌在别人也加过样式的节点里）；
- `display` **不要通配**，逐类给；
- 浮层内的版式优先用宿主面板的标准类（点绛唇/调试面板既有类），少造轮子。

## 3. 挂载点与 z-index 档位

**挂载决策树**：
1. 对局内演出/提示（不接收点击）→ `ui.window` + `pointer-events:none`（云中守望演出层全用 `pointerEvents:"none"`，swTool.js:472）；
2. 对局内交互浮层 → `ui.window` 或 `document.body` + 遮罩（点绛唇 `createCharacterSkill` 的 `.popup-container` 挂 `ui.window`、点击任意处关闭，createCharacterSkill.js:9-12）；
3. 菜单级/系统级浮层 → **`document.documentElement`** + 2147483000 档（body 上的 transform 会建立独立层叠上下文，挂 body 上 z-index 对外部失效——postmortem #4 实锤）；
4. 置底层背景（壁纸/氛围层）→ `document.body` + `z-index:-1/-2`（幻梦壁纸 video:-2 / 图:-1，config.js:131、174）。

**z-index 档位约定**（新增时先查此表，禁止拍脑袋）：

| 档位 | 用途 | 实例 |
| --- | --- | --- |
| < 100 | 引擎自带界面 | — |
| 100~999 | 对局内扩展浮层/演出 | 云中守望条幅 100、全屏过场 200；点绛唇演出 998/999 |
| 9998/9999 | 菜单级弹窗 | 幻梦 x-dialog 遮罩 9998 / 面板 9999（xms.js:146、151） |
| 2147483000 档 | 系统级浮层（调试面板等） | postmortem #4/#10 的定档 |

**遮罩点击关闭**的正确判定（幻梦 xms.js:197-201）：`bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); })` —— 用 `e.target === 遮罩` 判定，别给面板内部也绑关闭。

## 4. 样式注入纪律

1. **单一真源**：样式统一放 CSS 文件或单一注入块；行内样式只做**动态值**（位置/大小），不写重复的静态样式（postmortem #11：源头 CSS 的 `!important` 会压掉一切行内样式——改视觉前先查源头）。
2. **幂等注入**：功能可能从多个入口打开时，**打开动作本身**要调注入函数，注入函数内部判重（`if (document.getElementById('csh-panel-style')) return;`）并清理残留实例（postmortem #10）。观星美化反例：主样式只随"调试面板打开"注入，从扩展设置直接打开时整个裸 DOM（#10 原型）。
3. **联机同步**：样式注入包 `game.broadcastAll`（幻梦 xms.js:145-177 实证）——但注意内容必须是**纯数据**，不得序列化函数（红线；幻梦往 broadcastAll 里塞函数是错的）。
4. **作用域**：一切选择器挂在自家根类名下（`.csh-panel-root …`）。观星美化的"借宿主类名 `.yijiang_confirm-box` + 自家子类"做法可临时借用，但**依赖他人类名是脆弱依赖**（对方改名即碎），自有面板一律用自己的根类。
5. **Vue/SFC 特别条款**（若学一将成名上 Vue）：`<style>` 块内出现反引号会炸掉 SW 编译、**整游戏启动失败**（一将成名 TopBar.vue:31 原注释）；浮层组件用 `<Teleport to="body">` 防父级 scoped 样式复位规则压扁（CharacterDetail.vue:52-56 注释）。

## 5. 可直接抄的配方库

| 配方 | 代码 | 出处 |
| --- | --- | --- |
| 九宫格弹窗皮肤 | `border-width:6px 59px 28px 59px; border-image-source:url(yj_dialog.png); border-image-slice:46 61 28 59 fill;` | 观星 guanxing.css:19-23 |
| 鎏金标题字（渐变版，推荐） | 多段金色 `linear-gradient` + `-webkit-background-clip:text; -webkit-text-fill-color:transparent` + 四向 `drop-shadow(#2F1809)` + `blur(0.55px) saturate(1.25) contrast(1.25)` | 观星 guanxing.css:52-82（注释版） |
| 文字描边（廉价版） | 多层 `text-shadow` 同色描边 —— **36 层是性能反例**，列表/密集文本场景改用 1-2 层或 `drop-shadow` | 观星 guanxing.css:41 |
| 立绘融图 | `-webkit-mask: radial-gradient(ellipse at center, #000 60%, transparent 100%)` 让立绘边缘渐隐融入底图 | 点绛唇 plot.css:17、createCharacterSkill.css:44 |
| 拖拽反馈 | `.dragging{opacity:.5}` / `.drag-over{border:2px dashed #ff0}` | 观星 guanxing.css:269-276 |
| 禁用态 | `filter: grayscale(1)`（比降透明度更明确） | 观星 guanxing.css:162-166 |
| 面板收起 | 容器 `transform: scale(0)` + transition，图标随状态换图 | 观星 extension.js:139-167 |
| 入场动画复用 | ⚠ **先 grep 确认 keyframes 存在再引用**——观星在用的 `animation: player-died 0.5s` 经全仓搜索**不存在**（layout/noname/src 零命中），实为静默失效；引擎 layout/default 现存 keyframes 见 engine-notes.md §7 | 观星 guanxing.css:26 + engine-notes §7 |
| 标准弹窗骨架 | 遮罩 fixed 100% + 面板 `width:70%; max-height:80%; left/top:50%; translate(-50%,-50%); overflow:hidden; fadeIn .3s`；内容区 `max-height:50vh; overflow-y:auto` | 幻梦 xms.js:146-171 |
| 悬浮球（可拖拽记忆） | 触摸+鼠标双实现，位置持久化到配置键 | 幻梦 `_幻梦创建快捷按钮` config.js:322+ |

**滚动区铁律**（红线级，已多次踩）：可滚动容器必须显式 `max-height + overflow-y:auto`（README 红线 #5 关联约束）；触屏加 `lib.setScroll(节点)`（点绛唇 createCharacterSkill.js:94 同款用法）。

**行级视觉区分**：用前景元素（字色/★/图标），不用整行半透明底色——密集数据里底色边界会形成"金线"错觉（postmortem #12）。

## 6. 动效与性能预算

1. **GIF→PNG 降级**：背景动图预载 `new Image()`，onload 后 `setTimeout(2100)` 换静态 src——动效开场、静图长驻（点绛唇 addAnimation，precontent.js:33-40）。
2. **视频防黑屏三件套**：`canplay` 事件后才把 opacity 从 0 → 1（云中守望 swTool.js:515-519）；双 `requestAnimationFrame` 再触发过渡（幻梦 config.js:213-215，强制浏览器先完成首帧布局）；加载失败/10 秒超时回退静态图或直接销毁（幻梦 settle()，190-199）。
3. **过渡时长约定**：演出/浮层 `opacity .3s`（云中守望全线）；背景层交叉淡化 `.8s`（幻梦）；淡出结束 `setTimeout(300)` 再 `remove()`，别让动画被截断。
4. **常驻视频必须配看门狗 + 清理**（云中守望 preload.js:1000-1107 全套）：stalled/waiting/pause → 重试（≤5）；error → `load()`（≤5）；`currentTime` 冻结检测（1s tick ×3 次）→ 先 pause/play 再 `load()` 硬重启（≤2）；**双 MutationObserver**（自身 style 变化 + 节点移除）彻底清理定时器与监听。硬数据：立绘视频 ≤1MB、≤1080p、H.264、DPR 限 1（CLAUDE.md）。
5. **列表性能**：IntersectionObserver 懒加载（点绛唇 bp.js:862）+ 哨兵分批渲染（每批 30~60）+ `<img loading="lazy" decoding="async">`（一将成名 WujiangList.vue:225）。
6. **播放器并发上限**：十周年UI 动画播放器池 cap=4、移动端动皮 2 —— 池子魔将 mobilefx 泛化时同款上限，防手机端解码拥堵。
7. **DPR**：canvas/Spine 类特效 `devicePixelRatio` 钳到 1，防 GPU 与视频解码互抢（云中守望 swTool.js:668）。

## 7. 移动端与手势

- 紧凑断点用 **`max-height` 系**（横屏矮窗是真实约束，宽度不是）；只压字号间距、不藏信息（README 已立）。
- 触摸目标 ≥44px（壳悬浮件先例）；hover 态在触摸端无效，重要操作不要只靠 hover 暴露。
- **长按/双击/滚动取消手势机**（点绛唇 bp.js:1041-1132）：长按 600ms 弹详情、双击看卡片、`touchmove` 即取消长按、底部操作栏拖拽滚动 + 抑制误触——资料卡移动端交互直接照此实现。
- 手势期间创建的浮层必须 `armClose`（松手 click 会把它关掉——已有红线）。
- 悬浮控件给右侧预留带（`.csh-topbar` 的 `padding-right: clamp(...)` 单点预留先例），防止与壳悬浮件重叠（postmortem #12 关联、轮次十二实录）。

## 8. 共存与降级

1. **探测三段式**：`typeof window.xxx === 'function'` / 存在性检查 → 使用 → 缺省回退。反例：标记补充裸调 `dcdAnim` 802 处、`skinSwitch.chukuangWorkerApi` 583 处，缺扩展即 ReferenceError。正例：点绛唇立绘三级回退（千幻聆音目录 → sanguoskin → 本体 setBackground，mvp.js:106-141）。
2. **扩展启停探测统一写法**（千幻聆音 `game.qhly_hasExtension`，precontent.js:68-83）：`lib.config.extensions` 前缀匹配 + `lib.config['extension_<名>_enable']`。
3. **自保一行**：`if (window.decadeUI && Array.isArray(_status.PROTECTED_EXTENSIONS)) _status.PROTECTED_EXTENSIONS.push("池子魔将");`（防十周年UI"关闭其他扩展"误杀）。
4. **绝不写他人配置键**：千幻聆音替用户写 `extension_十周年UI_dynamicSkin=true`、标记补充一处开关连写三处键还直改 `decadeUI.config`——均已留下互踩事故。**借改全局配置前先备份、用毕还原**（观星美化接管 `lib.config.longpress_info` 的做法，extension.js:131/719/730）。
5. **演出互斥**：动皮/特效三家（十周年UI/皮肤切换/千幻聆音）靠猴补互相压制（云中守望 `_swBlocked` 计数 + 补丁 `decadeAnim.playSpine`）——脆弱。池子魔将演出前探测在场的播放器并错峰；**共存冒烟测试**（M2 已排队）必须覆盖"十周年UI 开启动皮 + 池子魔将演出同屏"。
6. **输出也要命名空间**：全局 API 一律 `window.cshXxx / lib.cshXxx / game.cshXxx`；学一将成名 `_pushYjcmJsFn` 的注册窗模式开放扩展点（外部往数组 push，我们排序执行）。

## 9. 发布前自检清单（10 条，逐项过）

1. 这块 UI 活在哪个环境（A 对局内 / B 菜单级 / C iframe）？单位与挂载点按 §1 选对了吗？
2. z-index 用档位表（§3）里的哪个档？演出层 `pointer-events:none` 了吗？遮罩关闭用 `e.target === 遮罩` 了吗？
3. 引擎全局 `div{display:inline-block;position:absolute}` 复位了吗（§2）？`display` 逐类给了吗？
4. 样式注入幂等吗？所有入口都会注入吗？残留实例清理吗（#10）？样式有没有和源头 CSS 的 `!important` 打架（#11）？
5. 滚动区 `max-height + overflow-y:auto` + `lib.setScroll`？触屏可滚？
6. 手机横屏 `max-height` 断点过了吗？触摸目标 ≥44px？悬浮件预留带留了吗？
7. 动画/视频：`canplay` 门控？超时回退？看门狗？清理句柄（含定时器与监听器）？**监听器有泄漏吗**（点绛唇 keydown 泄漏教训）？
8. 联机：功能 no-op 了吗？样式注入广播了吗（且广播内容无函数）？
9. 共存：探测他人 API 都有守卫？没写别人配置键？演出与在场播放器错峰了吗？
10. 灰度判定：整图转灰度后层级仍可辨（调试面板既有判定标准）？密集列表没有整行底色横带（#12）？

---

**一句话总结**：先分清三种宿主环境，挂对层、用对档位；样式单一真源 + 幂等注入；引擎全局样式必须复位；动效必带门控/回退/清理；探测必带守卫、配置只读不写；发版前 §9 十条逐项打勾。
