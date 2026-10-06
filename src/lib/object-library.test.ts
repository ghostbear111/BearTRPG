import { describe, expect, it, vi } from 'vitest'
import { createObject, createTableSession, validateTableSession, type ObjectKind } from './tabletop'
import {
  createLibraryDraft, deleteLibraryEntry, exportPortableSession, fetchLibraryEntry, importPortableSession,
  instantiateLibraryDraft, instantiateLibraryEntry, listLibraryEntries, prepareLibraryDraft, saveLibraryEntry,
  templateFromObject, uploadLibraryResource, validateLibraryDraft, validateLibraryEntry, type LibraryEntry,
} from './object-library'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfaUAAAAASUVORK5CYII='
const HASH = 'a'.repeat(64)
const URL = `/api/resources/${HASH}`
function entry(kind: ObjectKind = 'figurine', revision = 3): LibraryEntry {
  return { ...createLibraryDraft(kind), id: 'library-test', revision }
}
function pngBlob(): Blob {
  return new Blob([Uint8Array.from(atob(PNG.split(',')[1]), char => char.charCodeAt(0))], { type: 'image/png' })
}
function resourceResponse(): Response {
  return Response.json({ sha256: HASH, url: URL, mime: 'image/png', byteLength: pngBlob().size })
}

describe('library templates and independently placed instances', () => {
  it.each(['token', 'figurine', 'dice', 'card', 'deck', 'board', 'block'] as ObjectKind[])('round-trips a %s draft and saved entry', kind => {
    const draft = createLibraryDraft(kind)
    expect(validateLibraryDraft(JSON.parse(JSON.stringify(draft)))).toEqual(draft)
    expect(validateLibraryEntry(entry(kind))).toEqual(entry(kind))
    expect(draft.template).not.toHaveProperty('id')
    expect(draft.template).not.toHaveProperty('kind')
    expect(draft.template).not.toHaveProperty('name')
    expect(draft.template).not.toHaveProperty('position')
  })

  it('extracts appearance without character, ownership, hand or dice runtime state', () => {
    const object = createObject('figurine', {
      locked: true, faceDown: true, position: [12, 2, 9],
      metadata: { width: 2, team: '蓝方', owner: 'player-a', ownerId: 'player-a', characterId: 'hero-a', characterRef: 'hero-a', characterBinding: 'hero-a', characterRecord: 'hero-a', characterSheetId: 'sheet-a', hp: 3, maxHp: 20, initiative: 17, handZone: 'private', zone: 'private', sourceDeckId: 'deck-a', rollRequest: 'request-a', velocity: 10, libraryId: 'previous', libraryRevision: 5, guideState: '{"phase":"rolling"}', adventureDie: true },
    })
    const draft = templateFromObject(object)
    expect(draft.template.metadata).toEqual({ width: 2, team: '蓝方' })
    expect(draft.template).not.toHaveProperty('locked')
    expect(draft.template).not.toHaveProperty('faceDown')
    const placed = instantiateLibraryEntry({ ...draft, id: 'figure-blue', revision: 2 })
    expect(placed.id).not.toBe(object.id)
    expect(placed.position).toEqual([0, 0.7, 0])
    expect(placed.locked).toBe(false)
    expect(placed.faceDown).toBe(false)
    expect(placed.metadata).toEqual({ width: 2, team: '蓝方', libraryId: 'figure-blue', libraryRevision: 2 })
  })

  it('pins the source revision, allocates fresh card identities and deeply separates instances', () => {
    const source = entry('deck', 7)
    const first = instantiateLibraryEntry(source)
    const second = instantiateLibraryEntry(source, { id: 'forced-id', position: [3, 0.18, 4] })
    expect(first.id).not.toBe(second.id)
    expect(second.id).not.toBe('forced-id')
    expect(first.metadata.libraryRevision).toBe(7)
    source.revision = 8
    expect(first.metadata.libraryRevision).toBe(7)
    expect(first.cards?.every(card => !second.cards?.some(other => card.id === other.id))).toBe(true)
    expect(first.cards?.map(card => card.name)).toEqual(source.template.cards?.map(card => card.name))
    first.cards![0].name = 'changed'
    first.scale[0] = 2
    expect(second.cards![0].name).toBe('事件 01')
    expect(source.template.scale).toEqual([1, 1, 1])
    const session = createTableSession('sandbox')
    session.objects = [second]
    expect(validateTableSession(session).objects[0].metadata.libraryRevision).toBe(7)
  })

  it.each([4, 6, 8, 10, 12, 20])('supports a uniformly scaled physical d%s with a fresh unsettled result', sides => {
    const source = entry('dice')
    source.template = { ...source.template, sides, scale: [1.4, 1.4, 1.4], color: '#12abef', value: sides }
    const placed = instantiateLibraryEntry(source, { value: sides })
    expect(placed.value).toBe(0)
    expect(placed.sides).toBe(sides)
    expect(placed.scale).toEqual([1.4, 1.4, 1.4])
    expect(placed.color).toBe('#12abef')
    expect(templateFromObject(placed).template.value).toBe(0)
  })

  it('rejects unsupported or distorted library dice while allowing arbitrary token proportions', () => {
    const source = entry('dice')
    expect(() => validateLibraryEntry({ ...source, template: { ...source.template, sides: 100 } })).toThrow('仅支持')
    expect(() => validateLibraryEntry({ ...source, template: { ...source.template, scale: [1, 2, 1] } })).toThrow('三轴缩放')
    expect(() => instantiateLibraryEntry(source, { sides: 100 })).toThrow('仅支持')
    expect(() => instantiateLibraryEntry(source, { scale: [1, 2, 1] })).toThrow('三轴缩放')
    const token = entry('token')
    token.template.scale = [2, 0.5, 3]
    expect(instantiateLibraryEntry(token).scale).toEqual([2, 0.5, 3])
  })

  it('accepts durable hash paths and rejects transient or malformed saved resources', () => {
    const source = entry('card')
    source.template.texture = URL
    expect(validateLibraryEntry(source).template.texture).toBe(URL)
    for (const texture of [PNG, 'https://example.com/card.png', `${URL}?download=1`, `${URL}/extra`, `/api/resources/${'A'.repeat(64)}`, '/api/resources/../private']) {
      expect(() => validateLibraryEntry({ ...source, template: { ...source.template, texture } })).toThrow()
    }
    const temporary = templateFromObject(createObject('card', { texture: PNG }))
    expect(instantiateLibraryDraft(temporary).texture).toBe(PNG)
    expect(() => validateLibraryDraft(temporary)).toThrow('先上传')
  })

  it('rejects invalid schema, revision, tags, instance fields and runtime metadata', () => {
    const source = entry('deck')
    expect(() => validateLibraryEntry({ ...source, schemaVersion: 2 })).toThrow('版本')
    for (const revision of [0, -1, 1.2, Number.POSITIVE_INFINITY]) expect(() => validateLibraryEntry({ ...source, revision })).toThrow('正整数')
    expect(() => validateLibraryEntry({ ...source, tags: ['a', 'a'] })).toThrow('重复')
    expect(() => validateLibraryEntry({ ...source, tags: Array(25).fill('a') })).toThrow('24')
    expect(() => validateLibraryEntry({ ...source, tags: ['tag', ' tag '] })).toThrow('重复')
    expect(() => validateLibraryEntry({ ...source, name: 'invalid\0name' })).toThrow('非空文本')
    expect(() => validateLibraryEntry({ ...source, template: { ...source.template, position: [0, 1, 0] } })).toThrow('实例字段')
    expect(() => validateLibraryEntry({ ...source, template: { ...source.template, metadata: { characterId: 'bound' } } })).toThrow('角色绑定')
    expect(() => validateLibraryEntry({ ...source, template: { ...source.template, metadata: { guideState: '{"phase":"turn"}' } } })).toThrow('运行状态')
    expect(() => validateLibraryEntry({ ...source, template: { ...source.template, metadata: { note: 'invalid\0value' } } })).toThrow('属性内容')
    expect(() => validateLibraryEntry({ ...source, template: { ...source.template, cards: [{ ...source.template.cards![0], id: 'runtime-card' }] } })).toThrow('实例 ID')
    const { cards: _cards, ...configuration } = source.template
    expect(() => validateLibraryEntry({ ...source, template: configuration })).toThrow('cards 列表')
    expect(() => validateLibraryEntry({ ...source, template: { ...source.template, metadata: Object.fromEntries(Array.from({ length: 63 }, (_, i) => [`property-${i}`, i])) } })).toThrow('62')
  })

  it('supports a full metadata template with reserved provenance slots', () => {
    const source = entry()
    source.template.metadata = Object.fromEntries(Array.from({ length: 62 }, (_, i) => [`property-${i}`, i]))
    const placed = instantiateLibraryEntry(source)
    expect(Object.keys(placed.metadata)).toHaveLength(64)
    expect(placed.metadata.libraryId).toBe(source.id)
    expect(placed.metadata.libraryRevision).toBe(source.revision)
  })
})

