import type { TableSession } from './tabletop'

/** A new scene or resolved check reopens the story, without reacting to tabletop physics. */
export function adventureStoryKey(table: TableSession): string | null {
  const a = table.adventure
  if (table.workspace?.kind === 'draft' || !a || a.definition.rpg || table.combat || a.progress.phase === 'rolling') return null
  const p = a.progress
  return JSON.stringify([table.id, p.sceneId, p.phase, p.outcome, p.journal.at(-1)?.id])
}
