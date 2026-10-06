import type { AdventureDefinition } from './adventure-schema'
import type { TableSession } from './tabletop'
import { rpgAt, type RpgOp } from './rpg-schema'
import { rpgMagic } from './rpg-rules'
import { dicePoolLabel } from './dice'

export type RpgTextKind = 'scene' | 'dialogue' | 'choice' | 'battle' | 'round' | 'skill' | 'success' | 'failure' | 'reward' | 'ending'
export interface RpgTextCue { kind: RpgTextKind; text: string; subText: string; key: string }

/** The author explicitly chooses animated or plain narrative text. */
export function rpgTextEnabled(definition: Pick<AdventureDefinition, 'title' | 'rpg'>): boolean {
  return !!definition.rpg && (definition.rpg.settings?.textStyle ?? 'plain') === 'animated'
}
const brief = (value: string, max = 36) => { const chars = Array.from(value.replace(/\s+/g, ' ').trim()); return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('') }
function pendingOp(table: TableSession): RpgOp | undefined {
  const a = table.adventure, pending = a?.progress.rpg?.pending
  if (!a?.definition.rpg || !pending) return undefined
  return rpgAt(a.definition.rpg, pending.path) as RpgOp
}
export function rpgTextSnapshot(table: TableSession) {
  const a = table.adventure, db = a?.definition.rpg, p = a?.progress.rpg
  if (!a || !db || !p) return null
  const op = pendingOp(table), c = table.combat, intent = c?.rpg?.pending
  return {
    context: `${table.id}:${a.progress.sceneId}`, scene: a.progress.sceneId,
    sceneName: db.maps[p.mapId]?.name ?? (a.progress.phase === 'complete' ? '旅程终章' : '星图航线'),
    sceneDetail: brief(db.world.locations.find(l => l.id === p.mapId)?.desc ?? '桌面 RPG'),
    phase: a.progress.phase, outcome: a.progress.outcome,
    pending: p.pending ? { type: p.pending.type, key: JSON.stringify([p.pending.type, p.pending.path, p.steps]), name: op?.name || '旁白', text: brief(op?.text ?? p.message), threshold: Math.floor((op?.cond?.rnd ?? 0) * 20) } : null,
    battle: c ? { phase: c.phase, round: c.round, winner: c.winner, seed: c.rpg?.seed,
      title: op?.title || '剧情遭遇', message: c.message,
      request: c.pending ? `${c.pending.request}:${c.pending.generation}:${c.pending.dieId}` : '',
      skill: intent ? (intent.kind === 'skill' ? rpgMagic(db, intent.id)?.name : db.items[intent.id]?.name) ?? '招式检定' : '',
      actor: table.objects.find(o => o.id === c.order[c.turn])?.name ?? '',
      pool: intent?.pool ? dicePoolLabel(intent.pool) : 'd20',
      roll: c.rpg?.lastRoll ? { missed: c.rpg.lastRoll.missed, mode: c.rpg.lastRoll.mode, total: c.rpg.lastRoll.total, successes: c.rpg.lastRoll.successes } : null,
    } : null,
    cores: [...p.cores], recruited: [...p.recruited],
    objective: db.settings?.objectiveName ?? '星核', objectiveCount: db.settings?.objectiveCount ?? 12,
    roleNames: Object.fromEntries(p.recruited.map(id => [id, db.roles[id]?.name ?? id])),
    journal: a.progress.journal.slice(-12).map(j => ({ id: j.id, text: j.text })),
  }
}
export type RpgTextSnapshot = NonNullable<ReturnType<typeof rpgTextSnapshot>>

