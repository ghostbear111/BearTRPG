import { Component, useEffect, useMemo, useRef, type PropsWithChildren } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { TableObject } from '../lib/tabletop'
import { dimensions, ObjectVisual, useDiceShape } from './tabletop-visuals'

export interface ObjectPreviewProps { object: TableObject }

function PreviewScene({ object }: ObjectPreviewProps) {
  const shape = useDiceShape(object.kind === 'dice' ? object.sides : null)
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null)
  const { camera, size: viewport } = useThree()
  const size = useMemo(() => dimensions(object), [object.kind, object.metadata?.width, object.metadata?.height, object.metadata?.depth])
  const bounds = useMemo(() => {
    const half = new THREE.Vector3(...size).multiplyScalar(.5)
    const box = new THREE.Box3(half.clone().negate(), half)
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion().setFromEuler(new THREE.Euler(...object.rotation)), new THREE.Vector3(...object.scale))
    return box.applyMatrix4(matrix)
  }, [size, object.scale[0], object.scale[1], object.scale[2], object.rotation[0], object.rotation[1], object.rotation[2]])
  const radius = Math.max(.15, bounds.getSize(new THREE.Vector3()).length() / 2)
  const perspective = camera as THREE.PerspectiveCamera
  const vertical = THREE.MathUtils.degToRad(perspective.fov)
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * (viewport.width / Math.max(1, viewport.height)))
  const distance = radius / Math.sin(Math.min(vertical, horizontal) / 2) * 1.1

  useEffect(() => {
    perspective.position.copy(new THREE.Vector3(1.7, 1.55, 2.4).normalize().multiplyScalar(distance))
    perspective.near = Math.max(.005, radius / 1000)
    perspective.far = Math.max(100, distance * 8)
    perspective.lookAt(0, 0, 0)
    perspective.updateProjectionMatrix()
    if (controls.current) { controls.current.target.set(0, 0, 0); controls.current.update() }
  }, [perspective, distance, radius, object.id])

  return <>
    <color attach="background" args={['#172820']} />
    <ambientLight intensity={1.1} />
    <hemisphereLight args={['#fff1d8', '#294238', 1.5]} />
    <directionalLight position={[radius * 2, radius * 4, radius * 3]} intensity={2.7} color="#fff1dc" />
    <directionalLight position={[-radius * 3, radius, -radius * 2]} intensity={1.2} color="#9fc9cb" />
    <group rotation={object.rotation} scale={object.scale}>
      <ObjectVisual object={object} size={size} shape={shape} />
    </group>
    <mesh position={[0, bounds.min.y - .02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[radius * 4, 64]} /><meshStandardMaterial color="#20392d" roughness={1} />
    </mesh>
    <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={.09} enablePan={false} minDistance={distance * .35} maxDistance={distance * 2.5} minPolarAngle={.001} maxPolarAngle={Math.PI - .001} />
  </>
}

class PreviewBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <div role="status" style={{ padding: 24, color: '#e4d9bd', textAlign: 'center' }}>三维预览未能启动，请启用浏览器硬件加速后重试。</div> : this.props.children
  }
}

/** Orbiting this standalone view never changes the saved asset or tabletop. */
export default function ObjectPreview({ object }: ObjectPreviewProps) {
  return <div className="object-preview" style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0, background: '#172820', borderRadius: 8, overflow: 'hidden' }} onContextMenu={event => event.preventDefault()}>
    <PreviewBoundary>
      <Canvas aria-label={`${object.name} 物件三维预览，可拖动旋转`} frameloop="demand" dpr={[1, 1.5]} camera={{ position: [3, 3, 5], fov: 38, near: .01, far: 400 }} gl={{ antialias: true, alpha: false }} fallback={<span>此浏览器需要支持 WebGL。</span>} style={{ position: 'absolute', inset: 0, touchAction: 'none' }}>
        <PreviewScene object={object} />
      </Canvas>
    </PreviewBoundary>
  </div>
}
