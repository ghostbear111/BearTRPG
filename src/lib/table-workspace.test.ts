import { describe, expect, it } from 'vitest'
import { createObject, createTableSession, validateTableSession } from './tabletop'
import { createWorkshopTable } from './play-kit'
import { interact, changeHealth } from './object-play'
import { epicAdventure, startAdventure } from './adventure-engine'
import { gameSessions } from './game-catalog'
import { canMoveDuringPlay, captureSceneDraft, createSceneDraft, editorDraftFromGame, startEditorGame, workspaceMode } from './table-workspace'

describe('editor and player workspaces', () => {
  it('opens old games in play mode while ordinary tables remain editable', () => {
    expect(workspaceMode(createTableSession('sandbox'))).toBe('edit')
    expect(workspaceMode(startAdventure(epicAdventure()))).toBe('play')
    expect(workspaceMode(createWorkshopTable())).toBe('play')
    expect(workspaceMode(editorDraftFromGame(createWorkshopTable()))).toBe('edit')
  })
  it('starts an independent snapshot; loot, health and physics positions cannot change the draft', () => {
    const draft = editorDraftFromGame(createWorkshopTable())
    const before = structuredClone(draft)
    let run = startEditorGame(draft)
    const chest = run.objects.find(o => o.metadata.model === 'chest')!
    run = interact(interact(run, chest.id, 'open'), chest.id, 'loot')
    run = changeHealth(run, run.objects.find(o => o.kind === 'figurine')!.id, -2)
    run.objects[0].position[0] = 9
    expect(draft).toEqual(before)
    expect(run.workspace).toEqual({ kind: 'play', sourceId: draft.id })
    expect(run.id).not.toBe(draft.id)
    expect(validateTableSession(JSON.parse(JSON.stringify(run))).workspace).toEqual(run.workspace)
  })
  it('a second test begins from the authored state, not the previous game', () => {
    const draft = editorDraftFromGame(createWorkshopTable())
    const first = startEditorGame(draft)
    const chest = first.objects.find(o => o.metadata.model === 'chest')!
    const changed = interact(first, chest.id, 'open')
    const second = startEditorGame(draft)
    expect(changed.objects.find(o => o.id === chest.id)!.metadata.opened).toBe(true)
    expect(second.objects.find(o => o.id === chest.id)!.metadata.opened).toBeFalsy()
    expect(second.id).not.toBe(first.id)
  })
  it('opens a story for authoring without its active progress or physical dice', () => {
    const run = startAdventure(epicAdventure())
    const before = structuredClone(run)
    const draft = editorDraftFromGame(run)
    expect(draft.adventure).toBeUndefined()
    expect(draft.combat).toBeUndefined()
    expect(draft.workspace!.definition!.title).toBe(run.adventure!.definition.title)
    expect(draft.objects.some(o => o.metadata.adventureDie)).toBe(false)
    expect(run).toEqual(before)
  })
  it('round trips edited scene layouts and role references into playable stories', () => {
    const draft = createSceneDraft(epicAdventure())
    const character = draft.objects.find(o => o.metadata.characterId)!
    character.position = [1, .7, 1]
    const prop = createObject('block', { name: '测试入口', metadata: { model: 'door', behavior: 'open' } })
    draft.objects.push(prop)
    const definition = captureSceneDraft(draft)!
    const scene = definition.scenes.find(s => s.id === draft.workspace!.sceneId)!
    expect(scene.objects.find(o => o.id === character.id)!.metadata.characterId).toBe(character.metadata.characterId)
    const run = startEditorGame(draft, 'story')
    expect(run.objects.find(o => o.metadata.characterId === character.metadata.characterId)!.position).toEqual([1, .7, 1])
    expect(run.objects.filter(o => o.metadata.characterId === character.metadata.characterId)).toHaveLength(1)
    expect(run.objects.some(o => o.name === '测试入口')).toBe(true)
    expect(run.workspace!.returnTo).toBe('story')
    expect(draft.workspace!.definition!.scenes.find(s => s.id === scene.id)!.objects).not.toEqual(scene.objects)
  })
  it('preserves a non-opening scene without changing the starting scene of the story', () => {
    const definition = epicAdventure()
    const sceneId = definition.scenes[1].id
    const draft = createSceneDraft(definition, sceneId)
    draft.objects.push(createObject('block', { name: '第二场景的道具' }))
    const captured = captureSceneDraft(draft)!
    expect(captured.startSceneId).toBe(definition.startSceneId)
    expect(captured.scenes[1].objects.some(o => o.name === '第二场景的道具')).toBe(true)
    expect(captured.scenes[0]).toEqual(definition.scenes[0])
  })
  it('reopening an authored scene keeps object and deck card IDs without repeated cloning', () => {
    const draft = createSceneDraft(epicAdventure())
    const deck = createObject('deck')
    draft.objects.push(deck)
    const definition = captureSceneDraft(draft)!
    const reopened = createSceneDraft(definition)
    expect(reopened.objects.map(o => o.id)).toEqual(draft.objects.map(o => o.id))
    expect(reopened.objects.find(o => o.id === deck.id)!.cards).toEqual(deck.cards)
    expect(captureSceneDraft(reopened)).toEqual(definition)
  })
  it('rejects mixed authoring and runtime saves, invalid scene references and self references', () => {
    const run = startAdventure(epicAdventure())
    expect(() => validateTableSession({ ...run, workspace: { kind: 'draft' } })).toThrow('对局进度')
    const draft = createSceneDraft(epicAdventure())
    expect(() => validateTableSession({ ...draft, workspace: { ...draft.workspace, sceneId: 'missing' } })).toThrow('编辑场景')
    expect(() => validateTableSession({ ...draft, workspace: { kind: 'play', definition: epicAdventure() } })).toThrow('编辑草稿')
    expect(() => validateTableSession({ ...draft, workspace: { kind: 'play', sourceId: draft.id } })).toThrow('自身')
    expect(() => startEditorGame(run)).toThrow('返回编辑器')
  })
  it('lists arbitrary authored games as resumable sessions and excludes drafts', () => {
    const draft = editorDraftFromGame(createWorkshopTable()); draft.name = '自制游戏'
    const run = startEditorGame(draft)
    expect(gameSessions([draft, run]).map(t => t.id)).toEqual([run.id])
  })
  it('uses authored movement rules while retaining safe defaults for old objects', () => {
    expect(canMoveDuringPlay(createObject('figurine'))).toBe(true)
    expect(canMoveDuringPlay(createObject('card'))).toBe(true)
    expect(canMoveDuringPlay(createObject('block'))).toBe(false)
    expect(canMoveDuringPlay(createObject('figurine', { locked: true }))).toBe(false)
    expect(canMoveDuringPlay(createObject('dice'))).toBe(false)
    expect(canMoveDuringPlay(createObject('figurine', { metadata: { moveMode: 'fixed' } }))).toBe(false)
    expect(canMoveDuringPlay(createObject('block', { metadata: { moveMode: 'grid' } }))).toBe(true)
  })
})
