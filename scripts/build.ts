// すべての地図のデータを処理し、ビューアをビルドして公開用一式を dist/ に作る。
// 使い方: npm run build
//
// 地図は dist/<slug>/ に置く。site.config.json の rootMap に指定した地図だけは、サイトの直下（dist/）に置く。
// 直下に地図を置かない場合、直下には地図の一覧を出す。

import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
import { type Feature, type MapConfig, ROOT_DIR, type ViewerConfig, buildMap } from './build-data.ts';
import { AREA_DIR, areaUrlOf, categoryPage, groupByCategory, indexPage, showAreaLinks } from './lib/area.ts';
import {
  type LlmsMap, type MetaOptions, OGP_IMAGE, type Publisher, fillInfo, injectHead, llmsTxt, pageUrlOf, robotsTxt, sitemapXml, webApplicationData,
} from './lib/meta.ts';
import { basePathOf, notFoundPage } from './lib/not-found.ts';

interface SiteConfig {
  /** サイトの直下に置く地図の slug */
  rootMap?: string;
  /** サイトの公開URL（例: https://user.github.io/repo/）。OGP の絶対URLに使う */
  siteUrl?: string;
  /** 運営者。構造化データ（JSON-LD）に載せる */
  publisher?: Publisher;
}

const distDir = path.join(ROOT_DIR, 'dist');
const siteFile = path.join(ROOT_DIR, 'site.config.json');
const site: SiteConfig = existsSync(siteFile) ? JSON.parse(await readFile(siteFile, 'utf8')) : {};
const slugs = (await readdir(path.join(ROOT_DIR, 'maps'), { withFileTypes: true }))
  .filter((d) => d.isDirectory() && existsSync(path.join(ROOT_DIR, 'maps', d.name, 'map.config.json')))
  .map((d) => d.name);
if (site.rootMap && !slugs.includes(site.rootMap)) {
  throw new Error(`site.config.json の rootMap「${site.rootMap}」が maps/ にありません`);
}

for (const slug of slugs) await buildMap(slug);

// ビューアは全地図で共通。dist/assets/ に1回だけ出力し、各地図の index.html から参照する
await rm(path.join(distDir, 'assets'), { recursive: true, force: true });
await build({ logLevel: 'warn' });
const html = await readFile(path.join(distDir, 'index.html'), 'utf8');

if (!site.siteUrl) console.warn('site.config.json に siteUrl がないので、OGP画像（og:image）を出しません');

const pages: { url: string; lastmod?: string }[] = [];
const llmsMaps: LlmsMap[] = [];
const basePath = basePathOf(site.siteUrl);
// 404ページから案内する先。直下に地図を置かないときは、先頭に地図の一覧を入れる
const notFoundLinks = site.rootMap ? [] : [{ href: basePath, label: '地図の一覧' }];
for (const slug of slugs) {
  const isRoot = slug === site.rootMap;
  const outDir = isRoot ? distDir : path.join(distDir, slug);
  if (isRoot) {
    // 直下にはデータを移す。未解決の一覧（unresolved.csv）は dist/<slug>/ に残る（公開はしない）
    for (const file of ['data.geojson', 'config.json']) {
      await rename(path.join(distDir, slug, file), path.join(distDir, file));
    }
  }
  const config: ViewerConfig = JSON.parse(await readFile(path.join(outDir, 'config.json'), 'utf8'));
  const imageFile = path.join(ROOT_DIR, 'maps', slug, OGP_IMAGE);
  const hasImage = existsSync(imageFile);
  if (hasImage) await copyFile(imageFile, path.join(outDir, OGP_IMAGE));
  const { areaPage }: MapConfig = JSON.parse(await readFile(path.join(ROOT_DIR, 'maps', slug, 'map.config.json'), 'utf8'));
  const pageUrl = pageUrlOf(site.siteUrl, slug, isRoot);
  // 一覧ページも地図と同じ画像を使う
  const image = hasImage && pageUrl ? { url: new URL(OGP_IMAGE, pageUrl).href, alt: config.title } : undefined;
  let base = fillInfo(isRoot ? html : html.replaceAll('"./assets/', '"../assets/'), config);
  if (areaPage) base = showAreaLinks(base, config.categoryLabel);
  const description = config.description ?? config.notice;
  const page = injectHead(base, {
    title: config.title,
    description,
    pageUrl,
    image,
    structuredData: webApplicationData({ title: config.title, description, pageUrl, publisher: site.publisher }),
  });
  await writeFile(path.join(outDir, 'index.html'), page);
  if (pageUrl) pages.push({ url: pageUrl, lastmod: config.builtAt });
  const areas = areaPage ? await writeAreaPages(outDir, config, areaPage, pageUrl, image) : undefined;
  const mapPath = isRoot ? basePath : `${basePath}${slug}/`;
  notFoundLinks.push({ href: mapPath, label: config.title });
  if (areaPage) notFoundLinks.push({ href: `${mapPath}${AREA_DIR}/`, label: `${config.categoryLabel}別の一覧` });
  if (pageUrl) {
    llmsMaps.push({
      title: config.title, description, notice: config.notice, url: pageUrl,
      sourceLabel: config.sourceLabel, sourceUrl: config.sourceUrl, builtAt: config.builtAt, areas,
    });
  }
}
if (!site.rootMap) await writeFile(path.join(distDir, 'index.html'), await mapList(slugs));
await writeFile(path.join(distDir, '404.html'), notFoundPage(notFoundLinks));

