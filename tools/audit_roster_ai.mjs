// Historical audit index. AI optimizations were withdrawn at the author request on 2026-10-27.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse,skillsOf,property,keyOf,walk} from './lib/skill_audit.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'docs/audit/inventory.json'), 'utf8'));
if(inventory.characters.length!==100)throw Error('Current audit roster must contain 100 heroes');
// Verify current references; adding a role never marks its AI reviewed automatically.
const skillPack=skillsOf(parse(fs.readFileSync(path.join(root,'skills/index.js'),'utf8'))),currentSkills=new Map();
function indexSkills(pack,prefix=''){for(const p of pack.properties||[]){const id=prefix+keyOf(p);currentSkills.set(id,p.value);const subs=property(p.value,'subSkill');if(subs)indexSkills(subs,id+'_');}}
indexSkills(skillPack);
for(const skill of inventory.skills){if(skill.file==='skills/index.js'&&currentSkills.has(skill.id))skill.line=currentSkills.get(skill.id).loc.start.line;}
let characterPack;walk(parse(fs.readFileSync(path.join(root,'character/index.js'),'utf8')),n=>{if(n.type==='ExportDefaultDeclaration')characterPack=property(n.declaration,'character');});
for(const c of inventory.characters){const n=property(characterPack,c.id),refs=property(n,'skills');if(!refs||JSON.stringify(refs.elements.map(e=>e.value))!==JSON.stringify(c.skills))throw Error('Roster drift requires review: '+c.id);}
const currentRosterCount=characterPack.properties.length;
if(currentRosterCount!==100||characterPack.properties.some(p=>!inventory.characters.some(c=>c.id===keyOf(p))))throw Error("Current role inventory requires refresh");
// Add a decision only after recording its evidence in AI审查记录.md.
const historicalDecisions = {
  csh_longhun:'移除按花色虚构全用牌收益；实际次数/距离/目标与成本转化、响应素材和声明已审',
  csh_yajiao:'只为实际非回合内使用自己的素材计来源摸牌偏好；展示后给牌/异类弃牌和收尾链已审',

  csh_juwei:'安全重复限已核对的无中/桃，修复铁索重复反转；选择/追加效果/直击/失效链已审',
  csh_chonglei:'实际变化体力才加甲；致命不预支护甲，保留原基础AI与强制机制',
  csh_qianju:'强制按已损体力减距离，实际mod与无额外决策入口已核对',
  csh_kuanggu:'根据真实可选控件、有效回复、低血量/溢出选摸或回；距1快照及多点选择链已审',
  csh_langxi1x:'概率期望与五伤尾部风险分开，拒赌低血队友；实际选择与元数据共用本技能评分',
  csh_xiongluan:'移除暗闪查询，先回血代价/合法两牌/强制友方备选/真实奖励选项已审',
  csh_junchi:'本技能ai2计用牌前失体力、摸牌/甲与低血风险；不把护甲当失体力保护',
  csh_zhansong:'不预支限技收益鼓励吃伤，保留有效自救；弃装备后距离/成本与三刺杀链已审',

  csh_liegong:'释放移除暗闪查询，核对当前伤害属性/免伤与护甲；蓄弦/50与100解锁/全档释放已审',
  csh_wanshi:'双虚拟装备的继承与空栏/移除已审；免疫保留来源收益，火伤AI补无视防具守卫',
  csh_lieqiong:'不再固定封红桃，按合法部位/公开手牌/已知花色/当前负面状态择优；五部位与清理链已审',

  csh_wuzhen:'全体目标效用方向修正；起点与逼杀/失体力/火杀选择链已审，保留公开人数启发式',
  csh_qiai:'仅为合法有效自救牌优先交付；依次交牌与引擎轮次冷却已审',
  csh_sbweimu:'阴阳取消目标的AI保留来源独立收益；转换触发链已审',
  csh_pojun12:'暗牌按钮隔离、公开基础价值、响应标签与分区/实体材料增伤估值已修',
  csh_yingzipojun:'额外摸牌与击杀摸三链已审，无需重写免费收益选择',

  csh_jsrgpingtao: '目标收益方向已修', csh_jsrgpingtao_2: '目标收益方向已修',
  csh_qiege: '三花色目标收益已修', csh_gyweiyang: '回复目标收益已修',
  csh_spweiwu: '顺手收益方向已修', csh_duwu: '弃牌伤害评分已修',
  csh_jiaomeng: '暗牌隔离与交换估值已修', csh_karl_junxing: '失体力/翻面分支已修',
  csh_karl_hannan: '拼点成本与风险已修', csh_sheque: '发动前暗牌隔离已修',
  csh_karl_sigu: '评分方向复核保留', csh_liren: '评分视角复核保留',
  csh_gyyinhu: '评分视角复核保留', csh_gychenlong: '评分视角复核保留',
  csh_gyzishu: '评分视角复核保留', csh_difa12: '交牌收益方向复核保留',
  csh_xielei: '实际选择入口已定位，成本与联动待审',
  csh_zhanlai: '暗牌隔离与固定目标奖励绕过成本已修',
  csh_luoyi: '直接命中估值的对手暗牌计数已修；完整联动待审',
  csh_yiwu: '公开五牌按合法组合估值，继承链已核对',
  csh_douyan: '收益方向/暗牌隔离/成本和先后反击已修，响应选牌已核对',
  csh_bizui: '移除致命伤害中的未来回复折扣',
  csh_ranshang: '主体及五个强制子技能已审，保留公开火焰风险估计',
  csh_duolve: '移除与补牌方向相反的统一出牌惩罚',
  csh_ssx_xiaoji: '强制全场装备损失/随机废栏链已审，公开启发式保留',
  csh_ssx_pianzhu: '阴面错误杀门槛及成本、装备归属/枭姬联动已修',
  csh_ssx_jiaozong: '觉醒归还装备栏、替换/获得链已审',
  csh_ssx_xiaoji2: '觉醒后强制摸牌及手牌标签mod已审',
  csh_ssx_saran: '暗牌隔离、拼点配合/成本/无距离后续杀已修',
  csh_hyy_jizhi: '低手牌先补即时资源；顶/底牌与临时手牌上限链已审',
  csh_hyy_linglong: '实际授予链已核对；响应冷却与主动/响应选牌已修；观星机制差异另记',
  csh_hyy_qicai: '空白暗手牌与接收方间接读取已修；多目标评分仍为保护队友的启发式',
  csh_hyy_yashi: '封技/观虚选择与一次移除链已审',
  csh_hyy_guanxu: '发动前仅公开张数/已知花色；揭示后交换/同花弃牌链已审',
  csh_hyy_zuilun: '失体力代价/目标及公开三牌取舍已修',
  csh_manyi: '南蛮免疫/烈火真实随机颜色与成本已审，无条件收益已修',
  csh_xiangzhen: '暗牌/杀响应/双牌成本和组合选择已修',
  csh_xizhan: '使命及宿主再起/烈刃获得与回退链已审，保留宿主启发式限制',
  csh_jinfan: '实际次数/剩余颜色及选中存铃颜色评分已修；gain/clear链已审',
  csh_bashen: '八项实际获得链与轮次禁选已审，技能选择复用据守成本',
  csh_bashen_kuanggu: '移除免伤时仍加分的来源奖励；护甲/摸牌选择已审',
  csh_bashen_jushou: '翻面代价、翻回正面及队友/自身资源转移评分已修',
  csh_bashen_buqu: '移除虚构主动救援他人的save声明；强制自救规则保留',
  csh_bashen_yicong: '强制公开距离修正已审',
  csh_bashen_xinzhan: '先选颜色再明示顶五牌；AI只取己方需求，保留启发式',
  csh_bashen_yizhong: '免疫只归零目标效用，保留来源独立收益',
  csh_bashen_lianying: '失去最后手牌与免费摸牌选择已审',
  csh_bashen_leiji: '真实雷电效用门槛与出闪收益守卫已修',
  csh_xiantu: '四境突破/催炁选择已审，去掉高血裸死赌博并保留真实伤害属性',
  csh_huangyuan: '同一评分计入合法基本+锦囊总成本，实际丹卡方向另审',
  csh_yetian: '强制增伤/弃置恢复链已审，默认取牌的间接暗牌估值已隔离',
  csh_tongbu: '实际形态授予/退出与十二组已审，阈值/所有者/加伤视角已修',
  csh_lichang: '补非属性伤害免疫AI，保留属性伤害、失体力与来源独立收益',
  csh_langqiang: '暗牌与友方封牌收益已修，使用窗口计入实际次数/距离',
  csh_langqiang_draw: '按真实已选花色与形态退出状态估实际摸牌',
  csh_kurou: '失体力不借护甲抵消，计真实诈降和未消耗/可回复的自救资源',
  csh_zhaxiang: '损失体力补偿方向/致命不预支/恢复成本守卫已修，recover链已审',
};
const historicalReviewed = new Set(['csh_dz','csh_wn','csh_sunshangxiang','csh_huangyueying','csh_huaman','csh_xingganning','csh_yuangubafei','csh_liximing','csh_mingrixiang','csh_jzh','csh_qw','csh_jjxs','csh_mmhz','csh_haozhao','csh_wlk','csh_sx','csh_gdsn']);
// Evidence-based closures for reviewed roles; computed/dynamic grants still require tracing.
const extraChains = {
  csh_gdsn:[],
  csh_haozhao:[],
  csh_wlk:['csh_kuanggu_check'],
  csh_sx:['csh_xiongluan_direct','csh_xiongluan_draw','csh_zhansong_unlimited'],
  csh_mmhz:['csh_liegong_gain','csh_liegong_xian','csh_liegong_extrashot','csh_liegong_fengyin','csh_wanshi','csh_wanshi_qilin','csh_wanshi_tengjia1','csh_wanshi_tengjia2','csh_wanshi_tengjia3','csh_lieqiong','csh_lieqiong_abdomen','qilin_skill','tengjia1','tengjia2','tengjia3','baiban'],
  csh_qw:['csh_qiai_roundcount'],
  csh_jjxs:['csh_repojun2','csh_repojun3','csh_yingzipojun_dabaoliewei'],
  csh_dz:['chengxiang'],
  csh_wn:['csh_ranshang_start','csh_ranshang_zhuanhp','csh_ranshang_zhuanjia','csh_ranshang_jiesuan','csh_ranshang_jianran'],
  csh_sunshangxiang:['csh_ssx_xiaoji2','csh_ssx_saran','csh_ssx_saran_reset'],
  csh_huangyueying:['csh_hyy_jizhi_hand','psguanxing','csh_hyy_yashi','csh_hyy_guanxu','csh_hyy_zuilun'],
  csh_huaman:['csh_manyi_nanman','csh_manyi_liehuo','csh_xiangzhen_reset','csh_xiangzhen_dmg','sbzaiqi','relieren','zaiqi','sblieren','lieren'],
  csh_xingganning:['csh_jinfan_gain','csh_jinfan_clear'],
  csh_yuangubafei:['csh_bashen_kuanggu','csh_bashen_jushou','csh_bashen_buqu','csh_bashen_yicong','csh_bashen_xinzhan','csh_bashen_yizhong','csh_bashen_lianying','csh_bashen_leiji'],
  csh_liximing:['csh_xiantu_draw','csh_xiantu_break','csh_xiantu_damage','csh_xiantu_mod','csh_huangyuan','csh_yetian','csh_dan'],
  csh_mingrixiang:inventory.skills.filter(s=>s.file==='skills/index.js'&&s.id!=='csh_tongbu'&&/^csh_(tongbu(?:_|$)|lichang(?:_|$)|langqiang(?:_|$)|xinmo(?:_|$))/.test(s.id)).map(s=>s.id).concat('cshAsukaSync'),
  csh_jzh:['csh_zhaxiang_recover'],
};
const skills = inventory.skills.filter(s => s.file === 'skills/index.js');
const byId = new Map(skills.map(s => [s.id, s]));
const esc = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const link = id => {
  const related = {csh_dan:['card/index.js','"csh_dan": {','丹（卡牌）'],cshAsukaSync:['main/content.js','lib.cshAsukaSync = function','同步形态授予/清理']};
  if(related[id]){const [file,marker,name]=related[id],text=fs.readFileSync(path.join(root,file),'utf8'),index=text.indexOf(marker);if(index<0)throw Error('Missing reviewed chain source: '+id);return `[${name} (${id})](../../${file}#L${text.slice(0,index).split('\n').length})`;}
  const s = byId.get(id);
  return s ? `[${esc(s.name)} (${id})](../../${s.file}#L${s.line})` : `\`${esc(id)}\`（宿主/其他来源）`;
};
let touched = 0;
const rows = inventory.characters.map((character, index) => {
  const extra = extraChains[character.id] || [];
  const reviewed = skills.filter(s => historicalDecisions[s.id] && (s.characters.includes(character.id) || extra.includes(s.id)));
  if (reviewed.length) touched++;
  return `| ${index + 1} | ${esc(character.name)} (${character.id}) | ${character.skills.map(link).join('、')} | ${extra.length ? extra.map(link).join('、') : historicalReviewed.has(character.id) ? '无额外授予/继承技能；对象内辅助链已核对' : '仍需追踪'} | `
    + (reviewed.length ? reviewed.map(s => `${link(s.id)}：${historicalDecisions[s.id]}`).join('<br>') : '尚未形成语义结论')
    + (historicalReviewed.has(character.id) ? ' | 历史已审；补丁已撤回，暂停 |' : ' | 暂停；未继续审查 |');
});
const text = "# 100 武将技能 AI 审查进度（历史索引，已暂停）\n\n> **2026-10-27：按作者最新指令，Codex 的武将 AI 优化已回退，停止继续审查。** 下表仅保留既往审查证据和当前源码定位，所有“已修”描述属于已撤回补丁，不能当作当前实现承诺。详见 [回退与 UI 修复](UI_RECOVERY_20261027.md)。\n\n由 `node tools/audit_roster_ai.mjs` 生成；当前保留100名普通武将（含郝昭）。不因保留角色而保留本轮AI优化。\n\n"
  + `历史记录涉及 ${touched} 位，其中 ${historicalReviewed.size} 位曾记录源码选择链审查，均未完成逐武将完整实战验证。当前优化任务已暂停，不记为有效完成进度。\n\n`
  + "表中动态技能链与结论供溯源；规则、立绘和存档沿用当前有效实现。\n\n"
  + '| # | 普通武将 | 初始技能引用 | 已核对的继承/获得/子技能链 | 历史结论/问题（补丁已撤回） | 当前状态 |\n'
  + '| --- | --- | --- | --- | --- | --- |\n' + rows.join('\n') + '\n';
const target = path.join(root, 'docs/audit/100武将AI审查进度.md');
fs.writeFileSync(target, text);
console.log(JSON.stringify({characters: inventory.characters.length, partialOrLocated: touched, output: path.relative(root,target)}));
