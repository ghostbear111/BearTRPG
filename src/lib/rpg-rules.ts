import type { RpgDatabase, RpgTemplate } from './rpg-schema'
import { defaultDicePool, type DicePool, type PoolRoll, type DicePoolResult } from './dice.ts'

export const RPG_STATS = ['maxHP', 'maxEP', 'maxPP', 'attack', 'defence', 'speed', 'iq', 'medicine', 'fist', 'blade', 'cannon', 'psi', 'drone', 'knowledge', 'resist', 'bioWeapon', 'purify'] as const
export type RpgStat = typeof RPG_STATS[number]
export interface RpgCharacter extends Record<RpgStat, number> {
  level: number; exp: number; hp: number; ep: number; pp: number; ept: number; poison: number; hurt: number
  magics: { id: string; lv: number }[]; weapon: string | null; armor: string | null; practice: string | null; practiceExp: number
}
export interface RpgMagic {
  name: string; desc?: string; school: number; ept: number; area: 'point' | 'line' | 'cross' | 'zone'; dist: number; power: number; ep: number
  powLv?: number[]; epLv?: number[]; distLv?: number[]; areaLv?: string[]
  heal?: boolean; healAll?: boolean; cure?: boolean; shield?: boolean; suck?: boolean; special?: string
  dicePool?: DicePool
}
export interface RpgBattleUnit { roleId?: string; enemyId?: string; stats: RpgCharacter; x: number; y: number; moved: boolean; moveSpent: number; acted: boolean; guarded: boolean; stun: number; shield: number; shieldTurns: number }
export interface RpgBattleData {
  version: 1; ruleset: 'bear-tabletop'; size: 15; units: Record<string, RpgBattleUnit>; seed: number; rewardScale: number
  pending?: { kind: 'skill' | 'drone'; id: string; x: number; y: number; pool?: DicePool; rolls?: PoolRoll[] }
  lastRoll?: DicePoolResult
  reward?: { money: number; experience: number; drops: string[]; growth: string[]; rolls: string[] }
}
export const SCHOOL_NAMES = ['格斗', '光刃', '重炮', '异能', '无人机', '医疗']
export const AREA_NAMES = { point: '单点', line: '直线', cross: '十字', zone: '区域' }
export const BASIC_SKILL = 'tabletop_strike'
const basic: RpgMagic = { name: '普通攻击', desc: '不消耗能量的近身攻击。', school: 0, ept: 2, area: 'point', dist: 1, power: 8, ep: 0 }
export const bounded = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
export const valueOf = (v: unknown, fallback = 0) => typeof v === 'number' && Number.isFinite(v) ? v : fallback
export function rpgMagic(db: RpgDatabase, id: string): RpgMagic { return id === BASIC_SKILL ? basic : db.magics[id] as RpgMagic }
export function rpgSkillDice(db: RpgDatabase, id: string): DicePool { const m = rpgMagic(db, id); return m.dicePool ?? defaultDicePool(m.school) }
export function makeRpgCharacter(t: RpgTemplate, db: RpgDatabase, enemy = false, boost = 0): RpgCharacter {
  const maxHP = Math.round(valueOf(t.hp, 100) * (enemy ? 1 + boost * .15 : 1))
  const c: RpgCharacter = {
    maxHP: bounded(maxHP, 1, 1e6), hp: bounded(maxHP, 1, 1e6), maxEP: Math.round(valueOf(t.ep, 40)), ep: Math.round(valueOf(t.ep, 40)), maxPP: Math.round(valueOf(t.pp, 100)), pp: Math.round(valueOf(t.pp, 100)),
    level: bounded(valueOf(t.level, 1) + boost, 1, 30), exp: 0, ept: valueOf(t.ept, 2), poison: 0, hurt: 0,
    attack: valueOf(t.attack, 12) + boost * 2, defence: valueOf(t.defence, 6) + boost, speed: valueOf(t.speed, 12) + Math.floor(boost / 2), iq: valueOf(t.iq, 50),
    medicine: valueOf(t.medicine, t.medic ? 60 : 0), fist: valueOf(t.fist, enemy ? 10 : 0), blade: valueOf(t.blade), cannon: valueOf(t.cannon), psi: valueOf(t.psi), drone: valueOf(t.drone), knowledge: valueOf(t.knowledge, 5), resist: valueOf(t.resist), bioWeapon: valueOf(t.bioWeapon), purify: valueOf(t.purify),
    magics: (Array.isArray(t.magics) ? t.magics : []).map(v => typeof v === 'string' ? { id: v, lv: enemy ? Math.min(999, 100 + (valueOf(t.level, 1) + boost) * 15) : 1 } : v as { id: string; lv: number }).filter(v => v && db.magics[v.id]).map(v => ({ id: v.id, lv: bounded(valueOf(v.lv, 1), 1, 999) })),
    weapon: typeof t.weapon === 'string' && db.items[t.weapon] ? t.weapon : null, armor: typeof t.armor === 'string' && db.items[t.armor] ? t.armor : null, practice: null, practiceExp: 0,
  }
  if (enemy) for (const rec of c.magics) c.maxEP = Math.max(c.maxEP, skillValues(db, c, rec.id).cost)
  if (enemy) {
    const ids = c.magics.map(m => m.id), level = c.level
    if (t.fist === undefined) c.fist = ids.some(id => ['m_iron', 'm_combo'].includes(id)) ? 20 + level * 2 : 5
    if (t.blade === undefined) c.blade = ids.some(id => ['m_draw', 'm_swallow'].includes(id)) ? 20 + level * 2 : 5
    if (t.cannon === undefined) c.cannon = ids.some(id => ['m_railshot', 'm_barrage'].includes(id)) ? 20 + level * 2 : 5
    if (t.psi === undefined) c.psi = ids.some(id => ['m_push', 'm_darkwave'].includes(id)) ? 20 + level * 2 : 5
    if (t.drone === undefined) c.drone = 5
  }
  c.ep = c.maxEP
  return c
}
const equipmentStats: Record<string, string> = { attack: 'addAttack', defence: 'addDefence', speed: 'addSpeed', fist: 'addFist', blade: 'addBlade', cannon: 'addCannon', psi: 'addPsi', drone: 'addDrone', medicine: 'addMedicine', knowledge: 'addKnowledge', resist: 'addResist', maxHP: 'addMaxHP', maxEP: 'addMaxEP' }
export function rpgStat(db: RpgDatabase, c: RpgCharacter, key: RpgStat): number {
  const v = c[key] + [c.weapon, c.armor].reduce((sum, id) => sum + (id ? valueOf(db.items[id]?.[equipmentStats[key]]) : 0), 0)
  return ['maxHP', 'maxEP', 'maxPP'].includes(key) ? Math.round(bounded(v, key === 'maxHP' ? 1 : 0, 1e6)) : bounded(v, 0, 1e6)
}
export const skillSegment = (lv: number) => bounded(Math.ceil(lv / 100), 1, 10)
export function skillValues(db: RpgDatabase, c: RpgCharacter, id: string) {
  const m = rpgMagic(db, id), lv = c.magics.find(v => v.id === id)?.lv ?? 1, segment = skillSegment(lv), at = segment - 1
  let cost = m.epLv?.[at] ?? m.ep
  if (c.ept !== 2 && m.ept !== 2 && c.ept !== m.ept) cost = Math.ceil(cost * 1.5)
  return { magic: m, lv, segment, cost: Math.round(cost), power: m.powLv?.[at] ?? m.power, range: Math.max(1, Math.round(m.distLv?.[at] ?? m.dist)), area: (m.areaLv?.[at] ?? m.area) as RpgMagic['area'] }
}
export const rpgMoveRange = (db: RpgDatabase, c: RpgCharacter) => bounded(2 + Math.floor(rpgStat(db, c, 'speed') / 16), 2, 6)
export const expNeed = (level: number) => level ** 3 * 4 + level * 60
export const practiceNeed = (book: RpgTemplate, c: RpgCharacter) => Math.ceil(valueOf(book.needExp, 1000) * bounded((100 - c.iq) / 50, .3, 2))
export function gainRpgExperience(db: RpgDatabase, roleId: string, c: RpgCharacter, amount: number): string[] {
  c.exp = bounded(c.exp + Math.max(0, Math.round(amount)), 0, 1e9)
  const growth = db.roles[roleId].growth as Record<string, number> | undefined, messages: string[] = []
  while (c.level < 30 && c.exp >= expNeed(c.level)) {
    c.exp -= expNeed(c.level); c.level++
    for (const [stat, field, fallback] of [['maxHP', 'hp', 20], ['maxEP', 'ep', 8], ['attack', 'attack', 2], ['defence', 'defence', 1], ['speed', 'speed', 1]] as const) c[stat] = bounded(Math.round((c[stat] + valueOf(growth?.[field], fallback)) * 10) / 10, 0, 1e6)
    c.maxHP = Math.round(c.maxHP); c.maxEP = Math.round(c.maxEP); c.hp = rpgStat(db, c, 'maxHP'); c.ep = rpgStat(db, c, 'maxEP')
    messages.push(`${db.roles[roleId].name}升至 Lv.${c.level}`)
  }
  return messages
}
export function requirementError(db: RpgDatabase, c: RpgCharacter, item: RpgTemplate): string {
  for (const [need, stat, name] of [['needIQ', 'iq', '资质'], ['needFist', 'fist', '格斗'], ['needBlade', 'blade', '光刃'], ['needCannon', 'cannon', '重炮'], ['needPsi', 'psi', '异能'], ['needSpeed', 'speed', '机动']] as const) if (valueOf(item[need]) > rpgStat(db, c, stat)) return `需要${name} ≥ ${item[need]}`
  return ''
}
export function skillDamage(db: RpgDatabase, attacker: RpgBattleUnit, target: RpgBattleUnit, id: string, die: number): number {
  const c = attacker.stats, def = target.stats, v = skillValues(db, c, id), m = v.magic
  if (id !== BASIC_SKILL && c.ep <= 10) return Math.ceil(die / 2)
  let attack = rpgStat(db, c, 'attack') * (1 - Math.min(50, c.hurt) / 100)
  const schools = ['fist', 'blade', 'cannon', 'psi', 'drone'] as const
  let power = v.power + (schools[m.school] ? rpgStat(db, c, schools[m.school]) : 0) * .5
  if (!m.powLv && id !== BASIC_SKILL) power *= .75 + v.lv / 400
  const dominant = schools.reduce((best, key, i) => def[key] > def[schools[best]] ? i : best, 0)
  if ((m.school === 0 && dominant === 4) || (m.school === 4 && dominant === 2) || (m.school === 2 && dominant === 0)) power *= 1.25
  const armor = rpgStat(db, def, 'defence') + target.shield, variance = .9 + (die - 1) / 19 * .2
  let damage = m.suck ? (attack * .3 + power) * Math.max(.05, 1 - armor / 400) : attack + power - armor / 2
  if (m.special === 'pierce') damage = attack + power * 1.15
  const distance = Math.hypot(attacker.x - target.x, attacker.y - target.y)
  if (!m.suck && v.area !== 'zone' && distance > 1) damage /= Math.exp((distance - 1) / 10)
  damage *= variance * (target.guarded ? .5 : 1)
  return Math.max(1, Math.round(damage < 10 ? Math.ceil(die / 2) : damage))
}

