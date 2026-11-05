# B9 · 孤儿专项清单与「救回能跑的关键专项」

日期：2026-11-06。编制：WorkBuddy（并行子代理，第三轮）。工作目录固定副本
`D:/CodexWork/chizi-mojiang/workbuddy/ext/app/extension/池子魔将`。
全程只读业务文件；产物落 `workbuddy/outputs/wb-public/parallel-b3/`，`TEMP/TMP` 指向 D 盘 temp。
未提交/推送/发版/升版本，`4.0.16` 一字未动，未跑 `node tools/check.js` 完整门禁，未改两个验证入口。

## 交付摘要

| 项 | 数字 |
| --- | --- |
| `tools/probe_*.mjs` 总数 | **232** |
| 被 `tools/check.js` 引用的探针 | 59 |
| 被 `tools/check_update_suite.mjs` 引用的探针 | 12 |
| 两入口引用并集（真实存在，无悬空引用） | 68 |
| **孤儿专项差集（未被任何验证入口引用）** | **164** |
| 抽样实跑 | **15** 个（run1 + run2 两轮，覆盖成就/世界/钱包/迁移/小游戏/生涯页） |
| 补充排查（为定位可修探针而扩跑） | 4 个 |
| 抽样全绿 | 13/15；环境限制 1；绿但契约不符 2（见 §三） |
| **修好的孤儿探针** | **2 / 0**（`probe_career_rewards.mjs` 28/1→**29/0**；`probe_world_encounters.mjs` 32/3→**35/0**） |
| 修复后验证 | 各实跑 **3 次**，全部 exit=0 / failed=0 |
| 建议注册行 | §六（本轮**不改** `check.js` / `check_update_suite.mjs`，主线程统一接入） |

---

## 一、机器清点：差集怎么算出来的

清点脚本：`workbuddy/outputs/wb-public/parallel-b3/inventory_orphans.mjs`（只读，输出
`orphan_inventory.json` / `orphan_list.txt`）。

算法：

1. `fs.readdirSync('tools')` 取 `^probe_.*\.mjs$` 的全部文件名 → **232** 个。
2. 对 `tools/check.js`、`tools/check_update_suite.mjs` 分别用
   `/probe_[a-z0-9_]+\.mjs/g` 抽取全部出现的探针名（含 `runProbeJson(...)` 调用、
   表格字符串常量、`fs.existsSync` 存在性检查、注释），各取去重集合：
   - `check.js` → **59** 个
   - `check_update_suite.mjs` → **12** 个（`probes` 数组，另有注释中的名字一并计入）
3. 两集合取并集 → **68** 个。
4. `orphans = all.filter(f => !referenced.has(f))` → **164** 个。

严谨性校验（实跑）：

```
referenced 中不存在于 tools/ 的名字: []          ← 无悬空引用
all = 232   referenced = 68   交集 = 68   差集 = 164
```

并已复核：`check.js` 中除一条注释（`probe_pool_achv/rebuild/browser 覆盖`）外**没有动态拼接的
探针名**，因此正则枚举不会漏判。注意：并集 68 小于 59+12=71，因 3 个探针被两个入口同时引用
（`probe_update_transaction.mjs`、`probe_online_offline.mjs`、`probe_backup_lifecycle_20261104.mjs`）。

### 完整差集清单（164 个，按文件名字典序）

