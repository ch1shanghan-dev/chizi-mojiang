# 技能演出方案（2026-10-07 立项 · **待资源，暂不实施**）

> 作者定则：技能演出要的是 **池子魔将·文鸯「却敌」/ 大爱仙尊「逆流」那种级别的素材级演出** ——
> 视频/帧序列 + 音效 + 全屏停顿。**CSS 字体大字（渐变描边那种）不算演出**，已明确否掉（见 §5 遗弃方案）。
> 本文只写**思路 / 代码骨架 / 工作流程**：等作者拿到素材（视频或帧序列）再照此施工。
> 施工前的铁律：不动技能逻辑（演出是**观察者**，见 README §1 分层铁律）；不改任何全局对象。

---

## 一、现状：管线**已经存在**，缺的是"接料口"

`main/content.js` 的 `lib.cshShoushaFx`（手杀风特效引擎 V3）**已经在跑素材级演出**，两个现役样例就是作者要的那种：

| 现役样例 | 素材 | 代码 |
| --- | --- | --- |
| 大爱仙尊「逆流护身音」 | `effect/csh_daaixianzun_niliuhushenyin_banner.mp4`（2.93 MB） | `_niliuVideo()` `main/content.js:1435` |
| 文鸯「却敌」 | `effect/csh_wenyang_quedi_banner.mp4`（0.47 MB） | `_quediVideo()` `main/content.js:1829` |

**它们做了什么**（这才是"高级"的来源，逐条都在代码里）：

| 手法 | 代码位置 | 说明 |
| --- | --- | --- |
| 全屏演出层挂 `documentElement` | `_layer()` `content.js:1363` | **不挂 body** —— 引擎缩放时 body 带 `transform:scale`，内部 `fixed` 会整体偏移；挂 html 层才永远铺满真实视口 |
| 视频羽化遮罩 | `content.js:1462` | 四边 `mask-image` 双线性渐变取交集 ⇒ 画面**融进牌桌**而不是一块硬边矩形 |
| 摇屏（三层振幅衰减） | `content.js:1523` | `rAF` 手写：前 1.2s 振幅 1.2 → 4s 内 0.75 → 之后 0.4，两组正弦叠加（不是单一抖动） |
| 进度条/控件全隐藏 | `content.js:1498` | `::-webkit-media-controls*` 全 `display:none!important` + `x5-playsinline` 等安卓 WebView 专用属性 |
| 自动播放兜底 | `content.js:1585` | `play()` 被拒 → 重设 `muted` 再 `play()` → 再失败直接 `reveal()`（**不吞掉演出**） |
| 失败回退 | `content.js:1580` | `error` 事件 → 拆层 → 退回纯 CSS 版 `_niliu()`（墨浪/雾带/笔意路径，`content.js:1604` 起） |
| 结束时序 | `content.js:1545` | `ended` → `cancelAnimationFrame` + `layer.remove()` + `onDone()` 回调（技能侧据此 `game.pause` 收尾） |
| 超时保险 | `content.js:1601` | `setTimeout(finish, D + 500)`，视频卡住也不会把对局挂死 |

**触发方式（现役）**：技能里直接调
```js
if (lib.cshShoushaFx) lib.cshShoushaFx.play("quedi", null);        // skills/index.js:12131
var waitMs = lib.cshShoushaFx._dur.quedi || 2800;                   // 取时长给 game.pause 用（:12140）
```
`play()` 按类型分派：`_dur` 表给时长，`if (type === "niliu") … else if (type === "quedi") …` 硬分支
（`content.js:1355`）。**这里的硬分支就是"接料口不够用"的地方** —— 每加一个演出要改三处
（`_dur` 表 + `play` 分支 + 新写一个 `_xxxVideo`）。

---

## 二、方案：把「接料口」一般化（三处改动，全是加法）

### 2.1 素材注册表 `EFFECT_MEDIA`（唯一真值）

```js
/* main/content.js 内，与 _dur 并列。一个演出 = 一行。
   key   ：play() 的 type；也是技能里写的字符串
   kind  ："video" 视频 | "frames" 帧序列（PNG/WebP 序列）| "css" 无素材的兜底演出
   src   ：相对扩展根；kind=frames 时给目录 + 前缀 + 帧数
   dur   ：总时长（ms）—— 技能侧 game.pause 用它，必须与素材实际时长一致（±100ms）
   mask  ：羽化参数（默认沿用逆流那套四边渐变）
   shake ：摇屏档位（0 关 / 1 轻 / 2 中 / 3 重），默认 1
   mute  ：是否静音（演出音效走 audio/skill 还是随视频音轨，见 §2.4） */
var EFFECT_MEDIA = {
    niliu : { kind:"video",  src:"effect/csh_daaixianzun_niliuhushenyin_banner.mp4", dur:23300, shake:1 },
    quedi : { kind:"video",  src:"effect/csh_wenyang_quedi_banner.mp4",              dur:2800,  shake:2 },
    /* 新素材照抄一行即可，例如：
    xxx   : { kind:"video",  src:"effect/csh_<武将>_<技>_banner.mp4", dur:3000, shake:2 },
    yyy   : { kind:"frames", src:"effect/csh_<武将>_<技>", prefix:"f", count:48, fps:24, dur:2000 },
    */
};
```

