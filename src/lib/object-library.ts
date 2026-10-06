import { validateAdventureDefinition, type AdventureDefinition } from './adventure-schema'
import type { DiceFace } from './dice'
import {
  createObject, isLocalResourceUrl, MAX_ASSET_LENGTH, MAX_DECK_CARDS, MAX_TABLE_BYTES, SUPPORTED_DICE_SIDES,
  validateAssetSource, validateTableObject, validateTableSession,
  type CardData, type ObjectKind, type TableObject, type TableSession, type Vec3,
} from './tabletop'

export type LibraryCardTemplate = Omit<CardData, 'id'>
export interface LibraryTemplate {
  color: string
  rotation: Vec3
  scale: Vec3
  sides: number
  value: number
  texture: string
  backTexture: string
  metadata: TableObject['metadata']
  cards?: LibraryCardTemplate[]
  diceFaces?: DiceFace[]
}
export interface LibraryDraft {
  schemaVersion: 1
  name: string
  description: string
  tags: string[]
  listed: boolean
  kind: ObjectKind
  template: LibraryTemplate
}
export interface LibraryEntry extends LibraryDraft { id: string; revision: number }
export interface LibraryResource { sha256: string; url: string; mime: string; byteLength: number }
export interface LibraryClientOptions { signal?: AbortSignal; fetcher?: typeof fetch }

const TEMPLATE_FIELDS = new Set(['color', 'rotation', 'scale', 'sides', 'value', 'texture', 'backTexture', 'metadata', 'cards', 'diceFaces'])
const RUNTIME_KEYS = /^(?:id|position|owner.*|playerId|tavernCharacterId|character.*|rpg.*|sourceDeckId|sourceContainerId|adventureObjectId|opened|lit|activated|emptied|taken|equipped|focus|guarded|poisoned|libraryId|libraryRevision|guideState|relicGuideEvent|relicGuideDiscard|adventureDie|zone|selected|hand.*|roll.*|velocity|angularVelocity|sleeping|hp|currentHp|maxHp|ac|initiative)$/i

