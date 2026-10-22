import { createSwarm } from './swarm.js';
import { createWingSound } from './wingsound.js';
import { makeDeskChunk, makeItem, drawItem, bite, ITEM_LABELS } from './pixelart.js';
import {
  startRadio, startRecordMusic, startFarewell,
  playMusicBox, startClock, startWindchime, startScoreFlute,
} from './fx.js';
import { SONGS } from './songs.js';

// 低解像度の内部キャンバスに描いて拡大表示する（ファミコン風の粗さを保つ）
const W = 256, H = 144;             // 画面（ビュー）の大きさ。世界は同じ大きさの区画が上下左右に無限に続く
const canvas = document.getElementById('screen');
canvas.width = W;
canvas.height = H;
// 群れの描画で毎フレーム getImageData するため willReadFrequently を指定
const ctx = canvas.getContext('2d', { willReadFrequently: true });

// ---- カーソル: クリックで画面に固定（Pointer Lock）。Esc を押すまで外に出ない ----
// 固定中は移動量(movementX/Y)だけが届くので、画面内の仮想カーソルを自前で動かし、縁で止める。
const mouse = { x: W / 2, y: H / 2 }; // 画面座標
const locked = () => document.pointerLockElement === canvas;
canvas.addEventListener('click', () => {
  if (locked()) return;
  // 新しい Chrome は Promise を返す。拒否されても（直後の再要求など）遊びは続けられるので握りつぶす
  const p = canvas.requestPointerLock();
  if (p && p.catch) p.catch(() => {});
});
window.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  if (locked()) {
    // 矢印（6x7）が隠れない範囲で縁に止める
    mouse.x = Math.max(0, Math.min(W - 6, mouse.x + e.movementX * W / r.width));
    mouse.y = Math.max(0, Math.min(H - 7, mouse.y + e.movementY * H / r.height));
  } else if (e.target === canvas) {
    mouse.x = ((e.clientX - r.left) / r.width) * W;
    mouse.y = ((e.clientY - r.top) / r.height) * H;
  }
});

// ゲーム内のカーソル（OS のカーソルは固定中に消えるため）。机の上で見えるよう、明るい縁取りの小さな矢印
const CURSOR = [
  '1.....',
  '121...',
  '1221..',
  '12221.',
  '122111',
  '1121..',
  '1..1..',
];
function drawCursor() {
  const x0 = Math.round(mouse.x), y0 = Math.round(mouse.y);
  CURSOR.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '.') continue;
      ctx.fillStyle = row[x] === '1' ? '#2a1a12' : '#fff4e0';
      ctx.fillRect(x0 + x, y0 + y, 1, 1);
    }
  });
}

// ---- 数値 ----
const START_FLIES = 60;
const TARGET_FLIES = 1200;   // 終幕の匹数（モノが24種に増えたので、試作 ver1 の 1,000 から少し延ばした）
const BITE_PROB = 0.06;      // 1匹が1フレームにアイテム上でかじる確率
const GROWTH = { small: 30, mid: 50, large: 80 }; // 食べ切ったときの増加匹数（約20個で終幕）

// アイテムの大きさの区分（増加量）と、出やすさ。レコードは曲ごとに楽しめるよう3倍出やすい
const ITEM_DEF = {
  banana: 'mid', mapo: 'large', sugar: 'small', bread: 'mid', pen: 'small', radio: 'small', manga: 'large', record: 'mid',
  apple: 'small', sushi: 'small', cake: 'mid', coffee: 'small', umeboshi: 'small', watermelon: 'large', chili: 'small', onigiri: 'mid',
  sheetmusic: 'mid', musicbox: 'mid', clock: 'mid', windchime: 'small', candle: 'small', paints: 'mid', cards: 'mid', lightbulb: 'small',
};
const WEIGHT = { record: 3 };
const SPAWN_POOL = Object.keys(ITEM_DEF).flatMap((n) => Array(WEIGHT[n] || 1).fill(n));

