import { addTableLog, createObject, validateTableSession, type TableObject, type TableSession, type Vec3 } from './tabletop.ts'
import type { RpgDatabase, RpgOp } from './rpg-schema'
import { BASIC_SKILL, RPG_STATS, bounded, gainRpgExperience, makeRpgCharacter, practiceNeed, rpgMagic, rpgSkillDice, rpgMoveRange, rpgStat, skillDamage, skillValues, valueOf, type RpgBattleUnit, type RpgStat } from './rpg-rules.ts'
import { defaultDicePool, dicePoolLabel, resolveDicePool, type DicePoolResult } from './dice.ts'
import { tableBounds } from './table-surface.ts'
import { CLAW_DICE_COLORS } from './dice-style.ts'

export type RpgBattleAction = { type: 'move'; x: number; y: number } | { type: 'skill' | 'drone'; id: string; x: number; y: number } | { type: 'item'; id: string; target: string } | { type: 'defend' | 'rest' | 'next' | 'cancel' | 'enemy' } | { type: 'resolve'; dieId: string; value: number; request: number; generation: number }
export type RpgBattlePlan = { kind: 'move' | 'skill' | 'drone'; id?: string; target?: { x: number; y: number } }
export interface RpgRollContext { request: number; generation: number }
export const battlePosition = (x: number, y: number, height = .6): Vec3 => [x - 7, height, y - 7]
export const battleCoordinates = (p: Vec3) => ({ x: Math.round(p[0] + 7), y: Math.round(p[2] + 7) })
const RPG_BATTLE_SURFACE = { width: 20, depth: 20 }
/** Remove only the generated dice station; pending references survive until recovery. */
export function compactRpgBattleTable(source: TableSession): TableSession {
  if (!source.combat?.rpg || source.combat.phase === 'rolling') return source
  const oldTray = source.objects.some(o => o.id === 'rpg-dice-tray' && o.metadata.rpgGenerated)
  const staleDice = source.objects.some(o => o.metadata.rpgRollDie)
  if (!oldTray && !staleDice) return source
  return { ...source, objects: source.objects.filter(o => !(o.id === 'rpg-dice-tray' && o.metadata.rpgGenerated) && !o.metadata.rpgRollDie), ...(oldTray && source.surface?.width === 24 && source.surface.depth === 20 ? { surface: { ...RPG_BATTLE_SURFACE } } : {}) }
}
export function ensureRpgCharacters(table: TableSession) {
  const a = table.adventure, db = a?.definition.rpg, p = a?.progress.rpg
  if (!a || !db || !p || p.characters || table.combat && !table.combat.rpg) return table
  p.characters = Object.fromEntries(Object.entries(db.roles).map(([id, t]) => {
    const c = makeRpgCharacter(t, db), old = a.definition.characters.find(v => v.id === `rpg_${id}`)!
    c.hp = Math.round(bounded((a.progress.hp[old.id] ?? old.maxHp) / old.maxHp, 0, 1) * rpgStat(db, c, 'maxHP'))
    return [id, c]
  }))
  p.rulesVersion = 2
  return syncRpgCharacters(table)
}
export function syncRpgCharacters(table: TableSession) {
  const a = table.adventure!, db = a.definition.rpg!, p = a.progress.rpg!
  if (!p.characters) return table
  if (table.combat?.rpg) for (const u of Object.values(table.combat.rpg.units)) if (u.roleId) p.characters[u.roleId] = structuredClone(u.stats)
  for (const [id, c] of Object.entries(p.characters)) a.progress.hp[`rpg_${id}`] = c.hp
  table.objects = table.objects.map(o => {
    const unit = table.combat?.rpg?.units[o.id], c = unit?.stats ?? p.characters![String(o.metadata.rpgRoleId)]
    if (!c) return o
    return { ...o, ...(unit ? { position: battlePosition(unit.x, unit.y, o.position[1]) } : {}), metadata: { ...o.metadata, hp: c.hp, vitality: rpgStat(db, c, 'maxHP'), ep: c.ep, maxEP: rpgStat(db, c, 'maxEP'), pp: c.pp, level: c.level, focus: 3, guarded: unit?.guarded ?? false, poisoned: c.poison > 0, stunned: (unit?.stun ?? 0) > 0, shield: unit?.shield ?? 0 } }
  })
  return table
}
function context(t: TableSession) {
  const s = t.combat, db = t.adventure?.definition.rpg, p = t.adventure?.progress.rpg, r = s?.rpg
  if (!s || !db || !p?.characters || !r) throw new Error('当前不是武功跑团遭遇。')
  return { s, db, p, r, id: s.order[s.turn], unit: r.units[s.order[s.turn]] }
}
function randomD20(table: TableSession) { const r = table.combat!.rpg!; r.seed = (Math.imul(r.seed, 1664525) + 1013904223) >>> 0; return Math.floor(r.seed / 0x100000000 * 20) + 1 }
function unitSide(u: RpgBattleUnit) { return u.roleId ? '队伍' : '敌方' }
function name(t: TableSession, id: string) { return t.objects.find(o => o.id === id)!.name }
function message(t: TableSession, text: string) { t.combat!.message = text.slice(0, 1000); t.logs = addTableLog(t, text.slice(0, 1000)).logs }
function winner(t: TableSession) {
  const { s, r } = context(t), sides = [...new Set(Object.values(r.units).filter(u => u.stats.hp > 0).map(unitSide))]
  if (sides.length > 1) return false
  s.phase = 'complete'; s.winner = sides[0] ?? '无人'; s.pending = undefined; r.pending = undefined; s.ap = 0
  message(t, `${s.winner}获胜！${s.winner === '队伍' ? '结算遭遇后领取奖励并继续剧情。' : '本次冒险即将结束。'}`)
  return true
}
export function startRpgBattle(table: TableSession, op: RpgOp): TableSession {
  ensureRpgCharacters(table)
  const a = table.adventure!, db = a.definition.rpg!, p = a.progress.rpg!, units: Record<string, RpgBattleUnit> = {}, figures: TableObject[] = []
  const add = (id: string, title: string, stats: RpgBattleUnit['stats'], x: number, y: number, roleId?: string, enemyId?: string) => {
    const appearance = roleId ? a.definition.characters.find(c => c.id === `rpg_${roleId}`)?.appearance : db.enemies[enemyId!]?.tabletopAppearance as TableObject | undefined
    const base = appearance ? structuredClone(appearance) : createObject('figurine')
    units[id] = { ...(roleId ? { roleId } : { enemyId }), stats: structuredClone(stats), x, y, moved: false, moveSpent: 0, acted: false, guarded: false, stun: 0, shield: 0, shieldTurns: 0 }
    figures.push({ ...base, id, kind: 'figurine', name: title, position: battlePosition(x, y), scale: [.7, .7, .7], locked: false, color: roleId ? a.definition.characters.find(c => c.id === `rpg_${roleId}`)!.color : /^#[a-f0-9]{6}$/i.test(String(db.enemies[enemyId!].color)) ? String(db.enemies[enemyId!].color) : '#bd826e', metadata: { ...base.metadata, ...(roleId ? { rpgRoleId: roleId, characterId: `rpg_${roleId}`, rpgLeader: roleId === 'hero' } : { rpgEnemyId: enemyId! }), rpgGenerated: true, team: roleId ? '队伍' : '敌方', model: base.metadata.model ?? (roleId ? 'ranger' : 'guard'), hp: stats.hp, vitality: rpgStat(db, stats, 'maxHP'), focus: 3, moveMode: 'grid', moveStep: 1, moveRange: rpgMoveRange(db, stats) } })
  }
  p.roster.forEach((id, i) => { const c = p.characters![id]; if (c.hp > 0) add(`rpg-actor-${id}`, db.roles[id].name, c, 3, 4 + i, id) })
  if (!figures.length) throw new Error('队伍已倒下，无法进入遭遇。')
  op.enemies!.forEach((id, i) => { const c = makeRpgCharacter(db.enemies[id], db, true, bounded(valueOf(op.boost), 0, 20)); add(`rpg-enemy-${i}`, db.enemies[id].name, c, 10 + Math.floor(i / 9) * 2, 2 + i % 9, undefined, id) })
  const order = figures.map(o => o.id).sort((a, b) => rpgStat(db, units[b].stats, 'speed') - rpgStat(db, units[a].stats, 'speed'))
  const board = createObject('board', { id: 'rpg-arena', name: op.title || '武功跑团遭遇', locked: true, position: [0, .05, 0], color: '#4b5c66', metadata: { width: 15, depth: 15, height: .1, rpgGenerated: true } })
  const next = { ...table, objects: [board, ...figures, ...table.objects.filter(o => ['hand', 'inventory'].includes(String(o.metadata.zone)))], surface: { ...RPG_BATTLE_SURFACE }, grid: { enabled: true, snap: true, size: 1 }, combat: { version: 1 as const, order, turn: 0, round: 1, ap: 2, phase: 'turn' as const, message: '按机动排序。每回合一次移动和一个动作；招式使用各自的实体骰组，全部落定后结算。', rpg: { version: 1 as const, ruleset: 'bear-tabletop' as const, size: 15 as const, units, seed: (Date.now() >>> 0), rewardScale: bounded(valueOf(op.rewardScale, 1), 0, 10) } } }
  if (!startTurn(next)) nextTurn(next); return syncRpgCharacters(next)
}
function startTurn(t: TableSession): boolean {
  const { s, unit: u } = context(t); u.guarded = false; u.moved = false; u.moveSpent = 0; u.acted = false; s.ap = 2
  if (u.shieldTurns > 0 && --u.shieldTurns === 0) u.shield = 0
  if (u.stats.poison > 0) { const damage = 5 + Math.floor(u.stats.poison / 2); u.stats.hp = Math.max(0, u.stats.hp - damage); u.stats.poison = Math.max(0, u.stats.poison - 1); message(t, `${name(t, s.order[s.turn])}中毒，损失${damage}生命。`) }
  if (winner(t)) return true
  if (u.stats.hp === 0) return false
  if (u.stun > 0) { u.stun--; message(t, `${name(t, s.order[s.turn])}停滞，跳过本回合。`); return false }
  message(t, `轮到${name(t, s.order[s.turn])}：一次移动＋一个动作。`); return true
}
function nextTurn(t: TableSession) {
  const { s } = context(t)
  for (let n = 0; n < s.order.length * 3; n++) { s.turn = (s.turn + 1) % s.order.length; if (s.turn === 0) s.round++; if (context(t).unit.stats.hp === 0) continue; if (startTurn(t)) return }
  throw new Error('战斗回合无法推进。')
}
export function rpgBattleMoveOptions(table: TableSession, includeEnemy = false): { x: number; y: number; distance: number }[] {
  if (!table.combat?.rpg || table.combat.phase !== 'turn') return []
  const { r, db, unit } = context(table)
  if (!includeEnemy && !unit.roleId || unit.acted || !unit.moved && unit.stats.pp < 10 || unit.stats.hp === 0) return []
  const range = rpgMoveRange(db, unit.stats) - unit.moveSpent, occupied = new Set(Object.values(r.units).filter(u => u.stats.hp > 0).map(u => `${u.x},${u.y}`)), seen = new Set([`${unit.x},${unit.y}`]), queue = [{ x: unit.x, y: unit.y, distance: 0 }]
  for (let n = 0; n < queue.length; n++) { const cell = queue[n]; if (cell.distance >= range) continue; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = cell.x + dx, y = cell.y + dy, key = `${x},${y}`; if (x < 0 || y < 0 || x >= 15 || y >= 15 || occupied.has(key) || seen.has(key)) continue; seen.add(key); queue.push({ x, y, distance: cell.distance + 1 }) } }
  return queue.slice(1)
}
export function rpgAreaCells(area: string, range: number, cx: number, cy: number, tx: number, ty: number) {
  const cells: {x: number; y: number}[] = []
  if (area === 'point') cells.push({ x: tx, y: ty })
  else if (area === 'line') { const horizontal = Math.abs(tx - cx) >= Math.abs(ty - cy), dx = horizontal ? Math.sign(tx - cx) || 1 : 0, dy = horizontal ? 0 : Math.sign(ty - cy) || 1; for (let n = 1; n <= range; n++) cells.push({ x: cx + dx * n, y: cy + dy * n }) }
  else if (area === 'cross') { cells.push({ x: cx, y: cy }); for (let n = 1; n <= range; n++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) cells.push({ x: cx + dx * n, y: cy + dy * n }) }
  else for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cells.push({ x: tx + dx, y: ty + dy })
  return cells.filter(c => c.x >= 0 && c.y >= 0 && c.x < 15 && c.y < 15)
}
export function rpgBattleTargetError(table: TableSession, kind: 'skill' | 'drone', id: string, x: number, y: number, enemy = false): string {
  const { db, p, unit: u, r, s } = context(table)
  if (s.phase !== 'turn' || u.acted || !enemy && !u.roleId || u.stats.hp === 0) return '当前不能执行动作。'
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= 15 || y >= 15) return '请选择战场格子。'
  if (u.stats.pp < (kind === 'skill' ? 20 : 10)) return '体力不足，请休息。'
  if (kind === 'drone') {
    const it = db.items[id], target = Object.values(r.units).find(v => v.x === x && v.y === y && v.stats.hp > 0)
    if (!it || it.type !== 4 || !p.bag[id] || !target || unitSide(target) === unitSide(u)) return '请选择敌方棋子和可用无人机。'
    return Math.abs(x - u.x) + Math.abs(y - u.y) > valueOf(it.dist, 1) ? '目标超出无人机射程。' : ''
  }
  if (id !== BASIC_SKILL && !u.stats.magics.some(m => m.id === id)) return '当前角色未掌握这个武功。'
  const v = skillValues(db, u.stats, id), m = v.magic
  if (u.stats.ep < v.cost) return '能量不足，请用药或休息。'
  if (Math.abs(x - u.x) + Math.abs(y - u.y) > v.range) return '目标超出武功射程。'
  const cells = rpgAreaCells(v.area, v.range, u.x, u.y, x, y)
  const targets = Object.values(r.units).filter(t => t.stats.hp > 0 && cells.some(c => c.x === t.x && c.y === t.y) && (m.heal || m.shield ? unitSide(t) === unitSide(u) : unitSide(t) !== unitSide(u)))
  if (!targets.length) return '范围内没有有效目标。'
  if (m.heal && !m.cure && targets.every(t => t.stats.hp >= rpgStat(db, t.stats, 'maxHP'))) return '范围内友军生命已满。'
  return ''
}
export function rpgBattlePlanCells(table: TableSession, plan: RpgBattlePlan | null) {
  if (!plan || !table.combat?.rpg) return []
  const { unit, db } = context(table)
  if (plan.kind === 'move') return rpgBattleMoveOptions(table).map(c => ({ cell: `${c.x - 7},${c.y - 7}`, position: battlePosition(c.x, c.y, .13), size: .9 }))
  const range = plan.kind === 'skill' ? skillValues(db, unit.stats, plan.id!).range : valueOf(db.items[plan.id!]?.dist, 1)
  const cells = []
  for (let y = Math.max(0, unit.y - range); y <= Math.min(14, unit.y + range); y++) for (let x = Math.max(0, unit.x - range); x <= Math.min(14, unit.x + range); x++) if (!rpgBattleTargetError(table, plan.kind, plan.id!, x, y)) cells.push({ cell: `${x - 7},${y - 7}`, position: battlePosition(x, y, .13), size: .9 })
  return cells
}
export function rpgBattleEffectCells(table: TableSession, plan: RpgBattlePlan | null) {
  if (!plan?.target || plan.kind === 'move' || !table.combat?.rpg) return []
  const { db, unit } = context(table), v = plan.kind === 'skill' ? skillValues(db, unit.stats, plan.id!) : undefined
  return rpgAreaCells(v?.area ?? 'point', v?.range ?? 1, unit.x, unit.y, plan.target.x, plan.target.y).map(c => ({ position: battlePosition(c.x, c.y, .15), size: .92, color: v?.magic.heal || v?.magic.shield ? '#77dcb8' : '#e8ab68' }))
}
function spendAction(table: TableSession) { const { s, unit } = context(table); unit.acted = true; unit.moved = true; s.ap = 0 }
function damage(table: TableSession, id: string, amount: number, attacker: RpgBattleUnit) {
  const { db, r } = context(table), target = r.units[id], actual = Math.min(target.stats.hp, amount)
  target.stats.hp = Math.max(0, target.stats.hp - amount); target.stats.hurt = bounded(target.stats.hurt + 2 + Math.floor(actual / 25), 0, 50)
  if (attacker.roleId) gainRpgExperience(db, attacker.roleId, attacker.stats, Math.round(actual / 2) + (target.stats.hp === 0 ? Math.round(target.stats.maxHP * .15) : 0))
  return actual
}
function requestRoll(t: TableSession, action: {type: 'skill' | 'drone'; id: string; x: number; y: number}, ctx: RpgRollContext) {
  const { s, r, db, id, unit } = context(t), target = Object.keys(r.units).find(k => r.units[k].x === action.x && r.units[k].y === action.y && r.units[k].stats.hp > 0) ?? id
  const pool = structuredClone(action.type === 'skill' ? rpgSkillDice(db, action.id) : { ...defaultDicePool(), dice: [{ count: 2, sides: 6 }], mode: 'power' as const })
  // These objects carry the transaction and face definitions, never occupy the board.
  const bounds = tableBounds(t)
  const positions: Vec3[] = Array.from({ length: pool.dice.reduce((total, d) => total + d.count, 0) }, () => [bounded(0, bounds.minX, bounds.maxX), .8, bounded(0, bounds.minZ, bounds.maxZ)])
  const dice = pool.dice.flatMap(d => Array.from({ length: d.count }, () => d)).map((d, i) => createObject('dice', { id: `rpg-roll-${ctx.generation}-${ctx.request}-${i}`, name: `${d.name || (d.faces ? '符号骰' : `d${d.sides}`)} · ${i + 1}`, sides: d.sides, scale: [.58, .58, .58], position: positions[i], color: d.color ?? [CLAW_DICE_COLORS.agent, CLAW_DICE_COLORS.planet][pool.dice.indexOf(d) % 2], ...(d.faces ? { diceFaces: structuredClone(d.faces) } : {}), metadata: { rpgRollDie: true, rpgGenerated: true } }))
  t.objects = [...t.objects.filter(o => !o.metadata.rpgRollDie && o.id !== 'rpg-d20' && !(o.id === 'rpg-dice-tray' && o.metadata.rpgGenerated)), ...dice]; t.physics.gravity = true
  if (t.objects.length > 200) throw new Error('桌面物件过多，请先整理背包物件再投掷骰组。')
  s.pending = { attacker: id, target, dieId: dice[0].id, request: ctx.request, generation: ctx.generation }
  r.pending = { kind: action.type, id: action.id, x: action.x, y: action.y, pool, rolls: dice.map(d => ({ dieId: d.id, sides: d.sides, ...(d.diceFaces ? { faces: structuredClone(d.diceFaces) } : {}), name: d.name })) }; s.phase = 'rolling'
  message(t, `${name(t, id)}选择${action.type === 'skill' ? rpgMagic(db, action.id).name : db.items[action.id].name}，投掷${dicePoolLabel(pool)}；整组落定后结算，尚未消耗资源。`)
}
function resolve(t: TableSession, die: number, result?: DicePoolResult) {
  const { s, db, r, p, unit: u, id } = context(t), intent = r.pending!, lines: string[] = []
  const missed = result?.missed ?? false, extra = result?.bonus ?? 0, damageExtra = result?.effects.damage ?? 0, luck = result?.effectiveD20 ?? die
  if (result) r.lastRoll = result
  if (intent.kind === 'drone') {
    const item = db.items[intent.id], targetId = Object.keys(r.units).find(k => r.units[k].x === intent.x && r.units[k].y === intent.y && r.units[k].stats.hp > 0)!, target = r.units[targetId]
    p.bag[intent.id]--; if (!p.bag[intent.id]) delete p.bag[intent.id]; u.stats.pp = Math.max(0, u.stats.pp - 5)
    const hit = !missed && luck / 20 <= bounded(.9 + (rpgStat(db, u.stats, 'speed') - rpgStat(db, target.stats, 'speed')) / 100, .5, 1)
    if (hit) { lines.push(`${name(t, targetId)}损失${damage(t, targetId, valueOf(item.dmg, 1), u)}生命`); if (item.stun) target.stun = 1 } else lines.push('无人机未命中')
  } else {
    const values = skillValues(db, u.stats, intent.id), m = values.magic
    u.stats.ep -= values.cost; u.stats.pp = Math.max(0, u.stats.pp - 3)
    const cells = rpgAreaCells(values.area, values.range, u.x, u.y, intent.x, intent.y)
    for (const [targetId, target] of Object.entries(r.units)) {
      if (target.stats.hp === 0 || !cells.some(c => c.x === target.x && c.y === target.y) || (m.heal || m.shield ? unitSide(target) !== unitSide(u) : unitSide(target) === unitSide(u))) continue
      if (missed) { lines.push(`${name(t, targetId)}未受到招式效果（0成功）`); continue }
      if (m.shield) { const amount = Math.max(0, values.power + extra); target.shield = bounded(target.shield + amount, 0, 1e6); target.shieldTurns = 3; lines.push(`${name(t, targetId)}获得${amount}护盾装甲（3回合）`) }
      else if (m.heal) {
        const amount = Math.max(0, Math.round((values.power + rpgStat(db, u.stats, 'medicine')) * (.9 + (die - 1) / 19 * .2) + extra)), actual = Math.min(rpgStat(db, target.stats, 'maxHP') - target.stats.hp, amount)
        target.stats.hp += actual; if (m.cure) { target.stats.poison = 0; target.stats.hurt = Math.max(0, target.stats.hurt - 40) }
        if (u.roleId) gainRpgExperience(db, u.roleId, u.stats, Math.round(actual / 3)); lines.push(`${name(t, targetId)}恢复${actual}生命${m.cure ? '并净化' : ''}`)
      } else {
        const dealt = damage(t, targetId, Math.max(0, skillDamage(db, u, target, intent.id, die) * (m.special === 'double' ? 2 : 1) + extra + damageExtra), u); lines.push(`${name(t, targetId)}损失${dealt}生命${target.stats.hp === 0 ? '，倒下' : ''}`)
        if (m.suck && target.stats.hp > 0) { const amount = Math.min(target.stats.ep, Math.max(3, Math.round(dealt / 2))); target.stats.ep -= amount; u.stats.ep = Math.min(rpgStat(db, u.stats, 'maxEP'), u.stats.ep + amount) }
        if (((m.special === 'stun' || m.special === 'stunAll') && luck <= 7 || (result?.effects.stun ?? 0) > 0) && target.stats.hp > 0) { target.stun = 1; lines.push('停滞：跳过下次行动') }
        const template = u.enemyId ? db.enemies[u.enemyId] : db.roles[u.roleId!]
        if (valueOf(template.venom) > 0 && luck <= Math.floor(valueOf(template.venom) * 20)) target.stats.poison = Math.min(100, target.stats.poison + 15 + Math.floor((luck - 1) / 19 * 15))
      }
    }
    const learned = u.stats.magics.find(v => v.id === intent.id); if (learned) learned.lv = Math.min(999, learned.lv + (luck <= 10 ? 1 : 2))
  }
  if (result) {
    if (result.effects.heal) { const amount = Math.min(rpgStat(db, u.stats, 'maxHP') - u.stats.hp, result.effects.heal); u.stats.hp += amount; lines.push(`骰面令自身恢复${amount}生命`) }
    if (result.effects.energy) { const amount = Math.min(rpgStat(db, u.stats, 'maxEP') - u.stats.ep, result.effects.energy); u.stats.ep += amount; lines.push(`骰面令自身恢复${amount}能量`) }
    if (result.effects.shield) { u.shield = bounded(u.shield + result.effects.shield, 0, 1e6); u.shieldTurns = 3; lines.push(`骰面令自身获得${result.effects.shield}护盾`) }
  }
  spendAction(t); s.phase = 'turn'; s.pending = undefined; r.pending = undefined
  t.objects = t.objects.filter(o => !o.metadata.rpgRollDie)
  r.seed = (Math.imul(r.seed ^ die ^ (result?.total ?? 0) ^ ((result?.successes ?? 0) << 16), 1664525) + 1013904223) >>> 0
  const rollText = result ? `${result.faces.map(f => `${f.symbol}${f.label}`).join(' / ')} · 合计${result.total} · ${result.successes}成功${result.bonus ? ` · 加成${result.bonus}` : ''}` : `d20=${die}`
  message(t, `${name(t, id)}使用${intent.kind === 'skill' ? rpgMagic(db, intent.id).name : db.items[intent.id].name} · ${rollText}：${lines.join('；')}。`)
  winner(t)
}
function enemyPlan(t: TableSession, ctx: RpgRollContext) {
  const { r, db, unit: u, id } = context(t), enemies = Object.entries(r.units).filter(([, target]) => target.roleId && target.stats.hp > 0)
  const skills = [BASIC_SKILL, ...u.stats.magics.map(m => m.id)]
  const bestCast = () => {
    const candidates: {id: string; x: number; y: number; score: number}[] = []
    for (const skill of skills) for (const target of Object.values(r.units).filter(v => v.stats.hp > 0)) {
      if (rpgBattleTargetError(t, 'skill', skill, target.x, target.y, true)) continue
      const v = skillValues(db, u.stats, skill), cells = rpgAreaCells(v.area, v.range, u.x, u.y, target.x, target.y)
      let score = 0
      for (const affected of Object.values(r.units).filter(v => v.stats.hp > 0 && cells.some(c => c.x === v.x && c.y === v.y))) {
        if (v.magic.heal && unitSide(affected) === unitSide(u)) score += Math.min(rpgStat(db, affected.stats, 'maxHP') - affected.stats.hp, v.power + rpgStat(db, u.stats, 'medicine')) * 1.2
        else if (v.magic.shield && unitSide(affected) === unitSide(u) && !affected.shieldTurns) score += v.power * .2
        else if (!v.magic.heal && !v.magic.shield && unitSide(affected) !== unitSide(u)) score += Math.min(affected.stats.hp, skillDamage(db, u, affected, skill, 10)) + (affected.stats.hp <= skillDamage(db, u, affected, skill, 10) ? 25 : 0)
      }
      candidates.push({ id: skill, x: target.x, y: target.y, score: score - v.cost * .05 })
    }
    return candidates.filter(c => c.score > 0).sort((a, b) => b.score - a.score)[0]
  }
  let cast = bestCast()
  if (!cast) {
    const moves = rpgBattleMoveOptions(t, true).sort((a, b) => Math.min(...enemies.map(([, e]) => Math.abs(a.x - e.x) + Math.abs(a.y - e.y))) - Math.min(...enemies.map(([, e]) => Math.abs(b.x - e.x) + Math.abs(b.y - e.y))))
    if (moves[0]) { u.x = moves[0].x; u.y = moves[0].y; u.moveSpent += moves[0].distance; if (!u.moved) u.stats.pp -= 2; u.moved = true; t.combat!.ap = 1; message(t, `${name(t, id)}移动至(${u.x},${u.y})。`); cast = bestCast() }
  }
  if (cast && cast.score > 0) requestRoll(t, { type: 'skill', id: cast.id, x: cast.x, y: cast.y }, ctx)
  else { u.stats.pp = Math.min(u.stats.maxPP, u.stats.pp + 5); u.stats.ep = Math.min(rpgStat(db, u.stats, 'maxEP'), u.stats.ep + Math.max(1, Math.round(rpgStat(db, u.stats, 'maxEP') * .05))); u.stats.hurt = Math.max(0, u.stats.hurt - 5); spendAction(t); message(t, `${name(t, id)}休息，恢复体力与能量。`) }
}
export function applyRpgBattleAction(source: TableSession, action: RpgBattleAction, ctx: RpgRollContext = { request: 1, generation: 0 }, seat = '玩家1'): TableSession {
  const t = structuredClone(compactRpgBattleTable(source)), { s, r, db, p, unit: u, id } = context(t)
  if (s.phase === 'complete') throw new Error('遭遇已结束，请结算并继续剧情。')
  if (action.type === 'resolve') {
    const pending = s.pending
    const roll = r.pending?.rolls?.find(v => v.dieId === action.dieId)
    if (s.phase !== 'rolling' || !pending || (r.pending?.rolls ? !roll : pending.dieId !== action.dieId) || pending.request !== action.request || pending.generation !== action.generation) return source
    if (!Number.isInteger(action.value) || action.value < 1 || action.value > (roll?.sides ?? 20)) throw new Error('武功需要本次骰组的真实落定结果。')
    if (roll) {
      if (roll.value !== undefined) return source
      roll.value = action.value
      const object = t.objects.find(o => o.id === roll.dieId)!; object.value = action.value
      if (r.pending!.rolls!.every(v => v.value !== undefined)) { const result = resolveDicePool(r.pending!.pool!, r.pending!.rolls!); resolve(t, result.mode === 'power' ? result.effectiveD20 : 10, result) }
      else message(t, `骰组已落定${r.pending!.rolls!.filter(v => v.value !== undefined).length}/${r.pending!.rolls!.length}颗，等待其余骰子；资源与动作保留。`)
    } else resolve(t, action.value)
  } else if (action.type === 'cancel') {
    if (s.phase !== 'rolling') return source
    s.phase = 'turn'; s.pending = undefined; r.pending = undefined; t.objects = t.objects.filter(o => !o.metadata.rpgRollDie); message(t, '未完成的武功检定已取消，资源与动作保留。')
  } else {
    if (s.phase === 'rolling') throw new Error('请等待骰子落定。')
    const actor = t.objects.find(o => o.id === id)!
    if (action.type !== 'enemy' && (!u.roleId || actor.metadata.moveSeat && actor.metadata.moveSeat !== seat)) throw new Error('当前棋子不由此玩家控制。')
    if (action.type === 'enemy') { if (u.roleId) throw new Error('玩家回合需要自行选择行动。'); if (u.acted) nextTurn(t); else enemyPlan(t, ctx) }
    else if (action.type === 'next') nextTurn(t)
    else if (action.type === 'move') {
      const cell = rpgBattleMoveOptions(t).find(c => c.x === action.x && c.y === action.y)
      if (!cell) throw new Error('目的地被占据、超出剩余步数或本回合动作已完成。')
      u.x = action.x; u.y = action.y; u.moveSpent += cell.distance; if (!u.moved) u.stats.pp -= 2; u.moved = true; s.ap = 1; message(t, `${name(t, id)}移动到(${u.x},${u.y})；剩余${rpgMoveRange(db, u.stats) - u.moveSpent}格移动，还可执行一个动作。`)
    } else if (action.type === 'skill' || action.type === 'drone') {
      const error = rpgBattleTargetError(t, action.type, action.id, action.x, action.y); if (error) throw new Error(error); requestRoll(t, action, ctx)
    } else {
      if (u.acted) throw new Error('本回合动作已完成，请结束回合。')
      if (action.type === 'defend') { u.guarded = true; spendAction(t); message(t, `${name(t, id)}防御，受到武功伤害减半，直到下次回合。`) }
      else if (action.type === 'rest') { u.stats.pp = Math.min(u.stats.maxPP, u.stats.pp + 5); u.stats.hp = Math.min(rpgStat(db, u.stats, 'maxHP'), u.stats.hp + Math.max(1, Math.round(rpgStat(db, u.stats, 'maxHP') * .05))); u.stats.ep = Math.min(rpgStat(db, u.stats, 'maxEP'), u.stats.ep + Math.max(1, Math.round(rpgStat(db, u.stats, 'maxEP') * .05))); u.stats.hurt = Math.max(0, u.stats.hurt - 5); spendAction(t); message(t, `${name(t, id)}休息，恢复5体力、5%生命与能量，受伤值降低5。`) }
      else if (action.type === 'item') {
        const it = db.items[action.id], target = r.units[action.target]
        if (!it || !p.bag[action.id] || !target?.roleId || target.stats.hp === 0 || u.stats.pp < 10 || !(it.healHP || it.healEP || it.cure || it.fullParty)) throw new Error('请选择可用药品与存活队友。')
        const targets = it.fullParty ? Object.values(r.units).filter(v => v.roleId && v.stats.hp > 0) : [target]
        if (!it.cure && targets.every(v => (!it.healHP || v.stats.hp >= rpgStat(db, v.stats, 'maxHP')) && (!it.healEP || v.stats.ep >= rpgStat(db, v.stats, 'maxEP'))) && !it.fullParty) throw new Error('目标资源已满，药品未消耗。')
        targets.forEach(v => { v.stats.hp = Math.min(rpgStat(db, v.stats, 'maxHP'), v.stats.hp + valueOf(it.healHP, it.fullParty ? 1e6 : 0)); v.stats.ep = Math.min(rpgStat(db, v.stats, 'maxEP'), v.stats.ep + valueOf(it.healEP, it.fullParty ? 1e6 : 0)); if (it.cure) { v.stats.poison = 0; v.stats.hurt = Math.max(0, v.stats.hurt - 40) } })
        p.bag[action.id]--; if (!p.bag[action.id]) delete p.bag[action.id]; u.stats.pp -= 5; spendAction(t); message(t, `${name(t, id)}对${it.fullParty ? '全队' : name(t, action.target)}使用${it.name}。`)
      }
    }
  }
  return validateTableSession(compactRpgBattleTable(syncRpgCharacters(t)))
}
export function settleRpgBattle(table: TableSession) {
  const { r, p, db } = context(table)
  if (table.combat!.phase !== 'complete' || table.combat!.winner !== '队伍') throw new Error('胜利后才能结算战利品。')
  if (r.reward) return r.reward
  const enemies = Object.values(r.units).filter(u => u.enemyId), alive = Object.values(r.units).filter(u => u.roleId && u.stats.hp > 0)
  const exp = Math.round(enemies.reduce((n, u) => n + valueOf(db.enemies[u.enemyId!].exp) * (1 + Math.max(0, u.stats.level - valueOf(db.enemies[u.enemyId!].level, 1)) * .2), 0) * r.rewardScale)
  const money = Math.round(enemies.reduce((n, u) => n + valueOf(db.enemies[u.enemyId!].money), 0) * r.rewardScale * (p.roster.includes('luo') ? 1.3 : 1)), each = exp > 0 ? Math.max(1, Math.round(exp / Math.max(1, alive.length))) : 0
  const reward = { money, experience: each, drops: [] as string[], growth: [] as string[], rolls: [] as string[] }
  p.money = bounded(p.money + money, 0, 1e9)
  for (const u of enemies) for (const drop of db.enemies[u.enemyId!].drops ?? []) {
    const die = drop.chance >= 1 ? 1 : randomD20(table), success = die <= Math.floor(drop.chance * 20)
    if (drop.chance < 1) reward.rolls.push(`${db.items[drop.id].name}掉落 d20=${die}，需≤${Math.floor(drop.chance * 20)}`)
    if (success) { p.bag[drop.id] = Math.min(99999, (p.bag[drop.id] ?? 0) + 1); reward.drops.push(db.items[drop.id].name) }
  }
  for (const u of alive) {
    const c = u.stats; reward.growth.push(...gainRpgExperience(db, u.roleId!, c, each))
    if (c.practice) {
      const book = db.items[c.practice]; c.practiceExp += Math.round(enemies.reduce((n, e) => n + e.stats.level, 0) * 2 * (c.iq / 50) * r.rewardScale)
      if (c.practiceExp >= practiceNeed(book, c)) {
        if (typeof book.learn === 'string' && !c.magics.some(v => v.id === book.learn)) c.magics.push({ id: book.learn, lv: 1 })
        for (const [key, amount] of Object.entries(book.bonus as Record<string, number> ?? {})) if (RPG_STATS.includes(key as RpgStat)) c[key as RpgStat] = bounded(c[key as RpgStat] + amount, 0, 1e6)
        if (typeof book.changeEPT === 'number') c.ept = book.changeEPT
        c.practice = null; c.practiceExp = 0; c.hp = rpgStat(db, c, 'maxHP'); c.ep = rpgStat(db, c, 'maxEP'); reward.growth.push(`${db.roles[u.roleId!].name}修炼完成：${book.name}`)
      }
    }
  }
  r.reward = reward; syncRpgCharacters(table)
  message(table, `战利品：${money}信用点，每位存活队员${each}经验。${reward.drops.length ? `获得：${reward.drops.join('、')}。` : ''}${reward.growth.join('；')}${reward.rolls.length ? ` 掉落检定：${reward.rolls.join('；')}` : ''}`)
  return reward
}
