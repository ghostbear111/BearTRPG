import { addTableLog, validateTableObject, validateTableSession, type TableObject, type TableSession, type Vec3 } from './tabletop.ts'
import { objectDimensions } from './object-movement.ts'
import { workspaceMode } from './table-workspace.ts'
import { readRelicGuide } from './relic-guide.ts'

export function uprightFigureAccessError(table: TableSession, id: string, seat: string): string {
  const object = table.objects.find(o => o.id === id)
  if (!object) return '棋子已不在当前场景。'
  if (object.kind !== 'figurine') return '请选择需要扶正的棋子。'
  if (['hand', 'inventory'].includes(String(object.metadata.zone))) return '请先把棋子放到桌面。'
  if (table.combat?.phase === 'rolling' || table.adventure?.progress.phase === 'rolling' || readRelicGuide(table)?.phase === 'rolling') return '请等待检定完成，再扶正棋子。'
  if (workspaceMode(table) === 'play' && object.metadata.moveSeat && object.metadata.moveSeat !== seat) return `此棋子由${object.metadata.moveSeat}操控。`
  return ''
}

// Intersect a vertical line with the same rotated cuboid used by PropColliders.
// Using all three authored angles also handles a tilted board or platform.
function surfaceHeight(support: TableObject, position: Vec3): number | null {
  const [x, y, z] = support.rotation
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z)
  const axes: Vec3[] = [
    [cy * cz, sx * sy * cz + cx * sz, -cx * sy * cz + sx * sz],
    [-cy * sz, -sx * sy * sz + cx * cz, cx * sy * sz + sx * cz],
    [sy, -sx * cy, cx * cy],
  ]
  const dimensions = objectDimensions(support)
  const dx = position[0] - support.position[0], dz = position[2] - support.position[2]
  let bottom = -Infinity, top = Infinity
  for (let i = 0; i < 3; i++) {
    const axis = axes[i], half = dimensions[i] * support.scale[i] / 2
    const offset = dx * axis[0] - support.position[1] * axis[1] + dz * axis[2]
    if (Math.abs(axis[1]) < 1e-8) {
      if (Math.abs(offset) > half) return null
    } else {
      const a = (-half - offset) / axis[1], b = (half - offset) / axis[1]
      bottom = Math.max(bottom, Math.min(a, b)); top = Math.min(top, Math.max(a, b))
      if (bottom > top) return null
    }
  }
  return Number.isFinite(top) ? top : null
}

/** Pose recovery is separate from movement and health; locked figures stay locked. */
export function uprightFigure(table: TableSession, id: string, seat: string): TableSession {
  const error = uprightFigureAccessError(table, id, seat)
  if (error) throw new Error(error)
  const object = table.objects.find(o => o.id === id)!
  // Figurines use a 1.4-unit cylinder regardless of optional visual dimensions.
  const halfHeight = .7 * object.scale[1]
  let floor = 0
  for (const support of table.objects) {
    if (!['board', 'block'].includes(support.kind) || ['hand', 'inventory'].includes(String(support.metadata.zone)) || ['door', 'gate'].includes(String(support.metadata.model))) continue
    const top = surfaceHeight(support, object.position)
    // Never lift a piece onto scenery or a ceiling above its current placement.
    if (top !== null && top >= floor && top <= object.position[1] + halfHeight + .01) floor = top
  }
  const corrected = validateTableObject({ ...object, position: [object.position[0], floor + halfHeight + .004, object.position[2]], rotation: [0, object.rotation[1], 0] })
  return validateTableSession(addTableLog({ ...table, objects: table.objects.map(o => o.id === id ? corrected : o) }, `扶正了「${object.name}」。`))
}
