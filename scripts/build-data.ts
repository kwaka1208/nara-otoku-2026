// CSVを取得し、正規化と緯度経度の付与を行って GeoJSON を出力する。
// 使い方: npm run build:data -- <slug> [--retry-unresolved]

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { type Bounds, type GsiHit, classifyGsiResult, createGsiFetcher, hasStreetNumber, inBounds } from './lib/geocode.ts';
import { geoQuery, normalizeText } from './lib/normalize.ts';

export interface MapConfig {
  title: string;
  source: { url?: string; path?: string };
  columns: Partial<Record<Field, string>>;
  geocode?: { prefix?: string; bounds?: Bounds };
  notice?: string;
  sourceLabel?: string;
  /** 出典のページ（http/https） */
  sourceUrl?: string;
  /** 絞り込みの見出し（例: 市町村）。省略時は「カテゴリ」 */
  categoryLabel?: string;
  styleUrl?: string;
  initialView?: { center: [number, number]; zoom: number };
}

type Field = 'name' | 'address' | 'lat' | 'lng' | 'category' | 'description' | 'url';
type Row = Record<string, string>;
/** 正規化済みの住所 → APIの応答 */
export type Cache = Record<string, GsiHit[]>;
export interface Override { name: string; address: string; lat: number; lng: number; approx?: boolean }

export interface Feature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    name: string; address?: string; category?: string;
    description?: string; url?: string; approx?: true;
  };
}

export interface Stats {
  total: number; fromCsv: number; override: number; cached: number;
  fetched: number; approx: number; unresolved: number;
}

export interface BuildOptions {
  cache: Cache;
  fetchHits: (query: string) => Promise<GsiHit[]>;
  overrides?: Override[];
  /** キャッシュで未解決になる住所を問い合わせ直す */
  retryUnresolved?: boolean;
  /** 新しく問い合わせたときに呼ばれる。進捗表示とキャッシュの途中保存に使う */
  onFetched?: (query: string, hits: GsiHit[]) => void | Promise<void>;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

function toNumber(v: string | undefined): number | null {
  if (v == null || v.trim() === '') return null;
  const n = Number(normalizeText(v));
  return Number.isFinite(n) ? n : null;
}

function safeUrl(v: string): string | undefined {
  const s = normalizeText(v);
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}

export async function buildFeatures(rows: Row[], config: MapConfig, opts: BuildOptions) {
  const col = (row: Row, f: Field) => {
    const header = config.columns[f];
    return header ? (row[header] ?? '') : '';
  };
  const prefix = config.geocode?.prefix ?? '';
  const bounds = config.geocode?.bounds;
  // 手動指定の住所は、ジオコーダーに渡す形にそろえて比べる（建物名や表記の違いを吸収する）
  const overrides = (opts.overrides ?? []).map((o) => ({
    ...o, name: normalizeText(o.name), query: o.address.trim() ? geoQuery(o.address, prefix) : '',
  }));

  const features: Feature[] = [];
  const unresolved: (Row & { 理由: string })[] = [];
  const retried = new Set<string>();
  const usedQueries = new Set<string>();
  const stats: Stats = { total: rows.length, fromCsv: 0, override: 0, cached: 0, fetched: 0, approx: 0, unresolved: 0 };
  const fail = (row: Row, reason: string) => {
    unresolved.push({ ...row, 理由: reason });
    stats.unresolved++;
  };

  for (const row of rows) {
    const name = normalizeText(col(row, 'name'));
    const address = normalizeText(col(row, 'address'));
    if (!name) { fail(row, '名称がない'); continue; }

    let pos: { lat: number; lng: number; approx: boolean } | null = null;

    const ov = overrides.find((o) =>
      (o.name || o.query) && (!o.name || o.name === name) && (!o.query || o.query === geoQuery(address, prefix)));
    const lat = toNumber(col(row, 'lat'));
    const lng = toNumber(col(row, 'lng'));

    if (ov) {
      pos = { lat: ov.lat, lng: ov.lng, approx: ov.approx ?? false };
      stats.override++;
    } else if (lat != null && lng != null) {
      if (bounds && !inBounds(lng, lat, bounds)) { fail(row, 'CSVの緯度経度が範囲外'); continue; }
      pos = { lat, lng, approx: false };
      stats.fromCsv++;
    } else {
      if (!address) { fail(row, '住所がない'); continue; }
      const query = geoQuery(address, prefix);
      if (!hasStreetNumber(query)) { fail(row, '番地がない'); continue; }
      usedQueries.add(query);
      const classify = (hits: GsiHit[]) => classifyGsiResult(query, hits, { prefix, bounds });
      const cached = opts.cache[query];
      let result = cached && classify(cached);
      if (result && !(opts.retryUnresolved && result.level === 'none' && !retried.has(query))) {
        stats.cached++;
      } else {
        const hits = await opts.fetchHits(query);
        opts.cache[query] = hits;
        retried.add(query);
        stats.fetched++;
        await opts.onFetched?.(query, hits);
        result = classify(hits);
      }
      if (result.level === 'none') { fail(row, result.reason); continue; }
      pos = { lat: result.lat, lng: result.lng, approx: result.level === 'approx' };
    }

    if (pos.approx) stats.approx++;
    const category = normalizeText(col(row, 'category'));
    const description = normalizeText(col(row, 'description'));
    const url = safeUrl(col(row, 'url'));
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [round(pos.lng), round(pos.lat)] },
      properties: {
        name,
        ...(address && { address }),
        ...(category && { category }),
        ...(description && { description }),
        ...(url && { url }),
        ...(pos.approx && { approx: true as const }),
      },
    });
  }
  return { features, unresolved, stats, usedQueries };
}

