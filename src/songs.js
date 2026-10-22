// レコードの曲（8枚）。すべて著作権の切れた作品・伝承曲、または自作の短い旋律。
// 書式:
//   melody: "音名オクターブ:拍" を空白区切り（r は休符）。例 "F#5:1 A5:0.5 r:1"
//   chords: 小節ごとの和音名。1小節に2つ以上は "G/D" のように / で区切る（均等に分ける）
//   beat: 1拍の秒数 / meter: 1小節の拍数 / arp: 伴奏の刻み方
// 旋律は耳で覚えている形からの書き起こしで、原曲と細部が違う箇所がありうる（未照合）。

export const SONGS = [
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
    title: 'エリーゼのために（ベートーヴェン）',
    beat: 0.19, meter: 6, arp: 'none', vol: 0.85,  // 16分音符を1拍として扱う（3/8拍子）
    melody:
      'E5:1 D#5:1 E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 ' +
      'A4:2 r:1 C4:1 E4:1 A4:1 B4:2 r:1 E4:1 G#4:1 B4:1 C5:2 r:1 E4:1 E5:1 D#5:1 ' +
      'E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 A4:2 r:1 C4:1 E4:1 A4:1 B4:2 r:1 E4:1 C5:1 B4:1 A4:4',
    // 先頭の2音は弱起。和音は1小節目（E5 D#5 E5 B4 D5 C5）から
    pickup: 2,
    chords: 'Am Am E Am Am Am E Am',
  },
  {
    title: 'グリーンスリーブス（イングランド民謡）',
    beat: 0.42, meter: 3, arp: 'waltz', vol: 0.9,
    pickup: 1,
    melody:
      'A4:1 ' +
      'C5:2 D5:1 E5:1.5 F#5:0.5 E5:1 D5:2 B4:1 G4:1.5 A4:0.5 B4:1 C5:2 A4:1 A4:1.5 G#4:0.5 A4:1 B4:2 G#4:1 E4:2 A4:1 ' +
      'C5:2 D5:1 E5:1.5 F#5:0.5 E5:1 D5:2 B4:1 G4:1.5 A4:0.5 B4:1 C5:1.5 B4:0.5 A4:1 G#4:1.5 F#4:0.5 G#4:1 A4:3 A4:3 ' +
      'G5:3 G5:1.5 F#5:0.5 E5:1 D5:2 B4:1 G4:1.5 A4:0.5 B4:1 C5:2 A4:1 A4:1.5 G#4:0.5 A4:1 B4:2 G#4:1 E4:3 ' +
      'G5:3 G5:1.5 F#5:0.5 E5:1 D5:2 B4:1 G4:1.5 A4:0.5 B4:1 C5:1.5 B4:0.5 A4:1 G#4:1.5 F#4:0.5 G#4:1 A4:3 A4:2',
    chords:
      'Am C G Em Am Am E E Am C G Em Am E Am Am ' +
      'C C G Em Am Am E E C C G Em Am E Am Am',
  },
  {
    title: 'ブラームスの子守歌',
    beat: 0.6, meter: 3, arp: 'waltz', vol: 0.9,
    melody:
      'C5:2 A4:0.5 A4:0.5 C5:2 A4:0.5 C5:0.5 F5:1 E5:1.5 D5:0.5 D5:1 C5:1 G4:0.5 A4:0.5 ' +
      'A#4:1 G4:1 G4:0.5 A4:0.5 A#4:2 G4:0.5 A#4:0.5 E5:0.5 D5:0.5 C5:1 E5:1 F5:2 F4:0.5 F4:0.5 ' +
      'F5:2 D5:0.5 A#4:0.5 C5:2 A4:0.5 F4:0.5 A#4:1 C5:1 D5:1 C5:2 F4:0.5 F4:0.5 ' +
      'F5:2 D5:0.5 A#4:0.5 C5:2 A4:0.5 F4:0.5 A#4:1 A4:1 G4:1 F4:2 A4:0.5 A4:0.5',
    chords: 'F F C7 F C7 C7 C7 F Bb F C7 F Bb F C7 F',
  },
  {
    title: 'メヌエット ト長調（ペツォールト）',
    beat: 0.5, meter: 3, arp: 'bass', vol: 0.85,
    melody:
      'D5:1 G4:0.5 A4:0.5 B4:0.5 C5:0.5 D5:1 G4:1 G4:1 E5:1 C5:0.5 D5:0.5 E5:0.5 F#5:0.5 G5:1 G4:1 G4:1 ' +
      'C5:1 D5:0.5 C5:0.5 B4:0.5 A4:0.5 B4:1 C5:0.5 B4:0.5 A4:0.5 G4:0.5 F#4:1 G4:0.5 A4:0.5 B4:0.5 G4:0.5 A4:3 ' +
      'D5:1 G4:0.5 A4:0.5 B4:0.5 C5:0.5 D5:1 G4:1 G4:1 E5:1 C5:0.5 D5:0.5 E5:0.5 F#5:0.5 G5:1 G4:1 G4:1 ' +
      'C5:1 D5:0.5 C5:0.5 B4:0.5 A4:0.5 B4:1 C5:0.5 B4:0.5 A4:0.5 G4:0.5 A4:1 B4:0.5 A4:0.5 G4:0.5 F#4:0.5 G4:3',
    chords: 'G G C G C G D D G G C G C G D G',
  },
  {
    title: '歓喜の歌（ベートーヴェン）',
    beat: 0.55, meter: 4, arp: 'bass', vol: 0.85,
    melody:
      'F#5:1 F#5:1 G5:1 A5:1 A5:1 G5:1 F#5:1 E5:1 D5:1 D5:1 E5:1 F#5:1 F#5:1.5 E5:0.5 E5:2 ' +
      'F#5:1 F#5:1 G5:1 A5:1 A5:1 G5:1 F#5:1 E5:1 D5:1 D5:1 E5:1 F#5:1 E5:1.5 D5:0.5 D5:2 ' +
      'E5:1 E5:1 F#5:1 D5:1 E5:1 F#5:0.5 G5:0.5 F#5:1 D5:1 E5:1 F#5:0.5 G5:0.5 F#5:1 E5:1 D5:1 E5:1 A4:2 ' +
      'F#5:1 F#5:1 G5:1 A5:1 A5:1 G5:1 F#5:1 E5:1 D5:1 D5:1 E5:1 F#5:1 E5:1.5 D5:0.5 D5:2',
    chords: 'D A D A D A D A/D A D A D/A D A D A/D',
  },
  {
    title: 'カノン（パッヘルベル）',
    beat: 0.62, meter: 4, arp: 'flow', vol: 0.85,
    melody:
      'F#5:2 E5:2 D5:2 C#5:2 B4:2 A4:2 B4:2 C#5:2 ' +
      'D5:2 C#5:2 B4:2 A4:2 G4:2 F#4:2 G4:2 E4:2 ' +
      'D5:1 F#5:1 A5:1 G5:1 F#5:1 D5:1 F#5:1 E5:1 D5:1 B4:1 D5:1 A5:1 G5:1 B5:1 A5:1 G5:1',
    chords: 'D/A Bm/F#m G/D G/A D/A Bm/F#m G/D G/A D/A Bm/F#m G/D G/A',
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
const QUAL = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10] };
export function parseChord(name) {
  const m = /^([A-G])(#|b)?(maj7|m7|m|7)?$/.exec(name);
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
