import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { TableObject, Vec3 } from '../lib/tabletop'
import { makeDiceShape, SUPPORTED_DICE, type DiceShape } from './dice-geometry'
import type { DiceFace } from '../lib/dice'
import { CLAW_DICE_GOLD, clawFaceArtwork, diceSkinColor, diceSkinFaceColor } from '../lib/dice-style'
import { loadDiceArtwork } from './dice-artwork'
import { SharedResourceCache } from './renderer-resources'
import { KitProp, KitFigure } from './KitModels'
import { PROP_MODELS, FIGURE_MODELS } from '../lib/play-kit'
export { objectDimensions as dimensions } from '../lib/object-movement'

const clamp = THREE.MathUtils.clamp

function useSharedResource<T>(cache: SharedResourceCache<T>, key: string | null) {
  const [resource, setResource] = useState<{ key: string; value: T } | null>(null)
  // Acquire during commit, so abandoned React renders do not retain GPU resources.
  useLayoutEffect(() => {
    if (key === null) return
    const lease = cache.acquire(key)
    setResource({ key, value: lease.value })
    return lease.release
  }, [cache, key])
  return resource?.key === key ? resource.value : null
}

const diceShapes = new SharedResourceCache<DiceShape>(key => makeDiceShape(Number(key)), shape => shape.geometry.dispose(), 6)

export function useDiceShape(sides: number | null) {
  // Unsupported custom dice use a labelled cube, and cannot produce a physical result.
  return useSharedResource(diceShapes, sides === null ? null : String(SUPPORTED_DICE.includes(sides) ? sides : 6))
}

export function makeTexture(draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void, width = 512, height = 512) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context) draw(context, width, height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

export function usePaintedTexture(draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void, deps: unknown[], width = 512, height = 512) {
  // The draw function deliberately follows the listed visual dependencies.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const texture = useMemo(() => makeTexture(draw, width, height), deps)
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}

function useImageTexture(url: string) {
  const [loaded, setLoaded] = useState<{ url: string; texture: THREE.Texture } | null>(null)
  useEffect(() => {
    if (!url || !/^(data:image\/|blob:|https?:\/\/|\/)/i.test(url)) return
    let active = true
    let downloaded: THREE.Texture | undefined
    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    loader.load(url, texture => {
      downloaded = texture
      if (!active) { texture.dispose(); return }
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 8
      setLoaded({ url, texture })
    }, undefined, () => { if (active) setLoaded(null) })
    return () => { active = false; downloaded?.dispose() }
  }, [url])
  return loaded?.url === url ? loaded.texture : null
}

function useSafeTexture(url: string, fallback: THREE.Texture) { return useImageTexture(url) ?? fallback }

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 3) {
  let line = ''
  let row = 0
  for (const char of text.slice(0, 90)) {
    if (ctx.measureText(line + char).width > maxWidth && line) {
      ctx.fillText(line, x, y + row * lineHeight)
      line = char
      row += 1
      if (row >= maxLines) return
    } else line += char
  }
  if (line) ctx.fillText(line, x, y + row * lineHeight)
}

