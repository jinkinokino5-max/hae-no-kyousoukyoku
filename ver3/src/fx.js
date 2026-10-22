// 食べ物・文化物が引き起こす「音」のアクションと、終幕の曲。すべて Web Audio で合成する（外部素材なし）。
import { SONGS, parseMelody, parseChords } from './songs.js';

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
// 針を落とす → パチパチ音 → こもった音がゆっくり開いて曲が立ち上がる。曲（songs.js の1曲）はループする。
// onChord(pcs) で、いま鳴っている和音（G=0 とした半音の音名）を知らせる。羽音の基本音 196Hz が G なので。
// onNote(midi, 時刻, 長さ) で旋律の各音を先回りして知らせる（羽音が旋律を歌うため）。
// loop=false なら1回だけ流して onEnd を呼ぶ。vinyl=false なら針の音と蓄音機風の立ち上がりを省く。
export function startRecordMusic(ctx, dest, { onChord, onNote, onEnd, song = SONGS[SONGS.length - 1], loop = true, vinyl = true } = {}) {
  const out = ctx.createGain();
  out.gain.value = 0;
  const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = vinyl ? 350 : 4200; tone.Q.value = 0.5;
  out.connect(tone);
  tone.connect(makeRoom(ctx, dest, 0.4));
  const now = ctx.currentTime;
  out.gain.setTargetAtTime(0.55, now + (vinyl ? 1.2 : 0), vinyl ? 1.5 : 0.3);
  if (vinyl) tone.frequency.setTargetAtTime(4200, now + 2.0, 3.0); // 古い蓄音機からだんだん近くで鳴っているように
  // 旋律だけの音量（ハエが増えて羽音が旋律を引き継ぐと、楽器の旋律を少し控える。伴奏はそのまま）
  const lead = ctx.createGain(); lead.gain.value = 1; lead.connect(out);

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
  if (vinyl) {
    cg.gain.setTargetAtTime(0.18, now, 0.05);   // 針を落とした瞬間に立ち上がり
    cg.gain.setTargetAtTime(0.07, now + 3, 2);  // 曲が始まると後ろに下がる
  }
  crackle.connect(cf); cf.connect(cg); cg.connect(dest);
  crackle.start(now);

  const note = makePlayer(ctx, out);
  const leadNote = makePlayer(ctx, lead);
  const melody = parseMelody(song.melody);
  const bars = parseChords(song.chords);
  const beat = song.beat, meter = song.meter, pickup = song.pickup || 0;
  const loopLen = bars.length * meter * beat;
  const vol = song.vol ?? 1;
  const timers = [];
  let alive = true, t0 = now + (vinyl ? 3.0 : 0.3);

  // 伴奏の刻み方（曲ごと）。part: 小節を和音の数で割った1区間
  function accompany(c, st, len) {
    const k = len / beat; // この区間の拍数
    const L = (m, t, d, g) => note(m, t, d, g * vol);
    switch (song.arp) {
      case 'waltz': // 1拍目に低音、残りの拍に和音を薄く
        L(c.bass, st, len * 1.2, 0.10);
        for (let i = 1; i < k; i++) { L(c.tones[1], st + i * beat, beat * 1.5, 0.032); L(c.tones[2], st + i * beat, beat * 1.5, 0.028); }
        break;
      case 'bass': // 1拍目に低音、各拍で構成音を1つずつ
        L(c.bass, st, len * 1.1, 0.09);
        for (let i = 1; i < k; i++) L(c.tones[i % c.tones.length], st + i * beat, beat * 1.4, 0.035);
        break;
      case 'flow': // 8分音符で低音→構成音を流す（カノン）
        L(c.bass, st, len * 1.2, 0.09);
        for (let i = 0; i < k * 2; i++) L(c.tones[i % c.tones.length] + (i >= c.tones.length ? 12 : 0), st + i * beat / 2, beat, 0.028);
        break;
      case 'drone': // 持続する低音: 根音と5度を小節いっぱい伸ばす（辻音楽師の手回しオルガン、古城の保続低音、怒りの日）
        L(c.bass, st, len * 1.25, 0.10); L(c.bass + 7, st, len * 1.25, 0.07); L(c.bass + 12, st, len * 1.1, 0.03);
        break;
      case 'none': // 低音の分散和音だけ（エリーゼ: 根音・5度・オクターブ）
        L(c.bass, st, beat * 3, 0.07); L(c.bass + 7, st + beat, beat * 3, 0.05); L(c.bass + 12, st + 2 * beat, beat * 3, 0.05);
        break;
    }
  }

  function schedule() {
    if (!alive) return;
    let t = t0;
    for (const [m, b] of melody) {
      if (m !== null) { leadNote(m, t, b * beat * 1.6 + 0.15, 0.13 * vol); if (onNote) onNote(m, t, b * beat); }
      t += b * beat;
    }
    bars.forEach((parts, i) => {
      const len = meter * beat / parts.length;
      parts.forEach((c, j) => {
        const st = t0 + pickup * beat + i * meter * beat + j * len;
        accompany(c, st, len);
        scheduleChord(ctx, st, c.tones.map((m) => m - 55), onChord, timers);
      });
    });
    t0 += loopLen;
    if (!loop) { // 1回だけ: 曲の終わりに知らせる
      if (onEnd) timers.push(setTimeout(() => { alive = false; onEnd(); }, (t0 - ctx.currentTime + 1.0) * 1000));
      return;
    }
    // 次の周回を、今回が終わる少し前に予約する（ループ）
    timers.push(setTimeout(schedule, Math.max(500, (t0 - ctx.currentTime - 2) * 1000)));
  }
  schedule();

  return {
    setLead(v) { lead.gain.setTargetAtTime(v, ctx.currentTime, 0.8); },
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
export function startFarewell(ctx, dest, { onChord, onNote, onEnd } = {}) {
  const out = ctx.createGain();
  out.gain.value = 0.6;
  out.connect(makeRoom(ctx, dest, 0.55));
  const note = makePlayer(ctx, out);
  const lead = ctx.createGain(); lead.gain.value = 1; lead.connect(out);
  const leadNote = makePlayer(ctx, lead);

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
    leadNote(m, t, dur * 1.5, 0.15, 0.04);
    if (onNote) onNote(m, t, dur);
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
    setLead(v) { lead.gain.setTargetAtTime(v, ctx.currentTime, 0.8); },
    stop() { timers.forEach(clearTimeout); out.gain.setTargetAtTime(0, ctx.currentTime, 0.5); },
  };
}

// ---- 新アイテムの音 ----

// オルゴール: きらきら星（フランス民謡、パブリックドメイン）を高い音で一度だけ。少しずつゆっくりになって止まる（ぜんまいが切れる）
export function playMusicBox(ctx, dest) {
  const out = ctx.createGain(); out.gain.value = 0.5;
  out.connect(makeRoom(ctx, dest, 0.5));
  const notes = parseMelody(
    'C6:1 C6:1 G6:1 G6:1 A6:1 A6:1 G6:2 F6:1 F6:1 E6:1 E6:1 D6:1 D6:1 C6:2 ' +
    'G6:1 G6:1 F6:1 F6:1 E6:1 E6:1 D6:2 G6:1 G6:1 F6:1 F6:1 E6:1 E6:1 D6:2');
  let t = ctx.currentTime + 0.2, beat = 0.32;
  for (const [m] of notes) {
    // オルゴールの音色: 高いサイン波＋金属的な倍音、すぐ減衰
    for (const [mul, amp] of [[1, 0.09], [4.2, 0.02]]) {
      const o = ctx.createOscillator(); o.frequency.value = hz(m) * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 1.5);
    }
    t += beat;
    beat *= 1.012; // ぜんまいがゆるんでいく
  }
}

