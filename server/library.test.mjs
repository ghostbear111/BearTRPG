import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createAppServer } from './index.mjs';
import { createLibraryStore } from './library-store.mjs';
import { fileURLToPath } from 'node:url';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGr8AAAAASUVORK5CYII=', 'base64');

function draft(overrides = {}) {
  return {
    schemaVersion: 1, name: '自定义棋子', description: '可反复从库中取用的物件模板。', tags: ['棋子', '原创'], listed: true, kind: 'figurine',
    template: { color: '#aabbcc', scale: [1, 1, 1], rotation: [0, 0, 0], sides: 0, value: 0, texture: '', backTexture: '', metadata: { team: '红方' } },
    ...overrides,
  };
}
async function close(server) {
  if (!server.listening) return;
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
}
const scopes = new WeakMap();
async function start(t, options = {}) {
  let scope = scopes.get(t);
  if (!scope) {
    scope = { servers: [], directories: [] }; scopes.set(t, scope);
    t.after(async () => {
      await Promise.all(scope.servers.map(close));
      for (const directory of scope.directories) await rm(directory, { recursive: true, force: true });
    });
  }
  const directory = options.dataDirectory ?? await mkdtemp(path.join(os.tmpdir(), 'tabletop-library-'));
  if (!options.dataDirectory) scope.directories.push(directory);
  const server = createAppServer({ dataDirectory: directory, seedBuiltins: false, ...options });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  scope.servers.push(server);
  return { server, directory, base: `http://127.0.0.1:${server.address().port}` };
}
async function json(base, endpoint, method = 'GET', body) {
  const response = await fetch(`${base}${endpoint}`, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json() };
}
async function upload(base, bytes = PNG, mime = 'image/png') {
  const response = await fetch(`${base}/api/resources`, { method: 'POST', headers: { 'Content-Type': mime }, body: bytes });
  return { status: response.status, body: await response.json() };
}
function databaseStats(directory) {
  const db = new DatabaseSync(path.join(directory, 'catalog.sqlite'), { readOnly: true });
  try {
    return {
      resources: db.prepare('SELECT COUNT(*) AS count FROM resources').get().count,
      entries: db.prepare('SELECT COUNT(*) AS count FROM library_entries').get().count,
      revisions: db.prepare('SELECT COUNT(*) AS count FROM library_revisions').get().count,
      refs: db.prepare('SELECT COUNT(*) AS count FROM library_resource_refs').get().count,
    };
  } finally { db.close(); }
}

test('resources use SHA256 deduplication and survive a server restart', async (t) => {
  const first = await start(t);
  const simultaneous = await Promise.all(Array.from({ length: 4 }, () => upload(first.base)));
  const one = simultaneous[0]; const two = await upload(first.base);
  const hash = createHash('sha256').update(PNG).digest('hex');
  assert.equal(one.status, 201);
  assert.deepEqual(one.body, { sha256: hash, mime: 'image/png', byteLength: PNG.length, url: `/api/resources/${hash}` });
  assert.deepEqual(one, two);
  for (const item of simultaneous) assert.deepEqual(item, one);
  assert.equal(databaseStats(first.directory).resources, 1);
  assert.deepEqual(await readdir(path.join(first.directory, 'resources', hash.slice(0, 2))), [hash]);
  const created = await json(first.base, '/api/library', 'POST', draft({ template: { ...draft().template, texture: one.body.url } }));
  assert.equal(created.status, 201);
  await close(first.server);
  const restarted = await start(t, { dataDirectory: first.directory });
  const list = await json(restarted.base, '/api/library');
  assert.deepEqual(list.body.entries, [created.body]);
  const file = await fetch(`${restarted.base}${one.body.url}`);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('Content-Type'), 'image/png');
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), PNG);
  const cached = await fetch(`${restarted.base}${one.body.url}`, { headers: { 'If-None-Match': `"${hash}"` } });
  assert.equal(cached.status, 304);
});

test('authored movement rules survive revisions and restart; malformed rules never enter the library', async (t) => {
  const first = await start(t);
  const metadata = { moveMode: 'grid', moveRange: 2, moveStep: .5, moveSeat: '玩家2', movePathCheck: true };
  const created = await json(first.base, '/api/library', 'POST', draft({ template: { ...draft().template, metadata } }));
  assert.equal(created.status, 201); assert.deepEqual(created.body.template.metadata, metadata);
  for (const invalid of [{ moveMode: 'physics' }, { moveRange: '2' }, { moveRange: 0 }, { moveStep: .1 }, { moveSeat: '玩家8' }, { movePathCheck: 1 }]) {
    const rejected = await json(first.base, '/api/library', 'POST', draft({ template: { ...draft().template, metadata: { ...metadata, ...invalid } } }));
    assert.equal(rejected.status, 400);
  }
  assert.equal(databaseStats(first.directory).entries, 1); assert.equal(databaseStats(first.directory).revisions, 1);
  await close(first.server);
  const restarted = await start(t, { dataDirectory: first.directory });
  assert.deepEqual((await json(restarted.base, '/api/library')).body.entries[0].template.metadata, metadata);
});

