import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createAppServer } from './index.mjs';
import { epicAdventure, blankAdventure } from '../src/lib/adventure-engine.ts';
import { createObject } from '../src/lib/tabletop.ts';
import { characterModel, emptyPresentation } from '../src/lib/tavern-presentation.ts';
import { adventureFromRpg, blankRpgAdventure, startRpgAdventure } from '../src/lib/rpg-engine.ts';
import { withRpgPartyCards, configuredRpgCard, refreshRpgCardValues, rpgCardForRole } from '../src/lib/rpg-character-cards.ts';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGr8AAAAASUVORK5CYII=', 'base64');
async function close(server) { if (server.listening) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); }
async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tabletop-adventure-'));
  const servers = [];
  const start = async () => { const server = createAppServer({ dataDirectory: directory, seedBuiltins: false, ...options }); servers.push(server); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return { server, base: `http://127.0.0.1:${server.address().port}` }; };
  t.after(async () => { for (const server of servers) await close(server); const resolved = path.resolve(directory); assert.equal(path.dirname(resolved), path.resolve(os.tmpdir())); assert.ok(path.basename(resolved).startsWith('tabletop-adventure-')); await rm(resolved, { recursive: true, force: true }); });
  return { ...await start(), start };
}
async function json(base, endpoint, method = 'GET', body, headers = {}) { const r = await fetch(base + endpoint, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() }; }

test('custom RPG cards, portraits and pawn configuration persist through import and restart', async t => {
  const f = await fixture(t);
  const upload = await fetch(f.base + '/api/resources', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: PNG });
  assert.equal(upload.status, 201); const image = (await upload.json()).url;
  const d = withRpgPartyCards(blankRpgAdventure());
  Object.assign(d.rpg.roles.hero, { hp: 210, color: '#994bd4', weapon: 'custom_blade', magics: [{ id: 'custom_slash', lv: 201 }], growth: { defence: .8 }, tabletopAppearance: createObject('figurine', { texture: image, metadata: { model: 'warrior', tavernPortrait: false } }) });
  d.rpg.items.custom_blade = { name: '星际光刃', type: 1, addAttack: 8 };
  d.rpg.magics.custom_slash = { name: '星际斩', school: 1, dicePool: { dice: [{ count: 3, sides: 8 }], mode: 'power', modifier: 2 } };
  const card = configuredRpgCard(d, 'hero'); card.portrait = image; card.sheet.values.custom_faction = '自由星区';
  card.sheet.schema.modules[1].fields.push({ id: 'custom_shield', label: '护盾', type: 'resource' }, { id: 'custom_secret', label: '隐秘身份', type: 'text', private: true });
  card.sheet.values.custom_shield = { value: 8, max: 12 }; card.sheet.values.custom_secret = '卧底';
  const compiled = adventureFromRpg(d.rpg, refreshRpgCardValues(d));
  const imported = await json(f.base, '/api/adventures/import', 'POST', { definition: compiled }); assert.equal(imported.status, 201);
  const again = await json(f.base, '/api/adventures/import', 'POST', { definition: compiled }); assert.equal(again.status, 200); assert.equal(again.body.created, false);
  await close(f.server); const restarted = await f.start();
  const restored = await json(restarted.base, `/api/adventures/${imported.body.definition.id}`); assert.equal(restored.status, 200);
  const savedCard = configuredRpgCard(restored.body, 'hero'); assert.equal(savedCard.portrait, image); assert.deepEqual(savedCard.sheet.values.custom_shield, { value: 8, max: 12 }); assert.equal(savedCard.sheet.values.custom_secret, '卧底');
  const table = startRpgAdventure(restored.body); assert.equal(table.objects.find(o => o.metadata.rpgRoleId === 'hero').metadata.model, 'warrior');
  assert.equal(rpgCardForRole(table, 'hero').card.sheet.values.rpg_attack, 20); assert.equal(rpgCardForRole(table, 'hero').card.sheet.values.rpg_hp.max, 210);
});

test('authored adventures persist immutable versions across server restart', async t => {
  const f = await fixture(t); const created = await json(f.base, '/api/adventures', 'POST', { definition: epicAdventure() });
  assert.equal(created.status, 201); assert.equal(created.body.revision, 1);
  const changed = await json(f.base, `/api/adventures/${created.body.id}`, 'PUT', { definition: { ...created.body, title: '作者第二版' }, expectedRevision: 1 });
  assert.equal(changed.status, 200); assert.equal(changed.body.revision, 2);
  assert.deepEqual((await json(f.base, `/api/adventures/${created.body.id}?revision=1`)).body, created.body);
  await close(f.server); const reopened = await f.start();
  assert.deepEqual((await json(reopened.base, `/api/adventures/${created.body.id}`)).body, changed.body);
  const listing = (await json(reopened.base, '/api/adventures')).body.adventures;
  assert.equal(listing.length, 1); assert.equal(listing[0].title, '作者第二版'); assert.equal(listing[0].chapters, 3); assert.equal(listing[0].scenes, 7);
});