function CardSurface({ object, size }: { object: TableObject; size: Vec3 }) {
  const count = object.cards?.length ?? 0
  const front = usePaintedTexture((ctx, w, h) => {
    ctx.fillStyle = '#ece5d4'; ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = object.color; ctx.lineWidth = 14; ctx.strokeRect(22, 22, w - 44, h - 44)
    ctx.fillStyle = object.color; ctx.fillRect(38, 38, w - 76, h * .44)
    ctx.save(); ctx.translate(w / 2, h * .26); ctx.rotate(Math.PI / 4)
    ctx.strokeStyle = '#ece5d4'; ctx.lineWidth = 8; ctx.strokeRect(-62, -62, 124, 124); ctx.restore()
    ctx.fillStyle = '#283127'; ctx.font = 'bold 38px Arial, "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'
    wrapText(ctx, object.name, w / 2, h * .58, w - 100, 52)
    ctx.font = '19px Arial, "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#77746a'
    ctx.fillText(object.kind === 'deck' ? `${count} CARDS` : 'TABLETOP CARD', w / 2, h - 57)
  }, [object.name, object.color, object.kind, count], 512, 768)
  const back = usePaintedTexture((ctx, w, h) => {
    ctx.fillStyle = '#173e49'; ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#bfad7f'; ctx.lineWidth = 8; ctx.strokeRect(22, 22, w - 44, h - 44)
    ctx.lineWidth = 2; ctx.strokeRect(40, 40, w - 80, h - 80)
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(Math.PI / 4)
    for (let r = 30; r <= 130; r += 25) ctx.strokeRect(-r, -r, r * 2, r * 2)
    ctx.restore(); ctx.fillStyle = '#d4c69b'; ctx.textAlign = 'center'; ctx.font = '23px Arial, sans-serif'
    ctx.fillText(object.kind === 'deck' ? `${count} CARDS` : '◆', w / 2, h - 72)
  }, [object.kind, count], 512, 768)
  const frontMap = useSafeTexture(object.texture, front)
  const backMap = useSafeTexture(object.backTexture, back)
  return <group>
    <mesh castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={object.kind === 'deck' ? '#d1c9b6' : '#f2eddf'} roughness={.85} />
    </mesh>
    {object.kind === 'deck' && [0, 1, 2, 3].map(index => <mesh key={index} position={[0, -size[1] / 2 + .045 + index * .05, size[2] / 2 + .001]}>
      <planeGeometry args={[size[0] * .97, .004]} /><meshBasicMaterial color="#a09b8d" />
    </mesh>)}
    <mesh position={[0, size[1] / 2 + .002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size[0] * .97, size[2] * .97]} />
      <meshStandardMaterial map={object.faceDown ? backMap : frontMap} roughness={.85} />
    </mesh>
    <mesh position={[0, -size[1] / 2 - .002, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size[0] * .97, size[2] * .97]} />
      <meshStandardMaterial map={object.faceDown ? frontMap : backMap} roughness={.85} />
    </mesh>
  </group>
}

function BoardSurface({ object, size }: { object: TableObject; size: Vec3 }) {
  const fallback = usePaintedTexture((ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, w, h)
    const color = new THREE.Color(object.color)
    gradient.addColorStop(0, `#${color.clone().lerp(new THREE.Color('#9eaf8e'), .16).getHexString()}`)
    gradient.addColorStop(1, `#${color.clone().multiplyScalar(.8).getHexString()}`)
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h)
    const style = object.metadata.surface
    if (style === 'stone' || style === 'port') {
      ctx.strokeStyle = style === 'port' ? '#493f2d' : '#495349'; ctx.lineWidth = 4
      const step = style === 'port' ? 38 : 80
      for (let y = 0; y < h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); for (let x = (Math.floor(y / step) % 2) * 70; x < w; x += 140) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + step); ctx.stroke() } }
    } else if (style === 'forest' || style === 'snow' || style === 'sand') {
      ctx.fillStyle = style === 'forest' ? '#90a47766' : style === 'snow' ? '#edf2e577' : '#dcc39355'
      for (let i = 0; i < 70; i++) { ctx.beginPath(); ctx.ellipse((i * 193) % w, (i * 113) % h, 25 + (i % 4) * 10, 15 + (i % 3) * 10, i, 0, Math.PI * 2); ctx.fill() }
    } else if (style === 'ritual') {
      ctx.strokeStyle = '#d9c598'; ctx.lineWidth = 3
      for (const radius of [130, 210, 260]) { ctx.beginPath(); ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2); ctx.stroke() }
      for (let i = 0; i < 6; i++) { const angle = i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(w / 2, h / 2); ctx.lineTo(w / 2 + Math.cos(angle) * 260, h / 2 + Math.sin(angle) * 260); ctx.stroke() }
    }
    ctx.strokeStyle = '#a2b298'; ctx.lineWidth = 3; ctx.strokeRect(20, 20, w - 40, h - 40)
    ctx.strokeStyle = 'rgba(218,226,207,.27)'; ctx.lineWidth = 1
    const cols = Math.max(2, Math.round(size[0])); const rows = Math.max(2, Math.round(size[2]))
    for (let x = 1; x < cols; x++) { ctx.beginPath(); ctx.moveTo(w * x / cols, 0); ctx.lineTo(w * x / cols, h); ctx.stroke() }
    for (let y = 1; y < rows; y++) { ctx.beginPath(); ctx.moveTo(0, h * y / rows); ctx.lineTo(w, h * y / rows); ctx.stroke() }
    ctx.fillStyle = '#c5d1bb'; ctx.font = '18px Arial, "Microsoft YaHei", sans-serif'; ctx.fillText(object.name.slice(0, 40), 38, 52)
  }, [object.name, object.color, object.metadata.surface, size[0], size[2]], 1024, 768)
  const texture = useSafeTexture(object.texture, fallback)
  return <group>
    <mesh castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={object.color} roughness={.9} /></mesh>
    <mesh receiveShadow position={[0, size[1] / 2 + .002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size[0] * .993, size[2] * .993]} /><meshStandardMaterial map={texture} roughness={.96} />
    </mesh>
  </group>
}

