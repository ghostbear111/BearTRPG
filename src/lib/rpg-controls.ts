import type { TableSession } from './tabletop.ts'
import { rpgCoordinates, rpgEventVisible, type RpgAction } from './rpg-engine.ts'
import type { Interaction } from './object-play.ts'
import { playMoveAccessError } from './play-movement.ts'

/** Directions follow map coordinates, independently of the player's camera angle. */
export const RPG_DIRECTIONS = [
  { key: 'ArrowUp', code: 'KeyW', letter: 'W', label: '上', symbol: '↑', dx: 0, dy: -1 },
  { key: 'ArrowLeft', code: 'KeyA', letter: 'A', label: '左', symbol: '←', dx: -1, dy: 0 },
  { key: 'ArrowRight', code: 'KeyD', letter: 'D', label: '右', symbol: '→', dx: 1, dy: 0 },
  { key: 'ArrowDown', code: 'KeyS', letter: 'S', label: '下', symbol: '↓', dx: 0, dy: 1 },
] as const

export function rpgDirectionForKey(event: Pick<KeyboardEvent, 'key' | 'code'>) {
  return RPG_DIRECTIONS.find(d => d.key === event.code || d.code === event.code)
    ?? RPG_DIRECTIONS.find(d => d.key === event.key || d.letter.toLowerCase() === event.key.toLowerCase())
}

interface SpaceControl {
  label: string
  action?: RpgAction
  interaction?: { id: string; action: Interaction }
}

/** The hint and the keyboard share one resolver, so Space always triggers the displayed target. */
export function rpgSpaceControl(table: TableSession, selectedId: string | null, seat: string): SpaceControl {
  const adventure = table.adventure, db = adventure?.definition.rpg, p = adventure?.progress.rpg
  if (!adventure || !db || !p) return { label: '选择一个 RPG 开始游玩' }
  if (adventure.progress.phase === 'complete') return { label: '本局已结束' }
  if (table.combat) {
    if (table.combat.phase === 'complete') return { label: '结算遭遇，继续剧情', action: { type: 'finishBattle' } }
    if (table.combat.rpg) { const u = table.combat.rpg.units[table.combat.order[table.combat.turn]]; return { label: table.combat.phase === 'rolling' ? '等待真实骰子落定' : !u.roleId ? '敌方自动行动中' : u.acted ? '结束当前回合' : '选择武功卡与目标，空格确认掷骰' } }
    return { label: '通过战斗面板完成当前回合' }
  }
  if (p.pending?.type === 'talk') return { label: '继续剧情', action: { type: 'next' } }
  if (p.pending?.type === 'shop') return { label: '离开商店', action: { type: 'next' } }
  if (p.pending?.type === 'choice') return { label: '↑ ↓ 选择选项，Enter / 空格确认' }
  if (p.pending?.type === 'roll') return { label: '等待检定完成' }
  if (p.pending) return { label: '请先完成当前剧情' }
  if (p.frames.length) return { label: '继续剧情', action: { type: 'next' } }
  const map = db.maps[p.mapId]
  if (!map) return { label: '选择航线，前往场景' }
  const leader = table.objects.find(o => o.metadata.rpgLeader)
  const access = leader ? playMoveAccessError(table, leader.id, seat) : '队长不在当前场景'
  if (access) return { label: access }
  const nearby: { id: string; distance: number; control: SpaceControl }[] = []
  const distance = (x: number, y: number) => Math.abs(x - p.x) + Math.abs(y - p.y)
  map.npcs.forEach((npc, index) => {
    if ((!npc.hideIfFlag || !p.flags[npc.hideIfFlag]) && distance(npc.x, npc.y) <= 1) nearby.push({
      id: `rpg-npc-${p.mapId}-${index}`, distance: distance(npc.x, npc.y),
      control: { label: `与${npc.name}交谈`, action: { type: 'event', kind: 'npcs', index } },
    })
  })
  map.events.forEach((event, index) => {
    if (event.trigger === 'interact' && rpgEventVisible(event, p) && distance(event.x, event.y) <= 1) nearby.push({
      id: `rpg-event-${p.mapId}-${event.id}`, distance: distance(event.x, event.y),
      control: { label: `调查 · ${event.name ?? `交互标记 ${index + 1}`}`, action: { type: 'event', kind: 'events', index } },
    })
  })
  for (const object of table.objects) {
    if (object.metadata.rpgGenerated || ['inventory', 'hand'].includes(String(object.metadata.zone))) continue
    const cell = rpgCoordinates(map, object.position), steps = distance(cell.x, cell.y)
    if (steps > 1) continue
    let action: Interaction | undefined, label = ''
    if (object.metadata.behavior === 'open') {
      action = 'open'; label = `${object.metadata.opened ? '关闭' : '打开'}${object.name}`
    } else if (object.metadata.behavior === 'light') {
      action = 'light'; label = `${object.metadata.lit ? '熄灭' : '点燃'}${object.name}`
    } else if (object.metadata.behavior === 'switch') {
      action = 'switch'; label = `${object.metadata.activated ? '关闭' : '启动'}${object.name}`
    } else if (object.kind === 'card' && object.metadata.item) {
      action = 'collect'; label = `收集${object.name}`
    }
    if (action) nearby.push({ id: object.id, distance: steps, control: { label, interaction: { id: object.id, action } } })
  }
  nearby.sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId) || a.distance - b.distance)
  return nearby[0]?.control ?? { label: '靠近人物、金色事件或可交互物件' }
}
