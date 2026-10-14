// カテゴリ（市町村など）ごとの店舗一覧ページ。地図は JavaScript で描くので検索エンジンに中身が伝わらない。
// 店名と住所を静的なHTMLにして、「◯◯市 キャンペーン名 店」のような検索で見つかるようにする。
//
// 置き場所は地図のページからの相対で area/（一覧）と area/<カテゴリ>/（各カテゴリ）。

import type { Feature } from '../build-data.ts';
import { escapeHtml, headTags } from './meta.ts';

export const AREA_DIR = 'area';

/** map.config.json の areaPage。{category} と {count} を置き換える */
export interface AreaPageConfig {
  /** 各カテゴリのページの見出し（例: {category}で使える◯◯の加盟店一覧（{count}店）） */
  title: string;
  description?: string;
  /** 一覧ページの見出し */
  indexTitle: string;
  indexDescription?: string;
}

export interface AreaGroup {
  category: string;
  /** フォルダ名。パスに使えない文字を置き換えたもの */
  dir: string;
  features: Feature[];
}

interface PageContext {
  config: AreaPageConfig;
  /** 地図のタイトル */
  mapTitle: string;
  notice?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  categoryLabel: string;
  builtAt: string;
  /** このページの公開URL。わからなければ canonical などを出さない */
  pageUrl?: string;
}

/** カテゴリごとに分ける。順番はデータに出てきた順。カテゴリのない店は入れない */
export function groupByCategory(features: Feature[]): AreaGroup[] {
  const groups = new Map<string, Feature[]>();
  for (const f of features) {
    const category = f.properties.category?.trim();
    if (!category) continue;
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category)!.push(f);
  }
  return [...groups].map(([category, features]) => ({ category, dir: dirOf(category), features }));
}

