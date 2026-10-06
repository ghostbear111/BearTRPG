import '../vendor/tavern-character/universal.js'
import '../vendor/tavern-character/model.js'
import { validateAssetSource, type TableObject, type TableSession } from './tabletop.ts'
import { runtimeRpgCardValues } from './rpg-card-values.ts'

export interface TavernField { id: string; label: string; type: string; unit?: string; private?: boolean; expression?: string; default?: unknown }
export interface TavernCard {
  id: string; name: string; title: string; systemId: string; role: string; portrait: string; status: string
  profile: { player: string; age: string; occupation: string; background: string }
  abilities: Record<string, number>; resources: Record<string, { value: number; max: number }>
  sheet: null | { schema: { id: string; version: number; name: string; description?: string; modules: { id: string; name: string; fields: TavernField[] }[] }; values: Record<string, unknown> }
  inventory: string; notes: string; secret?: string; [key: string]: unknown
}
export interface TavernArchive { version: 1; cards: TavernCard[]; world: unknown; customRules: unknown[]; sheetTemplates: unknown[]; combatRules?: unknown }
export interface TavernEffect {
  id: string; name: string; url: string; width: number; height: number; duration: number; loops: number
  scope: 'table' | 'message' | 'piece' | 'card'; target: string; sceneId: string; trigger: 'manual' | 'scene'
}
export interface TavernPresentation { version: 1; archive: TavernArchive; bindings: Record<string, string>; effects: TavernEffect[] }
interface CharacterModel {
  createState(): TavernArchive; normalizeState(value: unknown): TavernArchive
  createCard(systemId: string, state: TavernArchive): TavernCard; toPlayerCard(card: TavernCard, state: TavernArchive): TavernCard
  getTemplates(state: TavernArchive): { id: string; name: string; abilities: { key: string; label: string }[]; resources: { key: string; label: string }[] }[]
}
const api = () => (globalThis as unknown as { TavernCharacterModel: CharacterModel }).TavernCharacterModel
export const characterModel = { createState: () => api().createState(), normalizeState: (v: unknown) => api().normalizeState(v), createCard: (system: string, state: TavernArchive) => api().createCard(system, state) }
export function emptyPresentation(): TavernPresentation { return { version: 1, archive: api().createState(), bindings: {}, effects: [] } }
function object(v: unknown, label: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) throw new Error(`${label}格式无效。`)
  return v as Record<string, unknown>
}
function text(v: unknown, max: number) { if (typeof v !== 'string' || v.length > max) throw new Error('演出文本过长或格式无效。'); return v }
function number(v: unknown, min: number, max: number) { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error('演出数值无效。'); return v }
function integer(v: unknown, min: number, max: number) { const n = number(v, min, max); if (!Number.isInteger(n)) throw new Error('演出尺寸与循环次数必须为整数。'); return n }
export function validatePresentation(value: unknown): TavernPresentation {
  const v = object(value, '角色与演出'); if (v.version !== 1) throw new Error('不支持的角色与演出版本。')
  const archive = api().normalizeState(v.archive), ids = new Set(archive.cards.map(c => c.id))
  const bindings = object(v.bindings, '角色关联'); if (Object.keys(bindings).length > 400) throw new Error('角色关联过多。')
  for (const [key, id] of Object.entries(bindings)) { if (!/^[a-zA-Z0-9_-]{1,120}$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key) || typeof id !== 'string' || !ids.has(id)) throw new Error('角色关联引用无效。') }
  if (!Array.isArray(v.effects) || v.effects.length > 64) throw new Error('最多保存64个文字演出。')
  const effectIds = new Set<string>()
  const effects = v.effects.map(raw => {
    const e = object(raw, '文字演出'), id = text(e.id, 120)
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || effectIds.has(id)) throw new Error('文字演出 ID 重复或无效。'); effectIds.add(id)
    if (!['table', 'message', 'piece', 'card'].includes(String(e.scope)) || !['manual', 'scene'].includes(String(e.trigger))) throw new Error('文字演出位置或触发方式无效。')
    const url = validateAssetSource(e.url, 'APNG 文件'); if (!url) throw new Error('文字演出需要图片。')
    const target = text(e.target, 120)
    if (['piece', 'card'].includes(String(e.scope)) && !/^[a-zA-Z0-9_-]+$/.test(target)) throw new Error('跟随演出需要有效的物件引用。')
    return { id, name: text(e.name, 120), url, width: integer(e.width, 1, 1920), height: integer(e.height, 1, 1920), duration: number(e.duration, .01, 60), loops: integer(e.loops, 0, 999), scope: e.scope as TavernEffect['scope'], target, sceneId: text(e.sceneId, 120), trigger: e.trigger as TavernEffect['trigger'] }
  })
  return { version: 1, archive, bindings: bindings as Record<string, string>, effects }
}
export function presentationOf(table: TableSession) { return table.tavern ?? table.workspace?.definition?.tavern ?? table.adventure?.definition.tavern }
export function bindingKey(o: TableObject) { return String((o.metadata.rpgEnemyId ? `rpg_enemy_${o.metadata.rpgEnemyId}` : '') || o.metadata.characterId || o.metadata.adventureObjectId || o.id) }
export function boundCard(table: TableSession, o?: TableObject | null) {
  const p = presentationOf(table); if (!p || !o) return undefined
  const id = String(p.bindings[bindingKey(o)] || o.metadata.tavernCharacterId || '')
  const card = p.archive.cards.find(c => c.id === id)
  return card ? liveCharacterCard(table, card, o) : undefined
}
/** Project running rules into the displayed card without changing the author's archive. */
export function liveCharacterCard(table: TableSession, card: TavernCard, object?: TableObject): TavernCard {
  if (!card.sheet) return card
  const bindings = presentationOf(table)?.bindings ?? {}
  const roleKey = Object.entries(bindings).find(([key, id]) => id === card.id && key.startsWith('rpg_') && table.adventure?.definition.rpg?.roles[key.slice(4)])?.[0]
  const values = runtimeRpgCardValues(table, object, roleKey?.slice(4))
  if (!values) return card
  const next = structuredClone(card)
  for (const group of next.sheet!.schema.modules) for (const field of group.fields) {
    const value = values[field.id]
    if (value === undefined || field.type === 'formula') continue
    if (field.type === 'resource' && value && typeof value === 'object' || field.type === 'number' && typeof value === 'number' || ['text', 'textarea'].includes(field.type) && typeof value === 'string') next.sheet!.values[field.id] = value
  }
  return next
}
export function publicCharacter(card: TavernCard, archive: TavernArchive) { return api().toPlayerCard(card, archive) }
export function characterRows(card: TavernCard, archive: TavernArchive): { label: string; value: string }[] {
  const publicCard = publicCharacter(card, archive), template = api().getTemplates(archive).find(t => t.id === card.systemId)
  const rows = (template?.abilities ?? []).map(f => ({ label: f.label, value: String(publicCard.abilities[f.key]) }))
  for (const f of template?.resources ?? []) { const r = publicCard.resources[f.key]; if (r) rows.push({ label: f.label, value: `${r.value} / ${r.max}` }) }
  for (const group of publicCard.sheet?.schema.modules ?? []) for (const field of group.fields) {
    let v = publicCard.sheet!.values[field.id]
    if (field.type === 'formula') { try { v = (globalThis as unknown as { TavernUniversal: { evaluateField(sheet: unknown, id: string): number } }).TavernUniversal.evaluateField(publicCard.sheet, field.id) } catch { v = '公式待完善' } }
    const content = typeof v === 'boolean' ? v ? '是' : '否' : Array.isArray(v) ? v.join('、') : v && typeof v === 'object' && 'value' in v ? `${v.value} / ${(v as { value: unknown; max?: unknown }).max}` : String(v ?? '')
    rows.push({ label: field.label, value: content + (field.unit ? ` ${field.unit}` : '') })
  }
  return rows
}
const images = new Map<string, string>()
export function characterCardImage(card: TavernCard, archive: TavernArchive) {
  if (typeof document === 'undefined') return ''
  const rows = characterRows(card, archive), subtitle = card.title || card.profile.occupation || card.sheet?.schema.name || '冒险者', key = JSON.stringify([card.id, card.name, subtitle, rows])
  if (images.has(key)) return images.get(key)!
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 768
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#211b14'; ctx.fillRect(0, 0, 512, 768)
  ctx.strokeStyle = '#d8b576'; ctx.lineWidth = 4; ctx.strokeRect(18, 18, 476, 732)
  ctx.fillStyle = '#cfaa6d'; ctx.font = '16px sans-serif'; ctx.fillText('熊酒馆 · 角色档案', 40, 62)
  ctx.fillStyle = '#f3e5c9'; ctx.font = 'bold 34px "Microsoft YaHei", sans-serif'; ctx.fillText(card.name || '未命名角色', 40, 127, 425)
  ctx.fillStyle = '#bba783'; ctx.font = '19px sans-serif'; ctx.fillText(subtitle, 40, 168, 425)
  rows.slice(0, 11).forEach((row, index) => { const y = 222 + index * 42; ctx.fillStyle = '#bba783'; ctx.font = '19px sans-serif'; ctx.fillText(row.label, 40, y, 220); ctx.fillStyle = '#f3e5c9'; ctx.textAlign = 'right'; ctx.fillText(row.value, 469, y, 220); ctx.textAlign = 'left'; ctx.strokeStyle = '#53412a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(40, y + 13); ctx.lineTo(472, y + 13); ctx.stroke() })
  ctx.fillStyle = '#9e8c70'; ctx.font = '15px sans-serif'; ctx.fillText('人物与棋子共享同一份档案', 40, 721)
  const url = canvas.toDataURL('image/png'); if (images.size >= 32) images.delete(images.keys().next().value!); images.set(key, url); return url
}
export function presentObject(table: TableSession, o: TableObject): TableObject {
  const p = presentationOf(table), c = boundCard(table, o); if (!p || !c) return o
  if (o.kind === 'card') return { ...o, name: c.name || o.name, texture: characterCardImage(c, p.archive) || o.texture }
  if (o.kind === 'figurine' && c.portrait && o.metadata.tavernPortrait !== false) return { ...o, texture: c.portrait, metadata: { ...o.metadata, model: '' } }
  return o
}
