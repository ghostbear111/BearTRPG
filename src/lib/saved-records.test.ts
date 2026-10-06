import { describe, expect, it } from 'vitest'
import { removeSavedRecord, removeSavedRecords, restoreSavedRecord, restoreSavedRecords } from './saved-records'

describe('saved record deletion and recovery', () => {
  const records = [{ id: 'draft', value: 1 }, { id: 'game', value: 2 }, { id: 'other', value: 3 }]
  const fallback = () => ({ id: 'blank', value: 0 })
  it('removes one record and preserves the current workspace and original work', () => {
    const change = removeSavedRecord(records, 'draft', 'game', fallback)!
    expect(change.records).toEqual([records[0], records[2]])
    expect(change.activeId).toBe('draft')
    expect(change.removed.wasActive).toBe(false)
    expect(records).toHaveLength(3)
  })
  it('opens the nearest surviving record when the active record is removed', () => {
    expect(removeSavedRecord(records, 'game', 'game', fallback)!.activeId).toBe('other')
    expect(removeSavedRecord(records, 'other', 'other', fallback)!.activeId).toBe('game')
  })
  it('creates one blank workspace only when the last record is deleted', () => {
    let calls = 0
    const create = () => { calls++; return fallback() }
    removeSavedRecord(records, 'draft', 'game', create)
    expect(calls).toBe(0)
    const change = removeSavedRecord([records[0]], 'draft', 'draft', create)!
    expect(calls).toBe(1)
    expect(change.records).toEqual([fallback()])
    expect(change.activeId).toBe('blank')
  })
  it('ignores a stale or unknown deletion without creating another record', () => {
    expect(removeSavedRecord(records, 'draft', 'missing', () => { throw new Error('should not create') })).toBeNull()
  })
  it('undoes at the original position without replacing subsequent edits', () => {
    const change = removeSavedRecord(records, 'draft', 'game', fallback)!
    const edited = [{ ...change.records[0], value: 42 }, change.records[1], { id: 'new', value: 4 }]
    expect(restoreSavedRecord(edited, change.removed)).toEqual([edited[0], records[1], edited[1], edited[2]])
  })
  it('removes an untouched automatic placeholder when undoing the last deletion', () => {
    const change = removeSavedRecord([records[0]], 'draft', 'draft', fallback)!
    expect(restoreSavedRecord(change.records, change.removed)).toEqual([records[0]])
  })
  it('keeps work created on the replacement table when undoing', () => {
    const change = removeSavedRecord([records[0]], 'draft', 'draft', fallback)!
    const edited = { ...change.records[0], value: 99 }
    expect(restoreSavedRecord([edited], change.removed)).toEqual([records[0], edited])
  })
  it('does not duplicate a recovered record on repeated undo', () => {
    const change = removeSavedRecord(records, 'draft', 'game', fallback)!
    const restored = restoreSavedRecord(change.records, change.removed)
    expect(restoreSavedRecord(restored, change.removed)).toBe(restored)
  })
})

describe('batch record deletion', () => {
  const records = [{ id: 'draft', value: 1 }, { id: 'game-1', value: 2 }, { id: 'game-2', value: 3 }, { id: 'other', value: 4 }]
  const fallback = () => ({ id: 'blank', value: 0 })
  it('deduplicates selected IDs and ignores missing IDs while preserving unselected records', () => {
    const change = removeSavedRecords(records, 'draft', ['game-2', 'missing', 'game-1', 'game-1'], fallback)!
    expect(change.records).toEqual([records[0], records[3]])
    expect(change.activeId).toBe('draft')
    expect(change.removed.entries).toEqual([{ record: records[1], index: 1 }, { record: records[2], index: 2 }])
    expect(records).toHaveLength(4)
  })
  it('switches directly to a survivor when the active record is in the batch', () => {
    expect(removeSavedRecords(records, 'game-1', ['game-1', 'game-2'], fallback)!.activeId).toBe('other')
    expect(removeSavedRecords(records, 'other', ['other', 'game-2'], fallback)!.activeId).toBe('game-1')
  })
  it('creates exactly one placeholder when the entire list is deleted', () => {
    let calls = 0
    const change = removeSavedRecords(records, 'game-2', records.map(record => record.id), () => { calls++; return fallback() })!
    expect(calls).toBe(1)
    expect(change.records).toEqual([fallback()])
    expect(change.activeId).toBe('blank')
    expect(change.removed.activeId).toBe('game-2')
    expect(restoreSavedRecords(change.records, change.removed)).toEqual(records)
  })
  it('does nothing for an empty or stale selection', () => {
    const forbidden = () => { throw new Error('should not create a placeholder') }
    expect(removeSavedRecords(records, 'draft', [], forbidden)).toBeNull()
    expect(removeSavedRecords(records, 'draft', ['missing'], forbidden)).toBeNull()
  })
  it('undoes nonadjacent deletions in original order while preserving later edits', () => {
    const change = removeSavedRecords(records, 'game-1', ['draft', 'game-2'], fallback)!
    const edited = [{ ...change.records[0], value: 99 }, change.records[1], { id: 'new', value: 5 }]
    expect(restoreSavedRecords(edited, change.removed)).toEqual([records[0], edited[0], records[2], edited[1], edited[2]])
  })
  it('preserves new work on a placeholder when restoring a whole batch', () => {
    const change = removeSavedRecords(records, 'draft', records.map(record => record.id), fallback)!
    const edited = { ...change.records[0], value: 99 }
    expect(restoreSavedRecords([edited], change.removed)).toEqual([...records, edited])
  })
  it('keeps a placeholder with edited external state such as campaign map positions', () => {
    const change = removeSavedRecords(records, 'draft', records.map(record => record.id), fallback)!
    expect(restoreSavedRecords(change.records, change.removed, true)).toEqual([...records, change.records[0]])
  })
  it('does not replace a separately recovered record or duplicate an already restored batch', () => {
    const change = removeSavedRecords(records, 'draft', ['game-1', 'game-2'], fallback)!
    const recovered = [{ ...records[1], value: 99 }, ...change.records]
    const restored = restoreSavedRecords(recovered, change.removed)
    expect(restored.filter(record => record.id === 'game-1')).toEqual([recovered[0]])
    expect(restored.filter(record => record.id === 'game-2')).toEqual([records[2]])
    expect(restoreSavedRecords(restored, change.removed)).toBe(restored)
  })
  it('produces a complete archive without selected records, and restores every deleted payload', () => {
    const change = removeSavedRecords(records, 'draft', ['game-1', 'game-2'], fallback)!
    expect(JSON.parse(JSON.stringify(change.records))).toEqual([records[0], records[3]])
    expect(JSON.parse(JSON.stringify(restoreSavedRecords(change.records, change.removed)))).toEqual(records)
  })
})
