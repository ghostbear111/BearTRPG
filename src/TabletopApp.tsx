import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowCounterClockwise, ArrowClockwise, ArrowsOut, ArrowUDownLeft, BookOpen, Cards,
  Check, Circle, Cube, DiceFive, DownloadSimple, Eye, EyeSlash, FloppyDisk, FolderOpen,
  GearSix, Hand, Info, List, LockSimple, Magnet, Minus, MouseSimple, NotePencil,
  PaperPlaneTilt, Plus, Ruler, Selection, Shuffle, Sparkle, Stack, Trash, UploadSimple,
  UsersThree, X, Play, ArrowLeft, ArrowRight, CrosshairSimple,
} from '@phosphor-icons/react';
import {
  addTableLog, createObject, createTableSession, drawCard, duplicateObject, removeObject,
  returnCardToDeck, shuffleDeck, updateObject, validateTableSession,
  type ObjectKind, type TableObject, type TableSession, type Vec3,
} from './lib/tabletop';
import { buildTabletopMessages, buildPlanRepairMessages, parseAssistantPlan, type AssistantPlan, type TableAction, type TabletopMessage } from './lib/tabletop-ai';
import type { ModelConfig } from './lib/game';
import LegacyApp from './App';
import { listLibraryEntries, instantiateLibraryEntry, templateFromObject, exportPortableSession, importPortableSession, type LibraryEntry } from './lib/object-library';
import { TableCommandBus } from './lib/tabletop-commands';
import { isRelicGame, readRelicGuide, recoverRelicGuide, createRelicGuidedSession, applyRelicGuideAction, guideMoveOptions, type RelicGuideAction } from './lib/relic-guide';
import { startAdventure, applyAdventureAction, recoverAdventure, type AdventureAction } from './lib/adventure-engine';
import type { AdventureDefinition } from './lib/adventure-schema';
import { cameraProtagonist, loadCameraMemories, preferredTableView, rememberCamera, rememberCameraFollow, saveCameraMemories, type CameraMemory, type CameraPose, type TableView } from './lib/table-camera';
import { interact, changeHealth, dealCards, arrangeObjects, type Interaction } from './lib/object-play';
import { applyCombat, recoverCombat, combatWinner, combatMoveOptions, type CombatAction } from './lib/combat';
import PlayWorkbench from './components/PlayWorkbench';
import { EditorBatch, EditorBehavior, EditorStory, PlayerObjectPanel } from './components/WorkspacePanels';
import { createBlankEditorSession } from './lib/editor-session';
import { workspaceMode, captureSceneDraft, createSceneDraft, editorDraftFromGame, startEditorGame } from './lib/table-workspace';
import { movementRules, objectMoveOptions } from './lib/object-movement';
import { applyPlayMove, playMoveAccessError } from './lib/play-movement';
import { uprightFigure } from './lib/piece-pose';
import { applyRpgAction, blankRpgAdventure, rpgCoordinates, rpgMoveOptions, type RpgAction } from './lib/rpg-engine';
import { tableBounds, tableSurface } from './lib/table-surface';
import EditorSurface from './components/EditorSurface';
import BearTavernStudio from './components/BearTavernStudio';
import TavernCharacterPanel from './components/TavernCharacterPanel';
import TavernEffectImage from './components/TavernEffectImage';
import RpgTextPresentation from './components/RpgTextPresentation';
import RpgStoryOverlay from './components/RpgStoryOverlay';
import { rpgStoryKey } from './lib/rpg-story-presentation';
import AdventureStoryOverlay from './components/AdventureStoryOverlay';
import { adventureStoryKey } from './lib/adventure-story-presentation';
import { bindingKey, characterCardImage, presentObject, presentationOf, validatePresentation, type TavernCard, type TavernEffect, type TavernPresentation } from './lib/tavern-presentation';
import { EditorSidebar, EditorEventDock } from './components/EditorWorkspace';
import RpgAudio from './components/RpgAudio';
import { rpgDirectionForKey, rpgSpaceControl } from './lib/rpg-controls';
import { applyRpgBattleAction, compactRpgBattleTable, battleCoordinates, rpgBattlePlanCells, rpgBattleEffectCells, rpgBattleMoveOptions, type RpgBattlePlan, type RpgBattleAction } from './lib/rpg-battle';
import { rpgBattleImpact, type BattleImpact } from './lib/battle-presentation';
import RpgBattleMessages from './components/RpgBattleMessages';
import RpgCharacterDialog from './components/RpgCharacterDialog';
import RpgCharacterSheet from './components/RpgCharacterSheet';
import { diceFaceLabel } from './lib/dice';
import { DiceFacesEditor } from './components/DiceFields';
import { RecordBatchToolbar, RecordDeleteAction, RecordSelectionCheckbox, RecordUndoNotice, useRecordSelection } from './components/RecordActions';
import { removeSavedRecords, restoreSavedRecords, type RemovedRecords } from './lib/saved-records';
import { createCampaignSave, touchCampaignSave } from './lib/game-catalog';
import './tabletop.css';
import './workspace.css';
import './components/rpg-tools.css';
import './components/rpg-battle-presentation.css';

const TableCanvas = lazy(() => import('./components/TableCanvas'));
const LibraryManager = lazy(() => import('./components/LibraryManager'));
const RelicGameGuide = lazy(() => import('./components/RelicGameGuide'));
const AdventureStudio = lazy(() => import('./components/AdventureStudio'));
const AdventureGuide = lazy(() => import('./components/AdventureGuide'));
const RpgGuide = lazy(() => import('./components/RpgGuide'));
const RpgBattleDock = lazy(() => import('./components/RpgBattleDock'));
const RpgStudio = lazy(() => import('./components/RpgStudio'));
const GameLibrary = lazy(() => import('./components/GameLibrary'));
const TABLES_KEY = 'bear-trpg-editor-tables-v2';
const ACTIVE_TABLE_KEY = 'bear-trpg-editor-active-table-v2';
const MODEL_KEY = 'bear-trpg-editor-model-v1';
const labels: Record<ObjectKind, string> = { token: '标记', figurine: '棋子', dice: '骰子', card: '卡牌', deck: '牌堆', board: '地图', block: '地形' };
const icons = { token: Circle, figurine: UsersThree, dice: DiceFive, card: Cards, deck: Stack, board: Selection, block: Cube };
const palettes = ['#8fae96', '#c99475', '#9da9c9', '#cfb775', '#7eabb2', '#c58f9d'];
type Chat = { role: 'user' | 'assistant'; content: string };
type ModalName = 'new' | 'save' | 'settings' | 'guide' | 'tables' | 'games' | 'character' | null;
type Tool = 'select' | 'measure';

function recoverGuideSafely(table: TableSession) {
  try { return compactRpgBattleTable(recoverCombat(recoverAdventure(recoverRelicGuide(table)))); } catch { return table; }
}
function movableGuideCells(table: TableSession, enabled: boolean) {
  if (!enabled) return [];
  try { return guideMoveOptions(table).map(option => ({ cell: option.cell, position: [-6 + (option.cell.charCodeAt(0) - 65) * 1.2, .115, -3.6 + (Number(option.cell.slice(1)) - 1) * 1.2] as Vec3 })); }
  catch { return []; }
}

function loadTables(): { tables: TableSession[]; recovery: string | null; warning: string } {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(TABLES_KEY);
    if (!raw) return { tables: [createBlankEditorSession()], recovery: null, warning: '' };
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values)) throw new Error('桌面存档格式错误');
    const tables: TableSession[] = []; const ids = new Set<string>(); let invalid = false;
    for (const value of values) {
      try { const table = recoverGuideSafely(validateTableSession(value)); if (ids.has(table.id)) { invalid = true; continue; } tables.push(table); ids.add(table.id); }
      catch { invalid = true; }
    }
    return { tables: tables.length ? tables : [createBlankEditorSession()], recovery: invalid ? raw : null, warning: invalid ? '部分桌面存档需要恢复，已保留原始数据。' : '' };
  } catch { return { tables: [createBlankEditorSession()], recovery: raw, warning: raw ? '桌面存档损坏，原始内容将先备份再保存。' : '本机存储不可用，请导出备份。' }; }
}
function loadModel(): ModelConfig {
  const fallback: ModelConfig = { provider: 'demo', baseUrl: 'http://localhost:11434', model: '', apiKey: '', temperature: 0.2 };
  try {
    const value = JSON.parse(localStorage.getItem(MODEL_KEY) ?? '{}');
    if (['ollama', 'openai', 'demo'].includes(value.provider) && typeof value.baseUrl === 'string' && typeof value.model === 'string') return { ...fallback, provider: value.provider, baseUrl: value.baseUrl, model: value.model, apiKey: '' };
  } catch { /* Keep the desktop usable without browser storage. */ }
  return fallback;
}
function sameTransform(object: TableObject, patch: { position: Vec3; rotation: Vec3 }, tolerance = .025) {
  return object.position.every((n, i) => Math.abs(n - patch.position[i]) < tolerance) && object.rotation.every((n, i) => Math.abs(n - patch.rotation[i]) < tolerance);
}
function tableSignature(table: TableSession) {
  return JSON.stringify({ id: table.id, surface: table.surface, objects: table.objects, grid: table.grid, physics: table.physics, notes: table.notes });
}
function downloadFile(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function ModelDialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => { if (element.open) element.close(); }; }, []);
  return <dialog ref={dialog} className="tt-dialog" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) { const r = dialog.current!.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } }}>
    <div className="tt-dialog-heading"><div><span>BEAR TAVERN · SANDBOX</span><h2>{title}</h2></div><button className="tt-icon" aria-label="关闭窗口" onClick={close}><X size={20} /></button></div>{children}
  </dialog>;
}

function Inspector({ object, table, change, act }: { object: TableObject; table: TableSession; change: (patch: Partial<TableObject>) => void; act: (action: string) => void }) {
  const [draft, setDraft] = useState(object);
  useEffect(() => setDraft(object), [object]);
  const Icon = icons[object.kind];
  const hidden = object.kind === 'card' && object.faceDown;
  return <div className="tt-inspector">
    <div className="tt-object-heading"><span className="tt-object-glyph" style={{ '--item': object.color } as CSSProperties}><Icon size={24} weight="duotone" /></span><div><small>{labels[object.kind]} · {object.id.slice(0, 8)}</small><h3>{hidden ? '背面卡牌' : object.name}</h3></div><button className={`tt-icon ${object.locked ? 'active' : ''}`} aria-label={object.locked ? '解锁物件' : '锁定物件'} onClick={() => change({ locked: !object.locked })}><LockSimple size={18} weight={object.locked ? 'fill' : 'regular'} /></button></div>
    {!hidden && <label className="tt-field">名称<input aria-label="物件名称" maxLength={120} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} onBlur={() => { if (draft.name.trim() && draft.name !== object.name) change({ name: draft.name.trim() }); }} /></label>}
    <div className="tt-transform-heading"><span>位置</span><span>X / Y / Z</span></div><div className="tt-vector">{(['X', 'Y', 'Z'] as const).map((axis, i) => <label key={axis}><span>{axis}</span><input aria-label={`位置 ${axis}`} disabled={object.locked} type="number" min={i === 1 ? 0 : i === 0 ? tableBounds(table).minX : tableBounds(table).minZ} max={i === 1 ? 30 : i === 0 ? tableBounds(table).maxX : tableBounds(table).maxZ} step="0.25" value={Number(draft.position[i].toFixed(2))} onChange={e => { const position = [...draft.position] as Vec3; position[i] = Number(e.target.value); setDraft({ ...draft, position }); }} /></label>)}</div>
    <div className="tt-transform-heading"><span>旋转</span><span>角度 °</span></div><div className="tt-vector">{(['X', 'Y', 'Z'] as const).map((axis, i) => <label key={axis}><span>{axis}</span><input aria-label={`旋转 ${axis}`} disabled={object.locked} type="number" step="15" value={Math.round(draft.rotation[i] * 180 / Math.PI)} onChange={e => { const rotation = [...draft.rotation] as Vec3; rotation[i] = Number(e.target.value) * Math.PI / 180; setDraft({ ...draft, rotation }); }} /></label>)}</div>
    <div className="tt-transform-heading"><span>尺寸</span><span>缩放比例</span></div><div className="tt-vector">{(['X', 'Y', 'Z'] as const).map((axis, i) => <label key={axis}><span>{axis}</span><input aria-label={`缩放 ${axis}`} disabled={object.locked} type="number" min="0.1" max="8" step="0.1" value={draft.scale[i]} onChange={e => { const scale = [...draft.scale] as Vec3; if (object.kind === 'dice') scale.fill(Number(e.target.value)); else scale[i] = Number(e.target.value); setDraft({ ...draft, scale }); }} /></label>)}</div>
    <button className="tt-small-button full" disabled={object.locked} onClick={() => change({ position: draft.position, rotation: draft.rotation, scale: draft.scale })}><Check size={14} />应用变换</button>
    {object.kind === 'figurine' && <button className="tt-small-button full" onClick={() => act('upright')}><ArrowCounterClockwise size={14} />扶正棋子</button>}
    <div className="tt-transform-heading"><span>物件颜色</span><input type="color" aria-label="自定义物件颜色" value={object.color} onChange={e => change({ color: e.target.value })} /></div><div className="tt-swatches">{palettes.map(color => <button key={color} aria-label={`颜色 ${color}`} style={{ background: color }} className={object.color === color ? 'selected' : ''} onClick={() => change({ color })} />)}</div>
    {object.kind === 'dice' && <><div className="tt-dice-value"><label className="tt-field">骰子面数<select aria-label="骰子面数" disabled={object.locked} value={object.sides} onChange={e => change({ sides: Number(e.target.value), diceFaces: undefined, value: 0 })}>{[4, 6, 8, 10, 12, 20].map(n => <option key={n} value={n}>d{n}</option>)}</select></label><span>d{object.sides} · 最后落定结果</span><strong>{object.value ? diceFaceLabel({ sides: object.sides, faces: object.diceFaces }, object.value) : '—'}</strong></div><fieldset disabled={object.locked}><DiceFacesEditor sides={object.sides} color={object.color} faces={object.diceFaces} onChange={diceFaces => change({ diceFaces, value: 0 })} /></fieldset></>}
    {object.kind === 'deck' && <div className="tt-deck-actions"><span>初始牌堆 · {object.cards?.length ?? 0} 张牌</span></div>}
    {object.kind === 'card' && <button className="tt-small-button full" onClick={() => change({ faceDown: !object.faceDown })}><ArrowUDownLeft size={16} />初始状态：{object.faceDown ? '背面朝上' : '正面朝上'}</button>}
    {object.kind === 'token' && <label className="tt-field">计数值<input aria-label="标记计数值" type="number" min="-9999" max="9999" value={object.value} onChange={e => change({ value: Number(e.target.value) })} /></label>}
    {!hidden && <label className="tt-field">说明<textarea aria-label="物件说明" maxLength={4000} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} onBlur={() => { if (draft.description !== object.description) change({ description: draft.description }); }} /></label>}
    <div className="tt-object-footer"><button onClick={() => act('duplicate')} disabled={object.locked}><Plus size={15} />复制物件</button><button className="danger" onClick={() => act('delete')} disabled={object.locked}><Trash size={15} />删除</button></div>
  </div>;
}

