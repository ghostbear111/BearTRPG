import {
  addTableLog, createObject, drawCard, returnCardToDeck, shuffleDeck, validateTableSession,
  type CardData, type TableObject, type TableSession, type Vec3,
} from './tabletop'
import { movementRules } from './object-movement'

export type RelicHero = 'blue' | 'orange'
export type RelicGuidePhase = 'turn' | 'rolling' | 'result' | 'turn-end' | 'event-ready' | 'event' | 'complete'
export type RelicEventEffect = 'alert+1' | 'alert+2' | 'alert-2' | 'heal-one' | 'heal-all' | 'guard-damage'
export interface RelicGuideState {
  version: 1
  gameId: 'relic-heist-v1'
  phase: RelicGuidePhase
  hero: RelicHero
  ap: 0 | 1 | 2
  round: number
  lastMessage: string
  pending?: { kind: 'explore' | 'attack'; targetId: string; heroId: string; dieId: string; request: number; generation: number }
  event?: { cardId: string; name: string; description: string; effect: RelicEventEffect }
  outcome?: 'won' | 'lost'
}
export type RelicGuideAction =
  | { type: 'move'; cell: string }
  | { type: 'wait' | 'endTurn' | 'acknowledge' | 'drawEvent' | 'stop' }
  | { type: 'beginRoll'; kind: 'explore' | 'attack'; targetId: string; request: number; generation: number }
  | { type: 'resolveRoll'; dieId: string; value: number; request: number; generation: number }
  | { type: 'applyEvent'; hero?: RelicHero }
export interface RelicGuideStatus {
  blueHp: number; orangeHp: number; alert: number; relics: number; round: number; ap: number
  blueCell: string; orangeCell: string; guardDamage: number
}

const GAME_ID = 'relic-heist-v1' as const
const MAP = '夺宝·遗迹地图'
const DASHBOARD = '夺宝·任务板'
const DECK = '遗迹事件'
const DIE = '检定骰 d6'
const HERO_LABELS = { blue: '蓝队', orange: '橙队' }
const WALLS = ['D3', 'D4', 'E4', 'F2']
const GUARDS = ['E3', 'G4']
const RELICS = ['B3', 'G2', 'F4']
const COUNTERS = ['蓝队生命', '橙队生命', '警戒', '回合', '已收集遗物', '剩余行动'] as const
const PHASES: RelicGuidePhase[] = ['turn', 'rolling', 'result', 'turn-end', 'event-ready', 'event', 'complete']
const EVENTS: Record<string, { effect: RelicEventEffect; description: string }> = {
  脚步逼近: { effect: 'alert+1', description: '警戒增加 1。' },
  机关失控: { effect: 'alert+2', description: '警戒增加 2。' },
  暂时安全: { effect: 'alert-2', description: '警戒减少 2，最低为 0。' },
  尘封药箱: { effect: 'heal-one', description: '选择一名英雄恢复 1 HP，最高为 3。' },
  清澈泉水: { effect: 'heal-all', description: '两名英雄各恢复 1 HP，最高为 3。' },
  遗迹震颤: { effect: 'guard-damage', description: '每名与任意存活守卫正交相邻的英雄损失共计 1 HP；其他英雄不受影响。' },
}
interface Parts {
  map: TableObject; dashboard: TableObject; deck: TableObject; die: TableObject
  heroes: Record<RelicHero, TableObject>; guards: TableObject[]; relics: TableObject[]; walls: TableObject[]
  counters: Record<typeof COUNTERS[number], TableObject>; looseEvents: TableObject[]
}

