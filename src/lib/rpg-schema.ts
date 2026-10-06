import { validateTableObject } from './tabletop.ts'
import { validateRpgCharacter, type RpgCharacter, type RpgMagic, RPG_STATS } from './rpg-rules.ts'
import { validateDicePool } from './dice.ts'
export const RPG_OPS = { talk: '对话 / 旁白', choice: '玩家选项', if: '条件分支', battle: '战术遭遇', get: '获得物品', loseItem: '失去物品', money: '货币增减', core: '收集目标', flag: '设置剧情开关', join: '队友入队', leave: '队友离队', morality: '倾向增减', fame: '声望增减', shop: '打开商店', heal: '全队恢复', setTile: '改变地形', music: '背景音乐', sfx: '音效', ending: '进入结局' } as const
export type RpgOpName = keyof typeof RPG_OPS
export type RpgPath = (string | number)[]
export interface RpgCondition { flag?: string; flagNot?: string; has?: string; cores?: number; morality?: number; moralityBelow?: number; moralityAtMost?: number; moneyAtLeast?: number; rnd?: number; inParty?: string; notInParty?: string }
export interface RpgOp {
  op: RpgOpName; name?: string | null; color?: string | null; text?: string; item?: string; n?: number; v?: number; role?: string; id?: string; m?: string; x?: number; y?: number; ch?: string
  options?: { t: string; s: RpgOp[] }[]; cond?: RpgCondition; then?: RpgOp[]; else?: RpgOp[]; enemies?: string[]; onWin?: RpgOp[]; title?: string; bgm?: string; boost?: number; noFlee?: boolean | number; rewardScale?: number
}
export interface RpgTemplate { id?: string; name: string; desc?: string; hp?: number; attack?: number; defence?: number; color?: string; sprite?: string; portrait?: string; texture?: string; model?: string; money?: number; healHP?: number; type?: number; price?: number; brings?: { id: string; n: number }[]; drops?: { id: string; chance: number }[]; [key: string]: unknown }
export interface RpgNpc { x: number; y: number; name: string; sprite?: string; role?: string; blocking?: boolean | number; hideIfFlag?: string | null; script: RpgOp[] }
export interface RpgEvent { id: string; name?: string; x: number; y: number; trigger: 'step' | 'interact'; once?: boolean | number; flag?: string; ifFlag?: string; notFlag?: string; script: RpgOp[] }
export interface RpgMap { name: string; music?: string; w: number; h: number; tiles: string[]; entry: { x: number; y: number; fromUp?: boolean }; npcs: RpgNpc[]; events: RpgEvent[]; board?: { cellSize: number; color: string } }
export interface RpgDatabase {
  v: 1; maps: Record<string, RpgMap>; roles: Record<string, RpgTemplate>; enemies: Record<string, RpgTemplate>; items: Record<string, RpgTemplate>; magics: Record<string, unknown>
  shops: Record<string, { id: string; price: number }[]>; world: { w: number; h: number; music?: string; locations: { id: string; name: string; x: number; y: number; desc?: string; danger?: number; icon?: string }[] }
  audio?: { music: Record<string, string>; sfx: Record<string, string> }
  settings?: { objectiveName: string; objectiveCount: number; initialMoney: number; textStyle?: 'animated' | 'plain' }
}
export interface RpgProgress {
  version: 1; mapId: string; x: number; y: number; money: number; morality: number; fame: number; cores: number[]; roster: string[]; recruited: string[]; bag: Record<string, number>; flags: Record<string, number>
  tiles: Record<string, Record<string, string>>; frames: { path: RpgPath; index: number }[]; pending?: { type: 'talk' | 'choice' | 'shop' | 'battle' | 'roll'; path: RpgPath; dieId?: string; request?: number; generation?: number }
  music: string; sound?: { name: string; sequence: number }; message: string; steps: number
  characters?: Record<string, RpgCharacter>; rulesVersion?: 2; worldFrom?: string
}

