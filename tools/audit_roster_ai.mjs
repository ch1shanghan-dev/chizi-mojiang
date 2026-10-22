// Generate 99-character progress rows; semantic decisions are maintained manually.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'docs/audit/inventory.json'), 'utf8'));
// Add a decision only after recording its evidence in AI审查记录.md.
const decisions = {
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
const sourceReviewed = new Set(['csh_dz','csh_wn','csh_sunshangxiang','csh_huangyueying','csh_huaman','csh_xingganning','csh_yuangubafei','csh_liximing','csh_mingrixiang','csh_jzh']);
// Evidence-based closures for reviewed roles; computed/dynamic grants still require tracing.
const extraChains = {
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
  const reviewed = skills.filter(s => decisions[s.id] && (s.characters.includes(character.id) || extra.includes(s.id)));
  if (reviewed.length) touched++;
  return `| ${index + 1} | ${esc(character.name)} (${character.id}) | ${character.skills.map(link).join('、')} | ${extra.length ? extra.map(link).join('、') : '仍需追踪'} | `
    + (reviewed.length ? reviewed.map(s => `${link(s.id)}：${decisions[s.id]}`).join('<br>') : '尚未形成语义结论')
    + (sourceReviewed.has(character.id) ? ' | 本机源码选择链已审；实战待验 |' : ' | 完整技能链待审 |');
});
const text = '# 99 武将技能 AI 审查进度\n\n'
  + '作者明确以普通名册 99 人为主线；妖灵与派生魔王不计入覆盖进度。由 `node tools/audit_roster_ai.mjs` 生成，'
  + '只合并真实名册、结构关联与已记证据的手工结论，不根据有没有 ai 字段推断通过。\n\n'
  + `当前 ${inventory.characters.length} 位武将、${inventory.characters.reduce((n,c) => n+c.skills.length,0)} 条直接技能引用；`
  + `${touched} 位存在语义结论或已定位问题，其中${sourceReviewed.size}位本机源码选择链已审；全部仍未做游戏实战验证。\n\n`
  + '每名武将还需追踪实际获得/替换/派生技能、group/subSkill/继承、check 与选择回调、响应以及失去技能后的状态。'
  + '表中直接关联不覆盖全部动态授予路径，例如卡尔动态技能池不能仅由初始技能数组判为已审。'
  + '具体改前/改后与限制见 [AI 审查记录](AI审查记录.md)。\n\n'
  + '| # | 普通武将 | 初始技能引用 | 已核对的继承/获得/子技能链 | 已有结论/问题 | 整体状态 |\n'
  + '| --- | --- | --- | --- | --- | --- |\n' + rows.join('\n') + '\n';
const target = path.join(root, 'docs/audit/99武将AI审查进度.md');
fs.writeFileSync(target, text);
console.log(JSON.stringify({characters: inventory.characters.length, partialOrLocated: touched, output: path.relative(root,target)}));
