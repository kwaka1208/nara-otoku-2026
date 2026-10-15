import { describe, expect, it } from 'vitest';
import { breadcrumbData, fillInfo, headTags, injectHead, jsonLd, llmsTxt, pageUrlOf, robotsTxt, sitemapXml, webApplicationData } from '../scripts/lib/meta';

describe('pageUrlOf', () => {
  it('直下の地図はサイトのURL、それ以外は slug のフォルダ', () => {
    expect(pageUrlOf('https://example.github.io/repo/', 'a', true)).toBe('https://example.github.io/repo/');
    expect(pageUrlOf('https://example.github.io/repo', 'a', false)).toBe('https://example.github.io/repo/a/');
    expect(pageUrlOf(undefined, 'a', true)).toBeUndefined();
  });
});

describe('headTags', () => {
  const base = { title: '【非公式】「A&B」の地図', description: '説明 <注意>' };

  it('公開URLと画像があれば、絶対URLの og:image と大きいカードを出す', () => {
    const tags = headTags({ ...base, pageUrl: 'https://example.github.io/repo/', hasImage: true });
    expect(tags).toContain('<title>【非公式】「A&amp;B」の地図</title>');
    expect(tags).toContain('<meta name="description" content="説明 &lt;注意&gt;" />');
    expect(tags).toContain('<meta property="og:url" content="https://example.github.io/repo/" />');
    expect(tags).toContain('<link rel="canonical" href="https://example.github.io/repo/" />');
    expect(tags).toContain('<meta property="og:image" content="https://example.github.io/repo/ogp.png" />');
    expect(tags).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });

  it('公開URLがなければ og:url と og:image を出さない', () => {
    const tags = headTags({ ...base, hasImage: true });
    expect(tags).not.toContain('og:url');
    expect(tags).not.toContain('canonical');
    expect(tags).not.toContain('og:image');
    expect(tags).toContain('<meta name="twitter:card" content="summary" />');
  });

  it('説明がなければ description を出さない', () => {
    expect(headTags({ title: 't', hasImage: false })).not.toContain('description');
  });
});

describe('injectHead', () => {
  it('<title> をタグに置き換える', () => {
    const html = '<head>\n    <title>地図</title>\n</head>';
    expect(injectHead(html, { title: 'T', hasImage: false })).toContain('<title>T</title>\n    <meta property="og:type"');
  });

  it('置き換え先がなければ止める', () => {
    expect(() => injectHead('<head></head>', { title: 'T', hasImage: false })).toThrow();
  });
});

describe('fillInfo', () => {
  const html = '<h1 id="info-title" class="info-title"></h1>\n<p id="info-notice" class="info-notice"></p>';

  it('見出しと注意書きを書き込む', () => {
    expect(fillInfo(html, { title: 'A&B', notice: '<注意>' })).toBe(
      '<h1 id="info-title" class="info-title">A&amp;B</h1>\n<p id="info-notice" class="info-notice">&lt;注意&gt;</p>');
  });

  it('注意書きがなければ空のまま', () => {
    expect(fillInfo(html, { title: 'T' })).toContain('<p id="info-notice" class="info-notice"></p>');
  });
});

describe('robotsTxt', () => {
  it('末尾の / の有無にかかわらず、サイト直下のサイトマップを指す', () => {
    expect(robotsTxt('https://example.github.io/repo/')).toContain('Sitemap: https://example.github.io/repo/sitemap.xml');
    expect(robotsTxt('https://example.github.io/repo')).toContain('Sitemap: https://example.github.io/repo/sitemap.xml');
  });
});

describe('sitemapXml', () => {
  it('URLと更新日を並べる', () => {
    const xml = sitemapXml([{ url: 'https://example.com/', lastmod: '2026-10-15' }, { url: 'https://example.com/a/?x=1&y=2' }]);
    expect(xml).toContain('<url><loc>https://example.com/</loc><lastmod>2026-10-15</lastmod></url>');
    expect(xml).toContain('<url><loc>https://example.com/a/?x=1&amp;y=2</loc></url>');
  });
});

