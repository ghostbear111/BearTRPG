import type { DiceFace } from './dice'

export const CLAW_DICE_GOLD = '#f2cc62'
export const CLAW_DICE_COLORS = { agent: '#315f33', planet: '#945020' } as const
type ClawFamily = keyof typeof CLAW_DICE_COLORS
const originalFaces = {
  scan: ['agent', '扫描', '扫'], sample: ['agent', '采样', '采'], research: ['agent', '解析', '析'],
  engineering: ['agent', '工程', '工'], breakthrough: ['agent', '突破', '突'], miss: ['agent', '未命中', '·'],
  threat: ['planet', '威胁', '胁'], anomaly: ['planet', '异常', '异'], climate: ['planet', '气候', '候'],
  life: ['planet', '生命', '命'], relic: ['planet', '遗迹', '迹'], quiet: ['planet', '寂静', '·'],
} as const

/** Legacy default colors adopt the imported skin; authored colors remain editable. */
export function diceSkinColor(color: string) {
  const hex = color.toLowerCase()
  if (['#e4ddcc', '#e1d7be', '#91b7ad', '#8f91b5', '#82b7ae', '#9899bb'].includes(hex)) return CLAW_DICE_COLORS.agent
  if (['#ae7259', '#b97253', '#b8816b', '#bc9270', '#c8b48e', '#d0b984'].includes(hex)) return CLAW_DICE_COLORS.planet
  return color
}

export function diceSkinFaceColor(base: string, face?: DiceFace) {
  const color = face?.color?.toLowerCase()
  return !color || ['#727976', '#d0b984', '#dc9775', '#81b9ae', '#a6bbaf'].includes(color) ? diceSkinColor(base) : diceSkinColor(color)
}

export function clawFaceArtwork(face?: DiceFace): string | null {
  if (!face) return null
  const entry = Object.entries(originalFaces).find(([key, [, label, glyph]]) => (face.label === label || face.label.toLowerCase() === key) && (!face.symbol || face.symbol === glyph))
  if (entry) return `${import.meta.env.BASE_URL}assets/hungry-claw/dice-faces/${entry[1][0]}/${entry[0]}.png`
  if (['落空', '空白', '未命中'].includes(face.label) && ['×', '·', '', '.'].includes(face.symbol)) return `${import.meta.env.BASE_URL}assets/hungry-claw/dice-faces/agent/miss.png`
  return null
}

export function clawSymbolFaces(family: ClawFamily): DiceFace[] {
  return Object.entries(originalFaces).filter(([, entry]) => entry[0] === family).map(([key, [, label, symbol]]) => {
    const value = ['miss', 'quiet', 'threat'].includes(key) ? 0 : ['relic', 'breakthrough'].includes(key) ? 2 : 1
    return { label, symbol, value, successes: value, effect: 'none', amount: 0, color: CLAW_DICE_COLORS[family] }
  })
}
