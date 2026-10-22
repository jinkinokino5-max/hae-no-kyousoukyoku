import { createSwarm } from './swarm.js';
import { createWingSound } from './wingsound.js';
import { makeDesk, makeItem, drawItem, bite, ITEM_LABELS } from './pixelart.js';
import { startRadio, startRecordMusic, startFarewell } from './fx.js';

// 低解像度の内部キャンバスに描いて拡大表示する（ファミコン風の粗さを保つ）
const W = 256, H = 144;             // 画面（ビュー）の大きさ
const WW = W * 3, WH = H * 3;       // 机全体＝世界の大きさ（オープンワールド: 画面の3×3倍）
const canvas = document.getElementById('screen');
canvas.width = W;
canvas.height = H;
// 群れの描画で毎フレーム getImageData するため willReadFrequently を指定
const ctx = canvas.getContext('2d', { willReadFrequently: true });

const mouse = { x: W / 2, y: H / 2 }; // 画面座標
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - r.left) / r.width) * W;
  mouse.y = ((e.clientY - r.top) / r.height) * H;
});

// ---- 試作の数値（開発手順 ver1 の表に対応） ----
const START_FLIES = 60;
const TARGET_FLIES = 1000;   // 試作では 1,000匹で終幕（広い世界では「画面の半分」を匹数で代用）
const BITE_PROB = 0.06;      // 1匹が1フレームにアイテム上でかじる確率
const GROWTH = { small: 60, mid: 120, large: 200 }; // 食べ切ったときの増加匹数
// 合計 = 120+200+60+120+120+200+60+60 = 940 ＋ 開始60 = 1000（全部食べると到達）

const DESK = makeDesk(WW, WH, 7);
const litter = document.createElement('canvas'); // パンくず・紙片が積もる層（世界座標）
litter.width = WW; litter.height = WH;
const lctx = litter.getContext('2d');

// 8アイテム（世界座標の左上）。中央の区画にバナナ、残りは周りの区画に散らす。
// レコードは一番遠い角に置き、旅の終わり近くで出会うようにする
const layout = [
  ['banana', 400, 236, 'mid'],
  ['mapo',   370,  40, 'large'],
  ['sugar',  640,  70, 'small'],
  ['pen',     90, 200, 'small'],
  ['bread',   60,  50, 'mid'],
  ['manga',  650, 230, 'large'],
  ['radio',  360, 360, 'small'],
  ['record', 690, 370, 'mid'],
];
const items = layout.map(([name, x, y, size]) => ({
  it: makeItem(name), name, x, y, grow: GROWTH[size], awarded: 0, done: false, fired: false,
}));

const swarm = createSwarm(W, H, { startX: WW / 2, startY: WH / 2 });
let flies = START_FLIES;
swarm.setCount(flies);

// ---- カメラ: 群れの中心が画面の端に近づいたときだけ動く（中央付近では群れが静かに留まれる） ----
const cam = { x: (WW - W) / 2, y: (WH - H) / 2 };
const EDGE_X = 72, EDGE_Y = 44;
function updateCamera(dt) {
  const px = swarm.positions.x, py = swarm.positions.y, n = swarm.count;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += px[i]; sy += py[i]; }
  const cx = sx / n - cam.x, cy = sy / n - cam.y; // 群れの中心（画面座標）
  let dx = 0, dy = 0;
  if (cx < EDGE_X) dx = cx - EDGE_X; else if (cx > W - EDGE_X) dx = cx - (W - EDGE_X);
  if (cy < EDGE_Y) dy = cy - EDGE_Y; else if (cy > H - EDGE_Y) dy = cy - (H - EDGE_Y);
  const k = 1 - Math.exp(-3 * dt);
  cam.x = Math.max(0, Math.min(WW - W, cam.x + dx * k));
  cam.y = Math.max(0, Math.min(WH - H, cam.y + dy * k));
}
const target = { x: 0, y: 0 }; // カーソルの世界座標
function updateTarget() {
  target.x = Math.max(4, Math.min(WW - 4, cam.x + mouse.x));
  target.y = Math.max(4, Math.min(WH - 4, cam.y + mouse.y));
}

// ---- 音（ブラウザの規則で、最初の操作の後に開始する） ----
let actx = null, wings = null, wingGain = null, master = null, started = false;
let radio = null, music = null, farewell = null;
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

