import { createTableSession, type TableSession } from './tabletop'

/** A clean installation opens an editable table without allocating a campaign. */
export function createBlankEditorSession(): TableSession {
  return { ...createTableSession('sandbox'), name: '空白桌面', workspace: { kind: 'draft' } }
}
