import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { validateAdventureDefinition, adventureId, auditAdventure } from '../src/lib/adventure-schema.ts';

export class AdventureError extends Error { constructor(status, message) { super(message); this.status = status; } }
export function adventureResourceSources(definition) {
  const objects = [...definition.scenes.flatMap(s => s.objects), ...definition.characters.flatMap(c => c.appearance ? [c.appearance] : []), ...[...Object.values(definition.rpg?.roles ?? {}), ...Object.values(definition.rpg?.enemies ?? {})].flatMap(r => r.tabletopAppearance ? [r.tabletopAppearance] : [])];
  return [...new Set([...objects.flatMap(o => [o.texture, o.backTexture, ...(o.cards ?? []).flatMap(c => [c.texture, c.backTexture])]), ...(definition.tavern?.effects.map(e => e.url) ?? []), ...(definition.tavern?.archive.cards.map(c => c.portrait) ?? [])].filter(Boolean))];
}
export function createAdventureStore(directory) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, 'adventures.sqlite'), { timeout: 5000 });
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS adventures (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS adventure_revisions (id TEXT NOT NULL REFERENCES adventures(id), revision INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(id, revision)) STRICT;
    CREATE TABLE IF NOT EXISTS adventure_imports (hash TEXT PRIMARY KEY, id TEXT NOT NULL REFERENCES adventures(id)) STRICT;`);
  const checked = value => { try { return validateAdventureDefinition(value); } catch (e) { throw new AdventureError(400, e.message); } };
  const safeId = id => { try { return adventureId(id); } catch (e) { throw new AdventureError(400, e.message); } };
  function get(id, revision) {
    safeId(id);
    const entry = db.prepare('SELECT revision FROM adventures WHERE id=?').get(id);
    if (!entry) throw new AdventureError(404, '战役作品不存在。');
    if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 1)) throw new AdventureError(400, '作品版本无效。');
    const row = db.prepare('SELECT body FROM adventure_revisions WHERE id=? AND revision=?').get(id, revision ?? entry.revision);
    if (!row) throw new AdventureError(404, '作品版本不存在。');
    return checked(JSON.parse(row.body));
  }
  function writeRevision(saved, expectedRevision) {
    const { id, revision } = saved;
    if (revision === 1) db.prepare('INSERT INTO adventures VALUES(?,?,?)').run(id, revision, Date.now());
    else { const updated = db.prepare('UPDATE adventures SET revision=?,updated_at=? WHERE id=? AND revision=?').run(revision, Date.now(), id, expectedRevision); if (!updated.changes) throw new AdventureError(409, '作品版本冲突，当前草稿仍保留。'); }
    db.prepare('INSERT INTO adventure_revisions VALUES(?,?,?)').run(id, revision, JSON.stringify(saved));
  }
  function save(value, id, expectedRevision) {
    const definition = checked(value); let revision = 1;
    if (id !== undefined) {
      safeId(id); const row = db.prepare('SELECT revision FROM adventures WHERE id=?').get(id);
      if (!row) throw new AdventureError(404, '战役作品不存在。');
      if (definition.id !== id || !Number.isSafeInteger(expectedRevision) || row.revision !== expectedRevision || definition.revision !== expectedRevision) throw new AdventureError(409, '作品已被更新，请重新打开最新版本再编辑；当前草稿仍保留。');
      revision = row.revision + 1;
    } else { id = randomUUID(); }
    const saved = checked({ ...definition, id, revision });
    db.exec('BEGIN IMMEDIATE');
    try {
      writeRevision(saved, expectedRevision); db.exec('COMMIT');
      return saved;
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  function importGame(value) {
    const definition = checked(value);
    const errors = auditAdventure(definition).errors;
    if (errors.length) throw new AdventureError(400, `游戏模组尚不可游玩：${errors[0]}`);
    // Identity/version belong to the local work. Hash the validated authored content instead.
    const { id, revision, ...content } = definition;
    const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
    const hash = createHash('sha256').update(JSON.stringify(canonical(content))).digest('hex');
    db.exec('BEGIN IMMEDIATE');
    try {
      const existing = db.prepare('SELECT id FROM adventure_imports WHERE hash=?').get(hash);
      if (existing) { const current = get(existing.id); db.exec('COMMIT'); return { definition: current, created: false }; }
      const saved = checked({ ...definition, id: randomUUID(), revision: 1 });
      writeRevision(saved); db.prepare('INSERT INTO adventure_imports VALUES(?,?)').run(hash, saved.id); db.exec('COMMIT');
      return { definition: saved, created: true };
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  return {
    get, save, importGame, close: () => db.close(),
    list: () => db.prepare('SELECT r.body,a.updated_at,EXISTS(SELECT 1 FROM adventure_imports i WHERE i.id=a.id) AS imported FROM adventures a JOIN adventure_revisions r ON r.id=a.id AND r.revision=a.revision ORDER BY a.updated_at DESC LIMIT 200').all().map(row => { const d = JSON.parse(row.body); return { id: d.id, revision: d.revision, title: d.title, summary: d.summary.slice(0, 256), scenes: d.scenes.length, chapters: d.chapters.length, updatedAt: row.updated_at, imported: Boolean(row.imported) }; }),
  };
}
