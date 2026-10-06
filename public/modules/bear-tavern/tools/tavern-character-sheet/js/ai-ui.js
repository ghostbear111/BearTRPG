(function () {
  'use strict';
  const AI = window.TavernCharacterAI;
  const $ = id => document.getElementById(id);
  const SETTINGS = 'bearTavern.characters.ai.settings.v1';
  const KEY = 'bearTavern.characters.ai.key.v1';
  let hooks, targetId, description, preview, undo, controller, timer, serial = 0;
  let config = { provider: 'ollama', ollama: { baseUrl: 'http://127.0.0.1:11434', model: '' }, api: { baseUrl: '', model: '' } };
  let apiKey = '';
  function node(tag, className, text) { const item = document.createElement(tag); if (className) item.className = className; if (text !== undefined) item.textContent = text; return item; }
  function status(text, error = false) { $('ai-status').textContent = text; $('ai-status').className = error ? 'form-error' : 'field-hint'; }
  function target() { return hooks.state().cards.find(card => card.id === targetId); }
  function settings() { return { provider: $('ai-provider').value, baseUrl: $('ai-base').value, model: $('ai-model').value, apiKey: $('ai-provider').value === 'api' ? $('ai-key').value : '' }; }
  function saveSettings() {
    const value = AI.connection(settings());
    config.provider = value.provider; config[value.provider] = { baseUrl: value.baseUrl, model: value.model };
    $('ai-connection-summary').textContent = '连接设置 · ' + (value.provider === 'ollama' ? 'Ollama' : 'API') + (value.model ? ' · ' + value.model : '');
    if (value.provider === 'api') apiKey = value.apiKey;
    let saved = true;
    try {
      localStorage.setItem(SETTINGS, JSON.stringify(config));
      if ($('ai-remember-key').checked && apiKey) localStorage.setItem(KEY, apiKey); else localStorage.removeItem(KEY);
    } catch (_) { saved = false; status('连接设置未能保存，可继续在本次访问中使用。', true); }
    return { ...value, saved };
  }
  function fillSettings() {
    $('ai-provider').value = config.provider;
    const value = config[config.provider]; $('ai-base').value = value.baseUrl; $('ai-model').value = value.model;
    $('ai-key').value = apiKey; $('ai-api-options').hidden = config.provider !== 'api';
    $('ai-base').placeholder = config.provider === 'ollama' ? 'http://127.0.0.1:11434' : 'https://你的服务地址/v1';
    $('ai-connection-hint').textContent = config.provider === 'ollama' ? '连接本地 Ollama，读取已安装模型。也可以输入局域网服务地址。' : '兼容 OpenAI Chat Completions；填写服务的基础地址（通常以 /v1 结尾）和模型名称。服务须允许浏览器跨域访问。';
    $('ai-model-list').replaceChildren();
  }
  function busy(value) {
    for (const id of ['ai-provider', 'ai-base', 'ai-model', 'ai-key', 'ai-scope', 'ai-brief', 'ai-models', 'ai-generate', 'ai-save-settings', 'ai-apply', 'ai-undo', 'ai-remember-key']) $(id).disabled = value;
    $('ai-cancel').hidden = !value;
    if (!value) updateSelection();
    if (!value) $('ai-undo').disabled = !undo;
    $('ai-preview').setAttribute('aria-busy', String(value));
  }
  function stop() { serial++; if (controller) controller.abort(); controller = null; clearTimeout(timer); busy(false); }
  async function operation(action, message, timeout = 180000) {
    stop(); controller = new AbortController(); const signal = controller.signal, token = serial; let timedOut = false;
    busy(true); status(message);
    timer = setTimeout(() => { timedOut = true; controller?.abort(); }, timeout);
    try { await action(signal, token); }
    catch (error) { if (token === serial) status(signal.aborted ? (timedOut ? '等待超时。可缩小填写范围或切换模型后重试。' : '已取消，角色卡未改变。') : error.message, true); }
    finally { if (token === serial) { clearTimeout(timer); controller = null; busy(false); } }
  }
  async function loadModels() {
    await operation(async (signal, token) => {
      const value = saveSettings(), names = await AI.models(value, signal);
      if (token !== serial) return;
      $('ai-model-list').replaceChildren(...names.map(name => { const item = document.createElement('option'); item.value = name; return item; }));
      if (!$('ai-model').value && names.length) $('ai-model').value = names.find(name => /^qwen3[:.]/.test(name)) || names[0];
      saveSettings(); status(names.length ? '已连接，读取到 ' + names.length + ' 个模型。模型可从列表选择或手动输入。' : '服务可用，暂无模型。请先在 Ollama 中安装模型。');
    }, '正在连接并读取模型…', 15000);
  }
  function selected() { return [...$('ai-preview').querySelectorAll('input:checked')].map(input => input.value); }
  function display(value) {
    if (value === undefined || value === '' || Array.isArray(value) && !value.length) return '（空白）';
    if (typeof value === 'boolean') return value ? '是' : '否';
    if (Array.isArray(value)) return value.map(item => typeof item === 'object' ? item.name + '：' + item.value : item).join('、');
    if (typeof value === 'object') return value.value + ' / ' + value.max;
    return String(value);
  }
  function renderPreview() {
    const container = $('ai-preview'); container.replaceChildren();
    if (!preview) { $('ai-preview-section').hidden = true; busy(false); return; }
    $('ai-preview-section').hidden = false;
    preview.changes.forEach(change => {
      const input = document.createElement('input'); input.type = 'checkbox'; input.value = change.id; input.checked = change.selected;
      input.setAttribute('aria-label', '应用 ' + change.label);
      const label = node('label', 'ai-suggestion');
      const content = node('div', 'ai-suggestion-content');
      content.append(node('strong', '', change.label), node('p', 'ai-before', '当前：' + display(change.before)), node('p', 'ai-after', '建议：' + display(change.after)));
      label.append(input, content); container.append(label);
    });
    $('ai-warnings').textContent = preview.warnings.join('\n'); $('ai-warnings').hidden = !preview.warnings.length;
    updateSelection();
  }
  function updateSelection() {
    const count = selected().length; $('ai-selection-count').textContent = '已选 ' + count + ' / ' + (preview?.changes.length || 0) + ' 项'; $('ai-apply').disabled = !count;
    $('ai-budget-status').hidden = true;
    if (!preview || !count || !target()) return;
    try {
      const next = AI.apply(target(), hooks.state(), preview.changes, selected()), budget = window.TavernCharacterModel.combatStatus(next, hooks.state());
      if (budget) { $('ai-budget-status').hidden = false; $('ai-budget-status').className = budget.valid ? 'field-hint' : 'form-error'; $('ai-budget-status').textContent = '应用后点数：' + budget.used + ' / ' + budget.total + '，剩余 ' + budget.remaining + (budget.valid ? '。' : '。原档案仍超限，请继续减点调整。'); }
    } catch (error) { $('ai-budget-status').hidden = false; $('ai-budget-status').className = 'form-error'; $('ai-budget-status').textContent = error.message + '。请取消部分数值建议或重新生成。'; $('ai-apply').disabled = true; }
  }
  async function generate() {
    let value, brief, card;
    try {
      value = saveSettings(); brief = $('ai-brief').value; card = target();
      if (!card) throw new Error('角色已不存在，请重新打开角色');
      description = AI.describe(card, hooks.state(), $('ai-scope').value);
      if (!description.fields.length) throw new Error('当前范围没有可填写字段，请选择其他范围');
      AI.prompt(description, brief);
    } catch (error) { status(error.message, true); return; }
    preview = null; renderPreview();
    await operation(async (signal, token) => {
      const text = await AI.generate(value, description, brief, signal);
      if (token !== serial || !target()) return;
      preview = AI.suggestions(text, description, card, hooks.state()); renderPreview();
      if (preview.changes.length) $('ai-connection-details').open = false;
      status(preview.changes.length ? '已生成 ' + preview.changes.length + ' 项建议。默认勾选空白或初始值；已有内容可逐项勾选覆盖。' : '没有可应用的建议。请查看校验提示、调整要求或切换模型。', !preview.changes.length);
    }, '正在生成角色建议…首次加载模型可能较慢，可随时取消。');
  }
  function apply() {
    try {
      const card = target(); if (!card || !preview) throw new Error('请重新生成预览');
      const next = AI.apply(card, hooks.state(), preview.changes, selected());
      const recovery = { before: JSON.parse(JSON.stringify(card)), after: JSON.parse(JSON.stringify(next)) };
      const saved = hooks.replace(next);
      undo = recovery;
      preview = null; renderPreview(); $('ai-undo').hidden = false; $('ai-undo').disabled = false;
      status(saved ? '已应用并保存。可撤销本次 AI 填写。' : '已应用到当前页面，尚未保存。请导出备份或检查存储提示。', !saved);
    } catch (error) { status(error.message, true); }
  }
  function undoApply() {
    if (!undo) return;
    const card = target();
    if (JSON.stringify(card) !== JSON.stringify(undo.after)) { status('应用后角色又有修改，请保留这些修改；本次无法整体撤销，可在角色卡中调整。', true); return; }
    try {
      const saved = hooks.replace(undo.before); undo = null; $('ai-undo').hidden = true;
      status(saved ? '已撤销本次 AI 填写。' : '已撤销，当前修改尚未保存。', !saved);
    } catch (error) { status(error.message, true); }
  }
  function initialize(options) {
    hooks = options;
    try { const stored = JSON.parse(localStorage.getItem(SETTINGS) || 'null'); if (stored && ['ollama', 'api'].includes(stored.provider)) { for (const provider of ['ollama', 'api']) if (stored[provider]) config[provider] = { baseUrl: String(stored[provider].baseUrl || ''), model: String(stored[provider].model || '') }; config.provider = stored.provider; } apiKey = localStorage.getItem(KEY) || ''; } catch (_) {}
    $('ai-remember-key').checked = !!apiKey;
    fillSettings();
    $('ai-provider').addEventListener('change', () => {
      stop(); const previous = config.provider;
      config[previous] = { baseUrl: $('ai-base').value, model: $('ai-model').value }; if (previous === 'api') apiKey = $('ai-key').value;
      config.provider = $('ai-provider').value; fillSettings(); preview = null; renderPreview(); status('填写连接设置后可读取模型。');
      if (config.provider === 'ollama') loadModels();
    });
    $('ai-save-settings').addEventListener('click', () => { try { const value = saveSettings(); if (value.saved) status('连接设置已保存。API Key ' + ($('ai-remember-key').checked ? '保存在此浏览器' : '仅用于本次访问') + '。'); } catch (error) { status(error.message, true); } });
    $('ai-remember-key').addEventListener('change', () => { if (!$('ai-remember-key').checked) try { localStorage.removeItem(KEY); } catch (_) {} });
    $('ai-models').addEventListener('click', loadModels); $('ai-generate').addEventListener('click', generate);
    $('ai-cancel').addEventListener('click', () => { stop(); status('已取消，角色卡未改变。'); });
    $('ai-dialog').addEventListener('close', stop);
    $('ai-scope').addEventListener('change', () => { preview = null; renderPreview(); });
    $('ai-preview').addEventListener('change', updateSelection);
    $('ai-select-empty').addEventListener('click', () => { for (const input of $('ai-preview').querySelectorAll('input')) input.checked = preview.changes.find(change => change.id === input.value).selected; updateSelection(); });
    $('ai-select-none').addEventListener('click', () => { for (const input of $('ai-preview').querySelectorAll('input')) input.checked = false; updateSelection(); });
    $('ai-apply').addEventListener('click', apply); $('ai-undo').addEventListener('click', undoApply);
  }
  function open(card) {
    stop(); targetId = card.id; preview = null; if (undo?.before.id !== targetId) undo = null; renderPreview();
    $('ai-title').textContent = 'AI 辅助填写 · ' + card.name;
    $('ai-undo').hidden = !undo; $('ai-connection-details').open = true; $('ai-brief').value = ''; $('ai-scope').value = 'all';
    status('描述角色定位、背景与强度，让 AI 按当前规则提出填写建议。');
    $('ai-dialog').showModal(); if (config.provider === 'ollama') loadModels();
  }
  window.TavernCharacterAIUI = Object.freeze({ initialize, open });
})();
