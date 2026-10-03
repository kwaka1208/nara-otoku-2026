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
await rm(path.join(distDir, 'index.html'));
for (const slug of slugs) {
  await writeFile(path.join(distDir, slug, 'index.html'), html.replaceAll('"./assets/', '"../assets/'));
}
console.log(`\nビルドしました: ${slugs.map((s) => `dist/${s}/`).join(', ')}`);
