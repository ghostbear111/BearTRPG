import { describe, expect, it, vi } from 'vitest'
import rpgFixture from '../../tests/fixtures/rpg.db.json'
import modulePack from '../../tests/fixtures/rpg.adventure.json'
import { exportGameModule, gameModuleDefinition, MAX_GAME_MODULE_BYTES, parseGameModule, prepareGameModule } from './game-module'
import { blankAdventure, startAdventure } from './adventure-engine'
import { createObject } from './tabletop'
import { createCampaignSave, loadBuiltinAdventure, touchCampaignSave } from './game-catalog'

describe('importable game modules', () => {
  it('imports a standard user module with the same data as an RPG content package', () => {
    const definition = parseGameModule(JSON.stringify(modulePack))
    expect(definition.id).toBe('fixture-rpg')
    expect(Object.keys(definition.rpg!.maps)).toHaveLength(3)
    expect(definition.rpg).toEqual(gameModuleDefinition(rpgFixture).rpg)
    expect(definition.rpg!.settings?.textStyle).toBe('animated')
  })
  it('imports authored content as a draft and creates a campaign only on explicit start', async () => {
    const imported = await prepareGameModule(JSON.stringify(modulePack))
    expect(imported.id).not.toBe(modulePack.definition.id)
    expect(imported.revision).toBe(0)
    expect(imported).not.toHaveProperty('progress')
    const table = createCampaignSave(startAdventure(imported), [], `adventure-${imported.id}`)
    expect(table.adventure!.progress.rpg!.mapId).toBe('camp')
    expect(table.adventure!.progress.rpg!.money).toBe(300)
    table.adventure!.progress.rpg!.money = 432
    const resumed = touchCampaignSave(table)
    expect(resumed.id).toBe(table.id)
    expect(resumed.adventure!.progress.rpg!.money).toBe(432)
    expect(resumed.adventure).toEqual(table.adventure)
  })
  it('rejects wrong types, versions, broken graphs and oversized content before any asset uploads', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const bad = blankAdventure(); bad.scenes[0].choices[0].nextSceneId = 'missing'
    for (const value of [{ format: 'realm-adventure', version: 2, definition: bad }, { format: 'realm-adventure', version: 1, definition: bad }, { version: 1, objects: [] }, { format: 'bear-rpg-content', version: 1, db: {} }]) {
      await expect(prepareGameModule(JSON.stringify(value), { fetcher })).rejects.toThrow()
    }
    expect(() => parseGameModule('{broken')).toThrow('JSON')
    expect(() => parseGameModule(' '.repeat(MAX_GAME_MODULE_BYTES + 1))).toThrow('5 MB')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('round-trips a module with role, enemy and future scene images into durable resources once per image', async () => {
    const definition = gameModuleDefinition(rpgFixture)
    const hash = 'a'.repeat(64), url = `/api/resources/${hash}`
    definition.rpg!.roles.hero.tabletopAppearance = createObject('figurine', { texture: url })
    const enemy = Object.values(definition.rpg!.enemies)[0]
    enemy.tabletopAppearance = createObject('figurine', { texture: url })
    definition.scenes[1].objects.push(createObject('board', { texture: url }))
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfaUAAAAASUVORK5CYII='
    const blob = new Blob([Uint8Array.from(atob(png), char => char.charCodeAt(0))], { type: 'image/png' })
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(blob))
    const text = await exportGameModule(definition, { fetcher })
    expect(fetcher).toHaveBeenCalledTimes(1)
    const upload = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ sha256: hash, url, mime: 'image/png', byteLength: blob.size }))
    const imported = await prepareGameModule(text, { fetcher: upload })
    expect(upload).toHaveBeenCalledTimes(1)
    expect(imported.rpg!.roles.hero.tabletopAppearance).toEqual(definition.rpg!.roles.hero.tabletopAppearance)
    expect(Object.values(imported.rpg!.enemies)[0].tabletopAppearance).toEqual(enemy.tabletopAppearance)
    expect(imported.scenes[1].objects[0].texture).toBe(url)
  })
  it('rejects enemy appearance data that cannot be used as a game figurine', () => {
    const definition = gameModuleDefinition(rpgFixture)
    Object.values(definition.rpg!.enemies)[0].tabletopAppearance = createObject('dice')
    expect(() => gameModuleDefinition({ format: 'realm-adventure', version: 1, definition })).toThrow('棋子模板')
  })
})