function fail(message: string): never { throw new Error(`遗迹夺宝：${message}`) }
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
}
function plain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}
function goodId(value: unknown): value is string { return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(value) }
function unique(table: TableSession, predicate: (object: TableObject) => boolean, label: string): TableObject {
  const values = table.objects.filter(predicate)
  if (values.length !== 1) fail(`需要唯一的「${label}」，请从完整试玩桌重新开始引导。`)
  return values[0]
}
function named(table: TableSession, name: string, kind: TableObject['kind']): TableObject {
  return unique(table, object => object.name === name && object.kind === kind, name)
}
function inspect(table: TableSession): Parts {
  const map = named(table, MAP, 'board')
  const deck = named(table, DECK, 'deck')
  const parts: Parts = {
    map, deck, dashboard: named(table, DASHBOARD, 'board'), die: named(table, DIE, 'dice'),
    heroes: {
      blue: unique(table, object => object.kind === 'figurine' && object.metadata.role === 'hero' && object.metadata.team === 'blue', '蓝队探险者'),
      orange: unique(table, object => object.kind === 'figurine' && object.metadata.role === 'hero' && object.metadata.team === 'orange', '橙队探险者'),
    },
    guards: GUARDS.map((cell, index) => named(table, `守卫${index + 1} · ${cell}`, 'figurine')),
    relics: RELICS.map((cell, index) => named(table, `遗物${index + 1} · ${cell}`, 'token')),
    walls: WALLS.map(cell => named(table, `石墙 · ${cell}`, 'block')),
    counters: Object.fromEntries(COUNTERS.map(name => [name, named(table, name, 'token')])) as Parts['counters'],
    looseEvents: table.objects.filter(object => object.kind === 'card' && Object.hasOwn(EVENTS, object.name) &&
      (object.metadata.sourceDeckId === deck.id || object.metadata.relicGuideDiscard === true || object.metadata.relicGuideEvent === true)),
  }
  if (table.objects.filter(object => object.metadata.role === 'hero').length !== 2 ||
      table.objects.filter(object => object.metadata.role === 'guard').length !== 2 ||
      table.objects.filter(object => object.metadata.role === 'relic').length !== 3) fail('英雄、守卫或遗物数量被改变，请从完整试玩桌重新开始引导。')
  if (parts.guards.some(object => object.metadata.role !== 'guard') || parts.relics.some(object => object.metadata.role !== 'relic')) fail('守卫或遗物的角色标记已改变。')
  const eventCards = [...(deck.cards ?? []), ...parts.looseEvents]
  if (eventCards.length !== 6 || new Set(eventCards.map(card => card.name)).size !== 6 || eventCards.some(card => !Object.hasOwn(EVENTS, card.name))) fail('六张原始事件牌不完整或有重复，无法安全恢复，请重新载入游戏开局。')
  return parts
}
function cellPosition(cell: string, y: number): Vec3 {
  if (!/^[A-H][1-6]$/.test(cell)) fail('格子必须是 A1 至 H6。')
  const rounded = (value: number): number => Number(value.toFixed(2)) || 0
  return [rounded(-6 + (cell.charCodeAt(0) - 65) * 1.2), y, rounded(-3.6 + (Number(cell[1]) - 1) * 1.2)]
}
function close(a: number, b: number, tolerance = .15): boolean { return Math.abs(a - b) <= tolerance }
function outside(object: TableObject): boolean {
  return object.position[0] < -6.6 || object.position[0] > 3 || object.position[2] < -4.2 || object.position[2] > 3
}
function objectCell(object: TableObject): string {
  const column = Math.round((object.position[0] + 6) / 1.2)
  const row = Math.round((object.position[2] + 3.6) / 1.2)
  if (column < 0 || column > 7 || row < 0 || row > 5 ||
      !close(object.position[0], -6 + column * 1.2) || !close(object.position[2], -3.6 + row * 1.2)) fail(`「${object.name}」没有位于有效格子中心，请重新开始引导或退出后修正位置。`)
  return `${String.fromCharCode(65 + column)}${row + 1}`
}
function distance(a: string, b: string): number { return Math.abs(a.charCodeAt(0) - b.charCodeAt(0)) + Math.abs(Number(a[1]) - Number(b[1])) }
function guardDamage(parts: Parts, hero: RelicHero): number {
  const cell = objectCell(parts.heroes[hero])
  return parts.guards.some(guard => !outside(guard) && distance(cell, objectCell(guard)) === 1) ? 1 : 0
}
function validateLayout(parts: Parts, state?: RelicGuideState): void {
  if (!close(parts.map.position[0], -1.8) || !close(parts.map.position[2], -.6) ||
      parts.map.metadata.width !== 9.6 || parts.map.metadata.depth !== 7.2 || parts.map.scale.some(value => value !== 1) ||
      parts.map.rotation.some(value => Math.abs(value) > .01)) fail('引导仅支持原始地图的位置、尺寸与朝向，请重新开始引导。')
  const blocked = new Set(WALLS)
  parts.walls.forEach((wall, index) => { if (objectCell(wall) !== WALLS[index]) fail('石墙位置被改变，请重新开始引导。') })
  parts.guards.forEach((guard, index) => {
    if (!outside(guard)) { const cell = objectCell(guard); if (cell !== GUARDS[index]) fail('存活守卫位置被改变，请重新开始引导。'); blocked.add(cell) }
  })
  const blue = objectCell(parts.heroes.blue)
  const orange = objectCell(parts.heroes.orange)
  if (blue === orange || blocked.has(blue) || blocked.has(orange)) fail('英雄不能停在墙、守卫或另一名英雄所在的格子。')
  parts.relics.forEach((relic, index) => {
    if (!outside(relic)) {
      const [x, , z] = cellPosition(RELICS[index], 0)
      if (!close(relic.position[0], x + .4) || !close(relic.position[2], z + .4)) fail('遗物位置被改变，请重新开始引导。')
    }
  })
  for (const name of ['蓝队生命', '橙队生命'] as const) if (!integer(parts.counters[name].value, 0, 3)) fail('英雄生命必须是 0 至 3。')
  if (!integer(parts.counters.警戒.value, 0, 7) || !integer(parts.counters.回合.value, 1, 8) || !integer(parts.counters.剩余行动.value, 0, 2)) fail('警戒、回合或剩余行动计数无效。')
  const collected = parts.relics.filter(outside).length
  if (parts.counters.已收集遗物.value !== collected) fail('遗物计数与地图上剩余的遗物不一致，请重新开始引导。')
  if (parts.die.sides !== 6 || parts.die.scale.some(value => value !== parts.die.scale[0])) fail('检定需要标准、等比缩放的 d6。')
  if (state && (state.ap !== parts.counters.剩余行动.value || state.round !== parts.counters.回合.value)) fail('引导进度与行动或回合计数不一致，请重新开始引导。')
}
function parseState(value: unknown): RelicGuideState {
  if (typeof value !== 'string' || value.length > 4000) fail('引导进度格式损坏，请重新开始引导。')
  let source: unknown
  try { source = JSON.parse(value) } catch { fail('引导进度不是有效 JSON，请重新开始引导。') }
  if (!plain(source) || source.version !== 1 || source.gameId !== GAME_ID || !PHASES.includes(source.phase as RelicGuidePhase) ||
      !['blue', 'orange'].includes(source.hero as string) || !integer(source.ap, 0, 2) || !integer(source.round, 1, 8) ||
      typeof source.lastMessage !== 'string' || source.lastMessage.length > 1000) fail('引导进度字段损坏，请重新开始引导。')
  const state: RelicGuideState = { version: 1, gameId: GAME_ID, phase: source.phase as RelicGuidePhase, hero: source.hero as RelicHero, ap: source.ap as RelicGuideState['ap'], round: source.round, lastMessage: source.lastMessage }
  if (source.pending !== undefined) {
    const pending = source.pending
    if (!plain(pending) || !['explore', 'attack'].includes(pending.kind as string) || !goodId(pending.targetId) || !goodId(pending.heroId) || !goodId(pending.dieId) ||
        !integer(pending.request, 1, Number.MAX_SAFE_INTEGER) || !integer(pending.generation, 0, Number.MAX_SAFE_INTEGER)) fail('待决骰子记录损坏，请重新开始引导。')
    state.pending = { kind: pending.kind as 'explore' | 'attack', targetId: pending.targetId, heroId: pending.heroId, dieId: pending.dieId, request: pending.request, generation: pending.generation }
  }
  if (source.event !== undefined) {
    const event = source.event
    if (!plain(event) || !goodId(event.cardId) || typeof event.name !== 'string' || !Object.hasOwn(EVENTS, event.name) ||
        event.effect !== EVENTS[event.name].effect || event.description !== EVENTS[event.name].description) fail('事件记录损坏，请重新开始引导。')
    state.event = { cardId: event.cardId, name: event.name, description: event.description, effect: event.effect as RelicEventEffect }
  }
  if (source.outcome !== undefined) {
    if (!['won', 'lost'].includes(source.outcome as string)) fail('结束状态损坏。')
    state.outcome = source.outcome as 'won' | 'lost'
  }
  if ((state.phase === 'rolling') !== !!state.pending || (state.phase === 'event') !== !!state.event ||
      (state.phase === 'complete') !== !!state.outcome ||
      (['turn', 'rolling'].includes(state.phase) && state.ap === 0) ||
      (state.phase === 'result' && state.ap > 1) ||
      (['turn-end', 'event-ready', 'event'].includes(state.phase) && state.ap !== 0) ||
      (['event-ready', 'event'].includes(state.phase) && state.hero !== 'orange')) fail('引导阶段与行动记录不一致，请重新开始引导。')
  return state
}
export function isRelicGame(table: TableSession): boolean {
  return Array.isArray(table.objects) && table.objects.some(object => object.kind === 'board' && object.name === MAP) &&
    table.objects.some(object => object.metadata?.role === 'hero' && object.metadata.team === 'blue') &&
    table.objects.some(object => object.metadata?.role === 'hero' && object.metadata.team === 'orange')
}
/** Safe for React render: invalid serialized progress is reported by actions rather than throwing here. */
export function readRelicGuide(table: TableSession): RelicGuideState | null {
  try {
    const map = table.objects.find(object => object.kind === 'board' && object.name === MAP)
    if (!map || map.metadata.guideState === undefined) return null
    return parseState(map.metadata.guideState)
  } catch { return null }
}
function requireGuide(table: TableSession): { parts: Parts; state: RelicGuideState } {
  const parts = inspect(table)
  if (parts.map.metadata.guideState === undefined) fail('请先开始引导局。旧试玩进度会保留在原桌面。')
  const state = parseState(parts.map.metadata.guideState)
  validateLayout(parts, state)
  if (state.pending && (state.pending.heroId !== parts.heroes[state.hero].id || state.pending.dieId !== parts.die.id ||
      !(state.pending.kind === 'explore' ? parts.relics : parts.guards).some(object => object.id === state.pending!.targetId))) fail('待决检定引用已失效，请重新开始引导。')
  if (state.event && !parts.looseEvents.some(card => card.id === state.event!.cardId && card.name === state.event!.name && card.metadata.relicGuideEvent === true)) fail('当前事件牌引用已失效，请重新开始引导。')
  if (state.phase === 'complete') {
    const actual = outcome(parts)
    if ((state.outcome === 'won' && actual !== 'won') || (state.outcome === 'lost' && actual !== 'lost' && state.round !== 8)) fail('结束记录与实际胜负条件不一致，请重新开始引导。')
  }
  return { parts, state }
}
function outcome(parts: Parts): 'won' | 'lost' | undefined {
  if (parts.counters.蓝队生命.value === 0 || parts.counters.橙队生命.value === 0 || parts.counters.警戒.value >= 6) return 'lost'
  if (parts.counters.已收集遗物.value === 3 && [objectCell(parts.heroes.blue), objectCell(parts.heroes.orange)].every(cell => ['B5', 'C5'].includes(cell))) return 'won'
  return undefined
}
function finish(state: RelicGuideState, result: 'won' | 'lost', message?: string): RelicGuideState {
  return { ...state, phase: 'complete', outcome: result, pending: undefined, event: undefined,
    lastMessage: message ?? (result === 'won' ? '三件遗物已全部带回入口，两名英雄平安归来！合作夺宝成功。' : '警戒达到 6 或英雄生命归零，夺宝失败。可以重新开始一局。') }
}
function replace(table: TableSession, objectId: string, patch: Partial<TableObject>): TableSession {
  return { ...table, objects: table.objects.map(object => object.id === objectId ? { ...object, ...patch } : object) }
}
function setCounter(table: TableSession, parts: Parts, name: typeof COUNTERS[number], value: number): TableSession {
  return replace(table, parts.counters[name].id, { value })
}
function writeState(table: TableSession, state: RelicGuideState): TableSession {
  const parts = inspect(table)
  let next = setCounter(table, parts, '剩余行动', state.ap)
  next = setCounter(next, parts, '回合', state.round)
  const serialized = JSON.stringify(state)
  if (serialized.length > 4000) fail('引导状态超过存储上限。')
  next = replace(next, parts.map.id, { metadata: { ...parts.map.metadata, guideState: serialized } })
  const progress = `【当前进度】第 ${state.round} 轮，${HERO_LABELS[state.hero]}回合；剩余行动 ${state.ap}。${state.lastMessage.replace(/\s+/g, ' ')}`
  next.notes = /【当前进度】[^\n]*/.test(next.notes) ? next.notes.replace(/【当前进度】[^\n]*/, () => progress) : `${next.notes}\n\n${progress}`
  return next
}
function commit(table: TableSession, state: RelicGuideState): TableSession {
  const ended = outcome(inspect(table))
  const finalState = ended && state.phase !== 'complete' ? finish(state, ended) : state
  return validateTableSession(addTableLog(writeState(table, finalState), finalState.lastMessage))
}

