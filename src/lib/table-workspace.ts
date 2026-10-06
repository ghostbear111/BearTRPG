import { createTableSession, validateTableSession, type TableObject, type TableSession } from './tabletop'
import { validateAdventureDefinition, type AdventureDefinition } from './adventure-schema'
import { sceneObjects, startAdventure } from './adventure-engine'
import { createRelicGuidedSession, isRelicGame, readRelicGuide } from './relic-guide'
import { movementRules } from './object-movement'

export function workspaceMode(table: TableSession): 'edit' | 'play' {
  if (table.workspace) return table.workspace.kind === 'draft' ? 'edit' : 'play'
  return table.adventure || table.combat || readRelicGuide(table) || table.name === '冒险工坊 · 交互沙盒' ? 'play' : 'edit'
}

export function canMoveDuringPlay(object: TableObject) {
  return movementRules(object).mode !== 'fixed'
}

/** Authoring a scene uses its initial layout, never a running game's progress. */
export function createSceneDraft(value: AdventureDefinition, sceneId = value.startSceneId): TableSession {
  const definition = validateAdventureDefinition(value)
  const scene = definition.scenes.find(s => s.id === sceneId)
  if (!scene) throw new Error('请选择一个场景进行布置。')
  const objects = sceneObjects(definition, scene).filter(o => !o.metadata.adventureDie).map(o => {
    const authored = scene.objects.find(item => item.id === o.metadata.adventureObjectId)
    const copy = structuredClone(authored ?? o)
    delete copy.metadata.adventureObjectId
    if (definition.rpg && copy.metadata.rpgGenerated) copy.locked = true
    return copy
  })
  return validateTableSession({ ...createTableSession('sandbox'), name: `${definition.title.slice(0, 70)} · ${scene.title.slice(0, 40)}`, objects, notes: scene.gmNotes,
    ...(definition.tavern ? { tavern: structuredClone(definition.tavern) } : {}),
    ...(scene.surface ? { surface: scene.surface } : {}), grid: { enabled: true, snap: true, size: scene.gridSize ?? 1 },
    workspace: { kind: 'draft', definition, sceneId } })
}

/** Keep role references and authored object IDs stable across layout edits. */
export function captureSceneDraft(table: TableSession): AdventureDefinition | undefined {
  if (!table.workspace?.definition) return undefined
  const definition = structuredClone(table.workspace.definition)
  if (table.tavern) definition.tavern = structuredClone(table.tavern)
  const scene = definition.scenes.find(s => s.id === table.workspace!.sceneId)
  if (scene) {
    scene.surface = table.surface; scene.gridSize = table.grid.size
    scene.gmNotes = table.notes
    scene.objects = table.objects.filter(o => !o.metadata.adventureDie && !(definition.rpg && o.metadata.rpgGenerated) && !['hand', 'inventory'].includes(String(o.metadata.zone))).map(o => {
    const copy = structuredClone(o)
    for (const key of ['hp', 'focus', 'guarded', 'poisoned', 'adventureObjectId', 'guideState', 'sourceDeckId', 'owner', 'zone']) delete copy.metadata[key]
    return copy
    })
  }
  return validateAdventureDefinition(definition)
}

export function editorDraftFromGame(source: TableSession): TableSession {
  if (source.adventure) return createSceneDraft(source.adventure.definition)
  const copy = structuredClone(source)
  delete copy.adventure; delete copy.combat; delete copy.campaign
  copy.id = crypto.randomUUID(); copy.createdAt = Date.now(); copy.logs = []
  copy.workspace = { kind: 'draft' }
  for (const o of copy.objects) {
    delete o.metadata.guideState
    for (const key of ['focus', 'guarded', 'poisoned']) delete o.metadata[key]
  }
  return validateTableSession(copy)
}

export function startEditorGame(source: TableSession, returnTo?: 'story'): TableSession {
  if (workspaceMode(source) !== 'edit') throw new Error('请先返回编辑器，再开始新的试玩。')
  const definition = captureSceneDraft(source)
  let next = definition ? startAdventure(definition) : isRelicGame(source) ? createRelicGuidedSession(source) : validateTableSession({ ...structuredClone(source), id: crypto.randomUUID(), createdAt: Date.now(), logs: [], workspace: undefined })
  next = validateTableSession({ ...next, ...(source.tavern ? { tavern: structuredClone(source.tavern) } : {}), workspace: { kind: 'play', sourceId: source.id, ...(returnTo ? { returnTo } : {}) } })
  return next
}
