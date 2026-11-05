/* 门禁探针重试语义的反例（2026-11-05）
 *
 * 背景：完整门禁在大批探针串行 + 机器高负载时，个别依赖真实时钟/微任务深度的断言会偶发失败
 * （实测 E57 批次2 与 E48 事务各偶发一次，且是不同断言；单跑均稳定通过）。
 * check.js 因此把探针执行统一收敛到 runProbeJson：失败重试一次，并把重试打印成 [RETRY]。
 *
 * 这条反例不测业务，只测那层重试本身，防止以后有人「顺手」把重试改成无限重试、
 * 或者改成把失败吞掉当通过 —— 那会让门禁失去意义。
 *
 * 用法：node tools/probe_gate_retry_20261105.mjs [--out <dir>]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { execFileSync } = createRequire(import.meta.url)("child_process");

const argv = process.argv.slice(2);
const outArg = argv.indexOf("--out");
const outDir = outArg >= 0 && argv[outArg + 1] ? argv[outArg + 1] : null;

/* 从真实 check.js 抽出函数体：测的是将要发布的代码，不是复制品 */
const src = fs.readFileSync(path.join(ROOT, "tools", "check.js"), "utf8");
const start = src.indexOf("let probeRetries = 0;");
const end = src.indexOf("/* ------------------------------------------------------------------ *\n * 一、语法检查");
if (start < 0 || end <= start) {
	console.error("无法从 tools/check.js 提取 runProbeJson（函数被改名或移动了？）");
	process.exit(2);
}

/* 独立沙箱目录：只放本反例的三个假探针，跑完逐个删除 */
const sandbox = fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), "csh-retry-"));
const probeDir = path.join(sandbox, "tools");
fs.mkdirSync(probeDir);
const marker = path.join(probeDir, ".attempts");
fs.writeFileSync(path.join(probeDir, "fake_flaky.mjs"),
	'import fs from "node:fs";\n' +
	'const m = new URL("./.attempts", import.meta.url);\n' +
	'let n = 0; try { n = Number(fs.readFileSync(m, "utf8")) || 0; } catch (_e) {}\n' +
	'n += 1; fs.writeFileSync(m, String(n));\n' +
	'process.stdout.write(n === 1 ? \'{"passed":133,"failed":1}\' : \'{"passed":134,"failed":0}\');\n');
fs.writeFileSync(path.join(probeDir, "fake_alwaysfail.mjs"), 'process.stdout.write(\'{"passed":3,"failed":2}\');');
fs.writeFileSync(path.join(probeDir, "fake_nofield.mjs"), 'process.stdout.write(\'{"passed":9}\');');

const logs = [];
const api = new Function("ROOT", "spawnOk", "execFileSync", "path", "log",
	src.slice(start, end) + "\n return { runProbeJson: runProbeJson, retries: function(){ return probeRetries; } };"
)(sandbox, true, execFileSync, path, s => logs.push(s));

const reset = () => { try { fs.unlinkSync(marker); } catch (_e) {} };
const attempts = () => { try { return Number(fs.readFileSync(marker, "utf8")) || 0; } catch (_e) { return 0; } };

const checks = [];
const record = (name, pass, detail) => checks.push({ name, pass, ...(pass ? {} : { detail }) });

reset();
const r1 = api.runProbeJson("fake_flaky.mjs", [], { timeout: 20000 });
record("1/flaky probe retried once and returned the passing result",
	r1.failed === 0 && r1.passed === 134 && attempts() === 2 && api.retries() === 1,
	{ r1, attempts: attempts(), retries: api.retries() });
record("1/retry is reported as [RETRY] and does not count as a warning",
	logs.some(l => l.includes("[RETRY]") && l.includes("fake_flaky.mjs")), { logs });

reset();
let threw = null;
try { api.runProbeJson("fake_alwaysfail.mjs", [], { timeout: 20000 }); } catch (e) { threw = String((e && e.message) || e); }
record("2/persistent failure throws after two attempts (real defects are not masked)",
	threw !== null && /2 项失败/.test(threw), { threw });
record("2/default retry budget is exactly one extra attempt", api.retries() === 1, { retries: api.retries() });

const r3 = api.runProbeJson("fake_nofield.mjs", [], { timeout: 20000 });
record("3/probe without a failed field is returned unchanged",
	r3 && r3.passed === 9 && r3.failed === undefined, { r3 });

/* 清理：逐个文件删除，避免递归删除触发宿主批量删除保护 */
for (const f of ["fake_flaky.mjs", "fake_alwaysfail.mjs", "fake_nofield.mjs", ".attempts"]) {
	try { fs.unlinkSync(path.join(probeDir, f)); } catch (_e) {}
}
try { fs.rmdirSync(probeDir); } catch (_e) {}
try { fs.rmdirSync(sandbox); } catch (_e) {}

const failed = checks.filter(c => !c.pass).length;
const passed = checks.length - failed;
for (const c of checks) {
	console.log((c.pass ? "PASS " : "FAIL ") + c.name + (c.pass ? "" : " :: " + JSON.stringify(c.detail)));
}
const summary = { total: checks.length, passed, failed, checks };
if (outDir) {
	fs.mkdirSync(outDir, { recursive: true });
	fs.writeFileSync(path.join(outDir, "gate-retry.json"), JSON.stringify(summary, null, "\t"));
}
console.log(JSON.stringify({ total: checks.length, passed, failed }));
process.exitCode = failed ? 1 : 0;
