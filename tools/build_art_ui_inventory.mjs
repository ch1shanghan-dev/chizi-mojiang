// Read runtime source + fixture measurements; emit UI audit CSV only.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifestPath=path.join(root,'docs/audit/ART_ASSET_MANIFEST.csv');
if(fs.existsSync(manifestPath)&&fs.readFileSync(manifestPath,'utf8').split(/\r?\n/)[0].includes('s4_state')){
 console.log('S0 source coordinates are retained in the upgraded matrix. Run tools/build_art_ui_coverage.mjs to refresh S4 coverage without discarding it.');
 process.exit(0);
}
const baseline='D:/noname-audit-backups/chizi-mojiang/20261022-art-rebuild';
const measurements=JSON.parse(fs.readFileSync(path.join(baseline,'art-baseline.json'),'utf8')).cases;
const rows=[];
const sourceIndex=[];
function add(module,file,line,label,kind,semantics,states='normal;hover;pressed;focus-visible',override={}){
 const key=module+'-'+String(line).padStart(4,'0')+'-'+rows.filter(r=>r.module===module&&r.source_line===line).length;
 const matching=measurements.flatMap(c=>c.controls.filter(n=>n.label===label&&n.w>0&&n.h>0).map(n=>({case:c.case.name,w:+n.w.toFixed(2),h:+n.h.toFixed(2),shot:c.screenshot})));
 const display=kind==='display';
 if(kind==='tab'||kind==='switch')states+=';selected;disabled';
 rows.push({asset_id:'ui-'+key,module,purpose:label,kind,source_file:file,source_line:line,current_visual:display?'DOM文字/符号/CSS装饰':'DOM按钮/标签/表单 + CSS外观',file:display?'':'image/ui/art-v1/icons/'+key+'.png（建议路径，未接入）',dimensions:matching.length?matching.map(n=>n.case+':'+n.w+'x'+n.h).join(';'):'静态定位，动态实例尺寸待截图',states:display?'empty;status;data-dependent':states,version:'S0-20261022',status:display?'保留DOM；装饰是否生图逐项评审':'待生成；未接入',text_layer:'DOM（不烘焙）',handpainted_icon:display?'非操作文本不单独生图':'是（同语义可共享）',button_base:display?'否':'主/高频/危险操作共享相应底板；小辅助按功能评审',nine_slice:display?'否':'底板可用；图标不可拉伸',touch_baseline:matching.length?matching.some(n=>n.w<44||n.h<44)?'存在小于44x44 CSS px；待有效触控验证':'本次匹配实例均>=44x44 CSS px':'未实测该实例',semantics,scope:module==='debug'?'#csh-dbg-*及独立子浮层':module==='winrate'?'#csh-wr-panel / #csh-wr-io':module==='interact'?'#csh-ia-panel / #csh-ia-cust-ov':'csh-cfg-* 宿主配置行',fallback:'保留DOM文字/原轻量样式；不因图片失败隐藏入口',compatibility_risk:'保留原事件、数据键、联机守卫、关闭链；图片pointer-events:none；失败显示DOM文字',reference:matching.length?[...new Set(matching.map(n=>n.shot))].join(';'):'见ART_AUDIT对应源码范围；此实例未截图',...override});
}
for(const [module,file] of [['debug','core/csh_debug.js'],['winrate','core/csh_winrate.js'],['interact','core/csh_interact.js']]){
 const source=fs.readFileSync(path.join(root,file),'utf8'),lines=source.split(/\r?\n/);
 lines.forEach((line,i)=>{
  if(/addEventListener\(|\.onclick\s*=|\bmkBtn\(|data-act=|gameButton\(/.test(line))sourceIndex.push({module,file,line:i+1,source:line.trim()});
  let m;
  const button=/\bmkBtn\(\s*"((?:\\.|[^"\\])*)"/g;
  while((m=button.exec(line)))add(module,file,i+1,m[1],'button','执行该行回调；调试操作可能修改当前对局，不在截图中执行');
  const text=/\b(\w+)\.textContent\s*=\s*"((?:\\.|[^"\\])*)"/g;
  while((m=text.exec(line))){
   if(!m[2])continue;
   const variable=m[1],near=lines.slice(Math.max(0,i-14),Math.min(lines.length,i+20)).join('\n');
   const interactive=new RegExp('\\b'+variable+'\\.addEventListener\\("(?:click|dblclick|contextmenu)"').test(near)||/^(back|copyB|closeB|closeBtn|pasteB|go|ok|cancel|ab|rb|rm|ed|load|ov|rn|del|testBtn|addBtn|openCustom)$/.test(variable);
   add(module,file,i+1,m[2],interactive?'button':'display',interactive?'保留 '+variable+' 对应事件回调及目标作用域':'真实文字/状态/标题；不能改成虚假可点入口');
  }
  const action=/data-act=\\?"([a-z-]+)\\?"[^>]*>([^<]*)</g;
  while((m=action.exec(line))){const label=m[2].replace(/'\+.*?\+'/g,'').trim();if(label)add(module,file,i+1,label,'action','事件委托 data-act='+m[1]+'；保持原处理分支',/prev|next|import|confirm/.test(m[1])?'normal;hover;pressed;focus-visible;disabled':'normal;hover;pressed;focus-visible;selected');}
 });
}
const families=[
 ['debug','core/csh_debug.js',1720,'模块图标：机关盘（现CSS方块母题）','display','正式美术候选；不得改变标题或点击目标'],
 ['winrate','core/csh_winrate.js',812,'模块图标：交错战旗（现只有标题DOM）','display','正式美术候选，不新增动作'],
 ['interact','core/csh_interact.js',1748,'模块图标：羽扇竹简（现只有标题DOM）','display','正式美术候选，不新增动作'],
 ['config','main/config.js',71,'谨慎操作分隔符⚠','display','nopointer纯警示分隔；不可制作成可点入口'],
 ['debug','core/csh_debug.js',1492,'资源目标选择（全部在场角色）','select','只切换调试目标；显示自己标记'],
 ['debug','core/csh_debug.js',3020,'卡牌分类：全部/基本/锦囊/装备/其他','tab','动态 CARD_CATS；选择态；卡牌数随宿主扩展变化'],
 ['debug','core/csh_debug.js',3131,'卡牌选择卡片（库内每张牌）','button','单击按数量生成到目标；右键/长按550ms看详情；不可把详情入口当生成按钮'],
 ['debug','core/csh_debug.js',3357,'世界游戏卡片（11个registry现役入口）','button','生涯大厅/讨伐录/天下榜/行囊/池子成就/德州扑克/斗地主/廿一点/UNO/金鳞市/妖灵图鉴；路由保持'],
 ['debug','core/csh_debug.js',3631,'世界筹备中条目（planned派生）','button','当前planned动态列表；locked不可打开；不新增虚假功能'],
 ['debug','core/csh_debug.js',3665,'兑换道具礼包/神秘宝箱/金票（可选斗转星移集成）','button','仅宿主该扩展API存在时显示；CBY兑换守卫及余额不变'],
 ['debug','core/csh_debug.js',4382,'技能详情：返回/标题双击复制ID/描述双击复制/衍生技/相关词条/持有武将','button','动态词条来自lib.skill与lib.character，不写入未知技能'],
 ['debug','core/csh_debug.js',4594,'武将详情：全部添加到目标/每技能添加移除/技能行展开','button','当前调试目标，不修改定义或AI；技能库来自宿主'],
 ['debug','core/csh_debug.js',4757,'配置方案：搜索/加入/已加入/移出/返回','button','方案编辑器已实现但顶层preset被重定向skill；按真实可达链复核后接入'],
 ['debug','core/csh_debug.js',4953,'配置方案：新建/编辑/一键装载/覆盖/重命名/删除/导入合并/导出/明细收起','button','本地方案存储；不因扫描到保留函数就复活旧页签'],
 ['debug','core/csh_debug.js',5504,'快捷卡牌（动态names数组）','button','快捷给牌，targetProvider保持；并有检索器入口'],
 ['debug','core/csh_debug.js',5593,'技能目标select与搜索input','input','搜索中文/ID/武将；不隐藏动态匹配数或来源包'],
 ['debug','core/csh_debug.js',5633,'武将检索项：添加/查看；技能检索项：添加/移除/行展开','button','动态列表；明确当前目标；说明与原文字保持可选择'],
 ['debug','core/csh_debug.js',6411,'皮肤菜单和各皮肤chip','tab','lib.cshTheme派生主题；当前选择保持'],
 ['debug','core/csh_debug.js',6458,'BGM滑块/百分比','input','音量偏好；不能被插画遮挡或扩大写入范围'],
 ['debug','core/csh_debug.js',6518,'11页签：资源/卡牌/技能/场景/状态/特效/互动/池子/追踪/诊断/池子世界','tab','调试与玩家世界共享渲染代码，玩家入口保持仅世界作用域'],
 ['debug','core/csh_debug.js',7153,'其他扩展：安装/重装/更新/继续下载/重试/下载进度取消','button','网络与磁盘操作；扫描不执行；保留确认、重启、取消语义','normal;hover;pressed;focus-visible;disabled;loading;failed'],
 ['debug','core/csh_debug.js',7576,'更新源行选择与立即更新','button','网络源探测/缓存/失败/更新中状态；不执行安装或重启','normal;hover;pressed;focus-visible;selected;disabled;loading;failed'],
 ['debug','core/csh_debug.js',7925,'池悬浮球','button','短按切换/拖拽保存位置/长按和边界归位逻辑；F1不加步骤'],
 ['winrate','core/csh_winrate.js',756,'排名徽章/扩展星号/胜率条/排序三角/空数据点阵','display','装饰可生图；所有排名、场次、百分比均DOM实时文字'],
 ['winrate','core/csh_winrate.js',817,'模式4项：身份场/对决/斗地主/国战','tab','MODE_NAMES；原模式口径不变'],
 ['winrate','core/csh_winrate.js',824,'视图3项：武将排行/阵营胜率/玩家操控','tab','view list/camps/me，个人统计跨模式口径不变'],
 ['winrate','core/csh_winrate.js',832,'场次≥1/≥5/≥10与武将名搜索','input','minGames/search过滤；不是时间范围筛选'],
 ['winrate','core/csh_winrate.js',970,'IO多行textarea与实时校验状态','input','JSON导出/导入合并；空/坏/有效/合并成功；不得绘制文本进图'],
 ['winrate','core/csh_winrate.js',1119,'清空全部：输入确认词解锁清空','input','危险确认保留；未输入正确确认词disabled'],
 ['winrate','core/csh_winrate.js',1358,'排序头：武将/场次/胜/负/胜率/均伤/均杀/均受/均摸/均弃','button','再点反向；排名与删除列不排序；移动卡片同数据'],
 ['winrate','core/csh_winrate.js',1382,'删除单武将战绩×与撤销删除','button','带模式/武将语义的确认与undo；不是删除立绘'],
 ['interact','core/csh_interact.js',1780,'总开关/附带台词两个switch','switch','enable/chat原配置键；联机设置仅对单机生效'],
 ['interact','core/csh_interact.js',1796,'互动频率：低/中/高','tab','rate low/normal/high；原概率与冷却不变'],
 ['interact','core/csh_interact.js',1843,'自定义台词5分类：鲜花/敬酒/砸蛋/扔鞋/回嘴','tab','添加到预置台词池，与内置随机混用；非LLM提示词或聊天消息'],
 ['interact','core/csh_interact.js',1964,'自定义台词输入（30字）/Enter添加/空值或重复失败','input','不空且不重复才存储；每条删除立即更新同分类'],
 ['interact','core/csh_interact.js',1991,'次数/每轮上限/全局间隔/角色冷却/关停/联机提示','display','真实stats与限流；不存在模型思考或响应加载态'],
 ['interact','core/csh_interact.js',2005,'试 发','button','随机AI到合法目标的预置表情或贴纸及可选台词；无AI/无目标/联机显示提示'],
];
for(const [m,f,l,label,k,sem,states]of families)add(m,f,l,label,k,sem,states,label.startsWith('模块图标')?{status:'待生成；未接入',handpainted_icon:'是',file:'image/ui/art-v1/icons/module-'+m+'.png（建议路径，未接入）'}:{});
const cfg=fs.readFileSync(path.join(root,'main/config.js'),'utf8').split(/\r?\n/);
cfg.forEach((line,i)=>{const m=line.match(/^\s*"([^"]+)":\{"name":"(.*?)","intro/);if(m){const relevant=/winrateStats|csh_lobby|csh_interact_panel|csh_debug_menu|csh_check_update|csh_extstore/.test(m[1]);add('config','main/config.js',i+1,m[1],'config','原始配置label='+m[2]+'；仅本次三个模块相关入口需美术接入，其余设置不扩范围',undefined,{handpainted_icon:relevant?'是':'范围外：保留宿主配置控件',...(!relevant?{status:'范围外：不安排生成',file:'',button_base:'保留宿主控件'}:{})});}});
const headers=Object.keys(rows[0]);const q=v=>'"'+String(v??'').replaceAll('"','""')+'"';
fs.writeFileSync(path.join(root,'docs/audit/ART_ASSET_MANIFEST.csv'),'\ufeff'+headers.join(',')+'\n'+rows.map(r=>headers.map(k=>q(r[k])).join(',')).join('\n')+'\n');
fs.writeFileSync(path.join(baseline,'source-ui-index.json'),JSON.stringify({scope:'Read-only source callsite index. Includes lifecycle/event delegation registrations, not all entries are visible controls.',entries:sourceIndex},null,2)+'\n');
console.log(JSON.stringify({rows:rows.length,modules:Object.fromEntries([...new Set(rows.map(r=>r.module))].map(m=>[m,rows.filter(r=>r.module===m).length])),note:'Source control/display occurrences and explicit dynamic families, not unique generated files.'},null,2));
