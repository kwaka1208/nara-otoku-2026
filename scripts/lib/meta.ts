// 地図のページの <head> に入れるタグ（タイトル、説明、OGP、canonical）。
// SNS や検索エンジンは JavaScript を実行しないことが多いので、ビルドのときに静的に書き込む。

export const OGP_IMAGE = 'ogp.png';

export interface MetaOptions {
  title: string;
  description?: string;
  /** このページの公開URL（https://… で終わりは /）。なければ og:url と og:image は出さない */
  pageUrl?: string;
  hasImage: boolean;
  /** 構造化データ（JSON-LD）。schema.org の @context は自動で付ける */
  structuredData?: Record<string, unknown>;
}

/** 運営者。site.config.json の publisher */
export interface Publisher {
  name: string;
  url?: string;
}

export const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);

export function headTags({ title, description, pageUrl, hasImage, structuredData }: MetaOptions): string {
  const tags: [string, string, string][] = [];
  const meta = (attr: 'name' | 'property', key: string, value: string) => tags.push([attr, key, value]);
  if (description) meta('name', 'description', description);
  meta('property', 'og:type', 'website');
  meta('property', 'og:locale', 'ja_JP');
  meta('property', 'og:title', title);
  if (description) meta('property', 'og:description', description);
  if (pageUrl) meta('property', 'og:url', pageUrl);
  // og:image は絶対URLでないと読まないSNSがあるので、公開URLがわかるときだけ出す
  const withImage = hasImage && !!pageUrl;
  if (withImage) {
    meta('property', 'og:image', new URL(OGP_IMAGE, pageUrl).href);
    meta('property', 'og:image:width', '1200');
    meta('property', 'og:image:height', '630');
    meta('property', 'og:image:alt', title);
  }
  meta('name', 'twitter:card', withImage ? 'summary_large_image' : 'summary');
  return [
    `<title>${escapeHtml(title)}</title>`,
    ...tags.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`),
    ...(pageUrl ? [`<link rel="canonical" href="${escapeHtml(pageUrl)}" />`] : []),
    ...(structuredData ? [jsonLd(structuredData)] : []),
  ].join('\n    ');
}

/** JSON-LD の <script>。中身に </script> があっても閉じないよう、< を \u003c にする */
export function jsonLd(data: Record<string, unknown>): string {
  const json = JSON.stringify({ '@context': 'https://schema.org', ...data }).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

/** 地図のページの構造化データ。無料で使えるWebアプリとして伝える */
export function webApplicationData({ title, description, pageUrl, publisher }: {
  title: string; description?: string; pageUrl?: string; publisher?: Publisher;
}): Record<string, unknown> {
  return {
    '@type': 'WebApplication',
    name: title,
    ...(description && { description }),
    ...(pageUrl && { url: pageUrl }),
    applicationCategory: 'TravelApplication',
    operatingSystem: 'Web',
    inLanguage: 'ja',
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'JPY' },
    ...(publisher && { publisher: { '@type': 'Organization', name: publisher.name, ...(publisher.url && { url: publisher.url }) } }),
  };
}

/** パンくずの構造化データ。url は絶対URL。現在のページは url を省略してよい */
export function breadcrumbData(items: { name: string; url?: string }[]): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map(({ name, url }, i) => ({
      '@type': 'ListItem', position: i + 1, name, ...(url && { item: url }),
    })),
  };
}

/** ビルドした index.html の <title> を、タイトルと説明・OGPのタグに置き換える */
export function injectHead(html: string, options: MetaOptions): string {
  if (!/<title>[^<]*<\/title>/.test(html)) throw new Error('index.html に <title> がありません');
  return html.replace(/<title>[^<]*<\/title>/, () => headTags(options));
}

/** サイトの公開URLと地図の置き場所から、ページの公開URLを作る */
export function pageUrlOf(siteUrl: string | undefined, slug: string, isRoot: boolean): string | undefined {
  if (!siteUrl) return undefined;
  const base = siteUrl.endsWith('/') ? siteUrl : siteUrl + '/';
  return isRoot ? base : new URL(`${slug}/`, base).href;
}

/**
 * 情報画面の見出しと注意書きを、HTMLの段階で埋めておく（JavaScriptを実行しない検索エンジン向け）。
 * 表示のときはビューアが同じ内容で上書きする
 */
export function fillInfo(html: string, { title, notice }: { title: string; notice?: string }): string {
  return html
    .replace(/(<h1 id="info-title"[^>]*>)(<\/h1>)/, (_, open, close) => open + escapeHtml(title) + close)
    .replace(/(<p id="info-notice"[^>]*>)(<\/p>)/, (_, open, close) => open + escapeHtml(notice ?? '') + close);
}

/** robots.txt。すべてのクローラーに公開し、サイトマップの場所を伝える */
export function robotsTxt(siteUrl: string): string {
  const sitemap = new URL('sitemap.xml', siteUrl.endsWith('/') ? siteUrl : siteUrl + '/').href;
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`;
}

/** sitemap.xml。lastmod にはデータを作った日（YYYY-MM-DD）を入れる */
export function sitemapXml(pages: { url: string; lastmod?: string }[]): string {
  const urls = pages.map(({ url, lastmod }) =>
    `  <url><loc>${escapeHtml(url)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}
