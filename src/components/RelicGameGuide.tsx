import { useEffect, useState } from 'react';
import type { TableSession } from '../lib/tabletop';
import { guideMoveOptions, guideTargets, readRelicGuide, relicGuideStatus, type RelicGuideAction, type RelicHero } from '../lib/relic-guide';
import './relic-game-guide.css';

interface Props {
  table: TableSession;
  moving: boolean;
  rolling: boolean;
  starting?: boolean;
  onMoveMode: (value: boolean) => void;
  onAction: (action: RelicGuideAction) => void;
  onRoll: (kind: 'explore' | 'attack', targetId: string) => void;
  onStart: () => void;
  onSelect: (id: string) => void;
  onHelp?: () => void;
}

const heroNames: Record<RelicHero, string> = { blue: '蓝队', orange: '橙队' };
const heroes: RelicHero[] = ['blue', 'orange'];

function guideData(table: TableSession) {
  try {
    const state = readRelicGuide(table);
    return {
      state,
      status: state ? relicGuideStatus(table) : null,
      moves: state?.phase === 'turn' ? guideMoveOptions(table) : [],
      targets: state?.phase === 'turn' ? guideTargets(table) : { explore: [], attack: [] },
      error: '',
    };
  } catch (error) {
    return { state: null, status: null, moves: [], targets: { explore: [], attack: [] }, error: error instanceof Error ? error.message : '无法读取当前引导进度。' };
  }
}

function Rules() {
  return <details className="rg-rules"><summary>展开玩法</summary><ol>
    <li><strong>行动：</strong>每轮蓝队、橙队各行动一次，每名英雄有 2 行动；单人控制两名，双人各控制一名。</li>
    <li><strong>移动：</strong>1 行动最多走 2 个正交格，不能穿墙或穿过守卫。可经过队友，但不能停在队友格。</li>
    <li><strong>探索：</strong>站在遗物格，消耗 1 行动掷 d6；3–6 收集遗物，1–2 警戒增加 1。</li>
    <li><strong>攻击：</strong>选择正交相邻守卫，消耗 1 行动掷 d6；4–6 击败守卫，1–3 无效果。</li>
    <li><strong>守卫：</strong>守卫不移动。英雄结束回合时，若与存活守卫正交相邻，共损失 1 HP。</li>
    <li><strong>事件：</strong>两名英雄行动完后抽 1 张事件并执行，牌堆空时洗回弃牌。HP 上限 3，警戒最低 0。</li>
    <li><strong>胜负：</strong>拿到 3 件遗物且两名英雄回到入口即刻获胜；任一英雄 HP 归零、警戒达到 6，或第 8 轮结束仍未撤离则失败。</li>
  </ol></details>;
}

