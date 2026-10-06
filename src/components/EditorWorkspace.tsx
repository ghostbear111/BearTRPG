import { useState, type ReactNode, type CSSProperties } from 'react'
import { ArrowRight, BookOpen, Cards, Circle, Cube, DiceFive, FolderOpen, LockSimple, MagnifyingGlass, Plus, Selection, Stack, UploadSimple, UsersThree, X } from '@phosphor-icons/react'
import type { TableObject, TableSession, ObjectKind } from '../lib/tabletop'
import type { LibraryEntry } from '../lib/object-library'
import type { RpgOp } from '../lib/rpg-schema'

const names: Record<ObjectKind, string> = { figurine: '棋子', token: '标记', dice: '骰子', card: '卡牌', deck: '牌堆', board: '地图', block: '地形' }
const icons = { figurine: UsersThree, token: Circle, dice: DiceFive, card: Cards, deck: Stack, board: Selection, block: Cube }
const kindOrder: ObjectKind[] = ['figurine', 'block', 'dice', 'token', 'card', 'board', 'deck']
function battleNodes(ops: RpgOp[]): number {
  return ops.reduce((n, op) => n + Number(op.op === 'battle') + battleNodes(op.then ?? []) + battleNodes(op.else ?? []) + battleNodes(op.onWin ?? []) + (op.options ?? []).reduce((sum, choice) => sum + battleNodes(choice.s), 0), 0)
}

interface SidebarProps {
  table: TableSession; objects: TableObject[]; selectedIds: string[]; selectedId: string | null
  entries: LibraryEntry[]; loading: boolean; error: string; libraryOpen: boolean
  onSelect: (id: string, additive: boolean) => void; onScene: (id: string) => void
  onSpawn: (entry: LibraryEntry) => void; onManage: () => void; onRefresh: () => void
  onLibraryToggle: () => void; tools: ReactNode
}

