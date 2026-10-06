import { describe, expect, it } from 'vitest'
import sourceData from '../../tests/fixtures/relic.realm.json'
import { drawCard, validateTableSession, type TableSession, type TableObject } from './tabletop'
import {
  applyRelicGuideAction as act, createRelicGuidedSession, guideMoveOptions, guideTargets, isRelicGame,
  readRelicGuide, recoverRelicGuide, relicGuideStatus, type RelicGuideState, type RelicHero,
} from './relic-guide'

const source = validateTableSession(sourceData)
const eventNames = ['脚步逼近', '机关失控', '暂时安全', '尘封药箱', '清澈泉水', '遗迹震颤']
function game(): TableSession { return createRelicGuidedSession(source) }
function named(table: TableSession, name: string): TableObject { return table.objects.find(object => object.name === name)! }
function hero(table: TableSession, team: RelicHero): TableObject { return table.objects.find(object => object.metadata.role === 'hero' && object.metadata.team === team)! }
function put(table: TableSession, objectId: string, patch: Partial<TableObject>): TableSession {
  return { ...table, objects: table.objects.map(object => object.id === objectId ? { ...object, ...patch } : object) }
}
function heroAt(table: TableSession, team: RelicHero, cell: string): TableSession {
  const object = hero(table, team)
  return put(table, object.id, { position: [-6 + (cell.charCodeAt(0) - 65) * 1.2, object.position[1], -3.6 + (Number(cell[1]) - 1) * 1.2] })
}
function counter(table: TableSession, name: string, value: number): TableSession { return put(table, named(table, name).id, { value }) }
function stateAt(table: TableSession, patch: Partial<RelicGuideState>): TableSession {
  const state = { ...readRelicGuide(table)!, ...patch }
  const map = named(table, '夺宝·遗迹地图')
  table = put(table, map.id, { metadata: { ...map.metadata, guideState: JSON.stringify(state) } })
  return counter(counter(table, '回合', state.round), '剩余行动', state.ap)
}
function orderEvent(table: TableSession, name: string): TableSession {
  const deck = named(table, '遗迹事件')
  return put(table, deck.id, { cards: [...deck.cards!].sort((a, b) => Number(b.name === name) - Number(a.name === name)) })
}
function eventReady(table = game()): TableSession {
  table = act(act(table, { type: 'wait' }), { type: 'wait' })
  table = act(table, { type: 'endTurn' })
  table = act(act(table, { type: 'wait' }), { type: 'wait' })
  return act(table, { type: 'endTurn' })
}
function roll(table: TableSession, kind: 'explore' | 'attack', targetId: string, value: number, request = 1): TableSession {
  table = act(table, { type: 'beginRoll', kind, targetId, request, generation: 7 })
  return act(table, { type: 'resolveRoll', dieId: named(table, '检定骰 d6').id, value, request, generation: 7 })
}
function cardIds(table: TableSession): string[] {
  return [...(named(table, '遗迹事件').cards ?? []).map(card => card.id), ...table.objects.filter(object => object.kind === 'card').map(card => card.id)].sort()
}

