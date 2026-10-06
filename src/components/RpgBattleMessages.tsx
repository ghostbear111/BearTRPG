import { DiceSix, Play } from '@phosphor-icons/react'
import type { TableSession } from '../lib/tabletop'
import { AREA_NAMES, rpgSkillDice, rpgStat, skillValues } from '../lib/rpg-rules'
import { diceFaceLabel, dicePoolLabel } from '../lib/dice'
import { rpgAreaCells, rpgBattleTargetError, type RpgBattlePlan } from '../lib/rpg-battle'

function Resource({ label, value, max, kind }: { label: string; value: number; max: number; kind: string }) {
  return <div className={`rpg-hud-resource rpg-resource-${kind}`}>
    <span><span>{label}</span><b>{value}<small>/{max}</small></b></span>
    <div className="rpg-resource-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max || 1} aria-valuenow={value}><i style={{ width: `${Math.max(0, Math.min(100, max ? value / max * 100 : 0))}%` }} /></div>
  </div>
}

export default function RpgBattleMessages({ table, plan }: { table: TableSession; plan: RpgBattlePlan | null }) {
  const s = table.combat!, r = s.rpg!, db = table.adventure!.definition.rpg!, id = s.order[s.turn], unit = r.units[id], actor = table.objects.find(o => o.id === id)!
  let instruction = ''
  if (s.phase === 'complete') instruction = table.adventure!.progress.phase === 'complete' ? '旅程已结束，在中央选择接下来的操作。' : '在桌面中央确认遭遇结果，继续剧情。'
  else if (s.phase === 'rolling') instruction = '等待整组骰子落定 · 可取消投骰'
  else if (!unit.roleId) instruction = '敌方正在行动 · 无需操作'
  else if (unit.acted) instruction = '本回合行动已完成 → 结束回合 · 空格'
  else if (plan?.kind === 'move') instruction = '点击绿色格子移动；WASD / 方向键逐格移动，Esc取消。'
  else if (plan?.kind === 'skill' || plan?.kind === 'drone') {
    const skill = plan.kind === 'skill' ? skillValues(db, unit.stats, plan.id!) : undefined, item = plan.kind === 'drone' ? db.items[plan.id!] : undefined
    instruction = skill ? `${skill.magic.name} · ${dicePoolLabel(rpgSkillDice(db, plan.id!))} · 威力${skill.power} · ${AREA_NAMES[skill.area]}${skill.range}格 · ${skill.cost}能量 / 3体力${skill.magic.desc ? ` · ${skill.magic.desc}` : ''}` : `${item?.name} · 2d6 · 射程${String(item?.dist ?? 1)}格 · 消耗1件 / 5体力`
    if (plan.target) {
      const error = rpgBattleTargetError(table, plan.kind, plan.id!, plan.target.x, plan.target.y)
      const cells = rpgAreaCells(skill?.area ?? 'point', skill?.range ?? 1, unit.x, unit.y, plan.target.x, plan.target.y)
      const targets = Object.entries(r.units).filter(([, u]) => u.stats.hp > 0 && cells.some(c => c.x === u.x && c.y === u.y) && (skill?.magic.heal || skill?.magic.shield ? Boolean(u.roleId) === Boolean(unit.roleId) : Boolean(u.roleId) !== Boolean(unit.roleId))).map(([key]) => table.objects.find(o => o.id === key)!.name)
      instruction = `${error || `目标：${targets.join('、') || '无有效目标'} · 空格确认掷骰`} ｜ ${instruction}`
    } else instruction = `点击棋子或绿色格选目标，橙色为影响范围 ｜ ${instruction}`
  }
  const rolls = r.pending?.rolls
  const rollSummary = rolls ? `${r.pending?.pool ? dicePoolLabel(r.pending.pool) : '检定'} · ${rolls.filter(v => v.value !== undefined).length}/${rolls.length}已落定 · ${rolls.map(roll => roll.value === undefined ? '…' : diceFaceLabel(roll, roll.value)).join(' / ')}` : r.lastRoll ? `上次投骰 ${r.lastRoll.faces.map(f => `${f.symbol}${f.label}`).join(' / ')} · ${r.lastRoll.mode === 'success' ? `${r.lastRoll.successes}成功${r.lastRoll.missed ? ' · 落空' : ''}` : r.lastRoll.mode === 'sum' ? `合计${r.lastRoll.total}${r.lastRoll.bonus ? ` · 加成${r.lastRoll.bonus}` : ''}` : `威力×${(.9 + (r.lastRoll.effectiveD20 - 1) / 19 * .2).toFixed(2)}`}` : ''
  const next = s.order.slice(s.turn + 1).concat(s.order.slice(0, s.turn)).find(key => r.units[key].stats.hp > 0)
  const state = `${s.phase === 'complete' ? `${s.winner}获胜` : `第${s.round}轮 · ${unit.roleId ? '玩家' : '敌方'}回合 · ${actor.name}`} · 生命${unit.stats.hp}/${rpgStat(db, unit.stats, 'maxHP')} · 能量${unit.stats.ep}/${rpgStat(db, unit.stats, 'maxEP')} · 体力${unit.stats.pp}/${unit.stats.maxPP}${unit.stats.poison ? ` · 毒${unit.stats.poison}` : ''}${unit.stats.hurt ? ` · 伤${unit.stats.hurt}` : ''}${unit.guarded ? ' · 防御' : ''}${unit.shield ? ` · 盾${unit.shield}` : ''}${s.phase !== 'complete' && next ? ` · 下一位${table.objects.find(o => o.id === next)?.name}` : ''}`
  const conditions = [unit.stats.poison && `中毒 ${unit.stats.poison}`, unit.stats.hurt && `受伤 ${unit.stats.hurt}`, unit.guarded && '防御中', unit.shield && `护盾 ${unit.shield}`].filter(Boolean).join(' · ')
  return <div className="rpg-battle-messages">
    <div className="rpg-hud-state" title={state}>
      <div className="rpg-hud-identity"><span className="rpg-round-chip">第 {s.round} 轮</span><span className={`rpg-turn-chip ${!unit.roleId ? 'enemy' : ''}`}>{s.phase === 'complete' ? `${s.winner}获胜` : unit.roleId ? '玩家回合' : '敌方回合'}</span><b className="rpg-hud-actor" title={actor.name}>{actor.name}</b></div>
      <div className="rpg-hud-resources">
        <Resource label="生命" value={unit.stats.hp} max={rpgStat(db, unit.stats, 'maxHP')} kind="hp" />
        <Resource label="能量" value={unit.stats.ep} max={rpgStat(db, unit.stats, 'maxEP')} kind="ep" />
        <Resource label="体力" value={unit.stats.pp} max={unit.stats.maxPP} kind="pp" />
      </div>
      {s.phase !== 'complete' && next && <span className="rpg-hud-next" title={table.objects.find(o => o.id === next)?.name}><small>下一位</small>{table.objects.find(o => o.id === next)?.name}</span>}
    </div>
    <div className="rpg-message-feedback">
      <div className="rpg-event-line"><Play size={13} weight="fill" aria-hidden="true" /><p className="rpg-message-event" aria-live="polite" title={s.message}>{s.message}</p>{conditions && <span className="rpg-condition-summary" title={conditions}>{conditions}</span>}</div>
      <div className="rpg-message-guidance"><span className="rpg-message-detail" title={instruction || '选择武功 → 点击目标 → 空格掷骰 · WASD / 方向键移动'}>{instruction || '选择武功 → 点击目标 → 空格掷骰 · WASD / 方向键移动'}</span>{rollSummary && <span className="rpg-roll-summary" title={rollSummary} aria-live={rolls ? 'polite' : 'off'}><DiceSix size={14} aria-hidden="true" />{rollSummary}</span>}</div>
    </div>
  </div>
}
