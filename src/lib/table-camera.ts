import type { TableObject, TableSession, Vec3 } from './tabletop'

export type TableView = 'perspective' | 'top'
export interface CameraPose { position: Vec3; target: Vec3 }
export interface CameraMemory { mode: TableView; perspective?: CameraPose; top?: CameraPose; follow?: boolean }
export type CameraMemories = Record<string, CameraMemory>
export const CAMERA_MEMORY_KEY = 'bear-trpg-editor-camera-v1'
type CameraStorage = Pick<Storage, 'getItem' | 'setItem'>
export const GAME_CAMERA_DIRECTION: Vec3 = [0, 18, 22]

function validCameraScope(id: string): boolean {
  const base = id.replace(/:rpg-world$/, '')
  return /^[a-zA-Z0-9_-]{1,120}$/.test(base) && !['__proto__', 'constructor', 'prototype'].includes(base)
}

export function preferredTableView(table: TableSession, memories: CameraMemories): TableView {
  const world = table.adventure?.progress.rpg?.mapId === 'world'
  return memories[world ? `${table.id}:rpg-world` : table.id]?.mode ?? (world ? 'top' : 'perspective')
}

/** The camera follows the protagonist, never an enemy or an incidental selection. */
export function cameraProtagonist(table: TableSession, seat: string): TableObject | undefined {
  if (table.workspace?.kind === 'draft' || table.adventure?.progress.rpg?.mapId === 'world') return
  const figures = table.objects.filter(o => o.kind === 'figurine' && !['hand', 'inventory'].includes(String(o.metadata.zone)))
  if (table.adventure?.definition.rpg) return figures.find(o => o.metadata.rpgLeader)
  const player = table.adventure?.definition.characters.find(c => c.role === 'player')
  if (player) return figures.find(o => o.metadata.characterId === player.id)
  const owned = (o: TableObject) => o.metadata.moveSeat === seat || o.metadata.owner === seat
  return figures.find(o => o.metadata.role === 'hero' && owned(o)) ?? figures.find(o => o.metadata.role === 'hero') ?? figures.find(owned)
}

/** Translate the target and camera together, preserving the player's rotation and zoom. */
export function cameraFollowStep(target: Vec3, destination: Vec3, seconds: number): Vec3 {
  if (!Number.isFinite(seconds) || seconds <= 0 || [...target, ...destination].some(n => !Number.isFinite(n))) return [0, 0, 0]
  const delta = destination.map((n, i) => n - target[i]) as Vec3
  if (Math.hypot(...delta) < .0005) return [0, 0, 0]
  const alpha = 1 - Math.exp(-7 * Math.min(seconds, .1))
  return delta.map(n => n * alpha) as Vec3
}

/** View preferences are independent of rule state, undo history and AI proposals. */
export function cameraPose(value: unknown): CameraPose | undefined {
  if (!value || typeof value !== 'object') return
  const pose = value as Record<string, unknown>
  const vector = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 500)
  if (!vector(pose.position) || !vector(pose.target)) return
  const distance = Math.hypot(...pose.position.map((n, i) => n - (pose.target as Vec3)[i]))
  if (distance < 2 || distance > 450 || pose.position[1] - pose.target[1] < .001) return
  return { position: [...pose.position], target: [...pose.target] }
}

export function loadCameraMemories(storage?: CameraStorage): CameraMemories {
  const result: CameraMemories = Object.create(null)
  try {
    const pack = JSON.parse((storage ?? localStorage).getItem(CAMERA_MEMORY_KEY) ?? 'null')
    if (pack?.version !== 1 || !pack.tables || typeof pack.tables !== 'object' || Array.isArray(pack.tables)) return result
    for (const [id, item] of Object.entries(pack.tables).slice(0, 200)) {
      if (!validCameraScope(id) || !item || typeof item !== 'object') continue
      const memory = item as Record<string, unknown>
      if (memory.mode !== 'perspective' && memory.mode !== 'top') continue
      result[id] = { mode: memory.mode, perspective: cameraPose(memory.perspective), top: cameraPose(memory.top), ...(typeof memory.follow === 'boolean' ? { follow: memory.follow } : {}) }
    }
  } catch { /* A damaged preference must never prevent opening a game. */ }
  return result
}

export function rememberCamera(memories: CameraMemories, id: string, mode: TableView, pose?: CameraPose) {
  if (!validCameraScope(id)) return
  const validated = cameraPose(pose)
  memories[id] = { ...memories[id], mode, ...(validated ? { [mode]: validated } : {}) }
}

export function rememberCameraFollow(memories: CameraMemories, id: string, follow: boolean) {
  if (!validCameraScope(id)) return
  memories[id] = { ...(memories[id] ?? { mode: 'perspective' }), follow }
}

export function saveCameraMemories(memories: CameraMemories, storage?: CameraStorage): boolean {
  try { (storage ?? localStorage).setItem(CAMERA_MEMORY_KEY, JSON.stringify({ version: 1, tables: memories })); return true }
  catch { return false }
}
