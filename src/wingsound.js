// wingsound.js — ハエの羽音を Web Audio だけで合成するモジュール（外部音源なし）
//
// 使い方:
//   import { createWingSound } from './wingsound.js';
//   const wing = createWingSound(audioCtx);
//   wing.connect(audioCtx.destination);
//   wing.setCount(120);       // ハエの数（0 で無音）
//   wing.setPitchShift(2);    // 全体の音程を半音単位でシフト（角砂糖アイテム等）
//   wing.dispose();
//
// 設計の要点（詳細は draft/step1-羽音メモ.md）:
// - 1匹 = 1オシレーターにはしない。最大 maxVoices 本（既定24）の「声部」を、
//   ハエの数の対数に応じて 1本ずつ追加する（n=1→1本, n=8→8本, n=100→16本, n=1000→24本）。
//   人間の耳は数の「倍々」に反応するので、対数で層を足すと「増えるほど豊か」に聞こえやすい。
// - 声部は追加される順に音程の散らばり（slot offset）が広がる。最初は 1 つの音、
//   増えるにつれ低い羽音・高い羽音が混ざって厚みが出る（大きいハエほど羽ばたきが遅い、の見立て）。
// - 1声部が「多数のハエ」を代表するようになるほど、AMゆらぎ（羽ばたきの揺れ）を浅く、
//   ピッチの揺れ幅を広くする（=多数の個体が平均化されたざわめき）。
// - 数十匹以上では、合成ノイズ（風切り音）の層をうっすら足して「群れの空気感」を出す。
// - 音量は n の対数で緩やかに上げ、声部数で正規化 → コンプレッサー → リミッターで音割れを防ぐ。
//
// 拡張の入口（企画書 8章の検証項目）:
// - 案A(音階/和音): options.tuning に「slot番号 → 半音オフセット」の関数を渡すと、
//   声部の音程を音階に量子化できる（例: ペンタトニック）。TUNINGS.pentatonic を参照。
// - 案B(楽器が加わる): このモジュールの出力を楽器音と同じミックスバスに connect する。
//   楽器側は別モジュールにし、羽音側は setCount だけ担当する（責務を混ぜない）。
// - 案C(終幕のみクラシック): 羽音はこのまま。終幕時は fadeTo 相当として setCount を保ったまま
//   外側の GainNode で絞る（ハエ数の情報を失わないため）。

const DEFAULTS = {
  maxVoices: 24,          // 声部の上限。CPU と相談（sound-test.html で限界を測る）
  baseFreq: 196,          // 1匹目の羽ばたき基本周波数(Hz)。実際のイエバエはおよそ 150〜250Hz と言われる（未検証の一般値）
  maxLevel: 0.32,         // 群れ全体の最大音量（リミッター前）。静かなトーンのため控えめ
  tuning: null,           // 案A 用: (slot:number) => 半音オフセット。null なら自然な散らばり
};

// 案A の入口となる音程テーブル例（slot → 半音）
export const TUNINGS = {
  // ド・レ・ミ・ソ・ラ を上下に広げていく。濁りが少なく「和音のざわめき」になる想定（未聴）
  pentatonic(slot) {
    const scale = [0, 2, 4, 7, 9];
    const order = [0, -5, 7, 4, -8, 2, 12, -3, 9, -12, 14, 16, -10, 19, -1, 21, 24, -15, 5, 11, -7, 26, -17, 28];
    const s = order[slot % order.length];
    // order の値をスケールに丸める
    const oct = Math.floor(s / 12);
    const within = ((s % 12) + 12) % 12;
    let best = scale[0];
    for (const d of scale) if (Math.abs(d - within) < Math.abs(best - within)) best = d;
    return oct * 12 + best;
  },
};

// slot 番号ごとの「自然な」音程オフセット(半音)。0 番から外側へ交互に広がる。
// 決定的な疑似乱数で、毎回同じ群れの響きになるようにする（試聴比較しやすくするため）。
function naturalOffset(slot) {
  if (slot === 0) return 0;
  const rnd = pseudoRandom(slot * 9301 + 49297);
  const spread = 0.35 + Math.min(slot, 16) * 0.22;          // 外側の声部ほど広い（最大 約±3.9半音）
  const sign = slot % 2 === 0 ? 1 : -1;                     // 上下交互
  const lowBias = -0.4;                                     // やや低め寄り = 落ち着いた響き
  return sign * spread * (0.55 + 0.45 * rnd) + lowBias * (slot > 3 ? 1 : 0);
}