```
  1 probe_4_0_12_economy.mjs
  2 probe_achievement_album.mjs
  3 probe_achievement_album_host.mjs
  4 probe_achievement_earned_time_host.mjs
  5 probe_achievement_feedback_host.mjs
  6 probe_achievement_quality.mjs
  7 probe_achievement_rarity_host.mjs
  8 probe_achievement_recent_host.mjs
  9 probe_achievement_search_host.mjs
 10 probe_affection_recovery.mjs
 11 probe_art_baseline.mjs
 12 probe_audio_browser.mjs
 13 probe_audio_bus.mjs
 14 probe_aux_rewards_host_20261104.mjs
 15 probe_aux_spirit.mjs
 16 probe_backup_ui_20261104.mjs
 17 probe_bag_content_host.mjs
 18 probe_bag_flow_rebuild.mjs
 19 probe_bashen_ai.mjs
 20 probe_blackjack_presentation_20261102.mjs
 21 probe_blackjack_public_insurance_ui_20261103.mjs
 22 probe_bond_progress.mjs
 23 probe_boss_ai.mjs
 24 probe_boss_reward_actual.mjs
 25 probe_boss_transactions.mjs
 26 probe_bossbook_read_states_20261103.mjs
 27 probe_bossrecord_recovery.mjs
 28 probe_bossrecord_upgrade.mjs
 29 probe_career_achievements.mjs
 30 probe_career_claim_capacity_20261104.mjs
 31 probe_career_gamble_host.mjs
 32 probe_career_honor_art.mjs
 33 probe_career_inline_detail_20261103.mjs
 34 probe_career_interaction_host.mjs
 35 probe_career_player_combos_20261104.mjs
 36 probe_career_rank_combos_20261104.mjs
 37 probe_career_rank_host.mjs
 38 probe_career_ratio_unlocks_20261104.mjs
 39 probe_career_rewards.mjs
 40 probe_career_same_source_combos_20261104.mjs
 41 probe_career_scale_20261105.mjs
 42 probe_career_source_20261104.mjs
 43 probe_career_task_expansion_20261104.mjs
 44 probe_career_tasks_host.mjs
 45 probe_career_unlocks_host.mjs
 46 probe_career_wallet_combos_20261104.mjs
 47 probe_career_world_current_funds_20261105.mjs
 48 probe_career_world_friends_20261105.mjs
 49 probe_career_world_funds_20261105.mjs
 50 probe_career_world_hands_20261104.mjs
 51 probe_career_world_skill_20261105.mjs
 52 probe_challenge_profiles.mjs
 53 probe_character_masteries.mjs
 54 probe_cheer_outbox.mjs
 55 probe_codex_content_host.mjs
 56 probe_codex_selection_20261103.mjs
 57 probe_confirm_focus.mjs
 58 probe_content_first_host.mjs
 59 probe_debug_drag_host.mjs
 60 probe_doudizhu_refund_host_20261102.mjs
 61 probe_doudizhu_rematch_host_20261102.mjs
 62 probe_doudizhu_team_host_20261102.mjs
 63 probe_eg_scroll.mjs
 64 probe_fee_ui.mjs
 65 probe_feedback_archive_20261105.mjs
 66 probe_feedback_reading_20261104.mjs
 67 probe_first_batch.mjs
 68 probe_five_flows_20261103.mjs
 69 probe_five_tables_20261103.mjs
 70 probe_four_lines_host.mjs
 71 probe_fx_media.mjs
 72 probe_ganning_ai.mjs
 73 probe_gate_retry_20261105.mjs
 74 probe_ghost_swordsman_ai.mjs
 75 probe_gift_quantity_host.mjs
 76 probe_goal_recommendations_host.mjs
 77 probe_gundam_ai.mjs
 78 probe_haozhao.mjs
 79 probe_haozhao_art.mjs
 80 probe_haozhao_ui.mjs
 81 probe_haozhao_voice.mjs
 82 probe_haozhao_warwick_zhangxiu_ai.mjs
 83 probe_host_smoke.mjs
 84 probe_huaman_ai.mjs
 85 probe_huanggai_ai.mjs
 86 probe_huangzhong_ai.mjs
 87 probe_interact_audit.mjs
 88 probe_interact_recovery.mjs
 89 probe_interaction_context.mjs
 90 probe_jiaxu_xusheng_ai.mjs
 91 probe_landscape_contract.mjs
 92 probe_landscape_review.mjs
 93 probe_manual_props_host_20261103.mjs
 94 probe_manual_props_ui_20261103.mjs
 95 probe_market_browser.mjs
 96 probe_market_four_20261103.mjs
 97 probe_market_quote_20261103.mjs
 98 probe_market_upgrade.mjs
 99 probe_masteries_host.mjs
100 probe_match_reward.mjs
101 probe_match_reward_wallet.mjs
102 probe_memoir_talk_ui_20261103.mjs
103 probe_migrate_compat_20261105.mjs
104 probe_migration_failures.mjs
105 probe_minigame_active.mjs
106 probe_minigame_ai.mjs
107 probe_minigame_control_host.mjs
108 probe_net_security.mjs
109 probe_noncharacter_survey.mjs
110 probe_oath_bounty_host_20261103.mjs
111 probe_online_host.mjs
112 probe_other_table_host_20261103.mjs
113 probe_page_save.mjs
114 probe_panel_window.mjs
115 probe_panel_window_host.mjs
116 probe_player_boundaries.mjs
117 probe_player_interactions.mjs
118 probe_player_match_host_20261104.mjs
119 probe_player_match_save_ui_20261104.mjs
120 probe_player_match_ui_20261104.mjs
121 probe_player_optimization_host.mjs
122 probe_player_unlock_host_20261104.mjs
123 probe_pool_read_details_20261103.mjs
124 probe_progress_410.mjs
125 probe_rank_content_host.mjs
126 probe_rank_honor_20261103.mjs
127 probe_recovery_guard.mjs
128 probe_retired_reachability_20261105.mjs
129 probe_same_match_filter_host.mjs
130 probe_save_results.mjs
131 probe_skill_ai.mjs
132 probe_skill_ai_decisions.mjs
133 probe_spirit_death_host.mjs
134 probe_spirit_lifecycle.mjs
135 probe_task_definitions.mjs
136 probe_task_lifetime_host.mjs
137 probe_task_lifetime_migration.mjs
138 probe_texas_fees.mjs
139 probe_texas_host.mjs
140 probe_texas_presentation_20261102.mjs
141 probe_texas_rules.mjs
142 probe_three_pages_20261103.mjs
143 probe_tongbu_ai.mjs
144 probe_trick_presentation_host_20261102.mjs
145 probe_ui_410.mjs
146 probe_uno_presentation_20261102.mjs
147 probe_uno_recovery_host_20261103.mjs
148 probe_uno_reverse_diagnosis_20261104.mjs
149 probe_winrate_recovery.mjs
150 probe_winrate_ui.mjs
151 probe_world_encounters.mjs
152 probe_world_entry.mjs
153 probe_world_header_host.mjs
154 probe_world_heartbeat_host_20261104.mjs
155 probe_world_invitation_host.mjs
156 probe_world_lifecycle.mjs
157 probe_world_memoir_host.mjs
158 probe_world_memoir_ui.mjs
159 probe_world_relationship_detail.mjs
160 probe_world_result_status_host.mjs
161 probe_world_storylines.mjs
162 probe_world_table_host_20261102.mjs
163 probe_world_ui_rebuild.mjs
164 probe_xiantu_ai.mjs
```

