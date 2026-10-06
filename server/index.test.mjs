import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createAppServer } from './index.mjs';
import { TABLETOP_RESPONSE_SCHEMA } from './tabletop-schema.mjs';

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
}

async function setup(t, handler, config = {}) {
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
    await handler(req, res, body);
  });
  const upstreamUrl = await listen(upstream);
  const proxy = createAppServer(config);
  const proxyUrl = await listen(proxy);
  t.after(async () => { await close(proxy); await close(upstream); });
  return { upstreamUrl, proxyUrl };
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function post(base, endpoint, data, headers = {}) {
  const response = await fetch(`${base}${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data),
  });
  return { status: response.status, body: await response.json() };
}

const chatInput = { model: 'test-model', messages: [{ role: 'system', content: '担任主持人。' }, { role: 'user', content: '观察房间。' }], temperature: 0.7 };

test('Ollama chat sends non-streaming native options and preserves Chinese text', async (t) => {
  let received;
  const { upstreamUrl, proxyUrl } = await setup(t, (req, res, body) => {
    received = { url: req.url, body };
    json(res, { message: { role: 'assistant', content: '门后传来低沉的脚步声。' } });
  });
  const result = await post(proxyUrl, '/api/chat', { ...chatInput, provider: 'ollama', baseUrl: `${upstreamUrl}/` });
  assert.deepEqual(result, { status: 200, body: { message: '门后传来低沉的脚步声。' } });
  assert.deepEqual(received, { url: '/api/chat', body: { model: chatInput.model, messages: chatInput.messages, stream: false, options: { temperature: 0.7 } } });
});

test('OpenAI-compatible chat handles root and /v1 addresses and sends Authorization', async (t) => {
  const requests = [];
  const { upstreamUrl, proxyUrl } = await setup(t, (req, res, body) => {
    requests.push({ url: req.url, body, auth: req.headers.authorization });
    json(res, { choices: [{ message: { role: 'assistant', content: '请进行一次察觉检定。' } }] });
  });
  for (const baseUrl of [upstreamUrl, `${upstreamUrl}/v1/`]) {
    const result = await post(proxyUrl, '/api/chat', { ...chatInput, provider: 'openai', baseUrl, apiKey: 'test-key' });
    assert.deepEqual(result, { status: 200, body: { message: '请进行一次察觉检定。' } });
  }
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.url, '/v1/chat/completions');
    assert.equal(request.auth, 'Bearer test-key');
    assert.deepEqual(request.body, { model: chatInput.model, messages: chatInput.messages, stream: false, temperature: 0.7 });
  }
});

test('JSON response format uses each provider protocol only when explicitly requested', async (t) => {
  const requests = [];
  const content = '{"message":"等待应用","actions":[]}';
  const { upstreamUrl, proxyUrl } = await setup(t, (req, res, body) => {
    requests.push({ url: req.url, body });
    if (req.url === '/api/chat') json(res, { message: { content } });
    else json(res, { choices: [{ message: { content } }] });
  });
  for (const provider of ['ollama', 'openai']) {
    const input = { ...chatInput, provider, baseUrl: upstreamUrl };
    const structured = await post(proxyUrl, '/api/chat', { ...input, responseFormat: 'json' });
    assert.deepEqual(structured, { status: 200, body: { message: content } });
    const structuredBody = requests.at(-1).body;
    if (provider === 'ollama') {
      assert.equal(structuredBody.format, 'json');
      assert.ok(!Object.hasOwn(structuredBody, 'response_format'));
    } else {
      assert.deepEqual(structuredBody.response_format, { type: 'json_object' });
      assert.ok(!Object.hasOwn(structuredBody, 'format'));
    }
    const narrative = await post(proxyUrl, '/api/chat', input);
    assert.equal(narrative.status, 200);
    assert.ok(!Object.hasOwn(requests.at(-1).body, 'format'));
    assert.ok(!Object.hasOwn(requests.at(-1).body, 'response_format'));
  }
  assert.equal(requests.length, 4);
});

test('invalid responseFormat values are rejected before either upstream is called', async (t) => {
  let calls = 0;
  const { upstreamUrl, proxyUrl } = await setup(t, (req, res) => { calls += 1; json(res, {}); });
  for (const provider of ['ollama', 'openai']) {
    for (const responseFormat of ['text', 'JSON', 'TABLETOP', 'json_schema', '', null, true, 1, { type: 'json_object' }, TABLETOP_RESPONSE_SCHEMA]) {
      const result = await post(proxyUrl, '/api/chat', { ...chatInput, provider, baseUrl: upstreamUrl, responseFormat });
      assert.equal(result.status, 400);
      assert.match(result.body.error, /responseFormat.*json/);
    }
  }
  assert.equal(calls, 0);
});

test('tabletop format uses the fixed strict schema for Ollama and JSON object for compatible APIs', async (t) => {
  const requests = [];
  const content = '{"message":"等待应用","actions":[]}';
  const { upstreamUrl, proxyUrl } = await setup(t, (req, res, body) => {
    requests.push(body);
    if (req.url === '/api/chat') json(res, { message: { content } });
    else json(res, { choices: [{ message: { content } }] });
  });
  for (const provider of ['ollama', 'openai']) {
    const result = await post(proxyUrl, '/api/chat', {
      ...chatInput, provider, baseUrl: upstreamUrl, responseFormat: 'tabletop',
      schema: { type: 'object', additionalProperties: true }, format: { type: 'string' },
    });
    assert.deepEqual(result, { status: 200, body: { message: content } });
  }
  assert.deepEqual(requests[0].format, TABLETOP_RESPONSE_SCHEMA);
  assert.ok(!Object.hasOwn(requests[0], 'schema'));
  assert.ok(!Object.hasOwn(requests[0], 'response_format'));
  assert.deepEqual(requests[1].response_format, { type: 'json_object' });
  assert.ok(!Object.hasOwn(requests[1], 'format'));
  assert.ok(!Object.hasOwn(requests[1], 'schema'));
});

test('tabletop schema constrains every action branch and finite coordinate ranges', () => {
  assert.equal(TABLETOP_RESPONSE_SCHEMA.additionalProperties, false);
  assert.deepEqual(TABLETOP_RESPONSE_SCHEMA.required, ['message', 'actions']);
  assert.equal(TABLETOP_RESPONSE_SCHEMA.properties.actions.maxItems, 16);
  const branches = TABLETOP_RESPONSE_SCHEMA.properties.actions.items.anyOf;
  assert.deepEqual([...new Set(branches.map((branch) => branch.properties.type.enum[0]))], ['spawn', 'move', 'update', 'roll', 'shuffle', 'draw', 'remove']);
  for (const branch of branches) {
    assert.equal(branch.additionalProperties, false);
    assert.ok(branch.required.includes('type'));
    assert.ok(!Object.hasOwn(branch.properties, 'rotation'));
    assert.ok(!Object.hasOwn(branch.properties, 'texture'));
    if (branch.properties.position) {
      assert.equal(branch.properties.position.minItems, 3);
      assert.equal(branch.properties.position.maxItems, 3);
      assert.deepEqual(branch.properties.position.items.map(({ minimum, maximum }) => [minimum, maximum]), [[-14, 14], [0, 30], [-10, 10]]);
    }
  }
  const diceSpawn = branches.find((branch) => branch.properties.kind?.enum.includes('dice'));
  assert.deepEqual(diceSpawn.properties.sides.enum, [4, 6, 8, 10, 12, 20]);
  const update = branches.find((branch) => branch.properties.type.enum[0] === 'update');
  assert.equal(update.minProperties, 3);
  assert.equal(update.properties.description.type, 'string');
  assert.ok(!JSON.stringify(TABLETOP_RESPONSE_SCHEMA).includes('maxLength'));
});

test('model discovery normalizes and deduplicates both providers', async (t) => {
  const { upstreamUrl, proxyUrl } = await setup(t, (req, res) => {
    if (req.url === '/api/tags') json(res, { models: [{ name: 'qwen3:8b' }, { name: 'qwen3:8b' }, { model: 'gemma3:4b' }, {}] });
    else if (req.url === '/v1/models') json(res, { data: [{ id: 'model-a' }, { id: 'model-b' }] });
    else json(res, { error: 'unexpected endpoint' }, 404);
  });
  const ollama = await post(proxyUrl, '/api/models', { provider: 'ollama', baseUrl: `${upstreamUrl}/api` });
  const openai = await post(proxyUrl, '/api/models', { provider: 'openai', baseUrl: upstreamUrl });
  assert.deepEqual(ollama, { status: 200, body: { models: ['qwen3:8b', 'gemma3:4b'] } });
  assert.deepEqual(openai, { status: 200, body: { models: ['model-a', 'model-b'] } });
});

test('Ollama model-not-found response is a readable upstream error', async (t) => {
  const { upstreamUrl, proxyUrl } = await setup(t, (req, res) => json(res, { error: "model 'missing' not found" }, 404));
  const result = await post(proxyUrl, '/api/chat', { ...chatInput, provider: 'ollama', baseUrl: upstreamUrl });
  assert.equal(result.status, 502);
  assert.match(result.body.error, /模型服务请求失败/);
  assert.match(result.body.error, /not found/);
});

test('OpenAI-compatible authentication errors redact any echoed API key', async (t) => {
  const apiKey = 'secret-test-key';
  const { upstreamUrl, proxyUrl } = await setup(t, (req, res) => json(res, { error: { message: `Invalid API key ${apiKey}; Bearer another-token` } }, 401));
  const result = await post(proxyUrl, '/api/chat', { ...chatInput, provider: 'openai', baseUrl: upstreamUrl, apiKey });
  assert.equal(result.status, 502);
  assert.match(result.body.error, /认证失败/);
  assert.ok(!result.body.error.includes(apiKey));
  assert.ok(!result.body.error.includes('another-token'));
});

test('timeouts abort stalled upstream requests', async (t) => {
  const { upstreamUrl, proxyUrl } = await setup(t, () => {}, { chatTimeoutMs: 40 });
  const result = await post(proxyUrl, '/api/chat', { ...chatInput, provider: 'ollama', baseUrl: upstreamUrl });
  assert.equal(result.status, 504);
  assert.match(result.body.error, /超时/);
});

test('invalid payloads are rejected before reaching upstream', async (t) => {
  let called = 0;
  const { upstreamUrl, proxyUrl } = await setup(t, (req, res) => { called += 1; json(res, {}); });
  const base = { ...chatInput, provider: 'ollama', baseUrl: upstreamUrl };
  const invalid = [
    { ...base, provider: 'other' }, { ...base, baseUrl: 'file:///etc/passwd' },
    { ...base, baseUrl: `${upstreamUrl}?token=secret` }, { ...base, apiKey: 'bad\nkey' },
    { ...base, model: '' }, { ...base, messages: [] },
    { ...base, messages: [{ role: 'tool', content: 'unsupported' }] },
    { ...base, temperature: 3 }, { ...base, messages: [{ role: 'user', content: 'a'.repeat(131073) }] },
  ];
  for (const payload of invalid) {
    const result = await post(proxyUrl, '/api/chat', payload);
    assert.equal(result.status, 400);
    assert.equal(typeof result.body.error, 'string');
  }
  assert.equal(called, 0);
  const malformed = await fetch(`${proxyUrl}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  const large = await post(proxyUrl, '/api/chat', { ...base, messages: [{ role: 'user', content: 'a'.repeat(1024 * 1024) }] });
  assert.equal(large.status, 413);
});

