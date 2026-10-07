// 情報画面（タイトル、注意書き、出典、データの時点、地図の著作権表示）。「次回以降表示しない」を選ぶまでは開くたびに出す。

import type { ViewerConfig } from './types.ts';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function setupInfo(config: ViewerConfig) {
  const dialog = byId<HTMLDialogElement>('info');
  byId('info-title').textContent = config.title;
  byId('info-notice').textContent = config.notice ?? '';
  byId('info-notice').hidden = !config.notice;
  const source = byId('info-source');
  const label = config.sourceLabel ?? config.sourceUrl ?? '';
  if (config.sourceUrl) {
    const a = document.createElement('a');
    a.href = config.sourceUrl; // データ処理の段階で http/https だけに絞ってある
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = label;
    source.replaceChildren(a);
  } else {
    source.textContent = label;
  }
  byId('info-source-row').hidden = !label;
  byId('info-built').textContent = config.builtAt;

  // 「次回以降表示しない」を選んだときだけ自動表示を止める。データが更新されたらまた出す。
  // 保存できない環境（プライベートモードなど）では毎回出る
  const key = `csv-map:seen:${location.pathname}`;
  const hide = byId<HTMLInputElement>('info-hide');
  let seen = false;
  try { seen = localStorage.getItem(key) === config.builtAt; } catch { /* 保存できなくても表示はできる */ }

  const open = () => {
    hide.checked = seen;
    dialog.showModal();
  };
  byId('info-button').addEventListener('click', open);
  if (!seen) open();

  dialog.addEventListener('close', () => {
    seen = hide.checked;
    try {
      if (seen) localStorage.setItem(key, config.builtAt);
      else localStorage.removeItem(key);
    } catch { /* 同上 */ }
  });
}
