import { describe, expect, it } from 'vitest'
import { adventureFromRpg, applyRpgAction, blankRpgAdventure, startRpgAdventure } from './rpg-engine'
import { syncRpgCharacters } from './rpg-battle'
import { applyAdventureAction, blankAdventure, startAdventure } from './adventure-engine'
import { rpgStoryKey } from './rpg-story-presentation'
import { adventureStoryKey } from './adventure-story-presentation'
import { validateTableSession, type TableSession } from './tabletop'
import type { RpgOp } from './rpg-schema'

function story(script: RpgOp[]) {
  const d = blankRpgAdventure(), db = d.rpg!
  db.maps.camp.events = [{ id: 'test', x: 3, y: 9, trigger: 'interact', script }]
  return applyRpgAction(startRpgAdventure(adventureFromRpg(db, d)), { type: 'event', kind: 'events', index: 0 })
}
function completedBattle(won: boolean) {
  const t = story([{ op: 'battle', enemies: ['guard'], onWin: [{ op: 'talk', text: '胜利后的剧情' }, { op: 'choice', text: '下一步？', options: [{ t: '启程', s: [] }] }] }])
  // A valid persisted battle at the moment the last opponent falls, before story settlement.
  for (const [id, unit] of Object.entries(t.combat!.rpg!.units)) if (Boolean(unit.roleId) !== won) { unit.stats.hp = 0; t.objects.find(o => o.id === id)!.metadata.hp = 0 }
  t.combat!.phase = 'complete'; t.combat!.winner = won ? '队伍' : '敌方'; t.combat!.message = won ? '队伍获胜。' : '队伍战败。'
  return validateTableSession(syncRpgCharacters(t))
}
function failedCheck() {
  const d = blankAdventure(), c = d.scenes[0].choices[0]
  c.check = { sides: 6, target: 4, modifier: 0 }; c.failureSceneId = d.startSceneId
  c.failure = [{ type: 'hp', id: d.characters[0].id, delta: -1 }]
  const t = startAdventure(d), dieId = t.objects.find(o => o.kind === 'dice')!.id
  const rolling = applyAdventureAction(t, { type: 'beginRoll', choiceId: c.id, dieId, request: 7, generation: 0 })
  return { t, rolling, failed: applyAdventureAction(rolling, { type: 'resolveRoll', dieId, value: 1, request: 7, generation: 0 }) }
}

describe('central story routing for all outcomes', () => {
  it('shows battle defeat before settlement and the loss ending after confirmation', () => {
    const lost = completedBattle(false), snapshot = structuredClone(lost)
    expect(rpgStoryKey(lost)).toBeTruthy(); expect(lost).toEqual(snapshot)
    const reopened = validateTableSession(JSON.parse(JSON.stringify(lost)))
    expect(rpgStoryKey(reopened)).toBe(rpgStoryKey(lost))
    const ended = applyRpgAction(reopened, { type: 'finishBattle' })
    expect(ended.adventure!.progress.outcome).toBe('lost')
    expect(rpgStoryKey(ended)).toBeTruthy(); expect(rpgStoryKey(ended)).not.toBe(rpgStoryKey(lost))
    expect(ended.adventure!.progress.rpg!.money).toBe(lost.adventure!.progress.rpg!.money)
  })
  it('keeps victory settlement, follow-up dialogue and choices in the center', () => {
    const won = completedBattle(true), talk = applyRpgAction(won, { type: 'finishBattle' }), choice = applyRpgAction(talk, { type: 'next' })
    expect(rpgStoryKey(won)).toBeTruthy(); expect(rpgStoryKey(talk)).toBeTruthy(); expect(rpgStoryKey(choice)).toBeTruthy()
    expect(new Set([rpgStoryKey(won), rpgStoryKey(talk), rpgStoryKey(choice)]).size).toBe(3)
    expect(choice.adventure!.progress.rpg!.pending!.type).toBe('choice')
    expect(() => applyRpgAction(choice, { type: 'next' })).toThrow('选项')
  })
  it('shows the actual failed RPG check branch and its subsequent choices', () => {
    const rolling = story([{ op: 'if', cond: { rnd: .5 }, then: [{ op: 'talk', text: '成功' }], else: [{ op: 'talk', text: '失败后仍可继续' }, { op: 'choice', text: '如何应对？', options: [{ t: '重整旗鼓', s: [] }] }] }])
    expect(rpgStoryKey(rolling)).toBeNull()
    const p = rolling.adventure!.progress.rpg!.pending!
    const talk = applyRpgAction(rolling, { type: 'resolve', dieId: p.dieId!, value: 20, request: p.request!, generation: p.generation! })
    const choice = applyRpgAction(talk, { type: 'next' })
    expect(talk.adventure!.progress.lastMessage).toBe('失败后仍可继续')
    expect(rpgStoryKey(talk)).toBeTruthy(); expect(rpgStoryKey(choice)).not.toBe(rpgStoryKey(talk))
  })
  it('keeps active combat and draft editing free of story overlays', () => {
    const battle = story([{ op: 'battle', enemies: ['guard'], onWin: [] }])
    expect(rpgStoryKey(battle)).toBeNull()
    const completed = completedBattle(false); completed.workspace = { kind: 'draft' }
    expect(rpgStoryKey(completed)).toBeNull()
  })
  it('reopens a failed check and its return scene without replaying damage', () => {
    const { t, rolling, failed } = failedCheck()
    expect(adventureStoryKey(t)).toBeTruthy(); expect(adventureStoryKey(rolling)).toBeNull(); expect(adventureStoryKey(failed)).toBeTruthy()
    const next = applyAdventureAction(failed, { type: 'continue' })
    expect(next.adventure!.progress.phase).toBe('scene'); expect(next.adventure!.progress.hp).toEqual(failed.adventure!.progress.hp)
    expect(adventureStoryKey(next)).not.toBe(adventureStoryKey(t)); expect(adventureStoryKey(next)).not.toBe(adventureStoryKey(failed))
    expect(adventureStoryKey(validateTableSession(JSON.parse(JSON.stringify(failed))))).toBe(adventureStoryKey(failed))
  })
  it('shows generic defeat endings even when loss interrupts a winning choice', () => {
    const d = blankAdventure(); d.scenes[0].choices[0].success = [{ type: 'hp', id: d.characters[0].id, delta: -999 }]
    const lost = applyAdventureAction(startAdventure(d), { type: 'choose', choiceId: d.scenes[0].choices[0].id })
    expect(lost.adventure!.progress.outcome).toBe('lost'); expect(adventureStoryKey(lost)).toBeTruthy()
  })
  it('does not reopen an explored scene on object physics and excludes RPG and drafts', () => {
    const { t } = failedCheck(), moved = structuredClone(t)
    moved.objects[0].rotation = [0, .2, 0]; expect(adventureStoryKey(moved)).toBe(adventureStoryKey(t))
    const draft: TableSession = { ...t, workspace: { kind: 'draft' } }; expect(adventureStoryKey(draft)).toBeNull()
    expect(adventureStoryKey(completedBattle(false))).toBeNull()
  })
})
