import { rpgTextConfig, type RpgTextCue } from './rpg-text-presentation'

interface ApngRender { blob: Blob; duration: number; width: number; height: number; frames: number }
interface ApngService { render(config: ReturnType<typeof rpgTextConfig>, options: { signal: AbortSignal }): Promise<ApngRender> }
const service = () => (globalThis as unknown as { TextApngService?: ApngService }).TextApngService
let loading: Promise<ApngService> | undefined
let rendering: Promise<unknown> = Promise.resolve()
const cache = new Map<string, ApngRender>()
let cacheBytes = 0
const abort = () => new DOMException('文字演出已切换。', 'AbortError')

export function loadTavernApng(): Promise<ApngService> {
  if (service()) return Promise.resolve(service()!)
  if (loading) return loading
  loading = (async () => {
    // The original service captures its dependencies at evaluation time.
    for (const name of ['presets', 'fonts', 'engine', 'apng-encoder', 'render-service']) {
      await new Promise<void>((resolve, reject) => {
        const tag = document.createElement('script')
        tag.src = `/modules/bear-tavern/tools/text-apng-maker/js/${name}.js`
        tag.async = false
        tag.onload = () => resolve()
        tag.onerror = () => { tag.remove(); reject(new Error('文字演出素材读取失败。')) }
        document.head.append(tag)
      })
    }
    if (!service()) throw new Error('文字演出暂未准备好。')
    return service()!
  })().catch(error => { loading = undefined; throw error })
  return loading
}

/** Serial work, cancellation and a bounded Blob cache keep gameplay responsive. */
export function renderRpgText(cue: RpgTextCue, signal: AbortSignal): Promise<ApngRender> {
  const config = rpgTextConfig(cue), key = JSON.stringify(config)
  const work = rendering.catch(() => {}).then(async () => {
    if (signal.aborted) throw abort()
    const hit = cache.get(key)
    if (hit) { cache.delete(key); cache.set(key, hit); return hit }
    const api = await loadTavernApng()
    if (signal.aborted) throw abort()
    const result = await api.render(config, { signal })
    if (signal.aborted) throw abort()
    cache.set(key, result); cacheBytes += result.blob.size
    while (cache.size > 24 || cacheBytes > 24 * 1024 * 1024) {
      const oldest = cache.keys().next().value!
      cacheBytes -= cache.get(oldest)!.blob.size; cache.delete(oldest)
    }
    return result
  })
  rendering = work
  return work
}