export function parseCsv(text: string): Row[] {
  return parse(text, { columns: true, bom: true, skip_empty_lines: true, relax_column_count: true });
}

function sortedJson(cache: Cache): string {
  const sorted = Object.fromEntries(Object.keys(cache).sort().map((k) => [k, cache[k]]));
  return JSON.stringify(sorted, null, 1) + '\n';
}

async function readSource(config: MapConfig, mapDir: string): Promise<string> {
  if (config.source.url) {
    const res = await fetch(config.source.url);
    if (!res.ok) throw new Error(`CSVを取得できませんでした: ${res.status} ${config.source.url}`);
    return res.text();
  }
  if (config.source.path) return readFile(path.resolve(mapDir, config.source.path), 'utf8');
  throw new Error('map.config.json の source に url か path を指定してください');
}

async function readOverrides(file: string): Promise<Override[]> {
  if (!existsSync(file)) return [];
  return parseCsv(await readFile(file, 'utf8')).map((r, i) => {
    const lat = toNumber(r.lat), lng = toNumber(r.lng);
    if (lat == null || lng == null) throw new Error(`overrides.csv の${i + 2}行目の緯度経度が読めません`);
    // approx 列に 1 / true / ○ があれば、おおよその位置として扱う。memo など他の列は無視する
    return { name: r.name ?? '', address: r.address ?? '', lat, lng, approx: /^(1|true|○)$/i.test((r.approx ?? '').trim()) };
  });
}

/** ビューアが読む設定。map.config.json のうち公開してよい項目だけを出す */
export interface ViewerConfig {
  title: string;
  notice?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  categoryLabel: string;
  styleUrl: string;
  initialView?: { center: [number, number]; zoom: number };
  /** データを作った日（YYYY-MM-DD） */
  builtAt: string;
}

export const DEFAULT_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const ROOT_DIR = path.resolve(import.meta.dirname, '..');

/** maps/<slug>/ の設定とCSVから、dist/<slug>/ に data.geojson・config.json・unresolved.csv を作る */
export async function buildMap(slug: string, { retryUnresolved = false } = {}) {
  const mapDir = path.join(ROOT_DIR, 'maps', slug);
  const outDir = path.join(ROOT_DIR, 'dist', slug);
  const cacheFile = path.join(mapDir, 'geocode-cache.json');
  const config: MapConfig = JSON.parse(await readFile(path.join(mapDir, 'map.config.json'), 'utf8'));

  const rows = parseCsv(await readSource(config, mapDir));
  const cache: Cache = existsSync(cacheFile) ? JSON.parse(await readFile(cacheFile, 'utf8')) : {};
  const saveCache = () => writeFile(cacheFile, sortedJson(cache));

  // 中断してもそこまでの結果を残し、次回は続きから問い合わせる
  process.on('SIGINT', async () => {
    await saveCache();
    console.log('\n中断しました。キャッシュを保存したので、次回は続きから処理します。');
    process.exit(130);
  });

  let count = 0;
  const built = await buildFeatures(rows, config, {
    cache,
    overrides: await readOverrides(path.join(mapDir, 'overrides.csv')),
    fetchHits: createGsiFetcher({
      onRetry: (query, e, ms) => console.log(`  再試行（${ms / 1000}秒後）: ${query}: ${e instanceof Error ? e.message : e}`),
    }),
    retryUnresolved,
    onFetched: async (query, hits) => {
      count++;
      if (count % 50 === 0) {
        await saveCache();
        console.log(`  問い合わせ ${count}件目: ${query} → ${hits[0]?.title ?? '該当なし'}`);
      }
    },
  }).finally(saveCache);
  const { features, unresolved, stats, usedQueries } = built;

  // 元データから消えた住所（表記の修正で使わなくなったものを含む）をキャッシュから除く
  const stale = Object.keys(cache).filter((q) => !usedQueries.has(q));
  stale.forEach((q) => delete cache[q]);
  if (stale.length) await saveCache();

  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'data.geojson'), JSON.stringify({ type: 'FeatureCollection', features }));
  await writeFile(path.join(outDir, 'unresolved.csv'), '﻿' + stringify(unresolved, { header: true }));
  const viewerConfig: ViewerConfig = {
    title: config.title,
    notice: config.notice,
    sourceLabel: config.sourceLabel,
    sourceUrl: config.sourceUrl && safeUrl(config.sourceUrl),
    categoryLabel: config.categoryLabel ?? 'カテゴリ',
    styleUrl: config.styleUrl ?? DEFAULT_STYLE_URL,
    initialView: config.initialView,
    builtAt: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }),
  };
  await writeFile(path.join(outDir, 'config.json'), JSON.stringify(viewerConfig, null, 2));

  console.log(`
${config.title}（${slug}）
  全件           ${stats.total}
  CSVの緯度経度  ${stats.fromCsv}
  手動指定       ${stats.override}
  キャッシュ     ${stats.cached}
  新規の問い合わせ ${stats.fetched}
  ─────────────
  地図に表示     ${features.length}（うち概略位置 ${stats.approx}）
  未解決         ${stats.unresolved} → dist/${slug}/unresolved.csv${stale.length ? `\n  （使われなくなったキャッシュ ${stale.length}件を削除）` : ''}`);
}

async function main() {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith('--'));
  if (!slug) throw new Error('使い方: npm run build:data -- <slug> [--retry-unresolved]');
  await buildMap(slug, { retryUnresolved: args.includes('--retry-unresolved') });
}

if (import.meta.filename === path.resolve(process.argv[1] ?? '')) {
  main().catch((e) => {
    console.error(e instanceof Error ? `${e.message}${e.cause ? `（${e.cause}）` : ''}` : e);
    process.exit(1);
  });
}
