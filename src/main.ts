import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { setupInfo } from './info.ts';
import { createShopMap } from './map.ts';
import { formatCount, renderList } from './panel.ts';
import { buildIndex, categoriesOf, distanceM, filterShops, formatHash, inBbox, parseHash, sortForList } from './search.ts';
import type { ShopCollection, ShopFeature, ViewerConfig } from './types.ts';

/** 現在地からこれより遠くにしか店がなければ、市町村を切り替えない */
const NEAREST_SHOP_MAX_M = 10_000;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} を読み込めませんでした（${res.status}）`);
  return res.json() as Promise<T>;
}

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

async function main() {
  const status = byId('status');
  // 地図ごとのデータと設定は、このページと同じ階層に置く
  const [config, data] = await Promise.all([
    fetchJson<ViewerConfig>('./config.json'),
    fetchJson<ShopCollection>('./data.geojson'),
  ]);
  document.title = config.title;
  setupInfo(config);

  const input = byId<HTMLInputElement>('q');
  const select = byId<HTMLSelectElement>('category');
  const count = byId('count');
  const toggle = byId<HTMLButtonElement>('panel-toggle');
  const toggleText = byId('panel-toggle-text');
  const heading = byId('panel-heading');
  const list = byId<HTMLUListElement>('list');
  const note = byId('panel-note');

  // カテゴリの選択肢（データに出てきた順）
  const categories = categoriesOf(data.features);
  select.setAttribute('aria-label', `${config.categoryLabel}で絞り込む`);
  select.append(new Option(`すべての${config.categoryLabel}`, ''), ...categories.map((c) => new Option(c, c)));
  select.hidden = categories.length === 0;

  // URLのハッシュから状態を戻す
  const initial = parseHash(location.hash);
  input.value = initial.q;
  select.value = categories.includes(initial.category) ? initial.category : '';

  const shopMap = createShopMap(byId('map'), {
    ...config,
    ...(initial.view && { initialView: { center: [initial.view.lng, initial.view.lat], zoom: initial.view.zoom } }),
  }, data);
  // 開発時の確認用。本番のビルドには含まれない
  if (import.meta.env.DEV) Object.assign(window, { shopMap });

  const index = buildIndex(data.features);
  let matched: ShopFeature[] = data.features;

  const updateHash = () => {
    const c = shopMap.map.getCenter();
    const hash = formatHash({
      q: input.value.trim(),
      category: select.value,
      view: { zoom: shopMap.map.getZoom(), lat: c.lat, lng: c.lng },
    });
    history.replaceState(null, '', hash === '#' ? location.pathname + location.search : hash);
  };

  const updateList = () => {
    const items = sortForList(inBbox(matched, shopMap.bbox()), shopMap.userLocation());
    renderList(list, note, {
      matched: matched.length,
      items,
      location: shopMap.userLocation(),
      onSelect: (f) => {
        setPanelOpen(false);
        shopMap.openShop(f);
      },
    });
    const summary = `この範囲に${formatCount(items.length)}`;
    toggleText.textContent = `一覧（${summary}）`;
    heading.textContent = summary;
  };

  const applyFilter = () => {
    matched = filterShops(index, { q: input.value, category: select.value });
    const total = data.features.length;
    count.textContent = matched.length === total ? formatCount(total) : `${formatCount(matched.length)} / ${formatCount(total)}`;
    shopMap.setData({ type: 'FeatureCollection', features: matched });
    updateList();
    updateHash();
  };

  const setPanelOpen = (open: boolean) => {
    toggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('panel-open', open);
  };
  toggle.addEventListener('click', () => setPanelOpen(toggle.getAttribute('aria-expanded') !== 'true'));

  input.addEventListener('input', debounce(applyFilter, 200));
  // 市町村を選んだら、その店が収まる範囲へ移動する（選び直しても画面外で絞り込まれるだけにならないように）
  select.addEventListener('change', () => {
    applyFilter();
    if (select.value) shopMap.fitTo(matched);
  });
  // Enter で送信してもページを再読み込みしない。スマートフォンではキーボードを閉じて一覧を開く
  byId('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    applyFilter();
    input.blur();
    setPanelOpen(true);
  });
  shopMap.map.on('moveend', () => {
    updateList();
    updateHash();
  });
  shopMap.onLocate(updateList);
  // 現在地ボタンを押したら、いちばん近い店の市町村に切り替える（境界データは持たないので近似）。
  // 近くに店がなければ県外とみなして切り替えない
  shopMap.onLocateButton((at) => {
    let nearest: ShopFeature | undefined;
    let nearestM = NEAREST_SHOP_MAX_M;
    for (const f of data.features) {
      const d = distanceM(at, f.geometry.coordinates);
      if (d < nearestM) [nearest, nearestM] = [f, d];
    }
    const category = nearest?.properties.category;
    if (!category || !categories.includes(category) || select.value === category) return;
    select.value = category;
    // 地図は現在地へ移動中なので、fitTo はしない
    applyFilter();
  });

  // 開いているページに別のハッシュのURLを貼ったときも、その状態にする
  // （updateHash の replaceState では hashchange は起きない）
  window.addEventListener('hashchange', () => {
    const next = parseHash(location.hash);
    input.value = next.q;
    select.value = categories.includes(next.category) ? next.category : '';
    if (next.view) shopMap.map.jumpTo({ center: [next.view.lng, next.view.lat], zoom: next.view.zoom });
    applyFilter();
  });

  applyFilter();
  status.hidden = true;
}

main().catch((e) => {
  byId('status').textContent = `地図を表示できませんでした。${e instanceof Error ? e.message : ''}`;
});
