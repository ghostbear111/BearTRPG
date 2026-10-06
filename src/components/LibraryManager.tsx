import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ArrowUDownLeft, Check, Circle, Cube, DiceFive, Cards, Stack, Selection, UsersThree, Plus, MagnifyingGlass, UploadSimple, X, PencilSimple, Eye, EyeSlash, ArrowClockwise } from '@phosphor-icons/react';
import { type ObjectKind, type TableObject, type Vec3 } from '../lib/tabletop';
import { createLibraryDraft, instantiateLibraryDraft, templateFromObject, saveLibraryEntry, uploadLibraryResource, type LibraryDraft, type LibraryEntry } from '../lib/object-library';
import './library-manager.css';
import BehaviorFields from './BehaviorFields';
import { DiceFacesEditor } from './DiceFields';

const ObjectPreview = lazy(() => import('./ObjectPreview'));
const kinds: ObjectKind[] = ['figurine', 'token', 'dice', 'card', 'deck', 'board', 'block'];
const names: Record<ObjectKind, string> = { figurine: '棋子', token: '标记', dice: '骰子', card: '卡牌', deck: '牌堆', board: '地图', block: '地形' };
const glyphs = { figurine: UsersThree, token: Circle, dice: DiceFive, card: Cards, deck: Stack, board: Selection, block: Cube };
const pageSize = 24;

interface Props {
  entries: LibraryEntry[];
  loading: boolean;
  error: string;
  initialObject?: TableObject | null;
  onClose: () => void;
  onChanged: (entry: LibraryEntry) => void;
  onRefresh: () => void;
}

