import type { TableSession } from '../lib/tabletop'
import './adventure-guide.css'

const statuses = { locked: '未解锁', active: '进行中', completed: '已完成', failed: '失败' }
interface Props { table: TableSession; onStory: () => void; onSelect: (id: string) => void; onAI: () => void; onWorkbench: () => void; onEdit: () => void }
export default function AdventureGuide({ table, onStory, onSelect, onAI, onWorkbench, onEdit }: Props) {
  const a = table.adventure!; const d = a.definition; const p = a.progress
  const scene = d.scenes.find(s => s.id === p.sceneId)!
  const chapter = d.chapters.find(c => c.id === scene.chapterId)
  return <section className="ag-guide" aria-label="战役进度"><div className="ag-heading"><small>{chapter?.title} · {p.visited.length}/{d.scenes.length} 场景已访问</small><h3>{scene.title}</h3><p>{d.title} · {d.revision ? `作品 v${d.revision}` : '草稿试玩'}</p></div>
    <div className="ag-goal"><small>{p.phase === 'complete' ? '战役结局' : '当前目标'}</small><b>{scene.goal || '选择一个剧情行动继续。'}</b></div>
    <button className="ag-primary" disabled={p.phase === 'rolling' || !!table.combat} onClick={onStory}>在桌面中央查看剧情</button>
    <button className="ag-primary" disabled={p.phase === 'rolling'} onClick={onWorkbench}>探索物件 · 背包 · 战术遭遇</button>
    <div className="ag-party" aria-label="队伍状态">{d.characters.filter(c => c.role === 'player').map(c => { const figure = table.objects.find(o => o.metadata.characterId === c.id); return <button key={c.id} style={{ borderLeftColor: c.color }} disabled={!figure} onClick={() => figure && onSelect(figure.id)}><span>{c.name}</span><b>{p.hp[c.id]}/{c.maxHp} HP</b></button> })}</div>
    {!!d.variables.length && <div className="ag-variables">{d.variables.map(v => <span key={v.id}>{v.name}<b>{p.variables[v.id]}</b></span>)}</div>}
    {d.quests.some(q => p.quests[q.id] !== 'locked') && <details className="ag-details"><summary>任务日志</summary>{d.quests.filter(q => p.quests[q.id] !== 'locked').map(q => <div className="ag-quest" key={q.id}><b>{q.title}</b><small>{statuses[p.quests[q.id]]}</small><p>{q.description}</p></div>)}</details>}
    <details className="ag-details"><summary>战役纪事 · {p.journal.length}</summary>{p.journal.slice(-40).reverse().map(j => <div className="ag-journal" key={j.id}><small>{d.scenes.find(s => s.id === j.sceneId)?.title}</small><p>{j.text}</p></div>)}</details>
    <details className="ag-details"><summary>世界背景</summary><p>{d.world.premise}</p><p>{d.world.history}</p><p>{d.world.factions}</p></details>
    <div className="ag-footer"><button onClick={onAI}>与 AI 主持讨论</button><button onClick={onEdit}>保存进度，返回编辑</button></div>
  </section>
}