> 说明：`probe_career_source_20261104.mjs`、`probe_retired_reachability_20261105.mjs`
> 仍在差集内，是因为主线程尚未把 B8 报告 §六 的建议注册行接入两个入口；本轮也未接入。

---

## 二、抽样实跑结果表（15 个，两轮）

 runner：`workbuddy/outputs/wb-public/parallel-b3/run_sample.mjs`。
先读源码确认参数契约再跑：`--out` 分「目录 / 结果文件 / 不需要」三类，不盲传；
浏览器类给 150–180s，`probe_achievement_quality.mjs` 给 240s。
每个探针 stdout/stderr 落到 `runs/<name>-runN/`，汇总在 `runs/sample-runN.json`。

| # | 探针 | 业务面 | 参数契约 | run1 exit / passed / failed | run2 exit / passed / failed | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `probe_career_achievements.mjs` | 成就 / 生涯页（浏览器） | `--out <dir>` 可缺省 | 0 / **142** / 0 | 0 / **142** / 0 | 全绿（stdout 文本，非 JSON） |
| 2 | `probe_achievement_quality.mjs` | 成就 | `--out <file>` 可缺省 | 60s 超时无输出 | 0 / **78** / 0（118s） | 全绿但**慢**；单独 300s 复跑亦 78/0 |
| 3 | `probe_achievement_album.mjs` | 成就（浏览器） | `--out <dir>` **必需且须 D 盘** | 0 / **40** / 0 | 0 / **40** / 0 | 全绿（纯 JSON） |
| 4 | `probe_world_lifecycle.mjs` | 世界 | 不需 `--out` | 0 / **67** / 0 | 0 / **67** / 0 | 全绿（纯 JSON） |
| 5 | `probe_career_world_funds_20261105.mjs` | 世界 / 资金 | `--out <dir>` **必需** | 0 / **28** / 0 | 0 / **28** / 0 | 全绿（纯 JSON） |
| 6 | `probe_career_scale_20261105.mjs` | 生涯页 / 扩容（浏览器） | `--out <dir>` 有默认 | 0 / **19** / 0 | 0 / **19** / 0 | 全绿（纯 JSON） |
| 7 | `probe_career_wallet_combos_20261104.mjs` | 钱包 | `--out <dir>` **必需** | 0 / **18** / 0 | 0 / **18** / 0 | 全绿（纯 JSON） |
| 8 | `probe_match_reward_wallet.mjs` | 钱包 | `--out <file>` 可缺省 | 0 / **57** / 0 | 0 / **57** / 0 | 全绿（纯 JSON） |
| 9 | `probe_migrate_compat_20261105.mjs` | 迁移 | `--out <dir>` 有默认 | 0 / **10** / 0 | 0 / **10** / 0 | 全绿（纯 JSON） |
| 10 | `probe_migration_failures.mjs` | 迁移 | 不需 `--out`（不传 `--browser` 走 VM 全量） | 0 / **57** / 0 | 0 / **57** / 0 | 全绿（纯 JSON） |
| 11 | `probe_minigame_active.mjs` | 小游戏（宿主浏览器） | `--out <dir>` **必需** | **1 / 0 / 2** | **1 / 0 / 2** | **环境限制**（见下） |
| 12 | `probe_texas_rules.mjs` | 小游戏 | `--out <file>` **必需** | 0 / **33** / 0 | 0 / **33** / 0 | 全绿（纯 JSON） |
| 13 | `probe_first_batch.mjs` | 生涯页 / 首批 | 不需 `--out` | 0 / **56** / 0 | 0 / **56** / 0 | 全绿（stdout 文本，非 JSON） |
| 14 | `probe_career_source_20261104.mjs` | 生涯来源（B8 已修，禁区只读观察） | `--out <dir>` **必需** | 0 / **12** / 0 | 0 / **12** / 0 | 全绿（纯 JSON） |
| 15 | `probe_retired_reachability_20261105.mjs` | 退役可达（B8 已修，禁区只读观察） | `--out <dir>` **必需** | 0 / **28** / 0 | 0 / **28** / 0 | 全绿（纯 JSON） |

