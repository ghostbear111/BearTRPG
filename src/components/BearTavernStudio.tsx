import { editorAsset } from '../lib/online-editor'
import { useEffect, useRef, useState } from 'react'
import { uploadLibraryResource } from '../lib/object-library'
import { bindingKey, boundCard, characterModel, emptyPresentation, presentationOf, type TavernArchive, type TavernCard, type TavernEffect, type TavernPresentation } from '../lib/tavern-presentation'
import type { TableObject, TableSession } from '../lib/tabletop'
import './tavern-integration.css'

interface ApngAsset { blob: Blob; fileName: string; width: number; height: number; duration: number; loops: number }
interface ApngMaker { ready: Promise<unknown>; iframe: HTMLIFrameElement; configure(config: object): Promise<unknown>; render(): Promise<ApngAsset>; cancel(): Promise<unknown>; destroy(): void }
declare global { interface Window { BearTavernApng?: { mount(container: HTMLElement, options: object): ApngMaker } } }
let sdkPromise: Promise<void> | undefined
function loadSdk() { return sdkPromise ??= new Promise<void>((resolve, reject) => { const s = document.createElement('script'); s.src = editorAsset('/modules/bear-tavern/assets/js/apng-client.js'); s.onload = () => resolve(); s.onerror = () => { sdkPromise = undefined; s.remove(); reject(new Error('文字动画模块加载失败。')) }; document.head.appendChild(s) }) }
const root = editorAsset('/modules/bear-tavern/')

