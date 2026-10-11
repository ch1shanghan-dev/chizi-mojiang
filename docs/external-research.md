# 外部扩展研究与借鉴手册（2026-10-06 精读）

> 来源：`D:\TEncent` 下 10 个第三方扩展（解压精读版在 `D:\TEncent\_ext_analysis\`，目录名已归一化，看完可删）。
> 本文沉淀**值得学的守则、处理方式、资源协议与联动钩子**，全部经一手核对源码，引用 `file:line`（以解压版为准）。
> 配套：CSS/面板专项 → `ui-panel-cookbook.md`；本扩展事故复盘 → `postmortems.md`；路线图 → `../README.md` §7。
> 定位：**为池子世界（M1→M3）夯实地基**。立项/动手前先查本文对应章节，不要凭印象重推。

---

## 0. 来源一览

| 扩展 | 体积 | 定位 | 对池子魔将的核心价值 |
| --- | --- | --- | --- |
| 一将成名 | 466MB | Vue3+PIXI 手杀式大厅壳：武将列表页+全屏详情页、抽卡、背包货币、排位 | **资料卡最好对标物** + 道具系统联动候选 |
| 千幻聆音 | 271MB | 语音引擎+皮肤切换(内嵌)+资料卡四页 | **语音导演教科书** + `lib.qhlypkg` 社区皮肤协议 |
| 幻梦 | 2.49GB | 动态壁纸/主题BGM播放器 + 大IP角色包 | mp4 播放器骨架 + 词条弹窗组件 |
| 十周年UI 1.5.0 | 121MB | UI 框架扩展，带正式 API 文档 `docs/` | **联动接口方**（露头图/前缀角标/Spine 引擎） |
| 云中守望 | 61MB | 角色包工程化天花板 + 演出 API | **工程规范范本** + 演出四件套标准答案 |
| 点绛唇 | 30MB | 禁将/MVP结算/战绩/资料卡子系统群 | 子模块逐一踩在路线图上 |
| 标记补充 | 675MB | 标记动画特效包（482 个 Spine） | 挂载手法可参考；整体为反面教材标本 |
| 英雄联盟杀 | 149MB | 玩法层扩展（召唤物/状态/卡牌语音） | 卡牌语音总线 + 无经济系统（联动价值低） |
| 观星美化 | 253KB | 观星交互重做 | 极简样本：CSS 作用域 + 依赖守卫 |
| 皮肤切换 | 0字节 | 空文件（下载未完成） | 未分析；其完整实现已内嵌于千幻聆音 `skinSwitch/` |

---

## 1. 各扩展精读档案

### 1.1 一将成名（作者：倘若）

**架构**：`extension.js`(24行) 组装；`main/precontent.js` 登录门禁+加载 pixi6/gsap；大厅主体 `main/OnloadSplash.vue`(1520行 Vue SFC，靠无名杀 service worker 即时编译)；武将列表 `main/WujiangList.vue`(560)；**武将详情页 `main/CharacterDetail.vue`(1163)**；抽卡 `utils/zhaomu.js`+`config/zhaomuJc.js`(1029行配置)；背包 `utils/BackpackManager.js`(196)；排位/积分/斗地主周榜三套成长线；`connect:false`（联机整套不存在）。

**值得学的机制**（全部一手核对）：

1. **结算插队链（联动协议范本）** `utils/api.js:12-33`：
   `window._pushYjcmJsFn({ index, fn })` —— 一将自己结算 index=100，**小于 100 在它之前执行、大于 100 在其后**；结算时按 index 排序逐个 `await fn(胜负bool)` 然后**清空数组**。点绛唇的 MVP 就是从这条链接入的（`mvp.js:658`）。调用方守卫写法见 `extension/doudizhuAn.js:178`（`if(window._pushYjcmJsFn)`）。
2. **大厅期全扩展武将聚合表** `utils/index.js:591-623`：遍历 `lib.imported.character` 拍平成 `lib._cust_character / _cust_characterPack / _cust_translate` —— content 合并前唯一可靠的全武将数据源。⚠ 键名无 prefix 隔离，我们联动时**只读不写**。
3. **立绘路径四层判序** `utils/skinApi.js:54-74`（`resolveOriginSrc`）：`info.img` → trashBin 标签里的 `img:`/`ext:`/`character:`（别名再解一层，guard 循环 ≤4 次）→ 兜底 `image/character/<id>.jpg`；`ext:` 前缀换算 `extension/`。**解决"扩展包武将立绘写在 `extension/<包>/image/` 而代码写死本体路径必 404"的问题** —— 池子魔将资料卡读立绘必须照抄这个判序。
4. **皮肤目录契约** `skinApi.js:6-10`：皮肤图根 `SKIN_ROOTS = ["extension/无名换肤/sanguoskin/", "extension/千幻聆音/sanguoskin/"]`（`<根>/<武将内部名>/<皮肤名>.jpg`）；皮肤语音根 `AUDIO_ROOTS = ["extension/千幻聆音/sanguoaudio/", ...]`（`<根>/<武将id>/<皮肤名>/<技能名>.mp3`）；动皮参数只认 `window.decadeUI.dynamicSkin`。目录扫描用 `game.promises.getFileList` + Map 缓存（16-27）。
5. **标准皮肤键**：设皮肤 = 写 `lib.config.skin[id] = [皮肤名, 图片路径]`（skinApi.js:117-126），局内立即可用；恢复原画 = 删键。资料卡的"设为皮肤"直接走这个键，与本体/千幻聆音互通。
6. **资料卡技能试听** `CharacterDetail.vue:329-449`：大厅期没有 `ui.window`，不能走 `game.playAudio` → **`new Audio()` 链式 onerror 回落**（皮肤配音 → `game.parseSkillAudio` 手工喂 info → `<技能>1/2.mp3` 轮换兜底）；轮换计数复用千幻聆音的 `_status.qhly_skillAudioWhich`；进详情页随机播一句有声技能（515-520）。
7. **性能**：武将网格 BATCH=60 增量渲染 + `loading="lazy" decoding="async"`（WujiangList.vue:225-231）；露头探测 = canvas 25% 缩样扫顶部透明带（`utils/loutou.js`，注明移植自斗转星移）。
8. **启动画面注册** `main/precontent.js:15-17` + `main/YJCM.js`：`lib.onloadSplashes.push(new YJCM())` + 强写 `game.saveConfig("splash_style","style-yjcm")` —— 扩展升级为"启动器级"入口。池子魔将若做"池子世界"启动画面照此办理。
9. **抽卡三件套**（若做池子扭蛋再回来读）：概率区间法 + 十连保底 + 重复转化"将符"（基础数×暴击概率表），配置与逻辑分离（`config/zhaomuJc.js` 1029 行纯数据 + `utils/zhaomu.js` 308 行逻辑）。

**反面教材**：
- **存显混算清零 bug（联动必读）**：`BackpackManager.getItemNum`（BackpackManager.js:82-87）对 ≥100000 的数值返回 `"1.23w"` 格式化**字符串**；`changeItemNum`（104-105）拿它当数值参与 `currentNum + num` → 字符串拼接 → `Math.max(0, NaN)` = **NaN 写库 → JSON 变 null → 重载归 0**。超过 10 万的资产一操作就清零。
  **联动守则：读写都绕开这两个方法** —— 读 `getBackpackAll()` 原始对象、写 `saveBackpack()` 原始数值。
- 大厅货币"+"按钮直接 `changeItemNum("tongyuan",100)` 白送 100 通货的测试后门留在正式包（红线 #10 的活体案例）。
- 死代码随包：`main/OnloadSplash.js`（1550 行旧版，与 .vue 已行为漂移）、无 import 的 `utils/crypto.js`、`todo/` 1.7MB 效果图——撞红线 #2。
- `extension/choosechar.js` 3315 行按 mode 分支重写 `game.chooseCharacter/Two/displayHp` 等系列，同函数多处重复定义 + 裸全局——红线 #4 反面样板。
- 登录页明文密码进 localStorage（`pages/login/js/login.js:93`，纯装饰却收集账号）。

### 1.2 千幻聆音（v5.2.0）

**架构**：ESM 分层，总 JS ~4.2 万行。`extension/content.js`(9117 行核心单体)、`extension/qhly_skill.js`(2069，**语音引擎**)、`extension/qhly_newView.js`(2374，资料卡四页)、`qhly_bigEdit.js`(皮肤编辑器)、`skinSwitch/`(内嵌"皮肤切换"完整实现 23122 行，含 spine.js/animations.js/dynamicWorker.js)；`theme/` 七套 UI 按需加载。

**语音引擎三层结构（语音导演的图纸，一手核对）**：

1. **皮肤包数据库**：`lib.qhlypkg` 数组（content.js:5397）+ `window.DEFAULT_PACKAGE`（5332）。每包声明 `audio`（语音根）/`audioOrigin`/`filterCharacter`/`characterTaici`；`game.qhly_foundPackage`（6058）按武将找包，`qhly_foundPackageExt`（6167-6260）为**任何扩展的武将动态构造兜底包**（prefix 指向 `extension/<包名>/`）——这就是"适配一将成名"的实现方式：不是白名单，是通用机制。
2. **换肤建重定向表**：`game.qhly_setCurrentSkin`（7205-7335）用 `game.getFileList` 枚举皮肤语音目录实际文件，把引擎原始路径映射到皮肤语音路径，写入 `lib.config.qhly_skinset.audioReplace` 并持久化。
3. **引擎覆盖** `registerQhlyAudioEngine`（qhly_skill.js:1575-1845）：
   - **origin 保存与覆盖必须相邻、按原顺序执行一次**（源码原注释）；
   - `game.playAudio` 包装：`ext:` → `../extension/` 路径换算 → `audioReplace` 精确匹配 → 去 `.mp3` 再匹配 → 全 miss 回落原函数（1578-1644）；
   - `qhly_notbb` 防复读节流（1596-1629）：键 = 路径去尾号（按技能）或按玩家 playerid 或全局，时间窗内不重播；
   - `game.playSkillAudio` 覆盖里 `resolveSkillContext` 沿 `_status.event.parent` 链上溯找"当前技能+当前玩家"（1724-1767）——**语境感知的地基**。

**直接可抄的三个函数**：
- `game.qhly_probeSkillAudioCount`（qhly_skill.js:310-358）：`game.thunderFileExist` 逐个探测 `基准名+n.mp3`（n=1..12）得**实际台词条数**；基准名候选三类（audioBase 本身 / 共享皮肤映射回原技能 / 剥 `_武将名` 后缀）。池子魔将 189 条语音做"语境选词"前，先用这个模式盘点家底。
- 试听三件套：`get.qhly_getAudioInfoInSkin`（841，列表构建）+ 技能页喇叭按钮（439-476，含右键/长按调音量）+ `window.qhly_playDieAudio`（1852-1879，阵亡台词四层兜底：parseDieTextMap → `die:` 标签 → 皮肤包路径 → 引擎默认）。
- **扩展探测标准写法** `game.qhly_hasExtension(str)`（precontent.js:68-83）：`lib.config.extensions` 前缀匹配 + `lib.config['extension_'+名+'_enable']` 检查。**全项目联动探测统一用它这个写法**。

**qhlypkg 皮肤包声明协议**（幻梦接入实证，幻梦 arenaReady.js:39-51）：

```js
lib.qhlypkg.push({
  isExt: true,
  filterCharacter: name => name.indexOf('x_') == 0,   // 本包武将判定
  prefix: 'extension/幻梦/image/character/',          // 立绘根
  skin: { standard: 'extension/幻梦/image/skin/wjpf/' }, // 皮肤图根
  audioOrigin: 'extension/幻梦/audio/skill/',          // 原皮语音根
  audio: 'extension/幻梦/image/skin/audio/'            // 皮肤语音根
});
```
声明即接入：换肤 UI、皮肤语音查找全由千幻聆音完成。**池子魔将 M2 重做皮肤系统时，发布自己的 qhlypkg 条目 = 零 UI 成本接入千幻聆音的用户群**。

变体武将共享：`lib.qhly_skinShare[变体名] = {name: 原武将, skills: {变体技: 原技}}`（qhly_skinShare.js:16）——`sb_/re_/gz_` 变体自动复用原武将皮肤/台词/动皮。

**反面教材**：content.js 9117 行单体；precontent 加载已删除文件靠 404 硬扛；`importScripts` 跨扩展引十周年UI内部文件（dw.js:1）；**precontent.js:187-191 静默强开开发者模式**（`game.saveConfig('dev', true); lib.cheat.i()`）；替用户写 `extension_十周年UI_dynamicSkin = true`（precontent.js:10）——写他人配置键的事故原型。

### 1.3 云中守望

**架构**：`extension.js`(32行) 暴露 `window.swTool`；`main/swTool.js`(1300行工具中枢)；`script/preload.js`(1825，联机注入+mp4补丁)；`character/DIY/`（index 1363 / skill 19718 / card 114）；自带 **CLAUDE.md 51KB 开发规范**（命名/翻译/联机序列化/30+ 条踩坑——与本项目 docs/ 三件套完全同构，可交叉补课）；`filesHash.json` 双哈希增量更新。

**演出四件套（M2 演出引擎的标准答案，一手核对）**：

| API | 位置 | 要点 |
| --- | --- | --- |
| `swTool.playSkillVideo(name, time)` | swTool.js:461-545 | 条幅演出：667/205 比例横幅 + **50 帧边框动画**（0-24 入场帧、25-49 循环帧，33ms/帧 ≈30fps）；`canplay` 后才 opacity 0→1 **防黑屏**；`ended` 与超时双保险收尾；全程 `pointerEvents:none` |
| `swTool.playSkillFullVideo(name, time)` | 547-607 | **返回 Promise 的全屏黑底过场**，技能 content 里 `await` 播完才恢复结算；音量跟随 `lib.config.volumn_audio / 8`（0-8 档，与引擎 game/index.js 同款换算）；淡出 300ms 后 resolve |
| `swTool.playSpine(name, action, parent, ...)` | 608-787 | 懒加载 spine.js；WebGL2 自建管线；**DPR 限 1 防 GPU 饿死 mp4 解码**（668-669）；与十周年UI 画布互斥 + contextlost 自愈（640-660、790-821） |
| `swTool.playFullText(title, subtitle, nature)` | 824-846 | 复刻本体 `$fullscreenpop` 的 `.damage` 类入场，返回 Promise |

**技能自动触发**：`lib.skill[...].skillAnimation` 标记 → `trySkillAnimate` 包装自动播 `spell_limit/wake.mp3`（preload.js:646-654）——限定技/觉醒技**自动**获得演出入口，技能代码里只写一行 `swTool.playSkillVideo("kati1", 3700)`（DIY/skill.js:8369）。

**mp4 动态立绘**（preload.js:945-1108，一手核对全套看门狗）：
`HTMLDivElement.prototype.setBackgroundImage` 补丁：背景图命中 `_status._mp4Map` 键 → 叠加 muted loop `<video>`（object-fit:cover, object-position:top）；自愈链 = stalled/waiting/pause → tryPlay + 1s 重试（≤5 次）；error → `video.load()`（≤5 次）；**画面冻结看门狗**：1s tick 检测 `currentTime` 不前进（GPU 争抢时 playing 但画面停住、无任何事件），3 次确认 → 先轻量 pause/play、再 `load()` 硬重启（≤2 次）；清理 = **双 MutationObserver**（style 属性变化 + 节点移除）+ `_mp4Cleanup` 句柄。
⚠ **教训**：这是原型级补丁，影响所有扩展的立绘 —— 池子魔将帧序列引擎**挂自己的容器，不动原型**。
硬数据（CLAUDE.md）：动态立绘视频 **≤1MB、≤1080p、H.264、DPR 限 1**。

**assets 目录规范**（高清资源分发的参考模板）：

```
assets/character/<角色id>.jpg            # 立绘（皮肤加后缀 _weapon/_fail/_archive）
assets/audio/<角色id>/<角色id>.mp3       # 阵亡语音 = 角色同名文件
assets/audio/<角色id>/swe_<技能id>1.mp3  # 技能语音 = 前缀_技能id+序号
assets/animation/border/0..49.png        # 技能条幅边框 50 帧
assets/animation/skill/0..7.png          # 限定/觉醒 8 帧光效
assets/animation/spine/… + audio/        # Spine 特效 + 独立音效
assets/animation/vedio/<角色id>.mp4      # 动态立绘/大招视频
```
语音翻译键约定 `[<audioSrc>角色id/技能id1]` 一 key 双用（台词文本与文件路径同键）；共享技能用 `audioname2` 按角色 id 键控；跨版本角色复用语音不新增文件。

**其他可抄**：配置键单点常量 `get URL()/path()/audioSrc()`（swTool.js:13-24，getter 形式防手滑）；**全局技能"绝对最后执行"写法** `priority: -99999 + superCharlotte + lastDo`（preload.js:1109-1113）——结算收尾型逻辑的引擎级保证；`exportForClient()` 只导出非 `_` 成员下发给客机；配置键语义前缀 `func_/game_/link_/pack_/info_`（config.js:214 注释）。

**反面教材**：`character/DIY/skill.js` 19718 行单文件（P3 拆包必要性的实证）；动皮与十周年UI 共存靠猴补 `decadeAnim.playSpine=function(){}`（脆弱 hack → 共存冒烟测试的必要性论据）；联机注入函数源码到客机——与本项目"联机 no-op"红线方向相反，**不可抄**。

### 1.4 点绛唇

**架构**：`extension.js`(29行) 纯组装；`main/basic.js`(21) 提供 `basic.extensionDirectoryPath` 自省路径 + **`basic.resolve()`：把函数型 config/help/package 转成 Promise**（干净的小模式）；子模块群每模块 = js+css+image 自包含互不依赖：Bp 禁将(1894) / Mvp 结算(665) / Win 战绩(580) / CreateCharacterSkill 资料卡(136) / OpenCardsDialog(37) / Plot 剧情(16)。

**演出 API**（main/precontent.js:12-95，一手核对）：
- `game.addAnimation(src, time, callback)`：全屏 GIF 背景 **2.1 秒后换静态 PNG**（`new Image()` 预载 onload 后 setTimeout 换 src，省电）+ 前景图延迟 150ms + `game.pause2()/resume2()` 暂停对局 + z-index 998/999；
- `game.createBgm/closeBgm/changeBgmVolume`：多轨 BGM 注册表（按 url 键控）；播演出 BGM 时 `ui.backgroundMusic.volume=0` 压制本体，结束时按 `lib.config.volumn_background/8` 还原。

**资料卡** `game.createCharacterSkill(character)`（createCharacterSkill.js:5-136，一手核对）：
popup-container 点击任意处关闭；按武将势力换全屏底图（onerror 回退 default）；`image/lihui/<id>.jpg` 大图探测（存在则去 mask 用原图，否则 `setBackground(character,'character')`）；稀有度 `game.getRarity` + `image/level/rarity_*.png`/`pe_*.png` 双图标；皮肤名 `game.qhly_getSkinInfo` → `lib.config.skin[id][0]` 兜底；分包名链 `lib.characterSort[包][组].includes(id)` → `translate[组]` → `translate[包+"_character_config"]`；**衍生技区**：遍历主技 `get.info(skill).derivation`（数组或单值）单独成区展示；技能描述用 `get.skillInfoTranslation(skill)`。
⚠ 同款 **onerror 字符串拼接 bug 出现两处**（createCharacterSkill.js:29-31 与 config.js:29-31）：`url("..." + path; +'")')` —— `+'")'` 写在表达式外，onerror 永远拼出坏 URL。**背景图路径拼接必须用模板字符串或单点 helper。**

**禁将系统**（Bp/bp.js）：方案存 `extension_点绛唇_plans_<名>`；应用时**写回本体原生键** `<mode>_banned` / `connect_<mode>_banned` / `forbidai_user`（491-498）——本体联机/选将自动生效（属"写数据键"而非"改函数"，与红线 #4 性质不同，若借鉴需过审）；"新武将基准"自动识别新装扩展（70-144，arenaReady 2s/6s 双重重试）；入口劫持 = setInterval 轮询菜单 `.menu-tab` cloneNode 替换"武将" tab（1853-1871）+ `ui.create.system('禁将')`。

**MVP 结算**（Mvp/mvp.js）：挂钩 `lib.onover`（658-665，**多扩展共存已被点绛唇+云中守望双重实测安全**）；评分 = 胜方每人 `(伤害+回复)×2 + 击杀×10 + (摸牌+用牌+响应)/2` 取最高（600-633）；胜利语音三级回退逐层 `getFileList` 探测目录再播（44-95）；结算页 `game.openOverDialog` 双列对称 + 徽章全部从 `player.stat`/全局历史现算（453-462）。

**Win 战绩**（win.js）：模式×武将记场次/胜场/平局 + "自己视角"双份字段；导入**合并**语义（220-382）——多设备同步可参考。

**UI 工程**：IntersectionObserver 武将图懒加载（862-873）+ 哨兵分批渲染每批 30（1205-1267）；**移动端手势机**（1041-1132）：长按 600ms 看资料卡 / 双击看武将卡 / 滚动即取消长按 / 底部操作栏拖拽滚动+抑制误触（1550-1596）。

**联动面**：`extension_点绛唇_winner` / `winner_player` 可读；`game.openBpDialog / openWinDialog / openMvp / openOverDialog / mvpShow / createCharacterSkill / openCardsDialog / addPlot` 均为可探测调用的全局。

**反面教材**：`eval` 解析导入文件（bp.js:213、1660）；`document.addEventListener('keydown')` 每次开面板新增且从不 remove（637、1344、1463，**监听器泄漏**）；`openBpDialog` 单函数 1227 行；22 万行用户数据 JSON 打进包；路径硬编码 `extension/点绛唇/...` 无常量化。

### 1.5 十周年UI（联动接口方）

**正式 API 文档**（decadeUI/docs/ 七篇，面向外部扩展作者——**这个形态本身值得学**：我们的 decadeUI-compat.js 也应有对应说明）。精读摘录：

- **露头图**（outcrop-avatar-api.md 全文）：目录约定 `image/character/{dcloutou|ssloutou}/<武将名>.jpg`；查找顺序 = **所属扩展优先 → 十周年UI 回退**；武将名解析 img 属性 → trashBin `character:` → id；懒加载 + 并发节流 ≤4；格式 JPG。**池子魔将只需放文件，零代码接入**。
- **前缀角标**（prefix-mark-api.md 全文）：`decadeModule.prefixMark.registerPrefix(前缀, 样式名)` → CSS 约定 `.player > .{样式名}-mark`（约 22×34，z-index 87）；前缀键 `lib.translate["武将名_prefix"]="前缀名"`；内置 界/神/SP/OL/TW/谋/新杀/手杀/牢/势/武/族。池子魔将 compat 已接，此为完整规范。
- **动皮配置表 schema**（dynamic-skin-api.md）：`武将名 → 皮肤名 → { name(骨骼路径), action, x/y:[px, 百分比], scale, angle, speed, hideSlots, clipSlots, background, chuchang(出场), shan(受击)… }`；Spine 3.8 三件套 `assets/dynamic/<武将>/<皮肤>/`；共享配置 `decadeUI.get.extend`。**池子魔将帧序列引擎的配置表字段应与它对齐**，未来素材可互换。
- **对外接口总表**：`window.registerDecadeCardSkin(obj)`（自带排队队列 `_decadeUICardSkinQueue`，compat 已接）；`decadeUI.animation.playSpine/playDynamic`；`decadeUI.animateSkill`（仅单机）；`decadeUI.applyOutcropAvatar / registerLazyOutcrop / clearOutcropCache`；`decadeUI.toggleExtensions`（**`_status.PROTECTED_EXTENSIONS` 白名单是它留给其他扩展的活口**）。
- 对外探测的样板写法：`game.hasExtension?.("皮肤切换")`、`typeof game.qhly_changeDynamicSkin === "function"` 即整体移交动皮（src/overrides/player/dynamic-skin.js）。

**反面教材**：src 全部压缩成单行不可 diff；UI 扩展越界改玩法（addGlobalSkill 注册动画技能、改 `lib.group` getter）；为刷新按钮文案猴补 `game.saveConfig`；核心卖点空心化（动皮/露头目录为空，靠第三方自备）。

### 1.6 幻梦

**架构**：入口 ESM 29 行 + 非 ESM 全局脚本 `xms.js`(310)；`main/config.js`(1189，壁纸/BGM/快捷面板)；`character/` 13 文件（**其中 voices.js/pinyin.js/dynamicTranslate.js/characterFilter.js/card.js 五个全是空壳 `export default {}`**，skill.js 5477 行才是主体）。

**值得学**：
- **mp4 壁纸播放器骨架** `game.幻梦playVideo`（main/config.js:160-229，一手核对）：`_status.幻梦videoLoading/videoQueue` 防重入 + 排队；`canplay/loadeddata` 才转正；**双 rAF** 触发 opacity 过渡（213-215）；新旧层 900ms 交叉淡入淡出；**10 秒超时回退静态图**（196-198）；`destroyVideo` helper；原生背景键（url 含 `image/background/`）让位给 `ui.background`；置底层 z-index:-2（图 -1）。
- **safeKey 保留值方案**（92-98）：配置里 "0"=关闭、"1"=随机是保留值，文件名恰叫 "0"/"1" 会撞——`safeKey` 加 `\u0000` 前缀存储、`realName` 还原。**任何"魔法值+文件名同域"的配置都适用**。
- **词条弹窗组件** `window.xOpenDialog(title, content)` / `window.xIntroduce(name)`（xms.js:145-311，一手核对）：CSS 经 `game.broadcastAll` 注入（**联机同步**）；遮罩 `.x-dialog-bg`（fixed, z-index 9998, rgba 遮罩）+ 面板 `.x-dialog`（70% 宽 / max-height 80% / 居中 translate / 渐变底 / fadeIn 0.3s / z-index 9999）；关闭按钮 hover 放大；**点击遮罩关闭用 `e.target === bg` 判定**；`xIntroduce` = 关键词表正则替换进 `x_*_info` 译文成可点击 `<a onclick>`，单汉字走中文边界正则防误替（269-274）。
- **角色登场切主题 BGM+壁纸**：`lib.skill._X_BGM` 在 `gameDrawAfter` 检测特定武将登场 → 选歌 dialog → 播歌并联动切对应 mp4/静态图（config.js:1063-1135）——"池子世界"角色登场氛围的做法参考。
- **语音防叠加**：monkey-patch `game.playAudio`，skill 音频按"去尾号"键做 Set 去重（config.js:3-26）。

**反面教材**：skill.js 5477 行单文件；空壳文件充门面；arenaReady.js 两套近重复的 Proxy 组（xkx 通用 423-625 与 xgz 专属 627-795，8 个 Player 方法被包两层）；`broadcastAll` 序列化函数下发联机；242 个 mp4 壁纸全量打包；中文名路径硬编码 60+ 处。

### 1.7 英雄联盟杀

**值得学**：
- **一技管全部卡牌语音**（extension.js:529-538，一手核对）：全局隐藏技 `lib.skill._lolplayCardAudio`，`trigger:{player:'useCardBegin'}, direct:true`，content 一行 `game.playAudio('..','extension','新LOL','card', trigger.card.name)` —— **池子魔将 `audio/card/` 的卡牌语音照此一个钩子全接上**（先查该技能是否与已有全局守卫冲突）。
- 术语帮助内嵌 config 展开项（875-905）——名词释义零 UI 方案（与季刊八「名词释义」同款）。
- 限定技触发换 BGM（读 `extension_新LOL_newlol_bgm`，skill.js:3758）——大招演出低成本前菜。
- 负面装备：AI `equipValue` 为负的装备设计（card.js:14-60）。
- 召唤物绑定 `game.newlol_bind`（278-402）：身份/阵营/AI 态度劫持经 `game.broadcastAll` 下发保证主客机同步——**下发的是数据与闭包补丁，注意与红线区分**（它劫持 `isFriendOf` 等属万能 Hook，不可学；但"主客机同步靠 broadcastAll"的思路可参考）。

**反面教材**：info.json "1.0" vs package "1.031"（版本三处一致反例）；skill.js 19330 行；`get.distance`/`player.inRange` **无开关永久劫持**，靠运行时全场扫描短路（193、413）——每次距离计算都交税；大段注释死代码；card/ 目录图音混放。

### 1.8 标记补充（反面教材为主，挂载思想可取）

- **挂载点清单**（"什么事件配什么特效"的映射思想）：入场=`gameStart`、受击=`damageBegin4`、用牌=`useCardBegin`、阵亡=`dieAfter`、护甲=覆写 `changeHujia`；国战标记挂 `ui.arena` 级全局 div。
- 三播放器并存：`dcdAnim.loadSpine/playSpine({parent:player})`（十周年UI 全局）、`skinSwitch.chukuangWorkerApi.playEffect`（皮肤切换 Worker）、`decadeUI.animation.playSpine`；播放句柄挂 `player.texiao_*` 自造属性供 stopSpine。
- **反面清单**（每一项都有对应红线）：`priority: Infinity`/`114514`；同一代码块原样复制 4 份；19447 行单文件 + 902KB `.bak` 在打包目录；无守卫裸调 `dcdAnim` 802 处、`skinSwitch.chukuangWorkerApi` 583 处（缺扩展即 ReferenceError）；`window.xixiguagua/_ThunderMajun/_KAIZHAN` 等全局污染；mark.css 固定像素定位（换主题即错位）；intro 里内嵌作者照片 + `<style>@keyframes` 彩虹动画。**映射指示线开关一处配置写三处键还直改 `decadeUI.config`**（19393-19402）——跨扩展写键的事故原型。

### 1.9 观星美化（CSS 作用域极简样本）

- **依赖守卫**：每个入口函数 `if (!window.decadeUI) return` —— 共存探测最直白样板（extension.js:8、43、89）。
- **CSS 全量作用域**：整个 guanxing.css 挂在借来的宿主类名 `.yijiang_confirm-box` + 自己子类下，无全局泄漏（guanxing.css:3）。
- **border-image 九宫格弹窗**（19-23）：`border-width: 6px 59px 28px 59px; border-image-source: url(yj_dialog.png); border-image-slice: 46 61 28 59 fill;` —— 一张图换整个对话框质感。
- **金色标题字两套**（一手核对）：现役 = 36 层重复 `text-shadow` 描边（:41，性能反例，别学层数）；**注释版 = 多段金色渐变 + `-webkit-background-clip:text` + 四向 `drop-shadow` + `blur/saturate/contrast` 调色（:52-82）——池子魔将鎏金标题字直接取注释版**。
- 入场复用引擎自带 `@keyframes player-died`（:26）；收起 = 面板 `scale(0)` + 图标随状态换图（extension.js:139-167）；接管期间备份/还原 `lib.config.longpress_info`（131、719、730）——**借改全局配置前先备份还原**。
- **反面**：死配置 + 空函数占位（有开关无功能比没有更糟）；一个开关同时控制两个不相干功能；重写 `ui.updatehl` 不留降级路径。

### 1.10 皮肤切换.zip

0 字节空文件（下载未完成），未分析。其完整实现已内嵌于千幻聆音 `skinSwitch/`（23122 行：spine.js 10956 + animations.js 6004 + dynamicWorker.js 3916），且 `initSkinSwitch` **先探测 `window.skinSwitch`，外置版已装则跳过初始化**（skinSwitch-init.js:31-36）——"内嵌/外置双模"的依赖处理值得记住。

---

## 2. 联动候选清单（斗转星移式，按性价比排序）

> 通用守则（探测三段式）：**`typeof window.xxx === 'function'` / 存在性检查 → 使用 → 缺省回退**（点绛唇 mvp.js:106-141 三级回退为样板）；扩展启停统一用 `qhly_hasExtension` 式探测；**只读他人配置键，绝不写**；消费他人 API 前必守卫（标记补充 802 处裸调 = 血泪）。

**P0 现在就能做（≤10 行）**
1. `_status.PROTECTED_EXTENSIONS.push("池子魔将")`（precontent，包在 `if (window.decadeUI)` 守卫里）——防十周年UI"关闭其他扩展"误杀。
2. 露头图目录：高清立绘到位后，产出 `image/character/dcloutou/<武将>.jpg`（可选 ssloutou）即自动生效，零代码。
3. 演出降级链写进 M2 设计：`window.swTool?.playSkillFullVideo` → `window.decadeUI?.animation.playSpine` → 自研 mobilefx 帧序列兜底。

**P1 资料卡批次**
4. **反向输出**：暴露 `window.cshDossier = { open(characterName) }` 单点 API（学 `_pushYjcmJsFn` 注册窗模式）——其他扩展（点绛唇右键、一将成名列表）可唤起池子魔将资料卡。
5. 皮肤页：照 §1.1-4 契约扫描 `SKIN_ROOTS`，写标准键 `lib.config.skin[id]=[名,路径]`；立绘解析照抄 `resolveOriginSrc` 四层判序。
6. 试听：`qhly_probeSkillAudioCount` 模式盘点 `audio/skill/` 实际条数；`new Audio()` onerror 回落链（资料卡环境没有 ui.window）。

**P2 经济联动**
7. **一将成名背包兑换**（与现有斗转星移兑换同构）：探测 `window._yjcm`；道具族 金票(jinpiao)/手气卡(shouqika)/换将卡(huanjiangka)/招募令(zhaomuling)…；**读写守则（必须遵守，§1.1 反面教材）**：读 `BackpackManager.getBackpackAll()[item]` 原始值、写 `BackpackManager.saveBackpack(对象)` 直写，**绕过 `getItemNum`（≥10万返回 "1.23w" 字符串）与 `changeItemNum`（NaN 清零 bug）**；汇率入 `csh_registry.js` 唯一真值；玩家文案不出现内部术语。
8. **结算插队链**：`window._pushYjcmJsFn({ index: 100±n, fn(胜负bool) })` 注册 CBY 结算（守卫 `typeof window._pushYjcmJsFn === 'function'`；index 选 <100 或 >100 明确先后）。
9. 点绛唇战绩互认：资料卡战绩区探测 `lib.config.extension_点绛唇_winner` 有则合并展示；反之我们暴露 `csh_winrate` 汇总。

**P3 远期**
10. `lib.qhlypkg` 皮肤包声明（M2 皮肤系统重做时）——千幻聆音用户群零成本接入。
11. `window.xIntroduce` 词条弹窗复用（若幻梦在场，技能文案术语可点击）。
12. 池子扭蛋/抽盒：一将成名 `zhaomu` 的概率区间+保底+重复转化模式，经济全走 `csh_wallet`（期望 ≤0 守护）。

---

## 3. 协议与规范速查

**全局 API 探测表**（调用前一律守卫）：

| 扩展 | 探测 | 用途 |
| --- | --- | --- |
| 十周年UI | `window.decadeUI` / `window.decadeModule` | 动皮/Spine/露头/角标/关闭白名单 |
| 云中守望 | `window.swTool` | 演出四件套 |
| 一将成名 | `window._yjcm` / `window._pushYjcmJsFn` / `lib._cust_character` | 背包/结算链/大厅期武将聚合表 |
| 千幻聆音 | `game.qhly_hasExtension('千幻聆音')` / `window.qhly_playDieAudio` | 皮肤语音/试听 |
| 点绛唇 | `typeof game.openBpDialog === 'function'` | 禁将/MVP/资料卡/战绩 |
| 幻梦 | `window.xIntroduce` / `window.xOpenDialog` | 词条弹窗 |
| LOL杀 | `window.decadeUI?.eventDialog` 类互操作点 | （无经济系统） |

**资源目录契约对照**（M2 语音/皮肤/演出选型参考）：

| 维度 | 池子魔将现状 | 千幻聆音 | 云中守望 | 备注 |
| --- | --- | --- | --- | --- |
| 技能语音 | `audio/skill/csh_<技>N.mp3` + `audio:"…:N"` | `<包>/audio/<武将>/<皮肤>/<技>N.mp3` | `assets/audio/<角色>/swe_<技>N.mp3` | 云中守望的"角色目录+角色名前缀"最利于按角色盘点 |
| 阵亡语音 | `audio/die/csh_<id>.mp3` | 皮肤包 `die/` | `assets/audio/<角色>/<角色>.mp3`（同名） | 同名约定利于零配置 |
| 皮肤 | characterSubstitute 声明表 | sanguoskin 目录 + qhlypkg | characterSubstitute + mp4 | 目录约定是跨扩展最大公约数 |
| 演出 | mobilefx 帧序列 + DOM 特效 | spine(绑十周年UI) | 50帧边框+mp4+Promise | 我们的移动端优势 + 它们的 API 形态 |

**条数探测/防叠加/轮换计数**：`thunderFileExist` 逐个探测（千幻聆音）、`playAudio` 去尾号 Set 去重（幻梦）、`_status.qhly_skillAudioWhich` 轮换（千幻聆音，一将成名复用）——语音导演三件基础设施，均有现成实现可参照。

---

## 4. 与路线图映射

- **M1（100 武将 + P3 拆包）**：反面教材 §1.3/§1.7 的 1.9万行单文件是拆包必要性的外部实证；priority 定则的反面样例见 §1.8。
- **M2 表现层**：资料卡设计前精读 §1.1（布局+数据四件套+试听）、§1.4（稀有度/衍生技区/势力底图）、§1.5（露头图零代码接入）；演出引擎前精读 §1.3（四件套+mp4 硬数据+看门狗）、§1.6（播放器骨架+safeKey）；语音导演前精读 §1.2（三层结构+条数探测+防叠加）；**所有面板/浮层动手前过 `ui-panel-cookbook.md`**。
- **M3 池子世界**：结算画面 §1.4（MVP 现算徽章 + lib.onover 共存实证）；对局→CBY 的结算插队 §2-8；经济联动 §2-7（背包读写守则）；反向输出 §2-4（cshDossier）。

---

## 5. 技能特效专题（2026-10-07 · D:\TEncent 十个扩展源码级调研）

> 起因：作者指出「池子魔将首先是一个**武将扩展**」——武将的技能光有结算没有动静，玩起来闷。
> 调研对象：`D:\TEncent\_ext_analysis\` 下十个扩展（decadeUI 十周年UI / qianhuanyin 千幻聆音 /
> yunzhong 云中守望 / yijiang 一将成名 / dianjiangchun 点绛唇 / huanmeng 幻梦 / lol LOL杀 /
> biaoji 标记补充 / pifubao 皮肤包 / 观星美化）。

### 5.1 三条触发链路（外部怎么做）

| 路线 | 代表 | 机制 | 我们的取舍 |
| --- | --- | --- | --- |
| A 覆写 `$skill` | decadeUI | 整体替换 `lib.element.player.$skill`，`game.broadcastAll` 后本地播 Spine | ✗ 万能 Hook（红线 #4） |
| B 包 `trySkillAnimate` | 云中守望 | 存 `_old` 再包装，读 `lib.skill[name].skillAnimation` | ✗ 同上，且只服务带 skillAnimation 的技 |
| C **隐藏规则技** | **标记补充** | `lib.skill._useskill` 监听 `logSkillBegin`/`useSkillBegin`，`filter` 收窄后播特效 | ✅ **已采纳** |

**C 的写法要点**（`biaoji/extension.js:14166`）：技能名 `_` 开头 = 引擎视为隐藏规则技（不进技能栏）；
配 `direct:true, popup:false, silent:true, superChalotte:true, priority:114514` 保证不弹技、不进日志、最先执行。
**它的价值**：一句话给"所有技能"加演出，且不动任何技能一行。我们的 `core/csh_skillfx.js` 就是这条路线。

### 5.2 演出资源三种形态（外部现状）

| 形态 | 代表 | 成本 | 采纳 |
| --- | --- | --- | --- |
| Spine（.atlas+.skel+.png，WebGL canvas） | decadeUI / 千幻聆音 / 云中守望 | 资源重、要 WebGL、要池化与 Worker | ✗ 我们有 mobilefx 帧序列，不引第二套引擎 |
| 帧序列（img + setInterval） | 云中守望 `swTool.js:926` | 轻，但 8 帧 300ms 很粗 | ~ 我们 mobilefx 已是矢量采样播放器，更强 |
| **纯 CSS 大字** | decadeUI `scale-skill-name` / 云中守望 `sw_skillName` | 零资源、任何设备都拿得到 | ✅ **已采纳** |

**关键帧逐条对照后本地化的两条**（这是本轮最直接的收获）：
- decadeUI `effect.css:283` 的 `scale-skill-name`：`0%{scale:5} → 20%{scale:4.5} → 23%{scale:.95} → 27%{scale:1}` ——
  **缩量冲击 + 过冲回弹**。我们照此写了 `cshSkillNameIn`（4.2 → .94 → 1 → 收尾 1.06 淡出）。
- 云中守望 `skillAnimation.css:1` 的渐变文字三件套：`background-image:linear-gradient(...)` +
  `-webkit-background-clip:text` + `-webkit-text-fill-color:transparent`，配 `filter:drop-shadow()` 多层描边。
  我们换成本地配色（三档金 `#fbeec4→#d8b46a→#8f7136`）。
