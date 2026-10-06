import { createObject, createTableSession, validateTableSession, type ObjectKind, type TableObject, type Vec3 } from './tabletop.ts'

export const PROP_MODELS = [
  ['chest', '宝箱'], ['door', '门'], ['torch', '火把'], ['tree', '树木'], ['rock', '岩石'],
  ['pillar', '石柱'], ['altar', '祭坛'], ['crystal', '水晶'], ['barrel', '木桶'], ['crate', '木箱'],
  ['table', '桌子'], ['chair', '椅子'], ['tent', '帐篷'], ['bridge', '桥'], ['stairs', '台阶'],
  ['well', '水井'], ['fountain', '喷泉'], ['lever', '机关拉杆'], ['gate', '拱门'], ['brazier', '火盆'],
] as const
export const FIGURE_MODELS = [
  ['warrior', '战士'], ['ranger', '游侠'], ['mage', '法师'], ['rogue', '盗贼'], ['cleric', '祭司'],
  ['guard', '守卫'], ['orc', '兽人'], ['skeleton', '骷髅'], ['spider', '巨蛛'], ['golem', '石像守卫'],
] as const
export const TERRAIN_STYLES = [['stone', '石砖地城'], ['forest', '林地'], ['port', '港口木板'], ['snow', '雪地'], ['sand', '荒漠'], ['ritual', '仪式法阵']] as const
type Spec = { key: string; name: string; kind: ObjectKind; color: string; tags: string[]; metadata: TableObject['metadata']; description: string; size?: Vec3 }
const props: Spec[] = PROP_MODELS.map(([model, label]) => ({
  key: model, name: label, kind: 'block', color: ['tree', 'tent'].includes(model) ? '#688367' : ['chest', 'door', 'barrel', 'crate', 'table', 'chair', 'bridge'].includes(model) ? '#a77b4d' : '#929284',
  tags: ['冒险组件', ['chest', 'door', 'torch', 'lever', 'brazier'].includes(model) ? '机关' : '地形'],
  metadata: { model, ...(['chest', 'door', 'torch', 'lever', 'brazier'].includes(model) ? { behavior: model === 'brazier' ? 'light' : model === 'torch' ? 'light' : model === 'lever' ? 'switch' : 'open' } : {}), ...(model === 'chest' ? { lootName: '恢复药剂', lootDescription: '使用后恢复一名角色的 2 点生命。', lootHeal: 2 } : {}) },
  description: ({ chest: '可以开启并取出物品，每个宝箱只能取物一次。', door: '可开关的门。与机关设置相同的联动标签后，由机关控制。', lever: '可以切换，联动同标签的门和灯。', torch: '可点燃或熄灭的火把。', brazier: '可点燃或熄灭的火盆。' } as Record<string, string>)[model] ?? `可拖动、旋转和复制的${label}，可以保存自己的版本。`,
  size: ({ door: [1.6, 2.5, .45], gate: [2.7, 2.7, .65], tree: [1.7, 3, 1.7], pillar: [.9, 2.6, .9], stairs: [2.5, 1.2, 2.6], bridge: [2, .45, 4], table: [2.5, 1.3, 1.5], chest: [1.6, 1, 1], torch: [.5, 2, .5], tent: [2.5, 1.8, 2.3], altar: [2, 1.3, 1.6], fountain: [2.3, 1.3, 2.3] } as Record<string, Vec3>)[model] ?? [1.25, 1.25, 1.25],
}))
const figures: Spec[] = FIGURE_MODELS.map(([model, label]) => ({ key: model, name: label, kind: 'figurine', color: ({ mage: '#8778ac', ranger: '#688b70', rogue: '#586577', cleric: '#c7ba8e', orc: '#68875c', skeleton: '#ccc3aa', spider: '#544957', golem: '#8d9188' } as Record<string, string>)[model] ?? '#648f9c', tags: ['冒险组件', '角色'], metadata: { model, vitality: 6 }, description: `${label}棋子，支持生命记录、状态标记及自定义肖像。` }))
const items: Spec[] = [
  ['potion', '恢复药剂', '使用后恢复目标 2 点生命。', { heal: 2, consumable: true }],
  ['key', '铜钥匙', '可携带的任务道具；具体开锁条件由游戏规则决定。', {}],
  ['ration', '旅行口粮', '可消耗的补给，使用一次后从背包移除。', { consumable: true }],
  ['scroll', '古老卷轴', '收集、查看与传递故事线索。', {}],
  ['sword', '铁制长剑', '可装备的物件；攻击与伤害由所选规则决定。', { equippable: true }],
  ['treasure', '宝石袋', '可收集的战利品，交给其他玩家或放回桌面。', {}],
].map(([key, name, description, metadata]) => ({ key, name, description, kind: 'card', color: '#bb9c65', tags: ['冒险组件', '道具'], metadata: { item: true, ...metadata as object } } as Spec))
const tokens: Spec[] = [['shield', '护盾', '◇'], ['poison', '中毒', '毒'], ['burn', '燃烧', '焰'], ['bleed', '流血', '血'], ['stun', '眩晕', '晕'], ['coin', '金币', '金']].map(([key, name, symbol]) => ({ key: `status-${key}`, name: `${name}标记`, description: '可自定义计数；规则效果由玩家或游戏指引解释。', kind: 'token', color: '#ac8661', tags: ['冒险组件', '标记'], metadata: { symbol } }))
const boards: Spec[] = TERRAIN_STYLES.map(([style, label]) => ({ key: `board-${style}`, name: `${label}地图`, kind: 'board', color: style === 'forest' ? '#648062' : style === 'snow' ? '#c4d0cb' : style === 'sand' ? '#b6a079' : '#838574', tags: ['冒险组件', '地图'], description: `可自由布置的${label}地板，支持网格与自定义图片。`, metadata: { surface: style, width: 16, height: .1, depth: 12 } }))
export const PLAY_KIT = [...props, ...figures, ...items, ...tokens, ...boards]

