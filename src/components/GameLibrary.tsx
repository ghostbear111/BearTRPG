import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, CheckCircle, DownloadSimple, FloppyDisk, NotePencil, Play, Plus, UploadSimple, X } from '@phosphor-icons/react'
import { getAdventure, importGameAdventure, listAdventures, type AdventureListing } from '../lib/adventure-library'
import { BUILTIN_GAMES, campaignForModule, campaignGroups, gameSessions, loadBuiltinAdventure, playableAdventure, type SavedCampaign } from '../lib/game-catalog'
import type { AdventureDefinition } from '../lib/adventure-schema'
import type { TableSession } from '../lib/tabletop'
import { importPortableSession } from '../lib/object-library'
import { exportGameModule, MAX_GAME_MODULE_BYTES, prepareGameModule } from '../lib/game-module'
import { RecordBatchToolbar, RecordDeleteAction, RecordSelectionCheckbox, RecordUndoNotice, useRecordSelection } from './RecordActions'
import './game-library.css'

interface Props {
  tables: TableSession[]; activeId: string; initialView: 'saves' | 'games'; onClose: () => void
  onAdventure: (definition: AdventureDefinition, moduleId?: string) => boolean
  onRelic: (moduleId: string) => Promise<boolean>; onTable: (table: TableSession, moduleId: string) => void
  onResume: (id: string, moduleId?: string) => void; onRename: (id: string, name: string, moduleId: string) => boolean
  onCreate: () => void; onEditAdventure: (definition: AdventureDefinition) => void; onEditTable: (table: TableSession) => void
  onDelete: (id: string) => boolean; onDeleteMany: (ids: string[]) => boolean
  deletedName?: string; deletedCount: number; onUndoDelete: () => void; recordError: string
}

