import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { interactionGroups, useRapier } from '@react-three/rapier'
import type Rapier from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import type { TableObject, TableSession, Vec3 } from '../lib/tabletop'
import { tableBounds } from '../lib/table-surface'
import { dimensions, ObjectVisual, useDiceShape } from './tabletop-visuals'
import { makeDiceShape, readDiceValue, type DiceShape } from './dice-geometry'

export interface DiceRollPose { position: Vec3; rotation: Vec3 }
interface Props {
  session: TableSession
  requests: Record<string, number>
  generation: number
  onResult: (id: string, value: number, request: number, generation: number, pose?: DiceRollPose) => boolean | void
  onError?: (message: string) => void
  onSelect: (id: string | null, additive?: boolean) => void
  floating?: boolean
}
interface Trajectory {
  object: TableObject
  request: number
  samples: Float32Array
  steps: number
  start: Vec3
  floor: number
  from: THREE.Vector3
  destination: THREE.Vector3
  settled: THREE.Quaternion
  arranged: THREE.Quaternion
  value: number
  delay: number
  duration: number
  limits: { minX: number; maxX: number; minZ: number; maxZ: number }
}
const PHYSICS_TIME = 1.5, ARRANGE_START = 1.7, TOTAL_TIME = 2.2
const FLIGHT_STEPS = Math.round(1.18 * 90), MIN_STEPS = 640, MAX_STEPS = 1800, STRIDE = 8
const smooth = (value: number) => { const p = THREE.MathUtils.clamp(value, 0, 1); return p * p * (3 - 2 * p) }

function bottomHeight(shape: DiceShape, scale: Vec3, quaternion: THREE.Quaternion) {
  const vertices = shape.geometry.getAttribute('position'), point = new THREE.Vector3(), size = new THREE.Vector3(...scale)
  let bottom = Infinity
  for (let i = 0; i < vertices.count; i++) bottom = Math.min(bottom, point.fromBufferAttribute(vertices, i).multiply(size).applyQuaternion(quaternion).y)
  return -bottom
}

function floorAt(session: TableSession, x: number, z: number) {
  let floor = 0
  for (const o of session.objects) {
    if (o.kind !== 'board') continue
    const [w, h, d] = dimensions(o), dx = x - o.position[0], dz = z - o.position[2], cos = Math.cos(o.rotation[1]), sin = Math.sin(o.rotation[1])
    if (Math.abs(dx * cos - dz * sin) <= w * o.scale[0] / 2 && Math.abs(dx * sin + dz * cos) <= d * o.scale[2] / 2) floor = Math.max(floor, o.position[1] + h * o.scale[1] / 2)
  }
  return floor
}

