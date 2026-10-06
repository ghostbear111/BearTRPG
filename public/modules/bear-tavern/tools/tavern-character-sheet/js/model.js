/* 熊酒馆角色档案：原创数据模型。衍生属性提供建议；佣兵点数按自定义规则校验。 */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TavernCharacterModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const LIMITS = Object.freeze({ cards: 200, customRules: 50, abilities: 40, resources: 30,
    skills: 200, worldFields: 30, sheetTemplates: 50, tags: 20, text: 20000, portraitBytes: 1024 * 1024, importChars: 24 * 1024 * 1024 });
  const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const copy = value => JSON.parse(JSON.stringify(value));
  const CATEGORIES = [ { id: 'melee', label: '近战' }, { id: 'ranged', label: '远程' },
    { id: 'mobile', label: '机动' }, { id: 'support', label: '支援' }, { id: 'uncategorized', label: '未分类' } ];
  const ROLES = [ { id: 'player', label: '玩家角色' }, { id: 'npc', label: 'NPC' },
    { id: 'enemy', label: '敌人' }, { id: 'companion', label: '伙伴 / 召唤物' } ];
  const cocAbilities = [ ['STR', '力量'], ['CON', '体质'], ['SIZ', '体型'], ['DEX', '敏捷'],
    ['APP', '外貌'], ['INT', '智力'], ['POW', '意志'], ['EDU', '教育'] ];
  const dndAbilities = [ ['STR', '力量'], ['DEX', '敏捷'], ['CON', '体质'], ['INT', '智力'],
    ['WIS', '感知'], ['CHA', '魅力'] ];
  const BUILTIN_TEMPLATES = [
    { id: 'bear-mercenary', name: '熊酒馆 · 佣兵', tag: '原创世界',
      description: '熊酒馆佣兵的六项战斗属性，由你手动填写；尚未设定衍生公式。',
      abilities: [ ['STRENGTH', '力量'], ['AGILITY', '灵敏度'], ['COMBAT', '战斗力'],
        ['ACTION', '行动力'], ['DEFENSE', '防御力'], ['ACCURACY', '命中率'] ]
        .map(([key, label]) => ({ key, label, value: 0, min: 0, max: 999 })), resources: [], skills: [] },
    { id: 'coc6', name: 'CoC 6 版', tag: '克苏鲁',
      description: '以原始属性数值记录探索者，提供 HP、MP 和初始 SAN 建议。',
      abilities: cocAbilities.map(([key, label]) => ({ key, label, value: 10, min: 0, max: 99 })),
      resources: [ { key: 'HP', label: '生命 HP', value: 10 }, { key: 'MP', label: '魔法 MP', value: 10 },
        { key: 'SAN', label: '理智 SAN', value: 50 } ], skills: [] },
    { id: 'coc7', name: 'CoC 7 版', tag: '克苏鲁',
      description: '以百分位属性记录探索者，提供 HP、MP 和初始 SAN 建议。',
      abilities: cocAbilities.map(([key, label]) => ({ key, label, value: 50, min: 0, max: 200 })),
      resources: [ { key: 'HP', label: '生命 HP', value: 10 }, { key: 'MP', label: '魔法 MP', value: 10 },
        { key: 'SAN', label: '理智 SAN', value: 50 }, { key: 'LUCK', label: '幸运', value: 50 } ], skills: [] },
    { id: 'dnd5', name: 'D&D 5e 基本卡', tag: '第五版',
      description: '六项属性、等级与资源记录；职业、装备和技能由你填写。',
      abilities: dndAbilities.map(([key, label]) => ({ key, label, value: 10, min: 1, max: 30 }))
        .concat([{ key: 'LEVEL', label: '等级', value: 1, min: 1, max: 20 }]),
      resources: [ { key: 'HP', label: '生命 HP', value: 10 }, { key: 'AC', label: '护甲等级 AC', value: 10 } ],
      skills: [] },
    { id: 'freeform', name: '自由角色卡', tag: '自由记录',
      description: '不预设数值规则，以身份、技能与故事记录角色。也可创建自己的规则模板。',
      abilities: [], resources: [], skills: [] },
    { id: 'universal', name: '通用角色卡', tag: '模块化',
      description: '以可配置字段、资源、公式和列表记录角色，随角色保存独立模板快照。',
      abilities: [], resources: [], skills: [] }
  ];
  function freezeDeep(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freezeDeep); Object.freeze(value); }
    return value;
  }
  freezeDeep(BUILTIN_TEMPLATES);
  freezeDeep(CATEGORIES);
  freezeDeep(ROLES);
  const DEFAULT_COMBAT_RULES = freezeDeep({ total: 100, maxima: Object.fromEntries(BUILTIN_TEMPLATES[0].abilities.map(item => [item.key, 30])), provisional: true });

  function universal() {
    const api = root && root.TavernUniversal || (typeof require === 'function' ? require('./universal.js') : null);
    if (!api) fail('通用角色卡', '字段引擎未加载，请刷新页面');
    return api;
  }

  // Formula references checked against the publishers' own material; no rulebook prose is reproduced.
  const RULE_SOURCES = Object.freeze({
    coc6: 'https://www.chaosium.com/content/FreePDFs/CoC%207/CHA23135-Conv%20-%20Call%20of%20Cthulhu%207th%20Edition%20Conversion%20Guidelines.pdf',
    coc7: 'https://cthulhuwiki.chaosium.com/investigators/step-two-secondary-attributes.html',
    dnd5: 'https://www.dndbeyond.com/sources/dnd/br-2024/playing-the-game'
  });

  function fail(path, message) { throw new Error(`${path}：${message}`); }
  function record(value, path) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, '必须是对象');
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) fail(path, '不支持的对象原型');
    return value;
  }
  function assertSafe(value, path, depth, seen) {
    if (depth > 12) fail(path, '数据嵌套过深');
    if (!value || typeof value !== 'object') return;
    if (seen.has(value)) fail(path, '不能包含循环引用');
    seen.add(value);
    if (!Array.isArray(value)) record(value, path);
    for (const key of Object.keys(value)) {
      if (FORBIDDEN.has(key)) fail(path, '包含不安全字段');
      const desc = Object.getOwnPropertyDescriptor(value, key);
      if (!desc || !own(desc, 'value')) fail(path, '不能包含访问器');
      assertSafe(desc.value, `${path}.${key}`, depth + 1, seen);
    }
    seen.delete(value);
  }
  function safe(value, path) { assertSafe(value, path || '数据', 0, new Set()); }
  function keys(value, allowed, path) {
    record(value, path);
    Object.keys(value).forEach(key => { if (!allowed.includes(key)) fail(path, `无法识别字段 ${key}`); });
  }
  function str(value, path, max, nonempty) {
    if (typeof value !== 'string' || value.length > max || /\u0000/.test(value)) fail(path, `必须是 ${max} 字以内的文字`);
    if (nonempty && !value.trim()) fail(path, '不能为空');
    return value;
  }
  function id(value, path) {
    str(value, path, 80, true);
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(value) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) fail(path, '标识只允许字母、数字、下划线和连字符');
    if (FORBIDDEN.has(value)) fail(path, '不安全标识');
    return value;
  }
  function integer(value, path, min, max) {
    if (!Number.isSafeInteger(value) || value < min || value > max) fail(path, `必须是 ${min} 至 ${max} 的整数`);
    return value;
  }
  function category(value, path) {
    const normalized = value === undefined ? 'uncategorized' : value;
    if (!CATEGORIES.some(item => item.id === normalized)) fail(path, '分类必须是近战、远程、机动、支援或未分类');
    return normalized;
  }
  function presetId(value, path) { return value === undefined || value === '' ? '' : id(value, path); }
  function role(value, path) {
    const normalized = value === undefined ? 'player' : value;
    if (!ROLES.some(item => item.id === normalized)) fail(path, '角色类型无效');
    return normalized;
  }
  function tags(value, path) {
    const result = array(value === undefined ? [] : value, path, LIMITS.tags).map((tag, i) => str(tag, `${path}[${i}]`, 40, true));
    if (new Set(result).size !== result.length) fail(path, '标签不能重复');
    return result;
  }
  function array(value, path, max) {
    if (!Array.isArray(value) || value.length > max) fail(path, `列表最多 ${max} 项`);
    return value;
  }
  function unique(items, key, path) {
    const seen = new Set();
    items.forEach(item => { if (seen.has(item[key])) fail(path, `重复标识 ${item[key]}`); seen.add(item[key]); });
  }
  function uuid() {
    let crypto = root && root.crypto;
    if (!crypto && typeof require === 'function') crypto = require('node:crypto');
    if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    if (!crypto || typeof crypto.getRandomValues !== 'function') throw new Error('浏览器不支持安全随机标识，请使用现代浏览器。');
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const h = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  function normalizeTemplate(input) {
    safe(input, '规则');
    keys(input, ['id', 'name', 'tag', 'description', 'abilities', 'resources', 'skills'], '规则');
    const result = { id: id(input.id, '规则.id'), name: str(input.name, '规则名称', 80, true),
      tag: str(input.tag, '规则标签', 40), description: str(input.description, '规则说明', 2000),
      abilities: array(input.abilities, '属性', LIMITS.abilities).map((a, i) => {
        const p = `属性[${i}]`; keys(a, ['key', 'label', 'value', 'min', 'max'], p);
        const min = integer(a.min, `${p}.min`, -999999, 999999);
        const max = integer(a.max, `${p}.max`, min, 999999);
        return { key: id(a.key, `${p}.key`), label: str(a.label, `${p}.label`, 80, true), min, max,
          value: integer(a.value, `${p}.value`, min, max) };
      }),
      resources: array(input.resources, '资源', LIMITS.resources).map((r, i) => {
        const p = `资源[${i}]`; keys(r, ['key', 'label', 'value'], p);
        return { key: id(r.key, `${p}.key`), label: str(r.label, `${p}.label`, 80, true),
          value: integer(r.value, `${p}.value`, 0, 999999) };
      }),
      skills: normalizeSkills(input.skills, '技能') };
    unique(result.abilities, 'key', '属性'); unique(result.resources, 'key', '资源');
    return result;
  }
  function normalizeSkills(input, path) {
    const result = array(input, path, LIMITS.skills).map((s, i) => {
      const p = `${path}[${i}]`; keys(s, ['id', 'name', 'value'], p);
      return { id: id(s.id, `${p}.id`), name: str(s.name, `${p}.name`, 80, true), value: integer(s.value, `${p}.value`, -9999, 9999) };
    });
    unique(result, 'id', path); return result;
  }
  function normalizeWorld(input) {
    safe(input, '世界观'); keys(input, ['name', 'summary', 'fields'], '世界观');
    const result = { name: str(input.name, '世界名称', 100, true), summary: str(input.summary, '世界简介', LIMITS.text),
      fields: array(input.fields, '世界字段', LIMITS.worldFields).map((f, i) => {
        const p = `世界字段[${i}]`; keys(f, ['id', 'label'], p);
        return { id: id(f.id, `${p}.id`), label: str(f.label, `${p}.label`, 80, true) };
      }) };
    unique(result.fields, 'id', '世界字段'); return result;
  }
  function createState() {
    return { version: 1, cards: [], world: { name: '熊酒馆', summary: '', fields: [
      { id: 'origin', label: '出身' }, { id: 'faction', label: '所属势力' }, { id: 'bond', label: '羁绊 / 契约' }
    ] }, customRules: [], sheetTemplates: [], combatRules: copy(DEFAULT_COMBAT_RULES) };
  }
  function normalizeCombatRules(input) {
    if (input === undefined) return copy(DEFAULT_COMBAT_RULES);
    safe(input, '战斗属性规则'); keys(input, ['total', 'maxima', 'provisional'], '战斗属性规则');
    keys(input.maxima, BUILTIN_TEMPLATES[0].abilities.map(item => item.key), '属性上限');
    const maxima = Object.fromEntries(BUILTIN_TEMPLATES[0].abilities.map(item => [item.key, integer(input.maxima[item.key], item.label + '上限', 0, 999)]));
    if (input.provisional !== undefined && typeof input.provisional !== 'boolean') fail('战斗属性规则', '试用标记必须是布尔值');
    return { total: integer(input.total, '总点数', 0, 5994), maxima, provisional: input.provisional === undefined ? false : input.provisional };
  }
  function combatStatus(card, state) {
    if (card.systemId !== 'bear-mercenary') return null;
    const rules = normalizeCombatRules(state && state.combatRules);
    let used = 0;
    const overages = BUILTIN_TEMPLATES[0].abilities.map(item => {
      const value = integer(card.abilities[item.key], item.label, 0, 999); used += value;
      return { key: item.key, label: item.label, value, max: rules.maxima[item.key], excess: Math.max(0, value - rules.maxima[item.key]) };
    });
    const excess = Math.max(0, used - rules.total), issues = overages.filter(item => item.excess).map(item => item.label + '超过单项上限 ' + item.max);
    if (excess) issues.push('总点数超过预算 ' + rules.total + '（已用 ' + used + '，超出 ' + excess + '）');
    return { used, total: rules.total, remaining: rules.total - used, excess, overages, issues, valid: !issues.length, rules };
  }
  function assertCombatChange(before, after, state) {
    const next = combatStatus(after, state); if (!next || next.valid) return;
    const prior = before && before.id === after.id && combatStatus(before, state);
    // Old archives are readable without clamping. Corrections may reduce violations one field at a time.
    if (prior && !prior.valid && next.excess <= prior.excess && next.overages.every(item => item.excess <= prior.overages.find(old => old.key === item.key).excess)) return;
    fail('战斗属性', next.issues.join('；'));
  }
  function getTemplates(state) { return copy(BUILTIN_TEMPLATES).concat(copy((state && state.customRules) || [])); }
  function getTemplate(systemId, state) {
    const template = getTemplates(state).find(t => t.id === systemId);
    if (!template) fail('规则', `找不到规则模板 ${systemId}`);
    return template;
  }
  function createCard(systemId, state) {
    state = state || createState();
    const template = getTemplate(systemId, state); const now = new Date().toISOString();
    return { id: uuid(), name: '', title: '', systemId, category: 'uncategorized', presetId: '', role: 'player', tags: [],
      sheet: systemId === 'universal' ? universal().createSheet(universal().getBuiltinTemplates()[0]) : null,
      worldEnabled: true, status: 'active', portrait: '',
      profile: { player: '', age: '', occupation: '', background: '' },
      abilities: Object.fromEntries(template.abilities.map(a => [a.key, a.value])),
      resources: Object.fromEntries(template.resources.map(r => [r.key, { value: r.value, max: r.value }])),
      skills: copy(template.skills), inventory: '', notes: '', secret: '',
      world: Object.fromEntries(state.world.fields.map(f => [f.id, ''])), createdAt: now, updatedAt: now };
  }
  function portrait(value, path) {
    str(value, path, Math.ceil(LIMITS.portraitBytes / 3) * 4 + 40);
    if (value === '' || /^\/api\/resources\/[a-f0-9]{64}$/.test(value)) return value;
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match || match[2].length % 4 !== 0) fail(path, '头像必须是 PNG、JPEG 或 WebP 的 base64 图片');
    const padding = match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0;
    if (match[2].length / 4 * 3 - padding > LIMITS.portraitBytes) fail(path, '头像不能超过 1 MB');
    const head = typeof root.atob === 'function' ? root.atob(match[2].slice(0, 24))
      : typeof Buffer !== 'undefined' ? Buffer.from(match[2].slice(0, 24), 'base64').toString('latin1') : '';
    const validHeader = match[1] === 'png' ? head.startsWith('\x89PNG\r\n\x1a\n')
      : match[1] === 'jpeg' ? head.startsWith('\xff\xd8\xff') : head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP';
    if (!validHeader) fail(path, '图片内容与文件类型不符');
    return value;
  }
  function timestamp(value, path) {
    str(value, path, 40, true);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
      || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) fail(path, '时间格式无效');
    return value;
  }
  function normalizeCard(input, state, path) {
    keys(input, ['id', 'name', 'title', 'systemId', 'category', 'presetId', 'role', 'tags', 'sheet', 'worldEnabled', 'status', 'portrait', 'profile', 'abilities',
      'resources', 'skills', 'inventory', 'notes', 'secret', 'world', 'createdAt', 'updatedAt'], path);
    const systemId = id(input.systemId, `${path}.systemId`), template = getTemplate(systemId, state);
    if (typeof input.worldEnabled !== 'boolean') fail(path, 'worldEnabled 必须是布尔值');
    if (!['active', 'archived'].includes(input.status)) fail(path, '角色状态无效');
    keys(input.profile, ['player', 'age', 'occupation', 'background'], `${path}.profile`);
    const profile = { player: str(input.profile.player, '玩家', 100), age: str(input.profile.age, '年龄', 40),
      occupation: str(input.profile.occupation, '职业', 200), background: str(input.profile.background, '背景', LIMITS.text) };
    const abilities = {}; keys(input.abilities, template.abilities.map(a => a.key), `${path}.abilities`);
    template.abilities.forEach(a => { abilities[a.key] = integer(input.abilities[a.key], `${path}.abilities.${a.key}`, a.min, a.max); });
    const resources = {}; keys(input.resources, template.resources.map(r => r.key), `${path}.resources`);
    template.resources.forEach(r => {
      const p = `${path}.resources.${r.key}`, value = input.resources[r.key]; keys(value, ['value', 'max'], p);
      resources[r.key] = { value: integer(value.value, `${p}.value`, 0, 999999), max: integer(value.max, `${p}.max`, 0, 999999) };
      // Current values may exceed a regular maximum because of temporary bonuses; retain them exactly.
    });
    const world = {}; record(input.world, `${path}.world`);
    // Keep old world-field IDs as well as current IDs when a campaign schema changes. Never discard player writing.
    if (Object.keys(input.world).length > LIMITS.worldFields) fail(`${path}.world`, '世界字段过多');
    Object.entries(input.world).forEach(([key, value]) => { world[id(key, `${path}.world`)] = str(value, `${path}.world.${key}`, LIMITS.text); });
    return { id: id(input.id, `${path}.id`), name: str(input.name, '角色名称', 120), title: str(input.title, '称号', 160),
      systemId, category: category(input.category, `${path}.category`), presetId: presetId(input.presetId, `${path}.presetId`),
      role: role(input.role, `${path}.role`), tags: tags(input.tags, `${path}.tags`),
      sheet: input.sheet === undefined || input.sheet === null ? null : universal().normalizeSheet(input.sheet),
      worldEnabled: input.worldEnabled, status: input.status, portrait: portrait(input.portrait, '头像'),
      profile, abilities, resources, skills: normalizeSkills(input.skills, `${path}.skills`),
      inventory: str(input.inventory, '装备', LIMITS.text), notes: str(input.notes, '公开备注', LIMITS.text),
      secret: input.secret === undefined ? '' : str(input.secret, '秘密备注', LIMITS.text), world,
      createdAt: timestamp(input.createdAt, '创建时间'), updatedAt: timestamp(input.updatedAt, '更新时间') };
  }
  function normalizeState(input) {
    safe(input, '档案'); keys(input, ['version', 'cards', 'world', 'customRules', 'sheetTemplates', 'combatRules'], '档案');
    if (input.version !== 1) fail('档案', '不支持的版本');
    const customRules = array(input.customRules, '自定义规则', LIMITS.customRules).map(normalizeTemplate);
    unique(customRules, 'id', '自定义规则');
    customRules.forEach(t => { if (BUILTIN_TEMPLATES.some(b => b.id === t.id)) fail('自定义规则', `不能覆盖内建规则 ${t.id}`); });
    const sheetTemplates = array(input.sheetTemplates === undefined ? [] : input.sheetTemplates, '通用模板', LIMITS.sheetTemplates)
      .map(schema => universal().normalizeSchema(schema));
    unique(sheetTemplates, 'id', '通用模板');
    if (sheetTemplates.length) {
      const builtinIds = new Set(universal().getBuiltinTemplates().map(schema => schema.id));
      sheetTemplates.forEach(schema => { if (builtinIds.has(schema.id)) fail('通用模板', `不能覆盖内建模板 ${schema.id}`); });
    }
    const state = { version: 1, cards: [], world: normalizeWorld(input.world), customRules, sheetTemplates, combatRules: normalizeCombatRules(input.combatRules) };
    state.cards = array(input.cards, '角色卡', LIMITS.cards).map((c, i) => normalizeCard(c, state, `角色卡[${i}]`));
    unique(state.cards, 'id', '角色卡'); return state;
  }
  function derive(card) {
    const a = card.abilities;
    if (card.systemId === 'coc6') return [
      { label: 'HP 建议上限', value: Math.ceil((a.CON + a.SIZ) / 2), help: '(CON + SIZ) ÷ 2，向上取整' },
      { label: 'MP 建议上限', value: a.POW, help: 'POW' },
      { label: '初始 SAN', value: a.POW * 5, help: 'POW × 5；游戏中的理智由你记录' }
    ];
    if (card.systemId === 'coc7') return [
      { label: 'HP 建议上限', value: Math.floor((a.CON + a.SIZ) / 10), help: '(CON + SIZ) ÷ 10，向下取整' },
      { label: 'MP 建议上限', value: Math.floor(a.POW / 5), help: 'POW ÷ 5，向下取整' },
      { label: '初始 SAN', value: a.POW, help: 'POW；游戏中的理智由你记录' }
    ];
    if (card.systemId === 'dnd5') return dndAbilities.map(([key, label]) => ({
      label: `${key} 调整值`, value: Math.floor((a[key] - 10) / 2), help: `${label}：(${key} − 10) ÷ 2，向下取整`
    })).concat([{ label: '熟练加值', value: 2 + Math.floor((a.LEVEL - 1) / 4), help: '等级 1–4 为 +2，每 4 级增加 1' }]);
    return [];
  }
  function toPlayerCard(card, state) {
    const result = copy(card); delete result.secret;
    result.category = category(card.category, '角色分类'); result.presetId = presetId(card.presetId, '基础角色标识');
    result.role = role(card.role, '角色类型'); result.tags = tags(card.tags, '角色标签');
    result.sheet = card.sheet ? universal().publicSheet(card.sheet) : null;
    if (state) result.world = card.worldEnabled
      ? Object.fromEntries(state.world.fields.filter(field => own(card.world, field.id)).map(field => [field.id, card.world[field.id]])) : {};
    return result;
  }
  function sheetExportLabel(fieldId, existing) {
    const base = `sheet_${fieldId}`.slice(0, 80);
    let result = base, suffix = 2;
    while (existing.some(item => item.label === result)) {
      const end = `_${suffix++}`; result = base.slice(0, 80 - end.length) + end;
    }
    return result;
  }
  function toCCFolia(card, state) {
    const template = getTemplate(card.systemId, state || createState());
    const commands = card.skills.map(s => {
      const name = s.name.replace(/[\r\n]/g, ' ');
      return card.systemId === 'coc6' ? `CCB<=${s.value} ${name}` : card.systemId === 'coc7' ? `CC<=${s.value} ${name}`
        : card.systemId === 'dnd5' ? `1d20${s.value >= 0 ? '+' : ''}${s.value} ${name}` : `${name}: ${s.value}`;
    }).join('\n');
    const profile = card.profile;
    const categoryName = CATEGORIES.find(item => item.id === category(card.category, '角色分类')).label;
    const roleName = ROLES.find(item => item.id === role(card.role, '角色类型')).label;
    const cardTags = tags(card.tags, '角色标签');
    const parts = [card.title, `角色分类：${categoryName}`, `角色类型：${roleName}`, cardTags.length && `标签：${cardTags.join('、')}`,
      profile.player && `玩家：${profile.player}`, profile.age && `年龄：${profile.age}`,
      profile.occupation && `职业：${profile.occupation}`, profile.background, card.inventory && `装备：\n${card.inventory}`, card.notes].filter(Boolean);
    if (card.worldEnabled) {
      const schema = state ? state.world : createState().world;
      schema.fields.forEach(field => { if (card.world[field.id]) parts.push(`${field.label}：${card.world[field.id]}`); });
    }
    const status = template.resources.map(r => ({ label: r.key, value: card.resources[r.key].value, max: card.resources[r.key].max }));
    const params = template.abilities.map(a => ({ label: a.key, value: String(card.abilities[a.key]) }));
    if (card.sheet) {
      const sheet = universal().publicSheet(card.sheet);
      sheet.schema.modules.forEach(group => {
        const rows = [];
        group.fields.forEach(field => {
          let value = sheet.values[field.id];
          if (field.type === 'formula') {
            try { value = universal().evaluateField(sheet, field.id); }
            catch (error) { rows.push(`${field.label}：计算错误（${error.message}）`); return; }
          }
          const exportId = sheetExportLabel(field.id, field.type === 'resource' ? status : params);
          if (field.type === 'resource') {
            status.push({ label: exportId, value: value.value, max: value.max });
            rows.push(`${field.label}：${value.value} / ${value.max}${field.unit ? ` ${field.unit}` : ''}`);
          } else {
            if (field.type === 'number' || field.type === 'formula') params.push({ label: exportId, value: String(value) });
            const content = typeof value === 'boolean' ? (value ? '是' : '否') : Array.isArray(value) ? value.join('、') : String(value == null ? '' : value);
            if (content !== '') rows.push(`${field.label}：${content}${field.unit ? ` ${field.unit}` : ''}`);
          }
        });
        if (rows.length) parts.push(`${group.name}：\n${rows.join('\n')}`);
      });
    }
    return { kind: 'character', data: { name: card.name || '未命名角色', iconUrl: card.portrait, commands,
      memo: parts.join('\n\n'), status, params, externalUrl: '' } };
  }
  function externalNumber(value, path, min, max) {
    if (typeof value === 'string' && /^-?\d+$/.test(value)) value = Number(value);
    return integer(value, path, min, max);
  }
  function externalFinite(value, path) {
    if (typeof value === 'string' && /^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) value = Number(value);
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e12) fail(path, '数值必须是有限数字且绝对值不超过 10^12');
    return value;
  }
  function parseCCFolia(raw, state, systemId) {
    const data = record(raw.data, 'CCFOLIA.data'), card = createCard(systemId, state), template = getTemplate(systemId, state);
    const notes = []; card.name = str(data.name, 'CCFOLIA.name', 120);
    if (data.memo !== undefined) notes.push(str(data.memo, 'CCFOLIA.memo', LIMITS.text));
    if (data.commands !== undefined && data.commands !== '') {
      const commands = str(data.commands, 'CCFOLIA.commands', LIMITS.text);
      // Commands are retained as text, not executed or interpreted as imported JavaScript.
      notes.push(`原始骰子指令：\n${commands}`);
      for (const line of commands.split(/\r?\n/)) {
        const match = /^(?:CCB?|1d100)<=(-?\d+)\s+(.+)$/i.exec(line.trim());
        if (match && card.systemId.startsWith('coc')) card.skills.push({ id: uuid(), name: str(match[2], 'CCFOLIA.skill', 80, true), value: externalNumber(match[1], 'CCFOLIA.skill', -9999, 9999) });
      }
    }
    if (data.iconUrl !== undefined && data.iconUrl !== '') {
      const icon = str(data.iconUrl, 'CCFOLIA.iconUrl', Math.ceil(LIMITS.portraitBytes / 3) * 4 + 40);
      if (icon.startsWith('data:')) card.portrait = portrait(icon, 'CCFOLIA.iconUrl');
      else {
        let url; try { url = new URL(icon); } catch (_) { fail('CCFOLIA.iconUrl', '图片地址无效'); }
        if (url.protocol !== 'https:' && url.protocol !== 'http:') fail('CCFOLIA.iconUrl', '只接受 HTTP 或 HTTPS 图片地址');
        notes.push(`原头像地址：${icon}`);
      }
    }
    const mappedParams = new Set(), mappedStatus = new Set();
    array(data.params === undefined ? [] : data.params, 'CCFOLIA.params', 500).forEach((p, i) => {
      record(p, `CCFOLIA.params[${i}]`); const label = str(p.label, 'CCFOLIA.params.label', 80, true);
      const ability = template.abilities.find(a => a.key.toLowerCase() === label.toLowerCase() || a.label === label);
      if (ability) {
        if (mappedParams.has(ability.key)) fail('CCFOLIA.params', `重复属性 ${label}`);
        mappedParams.add(ability.key); card.abilities[ability.key] = externalNumber(p.value, `CCFOLIA.params.${label}`, ability.min, ability.max);
      } else {
        if (typeof p.value !== 'string' && (typeof p.value !== 'number' || !Number.isFinite(p.value))) fail('CCFOLIA.params', '参数值必须是文字或有限数字');
        notes.push(`外部参数 ${label}：${str(String(p.value), 'CCFOLIA.params.value', 2000)}`);
      }
    });
    array(data.status === undefined ? [] : data.status, 'CCFOLIA.status', 300).forEach((r, i) => {
      record(r, `CCFOLIA.status[${i}]`); const label = str(r.label, 'CCFOLIA.status.label', 80, true);
      const resource = template.resources.find(a => a.key.toLowerCase() === label.toLowerCase() || a.label === label);
      if (resource) {
        const value = externalNumber(r.value, 'CCFOLIA.status.value', 0, 999999), max = externalNumber(r.max, 'CCFOLIA.status.max', 0, 999999);
        if (mappedStatus.has(resource.key)) fail('CCFOLIA.status', `重复资源 ${label}`);
        mappedStatus.add(resource.key); card.resources[resource.key] = { value, max };
      } else notes.push(`外部资源 ${label}：${externalFinite(r.value, 'CCFOLIA.status.value')} / ${externalFinite(r.max, 'CCFOLIA.status.max')}`);
    });
    card.notes = str(notes.filter(Boolean).join('\n\n'), '导入公开备注', LIMITS.text);
    return { cards: [normalizeCard(card, state, '导入角色')] };
  }
  function parseImport(text, state, options) {
    state = normalizeState(state || createState()); options = options || {};
    str(text, '导入文件', LIMITS.importChars, true);
    let raw; try { raw = JSON.parse(text); } catch (_) { fail('导入文件', '不是有效 JSON'); }
    safe(raw, '导入文件'); record(raw, '导入文件');
    let result;
    if (raw.format === 'bear-tavern-archive') {
      keys(raw, ['format', 'version', 'state'], '备份'); if (raw.version !== 1) fail('备份', '不支持的版本');
      const imported = normalizeState(raw.state); result = { cards: imported.cards, world: imported.world,
        customRules: imported.customRules, sheetTemplates: imported.sheetTemplates, combatRules: imported.combatRules };
    } else if (raw.format === 'bear-tavern-character') {
      keys(raw, ['format', 'version', 'card', 'ruleTemplate', 'template', 'worldSchema', 'combatRules'], '单卡');
      if (raw.version !== 1) fail('单卡', '不支持的版本');
      if (raw.template && raw.ruleTemplate) fail('单卡', '不能重复提供规则模板');
      const context = copy(state), supplied = raw.ruleTemplate || raw.template;
      let customRules;
      if (supplied) {
        const template = normalizeTemplate(supplied);
        if (template.id !== raw.card.systemId) fail('单卡', '模板与角色规则不一致');
        const existing = getTemplates(context).find(t => t.id === template.id);
        if (existing && JSON.stringify(normalizeTemplate(existing)) !== JSON.stringify(template)) fail('单卡', '规则 ID 与现有规则冲突');
        if (!existing) { context.customRules.push(template); customRules = [template]; }
      }
      if (raw.worldSchema) context.world = normalizeWorld(raw.worldSchema);
      result = { cards: [normalizeCard(raw.card, context, '单卡.card')] };
      if (raw.worldSchema) result.world = context.world;
      if (raw.combatRules !== undefined) result.combatRules = normalizeCombatRules(raw.combatRules);
      if (customRules) result.customRules = customRules;
    } else if (raw.format === 'bear-tavern-template') {
      keys(raw, ['format', 'version', 'template'], '通用模板包');
      if (raw.version !== 1) fail('通用模板包', '不支持的版本');
      result = { cards: [], sheetTemplates: [universal().normalizeSchema(raw.template)] };
    } else if (raw.kind === 'character') result = parseCCFolia(raw, state, options.systemId || 'coc7');
    else fail('导入文件', '支持熊酒馆单卡、完整备份、通用模板包或 CCFOLIA 角色 JSON');
    // Import is a pure preview. It never mutates state or reuses the identity of an existing character.
    result.cards.forEach(card => { card.id = uuid(); });
    return result;
  }

  return { BUILTIN_TEMPLATES, CATEGORIES, ROLES, LIMITS, RULE_SOURCES, createState, getTemplates, createCard, normalizeState,
    normalizeCard: (input, state) => { safe(input, '角色'); return normalizeCard(input, state, '角色'); },
    normalizeTemplate, normalizeWorld, normalizeCombatRules, combatStatus, assertCombatChange, DEFAULT_COMBAT_RULES, derive, toPlayerCard, toCCFolia, parseImport };
});
