import fs from 'node:fs'
import { combatSymbolFaces, numericFaces, validateDiceFaces } from '../src/lib/dice.ts'
const face = (label, symbol, value, successes, effect = 'none', amount = 0, color = '#a6bbaf') => ({ label, symbol, value, successes, effect, amount, color })
const specs = [
  ['战斗符号骰', 6, '#bc9270', combatSymbolFaces(), '落空、命中、重击与防护；在武功骰组中选择成功计数。'],
  ['防护符号骰', 6, '#82b7ae', [face('空白', '·', 0, 0), face('空白', '·', 0, 0), face('格挡', '◇', 1, 1, 'shield', 8), face('格挡', '◇', 1, 1, 'shield', 8), face('坚壁', '◆', 2, 2, 'shield', 12), face('复苏', '✚', 1, 1, 'heal', 6)], '适合防护和恢复招式，可逐面修改成功数与效果。'],
  ['奥术符号骰', 8, '#9899bb', [face('失控', '×', 0, 0), face('火花', '✦', 1, 1, 'damage', 2), face('烈焰', '☀', 2, 1, 'damage', 5), face('回响', '◎', 2, 1, 'energy', 5), face('屏障', '◇', 2, 1, 'shield', 8), face('复苏', '✚', 2, 1, 'heal', 5), face('停滞', '⌛', 3, 2, 'stun', 0), face('星爆', '★', 4, 2, 'damage', 10)], '八面奥术骰，包含伤害、恢复、能量、护盾与停滞。'],
  ['旅途事件骰', 20, '#c8b48e', numericFaces(20).map((f, i) => ({ ...f, label: ['迷途','风雨','伏击','机关','追踪','密道','交易','援手','发现','抉择','营地','线索','宝藏','奇遇','祝福','盟友','突破','转机','荣耀','传说'][i], symbol: ['×','≈','⚔','◇','◎','↗','¤','✚','?','↔','⌂','!','◆','✧','☆','♡','↑','↻','✦','★'][i], successes: i >= 10 ? 1 : 0 })), '二十个不同事件面，可用作主持人的故事提示，也可加入武功骰组。'],
]
const drafts = specs.map(([name, sides, color, faces, description]) => ({ schemaVersion: 1, kind: 'dice', name, description, tags: ['骰子', '自定义骰面', '符号骰'], listed: true, template: { color, rotation: [0, 0, 0], scale: [1, 1, 1], sides, value: 0, texture: '', backTexture: '', metadata: {}, diceFaces: validateDiceFaces(faces, sides) } }))
fs.writeFileSync('server/library-dice-kit.json', JSON.stringify(drafts, null, 2))
console.log(`已生成${drafts.length}种自定义骰子模板。`)
