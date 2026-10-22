// エンドロール（出演者 + ユーザーが書いた文章）
// - 文章のパーサと差し込みは DOM に依存しない純粋関数（Node でテストできる）
// - 画面に出す部分（createEndroll）だけが document を使う
//
// 文章ファイルの書式（ending/*.txt）:
//   // コメント行（流れない）
//   # タイトル（大きく）
//   ## 見出し
//   本文はそのまま書く
//   ---          しばらく何も流れない間
//   （空行）      小さな間
//   {匹数} {遊んだ時間} {食べたもの} {食べた数} {最初に食べたもの} {最後に食べたもの}
//   {一番食べたもの} {聴いた曲} {レコード枚数}   プレイごとの記録が入る

// fetch に失敗したときの既定の文章
export const DEFAULT_ENDING = [
  '// 既定の文章（ending/ を読めなかったとき用）',
  '# 羽音',
  '',
  '{遊んだ時間}のあいだに、',
  '{匹数}匹のハエが、机の上を通りすぎていった。',
  '{食べたもの}の、あたたかい午後。',
  '---',
  'ハエは、とくに何も言わない。',
  '',
  'ただ、窓のほうへ飛んでいく。',
].join('\n');

// ---- 文章の解析 ----
// 戻り値: [{ t: 'title' | 'h' | 'p' | 'gap' | 'blank', text }]
export function parseEnding(text) {
  const out = [];
  const src = String(text ?? '').replace(/^﻿/, '').split(/\r?\n/);
  for (const raw of src) {
    const line = raw.replace(/\s+$/, '');
    if (line.startsWith('//')) continue;                        // コメント
    if (line.trim() === '---') { out.push({ t: 'gap', text: '' }); continue; }
    if (line.trim() === '') { out.push({ t: 'blank', text: '' }); continue; }
    if (line.startsWith('## ')) { out.push({ t: 'h', text: line.slice(3).trim() }); continue; }
    if (line.startsWith('# ')) { out.push({ t: 'title', text: line.slice(2).trim() }); continue; }
    out.push({ t: 'p', text: line });
  }
  return out;
}

// ---- 差し込み ----
const uniq = (list) => [...new Set(list)];
// 重複を除いて順に「と」でつなぐ。5個を超えたら先頭4つ + 「など」
export function joinNames(list) {
  const u = uniq(list);
  if (u.length === 0) return null;
  if (u.length > 5) return u.slice(0, 4).join('と') + 'など';
  return u.join('と');
}
export function formatCount(n) { return Math.round(n).toLocaleString('en-US'); }
export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}分${s % 60}秒`;
}
function mostEaten(eaten) {
  const c = new Map();
  for (const n of eaten) c.set(n, (c.get(n) || 0) + 1);
  let best = null, bk = 0;
  for (const [n, k] of c) if (k > bk) { best = n; bk = k; }  // 同数なら先に食べたほう
  return best;
}

// rec: { count, playSec, eaten: [表示名...] (食べた順), heard: [曲名...] }
// 値を作れない（記録が空）目印は null を返す
export function placeholderValues(rec) {
  const eaten = rec.eaten || [], heard = rec.heard || [];
  return {
    '匹数': () => (rec.count != null ? formatCount(rec.count) : null),
    '遊んだ時間': () => (rec.playSec != null ? formatTime(rec.playSec) : null),
    '食べたもの': () => joinNames(eaten),
    '食べた数': () => (eaten.length ? String(eaten.length) : null),
    '最初に食べたもの': () => (eaten.length ? eaten[0] : null),
    '最後に食べたもの': () => (eaten.length ? eaten[eaten.length - 1] : null),
    '一番食べたもの': () => mostEaten(eaten),
    '聴いた曲': () => joinNames(heard),
    'レコード枚数': () => (heard.length ? String(uniq(heard).length) : null),
  };
}

// 行の配列に記録を差し込む。記録が空で値を作れない目印を含む行は、行ごと流さない。
// 未知の目印はそのまま文字として残す。間（gap/blank）はそのまま通す。
export function fillPlaceholders(lines, rec) {
  const vals = placeholderValues(rec);
  const out = [];
  for (const ln of lines) {
    if (ln.t === 'gap' || ln.t === 'blank') { out.push({ ...ln }); continue; }
    let skip = false;
    const text = ln.text.replace(/\{([^{}]+)\}/g, (m, key) => {
      const f = vals[key];
      if (!f) return m;
      const v = f();
      if (v == null) { skip = true; return ''; }
      return v;
    });
    if (!skip) out.push({ ...ln, text });
  }
  return out;
}

// ---- 出演者 ----
// entries: [{ name, label, thumb }]（食べた順）。20行を超えるときは連続する同じ物をまとめて「×n」
export function collapseRuns(entries, limit = 20) {
  if (entries.length <= limit) return entries.map((e) => ({ ...e, n: 1 }));
  const out = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    if (last && last.name === e.name) last.n++;
    else out.push({ ...e, n: 1 });
  }
  return out;
}

// ---- 文章の読み込み（ending/index.json の一覧から、ランダムに1つ） ----
export async function loadEndingText(fetchFn = (typeof fetch === 'function' ? fetch : null), base = 'ending/', rand = Math.random) {
  try {
    if (!fetchFn) throw new Error('no fetch');
    const r = await fetchFn(base + 'index.json');
    if (!r.ok) throw new Error('index.json ' + r.status);
    const list = (await r.json()).filter((s) => typeof s === 'string' && s);
    if (!list.length) throw new Error('empty index');
    const name = list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
    const t = await fetchFn(base + name);
    if (!t.ok) throw new Error(name + ' ' + t.status);
    const text = await t.text();
    if (!parseEnding(text).some((l) => l.t !== 'blank' && l.t !== 'gap')) throw new Error('empty text');
    return text;
  } catch (e) {
    return DEFAULT_ENDING;
  }
}

// ---- 画面に出す（DOM） ----
// host: エンドロールの親（#ui の中の #credits）。cast: { count, entries } 。lines: 差し込み済みの行
export function createEndroll(host, { lines, count, entries }) {
  host.replaceChildren();
  const div = (cls, text) => { const d = document.createElement('div'); d.className = cls; if (text != null) d.textContent = text; return d; };
  host.append(div('cr-h2', '出演'), div('cr-p', `ハエ　${formatCount(count)}匹`));
  for (const e of collapseRuns(entries)) {
    const row = div('cr-item');
    if (e.thumb) { const im = document.createElement('img'); im.src = e.thumb; im.alt = ''; row.append(im); }
    const sp = document.createElement('span');
    sp.textContent = e.label + (e.n > 1 ? ` ×${e.n}` : '');
    row.append(sp);
    host.append(row);
  }
  host.append(div('cr-gap'));
  for (const l of lines) {
    if (l.t === 'gap') host.append(div('cr-gap'));
    else if (l.t === 'blank') host.append(div('cr-blank'));
    else host.append(div(l.t === 'title' ? 'cr-title' : l.t === 'h' ? 'cr-h2' : 'cr-p', l.text));
  }
  host.style.opacity = 1;
  // x: 0（開始）〜1（最後の行が画面の上端を出る）。高さは毎フレーム計測するので、ウィンドウの大きさが変わっても破綻しない
  function update(x) {
    const vh = window.innerHeight, h = host.offsetHeight;
    const y = vh - (vh + h) * Math.max(0, Math.min(1, x));
    host.style.transform = `translateY(${y.toFixed(1)}px)`;
  }
  update(0);
  return { update };
}