test('a clean installation has no game works or bundled RPG content', async t => {
  const f = await fixture(t, { distDirectory: path.resolve('public') });
  assert.equal((await json(f.base, '/api/adventures')).body.adventures.length, 0);
  const response = await fetch(f.base + '/games/starsea.adventure.json');
  assert.equal(response.status, 404);
  await close(f.server); const reopened = await f.start();
  assert.equal((await json(reopened.base, '/api/adventures')).body.adventures.length, 0);
});

test('stale author updates and ID mismatches cannot overwrite the latest version', async t => {
  const { base } = await fixture(t); const original = (await json(base, '/api/adventures', 'POST', { definition: blankAdventure() })).body;
  const endpoint = `/api/adventures/${original.id}`;
  const versions = await Promise.all(['稿一', '稿二'].map(title => json(base, endpoint, 'PUT', { definition: { ...original, title }, expectedRevision: 1 })));
  assert.deepEqual(versions.map(x => x.status).sort(), [200, 409]);
  const winner = versions.find(x => x.status === 200).body;
  assert.equal((await json(base, endpoint, 'PUT', { definition: { ...winner, id: 'different' }, expectedRevision: 2 })).status, 409);
  assert.deepEqual((await json(base, endpoint)).body, winner);
  assert.equal((await json(base, endpoint + '?revision=1', 'PUT', { definition: original, expectedRevision: 1 })).status, 405);
});

test('incomplete story graphs can be saved as drafts while malformed state is rejected atomically', async t => {
  const { base } = await fixture(t); const draft = blankAdventure(); draft.scenes[0].choices[0].nextSceneId = '';
  const saved = await json(base, '/api/adventures', 'POST', { definition: draft }); assert.equal(saved.status, 201);
  for (const corrupt of [ { ...draft, schemaVersion: 9 }, { ...draft, variables: [{ id: 'test', name: '金币', min: 4, max: 1, initial: 2 }] }, { ...draft, characters: [{ ...draft.characters[0], id: '__proto__' }] }, { ...draft, scenes: [draft.scenes[0], draft.scenes[0]] } ]) assert.equal((await json(base, '/api/adventures', 'POST', { definition: corrupt })).status, 400);
  assert.equal((await json(base, '/api/adventures')).body.adventures.length, 1);
  assert.equal((await json(base, `/api/adventures/${saved.body.id}`)).body.scenes[0].choices[0].nextSceneId, '');
});

test('all future scene and character assets must exist before a story version is committed', async t => {
  const { base } = await fixture(t);
  const upload = await fetch(base + '/api/resources', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: PNG }); assert.equal(upload.status, 201); const resource = await upload.json();
  const d = blankAdventure(); d.characters[0].appearance = createObject('figurine', { texture: resource.url });
  d.scenes[1].objects = [createObject('board', { texture: resource.url })];
  const saved = await json(base, '/api/adventures', 'POST', { definition: d }); assert.equal(saved.status, 201);
  for (const texture of ['/api/resources/' + 'a'.repeat(64), 'https://example.com/image.png', 'data:image/png;base64,' + PNG.toString('base64')]) {
    const bad = structuredClone(saved.body); bad.scenes[1].objects[0].texture = texture;
    const r = await json(base, `/api/adventures/${bad.id}`, 'PUT', { definition: bad, expectedRevision: 1 }); assert.ok([400, 404].includes(r.status));
  }
  assert.deepEqual((await json(base, `/api/adventures/${saved.body.id}`)).body, saved.body);
});

test('local origin restrictions also protect authored campaign writes', async t => {
  const { base } = await fixture(t);
  assert.equal((await json(base, '/api/adventures', 'POST', { definition: blankAdventure() }, { Origin: 'https://outside.example' })).status, 403);
  assert.equal((await json(base, '/api/adventures')).body.adventures.length, 0);
});

