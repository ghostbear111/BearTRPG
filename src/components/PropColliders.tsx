import { CuboidCollider } from '@react-three/rapier'
import type { TableObject, Vec3 } from '../lib/tabletop'
export default function PropColliders({ object, size }: { object: TableObject; size: Vec3 }) {
  const [w, h, d] = size.map((n, i) => n * object.scale[i])
  if (['door', 'gate'].includes(String(object.metadata.model))) return <>
    {[-1, 1].map(sign => <CuboidCollider key={sign} args={[w * .05, h * .5, d * .45]} position={[sign * w * .45, 0, 0]} />)}
    <CuboidCollider args={[w * .5, h * .05, d * .45]} position={[0, h * .46, 0]} />
    {object.metadata.model === 'door' && <CuboidCollider key={String(object.metadata.opened)} args={[object.metadata.opened ? size[0] * object.scale[2] * .38 : w * .38, h * .42, object.metadata.opened ? size[2] * object.scale[0] * .11 : d * .11]} position={object.metadata.opened ? [-w * .38, -h * .02, -size[0] * object.scale[2] * .38] : [0, -h * .02, 0]} rotation={[0, object.metadata.opened ? Math.PI / 2 : 0, 0]} />}
  </>
  return <CuboidCollider args={[w / 2, h / 2, d / 2]} />
}
