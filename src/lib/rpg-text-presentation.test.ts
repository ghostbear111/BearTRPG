import { describe, expect, it } from 'vitest'
import presets from '../../public/modules/bear-tavern/tools/text-apng-maker/js/presets.js?raw'
import fonts from '../../public/modules/bear-tavern/tools/text-apng-maker/js/fonts.js?raw'
import engine from '../../public/modules/bear-tavern/tools/text-apng-maker/js/engine.js?raw'
import encoder from '../../public/modules/bear-tavern/tools/text-apng-maker/js/apng-encoder.js?raw'
import service from '../../public/modules/bear-tavern/tools/text-apng-maker/js/render-service.js?raw'
import bundled from '../../tests/fixtures/rpg.db.json'
import { adventureFromRpg, applyRpgAction, blankRpgAdventure, startRpgAdventure } from './rpg-engine'
import { applyRpgBattleAction } from './rpg-battle'
import { rpgTextConfig, rpgTextCues, rpgTextSnapshot, rpgTextEnabled, type RpgTextKind } from './rpg-text-presentation'
import { validateRpgDatabase, type RpgOp } from './rpg-schema'
import { validateTableSession, type TableSession } from './tabletop'

function story(script: RpgOp[], guardHp = 5000) {
  const d = blankRpgAdventure(), db = d.rpg!
  db.settings!.textStyle = 'animated'
  db.roles.friend = { name: '冒险旅伴', hp: 100 }
  db.roles.hero.speed = 30; db.roles.hero.magics = ['spark']
  db.enemies.guard.hp = guardHp
  db.magics.spark = { name: '星火之刃', school: 1, ept: 2, area: 'point', dist: 15, power: 20, ep: 0 }
  db.maps.camp.events = [{ id: 'test', x: 3, y: 9, trigger: 'interact', script }]
  return startRpgAdventure(adventureFromRpg(db, d))
}
const snapshot = (t: TableSession) => rpgTextSnapshot(t)!
const events = (a: TableSession | null, b: TableSession) => rpgTextCues(a ? snapshot(a) : null, snapshot(b))
const enter = (t: TableSession) => applyRpgAction(t, { type: 'event', kind: 'events', index: 0 })
function cast(t: TableSession) { return applyRpgBattleAction(t, { type: 'skill', id: 'spark', x: 10, y: 2 }, { request: 7, generation: 0 }) }
function settle(t: TableSession) {
  let result = t
  for (const die of t.combat!.rpg!.pending!.rolls!) result = applyRpgBattleAction(result, { type: 'resolve', dieId: die.dieId, value: 4, request: 7, generation: 0 })
  return result
}

