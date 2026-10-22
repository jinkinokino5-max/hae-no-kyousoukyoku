// pixelart.js — コードによるピクセルアート自動生成（外部画像なし）
//
// 方針
// - すべての絵は「パレット番号の配列（インデックスカラー）」で描き、最後に canvas へ変換する。
//   0 = 透明。番号で描くので、色数が自然に限定され、ファミコン風の統一感が出る。
// - アイテムは輪郭線（共通の焦げ茶）と光源（左上）を共通にして、机の上で浮かないようにする。
// - アイテムのマスク(Uint8Array, 1=実体)は「食べて削れる」処理（Step 4）用。
//
// 公開API
//   PALETTE                     … 色定義（唯一の定義場所）
//   makeDesk(W, H, seed)        … チーク材の机。canvas を返す（1回だけ生成して使い回す）
//   makeDeskChunk(cx, cy, w, h, seed) … 無限に広がる机の1区画（世界座標 (cx*w, cy*h) から w×h）。
//                                 隣の区画と継ぎ目なくつながる。決定的。1区画 約6ms(Node)
//   makeItem(name, opts)        … { name, variant, w, h, canvas, shadow, mask, total, remaining }
//                                 opts.variant: record のラベル色 0〜7（RECORD_VARIANTS 個）
//   drawItem(ctx, item, x, y)   … 影＋本体を描く
//   bite(item, cx, cy, r)       … アイテム座標で半径rを削る。削れたピクセル数を返す
//   ITEM_NAMES / ITEM_LABELS    … 31アイテムのキーと日本語名
//   ITEM_KIND                   … 'food' | 'culture'
//   makeDeskPixels / makeDeskChunkPixels / makeItemPixels … canvas を使わない版（Node での確認用）

// ---------------------------------------------------------------------------
// パレット（全体で共有する唯一の色定義）
// ---------------------------------------------------------------------------
export const PALETTE = [
  // [名前, 色]  ※ 並び順 = パレット番号(1始まり)。0 は透明。
  ['outline',   '#2a1810'], // 全アイテム共通の輪郭（黒ではなく焦げ茶で、机になじませる）
  // チーク材（暗→明）
  ['teakSeam',  '#4a2412'],
  ['teak0',     '#6a3519'],
  ['teak1',     '#7f4321'],
  ['teak2',     '#94532a'],
  ['teak3',     '#a86434'],
  ['teak4',     '#bb7742'],
  // 白・クリーム系（陶器、紙、砂糖）
  ['white',     '#fcf4e2'],
  ['cream',     '#e6d6b8'],
  ['creamDk',   '#bba88a'],
  // 黄・金系（バナナ、万年筆の金具）
  ['yellowLt',  '#fbe68a'],
  ['yellow',    '#f2c53d'],
  ['yellowDk',  '#c08a22'],
  ['brown',     '#6b4220'],
  // 赤系（麻婆、ラベル、題字）
  ['redLt',     '#ee6a3a'],
  ['red',       '#c33222'],
  ['redDk',     '#7e1c16'],
  // 緑（ねぎ）
  ['green',     '#6cae3e'],
  // パン
  ['crust',     '#b8692c'],
  ['crustDk',   '#874419'],
  ['crumb',     '#f3dca4'],
  ['crumbDk',   '#d9ba7a'],
  // 青系（漫画の表紙、器の絵付け）
  ['blueLt',    '#8fbfe8'],
  ['blue',      '#3f74b8'],
  ['blueDk',    '#26457a'],
  // 灰・黒系（レコード、ラジオ、万年筆の軸）
  ['ink',       '#1c1820'],
  ['inkLt',     '#3a3442'],
  ['gray',      '#6f6a76'],
  ['silver',    '#bdb8c0'],
  // ラジオの本体（くすんだ若草色）
  ['sage',      '#8e9a6a'],
  ['sageLt',    '#b2bc88'],
  ['sageDk',    '#5f6a44'],
  // ---- 以下は追加色（既存の番号を変えないよう末尾に足す） ----
  ['greenLt',   '#a8d46a'], // 若葉、スイカの皮の明部
  ['greenDk',   '#3e7a2c'], // ヘタ、スイカの縞
  ['purple',    '#6e4a9e'], // 絵の具、レコードのラベル
  ['purpleLt',  '#a988d4'],
  ['salmon',    '#f49060'], // 寿司のサーモン、橙のラベル
  ['salmonLt',  '#fac09a'], // サーモンの脂の筋
  ['plum',      '#9c2a46'], // 梅干し
  ['pink',      '#f2a2b0'], // 梅干しのつや、ラベル
  ['coffee',    '#3a2016'], // コーヒーの液面
];

const C = {};               // 名前 -> パレット番号
const RGBA = [[0, 0, 0, 0]]; // パレット番号 -> [r,g,b,a]
PALETTE.forEach(([name, hex], i) => {
  C[name] = i + 1;
  RGBA.push([
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
    255,
  ]);
});
export const PAL_INDEX = C;
export const PAL_RGBA = RGBA;

// 影の色（机の上に落ちる影。半透明で机の木目を残す）
const SHADOW_RGBA = [42, 18, 6, 110];
const SHADOW_OFFSET = { x: 1, y: 2 };

// ---------------------------------------------------------------------------
// 乱数・ノイズ（シード付き。同じシードなら同じ机になる）
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function valueNoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s);
  const c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x, y, s, oct = 3) {
  let v = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    v += valueNoise(x * f, y * f, s + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return v / norm;
}

// 4x4 ベイヤー行列（ファミコン風の網点ディザ）
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);

// ---------------------------------------------------------------------------
// canvas ユーティリティ
// ---------------------------------------------------------------------------
function createCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return null; // Node 等（canvas なし）
}