export default function TabletopApp() {
  const [initial] = useState(loadTables);
  const [tables, setTables] = useState(initial.tables);
  const tablesRef = useRef(tables); tablesRef.current = tables;
  const [recovery, setRecovery] = useState(initial.recovery);
  const [deletedRecord, setDeletedRecord] = useState<(RemovedRecords<TableSession> & { cameras: Record<string, CameraMemory> }) | null>(null);
  const recordSelection = useRecordSelection(tables.map(value => value.id));
  const [recordError, setRecordError] = useState('');
  const [activeId, setActiveId] = useState(() => {
    try { const saved = localStorage.getItem(ACTIVE_TABLE_KEY); if (initial.tables.some(t => t.id === saved)) return saved!; } catch { /* Use the first recovered table. */ }
    return initial.tables[0].id;
  });
  const table = tables.find(t => t.id === activeId) ?? tables[0];
  const isPlaying = workspaceMode(table) === 'play';
  const tableRef = useRef(table); tableRef.current = table;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [objectActionsOpen, setObjectActionsOpen] = useState(false);
  const selected = table.objects.find(o => o.id === selectedId);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [multiSelect, setMultiSelect] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'properties' | 'behavior'>('properties');
  const [panel, setPanel] = useState<'objects' | 'play' | 'workshop' | 'story' | 'ai' | 'notes'>(() => isPlaying ? table.adventure || isRelicGame(table) ? 'play' : 'workshop' : 'objects');
  const [immersive, setImmersive] = useState(false);
  const [exploreRequest, setExploreRequest] = useState(0);
  const [studioDefinition, setStudioDefinition] = useState<AdventureDefinition>();
  const [rpgStudioTab, setRpgStudioTab] = useState<'map' | 'characters'>('map');
  const [tool, setTool] = useState<Tool>('select');
  const [initialCameras] = useState(loadCameraMemories);
  const cameraId = table.adventure?.progress.rpg?.mapId === 'world' ? `${table.id}:rpg-world` : table.id;
  const cameraMemory = useRef(initialCameras);
  const cameraSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [view, setView] = useState<TableView>(() => preferredTableView(table, initialCameras));
  const [cameraFollow, setCameraFollow] = useState(() => initialCameras[table.id]?.follow ?? false);
  const [cameraReset, setCameraReset] = useState(0);
  const [bearStudio, setBearStudio] = useState<'characters' | 'text' | null>(null);
  const [effectNow, setEffectNow] = useState<{ effect: TavernEffect; key: number } | null>(null);
  const [effectChoice, setEffectChoice] = useState('');
  const sceneEffectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presentation = presentationOf(table);
  const presentationScene = table.workspace?.sceneId ?? table.adventure?.progress.sceneId ?? '';
  function stopEffects() { if (sceneEffectTimer.current) clearTimeout(sceneEffectTimer.current); sceneEffectTimer.current = null; setEffectNow(null); }
  function playEffect(effect: TavernEffect) { stopEffects(); setEffectChoice(effect.id); setEffectNow({ effect, key: Date.now() }); }
  useEffect(() => {
    stopEffects(); setBearStudio(null); setEffectChoice('');
    const effects = presentation?.effects.filter(e => e.trigger === 'scene' && (!e.sceneId || e.sceneId === presentationScene)) ?? [];
    function next(index: number) {
      const effect = effects[index]; if (!effect) return;
      setEffectChoice(effect.id); setEffectNow({ effect, key: Date.now() });
      if (effect.loops > 0 && index + 1 < effects.length) sceneEffectTimer.current = setTimeout(() => next(index + 1), Math.max(500, effect.duration * effect.loops * 1000 + 250));
    }
    if (isPlaying) next(0);
    return () => { if (sceneEffectTimer.current) clearTimeout(sceneEffectTimer.current); sceneEffectTimer.current = null; };
  }, [table.id, presentationScene, isPlaying]);
  useEffect(() => { if (!effectNow || effectNow.effect.loops === 0) return; const timer = setTimeout(() => setEffectNow(null), Math.max(500, effectNow.effect.duration * effectNow.effect.loops * 1000 + 250)); return () => clearTimeout(timer); }, [effectNow]);
  const persistCamera = useCallback(() => {
    clearTimeout(cameraSaveTimer.current); cameraSaveTimer.current = undefined;
    if (!saveCameraMemories(cameraMemory.current)) setNotice('视角无法写入本机存储，本次游玩仍会保留视角。');
  }, []);
  const handleCameraChange = useCallback((tableId: string, mode: TableView, pose: CameraPose, flush: boolean) => {
    // An unmount flush must not recreate camera entries for a deleted table.
    if (!tablesRef.current.some(value => value.id === tableId || `${value.id}:rpg-world` === tableId)) return;
    rememberCamera(cameraMemory.current, tableId, mode, pose);
    if (flush) persistCamera();
    else if (cameraSaveTimer.current === undefined) cameraSaveTimer.current = setTimeout(persistCamera, 250);
  }, [persistCamera]);
  const [library, setLibrary] = useState(true);
  const [rollRequests, setRollRequests] = useState<Record<string, number>>({});
  const dicePresentationActive = isPlaying && Object.keys(rollRequests).length > 0;
  const [uprightRequests, setUprightRequests] = useState<Record<string, number>>({});
  const rollSequence = useRef(0);
  const lastDirectionStep = useRef(0);
  const pendingRolls = useRef<Record<string, number>>({});
  const [physicsEpoch, setPhysicsEpoch] = useState(0);
  const epochRef = useRef(physicsEpoch); epochRef.current = physicsEpoch;
  const commandBus = useRef(new TableCommandBus());
  const [modal, setModal] = useState<ModalName>(null);
  const [characterObject, setCharacterObject] = useState<string>();
  function showCharacterCard() { setCharacterObject(selected?.id); setObjectActionsOpen(false); setModal('character'); }
  const [gameLibraryView, setGameLibraryView] = useState<'saves' | 'games'>('saves');
  const [legacy, setLegacy] = useState(false);
  const [notice, setNotice] = useState(initial.warning);
  const [distance, setDistance] = useState<number | null>(null);
  const [filter, setFilter] = useState('');
  const [seat, setSeat] = useState('玩家1');
  const [returnDeck, setReturnDeck] = useState('');
  const [newName, setNewName] = useState('');
  const [preset, setPreset] = useState<'sandbox' | 'rpg' | 'cards' | 'wargame'>('sandbox');
  const [libraryEntries, setLibraryEntries] = useState<LibraryEntry[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState('');
  const [manageLibrary, setManageLibrary] = useState(false);
  const [libraryObject, setLibraryObject] = useState<TableObject | null>(null);
  const [saveText, setSaveText] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [config, setConfig] = useState(loadModel);
  const [configDraft, setConfigDraft] = useState(config);
  const [models, setModels] = useState<string[]>([]);
  const [modelStatus, setModelStatus] = useState('');
  const [detecting, setDetecting] = useState(false);
  const discovery = useRef<AbortController | null>(null);
  const [chat, setChat] = useState<Record<string, Chat[]>>({});
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<{ value: AssistantPlan; raw: string; tableId: string; signature: string } | null>(null);
  const aiAbort = useRef<AbortController | null>(null);
  const undoRef = useRef<TableSession[]>([]); const redoRef = useRef<TableSession[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const importInput = useRef<HTMLInputElement>(null);
  const visibleObjects = table.objects.filter(o => !['hand', 'inventory'].includes(String(o.metadata.zone)));
  const hand = table.objects.filter(o => o.kind === 'card' && o.metadata.zone === 'hand' && o.metadata.owner === seat);
  const [mobilePanel, setMobilePanel] = useState(false);
  const [guideMoving, setGuideMoving] = useState(false);
  const [combatMoving, setCombatMoving] = useState(false);
  // Do not let a previous module's selected skill reach the new table's first render.
  const rpgBattleScope = [table.id, table.combat?.order[table.combat.turn], table.combat?.round, table.combat?.phase, seat].join('|');
  const [storedRpgBattlePlan, setStoredRpgBattlePlan] = useState<{ scope: string; plan: RpgBattlePlan | null } | null>(null);
  const rpgBattlePlan = storedRpgBattlePlan?.scope === rpgBattleScope ? storedRpgBattlePlan.plan : null;
  const setRpgBattlePlan = useCallback((value: RpgBattlePlan | null | ((previous: RpgBattlePlan | null) => RpgBattlePlan | null)) => {
    setStoredRpgBattlePlan(previous => {
      const current = previous?.scope === rpgBattleScope ? previous.plan : null;
      const next = typeof value === 'function' ? value(current) : value;
      return next ? { scope: rpgBattleScope, plan: next } : null;
    });
  }, [rpgBattleScope]);
  const [battleImpact, setBattleImpact] = useState<BattleImpact>();
  useEffect(() => {
    if (!battleImpact) return;
    if (battleImpact.tableId !== table.id || !isPlaying || !table.combat?.rpg) { setBattleImpact(undefined); return; }
    const timer = setTimeout(() => setBattleImpact(undefined), 850);
    return () => clearTimeout(timer);
  }, [battleImpact, table.id, isPlaying, Boolean(table.combat?.rpg)]);
  const [playMovingId, setPlayMovingId] = useState<string | null>(null);
  const [guideStarting, setGuideStarting] = useState(false);
  const [studio, setStudio] = useState(false);
  const adventure = table.adventure;
  const starMapView = isPlaying && adventure?.progress.rpg?.mapId === 'world';
  const protagonist = isPlaying ? cameraProtagonist(table, seat) : undefined;
  const atlasBoard = starMapView ? table.objects.find(o => o.id === 'rpg-world-board') : undefined;
  useEffect(() => {
    // A world already open during an upgrade needs the same display recovery as a loaded save.
    const source = tableRef.current;
    if (source.adventure?.progress.rpg?.mapId === 'world' && !source.objects.some(o => o.id === 'rpg-world-board' && o.metadata.rpgWorld)) commit(recoverGuideSafely(source), false);
  }, [table.id, starMapView]);
  const centralRpgStory = isPlaying && Boolean(rpgStoryKey(table));
  const [dismissedStory, setDismissedStory] = useState<string | null>(null);
  const adventureKey = adventureStoryKey(table);
  const centralAdventureStory = isPlaying && Boolean(adventureKey && adventureKey !== dismissedStory);
  const centralStory = centralRpgStory || centralAdventureStory;
  const rpgSpace = isPlaying && adventure?.definition.rpg ? rpgSpaceControl(table, selectedId, seat) : undefined;
  const storyRolling = adventure?.progress.phase === 'rolling' || table.combat?.phase === 'rolling';
  const relicGame = !adventure && isRelicGame(table);
  const playGuide = adventure ? null : readRelicGuide(table);
  const movingObject = table.objects.find(o => o.id === playMovingId);
  const guideHero = table.objects.find(o => o.metadata.role === 'hero' && o.metadata.team === (playGuide?.hero ?? 'blue'));
  const guideCells = useMemo(() => {
    if (table.combat?.rpg) return rpgBattlePlanCells(table, rpgBattlePlan);
    if (combatMoving && table.combat) return combatMoveOptions(table, seat);
    const moving = table.objects.find(o => o.id === playMovingId);
    if (isPlaying && moving && table.adventure?.definition.rpg) return rpgMoveOptions(table, seat);
    if (isPlaying && moving && !playMoveAccessError(table, moving.id, seat)) return objectMoveOptions(table, moving, seat);
    return movableGuideCells(table, playGuide?.phase === 'turn' && guideMoving);
  }, [table, combatMoving, playMovingId, isPlaying, seat, playGuide?.phase, guideMoving, rpgBattlePlan]);
  const rpgEffectCells = useMemo(() => rpgBattleEffectCells(table, rpgBattlePlan), [table, rpgBattlePlan]);
  useEffect(() => { setStoredRpgBattlePlan(null); }, [rpgBattleScope]);
  useEffect(() => {
    const s = table.combat, current = s?.rpg?.units[s.order[s.turn]];
    if (!isPlaying || !s?.rpg || s.phase !== 'turn' || current?.roleId || dicePresentationActive || modal || legacy || manageLibrary || studio) return;
    const tableId = table.id, actorId = s.order[s.turn];
    const timer = setTimeout(() => { const now = tableRef.current; if (now.id === tableId && now.combat?.phase === 'turn' && now.combat.order[now.combat.turn] === actorId) runRpgBattleAction({ type: 'enemy' }); }, 650);
    return () => clearTimeout(timer);
  }, [table.id, table.combat?.turn, table.combat?.round, table.combat?.phase, table.combat?.ap, isPlaying, dicePresentationActive, modal, legacy, manageLibrary, studio]);
  useEffect(() => { setPlayMovingId(null); }, [table.id, seat, table.combat?.phase, table.combat?.turn, adventure?.progress.sceneId, adventure?.progress.phase]);
  useEffect(() => { if (playMovingId && playMoveAccessError(table, playMovingId, seat)) setPlayMovingId(null); }, [table, playMovingId, seat]);
  useEffect(() => { setCombatMoving(false); }, [table.id, seat, table.combat?.turn, table.combat?.phase, table.combat?.ap]);

  useEffect(() => {
    setPanel(isPlaying ? table.adventure || isRelicGame(table) ? 'play' : 'workshop' : 'objects');
    setLibrary(!isPlaying); setTool('select'); setMultiSelect(false); setImmersive(false);
    setObjectActionsOpen(false);
  }, [table.id, isPlaying]);

  useEffect(() => {
    try { if (recovery !== null) localStorage.setItem(`${TABLES_KEY}-recovery`, recovery); localStorage.setItem(TABLES_KEY, JSON.stringify(tables)); if (recovery !== null) setRecovery(null); }
    catch { setNotice('本机存储容量不足或不可用，请导出整桌备份。'); }
  }, [tables, recovery]);
  useEffect(() => { try { const { apiKey: _key, ...preferences } = config; localStorage.setItem(MODEL_KEY, JSON.stringify(preferences)); } catch { /* Secret keys are never persisted. */ } }, [config]);
  useEffect(() => { try { localStorage.setItem(ACTIVE_TABLE_KEY, activeId); } catch { /* A full archive still contains every table object. */ } }, [activeId]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); } }, [notice]);
  useEffect(() => () => { aiAbort.current?.abort(); discovery.current?.abort(); }, []);
  useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden') persistCamera(); };
    window.addEventListener('pagehide', persistCamera); document.addEventListener('visibilitychange', hide);
    return () => { window.removeEventListener('pagehide', persistCamera); document.removeEventListener('visibilitychange', hide); persistCamera(); };
  }, [persistCamera]);
  useEffect(() => { void refreshLibrary(); }, []);

  useEffect(() => {
    if (tableRef.current.combat && !tableRef.current.adventure?.definition.rpg || tableRef.current.name === '冒险工坊 · 交互沙盒') { setPanel('workshop'); setLibrary(false); }
    else if (isRelicGame(tableRef.current) || tableRef.current.adventure) { setPanel('play'); setLibrary(false); setTool('select'); }
    else setPanel('objects');
    const restored = recoverGuideSafely(tableRef.current);
    if (restored !== tableRef.current) commit(restored, false);
  }, [table.id]);
  useEffect(() => { setGuideMoving(false); }, [table.id, seat, playGuide?.hero, playGuide?.phase, playGuide?.ap]);
  useEffect(() => {
    if (modal !== 'save') return;
    let cancelled = false; setSaveText(''); setSaveError(''); setSaveBusy(true);
    void exportPortableSession(tableRef.current).then(value => { if (!cancelled) setSaveText(JSON.stringify(value)); }).catch(e => { if (!cancelled) setSaveError(e instanceof Error ? e.message : '资源无法打包，请重试。'); }).finally(() => { if (!cancelled) setSaveBusy(false); });
    return () => { cancelled = true; };
  }, [modal]);

  function flash(message: string) { setNotice(message); }
  function commit(next: TableSession, remember = true, origin: 'player' | 'ai' | 'physics' = 'player') {
      const current = tableRef.current;
      const result = commandBus.current.execute(current, { commandId: crypto.randomUUID(), tableId: current.id, origin }, () => origin !== 'physics' && next.campaign ? touchCampaignSave(next) : next);
      if (!result.ok) { flash(result.error); return false; }
      if (result.duplicate) return true;
      const validated = result.session;
      if (remember) { undoRef.current = [...undoRef.current.slice(-39), current]; redoRef.current = []; setHistoryVersion(v => v + 1); }
      tableRef.current = validated; setTables(all => all.map(t => t.id === validated.id ? validated : t));
      return true;
  }
  function perform(transform: (t: TableSession) => TableSession, remember = true) {
    try { return commit(transform(tableRef.current), remember); } catch (e) { flash(e instanceof Error ? e.message : '桌面操作失败'); return false; }
  }
  function patch(id: string, value: Partial<TableObject>, remember = true) {
    if (remember && tableRef.current.workspace?.definition?.rpg && tableRef.current.objects.find(o => o.id === id)?.metadata.rpgGenerated) { flash('此物件由剧情数据生成，请在剧情工具修改地形、坐标或角色模板。'); return false; }
    if (isPlaying && (value.position || value.rotation) && !(remember === false && tableRef.current.objects.find(o => o.id === id)?.kind === 'dice')) { flash('游戏中请使用移动行动，物件会保持安全摆放。'); return false; }
    if (isPlaying && remember && Object.keys(value).some(key => !['position', 'rotation', 'faceDown', 'value', 'metadata'].includes(key))) { flash('物件属性请在编辑模式修改。'); return false; }
    if (remember && tableRef.current.combat && (value.position || value.rotation || value.scale || value.locked !== undefined)) { flash('战斗中请用玩法面板移动。'); return false; }
    if (remember && tableRef.current.combat?.phase === 'rolling') { flash('请等待攻击检定完成。'); return false; }
    if (remember && tableRef.current.adventure?.progress.phase === 'rolling') { flash('请等待战役检定完成，再调整物件。'); setPanel('play'); return false; }
    if (remember && readRelicGuide(tableRef.current)) { flash('请通过游玩指引完成行动，状态会自动更新。'); setPanel('play'); return false; }
    if (pendingRolls.current[id] && (value.sides !== undefined || Object.hasOwn(value, 'diceFaces') || value.scale !== undefined || value.locked === true || (remember && value.position !== undefined))) {
      delete pendingRolls.current[id]; setRollRequests(all => { const next = { ...all }; delete next[id]; return next; });
    }
    return perform(t => updateObject(t, id, value), remember);
  }
  function undo() {
    const previous = undoRef.current.pop(); if (!previous) return;
    resetPhysics();
    redoRef.current.push(tableRef.current); commit(recoverGuideSafely(previous), false); setHistoryVersion(v => v + 1); setSelectedId(null);
  }
  function redo() {
    const next = redoRef.current.pop(); if (!next) return;
    resetPhysics();
    undoRef.current.push(tableRef.current); commit(recoverGuideSafely(next), false); setHistoryVersion(v => v + 1); setSelectedId(null);
  }
  function switchTable(id: string, close = true, target?: TableSession) {
    if (id === tableRef.current.id) { if (close) setModal(null); return; }
    resetPhysics(); commandBus.current.reset();
    const next = target ?? tables.find(t => t.id === id);
    setView(next ? preferredTableView(next, cameraMemory.current) : 'perspective');
    setCameraFollow(cameraMemory.current[id]?.follow ?? false);
    aiAbort.current?.abort(); setBusy(false); setActiveId(id); setSelectedId(null); setSelectedIds([]); setPlan(null); setReturnDeck(''); setRollRequests({}); setPrompt(''); setDistance(null); setGuideMoving(false); setCombatMoving(false); undoRef.current = []; redoRef.current = []; setHistoryVersion(v => v + 1);
    if (next) { tableRef.current = next; setPanel(workspaceMode(next) === 'edit' ? 'objects' : next.adventure || isRelicGame(next) ? 'play' : 'workshop'); }
    if (close) setModal(null);
  }
  function persistRecords(next: TableSession[]) {
    if (recovery !== null) localStorage.setItem(`${TABLES_KEY}-recovery`, recovery);
    localStorage.setItem(TABLES_KEY, JSON.stringify(next));
  }
  function deleteRecord(id: string): boolean {
    return deleteRecords([id]);
  }
  function deleteRecords(ids: string[]): boolean {
    setRecordError('');
    const change = removeSavedRecords<TableSession>(tables, tableRef.current.id, ids, () => ({ ...createTableSession('sandbox'), name: '空白桌面', workspace: { kind: 'draft' } }));
    if (!change) return false;
    try { persistRecords(change.records); }
    catch { setRecordError('删除未保存，记录已保留。请检查本机存储后重试。'); return false; }
    const cameras: Record<string, CameraMemory> = {};
    for (const { record } of change.removed.entries) for (const key of [record.id, `${record.id}:rpg-world`]) { if (cameraMemory.current[key]) cameras[key] = cameraMemory.current[key]; delete cameraMemory.current[key]; }
    tablesRef.current = change.records;
    if (change.activeId !== tableRef.current.id) switchTable(change.activeId, false, change.records.find(record => record.id === change.activeId));
    setTables(change.records); setRecovery(null); setDeletedRecord({ ...change.removed, cameras }); recordSelection.clear(); persistCamera();
    return true;
  }
  function undoRecordDeletion() {
    if (!deletedRecord) return;
    setRecordError('');
    const restored = restoreSavedRecords(tables, deletedRecord);
    try { persistRecords(restored); }
    catch { setRecordError('记录恢复未保存，请检查本机存储后重试。'); return; }
    tablesRef.current = restored;
    Object.assign(cameraMemory.current, deletedRecord.cameras);
    if (deletedRecord.fallback && !restored.some(value => value.id === deletedRecord.fallback!.id)) delete cameraMemory.current[deletedRecord.fallback.id];
    if (deletedRecord.entries.some(entry => entry.record.id === deletedRecord.activeId)) switchTable(deletedRecord.activeId, false, restored.find(record => record.id === deletedRecord.activeId));
    setTables(restored); setRecovery(null); setDeletedRecord(null); persistCamera();
  }
  async function refreshLibrary() {
    setLibraryLoading(true); setLibraryError('');
    try { setLibraryEntries(await listLibraryEntries()); }
    catch (e) { setLibraryError(e instanceof Error ? e.message : '物件库暂时无法读取。'); }
    finally { setLibraryLoading(false); }
  }
  function resetPhysics() {
    setBattleImpact(undefined);
    const recovered = recoverGuideSafely(tableRef.current);
    if (recovered !== tableRef.current) commit(recovered, false);
    pendingRolls.current = {}; setRollRequests({}); epochRef.current += 1; setPhysicsEpoch(epochRef.current);
  }
  function handleDiceResult(id: string, value: number, request: number, generation: number, pose?: { position: Vec3; rotation: Vec3 }): boolean {
    if (generation !== epochRef.current || pendingRolls.current[id] !== request) return false;
    const object = tableRef.current.objects.find(o => o.id === id);
    if (!object || object.kind !== 'dice' || object.locked || !Number.isInteger(value) || value < 1 || value > object.sides) return false;
    try {
      const before = tableRef.current;
      let next = addTableLog(updateObject(before, id, { value, ...pose }), `物理骰子落定：${object.name} = ${diceFaceLabel({ sides: object.sides, faces: object.diceFaces }, value)}`);
      const guide = readRelicGuide(next);
      if (guide?.phase === 'rolling' && guide.pending?.dieId === id) next = applyRelicGuideAction(next, { type: 'resolveRoll', dieId: id, value, request, generation });
      const story = next.adventure;
      if (story?.progress.rpg?.pending?.type === 'roll' && story.progress.rpg.pending.dieId === id) next = applyRpgAction(next, { type: 'resolve', dieId: id, value, request, generation }, { request: ++rollSequence.current, generation }, seat);
      if (story?.progress.phase === 'rolling' && story.progress.pending?.dieId === id) next = applyAdventureAction(next, { type: 'resolveRoll', dieId: id, value, request, generation });
      if (next.combat?.phase === 'rolling' && (next.combat.pending?.dieId === id || next.combat.rpg?.pending?.rolls?.some(r => r.dieId === id))) next = next.combat.rpg ? applyRpgBattleAction(next, { type: 'resolve', dieId: id, value, request, generation }) : applyCombat(next, { type: 'resolve', dieId: id, value, request, generation });
      if (commit(next, false, 'physics')) {
        const impact = rpgBattleImpact(before, next); if (impact) setBattleImpact(impact);
        delete pendingRolls.current[id]; setRollRequests(all => { const clean = { ...all }; delete clean[id]; return clean; });
        if (!before.combat?.rpg) flash(`${object.name} · 落定结果 ${diceFaceLabel({ sides: object.sides, faces: object.diceFaces }, value)}`);
        queueRpgRoll(next);
        if (next.combat && !next.adventure?.definition.rpg) setPanel('workshop'); else if (guide || story) setPanel('play');
        return true;
      }
    } catch (e) { flash(e instanceof Error ? e.message : '这次检定尚未完成，请重试。'); }
    return false;
  }
  function openLibraryManager(object: TableObject | null = null) {
    if (isPlaying) return;
    if (object) object = presentObject(tableRef.current, object);
    if (object) { try { templateFromObject(object); } catch (e) { flash(e instanceof Error ? e.message : '物件需先调整才能保存为库模板。'); return; } }
    aiAbort.current?.abort(); setBusy(false); setPlan(null); resetPhysics(); setLibraryObject(object); setManageLibrary(true); setModal(null);
  }
  function libraryChanged(entry: LibraryEntry) { setLibraryEntries(all => all.some(e => e.id === entry.id) ? all.map(e => e.id === entry.id ? entry : e) : [...all, entry]); }
  function spawnFromLibrary(entry: LibraryEntry) {
    if (isPlaying) return;
    if (tableRef.current.combat?.phase === 'rolling') { flash('请等待攻击检定完成。'); return; }
    if (tableRef.current.adventure?.progress.phase === 'rolling') { flash('请等待检定完成，再添加物件。'); return; }
    if (readRelicGuide(tableRef.current)) { flash('本局由指引管理。退出指引后可以自由添加物件。'); return; }
    try {
      const index = tableRef.current.objects.filter(o => !o.locked).length;
      const object = instantiateLibraryEntry(entry, { position: [((index % 5) - 2) * 1.6, entry.kind === 'dice' ? 1.5 : entry.kind === 'board' ? .06 : entry.kind === 'block' ? Math.min(29, Number(entry.template.metadata.height ?? 1.2) * entry.template.scale[1] / 2 + .15) : .8, Math.floor(index / 5) % 3 * 1.8 - 2] });
      if (commit(addTableLog({ ...tableRef.current, objects: [...tableRef.current.objects, object] }, `从库放置：${object.name} · 版本 ${entry.revision}`))) { setSelectedId(object.id); setPanel('objects'); }
    } catch (e) { flash(e instanceof Error ? e.message : '无法创建物件'); }
  }
  function throwDice(id: string) {
    if (tableRef.current.combat) { setPanel('workshop'); flash('请在玩法面板选择攻击目标。'); return; }
    if (tableRef.current.adventure) { flash('战役检定请在指引中选择剧情行动。'); setPanel('play'); return; }
    if (readRelicGuide(tableRef.current)) { flash('请在指引中选择探索或攻击，再掷出对应检定。'); setPanel('play'); return; }
    const object = tableRef.current.objects.find(o => o.id === id); if (!object || object.kind !== 'dice' || object.locked) return;
    if (![4, 6, 8, 10, 12, 20].includes(object.sides)) { flash('物理骰子支持 d4、d6、d8、d10、d12、d20。'); return; }
    if (!tableRef.current.physics.gravity) { flash('请先开启重力，再进行物理掷骰。'); return; }
    if (!commit(addTableLog(updateObject(tableRef.current, id, { value: 0 }), `掷出${object.name}，等待物理落定。`))) return;
    const request = ++rollSequence.current; pendingRolls.current[id] = request;
    setRollRequests(all => ({ ...all, [id]: request }));
  }
  function objectAction(action: string, id = selectedId) {
    if (action === 'upright') {
      if (!id) return;
      try {
        if (commit(uprightFigure(tableRef.current, id, seat))) {
          setUprightRequests(all => ({ ...all, [id]: (all[id] ?? 0) + 1 }));
          setPlayMovingId(null); setCombatMoving(false); setGuideMoving(false);
          flash('棋子已扶正，生命、回合与行动点保持不变。');
        }
      } catch (e) { flash(e instanceof Error ? e.message : '棋子暂时无法扶正。'); }
      return;
    }
    if (isPlaying && ['duplicate', 'delete', 'lock'].includes(action)) return;
    if (tableRef.current.combat) { flash('战斗中请使用玩法面板。'); setPanel(tableRef.current.adventure?.definition.rpg ? 'play' : 'workshop'); return; }
    if (tableRef.current.adventure?.progress.phase === 'rolling') { flash('请等待战役检定完成。'); setPanel('play'); return; }
    if (readRelicGuide(tableRef.current)) { flash('请通过游玩指引完成行动。'); setPanel('play'); return; }
    if (!id) return; const object = tableRef.current.objects.find(o => o.id === id); if (!object) return;
    if (object.locked && action !== 'lock') { flash('物件已锁定，请先解锁。'); return; }
    if (action === 'roll') throwDice(id);
    else if (action === 'duplicate') perform(t => duplicateObject(t, id));
    else if (action === 'delete') { delete pendingRolls.current[id]; perform(t => removeObject(t, id)); setSelectedId(null); }
    else if (action === 'shuffle') perform(t => addTableLog(shuffleDeck(t, id), `洗牌：${object.name}`));
    else if (action === 'draw') perform(t => addTableLog(drawCard(t, id), `从${object.name}抽出一张牌。`));
    else if (action === 'flip') patch(id, { faceDown: !object.faceDown });
    else if (action === 'lock') patch(id, { locked: !object.locked });
    else if (action === 'hand' && object.kind === 'card') { patch(id, { metadata: { ...object.metadata, zone: 'hand', owner: seat } }); setSelectedId(null); }
    else if (action === 'playCard' && object.kind === 'card') {
      if (object.metadata.zone !== 'hand' || object.metadata.owner !== seat) { flash('只能打出当前玩家的手牌。'); return; }
      perform(t => addTableLog(updateObject(t, id, { metadata: { ...object.metadata, zone: 'table', owner: '' }, faceDown: false, position: [0, .4, 3] }), `${seat}打出${object.name}。`)); setSelectedId(id);
    }
    else if (action === 'return' && object.kind === 'card') { const deckId = returnDeck || tableRef.current.objects.find(o => o.kind === 'deck')?.id; if (!deckId) { flash('请先添加一个牌堆。'); return; } perform(t => returnCardToDeck(t, id, deckId)); setSelectedId(deckId); }
  }
  function selectObject(id: string | null, additive = false) {
    if (isPlaying && id !== selectedId) { setPlayMovingId(null); setCombatMoving(false); setGuideMoving(false); }
    setSelectedId(id);
    if (isPlaying) setObjectActionsOpen(Boolean(id));
    else if (id) setMobilePanel(true);
    setSelectedIds(all => !id ? [] : additive || multiSelect ? all.includes(id) ? all.filter(i => i !== id) : [...all, id] : [id]);
  }
  function togglePlayMove() {
    if (!selectedId) return;
    if (playMovingId === selectedId) { setPlayMovingId(null); return; }
    const error = playMoveAccessError(tableRef.current, selectedId, seat);
    if (error) { flash(error); return; }
    setPlayMovingId(selectedId); setTool('select'); setMobilePanel(false); setLibrary(false); setObjectActionsOpen(false);
    flash(movementRules(selected!).mode === 'grid' ? '点击绿色格子移动；不合法的目的地会保留原位置。' : '点击桌面目的地移动；高度与朝向保持不变。');
  }
  function moveToDestination(position: Vec3) {
    const current = tableRef.current;
    const actor = current.objects.find(o => o.id === (current.combat && combatMoving ? current.combat.order[current.combat.turn] : playMovingId));
    if (!actor) return;
    const r = movementRules(actor);
    const p: Vec3 = [position[0], actor.position[1], position[2]];
    if (r.mode === 'grid') { p[0] = actor.position[0] + Math.round((p[0] - actor.position[0]) / r.step) * r.step; p[2] = actor.position[2] + Math.round((p[2] - actor.position[2]) / r.step) * r.step; }
    if (current.combat) { battleAction({ type: 'move', position: p }); return; }
    if (current.adventure?.definition.rpg) { const s = current.adventure.progress.rpg!; const map = current.adventure.definition.rpg.maps[s.mapId]; if (map) rpgAction({ type: 'move', ...rpgCoordinates(map, p) }); return; }
    try { if (commit(applyPlayMove(current, actor.id, p, seat))) { setPlayMovingId(null); flash(`${actor.name}已移动，高度与朝向保持不变。`); } }
    catch (e) { flash(`${(e as Error).message} 已保留原位置。`); }
  }
  function playInteraction(id: string, action: Interaction, target = '') {
    try { if (commit(combatWinner(interact(tableRef.current, id, action, seat, target)))) flash('物件行为已完成，可在操作记录中查看。'); }
    catch (e) { flash(e instanceof Error ? e.message : '操作失败。'); }
  }
  function playHealth(id: string, delta: number) {
    if (tableRef.current.adventure?.progress.rpg?.characters) { flash('角色生命由武功、物品和剧情结算；请使用角色卡或当前遭遇行动栏。'); return; }
    try { if (tableRef.current.combat?.phase === 'complete' || tableRef.current.adventure?.progress.phase === 'complete') throw new Error('本局已结束，请退出指引或收起战斗后编辑生命。'); if (storyRolling) throw new Error('请等待检定完成。'); commit(combatWinner(addTableLog(changeHealth(tableRef.current, id, delta), `生命记录变化：${delta > 0 ? '+' : ''}${delta}`))); }
    catch (e) { flash(e instanceof Error ? e.message : '生命记录失败。'); }
  }
  function battleAction(action: CombatAction) {
    try { if (tableRef.current.adventure?.definition.rpg && action.type === 'stop') throw new Error('剧情遭遇结束后，请点“结算遭遇，继续剧情”。'); if (commit(applyCombat(tableRef.current, action, seat))) { if (action.type === 'cancel' || action.type === 'stop') resetPhysics(); setPlan(null); setPanel(tableRef.current.adventure?.definition.rpg ? 'play' : 'workshop'); setCombatMoving(false); } }
    catch (e) { flash(e instanceof Error ? e.message : '战斗操作失败。'); }
  }
  function battleAttack(target: string) {
    try {
      const request = ++rollSequence.current; const next = applyCombat(tableRef.current, { type: 'attack', target, request, generation: epochRef.current });
      if (!commit(next)) return; const dieId = next.combat!.pending!.dieId;
      pendingRolls.current[dieId] = request; setRollRequests(all => ({ ...all, [dieId]: request })); setPanel(next.adventure?.definition.rpg ? 'play' : 'workshop');
    } catch (e) { flash(e instanceof Error ? e.message : '无法攻击。'); }
  }
  function rollMany(all = false) {
    try {
      const t = tableRef.current; if (t.adventure || readRelicGuide(t) || t.combat) throw new Error('请先完成并收起当前指引或战斗，再自由投骰。');
      const dice = t.objects.filter(o => (all || selectedIds.includes(o.id)) && o.kind === 'dice');
      if (!dice.length || dice.length > 20 || dice.some(o => o.locked || ![4, 6, 8, 10, 12, 20].includes(o.sides))) throw new Error('请选择1至20颗未锁定的标准骰子。');
      if (!t.physics.gravity) throw new Error('请先开启重力。');
      let next = t; for (const die of dice) next = updateObject(next, die.id, { value: 0 });
      if (!commit(addTableLog(next, `同时投掷${dice.length}颗物理骰子。`))) return;
      const requests = { ...rollRequests }; for (const die of dice) { const request = ++rollSequence.current; pendingRolls.current[die.id] = request; requests[die.id] = request; }
      setRollRequests(requests);
    } catch (e) { flash(e instanceof Error ? e.message : '投骰失败。'); }
  }
  function playTable(source: TableSession, moduleId?: string) {
    const next = createCampaignSave({ ...source, campaign: undefined, id: crypto.randomUUID(), createdAt: Date.now(), workspace: { kind: 'play' } }, tablesRef.current, moduleId);
    setTables(all => [...all, next]); switchTable(next.id); tableRef.current = next;
    setModal(null); setPanel('workshop'); setLibrary(false); setView('perspective'); setSelectedIds([]); setMultiSelect(false); setSeat('玩家1'); setMobilePanel(true);
    flash('冒险工坊已准备好：先打开宝箱，再收集药剂，随后开始战术遭遇。');
  }
  function activateDraft(next: TableSession) {
    setTables(all => all.some(t => t.id === next.id) ? all.map(t => t.id === next.id ? next : t) : [...all, next]);
    switchTable(next.id); tableRef.current = next; setStudio(false); setPanel('objects'); setLibrary(true); setMobilePanel(false);
  }
  function saveStoryDraft(definition: AdventureDefinition, sceneId = definition.startSceneId) {
    const current = tableRef.current;
    let next = createSceneDraft(definition, sceneId);
    if (current.workspace?.kind === 'draft' && current.workspace.definition?.id === definition.id) next = { ...next, id: current.id, createdAt: current.createdAt };
    activateDraft(next); return next;
  }
  function editStoryScene(definition: AdventureDefinition, sceneId: string) {
    try { saveStoryDraft(definition, sceneId); setStudioDefinition(definition); flash('正在编辑场景布局，完成后点击“故事编辑器”继续编写。'); }
    catch (e) { flash((e as Error).message); }
  }
  function closeStudio(definition: AdventureDefinition) {
    try { saveStoryDraft(definition, tableRef.current.workspace?.definition?.id === definition.id ? tableRef.current.workspace.sceneId ?? definition.startSceneId : definition.startSceneId); }
    catch (e) { flash((e as Error).message); }
  }
  function openStudio() {
    if (isPlaying) { returnToEditor(); return; }
    resetPhysics(); setPlan(null); setStudioDefinition(captureSceneDraft(tableRef.current)); setStudio(true);
  }
  async function openRpgStudio(tab: 'map' | 'characters' = 'map') {
    setRpgStudioTab(tab);
    try { const def = captureSceneDraft(tableRef.current); setStudioDefinition(def?.rpg ? def : blankRpgAdventure()); setStudio(true); setModal(null); }
    catch (e) { flash((e as Error).message); }
  }
  function queueRpgRoll(next: TableSession) {
    const pending = next.adventure?.progress.rpg?.pending;
    if (pending?.type === 'roll' && pending.dieId && pending.request) { pendingRolls.current[pending.dieId] = pending.request; setRollRequests(all => ({ ...all, [pending.dieId!]: pending.request! })); }
    const battle = next.combat?.rpg && next.combat.pending;
    if (battle) {
      const rolls = next.combat!.rpg!.pending?.rolls
      const ids = rolls ? rolls.filter(r => r.value === undefined).map(r => r.dieId) : [battle.dieId]
      for (const id of ids) pendingRolls.current[id] = battle.request
      setRollRequests(all => ({ ...all, ...Object.fromEntries(ids.map(id => [id, battle.request])) }));
    }
  }
  function runRpgBattleAction(action: RpgBattleAction) {
    try {
      const prior = tableRef.current.combat?.pending;
      const priorDice = tableRef.current.combat?.rpg?.pending?.rolls?.map(r => r.dieId) ?? (prior ? [prior.dieId] : []);
      const next = applyRpgBattleAction(tableRef.current, action, { request: ++rollSequence.current, generation: epochRef.current }, seat);
      if (!commit(next)) return;
      if (action.type === 'cancel' && prior) { for (const id of priorDice) delete pendingRolls.current[id]; setRollRequests(all => { const clean = { ...all }; for (const id of priorDice) delete clean[id]; return clean; }); }
      queueRpgRoll(next); setRpgBattlePlan(null); setObjectActionsOpen(false);
    } catch (e) { flash((e as Error).message); }
  }
  function chooseRpgBattleCell(position: Vec3) {
    if (!rpgBattlePlan || !tableRef.current.combat?.rpg) return;
    const target = battleCoordinates(position);
    if (rpgBattlePlan.kind === 'move') runRpgBattleAction({ type: 'move', ...target });
    else setRpgBattlePlan(p => p ? { ...p, target } : null);
  }
  function rpgAction(action: RpgAction) {
    try {
      const source = tableRef.current, next = applyRpgAction(source, action, { request: ++rollSequence.current, generation: epochRef.current }, seat);
      if (!commit(next)) return;
      if (action.type === 'world' || action.type === 'travel') setSelectedId(null);
      const wasWorld = source.adventure?.progress.rpg?.mapId === 'world', nextWorld = next.adventure?.progress.rpg?.mapId === 'world';
      if (wasWorld !== nextWorld) { setView(preferredTableView(next, cameraMemory.current)); setSelectedId(null); }
      queueRpgRoll(next); setPlayMovingId(null); setObjectActionsOpen(false); setPlan(null); setPanel('play');
    } catch (e) { flash((e as Error).message); }
  }
  function moveRpgLeader() {
    const leader = tableRef.current.objects.find(o => o.metadata.rpgLeader);
    if (!leader) return;
    const error = playMoveAccessError(tableRef.current, leader.id, seat); if (error) { flash(error); return; }
    if (playMovingId === leader.id) { setPlayMovingId(null); return; }
    selectObject(leader.id); setPlayMovingId(leader.id); setObjectActionsOpen(false); setTool('select'); setLibrary(false); setMobilePanel(false);
  }
  function returnToEditor() {
    try {
      const current = tableRef.current;
      const original = tables.find(t => t.id === current.workspace?.sourceId && workspaceMode(t) === 'edit');
      const draft = original ?? editorDraftFromGame(current);
      if (!original) setTables(all => all.map(t => t.id === current.id ? { ...t, workspace: { ...t.workspace, kind: 'play', sourceId: draft.id } } : t));
      activateDraft(draft);
      if (current.workspace?.returnTo === 'story') { setStudioDefinition(captureSceneDraft(draft)); setStudio(true); }
      flash('游玩进度已保留，正在编辑独立的作品草稿。');
    } catch (e) { flash((e as Error).message); }
  }
  function beginEditorPlay() {
    const existing = [...tablesRef.current].filter(t => t.workspace?.sourceId === tableRef.current.id).sort((a, b) => (b.campaign?.lastPlayedAt ?? b.createdAt) - (a.campaign?.lastPlayedAt ?? a.createdAt))[0];
    if (existing) { resumeGame(existing.id); return; }
    beginNewEditorPlay();
  }
  function beginNewEditorPlay() {
    try {
      const source = tableRef.current;
      const moduleId = source.workspace?.definition ? `adventure-${source.workspace.definition.id}` : `draft-${source.id}`;
      const next = createCampaignSave(startEditorGame(source), tablesRef.current, moduleId);
      setTables(all => [...all, next]); switchTable(next.id); tableRef.current = next;
      setStudio(false); setLibrary(false); setMobilePanel(false); setSeat('玩家1');
      flash('已进入独立游戏。返回编辑后，场景与配置仍保持开局前的状态。');
    } catch (e) { flash((e as Error).message); }
  }
  function openGames() { setGameLibraryView('saves'); setPlan(null); setModal('games'); }
  function openGameModules() { setGameLibraryView('games'); setPlan(null); setModal('games'); }
  function resumeGame(id: string, moduleId?: string) {
    const saved = tablesRef.current.find(t => t.id === id); if (!saved) return;
    const next = validateTableSession(touchCampaignSave(saved, Date.now(), moduleId));
    setTables(all => all.map(t => t.id === id ? next : t)); switchTable(id); tableRef.current = next;
    setStudio(false); setModal(null); setPanel(next.adventure || isRelicGame(next) ? 'play' : 'workshop'); setMobilePanel(true); setLibrary(false);
    flash(`已继续「${next.campaign!.name}」，进度与视角已保留。`);
  }
  function renameCampaign(id: string, name: string, moduleId: string) {
    const saved = tablesRef.current.find(t => t.id === id); if (!saved) return false;
    try {
      const next = validateTableSession({ ...saved, campaign: { ...touchCampaignSave(saved, Date.now(), moduleId).campaign!, name: name.trim(), lastPlayedAt: saved.campaign?.lastPlayedAt ?? saved.createdAt } });
      setTables(all => all.map(t => t.id === id ? next : t)); if (tableRef.current.id === id) tableRef.current = next;
      return true;
    } catch (e) { flash((e as Error).message); return false; }
  }
  function chooseView(mode: TableView) { rememberCamera(cameraMemory.current, cameraId, mode); persistCamera(); setView(mode); }
  function toggleCameraFollow() { const next = !cameraFollow; rememberCameraFollow(cameraMemory.current, table.id, next); persistCamera(); setCameraFollow(next); }
  function resetView() { const memory = cameraMemory.current[cameraId]; if (memory) delete memory[view]; setCameraReset(n => n + 1); }
  function playAdventure(definition: AdventureDefinition, moduleId?: string) {
    try {
      const draft = studio ? saveStoryDraft(definition) : undefined;
      const next = createCampaignSave({ ...startAdventure(definition), workspace: { kind: 'play', ...(draft ? { sourceId: draft.id, returnTo: 'story' } : {}) } }, tablesRef.current, moduleId);
      setTables(all => [...all, next]); switchTable(next.id); tableRef.current = next;
      setStudio(false); setModal(null); setPanel('play'); setLibrary(false); setView('perspective'); setTool('select'); setMobilePanel(true); setSeat('玩家1');
      setSelectedId(next.objects.find(o => o.metadata.characterId === definition.characters.find(c => c.role === 'player')?.id)?.id ?? null);
      flash('战役已独立开局，按指引选择剧情行动。');
      return true;
    } catch (e) { flash(e instanceof Error ? e.message : '战役无法开局。'); return false; }
  }
  function storyAction(action: AdventureAction) {
    try {
      const next = applyAdventureAction(tableRef.current, action);
      if (!commit(next)) return;
      resetPhysics(); setSelectedId(null); setPlan(null); setPanel(action.type === 'stop' ? 'objects' : 'play');
    } catch (e) { flash(e instanceof Error ? e.message : '战役行动无法执行。'); }
  }
  function storyRoll(choiceId: string) {
    try {
      let current = tableRef.current;
      const story = current.adventure; if (!story) return;
      const scene = story.definition.scenes.find(s => s.id === story.progress.sceneId)!;
      const choice = scene.choices.find(c => c.id === choiceId); if (!choice?.check) throw new Error('该行动不需要检定。');
      if (story.progress.phase === 'rolling') {
        resetPhysics(); current = tableRef.current;
      }
      let die = current.objects.find(o => o.kind === 'dice' && o.sides === choice.check!.sides && !o.diceFaces && !o.locked && o.scale.every(v => v === o.scale[0]));
      if (!die) { die = createObject('dice', { name: `战役检定 d${choice.check.sides}`, sides: choice.check.sides, position: [8, .7, 0], metadata: { adventureDie: true } }); current = { ...current, objects: [...current.objects, die] }; }
      const request = ++rollSequence.current;
      const next = applyAdventureAction(current, { type: 'beginRoll', choiceId, dieId: die.id, request, generation: epochRef.current });
      if (!commit(next)) return;
      pendingRolls.current[die.id] = request; setRollRequests(all => ({ ...all, [die!.id]: request })); setSelectedId(die.id); setPanel('play');
    } catch (e) { flash(e instanceof Error ? e.message : '无法发起战役检定。'); }
  }
  async function startGuidedGame(source?: TableSession, moduleId?: string) {
    if (guideStarting) return false;
    setGuideStarting(true);
    try {
      let base = source;
      if (!base) {
        const response = await fetch('/games/relic-heist.realm.json');
        if (!response.ok) throw new Error('示例游戏暂时无法载入，请重试。');
        base = await importPortableSession(await response.json());
      }
      const next = createCampaignSave({ ...createRelicGuidedSession(base), campaign: undefined, workspace: { kind: 'play' } }, tablesRef.current, moduleId);
      setTables(all => [...all, next]); switchTable(next.id); tableRef.current = next;
      setPanel('play'); setLibrary(false); setView('perspective'); setTool('select'); setSeat('玩家1'); setMobilePanel(true);
      setSelectedId(next.objects.find(o => o.metadata.role === 'hero' && o.metadata.team === 'blue')?.id ?? null);
      setModal(null);
      flash('引导局已准备好，从右侧第一步开始。');
      return true;
    } catch (e) { flash(e instanceof Error ? e.message : '无法开始引导局'); return false; }
    finally { setGuideStarting(false); }
  }
  function guideAction(action: RelicGuideAction) {
    try {
      const next = applyRelicGuideAction(tableRef.current, action, seat);
      if (!commit(next)) return;
      if (action.type === 'stop') { resetPhysics(); setPanel('objects'); setGuideMoving(false); return; }
      const state = readRelicGuide(next);
      setSeat(state?.hero === 'orange' ? '玩家2' : '玩家1');
      const focus = state?.event?.cardId ?? next.objects.find(o => o.metadata.role === 'hero' && o.metadata.team === (state?.hero ?? 'blue'))?.id;
      setSelectedId(focus ?? null); setPanel('play'); setGuideMoving(false);
    } catch (e) { flash(e instanceof Error ? e.message : '请先完成当前步骤。'); }
  }
  function guideRoll(kind: 'explore' | 'attack', targetId: string) {
    try {
      let current = tableRef.current;
      const prior = readRelicGuide(current);
      if (prior?.phase === 'rolling') {
        if (prior.pending?.dieId) { delete pendingRolls.current[prior.pending.dieId]; }
        setRollRequests({});
        current = recoverRelicGuide(current);
      }
      const die = current.objects.find(o => o.name === '检定骰 d6' && o.kind === 'dice');
      if (!die) throw new Error('本局缺少检定骰，请新开引导局。');
      if (die.locked || !current.physics.gravity) throw new Error('检定骰需要解锁并开启重力。请退出指引修复桌面，或新开一局。');
      const request = ++rollSequence.current;
      const next = applyRelicGuideAction(current, { type: 'beginRoll', kind, targetId, request, generation: epochRef.current });
      if (!commit(next)) return;
      pendingRolls.current[die.id] = request; setRollRequests(all => ({ ...all, [die.id]: request }));
      setSelectedId(die.id); setPanel('play'); setGuideMoving(false);
    } catch (e) { flash(e instanceof Error ? e.message : '无法发起检定。'); }
  }
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (dicePresentationActive || modal || legacy || manageLibrary || studio || bearStudio || e.isComposing || e.key === 'Process' || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
      const direction = rpgDirectionForKey(e), space = e.code === 'Space' || e.key === ' ';
      if (isPlaying && (direction || space) && !e.defaultPrevented && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        const current = tableRef.current, progress = current.adventure?.progress.rpg;
        const leader = current.objects.find(o => o.metadata.rpgLeader);
        // Buttons keep native Tab + Space activation, including deliberate story choices.
        if (space && target.closest('button, a, summary, [role="button"], [role="menuitem"]')) return;
        if (current.adventure?.definition.rpg && progress) {
          e.preventDefault();
          if (current.combat?.rpg) {
            const s = current.combat, unit = s.rpg!.units[s.order[s.turn]], object = current.objects.find(o => o.id === s.order[s.turn]);
            if (s.phase === 'complete') { if (space && !e.repeat) rpgAction({ type: 'finishBattle' }); return; }
            if (s.phase !== 'turn' || !unit.roleId || object?.metadata.moveSeat && object.metadata.moveSeat !== seat) return;
            if (space) {
              if (e.repeat) return;
              if (rpgBattlePlan?.target && rpgBattlePlan.kind !== 'move') runRpgBattleAction({ type: rpgBattlePlan.kind, id: rpgBattlePlan.id!, ...rpgBattlePlan.target });
              else if (unit.acted) runRpgBattleAction({ type: 'next' });
              else flash('先选择武功卡和目标，再按空格确认掷骰。');
            } else if (direction) {
              const now = performance.now(); if (e.repeat && now - lastDirectionStep.current < 160) return; lastDirectionStep.current = now;
              const x = unit.x + direction.dx, y = unit.y + direction.dy;
              if (rpgBattleMoveOptions(current).some(c => c.x === x && c.y === y)) runRpgBattleAction({ type: 'move', x, y });
            }
            return;
          }
          if (space) {
            if (e.repeat) return;
            const control = rpgSpaceControl(current, selectedId, seat);
            if (control.action) rpgAction(control.action);
            else if (control.interaction) playInteraction(control.interaction.id, control.interaction.action);
            else flash(control.label);
          } else if (direction && !progress.pending && !progress.frames.length && current.adventure.progress.phase !== 'complete' && leader && !playMoveAccessError(current, leader.id, seat)) {
            const now = performance.now();
            if (e.repeat && now - lastDirectionStep.current < 160) return;
            lastDirectionStep.current = now;
            rpgAction({ type: 'move', x: progress.x + direction.dx, y: progress.y + direction.dy });
          }
          return;
        }
      }
      if (isPlaying) { if (e.key === 'Escape') { if (rpgBattlePlan) { setRpgBattlePlan(null); return; } setObjectActionsOpen(false); setPlayMovingId(null); setCombatMoving(false); setImmersive(false); setSelectedId(null); } else if (e.key.toLowerCase() === 'r' && selected?.kind === 'dice') objectAction('roll'); else if (e.key.toLowerCase() === 'f' && selected?.kind === 'card') objectAction('flip'); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); objectAction('duplicate'); return; }
      if (!selected) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); objectAction('delete'); }
      else if (e.key.toLowerCase() === 'f' && ['card', 'deck'].includes(selected.kind)) objectAction('flip');
      else if (e.key.toLowerCase() === 'l') objectAction('lock');
      else if (e.key.toLowerCase() === 'r' && selected.kind === 'dice') objectAction('roll');
      else if (['q', 'e'].includes(e.key.toLowerCase()) && !selected.locked) patch(selected.id, { rotation: [selected.rotation[0], selected.rotation[1] + (e.key.toLowerCase() === 'q' ? -1 : 1) * Math.PI / 12, selected.rotation[2]] });
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  });
  function savePresentation(value: TavernPresentation) {
    if (isPlaying) throw new Error('角色与演出配置请在编辑模式修改。');
    const tavern = validatePresentation(value);
    if (!perform(t => ({ ...t, tavern }))) throw new Error('角色与演出未能保存，请检查存储空间。');
  }
  function spawnTavernCharacter(card: TavernCard, kind: 'card' | 'figurine', value: TavernPresentation) {
    if (isPlaying) throw new Error('请在编辑模式放置角色。');
    const o = createObject(kind); o.name = card.name || '未命名角色'; o.color = '#c4a46b';
    o.texture = kind === 'card' ? characterCardImage(card, value.archive) : card.portrait;
    o.metadata = { ...o.metadata, tavernCharacterId: card.id, tavernPortrait: true, moveMode: kind === 'figurine' ? 'grid' : 'fixed', ...(kind === 'figurine' ? { model: '' } : {}) };
    const bounds = tableBounds(tableRef.current); o.position = [Math.max(bounds.minX, Math.min(bounds.maxX, -2 + tableRef.current.objects.length % 5)), kind === 'card' ? .13 : .81, Math.max(bounds.minZ, Math.min(bounds.maxZ, 2))];
    const tavern = validatePresentation(value); tavern.bindings[bindingKey(o)] = card.id;
    if (!perform(t => ({ ...t, tavern, objects: [...t.objects, o] }))) throw new Error('角色物件未能放置。');
    selectObject(o.id); setPanel('objects');
  }
  function chooseEditorScene(sceneId: string) {
    try { const definition = captureSceneDraft(tableRef.current); if (definition && sceneId !== tableRef.current.workspace?.sceneId) editStoryScene(definition, sceneId); }
    catch (e) { flash((e as Error).message); }
  }
  function openCurrentStoryTools() {
    if (tableRef.current.workspace?.definition?.rpg) void openRpgStudio(); else openStudio();
  }
  function saveEditorDraft() {
    try { const current = tableRef.current, definition = captureSceneDraft(current); const next = definition ? { ...current, workspace: { ...current.workspace!, definition } } : current;
      if (commit(next, false)) { persistRecords(tablesRef.current.map(t => t.id === next.id ? tableRef.current : t)); flash('编辑稿已保存到本机。'); }
    } catch (e) { flash(e instanceof Error ? e.message : '保存失败，请导出备份。'); }
  }
  function openSettings() { discovery.current?.abort(); setDetecting(false); setConfigDraft({ ...config }); setModels([]); setModelStatus(''); setModal('settings'); }
  function invalidateConnection() { discovery.current?.abort(); setDetecting(false); setModels([]); setModelStatus(''); }
  async function detectModels() {
    discovery.current?.abort(); const controller = new AbortController(); discovery.current = controller;
    const timer = setTimeout(() => controller.abort(), 20000); setDetecting(true); setModelStatus('');
    try {
      const response = await fetch('/api/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify(configDraft) });
      const data = await response.json(); if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(data.error ?? '连接失败'); setModels(data.models); setModelStatus(`连接成功，发现 ${data.models.length} 个模型`);
      if (data.models.length) setConfigDraft(c => ({ ...c, model: c.model || data.models[0] }));
    } catch (e) { if (!controller.signal.aborted) setModelStatus(e instanceof Error ? e.message : '连接失败'); }
    finally { clearTimeout(timer); if (discovery.current === controller) setDetecting(false); }
  }
  async function askAI() {
    if (!prompt.trim() || busy) return;
    if (config.provider === 'demo' || !config.model.trim()) { openSettings(); setModelStatus('请连接模型后使用桌面主持。'); return; }
    const current = tableRef.current; const signature = tableSignature(current); const text = prompt.trim(); const controller = new AbortController(); aiAbort.current = controller;
    const previous = chat[current.id] ?? []; setChat(all => ({ ...all, [current.id]: [...previous, { role: 'user', content: text }] })); setPrompt(''); setBusy(true); setPlan(null);
    try {
      const messages = buildTabletopMessages(current, text, previous.slice(-12));
      if (isPlaying) messages.push({ role: "system", content: "当前为游戏模式。只根据已经发生的事实提供故事叙述与玩家行动建议。保持 actions 为空，不创建、删除或修改物件，不预判骰点或改变游戏进度。" });
      const request = async (context: TabletopMessage[]) => {
        const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ ...config, responseFormat: 'tabletop', messages: context }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error ?? '模型没有回应');
        return data.message as string;
      };
      let raw = await request(messages);
      if (controller.signal.aborted) return;
      if (signature !== tableSignature(tableRef.current)) throw new Error('等待模型时桌面已变化，请根据当前桌面重新发送指令。');
      let value: AssistantPlan;
      try { value = parseAssistantPlan(raw, tableRef.current); }
      catch (error) {
        flash('模型操作格式需要调整，正在尝试修正一次…');
        raw = await request(buildPlanRepairMessages(messages, raw, error));
        if (controller.signal.aborted) return;
        if (signature !== tableSignature(tableRef.current)) throw new Error('等待模型时桌面已变化，请根据当前桌面重新发送指令。');
        value = parseAssistantPlan(raw, tableRef.current);
      }
      setChat(all => ({ ...all, [current.id]: [...(all[current.id] ?? []), { role: 'assistant' as const, content: value.message }].slice(-40) }));
      if (!isPlaying && value.actions.length) setPlan({ value, raw, tableId: current.id, signature });
      perform(t => addTableLog(t, `AI 主持：${value.message.slice(0, 900)}`), false);
    } catch (e) { if (!controller.signal.aborted) { const message = e instanceof Error ? e.message : '主持连接失败'; flash(message); setChat(all => ({ ...all, [current.id]: [...(all[current.id] ?? []), { role: 'assistant', content: `请求未完成：${message}` }] })); } }
    finally { if (aiAbort.current === controller) setBusy(false); }
  }
  function applyPlan() {
    if (isPlaying) { flash('游玩中的 AI 主持只提供叙事与建议，行动请通过游戏按钮执行。'); setPlan(null); return; }
    if (tableRef.current.combat) { flash('请先收起战斗，再应用布置方案。'); return; }
    if (tableRef.current.adventure?.progress.phase === 'rolling') { flash('请等待战役检定完成，再应用桌面方案。'); setPanel('play'); return; }
    if (!plan || plan.tableId !== tableRef.current.id) return;
    if (readRelicGuide(tableRef.current)) { flash('这局正在跟随指引，请通过指引完成行动。'); setPanel('play'); return; }
    try {
      if (plan.signature !== tableSignature(tableRef.current)) { setPlan(null); throw new Error('桌面已变化，请重新生成操作方案。'); }
      const validated = parseAssistantPlan(plan.raw, tableRef.current); let next = tableRef.current; const rolls: string[] = [];
      for (const action of validated.actions) {
        if (action.type === 'spawn') { const object = createObject(action.kind, { name: action.name, position: action.position, color: action.color, ...(action.sides ? { sides: action.sides } : {}) }); next = { ...next, objects: [...next.objects, object] }; }
        else if (action.type === 'move') next = updateObject(next, action.id, { position: action.position });
        else if (action.type === 'update') { const { type: _type, id, ...values } = action; next = updateObject(next, id, values); }
        else if (action.type === 'remove') next = removeObject(next, action.id);
        else if (action.type === 'draw') next = drawCard(next, action.id);
        else if (action.type === 'shuffle') next = shuffleDeck(next, action.id);
        else if (action.type === 'roll') { if (!next.physics.gravity) throw new Error('物理掷骰需要开启重力。'); rolls.push(action.id); next = updateObject(next, action.id, { value: 0 }); }
      }
      next = validateTableSession(addTableLog(next, `应用 AI 桌面操作：${validated.actions.length} 项。`)); if (!commit(next, true, 'ai')) return;
      if (rolls.length) {
        const requests: Record<string, number> = {};
        rolls.forEach(id => { requests[id] = ++rollSequence.current; pendingRolls.current[id] = requests[id]; });
        setRollRequests(all => ({ ...all, ...requests }));
      }
      setPlan(null); flash('AI 操作已应用到桌面，可撤销。');
    } catch (e) { flash(`方案未执行：${e instanceof Error ? e.message : '桌面已变化，请重新生成'}`); }
  }
  async function importTable(file?: File) {
    if (!file) return;
    try {
      if (file.size > 10_000_000) throw new Error('整桌存档不能超过 10 MB。');
      const value = await importPortableSession(JSON.parse(await file.text())); value.id = crypto.randomUUID();
      aiAbort.current?.abort(); setBusy(false); setTables(all => [...all, value]); switchTable(value.id); flash('整桌物件、牌堆与设置已导入');
    } catch (e) { flash(e instanceof Error ? e.message : '无法读取桌面存档'); }
    if (importInput.current) importInput.current.value = '';
  }
  async function copySave() {
    try { try { await navigator.clipboard.writeText(saveText); } catch { const textarea = document.querySelector<HTMLTextAreaElement>('.tt-save-data'); textarea?.focus(); textarea?.select(); if (!document.execCommand('copy')) throw new Error('复制失败'); } flash('整桌存档已复制'); }
    catch { flash('内容已选中，请按 Ctrl + C 复制。'); }
  }
  function actionLabel(action: TableAction) {
    if (action.type === 'spawn') return `添加${labels[action.kind]}「${action.name}」`;
    const object = table.objects.find(o => o.id === action.id); const name = object?.name ?? action.id;
    return `${({ move: '移动', update: '修改', roll: '掷出', shuffle: '洗牌', draw: '抽牌', remove: '移除' } as const)[action.type]} · ${name}`;
  }

  const playerObjectActions = <PlayerObjectPanel table={table} object={selected} seat={seat} moving={Boolean(playMovingId)} onMove={togglePlayMove} onAction={objectAction} onInteract={playInteraction} onHealth={playHealth} onValue={(id, value) => patch(id, { value })} onSelect={selectObject} onDeal={(id, count, all) => { try { commit(dealCards(tableRef.current, id, count, all ? ["玩家1", "玩家2", "玩家3", "玩家4"] : [seat])); } catch (e) { flash((e as Error).message); } }} />;
  if (studio) return <Suspense fallback={<div className="tt-loading">正在打开剧情工具…</div>}>{studioDefinition?.rpg ? <RpgStudio initialTab={rpgStudioTab} entries={libraryEntries} initialDefinition={studioDefinition} onClose={closeStudio} onPlay={playAdventure} onEditScene={editStoryScene} /> : <AdventureStudio source={table} entries={libraryEntries} initialDefinition={studioDefinition} onClose={closeStudio} onPlay={playAdventure} onEditScene={editStoryScene} />}</Suspense>;
  if (legacy) return <><button className="tt-back" onClick={() => { resetPhysics(); setLegacy(false); }}><ArrowUDownLeft size={17} />返回三维桌面</button><LegacyApp /></>;
  if (manageLibrary) return <Suspense fallback={<div className="tt-loading">正在打开物件后台…</div>}><LibraryManager entries={libraryEntries} loading={libraryLoading} error={libraryError} initialObject={libraryObject} onClose={() => { setManageLibrary(false); setLibraryObject(null); resetPhysics(); }} onChanged={libraryChanged} onRefresh={() => void refreshLibrary()} /></Suspense>;
  return <div className={`tt-app ${isPlaying ? "tt-play-mode" : "tt-edit-mode"} ${immersive && isPlaying ? "tt-play-immersive" : ""}`} data-mode={isPlaying ? "play" : "edit"} data-history={historyVersion}>
    {isPlaying && adventure?.definition.rpg && <RpgAudio table={table} />}
    <header className="tt-header">
      <a className="tt-brand" href="#" onClick={e => e.preventDefault()}><span><img src="/brand/bear-mark.png" alt="" /></span><b>熊酒馆<small>BEAR TAVERN</small></b></a>
      <button className="tt-table-name" onClick={() => setModal('tables')}><FolderOpen size={17} /><span>{table.name}</span><span className="bt-draft-tag">{isPlaying ? table.campaign?.name ?? "进行中" : "草稿"}</span><span className="tt-chevron">⌄</span></button>
      <nav className="we-mode-switch" aria-label="工作区模式"><button aria-pressed={!isPlaying} onClick={() => isPlaying && returnToEditor()}><NotePencil size={15} />编辑模式</button><button aria-pressed={isPlaying} onClick={() => !isPlaying && beginEditorPlay()}><Play size={15} weight="fill" />游戏模式</button></nav>
      <div className="tt-header-right">{isPlaying && adventure?.definition.rpg && <button className="tt-plain" aria-label="查看角色卡" onClick={showCharacterCard}><Cards size={17} /><span>角色卡</span></button>}<button className="tt-plain bt-campaign-entry" aria-label="跑团存档" onClick={openGames}><FloppyDisk size={17} /><span>跑团存档</span></button>{!isPlaying && <button className="tt-plain bt-studio-entry" aria-label="角色与文字演出" onClick={() => setBearStudio("characters")}><Cards size={16} /><span>角色与演出</span></button>}{!isPlaying && <button className="tt-small-button bt-save-draft" onClick={saveEditorDraft}><FloppyDisk size={16} /><span>保存作品</span></button>}
        {isPlaying ? <><button className="tt-plain" aria-label="游戏库" onClick={openGameModules}><BookOpen size={17} /><span>游戏库</span></button><button className="tt-small-button" aria-label={immersive ? '显示游戏面板' : '沉浸视图'} onClick={() => setImmersive(v => !v)}><ArrowsOut size={17} /><span>{immersive ? '显示行动' : '沉浸视图'}</span></button></> : <><button className="tt-plain we-assets" aria-label="物件后台" onClick={() => openLibraryManager()}><Cube size={16} /><span>素材</span></button><button className="tt-plain" onClick={() => void openRpgStudio()}><BookOpen size={16} /><span>剧情工具</span></button><button className="tt-plain we-story-entry" aria-label="故事编辑器" onClick={openStudio}><NotePencil size={16} /><span>故事编辑器</span></button><button className="tt-plain" aria-label="新桌面" onClick={() => { setNewName(''); setPreset('sandbox'); setModal('new'); }}><Plus size={16} /></button><button className="tt-gold-button we-start-play" aria-label="新开试玩" onClick={beginNewEditorPlay}><Play size={16} weight="fill" /><span>新开试玩</span></button></>}
        <button aria-label={isPlaying ? '导出游戏进度' : '导出编辑稿'} className="tt-icon" title={isPlaying ? '导出游戏进度' : '导出编辑稿'} onClick={() => setModal('save')}><DownloadSimple size={18} /></button>
      </div>
    </header>
    <input ref={importInput} type="file" accept=".json,application/json" hidden onChange={e => void importTable(e.target.files?.[0])} />
    <div className="tt-layout">{!isPlaying && <EditorSidebar table={table} objects={visibleObjects} selectedId={selectedId} selectedIds={selectedIds} entries={libraryEntries} loading={libraryLoading} error={libraryError} libraryOpen={library} onLibraryToggle={() => setLibrary(v => !v)} onSelect={(id, additive) => { selectObject(id, additive); setPanel('objects'); setTool('select'); }} onScene={chooseEditorScene} onSpawn={spawnFromLibrary} onManage={() => openLibraryManager()} onRefresh={() => void refreshLibrary()} tools={<nav className="tt-toolrail" aria-label="桌面工具"><button className={tool === 'select' ? 'active' : ''} aria-label="选择与拖拽" title="选择与拖拽" onClick={() => setTool('select')}><MouseSimple size={21} /></button><button className={tool === 'measure' ? 'active' : ''} aria-label="测距工具" title="测距工具" onClick={() => { setTool('measure'); setDistance(null); }}><Ruler size={21} /></button><i /><button className={library ? 'active' : ''} aria-label="物件库" title="物件库" onClick={() => setLibrary(!library)}><Cube size={21} /></button><button aria-label="导入自定义素材" title="导入自定义素材" onClick={() => openLibraryManager()}><UploadSimple size={21} /></button><i /><button className={table.grid.enabled ? 'active' : ''} aria-label="显示网格" title="显示网格" onClick={() => perform(t => ({ ...t, grid: { ...t.grid, enabled: !t.grid.enabled } }))}><Selection size={21} /></button><button className={table.grid.snap ? 'active' : ''} aria-label="网格吸附" title="网格吸附" onClick={() => perform(t => ({ ...t, grid: { ...t.grid, snap: !t.grid.snap } }))}><Magnet size={21} /></button><div className="tt-rail-space" /><button aria-label="撤销" title="撤销 Ctrl+Z" disabled={!undoRef.current.length} onClick={undo}><ArrowCounterClockwise size={20} /></button><button aria-label="重做" title="重做 Ctrl+Shift+Z" disabled={!redoRef.current.length} onClick={redo}><ArrowClockwise size={20} /></button><button className="tt-mobile-panel" aria-label={mobilePanel ? "收起桌面面板" : "打开桌面面板"} onClick={() => setMobilePanel(!mobilePanel)}><List size={21} /></button></nav>} />}
      <section className={`tt-stage ${isPlaying && table.combat?.rpg ? 'rpg-battle-stage' : ''}`}><div className="tt-stage-toolbar">{isPlaying && table.combat?.rpg ? <RpgBattleMessages table={table} plan={rpgBattlePlan} /> : <div><span className="tt-live-dot" /><b>{table.combat ? table.combat.phase === "complete" ? "遭遇结束" : "战术遭遇进行中" : playGuide ? (playGuide.phase === "complete" ? "本局结束" : "跟随指引游玩") : adventure ? (adventure.progress.phase === "complete" ? "战役结束" : "跟随战役指引") : isPlaying ? "自由冒险" : "场景编辑"}</b>{isPlaying && selected ? <button className="we-selection-entry" title="查看所选物件行动" aria-live="polite" aria-atomic="true" onClick={() => setObjectActionsOpen(v => !v)}><span>已选中</span><b>{selected.faceDown && selected.kind === 'card' ? '背面卡牌' : selected.name}</b></button> : <span>{visibleObjects.length} 个物件</span>}{isPlaying && adventure && <span className="bt-status-story" title={adventure.progress.lastMessage}>{movingObject ? `正在移动 ${movingObject.name} · 点击合法目的地，Esc 取消` : centralStory ? '剧情正在展开 · 在桌面中央继续故事' : adventure.progress.lastMessage}</span>}</div>}<div className="tt-view-buttons">{isPlaying && <button className="we-panel-toggle" aria-label={mobilePanel ? "收起游戏面板" : "打开游戏面板"} onClick={() => { setMobilePanel(v => !v); setImmersive(false); }}><List size={16} /></button>}<button className={view === 'perspective' ? 'active' : ''} onClick={() => chooseView('perspective')}><Cube size={15} />透视</button><button className={view === 'top' ? 'active' : ''} onClick={() => chooseView('top')}><Selection size={15} />俯视</button>{isPlaying && <button className={cameraFollow ? 'active' : ''} aria-label="跟随主角" aria-pressed={cameraFollow} disabled={!protagonist} title={starMapView ? '星图期间暂停跟随，返回场景后自动恢复' : protagonist ? '镜头平滑跟随 ' + protagonist.name + '；右键旋转、滚轮缩放；再次点击恢复自由镜头' : '当前场景没有可跟随的主角'} onClick={toggleCameraFollow}><CrosshairSimple size={15} />跟随主角</button>}<button aria-label="重置视角" title="重置当前视角；旋转、缩放和平移会按桌面自动记住" onClick={resetView}><ArrowCounterClockwise size={15} /></button></div></div>
        <div className="tt-canvas-wrap"><Suspense fallback={<div className="tt-loading"><Cube size={30} /><span>正在准备桌面与物理引擎…</span></div>}><TableCanvas
          cameraFollowTarget={cameraFollow && protagonist ? protagonist.position : undefined} presentationEffect={effectNow} generation={physicsEpoch} cameraScope={cameraId} cameraPose={cameraMemory.current[cameraId]?.[view]} cameraReset={cameraReset} onCameraChange={handleCameraChange}
          session={{ ...table, objects: visibleObjects }} playMode={isPlaying} selectedId={selectedId} selectedIds={selectedIds}
          onSelect={(id, additive) => { const target = table.objects.find(o => o.id === id); if (starMapView && target?.metadata.rpgWorld) return; if (isPlaying && adventure?.progress.rpg?.mapId === 'world' && typeof target?.metadata.rpgDestination === 'string') { rpgAction({ type: 'travel', mapId: target.metadata.rpgDestination }); return; } if (isPlaying && table.combat?.rpg && rpgBattlePlan && target) { chooseRpgBattleCell(target.position); return; } if (isPlaying && playMovingId && adventure?.definition.rpg && typeof target?.metadata.rpgEvent === 'number') { moveToDestination(target.position); return; } selectObject(id, !isPlaying && additive); if (id && !isPlaying) setPanel('objects'); }}
          interactionLocked={isPlaying || Boolean(playGuide) || Boolean(storyRolling) || Boolean(table.combat)}
          onDestination={isPlaying && table.combat?.rpg && rpgBattlePlan ? chooseRpgBattleCell : isPlaying && (playMovingId || combatMoving && table.combat) ? moveToDestination : undefined}
          focusBounds={atlasBoard ? { center: [0, 0, 0], width: Number(atlasBoard.metadata.width), depth: Number(atlasBoard.metadata.depth) } : table.surface ? { center: [0, 0, 0], ...tableSurface(table) } : playGuide ? { center: [1.3, 0, -.6], width: 16, depth: 10 } : adventure ? { center: [1, 0, 0], width: 22, depth: 12 } : undefined}
          effectCells={rpgEffectCells} guideCells={guideCells} onGuideCell={cell => { if (table.combat?.rpg) { const [x, z] = cell.split(',').map(Number); chooseRpgBattleCell([x, 0, z]); } else if (playMovingId || table.combat) { const [x, z] = cell.split(',').map(Number); moveToDestination([x, 0, z]); } else guideAction({ type: 'move', cell }); }}
          guideObjectIds={table.combat ? [table.combat.order[table.combat.turn], ...(table.combat.pending ? [table.combat.pending.dieId] : [])] : playGuide && guideHero ? [guideHero.id, ...(playGuide.pending ? [playGuide.pending.dieId] : [])] : playMovingId ? [playMovingId] : []}
          onTransform={(id, transform, reason) => {
            if (physicsEpoch !== epochRef.current) return false;
            const object = tableRef.current.objects.find(o => o.id === id);
            if (!object || object.locked || isPlaying && !(object.kind === 'dice' && reason === 'physics')) return false;
            if (sameTransform(object, transform, reason === 'drag' ? .00001 : .025)) return true;
            return patch(id, { position: transform.position.map((n, i) => Math.max(i === 1 ? 0 : i === 0 ? tableBounds(tableRef.current).minX : tableBounds(tableRef.current).minZ, Math.min(i === 1 ? 30 : i === 0 ? tableBounds(tableRef.current).maxX : tableBounds(tableRef.current).maxZ, n))) as Vec3, rotation: transform.rotation }, reason === 'drag');
          }}
          battleImpact={isPlaying && battleImpact?.tableId === table.id && table.combat?.rpg ? battleImpact : undefined} onDiceResult={handleDiceResult} rollRequests={rollRequests} onRollError={message => { if (physicsEpoch !== epochRef.current || tableRef.current.id !== table.id) return; resetPhysics(); flash(message); }} uprightRequests={uprightRequests} view={view} tool={tool} onMeasure={setDistance}
        /></Suspense></div>
        {isPlaying && !centralStory && table.combat?.rpg && adventure?.progress.phase !== 'complete' && <Suspense fallback={<p className="rpg-battle-dock">正在准备武功行动卡…</p>}><RpgBattleDock table={table} seat={seat} plan={rpgBattlePlan} onPlan={plan => { setRpgBattlePlan(plan); setObjectActionsOpen(false); }} onAction={runRpgBattleAction} onCharacter={showCharacterCard} onFinish={() => rpgAction({ type: 'finishBattle' })} /></Suspense>}
        {isPlaying && !centralStory && !starMapView && selected && objectActionsOpen && <div className="tt-object-popover" role="region" aria-label="所选物件行动"><div className="tt-object-popover-heading"><span>物件行动 · 剧情保持打开</span><button className="tt-icon" aria-label="关闭物件行动" onClick={() => setObjectActionsOpen(false)}><X size={16} /></button></div>{playerObjectActions}{adventure?.definition.rpg && adventure.progress.rpg && !table.combat && (typeof selected.metadata.rpgNpc === 'number' || typeof selected.metadata.rpgEvent === 'number') && <button className="tt-gold-button full" onClick={() => rpgAction({ type: 'event', kind: typeof selected.metadata.rpgNpc === 'number' ? 'npcs' : 'events', index: Number(selected.metadata.rpgNpc ?? selected.metadata.rpgEvent) })}>交互并继续剧情</button>}</div>}
        <RpgTextPresentation table={table} suppressed={Boolean(effectNow) || centralStory || starMapView} />
        {centralRpgStory && <RpgStoryOverlay table={table} onAction={rpgAction} onEdit={returnToEditor} onRestart={() => playAdventure(adventure!.definition)} />}
        {isPlaying && adventure && !adventure.definition.rpg && <AdventureStoryOverlay table={table} visible={centralAdventureStory} onDismiss={() => setDismissedStory(adventureKey)} onAction={storyAction} onRoll={storyRoll} onEdit={returnToEditor} onRestart={() => playAdventure(adventure.definition)} />}
        {effectNow && ['table', 'message'].includes(effectNow.effect.scope) && <div className={`bt-effect-overlay ${effectNow.effect.scope}`} aria-live="polite"><TavernEffectImage key={effectNow.key} effect={effectNow.effect} /></div>}
        {isPlaying && !centralStory && !starMapView && !table.combat && !playGuide && !storyRolling && <nav className="bt-play-action-dock" aria-label="桌面快捷行动"><span className="bt-action-actor"><UsersThree size={20} /><b>{selected?.kind === 'figurine' ? selected.name : adventure?.definition.rpg ? adventure.definition.rpg.roles.hero?.name ?? seat : seat}</b></span><button disabled={adventure?.definition.rpg ? Boolean(adventure.progress.rpg?.pending || adventure.progress.rpg?.frames.length) : !selected || Boolean(playMoveAccessError(table, selected.id, seat))} onClick={() => adventure?.definition.rpg ? moveRpgLeader() : togglePlayMove()}><Selection size={16} />{playMovingId ? '取消移动' : '移动'}</button><button onClick={() => { setPanel(adventure?.definition.rpg ? 'objects' : 'workshop'); setExploreRequest(v => v + 1); setMobilePanel(true); setImmersive(false); }}><Cards size={16} />物品</button>{adventure?.definition.rpg && <button onClick={showCharacterCard}><UsersThree size={16} />角色卡</button>}<button disabled={!selected} onClick={() => setObjectActionsOpen(v => !v)}><Hand size={16} />物件行动</button>{rpgSpace && <button className="bt-action-primary" disabled={!rpgSpace.action && !rpgSpace.interaction} title={rpgSpace.label} onClick={() => { if (rpgSpace.action) rpgAction(rpgSpace.action); else if (rpgSpace.interaction) playInteraction(rpgSpace.interaction.id, rpgSpace.interaction.action); }}><ArrowRight size={16} />{rpgSpace.action?.type === 'next' ? '继续剧情' : '交互'}<kbd>空格</kbd></button>}{adventureKey && <button className="bt-action-primary" onClick={() => { setPlayMovingId(null); setDismissedStory(null); }}><BookOpen size={16} />继续剧情</button>}</nav>}
        {tool === 'measure' && <div className="tt-measure"><Ruler size={17} />{distance === null ? '按住左键在桌面上拖动测量距离' : `距离 ${(distance / table.grid.size).toFixed(2)} 格 · ${distance.toFixed(2)} 桌面单位`}</div>}
        {!isPlaying && selected && !playGuide && !storyRolling && !table.combat && <div className="tt-selection-toolbar"><span style={{ background: selected.color }} /><b>{selected.faceDown && selected.kind === 'card' ? '背面卡牌' : selected.name}</b>{selected.kind === 'dice' && !adventure && <button disabled={selected.locked} onClick={() => objectAction('roll')}><DiceFive size={16} />掷骰</button>}{selected.kind === 'deck' && <><button disabled={selected.locked} onClick={() => objectAction('shuffle')}><Shuffle size={16} />洗牌</button><button disabled={selected.locked || !selected.cards?.length} onClick={() => objectAction('draw')}><Cards size={16} />抽牌</button></>}{selected.kind === 'card' && <button disabled={selected.locked} onClick={() => objectAction('flip')}><ArrowUDownLeft size={16} />翻面</button>}<button onClick={() => objectAction('lock')} aria-label={selected.locked ? '解锁所选物件' : '锁定所选物件'}><LockSimple size={16} /></button><button disabled={selected.locked} onClick={() => objectAction('duplicate')} aria-label="复制所选物件"><Plus size={16} /></button><button disabled={selected.locked} onClick={() => objectAction('delete')} aria-label="删除所选物件"><Trash size={16} /></button><button onClick={() => setSelectedId(null)} aria-label="取消选择"><X size={16} /></button></div>}
        {selectedIds.filter(id => table.objects.some(o => o.id === id && o.kind === "dice")).length > 1 && <div className="tt-dice-tray">{Object.keys(rollRequests).some(id => selectedIds.includes(id)) ? "骰子正在落定…" : `结果合计 ${table.objects.filter(o => selectedIds.includes(o.id) && o.kind === "dice").reduce((sum, o) => sum + (o.diceFaces?.[o.value - 1]?.value ?? o.value), 0)}`}</div>}
        {!isPlaying && <EditorEventDock table={table} onStudio={openCurrentStoryTools} onScene={chooseEditorScene} />}
        <div className="tt-stage-caption"><span><MouseSimple size={13} />{starMapView ? "点击星图地点启航 · 右键旋转 · 滚轮缩放" : rpgSpace ? "WASD / ↑ ↓ ← → 移动 · 右键旋转 · 滚轮缩放" : isPlaying ? "点选物件行动 · 右键旋转视角 · 滚轮缩放" : "左键布置物件 · 右键旋转视角 · 滚轮缩放"}</span><span>{starMapView ? "固定航线物件 · 进度自动保存" : rpgSpace ? `空格 · ${rpgSpace.label}` : isPlaying ? "进度自动保存" : "Q / E 旋转 · L 锁定 · Delete 删除"}</span></div>{playGuide && <div className="tt-play-cue"><div><b>第 {playGuide.round} 轮 · {playGuide.hero === "blue" ? "蓝队" : "橙队"} · {playGuide.ap} 次行动</b><span>{guideMoving ? "点击绿色格子，或在指引中选择目的地。" : playGuide.lastMessage}</span></div><button onClick={() => { setPanel("play"); setMobilePanel(true); setLibrary(false); }}><BookOpen size={15} />查看指引</button></div>}
        {movingObject && <div className="tt-play-cue"><div><b>移动 {movingObject.name}</b><span>{movementRules(movingObject).mode === 'grid' ? '点击绿色合法格点移动' : '点击桌面目的地移动'} · 保持高度与朝向 · Esc 取消</span></div><button onClick={() => setPlayMovingId(null)}>取消移动</button></div>}
        {!centralStory && table.combat && !table.combat.rpg && <div className="tt-play-cue"><div><b>第{table.combat.round}轮 · {table.combat.ap}行动点</b><span>{table.combat.message}</span></div><button onClick={() => { setPanel(adventure?.definition.rpg ? "play" : "workshop"); setMobilePanel(true); }}>战斗面板</button></div>}
      </section>
      <aside className={`tt-panel ${mobilePanel ? 'mobile-open' : ''}`}><div className="tt-panel-tabs">{(isPlaying ? ([...(relicGame || adventure ? [{ id: 'play' as const, name: adventure ? '进度' : '指引', icon: BookOpen }] : []), ...(!playGuide ? [{ id: 'workshop' as const, name: '冒险', icon: DiceFive }] : []), { id: 'objects' as const, name: '队伍', icon: UsersThree }, { id: 'ai' as const, name: '主持', icon: Sparkle }, { id: 'notes' as const, name: '纪事', icon: NotePencil }]) : [{ id: 'objects' as const, name: '属性', icon: Cube }, { id: 'workshop' as const, name: '布置', icon: Selection }, { id: 'story' as const, name: '故事', icon: BookOpen }, { id: 'notes' as const, name: '笔记', icon: NotePencil }]).map(p => <button key={p.id} className={panel === p.id ? 'active' : ''} onClick={() => setPanel(p.id)}><p.icon size={15} />{p.name}</button>)}</div>
        <div key={panel} className="tt-panel-body">{!isPlaying && <div className="bt-effect-controls"><button onClick={() => table.workspace?.definition?.rpg ? void openRpgStudio('characters') : setBearStudio('characters')}>角色卡与棋子</button><button onClick={() => setBearStudio('text')}>文字 APNG</button></div>}{Boolean(presentation?.effects.length) && <div className="bt-effect-controls"><select aria-label="场景文字演出" value={effectChoice} onChange={e => setEffectChoice(e.target.value)}><option value="">选择文字演出</option>{presentation!.effects.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select><button disabled={!presentation?.effects.some(e => e.id === effectChoice)} onClick={() => { const e = presentation?.effects.find(e => e.id === effectChoice); if (e) playEffect(e); }}>播放</button>{effectNow && <button onClick={stopEffects}>停止演出</button>}{!isPlaying && <button disabled={!presentation?.effects.some(e => e.id === effectChoice)} onClick={() => { const value = structuredClone(presentation!); value.effects = value.effects.filter(e => e.id !== effectChoice); savePresentation(value); if (effectNow?.effect.id === effectChoice) stopEffects(); setEffectChoice(''); }}>删除演出</button>}</div>}{panel === 'objects' && <TavernCharacterPanel table={table} selected={selected} onSelect={id => selectObject(id)} {...(!isPlaying ? { onEdit: () => table.workspace?.definition?.rpg ? void openRpgStudio('characters') : setBearStudio('characters') } : {})} />}{!isPlaying && <details className="bt-surface-details"><summary>场景板规格 · {tableSurface(table).width} × {tableSurface(table).depth}</summary><EditorSurface table={table} onChange={surface => perform(t => ({ ...t, surface }))} /></details>}{!isPlaying && panel === 'objects' && <>{selected ? <><div className="bt-inspector-tabs" role="tablist" aria-label="物件编辑分类"><button role="tab" aria-selected={inspectorTab === 'properties'} onClick={() => setInspectorTab('properties')}>属性</button><button role="tab" aria-selected={inspectorTab === 'behavior'} onClick={() => setInspectorTab('behavior')}>行为与限制</button></div>{selected.metadata.rpgGenerated && <p className="bt-generated-hint">此物件由剧情生成。<button onClick={openCurrentStoryTools}>在剧情工具中编辑 →</button></p>}<fieldset className="tt-guided-inspector" disabled={Boolean(playGuide) || Boolean(storyRolling) || Boolean(table.workspace?.definition?.rpg && selected.metadata.rpgGenerated)}>{inspectorTab === 'behavior' ? <EditorBehavior object={selected} onChange={values => patch(selected.id, { metadata: values })} /> : <fieldset className="tt-guided-inspector" disabled={Boolean(table.combat)}><Inspector object={selected} table={table} change={values => patch(selected.id, values)} act={objectAction} /></fieldset>}</fieldset>{playGuide && <p className="tt-guide-readonly">本局状态由指引更新，可切换到“指引”继续。</p>}<button className="tt-small-button full" onClick={() => openLibraryManager(selected)}><Cube size={15} />保存为库模板</button></> : <div className="tt-empty-selection"><Selection size={31} /><h3>选择一个物件</h3><p>点击桌面或物件列表，<br />查看和编辑它的属性。</p></div>}<label className="tt-multiselect"><input type="checkbox" checked={multiSelect} onChange={e => setMultiSelect(e.target.checked)} />多选模式 · 已选{selectedIds.length}件<button onClick={() => setPanel("workshop")}>批量操作</button></label><div className="tt-list-heading bt-inspector-list"><span>桌面物件</span><b>{visibleObjects.length}</b></div><input className="tt-filter bt-inspector-list" aria-label="筛选桌面物件" placeholder="查找物件…" value={filter} onChange={e => setFilter(e.target.value)} /><div className="tt-object-list bt-inspector-list">{visibleObjects.filter(o => (o.faceDown && o.kind === 'card' ? '背面卡牌' : o.name).includes(filter) || labels[o.kind].includes(filter)).map(o => { const Icon = icons[o.kind]; return <button key={o.id} className={selectedId === o.id || selectedIds.includes(o.id) ? 'active' : ''} onClick={e => { selectObject(o.id, e.shiftKey); setTool('select'); }}><Icon size={16} style={{ color: o.color }} /><span>{o.faceDown && o.kind === 'card' ? '背面卡牌' : o.name}</span>{o.kind === 'deck' && <small>{o.cards?.length ?? 0}</small>}{o.kind === 'dice' && <small>{o.value || '—'}</small>}{o.locked && <LockSimple size={12} />}</button>; })}</div><fieldset className="tt-guided-inspector" disabled={Boolean(playGuide) || Boolean(storyRolling)}><div className="tt-table-options"><label>网格大小<input aria-label="网格大小" type="number" min="0.25" max="4" step="0.25" value={table.grid.size} onChange={e => { const size = Number(e.target.value); if (size >= .25 && size <= 4) perform(t => ({ ...t, grid: { ...t.grid, size } })); }} /></label><button className={table.physics.gravity ? 'active' : ''} onClick={() => perform(t => ({ ...t, physics: { ...t.physics, gravity: !t.physics.gravity } }))}><Cube size={15} />{table.physics.gravity ? '重力已开启' : '重力已关闭'}</button></div></fieldset></>}
        {isPlaying && panel === 'objects' && <>{adventure?.progress.rpg?.characters ? <><RpgCharacterSheet table={table} onAction={rpgAction} openBag={exploreRequest} /><details className="bt-character-fold"><summary>所选物件与场上角色</summary>{playerObjectActions}</details></> : playerObjectActions}{!adventure && !playGuide && !table.combat && <button className="tt-small-button full" onClick={() => rollMany(true)}>投掷桌面上全部骰子</button>}</>}
        {!isPlaying && panel === 'workshop' && <EditorBatch selectedIds={selectedIds} onBatch={mode => { try { commit(arrangeObjects(tableRef.current, selectedIds, mode)); } catch (e) { flash((e as Error).message); } }} />}
        {!isPlaying && panel === 'story' && <EditorStory table={table} onStudio={openStudio} onPlay={beginNewEditorPlay} />}
        {isPlaying && panel === 'workshop' && !adventure?.definition.rpg && <PlayWorkbench key={table.id} table={table} seat={seat} exploreRequest={exploreRequest} moving={combatMoving} onMoveMode={() => { setCombatMoving(v => !v); setTool("select"); setLibrary(false); }} onSelect={id => selectObject(id)} onInteract={playInteraction} onCombat={battleAction} onAttack={battleAttack} />}
        {isPlaying && panel === 'workshop' && adventure?.definition.rpg && <section className="we-section"><h3>跑团行动</h3><p>探索、角色卡与剧情在指引中操作；遭遇发生时，桌面下方会显示武功行动卡。</p><button className="tt-gold-button full" onClick={() => setPanel('play')}>打开剧情与角色卡</button></section>}
        {panel === 'play' && adventure?.definition.rpg && <Suspense fallback={<p>正在准备 RPG 剧情…</p>}><RpgGuide table={table} seat={seat} selectedId={selectedId} moving={Boolean(playMovingId)} combatMoving={combatMoving} onAction={rpgAction} onMove={moveRpgLeader} onSelect={selectObject} onCombatMove={() => { setCombatMoving(v => !v); setObjectActionsOpen(false); }} onCombat={battleAction} onAttack={battleAttack} onInteract={playInteraction} onEdit={returnToEditor} onRestart={() => playAdventure(adventure.definition)} /></Suspense>}
        {panel === 'play' && adventure && !adventure.definition.rpg && <Suspense fallback={<p>正在准备战役指引…</p>}><AdventureGuide key={table.id} table={table} onStory={() => { setPlayMovingId(null); setDismissedStory(null); }} onSelect={selectObject} onAI={() => { setPanel('ai'); setPrompt('请基于当前场景和已经发生的事实叙述，并提示队伍可以选择的行动。保持 actions 为空，不改变剧情进度，不预判骰点。'); }} onWorkbench={() => { setDismissedStory(adventureKey); setPanel("workshop"); }} onEdit={returnToEditor} /></Suspense>}
        {panel === 'play' && relicGame && <Suspense fallback={<p>正在准备游玩指引…</p>}><RelicGameGuide key={table.id} table={table} moving={guideMoving} rolling={playGuide?.phase === 'rolling'} starting={guideStarting} onMoveMode={value => { setGuideMoving(value); setTool('select'); setLibrary(false); }} onAction={action => action.type === "stop" ? returnToEditor() : guideAction(action)} onRoll={guideRoll} onStart={() => void startGuidedGame(tableRef.current)} onSelect={selectObject} onHelp={() => setModal('guide')} /></Suspense>}
        {panel === 'ai' && <div className="tt-ai"><div className="tt-ai-status"><span><Sparkle size={20} /><b>桌面主持</b></span><button aria-label="AI 模型设置" onClick={openSettings}><GearSix size={17} /></button><small>{config.provider === 'demo' ? '尚未连接模型' : `${config.provider === 'ollama' ? 'Ollama' : '兼容接口'} · ${config.model || '请选择模型'}`}</small></div><p className="tt-ai-intro">主持人会根据当前故事与已经发生的行动进行叙述，并提供下一步建议。</p><div className="tt-chat" aria-live="polite">{!(chat[table.id]?.length) && <div className="tt-ai-examples"><span>试着让主持人</span>{['描述当前场景的气氛与细节', '根据已发生的事实，队伍有哪些行动选择？', '用故事语言回顾刚才的真实骰子结果'].map(text => <button key={text} onClick={() => setPrompt(text)}>{text}</button>)}</div>}{(chat[table.id] ?? []).map((item, i) => <div key={i} className={`tt-chat-item ${item.role}`}><small>{item.role === 'user' ? '你' : 'AI 主持'}</small><p>{item.content}</p></div>)}{busy && <div className="tt-ai-thinking">正在读取桌面并构思…</div>}</div>{plan && <div className="tt-ai-plan"><b>{plan.value.actions.length} 项桌面操作</b>{plan.value.actions.map((a, i) => <span key={i}>{i + 1}. {actionLabel(a)}</span>)}<div><button className="tt-small-button" onClick={() => setPlan(null)}>忽略</button><button className="tt-gold-button" onClick={applyPlan}><Check size={14} />应用到桌面</button></div></div>}<textarea aria-label="桌面主持指令" placeholder="描述场景或告诉主持人要做什么…" value={prompt} maxLength={8000} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void askAI(); }} /><button className="tt-gold-button full" disabled={!busy && !prompt.trim()} onClick={() => { if (busy) { aiAbort.current?.abort(); setBusy(false); } else void askAI(); }}>{busy ? <><X size={16} />停止生成</> : <><PaperPlaneTilt size={16} />发送指令</>}</button><small className="tt-ai-note">剧情与战斗由游戏行动推进，检定采用真实骰子结果。</small></div>}
        {panel === 'notes' && <div className="tt-notes"><h3>{isPlaying ? "冒险纪事" : "规则与设计笔记"}</h3><p>{isPlaying ? "回顾已经发生的行动与真实骰子结果。" : "记录规则、世界背景和设计目标。"}</p>{!isPlaying && <textarea aria-label="桌面笔记" value={table.notes} maxLength={20000} onChange={e => perform(t => ({ ...t, notes: e.target.value }), false)} />}<div className="tt-list-heading"><span>操作记录</span><b>{table.logs.length}</b></div><div className="tt-log">{table.logs.slice(-40).reverse().map(log => <div key={log.id}><time>{new Date(log.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time><p>{log.text}</p></div>)}</div><button className="tt-plain" onClick={() => { resetPhysics(); setLegacy(true); }}><BookOpen size={16} />查看已有跑团记录</button></div>}</div>
        <footer className="tt-panel-footer"><span><span />{isPlaying ? `AI 主持 · ${config.provider === "demo" ? "未连接" : config.provider === "ollama" ? "Ollama" : "兼容接口"}` : "独立编辑稿 · 自动保存"}</span>{isPlaying && <button onClick={openSettings} aria-label="模型连接设置"><GearSix size={16} /></button>}</footer>
      </aside>
    </div>
    {isPlaying ? <div className="tt-handbar"><div className="tt-hand-heading"><Hand size={19} /><select aria-label="当前玩家" value={seat} onChange={e => setSeat(e.target.value)}>{['玩家1', '玩家2', '玩家3', '玩家4'].map(s => <option key={s}>{s}</option>)}</select><span className="bt-hand-count"><Cards size={13} />手牌 {hand.length}</span><button className="tt-small-button" onClick={() => { setPanel(adventure?.definition.rpg ? "objects" : "workshop"); setExploreRequest(v => v + 1); setMobilePanel(true); setImmersive(false); }}>背包 {adventure?.progress.rpg ? Object.values(adventure.progress.rpg.bag).reduce((sum, n) => sum + n, 0) : table.objects.filter(o => o.metadata.zone === "inventory" && o.metadata.owner === seat).length}</button><select className="tt-return-deck" aria-label="目标牌堆" value={returnDeck} onChange={e => setReturnDeck(e.target.value)}><option value="">选择牌堆</option>{table.objects.filter(o => o.kind === 'deck').map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div><div className="tt-hand-cards">{hand.length ? hand.map(card => <button key={card.id} onClick={() => { objectAction('playCard', card.id); }} title="点击打出到桌面">{card.texture ? <img src={card.texture} alt="" /> : <Cards size={21} />}<span>{card.name}</span></button>) : <span className="tt-hand-empty">点选物件进行探索与行动，随身物品保存在背包中。</span>}</div><span className="tt-hand-hint"><span className="bt-save-dot" />本机自动保存</span></div> : <footer className="we-editor-footer"><span><NotePencil size={16} />编辑稿自动保存</span><b>{table.workspace?.definition ? `场景：${table.workspace.definition.scenes.find(s => s.id === table.workspace?.sceneId)?.title ?? "当前场景"}` : `${visibleObjects.length} 件物件 · 独立编辑稿`}</b><button onClick={() => importInput.current?.click()}><UploadSimple size={15} />载入编辑稿</button><button onClick={openGames}><BookOpen size={15} />游戏与作品</button>{tables.some(t => t.workspace?.sourceId === table.id) && <button onClick={() => { const last = [...tables].reverse().find(t => t.workspace?.sourceId === table.id); if (last) resumeGame(last.id); }}><Play size={15} />继续上次试玩</button>}</footer>}
    {notice && <div className="tt-toast" role="status"><Info size={18} />{notice}</div>}
    {bearStudio && !isPlaying && <BearTavernStudio table={table} selected={selected} initialTab={bearStudio} onSave={savePresentation} onSpawn={spawnTavernCharacter} onPlay={effect => { setBearStudio(null); playEffect(effect); }} onClose={() => setBearStudio(null)} />}
    {modal === 'character' && adventure?.definition.rpg && <ModelDialog title="角色卡" close={() => setModal(null)}><RpgCharacterDialog table={table} objectId={characterObject} onAction={rpgAction} /></ModelDialog>}
    {modal === 'games' && <Suspense fallback={<ModelDialog title="游戏库" close={() => setModal(null)}><p>正在打开游戏库…</p></ModelDialog>}><GameLibrary tables={tables} activeId={table.id} initialView={gameLibraryView} onRename={renameCampaign} onClose={() => setModal(null)} onAdventure={playAdventure} onRelic={moduleId => startGuidedGame(undefined, moduleId)} onTable={playTable} onResume={resumeGame} onDelete={deleteRecord} onDeleteMany={deleteRecords} deletedName={deletedRecord?.entries[0].record.name} deletedCount={deletedRecord?.entries.length ?? 0} onUndoDelete={undoRecordDeletion} recordError={recordError} onEditAdventure={definition => { setRpgStudioTab('map'); saveStoryDraft(definition); setStudioDefinition(definition); setStudio(true); }} onEditTable={source => activateDraft(editorDraftFromGame(source))} onCreate={() => { if (isPlaying) activateDraft({ ...createTableSession('sandbox'), workspace: { kind: 'draft' } }); setModal(null); setStudioDefinition(undefined); setStudio(true); }} /></Suspense>}
    {modal === 'new' && <ModelDialog title="创建一张新桌面" close={() => setModal(null)}><label className="tt-field">桌面名称<input value={newName} maxLength={120} onChange={e => setNewName(e.target.value)} placeholder="如：周末冒险 / 自定义桌游" /></label><div className="tt-presets">{([{ id: 'sandbox', name: '空白沙盒', desc: '自由放置任何桌面物件', icon: Cube }, { id: 'rpg', name: '跑团桌面', desc: '地图、棋子、骰子与遭遇牌', icon: UsersThree }, { id: 'cards', name: '卡牌桌面', desc: '牌堆、卡牌与计数标记', icon: Cards }, { id: 'wargame', name: '战棋桌面', desc: '对阵棋子与可调整地形', icon: Selection }] as const).map(p => <button key={p.id} className={preset === p.id ? 'active' : ''} onClick={() => setPreset(p.id)}><p.icon size={24} /><span><b>{p.name}</b><small>{p.desc}</small></span>{preset === p.id && <Check size={17} />}</button>)}</div><div className="tt-dialog-actions"><button className="tt-small-button" onClick={() => setModal(null)}>取消</button><button className="tt-gold-button" onClick={() => { const value = createTableSession(preset); value.workspace = { kind: 'draft' }; if (newName.trim()) value.name = newName.trim(); setTables(all => [...all, value]); switchTable(value.id); }}><Plus size={17} />创建桌面</button></div></ModelDialog>}
    {modal === 'tables' && <ModelDialog title="编辑稿与对局" close={() => setModal(null)}>
      {recordError && <p className="record-error" role="alert">{recordError}</p>}
      {deletedRecord && <RecordUndoNotice name={deletedRecord.entries[0].record.name} count={deletedRecord.entries.length} onUndo={undoRecordDeletion} />}
      <RecordBatchToolbar label="编辑稿与对局" total={tables.length} selection={recordSelection} onDelete={deleteRecords} />
      <div className="tt-saved-tables">{tables.map(t => <div key={t.id} className={`tt-saved-record ${table.id === t.id ? 'active' : ''} ${recordSelection.selectedIds.includes(t.id) ? 'selected' : ''}`}><RecordSelectionCheckbox label={`${workspaceMode(t) === 'edit' ? '编辑稿' : '对局'} ${t.name} ${t.id.slice(0, 6)}`} checked={recordSelection.selectedIds.includes(t.id)} onChange={() => recordSelection.toggle(t.id)} /><button className="tt-saved-record-open" onClick={() => switchTable(t.id)}><Cube size={25} /><span><b>{t.name}</b><small>{workspaceMode(t) === "edit" ? "编辑稿" : "游戏进度"} · {t.objects.length} 个物件 · {new Date(t.createdAt).toLocaleDateString('zh-CN')}</small></span>{table.id === t.id && <Check size={17} />}</button><RecordDeleteAction label={`${workspaceMode(t) === 'edit' ? '编辑稿' : '对局'} ${t.name} ${t.id.slice(0, 6)}`} onDelete={() => deleteRecord(t.id)} /></div>)}</div>
      <div className="tt-dialog-actions"><button className="tt-small-button" onClick={openGames}><FloppyDisk size={16} />跑团存档</button><button className="tt-small-button" onClick={() => { setModal(null); resetPhysics(); setLegacy(true); }}><BookOpen size={16} />已有跑团记录</button><button className="tt-gold-button" onClick={() => { setPreset('sandbox'); setNewName(''); setModal('new'); }}><Plus size={16} />新桌面</button></div>
    </ModelDialog>}
    {modal === 'save' && <ModelDialog title={isPlaying ? "导出游戏进度" : "导出编辑作品"} close={() => setModal(null)}><p className="tt-dialog-intro">存档包含物件位置、旋转、尺寸、卡牌与牌堆内容、素材、手牌、网格、笔记和操作记录。</p>{saveBusy && <p className="tt-dialog-intro" role="status">正在打包资源，完成后可复制或下载…</p>}{saveError && <p className="tt-dialog-intro" role="alert">{saveError}</p>}<textarea className="tt-save-data" aria-label="整桌存档内容" readOnly value={saveText} onFocus={e => e.target.select()} /><div className="tt-dialog-actions"><button className="tt-small-button" disabled={saveBusy || !saveText} onClick={() => void copySave()}>复制存档</button><button className="tt-gold-button" disabled={saveBusy || !saveText} onClick={() => { downloadFile(`${table.name}.realm.json`, saveText); flash('已发起下载，也可以复制完整存档。'); }}><DownloadSimple size={17} />下载 JSON</button></div></ModelDialog>}
    {modal === 'settings' && <ModelDialog title="连接桌面主持" close={() => { invalidateConnection(); setModal(null); }}><div className="tt-provider">{(['ollama', 'openai'] as const).map(p => <button key={p} className={configDraft.provider === p ? 'active' : ''} onClick={() => { invalidateConnection(); setConfigDraft(c => ({ ...c, provider: p, baseUrl: p === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com/v1', model: '', apiKey: '' })); }}>{p === 'ollama' ? '本机 Ollama' : '外接兼容接口'}</button>)}</div><label className="tt-field">服务地址<input aria-label="桌面模型服务地址" value={configDraft.baseUrl} onChange={e => { invalidateConnection(); setConfigDraft(c => ({ ...c, baseUrl: e.target.value })); }} /></label>{configDraft.provider === 'openai' && <label className="tt-field">API Key<input aria-label="桌面模型密钥" type="password" autoComplete="off" value={configDraft.apiKey} onChange={e => setConfigDraft(c => ({ ...c, apiKey: e.target.value }))} /><small>密钥仅在本次页面内存中保留。</small></label>}<label className="tt-field">模型名称<input aria-label="桌面模型名称" list="tt-models" value={configDraft.model} onChange={e => setConfigDraft(c => ({ ...c, model: e.target.value }))} /><datalist id="tt-models">{models.map(model => <option key={model} value={model} />)}</datalist></label><button className="tt-small-button" disabled={detecting || !configDraft.baseUrl} onClick={() => void detectModels()}>{detecting ? '检测中…' : '检测连接'}</button>{modelStatus && <p className="tt-model-status" role="status">{modelStatus}</p>}<p className="tt-dialog-intro">建议选择能稳定输出 JSON 的模型。模型提出的操作经过校验后，才能应用到桌面。</p><div className="tt-dialog-actions"><button className="tt-small-button" onClick={() => setModal(null)}>取消</button><button className="tt-gold-button" disabled={!configDraft.model.trim() || configDraft.provider === 'demo'} onClick={() => { invalidateConnection(); setConfig({ ...configDraft, baseUrl: configDraft.baseUrl.trim(), model: configDraft.model.trim() }); setModal(null); flash('桌面主持已连接'); }}><Check size={17} />保存设置</button></div></ModelDialog>}
    {modal === 'guide' && <ModelDialog title="你的桌面，由你定义" close={() => setModal(null)}><div className="tt-guide"><p>这是一张通用三维桌面。选择规则与玩法后，用物件组合出自己的桌游。</p><div><MouseSimple size={21} /><span><b>操作物件</b>左键选择并拖拽，右键转动视角，滚轮缩放。Q / E 旋转，L 锁定，Delete 删除；Ctrl + Z 撤销。</span></div><div><Cards size={21} /><span><b>卡牌与手牌</b>牌堆可洗牌、抽牌。F 翻面，卡牌可收入当前玩家手牌，在底部点击即可打出。</span></div><div><DiceFive size={21} /><span><b>物理骰子</b>选择 d4、d6、d8、d10、d12 或 d20，按 R 掷出。点数根据骰子落定的朝向计算，并写入桌面记录。</span></div><div><Sparkle size={21} /><span><b>AI 是桌面参与者</b>连接本机或外接模型，AI 可提出实际物件操作。点击应用后执行，并可以撤销。</span></div><div><FloppyDisk size={21} /><span><b>整桌存档</b>桌面布局自动保存在当前浏览器，物件库保存在本机后台。导出的 JSON 会打包图片，可载入到新桌面。</span></div><p>首版为本机同桌沙盒，不包含远程房间、完整规则自动裁定或 Tabletop Simulator 模组兼容。</p></div><div className="tt-dialog-actions"><button className="tt-gold-button" onClick={() => setModal(null)}>回到桌面</button></div></ModelDialog>}
  </div>;
}
