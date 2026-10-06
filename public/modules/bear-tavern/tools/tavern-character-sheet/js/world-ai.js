/* Field-level suggestions: models cannot change IDs, references, rules or budgets. */
(function (root, factory) {
  const W = typeof module === 'object' && module.exports ? require('./world-model.js') : root.TavernWorld;
  const api = factory(W);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TavernWorldAI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (W) {
  'use strict';
  const read = (w, path) => path.reduce((v, key) => v[key], w);
  function describe(world, step, targetId) {
    const key = W.steps[step]?.id;
    if (!W.specs[key]) throw new Error('此步骤由你选择规则或核对结果，无需 AI 填写。');
    const fields = [];
    function add(row, path, n = '') {
      for (const [k, label] of Object.entries(W.specs[key])) {
        // Existing private text is never sent to a model, including the prompt's current values.
        if (k === 'secret' || k === 'gmNotes') continue;
        fields.push({ id: 'f' + fields.length, label: n + label, path: [...path, k], itemId: row.id, type: k === 'name' ? 'text' : 'textarea', maxLength: k === 'name' ? 100 : 6000, current: row[k], empty: !row[k].trim() });
      }
    }
    if (Array.isArray(world[key])) world[key].forEach((row, i) => { if (!targetId || row.id === targetId) add(row, [key, i], '第' + (i + 1) + '项 · '); }); else add(world[key], [key]);
    if (!fields.length) throw new Error('请先添加至少一项设定，再生成内容。');
    // Keep small local models within a useful context while retaining the relevant civilization and faction goals.
    let remaining = 6500;
    const excerpt = (value, limit = 240) => { const result = String(value || '').slice(0, Math.max(0, Math.min(limit, remaining))); remaining -= result.length; return result; };
    const lookup = (type, id) => world[type].find(row => row.id === id)?.name || '';
    const current = Array.isArray(world[key]) ? world[key].filter(row => !targetId || row.id === targetId) : [];
    const relevant = type => {
      const reference = { places: 'placeId', civilizations: 'civilizationId', factions: 'factionId' }[type];
      const preferred = new Set(current.map(row => row[reference]).filter(Boolean));
      return [...world[type].filter(row => preferred.has(row.id)), ...world[type].filter(row => !preferred.has(row.id))].slice(0, 6);
    };
    const context = { seed: { name: world.seed.name, intro: excerpt(world.seed.intro, 1000) }, foundation: Object.fromEntries(Object.entries(world.foundation).map(([k, v]) => [k, excerpt(v, 400)])), stage: W.steps[step].title };
    for (const type of ['factions', 'civilizations', 'places', 'characters']) context[type] = relevant(type).map(row => {
      const allowed = { places: ['kind', 'description', 'hook'], civilizations: ['inhabitants', 'values', 'governance', 'customs'], factions: ['goal', 'resources', 'relationship'], characters: ['role', 'occupation', 'background', 'motivation'] }[type];
      return { name: row.name, ...Object.fromEntries(allowed.map(k => [k, excerpt(row[k])])), ...Object.fromEntries(W.refs[type].map(k => [k, lookup({ placeId: 'places', civilizationId: 'civilizations', factionId: 'factions' }[k], row[k])])) };
    });
    return { fields, rule: { name: 'TRPG 世界构建 · ' + W.steps[step].title, description: '创造彼此一致、适合游玩的中文世界设定。具体、简短，不要在公开介绍中揭露谜底。' }, context, world: { name: world.seed.name, summary: context.seed.intro } };
  }
  function suggestions(content, description, world) {
    if (typeof content !== 'string' || content.length > 500000) throw new Error('模型返回内容过长。');
    let parsed;
    try { parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch (_) { throw new Error('模型未返回有效 JSON，请重试或减少条目。'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).some(k => k !== 'values') || !parsed.values || typeof parsed.values !== 'object' || Array.isArray(parsed.values)) throw new Error('模型返回格式应为 {"values":{字段ID:建议值}}。');
    const changes = [], warnings = [];
    for (const [id, after] of Object.entries(parsed.values)) {
      const field = description.fields.find(f => f.id === id);
      if (!field || typeof after !== 'string' || !after.trim() || after.length > field.maxLength || after.includes('\0')) { warnings.push('忽略未知、空白或格式无效的建议：' + id); continue; }
      if (read(world, field.path) !== field.current) throw new Error('生成期间设定已修改，请重新生成。');
      if (after !== field.current) changes.push({ ...field, before: field.current, after });
    }
    return { changes, warnings };
  }
  function apply(world, changes, selected) {
    const next = W.clone(world); let count = 0;
    for (const change of changes) if (selected.includes(change.id)) {
      if (read(world, change.path) !== change.before || (change.itemId && read(world, change.path.slice(0, -1)).id !== change.itemId)) throw new Error('“' + change.label + '”已修改，请重新生成建议。');
      const node = change.path.slice(0, -1).reduce((v, k) => v[k], next); node[change.path.at(-1)] = change.after; count++;
    }
    if (!count) throw new Error('请勾选至少一项建议。');
    return W.normalize(next);
  }
  return Object.freeze({ describe, suggestions, apply });
});
