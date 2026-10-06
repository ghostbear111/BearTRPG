import { playableAdventure } from './game-catalog'
import { adventureFromRpg } from './rpg-engine'
import { exportPortableAdventure, importPortableAdventure, type LibraryClientOptions } from './object-library'
import type { AdventureDefinition } from './adventure-schema'

export const MAX_GAME_MODULE_BYTES = 5 * 1024 * 1024
const bytes = (text: string) => new TextEncoder().encode(text).byteLength

/** Modules contain the authored game, never a player's live campaign progress. */
export function gameModuleDefinition(value: unknown): AdventureDefinition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('请选择游戏模组 JSON 文件。')
  const pack = value as { format?: unknown; version?: unknown; definition?: unknown; db?: unknown }
  if (pack.version !== 1) throw new Error('游戏模组版本不受支持。')
  if (pack.format === 'realm-adventure') return playableAdventure(pack.definition)
  if (['bear-rpg-content', 'starsea-content'].includes(String(pack.format))) return playableAdventure(adventureFromRpg(pack.db))
  throw new Error('请选择 .adventure.json 游戏模组或 RPG .db.json 内容包；跑团存档请在桌面载入。')
}

export function parseGameModule(text: string): AdventureDefinition {
  if (bytes(text) > MAX_GAME_MODULE_BYTES) throw new Error('游戏模组不能超过 5 MB。')
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('游戏模组 JSON 格式有误，请检查文件内容。') }
  return gameModuleDefinition(value)
}

export async function prepareGameModule(text: string, options: LibraryClientOptions = {}): Promise<AdventureDefinition> {
  const definition = parseGameModule(text)
  return importPortableAdventure({ format: 'realm-adventure', version: 1, definition }, options)
}

export async function exportGameModule(definition: AdventureDefinition, options: LibraryClientOptions = {}): Promise<string> {
  const text = JSON.stringify(await exportPortableAdventure(definition, options), null, 2)
  if (bytes(text) > MAX_GAME_MODULE_BYTES) throw new Error('导出模组超过 5 MB，请先在编辑器缩小图片。')
  return text
}