describe('jsonLd', () => {
  it('@context を付け、</script> で閉じないようにする', () => {
    const tag = jsonLd({ '@type': 'Thing', name: '</script><b>' });
    expect(tag).not.toContain('</script><b>');
    const json = tag.slice('<script type="application/ld+json">'.length, -'</script>'.length);
    expect(JSON.parse(json)).toEqual({ '@context': 'https://schema.org', '@type': 'Thing', name: '</script><b>' });
  });

  it('headTags に構造化データを入れる', () => {
    expect(headTags({ title: 't', hasImage: false, structuredData: { '@type': 'Thing' } })).toContain('<script type="application/ld+json">');
    expect(headTags({ title: 't', hasImage: false })).not.toContain('ld+json');
    const many = headTags({ title: 't', hasImage: false, structuredData: [{ '@type': 'A' }, { '@type': 'B' }] });
    expect(many.match(/application\/ld\+json/g)).toHaveLength(2);
  });
});

describe('webApplicationData', () => {
  it('無料のWebアプリとして、URLと運営者を入れる', () => {
    const data = webApplicationData({
      title: '地図', description: '説明', pageUrl: 'https://example.com/', publisher: { name: 'crossroads inc.', url: 'https://crssrds.jp/' },
    });
    expect(data).toMatchObject({
      '@type': 'WebApplication', name: '地図', description: '説明', url: 'https://example.com/',
      offers: { '@type': 'Offer', price: 0, priceCurrency: 'JPY' },
      publisher: { '@type': 'Organization', name: 'crossroads inc.', url: 'https://crssrds.jp/' },
    });
  });

  it('わからない項目は出さない', () => {
    const data = webApplicationData({ title: '地図' });
    expect(data).not.toHaveProperty('url');
    expect(data).not.toHaveProperty('description');
    expect(data).not.toHaveProperty('publisher');
  });
});

describe('breadcrumbData', () => {
  it('順番を振り、url のないものは item を省く', () => {
    expect(breadcrumbData([{ name: 'A', url: 'https://example.com/' }, { name: 'B' }]).itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'A', item: 'https://example.com/' },
      { '@type': 'ListItem', position: 2, name: 'B' },
    ]);
  });
});

describe('llmsTxt', () => {
  const map = {
    title: '店の地図', description: '店を探せる地図', notice: '非公式です', url: 'https://example.com/',
    sourceLabel: '県の一覧', sourceUrl: 'https://example.com/src', builtAt: '2026-10-15',
    areas: { label: '市町村', url: 'https://example.com/area/', items: [{ name: '奈良市', url: 'https://example.com/area/x/', count: 3245 }] },
  };

  it('地図が1つなら、その名前と説明を見出しと要約にし、各ページへリンクする', () => {
    const txt = llmsTxt([map], '店の地図');
    expect(txt.startsWith('# 店の地図\n\n> 店を探せる地図\n\n注意: 非公式です\n')).toBe(true);
    expect(txt.match(/店を探せる地図/g)).toHaveLength(1);
    expect(txt).toContain('出典: [県の一覧](https://example.com/src)');
    expect(txt).toContain('データ作成日: 2026-10-15');
    expect(txt).toContain('- [地図](https://example.com/): ');
    expect(txt).toContain('- [市町村別の一覧](https://example.com/area/): ');
    expect(txt).toContain('## 市町村別の一覧\n\n- [奈良市](https://example.com/area/x/): 3,245件');
  });

  it('地図が複数なら、地図ごとに見出しを分ける', () => {
    const txt = llmsTxt([map, { title: '別の地図', url: 'https://example.com/b/', builtAt: '2026-10-15' }], '地図の一覧');
    expect(txt.startsWith('# 地図の一覧\n\n## 店の地図\n\n店を探せる地図\n')).toBe(true);
    expect(txt).toContain('### 市町村別の一覧');
    expect(txt).toContain('## 別の地図\n\nデータ作成日: 2026-10-15\n\n### ページ\n\n- [地図](https://example.com/b/): ');
  });
});
