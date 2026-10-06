/* Shared language preference and reversible UI translations for standalone pages. */
(function (root) {
  'use strict';
  if (root.TRPGSiteLanguage) return;
  const KEY = 'trpgPortalLanguage';
  const LANGS = ['ja', 'en', 'ko', 'zh'];
  const normalize = value => /^zh(?:-|$)/i.test(value || '') ? 'zh' : String(value || '').split('-')[0];
  let stored = null;
  try { stored = localStorage.getItem(KEY); } catch (_) { /* Private browsing still works. */ }
  const browser = normalize(navigator.language || 'ja');
  let language = LANGS.includes(normalize(stored)) ? normalize(stored) : (LANGS.includes(browser) ? browser : 'en');
  const phrases = new Map();
  const patterns = [];
  const textOriginals = new WeakMap();
  const attrOriginals = new WeakMap();
  const normalizeText = text => String(text).replace(/\s+/g, ' ').trim();
  const ignored = 'script,style,noscript,textarea,pre,code,[contenteditable]:not([contenteditable="false"]),[translate="no"],[data-site-no-translate],.site-language-switcher';
  const attributes = ['placeholder', 'title', 'aria-label', 'alt', 'data-tooltip'];
  let ready = false;
  let observer;
  let queued = false;
  const pending = new Set();

  function t(value, target = language) {
    if (typeof value !== 'string' || normalize(target) !== 'zh') return value;
    const key = normalizeText(value);
    if (!key) return value;
    let translated = phrases.get(key);
    if (translated === undefined) {
      for (const [pattern, replacement] of patterns) {
        pattern.lastIndex = 0;
        if (pattern.test(key)) { pattern.lastIndex = 0; translated = key.replace(pattern, replacement); break; }
      }
    }
    return translated === undefined ? value : value.slice(0, value.indexOf(value.trimStart())) + translated + (value.match(/\s*$/)?.[0] || '');
  }

  function skipped(element) { return !element || Boolean(element.closest(ignored)); }

  function translateNode(node) {
    if (skipped(node.parentElement) || !node.data.trim()) return;
    // An option without a value derives its machine value from its text.
    const option = node.parentElement.closest('option');
    if (option && !option.hasAttribute('value')) option.setAttribute('value', option.textContent);
    let record = textOriginals.get(node);
    if (!record || (node.data !== record.source && node.data !== record.target)) record = { source: node.data };
    record.target = t(record.source);
    textOriginals.set(node, record);
    if (node.data !== record.target) node.data = record.target;
  }

  function translateAttributes(element) {
    if (element.matches('textarea') ? skipped(element.parentElement) : skipped(element)) return;
    let records = attrOriginals.get(element);
    if (!records) { records = new Map(); attrOriginals.set(element, records); }
    const names = attributes.slice();
    if (element.matches('meta[name="description"]')) names.push('content');
    if (element.matches('input[type="button"],input[type="submit"],input[type="reset"]')) names.push('value');
    names.forEach(name => {
      if (!element.hasAttribute(name)) return;
      const value = element.getAttribute(name);
      let record = records.get(name);
      if (!record || (value !== record.source && value !== record.target)) record = { source: value };
      record.target = t(record.source);
      records.set(name, record);
      if (value !== record.target) element.setAttribute(name, record.target);
    });
  }

  function translateTree(node) {
    if (node.nodeType === Node.TEXT_NODE) { translateNode(node); return; }
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_NODE) return;
    if (node.nodeType === Node.ELEMENT_NODE && skipped(node)) {
      if (node.matches('textarea')) translateAttributes(node);
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) translateAttributes(node);
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(candidate) {
        if (candidate.nodeType === Node.ELEMENT_NODE && candidate.matches(ignored)) {
          if (candidate.matches('textarea')) translateAttributes(candidate);
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) {
      const current = walker.currentNode;
      if (current.nodeType === Node.TEXT_NODE) translateNode(current);
      else translateAttributes(current);
    }
  }

  function syncButtons() {
    document.querySelectorAll('[data-site-language]').forEach(button => {
      const active = button.dataset.siteLanguage === (language === 'zh' ? 'zh' : 'ja');
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function apply() {
    if (!ready) return;
    translateTree(document.documentElement);
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : (document.documentElement.dataset.siteI18n === 'native' ? language : 'ja');
    syncButtons();
  }

  function set(next) {
    next = normalize(next);
    if (!LANGS.includes(next)) return;
    stored = next;
    try { localStorage.setItem(KEY, next); } catch (_) { /* Session-only preference. */ }
    if (next === language) { apply(); return; }
    language = next;
    root.dispatchEvent(new CustomEvent('trpg:languagechange', { detail: { language } }));
    apply();
  }

  function register(config) {
    Object.entries(config.phrases || {}).forEach(([source, target]) => {
      if (typeof target === 'string') phrases.set(normalizeText(source), target);
    });
    (config.patterns || []).forEach(([pattern, replacement]) => patterns.push([pattern instanceof RegExp ? pattern : new RegExp(pattern), replacement]));
    if (ready) apply();
  }

  root.TRPGSiteLanguage = { get: () => language, set, t, register, apply, hasPreference: () => stored !== null };
  register({ phrases: {
    'TRPG WEBツール観測所': 'TRPG WEB 工具观测站', 'TRPG Webツール観測所': 'TRPG WEB 工具观测站',
    '← TRPG WEBツール観測所': '← TRPG WEB 工具观测站', '← TRPG Webツール観測所': '← TRPG WEB 工具观测站',
    '←TRPG WEBツール観測所': '← TRPG WEB 工具观测站', 'TRPG WEBツール観測所に戻る': '返回 TRPG WEB 工具观测站',
    '使い方': '使用指南', 'ショートカット': '快捷键', 'ショートカット一覧': '快捷键列表', '利用上の注意': '使用须知',
    'ナイトモード': '深色模式', 'ライトモード': '浅色模式', '閉じる': '关闭', '開く': '打开', 'コピー': '复制',
    '保存': '保存', '削除': '删除', '追加': '添加', '編集': '编辑', 'キャンセル': '取消', 'リセット': '重置',
    'クリア': '清空', 'プレビュー': '预览', '検索': '搜索', 'すべて': '全部', '全て': '全部', '未入力': '未填写',
    '読み込み中': '加载中', '読み込み中…': '正在加载…', '再読み込み': '重新加载', 'ダウンロード': '下载',
    '不具合報告': '问题反馈', '改善要望': '改进建议', 'その他': '其他', 'メニューを開く': '打开菜单',
    'メニューを閉じる': '关闭菜单', '日本語': '日语', '英語': '英语', '韓国語': '韩语',
    'Home': '首页', 'Portal': '工具首页', 'Report': '反馈', 'Changelog': '更新记录', 'Privacy': '隐私政策',
    'Terms': '使用条款', 'Developer Login': '管理员登录', 'Developer Reports': '反馈管理',
    'Light': '浅色', 'Dark': '深色', 'Loading...': '正在加载…'
  } });

  ['alert', 'confirm', 'prompt'].forEach(name => {
    const original = root[name];
    if (typeof original === 'function') root[name] = function (message, ...args) { return original.call(root, t(String(message)), ...args); };
  });

  root.addEventListener('storage', event => {
    if (event.key === KEY && event.newValue) set(event.newValue);
  });

  function init() {
    ready = true;
    if (document.documentElement.dataset.siteI18n !== 'native') {
      const nav = document.createElement('nav');
      nav.className = 'site-language-switcher';
      nav.setAttribute('aria-label', 'Language / 语言');
      for (const [lang, label] of [['ja', '日本語'], ['zh', '简体中文']]) {
        const button = document.createElement('button');
        button.type = 'button'; button.dataset.siteLanguage = lang; button.textContent = label;
        button.lang = lang === 'zh' ? 'zh-CN' : lang;
        button.addEventListener('click', () => set(lang));
        nav.appendChild(button);
      }
      document.body.prepend(nav);
      const style = document.createElement('style');
      style.textContent = '.site-language-switcher{position:relative;z-index:50;display:flex;justify-content:flex-end;gap:4px;max-width:100%;padding:8px 16px;box-sizing:border-box;font:13px/1.4 system-ui,"Microsoft YaHei",sans-serif}.site-language-switcher button{appearance:none;cursor:pointer;padding:5px 10px;border:1px solid #b4c0d0;border-radius:16px;background:#f8fafc;color:#334155;font:inherit}.site-language-switcher button[aria-pressed="true"]{background:#2563eb;border-color:#2563eb;color:#fff}.site-language-switcher button:focus-visible{outline:2px solid #f59e0b;outline-offset:2px}@media print{.site-language-switcher{display:none}}';
      document.head.appendChild(style);
    }
    apply();
    observer = new MutationObserver(records => {
      records.forEach(record => {
        if (record.type === 'childList') record.addedNodes.forEach(node => pending.add(node));
        else pending.add(record.target);
      });
      if (queued || !pending.size) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        const nodes = Array.from(pending); pending.clear();
        nodes.forEach(node => { if (node.isConnected) translateTree(node); });
      });
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...attributes, 'content', 'value'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
