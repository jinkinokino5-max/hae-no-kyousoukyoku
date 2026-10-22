// ハエの群れ（Step 2）
// - 全個体の状態を TypedArray に持ち、オブジェクト生成ゼロで更新する
// - 描画は ImageData の Uint32 ビューに直接書き込む（fillRect を個体数ぶん呼ばない）
//
// 動きの考え方:
//   各ハエは「自分だけの遅れたカーソル位置(anchor)」の周りを、自分だけの楕円軌道で回る目標点を持ち、
//   そこへバネ＋減衰で引き寄せられる。追従の遅さ・軌道半径・回転方向・バネの強さが個体ごとに違うので、
//   カーソルを動かすと群れが尾を引いて伸び、止まると再びまとまって渦を巻く。
//   さらに小さなランダムな力と、まれな「ふっと飛び出す」動きで、機械的な周回に見えないようにする。

const TAU = Math.PI * 2;

export function createSwarm(W, H, opts = {}) {
  const MAX = opts.max ?? 4000;

  // ---- 個体ごとの状態 ----
  const px = new Float32Array(MAX), py = new Float32Array(MAX);   // 位置
  const vx = new Float32Array(MAX), vy = new Float32Array(MAX);   // 速度
  const ax = new Float32Array(MAX), ay = new Float32Array(MAX);   // 遅れて追うカーソル位置
  const th = new Float32Array(MAX);    // 軌道上の角度
  const om = new Float32Array(MAX);    // 角速度（符号＝回転方向）
  const rad = new Float32Array(MAX);   // 軌道半径の基準（0..1、群れの大きさを掛ける）
  const ecc = new Float32Array(MAX);   // 楕円の縦横比
  const tc = new Float32Array(MAX), ts = new Float32Array(MAX); // 楕円の傾き(cos,sin)
  const rph = new Float32Array(MAX);   // 半径のゆらぎ位相
  const lag = new Float32Array(MAX);   // カーソル追従の速さ（小さいほど遅れる）
  const stiff = new Float32Array(MAX); // 目標点へのバネの強さ
  const wph = new Uint8Array(MAX);     // 羽ばたきの位相

  // ---- 見た目のパラメータ（将来のアクション用に外から変えられる） ----
  let tintR = 22, tintG = 20, tintB = 26;   // 体の色（ほぼ黒、わずかに青み）
  let jitter = 0;                           // 震えの強さ（0=なし, 1=万年筆で細かく震える程度）
  let wingAlpha = 0.35;                     // 羽のきらめきの濃さ

  let count = 0;
  let time = 0;
  let frame = 0;

  // 決定的で速い乱数（xorshift32）
  let seed = (opts.seed ?? 0x9e3779b9) >>> 0;
  function rnd() {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 4294967296;
  }

  let lastTx = W / 2, lastTy = H / 2;

  function spawn(i, x, y) {
    const a = rnd() * TAU, d = rnd() * 6;
    px[i] = x + Math.cos(a) * d;
    py[i] = y + Math.sin(a) * d;
    vx[i] = (rnd() - 0.5) * 40;
    vy[i] = (rnd() - 0.5) * 40;
    ax[i] = x; ay[i] = y;
    th[i] = rnd() * TAU;
    // 中心ほど密に、外側はまばらに
    rad[i] = 0.12 + 0.88 * Math.pow(rnd(), 1.4);
    // 外側ほどゆっくり回る。回転方向は7割が同じ向き（群れ全体にゆるい渦ができる）
    const dir = rnd() < 0.7 ? 1 : -1;
    om[i] = dir * (0.6 + rnd() * 1.6) / (0.4 + rad[i]);
    ecc[i] = 0.45 + rnd() * 0.5;
    const tilt = rnd() * TAU;
    tc[i] = Math.cos(tilt); ts[i] = Math.sin(tilt);
    rph[i] = rnd() * TAU;
    lag[i] = 1.2 + rnd() * rnd() * 5.0;   // 多くは遅め、一部が素早い先導役
    stiff[i] = 5 + rnd() * 9;
    wph[i] = (rnd() * 256) | 0;
  }

  function setCount(n) {
    n = Math.max(0, Math.min(MAX, n | 0));
    if (n > count) {
      // 新しいハエは群れの中心付近（いまのカーソル位置）から生まれる
      for (let i = count; i < n; i++) spawn(i, lastTx, lastTy);
    }
    count = n;
    api.count = count;
  }

  // 群れの大きさ: 数が増えるほど少しずつ広がる
  function swarmRadius() {
    return 8 + Math.sqrt(count) * 0.62;
  }

  function step(dt, tx, ty) {
    time += dt;
    const R = swarmRadius();
    const damp = Math.exp(-2.6 * dt);          // 速度の減衰（空気抵抗）
    const noise = 90 + jitter * 260;           // ランダムな力の強さ
    const dartP = 0.25 * dt;                   // 1匹あたり1秒に0.25回ほど飛び出す
    const maxV = 160;

    for (let i = 0; i < count; i++) {
      // 自分なりの遅れでカーソルを追う
      const k = 1 - Math.exp(-lag[i] * dt);
      ax[i] += (tx - ax[i]) * k;
      ay[i] += (ty - ay[i]) * k;

      // 軌道上の目標点
      th[i] += om[i] * dt;
      const r = R * rad[i] * (0.85 + 0.15 * Math.sin(time * 0.7 + rph[i]));
      const ox = Math.cos(th[i]) * r;
      const oy = Math.sin(th[i]) * r * ecc[i];
      const gx = ax[i] + ox * tc[i] - oy * ts[i];
      const gy = ay[i] + ox * ts[i] + oy * tc[i];

      // バネ＋ランダムな力
      const s = stiff[i];
      let fx = (gx - px[i]) * s + (rnd() - 0.5) * noise;
      let fy = (gy - py[i]) * s + (rnd() - 0.5) * noise;

      let nvx = (vx[i] + fx * dt) * damp;
      let nvy = (vy[i] + fy * dt) * damp;

      // まれに、ふっと飛び出す
      if (rnd() < dartP) {
        const a = rnd() * TAU, p = 40 + rnd() * 60;
        nvx += Math.cos(a) * p;
        nvy += Math.sin(a) * p;
      }

      // 速度の上限（2乗で比較して sqrt を減らす）
      const v2 = nvx * nvx + nvy * nvy;
      if (v2 > maxV * maxV) {
        const f = maxV / Math.sqrt(v2);
        nvx *= f; nvy *= f;
      }
      vx[i] = nvx; vy[i] = nvy;
      px[i] += nvx * dt;
      py[i] += nvy * dt;
    }
  }

  function update(dt, target) {
    const tx = target ? target.x : lastTx;
    const ty = target ? target.y : lastTy;
    lastTx = tx; lastTy = ty;
    // 大きな dt でもバネが暴れないよう分割する
    let rest = Math.min(dt, 0.1);
    while (rest > 1e-6) {
      const h = Math.min(rest, 1 / 30);
      step(h, tx, ty);
      rest -= h;
    }
    frame++;
  }

  // ---- 描画 ----
  // ctx に描かれている背景（机）を読み、影→羽→体の順にピクセルを書き込んで戻す。
  // 256x144 程度なら getImageData/putImageData は1フレーム1回で十分軽い。
  function draw(ctx) {
    if (count === 0) return;
    const img = ctx.getImageData(0, 0, W, H);
    drawInto(img);
    ctx.putImageData(img, 0, 0);
  }

  // ImageData に直接描く（テストやベンチ用に分離）
  function drawInto(img) {
    const buf = new Uint32Array(img.data.buffer);
    const jAmp = jitter * 1.2;
    // リトルエンディアン前提（ブラウザの実環境はほぼ全てこれ）: 0xAABBGGRR
    const body = (255 << 24 | tintB << 16 | tintG << 8 | tintR) >>> 0;
    const wa = Math.round(wingAlpha * 256);
    const WR = 225, WG = 228, WB = 235; // 羽の光（わずかに青白い）

    // 1) 影: 体の右下を少し暗くして、机から浮いて見せる
    for (let i = 0; i < count; i++) {
      const x = (px[i] + 1.5) | 0, y = (py[i] + 2.5) | 0;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const o = y * W + x;
      const c = buf[o];
      // 各チャンネルを約 0.8 倍
      const r = (c & 255) * 205 >> 8, g = (c >> 8 & 255) * 205 >> 8, b = (c >> 16 & 255) * 205 >> 8;
      buf[o] = (255 << 24 | b << 16 | g << 8 | r) >>> 0;
    }

    // 2) 羽: 個体ごとの位相で体の上の1ピクセルがちらちら光る
    const f = frame;
    for (let i = 0; i < count; i++) {
      if (((wph[i] + f) & 3) !== 0) continue;
      let xf = px[i], yf = py[i] - 1;
      if (jAmp > 0) { xf += (rnd() - 0.5) * jAmp; yf += (rnd() - 0.5) * jAmp; }
      const x = xf | 0, y = yf | 0;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const o = y * W + x;
      const c = buf[o];
      const r = (c & 255), g = (c >> 8 & 255), b = (c >> 16 & 255);
      const nr = r + ((WR - r) * wa >> 8), ng = g + ((WG - g) * wa >> 8), nb = b + ((WB - b) * wa >> 8);
      buf[o] = (255 << 24 | nb << 16 | ng << 8 | nr) >>> 0;
    }

    // 3) 体: 1ピクセル
    for (let i = 0; i < count; i++) {
      let xf = px[i], yf = py[i];
      if (jAmp > 0) { xf += (rnd() - 0.5) * jAmp; yf += (rnd() - 0.5) * jAmp; }
      const x = xf | 0, y = yf | 0;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      buf[y * W + x] = body;
    }
  }

  // ---- パラメータ変更 ----
  // setTint('#a02818') / setTint(160, 40, 24)
  function setTint(r, g, b) {
    if (typeof r === 'string') {
      const h = r.replace('#', '');
      const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
      r = v >> 16 & 255; g = v >> 8 & 255; b = v & 255;
    }
    tintR = r & 255; tintG = g & 255; tintB = b & 255;
  }
  function setJitter(v) { jitter = Math.max(0, +v || 0); }
  function setWing(a) { wingAlpha = Math.max(0, Math.min(1, +a || 0)); }

  const api = {
    count: 0,
    max: MAX,
    setCount,
    update,
    draw,
    drawInto,
    setTint,
    setJitter,
    setWing,
    get tint() { return [tintR, tintG, tintB]; },
    get jitter() { return jitter; },
    radius: swarmRadius,
    // 生の位置データ（当たり判定・音の定位など後のステップ用。書き換えないこと）
    positions: { x: px, y: py },
  };
  return api;
}
