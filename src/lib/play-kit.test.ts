import { describe, expect, it } from 'vitest'
import { PLAY_KIT, createWorkshopTable, kitLibraryDrafts, kitObject } from './play-kit'
import { arrangeObjects, changeHealth, dealCards, health, interact } from './object-play'
import { applyCombat, recoverCombat, combatMoveOptions } from './combat'
import { createObject, validateTableSession } from './tabletop'
import { validateLibraryDraft, templateFromObject } from './object-library'
import { applyAdventureAction, startAdventure } from './adventure-engine'
import bundled from '../../tests/fixtures/story.adventure.json'
import { playableAdventure } from './game-catalog'

describe('reusable adventure components and atomic object play', () => {
  it('validates all 48 editable templates and the independent workshop', () => {
    expect(PLAY_KIT).toHaveLength(48)
    for (const draft of kitLibraryDrafts()) expect(() => validateLibraryDraft(draft)).not.toThrow()
    const table = createWorkshopTable(); expect(validateTableSession(JSON.parse(JSON.stringify(table)))).toEqual(table)
    expect(table.objects.filter(o => o.kind === 'figurine')).toHaveLength(7)
  })
  it('lets immovable containers open but grants each loot only once', () => {
    let t = createWorkshopTable(); const chest = t.objects.find(o => o.metadata.model === 'chest')!
    const source = structuredClone(t)
    expect(() => interact(t, chest.id, 'loot')).toThrow('先打开')
    t = interact(t, chest.id, 'open'); expect(chest.locked).toBe(true)
    t = interact(t, chest.id, 'loot'); expect(t.objects.length).toBe(source.objects.length + 1)
    expect(() => interact(t, chest.id, 'loot')).toThrow('尚未取物')
    expect(source.objects.find(o => o.id === chest.id)!.metadata.emptied).toBeUndefined()
  })
  it('toggles linked doors while other props retain their state', () => {
    let t = createWorkshopTable(); const lever = t.objects.find(o => o.metadata.model === 'lever')!, door = t.objects.find(o => o.metadata.model === 'door')!
    t = interact(t, lever.id, 'switch'); expect(t.objects.find(o => o.id === door.id)!.metadata.opened).toBe(true)
    t = interact(t, lever.id, 'switch'); expect(t.objects.find(o => o.id === door.id)!.metadata.opened).toBe(false)
    expect(() => interact(t, lever.id, 'light')).toThrow('未配置')
  })
  it('enforces bag ownership and consumes healing items only for valid wounded targets', () => {
    let t = createWorkshopTable(); const item = t.objects.find(o => o.name === '恢复药剂')!, actor = t.objects.find(o => o.kind === 'figurine')!
    t = interact(t, item.id, 'collect'); expect(t.objects.find(o => o.id === item.id)!.metadata.zone).toBe('inventory')
    expect(() => interact(t, item.id, 'use', '玩家2', actor.id)).toThrow('当前玩家')
    expect(() => interact(t, item.id, 'use', '玩家1', actor.id)).toThrow('药剂未消耗')
    t = changeHealth(t, actor.id, -3); t = interact(t, item.id, 'use', '玩家1', actor.id)
    expect(health(actor, t).hp).toBe(5); expect(t.objects.some(o => o.id === item.id)).toBe(false)
  })
  it('equips and transfers actual item identities across seats', () => {
    let t = createWorkshopTable(); const item = t.objects.find(o => o.metadata.equippable)!
    t = interact(t, item.id, 'collect'); t = interact(t, item.id, 'equip'); t = interact(t, item.id, 'transfer', '玩家1', '玩家2')
    expect(t.objects.find(o => o.id === item.id)!.metadata).toMatchObject({ owner: '玩家2', equipped: false })
    expect(() => interact(t, item.id, 'drop', '玩家1')).toThrow('当前玩家')
    t = interact(t, item.id, 'drop', '玩家2'); expect(t.objects.find(o => o.id === item.id)!.metadata.zone).toBe('table')
  })
  it('rejects overflowing loot and invalid multi actions without changing source', () => {
    let t = createWorkshopTable(); const chest = t.objects.find(o => o.metadata.model === 'chest')!
    t = interact(t, chest.id, 'open'); while (t.objects.length < 200) t.objects.push(createObject('token'))
    const source = structuredClone(t); expect(() => interact(t, chest.id, 'loot')).toThrow('最多 200')
    expect(t).toEqual(source); expect(() => arrangeObjects(t, [chest.id], 'copy')).toThrow('锁定')
    const actors = t.objects.filter(o => o.kind === 'figurine'); expect(() => arrangeObjects(t, actors.map(o => o.id), 'row')).not.toThrow()
  })
  it('deals the existing card IDs atomically and rejects insufficient decks', () => {
    let t = createWorkshopTable(); const deck = t.objects.find(o => o.kind === 'deck')!, ids = deck.cards!.map(c => c.id)
    expect(() => dealCards(t, deck.id, 2, ['玩家1','玩家2','玩家3','玩家4'])).toThrow('不足')
    t = dealCards(t, deck.id, 1, ['玩家1','玩家2','玩家3','玩家4'])
    const held = t.objects.filter(o => o.metadata.zone === 'hand'); expect(held).toHaveLength(4)
    expect(held.every(o => ids.includes(o.id))).toBe(true); expect(t.objects.find(o => o.id === deck.id)!.cards).toHaveLength(2)
  })
  it('strips instance state when saving fresh reusable templates', () => {
    let t = createWorkshopTable(); const chest = t.objects.find(o => o.metadata.model === 'chest')!
    t = interact(t, chest.id, 'open'); t = interact(t, chest.id, 'loot')
    const draft = templateFromObject(t.objects.find(o => o.id === chest.id)!); expect(draft.template.metadata).toMatchObject({ model: 'chest', behavior: 'open', lootHeal: 2 })
    expect(draft.template.metadata.opened).toBeUndefined(); expect(draft.template.metadata.emptied).toBeUndefined()
  })
  it('remembers scene props and carries inventory through story transitions and save round trips', () => {
    const def = playableAdventure(bundled.definition)
    def.scenes.find(s => s.id === 'ruins')!.choices.push({ id: 'return-harbor', label: '返回港口', description: '', nextSceneId: 'harbor', failureSceneId: 'harbor', check: null, conditions: [], success: [], failure: [] })
    let t = startAdventure(def)
    const chest = t.objects.find(o => o.metadata.model === 'chest')!
    t = interact(t, chest.id, 'open'); t = interact(t, chest.id, 'loot')
    const item = t.objects.find(o => o.metadata.sourceContainerId === chest.id)!; t = interact(t, item.id, 'collect')
    const char = t.objects.find(o => o.metadata.characterId === def.characters.find(c => c.role === 'player')!.id)!
    t = changeHealth(t, char.id, -3); t = interact(t, item.id, 'use', '玩家1', char.id); expect(t.adventure!.progress.hp[String(char.metadata.characterId)]).toBe(5)
    const held = kitObject('key'); held.metadata.zone = 'inventory'; held.metadata.owner = '玩家1'; t.objects.push(held)
    const choice = t.adventure!.definition.scenes[0].choices.find(c => !c.check)!; t = applyAdventureAction(t, { type: 'choose', choiceId: choice.id })
    expect(t.objects.some(o => o.id === held.id)).toBe(true)
    expect(t.adventure!.progress.sceneStates!.harbor[String(chest.metadata.adventureObjectId)]).toMatchObject({ emptied: true, opened: true })
    expect(validateTableSession(JSON.parse(JSON.stringify(t)))).toEqual(t)
    t = applyAdventureAction(t, { type: 'choose', choiceId: 'return-harbor' })
    const revisited = t.objects.find(o => o.metadata.model === 'chest')!
    expect(revisited.metadata).toMatchObject({ opened: true, emptied: true })
    expect(() => interact(t, revisited.id, 'loot')).toThrow('尚未取物')
  })
})