export function createRelicGuidedSession(source: TableSession): TableSession {
  let table = validateTableSession(source)
  const parts = inspect(table)
  const knownCards: CardData[] = [...(parts.deck.cards ?? []), ...parts.looseEvents.map(card => ({ id: card.id, name: card.name, description: card.description, texture: card.texture, backTexture: card.backTexture }))]
    .map(card => ({ ...card, description: EVENTS[card.name].description }))
  const ids = new Map(table.objects.map(object => [object.id, createObject(object.kind).id]))
  const eventIds = new Set(parts.looseEvents.map(card => card.id))
  table = { ...table, id: createObject('token').id, name: '遗迹夺宝 · 引导局', createdAt: Date.now(), logs: [],
    objects: table.objects.filter(object => !eventIds.has(object.id)).map(object => {
      const metadata = { ...object.metadata }
      delete metadata.guideState; delete metadata.zone; delete metadata.owner; delete metadata.sourceDeckId
      return { ...object, id: ids.get(object.id)!, rotation: [0, 0, 0], metadata, ...(object.cards ? { cards: object.cards.map(card => ({ ...card, id: createObject('card').id })) } : {}) }
    }), grid: { enabled: false, snap: true, size: 1.2 }, physics: { gravity: true } }
  const remap = (object: TableObject) => ids.get(object.id)!
  table = replace(table, remap(parts.map), { position: [-1.8, .05, -.6], scale: [1, 1, 1], locked: true, metadata: { ...parts.map.metadata, width: 9.6, depth: 7.2, height: .1 } })
  table = replace(table, remap(parts.dashboard), { position: [6.3, .05, -.6], scale: [1, 1, 1], locked: true })
  for (const hero of ['blue', 'orange'] as const) table = replace(table, remap(parts.heroes[hero]), { position: cellPosition(hero === 'blue' ? 'B5' : 'C5', .7), locked: true })
  parts.guards.forEach((guard, index) => { table = replace(table, remap(guard), { position: cellPosition(GUARDS[index], .7), locked: true }) })
  parts.relics.forEach((relic, index) => { const position = cellPosition(RELICS[index], .15); position[0] += .4; position[2] += .4; table = replace(table, remap(relic), { position, locked: true }) })
  parts.walls.forEach((wall, index) => { table = replace(table, remap(wall), { position: cellPosition(WALLS[index], .35), locked: true }) })
  table = replace(table, remap(parts.deck), { position: [4.8, .23, -2.4], locked: true, faceDown: true, cards: knownCards.map(card => ({ ...card, id: createObject('card').id })), value: 6 })
  table = replace(table, remap(parts.die), { position: [7.2, .58, 0], locked: false, sides: 6, scale: [.75, .75, .75], value: 0 })
  const values = [3, 3, 0, 1, 0, 2]
  const positions: Vec3[] = [[4.8, .18, 1.2], [6.6, .18, 1.2], [8.4, .18, 1.2], [4.8, .18, 2.4], [6.6, .18, 2.4], [8.4, .18, 2.4]]
  COUNTERS.forEach((name, index) => { table = replace(table, remap(parts.counters[name]), { position: positions[index], locked: true, value: values[index] }) })
  table = shuffleDeck(validateTableSession(table), remap(parts.deck))
  // Initial logs describe this new match, never another table's past outcomes.
  table.logs = []
  return commit(table, { version: 1, gameId: GAME_ID, phase: 'turn', hero: 'blue', ap: 2, round: 1,
    lastMessage: '蓝队先行动，有 2 次行动。建议先移动到 B3，再探索脚下遗物。' })
}

