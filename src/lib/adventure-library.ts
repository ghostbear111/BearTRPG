import { validateAdventureDefinition, type AdventureDefinition } from './adventure-schema'
export interface AdventureListing { id: string; revision: number; title: string; summary: string; scenes: number; chapters: number; updatedAt: number; imported?: boolean }
async function json(response: Response) { const data = await response.json(); if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : '战役作品请求失败。'); return data }
export async function listAdventures(): Promise<AdventureListing[]> { const data = await json(await fetch('/api/adventures')); if (!Array.isArray(data.adventures)) throw new Error('作品目录格式有误。'); return data.adventures }
export async function getAdventure(id: string): Promise<AdventureDefinition> { return validateAdventureDefinition(await json(await fetch(`/api/adventures/${encodeURIComponent(id)}`))) }
export async function importGameAdventure(definition: AdventureDefinition): Promise<{ definition: AdventureDefinition; created: boolean }> {
  const result = await json(await fetch('/api/adventures/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ definition: validateAdventureDefinition(definition) }) }))
  if (typeof result.created !== 'boolean') throw new Error('游戏模组导入响应格式有误。')
  return { definition: validateAdventureDefinition(result.definition), created: result.created }
}
export async function saveAdventure(definition: AdventureDefinition): Promise<AdventureDefinition> {
  const draft = validateAdventureDefinition(definition)
  const saved = await json(await fetch(draft.revision > 0 ? `/api/adventures/${encodeURIComponent(draft.id)}` : '/api/adventures', { method: draft.revision > 0 ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ definition: draft, ...(draft.revision > 0 ? { expectedRevision: draft.revision } : {}) }) }))
  return validateAdventureDefinition(saved)
}
