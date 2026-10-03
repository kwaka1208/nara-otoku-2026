// すべての地図のデータを処理し、ビューアをビルドして公開用一式を dist/ に作る。
// 使い方: npm run build
//
// 地図は dist/<slug>/ に置く。site.config.json の rootMap に指定した地図だけは、サイトの直下（dist/）に置く。
// 直下に地図を置かない場合、直下には地図の一覧を出す。

import { existsSync } from 'node:fs';
import { copyFile, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
import { ROOT_DIR, type ViewerConfig, buildMap } from './build-data.ts';
import { OGP_IMAGE, injectHead, pageUrlOf } from './lib/meta.ts';

interface SiteConfig {
  /** サイトの直下に置く地図の slug */
  rootMap?: string;
  /** サイトの公開URL（例: https://user.github.io/repo/）。OGP の絶対URLに使う */
  siteUrl?: string;
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
  const image = path.join(ROOT_DIR, 'maps', slug, OGP_IMAGE);
  const hasImage = existsSync(image);
  if (hasImage) await copyFile(image, path.join(outDir, OGP_IMAGE));
  const page = injectHead(isRoot ? html : html.replaceAll('"./assets/', '"../assets/'), {
    title: config.title,
    description: config.notice,
    pageUrl: pageUrlOf(site.siteUrl, slug, isRoot),
    hasImage,
  });
  await writeFile(path.join(outDir, 'index.html'), page);
}
if (!site.rootMap) await writeFile(path.join(distDir, 'index.html'), await mapList(slugs));

console.log(`\nビルドしました: ${slugs.map((s) => (s === site.rootMap ? `dist/（${s}）` : `dist/${s}/`)).join(', ')}`);

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
