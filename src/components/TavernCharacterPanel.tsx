import { boundCard, characterRows, liveCharacterCard, presentationOf, publicCharacter } from '../lib/tavern-presentation'
import type { TableObject, TableSession } from '../lib/tabletop'
import './tavern-integration.css'
export default function TavernCharacterPanel({ table, selected, onSelect, onEdit }: { table: TableSession; selected?: TableObject | null; onSelect: (id: string) => void; onEdit?: () => void }) {
  const p = presentationOf(table); if (!p?.archive.cards.length) return null
  const raw = boundCard(table, selected) ?? p.archive.cards.find(c => c.status === 'active'); if (!raw) return null
  const card = liveCharacterCard(table, raw)
  const visible = publicCharacter(card, p.archive), rows = characterRows(card, p.archive)
  const live = selected && boundCard(table, selected)?.id === card.id && table.adventure?.definition.rpg && selected.metadata.rpgRoleId ? selected : undefined
  return <section className="bt-character-panel"><header><small>熊酒馆角色卡 · {selected && boundCard(table, selected) ? '已关联所选物件' : '角色档案'}</small>{onEdit && <button onClick={onEdit}>编辑档案</button>}</header><div className="bt-character-identity">{visible.portrait && <img src={visible.portrait} alt={`${visible.name}肖像`} />}<div><h3>{visible.name || '未命名角色'}</h3><p>{visible.title || visible.profile.occupation || visible.sheet?.schema.name || '冒险者'}</p></div></div>
    {live && <p className="bt-character-live">对局生命 <b>{String(live.metadata.hp)} / {String(live.metadata.vitality)}</b></p>}
    <dl>{rows.map((r, i) => <div key={i}><dt>{r.label}</dt><dd>{r.value || '—'}</dd></div>)}</dl>
    {visible.profile.background && <details><summary>角色背景</summary><p>{visible.profile.background}</p></details>}{visible.inventory && <details><summary>装备与物品</summary><p>{visible.inventory}</p></details>}{visible.notes && <details><summary>公开备注</summary><p>{visible.notes}</p></details>}
    <div className="bt-character-cast">{p.archive.cards.filter(c => c.status === 'active').map(c => { const o = table.objects.find(o => boundCard(table, o)?.id === c.id); return <button key={c.id} disabled={!o} aria-pressed={c.id === card.id} onClick={() => o && onSelect(o.id)}>{c.name || '未命名角色'}</button> })}</div>
  </section>
}