- 渐变按技能类型分档（云中守望 `:129`：觉醒技紫 / 限定技金 / 使命技红）——**留作扩展点**：
  我们的 `SKILL_FX` 表已预留 `tier` 字段，将来可按技能类型换成不同金色阶。

### 5.3 联机三件套（外部踩坑换来的，我们照做）

1. **广播传函数可以，但函数体不能依赖闭包**：decadeUI `cardTriggers.js:1` 在函数体内重新
   `const lib = window.lib || globalThis.lib` —— 因为广播过去的函数是远端重新构造的，闭包变量全丢。
   我们的 `localPlay` 同样只取全局、参数全是可序列化值（与 `csh_voice.localPlay` 一致）。
2. **客机可能没资源 ⇒ 静默降级是常态**：云中守望 `playSpine(...).catch(()=>{})`，
   注释原文「客机资源未同步时静默跳过，避免未处理拒绝弹错误框」。我们 `localPlay` 全 try/catch。
3. **CSS 文本同步**（云中守望 `package/precontent.js:19` + `script/preload.js:653,1606`）：
   把 CSS 文件读成文本存进 `_status.connectStyle`，随 `this.send` 一次性同步给客机，
   客机 `addStyle(id, cssText)` 注入。**留作 M2 演出联机化的参考**（我们目前演出走 mobilefx + 贴图，
   资源在扩展包内，客机装了扩展就有）。