describe('RPG automatic text presentation', () => {
  it('enables animation only when the author chooses it', () => {
    const d = adventureFromRpg(bundled.db)
    expect(d.rpg!.settings!.textStyle).toBe('animated')
    expect(rpgTextEnabled(d)).toBe(true)
    delete d.rpg!.settings!.textStyle
    expect(rpgTextEnabled(d)).toBe(false)
    d.rpg!.settings!.textStyle = 'plain'
    expect(rpgTextEnabled(d)).toBe(false)
    expect(rpgTextEnabled(blankRpgAdventure())).toBe(false)
    expect(() => validateRpgDatabase({ ...d.rpg, settings: { ...d.rpg!.settings, textStyle: 'invalid' } })).toThrow('文字样式')
  })
  it('plays the current location on entry without replaying rewards stored in history', () => {
    const t = story([]); t.adventure!.progress.rpg!.cores = [1]
    const original = structuredClone(t)
    expect(events(null, t).map(c => c.kind)).toEqual(['scene'])
    expect(events(null, t)[0].text).toBe('旅途起点')
    expect(t).toEqual(original)
    expect(events(t, validateTableSession(JSON.parse(JSON.stringify(t))))).toEqual([])
  })
  it('ignores movement, object physics, selection and repeated renders', () => {
    const t = story([]), moved = applyRpgAction(t, { type: 'move', x: 2, y: 10 })
    expect(events(t, moved)).toEqual([])
    const physical = structuredClone(moved); physical.objects[0].rotation = [0, .2, 0]
    expect(events(moved, physical)).toEqual([])
    expect(events(moved, moved)).toEqual([])
  })
  it('announces a new speaker and choices without repeating the banner on each sentence', () => {
    const t = story([{ op: 'talk', name: '旅人', text: '第一句话。' }, { op: 'talk', name: '旅人', text: '第二句话。' }, { op: 'choice', text: '去哪儿？', options: [{ t: '启程', s: [] }] }])
    const first = enter(t), second = applyRpgAction(first, { type: 'next' }), choice = applyRpgAction(second, { type: 'next' })
    expect(events(t, first).map(c => c.kind)).toEqual(['dialogue'])
    expect(events(first, second)).toEqual([])
    expect(snapshot(first).pending!.key).not.toBe(snapshot(second).pending!.key)
    expect(events(second, choice).map(c => c.kind)).toEqual(['choice'])
  })
  it('announces map changes and new matches exactly once', () => {
    const t = story([]), world = applyRpgAction(t, { type: 'world' })
    expect(events(t, world)[0].text).toBe('星图航线')
    expect(events(world, world)).toEqual([])
    expect(events(t, story([]))[0].kind).toBe('scene')
  })
  it('retains a script’s item reward even when the following dialogue replaces the status message', () => {
    const t = story([{ op: 'get', item: 'm_small', n: 2 }, { op: 'talk', text: '这些物资会帮到你。' }]), next = enter(t)
    expect(next.adventure!.progress.lastMessage).toBe('这些物资会帮到你。')
    expect(events(t, next)[0]).toMatchObject({ kind: 'reward', text: '物品已入袋', subText: '获得生命药剂。' })
    expect(events(next, next)).toEqual([])
  })
  it('uses actual dice requests and waits for the whole pool before announcing a result', () => {
    const t = story([{ op: 'battle', title: '星火试炼', enemies: ['guard'], onWin: [] }]), battle = enter(t)
    expect(events(t, battle).map(c => c.kind)).toEqual(['battle'])
    const rolling = cast(battle)
    expect(events(battle, rolling)[0]).toMatchObject({ kind: 'skill', text: '星火之刃' })
    const partial = applyRpgBattleAction(rolling, { type: 'resolve', dieId: rolling.combat!.pending!.dieId, value: 4, request: 7, generation: 0 })
    expect(events(rolling, partial)).toEqual([])
    const final = settle(rolling)
    expect(events(partial, final).map(c => c.kind)).toEqual(['success'])
    expect(events(final, final)).toEqual([])
    const cancelled = applyRpgBattleAction(rolling, { type: 'cancel' })
    expect(events(rolling, cancelled)).toEqual([])
  })
  it('gives victory priority over the final attack and announces actual settlement rewards', () => {
    const t = story([{ op: 'battle', enemies: ['guard'], onWin: [{ op: 'core', n: 1 }, { op: 'join', role: 'friend' }, { op: 'talk', text: '旅伴同行。' }] }], 1)
    const rolling = cast(enter(t)), won = settle(rolling)
    expect(events(rolling, won).map(c => c.text)).toEqual(['队伍获胜'])
    expect(events(won, won)).toEqual([])
    const reward = applyRpgAction(won, { type: 'finishBattle' })
    expect(events(won, reward).map(c => c.text)).toEqual(expect.arrayContaining(['获得遗物', '新的同行者', '战利品已入袋']))
    expect(events(reward, reward)).toEqual([])
  })
  it('announces each new battle round once and distinguishes symbol-pool failure', () => {
    const t = story([{ op: 'battle', enemies: ['guard'], onWin: [] }]), battle = enter(t)
    const nextRound = structuredClone(battle); nextRound.combat!.round++
    expect(events(battle, nextRound).map(c => c.text)).toEqual(['第 2 轮'])
    expect(events(nextRound, nextRound)).toEqual([])
    const pool = nextRound.adventure!.definition.rpg!.magics.spark as { dicePool?: unknown }
    pool.dicePool = { dice: [{ sides: 6, count: 2 }], mode: 'success', modifier: 0, multiplier: 1, successTarget: 6 }
    const rolling = cast(nextRound), final = settle(rolling)
    expect(events(rolling, final)[0]).toMatchObject({ kind: 'failure', text: '招式未奏效', subText: '0 成功' })
  })
  it('does not invent a check result when cancelled or reopened and honors the real branch', () => {
    const t = story([{ op: 'if', cond: { rnd: .5 }, then: [{ op: 'talk', text: '成功分支。' }], else: [{ op: 'talk', text: '失败分支。' }] }])
    const rolling = enter(t), p = rolling.adventure!.progress.rpg!.pending!
    expect(events(t, rolling)[0].text).toBe('命运检定')
    const done = applyRpgAction(rolling, { type: 'resolve', dieId: p.dieId!, value: 16, request: p.request!, generation: p.generation! })
    expect(events(rolling, done)[0]).toMatchObject({ kind: 'failure', text: '命运检定失败', subText: 'd20 · 16 / 10' })
    expect(events(done, done)).toEqual([])
  })
  it('plays the ending once and bounds long player-authored headings', () => {
    const t = story([{ op: 'talk', name: '名'.repeat(100), text: '剧情' }, { op: 'ending' }]), talk = enter(t)
    expect(Array.from(events(t, talk)[0].text).length).toBeLessThanOrEqual(22)
    const end = applyRpgAction(talk, { type: 'next' })
    expect(events(talk, end).map(c => c.kind)).toEqual(['ending'])
    expect(events(end, end)).toEqual([])
  })
  it('normalizes every design with the original renderer and keeps fonts local and loops finite', () => {
    const sandbox = {} as { TextApngService: { normalizeConfig(config: ReturnType<typeof rpgTextConfig>): { scene: object; exportOptions: object } } }
    // Load the exact vendored browser sources without requiring a browser canvas.
    for (const script of [presets, fonts, engine, encoder, service]) new Function('window', script)(sandbox)
    const kinds: RpgTextKind[] = ['scene', 'dialogue', 'choice', 'battle', 'round', 'skill', 'success', 'failure', 'reward', 'ending']
    for (const kind of kinds) {
      const result = sandbox.TextApngService.normalizeConfig(rpgTextConfig({ kind, text: '冒险试炼', subText: '桌面 RPG', key: kind }))
      expect(result.scene).toMatchObject({ fontId: 'system-sans', subFontId: 'same', width: 640, height: 200 })
      expect(result.exportOptions).toMatchObject({ loop: 'once', fps: 15 })
    }
  })
})