describe('guided match creation and persisted state', () => {
  it('uses the real game package and creates a clean independent match', () => {
    const table = game()
    expect(isRelicGame(table)).toBe(true)
    expect(table.id).not.toBe(source.id)
    expect(table.name).toBe('遗迹夺宝 · 引导局')
    expect(table.objects).toHaveLength(21)
    expect(table.objects.every(object => !source.objects.some(original => original.id === object.id))).toBe(true)
    expect(relicGuideStatus(table)).toEqual({ blueHp: 3, orangeHp: 3, alert: 0, relics: 0, round: 1, ap: 2, blueCell: 'B5', orangeCell: 'C5', guardDamage: 0 })
    expect(readRelicGuide(table)?.phase).toBe('turn')
    expect(named(table, '检定骰 d6').value).toBe(0)
    expect(named(table, '遗迹事件').cards?.map(card => card.name).sort()).toEqual([...eventNames].sort())
    expect(table.notes).toContain('【当前进度】第 1 轮，蓝队回合；剩余行动 2。')
    expect(validateTableSession(JSON.parse(JSON.stringify(table)))).toEqual(table)
    expect(source.objects).toHaveLength(21)
    expect(readRelicGuide(source)).toBeNull()
  })

  it('recovers all six already drawn cards and resets progressed heroes, relics and counters', () => {
    let old = validateTableSession(source)
    const deckId = named(old, '遗迹事件').id
    for (let i = 0; i < 6; i++) old = drawCard(old, deckId)
    old = heroAt(old, 'blue', 'B3')
    old = counter(counter(old, '警戒', 5), '蓝队生命', 1)
    const relic = named(old, '遗物1 · B3')
    old = put(old, relic.id, { position: [-4.8, .15, 4.8] })
    old = counter(old, '已收集遗物', 1)
    const reset = createRelicGuidedSession(old)
    expect(reset.objects).toHaveLength(21)
    expect(named(reset, '遗迹事件').cards).toHaveLength(6)
    expect(relicGuideStatus(reset).blueCell).toBe('B5')
    expect(relicGuideStatus(reset).relics).toBe(0)
    expect(relicGuideStatus(reset).alert).toBe(0)
    expect(relicGuideStatus(reset).blueHp).toBe(3)
    expect(old.objects.filter(object => object.kind === 'card')).toHaveLength(6)
  })

  it('never throws while reading malformed UI state, but rejects its attempted execution', () => {
    let table = game()
    const map = named(table, '夺宝·遗迹地图')
    table = put(table, map.id, { metadata: { ...map.metadata, guideState: '{invalid' } })
    expect(readRelicGuide(table)).toBeNull()
    expect(() => act(table, { type: 'wait' })).toThrow('不是有效 JSON')
    expect(() => createRelicGuidedSession({ ...source, objects: source.objects.filter(object => object.name !== '遗迹事件') })).toThrow('唯一')
    const missing = { ...source, objects: source.objects.map(object => object.name === '遗迹事件' ? { ...object, cards: object.cards!.slice(1) } : object) }
    expect(() => createRelicGuidedSession(missing)).toThrow('六张原始事件牌不完整')
  })

  it('rejects corrupt layouts or counter mismatches before changing anything', () => {
    const table = game()
    const movedWall = put(table, named(table, '石墙 · D3').id, { position: [-3.6, .35, -1.2] })
    expect(() => guideMoveOptions(movedWall)).toThrow('石墙位置')
    const offGrid = put(table, hero(table, 'blue').id, { position: [-4.4, .7, 1.2] })
    expect(() => act(offGrid, { type: 'wait' })).toThrow('有效格子中心')
    expect(() => act(counter(table, '已收集遗物', 2), { type: 'wait' })).toThrow('遗物计数')
    expect(() => act(counter(table, '剩余行动', 1), { type: 'wait' })).toThrow('进度与行动')
    expect(relicGuideStatus(table).ap).toBe(2)
  })
})

