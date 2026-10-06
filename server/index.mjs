import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLETOP_RESPONSE_SCHEMA } from './tabletop-schema.mjs';
import { createLibraryStore, LibraryError, RESOURCE_LIMIT } from './library-store.mjs';
import { createAdventureStore, AdventureError, adventureResourceSources } from './adventure-store.mjs';

const BODY_LIMIT = 1024 * 1024;
const LIBRARY_BODY_LIMIT = 10 * 1024 * 1024;
const UPSTREAM_LIMIT = 2 * 1024 * 1024;
const DEFAULT_DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const DEFAULT_DATA = fileURLToPath(new URL('../data/', import.meta.url));
const BUILTIN_LIBRARY = fileURLToPath(new URL('./library-builtins.json', import.meta.url));
const PLAY_KIT_LIBRARY = fileURLToPath(new URL('./library-play-kit.json', import.meta.url));
const DICE_KIT_LIBRARY = fileURLToPath(new URL('./library-dice-kit.json', import.meta.url));
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function replyJson(res, status, data) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}

function checkLocalRequest(req) {
  try {
    const host = new URL(`http://${req.headers.host || ''}`);
    if (!LOCAL_HOSTS.has(host.hostname) || host.username || host.password) throw new Error();
    if (req.headers.origin) {
      const origin = new URL(req.headers.origin);
      if (!['http:', 'https:'].includes(origin.protocol) || !LOCAL_HOSTS.has(origin.hostname)) throw new Error();
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') throw new Error();
  } catch {
    throw new ApiError(403, '仅允许从本机页面访问模型服务。');
  }
}

async function readJson(req, limit = BODY_LIMIT) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
    throw new ApiError(415, '请使用 application/json 发送请求。');
  }
  const message = limit === LIBRARY_BODY_LIMIT ? '作品或物件模板不能超过 10 MB。' : '请求内容超过 1 MB，请缩短对话。';
  const bytes = await readRequestBuffer(req, limit, message);
  try {
    const value = JSON.parse(bytes.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new ApiError(400, '请求 JSON 格式有误。');
  }
}

function readRequestBuffer(req, limit, limitMessage) {
  if (Number(req.headers['content-length']) > limit) { req.resume(); throw new ApiError(413, limitMessage); }
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    const cleanup = () => { req.off('data', onData); req.off('end', onEnd); req.off('error', onError); req.off('aborted', onAborted); };
    const onData = (chunk) => {
      size += chunk.length;
      if (size > limit) { cleanup(); req.resume(); reject(new ApiError(413, limitMessage)); }
      else chunks.push(chunk);
    };
    const onEnd = () => { cleanup(); resolve(Buffer.concat(chunks)); };
    const onError = () => { cleanup(); reject(new ApiError(400, '请求上传中断，请重新发送。')); };
    const onAborted = () => onError();
    req.on('data', onData); req.once('end', onEnd); req.once('error', onError); req.once('aborted', onAborted);
  });
}

