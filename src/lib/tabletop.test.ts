import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addTableLog, createObject, createTableSession, drawCard, duplicateObject, MAX_TABLE_LOGS, TABLE_BOUNDS,
  removeObject, returnCardToDeck, shuffleDeck, updateObject, validateTableObject, validateTableSession,
  type CardData, type ObjectKind, type TableSession,
} from './tabletop'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfaUAAAAASUVORK5CYII='

function deckSession(): TableSession {
  const cards: CardData[] = ['A', 'B', 'C'].map((name) => ({ id: `card-${name}`, name, texture: '', backTexture: '', description: `说明 ${name}` }))
  const session = createTableSession('sandbox')
  session.objects = [createObject('deck', { id: 'test-deck', name: '测试牌堆', cards, value: cards.length })]
  return session
}

afterEach(() => vi.unstubAllGlobals())

describe('tabletop session and object validation', () => {
  it.each(['sandbox', 'rpg', 'cards', 'wargame'] as const)('round-trips a complete %s preset without requiring RPG character stats', (preset) => {
    const session = createTableSession(preset)
    expect(validateTableSession(JSON.parse(JSON.stringify(session)))).toEqual(session)
    expect(session.version).toBe(1)
    expect(session.physics.gravity).toBe(true)
  })

  it.each(['token', 'figurine', 'dice', 'card', 'deck', 'board', 'block'] as ObjectKind[])('creates an independently valid %s object', (kind) => {
    const object = createObject(kind)
    expect(validateTableObject(object)).toEqual(object)
    expect(object.position).toHaveLength(3)
    expect(object.scale).toEqual([1, 1, 1])
  })

  it('provides the requested original RPG geometry and actual event cards', () => {
    const session = createTableSession()
    const board = session.objects.find((object) => object.kind === 'board')!
    expect(board.name).toBe('方格战术板')
    expect(board.position).toEqual([-1, 0.05, 0])
    expect(session.objects.filter((object) => object.kind === 'figurine').map((object) => object.position)).toEqual([[-3, 0.7, 2], [-1.5, 0.7, 2], [0, 0.7, 2]])
    expect(session.objects.filter((object) => object.kind === 'block')).toHaveLength(3)
    expect(session.objects.find((object) => object.kind === 'deck')?.cards).toHaveLength(12)
    expect(session.objects.filter((object) => object.kind === 'dice').map((object) => object.sides)).toEqual([6, 20])
    expect(session.objects.filter((object) => object.kind === 'dice').every((object) => object.value === 0)).toBe(true)
  })

  it('keeps an unsettled physical die distinct from a settled face result', () => {
    const session = createTableSession('sandbox')
    const dice = createObject('dice', { sides: 20 })
    expect(dice.value).toBe(0)
    session.objects = [dice]
    const settled = updateObject(session, dice.id, { value: 17 })
    expect(validateTableSession(settled).objects[0].value).toBe(17)
    const rolling = updateObject(settled, dice.id, { value: 0 })
    expect(validateTableSession(rolling).objects[0].value).toBe(0)
    expect(settled.objects[0].value).toBe(17)
    expect(() => updateObject(session, dice.id, { value: -1 })).toThrow('对象数值')
    expect(() => updateObject(session, dice.id, { value: 21 })).toThrow('对象数值')
    expect(() => updateObject(session, dice.id, { value: 0.5 })).toThrow('对象数值')
  })

  it('copies nested vectors, metadata, and cards rather than retaining mutable import references', () => {
    const source = deckSession()
    source.objects[0].metadata = { score: 2.5, player: '蓝方', enabled: true }
    const loaded = validateTableSession(source)
    loaded.objects[0].position[0] = 5
    loaded.objects[0].metadata.player = '红方'
    loaded.objects[0].cards![0].name = '改名'
    expect(source.objects[0].position[0]).toBe(0)
    expect(source.objects[0].metadata.player).toBe('蓝方')
    expect(source.objects[0].cards![0].name).toBe('A')
  })

  it.each([
    { position: [TABLE_BOUNDS.maxX + .001, 1, 0] }, { position: [0, -0.1, 0] }, { position: [0, 31, 0] },
    { position: [0, 1, TABLE_BOUNDS.minZ - .01] }, { position: [0, 0] }, { position: [0, Number.NaN, 0] },
    { scale: [0, 1, 1] }, { scale: [1, 1, 8.01] }, { rotation: [0, Number.POSITIVE_INFINITY, 0] },
    { rotation: [101, 0, 0] }, { locked: 'false' }, { sides: 0 }, { sides: 1001 }, { value: 7 },
  ])('rejects corrupt or out-of-bound transform/property %j', (patch) => {
    expect(() => validateTableObject({ ...createObject('dice'), ...patch })).toThrow()
  })

  it('rejects duplicate identities across objects and cards inside multiple decks', () => {
    const session = deckSession()
    expect(() => validateTableSession({ ...session, objects: [session.objects[0], session.objects[0]] })).toThrow('ID 重复')
    const second = createObject('deck', { cards: session.objects[0].cards })
    expect(() => validateTableSession({ ...session, objects: [...session.objects, second] })).toThrow('ID 重复')
    const loose = createObject('card', { id: session.objects[0].cards![0].id })
    expect(() => validateTableSession({ ...session, objects: [...session.objects, loose] })).toThrow('ID 重复')
  })

  it('enforces object, deck, metadata, and session configuration limits', () => {
    const session = createTableSession('sandbox')
    expect(() => validateTableSession({ ...session, objects: Array.from({ length: 201 }, () => createObject('token')) })).toThrow('200')
    expect(() => validateTableSession({ ...session, version: 2 })).toThrow('版本')
    expect(() => validateTableSession({ ...session, grid: { enabled: true, snap: true, size: 0 } })).toThrow('网格尺寸')
    expect(() => validateTableSession({ ...session, physics: { gravity: -9.81 } })).toThrow('重力开关')
    expect(() => createObject('deck', { cards: Array.from({ length: 513 }, (_, index) => ({ id: `card-${index}`, name: '卡', texture: '', backTexture: '', description: '' })) })).toThrow('512')
    expect(() => createObject('token', { metadata: { nested: {} } as never })).toThrow('属性数值')
    expect(() => createObject('token', { metadata: JSON.parse('{"__proto__":"unsafe"}') })).toThrow('不安全')
  })

  it.each([
    'javascript:alert(1)', 'file:///etc/passwd', 'blob:https://example.com/123', '/relative.png',
    'data:text/html;base64,PHNjcmlwdD4=', 'data:image/svg+xml;base64,PHN2Zz4=',
    'data:image/png;base64,PHNjcmlwdD4=', 'data:image/png;base64,not+valid',
    'https://user:password@example.com/image.png',
  ])('rejects unsafe or invalid asset source %s', (texture) => {
    expect(() => createObject('card', { texture })).toThrow()
  })

  it('accepts actual supported image data and absolute web images', () => {
    expect(createObject('card', { texture: PNG }).texture).toBe(PNG)
    expect(createObject('board', { texture: 'https://example.com/custom-board.png' }).texture).toContain('https://')
    expect(createObject('card', { backTexture: 'http://localhost:3000/back.webp' }).backTexture).toContain('http://')
    expect(() => createObject('card', { texture: `https://example.com/${'a'.repeat(2_000_000)}` })).toThrow('2000000')
  })

  it('accepts only exact local content-addressed resource paths and retains legacy dice transforms', () => {
    const texture = `/api/resources/${'a'.repeat(64)}`
    expect(createObject('token', { texture }).texture).toBe(texture)
    for (const source of [`${texture}?raw=1`, `${texture}/extra`, `/api/resources/${'A'.repeat(64)}`, `/api/resources/${'a'.repeat(63)}`, '/api/resources/../secret']) {
      expect(() => createObject('token', { texture: source })).toThrow()
    }
    const oldDice = createObject('dice', { sides: 100, scale: [2, 1, 3], value: 84 })
    const session = createTableSession('sandbox')
    session.objects = [oldDice]
    expect(validateTableSession(session).objects[0]).toEqual(oldDice)
  })

  it('limits total image payload even when each individual asset is within its bound', () => {
    const largePng = `data:image/png;base64,${btoa('\x89PNG\r\n\x1a\n' + '\0'.repeat(1_350_000))}`
    const session = createTableSession('sandbox')
    session.objects = Array.from({ length: 6 }, () => createObject('card', { texture: largePng }))
    expect(() => validateTableSession(session)).toThrow('10 MB')
  })
})

