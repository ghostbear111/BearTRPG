import bundled from '../../tests/fixtures/story.adventure.json'
import { describe, expect, it, vi } from 'vitest'
import { BUILTIN_GAMES, campaignForModule, campaignGroups, campaignModuleId, createCampaignSave, gameSessions, loadBuiltinAdventure, playableAdventure, touchCampaignSave } from './game-catalog'
import { blankAdventure, startAdventure } from './adventure-engine'
import { createTableSession, validateTableSession } from './tabletop'
import { editorDraftFromGame } from './table-workspace'

describe('discoverable games independent of browser author cache', () => {
  it('has no built-in game content and does not request removed bundles', async () => {
    expect(BUILTIN_GAMES).toEqual([])
    const fetcher = vi.fn<typeof fetch>()
    await expect(loadBuiltinAdventure('starfall', fetcher)).rejects.toThrow('不存在')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('starts user stories as independent matches without copying old progress', () => {
    const one = startAdventure(playableAdventure(bundled.definition))
    one.adventure!.progress.variables.hope = 5
    const two = startAdventure(playableAdventure(bundled.definition))
    expect(two.id).not.toBe(one.id); expect(two.adventure!.progress.variables.hope).toBe(2)
  })
  it('rejects incomplete user games without creating a match', () => {
    const draft = blankAdventure(); draft.scenes[0].choices[0].nextSceneId = ''
    expect(() => playableAdventure(draft)).toThrow('创作工坊完善')
  })
  it('lists actual saved sessions with their IDs and progress rather than restarting them', () => {
    const older = startAdventure(blankAdventure()); const latest = startAdventure(playableAdventure(bundled.definition))
    older.createdAt = 10; latest.createdAt = 20
    older.logs.forEach(log => log.time = 10); latest.logs.forEach(log => log.time = 20)
    older.adventure!.progress.journal[0].time = 10; latest.adventure!.progress.journal[0].time = 20
    const source = structuredClone(latest)
    const sessions = gameSessions([older, createTableSession('sandbox'), latest])
    expect(sessions.map(s => s.id)).toEqual([latest.id, older.id])
    expect(sessions[0].detail).toContain('灰港招募 · 1/7 场景 · 进行中')
    expect(latest).toEqual(source)
  })
})

describe('campaign saves and continuing an existing run', () => {
  it('groups user modules by ID and never merges different same-title works', () => {
    const one = startAdventure(blankAdventure())
    const two = startAdventure({ ...blankAdventure(), title: one.adventure!.definition.title })
    expect(campaignModuleId(one)).not.toBe(campaignModuleId(two))
    expect(gameSessions([one, two])).toHaveLength(2)
  })

  it('keeps same-title author works separate while finding saves made before a revision change', () => {
    const one = blankAdventure(), two = { ...blankAdventure(), title: one.title }
    const savedOne = startAdventure(one), savedTwo = startAdventure(two)
    const saves = gameSessions([savedOne, savedTwo])
    expect(campaignGroups(saves)).toHaveLength(2)
    const revisedWork = startAdventure({ ...one, revision: 2, title: '改写后的世界' })
    expect(campaignForModule(saves, campaignModuleId(revisedWork))?.id).toBe(savedOne.id)
    expect(campaignForModule(saves, `adventure-${two.id}`)?.id).toBe(savedTwo.id)
  })

  it('prefers unfinished progress and offers a finished save instead of silently creating a new one', () => {
    const definition = playableAdventure(bundled.definition)
    const ongoing = createCampaignSave(startAdventure(definition), [], undefined, 100)
    const finished = createCampaignSave(startAdventure(definition), [ongoing], undefined, 200)
    finished.adventure!.progress.phase = 'complete'; finished.adventure!.progress.outcome = 'won'
    ongoing.createdAt = 100; finished.createdAt = 200
    ongoing.logs = []; finished.logs = []
    ongoing.adventure!.progress.journal = []; finished.adventure!.progress.journal = []
    const saves = gameSessions([ongoing, finished])
    expect(saves[0].id).toBe(finished.id)
    expect(campaignForModule(saves, 'adventure-builtin-starfall')?.id).toBe(ongoing.id)
    expect(campaignForModule(saves.filter(save => save.complete), 'adventure-builtin-starfall')?.id).toBe(finished.id)
  })

  it('resumes the same snapshot without allocating a new session or losing choices and inventory', () => {
    const original = createCampaignSave(startAdventure(playableAdventure(bundled.definition)), [], undefined, 100)
    original.adventure!.progress.variables.hope = 5
    original.notes = '玩家周末继续，保留我们的桌面记录'
    const before = structuredClone(original)
    const resumed = validateTableSession(touchCampaignSave(original, 500))
    expect(resumed.id).toBe(original.id)
    expect(resumed.createdAt).toBe(original.createdAt)
    expect(resumed.adventure).toEqual(original.adventure)
    expect(resumed.objects).toEqual(original.objects)
    expect(resumed.logs).toEqual(original.logs)
    expect(resumed.notes).toBe(original.notes)
    expect(resumed.campaign?.lastPlayedAt).toBe(500)
    expect(original).toEqual(before)
  })

  it('creates independent named saves only for explicit new games and survives JSON reload', () => {
    const definition = playableAdventure(bundled.definition)
    const one = createCampaignSave(startAdventure(definition), [])
    one.adventure!.progress.variables.hope = 5
    const two = createCampaignSave(startAdventure(definition), [one])
    expect(one.campaign?.name).toBe('跑团 1'); expect(two.campaign?.name).toBe('跑团 2')
    expect(two.id).not.toBe(one.id)
    expect(two.adventure!.progress.variables.hope).toBe(2)
    const reloaded = [one, two].map(save => validateTableSession(JSON.parse(JSON.stringify(save))))
    expect(campaignGroups(gameSessions(reloaded))).toHaveLength(1)
    expect(gameSessions(reloaded).map(save => save.saveName)).toEqual(expect.arrayContaining(['跑团 1', '跑团 2']))
  })

  it('retains explicit author provenance even when the source matches a bundled story', () => {
    const save = createCampaignSave(startAdventure(playableAdventure(bundled.definition)), [], 'adventure-author-copy')
    expect(campaignModuleId(save)).toBe('adventure-author-copy')
    expect(campaignForModule(gameSessions([save]), 'adventure-builtin-starfall')).toBeUndefined()
  })

  it('keeps campaign metadata out of an editor fork and rejects corrupt save information', () => {
    const table = createCampaignSave({ ...createTableSession('sandbox'), workspace: { kind: 'play' } }, [])
    expect(editorDraftFromGame(table).campaign).toBeUndefined()
    expect(() => validateTableSession({ ...table, workspace: { kind: 'draft' } })).toThrow('编辑稿')
    expect(() => validateTableSession({ ...table, campaign: { ...table.campaign, name: '  ' } })).toThrow('跑团名称')
    expect(() => validateTableSession({ ...table, campaign: { ...table.campaign, lastPlayedAt: -1 } })).toThrow('最近游玩时间')
    expect(() => validateTableSession({ ...table, campaign: { ...table.campaign, moduleId: '__proto__' } })).toThrow('格式不安全')
  })
})
