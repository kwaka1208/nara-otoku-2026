import { describe, expect, it, vi } from 'vitest';
import { type Cache, type MapConfig, buildFeatures, parseCsv } from '../scripts/build-data';
import { type GsiHit, classifyGsiResult, createGsiFetcher } from '../scripts/lib/geocode';

const NARA: [[number, number], [number, number]] = [[135.5, 33.8], [136.3, 34.8]];
const gsi = (title: string, lng = 135.8, lat = 34.68): GsiHit[] => [{ title, lng, lat }];

describe('classifyGsiResult', () => {
  const opts = { prefix: '奈良県', bounds: NARA };

  it.each([
    ['奈良県奈良市あやめ池南1-3-11', '奈良県奈良市あやめ池南一丁目３番１１号'],
    ['奈良県奈良市押熊町550-1', '奈良県奈良市押熊町５５０番地'],
    ['奈良県香芝市西真美3-5-1', '奈良県香芝市西真美三丁目５番'],
    ['奈良県北葛城郡上牧町大字上牧2808番15', '奈良県上牧町上牧２８０８番地'],
  ])('番地・号まで一致すれば exact: %s', (query, title) => {
    expect(classifyGsiResult(query, gsi(title), opts).level).toBe('exact');
  });

  it.each([
    ['奈良県奈良市中山町西4-456-1', '奈良県奈良市中山町西四丁目'],
    ['奈良県奈良市押熊町550-1', '奈良県奈良市押熊町'],
    ['奈良県北葛城郡上牧町大字上牧2808番15', '奈良県上牧町大字上牧'],
    ['奈良県奈良市押熊町字西ノ谷2331-1', '奈良県奈良市押熊町'],
    ['奈良県大和郡山市筒井町897-1', '奈良県大和郡山市筒井町'],
  ])('町名や丁目で止まれば approx: %s', (query, title) => {
    expect(classifyGsiResult(query, gsi(title), opts).level).toBe('approx');
  });

  it.each([
    ['奈良県奈良市秋篠町平田93-1', '奈良県奈良市秋篠町'],
    ['奈良県奈良市押熊町東押熊851', '奈良県奈良市押熊町'],
    ['奈良県宇陀市榛原萩原元萩原832-1', '奈良県宇陀市榛原萩原'],
  ])('町名の後ろに「字」の付かない小字が続いても、町名まで一致すれば approx: %s', (query, title) => {
    expect(classifyGsiResult(query, gsi(title), opts).level).toBe('approx');
  });

  it('市区町村までしか一致しなければ未解決', () => {
    expect(classifyGsiResult('奈良県磯城郡田原本町南町414-1', gsi('奈良県磯城郡田原本町'), opts))
      .toMatchObject({ level: 'none', reason: '市区町村までしか一致しない' });
    expect(classifyGsiResult('奈良県吉野郡下市町ほげ1', gsi('奈良県下市町'), opts))
      .toMatchObject({ level: 'none', reason: '市区町村までしか一致しない' });
    expect(classifyGsiResult('奈良県ほげ1', gsi('奈良県'), opts))
      .toMatchObject({ level: 'none', reason: '市区町村までしか一致しない' });
    expect(classifyGsiResult('奈良県奈良市オオミヤチョウ岡田ビル1', gsi('奈良県奈良市'), opts))
      .toMatchObject({ level: 'none', reason: '市区町村までしか一致しない' });
    expect(classifyGsiResult('奈良県北葛城郡上牧町ほげ1', gsi('奈良県上牧町'), opts))
      .toMatchObject({ level: 'none', reason: '市区町村までしか一致しない' });
    expect(classifyGsiResult('奈良県大和郡山市ほげ1', gsi('奈良県大和郡山市'), opts))
      .toMatchObject({ level: 'none', reason: '市区町村までしか一致しない' });
    expect(classifyGsiResult('奈良県桜井市大字ほげ1', gsi('奈良県桜井市'), opts))
      .toMatchObject({ level: 'none', reason: '市区町村までしか一致しない' });
  });

  it('番地がない住所は未解決', () => {
    expect(classifyGsiResult('奈良県奈良市古市', gsi('奈良県奈良市古市町'), opts))
      .toMatchObject({ level: 'none', reason: '番地がない' });
  });

  it('該当なし、他県、範囲外、番地の食い違いは未解決', () => {
    expect(classifyGsiResult('奈良県奈良市橋本町1', [], opts).level).toBe('none');
    expect(classifyGsiResult('奈良県奈良市橋本町1', gsi('京都府京都市橋本町１番地'), opts).level).toBe('none');
    expect(classifyGsiResult('奈良県奈良市橋本町1', gsi('奈良県奈良市橋本町１番地', 139.7, 35.6), opts))
      .toMatchObject({ level: 'none', reason: '範囲外の座標' });
    expect(classifyGsiResult('奈良県奈良市橋本町1', gsi('奈良県奈良市橋本町２番地'), opts))
      .toMatchObject({ level: 'none', reason: '番地が一致しない' });
  });
});

