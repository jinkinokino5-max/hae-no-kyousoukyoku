// 音楽版: モノごとの曲（食べると流れる。1回だけ再生）。書式は songs.js と同じ。
// すべて著作権の切れた有名曲・童謡・伝承曲。耳で覚えている形からの書き起こしで、原曲と細部が違う箇所がありうる（未照合）。
// レコードは従来どおり songs.js の SONGS（ラベルの色ごと）を使う。
import { SONGS } from './songs.js';

export const ITEM_SONGS = {
  // ---- 食べ物 ----
  banana: {
    title: '天国と地獄（オッフェンバック）',
    beat: 0.3, meter: 2, arp: 'bass', vol: 0.85,
    melody:
      'C5:2 D5:0.5 F5:0.5 E5:0.5 D5:0.5 G5:1 G5:1 G5:0.5 A5:0.5 E5:0.5 F5:0.5 ' +
      'D5:1 D5:1 D5:0.5 F5:0.5 E5:0.5 D5:0.5 C5:0.5 C6:0.5 B5:0.5 A5:0.5 G5:0.5 F5:0.5 E5:0.5 D5:0.5 ' +
      'C5:2 D5:0.5 F5:0.5 E5:0.5 D5:0.5 G5:1 G5:1 G5:0.5 A5:0.5 E5:0.5 F5:0.5 ' +
      'D5:1 D5:1 D5:0.5 F5:0.5 E5:0.5 D5:0.5 C5:0.5 G5:0.5 D5:0.5 E5:0.5 C5:2',
    chords: 'C G7 C C G7 G7 C G7 C G7 C C G7 G7 G7 C',
  },
  mapo: {
    title: '運命（ベートーヴェン 交響曲第5番）',
    beat: 0.32, meter: 2, arp: 'bass', vol: 0.9,
    melody:
      'r:0.5 G4:0.5 G4:0.5 G4:0.5 D#4:2 D#4:2 r:0.5 F4:0.5 F4:0.5 F4:0.5 D4:2 D4:2 ' +
      'r:0.5 G4:0.5 G4:0.5 G4:0.5 G#4:0.5 G#4:0.5 G#4:0.5 G4:0.5 D#5:0.5 D#5:0.5 D#5:0.5 C5:0.5 ' +
      'r:0.5 G4:0.5 G4:0.5 G4:0.5 G#4:0.5 G#4:0.5 G#4:0.5 G4:0.5 F5:0.5 F5:0.5 F5:0.5 D5:0.5 G5:2 G5:2',
    chords: 'Cm Cm Cm G G G Cm Fm Cm Cm Fm G G G',
  },
  sugar: {
    title: '美しく青きドナウ（ヨハン・シュトラウス2世）',
    beat: 0.45, meter: 3, arp: 'waltz', vol: 0.9, pickup: 1,
    melody:
      'D4:1 D4:1 F#4:1 A4:1 A4:3 r:1 A5:1 A5:1 r:1 F#5:1 F#5:1 r:2 D4:1 ' +
      'D4:1 F#4:1 A4:1 A4:3 r:1 A5:1 A5:1 r:1 G5:1 G5:1 r:2 C#4:1 ' +
      'C#4:1 E4:1 B4:1 B4:3 r:1 B5:1 B5:1 r:1 G5:1 G5:1 r:2 C#4:1 ' +
      'C#4:1 E4:1 B4:1 B4:3 r:1 B5:1 B5:1 r:1 F#5:1 F#5:1 r:2',
    chords: 'D D D D D D D A7 A7 A7 A7 A7 A7 A7 A7 A7 A7 D D D',
  },
  bread: {
    title: 'アイネ・クライネ・ナハトムジーク（モーツァルト）',
    beat: 0.45, meter: 4, arp: 'bass', vol: 0.85,
    melody:
      'G4:1 r:0.5 D4:0.5 G4:1 r:0.5 D4:0.5 G4:0.5 D4:0.5 G4:0.5 B4:0.5 D5:2 ' +
      'C5:1 r:0.5 A4:0.5 C5:1 r:0.5 A4:0.5 C5:0.5 A4:0.5 F#4:0.5 A4:0.5 D4:2 ' +
      'G4:1 r:0.5 D4:0.5 G4:1 r:0.5 D4:0.5 G4:0.5 D4:0.5 G4:0.5 B4:0.5 D5:2 ' +
      'C5:1 r:0.5 A4:0.5 C5:1 r:0.5 A4:0.5 C5:0.5 A4:0.5 F#4:0.5 A4:0.5 G4:2',
    chords: 'G G D D G G D G',
  },
  apple: {
    title: '四季「春」（ヴィヴァルディ）',
    beat: 0.42, meter: 4, arp: 'bass', vol: 0.85, pickup: 1,
    melody:
      'E5:1 G#5:1 G#5:1 G#5:1 F#5:0.5 E5:0.5 B5:3 B5:0.5 A5:0.5 G#5:1 G#5:1 G#5:1 F#5:0.5 E5:0.5 B5:3 B5:0.5 A5:0.5 ' +
      'G#5:1 A5:1 B5:1 A5:1 G#5:2 F#5:2 E5:1 G#5:1 F#5:1 D#5:1 E5:3',
    chords: 'E E E E E B B E',
  },
  sushi: {
    title: 'さくらさくら（日本古謡）',
    beat: 0.62, meter: 4, arp: 'bass', vol: 0.9,
    melody:
      'A4:1 A4:1 B4:2 A4:1 A4:1 B4:2 A4:1 B4:1 C5:1 B4:1 A4:1 B4:0.5 A4:0.5 F4:2 ' +
      'E4:1 C4:1 E4:1 F4:1 E4:1 E4:0.5 C4:0.5 B3:2 A4:1 B4:1 C5:1 B4:1 A4:1 B4:0.5 A4:0.5 F4:2 ' +
      'E4:1 C4:1 E4:1 F4:1 E4:1 E4:0.5 C4:0.5 B3:2 A4:1 A4:1 B4:2 A4:1 A4:1 B4:2 ' +
      'E4:1 F4:1 B4:0.5 A4:0.5 F4:1 E4:4',
    chords: 'Am Am Am F Am E Am F Am E Am Am F E',
  },
  cake: {
    title: 'ハッピー・バースデー・トゥー・ユー',
    beat: 0.5, meter: 3, arp: 'waltz', vol: 0.9, pickup: 1,
    melody:
      'D5:0.75 D5:0.25 E5:1 D5:1 G5:1 F#5:2 D5:0.75 D5:0.25 E5:1 D5:1 A5:1 G5:2 D5:0.75 D5:0.25 ' +
      'D6:1 B5:1 G5:1 F#5:1 E5:1 C6:0.75 C6:0.25 B5:1 G5:1 A5:1 G5:2',
    chords: 'G D D G G7 C G/D G',
  },
  coffee: {
    title: 'トルコ行進曲（モーツァルト）',
    beat: 0.32, meter: 2, arp: 'bass', vol: 0.85, pickup: 1,
    melody:
      'B4:0.25 A4:0.25 G#4:0.25 A4:0.25 C5:1 D5:0.25 C5:0.25 B4:0.25 C5:0.25 E5:1 F5:0.25 E5:0.25 D#5:0.25 E5:0.25 ' +
      'B5:0.25 A5:0.25 G#5:0.25 A5:0.25 B5:0.25 A5:0.25 G#5:0.25 A5:0.25 C6:1 A5:0.5 C6:0.5 ' +
      'B5:0.5 A5:0.5 G5:0.5 A5:0.5 B5:0.5 A5:0.5 G5:0.5 A5:0.5 B5:0.5 A5:0.5 G5:0.5 F#5:0.5 E5:1',
    chords: 'Am Am Am Am Em Em B7 Em',
  },
  umeboshi: {
    title: '荒城の月（滝廉太郎）',
    beat: 0.72, meter: 4, arp: 'bass', vol: 0.9,
    melody:
      'E5:1 E5:1 A5:1 B5:1 C6:1.5 B5:0.5 A5:2 F5:1 F5:1 E5:1 D5:1 E5:4 ' +
      'E5:1 E5:1 A5:1 B5:1 C6:1.5 B5:0.5 A5:2 F5:1 D5:1 E5:2 A4:4',
    chords: 'Am Am Dm E Am Am Dm/E Am',
  },
  watermelon: {
    title: '聖者の行進（黒人霊歌）',
    beat: 0.4, meter: 4, arp: 'bass', vol: 0.85, pickup: 3,
    melody:
      'C5:1 E5:1 F5:1 G5:4 r:1 C5:1 E5:1 F5:1 G5:4 r:1 C5:1 E5:1 F5:1 G5:2 E5:2 C5:2 E5:2 D5:4 ' +
      'r:1 E5:1 E5:1 D5:1 C5:3 C5:1 E5:2 G5:2 G5:1 F5:3 r:1 E5:1 F5:1 G5:1 E5:2 C5:2 D5:4 C5:1',
    chords: 'C C C C C C G G C C F F C G C',
  },
  chili: {
    title: '熊蜂の飛行（リムスキー＝コルサコフ）',
    beat: 0.3, meter: 2, arp: 'bass', vol: 0.8,
    melody:
      'E6:0.25 D#6:0.25 D6:0.25 C#6:0.25 D6:0.25 C#6:0.25 C6:0.25 B5:0.25 ' +
      'C6:0.25 B5:0.25 A#5:0.25 A5:0.25 G#5:0.25 G5:0.25 F#5:0.25 F5:0.25 ' +
      'E5:0.25 D#5:0.25 D5:0.25 C#5:0.25 C5:0.25 F5:0.25 E5:0.25 D#5:0.25 ' +
      'E5:0.25 D#5:0.25 D5:0.25 C#5:0.25 C5:0.25 C#5:0.25 D5:0.25 D#5:0.25 ' +
      'E5:0.25 D#5:0.25 D5:0.25 C#5:0.25 D5:0.25 C#5:0.25 C5:0.25 B4:0.25 ' +
      'C5:0.25 B4:0.25 A#4:0.25 A4:0.25 G#4:0.25 G4:0.25 F#4:0.25 F4:0.25 ' +
      'E4:0.25 F4:0.25 E4:0.25 D#4:0.25 E4:0.25 F4:0.25 G4:0.25 G#4:0.25 ' +
      'A4:0.25 A#4:0.25 B4:0.25 C5:0.25 C#5:0.25 D5:0.25 D#5:0.25 E5:0.25',
    chords: 'Am Am Am Am Am Am E7 E7',
  },
  onigiri: {
    title: '家路（ドヴォルザーク「新世界より」）',
    beat: 0.8, meter: 4, arp: 'bass', vol: 0.9,
    melody:
      'E5:1.5 G5:0.5 G5:2 E5:1.5 D5:0.5 C5:2 D5:1 E5:1 G5:1 E5:1 D5:4 ' +
      'E5:1.5 G5:0.5 G5:2 E5:1.5 D5:0.5 C5:2 D5:1 E5:1 D5:1.5 C5:0.5 C5:4',
    chords: 'C C G G C C G C',
  },

  // ---- 文化物（レコードは SONGS を使う） ----
  manga: {
    title: 'アルプス一万尺（ヤンキー・ドゥードゥル）',
    beat: 0.34, meter: 4, arp: 'bass', vol: 0.85,
    melody:
      'C5:1 C5:1 D5:1 E5:1 C5:1 E5:1 D5:1 G4:1 C5:1 C5:1 D5:1 E5:1 C5:2 B4:2 ' +
      'C5:1 C5:1 D5:1 E5:1 F5:1 E5:1 D5:1 C5:1 B4:1 G4:1 A4:1 B4:1 C5:2 C5:2',
    chords: 'C G C G C F G C',
  },
  radio: {
    title: 'ジングルベル',
    beat: 0.36, meter: 4, arp: 'bass', vol: 0.85,
    melody:
      'E5:1 E5:1 E5:2 E5:1 E5:1 E5:2 E5:1 G5:1 C5:1.5 D5:0.5 E5:4 ' +
      'F5:1 F5:1 F5:1.5 F5:0.5 F5:1 E5:1 E5:1 E5:0.5 E5:0.5 E5:1 D5:1 D5:1 E5:1 D5:2 G5:2 ' +
      'E5:1 E5:1 E5:2 E5:1 E5:1 E5:2 E5:1 G5:1 C5:1.5 D5:0.5 E5:4 ' +
      'F5:1 F5:1 F5:1 F5:1 F5:1 E5:1 E5:1 E5:0.5 E5:0.5 G5:1 G5:1 F5:1 D5:1 C5:4',
    chords: 'C C C C F C G G C C C C F C G C',
  },
  pen: {
    title: 'アメイジング・グレイス（賛美歌）',
    beat: 0.6, meter: 3, arp: 'waltz', vol: 0.9, pickup: 1,
    melody:
      'D4:1 G4:2 B4:0.5 G4:0.5 B4:2 A4:1 G4:2 E4:1 D4:2 D4:1 G4:2 B4:0.5 G4:0.5 B4:2 A4:1 D5:3 D5:2 B4:1 ' +
      'D5:2 B4:0.5 G4:0.5 B4:2 A4:1 G4:2 E4:1 D4:2 D4:1 G4:2 B4:0.5 G4:0.5 B4:2 A4:1 G4:3 G4:2',
    chords: 'G G C G G D D D G G C G G D G G',
  },
  sheetmusic: {
    title: 'かえるの合唱（ドイツ民謡）',
    beat: 0.42, meter: 4, arp: 'bass', vol: 0.85,
    melody:
      'C5:1 D5:1 E5:1 F5:1 E5:1 D5:1 C5:2 E5:1 F5:1 G5:1 A5:1 G5:1 F5:1 E5:2 ' +
      'C5:2 C5:2 C5:2 C5:2 C5:0.5 C5:0.5 D5:0.5 D5:0.5 E5:0.5 E5:0.5 F5:0.5 F5:0.5 E5:1 D5:1 C5:2',
    chords: 'C C C C C C G C',
  },
  musicbox: {
    title: 'きらきら星（フランス民謡）',
    beat: 0.42, meter: 4, arp: 'bass', vol: 0.85,
    melody:
      'C5:1 C5:1 G5:1 G5:1 A5:1 A5:1 G5:2 F5:1 F5:1 E5:1 E5:1 D5:1 D5:1 C5:2 ' +
      'G5:1 G5:1 F5:1 F5:1 E5:1 E5:1 D5:2 G5:1 G5:1 F5:1 F5:1 E5:1 E5:1 D5:2 ' +
      'C5:1 C5:1 G5:1 G5:1 A5:1 A5:1 G5:2 F5:1 F5:1 E5:1 E5:1 D5:1 D5:1 C5:2',
    chords: 'C F/C F/C G/C C/F C/G C/F C/G C F/C F/C G/C',
  },
  clock: {
    title: '大きな古時計（ヘンリー・クレイ・ワーク）',
    beat: 0.5, meter: 4, arp: 'bass', vol: 0.85, pickup: 1,
    melody:
      'G4:1 C5:1 B4:0.5 C5:0.5 D5:1 C5:0.5 D5:0.5 E5:1 F5:0.5 E5:0.5 A5:1 D5:0.5 D5:0.5 C5:1 C5:0.5 C5:0.5 B4:1 A4:0.5 B4:0.5 C5:3 ' +
      'G4:1 C5:1 B4:0.5 C5:0.5 D5:1 C5:0.5 D5:0.5 E5:1 F5:0.5 E5:0.5 A5:1 D5:0.5 D5:0.5 C5:1 C5:0.5 C5:0.5 B4:1 A4:0.5 B4:0.5 C5:3',
    chords: 'C C/F C/G C C C/F C/G C',
  },
  windchime: {
    title: 'ちょうちょう（ドイツ民謡）',
    beat: 0.42, meter: 4, arp: 'bass', vol: 0.85,
    melody:
      'G5:1 E5:1 E5:2 F5:1 D5:1 D5:2 C5:1 D5:1 E5:1 F5:1 G5:1 G5:1 G5:2 ' +
      'G5:1 E5:1 E5:1 E5:1 F5:1 D5:1 D5:1 D5:1 C5:1 E5:1 G5:1 G5:1 E5:1 E5:1 E5:2 ' +
      'D5:1 D5:1 D5:1 D5:1 D5:1 E5:1 F5:2 E5:1 E5:1 E5:1 E5:1 E5:1 F5:1 G5:2 ' +
      'G5:1 E5:1 E5:2 F5:1 D5:1 D5:2 C5:1 E5:1 G5:1 G5:1 E5:1 E5:1 C5:2',
    chords: 'C G C C C G C C G G C C C G C C',
  },
  candle: {
    title: 'きよしこの夜（グルーバー）',
    beat: 0.55, meter: 3, arp: 'waltz', vol: 0.9,
    melody:
      'G4:1.5 A4:0.5 G4:1 E4:3 G4:1.5 A4:0.5 G4:1 E4:3 D5:2 D5:1 B4:3 C5:2 C5:1 G4:3 ' +
      'A4:2 A4:1 C5:1.5 B4:0.5 A4:1 G4:1.5 A4:0.5 G4:1 E4:3 A4:2 A4:1 C5:1.5 B4:0.5 A4:1 G4:1.5 A4:0.5 G4:1 E4:3 ' +
      'D5:2 D5:1 F5:1.5 D5:0.5 B4:1 C5:3 E5:3 C5:1.5 G4:0.5 E4:1 G4:1.5 F4:0.5 D4:1 C4:3 C4:3',
    chords: 'C C C C G G C C F F C C F F C C G G7 C C C G7 C C',
  },
  paints: {
    title: 'ロンドン橋（イギリス民謡）',
    beat: 0.4, meter: 4, arp: 'bass', vol: 0.85,
    melody:
      'G5:1.5 A5:0.5 G5:1 F5:1 E5:1 F5:1 G5:2 D5:1 E5:1 F5:2 E5:1 F5:1 G5:2 ' +
      'G5:1.5 A5:0.5 G5:1 F5:1 E5:1 F5:1 G5:2 D5:2 G5:2 E5:1 C5:3',
    chords: 'C C G C C C G C',
  },
  cards: {
    title: 'メリーさんのひつじ（アメリカ民謡）',
    beat: 0.4, meter: 4, arp: 'bass', vol: 0.85,
    melody:
      'E5:1.5 D5:0.5 C5:1 D5:1 E5:1 E5:1 E5:2 D5:1 D5:1 D5:2 E5:1 G5:1 G5:2 ' +
      'E5:1.5 D5:0.5 C5:1 D5:1 E5:1 E5:1 E5:1 E5:1 D5:1 D5:1 E5:1 D5:1 C5:4',
    chords: 'C C G C C C G C',
  },
  lightbulb: { ...SONGS[5] }, // 電球: 歓喜の歌（ひらめきの光）
};