export function relicGuideStatus(table: TableSession): RelicGuideStatus {
  const { parts, state } = requireGuide(table)
  return { blueHp: parts.counters.蓝队生命.value, orangeHp: parts.counters.橙队生命.value, alert: parts.counters.警戒.value,
    relics: parts.counters.已收集遗物.value, round: state.round, ap: state.ap, blueCell: objectCell(parts.heroes.blue), orangeCell: objectCell(parts.heroes.orange), guardDamage: guardDamage(parts, state.hero) }
}
function moveOptions(parts: Parts, state: RelicGuideState): { cell: string; label: string }[] {
  if (state.phase !== 'turn' || state.ap === 0 || outcome(parts)) return []
  // The guide locks physical pickup itself; its movement action uses authored rules.
  const actor = parts.heroes[state.hero], rule = movementRules({ ...actor, locked: false })
  if (rule.mode === 'fixed') return []
  const limit = Math.min(2, Math.floor((rule.range + .001) / 1.2))
  const origin = objectCell(parts.heroes[state.hero])
  const teammate = objectCell(parts.heroes[state.hero === 'blue' ? 'orange' : 'blue'])
  const blocked = new Set([...WALLS, ...parts.guards.filter(guard => !outside(guard)).map(objectCell)])
  const distances = new Map<string, number>([[origin, 0]])
  const queue = [origin]
  while (queue.length) {
    const cell = queue.shift()!
    const steps = distances.get(cell)!
    if (steps === limit) continue
    const column = cell.charCodeAt(0) - 65
    const row = Number(cell[1]) - 1
    for (const [x, z] of [[column - 1, row], [column + 1, row], [column, row - 1], [column, row + 1]]) {
      if (x < 0 || x > 7 || z < 0 || z > 5) continue
      const candidate = `${String.fromCharCode(65 + x)}${z + 1}`
      if (blocked.has(candidate) || distances.has(candidate)) continue
      distances.set(candidate, steps + 1); queue.push(candidate)
    }
  }
  return [...distances].filter(([cell]) => cell !== origin && cell !== teammate && (actor.metadata.moveStep === undefined || rule.mode !== 'grid' || [0, 2].every(i => Math.abs((cellPosition(cell, actor.position[1])[i] - actor.position[i]) / rule.step - Math.round((cellPosition(cell, actor.position[1])[i] - actor.position[i]) / rule.step)) < .001))).sort(([a], [b]) => Number(a[1]) - Number(b[1]) || a.localeCompare(b))
    .map(([cell, steps]) => ({ cell, label: `${cell}（${steps} 格）` }))
}
export function guideMoveOptions(table: TableSession): { cell: string; label: string }[] { const { parts, state } = requireGuide(table); return moveOptions(parts, state) }
function targets(parts: Parts, state: RelicGuideState): { explore: { id: string; label: string }[]; attack: { id: string; label: string }[] } {
  if (state.phase !== 'turn' || state.ap === 0 || outcome(parts)) return { explore: [], attack: [] }
  const cell = objectCell(parts.heroes[state.hero])
  return {
    explore: parts.relics.filter((relic, index) => !outside(relic) && RELICS[index] === cell).map(relic => ({ id: relic.id, label: relic.name })),
    attack: parts.guards.filter(guard => !outside(guard) && distance(cell, objectCell(guard)) === 1).map(guard => ({ id: guard.id, label: guard.name })),
  }
}
export function guideTargets(table: TableSession): ReturnType<typeof targets> { const { parts, state } = requireGuide(table); return targets(parts, state) }
function requirePhase(state: RelicGuideState, phase: RelicGuidePhase): void { if (state.phase !== phase) fail('当前阶段不能执行这项操作，请按引导完成当前步骤。') }
function afterAction(state: RelicGuideState, message: string): RelicGuideState {
  const ap = (state.ap - 1) as RelicGuideState['ap']
  return { ...state, ap, phase: ap ? 'turn' : 'turn-end', lastMessage: `${message}${ap ? `还剩 ${ap} 次行动。` : '本英雄行动已用完，请结束个人回合。'}` }
}
export function recoverRelicGuide(source: TableSession): TableSession {
  const state = readRelicGuide(source)
  if (!state || state.phase !== 'rolling') return source
  const table = validateTableSession(source)
  const { parts } = requireGuide(table)
  const next = replace(table, parts.die.id, { value: 0 })
  return commit(next, { ...state, phase: 'turn', pending: undefined, lastMessage: '未完成的物理投骰已取消，没有扣除行动。请重新发起探索或攻击。' })
}

