/* 熊酒馆佣兵基础档案：可编辑的职业起点，不提供正式数值规则。 */
(function (root, factory) {
  'use strict';
  const model = typeof module === 'object' && module.exports
    ? require('./model.js') : root && root.TavernCharacterModel;
  const api = factory(model);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TavernCharacterPresets = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  if (!M) throw new Error('请先加载熊酒馆角色模型。');

  const skillNote = '技能数值 0 是基础占位，不代表正式规则。身份、背景、装备和技能均可自由修改。';
  const PRESETS = [
    {
      id: 'starter-shieldguard', name: '盾卫 · 铁盾', category: 'melee', occupation: '盾卫',
      title: '守住阵线，掩护同伴',
      background: '习惯站在队伍前方，先确认同伴的位置，再决定如何迎敌。重视约定，也愿意听取队友的建议。',
      inventory: '盾牌\n短剑\n护具\n绳索',
      notes: '基础角色用途：适合承担队伍前排、掩护与守护职责。' + skillNote,
      skills: ['盾牌使用', '近身防护', '警戒']
    },
    {
      id: 'starter-swordsman', name: '剑士 · 砺锋', category: 'melee', occupation: '剑士',
      title: '近身交锋，协同破围',
      background: '通过日常练习和同伴间的切磋打磨剑术。遇到难题时，愿意先与队友商量，再共同寻找机会。',
      inventory: '长剑\n备用短刃\n护具\n磨石',
      notes: '基础角色用途：适合近身作战、协同接应与突破阻碍。' + skillNote,
      skills: ['剑术', '步法', '战斗观察']
    },
    {
      id: 'starter-archer', name: '弓手 · 林羽', category: 'ranged', occupation: '弓手',
      title: '远距观察，弓箭支援',
      background: '习惯在行动前观察周围，留意视线与队友的位置。细心保养弓箭，也重视把所见信息及时告知同伴。',
      inventory: '弓\n箭\n箭袋\n护臂',
      notes: '基础角色用途：适合远程支援、观察与协同行动。' + skillNote,
      skills: ['弓术', '观察', '野外辨向']
    },
    {
      id: 'starter-crossbowman', name: '弩手 · 准星', category: 'ranged', occupation: '弩手',
      title: '稳守射线，远距策应',
      background: '做事沉稳，行动前会检查弩弦与弩矢。习惯与同伴约定信号，耐心等待合适的支援时机。',
      inventory: '弩\n弩矢\n备用弩弦\n维修工具',
      notes: '基础角色用途：适合远程策应、警戒与装备维护。' + skillNote,
      skills: ['弩射', '警戒', '装备检修']
    },
    {
      id: 'starter-scout', name: '斥候 · 风迹', category: 'mobile', occupation: '斥候',
      title: '先行探路，传递情报',
      background: '喜欢把陌生路径和沿途线索记在本子上。独自行进时谨慎，返回队伍后会清楚说明自己观察到的情况。',
      inventory: '短刃\n披风\n绳索\n记事本',
      notes: '基础角色用途：适合先行侦查、探路与传递情报。' + skillNote,
      skills: ['侦查', '潜行', '辨向']
    },
    {
      id: 'starter-skirmisher', name: '游击 · 雾步', category: 'mobile', occupation: '游击',
      title: '灵活接应，牵制对手',
      background: '习惯随时留意可行的路径，并与同伴保持联络。遇到变化时，会调整行动位置，帮助队伍重新衔接。',
      inventory: '短刃\n绳索\n水袋\n信号哨',
      notes: '基础角色用途：适合机动接应、牵制与支援撤离。' + skillNote,
      skills: ['灵活移动', '潜行', '信号联络']
    },
    {
      id: 'starter-physician', name: '医师 · 苏叶', category: 'support', occupation: '医师',
      title: '处理伤口，照看同伴',
      background: '细心整理随身用品，也会记下同伴的需求。行动结束后常主动查看队伍状况，提醒大家休息和整理装备。',
      inventory: '绷带\n清洁用品\n基础医疗工具\n药盒',
      notes: '基础角色用途：适合照看同伴、伤后处理与物资管理。' + skillNote,
      skills: ['急救', '照护', '物资整理']
    },
    {
      id: 'starter-artisan', name: '工匠 · 铜钉', category: 'support', occupation: '工匠',
      title: '维护装备，准备物资',
      background: '总会留意工具和装备的小毛病，喜欢用简单的办法解决眼前问题。愿意教同伴做日常维护，也会收好可用的零件。',
      inventory: '小锤\n钳子\n针线包\n零件盒',
      notes: '基础角色用途：适合装备维修、工具准备与后勤支援。' + skillNote,
      skills: ['装备维修', '手工制作', '工具使用']
    }
  ];
  const CATEGORIES = ['melee', 'ranged', 'mobile', 'support'];
  const copy = value => JSON.parse(JSON.stringify(value));
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  freeze(PRESETS);

  function list() { return copy(PRESETS); }
  function definition(presetId) {
    const item = PRESETS.find(preset => preset.id === presetId);
    if (!item) throw new Error('找不到佣兵基础档案：' + String(presetId));
    return item;
  }
  function checkCapacity(state, count) {
    if (state.cards.length + count > M.LIMITS.cards) {
      throw new Error(`角色卡最多 ${M.LIMITS.cards} 项；当前 ${state.cards.length} 项，还需新增 ${count} 项。`);
    }
  }
  function assemble(preset, state) {
    const card = M.createCard('bear-mercenary', state);
    card.name = preset.name;
    card.category = preset.category;
    card.presetId = preset.id;
    card.title = preset.title;
    card.profile.occupation = preset.occupation;
    card.profile.background = preset.background;
    card.inventory = preset.inventory;
    card.notes = preset.notes;
    card.skills = preset.skills.map((name, index) => ({
      id: `${preset.id}-skill-${index + 1}`, name, value: 0
    }));
    return card;
  }
  function createCard(presetId, state) {
    const preset = definition(presetId);
    const context = M.normalizeState(state || M.createState());
    checkCapacity(context, 1);
    const card = assemble(preset, context);
    return M.normalizeState({ ...context, cards: context.cards.concat(card) }).cards.at(-1);
  }
  function buildMissing(state, category = 'all') {
    if (category !== 'all' && !CATEGORIES.includes(category)) throw new Error('无效的基础档案分类：' + String(category));
    const context = M.normalizeState(state || M.createState());
    const selected = PRESETS.filter(preset => category === 'all' || preset.category === category);
    const missing = selected.filter(preset => !context.cards.some(card => card.presetId === preset.id));
    // Check the complete batch before generating any card; caller applies the returned cards after success.
    checkCapacity(context, missing.length);
    const cards = missing.map(preset => assemble(preset, context));
    const checked = M.normalizeState({ ...context, cards: context.cards.concat(cards) });
    return { cards: checked.cards.slice(context.cards.length), skipped: selected.length - missing.length, total: selected.length };
  }

  return { list, createCard, buildMissing };
});
