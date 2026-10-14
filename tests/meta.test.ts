import { describe, expect, it } from 'vitest';
import { fillInfo, headTags, injectHead, pageUrlOf, robotsTxt, sitemapXml } from '../scripts/lib/meta';

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