export function EditorSidebar(p: SidebarProps) {
  const [tab, setTab] = useState<'scene' | 'assets'>('scene')
  const [query, setQuery] = useState(''), [kind, setKind] = useState<ObjectKind | 'all'>('all'), [page, setPage] = useState(0)
  const [sceneQuery, setSceneQuery] = useState('')
  const definition = p.table.workspace?.definition
  const entries = p.entries.filter(e => e.listed && (kind === 'all' || e.kind === kind) && `${e.name} ${names[e.kind]} ${e.tags.join(' ')}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || Number(Boolean(b.template.metadata.model)) - Number(Boolean(a.template.metadata.model)) || a.name.localeCompare(b.name, 'zh-CN'))
  const pages = Math.max(1, Math.ceil(entries.length / 12)), current = Math.min(page, pages - 1)
  return <aside className="bt-editor-sidebar" aria-label="场景与物件库">
    <div className="bt-sidebar-tabs" role="tablist" aria-label="编辑导航"><button role="tab" aria-selected={tab === 'scene'} onClick={() => setTab('scene')}>场景</button><button role="tab" aria-selected={tab === 'assets'} onClick={() => { setTab('assets'); if (!p.libraryOpen) p.onLibraryToggle() }}>物件库</button></div>
    {p.tools}
    {tab === 'scene' && <section className="bt-scene-tree" aria-label="场景层级">
      <div className="bt-sidebar-heading"><span><FolderOpen size={15} />{definition ? '战役场景' : '当前场景'}</span><small>{definition?.scenes.length ?? 1}</small></div>
      {definition ? <div className="bt-scene-list">{definition.scenes.map(scene => <button key={scene.id} className={scene.id === p.table.workspace?.sceneId ? 'active' : ''} onClick={() => p.onScene(scene.id)}><Selection size={14} /><span>{scene.title}</span></button>)}</div> : <div className="bt-current-scene"><Selection size={15} /><span>{p.table.name}</span><small>编辑稿</small></div>}
      <div className="bt-sidebar-heading"><span>场景物件</span><small>{p.objects.length}</small></div>
      <label className="bt-search bt-scene-search"><MagnifyingGlass size={13} /><input aria-label="筛选场景物件" placeholder="查找场景物件…" value={sceneQuery} onChange={e => setSceneQuery(e.target.value)} />{sceneQuery && <button aria-label="清空场景物件搜索" onClick={() => setSceneQuery('')}><X size={12} /></button>}</label>
      <div className="bt-hierarchy">{(['board', 'block', 'figurine', 'token', 'dice', 'deck', 'card'] as const).map(k => {
        const objects = p.objects.filter(o => o.kind === k && `${o.faceDown && o.kind === 'card' ? '背面卡牌' : o.name} ${names[k]}`.toLocaleLowerCase().includes(sceneQuery.toLocaleLowerCase())), Icon = icons[k]
        return objects.length > 0 && <details key={k} open={Boolean(sceneQuery) || k === 'figurine' || objects.length < 4}><summary><Icon size={14} /><span>{names[k]}</span><small>{objects.length}</small></summary>{objects.map(o => <button key={o.id} className={p.selectedId === o.id || p.selectedIds.includes(o.id) ? 'active' : ''} onClick={e => p.onSelect(o.id, e.shiftKey)}><i style={{ background: o.color }} /><span>{o.faceDown && o.kind === 'card' ? '背面卡牌' : o.name}</span>{o.locked && <LockSimple size={12} />}</button>)}</details>
      })}{!p.objects.length && <p className="bt-sidebar-empty">从物件库取用棋子、地图与道具，开始布置你的游戏。</p>}</div>
    </section>}
    <section className={`bt-asset-library ${tab === 'assets' ? 'expanded' : ''}`} aria-label="我的物件库">
      <div className="bt-sidebar-heading"><button className="bt-library-heading" aria-expanded={p.libraryOpen} onClick={p.onLibraryToggle}><Cube size={15} />我的物件库</button><small>{entries.length}</small></div>
      {p.libraryOpen && <><label className="bt-search"><MagnifyingGlass size={15} /><input aria-label="搜索桌面物件库" value={query} placeholder="搜索棋子、骰子、道具…" onChange={e => { setQuery(e.target.value); setPage(0) }} />{query && <button aria-label="清空物件搜索" onClick={() => { setQuery(''); setPage(0) }}><X size={13} /></button>}</label>
      <div className="bt-asset-categories">{(['all', 'figurine', 'dice', 'token', 'block', 'card', 'board', 'deck'] as const).map(k => <button key={k} aria-pressed={kind === k} onClick={() => { setKind(k); setPage(0) }}>{k === 'all' ? '全部' : names[k]}</button>)}</div>
      <div className="bt-asset-grid">{entries.slice(current * 12, current * 12 + 12).map(entry => { const Icon = icons[entry.kind]; return <button key={entry.id} aria-label={`放置 ${entry.name}`} disabled={p.objects.length >= 200} onClick={() => p.onSpawn(entry)}><span className="bt-asset-preview" style={{ '--asset-color': entry.template.color } as CSSProperties}>{entry.template.texture && entry.kind !== 'dice' ? <img src={entry.template.texture} alt="" loading="lazy" /> : <><Icon size={30} weight="duotone" />{entry.kind === 'dice' && <b>d{entry.template.sides}</b>}</>}</span><span className="bt-asset-name">{entry.name}</span></button> })}</div>
      {p.loading && <p className="bt-sidebar-empty" role="status">正在读取本机物件库…</p>}{p.error && <p className="bt-sidebar-empty" role="alert">{p.error}<button onClick={p.onRefresh}>重试</button></p>}{!p.loading && !p.error && !entries.length && <p className="bt-sidebar-empty">{query || kind !== 'all' ? '没有匹配的物件，试试其他分类。' : '创建自定义物件，并将它加入桌面库。'}</p>}
      {pages > 1 && <div className="bt-asset-pages"><button disabled={current === 0} aria-label="上一页物件" onClick={() => setPage(current - 1)}>‹</button><span>{current + 1} / {pages}</span><button disabled={current === pages - 1} aria-label="下一页物件" onClick={() => setPage(current + 1)}>›</button></div>}</>}
    </section>
    <footer className="bt-sidebar-footer"><div><button onClick={p.onManage}><UploadSimple size={14} />导入素材</button><button onClick={p.onManage}><Plus size={14} />自定义物件</button></div><small>棋子、标记与骰面均可自定义</small></footer>
  </aside>
}

export function EditorEventDock({ table, onStudio, onScene }: { table: TableSession; onStudio: () => void; onScene: (id: string) => void }) {
  const [collapsed, setCollapsed] = useState(false)
  const [tab, setTab] = useState<'story' | 'encounter' | 'ending'>('story')
  const definition = table.workspace?.definition
  const scene = definition?.scenes.find(s => s.id === table.workspace?.sceneId)
  const rpg = definition?.rpg, map = rpg?.maps[table.workspace?.sceneId?.replace('rpg-map-', '') ?? '']
  const choices = scene?.choices ?? []
  const sceneNodes = definition ? [scene, ...definition.scenes.filter(s => s.id !== scene?.id)].filter(s => s !== undefined).slice(0, 6) : []
  const encounters = map ? [...map.events, ...map.npcs].reduce((n, e) => n + battleNodes(e.script), 0) : 0
  return <section className={`bt-event-dock ${collapsed ? 'collapsed' : ''}`} aria-label="剧情与事件编排">
    <header><span><BookOpen size={16} />剧情与事件</span><div role="tablist" aria-label="事件编排分类">{(['story', 'encounter', 'ending'] as const).map((id, i) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setCollapsed(false) }}>{['剧情', '遭遇', '胜负条件'][i]}</button>)}</div><button className="bt-event-open" onClick={onStudio}><Plus size={14} />{definition ? '编辑事件' : '创建故事'}</button><button aria-label={collapsed ? '展开事件编排' : '收起事件编排'} onClick={() => setCollapsed(v => !v)}>{collapsed ? '⌃' : '⌄'}</button></header>
    {!collapsed && <div className="bt-event-content">{tab === 'story' ? <>{sceneNodes.length ? <div className="bt-flow-nodes">{sceneNodes.map(s => <div key={s.id} className="bt-flow-step"><button className={s.id === scene?.id ? 'active' : ''} onClick={() => onScene(s.id)}><small>{definition?.chapters.find(c => c.id === s.chapterId)?.title ?? '场景'}</small><b>{s.title}</b><span>{rpg ? `${rpg.maps[s.id.replace('rpg-map-', '')]?.events.length ?? 0} 个事件` : `${s.choices.length} 个行动分支`}</span></button></div>)}</div> : <div className="bt-event-empty"><BookOpen size={24} /><div><b>让你的桌面成为一个故事</b><p>编写世界与章节，为场景添加人物、交互和剧情分支。</p></div><button onClick={onStudio}>打开故事编辑器 <ArrowRight size={14} /></button></div>}</> : tab === 'encounter' ? <div className="bt-event-empty"><DiceFive size={26} /><div><b>{rpg ? `${encounters} 个场景遭遇` : `${choices.filter(c => c.check).length} 个检定行动`}</b><p>{rpg ? '在剧情工具中配置敌人、武功、骰组和战利品。' : '在故事编辑器中配置行动检定、难度和成功分支。'}</p></div><button onClick={onStudio}>编辑遭遇 <ArrowRight size={14} /></button></div> : <div className="bt-event-empty"><Selection size={25} /><div><b>{scene?.ending === 'victory' ? '当前场景：胜利结局' : scene?.ending === 'defeat' ? '当前场景：失败结局' : rpg ? '主线目标与队伍败北' : '定义你的游戏结局'}</b><p>{rpg ? `主线：收集 ${rpg.settings?.objectiveCount ?? 12} 枚${rpg.settings?.objectiveName ?? '星核'}。` : '设置胜利、失败场景及推进条件，让游戏自动提示结局。'}</p></div><button onClick={onStudio}>编辑胜负条件 <ArrowRight size={14} /></button></div>}</div>}
  </section>
}