function pseudoRandom(seed) {
  const x = Math.sin(seed) * 43758.5453;
  return x - Math.floor(x);
}

// ハエの数 → 鳴らす声部数（対数カーブ）
function voicesFor(n, maxVoices) {
  if (n <= 0) return 0;
  // n=1000 でちょうど maxVoices に届く対数カーブ。
  // 既定24なら n=1:1, 8:8, 100:16, 1000:24（倍になるごとに約2.3本増える）
  const v = Math.round(1 + (maxVoices - 1) * Math.log2(n) / Math.log2(1000));
  return Math.max(1, Math.min(maxVoices, v, Math.ceil(n))); // ハエ数より多くは鳴らさない
}

// ハエの数 → 群れ全体の音量(0..1)。対数で緩やかに。
function levelFor(n) {
  if (n <= 0) return 0;
  const t = Math.min(1, Math.log10(n + 1) / Math.log10(1001)); // n=1:0.1, 10:0.35, 100:0.67, 1000:1
  return 0.35 + 0.65 * t;   // 1匹でも聞こえる最低限を確保
}

// ハエの数 → 風切りノイズ層の音量(0..1)。数十匹から立ち上がる。
function airFor(n) {
  if (n < 20) return 0;
  return Math.min(1, Math.log10(n / 20) / Math.log10(1000 / 20));
}

// 羽音の音色: 基音 + 倍音を 1/k^1.3 で減衰させ、2〜3倍音をやや持ち上げる（ブーン感）。
// のこぎり波そのままだと耳に痛いので、高次倍音を早めに落として「静かで美しい」側に寄せる。
function makeBuzzWave(ctx) {
  const N = 24;
  const real = new Float32Array(N + 1);
  const imag = new Float32Array(N + 1);
  for (let k = 1; k <= N; k++) {
    let a = 1 / Math.pow(k, 1.3);
    if (k === 2) a *= 1.25;
    if (k === 3) a *= 1.1;
    if (k > 10) a *= 0.5;
    imag[k] = a;
  }
  return ctx.createPeriodicWave(real, imag);
}

// 2秒の白色ノイズをコードで生成（外部素材なし）
function makeNoiseBuffer(ctx) {
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    d[i] = (seed / 0x7fffffff) * 2 - 1;
  }
  return buf;
}