export default function LibraryManager({ entries, loading, error, initialObject, onClose, onChanged, onRefresh }: Props) {
  const [category, setCategory] = useState<ObjectKind | 'all'>('all');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<LibraryEntry | null>(null);
  const [draft, setDraft] = useState<LibraryDraft | null>(() => initialObject ? templateFromObject(initialObject) : null);
  const [tagsText, setTagsText] = useState(() => initialObject ? '' : '');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState(initialObject ? '已复制所选物件的模板，保存后才能从库取用。' : '');
  const [dirty, setDirty] = useState(Boolean(initialObject));
  useEffect(() => setPage(0), [query, category, status]);

  const filtered = entries.filter(entry => (category === 'all' || entry.kind === category) && (status === 'all' || entry.listed === (status === 'listed')) && `${entry.name} ${entry.description} ${entry.tags.join(' ')}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
  const currentPage = Math.min(page, maxPage);
  const shown = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const preview = useMemo(() => {
    if (!draft) return null;
    try { return instantiateLibraryDraft(draft, { position: [0, 0, 0], locked: true }); }
    catch { return null; }
  }, [draft]);

  function select(entry: LibraryEntry) {
    setEditing(entry);
    const { id: _id, revision: _revision, ...value } = entry;
    setDraft(structuredClone(value)); setTagsText(entry.tags.join('，')); setDirty(false); setNotice('');
  }
  function create(kind: ObjectKind = 'figurine') {
    setEditing(null); setDraft(createLibraryDraft(kind)); setTagsText(''); setDirty(true); setNotice('');
  }
  function patch(values: Partial<LibraryDraft>) { setDraft(current => current ? { ...current, ...values } : current); setDirty(true); }
  function template(values: Partial<LibraryDraft['template']>) {
    setDraft(current => {
      if (!current) return current;
      const configuration = { ...current.template, ...values };
      if (current.kind === 'deck' && current.template.cards && (values.texture !== undefined || values.backTexture !== undefined)) {
        configuration.cards = current.template.cards.map(card => {
          const updated = { ...card };
          for (const field of ['texture', 'backTexture'] as const) {
            if (values[field] !== undefined && (!card[field] || card[field] === current.template[field])) updated[field] = values[field]!;
          }
          return updated;
        });
      }
      return { ...current, template: configuration };
    });
    setDirty(true);
  }
  async function save() {
    if (!draft || busy || uploading) return;
    setBusy(true); setNotice('');
    try {
      const entry = await saveLibraryEntry({ ...draft, tags: tagsText.split(/[,，]/).map(s => s.trim()).filter(Boolean) }, editing?.id, editing?.revision);
      onChanged(entry); select(entry); setNotice(entry.listed ? '已保存，桌面物件库可以取用。' : '已保存到后台，暂不显示在桌面库。');
    } catch (e) { setNotice(e instanceof Error ? e.message : '保存失败，请重试。'); }
    finally { setBusy(false); }
  }
  async function toggle(entry: LibraryEntry) {
    if (busy) return;
    setBusy(true);
    try {
      const { id, revision, ...value } = entry;
      const updated = await saveLibraryEntry({ ...value, listed: !entry.listed }, id, revision);
      onChanged(updated); if (editing?.id === entry.id) select(updated);
      setNotice(updated.listed ? `「${updated.name}」已加入桌面库。` : `「${updated.name}」已从桌面库收起，现有桌面物件保留。`);
    } catch (e) { setNotice(e instanceof Error ? e.message : '更新失败。'); }
    finally { setBusy(false); }
  }
  async function upload(file: File | undefined, back = false) {
    if (!file || !draft) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1_400_000) { setNotice('请选择不超过 1.4 MB 的 PNG、JPEG 或 WebP 图片。'); return; }
    setUploading(true); setNotice('');
    try {
      const result = await uploadLibraryResource(file);
      template(back ? { backTexture: result.url } : { texture: result.url });
      setNotice('图片已载入，请检查预览并保存物件。');
    } catch (e) { setNotice(e instanceof Error ? e.message : '图片无法导入。'); }
    finally { setUploading(false); }
  }

  return <div className="lm-app">
    <header className="lm-header"><button className="lm-back" onClick={onClose}><ArrowUDownLeft size={18} />返回桌面</button><div className="lm-heading"><h1>物件后台</h1><span>制作物件，选择哪些进入桌面库</span></div><button className="lm-primary" disabled={busy || uploading} onClick={() => create()}><Plus size={17} />新建物件</button></header>
    <div className={`lm-layout ${draft ? 'has-editor' : ''}`}>
      <aside className="lm-sidebar"><p>物件分类</p><button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}><Cube size={18} /><span>全部物件</span><b>{entries.length}</b></button>{kinds.map(kind => { const Icon = glyphs[kind]; return <button key={kind} className={category === kind ? 'active' : ''} onClick={() => setCategory(kind)}><Icon size={18} /><span>{names[kind]}</span><b>{entries.filter(e => e.kind === kind).length}</b></button>; })}<div className="lm-sidebar-note"><p>桌面用于布置游戏。</p><p>后台保存可反复取用的模板，修改模板后再次放置才使用新版本。</p></div></aside>
      <main className="lm-catalog"><div className="lm-catalog-toolbar"><label className="lm-search"><MagnifyingGlass size={17} /><input aria-label="搜索后台物件" placeholder="搜索名称、标签或说明" value={query} onChange={e => setQuery(e.target.value)} /></label><select aria-label="库显示状态" value={status} onChange={e => setStatus(e.target.value)}><option value="all">全部状态</option><option value="listed">已加入桌面库</option><option value="unlisted">仅后台保存</option></select><button className="lm-icon" disabled={loading || busy} aria-label="刷新物件库" onClick={onRefresh}><ArrowClockwise size={18} /></button></div>
        <div className="lm-catalog-meta"><span>{category === 'all' ? '全部物件' : names[category]} · {filtered.length} 件</span><span>{entries.filter(e => e.listed).length} 件可从桌面取用</span></div>
        {error && <div className="lm-alert" role="alert">{error}<button onClick={onRefresh}>重试</button></div>}
        {loading && !entries.length ? <div className="lm-empty">正在读取本机物件库…</div> : <div className="lm-grid">{shown.map(entry => { const Icon = glyphs[entry.kind]; return <article key={entry.id} className={`lm-item ${editing?.id === entry.id ? 'selected' : ''}`}><button className="lm-item-main" aria-label={`编辑 ${entry.name}`} disabled={busy || uploading} onClick={() => select(entry)}><div className="lm-item-visual" style={{ '--object-color': entry.template.color } as CSSProperties}>{entry.template.texture && entry.kind !== 'dice' ? <img src={entry.template.texture} alt="" loading="lazy" /> : <Icon size={44} weight="duotone" />}{entry.kind === 'dice' && <span>d{entry.template.sides}</span>}</div><div className="lm-item-title"><h2>{entry.name}</h2><PencilSimple size={14} /></div><span className="lm-item-kind">{names[entry.kind]} · 版本 {entry.revision}</span>{entry.tags.length > 0 && <p className="lm-item-tags">{entry.tags.slice(0, 3).join(' · ')}</p>}</button><button className={`lm-item-status ${entry.listed ? 'listed' : ''}`} disabled={busy || uploading || Boolean(dirty && editing?.id === entry.id)} aria-label={`${entry.listed ? '收起' : '入库'} ${entry.name}`} onClick={() => void toggle(entry)}>{entry.listed ? <Eye size={14} /> : <EyeSlash size={14} />}<span>{entry.listed ? '已加入桌面库' : '仅后台保存'}</span></button></article>; })}</div>}
        {!loading && !filtered.length && !error && <div className="lm-empty"><Cube size={38} /><h2>{entries.length ? '没有匹配的物件' : '制作第一件自定义物件'}</h2><p>{entries.length ? '调整搜索或显示状态。' : '从棋子、标记或骰子开始，保存后选择是否加入桌面库。'}</p><button className="lm-secondary" onClick={() => create(category === 'all' ? 'figurine' : category)}><Plus size={16} />新建物件</button></div>}
        {maxPage > 0 && <div className="lm-pages"><button disabled={!currentPage} onClick={() => setPage(p => p - 1)}>上一页</button><span>{currentPage + 1} / {maxPage + 1}</span><button disabled={currentPage === maxPage} onClick={() => setPage(p => p + 1)}>下一页</button></div>}
      </main>
      <aside className="lm-editor">{draft ? <><div className="lm-editor-heading"><div><h2>{editing ? '编辑物件' : '新建物件'}</h2><span>{dirty ? '有未保存的修改' : `已保存版本 ${editing?.revision ?? ''}`}</span></div><button className="lm-icon" aria-label="收起物件编辑" onClick={() => { setDraft(null); setEditing(null); }}><X size={18} /></button></div><div className="lm-preview">{preview ? <Suspense fallback={<span>正在准备预览…</span>}><ObjectPreview object={preview} /></Suspense> : <span>请输入有效尺寸以查看预览</span>}</div><p className="lm-preview-note">拖动旋转预览 · 滚轮缩放</p>
        <fieldset className="lm-editor-form" disabled={busy || uploading}><label>物件类型<select aria-label="自定义物件类型" value={draft.kind} disabled={Boolean(editing) || busy || uploading} onChange={e => { const next = createLibraryDraft(e.target.value as ObjectKind); setDraft({ ...next, name: draft.name, description: draft.description, tags: draft.tags, listed: draft.listed }); setDirty(true); }}>{kinds.map(kind => <option key={kind} value={kind}>{names[kind]}</option>)}</select></label><label>名称<input aria-label="模板名称" maxLength={120} value={draft.name} onChange={e => patch({ name: e.target.value })} /></label><label>说明<textarea aria-label="模板说明" maxLength={4000} value={draft.description} onChange={e => patch({ description: e.target.value })} /></label><label>标签<input aria-label="模板标签" maxLength={240} value={tagsText} placeholder="如：角色，敌人，地城" onChange={e => { setTagsText(e.target.value); setDirty(true); }} /></label><div className="lm-inline-field"><span>颜色</span><input aria-label="模板颜色" type="color" value={draft.template.color} onChange={e => template({ color: e.target.value })} /></div>
          <BehaviorFields kind={draft.kind} metadata={draft.template.metadata} onChange={metadata => template({ metadata })} />
          {draft.kind === 'dice' && <><label>骰型<select aria-label="模板骰子面数" value={draft.template.sides} onChange={e => template({ sides: Number(e.target.value), diceFaces: undefined, value: 0 })}>{[4, 6, 8, 10, 12, 20].map(sides => <option key={sides} value={sides}>d{sides}</option>)}</select><small>支持标准点数或逐面符号；保存后可从武功骰组编辑器取用。</small></label><DiceFacesEditor sides={draft.template.sides} color={draft.template.color} faces={draft.template.diceFaces} onChange={diceFaces => template({ diceFaces, value: 0 })} /></>}
          <fieldset className="lm-vector"><legend>{draft.kind === 'dice' ? '均匀缩放' : '缩放比例'}</legend>{(draft.kind === 'dice' ? [0] : [0, 1, 2]).map(i => <label key={i}><span>{draft.kind === 'dice' ? '比例' : ['X', 'Y', 'Z'][i]}</span><input aria-label={draft.kind === 'dice' ? '模板骰子缩放' : `模板缩放 ${['X', 'Y', 'Z'][i]}`} type="number" min="0.1" max="8" step="0.1" value={draft.template.scale[i]} onChange={e => { const n = Number(e.target.value); const scale = [...draft.template.scale] as Vec3; if (draft.kind === 'dice') scale.fill(n); else scale[i] = n; template({ scale }); }} /></label>)}</fieldset>
          <fieldset className="lm-vector"><legend>默认朝向 °</legend>{[0, 1, 2].map(i => <label key={i}><span>{['X', 'Y', 'Z'][i]}</span><input aria-label={`模板旋转 ${['X', 'Y', 'Z'][i]}`} type="number" min="-360" max="360" step="15" value={Math.round(draft.template.rotation[i] * 180 / Math.PI)} onChange={e => { const rotation = [...draft.template.rotation] as Vec3; rotation[i] = Number(e.target.value) * Math.PI / 180; template({ rotation }); }} /></label>)}</fieldset>
          {draft.kind === 'token' && <label>初始计数<input aria-label="模板标记计数" type="number" min="-9999" max="9999" value={draft.template.value} onChange={e => template({ value: Number(e.target.value) })} /></label>}
          {draft.kind === 'deck' && <label>牌数<input aria-label="模板牌数" type="number" min="1" max="512" value={draft.template.cards?.length ?? 0} onChange={e => { const count = Number(e.target.value); if (!Number.isInteger(count) || count < 1 || count > 512) return; const existing = draft.template.cards ?? []; const cards = Array.from({ length: count }, (_, i) => existing[i] ?? { name: `${draft.name || '卡牌'} ${i + 1}`, description: '', texture: draft.template.texture, backTexture: draft.template.backTexture }); template({ cards, value: count }); }} /><small>更换共享图片会更新使用该图片的牌，独立卡面保留。</small></label>}{draft.kind !== 'dice' && <><label className="lm-upload"><UploadSimple size={17} /><span>{draft.template.texture ? '更换正面图片' : draft.kind === 'figurine' ? '导入棋子肖像' : '导入正面图片'}</span><input aria-label="模板正面图片" disabled={uploading} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} /></label>{draft.template.texture && <button className="lm-text-button" onClick={() => template({ texture: '' })}>移除正面图片</button>}{['card', 'deck'].includes(draft.kind) && <label className="lm-upload"><UploadSimple size={17} /><span>{draft.template.backTexture ? '更换牌背图片' : '导入牌背图片'}</span><input aria-label="模板背面图片" disabled={uploading} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { void upload(e.target.files?.[0], true); e.target.value = ''; }} /></label>}<small className="lm-help">PNG / JPEG / WebP，每张不超过 1.4 MB。</small></>}
          <label className="lm-check"><input aria-label="加入桌面物件库" type="checkbox" checked={draft.listed} onChange={e => patch({ listed: e.target.checked })} /><span>加入桌面物件库<small>勾选后可以在桌面取用，后台始终保留。</small></span></label>
        </fieldset><footer className="lm-editor-footer">{notice && <p role="status">{notice}</p>}<button className="lm-primary" disabled={busy || uploading || !draft.name.trim() || !preview} onClick={() => void save()}><Check size={16} />{busy ? '正在保存…' : uploading ? '正在导入图片…' : '保存物件'}</button></footer></> : <div className="lm-editor-empty"><Cube size={38} /><h2>查看与制作物件</h2><p>选择一个模板进行编辑，或新建棋子、标记、骰子等物件。</p><p>保存时可以决定是否加入桌面取用库。</p></div>}</aside>
    </div>{notice && !draft && <div className="lm-floating-notice" role="status">{notice}</div>}
  </div>;
}