/** Observe rule transitions only: physics, selection and movement never replay a cue. */
export function rpgTextCues(previous: RpgTextSnapshot | null, next: RpgTextSnapshot): RpgTextCue[] {
  const cue = (kind: RpgTextKind, text: string, subText: string, key: string): RpgTextCue => ({ kind, text: brief(text, 22), subText: brief(subText, 48), key: `${next.context}:${kind}:${key}` })
  const b = next.battle, old = previous?.battle
  if (next.phase === 'complete') return previous?.context === next.context && previous.phase === 'complete' ? [] : [cue('ending', next.outcome === 'won' ? '群星见证你的旅程' : '此行暂告一段落', next.outcome === 'won' ? '冒险完成 · 你的故事已写入冒险记录' : '休整队伍，再度出发', next.outcome ?? '')]
  const changedScene = !previous || previous.context !== next.context
  if (b?.phase === 'complete' && (changedScene || old?.phase !== 'complete')) return [cue(b.winner === '队伍' ? 'success' : 'failure', b.winner === '队伍' ? '队伍获胜' : '队伍败退', b.winner === '队伍' ? '结算战利品，继续你的故事' : '这一战的故事已落幕', 'winner')]
  if (b && (changedScene || !old)) return [cue('battle', b.title, `战斗开始 · 第 ${b.round} 轮`, 'start')]
  if (changedScene) return [cue('scene', next.sceneName, next.sceneDetail, 'enter')]
  const cues: RpgTextCue[] = []
  const cores = next.cores.filter(id => !previous.cores.includes(id))
  if (cores.length) cues.push(cue('reward', `获得${next.objective}`, `${next.cores.length} / ${next.objectiveCount} · 距离旅程目标更近一步`, next.cores.join(',')))
  const joined = next.recruited.filter(id => !previous.recruited.includes(id))
  if (joined.length) cues.push(cue('reward', '新的同行者', joined.map(id => next.roleNames[id]).join('、') + '加入队伍', joined.join(',')))
  const fresh = next.journal.filter(j => !previous.journal.some(v => v.id === j.id))
  const items = fresh.filter(j => j.text.startsWith('获得'))
  if (items.length) cues.push(cue('reward', '物品已入袋', items.map(j => j.text).join(' '), items.map(j => j.id).join(',')))
  if (old && !b && old.phase === 'complete' && old.winner === '队伍') {
    const reward = fresh.find(j => j.text.startsWith('战利品：'))
    if (reward) cues.push(cue('reward', '战利品已入袋', reward.text.replace(/^战利品：/, ''), reward.id))
  }
  if (b && old) {
    if (b.phase === 'rolling' && b.request !== old.request) cues.push(cue('skill', b.skill, `${b.actor} · ${b.pool}`, b.request))
    // Partial dice settlement and cancellation are not a skill result.
    if (old.phase === 'rolling' && b.phase !== 'rolling' && b.seed !== old.seed) {
      const missed = b.roll?.missed || /未命中|未受到招式效果/.test(b.message)
      const result = b.roll ? (b.roll.mode === 'success' ? `${b.roll.successes} 成功` : `骰组总点数 ${b.roll.total}`) : '骰点已落定'
      cues.push(cue(missed ? 'failure' : 'success', missed ? '招式未奏效' : old.skill || '招式奏效', result, old.request))
    }
    if (b.round !== old.round) cues.push(cue('round', `第 ${b.round} 轮`, '新的战术机会 · 轮到你书写战局', String(b.round)))
  }
  if (previous.pending?.type === 'roll' && next.pending?.key !== previous.pending.key) {
    const journal = next.journal.find(j => !previous.journal.some(v => v.id === j.id) && j.text.startsWith('真实d20='))
    if (journal) {
      const value = Number(/^真实d20=(\d+)/.exec(journal.text)?.[1])
      const success = value <= previous.pending.threshold
      cues.push(cue(success ? 'success' : 'failure', success ? '命运检定成功' : '命运检定失败', `d20 · ${value} / ${previous.pending.threshold}`, journal.id))
    }
  }
  const p = next.pending
  if (p && p.key !== previous.pending?.key) {
    if (p.type === 'choice') cues.push(cue('choice', '命运的抉择', p.text, p.key))
    if (p.type === 'roll') cues.push(cue('skill', '命运检定', `投掷 d20 · 骰点不大于 ${p.threshold} 为成功`, p.key))
    if (p.type === 'talk' && (previous.pending?.type !== 'talk' || previous.pending.name !== p.name)) cues.push(cue('dialogue', p.name, p.name === '旁白' ? '旅途之中，故事继续' : '与你交谈', p.key))
  }
  return cues
}

/** Designs come from the integrated Bear Tavern renderer, using offline system fonts. */
export function rpgTextConfig(cue: RpgTextCue) {
  const design: Record<RpgTextKind, { template: string; color: string }> = {
    scene: { template: 'chapter', color: '#ebc68a' }, dialogue: { template: 'roleplay', color: '#a6d7d1' },
    choice: { template: 'secret', color: '#dcc3ee' }, battle: { template: 'battle', color: '#edbd7b' },
    round: { template: 'round', color: '#a6d7d1' }, skill: { template: 'chapter', color: '#a6d7d1' },
    success: { template: 'battleEnd', color: '#b7dbb3' }, failure: { template: 'battleEnd', color: '#e6a093' },
    reward: { template: 'chapter', color: '#ebc68a' }, ending: { template: 'chapter', color: '#ebc68a' },
  }
  const style = design[cue.kind]
  return { mode: 'message' as const, templateId: style.template, text: cue.text, subText: cue.subText,
    width: 640, height: 200, fontId: 'system-sans', fontSize: 62, fontWeight: 800, textColor: style.color,
    inFx: 'fade', holdFx: 'none', outFx: 'fade', inDuration: .28, holdDuration: cue.kind === 'scene' || cue.kind === 'ending' ? 1.7 : 1.05,
    outDuration: .35, startDelay: 0, endDelay: .1, fps: 15, loop: 'once' as const, color: 'full' as const, trim: false, poster: false,
  }
}