/** One action yields one fully validated snapshot; any exception leaves source untouched. */
export function applyRelicGuideAction(source: TableSession, action: RelicGuideAction, seat?: string): TableSession {
  let table = validateTableSession(source)
  if (action.type === 'stop') {
    const map = named(table, MAP, 'board')
    const metadata = { ...map.metadata }; delete metadata.guideState
    table = replace(table, map.id, { metadata })
    table = { ...table, objects: table.objects.map(object =>
      ['hero', 'guard', 'relic'].includes(object.metadata.role as string) || object.name === DECK || object.metadata.relicGuideEvent === true || object.metadata.relicGuideDiscard === true
        ? { ...object, locked: false } : object) }
    return validateTableSession(addTableLog(table, '已退出规则引导，保留当前盘面与最后进度，可以继续自由操作。'))
  }
  const { parts, state } = requireGuide(table)
  const ended = outcome(parts)
  if (ended && state.phase !== 'complete') return commit(table, finish(state, ended))
  if (state.phase === 'complete') return table
  switch (action.type) {
    case 'move': {
      const owner = movementRules(parts.heroes[state.hero]).seat
      if (owner && seat !== undefined && owner !== seat) fail(`此物件由${owner}操控。`)
      requirePhase(state, 'turn')
      if (!moveOptions(parts, state).some(option => option.cell === action.cell)) fail('这次移动不可达：最多 2 格正交移动，不能穿墙或守卫，也不能停在队友所在格。')
      table = replace(table, parts.heroes[state.hero].id, { position: cellPosition(action.cell, parts.heroes[state.hero].position[1]) })
      return commit(table, afterAction(state, `${HERO_LABELS[state.hero]}移动到 ${action.cell}。`))
    }
    case 'wait':
      requirePhase(state, 'turn')
      return commit(table, afterAction(state, `${HERO_LABELS[state.hero]}原地等待。`))
    case 'beginRoll': {
      requirePhase(state, 'turn')
      if (!['explore', 'attack'].includes(action.kind) || !integer(action.request, 1, Number.MAX_SAFE_INTEGER) || !integer(action.generation, 0, Number.MAX_SAFE_INTEGER)) fail('投骰身份或检定类型无效。')
      if (!targets(parts, state)[action.kind].some(target => target.id === action.targetId)) fail('探索必须站在遗物格，攻击必须正交相邻于存活守卫。')
      if (!table.physics.gravity || parts.die.locked) fail('请启用重力并解锁检定骰，才能进行真实物理检定。')
      table = replace(table, parts.die.id, { value: 0 })
      return commit(table, { ...state, phase: 'rolling', pending: { kind: action.kind, targetId: action.targetId, heroId: parts.heroes[state.hero].id, dieId: parts.die.id, request: action.request, generation: action.generation },
        lastMessage: `${HERO_LABELS[state.hero]}正在${action.kind === 'explore' ? '探索遗物（3+成功）' : '攻击守卫（4+成功）'}，等待 d6 真实落定；现在还不扣行动。` })
    }
    case 'resolveRoll': {
      if (state.phase !== 'rolling' || !state.pending || state.pending.dieId !== action.dieId || state.pending.request !== action.request || state.pending.generation !== action.generation) fail('骰子结果已过期或已经结算，不会重复扣除行动。')
      if (!integer(action.value, 1, 6)) fail('检定结果必须是 d6 真实落定的 1 至 6 点。')
      const pending = state.pending
      const active = { ...state, phase: 'turn' as const, pending: undefined }
      if (!targets(parts, active)[pending.kind].some(target => target.id === pending.targetId)) fail('投骰期间目标或英雄位置已改变，无法结算，请恢复或重新开始引导。')
      table = replace(table, parts.die.id, { value: action.value })
      const success = action.value >= (pending.kind === 'explore' ? 3 : 4)
      let message = `${HERO_LABELS[state.hero]}的真实 d6 = ${action.value}。`
      if (pending.kind === 'explore') {
        if (success) {
          const index = parts.relics.findIndex(relic => relic.id === pending.targetId)
          table = replace(table, pending.targetId, { position: [-5.6 + index * 1.2, .15, 4.8] })
          table = setCounter(table, parts, '已收集遗物', parts.counters.已收集遗物.value + 1)
          const collected = parts.counters.已收集遗物.value + 1
          message += `探索成功，已收集 ${collected}/3 件遗物。${collected === 3 ? '遗物已集齐！接下来让两名英雄都返回 B5、C5 入口格，才算胜利。' : `还需收集 ${3 - collected} 件，并让两名英雄返回 B5、C5 入口格。`}`
        } else { table = setCounter(table, parts, '警戒', parts.counters.警戒.value + 1); message += '探索失败，警戒增加 1。' }
      } else if (success) {
        const index = parts.guards.findIndex(guard => guard.id === pending.targetId)
        table = replace(table, pending.targetId, { position: [index * 1.2, .7, 4.8] })
        message += '攻击成功，守卫已被击败。'
      } else message += '攻击未命中，守卫保持原位。'
      const ap = (state.ap - 1) as RelicGuideState['ap']
      return commit(table, { ...state, pending: undefined, phase: 'result', ap, lastMessage: `${message}已消耗 1 次行动，剩余 ${ap}。请确认结果后继续。` })
    }
    case 'acknowledge':
      requirePhase(state, 'result')
      return commit(table, { ...state, phase: state.ap ? 'turn' : 'turn-end', lastMessage: state.ap ? `${HERO_LABELS[state.hero]}还可执行 ${state.ap} 次行动。` : `${HERO_LABELS[state.hero]}的两次行动已用完，请结束个人回合。` })
    case 'endTurn': {
      requirePhase(state, 'turn-end')
      if (state.ap !== 0) fail('必须用完两次行动才能结束个人回合；可以选择等待。')
      const damage = guardDamage(parts, state.hero)
      const hpName = state.hero === 'blue' ? '蓝队生命' : '橙队生命'
      if (damage) table = setCounter(table, parts, hpName, Math.max(0, parts.counters[hpName].value - 1))
      const damageText = damage ? `${HERO_LABELS[state.hero]}仍与守卫相邻，损失共计 1 HP。` : `${HERO_LABELS[state.hero]}不受守卫伤害。`
      return commit(table, state.hero === 'blue' ? { ...state, hero: 'orange', ap: 2, phase: 'turn', lastMessage: `${damageText}轮到橙队，有 2 次行动。` }
        : { ...state, ap: 0, phase: 'event-ready', lastMessage: `${damageText}本轮两名英雄都已行动，请抽取 1 张事件。` })
    }
    case 'drawEvent': {
      requirePhase(state, 'event-ready')
      if (!(parts.deck.cards?.length)) {
        const discards = parts.looseEvents.filter(card => card.metadata.relicGuideDiscard === true)
        if (discards.length !== 6) fail('空牌堆需要六张本游戏弃牌，不能回收未结算或其他游戏的牌。')
        for (const card of discards) table = returnCardToDeck(table, card.id, parts.deck.id)
        table = shuffleDeck(table, parts.deck.id)
      }
      const deck = table.objects.find(object => object.id === parts.deck.id)!
      const top = deck.cards![0]
      table = drawCard(table, parts.deck.id)
      const card = table.objects.find(object => object.id === top.id)!
      table = replace(table, card.id, { position: [7.2, .15, -2.4], locked: true, metadata: { ...card.metadata, relicGuideEvent: true } })
      const definition = EVENTS[card.name]
      return commit(table, { ...state, phase: 'event', event: { cardId: card.id, name: card.name, ...definition },
        lastMessage: `抽到「${card.name}」：${definition.description}${definition.effect === 'heal-one' ? '请选择接受治疗的英雄。' : '请结算这张事件。'}` })
    }
    case 'applyEvent': {
      requirePhase(state, 'event')
      const event = state.event!
      if (event.effect === 'heal-one' && !['blue', 'orange'].includes(action.hero as string)) fail('尘封药箱需要选择蓝队或橙队接受治疗。')
      if (event.effect !== 'heal-one' && action.hero !== undefined) fail('这张事件不需要选择英雄。')
      if (event.effect === 'alert+1' || event.effect === 'alert+2') table = setCounter(table, parts, '警戒', parts.counters.警戒.value + (event.effect === 'alert+1' ? 1 : 2))
      else if (event.effect === 'alert-2') table = setCounter(table, parts, '警戒', Math.max(0, parts.counters.警戒.value - 2))
      else if (event.effect === 'heal-one' || event.effect === 'heal-all') {
        for (const hero of ['blue', 'orange'] as const) if (event.effect === 'heal-all' || hero === action.hero) {
          const hpName = hero === 'blue' ? '蓝队生命' : '橙队生命'
          table = setCounter(table, parts, hpName, Math.min(3, parts.counters[hpName].value + 1))
        }
      } else if (event.effect === 'guard-damage') {
        for (const hero of ['blue', 'orange'] as const) {
          const hpName = hero === 'blue' ? '蓝队生命' : '橙队生命'
          table = setCounter(table, parts, hpName, Math.max(0, parts.counters[hpName].value - guardDamage(parts, hero)))
        }
      }
      const card = parts.looseEvents.find(card => card.id === event.cardId)!
      const discardIndex = parts.looseEvents.filter(card => card.metadata.relicGuideDiscard === true).length
      table = replace(table, card.id, { position: [7.2 + (discardIndex % 3) * .2, .12 + Math.floor(discardIndex / 3) * .025, -2.4 + (discardIndex % 3) * .12], locked: true,
        metadata: { ...card.metadata, relicGuideEvent: false, relicGuideDiscard: true, zone: 'relic-discard' } })
      const nextState = { ...state, event: undefined }
      const ended = outcome(inspect(table))
      if (ended) return commit(table, finish(nextState, ended))
      if (state.round === 8) return commit(table, finish(nextState, 'lost', '第 8 轮事件已经结算，两名英雄还未带齐遗物回到入口，夺宝失败。'))
      return commit(table, { ...nextState, hero: 'blue', phase: 'turn', ap: 2, round: state.round + 1,
        lastMessage: `已结算「${event.name}」并放入弃牌区。第 ${state.round + 1} 轮开始，蓝队有 2 次行动。` })
    }
    default: fail('未知引导操作。')
  }
}