// 検索エンジン向け。公開URLがないとサイトマップに絶対URLを書けないので出さない
if (site.siteUrl) {
  if (!site.rootMap) pages.unshift({ url: pageUrlOf(site.siteUrl, '', true)! });
  await writeFile(path.join(distDir, 'robots.txt'), robotsTxt(site.siteUrl));
  await writeFile(path.join(distDir, 'sitemap.xml'), sitemapXml(pages));
  const rootTitle = llmsMaps.find((m) => m.url === pageUrlOf(site.siteUrl, '', true))?.title;
  await writeFile(path.join(distDir, 'llms.txt'), llmsTxt(llmsMaps, rootTitle ?? (llmsMaps.length === 1 ? llmsMaps[0].title : '地図の一覧')));
}

console.log(`\nビルドしました: ${slugs.map((s) => (s === site.rootMap ? `dist/（${s}）` : `dist/${s}/`)).join(', ')}`);

/** カテゴリごとの店舗一覧ページを <地図のフォルダ>/area/ に作り、サイトマップに加える。公開URLがわかれば llms.txt 用の一覧を返す */
async function writeAreaPages(
  outDir: string, config: ViewerConfig, areaPage: NonNullable<MapConfig['areaPage']>, mapPageUrl?: string,
  image?: MetaOptions['image'],
): Promise<LlmsMap['areas']> {
  const { features }: { features: Feature[] } = JSON.parse(await readFile(path.join(outDir, 'data.geojson'), 'utf8'));
  const groups = groupByCategory(features);
  const areaDir = path.join(outDir, AREA_DIR);
  await rm(areaDir, { recursive: true, force: true });
  const ctx = {
    config: areaPage, mapTitle: config.title, notice: config.notice, sourceLabel: config.sourceLabel,
    sourceUrl: config.sourceUrl, categoryLabel: config.categoryLabel, builtAt: config.builtAt, image,
  };
  const indexUrl = areaUrlOf(mapPageUrl);
  await mkdir(areaDir, { recursive: true });
  await writeFile(path.join(areaDir, 'index.html'), indexPage(groups, { ...ctx, pageUrl: indexUrl }));
  if (indexUrl) pages.push({ url: indexUrl, lastmod: config.builtAt });
  for (const group of groups) {
    const url = areaUrlOf(mapPageUrl, group.dir);
    await mkdir(path.join(areaDir, group.dir), { recursive: true });
    await writeFile(path.join(areaDir, group.dir, 'index.html'), categoryPage(group, { ...ctx, pageUrl: url }, groups));
    if (url) pages.push({ url, lastmod: config.builtAt });
  }
  console.log(`  ${config.categoryLabel}別の一覧  ${groups.length}ページ → ${path.relative(ROOT_DIR, areaDir)}/`);
  if (!indexUrl) return undefined;
  return {
    label: config.categoryLabel,
    url: indexUrl,
    items: groups.map((g) => ({ name: g.category, url: areaUrlOf(mapPageUrl, g.dir)!, count: g.features.length })),
  };
}

/** サイトの直下に置く地図の一覧 */
async function mapList(slugs: string[]): Promise<string> {
  const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);
  const maps = await Promise.all(slugs.map(async (slug) => {
    const { title } = JSON.parse(await readFile(path.join(distDir, slug, 'config.json'), 'utf8')) as { title: string };
    return { slug, title };
  }));
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>地図の一覧</title>
<style>body{margin:0 auto;padding:24px 16px;max-width:640px;font-family:system-ui,sans-serif;line-height:1.6}a{color:#c2255c}</style>
</head>
<body>
<h1>地図の一覧</h1>
<ul>
${maps.map((m) => `<li><a href="./${m.slug}/">${escape(m.title)}</a></li>`).join('\n')}
</ul>
</body>
</html>
`;
}
