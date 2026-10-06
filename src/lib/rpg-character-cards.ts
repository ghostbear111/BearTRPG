import { characterModel, emptyPresentation, liveCharacterCard, presentationOf, type TavernCard } from './tavern-presentation.ts'
import { makeRpgCharacter } from './rpg-rules.ts'
import { DEFAULT_RPG_CARD_FIELDS, RPG_CARD_FIELDS, RPG_CHARACTER_PRESETS, rpgCardValues } from './rpg-card-values.ts'
import type { AdventureDefinition } from './adventure-schema.ts'
import type { RpgDatabase } from './rpg-schema.ts'
import type { TableSession } from './tabletop.ts'

export type RpgCharacterGroup = 'roles' | 'enemies'
export const rpgCardKey = (id: string, group: RpgCharacterGroup = 'roles') => group === 'roles' ? `rpg_${id}` : `rpg_enemy_${id}`
export function configuredRpgCard(definition: AdventureDefinition, id: string, group: RpgCharacterGroup = 'roles') {
  const p = definition.tavern, cardId = p?.bindings[rpgCardKey(id, group)]
  return p?.archive.cards.find(c => c.id === cardId)
}
export function defaultRpgCard(db: RpgDatabase, id: string, group: RpgCharacterGroup = 'roles'): TavernCard {
  const t = db[group][id]
  if (!t) throw new Error('请选择一个角色。')
  const card = characterModel.createCard('universal', emptyPresentation().archive)
  card.id = `bear-${group}-${id}`.slice(0, 80); card.name = t.name; card.title = String(t.title ?? ''); card.role = group === 'enemies' ? 'enemy' : id === 'hero' ? 'player' : 'companion'
  card.profile.background = String(t.desc ?? '')
  card.sheet = { schema: { id: 'bear-rpg-sheet', version: 1, name: '桌面 RPG 角色卡', modules: [
    { id: 'rpg_rules', name: '对局资料', fields: RPG_CARD_FIELDS.filter(f => DEFAULT_RPG_CARD_FIELDS.includes(f.id)).map(f => ({ ...f })) },
    { id: 'rpg_custom', name: '自定义资料', fields: [{ id: 'custom_faction', label: '阵营', type: 'text' }, { id: 'custom_species', label: '种族', type: 'text' }, { id: 'custom_occupation', label: '职业', type: 'text' }] },
  ] }, values: {} }
  const values = rpgCardValues(db, makeRpgCharacter(t, db, group === 'enemies'))
  for (const f of card.sheet.schema.modules.flatMap(m => m.fields)) card.sheet.values[f.id] = values[f.id] ?? ''
  return card
}
/** Retain existing archives and private/custom fields when creating RPG bindings. */
export function withRpgCharacterCard(value: AdventureDefinition, id: string, group: RpgCharacterGroup = 'roles'): AdventureDefinition {
  const definition = structuredClone(value), p = definition.tavern ??= emptyPresentation()
  if (configuredRpgCard(definition, id, group)) return definition
  if (p.archive.cards.length >= 200) throw new Error('角色档案库最多200张卡，请在完整角色工具中整理后再创建。')
  const card = defaultRpgCard(definition.rpg!, id, group)
  card.id = crypto.randomUUID(); p.archive.cards.push(card); p.bindings[rpgCardKey(id, group)] = card.id
  return definition
}
export function withRpgPartyCards(value: AdventureDefinition) {
  let definition = structuredClone(value)
  for (const id of Object.keys(definition.rpg!.roles)) definition = withRpgCharacterCard(definition, id)
  return definition
}
function refreshAuthorCard(card: TavernCard, db: RpgDatabase, id: string, group: RpgCharacterGroup) {
  if (!card.sheet) return
  card.name = db[group][id].name
  const values = rpgCardValues(db, makeRpgCharacter(db[group][id], db, group === 'enemies'))
  for (const field of card.sheet.schema.modules.flatMap(m => m.fields)) {
    const v = values[field.id]
    if (field.type === 'resource' && v && typeof v === 'object' || field.type === 'number' && typeof v === 'number' || ['text', 'textarea'].includes(field.type) && typeof v === 'string') card.sheet.values[field.id] = v
  }
}
/** Preview older modules with a complete archive without modifying the author's data. */
export function rpgAuthorCardPreview(definition: AdventureDefinition, id: string, group: RpgCharacterGroup = 'roles') {
  const db = definition.rpg
  if (!db?.[group][id]) return undefined
  const archive = definition.tavern ? structuredClone(definition.tavern.archive) : emptyPresentation().archive
  const cardId = definition.tavern?.bindings[rpgCardKey(id, group)]
  let card = archive.cards.find(c => c.id === cardId)
  if (!card) {
    card = defaultRpgCard(db, id, group)
    archive.cards.push(card)
  }
  refreshAuthorCard(card, db, id, group)
  return { card, archive }
}
export function refreshRpgCardValues(value: AdventureDefinition) {
  const definition = structuredClone(value), db = definition.rpg
  if (!db) return definition
  for (const group of ['roles', 'enemies'] as const) for (const id of Object.keys(db[group])) {
    const card = configuredRpgCard(definition, id, group)
    if (card) refreshAuthorCard(card, db, id, group)
  }
  return definition
}
export function applyRpgCharacterPreset(value: AdventureDefinition, id: string, presetId: string, group: RpgCharacterGroup = 'roles') {
  const preset = RPG_CHARACTER_PRESETS.find(p => p.id === presetId)
  if (!preset) throw new Error('角色模板不存在。')
  const definition = withRpgCharacterCard(value, id, group), db = definition.rpg!, t = db[group][id]
  for (const key of ['fist', 'blade', 'cannon', 'psi', 'drone', 'medicine']) t[key] = 0
  Object.assign(t, preset.stats)
  t.magics = Object.entries(db.magics).filter(([, m]) => (m as { school: number }).school === preset.school).slice(0, 2).map(([id]) => ({ id, lv: 1 }))
  return definition
}
export function rpgCardForRole(table: TableSession, id: string) {
  const definition = table.adventure!.definition, presentation = presentationOf(table), cardId = presentation?.bindings[rpgCardKey(id)]
  const card = presentation?.archive.cards.find(c => c.id === cardId) ?? defaultRpgCard(definition.rpg!, id)
  const object = table.objects.find(o => o.metadata.rpgRoleId === id) ?? { metadata: { rpgRoleId: id } }
  return { card: liveCharacterCard(table, card, object as Parameters<typeof liveCharacterCard>[2]), archive: presentation?.archive ?? emptyPresentation().archive }
}
