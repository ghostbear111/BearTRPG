/* Same-origin local database client; credentials stay outside character data. */
(function () {
  'use strict';
  const base = '/api/character-library';
  let status = null;
  async function request(path, body, method = 'POST', reconnect = true) {
    const options = { credentials: 'same-origin', cache: 'no-store' };
    if (body !== undefined) Object.assign(options, { method, headers: { 'Content-Type': 'application/json', 'X-Bear-Tavern-Token': status?.token || '' }, body: JSON.stringify(body) });
    let response;
    try { response = await fetch(base + path, options); } catch (_) { throw new Error('无法连接本机后台。请保持预览服务运行，再重试保存。'); }
    let result;
    try { result = await response.json(); } catch (_) { throw new Error('本机后台尚未启动。请通过 scripts/preview.py 启动网站。'); }
    if (reconnect && path !== '/status' && (response.status === 401 || response.status === 403 && result.error === '后台请求校验失败，请刷新页面。')) {
      await connect(); return request(path, body, method, false);
    }
    if (!response.ok) { const error = new Error(result.error || '后台请求失败。'); error.status = response.status; throw error; }
    return result;
  }
  async function connect() { status = await request('/status'); return status; }
  function url(path) { return base + path; }
  async function editor(library, card, onStatus) {
    const initial = await request('/libraries/' + encodeURIComponent(library) + '/editor' + (card ? '?card=' + encodeURIComponent(card) : ''));
    let scope = initial.scope, revision = initial.libraryRevision, references = initial.references;
    let saved = JSON.stringify(initial.state), pending = null, flight = null, failed = null, problem = null;
    const path = '/libraries/' + encodeURIComponent(library) + '/editor';
    async function drain() {
      try {
        while (failed || pending) {
          const item = failed || { serialized: pending, body: { requestId: crypto.randomUUID(), state: JSON.parse(pending), scope: { ...scope }, libraryRevision: revision } };
          if (!failed) pending = null;
          failed = item; problem = null; onStatus('saving');
          const result = await request(path, item.body);
          scope = result.scope; revision = result.libraryRevision; references = result.references;
          saved = item.serialized; failed = null;
          if (pending === saved) pending = null;
        }
        onStatus('saved', saved);
      } catch (error) { problem = error; onStatus('error', error); }
      finally { flight = null; }
    }
    return {
      library, name: initial.libraryName, state: initial.state,
      get references() { return references; },
      get busy() { return Boolean(flight || pending || failed); },
      enqueue(state) {
        const next = JSON.stringify(state);
        if (next === saved && !failed && !flight) return;
        pending = next;
        if (!flight && !problem) flight = drain();
      },
      async flush() {
        if (!flight && (pending || failed)) flight = drain();
        while (flight) await flight;
        if (problem) throw problem;
      },
      async retry() { problem = null; await this.flush(); }
    };
  }
  window.TavernLibrary = { connect, request, url, editor };
})();
