/* World creation documents, shared by the wizard and the local database. */
(function (root, factory) {
  const M = typeof module === 'object' && module.exports ? require('./model.js') : root.TavernCharacterModel;
  const C = typeof module === 'object' && module.exports ? require('./creator.js') : root.TavernCharacterCreator;
  const U = typeof module === 'object' && module.exports ? require('./universal.js') : root.TavernUniversal;
  const api = factory(M, C, U);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TavernWorld = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, C, U) {
  'use strict';
  const clone = v => JSON.parse(JSON.stringify(v));
  const uuid = () => (typeof require === 'function' ? require('node:crypto') : globalThis.crypto).randomUUID();
  const steps = [
    ['seed', '找一个灵感', '选择起点，用一句话描述你想玩的世界。'],
    ['foundation', '世界与法则', '确定时代、力量的边界，以及故事的基调。'],
    ['places', '土地与聚落', '从一个起始地点出发，让冒险有迹可循。'],
    ['civilizations', '居民与文明', '让居民拥有自己的生活方式、信念和习俗。'],
    ['factions', '势力与纷争', '谁想改变现状？谁又在守护它？'],
    ['rules', '选择跑团规则', '选择角色模板，确定这张桌的数值边界。'],
    ['characters', '遇见你的角色', '把居民变成可以编辑、检索和整理的角色卡。'],
    ['adventure', '第一场冒险', '准备开场、目标和线索，让故事真正开始。'],
    ['review', '建立跑团世界', '检查设定，建立角色库，准备主持人与玩家资料。']
  ].map(([id, title, hint]) => ({ id, title, hint }));
  const inspirations = [
    { id: '', name: '自由想象', mark: '✦', hint: '从你的一句话开始', intro: '', era: '', laws: '' },
    { id: 'frontier', name: '佣兵与边境', mark: '⚑', hint: '酒馆 · 委托 · 失落遗迹', intro: '边境酒馆聚集着各地佣兵。贸易路线正在失去联系，一份无人愿接的委托把他们带向旧时代的遗迹。', era: '剑与工坊并存的边境时代', laws: '超凡能力需要契约或资源；伤势与选择会留下后果。' },
    { id: 'myth', name: '神话奇幻', mark: '☾', hint: '神祇 · 誓约 · 多族传说', intro: '旧神与居民以誓约维持世界。如今一个古老契约正在失效，各族必须决定如何面对新的时代。', era: '诸神退隐后的时代', laws: '仪式有媒介，神迹有地域，每一次借力都有代价。' },
    { id: 'ocean', name: '海洋文明', mark: '≈', hint: '洋流 · 共生 · 深海回声', intro: '居民在礁群与迁徙巨兽上建立聚落，用歌声跨越洋流。深海传来的回声正在改变所有迁徙路线。', era: '探索未知深海的时代', laws: '压力、声学、光照和共生关系决定居民能抵达的地方。' },
    { id: 'space', name: '星际探索', mark: '⟡', hint: '异星 · 舰队 · 第一次接触', intro: '一支探索队在失联航道发现了仍在运转的异星文明。资源有限，他们必须在接触、探索与返航之间作出选择。', era: '星际航行时代', laws: '航行需要时间与能源；通信、技术和未知生命都有边界。' },
    { id: 'mystery', name: '都市悬疑', mark: '⌕', hint: '异常 · 调查 · 隐秘社团', intro: '城市的日常生活中出现相互关联的异常。几位调查者从一份失踪档案开始，发现繁荣背后的秘密。', era: '近现代都市', laws: '异常无法任意调用；调查依靠证据，人们的信任会影响线索。' },
    { id: 'wasteland', name: '废土求生', mark: '◇', hint: '遗迹 · 资源 · 重建秩序', intro: '灾变后的聚落依靠一条脆弱的补给线生存。当旧设施重新亮起，幸存者面对重建与争夺的抉择。', era: '灾变之后', laws: '资源、维修和生态承载力限制每一次行动。' }
  ];
  const specs = {
    seed: { name: '世界名称', intro: '一句话世界构想' },
    foundation: { era: '时代与技术', tone: '故事基调', laws: '魔法、科技与世界法则', boundaries: '不希望出现的内容 / 创作边界', history: '关键历史与时代转折' },
    places: { name: '地点名称', kind: '地点类型', description: '环境与居民', hook: '这里正在发生什么' },
    civilizations: { name: '文明 / 族群名称', inhabitants: '居民与身体特征', values: '生活方式与价值观', governance: '组织与治理', customs: '信仰与习俗' },
    factions: { name: '势力名称', goal: '诉求与目标', resources: '力量与资源', relationship: '盟友、对手与当前冲突' },
    characters: { name: '角色名字', occupation: '职业 / 身份', background: '背景故事', motivation: '目标与羁绊', inventory: '随身装备', secret: '主持人秘密' },
    adventure: { title: '冒险标题', opening: '开场场景', goal: '玩家的初始目标', clues: '可发现的线索', encounters: '遭遇与选择', hooks: '后续冒险钩子', gmNotes: '主持人真相与幕后计划' }
  };
  const refs = { places: [], civilizations: ['placeId'], factions: ['placeId', 'civilizationId'], characters: ['placeId', 'civilizationId', 'factionId'] };
  function blank(type) {
    if (!refs[type]) throw new Error('未知的世界内容类型。');
    const item = { id: uuid(), ...Object.fromEntries(Object.keys(specs[type]).map(k => [k, ''])), ...Object.fromEntries(refs[type].map(k => [k, ''])) };
    if (type === 'places') item.kind = '聚落';
    if (type === 'characters') Object.assign(item, { role: 'npc', archetype: 'starter-shieldguard', abilities: null });
    return item;
  }
  function create(meta = M.createState()) {
    return { version: 1, inspiration: '', seed: { name: '', intro: '' },
      foundation: { era: '', tone: '探索与抉择', laws: '', boundaries: '', history: '' },
      places: [blank('places')], civilizations: [blank('civilizations')], factions: [blank('factions')],
      rules: { systemId: 'bear-mercenary', templateId: U.getBuiltinTemplates()[0].id, players: 4, style: '剧情与战斗并重' },
      characters: [blank('characters')], adventure: Object.fromEntries(Object.keys(specs.adventure).map(k => [k, ''])),
      meta: M.normalizeState({ ...meta, cards: [] }) };
  }
  function object(v, label, allowed) {
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => ['__proto__', 'prototype', 'constructor'].includes(k) || !allowed.includes(k))) throw new Error(label + '的数据结构无效。');
  }
  function text(v, label, limit = 6000) {
    if (typeof v !== 'string' || v.length > limit || v.includes('\0')) throw new Error(label + '须为 ' + limit + ' 字以内的文字。');
    return v;
  }
  function id(v, label, empty = false) {
    if (empty && v === '') return '';
    if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(v)) throw new Error(label + '标识无效。');
    return v;
  }
  function fields(value, spec, label) {
    object(value, label, Object.keys(spec));
    return Object.fromEntries(Object.keys(spec).map(k => [k, text(value[k], spec[k], k === 'name' ? 100 : 6000)]));
  }
  function normalize(raw) {
    object(raw, '世界档案', ['version', 'inspiration', 'seed', 'foundation', 'places', 'civilizations', 'factions', 'rules', 'characters', 'adventure', 'meta']);
    if (raw.version !== 1) throw new Error('不支持的世界档案版本。');
    if (!inspirations.some(i => i.id === raw.inspiration)) throw new Error('未知的世界灵感。');
    const result = { version: 1, inspiration: raw.inspiration, seed: fields(raw.seed, specs.seed, '世界构想'), foundation: fields(raw.foundation, specs.foundation, '世界法则') };
    for (const type of Object.keys(refs)) {
      if (!Array.isArray(raw[type]) || raw[type].length > 24) throw new Error('每组最多 24 项设定。');
      const seen = new Set();
      result[type] = raw[type].map(row => {
        const allowed = ['id', ...Object.keys(specs[type]), ...refs[type], ...(type === 'characters' ? ['role', 'archetype', 'abilities'] : [])];
        object(row, '设定条目', allowed);
        const item = { id: id(row.id, '条目'), ...Object.fromEntries(Object.entries(specs[type]).map(([k, label]) => [k, text(row[k], label, k === 'name' ? 100 : 6000)])), ...Object.fromEntries(refs[type].map(k => [k, id(row[k], k, true)])) };
        if (seen.has(item.id)) throw new Error('条目标识重复。'); seen.add(item.id);
        if (type === 'characters') {
          if (!M.ROLES.some(r => r.id === row.role)) throw new Error('角色类型无效。');
          item.role = row.role; item.archetype = id(row.archetype, '职业', true); item.abilities = row.abilities === null ? null : clone(row.abilities);
          if (item.abilities) {
            object(item.abilities, '战斗属性', M.BUILTIN_TEMPLATES[0].abilities.map(a => a.key));
            for (const a of M.BUILTIN_TEMPLATES[0].abilities) if (!Number.isInteger(item.abilities[a.key]) || item.abilities[a.key] < 0 || item.abilities[a.key] > 999) throw new Error('战斗属性须为 0–999 的整数。');
          }
        }
        return item;
      });
    }
    const collections = { placeId: result.places, civilizationId: result.civilizations, factionId: result.factions };
    for (const type of Object.keys(refs)) for (const row of result[type]) for (const key of refs[type]) if (row[key] && !collections[key].some(item => item.id === row[key])) throw new Error('存在失效的关联，请重新选择地点、文明或势力。');
    object(raw.rules, '桌规', ['systemId', 'templateId', 'players', 'style']);
    if (!Number.isInteger(raw.rules.players) || raw.rules.players < 1 || raw.rules.players > 30) throw new Error('参与玩家须为 1–30 人。');
    result.rules = { systemId: id(raw.rules.systemId, '规则'), templateId: id(raw.rules.templateId, '模板'), players: raw.rules.players, style: text(raw.rules.style, '玩法', 200) };
    result.adventure = fields(raw.adventure, specs.adventure, '冒险');
    result.meta = M.normalizeState({ ...raw.meta, cards: [] });
    if (!M.getTemplates(result.meta).some(t => t.id === result.rules.systemId)) throw new Error('找不到所选规则。');
    if (result.rules.systemId === 'universal' && ![...U.getBuiltinTemplates(), ...result.meta.sheetTemplates].some(t => t.id === result.rules.templateId)) throw new Error('找不到所选通用模板。');
    return result;
  }
  function remove(world, type, itemId) {
    const next = clone(world); next[type] = next[type].filter(i => i.id !== itemId);
    const key = { places: 'placeId', civilizations: 'civilizationId', factions: 'factionId' }[type];
    if (key) for (const collection of Object.keys(refs)) for (const row of next[collection]) if (row[key] === itemId) row[key] = '';
    return normalize(next);
  }
  function choose(world, inspirationId) {
    const next = clone(world), prev = inspirations.find(i => i.id === next.inspiration), preset = inspirations.find(i => i.id === inspirationId);
    if (!preset) throw new Error('未知的灵感。');
    if (!next.seed.intro || next.seed.intro === prev.intro) next.seed.intro = preset.intro;
    for (const k of ['era', 'laws']) if (!next.foundation[k] || next.foundation[k] === prev[k]) next.foundation[k] = preset[k];
    next.inspiration = inspirationId; return normalize(next);
  }
  function checklist(world) {
    const named = type => world[type].length > 0 && world[type].every(i => i.name.trim());
    const checks = [
      [0, !!world.seed.name.trim() && !!world.seed.intro.trim(), '为世界起名并写下构想'],
      [1, !!world.foundation.laws.trim(), '确定世界法则与力量边界'],
      [2, named('places'), '为所有地点命名，至少一个起始地点'],
      [3, named('civilizations'), '为所有文明命名，至少一个居民族群'],
      [4, named('factions'), '为所有势力命名，至少一个推动故事的势力'],
      [5, true, '已选择规则与角色模板'],
      [6, named('characters'), '为所有角色命名，至少一位开场角色'],
      [7, !!world.adventure.opening.trim() && !!world.adventure.goal.trim(), '准备开场场景与玩家目标']
    ].map(([step, done, label]) => ({ step, done, label }));
    if (world.rules.systemId === 'bear-mercenary') checks.push({ step: 6, done: world.characters.every(row => {
      try { return !row.abilities || M.combatStatus({ systemId: 'bear-mercenary', abilities: row.abilities }, world.meta).valid; } catch (_) { return false; }
    }), label: '角色属性符合单项上限与总点数预算' });
    return checks;
  }
  function finish(raw) {
    const world = normalize(raw), missing = checklist(world).filter(i => !i.done);
    if (missing.length) throw new Error(missing.map(i => i.label).join('；'));
    const meta = clone(world.meta); meta.world.name = world.seed.name.trim(); meta.world.summary = world.seed.intro;
    for (const f of [{ id: 'place', label: '当前地点' }, { id: 'civilization', label: '文明 / 族群' }]) if (!meta.world.fields.some(i => i.id === f.id)) meta.world.fields.push(f);
    const checkedMeta = M.normalizeState(meta);
    const lookup = (type, id) => world[type].find(i => i.id === id)?.name || '';
    const cards = world.characters.map(row => {
      let card = M.createCard(world.rules.systemId, checkedMeta);
      if (card.systemId === 'bear-mercenary' && row.archetype) card = C.applyArchetype(card, row.archetype, checkedMeta);
      if (card.systemId === 'universal') card.sheet = U.createSheet([...U.getBuiltinTemplates(), ...meta.sheetTemplates].find(t => t.id === world.rules.templateId));
      card.name = row.name.trim(); card.role = row.role; card.profile.occupation = row.occupation || card.profile.occupation;
      card.profile.background = row.background; card.inventory = row.inventory; card.notes = row.motivation; card.secret = row.secret;
      card.world.place = lookup('places', row.placeId); card.world.civilization = lookup('civilizations', row.civilizationId);
      if ('faction' in card.world) card.world.faction = lookup('factions', row.factionId);
      if ('bond' in card.world) card.world.bond = row.motivation;
      card.tags = [...new Set([lookup('factions', row.factionId), lookup('civilizations', row.civilizationId)].filter(Boolean).map(s => s.slice(0, 40)))];
      if (card.systemId === 'bear-mercenary' && row.abilities) card.abilities = row.abilities;
      M.assertCombatChange(null, card, checkedMeta); return M.normalizeCard(card, checkedMeta);
    });
    return { world, meta: checkedMeta, cards, links: Object.fromEntries(world.characters.map((row, i) => [row.id, cards[i].id])) };
  }
  function player(raw) {
    const w = normalize(raw);
    return { version: 1, seed: clone(w.seed), foundation: clone(w.foundation), places: clone(w.places), civilizations: clone(w.civilizations),
      factions: w.factions.map(({ id, name, placeId, civilizationId }) => ({ id, name, placeId, civilizationId })),
      rules: clone(w.rules), characters: w.characters.map(({ id, name, occupation, role, placeId, civilizationId, factionId }) => ({ id, name, occupation, role, placeId, civilizationId, factionId })),
      adventure: { title: w.adventure.title, opening: w.adventure.opening, goal: w.adventure.goal } };
  }
  function markdown(raw, audience = 'gm') {
    const w = audience === 'player' ? player(raw) : normalize(raw), name = (type, id) => w[type].find(i => i.id === id)?.name || '未关联';
    const lines = ['# ' + (w.seed.name || '未命名世界'), '', w.seed.intro, '', '## 世界法则'];
    for (const [k, label] of Object.entries(specs.foundation)) if (w.foundation[k]) lines.push('### ' + label, w.foundation[k], '');
    for (const type of ['places', 'civilizations', 'factions', 'characters']) {
      lines.push('## ' + steps.find(s => s.id === type).title);
      for (const row of w[type]) {
        lines.push('### ' + (row.name || '未命名')); for (const [k, label] of Object.entries(specs[type])) if (k !== 'name' && row[k]) lines.push('**' + label + '**：' + row[k], '');
        for (const key of refs[type]) if (row[key]) lines.push('关联：' + name({ placeId: 'places', civilizationId: 'civilizations', factionId: 'factions' }[key], row[key]));
      }
    }
    lines.push('## 跑团规则', w.rules.systemId + ' · ' + w.rules.players + ' 名玩家 · ' + w.rules.style, '', '## 第一场冒险');
    for (const [k, label] of Object.entries(specs.adventure)) if (w.adventure[k]) lines.push('### ' + label, w.adventure[k], '');
    return lines.join('\n');
  }
  return Object.freeze({ steps, inspirations, specs, refs, create, blank, normalize, remove, choose, checklist, finish, player, markdown, clone });
});