function indexedToCanvas(w, h, idx) {
  const cv = createCanvas(w, h);
  if (!cv) return null;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < idx.length; i++) {
    const c = RGBA[idx[i]];
    d[i * 4] = c[0];
    d[i * 4 + 1] = c[1];
    d[i * 4 + 2] = c[2];
    d[i * 4 + 3] = c[3];
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

function maskToCanvas(w, h, mask, rgba) {
  const cv = createCanvas(w, h);
  if (!cv) return null;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    d[i * 4] = rgba[0];
    d[i * 4 + 1] = rgba[1];
    d[i * 4 + 2] = rgba[2];
    d[i * 4 + 3] = rgba[3];
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// ---------------------------------------------------------------------------
// 机（チーク材）
// ---------------------------------------------------------------------------
export function makeDeskPixels(W = 256, H = 144, seed = 1) {
  const rng = mulberry32(seed);
  const s0 = Math.floor(rng() * 1e6);
  const levels = [C.teak0, C.teak1, C.teak2, C.teak3, C.teak4];
  const idx = new Uint8Array(W * H);

  // 板の割り付け（横長の板を縦に並べる。継ぎ目は板ごとに位置をずらす）
  const boards = [];
  for (let y = 0; y < H; ) {
    const h = 30 + Math.floor(rng() * 12);
    boards.push({
      top: y,
      h,
      tone: (rng() - 0.5) * 0.12, // 板ごとのわずかな色差
      s: Math.floor(rng() * 1e6),
      period: 4.2 + rng() * 1.6, // 木目の間隔(px)
      joint: Math.floor(W * (0.15 + rng() * 0.7)),
    });
    y += h;
  }
  // 最下段が細すぎる場合は1つ上の板に吸収する
  const lastB = boards[boards.length - 1];
  if (boards.length > 1 && H - lastB.top < 18) { boards.pop(); boards[boards.length - 1].h += H - lastB.top; }
  const boardOf = new Array(H);
  for (const b of boards) for (let y = b.top; y < b.top + b.h && y < H; y++) boardOf[y] = b;

  for (let y = 0; y < H; y++) {
    const b = boardOf[y];
    const ly = y - b.top;
    for (let x = 0; x < W; x++) {
      // 継ぎ目
      if (ly === 0 || x === b.joint) {
        idx[y * W + x] = C.teakSeam;
        continue;
      }
      // 長い周期の明暗（杢の濃淡）
      const lf = fbm(x * 0.010, y * 0.045, b.s, 3);
      // 木目：板の向きに沿った、ゆるく波打つ線
      const warp = (fbm(x * 0.008, ly * 0.03, b.s + 1, 2) - 0.5) * 16
                 + (valueNoise(x * 0.12, y * 0.5, b.s + 2) - 0.5) * 1.4;
      const g = (ly + warp) / b.period;
      const stripe = g - Math.floor(g);
      const strength = valueNoise(x * 0.035, g * 0.7, b.s + 3); // 線の見え隠れ
      const grain = stripe < 0.2 && strength > 0.42 ? 1 : 0;

      // 周辺減光（中央を明るく、静かな照明）
      const dx = (x / W - 0.5) * 2, dy = (y / H - 0.42) * 2;
      const vig = 0.10 * (dx * dx * 0.7 + dy * dy);

      let v = 0.56 + b.tone + (lf - 0.5) * 0.5 - vig - grain * 0.16;
      if (ly === 1) v += 0.16;               // 継ぎ目直下の面取りの光
      if (ly === b.h - 1) v -= 0.10;         // 板の下端
      if (x === b.joint + 1) v += 0.14;
      if (x === b.joint - 1) v -= 0.10;
      // 導管（ごく稀な横長の小さな暗点）
      if (hash2(x >> 1, y, s0) < 0.006) v -= 0.22;

      let q = Math.round(v * 4 + BAYER4[(y & 3) * 4 + (x & 3)] * 0.55);
      q = q < 0 ? 0 : q > 4 ? 4 : q;
      idx[y * W + x] = levels[q];
    }
  }
  return { w: W, h: H, idx };
}

export function makeDesk(W = 256, H = 144, seed = 1) {
  const p = makeDeskPixels(W, H, seed);
  return indexedToCanvas(p.w, p.h, p.idx);
}

// ---------------------------------------------------------------------------
// 無限に広がる机（区画 = チャンク）
// ---------------------------------------------------------------------------
// すべてを「世界座標 (X,Y) の関数」として決めるので、どの区画を先に作っても
// 境界で必ずつながる。区画の大きさ w,h は全区画で同じ値を使うこと。
//
// 板の割り付け（世界共通）
//   - 板の段：Y方向に BOARD_P ごとの境界を、段ごとに ±5px ずらす（段の高さ 26〜46px）
//   - 板の端の継ぎ目：段ごとに X方向へ JOINT_P ごと、±70px ずらす（板の長さ 60〜340px）
//   - 木目・杢・色差は「段×板」ごとのシードで、世界座標から計算
const BOARD_P = 36;
const JOINT_P = 200;

function boardEdge(k, s) { return k * BOARD_P + Math.floor((hash2(k, 11, s) - 0.5) * 10); }
function boardIndexAt(Y, s) {
  let k = Math.floor(Y / BOARD_P);
  while (boardEdge(k, s) > Y) k--;
  while (boardEdge(k + 1, s) <= Y) k++;
  return k;
}
function jointX(k, j, s) { return j * JOINT_P + Math.floor((hash2(k, j, s + 5) - 0.5) * 140); }
function plankIndexAt(k, X, s) {
  let j = Math.floor(X / JOINT_P);
  while (jointX(k, j, s) > X) j--;
  while (jointX(k, j + 1, s) <= X) j++;
  return j;
}

export function makeDeskChunkPixels(cx, cy, w = 256, h = 144, seed = 7) {
  cx |= 0; cy |= 0;
  const s = (Math.floor(mulberry32(seed)() * 1e6)) | 0;
  const levels = [C.teak0, C.teak1, C.teak2, C.teak3, C.teak4];
  const idx = new Uint8Array(w * h);
  const X0 = cx * w, Y0 = cy * h;

  for (let y = 0; y < h; y++) {
    const Y = Y0 + y;
    const k = boardIndexAt(Y, s);
    const top = boardEdge(k, s);
    const bh = boardEdge(k + 1, s) - top;
    const ly = Y - top;
    const period = 4.2 + hash2(k, 3, s + 9) * 1.6; // 木目の間隔は段ごと
    let j = plankIndexAt(k, X0, s);
    let jx = jointX(k, j, s), nx = jointX(k, j + 1, s);
    let ps = 0, tone = 0;
    const setPlank = () => {
      ps = Math.floor(hash2(k, j, s + 21) * 1e6);
      tone = (hash2(k, j, s + 33) - 0.5) * 0.12; // 板ごとのわずかな色差
    };
    setPlank();
    const row = y * w;
    const ditherRow = (Y & 3) * 4;
    for (let x = 0; x < w; x++) {
      const X = X0 + x;
      if (X >= nx) { j++; jx = nx; nx = jointX(k, j + 1, s); setPlank(); }
      if (ly === 0 || X === jx) { idx[row + x] = C.teakSeam; continue; }
      const lf = fbm(X * 0.010, Y * 0.045, ps, 3);
      const warp = (fbm(X * 0.008, ly * 0.03, ps + 1, 2) - 0.5) * 16
                 + (valueNoise(X * 0.12, Y * 0.5, ps + 2) - 0.5) * 1.4;
      const g = (ly + warp) / period;
      const stripe = g - Math.floor(g);
      let grain = 0;
      if (stripe < 0.2 && valueNoise(X * 0.035, g * 0.7, ps + 3) > 0.42) grain = 1;

      let v = 0.53 + tone + (lf - 0.5) * 0.5 - grain * 0.16;
      if (ly === 1) v += 0.16;          // 継ぎ目直下の面取りの光
      if (ly === bh - 1) v -= 0.10;     // 板の下端
      if (X === jx + 1) v += 0.14;
      if (X === nx - 1) v -= 0.10;
      if (hash2(X >> 1, Y, s) < 0.006) v -= 0.22; // 導管

      let q = Math.round(v * 4 + BAYER4[ditherRow + (X & 3)] * 0.55);
      q = q < 0 ? 0 : q > 4 ? 4 : q;
      idx[row + x] = levels[q];
    }
  }
  return { w, h, idx };
}

// 区画 (cx,cy) の机。世界座標 (cx*w, cy*h) から w×h の範囲を描く。
export function makeDeskChunk(cx, cy, w = 256, h = 144, seed = 7) {
  const p = makeDeskChunkPixels(cx, cy, w, h, seed);
  return indexedToCanvas(p.w, p.h, p.idx);
}

// ---------------------------------------------------------------------------
// アイテム描画用の小さな道具（パレット番号で描く）
// ---------------------------------------------------------------------------
class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Uint8Array(w * h);
  }
  get(x, y) {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[y * this.w + x];
  }
  set(x, y, c) {
    x |= 0; y |= 0;
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c;
  }
  rect(x, y, w, h, c) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
  }
  // 中心(cx,cy)・半径(rx,ry)の楕円を塗る（ピクセル中心で判定）
  ellipse(cx, cy, rx, ry, c) {
    for (let j = Math.floor(cy - ry); j <= Math.ceil(cy + ry); j++)
      for (let i = Math.floor(cx - rx); i <= Math.ceil(cx + rx); i++) {
        const dx = (i + 0.5 - cx) / rx, dy = (j + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(i, j, c);
      }
  }
  line(x0, y0, x1, y1, c) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  fill(fn, c) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (fn(x, y)) this.set(x, y, c);
  }
  // 色cの領域の縁に陰影をつける（光源は左上）。
  // vsAny=false なら透明との境目だけ、true なら他の色との境目にも付ける。
  shade(c, light, dark, vsAny = false) {
    const src = this.d.slice();
    const g = (x, y) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : src[y * this.w + x]);
    const out = (v) => (vsAny ? v !== c : v === 0);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (src[y * this.w + x] !== c) continue;
        if (dark && (out(g(x + 1, y)) || out(g(x, y + 1)))) this.set(x, y, dark);
        else if (light && (out(g(x - 1, y)) || out(g(x, y - 1)))) this.set(x, y, light);
      }
  }
  // 透明ピクセルのうち、上下左右に実体があるものを輪郭色にする
  outline(c = C.outline) {
    const src = this.d.slice();
    const g = (x, y) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : src[y * this.w + x]);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (!src[y * this.w + x] && (g(x - 1, y) || g(x + 1, y) || g(x, y - 1) || g(x, y + 1)))
          this.set(x, y, c);
  }
}

