import { describe, expect, it } from 'vitest'
import bundled from '../../tests/fixtures/rpg.adventure.json'
import { adventureFromRpg, applyRpgAction, startRpgAdventure, tabletopTrainingAdventure } from './rpg-engine'
import { startRpgBattle } from './rpg-battle'
import { configuredRpgCard, defaultRpgCard, withRpgCharacterCard, withRpgPartyCards, refreshRpgCardValues, applyRpgCharacterPreset, rpgCardForRole, rpgAuthorCardPreview } from './rpg-character-cards'
import { boundCard, characterModel, characterRows, emptyPresentation, publicCharacter, validatePresentation, presentObject } from './tavern-presentation'
import { createObject, validateTableSession } from './tabletop'
import { validateAdventureDefinition } from './adventure-schema'
import { validateRpgDatabase } from './rpg-schema'
import { exportPortableAdventure, importPortableAdventure } from './object-library'

const configured = () => withRpgPartyCards(tabletopTrainingAdventure())
describe('RPG character cards and quick author configuration', () => {
  it('bundles every RPG party role with a bound universal card', () => {
    const d = validateAdventureDefinition(bundled.definition)
    expect(d.tavern!.archive.cards).toHaveLength(Object.keys(d.rpg!.roles).length)
    for (const id of Object.keys(d.rpg!.roles)) expect(configuredRpgCard(d, id)?.sheet?.schema.id).toBe('bear-rpg-sheet')
  })
  it('retains existing custom/private cards and effects when generating a party', () => {
    const d = tabletopTrainingAdventure(); d.tavern = emptyPresentation()
    const card = characterModel.createCard('universal', d.tavern.archive); card.name = '自定义档案'; card.secret = '主持秘密'
    d.tavern.archive.cards.push(card); d.tavern.bindings.rpg_hero = card.id
    const snapshot = structuredClone(d), next = withRpgPartyCards(d)
    expect(configuredRpgCard(next, 'hero')).toEqual(card); expect(next.tavern!.archive.cards).toHaveLength(2); expect(d).toEqual(snapshot)
    expect(withRpgPartyCards(next)).toEqual(next)
  })
  it('applies archetype rules while preserving identity, gear and custom card values', () => {
    const d = configured(), card = configuredRpgCard(d, 'hero')!
    card.portrait = '/api/resources/' + 'a'.repeat(64); card.sheet!.values.custom_faction = '自由星区'
    d.rpg!.roles.hero.weapon = 'training_sword'
    const next = applyRpgCharacterPreset(d, 'hero', 'blade')
    expect(next.rpg!.roles.hero.hp).toBe(140); expect(next.rpg!.roles.hero.blade).toBe(25)
    expect(next.rpg!.roles.hero.fist).toBe(0); expect(next.rpg!.roles.hero.weapon).toBe('training_sword')
    expect(configuredRpgCard(next, 'hero')?.portrait).toBe(card.portrait)
    expect(configuredRpgCard(next, 'hero')?.sheet?.values.custom_faction).toBe('自由星区')
    expect(() => adventureFromRpg(next.rpg!, next)).not.toThrow()
  })
  it('runs authored rules and the same custom pawn in exploration and battle', () => {
    const d = configured(), t = d.rpg!.roles.hero
    Object.assign(t, { hp: 240, ep: 95, attack: 33, color: '#b969cf', tabletopAppearance: createObject('figurine', { texture: '/api/resources/' + 'b'.repeat(64), metadata: { model: 'cleric', tavernPortrait: false } }) })
    const table = startRpgAdventure(adventureFromRpg(d.rpg!, d)), pawn = table.objects.find(o => o.metadata.rpgRoleId === 'hero')!
    expect(table.adventure!.progress.rpg!.characters!.hero.hp).toBe(240); expect(pawn.color).toBe('#b969cf'); expect(pawn.metadata.model).toBe('cleric')
    const battle = startRpgBattle(table, { op: 'battle', enemies: ['guard'] }), actor = battle.objects.find(o => o.metadata.rpgRoleId === 'hero')!
    expect(battle.combat!.rpg!.units[actor.id].stats.attack).toBe(33)
    expect(actor.texture).toBe(pawn.texture); expect(actor.metadata.tavernPortrait).toBe(false); expect(actor.color).toBe(pawn.color)
    expect(boundCard(battle, actor)?.id).toBe(boundCard(table, pawn)?.id)
  })
  it('projects current battle resources instead of stale author or progress values', () => {
    const d = configured(), battle = startRpgBattle(startRpgAdventure(d), { op: 'battle', enemies: ['guard'] }), before = structuredClone(battle.adventure!.definition.tavern)
    const actor = battle.objects.find(o => o.metadata.rpgRoleId === 'hero')!, c = battle.combat!.rpg!.units[actor.id].stats
    c.hp = 47; c.ep = 23; c.pp = 18; c.hurt = 3
    const values = boundCard(battle, actor)!.sheet!.values
    expect(values.rpg_hp).toEqual({ value: 47, max: 120 }); expect(values.rpg_ep).toEqual({ value: 23, max: 60 }); expect(values.rpg_pp).toEqual({ value: 18, max: 100 }); expect(values.rpg_conditions).toBe('受伤 3')
    expect(battle.adventure!.definition.tavern).toEqual(before)
  })
  it('displays equipment bonuses and equipped item names from the actual save', () => {
    let table = startRpgAdventure(configured())
    table = applyRpgAction(table, { type: 'character', role: 'hero', action: 'equip', item: 'training_sword' })
    const card = rpgCardForRole(table, 'hero').card
    expect(card.sheet!.values.rpg_weapon).toBe(table.adventure!.definition.rpg!.items.training_sword.name)
    expect(card.sheet!.values.rpg_attack).toBeGreaterThan(14)
    expect(validateTableSession(JSON.parse(JSON.stringify(table))).adventure!.definition.tavern).toEqual(table.adventure!.definition.tavern)
  })
  it('supports an old save without adding cards or resetting gameplay', () => {
    const table = startRpgAdventure(tabletopTrainingAdventure()), before = structuredClone(table)
    table.adventure!.progress.rpg!.characters!.hero.hp = 71
    const card = rpgCardForRole(table, 'hero').card
    expect(card.sheet!.values.rpg_hp).toEqual({ value: 71, max: 120 }); expect(table.adventure!.definition.tavern).toBeUndefined()
    expect(table.objects).toEqual(before.objects); expect(table.adventure!.progress.rpg!.money).toBe(before.adventure!.progress.rpg!.money)
  })
  it('renders author previews for old modules without a character archive', () => {
    const d = tabletopTrainingAdventure(), before = structuredClone(d)
    expect(d.tavern).toBeUndefined()
    for (const [id, group, hp] of [['hero', 'roles', 120], ['guard', 'enemies', 65]] as const) {
      const preview = rpgAuthorCardPreview(d, id, group)!
      expect(preview.card.worldEnabled).toBe(true)
      expect(characterRows(preview.card, preview.archive)).toContainEqual({ label: '生命', value: `${hp} / ${hp}` })
      expect(() => characterModel.normalizeState(preview.archive)).not.toThrow()
    }
    expect(d).toEqual(before)
  })
  it('previews unbound roles using the existing world without adding permanent cards', () => {
    const d = tabletopTrainingAdventure(); d.tavern = emptyPresentation()
    d.tavern.archive.world = { name: '自定义冒险', summary: '银河边境', fields: [{ id: 'crew', label: '所属舰队' }] }
    const before = structuredClone(d), preview = rpgAuthorCardPreview(d, 'hero')!
    expect(preview.archive.world).toEqual(d.tavern.archive.world)
    expect(characterRows(preview.card, preview.archive)).toContainEqual({ label: '生命', value: '120 / 120' })
    expect(d).toEqual(before)
  })
  it('preserves custom world, schemas and private fields while previewing fresh author stats', () => {
    const d = configured(), card = configuredRpgCard(d, 'hero')!, module = card.sheet!.schema.modules[1]
    d.tavern!.archive.world = { name: '舰队世界', summary: '远征', fields: [{ id: 'crew', label: '舰队' }] }
    card.world = { crew: '银翼', retired_world_field: '保留旧资料' }; card.secret = '主持秘密'
    module.fields.push({ id: 'custom_oath', label: '誓言', type: 'text', private: true }, { id: 'custom_damage', label: '伤害加成', type: 'formula', expression: '[rpg_attack] * 2' })
    card.sheet!.values.custom_oath = '机密任务'; card.sheet!.values.custom_faction = '自由星区'
    d.tavern!.archive.sheetTemplates.push({ ...structuredClone(card.sheet!.schema), id: 'crew-sheet' })
    d.rpg!.roles.hero.hp = 180; d.rpg!.roles.hero.attack = 22
    const before = structuredClone(d), preview = rpgAuthorCardPreview(d, 'hero')!, publicCard = publicCharacter(preview.card, preview.archive)
    expect(publicCard.world).toEqual({ crew: '银翼' }); expect(publicCard).not.toHaveProperty('secret')
    expect(publicCard.sheet!.values).not.toHaveProperty('custom_oath')
    expect(characterRows(preview.card, preview.archive)).toContainEqual({ label: '生命', value: '180 / 180' })
    expect(characterRows(preview.card, preview.archive)).toContainEqual({ label: '伤害加成', value: '44' })
    expect(preview.card.sheet!.values.custom_faction).toBe('自由星区')
    expect(preview.archive.sheetTemplates).toEqual(d.tavern!.archive.sheetTemplates)
    expect(preview.card.world).toEqual(card.world); expect(d).toEqual(before)
  })
  it('returns no author preview when a selected character was removed or the group is empty', () => {
    const d = tabletopTrainingAdventure(); d.rpg!.enemies = {}
    expect(rpgAuthorCardPreview(d, 'guard', 'enemies')).toBeUndefined()
    expect(rpgAuthorCardPreview(d, 'missing')).toBeUndefined()
    expect(rpgAuthorCardPreview({ ...d, rpg: undefined }, 'hero')).toBeUndefined()
  })
  it('keeps duplicate enemy instances separate while sharing appearance and card schema', () => {
    const d = withRpgCharacterCard(configured(), 'guard', 'enemies')
    d.rpg!.enemies.guard.color = '#875eae'
    const table = startRpgBattle(startRpgAdventure(d), { op: 'battle', enemies: ['guard', 'guard'] })
    const enemies = table.objects.filter(o => o.metadata.rpgEnemyId === 'guard')
    enemies[0].metadata.characterId = 'rpg_hero'
    table.combat!.rpg!.units[enemies[0].id].stats.hp = 12; table.combat!.rpg!.units[enemies[1].id].stats.hp = 33
    expect(enemies[0].color).toBe('#875eae'); expect(boundCard(table, enemies[0])?.id).toBe(boundCard(table, enemies[1])?.id)
    expect(boundCard(table, enemies[0])!.sheet!.values.rpg_hp).toEqual({ value: 12, max: 65 })
    expect(boundCard(table, enemies[1])!.sheet!.values.rpg_hp).toEqual({ value: 33, max: 65 })
  })
  it('hides private custom values and preserves public text, numbers, switches and resources', () => {
    const d = configured(), card = configuredRpgCard(d, 'hero')!, m = card.sheet!.schema.modules.find(m => m.id === 'rpg_custom')!
    m.fields.push({ id: 'custom_oath', label: '誓言', type: 'text', private: true }, { id: 'custom_charge', label: '充能', type: 'resource' }, { id: 'custom_bond', label: '羁绊', type: 'number' }, { id: 'custom_license', label: '执照', type: 'boolean' })
    Object.assign(card.sheet!.values, { custom_faction: '自由星区', custom_oath: '隐秘任务', custom_charge: { value: 3, max: 5 }, custom_bond: 8, custom_license: true })
    const normalized = validatePresentation(d.tavern!), table = startRpgAdventure({ ...d, tavern: normalized }), live = rpgCardForRole(table, 'hero')
    expect(publicCharacter(live.card, live.archive).sheet!.values).not.toHaveProperty('custom_oath')
    const rows = characterRows(live.card, live.archive)
    expect(rows).toContainEqual({ label: '充能', value: '3 / 5' }); expect(rows).toContainEqual({ label: '羁绊', value: '8' }); expect(rows).toContainEqual({ label: '执照', value: '是' })
    expect(normalized.archive.cards[0].sheet!.values.custom_oath).toBe('隐秘任务')
  })
  it('honors card labels and hidden rule fields without changing combat statistics', () => {
    const d = configured(), card = configuredRpgCard(d, 'hero')!
    card.sheet!.schema.modules[0].fields.find(f => f.id === 'rpg_hp')!.label = '耐久'
    card.sheet!.schema.modules[0].fields = card.sheet!.schema.modules[0].fields.filter(f => f.id !== 'rpg_attack'); delete card.sheet!.values.rpg_attack
    const table = startRpgAdventure(d), live = rpgCardForRole(table, 'hero')
    expect(characterRows(live.card, live.archive)).toContainEqual({ label: '耐久', value: '120 / 120' })
    expect(live.card.sheet!.values).not.toHaveProperty('rpg_attack'); expect(table.adventure!.progress.rpg!.characters!.hero.attack).toBe(14)
  })
  it('binds configured story NPCs without putting them into the party or allowing free movement', () => {
    const d = configured(); d.rpg!.maps.camp.npcs[0].role = 'healer'
    d.rpg!.roles.healer.tabletopAppearance = createObject('figurine', { metadata: { model: 'mage', tavernPortrait: false } })
    const table = startRpgAdventure(adventureFromRpg(d.rpg!, d)), npc = table.objects.find(o => o.metadata.rpgNpc === 0)!
    expect(npc.metadata.model).toBe('mage'); expect(npc.locked).toBe(true); expect(npc.metadata.rpgRoleId).toBeUndefined()
    expect(boundCard(table, npc)?.id).toBe(configuredRpgCard(d, 'healer')?.id)
    expect(boundCard(table, npc)?.sheet?.values.rpg_hp).toEqual({ value: 100, max: 100 })
    expect(table.adventure!.progress.rpg!.recruited).toEqual(['hero'])
    expect(() => validateTableSession(table)).not.toThrow()
    d.rpg!.maps.camp.npcs[0].role = 'missing'; expect(() => validateRpgDatabase(d.rpg!)).toThrow('NPC角色')
  })
  it('keeps a chosen 3D model when the card also has a portrait', () => {
    const table = startRpgAdventure(configured()), actor = table.objects.find(o => o.metadata.rpgRoleId === 'hero')!
    configuredRpgCard(table.adventure!.definition, 'hero')!.portrait = '/api/resources/' + 'a'.repeat(64)
    actor.metadata.tavernPortrait = false
    expect(presentObject(table, actor)).toBe(actor)
    actor.metadata.tavernPortrait = true
    expect(presentObject(table, actor).texture).toBe('/api/resources/' + 'a'.repeat(64)); expect(presentObject(table, actor).metadata.model).toBe('')
  })
  it('exports and imports custom fields, gear, skills, pawn templates and stable bindings', async () => {
    const d = configured(); d.rpg!.roles.hero.weapon = 'training_sword'; d.rpg!.roles.hero.tabletopAppearance = createObject('figurine', { metadata: { model: 'cleric', tavernPortrait: false } })
    configuredRpgCard(d, 'hero')!.sheet!.values.custom_species = '机械生命'
    const refreshed = refreshRpgCardValues(d), roundTrip = await importPortableAdventure(await exportPortableAdventure(adventureFromRpg(refreshed.rpg!, refreshed)))
    expect(roundTrip.tavern).toEqual(validatePresentation(refreshed.tavern)); expect(roundTrip.rpg!.roles.hero.weapon).toBe('training_sword')
    expect(startRpgAdventure(roundTrip).objects.find(o => o.metadata.rpgRoleId === 'hero')?.metadata.model).toBe('cleric')
  })
  it('validates growth including original fractional increments and rejects malformed edits', () => {
    const d = configured().rpg!
    d.roles.hero.growth = { hp: 20, ep: 8, attack: 1.3, defence: 0.8, speed: 1.2 }; expect(() => validateRpgDatabase(d)).not.toThrow()
    d.roles.hero.growth = { attack: -1 }; expect(() => validateRpgDatabase(d)).toThrow('升级成长')
    d.roles.hero.growth = {}; d.roles.hero.color = 'red'; expect(() => validateRpgDatabase(d)).toThrow('棋子颜色')
    expect(defaultRpgCard(d, 'hero').sheet).not.toBeNull()
  })
})
