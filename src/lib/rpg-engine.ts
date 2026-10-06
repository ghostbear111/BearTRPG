import { addTableLog, createObject, createTableSession, validateTableSession, type TableObject, type TableSession, type Vec3 } from './tabletop.ts'
import { validateAdventureDefinition, type AdventureDefinition, type AdventureProgress, type AdventureScene } from './adventure-schema.ts'
import { RPG_OPS, rpgAt, validateRpgDatabase, type RpgCondition, type RpgDatabase, type RpgEvent, type RpgMap, type RpgOp, type RpgPath, type RpgProgress } from './rpg-schema.ts'
import { ensureRpgCharacters, settleRpgBattle, startRpgBattle, syncRpgCharacters } from './rpg-battle.ts'
import { rpgStat } from './rpg-rules.ts'
import { combatSymbolFaces, defaultDicePool } from './dice.ts'
import { manageRpgCharacter, type RpgCharacterAction } from './rpg-character-actions.ts'
import { health } from './object-play.ts'
import { movementRules, objectDimensions } from './object-movement.ts'
import { rpgWorldLayout, rpgWorldObjects } from './rpg-world.ts'

export type RpgAction = RpgCharacterAction | { type: 'next' | 'world' | 'finishBattle' } | { type: 'pick'; index: number } | { type: 'event'; kind: 'events' | 'npcs'; index: number } | { type: 'travel'; mapId: string } | { type: 'move'; x: number; y: number } | { type: 'buy' | 'use'; item: string } | { type: 'party'; role: string; active: boolean } | { type: 'resolve'; dieId: string; value: number; request: number; generation: number }
interface RollContext { request: number; generation: number }
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n))
const roleId = (id: string) => `rpg_${id}`
export const rpgSceneId = (id: string) => id === 'world' ? 'rpg-world' : `rpg-map-${id}`
export const rpgVitality = (hp: unknown) => clamp(Math.ceil(Math.sqrt(Number(hp) || 120)), 6, 36)
export function adventureFromRpg(value: unknown, source?: AdventureDefinition): AdventureDefinition {
  const db = validateRpgDatabase(value)
  const chapters = [{ id: 'rpg-chapter', title: '世界探索', summary: '坐标事件、人物对话与嵌套剧情脚本。' }]
  const base = (id: string, title: string, description: string): AdventureScene => ({ id, title, description, chapterId: chapters[0].id, gmNotes: '', goal: `探索世界，收集${db.settings?.objectiveCount ?? 12}枚${db.settings?.objectiveName ?? '星核'}。`, ending: 'none', cast: [], objects: [], choices: [] })
  const worldSize = rpgWorldLayout(db.world)
  const scenes = [{ ...base('rpg-world', '星图航线', '点击桌面星图上的地点启航。'), surface: { width: worldSize.width + 4, depth: worldSize.depth + 4 } }, ...Object.entries(db.maps).map(([id, map]) => {
    const prior = source?.scenes.find(s => s.id === rpgSceneId(id))
    const unit = map.board?.cellSize ?? 1
    return { ...base(rpgSceneId(id), map.name, db.world.locations.find(l => l.id === id)?.desc ?? ''), objects: prior?.objects ?? [], gmNotes: prior?.gmNotes ?? '', surface: { width: Math.max(8, (map.w + 4) * unit), depth: Math.max(8, (map.h + 4) * unit) }, gridSize: unit }
  }), { ...base('rpg-ending', '冒险终章', '你的选择写下了世界的未来。'), ending: 'victory' as const }]
  return validateAdventureDefinition({ schemaVersion: 1, id: source?.id ?? crypto.randomUUID(), revision: source?.revision ?? 0, title: source?.title ?? '我的桌面 RPG', summary: source?.summary ?? '使用自定义地图、棋子、角色、事件脚本和技能骰组创作自己的桌面 RPG。', world: source?.world ?? { premise: '', history: '', factions: '', tone: '开放探索与角色扮演', gmNotes: '' }, rules: { name: '坐标剧情 · 武功桌游跑团', minPlayers: 1, maxPlayers: 4, partyDefeat: false }, chapters, characters: Object.entries(db.roles).map(([id, r]) => ({ id: roleId(id), name: r.name, description: String(r.desc ?? r.title ?? ''), secret: '', role: id === 'hero' ? 'player' as const : 'npc' as const, maxHp: Math.round(Number(r.hp) || 100), color: /^#[a-f0-9]{6}$/i.test(String(r.color)) ? String(r.color) : '#7eabb2', ...(r.tabletopAppearance && typeof r.tabletopAppearance === 'object' ? { appearance: r.tabletopAppearance as TableObject } : {}) })), quests: [], variables: [], scenes, startSceneId: source && db.maps[source.startSceneId.replace('rpg-map-', '')] ? source.startSceneId : rpgSceneId(db.maps.camp ? 'camp' : Object.keys(db.maps)[0]), rpg: db, ...(source?.tavern ? { tavern: structuredClone(source.tavern) } : {}) })
}
export function blankRpgAdventure(): AdventureDefinition {
  const db: RpgDatabase = { v: 1, settings: { objectiveName: '遗物', objectiveCount: 1, initialMoney: 100 }, roles: { hero: { name: '远行者', hp: 100, desc: '你故事中的主角。' } }, enemies: { guard: { name: '遗迹守卫', hp: 36, money: 20 } }, items: { m_small: { name: '生命药剂', desc: '恢复队长生命。', healHP: 30, price: 20 } }, magics: {}, shops: { village: [{ id: 'm_small', price: 20 }] }, world: { w: 10, h: 10, locations: [{ id: 'camp', name: '旅途起点', x: 1, y: 1, desc: '一个可以扩展的坐标探索故事。' }] }, maps: { camp: { name: '旅途起点', w: 16, h: 12, tiles: Array.from({ length: 12 }, (_, y) => y === 0 || y === 11 ? '#'.repeat(16) : `#${'.'.repeat(14)}#`), entry: { x: 2, y: 9 }, board: { cellSize: 1, color: '#435b68' }, npcs: [{ name: '引路人', x: 4, y: 5, blocking: true, script: [{ op: 'if', cond: { cores: 1 }, then: [{ op: 'talk', name: '引路人', text: '你找回了遗物，旅途已经完成。' }, { op: 'ending' }], else: [{ op: 'talk', name: '引路人', text: '东侧的金色标记藏着遗物。走到旁边调查，击败守卫，然后回来找我。' }] }] }], events: [{ id: 'intro', x: 2, y: 8, trigger: 'step', once: true, script: [{ op: 'talk', text: '欢迎来到你的坐标 RPG。移动队长，先去找引路人。角色、事件与地形都可以在剧情工具改写。' }] }, { id: 'relic', x: 11, y: 5, trigger: 'interact', once: true, script: [{ op: 'talk', text: '你发现了一座遗物基座，守卫苏醒了。' }, { op: 'battle', enemies: ['guard'], onWin: [{ op: 'core', n: 1 }, { op: 'money', v: 50 }, { op: 'talk', text: '取得遗物！回去与引路人交谈，完成冒险。' }] }] }] } } }
  const d = adventureFromRpg(db); d.title = '我的坐标 RPG'; d.summary = '探索、交谈、遭遇与返回交付的完整创作示例。'; d.world.premise = '从一个小故事开始，逐步扩展自己的 RPG 世界。'; return d
}
export function tabletopTrainingAdventure(): AdventureDefinition {
  const db = structuredClone(blankRpgAdventure().rpg!)
  db.magics = {
    training_punch: { name: '基础冲拳', school: 0, ept: 2, area: 'point', dist: 1, power: 14, ep: 3, dicePool: defaultDicePool(0) },
    training_blade: { name: '拔刀斩', school: 1, ept: 2, area: 'line', dist: 3, power: 18, ep: 4, dicePool: { ...defaultDicePool(1), mode: 'sum' } },
    training_swallow: { name: '燕返', school: 1, ept: 2, area: 'cross', dist: 3, power: 32, ep: 8, dicePool: { ...defaultDicePool(1), dice: [{ count: 3, sides: 6, name: '战斗符号骰', faces: combatSymbolFaces() }], mode: 'success', multiplier: 5 } },
    training_heal: { name: '治愈之风', school: 5, ept: 2, area: 'point', dist: 4, power: 40, ep: 5, heal: true, cure: true, dicePool: { ...defaultDicePool(5), dice: [{ count: 2, sides: 10 }] } },
    training_wave: { name: '震荡冲击', school: 3, ept: 2, area: 'zone', dist: 3, power: 20, ep: 5, special: 'stun', dicePool: { ...defaultDicePool(3), dice: [{ count: 2, sides: 6 }, { count: 1, sides: 20 }], mode: 'sum' } },
  }
  db.roles.hero = { name: '岚 · 远行者', hp: 120, ep: 60, pp: 100, attack: 14, defence: 8, speed: 20, iq: 60, blade: 15, magics: ['training_blade'], growth: { hp: 20, ep: 8, attack: 2, defence: 1, speed: 1 }, brings: [{ id: 'training_sword', n: 1 }, { id: 'training_armor', n: 1 }, { id: 'training_book', n: 1 }] }
  db.roles.healer = { name: '烛 · 星术师', hp: 100, ep: 80, attack: 12, defence: 6, speed: 18, iq: 65, medicine: 15, psi: 12, magics: ['training_heal', 'training_wave'], color: '#c99475' }
  db.items.training_sword = { name: '行旅长剑', type: 1, price: 50, addAttack: 8, desc: '装备后火力增加8，替换装备时旧武器回背包。' }
  db.items.training_armor = { name: '轻甲', type: 2, price: 40, addDefence: 4, desc: '装备后装甲增加4。' }
  db.items.training_book = { name: '燕返入门秘籍', type: 5, price: 60, learn: 'training_swallow', needIQ: 40, needExp: 1, bonus: { blade: 5, attack: 2 }, desc: '演示秘籍：开始修炼后赢得一次遭遇即可学会燕返。创作者可调整修炼难度。' }
  db.items.m_ep = { name: '能量药剂', type: 3, price: 20, healEP: 35, desc: '恢复35能量。' }
  db.items.m_small.type = 3
  db.enemies.guard = { name: '试炼守卫', hp: 65, ep: 25, level: 1, attack: 10, defence: 5, speed: 12, exp: 80, money: 20, magics: ['training_punch'] }
  db.enemies.training_boss = { name: '遗物守护者', hp: 180, ep: 60, level: 3, attack: 18, defence: 10, speed: 16, exp: 180, money: 80, magics: ['training_wave', 'training_punch'], drops: [{ id: 'm_small', chance: 1 }] }
  const map = db.maps.camp
  map.name = '遗迹试炼营地'
  map.events[0].script = [{ op: 'join', role: 'healer' }, { op: 'talk', text: '欢迎参加武功跑团试炼。先在右侧「角色卡」打开共享背包，装备长剑和轻甲，并开始修炼燕返秘籍。走到金色岗哨试炼标记旁按空格进入第一场遭遇。战斗中选技能卡、点目标、预览范围，再按空格掷骰。' }]
  map.events.splice(1, 0, { id: 'training_gate', name: '岗哨试炼', x: 6, y: 7, trigger: 'interact', once: true, flag: 'training_passed', script: [{ op: 'talk', text: '试炼守卫就位！每回合先移动，再执行一个动作。箭头和WASD使用本回合的移动步数；敌方会自动行动。' }, { op: 'battle', enemies: ['guard', 'guard'], onWin: [{ op: 'heal' }, { op: 'talk', text: '岗哨试炼完成！已恢复全队资源。若你提前修炼秘籍，现在燕返已进入角色的武功卡。接下来去东侧遗物基座，挑战守护者。' }] }] })
  map.events[2].id = 'training_relic'; map.events[2].name = '遗物基座'; map.events[2].ifFlag = 'training_passed'
  map.events[2].script = [{ op: 'if', cond: { flag: 'training_passed' }, then: [{ op: 'talk', text: '遗物守护者苏醒。利用燕返的十字范围、星术师的区域攻击与治疗，赢得最后一场遭遇。' }, { op: 'battle', enemies: ['training_boss'], onWin: [{ op: 'core', n: 1 }, { op: 'talk', text: '取得遗物！返回引路人旁交付，完成这局跑团。' }] }], else: [{ op: 'talk', text: '先完成营地中部的岗哨试炼，再来挑战守护者。' }] }]
  const d = adventureFromRpg(db); d.title = '武功跑团 · 遗迹试炼'; d.summary = '两名角色、两场遭遇：装备、修炼、技能范围、治疗、敌方行动与战利品的完整教学局。'; d.world.premise = '远行者与星术师接受遗迹试炼，习得武功，找回遗物。'; return d
}
export function rpgState(table: TableSession) {
  const a = table.adventure, db = a?.definition.rpg, p = a?.progress.rpg
  if (!a || !db || !p) throw new Error('当前不是坐标事件RPG对局。')
  return { a, db, p }
}
export function rpgTile(db: RpgDatabase, p: RpgProgress, x: number, y: number): string { return p.tiles[p.mapId]?.[`${x},${y}`] ?? db.maps[p.mapId]?.tiles[y]?.[x] ?? '#' }
export function rpgPosition(map: RpgMap, x: number, y: number, height = .74): Vec3 { const unit = map.board?.cellSize ?? 1; return [(x - (map.w - 1) / 2) * unit, height, (y - (map.h - 1) / 2) * unit] }
export function rpgCoordinates(map: RpgMap, position: Vec3) { const unit = map.board?.cellSize ?? 1; return { x: Math.round(position[0] / unit + (map.w - 1) / 2), y: Math.round(position[2] / unit + (map.h - 1) / 2) } }
export function rpgEventVisible(event: RpgEvent, p: RpgProgress) { return !(event.once && p.flags[event.flag ?? '']) && (!event.ifFlag || Boolean(p.flags[event.ifFlag])) && (!event.notFlag || !p.flags[event.notFlag]) }
const blocks = (tile: string) => ['#', 'R', 'T', 'B'].includes(tile)
const activeNpcs = (map: RpgMap, p: RpgProgress) => map.npcs.map((npc, index) => ({ npc, index })).filter(({ npc }) => !npc.hideIfFlag || !p.flags[npc.hideIfFlag])
const terrainColors: Record<string, string> = { '#': '#3a4651', R: '#5e5b61', '.': '#435b68', ',': '#304452', S: '#817158', G: '#476554', K: '#527d8f', D: '#75858a', W: '#778cb0', T: '#568b9d', B: '#9b7857', X: '#549c82' }
const textures = new Map<string, string>()
function mapTexture(map: RpgMap, p: RpgProgress) {
  if (typeof document === 'undefined') return ''
  const key = JSON.stringify([map.tiles, p.tiles[p.mapId], map.board?.color])
  const prior = textures.get(key); if (prior) return prior
  const canvas = document.createElement('canvas'), unit = 28; canvas.width = map.w * unit; canvas.height = map.h * unit
  const ctx = canvas.getContext('2d'); if (!ctx) return ''
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) { const tile = p.tiles[p.mapId]?.[`${x},${y}`] ?? map.tiles[y][x]; ctx.fillStyle = tile === '.' ? map.board?.color ?? terrainColors['.'] : terrainColors[tile] ?? '#435b68'; ctx.fillRect(x * unit, y * unit, unit, unit); ctx.strokeStyle = '#ffffff12'; ctx.strokeRect(x * unit, y * unit, unit, unit); if (['X', 'W', 'T', 'B'].includes(tile)) { ctx.fillStyle = '#ececdb'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(tile, (x + .5) * unit, (y + .68) * unit) } }
  const texture = canvas.toDataURL('image/png'); textures.set(key, texture); if (textures.size > 24) textures.delete(textures.keys().next().value!); return texture
}
function partyFigure(def: AdventureDefinition, role: string, position: Vec3, hp: number, unit: number, leader: boolean): TableObject {
  const c = def.characters.find(c => c.id === roleId(role))!
  const scale = Math.min(.72, unit * .65)
  const template = c.appearance ? structuredClone(c.appearance) : createObject('figurine')
  return { ...template, id: `rpg-actor-${role}`, name: c.name, position: [position[0], .104 + .7 * scale, position[2]], locked: false, scale: [scale, scale, scale], color: c.color, metadata: { ...template.metadata, characterId: c.id, rpgRoleId: role, rpgLeader: leader, rpgGenerated: true, hp, vitality: c.maxHp, team: '队伍', moveMode: 'grid', moveRange: 4 * unit, moveStep: unit, movePathCheck: false, model: template.metadata.model ?? (role === 'lin' || role === 'su' ? 'cleric' : 'ranger') } }
}
export function rpgSceneObjects(def: AdventureDefinition, mapId: string, progress?: AdventureProgress): TableObject[] {
  const db = def.rpg!
  const map = db.maps[mapId]
  if (!map) return [...rpgWorldObjects(db, progress), ...(def.scenes.find(s => s.id === 'rpg-world')?.objects ?? []).filter(o => !o.metadata.rpgGenerated).map(o => structuredClone(o))]
  const p: RpgProgress = progress?.rpg ?? { version: 1, mapId, x: map.entry.x, y: map.entry.y, money: db.settings?.initialMoney ?? 300, morality: 0, fame: 0, cores: [], roster: ['hero'], recruited: ['hero'], bag: {}, flags: {}, tiles: {}, frames: [], music: map.music ?? 'town', message: '', steps: 0 }
  const unit = map.board?.cellSize ?? 1
  const objects: TableObject[] = [createObject('board', { id: `rpg-board-${mapId}`, name: map.name, position: [0, .05, 0], locked: true, color: map.board?.color ?? '#435b68', texture: mapTexture(map, p), metadata: { width: map.w * unit, depth: map.h * unit, height: .1, rpgGenerated: true } })]
  // Merge adjacent blocking cells into rectangles; do not create one body per tile.
  const used = new Set<string>()
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    if (used.has(`${x},${y}`) || !blocks(rpgTile(db, p, x, y))) continue
    const tile = rpgTile(db, p, x, y); let width = 1, depth = 1
    while (x + width < map.w && !used.has(`${x + width},${y}`) && rpgTile(db, p, x + width, y) === tile) width++
    while (y + depth < map.h && Array.from({ length: width }, (_, i) => `${x + i},${y + depth}`).every(key => !used.has(key) && rpgTile(db, p, Number(key.split(',')[0]), y + depth) === tile)) depth++
    for (let dy = 0; dy < depth; dy++) for (let dx = 0; dx < width; dx++) used.add(`${x + dx},${y + dy}`)
    const height = ['B', 'T'].includes(tile) ? .48 * unit : .65 * unit
    objects.push(createObject('block', { id: `rpg-terrain-${mapId}-${x}-${y}`, name: tile === 'B' ? '补给箱' : tile === 'T' ? '终端' : '地形障碍', position: rpgPosition(map, x + (width - 1) / 2, y + (depth - 1) / 2, .1 + height / 2), locked: true, color: terrainColors[tile], metadata: { width: width * unit, depth: depth * unit, height, rpgGenerated: true } }))
  }
  for (const { npc, index } of activeNpcs(map, p)) {
    const role = npc.role ? def.rpg!.roles[npc.role] : undefined, base = role?.tabletopAppearance ? structuredClone(role.tabletopAppearance as TableObject) : createObject('figurine')
    const scale = Math.min(.68, .6 * unit)
    objects.push({ ...base, id: `rpg-npc-${mapId}-${index}`, name: npc.name, position: rpgPosition(map, npc.x, npc.y, .104 + .7 * scale), scale: [scale, scale, scale], locked: true, color: role?.color ?? '#c3a179', description: '靠近后交谈，剧情在中央显示。', metadata: { ...base.metadata, rpgNpc: index, ...(role ? { rpgNpcRoleId: npc.role!, characterId: `rpg_${npc.role}` } : {}), rpgGenerated: true, model: base.metadata.model ?? 'ranger', team: '中立', vitality: 6 } })
  }
  map.events.forEach((event, index) => { if (rpgEventVisible(event, p)) objects.push(createObject('token', { id: `rpg-event-${mapId}-${event.id}`, name: event.name ?? (event.id === 'camp_intro' ? '启程事件' : `${event.trigger === 'step' ? '经过剧情' : '交互标记'} ${index + 1}`), position: rpgPosition(map, event.x, event.y, .145), scale: [unit * .48, .3, unit * .48], locked: true, color: event.trigger === 'step' ? '#729db9' : '#cfaa70', metadata: { rpgEvent: index, rpgGenerated: true, symbol: event.trigger === 'step' ? '◆' : '!', moveMode: 'fixed' } })) })
  const occupied = new Set(activeNpcs(map, p).map(({ npc }) => `${npc.x},${npc.y}`))
  p.roster.forEach((role, index) => {
    let x = p.x, y = p.y
    if (index) { const cell = Array.from({ length: 25 }, (_, i) => ({ x: p.x + (i % 5) - 2, y: p.y + Math.floor(i / 5) - 2 })).find(c => c.x > 0 && c.y > 0 && c.x < map.w - 1 && c.y < map.h - 1 && !occupied.has(`${c.x},${c.y}`) && !blocks(rpgTile(db, p, c.x, c.y))); if (cell) { x = cell.x; y = cell.y } }
    occupied.add(`${x},${y}`)
    objects.push(partyFigure(def, role, rpgPosition(map, x, y), progress?.hp[roleId(role)] ?? def.characters.find(c => c.id === roleId(role))!.maxHp, unit, index === 0))
  })
  const authored = def.scenes.find(s => s.id === rpgSceneId(mapId))?.objects ?? []
  const states = progress?.sceneStates?.[rpgSceneId(mapId)] ?? {}
  objects.push(...authored.filter(o => !o.metadata.rpgGenerated && !states[o.id]?.taken).map(o => ({ ...structuredClone(o), metadata: { ...o.metadata, adventureObjectId: o.id, ...states[o.id] } })))
  objects.push(createObject('dice', { id: 'rpg-d20', name: 'RPG检定 d20', sides: 20, position: [Math.min(38, map.w * unit / 2 + .5), .7, 0], metadata: { adventureDie: true, rpgGenerated: true } }))
  if (objects.length > 200) throw new Error(`「${map.name}」合并地形后仍超过200物件，请简化布局。`)
  return objects
}
function rebuild(table: TableSession): TableSession { const { a, db, p } = rpgState(table); const map = db.maps[p.mapId]; const scene = a.definition.scenes.find(s => s.id === rpgSceneId(p.mapId)); const world = rpgWorldLayout(db.world); const surface = p.mapId === 'world' ? { width: Math.max(scene?.surface?.width ?? 0, world.width + 4), depth: Math.max(scene?.surface?.depth ?? 0, world.depth + 4) } : scene?.surface ?? { width: 30, depth: 22 }; const next = { ...table, surface, grid: { enabled: Boolean(map), snap: true, size: map?.board?.cellSize ?? 1 }, objects: [...rpgSceneObjects(a.definition, p.mapId, a.progress), ...table.objects.filter(o => ['inventory', 'hand'].includes(String(o.metadata.zone)))] }; return p.characters ? syncRpgCharacters(next) : next }
function message(table: TableSession, text: string) { const { a, p } = rpgState(table); p.message = text.trim().slice(0, 2000) || '…'; a.progress.lastMessage = p.message; a.progress.journal = [...a.progress.journal.slice(-499), { id: crypto.randomUUID(), sceneId: a.progress.sceneId, text: p.message, time: Date.now() }] }
function finish(table: TableSession) { return validateTableSession(addTableLog(table, table.adventure!.progress.lastMessage.slice(0, 1000) || 'RPG行动已完成。')) }
function condition(c: RpgCondition, p: RpgProgress): boolean { return (!c.flag || Boolean(p.flags[c.flag])) && (!c.flagNot || !p.flags[c.flagNot]) && (!c.has || (p.bag[c.has] ?? 0) > 0) && (c.cores === undefined || p.cores.length >= c.cores) && (c.morality === undefined || p.morality >= c.morality) && (c.moralityBelow === undefined || p.morality < c.moralityBelow) && (c.moralityAtMost === undefined || p.morality <= c.moralityAtMost) && (c.moneyAtLeast === undefined || p.money >= c.moneyAtLeast) && (!c.inParty || p.roster.includes(c.inParty)) && (!c.notInParty || !p.roster.includes(c.notInParty)) }
function addItem(p: RpgProgress, item: string, count: number) { const n = clamp((p.bag[item] ?? 0) + count, 0, 99999); if (n) p.bag[item] = n; else delete p.bag[item] }
function drain(source: TableSession, ctx: RollContext): TableSession {
  let table = source
  let { a, db, p } = rpgState(table)
  let executed = 0
  while (p.frames.length && !p.pending && a.progress.phase !== 'complete') {
    if (++executed > 512) throw new Error('本次连续剧情指令过多，请增加对话或玩家选择。')
    const frame = p.frames.at(-1)!, script = rpgAt(db, frame.path) as RpgOp[]
    if (frame.index >= script.length) { p.frames.pop(); continue }
    const path: RpgPath = [...frame.path, frame.index++], op = rpgAt(db, path) as RpgOp
    p.steps++
    if (['talk', 'choice', 'shop', 'battle'].includes(op.op)) {
      p.pending = { type: op.op as 'talk' | 'choice' | 'shop' | 'battle', path }
      if (op.op === 'talk') message(table, `${op.name ? `${op.name}：` : ''}${op.text ?? ''}`)
      else message(table, op.text || op.title || `${RPG_OPS[op.op]}。`)
      if (op.op === 'battle') { table = startRpgBattle(table, op); ({ a, db, p } = rpgState(table)) }
      break
    }
    if (op.op === 'if') {
      if (condition(op.cond ?? {}, p) && op.cond?.rnd !== undefined && op.cond.rnd > 0 && op.cond.rnd < 1) {
        p.pending = { type: 'roll', path, dieId: 'rpg-d20', request: ctx.request, generation: ctx.generation }; a.progress.phase = 'rolling'
        table.objects = table.objects.map(o => o.id === 'rpg-d20' ? { ...o, value: 0 } : o)
        message(table, `概率条件使用真实d20：结果≤${Math.floor(op.cond.rnd * 20)}进入满足分支。`); break
      }
      p.frames.push({ path: [...path, condition(op.cond ?? {}, p) && op.cond?.rnd !== 0 ? 'then' : 'else'], index: 0 })
    } else if (op.op === 'get' || op.op === 'loseItem') { addItem(p, op.item!, op.op === 'get' ? op.n ?? 1 : -1); message(table, `${op.op === 'get' ? '获得' : '失去'}${db.items[op.item!].name}。`) }
    else if (op.op === 'money') p.money = clamp(p.money + (op.v ?? 0), 0, 1_000_000_000)
    else if (op.op === 'morality') p.morality = clamp(p.morality + (op.v ?? 0), -100, 100)
    else if (op.op === 'fame') p.fame = clamp(p.fame + (op.v ?? 0), 0, 1_000_000_000)
    else if (op.op === 'flag') { p.flags[op.name!] = op.v ?? 1; table = rebuild(table); ({ a, db, p } = rpgState(table)) }
    else if (op.op === 'core') { if (!p.cores.includes(op.n!)) p.cores.push(op.n!); message(table, `已收集第${op.n}枚${db.settings?.objectiveName ?? '星核'}，进度${p.cores.length}/${db.settings?.objectiveCount ?? 12}。`) }
    else if (op.op === 'join') {
      if (!p.recruited.includes(op.role!)) { p.recruited.push(op.role!); for (const item of db.roles[op.role!].brings ?? []) addItem(p, item.id, item.n || 1) }
      if (!p.roster.includes(op.role!) && p.roster.length < 6) p.roster.push(op.role!)
      message(table, `${db.roles[op.role!].name}已加入名册。`); table = rebuild(table); ({ a, db, p } = rpgState(table))
    } else if (op.op === 'leave') { if (op.role !== 'hero') p.roster = p.roster.filter(role => role !== op.role); table = rebuild(table); ({ a, db, p } = rpgState(table)) }
    else if (op.op === 'heal') { for (const role of p.roster) { const c = p.characters![role]; c.hp = rpgStat(db, c, 'maxHP'); c.ep = rpgStat(db, c, 'maxEP'); c.pp = c.maxPP; c.poison = 0; c.hurt = 0; } table = rebuild(table); ({ a, db, p } = rpgState(table)) }
    else if (op.op === 'setTile') { (p.tiles[p.mapId] ??= {})[`${op.x},${op.y}`] = op.ch!; table = rebuild(table); ({ a, db, p } = rpgState(table)) }
    else if (op.op === 'music') p.music = op.m ?? ''
    else if (op.op === 'sfx') p.sound = { name: op.name ?? '', sequence: (p.sound?.sequence ?? 0) + 1 }
    else if (op.op === 'ending') { a.progress.sceneId = 'rpg-ending'; a.progress.visited = [...new Set([...a.progress.visited, 'rpg-ending'])]; a.progress.phase = 'complete'; a.progress.outcome = 'won'; p.frames = []; message(table, `冒险完成。收集${p.cores.length}/${db.settings?.objectiveCount ?? 12}枚${db.settings?.objectiveName ?? '星核'}；结局记录保留在冒险纪事中。`) }
  }
  if (!p.frames.length && !p.pending && a.progress.phase !== 'complete') message(table, '剧情已结束。继续移动、交谈或查看星图。')
  return table
}
export function startRpgAdventure(def: AdventureDefinition): TableSession {
  const definition = adventureFromRpg(def.rpg, def), db = definition.rpg!
  const mapId = definition.startSceneId.replace('rpg-map-', ''), map = db.maps[mapId]
  if (!map) throw new Error('RPG开场地图不存在。')
  const progress: AdventureProgress = { version: 1, sceneId: rpgSceneId(mapId), phase: 'scene', visited: [rpgSceneId(mapId)], hp: Object.fromEntries(definition.characters.map(c => [c.id, c.maxHp])), quests: {}, variables: {}, journal: [], lastMessage: '移动队长探索场景：蓝色事件经过触发，人物与金色事件靠近后交互。', rpg: { version: 1, mapId, x: map.entry.x, y: map.entry.y, money: db.settings?.initialMoney ?? 300, morality: 0, fame: 0, cores: [], roster: ['hero'], recruited: ['hero'], bag: Object.fromEntries(['m_small', 'm_ep', 'h_frost'].filter(id => db.items[id]).map(id => [id, id === 'm_small' ? 3 : 2])), flags: {}, tiles: {}, frames: [], music: map.music ?? 'town', message: '点击队长的移动按钮，走到蓝色启程事件。', steps: 0 } }
  for (const item of db.roles.hero.brings ?? []) progress.rpg!.bag[item.id] = Math.min(99999, (progress.rpg!.bag[item.id] ?? 0) + item.n)
  return finish(rebuild(ensureRpgCharacters({ ...createTableSession('sandbox'), name: `${definition.title.slice(0, 108)} · 战役局`, adventure: { definition, progress } })))
}
export function recoverRpg(table: TableSession): TableSession {
  // Old saves contain only an empty world board. Regenerate the atlas without advancing play.
  if (table.adventure?.progress.rpg?.mapId === 'world' && !table.combat) return validateTableSession(rebuild(ensureRpgCharacters(structuredClone(table))))
  const pending = table.adventure?.progress.rpg?.pending
  if (pending?.type !== 'roll') { if (table.adventure?.progress.rpg?.characters || table.combat) return table; return finish(ensureRpgCharacters(structuredClone(table))) }
  const next = structuredClone(table), { a, p } = rpgState(next)
  p.pending = undefined; const frame = p.frames.at(-1); if (frame) frame.index = Math.max(0, frame.index - 1)
  a.progress.phase = 'scene'; message(next, '未完成的概率检定已取消，点击继续剧情重试。')
  return finish(ensureRpgCharacters(next))
}
function route(table: TableSession, targetX: number, targetY: number) {
  const { db, p } = rpgState(table), map = db.maps[p.mapId]
  if (!map) return null
  const actor = table.objects.find(o => o.metadata.rpgLeader === true)!
  const unit = map.board?.cellSize ?? 1, limit = Math.min(48, Math.floor(movementRules(actor).range / unit))
  if (Math.hypot(targetX - p.x, targetY - p.y) * unit > movementRules(actor).range + .001) return null
  const occupied = new Set(activeNpcs(map, p).map(({ npc }) => `${npc.x},${npc.y}`))
  const props = table.objects.filter(o => !o.metadata.rpgGenerated && o.kind === 'block' && !(o.metadata.model === 'door' && o.metadata.opened))
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) { const pos = rpgPosition(map, x, y); if (props.some(o => { const [w, , d] = objectDimensions(o), dx = pos[0] - o.position[0], dz = pos[2] - o.position[2], cos = Math.cos(o.rotation[1]), sin = Math.sin(o.rotation[1]); return Math.abs(dx * cos - dz * sin) < w * o.scale[0] / 2 + unit * .2 && Math.abs(dx * sin + dz * cos) < d * o.scale[2] / 2 + unit * .2 })) occupied.add(`${x},${y}`) }
  const seen = new Set([`${p.x},${p.y}`]), queue = [{ x: p.x, y: p.y, path: [] as { x: number; y: number }[] }]
  for (let n = 0; n < queue.length; n++) { const current = queue[n]; if (current.x === targetX && current.y === targetY) return current.path; if (current.path.length >= limit) continue; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = current.x + dx, y = current.y + dy, key = `${x},${y}`; if (seen.has(key) || x < 0 || y < 0 || x >= map.w || y >= map.h || occupied.has(key) || blocks(rpgTile(db, p, x, y))) continue; seen.add(key); queue.push({ x, y, path: [...current.path, { x, y }] }) } }
  return null
}
export function rpgMoveOptions(table: TableSession, seat: string) {
  const { db, p } = rpgState(table), map = db.maps[p.mapId], actor = table.objects.find(o => o.metadata.rpgLeader)
  if (!map || !actor || p.pending || p.frames.length || table.combat || table.adventure!.progress.phase !== 'scene' || health(actor, table).hp === 0 || movementRules(actor).mode === 'fixed' || movementRules(actor).seat && movementRules(actor).seat !== seat) return []
  const unit = map.board?.cellSize ?? 1, n = Math.ceil(movementRules(actor).range / unit), options: { cell: string; position: Vec3; size: number }[] = []
  for (let y = Math.max(0, p.y - n); y <= Math.min(map.h - 1, p.y + n); y++) for (let x = Math.max(0, p.x - n); x <= Math.min(map.w - 1, p.x + n); x++) if (route(table, x, y)?.length) { const pos = rpgPosition(map, x, y, .125); options.push({ cell: `${pos[0]},${pos[2]}`, position: pos, size: unit * .88 }) }
  return options
}
export function applyRpgAction(source: TableSession, action: RpgAction, ctx: RollContext = { request: 1, generation: 0 }, seat = '玩家1'): TableSession {
  let table = ensureRpgCharacters(validateTableSession(structuredClone(source)))
  let { a, db, p } = rpgState(table)
  if (a.progress.phase === 'complete') throw new Error('本局已结束。')
  if (table.combat && action.type !== 'finishBattle') throw new Error('请完成当前遭遇后继续剧情。')
  if (action.type === 'resolve') {
    const pending = p.pending
    if (pending?.type !== 'roll' || pending.dieId !== action.dieId || pending.request !== action.request || pending.generation !== action.generation) throw new Error('剧情骰点已过期。')
    if (!Number.isInteger(action.value) || action.value < 1 || action.value > 20) throw new Error('剧情骰点无效。')
    const op = rpgAt(db, pending.path) as RpgOp
    p.frames.push({ path: [...pending.path, action.value <= Math.floor(op.cond!.rnd! * 20) ? 'then' : 'else'], index: 0 }); p.pending = undefined; a.progress.phase = 'scene'
    message(table, `真实d20=${action.value}，概率条件已结算。`)
  } else if (action.type === 'finishBattle') {
    if (p.pending?.type !== 'battle' || table.combat?.phase !== 'complete') throw new Error('请先完成剧情遭遇。')
    const pending = p.pending, op = rpgAt(db, pending.path) as RpgOp
    if (table.combat.winner !== '队伍') { a.progress.phase = 'complete'; a.progress.outcome = 'lost'; p.frames = []; p.pending = undefined; message(table, '队伍在剧情遭遇中失败，本局结束。'); return finish(table) }
    if (table.combat.rpg) { const reward = settleRpgBattle(table); a.progress.journal.push({ id: crypto.randomUUID(), sceneId: a.progress.sceneId, time: Date.now(), text: `战利品：${reward.money}信用点、${reward.experience}经验。${reward.drops.join('、')} ${reward.growth.join('；')}`.slice(0, 2000) }); } else for (const id of op.enemies ?? []) { p.money = clamp(p.money + Number(db.enemies[id].money ?? 0), 0, 1e9); for (const drop of db.enemies[id].drops ?? []) if (drop.chance >= 1) addItem(p, drop.id, 1) }
    table.combat = undefined; p.pending = undefined; p.music = db.maps[p.mapId]?.music ?? 'town'; p.frames.push({ path: [...pending.path, 'onWin'], index: 0 }); table = rebuild(ensureRpgCharacters(table)); ({ a, db, p } = rpgState(table))
  } else if (action.type === 'character') {
    return finish(rebuild(manageRpgCharacter(table, action)))
  } else if (action.type === 'next') {
    if (p.pending && !['talk', 'shop'].includes(p.pending.type)) throw new Error('请完成当前选项或检定。')
    p.pending = undefined
  } else if (action.type === 'pick') {
    if (p.pending?.type !== 'choice') throw new Error('当前没有等待选择的剧情。')
    const path = p.pending.path, op = rpgAt(db, path) as RpgOp
    if (!Number.isSafeInteger(action.index) || !op.options?.[action.index]) throw new Error('选项已失效。')
    message(table, `选择「${op.options[action.index].t}」。`); p.frames.push({ path: [...path, 'options', action.index, 's'], index: 0 }); p.pending = undefined
  } else if (action.type === 'buy') {
    if (p.pending?.type !== 'shop') throw new Error('请先进入商店。')
    const op = rpgAt(db, p.pending.path) as RpgOp, row = db.shops[op.id!]?.find(r => r.id === action.item)
    if (!row) throw new Error('商品不存在。')
    const price = Math.ceil(row.price * (p.roster.includes('luo') ? .8 : 1)); if (p.money < price) throw new Error('货币不足。')
    p.money -= price; addItem(p, row.id, 1); message(table, `购买${db.items[row.id].name}，花费${price}。`); return finish(table)
  } else if (action.type === 'use') {
    return finish(rebuild(manageRpgCharacter(table, { type: 'character', role: 'hero', action: 'use', item: action.item })))
  } else if (action.type === 'party') {
    if (p.pending || p.frames.length || action.role === 'hero' || !p.recruited.includes(action.role)) throw new Error('当前不能调整该角色。')
    if (action.active && !p.roster.includes(action.role)) { if (p.roster.length >= 6) throw new Error('最多六人出场，请先让一名队友休整。'); p.roster.push(action.role) }
    if (!action.active) p.roster = p.roster.filter(id => id !== action.role)
    message(table, `${db.roles[action.role].name}${action.active ? '随队出场' : '暂时休整'}。`); return finish(rebuild(table))
  } else {
    if (p.pending || p.frames.length || a.progress.phase !== 'scene') throw new Error('请先完成当前剧情。')
    if (action.type === 'world' || action.type === 'travel') {
      if (action.type === 'travel') { if (p.mapId !== 'world' || !db.world.locations.some(l => l.id === action.mapId)) throw new Error('请从星图选择目的地。'); const map = db.maps[action.mapId]; p.mapId = action.mapId; p.x = map.entry.x; p.y = map.entry.y; p.music = map.music ?? 'town' }
      else { if (p.mapId !== 'world') p.worldFrom = p.mapId; p.mapId = 'world'; p.music = db.world.music ?? 'world' }
      a.progress.sceneId = rpgSceneId(p.mapId); a.progress.visited = [...new Set([...a.progress.visited, a.progress.sceneId])]; message(table, `进入${db.maps[p.mapId]?.name ?? '星图航线'}。`); return finish(rebuild(table))
    }
    const map = db.maps[p.mapId]; if (!map) throw new Error('请先进入地图。')
    if (action.type === 'move') {
      const actor = table.objects.find(o => o.metadata.rpgLeader)!
      if (!actor) throw new Error('队长不在当前场景。')
      const rule = movementRules(actor)
      if (!actor || rule.mode === 'fixed' || rule.seat && rule.seat !== seat || health(actor, table).hp === 0) throw new Error('当前不能移动队长。')
      if (!Number.isInteger(action.x) || !Number.isInteger(action.y)) throw new Error('请选择地图格子。')
      const path = route(table, action.x, action.y); if (!path?.length) throw new Error('路线被阻挡或超出本次步数。')
      let triggered = -1
      for (const cell of path) { p.x = cell.x; p.y = cell.y; if (rpgTile(db, p, cell.x, cell.y) === 'X') { p.worldFrom = p.mapId; p.mapId = 'world'; a.progress.sceneId = 'rpg-world'; a.progress.visited = [...new Set([...a.progress.visited, 'rpg-world'])]; p.music = db.world.music ?? 'world'; return finish(rebuild(table)) } triggered = map.events.findIndex(e => e.x === cell.x && e.y === cell.y && e.trigger === 'step' && rpgEventVisible(e, p)); if (triggered >= 0) break }
      table = rebuild(table); ({ a, db, p } = rpgState(table)); message(table, `队长移动至(${p.x},${p.y})。`)
      if (triggered >= 0) { const event = map.events[triggered]; if (event.once) p.flags[event.flag!] = 1; p.frames = [{ path: ['maps', p.mapId, 'events', triggered, 'script'], index: 0 }]; table = rebuild(table) }
    } else if (action.type === 'event') {
      const target = map[action.kind]?.[action.index]
      if (!target || !Number.isSafeInteger(action.index)) throw new Error('交互对象已失效。')
      if (Math.abs(target.x - p.x) + Math.abs(target.y - p.y) > 1) throw new Error('请移动到该对象旁边再交互。')
      if (action.kind === 'events' && !rpgEventVisible(target as RpgEvent, p)) throw new Error('该事件已完成或尚未解锁。')
      if (action.kind === 'events' && (target as RpgEvent).trigger !== 'interact') throw new Error('这是经过事件，请移动队长到该格子。')
      if (action.kind === 'npcs' && (target as RpgMap['npcs'][number]).hideIfFlag && p.flags[(target as RpgMap['npcs'][number]).hideIfFlag!]) throw new Error('NPC已离场。')
      if (action.kind === 'events') { const e = target as RpgEvent; if (e.once) p.flags[e.flag!] = 1 }
      p.frames = [{ path: ['maps', p.mapId, action.kind, action.index, 'script'], index: 0 }]; if (action.kind === 'events') table = rebuild(table)
    }
  }
  return finish(drain(table, ctx))
}