// レコードのラベル色（variant 0〜7）：[外側, 内側, 文字]
const RECORD_LABELS = [
  [C.red, C.redLt, C.white],        // 0 赤（従来の色）
  [C.blue, C.blueLt, C.white],      // 1 青
  [C.yellow, C.yellowLt, C.brown],  // 2 黄
  [C.green, C.greenLt, C.white],    // 3 緑
  [C.purple, C.purpleLt, C.white],  // 4 紫
  [C.cream, C.white, C.inkLt],      // 5 白
  [C.pink, C.white, C.plum],        // 6 桃
  [C.salmon, C.yellowLt, C.redDk],  // 7 橙
];
export const RECORD_VARIANTS = RECORD_LABELS.length;

// 点 (px,py) と線分 (ax,ay)-(bx,by) の距離（角の丸い形を作る用）
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - ax - vx * t, py - ay - vy * t);
}

// ---------------------------------------------------------------------------
// アイテム（すべて 1px の輪郭を含めたサイズ）
// ---------------------------------------------------------------------------
const ITEMS = {
  // バナナ 28x16：2つの楕円の差で三日月形を作る
  banana() {
    const p = new Pix(28, 16);
    p.fill((x, y) => {
      const px = x + 0.5, py = y + 0.5;
      const o = ((px - 14) / 12.6) ** 2 + ((py - 0.4) / 14.2) ** 2 <= 1;
      const i = ((px - 14) / 14.2) ** 2 + ((py + 2.6) / 11.2) ** 2 <= 1;
      return x >= 1 && x <= 26 && y >= 1 && y <= 14 && o && !i;
    }, C.yellow);
    p.shade(C.yellow, C.yellowLt, C.yellowDk);
    // 軸（左）と先端（右）
    p.fill((x, y) => p.get(x, y) && x <= 3, C.brown);
    p.fill((x, y) => p.get(x, y) && x >= 25, C.brown);
    // シュガースポット
    p.set(9, 10, C.yellowDk);
    p.set(15, 12, C.yellowDk);
    p.set(19, 10, C.brown);
    p.outline();
    return p;
  },

  // 麻婆豆腐 26x20：白い器（青い帯）に赤いあん、豆腐、ねぎ
  mapo() {
    const p = new Pix(26, 20);
    // 器の胴（下半分の楕円）
    p.fill((x, y) => {
      const dx = (x + 0.5 - 13) / 12, dy = (y + 0.5 - 8) / 10.4;
      return y >= 7 && dx * dx + dy * dy <= 1;
    }, C.white);
    p.shade(C.white, 0, C.creamDk);
    p.fill((x, y) => p.get(x, y) === C.white && y >= 12, C.cream);
    p.fill((x, y) => p.get(x, y) && y === 11, C.blue); // 絵付けの帯
    // 口縁（上から見た楕円）
    p.ellipse(13, 7, 12, 5, C.white);
    p.ellipse(13, 7.3, 10.6, 3.9, C.red);
    // あんの陰影（奥側は器の影で暗い）
    p.fill((x, y) => p.get(x, y) === C.red && y <= 4, C.redDk);
    // 辣油のつや
    [[6, 7], [10, 9], [17, 8], [20, 6], [8, 5]].forEach(([x, y]) => p.set(x, y, C.redLt));
    // 豆腐（2x2 の角切り、右下に影）
    [[8, 6], [14, 5], [17, 8], [11, 8]].forEach(([x, y]) => {
      p.rect(x, y, 2, 2, C.white);
      p.set(x + 1, y + 1, C.cream);
    });
    // ねぎ
    [[13, 7], [9, 4], [19, 7], [6, 8]].forEach(([x, y]) => p.set(x, y, C.green));
    p.outline();
    return p;
  },

  // 角砂糖 14x14：斜め上から見た立方体（3面の明暗）
  sugar() {
    const p = new Pix(14, 14);
    // 正面
    p.rect(1, 4, 9, 9, C.cream);
    // 上面
    for (let y = 1; y <= 3; y++) for (let x = 5 - y; x <= 13 - y; x++) p.set(x, y, C.white);
    // 側面
    for (let x = 10; x <= 12; x++) for (let y = 13 - x; y <= 21 - x; y++) p.set(x, y, C.creamDk);
    // 粒の質感
    [[3, 6], [6, 9], [4, 11], [8, 7], [2, 2 + 7]].forEach(([x, y]) => p.set(x, y, C.white));
    [[11, 5], [10, 8], [12, 7]].forEach(([x, y]) => p.set(x, y, C.cream));
    [[6, 2], [9, 1], [10, 3]].forEach(([x, y]) => p.set(x, y, C.cream));
    p.outline();
    return p;
  },

  // 食パン 22x22：山型の一枚。耳を2段で描き、中に気泡
  bread() {
    const p = new Pix(22, 22);
    p.rect(2, 9, 18, 11, C.crumb);
    p.ellipse(6.6, 8.4, 5.6, 5.2, C.crumb);
    p.ellipse(15.4, 8.4, 5.6, 5.2, C.crumb);
    p.ellipse(11, 7, 4, 3, C.crumb);
    // 耳：外側1px を濃く、その内側1px を普通の耳色に
    p.shade(C.crumb, C.crustDk, C.crustDk);
    const src = p.d.slice();
    const g = (x, y) => (x < 0 || y < 0 || x >= p.w || y >= p.h ? 0 : src[y * p.w + x]);
    p.fill((x, y) => g(x, y) === C.crumb &&
      [g(x - 1, y), g(x + 1, y), g(x, y - 1), g(x, y + 1)].some((v) => v === C.crustDk), C.crust);
    // 気泡
    [[6, 8], [10, 12], [14, 9], [8, 15], [15, 14], [12, 17], [5, 12], [16, 6]].forEach(([x, y]) =>
      p.set(x, y, C.crumbDk));
    p.outline();
    return p;
  },

  // レコード 28x28：溝の同心円、赤いラベル、中央の穴は透明
  record(opts = {}) {
    const v = ((opts.variant | 0) % RECORD_LABELS.length + RECORD_LABELS.length) % RECORD_LABELS.length;
    const [lblDk, lblLt, lblText] = RECORD_LABELS[v];
    const p = new Pix(28, 28);
    const cx = 14, cy = 14;
    p.fill((x, y) => {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      return d <= 12.7;
    }, C.ink);
    for (let y = 0; y < 28; y++)
      for (let x = 0; x < 28; x++) {
        if (!p.get(x, y)) continue;
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const d = Math.hypot(dx, dy);
        if (d < 1.2) { p.set(x, y, 0); continue; }            // 穴
        if (d < 4.6) { p.set(x, y, d < 2.2 ? lblLt : lblDk); continue; } // ラベル
        // 光沢（左上と右下の扇形）
        const a = Math.atan2(dy, dx);
        const sheen = Math.abs(Math.sin(a - Math.PI / 4)) > 0.93;
        if ((d > 6.5 && d < 7.5) || (d > 9.5 && d < 10.5)) p.set(x, y, C.inkLt); // 溝
        if (sheen && d > 5.5 && d < 12) p.set(x, y, d > 8 && d < 10 ? C.gray : C.inkLt);
      }
    p.set(12, 13, lblText); // ラベルの小さな文字
    p.set(15, 15, lblText);
    p.outline();
    return p;
  },

  // 漫画 20x26：表紙（題字の帯と月の絵）、右と下に紙の小口
  manga() {
    const p = new Pix(20, 26);
    p.rect(1, 1, 17, 23, C.white);
    p.rect(1, 1, 2, 23, C.blueDk);               // 背
    p.rect(4, 3, 12, 4, C.red);                  // 題字の帯
    [5, 7, 8, 10, 12, 13].forEach((x) => p.set(x, 4, C.white));
    [6, 9, 11, 14].forEach((x) => p.set(x, 5, C.white));
    p.rect(4, 9, 12, 11, C.blue);                // 絵
    p.ellipse(10, 14.5, 3.6, 3.6, C.blueLt);
    p.set(11, 13, C.blueDk);                     // 月のかげ
    p.set(12, 15, C.blueDk);
    [[5, 10], [14, 11], [6, 18], [15, 18], [13, 10]].forEach(([x, y]) => p.set(x, y, C.white)); // 星
    p.rect(13, 21, 3, 2, C.yellow);              // 巻数マーク
    // 紙の小口
    for (let y = 2; y <= 24; y++) p.set(18, y, y % 2 ? C.cream : C.creamDk);
    for (let x = 2; x <= 18; x++) p.set(x, 24, x % 2 ? C.cream : C.creamDk);
    p.outline();
    return p;
  },

  // ラジオ 26x20：若草色の箱、スピーカーの網、目盛り窓、つまみ、アンテナ
  radio() {
    const p = new Pix(26, 20);
    p.rect(1, 6, 24, 12, C.sage);
    p.shade(C.sage, C.sageLt, C.sageDk);
    // スピーカー
    p.rect(3, 8, 10, 8, C.sageDk);
    for (let y = 9; y <= 14; y++) for (let x = 4; x <= 11; x++) if ((x + y) % 2 === 0) p.set(x, y, C.inkLt);
    // 目盛り窓
    p.rect(15, 8, 8, 3, C.cream);
    [16, 18, 20, 22].forEach((x) => p.set(x, 8, C.creamDk));
    p.set(19, 9, C.red);
    p.set(19, 10, C.red);
    // つまみ
    p.rect(16, 13, 2, 2, C.silver);
    p.rect(20, 13, 2, 2, C.silver);
    p.set(17, 14, C.gray);
    p.set(21, 14, C.gray);
    // 脚
    p.set(3, 18, C.inkLt);
    p.set(22, 18, C.inkLt);
    // アンテナ
    p.line(19, 5, 23, 1, C.silver);
    p.set(23, 1, C.white);
    p.outline();
    return p;
  },

  // 万年筆 28x8：黒軸、金のクリップと帯、金のペン先
  pen() {
    const p = new Pix(28, 8);
    p.rect(2, 2, 17, 4, C.ink);                  // 軸
    p.set(1, 3, C.ink); p.set(1, 4, C.ink);      // 尻の丸み
    for (let x = 2; x <= 18; x++) p.set(x, 2, C.inkLt); // つや
    p.set(3, 2, C.gray); p.set(4, 2, C.gray);
    p.rect(14, 2, 1, 4, C.yellow);               // キャップの帯
    p.rect(19, 2, 2, 4, C.inkLt);                // 首軸
    p.line(5, 1, 12, 1, C.yellow);               // クリップ
    p.set(12, 2, C.yellowDk);
    // ペン先
    p.rect(21, 2, 2, 4, C.yellow);
    p.rect(23, 3, 2, 2, C.yellow);
    p.set(25, 3, C.yellowDk);
    p.set(21, 2, C.yellowLt); p.set(22, 2, C.yellowLt);
    p.set(23, 4, C.yellowDk);
    p.outline();
    return p;
  },

  // ===== 追加の食べ物 =====

  // りんご 18x19：2つのふくらみ、つやの白、茶色の軸と若葉
  apple() {
    const p = new Pix(18, 19);
    p.ellipse(6.6, 11.4, 5.4, 6.2, C.red);
    p.ellipse(11.4, 11.4, 5.4, 6.2, C.red);
    p.ellipse(9, 12.4, 6.4, 5.8, C.red);
    p.shade(C.red, C.redLt, C.redDk);
    p.fill((x, y) => p.get(x, y) === C.red && x >= 12 && y >= 13, C.redDk); // 右下の陰
    p.set(5, 8, C.white); p.set(4, 9, C.white); p.set(4, 10, C.redLt); p.set(6, 8, C.redLt);
    p.set(9, 6, C.redDk); // 軸のくぼみ
    p.line(9, 5, 10, 1, C.brown);
    // 葉
    [[11, 3], [12, 3], [13, 3], [12, 2], [13, 2], [14, 2]].forEach(([x, y]) => p.set(x, y, C.green));
    p.set(14, 1, C.greenLt); p.set(13, 1, C.greenLt);
    p.set(12, 3, C.greenDk);
    p.outline();
    return p;
  },

  // 寿司（サーモンのにぎり） 22x14：白いシャリにサーモン、脂の白い筋
  sushi() {
    const p = new Pix(22, 14);
    p.ellipse(11, 9, 9.4, 3.8, C.white);              // シャリ
    p.shade(C.white, 0, C.creamDk);
    [[5, 10], [8, 11], [12, 11], [15, 10], [17, 9], [10, 12], [6, 8], [16, 12]]
      .forEach(([x, y]) => { if (p.get(x, y) === C.white) p.set(x, y, C.cream); });
    // ネタ（シャリより少し大きく、上にかぶせる）
    p.fill((x, y) => {
      const dx = (x + 0.5 - 11) / 10, dy = (y + 0.5 - 6.2) / 3.6;
      return dx * dx + dy * dy <= 1;
    }, C.salmon);
    p.shade(C.salmon, C.salmonLt, C.redLt);
    // 脂の筋（斜めの縞）
    p.fill((x, y) => p.get(x, y) === C.salmon && (x + y) % 4 === 0, C.salmonLt);
    p.set(5, 4, C.white); p.set(6, 4, C.white); // つや
    p.outline();
    return p;
  },

  // ショートケーキ 20x21：三角に切った一切れ。断面にスポンジとクリーム、苺の層、上に苺
  cake() {
    const p = new Pix(20, 21);
    // 上面（三角）：手前の辺 y=8、x=1..12、奥の頂点 (18,3)
    p.fill((x, y) => {
      if (y < 3 || y > 8) return false;
      const xr = 12 + ((8 - y) / 5) * 6; // 右辺
      const xl = 1 + ((8 - y) / 5) * 15; // 左辺（奥へ狭まる）
      return x >= xl && x <= xr;
    }, C.white);
    // 側面（右奥のクリーム面）
    p.fill((x, y) => {
      if (x < 13 || x > 18) return false;
      const t = (x - 12) / 6;
      const yt = 8 - t * 5, yb = 18 - t * 5;
      return y > yt && y <= yb;
    }, C.cream);
    p.fill((x, y) => p.get(x, y) === C.cream && x >= 17, C.creamDk);
    // 断面（手前）
    for (let y = 9; y <= 18; y++) for (let x = 1; x <= 12; x++) {
      let c = C.crumb;                         // スポンジ
      if (y === 9) c = C.white;                // 上のクリーム
      else if (y === 13 || y === 14) c = C.white; // 中のクリーム
      else if (y === 18) c = C.crumbDk;        // 底
      p.set(x, y, c);
    }
    // 中の苺の断面
    [2, 6, 10].forEach((x) => {
      p.set(x, 13, C.red); p.set(x + 1, 13, C.red);
      p.set(x, 14, C.redLt); p.set(x + 1, 14, C.red);
    });
    // スポンジの気泡
    [[3, 11], [8, 10], [11, 11], [5, 16], [9, 17], [2, 16]].forEach(([x, y]) => p.set(x, y, C.crumbDk));
    p.set(1, 10, C.yellowLt); p.set(1, 15, C.yellowLt);
    // 上の苺
    p.ellipse(9, 5, 2.4, 2.2, C.red);
    p.set(8, 4, C.redLt); p.set(10, 6, C.redDk); p.set(9, 6, C.redDk);
    p.set(9, 2, C.green); p.set(8, 2, C.greenDk); p.set(10, 2, C.greenDk);
    // 絞りクリーム
    p.set(14, 5, C.cream); p.set(5, 7, C.cream);
    p.outline();
    return p;
  },

  // コーヒー 20x20：受け皿にカップ、黒い液面に泡の縁、湯気
  coffee() {
    const p = new Pix(20, 20);
    p.ellipse(10, 15.4, 9, 3.4, C.white);             // 受け皿
    p.shade(C.white, 0, C.creamDk);
    p.ellipse(10, 15.4, 5.6, 1.8, C.cream);
    // カップの胴
    p.fill((x, y) => {
      if (y < 7 || y > 15) return false;
      const half = 5.6 - Math.max(0, y - 12) * 0.7;
      return Math.abs(x + 0.5 - 9.5) <= half;
    }, C.white);
    p.fill((x, y) => p.get(x, y) === C.white && y >= 7 && y <= 15 && x >= 12 && x <= 15 && y < 16, C.cream);
    p.fill((x, y) => p.get(x, y) === C.cream && x >= 14 && y >= 8 && y <= 15, C.creamDk);
    // 取っ手
    [[16, 8], [17, 8], [17, 9], [17, 10], [17, 11], [16, 12]].forEach(([x, y]) => p.set(x, y, C.cream));
    // 口縁と液面
    p.ellipse(9.5, 7, 6, 2.2, C.white);
    p.ellipse(9.5, 7.2, 4.8, 1.5, C.coffee);
    p.set(6, 7, C.crustDk); p.set(12, 7, C.crustDk); p.set(8, 8, C.crustDk); // 泡の縁
    p.set(7, 7, C.brown);
    // 湯気（輪郭なしで淡く見せたいので、輪郭の後に置く）
    p.outline();
    [[8, 3], [9, 2], [9, 1], [11, 4], [12, 3], [11, 2]].forEach(([x, y]) => p.set(x, y, C.cream));
    return p;
  },

  // 梅干し 18x14：白い小皿に、しわのある赤紫の梅
  umeboshi() {
    const p = new Pix(18, 14);
    p.ellipse(9, 9, 8, 4.2, C.white);
    p.shade(C.white, 0, C.creamDk);
    p.ellipse(9, 9.2, 6, 2.6, C.cream);
    p.ellipse(9, 6.4, 5.4, 4.8, C.plum);
    p.shade(C.plum, C.red, C.redDk);
    [[7, 6], [10, 8], [9, 5], [12, 6], [8, 9], [11, 4], [6, 8]].forEach(([x, y]) => p.set(x, y, C.redDk)); // しわ
    p.set(6, 4, C.pink); p.set(5, 5, C.pink); p.set(7, 3, C.red); // つや
    p.set(9, 2, C.brown);
    p.outline();
    return p;
  },

  // スイカ 24x17：扇形の一切れ。赤い実、白い層、緑の皮（縞）、黒い種
  watermelon() {
    const p = new Pix(24, 17);
    const cx = 12, cy = 1.2, R = 14.6, half = (50 * Math.PI) / 180;
    for (let y = 0; y < 17; y++)
      for (let x = 0; x < 24; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const d = Math.hypot(dx, dy);
        if (d > R || dy <= 0) continue;
        if (Math.abs(Math.atan2(dx, dy)) > half) continue;
        let c = C.red;
        if (d > R - 1.3) c = (Math.floor(Math.atan2(dx, dy) * 9) & 1) ? C.greenDk : C.green;
        else if (d > R - 2.3) c = C.greenLt;
        else if (d > R - 3.2) c = C.white;
        p.set(x, y, c);
      }
    // 実の明暗（左側を明るく）
    p.fill((x, y) => p.get(x, y) === C.red && x < 9 && y > 3 && (x + y) % 3 === 0, C.redLt);
    p.fill((x, y) => p.get(x, y) === C.red && x > 16, C.red);
    // 種
    [[9, 7], [14, 7], [11, 10], [7, 10], [16, 10], [12, 4]].forEach(([x, y]) => p.set(x, y, C.ink));
    p.outline();
    return p;
  },

  // 唐辛子 22x11：曲がった赤い実が先へ細くなる。左に緑のヘタ
  chili() {
    const p = new Pix(22, 12);
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const x = 5.4 + t * 14.2, y = 4.6 + t * t * 4;
      const r = 3.2 * (1 - t) + 0.55;
      p.ellipse(x, y, r, r, C.red);
    }
    p.shade(C.red, C.redLt, C.redDk);
    p.set(7, 3, C.white); p.set(8, 3, C.redLt); p.set(9, 3, C.redLt); // つや
    // ヘタと軸
    p.rect(2, 2, 3, 5, C.green);
    p.set(4, 2, C.greenDk); p.set(4, 6, C.greenDk); p.set(4, 4, C.greenDk);
    p.set(1, 3, C.green); p.set(1, 1, C.greenDk); p.set(0, 0, 0);
    p.line(2, 2, 1, 1, C.greenDk);
    p.outline();
    return p;
  },

  // おにぎり 20x18：角の丸い三角に、海苔の帯
  onigiri() {
    const p = new Pix(20, 18);
    const A = [10, 3.6], B = [3.8, 14.2], D = [16.2, 14.2], r = 2.6;
    const inTri = (x, y) => {
      const s = (ax, ay, bx, by) => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      const a = s(A[0], A[1], B[0], B[1]), b = s(B[0], B[1], D[0], D[1]), c = s(D[0], D[1], A[0], A[1]);
      return (a >= 0 && b >= 0 && c >= 0) || (a <= 0 && b <= 0 && c <= 0);
    };
    p.fill((x, y) => {
      const px = x + 0.5, py = y + 0.5;
      return inTri(px, py) || segDist(px, py, ...A, ...B) <= r || segDist(px, py, ...B, ...D) <= r ||
        segDist(px, py, ...D, ...A) <= r;
    }, C.white);
    p.shade(C.white, 0, C.creamDk);
    [[8, 6], [11, 8], [6, 11], [13, 12], [9, 10], [14, 9], [5, 14]]
      .forEach(([x, y]) => { if (p.get(x, y) === C.white) p.set(x, y, C.cream); });
    // 海苔
    p.fill((x, y) => p.get(x, y) && x >= 7 && x <= 12 && y >= 11, C.ink);
    p.fill((x, y) => p.get(x, y) === C.ink && x === 7, C.inkLt);
    p.set(8, 12, C.inkLt);
    p.outline();
    return p;
  },

  // ===== 追加の文化物 =====

  // 楽譜 22x26：紙に五線2段、音符、ト音記号、右上の折れ
  sheetmusic() {
    const p = new Pix(22, 26);
    p.rect(1, 1, 19, 24, C.white);
    for (let y = 2; y <= 24; y++) p.set(20, y, y % 2 ? C.cream : C.creamDk); // 下の紙の小口
    p.rect(2, 25, 19, 0, C.cream);
    // 折れた角
    p.set(19, 1, 0); p.set(18, 1, 0); p.set(19, 2, 0);
    p.set(17, 1, C.cream); p.set(18, 2, C.cream); p.set(19, 3, C.creamDk); p.set(17, 2, C.creamDk);
    // 題名
    [4, 5, 7, 8, 9].forEach((x) => p.set(x, 3, C.red));
    // 五線
    [6, 16].forEach((top) => {
      for (let l = 0; l < 5; l++) for (let x = 2; x <= 18; x++) p.set(x, top + l * 2, C.silver);
      // ト音記号（縦の線と巻き）
      for (let y = top - 1; y <= top + 9; y++) p.set(4, y, C.inkLt);
      p.set(5, top + 3, C.inkLt); p.set(5, top + 6, C.inkLt); p.set(3, top + 5, C.inkLt);
      p.set(3, top + 9, C.inkLt);
    });
    // 音符（2x2の玉と棒）
    const note = (x, y, up = true) => {
      p.rect(x, y, 2, 2, C.ink);
      if (up) for (let i = 1; i <= 4; i++) p.set(x + 1, y - i, C.ink);
      else for (let i = 1; i <= 4; i++) p.set(x, y + 1 + i, C.ink);
    };
    note(7, 11); note(10, 9); note(13, 12); note(16, 10);
    note(7, 19); note(10, 21); note(13, 18, false); note(16, 20);
    p.line(8, 7, 11, 5, C.ink); // 連桁
    p.outline();
    return p;
  },

  // オルゴール 24x20：蓋の開いた木箱。内側に赤いビロード、金の櫛歯と円筒
  musicbox() {
    const p = new Pix(24, 20);
    // 蓋（奥に開いている）
    p.rect(2, 1, 20, 7, C.crustDk);
    p.rect(4, 2, 16, 5, C.redDk);
    p.rect(4, 2, 16, 1, C.red);
    p.set(5, 4, C.red); p.set(12, 5, C.red);
    // 中の機械（上から見た開口部）
    p.rect(1, 8, 22, 3, C.brown);
    p.rect(3, 8, 10, 2, C.yellow);                       // 円筒
    for (let x = 3; x <= 12; x += 2) p.set(x, 9, C.yellowDk); // ピン
    p.set(3, 8, C.yellowLt); p.set(4, 8, C.yellowLt);
    for (let x = 14; x <= 20; x++) p.set(x, 9, x % 2 ? C.silver : C.gray); // 櫛歯
    p.set(14, 8, C.silver); p.set(20, 8, C.gray);
    // 箱の正面
    p.rect(1, 11, 22, 8, C.crust);
    p.shade(C.crust, C.teak4, C.crustDk);
    p.rect(3, 13, 18, 4, C.teak3);                      // はめ込みの板
    p.set(3, 13, C.teak4);
    p.rect(11, 14, 2, 2, C.yellow);                     // 鍵穴の金具
    p.set(12, 15, C.ink);
    // ぜんまいのつまみ
    p.set(23, 13, C.silver); p.set(23, 14, C.gray);
    p.outline();
    return p;
  },

  // 置き時計 18x21：金の丸い枠、白い文字盤、2つのベル、脚
  clock() {
    const p = new Pix(18, 21);
    // ベル
    p.ellipse(4, 4, 2.6, 2.4, C.yellow);
    p.ellipse(14, 4, 2.6, 2.4, C.yellow);
    p.rect(8, 2, 2, 2, C.yellowDk); // つまみ
    // 胴
    p.ellipse(9, 11.5, 7.4, 7.4, C.yellow);
    p.shade(C.yellow, C.yellowLt, C.yellowDk);
    p.ellipse(9, 11.5, 5.6, 5.6, C.white);
    p.fill((x, y) => p.get(x, y) === C.white && (x >= 12 && y >= 12), C.cream);
    // 目盛り
    [[9, 7], [9, 16], [4, 11], [13, 11]].forEach(([x, y]) => p.set(x, y, C.inkLt));
    // 針
    p.line(9, 11, 9, 8, C.ink);
    p.line(9, 11, 11, 12, C.ink);
    p.set(10, 13, C.red); p.set(11, 14, C.red); // 秒針
    // 脚
    p.set(4, 19, C.ink); p.set(3, 20, C.ink);
    p.set(14, 19, C.ink); p.set(15, 20, C.ink);
    p.set(3, 3, C.yellowLt); p.set(13, 3, C.yellowLt);
    p.outline();
    return p;
  },

  // 風鈴 16x26：ガラスの鈴（金魚の絵）、糸、赤い短冊
  windchime() {
    const p = new Pix(16, 26);
    // ガラスの鈴（おわん形を伏せた形）。透明感を出すため白と水色を混ぜる
    p.fill((x, y) => {
      const dx = (x + 0.5 - 8) / 6.6, dy = (y + 0.5 - 9) / 8;
      return y >= 1 && y <= 9 && dx * dx + dy * dy <= 1;
    }, C.blueLt);
    p.shade(C.blueLt, C.white, C.blue);
    p.fill((x, y) => p.get(x, y) === C.blueLt && y >= 4 && x >= 3 && x <= 6, C.white); // 大きなつや
    p.fill((x, y) => p.get(x, y) && y === 9, C.blue); // 口の縁
    // 金魚の絵付け
    [[9, 5], [10, 5], [10, 6], [9, 6], [11, 5]].forEach(([x, y]) => p.set(x, y, C.red));
    p.set(12, 4, C.redLt); p.set(12, 6, C.redLt); p.set(9, 5, C.redLt);
    p.set(5, 7, C.green); p.set(6, 6, C.green); // 水草
    // 舌（ガラス玉）と糸
    p.set(8, 10, C.silver);
    for (let y = 11; y <= 13; y++) p.set(8, y, C.gray);
    // 短冊（白い紙、少し風に揺れて右へずれる。墨の一筆）
    p.rect(6, 14, 5, 6, C.white);
    p.rect(7, 20, 5, 6, C.white);
    p.fill((x, y) => p.get(x, y) === C.white && ((y < 20 && x === 10) || (y >= 20 && x === 11)), C.cream);
    p.set(8, 16, C.blue); p.set(8, 17, C.blue); p.set(9, 18, C.blue); p.set(9, 21, C.blue); p.set(9, 22, C.blue);
    p.set(8, 0, C.gray); // 吊り紐
    p.outline();
    return p;
  },

  // ろうそく 12x24：炎、芯、白い胴としずく、金の燭台
  candle() {
    const p = new Pix(12, 24);
    // 炎（しずく形）
    p.fill((x, y) => {
      if (y < 1 || y > 6) return false;
      const w = y <= 2 ? 0.6 : y <= 4 ? 1.4 : 1.6;
      return Math.abs(x + 0.5 - 6) <= w;
    }, C.yellow);
    p.set(6, 1, C.yellowLt); p.set(6, 3, C.yellowLt); p.set(5, 4, C.yellowLt); p.set(6, 4, C.white); p.set(6, 5, C.white);
    p.set(7, 6, C.redLt); p.set(5, 6, C.redLt);
    p.set(6, 7, C.ink); // 芯
    // 胴
    p.rect(4, 8, 4, 12, C.white);
    p.rect(7, 8, 1, 12, C.cream);
    p.set(4, 8, C.cream);
    p.set(4, 9, C.white); p.set(3, 10, C.white); p.set(3, 11, C.white); p.set(3, 12, C.cream); // しずく
    p.set(5, 9, C.yellowLt); // 炎の照り返し
    // 燭台
    p.ellipse(6, 20.6, 5.4, 1.8, C.yellow);
    p.shade(C.yellow, C.yellowLt, C.yellowDk);
    p.rect(3, 22, 6, 1, C.yellowDk);
    p.rect(4, 19, 4, 1, C.yellowLt);
    p.outline();
    return p;
  },

  // 絵の具 26x19：木のパレット（親指の穴）に色の点、筆
  paints() {
    const p = new Pix(26, 19);
    p.ellipse(12, 9.4, 11, 7.6, C.crumb);
    p.ellipse(22, 13, 3.6, 2.8, 0);       // くびれ
    p.ellipse(6, 12, 1.6, 1.4, 0);        // 親指の穴
    p.shade(C.crumb, C.white, C.crumbDk, true);
    // 絵の具（2x2の盛り上がり、左上につや）
    [[5, 5, C.red, C.redLt], [9, 3, C.yellow, C.yellowLt], [14, 3, C.green, C.greenLt],
     [18, 5, C.blue, C.blueLt], [19, 9, C.purple, C.purpleLt], [10, 7, C.white, C.white]]
      .forEach(([x, y, c, l]) => { p.rect(x, y, 2, 2, c); p.set(x, y, l); });
    p.set(11, 8, C.cream);
    // 混ぜた跡
    p.set(13, 11, C.salmon); p.set(14, 11, C.salmon); p.set(14, 12, C.blueLt);
    // 筆
    p.line(11, 17, 23, 11, C.brown);
    p.line(12, 17, 23, 12, C.brown);
    p.set(23, 11, C.crustDk); p.set(24, 11, C.crustDk);
    p.line(9, 18, 10, 18, C.silver); p.set(10, 17, C.silver);
    p.set(8, 18, C.blue);
    p.outline();
    return p;
  },

  // トランプ 22x22：裏向きの1枚（青の模様）と表のハートのA
  cards() {
    const p = new Pix(22, 22);
    // 奥：裏向き
    p.rect(9, 1, 12, 16, C.white);
    p.rect(10, 2, 10, 14, C.blue);
    p.fill((x, y) => p.get(x, y) === C.blue && (x + y) % 2 === 0, C.blueDk);
    p.fill((x, y) => p.get(x, y) && x >= 10 && x <= 19 && y >= 2 && y <= 15 && (x === 10 || x === 19 || y === 2 || y === 15), C.blueLt);
    // 手前：ハートのA
    p.rect(1, 5, 12, 16, C.white);
    p.rect(12, 6, 1, 15, C.cream);
    p.rect(2, 20, 11, 1, C.cream);
    // 枠と重なり境界を輪郭色で分ける
    for (let y = 5; y <= 17; y++) p.set(13, y, C.outline);
    // ハート
    const H = [
      '.##.##.',
      '#######',
      '#######',
      '.#####.',
      '..###..',
      '...#...',
    ];
    H.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') p.set(4 + i, 10 + j, C.red); }));
    p.set(5, 11, C.redLt);
    // 隅の「A」
    p.set(3, 7, C.red); p.set(2, 8, C.red); p.set(4, 8, C.red); p.set(3, 8, C.red);
    p.set(10, 18, C.red); p.set(9, 17, C.red); p.set(11, 17, C.red); p.set(10, 17, C.red);
    p.outline();
    return p;
  },

  // 電球 14x22：明るいガラス玉、フィラメント、銀の口金
  lightbulb() {
    const p = new Pix(14, 22);
    p.ellipse(7, 7, 6, 6.2, C.yellowLt);
    p.fill((x, y) => y >= 11 && y <= 14 && x >= 4 && x <= 9, C.yellowLt); // 首
    p.shade(C.yellowLt, C.white, C.yellow);
    p.set(3, 4, C.white); p.set(4, 3, C.white); p.set(3, 5, C.white); // つや
    // フィラメント
    p.line(5, 12, 5, 8, C.yellowDk); p.line(8, 12, 8, 8, C.yellowDk);
    p.set(5, 7, C.redLt); p.set(6, 6, C.redLt); p.set(7, 7, C.redLt); p.set(8, 6, C.redLt);
    // 口金（ねじ山）
    p.rect(4, 15, 6, 5, C.silver);
    [16, 18].forEach((y) => p.rect(4, y, 6, 1, C.gray));
    p.set(4, 15, C.white);
    p.rect(5, 20, 4, 1, C.inkLt);
    p.set(6, 21, C.ink); p.set(7, 21, C.ink);
    p.outline();
    return p;
  },

  // 音叉 10x26：銀のU字の二股と、細い柄（黒い握り）
  tuningfork() {
    const p = new Pix(10, 26);
    const A = {
      w: C.white, s: C.silver, g: C.gray, k: C.inkLt, i: C.ink,
    };
    const rows = [
      'wsg..wsg', 'wsg..wsg', 'wsg..wsg', 'wsg..wsg', 'wsg..wsg', 'wsg..wsg',
      'wsg..wsg', 'wsg..wsg', 'wsg..wsg', 'wsg..wsg', 'wsg..wsg', 'wsg..wsg', 'wsg..wsg',
      'wsssssgg', '.wsssggg'.slice(0, 8), '..wssgg.',
      '...sg...', '...sg...', '...sg...',
      '..wkkg..', '..wkkg..', '..kkkk..', '..wkkg..', '..kkkk..',
    ];
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (A[ch]) p.set(1 + i, 1 + j, A[ch]); }));
    p.outline();
    return p;
  },

  // メトロノーム 16x24：台形の木の箱、中央の溝と目盛り、斜めの振り子（銀の棒と金の重り）
  metronome() {
    const p = new Pix(16, 24);
    for (let y = 4; y <= 22; y++) {
      const hw = 3 + ((y - 4) * 4) / 18;
      const x0 = Math.round(8 - hw), x1 = Math.round(8 + hw) - 1;
      p.rect(x0, y, x1 - x0 + 1, 1, C.crust);
    }
    p.shade(C.crust, C.teak4, C.crustDk);
    p.rect(1, 20, 14, 3, C.crustDk);                // 台
    p.rect(1, 20, 14, 1, C.crust);
    p.rect(7, 6, 2, 13, C.ink);                       // 振り子の溝
    for (let y = 7; y <= 17; y += 2) { p.set(5, y, C.cream); p.set(10, y, C.cream); }
    p.set(5, 12, C.white); p.set(10, 12, C.white);
    p.line(7, 18, 9, 0, C.silver);                    // 振り子の棒
    p.line(8, 18, 10, 0, C.gray);
    p.rect(6, 7, 5, 3, C.yellow);                     // 重り
    p.rect(6, 7, 5, 1, C.yellowLt); p.rect(6, 9, 5, 1, C.yellowDk);
    p.set(7, 18, C.yellowDk); p.set(8, 18, C.yellow); p.set(8, 19, C.yellowDk);
    p.outline();
    return p;
  },

  // おりん 20x16：赤い座布団の上の金の鉢（口を上に向ける）と、横に立てかけた撥
  rin() {
    const p = new Pix(20, 16);
    // 座布団
    p.rect(1, 11, 18, 4, C.red);
    p.rect(1, 11, 18, 1, C.redLt);
    p.rect(1, 14, 18, 1, C.redDk);
    p.set(1, 11, 0); p.set(18, 11, 0); p.set(1, 14, 0); p.set(18, 14, 0);
    p.rect(3, 13, 14, 1, C.yellowDk);                  // 縁取りの糸
    p.set(9, 12, C.yellow); p.set(10, 12, C.yellow);   // 房
    // 鉢（上向きのお椀）
    p.fill((x, y) => {
      if (y < 3 || y > 11) return false;
      const dx = (x + 0.5 - 8.5) / 6.8, dy = (y + 0.5 - 3.5) / 8;
      return Math.abs(dx) ** 2.7 + dy * dy <= 1;
    }, C.yellow);
    p.shade(C.yellow, C.yellowLt, C.yellowDk);
    p.ellipse(8.5, 3.4, 6.8, 2.0, C.yellowLt);         // 縁
    p.ellipse(8.5, 3.9, 5.6, 1.2, C.yellowDk);         // 口の内側
    p.set(4, 6, C.yellowLt); p.set(4, 7, C.yellowLt); p.set(5, 8, C.yellowLt);
    // 撥
    p.line(17, 3, 15, 10, C.brown);
    p.line(18, 3, 16, 10, C.crustDk);
    p.rect(17, 2, 2, 2, C.yellow);
    p.outline();
    return p;
  },

  // 砂時計 14x24：木の台座2枚と柱、ガラスのくびれ、上の砂・落ちる筋・下の砂山
  hourglass() {
    const p = new Pix(14, 24);
    const ox = 1, oy = 1;
    p.rect(ox, oy, 12, 2, C.crust);
    p.rect(ox, oy + 20, 12, 2, C.crust);
    p.rect(ox, oy, 12, 1, C.teak4);
    p.rect(ox, oy + 21, 12, 1, C.crustDk);
    p.rect(ox, oy + 2, 1, 18, C.crustDk);
    p.rect(ox + 11, oy + 2, 1, 18, C.crustDk);
    const hw = [5, 5, 4, 4, 3, 2, 1, 1, 1, 1, 1, 1, 2, 3, 4, 4, 5, 5];
    hw.forEach((h, k) => {
      const y = oy + 2 + k;
      p.rect(ox + 6 - h, y, 2 * h, 1, C.blueLt);
      p.set(ox + 6 - h, y, C.white);
    });
    // 上の砂
    for (let k = 4; k <= 9; k++) {
      const y = oy + 2 + k;
      p.rect(ox + 6 - hw[k] + 1, y, 2 * hw[k] - 1, 1, C.yellow);
    }
    p.rect(ox + 5, oy + 5, 2, 1, C.yellowLt);
    // 落ちる筋
    for (let k = 10; k <= 14; k++) p.set(ox + 6, oy + 2 + k, C.yellowLt);
    // 下の砂山
    for (let k = 13; k <= 17; k++) {
      const y = oy + 2 + k;
      const w = (k - 13) * 2 + 2;
      const half = Math.min(w / 2, hw[k]);
      p.rect(ox + 6 - half, y, 2 * half, 1, C.yellow);
    }
    p.set(ox + 5, oy + 15, C.yellowLt);
    p.rect(ox + 1, oy + 19, 10, 1, C.yellowDk);
    p.outline();
    return p;
  },

  // カメラ 24x18：黒革のクラシックカメラ。銀の上部、ファインダー、シャッター、大きなレンズ
  camera() {
    const p = new Pix(24, 18);
    p.rect(1, 3, 22, 14, C.ink);                      // 黒革の胴
    p.rect(1, 3, 22, 3, C.silver);                    // 銀の上部
    p.rect(1, 3, 22, 1, C.white);
    p.rect(1, 5, 22, 1, C.gray);
    p.rect(8, 1, 8, 2, C.silver);                     // ファインダーのプリズム
    p.rect(8, 1, 8, 1, C.white);
    p.rect(18, 1, 3, 2, C.yellow);                    // シャッターボタン
    p.rect(18, 1, 3, 1, C.yellowLt);
    p.rect(3, 7, 4, 3, C.silver);                     // ファインダーの窓
    p.rect(4, 8, 2, 1, C.blueLt);
    p.set(4, 8, C.white);
    p.rect(1, 7, 22, 1, C.inkLt);                     // 革の艶
    p.set(19, 8, C.redLt); p.set(20, 8, C.redLt);     // 赤いランプ
    for (let y = 11; y <= 15; y++) { p.set(2, y, C.inkLt); p.set(21, y, C.inkLt); }
    p.set(1, 3, 0); p.set(22, 3, 0); p.set(1, 16, 0); p.set(22, 16, 0);
    // レンズ
    p.ellipse(12, 10.8, 6.2, 6.2, C.silver);
    p.ellipse(12, 10.8, 5.2, 5.2, C.gray);
    p.ellipse(12, 10.8, 4.2, 4.2, C.ink);
    p.ellipse(12, 10.8, 3.2, 3.2, C.blueDk);
    p.ellipse(12, 10.8, 2.2, 2.2, C.blue);
    p.rect(9, 8, 2, 2, C.blueLt);                     // 反射
    p.set(9, 8, C.white);
    p.set(13, 12, C.blueLt);
    p.set(8, 6, C.white); p.set(9, 5, C.white);
    p.outline();
    return p;
  },

  // ワイン 16x24：赤ワインの脚付きグラス（立てて描く）
  wine() {
    const p = new Pix(16, 24);
    // グラス（ふくらんだ椀）
    p.fill((x, y) => {
      if (y < 1 || y > 12) return false;
      const dx = (x + 0.5 - 8) / 6, dy = (y + 0.5 - 7.3) / 6.6;
      return dx * dx + dy * dy <= 1;
    }, C.blueLt);
    p.shade(C.blueLt, C.white, C.blue);
    // 赤い液体
    const glass = (x, y) => p.get(x, y) !== 0;
    for (let y = 6; y <= 12; y++) for (let x = 0; x < 16; x++) {
      if (glass(x, y) && p.get(x, y) !== C.white) {
        if (x > 0 && glass(x - 1, y) && glass(x + 1, y) && glass(x, y + 1 > 12 ? y : y + 1)) p.set(x, y, C.red);
        else p.set(x, y, C.redDk);
      }
    }
    for (let x = 0; x < 16; x++) if (p.get(x, 6) === C.red) p.set(x, 6, C.redLt);
    for (let y = 8; y <= 11; y++) for (let x = 0; x < 16; x++) if (p.get(x, y) === C.red && x >= 11) p.set(x, y, C.redDk);
    p.set(4, 8, C.white); p.set(4, 9, C.white); p.set(5, 7, C.white); // つや
    p.rect(3, 2, 1, 3, C.white);
    // 脚と台
    p.rect(7, 13, 2, 8, C.silver);
    p.rect(7, 13, 1, 8, C.white);
    p.ellipse(8, 21.7, 5.4, 1.3, C.silver);
    p.rect(4, 21, 4, 1, C.white);
    p.rect(9, 22, 4, 1, C.gray);
    p.outline();
    return p;
  },

  // ドクロ 18x18：白い頭蓋骨、黒い眼窩と鼻孔、歯の並び（ヴァニタスの象徴）
  skull() {
    const p = new Pix(18, 18);
    p.ellipse(9, 7.4, 7.6, 6.5, C.cream);             // 頭蓋
    p.rect(5, 11, 8, 5, C.cream);                      // 顎
    p.shade(C.cream, C.white, C.creamDk);
    p.rect(4, 8, 1, 3, C.creamDk);                     // こめかみの陰
    p.rect(13, 8, 1, 3, C.creamDk);
    // 眼窩
    p.ellipse(6, 8.2, 2.3, 2.5, C.ink);
    p.ellipse(12, 8.2, 2.3, 2.5, C.ink);
    p.set(5, 7, C.inkLt);
    // 鼻孔
    p.set(8, 11, C.ink); p.set(9, 11, C.ink);
    p.set(8, 12, 0); p.set(9, 12, 0);
    p.set(8, 12, C.ink); p.set(9, 12, C.ink);
    // 歯
    p.rect(5, 13, 8, 3, C.white);
    p.rect(5, 15, 8, 1, C.cream);
    for (const x of [6, 8, 10, 12]) { p.set(x, 13, C.creamDk); p.set(x, 14, C.inkLt); p.set(x, 15, C.creamDk); }
    p.set(5, 12, C.creamDk); p.set(12, 12, C.creamDk);
    p.set(7, 2, C.white); p.set(6, 3, C.white); p.set(5, 4, C.white);
    p.outline();
    return p;
  },
};

