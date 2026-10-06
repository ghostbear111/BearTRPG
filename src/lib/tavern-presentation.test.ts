import { describe, expect, it, vi } from 'vitest'
import { bindingKey, boundCard, characterModel, characterRows, emptyPresentation, presentObject, presentationOf, publicCharacter, validatePresentation, type TavernEffect } from './tavern-presentation'
import { createObject, createTableSession, validateTableSession } from './tabletop'
import { captureSceneDraft, createSceneDraft, startEditorGame } from './table-workspace'
import { epicAdventure } from './adventure-engine'
import { adventureFromRpg, blankRpgAdventure } from './rpg-engine'
import { exportPortableSession, importPortableSession, templateFromObject } from './object-library'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfaUAAAAASUVORK5CYII='
const URL = '/api/resources/' + 'a'.repeat(64)
const effect = (overrides: Partial<TavernEffect> = {}): TavernEffect => ({ id: 'intro', name: '登场', url: URL, width: 640, height: 240, duration: 2, loops: 1, scope: 'table', target: '', sceneId: '', trigger: 'manual', ...overrides })
function presentation() { const p = emptyPresentation(); const c = characterModel.createCard('bear-mercenary', p.archive); c.name = '联调冒险者'; p.archive.cards.push(c); p.effects.push(effect()); return p }