test('listed false remains manageable and immutable revisions remain available after deletion', async (t) => {
  const { base, directory } = await start(t);
  const resource = await upload(base);
  const created = await json(base, '/api/library', 'POST', draft({ template: { ...draft().template, texture: resource.body.url } }));
  const original = created.body;
  assert.equal(original.revision, 1);
  const updated = await json(base, `/api/library/${original.id}`, 'PUT', { ...draft({ name: '改过名称', listed: false }), expectedRevision: 1 });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.revision, 2);
  assert.equal(updated.body.listed, false);
  assert.deepEqual((await json(base, '/api/library')).body.entries, [updated.body]);
  assert.deepEqual((await json(base, `/api/library/${original.id}/revisions/1`)).body, original);
  assert.deepEqual((await json(base, `/api/library/${original.id}?revision=1`)).body, original);
  const stale = await json(base, `/api/library/${original.id}`, 'PUT', { ...draft({ name: '过期覆盖' }), expectedRevision: 1 });
  assert.equal(stale.status, 409);
  assert.deepEqual((await json(base, `/api/library/${original.id}`)).body, updated.body);
  assert.equal((await json(base, `/api/library/${original.id}`, 'DELETE')).status, 200);
  assert.deepEqual((await json(base, '/api/library')).body.entries, []);
  assert.equal((await json(base, `/api/library/${original.id}`)).status, 404);
  assert.deepEqual((await json(base, `/api/library/${original.id}/revisions/1`)).body, original);
  assert.equal((await fetch(`${base}${resource.body.url}`)).status, 200);
  assert.deepEqual(databaseStats(directory), { resources: 1, entries: 1, revisions: 2, refs: 1 });
});

test('invalid images, MIME mismatches and oversized uploads create no resources', async (t) => {
  const { base, directory } = await start(t);
  await json(base, '/api/library');
  for (const bytes of [Buffer.from('<svg><script>alert(1)</script></svg>'), PNG.subarray(0, 24), Buffer.alloc(60)]) {
    assert.equal((await upload(base, bytes)).status, 400);
  }
  assert.equal((await upload(base, PNG, 'image/jpeg')).status, 400);
  assert.equal((await upload(base, PNG, 'image/svg+xml')).status, 415);
  assert.equal((await upload(base, Buffer.alloc(2 * 1024 * 1024 + 1))).status, 413);
  assert.equal(databaseStats(directory).resources, 0);
  assert.deepEqual(await readdir(path.join(directory, 'resources')), []);
});

test('unsafe references and instance-only fields reject the whole draft without half entries', async (t) => {
  const { base, directory } = await start(t);
  await json(base, '/api/library');
  const missing = `/api/resources/${'a'.repeat(64)}`;
  const invalid = [
    draft({ template: { ...draft().template, texture: 'https://external.example/image.png' } }),
    draft({ template: { ...draft().template, texture: 'data:image/png;base64,abc' } }),
    draft({ template: { ...draft().template, texture: '/api/resources/../../secret' } }),
    draft({ template: { ...draft().template, texture: missing } }),
    draft({ template: { ...draft().template, id: 'instance-1' } }),
    draft({ template: { ...draft().template, metadata: { owner: '玩家1' } } }),
    draft({ template: { ...draft().template, metadata: { rollResult: 20 } } }),
    draft({ template: { ...draft().template, metadata: { CharacterSheetId: 'old-character' } } }),
    draft({ template: { ...draft().template, metadata: { currentHp: 3 } } }),
    draft({ template: { ...draft().template, metadata: Object.fromEntries(Array.from({ length: 63 }, (_, index) => [`property${index}`, index])) } }),
    draft({ listed: 'true' }),
    draft({ tags: ['x'.repeat(49)] }),
    draft({ tags: ['重复', '重复'] }),
    draft({ kind: 'dice', template: { ...draft().template, sides: 6, scale: [1, 2, 1] } }),
  ];
  for (const input of invalid) assert.equal((await json(base, '/api/library', 'POST', input)).status, 400);
  assert.deepEqual((await json(base, '/api/library')).body.entries, []);
  assert.deepEqual(databaseStats(directory), { resources: 0, entries: 0, revisions: 0, refs: 0 });
  assert.equal((await fetch(`${base}/api/resources/%2e%2e%2fsecret`)).status, 400);
});

test('deck templates reference local images without carrying card identities', async (t) => {
  const { base, directory } = await start(t);
  const resource = await upload(base);
  const deck = draft({ kind: 'deck', template: { ...draft().template, cards: [{ name: '事件 1', description: '公开说明', texture: resource.body.url, backTexture: '' }] } });
  const created = await json(base, '/api/library', 'POST', deck);
  assert.equal(created.status, 201);
  assert.equal(created.body.template.cards[0].texture, resource.body.url);
  assert.ok(!Object.hasOwn(created.body.template.cards[0], 'id'));
  const unsafe = { ...deck, template: { ...deck.template, cards: [{ ...deck.template.cards[0], id: 'existing-card' }] } };
  assert.equal((await json(base, '/api/library', 'POST', unsafe)).status, 400);
  assert.equal(databaseStats(directory).revisions, 1);
});

