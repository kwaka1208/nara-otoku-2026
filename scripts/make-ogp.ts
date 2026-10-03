// SNSで共有されたときに表示する画像（OGP画像、1200×630）を maps/<slug>/ogp.png に作る。
// 使い方: npm run ogp -- <slug>
//
// HTML で組んだ画像を Chrome のヘッドレスモードで PNG にする。Chrome の場所は CHROME_PATH で変えられる。
// 背景は図案化した地図で、本物の地図タイルは使わない（画像の中に著作権表示が要らないように）。

import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { MapConfig } from './build-data.ts';
import { ROOT_DIR } from './build-data.ts';

const WIDTH = 1200;
const HEIGHT = 630;
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);

/** 毎回同じ模様になるよう、種から決まる乱数を使う */
function random(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
}

/** 図案化した地図（道路、川、緑地、ピン、クラスタ） */
function mapPattern(): string {
  const rnd = random(20261003);
  const roads = Array.from({ length: 9 }, (_, i) => {
    const y = 40 + i * 70 + rnd() * 30;
    return `<path d="M-20 ${y} C 300 ${y + rnd() * 120 - 60}, 700 ${y + rnd() * 120 - 60}, 1220 ${y + rnd() * 80 - 40}" />`;
  }).concat(Array.from({ length: 8 }, (_, i) => {
    const x = 80 + i * 150 + rnd() * 40;
    return `<path d="M${x} -20 C ${x + rnd() * 100 - 50} 200, ${x + rnd() * 100 - 50} 420, ${x + rnd() * 60 - 30} 650" />`;
  })).join('');
  const parks = Array.from({ length: 7 }, () =>
    `<ellipse cx="${rnd() * WIDTH}" cy="${rnd() * HEIGHT}" rx="${40 + rnd() * 70}" ry="${25 + rnd() * 40}" />`).join('');
  // ピンは右側に多めに散らす（左側には文字の板が載る）
  const pins = Array.from({ length: 70 }, () => {
    const x = 560 + rnd() * 620;
    const y = 30 + rnd() * 570;
    return `<circle cx="${x}" cy="${y}" r="7" />`;
  }).join('');
  const clusters = [[720, 150, 128], [930, 300, 342], [820, 470, 57], [1080, 130, 24], [1060, 520, 89]]
    .map(([x, y, n]) => `<g><circle cx="${x}" cy="${y}" r="${n > 100 ? 34 : 28}" /><text x="${x}" y="${y + 8}">${n}</text></g>`).join('');
  return `<svg class="map" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#f4efe6" />
  <g class="parks">${parks}</g>
  <path class="river" d="M-20 520 C 250 430, 420 600, 700 500 S 1000 380, 1220 430" />
  <g class="roads-wide">${roads}</g>
  <g class="roads">${roads}</g>
  <g class="pins">${pins}</g>
  <g class="clusters">${clusters}</g>
</svg>`;
}

function ogpHtml(title: string, lines: string[]): string {
  // 「【非公式】」は札にして、残りを見出しにする
  const unofficial = title.startsWith('【非公式】');
  const heading = unofficial ? title.slice('【非公式】'.length) : title;
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<style>
  html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body { position: relative; font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif; color: #212529; }
  .map { position: absolute; inset: 0; }
  .parks ellipse { fill: #d8ead0; }
  .river { fill: none; stroke: #b9d7ee; stroke-width: 26; stroke-linecap: round; }
  .roads-wide path { fill: none; stroke: #e6d8bf; stroke-width: 9; }
  .roads path { fill: none; stroke: #fff; stroke-width: 5; }
  .pins circle { fill: #c2255c; stroke: #fff; stroke-width: 3; }
  .clusters circle { fill: #c2255c; fill-opacity: 0.9; stroke: #fff; stroke-width: 4; }
  .clusters text { fill: #fff; font: 700 22px sans-serif; text-anchor: middle; }
  .card {
    position: absolute; left: 56px; top: 56px; bottom: 56px; width: 600px;
    box-sizing: border-box; padding: 48px 48px 40px;
    display: flex; flex-direction: column;
    background: rgb(255 255 255 / 0.96); border-radius: 24px;
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.18);
  }
  .badge {
    align-self: flex-start; margin-bottom: 20px; padding: 4px 16px;
    border: 3px solid #c2255c; border-radius: 999px;
    color: #c2255c; font-size: 26px; font-weight: 800; letter-spacing: 0.1em;
  }
  h1 { margin: 0; font-size: 46px; line-height: 1.34; font-weight: 800; word-break: auto-phrase; }
  /* 先頭のかぎ括弧をぶら下げて、字下げしたように見えないようにする */
  h1.bracket { text-indent: -0.5em; }
  ul { margin: auto 0 0; padding: 24px 0 0; list-style: none; }
  li { position: relative; padding-left: 36px; font-size: 30px; line-height: 1.6; font-weight: 600; color: #495057; }
  li::before {
    content: ''; position: absolute; left: 4px; top: 15px; width: 18px; height: 18px;
    border-radius: 50%; background: #c2255c; box-shadow: 0 0 0 4px #f8d7e3;
  }
</style>
</head>
<body>
${mapPattern()}
<div class="card">
  ${unofficial ? '<div class="badge">非公式</div>' : ''}
  <h1${/^[「『（(]/.test(heading) ? ' class="bracket"' : ''}>${escape(heading)}</h1>
  <ul>${lines.map((l) => `<li>${escape(l)}</li>`).join('')}</ul>
</div>
</body>
</html>`;
}

const slug = process.argv[2];
if (!slug) throw new Error('使い方: npm run ogp -- <slug>');
const mapDir = path.join(ROOT_DIR, 'maps', slug);
const config: MapConfig = JSON.parse(await readFile(path.join(mapDir, 'map.config.json'), 'utf8'));

const work = await mkdtemp(path.join(tmpdir(), 'ogp-'));
try {
  const htmlFile = path.join(work, 'ogp.html');
  const outFile = path.join(mapDir, 'ogp.png');
  await writeFile(htmlFile, ogpHtml(config.title, config.ogp?.lines ?? []));
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${WIDTH},${HEIGHT}`, `--screenshot=${outFile}`, `file://${htmlFile}`,
  ], { stdio: 'ignore' });
  console.log(`${path.relative(ROOT_DIR, outFile)} を作りました`);
} finally {
  await rm(work, { recursive: true, force: true });
}
