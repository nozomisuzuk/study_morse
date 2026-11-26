import { signal } from '@preact/signals';
import { registerSW } from 'virtual:pwa-register';
import { inSession } from './ui/router';

/**
 * オフライン用 Service Worker の登録と、新しい版への切り替え。
 *
 * 新しい版の確認はブラウザが「ページを読み込んだとき」にしか行わない。Android のアプリは
 * バックグラウンドに残ったまま再開されることが多く、そのままでは更新に気付けないので、
 * 前面に戻ったときと 1 時間ごとにこちらから確認する。
 * 新しい版が有効になったら読み込み直すが、練習の途中なら練習画面を出るまで待つ。
 */

/** 新しい版が有効になり、練習画面を出たら読み込み直す */
export const reloadPending = signal(false);

const UPDATED_KEY = 'study-morse:just-updated';

/** 直前に新しい版へ切り替わった (起動直後に一度だけ true) */
export const justUpdated = signal(consumeUpdatedFlag());

function consumeUpdatedFlag(): boolean {
  try {
    const v = sessionStorage.getItem(UPDATED_KEY);
    sessionStorage.removeItem(UPDATED_KEY);
    return v === '1';
  } catch {
    return false;
  }
}

function reloadNow(): void {
  try {
    sessionStorage.setItem(UPDATED_KEY, '1');
  } catch {
    /* プライベートモードなど */
  }
  window.location.reload();
}

let registration: ServiceWorkerRegistration | undefined;

export function initPwa(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  registerSW({
    immediate: true,
    onNeedReload() {
      if (inSession()) reloadPending.value = true;
      else reloadNow();
    },
    onRegisteredSW(_url, r) {
      if (!r) return;
      registration = r;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void checkForUpdate();
      });
      setInterval(() => void checkForUpdate(), 60 * 60 * 1000);
    },
  });
}

/** 練習画面を出たときに呼ぶ。保留中の切り替えがあれば読み込み直す */
export function applyPendingReload(): void {
  if (reloadPending.value && !inSession()) reloadNow();
}

export type UpdateCheck = 'found' | 'latest' | 'offline' | 'unsupported';

/** サーバーに新しい版があるか確認する。見つかれば自動でダウンロードされ、切り替わる */
export async function checkForUpdate(): Promise<UpdateCheck> {
  if (!registration) return 'unsupported';
  if (!navigator.onLine) return 'offline';
  try {
    await registration.update();
  } catch {
    return 'offline';
  }
  return registration.installing || registration.waiting ? 'found' : 'latest';
}
