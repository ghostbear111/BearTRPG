/*
 * 文字画像APNGメーカー — テキストアニメーションエンジン
 *  - レイアウト（横書き / 縦書き、禁則つき自動改行、自動縮小）
 *  - タイムライン（メッセージ / トレイラー / 場所・時間テロップ）
 *  - エフェクト（1文字ごと / ブロック全体 / 表示中）
 *  - 文字スプライトのキャッシュと描画
 * 同じ時刻を描けば必ず同じ絵になる（乱数は時刻とインデックスから決定）ため、
 * プレビューと書き出しの見た目が一致します。
 */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ================= イージング ================= */

  const EASE = {
    linear: t => t,
    inQuad: t => t * t,
    outQuad: t => 1 - (1 - t) * (1 - t),
    inCubic: t => t * t * t,
    outCubic: t => 1 - Math.pow(1 - t, 3),
    inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outQuart: t => 1 - Math.pow(1 - t, 4),
    outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inExpo: t => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    outBack: t => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    outElastic: t => {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;
    },
    outBounce: t => {
      const n1 = 7.5625, d1 = 2.75;
      if (t < 1 / d1) return n1 * t * t;
      if (t < 2 / d1) { t -= 1.5 / d1; return n1 * t * t + 0.75; }
      if (t < 2.5 / d1) { t -= 2.25 / d1; return n1 * t * t + 0.9375; }
      t -= 2.625 / d1;
      return n1 * t * t + 0.984375;
    }
  };

  // UIで選べるイージング → 実体
  const EASING_CHOICES = {
    auto: null,
    linear: 'linear',
    smooth: 'inOutCubic',
    out: 'outCubic',
    strong: 'outExpo',
    back: 'outBack',
    elastic: 'outElastic',
    bounce: 'outBounce',
    in: 'inCubic'
  };

  /* ================= 決定的な乱数 ================= */

  function hash32(a, b, c) {
    let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x632be5ab, 0x165667b1) ^ Math.imul((c | 0) + 0x5bd1e995, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function rnd(a, b = 0, c = 0) {
    return hash32(a, b, c) / 4294967296;
  }

  function noise1(x, seed) {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return lerp(rnd(i, seed, 7), rnd(i + 1, seed, 7), u) * 2 - 1;
  }

  /* ================= 文字処理 ================= */

  const segmenter = (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function')
    ? new Intl.Segmenter('ja', { granularity: 'grapheme' })
    : null;

  function graphemes(text) {
    if (!text) return [];
    if (segmenter) return Array.from(segmenter.segment(text), s => s.segment);
    return Array.from(text);
  }

  const setOf = str => new Set(Array.from(str));
  const V_ROTATE = setOf('ー－―—‐‑–-～〜~…‥（）()「」『』【】〔〕［］[]｛｝{}〈〉《》<>＜＞＝=：:；;｜|→←');
  const V_PUNCT = setOf('、。，．');
  const V_SMALL = setOf('ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ');
  const V_SIDEWAYS = /^[\u0020-\u024f\u0370-\u04ff\u2010-\u2015\u2018-\u201f]$/;
  const NO_LINE_START = setOf('、。，．・：；？！゛゜ヽヾゝゞ々ー）］｝」』】〉》〕…‥ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ!),.:;?]}’”%％');
  const NO_LINE_END = setOf('（［｛「『【〈《〔([{‘“');
  const PAUSE_SHORT = setOf('、，,・');
  const PAUSE_LONG = setOf('。．.！？!?…‥―');

  // 「中央に1文字ずつ」：全文が出た瞬間の衝撃の長さ（秒）・中央の大きな文字の画像を残しておく上限（画素数）
  const SOLO_PUNCH = 0.26;
  const SOLO_CACHE_PIXELS = 24e6;
  // 書き出しのフレーム時刻がちょうど切り替わりの瞬間に来ても、丸め誤差で1コマずれないようにする幅
  const TIME_EPS = 1e-6;
  // 「中央から左右に広がる」：重なった文字が現れるまでの時間（秒）と、重なりのばらけ具合。
  // 本来の位置までの距離の SPREAD_LOOSE 割だけ左右にずらして重ねる（0 だと中央の一点に集まる）。
  // ただし重なりの広がり（中央から片側）は文字の大きさの SPREAD_REACH 倍までにして、長い行でも中央にまとめる
  const SPREAD_APPEAR = 0.25;
  const SPREAD_LOOSE = 0.2;
  const SPREAD_REACH = 0.9;
  // 表示中の「点滅」：1回の周期（秒）と、その中で付いている割合
  const BLINK_PERIOD = 0.5;
  const BLINK_ON = 0.6;

  const isBlank = ch => ch === ' ' || ch === '　' || ch === '\t' || /^\s+$/.test(ch);
  // ハングルも英単語と同じく、単語（空白で区切られたまとまり）の途中では改行しない
  const isWordChar = ch => /^[A-Za-z0-9'’\-_.,!?&:;%$#@/\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7af\ud7b0-\ud7ff]$/.test(ch);

  // 禁則処理つきの自動改行（英単語は分割しない）
  function wrapParagraph(chars, maxW, measure, lsPx) {
    if (!chars.length) return [[]];
    const widthOf = arr => (arr.length ? measure(arr.join('')) + lsPx * (arr.length - 1) : 0);
    const tokens = [];
    let word = null;
    chars.forEach(ch => {
      if (isWordChar(ch)) {
        if (!word) { word = []; tokens.push(word); }
        word.push(ch);
      } else {
        word = null;
        tokens.push([ch]);
      }
    });
    const expanded = [];
    tokens.forEach(tok => {
      if (tok.length > 1 && widthOf(tok) > maxW) tok.forEach(ch => expanded.push([ch]));
      else expanded.push(tok);
    });
    const lines = [];
    let cur = [];
    for (let i = 0; i < expanded.length; i++) {
      const tok = expanded[i];
      const tokIsBlank = tok.length === 1 && isBlank(tok[0]);
      if (!cur.length && tokIsBlank && lines.length) continue;
      const candidate = cur.concat(tok);
      if (cur.length && widthOf(candidate) > maxW) {
        if (tok.length === 1 && NO_LINE_START.has(tok[0])) {
          lines.push(candidate);
          cur = [];
          continue;
        }
        const carry = [];
        while (cur.length > 1 && NO_LINE_END.has(cur[cur.length - 1])) carry.unshift(cur.pop());
        while (cur.length && isBlank(cur[cur.length - 1])) cur.pop();
        lines.push(cur);
        cur = carry;
        if (tokIsBlank && !cur.length) continue;
        cur = cur.concat(tok);
      } else {
        cur = candidate;
      }
    }
    if (cur.length || !lines.length) lines.push(cur);
    return lines;
  }

  /* ================= エフェクト定義 ================= */
  // st: 1文字の状態 / bs: ブロック全体の状態
  // e: イージング後の進捗, p: 生の進捗, g: 文字情報, k: 強さ, info: { size, t, dir, vertical }

  const IN_EFFECTS = [
    { id: 'fade', level: 'glyph', ease: 'outCubic', dur: 0.6, stagger: 0,
      glyph(st, e) { st.a *= e; } },
    { id: 'rise', level: 'glyph', ease: 'outCubic', dur: 0.8, stagger: 0.06,
      glyph(st, e, p, g, k) { st.a *= e; st.y += (1 - e) * 0.55 * g.size * k; } },
    { id: 'drop', level: 'glyph', ease: 'outCubic', dur: 0.8, stagger: 0.06,
      glyph(st, e, p, g, k) { st.a *= e; st.y -= (1 - e) * 0.55 * g.size * k; } },
    { id: 'converge', level: 'glyph', ease: 'outCubic', dur: 0.9, stagger: 0.1,
      glyph(st, e, p, g, k, info) {
        const sign = g.parity ? 1 : -1;
        const d = (1 - e) * 0.6 * g.size * k * sign;
        if (info.vertical) st.x -= d; else st.y += d;
        st.a *= e;
      } },
    { id: 'slide', level: 'glyph', ease: 'outCubic', dur: 0.7, stagger: 0.04, dirs: ['left', 'right', 'up', 'down'],
      glyph(st, e, p, g, k, info) {
        const d = (1 - e) * 1.1 * g.size * k;
        const dir = info.dir || 'left';
        if (dir === 'left') st.x -= d; else if (dir === 'right') st.x += d; else if (dir === 'up') st.y -= d; else st.y += d;
        st.a *= e;
      } },
    { id: 'tracking', level: 'glyph', ease: 'outCubic', dur: 1.4, stagger: 0,
      glyph(st, e, p, g, k, info) {
        const d = g.lineOffset * (1 - e) * 1.6 * k;
        if (info.vertical) st.y += d; else st.x += d;
        st.a *= e;
      } },
    // 行の文字を行の中央に（少し左右にばらけて）重ねて出し、少し見せてから行の向きに広げる（トレイラーには同じ名前の「表示の流れ」がある）
    { id: 'spread', level: 'glyph', ease: 'outQuart', dur: 1.3, stagger: 0, noTrailer: true,
      glyph(st, e, p, g, k, info) {
        const appear = clamp(p / 0.18);
        const q = clamp((p - 0.42) / 0.58);
        const m = info.ease ? info.ease(q) : EASE.outQuart(q);
        const d = -g.lineOffset * (1 - m) * (1 - spreadLoose(g.lineReach, g.size));
        if (info.vertical) st.y += d; else st.x += d;
        st.a *= EASE.outQuad(appear) * lerp(stackAlpha(g), 1, m);
        st.s *= 1 + 0.25 * k * (1 - EASE.outCubic(appear));
      } },
    { id: 'blurIn', level: 'glyph', ease: 'outCubic', dur: 0.8, stagger: 0.05,
      glyph(st, e, p, g, k) { st.blur += (1 - e) * 0.28 * g.size * k; st.a *= e; } },
    { id: 'pop', level: 'glyph', ease: 'outBack', dur: 0.5, stagger: 0.07,
      glyph(st, e, p) { st.s *= Math.max(0.001, e); st.a *= clamp(p * 3); } },
    { id: 'shrinkIn', level: 'glyph', ease: 'outCubic', dur: 0.55, stagger: 0.06,
      glyph(st, e, p, g, k) { st.s *= 1 + (1 - e) * 1.6 * k; st.a *= e; } },
    { id: 'spin', level: 'glyph', ease: 'outCubic', dur: 0.8, stagger: 0.06,
      glyph(st, e, p, g, k) { st.r += (1 - e) * -Math.PI * 0.8 * k; st.s *= 0.3 + 0.7 * e; st.a *= e; } },
    { id: 'flip', level: 'glyph', ease: 'outBack', dur: 0.6, stagger: 0.06,
      glyph(st, e, p, g, k, info) {
        if (info.vertical) st.sx *= Math.max(0.001, e); else st.sy *= Math.max(0.001, e);
        st.a *= clamp(p * 2.5);
      } },
    { id: 'bounce', level: 'glyph', ease: 'outBounce', dur: 0.9, stagger: 0.07,
      glyph(st, e, p, g, k) { st.y -= (1 - e) * 1.3 * g.size * k; st.a *= clamp(p * 6); } },
    { id: 'scatter', level: 'glyph', ease: 'outCubic', dur: 1.1, stagger: 0.02,
      glyph(st, e, p, g, k) {
        const ang = g.r1 * TAU;
        const dist = (1.4 + g.r2 * 1.8) * g.size * k * (1 - e);
        st.x += Math.cos(ang) * dist;
        st.y += Math.sin(ang) * dist;
        st.r += (g.r3 - 0.5) * 2.4 * (1 - e);
        st.a *= e;
      } },
    { id: 'typewriter', level: 'glyph', ease: 'linear', dur: 0, stagger: 0.08,
      glyph() {} },
    { id: 'flicker', level: 'glyph', ease: 'linear', dur: 0.9, stagger: 0.05,
      glyph(st, e, p, g) { st.a *= flickerCurve(p, g.seed); } },
    { id: 'slam', level: 'block', ease: 'linear', dur: 0.75,
      block(bs, e, p, k, info) {
        const impact = 0.4;
        if (p < impact) {
          const q = p / impact;
          bs.s *= 1 + (1 - q * q) * 2.4 * k;
          bs.a *= clamp(q * 2.2);
          bs.blur += (1 - q) * 0.04 * info.size;
        } else {
          const q = (p - impact) / (1 - impact);
          const decay = Math.pow(1 - q, 2);
          bs.s *= 1 + Math.sin(q * Math.PI * 3) * 0.05 * decay * k;
          const amp = 0.08 * info.size * decay * k;
          bs.x += noise1(info.t * 42, 11) * amp;
          bs.y += noise1(info.t * 42, 29) * amp;
          bs.bright = Math.max(bs.bright, Math.pow(1 - q, 3) * 0.85);
        }
      } },
    { id: 'zoomIn', level: 'block', ease: 'outCubic', dur: 0.9,
      block(bs, e, p, k, info) { bs.s *= 1 + (1 - e) * 0.9 * k; bs.a *= e; bs.blur += (1 - e) * 0.1 * info.size * k; } },
    { id: 'emerge', level: 'block', ease: 'outCubic', dur: 0.9,
      block(bs, e, p, k) { bs.s *= Math.max(0.05, 1 - (1 - e) * 0.6 * k); bs.a *= e; } },
    { id: 'wipe', level: 'block', ease: 'inOutCubic', dur: 0.9, dirs: ['lr', 'rl', 'tb', 'bt', 'center'],
      block(bs, e, p, k, info) { bs.mask = { dir: info.dir || 'lr', p: e, out: false }; } },
    { id: 'shutter', level: 'block', ease: 'outExpo', dur: 0.6, dirs: ['v', 'h'],
      block(bs, e, p, k, info) {
        if (info.dir === 'h') bs.sx *= Math.max(0.001, e); else bs.sy *= Math.max(0.001, e);
        bs.a *= clamp(e * 1.6);
      } },
    { id: 'glitch', level: 'block', ease: 'linear', dur: 0.9,
      block(bs, e, p, k, info) {
        const frame = Math.floor(info.t * 24);
        bs.glitch = Math.max(bs.glitch, (1 - p) * k);
        bs.a *= p > 0.8 ? 1 : (rnd(frame, 3, info.seed) < 0.3 + 0.6 * p ? 1 : 0.12);
        bs.x += (rnd(frame, 7, info.seed) - 0.5) * 0.18 * info.size * (1 - p) * k;
      } },
    { id: 'flash', level: 'block', ease: 'outCubic', dur: 0.8,
      block(bs, e, p) { bs.a *= clamp(p * 5); bs.bright = Math.max(bs.bright, 1 - e); bs.glowMul *= 1 + (1 - e) * 1.5; } }
  ];

  const OUT_EFFECTS = [
    { id: 'none', level: 'none', ease: 'linear', dur: 0 },
    { id: 'fade', level: 'glyph', ease: 'inCubic', dur: 0.6, stagger: 0,
      glyph(st, e) { st.a *= 1 - e; } },
    { id: 'rise', level: 'glyph', ease: 'inCubic', dur: 0.8, stagger: 0.04,
      glyph(st, e, p, g, k) { st.a *= 1 - e; st.y -= e * 0.55 * g.size * k; } },
    { id: 'sink', level: 'glyph', ease: 'inCubic', dur: 0.8, stagger: 0.04,
      glyph(st, e, p, g, k) { st.a *= 1 - e; st.y += e * 0.55 * g.size * k; } },
    { id: 'diverge', level: 'glyph', ease: 'inCubic', dur: 0.8, stagger: 0.06,
      glyph(st, e, p, g, k, info) {
        const sign = g.parity ? 1 : -1;
        const d = e * 0.6 * g.size * k * sign;
        if (info.vertical) st.x -= d; else st.y += d;
        st.a *= 1 - e;
      } },
    { id: 'slide', level: 'glyph', ease: 'inCubic', dur: 0.7, stagger: 0.03, dirs: ['left', 'right', 'up', 'down'],
      glyph(st, e, p, g, k, info) {
        const d = e * 1.1 * g.size * k;
        const dir = info.dir || 'left';
        if (dir === 'left') st.x -= d; else if (dir === 'right') st.x += d; else if (dir === 'up') st.y -= d; else st.y += d;
        st.a *= 1 - e;
      } },
    { id: 'tracking', level: 'glyph', ease: 'inCubic', dur: 1.2, stagger: 0,
      glyph(st, e, p, g, k, info) {
        const d = g.lineOffset * e * 1.6 * k;
        if (info.vertical) st.y += d; else st.x += d;
        st.a *= 1 - e;
      } },
    { id: 'blurOut', level: 'glyph', ease: 'inCubic', dur: 0.8, stagger: 0.03,
      glyph(st, e, p, g, k) { st.blur += e * 0.28 * g.size * k; st.a *= 1 - e; } },
    { id: 'growOut', level: 'glyph', ease: 'inCubic', dur: 0.6, stagger: 0.04,
      glyph(st, e, p, g, k) { st.s *= 1 + e * 1.3 * k; st.a *= 1 - e; } },
    { id: 'shrink', level: 'glyph', ease: 'inCubic', dur: 0.6, stagger: 0.04,
      glyph(st, e) { st.s *= Math.max(0.001, 1 - e * 0.95); st.a *= 1 - e * e; } },
    { id: 'scatter', level: 'glyph', ease: 'inCubic', dur: 1.0, stagger: 0.02,
      glyph(st, e, p, g, k) {
        const ang = g.r1 * TAU;
        const dist = (1.4 + g.r2 * 1.8) * g.size * k * e;
        st.x += Math.cos(ang) * dist;
        st.y += Math.sin(ang) * dist;
        st.r += (g.r3 - 0.5) * 2.4 * e;
        st.a *= 1 - e;
      } },
    { id: 'erase', level: 'glyph', ease: 'linear', dur: 0, stagger: 0.06 },
    { id: 'flicker', level: 'glyph', ease: 'linear', dur: 0.8, stagger: 0.04,
      glyph(st, e, p, g) { st.a *= flickerCurve(1 - p, g.seed + 101); } },
    { id: 'zoomThrough', level: 'block', ease: 'inCubic', dur: 0.6,
      block(bs, e, p, k, info) { bs.s *= 1 + e * 0.9 * k; bs.a *= 1 - e; bs.blur += e * 0.1 * info.size * k; } },
    { id: 'recede', level: 'block', ease: 'inCubic', dur: 0.7,
      block(bs, e, p, k) { bs.s *= Math.max(0.05, 1 - e * 0.6 * k); bs.a *= 1 - e; } },
    { id: 'wipe', level: 'block', ease: 'inOutCubic', dur: 0.8, dirs: ['lr', 'rl', 'tb', 'bt', 'center'],
      block(bs, e, p, k, info) { bs.mask = { dir: info.dir || 'lr', p: e, out: true }; } },
    { id: 'shutter', level: 'block', ease: 'inExpo', dur: 0.5, dirs: ['v', 'h'],
      block(bs, e, p, k, info) {
        if (info.dir === 'h') bs.sx *= Math.max(0.001, 1 - e); else bs.sy *= Math.max(0.001, 1 - e);
        bs.a *= clamp((1 - e) * 1.6);
      } },
    { id: 'glitch', level: 'block', ease: 'linear', dur: 0.8,
      block(bs, e, p, k, info) {
        const frame = Math.floor(info.t * 24);
        bs.glitch = Math.max(bs.glitch, p * k);
        bs.a *= (1 - Math.pow(p, 3)) * (p < 0.15 ? 1 : (rnd(frame, 5, info.seed) < 0.85 - 0.6 * p ? 1 : 0.1));
        bs.x += (rnd(frame, 9, info.seed) - 0.5) * 0.18 * info.size * p * k;
      } }
  ];

  const HOLD_EFFECTS = [
    { id: 'none' },
    { id: 'float', block(bs, t, k, info) { bs.y += Math.sin(TAU * t / 2.6) * 0.05 * info.size * k; } },
    { id: 'wave', glyph(st, t, g, k) { st.y += Math.sin(TAU * t / 1.6 - g.vis * 0.6) * 0.07 * g.size * k; } },
    { id: 'pulse', block(bs, t, k) {
      const c = (t % 1.1) / 1.1;
      const beat = Math.exp(-Math.pow((c - 0.1) / 0.06, 2)) + 0.6 * Math.exp(-Math.pow((c - 0.3) / 0.06, 2));
      bs.s *= 1 + beat * 0.035 * k;
    } },
    { id: 'shake', block(bs, t, k, info) {
      const f = Math.floor(t * 20);
      bs.x += (rnd(f, 1, info.seed) - 0.5) * 0.05 * info.size * k;
      bs.y += (rnd(f, 2, info.seed) - 0.5) * 0.05 * info.size * k;
    } },
    { id: 'glow', block(bs, t, k) { bs.glowMul *= clamp(1 - 0.45 * k * (0.5 + 0.5 * Math.cos(TAU * t / 1.8)), 0, 2); } },
    { id: 'flicker', block(bs, t, k, info) {
      const f = Math.floor(t * 12);
      if (rnd(f, 5, info.seed) < 0.09 * k) bs.layerAlpha *= 0.2 + rnd(f, 6, info.seed) * 0.35;
    } },
    // 点滅：登場し終えてから一定の間隔で消えたり付いたりする（装飾は消さない）。強さで、消えている間の薄さが変わる
    { id: 'blink', block(bs, t, k, info) {
      const since = info.since ?? t;
      if (since < 0) return;
      const c = (since % BLINK_PERIOD) / BLINK_PERIOD;
      if (c >= BLINK_ON) bs.layerAlpha *= clamp(1 - 0.85 * k);
    } },
    { id: 'glitch', block(bs, t, k) {
      const c = t % 1.7;
      if (c < 0.14) bs.glitch = Math.max(bs.glitch, 0.55 * k);
    } }
  ];

  const byId = list => list.reduce((map, item) => { map[item.id] = item; return map; }, {});
  const IN_MAP = byId(IN_EFFECTS);
  const OUT_MAP = byId(OUT_EFFECTS);
  const HOLD_MAP = byId(HOLD_EFFECTS);

  function flickerCurve(p, seed) {
    if (p >= 1) return 1;
    if (p <= 0) return 0;
    const step = Math.floor(p * 16);
    const on = rnd(step, seed, 13) < 0.25 + p * 0.85;
    return on ? 0.35 + 0.65 * p : 0.05 * p;
  }

  // 効果ごとに使える方向だけを通す（別の効果で選んだ方向が残っていても破綻しない）
  // 「中央から左右に広がる」で重なるときのばらけ具合（reach：行の中で中央からいちばん遠い文字までの距離）
  function spreadLoose(reach, size) {
    return reach > 0 ? Math.min(SPREAD_LOOSE, SPREAD_REACH * size / reach) : SPREAD_LOOSE;
  }

  // 「中央から左右に広がる」で重なっている間の不透明度（文字が多い行ほど薄くして、重なりが透けて見えるようにする）
  function stackAlpha(g) {
    return clamp(1.8 / Math.sqrt(Math.max(1, g.lineCount || 1)), 0.3, 1);
  }

  function dirFor(fx, dir) {
    if (!fx || !fx.dirs) return dir;
    return fx.dirs.includes(dir) ? dir : fx.dirs[0];
  }

  function easeFn(choice, fallback) {
    const key = EASING_CHOICES[choice] || fallback || 'outCubic';
    return EASE[key] || EASE.outCubic;
  }

  /* ================= フォント文字列 ================= */

  function cssFontFamily(families) {
    return families.map(f => (/^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/.test(f) ? f : `"${String(f).replace(/"/g, '')}"`)).join(', ');
  }

  function fontString(families, weight, size, italic) {
    return `${italic ? 'italic ' : ''}${weight || 400} ${Math.max(1, size).toFixed(2)}px ${cssFontFamily(families)}`;
  }

  /* ================= レイアウト ================= */

  function splitPages(scene) {
    const text = String(scene.text || '').replace(/\r\n?/g, '\n');
    const sub = scene.mode === 'trailer' ? '' : String(scene.subText || '').replace(/\r\n?/g, '\n');
    let pages;
    if (scene.mode === 'trailer' && scene.pageSplit && scene.reveal !== 'scroll') {
      pages = text.split(/\n[ \t　]*\n+/).map(s => s.replace(/^\n+|\n+$/g, '')).filter(s => s.length);
      if (!pages.length) pages = [''];
    } else {
      pages = [text];
    }
    return pages.map((body, index) => ({
      main: body.split('\n').map(line => graphemes(line)),
      sub: index === 0 && sub.trim() ? sub.split('\n').map(line => graphemes(line)) : []
    }));
  }

  function measureInk(ctx, str, size) {
    const m = ctx.measureText(str);
    const a = Number.isFinite(m.actualBoundingBoxAscent) ? m.actualBoundingBoxAscent : size * 0.8;
    const d = Number.isFinite(m.actualBoundingBoxDescent) ? m.actualBoundingBoxDescent : size * 0.12;
    return { width: m.width, a, d };
  }

  function layoutGroup(lines, spec, ctx) {
    const { font, size, ls, lh, align, vertical, wrapChars } = spec;
    const lsPx = ls * size;
    const alignF = align === 'start' ? 0 : align === 'end' ? 1 : 0.5;
    ctx.font = font;
    const glyphs = [];
    const lineInfos = [];

    if (!vertical) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const measure = s => ctx.measureText(s).width;
      let wrapped = [];
      lines.forEach(chars => {
        if (wrapChars > 0) wrapped = wrapped.concat(wrapParagraph(chars, wrapChars * size * (1 + ls), measure, lsPx));
        else wrapped.push(chars);
      });
      const pitch = lh * size;
      let maxW = 0;
      const rows = wrapped.map((chars, li) => {
        const widths = [0];
        let acc = '';
        chars.forEach(ch => { acc += ch; widths.push(measure(acc)); });
        const visible = chars.some(ch => !isBlank(ch));
        const ink = visible ? measureInk(ctx, acc, size) : { a: size * 0.72, d: size * 0.12 };
        const lineW = chars.length ? widths[chars.length] + lsPx * (chars.length - 1) : 0;
        maxW = Math.max(maxW, lineW);
        return { chars, widths, lineW, baseline: li * pitch, inkA: ink.a, inkD: ink.d, visible };
      });
      let y0 = Infinity, y1 = -Infinity;
      rows.forEach(row => {
        if (!row.visible) return;
        y0 = Math.min(y0, row.baseline - row.inkA);
        y1 = Math.max(y1, row.baseline + row.inkD);
      });
      if (!Number.isFinite(y0)) { y0 = -size * 0.8; y1 = size * 0.2; }
      rows.forEach((row, li) => {
        const x0 = (maxW - row.lineW) * alignF;
        const lineCenter = x0 + row.lineW / 2;
        const midOffset = (row.inkA - row.inkD) / 2;
        const lineIdx = [];
        row.chars.forEach((ch, i) => {
          const penX = x0 + row.widths[i] + lsPx * i;
          const adv = row.widths[i + 1] - row.widths[i];
          const cx = penX + adv / 2;
          const cy = row.baseline - midOffset;
          lineIdx.push(glyphs.length);
          glyphs.push({
            ch, blank: isBlank(ch), line: li, col: i, size, vertical: false, rot: false,
            cx, cy, ox: -adv / 2, oy: midOffset, adv,
            lineOffset: cx - lineCenter,
            linePos: row.lineW > 0 ? (penX - x0) / row.lineW : 0,
            penX, baseline: row.baseline, inkA: row.inkA, inkD: row.inkD
          });
        });
        setLineReach(glyphs, lineIdx);
        lineInfos.push({ idx: lineIdx, x0, x1: x0 + row.lineW, baseline: row.baseline, inkA: row.inkA, inkD: row.inkD, visible: row.visible });
      });
      let inkA = 0, inkD = 0;
      rows.forEach(row => { if (row.visible) { inkA = Math.max(inkA, row.inkA); inkD = Math.max(inkD, row.inkD); } });
      return { glyphs, lines: lineInfos, box: { x0: 0, y0, x1: maxW, y1 }, metrics: { inkA: inkA || size * 0.8, inkD: inkD || size * 0.12 } };
    }

    // 縦書き：列は右から左、文字は上から下
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let cols = [];
    lines.forEach(chars => {
      if (wrapChars > 0 && chars.length > wrapChars) {
        const out = [];
        let cur = [];
        chars.forEach(ch => {
          if (cur.length >= wrapChars && !NO_LINE_START.has(ch)) {
            const carry = [];
            while (cur.length > 1 && NO_LINE_END.has(cur[cur.length - 1])) carry.unshift(cur.pop());
            out.push(cur);
            cur = carry;
          }
          cur.push(ch);
        });
        out.push(cur);
        cols = cols.concat(out);
      } else {
        cols.push(chars);
      }
    });
    const pitch = lh * size;
    // 半角英数字は横倒し（CSS の text-orientation: mixed と同じ考え方）で、字幅ぶんだけ進める
    const advances = cols.map(chars => chars.map(ch => (V_SIDEWAYS.test(ch) ? ctx.measureText(ch).width : size)));
    const lens = advances.map(list => (list.length ? list.reduce((sum, a) => sum + a, 0) + ls * size * (list.length - 1) : 0));
    const maxLen = Math.max(0, ...lens);
    cols.forEach((chars, ci) => {
      const cxCol = -ci * pitch;
      const top = (maxLen - lens[ci]) * alignF;
      const lineIdx = [];
      const lineCenter = top + lens[ci] / 2;
      let pos = top;
      chars.forEach((ch, j) => {
        const adv = advances[ci][j];
        const center = pos + adv / 2;
        let cx = cxCol;
        let cy = center;
        let rot = false;
        if (V_PUNCT.has(ch)) { cx += size * 0.5; cy -= size * 0.5; }
        else if (V_SMALL.has(ch)) { cx += size * 0.1; cy -= size * 0.1; }
        else if (V_ROTATE.has(ch) || V_SIDEWAYS.test(ch)) rot = true;
        lineIdx.push(glyphs.length);
        glyphs.push({
          ch, blank: isBlank(ch), line: ci, col: j, size, vertical: true, rot,
          cx, cy, ox: 0, oy: 0, adv,
          lineOffset: center - lineCenter,
          linePos: lens[ci] > 0 ? (pos - top) / lens[ci] : 0,
          penX: cxCol, baseline: pos, inkA: size / 2, inkD: size / 2
        });
        pos += adv + ls * size;
      });
      setLineReach(glyphs, lineIdx);
      lineInfos.push({ idx: lineIdx, x0: cxCol - size / 2, x1: cxCol + size / 2, top, bottom: top + lens[ci], visible: chars.some(ch => !isBlank(ch)) });
    });
    const x0 = cols.length ? -(cols.length - 1) * pitch - size / 2 : -size / 2;
    return { glyphs, lines: lineInfos, box: { x0, y0: 0, x1: size / 2, y1: Math.max(maxLen, size * 0.1) }, metrics: { inkA: size / 2, inkD: size / 2 } };
  }

  // 行の中央からいちばん遠い文字までの距離（「中央から左右に広がる」の重なりの広がりに使う）
  function setLineReach(glyphs, idx) {
    const reach = Math.max(0, ...idx.map(i => (glyphs[i].blank ? 0 : Math.abs(glyphs[i].lineOffset))));
    idx.forEach(i => { glyphs[i].lineReach = reach; });
  }

  function shiftGroup(group, dx, dy) {
    group.glyphs.forEach(g => { g.cx += dx; g.cy += dy; g.penX += dx; g.baseline += dy; });
    group.lines.forEach(l => {
      l.x0 += dx; l.x1 += dx;
      if (l.baseline !== undefined) l.baseline += dy;
      if (l.top !== undefined) { l.top += dy; l.bottom += dy; }
    });
    group.box = { x0: group.box.x0 + dx, y0: group.box.y0 + dy, x1: group.box.x1 + dx, y1: group.box.y1 + dy };
  }

  // 縁取り（内側＋外側）の太さ（文字サイズ scene.fontSize 基準の px）
  function outlineWidth(scene) {
    return (scene.stroke && scene.stroke.on ? scene.stroke.width || 0 : 0) + (scene.stroke2 && scene.stroke2.on ? scene.stroke2.width || 0 : 0);
  }

  // 装飾がテキストの外側にどれだけはみ出すか
  function decoExtents(scene, size) {
    const d = scene.deco || {};
    const pad = (d.pad || 0) * size;
    // 線にも縁取りをつけるときは、その分だけ外側に広がる
    const th = (d.thickness || 0) + (d.outline ? outlineWidth(scene) : 0);
    const ext = (d.extend || 0) * size;
    const v = scene.writing === 'v';
    switch (d.type) {
      case 'box': return { l: pad + th, r: pad + th, t: pad + th, b: pad + th };
      case 'corners': return { l: pad + th, r: pad + th, t: pad + th, b: pad + th };
      case 'lines': return v ? { l: pad + th, r: pad + th, t: ext, b: ext } : { l: ext, r: ext, t: pad + th, b: pad + th };
      case 'underline': return v ? { l: pad + th, r: 0, t: ext, b: ext } : { l: ext, r: ext, t: 0, b: pad + th };
      case 'sides': return v ? { l: 0, r: 0, t: pad + ext, b: pad + ext } : { l: pad + ext, r: pad + ext, t: 0, b: 0 };
      case 'bar': return v ? { l: 0, r: pad + th, t: 0, b: 0 } : { l: pad + th, r: 0, t: 0, b: 0 };
      case 'band': return v ? { l: pad, r: pad, t: 0, b: 0 } : { l: 0, r: 0, t: pad, b: pad };
      // 虎柄テープ：文字の上下（縦書きは左右）にテープの太さ＋余白の分はみ出す。長さ方向は画面の端から端まで
      case 'tape': {
        const tw = d.tapeSize ?? 40;
        return v ? { l: pad + tw, r: pad + tw, t: 0, b: 0 } : { l: 0, r: 0, t: pad + tw, b: pad + tw };
      }
      // タイトル枠：メインの文字の周りに余白分はみ出す。左右（縦書きは上下）の延長は画面内に収めて描く
      case 'frame': return { l: pad + th, r: pad + th, t: pad + th, b: pad + th };
      default: return { l: 0, r: 0, t: 0, b: 0 };
    }
  }

  // 縁取り・光彩・影が文字の外側にどれだけ広がるか（文字サイズ scene.fontSize 基準の px。スプライトの余白と同じ見積もり）
  function effectExtents(scene) {
    const outline = outlineWidth(scene);
    const ext = { l: outline, r: outline, t: outline, b: outline };
    if (scene.glow && scene.glow.on) {
      const g = outline + (scene.glow.size || 0) * 1.25;
      ext.l = Math.max(ext.l, g); ext.r = Math.max(ext.r, g); ext.t = Math.max(ext.t, g); ext.b = Math.max(ext.b, g);
    }
    if (scene.shadow && scene.shadow.on) {
      const blur = (scene.shadow.blur || 0) * 1.25;
      const sx = scene.shadow.x || 0, sy = scene.shadow.y || 0;
      ext.l = Math.max(ext.l, outline + blur - sx);
      ext.r = Math.max(ext.r, outline + blur + sx);
      ext.t = Math.max(ext.t, outline + blur - sy);
      ext.b = Math.max(ext.b, outline + blur + sy);
    }
    return ext;
  }

  function layoutPageAt(pageSpec, scene, env, size) {
    const vertical = scene.writing === 'v';
    const subSize = size * (scene.subSize || 0.35);
    const main = layoutGroup(pageSpec.main, {
      font: env.mainFont(size), size, ls: scene.letterSpacing || 0, lh: scene.lineHeight || 1.4,
      align: scene.align, vertical, wrapChars: scene.mode === 'trailer' ? (scene.wrapChars || 0) : 0
    }, env.ctx);
    let sub = null;
    if (pageSpec.sub.length) {
      sub = layoutGroup(pageSpec.sub, {
        font: env.subFont(subSize), size: subSize, ls: scene.subLetterSpacing || 0, lh: scene.lineHeight || 1.4,
        align: scene.align, vertical, wrapChars: 0
      }, env.ctx);
    }
    const gap = (scene.subGap || 0.3) * size;
    const alignF = scene.align === 'start' ? 0 : scene.align === 'end' ? 1 : 0.5;
    if (sub) {
      if (!vertical) {
        const w = Math.max(main.box.x1 - main.box.x0, sub.box.x1 - sub.box.x0);
        shiftGroup(main, (w - (main.box.x1 - main.box.x0)) * alignF - main.box.x0, 0);
        const subDx = (w - (sub.box.x1 - sub.box.x0)) * alignF - sub.box.x0;
        if (scene.subPosition === 'above') shiftGroup(sub, subDx, main.box.y0 - gap - sub.box.y1);
        else shiftGroup(sub, subDx, main.box.y1 + gap - sub.box.y0);
      } else {
        const h = Math.max(main.box.y1 - main.box.y0, sub.box.y1 - sub.box.y0);
        shiftGroup(main, 0, (h - (main.box.y1 - main.box.y0)) * alignF - main.box.y0);
        const subDy = (h - (sub.box.y1 - sub.box.y0)) * alignF - sub.box.y0;
        if (scene.subPosition === 'above') shiftGroup(sub, main.box.x1 + gap - sub.box.x0, subDy);
        else shiftGroup(sub, main.box.x0 - gap - sub.box.x1, subDy);
      }
    }
    const union = (a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
    const box = sub ? union(main.box, sub.box) : { ...main.box };
    return { main, sub, box, subSize };
  }

  function placePage(page, scene, W, H, size, keep) {
    const ext = decoExtents(scene, size);
    const outer = { x0: page.box.x0 - ext.l, y0: page.box.y0 - ext.t, x1: page.box.x1 + ext.r, y1: page.box.y1 + ext.b };
    const anchor = scene.anchor || 'mc';
    const row = anchor[0], col = anchor[1];
    const mx = scene.marginX || 0, my = scene.marginY || 0;
    let dx, dy;
    if (col === 'l') dx = mx - outer.x0;
    else if (col === 'r') dx = W - mx - outer.x1;
    else dx = W / 2 - (outer.x0 + outer.x1) / 2;
    if (row === 't') dy = my - outer.y0;
    else if (row === 'b') dy = H - my - outer.y1;
    else dy = H / 2 - (outer.y0 + outer.y1) / 2;
    dx += scene.offsetX || 0;
    dy += scene.offsetY || 0;
    if (keep) {
      // 自動縮小がオンのときは、余白の指定はそのままに、装飾・縁取り・光彩・影が画像からはみ出さないよう内側へ寄せる
      const k = size / Math.max(1, scene.fontSize || size);
      const fx = keep.effects;
      if (keep.x) {
        const x0 = page.box.x0 + dx - Math.max(ext.l, fx.l * k);
        const x1 = page.box.x1 + dx + Math.max(ext.r, fx.r * k);
        if (x1 - x0 <= W + 0.5) {
          if (x0 < 0) dx -= x0;
          else if (x1 > W) dx -= x1 - W;
        }
      }
      if (keep.y) {
        const y0 = page.box.y0 + dy - Math.max(ext.t, fx.t * k);
        const y1 = page.box.y1 + dy + Math.max(ext.b, fx.b * k);
        if (y1 - y0 <= H + 0.5) {
          if (y0 < 0) dy -= y0;
          else if (y1 > H) dy -= y1 - H;
        }
      }
    }
    shiftGroup(page.main, dx, dy);
    if (page.sub) shiftGroup(page.sub, dx, dy);
    page.box = { x0: page.box.x0 + dx, y0: page.box.y0 + dy, x1: page.box.x1 + dx, y1: page.box.y1 + dy };
    return { outerW: outer.x1 - outer.x0, outerH: outer.y1 - outer.y0 };
  }

  function computeLayout(scene, env) {
    const W = scene.width, H = scene.height;
    const specs = splitPages(scene);
    const baseSize = Math.max(4, scene.fontSize || 96);
    const vertical = scene.writing === 'v';
    const scrolling = scene.mode === 'trailer' && scene.reveal === 'scroll';
    const availW = Math.max(16, W - 2 * (scene.marginX || 0));
    const availH = Math.max(16, H - 2 * (scene.marginY || 0));

    const autoFit = scene.autoFit !== false;
    const effects = effectExtents(scene);
    let fit = 1;
    if (autoFit) {
      specs.forEach(spec => {
        const probe = layoutPageAt(spec, scene, env, baseSize);
        const ext = decoExtents(scene, baseSize);
        const inkW = probe.box.x1 - probe.box.x0;
        const inkH = probe.box.y1 - probe.box.y0;
        // 文字＋装飾は余白の内側、文字＋装飾＋縁取り・光彩・影は画像の内側に収める（どれも文字サイズに比例）
        const w = inkW + ext.l + ext.r;
        const h = inkH + ext.t + ext.b;
        const wAll = inkW + Math.max(ext.l, effects.l) + Math.max(ext.r, effects.r);
        const hAll = inkH + Math.max(ext.t, effects.t) + Math.max(ext.b, effects.b);
        let f = 1;
        if (!(scrolling && vertical)) {
          if (w > availW) f = Math.min(f, availW / w);
          if (wAll > W) f = Math.min(f, W / wAll);
        }
        if (!(scrolling && !vertical)) {
          if (h > availH) f = Math.min(f, availH / h);
          if (hAll > H) f = Math.min(f, H / hAll);
        }
        fit = Math.min(fit, f);
      });
      fit = Math.max(0.05, fit * (fit < 1 ? 0.985 : 1));
    }
    const keep = autoFit ? { effects, x: !(scrolling && vertical), y: !(scrolling && !vertical) } : null;
    const size = baseSize * fit;
    const glyphs = [];
    const pages = specs.map((spec, index) => {
      const page = layoutPageAt(spec, scene, env, size);
      placePage(page, scene, W, H, size, keep);
      const first = glyphs.length;
      const groups = [page.main, page.sub].filter(Boolean);
      groups.forEach(grp => {
        const groupId = grp === page.main ? 0 : 1;
        let vis = 0;
        grp.glyphs.forEach((g, seq) => {
          g.group = groupId;
          g.page = index;
          g.seq = seq;
          g.vis = g.blank ? -1 : vis++;
          g.parity = g.vis >= 0 ? g.vis % 2 : 0;
          g.seed = hash32(index + 1, groupId + 1, seq + 1) % 100000;
          g.r1 = rnd(g.seed, 1); g.r2 = rnd(g.seed, 2); g.r3 = rnd(g.seed, 3);
          g.index = glyphs.length;
          glyphs.push(g);
        });
        grp.count = vis;
        grp.lines.forEach(line => {
          line.idx = line.idx.map(i => i + (glyphs.length - grp.glyphs.length));
          const count = line.idx.filter(i => !glyphs[i].blank).length;
          line.idx.forEach(i => { glyphs[i].lineCount = count; });
        });
      });
      const b = page.box;
      glyphs.slice(first).forEach(g => {
        g.relX = b.x1 > b.x0 ? (g.cx - b.x0) / (b.x1 - b.x0) : 0.5;
        g.relY = b.y1 > b.y0 ? (g.cy - b.y0) / (b.y1 - b.y0) : 0.5;
        // 文字の描画原点（スプライト内の ox, oy に対応）からブロック左上までの距離
        g.bx = g.cx + g.ox - b.x0;
        g.by = g.cy + g.oy - b.y0;
      });
      return {
        index,
        first,
        last: glyphs.length,
        box: b,
        mainBox: page.main.box,
        subBox: page.sub ? page.sub.box : null,
        mainLines: page.main.lines,
        subLines: page.sub ? page.sub.lines : [],
        subSize: page.subSize,
        hasSub: Boolean(page.sub),
        mainMetrics: page.main.metrics,
        subMetrics: page.sub ? page.sub.metrics : null,
        visibleCount: glyphs.slice(first).filter(g => !g.blank).length
      };
    });
    return { W, H, vertical, fit, size, subSize: size * (scene.subSize || 0.35), pages, glyphs };
  }

  /* ================= タイムライン ================= */

  function orderRanks(count, order, seed) {
    const ranks = new Array(count);
    const c = (count - 1) / 2;
    if (order === 'reverse') for (let i = 0; i < count; i++) ranks[i] = count - 1 - i;
    else if (order === 'center') for (let i = 0; i < count; i++) ranks[i] = Math.floor(Math.abs(i - c) + 1e-9);
    else if (order === 'edges') {
      const maxLevel = Math.floor(c + 1e-9);
      for (let i = 0; i < count; i++) ranks[i] = maxLevel - Math.floor(Math.abs(i - c) + 1e-9);
    } else if (order === 'random') {
      const idx = Array.from({ length: count }, (_, i) => i);
      for (let i = count - 1; i > 0; i--) {
        const j = Math.floor(rnd(seed, i, 77) * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      idx.forEach((glyphIndex, rank) => { ranks[glyphIndex] = rank; });
    } else for (let i = 0; i < count; i++) ranks[i] = i;
    return ranks;
  }

  function buildTimeline(scene, layout) {
    const glyphs = layout.glyphs;
    const n = glyphs.length;
    const T = {
      inStart: new Float64Array(n).fill(Infinity),
      inDur: new Float64Array(n),
      outStart: new Float64Array(n).fill(Infinity),
      outDur: new Float64Array(n),
      inFx: new Array(n),
      outFx: new Array(n),
      // 「中央に1文字ずつ」で、その文字だけが中央に大きく出ている区間
      soloStart: new Float64Array(n).fill(Infinity),
      soloEnd: new Float64Array(n).fill(-Infinity),
      pages: [],
      duration: 0,
      posterTime: 0
    };
    const t0 = Math.max(0, scene.startDelay || 0);
    const deco = scene.deco || {};
    const decoAnimated = deco.type && deco.type !== 'none' && deco.anim !== 'none';
    const decoDur = decoAnimated ? Math.max(0.05, deco.dur || 0.4) : 0;
    const inDef = IN_MAP[scene.inFx] || IN_MAP.fade;
    // 「退場あり」がオフなら退場の種類に関係なく消さない
    const outDef = scene.outEnabled === false ? OUT_MAP.none : (OUT_MAP[scene.outFx] || OUT_MAP.fade);
    const inDur = Math.max(0, scene.inDur ?? inDef.dur);
    const outDur = Math.max(0, scene.outDur ?? outDef.dur);
    const hold = Math.max(0, scene.hold ?? 1);
    const bg = scene.bg || {};
    const bgDur = Math.max(0.3, decoDur || 0.4);
    const bgSynced = Boolean(bg.type && bg.type !== 'none' && bg.sync && (bg.opacity ?? 0.5) > 0);
    const solo = scene.mode === 'trailer' && scene.reveal === 'solo';
    let cursor = t0;

    layout.pages.forEach((page, pi) => {
      const isLast = pi === layout.pages.length - 1;
      const pg = { index: pi, blockIn: null, blockOut: null, decoIn: null, decoOut: null, scroll: null, cursor: null, solo: null, spread: null };
      const pageStart = cursor;
      // 帯・テープ・枠・ボックスが現れてから文字が出る
      const opensFirst = ['band', 'tape', 'frame', 'box'].includes(deco.type);
      let lead = decoAnimated && opensFirst ? Math.min(0.3, decoDur * 0.6) : 0;
      // 「中央に1文字ずつ」は、背景が現れきってから1文字目を出す
      if (solo && pi === 0 && bgSynced) lead = Math.max(lead, bgDur);
      const textStart = pageStart + lead;
      if (decoAnimated) pg.decoIn = { start: pageStart, dur: decoDur };
      const pageGlyphs = glyphs.slice(page.first, page.last);
      const mainG = pageGlyphs.filter(g => g.group === 0);
      const subG = pageGlyphs.filter(g => g.group === 1);
      let inEnd = textStart;

      if (scene.mode === 'trailer') {
        const fx = inDef.level === 'block' || inDef.noTrailer ? IN_MAP.fade : inDef;
        const gDur = fx.id === 'typewriter' ? 0 : Math.max(0, scene.glyphDur ?? 0.4);
        const reveal = scene.reveal || 'char';
        if (reveal === 'scroll') {
          const vertical = layout.vertical;
          const b = page.box;
          const speed = Math.max(5, scene.scrollSpeed || 80);
          const from = vertical ? -(b.x1) : layout.H - b.y0;
          const to = vertical ? layout.W - b.x0 : -b.y1;
          const dist = Math.abs(to - from);
          pg.scroll = { start: textStart, dur: dist / speed, from, to, vertical };
          pageGlyphs.forEach(g => { T.inStart[g.index] = textStart; T.inDur[g.index] = 0; T.inFx[g.index] = null; });
          inEnd = textStart + dist / speed;
        } else if (reveal === 'line' || reveal === 'sweep') {
          const interval = Math.max(0.05, scene.lineInterval ?? 0.8);
          const sweep = Math.max(0.05, scene.sweepDur ?? 1.2);
          let li = 0;
          page.mainLines.forEach(line => {
            if (!line.visible) return;
            const lineStart = textStart + li * interval;
            line.idx.forEach(i => {
              const g = glyphs[i];
              T.inStart[i] = reveal === 'sweep' ? lineStart + g.linePos * sweep : lineStart;
              T.inDur[i] = gDur;
              T.inFx[i] = fx;
              inEnd = Math.max(inEnd, T.inStart[i] + gDur);
            });
            li++;
          });
        } else if (reveal === 'all') {
          mainG.forEach(g => { T.inStart[g.index] = textStart; T.inDur[g.index] = gDur; T.inFx[g.index] = fx; });
          inEnd = textStart + gDur;
        } else if (reveal === 'spread') {
          // 各行の文字を中央に重ねて出し、少し見せてから左右（縦書きは上下）に広げて並べる
          const b = page.box;
          const stackHold = Math.max(0, scene.spreadHold ?? 0.5);
          const dur = Math.max(0.05, scene.spreadDur ?? 0.9);
          const start = textStart + SPREAD_APPEAR + stackHold;
          mainG.forEach(g => { T.inStart[g.index] = textStart; T.inDur[g.index] = 0; T.inFx[g.index] = null; });
          pg.spread = { appear: textStart, start, dur, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2 };
          // 行ごとのばらけ具合（中央からいちばん遠い文字までの距離で決める）
          page.mainLines.forEach(line => {
            const list = line.idx.map(i => glyphs[i]).filter(g => !g.blank);
            const reach = Math.max(0, ...list.map(g => Math.abs(g.vertical ? g.cy - pg.spread.cy : g.cx - pg.spread.cx)));
            list.forEach(g => { g.spreadLoose = spreadLoose(reach, g.size); });
          });
          inEnd = start + dur;
        } else if (reveal === 'solo') {
          // 1文字ずつ画面の中央に大きく出してから、全文を一度に出す。空白と改行は1拍あける（続いても1拍）
          const beat = 1 / Math.max(1, scene.cps || 12);
          const pause = Math.max(0, scene.soloPause ?? 0.4);
          let k = 0;
          let gap = false;
          page.mainLines.forEach((line, li) => {
            if (li > 0) gap = true;
            line.idx.forEach(i => {
              if (glyphs[i].blank) { gap = true; return; }
              if (gap && k > 0) k++;
              gap = false;
              T.soloStart[i] = textStart + k * beat - TIME_EPS;
              T.soloEnd[i] = textStart + (k + 1) * beat - TIME_EPS;
              k++;
            });
          });
          // 最後の文字のあと、タメ（何も出ない間）をおいて全文
          const full = textStart + (k > 0 ? k * beat + pause : 0) - TIME_EPS;
          mainG.forEach(g => { T.inStart[g.index] = full; T.inDur[g.index] = 0; T.inFx[g.index] = null; });
          // 叩きつけで大きくなっても画像からはみ出さない倍率
          const b = page.box;
          const edge = layout.size * 0.05;
          const hw = Math.max(1, (b.x1 - b.x0) / 2), hh = Math.max(1, (b.y1 - b.y0) / 2);
          const bcx = (b.x0 + b.x1) / 2, bcy = (b.y0 + b.y1) / 2;
          const room = Math.min((Math.min(bcx, layout.W - bcx) - edge) / hw, (Math.min(bcy, layout.H - bcy) - edge) / hh);
          pg.solo = { start: textStart, full, room: Math.max(1, room) };
          inEnd = full + SOLO_PUNCH;
        } else {
          const cps = Math.max(1, scene.cps || 12);
          const punct = Math.max(0, scene.punctPause ?? 0.25);
          const linePause = Math.max(0, scene.linePause ?? 0.35);
          let t = textStart;
          page.mainLines.forEach(line => {
            line.idx.forEach(i => {
              const g = glyphs[i];
              T.inStart[i] = t;
              T.inDur[i] = gDur;
              T.inFx[i] = fx;
              inEnd = Math.max(inEnd, t + gDur);
              t += 1 / cps;
              if (PAUSE_LONG.has(g.ch)) t += punct;
              else if (PAUSE_SHORT.has(g.ch)) t += punct * 0.5;
            });
            t += linePause;
          });
          if (scene.cursor) pg.cursor = { start: textStart };
        }
      } else {
        const blockIn = inDef.level === 'block';
        if (blockIn) {
          pg.blockIn = { fx: inDef, start: textStart, dur: Math.max(0.05, inDur) };
          mainG.forEach(g => { T.inStart[g.index] = textStart; T.inDur[g.index] = 0; T.inFx[g.index] = null; });
          inEnd = textStart + Math.max(0.05, inDur);
        } else {
          const vis = mainG.filter(g => !g.blank);
          const ranks = orderRanks(vis.length, scene.inOrder, 17 + pi);
          const stagger = inDef.id === 'typewriter' ? Math.max(0.01, scene.inStagger || 0.08) : Math.max(0, scene.inStagger || 0);
          const dur = inDef.id === 'typewriter' ? 0 : inDur;
          vis.forEach((g, i) => {
            T.inStart[g.index] = textStart + ranks[i] * stagger;
            T.inDur[g.index] = dur;
            T.inFx[g.index] = inDef;
            inEnd = Math.max(inEnd, T.inStart[g.index] + dur);
          });
        }
        if (subG.length) {
          const subFxId = scene.subFx || 'same';
          const subVis = subG.filter(g => !g.blank);
          if (subFxId === 'same' && blockIn) {
            subG.forEach(g => { T.inStart[g.index] = textStart; T.inDur[g.index] = 0; T.inFx[g.index] = null; });
          } else {
            const fx = subFxId === 'same' ? inDef : (IN_MAP[subFxId] && IN_MAP[subFxId].level === 'glyph' ? IN_MAP[subFxId] : IN_MAP.fade);
            const subStart = Math.max(textStart, inEnd + (scene.subDelay ?? -0.2));
            const ranks = orderRanks(subVis.length, subFxId === 'same' ? scene.inOrder : 'forward', 31 + pi);
            const baseStagger = subFxId === 'same' ? Math.min(scene.inStagger || 0, 0.05) : 0.035;
            const stagger = fx.id === 'typewriter' ? 0.05 : (subFxId === 'fade' ? 0 : baseStagger);
            const dur = fx.id === 'typewriter' ? 0 : (subFxId === 'same' ? inDur : fx.dur);
            let subEnd = subStart;
            subVis.forEach((g, i) => {
              T.inStart[g.index] = subStart + ranks[i] * stagger;
              T.inDur[g.index] = dur;
              T.inFx[g.index] = fx;
              subEnd = Math.max(subEnd, T.inStart[g.index] + dur);
            });
            inEnd = Math.max(inEnd, subEnd);
          }
        }
      }
      // 空白（描画しない文字）は直前の文字と同時に扱う
      pageGlyphs.forEach(g => {
        if (!Number.isFinite(T.inStart[g.index])) { T.inStart[g.index] = textStart; T.inDur[g.index] = 0; }
      });

      // スクロールは流れ終わった時点で終了（表示時間は使わない）
      const holdEnd = pg.scroll ? inEnd : inEnd + hold;
      let outEnd = Infinity;
      const noOut = outDef.level === 'none';
      if (pg.scroll) {
        outEnd = inEnd;
        pageGlyphs.forEach(g => { T.outStart[g.index] = inEnd; T.outDur[g.index] = 0; });
      } else if (noOut && isLast) {
        outEnd = Infinity;
      } else if (noOut) {
        outEnd = holdEnd;
        pageGlyphs.forEach(g => { T.outStart[g.index] = holdEnd; T.outDur[g.index] = 0; });
      } else if (outDef.level === 'block') {
        const dur = Math.max(0.05, outDur);
        pg.blockOut = { fx: outDef, start: holdEnd, dur };
        outEnd = holdEnd + dur;
        pageGlyphs.forEach(g => { T.outStart[g.index] = outEnd; T.outDur[g.index] = 0; });
      } else {
        const dur = outDef.id === 'erase' ? 0 : outDur;
        const groups = [mainG, subG];
        outEnd = holdEnd;
        groups.forEach((list, gi) => {
          const vis = list.filter(g => !g.blank);
          const order = outDef.id === 'erase' && scene.outOrder === 'forward' ? 'reverse' : scene.outOrder;
          const ranks = orderRanks(vis.length, order, 53 + pi * 3 + gi);
          const stagger = outDef.id === 'erase' ? Math.max(0.01, scene.outStagger || 0.06) : Math.max(0, scene.outStagger || 0);
          vis.forEach((g, i) => {
            T.outStart[g.index] = holdEnd + ranks[i] * stagger;
            T.outDur[g.index] = dur;
            T.outFx[g.index] = outDef;
            outEnd = Math.max(outEnd, T.outStart[g.index] + dur);
          });
          list.filter(g => g.blank).forEach(g => { T.outStart[g.index] = holdEnd; T.outDur[g.index] = 0; });
        });
      }

      let end = outEnd;
      if (Number.isFinite(outEnd)) {
        if (decoAnimated) {
          const start = holdEnd + Math.max(0, outEnd - holdEnd) * 0.35;
          pg.decoOut = { start, dur: decoDur };
          end = Math.max(end, start + decoDur);
        } else {
          pg.decoOut = { start: outEnd, dur: 0 };
        }
      }
      Object.assign(pg, { start: pageStart, textStart, inEnd, holdEnd, outEnd, end });
      if (pg.scroll) {
        pg.poster = pg.scroll.start + pg.scroll.dur * 0.5;
      } else {
        pg.poster = inEnd;
      }
      T.pages.push(pg);
      cursor = Number.isFinite(end) ? end + (scene.mode === 'trailer' ? Math.max(0, scene.pageGap ?? 0.3) : 0) : pageStart + (inEnd - pageStart) + hold;
      if (!Number.isFinite(end)) T.lastVisibleForever = true;
    });

    const lastPage = T.pages[T.pages.length - 1];
    const contentEnd = lastPage ? (Number.isFinite(lastPage.end) ? lastPage.end : lastPage.holdEnd) : t0;
    T.duration = Math.max(0.2, contentEnd + Math.max(0, scene.endDelay || 0));
    T.posterTime = T.pages.length ? Math.min(T.duration, T.pages[0].poster) : 0;
    T.bgIn = { start: t0, dur: bgDur };
    T.bgOut = lastPage && Number.isFinite(lastPage.end) ? { start: Math.max(t0, lastPage.end - bgDur), dur: bgDur } : null;
    // 各フェーズの区間（タイムライン表示用）
    // 退場しない最後のページは、終了まで「表示」として扱う
    T.segments = T.pages.map(pg => (Number.isFinite(pg.end)
      ? { start: pg.start, inEnd: pg.inEnd, holdEnd: pg.holdEnd, end: pg.end }
      : { start: pg.start, inEnd: pg.inEnd, holdEnd: T.duration, end: T.duration }));
    return T;
  }

  /* ================= スプライト（文字画像キャッシュ） ================= */

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  // テープの点滅：0.5秒周期で、明るい状態から短く暗くなる（1で最も暗い）。phase は周期に対するずれ
  function tapeBlinkWave(t, phase) {
    const p = (((t / 0.5) + phase) % 1 + 1) % 1;
    const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
    return smooth(0.55, 0.62, p) * (1 - smooth(0.9, 0.97, p));
  }

  function colorWithAlpha(hex, alpha) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return hex;
    const v = parseInt(m[1], 16);
    return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${clamp(alpha)})`;
  }

  function groupStyle(scene, group, size) {
    const k = size / Math.max(1, scene.fontSize || size);
    const st = {
      fill: scene.fill || { type: 'solid', color: '#ffffff' },
      fillOpacity: clamp(scene.fillOpacity ?? 1),
      stroke1: scene.stroke && scene.stroke.on && scene.stroke.width > 0 ? { w: Math.max(0.5, scene.stroke.width * k), color: scene.stroke.color } : null,
      stroke2: scene.stroke2 && scene.stroke2.on && scene.stroke2.width > 0 ? { w: Math.max(0.5, scene.stroke2.width * k), color: scene.stroke2.color } : null,
      shadow: scene.shadow && scene.shadow.on ? {
        color: colorWithAlpha(scene.shadow.color, scene.shadow.opacity ?? 0.6),
        blur: Math.max(0, (scene.shadow.blur || 0) * k),
        x: (scene.shadow.x || 0) * k,
        y: (scene.shadow.y || 0) * k
      } : null,
      glow: scene.glow && scene.glow.on ? {
        color: scene.glow.color,
        blur: Math.max(1, (scene.glow.size || 0) * k),
        strength: clamp(scene.glow.strength ?? 1, 0.1, 4)
      } : null
    };
    if (group === 1 && scene.subColorOn) st.fill = { type: 'solid', color: scene.subColor || '#ffffff' };
    return st;
  }

  const SHADOW_OFFSET = 20000;

  function buildGlyphSprite(g, font, style, gradient) {
    const measureCanvas = buildGlyphSprite.mc || (buildGlyphSprite.mc = makeCanvas(8, 8));
    const mctx = measureCanvas.getContext('2d');
    mctx.font = font;
    mctx.textAlign = g.vertical ? 'center' : 'left';
    mctx.textBaseline = g.vertical ? 'middle' : 'alphabetic';
    const m = mctx.measureText(g.ch);
    const size = g.size;
    let l = -(Number.isFinite(m.actualBoundingBoxLeft) ? m.actualBoundingBoxLeft : (g.vertical ? size / 2 : 0));
    let r = Number.isFinite(m.actualBoundingBoxRight) ? m.actualBoundingBoxRight : (g.vertical ? size / 2 : m.width);
    let t = -(Number.isFinite(m.actualBoundingBoxAscent) ? m.actualBoundingBoxAscent : (g.vertical ? size / 2 : size * 0.85));
    let b = Number.isFinite(m.actualBoundingBoxDescent) ? m.actualBoundingBoxDescent : (g.vertical ? size / 2 : size * 0.2);
    if (g.rot) { const nl = -b, nr = -t, nt = l, nb = r; l = nl; r = nr; t = nt; b = nb; }
    const t1 = style.stroke1 ? style.stroke1.w : 0;
    const t2 = style.stroke2 ? style.stroke2.w : 0;
    const outline = t1 + t2;
    let pad = outline + 3;
    if (style.glow) pad = Math.max(pad, outline + style.glow.blur * 1.25 + 4);
    if (style.shadow) pad = Math.max(pad, outline + style.shadow.blur * 1.25 + Math.max(Math.abs(style.shadow.x), Math.abs(style.shadow.y)) + 4);
    pad = Math.ceil(pad);
    const w = Math.min(4096, Math.ceil(r - l + pad * 2));
    const h = Math.min(4096, Math.ceil(b - t + pad * 2));
    const ox = pad - l;
    const oy = pad - t;

    const place = (c, shiftX = 0, shiftY = 0) => {
      c.setTransform(1, 0, 0, 1, ox + shiftX, oy + shiftY);
      if (g.rot) c.rotate(Math.PI / 2);
      c.font = font;
      c.textAlign = g.vertical ? 'center' : 'left';
      c.textBaseline = g.vertical ? 'middle' : 'alphabetic';
      c.lineJoin = 'round';
      c.lineCap = 'round';
      c.miterLimit = 2;
    };
    const silhouette = (c, strokeW) => {
      c.fillText(g.ch, 0, 0);
      if (strokeW > 0) { c.lineWidth = strokeW * 2; c.strokeText(g.ch, 0, 0); }
    };

    // ink: 文字の形そのものの範囲（スプライト内の座標）
    const sprite = { ox, oy, w, h, glow: null, back: null, front: null, ink: { x0: ox + l, y0: oy + t, x1: ox + r, y1: oy + b } };

    if (style.glow) {
      const c = makeCanvas(w, h).getContext('2d');
      const passes = Math.ceil(style.glow.strength);
      for (let i = 0; i < passes; i++) {
        c.save();
        place(c, -SHADOW_OFFSET, 0);
        c.shadowColor = style.glow.color;
        c.shadowBlur = style.glow.blur;
        c.shadowOffsetX = SHADOW_OFFSET;
        c.globalAlpha = i === passes - 1 ? (style.glow.strength - (passes - 1)) : 1;
        c.fillStyle = '#000';
        c.strokeStyle = '#000';
        silhouette(c, outline);
        c.restore();
      }
      c.save();
      place(c);
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = '#000';
      c.strokeStyle = '#000';
      silhouette(c, outline);
      c.restore();
      sprite.glow = c.canvas;
    }

    if (style.shadow || style.stroke2) {
      const c = makeCanvas(w, h).getContext('2d');
      if (style.shadow) {
        c.save();
        place(c, -SHADOW_OFFSET, 0);
        c.shadowColor = style.shadow.color;
        c.shadowBlur = style.shadow.blur;
        c.shadowOffsetX = SHADOW_OFFSET + style.shadow.x;
        c.shadowOffsetY = style.shadow.y;
        c.fillStyle = '#000';
        c.strokeStyle = '#000';
        silhouette(c, outline);
        c.restore();
      }
      if (style.stroke2) {
        c.save();
        place(c);
        c.strokeStyle = style.stroke2.color;
        c.lineWidth = outline * 2;
        c.strokeText(g.ch, 0, 0);
        c.restore();
      }
      c.save();
      place(c);
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = '#000';
      c.strokeStyle = '#000';
      silhouette(c, t1);
      c.restore();
      sprite.back = c.canvas;
    }

    const c = makeCanvas(w, h).getContext('2d');
    if (style.stroke1) {
      c.save();
      place(c);
      c.strokeStyle = style.stroke1.color;
      c.lineWidth = t1 * 2;
      c.strokeText(g.ch, 0, 0);
      if (style.fillOpacity < 1) {
        c.globalCompositeOperation = 'destination-out';
        c.fillStyle = '#000';
        c.fillText(g.ch, 0, 0);
      }
      c.restore();
    }
    c.save();
    place(c);
    c.globalAlpha = style.fillOpacity;
    c.fillStyle = makeFillStyle(c, style.fill, g, gradient, ox, oy);
    c.fillText(g.ch, 0, 0);
    c.restore();
    sprite.front = c.canvas;
    return sprite;
  }

  // グラデーションはスプライトのピクセル座標で指定し、回転文字用に逆変換してから渡す
  function makeFillStyle(c, fill, g, gradient, ox, oy) {
    if (!fill || fill.type !== 'gradient') return (fill && fill.color) || '#ffffff';
    const colors = [fill.color, fill.color2, fill.color3].filter(Boolean);
    if (colors.length < 2) return colors[0] || '#ffffff';
    let x0, y0, x1, y1;
    if (fill.dir === 'h' || fill.dir === 'd') {
      const bw = gradient.w, bh = gradient.h;
      const left = ox - g.bx, top = oy - g.by;
      if (fill.dir === 'h') { x0 = left; y0 = 0; x1 = left + bw; y1 = 0; }
      else { x0 = left; y0 = top; x1 = left + bw; y1 = top + bh; }
    } else if (g.vertical) {
      x0 = 0; x1 = 0; y0 = oy - g.size * 0.5; y1 = oy + g.size * 0.5;
    } else {
      x0 = 0; x1 = 0; y0 = oy - gradient.inkA; y1 = oy + gradient.inkD;
    }
    const toLocal = (X, Y) => {
      const dx = X - ox, dy = Y - oy;
      return g.rot ? [dy, -dx] : [dx, dy];
    };
    const [a0, b0] = toLocal(x0, y0);
    const [a1, b1] = toLocal(x1, y1);
    const grad = c.createLinearGradient(a0, b0, a1 === a0 && b1 === b0 ? a1 + 0.01 : a1, b1);
    colors.forEach((color, i) => grad.addColorStop(i / (colors.length - 1), color));
    return grad;
  }

  /* ================= 描画 ================= */

  const FILTER_SUPPORTED = (() => {
    try {
      const c = document.createElement('canvas').getContext('2d');
      c.filter = 'blur(2px)';
      return c.filter === 'blur(2px)';
    } catch (error) {
      return false;
    }
  })();

  function fontFamiliesFor(scene, group, resolveFont) {
    return resolveFont(group === 1 && scene.subFontId && scene.subFontId !== 'same' ? scene.subFontId : scene.fontId);
  }

  class TextRenderer {
    constructor(options = {}) {
      this.resolveFont = options.resolveFont || (() => ['sans-serif']);
      this.layer = makeCanvas(8, 8);
      this.lctx = this.layer.getContext('2d');
      this.tmpA = makeCanvas(8, 8);
      this.tmpB = makeCanvas(8, 8);
      this.blurTmp = makeCanvas(8, 8);
      this.bandCanvas = makeCanvas(8, 8);
      this.measure = makeCanvas(8, 8).getContext('2d');
      this.prepared = null;
      this.spriteKey = '';
      this.sprites = null;
      this.soloCache = new Map();
      this.soloKey = '';
      this.soloPixels = 0;
      this.st = { a: 1, x: 0, y: 0, s: 1, sx: 1, sy: 1, r: 0, blur: 0 };
    }

    fontsFor(scene) {
      const mainFam = fontFamiliesFor(scene, 0, this.resolveFont);
      const subFam = fontFamiliesFor(scene, 1, this.resolveFont);
      const mainWeight = scene.weight || 700;
      const subWeight = scene.subWeight || mainWeight;
      return {
        mainFont: size => fontString(mainFam, mainWeight, size, scene.italic),
        subFont: size => fontString(subFam, subWeight, size, scene.subItalic)
      };
    }

    prepare(scene) {
      const fonts = this.fontsFor(scene);
      const layout = computeLayout(scene, { ctx: this.measure, mainFont: fonts.mainFont, subFont: fonts.subFont });
      const timeline = buildTimeline(scene, layout);
      const spriteKey = JSON.stringify([
        scene.text, scene.subText, scene.mode, scene.reveal, scene.pageSplit, scene.width, scene.height, scene.fontId, scene.subFontId,
        scene.weight, scene.subWeight, scene.italic, scene.subItalic, scene.fontSize, scene.letterSpacing, scene.subLetterSpacing, scene.lineHeight,
        scene.subSize, scene.subGap, scene.subPosition, scene.writing, scene.align, scene.anchor, scene.marginX, scene.marginY,
        scene.offsetX, scene.offsetY, scene.autoFit, scene.wrapChars, scene.fill, scene.fillOpacity, scene.stroke, scene.stroke2,
        scene.shadow, scene.glow, scene.subColorOn, scene.subColor, scene.deco && scene.deco.type, scene.deco && scene.deco.pad,
        scene.deco && scene.deco.extend, scene.deco && scene.deco.thickness, scene.deco && scene.deco.tapeSize, this.fontEpoch || 0
      ]);
      if (spriteKey !== this.spriteKey || !this.sprites) {
        this.sprites = this.buildSprites(scene, layout, fonts);
        this.spriteKey = spriteKey;
      } else {
        layout.glyphs.forEach((g, i) => { g.sprite = this.sprites.list[i]; });
      }
      this.prepared = { scene, layout, timeline };
      return this.prepared;
    }

    invalidateSprites() {
      this.spriteKey = '';
      this.fontEpoch = (this.fontEpoch || 0) + 1;
    }

    buildSprites(scene, layout, fonts) {
      const cache = new Map();
      const list = new Array(layout.glyphs.length).fill(null);
      const posDependent = scene.fill && scene.fill.type === 'gradient' && (scene.fill.dir === 'h' || scene.fill.dir === 'd');
      layout.glyphs.forEach((g, i) => {
        if (g.blank) return;
        const page = layout.pages[g.page];
        const size = g.size;
        const font = g.group === 1 ? fonts.subFont(size) : fonts.mainFont(size);
        const style = groupStyle(scene, g.group, size);
        const metrics = g.group === 1 ? page.subMetrics : page.mainMetrics;
        const gradient = { w: page.box.x1 - page.box.x0, h: page.box.y1 - page.box.y0, inkA: metrics ? metrics.inkA : size * 0.8, inkD: metrics ? metrics.inkD : size * 0.2 };
        const key = posDependent ? `i${i}` : `${g.group}|${g.ch}|${g.rot ? 1 : 0}|${g.page}`;
        let sprite = cache.get(key);
        if (!sprite) {
          sprite = buildGlyphSprite(g, font, style, gradient);
          cache.set(key, sprite);
        }
        list[i] = sprite;
        g.sprite = sprite;
      });
      return { list, cache };
    }

    ensureLayer(w, h) {
      [this.layer, this.tmpA, this.tmpB].forEach(c => {
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      });
    }

    glyphState(g, t, scene, info, st) {
      const T = this.prepared.timeline;
      const i = g.index;
      const inStart = T.inStart[i];
      if (!(t >= inStart)) return false;
      const outStart = T.outStart[i];
      if (t >= outStart && (T.outDur[i] === 0 || t >= outStart + T.outDur[i])) return false;
      st.a = 1; st.x = 0; st.y = 0; st.s = 1; st.sx = 1; st.sy = 1; st.r = 0; st.blur = 0;
      const sp = T.pages[g.page].spread;
      if (sp && t < sp.start + sp.dur) {
        // 行ごとに中央で（少し左右にばらけて）重なって現れ（少し大きい状態から）、行の向きに広がって本来の位置へ
        const a = clamp((t - sp.appear) / SPREAD_APPEAR);
        const k = t < sp.start ? 0 : EASE.outQuart(clamp((t - sp.start) / sp.dur));
        st.a = EASE.outQuad(a) * lerp(stackAlpha(g), 1, k);
        st.s = 1 + 0.25 * (1 - EASE.outCubic(a));
        const pull = (1 - k) * (1 - (g.spreadLoose ?? SPREAD_LOOSE));
        if (g.vertical) st.y = (sp.cy - g.cy) * pull;
        else st.x = (sp.cx - g.cx) * pull;
      }
      const inFx = T.inFx[i];
      const inDur = T.inDur[i];
      if (inFx && inFx.glyph && inDur > 0 && t < inStart + inDur) {
        const p = clamp((t - inStart) / inDur);
        info.ease = easeFn(scene.inEase, inFx.ease);
        inFx.glyph(st, info.ease(p), p, g, scene.inPower ?? 1, info);
      }
      const outFx = T.outFx[i];
      if (outFx && outFx.glyph && t >= outStart) {
        const od = T.outDur[i];
        const p = od > 0 ? clamp((t - outStart) / od) : 1;
        const e = easeFn(scene.outEase, outFx.ease)(p);
        outFx.glyph(st, e, p, g, scene.outPower ?? 1, info);
      }
      const hold = HOLD_MAP[scene.holdFx];
      if (hold && hold.glyph) hold.glyph(st, t, g, scene.holdPower ?? 1);
      return st.a > 0.002;
    }

    blockState(pg, t, scene, size) {
      const bs = { a: 1, x: 0, y: 0, s: 1, sx: 1, sy: 1, r: 0, blur: 0, bright: 0, glitch: 0, mask: null, glowMul: 1, layerAlpha: 1 };
      const seed = 91 + pg.index * 13;
      if (pg.blockIn) {
        const bi = pg.blockIn;
        if (t < bi.start) { bs.a = 0; return bs; }
        if (t < bi.start + bi.dur) {
          const p = clamp((t - bi.start) / bi.dur);
          const e = easeFn(scene.inEase, bi.fx.ease)(p);
          bi.fx.block(bs, e, p, scene.inPower ?? 1, { size, t, dir: dirFor(bi.fx, scene.inDir), seed });
        }
      }
      if (pg.blockOut) {
        const bo = pg.blockOut;
        if (t >= bo.start + bo.dur) { bs.a = 0; return bs; }
        if (t >= bo.start) {
          const p = clamp((t - bo.start) / bo.dur);
          const e = easeFn(scene.outEase, bo.fx.ease)(p);
          bo.fx.block(bs, e, p, scene.outPower ?? 1, { size, t, dir: dirFor(bo.fx, scene.outDir), seed });
        }
      }
      const hold = HOLD_MAP[scene.holdFx];
      if (hold && hold.block) hold.block(bs, t, scene.holdPower ?? 1, { size, seed, since: t - pg.inEnd });
      if (pg.solo) {
        // 全文が出た瞬間：少し大きく叩きつけてから落ち着く（小さな揺れと光つき）
        const d = t - pg.solo.full;
        const k = clamp(scene.soloImpact ?? 1, 0, 3);
        if (k > 0 && d >= 0 && d < SOLO_PUNCH) {
          const e = 1 - d / SOLO_PUNCH;
          const decay = e * e * e;
          const f = Math.floor(t * 30);
          bs.s *= 1 + Math.min(0.2 * k, pg.solo.room - 1) * decay;
          bs.x += (rnd(f, 3, seed) - 0.5) * size * 0.06 * k * decay;
          bs.y += (rnd(f, 5, seed) - 0.5) * size * 0.06 * k * decay;
          bs.bright = Math.max(bs.bright, clamp(0.6 * k * decay));
        }
      }
      if (pg.scroll) {
        const sc = pg.scroll;
        const p = sc.dur > 0 ? clamp((t - sc.start) / sc.dur) : 1;
        const off = lerp(sc.from, sc.to, p);
        if (sc.vertical) bs.x += off; else bs.y += off;
      }
      return bs;
    }

    decoProgress(pg, t) {
      let pin = 1, pout = 0;
      if (pg.decoIn) pin = pg.decoIn.dur > 0 ? clamp((t - pg.decoIn.start) / pg.decoIn.dur) : (t >= pg.decoIn.start ? 1 : 0);
      else if (t < pg.start) pin = 0;
      if (pg.decoOut) pout = pg.decoOut.dur > 0 ? clamp((t - pg.decoOut.start) / pg.decoOut.dur) : (t >= pg.decoOut.start ? 1 : 0);
      return { pin, pout };
    }

    render(ctx, t, options = {}) {
      const P = this.prepared;
      if (!P) return;
      const { scene, layout, timeline } = P;
      const scale = options.scale || 1;
      const cw = ctx.canvas.width, ch = ctx.canvas.height;
      this.ensureLayer(cw, ch);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      ctx.restore();
      this.drawBackground(ctx, t, scale);
      const size = layout.size;
      timeline.pages.forEach(pg => {
        const page = layout.pages[pg.index];
        if (t < pg.start) return;
        if (Number.isFinite(pg.end) && t > pg.end) return;
        if (!page.visibleCount) return;
        const bs = this.blockState(pg, t, scene, size);
        this.drawDeco(ctx, pg, page, t, bs, scale, scene);
        if (bs.a <= 0.002) return;
        this.drawTextLayer(pg, page, t, bs, scale, scene);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = clamp(bs.layerAlpha);
        ctx.drawImage(this.layer, 0, 0);
        ctx.restore();
      });
    }

    drawBackground(ctx, t, scale) {
      const { scene, timeline } = this.prepared;
      const bg = scene.bg || {};
      if (!bg.type || bg.type === 'none') return;
      let alpha = clamp(bg.opacity ?? 0.5);
      if (bg.sync) {
        const pin = clamp((t - timeline.bgIn.start) / timeline.bgIn.dur);
        const pout = timeline.bgOut ? clamp((t - timeline.bgOut.start) / timeline.bgOut.dur) : 0;
        alpha *= EASE.outCubic(pin) * (1 - EASE.inCubic(pout));
      }
      if (alpha <= 0.002) return;
      const W = scene.width * scale, H = scene.height * scale;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (bg.type === 'solid') {
        ctx.fillStyle = colorWithAlpha(bg.color, alpha);
        ctx.fillRect(0, 0, W, H);
      } else if (bg.type === 'vignette') {
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.hypot(W, H) / 2);
        g.addColorStop(0, colorWithAlpha(bg.color, 0));
        g.addColorStop(1, colorWithAlpha(bg.color, alpha));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      } else if (bg.type === 'bottom' || bg.type === 'top') {
        const g = bg.type === 'bottom' ? ctx.createLinearGradient(0, H * 0.45, 0, H) : ctx.createLinearGradient(0, H * 0.55, 0, 0);
        g.addColorStop(0, colorWithAlpha(bg.color, 0));
        g.addColorStop(1, colorWithAlpha(bg.color, alpha));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    }

    drawTextLayer(pg, page, t, bs, scale, scene) {
      const { layout, timeline } = this.prepared;
      const lctx = this.lctx;
      const cw = this.layer.width, ch = this.layer.height;
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.globalCompositeOperation = 'source-over';
      lctx.globalAlpha = 1;
      lctx.filter = 'none';
      lctx.clearRect(0, 0, cw, ch);
      const box = page.box;
      const bcx = (box.x0 + box.x1) / 2;
      const bcy = (box.y0 + box.y1) / 2;
      // ブロック行列: scale * T(bc + off) * R * S * T(-bc)
      const cos = Math.cos(bs.r), sin = Math.sin(bs.r);
      const bsx = bs.s * bs.sx, bsy = bs.s * bs.sy;
      const ba = scale * cos * bsx, bb = scale * sin * bsx, bc = -scale * sin * bsy, bd = scale * cos * bsy;
      const be = scale * (bcx + bs.x) - (ba * bcx + bc * bcy);
      const bf = scale * (bcy + bs.y) - (bb * bcx + bd * bcy);
      const info = { vertical: layout.vertical, dir: null, size: layout.size };
      const st = this.st;
      const list = [];
      for (let i = page.first; i < page.last; i++) {
        const g = layout.glyphs[i];
        if (g.blank || !g.sprite) continue;
        info.dir = t >= timeline.outStart[i] ? dirFor(timeline.outFx[i], scene.outDir) : dirFor(timeline.inFx[i], scene.inDir);
        if (!this.glyphState(g, t, scene, info, st)) continue;
        list.push({ g, a: st.a * bs.a, x: st.x, y: st.y, s: st.s, sx: st.sx, sy: st.sy, r: st.r, blur: st.blur });
      }
      const drawPass = (layerName, alphaMul) => {
        for (let j = 0; j < list.length; j++) {
          const it = list[j];
          const sprite = it.g.sprite;
          const img = sprite[layerName];
          if (!img) continue;
          let total = it.a * alphaMul;
          if (total <= 0.002) continue;
          // 発光の強調（1より大きい倍率）は同じ層を重ねて表現する
          while (total > 0.002) {
            const alpha = Math.min(1, total);
            total -= alpha;
            this.drawSprite(lctx, it, sprite, img, alpha, [ba, bb, bc, bd, be, bf], bs, scale);
          }
        }
      };
      drawPass('glow', bs.glowMul);
      drawPass('back', 1);
      drawPass('front', 1);
      if (pg.cursor) this.drawCursor(pg, page, t, bs, [ba, bb, bc, bd, be, bf], scene);
      if (pg.solo) this.drawSolo(pg, page, t, bs, scale, scene);
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.globalAlpha = 1;

      const rect = this.transformedBox(box, bs, scale, layout.size);
      if (bs.bright > 0.002) {
        lctx.globalCompositeOperation = 'source-atop';
        lctx.fillStyle = `rgba(255, 255, 255, ${clamp(bs.bright)})`;
        lctx.fillRect(0, 0, cw, ch);
        lctx.globalCompositeOperation = 'source-over';
      }
      if (bs.mask) this.applyMask(bs.mask, rect, layout.size * 0.6 * scale);
      if (pg.scroll && scene.scrollFade !== false) this.applyEdgeFade(pg.scroll.vertical, cw, ch);
      if (bs.glitch > 0.01) this.applyGlitch(bs.glitch, t, rect, layout.size * scale, pg.index, scene);
    }

    drawSprite(lctx, it, sprite, img, alpha, m, bs, scale) {
      const [ba, bb, bc, bd, be, bf] = m;
      const gx = it.g.cx + it.x, gy = it.g.cy + it.y;
      const gc = Math.cos(it.r), gs = Math.sin(it.r);
      const sx = it.s * it.sx, sy = it.s * it.sy;
      const la = gc * sx, lb = gs * sx, lc = -gs * sy, ld = gc * sy;
      lctx.setTransform(
        ba * la + bc * lb, bb * la + bd * lb,
        ba * lc + bc * ld, bb * lc + bd * ld,
        ba * gx + bc * gy + be, bb * gx + bd * gy + bf
      );
      lctx.globalAlpha = alpha;
      // ぼかしは文字スプライトの座標系で小さな作業用キャンバス上にかける（全面レイヤーより大幅に軽い）
      const spriteBlur = it.blur + bs.blur;
      const screenBlur = spriteBlur * scale * Math.max(Math.abs(it.s * bs.s), 0.2);
      const dx = it.g.ox - sprite.ox, dy = it.g.oy - sprite.oy;
      if (screenBlur > 0.35) this.drawBlurred(lctx, img, dx, dy, spriteBlur);
      else lctx.drawImage(img, dx, dy);
    }

    drawBlurred(lctx, img, dx, dy, blur) {
      const pad = Math.ceil(blur * 2.4) + 2;
      const w = img.width + pad * 2;
      const h = img.height + pad * 2;
      const c = this.blurTmp;
      if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); }
      const bctx = c.getContext('2d');
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.globalAlpha = 1;
      bctx.clearRect(0, 0, w, h);
      if (FILTER_SUPPORTED) {
        bctx.filter = `blur(${blur.toFixed(2)}px)`;
        bctx.drawImage(img, pad, pad);
        bctx.filter = 'none';
        lctx.drawImage(c, 0, 0, w, h, dx - pad, dy - pad, w, h);
        return;
      }
      // ctx.filter 非対応ブラウザ向け：縮小→拡大でぼかしを近似
      const f = Math.max(0.06, 1 / (1 + blur / 2.2));
      const sw = Math.max(1, Math.round(w * f));
      const sh = Math.max(1, Math.round(h * f));
      bctx.imageSmoothingQuality = 'high';
      bctx.drawImage(img, pad * f, pad * f, img.width * f, img.height * f);
      lctx.imageSmoothingQuality = 'high';
      lctx.drawImage(c, 0, 0, sw, sh, dx - pad, dy - pad, w, h);
    }

    // 「中央に1文字ずつ」：いま出ている1文字を、画像の中央に大きく描く
    drawSolo(pg, page, t, bs, scale, scene) {
      const { layout, timeline } = this.prepared;
      if (t >= pg.solo.full) return;
      let hit = -1;
      for (let i = page.first; i < page.last; i++) {
        if (t >= timeline.soloStart[i] && t < timeline.soloEnd[i]) { hit = i; break; }
      }
      if (hit < 0) return;
      const sprite = this.soloSprite(layout.glyphs[hit], page, scene);
      // 出た瞬間だけわずかに大きい（同じ文字が続いても区切りがわかる）
      const p = clamp((t - timeline.soloStart[hit]) / Math.max(1e-6, timeline.soloEnd[hit] - timeline.soloStart[hit]));
      const k = clamp(scene.soloImpact ?? 1, 0, 3);
      const s = scale * (1 + 0.08 * k * (1 - p) * (1 - p));
      const lctx = this.lctx;
      lctx.setTransform(s, 0, 0, s, scale * layout.W / 2, scale * layout.H / 2);
      [[sprite.glow, bs.a * bs.glowMul], [sprite.back, bs.a], [sprite.front, bs.a]].forEach(([img, amount]) => {
        let total = img ? amount : 0;
        while (total > 0.002) {
          const alpha = Math.min(1, total);
          total -= alpha;
          lctx.globalAlpha = alpha;
          lctx.drawImage(img, -sprite.icx, -sprite.icy);
        }
      });
    }

    // 中央に出す大きな文字の画像（画像の短い辺に対する割合で大きさを決め、文字ごとに作って残しておく）
    soloSprite(g, page, scene) {
      const { layout } = this.prepared;
      const px = Math.max(8, Math.min(layout.W, layout.H) * clamp(scene.soloSize ?? 0.55, 0.05, 1));
      const gen = `${this.spriteKey}|${px.toFixed(2)}`;
      if (gen !== this.soloKey) {
        this.soloCache = new Map();
        this.soloPixels = 0;
        this.soloKey = gen;
      }
      const key = `${g.ch}|${g.rot ? 1 : 0}`;
      let sprite = this.soloCache.get(key);
      if (sprite) {
        this.soloCache.delete(key);
        this.soloCache.set(key, sprite);
        return sprite;
      }
      const k = px / g.size;
      const font = this.fontsFor(scene).mainFont(px);
      const metrics = page.mainMetrics || { inkA: g.size * 0.8, inkD: g.size * 0.12 };
      const inkA = metrics.inkA * k, inkD = metrics.inkD * k;
      this.measure.font = font;
      const adv = this.measure.measureText(g.ch).width;
      sprite = buildGlyphSprite({ ch: g.ch, size: px, vertical: g.vertical, rot: g.rot, bx: 0, by: inkA }, font, groupStyle(scene, 0, px), { w: adv, h: inkA + inkD, inkA, inkD });
      sprite.icx = (sprite.ink.x0 + sprite.ink.x1) / 2;
      sprite.icy = (sprite.ink.y0 + sprite.ink.y1) / 2;
      sprite.pixels = sprite.w * sprite.h * [sprite.glow, sprite.back, sprite.front].filter(Boolean).length;
      this.soloCache.set(key, sprite);
      this.soloPixels += sprite.pixels;
      // 大きな画像なので、しばらく使っていないものから捨てる
      while (this.soloPixels > SOLO_CACHE_PIXELS && this.soloCache.size > 1) {
        const [oldKey, old] = this.soloCache.entries().next().value;
        this.soloCache.delete(oldKey);
        this.soloPixels -= old.pixels;
      }
      return sprite;
    }

    drawCursor(pg, page, t, bs, m, scene) {
      const { layout, timeline } = this.prepared;
      if (Number.isFinite(pg.outEnd) && t >= pg.holdEnd) return;
      let last = null;
      let firstGlyph = null;
      for (let i = page.first; i < page.last; i++) {
        const g = layout.glyphs[i];
        if (g.group !== 0) continue;
        if (!firstGlyph) firstGlyph = g;
        if (timeline.inStart[i] <= t) last = g;
      }
      if (!firstGlyph) return;
      const typingDone = t >= pg.inEnd;
      if (typingDone && Math.floor((t - pg.inEnd) / 0.45) % 2 === 1) return;
      const size = layout.size;
      let x, y, w, h;
      if (layout.vertical) {
        const ref = last || firstGlyph;
        x = ref.penX - size * 0.45;
        y = last ? ref.baseline + ref.adv + size * (scene.letterSpacing || 0) + size * 0.05 : ref.baseline + size * 0.05;
        w = size * 0.9; h = size * 0.08;
      } else {
        const ref = last || firstGlyph;
        x = last ? ref.penX + ref.adv + size * 0.06 : ref.penX;
        y = ref.baseline - size * 0.82;
        w = size * 0.07; h = size * 0.98;
      }
      const lctx = this.lctx;
      lctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      lctx.globalAlpha = clamp(bs.a);
      const fill = scene.fill || {};
      lctx.fillStyle = scene.cursorColor || fill.color || '#ffffff';
      lctx.fillRect(x, y, w, h);
    }

    transformedBox(box, bs, scale, size) {
      const pad = size * 0.25;
      const cx = (box.x0 + box.x1) / 2 + bs.x;
      const cy = (box.y0 + box.y1) / 2 + bs.y;
      const hw = (box.x1 - box.x0) / 2 * Math.abs(bs.s * bs.sx) + pad;
      const hh = (box.y1 - box.y0) / 2 * Math.abs(bs.s * bs.sy) + pad;
      return { x: (cx - hw) * scale, y: (cy - hh) * scale, w: hw * 2 * scale, h: hh * 2 * scale };
    }

    applyMask(mask, rect, soft) {
      const lctx = this.lctx;
      const cw = this.layer.width, ch = this.layer.height;
      const s = Math.max(1, soft);
      const p = clamp(mask.p);
      lctx.save();
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.globalCompositeOperation = 'destination-in';
      let grad;
      const horizontal = mask.dir === 'lr' || mask.dir === 'rl' || mask.dir === 'center';
      if (mask.dir === 'center') {
        const c = horizontal ? rect.x + rect.w / 2 : rect.y + rect.h / 2;
        const half = rect.w / 2;
        const span = half + s * 2;
        grad = lctx.createLinearGradient(c - span, 0, c + span, 0);
        const at = x => clamp((x + span) / (2 * span));
        if (!mask.out) {
          const w = lerp(0, half + s, p);
          const peak = clamp(w / s);
          grad.addColorStop(0, 'rgba(0,0,0,0)');
          grad.addColorStop(at(-w), 'rgba(0,0,0,0)');
          grad.addColorStop(at(Math.min(0, -w + s)), `rgba(0,0,0,${peak})`);
          grad.addColorStop(at(Math.max(0, w - s)), `rgba(0,0,0,${peak})`);
          grad.addColorStop(at(w), 'rgba(0,0,0,0)');
          grad.addColorStop(1, 'rgba(0,0,0,0)');
        } else {
          const w = lerp(-s, half, p);
          grad.addColorStop(0, 'rgba(0,0,0,1)');
          if (w > 0) {
            grad.addColorStop(at(-w - s), 'rgba(0,0,0,1)');
            grad.addColorStop(at(-w), 'rgba(0,0,0,0)');
            grad.addColorStop(at(w), 'rgba(0,0,0,0)');
            grad.addColorStop(at(w + s), 'rgba(0,0,0,1)');
          } else {
            const floor = clamp(-w / s);
            grad.addColorStop(at(-w - s), 'rgba(0,0,0,1)');
            grad.addColorStop(0.5, `rgba(0,0,0,${floor})`);
            grad.addColorStop(at(w + s), 'rgba(0,0,0,1)');
          }
          grad.addColorStop(1, 'rgba(0,0,0,1)');
        }
      } else {
        const neg = mask.dir === 'rl' || mask.dir === 'bt';
        const lo = horizontal ? rect.x : rect.y;
        const hi = horizontal ? rect.x + rect.w : rect.y + rect.h;
        const U0 = neg ? -hi : lo;
        const U1 = neg ? -lo : hi;
        let a, b, fromOpaque;
        if (!mask.out) {
          const E = lerp(U0, U1 + s, p);
          a = E - s; b = E; fromOpaque = true;
        } else {
          const E = lerp(U0 - s, U1, p);
          a = E; b = E + s; fromOpaque = false;
        }
        if (neg) { const na = -a, nb = -b; a = na; b = nb; }
        grad = horizontal ? lctx.createLinearGradient(a, 0, b, 0) : lctx.createLinearGradient(0, a, 0, b);
        grad.addColorStop(0, fromOpaque ? 'rgba(0,0,0,1)' : 'rgba(0,0,0,0)');
        grad.addColorStop(1, fromOpaque ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)');
      }
      lctx.fillStyle = grad;
      lctx.fillRect(0, 0, cw, ch);
      lctx.restore();
    }

    applyEdgeFade(vertical, cw, ch) {
      const lctx = this.lctx;
      lctx.save();
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.globalCompositeOperation = 'destination-in';
      const grad = vertical ? lctx.createLinearGradient(0, 0, cw, 0) : lctx.createLinearGradient(0, 0, 0, ch);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.14, 'rgba(0,0,0,1)');
      grad.addColorStop(0.86, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = grad;
      lctx.fillRect(0, 0, cw, ch);
      lctx.restore();
    }

    // ノイズ：左右にずらした2色の写し（scene.glitchColor / glitchColor2）と、横に切ってずらした帯
    applyGlitch(amount, t, rect, sizePx, seedBase, scene) {
      const cw = this.layer.width, ch = this.layer.height;
      const lctx = this.lctx;
      const a = this.tmpA.getContext('2d');
      const b = this.tmpB.getContext('2d');
      const frame = Math.floor(t * 20);
      const seed = 400 + seedBase * 7;
      const k = clamp(amount, 0, 2);
      a.setTransform(1, 0, 0, 1, 0, 0);
      a.globalCompositeOperation = 'source-over';
      a.clearRect(0, 0, cw, ch);
      a.drawImage(this.layer, 0, 0);
      // 色ずれ
      const shift = Math.max(1, sizePx * 0.045 * k * (0.6 + rnd(frame, 1, seed) * 0.8));
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(0, 0, cw, ch);
      const tint = (color, dx) => {
        b.setTransform(1, 0, 0, 1, 0, 0);
        b.globalCompositeOperation = 'source-over';
        b.clearRect(0, 0, cw, ch);
        b.drawImage(this.tmpA, 0, 0);
        b.globalCompositeOperation = 'source-in';
        b.fillStyle = color;
        b.fillRect(0, 0, cw, ch);
        b.globalCompositeOperation = 'source-over';
        lctx.globalAlpha = 0.8;
        lctx.drawImage(this.tmpB, dx, 0);
      };
      tint(scene.glitchColor || '#ff285a', -shift);
      tint(scene.glitchColor2 || '#28e6ff', shift);
      lctx.globalAlpha = 1;
      lctx.drawImage(this.tmpA, 0, 0);
      // 横スライス
      a.clearRect(0, 0, cw, ch);
      a.drawImage(this.layer, 0, 0);
      const slices = 2 + Math.floor(rnd(frame, 2, seed) * 5 * Math.min(1, k + 0.3));
      for (let i = 0; i < slices; i++) {
        const y = rect.y + rnd(frame, 10 + i, seed) * rect.h;
        const h = Math.max(1, sizePx * (0.03 + rnd(frame, 30 + i, seed) * 0.14));
        const dx = (rnd(frame, 50 + i, seed) - 0.5) * sizePx * 0.5 * k;
        lctx.clearRect(0, y, cw, h);
        lctx.drawImage(this.tmpA, 0, y, cw, h, dx, y, cw, h);
      }
    }

    drawDeco(ctx, pg, page, t, bs, scale, scene) {
      const d = scene.deco || {};
      if (!d.type || d.type === 'none') return;
      const { pin, pout } = this.decoProgress(pg, t);
      const animated = d.anim && d.anim !== 'none';
      const ein = animated ? EASE.outCubic(pin) : (pin > 0 ? 1 : 0);
      const eout = animated ? EASE.inCubic(pout) : (pout >= 1 ? 1 : 0);
      if (ein <= 0.001 || eout >= 0.999) return;
      const grow = d.anim === 'grow';
      const g = grow ? ein * (1 - eout) : 1;
      const alpha = grow ? clamp(g * 4) : ein * (1 - eout);
      if (alpha <= 0.002) return;
      const { layout } = this.prepared;
      const size = layout.size;
      const vertical = layout.vertical;
      const W = scene.width, H = scene.height;
      const pad = (d.pad || 0) * size;
      const ext = (d.extend || 0) * size;
      const th = Math.max(0.5, (d.thickness || 2) * layout.fit);
      const box = page.box;
      const mb = page.mainBox;
      const lineColor = d.color2 || '#ffffff';
      const fillColor = colorWithAlpha(d.color || '#000000', clamp(d.opacity ?? 0.5));
      ctx.save();
      ctx.setTransform(scale, 0, 0, scale, bs.x * scale, bs.y * scale);
      ctx.globalAlpha = alpha;
      // 線の装飾にも文字と同じ縁取りをつける：外側の縁取り → 縁取り → 線の順に、太い線から重ねる
      const edges = [];
      if (d.outline) {
        const e1 = scene.stroke && scene.stroke.on ? Math.max(0, scene.stroke.width || 0) * layout.fit : 0;
        const e2 = scene.stroke2 && scene.stroke2.on ? Math.max(0, scene.stroke2.width || 0) * layout.fit : 0;
        if (e2 > 0) edges.push({ w: th + 2 * (e1 + e2), color: scene.stroke2.color });
        if (e1 > 0) edges.push({ w: th + 2 * e1, color: scene.stroke.color });
      }
      // path は線の形を作る関数（線の端の縁取りは、端を四角く伸ばして囲む）
      const strokePath = (path, cap) => {
        edges.forEach(edge => {
          ctx.strokeStyle = edge.color;
          ctx.lineWidth = edge.w;
          ctx.lineCap = 'square';
          ctx.beginPath();
          path();
          ctx.stroke();
        });
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = th;
        ctx.lineCap = cap;
        ctx.beginPath();
        path();
        ctx.stroke();
      };
      const line = (x0, y0, x1, y1) => strokePath(() => { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }, 'butt');
      switch (d.type) {
        case 'band': {
          const soft = clamp(d.soft ?? 0.4, 0, 1) * 0.5;
          const side = clamp(d.sideFade ?? 0, 0, 1) * 0.5;
          if (!vertical) {
            const cy = (box.y0 + box.y1) / 2;
            const half = (box.y1 - box.y0) / 2 + pad;
            const hh = half * (grow ? g : 1);
            this.drawBand(ctx, -bs.x, cy - hh, W, hh * 2, false, soft, side, fillColor, scale);
          } else {
            const cx = (box.x0 + box.x1) / 2;
            const half = (box.x1 - box.x0) / 2 + pad;
            const hw = half * (grow ? g : 1);
            this.drawBand(ctx, cx - hw, -bs.y, hw * 2, H, true, soft, side, fillColor, scale);
          }
          break;
        }
        case 'tape': {
          // 虎柄テープ：文字の上下（縦書きは右と左）に、画面の端から端までしま模様のテープを張る。
          // 上（右）のテープは左（上）へ、下（左）のテープは右（下）へ流れ、点滅する。
          // 「伸びる」では、それぞれ流れる向きに画面の外からすべり込み、退場で流れる向きへ抜けていく
          const tw = Math.max(2, (d.tapeSize ?? 40) * layout.fit);
          const speed = Math.max(0, d.tapeSpeed ?? 90) * layout.fit;
          const blink = clamp(d.tapeBlink ?? 0.5);
          const colorA = d.tapeColor || '#f5c400';
          const colorB = d.tapeStripe || '#151515';
          const len = vertical ? H : W;
          const origin = vertical ? -bs.y : -bs.x;
          const inShift = grow ? len * ein : 0;
          const outShift = grow ? len * eout : 0;
          const baseA = grow ? 1 : ein * (1 - eout);
          // 1本目（上／右）：流れる向きの逆側の端から入り、流れる向きへ抜ける
          const firstA = origin + len - inShift, firstB = origin + len - outShift;
          // 2本目（下／左）：反対向き
          const secondA = origin + outShift, secondB = origin + inShift;
          const drift = speed * t;
          const tapes = vertical
            ? [{ v0: box.x1 + pad, a: firstA, b: firstB, offset: origin - drift - inShift - outShift, phase: 0 },
              { v0: box.x0 - pad - tw, a: secondA, b: secondB, offset: origin + drift + inShift + outShift, phase: 0.5 }]
            : [{ v0: box.y0 - pad - tw, a: firstA, b: firstB, offset: origin - drift - inShift - outShift, phase: 0 },
              { v0: box.y1 + pad, a: secondA, b: secondB, offset: origin + drift + inShift + outShift, phase: 0.5 }];
          tapes.forEach(tp => {
            const a = Math.max(origin, tp.a), b = Math.min(origin + len, tp.b);
            if (b - a < 0.5) return;
            ctx.globalAlpha = baseA * (1 - blink * tapeBlinkWave(t, tp.phase));
            if (ctx.globalAlpha <= 0.002) return;
            this.drawTape(ctx, vertical, a, b, tp.v0, tw, tp.offset, colorA, colorB);
          });
          break;
        }
        case 'box': {
          const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
          const hw = (box.x1 - box.x0) / 2 + pad, hh = (box.y1 - box.y0) / 2 + pad;
          ctx.translate(cx, cy);
          ctx.scale(bs.s * bs.sx * (grow && !vertical ? g : 1), bs.s * bs.sy * (grow && vertical ? g : 1));
          const radius = Math.min(hw, hh, (d.radius ?? 0.2) * size);
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(-hw, -hh, hw * 2, hh * 2, radius);
          else ctx.rect(-hw, -hh, hw * 2, hh * 2);
          ctx.fillStyle = fillColor;
          ctx.fill();
          if ((d.thickness || 0) > 0) { ctx.strokeStyle = lineColor; ctx.lineWidth = th; ctx.stroke(); }
          break;
        }
        case 'lines': {
          if (!vertical) {
            const cx = (box.x0 + box.x1) / 2;
            const half = ((box.x1 - box.x0) / 2 + ext) * g;
            line(cx - half, box.y0 - pad, cx + half, box.y0 - pad);
            line(cx - half, box.y1 + pad, cx + half, box.y1 + pad);
          } else {
            const cy = (box.y0 + box.y1) / 2;
            const half = ((box.y1 - box.y0) / 2 + ext) * g;
            line(box.x0 - pad, cy - half, box.x0 - pad, cy + half);
            line(box.x1 + pad, cy - half, box.x1 + pad, cy + half);
          }
          break;
        }
        case 'underline': {
          const sub = page.subBox;
          if (!vertical) {
            let y = mb.y1 + pad;
            if (sub && sub.y0 >= mb.y1) y = (mb.y1 + sub.y0) / 2;
            const x0 = box.x0 - ext, x1 = box.x1 + ext;
            const a = grow ? lerp(x0, x1, eout) : x0;
            const b = grow ? lerp(x0, x1, ein) : x1;
            if (b > a) line(a, y, b, y);
          } else {
            let x = mb.x0 - pad;
            if (sub && sub.x1 <= mb.x0) x = (mb.x0 + sub.x1) / 2;
            const y0 = box.y0 - ext, y1 = box.y1 + ext;
            const a = grow ? lerp(y0, y1, eout) : y0;
            const b = grow ? lerp(y0, y1, ein) : y1;
            if (b > a) line(x, a, x, b);
          }
          break;
        }
        case 'sides': {
          const len = Math.max(size * 0.2, ext) * g;
          if (!vertical) {
            const cy = (mb.y0 + mb.y1) / 2;
            line(mb.x0 - pad - len, cy, mb.x0 - pad, cy);
            line(mb.x1 + pad, cy, mb.x1 + pad + len, cy);
          } else {
            const cx = (mb.x0 + mb.x1) / 2;
            line(cx, mb.y0 - pad - len, cx, mb.y0 - pad);
            line(cx, mb.y1 + pad, cx, mb.y1 + pad + len);
          }
          break;
        }
        case 'bar': {
          if (!vertical) {
            const x = box.x0 - pad - th / 2;
            line(x, box.y0, x, lerp(box.y0, box.y1, g));
          } else {
            const y = box.y0 - pad - th / 2;
            line(box.x1, y, lerp(box.x1, box.x0, g), y);
          }
          break;
        }
        case 'corners': {
          const x0 = box.x0 - pad, y0 = box.y0 - pad, x1 = box.x1 + pad, y1 = box.y1 + pad;
          const arm = Math.min(x1 - x0, y1 - y0) * 0.28 * g;
          const inset = (1 - g) * size * 0.4;
          const corner = (x, y, sx, sy) => {
            const cx = x + sx * -inset, cy = y + sy * -inset;
            ctx.moveTo(cx + sx * arm, cy);
            ctx.lineTo(cx, cy);
            ctx.lineTo(cx, cy + sy * arm);
          };
          strokePath(() => {
            corner(x0, y0, 1, 1);
            corner(x1, y0, -1, 1);
            corner(x0, y1, 1, -1);
            corner(x1, y1, -1, -1);
          }, 'square');
          break;
        }
        case 'frame': {
          // タイトル枠：メインの文字だけを囲み、サブテキストは枠の外に置く（余白はサブテキストとの間の半分まで）。
          // 左右（縦書きは上下）は extend の分だけ延ばして画面の内側で止める
          const inset = Math.max(th, (scene.marginX ?? 64) * 0.5);
          const sb = page.subBox;
          let x0, y0, x1, y1;
          if (!vertical) {
            let padT = pad, padB = pad;
            if (sb && sb.y0 >= mb.y1) padB = Math.min(pad, (sb.y0 - mb.y1) / 2);
            else if (sb && sb.y1 <= mb.y0) padT = Math.min(pad, (mb.y0 - sb.y1) / 2);
            y0 = mb.y0 - padT;
            y1 = mb.y1 + padB;
            x0 = Math.max(-bs.x + inset, mb.x0 - pad - ext);
            x1 = Math.min(W - bs.x - inset, mb.x1 + pad + ext);
          } else {
            let padL = pad, padR = pad;
            if (sb && sb.x1 <= mb.x0) padL = Math.min(pad, (mb.x0 - sb.x1) / 2);
            else if (sb && sb.x0 >= mb.x1) padR = Math.min(pad, (sb.x0 - mb.x1) / 2);
            x0 = mb.x0 - padL;
            x1 = mb.x1 + padR;
            y0 = Math.max(-bs.y + inset, mb.y0 - pad - ext);
            y1 = Math.min(H - bs.y - inset, mb.y1 + pad + ext);
          }
          if (x1 - x0 < 1 || y1 - y0 < 1) break;
          const fillA = clamp(d.opacity ?? 0) * (grow ? clamp(g * 1.5) : 1);
          if (fillA > 0.002) {
            ctx.save();
            ctx.globalAlpha = alpha * fillA;
            ctx.fillStyle = d.color || '#000000';
            ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
            ctx.restore();
          }
          if ((d.thickness || 0) > 0) {
            // 伸びるアニメーションでは、上辺（縦書きは右辺）の始点から一筆書きで線が伸びる／消える
            const w = x1 - x0, h = y1 - y0, perimeter = 2 * (w + h);
            ctx.lineJoin = 'miter';
            if (grow && g < 0.999) ctx.setLineDash([perimeter * g, perimeter]);
            strokePath(() => {
              if (!vertical) {
                ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y1); ctx.lineTo(x0, y1);
              } else {
                ctx.moveTo(x1, y0); ctx.lineTo(x1, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y0);
              }
              ctx.closePath();
            }, 'butt');
            ctx.setLineDash([]);
          }
          break;
        }
        default: break;
      }
      ctx.restore();
    }

    // しま模様のテープを1本描く。u は長さ方向（横書きは x、縦書きは y）、v0・tw は太さ方向の位置と太さ。
    // しまの位置は offset だけで決まり、見えている範囲 [u0, u1] が変わっても模様は動かない
    drawTape(ctx, vertical, u0, u1, v0, tw, offset, colorA, colorB) {
      const pt = (u, v) => (vertical ? [v, u] : [u, v]);
      ctx.save();
      ctx.beginPath();
      if (vertical) ctx.rect(v0, u0, tw, u1 - u0);
      else ctx.rect(u0, v0, u1 - u0, tw);
      ctx.clip();
      ctx.fillStyle = colorA;
      ctx.fill();
      const period = tw * 1.3;
      const stripe = period * 0.5;
      const slant = tw;
      const first = Math.floor((u0 - slant - stripe - offset) / period) - 1;
      ctx.beginPath();
      for (let k = first; ; k++) {
        const u = k * period + offset;
        if (u > u1 + period) break;
        const p1 = pt(u, v0 + tw), p2 = pt(u + stripe, v0 + tw), p3 = pt(u + stripe + slant, v0), p4 = pt(u + slant, v0);
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.lineTo(p3[0], p3[1]);
        ctx.lineTo(p4[0], p4[1]);
        ctx.closePath();
      }
      ctx.fillStyle = colorB;
      ctx.fill();
      ctx.restore();
    }

    drawBand(ctx, x, y, w, h, vertical, soft, side, color, scale) {
      if (w <= 0.5 || h <= 0.5) return;
      const pw = Math.max(1, Math.ceil(w * scale));
      const ph = Math.max(1, Math.ceil(h * scale));
      const c = this.bandCanvas;
      const key = `${pw}|${ph}|${vertical}|${soft}|${side}|${color}`;
      if (this.bandKey === key) {
        this.blitBand(ctx, c, x, y, scale);
        return;
      }
      this.bandKey = key;
      if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
      const b = c.getContext('2d');
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.globalCompositeOperation = 'source-over';
      b.clearRect(0, 0, pw, ph);
      b.fillStyle = color;
      b.fillRect(0, 0, pw, ph);
      b.globalCompositeOperation = 'destination-in';
      const toMask = grad => {
        b.fillStyle = grad;
        b.fillRect(0, 0, pw, ph);
      };
      const acrossMask = vertical ? b.createLinearGradient(0, 0, pw, 0) : b.createLinearGradient(0, 0, 0, ph);
      acrossMask.addColorStop(0, soft > 0 ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)');
      acrossMask.addColorStop(Math.max(0.0001, soft), 'rgba(0,0,0,1)');
      acrossMask.addColorStop(Math.min(0.9999, 1 - soft), 'rgba(0,0,0,1)');
      acrossMask.addColorStop(1, soft > 0 ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)');
      toMask(acrossMask);
      if (side > 0) {
        const along = vertical ? b.createLinearGradient(0, 0, 0, ph) : b.createLinearGradient(0, 0, pw, 0);
        along.addColorStop(0, 'rgba(0,0,0,0)');
        along.addColorStop(side, 'rgba(0,0,0,1)');
        along.addColorStop(1 - side, 'rgba(0,0,0,1)');
        along.addColorStop(1, 'rgba(0,0,0,0)');
        toMask(along);
      }
      this.blitBand(ctx, c, x, y, scale);
    }

    blitBand(ctx, c, x, y, scale) {
      ctx.save();
      const m = ctx.getTransform();
      ctx.setTransform(1, 0, 0, 1, m.e, m.f);
      ctx.drawImage(c, x * scale, y * scale);
      ctx.restore();
    }
  }

  const api = {
    TextRenderer,
    IN_EFFECTS,
    OUT_EFFECTS,
    HOLD_EFFECTS,
    IN_MAP,
    OUT_MAP,
    HOLD_MAP,
    EASE,
    EASING_CHOICES,
    dirFor,
    graphemes,
    fontString,
    cssFontFamily,
    computeLayout,
    buildTimeline,
    FILTER_SUPPORTED
  };
  root.TextApngEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
