#!/usr/bin/env node
/**
 * U1 · 更新器任务生命周期反例（2026-11-05）
 *
 * 在原生 Chromium 里加载 **真实的 checkUpdate 控制器 / 样式 / 版本比较**，
 * 只把 CSHUpdate.create 换成可控事务，以精确制造交接第 4 节 U1 的交叉场景：
 *   连点、下载阶段关闭+重开、提交阶段关闭/重开、手动恢复与更新/清理互斥、
 *   旧任务迟到回包不解新任务锁。
 * 不检查「按钮 disabled」就收工；每项都核对实际任务数、锁状态、DOM 与提示文案。
 * 每个用例独立浏览器实例（重复 navigate 同一 file:// URL 会挂住 CDP 执行上下文）。
 * 隔离环境、内存磁盘、无网络、无真机安装。
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, parse, walk } from './lib/skill_audit.mjs';
import { withChromium } from './lib/chromium_audit.mjs';
import { auditTempRoot, removeAuditScratch } from './lib/audit_scratch.mjs';

const at = process.argv.indexOf('--out');
if (at < 0) throw Error('--out required');
const out = path.resolve(process.argv[at + 1]);
fs.mkdirSync(out, { recursive: true });

const source = fs.readFileSync(root + '/core/csh_debug.js', 'utf8');
let style, dialog, compare, versionArray;
walk(parse(source), n => {
	if (n.type === 'FunctionDeclaration' && n.id?.name === 'ensureUpdateStyle') style = source.slice(...n.range);
	if (n.type === 'FunctionDeclaration' && n.id?.name === 'cshVerArr') versionArray = source.slice(...n.range);
	if (n.type === 'FunctionDeclaration' && n.id?.name === 'cshVerCmp') compare = source.slice(...n.range);
	if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.property.name === 'checkUpdate') dialog = source.slice(...n.range);
});
if (!style || !dialog || !compare || !versionArray) throw Error('Actual updater source missing');

const setup = `
var errors=[],lc=window.__lc={applyCalls:0,recoverCalls:0,applyGate:null,recoverGate:null,applyError:null,
 progress:null,signal:null,toasts:[],saved:[],reloads:0,backupOpens:0};
onerror=m=>errors.push(m);onunhandledrejection=e=>errors.push(String(e.reason));
lc.makeGate=()=>{let r;const p=new Promise(x=>r=x);lc.gateResolve=r;return p;};
lc.reset=()=>{lc.applyCalls=0;lc.recoverCalls=0;lc.applyGate=null;lc.recoverGate=null;lc.applyError=null;
 lc.progress=null;lc.signal=null;lc.toasts=[];lc.saved=[];lc.reloads=0;lc.backupOpens=0;};
var lib={config:{},extensionPack:{'池子魔将':{version:'4.0.13'}},
 cshDebug:{openUpdateBackups:()=>{lc.backupOpens++}}},
game={saveConfig:(...v)=>lc.saved.push(v),reload:()=>{lc.reloads++}},
_status={},_cshUpdating=false,_cshUpdBase='',
CSH_UPDATE_SRC='https://isolated.invalid/',CSH_UPDATE_MIRRORS=[],
CSH_UPDATE_SOURCES=Array.from({length:5},(_,i)=>({name:'线路'+i,label:'线路'+i,base:'https://isolated'+i+'.invalid/'}));
var FILES=['README.md','extension.js'];
var manifest={'池子魔将':{version:'4.0.14',build:'test-build',files:FILES,
 hashes:Object.fromEntries(FILES.map(f=>[f,'0'.repeat(64)]))}};
window.CSHOnline={enabled:()=>true};
CSHUpdate.hostIO=()=>({read:async()=>null,write:async()=>{},remove:async()=>{}});
CSHUpdate.create=()=>({status:()=>({busy:false,phase:'idle'}),
 recover:async()=>{lc.recoverCalls++;if(lc.recoverGate)await lc.recoverGate;return {ok:true,empty:true};},
 apply:async(files,download,opt)=>{lc.applyCalls++;lc.progress=opt.progress;lc.signal=opt.signal;
  if(lc.applyGate)await lc.applyGate;if(lc.applyError)throw Error(lc.applyError);
  return {ok:true,count:files.length};}});
function toast(m){lc.toasts.push(String(m));}
function cshProbeAll(){return Promise.resolve(CSH_UPDATE_SOURCES.map((s,i)=>({...s,ok:true,ms:100+i,ver:'4.0.14'})));}
function cshCacheRead(){return null}function cshCacheWrite(){}
function cshVerCacheRead(){return null}function cshVerCacheWrite(){}function cshAgo(){return ''}
function cshIsCode(){return true}
function cshFetchVer(){return Promise.resolve({ver:'4.0.14',base:CSH_UPDATE_SRC});}
function cshFetchManifest(){return Promise.resolve({txt:'window.extension='+JSON.stringify(manifest),base:CSH_UPDATE_SRC});}
async function onlineFetch(){throw {type:'error',status:0};}
`;

const tmp = fs.mkdtempSync(path.join(auditTempRoot(), 'csh-update-lifecycle-'));
const file = tmp + '/lifecycle.html';
const html = '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;background:#17241e}div{position:absolute}button{font-size:24px;height:60px;width:200px}#open{position:fixed;top:4px;left:4px;width:90px;height:44px;font-size:12px}</style><button id="open">检查更新</button><script src="' + pathToFileURL(root + '/core/csh_update.js').href + '"></script><script>' + setup + style + versionArray + compare + dialog + ';document.getElementById("open").onclick=()=>lib.cshDebug.checkUpdate();</script>';
fs.writeFileSync(file, html);

const checks = [];
const record = (name, passed, detail) => checks.push({ name, passed: passed === true, ...(passed === true ? {} : { detail }) });
const watchdog = setTimeout(() => { console.error('[lifecycle] global timeout, CDP did not answer'); process.exit(2); }, 300000);
watchdog.unref();

/* withChromium 的 send 没有超时；页面卡死时会无限等。这里给每次调用兜底。 */
const runCase = async fn => {
	await withChromium({ width: 915, height: 412 }, async send => {
		const sendT = (method, params = {}) => Promise.race([
			send(method, params),
			new Promise((_, reject) => setTimeout(() => reject(Error('CDP timeout: ' + method)), 15000)),
		]);
		const val = async expression => {
			const r = await Promise.race([
				send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: false }),
				new Promise((_, reject) => setTimeout(() => reject(Error('CDP evaluate timeout: ' + String(expression).slice(0, 160))), 15000)),
			]);
			if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
			return r.result.value;
		};
		const wait = ms => new Promise(r => setTimeout(r, ms));
		const click = async selector => {
			const p = await val('(()=>{const n=document.querySelector(' + JSON.stringify(selector) + '),r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
			await sendT('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
			await sendT('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
			await wait(60);
		};
		const clickText = text => val('(()=>{const n=Array.from(document.querySelectorAll("#csh-update .csh-ext-row button")).find(b=>b.textContent.indexOf(' + JSON.stringify(text) + ')>=0);if(n)n.click();return !!n})()');
		const esc = () => val('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
		const open = async () => {
			await click('#open');
			for (let i = 0; i < 80; i++) { if (await val('!!document.querySelector(".csh-ext-btn:not(.ghost)")')) return true; await wait(40); }
			return false;
		};
		const until = async expression => {
			for (let i = 0; i < 100; i++) { if (await val(expression)) return true; await wait(40); }
			return false;
		};
		await sendT('Page.enable'); await sendT('Runtime.enable');
		await sendT('Page.navigate', { url: pathToFileURL(file).href });
		let ready = false;
		for (let i = 0; i < 100; i++) { if (await val('typeof lib!=="undefined"&&typeof lib.cshDebug.checkUpdate==="function"&&!!document.getElementById("open").onclick')) { ready = true; break; } await wait(40); }
		if (!ready) throw Error('page not ready');
		await fn({ val, click, clickText, esc, wait, open, until });
	});
};

try {
	/* ---------- 1. 连点：同一弹窗重复点击只启动一个任务 ---------- */
	await runCase(async ({ val, click, clickText, open, until }) => {
		await val('lc.reset();lc.applyGate=lc.makeGate();lc.applyError="网络失败";0');
		record('1/open dialog shows update action', await open());
		await click('.csh-ext-btn:not(.ghost)');
		await until('lc.applyCalls===1');
		await clickText('立即更新');
		record('1/double click while task alive starts exactly one task', await val('lc.applyCalls===1&&_cshUpdating===true'));
		await val('lib.cshDebug.checkUpdate()');       // 任务进行中重开
		await until('!!document.querySelector(".csh-ext-btn:not(.ghost)")');
		await clickText('立即更新');
		record('1/reopen during active task starts no second task', await val('lc.applyCalls===1'));
		await val('lc.gateResolve()');
		await until('_cshUpdating===false');
		record('1/no unhandled exception', await val('errors.length===0'));
	});

	/* ---------- 2. 下载阶段关闭 → 重开：旧回包不写新弹窗，锁不提前释放 ---------- */
	await runCase(async ({ val, click, clickText, open, until }) => {
		await val('lc.reset();lc.applyGate=lc.makeGate();lc.applyError="下载已取消，原安装未改动";');
		await open();
		await click('.csh-ext-btn:not(.ghost)');
		await until('lc.applyCalls===1');
		record('2/task lock held during download', await val('_cshUpdating===true&&!!CSHUpdate.__cshUpdateState.task'));
		await val('lc.progress({phase:"downloading",done:1,total:4})');
		record('2/download phase keeps cancel available', await val('Array.from(document.querySelectorAll("#csh-update .csh-ext-row button")).find(b=>b.textContent.indexOf("取消下载")>=0)?.disabled===false'));
		await clickText('取消下载');
		record('2/close during download aborts signal and removes dialog', await val('lc.signal.aborted===true&&!document.querySelector("#csh-update")'));
		await val('lib.cshDebug.checkUpdate()');
		await until('!!document.querySelector(".csh-ext-btn:not(.ghost)")');
		await val('lc.progress({phase:"downloading",done:3,total:4})');   // 旧任务迟到回包
		record('2/late old progress never writes new dialog', await val('!document.querySelector(".csh-ext-loading").textContent.includes("3 / 4")'));
		record('2/new dialog action blocked while old task alive', await val('document.querySelector(".csh-ext-btn:not(.ghost)").disabled===true&&_cshUpdating===true'));
		await clickText('立即更新');
		await clickText('更新备份');
		record('2/reopen cannot start a second task or cleanup', await val('lc.applyCalls===1&&lc.backupOpens===0'));
		await val('lc.gateResolve()');
		await until('_cshUpdating===false&&!CSHUpdate.__cshUpdateState.task');
		record('2/old finally releases lock only when it settles', await val('_cshUpdating===false&&!CSHUpdate.__cshUpdateState.task'));
		record('2/waiting dialog refreshed after settle', await until('!document.querySelector(".csh-ext-loading").textContent.includes("任务正在进行")'));
	});

	/* ---------- 3. 提交阶段：拒绝关闭/重开、不误报已取消 ---------- */
	await runCase(async ({ val, click, esc, open, until }) => {
		await val('lc.reset();lc.applyGate=lc.makeGate();');
		await open();
		await click('.csh-ext-btn:not(.ghost)');
		await until('lc.applyCalls===1');
		await val('lc.progress({phase:"committing",done:1,total:2})');
		record('3/commit phase disables every action', await val('Array.from(document.querySelectorAll("#csh-update .csh-ext-row button")).every(b=>b.disabled)&&lc.signal.aborted===false'));
		record('3/commit phase shows waiting label not cancel', await val('document.querySelector(".csh-ext-loading").textContent.includes("提交并核验")&&!document.querySelector(".csh-ext-loading").textContent.includes("已取消")'));
		await esc();
		record('3/escape cannot close during commit', await val('!!document.querySelector("#csh-update")&&lc.signal.aborted===false&&lc.toasts.some(t=>t.indexOf("正在提交或恢复")>=0)'));
		record('3/reopen is refused instead of replacing live dialog', await val('(()=>{var b=document.querySelector("#csh-update");return lib.cshDebug.checkUpdate()===true&&document.querySelector("#csh-update")===b})()'));
		await val('lc.gateResolve()');
		await until('lc.saved.length===2');
		record('3/verified commit writes version only after success', await val('lc.saved.length===2&&lc.saved.every(v=>v[0].indexOf("extension_池子魔将_")===0)'));
		record('3/no cancelled wording on completed commit', await val('!document.querySelector(".csh-ext-loading").textContent.includes("已取消")'));
	});

	/* ---------- 4. 手动恢复：建立与安装相同的忙状态与任务引用 ---------- */
	await runCase(async ({ val, clickText, esc, open, until }) => {
		await val('lc.reset();lc.recoverGate=lc.makeGate();');
		await open();
		await clickText('恢复未完成更新');
		await until('lc.recoverCalls===1');
		record('4/recovery creates a real task and busy state', await val('_cshUpdating===true&&CSHUpdate.__cshUpdateState.task.kind==="recover"&&Array.from(document.querySelectorAll("#csh-update .csh-ext-row button")).every(b=>b.disabled)'));
		await clickText('立即更新');
		await clickText('更新备份');
		record('4/update and cleanup blocked during recovery', await val('lc.applyCalls===0&&lc.backupOpens===0'));
		await esc();
		record('4/escape cannot close during recovery', await val('!!document.querySelector("#csh-update")&&lc.toasts.some(t=>t.indexOf("正在提交或恢复")>=0)'));
		record('4/reopen refused during recovery', await val('(()=>{var b=document.querySelector("#csh-update");return lib.cshDebug.checkUpdate()===true&&document.querySelector("#csh-update")===b})()'));
		record('4/recovery never reports cancelled', await val('!document.querySelector(".csh-ext-loading").textContent.includes("已取消")'));
		await val('lc.gateResolve()');
		await until('_cshUpdating===false&&!CSHUpdate.__cshUpdateState.task');
		record('4/recovery releases lock and restores controls', await val('_cshUpdating===false&&Array.from(document.querySelectorAll("#csh-update .csh-ext-row button")).every(b=>!b.disabled)'));
		record('4/recovery result is reported', await val('document.querySelector(".csh-ext-loading").textContent.includes("没有待恢复的更新")'));
	});

	/* ---------- 5. 迟到回包不能解除新任务锁 / 改写新任务阶段 ---------- */
	await runCase(async ({ val, click, clickText, open, until }) => {
		await val('lc.reset();lc.applyGate=lc.makeGate();lc.applyError="网络失败";');
		await open();
		await click('.csh-ext-btn:not(.ghost)');
		await until('lc.applyCalls===1');
		await val('lc.oldProgress=lc.progress;lc.gateResolve()');   // 旧任务结束，保存它的回包
		await until('_cshUpdating===false');
		await val('lib.cshDebug.checkUpdate()');
		await until('!!document.querySelector(".csh-ext-btn:not(.ghost)")');
		await val('lc.applyGate=lc.makeGate();lc.applyError=null');
		await clickText('立即更新');
		await until('lc.applyCalls===2');
		record('5/new task owns the lock', await val('_cshUpdating===true&&!!CSHUpdate.__cshUpdateState.task'));
		await val('lc.oldProgress({phase:"committing",done:2,total:2})');   // 旧任务的迟到回包
		record('5/late old callback does not release new task lock', await val('_cshUpdating===true&&!!CSHUpdate.__cshUpdateState.task'));
		record('5/late old callback does not flip new dialog into protected state', await val('CSHUpdate.__cshUpdateState.task.phase!=="committing"&&!document.querySelector(".csh-ext-loading").textContent.includes("提交并核验")'));
		await val('lc.gateResolve()');
		await until('_cshUpdating===false');
		record('5/no unhandled exception across all cases', await val('errors.length===0'));
	});
} finally {
	removeAuditScratch(tmp);
}
const failed = checks.filter(x => !x.passed);
const result = {
	scope: 'Real checkUpdate controller in native Chromium; controllable transaction gates, isolated manifest/network and in-memory disk. No device install or network update.',
	passed: checks.length - failed.length,
	failed: failed.length,
	checks,
};
fs.writeFileSync(out + '/lifecycle.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, checks: failed }, null, 2));
process.exitCode = failed.length ? 1 : 0;
