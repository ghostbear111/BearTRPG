import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUUpLeft, Trash } from '@phosphor-icons/react'
import './record-actions.css'

export function RecordDeleteAction({ label, disabled = false, onDelete }: { label: string; disabled?: boolean; onDelete: () => boolean }) {
  const [confirming, setConfirming] = useState(false)
  return confirming ? <span className="record-delete-confirm" role="group" aria-label={`确认删除${label}`}>
    <span>删除这份记录？</span>
    <button type="button" className="record-delete" disabled={disabled} aria-label={`确认删除${label}`} onClick={() => { if (onDelete()) setConfirming(false) }}>确认删除</button>
    <button type="button" disabled={disabled} onClick={() => setConfirming(false)}>取消</button>
  </span> : <button type="button" className="record-delete" disabled={disabled} aria-label={`删除${label}`} title={`删除${label}`} onClick={() => setConfirming(true)}><Trash size={15} /><span>删除</span></button>
}

export function RecordUndoNotice({ name, count = 1, onUndo }: { name?: string; count?: number; onUndo: () => void }) {
  return <div className="record-undo" role="status"><span>{count === 1 ? `已删除「${name}」。` : `已删除 ${count} 份记录。`}刷新前可撤销最近一次删除。</span><button type="button" onClick={onUndo}><ArrowUUpLeft size={15} />{count > 1 ? '撤销整批删除' : '撤销删除'}</button></div>
}

export function useRecordSelection(ids: readonly string[]) {
  const [selected, setSelected] = useState<string[]>([])
  const key = JSON.stringify(ids)
  const live = useMemo(() => new Set(ids), [key])
  useEffect(() => { setSelected(current => current.every(id => live.has(id)) ? current : current.filter(id => live.has(id))) }, [live])
  const selectedIds = selected.filter(id => live.has(id))
  const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : live.has(id) ? [...current, id] : current)
  const clear = () => setSelected([])
  const allSelected = ids.length > 0 && selectedIds.length === ids.length
  return { selectedIds, allSelected, toggle, clear, toggleAll: () => setSelected(allSelected ? [] : [...ids]) }
}

export function RecordSelectionCheckbox({ label, checked, disabled = false, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: () => void }) {
  return <input className="record-checkbox" type="checkbox" aria-label={`选择${label}`} checked={checked} disabled={disabled} onChange={onChange} />
}

export function RecordBatchToolbar({ label, total, selection, onDelete, disabled = false, filtered = false }: {
  label: string; total: number; selection: ReturnType<typeof useRecordSelection>; onDelete: (ids: string[]) => boolean; disabled?: boolean; filtered?: boolean
}) {
  const all = useRef<HTMLInputElement>(null)
  const [confirming, setConfirming] = useState(false)
  const count = selection.selectedIds.length
  const key = JSON.stringify(selection.selectedIds)
  useEffect(() => { if (all.current) all.current.indeterminate = count > 0 && !selection.allSelected }, [count, selection.allSelected])
  useEffect(() => { setConfirming(false) }, [key])
  return <div className="record-batch-toolbar" aria-label={`${label}批量管理`}>
    <label className="record-select-all"><input ref={all} className="record-checkbox" type="checkbox" aria-label={`全选${label}`} checked={selection.allSelected} disabled={disabled || !total} onChange={selection.toggleAll} />{filtered ? '全选筛选结果' : '全选'}</label>
    <span className="record-batch-count">已选 {count} / {total}</span>
    {confirming && count > 0 ? <div className="record-delete-confirm" role="group" aria-label={`批量删除${label}确认`}><span>删除选中的 {count} 份记录？刷新前可撤销整批删除。</span><button type="button" className="record-delete" disabled={disabled} aria-label={`确认批量删除${label}`} onClick={() => { if (onDelete([...selection.selectedIds])) { selection.clear(); setConfirming(false) } }}>确认删除 {count} 份</button><button type="button" disabled={disabled} onClick={() => setConfirming(false)}>取消</button></div> : <>
      <button type="button" className="record-delete" disabled={disabled || !count} onClick={() => setConfirming(true)} aria-label={`批量删除${label}`}><Trash size={15} />删除选中{count ? `（${count}）` : ''}</button>
      {count > 0 && <button type="button" className="record-clear-selection" disabled={disabled} onClick={selection.clear}>清空选择</button>}
    </>}
  </div>
}
