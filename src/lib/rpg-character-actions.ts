import type { TableSession } from './tabletop.ts'
import { bounded, requirementError, rpgStat } from './rpg-rules.ts'
import { ensureRpgCharacters, syncRpgCharacters } from './rpg-battle.ts'

export interface RpgCharacterAction { type: 'character'; role: string; action: 'equip' | 'unequip' | 'practice' | 'abandon' | 'use'; item?: string; slot?: 'weapon' | 'armor' }
export function manageRpgCharacter(table: TableSession, action: RpgCharacterAction): TableSession {
  ensureRpgCharacters(table)
  const a = table.adventure!, p = a.progress.rpg!, db = a.definition.rpg!
  if (table.combat || p.pending || p.frames.length || a.progress.phase !== 'scene') throw new Error('请先完成当前剧情或遭遇。')
  const c = p.characters?.[action.role]
  if (!c || !p.recruited.includes(action.role)) throw new Error('请选择已加入队伍的角色。')
  const item = action.item ? db.items[action.item] : undefined, roleName = db.roles[action.role].name
  const put = (id: string) => { p.bag[id] = Math.min(99999, (p.bag[id] ?? 0) + 1) }
  const take = (id: string) => { if (!p.bag[id]) throw new Error('背包里没有这个物品。'); p.bag[id]--; if (!p.bag[id]) delete p.bag[id] }
  let text = ''
  if (action.action === 'unequip') {
    if (!action.slot || !c[action.slot]) throw new Error('装备槽为空。')
    const id = c[action.slot]!; put(id); c[action.slot] = null; text = `${roleName}卸下${db.items[id].name}，已放回背包。`
  } else if (action.action === 'abandon') {
    if (!c.practice) throw new Error('该角色没有正在修炼的秘籍。')
    put(c.practice); c.practice = null; c.practiceExp = 0; text = `${roleName}停止修炼，秘籍返回背包，修炼进度清零。`
  } else {
    if (!item || !action.item || !p.bag[action.item]) throw new Error('请选择背包里的有效物品。')
    if (action.action === 'equip') {
      if (![1, 2].includes(Number(item.type))) throw new Error('物品不是武器或防具。')
      const error = requirementError(db, c, item); if (error) throw new Error(error)
      const slot = item.type === 1 ? 'weapon' : 'armor'; take(action.item); if (c[slot]) put(c[slot]!); c[slot] = action.item; text = `${roleName}装备${item.name}，属性加成立即生效。`
    } else if (action.action === 'practice') {
      if (item.type !== 5) throw new Error('请选择秘籍或数据核心。')
      const error = requirementError(db, c, item); if (error) throw new Error(error)
      if (c.practice) throw new Error('请先完成或停止当前修炼。')
      if (typeof item.learn === 'string' && c.magics.some(m => m.id === item.learn)) throw new Error('该角色已掌握这门武功。')
      if (item.learn && c.magics.length >= 10) throw new Error('武功栏已满，最多10门。')
      take(action.item); c.practice = action.item; c.practiceExp = 0; text = `${roleName}开始修炼${item.name}，战胜遭遇会积累修炼经验。`
    } else if (action.action === 'use') {
      if (!(item.healHP || item.healEP || item.cure || item.fullParty)) throw new Error('物品不是可用药品。')
      const targets = item.fullParty ? p.roster.map(id => p.characters![id]) : [c]
      if (targets.some(v => v.hp === 0) && !item.fullParty) throw new Error('倒下的角色需要剧情休整恢复。')
      if (!item.cure && !item.fullParty && targets.every(v => (!item.healHP || v.hp >= rpgStat(db, v, 'maxHP')) && (!item.healEP || v.ep >= rpgStat(db, v, 'maxEP')))) throw new Error('资源已满，药品未消耗。')
      take(action.item)
      for (const v of targets) { v.hp = Math.min(rpgStat(db, v, 'maxHP'), v.hp + Number(item.healHP ?? (item.fullParty ? 1e6 : 0))); v.ep = Math.min(rpgStat(db, v, 'maxEP'), v.ep + Number(item.healEP ?? (item.fullParty ? 1e6 : 0))); if (item.cure) { v.poison = 0; v.hurt = Math.max(0, v.hurt - 40) } }
      text = `${item.fullParty ? '全队' : roleName}使用${item.name}。`
    }
  }
  c.hp = Math.round(bounded(c.hp, 0, rpgStat(db, c, 'maxHP'))); c.ep = Math.round(bounded(c.ep, 0, rpgStat(db, c, 'maxEP')))
  p.message = text; a.progress.lastMessage = text
  a.progress.journal = [...a.progress.journal.slice(-499), { id: crypto.randomUUID(), sceneId: a.progress.sceneId, time: Date.now(), text }]
  return syncRpgCharacters(table)
}
