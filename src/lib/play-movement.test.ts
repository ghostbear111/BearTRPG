import { describe, expect, it } from 'vitest'
import { createObject, createTableSession, updateObject, validateTableSession, type TableObject, type TableSession } from './tabletop'
import { applyPlayMove, playMoveAccessError } from './play-movement'
import { movementRules, objectMoveOptions, stableDuringPlay } from './object-movement'
import { startEditorGame, createSceneDraft, captureSceneDraft } from './table-workspace'
import { instantiateLibraryEntry, templateFromObject, validateLibraryEntry } from './object-library'
import { applyCombat, combatMoveOptions } from './combat'
import { createRelicGuidedSession, applyRelicGuideAction, guideMoveOptions } from './relic-guide'
import relicSource from '../../tests/fixtures/relic.realm.json'
import bundled from '../../tests/fixtures/story.adventure.json'
import { validateAdventureDefinition } from './adventure-schema'

function game(metadata: TableObject['metadata'] = {}) {
  const actor = createObject('figurine', { name: '测试英雄', position: [0, .7, 0], rotation: [0, .4, 0], metadata })
  const table: TableSession = { ...createTableSession('sandbox'), objects: [actor], workspace: { kind: 'play' } }
  return { table, actor }
}

describe('definition driven movement and stable play pieces', () => {
  it('keeps props fixed by default while pieces use explicit planar actions', () => {
    expect(movementRules(createObject('figurine'))).toMatchObject({ mode: 'grid', range: 4, step: 1 })
    for (const kind of ['block', 'board', 'deck', 'dice'] as const) expect(movementRules(createObject(kind)).mode).toBe('fixed')
    expect(movementRules(createObject('card')).mode).toBe('free')
    expect(movementRules(createObject('block', { metadata: { moveMode: 'grid' } })).mode).toBe('grid')
    expect(movementRules(createObject('figurine', { locked: true, metadata: { moveMode: 'free' } })).mode).toBe('fixed')
  })
  it('uses fixed physical bodies for every non-die, even author-defined movable pieces', () => {
    for (const kind of ['figurine', 'card', 'token', 'deck', 'block', 'board'] as const) expect(stableDuringPlay(createObject(kind, { metadata: { moveMode: 'free' } }))).toBe(true)
    expect(stableDuringPlay(createObject('dice'))).toBe(false)
    expect(stableDuringPlay(createObject('dice', { locked: true }))).toBe(true)
  })
  it('commits a legal action without changing height, rotation, source or other pieces', () => {
    const { table, actor } = game({ moveRange: 2, moveStep: .5 })
    const copy = structuredClone(table), next = applyPlayMove(table, actor.id, [1.5, .7, 0], '玩家1')
    expect(table).toEqual(copy)
    expect(next.objects[0].position).toEqual([1.5, .7, 0]); expect(next.objects[0].rotation).toEqual(actor.rotation)
    expect(next.logs.at(-1)?.text).toContain('玩家1移动测试英雄')
    expect(validateTableSession(JSON.parse(JSON.stringify(next)))).toEqual(next)
  })
  it.each([
    [[3, .7, 0], '最多2'], [[1.25, .7, 0], '格距'], [[1, 2, 0], '高度'], [[NaN, .7, 0], '无效'], [[0, .7, 0], '新的目的地'],
  ] as const)('rejects illegal destination %j atomically', (destination, reason) => {
    const { table, actor } = game({ moveRange: 2, moveStep: .5 }); const copy = structuredClone(table)
    expect(() => applyPlayMove(table, actor.id, [...destination], '玩家1')).toThrow(reason)
    expect(table).toEqual(copy)
  })
  it('enforces the configured player in both access checks and committed commands', () => {
    const { table, actor } = game({ moveSeat: '玩家2' })
    expect(playMoveAccessError(table, actor.id, '玩家1')).toContain('玩家2')
    expect(() => applyPlayMove(table, actor.id, [1, .7, 0], '玩家1')).toThrow('玩家2')
    expect(applyPlayMove(table, actor.id, [1, .7, 0], '玩家2').objects[0].position[0]).toBe(1)
  })
  it('rejects fixed, knocked-out, held and missing objects', () => {
    for (const metadata of [{ moveMode: 'fixed' }, { hp: 0 }, { zone: 'hand' }, { zone: 'inventory' }] as TableObject['metadata'][]) {
      const { table, actor } = game(metadata)
      expect(() => applyPlayMove(table, actor.id, [1, .7, 0], '玩家1')).toThrow()
    }
    const { table } = game(); expect(() => applyPlayMove(table, 'old-scene-id', [1, .7, 0], '玩家1')).toThrow('当前场景')
  })
  it('rejects bounds using the rotated and scaled footprint, not just the piece centre', () => {
    const { table, actor } = game({ moveMode: 'free', moveRange: 12 })
    actor.position = [10, .7, 0]; actor.scale = [2, 1, 1]; actor.rotation = [0, Math.PI / 2, 0]
    expect(() => applyPlayMove(table, actor.id, [13.6, .7, 0], '玩家1')).toThrow('安全范围')
    expect(() => applyPlayMove(table, actor.id, [10, .7, 9.5], '玩家1')).toThrow('安全范围')
    expect(applyPlayMove(table, actor.id, [13, .7, 0], '玩家1').objects[0].position[0]).toBe(13)
  })
  it('rejects occupied destinations and routes through another figure', () => {
    const { table, actor } = game()
    table.objects.push(createObject('figurine', { position: [2, .7, 0] }))
    expect(() => applyPlayMove(table, actor.id, [2, .7, 0], '玩家1')).toThrow('占据')
    expect(() => applyPlayMove(table, actor.id, [3, .7, 0], '玩家1')).toThrow('阻挡')
    expect(() => applyPlayMove(table, actor.id, [0, .7, 2], '玩家1')).not.toThrow()
  })
  it('blocks closed doors and respects open state and authored route checks', () => {
    let { table, actor } = game()
    const door = createObject('block', { position: [1.5, 1, 0], rotation: [0, Math.PI / 2, 0], metadata: { model: 'door', width: 2, depth: .3 } }); table.objects.push(door)
    expect(() => applyPlayMove(table, actor.id, [3, .7, 0], '玩家1')).toThrow('阻挡')
    table = updateObject(table, door.id, { metadata: { ...door.metadata, opened: true } })
    expect(() => applyPlayMove(table, actor.id, [3, .7, 0], '玩家1')).not.toThrow()
    table = updateObject(table, door.id, { metadata: { ...door.metadata, opened: false } })
    table = updateObject(table, actor.id, { metadata: { moveMode: 'free', movePathCheck: false } })
    expect(() => applyPlayMove(table, actor.id, [3, .7, 0], '玩家1')).not.toThrow()
    expect(() => applyPlayMove(table, actor.id, [1.5, .7, 0], '玩家1')).toThrow('阻挡')
  })
  it('allows a piece to leave a pre-existing editor overlap safely', () => {
    const { table, actor } = game(); table.objects.push(createObject('figurine', { position: [.3, .7, 0] }))
    expect(() => applyPlayMove(table, actor.id, [-2, .7, 0], '玩家1')).not.toThrow()
    expect(() => applyPlayMove(table, actor.id, [1, .7, 0], '玩家1')).toThrow('占据')
  })
  it('offers only legal grid cells for the selected player with the configured spacing', () => {
    const { table, actor } = game({ moveRange: 1.5, moveStep: .5, moveSeat: '玩家2' })
    table.objects.push(createObject('figurine', { position: [1, .7, 0] }))
    expect(objectMoveOptions(table, actor, '玩家1')).toEqual([])
    const options = objectMoveOptions(table, actor, '玩家2'); expect(options.length).toBeGreaterThan(0)
    for (const option of options) {
      expect(option.size).toBe(.44)
      expect(() => applyPlayMove(table, actor.id, [option.position[0], .7, option.position[2]], '玩家2')).not.toThrow()
    }
  })
  it('preserves author movement configuration through library instances and draft/game separation', () => {
    const { actor } = game({ moveMode: 'grid', moveRange: 2, moveStep: .5, moveSeat: '玩家2', movePathCheck: false })
    const entry = validateLibraryEntry({ ...templateFromObject(actor), id: 'movement-template', revision: 1, createdAt: 1, updatedAt: 1 })
    const placed = instantiateLibraryEntry(entry, { position: [0, .7, 0] }); expect(movementRules(placed)).toEqual(movementRules(actor))
    const draft = { ...createTableSession('sandbox'), objects: [placed], workspace: { kind: 'draft' as const } }
    expect(() => applyPlayMove(draft, placed.id, [1, .7, 0], '玩家2')).toThrow('编辑模式')
    const run = startEditorGame(draft), moved = applyPlayMove(run, placed.id, [1, .7, 0], '玩家2')
    expect(moved.objects[0].position[0]).toBe(1); expect(draft.objects[0].position[0]).toBe(0)
  })
  it('preserves scene movement definitions into story play and pauses them during checks', () => {
    const draft = createSceneDraft(validateAdventureDefinition(bundled.definition)), figure = draft.objects.find(o => o.kind === 'figurine')!
    const edited = updateObject(draft, figure.id, { metadata: { ...figure.metadata, moveRange: 1, moveSeat: '玩家2' } })
    expect(captureSceneDraft(edited)!.scenes[0].objects.find(o => o.id === figure.id)!.metadata.moveRange).toBe(1)
    const run = startEditorGame(edited), actor = run.objects.find(o => o.metadata.characterId === figure.metadata.characterId)!
    expect(movementRules(actor)).toMatchObject({ range: 1, seat: '玩家2' })
    run.adventure!.progress.phase = 'rolling'; expect(playMoveAccessError(run, actor.id, '玩家2')).toContain('检定')
    run.adventure!.progress.phase = 'result'; expect(playMoveAccessError(run, actor.id, '玩家2')).not.toBe('')
  })
  it('applies the same range, ownership and spacing in combat without spending AP on rejection', () => {
    const { table, actor } = game({ team: '队伍', moveRange: 1, moveStep: .5, moveSeat: '玩家2' })
    const enemy = createObject('figurine', { position: [5, .7, 0], metadata: { team: '敌方' } }); table.objects.push(enemy)
    const battle = applyCombat(table, { type: 'start', ids: [actor.id, enemy.id] })
    expect(() => applyPlayMove(battle, actor.id, [.5, .7, 0], '玩家2')).toThrow('回合')
    expect(() => applyCombat(battle, { type: 'move', position: [.5, .7, 0] }, '玩家1')).toThrow('玩家2')
    expect(() => applyCombat(battle, { type: 'move', position: [2, .7, 0] }, '玩家2')).toThrow('最多1')
    expect(battle.combat!.ap).toBe(2); expect(combatMoveOptions(battle, '玩家1')).toEqual([])
    const moved = applyCombat(battle, { type: 'move', position: [.5, .7, 0] }, '玩家2'); expect(moved.combat!.ap).toBe(1)
    expect(moved.objects[0].rotation).toEqual(actor.rotation)
    const fixed = updateObject(battle, actor.id, { metadata: { ...actor.metadata, moveMode: 'fixed' } })
    expect(combatMoveOptions(fixed, '玩家2')).toEqual([])
  })
  it('keeps intrinsic relic movement and action costs while honoring explicit fixed/range/owner rules', () => {
    let run = createRelicGuidedSession(validateTableSession(relicSource)), actor = run.objects.find(o => o.metadata.role === 'hero' && o.metadata.team === 'blue')!
    expect(guideMoveOptions(run).length).toBeGreaterThan(0)
    run = updateObject(run, actor.id, { metadata: { ...actor.metadata, moveRange: 1.2, moveSeat: '玩家2' } })
    expect(guideMoveOptions(run).every(o => o.label.includes('1 格'))).toBe(true)
    const cell = guideMoveOptions(run)[0].cell
    expect(() => applyRelicGuideAction(run, { type: 'move', cell }, '玩家1')).toThrow('玩家2')
    expect(() => applyRelicGuideAction(run, { type: 'move', cell }, '玩家2')).not.toThrow()
    run = updateObject(run, actor.id, { metadata: { ...actor.metadata, moveMode: 'fixed' } }); expect(guideMoveOptions(run)).toEqual([])
  })
  it.each<TableObject['metadata']>([{ moveMode: 'physics' }, { moveRange: 0 }, { moveRange: 13 }, { moveRange: '3' }, { moveStep: .1 }, { moveSeat: '陌生玩家' }, { movePathCheck: 'false' }])('rejects invalid authored rules in saved/imported objects: %j', metadata => {
    expect(() => createObject('figurine', { metadata })).toThrow()
  })
})
