import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { isCurrentRoll, makeDiceShape, readDiceValue, SUPPORTED_DICE } from '../components/dice-geometry'
import { SharedResourceCache } from '../components/renderer-resources'

afterEach(() => vi.useRealTimers())

describe('physical dice definitions', () => {
  it.each(SUPPORTED_DICE)('d%i has numbered faces that agree with its orientation', sides => {
    const shape = makeDiceShape(sides)
    expect(shape.normals).toHaveLength(sides)
    expect(new Set(shape.values).size).toBe(sides)
    for (let face = 0; face < sides; face++) {
      const rotation = new THREE.Quaternion().setFromUnitVectors(shape.normals[face], new THREE.Vector3(0, sides === 4 ? -1 : 1, 0))
      expect(readDiceValue(shape, sides, rotation, [1, 1, 1])).toBe(shape.values[face])
      expect(readDiceValue(shape, sides, rotation, [.1, .1, .1])).toBe(shape.values[face])
      expect(readDiceValue(shape, sides, rotation, [8, 8, 8])).toBe(shape.values[face])
    }
    shape.geometry.dispose()
  })

  it('each d4 upright vertex shows three matching labels for the reported result', () => {
    const shape = makeDiceShape(4)
    const positions = shape.geometry.getAttribute('position')
    const vertices = new Map<string, { vertex: THREE.Vector3; values: number[] }>()
    for (let face = 0; face < 4; face++) for (let corner = 0; corner < 3; corner++) {
      const vertex = new THREE.Vector3().fromBufferAttribute(positions, face * 3 + corner)
      const key = vertex.toArray().map(n => n.toFixed(5)).join(',')
      const labels = vertices.get(key) ?? { vertex, values: [] }
      labels.values.push(shape.corners![face][corner].value)
      vertices.set(key, labels)
    }
    expect(vertices.size).toBe(4)
    for (const { vertex, values } of vertices.values()) {
      expect(values).toHaveLength(3)
      expect(new Set(values).size).toBe(1)
      const rotation = new THREE.Quaternion().setFromUnitVectors(vertex.normalize(), new THREE.Vector3(0, 1, 0))
      expect(readDiceValue(shape, 4, rotation, [1, 1, 1])).toBe(values[0])
    }
    shape.geometry.dispose()
  })

  it('rejects custom geometry mismatches and invalid transforms', () => {
    const shape = makeDiceShape(6)
    expect(readDiceValue(shape, 100, new THREE.Quaternion(), [1, 1, 1])).toBeNull()
    expect(readDiceValue(shape, 20, new THREE.Quaternion(), [1, 1, 1])).toBeNull()
    expect(readDiceValue(shape, 6, { x: 0, y: 0, z: 0, w: 0 }, [1, 1, 1])).toBeNull()
    expect(readDiceValue(shape, 6, new THREE.Quaternion(), [1, 0, 1])).toBeNull()
    shape.geometry.dispose()
  })
})

describe('throw identity', () => {
  it('accepts only the request, canvas generation, and die definition that began the throw', () => {
    const active = { request: 1234, generation: 7, sides: 20, startedAt: 100 }
    expect(isCurrentRoll(active, active)).toBe(true)
    expect(isCurrentRoll(active, { ...active, request: 1235 })).toBe(false)
    expect(isCurrentRoll(active, { ...active, generation: 8 })).toBe(false)
    expect(isCurrentRoll(active, { ...active, sides: 6 })).toBe(false)
    expect(isCurrentRoll({ ...active, request: 0 }, { ...active, request: 0 })).toBe(false)
  })
})

describe('resources shared between table and preview', () => {
  it('unmounting a preview never disposes an active table resource', () => {
    vi.useFakeTimers()
    const dispose = vi.fn()
    const cache = new SharedResourceCache(key => ({ key }), dispose, 0)
    const table = cache.acquire('d20/gold')
    const preview = cache.acquire('d20/gold')
    expect(preview.value).toBe(table.value)
    preview.release()
    preview.release()
    vi.runAllTimers()
    expect(dispose).not.toHaveBeenCalled()
    table.release()
    vi.runAllTimers()
    expect(dispose).toHaveBeenCalledExactlyOnceWith(table.value)
  })

  it('keeps resources alive through StrictMode cleanup and immediate re-attachment', () => {
    vi.useFakeTimers()
    const dispose = vi.fn()
    const cache = new SharedResourceCache(key => ({ key }), dispose, 0)
    const first = cache.acquire('d6/red')
    first.release()
    const remounted = cache.acquire('d6/red')
    expect(remounted.value).toBe(first.value)
    vi.runAllTimers()
    expect(dispose).not.toHaveBeenCalled()
    remounted.release()
    vi.runAllTimers()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('bounds unused resources while retaining every active resource', () => {
    vi.useFakeTimers()
    const dispose = vi.fn()
    const cache = new SharedResourceCache(key => ({ key }), dispose, 2)
    const active = cache.acquire('active')
    for (let index = 0; index < 10; index++) cache.acquire(String(index)).release()
    vi.runAllTimers()
    expect(dispose).toHaveBeenCalledTimes(8)
    expect(dispose.mock.calls.flat()).not.toContain(active.value)
    active.release()
    vi.runAllTimers()
    expect(dispose).toHaveBeenCalledTimes(9)
  })
})

describe('offline Rapier throws', () => {
  beforeAll(async () => { await RAPIER.init() })
  it.each(SUPPORTED_DICE)('d%i settles on the same numbered physical face that is reported', sides => {
    const shape = makeDiceShape(sides)
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    world.timestep = 1 / 60
    world.createCollider(RAPIER.ColliderDesc.cuboid(15, .2, 11).setTranslation(0, -.2, 0).setFriction(.95).setRestitution(.12))
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1.4, 0).setLinearDamping(.18).setAngularDamping(.3).setCcdEnabled(true))
    const hull = RAPIER.ColliderDesc.convexHull(new Float32Array(shape.geometry.getAttribute('position').array))!
    world.createCollider(hull.setFriction(.85).setRestitution(.3), body)
    const mass = body.mass()
    body.applyImpulse({ x: .5 * mass, y: 4.4 * mass, z: -.35 * mass }, true)
    body.applyTorqueImpulse({ x: .77 * mass, y: 2.4 * mass, z: -1.4 * mass }, true)
    for (let step = 0; step < 600 && !body.isSleeping(); step++) world.step()
    expect(body.isSleeping()).toBe(true)
    const rotation = body.rotation()
    const value = readDiceValue(shape, sides, rotation, [1, 1, 1])!
    expect(value).toBeGreaterThanOrEqual(1)
    expect(value).toBeLessThanOrEqual(sides)
    const upward = shape.normals[shape.values.indexOf(value)].clone().applyQuaternion(new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)).y * (sides === 4 ? -1 : 1)
    expect(upward).toBeGreaterThan(.99)
    world.free()
    shape.geometry.dispose()
  })
})
