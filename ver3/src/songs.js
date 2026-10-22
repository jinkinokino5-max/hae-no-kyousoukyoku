// レコードの曲（8枚）と、ドクロのアイテム用の「怒りの日」。すべて著作権の切れた作品、または自作の短い旋律。
// 書式:
//   melody: "音名オクターブ:拍" を空白区切り（r は休符）。例 "F#5:1 A5:0.5 r:1"
//   chords: 小節ごとの和音名。1小節に2つ以上は "G/D" のように / で区切る（均等に分ける）
//   beat: 1拍の秒数 / meter: 1小節の拍数 / arp: 伴奏の刻み方（waltz / bass / flow / none / drone）
//   pickup: 弱起の拍数（melody の先頭。最終小節はその分だけ短くして、ループのつなぎ目で重ねる）
//   melody の拍数の合計 = 小節数 × meter（ループの長さと合わせる）
// 出典と信頼度:
//   1〜6 と「怒りの日」の旋律は、flutetunes.com で配布されているMIDIから音名・長さを書き起こしたもの（音符の事実だけを使い、MIDIそのものは使っていない）。
//   原曲の楽譜との照合はしていない。ループできるよう、拍の長さ・休符・一部の音価は整えてあり、
//   伴奏の和音は旋律と低音から自分で付けた簡易なもの（原曲の和声とは異なる）。
//   7 はサティ作品の耳からの書き起こし（未照合）、8 は自作。
// 作曲家の没年（すべて没後70年以上）: ダウランド1626 / パーセル1695 / シューベルト1828 / グリーグ1907 / ムソルグスキー1881 / グルック1787 / サティ1925

