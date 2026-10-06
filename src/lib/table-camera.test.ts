import { describe, expect, it } from 'vitest'
import { CAMERA_MEMORY_KEY, cameraFollowStep, cameraPose, cameraProtagonist, loadCameraMemories, preferredTableView, rememberCamera, rememberCameraFollow, saveCameraMemories, type CameraMemories } from './table-camera'
import { createObject, createTableSession, type Vec3 } from './tabletop'
import { blankRpgAdventure, startRpgAdventure } from './rpg-engine'
import { blankAdventure, startAdventure } from './adventure-engine'

const angled = { position: [12, 18, 23] as [number, number, number], target: [2, 0, -1] as [number, number, number] }
const overhead = { position: [3, 31, .04] as [number, number, number], target: [3, 0, 0] as [number, number, number] }
function storage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}

describe('per-table camera memory independent of gameplay', () => {
  it('restores rotation, zoom, pan and the last view after reopening', () => {
    const disk = storage(); const views = loadCameraMemories(disk)
    rememberCamera(views, 'story-one', 'perspective', angled)
    rememberCamera(views, 'story-one', 'top', overhead)
    expect(saveCameraMemories(views, disk)).toBe(true)
    expect(loadCameraMemories(disk)['story-one']).toEqual({ mode: 'top', perspective: angled, top: overhead })
    rememberCamera(views, 'story-one', 'perspective')
    expect(views['story-one']).toEqual({ mode: 'perspective', perspective: angled, top: overhead })
  })
  it('keeps every table and each view separate and snapshots mutable camera vectors', () => {
    const views: CameraMemories = {}; const pose = structuredClone(angled)
    rememberCamera(views, 'one', 'perspective', pose)
    rememberCamera(views, 'two', 'top', overhead)
    pose.position[0] = 90; pose.target[0] = 80
    expect(views.one.perspective).toEqual(angled)
    expect(views.one.top).toBeUndefined(); expect(views.two.perspective).toBeUndefined()
    expect(views.two.top).toEqual(overhead)
  })
  it('ignores corrupt preferences and invalid poses without losing valid table views', () => {
    const disk = storage()
    for (const bad of ['', '{', 'null', '{"version":2,"tables":{}}']) {
      disk.setItem(CAMERA_MEMORY_KEY, bad); expect(Object.keys(loadCameraMemories(disk))).toEqual([])
    }
    disk.setItem(CAMERA_MEMORY_KEY, JSON.stringify({ version: 1, tables: { one: { mode: 'top', top: overhead, perspective: { position: [0, 0, 0], target: [0, 0, 0] } }, two: { mode: 'invalid' }, constructor: { mode: 'top', top: overhead } } }))
    expect(Object.keys(loadCameraMemories(disk))).toEqual(['one'])
    expect(loadCameraMemories(disk).one.top).toEqual(overhead)
    expect(loadCameraMemories(disk).one.perspective).toBeUndefined()
    expect(cameraPose({ position: [0, 151, 0], target: [0, 0, 0] })).toBeDefined()
    for (const bad of [null, {}, { position: [0, Infinity, 0], target: [0, 0, 0] }, { position: [0, 451, 0], target: [0, 0, 0] }, { position: [0, -10, 0], target: [0, 0, 0] }]) expect(cameraPose(bad)).toBeUndefined()
  })
  it('returns a recoverable storage failure while retaining this session memory', () => {
    const views: CameraMemories = {}; rememberCamera(views, 'one', 'perspective', angled)
    const unavailable = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('full') } }
    expect(Object.keys(loadCameraMemories(unavailable))).toEqual([])
    expect(saveCameraMemories(views, unavailable)).toBe(false)
    expect(views.one.perspective).toEqual(angled)
  })
})

