import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren, type ReactNode } from 'react'
import PropColliders from './PropColliders'
import { Canvas, events as pointerEvents, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, Line, OrbitControls } from '@react-three/drei'
import { CuboidCollider, ConvexHullCollider, CylinderCollider, Physics, RigidBody, interactionGroups, useRapier, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import type { TableObject, TableSession, Vec3 } from '../lib/tabletop'
import { dimensions, ObjectVisual, useDiceShape, usePaintedTexture } from './tabletop-visuals'
import TableDiceRolls, { type DiceRollPose } from './TableDiceRolls'
import type { BattleImpact } from '../lib/battle-presentation'
import { BattleHitRings, BattlePieceMotion } from './BattleVisuals'
import { cameraFollowStep, GAME_CAMERA_DIRECTION, type CameraPose } from '../lib/table-camera'
import { tableBounds, tableSurface, type TableSurface } from '../lib/table-surface'
import { presentObject, type TavernEffect } from '../lib/tavern-presentation'
import TavernEffectImage from './TavernEffectImage'
import RpgWorldRoutes from './RpgWorldRoutes'

export interface TableCanvasProps {
  presentationEffect?: { effect: TavernEffect; key: number } | null
  children?: ReactNode
  session: TableSession
  selectedId: string | null
  selectedIds?: string[]
  onSelect: (id: string | null, additive?: boolean) => void
  onTransform: (id: string, patch: { position: Vec3; rotation: Vec3 }, reason?: 'drag' | 'physics') => boolean | void
  onDiceResult: (id: string, value: number, request: number, generation: number, pose?: DiceRollPose) => boolean | void
  onRollError?: (message: string) => void
  rollRequests: Record<string, number>
  /** Explicitly synchronize a repaired figure even when its saved pose is unchanged. */
  uprightRequests?: Record<string, number>
  /** Rebuild only the physics world; the renderer and camera stay mounted. */
  generation?: number
  view: 'perspective' | 'top'
  tool: 'select' | 'measure'
  onMeasure?: (distance: number) => void
  guideCells?: Array<{ cell: string; position: Vec3; size?: number }>
  effectCells?: Array<{ position: Vec3; size: number; color: string }>
  onGuideCell?: (cell: string) => void
  guideObjectIds?: string[]
  interactionLocked?: boolean
  playMode?: boolean
  battleImpact?: BattleImpact
  onDestination?: (position: Vec3) => void
  focusBounds?: { center: Vec3; width: number; depth: number }
  cameraPose?: CameraPose
  cameraScope?: string
  cameraReset?: number
  cameraFollowTarget?: Vec3
  onCameraChange?: (tableId: string, view: TableCanvasProps['view'], pose: CameraPose, flush: boolean) => void
}

const GOLD = '#f3be76'
const rounded = (n: number) => Math.round(n * 10000) / 10000
const clamp = THREE.MathUtils.clamp

/** A DOM label anchored to the scene, without an independently mounted React root. */
function SceneLabel({ position = [0, 0, 0], text, variant = 'object', plain = false }: { position?: Vec3; text: string; variant?: 'object' | 'measure' | 'loading'; plain?: boolean }) {
  const anchor = useRef<THREE.Group>(null)
  const element = useRef<HTMLDivElement | null>(null)
  const point = useMemo(() => new THREE.Vector3(), [])
  const { gl, camera, size } = useThree()
  useEffect(() => {
    const parent = gl.domElement.parentElement
    if (!parent) return
    const node = document.createElement('div')
    Object.assign(node.style, {
      position: 'absolute', top: '0', left: '0', pointerEvents: 'none', whiteSpace: 'nowrap',
      zIndex: '2', fontFamily: 'Arial, "Microsoft YaHei", sans-serif', fontSize: '11px',
      color: '#f4d4a0', background: '#14251ee8', border: '1px solid #b89961',
      padding: '5px 9px', borderRadius: '4px', boxShadow: '0 3px 12px #0005',
    })
    node.className = 'table-scene-label'
    node.textContent = text
    parent.appendChild(node)
    element.current = node
    return () => { element.current = null; node.remove() }
    // Text is updated separately so a name edit does not recreate the label.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl])
  useEffect(() => {
    if (!element.current) return
    element.current.textContent = text
    element.current.style.padding = plain ? '0' : variant === 'loading' ? '16px' : '5px 9px'
    element.current.style.fontSize = variant === 'measure' ? '12px' : '11px'
    element.current.style.border = plain ? '0' : '1px solid #b89961'
    element.current.style.background = plain ? 'transparent' : '#14251ee8'
    element.current.style.boxShadow = plain ? 'none' : '0 3px 12px #0005'
    element.current.style.textShadow = plain ? '0 1px 3px #000' : 'none'
  }, [text, variant, plain])
  useFrame(() => {
    const node = element.current
    if (!node || !anchor.current) return
    anchor.current.getWorldPosition(point)
    point.project(camera)
    node.style.display = point.z >= -1 && point.z <= 1 && Math.abs(point.x) <= 1.15 && Math.abs(point.y) <= 1.15 ? 'block' : 'none'
    node.style.transform = `translate3d(${(point.x + 1) * size.width / 2}px,${(1 - point.y) * size.height / 2}px,0) translate(-50%,-50%)`
  })
  return <group ref={anchor} position={position} />
}

type DragState = { pointerId: number; height: number; offsetX: number; offsetZ: number; screenX: number; screenY: number; moved: boolean; position: Vec3 }

const ignoreRaycast = () => {}

function pickPriority(object: THREE.Object3D): number {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (typeof node.userData.tablePickPriority === 'number') return node.userData.tablePickPriority
  }
  return 2
}

// Game pieces take precedence over UI hints and map surfaces, while real pieces
// and scenery still keep their normal distance order relative to each other.
function tablePointerEvents(store: Parameters<typeof pointerEvents>[0]) {
  return { ...pointerEvents(store), filter: (hits: THREE.Intersection[]) => hits.sort((a, b) => pickPriority(a.object) - pickPriority(b.object) || a.distance - b.distance) }
}

function GuideCells({ cells, tool, onGuideCell, playMode }: { cells: NonNullable<TableCanvasProps['guideCells']>; tool: TableCanvasProps['tool']; onGuideCell: TableCanvasProps['onGuideCell']; playMode: boolean }) {
  const [hovered, setHovered] = useState<string | null>(null)
  const { gl } = useThree()
  const resources = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(1.12, 1.12)
    return {
      geometry, edges: new THREE.EdgesGeometry(geometry),
      normal: new THREE.MeshBasicMaterial({ color: '#82c881', transparent: true, opacity: .42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
      hovered: new THREE.MeshBasicMaterial({ color: '#b5ef9c', transparent: true, opacity: .68, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
      border: new THREE.LineBasicMaterial({ color: '#b8e3a0', transparent: true, opacity: .9, depthWrite: false }),
      hoveredBorder: new THREE.LineBasicMaterial({ color: '#e1ffd0', depthWrite: false }),
    }
  }, [])
  useEffect(() => () => { resources.geometry.dispose(); resources.edges.dispose(); resources.normal.dispose(); resources.hovered.dispose(); resources.border.dispose(); resources.hoveredBorder.dispose(); gl.domElement.style.cursor = '' }, [resources, gl])
  useEffect(() => { if (tool === 'measure') { setHovered(null); gl.domElement.style.cursor = '' } }, [tool, gl])
  return <group>
    {cells.map(({ cell, position, size = 1.12 }) => <group key={cell}>
      <mesh userData={{ tablePickPriority: 1 }} position={position} scale={[size / 1.12, size / 1.12, 1]} rotation={[-Math.PI / 2, 0, 0]} geometry={resources.geometry} material={hovered === cell ? resources.hovered : resources.normal} dispose={null} renderOrder={8} raycast={tool === 'measure' ? ignoreRaycast : THREE.Mesh.prototype.raycast}
        onPointerDown={event => event.stopPropagation()}
        onPointerUp={event => event.stopPropagation()}
        onPointerMove={event => event.stopPropagation()}
        onPointerOver={event => { event.stopPropagation(); setHovered(cell); gl.domElement.style.cursor = 'pointer' }}
        onPointerOut={() => { setHovered(current => current === cell ? null : current); gl.domElement.style.cursor = '' }}
        onClick={event => { event.stopPropagation(); if (event.button === 0 && tool === 'select') onGuideCell?.(cell) }}>
        {!playMode && <lineSegments geometry={resources.edges} material={hovered === cell ? resources.hoveredBorder : resources.border} dispose={null} raycast={ignoreRaycast} renderOrder={9} />}
      </mesh>
      {hovered === cell && tool === 'select' && <SceneLabel position={[position[0], position[1] + .18, position[2]]} text={cell} plain={playMode} />}
    </group>)}
  </group>
}

function GuideObjectHalo({ body, size, scale }: { body: { current: RapierRigidBody | null }; size: Vec3; scale: Vec3 }) {
  const mesh = useRef<THREE.Mesh>(null)
  const radius = Math.max(size[0] * scale[0], size[2] * scale[2]) / 2 + .14
  useFrame(() => {
    if (!mesh.current || !body.current) return
    const p = body.current.translation()
    // Keep the guide horizontal even if the object's physical rotation changes.
    mesh.current.position.set(p.x, Math.max(.018, p.y - size[1] * scale[1] / 2 + .026), p.z)
  })
  return <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} raycast={ignoreRaycast} renderOrder={9}>
    <ringGeometry args={[radius - .07, radius, 40]} />
    <meshBasicMaterial color={GOLD} transparent opacity={.92} depthWrite={false} />
  </mesh>
}

/** Borderless selection feedback follows the live body without capturing clicks. */
function PlaySelectionFeedback({ body, object, size, label }: { body: { current: RapierRigidBody | null }; object: TableObject; size: Vec3; label: string }) {
  const anchor = useRef<THREE.Group>(null)
  const glow = useRef<THREE.Mesh>(null)
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const footprint = object.kind === 'figurine' ? [1, 1.4, 1] : object.kind === 'dice' ? [1.65, 1.65, 1.65] : size
  const half = footprint.map((n, i) => n * object.scale[i] / 2)
  const texture = usePaintedTexture((ctx, width, height) => {
    const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2)
    gradient.addColorStop(0, 'rgba(255,255,255,.65)')
    gradient.addColorStop(.55, 'rgba(255,255,255,.42)')
    gradient.addColorStop(.82, 'rgba(255,255,255,.16)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height)
  }, [], 128, 128)
  useFrame(() => {
    if (!body.current) return
    const p = body.current.translation(), q = body.current.rotation()
    matrix.makeRotationFromQuaternion(quaternion.set(q.x, q.y, q.z, q.w))
    const m = matrix.elements
    const halfX = Math.abs(m[0]) * half[0] + Math.abs(m[4]) * half[1] + Math.abs(m[8]) * half[2]
    const halfY = Math.abs(m[1]) * half[0] + Math.abs(m[5]) * half[1] + Math.abs(m[9]) * half[2]
    const halfZ = Math.abs(m[2]) * half[0] + Math.abs(m[6]) * half[1] + Math.abs(m[10]) * half[2]
    anchor.current?.position.set(p.x, p.y + halfY + .32, p.z)
    if (glow.current) {
      glow.current.position.set(p.x, Math.max(.018, p.y - halfY + .025), p.z)
      glow.current.scale.set(Math.max(.7, halfX * 2 + .65), Math.max(.7, halfZ * 2 + .65), 1)
    }
  })
  return <>
    {object.kind !== 'board' && <mesh ref={glow} position={[object.position[0], Math.max(.018, object.position[1] - half[1] + .025), object.position[2]]} rotation={[-Math.PI / 2, 0, 0]} raycast={ignoreRaycast} renderOrder={7}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color={GOLD} map={texture} transparent depthWrite={false} blending={THREE.AdditiveBlending} polygonOffset polygonOffsetFactor={-1} />
    </mesh>}
    <group ref={anchor} position={[object.position[0], object.position[1] + half[1] + .32, object.position[2]]}>
      <SceneLabel text={`${label} · 已选中`} plain />
    </group>
  </>
}

function PhysicalObject({ object, visualObject = object, selected, guided, interactionLocked, playMode, battleImpact, onDestination, grid, bounds, tool, uprightRequest, onSelect, onTransform, onDragging }: {
  object: TableObject; visualObject?: TableObject; selected: boolean; grid: TableSession['grid']; tool: TableCanvasProps['tool']; uprightRequest: number
  guided: boolean; interactionLocked: boolean
  playMode: boolean; onDestination: TableCanvasProps['onDestination']
  battleImpact?: BattleImpact
  bounds: ReturnType<typeof tableBounds>
  onSelect: TableCanvasProps['onSelect']; onTransform: TableCanvasProps['onTransform']; onDragging: (dragging: boolean) => void
}) {
  const body = useRef<RapierRigidBody>(null)
  // Authoring is a layout operation. Physics must never rewrite or nudge a saved pose.
  // Explicit dice rolls use the separate TableDiceRolls simulation in either mode.
  const dragLocked = object.locked || playMode || interactionLocked
  const { rapier } = useRapier()
  const { gl } = useThree()
  const [held, setHeld] = useState(false)
  const drag = useRef<DragState | null>(null)
  const mounted = useRef(false)
  const lastUpright = useRef(uprightRequest)
  const latest = useRef({ object, onTransform, grid, bounds })
  latest.current = { object, onTransform, grid, bounds }
  const size = useMemo(() => dimensions(object), [object.kind, object.metadata?.width, object.metadata?.height, object.metadata?.depth])
  const shape = useDiceShape(object.kind === 'dice' ? object.sides : null)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const hull = useMemo(() => {
    if (!shape) return null
    const vertices = new Float32Array(shape.geometry.getAttribute('position').array)
    for (let index = 0; index < vertices.length; index++) vertices[index] *= object.scale[index % 3]
    return vertices
  }, [shape, object.scale[0], object.scale[1], object.scale[2]])
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])
  const point = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])

  useEffect(() => {
    const api = body.current
    if (!api || drag.current) return
    const forcePose = lastUpright.current !== uprightRequest
    lastUpright.current = uprightRequest
    const p = api.translation()
    rotation.setFromEuler(new THREE.Euler(...object.rotation))
    const q = api.rotation()
    const rotationDifferent = Math.abs(q.x * rotation.x + q.y * rotation.y + q.z * rotation.z + q.w * rotation.w) < .999999
    if (forcePose || Math.abs(p.x - object.position[0]) > .002 || Math.abs(p.y - object.position[1]) > .002 || Math.abs(p.z - object.position[2]) > .002 || rotationDifferent) {
      api.setTranslation({ x: object.position[0], y: object.position[1], z: object.position[2] }, true)
      api.setRotation(rotation, true)
      api.setLinvel({ x: 0, y: 0, z: 0 }, true)
      api.setAngvel({ x: 0, y: 0, z: 0 }, true)
    }
  }, [object.position[0], object.position[1], object.position[2], object.rotation[0], object.rotation[1], object.rotation[2], rotation, uprightRequest])

  const release = useCallback(() => {
    const state = drag.current; const api = body.current
    if (!state || !api) return
    drag.current = null; setHeld(false); onDragging(false)
    const current = latest.current
    api.setBodyType(rapier.RigidBodyType.Fixed, true)
    if (!state.moved) return
    const step = clamp(current.grid.size, .1, 10)
    const x = current.grid.snap ? Math.round(state.position[0] / step) * step : state.position[0]
    const z = current.grid.snap ? Math.round(state.position[2] / step) * step : state.position[2]
    const position: Vec3 = [rounded(clamp(x, current.bounds.minX, current.bounds.maxX)), state.height, rounded(clamp(z, current.bounds.minZ, current.bounds.maxZ))]
    api.setTranslation({ x: position[0], y: position[1], z: position[2] }, true)
    api.setLinvel({ x: 0, y: 0, z: 0 }, true); api.setAngvel({ x: 0, y: 0, z: 0 }, true)
    if (mounted.current && position.some((value, index) => value !== current.object.position[index])) {
      const accepted = current.onTransform(current.object.id, { position, rotation: [...current.object.rotation] }, 'drag')
      if (accepted === false) api.setTranslation({ x: current.object.position[0], y: current.object.position[1], z: current.object.position[2] }, true)
    }
  }, [onDragging, rapier])

  useEffect(() => {
    const end = () => release()
    window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end)
    return () => { window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); if (drag.current) onDragging(false); gl.domElement.style.cursor = '' }
  }, [release, onDragging, gl])

  useEffect(() => { if (interactionLocked && drag.current) release() }, [interactionLocked, release])

  const down = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || tool !== 'select') return
    event.stopPropagation()
    if (onDestination && object.kind === 'board') { onDestination([event.point.x, object.position[1], event.point.z]); return }
    onSelect(object.id, event.shiftKey)
    const api = body.current
    if (dragLocked || !api) return
    const p = api.translation(); const height = object.position[1]
    plane.constant = -height
    if (!event.ray.intersectPlane(plane, point)) return
    drag.current = { pointerId: event.pointerId, height, offsetX: p.x - point.x, offsetZ: p.z - point.z, screenX: event.clientX, screenY: event.clientY, moved: false, position: [p.x, height, p.z] }
    onDragging(true)
    ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
    gl.domElement.style.cursor = 'grabbing'
  }
  const move = (event: ThreeEvent<PointerEvent>) => {
    const state = drag.current; const api = body.current
    if (!state || !api || state.pointerId !== event.pointerId) return
    event.stopPropagation(); plane.constant = -state.height
    if (!state.moved && Math.hypot(event.clientX - state.screenX, event.clientY - state.screenY) < 3) return
    if (event.ray.intersectPlane(plane, point)) {
      if (!state.moved) { state.moved = true; setHeld(true); api.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true) }
      state.position = [clamp(point.x + state.offsetX, bounds.minX, bounds.maxX), state.height, clamp(point.z + state.offsetZ, bounds.minZ, bounds.maxZ)]
      api.setNextKinematicTranslation({ x: state.position[0], y: state.height, z: state.position[2] })
    }
  }

  const selectionSize = size.map((value, index) => (object.kind === 'dice' ? 1.65 : value) + (index === 1 ? .045 : .09)) as Vec3
  const outline = useMemo(() => {
    const box = new THREE.BoxGeometry(...selectionSize); const edges = new THREE.EdgesGeometry(box); box.dispose(); return edges
  }, [selectionSize[0], selectionSize[1], selectionSize[2]])
  useEffect(() => () => outline.dispose(), [outline])
  const label = object.faceDown && object.kind === 'card' ? '盖牌' : object.name
  return <><RigidBody ref={body} name={`table-object:${object.id}`} type={held ? 'kinematicPosition' : 'fixed'} position={object.position} rotation={object.rotation} colliders={false} collisionGroups={playMode && object.kind === 'dice' ? interactionGroups(2, []) : undefined} friction={.85} restitution={object.kind === 'dice' ? .3 : .08}>
    {object.kind === 'dice' ? hull && <ConvexHullCollider args={[hull]} /> : object.kind === 'token' ? <CylinderCollider args={[size[1] * object.scale[1] / 2, size[0] * Math.max(object.scale[0], object.scale[2]) / 2]} /> : object.kind === 'figurine' ? <CylinderCollider args={[.7 * object.scale[1], .5 * Math.max(object.scale[0], object.scale[2])]} /> : <PropColliders object={object} size={size} />}
    <group userData={{ tablePickPriority: object.kind === 'board' ? 2 : 0 }} scale={object.scale} onPointerDown={down} onPointerMove={move} onPointerUp={event => { if (drag.current) { event.stopPropagation(); (event.target as HTMLElement).releasePointerCapture(event.pointerId); release(); gl.domElement.style.cursor = interactionLocked ? 'pointer' : 'grab' } }} onPointerOver={() => { if (tool === 'select') gl.domElement.style.cursor = playMode || object.locked || interactionLocked ? 'pointer' : 'grab' }} onPointerOut={() => { if (!drag.current) gl.domElement.style.cursor = '' }}>
      {object.kind === 'figurine' ? <BattlePieceMotion object={object} impact={playMode ? battleImpact : undefined}><ObjectVisual object={visualObject} size={size} shape={shape} /></BattlePieceMotion> : <ObjectVisual object={visualObject} size={size} shape={shape} />}
      {object.kind === 'figurine' && <mesh><cylinderGeometry args={[.5, .5, 1.4, 16]} /><meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} /></mesh>}
      {selected && !playMode && <lineSegments geometry={outline} raycast={ignoreRaycast}><lineBasicMaterial color={GOLD} depthTest={false} transparent opacity={.9} /></lineSegments>}
      {selected && !playMode && <SceneLabel position={[0, Math.max(size[1] / 2, object.kind === 'dice' ? .8 : 0) + .55, 0]} text={`${label}${object.kind === "figurine" && typeof object.metadata.hp === "number" ? ` · ${object.metadata.hp}/${object.metadata.vitality ?? 6} HP` : ""}${object.locked ? ' · 已锁定' : ''}`} />}
    </group>
  </RigidBody>{selected && playMode && <PlaySelectionFeedback body={body} object={object} size={size} label={label} />}{guided && !playMode && <GuideObjectHalo body={body} size={size} scale={object.scale} />}</>
}

