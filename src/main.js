import { createSwarm } from './swarm.js';
import { createWingSound } from './wingsound.js';
import { makeDesk, makeItem, drawItem, bite, ITEM_LABELS } from './pixelart.js';
import { startRadio, startRecordMusic } from './fx.js';

// 低解像度の内部キャンバスに描いて拡大表示する（ファミコン風の粗さを保つ）
const W = 256, H = 144;
const canvas = document.getElementById('screen');
canvas.width = W;
canvas.height = H;
// 群れの描画で毎フレーム getImageData するため willReadFrequently を指定
const ctx = canvas.getContext('2d', { willReadFrequently: true });

const mouse = { x: W / 2, y: H / 2 };
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - r.left) / r.width) * W;
  mouse.y = ((e.clientY - r.top) / r.height) * H;
});

// ---- 試作の数値（開発手順 ver1 の表に対応） ----
const START_FLIES = 60;
const TARGET_FLIES = 1000;   // 試作では「画面の半分」= 1,000匹で終幕
const BITE_PROB = 0.06;      // 1匹が1フレームにアイテム上でかじる確率
const GROWTH = { small: 60, mid: 120, large: 200 }; // 食べ切ったときの増加匹数
// 合計 = 120+200+60+120+120+200+60+60 = 940 ＋ 開始60 = 1000（全部食べると到達）

const DESK = makeDesk(W, H, 7);
const litter = document.createElement('canvas'); // パンくず・紙片が積もる層
litter.width = W; litter.height = H;
const lctx = litter.getContext('2d');

// 8アイテム（座標は左上）。机の上で重ならない配置
const layout = [
  ['banana', 28, 20, 'mid'],
  ['mapo',  108, 14, 'large'],
  ['sugar', 200, 26, 'small'],
  ['pen',    62, 62, 'small'],
  ['bread',  24, 92, 'mid'],
  ['record', 96, 88, 'mid'],
  ['manga', 160, 84, 'large'],
  ['radio', 210, 96, 'small'],
];
const items = layout.map(([name, x, y, size]) => ({
  it: makeItem(name), name, x, y, grow: GROWTH[size], awarded: 0, done: false, fired: false,
}));

const swarm = createSwarm(W, H);
let flies = START_FLIES;
swarm.setCount(flies);

// ---- 音（ブラウザの規則で、最初の操作の後に開始する） ----
let actx = null, wings = null, master = null, started = false;
let radio = null, music = null;
function startAudio() {
  if (started) return;
  started = true;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  master = actx.createGain();
  master.gain.value = 0.9;
  master.connect(actx.destination);
  wings = createWingSound(actx);
  wings.connect(master);
  wings.setCount(flies);
}
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, startAudio, { once: false });

// ---- 粒子（パンくず・紙片）。落ちたら litter 層に残る ----
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
function drawParts() {
  for (const p of parts) { ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); }
}

// ---- 食べ終わった/食べ始めたときのアクション（Step 5） ----
const eaten = []; // 食べた順（終幕後の一覧用）
const SOUND_ACTIONS = new Set(['sugar', 'radio', 'record']);
function fireAction(name) {
  switch (name) {
    case 'mapo': swarm.setTint('#8c1c14'); break;                 // 見た目: ハエが赤く染まる
    case 'pen': swarm.setJitter(1); break;                        // 見た目: 細かく震える
    case 'sugar': wings.setPitchShift(2); break;                  // 音: 羽音の音程が上がる
    case 'radio': if (!radio) radio = startRadio(actx, master); break;          // 音: ノイズ混じりの音声
    case 'record': if (!music) music = startRecordMusic(actx, master); break;   // 音楽
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
    const target = Math.round(o.grow * (o.done ? 1 : frac));
    if (target > o.awarded) { flies += target - o.awarded; o.awarded = target; }
  }
  flies = Math.min(flies, swarm.max);
}

// ---- テスト用キー（本番では外す） ----
// D: デバッグ表示  N: ハエ+100匹
let debug = true;
window.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') debug = !debug;
  else if (e.key === 'n' || e.key === 'N') flies = Math.min(flies + 100, swarm.max);
  else return;
});

let msAvg = 0;
function drawDebug(fps) {
  ctx.fillStyle = 'rgba(255,240,210,0.85)';
  ctx.font = '8px monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(`${swarm.count}/${TARGET_FLIES} flies  ${msAvg.toFixed(2)}ms  ${fps}fps`, 2, 2);
  if (!started) ctx.fillText('クリックかキーで音が始まります', 2, H - 10);
}

let last = performance.now();
let fpsCount = 0, fpsTime = 0, fps = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  // 音が始まる前に発動条件を満たしていたアクションを遅れて発動
  if (actx && firedLate.size) { for (const n of firedLate) fireAction(n); firedLate.clear(); }

  ctx.drawImage(DESK, 0, 0);
  ctx.drawImage(litter, 0, 0);
  for (const o of items) if (!o.done) drawItem(ctx, o.it, o.x, o.y);

  const t0 = performance.now();
  swarm.update(dt, mouse);
  eatFrame();
  if (flies !== swarm.count) { swarm.setCount(flies); if (wings) wings.setCount(flies); }
  updateParts(dt);
  drawParts();
  swarm.draw(ctx);
  msAvg = msAvg * 0.95 + (performance.now() - t0) * 0.05;

  fpsCount++; fpsTime += dt;
  if (fpsTime >= 0.5) { fps = Math.round(fpsCount / fpsTime); fpsCount = 0; fpsTime = 0; }
  if (debug) drawDebug(fps);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 検証用に公開（コンソールから状態を見る）
window.__game = { items, swarm, eaten, ITEM_LABELS };
