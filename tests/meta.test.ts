import { describe, expect, it } from 'vitest';
import { headTags, injectHead, pageUrlOf } from '../scripts/lib/meta';

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
    expect(tags).toContain('<meta property="og:image" content="https://example.github.io/repo/ogp.png" />');
    expect(tags).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });

  it('公開URLがなければ og:url と og:image を出さない', () => {
    const tags = headTags({ ...base, hasImage: true });
    expect(tags).not.toContain('og:url');
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
