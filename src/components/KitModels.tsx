import type { Vec3, TableObject } from '../lib/tabletop'
import { PROP_MODELS } from '../lib/play-kit'

function Box({ p = [0, 0, 0], s = [1, 1, 1], c = '#8c8e82', r = [0, 0, 0] }: { p?: Vec3; s?: Vec3; c?: string; r?: Vec3 }) { return <mesh position={p} rotation={r} castShadow receiveShadow><boxGeometry args={s} /><meshStandardMaterial color={c} roughness={.78} /></mesh> }
function Cylinder({ p = [0, 0, 0], radius = .3, height = 1, c = '#8c8e82', top = radius, r = [0, 0, 0], n = 16 }: { p?: Vec3; radius?: number; height?: number; c?: string; top?: number; r?: Vec3; n?: number }) { return <mesh position={p} rotation={r} castShadow receiveShadow><cylinderGeometry args={[top, radius, height, n]} /><meshStandardMaterial color={c} roughness={.72} /></mesh> }
function Orb({ p, radius = .25, c = '#7b9365', stretch = [1, 1, 1] }: { p: Vec3; radius?: number; c?: string; stretch?: Vec3 }) { return <mesh position={p} scale={stretch} castShadow><icosahedronGeometry args={[radius, 1]} /><meshStandardMaterial color={c} roughness={.7} /></mesh> }
function Flame({ lit, p = [0, .3, 0] }: { lit: boolean; p?: Vec3 }) { return lit ? <mesh position={p} scale={[.75, 1.6, .75]}><octahedronGeometry args={[.22]} /><meshStandardMaterial color="#ffd594" emissive="#ff802f" emissiveIntensity={1.4} /></mesh> : null }
function DoorLeaf({ object, size }: { object: TableObject; size: Vec3 }) {
  const [w, h, d] = size
  // Rotate the leaf after applying model dimensions, so its width becomes depth when open.
  return <group scale={[1 / w, 1 / h, 1 / d]}><group position={[-.38 * w, 0, 0]} rotation={[0, object.metadata.opened ? Math.PI / 2 : 0, 0]}>
    <Box p={[.38 * w, -.02 * h, 0]} s={[.76 * w, .84 * h, .22 * d]} c={object.color} />
    <Orb p={[.66 * w, -.08 * h, .14 * d]} radius={.04 * w} c="#b6a075" />
    {[-.25, .22].map(y => <Box key={y} p={[.38 * w, y * h, .125 * d]} s={[.7 * w, .025 * h, .03 * d]} c="#b6a075" />)}
  </group></group>
}
export function KitProp({ object, size }: { object: TableObject; size: Vec3 }) {
  const model = String(object.metadata.model); if (!PROP_MODELS.some(([key]) => key === model)) return null
  const c = object.color, dark = '#514637', metal = '#b6a075', stone = '#8b8c80'; const lit = Boolean(object.metadata.lit)
  let shape
  switch (model) {
    case 'chest': shape = <><Box s={[.95, .66, .9]} p={[0, -.13, 0]} c={c} />{[-.31, .31].map(x => <Box key={x} s={[.065, .68, .94]} p={[x, -.12, 0]} c={metal} />)}<group position={[0, .2, -.45]} rotation={[object.metadata.opened ? -1.35 : 0, 0, 0]}><Box p={[0, .13, .45]} s={[1, .24, .96]} c={c} /><Box p={[0, .13, .94]} s={[.13, .18, .03]} c={metal} /></group>{object.metadata.opened && !object.metadata.emptied && <Orb p={[0, .25, 0]} radius={.12} c="#9aceb4" />}</>; break
    case 'door': case 'gate': shape = <>{[-.45, .45].map(x => <Box key={x} p={[x, 0, 0]} s={[.1, 1, .9]} c={stone} />)}<Box p={[0, .46, 0]} s={[1, .1, .9]} c={stone} />{model === 'door' && <DoorLeaf object={object} size={size} />}</>; break
    case 'torch': shape = <><Cylinder p={[0, -.08, 0]} radius={.13} height={.82} c={c} /><Cylinder p={[0, .26, 0]} radius={.22} height={.15} c={dark} /><Flame lit={lit} p={[0, .39, 0]} /></>; break
    case 'brazier': shape = <><Cylinder p={[0, -.32, 0]} radius={.3} height={.3} c={stone} /><Cylinder p={[0, -.04, 0]} radius={.32} top={.48} height={.3} c={dark} /><Flame lit={lit} p={[0, .28, 0]} /></>; break
    case 'tree': shape = <><Cylinder p={[0, -.17, 0]} radius={.1} height={.65} c="#71523c" /><Orb p={[0, .2, 0]} radius={.44} c={c} stretch={[1, .72, 1]} /><Orb p={[-.2, .05, .14]} radius={.28} c="#83996d" stretch={[1, .7, 1]} /></>; break
    case 'rock': shape = <Orb p={[0, -.05, 0]} radius={.5} c={c} stretch={[1, .85, 1]} />; break
    case 'pillar': shape = <><Box p={[0, -.44, 0]} s={[1, .12, 1]} c={stone} /><Cylinder radius={.32} height={.84} c={c} n={8} /><Box p={[0, .44, 0]} s={[1, .12, 1]} c={stone} /></>; break
    case 'altar': shape = <><Box p={[0, -.4, 0]} s={[1, .2, 1]} c={stone} /><Box s={[.72, .6, .76]} c={c} /><Box p={[0, .38, 0]} s={[1, .22, 1]} c={stone} /><Box p={[0, .505, 0]} s={[.65, .02, .65]} c="#685d78" /></>; break
    case 'crystal': shape = <><Cylinder p={[0, -.43, 0]} radius={.45} height={.12} c={stone} /><mesh position={[0, .02, 0]} scale={[.62, 1, .62]}><octahedronGeometry args={[.55]} /><meshStandardMaterial color={c} emissive={c} emissiveIntensity={.22} metalness={.35} roughness={.18} /></mesh></>; break
    case 'barrel': shape = <><Cylinder radius={.42} height={.9} c={c} />{[-.3, .3].map(y => <Cylinder key={y} p={[0, y, 0]} radius={.44} height={.07} c={dark} />)}<Cylinder p={[0, .46, 0]} radius={.4} height={.02} c={dark} /></>; break
    case 'crate': shape = <><Box s={[.92, .92, .92]} c={c} />{[-1, 1].map(sign => <Box key={sign} p={[0, 0, sign * .475]} s={[1.15, .1, .03]} r={[0, 0, .7]} c={dark} />)}</>; break
    case 'table': case 'chair': shape = <><Box p={[0, model === 'table' ? .36 : -.03, 0]} s={[1, .14, 1]} c={c} />{[-.37, .37].flatMap(x => [-.37, .37].map(z => <Box key={`${x}-${z}`} p={[x, -.14, z]} s={[.09, .7, .09]} c={dark} />))}{model === 'chair' && <Box p={[0, .27, -.4]} s={[.85, .5, .12]} c={c} />}</>; break
    case 'tent': shape = <><Box p={[0, -.47, 0]} s={[1, .06, 1]} c={dark} />{[-1, 1].map(sign => <Box key={sign} p={[sign * .245, .015, 0]} s={[.08, 1.07, 1]} r={[0, 0, sign * .48]} c={c} />)}<Cylinder p={[0, -.04, .47]} radius={.025} height={.98} c={dark} /></>; break
    case 'bridge': shape = <><Box p={[0, -.2, 0]} s={[1, .15, 1]} c={c} />{[-.45, .45].map(x => <group key={x}><Box p={[x, .16, 0]} s={[.05, .07, 1]} c={dark} />{[-.43, 0, .43].map(z => <Box key={z} p={[x, 0, z]} s={[.07, .55, .05]} c={dark} />)}</group>)}</>; break
    case 'stairs': shape = <>{[0, 1, 2, 3, 4].map(i => <Box key={i} p={[0, -.5 + (i + 1) * .1, -.4 + i * .2]} s={[1, (i + 1) * .2, .2]} c={c} />)}</>; break
    case 'well': case 'fountain': shape = <><Cylinder p={[0, -.22, 0]} radius={.48} height={.52} c={stone} /><Cylinder p={[0, .052, 0]} radius={.38} height={.025} c="#568e98" />{model === 'fountain' ? <><Cylinder p={[0, .18, 0]} radius={.1} height={.5} c={c} /><Cylinder p={[0, .42, 0]} radius={.3} height={.08} c={stone} /></> : <>{[-.4, .4].map(x => <Box key={x} p={[x, .22, 0]} s={[.07, .55, .07]} c={dark} />)}<Box p={[0, .47, 0]} s={[.9, .07, .1]} c={dark} /></>}</>; break
    case 'lever': shape = <><Box p={[0, -.32, 0]} s={[.9, .3, .8]} c={stone} /><group rotation={[0, 0, object.metadata.activated ? -.5 : .5]}><Cylinder p={[0, .05, 0]} radius={.055} height={.65} c={dark} /><Orb p={[0, .38, 0]} radius={.13} c={metal} /></group></>; break
  }
  return <group scale={size}>{shape}</group>
}
export function KitFigure({ object }: { object: TableObject }) {
  const model = String(object.metadata.model), c = object.color, skin = model === 'orc' ? '#96ad69' : '#c6b390', metal = '#adb5b0'
  if (model === 'spider') return <><Orb p={[0, -.07, -.08]} radius={.3} c={c} /><Orb p={[0, -.1, .27]} radius={.18} c={c} />{[-1, 1].flatMap(sign => [0, 1, 2, 3].map(i => <Box key={`${sign}-${i}`} p={[sign * .33, -.25, -.3 + i * .18]} s={[.5, .045, .05]} r={[0, sign * (i - 1.5) * .45, sign * -.3]} c={c} />))}</>
  if (model === 'golem') return <><Box p={[0, -.02, 0]} s={[.5, .6, .32]} c={c} /><Box p={[0, .42, 0]} s={[.35, .3, .3]} c={c} />{[-1, 1].map(sign => <group key={sign}><Box p={[sign * .36, -.05, 0]} s={[.18, .6, .22]} c={c} /><Box p={[sign * .16, -.4, 0]} s={[.18, .3, .2]} c={c} /></group>)}</>
  return <>
    <Cylinder p={[0, -.1, 0]} radius={model === 'mage' || model === 'cleric' ? .28 : .23} top={.16} height={.7} c={c} />
    <Orb p={[0, .4, 0]} radius={.19} c={model === 'skeleton' ? '#ddd6ba' : skin} />
    {['guard', 'warrior', 'orc'].includes(model) && <Cylinder p={[0, .48, 0]} radius={.2} height={.17} c={metal} />}
    {model === 'mage' && <Cylinder p={[0, .61, 0]} radius={.27} top={0} height={.33} c={c} />}
    {model === 'rogue' && <Orb p={[0, .44, -.05]} radius={.22} c={c} stretch={[1, 1.15, .8]} />}
    {['warrior', 'guard', 'orc', 'rogue', 'skeleton'].includes(model) && <><Box p={[.3, .14, .07]} s={[.045, .66, .045]} c={metal} /><Box p={[.3, -.08, .07]} s={[.2, .045, .07]} c="#af925b" /></>}
    {['warrior', 'guard'].includes(model) && <Cylinder p={[-.3, .03, .12]} radius={.24} height={.07} c={metal} r={[Math.PI / 2, 0, 0]} />}
    {['mage', 'cleric'].includes(model) && <><Cylinder p={[.3, .04, .1]} radius={.035} height={1.05} c="#795e46" /><Orb p={[.3, .58, .1]} radius={.1} c="#85c3cf" /></>}
    {model === 'ranger' && <mesh position={[.32, .1, .1]} rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[.28, .025, 6, 18, Math.PI]} /><meshStandardMaterial color="#c2a473" /></mesh>}
    {model === 'orc' && [-1, 1].map(sign => <Cylinder key={sign} p={[sign * .19, .57, 0]} radius={.07} top={0} height={.24} c="#e2d5b7" r={[0, 0, sign * -.5]} />)}
    {model === 'skeleton' && [-.15, 0, .15].map(y => <Box key={y} p={[0, y, .17]} s={[.25, .025, .025]} c="#ddd6ba" />)}
  </>
}