function Table({ grid, surface: spec, tool, onSelect, onMeasure, onDestination }: Pick<TableCanvasProps, 'tool' | 'onSelect' | 'onMeasure' | 'onDestination'> & { grid: TableSession['grid']; surface: TableSurface }) {
  const halfX = spec.width / 2, halfZ = spec.depth / 2
  const [measurement, setMeasurement] = useState<{ start: Vec3; end: Vec3 } | null>(null)
  const measuring = useRef(false)
  const start = useRef<Vec3>([0, .045, 0])
  const surface = usePaintedTexture((ctx, w, h) => {
    ctx.fillStyle = '#3b2b1d'; ctx.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 3) {
      ctx.beginPath(); ctx.moveTo(0, y)
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y + Math.sin(x / 36 + y / 21) * 3 + Math.sin(x / 89) * 2)
      ctx.strokeStyle = y % 9 === 0 ? 'rgba(191,144,85,.11)' : 'rgba(20,12,7,.19)'; ctx.lineWidth = 1; ctx.stroke()
    }
  }, [], 512, 512)
  surface.wrapS = surface.wrapT = THREE.RepeatWrapping; surface.repeat.set(4, 3)
  const wood = usePaintedTexture((ctx, w, h) => {
    ctx.fillStyle = '#3e3126'; ctx.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 4) {
      ctx.beginPath(); ctx.moveTo(0, y)
      for (let x = 0; x < w; x += 20) ctx.lineTo(x, y + Math.sin(x / 50 + y) * 2)
      ctx.strokeStyle = y % 12 === 0 ? '#64513a' : '#33291f'; ctx.lineWidth = y % 12 === 0 ? 1.5 : .5; ctx.stroke()
    }
  }, [])
  const lines = useMemo(() => {
    const points: number[] = []; const step = clamp(grid.size, .1, 5)
    // Anchor grid lines and snapping to the same origin at every grid size.
    for (let x = Math.ceil(-halfX / step) * step; x < halfX; x += step) points.push(x, .008, -halfZ, x, .008, halfZ)
    for (let z = Math.ceil(-halfZ / step) * step; z < halfZ; z += step) points.push(-halfX, .008, z, halfX, .008, z)
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); return geometry
  }, [grid.size, halfX, halfZ])
  useEffect(() => () => lines.dispose(), [lines])
  useEffect(() => { const end = () => { measuring.current = false }; window.addEventListener('pointerup', end); return () => window.removeEventListener('pointerup', end) }, [])
  const groundEvent = (event: ThreeEvent<PointerEvent>, down: boolean) => {
    if (event.button !== 0 && down) return
    if (tool !== 'measure') { if (down) { if (onDestination) onDestination([event.point.x, event.point.y, event.point.z]); else onSelect(null); } return }
    event.stopPropagation()
    const end: Vec3 = [event.point.x, .045, event.point.z]
    if (down) { start.current = end; measuring.current = true; (event.target as HTMLElement).setPointerCapture(event.pointerId) }
    if (!measuring.current) return
    setMeasurement({ start: start.current, end })
    onMeasure?.(Math.hypot(end[0] - start.current[0], end[2] - start.current[2]))
  }
  const distance = measurement ? Math.hypot(measurement.end[0] - measurement.start[0], measurement.end[2] - measurement.start[2]) : 0
  return <>
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[halfX, .24, halfZ]} position={[0, -.24, 0]} friction={.95} restitution={.12} />
      <mesh userData={{ tablePickPriority: 2 }} receiveShadow position={[0, -.24, 0]} onPointerDown={event => groundEvent(event, true)} onPointerMove={event => groundEvent(event, false)} onPointerUp={event => { if (measuring.current) { (event.target as HTMLElement).releasePointerCapture(event.pointerId); measuring.current = false } }}>
        <boxGeometry args={[spec.width, .48, spec.depth]} /><meshStandardMaterial map={surface} roughness={1} />
      </mesh>
      {[-1, 1].flatMap(sign => [
        <group key={`x${sign}`}><CuboidCollider position={[sign * (halfX + .35), -.1, 0]} args={[.35, .35, halfZ + .7]} /><mesh position={[sign * (halfX + .35), -.1, 0]} castShadow receiveShadow><boxGeometry args={[.7, .7, spec.depth + 1.4]} /><meshStandardMaterial map={wood} roughness={.65} /></mesh></group>,
        <group key={`z${sign}`}><CuboidCollider position={[0, -.1, sign * (halfZ + .35)]} args={[halfX, .35, .35]} /><mesh position={[0, -.1, sign * (halfZ + .35)]} castShadow receiveShadow><boxGeometry args={[spec.width, .7, .7]} /><meshStandardMaterial map={wood} roughness={.65} /></mesh></group>,
      ])}
    </RigidBody>
    {grid.enabled && <lineSegments geometry={lines} raycast={ignoreRaycast}><lineBasicMaterial color="#dcc397" transparent opacity={.14} depthWrite={false} /></lineSegments>}
    {[-1, 1].flatMap(x => [-1, 1].map(z => <mesh key={`${x}${z}`} position={[x * (halfX + .35), .258, z * (halfZ - .5)]} rotation={[-Math.PI / 2, 0, 0]} raycast={ignoreRaycast}><circleGeometry args={[.09, 16]} /><meshStandardMaterial color="#ba9e65" metalness={.6} roughness={.4} /></mesh>))}
    {measurement && tool === 'measure' && <>
      <Line points={[measurement.start, measurement.end]} color={GOLD} lineWidth={2} dashed dashSize={.18} gapSize={.1} depthTest={false} />
      {[measurement.start, measurement.end].map((position, index) => <mesh key={index} position={position} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.08, .12, 32]} /><meshBasicMaterial color={GOLD} depthTest={false} /></mesh>)}
      <SceneLabel position={[(measurement.start[0] + measurement.end[0]) / 2, .3, (measurement.start[2] + measurement.end[2]) / 2]} variant="measure" text={`${distance.toFixed(2)} 桌面单位`} />
    </>}
  </>
}

