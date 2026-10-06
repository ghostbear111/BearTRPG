import { validateTableObject, type TableObject } from './tabletop.ts'
import { validateTableSurface, type TableSurface } from './table-surface.ts'
import { validateRpgDatabase, validateRpgProgress, type RpgDatabase, type RpgProgress } from './rpg-schema.ts'
import { validatePresentation, type TavernPresentation } from './tavern-presentation.ts'

export const ADVENTURE_LIMIT = 4_000_000
export const QUEST_STATES = ['locked', 'active', 'completed', 'failed'] as const
export type QuestStatus = typeof QUEST_STATES[number]
export interface AdventureCharacter { id: string; name: string; role: 'player' | 'npc'; description: string; secret: string; maxHp: number; color: string; appearance?: TableObject }
export interface AdventureQuest { id: string; title: string; description: string; initial: QuestStatus }
export interface AdventureVariable { id: string; name: string; initial: number; min: number; max: number }
export type AdventureCondition = { type: 'quest'; id: string; status: QuestStatus } | { type: 'variable'; id: string; operator: 'gte' | 'lte'; value: number }
export type AdventureEffect = { type: 'quest'; id: string; status: QuestStatus } | { type: 'variable' | 'hp'; id: string; delta: number }
export interface AdventureChoice {
  id: string; label: string; description: string; nextSceneId: string; failureSceneId: string
  check: null | { sides: number; target: number; modifier: number }
  conditions: AdventureCondition[]; success: AdventureEffect[]; failure: AdventureEffect[]
}
export interface AdventureScene {
  id: string; chapterId: string; title: string; description: string; gmNotes: string; goal: string
  ending: 'none' | 'victory' | 'defeat'; cast: string[]; choices: AdventureChoice[]; objects: TableObject[]
  surface?: TableSurface; gridSize?: number
}
export interface AdventureDefinition {
  tavern?: TavernPresentation
  schemaVersion: 1; id: string; revision: number; title: string; summary: string
  world: { premise: string; history: string; factions: string; tone: string; gmNotes: string }
  rules: { name: string; minPlayers: number; maxPlayers: number; partyDefeat: boolean }
  chapters: { id: string; title: string; summary: string }[]
  characters: AdventureCharacter[]; quests: AdventureQuest[]; variables: AdventureVariable[]
  scenes: AdventureScene[]; startSceneId: string
  rpg?: RpgDatabase
}
export interface AdventureProgress {
  version: 1; sceneId: string; phase: 'scene' | 'rolling' | 'result' | 'complete'; visited: string[]
  hp: Record<string, number>; quests: Record<string, QuestStatus>; variables: Record<string, number>
  journal: { id: string; text: string; time: number; sceneId: string }[]
  pending?: { choiceId: string; dieId: string; request: number; generation: number }
  result?: { choiceId: string; value: number; total: number; success: boolean; nextSceneId: string; message: string }
  outcome?: 'won' | 'lost'; lastMessage: string
  sceneStates?: Record<string, Record<string, Record<string, boolean>>>
  rpg?: RpgProgress
}
export interface AdventureSession { definition: AdventureDefinition; progress: AdventureProgress }

