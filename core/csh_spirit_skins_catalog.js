/* 池子魔将 · 妖灵装扮生产注册表（2026-11-09 首批：18 位妖灵 / 70 套；
 * 2026-11-11 去除女帝与经典同图的 s1；2026-11-12 新增春丽 3 套、蒂法 2 套，合计 20 位 / 74 套）
 * ------------------------------------------------------------------
 * 素材由作者提供，逐张识图后按人像构图单独裁切，统一 1300x1600 webP 立绘
 * + 400x500 webP 头像。资源路径只走 ASCII，桌面原图不入库、不改动。
 *
 * 【解锁策略 · 全部开放 all-unlocked】
 * 装扮无顺序、无前置条件、无货币与成就门槛：随扩展一起发布的每一套，
 * 玩家首次打开图鉴装扮弹层即可直接选用，任意切换、随时恢复经典。
 * 依据：装扮是纯外观（cosmetic-only），不写好感 / 次数 / 战斗对象，
 * 选择只落在 csh_spirit_skin_v1 的稳定 ID 上；设门槛只会给本机偏好
 * 增加"锁住内容"的存档状态，不产生任何玩法价值。
 * CSHSpiritSkins.list() 返回 classic + 全部注册项，select() 只校验
 * skinId 是否在注册表中 —— 这两条恰好就是本策略的完整实现。
 *
 * 编号（s1/s2...）只是稳定标识，不代表稀有度、顺序或解锁先后；
 * 罗宾的 s1a / s1b 对应作者两张同名但内容不同的 1 号原图。
 * 「经典形象」由基座自动置顶，不写进本表。
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';
  var S = root.CSHSpiritSkins;
  if (!S || typeof S.register !== 'function') return;

  var DATA = {
    'csh_boss_minion_chunli': [
      { id: 's1', name: '碧浪', portrait: 'image/spirit-skins/chunli/s1.webp', face: 'image/spirit-skins/chunli/s1_face.webp' },
      { id: 's2', name: '鎏灯舞', portrait: 'image/spirit-skins/chunli/s2.webp', face: 'image/spirit-skins/chunli/s2_face.webp' },
      { id: 's3', name: '晴海', portrait: 'image/spirit-skins/chunli/s3.webp', face: 'image/spirit-skins/chunli/s3_face.webp' },
    ],
    'csh_boss_minion_tifa': [
      { id: 's1', name: '晴池花影', portrait: 'image/spirit-skins/tifa/s1.webp', face: 'image/spirit-skins/tifa/s1_face.webp' },
      { id: 's2', name: '街巷日光', portrait: 'image/spirit-skins/tifa/s2.webp', face: 'image/spirit-skins/tifa/s2_face.webp' },
    ],
    'csh_boss_minion_mai': [
      { id: 's1', name: '红装', portrait: 'image/spirit-skins/mai/s1.webp', face: 'image/spirit-skins/mai/s1_face.webp' },
    ],
    'csh_boss_minion_eve': [
      { id: 's1', name: '魔女', portrait: 'image/spirit-skins/eve/s1.webp', face: 'image/spirit-skins/eve/s1_face.webp' },
      { id: 's2', name: '街头', portrait: 'image/spirit-skins/eve/s2.webp', face: 'image/spirit-skins/eve/s2_face.webp' },
      { id: 's3', name: '鎏金', portrait: 'image/spirit-skins/eve/s3.webp', face: 'image/spirit-skins/eve/s3_face.webp' },
      { id: 's4', name: '玫瑰', portrait: 'image/spirit-skins/eve/s4.webp', face: 'image/spirit-skins/eve/s4_face.webp' },
      { id: 's5', name: '自拍', portrait: 'image/spirit-skins/eve/s5.webp', face: 'image/spirit-skins/eve/s5_face.webp' },
    ],
    'csh_boss_minion_perona': [
      { id: 's1', name: '王冠', portrait: 'image/spirit-skins/perona/s1.webp', face: 'image/spirit-skins/perona/s1_face.webp' },
      { id: 's2', name: '夜宴', portrait: 'image/spirit-skins/perona/s2.webp', face: 'image/spirit-skins/perona/s2_face.webp' },
    ],
    'csh_boss_minion_fubuki': [
      { id: 's1', name: '束影', portrait: 'image/spirit-skins/fubuki/s1.webp', face: 'image/spirit-skins/fubuki/s1_face.webp' },
      { id: 's2', name: '端坐', portrait: 'image/spirit-skins/fubuki/s2.webp', face: 'image/spirit-skins/fubuki/s2_face.webp' },
      { id: 's3', name: '长街', portrait: 'image/spirit-skins/fubuki/s3.webp', face: 'image/spirit-skins/fubuki/s3_face.webp' },
      { id: 's4', name: '素白', portrait: 'image/spirit-skins/fubuki/s4.webp', face: 'image/spirit-skins/fubuki/s4_face.webp' },
      { id: 's5', name: '朱红', portrait: 'image/spirit-skins/fubuki/s5.webp', face: 'image/spirit-skins/fubuki/s5_face.webp' },
    ],
    'csh_boss_minion_kaguya': [
      { id: 's1', name: '录像', portrait: 'image/spirit-skins/kaguya/s1.webp', face: 'image/spirit-skins/kaguya/s1_face.webp' },
      { id: 's2', name: '晨光', portrait: 'image/spirit-skins/kaguya/s2.webp', face: 'image/spirit-skins/kaguya/s2_face.webp' },
    ],
    'csh_boss_minion_empress': [
      /* 2026-11-11 剔除 s1「绯衣」：它与经典基座 image/csh_minion_empress.webp
         是同一张原图的不同裁切（姿势/红衣白毛领/金耳环/背景花纹完全一致）。
         经典形象已由基座自动置顶，再挂一套等于重复陈列。
         已选过 s1 的旧档不必迁移：resolve()/skinOf() 找不到该 ID 会回退 classic。 */
      { id: 's2', name: '白衣', portrait: 'image/spirit-skins/empress/s2.webp', face: 'image/spirit-skins/empress/s2_face.webp' },
      { id: 's3', name: '红装', portrait: 'image/spirit-skins/empress/s3.webp', face: 'image/spirit-skins/empress/s3_face.webp' },
      { id: 's4', name: '正装', portrait: 'image/spirit-skins/empress/s4.webp', face: 'image/spirit-skins/empress/s4_face.webp' },
      { id: 's5', name: '王座', portrait: 'image/spirit-skins/empress/s5.webp', face: 'image/spirit-skins/empress/s5_face.webp' },
    ],
    'csh_boss_minion_nami': [
      { id: 's1', name: '夏日', portrait: 'image/spirit-skins/nami/s1.webp', face: 'image/spirit-skins/nami/s1_face.webp' },
      { id: 's2', name: '回眸', portrait: 'image/spirit-skins/nami/s2.webp', face: 'image/spirit-skins/nami/s2_face.webp' },
      { id: 's3', name: '热岛', portrait: 'image/spirit-skins/nami/s3.webp', face: 'image/spirit-skins/nami/s3_face.webp' },
      { id: 's4', name: '红衫', portrait: 'image/spirit-skins/nami/s4.webp', face: 'image/spirit-skins/nami/s4_face.webp' },
      { id: 's5', name: '红裙', portrait: 'image/spirit-skins/nami/s5.webp', face: 'image/spirit-skins/nami/s5_face.webp' },
    ],
    'csh_boss_minion_ciri': [
      { id: 's1', name: '城垣', portrait: 'image/spirit-skins/ciri/s1.webp', face: 'image/spirit-skins/ciri/s1_face.webp' },
      { id: 's2', name: '暖烛', portrait: 'image/spirit-skins/ciri/s2.webp', face: 'image/spirit-skins/ciri/s2_face.webp' },
      { id: 's3', name: '林间', portrait: 'image/spirit-skins/ciri/s3.webp', face: 'image/spirit-skins/ciri/s3_face.webp' },
      { id: 's4', name: '窗畔', portrait: 'image/spirit-skins/ciri/s4.webp', face: 'image/spirit-skins/ciri/s4_face.webp' },
      { id: 's5', name: '猫耳', portrait: 'image/spirit-skins/ciri/s5.webp', face: 'image/spirit-skins/ciri/s5_face.webp' },
    ],
    'csh_boss_minion_temari': [
      { id: 's1', name: '林影', portrait: 'image/spirit-skins/temari/s1.webp', face: 'image/spirit-skins/temari/s1_face.webp' },
      { id: 's2', name: '室内', portrait: 'image/spirit-skins/temari/s2.webp', face: 'image/spirit-skins/temari/s2_face.webp' },
    ],
    'csh_boss_minion_ran': [
      { id: 's1', name: '蓝浴衣', portrait: 'image/spirit-skins/ran/s1.webp', face: 'image/spirit-skins/ran/s1_face.webp' },
      { id: 's2', name: '浴后', portrait: 'image/spirit-skins/ran/s2.webp', face: 'image/spirit-skins/ran/s2_face.webp' },
      { id: 's3', name: '兔耳', portrait: 'image/spirit-skins/ran/s3.webp', face: 'image/spirit-skins/ran/s3_face.webp' },
    ],
    'csh_boss_minion_makima': [
      { id: 's1', name: '温室', portrait: 'image/spirit-skins/makima/s1.webp', face: 'image/spirit-skins/makima/s1_face.webp' },
      { id: 's2', name: '泳池', portrait: 'image/spirit-skins/makima/s2.webp', face: 'image/spirit-skins/makima/s2_face.webp' },
      { id: 's3', name: '酒吧', portrait: 'image/spirit-skins/makima/s3.webp', face: 'image/spirit-skins/makima/s3_face.webp' },
      { id: 's4', name: '衬衫', portrait: 'image/spirit-skins/makima/s4.webp', face: 'image/spirit-skins/makima/s4_face.webp' },
      { id: 's5', name: '暮色', portrait: 'image/spirit-skins/makima/s5.webp', face: 'image/spirit-skins/makima/s5_face.webp' },
    ],
    'csh_boss_minion_robin': [
      { id: 's1a', name: '花衫', portrait: 'image/spirit-skins/robin/s1a.webp', face: 'image/spirit-skins/robin/s1a_face.webp' },
      { id: 's1b', name: '海风', portrait: 'image/spirit-skins/robin/s1b.webp', face: 'image/spirit-skins/robin/s1b_face.webp' },
      { id: 's2', name: '窗边', portrait: 'image/spirit-skins/robin/s2.webp', face: 'image/spirit-skins/robin/s2_face.webp' },
      { id: 's3', name: '浴巾', portrait: 'image/spirit-skins/robin/s3.webp', face: 'image/spirit-skins/robin/s3_face.webp' },
      { id: 's4', name: '自拍', portrait: 'image/spirit-skins/robin/s4.webp', face: 'image/spirit-skins/robin/s4_face.webp' },
      { id: 's5', name: '黑裙', portrait: 'image/spirit-skins/robin/s5.webp', face: 'image/spirit-skins/robin/s5_face.webp' },
    ],
    'csh_boss_minion_ashe': [
      { id: 's1', name: '牛仔', portrait: 'image/spirit-skins/ashe/s1.webp', face: 'image/spirit-skins/ashe/s1_face.webp' },
      { id: 's2', name: '疾影', portrait: 'image/spirit-skins/ashe/s2.webp', face: 'image/spirit-skins/ashe/s2_face.webp' },
    ],
    'csh_boss_minion_emilia': [
      { id: 's1', name: '海滩', portrait: 'image/spirit-skins/emilia/s1.webp', face: 'image/spirit-skins/emilia/s1_face.webp' },
      { id: 's2', name: '紫影', portrait: 'image/spirit-skins/emilia/s2.webp', face: 'image/spirit-skins/emilia/s2_face.webp' },
      { id: 's3', name: '酒馆', portrait: 'image/spirit-skins/emilia/s3.webp', face: 'image/spirit-skins/emilia/s3_face.webp' },
      { id: 's4', name: '夜色', portrait: 'image/spirit-skins/emilia/s4.webp', face: 'image/spirit-skins/emilia/s4_face.webp' },
    ],
    'csh_boss_minion_ada': [
      { id: 's1', name: '石墙', portrait: 'image/spirit-skins/ada/s1.webp', face: 'image/spirit-skins/ada/s1_face.webp' },
      { id: 's2', name: '金涡', portrait: 'image/spirit-skins/ada/s2.webp', face: 'image/spirit-skins/ada/s2_face.webp' },
      { id: 's3', name: '制服', portrait: 'image/spirit-skins/ada/s3.webp', face: 'image/spirit-skins/ada/s3_face.webp' },
    ],
    'csh_boss_minion_frieren': [
      { id: 's1', name: '白衫', portrait: 'image/spirit-skins/frieren/s1.webp', face: 'image/spirit-skins/frieren/s1_face.webp' },
      { id: 's2', name: '蓝浪', portrait: 'image/spirit-skins/frieren/s2.webp', face: 'image/spirit-skins/frieren/s2_face.webp' },
      { id: 's3', name: '回眸', portrait: 'image/spirit-skins/frieren/s3.webp', face: 'image/spirit-skins/frieren/s3_face.webp' },
      { id: 's4', name: '白衣', portrait: 'image/spirit-skins/frieren/s4.webp', face: 'image/spirit-skins/frieren/s4_face.webp' },
      { id: 's5', name: '王座', portrait: 'image/spirit-skins/frieren/s5.webp', face: 'image/spirit-skins/frieren/s5_face.webp' },
    ],
    'csh_boss_minion_fern': [
      { id: 's1', name: '俯视', portrait: 'image/spirit-skins/fern/s1.webp', face: 'image/spirit-skins/fern/s1_face.webp' },
      { id: 's2', name: '午憩', portrait: 'image/spirit-skins/fern/s2.webp', face: 'image/spirit-skins/fern/s2_face.webp' },
      { id: 's3', name: '凝视', portrait: 'image/spirit-skins/fern/s3.webp', face: 'image/spirit-skins/fern/s3_face.webp' },
      { id: 's4', name: '静坐', portrait: 'image/spirit-skins/fern/s4.webp', face: 'image/spirit-skins/fern/s4_face.webp' },
      { id: 's5', name: '侧颜', portrait: 'image/spirit-skins/fern/s5.webp', face: 'image/spirit-skins/fern/s5_face.webp' },
    ],
    'csh_boss_minion_anne': [
      { id: 's1', name: '卫衣', portrait: 'image/spirit-skins/anne/s1.webp', face: 'image/spirit-skins/anne/s1_face.webp' },
      { id: 's2', name: '浅衫', portrait: 'image/spirit-skins/anne/s2.webp', face: 'image/spirit-skins/anne/s2_face.webp' },
      { id: 's3', name: '绯红', portrait: 'image/spirit-skins/anne/s3.webp', face: 'image/spirit-skins/anne/s3_face.webp' },
      { id: 's4', name: '怪盗', portrait: 'image/spirit-skins/anne/s4.webp', face: 'image/spirit-skins/anne/s4_face.webp' },
      { id: 's5', name: '校服', portrait: 'image/spirit-skins/anne/s5.webp', face: 'image/spirit-skins/anne/s5_face.webp' },
    ]
  };
  var spiritCount = 0, skinCount = 0;
  Object.keys(DATA).forEach(function (id) {
    skinCount += S.register(id, DATA[id]);
    spiritCount++;
  });
  root.CSHSpiritSkinCatalog = Object.freeze({
    version: 1, unlock: 'all', spiritCount: spiritCount, skinCount: skinCount
  });
})(typeof window !== 'undefined' ? window : globalThis);