test('resource corruption is detected and missing files cannot be used by a new revision', async (t) => {
  const { base, directory } = await start(t);
  const resource = await upload(base);
  const filename = path.join(directory, 'resources', resource.body.sha256.slice(0, 2), resource.body.sha256);
  await writeFile(filename, Buffer.alloc(PNG.length));
  assert.equal((await fetch(`${base}${resource.body.url}`)).status, 500);
  assert.equal((await upload(base)).status, 201);
  assert.deepEqual(Buffer.from(await (await fetch(`${base}${resource.body.url}`)).arrayBuffer()), PNG);
  await rm(filename);
  const result = await json(base, '/api/library', 'POST', draft({ template: { ...draft().template, texture: resource.body.url } }));
  assert.equal(result.status, 400);
  assert.equal(databaseStats(directory).entries, 0);
  assert.equal((await upload(base)).status, 201);
  assert.equal((await json(base, '/api/library', 'POST', draft({ template: { ...draft().template, texture: resource.body.url } }))).status, 201);
  assert.equal(databaseStats(directory).resources, 1);
});

test('local origin protection applies to asset upload and library mutations', async (t) => {
  const { base } = await start(t);
  const library = await fetch(`${base}/api/library`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' }, body: JSON.stringify(draft()) });
  assert.equal(library.status, 403);
  const resource = await fetch(`${base}/api/resources`, { method: 'POST', headers: { 'Content-Type': 'image/png', Origin: 'https://untrusted.example' }, body: PNG });
  assert.equal(resource.status, 403);
  assert.deepEqual((await json(base, '/api/library')).body.entries, []);
});

test('builtin templates and the dice kit seed once and stay deleted after restart', async (t) => {
  const first = await start(t, { seedBuiltins: true });
  const entries = (await json(first.base, '/api/library')).body.entries;
  assert.equal(entries.length, 64);
  assert.deepEqual([...new Set(entries.map(entry => entry.kind))].sort(), ['block', 'board', 'card', 'deck', 'dice', 'figurine', 'token']);
  assert.deepEqual(entries.filter(entry => entry.kind === 'dice').map(entry => entry.template.sides).sort((a, b) => a - b), [4, 6, 6, 6, 8, 8, 10, 12, 20, 20]);
  const deck = entries.find(entry => entry.kind === 'deck');
  assert.equal(deck.template.cards.length, 12);
  assert.ok(deck.template.cards.every(card => !Object.hasOwn(card, 'id')));
  const builtin = entries[0];
  const { id: _id, revision: _revision, ...originalDraft } = builtin;
  const edited = await json(first.base, `/api/library/${builtin.id}`, 'PUT', { ...originalDraft, name: '用户修改内置模板', listed: false, expectedRevision: 1 });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.listed, false);
  for (const entry of entries) assert.equal((await json(first.base, `/api/library/${entry.id}`, 'DELETE')).status, 200);
  await close(first.server);
  const restarted = await start(t, { dataDirectory: first.directory, seedBuiltins: true });
  assert.deepEqual((await json(restarted.base, '/api/library')).body.entries, []);
  assert.equal((await json(restarted.base, `/api/library/${builtin.id}/revisions/2`)).body.name, '用户修改内置模板');
  assert.deepEqual(databaseStats(first.directory), { resources: 0, entries: 64, revisions: 65, refs: 0 });
});

test('large deck metadata is accepted up to the library-specific request limit', async (t) => {
  const { base } = await start(t);
  const deck = draft({ kind: 'deck', template: { ...draft().template, cards: Array.from({ length: 256 }, (_, index) => ({ name: `牌 ${index}`, description: 'a'.repeat(6000), texture: '', backTexture: '' })) } });
  assert.ok(Buffer.byteLength(JSON.stringify(deck)) > 1024 * 1024);
  assert.equal((await json(base, '/api/library', 'POST', deck)).status, 201);
});

test('upgrading a twelve-entry library appends the kit once without overwriting user revisions', async (t) => {
  const first = await start(t); await close(first.server);
  const old = createLibraryStore(first.directory, { builtinPath: fileURLToPath(new URL('./library-builtins.json', import.meta.url)) });
  const entries = old.listEntries(); assert.equal(entries.length, 12);
  const { id, revision, ...initial } = entries[0];
  const keep = old.updateEntry(id, { ...initial, name: '我的自定义模板', listed: false }, revision); old.close();
  const upgraded = await start(t, { dataDirectory: first.directory, seedBuiltins: true });
  const all = (await json(upgraded.base, '/api/library')).body.entries;
  assert.equal(all.length, 64); assert.deepEqual(all.find(e => e.id === keep.id), keep);
  const chest = all.find(e => e.template.metadata.model === 'chest');
  assert.equal(chest.template.metadata.behavior, 'open'); assert.equal(chest.template.metadata.lootHeal, 2);
  assert.equal((await json(upgraded.base, `/api/library/${chest.id}`, 'DELETE')).status, 200);
  await close(upgraded.server);
  const restarted = await start(t, { dataDirectory: first.directory, seedBuiltins: true });
  assert.equal((await json(restarted.base, '/api/library')).body.entries.length, 63);
});