const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v))
function record(v: unknown, label: string) { if (!plain(v)) throw new Error(`${label}需为数据对象。`); return v }
function id(v: unknown) { if (typeof v !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(v) || ['__proto__', 'constructor', 'prototype'].includes(v)) throw new Error('RPG 数据标识无效。'); return v }
function text(v: unknown, label: string, max = 8000) { if (typeof v !== 'string' || v.length > max) throw new Error(`${label}需为最多${max}字符的文本。`); return v }
function number(v: unknown, label: string, min: number, max: number, integer = true) { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || integer && !Number.isSafeInteger(v)) throw new Error(`${label}需为${min}至${max}的${integer ? '整数' : '数值'}。`); return v }
function list(v: unknown, label: string, max: number) { if (!Array.isArray(v) || v.length > max) throw new Error(`${label}最多${max}项。`); return v }
function safeJson(v: unknown, depth = 0): void {
  if (depth > 30) throw new Error('RPG 数据嵌套过深。')
  if (v === null || typeof v === 'boolean' || typeof v === 'string') { if (typeof v === 'string' && v.length > 2_000_000) throw new Error('RPG 字段过长。'); return }
  if (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e9) return
  if (Array.isArray(v)) { if (v.length > 4096) throw new Error('RPG 列表过长。'); v.forEach(x => safeJson(x, depth + 1)); return }
  const o = record(v, 'RPG 属性')
  if (Object.keys(o).length > 2048) throw new Error('RPG 属性过多。')
  for (const [k, x] of Object.entries(o)) { if (['__proto__', 'constructor', 'prototype'].includes(k) || k.length > 120) throw new Error('RPG 属性名称无效。'); if (x !== undefined) safeJson(x, depth + 1) }
}
export function rpgAt(db: RpgDatabase, path: RpgPath): unknown {
  let value: unknown = db
  for (const key of path) { if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new Error('剧情游标引用已失效。'); value = (value as Record<string | number, unknown>)[key] }
  return value
}
export function validateRpgDatabase(value: unknown): RpgDatabase {
  safeJson(value)
  if (JSON.stringify(value).length > 2_000_000) throw new Error('RPG 内容数据库超过2 MB。')
  const v = record(value, 'RPG 数据库')
  if (v.v !== 1) throw new Error('RPG 数据库版本不受支持。')
  const db = structuredClone(v) as unknown as RpgDatabase
  if (db.settings) {
    text(db.settings.objectiveName, '目标名称', 80); number(db.settings.objectiveCount, '目标总数', 1, 128); number(db.settings.initialMoney, '初始货币', 0, 1_000_000)
    if ((db.settings.textStyle as string) === 'starsea') db.settings.textStyle = 'animated'
    if (db.settings.textStyle !== undefined && !['animated', 'plain'].includes(db.settings.textStyle)) throw new Error('剧情文字样式无效。')
  }
  const maps = record(db.maps, '地图'), roles = record(db.roles, '角色'), enemies = record(db.enemies, '敌人'), items = record(db.items, '物品')
  for (const [label, rows, max] of [['地图', maps, 64], ['角色', roles, 128], ['敌人', enemies, 256], ['物品', items, 512]] as const) {
    if (Object.keys(rows).length > max) throw new Error(`${label}过多。`)
    for (const [key, row] of Object.entries(rows)) { id(key); text(record(row, label).name, `${label}名称`, 120) }
  }
  if (!Object.keys(maps).length || !roles.hero) throw new Error('RPG 需要地图和 hero 主角。')
  for (const role of [...Object.values(db.roles), ...Object.values(db.enemies)]) if (role.tabletopAppearance !== undefined) { const appearance = validateTableObject(role.tabletopAppearance); if (appearance.kind !== 'figurine') throw new Error('RPG角色外观需要棋子模板。'); role.tabletopAppearance = appearance }
  record(db.magics, '技能库'); record(db.shops, '商店库'); record(db.world, '星图')
  if (Object.keys(db.magics).length > 512) throw new Error('技能库最多512项。')
  for (const [key, raw] of Object.entries(db.magics)) {
    id(key); const m = record(raw, '武功') as unknown as RpgMagic; text(m.name, '武功名称', 120)
    m.school ??= 0; m.ept ??= 2; m.area ??= 'point'; m.dist ??= 1; m.power ??= 12; m.ep ??= 0
    number(m.school, '武功系别', 0, 5); number(m.ept, '能量谱系', 0, 2)
    if (!['point', 'line', 'cross', 'zone'].includes(m.area)) throw new Error('武功范围形态无效。')
    number(m.dist, '武功射程', 1, 15); number(m.power, '武功威力', 0, 1e6); number(m.ep, '武功能量消耗', 0, 1e6)
    if (m.dicePool !== undefined) m.dicePool = validateDicePool(m.dicePool)
    for (const field of ['powLv', 'epLv', 'distLv', 'areaLv'] as const) if (m[field] !== undefined) {
      if (!Array.isArray(m[field]) || m[field]!.length !== 10) throw new Error('武功段位表需要10项。')
      for (const v of m[field]!) if (field === 'areaLv') { if (!['point', 'line', 'cross', 'zone'].includes(String(v))) throw new Error('段位范围形态无效。') } else number(v, '武功段位数值', field === 'distLv' ? 1 : 0, field === 'distLv' ? 15 : 1e6)
    }
    for (const field of ['heal', 'healAll', 'cure', 'shield', 'suck'] as const) if (m[field] !== undefined && typeof m[field] !== 'boolean') throw new Error('武功效果开关无效。')
    if (m.special !== undefined && !['', 'stun', 'stunAll', 'double', 'pierce'].includes(m.special)) throw new Error('武功特殊效果无效。')
  }
  let commandCount = 0
  const reference = (key: unknown, rows: object, label: string) => { const name = id(key); if (!Object.hasOwn(rows, name)) throw new Error(`${label}引用不存在：${name}`) }
  function script(value: unknown, map: RpgMap, depth = 0): void {
    if (depth > 12) throw new Error('剧情脚本最多嵌套12层。')
    for (const raw of list(value, '剧情指令', 256)) {
      if (++commandCount > 10000) throw new Error('作品最多10000条剧情指令。')
      const o = record(raw, '剧情指令') as unknown as RpgOp
      if (!Object.hasOwn(RPG_OPS, o.op)) throw new Error(`未知剧情指令：${String(o.op)}`)
      if (o.text !== undefined) text(o.text, '剧情文本')
      if (o.name != null) text(o.name, '说话人 / 开关', 120)
      if (o.color != null && !/^#[a-f0-9]{6}$/i.test(o.color)) throw new Error('对话颜色无效。')
      if (['get', 'loseItem'].includes(o.op)) reference(o.item, items, '物品')
      if (o.op === 'get') number(o.n ?? 1, '物品数量', 1, 999)
      if (['money', 'morality', 'fame', 'flag'].includes(o.op)) number(o.v ?? 1, '指令数值', -1_000_000, 1_000_000)
      if (o.op === 'flag') id(o.name)
      if (o.op === 'core') number(o.n, '收集目标编号', 1, db.settings?.objectiveCount ?? 12)
      if (['join', 'leave'].includes(o.op)) reference(o.role, roles, '角色')
      if (o.op === 'shop') reference(o.id, db.shops, '商店')
      if (o.op === 'choice') { if (!o.options?.length) throw new Error('选择指令需要至少一个选项。'); for (const option of list(o.options, '剧情选项', 12)) { const row = record(option, '选项'); text(row.t, '选项文字', 500); script(row.s, map, depth + 1) } }
      if (o.op === 'battle') { o.onWin ??= []; for (const enemy of list(o.enemies, '敌人', 18)) reference(enemy, enemies, '敌人'); if (!o.enemies?.length) throw new Error('遭遇需要敌人。'); script(o.onWin, map, depth + 1) }
      if (o.op === 'if') {
        const c = record(o.cond ?? {}, '剧情条件') as RpgCondition
        for (const key of Object.keys(c)) if (!['flag', 'flagNot', 'has', 'cores', 'morality', 'moralityBelow', 'moralityAtMost', 'moneyAtLeast', 'rnd', 'inParty', 'notInParty'].includes(key)) throw new Error(`未知剧情条件：${key}`)
        for (const key of ['flag', 'flagNot'] as const) if (c[key] !== undefined) id(c[key])
        if (c.has !== undefined) reference(c.has, items, '条件物品')
        for (const key of ['inParty', 'notInParty'] as const) if (c[key] !== undefined) reference(c[key], roles, '条件角色')
        for (const key of ['cores', 'morality', 'moralityBelow', 'moralityAtMost', 'moneyAtLeast'] as const) if (c[key] !== undefined) number(c[key], '条件数值', -1_000_000, 1_000_000)
        if (c.rnd !== undefined) number(c.rnd, '条件概率', 0, 1, false)
        o.cond ??= {}; o.then ??= []; o.else ??= []; script(o.then, map, depth + 1); script(o.else, map, depth + 1)
      }
      if (o.op === 'setTile') { number(o.x, '地形X', 0, map.w - 1); number(o.y, '地形Y', 0, map.h - 1); if (!/^[#.,KSGRDWTBX]$/.test(String(o.ch))) throw new Error('地形字符不受支持。') }
    }
  }
  for (const map of Object.values(db.maps)) {
    map.npcs ??= []; map.events ??= []
    number(map.w, '地图列数', 4, 64); number(map.h, '地图行数', 4, 64)
    if (list(map.tiles, '地图行', 64).length !== map.h || map.tiles.some(row => typeof row !== 'string' || row.length > 64 || !/^[#.,KSGRDWTBX]+$/.test(row))) throw new Error('地图行数据或地形字符无效。')
    map.w = Math.max(map.w, ...map.tiles.map(r => r.length))
    map.tiles = map.tiles.map(row => row.padEnd(map.w, '#'))
    const entry = record(map.entry, '地图入口'); number(entry.x, '入口X', 0, map.w - 1); number(entry.y, '入口Y', 0, map.h - 1)
    const unit = map.board?.cellSize ?? 1
    number(unit, '格子尺寸', .5, 2, false)
    if ((map.w + 4) * unit > 80 || (map.h + 4) * unit > 80) throw new Error('地图与格子规格超过80桌面单位。')
    if (map.board && !/^#[a-f0-9]{6}$/i.test(map.board.color)) throw new Error('场景板颜色无效。')
    for (const npc of list(map.npcs, '场景NPC', 48) as RpgNpc[]) { text(npc.name, 'NPC名称', 120); if (npc.role) reference(npc.role, roles, 'NPC角色'); number(npc.x, 'NPC X', 0, map.w - 1); number(npc.y, 'NPC Y', 0, map.h - 1); script(npc.script, map) }
    const eventIds = new Set<string>()
    for (const event of list(map.events, '场景事件', 96) as RpgEvent[]) { id(event.id); if (event.name !== undefined) text(event.name, '事件名称', 120); if (eventIds.has(event.id)) throw new Error('地图事件ID重复。'); eventIds.add(event.id); number(event.x, '事件X', 0, map.w - 1); number(event.y, '事件Y', 0, map.h - 1); if (!['step', 'interact'].includes(event.trigger)) throw new Error('事件触发方式无效。'); if (event.once && !event.flag) event.flag = `event_${event.id}`; for (const key of ['flag', 'ifFlag', 'notFlag'] as const) if (event[key]) id(event[key]); script(event.script, map) }
  }
  for (const [key, shop] of Object.entries(db.shops)) { id(key); for (const row of list(shop, '商店货物', 128) as { id: string; price: number }[]) { reference(row.id, items, '商品'); number(row.price, '商品价格', 0, 1_000_000) } }
  for (const [rows, label] of [[db.roles, '角色'], [db.enemies, '敌人']] as const) for (const t of Object.values(rows)) {
    if (t.hp !== undefined) number(t.hp, `${label}生命`, 1, 1_000_000)
    if (t.money !== undefined) number(t.money, '掉落货币', 0, 1_000_000)
    for (const row of t.brings ?? []) { reference(row.id, items, '携带物品'); number(row.n, '携带数量', 1, 999) }
    for (const row of t.drops ?? []) { reference(row.id, items, '掉落物品'); number(row.chance, '掉落概率', 0, 1, false) }
    for (const field of ['ep', 'pp', 'attack', 'defence', 'speed', 'iq', 'fist', 'blade', 'cannon', 'psi', 'drone', 'medicine', 'knowledge', 'resist'] as const) if (t[field] !== undefined) number(t[field], `角色${field}`, 0, 1e6, false)
    if (t.level !== undefined) number(t.level, '角色等级', 1, 30)
    if (t.ept !== undefined) number(t.ept, '能量谱系', 0, 2)
    if (t.color !== undefined && !/^#[a-f0-9]{6}$/i.test(t.color)) throw new Error('棋子颜色需要六位十六进制颜色。')
    if (t.growth !== undefined) for (const [key, value] of Object.entries(record(t.growth, '升级成长'))) { if (!['hp', 'ep', 'attack', 'defence', 'speed'].includes(key)) throw new Error('升级成长属性无效。'); number(value, '升级成长值', 0, 1e6, false) }
    if (t.magics !== undefined) {
      const skills = list(t.magics, '角色武功', 10), ids = new Set<string>()
      for (const skill of skills) {
        const key = typeof skill === 'string' ? skill : (skill as {id: string})?.id
        reference(key, db.magics, '角色武功'); if (ids.has(key)) throw new Error('角色初始武功重复。'); ids.add(key)
        if (typeof skill !== 'string') number((skill as {lv: number}).lv, '初始武功熟练度', 1, 999)
      }
    }
    for (const slot of ['weapon', 'armor'] as const) if (t[slot] != null) { reference(t[slot], db.items, '初始装备'); if (db.items[String(t[slot])].type !== (slot === 'weapon' ? 1 : 2)) throw new Error('初始装备槽类型无效。') }
  }
  for (const t of Object.values(db.items)) {
    for (const field of ['healHP', 'healEP', 'dmg', 'dist', 'needExp', 'needIQ', 'needFist', 'needBlade', 'needCannon', 'needPsi', 'needSpeed']) if (t[field] !== undefined) number(t[field], `物品${field}`, 0, 1e6)
    if (t.learn !== undefined) reference(t.learn, db.magics, '秘籍武功')
    if (t.bonus !== undefined) for (const [key, v] of Object.entries(record(t.bonus, '修炼成长'))) { if (!RPG_STATS.includes(key as typeof RPG_STATS[number])) throw new Error('修炼成长属性无效。'); number(v, '修炼成长值', 0, 1e6) }
    if (t.changeEPT !== undefined) number(t.changeEPT, '修炼谱系', 0, 2)
  }
  if (db.audio) for (const rows of [record(db.audio.music, '音乐'), record(db.audio.sfx, '音效')]) for (const [key, url] of Object.entries(rows)) { id(key); if (typeof url !== 'string' || url.length > 2048 || !/^(?:\/(?!\/)|https?:\/\/)/.test(url)) throw new Error('音频需使用本机资源路径或HTTP地址。') }
  number(db.world.w, '星图宽度', 1, 100000); number(db.world.h, '星图高度', 1, 100000)
  for (const loc of list(db.world.locations, '星图地点', 64) as RpgDatabase['world']['locations']) { reference(loc.id, maps, '星图地点'); text(loc.name, '地点名', 120); number(loc.x, '星图X', 0, db.world.w); number(loc.y, '星图Y', 0, db.world.h) }
  return db
}

export function validateRpgProgress(value: unknown, db: RpgDatabase): RpgProgress {
  safeJson(value)
  const p = structuredClone(record(value, 'RPG进度')) as unknown as RpgProgress
  if (p.version !== 1 || p.mapId !== 'world' && !db.maps[p.mapId]) throw new Error('RPG当前地图无效。')
  if (p.worldFrom !== undefined && (typeof p.worldFrom !== 'string' || !Object.hasOwn(db.maps, p.worldFrom))) throw new Error('星图出发地无效。')
  number(p.x, '角色格子X', 0, 63); number(p.y, '角色格子Y', 0, 63)
  if (p.mapId !== 'world' && (p.x >= db.maps[p.mapId].w || p.y >= db.maps[p.mapId].h)) throw new Error('RPG角色位置超出地图。')
  for (const key of ['money', 'fame', 'steps'] as const) number(p[key], key, 0, 1_000_000_000)
  number(p.morality, '协议倾向', -100, 100); text(p.message, '剧情提示', 2000); text(p.music, '音乐名', 120)
  for (const key of ['roster', 'recruited'] as const) { const rows = list(p[key], '角色名册', 128); if (new Set(rows).size !== rows.length || rows.some(role => typeof role !== 'string' || !db.roles[role])) throw new Error('角色名册引用无效。') }
  if (!p.roster.includes('hero') || p.roster.length > 6 || p.roster.some(role => !p.recruited.includes(role))) throw new Error('RPG队伍无效。')
  const cores = list(p.cores, '收集目标', db.settings?.objectiveCount ?? 12); cores.forEach(v => number(v, '收集目标', 1, db.settings?.objectiveCount ?? 12)); if (new Set(cores).size !== cores.length) throw new Error('收集目标重复。')
  for (const [key, n] of Object.entries(record(p.bag, '背包'))) { if (!db.items[key]) throw new Error('背包物品引用无效。'); number(n, '物品数量', 1, 99999) }
  for (const [key, n] of Object.entries(record(p.flags, '剧情开关'))) { id(key); number(n, '开关值', -1_000_000, 1_000_000) }
  for (const [mid, rows] of Object.entries(record(p.tiles, '改变地形'))) { const map = db.maps[mid]; if (!map) throw new Error('地形地图引用无效。'); for (const [xy, ch] of Object.entries(record(rows, '地形'))) { const [x, y] = xy.split(',').map(Number); if (!/^\d+,\d+$/.test(xy) || x >= map.w || y >= map.h || !/^[#.,KSGRDWTBX]$/.test(String(ch))) throw new Error('改变的地形无效。') } }
  const path = (v: unknown) => list(v, '剧情游标', 96).map(k => typeof k === 'number' ? number(k, '游标索引', 0, 10000) : id(k))
  for (const frame of list(p.frames, '剧情栈', 32) as RpgProgress['frames']) { frame.path = path(frame.path); const script = rpgAt(db, frame.path); if (!Array.isArray(script)) throw new Error('剧情脚本引用无效。'); number(frame.index, '剧情指令索引', 0, script.length) }
  if (p.pending) { const pending = record(p.pending, '等待中的剧情'); if (!['talk', 'choice', 'shop', 'battle', 'roll'].includes(String(pending.type))) throw new Error('等待中的剧情类型无效。'); p.pending.path = path(p.pending.path); const op = rpgAt(db, p.pending.path) as RpgOp; if (op?.op !== (p.pending.type === 'roll' ? 'if' : p.pending.type)) throw new Error('剧情等待游标不匹配。'); if (p.pending.type === 'roll') { id(p.pending.dieId); number(p.pending.request, '检定身份', 1, Number.MAX_SAFE_INTEGER); number(p.pending.generation, '运行代次', 0, Number.MAX_SAFE_INTEGER) } }
  if (p.rulesVersion !== undefined && p.rulesVersion !== 2) throw new Error('RPG规则进度版本无效。')
  if (p.characters !== undefined) {
    const characters = record(p.characters, '角色成长档案')
    if (Object.keys(characters).length !== Object.keys(db.roles).length || Object.keys(characters).some(key => !db.roles[key])) throw new Error('角色成长档案引用不完整。')
    p.characters = Object.fromEntries(Object.entries(characters).map(([key, row]) => [key, validateRpgCharacter(row, db)]))
    if (p.rulesVersion !== 2) throw new Error('角色成长档案缺少规则版本。')
  } else if (p.rulesVersion === 2) throw new Error('角色成长档案缺失。')
  return p
}
