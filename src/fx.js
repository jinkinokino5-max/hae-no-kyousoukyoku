// 食べ物・文化物が引き起こす「音」のアクションと、終幕の曲。すべて Web Audio で合成する（外部素材なし）。

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function noiseBuffer(ctx, sec) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// ラジオ: ノイズ混じりの“声らしきもの”。中身は合成（帯域ノイズ＋母音っぽいフォルマントの揺れ）。
export function startRadio(ctx, dest) {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(dest);

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 2);
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

  // 母音と音量を数百msごとにランダムに切り替える（言葉になりかけて途切れる感じ）
  const vowels = [[700, 1200], [300, 2300], [450, 800], [550, 1800], [350, 700]];
  let alive = true;
  function babble() {
    if (!alive) return;
    const t = ctx.currentTime;
    const v = vowels[(Math.random() * vowels.length) | 0];
    f1.frequency.setTargetAtTime(v[0], t, 0.05);
    f2.frequency.setTargetAtTime(v[1], t, 0.05);
    voice.frequency.setTargetAtTime(100 + Math.random() * 50, t, 0.08);
    vg.gain.setTargetAtTime(Math.random() < 0.7 ? 0.05 : 0, t, 0.04);
    setTimeout(babble, 160 + Math.random() * 380);
  }

  noise.start(); voice.start(); vib.start();
  out.gain.setTargetAtTime(0.5, ctx.currentTime, 0.6);
  babble();

  return {
    stop(fade = 0.4) {
      alive = false;
      out.gain.setTargetAtTime(0, ctx.currentTime, fade);
      setTimeout(() => { try { noise.stop(); voice.stop(); vib.stop(); out.disconnect(); } catch {} }, fade * 6000);
    },
  };
}

// ---- 曲の再生の共通部分 ----
// 楽器の音色: サイン波の基音＋弱い倍音、ゆるやかな減衰（オルゴールとピアノの中間のような、静かな音）
function makePlayer(ctx, out) {
  return function note(m, start, dur, gain, attack = 0.02) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    g.connect(out);
    for (const [mul, amp, type] of [[1, 1, 'sine'], [2, 0.22, 'sine'], [3, 0.06, 'triangle']]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz(m) * mul;
      const a = ctx.createGain(); a.gain.value = amp;
      o.connect(a); a.connect(g);
      o.start(start); o.stop(start + dur + 0.05);
    }
  };
}

// 簡易な残響（フィードバックディレイ2本）。out に入れた音を dest へ、残響付きで流す
function makeRoom(ctx, dest, wetAmt = 0.45) {
  const input = ctx.createGain();
  input.connect(dest);
  const wet = ctx.createGain(); wet.gain.value = wetAmt;
  wet.connect(dest);
  for (const [t, f] of [[0.29, 0.42], [0.43, 0.35]]) {
    const d = ctx.createDelay(1); d.delayTime.value = t;
    const fb = ctx.createGain(); fb.gain.value = f;
    const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 2000;
    input.connect(d); d.connect(damp); damp.connect(fb); fb.connect(d); damp.connect(wet);
  }
  return input;
}

// 和音の変化を、AudioContext の時刻に合わせて通知する（羽音を曲の和音へ寄せるため）
function scheduleChord(ctx, at, pcs, onChord, timers) {
  if (!onChord) return;
  timers.push(setTimeout(() => onChord(pcs), Math.max(0, (at - ctx.currentTime) * 1000)));
}

// ---- レコード（Step 6） ----
// 針を落とす → パチパチ音 → こもった音がゆっくり開いて曲が立ち上がる。曲はループする。
// onChord(pcs) で、いま鳴っている和音（G=0 とした半音の音名）を知らせる。羽音の基本音 196Hz が G なので。
export function startRecordMusic(ctx, dest, { onChord } = {}) {
  const out = ctx.createGain();
  out.gain.value = 0;
  const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 350; tone.Q.value = 0.5;
  out.connect(tone);
  tone.connect(makeRoom(ctx, dest, 0.4));
  const now = ctx.currentTime;
  out.gain.setTargetAtTime(0.55, now + 1.2, 1.5);
  tone.frequency.setTargetAtTime(4200, now + 2.0, 3.0); // 古い蓄音機からだんだん近くで鳴っているように

  // レコードのパチパチ（まばらなインパルス）とサーッという地のノイズ
  const crackle = ctx.createBufferSource();
  const cb = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
  const cd = cb.getChannelData(0);
  for (let i = 0; i < cd.length; i++) {
    cd[i] = (Math.random() * 2 - 1) * 0.04 + (Math.random() < 0.0006 ? (Math.random() * 2 - 1) * 0.9 : 0);
  }
  crackle.buffer = cb; crackle.loop = true;
  const cf = ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 2500; cf.Q.value = 0.6;
  const cg = ctx.createGain(); cg.gain.value = 0;
  cg.gain.setTargetAtTime(0.18, now, 0.05);   // 針を落とした瞬間に立ち上がり
  cg.gain.setTargetAtTime(0.07, now + 3, 2);  // 曲が始まると後ろに下がる
  crackle.connect(cf); cf.connect(cg); cg.connect(dest);
  crackle.start(now);

  const note = makePlayer(ctx, out);
  // [MIDIノート, 長さ(拍)] Dm のゆったりした3拍子（オリジナルの短い旋律）
  const melody = [
    [74, 1.5], [72, 0.5], [70, 1], [69, 3],
    [70, 1.5], [69, 0.5], [67, 1], [65, 3],
    [67, 1.5], [69, 0.5], [70, 1], [72, 1], [70, 1], [69, 1],
    [67, 2], [65, 1], [62, 3],
  ];
  // 1小節(3拍)ごとの和音: [ルートのMIDI, 構成音のMIDIの並び]
  const D = [50, 57, 62, 65], Bb = [46, 53, 58, 62], A = [45, 52, 57, 61], Gm = [43, 50, 55, 58], F = [41, 48, 53, 57];
  const bars = [D, D, Bb, A, Bb, Gm, F, D];
  const beat = 0.78; // 秒
  const timers = [];
  let alive = true, t0 = now + 3.0;

  function schedule() {
    if (!alive) return;
    let t = t0;
    for (const [m, b] of melody) { note(m, t, b * beat * 1.6, 0.13); t += b * beat; }
    bars.forEach((ch, i) => {
      const bt = t0 + i * 3 * beat;
      note(ch[0], bt, 3 * beat * 1.2, 0.10);                       // 低音
      note(ch[2], bt + beat, beat * 1.5, 0.035);                   // 2・3拍目の和音を薄く
      note(ch[3], bt + beat, beat * 1.5, 0.03);
      note(ch[2], bt + 2 * beat, beat * 1.5, 0.03);
      note(ch[3], bt + 2 * beat, beat * 1.5, 0.025);
      scheduleChord(ctx, bt, ch.map((m) => (m - 55)), onChord, timers);
    });
    t0 = t;
    // 次の周回を、今回が終わる少し前に予約する（ループ）
    timers.push(setTimeout(schedule, Math.max(500, (t0 - ctx.currentTime - 2) * 1000)));
  }
  schedule();

  return {
    stop(fade = 0.6) {
      alive = false;
      timers.forEach(clearTimeout);
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0, t, fade);
      cg.gain.cancelScheduledValues(t);
      cg.gain.setTargetAtTime(0, t, fade);
      setTimeout(() => { try { crackle.stop(); } catch {} }, fade * 8000);
    },
  };
}

