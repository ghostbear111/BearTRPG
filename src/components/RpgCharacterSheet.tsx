import { useEffect, useRef, useState } from 'react'
import { dicePoolLabel } from '../lib/dice'
import type { TableSession } from '../lib/tabletop'
import type { RpgAction } from '../lib/rpg-engine'
import { AREA_NAMES, SCHOOL_NAMES, practiceNeed, requirementError, rpgStat, rpgSkillDice, skillValues } from '../lib/rpg-rules'
import { rpgCardForRole } from '../lib/rpg-character-cards'
import { characterRows, publicCharacter } from '../lib/tavern-presentation'
import './rpg-character-studio.css'

export default function RpgCharacterSheet({ table, onAction, openBag = 0, initialRole = 'hero' }: { table: TableSession; onAction: (a: RpgAction) => void; openBag?: number; initialRole?: string }) {
  const a = table.adventure!, p = a.progress.rpg!, db = a.definition.rpg!
  const [selected, setSelected] = useState(initialRole), role = p.recruited.includes(selected) ? selected : 'hero', c = p.characters?.[role]
  const bag = useRef<HTMLDetailsElement>(null)
  useEffect(() => { if (openBag && bag.current) { bag.current.open = true; bag.current.scrollIntoView({ block: 'nearest' }) } }, [openBag])
  if (!c) return <p className="rpg-muted">当前旧版遭遇结算后将升级角色成长档案。</p>
  const { card, archive } = rpgCardForRole(table, role), visible = publicCharacter(card, archive), rows = characterRows(card, archive)
  const busy = Boolean(table.combat || p.pending || p.frames.length || a.progress.phase !== 'scene')
  const manage = (action: 'equip' | 'unequip' | 'practice' | 'abandon' | 'use', item?: string, slot?: 'weapon' | 'armor') => onAction({ type: 'character', role, action, item, slot })
  return <section className="rpg-character-sheet"><h4>角色卡 · 装备与修炼</h4><select aria-label="查看角色成长档案" value={role} onChange={e => setSelected(e.target.value)}>{p.recruited.map(id => <option key={id} value={id}>{db.roles[id].name}</option>)}</select><div className="rpg-character-identity">{visible.portrait && <img src={visible.portrait} alt={`${visible.name}肖像`} />}<div><h3>{db.roles[role].name}</h3>{visible.title && <p>{visible.title}</p>}<small>Lv.{c.level} · {p.roster.includes(role) ? '出场' : '休整'}</small></div></div><p className="rpg-live-caption">对局档案 · 数值随生命、装备与成长实时同步</p>
    <dl className="rpg-card-values">{rows.map((r, i) => <div key={i}><dt>{r.label}</dt><dd>{r.value || '—'}</dd></div>)}</dl>
    {visible.profile.background && <details><summary>角色背景</summary><p className="rpg-card-background">{visible.profile.background}</p></details>}{visible.notes && <details><summary>公开备注</summary><p className="rpg-card-background">{visible.notes}</p></details>}
    <details><summary>属性与掌握的武功 · {c.magics.length}/10</summary><p className="rpg-muted">{(['fist', 'blade', 'cannon', 'psi', 'drone', 'medicine'] as const).map((key, i) => `${['格斗', '光刃', '重炮', '异能', '无人机', '医疗'][i]} ${rpgStat(db, c, key)}`).join(' · ')}{c.poison > 0 && ` · 中毒${c.poison}`}{c.hurt > 0 && ` · 受伤${c.hurt}`}</p>{c.magics.map(m => { const v = skillValues(db, c, m.id); return <article className="rpg-sheet-skill" key={m.id}><b>{v.magic.name} · 第{v.segment}段</b><small>{SCHOOL_NAMES[v.magic.school]} · {AREA_NAMES[v.area]}{v.range}格 · 威力{v.power} · {v.cost}能量</small><small className="dice-skill-pool">{dicePoolLabel(rpgSkillDice(db, m.id))}</small><small>熟练度 {m.lv}/999 · 每次使用增加1–2</small></article> })}{!c.magics.length && <p>尚未学习武功，战斗可使用普通攻击。</p>}</details>
    <div className="rpg-equipment-slots">{(['weapon', 'armor'] as const).map(slot => <article key={slot}><small>{slot === 'weapon' ? '武器槽' : '防具槽'}</small><b>{c[slot] ? db.items[c[slot]!].name : '未装备'}</b>{c[slot] && <><p className="rpg-muted">{String(db.items[c[slot]!].desc ?? '')}</p><button disabled={busy} onClick={() => manage('unequip', undefined, slot)}>卸下回背包</button></>}</article>)}</div>
    {c.practice ? <article className="rpg-practice-card"><b>修炼 · {db.items[c.practice].name}</b><progress value={c.practiceExp} max={practiceNeed(db.items[c.practice], c)} /><small>{c.practiceExp}/{practiceNeed(db.items[c.practice], c)} · 战胜遭遇后积累</small><button disabled={busy} onClick={() => manage('abandon')}>停止修炼，取回秘籍</button></article> : <p className="rpg-muted">从背包选择秘籍开始修炼；资质与专长决定能否学习。</p>}
    <details ref={bag}><summary>共享背包 · {Object.values(p.bag).reduce((n, v) => n + v, 0)}件</summary>{Object.entries(p.bag).map(([id, n]) => { const it = db.items[id], error = requirementError(db, c, it); return <article className="rpg-bag-card" key={id}><b>{it.name} ×{n}</b><p>{String(it.desc ?? '')}</p>{(it.type === 1 || it.type === 2) && <><small>{error || '装备加成计入角色与战斗属性'}</small><button disabled={busy || Boolean(error)} onClick={() => manage('equip', id)}>装备给{db.roles[role].name}</button></>}{it.type === 5 && <><small>{it.learn && db.magics[String(it.learn)] ? `习得${String((db.magics[String(it.learn)] as {name: string}).name)} · ` : ''}{error || `需${practiceNeed(it, c)}修炼经验`}</small><button disabled={busy || Boolean(error) || Boolean(c.practice) || !!it.learn && c.magics.some(m => m.id === it.learn) || Boolean(it.learn) && c.magics.length >= 10} onClick={() => manage('practice', id)}>开始修炼</button></>}{Boolean(it.healHP || it.healEP || it.cure || it.fullParty) && <button disabled={busy} onClick={() => manage('use', id)}>对{it.fullParty ? '全队' : db.roles[role].name}使用</button>}{it.type === 4 && <small>战斗时作为无人机行动卡使用</small>}</article> })}{!Object.keys(p.bag).length && <p>背包暂无物品。</p>}</details>
  </section>
}
