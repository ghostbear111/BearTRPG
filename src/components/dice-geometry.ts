import * as THREE from 'three'
import type { Vec3 } from '../lib/tabletop'

export const SUPPORTED_DICE = [4, 6, 8, 10, 12, 20]

export interface ActiveRoll {
  request: number
  generation: number
  sides: number
  startedAt: number
}

/** A result belongs to the throw that actually started, rather than a later re-throw. */
export function isCurrentRoll(roll: ActiveRoll, current: Pick<ActiveRoll, 'request' | 'generation' | 'sides'>) {
  return roll.request > 0 && roll.request === current.request && roll.generation === current.generation && roll.sides === current.sides
}

export interface DiceShape {
  geometry: THREE.BufferGeometry
  normals: THREE.Vector3[]
  values: number[]
  corners?: { u: number; v: number; value: number }[][]
}

export function makeDiceShape(sides: number): DiceShape {
  if (sides === 6 || !SUPPORTED_DICE.includes(sides)) return {
    geometry: new THREE.BoxGeometry(1.08, 1.08, 1.08),
    normals: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)],
    values: [3, 4, 1, 6, 2, 5],
  }
  let geometry: THREE.BufferGeometry
  if (sides === 4) geometry = new THREE.TetrahedronGeometry(.85, 0)
  else if (sides === 8) geometry = new THREE.OctahedronGeometry(.8, 0)
  else if (sides === 12) geometry = new THREE.DodecahedronGeometry(.78, 0)
  else if (sides === 10) {
    // A d10 is the dual of a pentagonal antiprism: ten planar kite faces.
    // Unlike a pentagonal bipyramid, every face has a parallel opposite face.
    const antiprism = Array.from({ length: 10 }, (_, index) => {
      const angle = (index % 5 + (index >= 5 ? .5 : 0)) * Math.PI * 2 / 5
      return new THREE.Vector3(Math.cos(angle), index < 5 ? .5 : -.5, Math.sin(angle))
    })
    const faces = [Array.from({ length: 5 }, (_, index) => index), Array.from({ length: 5 }, (_, index) => index + 5)]
    for (let index = 0; index < 5; index++) {
      const next = (index + 1) % 5
      faces.push([index, next, index + 5], [index + 5, next + 5, next])
    }
    const dual = faces.map(face => {
      const [a, b, c] = face.map(index => antiprism[index])
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize()
      if (normal.dot(a) < 0) normal.negate()
      return normal.divideScalar(normal.dot(a))
    })
    const radialScale = .72 / Math.max(...dual.map(vertex => Math.hypot(vertex.x, vertex.z)))
    const verticalScale = .85 / Math.max(...dual.map(vertex => Math.abs(vertex.y)))
    dual.forEach(vertex => vertex.multiply(new THREE.Vector3(radialScale, verticalScale, radialScale)))
    const vertices: number[] = []
    antiprism.forEach((vertex, index) => {
      const corners = faces.flatMap((face, faceIndex) => face.includes(index) ? [dual[faceIndex]] : [])
      const center = corners.reduce((sum, corner) => sum.add(corner), new THREE.Vector3()).divideScalar(4)
      const normal = vertex.clone().divide(new THREE.Vector3(radialScale, verticalScale, radialScale)).normalize()
      const horizontal = corners[0].clone().sub(center).normalize()
      const vertical = new THREE.Vector3().crossVectors(normal, horizontal).normalize()
      corners.sort((a, b) => {
        const pa = a.clone().sub(center); const pb = b.clone().sub(center)
        return Math.atan2(pa.dot(vertical), pa.dot(horizontal)) - Math.atan2(pb.dot(vertical), pb.dot(horizontal))
      })
      vertices.push(...corners[0].toArray(), ...corners[1].toArray(), ...corners[2].toArray())
      vertices.push(...corners[0].toArray(), ...corners[2].toArray(), ...corners[3].toArray())
    })
    geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  } else geometry = new THREE.IcosahedronGeometry(.79, 0)
  if (geometry.index) { const original = geometry; geometry = original.toNonIndexed(); original.dispose() }
  const positions = geometry.getAttribute('position')
  const normals: THREE.Vector3[] = []
  const groups: number[][] = []
  const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3()
  for (let index = 0; index < positions.count; index += 3) {
    a.fromBufferAttribute(positions, index); b.fromBufferAttribute(positions, index + 1); c.fromBufferAttribute(positions, index + 2)
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize()
    if (normal.dot(a.clone().add(b).add(c)) < 0) {
      // Manual triangular meshes need outward winding for lighting and raycasting.
      positions.setXYZ(index + 1, c.x, c.y, c.z); positions.setXYZ(index + 2, b.x, b.y, b.z)
      normal.negate()
    }
    let face = normals.findIndex(existing => existing.dot(normal) > .9999)
    if (face === -1) { face = normals.length; normals.push(normal); groups.push([]) }
    groups[face].push(index)
  }
  geometry.clearGroups()
  const uv = new Float32Array(positions.count * 2)
  groups.forEach((indices, face) => {
    const normal = normals[face]
    const horizontal = new THREE.Vector3().crossVectors(normal, Math.abs(normal.y) > .9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)).normalize()
    const vertical = new THREE.Vector3().crossVectors(normal, horizontal).normalize()
    const projected = indices.flatMap(index => [0, 1, 2].map(offset => {
      a.fromBufferAttribute(positions, index + offset)
      return { index: index + offset, u: a.dot(horizontal), v: a.dot(vertical) }
    }))
    const minU = Math.min(...projected.map(p => p.u)); const maxU = Math.max(...projected.map(p => p.u))
    const minV = Math.min(...projected.map(p => p.v)); const maxV = Math.max(...projected.map(p => p.v))
    projected.forEach(p => { uv[p.index * 2] = .06 + .88 * (p.u - minU) / (maxU - minU); uv[p.index * 2 + 1] = .06 + .88 * (p.v - minV) / (maxV - minV) })
    indices.forEach(index => geometry.addGroup(index, 3, face))
  })
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geometry.computeVertexNormals()
  const corners = sides === 4 ? groups.map(indices => [0, 1, 2].map(offset => {
    const index = indices[0] + offset
    const vertex = new THREE.Vector3().fromBufferAttribute(positions, index)
    let opposite = 0; let minimum = Infinity
    normals.forEach((normal, face) => { const dot = normal.dot(vertex); if (dot < minimum) { minimum = dot; opposite = face } })
    return { u: uv[index * 2], v: uv[index * 2 + 1], value: opposite + 1 }
  })) : undefined
  return { geometry, normals, values: normals.map((_, index) => index + 1), corners }
}

/** Geometry defines the face values; the physics runner decides when it has settled. */
export function readDiceValue(shape: DiceShape, sides: number, rotation: { x: number; y: number; z: number; w: number }, scale: Vec3): number | null {
  if (!SUPPORTED_DICE.includes(sides) || shape.normals.length !== sides || scale.some(value => !Number.isFinite(value) || value <= 0)) return null
  const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
  if (![quaternion.x, quaternion.y, quaternion.z, quaternion.w].every(Number.isFinite) || quaternion.lengthSq() < .000001) return null
  quaternion.normalize()
  let highest = -Infinity
  let result = 1
  const inverseScale = new THREE.Vector3(...scale)
  shape.normals.forEach((normal, index) => {
    // D4 reads the upright vertex, whose three matching labels identify the opposite face.
    const height = normal.clone().divide(inverseScale).normalize().applyQuaternion(quaternion).y * (sides === 4 ? -1 : 1)
    if (height > highest) { highest = height; result = shape.values[index] }
  })
  return result
}
