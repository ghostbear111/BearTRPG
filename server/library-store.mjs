import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, lstatSync } from 'node:fs';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { validateMovementMetadata } from '../src/lib/object-movement.ts';
import { validateDiceFaces } from '../src/lib/dice.ts';

export const RESOURCE_LIMIT = 2 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9_-]{1,120}$/;
const KINDS = ['token', 'figurine', 'dice', 'card', 'deck', 'board', 'block'];
const RUNTIME_KEYS = /^(?:id|position|owner.*|playerId|tavernCharacterId|character.*|sourceDeckId|sourceContainerId|adventureObjectId|opened|lit|activated|emptied|taken|equipped|focus|guarded|poisoned|libraryId|libraryRevision|guideState|relicGuideEvent|relicGuideDiscard|adventureDie|zone|selected|hand.*|roll.*|velocity|angularVelocity|sleeping|hp|currentHp|maxHp|ac|initiative)$/i;

export class LibraryError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LibraryError(400, `${label}格式有误。`);
  return value;
}
function fields(value, allowed, label) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new LibraryError(400, `${label}包含不支持的字段。`);
}
function text(value, label, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw new LibraryError(400, `${label}需为${required ? '非空' : ''}文本，最多 ${max} 个字符。`);
  return required ? value.trim() : value;
}
function number(value, label, min, max, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) throw new LibraryError(400, `${label}需为 ${min} 至 ${max} 之间的${integer ? '整数' : '数值'}。`);
  return value;
}
function vector(value, label, min, max) {
  if (!Array.isArray(value) || value.length !== 3) throw new LibraryError(400, `${label}需包含三个数值。`);
  return value.map((coordinate) => number(coordinate, label, min, max));
}
function bool(value, label) {
  if (typeof value !== 'boolean') throw new LibraryError(400, `${label}需为布尔值。`);
  return value;
}
function safeId(value) {
  if (typeof value !== 'string' || !ID.test(value) || ['__proto__', 'constructor', 'prototype'].includes(value)) throw new LibraryError(400, '物件库 ID 格式有误。');
  return value;
}
function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function imageMime(bytes) {
  if (bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && bytes.readUInt32BE(8) === 13 && bytes.toString('ascii', 12, 16) === 'IHDR'
    && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0
    && bytes.readUInt32BE(16) <= 16384 && bytes.readUInt32BE(20) <= 16384
    && bytes.subarray(-8).equals(Buffer.from([73, 69, 78, 68, 174, 66, 96, 130]))) return 'image/png';
  if (bytes.length >= 16 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217) return 'image/jpeg';
  if (bytes.length >= 26 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
    && bytes.readUInt32LE(4) === bytes.length - 8 && ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16))
    && bytes.readUInt32LE(16) > 0 && bytes.readUInt32LE(16) <= bytes.length - 20) return 'image/webp';
  throw new LibraryError(400, '文件不是有效签名的 PNG、JPEG 或 WebP 图片，或图片头已损坏。');
}

