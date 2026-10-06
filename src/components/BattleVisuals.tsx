import { useEffect, useMemo, useRef, type PropsWithChildren } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { TableObject } from '../lib/tabletop'
import type { BattleImpact } from '../lib/battle-presentation'

export function BattlePieceMotion({ object, impact, children }: PropsWithChildren<{ object: TableObject; impact?: BattleImpact }>) {
  const group = useRef<THREE.Group>(null), elapsed = useRef(1)
  const direction = useMemo(() => {
    if (!impact) return new THREE.Vector3()
    const vector = new THREE.Vector3(...impact.target).sub(new THREE.Vector3(...impact.origin)).setY(0)
    if (!vector.lengthSq()) vector.set(0, 0, -1)
    return vector.normalize().applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...object.rotation)).invert())
  }, [impact, object.rotation])
  const hit = impact?.hits.find(h => h.id === object.id), actor = impact?.actor === object.id
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  useEffect(() => { elapsed.current = 0 }, [impact?.key])
  useFrame((_, delta) => {
    const node = group.current
    if (!node) return
    elapsed.current += Math.min(delta, .05)
    node.position.set(0, 0, 0); node.rotation.set(0, 0, 0); node.scale.set(1, 1, 1)
    if (!impact || reduced || elapsed.current > .72) return
    const time = elapsed.current
    if (actor && impact.kind !== 'support') {
      const lunge = time < .2 ? Math.sin(time / .2 * Math.PI / 2) : Math.max(0, 1 - (time - .2) / .32) ** 2
      node.position.copy(direction).multiplyScalar(lunge * .48 / object.scale[0])
      node.rotation.x = direction.z * lunge * .14; node.rotation.z = -direction.x * lunge * .14
    }
    if (hit && time >= .18) {
      const progress = Math.min(1, (time - .18) / .5), pulse = Math.sin(progress * Math.PI) * (1 - progress)
      if (hit.kind === 'damage' || hit.kind === 'status') {
        node.position.addScaledVector(direction, pulse * .24 / object.scale[0])
        const wobble = Math.sin(progress * Math.PI * 5) * (1 - progress) * .09
        node.rotation.x += direction.z * wobble; node.rotation.z -= direction.x * wobble
      } else node.position.y += pulse * .12
    }
  })
  return <group ref={group}>{children}</group>
}

export function BattleHitRings({ impact }: { impact: BattleImpact }) {
  const group = useRef<THREE.Group>(null), elapsed = useRef(0)
  const geometry = useMemo(() => new THREE.RingGeometry(.34, .4, 40), [])
  const materials = useMemo(() => impact.hits.map(hit => new THREE.MeshBasicMaterial({ color: hit.kind === 'damage' || hit.kind === 'status' ? '#f5c36e' : '#8be0bb', transparent: true, opacity: 0, depthWrite: false })), [impact])
  useEffect(() => () => materials.forEach(m => m.dispose()), [materials])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame((_, delta) => {
    elapsed.current += Math.min(delta, .05)
    const t = (elapsed.current - .18) / .48
    if (group.current) { group.current.visible = t >= 0 && t <= 1; group.current.children.forEach(child => child.scale.setScalar(1 + Math.max(0, t) * .65)) }
    materials.forEach(m => { m.opacity = Math.max(0, 1 - Math.abs(t * 2 - 1)) * .8 })
  })
  // Each ring expands around its own cell, rather than scaling target positions.
  return <group ref={group}>{impact.hits.map((hit, i) => <mesh key={hit.id} position={[hit.position[0], .16, hit.position[2]]} rotation={[-Math.PI / 2, 0, 0]} geometry={geometry} material={materials[i]} dispose={null} raycast={() => {}} />)}</group>
}
