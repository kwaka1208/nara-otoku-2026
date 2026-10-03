// 住所から緯度経度への変換。国土地理院の住所検索APIを使う。
// APIの応答はそのままキャッシュし、判定（classify）はビルドのたびに行う。
// 判定のルールを変えても、APIに問い合わせ直さずに済むようにするため。

import municipalities from './municipalities.json' with { type: 'json' };
import { normalizeText } from './normalize.ts';

export const GSI_ENDPOINT = 'https://msearch.gsi.go.jp/address-search/AddressSearch?q=';

/** [[西端の経度, 南端の緯度], [東端の経度, 北端の緯度]] */
export type Bounds = [[number, number], [number, number]];

/** APIの応答1件（キャッシュに保存する形） */
export interface GsiHit { title: string; lng: number; lat: number }

export type GeocodeResult =
  | { level: 'exact' | 'approx'; lat: number; lng: number; matched: string }
  | { level: 'none'; reason: string; matched?: string };

export interface ClassifyOptions {
  prefix?: string;
  bounds?: Bounds;
}

const numbersIn = (s: string) => [...s.matchAll(/\d+/g)].map((m) => m[0]);

/** 問い合わせる価値のある住所か（番地の数字を含むか） */
export const hasStreetNumber = (query: string) => /\d/.test(query);

/**
 * APIの応答を判定する。
 * 応答の住所表記が番地・号まで達していれば exact、町名や丁目で止まっていれば approx、
 * 市区町村までしか一致しない・該当なし・範囲外は none。
 */
export function classifyGsiResult(
  query: string,
  hits: GsiHit[],
  { prefix = '', bounds }: ClassifyOptions = {},
): GeocodeResult {
  if (!hasStreetNumber(query)) return { level: 'none', reason: '番地がない' };

  const candidates = hits
    .map((h) => ({ ...h, title: normalizeText(h.title).replace(/\s/g, '') }))
    .filter(({ title }) => !prefix || title.startsWith(prefix));
  if (candidates.length === 0) return { level: 'none', reason: '該当なし' };

  const { title, lng, lat } = candidates[0];
  if (bounds && !inBounds(lng, lat, bounds)) {
    return { level: 'none', reason: '範囲外の座標', matched: title };
  }

  const titleNums = numbersIn(title);
  if (titleNums.length > 0) {
    // 応答の番地が入力の番地と食い違う場合は誤一致とみなす
    const queryNums = numbersIn(query);
    if (!titleNums.every((n) => queryNums.includes(n))) {
      return { level: 'none', reason: '番地が一致しない', matched: title };
    }
    return { level: 'exact', lat, lng, matched: title };
  }
  if (isMunicipality(title)) {
    return { level: 'none', reason: '市区町村までしか一致しない', matched: title };
  }
  return { level: 'approx', lat, lng, matched: title };
}

const MUNICIPALITIES = new Set<string>(municipalities);

/** 都道府県名だけ、または市区町村名までの住所か。応答は郡名を含む場合と含まない場合がある */
export function isMunicipality(title: string): boolean {
  return /^.{2,3}[都道府県]$/.test(title)
    || MUNICIPALITIES.has(title)
    || MUNICIPALITIES.has(title.replace(/^(.+?[都道府県])(.+?郡)/, '$1'));
}

export function inBounds(lng: number, lat: number, [[w, s], [e, n]]: Bounds): boolean {
  return lng >= w && lng <= e && lat >= s && lat <= n;
}

export interface GsiFetcherOptions {
  /** リクエストの間隔（ミリ秒） */
  intervalMs?: number;
  /** 1件あたりの待ち時間の上限（ミリ秒） */
  timeoutMs?: number;
  /** 一時的な失敗のあとに待つ時間（ミリ秒）。この回数だけ再試行する */
  retryDelaysMs?: number[];
  fetch?: typeof fetch;
  onRetry?: (query: string, error: unknown, delayMs: number) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 1件ずつ間隔をあけて国土地理院APIに問い合わせ、応答を GsiHit の配列で返す関数を作る */
export function createGsiFetcher({
  intervalMs = 500,
  timeoutMs = 15_000,
  retryDelaysMs = [2_000, 5_000, 15_000, 30_000, 60_000],
  fetch: fetchFn = fetch,
  onRetry,
}: GsiFetcherOptions = {}) {
  let last = 0;
  const once = async (query: string): Promise<GsiHit[]> => {
    const wait = last + intervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetchFn(GSI_ENDPOINT + encodeURIComponent(query), { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      throw Object.assign(new Error(`国土地理院APIがエラーを返しました: ${res.status} ${query}`), {
        retryable: res.status === 429 || res.status >= 500,
      });
    }
    const features = (await res.json()) as { geometry: { coordinates: [number, number] }; properties: { title: string } }[];
    return features.map((f) => ({ title: f.properties.title, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
  };

  return async (query: string): Promise<GsiHit[]> => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await once(query);
      } catch (e) {
        // 4xx（429を除く）は再試行しても変わらないので、そのまま失敗にする
        const retryable = (e as { retryable?: boolean }).retryable ?? true;
        if (!retryable || attempt >= retryDelaysMs.length) throw e;
        onRetry?.(query, e, retryDelaysMs[attempt]);
        await sleep(retryDelaysMs[attempt]);
      }
    }
  };
}