test('browser guard blocks external origins and permits localhost and CLI requests', async (t) => {
  const { proxyUrl } = await setup(t, (req, res) => json(res, {}));
  const blocked = await fetch(`${proxyUrl}/api/health`, { headers: { Origin: 'https://malicious.example' } });
  assert.equal(blocked.status, 403);
  const localhost = await fetch(`${proxyUrl}/api/health`, { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(localhost.status, 200);
  const cli = await fetch(`${proxyUrl}/api/health`);
  assert.deepEqual(await cli.json(), { ok: true, service: 'tabletop-model-proxy' });
  const rebindingStatus = await new Promise((resolve, reject) => {
    const request = http.get(`${proxyUrl}/api/health`, { headers: { Host: 'malicious.example' } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on('error', reject);
  });
  assert.equal(rebindingStatus, 403);
});

test('static serving supports SPA and HEAD without exposing other files', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tabletop-dist-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'index.html'), '<html>桌游大厅</html>');
  await writeFile(path.join(directory, 'app.js'), 'console.log("ready");');
  const { proxyUrl } = await setup(t, (req, res) => json(res, {}), { distDirectory: directory });
  const spa = await fetch(`${proxyUrl}/campaign/one`, { headers: { Accept: 'text/html' } });
  assert.equal(spa.status, 200);
  assert.equal(await spa.text(), '<html>桌游大厅</html>');
  const head = await fetch(`${proxyUrl}/app.js`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.match(head.headers.get('Content-Type'), /javascript/);
  assert.equal(await head.text(), '');
  const missing = await fetch(`${proxyUrl}/missing.js`);
  assert.equal(missing.status, 404);
  const traversal = await fetch(`${proxyUrl}/%2e%2e%5coutside.txt`);
  assert.equal(traversal.status, 400);
  const unknownApi = await fetch(`${proxyUrl}/api/unknown`);
  assert.equal(unknownApi.status, 404);
});

test('malformed or empty upstream replies fail clearly', async (t) => {
  let call = 0;
  const { upstreamUrl, proxyUrl } = await setup(t, (req, res) => {
    if (call++ === 0) { res.end('not JSON'); return; }
    json(res, { choices: [{ message: { content: '' } }] });
  });
  const input = { ...chatInput, provider: 'openai', baseUrl: upstreamUrl };
  const malformed = await post(proxyUrl, '/api/chat', input);
  assert.equal(malformed.status, 502);
  assert.match(malformed.body.error, /JSON/);
  const empty = await post(proxyUrl, '/api/chat', input);
  assert.equal(empty.status, 502);
  assert.match(empty.body.error, /没有返回文本/);
});

test('JSON null and oversized upstream replies return gateway errors', async (t) => {
  let call = 0;
  const { upstreamUrl, proxyUrl } = await setup(t, (req, res) => {
    if (call++ === 0) { json(res, null); return; }
    json(res, { message: { content: 'a'.repeat(2 * 1024 * 1024) } });
  });
  const input = { ...chatInput, provider: 'ollama', baseUrl: upstreamUrl };
  const nullReply = await post(proxyUrl, '/api/chat', input);
  assert.equal(nullReply.status, 502);
  assert.match(nullReply.body.error, /数据格式有误/);
  const oversized = await post(proxyUrl, '/api/chat', input);
  assert.equal(oversized.status, 502);
  assert.match(oversized.body.error, /超过 2 MB/);
});