function makeDiceAppearance(sides: number, colorHex: string, faces?: DiceFace[]) {
  const shape = makeDiceShape(sides)
  let disposed = false
  const listeners = new Set<() => void>()
  const maps = shape.values.map((value, face) => makeTexture((ctx, w, h) => {
    const custom = faces?.[value - 1], faceColor = diceSkinFaceColor(colorHex, custom), unit = w / 256
    ctx.fillStyle = faceColor; ctx.fillRect(0, 0, w, h)
    // Match the reference's flat gold artwork, including on numeric dice.
    ctx.fillStyle = CLAW_DICE_GOLD
    if (custom && sides !== 4) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      const maxWidth = sides === 20 || sides === 8 ? w * .48 : w * .65
      ctx.font = `600 ${(sides === 20 || sides === 8 ? 76 : 100) * unit}px Arial, "Microsoft YaHei", sans-serif`
      ctx.fillText(custom.symbol || custom.label || String(custom.value), w / 2, h * .49, maxWidth)
      if (custom.symbol && custom.label) { ctx.font = `500 ${25 * unit}px Arial, "Microsoft YaHei", sans-serif`; ctx.fillText(custom.label, w / 2, h * .66, maxWidth) }
    } else if (sides === 6) {
      const positions: Record<number, [number, number][]> = { 1: [[.5, .5]], 2: [[.28, .28], [.72, .72]], 3: [[.28, .28], [.5, .5], [.72, .72]], 4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]], 5: [[.28, .28], [.72, .28], [.5, .5], [.28, .72], [.72, .72]], 6: [[.28, .25], [.72, .25], [.28, .5], [.72, .5], [.28, .75], [.72, .75]] }
      positions[value].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(w * x, h * y, w * (value === 1 ? .09 : .06), 0, Math.PI * 2); ctx.fill() })
    } else if (sides === 4 && shape.corners) {
      const corners = shape.corners[face]
      const centerU = corners.reduce((sum, corner) => sum + corner.u, 0) / 3
      const centerV = corners.reduce((sum, corner) => sum + corner.v, 0) / 3
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `bold ${64 * unit}px Arial, sans-serif`
      corners.forEach(corner => { const f = faces?.[corner.value - 1]; ctx.fillText(f ? f.symbol || f.label || String(f.value) : String(corner.value), (corner.u * .64 + centerU * .36) * w, (1 - corner.v * .64 - centerV * .36) * h, w * .25) })
    } else {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `600 ${(sides === 20 ? 88 : sides === 8 ? 100 : sides === 12 ? 120 : 112) * unit}px Arial, sans-serif`
      ctx.fillText(SUPPORTED_DICE.includes(sides) ? String(value) : `d${sides}`, w / 2, h * .51)
      if (value === 6 || value === 9) { ctx.fillRect(w * .43, h * .68, w * .14, 4 * unit) }
    }
  }, 512, 512))
  maps.forEach((map, index) => {
    const custom = faces?.[shape.values[index] - 1], url = sides === 4 ? null : clawFaceArtwork(custom)
    if (!url) return
    void loadDiceArtwork(url).then(art => {
      if (disposed || !art) return
      const canvas = map.image as HTMLCanvasElement, ctx = canvas.getContext('2d')
      if (!ctx) return
      const color = diceSkinFaceColor(colorHex, custom)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = color; ctx.fillRect(0, 0, canvas.width, canvas.height)
      if (sides === 6 && color.toLowerCase() === art.background) {
        // Original PNG pixels remain intact for the two imported presets.
        ctx.drawImage(art.source, 0, 0, canvas.width, canvas.height)
      } else {
        const extent = sides === 20 || sides === 8 ? .6 : sides === 12 ? .82 : sides === 10 ? .75 : 1
        ctx.drawImage(art.foreground, canvas.width * (1 - extent) / 2, canvas.height * (1 - extent) / 2, canvas.width * extent, canvas.height * extent)
      }
      map.needsUpdate = true
      listeners.forEach(invalidate => invalidate())
    })
  })
  shape.geometry.dispose()
  const materials = maps.map(map => { map.anisotropy = 8; return new THREE.MeshStandardMaterial({ map, roughness: .36, metalness: .04 }) })
  const faceColors = faces?.map(face => diceSkinFaceColor(colorHex, face))
  const edgeColor = faceColors?.length && faceColors.every(color => color === faceColors[0]) ? faceColors[0] : diceSkinColor(colorHex)
  const edgeMaterial = new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: .74 })
  return {
    materials, edgeMaterial,
    subscribe(invalidate: () => void) { listeners.add(invalidate); return () => { listeners.delete(invalidate) } },
    dispose() { disposed = true; listeners.clear(); materials.forEach(material => material.dispose()); maps.forEach(map => map.dispose()); edgeMaterial.dispose() },
  }
}