### 2.2 `play()` 改为查表分派（消除硬分支）

```js
play: function (type, data) {
    if (typeof _status !== "undefined" && _status.video) return;      // 录像回放不叠层
    this._inject();
    var m = EFFECT_MEDIA[type];
    if (!m) { this._legacy(type, data); return; }                     // 老类型（diankuang/kill/recover…）走原路
    /* 同类型不重入（现役已有此保护，保留） */
    this._running = this._running || {};
    if (this._running[type]) return;
    this._running[type] = true;
    var self = this, clear = function () { self._running[type] = false; };
    setTimeout(clear, m.dur + 500);
    if (m.kind === "video")  this._mediaVideo(m, data, clear);
    else if (m.kind === "frames") this._mediaFrames(m, data, clear);
    else clear();
}
```

### 2.3 抽出 `_mediaVideo(m, data)` —— 把现役 `_niliuVideo` / `_quediVideo` 合并成一个

现役两段代码 90% 重复（羽化、控件隐藏、摇屏、失败回退），**合并成一份**再让 `_dur` / `src` 从表里取：

```js
_mediaVideo: function (m, data, done) {
    var layer = this._layer();
    var wrap  = <div class="csh-media-banner">  ← 现役 wrap 的 cssText 原样搬（含 aspect-ratio:1280/400、max-height:42vh）
    var vbox  = <div>                           ← 现役四边 mask 原样搬
    var video = <video>                          ← 现役的属性清单（muted/playsinline/x5-*/controlslist）原样搬
    video.src = base + "extension/池子魔将/" + m.src;
    /* playing→reveal（opacity 1 + 摇屏）、ended→finish、error→拆层 + 回退、play() 拒绝→再 muted 重试 */
    /* 摇屏振幅按 m.shake 取档：0 不摇 / 1 轻(0.6) / 2 中(1.2) / 3 重(2.0) */
    setTimeout(finish, m.dur + 500);
}
```

**帧序列分支（`kind:"frames"`）**：我们已有 `mobilefx` 的矢量采样播放器，但那是给"键控数据"用的；
素材级帧序列更简单——`<img>` 按 `fps` 换 `src`（云中守望 `swTool.js:926` 的写法），或直接
canvas `drawImage` 避免重排。**优先用 `<img>`**：帧序列是等大图，`<img>.src` 替换不解码重排，
比 canvas 少一层合成；只有需要**边播放边叠加**（描边/发光）时才上 canvas。

### 2.4 音效：与视频的关系

- 视频**自带音轨** ⇒ `video.muted = false`（现役是 `muted=true`，因为逆流那支是纯画面）。
  加素材时确认素材有没有音轨：**有音轨就别再挂 `audio/skill/*.mp3`，否则两条音轨打架**。
- 无音轨 ⇒ 演出同时播 `lib.cshVoice.play("<key>")`（现有播报通道，自带联机广播）。
- 音量跟随扩展设置里的播报开关（`csh_effect_announce`），与现有口径一致。

### 2.5 技能侧接线（**只加一行**）

```js
/* 技能 content 里，演出 + 等待：
   if (lib.cshShoushaFx) lib.cshShoushaFx.play("xxx", null);
   var waitMs = (lib.cshShoushaFx && lib.cshShoushaFx.durOf) ? lib.cshShoushaFx.durOf("xxx") : 2000;
   // 需要全屏停顿的技能再 game.pause()/resume —— 见 §3 的时序纪律
*/
```
`lib.cshShoushaFx.durOf = function (t) { return (EFFECT_MEDIA[t] && EFFECT_MEDIA[t].dur) || (this._dur[t]) || 3000; };`
（现役技能是直接读 `_dur.quedi`，加 `durOf` 后**新技能不必知道内部结构**。）

---

## 三、时序与共存纪律（踩过的坑都在这）

1. **暂停只由技能侧发起**：演出是观察者，`game.pause()` / `resume()` 的配对由**技能**负责，
   `_dur` 表只提供"素材多长"这一个事实。两边都改暂停会互相打断（现役 `_dur.niliu` 写作 23300
   正是为了让技能侧的等待覆盖整段演出）。
2. **`ended` 与超时双保险，但只有一个能收尾**：`finish()` 里先置 `done = true`（现役已这么做），
   否则 `ended` + `setTimeout` 会双跑 `onDone`，技能侧收到两次回调。
3. **失败必须降级而不是取消**：视频 `error` → 拆层 → 退回 CSS 版演出（现役 `_niliu()` 那套墨浪）。
   **素材缺失时宁可看兜底演出，也不要"技能发动了但屏幕一片安静"**。
