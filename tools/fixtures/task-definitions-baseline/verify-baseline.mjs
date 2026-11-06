// 本副本自洽静态基线的「只读复核 / 受控重建」脚本。
//   默认（无参数）：复核。加载本副本 core/csh_achv.js，重算有序键集合 + 结构指纹，
//                  与仓库内 keys.json / manifest.json 比对，打印 MATCH 或 DRIFT，不写任何文件。
//   --write         ：重建。用当前运行时重写 keys.json / manifest.json。
//                    ⚠ 仅应在「定义合法变更、且已人工复核」后使用；切勿用它掩盖非预期变更来骗绿。
// 用法：node tools/fixtures/task-definitions-baseline/verify-baseline.mjs [--write]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {canonical,fingerprint} from './canonical.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..','..','..');
const keysFile=path.join(here,'keys.json');
const manifestFile=path.join(here,'manifest.json');
const write=process.argv.includes('--write');

function engine(source){const ctx=vm.createContext({window:{},localStorage:{getItem:()=>null,setItem:()=>{}},console});vm.runInContext(source,ctx);return ctx.window.CSH_ACHV;}
const A=engine(fs.readFileSync(path.join(root,'core','csh_achv.js'),'utf8'));
const keys=A.defs.map(d=>d.key);
const fp=fingerprint(A.defs);
const defCount=A.defs.length;

const LEGACY_PRE_EXPANSION=493; // 扩容前旧安装（D:/noname）定义数，仅作历史下界，不是当前计数
const manifest={
  schema:1,
  capturedFrom:'core/csh_achv.js @ 本副本（2000 条运行时）',
  capturedDefCount:defCount,
  dynamicCount:A.stats().total,
  minDefs:A.MIN_DEFS,
  legacyPreExpansionDefCount:LEGACY_PRE_EXPANSION,
  metaFingerprint:{algo:'sha256',recipe:'sha256(JSON.stringify(defs.map(d=>[d.key,d.cat,d.ico,d.label,d.desc,d.reward])))',value:fp},
  notes:'本副本自洽静态基线：从当前 2000 条运行时导出的有序键集合（keys.json）+ 全量定义结构指纹。仅用于 self-consistency 模式（默认、strictComparison=false），不冒充改前/改后严格比对；严格比对须显式 --baseline <dir>（内含 before-csh_achv.js）。合法的定义变更需经人工复核后，用本脚本 --write 重建。'
};

if(write){
  fs.writeFileSync(keysFile,JSON.stringify(keys,null,2)+'\n');
  fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
  console.log('WROTE',keysFile,'and',manifestFile,'| defCount='+defCount,'fp='+fp);
  process.exit(0);
}

// 只读复核
let ok=true;const report=[];
if(!fs.existsSync(keysFile)||!fs.existsSync(manifestFile)){
  console.log('DRIFT: 基线文件缺失，请先用 --write 重建');process.exit(2);
}
const storedKeys=JSON.parse(fs.readFileSync(keysFile,'utf8'));
const stored=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
const keysMatch=JSON.stringify(storedKeys)===JSON.stringify(keys);
const fpMatch=stored.metaFingerprint?.value===fp;
const countMatch=stored.capturedDefCount===defCount;
report.push({item:'keys.json 有序键集合',match:keysMatch,storedLength:storedKeys.length,currentLength:keys.length});
report.push({item:'manifest.metaFingerprint.value',match:fpMatch,stored:stored.metaFingerprint?.value,current:fp});
report.push({item:'manifest.capturedDefCount',match:countMatch,stored:stored.capturedDefCount,current:defCount});
if(!keysMatch){ok=false;for(let i=0;i<Math.max(storedKeys.length,keys.length);i++)if(storedKeys[i]!==keys[i]){report.push({item:'首个键差异',index:i,stored:storedKeys[i],current:keys[i]});break;}}
if(!fpMatch||!countMatch)ok=false;
console.log(JSON.stringify({result:ok?'MATCH':'DRIFT',defCount,minDefs:A.MIN_DEFS,fingerprint:fp,report},null,2));
process.exitCode=ok?0:2;
