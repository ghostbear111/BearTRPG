import type { ObjectKind, TableObject } from '../lib/tabletop'
import { FIGURE_MODELS, PROP_MODELS, TERRAIN_STYLES, PLAY_KIT } from '../lib/play-kit'
import './play-workbench.css'
import MovementFields from './MovementFields'

export default function BehaviorFields({ kind, metadata: m, onChange, disabled = false }: { kind: ObjectKind; metadata: TableObject['metadata']; onChange: (m: TableObject['metadata']) => void; disabled?: boolean }) {
  const set = (values: TableObject['metadata']) => onChange({ ...m, ...values })
  const movement = <MovementFields kind={kind} metadata={m} onChange={onChange} disabled={disabled} />
  if (kind === 'dice' || kind === 'deck') return movement
  const models = kind === 'figurine' ? FIGURE_MODELS : PROP_MODELS
  return <>{movement}<fieldset className="pw-actions" disabled={disabled}><details><summary>自定义外观与行为</summary>
    {['figurine', 'block'].includes(kind) && <label>模型<select aria-label="物件模型" value={String(m.model ?? '')} onChange={e => { const spec = PLAY_KIT.find(s => s.key === e.target.value); const [width, height, depth] = spec?.size ?? [1.8, 1.2, .5]; set({ model: e.target.value, ...(kind === 'block' ? { width, height, depth } : {}) }) }}><option value="">通用形状</option>{models.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
    {kind === 'board' && <label>地板样式<select aria-label="地图地板样式" value={String(m.surface ?? '')} onChange={e => set({ surface: e.target.value })}><option value="">通用网格</option>{TERRAIN_STYLES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
    {kind === 'block' && <><label>操作行为<select aria-label="物件操作行为" value={String(m.behavior ?? '')} onChange={e => set({ behavior: e.target.value })}><option value="">无行为</option><option value="open">开关</option><option value="light">点燃/熄灭</option><option value="switch">机关联动</option></select></label><label>联动标签<input aria-label="机关联动标签" value={String(m.linkTag ?? '')} maxLength={48} onChange={e => set({ linkTag: e.target.value })} /></label>{m.behavior === 'open' && <><label>容器内物品名称<input aria-label="容器物品名称" maxLength={120} value={String(m.lootName ?? '')} onChange={e => set({ lootName: e.target.value })} /></label><label>物品恢复生命<input aria-label="容器物品恢复量" type="number" min="0" max="99" value={Number(m.lootHeal) || 0} onChange={e => set({ lootHeal: Math.max(0, Math.min(99, Math.trunc(Number(e.target.value)))) })} /></label></>}</>}
    {kind === 'figurine' && (m.characterId ? <small>生命上限在战役创作工坊编辑。</small> : <label>最大生命<input aria-label="角色最大生命" type="number" min="1" max="999" value={Number(m.vitality) || 6} onChange={e => set({ vitality: Math.max(1, Math.min(999, Math.trunc(Number(e.target.value)))) })} /></label>)}
    {kind === 'token' && <label>标记符号<input aria-label="自定义标记符号" value={String(m.symbol ?? '')} maxLength={4} onChange={e => set({ symbol: e.target.value })} /></label>}
    {kind === 'card' && <><label><input aria-label="可收集道具" type="checkbox" checked={Boolean(m.item)} onChange={e => set({ item: e.target.checked })} />可收集道具</label><label><input aria-label="消耗型道具" type="checkbox" checked={Boolean(m.consumable)} onChange={e => set({ consumable: e.target.checked })} />使用后消耗</label><label><input aria-label="可装备道具" type="checkbox" checked={Boolean(m.equippable)} onChange={e => set({ equippable: e.target.checked })} />可装备</label><label>恢复生命<input aria-label="道具恢复量" type="number" min="0" max="99" value={Number(m.heal) || 0} onChange={e => set({ heal: Math.max(0, Math.min(99, Math.trunc(Number(e.target.value)))) })} /></label></>}
  </details></fieldset></>
}
