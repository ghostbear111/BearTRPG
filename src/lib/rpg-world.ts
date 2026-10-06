import { createObject, type TableObject, type Vec3 } from './tabletop.ts'
import type { AdventureProgress } from './adventure-schema'
import type { RpgDatabase } from './rpg-schema'

type World = RpgDatabase['world']
const textures = new Map<string, string>()

/** Fit author coordinates to a physical board, with a margin for edge destinations. */
export function rpgWorldLayout(world: World) {
  const scale = Math.min(28 / world.w, 20 / world.h)
  return { width: Math.max(16, world.w * scale), depth: Math.max(12, world.h * scale) }
}
export function rpgWorldPosition(world: World, x: number, y: number): Vec3 {
  const { width, depth } = rpgWorldLayout(world)
  return [(x / world.w - .5) * (width - 4), .28, (y / world.h - .5) * (depth - 4)]
}

function worldTexture(world: World, current?: string, visited: string[] = []) {
  if (typeof document === 'undefined') return ''
  const key = JSON.stringify([world, current, visited])
  const cached = textures.get(key); if (cached) return cached
  const canvas = document.createElement('canvas'), { width, depth } = rpgWorldLayout(world)
  canvas.width = 1600; canvas.height = Math.round(1600 * depth / width)
  const ctx = canvas.getContext('2d'); if (!ctx) return ''
  const w = canvas.width, h = canvas.height
  const cloud = ctx.createRadialGradient(w * .6, h * .38, 10, w * .55, h * .45, w * .65)
  cloud.addColorStop(0, '#253743'); cloud.addColorStop(.5, '#14222b'); cloud.addColorStop(1, '#0d141c')
  ctx.fillStyle = cloud; ctx.fillRect(0, 0, w, h)
  // Stable stars: refreshing the scene must not rearrange the atlas.
  for (let i = 0; i < 440; i++) {
    const x = ((i * 761 + i * i * 19) % 1597) / 1597 * w, y = ((i * 347 + i * i * 13) % 997) / 997 * h
    ctx.fillStyle = i % 8 ? '#afc6d244' : '#e9dccb99'; ctx.beginPath(); ctx.arc(x, y, i % 8 ? .8 : 1.6, 0, Math.PI * 2); ctx.fill()
  }
  ctx.strokeStyle = '#8fa7b210'; ctx.lineWidth = 1
  for (let x = w / 12; x < w; x += w / 12) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
  for (let y = h / 8; y < h; y += h / 8) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
  const pixel = (l: World['locations'][number]) => { const p = rpgWorldPosition(world, l.x, l.y); return [(p[0] / width + .5) * w, (p[2] / depth + .5) * h] }
  // A minimal connected constellation is decorative; travel still follows the RPG rules.
  const linked = new Set<number>(world.locations.length ? [0] : [])
  ctx.setLineDash([5, 9]); ctx.strokeStyle = '#baa57a55'; ctx.lineWidth = 1.5
  while (linked.size < world.locations.length) {
    let edge: [number, number] | undefined, nearest = Infinity
    for (const a of linked) for (let b = 0; b < world.locations.length; b++) if (!linked.has(b)) {
      const pa = pixel(world.locations[a]), pb = pixel(world.locations[b]), distance = Math.hypot(pa[0] - pb[0], pa[1] - pb[1])
      if (distance < nearest) { nearest = distance; edge = [a, b] }
    }
    if (!edge) break
    const a = pixel(world.locations[edge[0]]), b = pixel(world.locations[edge[1]])
    ctx.beginPath(); ctx.moveTo(...a as [number, number]); ctx.lineTo(...b as [number, number]); ctx.stroke(); linked.add(edge[1])
  }
  ctx.setLineDash([])
  for (const l of world.locations) {
    const [x, y] = pixel(l), active = l.id === current
    ctx.strokeStyle = active ? '#e7bd76' : '#8ca6b966'; ctx.lineWidth = active ? 3 : 1
    ctx.beginPath(); ctx.arc(x, y, active ? 27 : 18, 0, Math.PI * 2); ctx.stroke()
    if (visited.includes(`rpg-map-${l.id}`)) { ctx.fillStyle = '#d9c6a4'; ctx.beginPath(); ctx.arc(x + 22, y - 18, 3, 0, Math.PI * 2); ctx.fill() }
  }
  ctx.strokeStyle = '#ad946766'; ctx.lineWidth = 2; ctx.strokeRect(24, 24, w - 48, h - 48)
  ctx.fillStyle = '#d6c49f'; ctx.font = '500 27px "Microsoft YaHei", sans-serif'; ctx.fillText('世界地图', 52, 68)
  ctx.fillStyle = '#8398a5'; ctx.font = '12px sans-serif'; ctx.fillText('STELLAR ATLAS  /  FREE SECTOR', 54, 91)
  ctx.fillText('点击地点启航  ·  右键旋转  ·  滚轮缩放', 54, h - 48)
  const texture = canvas.toDataURL('image/png'); textures.set(key, texture)
  if (textures.size > 8) textures.delete(textures.keys().next().value!)
  return texture
}

export function rpgWorldObjects(db: RpgDatabase, progress?: AdventureProgress): TableObject[] {
  const { world } = db, size = rpgWorldLayout(world), visited = progress?.visited ?? []
  const current = progress?.rpg?.worldFrom ?? [...visited].reverse().find(id => id.startsWith('rpg-map-'))?.replace('rpg-map-', '')
  return [createObject('board', { id: 'rpg-world-board', name: '世界地图', locked: true, position: [0, .05, 0], color: '#263846', texture: worldTexture(world, current, visited), metadata: { ...size, height: .1, rpgGenerated: true, rpgWorld: true } }),
    ...world.locations.map((l, i) => createObject('token', { id: `rpg-destination-${l.id}`, name: l.name, description: l.desc ?? '', position: rpgWorldPosition(world, l.x, l.y), locked: true, scale: [.78, 1, .78], color: l.id === current ? '#d9b778' : (l.danger ?? 1) >= 4 ? '#b38a7c' : '#80aaa9', metadata: { rpgGenerated: true, rpgDestination: l.id, rpgDanger: l.danger ?? 1, rpgVisited: visited.includes(`rpg-map-${l.id}`), rpgCurrent: l.id === current, symbol: String(i + 1).padStart(2, '0'), moveMode: 'fixed' } }))]
}
