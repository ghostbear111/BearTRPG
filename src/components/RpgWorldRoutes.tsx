import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3 } from 'three'
import type { TableSession } from '../lib/tabletop'
import './rpg-world.css'

/** DOM controls follow physical pieces without separate React roots in the scene. */
export default function RpgWorldRoutes({ table, playMode, locked, onSelect }: { table: TableSession; playMode: boolean; locked: boolean; onSelect: (id: string) => void }) {
  const elements = useRef(new Map<string, HTMLDivElement>()), { gl, camera, size } = useThree(), point = useMemo(() => new Vector3(), [])
  const enabled = table.adventure?.progress.rpg?.mapId === 'world' || table.workspace?.sceneId === 'rpg-world'
  const locations = enabled ? table.objects.filter(o => typeof o.metadata.rpgDestination === 'string') : []
  const key = JSON.stringify(locations.map(o => [o.id, o.name, o.description, o.metadata.rpgDanger, o.metadata.rpgCurrent, o.metadata.rpgVisited]))
  const latest = useRef({ onSelect, locked }); latest.current = { onSelect, locked }
  useEffect(() => {
    const parent = gl.domElement.parentElement; if (!parent || !locations.length) return
    const layer = document.createElement('div'), created = new Map<string, HTMLDivElement>()
    layer.className = 'rpg-route-layer'; layer.setAttribute('role', 'group'); layer.setAttribute('aria-label', '桌面星图航线')
    for (const o of locations) {
      const anchor = document.createElement('div'), leader = document.createElement('span'), button = document.createElement('button')
      anchor.className = 'rpg-route-anchor'; leader.className = 'rpg-route-leader'; leader.setAttribute('aria-hidden', 'true')
      button.className = `rpg-star-route${o.metadata.rpgCurrent ? ' is-current' : ''}`
      button.setAttribute('aria-label', `${playMode ? '前往' : '选择地点'}${o.name}`)
      button.title = `${o.name} · 危险等级 ${o.metadata.rpgDanger}\n${o.description}`; button.disabled = locked
      const name = document.createElement('span'), arrow = document.createElement('span'), status = document.createElement('small')
      name.textContent = o.name; arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true')
      status.textContent = o.metadata.rpgCurrent ? '出发地' : o.metadata.rpgVisited ? '已探索' : `危险 ${o.metadata.rpgDanger}`
      button.append(name, arrow, status)
      button.addEventListener('pointerdown', e => e.stopPropagation())
      button.addEventListener('click', e => { e.stopPropagation(); if (!latest.current.locked) latest.current.onSelect(o.id) })
      anchor.append(leader, button); layer.append(anchor); created.set(o.id, anchor)
    }
    parent.append(layer); elements.current = created
    return () => { if (elements.current === created) elements.current = new Map(); layer.remove() }
    // Display data owns the DOM lifetime; click callbacks follow latest props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, key, playMode])
  useEffect(() => { for (const element of elements.current.values()) element.querySelector('button')!.disabled = locked }, [locked, key])
  useFrame(() => {
    const projected = locations.flatMap(o => {
      const element = elements.current.get(o.id), button = element?.querySelector('button'); if (!element || !button) return []
      point.set(o.position[0], .38, o.position[2] + .65).project(camera)
      const visible = point.z < 1 && Math.abs(point.x) < 1.05 && Math.abs(point.y) < 1.05
      element.style.visibility = visible ? 'visible' : 'hidden'; if (!visible) return []
      return [{ element, button, x: (point.x + 1) * size.width / 2, y: (1 - point.y) * size.height / 2, w: button.offsetWidth, h: button.offsetHeight }]
    }).sort((a, b) => a.y - b.y || a.x - b.x)
    const placed: { x: number; y: number; w: number; h: number }[] = []
    for (const p of projected) {
      const candidates = [0, -1, 1, -2, 2, -3, 3].flatMap(y => [0, -1, 1, -2, 2].map(x => ({ dx: x * (p.w + 8), dy: y * (p.h + 8) }))).sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy))
      const offset = candidates.find(c => {
        const x = p.x + c.dx, y = p.y + c.dy
        return x - p.w / 2 > 8 && x + p.w / 2 < size.width - 8 && y - p.h / 2 > 8 && y + p.h / 2 < size.height - 8 && placed.every(b => Math.abs(x - b.x) >= (p.w + b.w) / 2 + 5 || Math.abs(y - b.y) >= (p.h + b.h) / 2 + 5)
      }) ?? { dx: 0, dy: 0 }
      p.element.style.transform = `translate(${p.x}px,${p.y}px)`
      p.button.style.transform = `translate(-50%,-50%) translate(${offset.dx}px,${offset.dy}px)`
      const leader = p.element.querySelector<HTMLElement>('.rpg-route-leader')!
      leader.style.width = `${Math.hypot(offset.dx, offset.dy)}px`; leader.style.transform = `rotate(${Math.atan2(offset.dy, offset.dx)}rad)`
      placed.push({ x: p.x + offset.dx, y: p.y + offset.dy, w: p.w, h: p.h })
    }
  })
  return null
}
