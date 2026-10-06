import type { TableSession } from './tabletop.ts'

export interface TableSurface { width: number; depth: number }
export const DEFAULT_SURFACE: TableSurface = { width: 30, depth: 22 }
export function validateTableSurface(value: unknown): TableSurface {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('场景板规格需为数据对象。')
  const v = value as Record<string, unknown>
  for (const key of ['width', 'depth']) if (typeof v[key] !== 'number' || !Number.isFinite(v[key]) || (v[key] as number) < 8 || (v[key] as number) > 80) throw new Error('场景板宽度和深度需为8至80桌面单位。')
  return { width: v.width as number, depth: v.depth as number }
}
export function tableSurface(table: Pick<TableSession, 'surface'>): TableSurface { return table.surface ?? DEFAULT_SURFACE }
export function tableBounds(table: Pick<TableSession, 'surface'>) {
  const { width, depth } = tableSurface(table)
  return { minX: -width / 2 + 1, maxX: width / 2 - 1, minZ: -depth / 2 + 1, maxZ: depth / 2 - 1, minY: 0, maxY: 30 }
}