### 「环境限制」与「真的坏了」的区分

- **`probe_minigame_active.mjs` = 环境限制，不是探针坏。**
  该探针把 `probe_host_smoke.mjs` 作为子进程启动，后者通过只读 localhost HTTP 服务加载
  `/index.html`。本副本缺 `ext/app/index.html`，实跑日志 `failedRequests` 明确给出
  `GET /index.html → 404`、`boot.body = {"success":false,"errorMsg":"Not found"}`、
  `globals: {lib:false, game:false, CSH:false}`、`extensionLoaded:false`。
  两轮均 `exit=1 / 0 passed / 2 failed`，**如实记为环境限制，未冒充通过**。
- **`probe_achievement_quality.mjs` = 慢，不是坏。**
  run1 60s 超时零输出；单独给 300s 复跑 `exit=0 / 78/0`（166s），run2 给 240s 亦 `78/0`（118s）。
  它对 ~40 个 mutation 逐个 `await loadModel(root)` 全量重载 2000 条成就模型，故耗时远超
  `check.js` 的 20s 默认超时。若注册必须显式加大 timeout，或走独立慢速通道。
- 背景中曾提到的两个历史坏例，本轮实测**均已在前几轮修好、现为全绿**：
  `probe_first_batch.mjs`（曾 HARNESS_ERROR）现 **56/0**；
  `probe_career_achievements.mjs`（曾固化 493 条、126/16 FAIL）现 **142/0** 且断言已按 2000 条更新。
  但二者 stdout 是 `First batch: PASS 56 / FAIL 0` / `Career achievement browser: 142 PASS / 0 FAIL`
  **文本汇总，不是纯 JSON**，`runProbeJson`（`JSON.parse(stdout)`）无法直接读，见 §五/§六。

---

## 三、补充排查：定位「真的坏了」的孤儿专项