export const SONGS = [
  {
    title: '流れよ、わが涙（ダウランド）',
    beat: 0.6, meter: 4, arp: 'bass', vol: 0.85,
    // ダウランド（没1626）。イ短調・約38秒・16小節。MIDIの旋律冒頭の1節を使用（E4〜C5、移調なし）。
    melody:
      'A4:3 G4:0.5 F4:0.5 E4:2 C5:4 B4:1 A4:1 G#4:4 A4:2 E4:3 E4:1 G4:1 G4:1 F4:2 D4:2 E4:3 B4:1 C5:2 A4:2 ' +
      'B4:2 G#4:2 A4:1 C5:1.5 B4:0.5 A4:1 G#4:2 C5:2 B4:1 A4:1 A4:3 G#4:0.5 F#4:0.5 G#4:2 A4:7 r:1',
    chords: 'Am C F E Am C Dm E Am E Am E Am E Am Am',
  },
  {
    title: 'ダイドーの嘆き（パーセル）',
    beat: 0.75, meter: 6, arp: 'bass', vol: 0.85,
    pickup: 4,
    // パーセル（没1695）。ト短調・約45秒・10小節。ト短調の下降半音階の低音（5小節）を2周、旋律は最初の1節（F#4〜D#5、移調なし）。4拍の弱起。
    melody:
      'G4:2 A4:2 A#4:2 A#4:2 A4:2 B4:2 C5:1.5 A#4:0.5 A4:1.5 G4:0.5 F#4:1.5 G4:0.5 F#4:4 D5:1.5 D#5:0.5 ' +
      'D5:1.5 C5:0.5 A#4:2 A4:2 A#4:4 D#5:2 D#5:1 A4:1 A4:2 D5:2 D5:0.5 G4:0.5 G4:1 A4:2 G4:2 A4:4 r:8',
    chords: 'Gm/D F/Edim Eb/D Bb/Cm D7/Gm Gm/D F/Edim Eb/D Bb/Cm D7/Gm',
  },
  {
    title: '辻音楽師（シューベルト）',
    beat: 0.8, meter: 3, arp: 'drone', vol: 0.9,
    // シューベルト（没1828）。イ短調・約36秒・15小節。手回しオルガンの旋律3種を、間の休みを1小節に縮めて並べた（E4〜E5、移調なし）。持続低音 A-E の上で鳴る。
    melody:
      'A4:0.5 E4:0.5 A4:0.5 B4:0.5 C5:0.5 A4:0.5 E4:0.5 A4:0.5 G#4:0.5 B4:0.5 E4:1 r:3 A4:0.5 E4:0.5 A4:0.5 ' +
      'B4:0.5 C5:0.5 A4:0.5 E4:0.5 A4:0.5 G#4:0.5 B4:0.5 E4:1 r:3 A4:0.5 E5:0.5 D5:0.5 C5:0.5 B4:0.5 E4:0.5 ' +
      'A4:0.75 C5:0.25 B4:0.5 E4:0.5 B4:1 r:3 A4:0.5 E5:0.5 D5:0.5 C5:0.5 B4:0.5 E4:0.5 A4:0.75 C5:0.25 ' +
      'B4:0.5 E4:0.5 B4:1 r:3 A4:0.5 B4:0.5 C5:0.5 D5:0.5 E5:0.75 D5:0.25 C5:0.5 B4:0.5 A4:0.5 E4:0.5 A4:1 ' +
      'r:3',
    chords: 'Am Am Am Am Am Am Am E Am Am E Am Am Am Am',
  },
  {
    title: 'オーセの死（グリーグ）',
    beat: 0.65, meter: 4, arp: 'bass', vol: 0.85,
    // グリーグ（没1907）。ロ短調・約42秒・16小節。冒頭の8小節と、その5度上で始まる後半8小節（1オクターブ下げて音域を収めた）。C#4〜E5。
    melody:
      'F#4:1 B4:1 C#5:2 F#4:1 B4:1 C#5:2 D5:1 C#5:1 B4:1 C#5:0.5 D5:0.5 E5:1 D5:1 C#5:1.5 r:0.5 F#4:1 B4:1 ' +
      'C#5:2 F#4:1 B4:1 C#5:2 E5:1 D5:1 C#5:1 D5:0.5 E5:0.5 A#4:1 B4:2 r:1 C#4:1 F#4:1 G#4:2 C#4:1 F#4:1 ' +
      'G#4:2 A4:1 G#4:1 F#4:1 G#4:0.5 A4:0.5 B4:1 A4:1 G#4:1.5 r:0.5 C#4:1 F#4:1 G#4:2 C#4:1 F#4:1 G#4:2 ' +
      'B4:1 A4:1 G#4:1 A4:0.5 B4:0.5 F4:1 F#4:2.5 r:0.5',
    chords: 'Bm F# Bm A Bm F# A F# F#m C# F#m E F#m C# E C#',
  },
  {
    title: '古城（ムソルグスキー）',
    beat: 0.77, meter: 3, arp: 'drone', vol: 0.9,
    pickup: 0.5,
    // ムソルグスキー（没1881）。原曲は嬰ト短調（6/8）。ト短調へ13半音下げて移調（G3〜A#4に収める）。約39秒・17小節。主題2節。0.5拍の弱起。
    melody:
      'D4:0.5 G4:3 A#4:0.5 A4:0.5 G4:0.5 D#4:0.5 G4:1 G4:1 D4:0.5 F4:1.5 D#4:0.5 D4:0.5 D#4:0.5 D4:0.5 ' +
      'C4:0.5 D4:0.5 G3:3 A3:0.5 A#3:0.5 C4:0.5 A#3:0.5 A3:0.5 A#3:0.5 A#3:1.5 G3:1.5 r:3 D#4:1 D#4:0.5 ' +
      'F4:0.75 D#4:0.25 D4:0.5 D#4:1 D#4:0.5 F4:0.75 D#4:0.25 D4:0.5 D#4:1.5 C#4:1.5 G#4:2 G4:0.5 F4:0.5 ' +
      'D#4:1.5 G4:1.5 F4:1.5 D#4:1.5 D4:1.5 C4:1 A#3:0.5 A3:0.75 A#3:0.25 A3:0.5 C4:0.5 A#3:0.5 A3:0.5 ' +
      'A#3:1.5 G3:1',
    chords: 'Gm Gm Gm Eb Gm F Gm Gm Eb Eb Eb Ab Eb Cm Gm F Gm',
  },
  {
    title: '精霊の踊り（グルック）',
    beat: 0.8, meter: 4, arp: 'flow', vol: 0.8,
    pickup: 3,
    // グルック（没1787）。ヘ長調・約38秒・12小節。冒頭の旋律6小節を2回。1オクターブ下げて移調（A3〜A#4）。3拍の弱起。
    melody:
      'C4:1 A3:0.5 A#3:0.5 C4:0.5 F4:0.5 F4:4 A#4:0.5 A4:0.5 G4:0.5 A4:0.5 G4:1 F4:1 E4:1 F4:4 A#4:1 A4:1 ' +
      'G4:0.5 A#4:0.5 A4:1 G4:0.5 F4:0.5 F4:3 C4:1 A3:0.5 A#3:0.5 C4:0.5 F4:0.5 F4:4 A#4:0.5 A4:0.5 G4:0.5 ' +
      'A4:0.5 G4:1 F4:1 E4:1 F4:4 A#4:1 A4:1 G4:0.5 A#4:0.5 A4:1 G4:0.5 F4:0.5 F4:3',
    chords: 'F Bb C7 Gm F C7 F Bb C7 Gm F C7',
  },
  {
    title: 'ジムノペディ第1番（サティ）',
    beat: 0.82, meter: 3, arp: 'waltz', vol: 0.9,
    melody:
      'r:3 r:3 r:3 r:3 ' +
      'r:1 F#5:1 A5:1 G5:1 F#5:1 C#5:1 B4:1 C#5:1 D5:1 A4:3 F#4:3 F#4:3 F#4:3 F#4:3 ' +
      'r:1 F#5:1 A5:1 G5:1 F#5:1 C#5:1 B4:1 C#5:1 D5:1 A4:3 C#5:3 F#5:3 E5:3 E5:3',
    chords:
      'Gmaj7 Dmaj7 Gmaj7 Dmaj7 ' +
      'Gmaj7 Dmaj7 Gmaj7 Dmaj7 Gmaj7 Dmaj7 Gmaj7 Dmaj7 ' +
      'Gmaj7 Dmaj7 Gmaj7 Dmaj7 Bm F#m Em Em',
  },
  {
    title: '机の上のワルツ（オリジナル）',
    beat: 0.78, meter: 3, arp: 'waltz', vol: 0.9,
    melody:
      'D5:1.5 C5:0.5 A#4:1 A4:3 A#4:1.5 A4:0.5 G4:1 F4:3 ' +
      'G4:1.5 A4:0.5 A#4:1 C5:1 A#4:1 A4:1 G4:2 F4:1 D4:3',
    chords: 'Dm Dm Bb A Bb Gm F Dm',
  },
];