describe('movement, action points and real roll matching', () => {
  it('uses BFS for at most two orthogonal steps, allows passing a teammate, and forbids occupied destinations', () => {
    const table = game()
    const options = guideMoveOptions(table).map(option => option.cell)
    expect(options).toContain('B3')
    expect(options).toContain('D5') // B5 -> C5 (teammate) -> D5.
    expect(options).not.toContain('C5')
    expect(options).not.toContain('E5')
    const moved = act(table, { type: 'move', cell: 'B3' })
    expect(relicGuideStatus(moved).blueCell).toBe('B3')
    expect(relicGuideStatus(moved).ap).toBe(1)
    expect(relicGuideStatus(table).blueCell).toBe('B5')
    expect(() => act(table, { type: 'move', cell: 'C5' })).toThrow('不可达')
  })

  it('does not treat a Manhattan-distance target as reachable through a wall or a guard', () => {
    let table = heroAt(game(), 'blue', 'C3')
    expect(guideMoveOptions(table).map(option => option.cell)).toContain('D2') // C3 -> C2 -> D2.
    expect(guideMoveOptions(table).map(option => option.cell)).not.toContain('D3')
    table = heroAt(game(), 'blue', 'G5')
    expect(guideMoveOptions(table).map(option => option.cell)).not.toContain('G3') // Would pass through G4.
    expect(() => act(table, { type: 'move', cell: 'G3' })).toThrow('不可达')
  })

  it('requires a relic beneath the hero or an orthogonally adjacent live guard', () => {
    let table = heroAt(game(), 'blue', 'F4')
    expect(guideTargets(table).explore.map(target => target.label)).toEqual(['遗物3 · F4'])
    expect(guideTargets(table).attack.map(target => target.label)).toEqual(['守卫2 · G4'])
    table = heroAt(table, 'blue', 'F5')
    expect(guideTargets(table)).toEqual({ explore: [], attack: [] })
    expect(() => act(table, { type: 'beginRoll', kind: 'explore', targetId: named(table, '遗物3 · F4').id, request: 1, generation: 0 })).toThrow('探索必须')
  })

  it('does not consume AP until matching physical dice resolve, and rejects duplicate/stale callbacks', () => {
    let table = heroAt(game(), 'blue', 'B3')
    table = act(table, { type: 'beginRoll', kind: 'explore', targetId: named(table, '遗物1 · B3').id, request: 13, generation: 7 })
    const pending = readRelicGuide(table)!.pending!
    expect(relicGuideStatus(table).ap).toBe(2)
    expect(readRelicGuide(table)?.phase).toBe('rolling')
    expect(named(table, '检定骰 d6').value).toBe(0)
    for (const patch of [{ request: 12 }, { generation: 6 }, { dieId: hero(table, 'blue').id }, { value: 0 }, { value: 7 }]) {
      expect(() => act(table, { type: 'resolveRoll', dieId: pending.dieId, value: 2, request: 13, generation: 7, ...patch })).toThrow()
    }
    const resolved = act(table, { type: 'resolveRoll', dieId: pending.dieId, value: 2, request: 13, generation: 7 })
    expect(readRelicGuide(resolved)?.phase).toBe('result')
    expect(relicGuideStatus(resolved).ap).toBe(1)
    expect(relicGuideStatus(resolved).alert).toBe(1)
    expect(named(resolved, '检定骰 d6').value).toBe(2)
    expect(() => act(resolved, { type: 'resolveRoll', dieId: pending.dieId, value: 6, request: 13, generation: 7 })).toThrow('已过期')
    expect(() => act(resolved, { type: 'wait' })).toThrow('当前阶段')
    expect(readRelicGuide(act(resolved, { type: 'acknowledge' }))?.phase).toBe('turn')
    expect(relicGuideStatus(table).ap).toBe(2)
  })

  it.each([1, 2, 3, 4, 5, 6])('applies the d6 exploration threshold at actual value %s', value => {
    const table = heroAt(game(), 'blue', 'B3')
    const result = roll(table, 'explore', named(table, '遗物1 · B3').id, value)
    expect(relicGuideStatus(result).relics).toBe(value >= 3 ? 1 : 0)
    expect(relicGuideStatus(result).alert).toBe(value >= 3 ? 0 : 1)
    expect(relicGuideStatus(result).ap).toBe(1)
  })

  it.each([3, 4])('applies the attack threshold, retains the defeated object and spends one AP at %s', value => {
    const table = heroAt(game(), 'blue', 'G3')
    const guard = named(table, '守卫2 · G4')
    const result = roll(table, 'attack', guard.id, value)
    expect(named(result, guard.name).id).toBe(guard.id)
    expect(named(result, guard.name).position[2]).toBe(value >= 4 ? 4.8 : 0)
    expect(relicGuideStatus(result).ap).toBe(1)
    expect(result.objects).toHaveLength(21)
  })

  it('recovers persisted rolling state without spending AP or accepting its old result', () => {
    let table = heroAt(game(), 'blue', 'B3')
    table = act(table, { type: 'beginRoll', kind: 'explore', targetId: named(table, '遗物1 · B3').id, request: 1, generation: 0 })
    const loaded = validateTableSession(JSON.parse(JSON.stringify(table)))
    const recovered = recoverRelicGuide(loaded)
    expect(readRelicGuide(recovered)?.phase).toBe('turn')
    expect(readRelicGuide(recovered)?.pending).toBeUndefined()
    expect(relicGuideStatus(recovered).ap).toBe(2)
    expect(recovered.notes).toContain('没有扣除行动')
    expect(() => act(recovered, { type: 'resolveRoll', dieId: named(recovered, '检定骰 d6').id, value: 6, request: 1, generation: 0 })).toThrow('已过期')
    expect(readRelicGuide(table)?.phase).toBe('rolling')
    expect(recoverRelicGuide(recovered)).toBe(recovered)
    expect(readRelicGuide(createRelicGuidedSession(table))?.pending).toBeUndefined()
  })
})