为找到可修对象，对差集里含旧数量字面量的探针做了定向排查（全在差集内，实跑确认）：

| 探针 | 触发点 | 实跑（改前） | 分类 |
| --- | --- | --- | --- |
| `probe_career_rewards.mjs` | 第 63 行 `h.AC.defs.length===493` | **exit=1 / 28 passed / 1 failed** | **探针自身过时**（写死扩容前 493）→ 本轮修 |
| `probe_world_encounters.mjs` | 第 24 行 `===149`、第 45 行 `===149000`、第 47 行 `===493` | **exit=1 / 32 passed / 3 failed** | **探针自身过时**（名册 149→150、定义 493→2000）→ 本轮修 |
| `probe_4_0_12_economy.mjs` | 第 11 行 `r.systemCollected===200` | **exit=1 / 15 passed / 1 failed** | **产品/基线变更，非探针夹具问题**→ 只记录，不修（§五） |
| `probe_task_definitions.mjs` | 第 4 行 `--out` 与 `--baseline` 均必需；第 8 行 `A.defs.length===493` | 不带参数 `Error: External --out and preserved --baseline required` | **夹具缺失**（本副本树内无改前 `csh_achv.js` 基线）+ 过时计数 → 只记录，不修（§五） |

过时硬证据（只读诊断脚本 `diag_world.mjs` 复用探针自身 harness，实测当前运行时）：

```
rosterLen 150 (原 149)   rawAiLen 150   worldHands 150000 (=150×1000，原断言写死 149000)
acDefsLen 2000 (原 493)  acStatsTotal 2000  selfTestCount 2000  retiredCount 0
oldKeysLen 465           oldKeysMissing 0   ← 465 个旧 key 一个没丢
```

即三个失败断言**全部只是写死了扩容前数字**，业务语义（旧键留存、不回填玩家历史、引擎自检）
完全成立，属于「探针自身过时」，可以且应当修。

---

## 四、修了什么（2 个，断言强度只增不减）

仅改两个孤儿探针自身文件，**未改任何产品代码、未删任何断言、未降低任何门槛**：
写死的扩容前数字改为**走引擎公开统计 API 的动态定义数**（同 B8 报告做法），
原阈值保留为**下界**，并新增 `stats()/selfTest()/defs` 多路计数互证。

### 4.1 `tools/probe_career_rewards.mjs`

- 第 63 行 `h.AC.defs.length===493` → `dynamic = A.stats().total`，
  断言 `defs.length===dynamic && defs.length>=493 && selfTest().count===dynamic &&
  RETIRED 为空 && selfTest().ok`。
- 保留原三条语义「已扩容 / 空退役集 / 自检通过」；`493` 作为下界保留（不是抬高也不是删除）；
  新增 `selfTest().count===dynamic` 一路互证 → **断言强度只增不减**。

### 4.2 `tools/probe_world_encounters.mjs`

- 第 24 行 `W.list().length===149` → 动态名册：
  `W.list().length===W.raw().ai.length && W.list().length>=149 && >0`（list 与 raw.ai 互证）。
- 第 45 行 `h.W.stats().hands===149000` → `===n*1000`（`n` 为变异前 `W.list().length`），
  完整保留「旧世界总手数不回填为玩家历史」语义。
- 第 47 行 `h.AC.defs.length===493` → 动态定义数，并保留
  `old.length===465`、`defs.length>=493`、`defs.length-old.length>=28`（原「新增 28 条」下界）、
  `selfTest().count===dynamic`、465 旧键全留存、`selfTest().ok`。断言名同步改为
  `... at least 28 definitions added (dynamic runtime count)`，与行为一致。

### 4.3 验证数字

| 探针 | 改前 | 改后 run1 | 改后 run2 | 改后 run3 | `node --check` |
| --- | --- | --- | --- | --- | --- |
| `probe_career_rewards.mjs` | exit=1 **28/1** | exit=0 **29/0** | exit=0 **29/0** | exit=0 **29/0** | 通过 |
| `probe_world_encounters.mjs` | exit=1 **32/3** | exit=0 **35/0** | exit=0 **35/0** | exit=0 **35/0** | 通过 |

