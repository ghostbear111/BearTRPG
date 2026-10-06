import type { TableSession, Vec3 } from './tabletop'
import { rpgMagic } from './rpg-rules'

export interface BattleImpact {
  key: string
  tableId: string
  actor: string
  origin: Vec3
  target: Vec3
  kind: 'strike' | 'support' | 'miss'
  hits: { id: string; position: Vec3; amount: number; kind: 'damage' | 'heal' | 'shield' | 'status' }[]
}

/** Presentation follows the accepted transaction; it never changes a character or collider. */
export function rpgBattleImpact(before: TableSession, after: TableSession): BattleImpact | undefined {
  const pending = before.combat?.pending, intent = before.combat?.rpg?.pending
  if (!pending || !intent || before.combat?.phase !== 'rolling' || after.combat?.phase === 'rolling' || !after.combat?.rpg) return
  const actor = before.objects.find(o => o.id === pending.attacker)
  if (!actor) return
  const hits: BattleImpact['hits'] = []
  for (const [id, unit] of Object.entries(before.combat.rpg!.units)) {
    const next = after.combat.rpg.units[id], object = after.objects.find(o => o.id === id)
    if (!next || !object) continue
    const amount = next.stats.hp - unit.stats.hp, shield = next.shield - unit.shield
    if (amount) hits.push({ id, position: object.position, amount: Math.abs(amount), kind: amount < 0 ? 'damage' : 'heal' })
    else if (shield > 0) hits.push({ id, position: object.position, amount: shield, kind: 'shield' })
    else if (next.stun > unit.stun) hits.push({ id, position: object.position, amount: 0, kind: 'status' })
  }
  const db = before.adventure?.definition.rpg
  const magic = intent.kind === 'skill' && db ? rpgMagic(db, intent.id) : undefined
  return { key: `${pending.generation}:${pending.request}`, tableId: before.id, actor: actor.id, origin: actor.position, target: [intent.x - 7, actor.position[1], intent.y - 7], kind: magic?.heal || magic?.shield ? 'support' : hits.some(h => h.kind === 'damage' || h.kind === 'status') ? 'strike' : 'miss', hits }
}