// 置き時計: チク・タクを鳴らし続ける（静かに）
export function startClock(ctx, dest) {
  const out = ctx.createGain(); out.gain.value = 0.22; out.connect(dest);
  const click = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.03), ctx.sampleRate);
  const d = click.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.003));
  let alive = true, n = 0, next = ctx.currentTime + 0.1;
  const bp = [ctx.createBiquadFilter(), ctx.createBiquadFilter()];
  bp[0].type = bp[1].type = 'bandpass'; bp[0].frequency.value = 3200; bp[1].frequency.value = 2300;
  bp[0].Q.value = bp[1].Q.value = 8;
  bp.forEach((f) => f.connect(out));
  function tick() {
    if (!alive) return;
    while (next < ctx.currentTime + 1.2) {
      const s = ctx.createBufferSource(); s.buffer = click;
      s.connect(bp[n++ & 1]); s.start(next);
      next += 0.5;
    }
    setTimeout(tick, 500);
  }
  tick();
  return { stop() { alive = false; out.gain.setTargetAtTime(0, ctx.currentTime, 0.3); } };
}

// 風鈴: 数秒〜十数秒おきに、ちりん（金属の不協和な倍音をもつ高い音）
export function startWindchime(ctx, dest) {
  const out = ctx.createGain(); out.gain.value = 0.5;
  out.connect(makeRoom(ctx, dest, 0.6));
  let alive = true;
  const base = [88, 91, 93, 95]; // E6 G6 A6 B6
  function ring() {
    if (!alive) return;
    const t = ctx.currentTime;
    const hits = 1 + ((Math.random() * 3) | 0);
    for (let h = 0; h < hits; h++) {
      const m = base[(Math.random() * base.length) | 0], st = t + h * (0.08 + Math.random() * 0.15);
      for (const [mul, amp, dec] of [[1, 0.06, 2.6], [2.76, 0.025, 1.2], [5.4, 0.012, 0.6]]) {
        const o = ctx.createOscillator(); o.frequency.value = hz(m) * mul;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(amp, st + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, st + dec);
        o.connect(g); g.connect(out); o.start(st); o.stop(st + dec + 0.1);
      }
    }
    setTimeout(ring, 3000 + Math.random() * 9000);
  }
  setTimeout(ring, 300);
  return { stop() { alive = false; } };
}

