import { startRpgAdventure, recoverRpg, rpgSceneObjects } from './rpg-engine.ts'
import { addTableLog, createObject, createTableSession, validateTableSession, type TableObject, type TableSession } from './tabletop.ts'
import { auditAdventure, validateAdventureDefinition, type AdventureChoice, type AdventureDefinition, type AdventureEffect, type AdventureProgress, type AdventureScene } from './adventure-schema.ts'
import { tableBounds, tableSurface } from './table-surface.ts'

export type AdventureAction = { type: 'choose'; choiceId: string } | { type: 'beginRoll'; choiceId: string; dieId: string; request: number; generation: number } | { type: 'resolveRoll'; dieId: string; value: number; request: number; generation: number } | { type: 'continue' } | { type: 'stop' }
export const newAdventureId = () => crypto.randomUUID()
function cloneObject(object: TableObject): TableObject { const copy = structuredClone(object); copy.id = newAdventureId(); if (copy.cards) copy.cards = copy.cards.map(c => ({ ...c, id: newAdventureId() })); return copy }
export function sceneLayoutSnapshot(table: TableSession): TableObject[] {
  return table.objects.filter(o => !['hand', 'inventory'].includes(String(o.metadata.zone)) && o.metadata.adventureDie !== true).map(o => {
    const copy = cloneObject(o)
    for (const key of ['guideState', 'relicGuideDiscard', 'relicGuideEvent', 'characterId', 'hp', 'owner', 'zone', 'sourceDeckId', 'adventureObjectId', 'opened', 'lit', 'activated', 'emptied', 'taken', 'equipped', 'focus', 'guarded', 'poisoned']) delete copy.metadata[key]
    return copy
  })
}
function current(table: TableSession) { const value = table.adventure; if (!value) throw new Error('当前桌面没有战役指引。'); const scene = value.definition.scenes.find(s => s.id === value.progress.sceneId)!; return { ...value, scene } }
function journal(p: AdventureProgress, text: string): AdventureProgress {
  text = text.slice(0, 2000)
  return { ...p, lastMessage: text, journal: [...p.journal.slice(-499), { id: newAdventureId(), text, time: Date.now(), sceneId: p.sceneId }] }
}
function partyDown(def: AdventureDefinition, p: AdventureProgress): boolean { return def.rules.partyDefeat && def.characters.filter(c => c.role === 'player').every(c => p.hp[c.id] === 0) }
function ended(def: AdventureDefinition, scene: AdventureScene, p: AdventureProgress): AdventureProgress {
  const down = partyDown(def, p)
  if (!down && scene.ending === 'none') return p
  return journal({ ...p, phase: 'complete', pending: undefined, result: undefined, outcome: down || scene.ending === 'defeat' ? 'lost' : 'won' }, down ? '全队生命归零，本次战役结束。' : scene.ending === 'victory' ? `战役胜利！${scene.goal || scene.title}` : `战役结束：${scene.goal || scene.title}`)
}
export function sceneObjects(def: AdventureDefinition, scene: AdventureScene, states: Record<string, Record<string, boolean>> = {}): TableObject[] {
  if (def.rpg) return rpgSceneObjects(def, scene.id === 'rpg-world' ? 'world' : scene.id.replace('rpg-map-', ''))
  const bounds = tableBounds(scene), surface = tableSurface(scene)
  const limit = (n: number, axis: 'X' | 'Z') => Math.max(bounds[`min${axis}`] + .3, Math.min(bounds[`max${axis}`] - .3, n))
  let objects = scene.objects.filter(o => !states[o.id]?.taken).map(o => { const copy = cloneObject(o); copy.metadata = { ...copy.metadata, adventureObjectId: o.id, ...states[o.id] }; return copy })
  if (!objects.length) objects = [createObject('board', { name: scene.title, locked: true, position: [0, .05, 0], color: '#718270', metadata: { width: Math.min(14, surface.width - 2), depth: Math.min(10, surface.depth - 2), height: .1 } })]
  const present = new Set(objects.map(o => o.metadata.characterId))
  const cast = def.characters.filter(c => c.role === 'player' || scene.cast.includes(c.id))
  cast.filter(c => !present.has(c.id)).forEach((c, i) => {
    const figure = c.appearance ? cloneObject(c.appearance) : createObject('figurine')
    objects.push({ ...figure, name: c.name, position: [limit(-5 + (i % 6) * 1.8, 'X'), .7, limit(c.role === 'player' ? 2.8 + Math.floor(i / 6) * 1.4 : -2.8, 'Z')], locked: false, scale: [.8, .8, .8], color: c.color, description: c.description, metadata: { ...figure.metadata, characterId: c.id } })
  })
  const sides = scene.choices.find(c => c.check)?.check?.sides ?? 20
  objects.push(createObject('dice', { name: `战役检定 d${sides}`, sides, position: [limit(8, 'X'), .7, 0], metadata: { adventureDie: true } }))
  return objects
}
function notes(def: AdventureDefinition, scene: AdventureScene): string { return `【战役】${def.title}\n${def.summary}\n\n【世界】${def.world.premise}\n\n【当前场景】${scene.title}\n${scene.description}\n\n【目标】${scene.goal}\n规则：${def.rules.name}。按指引选择剧情行动；检定采用真实物理骰点 + 配置加值。进入作者定义的胜利结局才算获胜。`.slice(0, 30000) }
function transition(table: TableSession, nextId: string, p: AdventureProgress): TableSession {
  const def = table.adventure!.definition; const scene = def.scenes.find(s => s.id === nextId)
  if (!scene) throw new Error('行动去向不存在，请检查作品分支。')
  const progress = ended(def, scene, journal({ ...p, sceneId: nextId, phase: 'scene', pending: undefined, result: undefined, visited: [...new Set([...p.visited, nextId])] }, `进入「${scene.title}」。${scene.goal}`))
  const held = table.objects.filter(o => ['hand', 'inventory'].includes(String(o.metadata.zone)))
  return { ...table, surface: scene.surface, grid: { ...table.grid, size: scene.gridSize ?? 1 }, combat: undefined, objects: [...sceneObjects(def, scene, progress.sceneStates?.[scene.id]), ...held], notes: notes(def, scene), adventure: { definition: def, progress } }
}
function save(table: TableSession, p?: AdventureProgress): TableSession {
  let next = p ? { ...table, adventure: { ...table.adventure!, progress: p } } : table
  const { definition, progress } = current(next)
  next = { ...next, objects: next.objects.map(o => {
    const character = definition.characters.find(c => c.id === o.metadata.characterId)
    return character ? { ...o, metadata: { ...o.metadata, hp: progress.hp[character.id] }, description: `${character.description}\n当前生命：${progress.hp[character.id]}/${character.maxHp}` } : o
  }) }
  return validateTableSession(addTableLog(next, progress.lastMessage.slice(0, 1000)))
}
export function startAdventure(value: AdventureDefinition): TableSession {
  const def = validateAdventureDefinition(value); const report = auditAdventure(def); if (report.errors.length) throw new Error(report.errors.join('\n'))
  if (def.rpg) return startRpgAdventure(def)
  const progress: AdventureProgress = { version: 1, sceneId: def.startSceneId, phase: 'scene', visited: [], hp: Object.fromEntries(def.characters.map(c => [c.id, c.maxHp])), quests: Object.fromEntries(def.quests.map(q => [q.id, q.initial])), variables: Object.fromEntries(def.variables.map(v => [v.id, v.initial])), journal: [], lastMessage: '' }
  const table = { ...createTableSession('sandbox'), name: `${def.title.slice(0, 108)} · 战役局`, adventure: { definition: structuredClone(def), progress }, grid: { enabled: true, snap: true, size: 1 } }
  return save(transition(table, def.startSceneId, progress))
}
export function adventureChoiceBlocked(table: TableSession, choice: AdventureChoice): string {
  const { definition: d, progress: p } = current(table)
  for (const r of choice.conditions) {
    if (r.type === 'quest' && p.quests[r.id] !== r.status) return `需要「${d.quests.find(q => q.id === r.id)?.title ?? '任务'}」为${({ locked: '未解锁', active: '进行中', completed: '已完成', failed: '失败' })[r.status]}`
    if (r.type === 'variable' && !(r.operator === 'gte' ? p.variables[r.id] >= r.value : p.variables[r.id] <= r.value)) return `需要「${d.variables.find(v => v.id === r.id)?.name ?? '变量'}」${r.operator === 'gte' ? '至少' : '至多'} ${r.value}`
  }
  return ''
}
function effects(def: AdventureDefinition, p: AdventureProgress, items: AdventureEffect[]): AdventureProgress {
  const next = { ...p, hp: { ...p.hp }, quests: { ...p.quests }, variables: { ...p.variables } }
  for (const e of items) {
    if (e.type === 'quest') next.quests[e.id] = e.status
    else if (e.type === 'hp') { const c = def.characters.find(c => c.id === e.id)!; next.hp[e.id] = Math.max(0, Math.min(c.maxHp, next.hp[e.id] + e.delta)) }
    else { const v = def.variables.find(v => v.id === e.id)!; next.variables[e.id] = Math.max(v.min, Math.min(v.max, next.variables[e.id] + e.delta)) }
  }
  return next
}
export function recoverAdventure(table: TableSession): TableSession {
  if (table.adventure?.definition.rpg) return recoverRpg(table)
  if (table.adventure?.progress.phase !== 'rolling') return table
  const next = validateTableSession(table); const p = next.adventure!.progress
  return save(next, journal({ ...p, phase: 'scene', pending: undefined }, '未完成的投骰已取消，任务、生命和世界变量没有变化。请重新选择剧情行动。'))
}
export function applyAdventureAction(source: TableSession, action: AdventureAction): TableSession {
  if (source.adventure?.definition.rpg) throw new Error('请通过RPG剧情工具执行当前指令。')
  let table = validateTableSession(source)
  if (table.combat && action.type !== 'stop') throw new Error('请先完成并收起战斗，再继续剧情。')
  if (action.type === 'stop') { const { adventure: _adventure, ...free } = table; return validateTableSession(addTableLog(free, '已退出战役指引，当前盘面保留为自由桌面。')) }
  const { definition: def, progress: p, scene } = current(table)
  if (p.phase === 'complete') throw new Error('本局已结束，可以从作品新开一局。')
  if (action.type === 'continue') { if (p.phase !== 'result' || !p.result) throw new Error('请先完成当前检定。'); return save(transition(table, p.result.nextSceneId, p)) }
  if (action.type === 'resolveRoll') {
    const pending = p.pending
    if (p.phase !== 'rolling' || !pending || pending.dieId !== action.dieId || pending.request !== action.request || pending.generation !== action.generation) throw new Error('检定结果已过期或已结算，不会重复执行后果。')
    const c = scene.choices.find(c => c.id === pending.choiceId)!
    if (!Number.isSafeInteger(action.value) || action.value < 1 || action.value > c.check!.sides) throw new Error('真实骰点超出骰型范围。')
    const blocked = adventureChoiceBlocked(table, c); if (blocked) throw new Error(blocked)
    const total = action.value + c.check!.modifier; const success = total >= c.check!.target
    const message = `「${c.label}」：真实 d${c.check!.sides} = ${action.value}，加值 ${c.check!.modifier >= 0 ? '+' : ''}${c.check!.modifier}，总值 ${total} / 目标 ${c.check!.target}，${success ? '成功' : '失败'}。已执行作者配置的${success ? '成功' : '失败'}后果；确认后继续剧情。`
    const next = journal(effects(def, { ...p, phase: 'result', pending: undefined, result: { choiceId: c.id, value: action.value, total, success, nextSceneId: success ? c.nextSceneId : c.failureSceneId, message } }, success ? c.success : c.failure), message)
    table = { ...table, objects: table.objects.map(o => o.id === action.dieId ? { ...o, value: action.value } : o) }
    return save(table, ended(def, scene, next))
  }
  if (p.phase !== 'scene') throw new Error('请先完成当前检定或确认结果。')
  const c = scene.choices.find(c => c.id === action.choiceId); if (!c) throw new Error('当前场景没有这项行动。')
  const blocked = adventureChoiceBlocked(table, c); if (blocked) throw new Error(blocked)
  if (action.type === 'choose') {
    if (c.check) throw new Error('这项行动需要真实投骰。')
    const next = journal(effects(def, p, c.success), `选择「${c.label}」。${c.description}`)
    if (partyDown(def, next)) return save(table, ended(def, scene, next))
    return save(transition(table, c.nextSceneId, next))
  }
  if (!c.check) throw new Error('这项行动不需要投骰。')
  if (!Number.isSafeInteger(action.request) || action.request < 1 || !Number.isSafeInteger(action.generation) || action.generation < 0) throw new Error('检定请求身份无效。')
  const die = table.objects.find(o => o.id === action.dieId && o.kind === 'dice' && o.sides === c.check!.sides)
  if (!die || die.locked || !table.physics.gravity || die.scale.some(v => v !== die.scale[0])) throw new Error('检定需要对应的骰型、等比缩放且解锁的骰子和已开启的重力。')
  table = { ...table, objects: table.objects.map(o => o.id === die.id ? { ...o, value: 0 } : o) }
  return save(table, journal({ ...p, phase: 'rolling', pending: { choiceId: c.id, dieId: die.id, request: action.request, generation: action.generation } }, `正在「${c.label}」，等待真实 d${die.sides}；总值达到 ${c.check.target} 成功。`))
}

