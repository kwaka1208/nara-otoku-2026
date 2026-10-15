// 存在しないURLを開いたときのページ（404.html）。GitHub Pages はサイトの直下にあるものを使う。
// どの階層のURLでも同じ内容が出るので、リンクは相対パスでなく / から始まるパスで書く。

import { STYLE } from './area.ts';
import { escapeHtml } from './meta.ts';

/** サイトの公開URLから、サイトの直下のパスを作る（例: https://user.github.io/repo/ → /repo/）。なければ / */
export function basePathOf(siteUrl: string | undefined): string {
  if (!siteUrl) return '/';
  const { pathname } = new URL(siteUrl);
  return pathname.endsWith('/') ? pathname : pathname + '/';
}

/** links の href は / から始まるパス */
export function notFoundPage(links: { href: string; label: string }[]): string {
  const items = links.map(({ href, label }) => `      <li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`);
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>ページが見つかりません</title>
    <style>${STYLE}</style>
  </head>
  <body>
    <h1>ページが見つかりません</h1>
    <p>お探しのページは、移動したか削除された可能性があります。</p>
    <ul class="areas">
${items.join('\n')}
    </ul>
  </body>
</html>
`;
}