/** Simulate only dice and a virtual floor. No collider from the authored scene enters this world. */
function prepare(rapier: typeof Rapier, session: TableSession, requests: Record<string, number>): Trajectory[] {
  const objects = session.objects.filter(o => o.kind === 'dice' && !o.locked && requests[o.id] > 0), bounds = tableBounds(session)
  if (!objects.length) return []
  const centerX = objects.reduce((sum, o) => sum + o.position[0], 0) / objects.length, centerZ = objects.reduce((sum, o) => sum + o.position[2], 0) / objects.length
  const world = new rapier.World({ x: 0, y: -24, z: 0 }), shapes: DiceShape[] = []
  try {
    world.timestep = 1 / 90; world.numSolverIterations = 14
    const floor = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(0, -.5, 0))
    world.createCollider(rapier.ColliderDesc.cuboid(500, .5, 500).setFriction(.16).setRestitution(.14).setCollisionGroups(interactionGroups(1, [0])), floor)
    const tracks = objects.map(object => {
      const shape = makeDiceShape(object.sides); shapes.push(shape)
      const vertices = new Float32Array(shape.geometry.getAttribute('position').array)
      let radius = 0
      for (let i = 0; i < vertices.length; i += 3) {
        for (let axis = 0; axis < 3; axis++) vertices[i + axis] *= object.scale[axis]
        radius = Math.max(radius, Math.hypot(vertices[i], vertices[i + 1], vertices[i + 2]))
      }
      const marginX = Math.min(radius + .05, (bounds.maxX - bounds.minX) / 2 - .05), marginZ = Math.min(radius + .05, (bounds.maxZ - bounds.minZ) / 2 - .05)
      const x = THREE.MathUtils.clamp(object.position[0], bounds.minX + marginX, bounds.maxX - marginX), z = THREE.MathUtils.clamp(object.position[2], bounds.minZ + marginZ, bounds.maxZ - marginZ)
      const start: Vec3 = [THREE.MathUtils.clamp(x + THREE.MathUtils.clamp((centerX - x) * .15, -.5, .5), bounds.minX + marginX, bounds.maxX - marginX), radius * 1.34 + .04, THREE.MathUtils.clamp(z + THREE.MathUtils.clamp((centerZ - z) * .15, -.5, .5), bounds.minZ + marginZ, bounds.maxZ - marginZ)]
      const quaternion = new THREE.Quaternion().random()
      const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(...start).setRotation(quaternion).setLinvel(0, 8.65 + Math.random() * .42, 0).setAngvel({ x: (Math.random() > .5 ? 1 : -1) * (6.6 + Math.random() * 2.8), y: (Math.random() > .5 ? 1 : -1) * (1.5 + Math.random() * 2.2), z: (Math.random() > .5 ? 1 : -1) * (6.6 + Math.random() * 2.8) }).setLinearDamping(.11).setAngularDamping(.18).setCanSleep(true).setCcdEnabled(true))
      const collider = rapier.ColliderDesc.convexHull(vertices)
      if (!collider) throw new Error('骰子几何无法生成投掷轨迹，请调整骰型后重试。')
      world.createCollider(collider.setFriction(.16).setRestitution(.14).setCollisionGroups(interactionGroups(0, [1])), body)
      return { object: structuredClone(object), body, shape, start, x, z, limits: { minX: bounds.minX + marginX, maxX: bounds.maxX - marginX, minZ: bounds.minZ + marginZ, maxZ: bounds.maxZ - marginZ }, floor: floorAt(session, x, z), samples: new Float32Array((MAX_STEPS + 1) * STRIDE), velocityY: 8.65, impact: 0, stable: 0 }
    })
    let steps = 0
    for (let step = 0; step <= MAX_STEPS; step++) {
      if (step > 0) world.step()
      let allResting = true
      for (const track of tracks) {
        const p = track.body.translation(), q = track.body.rotation(), v = track.body.linvel(), spin = track.body.angvel(), offset = step * STRIDE
        if (![p.x, p.y, p.z, q.x, q.y, q.z, q.w].every(Number.isFinite)) throw new Error('投掷轨迹未能稳定生成，请重新掷骰。')
        const hit = track.velocityY < -.8 && v.y > track.velocityY + .8 ? Math.min(1, Math.abs(v.y - track.velocityY) / 8) : 0
        track.impact = Math.max(track.impact * .86, hit); track.velocityY = v.y
        track.samples.set([p.x, p.y, p.z, q.x, q.y, q.z, q.w, track.impact], offset)
        const quiet = v.x ** 2 + v.y ** 2 + v.z ** 2 < .0025 && spin.x ** 2 + spin.y ** 2 + spin.z ** 2 < .0064
        track.stable = quiet || track.body.isSleeping() ? track.stable + 1 : 0
        if (track.stable < 36) allResting = false
        else {
          // These bodies cannot be struck by another die or the authored scene.
          // Once rest is confirmed, keep all subsequent samples at this pose.
          track.body.sleep(); track.impact = 0; track.samples[offset + 7] = 0
        }
        // Long physical rolls still need a resting face, rather than a timed random result.
        if (step > MIN_STEPS && !quiet) { track.body.setLinearDamping(.8); track.body.setAngularDamping(.9) }
      }
      steps = step
      if (step >= MIN_STEPS && allResting) break
      if (step === MAX_STEPS && !allResting) throw new Error('骰子尚未稳定落定，本次检定已取消，请重新掷骰。')
    }
    const result: Trajectory[] = tracks.map(track => {
      const q = track.body.rotation(), value = readDiceValue(track.shape, track.object.sides, q, track.object.scale)
      if (value === null) throw new Error('无法读取骰子落定面，请重新掷骰。')
      const settled = new THREE.Quaternion(q.x, q.y, q.z, q.w).normalize()
      const normal = track.shape.normals[track.shape.values.indexOf(value)].clone().divide(new THREE.Vector3(...track.object.scale)).normalize().multiplyScalar(track.object.sides === 4 ? -1 : 1).applyQuaternion(settled)
      const arranged = settled.clone().premultiply(new THREE.Quaternion().setFromUnitVectors(normal, new THREE.Vector3(0, 1, 0))).normalize()
      const offset = steps * STRIDE
      const from = new THREE.Vector3(THREE.MathUtils.clamp(track.start[0] + (track.samples[offset] - track.start[0]) * .08, track.limits.minX, track.limits.maxX), track.floor + track.samples[offset + 1], THREE.MathUtils.clamp(track.start[2] + (track.samples[offset + 2] - track.start[2]) * .08, track.limits.minZ, track.limits.maxZ))
      return { object: track.object, request: requests[track.object.id], samples: track.samples.subarray(0, (steps + 1) * STRIDE), steps, start: track.start, limits: track.limits, floor: track.floor, from, destination: new THREE.Vector3(track.x, Math.min(30, track.floor + bottomHeight(track.shape, track.object.scale, arranged) + .015), track.z), settled, arranged, value, delay: 0, duration: 0 }
    })
    const maxTravel = Math.max(.001, ...result.map(track => track.from.distanceTo(track.destination)))
    for (const track of result) { const ratio = track.from.distanceTo(track.destination) / maxTravel; track.delay = .014 + ratio * .092 + Math.random() * .024; track.duration = .285 + ratio * .105 }
    return result
  } finally { world.free(); for (const shape of shapes) shape.geometry.dispose() }
}