export function validateRpgCharacter(value: unknown, db?: RpgDatabase): RpgCharacter {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('角色成长档案无效。')
  const c = value as RpgCharacter
  for (const k of [...RPG_STATS, 'level', 'exp', 'hp', 'ep', 'pp', 'ept', 'poison', 'hurt', 'practiceExp'] as const) if (typeof c[k] !== 'number' || !Number.isFinite(c[k]) || c[k] < 0 || c[k] > (['exp', 'practiceExp'].includes(k) ? 1e9 : 1e6)) throw new Error(`角色属性${k}无效。`)
  if (!Number.isInteger(c.maxHP) || c.maxHP < 1 || !Number.isInteger(c.level) || c.level < 1 || c.level > 30 || c.ept > 2 || !Number.isInteger(c.ept) || c.poison > 100 || c.hurt > 50) throw new Error('角色等级或状态无效。')
  for (const key of ['hp', 'ep', 'pp'] as const) if (!Number.isInteger(c[key]) || c[key] > (db ? rpgStat(db, c, key === 'hp' ? 'maxHP' : key === 'ep' ? 'maxEP' : 'maxPP') : 1e6)) throw new Error('角色资源超出上限。')
  if (!Array.isArray(c.magics) || c.magics.length > 10 || new Set(c.magics.map(m => m.id)).size !== c.magics.length || c.magics.some(m => !m || typeof m.id !== 'string' || !Number.isInteger(m.lv) || m.lv < 1 || m.lv > 999 || db && !db.magics[m.id])) throw new Error('角色武功引用无效。')
  for (const key of ['weapon', 'armor', 'practice'] as const) if (c[key] !== null && (typeof c[key] !== 'string' || db && !db.items[c[key]!])) throw new Error('装备或修炼引用无效。')
  if (db && (c.weapon && db.items[c.weapon].type !== 1 || c.armor && db.items[c.armor].type !== 2 || c.practice && db.items[c.practice].type !== 5)) throw new Error('装备槽或修炼物品类型无效。')
  return structuredClone(c)
}
