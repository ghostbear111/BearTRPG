import { addTableLog, createObject, drawCard, duplicateObject, updateObject, validateTableSession, type TableObject, type TableSession } from './tabletop.ts'
import { rpgStat } from './rpg-rules.ts'

const stateKeys = ['opened', 'lit', 'activated', 'emptied', 'taken'] as const
export type Interaction = 'open' | 'light' | 'switch' | 'loot' | 'collect' | 'drop' | 'use' | 'equip' | 'transfer'
export function health(object: TableObject, table: TableSession) {
  object = table.objects.find(o => o.id === object.id) ?? object
  const db = table.adventure?.definition.rpg
  const native = table.combat?.rpg?.units[object.id]?.stats ?? table.adventure?.progress.rpg?.characters?.[String(object.metadata.rpgRoleId)]
  if (db && native) return { max: rpgStat(db, native, 'maxHP'), hp: native.hp }
  const character = table.adventure?.definition.characters.find(c => c.id === object.metadata.characterId)
  const max = character?.maxHp ?? Math.max(1, Math.min(999, Math.trunc(Number(object.metadata.vitality) || 6)))
  return { max, hp: character ? table.adventure!.progress.hp[character.id] : Math.max(0, Math.min(max, Math.trunc(Number(object.metadata.hp ?? object.metadata.vitality ?? 6)))) }
}
/** One health writer serves items, manual records and tactical encounters. */
export function changeHealth(table: TableSession, id: string, delta: number): TableSession {
  if (!Number.isSafeInteger(delta) || Math.abs(delta) > 999) throw new Error('生命变化无效。')
  const actor = table.objects.find(o => o.id === id && o.kind === 'figurine'); if (!actor) throw new Error('请选择一个角色。')
  const old = health(actor, table); const hp = Math.max(0, Math.min(old.max, old.hp + delta))
  let next = updateObject(table, id, { metadata: { ...actor.metadata, vitality: old.max, hp } })
  if (table.adventure?.progress.rpg?.characters && (actor.metadata.rpgRoleId || table.combat?.rpg?.units[id])) {
    next = structuredClone(next)
    const unit = next.combat?.rpg?.units[id], role = String(actor.metadata.rpgRoleId ?? '')
    if (unit) unit.stats.hp = hp
    if (role && next.adventure!.progress.rpg!.characters![role]) { next.adventure!.progress.rpg!.characters![role].hp = hp; next.adventure!.progress.hp[`rpg_${role}`] = hp }
    return next
  }
  const a = next.adventure; const charId = String(actor.metadata.characterId ?? '')
  if (a && a.definition.characters.some(c => c.id === charId)) {
    const character = a.definition.characters.find(c => c.id === charId)!
    next = updateObject(next, id, { description: `${character.description}\n当前生命：${hp}/${character.maxHp}` })
    const progress = { ...a.progress, hp: { ...a.progress.hp, [charId]: hp } }
    if (a.definition.rules.partyDefeat && a.definition.characters.filter(c => c.role === 'player').every(c => progress.hp[c.id] === 0)) Object.assign(progress, { phase: 'complete', pending: undefined, result: undefined, outcome: 'lost', lastMessage: '全队生命归零，本次战役结束。' })
    next = { ...next, adventure: { ...a, progress } }
  }
  return next
}
function remember(table: TableSession, object: TableObject, changes: TableObject['metadata']) {
  if (!table.adventure || !object.metadata.adventureObjectId) return table
  const a = table.adventure, sceneId = a.progress.sceneId, source = String(object.metadata.adventureObjectId)
  const states = a.progress.sceneStates ?? {}, scene = states[sceneId] ?? {}, prior = scene[source] ?? {}
  const flags = Object.fromEntries(stateKeys.filter(k => typeof changes[k] === 'boolean').map(k => [k, changes[k]])) as Record<string, boolean>
  return { ...table, adventure: { ...a, progress: { ...a.progress, sceneStates: { ...states, [sceneId]: { ...scene, [source]: { ...prior, ...flags } } } } } }
}
function metadata(table: TableSession, object: TableObject, changes: TableObject['metadata']) { return remember(updateObject(table, object.id, { metadata: { ...object.metadata, ...changes } }), object, changes) }
export function interact(table: TableSession, id: string, action: Interaction, owner = '玩家1', targetId = ''): TableSession {
  if (table.adventure?.progress.phase === 'rolling' || table.combat?.phase === 'rolling') throw new Error('请等待当前检定完成。')
  if (table.combat?.rpg && ['use', 'equip'].includes(action)) throw new Error('武功遭遇请通过行动栏使用物品；装备在遭遇外的角色卡调整。')
  const object = table.objects.find(o => o.id === id); if (!object) throw new Error('物件已不存在。')
  if (!['玩家1', '玩家2', '玩家3', '玩家4'].includes(owner)) throw new Error('玩家座位无效。')
  let next = table, message = ''
  if (['open', 'light', 'switch'].includes(action)) {
    if (object.metadata.behavior !== action) throw new Error('物件未配置这个行为。')
    const key = action === 'open' ? 'opened' : action === 'light' ? 'lit' : 'activated'
    const value = !object.metadata[key]; next = metadata(next, object, { [key]: value })
    if (action === 'switch' && object.metadata.linkTag) for (const linked of table.objects.filter(o => o.id !== id && o.metadata.linkTag === object.metadata.linkTag && ['open', 'light'].includes(String(o.metadata.behavior)))) next = metadata(next, linked, { [linked.metadata.behavior === 'open' ? 'opened' : 'lit']: value })
    message = `${object.name}：${action === 'open' ? value ? '已开启' : '已关闭' : action === 'light' ? value ? '已点燃' : '已熄灭' : value ? '已启动联动' : '已关闭联动'}`
  } else if (action === 'loot') {
    if (!object.metadata.lootName || !object.metadata.opened || object.metadata.emptied) throw new Error('请先打开一个尚未取物的宝箱。')
    const heal = Math.max(0, Math.min(99, Math.trunc(Number(object.metadata.lootHeal) || 0)))
    const item = createObject('card', { name: String(object.metadata.lootName).slice(0, 120), description: String(object.metadata.lootDescription ?? ''), color: '#ba9b66', position: [object.position[0], .2, Math.min(9, object.position[2] + 1.2)], metadata: { item: true, heal, consumable: heal > 0, sourceContainerId: object.id } })
    next = metadata(next, object, { emptied: true }); next = { ...next, objects: [...next.objects, item] }; message = `从${object.name}取出${item.name}，已放到桌面。`
  } else if (action === 'collect') {
    if (object.kind !== 'card' || !object.metadata.item || ['inventory', 'hand'].includes(String(object.metadata.zone))) throw new Error('请选择桌面的道具卡。')
    next = metadata(next, object, { zone: 'inventory', owner, taken: true }); message = `${owner}收集了${object.name}。`
  } else {
    if (object.metadata.zone !== 'inventory' || object.metadata.owner !== owner) throw new Error('只能操作当前玩家背包里的物品。')
    if (action === 'drop') { next = updateObject(next, id, { position: [0, .2, 3], locked: false, metadata: { ...object.metadata, zone: 'table', owner: '', equipped: false } }); message = `放回桌面：${object.name}` }
    else if (action === 'transfer') {
      if (!['玩家1', '玩家2', '玩家3', '玩家4'].includes(targetId) || targetId === owner) throw new Error('请选择其他玩家。')
      next = metadata(next, object, { owner: targetId, equipped: false }); message = `${owner}把${object.name}交给${targetId}。`
    } else if (action === 'equip') { if (!object.metadata.equippable) throw new Error('物品无法装备。'); next = metadata(next, object, { equipped: !object.metadata.equipped }); message = `${object.name}：${object.metadata.equipped ? '已卸下' : '已装备'}` }
    else if (action === 'use') {
      if (!object.metadata.consumable) throw new Error('这件物品不需要消耗，可以查看说明或交给其他玩家。')
      const heal = Number(object.metadata.heal) || 0
      if (!Number.isSafeInteger(heal) || heal < 0 || heal > 99) throw new Error('道具恢复量需为0至99的整数。')
      if (heal) {
        if (table.adventure?.progress.phase === 'complete' || table.combat?.phase === 'complete') throw new Error('本局已经结束。')
        const target = table.objects.find(o => o.id === targetId && o.kind === 'figurine'); if (!target) throw new Error('请选择恢复目标。')
        const old = health(target, table); if (old.hp >= old.max || old.hp === 0) throw new Error('目标生命已满或已倒下，药剂未消耗。')
        next = changeHealth(next, targetId, Math.trunc(heal)); message = `${owner}使用${object.name}，${target.name}恢复${health(target, next).hp - old.hp}点生命。`
      } else message = `${owner}使用了${object.name}。`
      next = { ...next, objects: next.objects.filter(o => o.id !== id) }
    } else throw new Error('行为无效。')
  }
  if (next.adventure) { const a = next.adventure; next = { ...next, adventure: { ...a, progress: { ...a.progress, journal: [...a.progress.journal.slice(-499), { id: crypto.randomUUID(), text: message, time: Date.now(), sceneId: a.progress.sceneId }] } } } }
  return validateTableSession(addTableLog(next, message))
}
export function dealCards(table: TableSession, deckId: string, count: number, owners: string[]): TableSession {
  if (![1, 2, 3, 4, 5].includes(count) || !owners.length || new Set(owners).size !== owners.length || owners.some(o => !['玩家1', '玩家2', '玩家3', '玩家4'].includes(o))) throw new Error('发牌设置无效。')
  const deck = table.objects.find(o => o.id === deckId && o.kind === 'deck'); if (!deck || deck.locked || (deck.cards?.length ?? 0) < count * owners.length) throw new Error('牌堆锁定或剩余卡牌不足。')
  let next = table
  for (let i = 0; i < count; i++) for (const owner of owners) { const before = new Set(next.objects.map(o => o.id)); next = drawCard(next, deckId); const card = next.objects.find(o => !before.has(o.id))!; next = updateObject(next, card.id, { metadata: { ...card.metadata, owner, zone: 'hand' } }) }
  return validateTableSession(addTableLog(next, `从${deck.name}向${owners.join('、')}各发${count}张牌。`))
}
export function arrangeObjects(table: TableSession, ids: string[], mode: 'row' | 'grid' | 'stack' | 'copy' | 'delete' | 'lock'): TableSession {
  const unique = [...new Set(ids)]; const selected = unique.map(id => table.objects.find(o => o.id === id)); if (!unique.length || selected.some(o => !o)) throw new Error('请选择有效物件。')
  if (table.combat && mode !== 'lock') throw new Error('请先结束并收起战斗，再调整参战物件。')
  if (mode !== 'lock' && selected.some(o => o!.locked)) throw new Error('选中物件包含锁定对象，请先解锁。')
  let next = table; const origin = selected[0]!.position
  if (mode === 'delete') next = { ...next, objects: next.objects.filter(o => !unique.includes(o.id)) }
  else for (let i = 0; i < unique.length; i++) {
    const o = selected[i]!
    if (mode === 'copy') { next = duplicateObject(next, o.id); const copy = next.objects.at(-1)!; const m = { ...copy.metadata }; for (const k of ['adventureObjectId', 'sourceContainerId', 'characterId']) delete m[k]; next = updateObject(next, copy.id, { metadata: m }) }
    else if (mode === 'lock') next = updateObject(next, o.id, { locked: !selected.every(o => o!.locked) })
    else { const pos = mode === 'row' ? [origin[0] + i * 1.6, origin[1], origin[2]] : mode === 'grid' ? [origin[0] + (i % 4) * 1.6, origin[1], origin[2] + Math.floor(i / 4) * 1.6] : [origin[0], origin[1] + i * .25, origin[2]]; next = updateObject(next, o.id, { position: pos as [number, number, number] }) }
  }
  return validateTableSession(addTableLog(next, `批量${({ row: '排列成行', grid: '网格排列', stack: '叠放', copy: '复制', delete: '删除', lock: '切换锁定' })[mode]}：${unique.length}件。`))
}