function AnimatedDie({ track, elapsed, reducedMotion, onSelect }: { track: Trajectory; elapsed: React.RefObject<number>; reducedMotion: boolean; onSelect: Props['onSelect'] }) {
  const group = useRef<THREE.Group>(null), shape = useDiceShape(track.object.sides), impact = useRef(0), lastStep = useRef(0)
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  useFrame((_, delta) => {
    if (!group.current) return
    const time = reducedMotion ? TOTAL_TIME : elapsed.current
    if (time < PHYSICS_TIME) {
      const progress = Math.min(1, time / PHYSICS_TIME)
      const step = progress <= .55 ? Math.floor(progress / .55 * FLIGHT_STEPS) : Math.floor(FLIGHT_STEPS + (progress - .55) / .45 * (track.steps - FLIGHT_STEPS))
      const offset = Math.min(step, track.steps) * STRIDE, samples = track.samples
      for (let i = lastStep.current; i <= step; i++) impact.current = Math.max(impact.current, samples[i * STRIDE + 7] ?? 0)
      lastStep.current = step; impact.current *= Math.exp(-13 * delta)
      group.current.position.set(THREE.MathUtils.clamp(track.start[0] + (samples[offset] - track.start[0]) * .08, track.limits.minX, track.limits.maxX), track.floor + samples[offset + 1], THREE.MathUtils.clamp(track.start[2] + (samples[offset + 2] - track.start[2]) * .08, track.limits.minZ, track.limits.maxZ))
      group.current.quaternion.set(samples[offset + 3], samples[offset + 4], samples[offset + 5], samples[offset + 6])
      const squash = impact.current * .13
      group.current.scale.set(track.object.scale[0] * (1 + squash), track.object.scale[1] * (1 - squash * .72), track.object.scale[2] * (1 + squash * .42))
    } else if (time < ARRANGE_START) {
      group.current.position.copy(track.from); group.current.quaternion.copy(track.settled); group.current.scale.set(...track.object.scale)
    } else {
      const progress = THREE.MathUtils.clamp((time - ARRANGE_START - track.delay) / track.duration, 0, 1)
      group.current.position.lerpVectors(track.from, track.destination, smooth(progress))
      group.current.quaternion.copy(quaternion.copy(track.settled).slerp(track.arranged, smooth(progress)))
      const pulse = Math.sin(THREE.MathUtils.clamp((progress - .6) / .32, 0, 1) * Math.PI) * .045
      group.current.scale.set(track.object.scale[0] * (1 + pulse), track.object.scale[1] * (1 - pulse * .55), track.object.scale[2] * (1 + pulse))
    }
  })
  const select = (event: ThreeEvent<PointerEvent>) => { if (event.button === 0) { event.stopPropagation(); onSelect(track.object.id, event.shiftKey) } }
  return <group ref={group} position={[track.start[0], track.floor + track.start[1], track.start[2]]} scale={track.object.scale} userData={{ tablePickPriority: 0 }} onPointerDown={select}><ObjectVisual object={track.object} size={dimensions(track.object)} shape={shape} /></group>
}

