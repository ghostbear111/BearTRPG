import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowDown, ArrowSquareOut, BookOpen, Check, Compass, Crown, DiceFive, DownloadSimple,
  GearSix, Heart, Hourglass, List, MapTrifold, Minus, NotePencil, PaperPlaneTilt, PencilSimple,
  Plus, Scroll, Shield, Sparkle, Sword, UsersThree, WarningCircle, X,
} from '@phosphor-icons/react';
import {
  RULESETS, buildMessages, createCampaign, demoReply, rollDice, validateCampaign,
  type Campaign, type Character, type Message, type ModelConfig, type RulesetId,
} from './lib/game';
import { loadCampaignStorage, persistCampaignStorage } from './lib/storage';
import { removeSavedRecords, restoreSavedRecords, type RemovedRecords } from './lib/saved-records';
import { RecordBatchToolbar, RecordDeleteAction, RecordSelectionCheckbox, RecordUndoNotice, useRecordSelection } from './components/RecordActions';

const MODEL_KEY = 'bear-trpg-editor-model-v1';
const MAP_KEY = 'bear-trpg-editor-map-v1';
const defaultConfig: ModelConfig = { provider: 'demo', baseUrl: 'http://localhost:11434', model: '', apiKey: '', temperature: 0.8 };
type Tab = 'story' | 'characters' | 'map' | 'notes';
type Point = { x: number; y: number };
type Positions = Record<string, Record<string, Point>>;
type Modal = 'settings' | 'new' | 'character' | 'help' | 'export' | null;

