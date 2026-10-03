// 国土地理院の市区町村一覧（地理院地図の muni.js）から、ジオコーディングの判定に使う一覧を作る。
// 使い方: npm run update:municipalities

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const MUNI_URL = 'https://maps.gsi.go.jp/js/muni.js';

const res = await fetch(MUNI_URL);
if (!res.ok) throw new Error(`市区町村一覧を取得できませんでした: ${res.status}`);
// 例: GSI.MUNI_ARRAY["1101"] = '1,北海道,1101,札幌市　中央区';
const names = [...(await res.text()).matchAll(/'\d+,([^,]+),\d+,([^']+)'/g)]
  .map(([, pref, muni]) => pref + muni.replace(/\s/g, ''));
if (names.length < 1700) throw new Error(`市区町村一覧の件数が少なすぎます: ${names.length}`);

const file = path.resolve(import.meta.dirname, 'lib/municipalities.json');
await writeFile(file, JSON.stringify([...new Set(names)].sort(), null, 0).replace(/","/g, '",\n"') + '\n');
console.log(`${names.length}件を ${path.relative(process.cwd(), file)} に書き出しました（出典: ${MUNI_URL}）`);
