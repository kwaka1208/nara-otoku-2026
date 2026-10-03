import { describe, expect, it } from 'vitest';
import type { ShopFeature } from '../src/types';
import {
  buildIndex, categoriesOf, distanceM, filterShops, formatDistance, formatHash, inBbox, parseHash, sortForList,
} from '../src/search';

const shop = (name: string, address: string, category: string, lng = 135.8, lat = 34.68): ShopFeature => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lng, lat] },
  properties: { name, address, category },
});

const shops = [
  shop('西村邸', '奈良市 右京 1-3-4', '奈良市', 135.80, 34.70),
  shop('にぎり長次郎 押熊店', '奈良市 押熊町 1115', '奈良市', 135.77, 34.72),
  shop('洋服の青山 橿原曲川店', '橿原市 曲川町 3-1', '橿原市', 135.78, 34.50),
  shop('Room hair', '大和郡山市 筒井町 897-1', '大和郡山市', 135.80, 34.62),
  shop('BAKERY西村工房', '橿原市 内膳町 1-6-6', '橿原市', 135.79, 34.51),
];
const index = buildIndex(shops);
const names = (fs: ShopFeature[]) => fs.map((f) => f.properties.name);

describe('filterShops', () => {
  it('名称の部分一致', () => {
    expect(names(filterShops(index, { q: '西村', category: '' }))).toEqual(['西村邸', 'BAKERY西村工房']);
  });

  it('住所も検索対象にする', () => {
    expect(names(filterShops(index, { q: '押熊', category: '' }))).toEqual(['にぎり長次郎 押熊店']);
  });

  it('全角・大文字・空白の違いを無視する', () => {
    expect(names(filterShops(index, { q: 'ＲＯＯＭ', category: '' }))).toEqual(['Room hair']);
    expect(names(filterShops(index, { q: 'roomhair', category: '' }))).toEqual(['Room hair']);
  });

  it('部首文字で入力しても見つかる', () => {
    expect(names(filterShops(index, { q: '⻑次郎', category: '' }))).toEqual(['にぎり長次郎 押熊店']);
  });

  it('空白で区切った語はすべて含むものに絞る', () => {
    expect(names(filterShops(index, { q: '西村　橿原', category: '' }))).toEqual(['BAKERY西村工房']);
  });

  it('カテゴリで絞り込む', () => {
    expect(names(filterShops(index, { q: '', category: '橿原市' }))).toEqual(['洋服の青山 橿原曲川店', 'BAKERY西村工房']);
    expect(names(filterShops(index, { q: '西村', category: '奈良市' }))).toEqual(['西村邸']);
  });

  it('条件がなければすべて返す', () => {
    expect(filterShops(index, { q: ' ', category: '' })).toHaveLength(5);
  });
});

describe('categoriesOf', () => {
  it('データに出てきた順で重複なく返す', () => {
    expect(categoriesOf(shops)).toEqual(['奈良市', '橿原市', '大和郡山市']);
  });
});

describe('inBbox と sortForList', () => {
  it('表示範囲の中だけを返す', () => {
    expect(names(inBbox(shops, [135.75, 34.6, 135.85, 34.75]))).toEqual(['西村邸', 'にぎり長次郎 押熊店', 'Room hair']);
  });

  it('現在地があれば近い順、なければデータの順', () => {
    expect(names(sortForList(shops, [135.79, 34.505]))[0]).toBe('BAKERY西村工房');
    expect(names(sortForList(shops, null))).toEqual(names(shops));
  });
});

describe('距離', () => {
  it('おおよその距離を出す', () => {
    // 緯度0.01度はおよそ1.1km
    expect(distanceM([135.8, 34.68], [135.8, 34.69])).toBeGreaterThan(1100);
    expect(distanceM([135.8, 34.68], [135.8, 34.69])).toBeLessThan(1120);
  });

  it.each([[3, '約10m'], [347, '約350m'], [1234, '約1.2km'], [23456, '約23km']])('%dm → %s', (m, s) => {
    expect(formatDistance(m)).toBe(s);
  });
});

describe('URLのハッシュ', () => {
  it('検索語、カテゴリ、地図の位置を往復できる', () => {
    const state = { q: '西村 邸', category: '奈良市', view: { zoom: 14.5, lat: 34.685, lng: 135.805 } };
    const hash = formatHash(state);
    expect(hash).toBe('#q=%E8%A5%BF%E6%9D%91+%E9%82%B8&cat=%E5%A5%88%E8%89%AF%E5%B8%82&map=14.50/34.68500/135.80500');
    expect(parseHash(hash)).toEqual(state);
  });

  it('空や壊れたハッシュは既定値にする', () => {
    expect(parseHash('')).toEqual({ q: '', category: '', view: undefined });
    expect(parseHash('#map=abc')).toEqual({ q: '', category: '', view: undefined });
    expect(formatHash({ q: '', category: '' })).toBe('#');
  });
});