export function createWingSound(audioCtx, options = {}) {
  const ctx = audioCtx;
  const opt = { ...DEFAULTS, ...options };
  const tuning = opt.tuning || naturalOffset;
  const wave = makeBuzzWave(ctx);
  const TC = 0.25; // 音量・音程変化の時定数(秒)。クリック音防止と「なめらかさ」

  // ---- 共通バス ----
  // voices → voiceBus → tone(lowpass) → level → comp → limiter → out
  const voiceBus = ctx.createGain();
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2400;   // 高域の耳障りな成分を削る
  tone.Q.value = 0.5;
  const level = ctx.createGain();
  level.gain.value = 0;

  const comp = ctx.createDynamicsCompressor();  // 層が重なったときの山を均す
  comp.threshold.value = -20;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.02;
  comp.release.value = 0.3;

  const limiter = ctx.createDynamicsCompressor(); // 最後の砦（クリップ防止）
  limiter.threshold.value = -4;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.1;

  const out = ctx.createGain();
  out.gain.value = 0.9;

  voiceBus.connect(tone);
  tone.connect(level);
  level.connect(comp);
  comp.connect(limiter);
  limiter.connect(out);

  // 全声部共通の音程シフト。ConstantSource を各オシレーターの detune に足し込む
  // （AudioParam は接続された入力を加算するため、1ノードで全体を動かせる）
  const pitch = ctx.createConstantSource();
  pitch.offset.value = 0;
  pitch.start();

  // ---- 風切りノイズ層（群れの空気感）----
  const noise = ctx.createBufferSource();
  noise.buffer = makeNoiseBuffer(ctx);
  noise.loop = true;
  const noiseBand = ctx.createBiquadFilter();
  noiseBand.type = 'bandpass';
  noiseBand.frequency.value = 420;
  noiseBand.Q.value = 0.8;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0;
  noise.connect(noiseBand);
  noiseBand.connect(noiseGain);
  noiseGain.connect(level);
  noise.start();

  // ---- 声部 ----
  const voices = [];   // 鳴っている（またはフェードアウト中の）声部。index = slot
  let count = 0;
  let activeTarget = 0;
  let disposed = false;

  function createVoice(slot) {
    const now = ctx.currentTime;
    const r1 = pseudoRandom(slot * 17.13 + 1);
    const r2 = pseudoRandom(slot * 31.7 + 2);
    const r3 = pseudoRandom(slot * 7.77 + 3);

    const osc = ctx.createOscillator();
    osc.setPeriodicWave(wave);
    osc.frequency.value = opt.baseFreq;
    osc.detune.value = targetSemis(slot) * 100;
    pitch.connect(osc.detune);

    // AMゆらぎ: 羽ばたきの不規則さ（3〜9Hz の速い揺れ）
    const flutter = ctx.createOscillator();
    flutter.frequency.value = 3 + r1 * 6;
    const flutterDepth = ctx.createGain();
    flutterDepth.gain.value = 0;

    // 漂い: ハエが近づいたり離れたりする遅い揺れ（0.07〜0.4Hz）。音量と音程の両方に効かせる
    const drift = ctx.createOscillator();
    drift.frequency.value = 0.07 + r2 * 0.33;
    const driftAmp = ctx.createGain();   // → 音量
    driftAmp.gain.value = 0.25;
    const driftPitch = ctx.createGain(); // → 音程(cents)。ドップラー的な揺れ
    driftPitch.gain.value = 0;

    const amp = ctx.createGain();        // 声部の音量（基準値 + LFO 加算）
    amp.gain.value = 0;
    const env = ctx.createGain();        // 出入りのフェード専用
    env.gain.value = 0;

    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.pan.value = slot === 0 ? 0 : (r3 * 2 - 1) * Math.min(0.8, 0.15 + slot * 0.05);

    flutter.connect(flutterDepth);
    flutterDepth.connect(amp.gain);
    drift.connect(driftAmp);
    driftAmp.connect(amp.gain);
    drift.connect(driftPitch);
    driftPitch.connect(osc.detune);

    osc.connect(amp);
    amp.connect(env);
    if (pan) { env.connect(pan); pan.connect(voiceBus); } else { env.connect(voiceBus); }

    osc.start(now);
    flutter.start(now);
    drift.start(now);
    env.gain.setTargetAtTime(1, now, 0.4); // ふわっと入る

    return { slot, osc, flutter, drift, flutterDepth, driftAmp, driftPitch, amp, env, pan, releasing: false, stopTimer: 0 };
  }

  function releaseVoice(v) {
    if (v.releasing) return;
    v.releasing = true;
    const now = ctx.currentTime;
    v.env.gain.cancelScheduledValues(now);
    v.env.gain.setTargetAtTime(0, now, 0.3);
    const stopAt = now + 1.5;
    v.osc.stop(stopAt); v.flutter.stop(stopAt); v.drift.stop(stopAt);
    v.osc.onended = () => {
      try { pitch.disconnect(v.osc.detune); } catch (_) { /* 既に切断済み */ }
      for (const node of [v.osc, v.flutter, v.drift, v.flutterDepth, v.driftAmp, v.driftPitch, v.amp, v.env, v.pan]) {
        if (node) try { node.disconnect(); } catch (_) { /* noop */ }
      }
    };
  }

  // 各声部の「何匹ぶんを代表しているか」に応じて揺れ方を更新
  function updateVoiceShapes() {
    const now = ctx.currentTime;
    const active = activeTarget;
    if (active === 0) return;
    const perVoice = count / active;                      // 1声部あたりのハエ数
    const crowd = Math.min(1, Math.log10(Math.max(1, perVoice)) / 1.5); // 0(1匹)〜1(約30匹以上)
    const norm = 1 / Math.sqrt(active);                   // 声部数で音量を正規化（無相関な音の加算は√Nで増える）
    for (let i = 0; i < active; i++) {
      const v = voices[i];
      if (!v || v.releasing) continue;
      // 基準音量。LFO の加算ぶん(最大 flutter+drift)を引いて負にならないよう余裕を取る
      const base = 0.55 * norm;
      v.amp.gain.setTargetAtTime(base, now, TC);
      // 1匹: 深い羽ばたきの揺れ / 多数: 平均化されて浅い揺れ
      v.flutterDepth.gain.setTargetAtTime(base * (0.45 - 0.3 * crowd), now, TC);
      v.driftAmp.gain.setTargetAtTime(base * 0.3, now, TC);
      // 1匹: 音程はほぼ一定 / 多数: ±(8〜30)cent のうねり（コーラス効果）
      // 和音に寄せている間はうねりを抑え、和音を濁らせない
      v.driftPitch.gain.setTargetAtTime((8 + 22 * crowd) * (harmony ? 0.35 : 1), now, TC);
    }
  }

  function setCount(n) {
    if (disposed) return;
    n = Math.max(0, Math.min(1e6, Math.floor(Number(n) || 0)));
    if (n === count) return; // 毎フレーム呼ばれても無駄なスケジュールを積まない
    count = n;
    const now = ctx.currentTime;
    const next = voicesFor(n, opt.maxVoices);

    // 追加: 新しい slot を作る（フェードアウト中のものがあれば作り直す）
    for (let i = 0; i < next; i++) {
      if (!voices[i] || voices[i].releasing) voices[i] = createVoice(i);
    }
    // 削除: 上の slot から静かに抜ける
    for (let i = next; i < voices.length; i++) {
      if (voices[i] && !voices[i].releasing) releaseVoice(voices[i]);
    }
    activeTarget = next;
    updateVoiceShapes();

    level.gain.setTargetAtTime(levelFor(n) * opt.maxLevel, now, TC);
    noiseGain.gain.setTargetAtTime(airFor(n) * 0.05, now, 0.8);
    // 数が増えるほど少しだけ明るく（ただし静けさを壊さない範囲）
    tone.frequency.setTargetAtTime(1800 + 1400 * Math.min(1, Math.log10(n + 1) / 3), now, 0.8);
  }

  function setPitchShift(semitones) {
    if (disposed) return;
    const s = Math.max(-24, Math.min(24, Number(semitones) || 0));
    pitch.offset.setTargetAtTime(s * 100, ctx.currentTime, 0.4); // ぬるっと音程が変わる
  }

  // ---- 和音への引き寄せ（Step 6: レコード／終幕の曲と羽音を重ねる） ----
  // pcs: baseFreq を 0 とした半音の音名集合（0〜11）。各声部は自然な音程から最も近い和音の音へ寄る。
  // null で自然な散らばりへ戻る。glide 秒かけて“ぬるっと”移るので、ざわめきが和音へ溶けていくように聞こえる。
  let harmony = null;
  function targetSemis(slot) {
    const s = tuning(slot);
    if (!harmony) return s;
    let best = Math.round(s), bestD = Infinity;
    for (let t = Math.floor(s) - 6; t <= Math.ceil(s) + 6; t++) {
      if (!harmony.has(((t % 12) + 12) % 12)) continue;
      const d = Math.abs(t - s);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }
  function setHarmony(pcs, glide = 1.2) {
    if (disposed) return;
    harmony = pcs && pcs.length ? new Set(pcs.map((p) => ((p % 12) + 12) % 12)) : null;
    const now = ctx.currentTime;
    for (const v of voices) {
      if (!v || v.releasing) continue;
      v.osc.detune.cancelScheduledValues(now);
      v.osc.detune.setTargetAtTime(targetSemis(v.slot) * 100, now, glide / 3);
    }
    updateVoiceShapes();
  }

  function connect(node) {
    out.connect(node);
    return node;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    const now = ctx.currentTime;
    out.gain.cancelScheduledValues(now);
    out.gain.setTargetAtTime(0, now, 0.05);
    for (const v of voices) if (v) releaseVoice(v);
    try { noise.stop(now + 0.5); pitch.stop(now + 1.6); } catch (_) { /* noop */ }
    setTimeout(() => {
      for (const node of [noise, noiseBand, noiseGain, voiceBus, tone, level, comp, limiter, out, pitch]) {
        try { node.disconnect(); } catch (_) { /* noop */ }
      }
    }, 1700);
  }

  // テストページ用の計測情報（API 外の補助。ゲーム本体は使わなくてよい）
  function stats() {
    const live = voices.filter((v) => v && !v.releasing).length;
    return {
      count,
      voices: live,
      maxVoices: opt.maxVoices,
      oscillators: live * 3 + 2,       // 声部ごと3本 + ノイズ + 音程シフト用
      compReduction: comp.reduction,   // dB（負の値ほど強く圧縮）
      limiterReduction: limiter.reduction,
    };
  }

  return { setCount, setPitchShift, setHarmony, connect, dispose, stats };
}
