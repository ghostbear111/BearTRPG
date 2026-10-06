import { addTableLog, updateObject, type TableSession, type Vec3 } from './tabletop.ts'
import { workspaceMode } from './table-workspace.ts'
import { health } from './object-play.ts'
import { readRelicGuide } from './relic-guide.ts'
import { objectMoveError, movementRules } from './object-movement.ts'

export function playMoveAccessError(table: TableSession, id: string, seat: string): string {
  if (workspaceMode(table) !== 'play') return '请在编辑模式布置物件。'
  const o = table.objects.find(item => item.id === id)
  if (!o) return '物件已不在当前场景。'
  if (table.combat) return '战斗中请通过当前角色的回合移动。'
  if (table.adventure?.definition.rpg) {
    const p = table.adventure.progress.rpg!
    if (p.pending || p.frames.length) return '请先完成当前剧情。'
    if (!o.metadata.rpgLeader) return '队友跟随队长；NPC与事件由剧情工具控制。'
  }
  if (readRelicGuide(table)) return '请通过游玩指引中的移动行动操作。'
  if (table.adventure && table.adventure.progress.phase !== 'scene') return table.adventure.progress.phase === 'rolling' ? '请等待剧情检定完成。' : '本局已结束。'
  const r = movementRules(o)
  if (r.mode === 'fixed') return o.kind === 'dice' ? '骰子请使用掷骰行动。' : '此物件在游戏中固定，不能移动。'
  if (r.seat && r.seat !== seat) return `此物件由${r.seat}操控。`
  if (['hand', 'inventory'].includes(String(o.metadata.zone))) return '请先把物件放到桌面。'
  if (o.kind === 'figurine' && health(o, table).hp === 0) return '倒下的角色不能移动。'
  return ''
}

export function applyPlayMove(table: TableSession, id: string, destination: Vec3, seat: string): TableSession {
  if (table.adventure?.definition.rpg) throw new Error('坐标RPG请使用场景剧情移动，以执行沿途事件。')
  const access = playMoveAccessError(table, id, seat); if (access) throw new Error(access)
  const o = table.objects.find(item => item.id === id)!
  const error = objectMoveError(table, o, destination, seat); if (error) throw new Error(error)
  return addTableLog(updateObject(table, id, { position: [...destination] }), `${seat}移动${o.name}至 (${destination[0].toFixed(2)}, ${destination[2].toFixed(2)})。`)
}
