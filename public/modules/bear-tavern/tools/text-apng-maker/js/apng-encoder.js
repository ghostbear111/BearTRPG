/*
 * 文字画像APNGメーカー — APNG / ZIP エンコーダー
 * 外部ライブラリに依存せず、ブラウザ標準の CompressionStream (zlib) で APNG を組み立てます。
 *  - フレーム差分の矩形だけを保存（dispose: NONE / blend: SOURCE）
 *  - 前フレームと同一のフレームは結合して表示時間を延長
 *  - 任意で 256色パレット（PLTE + tRNS）に減色して軽量化
 */
(function (root) {
  'use strict';

  const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes, start = 0, end = bytes.length, seed = 0) {
    let crc = (seed ^ 0xffffffff) >>> 0;
    for (let i = start; i < end; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
    return out;
  }

  function isCompressionSupported() {
    return typeof CompressionStream === 'function' && typeof Response === 'function' && typeof Blob === 'function';
  }

  async function deflateZlib(bytes) {
    if (!isCompressionSupported()) {
      const error = new Error('CompressionStream is not supported.');
      error.code = 'COMPRESSION_UNSUPPORTED';
      throw error;
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /* ---------- PNG フィルター ---------- */

  function signedAbs(v) {
    return v < 128 ? v : 256 - v;
  }

  // RGBA(bpp=4) はアダプティブフィルター（最小絶対和）、インデックス(bpp=1)は None。
  function filterImage(src, width, height, bpp) {
    const rowBytes = width * bpp;
    const out = new Uint8Array((rowBytes + 1) * height);
    if (bpp === 1) {
      for (let y = 0; y < height; y++) {
        const o = y * (rowBytes + 1);
        out[o] = 0;
        out.set(src.subarray(y * rowBytes, (y + 1) * rowBytes), o + 1);
      }
      return out;
    }
    for (let y = 0; y < height; y++) {
      const cur = y * rowBytes;
      const prev = cur - rowBytes;
      const hasPrev = y > 0;
      let sNone = 0, sSub = 0, sUp = 0, sAvg = 0, sPaeth = 0;
      let allZero = true;
      for (let i = 0; i < rowBytes; i++) {
        const x = src[cur + i];
        if (x !== 0) allZero = false;
        const a = i >= bpp ? src[cur + i - bpp] : 0;
        const b = hasPrev ? src[prev + i] : 0;
        const c = hasPrev && i >= bpp ? src[prev + i - bpp] : 0;
        sNone += signedAbs(x);
        sSub += signedAbs((x - a) & 255);
        sUp += signedAbs((x - b) & 255);
        sAvg += signedAbs((x - ((a + b) >> 1)) & 255);
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
        sPaeth += signedAbs((x - pr) & 255);
      }
      const o = y * (rowBytes + 1);
      let type = 0;
      if (!allZero) {
        let best = sNone;
        if (sSub < best) { best = sSub; type = 1; }
        if (sUp < best) { best = sUp; type = 2; }
        if (sAvg < best) { best = sAvg; type = 3; }
        if (sPaeth < best) { type = 4; }
      }
      out[o] = type;
      for (let i = 0; i < rowBytes; i++) {
        const x = src[cur + i];
        const a = i >= bpp ? src[cur + i - bpp] : 0;
        const b = hasPrev ? src[prev + i] : 0;
        let v;
        if (type === 0) v = x;
        else if (type === 1) v = x - a;
        else if (type === 2) v = x - b;
        else if (type === 3) v = x - ((a + b) >> 1);
        else {
          const c = hasPrev && i >= bpp ? src[prev + i - bpp] : 0;
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = x - ((pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c));
        }
        out[o + 1 + i] = v & 255;
      }
    }
    return out;
  }

  /* ---------- フレーム差分 ---------- */

  function diffRect(prev, cur, width, height) {
    let minX = width, minY = -1, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      const off = y * width;
      let left = -1;
      for (let x = 0; x < width; x++) {
        if (prev[off + x] !== cur[off + x]) { left = x; break; }
      }
      if (left < 0) continue;
      let right = left;
      for (let x = width - 1; x > left; x--) {
        if (prev[off + x] !== cur[off + x]) { right = x; break; }
      }
      if (minY < 0) minY = y;
      maxY = y;
      if (left < minX) minX = left;
      if (right > maxX) maxX = right;
    }
    if (maxY < 0) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  function extractRegion(src, width, rect, bpp) {
    const rowBytes = rect.w * bpp;
    const out = new Uint8Array(rowBytes * rect.h);
    for (let y = 0; y < rect.h; y++) {
      const start = ((rect.y + y) * width + rect.x) * bpp;
      out.set(src.subarray(start, start + rowBytes), y * rowBytes);
    }
    return out;
  }

  function toBytes(pixels) {
    if (pixels instanceof Uint8Array) return pixels;
    return new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  }

  /* ---------- APNG エンコーダー ---------- */

  function view32(bytes) {
    if (bytes.byteOffset % 4 === 0) return new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 2);
    return new Uint32Array(new Uint8Array(bytes).buffer);
  }

  // 入力は常に RGBA。パレット指定時は変化した矩形だけをパレット番号に変換して保存する。
  class ApngEncoder {
    constructor(options) {
      const { width, height, fps, loops = 0, quantizer = null, optimize = true } = options;
      this.width = width;
      this.height = height;
      this.fps = Math.max(1, Math.round(fps));
      this.loops = Math.max(0, Math.round(loops));
      this.quantizer = quantizer;
      this.palette = quantizer ? quantizer.result || quantizer.build() : null;
      this.indexed = Boolean(this.palette);
      this.bpp = this.indexed ? 1 : 4;
      this.optimize = optimize;
      this.frames = [];
      this.prev = null;
      this.defaultData = null;
    }

    async _encodeRegion(rgba, width, height) {
      const data = this.indexed ? this.quantizer.mapFrame(rgba) : rgba;
      return deflateZlib(filterImage(data, width, height, this.bpp));
    }

    // APNG非対応の環境で表示される静止画（アニメーションには含めない）
    async setDefaultImage(pixels) {
      this.defaultData = await this._encodeRegion(toBytes(pixels), this.width, this.height);
    }

    async addFrame(pixels) {
      const bytes = toBytes(pixels);
      const expected = this.width * this.height * 4;
      if (bytes.length !== expected) throw new Error(`Frame size mismatch: ${bytes.length} !== ${expected}`);
      const view = view32(bytes);
      let rect = { x: 0, y: 0, w: this.width, h: this.height };
      if (this.prev && this.optimize) {
        const changed = diffRect(this.prev, view, this.width, this.height);
        if (!changed) {
          this.frames[this.frames.length - 1].delay += 1;
          return false;
        }
        rect = changed;
      }
      const full = rect.w === this.width && rect.h === this.height;
      const region = full ? bytes : extractRegion(bytes, this.width, rect, 4);
      const data = await this._encodeRegion(region, rect.w, rect.h);
      this.frames.push({ rect, delay: 1, data });
      this.prev = new Uint32Array(view);
      return true;
    }

    get frameCount() {
      return this.frames.length;
    }

    _fcTL(seq, frame) {
      const data = new Uint8Array(26);
      const view = new DataView(data.buffer);
      let num = frame.delay;
      let den = this.fps;
      while (num > 65535) { num = Math.round(num / 2); den = Math.max(1, Math.round(den / 2)); }
      view.setUint32(0, seq);
      view.setUint32(4, frame.rect.w);
      view.setUint32(8, frame.rect.h);
      view.setUint32(12, frame.rect.x);
      view.setUint32(16, frame.rect.y);
      view.setUint16(20, num);
      view.setUint16(22, den);
      data[24] = 0; // APNG_DISPOSE_OP_NONE
      data[25] = 0; // APNG_BLEND_OP_SOURCE
      return makeChunk('fcTL', data);
    }

    finish() {
      if (!this.frames.length) throw new Error('No frames to encode.');
      const parts = [PNG_SIGNATURE];
      const ihdr = new Uint8Array(13);
      const ihdrView = new DataView(ihdr.buffer);
      ihdrView.setUint32(0, this.width);
      ihdrView.setUint32(4, this.height);
      ihdr[8] = 8;
      ihdr[9] = this.indexed ? 3 : 6;
      parts.push(makeChunk('IHDR', ihdr));

      const actl = new Uint8Array(8);
      const actlView = new DataView(actl.buffer);
      actlView.setUint32(0, this.frames.length);
      actlView.setUint32(4, this.loops);
      parts.push(makeChunk('acTL', actl));

      if (this.indexed) {
        const count = this.palette.size;
        const plte = new Uint8Array(count * 3);
        const trns = new Uint8Array(count);
        for (let i = 0; i < count; i++) {
          plte[i * 3] = this.palette.rgba[i * 4];
          plte[i * 3 + 1] = this.palette.rgba[i * 4 + 1];
          plte[i * 3 + 2] = this.palette.rgba[i * 4 + 2];
          trns[i] = this.palette.rgba[i * 4 + 3];
        }
        parts.push(makeChunk('PLTE', plte));
        parts.push(makeChunk('tRNS', trns));
      }

      let seq = 0;
      const pushFdat = frame => {
        const payload = new Uint8Array(4 + frame.data.length);
        new DataView(payload.buffer).setUint32(0, seq++);
        payload.set(frame.data, 4);
        parts.push(makeChunk('fdAT', payload));
      };

      if (this.defaultData) {
        parts.push(makeChunk('IDAT', this.defaultData));
        this.frames.forEach(frame => {
          parts.push(this._fcTL(seq++, frame));
          pushFdat(frame);
        });
      } else {
        this.frames.forEach((frame, index) => {
          parts.push(this._fcTL(seq++, frame));
          if (index === 0) parts.push(makeChunk('IDAT', frame.data));
          else pushFdat(frame);
        });
      }
      parts.push(makeChunk('IEND', new Uint8Array(0)));
      return new Blob(parts, { type: 'image/png' });
    }
  }

  // 1回目の走査：変化した矩形だけを色集計し、描画内容の外接矩形（自動トリミング用）を求める
  class FrameAnalyzer {
    constructor(width, height, options = {}) {
      this.width = width;
      this.height = height;
      this.quantizer = options.quantizer || null;
      this.prev = null;
      this.bounds = null;
      this.changedFrames = 0;
    }

    add(pixels) {
      const bytes = toBytes(pixels);
      const view = view32(bytes);
      let rect = { x: 0, y: 0, w: this.width, h: this.height };
      if (this.prev) {
        rect = diffRect(this.prev, view, this.width, this.height);
        if (!rect) return;
      }
      this.changedFrames += 1;
      const region = extractRegion(bytes, this.width, rect, 4);
      if (this.quantizer) this.quantizer.addFrame(region);
      const content = alphaBounds(region, rect.w, rect.h);
      if (content) {
        const b = { x0: rect.x + content.x0, y0: rect.y + content.y0, x1: rect.x + content.x1, y1: rect.y + content.y1 };
        this.bounds = this.bounds
          ? { x0: Math.min(this.bounds.x0, b.x0), y0: Math.min(this.bounds.y0, b.y0), x1: Math.max(this.bounds.x1, b.x1), y1: Math.max(this.bounds.y1, b.y1) }
          : b;
      }
      this.prev = new Uint32Array(view);
    }
  }

  function alphaBounds(rgba, width, height) {
    let x0 = width, y0 = -1, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) {
      const row = y * width * 4;
      let left = -1;
      for (let x = 0; x < width; x++) if (rgba[row + x * 4 + 3] !== 0) { left = x; break; }
      if (left < 0) continue;
      let right = left;
      for (let x = width - 1; x > left; x--) if (rgba[row + x * 4 + 3] !== 0) { right = x; break; }
      if (y0 < 0) y0 = y;
      y1 = y;
      if (left < x0) x0 = left;
      if (right > x1) x1 = right;
    }
    return y0 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
  }

  function cropFrame(rgba, width, rect) {
    return extractRegion(toBytes(rgba), width, rect, 4);
  }

  /* ---------- 256色パレット減色 ---------- */

  const BIN_BITS = 21;
  const CHANNEL_WEIGHTS = [1.0, 1.25, 0.75, 1.6];

  function binKey(r, g, b, a) {
    return ((r >> 3) << 16) | ((g >> 3) << 11) | ((b >> 3) << 6) | (a >> 2);
  }

  class PaletteQuantizer {
    constructor(maxColors = 256) {
      this.maxColors = Math.max(2, Math.min(256, maxColors));
      this.binIndex = new Int32Array(1 << BIN_BITS).fill(-1);
      this.capacity = 4096;
      this.binCount = 0;
      this.keys = new Int32Array(this.capacity);
      this.weights = new Float64Array(this.capacity);
      this.sums = new Float64Array(this.capacity * 4);
      this.exact = new Map();
      this.exactOverflow = false;
      this.result = null;
    }

    _grow() {
      this.capacity *= 2;
      const keys = new Int32Array(this.capacity); keys.set(this.keys); this.keys = keys;
      const weights = new Float64Array(this.capacity); weights.set(this.weights); this.weights = weights;
      const sums = new Float64Array(this.capacity * 4); sums.set(this.sums); this.sums = sums;
    }

    addFrame(pixels) {
      const data = toBytes(pixels);
      const limit = this.maxColors - 1;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a === 0) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const key = binKey(r, g, b, a);
        let idx = this.binIndex[key];
        if (idx < 0) {
          if (this.binCount >= this.capacity) this._grow();
          idx = this.binCount++;
          this.binIndex[key] = idx;
          this.keys[idx] = key;
        }
        this.weights[idx] += 1;
        const s = idx * 4;
        this.sums[s] += r;
        this.sums[s + 1] += g;
        this.sums[s + 2] += b;
        this.sums[s + 3] += a;
        if (!this.exactOverflow) {
          const color = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
          if (!this.exact.has(color)) {
            if (this.exact.size >= limit) {
              this.exactOverflow = true;
              this.exact = null;
            } else {
              this.exact.set(color, this.exact.size + 1);
            }
          }
        }
      }
    }

    get isLossless() {
      return !this.exactOverflow;
    }

    build() {
      const rgba = [0, 0, 0, 0];
      if (!this.exactOverflow) {
        this.exact.forEach((index, color) => {
          rgba.push((color >>> 24) & 255, (color >>> 16) & 255, (color >>> 8) & 255, color & 255);
        });
        this.result = { rgba: Uint8Array.from(rgba), size: rgba.length / 4, lossless: true };
        return this.result;
      }

      const n = this.binCount;
      // 各ビンの平均色（プリマルチプライド空間）
      const pts = new Float64Array(n * 4);
      for (let i = 0; i < n; i++) {
        const w = this.weights[i];
        const a = this.sums[i * 4 + 3] / w;
        const k = a / 255;
        pts[i * 4] = (this.sums[i * 4] / w) * k;
        pts[i * 4 + 1] = (this.sums[i * 4 + 1] / w) * k;
        pts[i * 4 + 2] = (this.sums[i * 4 + 2] / w) * k;
        pts[i * 4 + 3] = a;
      }
      const target = this.maxColors - 1;
      let centroids = n <= target ? Array.from({ length: n }, (_, i) => [pts[i * 4], pts[i * 4 + 1], pts[i * 4 + 2], pts[i * 4 + 3]]) : medianCut(pts, this.weights, n, target);
      if (n > target) centroids = refineKMeans(pts, this.weights, n, centroids, n * centroids.length > 24e6 ? 1 : 3);

      const palettePremult = centroids;
      centroids.forEach(c => {
        const a = Math.max(0, Math.min(255, c[3]));
        const k = a > 0 ? 255 / a : 0;
        rgba.push(
          Math.max(0, Math.min(255, Math.round(c[0] * k))),
          Math.max(0, Math.min(255, Math.round(c[1] * k))),
          Math.max(0, Math.min(255, Math.round(c[2] * k))),
          Math.max(1, Math.round(a))
        );
      });

      // ビン → パレット番号の対応表
      const lut = new Int16Array(1 << BIN_BITS).fill(-1);
      for (let i = 0; i < n; i++) {
        lut[this.keys[i]] = nearestIndex(pts[i * 4], pts[i * 4 + 1], pts[i * 4 + 2], pts[i * 4 + 3], palettePremult) + 1;
      }
      this.result = { rgba: Uint8Array.from(rgba), size: rgba.length / 4, lossless: false, lut, palettePremult };
      this.binIndex = null;
      this.sums = null;
      return this.result;
    }

    mapFrame(pixels) {
      if (!this.result) this.build();
      const data = toBytes(pixels);
      const out = new Uint8Array(data.length / 4);
      const res = this.result;
      if (res.lossless) {
        const map = this.exact;
        for (let p = 0, i = 0; i < data.length; p++, i += 4) {
          const a = data[i + 3];
          if (a === 0) continue;
          const color = ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | a) >>> 0;
          const idx = map.get(color);
          out[p] = idx !== undefined ? idx : this._nearestStraight(data[i], data[i + 1], data[i + 2], a);
        }
        return out;
      }
      const lut = res.lut;
      for (let p = 0, i = 0; i < data.length; p++, i += 4) {
        const a = data[i + 3];
        if (a === 0) continue;
        const key = binKey(data[i], data[i + 1], data[i + 2], a);
        let idx = lut[key];
        if (idx < 0) {
          idx = this._nearestStraight(data[i], data[i + 1], data[i + 2], a);
          lut[key] = idx;
        }
        out[p] = idx;
      }
      return out;
    }

    _nearestStraight(r, g, b, a) {
      const res = this.result;
      const k = a / 255;
      if (res.palettePremult) return nearestIndex(r * k, g * k, b * k, a, res.palettePremult) + 1;
      let best = 0, bestD = Infinity;
      for (let i = 1; i < res.size; i++) {
        const pa = res.rgba[i * 4 + 3];
        const pk = pa / 255;
        const d = colorDistance(r * k, g * k, b * k, a, res.rgba[i * 4] * pk, res.rgba[i * 4 + 1] * pk, res.rgba[i * 4 + 2] * pk, pa);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    }
  }

  function colorDistance(r1, g1, b1, a1, r2, g2, b2, a2) {
    const dr = r1 - r2, dg = g1 - g2, db = b1 - b2, da = a1 - a2;
    return CHANNEL_WEIGHTS[0] * dr * dr + CHANNEL_WEIGHTS[1] * dg * dg + CHANNEL_WEIGHTS[2] * db * db + CHANNEL_WEIGHTS[3] * da * da;
  }

  function nearestIndex(r, g, b, a, palette) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const c = palette[i];
      const d = colorDistance(r, g, b, a, c[0], c[1], c[2], c[3]);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function boxStats(indices, pts, weights) {
    let sw = 0;
    const s = [0, 0, 0, 0], s2 = [0, 0, 0, 0];
    for (let j = 0; j < indices.length; j++) {
      const i = indices[j];
      const w = weights[i];
      sw += w;
      for (let c = 0; c < 4; c++) {
        const v = pts[i * 4 + c];
        s[c] += w * v;
        s2[c] += w * v * v;
      }
    }
    const variance = [0, 0, 0, 0];
    let sse = 0;
    for (let c = 0; c < 4; c++) {
      variance[c] = sw > 0 ? Math.max(0, s2[c] - (s[c] * s[c]) / sw) * CHANNEL_WEIGHTS[c] : 0;
      sse += variance[c];
    }
    return { indices, sw, mean: s.map(v => (sw > 0 ? v / sw : 0)), variance, sse };
  }

  function medianCut(pts, weights, n, target) {
    const all = new Int32Array(n);
    for (let i = 0; i < n; i++) all[i] = i;
    const boxes = [boxStats(all, pts, weights)];
    while (boxes.length < target) {
      let pick = -1, bestScore = 0;
      for (let b = 0; b < boxes.length; b++) {
        if (boxes[b].indices.length < 2) continue;
        if (boxes[b].sse > bestScore) { bestScore = boxes[b].sse; pick = b; }
      }
      if (pick < 0) break;
      const box = boxes[pick];
      let dim = 0;
      for (let c = 1; c < 4; c++) if (box.variance[c] > box.variance[dim]) dim = c;
      const sorted = box.indices.slice().sort((x, y) => pts[x * 4 + dim] - pts[y * 4 + dim]);
      const half = box.sw / 2;
      let acc = 0, cut = 1;
      for (let j = 0; j < sorted.length - 1; j++) {
        acc += weights[sorted[j]];
        if (acc >= half) { cut = j + 1; break; }
        cut = j + 1;
      }
      boxes.splice(pick, 1, boxStats(sorted.subarray(0, cut), pts, weights), boxStats(sorted.subarray(cut), pts, weights));
    }
    return boxes.map(b => b.mean.slice());
  }

  function refineKMeans(pts, weights, n, centroids, iterations) {
    let cents = centroids.map(c => c.slice());
    for (let it = 0; it < iterations; it++) {
      const k = cents.length;
      const sums = new Float64Array(k * 4);
      const sw = new Float64Array(k);
      for (let i = 0; i < n; i++) {
        const idx = nearestIndex(pts[i * 4], pts[i * 4 + 1], pts[i * 4 + 2], pts[i * 4 + 3], cents);
        const w = weights[i];
        sw[idx] += w;
        for (let c = 0; c < 4; c++) sums[idx * 4 + c] += w * pts[i * 4 + c];
      }
      cents = cents.map((c, j) => (sw[j] > 0 ? [sums[j * 4] / sw[j], sums[j * 4 + 1] / sw[j], sums[j * 4 + 2] / sw[j], sums[j * 4 + 3] / sw[j]] : c));
    }
    return cents;
  }

  /* ---------- ZIP（無圧縮）---------- */

  function dosDateTime(date) {
    const time = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((date.getSeconds() >> 1) & 31);
    const day = (((date.getFullYear() - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31);
    return { time, day };
  }

  function buildZip(files) {
    const encoder = new TextEncoder();
    const { time, day } = dosDateTime(new Date());
    const parts = [];
    const central = [];
    let offset = 0;
    files.forEach(file => {
      const name = encoder.encode(file.name);
      const data = file.data;
      const crc = crc32(data);
      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, time, true);
      lv.setUint16(12, day, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true);
      lv.setUint16(28, 0, true);
      local.set(name, 30);
      parts.push(local, data);

      const entry = new Uint8Array(46 + name.length);
      const cv = new DataView(entry.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, time, true);
      cv.setUint16(14, day, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      entry.set(name, 46);
      central.push(entry);
      offset += local.length + data.length;
    });
    const centralSize = central.reduce((sum, entry) => sum + entry.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  }

  const api = {
    ApngEncoder,
    FrameAnalyzer,
    PaletteQuantizer,
    cropFrame,
    buildZip,
    crc32,
    isCompressionSupported,
    _internal: { filterImage, diffRect, deflateZlib }
  };

  root.TextApngCodec = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