### 5.4 落点与层级（外部共识）

- 演出层一律 `pointer-events:none`；**播放期间不加遮罩，用 `game.pause()` + 定时 `resume`**
  （decadeUI `core/utility.js:1` 的 `delay(ms)`；`_status.paused` 幂等判断必须有，否则 resume 会丢）。
- z-index：decadeUI 主画布 `7`（演出时临时抬到 `10` 再还原）、千幻聆音三层 `99999 / 4 / -2`。
  我们的横幅走 `2147482000`（**系统级浮层档**，见 ui-panel-cookbook §3）——因为它是"信息层"不是"画布层"，
  要盖住对局界面的一切。**这一点与外部不同，理由是我们的横幅不接收点击也不需要与 canvas 抢合成层。**

### 5.5 性能与移动端（外部硬数据）

- 全屏特效画布 **DPR 限 1**（云中守望 `swTool.js:657` 注释：全屏 spine 的高频渲染会与 mp4 立绘解码抢 GPU）。
- 并发上限：预载 2 路、播放池 4、Offscreen Worker 2×4、残影 DOM 池 30（decadeUI）。
- 降级：无 WebGL 就把所有方法替换成空函数（decadeUI `AnimationPlayer.check()`）——**不抛错、不残留画布**。
- 我们的横幅是纯 CSS 动画，天然不占 WebGL、不申请额外合成层，且 2.3s 后自删节点 —— 无需池化。