const diceAppearances = new SharedResourceCache(key => {
  const [sides, color, faces] = JSON.parse(key) as [number, string, DiceFace[] | undefined]
  return makeDiceAppearance(sides, color, faces)
}, appearance => appearance.dispose(), 8)

const diceVisualGeometry = new SharedResourceCache(key => {
  const sides = Number(key), shape = makeDiceShape(sides)
  // Preserve tabletop size and face order, using the reference's exact bevel ratio.
  const geometry = sides === 6 ? new RoundedBoxGeometry(1.08, 1.08, 1.08, 6, .18 * 1.08 / 1.4) : shape.geometry
  if (geometry !== shape.geometry) shape.geometry.dispose()
  geometry.computeVertexNormals()
  return { geometry, edges: new THREE.EdgesGeometry(geometry, 38) }
}, resource => { resource.geometry.dispose(); resource.edges.dispose() }, 6)

function DiceVisual({ object }: { object: TableObject }) {
  const invalidate = useThree(state => state.invalidate)
  const appearance = useSharedResource(diceAppearances, JSON.stringify([object.sides, object.color, object.diceFaces]))
  const visual = useSharedResource(diceVisualGeometry, String(SUPPORTED_DICE.includes(object.sides) ? object.sides : 6))
  useEffect(() => appearance?.subscribe(invalidate), [appearance, invalidate])
  if (!appearance || !visual) return null
  // Shared caches own GPU resources across the table, rolls and library previews.
  // Edge lines do not intercept picking; the physical face order stays unchanged.
  return <group dispose={null}>
    <mesh geometry={visual.geometry} material={appearance.materials} castShadow receiveShadow />
    <lineSegments geometry={visual.edges} material={appearance.edgeMaterial} scale={1.006} raycast={() => {}} />
  </group>
}

