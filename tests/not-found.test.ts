import { describe, expect, it } from 'vitest';
import { basePathOf, notFoundPage } from '../scripts/lib/not-found';

describe('basePathOf', () => {
  it('公開URLのパスを / で終わる形にする', () => {
    expect(basePathOf('https://example.com/')).toBe('/');
    expect(basePathOf('https://user.github.io/repo')).toBe('/repo/');
    expect(basePathOf('https://user.github.io/repo/')).toBe('/repo/');
    expect(basePathOf(undefined)).toBe('/');
  });
});

describe('notFoundPage', () => {
  const html = notFoundPage([{ href: '/', label: 'A&B の地図' }, { href: '/area/', label: '市町村別の一覧' }]);

  it('検索結果に出さない', () => {
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).not.toContain('canonical');
  });

  it('見出しと案内先のリンクを出す。文字はエスケープする', () => {
    expect(html).toContain('<h1>ページが見つかりません</h1>');
    expect(html).toContain('<li><a href="/">A&amp;B の地図</a></li>');
    expect(html).toContain('<li><a href="/area/">市町村別の一覧</a></li>');
  });
});