export const ITEM_NAMES = Object.keys(ITEMS);
export const ITEM_LABELS = {
  banana: 'バナナ', mapo: '麻婆豆腐', sugar: '角砂糖', bread: '食パン',
  record: 'レコード', manga: '漫画', radio: 'ラジオ', pen: '万年筆',
  apple: 'りんご', sushi: '寿司', cake: 'ショートケーキ', coffee: 'コーヒー',
  umeboshi: '梅干し', watermelon: 'スイカ', chili: '唐辛子', onigiri: 'おにぎり',
  sheetmusic: '楽譜', musicbox: 'オルゴール', clock: '置き時計', windchime: '風鈴',
  candle: 'ろうそく', paints: '絵の具', cards: 'トランプ', lightbulb: '電球',
  tuningfork: '音叉', metronome: 'メトロノーム', rin: 'おりん', hourglass: '砂時計',
  camera: 'カメラ', wine: 'ワイン', skull: 'ドクロ',
};
// 分類（食べ物 / 文化物）。main.js 側で使えるように公開
export const ITEM_KIND = {
  banana: 'food', mapo: 'food', sugar: 'food', bread: 'food',
  record: 'culture', manga: 'culture', radio: 'culture', pen: 'culture',
  apple: 'food', sushi: 'food', cake: 'food', coffee: 'food',
  umeboshi: 'food', watermelon: 'food', chili: 'food', onigiri: 'food',
  sheetmusic: 'culture', musicbox: 'culture', clock: 'culture', windchime: 'culture',
  candle: 'culture', paints: 'culture', cards: 'culture', lightbulb: 'culture',
  tuningfork: 'culture', metronome: 'culture', rin: 'culture', hourglass: 'culture',
  camera: 'culture', wine: 'food', skull: 'culture',
};

