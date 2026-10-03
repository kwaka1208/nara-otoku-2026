// 検索、絞り込み、一覧の並べ替え、URLのハッシュ。画面に依存しない処理だけを置く。

import { searchKey } from '../scripts/lib/normalize.ts';
import type { ShopFeature } from './types.ts';

/** 一覧に出す件数の上限 */
export const LIST_LIMIT = 100;

export interface IndexedShop { feature: ShopFeature; key: string }

export function buildIndex(features: ShopFeature[]): IndexedShop[] {
  return features.map((feature) => ({
    feature,
    key: searchKey(`${feature.properties.name} ${feature.properties.address ?? ''}`),
  }));
}

/** カテゴリを、データに出てきた順で返す（件数順にはしない。市町村の並びを保つため） */
export function categoriesOf(features: ShopFeature[]): string[] {
  return [...new Set(features.map((f) => f.properties.category).filter((c): c is string => !!c))];
}

export interface Filter { q: string; category: string }

/** 名称と住所の部分一致。空白で区切った語はすべて含むものを残す */
export function filterShops(index: IndexedShop[], { q, category }: Filter): ShopFeature[] {
  const terms = q.split(/[\s　]+/).map(searchKey).filter(Boolean);
  return index
    .filter((s) => !category || s.feature.properties.category === category)
    .filter((s) => terms.every((t) => s.key.includes(t)))
    .map((s) => s.feature);
}

/** [西, 南, 東, 北] */
export type Bbox = [number, number, number, number];

export function inBbox(features: ShopFeature[], [w, s, e, n]: Bbox): ShopFeature[] {
  return features.filter(({ geometry: { coordinates: [lng, lat] } }) => lng >= w && lng <= e && lat >= s && lat <= n);
}

/** 2点間のおおよその距離（メートル）。一覧の並べ替えと表示に使う程度の精度で足りる */
export function distanceM([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]): number {
  const rad = Math.PI / 180;
  const x = (lng2 - lng1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  const y = (lat2 - lat1) * rad;
  return Math.hypot(x, y) * 6_371_000;
}

export function formatDistance(m: number): string {
  if (m < 1000) return `約${Math.max(10, Math.round(m / 10) * 10)}m`;
  return `約${(m / 1000).toFixed(m < 10_000 ? 1 : 0)}km`;
}

/** 現在地がわかっていれば近い順、わからなければデータの順 */
export function sortForList(features: ShopFeature[], location: [number, number] | null): ShopFeature[] {
  if (!location) return features;
  return features
    .map((f) => ({ f, d: distanceM(location, f.geometry.coordinates) }))
    .sort((a, b) => a.d - b.d)
    .map(({ f }) => f);
}

export interface View { zoom: number; lat: number; lng: number }
export interface HashState extends Filter { view?: View }

/** 例: #q=西村&cat=奈良市&map=14.5/34.68500/135.80500 */
export function parseHash(hash: string): HashState {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const [zoom, lat, lng] = (p.get('map') ?? '').split('/').map(Number);
  const view = [zoom, lat, lng].every(Number.isFinite) && p.has('map') ? { zoom, lat, lng } : undefined;
  return { q: p.get('q') ?? '', category: p.get('cat') ?? '', view };
}

export function formatHash({ q, category, view }: HashState): string {
  const p = new URLSearchParams();
  if (q) p.set('q', q);
  if (category) p.set('cat', category);
  if (view) p.set('map', `${view.zoom.toFixed(2)}/${view.lat.toFixed(5)}/${view.lng.toFixed(5)}`);
  // 「/」はそのまま読めるように戻す
  return '#' + p.toString().replaceAll('%2F', '/');
}