function encounter() {
  const t = createWorkshopTable(); const one = t.objects.find(o => o.metadata.model === 'ranger')!, two = t.objects.find(o => o.metadata.model === 'orc')!
  one.position = [-2, .7, 2]; two.position = [0, .7, 2]
  return { t: applyCombat(t, { type: 'start', ids: [one.id, two.id] }), one, two }
}
describe('tactical encounter with real physics observations', () => {
  it('rejects blocked routes and lets opened doors change legal movement cells', () => {
    let { t, one } = encounter(); const door = t.objects.find(o => o.metadata.model === 'door')!
    const cells = combatMoveOptions(t)
    expect(cells.every(o => Math.hypot(o.position[0] - one.position[0], o.position[2] - one.position[2]) <= 4.01)).toBe(true)
    expect(() => applyCombat(t, { type: 'move', position: [-2, .7, -1] })).toThrow('阻挡')
    t = interact(t, door.id, 'open'); t = applyCombat(t, { type: 'move', position: [-2, .7, -1] }); expect(t.combat!.ap).toBe(1)
  })
  it('spends action points only after matched physical results and ignores duplicate or stale observations', () => {
    let { t, one, two } = encounter()
    t = applyCombat(t, { type: 'attack', target: two.id, request: 9, generation: 2 }); expect(t.combat!.ap).toBe(2)
    const dieId = t.combat!.pending!.dieId
    expect(applyCombat(t, { type: 'resolve', dieId, value: 20, request: 8, generation: 2 })).toEqual(t)
    t = applyCombat(t, { type: 'resolve', dieId, value: 20, request: 9, generation: 2 })
    expect(health(two, t).hp).toBe(4); expect(t.combat!.ap).toBe(1)
    expect(applyCombat(t, { type: 'resolve', dieId, value: 20, request: 9, generation: 2 })).toEqual(t)
    expect(health(one, t).hp).toBe(6)
  })
  it('does not damage on a failed attack and validates bounds, allied targets and turn resources', () => {
    let { t, one, two } = encounter()
    expect(() => applyCombat(t, { type: 'move', position: [13, .7, 8] })).toThrow('最多4')
    expect(() => applyCombat(t, { type: 'attack', target: one.id, request: 1, generation: 0 })).toThrow('敌方')
    t = applyCombat(t, { type: 'attack', target: two.id, request: 1, generation: 0 })
    expect(() => applyCombat(t, { type: 'next' })).toThrow('等待')
    t = applyCombat(t, { type: 'resolve', dieId: t.combat!.pending!.dieId, value: 1, request: 1, generation: 0 }); expect(health(two, t).hp).toBe(6)
    t = applyCombat(t, { type: 'defend' }); expect(t.combat!.ap).toBe(0)
    expect(() => applyCombat(t, { type: 'defend' })).toThrow('不足')
  })
  it('recovers interrupted pending rolls without changing hp or action points', () => {
    let { t, two } = encounter(); t = applyCombat(t, { type: 'attack', target: two.id, request: 1, generation: 0 })
    const restored = recoverCombat(validateTableSession(JSON.parse(JSON.stringify(t))))
    expect(restored.combat).toMatchObject({ phase: 'turn', ap: 2 }); expect(restored.combat!.pending).toBeUndefined(); expect(health(two, restored).hp).toBe(6)
  })
  it('applies defend, poison and focus healing within turn rules', () => {
    let { t, one, two } = encounter()
    t = changeHealth(t, one.id, -3); t = applyCombat(t, { type: 'recover' }); expect(health(one, t).hp).toBe(5); expect(t.objects.find(o => o.id === one.id)!.metadata.focus).toBe(2)
    t = applyCombat(t, { type: 'defend' }); t = applyCombat(t, { type: 'next' })
    t.objects.find(o => o.id === two.id)!.position = [-.5, .7, 2]
    t = applyCombat(t, { type: 'attack', target: one.id, request: 2, generation: 0 }); t = applyCombat(t, { type: 'resolve', dieId: t.combat!.pending!.dieId, value: 20, request: 2, generation: 0 }); expect(health(one, t).hp).toBe(4)
    t.objects.find(o => o.id === one.id)!.metadata.poisoned = true
    t = applyCombat(t, { type: 'next' }); expect(health(one, t).hp).toBe(3); expect(t.objects.find(o => o.id === one.id)!.metadata.guarded).toBe(false)
  })
  it('declares a winning team on the final knockout and preserves that result on reload', () => {
    let { t, two } = encounter(); t = changeHealth(t, two.id, -4)
    t = applyCombat(t, { type: 'attack', target: two.id, request: 1, generation: 0 }); t = applyCombat(t, { type: 'resolve', dieId: t.combat!.pending!.dieId, value: 10, request: 1, generation: 0 })
    expect(t.combat).toMatchObject({ phase: 'complete', winner: '队伍' }); expect(health(two, t).hp).toBe(0)
    expect(recoverCombat(validateTableSession(JSON.parse(JSON.stringify(t))))).toEqual(t)
  })
  it('rejects corrupted participant or pending references and prevents editing the active roster', () => {
    const { t, one } = encounter(); const bad = structuredClone(t); bad.combat!.order[0] = 'missing'; expect(() => validateTableSession(bad)).toThrow('引用无效')
    const fake = structuredClone(t); fake.combat!.phase = 'complete'; fake.combat!.winner = '队伍'; expect(() => validateTableSession(fake)).toThrow('胜负与角色生命')
    expect(() => arrangeObjects(t, [one.id], 'delete')).toThrow('收起战斗')
  })
})
