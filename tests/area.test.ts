import { describe, expect, it } from 'vitest';
import type { Feature } from '../scripts/build-data';
import { areaUrlOf, categoryPage, dirOf, fillTemplate, googleMapsUrl, groupByCategory, indexPage, showAreaLinks } from '../scripts/lib/area';

const shop = (name: string, category?: string, address?: string): Feature => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [135.8, 34.6] },
  properties: { name, category, address },
});

const ctx = {
  config: { title: '{category}の店（{count}店）', description: '{category}に{count}店', indexTitle: '市町村別の店（{count}店）' },
  mapTitle: '地図', notice: '非公式です', sourceLabel: '県の一覧', sourceUrl: 'https://example.com/src',
  categoryLabel: '市町村', builtAt: '2026-10-15',
};

describe('groupByCategory', () => {
  it('出てきた順にまとめ、カテゴリのない店は除く', () => {
    const groups = groupByCategory([shop('a', '奈良市'), shop('b', '橿原市'), shop('c', '奈良市'), shop('d'), shop('e', ' ')]);
    expect(groups.map((g) => [g.category, g.features.map((f) => f.properties.name)])).toEqual([
      ['奈良市', ['a', 'c']],
      ['橿原市', ['b']],
    ]);
  });
});

describe('dirOf', () => {
  it('パスに使えない文字を置き換える', () => {
    expect(dirOf('奈良市')).toBe('奈良市');
    expect(dirOf('A/B\\C?#%')).toBe('A-B-C---');
    expect(dirOf('..')).toBe('--');
  });
});

describe('areaUrlOf', () => {
  it('地図のページからの相対で、日本語はURLエンコードする', () => {
    expect(areaUrlOf('https://example.com/')).toBe('https://example.com/area/');
    expect(areaUrlOf('https://example.com/map/', '奈良市')).toBe('https://example.com/map/area/%E5%A5%88%E8%89%AF%E5%B8%82/');
    expect(areaUrlOf(undefined, '奈良市')).toBeUndefined();
  });
});

describe('fillTemplate', () => {
  it('カテゴリと桁区切りの件数を入れる', () => {
    expect(fillTemplate('{category}の{count}店', { category: '奈良市', count: 3245 })).toBe('奈良市の3,245店');
  });
});

describe('categoryPage', () => {
  const group = { category: '奈良市', dir: '奈良市', features: [shop('A&B <店>', '奈良市', '奈良市 登大路町30'), shop('C', '奈良市')] };
  const html = categoryPage(group, { ...ctx, pageUrl: 'https://example.com/area/%E5%A5%88%E8%89%AF%E5%B8%82/' });

  it('見出し・説明・canonical を入れる', () => {
    expect(html).toContain('<title>奈良市の店（2店）</title>');
    expect(html).toContain('<h1>奈良市の店（2店）</h1>');
    expect(html).toContain('<meta name="description" content="奈良市に2店" />');
    expect(html).toContain('<link rel="canonical" href="https://example.com/area/%E5%A5%88%E8%89%AF%E5%B8%82/" />');
  });

  it('店名はエスケープし、Googleマップへリンクする', () => {
    expect(html).toContain('>A&amp;B &lt;店&gt;</a>');
    expect(html).toContain('<span class="address">奈良市 登大路町30</span>');
    expect(html).toContain('href="https://www.google.com/maps/search/?api=1&amp;query=A%26B%20%3C店%3E%20奈良市%20登大路町30"');
  });

  it('絞り込んだ地図・一覧・出典へリンクする', () => {
    expect(html).toContain(`href="../../#cat=${encodeURIComponent('奈良市')}"`);
    expect(html).toContain('<a href="../">市町村別の一覧</a>');
    expect(html).toContain('<a href="https://example.com/src" target="_blank" rel="noopener noreferrer">県の一覧</a>');
    expect(html).toContain('<dd>2026-10-15</dd>');
  });
});

describe('indexPage', () => {
  it('各カテゴリのページと件数を並べる', () => {
    const groups = groupByCategory([shop('a', '奈良市'), shop('b', '奈良市'), shop('c', '橿原市')]);
    const html = indexPage(groups, ctx);
    expect(html).toContain('<h1>市町村別の店（3店）</h1>');
    expect(html).toContain(`<a href="./${encodeURIComponent('奈良市')}/">奈良市</a><span class="count">2件</span>`);
    expect(html).toContain(`<a href="./${encodeURIComponent('橿原市')}/">橿原市</a><span class="count">1件</span>`);
    expect(html).not.toContain('canonical');
  });
});

describe('showAreaLinks', () => {
  it('隠してあるリンクを見せ、文言を入れる', () => {
    const html = '<a href="./area/" data-area-link hidden>一覧</a>\n<div data-area-link hidden><dt>一覧</dt><dd><a href="./area/" data-area-link>一覧</a></dd></div>';
    expect(showAreaLinks(html, '市町村')).toBe(
      '<a href="./area/" data-area-link>市町村別の一覧</a>\n<div data-area-link><dt>一覧</dt><dd><a href="./area/" data-area-link>市町村別の一覧</a></dd></div>');
  });
});

describe('googleMapsUrl', () => {
  it('記号は %XX にし、日本語はそのまま書く。開くと吹き出しと同じURLになる', () => {
    const p = { name: 'カフェ&バー ①', address: '奈良市 登大路町30-1' };
    const url = googleMapsUrl(p);
    expect(url).toBe('https://www.google.com/maps/search/?api=1&query=カフェ%26バー%20①%20奈良市%20登大路町30-1');
    expect(new URL(url).searchParams.get('query')).toBe('カフェ&バー ① 奈良市 登大路町30-1');
    expect(new URL(url).href).toBe('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('カフェ&バー ① 奈良市 登大路町30-1'));
  });
});