describe('protagonist camera mode', () => {
  it('starts new games in perspective and keeps a player’s saved view', () => {
    const t = startRpgAdventure(blankRpgAdventure()), memories: CameraMemories = {}
    expect(preferredTableView(t, memories)).toBe('perspective')
    rememberCamera(memories, t.id, 'top', overhead)
    expect(preferredTableView(t, memories)).toBe('top')
  })
  it('keeps the star map’s view separate and restores the scene and follow preference', () => {
    const t = startRpgAdventure(blankRpgAdventure()), memories: CameraMemories = {}, disk = storage()
    rememberCamera(memories, t.id, 'perspective', angled); rememberCameraFollow(memories, t.id, true)
    t.adventure!.progress.rpg!.mapId = 'world'
    expect(preferredTableView(t, memories)).toBe('top'); expect(cameraProtagonist(t, '玩家1')).toBeUndefined()
    rememberCamera(memories, `${t.id}:rpg-world`, 'perspective', overhead); saveCameraMemories(memories, disk)
    const restored = loadCameraMemories(disk)
    expect(preferredTableView(t, restored)).toBe('perspective')
    t.adventure!.progress.rpg!.mapId = 'camp'
    expect(preferredTableView(t, restored)).toBe('perspective')
    expect(restored[t.id]).toMatchObject({ follow: true, perspective: angled })
    expect(restored[`${t.id}:rpg-world`].perspective).toEqual(overhead)
  })
  it('saves follow without changing zoom, rotation or an explicit top view', () => {
    const disk = storage(), memories: CameraMemories = {}
    rememberCamera(memories, 'one', 'top', overhead); rememberCameraFollow(memories, 'one', true)
    saveCameraMemories(memories, disk)
    expect(loadCameraMemories(disk).one).toMatchObject({ mode: 'top', top: overhead, follow: true })
    rememberCameraFollow(memories, 'one', false); rememberCamera(memories, 'one', 'perspective', angled)
    expect(memories.one.follow).toBe(false)
  })
  it('follows the RPG leader and the authored campaign player, excluding editor layouts', () => {
    const rpg = startRpgAdventure(blankRpgAdventure())
    expect(cameraProtagonist(rpg, '玩家1')?.metadata.rpgLeader).toBe(true)
    const generic = startAdventure(blankAdventure())
    expect(cameraProtagonist(generic, '玩家1')?.metadata.characterId).toBe(generic.adventure!.definition.characters[0].id)
    rpg.workspace = { kind: 'draft' }; expect(cameraProtagonist(rpg, '玩家1')).toBeUndefined()
  })
  it('chooses the current player’s hero in a multi-seat tabletop rather than an enemy', () => {
    const t = createTableSession('sandbox')
    const enemy = createObject('figurine', { metadata: { team: '敌方' } })
    const one = createObject('figurine', { metadata: { role: 'hero', moveSeat: '玩家1' } })
    const two = createObject('figurine', { metadata: { role: 'hero', moveSeat: '玩家2' } })
    t.objects = [enemy, one, two]
    expect(cameraProtagonist(t, '玩家2')?.id).toBe(two.id)
    expect(cameraProtagonist(t, '玩家1')?.id).toBe(one.id)
  })
  it('follows at the same speed across frame rates while preserving the camera offset', () => {
    const run = (fps: number) => {
      let target: Vec3 = [0, 0, 0], position: Vec3 = [0, 18, 22]
      for (let i = 0; i < fps; i++) {
        const step = cameraFollowStep(target, [10, 1, -4], 1 / fps)
        target = target.map((n, j) => n + step[j]) as Vec3; position = position.map((n, j) => n + step[j]) as Vec3
      }
      expect(position.map((n, i) => n - target[i])[1]).toBeCloseTo(18, 10)
      expect(position.map((n, i) => n - target[i])[2]).toBeCloseTo(22, 10)
      return target
    }
    const fast = run(120), slow = run(30)
    fast.forEach((n, i) => expect(n).toBeCloseTo(slow[i], 10))
    expect(fast[0]).toBeGreaterThan(9.99); expect(fast[0]).toBeLessThan(10)
  })
  it('stops at rest and avoids camera jumps after a background tab resumes', () => {
    expect(cameraFollowStep([1, 2, 3], [1.00001, 2, 3], 1 / 60)).toEqual([0, 0, 0])
    const resumed = cameraFollowStep([0, 0, 0], [10, 0, 0], 10)
    expect(resumed[0]).toBeGreaterThan(0); expect(resumed[0]).toBeLessThan(6)
    expect(cameraFollowStep([0, 0, 0], [1, 2, 3], NaN)).toEqual([0, 0, 0])
  })
})