describe('immutable tabletop manipulation', () => {
  it('updates transforms and generic metadata without mutating the original session', () => {
    const session = createTableSession('sandbox')
    const token = createObject('token')
    session.objects = [token]
    const next = updateObject(session, token.id, { position: [14, 30, -10], rotation: [0, Math.PI / 2, 0], scale: [2, 1, 2], metadata: { owner: '甲', score: 3 } })
    expect(next.objects[0].position).toEqual([14, 30, -10])
    expect(next.objects[0].metadata.score).toBe(3)
    expect(token.position).toEqual([0, 0.12, 0])
    expect(session.logs).toHaveLength(1)
    expect(next.logs).toHaveLength(2)
    expect(validateTableSession(next)).toEqual(next)
  })

  it('protects immutable identity and locks while allowing an explicit unlock and move', () => {
    const session = createTableSession()
    const board = session.objects.find((object) => object.kind === 'board')!
    expect(() => updateObject(session, board.id, { id: 'different-id' })).toThrow('ID')
    expect(() => updateObject(session, board.id, { kind: 'token' })).toThrow('类型')
    expect(() => updateObject(session, board.id, { position: [1, 0.05, 0] })).toThrow('锁定')
    const next = updateObject(session, board.id, { locked: false, position: [1, 0.05, 0] })
    expect(next.objects.find((object) => object.id === board.id)?.locked).toBe(false)
  })

  it('duplicates a deck with independent card identities and bounded placement', () => {
    const session = deckSession()
    session.objects[0].position = [14, 0.18, 10]
    const next = duplicateObject(session, session.objects[0].id)
    expect(next.objects).toHaveLength(2)
    const copy = next.objects[1]
    expect(copy.id).not.toBe(session.objects[0].id)
    expect(copy.position).toEqual([14, 0.18, 10])
    expect(copy.cards?.map((card) => card.name)).toEqual(['A', 'B', 'C'])
    expect(copy.cards?.every((card) => !session.objects[0].cards!.some((original) => original.id === card.id))).toBe(true)
    copy.cards![0].name = '独立副本'
    expect(session.objects[0].cards![0].name).toBe('A')
    expect(removeObject(next, copy.id).objects).toEqual(session.objects)
  })

  it('rejects mutations of missing objects and object-count overflow', () => {
    const session = createTableSession('sandbox')
    expect(() => removeObject(session, 'missing')).toThrow('不在桌面')
    session.objects = Array.from({ length: 200 }, () => createObject('token'))
    expect(() => duplicateObject(session, session.objects[0].id)).toThrow('200')
  })

  it('rejects duplicating an asset beyond the archive byte budget without modifying the source', () => {
    const texture = `data:image/png;base64,${btoa('\x89PNG\r\n\x1a\n' + '\0'.repeat(1_350_000))}`
    const session = createTableSession('sandbox')
    session.objects = Array.from({ length: 5 }, () => createObject('card', { texture }))
    expect(validateTableSession(session).objects).toHaveLength(5)
    expect(() => duplicateObject(session, session.objects[0].id)).toThrow('10 MB')
    expect(session.objects).toHaveLength(5)
  })

  it('caps the log list and retains the latest record', () => {
    let session = createTableSession('sandbox')
    for (let index = 0; index < MAX_TABLE_LOGS + 2; index += 1) session = addTableLog(session, `事件 ${index}`)
    expect(session.logs).toHaveLength(MAX_TABLE_LOGS)
    expect(session.logs.at(-1)?.text).toBe(`事件 ${MAX_TABLE_LOGS + 1}`)
    expect(validateTableSession(session).logs).toHaveLength(MAX_TABLE_LOGS)
  })
})