// ---- 無限の机: 画面と同じ大きさの区画を、必要になった所から生成する ----
// 区画の中身（置かれるモノ）は区画座標から決まる乱数で決めるので、同じ場所には同じモノがある。
const chunks = new Map(); // "cx,cy" → { cx, cy, desk, litter, items }
function hash2(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + 0x9e3779b9) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
function rng(seed) { // mulberry32
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function newItem(name, x, y, variant) {
  const it = makeItem(name, { variant });
  return { it, name, variant, x: Math.round(x), y: Math.round(y), grow: GROWTH[ITEM_DEF[name]], awarded: 0, done: false, fired: false };
}
function chunkAt(cx, cy) {
  const key = cx + ',' + cy;
  let c = chunks.get(key);
  if (c) return c;
  c = { cx, cy, desk: null, litter: null, items: [] };
  const r = rng(hash2(cx, cy));
  if (cx === 0 && cy === 0) {
    c.items.push(newItem('banana', W / 2 + 20, H / 2 + 22)); // 最初の区画: すぐ近くにバナナ
  } else {
    // 区画を左右2つの枠に分け、それぞれに確率で1つ置く（重ならないように）
    const n = r() < 0.35 ? 1 : 2;
    const slots = n === 1 ? [(r() * 2) | 0] : [0, 1];
    for (const s of slots) {
      const name = SPAWN_POOL[(r() * SPAWN_POOL.length) | 0];
      const variant = (r() * SONGS.length) | 0;
      const o = newItem(name, 0, 0, variant);
      o.x = cx * W + s * (W / 2) + 8 + Math.round(r() * (W / 2 - 16 - o.it.w));
      o.y = cy * H + 8 + Math.round(r() * (H - 16 - o.it.h));
      c.items.push(o);
    }
  }
  chunks.set(key, c);
  return c;
}
function chunkOf(x, y) { return chunkAt(Math.floor(x / W), Math.floor(y / H)); }

// ---- 群れとカメラ ----
const swarm = createSwarm(W, H, { startX: W / 2, startY: H / 2 });
let flies = START_FLIES;
swarm.setCount(flies);

// カメラ: 群れの中心が画面の端に近づいたときだけ動く（中央付近では群れが静かに留まれる）。世界に端はない
const cam = { x: 0, y: 0 };
const centroid = { x: W / 2, y: H / 2 }; // 群れの中心（世界座標）
const EDGE_X = 72, EDGE_Y = 44;
function updateCamera(dt) {
  const px = swarm.positions.x, py = swarm.positions.y, n = swarm.count;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += px[i]; sy += py[i]; }
  centroid.x = sx / n; centroid.y = sy / n;
  const cx = centroid.x - cam.x, cy = centroid.y - cam.y;
  let dx = 0, dy = 0;
  if (cx < EDGE_X) dx = cx - EDGE_X; else if (cx > W - EDGE_X) dx = cx - (W - EDGE_X);
  if (cy < EDGE_Y) dy = cy - EDGE_Y; else if (cy > H - EDGE_Y) dy = cy - (H - EDGE_Y);
  const k = 1 - Math.exp(-3 * dt);
  cam.x += dx * k;
  cam.y += dy * k;
}
const target = { x: 0, y: 0 }; // カーソルの世界座標
function updateTarget() { target.x = cam.x + mouse.x; target.y = cam.y + mouse.y; }

// 画面の近く（上下左右 1 区画ぶん）のアイテムだけを、食べる判定・描画・ヒントの対象にする
let nearby = [];
function collectNearby() {
  const c0x = Math.floor(cam.x / W), c0y = Math.floor(cam.y / H);
  nearby = [];
  for (let cy = c0y - 1; cy <= c0y + 2; cy++)
    for (let cx = c0x - 1; cx <= c0x + 2; cx++)
      for (const o of chunkAt(cx, cy).items) if (!o.done) nearby.push(o);
}

// ---- 音（ブラウザの規則で、最初の操作の後に開始する） ----
let actx = null, wings = null, wingGain = null, master = null, started = false;
let radio = null, music = null, musicSong = -1, farewell = null;
let chord = null; // いま鳴っている和音（楽譜の笛が使う）
const ambient = {}; // 時計・風鈴・笛など、一度始まると鳴り続ける音
function startAudio() {
  if (started) return;
  started = true;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  master = actx.createGain();
  master.gain.value = 0.9;
  master.connect(actx.destination);
  wingGain = actx.createGain();
  wingGain.connect(master);
  wings = createWingSound(actx);
  wings.connect(wingGain);
  wings.setCount(flies);
}
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, startAudio);
const harmonize = (glide) => (pcs) => { chord = pcs; wings.setHarmony(pcs, glide); };