// ドクロのアイテム用。グレゴリオ聖歌「怒りの日」（Dies irae）の冒頭の一節（没年のある作曲家はいない中世の聖歌）。
// Cantus Database の Volpiano 1--f-e--f-d--f-e--cd-d は、F E F D F E C D D に当たる（D を主音とするドリア旋法）。
// 約11秒。loop は呼び出し側が false にする。
export const DIES_IRAE = {
  title: '怒りの日（グレゴリオ聖歌）',
  beat: 0.9, meter: 3, arp: 'drone', vol: 0.9,
  melody: 'F4:1 E4:1 F4:1 D4:2 F4:1 E4:1 C4:1 D4:1 D4:3',
  chords: 'Dm Dm C Dm',
};

// ---- 解析 ----
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteToMidi(s) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(s);
  if (!m) throw new Error(`bad note: ${s}`);
  return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
export function parseMelody(str) {
  return str.trim().split(/\s+/).map((tok) => {
    const [n, b] = tok.split(':');
    return [n === 'r' ? null : noteToMidi(n), +b];
  });
}
// 和音名 → { bass: MIDI, tones: [MIDI...] }。構成音は G3〜F#4 付近に寄せる（羽音 196Hz=G3 と同じ高さ）
const QUAL = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], dim: [0, 3, 6], sus4: [0, 5, 7] };
export function parseChord(name) {
  const m = /^([A-G])(#|b)?(maj7|m7|dim|sus4|m|7)?$/.exec(name);
  if (!m) throw new Error(`bad chord: ${name}`);
  const root = (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const tones = QUAL[m[3] || ''].map((iv) => {
    const pc = (root + iv) % 12;
    return 55 + ((pc - 7 + 12) % 12); // 55(G3)〜66(F#4)
  });
  return { bass: 36 + root + (root < 4 ? 12 : 0), tones }; // 低音は E2〜D#3
}
export function parseChords(str) {
  return str.trim().split(/\s+/).map((bar) => bar.split('/').map(parseChord));
}
