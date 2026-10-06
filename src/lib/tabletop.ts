import { validateAdventureDefinition, validateAdventureSession, type AdventureDefinition, type AdventureSession } from './adventure-schema.ts'
import { validateCombat, type CombatState } from './combat-schema.ts'
import { validateMovementMetadata } from './object-movement.ts'
import { tableBounds, validateTableSurface, type TableSurface } from './table-surface.ts'
import { BASIC_SKILL, validateRpgCharacter, rpgStat } from './rpg-rules.ts'
import { validateDiceFaces, type DiceFace } from './dice.ts'
import { validatePresentation, type TavernPresentation } from './tavern-presentation.ts'

export type Vec3 = [number, number, number]
export type ObjectKind = 'token' | 'figurine' | 'dice' | 'card' | 'deck' | 'board' | 'block'

export interface CardData {
  id: string
  name: string
  texture: string
  backTexture: string
  description: string
}

export interface TableObject {
  id: string
  kind: ObjectKind
  name: string
  position: Vec3
  rotation: Vec3
  scale: Vec3
  color: string
  locked: boolean
  faceDown: boolean
  value: number
  sides: number
  texture: string
  backTexture: string
  description: string
  metadata: Record<string, string | number | boolean>
  cards?: CardData[]
  diceFaces?: DiceFace[]
}

export interface TableLog { id: string; text: string; time: number }

export interface TableSession {
  tavern?: TavernPresentation
  version: 1
  id: string
  name: string
  objects: TableObject[]
  notes: string
  grid: { enabled: boolean; snap: boolean; size: number }
  physics: { gravity: boolean }
  surface?: TableSurface
  logs: TableLog[]
  createdAt: number
  campaign?: { moduleId: string; name: string; lastPlayedAt: number }
  adventure?: AdventureSession
  combat?: CombatState
  workspace?: { kind: 'draft' | 'play'; sourceId?: string; definition?: AdventureDefinition; sceneId?: string; returnTo?: 'story' }
}

export const MAX_TABLE_OBJECTS = 200
export const MAX_DECK_CARDS = 512
export const MAX_TABLE_LOGS = 500
export const MAX_ASSET_LENGTH = 2_000_000
export const MAX_TABLE_BYTES = 10_000_000
export const SUPPORTED_DICE_SIDES = [4, 6, 8, 10, 12, 20] as const
export const TABLE_BOUNDS = { minX: -39, maxX: 39, minZ: -39, maxZ: 39, minY: 0, maxY: 30 } as const

const KINDS: ObjectKind[] = ['token', 'figurine', 'dice', 'card', 'deck', 'board', 'block']
const LABELS: Record<ObjectKind, string> = {
  token: '计数标记', figurine: '棋子', dice: '六面骰', card: '卡牌', deck: '牌堆', board: '桌面板', block: '场景方块',
}
const HEIGHTS: Record<ObjectKind, number> = { token: 0.12, figurine: 0.7, dice: 0.6, card: 0.08, deck: 0.18, board: 0.05, block: 0.5 }
let localId = 0
function id(): string { return globalThis.crypto?.randomUUID?.() ?? `table-${Date.now()}-${++localId}` }