describe('turn boundaries and event card conservation', () => {
  it('checks guard damage only when the hero ends both actions and switches blue to orange', () => {
    let table = heroAt(game(), 'blue', 'G3')
    expect(relicGuideStatus(table).guardDamage).toBe(1)
    expect(() => act(table, { type: 'endTurn' })).toThrow('当前阶段')
    table = act(table, { type: 'wait' })
    expect(relicGuideStatus(table).blueHp).toBe(3)
    table = act(table, { type: 'wait' })
    expect(readRelicGuide(table)?.phase).toBe('turn-end')
    expect(relicGuideStatus(table).blueHp).toBe(3)
    table = act(table, { type: 'endTurn' })
    expect(relicGuideStatus(table).blueHp).toBe(2)
    expect(readRelicGuide(table)?.hero).toBe('orange')
    expect(relicGuideStatus(table).ap).toBe(2)
    expect(table.notes).toContain('橙队回合；剩余行动 2')
  })

  it('draws the actual top card only once and preserves its identity in the discard zone', () => {
    let table = orderEvent(eventReady(), '暂时安全')
    const originalIds = cardIds(table)
    const top = named(table, '遗迹事件').cards![0]
    table = act(table, { type: 'drawEvent' })
    expect(readRelicGuide(table)?.event?.cardId).toBe(top.id)
    expect(readRelicGuide(table)?.event?.name).toBe('暂时安全')
    expect(named(table, '遗迹事件').cards).toHaveLength(5)
    expect(() => act(table, { type: 'drawEvent' })).toThrow('当前阶段')
    table = act(table, { type: 'applyEvent' })
    expect(readRelicGuide(table)?.round).toBe(2)
    expect(readRelicGuide(table)?.hero).toBe('blue')
    const discard = table.objects.find(object => object.id === top.id)!
    expect(discard.metadata.relicGuideDiscard).toBe(true)
    expect(discard.metadata.zone).toBe('relic-discard')
    expect(discard.position[0]).toBe(7.2)
    expect(cardIds(table)).toEqual(originalIds)
    expect(() => act(table, { type: 'applyEvent' })).toThrow('当前阶段')
  })

  it.each([
    ['脚步逼近', 2, 3], ['机关失控', 2, 4], ['暂时安全', 1, 0],
  ])('automatically applies %s using the original named event effect', (name, before, expected) => {
    let table = counter(orderEvent(eventReady(), name as string), '警戒', before as number)
    table = act(act(table, { type: 'drawEvent' }), { type: 'applyEvent' })
    expect(relicGuideStatus(table).alert).toBe(expected)
    expect(readRelicGuide(table)?.round).toBe(2)
  })

  it('requires a hero for the medicine chest and clamps all healing at three', () => {
    let table = counter(counter(orderEvent(eventReady(), '尘封药箱'), '蓝队生命', 1), '橙队生命', 2)
    table = act(table, { type: 'drawEvent' })
    expect(() => act(table, { type: 'applyEvent' })).toThrow('选择蓝队或橙队')
    const result = act(table, { type: 'applyEvent', hero: 'orange' })
    expect(relicGuideStatus(result).blueHp).toBe(1)
    expect(relicGuideStatus(result).orangeHp).toBe(3)
    expect(readRelicGuide(table)?.phase).toBe('event')
    let water = counter(orderEvent(eventReady(), '清澈泉水'), '蓝队生命', 2)
    water = act(water, { type: 'drawEvent' })
    expect(() => act(water, { type: 'applyEvent', hero: 'blue' })).toThrow('不需要选择')
    water = act(water, { type: 'applyEvent' })
    expect(relicGuideStatus(water).blueHp).toBe(3)
    expect(relicGuideStatus(water).orangeHp).toBe(3)
  })

  it('earthquake damages each adjacent hero once and leaves a remote hero unharmed', () => {
    let table = orderEvent(eventReady(), '遗迹震颤')
    table = heroAt(table, 'blue', 'G3')
    table = act(act(table, { type: 'drawEvent' }), { type: 'applyEvent' })
    expect(relicGuideStatus(table).blueHp).toBe(2)
    expect(relicGuideStatus(table).orangeHp).toBe(3)
  })

  it('recycles only the six game discards after round six and conserves every original card id', () => {
    let table = game()
    const ids = cardIds(table)
    for (let i = 0; i < 6; i++) {
      table = counter(table, '警戒', 0) // Keep this conservation scenario alive regardless of the shuffled event order.
      table = eventReady(table)
      table = act(table, { type: 'drawEvent' })
      table = act(table, readRelicGuide(table)?.event?.effect === 'heal-one' ? { type: 'applyEvent', hero: 'blue' } : { type: 'applyEvent' })
      expect(cardIds(table)).toEqual(ids)
    }
    expect(named(table, '遗迹事件').cards).toHaveLength(0)
    expect(table.objects.filter(object => object.metadata.relicGuideDiscard === true)).toHaveLength(6)
    table = act(eventReady(table), { type: 'drawEvent' })
    expect(named(table, '遗迹事件').cards).toHaveLength(5)
    expect(table.objects.filter(object => object.kind === 'card')).toHaveLength(1)
    expect(cardIds(table)).toEqual(ids)
  })
})