function loadConfig(): ModelConfig {
  try {
    const value = JSON.parse(localStorage.getItem(MODEL_KEY) ?? '{}');
    if (['demo', 'ollama', 'openai'].includes(value.provider) && typeof value.baseUrl === 'string' && typeof value.model === 'string') {
      return { ...defaultConfig, provider: value.provider, baseUrl: value.baseUrl, model: value.model,
        temperature: typeof value.temperature === 'number' ? Math.max(0, Math.min(2, value.temperature)) : 0.8, apiKey: '' };
    }
  } catch { /* Safe default for unavailable or damaged browser storage. */ }
  return defaultConfig;
}
function loadPositions(): Positions {
  try {
    const value = JSON.parse(localStorage.getItem(MAP_KEY) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    for (const tokens of Object.values(value) as Record<string, Point>[]) {
      if (!tokens || typeof tokens !== 'object') return {};
      for (const p of Object.values(tokens)) if (!p || !Number.isInteger(p.x) || !Number.isInteger(p.y) || !isFloor(p.x, p.y)) return {};
    }
    return value;
  } catch { return {}; }
}
function isFloor(x: number, y: number) {
  return (x >= 2 && x <= 6 && y >= 2 && y <= 5) || (x >= 7 && x <= 10 && y >= 3 && y <= 4) || (x >= 11 && x <= 14 && y >= 1 && y <= 6);
}
function uid() { return crypto.randomUUID(); }
function dateText(time: number) { return new Date(time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); }
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Dialog({ title, eyebrow, children, onClose, wide = false }: { title: string; eyebrow: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const box = ref.current!;
    const first = box.querySelector<HTMLElement>('input,select,textarea,button'); first?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') {
        const focusable = [...box.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')];
        const firstItem = focusable[0]; const lastItem = focusable.at(-1);
        if (event.shiftKey && document.activeElement === firstItem) { event.preventDefault(); lastItem?.focus(); }
        else if (!event.shiftKey && document.activeElement === lastItem) { event.preventDefault(); firstItem?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <div className="modal-shade" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={ref} className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="dialog-heading"><div><span className="eyebrow">{eyebrow}</span><h2 id="dialog-title">{title}</h2></div><button className="icon-button" aria-label="关闭窗口" onClick={onClose}><X size={20} /></button></div>
      {children}
    </div>
  </div>;
}

function BattleMap({ campaign, positions, selected, select, move, large = false }: {
  campaign: Campaign; positions: Record<string, Point>; selected: string; select: (id: string) => void; move: (point: Point) => void; large?: boolean;
}) {
  return <div className={`battlemap ${large ? 'large' : ''}`}>
    <div className="map-topline"><span><Compass size={15} />战术场景</span><span className="map-scale">1 格 = 5 尺 · 示意地图</span></div>
    <div className="map-grid" role="group" aria-label="战术地图，先选择角色再点击地面移动">
      {Array.from({ length: 128 }, (_, i) => {
        const x = i % 16; const y = Math.floor(i / 16); const floor = isFloor(x, y);
        const occupants = campaign.characters.filter((c, ci) => (positions[c.id] ?? { x: 3 + ci, y: 4 }).x === x && (positions[c.id] ?? { x: 3 + ci, y: 4 }).y === y);
        return <button key={i} className={`map-cell ${floor ? 'floor' : 'void'} ${floor && !isFloor(x, y - 1) ? 'north-wall' : ''} ${floor && !isFloor(x - 1, y) ? 'west-wall' : ''} ${floor && !isFloor(x + 1, y) ? 'east-wall' : ''} ${floor && !isFloor(x, y + 1) ? 'south-wall' : ''}`} disabled={!floor} aria-label={`移动到 ${x + 1} 列 ${y + 1} 行${occupants.length ? `，${occupants.map(c => c.name).join('、')}` : ''}`} onClick={() => occupants.length ? select(occupants[0].id) : move({ x, y })}>
          {occupants.length > 0 && <span className={`map-token ${selected === occupants[0].id ? 'selected' : ''}`} style={{ '--token': occupants[0].color } as CSSProperties}>{occupants[0].name.slice(0, 1)}{occupants.length > 1 && <small>{occupants.length}</small>}</span>}
          {floor && x === 12 && y === 2 && !occupants.length && <span className="map-marker"><Sparkle size={17} /></span>}
        </button>;
      })}
    </div>
    <div className="map-bottomline"><span>{campaign.scene.split(/[。，]/)[0]}</span><span><span className="legend-dot" />队伍 <span className="legend-diamond" />兴趣点</span></div>
  </div>;
}

export default function App() {
  const [initialStorage] = useState(loadCampaignStorage);
  const [campaigns, setCampaigns] = useState(initialStorage.campaigns);
  const [pendingRecovery, setPendingRecovery] = useState(initialStorage.recoveryRaw);
  const [deletedCampaign, setDeletedCampaign] = useState<{ removed: RemovedRecords<Campaign>; positions: Positions } | null>(null);
  const recordSelection = useRecordSelection(campaigns.map(value => value.id));
  const [recordError, setRecordError] = useState('');
  const [activeId, setActiveId] = useState(() => campaigns[0].id);
  const campaign = campaigns.find(c => c.id === activeId) ?? campaigns[0];
  const [config, setConfig] = useState(loadConfig);
  const [draftConfig, setDraftConfig] = useState(config);
  const [tab, setTab] = useState<Tab>('story');
  const [modal, setModal] = useState<Modal>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [positions, setPositions] = useState(loadPositions);
  const [selectedChar, setSelectedChar] = useState(campaign.characters[0]?.id ?? '');
  const selected = campaign.characters.find(c => c.id === selectedChar) ?? campaign.characters[0];
  const [action, setAction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retryCampaign, setRetryCampaign] = useState<Campaign | null>(null);
  const [notice, setNotice] = useState(initialStorage.warning);
  const [diceSides, setDiceSides] = useState(20);
  const [diceCount, setDiceCount] = useState(1);
  const [modifier, setModifier] = useState(0);
  const [formula, setFormula] = useState('');
  const [diceResult, setDiceResult] = useState<ReturnType<typeof rollDice> | null>(null);
  const [newName, setNewName] = useState('');
  const [newRuleset, setNewRuleset] = useState<RulesetId>('dnd');
  const [editing, setEditing] = useState<Character | null>(null);
  const [exportData, setExportData] = useState<{ name: string; content: string; type: string } | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [connection, setConnection] = useState('');
  const discoveryRef = useRef(0);
  const discoveryAbortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const ruleset = RULESETS.find(r => r.id === campaign.ruleset)!;

  function flash(text: string) { setNotice(text); }
  function updateCampaign(updater: (value: Campaign) => Campaign, id = campaign.id) {
    setCampaigns(all => all.map(value => value.id === id ? updater(value) : value));
  }
  useEffect(() => {
    try { persistCampaignStorage(campaigns, pendingRecovery); if (pendingRecovery !== null) setPendingRecovery(null); }
    catch (e) { setNotice(`战役保存失败，请导出备份。${e instanceof Error ? e.message : ''}`); }
  }, [campaigns, pendingRecovery]);
  useEffect(() => {
    try { const { apiKey: _secret, ...safe } = config; localStorage.setItem(MODEL_KEY, JSON.stringify(safe)); }
    catch { setNotice('模型配置无法保存在浏览器中。'); }
  }, [config]);
  useEffect(() => { try { localStorage.setItem(MAP_KEY, JSON.stringify(positions)); } catch { /* The campaign is still exportable. */ } }, [positions]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(timer); } }, [notice]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [campaign.messages.length, busy, tab]);
  useEffect(() => () => { abortRef.current?.abort(); discoveryAbortRef.current?.abort(); }, []);
  useEffect(() => { setDiceSides(campaign.ruleset === 'dnd' ? 20 : 100); setFormula(''); setDiceCount(1); setModifier(0); }, [campaign.id, campaign.ruleset]);

  function selectCampaign(id: string) {
    abortRef.current?.abort(); setBusy(false); setActiveId(id); setTab('story'); setAction(''); setError(''); setRetryCampaign(null); setDiceResult(null); setSidebarOpen(false);
    setSelectedChar(campaigns.find(c => c.id === id)?.characters[0]?.id ?? '');
  }
  function deleteCampaign(id: string): boolean {
    return deleteCampaigns([id]);
  }
  function deleteCampaigns(ids: string[]): boolean {
    setRecordError('');
    const change = removeSavedRecords(campaigns, campaign.id, ids, () => createCampaign('新战役', 'dnd'));
    if (!change) return false;
    try { persistCampaignStorage(change.records, pendingRecovery); }
    catch { setRecordError('删除未保存，战役记录已保留。请检查本机存储后重试。'); return false; }
    const savedPositions: Positions = {};
    for (const { record } of change.removed.entries) if (positions[record.id]) savedPositions[record.id] = positions[record.id];
    setDeletedCampaign({ removed: change.removed, positions: savedPositions });
    if (change.activeId !== campaign.id) { selectCampaign(change.activeId); setSelectedChar(change.records.find(value => value.id === change.activeId)?.characters[0]?.id ?? ''); setSidebarOpen(true); }
    setCampaigns(change.records); setPendingRecovery(null); recordSelection.clear();
    setPositions(all => { const next = { ...all }; for (const { record } of change.removed.entries) delete next[record.id]; return next; });
    return true;
  }
  function undoCampaignDeletion() {
    if (!deletedCampaign) return;
    setRecordError('');
    const restored = restoreSavedRecords(campaigns, deletedCampaign.removed, Boolean(deletedCampaign.removed.fallback && positions[deletedCampaign.removed.fallback.id]));
    try { persistCampaignStorage(restored, pendingRecovery); }
    catch { setRecordError('战役恢复未保存，请检查本机存储后重试。'); return; }
    if (deletedCampaign.removed.entries.some(entry => entry.record.id === deletedCampaign.removed.activeId)) { selectCampaign(deletedCampaign.removed.activeId); setSelectedChar(restored.find(value => value.id === deletedCampaign.removed.activeId)?.characters[0]?.id ?? ''); setSidebarOpen(true); }
    setPositions(all => ({ ...deletedCampaign.positions, ...all }));
    setCampaigns(restored); setPendingRecovery(null); setDeletedCampaign(null);
  }
  function invalidateDiscovery() {
    discoveryAbortRef.current?.abort(); discoveryRef.current += 1; setTesting(false); setModels([]); setConnection('');
  }
  function openSettings() { invalidateDiscovery(); setDraftConfig({ ...config }); setModal('settings'); }
  function move(point: Point) {
    if (!selected) return;
    setPositions(all => ({ ...all, [campaign.id]: { ...all[campaign.id], [selected.id]: point } }));
  }
  async function askGM(snapshot: Campaign) {
    if (snapshot.messages.length >= 2000) { flash('该战役已达到记录上限，请先导出备份。'); return; }
    setBusy(true); setError(''); setRetryCampaign(null);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      let content: string;
      if (config.provider === 'demo') {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 650);
          controller.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('已取消', 'AbortError')); }, { once: true });
        });
        content = demoReply(snapshot, snapshot.messages.filter(m => m.role === 'player').at(-1)?.content ?? '继续场景');
      } else {
        const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ ...config, messages: buildMessages(snapshot) }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? '主持人暂时无法回应');
        if (typeof data.message !== 'string' || !data.message.trim()) throw new Error('模型返回了空内容，请重试或更换模型。');
        content = data.message;
      }
      if (content.length > 30000) throw new Error('模型回复超过 30000 字，请调整模型设置后重试。');
      if (!controller.signal.aborted) updateCampaign(value => ({ ...value, messages: [...value.messages, { id: uid(), role: 'gm', content, createdAt: Date.now() }] }), snapshot.id);
    } catch (e) {
      if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : '连接失败，请检查模型设置。'); setRetryCampaign(snapshot); }
    } finally { if (abortRef.current === controller) setBusy(false); }
  }
  function submitAction(text = action) {
    if (!text.trim() || busy) return;
    if (campaign.messages.length > 1998) { flash('该战役已达到 2000 条记录上限，请导出备份并开启新战役。'); return; }
    if (text.trim().length > 8000) { setError('请将单次行动控制在 8000 字以内。'); return; }
    if (config.provider !== 'demo' && !config.model.trim()) { openSettings(); setConnection('请先填写模型名称。'); return; }
    const message: Message = { id: uid(), role: 'player', content: text.trim(), characterId: selected?.id, createdAt: Date.now() };
    const snapshot = { ...campaign, messages: [...campaign.messages, message] };
    updateCampaign(() => snapshot); setAction(''); void askGM(snapshot);
  }
  function doRoll() {
    if (campaign.messages.length >= 2000) { flash('该战役已达到 2000 条记录上限，请导出备份并开启新战役。'); return; }
    try {
      const value = rollDice(formula.trim() || `${diceCount}d${diceSides}${modifier >= 0 ? '+' : ''}${modifier}`);
      setDiceResult(value); setError('');
      const message: Message = { id: uid(), role: 'dice', content: `${selected?.name ?? '玩家'} 掷出 ${value.formula}，结果为 ${value.total}`, characterId: selected?.id, dice: value, createdAt: Date.now() };
      updateCampaign(valueCampaign => ({ ...valueCampaign, messages: [...valueCampaign.messages, message] }));
    } catch (e) { flash(e instanceof Error ? e.message : '骰子公式不正确'); }
  }
  async function testConnection() {
    discoveryAbortRef.current?.abort();
    const generation = ++discoveryRef.current;
    const controller = new AbortController(); discoveryAbortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 20000);
    const snapshot = { ...draftConfig };
    setTesting(true); setConnection(''); setModels([]);
    try {
      const response = await fetch('/api/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot), signal: controller.signal });
      const data = await response.json();
      if (generation !== discoveryRef.current) return;
      if (!response.ok) throw new Error(data.error ?? '无法连接模型服务');
      setModels(data.models); setConnection(data.models.length ? `连接成功，发现 ${data.models.length} 个模型。` : '连接成功，但没有可用模型。请先在模型服务中安装模型。');
      if (data.models.length) setDraftConfig(value => ({ ...value, model: value.model || data.models[0] }));
    } catch (e) { if (generation === discoveryRef.current) setConnection(controller.signal.aborted ? '连接检测超时，请检查服务地址。' : e instanceof Error ? e.message : '连接失败'); }
    finally { clearTimeout(timer); if (generation === discoveryRef.current) setTesting(false); }
  }
  function exportCampaign() { setExportData({ name: `${campaign.name}.json`, content: JSON.stringify(campaign, null, 2), type: 'application/json' }); setModal('export'); }
  async function copyExport() {
    if (!exportData) return;
    try {
      try { await navigator.clipboard.writeText(exportData.content); }
      catch {
        const text = document.querySelector<HTMLTextAreaElement>('.export-preview');
        text?.focus(); text?.select();
        if (!document.execCommand('copy')) throw new Error('复制未完成');
      }
      flash('内容已复制');
    } catch { flash('内容已选中，请按 Ctrl + C 复制。'); }
  }
  function exportTranscript() {
    const text = `# ${campaign.name}\n\n规则：${ruleset.name}\n\n${campaign.messages.map(m => `### ${m.role === 'gm' ? '主持人' : m.role === 'dice' ? '掷骰' : m.role === 'system' ? '会话事件' : campaign.characters.find(c => c.id === m.characterId)?.name ?? '玩家'} · ${dateText(m.createdAt)}\n\n${m.content}`).join('\n\n')}\n\n## 主持笔记\n\n${campaign.notes}`;
    setExportData({ name: `${campaign.name}-冒险记录.md`, content: text, type: 'text/markdown' }); setModal('export');
  }
  async function importCampaign(file?: File) {
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('战役文件不能超过 5 MB。');
      const value = validateCampaign(JSON.parse(await file.text())); value.id = uid();
      abortRef.current?.abort(); setBusy(false); setAction('');
      setCampaigns(all => [...all, value]); setActiveId(value.id); setSelectedChar(value.characters[0]?.id ?? ''); setTab('story'); setError(''); setRetryCampaign(null); setDiceResult(null); setSidebarOpen(false); flash('战役已导入');
    } catch (e) { flash(e instanceof Error ? e.message : '无法读取战役文件'); }
    if (importRef.current) importRef.current.value = '';
  }
  function editCharacter(character: Character) { setEditing({ ...character, stats: { ...character.stats } }); setModal('character'); }

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <a className="brand" href="#" onClick={event => { event.preventDefault(); setTab('story'); }}><span className="brand-mark"><DiceFive size={27} weight="duotone" /></span><span>熊酒馆<span className="brand-en">BEAR TAVERN</span></span></a>
      <div className="sidebar-section"><span className="eyebrow">你的冒险</span><button className="icon-button small" aria-label="新建战役" onClick={() => { setNewName(''); setNewRuleset('dnd'); setModal('new'); }}><Plus size={17} /></button></div>
      <div className="campaign-list">{recordError && <p className="record-error" role="alert">{recordError}</p>}{deletedCampaign && <RecordUndoNotice name={deletedCampaign.removed.entries[0].record.name} count={deletedCampaign.removed.entries.length} onUndo={undoCampaignDeletion} />}<RecordBatchToolbar label="跑团记录" total={campaigns.length} selection={recordSelection} onDelete={deleteCampaigns} />{campaigns.map(c => <div className={`campaign-record ${recordSelection.selectedIds.includes(c.id) ? 'selected' : ''}`} key={c.id}><RecordSelectionCheckbox label={`跑团记录 ${c.name} ${c.id.slice(0, 6)}`} checked={recordSelection.selectedIds.includes(c.id)} onChange={() => recordSelection.toggle(c.id)} /><button className={`campaign-item ${campaign.id === c.id ? 'active' : ''}`} onClick={() => selectCampaign(c.id)}><BookOpen size={20} /><span>{c.name}<small>{RULESETS.find(r => r.id === c.ruleset)?.shortName} · 本机战役</small></span>{campaign.id === c.id && <span className="selected-bar" />}</button><RecordDeleteAction label={`跑团记录 ${c.name} ${c.id.slice(0, 6)}`} onDelete={() => deleteCampaign(c.id)} /></div>)}</div>
      <button className="new-campaign" onClick={() => { setNewName(''); setModal('new'); }}><Plus size={17} />开启新的冒险</button>
      <div className="sidebar-divider" />
      <div className="sidebar-section"><span className="eyebrow">冒险工具</span></div>
      <button className={`sidebar-link ${tab === 'characters' ? 'current' : ''}`} onClick={() => { setTab('characters'); setSidebarOpen(false); }}><UsersThree size={19} />角色档案<span>{campaign.characters.length}</span></button>
      <button className={`sidebar-link ${tab === 'map' ? 'current' : ''}`} onClick={() => { setTab('map'); setSidebarOpen(false); }}><MapTrifold size={19} />战术地图</button>
      <button className={`sidebar-link ${tab === 'notes' ? 'current' : ''}`} onClick={() => { setTab('notes'); setSidebarOpen(false); }}><NotePencil size={19} />主持笔记</button>
      <button className="sidebar-link" disabled={busy} onClick={() => importRef.current?.click()}><ArrowSquareOut size={19} />导入战役</button>
      <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={event => void importCampaign(event.target.files?.[0])} />
      <div className="sidebar-spacer" />
      <div className="sidebar-quote"><Compass size={24} weight="duotone" /><p>每一次掷骰，<br />都是一个新故事的开始。</p><span>THE NEXT CHAPTER IS YOURS</span></div>
      <div className="sidebar-footer"><button onClick={openSettings}><GearSix size={19} />模型设置</button><button aria-label="使用指南" onClick={() => setModal('help')}><BookOpen size={18} /></button></div>
      <div className="local-note"><span />战役保存在此浏览器</div>
    </aside>
    {sidebarOpen && <div className="sidebar-shade" onClick={() => setSidebarOpen(false)} />}
    <main className="workspace">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="打开导航" onClick={() => setSidebarOpen(true)}><List size={23} /></button><span>冒险工作台</span><span className="breadcrumb-slash">/</span><b>{ruleset.shortName}</b></div><div className="topbar-actions"><span className="local-badge">本机 · 同桌跑团</span><button className="model-status" onClick={openSettings}><span className={config.provider === 'demo' ? 'demo-dot' : 'model-dot'} />{config.provider === 'demo' ? '演示主持' : config.provider === 'ollama' ? 'Ollama 主持' : '外接模型'}<GearSix size={15} /></button></div></header>
      <div className="workspace-body">
        <div className="campaign-heading"><div><div className="chapter-label"><span className="chapter-line" />CAMPAIGN JOURNAL<span className="chapter-number">01</span></div><h1>{campaign.name}</h1><p>{campaign.description}</p></div><button className="outline-button export-button" onClick={exportCampaign}><DownloadSimple size={17} />保存战役</button></div>
        <div className="workspace-columns">
          <section className="adventure-column">
            <nav className="tabbar" aria-label="战役视图">{([{ id: 'story', label: '冒险日志', icon: Scroll }, { id: 'characters', label: '角色档案', icon: UsersThree }, { id: 'map', label: '战术地图', icon: MapTrifold }, { id: 'notes', label: '主持笔记', icon: NotePencil }] as const).map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} aria-current={tab === item.id ? 'page' : undefined} onClick={() => setTab(item.id)}><item.icon size={17} />{item.label}</button>)}<span className="tab-right">第 {campaign.round} 回合</span></nav>
            {tab === 'story' && <>
              <div className="scene-strip"><span className="scene-icon"><Compass size={22} weight="duotone" /></span><div><span className="eyebrow">当前场景</span><b>{campaign.scene}</b></div><button className="text-button" onClick={() => setTab('map')}>查看地图<MapTrifold size={16} /></button></div>
              <div className="story-feed" aria-label="冒险日志" aria-live="polite">
                <div className="session-start"><span />冒险开始 · {new Date(campaign.createdAt).toLocaleDateString('zh-CN')}<span /></div>
                {campaign.messages.map(message => {
                  const character = campaign.characters.find(c => c.id === message.characterId);
                  if (message.role === 'dice') return <div className="dice-message" key={message.id}><DiceFive size={17} /><span>{character?.name ?? '玩家'}</span><code>{message.dice?.formula}</code><span className="dice-message-equals">=</span><strong>{message.dice?.total}</strong><time>{dateText(message.createdAt)}</time></div>;
                  return <article className={`message ${message.role === 'gm' ? 'gm-message' : 'player-message'}`} key={message.id}><div className="message-avatar" style={character ? { '--avatar': character.color } as CSSProperties : undefined}>{message.role === 'gm' ? <Crown size={20} weight="duotone" /> : character?.name.slice(0, 1) ?? <UsersThree size={19} />}</div><div className="message-body"><div className="message-meta"><b>{message.role === 'gm' ? '游戏主持人' : message.role === 'system' ? '会话事件' : character?.name ?? '玩家'}</b>{message.role === 'gm' && <span className="gm-badge">GM</span>}<time>{dateText(message.createdAt)}</time></div><div className="message-content">{message.content.split(/\n{2,}/).map((line, i) => <p key={i}>{line || '\u00A0'}</p>)}</div></div></article>;
                })}
                {busy && <div className="thinking"><Crown size={19} /><span>主持人正在构思下一幕</span><i /><i /><i /></div>}
                <div ref={endRef} />
              </div>
              {error && <div className="inline-error" role="alert"><WarningCircle size={18} /><span>{error}</span>{retryCampaign && <button disabled={busy} onClick={() => void askGM(campaign)}>重试</button>}<button onClick={openSettings}>模型设置</button></div>}
              <div className="composer"><div className="composer-top"><label className="actor-select"><span style={{ background: selected?.color }}>{selected?.name.slice(0, 1) ?? '?'}</span><select aria-label="行动角色" value={selected?.id ?? ''} onChange={event => setSelectedChar(event.target.value)}>{campaign.characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><span>现在，轮到你了。</span></div><textarea aria-label="描述你的行动" placeholder="描述你的行动、与 NPC 对话，或探索眼前的世界…" value={action} maxLength={8000} disabled={busy} onChange={event => setAction(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); submitAction(); } }} /><div className="composer-bottom"><span>Ctrl + Enter 发送<span className="composer-divider">·</span>{config.provider === 'demo' ? '当前为离线演示' : config.model || '请配置模型'}</span>{busy ? <button className="send-button" onClick={() => { abortRef.current?.abort(); setBusy(false); }}><X size={17} />停止生成</button> : <button className="send-button" disabled={!action.trim()} onClick={() => submitAction()}><PaperPlaneTilt size={17} weight="fill" />采取行动</button>}</div></div>
              <div className="quick-actions"><span>试试</span>{['观察周围的环境', '与队友商议计划', '准备一次感知检定'].map(text => <button key={text} disabled={busy} onClick={() => setAction(text)}>{text}</button>)}</div>
            </>}
            {tab === 'characters' && <div className="characters-view"><div className="view-heading"><div><h2>你的冒险小队</h2><p>同桌切换角色，管理生命值与角色资料。</p></div><button className="outline-button" disabled={campaign.characters.length >= 24} onClick={() => { setEditing({ id: uid(), name: '', role: '冒险者', avatar: '', color: '#b6a477', hp: 20, maxHp: 20, ac: 12, initiative: null, stats: { 力量: 10, 敏捷: 10, 体质: 10, 智力: 10, 感知: 10, 魅力: 10 }, notes: '' }); setModal('character'); }}><Plus size={16} />添加角色</button></div>{campaign.characters.map(c => <div className="character-card" key={c.id}><div className="character-card-head"><span className="character-monogram" style={{ '--avatar': c.color } as CSSProperties}>{c.name.slice(0, 1)}</span><div><h3>{c.name}</h3><p>{c.role}</p></div><button className="icon-button" aria-label={`编辑${c.name}`} onClick={() => editCharacter(c)}><PencilSimple size={18} /></button></div><div className="character-metrics"><span><Heart size={17} />生命值<b>{c.hp}/{c.maxHp}</b></span><span><Shield size={17} />防御<b>{c.ac}</b></span><span><Sword size={17} />先攻<b>{c.initiative ?? '—'}</b></span></div><div className="character-stats">{Object.entries(c.stats).map(([key, value]) => <div key={key}><span>{key}</span><b>{value}</b></div>)}</div>{c.notes && <p className="character-notes">{c.notes}</p>}</div>)}</div>}
            {tab === 'map' && <div className="map-view"><div className="view-heading"><div><h2>战术地图</h2><p>选择一个角色，再点击地图地面移动标记。</p></div><span className="muted">位置自动保存</span></div><BattleMap campaign={campaign} positions={positions[campaign.id] ?? {}} selected={selected?.id ?? ''} select={setSelectedChar} move={move} large /><div className="map-characters">{campaign.characters.map(c => <button key={c.id} className={selected?.id === c.id ? 'active' : ''} onClick={() => setSelectedChar(c.id)}><span style={{ background: c.color }}>{c.name.slice(0, 1)}</span>{c.name}</button>)}</div><label className="field-label">当前场景<input value={campaign.scene} maxLength={300} onChange={event => updateCampaign(c => ({ ...c, scene: event.target.value }))} /></label><p className="map-disclaimer">这张地图用于记录站位。距离、移动与战斗裁定由主持人确认。</p></div>}
            {tab === 'notes' && <div className="notes-view"><div className="view-heading"><div><h2>主持笔记</h2><p>记录线索、世界设定与待办事项。这些内容会随下一次行动提供给 AI。</p></div><Check size={20} className="gold" /></div><textarea aria-label="主持笔记" value={campaign.notes} maxLength={20000} placeholder="已发现的线索、重要 NPC、世界设定…" onChange={event => updateCampaign(c => ({ ...c, notes: event.target.value }))} /><div className="notes-footer"><span>{campaign.notes.length} / 20000 · 自动保存在本机</span><button className="outline-button" onClick={exportTranscript}><DownloadSimple size={17} />导出冒险记录</button></div></div>}
          </section>
          <aside className="tools-column">
            <section className="dice-panel"><div className="panel-heading"><h2><DiceFive size={19} />命运之骰</h2><span>DICE ROLLER</span></div><div className="dice-picker">{[4, 6, 8, 10, 12, 20, 100].map(sides => <button key={sides} className={diceSides === sides ? 'active' : ''} onClick={() => { setDiceSides(sides); setFormula(''); }} aria-label={`选择 d${sides}`} aria-pressed={diceSides === sides}><span className={`die-symbol die-${sides}`}>{sides}</span><span>d{sides}</span></button>)}</div><div className="dice-fields"><label>骰子数量<input aria-label="骰子数量" type="number" min="1" max="100" value={diceCount} onChange={event => setDiceCount(Number(event.target.value))} /></label><label>调整值<div className="modifier-input"><span>{modifier >= 0 ? '+' : ''}</span><input aria-label="调整值" type="number" min="-10000" max="10000" value={modifier} onChange={event => setModifier(Number(event.target.value))} /></div></label></div><input className="formula-input" aria-label="自定义骰子公式" value={formula} maxLength={30} onChange={event => setFormula(event.target.value)} placeholder="自定义公式，如 2d6+3、1d100" /><button className="roll-button" disabled={busy} onClick={doRoll}><DiceFive size={19} />掷出骰子<span>{formula.trim() || `${diceCount}d${diceSides}${modifier ? `${modifier > 0 ? '+' : ''}${modifier}` : ''}`}</span></button><div className={`dice-result ${diceResult ? 'has-result' : ''}`} aria-live="polite">{diceResult ? <><span>掷骰结果</span><strong>{diceResult.total}</strong><small>{diceResult.rolls.join(' + ')}{diceResult.modifier ? ` ${diceResult.modifier > 0 ? '+' : '−'} ${Math.abs(diceResult.modifier)}` : ''}{diceResult.rolls.length === 1 && /^1d20(?:[+-]\d+)?$/i.test(diceResult.formula) && diceResult.rolls[0] === 20 ? ' · 自然 20' : ''}</small></> : <><span className="empty-dice">—</span><small>命运，等待你掷出第一枚骰子</small></>}</div></section>
            <section className="party-panel"><div className="panel-heading"><h2><UsersThree size={19} />冒险小队</h2><button className="icon-button small" aria-label="管理角色" onClick={() => setTab('characters')}><PencilSimple size={15} /></button></div>{campaign.characters.map(c => <div className={`party-member ${selected?.id === c.id ? 'active' : ''}`} key={c.id}><button className="party-select" onClick={() => setSelectedChar(c.id)}><span className="party-avatar" style={{ '--avatar': c.color } as CSSProperties}>{c.name.slice(0, 1)}</span><span><b>{c.name}</b><small>{c.role}</small></span></button><div className="party-hp"><div><Heart size={12} weight="fill" /><span>{c.hp}<small> / {c.maxHp}</small></span><button className="hp-button" disabled={c.hp <= 0} aria-label={`${c.name}减少生命值`} onClick={() => updateCampaign(value => ({ ...value, characters: value.characters.map(ch => ch.id === c.id ? { ...ch, hp: Math.max(0, ch.hp - 1) } : ch) }))}><Minus size={11} /></button><button className="hp-button" disabled={c.hp >= c.maxHp} aria-label={`${c.name}恢复生命值`} onClick={() => updateCampaign(value => ({ ...value, characters: value.characters.map(ch => ch.id === c.id ? { ...ch, hp: Math.min(ch.maxHp, ch.hp + 1) } : ch) }))}><Plus size={11} /></button></div><span className="hp-track"><i style={{ width: `${c.hp / c.maxHp * 100}%`, background: c.color }} /></span></div></div>)}</section>
            <section className="session-panel"><div className="panel-heading"><h2><Hourglass size={18} />回合记录</h2></div><div className="round-control"><div><b>{String(campaign.round).padStart(2, '0')}</b><span>当前回合</span></div><button className="outline-button" disabled={busy || campaign.messages.length >= 2000 || campaign.round >= 100000} onClick={() => updateCampaign(c => ({ ...c, round: c.round + 1, messages: [...c.messages, { id: uid(), role: 'system', content: `第 ${c.round + 1} 回合开始。`, createdAt: Date.now() }] }))}>下一回合<Plus size={14} /></button></div><button className="transcript-button" onClick={exportTranscript}><DownloadSimple size={16} />导出冒险记录<ArrowDown size={14} /></button></section>
            <div className="tools-footnote"><Shield size={15} /><span>骰子由本机随机生成<br />模型根据真实结果继续叙事</span></div>
          </aside>
        </div>
        <footer className="workspace-footer"><span>BEAR TAVERN<span className="footer-dot">·</span>让故事在桌边发生</span><span>{config.provider === 'demo' ? '演示模式 · 连接模型开启自由叙事' : `AI 主持 · ${config.model}`}</span></footer>
      </div>
    </main>
    {notice && <div className="toast" role="status"><Check size={18} />{notice}</div>}
    {modal === 'new' && <Dialog title="开启新的冒险" eyebrow="A NEW CHAPTER" onClose={() => setModal(null)}><form onSubmit={event => { event.preventDefault(); if (!newName.trim()) return; abortRef.current?.abort(); setBusy(false); const value = createCampaign(newName.trim(), newRuleset); setCampaigns(all => [...all, value]); setActiveId(value.id); setSelectedChar(value.characters[0]?.id ?? ''); setError(''); setRetryCampaign(null); setDiceResult(null); setTab('story'); setModal(null); }}><label className="field-label">战役名称<input required maxLength={80} placeholder="给这段故事起个名字" value={newName} onChange={event => setNewName(event.target.value)} /></label><span className="field-label">选择规则背景</span><div className="ruleset-options">{RULESETS.map(r => <button type="button" key={r.id} className={newRuleset === r.id ? 'active' : ''} onClick={() => setNewRuleset(r.id)}><span>{r.shortName}</span><b>{r.name}</b><small>{r.description}</small>{newRuleset === r.id && <Check size={18} />}</button>)}</div><p className="form-hint">提供对应背景、角色模板与主持提示。具体规则由主持人确认。</p><div className="dialog-actions"><button type="button" className="outline-button" onClick={() => setModal(null)}>取消</button><button className="gold-button" type="submit"><BookOpen size={17} />创建战役</button></div></form></Dialog>}
    {modal === 'settings' && <Dialog title="连接你的 AI 主持人" eyebrow="MODEL CONNECTION" onClose={() => setModal(null)}><div className="provider-options">{([{ id: 'demo', name: '离线演示' }, { id: 'ollama', name: 'Ollama' }, { id: 'openai', name: '外接模型' }] as const).map(p => <button key={p.id} className={draftConfig.provider === p.id ? 'active' : ''} onClick={() => { invalidateDiscovery(); setDraftConfig(value => ({ ...value, provider: p.id, model: '', baseUrl: p.id === 'ollama' ? 'http://localhost:11434' : p.id === 'openai' ? 'https://api.openai.com/v1' : value.baseUrl })); }}>{p.name}</button>)}</div>{draftConfig.provider === 'demo' ? <div className="demo-info"><Sparkle size={29} weight="duotone" /><h3>先体验一场冒险</h3><p>无需安装模型。通过预设场景体验角色行动、掷骰和战役记录。连接模型后，即可自由探索和对话。</p></div> : <><label className="field-label">服务地址<input aria-label="模型服务地址" value={draftConfig.baseUrl} maxLength={2000} onChange={event => { invalidateDiscovery(); setDraftConfig(value => ({ ...value, baseUrl: event.target.value })); }} placeholder={draftConfig.provider === 'ollama' ? 'http://localhost:11434' : 'https://your-provider.com/v1'} /></label>{draftConfig.provider === 'openai' && <label className="field-label">API Key<input type="password" autoComplete="off" value={draftConfig.apiKey} maxLength={4000} onChange={event => setDraftConfig(value => ({ ...value, apiKey: event.target.value }))} placeholder="填写服务商提供的密钥" /><small>密钥仅保留在当前页面内存中，刷新后需重新填写。</small></label>}<div className="model-field"><label className="field-label">模型名称<input aria-label="模型名称" list="model-names" value={draftConfig.model} maxLength={200} onChange={event => setDraftConfig(value => ({ ...value, model: event.target.value }))} placeholder={draftConfig.provider === 'ollama' ? '如 qwen3:8b' : '填写服务商的模型名称'} /><datalist id="model-names">{models.map(model => <option key={model} value={model} />)}</datalist></label><button className="outline-button" disabled={testing || !draftConfig.baseUrl.trim()} onClick={() => void testConnection()}>{testing ? '检测中…' : '检测连接'}</button></div><label className="field-label">叙事创造性 <span className="range-value">{draftConfig.temperature.toFixed(1)}</span><input type="range" min="0" max="2" step="0.1" value={draftConfig.temperature} onChange={event => setDraftConfig(value => ({ ...value, temperature: Number(event.target.value) }))} /></label><p className="form-hint">{draftConfig.provider === 'ollama' ? '先在本机启动 Ollama 并下载模型，再检测连接。' : '支持提供 /chat/completions 的 OpenAI 兼容服务。密钥通过本机代理发送给你指定的服务。'}</p></>}{connection && <p className={`connection-result ${connection.startsWith('连接成功') ? 'success' : ''}`} role="status">{connection}</p>}<div className="dialog-actions"><button className="outline-button" onClick={() => setModal(null)}>取消</button><button className="gold-button" disabled={draftConfig.provider !== 'demo' && (!draftConfig.baseUrl.trim() || !draftConfig.model.trim())} onClick={() => { setConfig({ ...draftConfig, baseUrl: draftConfig.baseUrl.trim(), model: draftConfig.model.trim() }); setModal(null); flash('主持人设置已保存'); }}><Check size={17} />保存设置</button></div></Dialog>}
    {modal === 'character' && editing && <Dialog title={campaign.characters.some(c => c.id === editing.id) ? '编辑角色档案' : '加入冒险小队'} eyebrow="CHARACTER SHEET" onClose={() => setModal(null)} wide><form onSubmit={event => { event.preventDefault(); if (!editing.name.trim() || editing.maxHp < 1 || editing.hp < 0 || editing.hp > editing.maxHp) { flash('请检查角色名称与生命值，当前生命值不能超过上限。'); return; } const value = { ...editing, name: editing.name.trim() }; updateCampaign(c => ({ ...c, characters: c.characters.some(ch => ch.id === value.id) ? c.characters.map(ch => ch.id === value.id ? value : ch) : [...c.characters, value] })); setModal(null); }}><div className="form-grid"><label className="field-label">角色名称<input required maxLength={80} value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} /></label><label className="field-label">职业 / 身份<input maxLength={100} value={editing.role} onChange={event => setEditing({ ...editing, role: event.target.value })} /></label></div><div className="form-grid four"><label className="field-label">当前生命<input type="number" required min="0" max={editing.maxHp} value={editing.hp} onChange={event => setEditing({ ...editing, hp: Number(event.target.value) })} /></label><label className="field-label">生命上限<input type="number" required min="1" max="10000" value={editing.maxHp} onChange={event => setEditing({ ...editing, maxHp: Number(event.target.value) })} /></label><label className="field-label">防御<input type="number" required min="0" max="999" value={editing.ac} onChange={event => setEditing({ ...editing, ac: Number(event.target.value) })} /></label><label className="field-label">先攻<input type="number" min="-100" max="999" value={editing.initiative ?? ''} placeholder="未掷骰" onChange={event => setEditing({ ...editing, initiative: event.target.value === '' ? null : Number(event.target.value) })} /></label></div><div className="stat-form">{Object.entries(editing.stats).map(([key, value]) => <label className="field-label" key={key}>{key}<input type="number" required min="0" max="999" value={value} onChange={event => setEditing({ ...editing, stats: { ...editing.stats, [key]: Number(event.target.value) } })} /></label>)}</div><label className="field-label">角色笔记<textarea maxLength={4000} value={editing.notes} placeholder="背景、装备、技能、人物动机…" onChange={event => setEditing({ ...editing, notes: event.target.value })} /></label><div className="dialog-actions"><button className="outline-button" type="button" onClick={() => setModal(null)}>取消</button><button className="gold-button" type="submit"><Check size={17} />保存角色</button></div></form></Dialog>}
    {modal === 'export' && exportData && <Dialog title="保存你的冒险" eyebrow="CAMPAIGN ARCHIVE" onClose={() => setModal(null)}><p className="export-filename"><Scroll size={18} />{exportData.name}</p><p className="form-hint">下载备份文件，或复制下方内容另存为对应文件。</p><textarea className="export-preview" aria-label="导出内容" readOnly value={exportData.content} onFocus={event => event.target.select()} /><div className="dialog-actions"><button className="outline-button" onClick={() => void copyExport()}>复制内容</button><button className="gold-button" onClick={() => { download(exportData.name, exportData.content, exportData.type); flash('已发起下载，请检查浏览器下载列表。'); }}><DownloadSimple size={17} />下载文件</button></div></Dialog>}
    {modal === 'help' && <Dialog title="让第一场冒险开始" eyebrow="QUICK GUIDE" onClose={() => setModal(null)}><ol className="help-steps"><li><b>选择你的世界</b><p>新建战役，选择 D&D、战锤 40K 或通用 TRPG 背景。角色数据和战役记录均可修改。</p></li><li><b>连接 AI 主持人</b><p>在模型设置中连接本机 Ollama，或填写外接模型地址、名称与密钥。离线演示可直接体验。</p></li><li><b>行动、掷骰、续写故事</b><p>选择当前玩家角色，描述行动。需要检定时先掷骰，再告诉主持人继续，真实骰点会进入上下文。</p></li><li><b>保存你的冒险</b><p>战役保存在当前浏览器。“保存战役”导出 JSON 备份，可在另一台设备导入；“导出冒险记录”保存为文本。</p></li></ol><p className="form-hint">首版用于本机同桌跑团，提供叙事与桌面工具。规则提示不包含完整官方规则库。</p><div className="dialog-actions"><button className="gold-button" onClick={() => setModal(null)}>开始冒险</button></div></Dialog>}
  </div>;
}
