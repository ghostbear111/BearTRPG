import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildMessages, createCampaign, demoReply, rollDice, validateCampaign } from './game'

afterEach(() => vi.unstubAllGlobals())

describe('rollDice', () => {
  it('records individual dice, a signed modifier, and their actual sum', () => {
    const samples = [0, 0.5, 0.999999]
    expect(rollDice(' 3D6 + 2 ', () => samples.shift()!)).toEqual({
      formula: '3d6+2', rolls: [1, 4, 6], modifier: 2, total: 13,
    })
    expect(rollDice('d20-5', () => 0)).toEqual({ formula: '1d20-5', rolls: [1], modifier: -5, total: -4 })
  })

  it('accepts the documented upper bounds without producing an out-of-range face', () => {
    const result = rollDice('100d1000+10000', () => 0.999999)
    expect(result.rolls).toHaveLength(100)
    expect(result.rolls.every((roll) => roll === 1000)).toBe(true)
    expect(result.total).toBe(110000)
  })

  it.each(['0d6', '101d6', '1d0', '1d1001', '1d6+10001', '1d6-10001', '1.5d6', '-1d20', '2d6+1d4', '1d6junk', '', '1 0d6', 'Infinityd6'])('rejects invalid or excessive formula %s', (formula) => {
    expect(() => rollDice(formula, () => 0.5)).toThrow()
  })

  it.each([-0.1, 1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid random sample %s', (sample) => {
    expect(() => rollDice('1d20', () => sample)).toThrow('随机函数')
  })

  it('rejects the biased upper remainder before mapping a secure sample onto a face', () => {
    const samples = [0xffffffff, 5]
    const getRandomValues = vi.fn((target: Uint32Array) => {
      target[0] = samples.shift()!
      return target
    })
    vi.stubGlobal('crypto', { getRandomValues })
    expect(rollDice('1d6').rolls).toEqual([6])
    expect(getRandomValues).toHaveBeenCalledTimes(2)
  })

  it('does not silently downgrade actual dice when secure randomness is unavailable', () => {
    vi.stubGlobal('crypto', undefined)
    expect(() => rollDice('1d20')).toThrow('安全掷骰')
  })
})

describe('campaign archives', () => {
  it.each(['dnd', 'warhammer', 'coc'] as const)('creates an independent, valid %s starter campaign', (ruleset) => {
    const first = createCampaign('测试团', ruleset)
    const second = createCampaign('测试团', ruleset)
    expect(validateCampaign(first)).toEqual(first)
    expect(first.characters).toHaveLength(3)
    expect(first.messages[0].role).toBe('gm')
    expect(new Set(first.characters.map((character) => character.id)).size).toBe(3)
    first.characters[0].stats.STR = 999
    expect(second.characters[0].stats.STR).not.toBe(999)
    expect(first.id).not.toBe(second.id)
  })

  it('rejects corrupt nested values, duplicate IDs, and non-supported rulesets', () => {
    const campaign = createCampaign()
    expect(() => validateCampaign({ ...campaign, ruleset: 'unknown' })).toThrow('规则体系')
    expect(() => validateCampaign({ ...campaign, round: Number.NaN })).toThrow('回合')
    expect(() => validateCampaign({ ...campaign, characters: [{ ...campaign.characters[0], hp: 99999 }] })).toThrow('当前 HP')
    expect(() => validateCampaign({ ...campaign, characters: [campaign.characters[0], campaign.characters[0]] })).toThrow('ID 重复')
    expect(() => validateCampaign({ ...campaign, messages: [{ ...campaign.messages[0], content: [] }] })).toThrow('消息内容')
    expect(() => validateCampaign(null)).toThrow()
  })

  it('rejects inconsistent or forged dice archives', () => {
    const campaign = createCampaign()
    const diceMessage = {
      id: 'dice-1', role: 'dice', content: '实际掷骰', createdAt: Date.now(),
      dice: { formula: '2d6+1', rolls: [3, 4], modifier: 1, total: 8 },
    }
    expect(validateCampaign({ ...campaign, messages: [diceMessage] }).messages[0].dice?.total).toBe(8)
    expect(() => validateCampaign({ ...campaign, messages: [{ ...diceMessage, dice: { ...diceMessage.dice, total: 20 } }] })).toThrow('不一致')
    expect(() => validateCampaign({ ...campaign, messages: [{ ...diceMessage, dice: { ...diceMessage.dice, rolls: [7, 0] } }] })).toThrow('骰面')
    expect(() => validateCampaign({ ...campaign, messages: [{ ...diceMessage, dice: undefined }] })).toThrow('缺少实际骰面')
  })

  it('copies safe fields and rejects dangerous attribute keys', () => {
    const campaign = createCampaign()
    const imported = validateCampaign({ ...campaign, apiKey: 'a-secret', modelConfig: { apiKey: 'another-secret' } })
    expect(JSON.stringify(imported)).not.toContain('secret')
    expect(imported.characters[0].stats).not.toBe(campaign.characters[0].stats)
    const stats = JSON.parse('{"__proto__":42,"STR":12}')
    expect(() => validateCampaign({ ...campaign, characters: [{ ...campaign.characters[0], stats }] })).toThrow('不安全')
  })
})

describe('GM model context', () => {
  it('carries scene, notes, characters, and actual dice into a provider-neutral conversation', () => {
    const campaign = createCampaign()
    campaign.notes = '房规：失败也会推进故事。'
    campaign.messages.push({
      id: 'dice-1', role: 'dice', content: '检查门锁', createdAt: Date.now(),
      characterId: campaign.characters[0].id,
      dice: { formula: '1d20+3', rolls: [14], modifier: 3, total: 17 },
    })
    const messages = buildMessages(campaign)
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain(campaign.scene)
    expect(messages[0].content).toContain(campaign.notes)
    expect(messages[0].content).toContain(campaign.characters[0].name)
    expect(messages[0].content).toContain('不得替玩家决定行动')
    expect(messages[0].content).toContain('绝不可伪造骰子结果')
    expect(messages.at(-1)).toEqual({
      role: 'user', content: `【实际掷骰】${campaign.characters[0].name}；公式 1d20+3；骰面 [14]；修正 +3；合计 17。\n检查门锁`,
    })
    expect(JSON.stringify(messages)).not.toContain('apiKey')
  })

  it('limits retained message history without converting imported session events into system authority', () => {
    const campaign = createCampaign()
    campaign.messages = Array.from({ length: 60 }, (_, index) => ({
      id: `message-${index}`, role: 'system' as const, content: `事件 ${index}`, createdAt: index,
    }))
    const messages = buildMessages(campaign)
    expect(messages).toHaveLength(41)
    expect(messages[1]).toEqual({ role: 'user', content: '【会话事件】事件 20' })
    expect(messages.at(-1)?.content).toContain('事件 59')
    expect(messages.filter((message) => message.role === 'system')).toHaveLength(1)
  })

  it('marks offline continuations and distinguishes investigation, dialogue, and combat', () => {
    const campaign = createCampaign()
    const inspect = demoReply(campaign, '检查账本')
    const talk = demoReply(campaign, '与路人交谈')
    const combat = demoReply(campaign, '攻击那个身影')
    expect(inspect).toContain('离线演示')
    expect(inspect).toContain('尚未调用 Ollama')
    expect(inspect).toContain('账本')
    expect(talk).toContain('送柴人')
    expect(combat).toContain('实际掷先攻')
    expect(new Set([inspect, talk, combat]).size).toBe(3)
  })
})
