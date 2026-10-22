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
  const MAX = opts.max ?? 5000;          // 動きを計算する個体の上限
  // 上限を超えた分は「分身」として描く: 本物の個体 i の、自分の追従点まわりの位置を
  // 回転・拡大して写した場所に描く。群れと一緒に生き物らしく動き、計算はほぼ増えない。
  const CLONES = opts.clones ?? 7;       // 1個体あたりの分身の数 → 見た目の最大 = MAX × (1 + CLONES)
  const TOTAL_MAX = MAX * (1 + CLONES);
  const cloneCos = new Float32Array(CLONES + 1), cloneSin = new Float32Array(CLONES + 1);
  for (let k = 1; k <= CLONES; k++) {
    const a = k * 2.39996;               // 黄金角ずつ回す（重なりにくい）
    const sc = 1.0 + 0.6 * ((k * 0.618) % 1); // 分身は本物より外側寄りに散らし、群れの縁まで埋める
    cloneCos[k] = Math.cos(a) * sc; cloneSin[k] = Math.sin(a) * sc;
  }

  // ---- 個体ごとの状態 ----
  const px = new Float32Array(MAX), py = new Float32Array(MAX);   // 位置
  const vx = new Float32Array(MAX), vy = new Float32Array(MAX);   // 速度
  const ax = new Float32Array(MAX), ay = new Float32Array(MAX);   // 遅れて追うカーソル位置
  const th = new Float32Array(MAX);    // 軌道上の角度
  const om = new Float32Array(MAX);    // 角速度（符号＝回転方向）
  const rad = new Float32Array(MAX);   // 軌道半径の基準（0..1、群れの大きさを掛ける）。中心に濃い分布
  const radU = new Float32Array(MAX);  // 同じ個体の「円の中に均一に散らばる」場合の半径（大群のとき用）
  const ecc = new Float32Array(MAX);   // 楕円の縦横比
  const tc = new Float32Array(MAX), ts = new Float32Array(MAX); // 楕円の傾き(cos,sin)
  const rph = new Float32Array(MAX);   // 半径のゆらぎ位相
  const lag = new Float32Array(MAX);   // カーソル追従の速さ（小さいほど遅れる）
  const stiff = new Float32Array(MAX); // 目標点へのバネの強さ
  const wph = new Uint8Array(MAX);     // 羽ばたきの位相
  const lc = new Float32Array(MAX), ls = new Float32Array(MAX); // 飛び去る向き（単位ベクトル）。個体ごとに固定
  const unitC = new Float32Array(CLONES + 1), unitS = new Float32Array(CLONES + 1); // 分身ごとの回転（拡大なし）
  for (let k = 1; k <= CLONES; k++) { unitC[k] = Math.cos(k * 2.39996); unitS[k] = Math.sin(k * 2.39996); }

  // ---- 見た目のパラメータ（将来のアクション用に外から変えられる） ----
  let tintR = 22, tintG = 20, tintB = 26;   // 体の色（ほぼ黒、わずかに青み）
  let jitter = 0;                           // 震えの強さ（0=なし, 1=万年筆で細かく震える程度）。実際に効いている値（目標へなめらかに近づく）
  let wingAlpha = 0.35;                     // 羽のきらめきの濃さ
  let speed = 1;                            // 動きの速さの倍率（コーヒーで速くなる）
  let spread = 1;                           // 群れの広がりの倍率（梅干しできゅっと縮む）
  let palette = null;                       // 個体ごとの色（絵の具で色とりどりに）。null なら tint 一色
  let stripeW = 0;                          // >0 なら palette の色を個体の x 位置の縞で選ぶ（スイカ）。0 なら個体ごとの位相で選ぶ
  // 「目標値へなめらかに近づく」パラメータ（アクションが切れたときに2〜3秒かけて元へ戻るため）。名前T=目標、無印=いまの値
  let jitterT = 0, speedT = 1, spreadT = 1;
  let gravity = 0, gravityT = 0;            // 重力: 群れが下に垂れ下がる（0..1）
  let sway = 0, swayT = 0;                  // 千鳥足: 追従点を sin でゆらす振幅(px)
  let split = 0, splitT = 0, splitPh = 0;   // 2群に分かれて交差する量（0..1）と、交差の位相
  let formK = 0, formT = 0, formFn = null;  // 隊形: 軌道上の目標点を変換する関数 fn(x, y, out) と、その効き具合（0..1）
  const formOut = { x: 0, y: 0 };
  const SLIP_MAX = 16;                      // 滑る領域（バナナの皮）。円形 {x,y,r}
  const slipX = new Float32Array(SLIP_MAX), slipY = new Float32Array(SLIP_MAX), slipR2 = new Float32Array(SLIP_MAX), slipR = new Float32Array(SLIP_MAX);
  let slipN = 0;
  const SPLIT_X = 40, SPLIT_Y = 14;         // 2群のずれの大きさ(px)

  // 飛び去り（エンディング用）: 末尾の leaveFrac の割合の個体が、画面の外へ向かって離れていく（描画位置だけを動かす）
  let leaveFrac = 0, leaveCount = 0;
  const LEAVE_DIST = 460;                   // 去る個体が最終的に離れる距離(px)。画面の外まで届く
  let lox = 0, loy = 0;                     // leaveOffset の結果

  let count = 0;      // 見た目の匹数（分身を含む）
  let sim = 0;        // 動きを計算している個体数（≤ MAX）
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

  let lastTx = opts.startX ?? W / 2, lastTy = opts.startY ?? H / 2;
  let camX = 0, camY = 0; // 描画時のカメラ位置（オープンワールド用。W,H は画面＝ビューの大きさ）

  function spawn(i, x, y) {
    const a = rnd() * TAU, d = rnd() * 6;
    px[i] = x + Math.cos(a) * d;
    py[i] = y + Math.sin(a) * d;
    vx[i] = (rnd() - 0.5) * 40;
    vy[i] = (rnd() - 0.5) * 40;
    ax[i] = x; ay[i] = y;
    th[i] = rnd() * TAU;
    // 中心ほど密に、外側はまばらに
    const u = rnd();
    rad[i] = 0.12 + 0.88 * Math.pow(u, 1.4);
    radU[i] = Math.sqrt(u);              // 半径の2乗が一様 → 面積あたりの密度が均一
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
    const la = rnd() * TAU;
    lc[i] = Math.cos(la); ls[i] = Math.sin(la);
  }

  function setCount(n) {
    n = Math.max(0, Math.min(TOTAL_MAX, n | 0));
    const s = Math.min(n, MAX);
    if (s > sim) {
      // 新しいハエは群れの中心付近（いまのカーソル位置）から生まれる
      for (let i = sim; i < s; i++) spawn(i, lastTx, lastTy);
    }
    sim = s;
    count = n;
    api.count = count;
    api.sim = sim;
  }

  // 群れの大きさ: 数が増えるほど少しずつ広がる
  function swarmRadius() {
    // 数が増えるほどカーソルから離れて広く散る（4万匹で半径約190px＝画面の外まで）
    return (8 + Math.sqrt(count) * 0.9) * spread;
  }

  // 数が増えるほど群れを横に引き伸ばす（横長の画面を埋めるため。最大で1.55倍）
  function aspect() { return 1 + 0.55 * Math.min(1, count / TOTAL_MAX); }

  function step(dt, tx, ty) {
    time += dt;
    const R = swarmRadius();
    const asp = aspect();
    // 少ないうちは中心に濃く集まり、増えるほど「円の中に均一に散らばる」分布へ移る（穴も塊もない広がり）
    const f = Math.sqrt(Math.min(1, count / TOTAL_MAX)), f1 = 1 - f;
    const damp = Math.exp(-2.6 * dt);          // 速度の減衰（空気抵抗）
    const noise = 90 + jitter * 260;           // ランダムな力の強さ
    if (split > 0.001) splitPh += dt * 1.05;   // 交差は約3秒で半周（左右が入れ替わる）
    const sCos = Math.cos(splitPh), sSin = Math.sin(splitPh);
    // 千鳥足: カーソル追従点そのものをゆらす（個体の遅れを通して、群れがふらふら蛇行する）
    if (sway > 0.01) { tx += Math.sin(time * 1.2) * sway; ty += Math.sin(time * 0.8 + 1.3) * sway * 0.6; }
    const useForm = formK > 0.001 && formFn !== null;
    const dartP = 0.25 * dt;                   // 1匹あたり1秒に0.25回ほど飛び出す
    const maxV = 160;

    for (let i = 0; i < sim; i++) {
      // 自分なりの遅れでカーソルを追う
      const k = 1 - Math.exp(-lag[i] * dt);
      let atx = tx, aty = ty;
      if (split > 0.001) { // 偶数番と奇数番で左右に分かれ、位相に合わせて入れ替わる
        const sg = (i & 1) ? 1 : -1;
        atx += sg * SPLIT_X * split * sCos; aty += sg * SPLIT_Y * split * sSin;
      }
      ax[i] += (atx - ax[i]) * k;
      ay[i] += (aty - ay[i]) * k;

      // 軌道上の目標点
      th[i] += om[i] * dt;
      const r = R * (rad[i] * f1 + radU[i] * f) * (0.85 + 0.15 * Math.sin(time * 0.7 + rph[i]));
      const ox = Math.cos(th[i]) * r;
      const oy = Math.sin(th[i]) * r * ecc[i];
      let rx = ox * tc[i] - oy * ts[i], ry = ox * ts[i] + oy * tc[i];
      if (useForm) { // 隊形: 円盤状の目標点を別の形へ写す
        formFn(rx, ry, formOut);
        rx += (formOut.x - rx) * formK; ry += (formOut.y - ry) * formK;
      }
      if (gravity > 0.001) { // 重力: 上側を縮め、全体を下へ垂らす
        if (ry < 0) ry *= 1 - 0.5 * gravity;
        ry += gravity * R * 0.7;
      }
      const gx = ax[i] + rx * asp;
      const gy = ay[i] + ry;

      // バネ＋ランダムな力
      const s = stiff[i];
      let fx = (gx - px[i]) * s + (rnd() - 0.5) * noise;
      let fy = (gy - py[i]) * s + (rnd() - 0.5) * noise;

      let nvx = (vx[i] + fx * dt) * damp;
      let nvy = (vy[i] + fy * dt) * damp;

      // 滑る領域（バナナの皮）: 中に入った個体は接線方向に加速され、くるくる回る
      for (let z = 0; z < slipN; z++) {
        const dx = px[i] - slipX[z], dy = py[i] - slipY[z];
        const d2 = dx * dx + dy * dy;
        if (d2 < slipR2[z] && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const a = 900 * (0.4 + 0.6 * (1 - d / slipR[z])) * dt / d;
          nvx += -dy * a; nvy += dx * a;
        }
      }

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
    // 目標値へなめらかに近づける（時定数 約1秒 → 2〜3秒でほぼ元に戻る）
    const sk = 1 - Math.exp(-1.0 * Math.min(dt, 0.1));
    jitter += (jitterT - jitter) * sk; speed += (speedT - speed) * sk; spread += (spreadT - spread) * sk;
    gravity += (gravityT - gravity) * sk; sway += (swayT - sway) * sk; split += (splitT - split) * sk;
    formK += (formT - formK) * sk;
    if (formT === 0 && formK < 0.002) { formK = 0; formFn = null; }
    if (swayT === 0 && sway < 0.01) sway = 0;
    if (splitT === 0 && split < 0.002) split = 0;
    // 大きな dt でもバネが暴れないよう分割する
    let rest = Math.min(dt, 0.1) * speed;
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
  function draw(ctx, cx = 0, cy = 0) {
    if (count === 0) return;
    camX = cx | 0; camY = cy | 0;
    const img = ctx.getImageData(0, 0, W, H);
    drawInto(img);
    ctx.putImageData(img, 0, 0);
  }

  // ImageData に直接描く（テストやベンチ用に分離）
  function drawInto(img) {
    const buf = new Uint32Array(img.data.buffer);
    // 飛び去り: g 番目（分身を含む通し番号）の個体の描画位置のずれを lox, loy に入れる。
    // 「もうすぐ数から外れる」個体ほど遠くへ離れる（外れる直前には画面の外にいる）
    const lv = leaveFrac > 0.0005;
    if (!lv) { lox = 0; loy = 0; }
    const ln0 = leaveCount * (1 - leaveFrac), lden = Math.max(1, leaveCount * leaveFrac);
    const leaveOff = (g, ca, sa) => {
      let u = (g + 1 - ln0) / lden;
      if (u <= 0) { lox = 0; loy = 0; return; }
      if (u > 1) u = 1;
      const d = LEAVE_DIST * u, wob = Math.sin(time * 3 + g) * 5 * u; // 少しふらつきながら飛ぶ
      lox = ca * d - sa * wob; loy = sa * d + ca * wob;
    };
    const jAmp = jitter * 1.2;
    // リトルエンディアン前提（ブラウザの実環境はほぼ全てこれ）: 0xAABBGGRR
    const body = (255 << 24 | tintB << 16 | tintG << 8 | tintR) >>> 0;
    const wa = Math.round(wingAlpha * 256);
    const WR = 225, WG = 228, WB = 235; // 羽の光（わずかに青白い）

    // 1) 影: 体の右下を少し暗くして、机から浮いて見せる
    for (let i = 0; i < sim; i++) {
      if (lv) leaveOff(i, lc[i], ls[i]);
      const x = (px[i] - camX + 1.5 + lox) | 0, y = (py[i] - camY + 2.5 + loy) | 0;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const o = y * W + x;
      const c = buf[o];
      // 各チャンネルを約 0.8 倍
      const r = (c & 255) * 205 >> 8, g = (c >> 8 & 255) * 205 >> 8, b = (c >> 16 & 255) * 205 >> 8;
      buf[o] = (255 << 24 | b << 16 | g << 8 | r) >>> 0;
    }

    // 2) 羽: 個体ごとの位相で体の上の1ピクセルがちらちら光る
    const f = frame;
    for (let i = 0; i < sim; i++) {
      if (((wph[i] + f) & 3) !== 0) continue;
      if (lv) leaveOff(i, lc[i], ls[i]);
      let xf = px[i] - camX + lox, yf = py[i] - camY - 1 + loy;
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
    const pal = palette, pn = pal ? pal.length : 0;
    const sw = pn > 0 && stripeW > 0, sInv = sw ? 1 / stripeW : 0;
    const stripe = (wx) => ((Math.floor(wx * sInv) % pn) + pn) % pn; // 世界座標 x で縞の色を決める
    for (let i = 0; i < sim; i++) {
      if (lv) leaveOff(i, lc[i], ls[i]);
      let xf = px[i] - camX + lox, yf = py[i] - camY + loy;
      if (jAmp > 0) { xf += (rnd() - 0.5) * jAmp; yf += (rnd() - 0.5) * jAmp; }
      const x = xf | 0, y = yf | 0;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      buf[y * W + x] = pn ? pal[sw ? stripe(px[i]) : wph[i] % pn] : body;
    }
    // 4) 分身: 個体 i の追従点からのずれを回転・拡大した位置に、体だけを描く
    for (let k = 1; k <= CLONES; k++) {
      const base = k * sim;
      if (base >= count) break;
      const c = cloneCos[k], sn = cloneSin[k], asp = aspect(), inv = 1 / asp;
      const m = Math.min(sim, count - base);
      for (let i = 0; i < m; i++) {
        // 横の引き伸ばしを戻してから回転し、もう一度引き伸ばす（分身も横長の群れに収まる）
        const dx = (px[i] - ax[i]) * inv, dy = py[i] - ay[i];
        let xf = ax[i] + (dx * c - dy * sn) * asp - camX, yf = ay[i] + dx * sn + dy * c - camY;
        if (lv) {
          leaveOff(base + i, lc[i] * unitC[k] - ls[i] * unitS[k], ls[i] * unitC[k] + lc[i] * unitS[k]);
          xf += lox; yf += loy;
        }
        if (jAmp > 0) { xf += (rnd() - 0.5) * jAmp; yf += (rnd() - 0.5) * jAmp; }
        const x = xf | 0, y = yf | 0;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        buf[y * W + x] = pn ? pal[sw ? stripe(xf + camX) : (wph[i] + k * 37) % pn] : body;
      }
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
  function setJitter(v) { jitterT = Math.max(0, +v || 0); }
  function setWing(a) { wingAlpha = Math.max(0, Math.min(1, +a || 0)); }
  // 以下の speed / spread / jitter / gravity / sway / split / formation は「目標値」を設定し、実際の値はなめらかに追いつく
  function setSpeed(k) { speedT = Math.max(0.2, Math.min(3, +k || 1)); }
  function setSpread(k) { spreadT = Math.max(0.3, Math.min(3, +k || 1)); }
  function setGravity(g) { gravityT = Math.max(0, Math.min(1.5, +g || 0)); }
  function setSway(a) { swayT = Math.max(0, Math.min(80, +a || 0)); }
  // 群れを偶数番／奇数番の2つに分け、左右に離して交差させる（トランプのシャッフル）。0 で1つに戻る
  function setSplit(t) { splitT = Math.max(0, Math.min(1, +t || 0)); }
  // 隊形: fn(x, y, out) は軌道上の目標点（追従点からのずれ, px）を受け取り out.x / out.y に変換後を書く。
  // 'triangle' は組み込み。null で解除（なめらかに戻る）。amount は効き具合 0..1
  function setFormation(f, amount = 1) {
    if (f === 'triangle') f = triangleForm;
    if (typeof f === 'function') { formFn = f; formT = Math.max(0, Math.min(1, +amount || 0)); }
    else formT = 0;
  }
  // 頂点が上の正三角形。点 p を、方向はそのままで「三角形のゲージ」が元の半径に等しくなるよう写す
  function triangleForm(x, y, out) {
    const g = Math.max(y, -0.866 * x - 0.5 * y, 0.866 * x - 0.5 * y);
    const s = g > 1e-3 ? 0.8 * Math.sqrt(x * x + y * y) / g : 0;
    out.x = x * s; out.y = y * s;
  }
  // 縞: palette の色を個体の x 位置（幅 w px ごと）で選ぶ。0 / null で解除（個体ごとの色に戻る）
  // 飛び去り: 末尾から数えて frac（0..1）の割合の個体が、画面の外へ向かって離れていく。
  // fcount は小数を含む「いまの匹数」（整数でなく連続した値を渡すと、数が1匹減るときに位置が跳ばない）。frac=0 で解除
  function setLeave(frac, fcount) {
    const f = +frac;
    leaveFrac = f > 0 ? Math.min(1, f) : 0;
    leaveCount = fcount != null && fcount >= 0 ? +fcount : count;
  }
  function setStripes(w) { stripeW = Math.max(0, +w || 0); }
  // 滑る領域: [{x, y, r}]（世界座標）。中に入った個体が接線方向へ加速される。最大16個。空配列で解除
  function setSlipZones(list) {
    slipN = 0;
    for (const z of list || []) {
      if (slipN >= SLIP_MAX) break;
      slipX[slipN] = z.x; slipY[slipN] = z.y; slipR[slipN] = z.r; slipR2[slipN] = z.r * z.r; slipN++;
    }
  }
  // setPalette(['#c03030', '#3060c0', ...]) / setPalette(null)
  function setPalette(list) {
    palette = list && list.length ? Uint32Array.from(list, (h) => {
      const v = parseInt(h.replace('#', ''), 16);
      return (255 << 24 | (v & 255) << 16 | (v >> 8 & 255) << 8 | v >> 16 & 255) >>> 0;
    }) : null;
  }

  const api = {
    count: 0,
    sim: 0,
    max: TOTAL_MAX,
    setCount,
    update,
    draw,
    drawInto,
    setTint,
    setJitter,
    setWing,
    setSpeed,
    setSpread,
    setPalette,
    setGravity,
    setSway,
    setSplit,
    setFormation,
    setStripes,
    setLeave,
    setSlipZones,
    get tint() { return [tintR, tintG, tintB]; },
    get jitter() { return jitter; },
    radius: swarmRadius,
    // 生の位置データ（当たり判定・音の定位など後のステップ用。書き換えないこと）
    positions: { x: px, y: py },
  };
  return api;
}
