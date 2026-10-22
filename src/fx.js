// 食べ物・文化物が引き起こす「音」のアクション。すべて Web Audio で合成する（外部素材なし）。

// ラジオ: ノイズ混じりの“声らしきもの”。中身は合成（帯域ノイズ＋母音っぽいフォルマントの揺れ）。
export function startRadio(ctx, dest) {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(dest);

  // ホワイトノイズ（ループ）
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;

  // ラジオらしい狭い帯域
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
  const hiss = ctx.createGain(); hiss.gain.value = 0.35;
  noise.connect(hp); hp.connect(lp); lp.connect(hiss); hiss.connect(out);

  // 声っぽい層: ノコギリ波を2つのバンドパス（フォルマント）に通し、ゆっくり母音を変える
  const voice = ctx.createOscillator(); voice.type = 'sawtooth'; voice.frequency.value = 118;
  const vib = ctx.createOscillator(); vib.frequency.value = 5.2;
  const vibAmt = ctx.createGain(); vibAmt.gain.value = 4;
  vib.connect(vibAmt); vibAmt.connect(voice.frequency);
  const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 6; f1.frequency.value = 600;
  const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 8; f2.frequency.value = 1500;
  const vg = ctx.createGain(); vg.gain.value = 0;
  voice.connect(f1); voice.connect(f2); f1.connect(vg); f2.connect(vg); vg.connect(out);

  // 母音と音量を数百ms〜数秒ごとにランダムに切り替える（言葉になりかけて途切れる感じ）
  const vowels = [[700, 1200], [300, 2300], [450, 800], [550, 1800], [350, 700]];
  let alive = true;
  function babble() {
    if (!alive) return;
    const t = ctx.currentTime;
    const v = vowels[(Math.random() * vowels.length) | 0];
    f1.frequency.setTargetAtTime(v[0], t, 0.05);
    f2.frequency.setTargetAtTime(v[1], t, 0.05);
    voice.frequency.setTargetAtTime(100 + Math.random() * 50, t, 0.08);
    const speaking = Math.random() < 0.7;
    vg.gain.setTargetAtTime(speaking ? 0.05 : 0, t, 0.04);
    setTimeout(babble, 160 + Math.random() * 380);
  }

  noise.start(); voice.start(); vib.start();
  out.gain.setTargetAtTime(0.5, ctx.currentTime, 0.6);
  babble();

  return {
    stop() {
      alive = false;
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      setTimeout(() => { try { noise.stop(); voice.stop(); vib.stop(); out.disconnect(); } catch {} }, 2000);
    },
  };
}

// レコードの曲（Step 5 の仮実装。Step 6 で羽音との重なりを磨く）。
// ゆっくりした3拍子のやわらかい旋律を、サイン波＋ふわっとした残響で鳴らす。
export function startRecordMusic(ctx, dest) {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(dest);
  out.gain.setTargetAtTime(0.5, ctx.currentTime, 1.0);

  // 簡易な残響（フィードバックディレイ）
  const delay = ctx.createDelay(1); delay.delayTime.value = 0.38;
  const fb = ctx.createGain(); fb.gain.value = 0.38;
  const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 2200;
  delay.connect(damp); damp.connect(fb); fb.connect(delay);
  const wet = ctx.createGain(); wet.gain.value = 0.5;
  out.connect(delay); delay.connect(wet); wet.connect(dest);

  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // [MIDIノート, 長さ(拍)] Dm 系のゆったりした旋律（オリジナルの短い旋律）
  const melody = [
    [74, 1.5], [72, 0.5], [70, 1], [69, 3],
    [70, 1.5], [69, 0.5], [67, 1], [65, 3],
    [67, 1.5], [69, 0.5], [70, 1], [72, 1], [70, 1], [69, 1],
    [67, 2], [65, 1], [62, 3],
  ];
  const bass = [50, 50, 46, 45, 46, 43, 41, 38]; // 1小節(3拍)ごと
  const beat = 0.75; // 秒
  let alive = true, timer = null, t0 = ctx.currentTime + 0.3;

  function note(m, start, dur, gain, type) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz(m);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(out);
    o.start(start); o.stop(start + dur + 0.05);
  }
  function schedule() {
    if (!alive) return;
    let t = t0;
    for (const [m, b] of melody) { note(m, t, b * beat * 1.4, 0.16, 'sine'); t += b * beat; }
    for (let i = 0; i < bass.length; i++) note(bass[i], t0 + i * 3 * beat, 3 * beat, 0.11, 'triangle');
    const len = t - t0;
    t0 += len;
    // 次の周回を、今回が終わる少し前に予約する（ループ再生）
    timer = setTimeout(schedule, Math.max(500, (t0 - ctx.currentTime - 2) * 1000));
  }
  schedule();

  return {
    stop() {
      alive = false;
      clearTimeout(timer);
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
    },
  };
}
