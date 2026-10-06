import { useEffect, useRef, useState } from 'react'
import type { TableSession } from '../lib/tabletop'
export default function RpgAudio({ table }: { table: TableSession }) {
  const [enabled, setEnabled] = useState(false), music = useRef<HTMLAudioElement | null>(null)
  const p = table.adventure!.progress.rpg!, audio = table.adventure!.definition.rpg!.audio
  const source = audio?.music[p.music]
  useEffect(() => { music.current?.pause(); music.current = null; if (!enabled || !source) return; const element = new Audio(source); element.loop = true; element.volume = .22; music.current = element; void element.play().catch(() => setEnabled(false)); return () => { element.pause(); music.current = null } }, [enabled, source, table.id])
  useEffect(() => { const url = p.sound && audio?.sfx[p.sound.name]; if (!enabled || !url) return; const element = new Audio(url); element.volume = .4; void element.play().catch(() => {}); return () => element.pause() }, [enabled, p.sound?.sequence, table.id])
  return <button className="rpg-audio-toggle" aria-pressed={enabled} onClick={() => setEnabled(v => !v)}>{enabled ? '音乐已开启' : '开启音乐'}</button>
}