function plain(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}必须是数据对象。`)
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) throw new Error(`${label}格式不受支持。`)
  return value as Record<string, unknown>
}
function text(value: unknown, label: string, max: number, nonEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (nonEmpty && !value.trim()) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw new Error(`${label}需为${nonEmpty ? '非空' : ''}文本，最多 ${max} 个字符。`)
  return nonEmpty ? value.trim() : value
}
function identifier(value: unknown): string {
  const result = text(value, '库条目 ID', 120, true)
  if (!/^[a-zA-Z0-9_-]+$/.test(result) || ['__proto__', 'constructor', 'prototype'].includes(result)) throw new Error('库条目 ID 格式不安全。')
  return result
}
function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('库版本必须是正整数。')
  return value
}
function cleanMetadata(metadata: TableObject['metadata']): TableObject['metadata'] {
  return Object.fromEntries(Object.entries(metadata).filter(([key]) => !RUNTIME_KEYS.test(key)))
}
function assertLibraryDice(object: TableObject): void {
  if (object.kind !== 'dice') return
  if (!(SUPPORTED_DICE_SIDES as readonly number[]).includes(object.sides)) throw new Error('库骰子仅支持 d4、d6、d8、d10、d12、d20。')
  if (object.scale[0] !== object.scale[1] || object.scale[1] !== object.scale[2]) throw new Error('库骰子的三轴缩放必须相同，以保持骰子几何。')
}
function libraryAsset(value: unknown, allowTransient: boolean): string {
  const source = validateAssetSource(value)
  if (!allowTransient && source && !isLocalResourceUrl(source)) throw new Error('物件库图片必须先上传为本机哈希资源。')
  return source
}

function validateDraft(value: unknown, allowTransientAssets: boolean): LibraryDraft {
  const source = plain(value, '库模板')
  if (source.schemaVersion !== 1) throw new Error('不支持此物件库格式版本。')
  if (typeof source.listed !== 'boolean') throw new Error('上架状态需为布尔值。')
  if (!Array.isArray(source.tags) || source.tags.length > 24) throw new Error('最多可设置 24 个标签。')
  const tags = source.tags.map(tag => text(tag, '标签', 48, true))
  if (new Set(tags).size !== tags.length) throw new Error('库模板标签不能重复。')
  const template = plain(source.template, '物件配置')
  for (const key of Object.keys(template)) if (!TEMPLATE_FIELDS.has(key)) throw new Error(`物件配置不能包含实例字段「${key}」。`)
  const metadata = plain(template.metadata, '物件属性') as TableObject['metadata']
  if (Object.keys(metadata).length > 62) throw new Error('库模板最多有 62 项属性，为实例预留 2 项库来源属性。')
  if (Object.keys(metadata).some(key => RUNTIME_KEYS.test(key))) throw new Error('库模板不能包含角色绑定、所有权、手牌或投骰运行状态。')
  for (const [key, value] of Object.entries(metadata)) {
    text(key, '属性名称', 64, true)
    if (typeof value === 'string') text(value, '属性内容', 4000)
  }
  let cards: CardData[] | undefined
  if (source.kind === 'deck' && template.cards === undefined) throw new Error('牌堆模板必须包含明确的 cards 列表。')
  if (template.cards !== undefined) {
    if (!Array.isArray(template.cards) || template.cards.length > MAX_DECK_CARDS) throw new Error(`牌堆最多可保存 ${MAX_DECK_CARDS} 张卡牌。`)
    cards = template.cards.map((value, index) => {
      const card = plain(value, '卡牌模板')
      if (Object.keys(card).some(key => !['name', 'description', 'texture', 'backTexture'].includes(key))) throw new Error('卡牌模板不能包含实例 ID 或运行状态。')
      return {
        id: `template-card-${index}`, name: text(card.name, '卡牌名称', 120, true), description: text(card.description, '卡牌说明', 6000),
        texture: libraryAsset(card.texture, allowTransientAssets), backTexture: libraryAsset(card.backTexture, allowTransientAssets),
      }
    })
  }
  // Reuse the same transform, colour, metadata and physical dice constraints as the table.
  const object = createObject(source.kind as ObjectKind, {
    name: text(source.name, '库名称', 120, true), description: text(source.description, '库说明', 6000),
    color: template.color as string, scale: template.scale as Vec3, rotation: template.rotation as Vec3,
    sides: template.sides as number, value: template.value as number,
    texture: libraryAsset(template.texture, allowTransientAssets), backTexture: libraryAsset(template.backTexture, allowTransientAssets),
    metadata, ...(cards === undefined ? {} : { cards }), ...(template.diceFaces === undefined ? {} : { diceFaces: template.diceFaces as DiceFace[] }),
  })
  assertLibraryDice(object)
  const result: LibraryDraft = {
    schemaVersion: 1, kind: object.kind, name: object.name, description: object.description, tags: [...tags], listed: source.listed,
    template: {
      color: object.color, rotation: [...object.rotation], scale: [...object.scale], sides: object.sides, value: object.value,
      texture: object.texture, backTexture: object.backTexture, metadata: { ...object.metadata },
      ...(object.diceFaces ? { diceFaces: structuredClone(object.diceFaces) } : {}),
      ...(object.cards ? { cards: object.cards.map(({ id: _id, ...card }) => card) } : {}),
    },
  }
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_TABLE_BYTES) throw new Error('物件模板超过 10 MB。')
  return result
}

/** Strict saved format: all images refer to durable resources on the local host. */
export function validateLibraryDraft(value: unknown): LibraryDraft { return validateDraft(value, false) }
export function validateLibraryEntry(value: unknown): LibraryEntry {
  const source = plain(value, '库条目')
  return { ...validateLibraryDraft(source), id: identifier(source.id), revision: revision(source.revision) }
}

/** A draft can temporarily hold legacy images; saveLibraryEntry uploads them before saving. */
export function templateFromObject(value: TableObject): LibraryDraft {
  const object = validateTableObject(value)
  return validateDraft({
    schemaVersion: 1, name: object.name, description: object.description, tags: [], listed: true, kind: object.kind,
    template: {
      color: object.color, scale: [...object.scale], rotation: [...object.rotation], sides: object.sides,
      value: object.kind === 'dice' ? 0 : object.kind === 'deck' ? (object.cards?.length ?? 0) : object.value,
      texture: object.texture, backTexture: object.backTexture, metadata: cleanMetadata(object.metadata),
      ...(object.diceFaces ? { diceFaces: structuredClone(object.diceFaces) } : {}),
      ...(object.cards ? { cards: object.cards.map(({ id: _id, ...card }) => ({ ...card })) } : {}),
    },
  }, true)
}
export function createLibraryDraft(kind: ObjectKind): LibraryDraft { return templateFromObject(createObject(kind)) }

function instantiate(draft: LibraryDraft, overrides: Partial<TableObject> = {}): TableObject {
  if (overrides.kind !== undefined && overrides.kind !== draft.kind) throw new Error('不能改变库实例的对象类型。')
  const { id: _id, kind: _kind, cards: overrideCards, ...patch } = overrides
  const cards = overrideCards ?? draft.template.cards
  const { cards: _templateCards, ...configuration } = draft.template
  const object = createObject(draft.kind, {
    ...configuration, name: draft.name, description: draft.description, ...patch,
    metadata: cleanMetadata({ ...draft.template.metadata, ...patch.metadata }),
    ...(cards ? { cards: cards.map(card => ({ ...card, id: createObject('card').id })) } : {}),
    // A placed die always starts without a fabricated result.
    ...(draft.kind === 'dice' ? { value: 0 } : {}),
    ...(draft.kind === 'deck' ? { value: cards?.length ?? 0 } : {}),
  })
  assertLibraryDice(object)
  return object
}
export function instantiateLibraryDraft(draft: LibraryDraft, overrides: Partial<TableObject> = {}): TableObject {
  return instantiate(validateDraft(draft, true), overrides)
}
export function instantiateLibraryEntry(value: LibraryEntry, overrides: Partial<TableObject> = {}): TableObject {
  const entry = validateLibraryEntry(value)
  const object = instantiate(entry, overrides)
  return validateTableObject({ ...object, metadata: { ...object.metadata, libraryId: entry.id, libraryRevision: entry.revision } })
}

function fetcher(options: LibraryClientOptions): typeof fetch { return options.fetcher ?? globalThis.fetch }
async function responseJson(response: Response): Promise<unknown> {
  let body: unknown
  try { body = await response.json() } catch { throw new Error(`本机服务返回了无效响应（${response.status}）。`) }
  if (!response.ok) {
    const data = body && typeof body === 'object' ? body as Record<string, unknown> : {}
    const detail = typeof data.error === 'string' ? data.error : typeof data.message === 'string' ? data.message : `请求失败（${response.status}）`
    throw new Error(detail.slice(0, 1000))
  }
  return body
}
function apiInit(options: LibraryClientOptions): RequestInit { return { signal: options.signal, credentials: 'same-origin' } }
export async function listLibraryEntries(options: LibraryClientOptions = {}): Promise<LibraryEntry[]> {
  const data = plain(await responseJson(await fetcher(options)('/api/library', apiInit(options))), '库列表')
  if (!Array.isArray(data.entries) || data.entries.length > 1000) throw new Error('物件库列表格式不正确。')
  const entries = data.entries.map(validateLibraryEntry)
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('物件库列表包含重复 ID。')
  return entries
}
export async function fetchLibraryEntry(entryId: string, requestedRevision?: number, options: LibraryClientOptions = {}): Promise<LibraryEntry> {
  const id = identifier(entryId)
  const query = requestedRevision === undefined ? '' : `?revision=${revision(requestedRevision)}`
  const entry = validateLibraryEntry(await responseJson(await fetcher(options)(`/api/library/${encodeURIComponent(id)}${query}`, apiInit(options))))
  if (entry.id !== id || (requestedRevision !== undefined && entry.revision !== requestedRevision)) throw new Error('物件库响应与请求的固定版本不一致。')
  return entry
}
export async function deleteLibraryEntry(entryId: string, options: LibraryClientOptions = {}): Promise<void> {
  const response = await fetcher(options)(`/api/library/${encodeURIComponent(identifier(entryId))}`, { ...apiInit(options), method: 'DELETE' })
  if (!response.ok) await responseJson(response)
}

const MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
async function blobDataUrl(blob: Blob): Promise<string> {
  const mime = blob.type.split(';')[0].toLowerCase()
  if (!MIME_TYPES.has(mime) || blob.size > 2_000_000) throw new Error('资源仅支持 2 MB 内的 PNG、JPEG、WebP 图片。')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  const source = `data:${mime};base64,${btoa(binary)}`
  if (source.length > MAX_ASSET_LENGTH) throw new Error('图片编码后超过存档的单图上限，请使用约 1.4 MB 内的图片。')
  return validateAssetSource(source)
}
function dataUrlBlob(source: string): Blob {
  validateAssetSource(source)
  const comma = source.indexOf(',')
  const mime = source.slice(5, source.indexOf(';'))
  const binary = atob(source.slice(comma + 1))
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  return new Blob([bytes], { type: mime })
}
export async function uploadLibraryResource(blob: Blob, options: LibraryClientOptions = {}): Promise<LibraryResource> {
  await blobDataUrl(blob)
  const response = await fetcher(options)('/api/resources', {
    ...apiInit(options), method: 'POST', headers: { 'Content-Type': blob.type.split(';')[0].toLowerCase() }, body: blob,
  })
  const result = plain(await responseJson(response), '资源响应')
  if (typeof result.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(result.sha256) || result.url !== `/api/resources/${result.sha256}` ||
      !MIME_TYPES.has(result.mime as string) || typeof result.byteLength !== 'number' || !Number.isSafeInteger(result.byteLength) || result.byteLength < 1 || result.byteLength > 2_000_000) throw new Error('资源响应格式不正确。')
  return result as unknown as LibraryResource
}
function uniqueImageUploader(options: LibraryClientOptions): (blob: Blob) => Promise<LibraryResource> {
  const images = new Map<string, Promise<LibraryResource>>()
  return async blob => {
    const canonical = await blobDataUrl(blob)
    // Content deduplication also covers differently cased data URLs and duplicate remote URLs.
    const digest = globalThis.crypto?.subtle ? await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer()) : undefined
    const key = digest ? Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') : canonical
    let pending = images.get(key)
    if (!pending) { pending = uploadLibraryResource(blob, options); images.set(key, pending) }
    return pending
  }
}
async function fetchImage(source: string, options: LibraryClientOptions): Promise<Blob> {
  let response: Response
  try { response = await fetcher(options)(source, apiInit(options)) }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    const detail = error instanceof Error ? `（${error.message.slice(0, 160)}）` : ''
    throw new Error(isLocalResourceUrl(source) ? `无法连接本机图片资源服务${detail}。` : `无法读取外部图片，请确认地址可访问且允许跨域读取${detail}。`)
  }
  if (!response.ok) throw new Error(`无法读取图片资源（${response.status}）：${source.slice(0, 160)}`)
  const blob = await response.blob()
  await blobDataUrl(blob)
  return blob
}

type ImageCarrier = { texture: string; backTexture: string }
async function rewriteImages<T extends ImageCarrier>(carrier: T, rewrite: (source: string) => Promise<string>): Promise<T> {
  return { ...carrier, texture: await rewrite(carrier.texture), backTexture: await rewrite(carrier.backTexture) }
}
async function rewriteCards<T extends ImageCarrier>(cards: T[], rewrite: (source: string) => Promise<string>): Promise<T[]> {
  const result = new Array<T>(cards.length)
  let cursor = 0
  let failed = false
  await Promise.all(Array.from({ length: Math.min(4, cards.length) }, async () => {
    while (cursor < cards.length && !failed) {
      const index = cursor++
      try { result[index] = await rewriteImages(cards[index], rewrite) }
      catch (error) { failed = true; throw error }
    }
  }))
  return result
}
/** Resolves legacy inline/HTTP images into durable local resources, once per unique source. */
export async function prepareLibraryDraft(value: LibraryDraft, options: LibraryClientOptions = {}): Promise<LibraryDraft> {
  const draft = validateDraft(value, true)
  const uploaded = new Map<string, Promise<string>>()
  const upload = uniqueImageUploader(options)
  const rewrite = (source: string): Promise<string> => {
    if (!source || isLocalResourceUrl(source)) return Promise.resolve(source)
    let pending = uploaded.get(source)
    if (!pending) {
      pending = (async () => (await upload(source.startsWith('data:') ? dataUrlBlob(source) : await fetchImage(source, options))).url)()
      uploaded.set(source, pending)
    }
    return pending
  }
  const template = await rewriteImages(draft.template, rewrite)
  if (template.cards) template.cards = await rewriteCards(template.cards, rewrite)
  return validateLibraryDraft({ ...draft, template })
}
export async function saveLibraryEntry(value: LibraryDraft, entryId?: string, expectedRevision?: number, options: LibraryClientOptions = {}): Promise<LibraryEntry> {
  if (expectedRevision !== undefined && entryId === undefined) throw new Error('新库条目不能指定旧版本。')
  const id = entryId === undefined ? undefined : identifier(entryId)
  const expected = expectedRevision === undefined ? undefined : revision(expectedRevision)
  const draft = await prepareLibraryDraft(value, options)
  const entry = validateLibraryEntry(await responseJson(await fetcher(options)(id ? `/api/library/${encodeURIComponent(id)}` : '/api/library', {
    ...apiInit(options), method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...draft, ...(expected === undefined ? {} : { expectedRevision: expected }) }),
  })))
  if ((id !== undefined && entry.id !== id) || (expected !== undefined && entry.revision !== expected + 1)) throw new Error('保存响应的条目或版本不一致。')
  return entry
}

async function rewriteSessionImages(session: TableSession, rewrite: (source: string) => Promise<string>): Promise<TableSession> {
  const encoder = new TextEncoder()
  let bytes = encoder.encode(JSON.stringify(session)).byteLength
  const boundedRewrite = async (source: string): Promise<string> => {
    const updated = await rewrite(source)
    bytes += encoder.encode(updated).byteLength - encoder.encode(source).byteLength
    if (bytes > MAX_TABLE_BYTES) throw new Error('桌面存档超过 10 MB，请减少图片或对象。')
    return updated
  }
  const tavern = session.tavern ? structuredClone(session.tavern) : undefined
  if (tavern) {
    for (const effect of tavern.effects) effect.url = await boundedRewrite(effect.url)
    for (const card of tavern.archive.cards) if (card.portrait) card.portrait = await boundedRewrite(card.portrait)
  }
  const objects = []
  for (const object of session.objects) {
    const updated = await rewriteImages(object, boundedRewrite)
    if (updated.cards) updated.cards = await rewriteCards(updated.cards, boundedRewrite)
    objects.push(updated)
  }
  const adventure = session.adventure ? { ...session.adventure, definition: await rewriteAdventureImages(session.adventure.definition, boundedRewrite) } : undefined
  const workspace = session.workspace?.definition ? { ...session.workspace, definition: await rewriteAdventureImages(session.workspace.definition, boundedRewrite) } : session.workspace
  return validateTableSession({ ...session, objects, ...(tavern ? { tavern } : {}), ...(adventure ? { adventure } : {}), ...(workspace ? { workspace } : {}) })
}

async function rewriteAdventureImages(value: AdventureDefinition, rewrite: (source: string) => Promise<string>): Promise<AdventureDefinition> {
  const def = structuredClone(value)
  if (def.tavern) {
    for (const effect of def.tavern.effects) effect.url = await rewrite(effect.url)
    for (const card of def.tavern.archive.cards) if (card.portrait) card.portrait = await rewrite(card.portrait)
  }
  for (const scene of def.scenes) for (let i = 0; i < scene.objects.length; i++) {
    const object = await rewriteImages(scene.objects[i], rewrite)
    if (object.cards) object.cards = await rewriteCards(object.cards, rewrite)
    scene.objects[i] = object
  }
  for (const character of def.characters) if (character.appearance) character.appearance = await rewriteImages(character.appearance, rewrite)
  if (def.rpg) for (const role of [...Object.values(def.rpg.roles), ...Object.values(def.rpg.enemies)]) if (role.tabletopAppearance) role.tabletopAppearance = await rewriteImages(role.tabletopAppearance as TableObject, rewrite)
  return validateAdventureDefinition(def)
}
export async function exportPortableAdventure(value: AdventureDefinition, options: LibraryClientOptions = {}) {
  const def = validateAdventureDefinition(value); const cache = new Map<string, Promise<string>>()
  const definition = await rewriteAdventureImages(def, source => {
    if (!source || source.startsWith('data:')) return Promise.resolve(source)
    let pending = cache.get(source); if (!pending) { pending = fetchImage(source, options).then(blobDataUrl); cache.set(source, pending) }
    return pending
  })
  return { format: 'realm-adventure' as const, version: 1 as const, definition }
}
export async function importPortableAdventure(value: unknown, options: LibraryClientOptions = {}): Promise<AdventureDefinition> {
  if (!value || typeof value !== 'object' || (value as { format?: unknown }).format !== 'realm-adventure' || (value as { version?: unknown }).version !== 1) throw new Error('请选择 .adventure.json 创作包；桌面存档请在桌面载入。')
  const def = validateAdventureDefinition((value as { definition: unknown }).definition)
  const upload = uniqueImageUploader(options); const cache = new Map<string, Promise<string>>()
  const definition = await rewriteAdventureImages(def, source => {
    if (!source) return Promise.resolve(source)
    let pending = cache.get(source)
    if (!pending) { pending = (async () => { if (isLocalResourceUrl(source)) { await fetchImage(source, options); return source } return (await upload(source.startsWith('data:') ? dataUrlBlob(source) : await fetchImage(source, options))).url })(); cache.set(source, pending) }
    return pending
  })
  return { ...definition, id: crypto.randomUUID(), revision: 0 }
}
/** Portable V1 JSON embeds every referenced image; failed downloads abort instead of losing images. */
export async function exportPortableSession(value: TableSession, options: LibraryClientOptions = {}): Promise<TableSession> {
  const session = validateTableSession(value)
  const images = new Map<string, Promise<string>>()
  return rewriteSessionImages(session, source => {
    if (!source || source.startsWith('data:')) return Promise.resolve(source)
    let pending = images.get(source)
    if (!pending) { pending = fetchImage(source, options).then(blobDataUrl); images.set(source, pending) }
    return pending
  })
}
/** Imports old inline-image V1 saves and portable saves, deduplicating uploads before committing. */
export async function importPortableSession(value: unknown, options: LibraryClientOptions = {}): Promise<TableSession> {
  if (typeof value === 'string' && new TextEncoder().encode(value).byteLength > MAX_TABLE_BYTES) throw new Error('桌面存档超过 10 MB。')
  let parsed = value
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value) } catch { throw new Error('桌面存档不是有效的 JSON。') }
  }
  const session = validateTableSession(parsed)
  const uploaded = new Map<string, Promise<string>>()
  const upload = uniqueImageUploader(options)
  return rewriteSessionImages(session, source => {
    if (!source) return Promise.resolve(source)
    let pending = uploaded.get(source)
    if (!pending) {
      pending = (async () => {
        // A nonportable local reference must already exist on this host. Check it explicitly.
        if (isLocalResourceUrl(source)) { await fetchImage(source, options); return source }
        const blob = source.startsWith('data:') ? dataUrlBlob(source) : await fetchImage(source, options)
        return (await upload(blob)).url
      })()
      uploaded.set(source, pending)
    }
    return pending
  })
}
