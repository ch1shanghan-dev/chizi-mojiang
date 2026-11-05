# 成就扩容开发数据

此目录的data是规则作者源数据，不是玩家存档或测试输出。career-expand.json含1507条扩容定义，已同步局均击杀与日课单位修正；hero-expand.json为100名武将的扩容规格。现有总定义12042（生涯2000、池子10042），不表示全部内容质量或自然采集已验收。

从扩展根目录运行：

```
node tools/achv_scale/probe_career_expand_20261104.mjs --out D:/CodexWork/checks/career.json
node tools/achv_scale/probe_hero_expand_20261104.mjs --out D:/CodexWork/checks/pool.json
```

应用器仅接受明确--root和--data，应用时会整块替换新增部分；必须先比较实际当前源码，避免覆盖手工维护。请使用此处已修正的源数据，不重新应用旧outputs/m3快照。当前生成器读取已有定义避免重号，不能在完整扩容副本上直接再生成一次后当成相同基线产物。

tools/probe_career_claim_capacity与probe_career_task_expansion中的变更前源码/文案检查属于本地轮次审计，需要相应--out上级目录中的before-csh_achv.js和修正数据；不作为从干净检出运行的默认CI。常规回归入口为tools/check.js，上述两项不是独立发布验收。机器路径均为示例，测试产物固定D盘，不进仓库。

退隐规格已兼容修复：当前人数最大150，旧cx_retired_152保留ID但阈值150；156条文案使用当前人数，非累计次数。不要重新应用旧D盘输出覆盖维护数据。可达性审计探针要求显式--baseline-dir指向变更前源码/数据及本次regenerated.json，常规条件验收使用上述扩容探针。