function CameraControls({ view, dragging, focusBounds, tableId, savedPose, reset = 0, atlas = false, playMode = false, followTarget, onChange }: { view: TableCanvasProps['view']; dragging: boolean; focusBounds: TableCanvasProps['focusBounds']; tableId: string; savedPose?: CameraPose; reset?: number; atlas?: boolean; playMode?: boolean; followTarget?: Vec3; onChange: TableCanvasProps['onCameraChange'] }) {
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null)
  const { camera, size } = useThree()
  const applied = useRef('')
  const owner = useRef<{ tableId: string; view: TableCanvasProps['view'] } | null>(null)
  const latestChange = useRef(onChange); latestChange.current = onChange
  const interacting = useRef(false)
  const followDelta = useMemo(() => new THREE.Vector3(), [])
  const [limits, setLimits] = useState({ minDistance: 2, maxDistance: 450 })
  const remember = useCallback((flush = false) => {
    if (!owner.current || !controls.current) return
    latestChange.current?.(owner.current.tableId, owner.current.view, {
      position: camera.position.toArray() as Vec3, target: controls.current.target.toArray() as Vec3,
    }, flush)
  }, [camera])
  const frame = useMemo(() => {
    if (!focusBounds || !focusBounds.center.every(Number.isFinite) || !Number.isFinite(focusBounds.width) || !Number.isFinite(focusBounds.depth) || focusBounds.width <= 0 || focusBounds.depth <= 0) {
      return { position: new THREE.Vector3(...(view === 'top' ? [0, 30, .01] as Vec3 : playMode ? GAME_CAMERA_DIRECTION : [18, 22, 23] as Vec3)), target: new THREE.Vector3(), maxDistance: 55, minDistance: 5 }
    }
    const direction = (view === 'top' ? new THREE.Vector3(0, 1, .00035) : new THREE.Vector3(...(playMode && !atlas ? GAME_CAMERA_DIRECTION : [18, 22, 23] as Vec3))).normalize()
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize()
    const up = new THREE.Vector3().crossVectors(direction, right).normalize()
    const tanVertical = Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov) / 2)
    const tanHorizontal = tanVertical * size.width / Math.max(1, size.height)
    const cueRatio = atlas ? 0 : Math.min(.35, 70 / Math.max(1, size.height)), padding = atlas ? 1.12 : playMode && view === 'perspective' ? 1.08 : 1.3
    const verticalLimit = (1 - cueRatio) / padding
    let distance = 4
    // Fit the editing table and atlas; gameplay uses a closer frontal view of the scene.
    // The lower 70px is reserved for the action dock.
    for (const x of [-focusBounds.width / 2, focusBounds.width / 2]) for (const z of [-focusBounds.depth / 2, focusBounds.depth / 2]) {
      const corner = new THREE.Vector3(x, 0, z)
      const toward = corner.dot(direction)
      const vertical = corner.dot(up)
      distance = Math.max(distance,
        toward + Math.abs(corner.dot(right)) * padding / Math.max(.001, tanHorizontal),
        (vertical + toward * tanVertical * (cueRatio + verticalLimit)) / (tanVertical * verticalLimit),
        (-vertical + toward * tanVertical * (verticalLimit - cueRatio)) / (tanVertical * verticalLimit))
    }
    distance += .5
    if (playMode && !atlas && view === 'perspective') distance *= .68
    const target = new THREE.Vector3(...focusBounds.center).addScaledVector(up, -distance * tanVertical * cueRatio)
    return { position: target.clone().addScaledVector(direction, distance), target, maxDistance: Math.max(55, distance * 2), minDistance: 2 }
    // Follow numeric bounds rather than their object identity, preserving mouse zoom on rerenders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, camera, atlas, playMode, size.width, size.height, focusBounds?.center[0], focusBounds?.center[1], focusBounds?.center[2], focusBounds?.width, focusBounds?.depth])
  useEffect(() => {
    const identity = `${tableId}:${view}:${reset}`
    if (applied.current === identity) return
    applied.current = identity
    owner.current = { tableId, view }
    const position = savedPose ? new THREE.Vector3(...savedPose.position) : frame.position
    const target = savedPose ? new THREE.Vector3(...savedPose.target) : frame.target
    setLimits({ minDistance: frame.minDistance, maxDistance: Math.min(450, Math.max(frame.maxDistance, position.distanceTo(target))) })
    camera.position.copy(position)
    camera.lookAt(target)
    if (controls.current) { controls.current.target.copy(target); controls.current.update() }
    remember(true)
    // Bounds and resize can update the fit suggestion, but must not override a player's camera.
  }, [frame, camera, tableId, view, reset, savedPose, remember])
  useFrame((_, seconds) => {
    if (!followTarget || atlas || dragging || interacting.current || !controls.current) return
    const step = cameraFollowStep(controls.current.target.toArray() as Vec3, followTarget, seconds)
    if (step.every(n => n === 0)) return
    followDelta.set(...step)
    controls.current.target.add(followDelta)
    camera.position.add(followDelta)
    controls.current.update()
  })
  useEffect(() => () => remember(true), [remember])
  return <OrbitControls ref={controls} makeDefault enabled={!dragging} enablePan={!followTarget} enableDamping dampingFactor={.09} minDistance={limits.minDistance} maxDistance={limits.maxDistance} maxPolarAngle={Math.PI / 2 - .035} minPolarAngle={.001} enableRotate={view !== 'top'} onChange={() => remember()} onStart={() => { interacting.current = true }} onEnd={() => { interacting.current = false; remember(true) }} mouseButtons={{ LEFT: undefined, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }} />
}

