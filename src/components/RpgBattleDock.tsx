import { useEffect, useRef, useState } from 'react'
import { Bed, Cards, CaretLeft, CaretRight, CheckCircle, Crosshair, DiceSix, FirstAid, Flag, Flask, HandFist, PersonSimpleWalk, Robot, Shield, Sparkle, Sword, X } from '@phosphor-icons/react'
import type { TableSession } from '../lib/tabletop'
import { AREA_NAMES, BASIC_SKILL, rpgSkillDice, skillValues } from '../lib/rpg-rules'
import { dicePoolLabel } from '../lib/dice'
import { rpgBattleTargetError, rpgBattleMoveOptions, type RpgBattleAction, type RpgBattlePlan } from '../lib/rpg-battle'

interface Props { table: TableSession; seat: string; plan: RpgBattlePlan | null; onPlan: (plan: RpgBattlePlan | null) => void; onAction: (action: RpgBattleAction) => void; onFinish: () => void; onCharacter: () => void }

export default function RpgBattleDock({ table, seat, plan, onPlan, onAction, onFinish, onCharacter }: Props) {
  const s = table.combat!, r = s.rpg!, db = table.adventure!.definition.rpg!, p = table.adventure!.progress.rpg!, id = s.order[s.turn], unit = r.units[id], actor = table.objects.find(o => o.id === id)!
  const [itemsOpen, setItemsOpen] = useState(false), [itemTarget, setItemTarget] = useState(''), [medicine, setMedicine] = useState(''), [page, setPage] = useState(0), [slots, setSlots] = useState(2)
  const hand = useRef<HTMLDivElement>(null)
  const controlled = !actor.metadata.moveSeat || actor.metadata.moveSeat === seat
  const disabled = s.phase !== 'turn' || !unit.roleId || !controlled || unit.acted
  const medicines = Object.entries(p.bag).filter(([key]) => db.items[key].healHP || db.items[key].healEP || db.items[key].cure || db.items[key].fullParty)
  const targets = Object.entries(r.units).filter(([, u]) => u.roleId && u.stats.hp > 0)
  const target = targets.some(([key]) => key === itemTarget) ? itemTarget : targets.some(([key]) => key === id) ? id : targets[0]?.[0]
  const medicineId = medicines.some(([key]) => key === medicine) ? medicine : medicines[0]?.[0]
  const cards = [BASIC_SKILL, ...unit.stats.magics.map(m => m.id)].map(key => {
    const skill = skillValues(db, unit.stats, key), dice = rpgSkillDice(db, key)
    const pool = dice.dice.map(d => d.faces || d.name ? `${d.count}×${d.name || `符号d${d.sides}`}` : `${d.count}d${d.sides}`).join(' + ')
    const Icon = key === BASIC_SKILL ? Sword : skill.magic.heal ? FirstAid : skill.magic.shield ? Shield : [HandFist, Sword, Crosshair, Sparkle, Robot, FirstAid][skill.magic.school] ?? HandFist
    const reason = unit.stats.ep < skill.cost ? '能量不足' : unit.stats.pp < 20 ? '体力不足，请休息' : ''
    return { kind: 'skill' as const, id: key, name: skill.magic.name, disabled: disabled || Boolean(reason), Icon, pool, range: `${skill.range} 格`, cost: `${skill.cost} 能量`, title: `${skill.magic.name} · ${dicePoolLabel(dice)} · ${AREA_NAMES[skill.area]}${skill.range}格 · 威力${skill.power} · ${skill.cost}能量 / 3体力${reason ? ` · ${reason}` : ''}` }
  })
  const choices = [...cards, ...Object.entries(p.bag).filter(([key]) => db.items[key].type === 4).map(([key, n]) => ({ kind: 'drone' as const, id: key, name: db.items[key].name, disabled: disabled || unit.stats.pp < 10, Icon: Robot, pool: '2×d6', range: `${String(db.items[key].dist ?? 1)} 格`, cost: `×${n}`, title: `${db.items[key].name} ×${n} · 消耗1件 / 5体力` }))]
  const selectedIndex = choices.findIndex(card => plan?.kind === card.kind && plan.id === card.id)
  const pages = Math.max(1, Math.ceil(choices.length / slots)), currentPage = Math.min(page, pages - 1)
  const attackPlan = plan?.kind === 'skill' || plan?.kind === 'drone' ? { ...plan, kind: plan.kind } : null
  const error = attackPlan?.target ? rpgBattleTargetError(table, attackPlan.kind, attackPlan.id!, attackPlan.target.x, attackPlan.target.y) : ''
  const moveAvailable = rpgBattleMoveOptions(table).length > 0
  const confirmHint = !controlled ? '等待当前玩家' : unit.acted ? '本回合行动已完成' : plan?.kind === 'move' ? '点击绿色格子移动' : !attackPlan ? '选择武功' : !attackPlan.target ? '请选择目标' : error ? '请调整目标' : '目标已就绪'

  useEffect(() => { setPage(0); setItemsOpen(false) }, [id])
  useEffect(() => {
    if (!hand.current) return
    const observer = new ResizeObserver(entries => setSlots(Math.max(1, Math.min(4, Math.floor((entries[0].contentRect.width - 60) / 210)))))
    observer.observe(hand.current)
    return () => observer.disconnect()
  }, [id, s.phase, itemsOpen])
  useEffect(() => { if (selectedIndex >= 0) setPage(Math.floor(selectedIndex / slots)) }, [slots, selectedIndex, id])

  if (s.phase === 'complete') return <section className="rpg-battle-dock rpg-compact rpg-dock-state" aria-label="遭遇结算"><button className="rpg-primary" onClick={onFinish}>{s.winner === '队伍' ? '领取战利品，继续剧情' : '结束遭遇'}<kbd>空格</kbd></button></section>
  if (s.phase === 'rolling') return <section className="rpg-battle-dock rpg-compact rpg-dock-state" aria-label="正在检定"><button onClick={() => onAction({ type: 'cancel' })}><X size={16} aria-hidden="true" />取消投骰</button></section>
  if (!unit.roleId) return null

  return <section className="rpg-battle-dock rpg-compact" aria-label="桌面跑团战斗行动">
    <div className="rpg-compact-actions">
      <b className="rpg-dock-label">{itemsOpen ? '药品' : '武功'}</b>
      <div className="rpg-dock-tools"><button onClick={onCharacter}><Cards size={18} aria-hidden="true" />角色卡</button>
        <button className={plan?.kind === 'move' ? 'active' : ''} aria-pressed={plan?.kind === 'move'} disabled={disabled || !moveAvailable} onClick={() => { setItemsOpen(false); onPlan(plan?.kind === 'move' ? null : { kind: 'move' }) }}><PersonSimpleWalk size={18} aria-hidden="true" />移动</button>
        <button disabled={disabled} title="防御：受到武功伤害减半，直到下次回合" onClick={() => onAction({ type: 'defend' })}><Shield size={18} aria-hidden="true" />防御</button>
        <button disabled={disabled} title="恢复体力、生命与能量，降低受伤值" onClick={() => onAction({ type: 'rest' })}><Bed size={18} aria-hidden="true" />休息</button>
        <button className={itemsOpen ? 'active' : ''} disabled={disabled || !medicines.length} aria-expanded={itemsOpen} onClick={() => setItemsOpen(v => !v)}><Flask size={18} aria-hidden="true" />药品</button>
      </div>
      <button className="rpg-end-turn" disabled={s.phase !== 'turn' || !controlled} onClick={() => onAction({ type: 'next' })}><Flag size={17} aria-hidden="true" />结束回合{unit.acted && <kbd>空格</kbd>}</button>
    </div>
    {itemsOpen ? <div className="rpg-compact-medicine">
      <label>用药目标<select value={target} onChange={e => setItemTarget(e.target.value)}>{targets.map(([key]) => <option key={key} value={key}>{table.objects.find(o => o.id === key)!.name}</option>)}</select></label>
      <label>选择药品<select value={medicineId} onChange={e => setMedicine(e.target.value)}>{medicines.map(([key, n]) => <option key={key} value={key}>{db.items[key].name} ×{n}</option>)}</select></label>
      <button className="rpg-primary" disabled={disabled || unit.stats.pp < 10 || !target || !medicineId} onClick={() => { onAction({ type: 'item', id: medicineId!, target: target! }); setItemsOpen(false) }}>使用药品</button>
      <button onClick={() => setItemsOpen(false)}>返回武功</button>
    </div> : <div className="rpg-dock-body">
      <div className="rpg-skill-hand rpg-hand-paged" ref={hand} aria-label="当前角色武功">
        {pages > 1 && <button className="rpg-hand-arrow" aria-label="上一页武功" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><CaretLeft size={18} aria-hidden="true" /></button>}
        <div className="rpg-hand-buttons" style={{ gridTemplateColumns: `repeat(${Math.min(slots, choices.length - currentPage * slots)}, minmax(0, 1fr))` }}>
          {choices.slice(currentPage * slots, (currentPage + 1) * slots).map(card => {
            const active = plan?.kind === card.kind && plan.id === card.id
            return <button key={`${card.kind}:${card.id}`} className={`rpg-skill-card ${active ? 'active' : ''}`} title={card.title} aria-pressed={active} disabled={card.disabled} onClick={() => onPlan(active ? null : { kind: card.kind, id: card.id })}>
              <span className="rpg-card-art" aria-hidden="true"><card.Icon size={32} weight="duotone" /></span>
              <span className="rpg-card-copy"><b>{card.name}</b><span className="rpg-card-facts"><span title={card.pool}><DiceSix size={13} aria-hidden="true" />{card.pool}</span><span>{card.range}</span><span>{card.cost}</span></span></span>
              {active && <CheckCircle className="rpg-card-check" size={18} weight="fill" aria-hidden="true" />}
            </button>
          })}
        </div>
        {pages > 1 && <button className="rpg-hand-arrow" aria-label={`下一页武功，当前${currentPage + 1}/${pages}页`} disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}><CaretRight size={18} aria-hidden="true" /></button>}
      </div>
      <div className="rpg-compact-confirm">
        <div className="rpg-confirm-status"><span title={error || confirmHint}>{confirmHint}</span>{plan && <button className="rpg-plan-cancel" aria-label="取消行动" title="取消行动 · Esc" onClick={() => onPlan(null)}><X size={15} aria-hidden="true" /></button>}</div>
        <button className="rpg-primary" disabled={disabled || !attackPlan?.target || Boolean(error)} onClick={() => { if (attackPlan?.target) onAction({ type: attackPlan.kind as 'skill' | 'drone', id: attackPlan.id!, ...attackPlan.target }) }}>确认掷骰<kbd>空格</kbd></button>
        {pages > 1 && <small className="rpg-hand-page" aria-live="polite">武功 {currentPage + 1} / {pages}</small>}
      </div>
    </div>}
  </section>
}