const dateLabel = (time: number) => new Date(time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
const moduleOrigin = (id: string) => id.startsWith('builtin-') ? '内置模组' : id.startsWith('draft-') ? '编辑器作品' : `独立作品 / 旧版本 · ${id.replace(/^adventure-|^table-/, '').slice(0, 6)}`

export default function GameLibrary({ tables, activeId, initialView, onClose, onAdventure, onRelic, onTable, onResume, onRename, onCreate, onEditAdventure, onEditTable, onDelete, onDeleteMany, deletedName, deletedCount, onUndoDelete, recordError }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const starting = useRef(false)
  const [projects, setProjects] = useState<AdventureListing[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState(''), [busy, setBusy] = useState(''), [filter, setFilter] = useState('')
  const [notice, setNotice] = useState(''), [importedId, setImportedId] = useState('')
  const [view, setView] = useState(initialView)
  const [moduleFilter, setModuleFilter] = useState('')
  const [renaming, setRenaming] = useState(''), [saveName, setSaveName] = useState('')
  useEffect(() => { const el = dialog.current!; el.showModal(); return () => { if (el.open) el.close() } }, [])
  useEffect(() => {
    let cancelled = false
    void listAdventures().then(values => { if (!cancelled) setProjects(values) }).catch(e => { if (!cancelled) setLoadError(e.message) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])
  async function importModule(file: File) {
    if (starting.current) return
    starting.current = true; setBusy('import'); setError(''); setNotice('')
    try {
      if (file.size > MAX_GAME_MODULE_BYTES) throw new Error('游戏模组不能超过 5 MB。')
      const definition = await prepareGameModule(await file.text())
      const result = await importGameAdventure(definition)
      const saved = result.definition
      setProjects(values => [{ id: saved.id, revision: saved.revision, title: saved.title, summary: saved.summary.slice(0, 256), scenes: saved.scenes.length, chapters: saved.chapters.length, updatedAt: Date.now(), imported: true }, ...values.filter(value => value.id !== saved.id)])
      setImportedId(saved.id); setLoadError(''); setFilter(saved.title); setView('games')
      setNotice(result.created ? `《${saved.title}》已导入本机游戏库，可开始跑团或继续编辑。` : `《${saved.title}》已在游戏库中，已定位已有模组。`)
    } catch (e) { setError(e instanceof Error ? e.message : '游戏模组导入失败。') }
    finally { starting.current = false; setBusy('') }
  }
  async function exportModule(id: string, builtin: boolean) {
    if (starting.current) return
    starting.current = true; setBusy(`export-${id}`); setError(''); setNotice('')
    try {
      const definition = builtin ? await loadBuiltinAdventure(id) : await getAdventure(id)
      const text = await exportGameModule(definition)
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
      const link = document.createElement('a'); link.href = url; link.download = `${definition.title.replace(/[<>:"/\\|?*]/g, '_')}.adventure.json`
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000)
      setNotice(`《${definition.title}》模组已发起下载，可通过“导入游戏”加入游戏库。`)
    } catch (e) { setError(e instanceof Error ? e.message : '游戏模组导出失败。') }
    finally { starting.current = false; setBusy('') }
  }
  async function start(id: string, builtin: boolean, edit = false) {
    if (starting.current) return
    starting.current = true; setBusy(id); setError('')
    const moduleId = `${builtin ? 'builtin' : 'adventure'}-${id}`
    try {
      if (builtin && (id === 'adventure-workshop' || edit && id === 'relic-heist')) {
        const response = await fetch(id === 'relic-heist' ? '/games/relic-heist.realm.json' : '/games/adventure-workshop.realm.json')
        if (!response.ok) throw new Error('桌面读取失败。')
        const table = await importPortableSession(await response.json())
        edit ? onEditTable(table) : onTable(table, moduleId)
      } else if (builtin && id === 'relic-heist') {
        if (!await onRelic(moduleId)) throw new Error('引导局无法创建，请稍后重试。')
      } else {
        const definition = builtin ? await loadBuiltinAdventure(id) : edit ? await getAdventure(id) : playableAdventure(await getAdventure(id))
        if (edit) onEditAdventure(builtin ? { ...definition, id: crypto.randomUUID(), revision: 0 } : definition)
        else if (!onAdventure(definition, moduleId)) throw new Error('战役无法开局，请在创作工坊检查作品。')
      }
    } catch (e) { setError(e instanceof Error ? e.message : '游戏读取失败。') }
    finally { starting.current = false; setBusy('') }
  }
  const matches = (value: string) => value.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase())
  const allSaves = useMemo(() => gameSessions(tables), [tables])
  const allGroups = useMemo(() => campaignGroups(allSaves), [allSaves])
  useEffect(() => { if (moduleFilter && !allGroups.some(group => group.moduleId === moduleFilter)) setModuleFilter('') }, [allGroups, moduleFilter])
  const sessions = allSaves.filter(save => (!moduleFilter || save.moduleId === moduleFilter) && matches(`${save.title} ${save.saveName} ${save.detail} ${save.id}`))
  const groups = campaignGroups(sessions)
  const selection = useRecordSelection(sessions.map(save => save.id))
  const builtins = BUILTIN_GAMES.filter(game => matches(`${game.title} ${game.summary}`))
  const own = projects.filter(game => matches(`${game.title} ${game.summary}`))
  function showSaves(moduleId: string) { selection.clear(); setFilter(''); setModuleFilter(moduleId); setView('saves') }
  function saveRow(save: SavedCampaign) {
    const label = `存档 ${save.title} ${save.id.slice(0, 6)}`
    return <article className={`gl-save ${activeId === save.id ? 'active' : ''} ${selection.selectedIds.includes(save.id) ? 'selected' : ''}`} key={save.id} data-save-id={save.id}>
      <RecordSelectionCheckbox label={label} checked={selection.selectedIds.includes(save.id)} disabled={!!busy} onChange={() => selection.toggle(save.id)} />
      <div className="gl-save-content">
        {renaming === save.id ? <form className="gl-rename" onSubmit={e => { e.preventDefault(); if (onRename(save.id, saveName, save.moduleId)) setRenaming('') }}><input autoFocus aria-label="跑团存档名称" maxLength={80} value={saveName} onChange={e => setSaveName(e.target.value)} /><button disabled={!saveName.trim()} type="submit">保存名称</button><button type="button" onClick={() => setRenaming('')}>取消</button></form>
          : <h4>{save.saveName}{activeId === save.id && <em>当前跑团</em>}<button className="gl-rename-button" aria-label={`重命名${label}`} onClick={() => { setSaveName(save.saveName); setRenaming(save.id) }}><NotePencil size={14} /></button></h4>}
        <p>{save.detail}</p><small>保存于 {dateLabel(save.updated)} <span>· 创建于 {dateLabel(save.created)} · {save.id.slice(0, 6)}</span></small>
      </div>
      <button className="gl-continue" disabled={!!busy} aria-label={`继续${label}`} onClick={() => onResume(save.id, save.moduleId)}><Play size={14} weight="fill" />{save.complete ? '查看结局' : '继续跑团'}</button>
      <RecordDeleteAction label={label} disabled={!!busy} onDelete={() => onDelete(save.id)} />
    </article>
  }
  function moduleActions(id: string, builtin: boolean, title: string) {
    const moduleId = `${builtin ? 'builtin' : 'adventure'}-${id}`
    const save = campaignForModule(allSaves, moduleId)
    const related = allSaves.filter(s => s.title === title)
    const count = allSaves.filter(s => s.moduleId === moduleId).length
    const disabled = !!busy
    return <div className="gl-module-actions">
      {save ? <><button className="gl-continue" disabled={disabled} aria-label={`继续《${title}》的存档`} onClick={() => onResume(save.id, moduleId)}><Play size={14} weight="fill" />{save.complete ? '查看存档' : '继续跑团'}</button><button className="gl-edit" disabled={disabled} aria-label={`新开跑团《${title}》`} onClick={() => void start(id, builtin)}><Plus size={13} />新开跑团</button><button className="gl-saves-link" onClick={() => showSaves(moduleId)}>{count} 份存档</button></>
        : related.length ? <><button className="gl-continue" disabled={disabled} aria-label={`查看《${title}》的已有存档`} onClick={() => { selection.clear(); setModuleFilter(''); setFilter(title); setView('saves') }}><FloppyDisk size={14} />查看已有存档</button><button className="gl-edit" disabled={disabled} aria-label={`新开跑团《${title}》`} onClick={() => void start(id, builtin)}><Plus size={13} />新开跑团</button><small className="gl-related-note">{related.length} 份历史版本 / 同名作品存档</small></>
        : <button className="gl-continue" disabled={disabled} aria-label={`开始跑团《${title}》`} onClick={() => void start(id, builtin)}><Play size={14} weight="fill" />{busy === id ? '正在开局…' : '开始跑团'}</button>}
    </div>
  }
  return <dialog ref={dialog} className="gl-dialog" aria-labelledby="gl-title" onCancel={e => { e.preventDefault(); if (!busy) onClose() }}>
    <header className="gl-heading"><div><small>BEAR TAVERN · CAMPAIGNS</small><h2 id="gl-title">{view === 'saves' ? '跑团存档' : '游戏模组'}</h2><p>{view === 'saves' ? '接着上次的冒险，故事与桌面都在这里。' : '选择一个世界，开始或继续你的跑团。'}</p></div><button className="gl-close" aria-label="关闭游戏库" disabled={!!busy} onClick={onClose}><X size={20} /></button></header>
    <nav className="gl-tabs" aria-label="游戏库分类"><button aria-pressed={view === 'saves'} onClick={() => setView('saves')}><FloppyDisk size={17} />跑团存档 <span>{allSaves.length}</span></button><button aria-pressed={view === 'games'} onClick={() => setView('games')}><BookOpen size={17} />游戏模组</button></nav>
    <div className="gl-filters"><input aria-label="搜索游戏库" placeholder={view === 'saves' ? '搜索跑团名称、模组或场景…' : '搜索模组名称或故事…'} value={filter} onChange={e => setFilter(e.target.value)} />{view === 'saves' ? <select aria-label="筛选存档模组" value={moduleFilter} onChange={e => { setModuleFilter(e.target.value); selection.clear() }}><option value="">所有模组</option>{allGroups.map(group => <option key={group.moduleId} value={group.moduleId}>{group.title} · {moduleOrigin(group.moduleId)}（{group.saves.length}）</option>)}</select> : <button className="gl-import" disabled={!!busy || loading} onClick={() => importInput.current?.click()}><UploadSimple size={16} />{busy === 'import' ? '正在导入…' : '导入游戏'}</button>}</div>
    <input ref={importInput} type="file" accept=".json,application/json" hidden aria-label="游戏模组文件" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void importModule(file) }} />
    <div className="gl-body">
      {error && <p className="gl-error" role="alert">{error}</p>}
      {notice && <p className="gl-notice" role="status"><CheckCircle size={18} /><span>{notice}</span></p>}
      {busy && <p className="gl-operation" role="status">{busy === 'import' ? '正在检查模组、导入图片并保存到本机…' : busy.startsWith('export-') ? '正在打包剧情、规则与图片…' : '正在读取游戏…'}</p>}
      {view === 'saves' ? <section className="gl-section gl-campaign-section" aria-label="跑团存档列表">
        <div className="gl-section-intro"><p><span className="gl-save-dot" />本机自动保存 · {allSaves.length} 份存档 / {allGroups.length} 个模组</p><button className="gl-saves-link" onClick={() => { setFilter(''); setView('games') }}><Plus size={13} />开启新的冒险</button></div>
        {recordError && <p className="record-error" role="alert">{recordError}</p>}
        {deletedCount > 0 && <RecordUndoNotice name={deletedName} count={deletedCount} onUndo={onUndoDelete} />}
        {allSaves.length > 0 && <RecordBatchToolbar label="跑团存档" total={sessions.length} selection={selection} onDelete={onDeleteMany} disabled={!!busy} filtered={!!filter.trim() || !!moduleFilter} />}
        {groups.length ? groups.map(group => <section className="gl-save-group" key={group.moduleId} aria-label={`${group.title}的存档`}><div className="gl-group-heading"><div><h3>{group.title}</h3><small>{moduleOrigin(group.moduleId)}</small></div><span>{group.saves.length} 份存档</span></div>{group.saves.slice(0, 2).map(saveRow)}{group.saves.length > 2 && <details className="gl-older-saves"><summary>查看其余 {group.saves.length - 2} 份存档</summary>{group.saves.slice(2).map(saveRow)}</details>}</section>)
          : <div className="gl-empty-saves"><FloppyDisk size={32} /><h3>{allSaves.length ? '没有匹配的存档' : '你的冒险，从这里开始'}</h3><p>{allSaves.length ? '尝试其他名称或选择“所有模组”。' : '先选一个游戏模组开始跑团，之后直接在这里继续。'}</p><button onClick={() => { setFilter(''); setModuleFilter(''); if (!allSaves.length) setView('games') }}>{allSaves.length ? '清除筛选' : '选择游戏模组'}</button></div>}
        <p className="gl-storage-note">进度自动保存在当前浏览器。继续存档会恢复同一场跑团；“新开跑团”才会创建独立进度。</p>
      </section> : <>
        <details className="gl-import-help"><summary>游戏模组怎么导入？</summary><p>选择 .adventure.json 游戏模组或 RPG .db.json 内容包（最多 5 MB）。导入后保存在本机游戏库，点击开始跑团才会创建存档；同一内容重复导入会定位已有模组。</p><p>模组包含剧情、地图、角色、规则及图片。音乐和 3D 模型沿用原资源地址，由模组作者提供资源。</p></details>
        {builtins.length > 0 && <section className="gl-section" aria-label="内置游戏"><h3>内置模组</h3><p>有存档时优先继续，需要从头开始再新开跑团。</p><div className="gl-grid">{builtins.map(game => <article className={`gl-card ${game.id === 'starfall' ? 'gl-starfall' : ''}`} key={game.id}><small>{game.category}</small><h4>{game.title}</h4><p>{game.summary}</p>{moduleActions(game.id, true, game.title)}<div className="gl-secondary-actions"><button className="gl-edit gl-editor-link" disabled={!!busy} onClick={() => void start(game.id, true, true)} aria-label={`编辑《${game.title}》`}>在编辑器打开</button>{game.kind === 'adventure' && <button className="gl-edit gl-editor-link" disabled={!!busy} onClick={() => void exportModule(game.id, true)} aria-label={`导出模组《${game.title}》`}><DownloadSimple size={13} />导出模组</button>}</div></article>)}</div>{!builtins.length && <p className="gl-empty">没有匹配的内置模组。</p>}</section>}
        <section className="gl-section" aria-label="我的作品"><h3>本机模组与作品</h3><p>导入的模组和编辑器作品都在这里。继续存档沿用开局时的作品版本。</p>{loading ? <p className="gl-empty" role="status">正在读取本机作品…</p> : loadError ? <p className="gl-error" role="alert">本机作品暂时无法读取：{loadError}。内置游戏和存档仍可使用。</p> : own.length ? <div className="gl-own">{own.map(game => <article className={`gl-project ${importedId === game.id ? 'gl-imported' : ''}`} key={game.id} data-module-id={game.id}><div><h4>{game.title}{game.imported && <span className="gl-source">已导入</span>}</h4><small>作品 v{game.revision} · {game.chapters} 章节 · {game.scenes} 场景</small></div>{moduleActions(game.id, false, game.title)}<div className="gl-project-tools"><button className="gl-edit" disabled={!!busy} onClick={() => void start(game.id, false, true)} aria-label={`编辑作品《${game.title}》`}>编辑</button><button className="gl-edit" disabled={!!busy} onClick={() => void exportModule(game.id, false)} aria-label={`导出作品《${game.title}》`}><DownloadSimple size={14} />导出</button></div></article>)}</div> : <p className="gl-empty">{projects.length ? '没有匹配的作品。' : '还没有本机模组，可以导入游戏或从创作向导开始。'}</p>}</section>
      </>}
    </div>
    <footer className="gl-footer"><button disabled={!!busy} onClick={onCreate}><NotePencil size={16} />创作自己的游戏</button><button disabled={!!busy} onClick={onClose}>返回桌面</button></footer>
  </dialog>
}
