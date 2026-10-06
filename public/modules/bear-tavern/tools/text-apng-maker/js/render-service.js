/* Bear Tavern: bounded, cancellable APNG rendering without UI or downloads. */
(function (root) {
  'use strict';

  const P = root.TextApngPresets;
  const E = root.TextApngEngine;
  const F = root.TextApngFonts;
  const C = root.TextApngCodec;
  const LIMITS = Object.freeze({
    minDimension: 64, maxWidth: 1920, maxHeight: 1920, maxPixels: 2073600,
    maxFrames: 600, maxDuration: 30, maxWorkPixels: 300000000,
    maxTextLength: 800, maxSubTextLength: 240, maxConcurrentRenders: 1
  });
  const CONFIG_KEYS = new Set([
    'mode', 'templateId', 'text', 'subText', 'width', 'height', 'fontId',
    'fontSize', 'fontWeight', 'textColor', 'inFx', 'holdFx', 'outFx',
    'inDuration', 'holdDuration', 'outDuration', 'outEnabled', 'startDelay',
    'endDelay', 'fps', 'loop', 'loopCount', 'color', 'trim', 'poster', 'fileName'
  ]);
  const EXPORT_KEYS = new Set(['fps', 'loop', 'loopCount', 'color', 'trim', 'poster']);
  const SYSTEM_FONTS = Object.freeze({
    'system-sans': ['system-ui', 'Microsoft YaHei', 'PingFang SC', 'sans-serif'],
    'system-serif': ['Songti SC', 'SimSun', 'serif'],
    'system-monospace': ['Consolas', 'Menlo', 'Microsoft YaHei', 'monospace']
  });
  const MODES = ['message', 'trailer', 'caption'];
  let rendering = false;

  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function dependencies() {
    if (!P || !E || !F || !C) throw fail('NOT_READY', 'The APNG rendering dependencies are not loaded.');
  }

  // Accept JSON data only. Reading accessor properties or inherited fields is forbidden.
  function record(value, keys, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      throw fail('INVALID_CONFIG', `${label} must be a plain JSON object.`);
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || !keys.has(key) ||
        key === '__proto__' || key === 'constructor' || key === 'prototype') {
        throw fail('INVALID_CONFIG', `Unknown ${label} field: ${String(key)}.`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) throw fail('INVALID_CONFIG', `${label}.${key} must be JSON data.`);
    }
    return value;
  }

  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

  function number(value, key, min, max, integer) {
    if (typeof value !== 'number' || !Number.isFinite(value) ||
      value < min || value > max || (integer && !Number.isInteger(value))) {
      throw fail('INVALID_CONFIG', `${key} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.`);
    }
    return value;
  }

  function choice(value, key, values) {
    if (typeof value !== 'string' || !values.includes(value)) throw fail('INVALID_CONFIG', `Unsupported ${key}: ${String(value)}.`);
    return value;
  }

  function bool(value, key) {
    if (typeof value !== 'boolean') throw fail('INVALID_CONFIG', `${key} must be a boolean.`);
    return value;
  }

  function text(value, key, max) {
    if (typeof value !== 'string' || value.length > max || /[\u0000\u000b\u000c]/.test(value)) {
      throw fail('INVALID_CONFIG', `${key} must be text of at most ${max} characters.`);
    }
    return value.replace(/\r\n?/g, '\n');
  }

  function hex(value) {
    if (typeof value !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
      throw fail('INVALID_CONFIG', 'textColor must be a #RGB or #RRGGBB color.');
    }
    return (value.length === 4 ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}` : value).toLowerCase();
  }

  function fontId(value, includeUploaded) {
    if (typeof value !== 'string' || value.length > 120) throw fail('INVALID_CONFIG', 'fontId must be a known font ID.');
    if (own(SYSTEM_FONTS, value)) return value;
    if (value.startsWith('local:') && /^[\p{L}\p{N} ._()\-]{1,100}$/u.test(value.slice(6))) return value;
    const list = includeUploaded ? F.list() : F.CATALOG;
    if (!list.some(font => font.id === value)) throw fail('INVALID_CONFIG', `Unknown fontId: ${value}.`);
    return value;
  }

  function filename(value, scene) {
    if (value !== undefined && (typeof value !== 'string' || value.length > 80)) {
      throw fail('INVALID_CONFIG', 'fileName must be a string of at most 80 characters.');
    }
    const suggestion = E.graphemes(scene.text.split('\n').find(line => line.trim()) || 'bear-tavern-text').slice(0, 24).join('');
    const base = (value === undefined ? suggestion : value)
      .replace(/\.(?:png|apng)$/i, '')
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
      .replace(/\s+/g, '_').replace(/^[._]+|[._]+$/g, '').slice(0, 64);
    return `${base || 'bear-tavern-text'}.png`;
  }

  function dimensions(scene) {
    number(scene.width, 'width', LIMITS.minDimension, LIMITS.maxWidth, true);
    number(scene.height, 'height', LIMITS.minDimension, LIMITS.maxHeight, true);
    if (scene.width * scene.height > LIMITS.maxPixels) {
      throw fail('LIMIT_EXCEEDED', `The canvas exceeds ${LIMITS.maxPixels} pixels.`);
    }
  }

  function exportOptions(value) {
    record(value, EXPORT_KEYS, 'exportOptions');
    const result = { fps: 24, loop: 'once', loopCount: 3, color: 'palette', trim: false, poster: true };
    if (own(value, 'fps')) result.fps = number(value.fps, 'fps', 1, 60, true);
    if (own(value, 'loop')) result.loop = choice(value.loop, 'loop', ['once', 'count', 'infinite']);
    if (own(value, 'loopCount')) result.loopCount = number(value.loopCount, 'loopCount', 1, 999, true);
    if (own(value, 'color')) result.color = choice(value.color, 'color', ['palette', 'full']);
    for (const key of ['trim', 'poster']) if (own(value, key)) result[key] = bool(value[key], key);
    return result;
  }

  function getTemplates() {
    dependencies();
    return MODES.flatMap(mode => (P.TEMPLATES[mode] || []).map(template => ({
      id: template.id, mode,
      name: Object.fromEntries(['zh', 'ja', 'en', 'ko'].map(lang => [lang, String(template.label[lang] || template.label.en || template.id)]))
    })));
  }

  function normalizeConfig(config) {
    dependencies();
    record(config, CONFIG_KEYS, 'config');
    let mode = own(config, 'mode') ? choice(config.mode, 'mode', MODES) : 'message';
    let template = null;
    if (own(config, 'templateId')) {
      if (typeof config.templateId !== 'string' || config.templateId.length > 100) throw fail('INVALID_CONFIG', 'templateId must be a known template ID.');
      const matches = MODES.flatMap(candidate => (P.TEMPLATES[candidate] || [])
        .filter(item => item.id === config.templateId).map(item => ({ mode: candidate, template: item })));
      const selected = own(config, 'mode') ? matches.find(item => item.mode === mode) : matches[0];
      if (!selected) throw fail('INVALID_CONFIG', `Unknown templateId for mode ${mode}: ${config.templateId}.`);
      mode = selected.mode;
      template = selected.template;
    }
    const scene = P.deepMerge(P.clone(P.BASE), P.MODE_DEFAULTS[mode] || {});
    scene.mode = mode;
    if (template) P.applyTemplate(scene, template, 'zh');
    else { scene.fontId = 'system-sans'; scene.subFontId = 'same'; }
    scene.text = text(config.text, 'text', LIMITS.maxTextLength);
    if (!scene.text.trim()) throw fail('EMPTY_TEXT', 'Please provide non-empty text to render.');
    // Templates supply design only; their sample text is never substituted for caller text.
    scene.subText = own(config, 'subText') ? text(config.subText, 'subText', LIMITS.maxSubTextLength) : '';
    for (const key of ['width', 'height']) if (own(config, key)) scene[key] = config[key];
    dimensions(scene);
    scene.sizePreset = 'custom';
    if (own(config, 'fontId')) {
      scene.fontId = fontId(config.fontId, false);
      scene.subFontId = 'same';
    }
    if (own(config, 'fontSize')) scene.fontSize = number(config.fontSize, 'fontSize', 8, 300);
    if (own(config, 'fontWeight')) scene.weight = number(config.fontWeight, 'fontWeight', 100, 900, true);
    if (own(config, 'textColor')) scene.fill = { ...scene.fill, type: 'solid', color: hex(config.textColor) };
    const effects = { inFx: E.IN_EFFECTS, holdFx: E.HOLD_EFFECTS, outFx: E.OUT_EFFECTS };
    for (const [key, list] of Object.entries(effects)) if (own(config, key)) scene[key] = choice(config[key], key, list.map(effect => effect.id));
    for (const [key, target] of [['inDuration', 'inDur'], ['holdDuration', 'hold'], ['outDuration', 'outDur']]) {
      if (own(config, key)) scene[target] = number(config[key], key, 0, 10);
    }
    for (const key of ['startDelay', 'endDelay']) if (own(config, key)) scene[key] = number(config[key], key, 0, 5);
    if (own(config, 'outEnabled')) scene.outEnabled = bool(config.outEnabled, 'outEnabled');
    const suppliedOptions = Object.fromEntries([...EXPORT_KEYS].filter(key => own(config, key)).map(key => [key, config[key]]));
    return { scene, exportOptions: exportOptions(suppliedOptions), fileName: filename(config.fileName, scene) };
  }

  // The editor alone calls this lower-level path. RPC callers always use normalizeConfig.
  function normalizeScene(input, opts, name) {
    dependencies();
    const sceneKeys = new Set([...Object.keys(P.BASE), 'templateId']);
    record(input, sceneKeys, 'scene');
    function copy(value, reference, label) {
      if (reference && typeof reference === 'object') {
        record(value, new Set(Object.keys(reference)), label);
        return Object.fromEntries(Object.keys(value).map(key => [key, copy(value[key], reference[key], `${label}.${key}`)]));
      }
      if (typeof value !== typeof reference ||
        (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > 10000)) ||
        (typeof value === 'string' && value.length > 1040)) throw fail('INVALID_CONFIG', `Invalid ${label}.`);
      return value;
    }
    const scene = P.clone(P.BASE);
    for (const key of Object.keys(input)) scene[key] = key === 'templateId' ? text(input[key], key, 100) : copy(input[key], P.BASE[key], `scene.${key}`);
    choice(scene.mode, 'mode', MODES);
    scene.text = text(scene.text, 'text', LIMITS.maxTextLength);
    scene.subText = text(scene.subText, 'subText', LIMITS.maxSubTextLength);
    if (!scene.text.trim() && (scene.mode === 'trailer' || !scene.subText.trim())) throw fail('EMPTY_TEXT', 'Please provide non-empty text to render.');
    dimensions(scene);
    // The existing editor exposes sizes up to 400px; its internal path keeps
    // those controls compatible while the public JSON API stays at 300px.
    number(scene.fontSize, 'fontSize', 8, 400);
    number(scene.weight, 'fontWeight', 100, 900, true);
    fontId(scene.fontId, true);
    if (scene.subFontId !== 'same') fontId(scene.subFontId, true);
    // Negative or extreme shadow/glow canvases are not valid editor settings.
    for (const [key, max] of [['stroke', 40], ['stroke2', 40]]) number(scene[key].width, `${key}.width`, 0, max);
    number(scene.shadow.blur, 'shadow.blur', 0, 100);
    number(scene.glow.size, 'glow.size', 0, 150);
    for (const key of ['inDur', 'outDur', 'hold', 'startDelay', 'endDelay']) number(scene[key], key, 0, 30);
    return { scene, exportOptions: exportOptions(opts || {}), fileName: filename(name, scene) };
  }

  function checkCancelled(signal) {
    if (signal && signal.aborted) throw fail('CANCELLED', 'APNG rendering was cancelled.');
  }

  function yieldToUi() { return new Promise(resolve => setTimeout(resolve, 0)); }

  function waitFont(promise, signal) {
    checkCancelled(signal);
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', cancelled);
        if (error) reject(error); else resolve(value);
      };
      const cancelled = () => finish(fail('CANCELLED', 'APNG rendering was cancelled.'));
      const timer = setTimeout(() => finish(null, false), 18000);
      if (signal) signal.addEventListener('abort', cancelled, { once: true });
      Promise.resolve(promise).then(() => finish(null, true), () => finish(null, false));
    });
  }

  function loadedFamily(family, allowInstalled) {
    if (document.fonts && typeof document.fonts[Symbol.iterator] === 'function') {
      for (const face of document.fonts) {
        if (face.status === 'loaded' && face.family.replace(/^['"]|['"]$/g, '') === family) return true;
      }
    }
    // The font manager's width heuristic can mistake CJK fallback glyphs for a
    // missing web font. Require an actually loaded FontFace for web families.
    return Boolean(allowInstalled && F.isLocalFontAvailable(family));
  }

  async function loadFonts(scene, signal) {
    const ids = new Map([[scene.fontId, { weight: scene.weight, text: scene.text + (scene.mode === 'trailer' ? '' : scene.subText) }]]);
    if (scene.mode !== 'trailer' && scene.subText && scene.subFontId !== 'same') ids.set(scene.subFontId, { weight: scene.subWeight, text: scene.subText });
    const resolved = new Map();
    const fallbacks = [];
    await Promise.all([...ids].map(async ([id, usage]) => {
      checkCancelled(signal);
      if (F.get(id)?.system || own(SYSTEM_FONTS, id)) {
        // Use the same family order as the editor preview. Keep the local
        // defaults only for older font managers that lack these three IDs.
        resolved.set(id, F.get(id)?.system ? F.families(id) : [...SYSTEM_FONTS[id]]);
        return;
      }
      const font = F.get(id);
      if (font.local) {
        if (F.isLocalFontAvailable(font.family)) resolved.set(id, [font.family, ...SYSTEM_FONTS['system-sans']]);
        else {
          resolved.set(id, [...SYSTEM_FONTS['system-sans']]);
          fallbacks.push({ fontId: id, requestedFamily: font.family, fallbackFamilies: [...SYSTEM_FONTS['system-sans']], reason: 'unavailable' });
        }
        return;
      }
      const completed = await waitFont(F.load(id, usage.weight, usage.text), signal);
      checkCancelled(signal);
      const families = F.families(id);
      const systemFamilies = Object.values(SYSTEM_FONTS).flat();
      const installed = families.filter(family => /^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/.test(family) ||
        loadedFamily(family, systemFamilies.includes(family)));
      const use = installed.length ? installed : [...SYSTEM_FONTS['system-sans']];
      resolved.set(id, use);
      if (!completed || !loadedFamily(font.family)) fallbacks.push({
        fontId: id, requestedFamily: font.family, fallbackFamilies: use.slice(), reason: completed ? 'unavailable' : 'timeout'
      });
    }));
    return { resolveFont: id => resolved.get(id) || [...SYSTEM_FONTS['system-sans']], fallbacks };
  }

  async function run(normalized, options) {
    if (rendering) throw fail('BUSY', 'An APNG rendering task is already running.');
    record(options, new Set(['signal', 'onProgress']), 'render options');
    const { signal, onProgress } = options;
    if (signal !== undefined && (!signal || typeof signal.aborted !== 'boolean' ||
      typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) throw fail('INVALID_CONFIG', 'signal must be an AbortSignal.');
    if (onProgress !== undefined && typeof onProgress !== 'function') throw fail('INVALID_CONFIG', 'onProgress must be a function.');
    checkCancelled(signal);
    if (!C.isCompressionSupported()) throw fail('COMPRESSION_UNSUPPORTED', 'This browser does not support APNG compression.');
    rendering = true;
    let canvas = null;
    const progress = (stage, ratio, frame, total) => {
      if (onProgress) onProgress({ stage, progress: Math.max(0, Math.min(1, ratio)), frame, total });
    };
    try {
      const { scene, exportOptions: opts, fileName } = normalized;
      progress('fonts', 0, 0, 1);
      const fonts = await loadFonts(scene, signal);
      checkCancelled(signal);
      const renderer = new E.TextRenderer({ resolveFont: fonts.resolveFont });
      // Check work before prepare builds and retains all glyph sprites.
      const layout = E.computeLayout(scene, { ctx: renderer.measure, ...renderer.fontsFor(scene) });
      const timeline = E.buildTimeline(scene, layout);
      const duration = timeline.duration;
      const fps = opts.fps;
      const count = Math.max(1, Math.ceil(duration * fps - 1e-6));
      const needAnalysis = opts.color !== 'full' || opts.trim;
      const passes = needAnalysis ? 2 : 1;
      const work = scene.width * scene.height * (count + (opts.poster ? 1 : 0)) * passes;
      if (!Number.isFinite(duration) || duration <= 0 || duration > LIMITS.maxDuration ||
        count > LIMITS.maxFrames || work > LIMITS.maxWorkPixels) {
        throw fail('LIMIT_EXCEEDED', `Rendering exceeds the ${LIMITS.maxFrames}-frame, ${LIMITS.maxDuration}-second or ${LIMITS.maxWorkPixels}-pixel work limit. Reduce size, FPS or duration.`);
      }
      checkCancelled(signal);
      const prepared = renderer.prepare(scene);
      canvas = document.createElement('canvas');
      canvas.width = scene.width;
      canvas.height = scene.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw fail('CANVAS_UNSUPPORTED', 'This browser cannot create a 2D canvas.');
      const timeAt = index => index === count - 1 ? duration : Math.min(index / fps, duration);
      const grab = time => {
        renderer.render(ctx, time, { scale: 1 });
        return ctx.getImageData(0, 0, scene.width, scene.height).data;
      };
      const analysisShare = needAnalysis ? 0.4 : 0;
      let quantizer = null;
      let crop = null;
      if (needAnalysis) {
        quantizer = opts.color === 'palette' ? new C.PaletteQuantizer(256) : null;
        const analyzer = new C.FrameAnalyzer(scene.width, scene.height, { quantizer });
        for (let index = 0; index < count; index++) {
          checkCancelled(signal);
          analyzer.add(grab(timeAt(index)));
          progress('analyzing', (index + 1) / count * analysisShare, index + 1, count);
          await yieldToUi();
        }
        checkCancelled(signal);
        if (opts.poster) analyzer.add(grab(prepared.timeline.posterTime));
        if (opts.trim && analyzer.bounds) {
          const bounds = analyzer.bounds;
          const x = Math.max(0, bounds.x0 - 2), y = Math.max(0, bounds.y0 - 2);
          const right = Math.min(scene.width, bounds.x1 + 2), bottom = Math.min(scene.height, bounds.y1 + 2);
          if (right - x < scene.width || bottom - y < scene.height) crop = { x, y, w: right - x, h: bottom - y };
        }
        if (quantizer) quantizer.build();
      }
      checkCancelled(signal);
      const width = crop ? crop.w : scene.width, height = crop ? crop.h : scene.height;
      const shape = data => crop ? C.cropFrame(data, scene.width, crop) : data;
      const loops = opts.loop === 'once' ? 1 : opts.loop === 'count' ? opts.loopCount : 0;
      const encoder = new C.ApngEncoder({ width, height, fps, loops, quantizer });
      if (opts.poster) await encoder.setDefaultImage(shape(grab(prepared.timeline.posterTime)));
      for (let index = 0; index < count; index++) {
        checkCancelled(signal);
        await encoder.addFrame(shape(grab(timeAt(index))));
        progress('encoding', analysisShare + (index + 1) / count * (1 - analysisShare), index + 1, count);
        await yieldToUi();
      }
      checkCancelled(signal);
      const blob = encoder.finish();
      progress('done', 1, count, count);
      return { blob, mimeType: 'image/png', fileName, width, height, frames: count,
        encodedFrames: encoder.frameCount, duration, fps, loops, fontFallbacks: fonts.fallbacks };
    } finally {
      rendering = false;
      if (canvas) { canvas.width = 1; canvas.height = 1; }
    }
  }

  root.TextApngService = Object.freeze({
    normalizeConfig, getTemplates, limits: LIMITS,
    render: (config, options = {}) => {
      try { return run(normalizeConfig(config), options); } catch (error) { return Promise.reject(error); }
    },
    renderScene: (scene, options, runtime = {}) => {
      try {
        record(runtime, new Set(['signal', 'onProgress', 'fileName']), 'renderScene options');
        const normalized = normalizeScene(scene, options, runtime.fileName);
        return run(normalized, Object.fromEntries(['signal', 'onProgress'].filter(key => own(runtime, key)).map(key => [key, runtime[key]])));
      } catch (error) { return Promise.reject(error); }
    },
    isRendering: () => rendering
  });
})(typeof window !== 'undefined' ? window : globalThis);
