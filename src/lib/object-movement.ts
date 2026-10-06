import type { ObjectKind, TableObject, TableSession, Vec3 } from './tabletop.ts'
import { tableBounds } from './table-surface.ts'

export type MoveMode = 'fixed' | 'grid' | 'free'
export const MOVE_SEATS = ['', '玩家1', '玩家2', '玩家3', '玩家4'] as const

/** Authored rules survive library templates, scene exports and saved games. */
export function validateMovementMetadata(m: TableObject['metadata']) {
  if (m.moveMode !== undefined && !['fixed', 'grid', 'free'].includes(String(m.moveMode))) throw new Error('游戏移动方式无效。')
  for (const [key, min, max] of [['moveRange', .5, 12], ['moveStep', .5, 4]] as const) {
    if (m[key] !== undefined && (typeof m[key] !== 'number' || !Number.isFinite(m[key]) || m[key] < min || m[key] > max)) throw new Error(`${key === 'moveRange' ? '单次移动距离' : '移动格距'}需为 ${min} 至 ${max} 的数值。`)
  }
  if (m.moveSeat !== undefined && !MOVE_SEATS.includes(m.moveSeat as typeof MOVE_SEATS[number])) throw new Error('移动操控玩家无效。')
  if (m.movePathCheck !== undefined && typeof m.movePathCheck !== 'boolean') throw new Error('移动路线检查需为布尔值。')
}

export function movementRules(object: Pick<TableObject, 'kind' | 'locked' | 'metadata'>) {
  const m = object.metadata
  const fallback: MoveMode = object.kind === 'figurine' ? 'grid' : ['card', 'token'].includes(object.kind) ? 'free' : 'fixed'
  return {
    mode: object.locked || object.kind === 'dice' ? 'fixed' as MoveMode : (m.moveMode ?? fallback) as MoveMode,
    range: Number(m.moveRange ?? 4), step: Number(m.moveStep ?? 1), seat: String(m.moveSeat ?? ''),
    pathCheck: Boolean(m.movePathCheck ?? object.kind === 'figurine'),
  }
}

export function objectDimensions(object: TableObject): Vec3 {
  const defaults: Record<ObjectKind, Vec3> = { board: [10, .1, 8], block: [1.8, 1.2, .5], card: [1.35, .035, 1.95], deck: [1.4, .26, 2], token: [.9, .18, .9], figurine: [1, 1.4, 1], dice: [1.2, 1.2, 1.2] }
  return ['width', 'height', 'depth'].map((key, i) => {
    const value = Number(object.metadata[key])
    return Number.isFinite(value) && value > 0 ? Math.max(.025, Math.min(i === 1 ? 50 : 80, value)) : defaults[object.kind][i]
  }) as Vec3
}

export const planarDistance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2])
const onTable = (o: TableObject) => !['hand', 'inventory'].includes(String(o.metadata.zone))
const walkThrough = (o: TableObject) => o.kind === 'board' || ['bridge', 'stairs', 'torch', 'brazier', 'lever', 'crystal', 'gate'].includes(String(o.metadata.model)) || o.metadata.model === 'door' && Boolean(o.metadata.opened)

function inside(o: TableObject, p: Vec3, padding = 0) {
  const [w, , d] = objectDimensions(o), x = p[0] - o.position[0], z = p[2] - o.position[2]
  const cos = Math.cos(o.rotation[1]), sin = Math.sin(o.rotation[1])
  return Math.abs(x * cos - z * sin) < w * o.scale[0] / 2 + padding && Math.abs(x * sin + z * cos) < d * o.scale[2] / 2 + padding
}