// ---- 粒子（パンくず・紙片・種・米粒・トランプ）。落ちたら区画の litter 層に残る。座標は世界座標 ----
const PARTICLE = {
  crumb: { g: 90, life: 0.5, s: 1, vx: 22, vy: 10, colors: ['#e0b060', '#c08a3c'] },
  rice: { g: 90, life: 0.45, s: 1, vx: 20, vy: 10, colors: ['#f8f4e8', '#e8e0cc'] },
  seed: { g: 100, life: 0.45, s: 1, vx: 26, vy: 12, colors: ['#1a1410', '#2a2018'] },
  paper: { g: 10, life: 2.2, s: 2, vx: 24, vy: 18, colors: ['#f0e8d0', '#d8c8a0'], drift: true },
  card: { g: 12, life: 2.4, s: 2, vx: 28, vy: 20, colors: ['#f8f4ec', '#f8f4ec', '#c02828'], drift: true },
};
const BITE_PARTICLE = { bread: 'crumb', onigiri: 'rice', watermelon: 'seed', manga: 'paper', cards: 'card' };
const parts = [];
function spawn(x, y, kind) {
  if (parts.length > 400) return;
  const k = PARTICLE[kind];
  parts.push({
    x, y, k, vx: (Math.random() - 0.5) * k.vx, vy: -k.vy * (0.6 + Math.random() * 0.8),
    life: k.life * (0.8 + Math.random() * 0.5), ph: Math.random() * 6,
    c: k.colors[(Math.random() * k.colors.length) | 0],
  });
}
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    p.vy += p.k.g * dt;
    p.x += p.vx * dt + (p.k.drift ? Math.sin((p.ph += dt * 5)) * 10 * dt : 0);
    p.y += p.vy * dt;
    if (p.k.drift) p.vy *= 0.97;
    if (p.life <= 0) {
      const c = chunkOf(p.x, p.y);
      if (!c.litter) { c.litter = document.createElement('canvas'); c.litter.width = W; c.litter.height = H; }
      const l = c.litter.getContext('2d');
      l.fillStyle = p.c;
      l.fillRect(Math.round(p.x) - c.cx * W, Math.round(p.y) - c.cy * H, p.k.s, p.k.s);
      parts[i] = parts[parts.length - 1];
      parts.pop();
    }
  }
}
function drawParts(cx, cy) {
  for (const p of parts) { ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x) - cx, Math.round(p.y) - cy, p.k.s, p.k.s); }
}

