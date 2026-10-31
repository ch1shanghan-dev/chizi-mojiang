# U01小节点：世界头部同排与长文本

日期2026-10-29。代理world_ui_review独立实施、主代理统一集成。版本4.1.0不变，不发布。本代理只修改core/csh_world_view.js样式，新增tools/probe_world_header_host.mjs；没有修改钱包、规则、版本、共享文档、catalog或check.js。

## 复现

原world-layout-410真实宿主专项5通过/1失败：390×844下正常世界头部高度105px，超过既有正常态85px预算。截图before/world-layout-390x844.png显示去德州按钮落到第二排，余额/近况独占上排。

原因是最后生效的`.csh-world-hero>div`使用260px flex-basis，390竖屏正文宽度减去按钮与间距后容纳不了该基准，于是按钮换行。新专项还确认：超长无空格旧状态文本在390下引起头部/正文横向溢出，之前只测中文默认内容未暴露。

## 最小修改

1. intro flex-basis从260px改成160px，仍flex-grow/shrink和min-width:0。普通竖屏让简介合理换行，与44px牌桌按钮保持同排；电脑及三款横屏不改变正常头部高度。
2. intro中的h2/p补min-width:0、max-width:100%、overflow-wrap:anywhere，长连续标识符可以换行。未缩字、未隐藏余额/签到/相识/同桌/在场内容、未缩按钮。

没有改mount及其后任何业务源码；相对施工前备份逐字一致。告警态与长文本态允许真实内容撑高，不强求85px、不裁切重要说明。

## 正常态前后高度

| 视口 | 修前 | 修后 |
| --- | --- | --- |
| 1365×768 | 54px | 54px |
| 915×412 | 54px | 54px |
| 844×390 | 54px | 54px |
| 640×286 | 54px | 54px |
| 390×844 | 105px | 71px |

旧world-layout-410同组从5/1到6/0；新版world-header专项同组从48/2到50/0、0运行异常。

## 真实宿主专项覆盖

- 五尺寸正常态：头部预算、必需近况文字、正文字号不低于12、按钮字号不低于14、按钮高度44、按钮与文本不交叠、横向无溢出、初始点击命中。
- 915/844/640/390四尺寸真实错误告警：在隔离profile写损坏结果簿，让实际pending.status及world.mount生成错误，保留去行囊和去德州两个动作并验证命中；不是直接把class伪装成错误态。告警高度依次54/54/75/145px，都可读且动作可点。
- 915/640/390三尺寸长文本压力：只向测试DOM注入长中文说明、无空格标识及长余额标题，验证不截断/不横溢、按钮仍44px且可滚动命中。此处余额标题是布局夹具，不是资产变更；真实钱包未改。
- 真鼠标点击牌桌入口，进入原生带入确认后取消，余额不变。
- 真鼠标点击行囊检查，打开真实行囊错误说明，原损坏日志保持不被清掉，余额不变。

长文本正确换行可能增高（640为89→107px、390为141→182px），这是避免裁切的必要布局，不宣称所有状态头部都变矮。常规85px预算仅用于短正常态。

## 证据与复验

- 备份：csh_world_view.before.js与before-hash.json。
- 旧专项：before/host-smoke.json、after-core/host-smoke.json及前后四尺寸截图。
- 新专项：before-full/host-smoke.json、after-full/host-smoke.json；各自world-header-metrics.json、正常/告警/长文本截图。
- 新探针默认从项目相对路径定位，要求外部--out；可传--world-source读取外部旧源码经只读服务器替换该单一JS响应，不反复覆盖安装文件。
- 本代理范围git diff --check通过；主代理负责最终全局check/simulate_world和清单同步，不据此冒称本批全局门禁已经执行。

复验示例：

    node tools/probe_host_smoke.mjs --world-layout-410 --out <外部目录>
    node tools/probe_world_header_host.mjs --out <外部目录>

这是完整无名杀宿主+独立Chromium配置和测试存档，不访问用户profile或生产服务；仍不能称Android/Electron实体设备已通过。主题素材、武将AI和人物资源不变。本节点只收尾世界头部，不把世界人物/事件整体信息架构或全局主体有效面积标完成。
