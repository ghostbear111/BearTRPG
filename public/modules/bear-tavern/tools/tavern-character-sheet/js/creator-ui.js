/* A staged, keyboard-accessible creator; only final confirmation commits a card. */
(function (root) {
  'use strict';
  const M = root.TavernCharacterModel, P = root.TavernCharacterPresets, C = root.TavernCharacterCreator, U = root.TavernUniversal;
  const $ = id => document.getElementById(id), clone = value => JSON.parse(JSON.stringify(value));
  const STEPS = ['规则起点', '职业与属性', '身份与故事', '确认建档'];
  const ICONS = { melee: '◇', ranged: '◎', mobile: '↗', support: '✧', uncategorized: '✦' };
  let hooks, draft, step = 0, archetype = '', universalView, previewExpanded = false, session = 0, portraitPending = false, committing = false;
  let drafts = new Map(), numbers = [], adjustments = [], pendingErrors = new Map(), written = new Set();
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'text') node.textContent = value;
      else if (key === 'class') node.className = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (value !== undefined && value !== null) node.setAttribute(key, String(value));
    });
    children.flat().forEach(child => { if (child !== null && child !== undefined) node.append(typeof child === 'string' ? document.createTextNode(child) : child); });
    return node;
  }
  function button(label, action, cls = 'button-quiet') { return el('button', { type: 'button', class: cls, onclick: action, text: label }); }
  function error(message = '') { $('create-error').textContent = message; }
  function state() { return hooks.state(); }
  function template() { return M.getTemplates(state()).find(item => item.id === draft.systemId); }
  function label(items, id) { return items.find(item => item.id === id)?.label || ''; }
  function destroyEditor() { if (universalView) universalView.destroy(); universalView = null; }
  function drawSteps() {
    $('creator-steps').replaceChildren(...STEPS.map((name, index) => {
      const node = button('', () => go(index), 'creator-step-link' + (index === step ? ' is-current' : ''));
      node.append(el('span', { class: 'creator-step-number', text: String(index + 1).padStart(2, '0') }), el('span', { text: name }));
      if (index === step) node.setAttribute('aria-current', 'step');
      return node;
    }));
  }
  function updateStep(focus = true) {
    document.querySelectorAll('[data-creator-step]').forEach(node => { node.hidden = Number(node.dataset.creatorStep) !== step; });
    drawSteps(); $('creator-back').hidden = step === 0; $('creator-next').hidden = step === 3; $('creator-submit').hidden = step !== 3;
    $('creator-next').textContent = ['选择职业 →', '填写身份 →', '预览角色 →'][step] || '下一步 →';
    $('creator-progress').textContent = '第 ' + (step + 1) + ' / 4 步 · ' + STEPS[step];
    $('creator-submit').disabled = portraitPending;
    if (step === 3) renderReview();
    if (focus) {
      $('create-dialog').querySelector('.creator-workspace').scrollTop = 0;
      const heading = $('create-dialog').querySelector('[data-creator-step="' + step + '"] h3'); heading.tabIndex = -1; heading.focus({ preventScroll: true });
    }
  }
  function validate(target) {
    if (pendingErrors.size) { step = 1; updateStep(); error(Array.from(pendingErrors.values())[0]); return false; }
    const bad = numbers.find(control => !control.checkValidity());
    if (bad) { step = 1; updateStep(); error(bad.validationMessage); bad.focus(); return false; }
    if (target === 3 && !draft.name.trim()) { step = 2; updateStep(); error('请先给角色起一个名字，其他故事可以以后继续补充。'); $('create-name').focus(); return false; }
    try { M.assertCombatChange(null, draft, state()); } catch (problem) { step = 1; updateStep(); error(problem.message); return false; }
    return true;
  }
  function go(index) {
    if (!draft || index < 0 || index > 3) return;
    if (index > step && !validate(index)) return;
    error(); step = index; updateStep();
  }
  function chooseRule(systemId) {
    if (!draft || systemId === draft.systemId) return;
    const old = clone(draft); drafts.set(old.systemId, { card: old, archetype });
    const cached = drafts.get(systemId);
    draft = cached ? clone(cached.card) : M.createCard(systemId, state());
    archetype = cached?.archetype || '';
    // Identity and story belong to the person; mechanics belong to the chosen rule.
    for (const key of ['id', 'category', 'role', 'portrait', 'world', 'worldEnabled']) draft[key] = clone(old[key]);
    for (const key of ['name', 'title', 'inventory']) if (written.has(key)) draft[key] = old[key];
    for (const key of Object.keys(old.profile)) if (written.has('profile.' + key)) draft.profile[key] = old.profile[key];
    if (systemId === 'universal' && !cached) draft.sheet = U.createSheet(hooks.sheetTemplates().find(item => item.id === $('create-sheet-template').value) || hooks.sheetTemplates()[0]);
    $('create-system').value = systemId; destroyEditor(); pendingErrors.clear(); error(); renderRules(); syncIdentity(); renderBuild(); renderPreview();
    if (step === 3) renderReview();
  }
  function setTemplate(id) {
    $('create-sheet-template').value = id;
    if (!draft || draft.systemId !== 'universal') return;
    const schema = hooks.sheetTemplates().find(item => item.id === id);
    if (!schema || draft.sheet.schema.id === id) return;
    drafts.set('universal:' + draft.sheet.schema.id, clone(draft.sheet));
    draft.sheet = drafts.has('universal:' + id) ? clone(drafts.get('universal:' + id)) : U.createSheet(schema);
    destroyEditor(); pendingErrors.clear(); error(); renderBuild(); renderPreview(); if (step === 3) renderReview();
  }
  function renderRules() {
    const current = template(); $('create-rule-hint').textContent = current?.description || '';
    $('creator-identity-copy').textContent = draft.systemId === 'bear-mercenary' ? '职业原型可以带入故事和装备建议。你可以直接使用，也可以把它们改成自己的版本。' : '名字是唯一需要先填写的身份信息，其余故事可以在建档后继续完善。';
    $('create-template-wrap').hidden = draft.systemId !== 'universal';
    if (draft.sheet && hooks.sheetTemplates().some(item => item.id === draft.sheet.schema.id)) $('create-sheet-template').value = draft.sheet.schema.id;
    $('creator-rules').replaceChildren(...M.BUILTIN_TEMPLATES.map(item => {
      const node = button('', () => chooseRule(item.id), 'creator-rule');
      node.setAttribute('aria-pressed', String(draft.systemId === item.id));
      node.append(el('span', { class: 'creator-rule-tag', text: item.tag }), el('strong', { text: item.name }), el('small', { text: item.id === 'bear-mercenary' ? '八种职业原型 · 六项战斗属性' : item.id === 'universal' ? '选择你自己的角色模板' : item.id === 'freeform' ? '从身份与故事开始' : '带入此规则的初始属性' }));
      return node;
    }));
  }
  function selectArchetype(id) {
    if (id === archetype) return;
    if (id) draft = C.applyArchetype(draft, id, state(), archetype);
    else {
      const prior = P.list().find(item => item.id === archetype);
      for (const key of ['name', 'title', 'inventory']) if (draft[key] === prior?.[key]) draft[key] = '';
      if (draft.profile.background === prior?.background) draft.profile.background = '';
      draft.profile.occupation = ''; draft.category = 'uncategorized'; draft.skills = []; draft.abilities = Object.fromEntries(Object.keys(draft.abilities).map(key => [key, 0]));
    }
    archetype = id; pendingErrors.clear(); error(); syncIdentity(); renderBuild(); renderPreview();
  }
  function numeric(labelText, value, min, max, write, read, key) {
    const control = el('input', { type: 'number', step: 1, min, max, required: '', 'aria-label': labelText }); control.value = value;
    numbers.push(control);
    const feedback = el('small', { class: 'creator-number-error' });
    control.addEventListener('input', () => {
      const value = Number(control.value); control.setCustomValidity('');
      try {
        if (!control.value.trim() || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(labelText + '需要填写 ' + min + ' 至 ' + max + ' 的整数。');
        write(value); pendingErrors.delete(key); feedback.textContent = ''; error(); renderBudget(); renderPreview(); refreshAdjustments();
      } catch (problem) { control.setCustomValidity(problem.message); feedback.textContent = problem.message; pendingErrors.set(key, problem.message); }
    });
    const minus = button('−', () => change(-1), 'creator-adjust'), plus = button('+', () => change(1), 'creator-adjust');
    minus.setAttribute('aria-label', '减少' + labelText); plus.setAttribute('aria-label', '增加' + labelText);
    function change(delta) { control.value = read() + delta; control.dispatchEvent(new Event('input', { bubbles: true })); }
    adjustments.push({ control, plus, minus, min, max, read, ability: key.startsWith('ability:') });
    return el('div', { class: 'creator-number' }, el('span', { text: labelText }), el('div', { class: 'creator-number-control' }, minus, control, plus), el('small', { text: '范围 ' + min + '–' + max }), feedback);
  }
  function refreshAdjustments() {
    const budget = M.combatStatus(draft, state());
    adjustments.forEach(item => {
      item.minus.disabled = item.read() <= item.min; item.plus.disabled = item.read() >= item.max || !!(item.ability && budget && budget.remaining <= 0);
      item.plus.title = item.read() >= item.max ? '已达到单项上限' : item.ability && budget && budget.remaining <= 0 ? '点数已用完，先减少其他属性再增加' : '增加 1 点';
    });
  }
  function renderBudget() {
    const budget = M.combatStatus(draft, state()); $('creator-budget').hidden = !budget;
    if (!budget) return;
    const meter = el('progress', { max: Math.max(1, budget.total), value: budget.used, 'aria-label': '属性点使用进度' });
    $('creator-budget').replaceChildren(el('div', {}, el('strong', { text: '已分配 ' + budget.used + ' / ' + budget.total }), el('span', { text: '剩余 ' + budget.remaining + ' 点' })), meter,
      el('small', { text: budget.rules.provisional ? '试用分配规则 · 每增加 1 点属性消耗 1 点预算' : '当前世界分配规则 · 每增加 1 点属性消耗 1 点预算' }));
  }
  function renderBuild() {
    destroyEditor(); numbers = []; adjustments = [];
    const bear = draft.systemId === 'bear-mercenary', modular = draft.systemId === 'universal', rule = template();
    $('creator-build-title').textContent = bear ? '选择职业，分配能力。' : modular ? '填入你的模板字段。' : '设定角色的能力。';
    $('creator-build-copy').textContent = bear ? '职业原型会准备好属性、技能、装备与故事。选好后，用加减按钮微调即可。' : modular ? '按所选模板填写。完成后，每个角色都会保存独立的规则快照。' : '已带入所选规则的初始值。你可以直接使用，或按本团采用的建卡方式调整。';
    $('creator-archetypes').hidden = !bear;
    if (bear) {
      const custom = button('', () => selectArchetype(''), 'creator-archetype creator-custom');
      custom.setAttribute('aria-pressed', String(!archetype)); custom.append(el('span', { class: 'creator-class-icon', text: '✦', 'aria-hidden': 'true' }), el('strong', { text: '自由构筑' }), el('small', { text: '自己决定角色的定位' }));
      $('creator-archetypes').replaceChildren(...P.list().map(item => {
        const node = button('', () => selectArchetype(item.id), 'creator-archetype'); node.dataset.archetype = item.id; node.setAttribute('aria-pressed', String(archetype === item.id));
        node.append(el('span', { class: 'creator-class-icon', text: ICONS[item.category], 'aria-hidden': 'true' }), el('strong', { text: item.occupation }), el('small', { text: item.title })); return node;
      }), custom);
    }
    const tools = $('creator-build-tools'); tools.replaceChildren();
    if (bear) {
      const distribute = id => { draft.abilities = C.allocate(state(), id); pendingErrors.clear(); error(); renderBuild(); renderPreview(); };
      tools.append(button('推荐分配', () => distribute(archetype), 'button-outline'), button('均衡分配', () => distribute(''), 'button-quiet'), button('清空点数', () => { draft.abilities = Object.fromEntries(Object.keys(draft.abilities).map(key => [key, 0])); pendingErrors.clear(); error(); renderBuild(); renderPreview(); }));
    } else if (rule.abilities.length || rule.resources.length) {
      tools.append(button('恢复模板初始值', () => { draft.abilities = Object.fromEntries(rule.abilities.map(item => [item.key, item.value])); draft.resources = Object.fromEntries(rule.resources.map(item => [item.key, { value: item.value, max: item.value }])); pendingErrors.clear(); error(); renderBuild(); renderPreview(); }, 'button-outline'));
    }
    renderBudget();
    $('creator-abilities').replaceChildren(...rule.abilities.map(item => numeric(item.label, draft.abilities[item.key], item.min, bear ? state().combatRules.maxima[item.key] : item.max, value => {
      const candidate = clone(draft); candidate.abilities[item.key] = value; M.assertCombatChange(null, candidate, state()); draft.abilities[item.key] = value;
    }, () => draft.abilities[item.key], 'ability:' + item.key)));
    $('creator-resources').replaceChildren(...rule.resources.flatMap(item => ['value', 'max'].map(key => numeric(item.label + (key === 'value' ? '当前值' : '上限'), draft.resources[item.key][key], 0, 999999, value => { draft.resources[item.key][key] = value; }, () => draft.resources[item.key][key], 'resource:' + item.key + ':' + key))));
    $('creator-universal').replaceChildren();
    if (modular) universalView = root.TavernUniversalUI.mount($('creator-universal'), draft, { mode: 'creation', onChange: () => renderPreview(), onValidityChange: errors => { pendingErrors.delete('universal'); if (errors.length) pendingErrors.set('universal', errors.join('；')); } });
    $('creator-build-note').textContent = bear ? '点数用完后，先减少其他属性再增加。技能从 0 起，建档后可编辑。' : modular ? '必填但尚未填写的内容会在确认页提醒，也可以建档后继续补充。' : rule.abilities.length ? '这里记录规则字段，不自动认证完整构筑。职业能力与建卡细节以本团采用的规则版本为准。' : '这张卡以身份与故事为主，可以直接进入下一步。';
    refreshAdjustments();
  }
  function syncIdentity() {
    $('create-name').value = draft.name; $('creator-title-text').value = draft.title;
    for (const key of ['occupation', 'background', 'player', 'age']) $('creator-' + key).value = draft.profile[key];
    $('creator-inventory').value = draft.inventory; $('create-category').value = draft.category; $('creator-role').value = draft.role;
    $('create-form').elements.worldEnabled.checked = draft.worldEnabled;
    $('creator-world').hidden = !draft.worldEnabled;
    $('creator-world').replaceChildren(...state().world.fields.map(item => {
      const control = el('input', { maxlength: M.LIMITS.text, 'aria-label': item.label }); control.value = draft.world[item.id] || '';
      control.addEventListener('input', () => { draft.world[item.id] = control.value; renderPreview(); });
      return el('label', { class: 'field' }, el('span', { text: item.label }), control);
    }));
    $('creator-remove-portrait').hidden = !draft.portrait;
  }
  function renderPreview() {
    if (!draft) return;
    const rule = template(), bear = draft.systemId === 'bear-mercenary';
    const portrait = el('div', { class: 'creator-portrait', 'aria-hidden': 'true' });
    if (draft.portrait) portrait.append(el('img', { src: draft.portrait, alt: '' }));
    else portrait.append(el('span', { class: 'creator-portrait-ring' }), el('span', { class: 'creator-portrait-emblem', text: ICONS[draft.category] || '✦' }));
    const expand = button(previewExpanded ? '收起预览 ↑' : '展开预览 ↓', () => { previewExpanded = !previewExpanded; renderPreview(); }, 'creator-preview-toggle');
    expand.setAttribute('aria-expanded', String(previewExpanded)); expand.setAttribute('aria-controls', 'creator-preview-content');
    const entries = rule.abilities.map(item => ({ label: item.label, value: draft.abilities[item.key] }));
    if (draft.sheet) draft.sheet.schema.modules.filter(item => !item.hidden).forEach(module => module.fields.filter(item => !item.private && ['number', 'resource', 'formula'].includes(item.type)).forEach(item => {
      try { const value = item.type === 'formula' ? U.evaluateField(draft.sheet, item.id) : draft.sheet.values[item.id]; entries.push({ label: item.label, value: item.type === 'resource' ? value.value + ' / ' + value.max : value }); } catch (_) { entries.push({ label: item.label, value: '—' }); }
    }));
    const budget = M.combatStatus(draft, state());
    const content = el('div', { class: 'creator-preview-content', id: 'creator-preview-content' }, portrait,
      el('p', { class: 'creator-preview-title', text: draft.title || '一段新的冒险，正等你开启。' }),
      entries.length ? el('dl', { class: 'creator-preview-stats' }, ...entries.slice(0, 12).map(item => el('div', {}, el('dt', { text: item.label }), el('dd', { text: String(item.value ?? '—') })))) : null,
      budget ? el('p', { class: 'creator-preview-budget', text: '属性点 ' + budget.used + ' / ' + budget.total + ' · 剩余 ' + budget.remaining }) : null,
      el('div', { class: 'creator-preview-story' }, el('span', { text: '角色背景' }), el('p', { text: draft.profile.background || '选择职业原型，或在身份步骤写下你的故事。' })),
      draft.skills.length ? el('div', { class: 'creator-preview-skills' }, ...draft.skills.map(item => el('span', { text: item.name }))) : null,
      draft.inventory ? el('div', { class: 'creator-preview-story' }, el('span', { text: '随身装备' }), el('p', { text: draft.inventory })) : null,
      el('p', { class: 'creator-preview-footnote', text: bear ? '熊酒馆 · 佣兵登记处' : draft.sheet?.schema.name || rule.name }));
    $('creator-preview').classList.toggle('is-expanded', previewExpanded);
    $('creator-preview').replaceChildren(el('div', { class: 'creator-preview-heading' }, el('div', {}, el('span', { class: 'creator-preview-kicker', text: 'CHARACTER / 角色预览' }), el('h3', { id: 'creator-preview-name', text: draft.name || '未命名的冒险者' }), el('p', { text: (draft.profile.occupation || '身份待定') + ' · ' + label(M.CATEGORIES, draft.category) })), expand), content);
  }
  function renderReview() {
    const rule = template(), budget = M.combatStatus(draft, state());
    const row = (title, content, index) => { const node = button('', () => go(index), 'creator-review-row'); node.append(el('span', { text: title }), el('strong', { text: content }), el('small', { text: '修改 ↗' })); return node; };
    $('creator-review').replaceChildren(row('冒险规则', rule.name + (draft.sheet ? ' · ' + draft.sheet.schema.name : ''), 0), row('职业与能力', (draft.profile.occupation || '自由角色') + (budget ? ' · 已分配 ' + budget.used + ' / ' + budget.total + ' 点' : ' · ' + (draft.sheet ? draft.sheet.schema.modules.length + ' 个模块' : rule.abilities.length + ' 项属性')), 1), row('身份与故事', draft.name + ' · ' + label(M.ROLES, draft.role) + ' · ' + label(M.CATEGORIES, draft.category), 2), row('世界观', draft.worldEnabled ? state().world.name : '独立角色档案', 0));
    const notes = [];
    if (budget?.remaining) notes.push('还剩 ' + budget.remaining + ' 点可以分配，允许先建档、以后继续调整。');
    if (!draft.profile.background) notes.push('背景尚未填写，可以建档后继续完善。');
    if (draft.sheet) notes.push(...U.validateSheet(draft.sheet));
    $('creator-review-notes').replaceChildren(el('strong', { text: notes.length ? '可以继续完善的内容' : '准备就绪' }), el('p', { text: notes.length ? notes.join('；') : '角色将在确认后加入档案，所有选择都可以继续编辑。' }));
  }
  function initialize(options) {
    hooks = options; $('creator-role').replaceChildren(...M.ROLES.map(item => new Option(item.label, item.id)));
    for (const [id, text] of [['create-name', '新角色名字'], ['create-category', '新角色分类'], ['creator-role', '新角色类型'], ['creator-background', '新角色背景'], ['creator-inventory', '新角色装备与随身物品'], ['creator-player', '新角色玩家'], ['creator-age', '新角色年龄'], ['creator-portrait', '新角色头像']]) $(id).setAttribute('aria-label', text);
    $('create-system').addEventListener('change', () => chooseRule($('create-system').value));
    $('create-sheet-template').addEventListener('change', () => setTemplate($('create-sheet-template').value));
    $('creator-next').addEventListener('click', () => go(step + 1)); $('creator-back').addEventListener('click', () => go(step - 1));
    for (const [id, key] of [['create-name', 'name'], ['creator-title-text', 'title'], ['creator-inventory', 'inventory'], ['create-category', 'category'], ['creator-role', 'role']]) {
      $(id).addEventListener(id === 'create-category' || id === 'creator-role' ? 'change' : 'input', () => { if (!draft) return; draft[key] = $(id).value; written.add(key); error(); renderPreview(); });
    }
    for (const key of ['occupation', 'background', 'player', 'age']) $('creator-' + key).addEventListener('input', () => { if (!draft) return; draft.profile[key] = $('creator-' + key).value; written.add('profile.' + key); renderPreview(); });
    $('create-form').elements.worldEnabled.addEventListener('change', () => { if (!draft) return; draft.worldEnabled = $('create-form').elements.worldEnabled.checked; $('creator-world').hidden = !draft.worldEnabled; renderPreview(); });
    $('creator-remove-portrait').addEventListener('click', () => { session++; portraitPending = false; draft.portrait = ''; $('creator-portrait').value = ''; $('creator-remove-portrait').hidden = true; updateStep(false); renderPreview(); });
    $('creator-portrait').addEventListener('change', async event => {
      const file = event.target.files[0]; if (!file || !draft) return;
      const token = ++session; portraitPending = true; updateStep(false); error();
      try {
        if (file.size > M.LIMITS.portraitBytes) throw new Error('头像不能超过 1 MB。');
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('请选择 PNG、JPEG 或 WebP 图片。');
        const uri = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('头像读取失败。')); reader.readAsDataURL(file); });
        if (token !== session || !$('create-dialog').open) return;
        const candidate = clone(draft); candidate.portrait = uri; M.normalizeState({ ...state(), cards: [candidate] });
        draft.portrait = uri; $('creator-remove-portrait').hidden = false; renderPreview();
      } catch (problem) { if (token === session) { error(problem.message); $('creator-portrait').value = ''; } }
      finally { if (token === session) { portraitPending = false; updateStep(false); } }
    });
    $('create-form').addEventListener('submit', async event => {
      event.preventDefault();
      if (step !== 3) { go(step + 1); return; }
      if (committing || portraitPending || !validate(3)) return;
      committing = true; $('creator-submit').disabled = true;
      try { const card = C.finish(draft, state()); const openAI = $('creator-ai-after').checked; await hooks.commit(card, openAI); }
      catch (problem) { error(problem.message); }
      finally { committing = false; $('creator-submit').disabled = false; }
    });
    $('create-dialog').addEventListener('close', () => {
      session++; portraitPending = false; destroyEditor(); draft = null; drafts.clear(); pendingErrors.clear(); numbers = []; adjustments = [];
      for (const id of ['creator-abilities', 'creator-resources', 'creator-universal', 'creator-world', 'creator-preview', 'creator-review']) $(id).replaceChildren();
    });
  }
  function begin(systemId, category) {
    session++; portraitPending = false; drafts.clear(); pendingErrors.clear(); written.clear(); previewExpanded = false; step = 0; archetype = '';
    draft = M.createCard(systemId, state());
    if (systemId === 'bear-mercenary') { archetype = 'starter-shieldguard'; draft = C.applyArchetype(draft, archetype, state()); }
    if (category && category !== 'uncategorized') draft.category = category;
    if (systemId === 'universal') draft.sheet = U.createSheet(hooks.sheetTemplates().find(item => item.id === $('create-sheet-template').value) || hooks.sheetTemplates()[0]);
    $('create-system').value = systemId; $('creator-ai-after').checked = false; $('creator-portrait').value = ''; $('creator-extra')?.removeAttribute('open');
    error(); renderRules(); syncIdentity(); renderBuild(); renderPreview(); updateStep(false);
  }
  root.TavernCharacterCreatorUI = Object.freeze({ initialize, begin, setTemplate });
})(window);
