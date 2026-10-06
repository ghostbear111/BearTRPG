/*
 * 文字画像APNGメーカー — 設定パネル（宣言的なスキーマからUIを生成）
 */
(function (root) {
  'use strict';

  const E = root.TextApngEngine;
  const F = root.TextApngFonts;
  const P = root.TextApngPresets;
  const T = (ja, en, ko, zh) => ({ ja, en, ko, zh });

  /* ---------- 効果名 ---------- */

  const FX_LABELS = {
    in: {
      fade: T('フェード', 'Fade', '페이드', '淡入淡出'),
      rise: T('浮かび上がる', 'Rise', '떠오르기', '浮现'),
      drop: T('降りてくる', 'Drop', '내려오기', '落下'),
      converge: T('上下から合流', 'Converge', '위아래에서 합류', '上下汇合'),
      slide: T('スライド', 'Slide', '슬라이드', '滑动'),
      tracking: T('字間が縮まる', 'Tracking in', '자간이 좁혀짐', '字距收拢'),
      spread: T('中央から左右に広がる', 'Spread from center', '중앙에서 좌우로 펼쳐짐', '从中心向两侧展开'),
      blurIn: T('ぼかし解除', 'Blur in', '흐림 해제', '由模糊变清晰'),
      pop: T('ポップ', 'Pop', '팝', '弹出'),
      shrinkIn: T('大きい所から', 'Shrink in', '크게 시작해 축소', '由大缩小'),
      spin: T('回転', 'Spin', '회전', '旋转'),
      flip: T('めくれる', 'Flip', '넘겨지기', '翻转'),
      bounce: T('落下バウンド', 'Bounce', '낙하 바운드', '弹跳'),
      scatter: T('集合', 'Assemble', '집합', '聚合'),
      typewriter: T('タイプライター', 'Typewriter', '타자기', '打字机'),
      flicker: T('明滅', 'Flicker', '명멸', '闪烁'),
      slam: T('叩きつけ', 'Slam', '내리치기', '砸入'),
      zoomIn: T('迫ってくる', 'Zoom in', '다가오기', '迎面放大'),
      emerge: T('奥から現れる', 'Emerge', '안쪽에서 나타나기', '从远处浮现'),
      wipe: T('ワイプ', 'Wipe', '와이프', '擦除'),
      shutter: T('展開', 'Unfold', '펼치기', '展开'),
      glitch: T('グリッチ', 'Glitch', '글리치', '故障效果'),
      flash: T('閃光', 'Flash', '섬광', '闪光')
    },
    out: {
      none: T('消さない', 'Keep', '지우지 않음', '保留'),
      fade: T('フェード', 'Fade', '페이드', '淡入淡出'),
      rise: T('上へ消える', 'Float away', '위로 사라짐', '向上飘走'),
      sink: T('下へ沈む', 'Sink', '아래로 가라앉음', '向下沉没'),
      diverge: T('上下に分かれる', 'Diverge', '위아래로 갈라짐', '上下分离'),
      slide: T('スライド', 'Slide', '슬라이드', '滑动'),
      tracking: T('字間が広がる', 'Tracking out', '자간이 넓어짐', '字距展开'),
      blurOut: T('ぼやける', 'Blur out', '흐려짐', '逐渐模糊'),
      growOut: T('膨らんで消える', 'Grow out', '부풀며 사라짐', '放大消失'),
      shrink: T('縮んで消える', 'Shrink', '줄어들며 사라짐', '缩小消失'),
      scatter: T('飛び散る', 'Scatter', '흩어짐', '飞散'),
      erase: T('1文字ずつ消去', 'Erase', '한 글자씩 지우기', '逐字删除'),
      flicker: T('明滅', 'Flicker', '명멸', '闪烁'),
      zoomThrough: T('迫って消える', 'Zoom through', '다가오며 사라짐', '迎面穿过'),
      recede: T('遠ざかる', 'Recede', '멀어짐', '远去'),
      wipe: T('ワイプ', 'Wipe', '와이프', '擦除'),
      shutter: T('閉じる', 'Fold', '닫기', '合拢'),
      glitch: T('グリッチ', 'Glitch', '글리치', '故障效果')
    },
    hold: {
      none: T('なし', 'None', '없음', '无'),
      float: T('ふわふわ', 'Float', '둥실둥실', '漂浮'),
      wave: T('波打つ', 'Wave', '물결', '波浪'),
      pulse: T('鼓動', 'Heartbeat', '고동', '心跳'),
      shake: T('震え', 'Tremble', '떨림', '颤抖'),
      glow: T('発光の明滅', 'Glow pulse', '발광 명멸', '光晕呼吸'),
      flicker: T('ちらつき', 'Flicker', '깜박거림', '闪烁'),
      blink: T('点滅', 'Blink', '점멸', '明灭'),
      glitch: T('時々ノイズ', 'Glitch bursts', '가끔 노이즈', '间歇故障')
    }
  };

  const OPT = {
    order: [
      { value: 'forward', label: T('先頭から', 'From the start', '처음부터', '从开头') },
      { value: 'reverse', label: T('末尾から', 'From the end', '끝에서부터', '从末尾') },
      { value: 'center', label: T('中央から', 'From the center', '중앙에서부터', '从中心') },
      { value: 'edges', label: T('両端から', 'From the edges', '양 끝에서부터', '从两端') },
      { value: 'random', label: T('ランダム', 'Random', '랜덤', '随机') }
    ],
    ease: [
      { value: 'auto', label: T('おまかせ', 'Auto', '자동', '自动') },
      { value: 'out', label: T('減速', 'Ease out', '감속', '减速') },
      { value: 'strong', label: T('強い減速', 'Strong ease out', '강한 감속', '强力减速') },
      { value: 'smooth', label: T('なめらか', 'Smooth', '부드럽게', '平滑') },
      { value: 'back', label: T('行き過ぎて戻る', 'Back', '지나쳤다 돌아옴', '回弹') },
      { value: 'elastic', label: T('バネ', 'Elastic', '스프링', '弹簧') },
      { value: 'bounce', label: T('バウンド', 'Bounce', '바운드', '弹跳') },
      { value: 'linear', label: T('一定', 'Linear', '일정', '匀速') },
      { value: 'in', label: T('加速', 'Ease in', '가속', '加速') }
    ],
    dirs: {
      left: T('左', 'Left', '왼쪽', '左'), right: T('右', 'Right', '오른쪽', '右'), up: T('上', 'Up', '위', '上'), down: T('下', 'Down', '아래', '下'),
      lr: T('左 → 右', 'Left → Right', '왼쪽 → 오른쪽', '左 → 右'), rl: T('右 → 左', 'Right → Left', '오른쪽 → 왼쪽', '右 → 左'), tb: T('上 → 下', 'Top → Bottom', '위 → 아래', '上 → 下'), bt: T('下 → 上', 'Bottom → Top', '아래 → 위', '下 → 上'),
      center: T('中央から', 'From center', '중앙에서', '从中心'), v: T('上下に', 'Vertical', '위아래로', '纵向'), h: T('左右に', 'Horizontal', '좌우로', '横向')
    },
    reveal: [
      { value: 'char', label: T('1文字ずつ', 'Per character', '한 글자씩', '逐字') },
      { value: 'solo', label: T('中央に1文字ずつ', 'Per character at center', '중앙에 한 글자씩', '在中心逐字显示') },
      { value: 'spread', label: T('中央から左右に広がる', 'Spread from center', '중앙에서 좌우로 펼쳐짐', '从中心向两侧展开') },
      { value: 'line', label: T('1行ずつ', 'Per line', '한 줄씩', '逐行') },
      { value: 'sweep', label: T('なめらかに流れる', 'Smooth sweep', '부드럽게 흐름', '平滑流动') },
      { value: 'all', label: T('全体を同時に', 'All at once', '전체를 동시에', '同时显示全文') },
      { value: 'scroll', label: T('スクロール', 'Scroll', '스크롤', '滚动') }
    ],
    subFx: [
      { value: 'same', label: T('メインと同じ', 'Same as main', '메인과 같음', '与主文本相同') },
      { value: 'fade', label: T('フェード', 'Fade', '페이드', '淡入淡出') },
      { value: 'rise', label: T('浮かび上がる', 'Rise', '떠오르기', '浮现') },
      { value: 'blurIn', label: T('ぼかし解除', 'Blur in', '흐림 해제', '由模糊变清晰') },
      { value: 'tracking', label: T('字間が縮まる', 'Tracking in', '자간이 좁혀짐', '字距收拢') },
      { value: 'typewriter', label: T('タイプライター', 'Typewriter', '타자기', '打字机') },
      { value: 'slide', label: T('スライド', 'Slide', '슬라이드', '滑动') }
    ],
    deco: [
      { value: 'none', label: T('なし', 'None', '없음', '无') },
      { value: 'band', label: T('帯', 'Band', '띠', '背景条带') },
      { value: 'tape', label: T('虎柄テープ', 'Caution tape', '경고 테이프', '警戒带') },
      { value: 'box', label: T('ボックス', 'Box', '박스', '方框') },
      { value: 'frame', label: T('タイトル枠', 'Title frame', '타이틀 틀', '标题框') },
      { value: 'lines', label: T('上下ライン', 'Lines', '위아래 라인', '上下线条') },
      { value: 'underline', label: T('下線', 'Underline', '밑줄', '下划线') },
      { value: 'sides', label: T('サイドライン', 'Side lines', '사이드 라인', '两侧线条') },
      { value: 'bar', label: T('アクセントバー', 'Accent bar', '악센트 바', '强调竖线') },
      { value: 'corners', label: T('コーナー枠', 'Corners', '코너 틀', '四角边框') }
    ],
    decoAnim: [
      { value: 'grow', label: T('伸びる', 'Grow', '늘어나기', '伸展') },
      { value: 'fade', label: T('フェード', 'Fade', '페이드', '淡入淡出') },
      { value: 'none', label: T('なし', 'None', '없음', '无') }
    ],
    bg: [
      { value: 'none', label: T('なし（透明）', 'None (clear)', '없음 (투명)', '无（透明）') },
      { value: 'solid', label: T('単色', 'Solid', '단색', '纯色') },
      { value: 'vignette', label: T('ビネット', 'Vignette', '비네트', '暗角') },
      { value: 'bottom', label: T('下からグラデ', 'Bottom fade', '아래에서 그라데이션', '从下方渐变') },
      { value: 'top', label: T('上からグラデ', 'Top fade', '위에서 그라데이션', '从上方渐变') }
    ],
    writing: [
      { value: 'h', label: T('横書き', 'Horizontal', '가로쓰기', '横排') },
      { value: 'v', label: T('縦書き', 'Vertical', '세로쓰기', '竖排') }
    ],
    fillType: [
      { value: 'solid', label: T('単色', 'Solid', '단색', '纯色') },
      { value: 'gradient', label: T('グラデーション', 'Gradient', '그라데이션', '渐变') }
    ],
    gradDir: [
      { value: 'v', label: T('縦（1行ごと）', 'Vertical (per line)', '세로 (한 줄마다)', '纵向（逐行）') },
      { value: 'h', label: T('横（全体）', 'Horizontal (whole)', '가로 (전체)', '横向（整体）') },
      { value: 'd', label: T('斜め（全体）', 'Diagonal (whole)', '대각선 (전체)', '斜向（整体）') }
    ]
  };

  const FORMATS = {
    s: { digits: 2, suffix: T('秒', 's', '초', '秒') },
    sSigned: { digits: 2, suffix: T('秒', 's', '초', '秒') },
    px: { digits: 0, suffix: T('px', 'px', 'px', 'px') },
    pct: { digits: 0, suffix: T('%', '%', '%', '%'), mul: 100 },
    x: { digits: 2, suffix: T('倍', '×', '배', '倍') },
    em: { digits: 2, suffix: T('em', 'em', 'em', 'em') },
    cps: { digits: 0, suffix: T('字/秒', 'chars/s', '자/초', '字/秒') },
    pxs: { digits: 0, suffix: T('px/秒', 'px/s', 'px/초', 'px/秒') },
    chars: { digits: 0, suffix: T('字', 'chars', '자', '字') }
  };

  const isTrailer = s => s.mode === 'trailer';
  const notTrailer = s => s.mode !== 'trailer';
  const inDef = s => E.IN_MAP[s.inFx] || E.IN_MAP.fade;
  const outDef = s => E.OUT_MAP[s.outFx] || E.OUT_MAP.fade;
  const decoIs = (...types) => s => types.includes(s.deco.type);

  function fontWeightOptions(fontId) {
    const font = F.get(fontId) || F.get('noto-sans-jp');
    const names = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
    const zhNames = { 100: '极细', 200: '特细', 300: '细体', 400: '常规', 500: '中等', 600: '半粗', 700: '粗体', 800: '特粗', 900: '极粗' };
    return (font.weights || [400]).map(w => ({ value: w, label: T(`${w}（${names[w] || w}）`, `${w} (${names[w] || w})`, `${w} (${names[w] || w})`, `${w}（${zhNames[w] || w}）`) }));
  }

  function fontSelectOptions(includeSame) {
    const opts = [];
    if (includeSame) opts.push({ value: 'same', label: T('メインと同じ', 'Same as main', '메인과 같음', '与主文本相同') });
    F.CATEGORIES.forEach(cat => {
      const fonts = F.list().filter(f => f.cat === cat.id);
      if (!fonts.length) return;
      opts.push({ group: cat.label, options: fonts.map(f => ({ value: f.id, label: T(F.displayName(f, 'ja'), F.displayName(f, 'en'), F.displayName(f, 'ko'), F.displayName(f, 'zh')) })) });
    });
    return opts;
  }

  const SCHEMA = {
    text: [
      { type: 'textarea', bind: 'text', id: 'mainTextInput', label: s => (isTrailer(s) ? T('本文', 'Body text', '본문', '正文') : T('メインテキスト', 'Main text', '메인 텍스트', '主文本')), rows: s => (isTrailer(s) ? 8 : 2) },
      { type: 'note', when: isTrailer, text: T('改行はそのまま反映されます。何も書かない行（空行）でページを区切れます。', 'Line breaks are kept. A blank line starts a new page.', '줄바꿈은 그대로 반영됩니다. 아무것도 쓰지 않은 줄(빈 줄)로 페이지를 나눌 수 있습니다.', '保留输入的换行。空行可用于分页。') },
      { type: 'text', bind: 'subText', when: notTrailer, label: T('サブテキスト（任意）', 'Sub text (optional)', '서브 텍스트 (선택)', '副文本（可选）'), placeholder: T('例：BATTLE START ／ 放課後 16:30', 'e.g. BATTLE START / 4:30 PM', '예: BATTLE START / 방과 후 16:30', '例如：战斗开始 / 放学后 16:30') },
      { type: 'segment', bind: 'subPosition', when: notTrailer, label: T('サブテキストの位置', 'Sub text position', '서브 텍스트 위치', '副文本位置'),
        options: s => (s.writing === 'v'
          ? [{ value: 'above', label: T('右（前）', 'Right (before)', '오른쪽 (앞)', '右侧（前）') }, { value: 'below', label: T('左（後）', 'Left (after)', '왼쪽 (뒤)', '左侧（后）') }]
          : [{ value: 'above', label: T('上', 'Above', '위', '上方') }, { value: 'below', label: T('下', 'Below', '아래', '下方') }]) },
      { type: 'segment', bind: 'writing', label: T('書字方向', 'Writing direction', '쓰기 방향', '书写方向'), options: OPT.writing },
      { type: 'segment', bind: 'align', label: T('揃え', 'Alignment', '정렬', '对齐方式'),
        options: s => (s.writing === 'v'
          ? [{ value: 'start', label: T('上', 'Top', '위', '上') }, { value: 'center', label: T('中央', 'Center', '중앙', '居中') }, { value: 'end', label: T('下', 'Bottom', '아래', '下') }]
          : [{ value: 'start', label: T('左', 'Left', '왼쪽', '左') }, { value: 'center', label: T('中央', 'Center', '중앙', '居中') }, { value: 'end', label: T('右', 'Right', '오른쪽', '右') }]) },
      { type: 'range', bind: 'wrapChars', when: isTrailer, label: T('自動改行（1行の最大文字数・0で改行しない）', 'Auto wrap (max chars per line, 0 = off)', '자동 줄바꿈 (한 줄 최대 글자 수, 0이면 줄바꿈 안 함)', '自动换行（每行最多字数，0 为关闭）'), min: 0, max: 60, step: 1, format: 'chars' },
      { type: 'toggle', bind: 'pageSplit', when: s => isTrailer(s) && s.reveal !== 'scroll', label: T('空行でページを分ける', 'Split pages at blank lines', '빈 줄에서 페이지 나누기', '遇到空行时分页') },
      { type: 'toggle', bind: 'autoFit', label: T('はみ出す場合は自動で縮小する', 'Shrink automatically when the text overflows', '넘칠 경우 자동으로 축소', '文字超出画布时自动缩小') },
      { type: 'dynamicNote', key: 'autoFit' }
    ],
    font: [
      { type: 'fontPicker', bind: 'fontId', label: T('フォント', 'Font', '폰트', '字体') },
      { type: 'select', bind: 'weight', label: T('太さ', 'Weight', '굵기', '字重'), options: s => fontWeightOptions(s.fontId), numeric: true },
      { type: 'toggle', bind: 'italic', label: T('斜体（イタリック）にする', 'Italic', '기울임꼴(이탤릭)로 하기', '斜体') },
      { type: 'colors', items: [
        { bind: 'fill.color', label: s => (s.fill.type === 'gradient' ? T('文字の色1', 'Text color 1', '글자 색 1', '文字颜色 1') : T('文字の色', 'Text color', '글자 색', '文字颜色')) },
        { bind: 'fill.color2', label: T('文字の色2', 'Text color 2', '글자 색 2', '文字颜色 2'), when: s => s.fill.type === 'gradient' },
        { bind: 'fill.color3', label: T('文字の色3', 'Text color 3', '글자 색 3', '文字颜色 3'), when: s => s.fill.type === 'gradient', optional: true }
      ] },
      { type: 'note', text: T('グラデーション・縁取り・影は「装飾」タブで設定できます', 'Gradients, outlines and shadows are in the Style tab', '그라데이션·테두리·그림자는 「장식」 탭에서 설정할 수 있습니다', '渐变、描边和阴影可在“装饰”选项卡中设置') },
      { type: 'range', bind: 'fontSize', label: T('文字サイズ', 'Font size', '글자 크기', '字号'), min: 12, max: 400, step: 1, format: 'px' },
      { type: 'range', bind: 'letterSpacing', label: T('字間', 'Letter spacing', '자간', '字距'), min: -0.2, max: 1.2, step: 0.01, format: 'pct' },
      { type: 'range', bind: 'lineHeight', label: T('行間', 'Line height', '행간', '行距'), min: 0.9, max: 3.2, step: 0.05, format: 'x' },
      { type: 'heading', when: notTrailer, label: T('サブテキスト', 'Sub text', '서브 텍스트', '副文本') },
      { type: 'select', bind: 'subFontId', when: notTrailer, label: T('サブのフォント', 'Sub font', '서브 폰트', '副文本字体'), options: () => fontSelectOptions(true) },
      { type: 'select', bind: 'subWeight', when: notTrailer, label: T('サブの太さ', 'Sub weight', '서브 굵기', '副文本字重'), options: s => fontWeightOptions(s.subFontId === 'same' ? s.fontId : s.subFontId), numeric: true },
      { type: 'toggle', bind: 'subItalic', when: notTrailer, label: T('サブを斜体（イタリック）にする', 'Italic sub text', '서브를 기울임꼴(이탤릭)로 하기', '副文本使用斜体') },
      { type: 'toggle', bind: 'subColorOn', when: notTrailer, label: T('サブテキストを別の色にする', 'Different color for sub text', '서브 텍스트를 다른 색으로 하기', '为副文本单独设置颜色') },
      { type: 'colors', when: s => notTrailer(s) && s.subColorOn, items: [{ bind: 'subColor', label: T('サブの色', 'Sub text color', '서브 색', '副文本颜色') }] },
      { type: 'range', bind: 'subSize', when: notTrailer, label: T('サブの大きさ（メイン比）', 'Sub size (vs. main)', '서브 크기 (메인 대비)', '副文本大小（相对于主文本）'), min: 0.1, max: 0.9, step: 0.01, format: 'pct' },
      { type: 'range', bind: 'subLetterSpacing', when: notTrailer, label: T('サブの字間', 'Sub letter spacing', '서브 자간', '副文本字距'), min: -0.2, max: 1.5, step: 0.01, format: 'pct' },
      { type: 'range', bind: 'subGap', when: notTrailer, label: T('メインとの間隔', 'Gap from the main text', '메인과의 간격', '与主文本的间距'), min: 0, max: 1.5, step: 0.01, format: 'em' }
    ],
    motion: [
      { type: 'section', when: isTrailer, label: T('表示の流れ', 'Reveal flow', '표시 흐름', '显示方式'), children: [
        { type: 'chips', bind: 'reveal', options: OPT.reveal },
        { type: 'note', when: s => s.reveal === 'solo', text: T('1文字ずつ画面の中央に大きく出したあと、全文を一度に出します', 'Each character flashes big at the center, then the whole text lands at once', '한 글자씩 화면 중앙에 크게 보여 준 뒤, 전문을 한 번에 표시합니다', '在画面中心逐字放大显示，然后一次显示全文') },
        { type: 'note', when: s => s.reveal === 'spread', text: T('全文の文字を中央に重ねて出したあと、左右に広げて並べます（縦書きは上下）', 'All characters appear stacked at the center, then spread out into the full text', '전문의 글자를 중앙에 겹쳐 보여 준 뒤, 좌우로 펼쳐 나열합니다 (세로쓰기는 위아래)', '所有文字先重叠在中心，再向两侧展开（竖排时向上下展开）') },
        { type: 'range', bind: 'spreadHold', when: s => s.reveal === 'spread', label: T('重ねて見せる時間', 'Time shown stacked', '겹쳐 보여 주는 시간', '重叠停留时间'), min: 0, max: 3, step: 0.05, format: 's' },
        { type: 'range', bind: 'spreadDur', when: s => s.reveal === 'spread', label: T('広がる時間', 'Spread time', '펼쳐지는 시간', '展开时间'), min: 0.1, max: 3, step: 0.05, format: 's' },
        { type: 'range', bind: 'cps', when: s => s.reveal === 'char' || s.reveal === 'solo', label: T('表示スピード', 'Speed', '표시 속도', '显示速度'), min: 2, max: 40, step: 1, format: 'cps' },
        { type: 'range', bind: 'soloSize', when: s => s.reveal === 'solo', label: T('中央の文字の大きさ（画像の短い辺に対して）', 'Center letter size (vs. the shorter side)', '중앙 글자 크기 (이미지의 짧은 변 대비)', '中心文字大小（相对于画布短边）'), min: 0.15, max: 0.9, step: 0.01, format: 'pct' },
        { type: 'range', bind: 'soloPause', when: s => s.reveal === 'solo', label: T('全文を出す前のタメ（何も出ない間）', 'Pause before the whole text (blank)', '전문 표시 전의 뜸 (아무것도 나오지 않는 시간)', '全文显示前的留白时间'), min: 0, max: 2, step: 0.05, format: 's' },
        { type: 'range', bind: 'soloImpact', when: s => s.reveal === 'solo', label: T('全文が出る瞬間の衝撃', 'Impact when the whole text lands', '전문이 나오는 순간의 충격', '全文出现时的冲击强度'), min: 0, max: 2, step: 0.05, format: 'x' },
        { type: 'range', bind: 'glyphDur', when: s => !['scroll', 'solo', 'spread'].includes(s.reveal) && s.inFx !== 'typewriter', label: T('1文字が現れるまでの時間', 'Fade time per character', '한 글자가 나타나기까지의 시간', '单字出现时间'), min: 0, max: 2, step: 0.05, format: 's' },
        { type: 'range', bind: 'punctPause', when: s => s.reveal === 'char', label: T('句読点での間', 'Pause at punctuation', '문장 부호에서의 간격', '标点停顿'), min: 0, max: 1.5, step: 0.05, format: 's' },
        { type: 'range', bind: 'linePause', when: s => s.reveal === 'char', label: T('改行での間', 'Pause at line breaks', '줄바꿈에서의 간격', '换行停顿'), min: 0, max: 2, step: 0.05, format: 's' },
        { type: 'range', bind: 'lineInterval', when: s => s.reveal === 'line' || s.reveal === 'sweep', label: T('次の行までの時間', 'Time between lines', '다음 줄까지의 시간', '行与行的间隔'), min: 0.1, max: 4, step: 0.05, format: 's' },
        { type: 'range', bind: 'sweepDur', when: s => s.reveal === 'sweep', label: T('1行が流れる時間', 'Sweep time per line', '한 줄이 흐르는 시간', '每行流动时间'), min: 0.2, max: 5, step: 0.05, format: 's' },
        { type: 'range', bind: 'scrollSpeed', when: s => s.reveal === 'scroll', label: T('スクロール速度', 'Scroll speed', '스크롤 속도', '滚动速度'), min: 10, max: 400, step: 5, format: 'pxs' },
        { type: 'toggle', bind: 'scrollFade', when: s => s.reveal === 'scroll', label: T('画面の端でフェードさせる', 'Fade near the edges', '화면 끝에서 페이드', '在画面边缘淡出') },
        { type: 'toggle', bind: 'cursor', when: s => s.reveal === 'char', label: T('入力カーソルを表示', 'Show a typing cursor', '입력 커서 표시', '显示输入光标') },
        { type: 'range', bind: 'pageGap', when: s => s.reveal !== 'scroll' && s.pageSplit, label: T('ページ間の空白', 'Gap between pages', '페이지 사이 공백', '页面间的留白时间'), min: 0, max: 3, step: 0.05, format: 's' }
      ] },
      { type: 'section', when: s => !(isTrailer(s) && ['solo', 'spread'].includes(s.reveal)), label: s => (isTrailer(s) ? T('1文字の現れ方', 'How each character appears', '한 글자가 나타나는 방식', '单字入场效果') : T('登場', 'In', '등장', '入场')), children: [
        { type: 'effects', phase: 'in' },
        { type: 'select', bind: 'inDir', when: s => Boolean(inDef(s).dirs), label: T('方向', 'Direction', '방향', '方向'), options: s => (inDef(s).dirs || []).map(d => ({ value: d, label: OPT.dirs[d] })) },
        { type: 'range', bind: 'inDur', when: s => notTrailer(s) && s.inFx !== 'typewriter', label: T('時間', 'Duration', '시간', '时长'), min: 0.05, max: 4, step: 0.05, format: 's' },
        { type: 'range', bind: 'inStagger', when: s => notTrailer(s) && inDef(s).level === 'glyph', label: T('文字ごとのずらし', 'Delay between characters', '글자마다의 시간차', '逐字延迟'), min: 0, max: 0.6, step: 0.01, format: 's' },
        { type: 'select', bind: 'inOrder', when: s => notTrailer(s) && inDef(s).level === 'glyph', label: T('順番', 'Order', '순서', '顺序'), options: OPT.order },
        { type: 'select', bind: 'inEase', when: s => s.inFx !== 'typewriter', label: T('動きのカーブ', 'Easing', '움직임 곡선', '缓动曲线'), options: OPT.ease },
        { type: 'range', bind: 'inPower', when: s => !['fade', 'typewriter'].includes(s.inFx), label: T('強さ', 'Strength', '강도', '强度'), min: 0.2, max: 2.5, step: 0.05, format: 'x' }
      ] },
      { type: 'section', label: s => (isTrailer(s) && s.reveal !== 'scroll' ? T('表示中（各ページ）', 'Hold (each page)', '표시 중 (각 페이지)', '停留（每页）') : T('表示中', 'Hold', '표시 중', '停留')), children: [
        { type: 'range', bind: 'hold', when: s => !(isTrailer(s) && s.reveal === 'scroll'), label: T('表示時間', 'Hold time', '표시 시간', '停留时间'), min: 0, max: 10, step: 0.1, format: 's' },
        { type: 'chips', bind: 'holdFx', options: Object.keys(FX_LABELS.hold).map(id => ({ value: id, label: FX_LABELS.hold[id] })) },
        { type: 'range', bind: 'holdPower', when: s => s.holdFx !== 'none', label: T('強さ', 'Strength', '강도', '强度'), min: 0.2, max: 3, step: 0.05, format: 'x' },
        { type: 'dynamicNote', key: 'hold' }
      ] },
      { type: 'section', when: s => !(isTrailer(s) && s.reveal === 'scroll'), toggle: 'outEnabled', label: s => (isTrailer(s) ? T('退場（各ページ）', 'Out (each page)', '퇴장 (각 페이지)', '退场（每页）') : T('退場', 'Out', '퇴장', '退场')), children: [
        { type: 'effects', phase: 'out' },
        { type: 'select', bind: 'outDir', when: s => Boolean(outDef(s).dirs), label: T('方向', 'Direction', '방향', '方向'), options: s => (outDef(s).dirs || []).map(d => ({ value: d, label: OPT.dirs[d] })) },
        { type: 'range', bind: 'outDur', when: s => !['none', 'erase'].includes(s.outFx), label: T('時間', 'Duration', '시간', '时长'), min: 0.05, max: 4, step: 0.05, format: 's' },
        { type: 'range', bind: 'outStagger', when: s => outDef(s).level === 'glyph', label: T('文字ごとのずらし', 'Delay between characters', '글자마다의 시간차', '逐字延迟'), min: 0, max: 0.6, step: 0.01, format: 's' },
        { type: 'select', bind: 'outOrder', when: s => outDef(s).level === 'glyph', label: T('順番', 'Order', '순서', '顺序'), options: OPT.order },
        { type: 'select', bind: 'outEase', when: s => !['none', 'erase'].includes(s.outFx), label: T('動きのカーブ', 'Easing', '움직임 곡선', '缓动曲线'), options: OPT.ease },
        { type: 'range', bind: 'outPower', when: s => !['none', 'fade', 'erase'].includes(s.outFx), label: T('強さ', 'Strength', '강도', '强度'), min: 0.2, max: 2.5, step: 0.05, format: 'x' }
      ] },
      { type: 'section', label: T('タイミング', 'Timing', '타이밍', '时间设置'), children: [
        { type: 'select', bind: 'subFx', when: notTrailer, label: T('サブテキストの登場', 'Sub text entrance', '서브 텍스트 등장', '副文本入场效果'), options: OPT.subFx },
        { type: 'range', bind: 'subDelay', when: notTrailer, label: T('サブの登場（メイン登場完了からの差）', 'Sub text timing (after main finishes)', '서브 등장 (메인 등장 완료 후 시간차)', '副文本入场时间（相对于主文本入场结束）'), min: -2, max: 2, step: 0.05, format: 'sSigned' },
        { type: 'range', bind: 'startDelay', label: T('開始前の空白', 'Blank time before', '시작 전 공백', '开始前留白'), min: 0, max: 3, step: 0.05, format: 's' },
        { type: 'range', bind: 'endDelay', label: T('終了後の空白', 'Blank time after', '종료 후 공백', '结束后留白'), min: 0, max: 5, step: 0.05, format: 's' },
        { type: 'dynamicNote', key: 'duration' }
      ] }
    ],
    style: [
      { type: 'stylePresets', label: T('スタイルプリセット', 'Style presets', '스타일 프리셋', '样式预设') },
      { type: 'section', label: T('文字の塗り', 'Fill', '글자 채우기', '填充'), children: [
        { type: 'segment', bind: 'fill.type', options: OPT.fillType },
        { type: 'colors', items: [
          { bind: 'fill.color', label: s => (s.fill.type === 'gradient' ? T('色1', 'Color 1', '색 1', '颜色 1') : T('色', 'Color', '색', '颜色')) },
          { bind: 'fill.color2', label: T('色2', 'Color 2', '색 2', '颜色 2'), when: s => s.fill.type === 'gradient' },
          { bind: 'fill.color3', label: T('色3', 'Color 3', '색 3', '颜色 3'), when: s => s.fill.type === 'gradient', optional: true }
        ] },
        { type: 'segment', bind: 'fill.dir', when: s => s.fill.type === 'gradient', label: T('グラデーションの向き', 'Gradient direction', '그라데이션 방향', '渐变方向'), options: OPT.gradDir },
        { type: 'gradientPresets', when: s => s.fill.type === 'gradient' },
        { type: 'range', bind: 'fillOpacity', label: T('塗りの不透明度', 'Fill opacity', '채우기 불투명도', '填充不透明度'), min: 0, max: 1, step: 0.01, format: 'pct' }
      ] },
      { type: 'section', label: T('縁取り', 'Outline', '테두리', '描边'), toggle: 'stroke.on', children: [
        { type: 'colors', items: [{ bind: 'stroke.color', label: T('色', 'Color', '색', '颜色') }] },
        { type: 'range', bind: 'stroke.width', label: T('太さ', 'Width', '굵기', '粗细'), min: 0.5, max: 30, step: 0.5, format: 'px' }
      ] },
      { type: 'section', label: T('外側の縁取り', 'Outer outline', '바깥 테두리', '外层描边'), toggle: 'stroke2.on', children: [
        { type: 'colors', items: [{ bind: 'stroke2.color', label: T('色', 'Color', '색', '颜色') }] },
        { type: 'range', bind: 'stroke2.width', label: T('太さ', 'Width', '굵기', '粗细'), min: 0.5, max: 40, step: 0.5, format: 'px' }
      ] },
      { type: 'section', label: T('影', 'Shadow', '그림자', '阴影'), toggle: 'shadow.on', children: [
        { type: 'colors', items: [{ bind: 'shadow.color', label: T('色', 'Color', '색', '颜色') }] },
        { type: 'range', bind: 'shadow.opacity', label: T('濃さ', 'Opacity', '농도', '不透明度'), min: 0, max: 1, step: 0.01, format: 'pct' },
        { type: 'range', bind: 'shadow.blur', label: T('ぼかし', 'Blur', '흐림', '模糊'), min: 0, max: 80, step: 1, format: 'px' },
        { type: 'range', bind: 'shadow.x', label: T('横のずれ', 'Offset X', '가로 어긋남', '水平偏移'), min: -60, max: 60, step: 1, format: 'px' },
        { type: 'range', bind: 'shadow.y', label: T('縦のずれ', 'Offset Y', '세로 어긋남', '垂直偏移'), min: -60, max: 60, step: 1, format: 'px' }
      ] },
      { type: 'section', label: T('光彩（グロー）', 'Glow', '광채 (글로우)', '光晕'), toggle: 'glow.on', children: [
        { type: 'colors', items: [{ bind: 'glow.color', label: T('色', 'Color', '색', '颜色') }] },
        { type: 'range', bind: 'glow.size', label: T('広がり', 'Size', '퍼짐', '大小'), min: 2, max: 150, step: 1, format: 'px' },
        { type: 'range', bind: 'glow.strength', label: T('強さ', 'Strength', '강도', '强度'), min: 0.2, max: 3, step: 0.05, format: 'x' }
      ] },
      { type: 'section', when: s => [s.inFx, s.holdFx, s.outFx].includes('glitch'), label: T('ノイズの色', 'Noise colors', '노이즈 색', '故障噪点颜色'), children: [
        { type: 'colors', items: [
          { bind: 'glitchColor', label: T('色1', 'Color 1', '색 1', '颜色 1') },
          { bind: 'glitchColor2', label: T('色2', 'Color 2', '색 2', '颜色 2') }
        ] }
      ] },
      { type: 'section', when: notTrailer, label: T('サブテキストを別の色にする', 'Different color for sub text', '서브 텍스트를 다른 색으로 하기', '为副文本单独设置颜色'), toggle: 'subColorOn', children: [
        { type: 'colors', items: [{ bind: 'subColor', label: T('色', 'Color', '색', '颜色') }] }
      ] },
      { type: 'section', when: s => isTrailer(s) && s.cursor, label: T('カーソル', 'Cursor', '커서', '光标'), children: [
        { type: 'colors', items: [{ bind: 'cursorColor', label: T('色（空欄で文字色）', 'Color (blank = text color)', '색 (비워 두면 글자 색)', '颜色（留空时使用文字颜色）'), optional: true }] }
      ] }
    ],
    layout: [
      { type: 'section', label: T('装飾', 'Decoration', '장식', '装饰'), children: [
        { type: 'chips', bind: 'deco.type', options: OPT.deco },
        { type: 'colors', when: s => s.deco.type !== 'none', items: [
          { bind: 'deco.color', label: T('塗り', 'Fill', '채우기', '填充'), when: decoIs('band', 'box', 'frame') },
          { bind: 'deco.color2', label: T('線', 'Line', '선', '线条'), when: decoIs('box', 'frame', 'lines', 'underline', 'sides', 'bar', 'corners') },
          { bind: 'deco.tapeColor', label: T('テープ', 'Tape', '테이프', '警戒带'), when: decoIs('tape') },
          { bind: 'deco.tapeStripe', label: T('しま模様', 'Stripes', '줄무늬', '条纹'), when: decoIs('tape') }
        ] },
        { type: 'range', bind: 'deco.opacity', when: decoIs('band', 'box', 'frame'), label: T('塗りの濃さ', 'Fill opacity', '채우기 농도', '填充不透明度'), min: 0, max: 1, step: 0.01, format: 'pct' },
        { type: 'range', bind: 'deco.thickness', when: decoIs('box', 'frame', 'lines', 'underline', 'sides', 'bar', 'corners'), label: s => (['box', 'frame'].includes(s.deco.type) ? T('枠線の太さ（0で枠なし）', 'Border width (0 = none)', '테두리 굵기 (0이면 테두리 없음)', '边框粗细（0 为无边框）') : T('線の太さ', 'Line width', '선 굵기', '线条粗细')), min: 0, max: 16, step: 0.5, format: 'px' },
        { type: 'toggle', bind: 'deco.outline', when: s => decoIs('frame', 'lines', 'underline', 'sides', 'bar', 'corners')(s) && (s.stroke.on || s.stroke2.on), label: T('線にも文字と同じ縁取りをつける', 'Outline the lines like the text', '선에도 글자와 같은 테두리 달기', '线条使用与文字相同的描边') },
        { type: 'range', bind: 'deco.tapeSize', when: decoIs('tape'), label: T('テープの太さ', 'Tape width', '테이프 굵기', '警戒带宽度'), min: 8, max: 120, step: 1, format: 'px' },
        { type: 'range', bind: 'deco.tapeSpeed', when: decoIs('tape'), label: T('テープの流れる速さ（0で止まる）', 'Tape speed (0 = still)', '테이프가 흐르는 속도 (0이면 멈춤)', '警戒带移动速度（0 为静止）'), min: 0, max: 400, step: 5, format: 'pxs' },
        { type: 'range', bind: 'deco.tapeBlink', when: decoIs('tape'), label: T('テープの点滅（0で点滅しない）', 'Tape blink (0 = none)', '테이프 점멸 (0이면 점멸 안 함)', '警戒带闪烁强度（0 为不闪烁）'), min: 0, max: 1, step: 0.01, format: 'pct' },
        { type: 'range', bind: 'deco.pad', when: s => s.deco.type !== 'none', label: T('文字との余白', 'Padding', '글자와의 여백', '文字周围留白'), min: 0, max: 2, step: 0.01, format: 'em' },
        { type: 'range', bind: 'deco.extend', when: decoIs('lines', 'underline', 'sides'), label: T('線の長さ', 'Line length', '선 길이', '线条长度'), min: 0, max: 4, step: 0.05, format: 'em' },
        { type: 'range', bind: 'deco.extend', when: decoIs('frame'), label: T('枠の広がり（画面の端で止まります）', 'Frame extension (stops at the image edge)', '틀의 확장 (화면 끝에서 멈춥니다)', '边框延伸（到达画布边缘时停止）'), min: 0, max: 12, step: 0.1, format: 'em' },
        { type: 'range', bind: 'deco.soft', when: decoIs('band'), label: T('ふちのぼかし', 'Edge softness', '가장자리 흐림', '边缘模糊'), min: 0, max: 1, step: 0.01, format: 'pct' },
        { type: 'range', bind: 'deco.sideFade', when: decoIs('band'), label: T('両端のフェード', 'End fade', '양 끝 페이드', '两端淡出'), min: 0, max: 1, step: 0.01, format: 'pct' },
        { type: 'range', bind: 'deco.radius', when: decoIs('box'), label: T('角の丸み', 'Corner radius', '모서리 둥글기', '圆角大小'), min: 0, max: 1, step: 0.01, format: 'em' },
        { type: 'segment', bind: 'deco.anim', when: s => s.deco.type !== 'none', label: T('装飾のアニメーション', 'Decoration animation', '장식 애니메이션', '装饰动画'), options: OPT.decoAnim },
        { type: 'range', bind: 'deco.dur', when: s => s.deco.type !== 'none' && s.deco.anim !== 'none', label: T('装飾のアニメーション時間', 'Decoration animation time', '장식 애니메이션 시간', '装饰动画时长'), min: 0.1, max: 2.5, step: 0.05, format: 's' }
      ] },
      { type: 'section', label: T('背景（画像全体）', 'Background (whole image)', '배경 (이미지 전체)', '背景（整个画布）'), children: [
        { type: 'chips', bind: 'bg.type', options: OPT.bg },
        { type: 'colors', when: s => s.bg.type !== 'none', items: [{ bind: 'bg.color', label: T('色', 'Color', '색', '颜色') }] },
        { type: 'range', bind: 'bg.opacity', when: s => s.bg.type !== 'none', label: T('濃さ', 'Opacity', '농도', '不透明度'), min: 0, max: 1, step: 0.01, format: 'pct' },
        { type: 'toggle', bind: 'bg.sync', when: s => s.bg.type !== 'none', label: T('文字の登場・退場に合わせてフェード', 'Fade with the text', '글자의 등장·퇴장에 맞춰 페이드', '随文字入场和退场淡入淡出') }
      ] },
      { type: 'section', label: T('画像サイズ', 'Image size', '이미지 크기', '画布尺寸'), children: [
        { type: 'size' }
      ] },
      { type: 'section', label: T('配置', 'Position', '배치', '位置'), children: [
        { type: 'anchor', bind: 'anchor', label: T('基準位置', 'Anchor', '기준 위치', '基准位置') },
        { type: 'range', bind: 'marginX', label: T('左右の余白', 'Side margin', '좌우 여백', '左右边距'), min: 0, max: 400, step: 1, format: 'px' },
        { type: 'range', bind: 'marginY', label: T('上下の余白', 'Top/bottom margin', '상하 여백', '上下边距'), min: 0, max: 400, step: 1, format: 'px' },
        { type: 'range', bind: 'offsetX', label: T('横の微調整', 'Nudge X', '가로 미세 조정', '水平微调'), min: -800, max: 800, step: 1, format: 'px' },
        { type: 'range', bind: 'offsetY', label: T('縦の微調整', 'Nudge Y', '세로 미세 조정', '垂直微调'), min: -800, max: 800, step: 1, format: 'px' }
      ] }
    ]
  };

  /* ---------- 小さなヘルパー ---------- */

  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  function setPath(obj, path, value) {
    const keys = path.split('.');
    let o = obj;
    keys.slice(0, -1).forEach(k => {
      if (typeof o[k] !== 'object' || o[k] === null) o[k] = {};
      o = o[k];
    });
    o[keys[keys.length - 1]] = value;
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    });
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  let uid = 0;
  const nextId = prefix => `${prefix}-${++uid}`;

  /* ---------- 効果カードの小さなプレビュー ---------- */

  class MiniPreviews {
    constructor(getScene, getLang) {
      this.getScene = getScene;
      this.getLang = getLang;
      this.renderer = new E.TextRenderer({ resolveFont: id => F.families(id) });
      this.canvas = document.createElement('canvas');
      this.canvas.width = 320;
      this.canvas.height = 180;
      this.ctx = this.canvas.getContext('2d');
      this.cards = [];
      this.active = null;
      this.raf = 0;
      this.timer = 0;
    }

    register(card, canvas, phase, fxId) {
      const entry = { card, canvas, phase, fxId };
      this.cards.push(entry);
      const start = () => this.play(entry);
      const stop = () => this.stop(entry);
      card.addEventListener('mouseenter', start);
      card.addEventListener('focus', start);
      card.addEventListener('mouseleave', stop);
      card.addEventListener('blur', stop);
      return entry;
    }

    clear() {
      this.stop();
      this.cards = [];
    }

    sceneFor(phase, fxId) {
      const base = this.getScene();
      const chars = E.graphemes(String(base.text || '').replace(/\s+/g, '')).slice(0, 3).join('') || (this.getLang() === 'zh' ? '文字' : 'あA');
      const scene = P.deepMerge(P.clone(P.BASE), {
        mode: 'message', text: chars, subText: '', width: 320, height: 180, marginX: 18, marginY: 12,
        fontId: base.fontId, weight: base.weight, fontSize: 70, letterSpacing: 0.04, writing: 'h',
        fill: { type: 'solid', color: '#ffffff' }, fillOpacity: 1,
        stroke: { on: true, width: 4, color: '#1b1b1f' }, stroke2: { on: false },
        shadow: { on: true, color: '#000000', opacity: 0.45, blur: 6, x: 0, y: 3 }, glow: { on: false },
        deco: { type: 'none' }, bg: { type: 'none' }, holdFx: 'none', startDelay: 0.15, endDelay: 0.35, subFx: 'same'
      });
      if (phase === 'in') {
        const fx = E.IN_MAP[fxId] || E.IN_MAP.fade;
        Object.assign(scene, {
          inFx: fx.id, inDur: fx.dur, inStagger: fx.level === 'glyph' ? Math.max(fx.stagger || 0, fx.id === 'typewriter' ? 0.18 : 0.08) : 0,
          inDir: (fx.dirs || [])[0], hold: 0.7, outFx: 'fade', outDur: 0.25
        });
      } else {
        const fx = E.OUT_MAP[fxId] || E.OUT_MAP.fade;
        Object.assign(scene, {
          inFx: 'fade', inDur: 0.25, hold: 0.55, outFx: fx.id, outDur: fx.dur || 0,
          outStagger: fx.level === 'glyph' ? Math.max(fx.stagger || 0, fx.id === 'erase' ? 0.15 : 0.08) : 0,
          outOrder: fx.id === 'erase' ? 'reverse' : 'forward', outDir: (fx.dirs || [])[0]
        });
      }
      return scene;
    }

    staticTime(phase, prepared) {
      const T = prepared.timeline;
      const pg = T.pages[0];
      if (!pg) return 0;
      if (phase === 'in') {
        const span = pg.inEnd - pg.textStart;
        return pg.textStart + span * 0.55;
      }
      const span = Number.isFinite(pg.outEnd) ? pg.outEnd - pg.holdEnd : 0;
      return pg.holdEnd + span * 0.45;
    }

    drawEntry(entry, t) {
      const prepared = this.renderer.prepare(this.sceneFor(entry.phase, entry.fxId));
      const time = t === undefined ? this.staticTime(entry.phase, prepared) : t;
      this.renderer.render(this.ctx, time, { scale: 1 });
      const c = entry.canvas;
      const cctx = c.getContext('2d');
      cctx.clearRect(0, 0, c.width, c.height);
      cctx.drawImage(this.canvas, 0, 0, c.width, c.height);
      return prepared;
    }

    refreshAll() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.cards.forEach(entry => {
          if (entry !== this.active && entry.canvas.isConnected) this.drawEntry(entry);
        });
      }, 60);
    }

    play(entry) {
      this.stop();
      this.active = entry;
      const prepared = this.renderer.prepare(this.sceneFor(entry.phase, entry.fxId));
      const loopDur = prepared.timeline.duration + 0.25;
      const start = performance.now();
      const step = now => {
        if (this.active !== entry) return;
        const t = ((now - start) / 1000) % loopDur;
        this.drawEntry(entry, Math.min(t, prepared.timeline.duration));
        this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    }

    stop(entry) {
      if (entry && this.active !== entry) return;
      const prev = this.active;
      this.active = null;
      cancelAnimationFrame(this.raf);
      if (prev && prev.canvas.isConnected) this.drawEntry(prev);
    }
  }

  /* ---------- パネル生成 ---------- */

  class ControlPanel {
    constructor(options) {
      this.getScene = options.getScene;
      this.getLang = options.getLang;
      this.onChange = options.onChange;
      this.onAction = options.onAction;
      this.getInfo = options.getInfo;
      this.bindings = [];
      this.mini = new MiniPreviews(this.getScene, this.getLang);
      this.fontPanelOpen = false;
      this.fontCategory = 'all';
    }

    // 日本語・英語・韓国語・中国語の4つから、今の言語の文言を選ぶ
    pick(ja, en, ko, zh) {
      return this.L(T(ja, en, ko, zh));
    }

    L(label) {
      if (!label) return '';
      const value = typeof label === 'function' ? label(this.getScene()) : label;
      if (typeof value === 'string') return value;
      return value[this.getLang()] ?? value.en ?? value.ja;
    }

    add(refresh) {
      this.bindings.push(refresh);
      return refresh;
    }

    set(path, value, meta) {
      this.onChange(path, value, meta || {});
    }

    render(tabId, container) {
      this.bindings = [];
      this.mini.clear();
      container.innerHTML = '';
      (SCHEMA[tabId] || []).forEach(item => container.appendChild(this.build(item)));
      this.refresh();
    }

    refresh() {
      const scene = this.getScene();
      this.bindings.forEach(fn => fn(scene));
    }

    withVisibility(node, item) {
      if (!item.when) return node;
      this.add(scene => { node.hidden = !item.when(scene); });
      return node;
    }

    field(item, control, extraClass = '') {
      const id = control.id || nextId('ctl');
      control.id = id;
      const label = el('label', { class: 'field-label', for: id });
      this.add(() => { label.textContent = this.L(item.label); });
      const node = el('div', { class: `field ${extraClass}`.trim() }, [label, control]);
      return this.withVisibility(node, item);
    }

    build(item) {
      switch (item.type) {
        case 'section': return this.buildSection(item);
        case 'heading': {
          const node = el('h3', { class: 'field-heading' });
          this.add(() => { node.textContent = this.L(item.label); });
          return this.withVisibility(node, item);
        }
        case 'note': {
          const node = el('p', { class: 'field-note' });
          this.add(() => { node.textContent = this.L(item.text); });
          return this.withVisibility(node, item);
        }
        case 'dynamicNote': {
          const node = el('p', { class: 'field-note is-dynamic' });
          this.add(() => {
            const text = this.getInfo ? this.getInfo(item.key) : '';
            node.textContent = text || '';
            node.hidden = !text;
          });
          return node;
        }
        case 'textarea': return this.buildTextarea(item);
        case 'text': return this.buildText(item);
        case 'range': return this.buildRange(item);
        case 'select': return this.buildSelect(item);
        case 'segment': return this.buildSegment(item, 'segment');
        case 'chips': return this.buildSegment(item, 'chips');
        case 'toggle': return this.buildToggle(item);
        case 'colors': return this.buildColors(item);
        case 'effects': return this.buildEffects(item);
        case 'fontPicker': return this.buildFontPicker(item);
        case 'stylePresets': return this.buildStylePresets(item);
        case 'gradientPresets': return this.buildGradientPresets(item);
        case 'anchor': return this.buildAnchor(item);
        case 'size': return this.buildSize(item);
        default: return el('div');
      }
    }

    buildSection(item) {
      const title = el('h3', { class: 'section-title' });
      const head = el('div', { class: 'section-head' }, [title]);
      const body = el('div', { class: 'section-body' });
      const node = el('section', { class: 'control-section' }, [head, body]);
      this.add(() => { title.textContent = this.L(item.label); });
      if (item.toggle) {
        const input = el('input', { type: 'checkbox', class: 'switch-input' });
        const sw = el('label', { class: 'switch' }, [input, el('span', { class: 'switch-track', 'aria-hidden': 'true' })]);
        input.addEventListener('change', () => this.set(item.toggle, input.checked));
        head.appendChild(sw);
        this.add(scene => {
          const on = Boolean(getPath(scene, item.toggle));
          input.checked = on;
          input.setAttribute('aria-label', this.L(item.label));
          body.hidden = !on;
          node.classList.toggle('is-off', !on);
        });
      }
      item.children.forEach(child => body.appendChild(this.build(child)));
      return this.withVisibility(node, item);
    }

    buildTextarea(item) {
      const ta = el('textarea', { class: 'text-input', id: item.id, spellcheck: 'false' });
      ta.addEventListener('input', () => this.set(item.bind, ta.value, { text: true }));
      this.add(scene => {
        const v = getPath(scene, item.bind) ?? '';
        if (ta.value !== v) ta.value = v;
        ta.rows = typeof item.rows === 'function' ? item.rows(scene) : (item.rows || 3);
      });
      return this.field(item, ta, 'field-wide');
    }

    buildText(item) {
      const input = el('input', { type: 'text', class: 'text-input', spellcheck: 'false' });
      input.addEventListener('input', () => this.set(item.bind, input.value, { text: true }));
      this.add(scene => {
        const v = getPath(scene, item.bind) ?? '';
        if (input.value !== v) input.value = v;
        input.placeholder = this.L(item.placeholder);
      });
      return this.field(item, input, 'field-wide');
    }

    buildRange(item) {
      const fmt = FORMATS[item.format] || { digits: 2, suffix: T('', '', '', '') };
      const mul = fmt.mul || 1;
      const range = el('input', { type: 'range', class: 'range-input', min: item.min, max: item.max, step: item.step });
      const number = el('input', { type: 'number', class: 'number-input', min: item.min * mul, max: item.max * mul, step: item.step * mul, inputmode: 'decimal' });
      const suffix = el('span', { class: 'number-suffix' });
      const id = nextId('rng');
      range.id = id;
      number.setAttribute('aria-labelledby', `${id}-label`);
      const commit = (raw, fromNumber) => {
        let v = Number(raw);
        if (!Number.isFinite(v)) return;
        if (fromNumber) v /= mul;
        const precision = String(item.step).split('.')[1];
        v = Number(v.toFixed(precision ? precision.length : 0));
        this.set(item.bind, v, { live: !fromNumber });
      };
      range.addEventListener('input', () => commit(range.value, false));
      number.addEventListener('change', () => commit(number.value, true));
      const label = el('label', { class: 'field-label', for: id, id: `${id}-label` });
      const valueBox = el('span', { class: 'number-box' }, [number, suffix]);
      const node = el('div', { class: 'field field-range' }, [el('div', { class: 'field-row' }, [label, valueBox]), range]);
      this.add(scene => {
        label.textContent = this.L(item.label);
        suffix.textContent = this.L(fmt.suffix);
        const v = Number(getPath(scene, item.bind) ?? 0);
        if (document.activeElement !== range) range.value = String(v);
        if (document.activeElement !== number) number.value = (v * mul).toFixed(fmt.digits);
      });
      return this.withVisibility(node, item);
    }

    fillOptions(select, options) {
      const key = JSON.stringify(options.map(o => (o.group ? [this.L(o.group), o.options.map(x => x.value)] : [o.value, this.L(o.label)])));
      if (select.dataset.key === key) return;
      select.dataset.key = key;
      select.innerHTML = '';
      options.forEach(o => {
        if (o.group) {
          const g = el('optgroup', { label: this.L(o.group) });
          o.options.forEach(x => g.appendChild(el('option', { value: x.value, text: this.L(x.label) })));
          select.appendChild(g);
        } else {
          select.appendChild(el('option', { value: o.value, text: this.L(o.label) }));
        }
      });
    }

    buildSelect(item) {
      const select = el('select', { class: 'select-input' });
      select.addEventListener('change', () => this.set(item.bind, item.numeric ? Number(select.value) : select.value));
      this.add(scene => {
        const options = typeof item.options === 'function' ? item.options(scene) : item.options;
        this.fillOptions(select, options);
        const v = getPath(scene, item.bind);
        select.value = String(v);
        if (select.selectedIndex < 0 && select.options.length) select.selectedIndex = 0;
      });
      return this.field(item, select);
    }

    buildSegment(item, kind) {
      const group = el('div', { class: kind === 'chips' ? 'chip-group' : 'segment-group', role: 'group' });
      let lastKey = '';
      this.add(scene => {
        const options = typeof item.options === 'function' ? item.options(scene) : item.options;
        const key = JSON.stringify(options.map(o => [o.value, this.L(o.label)]));
        if (key !== lastKey) {
          lastKey = key;
          group.innerHTML = '';
          options.forEach(o => {
            const btn = el('button', { type: 'button', class: kind === 'chips' ? 'chip' : 'segment', 'data-value': o.value, text: this.L(o.label) });
            btn.addEventListener('click', () => this.set(item.bind, o.value));
            group.appendChild(btn);
          });
        }
        const v = String(getPath(scene, item.bind));
        group.querySelectorAll('button').forEach(btn => {
          const on = btn.dataset.value === v;
          btn.classList.toggle('is-active', on);
          btn.setAttribute('aria-pressed', String(on));
        });
        group.setAttribute('aria-label', this.L(item.label) || '');
      });
      if (!item.label) return this.withVisibility(el('div', { class: 'field field-wide' }, [group]), item);
      const label = el('span', { class: 'field-label' });
      this.add(() => { label.textContent = this.L(item.label); });
      return this.withVisibility(el('div', { class: 'field field-wide' }, [label, group]), item);
    }

    buildToggle(item) {
      const input = el('input', { type: 'checkbox', class: 'switch-input' });
      const text = el('span', { class: 'toggle-text' });
      const node = el('label', { class: 'field toggle-field' }, [el('span', { class: 'switch' }, [input, el('span', { class: 'switch-track', 'aria-hidden': 'true' })]), text]);
      input.addEventListener('change', () => this.set(item.bind, input.checked));
      this.add(scene => {
        input.checked = Boolean(getPath(scene, item.bind));
        text.textContent = this.L(item.label);
      });
      return this.withVisibility(node, item);
    }

    buildColors(item) {
      const row = el('div', { class: 'color-row' });
      item.items.forEach(ci => {
        const input = el('input', { type: 'color', class: 'color-input' });
        const hex = el('span', { class: 'color-hex' });
        const text = el('span', { class: 'color-label' });
        const wrap = el('label', { class: 'color-field' }, [input, el('span', { class: 'color-meta' }, [text, hex])]);
        input.addEventListener('input', () => this.set(ci.bind, input.value, { live: true }));
        input.addEventListener('change', () => this.set(ci.bind, input.value));
        let clear = null;
        if (ci.optional) {
          clear = el('button', { type: 'button', class: 'color-clear' });
          clear.addEventListener('click', event => {
            event.preventDefault();
            const cur = this.getScene();
            this.set(ci.bind, getPath(cur, ci.bind) ? '' : '#ffffff');
          });
          wrap.appendChild(clear);
        }
        row.appendChild(wrap);
        this.add(scene => {
          const v = getPath(scene, ci.bind);
          const visible = !ci.when || ci.when(scene);
          wrap.hidden = !visible;
          text.textContent = this.L(ci.label);
          wrap.classList.toggle('is-empty', !v);
          if (v) input.value = v;
          hex.textContent = v ? String(v).toUpperCase() : this.pick('未使用', 'Not used', '사용 안 함', '未使用');
          if (clear) clear.textContent = v ? '×' : '+';
          if (clear) clear.setAttribute('aria-label', v ? this.pick('色を外す', 'Remove color', '색 제거', '移除颜色') : this.pick('色を追加', 'Add color', '색 추가', '添加颜色'));
        });
      });
      return this.withVisibility(el('div', { class: 'field field-wide' }, [row]), item);
    }

    buildEffects(item) {
      const phase = item.phase;
      const grid = el('div', { class: 'effect-grid', role: 'group' });
      const list = phase === 'in' ? E.IN_EFFECTS : E.OUT_EFFECTS;
      let lastMode = '';
      this.add(scene => {
        const mode = scene.mode;
        if (mode !== lastMode || !grid.childElementCount) {
          lastMode = mode;
          grid.innerHTML = '';
          list.forEach(fx => {
            if (mode === 'trailer' && phase === 'in' && (fx.level === 'block' || fx.noTrailer)) return;
            // 「消さない」は退場スイッチ（outEnabled）で切り替えるため、カードには出さない
            if (phase === 'out' && fx.level === 'none') return;
            const canvas = el('canvas', { width: 160, height: 90, class: 'effect-canvas', 'aria-hidden': 'true' });
            const name = el('span', { class: 'effect-name' });
            const badge = el('span', { class: 'effect-badge' });
            const card = el('button', { type: 'button', class: 'effect-card', 'data-fx': fx.id }, [canvas, el('span', { class: 'effect-meta' }, [name, badge])]);
            card.addEventListener('click', () => this.onAction('selectEffect', { phase, id: fx.id }));
            grid.appendChild(card);
            this.mini.register(card, canvas, phase, fx.id);
          });
          this.mini.refreshAll();
        }
        const current = phase === 'in' ? scene.inFx : scene.outFx;
        grid.querySelectorAll('.effect-card').forEach(card => {
          const fx = (phase === 'in' ? E.IN_MAP : E.OUT_MAP)[card.dataset.fx];
          const on = card.dataset.fx === current;
          card.classList.toggle('is-active', on);
          card.setAttribute('aria-pressed', String(on));
          card.querySelector('.effect-name').textContent = this.L(FX_LABELS[phase][card.dataset.fx]);
          const badge = card.querySelector('.effect-badge');
          badge.textContent = fx.level === 'block' ? this.pick('全体', 'Whole', '전체', '整体') : (fx.level === 'glyph' ? this.pick('1文字ずつ', 'Per char', '한 글자씩', '逐字') : '');
          badge.hidden = !badge.textContent;
        });
        grid.setAttribute('aria-label', this.L(phase === 'in' ? T('登場エフェクト', 'Entrance effects', '등장 효과', '入场效果') : T('退場エフェクト', 'Exit effects', '퇴장 효과', '退场效果')));
      });
      return el('div', { class: 'field field-wide' }, [grid]);
    }

    buildFontPicker(item) {
      const current = el('span', { class: 'font-current-name' });
      const sample = el('span', { class: 'font-current-sample' });
      const toggle = el('button', { type: 'button', class: 'font-current', 'aria-expanded': 'false' }, [
        el('span', { class: 'font-current-text' }, [current, sample]), el('span', { class: 'font-caret', 'aria-hidden': 'true', text: '▾' })
      ]);
      const cats = el('div', { class: 'chip-group font-cats', role: 'group' });
      const browserNote = el('p', { class: 'font-browser-note note' });
      const grid = el('div', { class: 'font-grid', role: 'listbox' });
      // 自作フォントの登録はいつでも押せるよう、一覧の外に置く
      const upload = el('input', { type: 'file', accept: '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2', class: 'visually-hidden', id: nextId('font-file') });
      const uploadBtn = el('label', { class: 'mini-button font-register', for: upload.id });
      const uploadNote = el('span', { class: 'font-register-note' });
      const register = el('div', { class: 'font-register-row' }, [uploadBtn, upload, uploadNote]);
      const localInput = el('input', { type: 'text', class: 'text-input', spellcheck: 'false' });
      const localBtn = el('button', { type: 'button', class: 'mini-button' });
      const extras = el('div', { class: 'font-extras' }, [
        el('div', { class: 'font-extra-row' }, [localInput, localBtn])
      ]);
      const panel = el('div', { class: 'font-panel', hidden: true }, [cats, browserNote, grid, extras]);
      const label = el('span', { class: 'field-label' });
      const node = el('div', { class: 'field field-wide font-picker' }, [label, toggle, register, panel]);
      let renderedLang = '';

      const previewCard = (card, font) => {
        const status = card.querySelector('.font-card-status');
        const sampleEl = card.querySelector('.font-card-sample');
        status.textContent = this.pick('見本を読み込み中', 'Loading sample', '미리보기 로딩 중', '样例加载中');
        card.dataset.fontStatus = 'loading';
        F.loadPreview(font).then(alias => {
          if (alias) sampleEl.style.fontFamily = `"${alias}", ${font.generic || 'sans-serif'}`;
          card.classList.toggle('is-loaded', Boolean(alias));
          card.dataset.fontStatus = alias ? 'loaded' : 'fallback';
          status.textContent = alias
            ? this.pick('見本を読み込み済み', 'Sample loaded', '미리보기 준비됨', '样例已加载')
            : this.pick('代替フォントの見本', 'Fallback sample', '대체 글꼴 미리보기', '样例使用备用字体');
        });
      };
      const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          const font = F.get(entry.target.dataset.font);
          previewCard(entry.target, font);
        });
      }, { root: grid, rootMargin: '120px' }) : null;

      const buildGrid = () => {
        if (observer) observer.disconnect();
        grid.innerHTML = '';
        renderedLang = this.getLang();
        const scene = this.getScene();
        const fonts = F.list().filter(f => this.fontCategory === 'all' || f.cat === this.fontCategory);
        if (this.getLang() === 'zh') fonts.sort((a, b) => Number(b.cat === 'chinese') - Number(a.cat === 'chinese'));
        fonts.forEach(font => {
          const name = F.displayName(font, this.getLang());
          const source = font.system
            ? this.pick('端末のフォント・自動代替', 'Device fonts · automatic fallback', '기기 글꼴 · 자동 대체', '本机字体 · 自动回退')
            : font.user
              ? this.pick('マイフォント', 'My font', '내 글꼴', '自有字体')
              : this.pick('必要時にオンライン読込', 'Online · loads on demand', '온라인 · 필요 시 로딩', '在线字体 · 按需加载');
          const style = font.styleNames && (font.styleNames[this.getLang()] || font.styleNames.en);
          const card = el('button', { type: 'button', class: 'font-card', role: 'option', 'data-font': font.id }, [
            el('span', { class: 'font-card-sample', text: font.user ? (font.label || font.family) : F.previewSample(font) }),
            el('span', { class: 'font-card-name', text: name }),
            ...(style ? [el('span', { class: 'font-card-style', text: style })] : []),
            el('span', { class: 'font-card-status', text: source })
          ]);
          card.title = `${name} · ${font.family}\n${source}${style ? `\n${style}` : ''}`;
          if (font.user || font.system) card.querySelector('.font-card-sample').style.fontFamily = E.cssFontFamily(F.families(font.id));
          const on = font.id === scene.fontId;
          card.classList.toggle('is-active', on);
          card.setAttribute('aria-selected', String(on));
          card.addEventListener('click', () => {
            this.set(item.bind, font.id);
            this.fontPanelOpen = false;
            panel.hidden = true;
            toggle.setAttribute('aria-expanded', 'false');
          });
          if (font.user) {
            // 登録の解除は、誤操作を防ぐため2回押しで行う
            const unregister = this.pick('登録を解除', 'Remove', '등록 해제', '移除');
            const remove = el('button', { type: 'button', class: 'font-remove', 'data-remove': font.id, text: '×', title: this.pick('登録を解除', 'Remove from My Fonts', '마이 폰트에서 해제', '从“我的字体”移除'), 'aria-label': `${unregister}: ${font.label || font.family}` });
            let armed = 0;
            remove.addEventListener('click', event => {
              event.stopPropagation();
              if (!armed) {
                remove.classList.add('is-armed');
                remove.textContent = this.pick('解除する', 'Remove?', '해제할까요?', '确认移除？');
                armed = setTimeout(() => { armed = 0; remove.classList.remove('is-armed'); remove.textContent = '×'; }, 3000);
                return;
              }
              clearTimeout(armed);
              this.onAction('removeFont', { id: font.id });
            });
            grid.appendChild(el('div', { class: 'font-card-wrap' }, [card, remove]));
          } else {
            grid.appendChild(card);
          }
          if (observer && !font.user && !font.system) observer.observe(card);
          else if (!font.user && !font.system) previewCard(card, font);
        });
      };

      const buildCats = () => {
        cats.innerHTML = '';
        const categories = F.CATEGORIES.slice();
        if (this.getLang() === 'zh') categories.sort((a, b) => Number(b.id === 'chinese') - Number(a.id === 'chinese'));
        [{ id: 'all', label: T('すべて', 'All', '전체', '全部') }].concat(categories).forEach(cat => {
          if (cat.id === 'user' && !F.list().some(f => f.cat === 'user')) return;
          const btn = el('button', { type: 'button', class: 'chip', text: this.L(cat.label) });
          btn.classList.toggle('is-active', this.fontCategory === cat.id);
          btn.addEventListener('click', () => {
            this.fontCategory = cat.id;
            buildCats();
            buildGrid();
          });
          cats.appendChild(btn);
        });
      };

      toggle.addEventListener('click', () => {
        this.fontPanelOpen = !this.fontPanelOpen;
        panel.hidden = !this.fontPanelOpen;
        toggle.setAttribute('aria-expanded', String(this.fontPanelOpen));
        if (this.fontPanelOpen) { buildCats(); buildGrid(); }
      });
      upload.addEventListener('change', async () => {
        const file = upload.files && upload.files[0];
        upload.value = '';
        if (!file) return;
        this.onAction('uploadFont', { file, bind: item.bind });
      });
      const applyLocal = () => {
        const name = localInput.value.trim();
        if (name) this.onAction('localFont', { name, bind: item.bind });
      };
      localBtn.addEventListener('click', applyLocal);
      localInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); applyLocal(); } });

      this.add(scene => {
        const font = F.get(scene.fontId) || F.get('noto-sans-jp');
        label.textContent = this.L(item.label);
        current.textContent = F.displayName(font, this.getLang());
        sample.textContent = this.getLang() === 'zh' ? '文字永 Aa' : (font.cat === 'latin' ? 'Aa Bb 123' : 'あア永 Aa');
        sample.style.fontFamily = E.cssFontFamily(F.families(font.id));
        sample.style.fontWeight = String(scene.weight || 400);
        uploadBtn.textContent = this.L(T('＋ 自作フォントを登録（TTF / OTF / WOFF）', '+ Add your own font (TTF / OTF / WOFF)', '＋ 직접 만든 폰트 등록 (TTF / OTF / WOFF)', '＋ 添加自有字体（TTF / OTF / WOFF）'));
        uploadNote.textContent = F.isSessionOnly()
          ? this.pick('埋め込み中のフォントは今回だけ有効です', 'Embedded fonts last for this session only', '임베드 글꼴은 현재 세션에서만 사용됩니다', '内嵌调用中的自有字体仅用于本次会话，不写入制作器存档')
          : this.L(T('登録したフォントはこのブラウザに保存され、次回も「マイフォント」から選べます（外部には送信されません）', 'Saved in this browser only and listed under “My Fonts” next time (never uploaded)', '등록한 폰트는 이 브라우저에 저장되어 다음에도 「마이 폰트」에서 고를 수 있습니다 (외부로 전송되지 않습니다)', '字体仅保存在当前浏览器中，下次可从“我的字体”选择（不会上传到外部服务器）'));
        browserNote.textContent = this.pick('オンライン書体は必要な文字だけ読み込みます。オフラインでは端末のフォントかフォントファイルを使えます。', 'Online fonts load only the required glyphs. Offline, use device fonts or add a font file.', '온라인 글꼴은 필요한 문자만 로딩합니다. 오프라인에서는 기기 글꼴 또는 글꼴 파일을 사용하세요.', '在线字体按需加载字形；无法联网时可选本机字体或添加字体文件。样例加载状态不代表整套字库已下载。');
        sample.style.fontStyle = scene.italic ? 'italic' : 'normal';
        localInput.placeholder = this.L(T('PCにあるフォント名（例：游明朝）', 'Installed font name (e.g. Georgia)', 'PC에 설치된 폰트 이름 (예: 맑은 고딕)', '电脑上已安装的字体名称（例如：微软雅黑）'));
        localBtn.textContent = this.L(T('使う', 'Use', '사용', '使用'));
        panel.hidden = !this.fontPanelOpen;
        toggle.setAttribute('aria-expanded', String(this.fontPanelOpen));
        if (this.fontPanelOpen) {
          if (!grid.childElementCount || renderedLang !== this.getLang()) { buildCats(); buildGrid(); }
          grid.querySelectorAll('.font-card').forEach(card => {
            const on = card.dataset.font === scene.fontId;
            card.classList.toggle('is-active', on);
            card.setAttribute('aria-selected', String(on));
          });
        }
      });
      return node;
    }

    buildStylePresets(item) {
      const group = el('div', { class: 'chip-group style-presets' });
      const label = el('span', { class: 'field-label' });
      P.STYLE_PRESETS.forEach(preset => {
        const btn = el('button', { type: 'button', class: 'chip', 'data-preset': preset.id });
        btn.addEventListener('click', () => this.onAction('stylePreset', { id: preset.id }));
        group.appendChild(btn);
      });
      this.add(() => {
        label.textContent = this.L(item.label);
        group.querySelectorAll('button').forEach(btn => {
          const preset = P.STYLE_PRESETS.find(p => p.id === btn.dataset.preset);
          btn.textContent = this.L(preset.label);
        });
      });
      return el('div', { class: 'field field-wide' }, [label, group]);
    }

    buildGradientPresets(item) {
      const group = el('div', { class: 'swatch-group' });
      P.GRADIENT_PRESETS.forEach(preset => {
        const btn = el('button', { type: 'button', class: 'swatch', title: preset.id, 'aria-label': preset.id });
        btn.style.background = `linear-gradient(180deg, ${preset.colors.join(', ')})`;
        btn.addEventListener('click', () => this.onAction('gradientPreset', { colors: preset.colors }));
        group.appendChild(btn);
      });
      return this.withVisibility(el('div', { class: 'field field-wide' }, [group]), item);
    }

    buildAnchor(item) {
      const grid = el('div', { class: 'anchor-grid', role: 'group' });
      const names = {
        tl: T('左上', 'Top left', '왼쪽 위', '左上'), tc: T('上', 'Top', '위', '上'), tr: T('右上', 'Top right', '오른쪽 위', '右上'),
        ml: T('左', 'Left', '왼쪽', '左'), mc: T('中央', 'Center', '중앙', '居中'), mr: T('右', 'Right', '오른쪽', '右'),
        bl: T('左下', 'Bottom left', '왼쪽 아래', '左下'), bc: T('下', 'Bottom', '아래', '下'), br: T('右下', 'Bottom right', '오른쪽 아래', '右下')
      };
      ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'].forEach(key => {
        const btn = el('button', { type: 'button', class: 'anchor-cell', 'data-value': key }, [el('span', { class: 'anchor-dot', 'aria-hidden': 'true' })]);
        btn.addEventListener('click', () => this.set(item.bind, key));
        grid.appendChild(btn);
      });
      const label = el('span', { class: 'field-label' });
      this.add(scene => {
        label.textContent = this.L(item.label);
        grid.setAttribute('aria-label', this.L(item.label));
        grid.querySelectorAll('button').forEach(btn => {
          const on = btn.dataset.value === scene.anchor;
          btn.classList.toggle('is-active', on);
          btn.setAttribute('aria-pressed', String(on));
          btn.setAttribute('aria-label', this.L(names[btn.dataset.value]));
          btn.title = this.L(names[btn.dataset.value]);
        });
      });
      return el('div', { class: 'field field-wide anchor-field' }, [label, grid]);
    }

    buildSize() {
      const select = el('select', { class: 'select-input' });
      const w = el('input', { type: 'number', class: 'number-input', min: 32, max: 3840, step: 1 });
      const h = el('input', { type: 'number', class: 'number-input', min: 32, max: 3840, step: 1 });
      const custom = el('div', { class: 'size-custom' }, [w, el('span', { text: '×' }), h, el('span', { class: 'number-suffix', text: 'px' })]);
      const label = el('label', { class: 'field-label' });
      const id = nextId('size');
      select.id = id;
      label.setAttribute('for', id);
      select.addEventListener('change', () => this.onAction('sizePreset', { id: select.value }));
      const commit = () => this.onAction('customSize', { width: Number(w.value), height: Number(h.value) });
      w.addEventListener('change', commit);
      h.addEventListener('change', commit);
      this.add(scene => {
        label.textContent = this.L(T('サイズ', 'Size', '크기', '大小'));
        this.fillOptions(select, P.SIZE_PRESETS.map(p => ({ value: p.id, label: p.label })));
        select.value = scene.sizePreset || 'custom';
        if (document.activeElement !== w) w.value = scene.width;
        if (document.activeElement !== h) h.value = scene.height;
        custom.hidden = scene.sizePreset !== 'custom';
        w.setAttribute('aria-label', this.L(T('幅', 'Width', '너비', '宽度')));
        h.setAttribute('aria-label', this.L(T('高さ', 'Height', '높이', '高度')));
      });
      return el('div', { class: 'field field-wide' }, [label, select, custom]);
    }
  }

  root.TextApngControls = { ControlPanel, FX_LABELS, SCHEMA, getPath, setPath, OPT };
})(window);
