// 地図のページの <head> に入れるタグ（タイトル、説明、OGP、canonical）。
// SNS や検索エンジンは JavaScript を実行しないことが多いので、ビルドのときに静的に書き込む。

export const OGP_IMAGE = 'ogp.png';

export interface MetaOptions {
  title: string;
  description?: string;
  /** このページの公開URL（https://… で終わりは /）。なければ og:url と og:image は出さない */
  pageUrl?: string;
  /** OGP画像。url は絶対URL。ほかのページの画像を使ってもよい */
  image?: { url: string; alt: string };
  /** 構造化データ（JSON-LD）。複数あれば1つずつ <script> にする。schema.org の @context は自動で付ける */
  structuredData?: Record<string, unknown> | Record<string, unknown>[];
}

/** 運営者。site.config.json の publisher */
export interface Publisher {
  name: string;
  url?: string;
}

export const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);

export function headTags({ title, description, pageUrl, image, structuredData }: MetaOptions): string {
  const tags: [string, string, string][] = [];
  const meta = (attr: 'name' | 'property', key: string, value: string) => tags.push([attr, key, value]);
  if (description) meta('name', 'description', description);
  meta('property', 'og:type', 'website');
  meta('property', 'og:locale', 'ja_JP');
  meta('property', 'og:title', title);
  if (description) meta('property', 'og:description', description);
  if (pageUrl) meta('property', 'og:url', pageUrl);
  // og:image は絶対URLでないと読まないSNSがあるので、公開URLがわかるときだけ出す
  const withImage = !!image && !!pageUrl;
  if (withImage) {
    meta('property', 'og:image', image.url);
    meta('property', 'og:image:width', '1200');
    meta('property', 'og:image:height', '630');
    meta('property', 'og:image:alt', image.alt);
  }
  meta('name', 'twitter:card', withImage ? 'summary_large_image' : 'summary');
  return [
    `<title>${escapeHtml(title)}</title>`,
    ...tags.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`),
    ...(pageUrl ? [`<link rel="canonical" href="${escapeHtml(pageUrl)}" />`] : []),
    ...[structuredData ?? []].flat().map(jsonLd),
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

/**
 * 一覧ページの構造化データ。何の一覧で、いくつ載っていて、いつのデータかを伝える。
 * 店ごとの情報は数千件になってページが重くなるので入れない。items を渡すと、載っているページへのリンクとして入れる
 */
export function collectionPageData({ title, description, pageUrl, about, count, items, dateModified, sourceUrl }: {
  title: string; description?: string; pageUrl: string;
  /** 何についての一覧か（カテゴリ名） */
  about?: string;
  count: number;
  /** url は絶対URL */
  items?: { name: string; url: string }[];
  /** YYYY-MM-DD */
  dateModified: string;
  sourceUrl?: string;
}): Record<string, unknown> {
  return {
    '@type': 'CollectionPage',
    name: title,
    ...(description && { description }),
    url: pageUrl,
    inLanguage: 'ja',
    ...(about && { about: { '@type': 'Place', name: about } }),
    dateModified,
    ...(sourceUrl && { isBasedOn: sourceUrl }),
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: count,
      ...(items && {
        itemListElement: items.map(({ name, url }, i) => ({ '@type': 'ListItem', position: i + 1, name, url })),
      }),
    },
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

/** llms.txt に載せる地図1つ分。URLはすべて絶対URL */
export interface LlmsMap {
  title: string;
  description?: string;
  notice?: string;
  url: string;
  sourceLabel?: string;
  sourceUrl?: string;
  builtAt: string;
  /** カテゴリ別の一覧ページ */
  areas?: { label: string; url: string; items: { name: string; url: string; count: number }[] };
}

/**
 * llms.txt（https://llmstxt.org/）。AIがサイトの中身と各ページの場所をつかむための案内。
 * 地図が1つ（または直下に置く地図がある）ならその地図の名前を見出しにする
 */
export function llmsTxt(maps: LlmsMap[], siteTitle: string): string {
  const single = maps.length === 1;
  const h = single ? '##' : '###';
  const link = (label: string, url: string, note: string) => `- [${label}](${url}): ${note}`;
  const sections = maps.map((m) => [
    // 地図が1つなら説明はサイトの要約（> …）に出すので、ここでは繰り返さない
    ...(single ? [] : [`## ${m.title}`, '', ...(m.description ? [m.description, ''] : [])]),
    ...(m.notice ? [`注意: ${m.notice}`, ''] : []),
    ...(m.sourceLabel || m.sourceUrl
      ? [`出典: ${m.sourceUrl ? `[${m.sourceLabel ?? m.sourceUrl}](${m.sourceUrl})` : m.sourceLabel}`, ''] : []),
    `データ作成日: ${m.builtAt}`,
    '',
    `${h} ページ`,
    '',
    link('地図', m.url, '店名・住所で検索でき、現在地から近い順に並べられる（JavaScriptで表示）'),
    ...(m.areas ? [
      link(`${m.areas.label}別の一覧`, m.areas.url, '店名と住所を静的なHTMLでまとめたページ'),
      '',
      `${h} ${m.areas.label}別の一覧`,
      '',
      ...m.areas.items.map((a) => link(a.name, a.url, `${a.count.toLocaleString('ja-JP')}件`)),
    ] : []),
  ].join('\n'));
  const summary = single ? maps[0].description : undefined;
  return [`# ${siteTitle}`, '', ...(summary ? [`> ${summary}`, ''] : []), sections.join('\n\n')].join('\n') + '\n';
}
