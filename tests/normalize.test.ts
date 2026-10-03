import { describe, expect, it } from 'vitest';
import { geoQuery, normalizeText, searchKey } from '../scripts/lib/normalize';

describe('normalizeText', () => {
  it.each([
    ['1-3-4', '1-3-4'],
    ['1－3－4', '1-3-4'],
    ['1ー3ー4', '1-3-4'],
    ['1ｰ3ｰ4', '1-3-4'],
    ['1­7', '1-7'],
    ['1 ― 7', '1-7'],
  ])('数字の間のハイフンを統一する: %s', (input, expected) => {
    expect(normalizeText(input)).toBe(expected);
  });

  it('数字にはさまれていない長音は変えない', () => {
    expect(normalizeText('ニュータウン1ー2')).toBe('ニュータウン1-2');
    expect(normalizeText('コーヒー')).toBe('コーヒー');
  });

  it('全角英数を半角にする', () => {
    expect(normalizeText('ＭＰビル')).toBe('MPビル');
    expect(normalizeText('Ｒｏｏｍ ｈａｉｒ')).toBe('Room hair');
  });

  it('康熙部首をNFKCで通常の漢字にする', () => {
    expect(normalizeText('⿅の⾈')).toBe('鹿の舟');
    expect(normalizeText('⼤吉')).toBe('大吉');
    expect(normalizeText('⼩料理')).toBe('小料理');
  });

  it('NFKCで直らないCJK部首補助を置き換える', () => {
    expect(normalizeText('⻄村邸')).toBe('西村邸');
    expect(normalizeText('⻑次郎')).toBe('長次郎');
    expect(normalizeText('洋服の⻘⼭')).toBe('洋服の青山');
  });

  it('NFKCで旧字体になる部首を日本の字体にする', () => {
    expect(normalizeText('江⼾川ならまち店')).toBe('江戸川ならまち店');
    expect(normalizeText('⿊⽑和⽜')).toBe('黒毛和牛');
  });

  it('空白をまとめて前後を落とす', () => {
    expect(normalizeText('  奈良市　 あやめ池南  ')).toBe('奈良市 あやめ池南');
    expect(normalizeText(undefined)).toBe('');
  });
});

describe('searchKey', () => {
  it('部首文字の混じった名称が通常の漢字で見つかる', () => {
    expect(searchKey('⻄村邸')).toContain(searchKey('西村'));
    expect(searchKey('⻑次郎')).toContain(searchKey('長次郎'));
    expect(searchKey('洋服の⻘⼭')).toContain(searchKey('青山'));
  });

  it('大文字小文字と全角半角、空白の違いを無視する', () => {
    expect(searchKey('Ｒｏｏｍ ｈａｉｒ')).toBe('roomhair');
    expect(searchKey('奈良市 あやめ池南')).toBe(searchKey('奈良市あやめ池南'));
  });
});

describe('geoQuery', () => {
  it.each([
    ['奈良市 あやめ池南 2丁目2-21 3F', '奈良県奈良市あやめ池南2丁目2-21'],
    ['奈良市 右京 1ー3ー4 サンタウンプラザすずらん館2F', '奈良県奈良市右京1-3-4'],
    ['奈良市 大宮町4丁目275－5 森村第2ビル1Ｆ', '奈良県奈良市大宮町4丁目275-5'],
    ['奈良市 学園北 1-9-1 パラディ学園前南館B1F', '奈良県奈良市学園北1-9-1'],
    ['奈良市 法蓮佐保山 3丁目2番26号', '奈良県奈良市法蓮佐保山3丁目2番26'],
    ['奈良市 二条町 1丁目3番地の4', '奈良県奈良市二条町1丁目3番地の4'],
    ['奈良市 紀寺町 911', '奈良県奈良市紀寺町911'],
  ])('%s', (input, expected) => {
    expect(geoQuery(input, '奈良県')).toBe(expected);
  });

  it('都道府県がすでにあれば補わない', () => {
    expect(geoQuery('奈良県奈良市紀寺町911', '奈良県')).toBe('奈良県奈良市紀寺町911');
  });

  it('prefixを省略できる', () => {
    expect(geoQuery('奈良市 紀寺町 911')).toBe('奈良市紀寺町911');
  });
});