describe('real card and deck operations', () => {
  it('shuffles the actual card data without adding, losing, or mutating cards', () => {
    const session = deckSession()
    const next = shuffleDeck(session, 'test-deck', () => 0)
    expect(next.objects[0].cards?.map((card) => card.id)).toEqual(['card-B', 'card-C', 'card-A'])
    expect([...next.objects[0].cards!].sort((a, b) => a.id.localeCompare(b.id))).toEqual(session.objects[0].cards)
    expect(session.objects[0].cards?.map((card) => card.id)).toEqual(['card-A', 'card-B', 'card-C'])
  })

  it('draws the actual top card and returns its current content to the top of the deck', () => {
    const session = deckSession()
    const drawn = drawCard(session, 'test-deck')
    const card = drawn.objects.find((object) => object.kind === 'card')!
    expect(card.id).toBe('card-A')
    expect(card.name).toBe('A')
    expect(card.description).toBe('说明 A')
    expect(drawn.objects[0].cards?.map((item) => item.id)).toEqual(['card-B', 'card-C'])
    const edited = updateObject(drawn, card.id, { description: '新的卡牌说明', texture: PNG, faceDown: true })
    const returned = returnCardToDeck(edited, card.id, 'test-deck')
    expect(returned.objects).toHaveLength(1)
    expect(returned.objects[0].cards?.map((item) => item.id)).toEqual(['card-A', 'card-B', 'card-C'])
    expect(returned.objects[0].cards?.[0].description).toBe('新的卡牌说明')
    expect(returned.objects[0].cards?.[0].texture).toBe(PNG)
    expect(validateTableSession(returned)).toEqual(returned)
    expect(session.objects[0].cards).toHaveLength(3)
  })

  it('retains an empty deck safely and conserves all three cards across repeated draws', () => {
    let session = deckSession()
    for (let index = 0; index < 3; index += 1) session = drawCard(session, 'test-deck')
    expect(session.objects[0].cards).toEqual([])
    expect(session.objects[0].value).toBe(0)
    expect(session.objects.filter((object) => object.kind === 'card').map((object) => object.id).sort()).toEqual(['card-A', 'card-B', 'card-C'])
    expect(() => drawCard(session, 'test-deck')).toThrow('没有卡牌')
    expect(validateTableSession(session)).toEqual(session)
    const shuffled = shuffleDeck(session, 'test-deck', () => { throw new Error('No random sample should be needed') })
    expect(shuffled.objects[0].cards).toEqual([])
  })

  it('uses rejection sampling for unbiased secure shuffles and rejects invalid injected samples', () => {
    const samples = [0xffffffff, 0, 1]
    const getRandomValues = vi.fn((target: Uint32Array) => { target[0] = samples.shift()!; return target })
    vi.stubGlobal('crypto', { getRandomValues })
    expect(shuffleDeck(deckSession(), 'test-deck').objects[0].cards).toHaveLength(3)
    expect(getRandomValues).toHaveBeenCalledTimes(3)
    expect(() => shuffleDeck(deckSession(), 'test-deck', () => 1)).toThrow('随机函数')
  })

  it('rejects operations on mismatched object types', () => {
    const session = createTableSession('sandbox')
    session.objects = [createObject('token', { id: 'token' }), createObject('deck', { id: 'deck' })]
    expect(() => shuffleDeck(session, 'token')).toThrow('牌堆')
    expect(() => drawCard(session, 'token')).toThrow('牌堆')
    expect(() => returnCardToDeck(session, 'token', 'deck')).toThrow('卡牌')
  })
})
