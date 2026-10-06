import type { TableSession } from '../lib/tabletop'
import type { RpgAction } from '../lib/rpg-engine'
import { defaultRpgCard } from '../lib/rpg-character-cards'
import { boundCard, characterRows, liveCharacterCard, presentationOf, publicCharacter, emptyPresentation } from '../lib/tavern-presentation'
import RpgCharacterSheet from './RpgCharacterSheet'

export default function RpgCharacterDialog({ table, objectId, onAction }: { table: TableSession; objectId?: string; onAction: (action: RpgAction) => void }) {
  const object = table.objects.find(o => o.id === objectId), role = String(object?.metadata.rpgRoleId ?? 'hero'), enemy = String(object?.metadata.rpgEnemyId ?? '')
  const npc = String(object?.metadata.rpgNpcRoleId ?? ''), db = table.adventure!.definition.rpg!
  if (!object || !(enemy && db.enemies[enemy]) && !(npc && db.roles[npc])) return <RpgCharacterSheet table={table} onAction={onAction} initialRole={role} />
  const archive = presentationOf(table)?.archive ?? emptyPresentation().archive
  const card = boundCard(table, object) ?? liveCharacterCard(table, defaultRpgCard(db, enemy || npc, enemy ? 'enemies' : 'roles'), object), visible = publicCharacter(card, archive)
  return <section className="rpg-character-sheet"><div className="rpg-character-identity">{visible.portrait && <img src={visible.portrait} alt={`${visible.name}肖像`} />}<div><h3>{object.name}</h3><p>{visible.title || (enemy ? '遭遇敌人' : '剧情人物')}</p></div></div><p className="rpg-live-caption">{enemy ? '当前敌方棋子 · 数值随遭遇同步' : '场景人物 · 使用作者配置的角色档案'}</p><dl className="rpg-card-values">{characterRows(card, archive).map((r, index) => <div key={index}><dt>{r.label}</dt><dd>{r.value || '—'}</dd></div>)}</dl>{visible.profile.background && <p className="rpg-card-background">{visible.profile.background}</p>}</section>
}