describe('local library API contract', () => {
  it('lists unlisted records for management and fetches the exact requested revision', async () => {
    const hidden = { ...entry(), listed: false }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ entries: [hidden] })).mockResolvedValueOnce(Response.json(hidden))
    expect(await listLibraryEntries({ fetcher })).toEqual([hidden])
    expect(await fetchLibraryEntry(hidden.id, hidden.revision, { fetcher })).toEqual(hidden)
    expect(fetcher.mock.calls[1][0]).toBe('/api/library/library-test?revision=3')
    fetcher.mockResolvedValueOnce(Response.json({ ...hidden, revision: 4 }))
    await expect(fetchLibraryEntry(hidden.id, 3, { fetcher })).rejects.toThrow('固定版本')
  })

  it('creates and updates entries with optimistic revision checks and supports deletion', async () => {
    const draft = createLibraryDraft('token')
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ ...draft, id: 'new-entry', revision: 1 }))
      .mockResolvedValueOnce(Response.json({ ...draft, id: 'new-entry', revision: 2 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    expect((await saveLibraryEntry(draft, undefined, undefined, { fetcher })).revision).toBe(1)
    expect((await saveLibraryEntry(draft, 'new-entry', 1, { fetcher })).revision).toBe(2)
    expect(fetcher.mock.calls[0][1]?.method).toBe('POST')
    expect(fetcher.mock.calls[1][1]?.method).toBe('PUT')
    expect(JSON.parse(fetcher.mock.calls[1][1]?.body as string).expectedRevision).toBe(1)
    await deleteLibraryEntry('new-entry', { fetcher })
    expect(fetcher.mock.calls[2][1]?.method).toBe('DELETE')
    fetcher.mockResolvedValueOnce(Response.json({ error: '版本冲突，请重新读取。' }, { status: 409 }))
    await expect(saveLibraryEntry(draft, 'new-entry', 1, { fetcher })).rejects.toThrow('版本冲突')
  })

  it('uploads verified image bytes and validates the server resource response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(resourceResponse())
    expect(await uploadLibraryResource(pngBlob(), { fetcher })).toEqual({ sha256: HASH, url: URL, mime: 'image/png', byteLength: pngBlob().size })
    expect(fetcher.mock.calls[0][0]).toBe('/api/resources')
    expect(fetcher.mock.calls[0][1]?.body).toBeInstanceOf(Blob)
    expect(fetcher.mock.calls[0][1]?.headers).toEqual({ 'Content-Type': 'image/png' })
    await expect(uploadLibraryResource(new Blob(['<script>'], { type: 'image/png' }), { fetcher })).rejects.toThrow('不是与类型一致')
    expect(fetcher).toHaveBeenCalledTimes(1)
    fetcher.mockResolvedValueOnce(Response.json({ sha256: HASH, url: 'https://evil.example/image', mime: 'image/png', byteLength: 8 }))
    await expect(uploadLibraryResource(pngBlob(), { fetcher })).rejects.toThrow('资源响应')
  })

  it('uploads duplicate inline images once before sending a durable template', async () => {
    const draft = templateFromObject(createObject('deck', { texture: PNG, backTexture: PNG, cards: [{ id: 'a', name: 'A', description: '', texture: PNG, backTexture: PNG }] }))
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(resourceResponse())
    const prepared = await prepareLibraryDraft(draft, { fetcher })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(prepared.template.texture).toBe(URL)
    expect(prepared.template.cards![0].backTexture).toBe(URL)
    expect(draft.template.texture).toBe(PNG)
    expect(validateLibraryDraft(prepared)).toEqual(prepared)
  })

  it('deduplicates equal image bytes even when their transient URL headers differ', async () => {
    const draft = templateFromObject(createObject('card', { texture: PNG, backTexture: PNG.replace('image/png', 'IMAGE/PNG') }))
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(resourceResponse())
    const prepared = await prepareLibraryDraft(draft, { fetcher })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(prepared.template.texture).toBe(prepared.template.backTexture)
  })
})

