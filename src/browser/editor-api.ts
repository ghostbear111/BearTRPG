import { validateLibraryDraft, type LibraryEntry } from '../lib/object-library'
import { auditAdventure, validateAdventureDefinition } from '../lib/adventure-schema'

const STORES = ['resources', 'library', 'adventures', 'versions', 'imports', 'metadata']
class EditorError extends Error { constructor(public status: number, message: string) { super(message) } }
const fail = (status: number, message: string): never => { throw new EditorError(status, message) }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const hash = async (bytes: BufferSource) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('')
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])])) : value
interface RecordRow { id: string; body: any; updatedAt: number; deleted?: boolean; workId?: string }
function result<T>(request: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) }) }
function complete(tx: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error ?? new Error('浏览器存储写入失败，请导出当前草稿备份。')); tx.onerror = () => {} }) }
function imageMime(bytes: Uint8Array): string {
  const starts = (signature: number[]) => signature.every((v, i) => bytes[i] === v)
  if (bytes.length >= 33 && starts([137, 80, 78, 71, 13, 10, 26, 10]) && String.fromCharCode(...bytes.slice(12, 16)) === 'IHDR') return 'image/png'
  if (bytes.length >= 4 && starts([255, 216, 255]) && bytes.at(-2) === 255 && bytes.at(-1) === 217) return 'image/jpeg'
  if (bytes.length >= 20 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp'
  return fail(400, '图片内容不是有效的 PNG、JPEG 或 WebP。')
}
/** The online editor keeps author data on this browser; it never sends it to GitHub. */
export class BrowserEditorApi {
  private db: Promise<IDBDatabase>
  private ready: Promise<void>
  constructor(name = 'bear-trpg-online-editor-v1', seeds: unknown[] = [], factory: IDBFactory = indexedDB) {
    this.db = new Promise((resolve, reject) => {
      const request = factory.open(name, 1)
      request.onupgradeneeded = () => { for (const store of STORES) request.result.createObjectStore(store, { keyPath: 'id' }) }
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result) }
      request.onerror = () => reject(new Error('浏览器存储无法打开，请允许本站保存数据。'))
      request.onblocked = () => reject(new Error('请关闭其他编辑器标签页后重新打开。'))
    })
    this.ready = this.seed(seeds)
  }
  async close() { (await this.db).close() }
  private async seed(values: unknown[]) {
    const drafts = values.map(validateLibraryDraft), db = await this.db
    const tx = db.transaction(['metadata', 'library', 'versions'], 'readwrite'), done = complete(tx)
    const flag = tx.objectStore('metadata').get('builtins-v1')
    flag.onsuccess = () => {
      if (flag.result) return
      for (const draft of drafts) {
        const id = crypto.randomUUID(), body = { ...draft, id, revision: 1 }
        tx.objectStore('library').put({ id, body, updatedAt: Date.now() })
        tx.objectStore('versions').put({ id: `library:${id}:1`, body })
      }
      tx.objectStore('metadata').put({ id: 'builtins-v1', value: true })
    }
    await done
  }
  private async get(store: string, id: string) { const db = await this.db; return result(db.transaction(store).objectStore(store).get(id)) }
  private async all(store: string): Promise<RecordRow[]> { const db = await this.db; return result(db.transaction(store).objectStore(store).getAll()) }
  private async put(store: string, value: object) { const db = await this.db, tx = db.transaction(store, 'readwrite'), done = complete(tx); tx.objectStore(store).put(value); await done }
  private async checkResources(value: unknown) {
    const urls = new Set<string>()
    const walk = (row: unknown) => { if (!row || typeof row !== 'object') return; for (const [key, data] of Object.entries(row)) { if (['texture', 'backTexture', 'portrait', 'url'].includes(key) && typeof data === 'string' && data.startsWith('/api/resources/')) urls.add(data); else if (typeof data === 'object') walk(data) } }
    walk(value)
    for (const url of urls) if (!await this.get('resources', url.slice('/api/resources/'.length))) fail(400, '作品引用的图片在当前浏览器不存在，请导入包含图片的完整备份。')
  }
  private async saveVersion(store: string, body: any, id?: string, expected?: number, importedHash?: string): Promise<{ body: any; created: boolean }> {
    const db = await this.db, key = id ?? crypto.randomUUID()
    // Revision check and both writes share one transaction, including cross-tab writes.
    const tx = db.transaction([store, 'versions', 'imports'], 'readwrite')
    return new Promise((resolve, reject) => {
      let response: { body: any; created: boolean }, problem: Error | undefined
      const abort = (e: Error) => { problem = e; tx.abort() }
      tx.oncomplete = () => resolve(response)
      tx.onabort = () => reject(problem ?? tx.error ?? new Error('浏览器保存失败。'))
      tx.onerror = () => {}
      const write = () => {
        const request = tx.objectStore(store).get(key)
        request.onsuccess = () => {
          const current = request.result as RecordRow | undefined
          if (id && (!current || current.deleted)) return abort(new EditorError(404, '作品或物件不存在。'))
          if (id && (!Number.isSafeInteger(expected) || expected !== current?.body.revision || body.revision !== undefined && body.revision !== expected)) return abort(new EditorError(409, '内容已被另一标签页更新，请重新读取最新版本；当前草稿仍保留。'))
          const saved = { ...body, id: key, revision: id ? current!.body.revision + 1 : 1 }
          tx.objectStore(store).put({ id: key, body: saved, updatedAt: Date.now() })
          tx.objectStore('versions').put({ id: `${store}:${key}:${saved.revision}`, body: saved })
          if (importedHash) tx.objectStore('imports').put({ id: importedHash, workId: key })
          response = { body: saved, created: true }
        }
      }
      if (!importedHash) return write()
      const existing = tx.objectStore('imports').get(importedHash)
      existing.onsuccess = () => {
        if (!existing.result) return write()
        const prior = tx.objectStore(store).get(existing.result.workId)
        prior.onsuccess = () => { if (!prior.result) return abort(new EditorError(404, '已导入的作品不存在。')); response = { body: prior.result.body, created: false } }
      }
    })
  }
  async handle(request: Request): Promise<Response> {
    try { await this.ready; return await this.route(request) }
    catch (e) { return json({ error: e instanceof Error ? e.message : '浏览器保存失败。' }, e instanceof EditorError ? e.status : 400) }
  }
  private async route(request: Request): Promise<Response> {
    const url = new URL(request.url), route = url.pathname, method = request.method
    const readJson = async () => {
      if (!request.headers.get('content-type')?.startsWith('application/json')) return fail(415, '请使用 JSON 数据。')
      const text = await request.text(); if (new TextEncoder().encode(text).byteLength > 10 * 1024 * 1024) fail(413, '作品或模板不能超过 10 MB。')
      return JSON.parse(text)
    }
    if (route === '/api/health' && method === 'GET') return json({ ok: true, storage: 'browser' })
    if (route === '/api/models' || route === '/api/chat') return json({ error: '在线编辑器的 AI 连接需独立后台。请在本机版连接 Ollama 或兼容接口。' }, 501)
    if (route === '/api/resources' && method === 'POST') {
      const bytes = new Uint8Array(await request.arrayBuffer())
      if (!bytes.length || bytes.length > 2_000_000) fail(413, '图片需为非空文件，最多 2 MB。')
      const mime = imageMime(bytes), declared = request.headers.get('content-type')?.split(';')[0]
      if (mime !== declared) fail(415, '图片内容与文件类型不一致。')
      const sha256 = await hash(bytes), resource = { sha256, url: `/api/resources/${sha256}`, mime, byteLength: bytes.length }
      await this.put('resources', { id: sha256, ...resource, blob: new Blob([bytes], { type: mime }) })
      return json(resource, 201)
    }
    const resource = /^\/api\/resources\/([a-f0-9]{64})$/.exec(route)
    if (resource && ['GET', 'HEAD'].includes(method)) {
      const row = await this.get('resources', resource[1]); if (!row) fail(404, '当前浏览器没有此图片，请导入备份。')
      return new Response(method === 'HEAD' ? null : row.blob, { headers: { 'Content-Type': row.mime, 'Content-Length': String(row.byteLength), 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } })
    }
    const library = /^\/api\/library(?:\/([a-zA-Z0-9_-]+)(?:\/revisions\/([1-9]\d*))?)?$/.exec(route)
    if (library) {
      const id = library[1], rawRevision = library[2] ?? url.searchParams.get('revision')
      if (rawRevision && !/^[1-9]\d*$/.test(rawRevision)) fail(400, '物件版本无效。')
      const revision = rawRevision ? Number(rawRevision) : undefined
      if (method === 'GET') {
        if (!id) return json({ entries: (await this.all('library')).filter(r => !r.deleted).map(r => r.body) })
        const row = await this.get(revision ? 'versions' : 'library', revision ? `library:${id}:${revision}` : id)
        if (!row || row.deleted) fail(404, '物件或版本不存在。'); return json(row.body)
      }
      if (revision) fail(405, '固定版本不可修改。')
      if (method === 'DELETE' && id) {
        const db = await this.db, tx = db.transaction('library', 'readwrite'), done = complete(tx), existing = tx.objectStore('library').get(id)
        existing.onsuccess = () => { if (existing.result) tx.objectStore('library').put({ ...existing.result, deleted: true }) }
        await done; return json({ ok: true })
      }
      if (method === 'POST' && !id || method === 'PUT' && id) {
        const input = await readJson(), draft = validateLibraryDraft(input)
        await this.checkResources(draft)
        if (!id && (await this.all('library')).filter(r => !r.deleted).length >= 1000) fail(400, '物件库最多保存 1000 项。')
        const saved = await this.saveVersion('library', draft, id, input.expectedRevision)
        return json(saved.body, id ? 200 : 201)
      }
      return fail(405, '物件接口请求方式无效。')
    }
    const adventure = /^\/api\/adventures(?:\/([a-zA-Z0-9_-]+))?$/.exec(route)
    if (adventure) {
      const id = adventure[1], rawRevision = url.searchParams.get('revision')
      if (rawRevision && !/^[1-9]\d*$/.test(rawRevision)) fail(400, '作品版本无效。')
      if (method === 'GET') {
        if (!id) {
          const imported = new Set((await this.all('imports')).map(row => row.workId))
          const works = (await this.all('adventures')).sort((a,b) => b.updatedAt - a.updatedAt).slice(0,200)
          return json({ adventures: works.map(({body:d,updatedAt}) => ({ id:d.id,revision:d.revision,title:d.title,summary:d.summary.slice(0,256),scenes:d.scenes.length,chapters:d.chapters.length,updatedAt,imported:imported.has(d.id) })) })
        }
        const row = await this.get(rawRevision ? 'versions' : 'adventures', rawRevision ? `adventures:${id}:${rawRevision}` : id)
        if (!row) fail(404, '作品或版本不存在。'); return json(row.body)
      }
      if (rawRevision) fail(405, '固定版本不可修改。')
      if (method === 'POST' && (!id || id === 'import') || method === 'PUT' && id) {
        const input = await readJson(), definition = validateAdventureDefinition(input.definition)
        await this.checkResources(definition)
        if (id === 'import') {
          const report = auditAdventure(definition); if (report.errors.length) fail(400, `游戏模组尚不可游玩：${report.errors[0]}`)
          const { id: _id, revision: _rev, ...content } = definition
          const digest = await hash(new TextEncoder().encode(JSON.stringify(canonical(content))))
          const saved = await this.saveVersion('adventures', definition, undefined, undefined, digest)
          return json({ definition:saved.body,created:saved.created }, saved.created ? 201 : 200)
        }
        if (id && definition.id !== id) fail(409, '作品 ID 与保存目标不一致。')
        return json((await this.saveVersion('adventures', definition, id, input.expectedRevision)).body, id ? 200 : 201)
      }
      return fail(405, '作品接口请求方式无效。')
    }
    return fail(404, '在线编辑器接口不存在。')
  }
}