export function createLibraryStore(dataDirectory, { builtinPath, expansionPath, dicePath } = {}) {
  mkdirSync(dataDirectory, { recursive: true });
  const root = realpathSync(dataDirectory);
  const resourceRoot = path.join(root, 'resources');
  mkdirSync(resourceRoot, { recursive: true });
  if (!isWithin(root, realpathSync(resourceRoot))) throw new Error('资源仓库路径不在数据目录内。');
  const db = new DatabaseSync(path.join(root, 'catalog.sqlite'), { timeout: 5000 });
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS resources (sha256 TEXT PRIMARY KEY, mime TEXT NOT NULL, byte_length INTEGER NOT NULL, created_at INTEGER NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS library_entries (id TEXT PRIMARY KEY, current_revision INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS library_revisions (entry_id TEXT NOT NULL REFERENCES library_entries(id), revision INTEGER NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (entry_id, revision)) STRICT;
    CREATE TABLE IF NOT EXISTS library_resource_refs (entry_id TEXT NOT NULL, revision INTEGER NOT NULL, sha256 TEXT NOT NULL REFERENCES resources(sha256), PRIMARY KEY (entry_id, revision, sha256), FOREIGN KEY (entry_id, revision) REFERENCES library_revisions(entry_id, revision)) STRICT;
    PRAGMA user_version = 1;
  `);
  const transaction = (operation) => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = operation(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  // Serialize identical uploads so Windows never replaces a file another upload is committing.
  const uploads = new Map();
  function resourcePath(hash) {
    if (!HASH.test(hash)) throw new LibraryError(400, '资源哈希格式有误。');
    return path.join(resourceRoot, hash.slice(0, 2), hash);
  }
  function assertResourceFile(hash) {
    const file = resourcePath(hash);
    try {
      if (lstatSync(file).isSymbolicLink() || !isWithin(resourceRoot, realpathSync(file))) throw new Error();
    } catch { throw new LibraryError(404, '图片资源不存在或无法安全读取，请重新上传。'); }
    return file;
  }
  function resourceReference(value, label, refs) {
    if (value === '') return '';
    if (typeof value !== 'string' || !/^\/api\/resources\/[a-f0-9]{64}$/.test(value)) throw new LibraryError(400, `${label}只支持已上传的本机资源引用；请先上传图片。`);
    const hash = value.slice('/api/resources/'.length);
    if (!db.prepare('SELECT sha256 FROM resources WHERE sha256 = ?').get(hash)) throw new LibraryError(400, `${label}引用的资源不存在。`);
    try { assertResourceFile(hash); } catch { throw new LibraryError(400, `${label}引用的资源文件缺失。`); }
    refs.add(hash);
    return value;
  }
  function validateDraft(input) {
    const draft = object(input, '物件库条目');
    fields(draft, ['schemaVersion', 'name', 'description', 'tags', 'listed', 'kind', 'template'], '物件库条目');
    if (draft.schemaVersion !== 1) throw new LibraryError(400, '不支持此物件库 schemaVersion。');
    if (!KINDS.includes(draft.kind)) throw new LibraryError(400, '物件库类型不受支持。');
    if (!Array.isArray(draft.tags) || draft.tags.length > 24) throw new LibraryError(400, '最多设置 24 个标签。');
    const tags = draft.tags.map((tag) => text(tag, '标签', 48, true));
    if (new Set(tags).size !== tags.length) throw new LibraryError(400, '库模板标签不能重复。');
    const raw = object(draft.template, '物件模板');
    fields(raw, ['color', 'scale', 'rotation', 'sides', 'value', 'texture', 'backTexture', 'metadata', 'cards', 'diceFaces'], '物件模板');
    if (typeof raw.color !== 'string' || !/^#[a-f0-9]{6}$/i.test(raw.color)) throw new LibraryError(400, '模板颜色需为六位十六进制色值。');
    const sides = number(raw.sides, '骰子面数', draft.kind === 'dice' ? 1 : 0, 1000, true);
    if (draft.kind === 'dice' && ![4, 6, 8, 10, 12, 20].includes(sides)) throw new LibraryError(400, '物理骰子仅支持 d4、d6、d8、d10、d12、d20。');
    const refs = new Set();
    const rawMetadata = object(raw.metadata, '模板属性');
    if (Object.keys(rawMetadata).length > 62) throw new LibraryError(400, '模板最多有 62 项属性，需预留两项库来源属性。');
    const metadata = {};
    for (const [key, value] of Object.entries(rawMetadata)) {
      text(key, '属性名称', 64, true);
      if (['__proto__', 'constructor', 'prototype'].includes(key) || RUNTIME_KEYS.test(key)) throw new LibraryError(400, '模板不能包含实例归属、投掷状态或不安全属性。');
      metadata[key] = typeof value === 'string' ? text(value, '属性内容', 4000) : typeof value === 'boolean' ? value : number(value, '属性数值', -1000000000, 1000000000);
    }
    try { validateMovementMetadata(metadata); } catch (error) { throw new LibraryError(400, error.message); }
    const template = {
      color: raw.color, scale: vector(raw.scale, '模板缩放', 0.1, 8), rotation: vector(raw.rotation, '模板旋转', -100, 100),
      sides, value: number(raw.value, '模板数值', draft.kind === 'dice' ? 0 : -1000000000, draft.kind === 'dice' ? sides : 1000000000, true),
      texture: resourceReference(raw.texture, '模板图片', refs), backTexture: resourceReference(raw.backTexture, '模板背面', refs), metadata,
    };
    if (draft.kind === 'dice' && !template.scale.every((value) => value === template.scale[0])) throw new LibraryError(400, '骰子模板需等比缩放，不能改变骰面物理比例。');
    if (raw.diceFaces !== undefined) {
      if (draft.kind !== 'dice') throw new LibraryError(400, '只有骰子可以定义骰面。');
      try { template.diceFaces = validateDiceFaces(raw.diceFaces, sides); } catch (error) { throw new LibraryError(400, error.message); }
    }
    if (draft.kind === 'deck') {
      if (!Array.isArray(raw.cards) || raw.cards.length > 512) throw new LibraryError(400, '牌堆需包含最多 512 张牌的列表。');
      template.cards = raw.cards.map((value) => {
        const card = object(value, '卡牌模板');
        fields(card, ['name', 'texture', 'backTexture', 'description'], '卡牌模板');
        return { name: text(card.name, '卡牌名称', 120, true), texture: resourceReference(card.texture, '卡面', refs), backTexture: resourceReference(card.backTexture, '卡背', refs), description: text(card.description, '卡牌说明', 6000) };
      });
    } else if (raw.cards !== undefined) throw new LibraryError(400, '只有牌堆模板可以包含 cards。');
    return { draft: { schemaVersion: 1, name: text(draft.name, '物件名称', 120, true), description: text(draft.description, '物件说明', 6000), tags, listed: bool(draft.listed, '上架状态'), kind: draft.kind, template }, refs };
  }
  function insertRevision(id, revision, draft, refs, now) {
    const entry = { ...draft, id, revision };
    db.prepare('INSERT INTO library_revisions (entry_id, revision, body, created_at) VALUES (?, ?, ?, ?)').run(id, revision, JSON.stringify(entry), now);
    const reference = db.prepare('INSERT INTO library_resource_refs (entry_id, revision, sha256) VALUES (?, ?, ?)');
    for (const hash of refs) reference.run(id, revision, hash);
    return entry;
  }
  function createEntry(input) {
    const { draft, refs } = validateDraft(input);
    return transaction(() => {
      const id = randomUUID(); const now = Date.now();
      db.prepare('INSERT INTO library_entries (id, current_revision, created_at, updated_at) VALUES (?, 1, ?, ?)').run(id, now, now);
      return insertRevision(id, 1, draft, refs, now);
    });
  }
  for (const [seedPath, flag, expected] of [[builtinPath, 'builtins_seeded_v1', 12], [expansionPath, 'play_kit_seeded_v1', 48], [dicePath, 'dice_kit_seeded_v1', 4]]) if (seedPath && !db.prepare('SELECT value FROM metadata WHERE key = ?').get(flag)) {
    try {
      const builtinDrafts = JSON.parse(readFileSync(seedPath, 'utf8'));
      if (!Array.isArray(builtinDrafts) || builtinDrafts.length !== expected) throw new Error(`内置物件库定义需包含 ${expected} 项。`);
      const validated = builtinDrafts.map(validateDraft);
      transaction(() => {
        for (const { draft, refs } of validated) {
          const id = randomUUID(); const now = Date.now();
          db.prepare('INSERT INTO library_entries (id, current_revision, created_at, updated_at) VALUES (?, 1, ?, ?)').run(id, now, now);
          insertRevision(id, 1, draft, refs, now);
        }
        db.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)').run(flag, '1');
      });
    } catch (error) { db.close(); throw error; }
  }
  return {
    listEntries() {
      return db.prepare('SELECT r.body FROM library_entries e JOIN library_revisions r ON r.entry_id = e.id AND r.revision = e.current_revision WHERE e.deleted = 0 ORDER BY e.created_at, e.id').all().map((row) => JSON.parse(row.body));
    },
    createEntry,
    getEntry(id, revision) {
      safeId(id);
      let row;
      if (revision !== undefined) {
        number(revision, '物件版本', 1, Number.MAX_SAFE_INTEGER, true);
        row = db.prepare('SELECT body FROM library_revisions WHERE entry_id = ? AND revision = ?').get(id, revision);
      } else row = db.prepare('SELECT r.body FROM library_entries e JOIN library_revisions r ON r.entry_id = e.id AND r.revision = e.current_revision WHERE e.id = ? AND e.deleted = 0').get(id);
      if (!row) throw new LibraryError(404, '物件库条目或指定版本不存在。');
      return JSON.parse(row.body);
    },
    updateEntry(id, input, expectedRevision) {
      safeId(id); const { draft, refs } = validateDraft(input);
      return transaction(() => {
        const current = db.prepare('SELECT current_revision FROM library_entries WHERE id = ? AND deleted = 0').get(id);
        if (!current) throw new LibraryError(404, '物件库条目不存在。');
        if (expectedRevision !== undefined && number(expectedRevision, '预期版本', 1, Number.MAX_SAFE_INTEGER, true) !== current.current_revision) throw new LibraryError(409, '物件库条目已经更新，请刷新后重试。');
        const revision = current.current_revision + 1; const now = Date.now();
        db.prepare('UPDATE library_entries SET current_revision = ?, updated_at = ? WHERE id = ?').run(revision, now, id);
        return insertRevision(id, revision, draft, refs, now);
      });
    },
    deleteEntry(id) {
      safeId(id);
      const deleted = db.prepare('UPDATE library_entries SET deleted = 1, updated_at = ? WHERE id = ? AND deleted = 0').run(Date.now(), id);
      if (!deleted.changes) throw new LibraryError(404, '物件库条目不存在。');
    },
    async uploadResource(bytes, declaredMime) {
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > RESOURCE_LIMIT) throw new LibraryError(413, '图片需为非空文件，且不能超过 2 MB。');
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(declaredMime)) throw new LibraryError(415, '目前仅支持 PNG、JPEG、WebP 图片。');
      const mime = imageMime(bytes);
      if (mime !== declaredMime) throw new LibraryError(400, '图片文件签名与 Content-Type 不一致。');
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (uploads.has(sha256)) return uploads.get(sha256);
      const pending = (async () => {
        const destination = resourcePath(sha256); const directory = path.dirname(destination);
        mkdirSync(directory, { recursive: true });
        if (!isWithin(resourceRoot, realpathSync(directory))) throw new LibraryError(400, '资源目录路径不安全。');
        const existing = db.prepare('SELECT sha256 FROM resources WHERE sha256 = ?').get(sha256);
        let intact = false;
        if (existing) {
          try {
            const stored = await readFile(assertResourceFile(sha256));
            intact = stored.length === bytes.length && createHash('sha256').update(stored).digest('hex') === sha256;
          } catch (error) { if (!(error instanceof LibraryError && error.status === 404) && error.code !== 'ENOENT') throw error; }
        }
        if (!intact) {
          const temporary = path.join(directory, `.${sha256}-${randomUUID()}.tmp`);
          try {
            await writeFile(temporary, bytes, { flag: 'wx' });
            await rename(temporary, destination);
            db.prepare('INSERT INTO resources (sha256, mime, byte_length, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(sha256) DO UPDATE SET mime = excluded.mime, byte_length = excluded.byte_length').run(sha256, mime, bytes.length, Date.now());
          } finally { await unlink(temporary).catch(() => {}); }
        }
        return { sha256, mime, byteLength: bytes.length, url: `/api/resources/${sha256}` };
      })();
      uploads.set(sha256, pending);
      try { return await pending; }
      finally { uploads.delete(sha256); }
    },
    async readResource(hash) {
      if (!HASH.test(hash)) throw new LibraryError(400, '资源哈希格式有误。');
      const resource = db.prepare('SELECT mime, byte_length FROM resources WHERE sha256 = ?').get(hash);
      if (!resource) throw new LibraryError(404, '图片资源不存在。');
      const bytes = await readFile(assertResourceFile(hash));
      if (bytes.length !== resource.byte_length || createHash('sha256').update(bytes).digest('hex') !== hash) throw new LibraryError(500, '图片资源校验失败，请从原文件恢复。');
      return { bytes, mime: resource.mime };
    },
    close() { db.close(); },
  };
}
