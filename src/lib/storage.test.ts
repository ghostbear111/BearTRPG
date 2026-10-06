import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCampaign } from './game'
import {
  CAMPAIGNS_KEY, CAMPAIGNS_RECOVERY_KEY, loadCampaignStorage, persistCampaignStorage,
} from './storage'

class MemoryStorage {
  values = new Map<string, string>()
  writes: string[] = []
  failedKeys = new Set<string>()

  getItem(key: string): string | null { return this.values.get(key) ?? null }
  setItem(key: string, value: string): void {
    this.writes.push(key)
    if (this.failedKeys.has(key)) throw new Error('模拟存储写入失败')
    this.values.set(key, value)
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('loadCampaignStorage', () => {
  it('loads valid archives without creating an unnecessary recovery copy', () => {
    const storage = new MemoryStorage()
    const campaign = createCampaign('可恢复的故事')
    storage.values.set(CAMPAIGNS_KEY, JSON.stringify([campaign]))
    expect(loadCampaignStorage(storage)).toEqual({ campaigns: [campaign], recoveryRaw: null, warning: '' })
    expect(storage.writes).toEqual([])
  })

  it('salvages intact records when a neighboring record has corrupt nested data', () => {
    const storage = new MemoryStorage()
    const first = createCampaign('第一场')
    const damaged = createCampaign('损坏的战役')
    const last = createCampaign('第二场', 'coc')
    damaged.characters[0].hp = Number.NaN
    const raw = JSON.stringify([first, damaged, last], null, 2)
    storage.values.set(CAMPAIGNS_KEY, raw)
    const result = loadCampaignStorage(storage)
    expect(result.campaigns).toEqual([first, last])
    expect(result.recoveryRaw).toBe(raw)
    expect(result.warning).toContain('1 个损坏战役')
    expect(storage.getItem(CAMPAIGNS_KEY)).toBe(raw)
    expect(storage.writes).toEqual([])
  })

  it('keeps the first valid campaign with an ID and flags later duplicates for recovery', () => {
    const storage = new MemoryStorage()
    const first = createCampaign('保留这场')
    const duplicate = { ...createCampaign('重复这场'), id: first.id }
    const raw = JSON.stringify([first, duplicate])
    storage.values.set(CAMPAIGNS_KEY, raw)
    const result = loadCampaignStorage(storage)
    expect(result.campaigns).toEqual([first])
    expect(result.recoveryRaw).toBe(raw)
    expect(result.warning).toContain('1 个重复战役')
  })

  it.each(['{broken JSON', '{"campaigns": []}', 'null', ''])('preserves malformed top-level input exactly: %s', (raw) => {
    const storage = new MemoryStorage()
    storage.values.set(CAMPAIGNS_KEY, raw)
    const result = loadCampaignStorage(storage)
    expect(result.campaigns).toHaveLength(1)
    expect(result.campaigns[0].name).toBe('迷雾中的回声')
    expect(result.recoveryRaw).toBe(raw)
    expect(result.warning).not.toBe('')
  })

  it('provides a starter if every record is invalid, retaining the original records', () => {
    const storage = new MemoryStorage()
    const raw = '[false, {}, "unexpected"]'
    storage.values.set(CAMPAIGNS_KEY, raw)
    const result = loadCampaignStorage(storage)
    expect(result.campaigns).toHaveLength(1)
    expect(result.recoveryRaw).toBe(raw)
    expect(result.warning).toContain('3 个损坏战役')
  })

  it('starts a fresh campaign for missing or intentionally empty storage', () => {
    const storage = new MemoryStorage()
    expect(loadCampaignStorage(storage).recoveryRaw).toBeNull()
    storage.values.set(CAMPAIGNS_KEY, '[]')
    const result = loadCampaignStorage(storage)
    expect(result.campaigns).toHaveLength(1)
    expect(result.recoveryRaw).toBeNull()
    expect(result.warning).toBe('')
  })

  it('handles unavailable storage and supports the browser default', () => {
    const unavailable = { getItem: () => { throw new Error('读取被禁用') } }
    expect(loadCampaignStorage(unavailable).warning).toContain('无法读取')
    const storage = new MemoryStorage()
    const campaign = createCampaign('默认存储')
    storage.values.set(CAMPAIGNS_KEY, JSON.stringify([campaign]))
    vi.stubGlobal('localStorage', storage)
    expect(loadCampaignStorage().campaigns).toEqual([campaign])
  })
})

describe('persistCampaignStorage', () => {
  it('writes the exact original recovery data before replacing the primary archive', () => {
    const storage = new MemoryStorage()
    const raw = '  [{ broken original data\n'
    storage.values.set(CAMPAIGNS_KEY, raw)
    const campaign = createCampaign('安全存档')
    persistCampaignStorage([campaign], raw, storage)
    expect(storage.writes).toEqual([CAMPAIGNS_RECOVERY_KEY, CAMPAIGNS_KEY])
    expect(storage.getItem(CAMPAIGNS_RECOVERY_KEY)).toBe(raw)
    expect(JSON.parse(storage.getItem(CAMPAIGNS_KEY)!)).toEqual([campaign])
  })

  it('never touches the primary archive if saving the recovery copy fails', () => {
    const storage = new MemoryStorage()
    const raw = 'damaged archive to keep'
    storage.values.set(CAMPAIGNS_KEY, raw)
    storage.failedKeys.add(CAMPAIGNS_RECOVERY_KEY)
    expect(() => persistCampaignStorage([createCampaign()], raw, storage)).toThrow('写入失败')
    expect(storage.writes).toEqual([CAMPAIGNS_RECOVERY_KEY])
    expect(storage.getItem(CAMPAIGNS_KEY)).toBe(raw)
  })

  it('keeps both the original and recovery copy if the subsequent primary write fails', () => {
    const storage = new MemoryStorage()
    const raw = 'original archive'
    storage.values.set(CAMPAIGNS_KEY, raw)
    storage.failedKeys.add(CAMPAIGNS_KEY)
    expect(() => persistCampaignStorage([createCampaign()], raw, storage)).toThrow()
    expect(storage.getItem(CAMPAIGNS_KEY)).toBe(raw)
    expect(storage.getItem(CAMPAIGNS_RECOVERY_KEY)).toBe(raw)
  })

  it('backs up an empty corrupted string and leaves an existing backup unchanged on later normal saves', () => {
    const storage = new MemoryStorage()
    persistCampaignStorage([createCampaign()], '', storage)
    expect(storage.getItem(CAMPAIGNS_RECOVERY_KEY)).toBe('')
    const next = createCampaign('后续修改')
    persistCampaignStorage([next], null, storage)
    expect(storage.getItem(CAMPAIGNS_RECOVERY_KEY)).toBe('')
    expect(storage.writes).toEqual([CAMPAIGNS_RECOVERY_KEY, CAMPAIGNS_KEY, CAMPAIGNS_KEY])
  })

  it('rejects a live archive that could not be loaded again before any storage writes', () => {
    const storage = new MemoryStorage()
    const campaign = createCampaign()
    campaign.characters[0].maxHp = 99999
    expect(() => persistCampaignStorage([campaign], 'original', storage)).toThrow('最大 HP')
    expect(storage.writes).toEqual([])
    const valid = createCampaign()
    expect(() => persistCampaignStorage([valid, valid], null, storage)).toThrow('ID 重复')
    expect(storage.writes).toEqual([])
  })

  it('uses default browser storage and strips unknown secret fields before persisting', () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('localStorage', storage)
    persistCampaignStorage([{ ...createCampaign(), apiKey: 'not-a-campaign-field' } as ReturnType<typeof createCampaign>], null)
    expect(storage.getItem(CAMPAIGNS_KEY)).not.toContain('not-a-campaign-field')
  })
})
