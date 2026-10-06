import { useEffect, useRef, useState } from 'react'
import type { TableSession } from '../lib/tabletop'
import { rpgTextCues, rpgTextSnapshot, rpgTextEnabled, type RpgTextCue, type RpgTextSnapshot } from '../lib/rpg-text-presentation'
import { loadTavernApng, renderRpgText } from '../lib/tavern-apng-runtime'
import './rpg-narrative.css'

function TextCue({ cue, onDone }: { cue: RpgTextCue; onDone: () => void }) {
  const [image, setImage] = useState(''), [fallback, setFallback] = useState(false)
  const done = useRef(onDone); done.current = onDone
  const duration = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    const controller = new AbortController()
    let url = '', pendingTimer: ReturnType<typeof setTimeout> | undefined
    const staticText = () => { controller.abort(); setFallback(true); timer.current = setTimeout(() => done.current(), 2200) }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) staticText()
    else {
      pendingTimer = setTimeout(staticText, 2500)
      void renderRpgText(cue, controller.signal).then(result => {
        if (controller.signal.aborted || timer.current) return
        clearTimeout(pendingTimer)
        duration.current = result.duration * 1000
        url = URL.createObjectURL(result.blob); setImage(url)
      }).catch(error => {
        if (controller.signal.aborted) return
        clearTimeout(pendingTimer)
        if (!timer.current) staticText()
        console.warn('星海文字演出使用静态显示：', error)
      })
    }
    return () => { controller.abort(); clearTimeout(pendingTimer); clearTimeout(timer.current); if (url) URL.revokeObjectURL(url) }
  }, [cue])
  return <div className={`rpg-narrative-cue rpg-narrative-${cue.kind}`} data-renderer={image ? 'apng' : fallback ? 'static' : 'loading'} role="status" aria-label={`${cue.text} · ${cue.subText}`}>
    {image ? <img src={image} alt={`${cue.text} · ${cue.subText}`} onLoad={() => { clearTimeout(timer.current); timer.current = setTimeout(() => done.current(), duration.current + 100) }} onError={() => { setImage(''); setFallback(true); timer.current = setTimeout(() => done.current(), 2200) }} /> : fallback ? <div className="rpg-narrative-static"><strong>{cue.text}</strong><span>{cue.subText}</span></div> : null}
  </div>
}

export default function RpgTextPresentation({ table, suppressed }: { table: TableSession; suppressed: boolean }) {
  const previous = useRef<RpgTextSnapshot | null>(null)
  const [cues, setCues] = useState<RpgTextCue[]>([])
  const enabled = table.workspace?.kind !== 'draft' && !!table.adventure && rpgTextEnabled(table.adventure.definition)
  useEffect(() => {
    if (!enabled) { previous.current = null; setCues(current => current.length ? [] : current); return }
    const next = rpgTextSnapshot(table)
    if (!next) return
    const events = rpgTextCues(previous.current, next)
    previous.current = next
    // Authored effects take priority; don't queue obsolete cues behind them.
    if (suppressed) setCues(current => current.length ? [] : current)
    else if (events.length) setCues(events.slice(0, 2))
  }, [table, enabled, suppressed])
  useEffect(() => { if (enabled) void loadTavernApng().catch(() => {}) }, [enabled])
  return enabled && !suppressed && cues[0] ? <TextCue key={cues[0].key} cue={cues[0]} onDone={() => setCues(current => current.slice(1))} /> : null
}
