import { useEffect, useState } from 'react'
import type { TableSession } from '../lib/tabletop'
import { tableSurface, type TableSurface } from '../lib/table-surface'
export default function EditorSurface({ table, onChange }: { table: TableSession; onChange: (v: TableSurface) => void }) {
  const surface = tableSurface(table), [draft, setDraft] = useState(surface)
  useEffect(() => setDraft(surface), [table.id, surface.width, surface.depth])
  if (table.workspace?.definition?.rpg) return <div className="tt-surface-spec"><h4>坐标 RPG 场景板</h4><p>{surface.width} × {surface.depth} 单位；行列、格距与入口在“剧情工具”中修改。这里布置附加物件，生成地形与角色由剧情数据控制。</p></div>
  return <div className="tt-surface-spec"><h4>场景板规格</h4><div className="tt-vector">{(['width', 'depth'] as const).map(k => <label key={k}><span>{k === 'width' ? '宽度' : '深度'}</span><input aria-label={`场景板${k === 'width' ? '宽度' : '深度'}`} type="number" min="8" max="80" step="1" value={draft[k]} onChange={e => setDraft({ ...draft, [k]: Number(e.target.value) })} /></label>)}</div><button className="tt-small-button full" disabled={Object.values(draft).some(v => !Number.isFinite(v) || v < 8 || v > 80)} onClick={() => onChange(draft)}>应用场景板规格</button><p>8–80桌面单位；缩小前把物件移回范围内。规格随场景和存档保存。</p></div>
}
