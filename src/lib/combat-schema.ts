import type { TableObject } from './tabletop.ts'
import { validateRpgCharacter, type RpgBattleData } from './rpg-rules.ts'
import { DICE_SIDES, validateDicePool, validatePoolRolls, validateDicePoolResult } from './dice.ts'

export interface CombatState {
  version: 1; order: string[]; turn: number; round: number; ap: number
  phase: 'turn' | 'rolling' | 'complete'; message: string; winner?: string
  pending?: { attacker: string; target: string; dieId: string; request: number; generation: number }
  rpg?: RpgBattleData
}
export function validateCombat(value: unknown, objects: TableObject[]): CombatState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('战斗存档格式错误。')
  const s = value as CombatState
  if (s.version !== 1 || !Array.isArray(s.order) || s.order.length < 2 || s.order.length > 24 || new Set(s.order).size !== s.order.length || s.order.some(id => !objects.some(o => o.id === id && o.kind === 'figurine'))) throw new Error('战斗参与者引用无效。')
  for (const [n, min, max] of [[s.turn, 0, s.order.length - 1], [s.round, 1, 9999], [s.ap, 0, 2]]) if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error('战斗回合数据无效。')
  if (!['turn', 'rolling', 'complete'].includes(s.phase) || typeof s.message !== 'string' || s.message.length > 1000) throw new Error('战斗阶段无效。')
  for (const id of s.order) {
    const m = objects.find(o => o.id === id)!.metadata
    if (typeof m.team !== 'string' || !m.team.trim() || m.team.length > 48 || !Number.isSafeInteger(m.hp) || Number(m.hp) < 0 || Number(m.hp) > Number(m.vitality) || !Number.isSafeInteger(m.vitality) || Number(m.vitality) < 1 || Number(m.vitality) > (s.rpg ? 1e6 : 999) || !Number.isSafeInteger(m.focus) || Number(m.focus) < 0 || Number(m.focus) > 3) throw new Error('战斗角色状态无效。')
  }
  if ((s.phase === 'rolling') !== !!s.pending) throw new Error('战斗检定记录与阶段不一致。')
  if (s.pending) {
    const p = s.pending
    if (p.attacker !== s.order[s.turn] || !s.order.includes(p.target) || !s.rpg && p.attacker === p.target || !objects.some(o => o.id === p.dieId && o.kind === 'dice' && (s.rpg?.pending?.rolls ? (DICE_SIDES as readonly number[]).includes(o.sides) : o.sides === 20 && !o.diceFaces) && !o.locked) || !Number.isSafeInteger(p.request) || p.request < 1 || !Number.isSafeInteger(p.generation) || p.generation < 0) throw new Error('待决攻击引用无效。')
    if (s.ap < 1 || !s.rpg && objects.find(o => o.id === p.target)!.metadata.team === objects.find(o => o.id === p.attacker)!.metadata.team) throw new Error('待决攻击目标无效。')
  }
  if (s.winner !== undefined && (typeof s.winner !== 'string' || s.winner.length > 48 || s.phase !== 'complete')) throw new Error('战斗胜负数据无效。')
  const alive = [...new Set(s.order.map(id => objects.find(o => o.id === id)!).filter(o => Number(o.metadata.hp) > 0).map(o => String(o.metadata.team)))]
  if (s.phase === 'complete' && (alive.length > 1 || s.winner !== (alive[0] ?? '无人'))) throw new Error('战斗胜负与角色生命不一致。')
  if (s.phase !== 'complete' && alive.length < 2) throw new Error('战斗已经满足结束条件。')
  if (s.rpg) {
    const r = s.rpg
    if (r.version !== 1 || r.ruleset !== 'bear-tabletop' || r.size !== 15 || !r.units || Object.keys(r.units).length !== s.order.length || Object.keys(r.units).some(id => !s.order.includes(id)) || !Number.isSafeInteger(r.seed) || r.seed < 0 || r.seed > 0xffffffff || !Number.isFinite(r.rewardScale) || r.rewardScale < 0 || r.rewardScale > 10) throw new Error('跑团战斗规则数据无效。')
    const cells = new Set<string>()
    for (const id of s.order) {
      const u = r.units[id]; u.stats = validateRpgCharacter(u.stats)
      if (!Number.isInteger(u.moveSpent) || u.moveSpent < 0 || u.moveSpent > 6) throw new Error('本回合已用移动格数无效。')
      if (!Number.isInteger(u.x) || !Number.isInteger(u.y) || u.x < 0 || u.y < 0 || u.x >= 15 || u.y >= 15 || typeof u.moved !== 'boolean' || typeof u.acted !== 'boolean' || typeof u.guarded !== 'boolean' || !Number.isInteger(u.stun) || u.stun < 0 || u.stun > 10 || !Number.isFinite(u.shield) || u.shield < 0 || u.shield > 1e6 || !Number.isInteger(u.shieldTurns) || u.shieldTurns < 0 || u.shieldTurns > 10 || Boolean(u.roleId) === Boolean(u.enemyId) || objects.find(o => o.id === id)!.metadata.hp !== u.stats.hp) throw new Error('跑团战斗棋子状态无效。')
      const xy = `${u.x},${u.y}`; if (u.stats.hp > 0 && cells.has(xy)) throw new Error('存活棋子不能占据同一格。'); if (u.stats.hp > 0) cells.add(xy)
    }
    if ((s.phase === 'rolling') !== !!r.pending) throw new Error('武功检定与战斗阶段不一致。')
    if (r.pending && (!['skill', 'drone'].includes(r.pending.kind) || typeof r.pending.id !== 'string' || !Number.isInteger(r.pending.x) || !Number.isInteger(r.pending.y) || r.pending.x < 0 || r.pending.y < 0 || r.pending.x >= 15 || r.pending.y >= 15)) throw new Error('武功目标数据无效。')
    if (r.pending) {
      if (Boolean(r.pending.pool) !== Boolean(r.pending.rolls)) throw new Error('武功骰组缺少配置或待决骰子。')
      if (r.pending.pool) {
        r.pending.pool = validateDicePool(r.pending.pool); r.pending.rolls = validatePoolRolls(r.pending.rolls, r.pending.pool)
        if (s.pending?.dieId !== r.pending.rolls[0].dieId || r.pending.rolls.every(v => v.value !== undefined)) throw new Error('武功骰组阶段无效。')
        for (const roll of r.pending.rolls) {
          const die = objects.find(o => o.id === roll.dieId && o.kind === 'dice' && !o.locked)
          if (!die || die.sides !== roll.sides || !die.scale.every(n => n === die.scale[0]) || JSON.stringify(die.diceFaces) !== JSON.stringify(roll.faces) || roll.value !== undefined && die.value !== roll.value) throw new Error('本次物理骰子与规则记录不一致。')
        }
      }
    }
    if (r.lastRoll !== undefined) r.lastRoll = validateDicePoolResult(r.lastRoll)
    if (r.reward) {
      if (s.phase !== 'complete' || s.winner !== '队伍' || !Number.isSafeInteger(r.reward.money) || r.reward.money < 0 || r.reward.money > 1e9 || !Number.isSafeInteger(r.reward.experience) || r.reward.experience < 0 || r.reward.experience > 1e9) throw new Error('遭遇奖励记录无效。')
      for (const rows of [r.reward.drops, r.reward.growth, r.reward.rolls]) if (!Array.isArray(rows) || rows.length > 512 || rows.some(v => typeof v !== 'string' || v.length > 1000)) throw new Error('遭遇奖励明细无效。')
    }
  }
  return { version: 1, order: [...s.order], turn: s.turn, round: s.round, ap: s.ap, phase: s.phase, message: s.message, ...(s.pending ? { pending: { ...s.pending } } : {}), ...(s.winner ? { winner: s.winner } : {}), ...(s.rpg ? { rpg: structuredClone(s.rpg) } : {}) }
}
