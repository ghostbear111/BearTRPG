import type { TableSession } from './tabletop'

/** Paused story interactions share one central presentation, independent of sidebar tabs. */
export function rpgStoryKey(table: TableSession): string | null {
  const a = table.adventure, p = a?.progress.rpg
  if (table.workspace?.kind === 'draft' || !a?.definition.rpg || !p) return null
  if (a.progress.phase === 'complete') return `${table.id}:ending:${a.progress.outcome}`
  if (p.pending?.type === 'battle' && table.combat?.phase === 'complete') return `${table.id}:battle-result:${p.steps}:${table.combat.winner}`
  if (table.combat || p.pending && !['talk', 'choice', 'shop'].includes(p.pending.type)) return null
  if (!p.pending && !p.frames.length) return null
  return JSON.stringify([table.id, p.pending?.type ?? 'continue', p.pending?.path, p.steps])
}