function validateConnection(input) {
  if (!['ollama', 'openai'].includes(input.provider)) throw new ApiError(400, '请选择 Ollama 或 OpenAI 兼容服务。');
  if (typeof input.baseUrl !== 'string' || input.baseUrl.length > 2048) throw new ApiError(400, '请输入有效的模型服务地址。');
  let url;
  try { url = new URL(input.baseUrl.trim()); } catch { throw new ApiError(400, '模型服务地址必须是完整的 HTTP 或 HTTPS URL。'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new ApiError(400, '模型地址仅支持 HTTP / HTTPS，且不能包含账号、密码、查询参数或片段。');
  }
  if (input.apiKey !== undefined && (typeof input.apiKey !== 'string' || input.apiKey.length > 4096 || /[\r\n\x00]/.test(input.apiKey))) {
    throw new ApiError(400, 'API Key 格式有误。');
  }
  let basePath = url.pathname.replace(/\/+$/, '');
  if (input.provider === 'openai' && !/\/v\d+$/.test(basePath)) basePath += '/v1';
  if (input.provider === 'ollama' && basePath.endsWith('/api')) basePath = basePath.slice(0, -4);
  url.pathname = basePath;
  return { provider: input.provider, url, apiKey: input.apiKey?.trim() || '' };
}

function validateChat(input) {
  if (typeof input.model !== 'string' || !input.model.trim() || input.model.length > 256 || /[\r\n\x00]/.test(input.model)) {
    throw new ApiError(400, '请输入模型名称（最多 256 个字符）。');
  }
  if (!Array.isArray(input.messages) || input.messages.length < 1 || input.messages.length > 256) {
    throw new ApiError(400, '对话需包含 1 至 256 条消息。');
  }
  const messages = input.messages.map((message) => {
    if (!message || !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || message.content.length > 131072) {
      throw new ApiError(400, '消息需包含合法的 role 和文本 content，单条文本最多 128 KB。');
    }
    return { role: message.role, content: message.content };
  });
  if (input.temperature !== undefined && (typeof input.temperature !== 'number' || !Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 2)) {
    throw new ApiError(400, 'temperature 必须是 0 至 2 之间的数字。');
  }
  if (input.responseFormat !== undefined && !['json', 'tabletop'].includes(input.responseFormat)) {
    throw new ApiError(400, 'responseFormat 仅支持 json 或 tabletop；普通对话请省略此字段。');
  }
  return { model: input.model.trim(), messages, temperature: input.temperature, responseFormat: input.responseFormat };
}

function endpoint(connection, suffix) {
  const url = new URL(connection.url);
  url.pathname = `${url.pathname.replace(/\/+$/, '')}${suffix}`;
  return url;
}

function safeUpstreamDetail(data, apiKey) {
  let detail = typeof data?.error === 'string' ? data.error : data?.error?.message;
  if (typeof detail !== 'string') return '';
  if (apiKey) detail = detail.split(apiKey).join('[已隐藏]');
  return detail.replace(/Bearer\s+\S+/gi, 'Bearer [已隐藏]').replace(/[\r\n\x00]/g, ' ').slice(0, 250);
}

async function fetchUpstream(connection, suffix, body, res, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const onClose = () => { if (!res.writableEnded) controller.abort(); };
  res.once('close', onClose);
  try {
    const headers = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (connection.apiKey) headers.Authorization = `Bearer ${connection.apiKey}`;
    const response = await fetch(endpoint(connection, suffix), {
      method: body ? 'POST' : 'GET', headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      redirect: 'error',
    });
    let size = 0;
    const chunks = [];
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > UPSTREAM_LIMIT) {
        controller.abort();
        throw new ApiError(502, '模型响应超过 2 MB，请减少输出长度。');
      }
      chunks.push(chunk);
    }
    let data;
    try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {
      if (response.status === 401 || response.status === 403) throw new ApiError(502, '模型服务认证失败，请检查 API Key。');
      throw new ApiError(502, '模型服务没有返回有效 JSON，请检查地址和接口兼容性。');
    }
    if (!response.ok || data?.error) {
      const details = safeUpstreamDetail(data, connection.apiKey);
      const reason = response.status === 401 || response.status === 403 ? '模型服务认证失败，请检查 API Key。'
        : response.status === 429 ? '模型服务请求过于频繁或额度不足，请稍后重试。'
          : `模型服务请求失败（HTTP ${response.status}）。`;
      throw new ApiError(502, `${reason}${details ? ` ${details}` : ''}`);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ApiError(502, '模型服务返回的 JSON 数据格式有误。');
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) throw new ApiError(504, '模型响应超时，请确认服务正常，或使用更小的模型后重试。');
    throw new ApiError(502, '无法连接模型服务，请检查服务地址、网络和模型是否已启动。');
  } finally {
    clearTimeout(timer);
    res.off('close', onClose);
  }
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function serveStatic(req, res, url, distDirectory) {
  if (!['GET', 'HEAD'].includes(req.method)) throw new ApiError(405, '该地址仅支持 GET 请求。');
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { throw new ApiError(400, '页面路径格式有误。'); }
  if (/[\\\x00]/.test(pathname) || pathname.split('/').includes('..')) throw new ApiError(400, '页面路径格式有误。');
  const root = path.resolve(distDirectory);
  let candidate = path.resolve(root, `.${pathname}`);
  if (!isWithin(root, candidate)) throw new ApiError(403, '无法访问该文件。');
  try {
    const info = await stat(candidate);
    if (info.isDirectory()) candidate = path.join(candidate, 'index.html');
    const actual = await realpath(candidate);
    const actualRoot = await realpath(root);
    if (!isWithin(actualRoot, actual)) throw new ApiError(403, '无法访问该文件。');
    candidate = actual;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (path.extname(pathname) || (req.headers.accept && !req.headers.accept.includes('text/html'))) throw new ApiError(404, '文件不存在。');
    candidate = path.join(root, 'index.html');
    try {
      const [actualRoot, actual] = await Promise.all([realpath(root), realpath(candidate)]);
      if (!isWithin(actualRoot, actual)) throw new ApiError(403, '无法访问该文件。');
      candidate = actual;
    } catch (fallbackError) {
      if (fallbackError instanceof ApiError) throw fallbackError;
      throw new ApiError(404, '尚未构建网页，请先运行 npm run build，或使用 npm run dev。');
    }
  }
  let file;
  try { file = await readFile(candidate); } catch { throw new ApiError(404, '文件不存在。'); }
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[path.extname(candidate)] || 'application/octet-stream',
    'Content-Length': file.length,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': path.extname(candidate) === '.html' ? 'no-cache' : 'public, max-age=3600',
  });
  res.end(req.method === 'HEAD' ? undefined : file);
}

