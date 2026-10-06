export interface RemovedRecord<T extends { id: string }> {
  record: T
  index: number
  wasActive: boolean
  fallback?: T
}

export interface RemovedRecords<T extends { id: string }> {
  entries: Array<{ record: T; index: number }>
  activeId: string
  fallback?: T
}

/** Remove a selection as one operation, resolving the active workspace once. */
export function removeSavedRecords<T extends { id: string }>(records: T[], activeId: string, ids: readonly string[], createFallback: () => T) {
  const selected = new Set(ids)
  const entries = records.flatMap((record, index) => selected.has(record.id) ? [{ record, index }] : [])
  if (!entries.length) return null
  const remaining = records.filter(record => !selected.has(record.id))
  const fallback = remaining.length ? undefined : createFallback()
  if (fallback) remaining.push(fallback)
  const activeIndex = records.findIndex(record => record.id === activeId)
  const nextActive = remaining.find(record => record.id === activeId)
    ?? records.slice(activeIndex + 1).find(record => !selected.has(record.id))
    ?? records.slice(0, activeIndex).reverse().find(record => !selected.has(record.id))
    ?? remaining[0]
  const removed: RemovedRecords<T> = { entries, activeId, fallback }
  return { records: remaining, activeId: nextActive.id, removed }
}

/** Restore the whole batch in original order, preserving later edits and new records. */
export function restoreSavedRecords<T extends { id: string }>(records: T[], removed: RemovedRecords<T>, preserveFallback = false) {
  const existing = new Set(records.map(record => record.id))
  const missing = removed.entries.filter(entry => !existing.has(entry.record.id))
  if (!missing.length) return records
  const restored = records.filter(record => preserveFallback || record !== removed.fallback)
  for (const { record, index } of missing) restored.splice(Math.min(index, restored.length), 0, record)
  return restored
}

/** Keep an open workspace when removing its last record, without touching related works. */
export function removeSavedRecord<T extends { id: string }>(records: T[], activeId: string, id: string, createFallback: () => T) {
  const change = removeSavedRecords(records, activeId, [id], createFallback)
  if (!change) return null
  const removed: RemovedRecord<T> = { ...change.removed.entries[0], wasActive: id === activeId, fallback: change.removed.fallback }
  return { ...change, removed }
}

/** Undo restores only the deleted record; edits made to other records remain intact. */
export function restoreSavedRecord<T extends { id: string }>(records: T[], removed: RemovedRecord<T>) {
  return restoreSavedRecords(records, { entries: [removed], activeId: removed.record.id, fallback: removed.fallback })
}