### 5.6 本轮结论（→ 已立方案，未实施）

调研结论**全部并入 `docs/skill-fx-plan.md`**（技能演出方案：现状管线 / 接料口一般化 / 时序共存纪律 /
施工七步 / 素材规格）。本节的定位退回"调研证据"：上面 §5.1~§5.5 是**外部怎么做的原始记录**，
方案怎么定、我们为什么这么改，一律看那份方案文档。

**两条来自本轮、必须记住的判断**：
1. **演出 ≠ 字体特效**（作者定则 2026-10-07）：作者要的是文鸯「却敌」/ 大爱仙尊「逆流」那种
   **素材级演出**（视频/帧序列 + 音效 + 全屏停顿）。CSS 大字横幅做出来实测定格 43px、
   质感也体面，但作者一眼否掉——**演出的价值来自素材，不是来自给文字加渐变**。
   CSS 文字层只配做**信息**（伤害数字、技能名提示），不配冒充演出。
2. **我们的 mp4 管线已经比这三家都成熟**：现役 `_niliuVideo` / `_quediVideo`（`main/content.js`）
   已经有羽化遮罩、三层振幅摇屏、控件隐藏、自动播放兜底、失败回退 CSS 演出、超时保险。
   外部三家（Spine 系）反而更重（要 WebGL + 池化 + Worker）。
   **我们的短板不是"没有演出能力"，是"每加一支素材要改三处代码"** —— 方案 §2 就是解决这个。
