// 地図のページの <head> に入れるタグ（タイトル、説明、OGP）。
// SNS や検索エンジンは JavaScript を実行しないことが多いので、ビルドのときに静的に書き込む。

export const OGP_IMAGE = 'ogp.png';

export interface MetaOptions {
  title: string;
  description?: string;
  /** このページの公開URL（https://… で終わりは /）。なければ og:url と og:image は出さない */
  pageUrl?: string;
  hasImage: boolean;
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);

export function headTags({ title, description, pageUrl, hasImage }: MetaOptions): string {
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
    `<title>${escape(title)}</title>`,
    ...tags.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escape(value)}" />`),
  ].join('\n    ');
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