export function createAppServer({ distDirectory = DEFAULT_DIST, dataDirectory = process.env.DATA_DIR || DEFAULT_DATA, seedBuiltins = true, chatTimeoutMs = 120000, modelsTimeoutMs = 15000 } = {}) {
  let library;
  const getLibrary = () => library ??= createLibraryStore(dataDirectory, { builtinPath: seedBuiltins ? BUILTIN_LIBRARY : undefined, expansionPath: seedBuiltins ? PLAY_KIT_LIBRARY : undefined, dicePath: seedBuiltins ? DICE_KIT_LIBRARY : undefined });
  let adventures;
  const getAdventures = () => adventures ??= createAdventureStore(dataDirectory);
  const adventureInput = async req => {
    const input = await readJson(req, LIBRARY_BODY_LIMIT);
    try {
      const { validateAdventureDefinition } = await import('../src/lib/adventure-schema.ts');
      const definition = validateAdventureDefinition(input.definition);
      for (const source of adventureResourceSources(definition)) {
        if (!/^\/api\/resources\/[a-f0-9]{64}$/.test(source)) throw new AdventureError(400, '请先将战役图片导入本机资源库，再保存作品。');
        await getLibrary().readResource(source.slice('/api/resources/'.length));
      }
      return { definition, expectedRevision: input.expectedRevision };
    } catch (error) { if (error instanceof AdventureError || error instanceof LibraryError) throw error; throw new AdventureError(400, error.message); }
  };
  const server = http.createServer(async (req, res) => {
    try {
      checkLocalRequest(req);
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/health') {
        if (req.method !== 'GET') throw new ApiError(405, '该接口仅支持 GET 请求。');
        return replyJson(res, 200, { ok: true, service: 'tabletop-model-proxy' });
      }
      if (url.pathname === '/api/adventures') {
        if (req.method === 'GET') return replyJson(res, 200, { adventures: getAdventures().list() });
        if (req.method === 'POST') { const input = await adventureInput(req); return replyJson(res, 201, getAdventures().save(input.definition)); }
        throw new ApiError(405, '战役作品仅支持 GET 或 POST。');
      }
      if (url.pathname === '/api/adventures/import') {
        if (req.method !== 'POST') throw new ApiError(405, '游戏模组导入仅支持 POST。');
        const input = await adventureInput(req);
        const result = getAdventures().importGame(input.definition);
        return replyJson(res, result.created ? 201 : 200, result);
      }
      if (url.pathname.startsWith('/api/adventures/')) {
        const match = /^\/api\/adventures\/([a-zA-Z0-9_-]+)$/.exec(url.pathname);
        if (!match) throw new ApiError(404, '战役接口不存在。');
        const revision = url.searchParams.get('revision');
        if (revision !== null && !/^[1-9]\d*$/.test(revision)) throw new ApiError(400, '作品版本无效。');
        if (req.method === 'GET') return replyJson(res, 200, getAdventures().get(match[1], revision === null ? undefined : Number(revision)));
        if (revision !== null) throw new ApiError(405, '固定作品版本不可修改。');
        if (req.method === 'PUT') { const input = await adventureInput(req); return replyJson(res, 200, getAdventures().save(input.definition, match[1], input.expectedRevision)); }
        throw new ApiError(405, '战役作品仅支持 GET 或 PUT。');
      }
      if (url.pathname === '/api/resources') {
        if (req.method !== 'POST') throw new ApiError(405, '图片上传仅支持 POST 请求。');
        const mime = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) throw new ApiError(415, '目前仅支持 PNG、JPEG、WebP 图片。');
        const bytes = await readRequestBuffer(req, RESOURCE_LIMIT, '图片不能超过 2 MB。');
        return replyJson(res, 201, await getLibrary().uploadResource(bytes, mime));
      }
      if (url.pathname.startsWith('/api/resources/')) {
        if (!['GET', 'HEAD'].includes(req.method)) throw new ApiError(405, '图片资源仅支持 GET 或 HEAD 请求。');
        const hash = url.pathname.slice('/api/resources/'.length);
        const resource = await getLibrary().readResource(hash);
        const headers = { 'Content-Type': resource.mime, 'Content-Length': resource.bytes.length, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', ETag: `"${hash}"` };
        if (req.headers['if-none-match'] === headers.ETag) { delete headers['Content-Length']; res.writeHead(304, headers); return res.end(); }
        res.writeHead(200, headers);
        return res.end(req.method === 'HEAD' ? undefined : resource.bytes);
      }
      if (url.pathname === '/api/library') {
        if (req.method === 'GET') return replyJson(res, 200, { entries: getLibrary().listEntries() });
        if (req.method === 'POST') return replyJson(res, 201, getLibrary().createEntry(await readJson(req, LIBRARY_BODY_LIMIT)));
        throw new ApiError(405, '物件库仅支持 GET 或 POST 请求。');
      }
      if (url.pathname.startsWith('/api/library/')) {
        const match = /^\/api\/library\/([^/]+)(?:\/revisions\/([^/]+))?$/.exec(url.pathname);
        if (!match) throw new ApiError(404, '物件库接口不存在。');
        const id = match[1]; const requestedRevision = match[2] ?? url.searchParams.get('revision') ?? undefined;
        if (requestedRevision !== undefined && !/^[1-9]\d*$/.test(requestedRevision)) throw new ApiError(400, '物件版本格式有误。');
        if (req.method === 'GET') return replyJson(res, 200, getLibrary().getEntry(id, requestedRevision === undefined ? undefined : Number(requestedRevision)));
        if (requestedRevision !== undefined) throw new ApiError(405, '固定物件版本不可修改。');
        if (req.method === 'PUT') {
          const { expectedRevision, ...draft } = await readJson(req, LIBRARY_BODY_LIMIT);
          return replyJson(res, 200, getLibrary().updateEntry(id, draft, expectedRevision));
        }
        if (req.method === 'DELETE') { getLibrary().deleteEntry(id); return replyJson(res, 200, { ok: true }); }
        throw new ApiError(405, '物件库条目仅支持 GET、PUT 或 DELETE 请求。');
      }
      if (url.pathname === '/api/chat' || url.pathname === '/api/models') {
        if (req.method !== 'POST') throw new ApiError(405, '该接口仅支持 POST 请求。');
        const input = await readJson(req);
        const connection = validateConnection(input);
        if (url.pathname === '/api/models') {
          const data = await fetchUpstream(connection, connection.provider === 'ollama' ? '/api/tags' : '/models', undefined, res, modelsTimeoutMs);
          const entries = connection.provider === 'ollama' ? data.models : data.data;
          if (!Array.isArray(entries)) throw new ApiError(502, '模型服务返回的模型列表格式有误。');
          const models = [...new Set(entries.map((item) => connection.provider === 'ollama' ? item?.name || item?.model : item?.id).filter((name) => typeof name === 'string' && name.trim()))];
          return replyJson(res, 200, { models });
        }
        const chat = validateChat(input);
        const body = { model: chat.model, messages: chat.messages, stream: false };
        if (chat.responseFormat === 'json' || chat.responseFormat === 'tabletop') {
          if (connection.provider === 'ollama') body.format = chat.responseFormat === 'tabletop' ? TABLETOP_RESPONSE_SCHEMA : 'json';
          else body.response_format = { type: 'json_object' };
        }
        if (chat.temperature !== undefined) {
          if (connection.provider === 'ollama') body.options = { temperature: chat.temperature };
          else body.temperature = chat.temperature;
        }
        const data = await fetchUpstream(connection, connection.provider === 'ollama' ? '/api/chat' : '/chat/completions', body, res, chatTimeoutMs);
        const message = connection.provider === 'ollama' ? data.message?.content : data.choices?.[0]?.message?.content;
        if (typeof message !== 'string' || !message.trim()) throw new ApiError(502, '模型没有返回文本，请检查模型是否支持聊天。');
        return replyJson(res, 200, { message });
      }
      if (url.pathname.startsWith('/api/')) throw new ApiError(404, '接口不存在。');
      await serveStatic(req, res, url, distDirectory);
    } catch (error) {
      const known = error instanceof ApiError || error instanceof LibraryError || error instanceof AdventureError;
      replyJson(res, known ? error.status : 500, { error: known ? error.message : '服务出现异常，请稍后重试。' });
    }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 15000;
  server.maxConnections = 64;
  server.once('close', () => { library?.close(); adventures?.close(); });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('PORT 必须是 1 至 65535 之间的端口号。');
    process.exitCode = 1;
  } else {
    const server = createAppServer();
    server.on('error', (error) => {
      console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，请关闭旧进程或设置 PORT。` : '模型代理服务无法启动。');
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => console.log(`桌游模拟器已启动：http://127.0.0.1:${port}`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.close(); server.closeAllConnections(); });
  }
}