describe('immediate outcomes and leaving the guide', () => {
  it('wins immediately when the third relic returns with both heroes at the entrance, even before event draw', () => {
    let table = game()
    for (const relic of table.objects.filter(object => object.metadata.role === 'relic')) table = put(table, relic.id, { position: [relic.position[0], .15, 4.8] })
    table = counter(table, '已收集遗物', 3)
    table = act(table, { type: 'wait' })
    expect(readRelicGuide(table)?.outcome).toBe('won')
    expect(readRelicGuide(table)?.phase).toBe('complete')
    expect(relicGuideStatus(table).ap).toBe(2)
    expect(named(table, '遗迹事件').cards).toHaveLength(6)
    expect(act(table, { type: 'drawEvent' })).toEqual(table)
  })

  it('loses immediately on an exploration alert threshold or fatal end-turn guard damage', () => {
    let table = counter(heroAt(game(), 'blue', 'B3'), '警戒', 5)
    table = roll(table, 'explore', named(table, '遗物1 · B3').id, 1)
    expect(readRelicGuide(table)?.outcome).toBe('lost')
    expect(relicGuideStatus(table).alert).toBe(6)
    expect(relicGuideStatus(table).ap).toBe(1)
    let fatal = counter(heroAt(game(), 'blue', 'G3'), '蓝队生命', 1)
    fatal = act(act(fatal, { type: 'wait' }), { type: 'wait' })
    fatal = act(fatal, { type: 'endTurn' })
    expect(readRelicGuide(fatal)?.outcome).toBe('lost')
    expect(relicGuideStatus(fatal).blueHp).toBe(0)
    expect(named(fatal, '遗迹事件').cards).toHaveLength(6)
  })

  it('short-circuits terminal thresholds during a pending physical roll or unresolved event', () => {
    let rolling = heroAt(game(), 'blue', 'B3')
    rolling = act(rolling, { type: 'beginRoll', kind: 'explore', targetId: named(rolling, '遗物1 · B3').id, request: 1, generation: 0 })
    rolling = counter(rolling, '警戒', 6)
    const lost = act(rolling, { type: 'resolveRoll', dieId: named(rolling, '检定骰 d6').id, value: 6, request: 1, generation: 0 })
    expect(readRelicGuide(lost)?.outcome).toBe('lost')
    expect(relicGuideStatus(lost).ap).toBe(2)
    expect(relicGuideStatus(lost).relics).toBe(0)
    let event = act(orderEvent(eventReady(), '尘封药箱'), { type: 'drawEvent' })
    event = counter(event, '蓝队生命', 0)
    const ended = act(event, { type: 'applyEvent', hero: 'blue' })
    expect(readRelicGuide(ended)?.outcome).toBe('lost')
    expect(relicGuideStatus(ended).blueHp).toBe(0)
  })

  it('rejects an invented completed win rather than trusting inconsistent persisted metadata', () => {
    const table = stateAt(game(), { phase: 'complete', outcome: 'won' })
    expect(() => act(table, { type: 'wait' })).toThrow('实际胜负条件不一致')
  })

  it('discards and applies the eighth event before losing on the round limit', () => {
    let table = stateAt(orderEvent(eventReady(), '暂时安全'), { round: 8 })
    table = act(table, { type: 'drawEvent' })
    const eventId = readRelicGuide(table)!.event!.cardId
    expect(readRelicGuide(table)?.phase).toBe('event')
    table = act(table, { type: 'applyEvent' })
    expect(readRelicGuide(table)?.outcome).toBe('lost')
    expect(readRelicGuide(table)?.round).toBe(8)
    expect(readRelicGuide(table)?.lastMessage).toContain('第 8 轮事件已经结算')
    expect(table.objects.find(object => object.id === eventId)?.metadata.relicGuideDiscard).toBe(true)
  })

  it('lets stopping preserve the current board, scores and last notes while removing guidance', () => {
    let table = act(game(), { type: 'move', cell: 'B3' })
    const before = relicGuideStatus(table)
    const notes = table.notes
    table = act(table, { type: 'stop' })
    expect(readRelicGuide(table)).toBeNull()
    expect(named(table, '剩余行动').value).toBe(before.ap)
    expect(hero(table, 'blue').position[2]).toBe(-1.2)
    expect(hero(table, 'blue').locked).toBe(false)
    expect(table.notes).toBe(notes)
    expect(isRelicGame(table)).toBe(true)
    expect(() => act(table, { type: 'wait' })).toThrow('请先开始引导局')
  })
})
