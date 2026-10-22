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
//   makeItem(name)              … { name, w, h, canvas, shadow, mask, total, remaining }
//   drawItem(ctx, item, x, y)   … 影＋本体を描く
//   bite(item, cx, cy, r)       … アイテム座標で半径rを削る。削れたピクセル数を返す
//   ITEM_NAMES                  … 8アイテムのキー
//   makeDeskPixels / makeItemPixels … canvas を使わない版（Node での確認用）

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

// ---------------------------------------------------------------------------
// 8アイテム（すべて 1px の輪郭を含めたサイズ）
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
  record() {
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
        if (d < 4.6) { p.set(x, y, d < 2.2 ? C.redLt : C.red); continue; } // ラベル
        // 光沢（左上と右下の扇形）
        const a = Math.atan2(dy, dx);
        const sheen = Math.abs(Math.sin(a - Math.PI / 4)) > 0.93;
        if ((d > 6.5 && d < 7.5) || (d > 9.5 && d < 10.5)) p.set(x, y, C.inkLt); // 溝
        if (sheen && d > 5.5 && d < 12) p.set(x, y, d > 8 && d < 10 ? C.gray : C.inkLt);
      }
    p.set(12, 13, C.white); // ラベルの小さな文字
    p.set(15, 15, C.white);
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
};

export const ITEM_NAMES = Object.keys(ITEMS);
export const ITEM_LABELS = {
  banana: 'バナナ', mapo: '麻婆豆腐', sugar: '角砂糖', bread: '食パン',
  record: 'レコード', manga: '漫画', radio: 'ラジオ', pen: '万年筆',
};

export function makeItemPixels(name) {
  const f = ITEMS[name];
  if (!f) throw new Error(`unknown item: ${name}`);
  const p = f();
  const mask = new Uint8Array(p.w * p.h);
  let total = 0;
  for (let i = 0; i < mask.length; i++) if (p.d[i]) { mask[i] = 1; total++; }
  return { name, w: p.w, h: p.h, idx: p.d, mask, total };
}

export function makeItem(name) {
  const p = makeItemPixels(name);
  return {
    name,
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