function plain(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}必须是数据对象。`)
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`${label}格式不受支持。`)
  return value as Record<string, unknown>
}
function text(value: unknown, label: string, max: number, nonEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (nonEmpty && !value.trim())) throw new Error(`${label}需为${nonEmpty ? '非空' : ''}文本，最多 ${max} 个字符。`)
  return value
}
function identifier(value: unknown, label: string, max = 120): string {
  const result = text(value, label, max, true)
  if (!/^[a-zA-Z0-9_-]+$/.test(result) || ['__proto__', 'constructor', 'prototype'].includes(result)) throw new Error(`${label}格式不安全。`)
  return result
}
function number(value: unknown, label: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) throw new Error(`${label}需为 ${min} 至 ${max} 之间的${integer ? '整数' : '数值'}。`)
  return value
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label}需为布尔值。`)
  return value
}
function array(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label}需为最多 ${max} 项的列表。`)
  return value
}
function vector(value: unknown, label: string, ranges: [number, number][]): Vec3 {
  const entries = array(value, label, 3)
  if (entries.length !== 3) throw new Error(`${label}必须包含三个坐标。`)
  return entries.map((value, index) => number(value, label, ranges[index][0], ranges[index][1])) as Vec3
}

/** Image URLs are data, never executable HTML or scripts. Empty means use the built-in material. */
export function isLocalResourceUrl(value: unknown): boolean {
  return typeof value === 'string' && /^\/api\/resources\/[a-f0-9]{64}$/.test(value)
}

export function validateAssetSource(value: unknown, label = '图片资源'): string {
  const source = text(value, label, MAX_ASSET_LENGTH)
  if (!source || isLocalResourceUrl(source)) return source
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(source)
  if (match) {
    if (match[2].length % 4 !== 0) throw new Error(`${label}的图片编码不正确。`)
    let header: string
    try { header = atob(match[2].slice(0, 64)) } catch { throw new Error(`${label}的图片编码不正确。`) }
    const valid = match[1].toLowerCase() === 'png'
      ? header.startsWith('\x89PNG\r\n\x1a\n')
      : match[1].toLowerCase() === 'jpeg'
        ? header.startsWith('\xff\xd8\xff')
        : header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP'
    if (!valid) throw new Error(`${label}不是与类型一致的图片。`)
    return source
  }
  let url: URL
  try { url = new URL(source) } catch { throw new Error(`${label}需要绝对 HTTP(S) 地址或 PNG、JPEG、WebP 图片。`) }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error(`${label}仅支持不含账户凭据的 HTTP(S) 地址或图片数据。`)
  return source
}

const asset = validateAssetSource

function validateCard(value: unknown): CardData {
  const card = plain(value, '卡牌数据')
  return {
    id: identifier(card.id, '卡牌 ID'), name: text(card.name, '卡牌名称', 120, true),
    texture: asset(card.texture, '卡面图片'), backTexture: asset(card.backTexture, '卡背图片'),
    description: text(card.description, '卡牌说明', 6000),
  }
}

export function validateTableObject(value: unknown): TableObject {
  const source = plain(value, '桌面对象')
  if (!KINDS.includes(source.kind as ObjectKind)) throw new Error('桌面对象类型不受支持。')
  const kind = source.kind as ObjectKind
  const color = text(source.color, '对象颜色', 9, true)
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('对象颜色需为六位十六进制色值。')
  const rawMetadata = plain(source.metadata, '对象属性')
  const entries = Object.entries(rawMetadata)
  if (entries.length > 64) throw new Error('每个对象最多有 64 项自定义属性。')
  const metadata: TableObject['metadata'] = {}
  for (const [key, item] of entries) {
    text(key, '属性名称', 64, true)
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('自定义属性名称不安全。')
    if (typeof item === 'string') metadata[key] = text(item, '属性内容', 4000)
    else if (typeof item === 'boolean') metadata[key] = item
    else metadata[key] = number(item, '属性数值', -1_000_000_000, 1_000_000_000)
  }
  validateMovementMetadata(metadata)
  const sides = number(source.sides, '骰子面数', kind === 'dice' ? 1 : 0, 1000, true)
  const result: TableObject = {
    id: identifier(source.id, '对象 ID'), kind, name: text(source.name, '对象名称', 120, true),
    position: vector(source.position, '对象位置', [[TABLE_BOUNDS.minX, TABLE_BOUNDS.maxX], [0, 30], [TABLE_BOUNDS.minZ, TABLE_BOUNDS.maxZ]]),
    rotation: vector(source.rotation, '对象旋转', [[-100, 100], [-100, 100], [-100, 100]]),
    scale: vector(source.scale, '对象缩放', [[0.1, 8], [0.1, 8], [0.1, 8]]),
    color, locked: boolean(source.locked, '锁定状态'), faceDown: boolean(source.faceDown, '翻面状态'),
    value: number(source.value, '对象数值', kind === 'dice' ? 0 : -1_000_000_000, kind === 'dice' ? sides : 1_000_000_000, true),
    sides, texture: asset(source.texture, '对象图片'), backTexture: asset(source.backTexture, '对象背面图片'),
    description: text(source.description, '对象说明', 6000), metadata,
  }
  if (kind === 'deck') {
    result.cards = array(source.cards ?? [], '牌堆卡牌', MAX_DECK_CARDS).map(validateCard)
    if (new Set(result.cards.map((card) => card.id)).size !== result.cards.length) throw new Error('牌堆内存在重复的卡牌 ID。')
  } else if (source.cards !== undefined) throw new Error('只有牌堆可以包含 cards 列表。')
  if (source.diceFaces !== undefined) { if (kind !== 'dice') throw new Error('只有骰子可以定义骰面。'); result.diceFaces = validateDiceFaces(source.diceFaces, sides) }
  return result
}

function assertUniqueObjects(objects: TableObject[]): void {
  if (objects.length > MAX_TABLE_OBJECTS) throw new Error(`桌面最多容纳 ${MAX_TABLE_OBJECTS} 个对象。`)
  const ids = new Set<string>()
  for (const object of objects) {
    if (ids.has(object.id)) throw new Error('桌面对象或卡牌 ID 重复。')
    ids.add(object.id)
    for (const card of object.cards ?? []) {
      if (ids.has(card.id)) throw new Error('桌面对象或卡牌 ID 重复。')
      ids.add(card.id)
    }
  }
}

function assertTableBudget(session: TableSession): void {
  if (new TextEncoder().encode(JSON.stringify(session)).byteLength > MAX_TABLE_BYTES) throw new Error('桌面存档超过 10 MB，请减少图片或对象。')
}

export function validateTableSession(value: unknown): TableSession {
  const source = plain(value, '桌面存档')
  if (source.version !== 1) throw new Error('不支持此桌面存档版本。')
  const grid = plain(source.grid, '网格设置')
  const physics = plain(source.physics, '物理设置')
  const objects = array(source.objects, '桌面对象', MAX_TABLE_OBJECTS).map(validateTableObject)
  assertUniqueObjects(objects)
  const logs = array(source.logs, '桌面记录', MAX_TABLE_LOGS).map((value): TableLog => {
    const log = plain(value, '桌面记录')
    return { id: identifier(log.id, '记录 ID'), text: text(log.text, '记录内容', 1000, true), time: number(log.time, '记录时间', 0, Number.MAX_SAFE_INTEGER, true) }
  })
  if (new Set(logs.map((log) => log.id)).size !== logs.length) throw new Error('桌面记录 ID 重复。')
  const session: TableSession = {
    version: 1, id: identifier(source.id, '桌面 ID'), name: text(source.name, '桌面名称', 120, true),
    objects, notes: text(source.notes, '桌面笔记', 30000),
    grid: { enabled: boolean(grid.enabled, '网格开关'), snap: boolean(grid.snap, '网格吸附'), size: number(grid.size, '网格尺寸', 0.1, 5) },
    physics: { gravity: boolean(physics.gravity, '重力开关') }, logs,
    createdAt: number(source.createdAt, '创建时间', 0, Number.MAX_SAFE_INTEGER, true),
    ...(source.surface === undefined ? {} : { surface: validateTableSurface(source.surface) }),
    ...(source.tavern === undefined ? {} : { tavern: validatePresentation(source.tavern) }),
    ...(source.adventure === undefined ? {} : { adventure: validateAdventureSession(source.adventure) }),
    ...(source.combat === undefined ? {} : { combat: validateCombat(source.combat, objects) }),
  }
  const bounds = tableBounds(session)
  if (objects.some(o => !['hand', 'inventory'].includes(String(o.metadata.zone)) && (o.position[0] < bounds.minX || o.position[0] > bounds.maxX || o.position[2] < bounds.minZ || o.position[2] > bounds.maxZ))) throw new Error('物件中心超出当前场景板安全范围，请先扩大场景板。')
  if (source.workspace !== undefined) {
    const w = plain(source.workspace, '工作区')
    if (w.kind !== 'draft' && w.kind !== 'play') throw new Error('工作区模式无效。')
    const definition = w.definition === undefined ? undefined : validateAdventureDefinition(w.definition)
    const sceneId = w.sceneId === undefined ? undefined : identifier(w.sceneId, '编辑场景 ID')
    if (w.kind === 'play' && (definition || sceneId)) throw new Error('游玩对局不能包含编辑草稿。')
    if (w.kind === 'draft' && (session.adventure || session.combat)) throw new Error('编辑草稿不能包含对局进度。')
    if (sceneId && !definition?.scenes.some(s => s.id === sceneId)) throw new Error('编辑场景不存在。')
    if (w.returnTo !== undefined && w.returnTo !== 'story') throw new Error('编辑返回位置无效。')
    session.workspace = { kind: w.kind, ...(w.sourceId === undefined ? {} : { sourceId: identifier(w.sourceId, '编辑稿 ID') }), ...(definition ? { definition } : {}), ...(sceneId ? { sceneId } : {}), ...(w.returnTo ? { returnTo: 'story' } : {}) }
    if (session.workspace.sourceId === session.id) throw new Error('对局不能引用自身为编辑稿。')
  }
  if (source.campaign !== undefined) {
    if (session.workspace?.kind === 'draft') throw new Error('编辑稿不能包含跑团存档信息。')
    const campaign = plain(source.campaign, '跑团存档')
    session.campaign = {
      moduleId: identifier(campaign.moduleId, '游戏模组 ID', 160),
      name: text(campaign.name, '跑团名称', 80, true),
      lastPlayedAt: number(campaign.lastPlayedAt, '最近游玩时间', 0, Number.MAX_SAFE_INTEGER, true),
    }
  }
  if (session.adventure?.progress.pending && !objects.some(o => o.id === session.adventure!.progress.pending!.dieId && o.kind === 'dice' && o.sides === session.adventure!.definition.scenes.find(s => s.id === session.adventure!.progress.sceneId)!.choices.find(c => c.id === session.adventure!.progress.pending!.choiceId)!.check!.sides)) throw new Error('待决战役检定的骰子引用无效。')
  if (session.combat?.rpg) {
    const db = session.adventure?.definition.rpg, p = session.adventure?.progress.rpg, r = session.combat.rpg
    if (!db || !p?.characters || p.pending?.type !== 'battle' && session.adventure?.progress.phase !== 'complete') throw new Error('武功遭遇缺少剧情与角色档案。')
    for (const [id, u] of Object.entries(r.units)) {
      validateRpgCharacter(u.stats, db)
      const o = objects.find(v => v.id === id)!
      if (u.roleId && (!p.roster.includes(u.roleId) || !db.roles[u.roleId] || JSON.stringify(u.stats) !== JSON.stringify(p.characters[u.roleId])) || u.enemyId && !db.enemies[u.enemyId]) throw new Error('武功战斗角色引用或成长记录不一致。')
      if (o.metadata.vitality !== rpgStat(db, u.stats, 'maxHP') || Math.abs(o.position[0] - (u.x - 7)) > .001 || Math.abs(o.position[2] - (u.y - 7)) > .001) throw new Error('战斗棋子与规则坐标不一致。')
    }
    if (r.pending && (r.pending.kind === 'skill' ? r.pending.id !== BASIC_SKILL && !db.magics[r.pending.id] : !db.items[r.pending.id])) throw new Error('武功检定内容引用无效。')
  }
  assertTableBudget(session)
  return session
}

function genericCards(count = 12): CardData[] {
  return Array.from({ length: count }, (_, index) => ({
    id: id(), name: `事件 ${String(index + 1).padStart(2, '0')}`, texture: '', backTexture: '',
    description: '通用事件卡。可替换卡面、卡背与说明，用于任意桌面游戏。',
  }))
}

export function createObject(kind: ObjectKind, overrides: Partial<TableObject> = {}): TableObject {
  if (!KINDS.includes(kind)) throw new Error('对象类型不受支持。')
  if (overrides.kind !== undefined && overrides.kind !== kind) throw new Error('创建对象的类型与参数不一致。')
  const defaults: TableObject = {
    id: id(), kind, name: LABELS[kind], position: [0, HEIGHTS[kind], 0], rotation: [0, 0, 0], scale: [1, 1, 1],
    color: kind === 'dice' ? '#315f33' : kind === 'deck' ? '#41536b' : '#c2a777', locked: false,
    faceDown: kind === 'deck', value: kind === 'token' ? 1 : 0,
    sides: kind === 'dice' ? 6 : 0, texture: '', backTexture: '', description: '', metadata: {},
  }
  if (kind === 'deck') defaults.cards = genericCards()
  return validateTableObject({ ...defaults, ...overrides, kind })
}

const ENCOUNTERS = [
  ['熄灭的路灯', '一盏路灯的燃料是满的，却没有点亮。旁边留下了一小片蓝色布料。'],
  ['无人的渡口', '渡船仍系在岸边，船桨和午餐都摆放整齐，船夫却不见踪影。'],
  ['失物招领', '路边摊主展示一只银色指南针，指针一直朝向桥下。'],
  ['临时封路', '前方桥梁需要修补。守桥人愿意用一条消息交换另一条通路。'],
  ['送错的包裹', '一名信使带来了写着队伍成员名字的空木箱。箱底有新鲜的泥土。'],
  ['石墙上的记号', '三道粉笔线标记着不同高度。最上方的线是今天才画上的。'],
  ['寻路的旅人', '旅人拿着一张倒置的地图，请求指引。他认识地图上已不存在的道路。'],
  ['旧哨站', '旧哨站的门是开着的。柜台上有人留下了两种不同颜色的棋子。'],
  ['雨中的交易', '货商希望把一批未拆封的货物暂存一夜，并愿意支付一份地图。'],
  ['遗落的笔记', '一本防水笔记列出三个地点，每个地点后面都画着一个问号。'],
  ['意外的重逢', '一个熟悉的名字出现在告示栏上。字迹与以前见到的不一样。'],
  ['第二条路', '一条狭窄的小路避开了主道。入口处挂着一枚没有刻字的木牌。'],
]
function encounterCards(): CardData[] {
  return ENCOUNTERS.map(([name, description]) => ({ id: id(), name, description, texture: '', backTexture: '' }))
}
function standardCards(): CardData[] {
  return ['♠', '♥', '♣', '♦'].flatMap((suit) => ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].map((rank) => ({
    id: id(), name: `${suit} ${rank}`, texture: '', backTexture: '', description: `${suit} ${rank}。标准扑克牌示例，可替换为自定义图片。`,
  })))
}

export function createTableSession(preset: 'sandbox' | 'rpg' | 'cards' | 'wargame' = 'rpg'): TableSession {
  if (!['sandbox', 'rpg', 'cards', 'wargame'].includes(preset)) throw new Error('桌面预设不受支持。')
  let objects: TableObject[] = []
  const names = { sandbox: '空白沙盘', rpg: '冒险桌面', cards: '卡牌试桌', wargame: '战术沙盘' }
  if (preset === 'rpg') {
    objects = [
      createObject('board', { name: '方格战术板', position: [-1, 0.05, 0], color: '#687362', locked: true, metadata: { width: 10, depth: 8, height: 0.1, grid: true } }),
      ...['旅人', '向导', '守卫'].map((name, index) => createObject('figurine', { name, position: [-3 + index * 1.5, 0.7, 2], color: ['#548fa8', '#bf7858', '#93a66a'][index] })),
      createObject('block', { name: '旧石墙', position: [-3, 0.5, -2], color: '#827d6c', locked: true, metadata: { width: 4, depth: 0.5, height: 1 } }),
      createObject('block', { name: '侧墙', position: [3, 0.5, -0.5], color: '#827d6c', locked: true, metadata: { width: 0.5, depth: 3, height: 1 } }),
      createObject('block', { name: '木箱', position: [-4, 0.4, 0], color: '#a27b4e', metadata: { width: 0.8, depth: 0.8, height: 0.8 } }),
      createObject('deck', { name: '旅途事件', position: [7, 0.18, -4], cards: encounterCards(), value: 12, description: '12 张原创、规则中立的场景提示卡。可以洗牌、抽牌并放回。' }),
      createObject('dice', { name: 'd6', position: [7, 0.6, 2], sides: 6, value: 0 }),
      createObject('dice', { name: 'd20', position: [9, 0.6, 2], sides: 20, value: 0, color: '#b97253' }),
      ...[1, 2, 3].map((value, index) => createObject('token', { name: `标记 ${value}`, value, position: [6 + index * 1.1, 0.12, -1], color: ['#ce9e48', '#6b9c82', '#ab6877'][index] })),
    ]
  } else if (preset === 'cards') {
    objects = [
      createObject('board', { name: '牌桌垫', position: [0, 0.05, 0], locked: true, color: '#446f63', metadata: { width: 15, depth: 9, height: 0.1 } }),
      createObject('deck', { name: '标准扑克牌', position: [-3, 0.18, 0], cards: standardCards(), value: 52 }),
      createObject('card', { name: '规则提示', position: [3, 0.08, 0], description: '自由选择游戏规则。抽牌、翻牌、移动和计分均由玩家掌控。', color: '#e4ddcc' }),
      ...[1, 5, 10].map((value, index) => createObject('token', { name: `${value} 分筹码`, value, position: [-1 + index * 1.2, 0.12, 3], color: ['#ce9e48', '#6b9c82', '#ab6877'][index] })),
    ]
  } else if (preset === 'wargame') {
    objects = [
      createObject('board', { name: '战术场地', position: [0, 0.05, 0], locked: true, color: '#687362', metadata: { width: 18, depth: 14, height: 0.1, grid: true } }),
      ...Array.from({ length: 6 }, (_, index) => createObject('figurine', { name: `蓝方 ${index + 1}`, position: [-6, 0.7, -3.75 + index * 1.5], color: '#548fa8', metadata: { team: '蓝方' } })),
      ...Array.from({ length: 6 }, (_, index) => createObject('figurine', { name: `红方 ${index + 1}`, position: [6, 0.7, -3.75 + index * 1.5], color: '#bf7858', metadata: { team: '红方' } })),
      ...[[-2, -3], [2, 3], [0, 0]].map(([x, z], index) => createObject('block', { name: `掩体 ${index + 1}`, position: [x, 0.6, z], locked: true, color: '#827d6c', metadata: { width: 2, depth: 1, height: 1.2 } })),
      createObject('dice', { name: 'd6', position: [11, 0.6, 3] }),
      createObject('token', { name: '目标标记', position: [0, 0.12, 4.5], color: '#ce9e48', value: 1 }),
    ]
  }
  const now = Date.now()
  return {
    version: 1, id: id(), name: names[preset], objects,
    notes: '这是自由桌面。移动棋子、摆放地形、掷骰、洗牌与抽牌，不绑定特定规则。请在这里记录游戏规则、桌面约定和自定义对象说明。',
    grid: { enabled: true, snap: true, size: 1 }, physics: { gravity: true },
    logs: [{ id: id(), text: `已创建「${names[preset]}」。`, time: now }], createdAt: now,
  }
}

export function addTableLog(session: TableSession, message: string): TableSession {
  const content = text(message.trim(), '桌面记录', 1000, true)
  const result: TableSession = { ...session, logs: [...session.logs.slice(-(MAX_TABLE_LOGS - 1)), { id: id(), text: content, time: Date.now() }] }
  assertTableBudget(result)
  return result
}

function findObject(session: TableSession, objectId: string): TableObject {
  const object = session.objects.find((item) => item.id === objectId)
  if (!object) throw new Error('此对象已不在桌面上。')
  return object
}
function commit(session: TableSession, objects: TableObject[], message: string): TableSession {
  assertUniqueObjects(objects)
  return addTableLog({ ...session, objects }, message)
}
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)) }

export function updateObject(session: TableSession, objectId: string, patch: Partial<TableObject>): TableSession {
  const original = findObject(session, objectId)
  if (patch.id !== undefined && patch.id !== original.id) throw new Error('不能修改对象 ID。')
  if (patch.kind !== undefined && patch.kind !== original.kind) throw new Error('不能通过更新改变对象类型。')
  if (original.locked && patch.locked !== false && (patch.position !== undefined || patch.rotation !== undefined || patch.scale !== undefined)) throw new Error('对象已锁定，请先解锁再调整位置、旋转或缩放。')
  const updated = validateTableObject({ ...original, ...patch })
  return commit(session, session.objects.map((item) => item.id === objectId ? updated : item), `更新了「${updated.name}」。`)
}

export function duplicateObject(session: TableSession, objectId: string): TableSession {
  const original = findObject(session, objectId)
  const copy = validateTableObject({
    ...original, id: id(), name: `${original.name.slice(0, 116)} 副本`, locked: false,
    position: [clamp(original.position[0] + 1, tableBounds(session).minX, tableBounds(session).maxX), original.position[1], clamp(original.position[2] + 0.6, tableBounds(session).minZ, tableBounds(session).maxZ)],
    ...(original.cards ? { cards: original.cards.map((card) => ({ ...card, id: id() })) } : {}),
  })
  return commit(session, [...session.objects, copy], `复制了「${original.name}」。`)
}

export function removeObject(session: TableSession, objectId: string): TableSession {
  const original = findObject(session, objectId)
  return commit(session, session.objects.filter((item) => item.id !== objectId), `移除了「${original.name}」。`)
}

function randomIndex(max: number, randomFn?: () => number): number {
  if (randomFn) {
    const value = randomFn()
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('随机函数需返回 0（含）至 1（不含）的数值。')
    return Math.floor(value * max)
  }
  if (!globalThis.crypto?.getRandomValues) throw new Error('当前环境不支持安全随机数，请通过本机地址或 HTTPS 打开。')
  const sample = new Uint32Array(1)
  const limit = Math.floor(0x100000000 / max) * max
  do { globalThis.crypto.getRandomValues(sample) } while (sample[0] >= limit)
  return sample[0] % max
}

export function shuffleDeck(session: TableSession, objectId: string, randomFn?: () => number): TableSession {
  const deck = findObject(session, objectId)
  if (deck.kind !== 'deck') throw new Error('请选择牌堆进行洗牌。')
  const cards = [...(deck.cards ?? [])]
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swap = randomIndex(index + 1, randomFn)
    ;[cards[index], cards[swap]] = [cards[swap], cards[index]]
  }
  return commit(session, session.objects.map((item) => item.id === objectId ? { ...deck, cards, value: cards.length } : item), `洗匀了「${deck.name}」的 ${cards.length} 张卡牌。`)
}

export function drawCard(session: TableSession, objectId: string): TableSession {
  const deck = findObject(session, objectId)
  if (deck.kind !== 'deck') throw new Error('请选择牌堆抽牌。')
  const [top, ...remaining] = deck.cards ?? []
  if (!top) throw new Error('牌堆已经没有卡牌。')
  const card = createObject('card', {
    id: top.id, name: top.name, texture: top.texture, backTexture: top.backTexture, description: top.description,
    position: [clamp(deck.position[0] + 1.7, tableBounds(session).minX, tableBounds(session).maxX), clamp(deck.position[1] + 0.02, 0, 30), clamp(deck.position[2] + 1.2, tableBounds(session).minZ, tableBounds(session).maxZ)],
    rotation: [...deck.rotation], color: deck.color, faceDown: false, metadata: { sourceDeckId: deck.id },
  })
  return commit(session, [
    ...session.objects.map((item) => item.id === objectId ? { ...deck, cards: remaining, value: remaining.length } : item), card,
  ], `从「${deck.name}」抽出「${card.name}」。`)
}

export function returnCardToDeck(session: TableSession, cardId: string, deckId: string): TableSession {
  const card = findObject(session, cardId)
  const deck = findObject(session, deckId)
  if (card.kind !== 'card' || deck.kind !== 'deck') throw new Error('需要选择一张卡牌和一个牌堆。')
  const data: CardData = { id: card.id, name: card.name, texture: card.texture, backTexture: card.backTexture, description: card.description }
  const cards = [data, ...(deck.cards ?? [])]
  if (cards.length > MAX_DECK_CARDS) throw new Error(`牌堆最多容纳 ${MAX_DECK_CARDS} 张卡牌。`)
  return commit(session, session.objects.filter((item) => item.id !== cardId).map((item) => item.id === deckId ? { ...deck, cards, value: cards.length } : item), `将「${card.name}」放回「${deck.name}」顶部。`)
}
