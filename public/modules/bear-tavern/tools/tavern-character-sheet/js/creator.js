/* Character creation helpers. Drafts never write to the archive. */
(function (root, factory) {
  'use strict';
  const M = typeof module === 'object' && module.exports ? require('./model.js') : root.TavernCharacterModel;
  const P = typeof module === 'object' && module.exports ? require('./presets.js') : root.TavernCharacterPresets;
  const api = factory(M, P);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TavernCharacterCreator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, P) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const WEIGHTS = {
    'starter-shieldguard': [4, 2, 3, 2, 5, 2],
    'starter-swordsman': [4, 3, 5, 3, 2, 3],
    'starter-archer': [2, 4, 3, 3, 2, 5],
    'starter-crossbowman': [3, 2, 4, 2, 3, 5],
    'starter-scout': [2, 5, 2, 5, 2, 3],
    'starter-skirmisher': [2, 5, 3, 5, 2, 3],
    'starter-physician': [2, 3, 2, 5, 4, 3],
    'starter-artisan': [4, 3, 2, 4, 4, 2]
  };
  // Weighted distribution stops at either the budget or the combined attribute caps.
  function allocate(state, archetypeId = '') {
    const rules = M.normalizeCombatRules(state.combatRules);
    const keys = M.BUILTIN_TEMPLATES[0].abilities.map(item => item.key);
    const weights = WEIGHTS[archetypeId] || keys.map(() => 1);
    const values = keys.map(() => 0);
    const available = Math.min(rules.total, keys.reduce((sum, key) => sum + rules.maxima[key], 0));
    for (let spent = 0; spent < available; spent++) {
      let best = -1;
      keys.forEach((key, i) => {
        if (values[i] < rules.maxima[key] && (best < 0 || weights[i] / (values[i] + 1) > weights[best] / (values[best] + 1))) best = i;
      });
      values[best]++;
    }
    return Object.fromEntries(keys.map((key, i) => [key, values[i]]));
  }
  function applyArchetype(card, archetypeId, state, previousId = '') {
    if (card.systemId !== 'bear-mercenary') throw new Error('职业原型仅用于熊酒馆佣兵。');
    const all = P.list(), next = all.find(item => item.id === archetypeId), prior = all.find(item => item.id === previousId);
    if (!next) throw new Error('找不到这个职业原型。');
    const result = copy(card);
    // Keep text the player has rewritten when revisiting the class choice.
    for (const key of ['name', 'title', 'inventory']) {
      if (!result[key] || result[key] === prior?.[key]) result[key] = next[key];
    }
    if (!result.profile.background || result.profile.background === prior?.background) result.profile.background = next.background;
    result.profile.occupation = next.occupation;
    result.category = next.category;
    result.presetId = ''; // This is a new character, not a library starter record.
    result.skills = next.skills.map((name, i) => ({ id: 'creation-skill-' + (i + 1), name, value: 0 }));
    result.abilities = allocate(state, archetypeId);
    return result;
  }
  function finish(card, state) {
    if (state.cards.length >= M.LIMITS.cards) throw new Error('角色卡最多 ' + M.LIMITS.cards + ' 项，请先备份或清理旧档案。');
    const result = copy(card); result.name = result.name.trim();
    if (!result.name) throw new Error('请先给角色起一个名字。');
    result.updatedAt = new Date().toISOString();
    M.assertCombatChange(null, result, state);
    return M.normalizeState({ ...state, cards: [result, ...state.cards] }).cards[0];
  }
  return Object.freeze({ allocate, applyArchetype, finish });
});