describe('portable V1 image archives', () => {
  it('embeds each unique local resource once, including deck faces and backs, without mutating the table', async () => {
    const session = createTableSession('sandbox')
    session.objects = [createObject('card', { texture: URL }), createObject('deck', { texture: URL, cards: [{ id: 'top', name: 'A', description: '', texture: URL, backTexture: URL }] })]
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(pngBlob(), { headers: { 'Content-Type': 'image/png' } }))
    const portable = await exportPortableSession(session, { fetcher })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(portable.objects[0].texture).toBe(PNG)
    expect(portable.objects[1].cards![0].backTexture).toBe(PNG)
    expect(session.objects[0].texture).toBe(URL)
    expect(JSON.stringify(portable)).not.toContain('/api/resources/')
  })

  it('imports portable or old inline V1 saves with one upload per unique image and conserved identities', async () => {
    const session = createTableSession('sandbox')
    session.objects = [createObject('card', { texture: PNG, backTexture: PNG }), createObject('deck', { cards: [{ id: 'top', name: 'A', description: '', texture: PNG, backTexture: PNG }] })]
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(resourceResponse())
    const imported = await importPortableSession(JSON.stringify(session), { fetcher })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(imported.objects.map(object => object.id)).toEqual(session.objects.map(object => object.id))
    expect(imported.objects[1].cards![0].id).toBe('top')
    expect(imported.objects[1].cards![0].texture).toBe(URL)
    expect(session.objects[0].texture).toBe(PNG)
    expect(validateTableSession(imported)).toEqual(imported)
  })

  it('aborts on missing local resources or inaccessible external legacy images', async () => {
    const session = createTableSession('sandbox')
    session.objects = [createObject('card', { texture: URL })]
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }))
    await expect(exportPortableSession(session, { fetcher })).rejects.toThrow('无法读取图片资源')
    await expect(importPortableSession(session, { fetcher })).rejects.toThrow('无法读取图片资源')
    const draft = templateFromObject(createObject('card', { texture: 'https://example.com/card.png' }))
    fetcher.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(prepareLibraryDraft(draft, { fetcher })).rejects.toThrow('允许跨域读取')
    expect(session.objects[0].texture).toBe(URL)
  })

  it('stops fetching a large resource archive as soon as the portable budget is exceeded', async () => {
    const session = createTableSession('sandbox')
    session.objects = Array.from({ length: 30 }, (_, i) => createObject('card', { texture: `/api/resources/${i.toString(16).padStart(64, '0')}` }))
    const largePng = new Blob([Uint8Array.from('\x89PNG\r\n\x1a\n' + '\0'.repeat(1_350_000), char => char.charCodeAt(0))], { type: 'image/png' })
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(largePng))
    await expect(exportPortableSession(session, { fetcher })).rejects.toThrow('10 MB')
    expect(fetcher).toHaveBeenCalledTimes(6)
    expect(session.objects[0].texture).toMatch(/^\/api\/resources\//)
  })

  it('leaves texture-free saves usable without any network calls and rejects corrupt JSON', async () => {
    const session = createTableSession('rpg')
    const fetcher = vi.fn<typeof fetch>()
    expect(await exportPortableSession(session, { fetcher })).toEqual(session)
    expect(await importPortableSession(session, { fetcher })).toEqual(session)
    expect(fetcher).not.toHaveBeenCalled()
    await expect(importPortableSession('{bad', { fetcher })).rejects.toThrow('有效的 JSON')
    await expect(importPortableSession({ ...session, version: 2 }, { fetcher })).rejects.toThrow('版本')
  })
})
