import { ArrowCounterClockwise, BookOpen, Cards, Cube, DiceFive, NotePencil, Play } from '@phosphor-icons/react'
import { useState } from 'react'
import type { TableObject, TableSession } from '../lib/tabletop'
import { diceFaceLabel } from '../lib/dice'
import { health, type Interaction } from '../lib/object-play'
import { captureSceneDraft } from '../lib/table-workspace'
import BehaviorFields from './BehaviorFields'
import { movementRules } from '../lib/object-movement'
import { playMoveAccessError } from '../lib/play-movement'
import { uprightFigureAccessError } from '../lib/piece-pose'

type BatchMode = 'row' | 'grid' | 'stack' | 'copy' | 'delete' | 'lock'
export function EditorBatch({ selectedIds, onBatch }: { selectedIds: string[]; onBatch: (mode: BatchMode) => void }) {
  return <section className="we-section"><small>场景布置</small><h3>批量编辑</h3><p>开启多选，或按住 Shift 点选物件，再排列场景。所有修改只作用于编辑稿。</p><b>已选择 {selectedIds.length} 件物件</b><fieldset className="we-batch" disabled={!selectedIds.length}>{(['row', 'grid', 'stack', 'copy', 'lock', 'delete'] as const).map((mode, i) => <button className="tt-small-button" key={mode} onClick={() => onBatch(mode)}>{['排列成行', '网格排列', '叠放', '复制', '锁定 / 解锁', '删除'][i]}</button>)}</fieldset></section>
}

export function EditorStory({ table, onStudio, onPlay }: { table: TableSession; onStudio: () => void; onPlay: () => void }) {
  const definition = captureSceneDraft(table)
  const scene = definition?.scenes.find(s => s.id === table.workspace?.sceneId)
  return <section className="we-section we-story"><small>跑团游戏编辑器</small><h3>{definition?.title ?? '让桌面成为一个故事'}</h3><p>{scene ? `正在布置「${scene.title}」。返回故事编辑器后，当前布局会进入这个场景。` : '先布置地图、角色与道具，再编写世界、章节、任务和玩家可执行的剧情行动。'}</p><ol><li><Cube size={19} /><div><b>布置场景</b><span>物件库、拖拽、尺寸与行为配置。</span></div></li><li><NotePencil size={19} /><div><b>编写跑团</b><span>世界、角色、场景、任务与分支检定。</span></div></li><li><Play size={19} /><div><b>进入游戏</b><span>独立开局，检验玩家的完整体验。</span></div></li></ol>{definition && <div className="we-summary">{definition.chapters.length} 章 · {definition.scenes.length} 场景 · {definition.characters.length} 角色</div>}<button className="tt-gold-button full" onClick={onStudio}><BookOpen size={17} />{definition ? '返回故事编辑器' : '打开故事编辑器'}</button><button className="tt-small-button full" onClick={onPlay}><Play size={16} />新开试玩当前作品</button></section>
}

