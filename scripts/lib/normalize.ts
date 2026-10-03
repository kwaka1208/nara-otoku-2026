// 文字と住所の正規化。データ処理スクリプトとビューアの両方で使う。

// CJK部首補助（U+2E80台）はNFKCで通常の漢字にならないので、自前で置き換える。
// 康熙部首（U+2F00台）のうちNFKCで日本では使わない字体になるもの（戶・黑・靑）もここで直す。
const VARIANTS: Record<string, string> = {
  '⺟': '母', '⺠': '民', '⻁': '虎', '⻄': '西', '⻆': '角', '⻑': '長',
  '⻘': '青', '⻝': '食', '⻤': '鬼', '⻨': '麦', '⻩': '黄', '⻫': '斉',
  '⻭': '歯', '⻯': '竜', '⻲': '亀',
  '戶': '戸', '黑': '黒', '靑': '青',
};
const VARIANT_RE = new RegExp(`[${Object.keys(VARIANTS).join('')}]`, 'g');

// 数字にはさまれたハイフン類（ソフトハイフン、各種ダッシュ、マイナス、長音）
const DIGIT_DASH_RE = /(\d)\s*[­‐-―−ー-]\s*(?=\d)/g;

/** 表示用の正規化：NFKC、部首文字の置き換え、数字間のハイフン統一、空白の整理 */
export function normalizeText(input: unknown): string {
  return String(input ?? '')
    .normalize('NFKC')
    .replace(VARIANT_RE, (ch) => VARIANTS[ch])
    .replace(DIGIT_DASH_RE, '$1-')
    .replace(/­/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 検索用のキー：表示用の正規化に加えて小文字化し、空白を除く */
export function searchKey(input: unknown): string {
  return normalizeText(input).toLowerCase().replace(/\s/g, '');
}

/**
 * ジオコーダーに渡す住所：番地までで切って建物名・階数を落とし、都道府県を補う。
 * 元データによくある誤記（郡を「群」と書く、地名を重ねて書く）もここで直す。
 */
export function geoQuery(address: unknown, prefix = ''): string {
  let s = normalizeText(address)
    // 「北葛城群王寺町」→「北葛城郡王寺町」。直前に郡名・都道府県名があるもの（生駒郡平群町、奈良県平群町）は変えない
    .replace(/([^\d\s郡都道府県]{2,4})群(?=\s*[^\d\s]{1,5}?[町村])/g, '$1郡');
  const m = s.match(/^\D*?\d+(?:\s*(?:丁目|番地の|番地|番|号|の|-)\s*\d+)*/);
  if (m) s = m[0];
  s = s.replace(/\s+/g, '')
    // 「勾田町勾田町」「大字大字上牧」「曽大根大字曽大根」のような重なりを1つにする
    .replace(/([^\d-]{2,}?)(?:大字)?\1/g, '$1');
  return prefix && !s.startsWith(prefix) ? prefix + s : s;
}
