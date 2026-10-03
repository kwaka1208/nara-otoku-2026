// 情報画面（タイトル、注意書き、出典、データの時点、地図の著作権表示）。初めて開いたときにも出す。

import type { ViewerConfig } from './types.ts';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function setupInfo(config: ViewerConfig) {
  const dialog = byId<HTMLDialogElement>('info');
  byId('info-title').textContent = config.title;
  byId('info-notice').textContent = config.notice ?? '';
  byId('info-notice').hidden = !config.notice;
  byId('info-source').textContent = config.sourceLabel ?? '';
  byId('info-source-row').hidden = !config.sourceLabel;
  byId('info-built').textContent = config.builtAt;

  const open = () => dialog.showModal();
  byId('info-button').addEventListener('click', open);

  // 初回だけ自動で出す。保存できない環境（プライベートモードなど）では毎回出る
  const key = `csv-map:seen:${location.pathname}`;
  let seen = false;
  try { seen = localStorage.getItem(key) === config.builtAt; } catch { /* 保存できなくても表示はできる */ }
  if (!seen) open();
  dialog.addEventListener('close', () => {
    try { localStorage.setItem(key, config.builtAt); } catch { /* 同上 */ }
  });
}