两探针 stdout 均为**纯 JSON** `{passed, failed, failures}`，`exit` 按 `failed` 设定，
符合 `runProbeJson` 契约。复现命令（`TEMP/TMP` 指向 D 盘）：

```bash
export TEMP="D:/CodexWork/chizi-mojiang/workbuddy/temp" TMP="$TEMP"
cd "D:/CodexWork/chizi-mojiang/workbuddy/ext/app/extension/池子魔将"
node tools/probe_career_rewards.mjs      # 29/0
node tools/probe_world_encounters.mjs    # 35/0
```

版本号复核：`extension.js` / `info.json` / `package.js` / `README.md` 的 `4.0.16` 经 grep 全部完好。

---

## 五、明确未修的产品缺陷 / 限制（只记录，不硬修）

1. **`probe_4_0_12_economy.mjs` 15/1 —— 抽水模型已变，属产品/基线变更。**
   失败断言 `new registry fee has no twenty cap and conserves funds` 期望
   `r.systemCollected===200`。实测当前 `core/csh_registry.js` 的
   `texasRake()` = `{modelVersion:2, anteBbBps:1000, rateBps:50, cap:null, noFlopNoDrop:true}`，
   对 20000 底池按 50bps 实收 **100**，`conservation:'PASS'`。
   即费率/上限的产品行为已改（V2、无 cap、50bps），探针仍按旧模型写死 200。
   **这不是探针夹具缺失，硬改断言等于替产品决定费率**，故本轮不修、只记录；
   需产品负责人确认「100 是否预期」，再决定改断言还是改产品。
2. **`probe_task_definitions.mjs` —— 外部基线夹具缺失（且含过时 493 计数）。**
   契约要求 `--out` 与 `--baseline`（改前 `csh_achv.js`）同时提供；本副本树内
   `find` 确认无任何 `.before` / `before-csh_achv.js` 基线文件，`tools/fixtures/` 仅有
   `career-source-baseline/` 与 `career_v4_0_9_ids.json`。缺基线时探针直接抛错、无法启动。
   制造一份 493 条的改前引擎快照超出本轮「救回能跑」范围（且易与 B8 的静态基线策略重复），
   故只记录。第 8 行 `A.defs.length===493` 同样是过时计数，将来补基线时须一并改为动态。
3. **`probe_minigame_active.mjs` / 所有 `*_host.mjs` 宿主类 —— 环境限制。**
   本副本缺 `ext/app/index.html`，`probe_host_smoke.mjs` 的 `/index.html` 请求 404，
   浏览器起不来。两轮 `exit=1 / 0/2`，**如实记为环境限制，未冒充通过**。
   抽样中只取了这一个宿主类作代表；差集里其余 `*_host.mjs`、`probe_online_host.mjs`、
   `probe_panel_window_host.mjs` 等预计同属此类，本轮未逐个实跑（避免把 70s/个的环境失败
   误当成缺陷）。
4. **`probe_achievement_quality.mjs` 78/0 但 118–166s。** 全绿但远超 `check.js`
   `runProbeJson` 默认 20s / E57—E94 段 30s 的超时预算；注册必须显式给 ≥200000ms，
   否则会被误判为失败（run1 60s 超时就是证据）。建议走独立慢速通道，不塞进快速门禁。
5. **`probe_career_achievements.mjs` (142/0) 与 `probe_first_batch.mjs` (56/0) 全绿但
   stdout 不是纯 JSON。** 二者输出为文本汇总，`runProbeJson` 内部 `JSON.parse(stdout)` 会抛错，
   **不能直接给注册行**。若主线程想纳入，需先让探针额外输出纯 JSON 汇总（属契约改造，
   本轮未做，避免越权改不在「修可修 1–2 个」范围内的探针）。

---

## 六、建议的门禁注册行（本轮**不改**两个入口，主线程统一接入）

`runProbeJson(script, args, opts)` 严格 `JSON.parse(stdout)`，只看 `failed` / `passed`；
下列建议**仅针对实跑全绿且 stdout 为纯 JSON 的孤儿专项**。
`tmpB9` 建议按 `check.js` 既有写法构造（`fs.mkdtempSync(path.join(auditTempRoot(),'csh-b9-'))`），
`auditTempRoot()` 落在 D 盘，满足 `probe_achievement_album.mjs` 对外部 D 盘 `--out` 的硬要求。
**min passed 取两轮实测稳定值**，语义同 `check.js`：`result.failed!==0 || result.passed<min` 即失败。