/** Validate before committing: rejected destinations never reach the physics world. */
export function objectMoveError(table: TableSession, actor: TableObject, p: Vec3, seat?: string, checkGrid = true): string {
  const rule = movementRules(actor)
  if (rule.mode === 'fixed') return actor.kind === 'dice' ? '骰子请使用掷骰行动。' : '此物件在游戏中固定，不能移动。'
  if (!onTable(actor)) return '请先把物件放到桌面。'
  if (rule.seat && seat !== undefined && rule.seat !== seat) return `此物件由${rule.seat}操控。`
  if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)) return '移动坐标无效。'
  const distance = planarDistance(actor.position, p)
  if (distance < .01) return '请选择新的目的地。'
  if (distance > rule.range + .001) return `每次移动最多${rule.range}桌面单位。`
  if (Math.abs(p[1] - actor.position[1]) > .001) return '游戏移动不能改变物件高度。'
  const [w, , d] = objectDimensions(actor), cos = Math.abs(Math.cos(actor.rotation[1])), sin = Math.abs(Math.sin(actor.rotation[1]))
  const halfX = (w * actor.scale[0] * cos + d * actor.scale[2] * sin) / 2
  const halfZ = (w * actor.scale[0] * sin + d * actor.scale[2] * cos) / 2
  const bounds = tableBounds(table)
  if (p[0] - halfX < bounds.minX || p[0] + halfX > bounds.maxX || p[2] - halfZ < bounds.minZ || p[2] + halfZ > bounds.maxZ) return '目的地超出场景板安全范围。'
  if (checkGrid && rule.mode === 'grid' && [0, 2].some(i => Math.abs((p[i] - actor.position[i]) / rule.step - Math.round((p[i] - actor.position[i]) / rule.step)) > .001)) return `请按${rule.step}桌面单位的格距移动。`
  const figures = table.objects.filter(o => o.id !== actor.id && o.kind === 'figurine' && onTable(o))
  const radius = actor.kind === 'figurine' || actor.kind === 'token' ? Math.max(w * actor.scale[0], d * actor.scale[2]) / 2 : 0
  if (radius && figures.some(o => planarDistance(o.position, p) < radius + .5 * Math.max(o.scale[0], o.scale[2]) - .01)) return '目的地被角色占据。'
  const obstacles = table.objects.filter(o => o.id !== actor.id && onTable(o) && o.kind === 'block' && !walkThrough(o))
  const padding = actor.kind === 'figurine' ? radius * .6 : radius
  if (obstacles.some(o => inside(o, p, padding))) return '目的地被场景物件阻挡。'
  if (rule.pathCheck) {
    // Skip a pre-existing overlap so older editor layouts can move out of it.
    const blockers = obstacles.filter(o => !inside(o, actor.position, padding))
    const blockingFigures = figures.filter(o => planarDistance(o.position, actor.position) >= radius + .5 * Math.max(o.scale[0], o.scale[2]) - .01)
    for (let t = .1; t < distance; t += .1) {
      const ratio = t / distance
      const point: Vec3 = [actor.position[0] + (p[0] - actor.position[0]) * ratio, actor.position[1], actor.position[2] + (p[2] - actor.position[2]) * ratio]
      if (blockers.some(o => inside(o, point, padding)) || radius && blockingFigures.some(o => planarDistance(o.position, point) < radius + .5 * Math.max(o.scale[0], o.scale[2]) - .01)) return '路线被场景物件或角色阻挡，请绕行或先打开门。'
    }
  }
  return ''
}

export function objectMoveOptions(table: TableSession, actor: TableObject, seat?: string) {
  const rule = movementRules(actor)
  if (rule.mode !== 'grid') return []
  const cells: Array<{ cell: string; position: Vec3; size: number }> = []
  const n = Math.floor(rule.range / rule.step)
  for (let dx = -n; dx <= n; dx++) for (let dz = -n; dz <= n; dz++) {
    const p: Vec3 = [Number((actor.position[0] + dx * rule.step).toFixed(4)), actor.position[1], Number((actor.position[2] + dz * rule.step).toFixed(4))]
    if (!objectMoveError(table, actor, p, seat)) cells.push({ cell: `${p[0]},${p[2]}`, position: [p[0], Math.max(.12, actor.position[1] - objectDimensions(actor)[1] * actor.scale[1] / 2 + .03), p[2]], size: rule.step * .88 })
  }
  return cells
}

/** Pieces stay fixed in play. Dice retain physical throws but never lift on click. */
export function stableDuringPlay(object: TableObject) { return object.kind !== 'dice' || object.locked }