function FloatingDie({ track, elapsed, reducedMotion, x, y, unit }: { track: Trajectory; elapsed: RefObject<number>; reducedMotion: boolean; x: number; y: number; unit: number }) {
  const group = useRef<THREE.Group>(null), shape = useDiceShape(track.object.sides)
  // Apply the viewing angle to the ENTIRE flight, rather than rotating an
  // already resting die toward the camera. The physical result is unchanged.
  const viewRotation = useMemo(() => track.arranged.clone()
    .premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), .95))
    .multiply(track.settled.clone().invert()).normalize(), [track.arranged, track.settled])
  const nextRotation = useMemo(() => new THREE.Quaternion(), [])
  const restHeight = track.samples[track.steps * STRIDE + 1]
  useFrame(() => {
    const node = group.current
    if (!node) return
    const time = reducedMotion ? TOTAL_TIME : elapsed.current
    const progress = Math.min(1, time / PHYSICS_TIME)
    const frame = progress <= .55 ? progress / .55 * FLIGHT_STEPS : FLIGHT_STEPS + (progress - .55) / .45 * (track.steps - FLIGHT_STEPS)
    const step = Math.min(Math.floor(frame), track.steps), blend = frame - step
    const offset = step * STRIDE, next = Math.min(step + 1, track.steps) * STRIDE, samples = track.samples
    node.quaternion.set(samples[offset + 3], samples[offset + 4], samples[offset + 5], samples[offset + 6]).normalize()
    nextRotation.set(samples[next + 3], samples[next + 4], samples[next + 5], samples[next + 6]).normalize()
    // Even slerping identical normalized quaternions can introduce rounding
    // drift. Repeated rest samples must produce a bit-for-bit identical pose.
    if (!node.quaternion.equals(nextRotation)) node.quaternion.slerp(nextRotation, blend)
    node.quaternion.premultiply(viewRotation)
    // Interpolate while rolling; confirmed rest samples hold the exact same
    // position, rotation and scale through result reporting and disappearance.
    const height = THREE.MathUtils.lerp(samples[offset + 1], samples[next + 1], blend)
    const bounce = Math.min(.32, Math.max(0, height - restHeight) * .09)
    node.position.set(x, y + bounce * unit, 0)
    const squash = THREE.MathUtils.lerp(samples[offset + 7], samples[next + 7], blend) * .09
    node.scale.set(unit * (1 + squash), unit * (1 - squash), unit)
  })
  return <group ref={group} position={[x, y, 0]} scale={unit}>{shape && <ObjectVisual object={track.object} size={dimensions(track.object)} shape={shape} />}</group>
}