/** Bounded context: current chapter, current cast, objectives and established facts, never future branches. */
export function adventureModelContext(table: TableSession) {
  if (!table.adventure) return undefined
  const { definition: d, progress: p, scene } = current(table)
  if (d.rpg && p.rpg) {
    const r = p.rpg, map = d.rpg.maps[r.mapId]
    return { materialType: '坐标RPG已发生事实；AI只叙述和建议，actions必须为空。剧情、骰点和遭遇由运行器结算。', title: d.title, premise: d.world.premise.slice(0, 2000), rules: d.rules.name, scene: map?.name ?? '世界航线', position: { x: r.x, y: r.y }, currentStory: r.message, awaiting: r.pending?.type ?? 'exploration', money: r.money, objective: { name: d.rpg.settings?.objectiveName ?? '星核', collected: r.cores.length, total: d.rpg.settings?.objectiveCount ?? 12 }, roster: r.roster.map(id => ({ name: d.rpg!.roles[id].name, hp: p.hp[`rpg_${id}`], ep: r.characters?.[id]?.ep, level: r.characters?.[id]?.level, learned: r.characters?.[id]?.magics.map(m => ({ id: m.id, proficiency: m.lv })) })), inventory: Object.entries(r.bag).map(([id, count]) => ({ name: d.rpg!.items[id].name, count })), combat: table.combat?.rpg ? { phase: table.combat.phase, round: table.combat.round, currentActor: table.objects.find(o => o.id === table.combat!.order[table.combat!.turn])?.name, lastResolvedAction: table.combat.message, lastDicePool: table.combat.rpg.lastRoll, pendingDice: table.combat.rpg.pending?.rolls?.map(roll => ({ sides: roll.sides, face: roll.value ?? null })), units: Object.entries(table.combat.rpg.units).map(([id, u]) => ({ name: table.objects.find(o => o.id === id)?.name, team: u.roleId ? '队伍' : '敌方', position: [u.x, u.y], hp: u.stats.hp, ep: u.stats.ep, poison: u.stats.poison, stun: u.stun, defending: u.guarded })) } : undefined, recentFacts: [...p.journal.slice(-16), ...table.logs.slice(-12)].sort((a,b) => a.time - b.time).slice(-20).map(j => j.text.slice(0, 1000)) }
  }
  const chapter = d.chapters.find(c => c.id === scene.chapterId)!
  return { materialType: '作者战役材料；规则结算由指引执行，AI 只叙述和解释，不改变剧情进度或编造骰点', title: d.title, world: Object.fromEntries(Object.entries(d.world).map(([k, v]) => [k, v.slice(0, 1000)])), rules: d.rules,
    chapter: { title: chapter.title, summary: chapter.summary.slice(0, 1000) }, scene: { title: scene.title, description: scene.description.slice(0, 4000), goal: scene.goal.slice(0, 1000), gmNotes: scene.gmNotes.slice(0, 2000) },
    cast: d.characters.filter(c => c.role === 'player' || scene.cast.includes(c.id)).map(c => ({ name: c.name, role: c.role, description: c.description.slice(0, 250), secret: c.secret.slice(0, 250), hp: p.hp[c.id], maxHp: c.maxHp })),
    quests: d.quests.filter(q => p.quests[q.id] !== 'locked').slice(0, 30).map(q => ({ title: q.title, status: p.quests[q.id], description: q.description.slice(0, 150) })), variables: d.variables.map(v => ({ name: v.name, value: p.variables[v.id] })), phase: p.phase, lastResult: p.result, recentFacts: p.journal.slice(-12).map(j => j.text.slice(0, 200)) }
}