function WorldTextEffect({ table, value }: { table: TableSession; value: { effect: TavernEffect; key: number } }) {
  const o = table.objects.find(o => o.id === value.effect.target || o.metadata.adventureObjectId === value.effect.target || o.metadata.characterId === value.effect.target);
  if (!o || o.faceDown || ['hand', 'inventory'].includes(String(o.metadata.zone))) return null;
  return <Html center position={[o.position[0], o.position[1] + (o.kind === 'card' ? .3 : 1.5), o.position[2]]} style={{ pointerEvents: 'none' }} zIndexRange={[8, 7]}><TavernEffectImage key={value.key} className="bt-world-effect" effect={value.effect} /></Html>;
}
function Scene(props: TableCanvasProps) {
  const [dragging, setDragging] = useState(false)
  const guidedIds = useMemo(() => new Set(props.guideObjectIds), [props.guideObjectIds])
  const rollingObjects = props.session.objects.filter(o => o.kind === 'dice' && !o.locked && props.rollRequests[o.id] > 0)
  const rollingIds = new Set(rollingObjects.map(o => o.id))
  const rollKey = rollingObjects.map(o => `${o.id}:${props.rollRequests[o.id]}`).sort().join('|')
  return <>
    <color attach="background" args={['#19130e']} />
    <fog attach="fog" args={['#19130e', Math.max(38, tableSurface(props.session).width * 1.7, tableSurface(props.session).depth * 1.7), Math.max(95, tableSurface(props.session).width * 3, tableSurface(props.session).depth * 3)]} />
    <ambientLight intensity={.85} />
    <hemisphereLight args={['#ead9b8', '#2b1c13', 1.1]} />
    <directionalLight position={[6, 24, 12]} intensity={2.8} color="#fff0d7" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-22} shadow-camera-right={22} shadow-camera-top={18} shadow-camera-bottom={-18} shadow-camera-near={.1} shadow-camera-far={65} shadow-bias={-.0004} shadow-normalBias={.035} />
    <directionalLight position={[-16, 10, -8]} intensity={.8} color="#d6c4a9" />
    <mesh position={[0, -1, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[200, 200]} /><meshStandardMaterial color="#1a130d" roughness={1} /></mesh>
    <Suspense fallback={<SceneLabel text="正在准备物理桌面…" variant="loading" />}>
      <Physics key={`${props.session.id}:${props.generation ?? 0}`} gravity={[0, props.session.physics.gravity ? -9.81 : 0, 0]} timeStep={1 / 60}>
        <Table grid={props.session.grid} surface={tableSurface(props.session)} tool={props.tool} onSelect={props.onSelect} onMeasure={props.onMeasure} onDestination={props.onDestination} />
        {props.session.objects.filter(object => !rollingIds.has(object.id) && !(props.playMode && (object.metadata.rpgRollDie || object.metadata.adventureDie || object.id === 'rpg-dice-tray' && object.metadata.rpgGenerated))).map(object => <PhysicalObject key={object.id} object={object} visualObject={presentObject(props.session, object)} selected={props.selectedId === object.id || Boolean(props.selectedIds?.includes(object.id))} guided={guidedIds.has(object.id)} interactionLocked={props.interactionLocked ?? false} playMode={props.playMode ?? false} battleImpact={props.battleImpact} onDestination={props.onDestination} grid={props.session.grid} bounds={tableBounds(props.session)} tool={props.tool} uprightRequest={props.uprightRequests?.[object.id] ?? 0} onSelect={props.onSelect} onTransform={props.onTransform} onDragging={setDragging} />)}
        {rollKey && <TableDiceRolls key={`${props.session.id}:${props.generation ?? 0}:${rollKey}`} session={props.session} requests={props.rollRequests} generation={props.generation ?? 0} onResult={props.onDiceResult} onError={props.onRollError} onSelect={props.onSelect} floating={props.playMode} />}
      </Physics>
    </Suspense>
    {props.presentationEffect && ['piece', 'card'].includes(props.presentationEffect.effect.scope) && <WorldTextEffect table={props.session} value={props.presentationEffect} />}
    <RpgWorldRoutes table={props.session} playMode={props.playMode ?? false} locked={Boolean(props.session.combat || props.session.adventure?.progress.rpg?.pending || props.session.adventure?.progress.rpg?.frames.length || props.session.adventure?.progress.phase === 'complete')} onSelect={props.onSelect} />
    {props.battleImpact && <BattleHitRings key={props.battleImpact.key} impact={props.battleImpact} />}
    {props.guideCells && props.guideCells.length > 0 && <GuideCells cells={props.guideCells} tool={props.tool} onGuideCell={props.onGuideCell} playMode={props.playMode ?? false} />}
    {props.effectCells?.map((cell, i) => <mesh key={`effect-${i}`} position={cell.position} rotation={[-Math.PI / 2, 0, 0]} raycast={ignoreRaycast} renderOrder={10}><planeGeometry args={[cell.size, cell.size]} /><meshBasicMaterial color={cell.color} transparent opacity={.52} depthWrite={false} polygonOffset polygonOffsetFactor={-2} /></mesh>)}
    {props.session.combat?.rpg && props.session.objects.filter(o => props.session.combat!.rpg!.units[o.id]).map(o => {
      const u = props.session.combat!.rpg!.units[o.id], active = o.id === props.session.combat!.order[props.session.combat!.turn]
      return <SceneLabel key={`battle-label-${o.id}`} plain position={[o.position[0], o.position[1] + 1.1, o.position[2]]} text={`${active ? '▶ ' : ''}${o.name} · ${u.stats.hp}/${o.metadata.vitality}${active ? ` · EP${u.stats.ep}` : ''}${u.stats.hp === 0 ? ' · 倒下' : ''}${u.stats.poison ? ' · 毒' : ''}${u.stun ? ' · 停滞' : ''}${u.guarded ? ' · 防御' : ''}${u.shieldTurns ? ' · 护盾' : ''}`} />
    })}
    <CameraControls view={props.view} dragging={dragging} focusBounds={props.focusBounds} tableId={props.cameraScope ?? props.session.id} savedPose={props.cameraPose} reset={props.cameraReset} atlas={props.session.adventure?.progress.rpg?.mapId === 'world'} playMode={props.playMode} followTarget={props.cameraFollowTarget} onChange={props.onCameraChange} />
  </>
}

const failedView = <div role="status" style={{ minHeight: 420, display: 'grid', placeContent: 'center', padding: 24, color: '#dedac8', background: '#17291f', textAlign: 'center', lineHeight: 1.8 }}>三维桌面未能启动。<br />请在支持 WebGL 的浏览器中启用硬件加速后重新打开。</div>

class WebGLErrorBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? failedView : this.props.children }
}

export default function TableCanvas(props: TableCanvasProps) {
  return <div className="table-canvas" style={{ width: '100%', height: '100%', minHeight: 180, position: 'relative' }} onContextMenu={event => event.preventDefault()}>
    <WebGLErrorBoundary>
      <Canvas aria-label="三维桌游桌面" events={tablePointerEvents} shadows={{ type: THREE.PCFShadowMap }} dpr={[1, 1.75]} camera={{ position: [18, 22, 23], fov: 43, near: .1, far: 700 }} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }} fallback={<span>此浏览器需要支持 WebGL。</span>} style={{ position: 'absolute', inset: 0, touchAction: 'none' }}>
        <Scene {...props} />
        {props.children}
      </Canvas>
    </WebGLErrorBoundary>
  </div>
}