export function makeItemPixels(name, opts = {}) {
  const f = ITEMS[name];
  if (!f) throw new Error(`unknown item: ${name}`);
  const p = f(opts || {});
  const mask = new Uint8Array(p.w * p.h);
  let total = 0;
  for (let i = 0; i < mask.length; i++) if (p.d[i]) { mask[i] = 1; total++; }
  return { name, w: p.w, h: p.h, idx: p.d, mask, total };
}

// opts.variant … record のラベル色 (0〜7)。他のアイテムでは無視される。
export function makeItem(name, opts = {}) {
  const p = makeItemPixels(name, opts);
  return {
    name,
    variant: opts && opts.variant != null ? opts.variant | 0 : 0,
    w: p.w,
    h: p.h,
    idx: p.idx,
    mask: p.mask,
    total: p.total,
    remaining: p.total,
    canvas: indexedToCanvas(p.w, p.h, p.idx),
    shadow: maskToCanvas(p.w, p.h, p.mask, SHADOW_RGBA),
  };
}

export function drawItem(ctx, item, x, y) {
  x = Math.round(x); y = Math.round(y);
  if (item.shadow) ctx.drawImage(item.shadow, x + SHADOW_OFFSET.x, y + SHADOW_OFFSET.y);
  if (item.canvas) ctx.drawImage(item.canvas, x, y);
}

// アイテム座標 (cx,cy) を中心に半径 r の円で削る。mask と canvas を同時に更新する。
export function bite(item, cx, cy, r) {
  let n = 0;
  const ctx = item.canvas && item.canvas.getContext('2d');
  const sctx = item.shadow && item.shadow.getContext('2d');
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || y < 0 || x >= item.w || y >= item.h) continue;
      const i = y * item.w + x;
      if (!item.mask[i]) continue;
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) continue;
      item.mask[i] = 0;
      n++;
      if (ctx) ctx.clearRect(x, y, 1, 1);
      if (sctx) sctx.clearRect(x, y, 1, 1);
    }
  item.remaining -= n;
  return n;
}
