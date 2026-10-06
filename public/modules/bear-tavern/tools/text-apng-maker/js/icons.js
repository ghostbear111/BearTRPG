/*
 * 文字画像APNGメーカー — テンプレートのアイコン
 * 24×24 の線画。塗りなし・線の色と太さは CSS（.template-icon）で指定する
 */
(function (root) {
  'use strict';

  const ICONS = {
    // メッセージ
    swords: '<path d="M14.5 17.5L3.5 6.5V3.5h3l11 11M13 19l6-6M16 16l4 4M19 21l2-2"/><path d="M14.5 6.5l3-3h3v3l-3 3M5 14l4 4M7 17l-3 3M3 19l2 2"/>',
    flag: '<path d="M5.5 21V3.5h12l-2.5 4.25 2.5 4.25h-12"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 21h4"/>',
    chip: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/><path d="M10 10h4v4h-4zM9.5 3v3.5M14.5 3v3.5M9.5 17.5V21M14.5 17.5V21M3 9.5h3.5M3 14.5h3.5M17.5 9.5H21M17.5 14.5H21"/>',
    skull: '<path d="M12 3.5c-4.3 0-7.5 3-7.5 7 0 2.3 1.1 4.1 3 5.2v3.8h9v-3.8c1.9-1.1 3-2.9 3-5.2 0-4-3.2-7-7.5-7z"/><circle cx="9.3" cy="11" r="1.6"/><circle cx="14.7" cy="11" r="1.6"/><path d="M10.5 19.5v-2.2M13.5 19.5v-2.2"/>',
    flame: '<path d="M12 21a6 6 0 0 1-6-6c0-3.2 2.2-5 3.4-7.6.4 1.8 1.3 3 2.3 3.4.2-2.8 1.3-5.3 3.2-7.3.6 2.4 1.5 4.1 2.6 5.7.9 1.4 1.5 3.1 1.5 5.8a7 7 0 0 1-7 6z"/>',
    search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
    badge: '<path d="M12 3l7 3v5.5c0 4.3-2.9 7.8-7 9.5-4.1-1.7-7-5.2-7-9.5V6z"/><circle cx="12" cy="11.5" r="2.4"/>',
    clipboard: '<rect x="5.5" y="4.5" width="13" height="16.5" rx="1.5"/><path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 13.5h7M8.5 17h4"/>',
    warning: '<path d="M12 3.5L21.5 20h-19z"/><path d="M12 10v4.5M12 17.3v.1"/>',
    siren: '<path d="M7 18v-5a5 5 0 0 1 10 0v5"/><path d="M5 18h14v3H5zM12 3v2M4.5 6.5l1.4 1.4M19.5 6.5l-1.4 1.4"/>',
    dash: '<path d="M3 8.5h7M2 12h9M3 15.5h7"/><path d="M13.5 6l6 6-6 6"/>',
    mail: '<rect x="3" y="5.5" width="18" height="13" rx="1.5"/><path d="M3.5 7l8.5 6 8.5-6"/>',
    phone: '<path d="M5.5 3.5h3l1.5 4-2 1.5c1.1 2.6 3.1 4.6 5.7 5.7L15.2 12.7l4 1.5v3.1a2 2 0 0 1-2.2 2C10 18.7 5.3 14 4.4 5.7a2 2 0 0 1 1.1-2.2z"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 14.5v2.5"/>',
    loader: '<path d="M20 12a8 8 0 1 1-2.35-5.65"/><path d="M20 4.5v4.2h-4.2"/>',
    mask: '<path d="M5 4.5c2.3.9 4.6 1.3 7 1.3s4.7-.4 7-1.3v6.3c0 5-3 8.7-7 8.7s-7-3.7-7-8.7z"/><path d="M8.5 10.5h2M13.5 10.5h2M9.5 14.3c1.5 1.3 3.5 1.3 5 0"/>',
    coffee: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5V6M12.5 3.5V6"/>',
    hourglass: '<path d="M6.5 3.5h11M6.5 20.5h11"/><path d="M7.5 3.5v2.8c0 1.8 1 3.2 4.5 5.7 3.5-2.5 4.5-3.9 4.5-5.7V3.5M7.5 20.5v-2.8c0-1.8 1-3.2 4.5-5.7 3.5 2.5 4.5 3.9 4.5 5.7v2.8"/>',
    type: '<path d="M5 6.5v-2h14v2M12 4.5v15M9 19.5h6"/>',
    book: '<path d="M12 6.5c-2-1.5-4.5-2-8-2v13c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2v-13c-3.5 0-6 .5-8 2zM12 6.5v13"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4M11 13.5l1.2-.9v5.4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    feather: '<path d="M19.5 4.5c-6.5.5-11 4.5-12 11l-2 4"/><path d="M7.8 13.5h6.2c2.5-2 4.2-5 5.5-9M10.2 9.5h5.3"/>',
    bookClosed: '<path d="M5.5 19.5v-15A1.5 1.5 0 0 1 7 3h11.5v15H7a1.5 1.5 0 0 0 0 3h11.5v-3"/><path d="M11 3v6.5l1.75-1.2 1.75 1.2V3"/>',
    curtain: '<path d="M3 4h18"/><path d="M4.5 4v16h4c0-3-.6-5.4-2.2-7 2.8-2 4.7-5 4.7-9M19.5 4v16h-4c0-3 .6-5.4 2.2-7-2.8-2-4.7-5-4.7-9"/>',
    calendarNext: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4M8.5 15h7M13 12.5l2.5 2.5-2.5 2.5"/>',
    calendarFlag: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4M10 18v-6h5.5l-1.3 1.5 1.3 1.5H10"/>',
    sunrise: '<path d="M3 17.5h18M6.5 17.5a5.5 5.5 0 0 1 11 0M12 5v3M4.8 9.8l1.9 1.9M19.2 9.8l-1.9 1.9M8.5 21h7"/>',
    moon: '<path d="M19.5 14.2A8 8 0 1 1 9.8 4.5a6.3 6.3 0 0 0 9.7 9.7z"/>',
    history: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"/><path d="M4.5 4.5V9H9M12 8v4.2l2.8 1.8"/>',
    checkCircle: '<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.4l2.6 2.6 5-5.4"/>',
    xcard: '<rect x="4.5" y="3.5" width="15" height="17" rx="2"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"/>',
    // トレイラー
    play: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9v6l5-3z"/>',
    typewriter: '<path d="M7.5 8.5V3.5h9v5M3 8.5h18"/><path d="M4.5 11h15l1.5 8h-18z"/><path d="M8 15h.01M12 15h.01M16 15h.01"/>',
    terminal: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M7 9.5l3 2.5-3 2.5M12.5 15h4.5"/>',
    rise: '<path d="M4 8h9M4 12h9M4 16h6M18 18.5V6.5M15 9.5l3-3 3 3"/>',
    wave: '<path d="M3 9c2.4-2 4.6-2 7 0s4.6 2 7 0c1.5-1.2 2.8-1.6 4-1.4M3 15c2.4-2 4.6-2 7 0s4.6 2 7 0c1.5-1.2 2.8-1.6 4-1.4"/>',
    spreadOut: '<path d="M12 5v14M9 12H3.5M6 9l-3 3 3 3M15 12h5.5M18 9l3 3-3 3"/>',
    textAll: '<path d="M4 6.5h16M4 10.5h16M4 14.5h16M4 18.5h10"/>',
    reel: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="7.3" r="1.6"/><circle cx="12" cy="16.7" r="1.6"/><circle cx="7.3" cy="12" r="1.6"/><circle cx="16.7" cy="12" r="1.6"/>',
    // 場所・時間
    converge: '<path d="M12 3v5.5M9.5 6.5L12 9l2.5-2.5M12 21v-5.5M9.5 17.5L12 15l2.5 2.5M4.5 12h15"/>',
    floatUp: '<path d="M12 17.5V5M8 9l4-4 4 4M6 20.5h12"/>',
    spacing: '<path d="M8 14.5L12 4.5l4 10M9.5 11h5M3.5 19h17M6 16.5L3.5 19 6 21.5M18 16.5l2.5 2.5-2.5 2.5"/>',
    underline: '<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/>',
    vertical: '<path d="M17.5 4v16M12 4v11M6.5 4v7"/>',
    frame: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M7.5 10h9M7.5 14h6"/>',
    stopwatch: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M10 3h4M12 3v3M18.3 7.2l1.2-1.2"/>'
  };

  const NS = 'http://www.w3.org/2000/svg';

  // アイコンの SVG 要素を作る（名前が無ければ null）
  function create(name, className) {
    const body = ICONS[name];
    if (!body) return null;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    if (className) svg.setAttribute('class', className);
    svg.innerHTML = body;
    return svg;
  }

  root.TextApngIcons = { ICONS, create };
})(window);