### 6.1 本轮新增建议（优先级高：VM 隔离、秒级、纯 JSON、两轮稳定）

```js
// 世界生命周期（67/0，不需 --out）
const rB9_world = runProbeJson('probe_world_lifecycle.mjs', [], {timeout:20000});
if(rB9_world.failed!==0||rB9_world.passed<67) eB9.push('世界生命周期回归未通过');

// 迁移失败与恢复（57/0，不需 --out，不传 --browser 走 VM 全量）
const rB9_migfail = runProbeJson('probe_migration_failures.mjs', [], {timeout:20000});
if(rB9_migfail.failed!==0||rB9_migfail.passed<57) eB9.push('迁移失败/恢复屏障回归未通过');

// 比赛奖励钱包（57/0）
const rB9_mrw = runProbeJson('probe_match_reward_wallet.mjs', ['--out', path.join(tmpB9,'match-reward-wallet.json')], {timeout:20000});
if(rB9_mrw.failed!==0||rB9_mrw.passed<57) eB9.push('比赛奖励钱包回归未通过');

// 德州规则与账本守恒（33/0，--out 必须是结果文件路径）
const rB9_texas = runProbeJson('probe_texas_rules.mjs', ['--out', path.join(tmpB9,'texas-rules.json')], {timeout:30000});
if(rB9_texas.failed!==0||rB9_texas.passed<33) eB9.push('德州规则/账本守恒回归未通过');

// 世界资金见证（28/0）
const rB9_funds = runProbeJson('probe_career_world_funds_20261105.mjs', ['--out', path.join(tmpB9,'world-funds')], {timeout:20000});
if(rB9_funds.failed!==0||rB9_funds.passed<28) eB9.push('世界资金见证回归未通过');

// 钱包组合资格（18/0）
const rB9_wallet = runProbeJson('probe_career_wallet_combos_20261104.mjs', ['--out', path.join(tmpB9,'wallet-combos')], {timeout:20000});
if(rB9_wallet.failed!==0||rB9_wallet.passed<18) eB9.push('钱包组合资格回归未通过');

// 迁移兼容（10/0）
const rB9_compat = runProbeJson('probe_migrate_compat_20261105.mjs', ['--out', path.join(tmpB9,'migrate-compat')], {timeout:20000});
if(rB9_compat.failed!==0||rB9_compat.passed<10) eB9.push('迁移兼容回归未通过');
```

### 6.2 本轮修好的两个（ restored，强烈建议接入，否则修了仍没人跑）

```js
// 生涯奖励/领取/迁移（29/0，B9 修：493 → 动态定义数）
const rB9_rewards = runProbeJson('probe_career_rewards.mjs', [], {timeout:20000});
if(rB9_rewards.failed!==0||rB9_rewards.passed<29) eB9.push('生涯奖励/领取回归未通过');

// 世界遭遇/名册/旧键留存（35/0，B9 修：149/149000/493 → 动态运行时值）
const rB9_enc = runProbeJson('probe_world_encounters.mjs', [], {timeout:20000});
if(rB9_enc.failed!==0||rB9_enc.passed<35) eB9.push('世界遭遇/名册回归未通过');
```

### 6.3 浏览器 / 慢速类（绿，但需显式超时或独立通道，请主线程权衡）

```js
// 成就相册（40/0，浏览器约 20s；--out 必须是 D 盘目录）
const rB9_album = runProbeJson('probe_achievement_album.mjs', ['--out', path.join(tmpB9,'album')], {timeout:60000});
if(rB9_album.failed!==0||rB9_album.passed<40) eB9.push('成就相册回归未通过');

// 生涯 2000 条扩容布局（19/0，浏览器约 22s）
const rB9_scale = runProbeJson('probe_career_scale_20261105.mjs', ['--out', path.join(tmpB9,'career-scale')], {timeout:60000});
if(rB9_scale.failed!==0||rB9_scale.passed<19) eB9.push('生涯扩容布局回归未通过');

// 成就质量审计（78/0，118–166s，远超快门预算；建议独立慢速通道而非快门）
const rB9_aq = runProbeJson('probe_achievement_quality.mjs', ['--out', path.join(tmpB9,'achievement-quality.json')], {timeout:200000});
if(rB9_aq.failed!==0||rB9_aq.passed<78) eB9.push('成就质量审计回归未通过');
```