test('Bear Tavern character archives and animation resources survive authored story versions', async t => {
  const { base } = await fixture(t);
  const resource = await (await fetch(base + '/api/resources', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: PNG })).json();
  const definition = blankAdventure(); definition.tavern = emptyPresentation();
  const card = characterModel.createCard('dnd5', definition.tavern.archive); card.name = '档案冒险者'; card.portrait = resource.url; definition.tavern.archive.cards.push(card);
  definition.tavern.bindings[definition.characters[0].id] = card.id;
  definition.tavern.effects.push({ id: 'intro', name: '入场演出', url: resource.url, width: 640, height: 240, duration: 2, loops: 1, scope: 'table', target: '', sceneId: definition.startSceneId, trigger: 'scene' });
  const saved = await json(base, '/api/adventures', 'POST', { definition }); assert.equal(saved.status, 201); assert.deepEqual(saved.body.tavern, definition.tavern);
  const bad = structuredClone(saved.body); bad.tavern.effects[0].url = '/api/resources/' + 'a'.repeat(64);
  assert.equal((await json(base, `/api/adventures/${bad.id}`, 'PUT', { definition: bad, expectedRevision: 1 })).status, 404);
  const badPortrait = structuredClone(saved.body); badPortrait.tavern.archive.cards[0].portrait = '/api/resources/' + 'a'.repeat(64);
  assert.equal((await json(base, `/api/adventures/${bad.id}`, 'PUT', { definition: badPortrait, expectedRevision: 1 })).status, 404);
  assert.deepEqual((await json(base, `/api/adventures/${saved.body.id}`)).body.tavern, definition.tavern);
});

test('missing stories, invalid revisions and unsupported routes return explicit errors', async t => {
  const { base } = await fixture(t);
  assert.equal((await json(base, '/api/adventures/unknown')).status, 404);
  assert.equal((await json(base, '/api/adventures/unknown?revision=0')).status, 400);
  assert.equal((await json(base, '/api/adventures/unknown?revision=9007199254740993')).status, 404);
  assert.equal((await json(base, '/api/adventures', 'DELETE')).status, 405);
});

test('imported modules persist and concurrent repeated imports do not duplicate or overwrite edited works', async t => {
  const f = await fixture(t);
  const definition = blankRpgAdventure();
  const results = await Promise.all(Array.from({ length: 3 }, () => json(f.base, '/api/adventures/import', 'POST', { definition })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 200, 201]);
  assert.equal(new Set(results.map(r => r.body.definition.id)).size, 1);
  const original = results[0].body.definition;
  assert.notEqual(original.id, definition.id);
  assert.equal(original.revision, 1);
  const edited = (await json(f.base, `/api/adventures/${original.id}`, 'PUT', { definition: { ...original, title: '我的星海改编' }, expectedRevision: 1 })).body;
  await close(f.server); const reopened = await f.start();
  const repeated = await json(reopened.base, '/api/adventures/import', 'POST', { definition: { ...definition, id: 'a-new-local-draft', revision: 7 } });
  assert.equal(repeated.status, 200); assert.equal(repeated.body.created, false);
  assert.deepEqual(repeated.body.definition, edited);
  const listing = (await json(reopened.base, '/api/adventures')).body.adventures;
  assert.equal(listing.length, 1); assert.equal(listing[0].imported, true);
  assert.deepEqual((await json(reopened.base, `/api/adventures/${original.id}?revision=1`)).body, original);
  const changedPack = await json(reopened.base, '/api/adventures/import', 'POST', { definition: { ...definition, summary: '新剧情版本' } });
  assert.equal(changedPack.status, 201); assert.notEqual(changedPack.body.definition.id, original.id);
  assert.equal((await json(reopened.base, '/api/adventures')).body.adventures.length, 2);
});

test('module imports reject broken graphs, missing RPG appearance resources and non-local origins atomically', async t => {
  const { base } = await fixture(t);
  const broken = blankAdventure(); broken.scenes[0].choices[0].nextSceneId = 'missing';
  assert.equal((await json(base, '/api/adventures/import', 'POST', { definition: broken })).status, 400);
  const rpg = blankRpgAdventure(); rpg.rpg.enemies.guard.tabletopAppearance = createObject('figurine', { texture: '/api/resources/' + 'a'.repeat(64) });
  assert.equal((await json(base, '/api/adventures/import', 'POST', { definition: rpg })).status, 404);
  assert.equal((await json(base, '/api/adventures/import', 'POST', { definition: blankAdventure() }, { Origin: 'https://outside.example' })).status, 403);
  assert.equal((await json(base, '/api/adventures/import')).status, 405);
  assert.equal((await json(base, '/api/adventures')).body.adventures.length, 0);
});
