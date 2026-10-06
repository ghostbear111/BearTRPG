import { describe, expect, it } from 'vitest'
import { createBlankEditorSession } from './editor-session'
import { BUILTIN_GAMES, gameSessions } from './game-catalog'
import { validateTableSession } from './tabletop'
import { workspaceMode } from './table-workspace'

describe('clean editor distribution', () => {
  it('starts with an empty editable table, with no preloaded game or campaign', () => {
    const table = validateTableSession(createBlankEditorSession())
    expect(workspaceMode(table)).toBe('edit')
    expect(table.objects).toEqual([])
    expect(table.adventure).toBeUndefined()
    expect(table.campaign).toBeUndefined()
    expect(gameSessions([table])).toEqual([])
    expect(BUILTIN_GAMES).toEqual([])
  })
})
