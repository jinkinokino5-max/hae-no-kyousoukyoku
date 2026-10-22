import { createSwarm } from './swarm.js';

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

const swarm = createSwarm(W, H);
swarm.setCount(1000);

// ---- テスト用キー（Step 2 確認用。本番では外す） ----
// ↑/↓: ±100匹（Shift で ±1000）  数字: 0=0, 1=1, 2=10, 3=100, 4=300, 5=1000, 6=2000, 7=3000, 8=4000
// T: 色の切替（黒→赤）  J: 震えの切替  D: デバッグ表示
const digitCounts = [0, 1, 10, 100, 300, 1000, 2000, 3000, 4000];
let debug = true, red = false, shaky = false;
window.addEventListener('keydown', (e) => {
  const step = e.shiftKey ? 1000 : 100;
  if (e.key === 'ArrowUp') swarm.setCount(swarm.count + step);
  else if (e.key === 'ArrowDown') swarm.setCount(swarm.count - step);
  else if (e.key >= '0' && e.key <= '8') swarm.setCount(digitCounts[+e.key]);
  else if (e.key === 't' || e.key === 'T') { red = !red; swarm.setTint(red ? '#8c1c14' : '#16141a'); }
  else if (e.key === 'j' || e.key === 'J') { shaky = !shaky; swarm.setJitter(shaky ? 1 : 0); }
  else if (e.key === 'd' || e.key === 'D') debug = !debug;
  else return;
  e.preventDefault();
});

function drawDesk() {
  // 仮の机。Step 3 でピクセルアート自動生成に置き換える
  ctx.fillStyle = '#8a5a2b';
  ctx.fillRect(0, 0, W, H);
}

let msAvg = 0;
function drawDebug(fps) {
  ctx.fillStyle = 'rgba(255,240,210,0.8)';
  ctx.font = '8px monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(`${swarm.count} flies  ${msAvg.toFixed(2)}ms  ${fps}fps`, 2, 2);
}

let last = performance.now();
let fpsCount = 0, fpsTime = 0, fps = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  drawDesk();

  const t0 = performance.now();
  swarm.update(dt, mouse);
  swarm.draw(ctx);
  msAvg = msAvg * 0.95 + (performance.now() - t0) * 0.05;

  fpsCount++; fpsTime += dt;
  if (fpsTime >= 0.5) { fps = Math.round(fpsCount / fpsTime); fpsCount = 0; fpsTime = 0; }
  if (debug) drawDebug(fps);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
