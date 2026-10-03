// すべての地図のデータを処理し、ビューアをビルドして dist/<slug>/index.html を作る。
// 使い方: npm run build

import { existsSync } from 'node:fs';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
import { ROOT_DIR, buildMap } from './build-data.ts';

const distDir = path.join(ROOT_DIR, 'dist');
const slugs = (await readdir(path.join(ROOT_DIR, 'maps'), { withFileTypes: true }))
  .filter((d) => d.isDirectory() && existsSync(path.join(ROOT_DIR, 'maps', d.name, 'map.config.json')))
  .map((d) => d.name);

for (const slug of slugs) await buildMap(slug);

// ビューアは全地図で共通。dist/assets/ に1回だけ出力し、各地図の index.html から参照する
await rm(path.join(distDir, 'assets'), { recursive: true, force: true });
await build({ logLevel: 'warn' });
const html = await readFile(path.join(distDir, 'index.html'), 'utf8');
for (const slug of slugs) {
  await writeFile(path.join(distDir, slug, 'index.html'), html.replaceAll('"./assets/', '"../assets/'));
}
await writeFile(path.join(distDir, 'index.html'), await rootIndex(slugs));
console.log(`\nビルドしました: ${slugs.map((s) => `dist/${s}/`).join(', ')}`);

/** サイトの直下に置くページ。地図が1つならそこへ移動し、複数なら一覧を出す */
async function rootIndex(slugs: string[]): Promise<string> {
  const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);
  const maps = await Promise.all(slugs.map(async (slug) => {
    const { title } = JSON.parse(await readFile(path.join(distDir, slug, 'config.json'), 'utf8')) as { title: string };
    return { slug, title };
  }));
  const only = maps.length === 1 ? `./${maps[0].slug}/` : null;
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${only ? `<meta http-equiv="refresh" content="0; url=${only}">` : ''}
<title>${escape(only ? maps[0].title : '地図の一覧')}</title>
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