export function blankAdventure(): AdventureDefinition {
  const chapterId = newAdventureId(); const sceneId = newAdventureId(); const endId = newAdventureId()
  return { schemaVersion: 1, id: newAdventureId(), revision: 0, title: '我的跑团战役', summary: '一部由你定义的合作冒险。', world: { premise: '', history: '', factions: '', tone: '探索、合作与选择', gmNotes: '' }, rules: { name: '自定义叙事 RPG', minPlayers: 1, maxPlayers: 4, partyDefeat: true },
    chapters: [{ id: chapterId, title: '第一章', summary: '从这里开始冒险。' }], characters: [{ id: newAdventureId(), name: '探险者', role: 'player', description: '描述角色背景、动机与能力。', secret: '', maxHp: 6, color: '#7eabb2' }], quests: [], variables: [], startSceneId: sceneId,
    scenes: [{ id: sceneId, chapterId, title: '旅途起点', description: '队伍来到一个未知的地方。写下开场画面与冲突。', gmNotes: '', goal: '选择下一步行动。', ending: 'none', cast: [], objects: [], choices: [{ id: newAdventureId(), label: '完成旅途', description: '这是可编辑的示例分支。', nextSceneId: endId, failureSceneId: '', check: null, conditions: [], success: [], failure: [] }] }, { id: endId, chapterId, title: '冒险结局', description: '队伍完成了这段旅程。', gmNotes: '', goal: '冒险完成。', ending: 'victory', cast: [], objects: [], choices: [] }] }
}
export function epicAdventure(): AdventureDefinition {
  const d = blankAdventure(); d.title = '星陨纪元：黎明之盟'; d.summary = '灰港、星塔与世界裂隙。三章七场景的原创分支战役，可以改写为你的长篇 RPG。'
  d.world = { premise: '七年前，一颗星辰坠入北境。城市失去昼夜的界线，而你们受邀寻找能关闭世界裂隙的星核。', history: '旧帝国在星陨后瓦解。灰港由商会维持秩序，星塔学者寻找碎片，守林人保护被污染的土地。', factions: '灰港商会：重建贸易，希望低风险。\n星塔议会：重视知识，愿意付出代价。\n守林盟约：保护生灵，反对再次使用星核。', tone: '史诗奇幻、合作探索、道德选择；危险可以预告，失败推动故事。', gmNotes: '裂隙来自一次失控的修复仪式。主持人逐渐揭示真相，不要提前透露后续章节。示例检定规则独立于官方规则书。' }
  d.characters[0] = { ...d.characters[0], name: '岚 · 远行者', description: '从灰港出发的斥候，擅长观察，想找回失踪的家人。', secret: '家人的最后线索指向星塔。', maxHp: 6 }
  d.characters.push({ id: newAdventureId(), name: '烛 · 星术师', role: 'player', description: '年轻的星术师，相信星核能够修复世界。', secret: '导师曾参加失控仪式。', maxHp: 6, color: '#c99475' }, { id: newAdventureId(), name: '薇拉 · 守林使者', role: 'npc', description: '守林人的使者，愿意帮助尊重自然的队伍。', secret: '她知道一条避开守卫的山路。', maxHp: 8, color: '#8fae96' })
  d.chapters = ['灰港的余烬', '星塔的盟约', '黎明的代价'].map((title, i) => ({ id: newAdventureId(), title, summary: ['组建队伍，寻找失落星核。', '穿越石门，决定是否争取盟友。', '面对裂隙，在希望与风险间作出选择。'][i] }))
  d.quests = [{ id: 'star-core', title: '找回星核', description: '在松林遗迹找到关闭裂隙的关键。', initial: 'active' }, { id: 'alliance', title: '取得盟友支持', description: '与守林人结盟，为最终仪式准备援助。', initial: 'active' }, { id: 'seal', title: '封闭世界裂隙', description: '带着星核进入最后仪式，成功后返回黎明。', initial: 'locked' }]
  d.variables = [{ id: 'hope', name: '世界希望', initial: 2, min: 0, max: 6 }, { id: 'alarm', name: '危机', initial: 0, min: 0, max: 6 }]
  const sceneIds = ['harbor', 'ruins', 'gate', 'alliance-hall', 'ritual', 'dawn', 'darkness']; d.startSceneId = sceneIds[0]
  const choice = (label: string, next: string, check: AdventureChoice['check'] = null, success: AdventureEffect[] = [], failure: AdventureEffect[] = [], conditions: AdventureChoice['conditions'] = [], failNext = next): AdventureChoice => ({ id: newAdventureId(), label, description: '', nextSceneId: next, failureSceneId: check ? failNext : '', check, conditions, success, failure })
  const check = (target: number) => ({ sides: 20, target, modifier: 2 })
  const q = (id: string, status: 'completed' | 'active'): AdventureEffect => ({ type: 'quest', id, status }); const v = (id: string, delta: number): AdventureEffect => ({ type: 'variable', id, delta }); const hp = (delta: number): AdventureEffect => ({ type: 'hp', id: d.characters[0].id, delta })
  const scenes: [string, string, string, AdventureChoice[]][] = [
    ['灰港招募', '灰色潮水拍打栈桥。守林使者薇拉正在寻找愿意面对北境异变的人。她请你们先找回星核。', '与使者交谈或直接出发。', [choice('争取守林盟约', 'ruins', check(10), [q('alliance', 'completed'), v('hope', 1)], [v('alarm', 1)]), choice('直接前往松林', 'ruins')]],
    ['松林遗迹', '废墟中央的银色根系包裹着一枚星核。踩错石板会触发古老机关。', '取得星核，再前往石门。', [choice('辨识机关，取出星核', 'gate', check(10), [q('star-core', 'completed'), q('seal', 'active')], [hp(-1), v('alarm', 1)], [], 'ruins'), choice('放弃星核，撤离北境', 'darkness')]],
    ['石门岔路', '星塔的石门被巡逻者封锁。峡谷的小径更长，却能避开正面冲突。', '选择进入星塔的路线。', [choice('隐蔽穿过石门', 'alliance-hall', check(12), [], [hp(-1)]), choice('绕行峡谷', 'alliance-hall', null, [v('alarm', 1)])]],
    ['星塔会盟', '学者要求立刻使用星核。守林人担心仪式再次失控。两方需要一个能被信任的承诺。', '决定最后仪式的准备方式。', [choice('召集盟友共同施术', 'ritual', null, [v('hope', 2)], [], [{ type: 'quest', id: 'alliance', status: 'completed' }]), choice('独自承担仪式', 'ritual', null, [v('hope', -1)])]],
    ['裂隙仪式', '天空裂隙像一只缓缓睁开的眼睛。星核发出最后的脉冲；每次失败都会让队伍承受代价。', '完成封闭仪式，或选择撤退。', [choice('稳定星核，封闭裂隙', 'dawn', check(12), [q('seal', 'completed'), v('hope', 1)], [hp(-2), v('alarm', 1)], [{ type: 'quest', id: 'star-core', status: 'completed' }], 'ritual'), choice('带队撤退', 'darkness')]],
    ['黎明回归', '第一缕阳光照回灰港。盟友与陌生人一同迎接归来的队伍。你们的选择成为新纪元的第一段历史。', '裂隙已封闭，黎明之盟成立。', []],
    ['长夜的余波', '队伍离开北境，裂隙仍在扩张。幸存者的故事并未终止，但这次拯救世界的旅程已经结束。', '本次战役未能封闭裂隙。', []],
  ]
  d.scenes = scenes.map(([title, description, goal, choices], i) => ({ id: sceneIds[i], chapterId: d.chapters[i < 2 ? 0 : i < 4 ? 1 : 2].id, title, description, goal, gmNotes: '根据队伍已经发生的选择叙述，不预判骰子；允许玩家描述行动，再使用对应按钮结算。', ending: i === 5 ? 'victory' : i === 6 ? 'defeat' : 'none', cast: i === 0 || i === 3 ? [d.characters[2].id] : [], objects: [], choices }))
  return validateAdventureDefinition(d)
}