// ---- 粒子（パンくず・紙片）。落ちたら litter 層に残る。座標は世界座標 ----
const parts = [];
function spawn(x, y, kind) {
  if (parts.length > 400) return;
  if (kind === 'crumb') {
    parts.push({ x, y, vx: (Math.random() - 0.5) * 22, vy: -8 - Math.random() * 10, g: 90, life: 0.45 + Math.random() * 0.2, kind, c: Math.random() < 0.5 ? '#e0b060' : '#c08a3c', s: 1 });
  } else {
    parts.push({ x, y, vx: (Math.random() - 0.5) * 24, vy: -14 - Math.random() * 16, g: 10, life: 1.6 + Math.random() * 1.2, kind, c: Math.random() < 0.5 ? '#f0e8d0' : '#d8c8a0', s: 2, ph: Math.random() * 6 });
  }
}
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    p.vy += p.g * dt;
    p.x += p.vx * dt + (p.kind === 'paper' ? Math.sin((p.ph += dt * 5)) * 10 * dt : 0);
    p.y += p.vy * dt;
    if (p.kind === 'paper') p.vy *= 0.97;
    if (p.life <= 0) {
      lctx.fillStyle = p.c;
      lctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
      parts[i] = parts[parts.length - 1];
      parts.pop();
    }
  }
}
function drawParts(cx, cy) {
  for (const p of parts) { ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x) - cx, Math.round(p.y) - cy, p.s, p.s); }
}

// ---- 食べ始めたときのアクション（Step 5・6） ----
const eaten = []; // 食べた順（終幕後の一覧用）
const SOUND_ACTIONS = new Set(['sugar', 'radio', 'record']);
function fireAction(name) {
  switch (name) {
    case 'mapo': swarm.setTint('#8c1c14'); break;                 // 見た目: ハエが赤く染まる
    case 'pen': swarm.setJitter(1); break;                        // 見た目: 細かく震える
    case 'sugar': if (!music) wings.setPitchShift(2); break;      // 音: 羽音の音程が上がる（曲が鳴っている間は和音を優先）
    case 'radio': if (!radio && !music) radio = startRadio(actx, master); break; // 音: ノイズ混じりの音声
    case 'record':                                                 // 音楽: 曲が流れ、羽音がその和音へ溶けていく
      if (music) break;
      if (radio) { radio.stop(1.5); radio = null; }               // 音楽の出どころは1つにする
      wings.setPitchShift(0);
      music = startRecordMusic(actx, master, { onChord: (pcs) => wings.setHarmony(pcs, 2.0) });
      break;
    default: break; // banana: 基準 / bread・manga は食べている間の粒子で表現
  }
}
const firedLate = new Set(); // 音が未開始のときに発動を待つ「音」のアクション

