/* Original Bear Tavern character archive. All user text is rendered as text. */
(async function () {
  'use strict';
  const M = window.TavernCharacterModel;
  const P = window.TavernCharacterPresets;
  const U = window.TavernUniversal;
  const UI = window.TavernUniversalUI;
  const KEY = 'bearTavern.characters.v1';
  const UNDO_KEY = 'bearTavern.characters.cleanupUndo.v1';
  const $ = id => document.getElementById(id);
  let state = M.createState(), selectedId = null, view = 'active', tab = 'base', category = 'all';
  let saveTimer, toastTimer, pendingImport = null, confirmation = null;
  let storageLocked = false, damagedRaw = null, dirty = false;
  let draftWorldFields = [];
  let templateDraft = null, universalView = null;
  let management = false, pickedCards = new Set(), pickedTemplates = new Set(), undoBatch = null;
  let templateEditorCard = null, templateEditorView = null, editingTemplateId = null;
  let remote = null;
  const backendParams = new URLSearchParams(location.search);
  const tabletopEmbedded = backendParams.get('tabletop') === '1' && window.parent !== window;
  const startupButtons = [...document.querySelectorAll('button')].map(node => [node, node.disabled]);
  startupButtons.forEach(([node]) => { node.disabled = true; });

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (value !== null && value !== undefined) node.setAttribute(key, String(value));
    }
    children.flat().forEach(child => { if (child !== null && child !== undefined) node.append(typeof child === 'string' ? document.createTextNode(child) : child); });
    return node;
  }
  function button(text, action, className = 'button-quiet') { return el('button', { type: 'button', class: className, text, onclick: action }); }
  function templates() { return M.getTemplates(state); }
  function template(id) { return templates().find(item => item.id === id); }
  function current() { return state.cards.find(card => card.id === selectedId); }
  function categoryLabel(id) { return M.CATEGORIES.find(item => item.id === id)?.label || '未分类'; }
  function toast(message) {
    if (remote && dirty && !message.includes('失败') && !message.includes('请先') && !message.includes('不存在')) message = '更改已加入后台保存队列，完成状态见角色卡右上角。';
    $('toast').textContent = message; $('toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000);
  }
  function warn(message) { $('storage-warning').textContent = message; $('storage-warning').hidden = false; }
  function saveLabel(text) { const node = $('save-state'); if (node) node.textContent = text; }
  function persist() {
    clearTimeout(saveTimer);
    if (tabletopEmbedded) { dirty = false; saveLabel('草稿已更新 · 点击下方保存角色档案'); return true; }
    if (storageLocked) { saveLabel('仅保留于本次访问'); return false; }
    if (remote) {
      try { remote.enqueue(M.normalizeState(state)); return true; }
      catch (error) { dirty = true; warn('尚未保存到本机后台：' + error.message); saveLabel('尚未保存'); return false; }
    }
    try {
      const checked = M.normalizeState(state);
      localStorage.setItem(KEY, JSON.stringify(checked));
      dirty = false; $('storage-warning').hidden = true; saveLabel('已保存于此浏览器');
      return true;
    } catch (error) {
      dirty = true; saveLabel('尚未保存');
      warn('尚未保存：' + (error.name === 'QuotaExceededError' ? '浏览器存储空间不足，请减少头像大小或导出备份。' : error.message + '。可以导出备份保留当前数据。'));
      return false;
    }
  }
  function changed(card) {
    card.updatedAt = new Date().toISOString(); dirty = true; saveLabel('正在保存…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { persist(); renderDirectory(); }, 450);
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        try { state = M.normalizeState(JSON.parse(raw)); }
        catch (_) {
          damagedRaw = raw; storageLocked = true;
          warn('现有存档暂时无法读取，原始数据已保留。新的修改仅在本次访问中保存，请先下载原始存档并检查。');
          $('storage-warning').append(button('下载原始存档', () => download('熊酒馆-原始存档.json', damagedRaw)));
        }
      }
    } catch (_) { storageLocked = true; warn('浏览器不允许本地存储。数据仅保留于本次访问，请及时导出备份。'); }
    try { const undo = localStorage.getItem(UNDO_KEY); if (undo) undoBatch = M.normalizeState(JSON.parse(undo)); } catch (_) { undoBatch = null; }
    selectedId = state.cards.find(card => card.status === 'active')?.id || null;
  }
  function download(filename, data) {
    const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: filename }); document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function fileName(name) { return (name || '角色').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 70); }
  async function portableCard(card) {
    const copy = JSON.parse(JSON.stringify(card));
    if (/^\/api\/resources\/[a-f0-9]{64}$/.test(copy.portrait)) {
      const response = await fetch(copy.portrait, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('头像素材无法读取，请确认本机服务已启动。');
      const blob = await response.blob();
      copy.portrait = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
    }
    return copy;
  }
  async function exportBackup() {
    try {
      const copy = JSON.parse(JSON.stringify(state)); copy.cards = await Promise.all(state.cards.map(portableCard));
      download('熊酒馆-全部档案-' + new Date().toISOString().slice(0, 10) + '.json', { format: 'bear-tavern-archive', version: 1, state: copy });
      toast('备份已导出，包含全部角色、头像与秘密备注。');
    } catch (error) { toast(error.message); }
  }
  async function publicExport(card) {
    try {
      const copy = await portableCard(card);
      download(fileName(card.name) + '-玩家版.json', { format: 'bear-tavern-character', version: 1, card: M.toPlayerCard(copy, state), ruleTemplate: template(card.systemId), worldSchema: state.world, ...(card.systemId === 'bear-mercenary' ? { combatRules: state.combatRules } : {}) });
      toast('玩家版已导出，秘密备注已移除。');
    } catch (error) { toast(error.message); }
  }
  function openDialog(id) { $(id).showModal(); }
  function closeDialog(id) { $(id).close(); }
  function ask(title, message, action, actionText = '确认') {
    confirmation = action; $('confirm-title').textContent = title; $('confirm-message').textContent = message;
    $('confirm-action').textContent = actionText; openDialog('confirm-dialog');
  }
  function populateTemplates() {
    for (const id of ['create-system', 'import-system']) {
      const selected = $(id).value;
      $(id).replaceChildren(...templates().map(item => new Option(item.name, item.id)));
      if (template(selected)) $(id).value = selected;
    }
    const oldFilter = $('system-filter').value;
    $('system-filter').replaceChildren(new Option('全部规则', 'all'), ...templates().map(item => new Option(item.name, item.id)));
    if (oldFilter === 'all' || template(oldFilter)) $('system-filter').value = oldFilter;
    $('rail-world-name').textContent = state.world.name;
    const selectedCategory = $('create-category').value;
    $('create-category').replaceChildren(...M.CATEGORIES.map(item => new Option(item.label, item.id)));
    $('create-category').value = M.CATEGORIES.some(item => item.id === selectedCategory) ? selectedCategory : 'uncategorized';
    const chosen = $('create-sheet-template').value;
    $('create-sheet-template').replaceChildren(...sheetTemplates().map(item => new Option(item.name + ' · v' + item.version, item.id)));
    if (sheetTemplates().some(item => item.id === chosen)) $('create-sheet-template').value = chosen;
  }
  function sheetTemplates() { return [...U.getBuiltinTemplates(), ...(state.sheetTemplates || [])]; }
  function ruleHint() { $('create-rule-hint').textContent = template($('create-system').value)?.description || ''; $('create-template-wrap').hidden = $('create-system').value !== 'universal'; }
  function openCreate(systemId = 'bear-mercenary') {
    if (state.cards.length >= M.LIMITS.cards) { toast('当前存档最多保存 ' + M.LIMITS.cards + ' 份角色，请先备份或清理旧档案。'); return; }
    $('create-form').reset(); populateTemplates(); window.TavernCharacterCreatorUI.begin(systemId, category === 'all' ? 'uncategorized' : category); openDialog('create-dialog');
  }
  function filteredCards(ignoreCategory = false) {
    const query = $('character-search').value.trim().toLocaleLowerCase();
    const filter = $('system-filter').value;
    return state.cards.filter(card => card.status === view && (filter === 'all' || card.systemId === filter) && (ignoreCategory || category === 'all' || card.category === category) && [card.name, card.title, card.profile.occupation, card.profile.player, card.sheet?.schema.name || '', categoryLabel(card.category), ...(card.tags || []), roleLabel(card.role), ...Object.values(card.world)].join(' ').toLocaleLowerCase().includes(query));
  }
  function selectCategory(id) {
    persist(); category = id;
    const cards = filteredCards();
    if (!cards.some(card => card.id === selectedId)) { selectedId = cards[0]?.id || null; tab = 'base'; }
    renderDirectory(); renderSheet();
  }
  function avatar(card, className) {
    const node = el('span', { class: className });
    if (card.portrait) node.append(el('img', { src: card.portrait, alt: card.name + '的头像' }));
    else node.textContent = Array.from(card.name || '熊')[0];
    return node;
  }
  function renderDirectory() {
    const active = state.cards.filter(card => card.status === 'active');
    $('active-count').textContent = active.length; $('archived-count').textContent = state.cards.length - active.length;
    $('directory-title').textContent = view === 'active' ? '我的角色' : '归档角色';
    document.querySelectorAll('[data-view]').forEach(node => {
      const on = node.dataset.view === view; node.classList.toggle('is-active', on); node.setAttribute('aria-pressed', String(on));
    });
    const query = $('character-search').value.trim().toLocaleLowerCase();
    const filter = $('system-filter').value;
    const pool = filteredCards(true);
    $('category-filters').replaceChildren(...[{ id: 'all', label: '全部' }, ...M.CATEGORIES].map(item => {
      const count = item.id === 'all' ? pool.length : pool.filter(card => card.category === item.id).length;
      const node = button(item.label + ' ' + count, () => selectCategory(item.id), 'category-chip');
      node.dataset.category = item.id; node.setAttribute('aria-pressed', String(category === item.id)); return node;
    }));
    const cards = filteredCards();
    cards.sort($('sort-filter').value === 'name' ? (a, b) => a.name.localeCompare(b.name, 'zh-CN') : (a, b) => b.updatedAt.localeCompare(a.updatedAt));
    renderManagement(cards);
    $('directory-count').textContent = cards.length + ' 份档案';
    const list = $('character-list'); list.replaceChildren();
    if (!cards.length) {
      list.append(el('div', { class: 'directory-empty' }, el('span', { text: '—' }), el('p', { text: query || filter !== 'all' || category !== 'all' ? '没有匹配的角色' : view === 'archived' ? '还没有归档角色' : '档案库等你落笔' }), el('small', { text: query || filter !== 'all' || category !== 'all' ? '试试其他名字、规则或分类。' : '从一名佣兵开始你的冒险。' })));
      return;
    }
    const groups = new Map();
    if (category === 'all') M.CATEGORIES.forEach(item => {
      const count = cards.filter(card => card.category === item.id).length;
      if (!count) return;
      const container = el('div', { class: 'category-group-cards' }); groups.set(item.id, container);
      list.append(el('section', { class: 'character-category-group', 'aria-label': item.label + '角色' }, el('h3', { class: 'category-group-title', text: item.label + ' · ' + count }), container));
    });
    cards.forEach(card => {
      const item = button('', () => { persist(); selectedId = card.id; tab = 'base'; renderDirectory(); renderSheet(); }, 'character-card' + (card.id === selectedId ? ' is-selected' : '') + (card.status === 'archived' ? ' is-archived' : ''));
      item.setAttribute('aria-pressed', String(card.id === selectedId));
      item.append(avatar(card, 'character-avatar'), el('span', { class: 'character-card-copy' }, el('h3', { text: card.name || '未命名角色' }), el('p', { text: card.title || card.profile.occupation || '尚未填写角色简介' }), el('span', { class: 'card-category', text: categoryLabel(card.category) }), el('span', { class: 'card-system', text: template(card.systemId)?.name || card.systemId })));
      if (M.combatStatus(card, state)?.valid === false) item.querySelector('.character-card-copy').append(el('span', { class: 'card-warning', text: '属性超限 · 待调整' }));
      if (management) {
        const check = el('input', { type: 'checkbox', 'aria-label': '选择角色 ' + card.name }); check.checked = pickedCards.has(card.id);
        check.addEventListener('change', () => { check.checked ? pickedCards.add(card.id) : pickedCards.delete(card.id); renderManagement(filteredCards()); });
        (groups.get(card.category) || list).append(el('div', { class: 'library-select-row' }, check, item));
      } else (groups.get(card.category) || list).append(item);
    });
  }
  function field(label, value, change, options = {}) {
    const input = el(options.area ? 'textarea' : 'input', { class: 'field-input', 'aria-label': label, ...(options.area ? { rows: options.rows || 3 } : { type: options.type || 'text' }), maxlength: options.maxlength || (options.area ? 10000 : 100), placeholder: options.placeholder || '' });
    input.value = value ?? '';
    if (options.min !== undefined) input.min = options.min;
    if (options.max !== undefined) input.max = options.max;
    if (options.type === 'number') input.step = '1';
    input.addEventListener(options.type === 'number' ? 'change' : 'input', () => {
      if (options.type === 'number') {
        const n = Number(input.value);
        if (!Number.isFinite(n) || !Number.isInteger(n) || (options.min !== undefined && n < options.min) || (options.max !== undefined && n > options.max)) { const message = options.invalidMessage || '请输入允许范围内的整数'; input.setCustomValidity(message); input.reportValidity(); if (options.onReject) options.onReject(message, input); return; }
        input.setCustomValidity('');
        try { change(n); } catch (error) { input.setCustomValidity(error.message); input.reportValidity(); if (options.onReject) options.onReject(error.message, input); }
      } else change(input.value);
    });
    return el('label', { class: options.className || 'field' }, el('span', { text: label }), input, options.hint ? el('small', { class: 'field-hint', text: options.hint }) : null);
  }
  function showEmpty() {
    const tags = el('div', { class: 'template-tags' }, ...templates().map(item => el('span', { text: item.name })));
    $('sheet-area').append(el('div', { class: 'empty-sheet' }, el('div', { class: 'empty-emblem', 'aria-hidden': 'true', text: '档' }), el('p', { class: 'empty-kicker', text: 'THE NEXT ADVENTURE STARTS HERE' }), el('h2', { class: 'empty-title', text: '在这里，写下第一个名字。' }), el('p', { class: 'empty-copy', text: '登记你的佣兵，记录六项战斗属性；也可以为其他 TRPG 规则建立独立角色卡。' }), el('div', { class: 'empty-attributes' }, ...['力量', '灵敏度', '战斗力', '行动力', '防御力', '命中率'].map(name => el('div', { class: 'empty-stat' }, el('span', { text: name }), el('strong', { text: '—' })))), el('div', { class: 'empty-actions' }, button('＋ 登记第一名佣兵', () => openCreate(), 'button-primary'), button('导入已有角色', openImport, 'button-quiet')), tags));
  }
  function renderSheet() {
    if (universalView) { universalView.destroy(); universalView = null; }
    const area = $('sheet-area'); area.replaceChildren();
    const card = current(); if (!card) { showEmpty(); return; }
    const rule = template(card.systemId);
    const aiFill = button('AI 辅助填写', () => { persist(); window.TavernCharacterAIUI.open(card); }, 'button-outline'); aiFill.id = 'ai-fill';
    const actions = el('div', { class: 'sheet-actions' }, aiFill, button('玩家版导出', () => publicExport(card)), button('CCFOLIA', async () => { try { download(fileName(card.name) + '-CCFOLIA.json', M.toCCFolia(await portableCard(card), state)); toast('已导出 CCFOLIA 角色 JSON，不含秘密备注。'); } catch (error) { toast(error.message); } }), button('打印', () => printCard(card)), button('复制', () => {
      if (state.cards.length >= M.LIMITS.cards) return toast('存档已满，请先备份或清理旧档案。');
      const copy = JSON.parse(JSON.stringify(card)); copy.id = crypto.randomUUID(); copy.presetId = ''; copy.name = card.name.slice(0, 90) + ' · 副本'; copy.createdAt = copy.updatedAt = new Date().toISOString();
      try { M.assertCombatChange(null, copy, state); } catch (error) { return toast(error.message + '。请先调整原角色。'); }
      state.cards.unshift(copy); selectedId = copy.id; dirty = true; persist(); renderDirectory(); renderSheet(); toast('已建立独立副本。');
    }), button(card.status === 'active' ? '归档' : '恢复', () => {
      card.status = card.status === 'active' ? 'archived' : 'active'; view = card.status; card.updatedAt = new Date().toISOString(); dirty = true; persist(); renderDirectory(); renderSheet();
    }), button('删除', () => ask('删除角色档案', '移除“' + card.name + '”。操作后可以撤销本次清理；建议先导出备份。', () => removeEntries([card.id], []), '删除档案'), 'button-quiet text-danger'));
    const saveState = el('span', { class: 'save-state', id: 'save-state', text: tabletopEmbedded ? '草稿 · 请保存到作品' : storageLocked ? '仅保留于本次访问' : dirty ? '尚未保存' : remote ? '已保存到本机数据库' : '已保存于此浏览器' });
    area.append(el('header', { class: 'sheet-header' }, avatar(card, 'sheet-avatar'), el('div', { class: 'sheet-heading-copy' }, el('p', { class: 'sheet-eyebrow', text: categoryLabel(card.category) + ' / ' + rule.name + (card.worldEnabled ? ' / ' + state.world.name : '') }), el('h2', { class: 'sheet-title', id: 'sheet-title', text: card.name }), el('p', { class: 'sheet-meta', text: card.title || card.profile.occupation || '一段新的冒险，等待记录' })), saveState), actions);
    const tabs = [['base', '基础与属性'], ['universal', '通用模块'], ['skills', '技能与装备'], ['world', '世界观'], ['notes', '记录与秘密']];
    function selectTab(id) { persist(); tab = id; renderSheet(); $('tab-' + id).focus({ preventScroll: true }); }
    area.append(el('div', { class: 'sheet-tabs', role: 'tablist', 'aria-label': '角色卡章节' }, ...tabs.map(([id, name], index) => {
      const node = button(name, () => selectTab(id)); node.setAttribute('role', 'tab'); node.setAttribute('aria-selected', String(tab === id)); node.tabIndex = tab === id ? 0 : -1; node.id = 'tab-' + id; node.setAttribute('aria-controls', 'sheet-content');
      node.addEventListener('keydown', event => { const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']; if (!keys.includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; selectTab(tabs[next][0]); }); return node;
    })));
    const content = el('div', { class: 'sheet-content', id: 'sheet-content', role: 'tabpanel', 'aria-labelledby': 'tab-' + tab }); area.append(content);
    if (tab === 'base') renderBase(content, card, rule);
    if (tab === 'skills') renderSkills(content, card);
    if (tab === 'world') renderWorld(content, card);
    if (tab === 'notes') renderNotes(content, card);
    if (tab === 'universal') renderUniversal(content, card);
    area.append(el('div', { class: 'sheet-bottom' }, el('span', { text: tabletopEmbedded ? '点击下方保存角色档案，写入当前作品。' : '修改后自动保存 · 玩家版导出会移除秘密备注' }), button('保存档案', () => { if (persist()) toast(tabletopEmbedded ? '草稿已更新，请点击下方保存角色档案。' : '已保存角色档案。'); }, 'button-outline')));
  }
  function renderBase(content, card, rule) {
    const combat = M.combatStatus(card, state);
    content.append(el('div', { class: 'section-heading' }, el('h3', { class: 'sheet-section-title', text: combat ? '战斗属性' : '角色属性' }), combat ? button('设置分配规则', openCombatRules, 'button-outline') : el('span', { text: rule.tag })));
    if (combat) { content.append(el('div', { id: 'combat-budget', class: 'combat-budget', role: 'status', 'aria-live': 'polite' })); renderCombatBudget(card); }
    const stats = el('div', { class: 'stats-grid' });
    rule.abilities.forEach(item => {
      const maximum = combat ? combat.rules.maxima[item.key] : item.max;
      stats.append(field(item.label, card.abilities[item.key], value => {
        M.assertCombatChange(card, { ...card, abilities: { ...card.abilities, [item.key]: value } }, state);
        card.abilities[item.key] = value; changed(card); renderDerived(card); renderCombatBudget(card);
      }, { type: 'number', min: item.min ?? -9999, max: maximum ?? 999999, className: 'stat-field', hint: combat ? '0–' + maximum + ' · 每点消耗 1 点预算' : item.key,
        invalidMessage: combat ? item.label + '允许 0–' + maximum + ' 的整数' : undefined,
        onReject: combat ? (message, input) => { toast(message); input.value = card.abilities[item.key]; input.setCustomValidity(''); } : undefined }));
    });
    if (!rule.abilities.length) stats.append(el('p', { class: 'field-hint', text: card.systemId === 'universal' ? '属性与能力在“通用模块”中填写；此处管理人物身份、类型和标签。' : '此模板没有固定属性，可在“自定义规则”中建立属性模板。' }));
    content.append(stats, el('div', { id: 'derived-values', class: 'derived-strip' })); renderDerived(card);
    if (rule.resources.length) {
      content.append(el('h3', { class: 'sheet-section-title', text: '当前资源' }));
      const resources = el('div', { class: 'resources-grid' });
      rule.resources.forEach(item => {
        const resource = card.resources[item.key];
        resources.append(el('div', { class: 'resource-field' }, el('span', { text: item.label }), el('div', { class: 'resource-inputs' }, field(item.label + '当前值', resource.value, value => { resource.value = value; changed(card); }, { type: 'number', min: 0, max: 999999 }), el('span', { text: '/' }), field(item.label + '上限', resource.max, value => { resource.max = value; changed(card); }, { type: 'number', min: 0, max: 999999 }))));
      }); content.append(resources, el('p', { class: 'field-hint', text: '资源上限手动填写；建议值不会覆盖角色在团中的当前状态。' }));
    }
    content.append(el('h3', { class: 'sheet-section-title', text: '角色身份' }), el('div', { class: 'field-grid' },
      field('角色名字', card.name, value => { card.name = value; $('sheet-title').textContent = value || '未命名角色'; changed(card); }),
      field('称号 / 简介', card.title, value => { card.title = value; changed(card); }, { placeholder: '例如：守夜人、见习佣兵' }),
      categoryField(card),
      roleField(card),
      field('角色标签', (card.tags || []).join('，'), value => { const tags = [...new Set(value.split(/[,，、]+/).map(s => s.trim()).filter(Boolean))]; if (tags.length > 20 || tags.some(s => s.length > 40)) return toast('标签最多 20 个，每个最多 40 字。'); card.tags = tags; changed(card); }, { maxlength: 800, placeholder: '例如：守护、调查、北境，以逗号分隔' }),
      field('玩家', card.profile.player, value => { card.profile.player = value; changed(card); }),
      field('职业', card.profile.occupation, value => { card.profile.occupation = value; changed(card); }),
      field('年龄', card.profile.age, value => { card.profile.age = value; changed(card); }),
      el('label', { class: 'field' }, el('span', { text: '角色头像' }), el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', 'aria-label': '角色头像', onchange: event => uploadPortrait(event.target, card) }), el('small', { class: 'field-hint', text: 'PNG / JPG / WebP，最大 1 MB' }), card.portrait ? button('移除头像', () => { card.portrait = ''; changed(card); renderSheet(); }) : null)
    ), field('角色背景', card.profile.background, value => { card.profile.background = value; changed(card); }, { area: true, rows: 4, maxlength: 10000, placeholder: '从哪里来，为何走进熊酒馆？' }));
    if (card.systemId === 'dnd5') content.append(el('p', { class: 'field-hint', text: 'D&D 5e 基础卡提供属性、等级与调整值；职业构筑、法术和专长请按你使用的规则资料填写。' }));
  }
  function renderCombatBudget(card) {
    const node = $('combat-budget'), budget = M.combatStatus(card, state); if (!node || !budget) return;
    node.classList.toggle('is-over-budget', !budget.valid);
    const progress = el('progress', { max: Math.max(1, budget.total), value: Math.min(budget.used, budget.total), 'aria-label': '战斗属性已用点数' });
    node.replaceChildren(el('strong', { text: '已用 ' + budget.used + ' / ' + budget.total + ' 点 · ' + (budget.remaining >= 0 ? '剩余 ' + budget.remaining + ' 点' : '超出 ' + -budget.remaining + ' 点') }), progress, el('p', { class: 'field-hint', text: budget.rules.provisional ? '试用分配规则：六项直接相加。可在“设置分配规则”中修改单项上限和总预算。' : '六项直接相加计算点数；每项不得超过各自上限。' }));
    if (!budget.valid) node.append(el('p', { class: 'form-error', text: budget.issues.join('；') + '。旧数值已保留，请逐步减点修正。' }));
  }
  function combatDraft() {
    const inputs = [$('combat-total'), ...M.BUILTIN_TEMPLATES[0].abilities.map(item => $('combat-max-' + item.key))];
    if (inputs.some(input => !input.value.trim())) throw new Error('请填写总预算和全部单项上限');
    return M.normalizeCombatRules({ total: Number($('combat-total').value), maxima: Object.fromEntries(M.BUILTIN_TEMPLATES[0].abilities.map(item => [item.key, Number($('combat-max-' + item.key).value)])), provisional: false });
  }
  function renderCombatImpact() {
    const node = $('combat-impact'); node.replaceChildren();
    try {
      const draft = combatDraft(), affected = state.cards.filter(card => M.combatStatus(card, { ...state, combatRules: draft })?.valid === false);
      node.append(el('p', { class: 'field-hint', text: remote ? '本次打开的角色中有 ' + affected.length + ' 份需要调整。保存后会检查整库档案并更新超限标记；返回角色库勾选“属性超限”即可查看。原始数值保留。' : affected.length ? '保存后有 ' + affected.length + ' 份佣兵档案需要调整（含归档）。原始数值保留。' : '现有佣兵档案均符合这套上限和预算。' }));
      affected.forEach(card => node.append(el('p', { class: 'form-error', text: card.name + '：' + M.combatStatus(card, { ...state, combatRules: draft }).issues.join('；') })));
    } catch (error) { node.append(el('p', { class: 'form-error', text: error.message })); }
  }
  function openCombatRules() {
    const rules = M.normalizeCombatRules(state.combatRules);
    $('combat-total').value = rules.total; $('combat-rule-error').textContent = '';
    $('combat-maxima').replaceChildren(...M.BUILTIN_TEMPLATES[0].abilities.map(item => el('label', { class: 'field' }, item.label + '上限', el('input', { id: 'combat-max-' + item.key, type: 'number', min: 0, max: 999, step: 1, required: true, value: rules.maxima[item.key], oninput: renderCombatImpact }))));
    renderCombatImpact(); openDialog('combat-rules-dialog');
  }
  function categoryField(card) {
    const select = el('select', { 'aria-label': '角色分类' }, ...M.CATEGORIES.map(item => new Option(item.label, item.id)));
    select.value = card.category;
    select.addEventListener('change', () => { card.category = select.value; changed(card); const head = document.querySelector('.sheet-eyebrow'); if (head) head.textContent = categoryLabel(card.category) + ' / ' + template(card.systemId).name + (card.worldEnabled ? ' / ' + state.world.name : ''); });
    return el('label', { class: 'field' }, el('span', { text: '角色分类' }), select);
  }
  function roleLabel(id) { return M.ROLES.find(item => item.id === id)?.label || '玩家角色'; }
  function roleField(card) {
    const select = el('select', { 'aria-label': '角色类型' }, ...M.ROLES.map(item => new Option(item.label, item.id)));
    select.value = card.role || 'player'; select.addEventListener('change', () => { card.role = select.value; changed(card); });
    return el('label', { class: 'field' }, el('span', { text: '角色类型' }), select);
  }
  function renderUniversal(content, card) {
    if (!card.sheet) {
      const select = el('select', { 'aria-label': '附加模块模板' }, ...sheetTemplates().map(item => new Option(item.name + ' · v' + item.version, item.id)));
      content.append(el('div', { class: 'universal-attach' }, el('h3', { class: 'sheet-section-title', text: '给角色添加可配置模块' }), el('p', { class: 'field-hint', text: '原有属性、装备和世界资料继续保留。附加模块独立记录，适合能力、状态、法术、关系或新规则。' }), select, button('添加通用模块', () => {
        try { card.sheet = U.createSheet(sheetTemplates().find(item => item.id === select.value)); changed(card); renderSheet(); }
        catch (error) { toast(error.message); }
      }, 'button-primary'))); return;
    }
    universalView = UI.mount(content, card, { onChange: () => changed(card), onTemplateSave: schema => openTemplateSave(schema) });
  }
  function openTemplateSave(schema, templateId = null, direct = false) {
    editingTemplateId = templateId;
    templateDraft = U.normalizeSchema(schema); $('template-save-name').value = direct ? schema.name : schema.name + ' · 自定义'; $('template-save-version').value = schema.version;
    $('template-save-description').value = schema.description; $('template-save-error').textContent = ''; openDialog('template-save-dialog');
  }
  function openTemplateLibrary() { pickedTemplates.clear(); $('template-search').value = ''; renderTemplateLibrary(); openDialog('templates-dialog'); }
  function renderTemplateLibrary() {
    const builtins = new Set(U.getBuiltinTemplates().map(item => item.id));
    const query = $('template-search').value.trim().toLocaleLowerCase();
    const pool = sheetTemplates().filter(item => ($('template-scope').value !== 'mine' || !builtins.has(item.id)) && [item.name, item.description].join(' ').toLocaleLowerCase().includes(query));
    $('template-selection-count').textContent = '已选 ' + pickedTemplates.size + ' 份自定义模板';
    $('template-delete-selected').disabled = !pickedTemplates.size;
    $('sheet-template-list').replaceChildren(...pool.map(item => {
      const count = item.modules.reduce((n, module) => n + module.fields.length, 0);
      const actions = el('div', { class: 'template-library-actions' }, button('使用模板', () => {
        closeDialog('templates-dialog'); openCreate('universal'); window.TavernCharacterCreatorUI.setTemplate(item.id);
      }, 'button-primary'), button('导出模板', () => download(fileName(item.name) + '-模板.json', { format: 'bear-tavern-template', version: 1, template: item }), 'button-outline'));
      actions.append(button('复制并编辑', () => editLibraryTemplate(item, false), 'button-outline'));
      let selection = null;
      if (!builtins.has(item.id)) {
        actions.append(button('编辑模板', () => editLibraryTemplate(item, true), 'button-outline'), button('删除模板', () => confirmRemoval([], [item.id]), 'button-quiet text-danger'));
        const check = el('input', { type: 'checkbox', 'aria-label': '选择模板 ' + item.name }); check.checked = pickedTemplates.has(item.id);
        check.addEventListener('change', () => { check.checked ? pickedTemplates.add(item.id) : pickedTemplates.delete(item.id); $('template-selection-count').textContent = '已选 ' + pickedTemplates.size + ' 份自定义模板'; $('template-delete-selected').disabled = !pickedTemplates.size; });
        selection = el('label', { class: 'checkbox-field' }, check, '选择清理');
      }
      return el('article', { class: 'template-library-card' }, selection, el('span', { class: 'template-meta', text: (builtins.has(item.id) ? '内置模板' : '我的模板') + ' · v' + item.version + ' · ' + item.modules.length + ' 模块 / ' + count + ' 字段' }), el('h3', { text: item.name }), el('p', { text: item.description || '可以自由添加模块、字段和公式。' }), actions);
    }));
    if (!pool.length) $('sheet-template-list').append(el('p', { class: 'field-hint', text: '没有匹配的模板。可以清空搜索或直接新建模板。' }));
  }
  function renderManagement(cards) {
    const controls = $('archive-management'); if (!controls) return;
    const selected = state.cards.filter(card => pickedCards.has(card.id));
    controls.replaceChildren(button(management ? '完成整理' : '批量整理', () => { management = !management; pickedCards.clear(); renderDirectory(); }, 'button-outline'));
    if (!management) return;
    controls.append(el('p', { class: 'field-hint', text: '已选 ' + selected.length + ' 份 · 当前筛选 ' + cards.length + ' 份' }), button('选择当前筛选', () => { cards.forEach(card => pickedCards.add(card.id)); renderDirectory(); }), button('取消全选', () => { pickedCards.clear(); renderDirectory(); }));
    for (const [status, label] of [['archived', '归档所选'], ['active', '恢复所选']]) {
      const action = button(label, () => {
        const currentSelection = state.cards.filter(card => pickedCards.has(card.id));
        currentSelection.forEach(card => { card.status = status; card.updatedAt = new Date().toISOString(); }); pickedCards.clear(); dirty = true; persist(); selectedId = filteredCards()[0]?.id || null; renderDirectory(); renderSheet(); toast('已' + (status === 'active' ? '恢复' : '归档') + currentSelection.length + '份角色。');
      }, 'button-outline'); action.disabled = !selected.some(card => card.status !== status); controls.append(action);
    }
    const clean = button('清理所选', () => confirmRemoval([...pickedCards], []), 'button-quiet text-danger'); clean.disabled = !selected.length; controls.append(clean);
  }
  function confirmRemoval(cardIds, templateIds) {
    const names = [...state.cards.filter(card => cardIds.includes(card.id)).map(card => card.name), ...state.sheetTemplates.filter(item => templateIds.includes(item.id)).map(item => item.name)];
    if (!names.length) return;
    ask('清理所选资料', '将移除 ' + names.length + ' 项：' + names.join('、') + '。角色模板的清理不会删除使用它的角色。可撤销本次清理；下一次清理将替换撤销记录。', () => removeEntries(cardIds, templateIds), '确认清理');
  }
  function renderRuleLibrary() {
    const list = $('rule-library-list'); if (!list) return;
    list.replaceChildren();
    const unused = state.customRules.filter(rule => remote ? !remote.references[rule.id] : !state.cards.some(card => card.systemId === rule.id));
    const cleanAll = button('清理未使用规则（' + unused.length + '）', () => confirmRuleRemoval(unused.map(rule => rule.id)), 'button-outline text-danger');
    cleanAll.disabled = !unused.length; list.append(cleanAll);
    if (!state.customRules.length) list.append(el('p', { class: 'field-hint', text: '暂无自定义规则。创建后，可在这里查看使用情况和清理。' }));
    state.customRules.forEach(rule => {
      const references = state.cards.filter(card => card.systemId === rule.id);
      const count = remote ? remote.references[rule.id] || 0 : references.length;
      const clean = button('清理规则', () => confirmRuleRemoval([rule.id]), 'button-quiet text-danger'); clean.disabled = count > 0;
      const article = el('article', { class: 'template-library-card' }, el('h3', { text: rule.name }), el('p', { class: 'field-hint', text: rule.abilities.length + ' 项属性 · ' + rule.resources.length + ' 项资源 · ' + count + ' 份角色使用（含归档）' }), count ? el('p', { class: 'field-hint', text: '使用中的规则受保护。请先转移或清理关联角色。' }) : el('p', { class: 'field-hint', text: '未使用，可清理并撤销。' }), clean);
      if (count) {
        const rows = el('div', { class: 'rule-reference-list' });
        references.forEach(card => {
          rows.append(el('div', { class: 'rule-reference-row' }, el('div', {}, el('strong', { text: card.name }), el('p', { class: 'field-hint', text: categoryLabel(card.category) + ' · ' + (card.status === 'archived' ? '已归档' : '使用中') })), button('打开角色', () => {
            persist(); selectedId = card.id; view = card.status; category = 'all'; tab = 'base'; management = false;
            $('character-search').value = ''; $('system-filter').value = 'all';
            closeDialog('rule-dialog'); renderDirectory(); renderSheet();
          }, 'button-outline'), button('清理角色', () => confirmRemoval([card.id], []), 'button-quiet text-danger')));
        });
        if (remote) rows.append(el('a', { class: 'button-outline', href: './library.html?library=' + encodeURIComponent(remote.library) + '&system=' + encodeURIComponent(rule.id) + '&status=all', text: '在角色库查看全部引用 ↗' }), el('p', { class: 'field-hint', text: '后台计数包括已归档和回收站角色；切换回收站可检查残留引用。永久删除引用后才能清理规则。' }));
        else rows.append(button('清理这些引用角色', () => confirmRemoval(references.map(card => card.id), []), 'button-quiet text-danger'));
        article.append(el('details', { class: 'rule-references' }, el('summary', { text: '查看引用（' + count + '）' }), el('p', { class: 'field-hint', text: '归档仍保留规则引用。清理角色可撤销；清理后请检查规则列表。' }), rows));
      }
      list.append(article);
    });
    showUndo();
  }
  function confirmRuleRemoval(ids) {
    const rules = state.customRules.filter(rule => ids.includes(rule.id)); if (!rules.length) return;
    ask('清理自定义规则', '将移除：' + rules.map(rule => rule.name).join('、') + '。可撤销本次清理；下一次清理将替换撤销记录。', () => removeEntries([], [], ids), '确认清理');
  }
  function removeEntries(cardIds, templateIds, ruleIds = []) {
    if (remote && ruleIds.some(id => remote.references[id])) return toast('规则仍被后台角色引用，请先查看全部引用。');
    if (state.cards.some(card => ruleIds.includes(card.systemId) && !cardIds.includes(card.id))) return toast('规则仍有角色使用，未进行清理。');
    const cards = state.cards.filter(card => cardIds.includes(card.id)), templates = state.sheetTemplates.filter(item => templateIds.includes(item.id));
    if (storageLocked) return toast('存档已暂停写入，请先导出备份，再刷新后清理。');
    try {
      const recovery = M.normalizeState({ ...state, cards, sheetTemplates: templates });
      if (!remote && !tabletopEmbedded) localStorage.setItem(UNDO_KEY, JSON.stringify(recovery)); undoBatch = recovery;
    } catch (error) { return toast('无法保存撤销记录，未进行清理：' + error.message); }
    state.customRules = state.customRules.filter(rule => !ruleIds.includes(rule.id));
    state.cards = state.cards.filter(card => !cardIds.includes(card.id)); state.sheetTemplates = state.sheetTemplates.filter(item => !templateIds.includes(item.id));
    pickedCards.clear(); pickedTemplates.clear(); if (cardIds.includes(selectedId)) selectedId = filteredCards()[0]?.id || null;
    dirty = true; persist(); populateTemplates(); renderDirectory(); renderSheet(); renderTemplateLibrary(); renderRuleLibrary(); showUndo(); toast('已清理 ' + (cards.length + templates.length + ruleIds.length) + ' 项，可撤销本次清理。');
  }
  function showUndo() { $('library-undo').hidden = !undoBatch; if ($('template-undo')) $('template-undo').hidden = !undoBatch; if ($('rule-undo')) $('rule-undo').hidden = !undoBatch; }
  function undoCleanup() {
    if (!undoBatch) return;
    if (storageLocked) return toast('存档已暂停写入，请先备份并刷新后恢复。');
    try {
      const checked = M.normalizeState({ ...state, customRules: [...state.customRules, ...undoBatch.customRules.filter(rule => !state.customRules.some(item => item.id === rule.id))], cards: [...state.cards, ...undoBatch.cards.filter(card => !state.cards.some(item => item.id === card.id))], sheetTemplates: [...state.sheetTemplates, ...undoBatch.sheetTemplates.filter(template => !state.sheetTemplates.some(item => item.id === template.id))] });
      state = checked; dirty = true;
      if (!persist()) return toast('恢复尚未保存，撤销记录已保留。');
      undoBatch = null; if (!remote && !tabletopEmbedded) { try { localStorage.removeItem(UNDO_KEY); } catch (_) {} }
      populateTemplates(); renderDirectory(); renderSheet(); renderTemplateLibrary(); renderRuleLibrary(); showUndo(); toast('已恢复本次清理的资料。');
    } catch (error) { toast('恢复失败：' + error.message + '。撤销记录仍保留。'); }
  }
  function editLibraryTemplate(schema, editExisting) {
    editingTemplateId = editExisting ? schema.id : null;
    templateEditorCard = { sheet: U.createSheet(schema) };
    if (!editExisting && schema.name !== '新模板') templateEditorCard.sheet.schema.name = schema.name + ' · 副本';
    closeDialog('templates-dialog');
    if (templateEditorView) templateEditorView.destroy();
    templateEditorView = UI.mount($('template-editor-content'), templateEditorCard, { onChange: () => {} });
    $('template-editor-title').textContent = editExisting ? '编辑模板结构' : '新建模板结构'; openDialog('template-editor-dialog');
  }
  function renderDerived(card) {
    const container = $('derived-values'); if (!container) return;
    const values = M.derive(card); container.hidden = values.length === 0;
    container.replaceChildren(...values.map(item => el('span', { class: 'derived-item', title: item.help }, el('span', { text: item.label }), el('strong', { text: String(item.value) }))));
  }
  function renderSkills(content, card) {
    const list = el('div', { class: 'skill-list' });
    function renderRows() {
      list.replaceChildren();
      if (!card.skills.length) list.append(el('p', { class: 'field-hint', text: '还没有技能，可以添加你在冒险中使用的技能或专长。' }));
      card.skills.forEach((skill, index) => {
        list.append(el('div', { class: 'skill-row' }, field('技能名称', skill.name, value => { skill.name = value; changed(card); }), field('数值', skill.value, value => { skill.value = value; changed(card); }, { type: 'number', min: -9999, max: 9999 }), button('×', () => { card.skills.splice(index, 1); changed(card); renderRows(); }, 'icon-button')));
        list.lastElementChild.querySelector('button').setAttribute('aria-label', '移除技能 ' + skill.name);
      });
    }
    content.append(el('div', { class: 'section-heading' }, el('h3', { class: 'sheet-section-title', text: '技能 / 专长' }), button('＋ 添加技能', () => { if (card.skills.length >= M.LIMITS.skills) return toast('此角色最多记录 ' + M.LIMITS.skills + ' 项技能。'); card.skills.push({ id: crypto.randomUUID(), name: '新技能', value: 0 }); changed(card); renderRows(); }, 'button-outline')), list, field('装备与随身物品', card.inventory, value => { card.inventory = value; changed(card); }, { area: true, rows: 7, maxlength: 20000, placeholder: '逐行记录装备、数量与用途。' }));
    renderRows();
  }
  function renderWorld(content, card) {
    const toggle = el('input', { type: 'checkbox', 'aria-label': '关联世界观' }); toggle.checked = card.worldEnabled;
    toggle.addEventListener('change', () => { card.worldEnabled = toggle.checked; changed(card); renderSheet(); });
    content.append(el('div', { class: 'section-heading' }, el('h3', { class: 'sheet-section-title', text: state.world.name }), button('编辑世界设定', openWorld, 'button-outline')), el('label', { class: 'checkbox-field' }, toggle, '关联世界观字段'));
    if (!card.worldEnabled) { content.append(el('p', { class: 'field-hint', text: '开启关联后，可以在当前规则卡上填写熊酒馆世界资料。' })); return; }
    if (state.world.summary) content.append(el('p', { class: 'world-summary', text: state.world.summary }));
    else content.append(el('p', { class: 'field-hint', text: '世界简介尚未填写。可在“世界观设定”中加入你的正式设定。' }));
    content.append(el('div', { class: 'world-fields field-grid' }, ...state.world.fields.map(item => field(item.label, card.world[item.id] || '', value => { card.world[item.id] = value; changed(card); }, { area: true, maxlength: 5000 }))));
  }
  function renderNotes(content, card) {
    content.append(field('冒险记录 / 公开备注', card.notes, value => { card.notes = value; changed(card); }, { area: true, rows: 7, maxlength: 20000, placeholder: '记录经历、关系、成长与团后笔记。玩家版导出包含这些内容。' }), el('div', { class: 'private-note' }, el('h3', { class: 'sheet-section-title', text: '秘密备注' }), el('p', { class: 'field-hint', text: '只保留在本地档案和完整备份中。玩家版与 CCFOLIA 导出会移除；打印时也会隐藏。' }), field('秘密备注内容', card.secret, value => { card.secret = value; changed(card); }, { area: true, rows: 5, maxlength: 20000, placeholder: '例如个人秘密、主持人交给你的隐藏信息。' })));
  }
  function printCard(card) {
    const rule = template(card.systemId);
    let print = $('print-content');
    if (!print) { print = el('section', { id: 'print-content', hidden: '', 'data-tavern-brand-preserve': '' }); document.body.append(print); }
    function section(title, text) { return text ? el('section', { class: 'print-section' }, el('h2', { text: title }), el('p', { text })) : null; }
    const details = el('dl', { class: 'print-stats' });
    rule.abilities.forEach(item => details.append(el('dt', { text: item.label }), el('dd', { text: String(card.abilities[item.key]) })));
    rule.resources.forEach(item => details.append(el('dt', { text: item.label }), el('dd', { text: card.resources[item.key].value + ' / ' + card.resources[item.key].max })));
    const world = card.worldEnabled ? state.world.fields.map(item => card.world[item.id] ? item.label + '：' + card.world[item.id] : '').filter(Boolean).join('\n') : '';
    const extensions = card.sheet ? publicSheetText(U.publicSheet(card.sheet)) : '';
    print.replaceChildren(el('header', {}, el('p', { text: '熊酒馆 · ' + rule.name + ' · ' + categoryLabel(card.category) }), el('h1', { text: card.name }), el('p', { text: [card.title, roleLabel(card.role), ...(card.tags || []), card.profile.player && '玩家：' + card.profile.player, card.profile.occupation && '职业：' + card.profile.occupation, card.profile.age && '年龄：' + card.profile.age].filter(Boolean).join(' · ') })), details, section('角色背景', card.profile.background), section('通用模块', extensions), section('技能 / 专长', card.skills.map(item => item.name + '：' + item.value).join('\n')), section('装备', card.inventory), section(state.world.name, world), section('冒险记录 / 公开备注', card.notes));
    window.print();
  }
  function publicSheetText(sheet) {
    return sheet.schema.modules.map(module => module.name + '\n' + module.fields.map(item => {
      let value = sheet.values[item.id];
      if (item.type === 'formula') { try { value = U.evaluateField(sheet, item.id); } catch (_) { value = '公式暂无法计算'; } }
      if (Array.isArray(value)) value = value.join('、');
      else if (item.type === 'resource') value = value.value + ' / ' + value.max;
      else if (item.type === 'boolean') value = value ? '是' : '否';
      return item.label + '：' + (value ?? '') + (item.unit || '');
    }).join('\n')).join('\n\n');
  }
  async function uploadPortrait(input, card) {
    const file = input.files[0]; if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > M.LIMITS.portraitBytes) { toast('请选择不大于 1 MB 的 PNG、JPG 或 WebP 图片。'); input.value = ''; return; }
    try {
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
      await new Promise((resolve, reject) => { const img = new Image(); img.onload = resolve; img.onerror = reject; img.src = data; });
      card.portrait = data; changed(card); renderSheet(); renderDirectory();
    } catch (_) { toast('无法读取这张图片，请选择有效的图片文件。'); }
  }
  function renderWorldFields() {
    $('world-field-list').replaceChildren(...draftWorldFields.map((item, index) => el('div', { class: 'world-field-row' }, field('字段名称 ' + (index + 1), item.label, value => { item.label = value; }, { maxlength: 100 }), button('移除', () => { draftWorldFields.splice(index, 1); renderWorldFields(); }))));
  }
  function openWorld() {
    $('world-name').value = state.world.name; $('world-summary').value = state.world.summary;
    draftWorldFields = state.world.fields.map(item => ({ ...item })); $('world-error').textContent = '';
    renderWorldFields(); openDialog('world-dialog');
  }
  function openImport() {
    pendingImport = null; populateTemplates(); $('import-text').value = ''; $('import-file').value = ''; $('import-error').textContent = '';
    $('import-preview').hidden = true; $('import-world-option').hidden = true; $('import-world-check').checked = false; $('import-confirm').disabled = true;
    openDialog('import-dialog');
  }
  function openStarter() {
    $('starter-error').textContent = '';
    renderStarter(); openDialog('starter-dialog');
  }
  function renderStarter() {
    const definitions = P.list();
    let remaining = 0;
    $('starter-list').replaceChildren(...M.CATEGORIES.filter(item => item.id !== 'uncategorized').map(item => {
      const entries = definitions.filter(preset => preset.category === item.id);
      const missing = entries.filter(preset => !state.cards.some(card => card.presetId === preset.id)).length;
      remaining += missing;
      const group = el('section', { class: 'starter-group' }, el('h3', { text: item.label + ' · ' + entries.length + ' 份档案' }));
      entries.forEach(preset => {
        const existing = state.cards.find(card => card.presetId === preset.id);
        group.append(el('div', { class: 'starter-card' }, el('h4', { text: preset.name }), el('p', { text: preset.title }), el('small', { text: existing ? '已创建：' + existing.name + (existing.status === 'archived' ? '（已归档）' : '') : '待创建 · ' + preset.occupation })));
      });
      const add = button(missing ? '添加' + item.label + '（' + missing + '份）' : '本类已创建', () => addStarter(item.id), 'button-outline'); add.disabled = missing === 0; group.append(add);
      return group;
    }));
    $('starter-add-all').textContent = remaining ? '创建基础档案（' + remaining + '份）' : '基础档案已全部创建';
    $('starter-add-all').disabled = remaining === 0;
  }
  function addStarter(selectedCategory = 'all') {
    try {
      const result = P.buildMissing(state, selectedCategory);
      if (!result.cards.length) { renderStarter(); return toast('这些基础档案已经创建，不会重复添加。'); }
      const next = { ...state, cards: [...result.cards, ...state.cards] };
      state = M.normalizeState(next); selectedId = result.cards[0].id; view = 'active'; tab = 'base'; category = selectedCategory; dirty = true;
      $('character-search').value = ''; $('system-filter').value = 'all';
      const saved = persist(); renderDirectory(); renderSheet(); closeDialog('starter-dialog');
      toast('已创建 ' + result.cards.length + ' 份基础档案' + (result.skipped ? '，跳过 ' + result.skipped + ' 份已有档案' : '') + (saved ? '。' : '，请导出备份保留数据。'));
    } catch (error) { $('starter-error').textContent = error.message; }
  }
  function invalidateImport() { pendingImport = null; $('import-confirm').disabled = true; $('import-preview').hidden = true; $('import-world-option').hidden = true; $('import-combat-option').hidden = true; $('import-combat-warning').hidden = true; $('import-combat-check').checked = false; }
  function updateImportCombat() {
    if (!pendingImport) return;
    const context = $('import-combat-check').checked && pendingImport.combatRules ? { ...state, combatRules: pendingImport.combatRules } : state;
    const violations = pendingImport.cards.filter(card => M.combatStatus(card, context)?.valid === false);
    $('import-combat-warning').textContent = violations.length ? '以下新角色不符合当前分配规则：' + violations.map(card => card.name + '（' + M.combatStatus(card, context).issues.join('；') + '）').join('、') + '。请调整规则或角色后导入。' : '';
    $('import-combat-warning').hidden = !violations.length; $('import-confirm').disabled = violations.length > 0;
  }
  function checkImport() {
    try {
      const parsed = M.parseImport($('import-text').value, state, { systemId: $('import-system').value });
      const schemaCount = (parsed.sheetTemplates || []).length;
      if (!parsed.cards.length && !schemaCount) throw new Error('导入数据中没有角色或模板');
      pendingImport = parsed; $('import-error').textContent = ''; $('import-confirm').disabled = false;
      $('import-preview').replaceChildren(el('strong', { text: '可导入 ' + parsed.cards.length + ' 份档案' + (schemaCount ? '、' + schemaCount + ' 份模板' : '') }), el('p', { text: [...parsed.cards.slice(0, 6).map(card => card.name), ...(parsed.sheetTemplates || []).slice(0, 6).map(item => item.name)].join('、') }), el('p', { text: '将建立独立副本，保留现有 ' + state.cards.length + ' 份档案。' }));
      $('import-preview').hidden = false; $('import-world-option').hidden = !parsed.world;
      $('import-combat-check').checked = false; $('import-combat-option').hidden = !parsed.combatRules || !parsed.cards.some(card => card.systemId === 'bear-mercenary'); updateImportCombat();
    } catch (error) { invalidateImport(); $('import-error').textContent = error.message; }
  }
  function mergeImport() {
    if (!pendingImport) return;
    try {
      const next = JSON.parse(JSON.stringify(state));
      if ($('import-combat-check').checked && pendingImport.combatRules) next.combatRules = pendingImport.combatRules;
      for (const rule of pendingImport.customRules || []) {
        const existing = M.getTemplates(next).find(item => item.id === rule.id);
        if (existing && JSON.stringify(existing) !== JSON.stringify(rule)) throw new Error('导入规则与现有同名标识的规则冲突，请先使用新的规则标识');
        if (!existing) next.customRules.push(rule);
      }
      const usedIds = new Set(next.cards.map(card => card.id));
      const usedTemplateIds = new Set(sheetTemplates().map(item => item.id));
      for (const schema of pendingImport.sheetTemplates || []) {
        const copy = U.normalizeSchema(schema);
        if (usedTemplateIds.has(copy.id)) copy.id = 'sheet-' + crypto.randomUUID();
        usedTemplateIds.add(copy.id); next.sheetTemplates.push(copy);
      }
      const incoming = pendingImport.cards.map(card => {
        const copy = JSON.parse(JSON.stringify(card)); copy.id = crypto.randomUUID();
        while (usedIds.has(copy.id)) copy.id = crypto.randomUUID(); usedIds.add(copy.id); return copy;
      });
      incoming.forEach(card => M.assertCombatChange(null, card, next));
      next.cards.unshift(...incoming);
      if ($('import-world-check').checked && pendingImport.world) next.world = pendingImport.world;
      const checked = M.normalizeState(next);
      state = checked;
      if (incoming.length) { selectedId = incoming[0].id; view = incoming[0].status; tab = incoming[0].systemId === 'universal' ? 'universal' : 'base'; category = 'all'; $('character-search').value = ''; $('system-filter').value = 'all'; }
      dirty = true;
      persist(); populateTemplates(); renderDirectory(); renderSheet(); closeDialog('import-dialog'); toast('已合并导入 ' + incoming.length + ' 份角色档案、' + (pendingImport.sheetTemplates || []).length + ' 份模板。'); pendingImport = null;
    } catch (error) { $('import-error').textContent = error.message; }
  }
  function configureTheme(value) {
    document.documentElement.dataset.tavernTheme = value;
    document.documentElement.style.colorScheme = value;
    $('theme-toggle').textContent = value === 'dark' ? '☼' : '☾';
    $('theme-toggle').setAttribute('aria-label', '切换' + (value === 'dark' ? '浅色' : '深色') + '主题');
    try { localStorage.setItem('bearTavern.characters.theme', value); } catch (_) { /* Session theme is sufficient. */ }
  }
  function bind() {
    $('combat-rules-open').addEventListener('click', openCombatRules); $('combat-total').addEventListener('input', renderCombatImpact);
    $('combat-rule-form').addEventListener('submit', event => {
      event.preventDefault();
      try {
        if (storageLocked) throw new Error('存档已暂停写入，请先备份并刷新。');
        state.combatRules = combatDraft(); dirty = true; const saved = persist(); renderDirectory(); renderSheet(); closeDialog('combat-rules-dialog');
        toast(saved ? '分配规则已保存，已有角色数值保留。' : '规则已在本次访问生效，尚未保存，请导出备份。');
      } catch (error) { $('combat-rule-error').textContent = error.message; }
    });
    $('import-combat-check').addEventListener('change', updateImportCombat);
    window.TavernCharacterAIUI.initialize({ state: () => state, replace: next => {
      const index = state.cards.findIndex(card => card.id === next.id);
      if (index < 0) throw new Error('角色已不存在');
      if (storageLocked) throw new Error('存档已暂停写入，请先导出备份并刷新。');
      state.cards[index] = next; dirty = true; const saved = persist(); renderDirectory(); renderSheet(); return saved;
    } });
    const managementArea = el('div', { id: 'archive-management', class: 'library-management' }); $('character-list').before(managementArea);
    const search = el('input', { id: 'template-search', type: 'search', 'aria-label': '搜索模板', placeholder: '搜索模板名称或说明' });
    const scope = el('select', { id: 'template-scope', 'aria-label': '模板范围' }, new Option('全部模板', 'all'), new Option('我的模板', 'mine'));
    const cleanTemplates = button('清理所选模板', () => confirmRemoval([], [...pickedTemplates]), 'button-quiet text-danger'); cleanTemplates.id = 'template-delete-selected';
    $('sheet-template-list').before(el('div', { class: 'library-toolbar' }, button('＋ 新建模板', () => { const schema = U.getBuiltinTemplates()[0]; schema.name = '新模板'; editLibraryTemplate(schema, false); }, 'button-primary'), search, scope, el('span', { id: 'template-selection-count', class: 'field-hint' }), button('选择当前自定义模板', () => {
      const query = search.value.trim().toLocaleLowerCase(); state.sheetTemplates.filter(item => [item.name, item.description].join(' ').toLocaleLowerCase().includes(query)).forEach(item => pickedTemplates.add(item.id)); renderTemplateLibrary();
    }), cleanTemplates));
    search.addEventListener('input', renderTemplateLibrary); scope.addEventListener('change', renderTemplateLibrary);
    $('templates-dialog').querySelector(':scope > .field-hint').textContent = '直接新建或复制模板即可设计结构，无需临时角色；也可从角色中另存。内置模板不会参与清理。';
    const undo = button('撤销本次清理', undoCleanup, 'button-outline'); undo.id = 'library-undo'; undo.hidden = true;
    $('storage-warning').before(el('div', { class: 'library-undo-bar' }, undo));
    const templateUndo = button('撤销本次清理', undoCleanup, 'button-outline'); templateUndo.id = 'template-undo'; $('template-import-open').before(templateUndo);
    showUndo();
    const editor = el('dialog', { id: 'template-editor-dialog', class: 'app-dialog dialog-wide' }, el('div', { class: 'dialog-heading' }, el('h2', { id: 'template-editor-title', text: '新建模板结构' }), button('关闭', () => closeDialog('template-editor-dialog'), 'button-quiet')), el('p', { class: 'dialog-lead', text: '在这里设计模板，无需创建临时角色。字段默认值在字段编辑器中设置，试填内容不会写入模板。' }), el('div', { id: 'template-editor-content' }), el('div', { class: 'dialog-footer' }, button('取消', () => { closeDialog('template-editor-dialog'); openTemplateLibrary(); }), button('保存到模板库', () => { const schema = templateEditorCard.sheet.schema, id = editingTemplateId; closeDialog('template-editor-dialog'); openTemplateSave(schema, id, true); }, 'button-primary')));
    editor.addEventListener('close', () => { if (templateEditorView) { templateEditorView.destroy(); templateEditorView = null; } }); document.body.append(editor);
    document.querySelectorAll('[data-close]').forEach(node => node.addEventListener('click', () => closeDialog(node.dataset.close)));
    document.querySelectorAll('[data-view]').forEach(node => node.addEventListener('click', () => { persist(); view = node.dataset.view; selectedId = filteredCards()[0]?.id || null; renderDirectory(); renderSheet(); }));
    $('create-open').addEventListener('click', () => openCreate()); $('mercenary-create').addEventListener('click', () => openCreate());
    $('starter-open').addEventListener('click', openStarter); $('starter-add-all').addEventListener('click', () => addStarter());
    $('universal-create').addEventListener('click', () => openCreate('universal'));
    $('templates-open').addEventListener('click', openTemplateLibrary); $('template-library-open').addEventListener('click', openTemplateLibrary);
    $('template-import-open').addEventListener('click', () => { closeDialog('templates-dialog'); openImport(); });
    $('template-save-form').addEventListener('submit', event => {
      event.preventDefault();
      try {
        if (!templateDraft) throw new Error('没有可保存的模板');
        const schema = U.normalizeSchema({ ...templateDraft, id: editingTemplateId || 'sheet-' + crypto.randomUUID(), name: $('template-save-name').value.trim(), version: Number($('template-save-version').value), description: $('template-save-description').value });
        const checked = M.normalizeState({ ...state, sheetTemplates: [...state.sheetTemplates.filter(item => item.id !== editingTemplateId), schema] });
        state = checked; dirty = true; const saved = persist(); populateTemplates(); closeDialog('template-save-dialog'); templateDraft = null;
        renderSheet(); renderTemplateLibrary(); editingTemplateId = null; toast(saved ? '模板已保存，可以用于新角色。' : '模板已创建，请导出备份保留数据。');
      } catch (error) { $('template-save-error').textContent = error.message; }
    });
    window.TavernCharacterCreatorUI.initialize({ state: () => state, sheetTemplates, commit: async (card, openAI) => {
      state.cards.unshift(card); selectedId = card.id; view = 'active'; tab = card.systemId === 'universal' ? 'universal' : 'base';
      $('character-search').value = ''; $('system-filter').value = 'all'; if (category !== 'all' && category !== card.category) category = card.category; dirty = true;
      const saved = persist();
      if (remote) {
        try { await remote.flush(); }
        catch (error) { renderDirectory(); renderSheet(); closeDialog('create-dialog'); toast('建档保存失败，角色草稿保留在此页，可重试保存。'); return; }
        history.replaceState(null, '', '?library=' + encodeURIComponent(remote.library) + '&card=' + encodeURIComponent(card.id));
      }
      renderDirectory(); renderSheet(); closeDialog('create-dialog');
      toast(saved ? '新角色档案已建立，可以继续编辑。' : '角色已建立，请导出备份保留本次数据。');
      if (openAI) window.TavernCharacterAIUI.open(card);
    } });
    ['character-search', 'system-filter', 'sort-filter'].forEach(id => $(id).addEventListener(id === 'character-search' ? 'input' : 'change', renderDirectory));
    $('backup-export').addEventListener('click', exportBackup); $('backup-export').title = '导出所有角色、规则和世界设定，包含秘密备注';
    $('import-open').addEventListener('click', openImport); $('import-text').addEventListener('input', invalidateImport); $('import-system').addEventListener('change', invalidateImport);
    $('import-file').addEventListener('change', async event => {
      const file = event.target.files[0]; if (!file) return;
      invalidateImport(); $('import-error').textContent = '';
      if (file.size > 12 * 1024 * 1024) { $('import-error').textContent = '文件超过 12 MB，请选择较小的备份'; return; }
      try { $('import-text').value = await file.text(); invalidateImport(); checkImport(); } catch (_) { $('import-error').textContent = '文件读取失败'; }
    });
    $('import-check').addEventListener('click', checkImport); $('import-confirm').addEventListener('click', mergeImport);
    $('world-open').addEventListener('click', openWorld);
    $('world-add-field').addEventListener('click', () => { if (draftWorldFields.length >= 24) return toast('最多添加 24 个世界观字段。'); draftWorldFields.push({ id: 'field-' + crypto.randomUUID(), label: '' }); renderWorldFields(); });
    $('world-form').addEventListener('submit', event => {
      event.preventDefault();
      try { state.world = M.normalizeWorld({ name: $('world-name').value.trim(), summary: $('world-summary').value, fields: draftWorldFields }); dirty = true; persist(); populateTemplates(); renderSheet(); closeDialog('world-dialog'); toast('世界观设定已更新。'); }
      catch (error) { $('world-error').textContent = error.message; }
    });
    $('rule-undo').addEventListener('click', undoCleanup);
    $('rule-open').addEventListener('click', () => { $('rule-form').reset(); $('rule-error').textContent = ''; renderRuleLibrary(); openDialog('rule-dialog'); });
    $('rule-form').addEventListener('submit', event => {
      event.preventDefault();
      const names = value => value.split(/[\n,，、]+/).map(text => text.trim()).filter(Boolean);
      try {
        if (state.customRules.length >= M.LIMITS.customRules) throw new Error('当前最多保存 ' + M.LIMITS.customRules + ' 个自定义规则');
        const abilities = names($('rule-abilities').value), resources = names($('rule-resources').value);
        if (!abilities.length || abilities.length > 24 || resources.length > 12) throw new Error('请填写 1–24 项属性，资源不超过 12 项');
        if (new Set(abilities).size !== abilities.length || new Set(resources).size !== resources.length) throw new Error('字段名称不能重复');
        const rule = M.normalizeTemplate({ id: 'custom-' + crypto.randomUUID(), name: $('rule-name').value.trim(), tag: '自定义规则', description: '由你定义的角色卡模板，数值手动填写。', abilities: abilities.map((name, index) => ({ key: 'ATTR_' + (index + 1), label: name, value: 0, min: -9999, max: 999999 })), resources: resources.map((name, index) => ({ key: 'RESOURCE_' + (index + 1), label: name, value: 0 })), skills: [] });
        state.customRules.push(rule); dirty = true; persist(); populateTemplates(); closeDialog('rule-dialog'); toast('自定义规则已添加，可以用于新建角色。');
      } catch (error) { $('rule-error').textContent = error.message; }
    });
    $('confirm-form').addEventListener('submit', event => { event.preventDefault(); closeDialog('confirm-dialog'); const action = confirmation; confirmation = null; if (action) action(); });
    $('confirm-dialog').addEventListener('close', () => { setTimeout(() => { if (!$('confirm-dialog').open) confirmation = null; }, 0); });
    $('theme-toggle').addEventListener('click', () => configureTheme(document.documentElement.dataset.tavernTheme === 'dark' ? 'light' : 'dark'));
    window.addEventListener('bear-tavern:themechange', event => configureTheme(event.detail.theme));
    window.addEventListener('beforeunload', event => { if (remote ? dirty || remote.busy : dirty && !persist()) { event.preventDefault(); event.returnValue = ''; } });
    window.addEventListener('storage', event => {
      if (!remote && !tabletopEmbedded && event.key === KEY && event.newValue) { storageLocked = true; dirty = true; warn('另一标签页已修改角色档案。此页已暂停写入以避免覆盖；请先导出本页备份，然后刷新读取最新存档。'); saveLabel('已暂停保存'); }
    });
  }
  async function startup() {
    const API = window.TavernLibrary, lib = backendParams.get('library');
    if (!tabletopEmbedded && backendParams.get('local') !== '1' && API) {
      try {
        await API.connect();
        if (!lib) { location.replace('./library.html'); return; }
        remote = await API.editor(lib, backendParams.get('card'), (status, value) => {
          if (status === 'saving') saveLabel('正在保存到本机后台…');
          if (status === 'saved') {
            dirty = JSON.stringify(M.normalizeState(state)) !== value;
            if (!dirty) {
              $('storage-warning').hidden = true; saveLabel('已保存到本机数据库');
              if (selectedId) history.replaceState(null, '', '?library=' + encodeURIComponent(remote.library) + '&card=' + encodeURIComponent(selectedId));
            }
          }
          if (status === 'error') {
            dirty = true; saveLabel('尚未保存到后台'); warn(value.message + ' 当前草稿保留在本页。');
            $('storage-warning').append(button('重试保存', async () => { try { await remote.retry(); } catch (error) { warn(error.message); } }, 'button-outline'), button('导出当前草稿', exportBackup, 'button-quiet'));
          }
        });
        state = M.normalizeState(remote.state); selectedId = state.cards[0]?.id || null; view = state.cards[0]?.status || 'active';
      } catch (error) {
        if (lib) { warn(error.message); $('storage-warning').append(el('a', { class: 'button-outline', text: '返回角色库', href: './library.html' })); return; }
      }
    }
    if (!remote && !tabletopEmbedded) load();
    startupButtons.forEach(([node, disabled]) => { node.disabled = disabled; });
    bind(); populateTemplates(); ruleHint(); renderDirectory(); renderSheet();
    if (remote) {
      document.body.classList.add('backend-editor');
      $('directory-title').textContent = '本次编辑的角色';
      document.querySelector('.page-heading h1').textContent = remote.name;
      document.querySelector('.page-lead').textContent = '本机数据库 · 修改后自动保存';
      document.querySelector('.rail-bottom>span:nth-child(2)').textContent = '本机数据库存档';
      document.querySelector('.app-topbar>p').replaceChildren(el('a', { href: './library.html?library=' + encodeURIComponent(remote.library), text: '← 返回角色库' }), el('span', { text: '/' }), document.createTextNode(remote.name));
      $('template-import-open').hidden = true;
      const save = button('保存并返回角色库', async () => { persist(); try { await remote.flush(); location.assign('./library.html?library=' + encodeURIComponent(remote.library)); } catch (error) { warn(error.message); } }, 'button-primary');
      document.querySelector('.toolbar-actions').append(save);
      if (backendParams.get('new') === '1') openCreate();
      if (backendParams.get('settings') === '1') openWorld();
    }
  }
  await startup();
  if (tabletopEmbedded) {
    const origin = backendParams.get('hostOrigin');
    if (origin === location.origin) {
      const send = (type, requestId, payload) => window.parent.postMessage({ namespace: 'bear-tavern.tabletop', version: 1, type, requestId, payload }, origin);
      window.addEventListener('message', event => {
        const m = event.data;
        if (event.source !== window.parent || event.origin !== origin || m?.namespace !== 'bear-tavern.tabletop' || m.version !== 1 || typeof m.requestId !== 'string' || m.requestId.length > 128) return;
        try {
          if (m.type === 'host:character-load') {
            state = M.normalizeState(m.payload.archive); selectedId = state.cards.some(c => c.id === m.payload.selectedId) ? m.payload.selectedId : state.cards[0]?.id || null;
            view = current()?.status || 'active'; populateTemplates(); renderDirectory(); renderSheet();
            send('tool:character-result', m.requestId, { ok: true });
          } else if (m.type === 'host:character-export') {
            clearTimeout(saveTimer); send('tool:character-result', m.requestId, { ok: true, archive: M.normalizeState(state), selectedId });
          }
        } catch (error) { send('tool:character-result', m.requestId, { ok: false, error: error.message }); }
      });
      send('tool:character-ready', null, { ok: true });
    }
  }
  try { configureTheme(localStorage.getItem('bearTavern.characters.theme') === 'light' ? 'light' : 'dark'); } catch (_) { configureTheme('dark'); }
})();
