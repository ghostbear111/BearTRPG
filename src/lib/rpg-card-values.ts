import { expNeed, makeRpgCharacter, rpgStat, SCHOOL_NAMES, type RpgCharacter } from './rpg-rules.ts'
import type { RpgDatabase, RpgProgress } from './rpg-schema.ts'
import type { TableObject, TableSession } from './tabletop.ts'

export const RPG_CARD_FIELDS = [
  { id: 'rpg_hp', label: '生命', type: 'resource' }, { id: 'rpg_ep', label: '能量', type: 'resource' }, { id: 'rpg_pp', label: '体力', type: 'resource' },
  { id: 'rpg_level', label: '等级', type: 'number' }, { id: 'rpg_exp', label: '升级经验', type: 'resource' },
  ...(['attack', 'defence', 'speed', 'iq', 'fist', 'blade', 'cannon', 'psi', 'drone', 'medicine', 'knowledge', 'resist'] as const).map((key, i) => ({ id: `rpg_${key}`, label: ['火力', '装甲', '机动', '资质', '格斗', '光刃', '重炮', '异能', '无人机', '医疗', '学识', '抗性'][i], type: 'number' })),
  { id: 'rpg_ept', label: '能量谱系', type: 'text' }, { id: 'rpg_weapon', label: '武器', type: 'text' }, { id: 'rpg_armor', label: '防具', type: 'text' },
  { id: 'rpg_magics', label: '掌握武功', type: 'text' }, { id: 'rpg_practice', label: '修炼', type: 'text' }, { id: 'rpg_conditions', label: '状态', type: 'text' },
  { id: 'rpg_money', label: '队伍信用点', type: 'number' }, { id: 'rpg_fame', label: '队伍声望', type: 'number' },
  { id: 'rpg_morality', label: '队伍倾向', type: 'number' }, { id: 'rpg_objective', label: '收集目标', type: 'resource' },
] as const
export const DEFAULT_RPG_CARD_FIELDS = ['rpg_hp', 'rpg_ep', 'rpg_pp', 'rpg_level', 'rpg_attack', 'rpg_defence', 'rpg_speed', 'rpg_iq', 'rpg_weapon', 'rpg_armor', 'rpg_magics', 'rpg_ept', 'rpg_conditions', 'rpg_exp']

export function rpgCardValues(db: RpgDatabase, c: RpgCharacter, progress?: RpgProgress): Record<string, unknown> {
  const values: Record<string, unknown> = {
    rpg_hp: { value: c.hp, max: rpgStat(db, c, 'maxHP') }, rpg_ep: { value: c.ep, max: rpgStat(db, c, 'maxEP') }, rpg_pp: { value: c.pp, max: c.maxPP },
    rpg_level: c.level, rpg_exp: { value: c.exp, max: expNeed(c.level) }, rpg_ept: ['暗物质', '光能', '通用'][c.ept],
    rpg_weapon: c.weapon ? db.items[c.weapon]?.name ?? c.weapon : '未装备', rpg_armor: c.armor ? db.items[c.armor]?.name ?? c.armor : '未装备',
    rpg_magics: c.magics.map(m => `${(db.magics[m.id] as { name: string })?.name ?? m.id} · 第${Math.ceil(m.lv / 100)}段`).join('、') || '普通攻击',
    rpg_practice: c.practice ? db.items[c.practice]?.name ?? c.practice : '未修炼', rpg_conditions: [c.poison > 0 ? `中毒 ${c.poison}` : '', c.hurt > 0 ? `受伤 ${c.hurt}` : ''].filter(Boolean).join('、') || '正常',
    rpg_money: progress?.money ?? db.settings?.initialMoney ?? 300, rpg_fame: progress?.fame ?? 0, rpg_morality: progress?.morality ?? 0,
    rpg_objective: { value: progress?.cores.length ?? 0, max: db.settings?.objectiveCount ?? 12 },
  }
  for (const key of ['attack', 'defence', 'speed', 'iq', 'fist', 'blade', 'cannon', 'psi', 'drone', 'medicine', 'knowledge', 'resist'] as const) values[`rpg_${key}`] = rpgStat(db, c, key)
  return values
}

export function runtimeRpgCardValues(table: TableSession, object?: TableObject, roleId?: string) {
  const db = table.adventure?.definition.rpg, p = table.adventure?.progress.rpg
  if (!db || !p) return undefined
  const role = String(object?.metadata.rpgRoleId || object?.metadata.rpgNpcRoleId || roleId || '')
  const unit = object && table.combat?.rpg?.units[object.id]
  const c = unit?.stats ?? (role ? p.characters?.[role] : undefined) ?? (object?.metadata.rpgNpcRoleId && db.roles[role] ? makeRpgCharacter(db.roles[role], db) : undefined)
  return c ? rpgCardValues(db, c, p) : undefined
}

export const RPG_CHARACTER_PRESETS = [
  { id: 'wanderer', name: '行旅者', school: 0, stats: { hp: 120, ep: 50, pp: 100, attack: 14, defence: 8, speed: 16, iq: 50, fist: 12 } },
  { id: 'blade', name: '光刃武者', school: 1, stats: { hp: 140, ep: 55, pp: 100, attack: 18, defence: 9, speed: 22, iq: 50, blade: 25 } },
  { id: 'cannon', name: '重炮先锋', school: 2, stats: { hp: 160, ep: 50, pp: 100, attack: 22, defence: 14, speed: 12, iq: 45, cannon: 25 } },
  { id: 'psi', name: '异能使', school: 3, stats: { hp: 95, ep: 100, pp: 100, attack: 12, defence: 6, speed: 18, iq: 70, psi: 30 } },
  { id: 'drone', name: '无人机技师', school: 4, stats: { hp: 110, ep: 75, pp: 100, attack: 13, defence: 10, speed: 16, iq: 65, drone: 30, knowledge: 25 } },
  { id: 'medic', name: '医师', school: 5, stats: { hp: 100, ep: 90, pp: 100, attack: 10, defence: 8, speed: 18, iq: 70, medicine: 35 } },
] as const
export const RPG_SPECIALTIES = SCHOOL_NAMES.map((label, i) => ({ key: ['fist', 'blade', 'cannon', 'psi', 'drone', 'medicine'][i], label }))
