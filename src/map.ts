// 地図、クラスタ、吹き出し、現在地ボタン

import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, LngLatBoundsLike, MapGeoJSONFeature } from 'maplibre-gl';
// MapLibre 6 は本体と同じ場所の maplibre-gl-worker.mjs を読みに行くが、バンドルするとそのファイルがなくなる。
// Vite にワーカーを依存ごと別ファイルとしてビルドさせ、その場所を教える。
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { shopDetail, shopList } from './popup.ts';
import type { ShopCollection, ShopFeature, ShopProperties, ViewerConfig } from './types.ts';

maplibregl.setWorkerUrl(workerUrl);

const SOURCE = 'shops';
const CLUSTER_MAX_ZOOM = 16;
const COLOR = '#c2255c';
const APPROX_COLOR = '#868e96';

export interface ShopMap {
  map: maplibregl.Map;
  setData(data: ShopCollection): void;
  /** 店舗の位置へ移動して吹き出しを開く */
  openShop(feature: ShopFeature): void;
  /** 現在地（取得できていれば） */
  userLocation(): [number, number] | null;
  /** 現在地が取れたり動いたりしたときに呼ばれる */
  onLocate(listener: () => void): void;
  /** 表示範囲 [西, 南, 東, 北] */
  bbox(): [number, number, number, number];
}

function dataBounds(data: ShopCollection): LngLatBoundsLike | null {
  if (data.features.length === 0) return null;
  const b = new maplibregl.LngLatBounds();
  for (const f of data.features) b.extend(f.geometry.coordinates);
  return b;
}

/** 地名ラベルを日本語名で表示する（スタイルの既定はローマ字と日本語の併記） */
function useJapaneseLabels(map: maplibregl.Map) {
  for (const layer of map.getStyle().layers) {
    if (layer.type !== 'symbol') continue;
    const field = map.getLayoutProperty(layer.id, 'text-field');
    if (JSON.stringify(field ?? '').includes('name')) {
      map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:ja'], ['get', 'name']]);
    }
  }
}

export function createShopMap(container: HTMLElement, config: ViewerConfig, data: ShopCollection): ShopMap {
  const bounds = dataBounds(data);
  const map = new maplibregl.Map({
    container,
    style: config.styleUrl,
    ...(config.initialView
      ? { center: config.initialView.center, zoom: config.initialView.zoom }
      : bounds ? { bounds, fitBoundsOptions: { padding: 40 } } : { center: [137, 36], zoom: 4 }),
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  let location: [number, number] | null = null;
  const locateListeners: (() => void)[] = [];
  const geolocate = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
  });
  // 位置情報は端末内でのみ使う（並べ替え用に保持するだけで、どこにも送らない）
  geolocate.on('geolocate', (e) => {
    location = [e.coords.longitude, e.coords.latitude];
    locateListeners.forEach((l) => l());
  });
  map.addControl(geolocate, 'bottom-right');

  const popup = new maplibregl.Popup({ maxWidth: '320px', focusAfterOpen: true });
  const showPopup = (lngLat: [number, number], content: HTMLElement) => {
    popup.setLngLat(lngLat).setDOMContent(content).addTo(map);
  };
  const render = (node: HTMLElement) => popup.setDOMContent(node);

  let pending: ShopCollection = data;
  // 地図タイルを待たず、スタイルが読めた時点でピンを出す（'load' は全タイルがそろうまで発生しない）
  map.once('style.load', () => {
    useJapaneseLabels(map);
    map.addSource(SOURCE, {
      type: 'geojson',
      data: pending,
      cluster: true,
      clusterMaxZoom: CLUSTER_MAX_ZOOM,
      clusterRadius: 40,
    });
    map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: SOURCE,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': COLOR,
        'circle-opacity': 0.85,
        'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 100, 23, 1000, 28],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
      },
    });
    map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: SOURCE,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 12,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#fff' },
    });
    // 正確な位置は塗りつぶし、おおよその位置は白抜きにする
    map.addLayer({
      id: 'shop',
      type: 'circle',
      source: SOURCE,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': 7,
        'circle-color': ['case', ['==', ['get', 'approx'], true], '#fff', COLOR],
        'circle-stroke-width': 2.5,
        'circle-stroke-color': ['case', ['==', ['get', 'approx'], true], APPROX_COLOR, '#fff'],
      },
    });
    // 指で押しやすいように、見た目より広い透明の当たり判定を重ねる
    map.addLayer({
      id: 'shop-hit',
      type: 'circle',
      source: SOURCE,
      filter: ['!', ['has', 'point_count']],
      paint: { 'circle-radius': 18, 'circle-opacity': 0 },
    });
    map.addLayer({
      id: 'cluster-hit',
      type: 'circle',
      source: SOURCE,
      filter: ['has', 'point_count'],
      paint: { 'circle-radius': ['step', ['get', 'point_count'], 20, 10, 24, 100, 28, 1000, 32], 'circle-opacity': 0 },
    });
  });

  const pointOf = (f: MapGeoJSONFeature) => (f.geometry as { coordinates: [number, number] }).coordinates;

  map.on('click', 'cluster-hit', async (e) => {
    const f = e.features?.[0];
    if (!f) return;
    const source = map.getSource<GeoJSONSource>(SOURCE)!;
    const id = f.properties.cluster_id as number;
    const zoom = await source.getClusterExpansionZoom(id);
    if (zoom <= CLUSTER_MAX_ZOOM) {
      map.easeTo({ center: pointOf(f), zoom });
      return;
    }
    // これ以上寄っても分かれない（同じ建物などに集まっている）ので、一覧で見せる
    const leaves = await source.getClusterLeaves(id, Infinity, 0);
    showPopup(pointOf(f), shopList(leaves.map((l) => l.properties as ShopProperties), render));
  });

  map.on('click', 'shop-hit', (e) => {
    // クラスタの当たり判定と重なったときはクラスタを優先する
    if (map.queryRenderedFeatures(e.point, { layers: ['cluster-hit'] }).length) return;
    const f = e.features?.[0];
    if (!f) return;
    // クラスタの上限より寄ると、同じ座標の店は1つのピンに重なって描かれる。重なっていれば一覧で見せる
    const [lng, lat] = pointOf(f);
    const seen = new Set<string>();
    const same = (e.features ?? [])
      .filter((g) => { const [x, y] = pointOf(g); return x === lng && y === lat; })
      .map((g) => g.properties as ShopProperties)
      .filter((p) => { const k = `${p.name}\n${p.address}`; return !seen.has(k) && !!seen.add(k); });
    showPopup([lng, lat], same.length > 1 ? shopList(same, render) : shopDetail(same[0]));
  });

  for (const layer of ['cluster-hit', 'shop-hit']) {
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
  }

  return {
    map,
    setData(next) {
      pending = next;
      map.getSource<GeoJSONSource>(SOURCE)?.setData(next);
    },
    openShop(feature) {
      const [lng, lat] = feature.geometry.coordinates;
      map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), CLUSTER_MAX_ZOOM + 1) });
      showPopup([lng, lat], shopDetail(feature.properties));
    },
    userLocation: () => location,
    onLocate: (listener) => { locateListeners.push(listener); },
    bbox: () => map.getBounds().toArray().flat() as [number, number, number, number],
  };
}