export default function BearTavernStudio(p: { table: TableSession; selected?: TableObject | null; initialTab: 'characters' | 'text'; onSave: (value: TavernPresentation) => void; onSpawn: (card: TavernCard, kind: 'card' | 'figurine', value: TavernPresentation) => void; onPlay: (effect: TavernEffect) => void; onClose: () => void }) {
  const [tab, setTab] = useState(p.initialTab), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [status, setStatus] = useState('正在准备工具…')
  const [asset, setAsset] = useState<ApngAsset | null>(null), [preview, setPreview] = useState(''), [name, setName] = useState('文字演出')
  const [scope, setScope] = useState<TavernEffect['scope']>('table'), [target, setTarget] = useState(p.selected?.id ?? ''), [trigger, setTrigger] = useState<TavernEffect['trigger']>('manual')
  const current = useRef(p); current.current = p
  const frame = useRef<HTMLIFrameElement>(null), container = useRef<HTMLDivElement>(null), maker = useRef<ApngMaker | null>(null)
  const pending = useRef(new Map<string, { resolve: (v: { archive: TavernArchive; selectedId: string }) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>())
  const portraits = useRef(new Map<string, string>())
  const data = () => structuredClone(presentationOf(current.current.table) ?? emptyPresentation())
  function post(type: string, payload = {}, requestId = crypto.randomUUID()) { frame.current?.contentWindow?.postMessage({ namespace: 'bear-tavern.tabletop', version: 1, type, requestId, payload }, location.origin); return requestId }
  useEffect(() => {
    setReady(false); setStatus('正在准备工具…'); let active = true, loaded = false
    if (tab === 'characters') {
      const receive = (e: MessageEvent) => {
        const m = e.data
        if (e.origin !== location.origin || e.source !== frame.current?.contentWindow || m?.namespace !== 'bear-tavern.tabletop' || m.version !== 1) return
        if (m.type === 'tool:character-ready' && !loaded) {
          loaded = true; const value = data(); post('host:character-load', { archive: value.archive, selectedId: boundCard(current.current.table, current.current.selected)?.id }); setReady(true); setStatus('编辑角色后保存到作品；角色与棋子可以共享一份档案。')
        } else if (m.type === 'tool:character-result') {
          const request = pending.current.get(m.requestId); if (!request) return
          clearTimeout(request.timer); pending.current.delete(m.requestId)
          if (m.payload?.ok && m.payload.archive) { try { request.resolve({ archive: characterModel.normalizeState(m.payload.archive), selectedId: m.payload.selectedId }) } catch (error) { request.reject(error as Error) } }
          else request.reject(new Error(m.payload?.error || '角色资料没有返回。'))
        }
      }
      window.addEventListener('message', receive)
      return () => { window.removeEventListener('message', receive); for (const request of pending.current.values()) { clearTimeout(request.timer); request.reject(new Error('角色工具已关闭。')) }; pending.current.clear() }
    }
    void loadSdk().then(async () => {
      if (!active || !container.current || !window.BearTavernApng) return
      const instance = window.BearTavernApng.mount(container.current, { baseUrl: new URL(root, location.origin).href, url: 'tools/text-apng-maker/index.html', language: 'zh', theme: 'dark', title: '熊酒馆文字 APNG 制作器', onProgress: (v: { progress: number }) => { if (active) setStatus(`正在生成文字动画 · ${Math.round(v.progress * 100)}%`) }, onExport: (v: ApngAsset) => { if (active) { setAsset(v); setStatus('APNG 已生成，可预览并保存到当前作品。') } } })
      maker.current = instance; await instance.ready
      if (!active) return
      await instance.configure({ text: '战斗开始', width: 640, height: 240, fontId: 'system-sans', fontSize: 64, fps: 12, inDuration: .4, holdDuration: 1.2, outDuration: .4, loop: 'once', color: 'full', textColor: '#e6b666' })
      setReady(true); setStatus('在制作器中设置文字、字体与动画，再生成并保存演出。')
    }).catch(error => { if (active) setStatus(error.message) })
    return () => { active = false; maker.current?.destroy(); maker.current = null }
  }, [tab])
  useEffect(() => { if (!asset) { setPreview(''); return }; const url = URL.createObjectURL(asset.blob); setPreview(url); return () => URL.revokeObjectURL(url) }, [asset])
  async function run(task: () => Promise<void>) { setBusy(true); try { await task() } catch (error) { setStatus((error as Error).message) } finally { setBusy(false) } }
  function readCharacters() { return new Promise<{ archive: TavernArchive; selectedId: string }>((resolve, reject) => { const id = crypto.randomUUID(), timer = setTimeout(() => { pending.current.delete(id); reject(new Error('角色工具响应超时，请重开工具。')) }, 10000); pending.current.set(id, { resolve, reject, timer }); post('host:character-export', {}, id) }) }
  async function applyCharacters(action: 'save' | 'bind' | 'card' | 'figurine') {
    const result = await readCharacters(), value = data(); value.archive = result.archive
    // Store shared portraits once, rather than copying a large image into every pawn/save.
    for (const card of value.archive.cards) if (card.portrait.startsWith('data:')) {
      const source = card.portrait, cached = portraits.current.get(source)
      if (cached) card.portrait = cached
      else { const blob = await (await fetch(source)).blob(); const resource = await uploadLibraryResource(blob); portraits.current.set(source, resource.url); card.portrait = resource.url }
    }
    const valid = new Set(value.archive.cards.map(c => c.id)); value.bindings = Object.fromEntries(Object.entries(value.bindings).filter(([, id]) => valid.has(id)))
    const card = value.archive.cards.find(c => c.id === result.selectedId)
    if (action !== 'save' && !card) throw new Error('请先创建或选中一张角色卡。')
    if (action === 'bind') { if (!current.current.selected) throw new Error('请先在桌面选中棋子或卡牌。'); value.bindings[bindingKey(current.current.selected)] = card!.id }
    if (action === 'card' || action === 'figurine') p.onSpawn(card!, action, value); else p.onSave(value)
    setStatus(action === 'bind' ? `已将${card!.name || '角色'}关联到${current.current.selected!.name}。` : action === 'save' ? '角色档案已保存到当前作品。' : `已放置${card!.name || '角色'}${action === 'card' ? '的角色卡' : '的棋子'}。`)
  }
  async function saveEffect() {
    if (!asset) return
    const following = p.table.objects.find(o => o.id === target && o.kind === (scope === 'piece' ? 'figurine' : 'card'))
    if ((scope === 'piece' || scope === 'card') && !following) throw new Error('请选择演出要跟随的棋子或角色卡。')
    const resource = await uploadLibraryResource(asset.blob), value = data()
    const effect: TavernEffect = { id: crypto.randomUUID(), name: name.trim() || asset.fileName, url: resource.url, width: asset.width, height: asset.height, duration: asset.duration, loops: asset.loops, scope, target: ['piece', 'card'].includes(scope) ? bindingKey(following!) : '', sceneId: p.table.workspace?.sceneId ?? p.table.adventure?.progress.sceneId ?? '', trigger }
    value.effects.push(effect); p.onSave(value); p.onPlay(effect); setStatus('文字演出已保存并播放，可在游戏模式重播。')
  }
  const characterSrc = new URL(`${root}tools/tavern-character-sheet/index.html`, location.origin); characterSrc.search = new URLSearchParams({ embed: '1', tabletop: '1', local: '1', hostOrigin: location.origin, lang: 'zh', theme: 'dark' }).toString()
  return <div className="bt-studio-backdrop" role="dialog" aria-modal="true" aria-label="角色与文字演出工作室" onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape' && !busy) p.onClose() }}>
    <section className="bt-presentation-studio"><header><div><small>熊酒馆 · 创作工具</small><h2>角色与文字演出</h2></div><nav><button aria-pressed={tab === 'characters'} disabled={busy} onClick={() => setTab('characters')}>角色卡</button><button aria-pressed={tab === 'text'} disabled={busy} onClick={() => setTab('text')}>文字 APNG</button></nav><button aria-label="关闭角色与演出工具" disabled={busy} onClick={p.onClose}>返回桌面 ×</button></header>
      <div className="bt-studio-content">{tab === 'characters' ? <iframe ref={frame} title="熊酒馆通用角色卡编辑器" src={characterSrc.href} sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals" /> : <div ref={container} className="bt-apng-editor" />}</div>
      {tab === 'text' && <div className="bt-effect-settings"><label>演出名称<input aria-label="文字演出名称" value={name} maxLength={120} onChange={e => setName(e.target.value)} /></label><label>显示位置<select aria-label="文字演出显示位置" value={scope} onChange={e => setScope(e.target.value as TavernEffect['scope'])}><option value="table">桌面中央</option><option value="message">上方消息条</option><option value="piece">跟随棋子</option><option value="card">跟随角色卡</option></select></label>{['piece', 'card'].includes(scope) && <label>跟随物件<select aria-label="演出跟随物件" value={target} onChange={e => setTarget(e.target.value)}><option value="">请选择</option>{p.table.objects.filter(o => scope === 'piece' ? o.kind === 'figurine' : o.kind === 'card').map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}<label>播放方式<select aria-label="文字演出播放方式" value={trigger} onChange={e => setTrigger(e.target.value as TavernEffect['trigger'])}><option value="manual">手动播放</option><option value="scene">进入本场景时播放</option></select></label>{preview && <img className="bt-apng-result" src={preview} alt="生成的文字动画预览" />}</div>}
      <footer><p role="status">{status}</p><div>{tab === 'characters' ? <><button disabled={!ready || busy || !p.selected} onClick={() => void run(() => applyCharacters('bind'))}>关联所选物件</button><button disabled={!ready || busy} onClick={() => void run(() => applyCharacters('figurine'))}>放置角色棋子</button><button disabled={!ready || busy} onClick={() => void run(() => applyCharacters('card'))}>放置角色卡</button><button className="bt-primary" disabled={!ready || busy} onClick={() => void run(() => applyCharacters('save'))}>保存角色档案</button></> : <><button disabled={!busy} onClick={() => void maker.current?.cancel()}>取消生成</button><button disabled={!ready || busy} onClick={() => void run(async () => { setAsset(await maker.current!.render()); setStatus('APNG 已生成，可预览并保存到当前作品。') })}>生成文字动画</button><button className="bt-primary" disabled={!asset || busy} onClick={() => void run(saveEffect)}>保存并播放演出</button></>}</div></footer>
    </section>
  </div>
}
