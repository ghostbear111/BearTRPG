import { createCampaign, validateCampaign, type Campaign } from './game'

export const CAMPAIGNS_KEY = 'bear-trpg-editor-campaigns-v1'
export const CAMPAIGNS_RECOVERY_KEY = 'bear-trpg-editor-campaigns-v1-recovery'
export const MAX_CHARACTERS = 24
export const MAX_MESSAGES = 2000

export interface CampaignStorageLoad {
  campaigns: Campaign[]
  recoveryRaw: string | null
  warning: string
}

function starterCampaigns(): Campaign[] {
  return [createCampaign('迷雾中的回声', 'dnd')]
}

/** Read each record independently so one damaged campaign cannot hide the others. */
export function loadCampaignStorage(storage?: Pick<Storage, 'getItem'>): CampaignStorageLoad {
  let raw: string | null
  try {
    // Resolve the browser storage inside the try: some browser policies block the getter itself.
    raw = (storage ?? globalThis.localStorage).getItem(CAMPAIGNS_KEY)
  } catch {
    return {
      campaigns: starterCampaigns(),
      recoveryRaw: null,
      warning: '无法读取本机存储。请导出战役备份，以免刷新后丢失当前记录。',
    }
  }
  if (raw === null) return { campaigns: starterCampaigns(), recoveryRaw: null, warning: '' }

  let records: unknown
  try {
    records = JSON.parse(raw)
    if (!Array.isArray(records)) throw new Error('战役列表格式不正确。')
  } catch {
    return {
      campaigns: starterCampaigns(),
      recoveryRaw: raw,
      warning: '本机战役数据损坏，已打开示例战役。原始数据将在写入新存档前备份，便于恢复。',
    }
  }

  const campaigns: Campaign[] = []
  const ids = new Set<string>()
  let invalid = 0
  let duplicates = 0
  for (const value of records as unknown[]) {
    try {
      const campaign = validateCampaign(value)
      if (ids.has(campaign.id)) {
        duplicates += 1
        continue
      }
      ids.add(campaign.id)
      campaigns.push(campaign)
    } catch {
      invalid += 1
    }
  }

  const recovered = invalid + duplicates > 0
  const skipped = [
    invalid ? `${invalid} 个损坏战役` : '',
    duplicates ? `${duplicates} 个重复战役` : '',
  ].filter(Boolean).join('和')
  return {
    campaigns: campaigns.length ? campaigns : starterCampaigns(),
    recoveryRaw: recovered ? raw : null,
    warning: recovered
      ? `已读取 ${campaigns.length} 个有效战役，跳过${skipped}。${campaigns.length ? '' : '已打开示例战役。'}原始数据将在写入新存档前备份，便于恢复。`
      : '',
  }
}

/** The original data must reach recovery storage before the primary archive is replaced. */
export function persistCampaignStorage(
  campaigns: Campaign[],
  recoveryRaw: string | null,
  storage?: Pick<Storage, 'setItem'>,
): void {
  const validated = campaigns.map(validateCampaign)
  if (new Set(validated.map((campaign) => campaign.id)).size !== validated.length) {
    throw new Error('战役 ID 重复，无法保存。')
  }
  const content = JSON.stringify(validated)
  const target = storage ?? globalThis.localStorage
  // Do not use a truthy check: an empty original string is damaged data worth retaining too.
  if (recoveryRaw !== null) target.setItem(CAMPAIGNS_RECOVERY_KEY, recoveryRaw)
  target.setItem(CAMPAIGNS_KEY, content)
}
