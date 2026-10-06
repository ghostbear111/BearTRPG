import { auditAdventure, validateAdventureDefinition, type AdventureDefinition } from './adventure-schema'
import { isRelicGame, readRelicGuide } from './relic-guide'
import { validateTableSession, type TableSession } from './tabletop'

export interface BuiltinGame { id: string; title: string; category: string; summary: string; path: string; kind: 'adventure' | 'table' | 'relic' }
export const BUILTIN_GAMES: readonly BuiltinGame[] = []

export function playableAdventure(value: unknown): AdventureDefinition {
  const definition = validateAdventureDefinition(value)
  const report = auditAdventure(definition)
  if (report.errors.length) throw new Error(`作品需要先在创作工坊完善：${report.errors[0]}`)
  return definition
}

/** Bundled stories do not depend on an author's browser cache or local SQLite entries. */
export async function loadBuiltinAdventure(id: string, fetcher: typeof fetch = fetch): Promise<AdventureDefinition> {
  const game = BUILTIN_GAMES.find(game => game.id === id)
  if (!game || game.kind !== 'adventure') throw new Error('内置战役不存在。')
  const response = await fetcher(game.path)
  if (!response.ok) throw new Error('内置战役暂时无法读取，请刷新后重试。')
  const pack = await response.json()
  if (pack?.format !== 'realm-adventure' || pack.version !== 1) throw new Error('内置战役文件格式有误。')
  return playableAdventure(pack.definition)
}

export interface SavedCampaign {
  id: string; moduleId: string; title: string; saveName: string; detail: string
  created: number; updated: number; complete: boolean
}


/** User works are grouped by stable source IDs, never by display names. */
export function campaignModuleId(table: TableSession): string {
  if (table.campaign) return table.campaign.moduleId
  if (table.adventure) {
    const definition = table.adventure.definition
    return `adventure-${definition.id}`
  }
  if (table.workspace?.sourceId) return `draft-${table.workspace.sourceId}`
  if (isRelicGame(table)) return 'builtin-relic-heist'
  if (table.name === '冒险工坊 · 交互沙盒') return 'builtin-adventure-workshop'
  return `table-${table.id}`
}

export function gameSessions(tables: TableSession[]): SavedCampaign[] {
  return tables.flatMap((table): SavedCampaign[] => {
    if (table.workspace?.kind === 'draft') return []
    const base = {
      id: table.id, moduleId: campaignModuleId(table),
      saveName: table.campaign?.name ?? `跑团 · ${new Date(table.createdAt).toLocaleDateString('zh-CN')} · ${table.id.slice(0, 6)}`,
      created: table.createdAt,
      updated: Math.max(table.createdAt, table.campaign?.lastPlayedAt ?? 0, table.logs.at(-1)?.time ?? 0, table.adventure?.progress.journal.at(-1)?.time ?? 0),
    }
    if (table.adventure) {
      const { definition, progress } = table.adventure
      const scene = definition.scenes.find(scene => scene.id === progress.sceneId)
      const position = progress.rpg && definition.rpg?.maps[progress.rpg.mapId] ? ` · (${progress.rpg.x}, ${progress.rpg.y})` : ''
      const activity = table.combat && table.combat.phase !== 'complete' ? ` · 第${table.combat.round}轮战斗` : progress.rpg?.pending?.type === 'choice' ? ' · 剧情待选择' : progress.rpg?.pending?.type === 'talk' ? ' · 对话中' : ''
      return [{ ...base, title: definition.title, detail: `${scene?.title ?? '当前场景'}${position}${activity} · ${progress.visited.length}/${definition.scenes.length} 场景 · ${progress.outcome === 'won' ? '已胜利' : progress.outcome === 'lost' ? '已结束' : '进行中'}`, complete: progress.phase === 'complete' }]
    }
    if (isRelicGame(table)) {
      const progress = readRelicGuide(table)
      if (progress) return [{ ...base, title: '遗迹夺宝', detail: `第 ${progress.round} 轮 · ${progress.phase === 'complete' ? '已结束' : '进行中'}`, complete: progress.phase === 'complete' }]
    }
    if (table.workspace?.kind === 'play' || table.name === '冒险工坊 · 交互沙盒' || table.combat) return [{ ...base, title: table.name, detail: table.combat ? `第${table.combat.round}轮 · ${table.combat.phase === 'complete' ? table.combat.message : '战斗进行中'}` : '探索与冒险', complete: false }]
    return []
  }).sort((a, b) => b.updated - a.updated || b.created - a.created || a.id.localeCompare(b.id))
}

export function campaignGroups(saves: SavedCampaign[]) {
  const groups = new Map<string, { moduleId: string; title: string; saves: SavedCampaign[] }>()
  for (const save of saves) {
    const group = groups.get(save.moduleId)
    if (group) group.saves.push(save)
    else groups.set(save.moduleId, { moduleId: save.moduleId, title: save.title, saves: [save] })
  }
  return [...groups.values()]
}

export function campaignForModule(saves: SavedCampaign[], moduleId: string) {
  return saves.find(save => save.moduleId === moduleId && !save.complete) ?? saves.find(save => save.moduleId === moduleId)
}

/** Only explicit new-game actions allocate a session. Resuming preserves the entire existing snapshot. */
export function createCampaignSave(table: TableSession, tables: TableSession[], moduleId = campaignModuleId(table), now = Date.now()): TableSession {
  const names = new Set(gameSessions(tables).filter(save => save.moduleId === moduleId).map(save => save.saveName))
  let number = 1
  while (names.has(`跑团 ${number}`)) number++
  return validateTableSession({ ...table, campaign: { moduleId, name: `跑团 ${number}`, lastPlayedAt: now } })
}

export function touchCampaignSave(table: TableSession, now = Date.now(), moduleId = campaignModuleId(table)): TableSession {
  return { ...table, campaign: { moduleId, name: table.campaign?.name ?? `跑团 · ${table.id.slice(0, 6)}`, lastPlayedAt: now } }
}
