// 一覧パネル。外から来た文字列は textContent で入れる。

import { LIST_LIMIT, distanceM, formatDistance } from './search.ts';
import type { ShopFeature } from './types.ts';

const nf = new Intl.NumberFormat('ja-JP');
export const formatCount = (n: number) => `${nf.format(n)}件`;

export interface ListOptions {
  /** 絞り込み後の件数（地図全体） */
  matched: number;
  /** 表示範囲の中の店（並べ替え済み） */
  items: ShopFeature[];
  location: [number, number] | null;
  onSelect: (feature: ShopFeature) => void;
}

export function renderList(list: HTMLUListElement, note: HTMLElement, { matched, items, location, onSelect }: ListOptions) {
  if (matched === 0) note.textContent = '条件に合う店がありません。検索語や絞り込みを変えてください。';
  else if (items.length === 0) note.textContent = 'この範囲に店がありません。地図を動かすか縮小してください。';
  else if (items.length > LIST_LIMIT) note.textContent = `先頭の${LIST_LIMIT}件を表示しています。地図を拡大すると、残りの店も一覧に出ます。`;
  else note.textContent = location ? '現在地から近い順に並べています。' : '';
  note.hidden = !note.textContent;

  const fragment = document.createDocumentFragment();
  for (const f of items.slice(0, LIST_LIMIT)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'list-item';
    const name = document.createElement('span');
    name.className = 'list-name';
    name.textContent = f.properties.name;
    const meta = document.createElement('span');
    meta.className = 'list-meta';
    const distance = location ? formatDistance(distanceM(location, f.geometry.coordinates)) : '';
    meta.textContent = [distance, f.properties.address].filter(Boolean).join('　');
    button.append(name, meta);
    button.addEventListener('click', () => onSelect(f));
    const li = document.createElement('li');
    li.append(button);
    fragment.append(li);
  }
  list.replaceChildren(fragment);
}