function TokenVisual({ object, size }: { object: TableObject; size: Vec3 }) {
  const face = usePaintedTexture((ctx, w, h) => {
    ctx.fillStyle = object.color; ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#ece1be'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(w / 2, h / 2, w * .38, 0, Math.PI * 2); ctx.stroke()
    const color = new THREE.Color(object.color)
    ctx.fillStyle = color.r * .2126 + color.g * .7152 + color.b * .0722 > .48 ? '#203328' : '#f7eccb'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 176px Arial, sans-serif'
    ctx.fillText(String(object.metadata.symbol ?? object.value), w / 2, h * .52, w * .62)
  }, [object.color, object.value, object.metadata.symbol])
  const texture = useSafeTexture(object.texture, face)
  return <group>
    <mesh castShadow receiveShadow><cylinderGeometry args={[size[0] / 2, size[0] / 2, size[1], 48]} /><meshStandardMaterial color={object.color} roughness={.35} metalness={.25} /></mesh>
    <mesh position={[0, size[1] / 2 + .004, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[size[0] * .48, 48]} /><meshStandardMaterial map={texture} roughness={.45} metalness={.08} /></mesh>
  </group>
}

function FigurineVisual({ object }: { object: TableObject }) {
  const texture = useImageTexture(object.texture)
  useEffect(() => {
    if (!texture) return
    const image = texture.image as { width?: number; height?: number }
    const ratio = (image.width ?? 1) / (image.height || 1)
    const target = .84 / 1.1
    // Crop to the portrait's shape instead of distorting the imported character.
    texture.repeat.set(ratio > target ? target / ratio : 1, ratio > target ? 1 : ratio / target)
    texture.offset.set((1 - texture.repeat.x) / 2, (1 - texture.repeat.y) / 2)
  }, [texture])
  return <group>
    <mesh castShadow receiveShadow position={[0, -.59, 0]}><cylinderGeometry args={[.48, .5, .2, 40]} /><meshStandardMaterial color="#28312d" metalness={.15} roughness={.7} /></mesh>
    <mesh castShadow position={[0, -.46, 0]}><cylinderGeometry args={[.35, .4, .075, 40]} /><meshStandardMaterial color={object.color} roughness={.4} metalness={.18} /></mesh>
    {texture ? <group position={[0, .06, 0]}>
      <mesh castShadow receiveShadow><boxGeometry args={[.9, 1.16, .065]} /><meshStandardMaterial color={object.color} roughness={.5} metalness={.08} /></mesh>
      {[-1, 1].map(sign => <mesh key={sign} position={[0, 0, sign * .035]} rotation={[0, sign < 0 ? Math.PI : 0, 0]} castShadow>
        <planeGeometry args={[.84, 1.1]} /><meshStandardMaterial map={texture} roughness={.75} alphaTest={.15} />
      </mesh>)}
    </group> : FIGURE_MODELS.some(([key]) => key === object.metadata.model) ? <KitFigure object={object} /> : <>
    <mesh castShadow position={[0, -.06, 0]}><cylinderGeometry args={[.18, .3, .75, 32]} /><meshStandardMaterial color={object.color} roughness={.4} /></mesh>
    <mesh castShadow position={[0, .4, 0]}><sphereGeometry args={[.26, 24, 16]} /><meshStandardMaterial color={object.color} roughness={.36} /></mesh>
    <mesh castShadow position={[0, .13, 0]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[.205, .045, 8, 32]} /><meshStandardMaterial color="#ddc9a1" metalness={.55} roughness={.4} /></mesh>
    </>}
  </group>
}

export function ObjectVisual({ object, size, shape }: { object: TableObject; size: Vec3; shape: DiceShape | null }) {
  if (object.kind === 'dice') return shape ? <DiceVisual object={object} /> : null
  if (object.kind === 'board') return <BoardSurface object={object} size={size} />
  if (object.kind === 'card' || object.kind === 'deck') return <CardSurface object={object} size={size} />
  if (object.kind === 'token') return <TokenVisual object={object} size={size} />
  if (object.kind === 'figurine') return <FigurineVisual object={object} />
  if (PROP_MODELS.some(([key]) => key === object.metadata.model)) return <KitProp object={object} size={size} />
  return <mesh castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={object.color} roughness={.85} metalness={.03} /></mesh>
}


