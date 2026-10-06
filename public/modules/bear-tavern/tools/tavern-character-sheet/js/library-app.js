/* Server-paged library management. No complete role collection is loaded into the page. */
(function () {
  'use strict';
  const M = window.TavernCharacterModel, U = window.TavernUniversal, P = window.TavernCharacterPresets, API = window.TavernLibrary;
  const $ = id => document.getElementById(id), params = new URLSearchParams(location.search);
  const MIGRATION = 'bearTavern.characters.libraryMigration.v1';
  let libraries = [], currentId = params.get('library') || 'default', status = params.get('status') || 'active';
  if (!params.has('library')) { try { currentId = localStorage.getItem('bearTavern.characters.activeLibrary.v1') || currentId; } catch (_) {} }
  if (!['active', 'archived', 'all', 'trash'].includes(status)) status = 'active';
  let page = 1, result = { items: [], total: 0, generation: -1 }, picked = new Map(), allSelected = false;
  let listToken = 0, searchTimer, busy = false, loading = false, listedFilters = {}, editing = null, operation = null, database, batchRequest = null;
  const actions = { archive: '归档', activate: '恢复使用', trash: '移入回收站', restore: '从回收站恢复', move: '移动到其他库', tags: '调整标签', purge: '永久删除' };
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'text') node.textContent = value;
      else if (key === 'class') node.className = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, String(value));
    });
    children.flat().forEach(child => { if (child != null) node.append(typeof child === 'string' ? document.createTextNode(child) : child); }); return node;
  }
  const button = (name, action, className = 'button-quiet') => el('button', { type: 'button', class: className, text: name, onclick: action });
  function failure(error) { $('library-error').textContent = error.message; $('library-error').hidden = false; }
  function message(text) { $('library-message').textContent = text; $('library-message').hidden = false; }
  function controls(value) { busy = value; document.querySelectorAll('button').forEach(node => { if (!node.dataset.close) node.disabled = value || node.dataset.permanentDisabled === 'true'; }); if (!value) renderPagination(); }
  function library() { return libraries.find(item => item.id === currentId); }
  function filters() { return { library: currentId, status, query: $('filter-query').value.trim(), system: $('filter-system').value, category: $('filter-category').value, role: $('filter-role').value, tag: $('filter-tag').value.trim(), overLimit: $('filter-over-limit').checked ? '1' : '0', sort: $('filter-sort').value }; }
  function editUrl(item) { return './?library=' + encodeURIComponent(item.library_id) + '&card=' + encodeURIComponent(item.id); }
  function countSelected() { return allSelected ? result.total : picked.size; }
  function resetSelection() { picked.clear(); allSelected = false; renderSelection(); }
  function clearAndReload() { page = 1; resetSelection(); loadPage().catch(failure); }
  function category(id) { return M.CATEGORIES.find(item => item.id === id)?.label || '未分类'; }
  function role(id) { return M.ROLES.find(item => item.id === id)?.label || id; }
  function ruleName(id) { return M.BUILTIN_TEMPLATES.find(item => item.id === id)?.name || libraries.flatMap(item => item.rules).find(item => item.id === id)?.name || id; }
  function date(value) { return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  function renderTree() {
    const query = $('library-search').value.trim().toLocaleLowerCase(), show = $('show-archived-libraries').checked;
    const all = { id: 'all', name: '全部角色库', counts: { active: libraries.reduce((n, item) => n + item.counts.active, 0) } };
    $('library-tree').replaceChildren(...[all, ...libraries].filter(item => item.id === 'all' || ((!item.archived || show || item.id === currentId) && item.name.toLocaleLowerCase().includes(query))).map(item => {
      let depth = 0, parent = item.parentId;
      while (parent && depth < 6) { depth++; parent = libraries.find(lib => lib.id === parent)?.parentId; }
      const node = button('', () => { if (busy) return; currentId = item.id; page = 1; resetSelection(); renderLibraries(); loadPage().catch(failure); }, 'library-tree-item');
      node.append(el('span', { text: (depth ? '↳ ' : '') + item.name + (item.archived ? ' · 已归档' : '') }), el('small', { text: item.counts.active.toLocaleString() }));
      node.style.paddingLeft = (10 + depth * 8) + 'px'; node.setAttribute('aria-current', String(item.id === currentId)); return node;
    }));
  }
  function renderLibraries() {
    if (currentId !== 'all' && !library()) currentId = libraries[0]?.id || 'default';
    const lib = library(), all = currentId === 'all';
    $('library-title').textContent = all ? '全部角色库' : lib?.name || '角色库后台';
    $('library-description').textContent = all ? '跨库检索角色，统一整理每一场冒险。' : lib?.description || '让成千上万的角色，各有归处。';
    ['active', 'archived', 'trash'].forEach(key => { const count = all ? libraries.reduce((n, item) => n + item.counts[key], 0) : lib?.counts[key] || 0; $('stat-' + key).textContent = count.toLocaleString(); });
    $('stat-world').textContent = all ? libraries.length + ' 个独立角色库' : (lib?.world || '熊酒馆') + ' · 独立规则与模板';
    $('library-edit').hidden = all; $('library-settings').hidden = all;
    $('library-world-create').hidden = all;
    $('library-world-create').href = './world.html?source=' + encodeURIComponent(currentId);
    $('library-create').hidden = all; $('library-batch-create').hidden = all; $('library-export').hidden = all;
    $('library-settings').href = './?library=' + encodeURIComponent(currentId) + '&settings=1';
    $('library-create').href = './?library=' + encodeURIComponent(currentId) + '&new=1';
    const old = $('filter-system').value || params.get('system') || 'all';
    const customs = [...new Map((all ? libraries : [lib]).filter(Boolean).flatMap(item => item.rules).map(item => [item.id, item])).values()];
    $('filter-system').replaceChildren(new Option('全部规则', 'all'), ...[...M.BUILTIN_TEMPLATES, ...customs].map(item => new Option(item.name, item.id)));
    if ([...$('filter-system').options].some(item => item.value === old)) $('filter-system').value = old;
    renderTree();
    try { localStorage.setItem('bearTavern.characters.activeLibrary.v1', currentId); } catch (_) {}
    history.replaceState(null, '', '?library=' + encodeURIComponent(currentId) + '&status=' + status + ($('filter-system').value !== 'all' ? '&system=' + encodeURIComponent($('filter-system').value) : ''));
  }
  async function refreshLibraries() { libraries = (await API.request('/libraries')).items; renderLibraries(); }
  function renderPagination() {
    const pages = Math.max(1, Math.ceil(result.total / (result.pageSize || 50)));
    $('page-label').textContent = '第 ' + page + ' / ' + pages.toLocaleString() + ' 页';
    $('page-prev').disabled = busy || page <= 1; $('page-next').disabled = busy || page >= pages;
    $('page-number').max = pages; $('page-number').value = page;
  }
  function renderRows() {
    $('library-rows').replaceChildren(...result.items.map(item => {
      const checkbox = el('input', { type: 'checkbox', 'aria-label': '选择 ' + item.name, onchange: event => {
        if (allSelected) { allSelected = false; picked.clear(); result.items.forEach(row => picked.set(row.id, row.revision)); }
        if (event.target.checked) picked.set(item.id, item.revision); else picked.delete(item.id); renderSelection();
      } }); checkbox.checked = allSelected || picked.has(item.id);
      const sub = [item.occupation || item.title, category(item.category), role(item.role), ruleName(item.system_id), currentId === 'all' ? item.library_name : ''].filter(Boolean).join(' · ');
      const rowActions = el('div', { class: 'library-row-actions' });
      if (status !== 'trash') rowActions.append(el('a', { class: 'button-quiet', text: '打开 ↗', href: editUrl(item) }), button(item.status === 'active' ? '归档' : '恢复', () => openBulk(item.status === 'active' ? 'archive' : 'activate', item)));
      else rowActions.append(button('恢复', () => openBulk('restore', item)));
      rowActions.append(button(status === 'trash' ? '永久删除' : '移除', () => openBulk(status === 'trash' ? 'purge' : 'trash', item), 'button-quiet text-danger'));
      return el('tr', { 'data-card-id': item.id }, el('td', { class: 'library-check' }, checkbox), el('td', {}, status === 'trash' ? el('span', { class: 'record-name', text: item.name }) : el('a', { class: 'record-name', href: editUrl(item), text: item.name }), el('div', { class: 'record-sub', text: sub }), item.over_limit ? el('span', { class: 'record-badge warning', text: '属性待调整' }) : null), el('td', { text: ruleName(item.system_id) }), el('td', {}, el('div', { text: category(item.category) }), el('div', { class: 'record-sub', text: role(item.role) })), el('td', {}, ...item.tags.slice(0, 3).map(tag => el('span', { class: 'record-badge', text: tag })), item.tags.length > 3 ? el('small', { text: ' +' + (item.tags.length - 3) }) : null), el('td', {}, el('time', { datetime: item.updated_at, title: new Date(item.updated_at).toLocaleString('zh-CN'), text: date(item.updated_at) })), el('td', {}, rowActions));
    }));
    $('library-empty').hidden = Boolean(result.items.length);
    $('library-empty').querySelector('h2').textContent = status === 'trash' ? '回收站是空的。' : '没有找到角色。';
    $('library-empty').querySelector('p').textContent = $('filter-query').value || $('filter-system').value !== 'all' ? '调整筛选条件，或重置后查看全部档案。' : '创建一份角色，或从已有档案批量导入。';
    $('result-count').textContent = '共 ' + result.total.toLocaleString() + ' 份 · 本页 ' + result.items.length + ' 份';
    document.querySelectorAll('[data-status]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.status === status)));
    renderSelection(); renderPagination();
  }
  function renderSelection() {
    const count = countSelected(); $('selection-bar').hidden = !count;
    $('selection-count').textContent = (allSelected ? '已选择全部筛选结果 ' : '已选择 ') + count.toLocaleString() + ' 份';
    $('select-filtered').hidden = allSelected || count === result.total;
    const checked = result.items.filter(item => allSelected || picked.has(item.id)).length;
    $('select-page').checked = checked > 0 && checked === result.items.length; $('select-page').indeterminate = checked > 0 && checked !== result.items.length;
    $('library-rows').querySelectorAll('input[type=checkbox]').forEach(node => { node.checked = allSelected || picked.has(node.closest('tr').dataset.cardId); });
    const allowed = status === 'trash' ? ['restore', 'purge'] : ['archive', 'activate', 'move', 'tags', 'trash'];
    $('selection-actions').replaceChildren(...allowed.map(action => button(actions[action], () => openBulk(action), action === 'trash' || action === 'purge' ? 'button-quiet text-danger' : 'button-outline')));
  }
  async function loadPage() {
    const token = ++listToken, requested = filters(); loading = true; $('result-count').textContent = '正在读取…'; $('library-rows').setAttribute('aria-busy', 'true');
    try {
      const next = await API.request('/cards?' + new URLSearchParams({ ...requested, page, pageSize: $('filter-size').value }));
      if (token !== listToken) return;
      if (result.generation !== -1 && result.generation !== next.generation && countSelected()) { resetSelection(); message('后台数据已变化，已清空旧选择，请重新选择要整理的角色。'); }
      result = next; listedFilters = requested; page = next.page; renderRows();
    } finally { if (token === listToken) { loading = false; $('library-rows').setAttribute('aria-busy', 'false'); } }
  }
  async function refresh() { resetSelection(); await refreshLibraries(); await loadPage(); await loadHistory(); }
  function options(select, empty, excluded = '') { select.replaceChildren(new Option(empty, ''), ...libraries.filter(item => item.id !== excluded).map(item => new Option(item.name + (item.archived ? '（已归档）' : ''), item.id))); }
  function openLibraryForm(edit = false) {
    editing = edit ? library() : null; if (edit && !editing) return;
    $('library-form').reset(); $('library-form-error').textContent = '';
    $('library-form-title').textContent = edit ? '管理角色库' : '创建角色库';
    options($('library-parent-input'), '无上级（独立角色库）', editing?.id);
    options($('library-copy-input'), '使用熊酒馆默认配置');
    $('library-copy-wrap').hidden = edit; $('library-archive-wrap').hidden = !edit;
    if (editing) { $('library-name-input').value = editing.name; $('library-description-input').value = editing.description; $('library-parent-input').value = editing.parentId || ''; $('library-archive-input').checked = editing.archived; }
    else if (library()) $('library-copy-input').value = currentId;
    $('library-form-dialog').showModal();
  }
  function openBulk(action, item) {
    if (busy || loading || (!item && !countSelected())) return;
    const count = item ? 1 : countSelected();
    operation = { requestId: crypto.randomUUID(), action, generation: result.generation, selector: item ? { ids: [item.id], versions: { [item.id]: item.revision } } : allSelected ? { filters: { ...listedFilters } } : { ids: [...picked.keys()], versions: Object.fromEntries(picked) } };
    $('bulk-title').textContent = actions[action] + ' · ' + count.toLocaleString() + ' 份';
    $('bulk-description').textContent = (item ? '“' + item.name + '”' : allSelected ? '全部筛选结果（包含未加载的其他页）' : '选中的角色（包含跨页选择）') + (action === 'purge' ? '将永久删除，无法撤销。需要保留时请先下载数据库备份。' : action === 'trash' ? '将移入回收站，可在回收站恢复。使用中的规则引用会保留。' : action === 'move' ? '将移动到目标库。目标库必须具有相同的自定义规则，佣兵属性也需符合目标点数限制。' : '将执行此操作，可在最近批量操作中撤销。');
    $('bulk-error').textContent = ''; $('bulk-submit').textContent = action === 'purge' ? '永久删除这些角色' : '确认' + actions[action];
    $('bulk-target-wrap').hidden = action !== 'move'; $('bulk-tags-wrap').hidden = action !== 'tags';
    options($('bulk-target'), '请选择目标角色库'); $('bulk-tags-add').value = ''; $('bulk-tags-remove').value = '';
    $('bulk-dialog').showModal();
  }
  async function loadHistory() {
    const entries = (await API.request('/operations')).items;
    $('library-history-list').replaceChildren(...entries.map(item => {
      const undo = button(item.undone ? '已撤销' : item.kind === 'purge' ? '不可撤销' : '撤销操作', async () => {
        if (busy) return; controls(true);
        try { const result = await API.request('/undo/' + item.id, {}); message('已撤销操作，恢复 ' + result.count + ' 份角色。'); await refresh(); }
        catch (error) { failure(error); } finally { controls(false); loadHistory().catch(failure); }
      }, 'button-outline'); undo.disabled = Boolean(item.undone) || item.kind === 'purge'; undo.dataset.permanentDisabled = String(undo.disabled);
      return el('div', { class: 'library-history-entry' }, el('div', { text: (actions[item.kind] || item.kind) + ' · ' + item.count.toLocaleString() + ' 份' }, el('small', { text: new Date(item.created_at).toLocaleString('zh-CN') })), undo);
    }));
    if (!entries.length) $('library-history-list').append(el('p', { text: '还没有批量操作记录。保留最近 20 次批量操作。' }));
  }
  async function migrateBrowser() {
    const raw = localStorage.getItem('bearTavern.characters.v1'); if (!raw) return;
    let record = JSON.parse(localStorage.getItem(MIGRATION) || 'null');
    if (record?.done) { if (!params.has('library') && currentId === 'default') currentId = record.id || currentId; return; }
    const state = M.normalizeState(JSON.parse(raw));
    record = record || { key: crypto.randomUUID() }; localStorage.setItem(MIGRATION, JSON.stringify(record));
    $('connection-state').textContent = '复制浏览器档案…';
    const migrated = await API.request('/migrate', { migrationKey: record.key, state, name: '我的角色档案' });
    localStorage.setItem(MIGRATION, JSON.stringify({ ...record, id: migrated.id, done: true }));
    currentId = migrated.id; message('原浏览器档案已复制到“我的角色档案”，保留角色、秘密备注、规则和模板。原浏览器数据仍可单独打开。');
  }
  function batchOptions(meta) {
    $('batch-system').replaceChildren(...M.getTemplates(meta).map(item => new Option(item.name, item.id)));
    $('batch-archetype').replaceChildren(new Option('空白佣兵（属性为 0）', ''), ...P.list().map(item => new Option(item.occupation, item.id)));
    $('batch-template').replaceChildren(...[...U.getBuiltinTemplates(), ...meta.sheetTemplates].map(item => new Option(item.name, item.id)));
    $('batch-role').replaceChildren(...M.ROLES.map(item => new Option(item.label, item.id)));
    $('batch-role').value = 'npc';
    $('batch-category').replaceChildren(new Option('跟随职业 / 模板', ''), ...M.CATEGORIES.map(item => new Option(item.label, item.id)));
    $('batch-system').value = 'bear-mercenary'; batchChange();
  }
  function batchChange() {
    const rule = $('batch-system').value;
    $('batch-archetype-wrap').hidden = rule !== 'bear-mercenary'; $('batch-template-wrap').hidden = rule !== 'universal';
    $('batch-preview').textContent = '首份：' + $('batch-prefix').value.trim() + ' · ' + String($('batch-start').value).padStart(4, '0') + '。每份保存独立字段，可继续用 AI 辅助填写。';
    batchRequest = null;
  }
  async function* lines(file) {
    const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader(); let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break; buffer += value;
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, index).trim(); buffer = buffer.slice(index + 1); if (line) yield line; }
        if (buffer.length > 12 * 1024 * 1024) throw new Error('单份角色数据过大，无法分批导入。');
      }
      if (buffer.trim()) yield buffer.trim();
    } finally { await reader.cancel(); reader.releaseLock(); }
  }
  async function importFile(file, name) {
    let imported = 0, target = null, over = 0;
    const make = async meta => { const result = await API.request('/libraries', { name, meta, description: '导入自 ' + file.name.slice(0, 250) }); target = result.id; currentId = target; return target; };
    const send = async cards => {
      const response = await API.request('/libraries/' + target + '/import', { requestId: crypto.randomUUID(), cards });
      imported += response.count; over += response.overLimit; $('import-library-progress').textContent = '已保存 ' + imported.toLocaleString() + ' 份角色…';
    };
    try {
      if (/\.(ndjson|jsonl)$/i.test(file.name)) {
        let first = true, batch = [], bytes = 0;
        for await (const line of lines(file)) {
          const data = JSON.parse(line);
          if (first) {
            if (data.format !== 'bear-tavern-library' || data.version !== 1 || !data.state) throw new Error('不支持的角色库文件格式。');
            const meta = M.normalizeState({ ...data.state, cards: [] }); await make(meta); first = false; continue;
          }
          if (data.type !== 'card' || !data.card) throw new Error('角色库文件包含无法识别的行。');
          if (batch.length && (batch.length >= 100 || bytes + line.length * 3 > 8 * 1024 * 1024)) { await send(batch); batch = []; bytes = 0; }
          batch.push(data.card); bytes += line.length * 3;
        }
        if (first) throw new Error('角色库文件为空。'); if (batch.length) await send(batch);
      } else {
        if (file.size > 12 * 1024 * 1024) throw new Error('普通 JSON 最大 12 MB，大型角色库请使用 NDJSON 导出文件。');
        const raw = await file.text(), context = (await API.request('/libraries/' + (library()?.id || 'default') + '/editor')).state;
        const parsed = M.parseImport(raw, context, { systemId: $('import-library-system').value });
        const meta = M.normalizeState({ ...context, cards: [], ...(parsed.world ? { world: parsed.world } : {}), ...(parsed.combatRules ? { combatRules: parsed.combatRules } : {}), customRules: [...new Map([...context.customRules, ...(parsed.customRules || [])].map(item => [item.id, item])).values()], sheetTemplates: [...new Map([...context.sheetTemplates, ...(parsed.sheetTemplates || [])].map(item => [item.id, item])).values()] });
        await make(meta); for (let i = 0; i < parsed.cards.length; i += 50) await send(parsed.cards.slice(i, i + 50));
      }
      message('导入完成：' + imported.toLocaleString() + ' 份角色。' + (over ? over + ' 份佣兵属性超限，原值已保留，可用“属性超限”筛选调整。' : '')); return imported;
    } catch (error) {
      throw new Error(error.message + (target ? ' 已导入 ' + imported + ' 份，保留在“' + name + '”中；其他角色库未改动。' : ' 原有角色库未改动。'));
    }
  }
  function bind() {
    document.querySelectorAll('[data-close]').forEach(node => node.addEventListener('click', () => { if (!busy) $(node.dataset.close).close(); }));
    document.querySelectorAll('dialog').forEach(node => node.addEventListener('cancel', event => { if (busy) event.preventDefault(); }));
    $('library-new').addEventListener('click', () => openLibraryForm()); $('library-edit').addEventListener('click', () => openLibraryForm(true));
    $('library-form').addEventListener('submit', async event => {
      event.preventDefault(); if (busy) return; controls(true); $('library-form-error').textContent = '';
      try {
        const body = { name: $('library-name-input').value.trim(), description: $('library-description-input').value, parentId: $('library-parent-input').value || null };
        if (editing) { body.archived = $('library-archive-input').checked; body.revision = editing.revision; await API.request('/libraries/' + editing.id, body, 'PATCH'); }
        else { body.copyFrom = $('library-copy-input').value || null; currentId = (await API.request('/libraries', body)).id; }
        $('library-form-dialog').close(); page = 1; await refresh(); message('角色库已保存。');
      } catch (error) { $('library-form-error').textContent = error.message; } finally { controls(false); }
    });
    $('library-search').addEventListener('input', renderTree); $('show-archived-libraries').addEventListener('change', renderTree);
    document.querySelectorAll('[data-status]').forEach(node => node.addEventListener('click', () => { status = node.dataset.status; clearAndReload(); renderLibraries(); }));
    $('library-filters').addEventListener('submit', event => { event.preventDefault(); clearAndReload(); });
    ['filter-query', 'filter-tag'].forEach(id => $(id).addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(clearAndReload, 250); }));
    ['filter-system', 'filter-category', 'filter-role', 'filter-over-limit', 'filter-sort', 'filter-size'].forEach(id => $(id).addEventListener('change', clearAndReload));
    $('library-filters').addEventListener('reset', () => { setTimeout(clearAndReload, 0); });
    $('page-prev').addEventListener('click', () => { page--; loadPage().catch(failure); }); $('page-next').addEventListener('click', () => { page++; loadPage().catch(failure); });
    $('page-jump').addEventListener('submit', event => { event.preventDefault(); if (!$('page-jump').reportValidity()) return; page = Number($('page-number').value); loadPage().catch(failure); });
    $('select-page').addEventListener('change', event => { allSelected = false; result.items.forEach(item => { if (event.target.checked) picked.set(item.id, item.revision); else picked.delete(item.id); }); renderSelection(); });
    $('selection-clear').addEventListener('click', resetSelection); $('select-filtered').addEventListener('click', () => { allSelected = true; picked.clear(); renderSelection(); });
    $('bulk-form').addEventListener('submit', async event => {
      event.preventDefault(); if (busy || !operation) return; controls(true); $('bulk-error').textContent = '';
      try {
        if (operation.action === 'move') { operation.target = $('bulk-target').value; if (!operation.target) throw new Error('请选择目标角色库。'); }
        if (operation.action === 'tags') { const tags = value => [...new Set(value.split(/[,，、]+/).map(item => item.trim()).filter(Boolean))]; operation.add = tags($('bulk-tags-add').value); operation.remove = tags($('bulk-tags-remove').value); if (!operation.add.length && !operation.remove.length) throw new Error('请填写需要添加或移除的标签。'); }
        const outcome = await API.request('/bulk', operation); $('bulk-dialog').close(); message('已' + actions[operation.action] + ' ' + outcome.count.toLocaleString() + ' 份角色。'); operation = null; await refresh();
      } catch (error) { $('bulk-error').textContent = error.message; } finally { controls(false); }
    });
    $('library-refresh').addEventListener('click', async () => { controls(true); try { await API.connect(); await refresh(); $('library-error').hidden = true; } catch (error) { failure(error); } finally { controls(false); } });
    $('library-export').addEventListener('click', () => { if (library()) { location.assign(API.url('/libraries/' + currentId + '/export')); message('正在下载本库档案（包含秘密备注，回收站单独保留在数据库备份中）。'); } });
    ['database-info', 'database-mobile'].forEach(id => $(id).addEventListener('click', () => { if (!database) return failure(new Error('本机后台尚未连接，请先刷新连接。')); $('database-path').value = database.database; $('database-dialog').showModal(); }));
    $('library-theme').addEventListener('click', () => {
      const theme = document.documentElement.dataset.tavernTheme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.tavernTheme = theme; document.documentElement.style.colorScheme = theme;
      try { localStorage.setItem('bearTavern.characters.theme', theme); } catch (_) {} });
    window.addEventListener('bear-tavern:themechange', event => { document.documentElement.dataset.tavernTheme = event.detail.theme; document.documentElement.style.colorScheme = event.detail.theme; });
    $('library-batch-create').addEventListener('click', async () => {
      if (!library()) return; controls(true);
      try { batchOptions((await API.request('/libraries/' + currentId + '/editor')).state); $('batch-error').textContent = ''; $('batch-dialog').showModal(); } catch (error) { failure(error); } finally { controls(false); }
    });
    ['batch-system', 'batch-archetype', 'batch-template', 'batch-prefix', 'batch-count', 'batch-start', 'batch-role', 'batch-category', 'batch-tags'].forEach(id => $(id).addEventListener('input', batchChange));
    $('batch-form').addEventListener('submit', async event => {
      event.preventDefault(); if (busy) return; controls(true); $('batch-error').textContent = '';
      try {
        batchRequest = batchRequest || { requestId: crypto.randomUUID(), systemId: $('batch-system').value, archetype: $('batch-archetype').value, templateId: $('batch-template').value, role: $('batch-role').value, category: $('batch-category').value, tags: [...new Set($('batch-tags').value.split(/[,，、]+/).map(item => item.trim()).filter(Boolean))], prefix: $('batch-prefix').value.trim(), count: Number($('batch-count').value), start: Number($('batch-start').value) };
        const created = await API.request('/libraries/' + currentId + '/create', batchRequest); batchRequest = null; $('batch-dialog').close(); status = 'active'; page = 1; await refresh(); message('已创建 ' + created.count + ' 份独立角色档案。可按分类查找，再打开完善。');
      } catch (error) { $('batch-error').textContent = error.message; } finally { controls(false); }
    });
    $('library-import').addEventListener('click', () => {
      $('import-library-form').reset(); $('import-library-error').textContent = ''; $('import-library-progress').textContent = '';
      $('import-library-system').replaceChildren(...M.BUILTIN_TEMPLATES.map(item => new Option(item.name, item.id))); $('import-library-system').value = 'coc7'; $('import-library-dialog').showModal();
    });
    $('import-library-form').addEventListener('submit', async event => {
      event.preventDefault(); if (busy) return; const file = $('import-library-file').files[0]; if (!file) return;
      controls(true); $('import-library-error').textContent = ''; $('import-library-progress').textContent = '正在读取文件…';
      try { await importFile(file, $('import-library-name').value.trim()); $('import-library-dialog').close(); status = 'all'; page = 1; }
      catch (error) { $('import-library-error').textContent = error.message; }
      finally { try { await refresh(); } catch (error) { failure(error); } controls(false); }
    });
    window.addEventListener('beforeunload', event => { if (busy) { event.preventDefault(); event.returnValue = ''; } });
  }
  async function boot() {
    controls(true);
    $('filter-category').replaceChildren(new Option('全部分类', 'all'), ...M.CATEGORIES.map(item => new Option(item.label, item.id)));
    $('filter-role').replaceChildren(new Option('全部类型', 'all'), ...M.ROLES.map(item => new Option(item.label, item.id)));
    try { document.documentElement.dataset.tavernTheme = localStorage.getItem('bearTavern.characters.theme') === 'light' ? 'light' : 'dark'; } catch (_) {}
    bind();
    try {
      database = await API.connect();
      try { await migrateBrowser(); } catch (error) { failure(new Error('浏览器档案尚未迁移，原始数据已保留：' + error.message)); }
      $('connection-state').textContent = '本机后台已连接'; $('database-engine').textContent = 'SQLite / ' + (database.fullTextIndex ? '全文索引' : '分页检索');
      await refresh();
    } catch (error) { failure(error); $('connection-state').textContent = '后台连接失败'; $('library-create').hidden = true; $('library-settings').hidden = true; }
    finally { controls(false); }
  }
  boot();
})();