export default function RelicGameGuide({ table, moving, rolling, starting = false, onMoveMode, onAction, onRoll, onStart, onSelect, onHelp }: Props) {
  const { state, status, moves, targets, error } = guideData(table);
  const [selectedCell, setSelectedCell] = useState('');
  const [healHero, setHealHero] = useState<RelicHero>('blue');
  const [canRetry, setCanRetry] = useState(false);
  const pendingKey = state?.phase === 'rolling' && state.pending ? `${table.id}:${state.pending.request}:${state.pending.generation}` : '';
  useEffect(() => {
    setCanRetry(false);
    if (!pendingKey) return;
    const timer = window.setTimeout(() => setCanRetry(true), 15_000);
    return () => window.clearTimeout(timer);
  }, [pendingKey]);
  const healingEventKey = state?.phase === 'event' && state.event?.effect === 'heal-one' ? `${table.id}:${state.event.cardId}` : '';
  useEffect(() => {
    // Choose once when this card is shown; subsequent player choices stay selected.
    if (healingEventKey && status) setHealHero(status.orangeHp < status.blueHp ? 'orange' : 'blue');
  }, [healingEventKey]);

  const currentHero = state ? table.objects.find(object => object.metadata.role === 'hero' && object.metadata.team === state.hero) : undefined;
  const cell = moves.some(option => option.cell === selectedCell) ? selectedCell : moves[0]?.cell ?? '';
  const die = table.objects.find(object => object.kind === 'dice' && object.sides === 6 && object.name === '检定骰 d6');
  const isBusy = rolling || state?.phase === 'rolling';
  const currentCell = state && status ? state.hero === 'blue' ? status.blueCell : status.orangeCell : '';
  const heroHp = state && status ? state.hero === 'blue' ? status.blueHp : status.orangeHp : 0;

  function act(action: RelicGuideAction) {
    onMoveMode(false);
    onAction(action);
  }

  function moveMode() {
    if (currentHero) onSelect(currentHero.id);
    onMoveMode(!moving);
  }

  const guardDamage = status?.guardDamage ?? 0;

  return <section className="rg-guide" aria-label="遗迹夺宝游玩指引">
    <div className="rg-heading"><div><small>合作冒险 · 约 10–15 分钟</small><h3>遗迹夺宝</h3>{state && <p className="rg-round">第 {state.round}/8 轮 · {heroNames[state.hero]} · {state.ap} 行动</p>}</div>{state && <span className={`rg-hero-badge ${state.hero}`}>{heroNames[state.hero]}</span>}</div>

    {error && <p className="rg-error" role="alert">{error} 可以新开一局，当前桌面会保留。</p>}

    {!state && <>
      <p className="rg-intro">两名探险者潜入遗迹。带走 <strong>3 件遗物</strong>，再让两名英雄回到 <strong>入口</strong>，就能获胜。</p>
      <ol className="rg-start-rules"><li><b>走到目标：</b>每名英雄每轮 2 行动，移动一次最多 2 格。</li><li><b>探索或攻击：</b>点指引按钮掷真实 d6；探索至少 3，攻击至少 4。</li><li><b>及时撤离：</b>留意生命和警戒，每轮末抽取事件，最多 8 轮。</li></ol>
      <button className="rg-primary" disabled={starting} onClick={onStart}>{starting ? '正在准备新局…' : '开始引导（新开局）'}</button>
      <p className="rg-note">会新建一张演示桌并从第 1 轮开始；当前桌面保留在本机桌面列表中。</p>
    </>}

    {state && status && <>
      <div className="rg-stats" aria-label="游戏状态"><div className="rg-stat blue"><span>蓝队生命</span><b>{status.blueHp}/3 HP</b></div><div className="rg-stat orange"><span>橙队生命</span><b>{status.orangeHp}/3 HP</b></div><div className={`rg-stat ${status.alert >= 4 ? 'danger' : ''}`}><span>警戒 · 达到 6 失败</span><b>{status.alert}/6</b></div><div className="rg-stat"><span>已收集遗物</span><b>{status.relics}/3</b></div></div>

      {state.phase !== 'complete' && <p className="rg-note" role="status">{status.relics === 3 ? `遗物已集齐！请让两名英雄返回 B5、C5 入口格。蓝队目前在 ${status.blueCell}，橙队在 ${status.orangeCell}；两名都到达后自动提示胜利。` : `胜利目标：收集 3 件遗物（当前 ${status.relics}/3），再让两名英雄都回到 B5、C5 入口格。`}</p>}

      {state.phase !== 'complete' && currentHero && <div className="rg-current"><span>{heroNames[state.hero]}当前位置</span><button className="rg-cancel" aria-label={`定位${heroNames[state.hero]}英雄`} onClick={() => onSelect(currentHero.id)}>{currentCell || '—'} · 定位棋子</button></div>}

      {state.phase === 'turn' && <>
        <div className="rg-step"><h4>{moving ? '选择要走到的格子' : `${heroNames[state.hero]}，选择下一步`}</h4><p>{moving ? '点击棋盘绿色格，或在下方选择目的地。确认移动后消耗 1 行动。' : status.relics >= 3 ? '遗物已齐！让两名英雄回到入口，立即获胜。' : '先移动到遗物格探索；相邻守卫可以攻击。每次操作消耗 1 行动。'}</p>{state.lastMessage && <p className="rg-message">{state.lastMessage}</p>}</div>
        <div className="rg-actions">
          <button className={`rg-secondary ${moving ? 'active' : ''}`} disabled={isBusy || !moves.length} onClick={moveMode}>{moving ? '取消选择目的地' : '移动（最多 2 格）'}</button>
          {moving && <div className="rg-move"><label>合法目的地<select aria-label="移动目的地" value={cell} disabled={isBusy || !moves.length} onChange={event => setSelectedCell(event.target.value)}>{moves.map(option => <option key={option.cell} value={option.cell}>{option.label}</option>)}</select></label><button className="rg-primary" aria-label={`移动到 ${cell}`} disabled={isBusy || !cell} onClick={() => { if (moves.some(option => option.cell === cell)) act({ type: 'move', cell }); }}>移动到 {cell}</button><p className="rg-note">不能穿墙或穿过守卫，也不能停在队友格。</p></div>}
          {!moving && <>
            {!!targets.explore.length && <div className="rg-targets"><h4>所在格可以探索</h4>{targets.explore.map(target => <button className="rg-primary" key={target.id} disabled={isBusy} onClick={() => onRoll('explore', target.id)}>探索 {target.label} · 掷 d6 ≥ 3</button>)}</div>}
            {!!targets.attack.length && <div className="rg-targets"><h4>相邻守卫可以攻击</h4>{targets.attack.map(target => <button className="rg-secondary" key={target.id} disabled={isBusy} onClick={() => onRoll('attack', target.id)}>攻击 {target.label} · 掷 d6 ≥ 4</button>)}</div>}
            {!targets.explore.length && !targets.attack.length && <p className="rg-note">当前没有探索或攻击目标。点击移动，靠近地图上的遗物。</p>}
            <button className="rg-secondary" disabled={isBusy} onClick={() => act({ type: 'wait' })}>等待（消耗 1 行动）</button>
          </>}
        </div>
        <p className={`rg-note ${guardDamage ? 'rg-danger-text' : ''}`}>{guardDamage ? `若在这里结束回合，守卫会造成 1 伤害（生命 ${heroHp} → ${Math.max(0, heroHp - 1)}）。` : '在当前位置结束回合，没有相邻守卫造成伤害。'}</p>
        {!moving && <p className="rg-note">想留在原地时，选择等待；用完 2 行动后再结束回合。</p>}
      </>}

      {state.phase === 'rolling' && <><div className="rg-step rg-waiting" role="status"><h4><span className="rg-pulse" />{state.pending?.kind === 'attack' ? '正在掷骰攻击' : '正在掷骰探索'}</h4><p>等待骰子在桌面真实落定，系统会显示点数并执行后果。此时不用手动记数。</p><p className="rg-message">行动将在骰子落定后扣除。</p></div>{canRetry && state.pending && <><button className="rg-secondary" onClick={() => { setCanRetry(false); onRoll(state.pending!.kind, state.pending!.targetId); }}>重新掷骰</button><p className="rg-note">骰子长时间未落定时可以重试；旧投掷会取消，不重复扣除行动。</p></>}</>}

      {state.phase === 'result' && <><div className="rg-step rg-result" role="status"><h4>检定已完成</h4><div className="rg-roll-face"><b aria-label={`真实骰子点数 ${die?.value ?? '未知'}`}>{die?.value || '—'}</b><span><span className="rg-result-value-label">真实 d6 点数</span><br />已消耗 1 行动</span></div><p className="rg-message">{state.lastMessage}</p></div><button className="rg-primary" disabled={isBusy} onClick={() => act({ type: 'acknowledge' })}>继续</button></>}

      {state.phase === 'turn-end' && <><div className="rg-step"><h4>{heroNames[state.hero]}行动结束</h4><p>{guardDamage ? `正交相邻有守卫，结束回合将损失 1 HP：${heroHp} → ${Math.max(0, heroHp - 1)}。` : '没有相邻守卫，结束回合不会损失生命。'}</p>{state.lastMessage && <p className="rg-message">{state.lastMessage}</p>}</div><button className="rg-primary" disabled={isBusy} onClick={() => act({ type: 'endTurn' })}>结束{heroNames[state.hero]}回合{guardDamage ? ' · 受到 1 伤害' : ''}</button></>}

      {state.phase === 'event-ready' && <><div className="rg-step"><h4>两名英雄都已行动</h4><p>现在抽取第 {state.round} 轮事件。{state.round >= 8 ? '执行后结算本局是否撤离。' : '事件执行后进入下一轮。'}</p>{state.lastMessage && <p className="rg-message">{state.lastMessage}</p>}</div><button className="rg-primary" disabled={isBusy} onClick={() => act({ type: 'drawEvent' })}>抽取本轮事件</button></>}

      {state.phase === 'event' && state.event && <><div className="rg-step"><small className="rg-note">第 {state.round} 轮事件</small><h4 className="rg-event-title">{state.event.name}</h4><p className="rg-event-description">{state.event.description}</p>{state.event.effect === 'heal-one' && <div className="rg-heal-options" role="radiogroup" aria-label="药箱治疗英雄">{heroes.map(hero => <label key={hero}><input type="radio" name="relic-heal-hero" value={hero} checked={healHero === hero} onChange={() => setHealHero(hero)} />治疗{heroNames[hero]}（{hero === 'blue' ? status.blueHp : status.orangeHp}/3 HP）</label>)}</div>}{(state.event.effect === 'heal-one' || state.event.effect === 'heal-all') && status.blueHp === 3 && status.orangeHp === 3 && <p className="rg-note">两名英雄都已满生命；HP 最高为 3，本次治疗不会增加生命。</p>}</div><button className="rg-primary" disabled={isBusy} onClick={() => act(state.event!.effect === 'heal-one' ? { type: 'applyEvent', hero: healHero } : { type: 'applyEvent' })}>{state.round >= 8 ? '执行事件，结算第 8 轮' : '执行事件，进入下一轮'}</button></>}

      {state.phase === 'complete' && <><div className={`rg-step rg-complete ${state.outcome === 'lost' ? 'lost' : ''}`} role="status"><h4>{state.outcome === 'won' ? '成功夺宝！' : '这次探险结束了'}</h4><p className="rg-message">{state.lastMessage}</p><p>{state.outcome === 'won' ? '两名英雄带着全部遗物平安返回入口。可以再开一局，尝试用更少回合撤离。' : '可以新开一局，调整移动和攻击顺序，再挑战一次。'}</p></div><button className="rg-primary" disabled={starting} onClick={onStart}>{starting ? '正在准备新局…' : '重新开始（新开局）'}</button><p className="rg-note">这张桌面及其结果会保留。</p></>}
    </>}

    <Rules />
    <div className="rg-footer">{onHelp ? <button onClick={onHelp}>桌面操作说明</button> : <span className="rg-note">按指引按钮执行，无需连接模型。</span>}{state && <button className="rg-stop" onClick={() => act({ type: 'stop' })}>返回编辑器</button>}</div>
  </section>;
}