4. **联机**：演出各端本地播（素材在扩展包内，装了扩展就有）。**素材缺失的客机**静默跳过即可
   （云中守望同款判断：`playSpine(...).catch(()=>{})`）——绝不让一个装饰把技能结算带崩。
   **不做 `game.broadcastAll`**：视频/帧序列是本地资源播放，广播函数过去没有意义。
5. **z-index 档位**：演出层走 `content.js` 现役那套（`_layer()` 挂 `documentElement`，层内 `z-index:20`，
   层级档 2147483000 家族）—— 与 `ui-panel-cookbook §3` 的"系统级浮层"一致。
6. **不遮死牌桌**：现役 `_bg()` 铺的是径向渐变半透明底（`rgba(8,18,32,.18)` 级别），
   规范 §13.1「只压暗不遮死」同样适用演出层。

---

## 四、工作流程（拿到素材后照这个顺序做）

| 步 | 动作 | 产出/校验 |
| --- | --- | --- |
| 1 | 素材入 `effect/`，命名 `csh_<武将id>_<技能id>_banner.<ext>` | 与 `catalog.js` 的 files 清单同步（扩展会同步到安卓端，逐个 `adb push` 很痛） |
| 2 | **转码与压体积**：mp4 ⇒ H.264 / ≤1080p / **≤1MB**（外部硬数据：动皮 mp4 ≤1MB 才不与立绘视频抢解码）；帧序列 ⇒ WebP 或 oxipng 压过的 PNG | `ffprobe` 看时长（写进 `dur`）、`ls -l` 看体积 |
| 3 | 在 `EFFECT_MEDIA` 加一行（`dur` 与素材实际时长一致，±100ms） | 门禁 `check.js` 通过 |
| 4 | 技能 `content` 加两行（`play` + `durOf`） | 技能 AI 不动、结算不动 |
| 5 | **浏览器实测**：`tools/` 下建一个假壳页（照 `texas_settle_preview.html` 的写法），
      自动进局 → 发动技能 → 截演出帧 | 三张截图：起手 / 高潮 / 收尾；对照素材本身 |
| 6 | 联机实测（两台机或联机测试环境）；**素材缺失的客机必须静默** | 记录 |
| 7 | CHANGELOG 留痕（素材来源与授权、体积、时长、实测结论） | |

**素材规格建议**（照现役两支的实测数据）：
- 横幅类视频：宽高比 **1280×400**（`aspect-ratio` 已按此写死）、`max-height:42vh`、时长 **2.5~4s**（技能技）
  或 **15~25s**（终极大招，现役逆流 23.3s）；
- 帧序列：**≤60 帧 / 24fps / 单帧 ≤200KB**；总时长 >4s 的用视频而不是帧序列（帧数会爆内存）；
- 全屏级（打满整个屏幕）优先 **Spine 或视频**；只有"贴在武将身上"的小特效才用帧序列。

---

## 五、遗弃方案（留作反面记录）

**CSS 技能名大字横幅**（渐变填充 + 多层描边 + 缩量冲击入场，`scale 4.2 → .94 → 1`）。
做出来实测定格在 43px、质感也还算体面，但**作者一眼否掉**：

> 「不要低到爆炸的那种字体什么……你说的花里胡哨，实际上卵用没有。」

**结论**：字体不是演出。演出的价值来自**素材**（画面/音效/节奏），不是来自给文字加渐变。
CSS 文字层只适合做**信息**（伤害数字、技能名提示），不适合冒充**演出**。
本方案已按此调整：`EFFECT_MEDIA` 表里只放 video / frames 两类真素材，CSS 仅作为**素材缺失时的兜底**。

---

## 六、顺带记下：武将立绘换高清（作者 2026-10-07 指示）

**现状**：`image/` 131 张，最大 1.82 MB（`csh_zhonghui_2.webp`），多数立绘是 webp/jpg 混用、尺寸不一。
**目标**：换成高清立绘（作者另找素材）。
**施工要点**（先记着，等素材到）：
1. **按曝光尺寸分配规格**（README §7 M2 配套决策）：局内头像显示尺寸小 ⇒ 中等规格即可；
   资料卡/演出这类全屏场景才给最高规格 —— 内存不设限，但手机端解码 CPU 要掂量。
2. `character/index.js` 的 `img` 字段是唯一引用点，**换文件不改路径**最省事（同名替换）；
   要改格式则三向核对：`img` ↔ 文件 ↔ `package.js files` 清单。
3. 体积纪律：单张立绘建议 **≤1.5MB**，格式优先 WebP（现役已有 webp 先例）——
   参考已做过的资源优化轮次（GIF→WebP -45%、PNG oxipng -18%）。
4. **不改名、不删旧图**（红线：禁止重命名/删除既有资源）；新图先并排、实测通过再切换引用。
