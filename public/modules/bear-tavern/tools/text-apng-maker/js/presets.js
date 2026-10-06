/*
 * 文字画像APNGメーカー — 初期値・テンプレート・プリセット
 */
(function (root) {
  'use strict';

  const BASE = {
    mode: 'message',
    text: '',
    subText: '',
    subPosition: 'below',
    width: 1280,
    height: 720,
    sizePreset: '1280x720',
    anchor: 'mc',
    marginX: 64,
    marginY: 56,
    offsetX: 0,
    offsetY: 0,
    writing: 'h',
    align: 'center',
    autoFit: true,
    wrapChars: 0,
    fontId: 'noto-serif-jp',
    weight: 700,
    italic: false,
    fontSize: 120,
    letterSpacing: 0.08,
    lineHeight: 1.5,
    subFontId: 'same',
    subWeight: 400,
    subItalic: false,
    subSize: 0.3,
    subLetterSpacing: 0.25,
    subGap: 0.3,
    fill: { type: 'solid', color: '#ffffff', color2: '#ffd76a', color3: '', dir: 'v' },
    fillOpacity: 1,
    stroke: { on: true, width: 5, color: '#1b1b1f' },
    stroke2: { on: false, width: 6, color: '#ffffff' },
    shadow: { on: true, color: '#000000', opacity: 0.6, blur: 12, x: 0, y: 5 },
    glow: { on: false, color: '#7fb4ff', size: 28, strength: 1 },
    subColorOn: false,
    subColor: '#ffffff',
    deco: {
      type: 'none', color: '#000000', opacity: 0.55, color2: '#ffffff', pad: 0.4, extend: 0.8, thickness: 3, outline: false, soft: 0.5, sideFade: 0.3, radius: 0.2, anim: 'grow', dur: 0.45,
      tapeColor: '#f5c400', tapeStripe: '#151515', tapeSize: 40, tapeSpeed: 90, tapeBlink: 0.5
    },
    bg: { type: 'none', color: '#000000', opacity: 0.45, sync: true },
    inFx: 'fade',
    inDur: 0.6,
    inStagger: 0,
    inOrder: 'forward',
    inEase: 'auto',
    inPower: 1,
    inDir: 'left',
    holdFx: 'none',
    hold: 1.5,
    holdPower: 1,
    // ノイズ（グリッチ）で左右にずれる2色
    glitchColor: '#ff285a',
    glitchColor2: '#28e6ff',
    outEnabled: true,
    outFx: 'fade',
    outDur: 0.6,
    outStagger: 0,
    outOrder: 'forward',
    outEase: 'auto',
    outPower: 1,
    outDir: 'left',
    subFx: 'same',
    subDelay: -0.2,
    startDelay: 0.1,
    endDelay: 0.3,
    reveal: 'char',
    cps: 12,
    glyphDur: 0.4,
    linePause: 0.35,
    punctPause: 0.25,
    lineInterval: 0.9,
    sweepDur: 1.2,
    pageSplit: true,
    pageGap: 0.3,
    cursor: false,
    cursorColor: '',
    scrollSpeed: 90,
    scrollFade: true,
    soloSize: 0.55,
    soloPause: 0.4,
    soloImpact: 1,
    spreadHold: 0.5,
    spreadDur: 0.9
  };

  const T = (ja, en, ko, zh) => ({ ja, en, ko, zh });

  // 戦闘開始・戦闘終了は同じデザイン
  const BATTLE_PATCH = {
    fontId: 'shippori-mincho-b1', weight: 800, fontSize: 124, letterSpacing: 0.12,
    subFontId: 'cinzel', subWeight: 700, subSize: 0.2, subLetterSpacing: 0.6, subGap: 0.62,
    fill: { type: 'solid', color: '#ffffff' },
    stroke: { on: false }, stroke2: { on: false },
    shadow: { on: true, color: '#000000', opacity: 0.35, blur: 10, x: 0, y: 3 },
    glow: { on: false },
    deco: { type: 'frame', color: '#000000', opacity: 0, color2: '#ffffff', thickness: 3, pad: 0.28, extend: 12, anim: 'grow', dur: 0.6 },
    inFx: 'drop', inDur: 0.55, inStagger: 0.1, inPower: 1.1, hold: 1.4, outFx: 'zoomThrough', outDur: 0.5, subFx: 'fade', subDelay: -0.1
  };

  // 秘匿確認・秘匿処理中は同じ青いシステム画面
  const SECRET_PATCH = {
    fontId: 'biz-udpmincho', weight: 700, fontSize: 72, letterSpacing: 0.12,
    subPosition: 'above', subFontId: 'share-tech-mono', subWeight: 400, subSize: 0.32, subLetterSpacing: 0.35, subGap: 0.45,
    fill: { type: 'solid', color: '#ffffff' },
    stroke: { on: false }, stroke2: { on: false },
    shadow: { on: true, color: '#020b1a', opacity: 0.6, blur: 8, x: 0, y: 2 },
    glow: { on: true, color: '#3a8dff', size: 10, strength: 0.45 },
    subColorOn: true, subColor: '#8cc4ff',
    deco: { type: 'box', color: '#081a33', opacity: 0.85, color2: '#3a8dff', pad: 0.5, thickness: 2, radius: 0.14, anim: 'grow', dur: 0.4 },
    inFx: 'typewriter', inStagger: 0.05, hold: 2, outFx: 'fade', outDur: 0.45, subFx: 'fade', subDelay: -3
  };

  // ロールプレイをどうぞ：秘匿確認と同じシステム画面の緑版
  const ROLEPLAY_PATCH = {
    ...SECRET_PATCH,
    shadow: { on: true, color: '#021a0e', opacity: 0.6, blur: 8, x: 0, y: 2 },
    glow: { on: true, color: '#2fd07a', size: 10, strength: 0.45 },
    subColor: '#93ecb8',
    deco: { type: 'box', color: '#062a1a', opacity: 0.85, color2: '#2fd07a', pad: 0.5, thickness: 2, radius: 0.14, anim: 'grow', dur: 0.4 }
  };

  // ラウンド1〜5は同じデザイン（数字だけが違う）
  const ROUND_PATCH = {
    fontId: 'shippori-mincho-b1', weight: 800, fontSize: 124, letterSpacing: 0.16,
    fill: { type: 'solid', color: '#ffffff' }, stroke: { on: false }, stroke2: { on: false },
    shadow: { on: true, color: '#000000', opacity: 0.35, blur: 10, x: 0, y: 3 }, glow: { on: false },
    deco: { type: 'sides', color2: '#ffffff', pad: 0.5, extend: 1.6, thickness: 3, anim: 'grow', dur: 0.6 },
    inFx: 'drop', inDur: 0.55, inStagger: 0.1, inPower: 1.1, hold: 1.3, outFx: 'fade', outDur: 0.5
  };

  // 章タイトル・プロローグ・エピローグは同じデザイン（光と下線の色だけが違う）
  const CHAPTER_PATCH = {
    fontId: 'shippori-mincho-b1', weight: 800, fontSize: 128, letterSpacing: 0.22,
    subFontId: 'same', subWeight: 400, subSize: 0.3, subLetterSpacing: 0.15, subGap: 0.45,
    fill: { type: 'solid', color: '#ffffff' }, stroke: { on: false }, stroke2: { on: false },
    shadow: { on: true, color: '#000000', opacity: 0.8, blur: 14, x: 0, y: 4 },
    deco: { type: 'underline', color2: '#ffffff', pad: 0.3, extend: 0.5, thickness: 2, anim: 'grow', dur: 0.9 },
    inFx: 'blurIn', inDur: 1.0, inStagger: 0.15, hold: 1.6, outFx: 'fade', outDur: 0.8, subFx: 'fade', subDelay: -0.2
  };

  // 一日目・最終日は同じデザイン
  const DAY_PATCH = {
    fontId: 'shippori-mincho-b1', weight: 800, fontSize: 150, letterSpacing: 0.3,
    subFontId: 'same', subWeight: 700, subSize: 0.2, subLetterSpacing: 0.5, subGap: 0.5,
    fill: { type: 'solid', color: '#fff6e3' }, stroke: { on: false }, stroke2: { on: false },
    shadow: { on: true, color: '#000000', opacity: 0.75, blur: 14, x: 0, y: 4 },
    glow: { on: true, color: '#ffcf7a', size: 22, strength: 0.45 },
    subColorOn: true, subColor: '#e8c27a',
    deco: { type: 'underline', color2: '#e0b35a', pad: 0.3, extend: 0.9, thickness: 2, anim: 'grow', dur: 0.9 },
    inFx: 'rise', inDur: 1.1, inStagger: 0.12, hold: 1.6, outFx: 'fade', outDur: 0.8, subFx: 'fade', subDelay: -0.3
  };

  // 判定結果は「戦闘開始」と同じタイトル枠の中に出す。
  // 成功は度合いが上がるほど明るく派手に（白 → 青い光 → 水色の強い光 → 金の閃光 → 虹色）、失敗は暗く沈み、ファンブルはさらに暗い赤に
  const DICE_FRAME = {
    ...BATTLE_PATCH,
    subColorOn: true
  };
  const diceFrame = (line, fill = { color: '#000000', opacity: 0 }, thickness = 4.5) => ({ ...BATTLE_PATCH.deco, color2: line, color: fill.color, opacity: fill.opacity, thickness });
  const DICE_SUCCESS = {
    ...DICE_FRAME,
    fill: { type: 'solid', color: '#ffffff' },
    glow: { on: true, color: '#ffffff', size: 14, strength: 0.35 },
    subColor: '#e8eef8',
    deco: diceFrame('#ffffff')
  };
  const DICE_GOOD = {
    ...DICE_FRAME,
    fill: { type: 'gradient', color: '#ffffff', color2: '#e3f3ff', color3: '#9fd4ff', dir: 'v' },
    glow: { on: true, color: '#58b4ff', size: 22, strength: 0.7 },
    subColor: '#bfe3ff',
    deco: diceFrame('#9fd4ff'),
    holdFx: 'glow', holdPower: 0.5
  };
  const DICE_GREAT = {
    ...DICE_FRAME,
    fill: { type: 'gradient', color: '#ffffff', color2: '#dcfbff', color3: '#6fe3ff', dir: 'v' },
    shadow: { on: true, color: '#001a26', opacity: 0.45, blur: 10, x: 0, y: 3 },
    glow: { on: true, color: '#27d3ff', size: 32, strength: 1 },
    subColor: '#c8f6ff',
    deco: diceFrame('#7fe8ff'),
    inFx: 'zoomIn', inDur: 0.6, inStagger: 0, inPower: 1, holdFx: 'glow', holdPower: 0.8
  };
  const DICE_CRITICAL = {
    ...DICE_FRAME,
    fill: { type: 'gradient', color: '#fffef0', color2: '#ffe27a', color3: '#ffb300', dir: 'v' },
    stroke: { on: true, width: 1.5, color: '#5a3a00' },
    shadow: { on: true, color: '#2a1a00', opacity: 0.5, blur: 10, x: 0, y: 3 },
    glow: { on: true, color: '#ffc21a', size: 44, strength: 1.5 },
    subColor: '#ffe9a8',
    deco: diceFrame('#ffd24a', undefined, 5.5),
    inFx: 'flash', inDur: 0.8, inStagger: 0, inPower: 1, holdFx: 'glow', holdPower: 1.2, hold: 1.6
  };
  const DICE_BEYOND = {
    ...DICE_FRAME,
    fill: { type: 'gradient', color: '#fffbe0', color2: '#ff9ee6', color3: '#8f8bff', dir: 'v' },
    stroke: { on: true, width: 1.5, color: '#2a0f40' },
    shadow: { on: true, color: '#12002a', opacity: 0.5, blur: 10, x: 0, y: 3 },
    glow: { on: true, color: '#ff7ae0', size: 48, strength: 1.6 },
    subColor: '#ffd6f6',
    deco: diceFrame('#ffe6ff', undefined, 5.5),
    inFx: 'flash', inDur: 0.9, inStagger: 0, inPower: 1, holdFx: 'pulse', holdPower: 1, hold: 1.8
  };
  const DICE_FAILURE = {
    ...DICE_FRAME,
    fill: { type: 'gradient', color: '#ff9a9a', color2: '#e04848', color3: '#9e1f1f', dir: 'v' },
    shadow: { on: true, color: '#000000', opacity: 0.7, blur: 14, x: 0, y: 5 },
    subColor: '#e07a7a',
    deco: diceFrame('#8a2a2a', { color: '#120505', opacity: 0.55 }),
    outFx: 'sink', outDur: 0.7, outStagger: 0.06
  };
  const DICE_FUMBLE = {
    ...DICE_FRAME,
    fill: { type: 'gradient', color: '#ff5a5a', color2: '#b00000', color3: '#4a0000', dir: 'v' },
    stroke: { on: true, width: 2, color: '#1a0000' },
    shadow: { on: true, color: '#000000', opacity: 0.85, blur: 16, x: 0, y: 6 },
    glow: { on: true, color: '#c00000', size: 30, strength: 1 },
    subColor: '#ff7a7a',
    deco: diceFrame('#b00000', { color: '#0a0000', opacity: 0.72 }),
    inFx: 'glitch', inDur: 0.8, inStagger: 0, inPower: 1, holdFx: 'glitch', holdPower: 0.7, hold: 1.8, outFx: 'sink', outDur: 0.8, outStagger: 0.05
  };
  // 正気度ロール：骨のような白い文字に暗い赤の光、時々ノイズが走る
  const SAN_ROLL = {
    ...DICE_FRAME,
    fill: { type: 'gradient', color: '#f6f1e8', color2: '#dccfbd', color3: '#9c8670', dir: 'v' },
    stroke: { on: true, width: 1.5, color: '#1a0000' },
    shadow: { on: true, color: '#000000', opacity: 0.85, blur: 16, x: 0, y: 5 },
    glow: { on: true, color: '#7a0000', size: 34, strength: 1 },
    subFontId: 'nosifer', subWeight: 400, subSize: 0.18, subLetterSpacing: 0.35,
    subColor: '#b01212',
    deco: diceFrame('#6e0b0b', { color: '#050000', opacity: 0.7 }),
    glitchColor: '#ff1a1a', glitchColor2: '#2a0000',
    inFx: 'flicker', inDur: 1.0, inStagger: 0, holdFx: 'glitch', holdPower: 0.6, hold: 2.4, outFx: 'blurOut', outDur: 0.8, outStagger: 0
  };
  // SANチェック：血のように赤い文字を叩きつけ、強いノイズが走る
  const SAN_CHECK = {
    ...DICE_FRAME,
    fontId: 'dela-gothic-one', weight: 400, letterSpacing: 0.08,
    fill: { type: 'gradient', color: '#ff5050', color2: '#c40000', color3: '#4a0000', dir: 'v' },
    stroke: { on: true, width: 2, color: '#120000' },
    shadow: { on: true, color: '#000000', opacity: 0.9, blur: 16, x: 0, y: 6 },
    glow: { on: true, color: '#d00000', size: 38, strength: 1.3 },
    subFontId: 'nosifer', subWeight: 400, subSize: 0.18, subLetterSpacing: 0.35,
    subColor: '#ff5a5a',
    deco: diceFrame('#a00000', { color: '#0a0000', opacity: 0.75 }, 5),
    glitchColor: '#ff0000', glitchColor2: '#000000',
    inFx: 'glitch', inDur: 0.8, inStagger: 0, inPower: 1, holdFx: 'glitch', holdPower: 1, hold: 2.4, outFx: 'glitch', outDur: 0.7, outStagger: 0
  };
  // 判定の呼びかけ（共鳴判定・憑依判定など）
  const CHECK_CALL = {
    fontId: 'kaisei-decol', weight: 700, fontSize: 120, letterSpacing: 0.2,
    subFontId: 'cinzel', subWeight: 700, subSize: 0.22, subLetterSpacing: 0.55, subGap: 0.4,
    fill: { type: 'gradient', color: '#ffffff', color2: '#e9ddff', color3: '#b89cff', dir: 'v' },
    stroke: { on: false }, stroke2: { on: false },
    shadow: { on: true, color: '#12002a', opacity: 0.7, blur: 12, x: 0, y: 4 },
    glow: { on: true, color: '#a57bff', size: 28, strength: 0.8 },
    subColorOn: true, subColor: '#d9c8ff',
    deco: { type: 'corners', color2: '#c9b3ff', pad: 0.45, thickness: 3, anim: 'grow', dur: 0.6 },
    inFx: 'emerge', inDur: 1.0, holdFx: 'glow', holdPower: 0.8, hold: 1.8, outFx: 'blurOut', outDur: 0.7, subFx: 'fade', subDelay: -0.2
  };
  // 共鳴判定は青系
  const RESONANCE_CALL = {
    ...CHECK_CALL,
    fill: { type: 'gradient', color: '#ffffff', color2: '#dcebff', color3: '#7fb0ff', dir: 'v' },
    shadow: { on: true, color: '#00102a', opacity: 0.7, blur: 12, x: 0, y: 4 },
    glow: { on: true, color: '#4d8dff', size: 28, strength: 0.8 },
    subColor: '#c6dcff',
    deco: { ...CHECK_CALL.deco, color2: '#9fc4ff' }
  };
  // フェイズの見出し（ダブルクロスのオープニング〜エンディング）
  const PHASE_TITLE = {
    fontId: 'zen-kaku-gothic-new', weight: 900, fontSize: 92, letterSpacing: 0.14,
    subFontId: 'orbitron', subWeight: 700, subSize: 0.26, subLetterSpacing: 0.55, subGap: 0.3,
    fill: { type: 'solid', color: '#ffffff' }, stroke: { on: false }, stroke2: { on: false },
    shadow: { on: true, color: '#000000', opacity: 0.6, blur: 8, x: 0, y: 3 },
    glow: { on: true, color: '#5ad1ff', size: 16, strength: 0.4 },
    subColorOn: true, subColor: '#7fe3ff',
    deco: { type: 'band', color: '#02060c', opacity: 0.72, pad: 0.45, soft: 0.2, sideFade: 0.2, anim: 'grow', dur: 0.45 },
    inFx: 'wipe', inDir: 'lr', inDur: 0.7, hold: 1.6, outFx: 'wipe', outDir: 'lr', outDur: 0.6
  };

  // メッセージのテンプレートの分類（テンプレート一覧の上のタブ）。systems があれば、その下にシステムの段を出す
  const TEMPLATE_GROUPS = {
    message: [
      { id: 'combat', label: T('戦闘', 'Combat', '전투', '战斗') },
      { id: 'investigation', label: T('探索・事件', 'Investigation', '탐색·사건', '探索与事件') },
      { id: 'gm', label: T('GM', 'GM', 'GM', '主持人') },
      { id: 'scene', label: T('シーン・時間', 'Scene & Time', '장면·시간', '场景与时间') },
      { id: 'dice', label: T('判定', 'Dice', '판정', '判定'), systems: [
        { id: 'coc6', label: T('CoC6', 'CoC 6e', 'CoC6', 'CoC 第六版') },
        { id: 'coc7', label: T('CoC7', 'CoC 7e', 'CoC7', 'CoC 第七版') },
        { id: 'emoklore', label: T('エモクロア', 'Emoklore', '에모크로아', 'Emoklore') },
        { id: 'dx', label: T('ダブクロ', 'Double Cross', '더블크로스', 'Double Cross') }
      ] }
    ]
  };

  // 書き出しのループの初期値（テンプレートを選ぶと、この値になる）。ふだんは「1回再生」。
  // 画面に出したままにすることが多いGMの案内と判定の結果は「ずっとループ」。テンプレートに loop があればそれを使う
  const LOOP_BY_GROUP = { gm: 'infinite', dice: 'infinite' };

  const TEMPLATES = {
    message: [
      {
        id: 'battle', group: 'combat', icon: 'swords', label: T('戦闘開始', 'Battle Start', '전투 개시', '战斗开始'),
        text: T('戦闘開始', 'BATTLE START', '전투 개시', '战斗开始'), subText: T('BATTLE START', 'ENGAGE', 'BATTLE START', '进入战斗'),
        patch: BATTLE_PATCH
      },
      {
        id: 'battleEnd', group: 'combat', icon: 'flag', label: T('戦闘終了', 'Battle End', '전투 종료', '战斗结束'),
        text: T('戦闘終了', 'BATTLE END', '전투 종료', '战斗结束'), subText: T('BATTLE END', 'DISENGAGE', 'BATTLE END', '结束战斗'),
        patch: BATTLE_PATCH
      },
      {
        // サイバー風：ネオンの水色、デジタルな書体、グリッチで起動
        id: 'openCombat', group: 'combat', icon: 'chip', label: T('OPEN COMBAT', 'Open Combat', 'OPEN COMBAT', '启动战斗'),
        text: T('OPEN COMBAT', 'OPEN COMBAT', 'OPEN COMBAT', '启动战斗'), subText: T('戦闘開始', 'COMBAT MODE : ONLINE', '전투 개시', '战斗模式：已启动'),
        patch: {
          fontId: 'orbitron', weight: 900, fontSize: 120, letterSpacing: 0.16,
          subFontId: 'share-tech-mono', subWeight: 400, subSize: 0.3, subLetterSpacing: 0.5, subGap: 0.45,
          fill: { type: 'gradient', color: '#ffffff', color2: '#b8f6ff', color3: '#3fd8ff', dir: 'v' },
          stroke: { on: true, width: 1.5, color: '#00e5ff' }, stroke2: { on: false },
          shadow: { on: false }, glow: { on: true, color: '#00d9ff', size: 30, strength: 1.3 },
          subColorOn: true, subColor: '#6ff0ff',
          deco: { type: 'lines', color2: '#00e5ff', pad: 0.3, extend: 0.6, thickness: 2, anim: 'grow', dur: 0.45 },
          inFx: 'glitch', inDur: 0.8, holdFx: 'glitch', holdPower: 0.6, hold: 1.8, outFx: 'glitch', outDur: 0.5, subFx: 'typewriter', subDelay: -0.1
        }
      },
      {
        id: 'finalRound', group: 'combat', icon: 'flame', label: T('ファイナルラウンド', 'Final Round', '파이널 라운드', '最终回合'),
        text: T('FINAL ROUND', 'FINAL ROUND', 'FINAL ROUND', '最终回合'), subText: T('', '', '', ''),
        patch: {
          fontId: 'shippori-mincho-b1', weight: 800, fontSize: 124, letterSpacing: 0.1,
          fill: { type: 'gradient', color: '#fff4e0', color2: '#ffc27a', color3: '#ff3b1f', dir: 'v' },
          stroke: { on: true, width: 2, color: '#3a0600' }, stroke2: { on: false },
          shadow: { on: true, color: '#1a0000', opacity: 0.7, blur: 12, x: 0, y: 4 },
          glow: { on: true, color: '#ff2a10', size: 34, strength: 1 },
          deco: { type: 'sides', color2: '#ff4a2a', pad: 0.45, extend: 1.0, thickness: 4, anim: 'grow', dur: 0.6 },
          inFx: 'slam', inDur: 0.7, holdFx: 'glitch', holdPower: 1, hold: 1.6, outFx: 'zoomThrough', outDur: 0.5
        }
      },
      {
        // ラウンドのチップは数字違いが並ぶので、アイコンなしで1列に収める
        id: 'round', group: 'combat', label: T('ラウンド1', 'Round 1', '라운드 1', '第 1 回合'),
        text: T('ROUND 1', 'ROUND 1', 'ROUND 1', '第 1 回合'), subText: T('', '', '', ''),
        patch: ROUND_PATCH
      },
      {
        id: 'round2', group: 'combat', label: T('ラウンド2', 'Round 2', '라운드 2', '第 2 回合'),
        text: T('ROUND 2', 'ROUND 2', 'ROUND 2', '第 2 回合'), subText: T('', '', '', ''),
        patch: ROUND_PATCH
      },
      {
        id: 'round3', group: 'combat', label: T('ラウンド3', 'Round 3', '라운드 3', '第 3 回合'),
        text: T('ROUND 3', 'ROUND 3', 'ROUND 3', '第 3 回合'), subText: T('', '', '', ''),
        patch: ROUND_PATCH
      },
      {
        id: 'round4', group: 'combat', label: T('ラウンド4', 'Round 4', '라운드 4', '第 4 回合'),
        text: T('ROUND 4', 'ROUND 4', 'ROUND 4', '第 4 回合'), subText: T('', '', '', ''),
        patch: ROUND_PATCH
      },
      {
        id: 'round5', group: 'combat', label: T('ラウンド5', 'Round 5', '라운드 5', '第 5 回合'),
        text: T('ROUND 5', 'ROUND 5', 'ROUND 5', '第 5 回合'), subText: T('', '', '', ''),
        patch: ROUND_PATCH
      },
      {
        // 赤と黒：黒い帯に赤い文字。ノイズ（グリッチ）の色ずれも赤と黒にして、画面全体の色を崩さない
        id: 'defeat', group: 'combat', icon: 'skull', label: T('敗北', 'Defeat', '패배', '战败'),
        text: T('敗北', 'DEFEAT', '패배', '战败'), subText: T('DEFEAT', 'BATTLE LOST', 'DEFEAT', '战斗失败'),
        patch: {
          fontId: 'shippori-mincho-b1', weight: 800, fontSize: 150, letterSpacing: 0.3,
          subFontId: 'cinzel', subWeight: 700, subSize: 0.2, subLetterSpacing: 0.9, subGap: 0.45,
          fill: { type: 'gradient', color: '#ff7070', color2: '#e41414', color3: '#780000', dir: 'v' },
          stroke: { on: true, width: 2, color: '#000000' }, stroke2: { on: false },
          shadow: { on: true, color: '#000000', opacity: 0.9, blur: 14, x: 0, y: 5 },
          glow: { on: true, color: '#c80000', size: 30, strength: 1 },
          subColorOn: true, subColor: '#e03a3a',
          deco: { type: 'band', color: '#000000', opacity: 0.88, pad: 0.42, soft: 0.25, sideFade: 0.35, anim: 'grow', dur: 0.35 },
          glitchColor: '#ff2020', glitchColor2: '#000000',
          inFx: 'glitch', inDur: 0.9, holdFx: 'glitch', holdPower: 1, hold: 1.8, outFx: 'glitch', outDur: 0.8, subFx: 'fade', subDelay: -0.2
        }
      },
      {
        id: 'explore', group: 'investigation', icon: 'search', label: T('探索開始', 'Exploration', '탐색 개시', '开始探索'),
        text: T('探索開始', 'EXPLORATION', '탐색 개시', '开始探索'), subText: T('EXPLORATION', '- PHASE 1 -', 'EXPLORATION', '— 第一阶段 —'),
        patch: {
          fontId: 'shippori-mincho', weight: 800, fontSize: 116, letterSpacing: 0.28,
          subFontId: 'cinzel', subWeight: 700, subSize: 0.22, subLetterSpacing: 0.5, subGap: 0.4,
          fill: { type: 'solid', color: '#f6f1e7' }, stroke: { on: false }, stroke2: { on: false },
          shadow: { on: true, color: '#000000', opacity: 0.8, blur: 16, x: 0, y: 4 },
          glow: { on: true, color: '#9fc3ff', size: 26, strength: 0.7 },
          deco: { type: 'lines', color2: '#e8dcc0', pad: 0.35, extend: 1.2, thickness: 2, anim: 'grow', dur: 0.8 },
          inFx: 'tracking', inDur: 1.4, hold: 1.4, outFx: 'tracking', outDur: 1.0, subFx: 'fade', subDelay: -0.5
        }
      },
      {
        id: 'investigate', group: 'investigation', icon: 'badge', label: T('捜査開始', 'Investigation', '수사 개시', '开始侦查'),
        text: T('捜査開始', 'INVESTIGATION', '수사 개시', '开始侦查'), subText: T('- INVESTIGATION -', '- CASE OPEN -', '- INVESTIGATION -', '— 案件开启 —'),
        patch: {
          fontId: 'zen-kaku-gothic-new', weight: 900, fontSize: 112, letterSpacing: 0.24,
          subFontId: 'special-elite', subWeight: 400, subSize: 0.24, subLetterSpacing: 0.3, subGap: 0.22,
          fill: { type: 'solid', color: '#151515' }, stroke: { on: false }, stroke2: { on: false },
          shadow: { on: false }, glow: { on: false },
          subColorOn: true, subColor: '#151515',
          deco: { type: 'band', color: '#f3c613', opacity: 1, pad: 0.3, soft: 0, sideFade: 0, anim: 'grow', dur: 0.35 },
          inFx: 'typewriter', inStagger: 0.1, hold: 1.6, outFx: 'wipe', outDir: 'lr', outDur: 0.5, subFx: 'fade', subDelay: -0.1
        }
      },
      {
        // 調査報告の見出し：黒一色のかっちりした明朝（和文タイプの印字のような字面）を1文字ずつ打ち込み、
        // 下に黒いラインを走らせて、タイプライター書体の RESEARCH を小さく添える。
        // 暗い背景でも読めるように、文字とラインに白い縁取り（4px）をつける
        id: 'research', group: 'investigation', icon: 'clipboard', label: T('調査開始', 'Research', '조사 개시', '开始调查'),
        text: T('調査開始', 'RESEARCH', '조사 개시', '开始调查'), subText: T('RESEARCH', 'FIELD NOTES', 'RESEARCH', '调查记录'),
        patch: {
          fontId: 'biz-udpmincho', weight: 700, fontSize: 116, letterSpacing: 0.3,
          subFontId: 'special-elite', subWeight: 400, subSize: 0.22, subLetterSpacing: 0.6, subGap: 0.55,
          fill: { type: 'solid', color: '#111111' }, stroke: { on: true, width: 4, color: '#ffffff' }, stroke2: { on: false },
          shadow: { on: false }, glow: { on: false },
          subColorOn: true, subColor: '#111111',
          deco: { type: 'underline', color2: '#111111', outline: true, pad: 0.2, extend: 0.4, thickness: 2.5, anim: 'grow', dur: 0.7 },
          inFx: 'typewriter', inStagger: 0.14, hold: 2, outFx: 'fade', outDur: 0.5, subFx: 'fade', subDelay: 0
        }
      },
      {
        id: 'emergency', group: 'investigation', icon: 'warning', label: T('緊急事態', 'Emergency', '긴급 사태', '紧急情况'),
        text: T('緊急事態', 'EMERGENCY', '긴급 사태', '紧急情况'), subText: T('EMERGENCY', 'WARNING', 'EMERGENCY', '警告'),
        patch: {
          fontId: 'noto-sans-jp', weight: 900, fontSize: 118, letterSpacing: 0.32,
          subFontId: 'oswald', subWeight: 700, subSize: 0.26, subLetterSpacing: 0.7, subGap: 0.32,
          fill: { type: 'solid', color: '#ffffff' }, stroke: { on: true, width: 4, color: '#8a0000' }, stroke2: { on: false },
          shadow: { on: true, color: '#000000', opacity: 0.65, blur: 8, x: 0, y: 3 }, glow: { on: false },
          subColorOn: true, subColor: '#f5c400',
          deco: { type: 'tape', pad: 0.3, anim: 'grow', dur: 0.55, tapeSize: 54, tapeSpeed: 110, tapeBlink: 0.55 },
          inFx: 'shutter', inDir: 'v', inDur: 0.45, hold: 1.8, outFx: 'fade', outDur: 0.5, subFx: 'fade', subDelay: -0.1
        }
      },
      {
        // 現場写真：ファインダーの四隅の枠と、カメラのフラッシュ
        id: 'incident', group: 'investigation', icon: 'siren', label: T('事件発生', 'Incident', '사건 발생', '事件发生'),
        text: T('事件発生', 'INCIDENT', '사건 발생', '事件发生'), subText: T('CASE FILE No.013', 'CASE FILE No.013', 'CASE FILE No.013', '案件档案 No.013'),
        patch: {
          fontId: 'zen-kaku-gothic-new', weight: 900, fontSize: 120, letterSpacing: 0.3,
          subFontId: 'special-elite', subWeight: 400, subSize: 0.22, subLetterSpacing: 0.3, subGap: 0.42,
          fill: { type: 'solid', color: '#ffffff' }, stroke: { on: false }, stroke2: { on: false },
          shadow: { on: true, color: '#000000', opacity: 0.7, blur: 10, x: 0, y: 3 }, glow: { on: false },
          subColorOn: true, subColor: '#ff4040',
          deco: { type: 'corners', color2: '#ffffff', pad: 0.5, thickness: 3, anim: 'grow', dur: 0.4 },
          inFx: 'flash', inDur: 0.8, hold: 1.8, outFx: 'fade', outDur: 0.5, subFx: 'fade', subDelay: -0.2
        }
      },
      {
        // 疾走感：斜体の文字が左から一気に駆け込み、琥珀色の警告灯のように点滅して、右へ走り抜ける。上下の線が素早く伸びる
        id: 'chase', group: 'investigation', icon: 'dash', label: T('追跡開始', 'Chase', '추적 개시', '开始追踪'),
        text: T('追跡開始', 'CHASE START', '추적 개시', '开始追踪'), subText: T('CHASE START', 'IN PURSUIT', 'CHASE START', '追踪中'),
        patch: {
          fontId: 'zen-kaku-gothic-new', weight: 900, fontSize: 124, letterSpacing: 0.12, italic: true,
          subFontId: 'oswald', subWeight: 700, subSize: 0.22, subLetterSpacing: 0.6, subGap: 0.3, subItalic: true,
          fill: { type: 'gradient', color: '#ffffff', color2: '#ffe3a3', color3: '#ff9d1a', dir: 'v' },
          stroke: { on: true, width: 2, color: '#3a1400' }, stroke2: { on: false },
          shadow: { on: true, color: '#000000', opacity: 0.6, blur: 8, x: 0, y: 3 },
          glow: { on: true, color: '#ff8a00', size: 22, strength: 0.8 },
          subColorOn: true, subColor: '#ffb347',
          deco: { type: 'lines', color2: '#ffb347', pad: 0.3, extend: 1.6, thickness: 3, anim: 'grow', dur: 0.25 },
          inFx: 'slide', inDir: 'left', inDur: 0.3, inStagger: 0.03, inPower: 2.5, holdFx: 'blink', holdPower: 1, hold: 2,
          outFx: 'slide', outDir: 'right', outDur: 0.3, outStagger: 0.02, outPower: 2.5, subFx: 'fade', subDelay: -0.1
        }
      },
      {
        id: 'message', group: 'investigation', icon: 'mail', label: T('メッセージ受信', 'New Message', '메시지 수신', '新消息'),
        text: T('メッセージが届きました', 'You have a new message', '메시지가 도착했습니다', '您收到了一条新消息'), subText: T('新着メッセージ', 'NEW MESSAGE', '새 메시지', '新消息'),
        patch: {
          fontId: 'noto-sans-jp', weight: 700, fontSize: 56, letterSpacing: 0.06,
          subPosition: 'above', subFontId: 'same', subWeight: 700, subSize: 0.46, subLetterSpacing: 0.12, subGap: 0.45,
          fill: { type: 'solid', color: '#1c2430' }, stroke: { on: false }, stroke2: { on: false },
          shadow: { on: false }, glow: { on: false },
          subColorOn: true, subColor: '#3a7bd5',
          deco: { type: 'box', color: '#ffffff', opacity: 0.96, color2: '#d0d7e2', pad: 0.55, thickness: 0, radius: 0.5, anim: 'fade', dur: 0.3 },
          inFx: 'emerge', inDur: 0.5, hold: 1.8, outFx: 'recede', outDur: 0.45
        }
      },
      {
        id: 'call', group: 'investigation', icon: 'phone', label: T('着信あり', 'Incoming Call', '착신', '来电'),
        text: T('着信あり', 'INCOMING CALL', '착신', '来电'), subText: T('非通知', 'Unknown Number', '발신자 표시 제한', '未知号码'),
        patch: {
          fontId: 'noto-sans-jp', weight: 700, fontSize: 84, letterSpacing: 0.1,
          subPosition: 'above', subFontId: 'same', subWeight: 400, subSize: 0.4, subLetterSpacing: 0.2, subGap: 0.4,
          fill: { type: 'solid', color: '#ffffff' }, stroke: { on: false }, stroke2: { on: false },
          shadow: { on: false }, glow: { on: false },
          subColorOn: true, subColor: '#3ddc84',
          deco: { type: 'box', color: '#0d1117', opacity: 0.9, color2: '#3ddc84', pad: 0.5, thickness: 3, radius: 0.6, anim: 'fade', dur: 0.3 },
          inFx: 'emerge', inDur: 0.45, holdFx: 'shake', holdPower: 0.35, hold: 2.2, outFx: 'recede', outDur: 0.4
        }
      },
      {
        // 白黒の帯に斜体の文字が左から一気に滑り込み、右へ抜けて消える
        id: 'missionClear', group: 'investigation', icon: 'checkCircle', label: T('ミッションクリア', 'Mission Clear', '미션 클리어', '任务完成'),
        text: T('MISSION CLEAR', 'MISSION CLEAR', 'MISSION CLEAR', '任务完成'), subText: T('ミッションクリア', 'ALL OBJECTIVES COMPLETE', '미션 클리어', '所有目标已完成'),
        patch: {
          fontId: 'oswald', weight: 700, fontSize: 130, letterSpacing: 0.12, italic: true,
          subFontId: 'noto-sans-jp', subWeight: 700, subSize: 0.2, subLetterSpacing: 0.6, subGap: 0.28, subItalic: true,
          fill: { type: 'solid', color: '#ffffff' }, stroke: { on: false }, stroke2: { on: false },
          shadow: { on: false }, glow: { on: false },
          subColorOn: true, subColor: '#bdbdbd',
          deco: { type: 'band', color: '#000000', opacity: 0.9, pad: 0.3, soft: 0, sideFade: 0, anim: 'grow', dur: 0.25 },
          inFx: 'slide', inDir: 'left', inDur: 0.35, inStagger: 0.03, inPower: 2, hold: 1.6,
          outFx: 'wipe', outDir: 'lr', outDur: 0.35, subFx: 'fade', subDelay: -0.1
        }
      },
      {
        id: 'secret', group: 'gm', icon: 'lock', label: T('秘匿を確認してください', 'Check Your Secret', '비닉 확인', '请查看秘密信息'),
        text: T('秘匿を確認してください', 'CHECK YOUR SECRET', '비닉을 확인해 주세요', '请查看秘密信息'), subText: T('SECRET HANDOUT', 'SECRET HANDOUT', 'SECRET HANDOUT', '秘密资料'),
        patch: SECRET_PATCH
      },
      {
        id: 'processing', group: 'gm', icon: 'loader', label: T('秘匿処理中', 'Processing Secrets', '비닉 처리 중', '正在处理秘密信息'),
        text: T('秘匿処理中...', 'PROCESSING SECRETS...', '비닉 처리 중...', '正在处理秘密信息……'), subText: T('SECRET HANDOUT', 'SECRET HANDOUT', 'SECRET HANDOUT', '秘密资料'),
        patch: { ...SECRET_PATCH, inStagger: 0.07, holdFx: 'glow', holdPower: 1, hold: 2.2 }
      },
      {
        id: 'roleplay', group: 'gm', icon: 'mask', label: T('ロールプレイをどうぞ', 'Roleplay Time', '롤플레이 해 주세요', '请开始角色扮演'),
        text: T('ロールプレイをどうぞ', 'ROLEPLAY TIME', '롤플레이 해 주세요', '请开始角色扮演'), subText: T('ROLE PLAY', 'YOUR TURN', 'ROLE PLAY', '轮到你了'),
        patch: ROLEPLAY_PATCH
      },
      {
        id: 'break', group: 'gm', icon: 'coffee', label: T('休憩中', 'On Break', '휴식 중', '休息中'),
        text: T('休憩中', 'BREAK TIME', '휴식 중', '休息时间'), subText: T('BREAK TIME', 'Back in a few minutes', 'BREAK TIME', '稍后继续'),
        patch: {
          fontId: 'zen-maru-gothic', weight: 900, fontSize: 140, letterSpacing: 0.14,
          subFontId: 'm-plus-rounded-1c', subWeight: 700, subSize: 0.24, subLetterSpacing: 0.35, subGap: 0.3,
          fill: { type: 'gradient', color: '#fffdf7', color2: '#ffe6bf', color3: '', dir: 'v' },
          stroke: { on: true, width: 7, color: '#6b3f1d' }, stroke2: { on: true, width: 6, color: '#ffffff' },
          shadow: { on: true, color: '#3a1f0a', opacity: 0.35, blur: 10, x: 0, y: 6 },
          glow: { on: false },
          subColorOn: true, subColor: '#6b3f1d',
          inFx: 'bounce', inDur: 0.9, inStagger: 0.1, holdFx: 'float', holdPower: 0.8, hold: 2.4, outFx: 'sink', outDur: 0.7, outStagger: 0.05, subFx: 'fade'
        }
      },
      {
        // セーフティツールのXカード：黒いカードに赤い文字と赤い縁
        id: 'xcard', group: 'gm', icon: 'xcard', label: T('Xカード', 'X-Card', 'X카드', 'X 卡'),
        text: T('X-Card', 'X-Card', 'X-Card', 'X 卡'), subText: T('一時中断をお願いします', 'Let’s pause for a moment', '잠시 중단해 주세요', '请暂停片刻'),
        patch: {
          fontId: 'anton', weight: 400, fontSize: 150, letterSpacing: 0.08,
          subFontId: 'noto-sans-jp', subWeight: 700, subSize: 0.19, subLetterSpacing: 0.24, subGap: 0.42,
          fill: { type: 'solid', color: '#e8202f' }, stroke: { on: false }, stroke2: { on: false },
          shadow: { on: false }, glow: { on: false },
          subColorOn: true, subColor: '#ff6b73',
          deco: { type: 'box', color: '#0b0b0d', opacity: 0.95, color2: '#e8202f', pad: 0.5, thickness: 4, radius: 0.08, anim: 'grow', dur: 0.35 },
          inFx: 'pop', inDur: 0.5, inStagger: 0.05, hold: 2.2, outFx: 'fade', outDur: 0.5, subFx: 'fade', subDelay: -0.1
        }
      },
      {
        id: 'loading', group: 'gm', icon: 'hourglass', label: T('Now Loading', 'Now Loading', 'Now Loading', '加载中'),
        text: T('Now Loading...', 'Now Loading...', 'Now Loading...', '加载中……'), subText: T('しばらくお待ちください', 'Please wait a moment', '잠시만 기다려 주세요', '请稍候'),
        patch: {
          fontId: 'press-start-2p', weight: 400, fontSize: 64, letterSpacing: 0.04,
          subFontId: 'dotgothic16', subWeight: 400, subSize: 0.42, subLetterSpacing: 0.2, subGap: 0.5,
          fill: { type: 'solid', color: '#ffffff' },
          stroke: { on: true, width: 4, color: '#1b1b3a' }, stroke2: { on: false },
          shadow: { on: true, color: '#000000', opacity: 0.55, blur: 0, x: 5, y: 5 },
          glow: { on: false },
          inFx: 'typewriter', inStagger: 0.07, holdFx: 'wave', holdPower: 1, hold: 2.4, outFx: 'fade', outDur: 0.4, subFx: 'fade', subDelay: 0
        }
      },
      {
        id: 'simple', group: 'gm', icon: 'type', label: T('シンプルテキスト', 'Simple Text', '심플 텍스트', '简洁文本'),
        text: T('メッセージ', 'MESSAGE', '메시지', '消息'), subText: T('', '', '', ''),
        patch: {
          fontId: 'noto-sans-jp', weight: 700, fontSize: 110, letterSpacing: 0.08,
          fill: { type: 'solid', color: '#ffffff' }, stroke: { on: true, width: 4, color: '#1b1b1f' }, stroke2: { on: false },
          shadow: { on: true, color: '#000000', opacity: 0.5, blur: 10, x: 0, y: 4 }, glow: { on: false },
          inFx: 'fade', inDur: 0.6, hold: 1.6, outFx: 'fade', outDur: 0.6
        }
      },
      // シーン・時間：物語の構成（章・プロローグ・エピローグ・幕間・回想）→ 日付（一日目・一日後・最終日）→ 時刻（翌朝・真夜中・時間経過）
      {
        id: 'chapter', group: 'scene', icon: 'book', label: T('章タイトル', 'Chapter', '장 제목', '章节标题'),
        text: T('第一章', 'CHAPTER I', '제1장', '第一章'), subText: T('「目覚めの夜」', '“The Night of Awakening”', '「각성의 밤」', '“觉醒之夜”'),
        patch: CHAPTER_PATCH
      },
      {
        // 章タイトルの姉妹版：夜明け前のような青白い光
        id: 'prologue', group: 'scene', icon: 'feather', label: T('プロローグ', 'Prologue', '프롤로그', '序章'),
        text: T('プロローグ', 'PROLOGUE', '프롤로그', '序章'), subText: T('「すべての始まり」', '“Where It All Began”', '「모든 것의 시작」', '“一切的开端”'),
        patch: { ...CHAPTER_PATCH, glow: { on: true, color: '#9fbaff', size: 22, strength: 0.5 }, deco: { ...CHAPTER_PATCH.deco, color2: '#c9d8ff' } }
      },
      {
        // 章タイトルの姉妹版：物語を閉じる温かい光
        id: 'epilogue', group: 'scene', icon: 'bookClosed', label: T('エピローグ', 'Epilogue', '에필로그', '终章'),
        text: T('エピローグ', 'EPILOGUE', '에필로그', '终章'), subText: T('「そして、夜が明ける」', '“And So the Night Ends”', '「그리고, 날이 밝는다」', '“于是，天亮了”'),
        patch: { ...CHAPTER_PATCH, glow: { on: true, color: '#ffd59a', size: 22, strength: 0.5 }, deco: { ...CHAPTER_PATCH.deco, color2: '#f0d6a4' } }
      },
      {
        // 上下の細い金の線と欧文のサブで端正に
        id: 'intermission', group: 'scene', icon: 'curtain', label: T('幕間', 'Intermission', '막간', '幕间'),
        text: T('幕間', 'INTERLUDE', '막간', '幕间'), subText: T('INTERMISSION', 'BETWEEN THE ACTS', 'INTERMISSION', '幕间休息'),
        patch: {
          fontId: 'shippori-mincho-b1', weight: 800, fontSize: 130, letterSpacing: 0.6,
          subFontId: 'cinzel', subWeight: 700, subSize: 0.2, subLetterSpacing: 0.7, subGap: 0.5,
          fill: { type: 'solid', color: '#f7f1e3' }, stroke: { on: false }, stroke2: { on: false },
          shadow: { on: true, color: '#000000', opacity: 0.75, blur: 14, x: 0, y: 4 }, glow: { on: false },
          subColorOn: true, subColor: '#d8c28a',
          deco: { type: 'lines', color2: '#d8c28a', pad: 0.35, extend: 0.9, thickness: 1.5, anim: 'grow', dur: 0.9 },
          inFx: 'fade', inDur: 1.0, inStagger: 0.2, hold: 1.8, outFx: 'fade', outDur: 0.9, subFx: 'fade', subDelay: -0.3
        }
      },
      {
        // セピア色の文字がぼかしからにじみ出て、ぼやけながら消える
        id: 'flashback', group: 'scene', icon: 'history', label: T('回想', 'Flashback', '회상', '回忆'),
        text: T('回想', 'FLASHBACK', '회상', '回忆'), subText: T('FLASHBACK', 'YEARS AGO', 'FLASHBACK', '多年前'),
        patch: {
          fontId: 'zen-old-mincho', weight: 700, fontSize: 140, letterSpacing: 0.5,
          subFontId: 'cinzel', subWeight: 400, subSize: 0.2, subLetterSpacing: 0.6, subGap: 0.45,
          fill: { type: 'gradient', color: '#f6e7c8', color2: '#dcb983', color3: '#9a7446', dir: 'v' },
          stroke: { on: false }, stroke2: { on: false },
          shadow: { on: true, color: '#1e1206', opacity: 0.7, blur: 14, x: 0, y: 4 },
          glow: { on: true, color: '#c89b5a', size: 24, strength: 0.5 },
          subColorOn: true, subColor: '#d9bd8e',
          inFx: 'blurIn', inDur: 1.4, inStagger: 0.2, hold: 1.6, outFx: 'blurOut', outDur: 1.1, subFx: 'fade', subDelay: -0.4
        }
      },
      {
        id: 'day', group: 'scene', icon: 'calendar', label: T('一日目', 'Day 1', '첫째 날', '第一天'),
        text: T('一日目', 'DAY 1', '첫째 날', '第一天'), subText: T('DAY 1', 'THE FIRST DAY', 'DAY 1', '第一天'),
        patch: DAY_PATCH
      },
      {
        // 映画の「ONE DAY LATER」：字間が縮まりながら現れる
        id: 'dayLater', group: 'scene', icon: 'calendarNext', label: T('一日後', 'One Day Later', '하루 뒤', '一天后'),
        text: T('一日後', 'ONE DAY LATER', '하루 뒤', '一天后'), subText: T('ONE DAY LATER', '24 HOURS LATER', 'ONE DAY LATER', '24 小时后'),
        patch: {
          fontId: 'shippori-mincho', weight: 800, fontSize: 110, letterSpacing: 0.45,
          subFontId: 'cinzel', subWeight: 400, subSize: 0.22, subLetterSpacing: 0.6, subGap: 0.45,
          fill: { type: 'solid', color: '#f2f2f2' }, stroke: { on: false }, stroke2: { on: false },
          shadow: { on: true, color: '#000000', opacity: 0.8, blur: 14, x: 0, y: 4 },
          glow: { on: true, color: '#ffffff', size: 18, strength: 0.3 },
          inFx: 'tracking', inDur: 1.6, hold: 1.4, outFx: 'tracking', outDur: 1.2, subFx: 'fade', subDelay: -0.6
        }
      },
      {
        id: 'finalDay', group: 'scene', icon: 'calendarFlag', label: T('最終日', 'Final Day', '마지막 날', '最后一天'),
        text: T('最終日', 'FINAL DAY', '마지막 날', '最后一天'), subText: T('FINAL DAY', 'THE LAST DAY', 'FINAL DAY', '最后一天'),
        patch: DAY_PATCH
      },
      {
        // 朝日：白から淡い金色に変わる文字と温かい光が、下からゆっくり浮かび上がる
        id: 'nextMorning', group: 'scene', icon: 'sunrise', label: T('翌朝', 'Next Morning', '다음 날 아침', '次日清晨'),
        text: T('翌朝', 'MORNING', '다음 날 아침', '清晨'), subText: T('THE NEXT MORNING', 'THE NEXT DAY', 'THE NEXT MORNING', '第二天'),
        patch: {
          fontId: 'shippori-mincho-b1', weight: 800, fontSize: 150, letterSpacing: 0.4,
          subFontId: 'cinzel', subWeight: 700, subSize: 0.2, subLetterSpacing: 0.6, subGap: 0.45,
          fill: { type: 'gradient', color: '#ffffff', color2: '#fff0c8', color3: '#ffcf73', dir: 'v' },
          stroke: { on: false }, stroke2: { on: false },
          shadow: { on: true, color: '#3a2400', opacity: 0.5, blur: 12, x: 0, y: 4 },
          glow: { on: true, color: '#ffc15a', size: 34, strength: 0.8 },
          subColorOn: true, subColor: '#ffd98a',
          inFx: 'rise', inDur: 1.4, inStagger: 0.15, inPower: 0.8, holdFx: 'glow', holdPower: 0.5, hold: 1.6,
          outFx: 'fade', outDur: 1.0, subFx: 'fade', subDelay: -0.3
        }
      },
      {
        // 月明かり：青白い文字がぼかしから現れ、表示中は光がかすかに揺らぐ
        id: 'midnight', group: 'scene', icon: 'moon', label: T('真夜中', 'Midnight', '한밤중', '午夜'),
        text: T('午前零時', 'MIDNIGHT', '오전 0시', '午夜'), subText: T('MIDNIGHT', '12:00 AM', 'MIDNIGHT', '凌晨零点'),
        patch: {
          fontId: 'shippori-mincho', weight: 700, fontSize: 110, letterSpacing: 0.4,
          subFontId: 'cinzel', subWeight: 400, subSize: 0.22, subLetterSpacing: 0.6, subGap: 0.45,
          fill: { type: 'gradient', color: '#f2f7ff', color2: '#c9dbff', color3: '#8fb0f0', dir: 'v' },
          stroke: { on: false }, stroke2: { on: false },
          shadow: { on: true, color: '#000814', opacity: 0.8, blur: 14, x: 0, y: 4 },
          glow: { on: true, color: '#6f9bff', size: 28, strength: 0.8 },
          subColorOn: true, subColor: '#aac4ff',
          inFx: 'blurIn', inDur: 1.2, inStagger: 0.1, holdFx: 'glow', holdPower: 0.7, hold: 1.8,
          outFx: 'blurOut', outDur: 1.0, subFx: 'fade', subDelay: -0.3
        }
      },
      {
        id: 'timeSkip', group: 'scene', icon: 'clock', label: T('時間経過', 'Time Skip', '시간 경과', '时间流逝'),
        text: T('一時間経過', 'ONE HOUR LATER', '한 시간 후', '一小时后'), subText: T('ONE HOUR LATER', '', 'ONE HOUR LATER', '一小时后'),
        patch: {
          fontId: 'shippori-mincho', weight: 700, fontSize: 76, letterSpacing: 0.35,
          subFontId: 'cinzel', subWeight: 400, subSize: 0.26, subLetterSpacing: 0.5, subGap: 0.5,
          fill: { type: 'solid', color: '#f2f2f2' }, stroke: { on: false }, stroke2: { on: false },
          shadow: { on: true, color: '#000000', opacity: 0.8, blur: 12, x: 0, y: 3 }, glow: { on: false },
          deco: { type: 'sides', color2: '#f2f2f2', pad: 0.55, extend: 2.6, thickness: 1.5, anim: 'grow', dur: 1.0 },
          inFx: 'fade', inDur: 1.0, inStagger: 0.06, hold: 1.5, outFx: 'fade', outDur: 0.9, subFx: 'fade', subDelay: -0.2
        }
      },
      {
        id: 'coc6Success', group: 'dice', system: 'coc6', label: T('成功', 'Success', '성공', '成功'),
        text: T('成功', 'SUCCESS', '성공', '成功'), subText: T('SUCCESS', '', 'SUCCESS', '成功'),
        patch: DICE_SUCCESS
      },
      {
        id: 'coc6Failure', group: 'dice', system: 'coc6', label: T('失敗', 'Failure', '실패', '失败'),
        text: T('失敗', 'FAILURE', '실패', '失败'), subText: T('FAILURE', '', 'FAILURE', '失败'),
        patch: DICE_FAILURE
      },
      {
        id: 'coc6Special', group: 'dice', system: 'coc6', label: T('スペシャル', 'Special', '스페셜', '特殊成功'),
        text: T('スペシャル', 'SPECIAL', '스페셜', '特殊成功'), subText: T('SPECIAL', '', 'SPECIAL', '特殊成功'),
        patch: DICE_GREAT
      },
      {
        id: 'coc6Critical', group: 'dice', system: 'coc6', label: T('クリティカル', 'Critical', '크리티컬', '大成功'),
        text: T('クリティカル', 'CRITICAL', '크리티컬', '大成功'), subText: T('CRITICAL', '', 'CRITICAL', '大成功'),
        patch: DICE_CRITICAL
      },
      {
        id: 'coc6Fumble', group: 'dice', system: 'coc6', label: T('ファンブル', 'Fumble', '펌블', '大失败'),
        text: T('ファンブル', 'FUMBLE', '펌블', '大失败'), subText: T('FUMBLE', '', 'FUMBLE', '大失败'),
        patch: DICE_FUMBLE
      },
      {
        id: 'coc6SanRoll', group: 'dice', system: 'coc6', label: T('正気度ロール', 'Sanity Roll', '이성 판정', '理智检定'),
        text: T('正気度ロール', 'SANITY ROLL', '이성 판정', '理智检定'), subText: T('SANITY ROLL', '', 'SANITY ROLL', '理智检定'),
        patch: SAN_ROLL
      },
      {
        id: 'coc6SanCheck', group: 'dice', system: 'coc6', label: T('SANチェック', 'SAN Check', 'SAN 체크', 'SAN 检定'),
        text: T('SANチェック', 'SAN CHECK', 'SAN 체크', 'SAN 检定'), subText: T('SANITY CHECK', '', 'SANITY CHECK', '理智检定'),
        patch: SAN_CHECK
      },
      {
        id: 'coc7Regular', group: 'dice', system: 'coc7', label: T('レギュラー成功', 'Regular Success', '보통 성공', '普通成功'),
        text: T('レギュラー成功', 'REGULAR SUCCESS', '보통 성공', '普通成功'), subText: T('REGULAR SUCCESS', '', 'REGULAR SUCCESS', '普通成功'),
        patch: DICE_SUCCESS
      },
      {
        id: 'coc7Hard', group: 'dice', system: 'coc7', label: T('ハード成功', 'Hard Success', '어려운 성공', '困难成功'),
        text: T('ハード成功', 'HARD SUCCESS', '어려운 성공', '困难成功'), subText: T('HARD SUCCESS', '', 'HARD SUCCESS', '困难成功'),
        patch: DICE_GOOD
      },
      {
        id: 'coc7Extreme', group: 'dice', system: 'coc7', label: T('イクストリーム成功', 'Extreme Success', '극단적 성공', '极难成功'),
        text: T('イクストリーム成功', 'EXTREME SUCCESS', '극단적 성공', '极难成功'), subText: T('EXTREME SUCCESS', '', 'EXTREME SUCCESS', '极难成功'),
        patch: DICE_GREAT
      },
      {
        id: 'coc7Critical', group: 'dice', system: 'coc7', label: T('クリティカル', 'Critical', '크리티컬', '大成功'),
        text: T('クリティカル', 'CRITICAL', '크리티컬', '大成功'), subText: T('CRITICAL', '', 'CRITICAL', '大成功'),
        patch: DICE_CRITICAL
      },
      {
        id: 'coc7Failure', group: 'dice', system: 'coc7', label: T('失敗', 'Failure', '실패', '失败'),
        text: T('失敗', 'FAILURE', '실패', '失败'), subText: T('FAILURE', '', 'FAILURE', '失败'),
        patch: DICE_FAILURE
      },
      {
        id: 'coc7Fumble', group: 'dice', system: 'coc7', label: T('ファンブル', 'Fumble', '펌블', '大失败'),
        text: T('ファンブル', 'FUMBLE', '펌블', '大失败'), subText: T('FUMBLE', '', 'FUMBLE', '大失败'),
        patch: DICE_FUMBLE
      },
      {
        id: 'coc7SanRoll', group: 'dice', system: 'coc7', label: T('正気度ロール', 'Sanity Roll', '이성 판정', '理智检定'),
        text: T('正気度ロール', 'SANITY ROLL', '이성 판정', '理智检定'), subText: T('SANITY ROLL', '', 'SANITY ROLL', '理智检定'),
        patch: SAN_ROLL
      },
      {
        id: 'coc7SanCheck', group: 'dice', system: 'coc7', label: T('SANチェック', 'SAN Check', 'SAN 체크', 'SAN 检定'),
        text: T('SANチェック', 'SAN CHECK', 'SAN 체크', 'SAN 检定'), subText: T('SANITY CHECK', '', 'SANITY CHECK', '理智检定'),
        patch: SAN_CHECK
      },
      {
        id: 'emoSingle', group: 'dice', system: 'emoklore', label: T('シングル', 'Single', '싱글', '单重成功'),
        text: T('シングル', 'SINGLE', '싱글', '单重成功'), subText: T('SINGLE', '', 'SINGLE', '单重成功'),
        patch: DICE_SUCCESS
      },
      {
        id: 'emoDouble', group: 'dice', system: 'emoklore', label: T('ダブル', 'Double', '더블', '双重成功'),
        text: T('ダブル', 'DOUBLE', '더블', '双重成功'), subText: T('DOUBLE', '', 'DOUBLE', '双重成功'),
        patch: DICE_GOOD
      },
      {
        id: 'emoTriple', group: 'dice', system: 'emoklore', label: T('トリプル', 'Triple', '트리플', '三重成功'),
        text: T('トリプル', 'TRIPLE', '트리플', '三重成功'), subText: T('TRIPLE', '', 'TRIPLE', '三重成功'),
        patch: DICE_GREAT
      },
      {
        id: 'emoMiracle', group: 'dice', system: 'emoklore', label: T('ミラクル', 'Miracle', '미라클', '奇迹'),
        text: T('ミラクル', 'MIRACLE', '미라클', '奇迹'), subText: T('MIRACLE', '', 'MIRACLE', '奇迹'),
        patch: DICE_CRITICAL
      },
      {
        id: 'emoCatastrophe', group: 'dice', system: 'emoklore', label: T('カタストロフ', 'Catastrophe', '카타스트로프', '灾厄'),
        text: T('カタストロフ', 'CATASTROPHE', '카타스트로프', '灾厄'), subText: T('CATASTROPHE', '', 'CATASTROPHE', '灾厄'),
        patch: DICE_BEYOND
      },
      {
        id: 'emoFailure', group: 'dice', system: 'emoklore', label: T('失敗', 'Failure', '실패', '失败'),
        text: T('失敗', 'FAILURE', '실패', '失败'), subText: T('FAILURE', '', 'FAILURE', '失败'),
        patch: DICE_FAILURE
      },
      {
        id: 'emoFumble', group: 'dice', system: 'emoklore', label: T('ファンブル', 'Fumble', '펌블', '大失败'),
        text: T('ファンブル', 'FUMBLE', '펌블', '大失败'), subText: T('FUMBLE', '', 'FUMBLE', '大失败'),
        patch: DICE_FUMBLE
      },
      {
        id: 'emoResonance', group: 'dice', system: 'emoklore', label: T('共鳴判定', 'Resonance Check', '공명 판정', '共鸣判定'),
        text: T('共鳴判定', 'RESONANCE CHECK', '공명 판정', '共鸣判定'), subText: T('RESONANCE CHECK', '', 'RESONANCE CHECK', '共鸣判定'),
        patch: RESONANCE_CALL
      },
      {
        id: 'emoPossession', group: 'dice', system: 'emoklore', label: T('憑依判定', 'Possession Check', '빙의 판정', '凭依判定'),
        text: T('憑依判定', 'POSSESSION CHECK', '빙의 판정', '凭依判定'), subText: T('POSSESSION CHECK', '', 'POSSESSION CHECK', '凭依判定'),
        patch: CHECK_CALL
      },
      {
        id: 'dxOpening', group: 'dice', system: 'dx', label: T('オープニング', 'Opening', '오프닝', '开场阶段'),
        text: T('オープニングフェイズ', 'OPENING PHASE', '오프닝 페이즈', '开场阶段'), subText: T('OPENING PHASE', '', 'OPENING PHASE', '开场阶段'),
        patch: PHASE_TITLE
      },
      {
        id: 'dxMiddle', group: 'dice', system: 'dx', label: T('ミドルフェイズ', 'Middle', '미들 페이즈', '中盘阶段'),
        text: T('ミドルフェイズ', 'MIDDLE PHASE', '미들 페이즈', '中盘阶段'), subText: T('MIDDLE PHASE', '', 'MIDDLE PHASE', '中盘阶段'),
        patch: PHASE_TITLE
      },
      {
        id: 'dxClimax', group: 'dice', system: 'dx', label: T('クライマックス', 'Climax', '클라이맥스', '高潮阶段'),
        text: T('クライマックスフェイズ', 'CLIMAX PHASE', '클라이맥스 페이즈', '高潮阶段'), subText: T('CLIMAX PHASE', '', 'CLIMAX PHASE', '高潮阶段'),
        patch: PHASE_TITLE
      },
      {
        id: 'dxEnding', group: 'dice', system: 'dx', label: T('エンディング', 'Ending', '엔딩', '结局阶段'),
        text: T('エンディングフェイズ', 'ENDING PHASE', '엔딩 페이즈', '结局阶段'), subText: T('ENDING PHASE', '', 'ENDING PHASE', '结局阶段'),
        patch: PHASE_TITLE
      }
    ],
    trailer: [
      {
        // 見本はシャーロック・ホームズの有名な一節（不可能を消去して残ったものが真実）のもじり
        id: 'cinematic', icon: 'play', label: T('シネマティック', 'Cinematic', '시네마틱', '电影风格'),
        text: T('ありえないものを消し去ったとき――\n残ったのは、この世ならざる真実だった。', 'Eliminate the impossible —\nand whatever remains is not of this world.', '불가능한 것을 모두 지웠을 때――\n남은 것은, 이 세상의 것이 아닌 진실이었다.', '当所有不可能之事被排除——\n剩下的，竟是不属于这个世界的真相。'),
        patch: {
          fontId: 'shippori-mincho', weight: 700, fontSize: 46, lineHeight: 1.9, letterSpacing: 0.08,
          fill: { type: 'solid', color: '#f5f0e6' }, stroke: { on: false }, stroke2: { on: false },
          shadow: { on: true, color: '#000000', opacity: 0.85, blur: 10, x: 0, y: 3 },
          glow: { on: true, color: '#8fb0ff', size: 18, strength: 0.6 },
          bg: { type: 'none' },
          reveal: 'char', cps: 12, glyphDur: 0.5, inFx: 'blurIn', hold: 1.6, outFx: 'fade', outDur: 0.8, wrapChars: 26, cursor: false
        }
      },
      {
        // 1文字ずつ画面の中央に大きく打ち出し、最後にタイトル全体をドンと出す（アニメのサブタイトル風）
        id: 'typewriter', icon: 'typewriter', label: T('タイプライター', 'Typewriter', '타자기', '打字机'),
        text: T('霧の館の殺人', 'THE MISTY MANOR MURDER', '안개 저택 살인사건', '迷雾庄园谋杀案'),
        patch: {
          fontId: 'special-elite', weight: 400, fontSize: 120, lineHeight: 1.5, letterSpacing: 0.08, align: 'center',
          // 同じ色の細い縁取りで、打ち込んだ活字のように少し太らせる
          fill: { type: 'solid', color: '#f6f4ee' },
          stroke: { on: true, width: 0.9, color: '#f6f4ee' }, stroke2: { on: false }, shadow: { on: false }, glow: { on: false },
          bg: { type: 'solid', color: '#000000', opacity: 1, sync: true },
          reveal: 'solo', cps: 8, soloSize: 0.65, soloPause: 0.6, soloImpact: 1, inFx: 'typewriter', wrapChars: 20,
          cursor: false, hold: 2.2, outFx: 'fade', outDur: 0.5
        }
      },
      {
        id: 'syslog', icon: 'terminal', label: T('システムログ', 'System Log', '시스템 로그', '系统日志'),
        text: T('20XX年 X月X日\n調査記録 No.13\n\n対象の館では、夜ごと同じ時刻に\nピアノの音が聞こえるという。', 'Date: 20XX / XX / XX\nInvestigation Log No.13\n\nEvery night at the same hour,\npiano music echoes through the mansion.', '20XX년 X월 X일\n조사 기록 No.13\n\n그 저택에서는 매일 밤 같은 시각에\n피아노 소리가 들린다고 한다.', '20XX 年 X 月 X 日\n调查记录 No.13\n\n据说每晚同一时刻，\n庄园里都会传来钢琴声。'),
        patch: {
          fontId: 'dotgothic16', weight: 400, fontSize: 40, lineHeight: 1.7, letterSpacing: 0.06, align: 'start',
          fill: { type: 'solid', color: '#d9ffe0' }, stroke: { on: false }, stroke2: { on: false },
          shadow: { on: false }, glow: { on: true, color: '#3cff7a', size: 14, strength: 0.7 },
          bg: { type: 'solid', color: '#000000', opacity: 0.55, sync: true },
          reveal: 'char', cps: 16, glyphDur: 0, inFx: 'typewriter', cursor: true, hold: 1.5, outFx: 'fade', outDur: 0.5, wrapChars: 26
        }
      },
      {
        id: 'lines', icon: 'rise', label: T('1行ずつ浮上', 'Line by Line', '한 줄씩 떠오름', '逐行浮现'),
        text: T('失われた記憶を辿り、\n彼らは再びあの村へ向かう。\n\n霧の向こうで、\n何かが目を覚まそうとしていた。', 'Following their lost memories,\nthey return to that village once more.\n\nBeyond the fog,\nsomething was about to awaken.', '잃어버린 기억을 따라,\n그들은 다시 그 마을로 향한다.\n\n안개 너머에서,\n무언가가 깨어나려 하고 있었다.', '循着失落的记忆，\n他们再次走向那个村庄。\n\n迷雾的另一边，\n某种存在即将苏醒。'),
        patch: {
          fontId: 'noto-serif-jp', weight: 700, fontSize: 48, lineHeight: 1.9, letterSpacing: 0.1,
          fill: { type: 'solid', color: '#ffffff' }, stroke: { on: false }, stroke2: { on: false },
          shadow: { on: true, color: '#000000', opacity: 0.9, blur: 12, x: 0, y: 3 },
          bg: { type: 'none' },
          reveal: 'line', lineInterval: 1.1, glyphDur: 0.9, inFx: 'rise', hold: 1.6, outFx: 'fade', outDur: 0.7
        }
      },
      {
        id: 'sweep', icon: 'wave', label: T('流れるように', 'Smooth Sweep', '흐르듯이', '平滑流动'),
        text: T('ここから先は、帰り道のない物語。\nそれでも、扉を開けますか。', 'Beyond this point lies a story with no way back.\nWill you still open the door?', '이 앞은, 돌아갈 길이 없는 이야기.\n그래도, 문을 열겠습니까.', '从此处开始，是无法回头的故事。\n即便如此，你仍要推开这扇门吗？'),
        patch: {
          fontId: 'zen-old-mincho', weight: 700, fontSize: 50, lineHeight: 1.9, letterSpacing: 0.12,
          fill: { type: 'solid', color: '#f3eee4' }, stroke: { on: false }, stroke2: { on: false },
          shadow: { on: true, color: '#000000', opacity: 0.85, blur: 12, x: 0, y: 3 },
          glow: { on: true, color: '#ffffff', size: 16, strength: 0.4 },
          reveal: 'sweep', sweepDur: 1.5, lineInterval: 1.4, glyphDur: 0.5, inFx: 'fade', hold: 1.8, outFx: 'fade', outDur: 0.9
        }
      },
      {
        // 文章の文字が中央で重なって現れ、扉が開くように左右へ広がって一文になる
        id: 'spread', icon: 'spreadOut', label: T('中央から左右', 'Center Spread', '중앙에서 좌우로', '从中心展开'),
        text: T('閉ざされた扉が、いま開かれる。', 'The sealed door now swings open.', '닫혀 있던 문이, 지금 열린다.', '紧闭的门，此刻缓缓开启。'),
        patch: {
          fontId: 'shippori-mincho-b1', weight: 800, fontSize: 64, lineHeight: 1.7, letterSpacing: 0.14,
          fill: { type: 'solid', color: '#f5efe3' }, stroke: { on: false }, stroke2: { on: false },
          shadow: { on: true, color: '#000000', opacity: 0.85, blur: 12, x: 0, y: 3 },
          glow: { on: true, color: '#ffd9a0', size: 20, strength: 0.5 },
          bg: { type: 'none' },
          reveal: 'spread', spreadHold: 0.5, spreadDur: 0.9, inFx: 'fade', hold: 2, outFx: 'fade', outDur: 0.8
        }
      },
      {
        // 全文をぼかしから一度に浮かび上がらせる（ポスターのキャッチコピーのように）
        id: 'allAtOnce', icon: 'textAll', label: T('全文同時表示', 'All at Once', '전문 동시 표시', '同时显示全文'),
        text: T('真実は、いつも霧の向こうにある。\n――さあ、探索を始めよう。', 'The truth always lies beyond the fog.\n— Now, let the investigation begin.', '진실은 언제나 안개 너머에 있다.\n――자, 탐색을 시작하자.', '真相，总在迷雾的另一边。\n——来吧，开始探索。'),
        patch: {
          fontId: 'zen-old-mincho', weight: 700, fontSize: 52, lineHeight: 1.9, letterSpacing: 0.12,
          fill: { type: 'solid', color: '#f2f5fa' }, stroke: { on: false }, stroke2: { on: false },
          shadow: { on: true, color: '#000000', opacity: 0.85, blur: 12, x: 0, y: 3 },
          glow: { on: true, color: '#a9c4ff', size: 18, strength: 0.5 },
          reveal: 'all', glyphDur: 1.4, inFx: 'blurIn', hold: 2.4, outFx: 'fade', outDur: 0.9
        }
      },
      {
        id: 'credits', icon: 'reel', label: T('エンドロール', 'End Credits', '엔드 롤', '片尾字幕'),
        text: T('STAFF\n\nシナリオ\n〇〇〇〇\n\nゲームマスター\n〇〇〇〇\n\n探索者\n〇〇〇〇\n〇〇〇〇\n〇〇〇〇\n\nThank you for playing!', 'STAFF\n\nScenario\n〇〇〇〇\n\nGame Master\n〇〇〇〇\n\nInvestigators\n〇〇〇〇\n〇〇〇〇\n〇〇〇〇\n\nThank you for playing!', 'STAFF\n\n시나리오\n〇〇〇〇\n\n게임 마스터\n〇〇〇〇\n\n탐사자\n〇〇〇〇\n〇〇〇〇\n〇〇〇〇\n\nThank you for playing!', '制作人员\n\n模组\n〇〇〇〇\n\n主持人\n〇〇〇〇\n\n调查员\n〇〇〇〇\n〇〇〇〇\n〇〇〇〇\n\n感谢游玩！'),
        patch: {
          fontId: 'noto-serif-jp', weight: 700, fontSize: 40, lineHeight: 1.8, letterSpacing: 0.12,
          fill: { type: 'solid', color: '#ffffff' }, stroke: { on: false }, stroke2: { on: false },
          shadow: { on: true, color: '#000000', opacity: 0.9, blur: 10, x: 0, y: 3 },
          reveal: 'scroll', scrollSpeed: 80, scrollFade: true, inFx: 'fade', hold: 0, startDelay: 0, endDelay: 0
        }
      }
    ],
    caption: [
      {
        id: 'converge', icon: 'converge', label: T('上下から合流', 'Converge', '위아래에서 합류', '上下汇合'),
        text: T('保健室', 'Infirmary', '보건실', '医务室'), subText: T('放課後 16:30', 'After School — 4:30 PM', '방과 후 16:30', '放学后 16:30'),
        patch: {
          fontId: 'noto-serif-jp', weight: 700, fontSize: 110, letterSpacing: 0.2,
          subFontId: 'same', subWeight: 400, subSize: 0.3, subLetterSpacing: 0.2, subGap: 0.35,
          fill: { type: 'solid', color: '#ffffff' }, stroke: { on: false }, stroke2: { on: false },
          shadow: { on: true, color: '#000000', opacity: 0.85, blur: 14, x: 0, y: 4 },
          deco: { type: 'sides', color2: '#ffffff', pad: 0.45, extend: 1.2, thickness: 2, anim: 'grow', dur: 0.7 },
          inFx: 'converge', inDur: 0.9, inStagger: 0.12, hold: 1.6, outFx: 'fade', outDur: 0.7, subFx: 'fade', subDelay: -0.3
        }
      },
      {
        id: 'float', icon: 'floatUp', label: T('浮かび上がる', 'Float Up', '떠오르기', '向上浮现'),
        text: T('旧校舎 三階', 'Old Building, 3F', '구교사 3층', '旧校舍 三楼'), subText: T('PM 7:45', '7:45 PM', 'PM 7:45', '晚上 7:45'),
        patch: {
          fontId: 'zen-kaku-gothic-new', weight: 700, fontSize: 96, letterSpacing: 0.14,
          subFontId: 'same', subWeight: 400, subSize: 0.32, subLetterSpacing: 0.3,
          fill: { type: 'solid', color: '#f2f6ff' }, stroke: { on: false }, stroke2: { on: false },
          shadow: { on: true, color: '#000000', opacity: 0.8, blur: 14, x: 0, y: 4 },
          glow: { on: true, color: '#9cc2ff', size: 22, strength: 0.6 },
          inFx: 'rise', inDur: 1.0, inStagger: 0.07, hold: 1.6, outFx: 'rise', outDur: 0.8, outStagger: 0.04, subFx: 'fade'
        }
      },
      {
        id: 'cinema', icon: 'spacing', label: T('字間シネマ', 'Cinematic Tracking', '자간 시네마', '电影感字距'),
        text: T('TOKYO', 'TOKYO', 'TOKYO', '东京'), subText: T('2026.10.31 23:59', '2026.10.31 23:59', '2026.10.31 23:59', '2026.10.31 23:59'),
        patch: {
          fontId: 'cinzel', weight: 700, fontSize: 120, letterSpacing: 0.45,
          subFontId: 'same', subWeight: 400, subSize: 0.22, subLetterSpacing: 0.6,
          fill: { type: 'solid', color: '#ffffff' }, stroke: { on: false }, stroke2: { on: false },
          shadow: { on: true, color: '#000000', opacity: 0.7, blur: 14, x: 0, y: 4 },
          glow: { on: true, color: '#ffffff', size: 20, strength: 0.35 },
          inFx: 'tracking', inDur: 1.6, hold: 1.4, outFx: 'tracking', outDur: 1.2, subFx: 'fade', subDelay: -0.6
        }
      },
      {
        id: 'clock', icon: 'stopwatch', label: T('時刻表示', 'Time Stamp', '시각 표시', '时间显示'),
        text: T('23:59', '23:59', '23:59', '23:59'), subText: T('2026.10.31 SAT', '2026.10.31 SAT', '2026.10.31 SAT', '2026.10.31 周六'),
        patch: {
          fontId: 'orbitron', weight: 700, fontSize: 130, letterSpacing: 0.12,
          subFontId: 'same', subWeight: 400, subSize: 0.2, subLetterSpacing: 0.4,
          fill: { type: 'solid', color: '#dff9ff' }, stroke: { on: false }, stroke2: { on: false },
          shadow: { on: false }, glow: { on: true, color: '#3ad7ff', size: 30, strength: 1 },
          deco: { type: 'corners', color2: '#8feaff', pad: 0.4, thickness: 3, anim: 'grow', dur: 0.5 },
          inFx: 'flicker', inDur: 0.8, inStagger: 0.05, hold: 2, outFx: 'flicker', outDur: 0.6, subFx: 'fade'
        }
      },
      {
        id: 'underline', icon: 'underline', label: T('下線スライド（左下）', 'Underline (Bottom Left)', '밑줄 슬라이드 (왼쪽 아래)', '下划线滑入（左下）'),
        text: T('図書室', 'Library', '도서실', '图书室'), subText: T('午後 5時12分', '5:12 PM', '오후 5시 12분', '下午 5:12'),
        patch: {
          anchor: 'bl', align: 'start', marginX: 72, marginY: 64,
          fontId: 'noto-sans-jp', weight: 900, fontSize: 84, letterSpacing: 0.12,
          subFontId: 'same', subWeight: 400, subSize: 0.36, subLetterSpacing: 0.15, subGap: 0.45,
          fill: { type: 'solid', color: '#ffffff' }, stroke: { on: false }, stroke2: { on: false },
          shadow: { on: true, color: '#000000', opacity: 0.8, blur: 10, x: 0, y: 3 },
          deco: { type: 'underline', color2: '#ffffff', pad: 0.2, extend: 0.3, thickness: 3, anim: 'grow', dur: 0.7 },
          inFx: 'slide', inDir: 'left', inDur: 0.7, inStagger: 0.05, hold: 1.8, outFx: 'fade', outDur: 0.6, subFx: 'fade'
        }
      },
      {
        id: 'vertical', icon: 'vertical', label: T('縦書き（右上）', 'Vertical (Top Right)', '세로쓰기 (오른쪽 위)', '竖排（右上）'),
        text: T('神社の境内', 'Shrine Grounds', '신사 경내', '神社境内'), subText: T('深夜 二時', '2:00 AM', '심야 2시', '凌晨两点'),
        patch: {
          writing: 'v', anchor: 'tr', align: 'start', marginX: 72, marginY: 56,
          fontId: 'shippori-mincho', weight: 800, fontSize: 90, letterSpacing: 0.1,
          subFontId: 'same', subWeight: 400, subSize: 0.36, subLetterSpacing: 0.15, subGap: 0.35,
          fill: { type: 'solid', color: '#f4f1ea' }, stroke: { on: false }, stroke2: { on: false },
          shadow: { on: true, color: '#000000', opacity: 0.85, blur: 12, x: 0, y: 3 },
          deco: { type: 'bar', color2: '#c9a24a', pad: 0.35, thickness: 3, anim: 'grow', dur: 0.6 },
          inFx: 'converge', inDur: 0.9, inStagger: 0.1, hold: 1.8, outFx: 'fade', outDur: 0.7, subFx: 'fade'
        }
      },
      {
        id: 'boxed', icon: 'frame', label: T('ボックス（左上）', 'Boxed (Top Left)', '박스 (왼쪽 위)', '方框（左上）'),
        text: T('第三研究棟 地下', 'Research Wing B1', '제3연구동 지하', '第三研究楼 地下'), subText: T('B1F ― 立入禁止区域', 'B1F — Restricted Area', 'B1F ― 출입 금지 구역', '地下一层 — 禁止入内'),
        patch: {
          anchor: 'tl', align: 'start', marginX: 56, marginY: 48,
          fontId: 'zen-kaku-gothic-new', weight: 700, fontSize: 64, letterSpacing: 0.08,
          subFontId: 'same', subWeight: 400, subSize: 0.42, subLetterSpacing: 0.12, subGap: 0.3,
          fill: { type: 'solid', color: '#ffffff' }, stroke: { on: false }, stroke2: { on: false },
          shadow: { on: false },
          deco: { type: 'box', color: '#05070c', opacity: 0.6, color2: '#8fd3ff', pad: 0.45, radius: 0.12, thickness: 0, anim: 'grow', dur: 0.5 },
          inFx: 'blurIn', inDur: 0.7, inStagger: 0.04, hold: 1.8, outFx: 'fade', outDur: 0.6, subFx: 'fade'
        }
      }

    ]
  };

  const MODE_DEFAULTS = {
    message: { mode: 'message', fontSize: 130 },
    trailer: { mode: 'trailer', fontSize: 46, lineHeight: 1.9, subText: '' },
    caption: { mode: 'caption', fontSize: 110 }
  };

  const STYLE_PRESETS = [
    { id: 'plain', label: T('白＋黒縁', 'White + Outline', '흰색＋검은 테두리', '白字黑边'), patch: {
      fill: { type: 'solid', color: '#ffffff' }, fillOpacity: 1, stroke: { on: true, width: 5, color: '#1b1b1f' }, stroke2: { on: false },
      shadow: { on: true, color: '#000000', opacity: 0.6, blur: 12, x: 0, y: 5 }, glow: { on: false } } },
    { id: 'gold', label: T('金', 'Gold', '금색', '金色'), patch: {
      fill: { type: 'gradient', color: '#fffbe6', color2: '#ffd257', color3: '#b8860b', dir: 'v' }, fillOpacity: 1,
      stroke: { on: true, width: 4, color: '#3b2500' }, stroke2: { on: true, width: 5, color: '#fff3c4' },
      shadow: { on: true, color: '#000000', opacity: 0.6, blur: 14, x: 0, y: 6 }, glow: { on: true, color: '#ffd257', size: 34, strength: 1 } } },
    { id: 'silver', label: T('銀', 'Silver', '은색', '银色'), patch: {
      fill: { type: 'gradient', color: '#ffffff', color2: '#dfe6ee', color3: '#8f9cab', dir: 'v' }, fillOpacity: 1,
      stroke: { on: true, width: 3, color: '#1d2430' }, stroke2: { on: false },
      shadow: { on: true, color: '#000000', opacity: 0.6, blur: 12, x: 0, y: 4 }, glow: { on: true, color: '#bcd7ff', size: 22, strength: 0.8 } } },
    { id: 'blood', label: T('血', 'Blood', '피', '血色'), patch: {
      fill: { type: 'gradient', color: '#ff6a6a', color2: '#b30000', color3: '#4a0000', dir: 'v' }, fillOpacity: 1,
      stroke: { on: true, width: 3, color: '#1a0000' }, stroke2: { on: false },
      shadow: { on: true, color: '#000000', opacity: 0.85, blur: 20, x: 0, y: 6 }, glow: { on: true, color: '#ff1a1a', size: 40, strength: 1.1 } } },
    { id: 'neon', label: T('ネオン', 'Neon', '네온', '霓虹'), patch: {
      fill: { type: 'solid', color: '#f4fdff' }, fillOpacity: 1, stroke: { on: true, width: 2, color: '#00c8ff' }, stroke2: { on: false },
      shadow: { on: false }, glow: { on: true, color: '#00d9ff', size: 34, strength: 1.6 } } },
    { id: 'eerie', label: T('怪しい紫', 'Eerie Purple', '수상한 보라', '诡秘紫'), patch: {
      fill: { type: 'solid', color: '#ece6ff' }, fillOpacity: 1, stroke: { on: true, width: 3, color: '#12002a' }, stroke2: { on: false },
      shadow: { on: true, color: '#000000', opacity: 0.7, blur: 16, x: 0, y: 5 }, glow: { on: true, color: '#8a4dff', size: 36, strength: 1.2 } } },
    { id: 'pop', label: T('ポップ', 'Pop', '팝', '活泼'), patch: {
      fill: { type: 'gradient', color: '#fffbd1', color2: '#ffe14d', color3: '#ff9d00', dir: 'v' }, fillOpacity: 1,
      stroke: { on: true, width: 7, color: '#6a2c00' }, stroke2: { on: true, width: 6, color: '#ffffff' },
      shadow: { on: true, color: '#000000', opacity: 0.5, blur: 8, x: 0, y: 6 }, glow: { on: false } } },
    { id: 'ghost', label: T('ゴースト', 'Ghost', '고스트', '幽灵'), patch: {
      fill: { type: 'solid', color: '#e9f3ff' }, fillOpacity: 0.85, stroke: { on: false }, stroke2: { on: false },
      shadow: { on: false }, glow: { on: true, color: '#9fd4ff', size: 30, strength: 1.2 } } },
    { id: 'ink', label: T('墨（明るい背景用）', 'Ink (for light BG)', '먹 (밝은 배경용)', '墨色（适合浅色背景）'), patch: {
      fill: { type: 'solid', color: '#141414' }, fillOpacity: 1, stroke: { on: false }, stroke2: { on: false },
      shadow: { on: true, color: '#ffffff', opacity: 0.8, blur: 10, x: 0, y: 0 }, glow: { on: false } } },
    { id: 'hollow', label: T('白抜き', 'Hollow', '속이 빈 글자', '空心字'), patch: {
      fill: { type: 'solid', color: '#ffffff' }, fillOpacity: 0, stroke: { on: true, width: 3, color: '#ffffff' }, stroke2: { on: false },
      shadow: { on: true, color: '#000000', opacity: 0.6, blur: 10, x: 0, y: 3 }, glow: { on: false } } }
  ];

  const GRADIENT_PRESETS = [
    { id: 'gold', colors: ['#fffbe6', '#ffd257', '#b8860b'] },
    { id: 'silver', colors: ['#ffffff', '#dfe6ee', '#8f9cab'] },
    { id: 'fire', colors: ['#ffffff', '#ffd76a', '#ff8a00'] },
    { id: 'ruby', colors: ['#ff9a9a', '#e0102f', '#5a0010'] },
    { id: 'sapphire', colors: ['#e6f4ff', '#58a6ff', '#1b3a8a'] },
    { id: 'emerald', colors: ['#eafff2', '#3ddc84', '#0b5e36'] },
    { id: 'violet', colors: ['#f3e8ff', '#b07cff', '#4b1d8f'] },
    { id: 'sunset', colors: ['#ffe29a', '#ff7a59', '#a4133c'] },
    { id: 'ice', colors: ['#ffffff', '#bdefff', '#4fb3d9'] },
    { id: 'sakura', colors: ['#ffffff', '#ffc4dd', '#ff6fa8'] }
  ];

  const SIZE_PRESETS = [
    { id: '1920x1080', w: 1920, h: 1080, label: T('1920 × 1080（16:9 FHD）', '1920 × 1080 (16:9 FHD)', '1920 × 1080 (16:9 FHD)', '1920 × 1080（16:9 全高清）') },
    { id: '1280x720', w: 1280, h: 720, label: T('1280 × 720（16:9 HD）', '1280 × 720 (16:9 HD)', '1280 × 720 (16:9 HD)', '1280 × 720（16:9 高清）') },
    { id: '960x540', w: 960, h: 540, label: T('960 × 540（16:9 軽量）', '960 × 540 (16:9 light)', '960 × 540 (16:9 경량)', '960 × 540（16:9 小体积）') },
    { id: '1280x360', w: 1280, h: 360, label: T('1280 × 360（横長の帯）', '1280 × 360 (wide strip)', '1280 × 360 (가로로 긴 띠)', '1280 × 360（宽条幅）') },
    { id: '1024x256', w: 1024, h: 256, label: T('1024 × 256（テロップ帯）', '1024 × 256 (caption strip)', '1024 × 256 (자막 띠)', '1024 × 256（字幕条）') },
    { id: '1080x1080', w: 1080, h: 1080, label: T('1080 × 1080（正方形）', '1080 × 1080 (square)', '1080 × 1080 (정사각형)', '1080 × 1080（正方形）') },
    { id: '720x1280', w: 720, h: 1280, label: T('720 × 1280（縦長 9:16）', '720 × 1280 (portrait 9:16)', '720 × 1280 (세로 9:16)', '720 × 1280（竖版 9:16）') },
    { id: 'custom', w: 0, h: 0, label: T('カスタム', 'Custom', '사용자 지정', '自定义') }
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isPlainObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
  }

  function deepMerge(target, patch) {
    Object.keys(patch || {}).forEach(key => {
      const value = patch[key];
      if (isPlainObject(value) && isPlainObject(target[key])) deepMerge(target[key], value);
      else target[key] = clone(value);
    });
    return target;
  }

  function defaultScene(mode, lang) {
    const scene = deepMerge(clone(BASE), MODE_DEFAULTS[mode] || {});
    const first = (TEMPLATES[mode] || [])[0];
    if (first) applyTemplate(scene, first, lang);
    return scene;
  }

  // テンプレートの見本の文章（key: 'text' / 'subText'）
  function sampleText(template, key, lang) {
    const value = template[key];
    return value ? (value[lang] ?? value.en ?? value.ja) : '';
  }

  // テンプレートはスタイル・動き・文章を初期値から組み立て直す（書き換えた文章を戻すのは呼び出し側）
  function applyTemplate(scene, template, lang) {
    const keep = { width: scene.width, height: scene.height, sizePreset: scene.sizePreset, outEnabled: scene.outEnabled };
    const fresh = deepMerge(deepMerge(clone(BASE), MODE_DEFAULTS[scene.mode] || {}), template.patch);
    Object.keys(scene).forEach(key => delete scene[key]);
    Object.assign(scene, fresh);
    scene.width = keep.width || fresh.width;
    scene.height = keep.height || fresh.height;
    scene.sizePreset = keep.sizePreset || fresh.sizePreset;
    scene.templateId = template.id;
    // 退場の有無は利用者の選択なので、テンプレートを切り替えても引き継ぐ
    if (!('outEnabled' in template.patch)) scene.outEnabled = keep.outEnabled !== false;
    scene.text = sampleText(template, 'text', lang);
    scene.subText = sampleText(template, 'subText', lang);
    return scene;
  }

  // テンプレートの書き出しのループの初期値（'once' / 'infinite'）
  function exportLoop(template) {
    return (template && (template.loop || LOOP_BY_GROUP[template.group])) || 'once';
  }

  // 文章・サブテキストが、いずれかのテンプレートの見本のままか（書き換えた文章を覚える仕組みより前の保存データの引き継ぎに使う）
  function sampleState(mode, text, subText) {
    const texts = new Set();
    const subs = new Set();
    (TEMPLATES[mode] || []).forEach(tpl => ['ja', 'en', 'ko', 'zh'].forEach(lang => {
      if (tpl.text && tpl.text[lang]) texts.add(tpl.text[lang]);
      if (tpl.subText && tpl.subText[lang]) subs.add(tpl.subText[lang]);
    }));
    const main = !String(text || '').trim() || texts.has(text);
    const sub = subs.has(subText) || (!String(subText || '').trim() && main);
    return { main, sub };
  }

  root.TextApngPresets = {
    BASE,
    TEMPLATES,
    TEMPLATE_GROUPS,
    MODE_DEFAULTS,
    STYLE_PRESETS,
    GRADIENT_PRESETS,
    SIZE_PRESETS,
    clone,
    deepMerge,
    defaultScene,
    applyTemplate,
    sampleText,
    sampleState,
    exportLoop
  };
})(window);