// 楽譜: 羽音のざわめきの上に、やわらかい笛が1つ加わる（案B の試作）。
// getChord() が返す和音（G=0 の音名）から音を選び、間をあけてゆっくり歌う。和音がなければペンタトニック
export function startScoreFlute(ctx, dest, getChord) {
  const out = ctx.createGain(); out.gain.value = 0.5;
  out.connect(makeRoom(ctx, dest, 0.5));
  let alive = true, prev = 67 + 12;
  function phrase() {
    if (!alive) return;
    const pcs = getChord() || [0, 2, 4, 7, 9];
    let t = ctx.currentTime + 0.1;
    const len = 3 + ((Math.random() * 4) | 0);
    for (let i = 0; i < len; i++) {
      // 前の音から近い和音の音へ（なめらかな旋律にする）
      const cands = [];
      for (let m = 72; m <= 88; m++) if (pcs.includes(((m - 55) % 12 + 12) % 12)) cands.push(m);
      cands.sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev));
      const m = cands[Math.min(cands.length - 1, (Math.random() * 3) | 0)];
      prev = m;
      const dur = [0.6, 0.9, 1.2][(Math.random() * 3) | 0];
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz(m);
      const vib = ctx.createOscillator(); vib.frequency.value = 4.8;
      const va = ctx.createGain(); va.gain.value = hz(m) * 0.006;
      vib.connect(va); va.connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 0.12);
      g.gain.setTargetAtTime(0, t + dur * 0.8, 0.15);
      o.connect(g); g.connect(out);
      o.start(t); vib.start(t); o.stop(t + dur + 0.8); vib.stop(t + dur + 0.8);
      t += dur;
    }
    setTimeout(phrase, (t - ctx.currentTime + 2 + Math.random() * 4) * 1000);
  }
  setTimeout(phrase, 800);
  return { stop() { alive = false; } };
}