describe('Bear Tavern archives, bindings and presentation', () => {
  it('round trips a versioned archive while old tables remain compatible', () => {
    const table = createTableSession('sandbox'); expect(validateTableSession(table).tavern).toBeUndefined()
    table.tavern = presentation(); expect(validateTableSession(JSON.parse(JSON.stringify(table))).tavern).toEqual(table.tavern)
  })
  it('rejects missing character references, malformed archives and invalid effect metadata', () => {
    const p = presentation()
    expect(() => validatePresentation({ ...p, version: 2 })).toThrow('版本')
    expect(() => validatePresentation({ ...p, bindings: { pawn: 'missing' } })).toThrow('角色关联')
    expect(() => validatePresentation({ ...p, bindings: { constructor: p.archive.cards[0].id } })).toThrow('角色关联')
    expect(() => validatePresentation({ ...p, effects: [effect(), effect()] })).toThrow('重复')
    for (const bad of [effect({ width: 1.5 }), effect({ loops: .5 }), effect({ duration: 0 }), effect({ scope: 'piece', target: '' }), effect({ url: 'javascript:alert(1)' })]) expect(() => validatePresentation({ ...p, effects: [bad] })).toThrow()
  })
  it('uses stable role references and allows a previously spawned pawn to be rebound', () => {
    const table = createTableSession('sandbox'), p = presentation(), original = p.archive.cards[0]
    const other = characterModel.createCard('dnd5', p.archive); p.archive.cards.push(other)
    const pawn = createObject('figurine', { metadata: { characterId: 'hero', tavernCharacterId: original.id } })
    p.bindings.hero = other.id; table.tavern = p
    expect(bindingKey(pawn)).toBe('hero'); expect(boundCard(table, pawn)?.id).toBe(other.id)
    expect(boundCard(table, { ...pawn, id: 'fresh-scene-instance' })?.id).toBe(other.id)
    expect(templateFromObject(pawn).template.metadata).not.toHaveProperty('tavernCharacterId')
  })
  it('keeps authoring data separate from game snapshots and captures it into the story', () => {
    const definition = epicAdventure(); definition.tavern = presentation()
    const draft = createSceneDraft(definition), c = draft.tavern!.archive.cards[0]
    const pawn = draft.objects.find(o => o.metadata.characterId)!
    draft.tavern!.bindings[bindingKey(pawn)] = c.id; draft.tavern!.effects[0].scope = 'piece'; draft.tavern!.effects[0].target = bindingKey(pawn)
    expect(captureSceneDraft(draft)!.tavern).toEqual(draft.tavern)
    const game = startEditorGame(draft)
    const playedPawn = game.objects.find(o => o.metadata.characterId === pawn.metadata.characterId)!
    expect(boundCard(game, playedPawn)?.id).toBe(c.id)
    expect(presentationOf(game)?.effects[0].target).toBe(bindingKey(playedPawn))
    game.tavern!.archive.cards[0].name = '对局独立资料'; game.tavern!.effects[0].name = '本局演出'
    expect(draft.tavern!.archive.cards[0].name).toBe('联调冒险者'); expect(draft.tavern!.effects[0].name).toBe('登场')
  })
  it('copies the latest linked portrait into library templates without changing pawn physics', () => {
    const table = createTableSession('sandbox'); table.tavern = presentation()
    const card = table.tavern.archive.cards[0], pawn = createObject('figurine', { metadata: { tavernCharacterId: card.id, model: 'warrior' } })
    const original = structuredClone(pawn); card.portrait = URL
    const visual = presentObject(table, pawn), template = templateFromObject(visual)
    expect(template.template.texture).toBe(URL)
    expect(template.template.metadata).not.toHaveProperty('tavernCharacterId')
    expect(visual.position).toEqual(pawn.position); expect(visual.rotation).toEqual(pawn.rotation); expect(visual.scale).toEqual(pawn.scale)
    expect(pawn).toEqual(original)
  })
  it('retains archives when the coordinate RPG database regenerates scenes', () => {
    const definition = blankRpgAdventure(); definition.tavern = presentation()
    expect(adventureFromRpg(definition.rpg!, definition).tavern).toEqual(definition.tavern)
  })
  it('filters GM secrets, hidden modules and formulas dependent on private values', () => {
    const p = presentation(), c = characterModel.createCard('universal', p.archive)
    c.secret = '隐藏剧情答案'
    c.sheet = { schema: { id: 'test-sheet', name: '测试模板', version: 1, modules: [
      { id: 'public', name: '公开', fields: [
        { id: 'strength', label: '力量', type: 'number' },
        { id: 'damage', label: '伤害', type: 'formula', expression: '[strength] * 2' },
        { id: 'secret', label: '秘密属性', type: 'number', private: true },
        { id: 'derived', label: '秘密衍生', type: 'formula', expression: '[secret] + 1' },
      ] },
      { id: 'gm', name: '主持', hidden: true, fields: [{ id: 'answer', label: '剧情答案', type: 'text' }] },
    ] }, values: { strength: 12, secret: 77, answer: '隐藏房间' } } as unknown as typeof c.sheet
    p.archive.cards.push(c); const normalized = validatePresentation(p), checked = normalized.archive.cards.at(-1)!
    const player = publicCharacter(checked, normalized.archive)
    expect(player).not.toHaveProperty('secret')
    expect(characterRows(checked, normalized.archive)).toEqual([{ label: '力量', value: '12' }, { label: '伤害', value: '24' }])
    expect(JSON.stringify(player)).not.toContain('隐藏房间'); expect(JSON.stringify(player)).not.toContain('秘密衍生')
  })
  it('includes animation files in portable exports and uploads them once on import', async () => {
    const table = createTableSession('sandbox'); table.tavern = presentation()
    table.tavern.archive.cards[0].portrait = URL
    const bytes = Uint8Array.from(atob(PNG.split(',')[1]), c => c.charCodeAt(0)), blob = new Blob([bytes], { type: 'image/png' })
    const download = vi.fn<typeof fetch>().mockResolvedValue(new Response(blob, { headers: { 'Content-Type': 'image/png' } }))
    const portable = await exportPortableSession(table, { fetcher: download })
    expect(download).toHaveBeenCalledTimes(1); expect(portable.tavern!.effects[0].url).toBe(PNG); expect(portable.tavern!.archive.cards[0].portrait).toBe(PNG); expect(table.tavern.effects[0].url).toBe(URL)
    const upload = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ sha256: 'a'.repeat(64), url: URL, mime: 'image/png', byteLength: bytes.length }))
    const restored = await importPortableSession(JSON.stringify(portable), { fetcher: upload })
    expect(upload).toHaveBeenCalledTimes(1); expect(restored.tavern).toEqual(table.tavern)
  })
  it('accepts shared local portraits but rejects arbitrary URLs and scripts', () => {
    const p = presentation(); p.archive.cards[0].portrait = URL
    expect(validatePresentation(p).archive.cards[0].portrait).toBe(URL)
    for (const url of ['javascript:alert(1)', 'https://example.com/portrait.png', '/api/resources/missing']) {
      p.archive.cards[0].portrait = url; expect(() => validatePresentation(p)).toThrow()
    }
  })
})
