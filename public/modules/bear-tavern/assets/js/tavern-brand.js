/* Bear Tavern identity and navigation for the tool suite. */
(function (root) {
  'use strict';
  if (root.BearTavernBrand) return;
  const script = document.currentScript;
  const portalURL = script ? new URL('../../', script.src) : new URL('./', location.href);
  const labels = {
    zh: { name: '熊酒馆 TRPG 网页工具', short: '熊酒馆', back: '返回熊酒馆工具首页' },
    en: { name: 'Bear Tavern · TRPG Tools', short: 'Tavern', back: 'Return to Bear Tavern tools' },
    ja: { name: '熊酒館 TRPG Webツール', short: '熊酒館', back: '熊酒館のツール一覧に戻る' },
    ko: { name: '곰 주점 TRPG 웹 도구', short: '곰 주점', back: '곰 주점 도구 목록으로 돌아가기' }
  };
  const aliases = /TRPG\s*WEB\s*ツール観測所|TRPG\s*WEB\s*(?:工具观测站|工具觀測站)|TRPG\s*Web\s*Tools\s*(?:Observatory|Portal)|TRPG\s*웹\s*도구\s*관측소|熊酒馆\s*·?\s*TRPG\s*网页工具|熊酒館\s*·?\s*TRPG\s*Webツール|Bear\s*Tavern\s*·?\s*TRPG\s*(?:Web\s*)?Tools|곰\s*주점\s*·?\s*TRPG\s*웹\s*도구/gi;
  // Local pages also use a compact product name in their title. This broader
  // pattern is confined to <title>, never to user content or the short wordmark.
  const titleAliases = new RegExp(aliases.source + '|熊酒馆(?:\\s*·?\\s*TRPG(?:\\s*(?:网页)?工具)?)?|熊酒館(?:\\s*·?\\s*TRPG(?:\\s*Webツール)?)?|Bear\\s*Tavern|곰\\s*주점', 'gi');
  const exactAlias = text => new RegExp('^(?:' + aliases.source + ')$', 'i').test(text.trim());
  const shortSelector = '.portal-short,.nav-short,#portalShort,[data-i18n="portalShort"]';
  const identitySelector = '.subpage-brand-title,.topbar-subtitle,.eyebrow,.site-kicker,.brand-kicker,.brand,.brand-block h1 span,h1,h2,#appEyebrow,[data-tavern-brand]';
  const excluded = 'script,style,noscript,textarea,pre,code,input,[contenteditable]:not([contenteditable="false"]),[data-tavern-brand-preserve]';
  const textRecords = new WeakMap();
  const attributeRecords = new WeakMap();
  const titleRecord = { source: null, applied: null };
  let ready = false;
  let enabled = true;
  let observer;
  let queued = false;
  const pending = new Set();

  function language() {
    const value = root.TRPGSiteLanguage?.get() || document.documentElement.lang || 'zh';
    return Object.hasOwn(labels, value) ? value : (value.startsWith('zh') ? 'zh' : 'en');
  }
  function brandText(value) { return String(value).replace(aliases, labels[language()].name); }
  function preserve(element) {
    if (!element || element.closest(excluded)) return true;
    // Native tools mark the whole body to opt out of DOM translation. Only a
    // narrower data marker denotes user-generated content for branding purposes.
    const protectedContent = element.closest('[data-site-no-translate],[translate="no"]');
    return Boolean(protectedContent && protectedContent !== document.body);
  }
  function retiredNavigation(element) {
    if (!element?.matches('a[href]') || preserve(element)) return false;
    try {
      const url = new URL(element.getAttribute('href'), location.href);
      if (!['http:', 'https:'].includes(url.protocol)) return false;
      const host = url.hostname.toLowerCase();
      if (host === 'kumachansteps.github.io') return true;
      if (['github.com', 'x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(host) && /^\/KumachanSteps(?:\/|$)/i.test(url.pathname)) return true;
      return url.origin === portalURL.origin && ['contact.html', 'privacy.html', 'terms.html'].some(name => url.pathname === portalURL.pathname + name);
    } catch (_) { return false; }
  }
  function cleanNavigation(node) {
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_NODE) return;
    const links = node.nodeType === Node.ELEMENT_NODE && node.matches('a[href]') ? [node] : [];
    links.push(...node.querySelectorAll('a[href]'));
    links.forEach(link => { if (retiredNavigation(link)) link.remove(); });
  }
  function portalLink(element) {
    if (!element?.matches('a[href]')) return false;
    try {
      const url = new URL(element.getAttribute('href'), location.href);
      return url.origin === portalURL.origin &&
        [portalURL.pathname, portalURL.pathname + 'index.html'].includes(url.pathname);
    } catch (_) { return false; }
  }
  function target(element) {
    if (preserve(element)) return false;
    if (element.matches(identitySelector + ',' + shortSelector + ',.portal-tooltip')) return true;
    const link = element.closest('a[href]');
    return portalLink(link) && !preserve(link);
  }
  function remember(record, value) {
    if (!record || (value !== record.source && value !== record.applied)) return { source: value, applied: null };
    return record;
  }
  function translateText(node) {
    const element = node.parentElement;
    if (!target(element) || !node.data.trim()) return;
    let record = remember(textRecords.get(node), node.data);
    let next = record.source;
    if (element.matches(shortSelector)) {
      if (/^(?:\s*←\s*)?(?:観測所|观测站|觀測站|관측소|Observatory|Portal|熊酒馆|熊酒館|Tavern|곰 주점)\s*$/i.test(next)) {
        next = '← ' + labels[language()].short;
      }
    } else if (element.matches(identitySelector)) {
      if (exactAlias(next) || (element.matches('.brand-block h1 span') && /^TRPG Web Tools$/i.test(next.trim()))) {
        next = next.replace(next.trim(), labels[language()].name);
      }
    } else {
      next = brandText(next);
    }
    record.applied = enabled ? next : record.source;
    textRecords.set(node, record);
    if (node.data !== record.applied) node.data = record.applied;
  }
  function translateAttributes(element) {
    if (preserve(element) || (!portalLink(element) && !element.matches(identitySelector + ',.portal-tooltip'))) return;
    let records = attributeRecords.get(element);
    if (!records) { records = new Map(); attributeRecords.set(element, records); }
    for (const key of ['title', 'aria-label', 'data-tooltip']) {
      if (!element.hasAttribute(key)) continue;
      const value = element.getAttribute(key);
      const record = remember(records.get(key), value);
      record.applied = enabled ? brandText(record.source) : record.source;
      records.set(key, record);
      if (value !== record.applied) element.setAttribute(key, record.applied);
    }
  }
  function translateTitle() {
    const current = document.title;
    if (titleRecord.source === null || (current !== titleRecord.source && current !== titleRecord.applied)) titleRecord.source = current;
    titleAliases.lastIndex = 0;
    const alreadyBranded = titleAliases.test(titleRecord.source);
    titleAliases.lastIndex = 0;
    let next = titleRecord.source.replace(titleAliases, labels[language()].name);
    if (enabled && !alreadyBranded) next += ' | ' + labels[language()].name;
    titleRecord.applied = enabled ? next : titleRecord.source;
    if (current !== titleRecord.applied) document.title = titleRecord.applied;
  }
  function applyTree(node) {
    cleanNavigation(node);
    if (node.nodeType === Node.TEXT_NODE) { translateText(node); return; }
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_NODE) return;
    if (node.nodeType === Node.ELEMENT_NODE && preserve(node) && node !== document.body) return;
    if (node.nodeType === Node.ELEMENT_NODE) translateAttributes(node);
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(candidate) {
        return candidate.nodeType === Node.ELEMENT_NODE && preserve(candidate) && candidate !== document.body
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) {
      const candidate = walker.currentNode;
      if (candidate.nodeType === Node.TEXT_NODE) translateText(candidate);
      else translateAttributes(candidate);
    }
  }
  function syncAddedNavigation() {
    const nav = document.querySelector('[data-tavern-generated-nav]');
    if (!nav) return;
    const link = nav.querySelector('a');
    const next = '← ' + labels[language()].back;
    if (link.textContent !== next) link.textContent = next;
    nav.hidden = !enabled;
  }
  function apply() {
    if (!ready) return;
    translateTitle();
    applyTree(document.documentElement);
    syncAddedNavigation();
  }
  function init() {
    ready = true;
    const isTool = location.pathname.includes('/tools/');
    if (isTool && !Array.from(document.querySelectorAll('a[href]')).some(portalLink)) {
      const nav = document.createElement('nav');
      nav.className = 'tavern-tool-nav'; nav.dataset.tavernGeneratedNav = '';
      nav.setAttribute('aria-label', 'Bear Tavern');
      const link = document.createElement('a'); link.href = portalURL.href;
      nav.appendChild(link); document.body.prepend(nav);
      const style = document.createElement('style');
      style.textContent = '.tavern-tool-nav{position:relative;z-index:40;padding:8px 16px;font:13px/1.5 system-ui,"Microsoft YaHei",sans-serif}.tavern-tool-nav a{display:inline-block;color:inherit;text-decoration:none}.tavern-tool-nav a:hover{text-decoration:underline}.tavern-tool-nav a:focus-visible{outline:2px solid currentColor;outline-offset:4px}[data-tavern-embedded="true"] .tavern-tool-nav{display:none}@media print{.tavern-tool-nav{display:none}}';
      document.head.appendChild(style);
    }
    apply();
    observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'childList') record.addedNodes.forEach(node => pending.add(node));
        else pending.add(record.target);
      }
      if (queued || !pending.size) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        const nodes = [...pending]; pending.clear();
        translateTitle();
        nodes.forEach(node => { if (node.isConnected) applyTree(node); });
        syncAddedNavigation();
      });
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label', 'data-tooltip', 'href'] });
  }
  root.BearTavernBrand = {
    get name() { return labels[language()].name; },
    apply, text: brandText,
    setEnabled(value) { enabled = Boolean(value); apply(); }
  };
  root.addEventListener('trpg:languagechange', apply);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