/** A second render pass in the existing canvas: no DOM panel, board slot or scene collider. */
function FloatingRoll({ tracks, elapsed, reducedMotion }: { tracks: Trajectory[]; elapsed: RefObject<number>; reducedMotion: boolean }) {
  const { size } = useThree()
  const scene = useMemo(() => new THREE.Scene(), [])
  const camera = useMemo(() => {
    const camera = new THREE.OrthographicCamera(-size.width / 2, size.width / 2, size.height / 2, -size.height / 2, .1, 1000)
    camera.position.z = 500; return camera
  }, [size.width, size.height])
  const columns = Math.min(tracks.length, 10, Math.max(1, Math.floor((size.width - 32) / 36))), rows = Math.ceil(tracks.length / Math.max(1, columns))
  const cell = Math.min(76, (size.width - 32) / Math.max(1, columns), Math.max(32, size.height * .25 / Math.max(1, rows)))
  // Center the entire pool in the lower part of the board, above the action bar.
  const halfPoolHeight = rows * cell / 2
  const poolCenterFromTop = THREE.MathUtils.clamp(size.height * .6, halfPoolHeight + 16, Math.max(halfPoolHeight + 16, size.height - 140 - halfPoolHeight))
  useFrame(state => {
    const autoClear = state.gl.autoClear
    state.gl.autoClear = true; state.gl.render(state.scene, state.camera)
    state.gl.autoClear = false; state.gl.clearDepth(); state.gl.render(scene, camera)
    state.gl.autoClear = autoClear
  }, 1)
  return createPortal(<>
    <ambientLight intensity={1.1} /><directionalLight position={[100, 180, 300]} intensity={2.3} color="#fff0d7" /><directionalLight position={[-200, 0, 120]} intensity={.7} color="#accdcc" />
    {tracks.map((track, i) => {
      const row = Math.floor(i / columns), inRow = Math.min(columns, tracks.length - row * columns)
      return <FloatingDie key={track.object.id} track={track} elapsed={elapsed} reducedMotion={reducedMotion} unit={cell * .68 / 1.6} x={(i % columns - (inRow - 1) / 2) * cell} y={size.height / 2 - poolCenterFromTop - cell * (row - (rows - 1) / 2)} />
    })}
  </>, scene)
}

export default function TableDiceRolls(props: Props) {
  const { rapier } = useRapier(), [tracks, setTracks] = useState<Trajectory[]>([])
  const elapsed = useRef(0), reported = useRef(false), latest = useRef(props); latest.current = props
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  useEffect(() => {
    reported.current = false; elapsed.current = 0
    try { setTracks(prepare(rapier, props.session, props.requests)) }
    catch (error) { reported.current = true; latest.current.onError?.(error instanceof Error ? error.message : '本次投掷未能完成，请重新掷骰。') }
    return () => { reported.current = true }
    // The parent keys a batch by its table, generation and request identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rapier])
  useFrame((_, delta) => {
    if (!tracks.length || reported.current) return
    elapsed.current += Math.min(delta, .05)
    if (!reducedMotion && elapsed.current < TOTAL_TIME) return
    reported.current = true
    const current = latest.current
    for (const track of tracks) {
      if (current.generation !== props.generation || current.requests[track.object.id] !== track.request) continue
      const euler = new THREE.Euler().setFromQuaternion(track.arranged)
      const accepted = current.onResult(track.object.id, track.value, track.request, props.generation, { position: props.floating ? track.object.position : track.destination.toArray() as Vec3, rotation: [euler.x, euler.y, euler.z] })
      if (accepted === false) { current.onError?.('本次骰组尚未完成结算，请重新发起检定。'); break }
    }
  }, -1)
  return props.floating && tracks.length ? <FloatingRoll tracks={tracks} elapsed={elapsed} reducedMotion={reducedMotion} /> : <>{tracks.map(track => <AnimatedDie key={track.object.id} track={track} elapsed={elapsed} reducedMotion={reducedMotion} onSelect={props.onSelect} />)}</>
}
