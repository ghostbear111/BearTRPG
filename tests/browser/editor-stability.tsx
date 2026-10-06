import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import TableCanvas from '../../src/components/TableCanvas'
import { createObject, createTableSession, type Vec3 } from '../../src/lib/tabletop'

// Render the actual editor; this fixture never reads or writes player storage.
type PoseFrame = { time: number; poses: Record<string, number[]> }
const frames: PoseFrame[] = [], transforms: Array<{ id: string; position: Vec3; rotation: Vec3; reason?: string }> = []
let projected: Array<{ id: string; x: number; y: number }> = [], started = 0
function ObserveRender() {
  const gl = useThree(state => state.gl)
  useEffect(() => {
    const render = gl.render.bind(gl)
    gl.render = (scene, camera) => {
  render(scene, camera)
  const poses: Record<string, number[]> = {}, points: typeof projected = []
  const rect = gl.domElement.getBoundingClientRect()
  scene.traverse(node => {
    if (!node.name.startsWith('table-object:')) return
    const id = node.name.slice('table-object:'.length)
    poses[id] = [...node.position.toArray(), ...node.quaternion.toArray()]
    const point = node.getWorldPosition(new THREE.Vector3()).project(camera)
    points.push({ id, x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 })
  })
  if (!points.length) return
  projected = points
  const now = performance.now(); if (!started) started = now
  if (frames.length < 2500) frames.push({ time: (now - started) / 1000, poses })
    }
    return () => { gl.render = render }
  }, [gl])
  return null
}

function analyze() {
  const first = frames[0]
  if (!first) return { frames: 0 }
  let maxPoseDelta = 0
  for (const frame of frames) for (const [id, values] of Object.entries(frame.poses)) {
    for (let axis = 0; axis < values.length; axis++) maxPoseDelta = Math.max(maxPoseDelta, Math.abs(values[axis] - first.poses[id][axis]))
  }
  return { frames: frames.length, seconds: frames.at(-1)!.time, objects: Object.keys(first.poses).length, maxPoseDelta, physicsWrites: transforms.filter(value => value.reason === 'physics').length, transforms }
}

function App() {
  const [session, setSession] = useState(() => {
    const table = createTableSession('rpg')
    table.workspace = { kind: 'draft' }; table.grid.snap = false
    // Deliberate collider overlap, a floating piece, and a tilted piece must all keep their authored poses.
    table.objects.push(createObject('figurine', { id: 'overlap', name: '重叠棋子', position: [...table.objects[1].position] }),
      createObject('figurine', { id: 'floating', name: '自定义高度棋子', position: [4, 3, 1] }),
      createObject('block', { id: 'tilted', name: '倾斜物件', position: [1, .5, -2], rotation: [.3, .5, .2] }))
    return table
  })
  const [selected, setSelected] = useState<string | null>(null), [summary, setSummary] = useState('{}'), [points, setPoints] = useState(projected)
  const [writes, setWrites] = useState(0), [rerenders, setRerenders] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => {
      setSession(table => ({ ...table, objects: table.objects.map(object => ({ ...object, position: [...object.position], rotation: [...object.rotation], scale: [...object.scale] })) }))
      setRerenders(value => value + 1); setSummary(JSON.stringify(analyze())); setPoints([...projected])
    }, 500)
    return () => clearInterval(interval)
  }, [])
  return <>
    <header style={{ minHeight: 65, padding: 12, boxSizing: 'border-box' }}><button onClick={() => { frames.length = 0; transforms.length = 0; started = 0; setWrites(0) }}>重新检查静止</button> <output id="selection">选中：{selected ?? '无'} · 重渲染 {rerenders} 次 · 姿态写入 {writes} 次</output><pre id="summary" style={{ margin: '4px 0', fontSize: 11 }}>{summary}</pre></header>
    <div style={{ height: 'calc(100vh - 120px)' }}><TableCanvas session={session} selectedId={selected} onSelect={setSelected}
      onTransform={(id, patch, reason) => { transforms.push({ id, ...patch, reason }); setWrites(value => value + 1); setSession(table => ({ ...table, objects: table.objects.map(object => object.id === id ? { ...object, ...patch } : object) })) }}
      onDiceResult={() => true} rollRequests={{}} view="top" tool="select" playMode={false}><ObserveRender /></TableCanvas></div>
    <ol id="objects" hidden>{points.map(point => <li key={point.id} data-id={point.id} data-x={point.x} data-y={point.y}>{session.objects.find(object => object.id === point.id)?.name}</li>)}</ol>
    <pre id="evidence" hidden>{JSON.stringify({ frames, transforms })}</pre>
  </>
}
createRoot(document.getElementById('root')!).render(<App />)
