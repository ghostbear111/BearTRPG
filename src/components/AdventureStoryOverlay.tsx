import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ArrowRight, BookOpen } from '@phosphor-icons/react'
import { adventureChoiceBlocked, type AdventureAction } from '../lib/adventure-engine'
import type { TableSession } from '../lib/tabletop'
import { adventureStoryKey } from '../lib/adventure-story-presentation'
import './rpg-story.css'

interface Props { table: TableSession; visible: boolean; onDismiss: () => void; onAction: (action: AdventureAction) => void; onRoll: (choiceId: string) => void; onEdit: () => void; onRestart: () => void }
export default function AdventureStoryOverlay(props: Props) {
  const key = adventureStoryKey(props.table), pending = props.table.adventure!.progress.pending
  const [retry, setRetry] = useState(false)
  const pendingKey = pending ? `${props.table.id}:${pending.request}:${pending.generation}` : ''
  useEffect(() => { setRetry(false); if (!pendingKey) return; const timer = setTimeout(() => setRetry(true), 15000); return () => clearTimeout(timer) }, [pendingKey])
  if (props.table.adventure!.progress.phase === 'rolling') return <div className="adventure-roll-status" role="status">等待桌面骰子落定{retry && pending && <button onClick={() => props.onRoll(pending.choiceId)}>重试检定</button>}</div>
  return key && props.visible ? <AdventureStoryPanel {...props} storyKey={key} /> : null
}

function AdventureStoryPanel({ table, storyKey, onDismiss, onAction, onRoll, onEdit, onRestart }: Props & { storyKey: string }) {
  const a = table.adventure!, d = a.definition, p = a.progress, scene = d.scenes.find(s => s.id === p.sceneId)!
  const choice = p.phase === 'scene', complete = p.phase === 'complete', result = p.result
  const title = complete ? p.outcome === 'won' ? '战役胜利' : '此行暂告一段落' : p.phase === 'result' ? result?.success ? '检定成功' : '检定失败' : scene.title
  const headingId = useId(), textId = useId(), panel = useRef<HTMLElement>(null), body = useRef<HTMLDivElement>(null), restoreFocus = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (!restoreFocus.current && document.activeElement instanceof HTMLElement && !document.activeElement.closest('.rpg-story-overlay')) restoreFocus.current = document.activeElement
    panel.current?.focus({ preventScroll: true }); if (body.current) body.current.scrollTop = 0
  }, [storyKey])
  useEffect(() => () => { if (restoreFocus.current?.isConnected) restoreFocus.current.focus({ preventScroll: true }) }, [])
  return <div className="rpg-story-overlay">
    <div className="rpg-story-shade" aria-hidden="true" />
    <section ref={panel} tabIndex={-1} className={`rpg-story-panel${choice ? ' is-choice' : ''}`} role="dialog" aria-labelledby={headingId} aria-describedby={textId} onKeyDown={event => {
      if (event.nativeEvent.isComposing || event.ctrlKey || event.altKey || event.metaKey) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onDismiss(); return }
      const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
      if (event.key === 'Tab' && buttons.length) {
        if (event.shiftKey && (event.target === buttons[0] || event.target === panel.current)) { event.preventDefault(); buttons.at(-1)!.focus() }
        else if (!event.shiftKey && (event.target === buttons.at(-1) || event.target === panel.current)) { event.preventDefault(); buttons[0].focus() }
      }
      const options = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('[data-story-choice]:not(:disabled)') ?? [])
      if (choice && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation()
        const index = options.indexOf(document.activeElement as HTMLButtonElement), backwards = ['ArrowUp', 'ArrowLeft'].includes(event.key)
        if (options.length) options[index < 0 ? backwards ? options.length - 1 : 0 : (index + (backwards ? -1 : 1) + options.length) % options.length].focus()
      }
      if (choice && /^[1-9]$/.test(event.key)) { event.preventDefault(); event.stopPropagation(); panel.current?.querySelectorAll<HTMLButtonElement>('[data-story-choice]')[Number(event.key) - 1]?.focus() }
      if ([' ', 'Enter'].includes(event.key) && event.target === panel.current) {
        event.preventDefault(); event.stopPropagation()
        if (p.phase === 'result' && !event.repeat) onAction({ type: 'continue' })
      }
    }}>
      <header><small><BookOpen size={15} />{d.title} · {complete ? '旅程终章' : scene.title}</small><h2 id={headingId}>{title}</h2></header>
      <div ref={body} className="rpg-story-body">
        <p id={textId} aria-live="polite">{choice ? scene.description : complete ? `${scene.description}\n\n${p.lastMessage}` : result?.message}</p>
        {choice && <><p className="adventure-story-goal">{scene.goal}</p><div className="rpg-story-choices" aria-label="剧情选项">{scene.choices.map((c, index) => {
          const blocked = adventureChoiceBlocked(table, c)
          return <button key={c.id} data-story-choice disabled={!!blocked} aria-label={`选项 ${index + 1}：${c.label}`} onClick={() => c.check ? onRoll(c.id) : onAction({ type: 'choose', choiceId: c.id })}><span className="rpg-story-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span>{c.label}<small>{blocked || [c.description, c.check ? `d${c.check.sides} ${c.check.modifier >= 0 ? '+' : ''}${c.check.modifier} ≥ ${c.check.target}` : ''].filter(Boolean).join(' · ')}</small></span><ArrowRight size={18} aria-hidden="true" /></button>
        })}</div></>}
        {p.phase === 'result' && result && <div className="adventure-story-roll"><b>{result.value}</b><span>真实骰点 · 总值 {result.total}</span></div>}
      </div>
      <footer><button className="rpg-story-secondary" onClick={onDismiss}>查看桌面</button>{choice ? <span className="rpg-story-key-hint"><kbd>↑ ↓</kbd>选择 <kbd>Enter / 空格</kbd>确认</span> : complete ? <><button className="rpg-story-secondary" onClick={onEdit}>返回创作</button><button className="rpg-story-primary" onClick={onRestart}>重新开始 <ArrowRight size={18} /></button></> : <button className="rpg-story-primary" onClick={() => onAction({ type: 'continue' })}>确认结果，继续剧情 <ArrowRight size={18} /></button>}</footer>
    </section>
  </div>
}
