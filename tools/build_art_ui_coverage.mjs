// Audit artifacts only: semantic grouping and verified local screenshot references.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const evidenceArg=process.argv.indexOf('--evidence');
const evidence=path.resolve(evidenceArg<0?'D:/noname-audit-backups/chizi-mojiang/20261022-art-rebuild/s4-final':process.argv[evidenceArg+1]);
const audit=path.join(root,'docs/audit');
const baseline=JSON.parse(fs.readFileSync(path.join(evidence,'art-baseline.json'),'utf8'));
const assets=JSON.parse(fs.readFileSync(path.join(audit,'ART_GENERATED_ASSETS.json'),'utf8'));
const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
function csv(file,rows){const keys=Object.keys(rows[0]);fs.writeFileSync(file,'\ufeff'+keys.join(',')+'\n'+rows.map(r=>keys.map(k=>quote(r[k])).join(',')).join('\n')+'\n');}
function parseCSV(text){const out=[];let row=[],field='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);field='';if(row.some(Boolean))out.push(row);row=[];}else field+=c;}if(field||row.length){row.push(field);out.push(row);}const headers=out.shift();return out.map(r=>Object.fromEntries(headers.map((k,i)=>[k.replace(/^\ufeff/,''),r[i]||''])));}
function shot(name){const file=path.join(evidence,'portrait-'+name+'.png');if(!fs.existsSync(file))throw Error('Missing screenshot '+file);return file.replaceAll('\\','/');}
const integration={
 'debug-workshop':['debug','主标题/48px悬浮入口/调试配置标签','debug-res','44px标题；40px悬浮图/48px点击区'],
 'war-record':['winrate','主标题/统计空态/配置标签','winrate-list','44px标题和空态；24px配置标签'],
 'interaction-strategy':['interact','主标题/配置标签','interact-main','44px标题；24px配置标签'],
 'button-primary':['shared','主要执行/导出/有效导入/输入确定','s4-import-valid','1024x205；slice22 150 28 150；显示8px/30px端盖'],
 'button-secondary':['shared','次操作/普通按钮/选中页签/卡牌选择','s4-skill-code','1024x205；普通端盖8px/30px；页签7px/16px'],
 'button-danger':['shared','原有危险动作/清空删除/危险确认','s4-danger-confirm','1024x208；slice22 150 28 150；显示8px/30px端盖'],
 'copy-scroll':['shared','复制状态/报告/代码/ID/导出文本','s4-skill-code','20px操作装饰图'],
 'transfer-chest':['shared','导入/导出/粘贴/下载/扩展入口','winrate-import-invalid','20px操作装饰图；24px配置标签'],
 'search-lens':['shared','检索输入/技能和武将详情/查看代码','s4-skill-search','22px输入背景；20px操作图'],
 'inspect-compass':['shared','刷新/自检/断言/快照/追踪/更新入口','debug-track','20px操作图；24px配置标签'],
 'clear-brazier':['shared','删除/清空/移出/卸Hook等实际清理','s4-preset-list','20px操作装饰图；微型×另保留DOM'],
 'target-banner':['shared','目标select/场上角色/玩家世界配置入口','debug-res','22px目标背景；24px配置标签'],
};
const integrationRows=assets.filter(a=>integration[a.asset_id]).map(a=>{const [module,purpose,scene,display]=integration[a.asset_id],file=path.join(root,a.file);const bytes=fs.readFileSync(file);if(crypto.createHash('sha256').update(bytes).digest('hex')!==a.sha256)throw Error('Asset hash mismatch '+a.asset_id);return {asset_id:a.asset_id,module,purpose,file:a.file,dimensions:a.size.join('x'),bytes:a.bytes,alpha:a.alpha_extrema.join('-'),sha256:a.sha256,status:'S4已接；非无名杀实机验收',display,states:a.asset_id.startsWith('button-')?'normal;hover;pressed;selected;disabled;focus-visible;reduced-motion':'decorative;missing-image-fallback',version:'S4-20261022',reference:'core/csh_art.js；main/bootstrap.js；三模块与main/config.js真实接线',screenshot:shot(scene),source:a.source,source_sha256:a.source_sha256,semantics:'DOM原文/数据/原事件保持；图片纯装饰',fallback:'模块/物件图失败移除；底板加载失败保留原按钮'}});
csv(path.join(audit,'ART_UI_INTEGRATION.csv'),integrationRows);
const rows=parseCSV(fs.readFileSync(path.join(audit,'ART_ASSET_MANIFEST.csv'),'utf8'));
function controlAssets(r){const ids=new Set();for(const scene of baseline.cases){for(const node of scene.controls){if(node.label!==r.purpose||!node.w||!node.h)continue;if(node.artVariant)ids.add('button-'+node.artVariant);if(node.artAction)ids.add(({copy:'copy-scroll',transfer:'transfer-chest',search:'search-lens',inspect:'inspect-compass',clear:'clear-brazier',target:'target-banner'})[node.artAction]);}}if(!ids.size){if(r.kind==='input'&&/目标/.test(r.purpose))ids.add('target-banner');else if(r.kind==='input'&&/搜索|检索/.test(r.purpose))ids.add('search-lens');else ['button-primary','button-secondary','button-danger'].forEach(id=>ids.add(id));}return [...ids].filter(id=>assets.some(a=>a.asset_id===id)).join(';');}
function classify(r){const line=+r.source_line,label=r.purpose;
 if(r.module==='config'){
  const ids={winrateStats:'war-record',csh_lobby:'target-banner',csh_interact_panel:'interaction-strategy',csh_debug_menu:'debug-workshop',csh_check_update:'inspect-compass',csh_extstore:'transfer-chest'};
  if(ids[label])return ['已接配置装饰；保留宿主控件','config-entry',ids[label],shot('s4-config-entry-fixture'),'真实配置name/onclick已隔离验证；宿主行布局未在无名杀实机验证'];
  return ['保留；非本次三模块操作','host-config','',shot('s4-config-entry-fixture'),'警示分隔保持非操作；其他功能开关不扩改'];
 }
 if(label.startsWith('模块图标'))return ['已接透明主图标','module-icon',({debug:'debug-workshop',winrate:'war-record',interact:'interaction-strategy'})[r.module],shot(r.module==='debug'?'debug-res':r.module==='winrate'?'winrate-list':'interact-main'),'图标无文字；原标题和数据保持DOM'];
 if(r.module==='winrate'&&label.includes('空数据点阵'))return ['空态已接透明图；数据辅助符号保留','statistics-empty','war-record',shot('winrate-empty'),'空点阵换正式图；排名数字/星号/胜率条/排序三角仍为清晰DOM和轻量数据辅助'];
 if(r.kind==='display')return ['保留DOM真实文字/数据/反馈','dom-text','',shot(r.module==='debug'?'debug-res':r.module==='winrate'?'winrate-list':'interact-main'),'非操作文本不单独生图；不烘焙数字和武将名'];
 if(r.module==='debug'&&line>=3312&&line<3665)return ['保留既有世界特色卡组件','world-card','',shot('debug-games'),'11个实际路由/锁定筹备项保留；玩家世界门控跳过通用底板，避免覆盖现有世界重建'];
 if(r.module==='debug'&&line>=7899)return ['已接悬浮入口装饰','floating-entry','debug-workshop',shot('s4-floating-entry'),'原拖拽/短按/F1链保持；新增Enter路径与48px区已隔离验证'];
 if(/^(✕|×)$/.test(label)||label.includes('删除单武将战绩×'))return ['保留轻量微型符号并补44px/焦点','micro-control','',shot(r.module==='interact'?'interact-custom-filled':'winrate-list'),'DOM符号/原删除确认保持；属于允许保留的微型辅助控制'];
 let group='scoped-controls',scene=r.module==='debug'?'debug-res':r.module==='winrate'?'winrate-list':'interact-main';
 let limit='通用组件接全部已知button/页签/动态子层；非每个业务回调均已实机执行';
 if(r.module==='debug'&&line>=4757&&line<5295){group='skill-presets';scene='s4-preset-list';limit='方案真实嵌在技能页renderPresets；新建/加入/删除取消已隔离验；装载/覆盖/导出等未操作真实数据';}
 else if(r.module==='debug'&&line>=3665&&line<3766){group='optional-exchange';scene='debug-games';limit='可选斗转星移宿主API不在夹具中；按钮由同一通用组件覆盖，集成条件待实机';}
 else if(r.module==='debug'&&line>=3766&&line<4033){group='redeem';scene='s4-redeem';limit='兑换UI/原关闭链已截图；未兑换真实码或写真实钱包';}
 else if(r.module==='debug'&&line>=6821&&line<7899){group='install-update';scene=line>=7467?'s4-update-failed':'s4-extension-store';limit='清单回退/网络挂起加载/失败UI为隔离fixture；未执行真实安装/更新/重启';}
 else if(r.module==='debug'&&line>=3020&&line<3300){group='card-picker';scene='s4-card-picker';limit='卡片与详情/关闭已隔离验证；未向真实对局生成牌';}
 else if(r.module==='debug'&&line>=4033&&line<4757){group='skill-character-details';scene='s4-skill-detail';limit='详情/代码/复制操作装饰已截图；未修改真实武将技能';}
 else if(r.module==='winrate'&&line>=970&&line<1151){group='statistics-io';scene='s4-import-valid';limit='真实导出JSON→有效导入/完成、清空启用→取消均为内存fixture；不写真实战绩';}
 else if(r.module==='interact'&&line>=1843&&line<1989){group='custom-lines';scene='interact-custom-filled';limit='五分类/添加/删除/完成继续原台词池语义；非聊天发送';}
 else if(r.kind==='tab'){group='selected-tabs';scene=r.module==='debug'?'debug-res':r.module==='winrate'?'winrate-list':'interact-main';}
 return ['已接语义分级与装饰；待实机',group,controlAssets(r),shot(scene),limit];
}
for(const r of rows){if(!('proposal_s0_file'in r))r.proposal_s0_file=r.file;const [status,group,ids,evi,limit]=classify(r);r.s4_state=status;r.semantic_group=group;r.integration_assets=ids;r.s4_evidence=evi;r.s4_limit=limit;r.status=status;r.file=ids?ids.split(';').map(id=>assets.find(a=>a.asset_id===id)?.file).filter(Boolean).join(';'):'';}
csv(path.join(audit,'ART_ASSET_MANIFEST.csv'),rows);
const groups=new Map();for(const r of rows){const k=r.module+'|'+r.semantic_group+'|'+r.s4_state;if(!groups.has(k))groups.set(k,{module:r.module,semantic_group:r.semantic_group,status:r.s4_state,source_occurrences:0,evidence:r.s4_evidence,limit:r.s4_limit});groups.get(k).source_occurrences++;}csv(path.join(audit,'ART_UI_COVERAGE.csv'),[...groups.values()]);
const small=baseline.cases.filter(c=>!c.name.includes('missing')).flatMap(c=>c.controls.filter(n=>n.w>0&&n.h>0&&n.cls.includes('csh-art')&&(n.w<43.9||n.h<43.9)).map(n=>({scene:c.name,view:c.case.name,label:n.label,w:n.w,h:n.h})));
const unstyled=baseline.cases.filter(c=>!c.name.includes('missing')&&!c.name.includes('config-entry')).flatMap(c=>c.controls.filter(n=>n.tag==='BUTTON'&&n.w>0&&n.h>0&&!n.cls.includes('csh-art')&&!n.cls.includes('csh-dbg-gamebtn')).map(n=>({scene:c.name,label:n.label,cls:n.cls})));
const summary={scope:baseline.scope,screenshots:baseline.cases.length,all_screenshots_exist:baseline.cases.every(c=>fs.existsSync(path.join(evidence,c.screenshot))),passed:baseline.checks.filter(c=>c.passed).length,failed:baseline.checks.filter(c=>!c.passed),source_occurrences:rows.length,semantic_coverage_groups:groups.size,integrated_assets:integrationRows.length,asset_bytes:integrationRows.reduce((s,r)=>s+r.bytes,0),small_visible_decorated_controls:small,unexpected_unstyled_buttons:unstyled};
fs.writeFileSync(path.join(evidence,'art-coverage-summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
