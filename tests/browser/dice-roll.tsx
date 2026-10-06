import { Suspense, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useThree } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import * as THREE from 'three'
import TableDiceRolls from '../../src/components/TableDiceRolls'
import { makeDiceShape, readDiceValue } from '../../src/components/dice-geometry'
import { createObject, createTableSession } from '../../src/lib/tabletop'
import { clawSymbolFaces } from '../../src/lib/dice-style'

// Exercise the real renderer and Rapier simulation without opening or saving a game.
type Frame = { time: number; poses: number[][] }
const evidence = { frames: [] as Frame[], results: [] as { id: string; value: number }[], errors: [] as string[] }
let done = false
const sides = (index: number) => Number(new URLSearchParams(location.search).get('sides')) || [4, 6, 8, 10, 12, 20, 6, 8][index % 8]
function analyze(count: number, batch: number) {
  const late = evidence.frames.filter(frame => frame.time >= 1.5), first = late[0]
  const delta = (a: number[], b: number[]) => Math.max(...a.map((value, axis) => Math.abs(value - b[axis])))
  const maxLateDelta = first ? Math.max(0, ...late.flatMap(frame => frame.poses.map((pose, i) => delta(pose, first.poses[i])))) : Infinity
  // Detect a die which pauses for 100 ms, then starts moving again.
  let resumedAfterRest = 0
  for (let die = 0; die < count; die++) {
    let start = 0, confirmed = false
    for (let frame = 1; frame < evidence.frames.length; frame++) {
      const current = evidence.frames[frame], stable = evidence.frames[start]
      if (delta(current.poses[die], stable.poses[die]) > 1e-10) {
        if (confirmed) { resumedAfterRest++; break }
        start = frame
      } else if (current.time - stable.time >= .1) confirmed = true
    }
  }
  const faceMatches = evidence.results.every((result, index) => {
    const shape = makeDiceShape(sides(index))
    const q = new THREE.Quaternion(...evidence.frames.at(-1)!.poses[index].slice(3, 7) as [number, number, number, number])
      .premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -.95))
    const matches = readDiceValue(shape, sides(index), q, [1, 1, 1]) === result.value
    shape.geometry.dispose(); return matches
  })
  return { batch, dice: count, frames: evidence.frames.length, maxLateDelta, resumedAfterRest, faceMatches,
    resultCount: evidence.results.length, uniqueResults: new Set(evidence.results.map(result => result.id)).size, errors: evidence.errors }
}
function ObserveRender() {
  const gl = useThree(state => state.gl)
  useEffect(() => {
    const render = gl.render.bind(gl)
    let started = 0
    gl.render = (scene, camera) => {
      render(scene, camera)
      if (done || !('isOrthographicCamera' in camera) || camera.position.z !== 500) return
      const groups = scene.children.filter(child => child.type === 'Group')
      if (!groups.length) return
      const now = performance.now(); if (!evidence.frames.length) started = now
      evidence.frames.push({ time: (now - started) / 1000, poses: groups.map(node => [
        ...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray(),
      ]) })
      if (evidence.results.length === groups.length && now - started > 2700) done = true
    }
    return () => { gl.render = render }
  }, [gl])
  return null
}
function App() {
  const [batch, setBatch] = useState(1), [summary, setSummary] = useState('正在准备')
  const [history, setHistory] = useState<ReturnType<typeof analyze>[]>([]), [remaining, setRemaining] = useState(0)
  const session = useMemo(() => {
    const session = createTableSession('sandbox')
    const count = Number(new URLSearchParams(location.search).get('count') || 8)
    session.objects = Array.from({ length: count }, (_, index) => createObject('dice', {
      id: `check-${index}`, sides: sides(index),
      position: [0, .8, 0], scale: index % 2 ? [.58, .58, .58] : [1, 1, 1],
      ...(index % 8 === 6 && sides(index) === 6 ? { diceFaces: clawSymbolFaces('agent') } : {}),
    }))
    return session
  }, [])
  const requests = useMemo(() => Object.fromEntries(session.objects.map(o => [o.id, batch])), [batch, session])
  useEffect(() => {
    const interval = setInterval(() => {
      if (!done) return
      const report = analyze(session.objects.length, batch)
      setSummary(JSON.stringify(report)); setHistory(history => [...history, report])
      document.getElementById('evidence')!.textContent = JSON.stringify(evidence)
      clearInterval(interval)
      if (remaining > 0) { setRemaining(value => value - 1); repeat() }
    }, 100)
    return () => clearInterval(interval)
  }, [batch, remaining, session])
  function repeat() { evidence.frames = []; evidence.results = []; evidence.errors = []; done = false; setSummary('投掷中'); setBatch(value => value + 1) }
  return <>
    <header style={{ padding: 16, height: 68, boxSizing: 'border-box' }}><button onClick={repeat}>再次投掷</button> <button onClick={() => { setHistory([]); setRemaining(2); repeat() }}>连续检查三轮</button> <output id="summary" style={{ fontSize: 12 }}>{summary}</output></header>
    <div style={{ height: 'calc(100vh - 100px)' }}><Canvas camera={{ position: [0, 10, 15] }}>
      <color attach="background" args={['#263b2c']} />
      <gridHelper args={[24, 24, '#6b7961', '#435744']} />
      <ObserveRender /><Suspense fallback={null}><Physics paused>
        <TableDiceRolls key={batch} session={session} requests={requests} generation={batch} floating onSelect={() => {}}
          onResult={(id, value) => { evidence.results.push({ id, value }); return true }}
          onError={message => { evidence.errors.push(message); done = true }} />
      </Physics></Suspense>
    </Canvas></div><pre id="evidence" hidden /><pre id="history" hidden>{JSON.stringify(history)}</pre>
  </>
}
createRoot(document.getElementById('root')!).render(<App />)