interface PlayerProps { table: TableSession; object?: TableObject; seat: string; moving: boolean; onMove: () => void; onAction: (action: string) => void; onInteract: (id: string, action: Interaction) => void; onHealth: (id: string, delta: number) => void; onValue: (id: string, value: number) => void; onSelect: (id: string) => void; onDeal: (id: string, count: number, all: boolean) => void }
export function PlayerObjectPanel({ table, object, seat, moving, onMove, onAction, onInteract, onHealth, onValue, onSelect, onDeal }: PlayerProps) {
  const [dealCount, setDealCount] = useState(1)
  const hidden = object?.kind === 'card' && object.faceDown
  const pending = table.combat?.phase === 'rolling' || table.adventure?.progress.phase === 'rolling'
  const guided = Boolean(table.adventure || table.combat || table.objects.some(o => o.metadata.guideState))
  const controlled = Boolean(table.combat || table.objects.some(o => o.metadata.guideState))
  const rule = object && movementRules(object)
  const moveError = object ? playMoveAccessError(table, object.id, seat) : ''
  const uprightError = object?.kind === 'figurine' ? uprightFigureAccessError(table, object.id, seat) : ''
  return <section className="we-section we-player-object"><small>玩家行动</small><h3>{object ? hidden ? '背面卡牌' : object.name : '选择桌面物件'}</h3><p>{object ? hidden ? '翻开后查看卡牌内容。' : object.description || '选择下面的行动，与桌面互动。' : '点选角色、道具或机关，查看说明并执行行动。'}</p>{object && <fieldset disabled={pending} className="we-player-actions">
    {rule && object.kind !== 'dice' && <div className="we-move-rule"><b>{rule.mode === 'fixed' ? '固定位置' : `${rule.mode === 'grid' ? '格点移动' : '平面移动'} · 每次 ≤ ${rule.range}`}</b><span>{moveError || `${rule.mode === 'grid' ? `格距 ${rule.step} · ` : ''}${rule.seat || '同桌所有玩家'}可操控 · 保持高度与朝向`}</span>{rule.mode !== 'fixed' && <button className="tt-gold-button full" disabled={Boolean(moveError)} onClick={onMove}>{moving ? '取消移动' : '移动物件'}</button>}</div>}
    {object.metadata.behavior === 'open' && <><button className="tt-gold-button" onClick={() => onInteract(object.id, 'open')}>{object.metadata.opened ? '关闭' : '打开'}{object.name}</button>{object.metadata.lootName && <button className="tt-small-button" disabled={!object.metadata.opened || Boolean(object.metadata.emptied)} onClick={() => onInteract(object.id, 'loot')}>{object.metadata.emptied ? '已经取空' : '取出物品'}</button>}</>}
    {object.metadata.behavior === 'light' && <button className="tt-gold-button" onClick={() => onInteract(object.id, 'light')}>{object.metadata.lit ? '熄灭' : '点燃'}</button>}
    {object.metadata.behavior === 'switch' && <button className="tt-gold-button" onClick={() => onInteract(object.id, 'switch')}>{object.metadata.activated ? '关闭机关' : '启动机关'}</button>}
    {object.kind === 'figurine' && <div className="we-health"><span>生命 <b>{health(object, table).hp}/{health(object, table).max}</b></span>{!guided && <><button className="tt-small-button" onClick={() => onHealth(object.id, -1)}>受到 1 伤害</button><button className="tt-small-button" onClick={() => onHealth(object.id, 1)}>恢复 1 生命</button></>}</div>}
    {object.kind === 'figurine' && <div className="we-move-rule"><button className="tt-small-button full" disabled={Boolean(uprightError)} onClick={() => onAction('upright')}><ArrowCounterClockwise size={16} />扶正棋子</button><span>{uprightError || '恢复站立摆放，生命、回合与行动点保持不变。'}</span></div>}
    {object.kind === 'dice' && <><span className="we-die">d{object.sides} · {object.value ? diceFaceLabel({ sides: object.sides, faces: object.diceFaces }, object.value) : '尚未投掷'}</span>{!guided && <button className="tt-gold-button" disabled={object.locked} onClick={() => onAction('roll')}><DiceFive size={16} />掷骰</button>}</>}
    {object.kind === 'deck' && !controlled && <><span>{object.cards?.length ?? 0} 张牌</span><button className="tt-small-button" disabled={object.locked} onClick={() => onAction('shuffle')}>洗牌</button><button className="tt-gold-button" disabled={object.locked || !object.cards?.length} onClick={() => onAction('draw')}>抽牌</button><label className="tt-field">每人发牌数<select aria-label="每人发牌数" value={dealCount} onChange={e => setDealCount(Number(e.target.value))}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} 张</option>)}</select></label><button className="tt-small-button" disabled={object.locked} onClick={() => onDeal(object.id, dealCount, false)}>发给当前玩家</button><button className="tt-small-button" disabled={object.locked} onClick={() => onDeal(object.id, dealCount, true)}>发给四位玩家</button></>}
    {object.kind === 'card' && !controlled && <><button className="tt-small-button" onClick={() => onAction('flip')}>翻面</button><button className="tt-small-button" onClick={() => onAction('hand')}><Cards size={16} />收入手牌</button><button className="tt-small-button" onClick={() => onAction('return')}>放回牌堆</button></>}
    {object.kind === 'card' && object.metadata.item && !['inventory', 'hand'].includes(String(object.metadata.zone)) && <button className="tt-gold-button" onClick={() => onInteract(object.id, 'collect')}>收集到背包</button>}
    {object.kind === 'token' && !guided && <div className="we-health"><span>计数 {object.value}</span><button className="tt-small-button" onClick={() => onValue(object.id, object.value - 1)}>−1</button><button className="tt-small-button" onClick={() => onValue(object.id, object.value + 1)}>+1</button></div>}
  </fieldset>}<h4>场上角色</h4><div className="we-party-list">{table.objects.filter(o => o.kind === 'figurine').map(o => <button key={o.id} onClick={() => onSelect(o.id)} className={object?.id === o.id ? 'active' : ''}><i style={{ background: o.color }} /><span>{o.name}</span><b>{health(o, table).hp}/{health(o, table).max}</b></button>)}</div></section>
}

export function EditorBehavior({ object, onChange }: { object: TableObject; onChange: (metadata: TableObject['metadata']) => void }) {
  return <><BehaviorFields kind={object.kind} metadata={object.metadata} onChange={onChange} />{object.kind === 'figurine' && <label className="tt-field">角色阵营<select aria-label="编辑角色阵营" value={String(object.metadata.team ?? '队伍')} onChange={e => onChange({ ...object.metadata, team: e.target.value })}>{['队伍', '敌方', '中立'].map(t => <option key={t}>{t}</option>)}</select></label>}</>
}
