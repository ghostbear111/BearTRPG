/* Bear Tavern APNG host client. Plain browser JavaScript; no framework required. */
(function (root) {
  'use strict';
  if (root.BearTavernApng) return;
  const NAMESPACE = 'bear-tavern.trpg';
  const VERSION = 1;
  const scriptURL = document.currentScript?.src;
  const defaultBase = scriptURL ? new URL('../../', scriptURL).href : new URL('./', location.href).href;

  function problem(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
  }
  function record(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
  function output(result) {
    if (!record(result) || !(result.data instanceof ArrayBuffer) || result.data.byteLength === 0 || result.mimeType !== 'image/png') {
      throw problem('The tool returned an invalid APNG file.', 'INVALID_RESPONSE');
    }
    for (const key of ['width', 'height', 'frames', 'encodedFrames']) {
      if (!Number.isSafeInteger(result[key]) || result[key] < 1) throw problem('Invalid APNG metadata: ' + key, 'INVALID_RESPONSE');
    }
    for (const key of ['duration', 'fps', 'loops']) {
      if (!Number.isFinite(result[key]) || result[key] < 0) throw problem('Invalid APNG metadata: ' + key, 'INVALID_RESPONSE');
    }
    const fileName = typeof result.fileName === 'string' ? result.fileName.replace(/[\\/\u0000-\u001f\u007f]/g, '_').slice(0, 180) : 'tavern-text.png';
    return Object.freeze({
      data: result.data,
      blob: new Blob([result.data], { type: 'image/png' }),
      mimeType: 'image/png', fileName: fileName || 'tavern-text.png',
      width: result.width, height: result.height,
      frames: result.frames, encodedFrames: result.encodedFrames,
      duration: result.duration, fps: result.fps, loops: result.loops,
      fontFallbacks: Object.freeze(Array.isArray(result.fontFallbacks) ? result.fontFallbacks.filter(item => record(item) && typeof item.fontId === 'string').slice(0, 16).map(item => Object.freeze({
        fontId: item.fontId,
        requestedFamily: typeof item.requestedFamily === 'string' ? item.requestedFamily : '',
        fallbackFamilies: Object.freeze(Array.isArray(item.fallbackFamilies) ? item.fallbackFamilies.filter(family => typeof family === 'string') : []),
        reason: item.reason === 'timeout' ? 'timeout' : 'unavailable',
      })) : []),
    });
  }

  function mount(container, options = {}) {
    if (typeof container === 'string') container = document.querySelector(container);
    if (!(container instanceof Element)) throw new TypeError('mount requires a container element.');
    if (!record(options)) throw new TypeError('options must be an object.');
    if (!/^https?:$/.test(location.protocol)) throw new TypeError('Open the host through HTTP(S), not file://.');
    const language = options.language || 'zh';
    const theme = options.theme || 'dark';
    if (!['ja', 'zh'].includes(language)) throw new TypeError('language must be zh or ja.');
    if (!['dark', 'light'].includes(theme)) throw new TypeError('theme must be dark or light.');
    const timeout = options.timeout === undefined ? 120000 : options.timeout;
    if (!Number.isFinite(timeout) || timeout < 100 || timeout > 600000) throw new TypeError('timeout must be between 100 and 600000 milliseconds.');
    const baseURL = new URL(options.baseUrl || defaultBase, location.href);
    const toolURL = new URL(options.url || 'tools/text-apng-maker/', baseURL);
    if (!/^https?:$/.test(toolURL.protocol) || toolURL.username || toolURL.password) throw new TypeError('The tool URL must be an HTTP(S) URL without credentials.');
    toolURL.searchParams.set('embed', '1');
    toolURL.searchParams.set('api', '1');
    toolURL.searchParams.set('hostOrigin', location.origin);
    toolURL.searchParams.set('lang', language);
    toolURL.searchParams.set('theme', theme);
    const toolOrigin = toolURL.origin;
    const instance = 'apng-' + (root.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
    const frame = document.createElement('iframe');
    frame.title = options.title || '熊酒馆 · 文字图片 APNG 制作器';
    frame.className = 'bear-tavern-apng-frame';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-downloads allow-modals');
    frame.style.cssText = 'display:block;width:100%;height:100%;border:0';
    let sequence = 0;
    let closed = false;
    let connected = false;
    let loadCount = 0;
    let helloId = null;
    let activeRender = null;
    let removalObserver = null;
    const pending = new Map();
    let resolveReady, rejectReady;
    const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    // A consumer may mount now and await ready later; keep that interval quiet.
    ready.catch(() => {});
    const readyTimer = root.setTimeout(() => stop(problem('Timed out connecting to the APNG tool.', 'TIMEOUT')), Math.min(timeout, 30000));

    function settle(id, error, value) {
      const task = pending.get(id);
      if (!task) return;
      pending.delete(id);
      root.clearTimeout(task.timer);
      if (activeRender === id) activeRender = null;
      if (error) task.reject(error); else task.resolve(value);
    }
    function stop(error) {
      if (closed) return;
      closed = true;
      connected = false;
      root.clearTimeout(readyTimer);
      root.removeEventListener('message', onMessage);
      frame.removeEventListener('load', onLoad);
      removalObserver?.disconnect();
      rejectReady(error);
      for (const id of Array.from(pending.keys())) settle(id, error);
      frame.remove();
    }
    function post(type, payload, requestId) {
      frame.contentWindow.postMessage({ namespace: NAMESPACE, version: VERSION, type, requestId, payload }, toolOrigin);
    }
    function request(type, payload = {}, kind = type) {
      if (closed) return Promise.reject(problem('This APNG client has been destroyed.', 'DESTROYED'));
      const requestId = instance + '-' + (++sequence);
      const promise = new Promise((resolve, reject) => {
        const timer = root.setTimeout(() => {
          if (kind === 'render' && !closed) {
            try { post('host:apng-cancel', { targetRequestId: requestId }, instance + '-timeout-' + (++sequence)); } catch (_) { /* The frame may have gone away. */ }
          }
          settle(requestId, problem('The APNG request timed out.', 'TIMEOUT'));
        }, timeout);
        pending.set(requestId, { resolve, reject, timer, kind });
        if (kind === 'render') activeRender = requestId;
        try { post(type, payload, requestId); } catch (error) { settle(requestId, problem(error.message, 'SEND_FAILED')); }
      });
      return promise;
    }
    function greet() {
      if (closed || connected) return;
      if (!helloId) helloId = instance + '-hello-' + (++sequence);
      try { post('host:hello', { language, theme }, helloId); }
      catch (error) { stop(problem(error.message, 'SEND_FAILED')); }
    }
    function invoke(handler, value) {
      if (typeof handler !== 'function') return;
      try { handler(value); } catch (error) { console.error('BearTavernApng callback failed:', error); }
    }
    function onMessage(event) {
      if (closed || event.source !== frame.contentWindow || event.origin !== toolOrigin) return;
      const message = event.data;
      if (!record(message) || message.namespace !== NAMESPACE || message.version !== VERSION || typeof message.requestId !== 'string' || message.requestId.length > 128 || !record(message.payload)) return;
      const payload = message.payload;
      if (message.type === 'tool:ready') {
        if (!helloId || message.requestId !== helloId) { if (!connected) greet(); return; }
        if (payload.ok !== true || payload.state?.toolId !== 'text-apng-maker' || payload.state?.capabilities?.apngApi !== true || payload.state?.capabilities?.exportTransfer !== true) {
          stop(problem('This tool does not provide the callable APNG API.', 'UNSUPPORTED_API'));
          return;
        }
        connected = true;
        root.clearTimeout(readyTimer);
        frame.dataset.apngReady = 'true';
        resolveReady(Object.freeze({ ...payload.state }));
        return;
      }
      if (message.type === 'tool:result' && message.requestId === helloId && !connected) {
        stop(problem(payload.error || 'APNG handshake failed.', payload.code || 'HANDSHAKE_FAILED'));
        return;
      }
      if (!connected) return;
      if (message.type === 'tool:apng-export') {
        try { invoke(options.onExport, output(payload.result || payload)); }
        catch (error) { console.error('BearTavernApng ignored an invalid export:', error); }
        return;
      }
      const task = pending.get(message.requestId);
      if (!task) return;
      if (message.type === 'tool:apng-progress') {
        if (task.kind !== 'render' || !Number.isFinite(payload.progress) || typeof payload.stage !== 'string') return;
        invoke(options.onProgress, Object.freeze({ progress: payload.progress, stage: payload.stage, requestId: message.requestId }));
        return;
      }
      if (message.type !== 'tool:result') return;
      if (payload.ok === false) { settle(message.requestId, problem(payload.error || 'The APNG tool rejected the request.', payload.code || 'TOOL_ERROR')); return; }
      if (payload.ok !== true || !record(payload.result)) { settle(message.requestId, problem('The tool returned an invalid response.', 'INVALID_RESPONSE')); return; }
      try { settle(message.requestId, null, task.kind === 'render' ? output(payload.result) : payload.result); }
      catch (error) { settle(message.requestId, error); }
    }
    function onLoad() {
      loadCount += 1;
      if (loadCount > 1) { stop(problem('The embedded tool navigated. Mount a new client to reconnect.', 'FRAME_NAVIGATED')); return; }
      greet();
    }
    function afterReady(action) {
      if (closed) return Promise.reject(problem('This APNG client has been destroyed.', 'DESTROYED'));
      if (connected) {
        try { return Promise.resolve(action()); } catch (error) { return Promise.reject(error); }
      }
      return ready.then(() => {
        if (closed) throw problem('This APNG client has been destroyed.', 'DESTROYED');
        return action();
      });
    }
    root.addEventListener('message', onMessage);
    frame.addEventListener('load', onLoad);
    frame.src = toolURL.href;
    container.appendChild(frame);
    let wasConnected = frame.isConnected;
    removalObserver = new MutationObserver(() => {
      if (frame.isConnected) wasConnected = true;
      else if (wasConnected) stop(problem('The embedded APNG frame was removed.', 'DESTROYED'));
    });
    removalObserver.observe(document.documentElement, { childList: true, subtree: true });
    return Object.freeze({
      iframe: frame,
      ready,
      configure: config => afterReady(() => request('host:apng-configure', { config })),
      render: config => afterReady(() => {
        if (activeRender) throw problem('An APNG render is already running.', 'BUSY');
        return request('host:apng-render', config === undefined ? {} : { config }, 'render');
      }),
      play: () => afterReady(() => request('host:apng-play')),
      pause: () => afterReady(() => request('host:apng-pause')),
      cancel: targetRequestId => {
        const payload = {};
        const target = targetRequestId || activeRender;
        if (target !== null && target !== undefined) payload.targetRequestId = target;
        // Never queue cancellation behind the render Promise.
        return connected && !closed ? request('host:apng-cancel', payload) : afterReady(() => request('host:apng-cancel', payload));
      },
      getTemplates: () => afterReady(() => request('host:apng-templates')),
      destroy: () => stop(problem('This APNG client has been destroyed.', 'DESTROYED')),
    });
  }
  root.BearTavernApng = Object.freeze({ mount, namespace: NAMESPACE, version: VERSION });
})(window);