function eatFrame() {
  const px = swarm.positions.x, py = swarm.positions.y;
  const n = swarm.count;
  for (let i = 0; i < n; i++) {
    const x = px[i] | 0, y = py[i] | 0;
    for (const o of items) {
      if (o.done) continue;
      const lx = x - o.x, ly = y - o.y;
      if (lx < 0 || ly < 0 || lx >= o.it.w || ly >= o.it.h) continue;
      if (!o.it.mask[ly * o.it.w + lx] || Math.random() > BITE_PROB) continue;
      bite(o.it, lx, ly, 1.5);
      if (o.name === 'bread') spawn(x, y, 'crumb');
      if (o.name === 'manga') spawn(x, y, 'paper');
      break;
    }
  }
  // 進捗 → ハエの増加、アクション発動
  for (const o of items) {
    if (o.done) continue;
    const frac = 1 - o.it.remaining / o.it.total;
    if (!o.fired && frac >= 0.2) {
      o.fired = true;
      eaten.push(o.name);
      if (actx || !SOUND_ACTIONS.has(o.name)) fireAction(o.name); else firedLate.add(o.name);
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
  for (const o of items) {
    if (o.done) continue;
    const ix = o.x + o.it.w / 2 - cx, iy = o.y + o.it.h / 2 - cy;
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) continue;
    const dx = ix - W / 2, dy = iy - H / 2;
    const s = Math.min((W / 2 - 3) / Math.abs(dx || 1e-6), (H / 2 - 3) / Math.abs(dy || 1e-6));
    const hx = Math.round(W / 2 + dx * s), hy = Math.round(H / 2 + dy * s);
    ctx.fillStyle = 'rgba(255,236,200,0.45)';
    ctx.fillRect(hx - 1, hy - 1, 2, 2);
  }
}

// ---- 終幕（Step 7）: 1,000匹 → 「蛍の光」→ 幕が閉じる → 食べたもの一覧 ----
let state = 'play';           // 'play' → 'ending' → 'closed'
let endT = 0, curtainSec = 40, closedT = 0, playStart = performance.now(), playSec = 0;
function startEnding() {
  state = 'ending';
  endT = 0;
  playSec = (performance.now() - playStart) / 1000;
  if (actx) {
    if (radio) { radio.stop(3); radio = null; }
    if (music) { music.stop(2.5); music = null; }
    wings.setPitchShift(0);
    farewell = startFarewell(actx, master, {
      onChord: (pcs) => wings.setHarmony(pcs, 1.5), // 羽音が別れの曲の和音を奏でる
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

function drawList(alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const shadowText = (s, x, y, color) => {
    ctx.fillStyle = 'rgba(20,4,8,0.9)'; ctx.fillText(s, x + 1, y + 1);
    ctx.fillStyle = color; ctx.fillText(s, x, y);
  };
  ctx.font = '10px sans-serif';
  shadowText('たべたもの', W / 2, 22, '#f0d890');
  ctx.font = '8px sans-serif';
  eaten.forEach((name, i) => {
    const col = i % 2, row = (i / 2) | 0;
    shadowText(ITEM_LABELS[name], W / 2 + (col ? 40 : -40), 42 + row * 13, '#f4e8d0');
  });
  const m = Math.floor(playSec / 60), s = Math.floor(playSec % 60);
  shadowText(`ハエ ${swarm.count}匹 ・ ${m}分${s}秒`, W / 2, H - 24, '#d8b878');
  ctx.restore();
}

// ---- テスト用キー（本番では外す） ----
// D: デバッグ表示  N: ハエ+100匹（終幕の確認用）
let debug = true;
window.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') debug = !debug;
  else if ((e.key === 'n' || e.key === 'N') && state === 'play') flies = Math.min(flies + 100, TARGET_FLIES);
});

let msAvg = 0;
function drawDebug(fps) {
  ctx.fillStyle = 'rgba(255,240,210,0.85)';
  ctx.font = '8px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`${swarm.count}/${TARGET_FLIES} flies  ${msAvg.toFixed(2)}ms  ${fps}fps`, 2, 2);
  if (!started) ctx.fillText('クリックかキーで音が始まります', 2, H - 10);
}

let last = performance.now();
let fpsCount = 0, fpsTime = 0, fps = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  // 音が始まる前に発動条件を満たしていた「音」のアクションを遅れて発動
  if (actx && firedLate.size) { for (const n of firedLate) fireAction(n); firedLate.clear(); }

  const t0 = performance.now();
  updateTarget();
  swarm.update(dt, target);
  if (state === 'play') {
    eatFrame();
    if (flies >= TARGET_FLIES) startEnding();
  }
  if (flies !== swarm.count) { swarm.setCount(flies); if (wings) wings.setCount(flies); }
  updateCamera(dt);
  updateParts(dt);

  const cx = Math.round(cam.x), cy = Math.round(cam.y);
  ctx.drawImage(DESK, cx, cy, W, H, 0, 0, W, H);
  ctx.drawImage(litter, cx, cy, W, H, 0, 0, W, H);
  for (const o of items) {
    if (o.done) continue;
    if (o.x + o.it.w + 4 < cx || o.x - 4 > cx + W || o.y + o.it.h + 4 < cy || o.y - 4 > cy + H) continue;
    drawItem(ctx, o.it, o.x - cx, o.y - cy);
  }
  drawParts(cx, cy);
  swarm.draw(ctx, cx, cy);
  msAvg = msAvg * 0.95 + (performance.now() - t0) * 0.05;

  if (state === 'play') {
    drawHints(cx, cy);
  } else {
    endT += dt;
    const lin = Math.min(1, endT / curtainSec);
    const p = lin * lin * (3 - 2 * lin); // ゆっくり動き出し、ゆっくり止まる
    drawCurtain(p, endT);
    if (lin >= 1) {
      if (state === 'ending') { state = 'closed'; closedT = endT; }
      drawList(Math.min(1, (endT - closedT) / 3));
    }
  }

  fpsCount++; fpsTime += dt;
  if (fpsTime >= 0.5) { fps = Math.round(fpsCount / fpsTime); fpsCount = 0; fpsTime = 0; }
  if (debug && state === 'play') drawDebug(fps);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 検証用に公開（コンソールから状態を見る）
window.__game = { items, swarm, eaten, cam, ITEM_LABELS, get state() { return state; }, get wings() { return wings; } };