// ---- 光（ろうそく・電球） ----
let dark = 0, darkTarget = 0, warm = 0, warmTarget = 0;
function drawLight(cx, cy, dt) {
  dark += (darkTarget - dark) * (1 - Math.exp(-0.8 * dt));
  warm += (warmTarget - warm) * (1 - Math.exp(-0.8 * dt));
  if (dark > 0.01) {
    // ろうそく: 部屋が暗くなり、群れのまわりだけがゆらめく暖かい光に照らされる
    const sx = centroid.x - cx, sy = centroid.y - cy;
    const flick = 1 + Math.sin(performance.now() * 0.011) * 0.04 + Math.sin(performance.now() * 0.023) * 0.03;
    const g = ctx.createRadialGradient(sx, sy, 8, sx, sy, 90 * flick);
    g.addColorStop(0, 'rgba(255,170,80,0)');
    g.addColorStop(0.4, `rgba(30,12,8,${0.35 * dark})`);
    g.addColorStop(1, `rgba(8,4,10,${0.78 * dark})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (warm > 0.01) {
    ctx.fillStyle = `rgba(255,224,160,${0.10 * warm})`; // 電球: 机全体が少し明るく暖かい色に
    ctx.fillRect(0, 0, W, H);
  }
}

// ---- 食べ始めたときのアクション ----
const eaten = []; // 食べた順（終幕後の一覧用）
const heard = []; // 流れたレコードの曲名
const SOUND_ACTIONS = new Set(['sugar', 'chili', 'radio', 'record', 'sheetmusic', 'musicbox', 'clock', 'windchime']);
function fireAction(o) {
  switch (o.name) {
    // 見た目
    case 'mapo': swarm.setPalette(null); swarm.setTint('#8c1c14'); break;        // ハエが赤く染まる
    case 'sushi': swarm.setPalette(null); swarm.setTint('#7a8494'); swarm.setWing(0.6); break; // 銀色に光る
    case 'paints': swarm.setPalette(['#c03030', '#2f5fb8', '#e0b020', '#2e8a4a', '#8a3aa8', '#e07020']); break; // 色とりどり
    case 'pen': swarm.setJitter(1); break;                                        // 細かく震える
    case 'cake': swarm.setWing(0.9); break;                                       // 羽のきらめきが強まる
    case 'coffee': swarm.setSpeed(1.6); break;                                    // 群れがせわしなく速くなる
    case 'umeboshi': swarm.setSpread(0.6); break;                                 // 群れがきゅっと縮まる
    case 'candle': darkTarget = 1; warmTarget = 0; break;                         // 部屋が暗くなり、ろうそくの光
    case 'lightbulb': darkTarget = 0; warmTarget = 1; break;                      // 明るく暖かくなる
    // 音
    case 'sugar': if (!music) wings.setPitchShift(2); break;                      // 羽音が少し高く
    case 'chili': if (!music) wings.setPitchShift(-3); break;                     // 羽音が低く太く
    case 'radio': if (!radio && !music) radio = startRadio(actx, master); break; // ノイズ混じりの音声
    case 'clock': if (!ambient.clock) ambient.clock = startClock(actx, master); break;
    case 'windchime': if (!ambient.chime) ambient.chime = startWindchime(actx, master); break;
    case 'musicbox': playMusicBox(actx, master); break;                           // 毎回一度だけ鳴る
    case 'sheetmusic': if (!ambient.flute) ambient.flute = startScoreFlute(actx, master, () => chord); break; // 笛が加わる
    // 音楽: レコードごとに違う曲。羽音がその和音へ溶けていく
    case 'record':
      if (music && musicSong === o.variant) break;
      if (music) music.stop(2.0);
      if (radio) { radio.stop(1.5); radio = null; }                               // 音楽の出どころは1つにする
      wings.setPitchShift(0);
      music = startRecordMusic(actx, master, { song: SONGS[o.variant], onChord: harmonize(2.0) });
      musicSong = o.variant;
      heard.push(SONGS[o.variant].title);
      showCaption('♪ ' + SONGS[o.variant].title);
      break;
    default: break; // banana・apple: 基準 / bread・onigiri・watermelon・manga・cards は食べている間の粒子で表現
  }
}
const firedLate = []; // 音が未開始のときに発動を待つ「音」のアクション

// 曲名などを画面下にしばらく表示する（文字は HTML で重ねる。低解像度キャンバスだと潰れるため）
const ui = {
  debug: document.getElementById('debug'), hint: document.getElementById('hint'),
  caption: document.getElementById('caption'), list: document.getElementById('list'),
};
let captionTimer = 0;
function showCaption(s) {
  ui.caption.textContent = s;
  ui.caption.style.opacity = 1;
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => { ui.caption.style.opacity = 0; }, 5000);
}

function eatFrame() {
  const px = swarm.positions.x, py = swarm.positions.y;
  const n = swarm.count;
  for (let i = 0; i < n; i++) {
    const x = px[i] | 0, y = py[i] | 0;
    for (const o of nearby) {
      if (o.done) continue;
      const lx = x - o.x, ly = y - o.y;
      if (lx < 0 || ly < 0 || lx >= o.it.w || ly >= o.it.h) continue;
      if (!o.it.mask[ly * o.it.w + lx] || Math.random() > BITE_PROB) continue;
      bite(o.it, lx, ly, 1.5);
      const pk = BITE_PARTICLE[o.name];
      if (pk) spawn(x, y, pk);
      break;
    }
  }
  // 進捗 → ハエの増加、アクション発動
  for (const o of nearby) {
    if (o.done) continue;
    const frac = 1 - o.it.remaining / o.it.total;
    if (!o.fired && frac >= 0.2) {
      o.fired = true;
      eaten.push(o.name);
      if (actx || !SOUND_ACTIONS.has(o.name)) fireAction(o); else firedLate.push(o);
    }
    if (frac >= 0.92) { // 取り残しの数ピクセルは食べ切ったことにする
      bite(o.it, o.it.w / 2, o.it.h / 2, Math.max(o.it.w, o.it.h));
      o.done = true;
    }
    const goal = Math.round(o.grow * (o.done ? 1 : frac));
    if (goal > o.awarded) { flies += goal - o.awarded; o.awarded = goal; }
  }
  flies = Math.min(flies, swarm.max);
}

// ---- 画面外のアイテムの方向を、画面の縁にかすかな点で示す（広い机で迷わないため） ----
function drawHints(cx, cy) {
  for (const o of nearby) {
    const ix = o.x + o.it.w / 2 - cx, iy = o.y + o.it.h / 2 - cy;
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) continue;
    const dx = ix - W / 2, dy = iy - H / 2;
    const s = Math.min((W / 2 - 3) / Math.abs(dx || 1e-6), (H / 2 - 3) / Math.abs(dy || 1e-6));
    const hx = Math.round(W / 2 + dx * s), hy = Math.round(H / 2 + dy * s);
    ctx.fillStyle = o.name === 'record' ? 'rgba(255,200,200,0.55)' : 'rgba(255,236,200,0.45)';
    ctx.fillRect(hx - 1, hy - 1, 2, 2);
  }
}

// ---- 終幕: TARGET_FLIES → 「蛍の光」→ 幕が閉じる → 食べたもの一覧 ----
let state = 'play';           // 'play' → 'ending' → 'closed'
let endT = 0, curtainSec = 40, playStart = performance.now(), playSec = 0;
function startEnding() {
  state = 'ending';
  endT = 0;
  playSec = (performance.now() - playStart) / 1000;
  if (actx) {
    if (radio) { radio.stop(3); radio = null; }
    if (music) { music.stop(2.5); music = null; }
    for (const k of Object.keys(ambient)) { ambient[k].stop(); delete ambient[k]; }
    wings.setPitchShift(0);
    farewell = startFarewell(actx, master, {
      onChord: harmonize(1.5), // 羽音が別れの曲の和音を奏でる
      onEnd: () => {
        // 曲が終わったら、羽音もゆっくり消えていく
        wingGain.gain.setTargetAtTime(0, actx.currentTime, 2.5);
      },
    });
    curtainSec = farewell.duration * 0.88; // 最後の数音のあいだに閉じきる
  }
}

// 幕の色（深い赤のビロード）。ひだの陰影を4段階で
const CURTAIN = ['#2a060c', '#5a1018', '#86202a', '#b03a3c'];
const FOLD = [0, 1, 1, 2, 2, 3, 2, 2, 1, 1, 0, 0]; // 12px 周期のひだ
function drawCurtain(p, t) {
  // 舞台が少しずつ暗くなる
  ctx.fillStyle = `rgba(10,4,6,${0.35 * p})`;
  ctx.fillRect(0, 0, W, H);
  const half = Math.round(p * (W / 2 + 2));
  for (let i = 0; i < half; i++) {
    // ひだは幕の端からの距離で決める（幕と一緒に動く）
    const sway = Math.sin(t * 0.8 + i * 0.05) * 0.6;
    const c = CURTAIN[FOLD[((half - i + Math.round(sway)) % 12 + 12) % 12]];
    ctx.fillStyle = c;
    ctx.fillRect(i, 0, 1, H);
    ctx.fillRect(W - 1 - i, 0, 1, H);
  }
  // 裾の金の縁取り
  ctx.fillStyle = '#c8a048';
  ctx.fillRect(0, H - 4, half, 1); ctx.fillRect(W - half, H - 4, half, 1);
  ctx.fillStyle = '#6a4818';
  ctx.fillRect(0, H - 3, half, 1); ctx.fillRect(W - half, H - 3, half, 1);
  // 上部の飾り幕（最初の数秒で降りてくる）
  const vy = Math.round(Math.min(1, t / 3) * 12) - 12;
  ctx.fillStyle = CURTAIN[1];
  ctx.fillRect(0, vy, W, 9);
  ctx.fillStyle = CURTAIN[2];
  for (let x = 0; x < W; x += 16) ctx.fillRect(x + 2, vy + 9, 12, 2); // スカラップ（波形の縁）
  ctx.fillStyle = '#c8a048';
  ctx.fillRect(0, vy + 8, W, 1);
}

// 幕が閉じたら、食べたもの一覧を出す。同じものはまとめて「×n」、食べた順に3列
function showList() {
  const counts = new Map();
  for (const n of eaten) counts.set(n, (counts.get(n) || 0) + 1);
  const ul = ui.list.querySelector('ul');
  ul.replaceChildren(...[...counts].map(([name, k]) => {
    const li = document.createElement('li');
    li.textContent = ITEM_LABELS[name] + (k > 1 ? ` ×${k}` : '');
    return li;
  }));
  const m = Math.floor(playSec / 60), s = Math.floor(playSec % 60);
  ui.list.querySelector('p').textContent = `ハエ ${swarm.count}匹 ・ ${m}分${s}秒 ・ 聴いたレコード ${new Set(heard).size}枚`;
  ui.list.style.opacity = 1;
}

// ---- テスト用キー（本番では外す） ----
// D: デバッグ表示  N: ハエ+100匹（終幕の確認用）
let debug = true;
window.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') debug = !debug;
  else if ((e.key === 'n' || e.key === 'N') && state === 'play') flies = Math.min(flies + 100, TARGET_FLIES);
});

let msAvg = 0, debugText = '';
function drawDebug(fps) {
  const t = debug && state === 'play'
    ? `${swarm.count}/${TARGET_FLIES}匹　${msAvg.toFixed(2)}ms　${fps}fps　区画(${Math.floor(cam.x / W)}, ${Math.floor(cam.y / H)})` : '';
  if (t !== debugText) ui.debug.textContent = debugText = t;
}

// 区画の机を描く。見えている区画の机の絵が未生成ならここで作る
function drawDesk(cx, cy) {
  const c0x = Math.floor(cx / W), c0y = Math.floor(cy / H);
  for (let y = c0y; y <= c0y + 1; y++)
    for (let x = c0x; x <= c0x + 1; x++) {
      const c = chunkAt(x, y);
      if (!c.desk) c.desk = makeDeskChunk(x, y, W, H, 7);
      const sx = x * W - cx, sy = y * H - cy;
      ctx.drawImage(c.desk, sx, sy);
      if (c.litter) ctx.drawImage(c.litter, sx, sy);
    }
}
// 次に見えそうな区画の机を、1フレームに1枚まで先に作っておく（移動中のカクつきを減らす）
function pregenerate(cx, cy) {
  const c0x = Math.floor(cx / W), c0y = Math.floor(cy / H);
  for (let y = c0y - 1; y <= c0y + 2; y++)
    for (let x = c0x - 1; x <= c0x + 2; x++) {
      const c = chunkAt(x, y);
      if (!c.desk) { c.desk = makeDeskChunk(x, y, W, H, 7); return; }
    }
}

let last = performance.now();
let fpsCount = 0, fpsTime = 0, fps = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  // 音が始まる前に発動条件を満たしていた「音」のアクションを遅れて発動
  if (actx && firedLate.length) { for (const o of firedLate.splice(0)) fireAction(o); }

  const t0 = performance.now();
  updateTarget();
  swarm.update(dt, target);
  collectNearby();
  if (state === 'play') {
    eatFrame();
    if (flies >= TARGET_FLIES) startEnding();
  }
  if (flies !== swarm.count) { swarm.setCount(flies); if (wings) wings.setCount(flies); }
  updateCamera(dt);
  updateParts(dt);

  const cx = Math.round(cam.x), cy = Math.round(cam.y);
  drawDesk(cx, cy);
  for (const o of nearby) {
    if (o.x + o.it.w + 4 < cx || o.x - 4 > cx + W || o.y + o.it.h + 4 < cy || o.y - 4 > cy + H) continue;
    drawItem(ctx, o.it, o.x - cx, o.y - cy);
  }
  drawParts(cx, cy);
  swarm.draw(ctx, cx, cy);
  drawLight(cx, cy, dt);
  msAvg = msAvg * 0.95 + (performance.now() - t0) * 0.05;
  pregenerate(cx, cy);

  if (state === 'play') {
    drawHints(cx, cy);
  } else {
    endT += dt;
    const lin = Math.min(1, endT / curtainSec);
    const p = lin * lin * (3 - 2 * lin); // ゆっくり動き出し、ゆっくり止まる
    drawCurtain(p, endT);
    if (lin >= 1) {
      if (state === 'ending') { state = 'closed'; showList(); }
    }
  }

  fpsCount++; fpsTime += dt;
  if (fpsTime >= 0.5) { fps = Math.round(fpsCount / fpsTime); fpsCount = 0; fpsTime = 0; }
  drawDebug(fps);
  ui.hint.style.display = locked() || state !== 'play' ? 'none' : '';
  drawCursor();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 検証用に公開（コンソールから状態を見る）
window.__game = { chunks, swarm, eaten, heard, cam, fire: (name, variant = 0) => fireAction({ name, variant }), get nearby() { return nearby; }, get state() { return state; }, get wings() { return wings; } };
