import { describe, expect, it } from 'vitest'
import bundled from '../../tests/fixtures/rpg.db.json'
import { adventureFromRpg, applyRpgAction, recoverRpg, startRpgAdventure } from './rpg-engine'
import { rpgWorldLayout, rpgWorldPosition } from './rpg-world'
import { validateTableSession } from './tabletop'

const start = () => startRpgAdventure(adventureFromRpg(bundled.db))
describe('tabletop star atlas', () => {
  it('places every author destination inside the board and prevents free movement', () => {
    const table = applyRpgAction(start(), { type: 'world' }), world = table.adventure!.definition.rpg!.world
    const board = table.objects.find(o => o.id === 'rpg-world-board')!, locations = table.objects.filter(o => o.metadata.rpgDestination)
    expect(locations).toHaveLength(world.locations.length)
    for (const location of locations) {
      expect(location.locked).toBe(true); expect(location.metadata.moveMode).toBe('fixed')
      expect(Math.abs(location.position[0])).toBeLessThan(Number(board.metadata.width) / 2 - 1)
      expect(Math.abs(location.position[2])).toBeLessThan(Number(board.metadata.depth) / 2 - 1)
    }
    expect(table.grid.enabled).toBe(false)
    expect(table.surface!.width).toBeGreaterThan(Number(board.metadata.width))
    expect(validateTableSession(table).objects).toHaveLength(world.locations.length + 1)
  })
  it('uses the author coordinate space, including edge locations and square custom worlds', () => {
    const world = { w: 10, h: 10, locations: [] }, size = rpgWorldLayout(world)
    const a = rpgWorldPosition(world, 0, 0), b = rpgWorldPosition(world, 10, 10)
    expect(a[0]).toBe(-b[0]); expect(a[2]).toBe(-b[2]); expect(size.width).toBe(size.depth)
    expect(rpgWorldPosition(world, 5, 5)).toEqual([0, .28, 0])
  })
  it('travels from a destination piece to its map entry and remembers the departure location', () => {
    const world = applyRpgAction(start(), { type: 'world' })
    const destination = world.objects.find(o => o.metadata.rpgDestination === 'starport')!
    const arrived = applyRpgAction(world, { type: 'travel', mapId: String(destination.metadata.rpgDestination) })
    const entry = arrived.adventure!.definition.rpg!.maps.starport.entry
    expect(arrived.adventure!.progress.rpg).toMatchObject({ mapId: 'starport', x: entry.x, y: entry.y })
    const returned = applyRpgAction(arrived, { type: 'world' })
    expect(returned.objects.find(o => o.id === destination.id)!.metadata).toMatchObject({ rpgCurrent: true, rpgVisited: true })
    const revisited = applyRpgAction(applyRpgAction(returned, { type: 'travel', mapId: 'camp' }), { type: 'world' })
    expect(revisited.objects.find(o => o.id === 'rpg-destination-camp')!.metadata.rpgCurrent).toBe(true)
    expect(revisited.objects.find(o => o.id === destination.id)!.metadata.rpgCurrent).toBe(false)
    expect(() => applyRpgAction(arrived, { type: 'travel', mapId: 'ruins' })).toThrow('请从星图')
  })
  it('upgrades a saved empty atlas without changing progress, inventory or journal', () => {
    const world = applyRpgAction(start(), { type: 'world' })
    const original = structuredClone(world.adventure!.progress)
    world.objects = world.objects.filter(o => !o.metadata.rpgDestination)
    world.objects[0].texture = ''; world.surface = { width: 30, depth: 22 }
    const recovered = recoverRpg(world)
    expect(recovered.objects.filter(o => o.metadata.rpgDestination)).toHaveLength(bundled.db.world.locations.length)
    expect(recovered.adventure!.progress).toEqual(original)
    expect(recoverRpg(recovered)).toEqual(recovered)
    expect(world.objects).toHaveLength(1)
  })
})
