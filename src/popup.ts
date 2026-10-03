// 吹き出しの中身。外から来た文字列は textContent で入れ、innerHTML は使わない。

import type { ShopProperties } from './types.ts';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function link(href: string, text: string) {
  const a = el('a', 'popup-link', text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

export function googleMapsUrl({ name, address }: ShopProperties): string {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${name} ${address ?? ''}`.trim());
}

/** 1店舗の詳細 */
export function shopDetail(p: ShopProperties, onBack?: () => void): HTMLElement {
  const root = el('div', 'popup');
  if (onBack) {
    const back = el('button', 'popup-back', '‹ 一覧に戻る');
    back.type = 'button';
    back.addEventListener('click', onBack);
    root.append(back);
  }
  root.append(el('h2', 'popup-name', p.name));
  if (p.category) root.append(el('p', 'popup-category', p.category));
  if (p.address) root.append(el('p', 'popup-address', p.address));
  if (p.approx) root.append(el('p', 'popup-approx', 'おおよその位置です'));
  if (p.description) root.append(el('p', 'popup-description', p.description));
  const links = el('p', 'popup-links');
  if (p.url) links.append(link(p.url, 'ウェブサイト'));
  links.append(link(googleMapsUrl(p), 'Googleマップで調べる'));
  root.append(links);
  return root;
}

/** 同じ地点にある複数店舗の一覧。選ぶと詳細に切り替わる */
export function shopList(items: ShopProperties[], render: (node: HTMLElement) => void): HTMLElement {
  const root = el('div', 'popup');
  root.append(el('p', 'popup-count', `この地点の ${items.length}件`));
  const list = el('ul', 'popup-list');
  for (const p of [...items].sort((a, b) => a.name.localeCompare(b.name, 'ja'))) {
    const button = el('button', 'popup-list-item', p.name);
    button.type = 'button';
    button.addEventListener('click', () => render(shopDetail(p, () => render(root))));
    const li = el('li');
    li.append(button);
    list.append(li);
  }
  root.append(list);
  return root;
}