export function kitObject(key: string, position?: Vec3, extra: Partial<TableObject> = {}): TableObject {
  const spec = PLAY_KIT.find(s => s.key === key)
  if (!spec) throw new Error(`不存在的冒险组件：${key}`)
  const [width, height, depth] = spec.size ?? [0, 0, 0]
  return createObject(spec.kind, { name: spec.name, description: spec.description, color: spec.color, ...extra,
    position: position ?? [0, spec.kind === 'board' ? .05 : spec.kind === 'block' ? height / 2 + .08 : .7, 0],
    metadata: { ...spec.metadata, ...(width ? { width, height, depth } : {}), ...extra.metadata },
  })
}

export function kitLibraryDrafts() {
  return PLAY_KIT.map(spec => {
    const { id: _id, position: _position, locked: _locked, faceDown: _face, name, description, kind, ...config } = kitObject(spec.key)
    return { schemaVersion: 1, name, description, kind, listed: true, tags: spec.tags, template: config }
  })
}

export function createWorkshopTable() {
  const table = createTableSession('sandbox'); table.name = '冒险工坊 · 交互沙盒'
  table.notes = '这是可自由操作的冒险组件桌面。选择门/宝箱/火把/机关，使用物件面板的行为；打开宝箱取出药剂，再收进背包使用。角色生命可在物件面板记录，状态标记支持计数。多选物件后可以批量排列、复制或投骰。门与拉杆用「港口门」标签联动。所有行为可撤销，整桌可导出。'
  table.objects = [
    kitObject('board-stone', [0, .05, 0], { locked: true }),
    ...['warrior', 'ranger', 'mage', 'rogue'].map((key, i) => kitObject(key, [-4.5 + i * 1.6, .7, 2.6], { metadata: { team: '队伍' } })),
    ...['orc', 'skeleton', 'spider'].map((key, i) => kitObject(key, [-2 + i * 2.4, .7, -.3], { metadata: { team: '敌方' } })),
    kitObject('door', [-1.5, 1.4, -1.5], { locked: true, metadata: { linkTag: '港口门' } }),
    kitObject('lever', [2, .7, 0], { locked: true, metadata: { linkTag: '港口门' } }),
    kitObject('chest', [-5, .65, -.6], { locked: true }), kitObject('torch', [-6, 1.1, -3], { locked: true }),
    kitObject('brazier', [6, .7, -3], { locked: true }), kitObject('altar', [0, .8, -4], { locked: true }),
    kitObject('crystal', [0, 1.9, -4], { locked: true, color: '#83b9bd' }),
    kitObject('barrel', [5, .7, 1]), kitObject('crate', [6.5, .7, 1]), kitObject('tree', [-7, 1.65, 1], { locked: true }),
    kitObject('pillar', [6, 1.45, -5], { locked: true }),
    kitObject('table', [-4, .8, -4], { locked: true }), kitObject('scroll', [-4, 1.5, -4]),
    kitObject('sword', [-1, .2, 5]), kitObject('potion', [1, .2, 5]),
    kitObject('status-poison', [5, .2, 4]), kitObject('status-shield', [6.3, .2, 4]),
    ...[6, 6, 20].map((sides, i) => createObject('dice', { name: `检定 d${sides} · ${i + 1}`, sides, position: [8 + i * 1.4, .8, 3], color: i === 2 ? '#b8816b' : '#e4ddcc' })),
    createObject('deck', { name: '探索线索', position: [9, .3, -3], cards: ['松林足迹', '灰港密信', '星核碎片', '守林徽记', '断桥路线', '未寄出的信'].map(name => ({ id: crypto.randomUUID(), name, description: '由主持人结合当前故事解释这条线索。', texture: '', backTexture: '' })) }),
  ]
  return validateTableSession(table)
}