// ---- 終幕の曲（Step 7）: 蛍の光（スコットランド民謡 Auld Lang Syne。伝承曲のためパブリックドメイン） ----
// ヘ長調・4拍子で、ゆっくり。最後は少しずつ遅くなる。onChord で羽音を和音へ寄せ、onEnd で曲の終わりを知らせる。
export function startFarewell(ctx, dest, { onChord, onEnd } = {}) {
  const out = ctx.createGain();
  out.gain.value = 0.6;
  out.connect(makeRoom(ctx, dest, 0.55));
  const note = makePlayer(ctx, out);

  // [MIDIノート, 拍]（C4=60）。1小節目の前に1拍の弱起
  const C4 = 60, D4 = 62, F4 = 65, G4 = 67, A4 = 69, C5 = 72, D5 = 74;
  const melody = [
    [C4, 1],
    [F4, 1.5], [F4, 0.5], [F4, 1], [A4, 1],
    [G4, 1.5], [F4, 0.5], [G4, 1], [A4, 1],
    [F4, 1.5], [F4, 0.5], [A4, 1], [C5, 1],
    [D5, 3], [D5, 1],
    [C5, 1.5], [A4, 0.5], [A4, 1], [F4, 1],
    [G4, 1.5], [F4, 0.5], [G4, 1], [A4, 1],
    [F4, 1.5], [D4, 0.5], [D4, 1], [C4, 1],
    [F4, 3], [D5, 1],
    // 後半をもう一度（静かに締めくくる）
    [C5, 1.5], [A4, 0.5], [A4, 1], [F4, 1],
    [G4, 1.5], [F4, 0.5], [G4, 1], [A4, 1],
    [F4, 1.5], [D4, 0.5], [D4, 1], [C4, 1],
    [F4, 4],
  ];
  // 和音（小節ごと。7小節目・11小節目は 2拍ずつ Bb→C）
  const Fc = [41, 53, 57, 60], Cc = [36, 52, 55, 60], Bbc = [46, 53, 58, 62];
  const bars = [Fc, Cc, Fc, Bbc, Fc, Cc, [Bbc, Cc], Fc, Fc, Cc, [Bbc, Cc], Fc];

  const timers = [];
  const start = ctx.currentTime + 1.0;
  let beat = 0.95;
  // 拍 → 時刻（最後の2小節で少しずつ遅くなる）
  const totalBeats = 1 + bars.length * 4;
  const timeAt = (b) => {
    const slow = Math.max(0, b - (totalBeats - 8));
    return start + b * beat + slow * slow * 0.03;
  };

  let b = 0;
  for (const [m, len] of melody) {
    const t = timeAt(b), dur = timeAt(b + len) - t;
    note(m, t, dur * 1.5, 0.15, 0.04);
    b += len;
  }
  bars.forEach((ch, i) => {
    const halves = Array.isArray(ch[0]) ? ch : [ch];
    halves.forEach((c, h) => {
      const bb = 1 + i * 4 + h * (4 / halves.length);
      const t = timeAt(bb), dur = timeAt(bb + 4 / halves.length) - t;
      note(c[0], t, dur * 1.3, 0.09, 0.06);
      note(c[1], t, dur * 1.2, 0.03, 0.2);
      note(c[2], t, dur * 1.2, 0.03, 0.2);
      scheduleChord(ctx, t, c.map((m) => m - 55), onChord, timers);
    });
  });
  const end = timeAt(totalBeats);
  if (onEnd) timers.push(setTimeout(onEnd, (end - ctx.currentTime + 1.5) * 1000));

  return {
    duration: end - ctx.currentTime,
    stop() { timers.forEach(clearTimeout); out.gain.setTargetAtTime(0, ctx.currentTime, 0.5); },
  };
}
