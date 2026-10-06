/* Bear Tavern iframe protocol v1. Tool business commands require opt-in APIs. */
(function (root) {
  'use strict';
  if (root.BearTavernBridge) return;
  const NAMESPACE = 'bear-tavern.trpg';
  const VERSION = 1;
  const scriptURL = document.currentScript?.src;
  const siteURL = scriptURL ? new URL('../../', scriptURL) : new URL('./', location.href);
  const query = new URLSearchParams(location.search);
  const embedded = query.get('embed') === '1' && root.parent !== root;
  const aliases = { 'iachara-charamemo-creator': 'charamemo-generator', 'scenario-snippet-builder': 'scenario-info-snippet-builder' };
  const directory = location.pathname.match(/\/tools\/([^/]+)/)?.[1];
  const toolId = aliases[directory] || directory || (location.pathname.endsWith('/workspace.html') ? 'workspace' : 'portal');
  let allowedOrigin = null;
  let context = Object.freeze({});
  let initialized = false;
  let requestedTheme = null;
  let eventSequence = 0;
  let activeRenderRequest = null;
  const APNG_COMMANDS = ['host:apng-configure', 'host:apng-render', 'host:apng-play', 'host:apng-pause', 'host:apng-cancel', 'host:apng-templates'];

  function apngEnabled() {
    return toolId === 'text-apng-maker' && query.get('api') === '1' && root.TextApngMakerApi?.apiEnabled === true;
  }

  // An origin must be a complete http(s) origin, never a wildcard, path or opaque "null".
  function validOrigin(value) {
    try {
      const url = new URL(value);
      return /^https?:$/.test(url.protocol) && url.origin === value ? url.origin : null;
    } catch (_) { return null; }
  }
  if (embedded) {
    if (query.has('hostOrigin')) allowedOrigin = validOrigin(query.get('hostOrigin'));
    else {
      try { if (root.parent.location.origin === location.origin) allowedOrigin = location.origin; } catch (_) { /* Explicit origin is required cross-origin. */ }
    }
  }

  const themeAdapters = {
    'text-apng-maker': ['#themeBtn', 'is-dark'],
    'haikei-motion-maker': ['#themeBtn', 'is-dark'],
    'indoor-map-maker': ['#themeBtn', 'is-dark'],
    'coc-growth-checker': ['#themeToggleBtn', 'dark'],
    'dice-stat-analyst': ['#themeToggleBtn', 'dark'],
    'scenario-pdf-parser': ['#themeToggleBtn', 'theme-night'],
    'kantan-icon-maker': ['#themeToggle', 'theme-night'],
    'iachara-charamemo-creator': ['#themeToggleButton', 'theme-night'],
    'investigator-helper': ['#themeToggle', 'theme-dark'],
    'session-log-tool': ['#themeToggleBtn', 'night-mode'],
    'session-check-calendar': ['#themeBtn', '!light'],
    'digital-grand-grimoire': ['#themeToggle', '!light'],
    'npc-data-reader': ['#themeBtn', '!light'],
    'trpg-hashtag-searcher': ['#themeToggleButton', '!light-mode'],
    'chara-libra-tool': ['#themeBtn', '@body'],
    'scenario-snippet-builder': ['#themeToggle', '@html']
  };
  function nativeTheme() {
    if (toolId === 'workspace') return document.body?.dataset.theme === 'light' ? 'light' : 'dark';
    const adapter = themeAdapters[directory];
    if (!adapter || !document.body || !document.querySelector(adapter[0])) return null;
    const marker = adapter[1];
    if (marker === '@body') return document.body.dataset.theme === 'light' ? 'light' : 'dark';
    if (marker === '@html') return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    const dark = marker.startsWith('!') ? !document.body.classList.contains(marker.slice(1)) : document.body.classList.contains(marker);
    return dark ? 'dark' : 'light';
  }
  function capabilities() {
    const apngApi = apngEnabled();
    return { language: ['ja', 'zh'], theme: toolId === 'workspace' || nativeTheme() !== null ? 'native' : 'color-scheme', context: true, apngApi, exportTransfer: apngApi };
  }
  function getState() {
    return { embedded: embedded && Boolean(allowedOrigin), toolId, language: root.TRPGSiteLanguage?.get() || document.documentElement.lang, theme: nativeTheme() || requestedTheme || 'light', capabilities: capabilities(), context: { ...context } };
  }
  function send(type, payload, requestId, transfer = []) {
    if (!embedded || !allowedOrigin) return;
    root.parent.postMessage({ namespace: NAMESPACE, version: VERSION, type, requestId: requestId || 'tool-' + (++eventSequence), payload }, allowedOrigin, transfer);
  }
  function setTheme(theme) {
    if (theme !== 'dark' && theme !== 'light') throw new TypeError('theme must be dark or light');
    if (!document.body) throw new Error('tool is not ready');
    const adapter = themeAdapters[directory];
    if (toolId === 'workspace') document.body.dataset.theme = theme;
    else if (adapter && nativeTheme() !== null && nativeTheme() !== theme) {
      const button = document.querySelector(adapter[0]);
      if (!button) throw new Error('native theme control is unavailable');
      button.click();
      if (nativeTheme() !== theme) throw new Error('native theme control did not apply the requested theme');
    }
    requestedTheme = theme;
    document.documentElement.dataset.tavernTheme = theme;
    document.documentElement.style.colorScheme = theme;
    root.dispatchEvent(new CustomEvent('bear-tavern:themechange', { detail: { theme } }));
    return getState();
  }
  function setLanguage(language) {
    if (!['ja', 'zh'].includes(language)) throw new TypeError('bridge v1 supports ja and zh');
    if (!root.TRPGSiteLanguage) throw new Error('shared language service is unavailable');
    root.TRPGSiteLanguage.set(language);
  }
  function validateContext(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('context must be an object');
    const next = {};
    for (const key of Object.keys(value)) {
      if (!['sessionId', 'sceneId', 'role'].includes(key)) throw new TypeError('unsupported context field: ' + key);
      const item = value[key];
      if (typeof item !== 'string' || !item.length || item.length > 128) throw new TypeError('context values must be non-empty strings of at most 128 characters');
      if (key === 'role' && !['gm', 'player', 'observer'].includes(item)) throw new TypeError('role must be gm, player or observer');
      next[key] = item;
    }
    return next;
  }
  function setContext(value) {
    context = Object.freeze(validateContext(value));
    root.dispatchEvent(new CustomEvent('bear-tavern:contextchange', { detail: { context: { ...context } } }));
  }
  async function apngResult(result) {
    const { blob, ...metadata } = result;
    if (!(blob instanceof Blob) || blob.type !== 'image/png') throw new Error('APNG renderer returned an invalid file');
    return { ...metadata, data: await blob.arrayBuffer(), mimeType: 'image/png', size: blob.size };
  }

  async function processApng(message) {
    const fail = (code, error) => send('tool:result', { ok: false, code, error }, message.requestId);
    if (!apngEnabled()) { fail('API_DISABLED', 'APNG commands require embed=1&api=1'); return; }
    const api = root.TextApngMakerApi;
    const payload = message.payload || {};
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) { fail('INVALID_CONFIG', 'payload must be an object'); return; }
    const keys = message.type === 'host:apng-configure' || message.type === 'host:apng-render' ? ['config']
      : message.type === 'host:apng-cancel' ? ['targetRequestId'] : [];
    if (Object.keys(payload).some(key => !keys.includes(key))) { fail('INVALID_CONFIG', 'unsupported command field'); return; }
    try {
      let result;
      if (message.type === 'host:apng-configure') {
        if (!Object.prototype.hasOwnProperty.call(payload, 'config')) throw Object.assign(new Error('config is required'), { code: 'INVALID_CONFIG' });
        result = api.configure(payload.config);
      } else if (message.type === 'host:apng-render') {
        if (api.isExporting()) throw Object.assign(new Error('An export is already running'), { code: 'BUSY' });
        activeRenderRequest = message.requestId;
        const rendered = await api.render(payload.config, { onProgress: progress => send('tool:apng-progress', progress, message.requestId) });
        result = await apngResult(rendered);
      } else if (message.type === 'host:apng-play') result = api.play();
      else if (message.type === 'host:apng-pause') result = api.pause();
      else if (message.type === 'host:apng-templates') result = { templates: api.getTemplates() };
      else {
        const target = payload.targetRequestId;
        if (target !== undefined && (typeof target !== 'string' || !target.length || target.length > 128)) throw Object.assign(new Error('invalid targetRequestId'), { code: 'INVALID_CONFIG' });
        result = target && target !== activeRenderRequest ? { cancelled: false } : api.cancel();
        if (result.cancelled && activeRenderRequest) result.targetRequestId = activeRenderRequest;
      }
      send('tool:result', { ok: true, result }, message.requestId, result?.data instanceof ArrayBuffer ? [result.data] : []);
    } catch (error) {
      fail(error.code || 'RENDER_FAILED', error.message || 'APNG request failed');
    } finally {
      if (message.type === 'host:apng-render' && activeRenderRequest === message.requestId) activeRenderRequest = null;
    }
  }

  function processMessage(event) {
    if (!initialized || !embedded || !allowedOrigin || event.source !== root.parent || event.origin !== allowedOrigin) return;
    const message = event.data;
    if (!message || typeof message !== 'object' || message.namespace !== NAMESPACE || message.version !== VERSION || typeof message.requestId !== 'string' || !message.requestId.length || message.requestId.length > 128) return;
    if (APNG_COMMANDS.includes(message.type)) { void processApng(message); return; }
    if (!['host:hello', 'host:set-language', 'host:set-theme', 'host:set-context', 'host:get-state'].includes(message.type)) return;
    const payload = message.payload || {};
    try {
      // Validate all hello fields before changing any state.
      if (message.type === 'host:hello') {
        if ('language' in payload && !['ja', 'zh'].includes(payload.language)) throw new TypeError('bridge v1 supports ja and zh');
        if ('theme' in payload && !['dark', 'light'].includes(payload.theme)) throw new TypeError('theme must be dark or light');
        if ('context' in payload) validateContext(payload.context);
        if ('language' in payload) setLanguage(payload.language);
        if ('theme' in payload) setTheme(payload.theme);
        if ('context' in payload) setContext(payload.context);
        send('tool:ready', { ok: true, state: getState() }, message.requestId);
        return;
      }
      if (message.type === 'host:set-language') setLanguage(payload.language);
      if (message.type === 'host:set-theme') setTheme(payload.theme);
      if (message.type === 'host:set-context') setContext(payload.context);
      send('tool:result', { ok: true, state: getState() }, message.requestId);
    } catch (error) {
      send('tool:result', { ok: false, error: error.message }, message.requestId);
    }
  }

  function hideChrome(scope) {
    const selector = 'a[href],[data-tavern-chrome="hidden"],button#xShareBtn,button#shareXBtn,button#shareXButton,button.x-share-btn';
    const links = scope.matches?.(selector) ? [scope] : Array.from(scope.querySelectorAll?.(selector) || []);
    links.forEach(link => {
      if (link.closest('.legal-footer,[data-tavern-brand-preserve]')) return;
      const hide = () => { link.setAttribute('data-tavern-chrome', 'hidden'); link.style.setProperty('display', 'none', 'important'); };
      if (link.hasAttribute('data-tavern-chrome') || link.matches('button')) { hide(); return; }
      try {
        const url = new URL(link.getAttribute('href'), location.href);
        const localPortal = url.origin === siteURL.origin && [siteURL.pathname, siteURL.pathname + 'index.html', siteURL.pathname + 'dev.html'].includes(url.pathname);
        const share = /^(?:twitter\.com|x\.com)$/.test(url.hostname) && url.pathname.startsWith('/intent/');
        if (localPortal || share) hide();
      } catch (_) { /* A malformed link remains visible. */ }
    });
  }
  function init() {
    initialized = true;
    if (!embedded || !allowedOrigin) return;
    document.documentElement.dataset.tavernEmbedded = 'true';
    const style = document.createElement('style');
    style.textContent = '[data-tavern-embedded="true"] [data-tavern-chrome="hidden"]{display:none!important}';
    document.head.appendChild(style);
    hideChrome(document);
    new MutationObserver(records => records.forEach(record => {
      if (record.type === 'attributes') hideChrome(record.target);
      else record.addedNodes.forEach(node => { if (node.nodeType === 1) hideChrome(node); });
    })).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
    if (['ja', 'zh'].includes(query.get('lang'))) setLanguage(query.get('lang'));
    if (['dark', 'light'].includes(query.get('theme'))) setTheme(query.get('theme'));
    send('tool:ready', { ok: true, state: getState() });
  }
  root.BearTavernBridge = Object.freeze({ namespace: NAMESPACE, version: VERSION, getState, getContext: () => ({ ...context }), setTheme });
  root.addEventListener('message', processMessage);
  root.addEventListener('trpg:languagechange', event => {
    if (initialized) send('tool:language', { language: event.detail.language });
  });
  root.addEventListener('bear-tavern:apng-export', event => {
    if (!initialized || !apngEnabled()) return;
    apngResult(event.detail).then(result => send('tool:apng-export', result, null, [result.data]))
      .catch(error => send('tool:apng-export', { ok: false, code: 'RENDER_FAILED', error: error.message }));
  });
  // Native tools register their own DOMContentLoaded initializers. Let all of
  // those finish before activating language or clicking an existing theme control.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => root.setTimeout(init, 0), { once: true });
  else root.setTimeout(init, 0);
})(window);
