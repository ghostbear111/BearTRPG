import { addTableLog, createObject, updateObject, validateTableSession, type TableSession, type Vec3 } from './tabletop.ts'
import { changeHealth, health } from './object-play.ts'
import { objectMoveError, objectMoveOptions } from './object-movement.ts'

export type CombatAction = { type: 'start'; ids: string[] } | { type: 'move'; position: Vec3 } | { type: 'defend' | 'recover' | 'next' | 'stop' | 'cancel' } | { type: 'attack'; target: string; request: number; generation: number } | { type: 'resolve'; dieId: string; value: number; request: number; generation: number }
export function combatDistance(a: Vec3, b: Vec3) { return Math.hypot(a[0] - b[0], a[2] - b[2]) }
export function attackRange(model: unknown) { return ['ranger', 'mage', 'cleric'].includes(String(model)) ? 6 : 1.8 }
export function combatMoveError(table: TableSession, p: Vec3, seat?: string): string {
  const s = table.combat, actor = table.objects.find(o => o.id === s?.order[s.turn]); if (!s || !actor || s.phase !== 'turn' || s.ap < 1 || health(actor, table).hp === 0) return '当前不能移动。'
  const ruleError = objectMoveError(table, actor, p, seat); if (ruleError) return ruleError
  return ''
}
export function combatMoveOptions(table: TableSession, seat?: string) {
  const s = table.combat, actor = table.objects.find(o => o.id === s?.order[s.turn]); if (!actor) return []
  return objectMoveOptions(table, { ...actor, metadata: { ...actor.metadata, moveMode: actor.metadata.moveMode === 'free' ? 'grid' : actor.metadata.moveMode ?? 'grid' } }, seat).filter(cell => !combatMoveError(table, [cell.position[0], actor.position[1], cell.position[2]], seat))
}
export function combatWinner(table: TableSession) { const s = table.combat; if (!s) return table; const alive = [...new Set(s.order.map(id => table.objects.find(o => o.id === id)!).filter(o => health(o, table).hp > 0).map(o => String(o.metadata.team)))]; return alive.length <= 1 ? { ...table, combat: { ...s, phase: 'complete' as const, pending: undefined, ...(s.rpg ? { rpg: { ...s.rpg, pending: undefined } } : {}), winner: alive[0] ?? '无人', message: alive.length ? `${alive[0]}获胜！` : '所有角色倒下，战斗结束。' } } : table }
export function recoverCombat(table: TableSession) { return table.combat?.phase === 'rolling' ? { ...table, combat: { ...table.combat, phase: 'turn' as const, pending: undefined, ...(table.combat.rpg ? { rpg: { ...table.combat.rpg, pending: undefined } } : {}), message: '未完成的攻击已取消，行动与资源保留，可以重新选择。' } } : table }
export function applyCombat(table: TableSession, action: CombatAction, seat?: string): TableSession {
  if (table.combat?.rpg) throw new Error('武功跑团遭遇请使用桌面下方的技能卡与行动栏。')
  let next = table
  if (action.type === 'start') {
    if (table.adventure?.definition.rpg) throw new Error('RPG 遭遇由剧情事件开始，请在剧情工具配置敌人。')
    if (table.combat && table.combat.phase !== 'complete') throw new Error('战斗已经开始。')
    if (table.adventure && table.adventure.progress.phase !== 'scene') throw new Error('请先完成当前剧情检定。')
    const ids = [...new Set(action.ids)]; if (ids.length < 2 || ids.length > 24) throw new Error('请选择2至24个参战角色。')
    for (const id of ids) {
      const actor = next.objects.find(o => o.id === id && o.kind === 'figurine' && !o.locked); if (!actor) throw new Error('参战角色不存在或已锁定。')
      const h = health(actor, table); if (h.hp === 0) throw new Error('倒下的角色无法参战。')
      next = updateObject(next, id, { metadata: { ...actor.metadata, hp: h.hp, vitality: h.max, focus: 3, guarded: false, team: String(actor.metadata.team ?? '队伍') } })
    }
    if (new Set(ids.map(id => next.objects.find(o => o.id === id)!.metadata.team)).size < 2) throw new Error('至少需要两个不同阵营，请在角色行为面板设置阵营。')
    next = { ...next, combat: { version: 1, order: ids, turn: 0, round: 1, ap: 2, phase: 'turn', message: '战斗开始。每回合2行动点：移动、攻击、防御或恢复。' } }
  } else {
    const s = table.combat; if (!s) throw new Error('尚未开始战斗。')
    if (action.type === 'stop') { if (s.phase === 'rolling') throw new Error('请先取消或完成检定。'); const { combat: _combat, ...rest } = table; next = addTableLog(rest, '已收起战斗，角色生命保留。'); return validateTableSession(next) }
    if (action.type === 'cancel') return validateTableSession(recoverCombat(table))
    if (s.phase === 'complete') throw new Error('战斗已经结束，请收起战斗后重新布置。')
    if (s.phase === 'rolling' && action.type !== 'resolve') throw new Error('请等待物理骰子落定，或取消后重掷。')
    const actor = table.objects.find(o => o.id === s.order[s.turn])!
    const spend = (message: string) => ({ ...s, ap: s.ap - 1, phase: 'turn' as const, pending: undefined, message })
    if (action.type === 'resolve') {
      const p = s.pending
      if (!p || p.dieId !== action.dieId || p.request !== action.request || p.generation !== action.generation) return table
      if (!Number.isSafeInteger(action.value) || action.value < 1 || action.value > 20) throw new Error('真实骰点无效。')
      const target = table.objects.find(o => o.id === p.target)!
      const hit = action.value + 2 >= 10; const damage = hit ? target.metadata.guarded ? 1 : 2 : 0
      next = damage ? changeHealth(next, target.id, -damage) : next
      next = { ...next, combat: spend(`${actor.name}攻击${target.name}：d20 ${action.value} + 2 = ${action.value + 2}，${hit ? `命中，造成${damage}点伤害` : '未命中'}。`) }
    } else if (action.type === 'next') {
      let turn = s.turn, round = s.round
      for (let i = 0; i < s.order.length; i++) { turn = (turn + 1) % s.order.length; if (turn === 0) round++; const target = next.objects.find(o => o.id === s.order[turn])!; if (health(target, next).hp <= 0) continue; next = updateObject(next, target.id, { metadata: { ...target.metadata, guarded: false } }); if (target.metadata.poisoned) next = changeHealth(next, target.id, -1); if (health(next.objects.find(o => o.id === target.id)!, next).hp > 0) break }
      next = { ...next, combat: { ...s, turn, round, ap: 2, message: `轮到${next.objects.find(o => o.id === s.order[turn])!.name}，获得2行动点。` } }
    } else {
      if (s.ap < 1 || health(actor, table).hp === 0) throw new Error('行动点不足，请结束当前角色回合。')
      if (action.type === 'move') {
        const p = action.position
        const error = combatMoveError(table, p, seat); if (error) throw new Error(error)
        next = updateObject(next, actor.id, { position: [p[0], actor.position[1], p[2]] }); next = { ...next, combat: spend(`${actor.name}移动至(${p[0].toFixed(1)}, ${p[2].toFixed(1)})。`) }
      } else if (action.type === 'defend') { next = updateObject(next, actor.id, { metadata: { ...actor.metadata, guarded: true } }); next = { ...next, combat: spend(`${actor.name}进入防御，直到下次回合开始，受到的攻击伤害减少1。`) } }
      else if (action.type === 'recover') {
        if (Number(actor.metadata.focus) < 1 || health(actor, table).hp >= health(actor, table).max) throw new Error('生命已满或专注不足。')
        next = changeHealth(next, actor.id, 2); const healed = next.objects.find(o => o.id === actor.id)!
        next = updateObject(next, actor.id, { metadata: { ...healed.metadata, focus: Number(actor.metadata.focus) - 1 } }); next = { ...next, combat: spend(`${actor.name}消耗1专注，恢复2点生命。`) }
      } else if (action.type === 'attack') {
        const target = table.objects.find(o => o.id === action.target && s.order.includes(o.id))
        if (!target || target.metadata.team === actor.metadata.team || health(target, table).hp === 0) throw new Error('请选择存活的敌方角色。')
        if (combatDistance(actor.position, target.position) > attackRange(actor.metadata.model) + .01) throw new Error('目标超出攻击范围，请先移动。')
        let die = table.objects.find(o => o.kind === 'dice' && o.sides === 20 && !o.diceFaces && !o.locked && o.scale.every(n => n === o.scale[0]))
        if (!die) { die = createObject('dice', { name: '战斗检定 d20', sides: 20, position: [9, .7, 0] }); next = { ...next, objects: [...next.objects, die] } }
        next = updateObject(next, die.id, { value: 0 }); next = { ...next, physics: { gravity: true }, combat: { ...s, phase: 'rolling', message: `${actor.name}攻击${target.name}，等待真实d20落定。`, pending: { attacker: actor.id, target: target.id, dieId: die.id, request: action.request, generation: action.generation } } }
      }
    }
  }
  const actionMessage = next.combat?.message ?? '战斗状态更新。'
  next = combatWinner(next)
  next = addTableLog(next, actionMessage)
  if (next.combat?.message !== actionMessage) next = addTableLog(next, next.combat?.message ?? '战斗结束。')
  return validateTableSession(next)
}