describe('createGsiFetcher', () => {
  it('住所をURLエンコードして問い合わせ、応答を GsiHit の配列にする', async () => {
    const body = [{ geometry: { coordinates: [135.8, 34.68] }, properties: { addressCode: '', title: '奈良県奈良市橋本町１番地' } }];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body)));
    const fetchHits = createGsiFetcher({ intervalMs: 0, fetch: fetchMock });
    expect(await fetchHits('奈良県奈良市橋本町1')).toEqual([{ title: '奈良県奈良市橋本町１番地', lng: 135.8, lat: 34.68 }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent('奈良県奈良市橋本町1'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('通信エラーと5xxは再試行し、回数を超えたら例外にする', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([])));
    const fetchHits = createGsiFetcher({ intervalMs: 0, retryDelaysMs: [0, 0], fetch: fetchMock });
    expect(await fetchHits('奈良県奈良市橋本町1')).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const failing = createGsiFetcher({ intervalMs: 0, retryDelaysMs: [0], fetch: vi.fn(async () => new Response('', { status: 503 })) });
    await expect(failing('奈良県奈良市橋本町1')).rejects.toThrow('503');
  });

  it('4xxは再試行しない', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 400 }));
    const fetchHits = createGsiFetcher({ intervalMs: 0, retryDelaysMs: [0, 0], fetch: fetchMock });
    await expect(fetchHits('奈良県奈良市橋本町1')).rejects.toThrow('400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('buildFeatures', () => {
  const config: MapConfig = {
    title: 'test',
    source: {},
    columns: { name: '店舗名', address: '店舗住所', category: '市町村', lat: '緯度', lng: '経度', url: 'URL' },
    geocode: { prefix: '奈良県', bounds: NARA },
  };
  const csv = (body: string) => parseCsv('店舗名,店舗住所,市町村,緯度,経度,URL\n' + body);

  it('元の列名を設定で対応づけ、表示用の文字列を正規化する', async () => {
    const rows = csv('⻄村邸,奈良市 右京 1ー3ー4 2F,奈良市,34.7,135.8,https://example.com/a');
    const { features } = await buildFeatures(rows, config, { cache: {}, fetchHits: vi.fn() });
    expect(features[0]).toEqual({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [135.8, 34.7] },
      properties: { name: '西村邸', address: '奈良市 右京 1-3-4 2F', category: '奈良市', url: 'https://example.com/a' },
    });
  });

  it('http/https 以外のURLは出さない', async () => {
    const rows = csv('店,奈良市 橋本町 1,奈良市,34.7,135.8,javascript:alert(1)');
    const { features } = await buildFeatures(rows, config, { cache: {}, fetchHits: vi.fn() });
    expect(features[0].properties.url).toBeUndefined();
  });

  it('キャッシュにある住所は問い合わせず、同じ住所は1回だけ問い合わせる', async () => {
    const cache: Cache = { 奈良県奈良市橋本町1: gsi('奈良県奈良市橋本町１番地', 135.83) };
    const fetchHits = vi.fn(async () => gsi('奈良県奈良市右京一丁目', 135.79, 34.7));
    const rows = csv('A,奈良市 橋本町 1,,,,\nB,奈良市 右京 1-3-4,,,,\nC,奈良市 右京 1ー3ー4 3F,,,,');
    const { features, stats, usedQueries } = await buildFeatures(rows, config, { cache, fetchHits });

    expect(fetchHits).toHaveBeenCalledTimes(1);
    expect(fetchHits).toHaveBeenCalledWith('奈良県奈良市右京1-3-4');
    expect(stats).toMatchObject({ total: 3, cached: 2, fetched: 1, approx: 2, unresolved: 0 });
    expect(features.map((f) => f.properties.approx)).toEqual([undefined, true, true]);
    expect(cache['奈良県奈良市右京1-3-4']).toEqual(gsi('奈良県奈良市右京一丁目', 135.79, 34.7));
    expect(usedQueries).toEqual(new Set(['奈良県奈良市橋本町1', '奈良県奈良市右京1-3-4']));
  });

  it('手動指定の住所は、建物名や表記の違いがあっても一致させる', async () => {
    const rows = csv('A,香芝市 真美ケ丘 6-10 エコール・マミ南館2F,,,,\nB,香芝市 真美ケ丘 6丁目10 エコールマミ 南館2階,,,,\nC,香芝市 真美ケ丘6－10,,,,');
    const overrides = [{ name: '', address: '香芝市真美ケ丘6-10', lat: 34.56, lng: 135.7 }];
    const fetchHits = vi.fn(async () => []);
    const { stats } = await buildFeatures(rows, config, { cache: {}, fetchHits, overrides });
    expect(stats.override).toBe(2);
    expect(fetchHits).toHaveBeenCalledTimes(1); // 「6丁目10」は別の表記として扱う
  });

  it('手動指定が最優先で、名称か住所で一致させる', async () => {
    const rows = csv('⻑次郎,奈良市 古市,,,,\nB,奈良市 橋本町 1,,34.1,135.1,');
    const overrides = [
      { name: '長次郎', address: '', lat: 34.65, lng: 135.84 },
      { name: '', address: '奈良市 橋本町 1', lat: 34.68, lng: 135.83, approx: true },
    ];
    const { features, stats } = await buildFeatures(rows, config, { cache: {}, fetchHits: vi.fn(), overrides });
    expect(features.map((f) => f.geometry.coordinates)).toEqual([[135.84, 34.65], [135.83, 34.68]]);
    expect(features.map((f) => f.properties.approx)).toEqual([undefined, true]);
    expect(stats.override).toBe(2);
  });

  it('位置が得られない行は理由つきで未解決にする', async () => {
    const rows = csv(',奈良市 橋本町 1,,,,\nA,,,,,\nB,奈良市 古市,,,,\nC,奈良市 橋本町 1,,35.6,139.7,');
    const fetchHits = vi.fn();
    const { features, unresolved, stats } = await buildFeatures(rows, config, { cache: {}, fetchHits });
    expect(fetchHits).not.toHaveBeenCalled();
    expect(features).toHaveLength(0);
    expect(unresolved.map((r) => r.理由)).toEqual(['名称がない', '住所がない', '番地がない', 'CSVの緯度経度が範囲外']);
    expect(stats.unresolved).toBe(4);
  });

  it('キャッシュした応答は毎回判定し直す', async () => {
    const cache: Cache = { 奈良県奈良市押熊町字西ノ谷2331: gsi('奈良県奈良市押熊町') };
    const rows = csv('A,奈良市 押熊町字西ノ谷2331,,,,');
    const { features } = await buildFeatures(rows, config, { cache, fetchHits: vi.fn() });
    expect(features[0].properties.approx).toBe(true);
  });

  it('--retry-unresolved で未解決になる住所を一度だけ問い合わせ直す', async () => {
    const cache: Cache = { 奈良県奈良市橋本町1: [], 奈良県奈良市橋本町2: gsi('奈良県奈良市橋本町２番地') };
    const fetchHits = vi.fn(async () => gsi('奈良県奈良市橋本町１番地'));
    const rows = csv('A,奈良市 橋本町 1,,,,\nA2,奈良市 橋本町 1,,,,\nB,奈良市 橋本町 2,,,,');
    const { stats } = await buildFeatures(rows, config, { cache, fetchHits, retryUnresolved: true });
    expect(fetchHits).toHaveBeenCalledTimes(1);
    expect(stats).toMatchObject({ fetched: 1, cached: 2, unresolved: 0 });
  });
});
