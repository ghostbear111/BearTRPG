import { useState } from 'react'
import type { TableSession } from '../lib/tabletop'
import { rpgEventVisible, type RpgAction } from '../lib/rpg-engine'
import type { CombatAction } from '../lib/combat'
import type { Interaction } from '../lib/object-play'
import PlayWorkbench from './PlayWorkbench'
import { RPG_DIRECTIONS, rpgSpaceControl } from '../lib/rpg-controls'
import { playMoveAccessError } from '../lib/play-movement'
import './rpg-tools.css'
import RpgCharacterSheet from './RpgCharacterSheet'
import { health } from '../lib/object-play'
import { rpgStat } from '../lib/rpg-rules'
import { rpgStoryKey } from '../lib/rpg-story-presentation'

interface Props { table: TableSession; seat: string; selectedId: string | null; moving: boolean; combatMoving: boolean; onAction: (action: RpgAction) => void; onMove: () => void; onSelect: (id: string) => void; onCombatMove: () => void; onCombat: (a: CombatAction) => void; onAttack: (id: string) => void; onInteract: (id: string, a: Interaction, target?: string) => void; onEdit: () => void; onRestart: () => void }
export default function RpgGuide(p: Props) {
  const a = p.table.adventure!, db = a.definition.rpg!, state = a.progress.rpg!, map = db.maps[state.mapId]
  const pending = state.pending
  const [bagOpen, setBagOpen] = useState(false)
  const complete = a.progress.phase === 'complete', busy = !!pending || !!p.table.combat || !!state.frames.length || complete
  const leader = p.table.objects.find(o => o.metadata.rpgLeader)
  const moveError = leader ? playMoveAccessError(p.table, leader.id, p.seat) : '队长不在当前场景。'
  const moveDisabled = busy || Boolean(moveError)
  const spaceControl = rpgSpaceControl(p.table, p.selectedId, p.seat)
  const centralStory = Boolean(rpgStoryKey(p.table))
  return <div className="rpg-guide">
    <header><small>坐标剧情 RPG</small><h3>{a.definition.title}</h3><p>{map?.name ?? '星图航线'}{map && ` · (${state.x}, ${state.y})`}</p></header>
    <div className="rpg-stats"><span>{db.settings?.objectiveName ?? '星核'} <b>{state.cores.length}/{db.settings?.objectiveCount ?? 12}</b></span><span>信用点 <b>{state.money}</b></span><span>声望 <b>{state.fame}</b></span><span>倾向 <b>{state.morality}</b></span></div>
    {!complete && !centralStory && map && <p className="rpg-key-hint"><kbd>空格</kbd><span>{spaceControl.label}</span></p>}
    {!complete && p.table.combat && !p.table.combat.rpg && <PlayWorkbench scripted table={p.table} seat={p.seat} moving={p.combatMoving} onMoveMode={p.onCombatMove} onSelect={p.onSelect} onInteract={p.onInteract} onCombat={p.onCombat} onAttack={p.onAttack} />}
    {!complete && !centralStory && !p.table.combat && map && <section><h4>探索场景</h4><p className="rpg-muted">蓝色标记：经过触发；金色标记与人物：走到相邻格后交互。每次最多走4格，触发事件会停下。</p><button className={p.moving ? 'rpg-primary' : ''} disabled={moveDisabled} onClick={p.onMove}>{p.moving ? '取消移动' : '在场景板上移动队长'}</button><div className="rpg-direction-controls"><h4>队长移动</h4><div className="rpg-directions" role="group" aria-label="上下左右移动队长">{RPG_DIRECTIONS.map(d => <button key={d.key} className={`rpg-direction-${d.key}`} aria-label={`向${d.label}移动队长一格`} aria-keyshortcuts={`${d.letter} ${d.key}`} title={`向${d.label}移动一格 · 键盘 ${d.letter} / ${d.symbol}`} disabled={moveDisabled} onClick={() => p.onAction({ type: 'move', x: state.x + d.dx, y: state.y + d.dy })}>{d.symbol}</button>)}<span className="rpg-direction-center" aria-hidden="true">移动</span></div><p className="rpg-muted">W/A/S/D 或 ↑ ↓ ← → 移动，按住可连续行走；空格交互。方向以地图为准。附近有多个对象时，优先交互已选中的对象。{moveError && !busy && ` ${moveError}`}</p></div>
      <h4>附近可交互</h4>{map.npcs.filter(n => !n.hideIfFlag || !state.flags[n.hideIfFlag]).map(n => ({ n, index: map.npcs.indexOf(n) })).filter(({ n }) => Math.abs(n.x - state.x) + Math.abs(n.y - state.y) <= 1).map(({ n, index }) => <button key={`npc-${index}`} disabled={busy} onClick={() => p.onAction({ type: 'event', kind: 'npcs', index })}>与{n.name}交谈</button>)}{map.events.map((e, index) => ({ e, index })).filter(({ e }) => e.trigger === 'interact' && rpgEventVisible(e, state) && Math.abs(e.x - state.x) + Math.abs(e.y - state.y) <= 1).map(({ e, index }) => <button key={e.id} disabled={busy} onClick={() => p.onAction({ type: 'event', kind: 'events', index })}>调查 · {e.name ?? `交互标记 ${index + 1}`}</button>)}<button disabled={busy} onClick={() => p.onAction({ type: 'world' })}>查看星图，前往其他地点</button>
    </section>}
    {!complete && !centralStory && !map && <section><h4>世界地图</h4><p className="rpg-muted">航线地点已摆在桌面星图上。点击地点名称启航，悬停可查看简介与危险等级；金色标记是出发地。右键旋转，滚轮缩放。</p></section>}
    <section><h4>队伍</h4><div className="rpg-party">{state.roster.map(id => { const role = db.roles[id], char = a.definition.characters.find(c => c.id === `rpg_${id}`)!, object = p.table.objects.find(o => o.id === `rpg-actor-${id}`), c = state.characters?.[id], vital = object ? health(object, p.table) : { hp: c?.hp ?? a.progress.hp[char.id], max: c ? rpgStat(db, c, 'maxHP') : char.maxHp }; return <button key={id} onClick={() => p.onSelect(`rpg-actor-${id}`)} disabled={!object}>{role.name}<small>{vital.hp}/{vital.max} 生命</small></button> })}</div></section>
    {state.recruited.length > 1 && <details><summary>队友出场与休整 · 最多六人</summary>{state.recruited.filter(id => id !== 'hero').map(id => <div className="rpg-shop-row" key={id}><span>{db.roles[id].name}</span><button disabled={busy} onClick={() => p.onAction({ type: 'party', role: id, active: !state.roster.includes(id) })}>{state.roster.includes(id) ? '休整' : '加入队伍'}</button></div>)}</details>}
    {state.characters ? <details className="bt-character-fold"><summary>角色卡 · 装备与修炼</summary><RpgCharacterSheet table={p.table} onAction={p.onAction} /></details> : <section><button className="rpg-section-toggle" onClick={() => setBagOpen(!bagOpen)}>旧版背包</button>{bagOpen && <p>当前旧版遭遇结束后升级角色档案，物品保留。</p>}</section>}
    <details><summary>冒险纪事</summary>{a.progress.journal.slice(-20).reverse().map(j => <p className="rpg-muted" key={j.id}>{j.text}</p>)}</details>
  </div>
}