/** パスの区切りになる文字と、「.」だけの名前を避ける */
export function dirOf(category: string): string {
  const dir = category.replace(/[/\\?#%]/g, '-');
  return /^\.+$/.test(dir) ? dir.replace(/\./g, '-') : dir;
}

/** 地図のページの公開URLから、一覧ページ（dir なし）か各カテゴリのページの公開URLを作る */
export function areaUrlOf(mapPageUrl: string | undefined, dir?: string): string | undefined {
  if (!mapPageUrl) return undefined;
  return new URL(`${AREA_DIR}/${dir ? encodeURIComponent(dir) + '/' : ''}`, mapPageUrl).href;
}

export function fillTemplate(template: string, { category = '', count }: { category?: string; count: number }): string {
  return template.replaceAll('{category}', category).replaceAll('{count}', count.toLocaleString('ja-JP'));
}

/**
 * 吹き出しと同じGoogleマップの検索URL。数千件並ぶページもあるので、日本語（ASCII以外）は %XX にせずそのまま書く。
 * ブラウザが開くときに変換するので、動きは変わらない
 */
export const googleMapsUrl = ({ name, address }: Feature['properties']) =>
  'https://www.google.com/maps/search/?api=1&query=' +
  encodeURIComponent(`${name} ${address ?? ''}`.trim()).replace(/(?:%[C-F][0-9A-F](?:%[89AB][0-9A-F])+)+/g, decodeURIComponent);

/** 地図のページで、一覧ページへのリンク（data-area-link）を見えるようにし、文言を入れる */
export function showAreaLinks(html: string, categoryLabel: string): string {
  return html
    .replace(/(<a [^>]*data-area-link[^>]*>)[^<]*(<\/a>)/g, (_, open, close) => open + escapeHtml(`${categoryLabel}別の一覧`) + close)
    .replace(/(data-area-link[^>]*?) hidden/g, '$1');
}

/** 各カテゴリのページ（area/<dir>/index.html） */
export function categoryPage(group: AreaGroup, ctx: PageContext): string {
  const vars = { category: group.category, count: group.features.length };
  const title = fillTemplate(ctx.config.title, vars);
  const description = ctx.config.description && fillTemplate(ctx.config.description, vars);
  const mapHref = '../../#' + new URLSearchParams({ cat: group.category }).toString();
  const items = group.features.map(({ properties: p }) => `      <li>
        <a class="name" href="${escapeHtml(googleMapsUrl(p))}" target="_blank" rel="noopener noreferrer">${escapeHtml(p.name)}</a>
        ${p.address ? `<span class="address">${escapeHtml(p.address)}</span>` : ''}
      </li>`);
  return page({
    title, description, pageUrl: ctx.pageUrl,
    breadcrumb: [['../../', ctx.mapTitle], ['../', `${ctx.categoryLabel}別の一覧`], [null, group.category]],
    body: `    <h1>${escapeHtml(title)}</h1>
    ${description ? `<p>${escapeHtml(description)}</p>` : ''}
    <p><a class="button" href="${escapeHtml(mapHref)}">${escapeHtml(group.category)}の地図を見る</a></p>
    <p class="muted">店名を押すと、Googleマップで場所を調べられます。</p>
    <ul class="shops">
${items.join('\n')}
    </ul>
${footer(ctx)}`,
  });
}

/** 一覧ページ（area/index.html） */
export function indexPage(groups: AreaGroup[], ctx: PageContext): string {
  const count = groups.reduce((n, g) => n + g.features.length, 0);
  const title = fillTemplate(ctx.config.indexTitle, { count });
  const description = ctx.config.indexDescription && fillTemplate(ctx.config.indexDescription, { count });
  const items = groups.map((g) =>
    `      <li><a href="./${escapeHtml(encodeURIComponent(g.dir))}/">${escapeHtml(g.category)}</a><span class="count">${g.features.length.toLocaleString('ja-JP')}件</span></li>`);
  return page({
    title, description, pageUrl: ctx.pageUrl,
    breadcrumb: [['../', ctx.mapTitle], [null, title]],
    body: `    <h1>${escapeHtml(title)}</h1>
    ${description ? `<p>${escapeHtml(description)}</p>` : ''}
    <p><a class="button" href="../">地図を見る</a></p>
    <h2>${escapeHtml(ctx.categoryLabel)}から選ぶ</h2>
    <ul class="areas">
${items.join('\n')}
    </ul>
${footer(ctx)}`,
  });
}

function footer(ctx: PageContext): string {
  const source = ctx.sourceUrl
    ? `<a href="${escapeHtml(ctx.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(ctx.sourceLabel ?? ctx.sourceUrl)}</a>`
    : ctx.sourceLabel && escapeHtml(ctx.sourceLabel);
  return `    <footer>
      ${ctx.notice ? `<p>${escapeHtml(ctx.notice)}</p>` : ''}
      <dl>
        ${source ? `<div><dt>出典</dt><dd>${source}</dd></div>` : ''}
        <div><dt>データ作成日</dt><dd>${escapeHtml(ctx.builtAt)}</dd></div>
      </dl>
      <p><a href="https://crssrds.jp/" target="_blank" rel="noopener noreferrer">© crossroads inc.</a></p>
    </footer>`;
}

function page({ title, description, pageUrl, breadcrumb, body }: {
  title: string; description?: string; pageUrl?: string;
  /** [リンク先（現在のページは null）, 表示名] */
  breadcrumb: [string | null, string][];
  body: string;
}): string {
  const crumbs = breadcrumb.map(([href, label]) =>
    href ? `<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>` : `<li aria-current="page">${escapeHtml(label)}</li>`);
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${headTags({ title, description, pageUrl, hasImage: false })}
    <style>${STYLE}</style>
  </head>
  <body>
    <nav aria-label="パンくずリスト"><ol class="breadcrumb">${crumbs.join('')}</ol></nav>
${body}
  </body>
</html>
`;
}

// 地図のページ（src/styles.css）と同じ色を使う
const STYLE = `
:root{--accent:#c2255c;--text:#212529;--muted:#6c757d;--border:#dee2e6}
body{margin:0 auto;padding:16px 16px 32px;max-width:720px;color:var(--text);background:#fff;font-family:system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;line-height:1.6}
h1{font-size:1.4rem;line-height:1.4}
h2{font-size:1.1rem;margin-top:2em}
a{color:var(--accent)}
.muted,footer{color:var(--muted);font-size:.875rem}
.breadcrumb{display:flex;flex-wrap:wrap;gap:4px;margin:0;padding:0;list-style:none;font-size:.8125rem;color:var(--muted)}
.breadcrumb li+li::before{content:"›";margin-right:4px}
.button{display:inline-block;padding:10px 20px;border-radius:8px;background:var(--accent);color:#fff;font-weight:bold;text-decoration:none}
.shops,.areas{margin:0;padding:0;list-style:none;border-top:1px solid var(--border)}
.shops li{display:flex;flex-direction:column;padding:8px 0;border-bottom:1px solid var(--border)}
.shops .address{color:var(--muted);font-size:.875rem}
.areas li{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)}
.areas .count{color:var(--muted)}
footer{margin-top:32px;padding-top:16px;border-top:1px solid var(--border)}
footer dl div{display:flex;gap:12px}
footer dt{flex:none;width:7em}
footer dd{margin:0}
footer a{color:inherit}
`.trim();