### 6.4 交叉引用（B8 已给注册行，本轮两轮复跑确认仍全绿，不重复给行）

| 探针 | 本轮实测 | 建议 min passed | 出处 |
| --- | --- | --- | --- |
| `probe_career_source_20261104.mjs` | 12/0 ×2 | 12 | `WORKBUDDY_B8_STALE_PROBES_20261106.md` §六 |
| `probe_retired_reachability_20261105.mjs` | 28/0 ×2（默认自洽模式） | 28 | 同上 |

### 6.5 明确**不给**注册行的

| 探针 | 原因 |
| --- | --- |
| `probe_career_achievements.mjs` (142/0) | stdout 文本汇总，非纯 JSON，`runProbeJson` 会抛错 |
| `probe_first_batch.mjs` (56/0) | 同上 |
| `probe_minigame_active.mjs` (0/2) | 环境限制（缺 `ext/app/index.html`），非全绿 |
| `probe_4_0_12_economy.mjs` (15/1) | 产品/基线变更未裁决，§五.1 |
| `probe_task_definitions.mjs` | 缺外部基线夹具，起不来，§五.2 |

---

## 七、改动文件清单 / 禁区合规声明

**本子代理改动（仓库内，仅 3 个）：**

- 改：`tools/probe_career_rewards.mjs`（§4.1）
- 改：`tools/probe_world_encounters.mjs`（§4.2）
- 新增：`docs/audit/WORKBUDDY_B9_ORPHAN_PROBES_20261106.md`（本报告）

**新增辅助脚本 / 产物（均在 `workbuddy/outputs/wb-public/parallel-b3/`，不在仓库内）：**
`inventory_orphans.mjs`、`run_sample.mjs`、`diag_world.mjs`、`diag_world2.mjs`、
`orphan_inventory.json`、`orphan_list.txt`、`runs/sample-run1.json`、`runs/sample-run2.json`、
`runs/<探针>-runN/_stdout.log` 与 `_stderr.log`、`runs/fix-*.stdout`、`runs/stale-*.log`、
`runs/aq-long-*`。

**禁区复核（只读 `git status --short`）：** 工作区另有 `catalog.js`、`core/csh_update.js`、
`tools/check.js`、`tools/check_update_suite.mjs`、`tools/probe_career_source_20261104.mjs`、
`tools/probe_retired_reachability_20261105.mjs` 等改动，均来自**主线程/其他并行子代理**，
本子代理一字未碰。未改 `core/` 下任何文件、`tools/release.js`、`catalog.js`、`AGENTS.md`、
`docs/audit/CURRENT_WORK.md`、`README.md`，未碰 4 个指定禁区探针，
未运行生成模式的 `node tools/release.js`，未改任何 `4.0.16`。

未 `git add/commit/push`，未切分支 / reset / clean，未改 git 配置，未发远端请求，
未跑 `node tools/check.js` 完整门禁，未递归删除大批临时目录（scratch 由探针自身清理）。

---

## 八、残余限制

- 差集 164 个里本轮只实跑 15 + 补充 4；其余（尤其大量 `*_host.mjs` 宿主类、`*_ai.mjs`
  AI 类）未逐个跑，不能断言它们全绿或全坏。清单是机器枚举的完整结果，抽样是人工挑的重点面。
- 全绿判定基于本副本、D 盘 temp、隔离 VM / disposable Chromium profile，不代表真机 WebView、
  Electron / Android 实体设备或完整宿主链路。
- 「动态定义数」断言绑定当前 `stats().total` / `selfTest().count` / 名册 `list().length` 真值；
  将来再次扩容会随运行时自动跟随（这正是修复目的），但若引擎公开 API 本身被改坏，
  下界 `>=493` / `>=149` / `>=28 added` 仍会兜住「缩水」情形。
- 建议注册行只是文本建议，`min passed` 取两轮实测值；主线程接入时仍需自行在目标环境复跑确认。