function obj(v: unknown, label: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) throw new Error(`${label}必须是数据对象。`)
  return v as Record<string, unknown>
}
function str(v: unknown, label: string, max = 6000, required = false): string {
  if (typeof v !== 'string' || v.length > max || (required && !v.trim()) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v)) throw new Error(`${label}需为${required ? '非空' : ''}文本，最多 ${max} 字符。`)
  return v
}
function num(v: unknown, label: string, min = -9999, max = 9999): number {
  if (!Number.isSafeInteger(v) || (v as number) < min || (v as number) > max) throw new Error(`${label}需为 ${min} 至 ${max} 的整数。`)
  return v as number
}
export function adventureId(v: unknown): string {
  const id = str(v, '标识', 120, true)
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id)) throw new Error('战役标识格式不安全。')
  return id
}
function values<T extends string | number>(v: unknown, choices: readonly T[], label: string): T {
  if (!choices.includes(v as T)) throw new Error(`${label}不受支持。`)
  return v as T
}
function bool(v: unknown, label: string): boolean { if (typeof v !== 'boolean') throw new Error(`${label}需要布尔值。`); return v }
function list(v: unknown, label: string, max: number): unknown[] { if (!Array.isArray(v) || v.length > max) throw new Error(`${label}最多 ${max} 项。`); return v }
function unique<T extends { id: string }>(items: T[], label: string): T[] { if (new Set(items.map(x => x.id)).size !== items.length) throw new Error(`${label}存在重复标识。`); return items }
function optionalId(v: unknown): string { return v === '' ? '' : adventureId(v) }
function condition(value: unknown): AdventureCondition {
  const v = obj(value, '条件'); const id = adventureId(v.id)
  if (v.type === 'quest') return { type: 'quest', id, status: values(v.status, QUEST_STATES, '任务状态') }
  if (v.type === 'variable') return { type: 'variable', id, operator: values(v.operator, ['gte', 'lte'], '比较方式'), value: num(v.value, '条件数值') }
  throw new Error('条件类型不受支持。')
}
function effect(value: unknown): AdventureEffect {
  const v = obj(value, '后果'); const id = adventureId(v.id)
  if (v.type === 'quest') return { type: 'quest', id, status: values(v.status, QUEST_STATES, '任务状态') }
  if (v.type === 'hp' || v.type === 'variable') return { type: v.type, id, delta: num(v.delta, '变化量') }
  throw new Error('后果类型不受支持。')
}
export function validateAdventureDefinition(value: unknown): AdventureDefinition {
  const v = obj(value, '战役作品'); if (v.schemaVersion !== 1) throw new Error('战役作品版本不受支持。')
  const world = obj(v.world, '世界设定'); const rules = obj(v.rules, '战役规则')
  const result: AdventureDefinition = {
    schemaVersion: 1, id: adventureId(v.id), revision: num(v.revision, '作品版本', 0, 100000), title: str(v.title, '作品名称', 120, true), summary: str(v.summary, '简介', 4000),
    world: { premise: str(world.premise, '世界核心', 16000), history: str(world.history, '世界历史', 16000), factions: str(world.factions, '阵营关系', 16000), tone: str(world.tone, '风格', 500), gmNotes: str(world.gmNotes, '主持人设定', 16000) },
    rules: { name: str(rules.name, '规则名称', 120, true), minPlayers: num(rules.minPlayers, '最少玩家', 1, 12), maxPlayers: num(rules.maxPlayers, '最多玩家', 1, 12), partyDefeat: bool(rules.partyDefeat, '全队倒下失败') },
    chapters: unique(list(v.chapters, '章节', 64).map(value => { const x = obj(value, '章节'); return { id: adventureId(x.id), title: str(x.title, '章节名称', 120, true), summary: str(x.summary, '章节概要', 8000) } }), '章节'),
    characters: unique(list(v.characters, '角色', 128).map(value => { const x = obj(value, '角色'); const color = str(x.color, '角色颜色', 7); if (!/^#[a-f0-9]{6}$/i.test(color)) throw new Error('角色颜色无效。'); const appearance = x.appearance === undefined ? undefined : validateTableObject(x.appearance); if (appearance && appearance.kind !== 'figurine') throw new Error('角色外观需要棋子模板。'); return { id: adventureId(x.id), name: str(x.name, '角色名', 120, true), role: values(x.role, ['player', 'npc'] as const, '角色类型'), description: str(x.description, '角色背景', 8000), secret: str(x.secret, '角色秘密', 8000), maxHp: num(x.maxHp, '生命上限', 1, v.rpg ? 1e6 : 999), color, ...(appearance ? { appearance } : {}) } }), '角色'),
    quests: unique(list(v.quests, '任务', 256).map(value => { const x = obj(value, '任务'); return { id: adventureId(x.id), title: str(x.title, '任务标题', 120, true), description: str(x.description, '任务说明', 8000), initial: values(x.initial, QUEST_STATES, '任务初始状态') } }), '任务'),
    variables: unique(list(v.variables, '世界变量', 64).map(value => { const x = obj(value, '变量'); const min = num(x.min, '变量下限'); const max = num(x.max, '变量上限'); if (min > max) throw new Error('变量下限不能大于上限。'); return { id: adventureId(x.id), name: str(x.name, '变量名', 120, true), min, max, initial: num(x.initial, '变量初值', min, max) } }), '变量'),
    scenes: unique(list(v.scenes, '场景', 128).map(value => {
      const x = obj(value, '场景'); const objects = unique(list(x.objects, '场景物件', 180).map(validateTableObject), '场景物件')
      const objectIds = [...objects.map(o => o.id), ...objects.flatMap(o => o.cards?.map(c => c.id) ?? [])]; if (new Set(objectIds).size !== objectIds.length) throw new Error('场景物件或卡牌身份重复。')
      const cast = list(x.cast, '场景角色', 24).map(adventureId); if (new Set(cast).size !== cast.length) throw new Error('场景角色重复。')
      return { id: adventureId(x.id), chapterId: optionalId(x.chapterId), title: str(x.title, '场景名称', 120, true), description: str(x.description, '场景叙事', 16000), gmNotes: str(x.gmNotes, '场景主持笔记', 16000), goal: str(x.goal, '场景目标', 4000), ending: values(x.ending, ['none', 'victory', 'defeat'] as const, '场景结局'), cast, objects,
        ...(x.surface === undefined ? {} : { surface: validateTableSurface(x.surface) }), ...(x.gridSize === undefined ? {} : { gridSize: (() => { if (typeof x.gridSize !== 'number' || !Number.isFinite(x.gridSize) || x.gridSize < .1 || x.gridSize > 5) throw new Error('场景格距需为0.1至5。'); return x.gridSize })() }),
        choices: unique(list(x.choices, '场景行动', 24).map(value => { const c = obj(value, '行动'); const check = c.check === null ? null : obj(c.check, '检定'); return { id: adventureId(c.id), label: str(c.label, '行动名称', 120, true), description: str(c.description, '行动描述', 4000), nextSceneId: optionalId(c.nextSceneId), failureSceneId: optionalId(c.failureSceneId), check: check ? { sides: values(check.sides, [4, 6, 8, 10, 12, 20] as const, '骰型'), target: num(check.target, '检定目标', -100, 100), modifier: num(check.modifier, '检定加值', -50, 50) } : null, conditions: list(c.conditions, '行动条件', 16).map(condition), success: list(c.success, '成功后果', 24).map(effect), failure: list(c.failure, '失败后果', 24).map(effect) } }), '场景行动') }
    }), '场景'), startSceneId: optionalId(v.startSceneId),
    ...(v.rpg === undefined ? {} : { rpg: validateRpgDatabase(v.rpg) }),
    ...(v.tavern === undefined ? {} : { tavern: validatePresentation(v.tavern) }),
  }
  if (result.rules.minPlayers > result.rules.maxPlayers) throw new Error('最少玩家不能大于最多玩家。')
  if (new TextEncoder().encode(JSON.stringify(result)).length > ADVENTURE_LIMIT) throw new Error('战役作品超过 4 MB；请使用本机图片资源，并将大型战役拆成作品卷册。')
  return result
}

export function auditAdventure(def: AdventureDefinition): { errors: string[]; warnings: string[] } {
  const errors: string[] = []; const warnings: string[] = []
  const scenes = new Map(def.scenes.map(s => [s.id, s])); const chapters = new Set(def.chapters.map(c => c.id))
  const chars = new Set(def.characters.map(c => c.id)); const quests = new Set(def.quests.map(q => q.id)); const vars = new Set(def.variables.map(v => v.id))
  if (!scenes.has(def.startSceneId)) errors.push('请指定一个存在的开场场景。')
  if (!def.characters.some(c => c.role === 'player')) errors.push('至少需要一名玩家角色。')
  if (def.characters.filter(c => c.role === 'player').length > 12) errors.push('首版最多同时控制 12 名玩家角色，其余可设为 NPC。')
  if (def.rpg) {
    for (const id of Object.keys(def.rpg.maps)) if (!scenes.has(`rpg-map-${id}`)) errors.push(`RPG地图缺少场景：${id}`)
    for (const id of Object.keys(def.rpg.roles)) if (!chars.has(`rpg_${id}`)) errors.push(`RPG角色缺少定义：${id}`)
    if (!def.rpg.maps[def.startSceneId.replace('rpg-map-', '')]) errors.push('RPG开场需要地图场景。')
    if (!scenes.has('rpg-world') || scenes.get('rpg-ending')?.ending !== 'victory') errors.push('RPG缺少星图或结局场景。')
    return { errors, warnings }
  }
  for (const s of def.scenes) {
    if (!chapters.has(s.chapterId)) errors.push(`「${s.title}」缺少有效章节。`)
    if (s.cast.some(id => !chars.has(id))) errors.push(`「${s.title}」的场景角色已不存在。`)
    if (s.objects.length + new Set([...s.cast, ...def.characters.filter(c => c.role === 'player').map(c => c.id)]).size + 1 > 200) errors.push(`「${s.title}」的布局加角色和检定骰超过 200 个物件。`)
    if (s.ending === 'none' && !s.choices.length) errors.push(`「${s.title}」没有可用行动或结局。`)
    if (s.ending !== 'none' && s.choices.length) warnings.push(`「${s.title}」是结局场景，进入后将结束对局，其行动不会执行。`)
    for (const c of s.choices) {
      if (!scenes.has(c.nextSceneId)) errors.push(`「${s.title} / ${c.label}」缺少有效成功去向。`)
      if (c.check && !scenes.has(c.failureSceneId)) errors.push(`「${s.title} / ${c.label}」缺少有效失败去向。`)
      for (const r of c.conditions) if (!(r.type === 'quest' ? quests : vars).has(r.id)) errors.push(`「${c.label}」的条件引用已不存在。`)
      for (const e of [...c.success, ...c.failure]) if (!(e.type === 'quest' ? quests : e.type === 'hp' ? chars : vars).has(e.id)) errors.push(`「${c.label}」的后果引用已不存在。`)
      if (c.check && (c.check.target > c.check.sides + c.check.modifier || c.check.target <= 1 + c.check.modifier)) warnings.push(`「${c.label}」的检定总会失败或总会成功，请检查目标与加值。`)
    }
  }
  const visited = new Set<string>(); const queue = [def.startSceneId]
  while (queue.length) { const id = queue.shift()!; if (visited.has(id) || !scenes.has(id)) continue; visited.add(id); const s = scenes.get(id)!; if (s.ending === 'none') for (const c of s.choices) { queue.push(c.nextSceneId); if (c.check) queue.push(c.failureSceneId) } }
  if (![...visited].some(id => scenes.get(id)?.ending === 'victory')) errors.push('开场路径需要能够到达一个胜利结局。')
  for (const s of def.scenes) if (!visited.has(s.id)) warnings.push(`「${s.title}」尚未从开场连接，可以保留为支线草稿。`)
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] }
}

export function validateAdventureSession(value: unknown): AdventureSession {
  const v = obj(value, '战役对局'); const definition = validateAdventureDefinition(v.definition)
  const audit = auditAdventure(definition); if (audit.errors.length) throw new Error(`战役不可开局：${audit.errors[0]}`)
  const p = obj(v.progress, '战役进度'); if (p.version !== 1) throw new Error('战役进度版本不受支持。')
  const scenes = new Set(definition.scenes.map(s => s.id)); const sceneId = adventureId(p.sceneId); if (!scenes.has(sceneId)) throw new Error('当前战役场景已不存在。')
  const readMap = <T>(value: unknown, entries: {id: string}[], parser: (v: unknown, id: string) => T): Record<string, T> => { const m = obj(value, '战役状态映射'); if (Object.keys(m).length !== entries.length || Object.keys(m).some(id => !entries.some(e => e.id === id))) throw new Error('战役状态引用不完整。'); return Object.fromEntries(entries.map(e => [e.id, parser(m[e.id], e.id)])) }
  const phase = values(p.phase, ['scene', 'rolling', 'result', 'complete'] as const, '战役阶段')
  const progress: AdventureProgress = {
    version: 1, sceneId, phase,
    visited: list(p.visited, '已访问场景', 128).map(adventureId),
    hp: readMap(p.hp, definition.characters, (v, id) => num(v, '角色生命', 0, definition.rpg && p.rpg && obj(p.rpg, 'RPG进度').characters ? 1e6 : definition.characters.find(c => c.id === id)!.maxHp)),
    quests: readMap(p.quests, definition.quests, v => values(v, QUEST_STATES, '任务状态')),
    variables: readMap(p.variables, definition.variables, (v, id) => { const variable = definition.variables.find(v => v.id === id)!; return num(v, '世界变量', variable.min, variable.max) }),
    journal: unique(list(p.journal, '战役纪事', 500).map(value => { const j = obj(value, '纪事'); const sceneId = adventureId(j.sceneId); if (!scenes.has(sceneId)) throw new Error('纪事场景引用无效。'); return { id: adventureId(j.id), text: str(j.text, '纪事内容', 2000, true), time: num(j.time, '纪事时间', 0, Number.MAX_SAFE_INTEGER), sceneId } }), '纪事'),
    lastMessage: str(p.lastMessage, '当前指引', 2000),
    ...(p.rpg === undefined ? {} : { rpg: definition.rpg ? validateRpgProgress(p.rpg, definition.rpg) : (() => { throw new Error('RPG进度缺少作品数据。') })() }),
  }
  if (new Set(progress.visited).size !== progress.visited.length || progress.visited.some(id => !scenes.has(id)) || !progress.visited.includes(sceneId)) throw new Error('已访问场景记录无效。')
  const scene = definition.scenes.find(s => s.id === sceneId)!
  if (p.sceneStates !== undefined) {
    const states = obj(p.sceneStates, '场景物件状态'); let count = 0
    progress.sceneStates = {}
    for (const [sid, value] of Object.entries(states)) {
      const layout = definition.scenes.find(s => s.id === sid); if (!layout) throw new Error('物件状态场景引用无效。')
      const entries = obj(value, '场景物件状态'); const parsed: Record<string, Record<string, boolean>> = {}
      for (const [oid, flags] of Object.entries(entries)) {
        if (++count > 500 || !layout.objects.some(o => o.id === oid)) throw new Error('物件状态引用无效或过多。')
        const raw = obj(flags, '物件状态'); if (Object.keys(raw).some(k => !['opened', 'lit', 'activated', 'emptied', 'taken'].includes(k))) throw new Error('物件状态字段无效。')
        parsed[oid] = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, bool(v, '物件状态')]))
      }
      progress.sceneStates[sid] = parsed
    }
  }
  if (definition.rpg) {
    const rpg = progress.rpg
    if (!rpg || p.pending !== undefined || p.result !== undefined || phase === 'result') throw new Error('RPG进度与叙事模式不一致。')
    if (rpg.characters && Object.entries(rpg.characters).some(([id, c]) => progress.hp[`rpg_${id}`] !== c.hp)) throw new Error('角色档案与生命记录不一致。')
    if (p.outcome !== undefined) progress.outcome = values(p.outcome, ['won', 'lost'] as const, 'RPG胜负')
    if ((phase === 'rolling') !== (rpg.pending?.type === 'roll') || (phase === 'complete') !== !!progress.outcome) throw new Error('RPG阶段与记录不一致。')
    const expected = rpg.mapId === 'world' ? 'rpg-world' : `rpg-map-${rpg.mapId}`
    if (sceneId !== (progress.outcome === 'won' ? 'rpg-ending' : expected)) throw new Error('RPG地图与当前场景不一致。')
    if (phase === 'complete' && (rpg.pending || rpg.frames.length)) throw new Error('RPG结局仍有待执行剧情。')
    return { definition, progress }
  }
  if (p.pending !== undefined) { const x = obj(p.pending, '待决战役检定'); const choiceId = adventureId(x.choiceId); if (!scene.choices.some(c => c.id === choiceId && c.check)) throw new Error('待决战役行动不存在。'); progress.pending = { choiceId, dieId: adventureId(x.dieId), request: num(x.request, '检定请求', 1, Number.MAX_SAFE_INTEGER), generation: num(x.generation, '运行代次', 0, Number.MAX_SAFE_INTEGER) } }
  if (p.result !== undefined) { const x = obj(p.result, '战役检定结果'); const choiceId = adventureId(x.choiceId); const choice = scene.choices.find(c => c.id === choiceId); if (!choice?.check) throw new Error('结果行动不存在。'); const value = num(x.value, '真实骰点', 1, choice.check.sides); const total = num(x.total, '检定总值', -100, 100); const success = bool(x.success, '检定成功'); const nextSceneId = adventureId(x.nextSceneId); if (total !== value + choice.check.modifier || success !== (total >= choice.check.target) || nextSceneId !== (success ? choice.nextSceneId : choice.failureSceneId)) throw new Error('检定结果与规则不一致。'); progress.result = { choiceId, value, total, success, nextSceneId, message: str(x.message, '检定结果描述', 2000) } }
  if (p.outcome !== undefined) progress.outcome = values(p.outcome, ['won', 'lost'] as const, '战役胜负')
  if ((phase === 'rolling') !== !!progress.pending || (phase === 'result') !== !!progress.result || (phase === 'complete') !== !!progress.outcome) throw new Error('战役阶段与记录不一致。')
  const dead = definition.rules.partyDefeat && definition.characters.filter(c => c.role === 'player').every(c => progress.hp[c.id] === 0)
  if (phase !== 'complete' && (dead || scene.ending !== 'none')) throw new Error('满足结局条件的战役必须已结束。')
  if (phase === 'complete' && ((progress.outcome === 'won' && (scene.ending !== 'victory' || dead)) || (progress.outcome === 'lost' && scene.ending !== 'defeat' && !dead))) throw new Error('战役结局与实际条件不一致。')
  return { definition, progress }
}