// 音叉: 純音（サイン波）を一度「キーン」と鳴らし、約4秒かけて減衰する。hzOut は音の高さ（Hz）。
export function playTuningFork(ctx, dest, hzOut = 196 * 2) {
  const out = ctx.createGain(); out.gain.value = 0.5;
  out.connect(makeRoom(ctx, dest, 0.25));
  const t = ctx.currentTime + 0.02, dur = 4;
  const oscs = [];
  // 基音のほかに、叩いた直後だけ聞こえる高い倍音（約6.3倍）を、ごく小さく
  for (const [mul, amp, d] of [[1, 0.22, dur], [6.27, 0.012, 0.35]]) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hzOut * mul;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.1);
    oscs.push(o);
  }
  return {
    stop(fade = 0.15) {
      out.gain.cancelScheduledValues(ctx.currentTime);
      out.gain.setTargetAtTime(0, ctx.currentTime, fade);
      setTimeout(() => { for (const o of oscs) { try { o.stop(); } catch {} } }, fade * 8000);
    },
  };
}

// メトロノーム: 66拍/分の「カッ」という木のクリックを鳴らし続ける（startClock と同じ先読み予約の作り）
export function startMetronome(ctx, dest, bpm = 66) {
  const out = ctx.createGain(); out.gain.value = 0.5; out.connect(dest);
  const interval = 60 / bpm;
  // 短い木片のクリック: 減衰の速いノイズ＋低めの共鳴音
  const len = Math.floor(ctx.sampleRate * 0.06);
  const click = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = click.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const e = Math.exp(-i / (ctx.sampleRate * 0.006));
    d[i] = ((Math.random() * 2 - 1) * 0.7 + Math.sin(2 * Math.PI * 1100 * i / ctx.sampleRate) * 0.6) * e;
  }
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.2;
  bp.connect(out);
  let alive = true, next = ctx.currentTime + 0.1;
  function tick() {
    if (!alive) return;
    while (next < ctx.currentTime + 1.2) {
      const s = ctx.createBufferSource(); s.buffer = click;
      s.connect(bp); s.start(next);
      next += interval;
    }
    setTimeout(tick, 400);
  }
  tick();
  return { stop() { alive = false; out.gain.setTargetAtTime(0, ctx.currentTime, 0.1); } };
}

// おりん（仏具の鈴）: 「チーン」と一度鳴り、金属的な非整数倍音が約8秒かけて消えていく
export function playRin(ctx, dest) {
  const out = ctx.createGain(); out.gain.value = 0.5;
  out.connect(makeRoom(ctx, dest, 0.45));
  const t = ctx.currentTime + 0.02;
  const base = hz(79); // G5 付近
  const oscs = [];
  // [倍率, 音量, 減衰秒]。高い倍音ほど早く消える
  for (const [mul, amp, dec] of [[1, 0.13, 8], [2.76, 0.07, 5.5], [5.4, 0.035, 3], [8.9, 0.015, 1.4]]) {
    // 少しだけずらした2本で、うなり（ワンワンという揺れ）を作る
    for (const det of [0, 1.6]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = base * mul + (det ? det * (mul < 3 ? 1 : 2) : 0);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp * (det ? 0.6 : 1), t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + dec + 0.1);
      oscs.push(o);
    }
  }
  return {
    stop(fade = 0.3) {
      out.gain.cancelScheduledValues(ctx.currentTime);
      out.gain.setTargetAtTime(0, ctx.currentTime, fade);
      setTimeout(() => { for (const o of oscs) { try { o.stop(); } catch {} } }, fade * 8000);
    },
  };
}
