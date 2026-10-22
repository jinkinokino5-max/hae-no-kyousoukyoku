// 低解像度の内部キャンバスに描いて拡大表示する（ファミコン風の粗さを保つ）
const W = 256, H = 144;
const canvas = document.getElementById('screen');
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext('2d');

const mouse = { x: W / 2, y: H / 2 };
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - r.left) / r.width) * W;
  mouse.y = ((e.clientY - r.top) / r.height) * H;
});

function drawDesk() {
  // 仮の机。Step 3 でピクセルアート自動生成に置き換える
  ctx.fillStyle = '#8a5a2b';
  ctx.fillRect(0, 0, W, H);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  drawDesk();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
