import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import { ArrowRight, BookOpen } from '@phosphor-icons/react'
import type { TableSession } from '../lib/tabletop'
import { rpgAt, type RpgOp } from '../lib/rpg-schema'
import type { RpgAction } from '../lib/rpg-engine'
import { rpgTextEnabled } from '../lib/rpg-text-presentation'
import { rpgStoryKey } from '../lib/rpg-story-presentation'
import './rpg-story.css'
import './rpg-narrative.css'

interface Props { table: TableSession; onAction: (action: RpgAction) => void; onEdit: () => void; onRestart: () => void }
export default function RpgStoryOverlay(props: Props) {
  const key = rpgStoryKey(props.table)
  return key ? <StoryPanel {...props} storyKey={key} /> : null
}

function StoryPanel({ table, onAction, onEdit, onRestart, storyKey }: Props & { storyKey: string }) {
  const a = table.adventure!, db = a.definition.rpg!, p = a.progress.rpg!, pending = p.pending
  const op = pending ? rpgAt(db, pending.path) as RpgOp : undefined
  const complete = a.progress.phase === 'complete', choice = pending?.type === 'choice', shop = pending?.type === 'shop'
  const battleResult = !complete && pending?.type === 'battle' && table.combat?.phase === 'complete'
  const battleWon = table.combat?.winner === '队伍'
  const title = complete ? a.progress.outcome === 'won' ? '群星见证了你的旅程' : '此行暂告一段落' : battleResult ? battleWon ? '队伍获胜' : '队伍战败' : choice ? '你的选择' : shop ? '补给与交易' : op?.name || '旁白'
  const text = complete ? a.progress.lastMessage : battleResult ? table.combat!.message : pending?.type === 'talk' || choice ? op?.text : p.message
  const headingId = useId(), textId = useId(), panel = useRef<HTMLElement>(null), body = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const animated = rpgTextEnabled(a.definition)
  useLayoutEffect(() => {
    // Focus the panel, never auto-select a story branch by pressing Space.
    if (!restoreFocus.current && document.activeElement instanceof HTMLElement && !document.activeElement.closest('.rpg-story-overlay')) restoreFocus.current = document.activeElement
    panel.current?.focus({ preventScroll: true })
    if (body.current) body.current.scrollTop = 0
  }, [storyKey])
  useEffect(() => {
    return () => { if (restoreFocus.current?.isConnected) restoreFocus.current.focus({ preventScroll: true }) }
  }, [])
  return <div className="rpg-story-overlay">
    <div className="rpg-story-shade" aria-hidden="true" />
    <section ref={panel} tabIndex={-1} className={`rpg-story-panel${choice ? ' is-choice' : ''}${shop ? ' is-shop' : ''}`} role="dialog" aria-labelledby={headingId} aria-describedby={textId}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.ctrlKey || event.altKey || event.metaKey) return
        const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
        if (event.key === 'Tab' && buttons.length) {
          const first = buttons[0], last = buttons[buttons.length - 1]
          if (event.shiftKey && (event.target === first || event.target === panel.current)) { event.preventDefault(); last.focus() }
          else if (!event.shiftKey && (event.target === last || event.target === panel.current)) { event.preventDefault(); first.focus() }
        }
        if (choice && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
          event.preventDefault(); event.stopPropagation()
          const options = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('[data-story-choice]') ?? [])
          const index = options.indexOf(document.activeElement as HTMLButtonElement), backwards = ['ArrowUp', 'ArrowLeft'].includes(event.key)
          if (options.length) options[index < 0 ? backwards ? options.length - 1 : 0 : (index + (backwards ? -1 : 1) + options.length) % options.length].focus()
        }
        if (choice && /^[1-9]$/.test(event.key)) {
          // Number keys select a branch; Enter / Space deliberately confirms it.
          event.preventDefault(); event.stopPropagation()
          panel.current?.querySelectorAll<HTMLButtonElement>('[data-story-choice]')[Number(event.key) - 1]?.focus()
        }
        if (choice && [' ', 'Enter'].includes(event.key) && event.target === panel.current) { event.preventDefault(); event.stopPropagation() }
        if ([' ', 'Enter'].includes(event.key) && event.target === panel.current && !choice && !shop) {
          event.preventDefault(); event.stopPropagation()
          if (!complete && !event.repeat) onAction({ type: battleResult ? 'finishBattle' : 'next' })
        }
      }}>
      <header><small><BookOpen size={15} />{db.maps[p.mapId]?.name ?? '冒险旅程'}{complete && ' · 旅程终章'}</small><h2 id={headingId} style={{ color: pending?.type === 'talk' ? op?.color || undefined : undefined }}>{title}</h2></header>
      <div ref={body} className="rpg-story-body">
        <p id={textId} key={storyKey} aria-live="polite" className={animated ? 'rpg-narrative-line' : undefined}>{text}</p>
        {choice && <div className="rpg-story-choices" aria-label="剧情选项">{op?.options?.map((option, index) => <button key={index} data-story-choice aria-label={`选项 ${index + 1}：${option.t}`} onClick={() => onAction({ type: 'pick', index })}><span className="rpg-story-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span>{option.t}</span><ArrowRight size={18} aria-hidden="true" /></button>)}</div>}
        {shop && <div className="rpg-story-shop">{db.shops[op!.id!].map(row => {
          const price = Math.ceil(row.price * (p.roster.includes('luo') ? .8 : 1))
          return <div key={row.id}><span><b>{db.items[row.id].name}</b><small>{price} 信用点 · 已有 {p.bag[row.id] ?? 0}</small></span><button disabled={p.money < price} onClick={() => onAction({ type: 'buy', item: row.id })}>购买</button></div>
        })}</div>}
      </div>
      <footer>{choice ? <span className="rpg-story-key-hint"><kbd>↑ ↓</kbd>选择 <kbd>Enter / 空格</kbd>确认 <span>也可点击选项</span></span> : complete ? <><button className="rpg-story-secondary" onClick={onEdit}>返回创作</button><button className="rpg-story-primary" onClick={onRestart}>重新开始 <ArrowRight size={18} /></button></> : <><span className="rpg-story-key-hint"><kbd>空格</kbd>{battleResult ? '确认遭遇结果' : shop ? '离开商店' : '继续剧情'}</span><button className="rpg-story-primary" onClick={() => onAction({ type: battleResult ? 'finishBattle' : 'next' })}>{battleResult ? battleWon ? '领取战利品，继续剧情' : '确认战败，查看结局' : shop ? '离开商店' : '继续剧情'} <ArrowRight size={18} /></button></>}</footer>
    </section>
  </div>
}
