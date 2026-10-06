import type { ObjectKind, TableObject } from '../lib/tabletop'
import { movementRules, MOVE_SEATS } from '../lib/object-movement'

export default function MovementFields({ kind, metadata, onChange, disabled }: { kind: ObjectKind; metadata: TableObject['metadata']; onChange: (m: TableObject['metadata']) => void; disabled?: boolean }) {
  const r = movementRules({ kind, metadata, locked: false })
  const set = (values: TableObject['metadata']) => onChange({ ...metadata, ...values })
  return <fieldset className="pw-actions we-movement-fields" disabled={disabled}><details><summary>游戏移动规则</summary>
    {kind === 'dice' ? <small>游戏中只能通过掷骰行动投掷，不能直接拿取。骰子不会推倒棋子。</small> : <>
      <label>移动方式<select aria-label="游戏移动方式" value={r.mode} onChange={e => set({ moveMode: e.target.value })}><option value="fixed">固定位置</option><option value="grid">格点移动</option><option value="free">平面移动</option></select></label>
      {r.mode !== 'fixed' && <><label>单次最大距离<input aria-label="单次移动距离" type="number" min="0.5" max="12" step="0.5" value={r.range} onChange={e => set({ moveRange: Math.max(.5, Math.min(12, Number(e.target.value))) })} /></label>
      {r.mode === 'grid' && <label>格距<input aria-label="移动格距" type="number" min="0.5" max="4" step="0.5" value={r.step} onChange={e => set({ moveStep: Math.max(.5, Math.min(4, Number(e.target.value))) })} /></label>}
      <label>操控玩家<select aria-label="移动操控玩家" value={r.seat} onChange={e => set({ moveSeat: e.target.value })}>{MOVE_SEATS.map(seat => <option value={seat} key={seat}>{seat || '同桌所有玩家'}</option>)}</select></label>
      <label><input aria-label="移动路线检查" type="checkbox" checked={r.pathCheck} onChange={e => set({ movePathCheck: e.target.checked })} />检查沿途障碍</label></>}
      <small>玩家先点“移动物件”，再选择目的地。高度、朝向保持不变；锁定物件始终固定。战斗移动还会消耗行动点。</small>
    </>}
  </details></fieldset>
}
