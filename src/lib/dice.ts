export const DICE_SIDES = [4, 6, 8, 10, 12, 20] as const
export const MAX_POOL_DICE = 20
export const FACE_EFFECTS = { none: '无', damage: '附加伤害', heal: '自身恢复生命', shield: '自身护盾', energy: '自身恢复能量', stun: '目标停滞' } as const
export interface DiceFace { label: string; symbol: string; value: number; successes: number; effect: keyof typeof FACE_EFFECTS; amount: number; color?: string }
export interface PoolDie { sides: number; count: number; name?: string; color?: string; faces?: DiceFace[] }
export interface DicePool { dice: PoolDie[]; mode: 'power' | 'sum' | 'success'; modifier: number; multiplier: number; successTarget: number }
export interface PoolRoll { dieId: string; sides: number; name?: string; faces?: DiceFace[]; value?: number }
export interface DicePoolResult {
  mode: DicePool['mode']; total: number; successes: number; effectiveD20: number; bonus: number; missed: boolean
  effects: Record<keyof typeof FACE_EFFECTS, number>
  faces: { dieId: string; sides: number; face: number; label: string; symbol: string; value: number; successes: number }[]
}
function object(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) throw new Error('骰子配置需为数据对象。'); return v as Record<string, unknown> }
function number(v: unknown, label: string, min: number, max: number) { if (!Number.isSafeInteger(v) || Number(v) < min || Number(v) > max) throw new Error(`${label}需为${min}至${max}的整数。`); return Number(v) }
function text(v: unknown, label: string, max: number) { if (typeof v !== 'string' || v.length > max || /[\x00-\x1f]/.test(v)) throw new Error(`${label}最多${max}字符。`); return v }
export function validateDiceFaces(value: unknown, sides: number): DiceFace[] {
  if (!(DICE_SIDES as readonly number[]).includes(sides) || !Array.isArray(value) || value.length !== sides) throw new Error('自定义骰面需与 d4、d6、d8、d10、d12、d20 的面数一致。')
  return value.map(raw => {
    const f = object(raw), effect = f.effect ?? 'none'
    if (!Object.hasOwn(FACE_EFFECTS, String(effect))) throw new Error('骰面效果无效。')
    if (f.color !== undefined && (typeof f.color !== 'string' || !/^#[a-f0-9]{6}$/i.test(f.color))) throw new Error('骰面颜色需为六位色值。')
    return { label: text(f.label ?? '', '骰面名称', 24), symbol: text(f.symbol ?? '', '骰面符号', 8), value: number(f.value, '骰面数值', 0, 10000), successes: number(f.successes ?? 0, '骰面成功数', 0, 10), effect: effect as DiceFace['effect'], amount: number(f.amount ?? 0, '骰面效果值', 0, 10000), ...(f.color ? { color: f.color as string } : {}) }
  })
}
export function validateDicePool(value: unknown): DicePool {
  const p = object(value)
  if (!['power', 'sum', 'success'].includes(String(p.mode)) || !Array.isArray(p.dice) || !p.dice.length || p.dice.length > 8) throw new Error('骰组需要1至8种骰子与有效结算方式。')
  const dice: PoolDie[] = p.dice.map(raw => {
    const d = object(raw), sides = number(d.sides, '骰型', 4, 20)
    if (!(DICE_SIDES as readonly number[]).includes(sides)) throw new Error('骰组支持 d4、d6、d8、d10、d12、d20。')
    if (d.color !== undefined && (typeof d.color !== 'string' || !/^#[a-f0-9]{6}$/i.test(d.color))) throw new Error('骰子颜色无效。')
    return { sides, count: number(d.count, '骰子数量', 1, MAX_POOL_DICE), ...(d.name ? { name: text(d.name, '骰子名称', 48) } : {}), ...(d.color ? { color: d.color as string } : {}), ...(d.faces !== undefined ? { faces: validateDiceFaces(d.faces, sides) } : {}) }
  })
  if (dice.reduce((n, d) => n + d.count, 0) > MAX_POOL_DICE) throw new Error('每次最多同时投20颗骰子。')
  return { dice, mode: p.mode as DicePool['mode'], modifier: number(p.modifier ?? 0, '骰组修正', -10000, 10000), multiplier: number(p.multiplier ?? 1, '骰组倍率', 1, 100), successTarget: number(p.successTarget ?? 4, '普通骰成功门槛', 1, 20) }
}
export function numericFaces(sides: number): DiceFace[] { return Array.from({ length: sides }, (_, i) => ({ label: String(i + 1), symbol: '', value: i + 1, successes: 0, effect: 'none', amount: 0 })) }
export function combatSymbolFaces(): DiceFace[] {
  return [
    { label: '落空', symbol: '×', value: 0, successes: 0, effect: 'none', amount: 0, color: '#727976' },
    { label: '落空', symbol: '×', value: 0, successes: 0, effect: 'none', amount: 0, color: '#727976' },
    { label: '命中', symbol: '⚔', value: 1, successes: 1, effect: 'none', amount: 0, color: '#d0b984' },
    { label: '命中', symbol: '⚔', value: 1, successes: 1, effect: 'none', amount: 0, color: '#d0b984' },
    { label: '重击', symbol: '✦', value: 2, successes: 2, effect: 'damage', amount: 5, color: '#dc9775' },
    { label: '防护', symbol: '◇', value: 1, successes: 1, effect: 'shield', amount: 8, color: '#81b9ae' },
  ]
}
export const defaultDicePool = (school = 0): DicePool => ({ dice: [{ count: school === 2 ? 3 : 2, sides: [6, 8, 6, 10, 12, 6][school] ?? 6 }], mode: 'power', modifier: 0, multiplier: 1, successTarget: 4 })
export const dicePoolLabel = (p: DicePool) => p.dice.map(d => `${d.count}×${d.name || (d.faces ? `符号d${d.sides}` : `d${d.sides}`)}`).join(' + ')
export function diceFaceLabel(d: { sides: number; faces?: DiceFace[] }, face: number) { const f = d.faces?.[face - 1]; return f ? `${f.symbol ? `${f.symbol} ` : ''}${f.label || f.value}` : String(face) }
export function resolveDicePool(pool: DicePool, rolls: PoolRoll[]): DicePoolResult {
  const expected = pool.dice.flatMap(d => Array.from({ length: d.count }, () => d))
  if (rolls.length !== expected.length || rolls.some((r, i) => r.sides !== expected[i].sides || !Number.isInteger(r.value) || r.value! < 1 || r.value! > r.sides)) throw new Error('需要整组真实骰子全部落定后结算。')
  const effects: DicePoolResult['effects'] = { none: 0, damage: 0, heal: 0, shield: 0, energy: 0, stun: 0 }
  let total = 0, successes = 0, normalized = 0
  const faces = rolls.map((r, i) => {
    const d = expected[i], face = r.value!, f = d.faces?.[face - 1], value = f?.value ?? face, success = f ? f.successes : Number(face >= pool.successTarget)
    total += value; successes += success
    const min = d.faces ? Math.min(...d.faces.map(f => f.value)) : 1, max = d.faces ? Math.max(...d.faces.map(f => f.value)) : d.sides
    normalized += max > min ? (value - min) / (max - min) : .5
    if (f && f.effect !== 'none') effects[f.effect] += f.effect === 'stun' ? 1 : f.amount
    return { dieId: r.dieId, sides: r.sides, face, label: f?.label ?? String(face), symbol: f?.symbol ?? '', value, successes: success }
  })
  const effectiveD20 = Math.max(1, Math.min(20, Math.round(1 + normalized / rolls.length * 19 + (pool.mode === 'power' ? pool.modifier : 0))))
  const bonus = pool.mode === 'sum' ? total * pool.multiplier + pool.modifier : pool.mode === 'success' ? successes * pool.multiplier + pool.modifier : 0
  return { mode: pool.mode, total, successes, effectiveD20, bonus, missed: pool.mode === 'success' && successes === 0, effects, faces }
}
export function validatePoolRolls(value: unknown, pool: DicePool): PoolRoll[] {
  const expected = pool.dice.flatMap(d => Array.from({ length: d.count }, () => d))
  if (!Array.isArray(value) || value.length !== expected.length) throw new Error('待决骰子数量与骰组不一致。')
  const rolls = value.map((raw, i) => {
    const r = object(raw), d = expected[i], dieId = text(r.dieId, '待决骰子ID', 120)
    if (!/^[a-zA-Z0-9_-]+$/.test(dieId) || r.sides !== d.sides) throw new Error('待决骰型或引用无效。')
    const faces = r.faces === undefined ? undefined : validateDiceFaces(r.faces, d.sides)
    if (JSON.stringify(faces) !== JSON.stringify(d.faces)) throw new Error('待决骰面与本次骰组不一致。')
    return { dieId, sides: d.sides, ...(faces ? { faces } : {}), ...(r.name ? { name: text(r.name, '待决骰子名称', 120) } : {}), ...(r.value === undefined ? {} : { value: number(r.value, '真实骰面', 1, d.sides) }) }
  })
  if (new Set(rolls.map(r => r.dieId)).size !== rolls.length) throw new Error('待决骰子引用重复。')
  return rolls
}
export function validateDicePoolResult(value: unknown): DicePoolResult {
  const r = object(value), effects = object(r.effects)
  if (!['power', 'sum', 'success'].includes(String(r.mode)) || typeof r.missed !== 'boolean' || !Array.isArray(r.faces) || !r.faces.length || r.faces.length > MAX_POOL_DICE) throw new Error('骰组结算记录无效。')
  const checkedEffects = Object.fromEntries(Object.keys(FACE_EFFECTS).map(k => [k, number(effects[k], '骰面效果合计', 0, 200000)])) as DicePoolResult['effects']
  const faces = r.faces.map(raw => { const f = object(raw), sides = number(f.sides, '记录骰型', 4, 20); if (!(DICE_SIDES as readonly number[]).includes(sides)) throw new Error('记录骰型无效。'); return { dieId: text(f.dieId, '记录骰子ID', 120), sides, face: number(f.face, '记录骰面', 1, sides), label: text(f.label, '记录骰面名称', 24), symbol: text(f.symbol, '记录骰面符号', 8), value: number(f.value, '记录骰面数值', 0, 10000), successes: number(f.successes, '记录成功数', 0, 10) } })
  return { mode: r.mode as DicePool['mode'], total: number(r.total, '骰组点数合计', 0, 200000), successes: number(r.successes, '骰组成功合计', 0, 200), effectiveD20: number(r.effectiveD20, '威力浮动值', 1, 20), bonus: number(r.bonus, '骰组加成', -10000, 20100000), missed: r.missed, effects: checkedEffects, faces }
}
