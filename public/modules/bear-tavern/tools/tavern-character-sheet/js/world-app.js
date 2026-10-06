(function () {
  'use strict';
  const W = window.TavernWorld, WA = window.TavernWorldAI, M = window.TavernCharacterModel, C = window.TavernCharacterCreator, U = window.TavernUniversal, P = window.TavernCharacterPresets, AI = window.TavernCharacterAI, API = window.TavernLibrary;
  const $ = id => document.getElementById(id), params = new URLSearchParams(location.search), SETTINGS = 'bearTavern.characters.ai.settings.v1', BACKUP = 'bearTavern.world.draft.v1:';
  let world, step = 0, record = null, pending = null, flight = null, failed = null, problem = null, saveTimer, aiController, aiEpoch = 0, changes = [], publishRequest = null, recovery = null, listPage = 1, listEpoch = 0, connected = false;
  let settings = { provider: 'ollama', ollama: { baseUrl: 'http://127.0.0.1:11434', model: '' }, api: { baseUrl: '', model: '' } }, apiKey = '';
  try { const saved = JSON.parse(localStorage.getItem(SETTINGS)); if (saved && ['ollama', 'api'].includes(saved.provider)) settings = { ...settings, ...saved }; } catch (_) {}
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (value !== undefined) node.setAttribute(key, String(value));
    }
    children.flat().forEach(child => { if (child != null) node.append(typeof child === 'string' ? document.createTextNode(child) : child); }); return node;
  };
  const button = (name, action, cls = 'button-quiet') => el('button', { type: 'button', class: cls, text: name, onclick: action });
  const link = (name, href, cls = 'button-outline') => el('a', { text: name, href, class: cls });
  const read = path => path.reduce((v, k) => v[k], world);
  function error(e) { $('world-error').textContent = e.message || e; $('world-error').hidden = false; }
  function clearError() { $('world-error').hidden = true; }
  function download(value, name, mime = 'application/json') {
    const url = URL.createObjectURL(new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], { type: mime + ';charset=utf-8' }));
    const a = el('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  const fileName = suffix => (world?.seed.name || '世界草稿').replace(/[\\/:*?"<>|]/g, '_') + suffix;
  function draftPackage(w = world, s = step) { return { format: 'bear-tavern-world', version: 1, world: W.normalize(w), step: s }; }
  function backup() {
    try { localStorage.setItem(BACKUP + (record?.id || 'new'), JSON.stringify({ ...draftPackage(), revision: record?.revision || 0, updatedAt: new Date().toISOString() })); } catch (_) { $('world-save-status').textContent = '浏览器副本不可用，请下载草稿留存'; }
  }
  function saveStatus(text, retry = false) { $('world-save-status').textContent = text; $('world-save-retry').hidden = !retry; }
  function schedule() {
    backup(); publishRequest = null; clearTimeout(saveTimer);
    saveStatus(problem ? '后台未保存 · 可下载草稿' : '等待保存…', !!problem);
    saveTimer = setTimeout(() => { queueSave(); }, 550); outline();
  }
  function queueSave() {
    clearTimeout(saveTimer); saveTimer = null;
    if (!connected || !world) return;
    try { pending = JSON.stringify({ world: W.normalize(world), step }); } catch (e) { saveStatus('有字段需要调整，草稿尚未保存'); error(e); return; }
    if (record && pending === JSON.stringify({ world: record.world, step: record.step }) && !failed && !flight) {
      pending = null; saveStatus('已保存到本机'); return;
    }
    if (!flight && !problem) flight = drain();
  }
  async function drain() {
    try {
      while (failed || pending) {
        const item = failed || { path: record ? '/worlds/' + record.id : '/worlds', body: { requestId: crypto.randomUUID(), ...JSON.parse(pending), ...(record ? { revision: record.revision } : {}) } };
        if (!failed) pending = null;
        failed = item; saveStatus('保存中…');
        const result = await API.request(item.path, item.body);
        record = result; failed = null; problem = null;
        if (pending === JSON.stringify({ world: result.world, step: result.step })) pending = null;
        params.set('world', record.id); params.delete('new'); params.delete('source'); history.replaceState(null, '', './world.html?' + params);
        try { localStorage.removeItem(BACKUP + 'new'); } catch (_) {}
        backup();
      }
      saveStatus('已保存到本机 · ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) { problem = e; saveStatus(e.status === 409 ? '版本冲突 · 请下载草稿后重新加载' : '保存失败 · 草稿保留在本页', true); error(e); }
    finally { flight = null; }
  }
  async function flush() {
    W.normalize(world);
    queueSave(); if (problem) { if (problem.status === 409) throw problem; problem = null; if (!flight) flight = drain(); }
    while (flight) await flight;
    if (problem) throw problem;
    if (pending || failed) { flight = drain(); await flight; if (problem) throw problem; }
  }
  function edit(path, value) {
    clearError();
    const target = path.slice(0, -1).reduce((v, k) => v[k], world); target[path.at(-1)] = value;
    aiEpoch++; if (aiController) cancelAI('设定已修改，已停止本次生成。'); schedule();
  }
  function field(label, path, options = {}) {
    const input = el(options.options ? 'select' : options.rows ? 'textarea' : 'input', { id: options.id || 'world-field-' + path.join('-'), ...(options.options ? {} : { type: options.type || 'text' }), ...(options.rows ? { rows: options.rows } : { }), ...(options.options ? {} : { maxlength: options.maxLength || (path.at(-1) === 'name' ? 100 : 6000) }), placeholder: options.placeholder, min: options.min, max: options.max, step: options.type === 'number' ? 1 : undefined });
    if (options.options) for (const [value, name] of options.options) input.append(el('option', { value, text: name }));
    input.value = read(path) ?? '';
    input.addEventListener(options.options ? 'change' : 'input', () => {
      edit(path, options.type === 'number' ? Number(input.value) : input.value); if (options.after) options.after(input.value);
    });
    const node = el('label', { class: 'field' }, label, input); if (options.hint) node.append(el('small', { class: 'field-hint', text: options.hint })); return node;
  }
  function stepsNav() {
    const checks = W.checklist(world);
    $('world-steps').replaceChildren(...W.steps.map((s, i) => {
      const relevant = checks.filter(c => c.step === i), done = (relevant.length > 0 && relevant.every(c => c.done)) || (i === 8 && record?.status === 'ready');
      const b = button('', () => go(i), 'world-step'); b.setAttribute('aria-label', s.title); b.setAttribute('aria-current', i === step ? 'step' : 'false'); b.dataset.done = done;
      b.append(el('b', { text: done && i !== step ? '✓' : String(i + 1) }), el('span', { text: s.title })); return b;
    }));
  }
  function outline() {
    if (!world) return;
    $('world-rail-name').textContent = world.seed.name || '让想象成为一次冒险。';
    const nodes = [el('h3', { text: world.seed.name || '一个等待命名的世界' }), el('p', { text: world.seed.intro || '你的一句话，会成为这片世界的种子。' })];
    for (const type of ['places', 'civilizations', 'factions', 'characters']) nodes.push(el('div', { class: 'world-outline-block' }, el('h4', { text: W.steps.find(s => s.id === type).title + ' · ' + world[type].filter(i => i.name).length }), ...world[type].filter(i => i.name).slice(0, 6).map(row => el('small', { text: row.name }))));
    nodes.push(el('div', { class: 'world-outline-block' }, el('h4', { text: M.getTemplates(world.meta).find(t => t.id === world.rules.systemId)?.name }), el('small', { text: world.rules.players + ' 位玩家 · ' + world.rules.style })));
    if (record?.libraryId) nodes.push(link('打开这个世界的角色库 ↗', './library.html?library=' + record.libraryId, ''));
    $('world-outline-body').replaceChildren(...nodes); stepsNav();
  }
  function resetAI() { cancelAI(''); changes = []; $('world-ai-preview').hidden = true; $('world-ai-status').textContent = ''; }
  function go(index) { try { W.normalize(world); resetAI(); step = index; render(); schedule(); $('world-stage-title').focus({ preventScroll: false }); } catch (e) { error(e); } }
  function renderSeed(container) {
    const grid = el('div', { class: 'world-inspirations', role: 'group', 'aria-label': '世界灵感' });
    grid.append(...W.inspirations.map(p => {
      const b = button('', () => { world = W.choose(world, p.id); resetAI(); render(); schedule(); }, 'world-inspiration'); b.setAttribute('aria-pressed', world.inspiration === p.id);
      b.append(el('span', { class: 'mark', text: p.mark, 'aria-hidden': true }), el('strong', { text: p.name }), el('small', { text: p.hint })); return b;
    }));
    container.append(grid, field('给世界取个名字', ['seed', 'name'], { placeholder: '例如：北境余烬' }), field('你的世界是什么样的？', ['seed', 'intro'], { rows: 5, placeholder: '最特别的居民、一条独特的法则，或者一件正在发生的事。' }), el('p', { class: 'field-hint', text: '灵感是一份可改写的起点。稍后每一步都可以手动填写，或让模型帮你展开。' }));
  }
  function linkedFields(type, index) {
    const mapping = { placeId: ['places', '所在地点'], civilizationId: ['civilizations', '所属文明'], factionId: ['factions', '所属势力'] };
    return el('div', { class: 'world-links' }, ...W.refs[type].map(k => {
      const [collection, label] = mapping[k];
      return field(label, [type, index, k], { options: [['', '稍后选择'], ...world[collection].map((row, i) => [row.id, row.name || '第 ' + (i + 1) + ' 项（尚未命名）'])] });
    }));
  }
  function stats(row, index) {
    const details = el('details'), grid = el('div', { class: 'world-attribute-grid' }), budget = el('p', { class: 'world-budget' });
    const values = row.abilities || C.allocate(world.meta, row.archetype);
    for (const a of M.BUILTIN_TEMPLATES[0].abilities) {
      const input = el('input', { type: 'number', min: 0, max: world.meta.combatRules.maxima[a.key], step: 1, 'aria-label': row.name + ' · ' + a.label }); input.value = values[a.key];
      input.addEventListener('input', () => { if (!row.abilities) row.abilities = { ...values }; edit(['characters', index, 'abilities', a.key], Number(input.value)); showBudget(); });
      grid.append(el('label', { class: 'field' }, a.label + ' / ' + world.meta.combatRules.maxima[a.key], input));
    }
    function showBudget() {
      try { const status = M.combatStatus({ systemId: 'bear-mercenary', abilities: row.abilities || values }, world.meta); budget.textContent = '已用 ' + status.used + ' / ' + status.total + ' 点 · ' + (status.valid ? '剩余 ' + status.remaining + ' 点' : status.issues.join('；')); budget.classList.toggle('form-error', !status.valid); }
      catch (e) { budget.textContent = e.message; budget.classList.add('form-error'); }
    }
    showBudget(); details.append(el('summary', { text: '战斗属性 · 按职业自动分配，可手动调整' }), grid, budget, button('重新按职业分配点数', () => { edit(['characters', index, 'abilities'], null); resetAI(); render(); }, 'button-outline')); return details;
  }
  function renderCollection(container, type) {
    if (type === 'characters' && record?.status === 'ready') {
      container.append(el('p', { class: 'world-review-summary', text: '角色已经成为独立档案。请打开角色卡继续调整身份、属性与故事；世界创建时的角色草案保留在世界档案中。' }), link('管理这个世界的全部角色 ↗', './library.html?library=' + record.libraryId, 'button-primary'));
      for (const row of world.characters) container.append(el('section', { class: 'world-record' }, el('h3', { text: row.name }), link('打开角色卡 ↗', './?library=' + record.libraryId + '&card=' + record.links[row.id]))); return;
    }
    world[type].forEach((row, i) => {
      const remove = button('移除此项', () => { world = W.remove(world, type, row.id); resetAI(); render(); schedule(); });
      if (record?.status === 'ready') { remove.disabled = true; remove.title = '已建库的关联设定保留，避免破坏角色引用；可以继续修改内容或添加设定。'; }
      const box = el('section', { class: 'world-record' }, el('div', { class: 'world-record-heading' }, el('h3', { text: (i + 1) + ' / ' + (row.name || '等待命名') }), remove));
      if (type === 'characters') {
        box.append(el('div', { class: 'world-field-grid' }, field('角色类型', [type, i, 'role'], { options: M.ROLES.map(r => [r.id, r.label]) }), ...(world.rules.systemId === 'bear-mercenary' ? [field('佣兵职业原型', [type, i, 'archetype'], { options: P.list().map(p => [p.id, p.occupation]), after: () => { row.abilities = null; resetAI(); render(); schedule(); } })] : [])));
      }
      for (const [key, label] of Object.entries(W.specs[type])) {
        if (key === 'secret') continue;
        box.append(field(label, [type, i, key], { rows: ['description', 'hook', 'background', 'motivation', 'inventory', 'relationship', 'values', 'customs'].includes(key) ? 3 : undefined, placeholder: key === 'name' ? '先给它一个名字' : '可以先留白，在下方生成建议' }));
      }
      box.append(linkedFields(type, i));
      if (type === 'characters') {
        if (world.rules.systemId === 'bear-mercenary') box.append(stats(row, i));
        box.append(el('details', {}, el('summary', { text: '主持人秘密（玩家资料不包含）' }), field('角色秘密', [type, i, 'secret'], { rows: 3, hint: '不会自动发送给 AI。' })));
      }
      box.append(button('✦ 只生成这一项', () => generate(row.id), 'button-outline')); container.append(box);
    });
    const add = button('＋ 添加' + ({ places: '地点', civilizations: '文明', factions: '势力', characters: '角色' }[type]), () => { world[type].push(W.blank(type)); resetAI(); render(); schedule(); }, 'button-outline world-add'); add.disabled = world[type].length >= 24; container.append(add, el('p', { class: 'field-hint', text: '创建阶段每组最多 24 项。角色库建立后可继续批量扩展更多角色。移除地点或势力会解除相关引用，已有角色内容保留。' }));
  }
  function renderRules(container) {
    if (record?.status === 'ready') { container.append(el('p', { class: 'world-review-summary', text: '这个世界已建立角色库，规则与属性上限由角色库统一管理。' }), link('打开角色库规则与世界设定 ↗', './?library=' + record.libraryId + '&settings=1', 'button-primary')); return; }
    container.append(field('使用哪一套角色规则？', ['rules', 'systemId'], { options: M.getTemplates(world.meta).map(t => [t.id, t.name]), after: () => { world.characters.forEach(row => { row.abilities = null; }); resetAI(); render(); schedule(); } }));
    if (world.rules.systemId === 'universal') container.append(field('通用角色模板', ['rules', 'templateId'], { options: [...U.getBuiltinTemplates(), ...world.meta.sheetTemplates].map(t => [t.id, t.name]) }));
    container.append(el('div', { class: 'world-field-grid' }, field('参与玩家数量', ['rules', 'players'], { type: 'number', min: 1, max: 30 }), field('这张桌的玩法倾向', ['rules', 'style'], { options: ['剧情与战斗并重', '重角色扮演', '探索与解谜', '战术战斗', '自由沙盒'].map(v => [v, v]) })));
    if (world.rules.systemId === 'bear-mercenary') {
      container.append(field('战斗属性总点数预算', ['meta', 'combatRules', 'total'], { type: 'number', min: 0, max: 5994 }));
      const grid = el('div', { class: 'world-attribute-grid' });
      for (const a of M.BUILTIN_TEMPLATES[0].abilities) grid.append(field(a.label + '最大值', ['meta', 'combatRules', 'maxima', a.key], { type: 'number', min: 0, max: 999 })); container.append(grid);
      container.append(el('p', { class: 'world-budget', text: '每增加 1 点消耗 1 点预算，六项直接相加。职业原型按当前上限自动分配；手动属性超过上限时会阻止建库。默认 100 点 / 单项 30 是可调整的试用桌规。' }));
    }
    container.append(el('p', { class: 'field-hint', text: 'CoC、D&D 与自定义规则会带入相应角色模板；生成的叙事内容是草案，规则细节和非佣兵属性可在建库后继续完善。' }));
  }
  function renderReview(container) {
    const checks = W.checklist(world), ready = record?.status === 'ready';
    container.append(el('p', { class: 'world-review-summary', text: world.seed.intro || '世界构想尚未填写。' }), el('div', { class: 'world-checklist' }, ...checks.map(check => { const b = button((check.done ? '✓ ' : '○ ') + check.label, () => go(check.step)); b.dataset.done = check.done; return b; })));
    if (ready) {
      container.append(el('div', { class: 'world-publish' }, el('h3', { text: '世界已经建立，冒险可以开始。' }), el('p', { class: 'field-hint', text: '世界设定可继续编辑；角色与规则请在独立角色库里调整。再次打开世界不会重复创建档案。' }), link('进入这个世界的角色库 →', './library.html?library=' + record.libraryId, 'button-primary')));
    } else {
      const b = button('建立世界与 ' + world.characters.length + ' 份角色档案 →', publish, 'button-primary'); b.id = 'world-publish'; b.disabled = checks.some(c => !c.done);
      container.append(el('div', { class: 'world-publish' }, b, el('p', { class: 'field-hint', text: '会建立一个独立角色库，带入本世界规则、角色关联与秘密备注。所有创建会一并保存，原有角色库继续保留。' })));
    }
    container.append(el('h3', { text: '准备开团资料' }), el('p', { class: 'field-hint', text: '主持人资料包含完整世界设定与创作时的角色草案；玩家资料只包含公开介绍、角色身份、开场与初始目标，不包含秘密、线索或幕后计划。完整 JSON 包还包含已建立的开场角色当前档案。' }), el('div', { class: 'world-ready-links' }, button('主持人手册 · Markdown', () => exportWorld('gm', false), 'button-outline'), button('玩家简介 · Markdown', () => exportWorld('player', false), 'button-outline'), button('完整世界与角色 · JSON', () => exportWorld('gm', true), 'button-outline')));
  }
  function render() {
    $('world-list').hidden = true; $('world-workspace').hidden = false;
    const stage = W.steps[step], container = $('world-stage-fields'); container.replaceChildren();
    $('world-stage-number').textContent = String(step + 1).padStart(2, '0') + ' / ' + String(W.steps.length).padStart(2, '0');
    $('world-stage-title').textContent = stage.title; $('world-stage-hint').textContent = stage.hint;
    if (step === 0) renderSeed(container);
    else if (step === 1) for (const [k, label] of Object.entries(W.specs.foundation)) container.append(field(label, ['foundation', k], { rows: ['laws', 'boundaries', 'history'].includes(k) ? 3 : undefined }));
    else if (W.refs[stage.id]) renderCollection(container, stage.id);
    else if (stage.id === 'rules') renderRules(container);
    else if (stage.id === 'adventure') for (const [k, label] of Object.entries(W.specs.adventure)) container.append(field(label, ['adventure', k], { rows: k === 'title' ? undefined : 3, hint: k === 'gmNotes' ? '仅供主持人，不会发送给 AI 或包含在玩家简介中。' : undefined }));
    else renderReview(container);
    $('world-ai-box').hidden = ['rules', 'review'].includes(stage.id) || (stage.id === 'characters' && record?.status === 'ready');
    $('world-prev').hidden = step === 0; $('world-next').hidden = step === W.steps.length - 1;
    $('world-progress-label').textContent = '第 ' + (step + 1) + ' / ' + W.steps.length + ' 步'; providerLabel(); outline();
  }
  async function publish() {
    const b = $('world-publish'); if (b?.disabled) return; if (b) b.disabled = true; clearError();
    try {
      W.finish(world); await flush();
      if (!publishRequest) publishRequest = { requestId: crypto.randomUUID(), revision: record.revision };
      record = await API.request('/worlds/' + record.id + '/publish', publishRequest); publishRequest = null; backup(); resetAI(); render(); saveStatus('世界与角色库已建立');
    } catch (e) { error(e); if (b) b.disabled = false; }
  }
  async function exportWorld(audience, json) {
    try {
      await flush(); const result = await API.request('/worlds/' + record.id + '/export?audience=' + audience);
      download(json ? result : result.markdown, fileName(audience === 'player' ? '-玩家简介.md' : json ? '-完整世界.json' : '-主持人手册.md'), json ? 'application/json' : 'text/markdown');
    } catch (e) { error(e); }
  }
  function providerLabel() {
    const config = settings[settings.provider]; $('world-ai-provider').textContent = (settings.provider === 'ollama' ? 'Ollama 本机模型' : 'API 模式') + ' · ' + (config?.model || '尚未选择模型');
  }
  function configFromForm() { return { provider: $('world-provider').value, baseUrl: $('world-base-url').value, model: $('world-model').value, apiKey: $('world-api-key').value }; }
  function providerForm() {
    const p = $('world-provider').value, config = settings[p]; $('world-base-url').value = config?.baseUrl || ''; $('world-model').value = config?.model || ''; $('world-key-wrap').hidden = p !== 'api';
  }
  function openSettings() { $('world-provider').value = settings.provider; providerForm(); $('world-api-key').value = apiKey; $('world-settings-status').textContent = ''; $('world-settings-dialog').showModal(); }
  function cancelAI(status = '已停止生成，现有内容保留。') { aiEpoch++; if (aiController) aiController.abort(); aiController = null; $('world-ai-generate').disabled = false; $('world-ai-cancel').hidden = true; $('world-ai-status').textContent = status; }
  async function generate(targetId) {
    if (aiController) return;
    resetAI(); clearError(); const generation = ++aiEpoch, controller = new AbortController(); aiController = controller;
    $('world-ai-generate').disabled = true; $('world-ai-cancel').hidden = false; $('world-ai-status').textContent = '正在展开设定，可随时停止…';
    const timer = setTimeout(() => controller.abort(), 180000);
    try {
      const config = AI.connection({ provider: settings.provider, ...settings[settings.provider], apiKey });
      if (!config.model) { openSettings(); throw new Error('请选择模型后再生成。'); }
      const description = WA.describe(world, step, targetId);
      const brief = $('world-ai-brief').value.trim() || '根据世界构想，生成“' + W.steps[step].title + '”中各字段的简洁中文草案。让角色与地点、文明、势力一致，并给冒险留下可玩的选择。';
      const content = await AI.generate(config, { ...description, fields: description.fields.map(f => ({ ...f, current: f.current.slice(0, 1000) })) }, brief, controller.signal);
      if (generation !== aiEpoch) return;
      const suggestions = WA.suggestions(content, description, world); changes = suggestions.changes;
      if (!changes.length) throw new Error('本次没有新的有效建议，请补充想法后重试。');
      $('world-ai-changes').replaceChildren(...changes.map(change => el('label', { class: 'world-suggestion' }, el('span', {}, el('input', { type: 'checkbox', value: change.id, ...(change.empty ? { checked: '' } : {}) }), el('strong', { text: change.label })), el('p', { text: change.after }), ...(change.before ? [el('details', {}, el('summary', { text: '查看已有内容（默认保留）' }), el('p', { text: change.before }))] : []))));
      $('world-ai-preview').hidden = false; $('world-ai-status').textContent = '生成了 ' + changes.length + ' 项建议。已有内容默认保留。' + (suggestions.warnings.length ? ' 部分无效建议已忽略。' : '');
    } catch (e) { if (generation === aiEpoch) $('world-ai-status').textContent = controller.signal.aborted ? '生成已超时或停止，内容未被改写。' : e.message; }
    finally { clearTimeout(timer); if (generation === aiEpoch) { aiController = null; $('world-ai-generate').disabled = false; $('world-ai-cancel').hidden = true; } }
  }
  async function home() {
    resetAI(); clearError();
    if (world && (saveTimer || pending || flight || failed)) { try { await flush(); } catch (_) { backup(); } }
    // Navigation remains on this page if a save failed, so the draft cannot be lost.
    if (problem) return;
    world = null; record = null; params.delete('world'); params.delete('new'); params.delete('source'); history.replaceState(null, '', './world.html');
    $('world-workspace').hidden = true; $('world-list').hidden = false; await loadList();
  }
  async function loadList() {
    const epoch = ++listEpoch;
    try {
      const result = await API.request('/worlds?page=' + listPage + '&query=' + encodeURIComponent($('world-search').value)); if (epoch !== listEpoch) return;
      $('world-list-items').replaceChildren(...result.items.map(row => el('article', { class: 'world-list-card' }, el('small', { text: row.status === 'ready' ? '世界已建立' : '世界草稿 · 第 ' + (row.step + 1) + ' 步' }), el('h2', { text: row.name || '未命名世界' }), el('p', { text: '最近保存 ' + new Date(row.updated_at).toLocaleString('zh-CN') }), link(row.status === 'ready' ? '查看世界 →' : '继续创建 →', './world.html?world=' + row.id, ''), ...(row.library_id ? [el('p', {}, link('角色库 ↗', './library.html?library=' + row.library_id, ''))] : []))));
      if (!result.items.length) $('world-list-items').append(el('p', { class: 'world-review-summary', text: '还没有匹配的世界。选一个灵感，开始第一场冒险。' }));
      const prev = button('← 上一页', () => { listPage--; loadList(); }, 'button-outline'), next = button('下一页 →', () => { listPage++; loadList(); }, 'button-outline'); prev.disabled = listPage <= 1; next.disabled = listPage * result.pageSize >= result.total;
      $('world-list-pages').replaceChildren(prev, el('span', { text: result.total + ' 个世界 · 第 ' + listPage + ' 页' }), next);
    } catch (e) { error(e); }
  }
  function checkRecovery(key) {
    try {
      const cached = JSON.parse(localStorage.getItem(BACKUP + key) || 'null');
      if (!cached || (record && JSON.stringify(cached.world) === JSON.stringify(record.world) && cached.step === record.step)) return;
      recovery = { ...cached, world: W.normalize(cached.world) }; $('world-recovery').hidden = false;
      $('recover-apply').disabled = !!record && (cached.revision !== record.revision || record.status === 'ready');
      if ($('recover-apply').disabled) $('world-recovery').querySelector('p').textContent = '浏览器草稿与后台版本不同。请下载草稿保留内容；导入可建立一个独立副本。';
    } catch (_) {}
  }
  async function start(imported, importedStep = 0) {
    resetAI(); record = null; pending = null; failed = null; problem = null; clearError();
    world = imported ? W.normalize(imported) : W.create(); step = Number.isInteger(importedStep) && importedStep >= 0 && importedStep <= 8 ? importedStep : 0;
    if (!imported && params.get('source')) { const source = await API.request('/libraries/' + encodeURIComponent(params.get('source')) + '/editor'); world = W.create(source.state); }
    params.set('new', '1'); params.delete('world'); history.replaceState(null, '', './world.html?' + params);
    render(); saveStatus('草稿尚未保存'); if (imported) schedule(); else checkRecovery('new');
  }
  $('world-home').addEventListener('click', () => home().catch(error));
  $('world-new').addEventListener('click', () => start().catch(error));
  $('world-prev').addEventListener('click', () => go(Math.max(0, step - 1))); $('world-next').addEventListener('click', () => go(Math.min(8, step + 1)));
  $('world-download').addEventListener('click', () => { try { download(draftPackage(), fileName('-世界草稿.json')); } catch (e) { error(e); } });
  $('world-save-retry').addEventListener('click', async () => { try { await flush(); clearError(); } catch (e) { error(e); } });
  $('world-ai-settings').addEventListener('click', openSettings); $('world-settings-close').addEventListener('click', () => $('world-settings-dialog').close());
  $('world-provider').addEventListener('change', providerForm);
  $('world-settings-form').addEventListener('submit', e => {
    e.preventDefault();
    try { const config = AI.connection(configFromForm()); settings.provider = config.provider; settings[config.provider] = { baseUrl: config.baseUrl, model: config.model }; apiKey = config.apiKey; localStorage.setItem(SETTINGS, JSON.stringify(settings)); providerLabel(); $('world-settings-dialog').close(); } catch (err) { $('world-settings-status').textContent = err.message; }
  });
  $('world-model-refresh').addEventListener('click', async () => {
    const b = $('world-model-refresh'); b.disabled = true; const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000); $('world-settings-status').textContent = '正在连接…';
    try { const names = await AI.models(configFromForm(), controller.signal); $('world-models').replaceChildren(...names.map(name => el('option', { value: name }))); if (!$('world-model').value && names.length) $('world-model').value = names[0]; $('world-settings-status').textContent = '已连接 · 找到 ' + names.length + ' 个模型'; } catch (e) { $('world-settings-status').textContent = controller.signal.aborted ? '连接超时，请检查模型服务。' : e.message; } finally { clearTimeout(timer); b.disabled = false; }
  });
  $('world-ai-generate').addEventListener('click', () => generate()); $('world-ai-cancel').addEventListener('click', () => cancelAI());
  $('world-ai-select').addEventListener('click', () => $('world-ai-changes').querySelectorAll('input[type=checkbox]').forEach(i => { i.checked = true; }));
  $('world-ai-apply').addEventListener('click', () => {
    try { const selected = Array.from($('world-ai-changes').querySelectorAll('input:checked')).map(i => i.value); world = WA.apply(world, changes, selected); const count = selected.length; resetAI(); render(); schedule(); $('world-ai-status').textContent = '已应用 ' + count + ' 项建议，可继续修改或进入下一步。'; } catch (e) { $('world-ai-status').textContent = e.message; }
  });
  let searchTimer; $('world-search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { listPage = 1; loadList(); }, 250); });
  $('world-import').addEventListener('change', async e => {
    try { const file = e.target.files[0]; if (!file) return; if (file.size > 4 * 1024 * 1024) throw new Error('世界草稿文件最大 4 MB。'); const data = JSON.parse(await file.text()); if (data.format !== 'bear-tavern-world' || data.version !== 1) throw new Error('请选择本系统导出的完整世界或世界草稿 JSON。'); await start(data.world, data.step); $('world-recovery').hidden = true; } catch (err) { error(err); } finally { e.target.value = ''; }
  });
  $('recover-download').addEventListener('click', () => { if (recovery) download(draftPackage(recovery.world, recovery.step), '未保存世界草稿.json'); });
  $('recover-apply').addEventListener('click', () => { if (!recovery || $('recover-apply').disabled) return; world = recovery.world; step = recovery.step; $('world-recovery').hidden = true; recovery = null; render(); schedule(); });
  $('recover-dismiss').addEventListener('click', () => { $('world-recovery').hidden = true; recovery = null; backup(); });
  window.addEventListener('beforeunload', e => { if (saveTimer || pending || flight || failed) { backup(); e.preventDefault(); e.returnValue = ''; } });
  async function boot() {
    try {
      await API.connect(); connected = true;
      if (params.get('world')) { record = await API.request('/worlds/' + encodeURIComponent(params.get('world'))); world = W.normalize(record.world); step = record.status === 'ready' ? 8 : record.step; render(); saveStatus('已读取本机世界档案'); checkRecovery(record.id); }
      else if (params.has('new') || params.has('source')) await start();
      else { $('world-list').hidden = false; await loadList(); }
    } catch (e) { error(e); $('world-error').append(el('p', { text: '请保持本机预览服务运行。已有世界不会被改写。' })); }
  }
  boot();
})();
