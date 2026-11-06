// 本副本 csh_achv.js 运行时「定义结构」的规范化与指纹。
// 由 probe_task_definitions.mjs 与 verify-baseline.mjs 共用，避免规范化口径漂移。
// 注意：只冻结稳定的元数据字段（key/cat/ico/label/desc/reward），不含 prog/test 函数；
// 行为语义由探针的 A.test / A.evalAll 断言直接验证，不复制进静态基线。
import {createHash} from 'node:crypto';

// 单条定义的元数据（与原 probe_task_definitions.mjs 的 metadata(d) 完全一致），
// 供严格模式逐键比对改前/改后文案与奖励。
export const metadata = d => JSON.stringify({key:d.key,cat:d.cat,ico:d.ico,label:d.label,desc:d.desc,reward:d.reward});

// 全量定义结构的规范化表示：数组形式，紧凑、稳定、可复算。
export const canonical = defs => defs.map(d => [d.key,d.cat,d.ico,d.label,d.desc,d.reward]);

// 结构指纹：对规范化表示做 sha256。任何键序 / 文案 / 奖励变化都会改变它。
export const fingerprint = defs => createHash('sha256').update(JSON.stringify(canonical(defs)),'utf8').digest('hex');
